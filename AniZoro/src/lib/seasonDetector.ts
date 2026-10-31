import { JikanAnime } from '../types';

export interface TitleSeasonResult {
  hasSeasonWord: boolean;
  detectedSeasonNumber: number | null;
  matchedPattern: string | null;
  chosenStreamEpisode: number;
  relativeEpisode: number;
  offsetApplied: number;
  debugReason: string;
}

// Continuous series episode partitions (e.g. Black Clover has 170 continuous episodes on AniList / MegaPlay)
export interface ContinuousAnimePartition {
  seasonNumber: number;
  startEpisode: number;
  endEpisode: number;
  episodesCount: number;
  offset: number;
}

// Well-known continuous long-running anime with season offsets on AniList / streaming backends
export const CONTINUOUS_ANIME_MAP: Record<number, { franchiseName: string; partitions: ContinuousAnimePartition[] }> = {
  // Black Clover (MAL 34572, AniList 97940, 170 episodes)
  34572: {
    franchiseName: 'Black Clover',
    partitions: [
      { seasonNumber: 1, startEpisode: 1, endEpisode: 51, episodesCount: 51, offset: 0 },
      { seasonNumber: 2, startEpisode: 52, endEpisode: 102, episodesCount: 51, offset: 51 },
      { seasonNumber: 3, startEpisode: 103, endEpisode: 154, episodesCount: 52, offset: 102 },
      { seasonNumber: 4, startEpisode: 155, endEpisode: 170, episodesCount: 16, offset: 154 },
    ],
  },
  // Hunter x Hunter 2011 (MAL 11061, AniList 11061, 148 episodes)
  11061: {
    franchiseName: 'Hunter x Hunter',
    partitions: [
      { seasonNumber: 1, startEpisode: 1, endEpisode: 26, episodesCount: 26, offset: 0 },
      { seasonNumber: 2, startEpisode: 27, endEpisode: 58, episodesCount: 32, offset: 26 },
      { seasonNumber: 3, startEpisode: 59, endEpisode: 75, episodesCount: 17, offset: 58 },
      { seasonNumber: 4, startEpisode: 76, endEpisode: 136, episodesCount: 61, offset: 75 },
      { seasonNumber: 5, startEpisode: 137, endEpisode: 148, episodesCount: 12, offset: 136 },
    ],
  },
  // Bleach (Original Series, MAL 269, AniList 269, 366 episodes)
  269: {
    franchiseName: 'Bleach',
    partitions: [
      { seasonNumber: 1, startEpisode: 1, endEpisode: 20, episodesCount: 20, offset: 0 },
      { seasonNumber: 2, startEpisode: 21, endEpisode: 41, episodesCount: 21, offset: 20 },
      { seasonNumber: 3, startEpisode: 42, endEpisode: 63, episodesCount: 22, offset: 41 },
    ],
  },
};

/**
 * Checks if a string contains the word "season" (case-insensitive) and extracts the season number.
 * Supported patterns:
 * - "Black Clover Season 2", "Season 2", "Season 02", "Season: 2", "Season - 2", "Season #2"
 * - "2nd Season", "3rd Season", "1st Season", "4th Season", "5th Season"
 * - "Season II", "Season III", "Season IV", "Season V", "Season VI"
 * - "S2", "S02", "S-2" (with word boundaries)
 */
