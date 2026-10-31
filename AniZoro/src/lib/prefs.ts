/** Small typed wrapper around localStorage for viewer preferences. Never throws. */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

const PLAYER_KEY = 'anizoro_player_prefs';

export interface PlayerPrefs {
  volume: number; // 0..1
  muted: boolean;
  rate: number; // playback speed
}

const DEFAULTS: PlayerPrefs = { volume: 1, muted: false, rate: 1 };

export function readPlayerPrefs(): PlayerPrefs {
  try {
    const p = JSON.parse(readPref(PLAYER_KEY) || '{}');
    return {
      volume: typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1 ? p.volume : DEFAULTS.volume,
      muted: typeof p.muted === 'boolean' ? p.muted : DEFAULTS.muted,
      rate: typeof p.rate === 'number' && p.rate >= 0.25 && p.rate <= 4 ? p.rate : DEFAULTS.rate,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writePlayerPrefs(patch: Partial<PlayerPrefs>) {
  writePref(PLAYER_KEY, JSON.stringify({ ...readPlayerPrefs(), ...patch }));
}

export const SUB_LANG_KEY = 'anizoro_sub_lang';
