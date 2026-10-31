// Cloudflare Pages Function: shared edge cache for the public anime data APIs (AniList, Jikan, Kitsu, ID maps).
//
//   GET  /api/data?u=<encoded https url>      Jikan / Kitsu / ID-map lookups
//   POST /api/data?u=https://graphql.anilist.co   AniList GraphQL (body = the query)
//
// Why: every visitor used to hit those APIs straight from their own browser, so a handful of people was enough to
// trip Jikan / AniList rate limits (HTTP 429) and make rows fail to load. Here the first visitor's request is stored
// at the Cloudflare edge and everyone else gets it from there. If the upstream API is down or rate-limited, the last
// good copy is served instead (up to 24 h old), so the site keeps working.
//
// Only the hosts listed below are allowed, so this cannot be used as an open proxy. Every response carries an
// `x-edge-cache` header (HIT / MISS / STALE / BYPASS / ERROR); the client uses its presence to know the function exists.

interface Rule {
  /** how long a stored copy counts as fresh (seconds) */
  ttl: number;
  /** POST allowed (AniList GraphQL only) */
  post?: boolean;
}

const RULES: Record<string, Rule> = {
  'graphql.anilist.co': { ttl: 300, post: true },
  'api.jikan.moe': { ttl: 600 },
  'kitsu.io': { ttl: 3600 },
  'arm.haglund.dev': { ttl: 86400 },
  'api.ani.zip': { ttl: 86400 },
};

const KEEP_SECONDS = 86400; // how long a copy is kept around as the "stale" fallback
const MAX_BODY = 20_000;
const UA = 'Mozilla/5.0 (compatible; AniZoro/1.0; +https://anizoro-anime.pages.dev)';

const baseHeaders = (cache: string, extra: Record<string, string> = {}): Record<string, string> => ({
  'x-edge-cache': cache,
  'Content-Type': 'application/json',
  ...extra,
});

const json = (status: number, body: unknown, cache = 'BYPASS') =>
  new Response(JSON.stringify(body), { status, headers: baseHeaders(cache, { 'Cache-Control': 'no-store' }) });

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromStored(stored: Response, tag: string): Response {
  const headers = new Headers(stored.headers);
  headers.set('x-edge-cache', tag);
  headers.set('Cache-Control', 'public, max-age=30');
  headers.delete('x-fetched-at');
  return new Response(stored.body, { status: 200, headers });
}

type Upstream = { ok: true; text: string } | { ok: false; status?: number; text?: string; retryAfter?: string | null };
const inflight = new Map<string, Promise<Upstream>>();

async function loadUpstream(
  cache: Cache,
  cacheKey: Request,
  target: URL,
  method: string,
  body: string | undefined,
  accept: string | null,
  waitUntil?: (p: Promise<unknown>) => void
): Promise<Upstream> {
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method,
      headers: {
        'user-agent': UA,
        accept: accept && /json/.test(accept) ? accept : 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body,
      signal: AbortSignal.timeout(9000),
    });
  } catch {
    return { ok: false };
  }

  const text = await upstream.text().catch(() => '');
  if (!upstream.ok) return { ok: false, status: upstream.status, text, retryAfter: upstream.headers.get('retry-after') };

  let good = text.length > 0;
  if (good && target.hostname === 'graphql.anilist.co') {
    // GraphQL can answer HTTP 200 with an `errors` array and no data: never store that
    try {
      const parsed = JSON.parse(text);
      good = !parsed?.errors || !!parsed?.data;
    } catch {
      good = false;
    }
  }
  if (!good) return { ok: false, status: 502, text };

  const put = cache.put(
    cacheKey,
    new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${KEEP_SECONDS}`,
        'x-fetched-at': String(Date.now()),
      },
    })
  );
  if (waitUntil) waitUntil(put);
  else await put;
  return { ok: true, text };
}

export const onRequest = async (context: {
  request: Request;
  waitUntil?: (p: Promise<unknown>) => void;
}): Promise<Response> => {
  const { request } = context;
  // waitUntil must be called on the context object: a detached copy throws "Illegal invocation" on Cloudflare,
  // which used to turn every cache miss into a 502 and skip the cache entirely.
  const waitUntil = context.waitUntil ? (p: Promise<unknown>) => context.waitUntil!(p) : undefined;
  if (request.method !== 'GET' && request.method !== 'POST') return json(405, { error: 'method not allowed' });

  try {
    const reqUrl = new URL(request.url);

    // only pages of this site may use it
    // (browsers state this themselves; Referer / Origin cover older ones and privacy tools that strip one of them)
    let sameSite = request.headers.get('sec-fetch-site') === 'same-origin';
    if (!sameSite) {
      try {
        sameSite = new URL(request.headers.get('origin') || request.headers.get('referer') || '').host === reqUrl.host;
      } catch {
        sameSite = false;
      }
    }
    if (!sameSite) return json(403, { error: 'forbidden', reason: 'not same-site' });

    const target = new URL(reqUrl.searchParams.get('u') || '');
    const rule = RULES[target.hostname];
    if (target.protocol !== 'https:' || !rule) return json(400, { error: 'host not allowed' });

    let body: string | undefined;
    if (request.method === 'POST') {
      if (!rule.post) return json(405, { error: 'method not allowed' });
      body = await request.text();
      if (!body || body.length > MAX_BODY) return json(400, { error: 'bad body' });
    }

    const cache = (caches as unknown as { default: Cache }).default;
    const keyHash = await sha256(`${request.method}\n${target.toString()}\n${body || ''}`);
    const cacheKey = new Request(`https://edge-cache.anizoro.invalid/${keyHash}`);

    const stored = await cache.match(cacheKey);
    let ageSec = Infinity;
    if (stored) {
      ageSec = (Date.now() - Number(stored.headers.get('x-fetched-at') || 0)) / 1000;
      if (ageSec >= 0 && ageSec < rule.ttl) return fromStored(stored, 'HIT');
    }

    // Asks the real API and stores a good answer. Identical requests that arrive together share one upstream call.
    const refresh = (): Promise<Upstream> => {
      const running = inflight.get(keyHash);
      if (running) return running;
      const job = loadUpstream(cache, cacheKey, target, request.method, body, request.headers.get('accept'), waitUntil).finally(() =>
        inflight.delete(keyHash)
      );
      inflight.set(keyHash, job);
      return job;
    };

    // Slightly old copy (up to 2x the fresh time): answer at once from the edge and refresh in the background.
    if (stored && waitUntil && ageSec >= rule.ttl && ageSec < rule.ttl * 2) {
      waitUntil(refresh().catch(() => undefined));
      return fromStored(stored, 'STALE');
    }

    const result = await refresh();
    if (result.ok) {
      return new Response(result.text, {
        status: 200,
        headers: baseHeaders('MISS', { 'Cache-Control': 'public, max-age=30' }),
      });
    }

    // upstream failed (429, 5xx, timeout): an older copy is better than an error
    if (stored) return fromStored(stored, 'STALE');

    if (result.status) {
      // pass the real status through (e.g. Jikan 404 for an unknown id, or 429 with Retry-After)
      const out = baseHeaders('BYPASS', { 'Cache-Control': 'no-store', 'x-edge-upstream-status': String(result.status) });
      if (result.retryAfter) out['Retry-After'] = result.retryAfter;
      return new Response(result.text || '', { status: result.status, headers: out });
    }
    return json(502, { error: 'upstream unreachable' }, 'ERROR');
  } catch {
    return json(502, { error: 'edge cache failed' }, 'ERROR');
  }
};