export function checkTitleContainsSeason(title?: string | null): {
  hasSeasonWord: boolean;
  seasonNumber: number | null;
  matchedPattern: string | null;
} {
  if (!title || typeof title !== 'string') {
    return { hasSeasonWord: false, seasonNumber: null, matchedPattern: null };
  }

  const clean = title.trim();

  // 1. Explicit "Season <number>" pattern (e.g. "Season 2", "Season: 2", "Season #2", "Season - 2")
  const seasonNumRegex = /\bseason\s*[:#-]?\s*0*(\d+)\b/i;
  const matchNum = clean.match(seasonNumRegex);
  if (matchNum) {
    const sNum = parseInt(matchNum[1], 10);
    return {
      hasSeasonWord: true,
      seasonNumber: sNum,
      matchedPattern: matchNum[0],
    };
  }

  // 2. Ordinal season pattern (e.g. "2nd Season", "3rd Season", "1st Season", "4th Season")
  const ordinalRegex = /\b(\d+)(?:st|nd|rd|th)\s*season\b/i;
  const matchOrdinal = clean.match(ordinalRegex);
  if (matchOrdinal) {
    const sNum = parseInt(matchOrdinal[1], 10);
    return {
      hasSeasonWord: true,
      seasonNumber: sNum,
      matchedPattern: matchOrdinal[0],
    };
  }

  // 3. Roman numeral season pattern (e.g. "Season II", "Season III", "Season IV")
  const romanRegex = /\bseason\s+([ivx]+)\b/i;
  const matchRoman = clean.match(romanRegex);
  if (matchRoman) {
    const roman = matchRoman[1].toUpperCase();
    const romanMap: Record<string, number> = {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      VIII: 8,
      IX: 9,
      X: 10,
    };
    if (romanMap[roman]) {
      return {
        hasSeasonWord: true,
        seasonNumber: romanMap[roman],
        matchedPattern: matchRoman[0],
      };
    }
  }

  // 4. Short form "S2" / "S02" (must have word boundary or separator)
  const shortRegex = /(?:\b|[_\-\/])S0*(\d+)(?:\b|[_\-\/])/i;
  const matchShort = clean.match(shortRegex);
  if (matchShort) {
    const sNum = parseInt(matchShort[1], 10);
    return {
      hasSeasonWord: true,
      seasonNumber: sNum,
      matchedPattern: matchShort[0],
    };
  }

  // 5. Title contains the word "season" without a direct adjacent number (e.g. "Final Season")
  if (/\bseason\b/i.test(clean)) {
    return {
      hasSeasonWord: true,
      seasonNumber: null,
      matchedPattern: 'season',
    };
  }

  return {
    hasSeasonWord: false,
    seasonNumber: null,
    matchedPattern: null,
  };
}

export interface TitleAndSeasonInput {
  candidateTitles: (string | null | undefined)[];
  requestedSeason?: number;
  requestedEpisode: number;
  anime?: JikanAnime | null;
  malId?: number;
  knownOffset?: number;
}

/**
 * System that checks if the title contains season word and checks the number then accordingly chooses the episode.
 *
 * For example:
 * - "Black Clover Season 2", Episode 1:
 *   Title contains "Season 2" -> Number is 2.
 *   Black Clover Season 2 begins at Episode 52 (offset 51).
 *   Accordingly chooses episode 52!
 *
 * - If the requested episode is already continuous (e.g. 52):
 *   It retains 52 without redundant offset addition.
 */
export function checkTitleSeasonAndChooseEpisode(input: TitleAndSeasonInput): TitleSeasonResult {
  const {
    candidateTitles,
    requestedSeason,
    requestedEpisode,
    anime,
    malId,
    knownOffset,
  } = input;

  const targetMalId = malId || anime?.mal_id || 0;
  let detectedSeasonNum: number | null = null;
  let matchedPattern: string | null = null;
  let hasSeasonWord = false;

  // 1. Scan candidate titles for season word and number
  for (const t of candidateTitles) {
    if (!t) continue;
    const res = checkTitleContainsSeason(t);
    if (res.hasSeasonWord) {
      hasSeasonWord = true;
      if (res.seasonNumber !== null && detectedSeasonNum === null) {
        detectedSeasonNum = res.seasonNumber;
        matchedPattern = res.matchedPattern;
      }
    }
  }

  // Fallback to explicitly passed requestedSeason if title didn't specify
  const effectiveSeason = detectedSeasonNum !== null ? detectedSeasonNum : (requestedSeason || 1);

  // 2. Check if this is a known continuous series (e.g. Black Clover)
  const continuousConfig = CONTINUOUS_ANIME_MAP[targetMalId];
  if (continuousConfig) {
    const partition = continuousConfig.partitions.find((p) => p.seasonNumber === effectiveSeason);
    if (partition) {
      const offset = partition.offset;
      // If requestedEpisode is relative (e.g. Ep 1 in Season 2), choose continuous stream episode (e.g. 51 + 1 = 52)
      if (requestedEpisode <= partition.episodesCount) {
        const chosen = offset + requestedEpisode;
        return {
          hasSeasonWord,
          detectedSeasonNumber: effectiveSeason,
          matchedPattern,
          chosenStreamEpisode: chosen,
          relativeEpisode: requestedEpisode,
          offsetApplied: offset,
          debugReason: `Continuous anime '${continuousConfig.franchiseName}' Season ${effectiveSeason}: relative ep ${requestedEpisode} mapped to stream ep ${chosen} (offset +${offset})`,
        };
      }

      // If requestedEpisode was already an absolute/continuous episode within this partition (e.g. Ep 52)
      if (requestedEpisode >= partition.startEpisode && requestedEpisode <= partition.endEpisode) {
        const rel = requestedEpisode - offset;
        return {
          hasSeasonWord,
          detectedSeasonNumber: effectiveSeason,
          matchedPattern,
          chosenStreamEpisode: requestedEpisode,
          relativeEpisode: rel,
          offsetApplied: 0,
          debugReason: `Continuous anime '${continuousConfig.franchiseName}' Season ${effectiveSeason}: already absolute ep ${requestedEpisode}`,
        };
      }
    }
  }

  // 3. Check if an explicit offset was passed from a registered franchise part
  if (typeof knownOffset === 'number' && knownOffset > 0) {
    if (requestedEpisode <= 100) {
      const chosen = knownOffset + requestedEpisode;
      return {
        hasSeasonWord,
        detectedSeasonNumber: effectiveSeason,
        matchedPattern,
        chosenStreamEpisode: chosen,
        relativeEpisode: requestedEpisode,
        offsetApplied: knownOffset,
        debugReason: `Franchise registered offset +${knownOffset}: chosen stream ep ${chosen}`,
      };
    }
  }

  // 4. Default: Return relative episode
  return {
    hasSeasonWord,
    detectedSeasonNumber: effectiveSeason,
    matchedPattern,
    chosenStreamEpisode: requestedEpisode,
    relativeEpisode: requestedEpisode,
    offsetApplied: 0,
    debugReason: `Standard season ${effectiveSeason} episode ${requestedEpisode}`,
  };
}
