import { JikanAnime, JikanEpisode, JikanCharacter } from '../types';
import { edgeFetch } from './edgeFetch';

// In-memory cache to save requests and respect rate limits
const cache: Record<string, { data: any; expiry: number }> = {};
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes in-memory cache

// In-flight request deduplication map to prevent redundant concurrent fetches
const inFlightRequests = new Map<string, Promise<any>>();

// Persistent LocalStorage Cache for INSTANT (0ms) loading
const L_CACHE_PREFIX = 'anizoro_anim_cache_';

function getPersistentCache<T>(key: string, ignoreExpiry = false): T | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const cached = localStorage.getItem(L_CACHE_PREFIX + key);
    if (!cached) return null;
    const { data, expiry } = JSON.parse(cached);
    if (ignoreExpiry || Date.now() < expiry) {
      return data as T;
    }
  } catch (e) {
    // Ignore cache read failures
  }
  return null;
}

function savePersistentCache(key: string, data: any, durationMs?: number) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const duration = durationMs || (6 * 60 * 60 * 1000); // 6 hours default
    const expiry = Date.now() + duration;
    localStorage.setItem(L_CACHE_PREFIX + key, JSON.stringify({ data, expiry }));
  } catch (e) {
    // Prune older caching entries if localStorage is nearly full
    try {
      const keys = Object.keys(localStorage);
      const cacheKeys = keys.filter(k => k.startsWith(L_CACHE_PREFIX));
      if (cacheKeys.length > 50) {
        cacheKeys.slice(0, 25).forEach(k => localStorage.removeItem(k));
      }
    } catch (_) {}
  }
}

// Convert AniList Media payload to standard JikanAnime format
export function anilistMediaToJikan(media: any): JikanAnime {
  if (!media) throw new Error('Empty media object provided to anilistMediaToJikan');

  const malId: number = media.idMal || media.id;
  const englishTitle = media.title?.english?.trim() || null;
  const romajiTitle = media.title?.romaji?.trim() || englishTitle || media.title?.native?.trim() || 'Anime Series';
  const nativeTitle = media.title?.native?.trim() || null;

  const imageUrl =
    media.coverImage?.large ||
    media.coverImage?.extraLarge ||
    media.coverImage?.medium ||
    'https://cdn.myanimelist.net/images/anime/1091/140131.jpg';

  const largeImageUrl =
    media.coverImage?.extraLarge ||
    media.coverImage?.large ||
    imageUrl;

  let cleanSynopsis = media.description ? media.description.replace(/<[^>]*>/g, '').trim() : null;
  if (cleanSynopsis) {
    cleanSynopsis = cleanSynopsis.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
  }

  let formattedStatus = 'Finished Airing';
  if (media.status === 'RELEASING') formattedStatus = 'Currently Airing';
  else if (media.status === 'NOT_YET_RELEASED') formattedStatus = 'Not Yet Aired';
  else if (media.status === 'CANCELLED') formattedStatus = 'Cancelled';
  else if (media.status === 'HIATUS') formattedStatus = 'On Hiatus';

  const scoreVal = media.averageScore
    ? Number((media.averageScore / 10).toFixed(2))
    : media.meanScore
    ? Number((media.meanScore / 10).toFixed(2))
    : null;

  const genresList = (media.genres || []).map((name: string, idx: number) => ({
    mal_id: idx + 1,
    name,
  }));

  const studiosList = (media.studios?.nodes || []).map((s: any, idx: number) => ({
    mal_id: idx + 1,
    name: s.name,
  }));

  let formatType = media.format || 'TV';
  if (formatType === 'TV_SHORT') formatType = 'TV';

  const trailerData = media.trailer && media.trailer.id && media.trailer.site === 'youtube'
    ? {
        youtube_id: media.trailer.id,
        url: `https://www.youtube.com/watch?v=${media.trailer.id}`,
        embed_url: `https://www.youtube.com/embed/${media.trailer.id}`,
      }
    : null;

  const airedData = {
    from: media.startDate?.year
      ? `${media.startDate.year}-${String(media.startDate.month || 1).padStart(2, '0')}-${String(media.startDate.day || 1).padStart(2, '0')}`
      : null,
    to: media.endDate?.year
      ? `${media.endDate.year}-${String(media.endDate.month || 1).padStart(2, '0')}-${String(media.endDate.day || 1).padStart(2, '0')}`
      : null,
    string: media.seasonYear
      ? `${media.season || ''} ${media.seasonYear}`.trim()
      : media.startDate?.year
      ? String(media.startDate.year)
      : null,
  };

  const canonicalEnglish = englishTitle || romajiTitle;

  return {
    mal_id: malId,
    mal_id_is_real: Boolean(media.idMal),
    title: canonicalEnglish,
    title_english: canonicalEnglish,
    title_japanese: nativeTitle,
    images: {
      jpg: {
        image_url: imageUrl,
        large_image_url: largeImageUrl,
      },
    },
    trailer: trailerData,
    episodes: media.episodes || null,
    status: formattedStatus,
    synopsis: cleanSynopsis,
    score: scoreVal,
    genres: genresList,
    studios: studiosList,
    type: formatType,
    members: media.popularity ?? 0,
    popularity: media.popularity || 100,
    rating: media.isAdult ? 'Rx - Hentai' : 'PG-13',
    year: media.seasonYear || media.startDate?.year || undefined,
    aired: airedData,
    banner_image: media.bannerImage || null,
    anilist_id: media.id || undefined,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// One door for every AniList request.
// AniList allows roughly 30-90 requests a minute per visitor. The home page used to fire 6-20 requests at once
// (4 lanes, recommendations, up to 13 schedule pages), got HTTP 429 on some of them and never retried, which is
// why "Latest releases" failed and the Release Schedule section silently vanished. Now every request goes through
// a small queue (max 3 at a time), a 429 pauses the queue for the time AniList asks for, and failures retry once.
// ---------------------------------------------------------------------------------------------------------------
const ANILIST_MAX_CONCURRENT = 3;
let anilistActive = 0;
const anilistWaiters: Array<() => void> = [];
let anilistBlockedUntil = 0;
// AniList answers HTTP 403 for everyone when it switches its public API off (it did on 2026-10-21). Retrying only
// wastes time and requests, so after a 403 AniList is skipped for a few minutes and the Jikan / Kitsu / ARM
// fallbacks run at once.
let anilistDownUntil = 0;
const ANILIST_DOWN_MS = 5 * 60 * 1000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function withAniListSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (anilistActive >= ANILIST_MAX_CONCURRENT) {
    // the slot is handed over by the request that just finished, so the counter stays as it is
    await new Promise<void>((resolve) => anilistWaiters.push(resolve));
  } else {
    anilistActive++;
  }
  try {
    return await fn();
  } finally {
    const next = anilistWaiters.shift();
    if (next) next();
    else anilistActive--;
  }
}

class AniListHttpError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

async function anilistPost(
  query: string,
  variables: Record<string, any>,
  timeoutMs: number,
  attempts = 2
): Promise<{ json: any; receivedAt: number }> {
  let lastError: unknown = new Error('AniList request failed');
  if (Date.now() < anilistDownUntil) throw new AniListHttpError('AniList is unavailable (HTTP 403)', false);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const blockedFor = anilistBlockedUntil - Date.now();
    if (blockedFor > 0) await sleep(Math.min(blockedFor, 12000));
    try {
      return await withAniListSlot(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await edgeFetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query, variables }),
            signal: controller.signal,
          });
          if (response.status === 429) {
            const asked = Number(response.headers.get('Retry-After'));
            anilistBlockedUntil = Date.now() + (asked > 0 ? Math.min(asked, 20) : 6) * 1000;
            throw new AniListHttpError('AniList rate limit (HTTP 429)', true);
          }
          if (response.status === 403) anilistDownUntil = Date.now() + ANILIST_DOWN_MS;
          if (!response.ok) throw new AniListHttpError(`AniList returned HTTP ${response.status}`, response.status >= 500);
          const json = await response.json();
          return { json, receivedAt: Math.floor(Date.now() / 1000) };
        } finally {
          clearTimeout(timer);
        }
      });
    } catch (err) {
      lastError = err;
      if (err instanceof AniListHttpError && !err.retryable) break; // e.g. a rejected query: retrying cannot help
      if (attempt < attempts - 1 && Date.now() >= anilistBlockedUntil) await sleep(700 * (attempt + 1));
    }
  }
  throw lastError;
}

