// Single source of truth for the streaming servers.
// Keys are stored in localStorage and used in URLs, so they stay stable; only the display names change.
export type StreamServerKey = 'anivexa' | 'kuhi' | 'megaplay_prime';

export interface StreamServerInfo {
  key: StreamServerKey;
  /** Name shown to viewers */
  name: string;
  /** Provider behind it (shown in tooltips) */
  provider: string;
  /** true when the server is addressed by a TMDb ID (false: MAL ID) */
  needsTmdb: boolean;
  /** 'direct': our own player fed by a self-hosted API (AniList ID), instead of a third-party iframe */
  direct?: boolean;
  /** which self-hosted API feeds a direct server */
  api?: 'anivexa' | 'kuhi';
  /** true when the server can play an English dub (the Audio switch only exists for these) */
  dub: boolean;
}

export const STREAM_SERVERS: StreamServerInfo[] = [
  // Vidstream 1 is the main server: our own player fed by the self-hosted Anivexa API
  { key: 'anivexa', name: 'Vidstream 1', provider: 'Anivexa', needsTmdb: false, direct: true, api: 'anivexa', dub: true },
  // Vidstream 2: the same player fed by the self-hosted Kuhi API
  { key: 'kuhi', name: 'Vidstream 2', provider: 'Kuhi', needsTmdb: false, direct: true, api: 'kuhi', dub: true },
  // HD 1: MegaPlay (iframe, MAL ID)
  { key: 'megaplay_prime', name: 'HD 1', provider: 'MegaPlay', needsTmdb: false, dub: true },
];

export const DEFAULT_SERVER: StreamServerKey = 'anivexa';

// One-time reset: servers were renumbered and the main server changed, so an old saved choice
// (which used to be "Vidstream 1" = MegaPlay) must not silently keep pointing at the old one.
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('anizoro_server_layout') !== '3') {
    localStorage.removeItem('anizoro_pref_server');
    localStorage.setItem('anizoro_server_layout', '3');
  }
} catch {
  /* storage unavailable */
}

export function serverSupportsDub(key: StreamServerKey): boolean {
  return STREAM_SERVERS.find((s) => s.key === key)?.dub ?? false;
}

export function isServerKey(value: unknown): value is StreamServerKey {
  return STREAM_SERVERS.some((s) => s.key === value);
}

export function serverName(key: StreamServerKey): string {
  return STREAM_SERVERS.find((s) => s.key === key)?.name ?? 'Vidstream 1';
}

/** Hosts the server pages live on (used to trust player messages and by the status check). */
export const PLAYER_HOSTS = ['megaplay.buzz'];
