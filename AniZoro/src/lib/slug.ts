// Slug helpers shared by the app (src/App.tsx, the share sheet) and the Cloudflare Pages Function that
// writes link-preview tags (functions/anime/[[path]].ts). Keep this file free of React / DOM imports.

// Known slug dictionary for direct name navigation
export const KNOWN_SLUG_MAP: Record<string, number> = {
  'hunter-x-hunter': 11061,
  'hunter-x-hunter-2011': 11061,
  'hunter-hunter': 11061,
  'hunter-hunter-2011': 11061,
  'hxh': 11061,
  'hxh-2011': 11061,
  'hunter-x-hunter-1999': 136,
  'hxh-1999': 136,
  'naruto': 20,
  'naruto-shippuden': 1735,
  'one-piece': 21,
  'bleach': 269,
  'bleach-thousand-year-blood-war': 41467,
  'attack-on-titan': 16498,
  'shingeki-no-kyojin': 16498,
  'demon-slayer': 38000,
  'kimetsu-no-yaiba': 38000,
  'jujutsu-kaisen': 40748,
  'solo-leveling': 52299,
  'death-note': 1535,
  'fullmetal-alchemist-brotherhood': 5114,
  'fma-brotherhood': 5114,
  'dr-stone': 38691,
  'frieren': 52991,
  'chainsaw-man': 44511,
  'kaiju-no-8': 52588,
  'vinland-saga': 37521,
  'spy-x-family': 50265,
  'black-clover': 34572,
  'black-clover-season-2': 34572,
  'black-clover-season-3': 34572,
  'black-clover-season-4': 34572,
  'overflow': 40746,
};

// Slug helpers for router integration
export function parseAnimeSlug(slug: string): { malId: number; slugTitle: string } | null {
  if (!slug) return null;
  const decoded = decodeURIComponent(slug).trim().toLowerCase();
  
  // 1. Direct slug dictionary lookup (e.g. "hunter-x-hunter", "hxh", "solo-leveling")
  if (KNOWN_SLUG_MAP[decoded]) {
    return {
      malId: KNOWN_SLUG_MAP[decoded],
      slugTitle: decoded,
    };
  }

  // 2. Starts with digits: "11061-hunter-x-hunter-2011" or "52299-solo-leveling" or "11061"
  const startMatch = decoded.match(/^(\d+)(?:-(.*))?$/);
  if (startMatch) {
    return {
      malId: parseInt(startMatch[1], 10),
      slugTitle: startMatch[2] || '',
    };
  }

  // 3. Ends with digits: "hunter-x-hunter-11061"
  const endMatch = decoded.match(/^(.*?)-(\d+)$/);
  if (endMatch) {
    return {
      malId: parseInt(endMatch[2], 10),
      slugTitle: endMatch[1] || '',
    };
  }

  // 4. Raw numeric ID
  const num = parseInt(decoded, 10);
  if (!isNaN(num) && num > 0) {
    return { malId: num, slugTitle: '' };
  }

  return null;
}

export function getAnimeSlug(anime: { mal_id: number; title: string; title_english?: string | null }): string {
  const rawTitle = anime.title_english || anime.title || 'anime';
  const cleanTitle = rawTitle
    .toLowerCase()
    .replace(/[\u00d7\u2715\u2716]/g, 'x')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  return `${anime.mal_id}-${cleanTitle}`;
}