// Time-sensitive AniList calls (airing times). Airing times are computed from AniList's own "seconds until airing"
// plus the moment the answer arrived, so a wrong clock on the device cannot skew them.
// With `persistKey` the last good answer is also kept in localStorage: a recent one (under `freshForMs`) is used as is,
// and an older one is still returned when the network fails, so the section shows something instead of an error.
const freshCache = new Map<string, { expires: number; value: { data: any; receivedAt: number } }>();
const freshInFlight = new Map<string, Promise<{ data: any; receivedAt: number } | null>>();
const FRESH_PREFIX = 'anizoro_fresh_';

function readFreshStore(persistKey: string): { data: any; receivedAt: number } | null {
  try {
    const raw = localStorage.getItem(FRESH_PREFIX + persistKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data && typeof parsed.receivedAt === 'number') return parsed;
  } catch (_) {}
  return null;
}

function writeFreshStore(persistKey: string, value: { data: any; receivedAt: number }) {
  try {
    localStorage.setItem(FRESH_PREFIX + persistKey, JSON.stringify(value));
  } catch (_) {}
}

async function fetchAniListFresh<T = any>(
  query: string,
  variables: Record<string, any> = {},
  timeoutMs = 12000,
  persistKey?: string,
  freshForMs = 10 * 60 * 1000
): Promise<{ data: T; receivedAt: number } | null> {
  // Kept for 2 minutes (the arrival time is stored with it), so revisiting a page does not hit AniList's rate limit.
  const key = query + JSON.stringify(variables);
  const hit = freshCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as { data: T; receivedAt: number };
  const pending = freshInFlight.get(key);
  if (pending) return pending as Promise<{ data: T; receivedAt: number } | null>;

  const stored = persistKey ? readFreshStore(persistKey) : null;
  if (stored && Date.now() - stored.receivedAt * 1000 < freshForMs) {
    return stored as { data: T; receivedAt: number };
  }

  const run = (async () => {
    try {
      const { json, receivedAt } = await anilistPost(query, variables, timeoutMs, 2);
      if (json.errors?.length || !json.data) throw new Error(json.errors?.[0]?.message || 'AniList sent no data');
      const value = { data: json.data, receivedAt };
      freshCache.set(key, { expires: Date.now() + 2 * 60 * 1000, value });
      if (persistKey) writeFreshStore(persistKey, value);
      return value;
    } catch (err: any) {
      console.warn('[AniList Fresh Notice]:', err?.message || err);
      // Network trouble: an older saved answer (up to a day) beats an empty section.
      if (stored && Date.now() - stored.receivedAt * 1000 < 24 * 60 * 60 * 1000) return stored;
      return null;
    }
  })();
  freshInFlight.set(key, run);
  run.finally(() => freshInFlight.delete(key));
  return run as Promise<{ data: T; receivedAt: number } | null>;
}

