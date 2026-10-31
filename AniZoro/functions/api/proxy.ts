// Cloudflare Pages Function: fallback proxy for the direct player (AniZoro Direct).
// Same behaviour as api/proxy.ts (the Vercel version), written for the Fetch API / Workers runtime.
//
//   /api/proxy?url=<encoded https url>&ref=<optional referer>
//
// HLS playlists are rewritten so every segment / key / sub-playlist also comes back through this endpoint.
const UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';
const MAX_REDIRECTS = 3;
const MAX_BYTES = 25_000_000;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'range',
  'Access-Control-Expose-Headers': 'content-length, content-range, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (!v.includes(':')) return false;
  if (v === '::1' || v === '::') return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)/.test(v)) return true;
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return false;
}

// Workers cannot resolve DNS themselves (and Cloudflare does not let a Worker reach private networks anyway),
// so this refuses non-https, local names and literal private IPs.
function assertPublicHttps(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'https:') throw new Error('https only');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('blocked host');
  if (isPrivateIp(host)) throw new Error('blocked host');
  return u;
}

function absolutize(ref: string, base: URL): string | null {
  try {
    return new URL(ref, base).toString();
  } catch {
    return null;
  }
}

function toProxy(abs: string, referer: string | null): string {
  const p = new URLSearchParams({ url: abs });
  if (referer) p.set('ref', referer);
  return `/api/proxy?${p.toString()}`;
}

function rewritePlaylist(text: string, base: URL, referer: string | null): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          const abs = absolutize(uri, base);
          return abs ? `URI="${toProxy(abs, referer)}"` : _m;
        });
      }
      const abs = absolutize(t, base);
      return abs ? toProxy(abs, referer) : line;
    })
    .join('\n');
}

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET' && request.method !== 'HEAD') return json(405, { error: 'method not allowed' });

  try {
    const reqUrl = new URL(request.url);

    // Only pages of this site may use the proxy (a missing Referer is refused too)
    let sameSite = false;
    try {
      sameSite = new URL(request.headers.get('referer') || '').host === reqUrl.host;
    } catch {
      sameSite = false;
    }
    if (!sameSite) return json(403, { error: 'forbidden' });

    let target = assertPublicHttps(reqUrl.searchParams.get('url') || '');
    let referer: string | null = null;
    const rawRef = reqUrl.searchParams.get('ref') || '';
    if (rawRef) {
      try {
        const r = new URL(rawRef);
        if (r.protocol === 'https:' || r.protocol === 'http:') referer = r.toString();
      } catch {
        referer = null;
      }
    }

    const headers: Record<string, string> = { 'user-agent': UA, accept: '*/*' };
    const refUrl = referer ? new URL(referer) : null;
    headers.referer = referer || target.origin + '/';
    headers.origin = refUrl ? refUrl.origin : target.origin;
    const range = request.headers.get('range');
    if (range) headers.range = range;

    let upstream: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      upstream = await fetch(target.toString(), { headers, redirect: 'manual', signal: AbortSignal.timeout(9000) });
      const loc = upstream.headers.get('location');
      if (upstream.status >= 300 && upstream.status < 400 && loc) {
        target = assertPublicHttps(new URL(loc, target).toString());
        continue;
      }
      break;
    }
    if (!upstream || (upstream.status >= 300 && upstream.status < 400)) return json(502, { error: 'too many redirects' });

    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    const isPlaylist = /mpegurl/i.test(type) || /\.m3u8(\?|$)/i.test(target.pathname + target.search);

    if (isPlaylist && upstream.ok) {
      const text = await upstream.text();
      if (text.trimStart().startsWith('#EXTM3U')) {
        return new Response(rewritePlaylist(text, target, referer), {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'public, max-age=20' },
        });
      }
      // not a real playlist (an error page): pass it on as is
      return new Response(text, { status: upstream.status, headers: { ...CORS, 'Content-Type': type } });
    }

    const declared = Number(upstream.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) return json(413, { error: 'too large for proxy' });

    const out: Record<string, string> = { ...CORS, 'Content-Type': type };
    const cr = upstream.headers.get('content-range');
    if (cr) out['Content-Range'] = cr;
    const cl = upstream.headers.get('content-length');
    if (cl) out['Content-Length'] = cl;
    out['Cache-Control'] = upstream.ok ? 'public, max-age=300' : 'no-store';
    // stream the body straight through (no buffering in memory)
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: out });
  } catch (err: any) {
    return json(502, { error: err?.message === 'https only' || err?.message === 'blocked host' ? err.message : 'upstream failed' });
  }
};
