// Which subtitle track is shown by default.
// The viewer picks "English", "English SDH" or "Off" in Settings; the player then selects the best matching track
// of every episode (sources list 10+ languages and often mark a random one as their default).

export type SubDefault = 'en' | 'en-sdh' | 'off';
export const SUB_DEFAULT_KEY = 'anizoro_pref_subdefault';

export function readSubDefault(): SubDefault {
  try {
    const v = localStorage.getItem(SUB_DEFAULT_KEY);
    if (v === 'en' || v === 'en-sdh' || v === 'off') return v;
  } catch {
    /* storage unavailable */
  }
  return 'en';
}

const SDH_RE = /\bsdh\b|\bcc\b|closed[\s-]?caption|hearing[\s-]?impaired|\bdeaf\b/i;
export const isSdhLabel = (label?: string) => SDH_RE.test(label || '');

export interface SubLike {
  lang?: string;
  label?: string;
  isDefault?: boolean;
}

export function isEnglishSub(s: SubLike): boolean {
  return /^(en|eng)([-_]|$)/i.test(s.lang || '') || /\benglish\b/i.test(s.label || '');
}

/**
 * The track to show by default: English (or English SDH when chosen), never a random other language.
 * Returns null for "Off", or when there is no English track at all.
 */
export function pickDefaultSubtitle<T extends SubLike>(subs: T[], pref: SubDefault = readSubDefault()): T | null {
  if (pref === 'off') return null;
  const english = subs.filter(isEnglishSub);
  if (!english.length) return null;
  const score = (s: T) => {
    const sdh = isSdhLabel(s.label);
    const wanted = pref === 'en-sdh' ? sdh : !sdh;
    return (wanted ? 100 : 50) + (s.isDefault ? 5 : 0);
  };
  return english.reduce((best, s) => (score(s) > score(best) ? s : best), english[0]);
}