// AniList GraphQL client with in-memory + localStorage cache, de-duplication, retry and stale fallback
async function fetchAniListGraphQL<T = any>(query: string, variables: Record<string, any> = {}, timeoutMs = 10000): Promise<T | null> {
  const cacheKey = 'anilist_' + JSON.stringify({ query: query.trim(), variables });
  const now = Date.now();

  // 1. In-memory cache check (0ms)
  if (cache[cacheKey] && cache[cacheKey].expiry > now) {
    return cache[cacheKey].data as T;
  }

  // 2. Persistent storage cache check (<1ms)
  const persistent = getPersistentCache<T>(cacheKey);
  if (persistent) {
    cache[cacheKey] = { data: persistent, expiry: now + CACHE_DURATION_MS };
    return persistent;
  }

  // 3. Deduplicate in-flight requests
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      const { json } = await anilistPost(query, variables, timeoutMs, 2);
      if (json.errors && json.errors.length > 0) {
        throw new Error(`AniList GraphQL error: ${json.errors[0]?.message}`);
      }
      const data = json.data as T;
      if (data) {
        cache[cacheKey] = { data, expiry: Date.now() + CACHE_DURATION_MS };
        savePersistentCache(cacheKey, data);
        return data;
      }
      return null;
    } catch (err: any) {
      console.warn('[AniList Query Notice]:', err?.message || err);
      // Return stale cache if available
      const stale = getPersistentCache<T>(cacheKey, true);
      if (stale) return stale;
      return null;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

// Titles that must always stay visible even though they are ecchi / flagged by upstream APIs.
const ALWAYS_ALLOWED_MAL_IDS = new Set<number>([40746]); // Overflow
const ALWAYS_ALLOWED_TITLE = /^overflow\b/i;

function isAlwaysAllowed(anime: JikanAnime): boolean {
  if (ALWAYS_ALLOWED_MAL_IDS.has(anime.mal_id)) return true;
  return (
    ALWAYS_ALLOWED_TITLE.test(anime.title || '') ||
    ALWAYS_ALLOWED_TITLE.test(anime.title_english || '')
  );
}

// Hard adult content: explicit / hentai. Blocked everywhere (search, lanes, browse, recommendations).
function isExplicitAdult(anime: JikanAnime): boolean {
  const ratingLower = anime.rating?.toLowerCase() || '';
  const titleLower = anime.title?.toLowerCase() || '';
  const titleEnglishLower = anime.title_english?.toLowerCase() || '';
  if (
    ratingLower.includes('rx') ||
    ratingLower.includes('hentai') ||
    titleLower.includes('hentai') ||
    titleEnglishLower.includes('hentai')
  ) {
    return true;
  }
  return (anime.genres || []).some((g) => {
    const n = (g?.name || '').toLowerCase();
    return n === 'hentai' || n === 'erotica';
  });
}

export function isSearchJunkAnime(anime: JikanAnime, _query?: string): boolean {
  if (!anime) return true;
  if (isAlwaysAllowed(anime)) return false;
  // NOTE: no "matches the query" exemption here. A one-letter search like "j" matches almost every
  // title, which used to switch the adult filter off entirely.
  if (isExplicitAdult(anime)) return true;
  if ((anime.type?.toLowerCase() || '') === 'music') return true;
  return false;
}

export function isJunkAnime(anime: JikanAnime): boolean {
  if (!anime) return true;
  if (isAlwaysAllowed(anime)) return false;
  // Adult check runs first so very popular adult titles can't slip through the members shortcut.
  if (isExplicitAdult(anime)) return true;
  if (anime.members !== undefined && anime.members >= 100000) {
    return false;
  }

  const typeLower = anime.type?.toLowerCase() || '';
  if (typeLower === 'music') return true;

  if (anime.members !== undefined && anime.members < 1200) {
    const statusLower = anime.status?.toLowerCase() || '';
    if (!statusLower.includes('upcoming') && !statusLower.includes('currently airing')) {
      return true;
    }
  }

  return false;
}

// Search results that are obscure (almost nobody lists them, so no stream provider has them) get dropped.
// AniList "popularity" = number of users who list the title; Jikan "members" is on a larger scale.
function isObscureForSearch(anime: JikanAnime, query: string, relaxed: boolean): boolean {
  if (isAlwaysAllowed(anime)) return false;
  const q = query.toLowerCase().trim();
  const exact =
    q.length >= 4 &&
    ((anime.title || '').toLowerCase() === q || (anime.title_english || '').toLowerCase() === q);
  if (exact) return false;
  const typeLower = (anime.type || '').toLowerCase();
  if (['music', 'cm', 'pv'].includes(typeLower)) return true;
  if (relaxed) return false;
  const base = anime.anilist_id ? 2000 : 8000;
  const popularity = anime.members ?? anime.popularity ?? 0;
  if (popularity < base) return true;
  // Unscored, never-aired leftovers are almost always placeholders.
  if (anime.score == null && !(anime.status || '').toLowerCase().includes('currently') && !(anime.status || '').toLowerCase().includes('not yet') && popularity < base * 3) return true;
  return false;
}

function pickSearchResults(list: JikanAnime[], query: string): JikanAnime[] {
  const strict = list.filter((a) => !isObscureForSearch(a, query, false));
  if (strict.length > 0) return strict;
  // Nothing popular matched (rare title): fall back to anything that is not junk, so searches never come back empty.
  return list.filter((a) => !isObscureForSearch(a, query, true));
}

export function normalizeSearchQuery(query: string): string {
  let q = query.toLowerCase().replace(/[\u00d7\u2715\u2716]/g, 'x').trim();
  if (/^hxh$/i.test(q) || /^hunter\s*x?\s*hunter/i.test(q)) {
    return 'hunter x hunter';
  }
  q = q.replace(/\bkaijoo\b/g, 'kaiju');
  q = q.replace(/\bvineland\b/g, 'vinland');
  q = q.replace(/\bkimetsu\b/g, 'demon slayer');
  q = q.replace(/\bshingeki\b/g, 'attack on titan');
  q = q.replace(/\bko\b/g, 'no');
  q = q.replace(/no\s*\.?\s*8/g, 'no 8');
  q = q.replace(/\bdr\.?\s*storm\b/g, 'dr stone');
  q = q.replace(/\bdoctor\s*storm\b/g, 'dr stone');
  return q;
}

function rankSearchResults(list: JikanAnime[], query: string): JikanAnime[] {
  const qLower = query.toLowerCase().trim();
  if (qLower.length < 3) {
    return [...list].sort((a, b) => (b.members || b.popularity || 0) - (a.members || a.popularity || 0));
  }
  return [...list].sort((a, b) => {
    // Specifically prioritize Hunter x Hunter (2011 - MAL 11061) over 1999 (MAL 136)
    if (/hunter\s*x?\s*hunter|hxh/i.test(qLower)) {
      if (a.mal_id === 11061 && b.mal_id !== 11061) return -1;
      if (b.mal_id === 11061 && a.mal_id !== 11061) return 1;
    }

    const aEng = (a.title_english || '').toLowerCase();
    const aRom = (a.title || '').toLowerCase();
    const bEng = (b.title_english || '').toLowerCase();
    const bRom = (b.title || '').toLowerCase();

    const aExact = aEng === qLower || aRom === qLower;
    const bExact = bEng === qLower || bRom === qLower;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aStarts = aEng.startsWith(qLower) || aRom.startsWith(qLower);
    const bStarts = bEng.startsWith(qLower) || bRom.startsWith(qLower);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    const aIncludes = aEng.includes(qLower) || aRom.includes(qLower);
    const bIncludes = bEng.includes(qLower) || bRom.includes(qLower);
    if (aIncludes && !bIncludes) return -1;
    if (!aIncludes && bIncludes) return 1;

    return (b.members || b.popularity || 0) - (a.members || a.popularity || 0);
  });
}

function deduplicateAnimeList(list: JikanAnime[]): JikanAnime[] {
  const seen = new Set<number>();
  return list.filter(anime => {
    if (!anime || !anime.mal_id || seen.has(anime.mal_id)) return false;
    seen.add(anime.mal_id);
    return true;
  });
}

// Media Fields Fragment for standard queries
const MEDIA_FIELDS = `
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
    medium
  }
  bannerImage
  format
  episodes
  status
  averageScore
  meanScore
  popularity
  isAdult
  genres
  studios(isMain: true) {
    nodes {
      name
    }
  }
  description(asHtml: false)
  startDate {
    year
    month
    day
  }
  endDate {
    year
    month
    day
  }
  season
  seasonYear
  trailer {
    id
    site
  }
`;

const episodesInFlight = new Map<string, Promise<JikanEpisode[]>>();
const nextAiringCache = new Map<string, { value: { episode: number; airingAt: number } | null; expires: number }>();

function getCurrentSeason(): { season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'; year: number } {
  const now = new Date();
  const m = now.getMonth(); // 0-11
  const season = m <= 2 ? 'WINTER' : m <= 5 ? 'SPRING' : m <= 8 ? 'SUMMER' : 'FALL';
  return { season, year: now.getFullYear() };
}

// Smaller field set for long lists (no description, studios or trailer)
const LEAN_FIELDS = `
  id
  idMal
  title { romaji english native }
  coverImage { extraLarge large medium }
  bannerImage
  format
  episodes
  status
  averageScore
  meanScore
  popularity
  isAdult
  genres
  startDate { year month day }
  season
  seasonYear
`;

// Home page lanes: the lean field set plus the synopsis (the billboard shows it). No studios/trailer/end date.
const LANE_FIELDS = `
  id
  idMal
  title { romaji english native }
  coverImage { extraLarge large medium }
  bannerImage
  format
  episodes
  status
  averageScore
  meanScore
  popularity
  isAdult
  genres
  description(asHtml: false)
  startDate { year month day }
  season
  seasonYear
`;

// ---------------------------------------------------------------------------------------------------------------
// Jikan fallbacks: used when AniList is down (HTTP 403) so titles, lanes and the player still work.
// ---------------------------------------------------------------------------------------------------------------
async function jikanGet(path: string, timeoutMs = 8000): Promise<any | null> {
  try {
    const res = await edgeFetch(`https://api.jikan.moe/v4${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function jikanToAnime(raw: any): JikanAnime | null {
  if (!raw || !raw.mal_id) return null;
  const img = raw.images?.jpg || {};
  const large = img.large_image_url || img.image_url || '';
  return {
    ...raw,
    title: raw.title || raw.title_english || 'Anime',
    title_english: raw.title_english || null,
    title_japanese: raw.title_japanese || null,
    images: { jpg: { image_url: img.image_url || large, small_image_url: img.small_image_url, large_image_url: large } },
    trailer: raw.trailer || null,
    episodes: raw.episodes ?? null,
    status: raw.status || 'Unknown',
    synopsis: raw.synopsis || null,
    score: typeof raw.score === 'number' ? raw.score : null,
    genres: raw.genres || [],
    studios: raw.studios || [],
    type: raw.type || 'TV',
  } as JikanAnime;
}

async function jikanList(path: string): Promise<JikanAnime[]> {
  const json = await jikanGet(path);
  const list = ((json?.data as any[]) || []).map(jikanToAnime).filter((a): a is JikanAnime => !!a && !isJunkAnime(a));
  return deduplicateAnimeList(list);
}

const jikanSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const jikanService = {
  // Billboard + "Trending now" + "Popular this season" in ONE request (it used to be three), with only as many
  // titles as the page shows. Fewer bytes and one round trip is the biggest win on a slow connection.
  getHomeLanes: async (): Promise<{ airing: JikanAnime[]; trending: JikanAnime[]; season: JikanAnime[] }> => {
    const { season, year } = getCurrentSeason();
    const query = `
      query ($season: MediaSeason, $year: Int) {
        airing: Page(page: 1, perPage: 14) {
          media(status: RELEASING, sort: [TRENDING_DESC, POPULARITY_DESC], type: ANIME, isAdult: false) { ${LANE_FIELDS} }
        }
        trending: Page(page: 1, perPage: 14) {
          media(sort: TRENDING_DESC, type: ANIME, isAdult: false, format_in: [TV, TV_SHORT, ONA, MOVIE]) { ${LANE_FIELDS} }
        }
        season: Page(page: 1, perPage: 14) {
          media(season: $season, seasonYear: $year, sort: POPULARITY_DESC, type: ANIME, isAdult: false, format_in: [TV, TV_SHORT, ONA]) { ${LANE_FIELDS} }
        }
      }
    `;
    const data = await fetchAniListGraphQL<Record<string, { media: any[] }>>(query, { season, year });
    const pick = (name: string) =>
      deduplicateAnimeList((data?.[name]?.media || []).map(anilistMediaToJikan).filter((a) => !isJunkAnime(a)));
    const lanes = { airing: pick('airing'), trending: pick('trending'), season: pick('season') };
    if (lanes.airing.length || lanes.trending.length || lanes.season.length) return lanes;
    // AniList is down: Jikan answers instead (one request after the other, Jikan allows ~3 per second)
    const airing = await jikanList('/top/anime?filter=airing&sfw=true&limit=14');
    await jikanSleep(400);
    const trending = await jikanList('/top/anime?filter=bypopularity&sfw=true&limit=14');
    await jikanSleep(400);
    const seasonal = await jikanList('/seasons/now?sfw=true&limit=14');
    return { airing, trending, season: seasonal };
  },

  getTopAnime: async (): Promise<JikanAnime[]> => {
    const query = `
      query {
        Page(page: 1, perPage: 30) {
          media(sort: [POPULARITY_DESC, SCORE_DESC], type: ANIME, isAdult: false) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;

    try {
      const data = await fetchAniListGraphQL<{ Page: { media: any[] } }>(query);
      if (data?.Page?.media && data.Page.media.length > 0) {
        const mapped = data.Page.media.map(anilistMediaToJikan).filter(a => !isJunkAnime(a));
        if (mapped.length > 0) {
          return deduplicateAnimeList(mapped);
        }
      }
    } catch (e) {
      console.warn('[jikanService.getTopAnime] AniList fetch failed:', e);
    }

    return jikanList('/top/anime?filter=bypopularity&sfw=true&limit=25');
  },

  getTopAiringAnime: async (): Promise<JikanAnime[]> => {
    const query = `
      query {
        Page(page: 1, perPage: 25) {
          media(status: RELEASING, sort: [TRENDING_DESC, POPULARITY_DESC], type: ANIME, isAdult: false) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;

    try {
      const data = await fetchAniListGraphQL<{ Page: { media: any[] } }>(query);
      if (data?.Page?.media && data.Page.media.length > 0) {
        const mapped = data.Page.media.map(anilistMediaToJikan).filter(a => !isJunkAnime(a));
        if (mapped.length > 0) {
          return deduplicateAnimeList(mapped);
        }
      }
    } catch (e) {
      console.warn('[jikanService.getTopAiringAnime] AniList fetch failed:', e);
    }

    return jikanList('/top/anime?filter=airing&sfw=true&limit=25');
  },

  // Paged browse lists for the navigation sections (Movies, Series, New Releases, Popular, Top Rated),
  // optionally narrowed to one genre.
  browseAnime: async (
    category: 'movies' | 'series' | 'new' | 'popular' | 'top',
    genre: string | null = null,
    page = 1
  ): Promise<{ items: JikanAnime[]; hasNext: boolean; failed?: boolean }> => {
    const { season, year } = getCurrentSeason();
    const filters: string[] = ['type: ANIME', 'isAdult: false'];
    const vars: Record<string, any> = { page };
    let declared = '$page: Int';
    switch (category) {
      case 'movies':
        filters.push('format: MOVIE', 'sort: POPULARITY_DESC');
        break;
      case 'series':
        filters.push('format_in: [TV, TV_SHORT]', 'sort: POPULARITY_DESC');
        break;
      case 'new':
        filters.push('season: $season', 'seasonYear: $year', 'format_in: [TV, TV_SHORT, ONA, MOVIE]', 'sort: POPULARITY_DESC');
        declared += ', $season: MediaSeason, $year: Int';
        vars.season = season;
        vars.year = year;
        break;
      case 'top':
        filters.push('sort: SCORE_DESC', 'popularity_greater: 100000', 'format_in: [TV, MOVIE]');
        break;
      default:
        filters.push('sort: POPULARITY_DESC');
    }
    if (genre) {
      filters.push('genre: $genre');
      declared += ', $genre: String';
      vars.genre = genre;
    }
    const query = `
      query (${declared}) {
        Page(page: $page, perPage: 24) {
          pageInfo { hasNextPage }
          media(${filters.join(', ')}) {
            ${LEAN_FIELDS}
          }
        }
      }
    `;
    try {
      const data = await fetchAniListGraphQL<{ Page: { pageInfo: { hasNextPage: boolean }; media: any[] } }>(query, vars, 15000);
      if (!data?.Page) {
        // AniList is down: Jikan browse (genre filtering needs AniList's genre names, so it is skipped here)
        const paths: Record<string, string> = {
          movies: `/top/anime?type=movie&filter=bypopularity`,
          series: `/top/anime?type=tv&filter=bypopularity`,
          new: `/seasons/now`,
          popular: `/top/anime?filter=bypopularity`,
          top: `/top/anime`,
        };
        const json = await jikanGet(`${paths[category]}${paths[category].includes('?') ? '&' : '?'}sfw=true&limit=24&page=${page}`, 10000);
        const list = ((json?.data as any[]) || []).map(jikanToAnime).filter((a): a is JikanAnime => !!a && !isJunkAnime(a));
        if (!list.length) return { items: [], hasNext: false, failed: true };
        return { items: deduplicateAnimeList(list), hasNext: Boolean(json?.pagination?.has_next_page) };
      }
      const items = (data.Page.media || []).map(anilistMediaToJikan).filter((a) => !isJunkAnime(a));
      return { items: deduplicateAnimeList(items), hasNext: Boolean(data.Page.pageInfo?.hasNextPage) };
    } catch (e) {
      console.warn('[browseAnime] notice:', e);
      return { items: [], hasNext: false, failed: true };
    }
  },

  // Trending right now on AniList (any status), newest buzz first.
  getTrendingNow: async (): Promise<JikanAnime[]> => {
    const query = `
      query {
        Page(page: 1, perPage: 30) {
          media(sort: TRENDING_DESC, type: ANIME, isAdult: false, format_in: [TV, TV_SHORT, ONA, MOVIE]) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;
    try {
      const data = await fetchAniListGraphQL<{ Page: { media: any[] } }>(query);
      const mapped = (data?.Page?.media || []).map(anilistMediaToJikan).filter(a => !isJunkAnime(a));
      if (mapped.length) return deduplicateAnimeList(mapped);
    } catch (e) {
      console.warn('[jikanService.getTrendingNow] AniList fetch failed:', e);
    }
    return jikanList('/top/anime?filter=airing&sfw=true&limit=25');
  },

  // Most popular shows of the current season (e.g. FALL 2026).
  getSeasonPopular: async (): Promise<JikanAnime[]> => {
    const { season, year } = getCurrentSeason();
    const query = `
      query ($season: MediaSeason, $year: Int) {
        Page(page: 1, perPage: 30) {
          media(season: $season, seasonYear: $year, sort: POPULARITY_DESC, type: ANIME, isAdult: false, format_in: [TV, TV_SHORT, ONA]) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;
    try {
      const data = await fetchAniListGraphQL<{ Page: { media: any[] } }>(query, { season, year });
      const mapped = (data?.Page?.media || []).map(anilistMediaToJikan).filter(a => !isJunkAnime(a));
      if (mapped.length) return deduplicateAnimeList(mapped);
    } catch (e) {
      console.warn('[jikanService.getSeasonPopular] AniList fetch failed:', e);
    }
    return jikanList('/seasons/now?sfw=true&limit=25');
  },

  // Episodes that aired in the last 7 days, newest first (one entry per show, with its latest episode).
  getLatestReleases: async (): Promise<JikanAnime[]> => {
    const nowSec = Math.floor(Date.now() / 1000 / 60) * 60;
    const query = `
      query ($from: Int, $to: Int) {
        Page(page: 1, perPage: 50) {
          airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME_DESC) {
            episode
            airingAt
            timeUntilAiring
            media {
              ${LEAN_FIELDS}
            }
          }
        }
      }
    `;

    try {
      // The window is built from the device clock only to pick a range; the shown times use timeUntilAiring.
      const res = await fetchAniListFresh<{ Page: { airingSchedules: any[] } }>(
        query,
        { from: nowSec - 8 * 24 * 3600, to: nowSec + 3600 },
        12000,
        'latest',
        5 * 60 * 1000
      );
      // seconds since the answer arrived (it may be a saved answer), so "already aired" is judged as of now
      const sinceReceived = res ? Math.floor(Date.now() / 1000) - res.receivedAt : 0;
      const seen = new Set<number>();
      const out: JikanAnime[] = [];
      for (const row of res?.data?.Page?.airingSchedules || []) {
        const media = row?.media;
        if (!media || media.isAdult) continue;
        if (!['TV', 'TV_SHORT', 'ONA'].includes(media.format)) continue;
        if (typeof row.timeUntilAiring !== 'number') continue;
        const untilNow = row.timeUntilAiring - sinceReceived;
        if (untilNow > 0) continue; // only episodes that already aired
        if (untilNow < -7 * 24 * 3600) continue;
        if (seen.has(media.id)) continue;
        seen.add(media.id);
        const anime = anilistMediaToJikan(media);
        if (isJunkAnime(anime)) continue;
        out.push({ ...anime, latest_episode: row.episode, aired_at: (res?.receivedAt || nowSec) + row.timeUntilAiring });
      }
      if (out.length > 0) return out;
    } catch (e) {
      console.warn('[jikanService.getLatestReleases] AniList failed:', e);
    }

    // Backup: MyAnimeList's recently released episodes via Jikan
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await edgeFetch('https://api.jikan.moe/v4/watch/episodes', { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        const seen = new Set<number>();
        const out: JikanAnime[] = [];
        for (const row of json?.data || []) {
          const entry = row?.entry;
          if (!entry?.mal_id || seen.has(entry.mal_id)) continue;
          seen.add(entry.mal_id);
          const epNum = parseInt(String(row?.episodes?.[0]?.title || '').replace(/\D+/g, ''), 10);
          const img = entry.images?.jpg?.large_image_url || entry.images?.jpg?.image_url || '';
          out.push({
            mal_id: entry.mal_id,
            title: entry.title || 'Unknown title',
            title_english: null,
            title_japanese: null,
            images: { jpg: { image_url: entry.images?.jpg?.image_url || img, large_image_url: img } },
            trailer: null,
            episodes: null,
            status: 'Currently Airing',
            synopsis: null,
            score: null,
            genres: [],
            studios: [],
            type: 'TV',
            aired: null,
            latest_episode: Number.isFinite(epNum) ? epNum : undefined,
          });
        }
        return out;
      }
    } catch (e) {
      console.warn('[jikanService.getLatestReleases] Jikan backup failed:', e);
    }
    return [];
  },

  // Recommendations built from titles the user watched or tracked (AniList community recommendations).
  getRecommendations: async (seedMalIds: number[], excludeMalIds: number[] = []): Promise<JikanAnime[]> => {
    const seeds = Array.from(new Set(seedMalIds.filter((n) => Number.isInteger(n) && n > 0))).slice(0, 4);
    const exclude = new Set(excludeMalIds);

    if (seeds.length > 0) {
      const blocks = seeds
        .map((id, i) => `a${i}: Media(idMal: ${id}, type: ANIME) { recommendations(sort: RATING_DESC, perPage: 8) { nodes { rating mediaRecommendation { ${LANE_FIELDS} } } } }`)
        .join('\n');
      try {
        const data = await fetchAniListGraphQL<Record<string, any>>(`query { ${blocks} }`);
        const score = new Map<number, { anime: JikanAnime; points: number }>();
        for (const key of Object.keys(data || {})) {
          for (const node of data?.[key]?.recommendations?.nodes || []) {
            const media = node?.mediaRecommendation;
            if (!media || media.isAdult || !media.idMal) continue;
            if (!['TV', 'TV_SHORT', 'ONA', 'MOVIE'].includes(media.format)) continue;
            const anime = anilistMediaToJikan(media);
            if (exclude.has(anime.mal_id) || isJunkAnime(anime)) continue;
            const entry = score.get(anime.mal_id) || { anime, points: 0 };
            entry.points += 1000 + Math.max(0, node.rating || 0); // shown for several seeds ranks higher
            score.set(anime.mal_id, entry);
          }
        }
        const ranked = Array.from(score.values()).sort((a, b) => b.points - a.points).map((e) => e.anime);
        if (ranked.length > 0) return ranked.slice(0, 20);
      } catch (e) {
        console.warn('[jikanService.getRecommendations] AniList fetch failed:', e);
      }
    }

    // No history yet: show the best-rated popular series.
    const query = `
      query {
        Page(page: 1, perPage: 16) {
          media(sort: SCORE_DESC, type: ANIME, isAdult: false, format_in: [TV], popularity_greater: 150000) {
            ${LANE_FIELDS}
          }
        }
      }
    `;
    try {
      const data = await fetchAniListGraphQL<{ Page: { media: any[] } }>(query);
      const mapped = (data?.Page?.media || []).map(anilistMediaToJikan).filter(a => !isJunkAnime(a) && !exclude.has(a.mal_id));
      return deduplicateAnimeList(mapped).slice(0, 20);
    } catch (e) {
      console.warn('[jikanService.getRecommendations] top-rated fetch failed:', e);
      return [];
    }
  },

  getTopMovies: async (): Promise<JikanAnime[]> => {
    const query = `
      query {
        Page(page: 1, perPage: 25) {
          media(format: MOVIE, sort: [POPULARITY_DESC, SCORE_DESC], type: ANIME, isAdult: false) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;

    try {
      const data = await fetchAniListGraphQL<{ Page: { media: any[] } }>(query);
      if (data?.Page?.media && data.Page.media.length > 0) {
        const mapped = data.Page.media.map(anilistMediaToJikan).filter(a => !isJunkAnime(a));
        if (mapped.length > 0) {
          return deduplicateAnimeList(mapped);
        }
      }
    } catch (e) {
      console.warn('[jikanService.getTopMovies] AniList fetch failed:', e);
    }

    return [];
  },

  searchAnime: async (searchQuery: string): Promise<JikanAnime[]> => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return [];

    const normalized = normalizeSearchQuery(trimmed);
    const cleaned = trimmed
      .replace(/\b(anine|anime|animation|series|show|tv|season\s*\d+|s\d+)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const gql = `
      query ($search: String) {
        Page(page: 1, perPage: 30) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;

    // Candidate search strings in priority order
    const candidateQueries = Array.from(
      new Set([normalized, cleaned, trimmed.toLowerCase(), trimmed].filter(q => q && q.length > 0))
    );

    // 1. Search AniList across candidates
    for (const cand of candidateQueries) {
      try {
        const data = await fetchAniListGraphQL<{ Page: { media: any[] } }>(gql, { search: cand });
        if (data?.Page?.media && data.Page.media.length > 0) {
          const mapped = data.Page.media
            .map(anilistMediaToJikan)
            .filter(a => !isSearchJunkAnime(a, trimmed) && !isSearchJunkAnime(a, cand));
          const picked = pickSearchResults(deduplicateAnimeList(mapped), trimmed);
          if (picked.length > 0) {
            return rankSearchResults(picked, trimmed);
          }
        }
      } catch (e) {
        console.warn(`[searchAnime] AniList search failed for "${cand}":`, e);
      }
    }

    // 2. Jikan search (real MAL ids, so details, episodes and every server keep working). Used when AniList is down.
    {
      const seen = new Set<number>();
      for (const cand of candidateQueries.slice(0, 2)) {
        const json = await jikanGet(`/anime?q=${encodeURIComponent(cand)}&limit=20&order_by=popularity`, 9000);
        const mapped = ((json?.data as any[]) || [])
          .map(jikanToAnime)
          .filter((a): a is JikanAnime => !!a && !seen.has(a.mal_id) && !isSearchJunkAnime(a, trimmed) && !isSearchJunkAnime(a, cand));
        const picked = pickSearchResults(deduplicateAnimeList(mapped), trimmed);
        if (picked.length > 0) return rankSearchResults(picked, trimmed);
      }
    }

    // 3. Kitsu API fallback
    try {
      const kitsuQuery = cleaned || normalized;
      const kitsuRes = await edgeFetch(
        `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(kitsuQuery)}&page[limit]=10`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (kitsuRes.ok) {
        const kitsuData = await kitsuRes.json();
        if (kitsuData.data && kitsuData.data.length > 0) {
          const kitsuMapped: JikanAnime[] = kitsuData.data.filter((item: any) => !item?.attributes?.nsfw && item?.attributes?.ageRating !== 'R18' ).map((item: any) => {
            const attr = item.attributes || {};
            const poster = attr.posterImage?.large || attr.posterImage?.original || '';
            return {
              mal_id: parseInt(item.id, 10) + 900000,
              title: attr.canonicalTitle || attr.titles?.en_jp || attr.titles?.en || 'Anime',
              title_english: attr.titles?.en || attr.canonicalTitle || null,
              title_japanese: attr.titles?.ja_jp || null,
              images: { jpg: { image_url: poster, large_image_url: poster } },
              trailer: attr.youtubeVideoId ? { youtube_id: attr.youtubeVideoId, url: `https://www.youtube.com/watch?v=${attr.youtubeVideoId}`, embed_url: `https://www.youtube.com/embed/${attr.youtubeVideoId}` } : null,
              episodes: attr.episodeCount || null,
              status: attr.status === 'current' ? 'Currently Airing' : 'Finished Airing',
              synopsis: attr.synopsis || null,
              score: attr.averageRating ? Number((parseFloat(attr.averageRating) / 10).toFixed(2)) : null,
              genres: [],
              studios: [],
              type: attr.subtype?.toUpperCase() || 'TV',
              members: attr.userCount || 50000,
              popularity: 100,
              rating: 'PG-13'
            };
          });
          if (kitsuMapped.length > 0) {
            return rankSearchResults(deduplicateAnimeList(kitsuMapped), trimmed);
          }
        }
      }
    } catch (_) {}

    return [];
  },

  getAnimeDetails: async (id: number): Promise<JikanAnime> => {
    // Query AniList by idMal (MyAnimeList ID)
    const malQuery = `
      query ($idMal: Int) {
        Media(idMal: $idMal, type: ANIME) {
          ${MEDIA_FIELDS}
        }
      }
    `;
    try {
      const data = await fetchAniListGraphQL<{ Media?: any }>(malQuery, { idMal: id });
      if (data?.Media) {
        return anilistMediaToJikan(data.Media);
      }
    } catch (_) {}

    // 3. Query AniList by AniList Media ID
    const aniQuery = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          ${MEDIA_FIELDS}
        }
      }
    `;
    try {
      const data = await fetchAniListGraphQL<{ Media?: any }>(aniQuery, { id });
      if (data?.Media) {
        return anilistMediaToJikan(data.Media);
      }
    } catch (_) {}

    // 3b. Jikan by MAL id (AniList is down or does not know this id)
    if (id < 900000) {
      const full = await jikanGet(`/anime/${id}/full`, 9000);
      const mapped = jikanToAnime(full?.data);
      if (mapped) return mapped;
    }

    // 4. Try Kitsu by ID (handles Kitsu IDs or 900000+ offset IDs)
    try {
      const kitsuId = id > 900000 ? id - 900000 : id;
      const kRes = await edgeFetch(`https://kitsu.io/api/edge/anime/${kitsuId}`, {
        headers: { Accept: 'application/vnd.api+json' },
        signal: AbortSignal.timeout(2500)
      });
      if (kRes.ok) {
        const kData = await kRes.json();
        const attr = kData.data?.attributes;
        if (attr) {
          const poster = attr.posterImage?.large || attr.posterImage?.original || '';
          const resolvedTitle = attr.canonicalTitle || attr.titles?.en_jp || attr.titles?.en || 'Anime';
          return {
            mal_id: id,
            title: resolvedTitle,
            title_english: attr.titles?.en || attr.canonicalTitle || null,
            title_japanese: attr.titles?.ja_jp || null,
            images: { jpg: { image_url: poster, large_image_url: poster } },
            trailer: attr.youtubeVideoId ? { youtube_id: attr.youtubeVideoId, url: `https://www.youtube.com/watch?v=${attr.youtubeVideoId}`, embed_url: `https://www.youtube.com/embed/${attr.youtubeVideoId}` } : null,
            episodes: attr.episodeCount || 12,
            status: attr.status === 'current' ? 'Currently Airing' : 'Finished Airing',
            synopsis: attr.synopsis || null,
            score: attr.averageRating ? Number((parseFloat(attr.averageRating) / 10).toFixed(2)) : 8.0,
            genres: [],
            studios: [],
            type: attr.subtype?.toUpperCase() || 'TV',
            members: attr.userCount || 50000,
            popularity: 100,
            rating: 'PG-13'
          };
        }
      }
    } catch (_) {}

    // Details could not be loaded: return a bare entry (no invented score, genres or artwork)
    return {
      mal_id: id,
      title: 'Unknown title',
      title_english: null,
      title_japanese: null,
      images: { jpg: { image_url: '', large_image_url: '' } },
      trailer: null,
      episodes: null,
      status: 'Unknown',
      synopsis: null,
      score: null,
      genres: [],
      studios: [],
      type: 'TV',
      aired: null,
    };
  },

  getAnimeEpisodes: (id: number, opts: { anilistId?: number; malIsReal?: boolean } = {}): Promise<JikanEpisode[]> => {
    const flightKey = `${id}-${opts.anilistId || 0}-${opts.malIsReal === false ? 'a' : 'm'}`;
    const existing = episodesInFlight.get(flightKey);
    if (existing) return existing;
    const run = (async (): Promise<JikanEpisode[]> => {
      const cacheKey = `episodes_v3_${flightKey}`;
      const cached = getPersistentCache<JikanEpisode[]>(cacheKey);
      if (cached && cached.length > 0) return cached;

      const blank = (n: number, title?: string): JikanEpisode => ({
        mal_id: n,
        title: title || `Episode ${n}`,
        title_japanese: null,
        title_romanji: null,
        aired: null,
        filler: false,
        recap: false,
        forum_url: null,
      });

      // 1. Jikan (titles, air dates, filler flags). Only when the id really is a MyAnimeList id.
      if (opts.malIsReal !== false) {
        try {
          const episodes: JikanEpisode[] = [];
          for (let page = 1; page <= 5; page++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);
            const res = await edgeFetch(`https://api.jikan.moe/v4/anime/${id}/episodes?page=${page}`, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) break;
            const json = await res.json();
            for (const ep of json?.data || []) {
              if (!ep?.mal_id) continue;
              episodes.push({
                mal_id: ep.mal_id,
                title: ep.title || `Episode ${ep.mal_id}`,
                title_japanese: ep.title_japanese || null,
                title_romanji: ep.title_romanji || null,
                aired: ep.aired || null,
                filler: Boolean(ep.filler),
                recap: Boolean(ep.recap),
                forum_url: ep.forum_url || null,
              });
            }
            if (!json?.pagination?.has_next_page) break;
            await new Promise((r) => setTimeout(r, 400)); // stay under Jikan's rate limit
          }
          if (episodes.length > 0) {
            savePersistentCache(cacheKey, episodes, 3 * 60 * 60 * 1000);
            return episodes;
          }
        } catch (e) {
          console.warn(`[getAnimeEpisodes] Jikan notice for ${id}:`, e);
        }
      }

      // 2. AniList: episode titles from its streaming data, and how many have aired
      let titles = new Map<number, string>();
      let count = 0;
      if (opts.anilistId) {
        try {
          const data = await fetchAniListGraphQL<{ Media?: any }>(
            `query ($id: Int) { Media(id: $id, type: ANIME) { status episodes streamingEpisodes { title } nextAiringEpisode { episode } } }`,
            { id: opts.anilistId },
            10000
          );
          const media = data?.Media;
          for (const se of media?.streamingEpisodes || []) {
            const m = String(se?.title || '').match(/^\s*(?:episode|ep\.?)\s*(\d+)\s*[-:\u2013\u2014]\s*(.+)$/i);
            if (m) titles.set(parseInt(m[1], 10), m[2].trim());
          }
          const nextEp = media?.nextAiringEpisode?.episode;
          if (nextEp) count = Math.max(1, nextEp - 1); // still airing (even before episode 1): only what is out
          else if (media?.status === 'NOT_YET_RELEASED') count = 1;
          else if (media?.episodes) count = media.episodes;
          const highestTitled = titles.size > 0 ? Math.max(...Array.from(titles.keys())) : 0;
          count = Math.max(count, highestTitled);
        } catch (e) {
          console.warn(`[getAnimeEpisodes] AniList notice for ${opts.anilistId}:`, e);
        }
      }

      // 3. Still nothing: use the known total, or what has aired
      if (!count) {
        try {
          const detail = await jikanService.getAnimeDetails(id);
          if (detail?.episodes && detail.episodes > 0) count = detail.episodes;
          else if (/airing/i.test(detail?.status || '')) count = 1;
        } catch (_) {}
      }
      if (!count) {
        const next = await jikanService.getNextAiring(id, opts.anilistId).catch(() => null);
        count = next?.episode ? Math.max(1, next.episode - 1) : 12;
      }

      const list: JikanEpisode[] = [];
      for (let i = 1; i <= Math.min(count, 2000); i++) list.push(blank(i, titles.get(i)));
      savePersistentCache(cacheKey, list, titles.size > 0 ? 3 * 60 * 60 * 1000 : 20 * 60 * 1000);
      return list;
    })();
    episodesInFlight.set(flightKey, run);
    run.finally(() => episodesInFlight.delete(flightKey));
    return run;
  },

  // When the next episode of a show airs (AniList). Returns null for finished shows.
  // airingAt is in device-clock seconds (arrival time + AniList's own seconds-until-airing).
  getNextAiring: async (malId: number, anilistId?: number): Promise<{ episode: number; airingAt: number } | null> => {
    const cacheId = anilistId ? `a${anilistId}` : `m${malId}`;
    const hit = nextAiringCache.get(cacheId);
    if (hit && hit.expires > Date.now()) return hit.value;

    // An AniList id is exact. A MAL id is only used when we have nothing better.
    const query = anilistId
      ? `query ($id: Int) { Media(id: $id, type: ANIME) { nextAiringEpisode { episode timeUntilAiring } } }`
      : `query ($id: Int) { Media(idMal: $id, type: ANIME) { nextAiringEpisode { episode timeUntilAiring } } }`;
    const res = await fetchAniListFresh<{ Media: any }>(query, { id: anilistId || malId }, 10000);
    if (!res) return null; // not cached, so the next call can try again
    const next = res.data?.Media?.nextAiringEpisode;
    const value =
      next && typeof next.timeUntilAiring === 'number' && next.episode
        ? { episode: next.episode as number, airingAt: res.receivedAt + next.timeUntilAiring }
        : null;
    const fiveMin = Date.now() + 5 * 60 * 1000;
    nextAiringCache.set(cacheId, { value, expires: value ? Math.min(fiveMin, value.airingAt * 1000 + 60 * 1000) : fiveMin });
    return value;
  },

  // How many episodes are out. `known` is false when AniList could not be reached (so callers can be careful
  // instead of treating a failed request like a finished show). limit is null when there is no cap (finished show).
  getAiredLimit: async (malId: number, anilistId?: number): Promise<{ known: boolean; limit: number | null }> => {
    const query = anilistId
      ? `query ($id: Int) { Media(id: $id, type: ANIME) { status nextAiringEpisode { episode } } }`
      : `query ($id: Int) { Media(idMal: $id, type: ANIME) { status nextAiringEpisode { episode } } }`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetchAniListFresh<{ Media: any }>(query, { id: anilistId || malId }, 10000);
      const media = res?.data?.Media;
      if (media) {
        const next = media.nextAiringEpisode?.episode;
        if (next) return { known: true, limit: Math.max(1, next - 1) };
        if (media.status === 'NOT_YET_RELEASED') return { known: true, limit: 1 };
        return { known: true, limit: null };
      }
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
    return { known: false, limit: null };
  },

  // Release schedule: the next episode of every popular, currently airing show that lands inside the next 7 days,
  // plus today's episodes that already aired (taken from the "latest releases" answer, which is cached and shared).
  // This is 3 light requests (top 150 airing shows with their next episode) instead of the up to 13 heavy pages
  // the old week-wide airingSchedules sweep needed, which is what used to trip AniList's rate limit.
  getWeeklySchedule: async (): Promise<Array<{ anime: JikanAnime; episode: number; airingAt: number }>> => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startSec = Math.floor(startOfToday.getTime() / 1000);
    const endSec = startSec + 7 * 24 * 3600;
    const buildQuery = (page: number) => `
      query {
        Page(page: ${page}, perPage: 50) {
          media(status: RELEASING, type: ANIME, isAdult: false, sort: POPULARITY_DESC, format_in: [TV, TV_SHORT, ONA]) {
            ${LEAN_FIELDS}
            nextAiringEpisode { episode timeUntilAiring }
          }
        }
      }
    `;
    type SchedPage = { Page: { media: any[] } };
    const out: Array<{ anime: JikanAnime; episode: number; airingAt: number }> = [];
    const seen = new Set<string>();
    const push = (anime: JikanAnime, episode: number, airingAt: number) => {
      const key = `${anime.mal_id}-${episode}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ anime, episode, airingAt });
    };

    let upcomingOk = false;
    try {
      const pages = await Promise.all(
        [1, 2, 3].map((p) => fetchAniListFresh<SchedPage>(buildQuery(p), {}, 15000, `sched${p}`, 10 * 60 * 1000))
      );
      for (const page of pages) {
        if (!page) continue;
        upcomingOk = true;
        for (const media of page.data?.Page?.media || []) {
          const next = media?.nextAiringEpisode;
          if (!media || media.isAdult || !media.idMal || !next || typeof next.timeUntilAiring !== 'number') continue;
          if ((media.popularity || 0) < 4000) continue; // keep the list to shows people actually follow
          const airingAt = page.receivedAt + next.timeUntilAiring;
          if (airingAt >= endSec) continue;
          push(anilistMediaToJikan(media), next.episode, airingAt);
        }
      }
    } catch (e) {
      console.warn('[getWeeklySchedule] notice:', e);
    }

    // Episodes that already aired today (they are not "next" anymore)
    try {
      const latest = await jikanService.getLatestReleases();
      for (const a of latest) {
        if (!a.aired_at || !a.latest_episode || a.aired_at < startSec) continue;
        if ((a.popularity || 0) < 4000) continue;
        push(a, a.latest_episode, a.aired_at);
      }
    } catch (_) {}

    if (!upcomingOk && out.length === 0) throw new Error('schedule unavailable'); // lets the section show a retry
    return out.sort((x, y) => x.airingAt - y.airingAt);
  },

  getAnimeCharacters: async (id: number): Promise<JikanCharacter[]> => {
    const cacheKey = `chars_v2_${id}`;
    const cached = getPersistentCache<JikanCharacter[]>(cacheKey);
    if (cached && cached.length > 0) return cached;

    const withTimeout = async (url: string, init?: RequestInit, ms = 10000): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      try {
        return await edgeFetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    const finish = (list: JikanCharacter[]): JikanCharacter[] => {
      if (list.length > 0) savePersistentCache(cacheKey, list, 48 * 60 * 60 * 1000);
      return list;
    };

    // 1. AniList (looked up by MAL id only). Read the body even on non-200, since
    //    AniList answers "Not Found" with an HTTP 404 that the shared helper treated as a failure.
    try {
      const query = `
        query ($idMal: Int) {
          Media(idMal: $idMal, type: ANIME) {
            characters(sort: [ROLE, RELEVANCE], perPage: 30) {
              edges {
                role
                node { id name { full } image { large } }
                voiceActors(language: JAPANESE) { id name { full } image { large } }
              }
            }
          }
        }
      `;
      const res = await withTimeout('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables: { idMal: id } }),
      });
      const json = await res.json().catch(() => null);
      const edges: any[] = json?.data?.Media?.characters?.edges || [];
      if (edges.length > 0) {
        return finish(
          edges.map((edge: any) => {
            const charNode = edge.node || {};
            const va = edge.voiceActors?.[0];
            return {
              character: {
                mal_id: charNode.id || 0,
                url: `https://anilist.co/character/${charNode.id}`,
                name: charNode.name?.full || 'Character',
                images: { jpg: { image_url: charNode.image?.large || '' } },
              },
              role: edge.role === 'MAIN' ? 'Main' : 'Supporting',
              voice_actors: va?.name?.full
                ? [{
                    person: {
                      mal_id: va.id || 0,
                      url: `https://anilist.co/staff/${va.id}`,
                      name: va.name.full,
                      images: { jpg: { image_url: va.image?.large || '' } },
                    },
                    language: 'Japanese',
                  }]
                : [],
            } as JikanCharacter;
          })
        );
      }
    } catch (e) {
      console.warn(`[getAnimeCharacters] AniList notice for ${id}:`, e);
    }

    // 2. Fallback: Jikan (MAL data, same shape the UI already uses)
    try {
      const res = await withTimeout(`https://api.jikan.moe/v4/anime/${id}/characters`);
      if (res.ok) {
        const json = await res.json();
        const rows: any[] = json?.data || [];
        const list: JikanCharacter[] = rows
          .map((row: any) => ({
            character: row.character,
            role: row.role === 'Main' ? 'Main' : 'Supporting',
            voice_actors: (row.voice_actors || []).filter((v: any) => v?.language === 'Japanese'),
          } as JikanCharacter))
          .filter((c) => c.character?.name)
          .sort((x, y) => (x.role === 'Main' ? 0 : 1) - (y.role === 'Main' ? 0 : 1))
          .slice(0, 40);
        if (list.length > 0) return finish(list);
      }
    } catch (e) {
      console.warn(`[getAnimeCharacters] Jikan notice for ${id}:`, e);
    }

    return [];
  },

  // Looks up a working poster URL for a MAL id (used when a stored/hardcoded image fails to load)
  getPosterByMalId: async (id: number): Promise<string | null> => {
    const cacheKey = `poster_v1_${id}`;
    const cached = getPersistentCache<string>(cacheKey);
    if (cached) return cached;

    const timed = async (url: string, init?: RequestInit): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        return await edgeFetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      const query = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { coverImage { extraLarge large } } }`;
      const res = await timed('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables: { idMal: id } }),
      });
      const json = await res.json().catch(() => null);
      const url = json?.data?.Media?.coverImage?.extraLarge || json?.data?.Media?.coverImage?.large;
      if (url) {
        savePersistentCache(cacheKey, url, 14 * 24 * 60 * 60 * 1000);
        return url;
      }
    } catch (e) {
      console.warn(`[getPosterByMalId] AniList notice for ${id}:`, e);
    }

    try {
      const res = await timed(`https://api.jikan.moe/v4/anime/${id}`);
      if (res.ok) {
        const json = await res.json();
        const url = json?.data?.images?.jpg?.large_image_url || json?.data?.images?.jpg?.image_url;
        if (url) {
          savePersistentCache(cacheKey, url, 14 * 24 * 60 * 60 * 1000);
          return url;
        }
      }
    } catch (e) {
      console.warn(`[getPosterByMalId] Jikan notice for ${id}:`, e);
    }
    return null;
  },

  // AniList id for a MyAnimeList id (the self-hosted Anivexa API is addressed by AniList id)
  getAnilistIdByMal: async (malId: number): Promise<number | null> => {
    if (!malId) return null;
    try {
      const data = await fetchAniListGraphQL<{ Media?: { id?: number } }>(
        `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { id } }`,
        { idMal: malId }
      );
      if (data?.Media?.id) return data.Media.id;
    } catch {
      /* AniList down: fall through to the ID maps */
    }
    // ID maps (also cached at the edge): ARM first, then ani.zip
    try {
      const res = await edgeFetch(`https://arm.haglund.dev/api/v2/ids?source=myanimelist&id=${malId}`, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const j = await res.json();
        const id = Number(j?.anilist);
        if (id > 0) return id;
      }
    } catch {}
    try {
      const res = await edgeFetch(`https://api.ani.zip/mappings?mal_id=${malId}`, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const j = await res.json();
        const id = Number(j?.mappings?.anilist_id);
        if (id > 0) return id;
      }
    } catch {}
    return null;
  },

  getAnimeStreamingLinks: async (id: number): Promise<Array<{ name: string; url: string }>> => {
    return [
      { name: "MegaPlay Stream (Stable)", url: `https://megaplay.buzz/stream/ani/${id}/1/sub` },
      { name: "2Embed Mirror", url: `https://2embed.cc/embed/anime/${id}/1` },
      { name: "VidSrc Stream Alpha", url: `https://vidsrc.me/embed/anime?mal=${id}&ep=1` },
      { name: "MyAnimeList Profile", url: `https://myanimelist.net/anime/${id}` }
    ];
  },

  getAnimeSeasonsList: async (id: number, currentAnime: JikanAnime): Promise<JikanAnime[]> => {
    const query = `
      query ($idMal: Int, $id: Int) {
        byMal: Media(idMal: $idMal, type: ANIME) {
          relations {
            edges {
              relationType
              node {
                ${MEDIA_FIELDS}
              }
            }
          }
        }
        byAni: Media(id: $id, type: ANIME) {
          relations {
            edges {
              relationType
              node {
                ${MEDIA_FIELDS}
              }
            }
          }
        }
      }
    `;

    try {
      const data = await fetchAniListGraphQL<{ byMal?: any; byAni?: any }>(query, { idMal: id, id: id });
      const edges = data?.byMal?.relations?.edges || data?.byAni?.relations?.edges || [];

      const discoveredList: JikanAnime[] = [currentAnime];

      for (const edge of edges) {
        const relType = (edge.relationType || '').toLowerCase();
        if (
          relType === 'prequel' ||
          relType === 'sequel' ||
          relType === 'parent' ||
          relType === 'side_story' ||
          relType === 'alternative'
        ) {
          if (edge.node) {
            const mapped = anilistMediaToJikan(edge.node);
            if (mapped.type === 'TV' || mapped.type === 'Movie' || mapped.type === 'OVA' || mapped.type === 'ONA') {
              discoveredList.push(mapped);
            }
          }
        }
      }

      // Filter and sort by release date
      discoveredList.sort((a, b) => {
        const dateA = a.aired?.from ? new Date(a.aired.from).getTime() : 0;
        const dateB = b.aired?.from ? new Date(b.aired.from).getTime() : 0;
        return dateA - dateB;
      });

      return deduplicateAnimeList(discoveredList);
    } catch (err) {
      console.warn('getAnimeSeasonsList error, returning current show:', err);
      return [currentAnime];
    }
  },
};


/** Highest episode number that is not dated in the future (Jikan sometimes lists announced episodes with a future air date). */
export function releasedCapFromDates(list: Array<{ mal_id: number; aired?: string | null }>): number | null {
  const now = Date.now();
  let cap: number | null = null;
  for (const ep of list) {
    const t = ep.aired ? Date.parse(ep.aired) : NaN;
    if (!Number.isNaN(t) && t > now + 6 * 3600 * 1000) cap = cap === null ? ep.mal_id - 1 : Math.min(cap, ep.mal_id - 1);
  }
  return cap === null ? null : Math.max(1, cap);
}
