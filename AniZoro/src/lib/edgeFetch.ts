// fetch() for the public anime data APIs (AniList, Jikan, Kitsu, ID maps), routed through the shared edge cache
// (functions/api/data.ts) when it exists. Falls back to a normal direct request when it does not (local `vite dev`,
// the Vercel build, or the function being unreachable), so nothing depends on it being there.
const CACHED_HOSTS = new Set(['api.jikan.moe', 'graphql.anilist.co', 'kitsu.io', 'arm.haglund.dev', 'api.ani.zip']);

// set once we learn the function is not deployed on this host, so later calls skip the extra hop
let edgeMissing = false;
// hosts the edge could not serve recently (rate limited, blocked or failing): ask them directly until this time
const edgeSkipUntil = new Map<string, number>();

export async function edgeFetch(url: string, init?: RequestInit): Promise<Response> {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* not an absolute URL: leave it alone */
  }
  if (edgeMissing || typeof window === 'undefined' || !CACHED_HOSTS.has(host)) return fetch(url, init);
  if ((edgeSkipUntil.get(host) || 0) > Date.now()) return fetch(url, init);

  let res: Response;
  try {
    res = await fetch(`/api/data?u=${encodeURIComponent(url)}`, init);
  } catch (err: any) {
    if (init?.signal?.aborted || err?.name === 'AbortError' || err?.name === 'TimeoutError') throw err;
    return fetch(url, init); // network hiccup on our own endpoint: try the API directly
  }

  const edge = res.headers.get('x-edge-cache');
  if (!edge) {
    // no such function here (404 / SPA fallback / Vercel): stop using it for this session
    edgeMissing = true;
    return fetch(url, init);
  }
  if (edge === 'ERROR') return fetch(url, init); // the function could not reach the API: let the browser try
  // The shared edge address can be rate limited or hit an outage even when this visitor's own address is fine:
  // for those failures (not for a real 404) ask the API directly, which also uses the visitor's own quota.
  if (edge === 'BYPASS' && (res.status === 403 || res.status === 408 || res.status === 429 || res.status >= 500)) {
    // when this keeps happening, stop sending that host through the edge for a few minutes (saves a wasted hop each time)
    edgeSkipUntil.set(host, Date.now() + 5 * 60 * 1000);
    try {
      const direct = await fetch(url, init);
      if (direct.ok || direct.status < 500) return direct;
    } catch (err: any) {
      if (init?.signal?.aborted || err?.name === 'AbortError' || err?.name === 'TimeoutError') throw err;
    }
  }
  return res;
}
