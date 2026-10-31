// Everything the share sheet needs that is not UI: the link to share, the message, the per-app share URLs and a
// clipboard helper that also works where navigator.clipboard does not (plain http, some in-app browsers, iframes).

import type { JikanAnime } from '../types';
import { getAnimeSlug } from './slug';

export interface ShareTarget {
  id: 'whatsapp' | 'telegram' | 'x' | 'reddit' | 'facebook' | 'email';
  label: string;
  /** brand colour of the tile */
  color: string;
  /** short glyph shown in the tile (no brand icon pack is bundled) */
  glyph: string;
  href: (url: string, text: string, title: string) => string;
}

export const SHARE_TARGETS: ShareTarget[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: '#25d366',
    glyph: 'W',
    href: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    color: '#2aabee',
    glyph: 'T',
    href: (url, text) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: 'x',
    label: 'X',
    color: '#000000',
    glyph: '𝕏',
    href: (url, text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    color: '#ff4500',
    glyph: 'r/',
    href: (url, _text, title) => `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877f2',
    glyph: 'f',
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: 'email',
    label: 'Email',
    color: '#52525b',
    glyph: '@',
    href: (url, text, title) => `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n${url}`)}`,
  },
];

export interface ShareSubject {
  anime: JikanAnime;
  /** episode to link to; leave out for the series page */
  episode?: number | null;
  season?: number | null;
}

export function animeDisplayTitle(anime: JikanAnime): string {
  return anime.title_english || anime.title;
}

/** Absolute, canonical link. The edge function in functions/anime/[[path]].ts turns it into a rich preview. */
export function buildShareUrl({ anime, episode, season }: ShareSubject): string {
  const base = `${window.location.origin}/anime/${getAnimeSlug(anime)}`;
  return episode ? `${base}/s${season || 1}/${episode}` : base;
}

export function buildShareTitle({ anime, episode }: ShareSubject): string {
  const title = animeDisplayTitle(anime);
  return episode ? `${title} · Episode ${episode}` : title;
}

export function buildShareText({ anime, episode }: ShareSubject): string {
  const title = animeDisplayTitle(anime);
  return episode ? `Watch ${title} Episode ${episode} on AniZoro` : `Watch ${title} on AniZoro`;
}

/** "★ 8.6 · TV · 2023 · 24 eps" for the preview card. */
export function buildFacts(anime: JikanAnime): string[] {
  const facts: string[] = [];
  if (anime.score) facts.push(`★ ${anime.score.toFixed(1)}`);
  if (anime.type) facts.push(anime.type);
  const year = anime.year || (anime.aired?.from ? new Date(anime.aired.from).getFullYear() : null);
  if (year && !Number.isNaN(year)) facts.push(String(year));
  if (anime.episodes) facts.push(`${anime.episodes} ${anime.episodes === 1 ? 'ep' : 'eps'}`);
  return facts;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export const canNativeShare = (): boolean => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Opens the phone's own share sheet. Resolves false when the visitor closed it or it is unavailable. */
export async function nativeShare(data: { title: string; text: string; url: string }): Promise<boolean> {
  if (!canNativeShare()) return false;
  try {
    await navigator.share(data);
    return true;
  } catch {
    return false; // AbortError (closed the sheet) or not allowed
  }
}
