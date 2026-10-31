/**
 * Where the viewer stopped in each episode ("resume where you left off").
 * Stored in the browser only (localStorage, with an in-memory fallback), one small entry per episode.
 */
const KEY = 'anizoro_progress_v1';
const MAX_ENTRIES = 150;
const MIN_SAVE_SECONDS = 10; // do not remember the first few seconds
const FINISHED_RATIO = 0.93; // watched (nearly) to the end: start over next time
const FINISHED_TAIL_SECONDS = 60; // credits

export interface EpisodeProgress {
  /** seconds into the episode */
  t: number;
  /** episode length in seconds */
  d: number;
  /** last saved (ms since epoch) */
  u: number;
}

type Store = Record<string, EpisodeProgress>;
let memory: Store | null = null;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    memory = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    memory = memory ?? {};
  }
  return memory as Store;
}

function write(store: Store) {
  memory = store;
  try {
    const keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      keys
        .sort((a, b) => store[a].u - store[b].u)
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach((k) => delete store[k]);
    }
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage full or blocked: memory copy still works for this visit */
  }
}

export function getProgress(id: string): EpisodeProgress | null {
  const p = read()[id];
  if (!p || !(p.t > 0) || !(p.d > 0)) return null;
  return p;
}

export function clearProgress(id: string) {
  const store = read();
  if (store[id]) {
    delete store[id];
    write(store);
  }
}

export function saveProgress(id: string, t: number, d: number) {
  if (!Number.isFinite(t) || !Number.isFinite(d) || d <= 0) return;
  if (t < MIN_SAVE_SECONDS) return;
  if (t / d >= FINISHED_RATIO || d - t < FINISHED_TAIL_SECONDS) {
    clearProgress(id);
    return;
  }
  const store = read();
  store[id] = { t: Math.floor(t), d: Math.floor(d), u: Date.now() };
  write(store);
}

/** Fraction watched (0..1) of an episode, for progress bars. */
export function getProgressRatio(id: string): number {
  const p = getProgress(id);
  return p ? Math.min(1, p.t / p.d) : 0;
}

export function clearAllProgress() {
  memory = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function formatResumeTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
