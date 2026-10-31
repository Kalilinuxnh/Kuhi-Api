import { TrackedAnime, RecentWatch, UserProfile } from '../types';
import { clearAllProgress } from './progress';

// Safe In-Memory and LocalStorage Polyfill for restricted cross-origin iframes
const memoryStore: Record<string, string> = {};

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) return val;
    } catch (e) {
      console.warn(`localStorage read disabled for key "${key}". Utilizing memory storage.`);
    }
    return memoryStore[key] || null;
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`localStorage write disabled for key "${key}". Saving in memory.`);
    }
    memoryStore[key] = value;
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`localStorage delete disabled for key "${key}". Clearing from memory.`);
    }
    delete memoryStore[key];
  }
};

// Clears cookies on a full reset
export const deleteAllCookies = () => {
  try {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
      if (name) {
        document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax`;
        document.cookie = `${name}=; Path=/; Domain=${window.location.hostname}; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax`;
        document.cookie = `${name}=; Path=/; Domain=.${window.location.hostname}; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax`;
        document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax`;
      }
    }
  } catch (e) {
    console.warn('Error clearing cookies:', e);
  }

  // Clear cookie fallbacks in storage
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('cookie_fallback_') || key.startsWith('anime_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => safeLocalStorage.removeItem(k));
  } catch (e) {}

  Object.keys(memoryStore).forEach((key) => {
    if (key.startsWith('cookie_fallback_') || key.startsWith('anime_')) {
      delete memoryStore[key];
    }
  });
};

// LocalStorage Persistence Keys
const TRACKER_LIST_KEY = 'anime_tracker_list';
const RECENT_WATCH_KEY = 'anime_recent_watch';
const PROFILE_KEY = 'anime_user_profile';
const SEARCH_HISTORY_KEY = 'anime_search_history';

export const storageService = {
  // Tracker operations
  getTrackerList: (): TrackedAnime[] => {
    try {
      const list = safeLocalStorage.getItem(TRACKER_LIST_KEY);
      const parsed: TrackedAnime[] = list ? JSON.parse(list) : [];
      return parsed.filter(
        (item, idx, self) => self.findIndex((x) => x.mal_id === item.mal_id) === idx
      );
    } catch (_) {
      return [];
    }
  },

  saveTrackerList: (list: TrackedAnime[]) => {
    try {
      safeLocalStorage.setItem(TRACKER_LIST_KEY, JSON.stringify(list));
    } catch (_) {}
  },

  updateTrackerItem: (item: TrackedAnime) => {
    const list = storageService.getTrackerList();
    const index = list.findIndex((x) => x.mal_id === item.mal_id);
    if (index > -1) {
      list[index] = item;
    } else {
      list.push(item);
    }
    storageService.saveTrackerList(list);
  },

  removeTrackerItem: (malId: number) => {
    const list = storageService.getTrackerList();
    const filtered = list.filter((x) => x.mal_id !== malId);
    storageService.saveTrackerList(filtered);
  },

  // Recently watched operations
  getRecentWatchList: (): RecentWatch[] => {
    try {
      const list = safeLocalStorage.getItem(RECENT_WATCH_KEY);
      const parsed: RecentWatch[] = list ? JSON.parse(list) : [];
      // Deduplicate by mal_id preserving the latest entry
      const map = new Map<number, RecentWatch>();
      for (const item of parsed) {
        if (!map.has(item.mal_id)) {
          map.set(item.mal_id, item);
        }
      }
      return Array.from(map.values());
    } catch (_) {
      return [];
    }
  },

  saveRecentWatchList: (list: RecentWatch[]) => {
    try {
      safeLocalStorage.setItem(RECENT_WATCH_KEY, JSON.stringify(list));
    } catch (_) {}
  },

  addRecentWatch: (watch: RecentWatch) => {
    let list = storageService.getRecentWatchList();
    // Remove previous watch entries for the same anime so each anime appears at most once
    list = list.filter((x) => x.mal_id !== watch.mal_id);
    // Prepend to show most recent first
    list.unshift(watch);
    // Keep top 20
    if (list.length > 20) {
      list = list.slice(0, 20);
    }
    storageService.saveRecentWatchList(list);
  },

  removeRecentWatch: (malId: number) => {
    const list = storageService.getRecentWatchList();
    const filtered = list.filter((x) => x.mal_id !== malId);
    storageService.saveRecentWatchList(filtered);
  },

  clearRecentWatches: () => {
    safeLocalStorage.removeItem(RECENT_WATCH_KEY);
  },

  // Profile operations
  getProfile: (): UserProfile | null => {
    try {
      const p = safeLocalStorage.getItem(PROFILE_KEY);
      return p ? JSON.parse(p) : null;
    } catch (_) {
      return null;
    }
  },

  saveProfile: (p: UserProfile) => {
    try {
      safeLocalStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    } catch (_) {}
  },

  // Search history operations
  getSearchHistory: (): string[] => {
    try {
      const list = safeLocalStorage.getItem(SEARCH_HISTORY_KEY);
      return list ? JSON.parse(list) : [];
    } catch (e) {
      return [];
    }
  },

  saveSearchHistory: (list: string[]) => {
    try {
      safeLocalStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list));
    } catch (e) {}
  },

  addSearchQuery: (queryText: string) => {
    const q = queryText.trim();
    if (!q) return;
    let list = storageService.getSearchHistory();
    list = list.filter((x) => x.toLowerCase() !== q.toLowerCase());
    list.unshift(q);
    if (list.length > 5) {
      list = list.slice(0, 5);
    }
    storageService.saveSearchHistory(list);
  },

  clearAllData: () => {
    safeLocalStorage.removeItem(TRACKER_LIST_KEY);
    safeLocalStorage.removeItem(RECENT_WATCH_KEY);
    safeLocalStorage.removeItem(PROFILE_KEY);
    safeLocalStorage.removeItem(SEARCH_HISTORY_KEY);
    clearAllProgress();
    deleteAllCookies();
    try {
      sessionStorage.clear();
    } catch (e) {}
  },
};
