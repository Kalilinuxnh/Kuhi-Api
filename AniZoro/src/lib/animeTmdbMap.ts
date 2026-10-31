import { JikanAnime } from '../types';
import { KNOWN_ANILIST_MAP } from './franchiseMap';
import { edgeFetch } from './edgeFetch';

export interface TmdbAnimeMapping {
  tmdbId: number;
  season: number;
  episodesCount?: number;
  isMovie?: boolean;
  imdbId?: string;
  altTmdbId?: number;
  altSeason?: number;
  altEpisodeOffset?: number;
}

// Extensive TMDB and IMDb mapping database for TV series, seasons & anime movies
export const KNOWN_ANIME_TMDB_MAP: Record<number, TmdbAnimeMapping> = {
  // --- TV SERIES ---
  // Attack on Titan
  16498: { tmdbId: 1429, season: 1, episodesCount: 25, imdbId: 'tt2560140' },
  25777: { tmdbId: 1429, season: 2, episodesCount: 12, imdbId: 'tt2560140' },
  35760: { tmdbId: 1429, season: 3, episodesCount: 12, imdbId: 'tt2560140' },
  38524: { tmdbId: 1429, season: 3, episodesCount: 10, imdbId: 'tt2560140' },
  40028: { tmdbId: 1429, season: 4, episodesCount: 16, imdbId: 'tt2560140' },
  48583: { tmdbId: 1429, season: 4, episodesCount: 12, imdbId: 'tt2560140' },
  51535: { tmdbId: 1429, season: 4, episodesCount: 2, imdbId: 'tt2560140' },

  // Demon Slayer
  38000: { tmdbId: 85937, season: 1, episodesCount: 26, imdbId: 'tt9335498' },
  47778: { tmdbId: 85937, season: 2, episodesCount: 11, imdbId: 'tt9335498' },
  49926: { tmdbId: 85937, season: 3, episodesCount: 11, imdbId: 'tt9335498' },
  55701: { tmdbId: 85937, season: 4, episodesCount: 8, imdbId: 'tt9335498' },

  // Jujutsu Kaisen
  40748: { tmdbId: 95479, season: 1, episodesCount: 24, imdbId: 'tt12343534' },
  51009: { tmdbId: 95479, season: 2, episodesCount: 23, imdbId: 'tt12343534' },

  // Solo Leveling
  52299: { tmdbId: 127532, season: 1, episodesCount: 12, imdbId: 'tt21209876' },
  58514: { tmdbId: 127532, season: 2, episodesCount: 13, imdbId: 'tt21209876' },

  // Bleach: Thousand-Year Blood War
  41467: { tmdbId: 30984, season: 17, episodesCount: 13, imdbId: 'tt11993688' },
  53998: { tmdbId: 30984, season: 17, episodesCount: 13, imdbId: 'tt11993688' },
  57334: { tmdbId: 30984, season: 17, episodesCount: 14, imdbId: 'tt11993688' },

  // My Hero Academia
  31964: { tmdbId: 65930, season: 1, episodesCount: 13, imdbId: 'tt5626028' },
  33486: { tmdbId: 65930, season: 2, episodesCount: 25, imdbId: 'tt5626028' },
  36456: { tmdbId: 65930, season: 3, episodesCount: 25, imdbId: 'tt5626028' },
  38408: { tmdbId: 65930, season: 4, episodesCount: 25, imdbId: 'tt5626028' },
  42249: { tmdbId: 65930, season: 5, episodesCount: 25, imdbId: 'tt5626028' },
  49918: { tmdbId: 65930, season: 6, episodesCount: 25, imdbId: 'tt5626028' },
  54492: { tmdbId: 65930, season: 7, episodesCount: 21, imdbId: 'tt5626028' },

  // Spy x Family
  50265: { tmdbId: 120089, season: 1, episodesCount: 12, imdbId: 'tt13706018' },
  50602: { tmdbId: 120089, season: 1, episodesCount: 13, imdbId: 'tt13706018' },
  53887: { tmdbId: 120089, season: 2, episodesCount: 12, imdbId: 'tt13706018' },

  // Vinland Saga
  37521: { tmdbId: 88803, season: 1, episodesCount: 24, imdbId: 'tt10233448' },
  49387: { tmdbId: 88803, season: 2, episodesCount: 24, imdbId: 'tt10233448' },

  // Chainsaw Man
  44511: { tmdbId: 114410, season: 1, episodesCount: 12, imdbId: 'tt13616990' },

  // Death Note
  1535: { tmdbId: 13916, season: 1, episodesCount: 37, imdbId: 'tt0877057' },

  // Fullmetal Alchemist: Brotherhood
  5114: { tmdbId: 31911, season: 1, episodesCount: 64, imdbId: 'tt1355642' },

  // Hunter x Hunter (2011 & 1999)
  11061: { tmdbId: 46298, season: 1, episodesCount: 148, imdbId: 'tt2098220' },
  136: { tmdbId: 46298, season: 1, episodesCount: 62, imdbId: 'tt0281449' },
  13271: { tmdbId: 199925, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt2328577' },
  19951: { tmdbId: 247072, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt3476906' },

  // Naruto & Naruto Shippuden
  20: { tmdbId: 46260, season: 1, episodesCount: 220, imdbId: 'tt0409591' },
  1735: { tmdbId: 31910, season: 1, episodesCount: 500, imdbId: 'tt0988824' },

  // One Piece
  21: { tmdbId: 37854, season: 1, episodesCount: 1120, imdbId: 'tt0388629' },

  // Dr. Stone
  38691: { tmdbId: 86031, season: 1, episodesCount: 24, imdbId: 'tt9679542' },
  40852: { tmdbId: 86031, season: 2, episodesCount: 11, imdbId: 'tt9679542' },
  48549: { tmdbId: 86031, season: 3, episodesCount: 11, imdbId: 'tt9679542' },
  55644: { tmdbId: 86031, season: 3, episodesCount: 11, imdbId: 'tt9679542' },
  57559: { tmdbId: 86031, season: 4, episodesCount: 12, imdbId: 'tt9679542' },

  // Re:Zero
  31240: { tmdbId: 65942, season: 1, episodesCount: 25, imdbId: 'tt5607616' },
  39587: { tmdbId: 65942, season: 2, episodesCount: 13, imdbId: 'tt5607616' },
  42203: { tmdbId: 65942, season: 2, episodesCount: 12, imdbId: 'tt5607616' },
  54857: { tmdbId: 65942, season: 3, episodesCount: 16, imdbId: 'tt5607616' },

  // Frieren: Beyond Journey's End
  52991: { tmdbId: 209867, season: 1, episodesCount: 28, imdbId: 'tt22248376' },

  // Tokyo Ghoul
  22319: { tmdbId: 61374, season: 1, episodesCount: 12, imdbId: 'tt3741634' },

  // Mushoku Tensei
  39535: { tmdbId: 97513, season: 1, episodesCount: 11, imdbId: 'tt11126994' },
  45576: { tmdbId: 97513, season: 1, episodesCount: 12, imdbId: 'tt11126994' },
  51179: { tmdbId: 97513, season: 2, episodesCount: 12, imdbId: 'tt11126994' },
  55888: { tmdbId: 97513, season: 2, episodesCount: 12, imdbId: 'tt11126994' },

  // Sword Art Online
  11757: { tmdbId: 45782, season: 1, episodesCount: 25, imdbId: 'tt2250192' },
  21881: { tmdbId: 45782, season: 2, episodesCount: 24, imdbId: 'tt2250192' },
  36474: { tmdbId: 45782, season: 3, episodesCount: 24, imdbId: 'tt2250192' },
  39597: { tmdbId: 45782, season: 3, episodesCount: 23, imdbId: 'tt2250192' },

  // Classroom of the Elite
  35507: { tmdbId: 72636, season: 1, episodesCount: 12, imdbId: 'tt7156366' },
  51096: { tmdbId: 72636, season: 2, episodesCount: 13, imdbId: 'tt7156366' },
  51097: { tmdbId: 72636, season: 3, episodesCount: 13, imdbId: 'tt7156366' },

  // DanMachi
  28121: { tmdbId: 62745, season: 1, episodesCount: 13, imdbId: 'tt4551160' },
  37347: { tmdbId: 62745, season: 2, episodesCount: 12, imdbId: 'tt4551160' },
  40454: { tmdbId: 62745, season: 3, episodesCount: 12, imdbId: 'tt4551160' },
  47164: { tmdbId: 62745, season: 4, episodesCount: 22, imdbId: 'tt4551160' },
  56950: { tmdbId: 62745, season: 5, episodesCount: 15, imdbId: 'tt4551160' },

  // Mob Psycho 100
  32182: { tmdbId: 67075, season: 1, episodesCount: 12, imdbId: 'tt5897304' },
  37510: { tmdbId: 67075, season: 2, episodesCount: 13, imdbId: 'tt5897304' },
  50172: { tmdbId: 67075, season: 3, episodesCount: 12, imdbId: 'tt5897304' },

  // Haikyuu!!
  20583: { tmdbId: 60863, season: 1, episodesCount: 25, imdbId: 'tt3398540' },
  28891: { tmdbId: 60863, season: 2, episodesCount: 25, imdbId: 'tt3398540' },
  32935: { tmdbId: 60863, season: 3, episodesCount: 10, imdbId: 'tt3398540' },
  38883: { tmdbId: 60863, season: 4, episodesCount: 25, imdbId: 'tt3398540' },

  // Black Clover (TV 170 episodes)
  34572: { tmdbId: 73223, season: 1, episodesCount: 170, imdbId: 'tt7441658' },
  // Black Clover: Sword of the Wizard King (Movie)
  43656: { tmdbId: 812225, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt16613368' },

  // Overflow (TV 8 episodes) - TMDB ID: 95897
  40746: { tmdbId: 95897, season: 1, episodesCount: 8, imdbId: 'tt11608402' },

  // The God of High School (TMDB 94997 or Alt TMDB 82684)
  41487: { tmdbId: 94997, altTmdbId: 82684, season: 1, episodesCount: 13, imdbId: 'tt9054364' },

  // Bleach (Original Series TV 366 episodes)
  269: { tmdbId: 30984, season: 1, episodesCount: 366, imdbId: 'tt0434665' },

  // Blue Lock
  49596: { tmdbId: 135157, season: 1, episodesCount: 24, imdbId: 'tt15243160' },
  54865: { tmdbId: 135157, season: 2, episodesCount: 14, imdbId: 'tt15243160' },

  // Kaiju No. 8
  52588: { tmdbId: 207357, season: 1, episodesCount: 12, imdbId: 'tt21644788' },

  // Dandadan (2024)
  57524: { tmdbId: 240411, season: 1, episodesCount: 12, imdbId: 'tt30219493' },

  // Oshi no Ko
  52034: { tmdbId: 203737, season: 1, episodesCount: 11, imdbId: 'tt21808412' },
  55791: { tmdbId: 203737, season: 2, episodesCount: 13, imdbId: 'tt21808412' },

  // One Punch Man
  30276: { tmdbId: 63926, season: 1, episodesCount: 12, imdbId: 'tt4508902' },
  34134: { tmdbId: 63926, season: 2, episodesCount: 12, imdbId: 'tt4508902' },

  // Bocchi the Rock!
  47917: { tmdbId: 138502, season: 1, episodesCount: 12, imdbId: 'tt14088094' },

  // Steins;Gate
  9253: { tmdbId: 42503, season: 1, episodesCount: 24, imdbId: 'tt1910272' },

  // Hell's Paradise (Jigokuraku)
  46569: { tmdbId: 124800, season: 1, episodesCount: 13, imdbId: 'tt13918738' },

  // Wind Breaker
  54900: { tmdbId: 223326, season: 1, episodesCount: 13, imdbId: 'tt27290530' },

  // Cyberpunk: Edgerunners
  42310: { tmdbId: 105248, season: 1, episodesCount: 10, imdbId: 'tt12590266' },

  // --- ANIME MOVIES (TMDB Movie IDs) ---
  // Your Name (Kimi no Na wa)
  32281: { tmdbId: 372058, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt5311514' },
  // Spirited Away (Sen to Chihiro no Kamikakushi)
  199: { tmdbId: 129, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt0245429' },
  // Demon Slayer: Mugen Train Movie
  40456: { tmdbId: 635302, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt11032374' },
  // Jujutsu Kaisen 0
  48561: { tmdbId: 810693, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt14331144' },
  // A Silent Voice (Koe no Katachi)
  28851: { tmdbId: 378064, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt5323662' },
  // Weathering with You (Tenki no Ko)
  38826: { tmdbId: 568160, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt9426210' },
  // Suzume (Suzume no Tojimari)
  50594: { tmdbId: 916224, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt16428256' },
  // Howl's Moving Castle
  431: { tmdbId: 4935, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt0347149' },
  // Princess Mononoke
  164: { tmdbId: 128, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt0119698' },
  // Akira
  47: { tmdbId: 149, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt0094625' },
  // One Piece Film: Red
  50410: { tmdbId: 900667, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt16183464' },
  // Look Back (2024)
  58116: { tmdbId: 1241982, season: 1, isMovie: true, episodesCount: 1 },
  // The Boy and the Heron (Kimitachi wa Dou Ikiru ka)
  35959: { tmdbId: 508883, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt6587046' },
  // I Want to Eat Your Pancreas (Kimi no Suizou wo Tabetai)
  36098: { tmdbId: 504253, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt7236034' },
  // The End of Evangelion
  32: { tmdbId: 18491, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt0169858' },
  // Perfect Blue
  437: { tmdbId: 10494, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt0156887' },
  // Grave of the Fireflies
  578: { tmdbId: 12477, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt0095327' },
  // 5 Centimeters per Second
  1689: { tmdbId: 38142, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt0983213' },
  // The Garden of Words
  16782: { tmdbId: 181283, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt2591814' },
  // Wolf Children
  12355: { tmdbId: 110420, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt2140203' },
  // Dragon Ball Super: Super Hero
  48926: { tmdbId: 610150, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt14614892' },
  // Dragon Ball Super: Broly
  36946: { tmdbId: 503314, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt7961060' },
  // Sword Art Online the Movie: Ordinal Scale
  31765: { tmdbId: 396535, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt5544384' },
  // Spy x Family Code: White
  53888: { tmdbId: 1062807, season: 1, isMovie: true, episodesCount: 1, imdbId: 'tt25458000' },
};

/**
 * Resolves AniList ID from registered cache or returns undefined
 */
export function getKnownAnilistId(malId: number): number | undefined {
  return KNOWN_ANILIST_MAP[malId];
}

/**
 * Accurately determines if an anime item is a Movie or Film
 */
export function isAnimeMovie(anime?: JikanAnime | null): boolean {
  if (!anime) return false;
  if (anime.type === 'Movie') return true;
  if (KNOWN_ANIME_TMDB_MAP[anime.mal_id]?.isMovie) return true;
  const title = (anime.title_english || anime.title || '').toLowerCase();
  if (anime.episodes === 1 && (title.includes('movie') || title.includes('film') || title.includes('the movie') || title.includes('gekijuuban'))) {
    return true;
  }
  return false;
}

export interface DynamicExternalIds {
  /** Per-episode TMDb/TVDB season and episode numbers for this entry, when ani.zip knows them. */
  episodes?: Record<number, { s: number; e: number }>;
  themoviedb?: number | null;
  imdb?: string | null;
  season?: number | null;
}

const memoryExternalIdsCache: Record<number, DynamicExternalIds> = {};

/**
 * Resolves TMDb / IMDb IDs (and a TMDb season when the source knows it) for a MAL id.
 * Sources: ARM and ani.zip (queried together). Only complete answers (with a TMDb id) are stored for a long time;
 * a miss is remembered for a few minutes so a temporary outage does not stick.
 */
const MISS_TTL_MS = 5 * 60 * 1000;
const missCache: Record<number, number> = {};

async function fetchJson(url: string, ms = 6000): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await edgeFetch(url, { signal: controller.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchExternalIds(malId: number): Promise<DynamicExternalIds | null> {
  if (!malId) return null;
  if (memoryExternalIdsCache[malId]) return memoryExternalIdsCache[malId];

  const cacheKey = `anizoro_ext_ids_v2_${malId}`;
  const hasStorage = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  if (hasStorage) {
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.themoviedb) {
          memoryExternalIdsCache[malId] = parsed;
          return parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  if (missCache[malId] && missCache[malId] > Date.now()) return null;

  // Ask both sources at once; ARM wins for the ID, ani.zip fills in the season ARM does not provide.
  const [arm, zip] = await Promise.all([
    fetchJson(`https://arm.haglund.dev/api/v2/ids?source=myanimelist&id=${malId}`),
    fetchJson(`https://api.ani.zip/mappings?mal_id=${malId}`),
  ]);
  const zipMap = zip?.mappings;
  const zipSeasonRaw = Number(zipMap?.season?.tmdb ?? zipMap?.season?.tvdb);
  const zipSeason = Number.isFinite(zipSeasonRaw) && zipSeasonRaw > 0 ? zipSeasonRaw : null;
  const armSeasonRaw = Number(arm?.['themoviedb-season']);
  const armSeason = Number.isFinite(armSeasonRaw) && armSeasonRaw > 0 ? armSeasonRaw : null;

  const tmdb = Number(arm?.themoviedb) || Number(zipMap?.themoviedb_id) || 0;
  let resolved: DynamicExternalIds | null = null;
  if (tmdb) {
    const imdbRaw = arm?.imdb || zipMap?.imdb_id;
    const episodes: Record<number, { s: number; e: number }> = {};
    let count = 0;
    for (const [key, ep] of Object.entries<any>(zip?.episodes || {})) {
      const n = Number(key);
      const season = Number(ep?.seasonNumber);
      const number = Number(ep?.episodeNumber);
      if (Number.isInteger(n) && n > 0 && season > 0 && number > 0 && count < 300) {
        episodes[n] = { s: season, e: number };
        count++;
      }
    }
    resolved = {
      themoviedb: tmdb,
      imdb: imdbRaw ? String(imdbRaw).trim() : null,
      season: armSeason ?? zipSeason,
      ...(count > 0 ? { episodes } : {}),
    };
  }

  if (resolved && resolved.themoviedb) {
    memoryExternalIdsCache[malId] = resolved;
    if (hasStorage) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(resolved));
      } catch {
        // ignore
      }
    }
    return resolved;
  }

  missCache[malId] = Date.now() + MISS_TTL_MS;
  return null;
}
