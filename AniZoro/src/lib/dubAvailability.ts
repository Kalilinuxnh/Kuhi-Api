// Finds out whether an episode has an English dub on a server, so the page can offer the right options
// (Audio switch, server grouping) instead of letting the viewer find out by hitting an error.
//
// Result per server:  'yes' (dub exists)  |  'no' (confirmed missing)  |  'unknown' (could not tell: never blocks anything)
// Only a confirmed 'no' disables Dub. Results are cached for the session, so each episode is checked once.
import { autoTiers, resolveFirstAvailable, type ApiSource } from './anivexa';

export type DubStatus = 'yes' | 'no' | 'unknown';

const cache = new Map<string, DubStatus>();

export const dubCacheKey = (server: string, id: number | string, episode: number) => `${server}|${id}|${episode}`;
export const getCachedDub = (key: string): DubStatus | undefined => cache.get(key);
export function rememberDub(key: string, status: DubStatus) {
  if (status !== 'unknown') cache.set(key, status);
}

/**
 * Vidstream 1: asks the same providers the player would ask, for the dub of this episode.
 * Run it in the background once the sub is playing. A network failure is "unknown", never "no".
 */
export async function probeDirectDub(anilistId: number, episode: number, signal: AbortSignal, source: ApiSource = 'anivexa'): Promise<DubStatus> {
  const tried = new Set<string>();
  let sawNetworkError = false;
  for (const tier of autoTiers(source)) {
    const out = await resolveFirstAvailable(tier, tried, anilistId, 'dub', episode, signal, tier.length, source);
    if (signal.aborted) return 'unknown';
    if (out.stream) return 'yes';
    for (const reason of Object.values(out.failures)) {
      if (reason === 'unreachable' || reason === 'timed out') sawNetworkError = true;
    }
  }
  return sawNetworkError ? 'unknown' : 'no';
}

/** Vidstream 2 (MegaPlay): the dub page of the episode is checked with the existing /api/probe endpoint. */
export async function probeEmbedDub(dubUrl: string, signal: AbortSignal): Promise<DubStatus> {
  try {
    const res = await fetch(`/api/probe?url=${encodeURIComponent(dubUrl)}&origin=${encodeURIComponent(window.location.origin)}`, { signal });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) return 'unknown';
    const info = await res.json();
    if (typeof info?.status !== 'number' || info.status === 0) return 'unknown';
    if (info.status === 404 || info.status === 410 || info.looksEmpty) return 'no';
    if (info.status >= 200 && info.status < 300) return 'yes';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
