// Client for the self-hosted Anivexa API.
// The API always answers with JSON (even for the video links), so everything the player needs
// (stream URLs, subtitles, intro/outro times, required headers) is pulled out of that JSON by
// `extractMedia`, which does not depend on one fixed response shape.

const envBase = (import.meta as any)?.env?.VITE_ANIVEXA_BASE as string | undefined;
export const ANIVEXA_BASE = (envBase || 'https://anivexa-api-pi.vercel.app').replace(/\/+$/, '');

// Kuhi: the second self-hosted API (https://kuhi-api.vercel.app). It feeds Vidstream 2; Anivexa feeds Vidstream 1.
// Set VITE_KUHI_BASE to point it somewhere else.
const envKuhi = (import.meta as any)?.env?.VITE_KUHI_BASE as string | undefined;
export const KUHI_BASE = (envKuhi || 'https://kuhi-api.vercel.app').replace(/\/+$/, '');

export interface AnivexaProvider {
  id: string;
  name: string;
}

// Order = default priority for "Auto" (the last provider that worked is tried first).
export const ANIVEXA_PROVIDERS: AnivexaProvider[] = [
  { id: 'mkissa', name: 'MKissa' },
  { id: 'reanime', name: 'ReAnime' },
  { id: 'anikoto', name: 'Anikoto' },
  { id: 'animegg', name: 'AnimeGG' },
  { id: 'animenosub', name: 'AnimeNoSub' },
  { id: 'anizone', name: 'AniZone' },
  { id: 'aniwaves', name: 'AniWaves' },
  { id: 'senshi', name: 'Senshi' },
  { id: 'kaa', name: 'KAA' },
  { id: 'animedunya', name: 'AnimeDunya' },
  { id: 'animeonsen', name: 'AnimeOnsen' },
  { id: 'anipm', name: 'AniPM' },
];

/** Which self-hosted API a provider list belongs to: Vidstream 1 asks Anivexa, Vidstream 2 asks Kuhi. */
export type ApiSource = 'anivexa' | 'kuhi';

/** Providers Kuhi knows (its own list, in its own default order). */
export const KUHI_PROVIDERS: AnivexaProvider[] = [
  { id: 'anikoto', name: 'Anikoto' },
  { id: 'anizone', name: 'AniZone' },
  { id: 'reanime', name: 'ReAnime' },
  { id: 'aniwaves', name: 'AniWaves' },
  { id: 'kaa', name: 'KAA' },
  { id: 'mkissa', name: 'MKissa' },
  { id: 'animegg', name: 'AnimeGG' },
  { id: 'animeonsen', name: 'AnimeOnsen' },
  { id: 'anineko', name: 'AniNeko' },
  { id: 'anibd', name: 'AniBD' },
];

export const providersFor = (source: ApiSource): AnivexaProvider[] => (source === 'kuhi' ? KUHI_PROVIDERS : ANIVEXA_PROVIDERS);

export function providerName(id: string): string {
  return ANIVEXA_PROVIDERS.find((p) => p.id === id)?.name ?? KUHI_PROVIDERS.find((p) => p.id === id)?.name ?? id;
}

export type SourceKind = 'hls' | 'file' | 'embed' | 'weak-embed';

export interface MediaSource {
  url: string;
  kind: SourceKind;
  label?: string;
  /** vertical resolution when known (1080, 720, ...) */
  quality?: number;
  /** headers the CDN wants (Referer / Origin). Browsers cannot send these, so such sources go through /api/proxy */
  headers?: Record<string, string>;
}

export interface MediaSubtitle {
  url: string;
  label: string;
  lang?: string;
  isDefault?: boolean;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface ExtractedMedia {
  sources: MediaSource[];
  subtitles: MediaSubtitle[];
  intro?: TimeRange;
  outro?: TimeRange;
}

// ---------------------------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------------------------

/** Every URL worth trying for one provider / episode, best first. */
export function buildWatchUrls(provider: string, anilistId: number, lang: 'sub' | 'dub', episode: number): string[] {
  const urls = [`${ANIVEXA_BASE}/watch/${provider}/${anilistId}/${lang}/${provider}-${episode}`];
  if (provider === 'reanime') urls.push(`${ANIVEXA_BASE}/stream/reanime/${anilistId}/${lang}/${episode}`);
  return urls;
}

// ---------------------------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------------------------

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp)(\?|#|$)/i;
const SUB_EXT = /\.(vtt|srt|ass|ssa)(\?|#|$)/i;
const FILE_EXT = /\.(mp4|m4v|webm|mkv|mov)(\?|#|$)/i;
const HLS_EXT = /\.m3u8(\?|#|&|$)/i;
const SEGMENT_EXT = /\.(ts|m4s|aac|key)(\?|#|$)/i;

const EMBED_KEYS = /^(embed|embed_?url|iframe|iframe_?url|player|player_?url)$/i;
const GENERIC_URL_KEYS = /^(url|file|src|link|stream|source|href|video|video_?url|stream_?url|playlist|m3u8|hls|sources?)$/i;
const SUB_CONTEXT_KEYS = /^(subtitles?|tracks?|captions?|subs|text_?tracks?)$/i;
const HEADER_CONTEXT_KEYS = /^(headers?|http_?headers?|request_?headers?)$/i;

const MAX_DEPTH = 10;
const MAX_NODES = 6000;

interface Ctx {
  headers?: Record<string, string>;
  label?: string;
  quality?: number;
  inSubs?: boolean;
  subLang?: string;
  subDefault?: boolean;
  key?: string;
}

function cleanUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  if (s.startsWith('//')) s = 'https:' + s;
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}

function decodedForTests(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function parseQuality(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (v == null) continue;
    if (typeof v === 'number' && v >= 144 && v <= 4320) return v;
    const m = String(v).match(/(\d{3,4})\s*p?/i);
    if (m) {
      const n = Number(m[1]);
      if (n >= 144 && n <= 4320) return n;
    }
  }
  return undefined;
}

function toSeconds(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function readRange(v: any): TimeRange | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const start = toSeconds(v.start ?? v.begin ?? v.from);
  const end = toSeconds(v.end ?? v.stop ?? v.to);
  if (start == null || end == null || end <= start) return undefined;
  // a range of 0-0 is how many APIs say "none"
  return { start, end };
}

function normaliseHeaders(obj: any): Record<string, string> | undefined {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'string' || !v) continue;
    const name = k.toLowerCase();
    if (name === 'referer' || name === 'referrer') out.referer = v;
    else if (name === 'origin') out.origin = v;
    else if (name === 'user-agent') out['user-agent'] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

/**
 * Walks any JSON value and collects playable sources, subtitles and intro/outro markers.
 * Accepts objects, arrays, JSON strings inside JSON, and plain text that contains URLs.
 */
export function extractMedia(input: unknown): ExtractedMedia {
  const sources = new Map<string, MediaSource>();
  const subtitles = new Map<string, MediaSubtitle>();
  let intro: TimeRange | undefined;
  let outro: TimeRange | undefined;
  let nodes = 0;

  const addSource = (url: string, kind: SourceKind, ctx: Ctx, extra?: Partial<MediaSource>) => {
    const prev = sources.get(url);
    const next: MediaSource = {
      url,
      kind,
      label: ctx.label,
      quality: ctx.quality,
      headers: ctx.headers,
      ...extra,
    };
    if (!prev) sources.set(url, next);
    else {
      // keep the richer record
      sources.set(url, { ...prev, label: prev.label ?? next.label, quality: prev.quality ?? next.quality, headers: prev.headers ?? next.headers });
    }
  };

  const classifyUrl = (url: string, ctx: Ctx) => {
    const probe = decodedForTests(url);
    const key = ctx.key || '';

    if (SUB_EXT.test(probe) || SUB_EXT.test(url)) {
      if (/thumbnail|sprite|storyboard/i.test(probe) || /thumb/i.test(ctx.label || '')) return;
      if (!subtitles.has(url)) {
        subtitles.set(url, {
          url,
          label: ctx.label || ctx.subLang || 'Subtitles',
          lang: ctx.subLang,
          isDefault: ctx.subDefault,
        });
      }
      return;
    }
    if (IMAGE_EXT.test(probe) && !HLS_EXT.test(probe)) return;
    if (SEGMENT_EXT.test(probe) && !HLS_EXT.test(probe)) return;

    if (HLS_EXT.test(probe) || /(^|[?&])type=m3u8(&|$)/i.test(probe)) {
      addSource(url, 'hls', ctx);
      return;
    }
    if (FILE_EXT.test(probe)) {
      addSource(url, 'file', ctx);
      return;
    }
    if (ctx.inSubs) {
      // a track whose file has no known extension: still a subtitle if it sits under a subtitle key
      if (!subtitles.has(url)) subtitles.set(url, { url, label: ctx.label || ctx.subLang || 'Subtitles', lang: ctx.subLang, isDefault: ctx.subDefault });
      return;
    }
    if (EMBED_KEYS.test(key)) {
      addSource(url, 'embed', ctx);
      return;
    }
    if (GENERIC_URL_KEYS.test(key)) {
      addSource(url, 'weak-embed', ctx);
    }
  };

  const visitString = (str: string, ctx: Ctx) => {
    const s = str.trim();
    if (!s) return;
    if (looksLikeJson(s)) {
      try {
        visit(JSON.parse(s), ctx, 1);
        return;
      } catch {
        /* not JSON after all */
      }
    }
    const single = cleanUrl(s);
    if (single && !/\s/.test(s)) {
      classifyUrl(single, ctx);
      return;
    }
    // free text (an m3u8 playlist body, an HTML snippet, ...): pull every URL out of it
    const found = s.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').match(/https?:\/\/[^\s"'<>\\)]+/gi);
    if (found) {
      for (const f of found) {
        const u = cleanUrl(f);
        if (u) classifyUrl(u, { ...ctx, key: /<iframe/i.test(s) ? 'iframe' : ctx.key });
      }
    }
  };

  const visit = (node: any, parent: Ctx, depth: number) => {
    if (node == null || depth > MAX_DEPTH || ++nodes > MAX_NODES) return;

    if (typeof node === 'string') {
      visitString(node, parent);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, parent, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;

    // markers
    if (node.intro && !intro) intro = readRange(node.intro);
    if (node.outro && !outro) outro = readRange(node.outro);
    if (node.opening && !intro) intro = readRange(node.opening);
    if (node.ending && !outro) outro = readRange(node.ending);

    // context carried down to the URLs found in this object
    const ctx: Ctx = { ...parent };
    const label = [node.label, node.name, node.title, node.server, node.quality, node.resolution].find(
      (v) => typeof v === 'string' && v && !/^https?:/i.test(v)
    ) as string | undefined;
    if (label) ctx.label = label;
    const q = parseQuality(node.quality, node.resolution, node.height, node.label, node.name);
    if (q) ctx.quality = q;
    if (typeof node.lang === 'string' || typeof node.language === 'string') ctx.subLang = (node.lang || node.language) as string;
    if (node.default === true || node.isDefault === true) ctx.subDefault = true;
    if (typeof node.kind === 'string' && /thumbnail/i.test(node.kind)) return;

    for (const [key, value] of Object.entries(node)) {
      if (HEADER_CONTEXT_KEYS.test(key)) {
        const h = normaliseHeaders(value);
        if (h) ctx.headers = { ...(ctx.headers || {}), ...h };
      }
    }
    const direct = normaliseHeaders({ referer: node.referer ?? node.referrer, origin: node.origin });
    if (direct) ctx.headers = { ...(ctx.headers || {}), ...direct };

    for (const [key, value] of Object.entries(node)) {
      if (HEADER_CONTEXT_KEYS.test(key)) continue;
      if (key === 'intro' || key === 'outro' || key === 'opening' || key === 'ending') continue;
      const childCtx: Ctx = { ...ctx, key };
      if (SUB_CONTEXT_KEYS.test(key)) childCtx.inSubs = true;
      visit(value, childCtx, depth + 1);
    }
  };

  // plain-text responses (not JSON) are still searched for URLs
  if (typeof input === 'string' && !looksLikeJson(input)) {
    visitString(input, { key: 'url' });
  } else {
    visit(typeof input === 'string' ? safeParse(input) : input, {}, 0);
  }

  const rank: Record<SourceKind, number> = { hls: 0, file: 1, embed: 2, 'weak-embed': 3 };
  const ordered = [...sources.values()].sort((a, b) => {
    if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind];
    // within a kind: master playlists (no quality) first, then the highest quality
    return (b.quality ?? 99999) - (a.quality ?? 99999);
  });

  // English first, then the order the API gave
  const subs = [...subtitles.values()];
  const isEn = (s: MediaSubtitle) => /^(en|eng|english)/i.test(s.lang || '') || /english/i.test(s.label);
  if (!subs.some((s) => s.isDefault) && subs.length) {
    const en = subs.find(isEn);
    if (en) en.isDefault = true;
  }
  subs.sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)));

  return { sources: ordered, subtitles: subs, intro, outro };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** A short human-readable reason pulled out of an error-looking JSON body. */
export function describeFailure(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const o = json as Record<string, unknown>;
  const msg = [o.error, o.message, o.detail, o.reason].find((v) => typeof v === 'string' && v) as string | undefined;
  return msg ? msg.slice(0, 160) : undefined;
}

// ---------------------------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------------------------

export interface ResolvedStream extends ExtractedMedia {
  provider: string;
  apiUrl: string;
}

/**
 * An API that says plainly "no dub" for this episode ("dub not available", "no dub found", hasDub: false ...).
 * That is a real answer, not a failure: nothing is wrong with the provider, the episode just has no dub.
 */
const NO_DUB_RE =
  /\b(no|without|missing)\s+(english\s+)?dub|dub(bed)?\W{0,16}(is\s+|are\s+)?(currently\s+)?(not\s+(yet\s+)?(available|found|exist\w*|released)|unavailable|missing|n\/a)|(not\s+(available|found)|unavailable)\W{0,16}(in\s+|for\s+)?(the\s+)?dub/i;

export function saysNoDub(body: unknown): boolean {
  if (body == null) return false;
  if (typeof body === 'string') return NO_DUB_RE.test(body.slice(0, 2000));
  if (typeof body !== 'object') return false;
  const o = body as Record<string, any>;
  if (o.hasDub === false || o.dub === false || o.dubAvailable === false || o.dub_available === false) return true;
  const kinds = o.availableTypes ?? o.available ?? o.types ?? o.audios ?? o.audio_types;
  if (Array.isArray(kinds) && kinds.length && kinds.every((k) => typeof k === 'string') && !kinds.some((k: string) => /dub/i.test(k))) return true;
  const msg = [o.error, o.message, o.detail, o.reason, o.status].filter((v) => typeof v === 'string').join(' ');
  return NO_DUB_RE.test(msg);
}

export class AnivexaError extends Error {
  provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.provider = provider;
  }
}

function combineSignals(a: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  const onAbort = () => controller.abort();
  if (a) {
    if (a.aborted) controller.abort();
    else a.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      a?.removeEventListener('abort', onAbort);
    },
  };
}

const debug = (...args: unknown[]) => {
  try {
    if (localStorage.getItem('anizoro_debug') === '1') console.info('[Anivexa]', ...args);
  } catch {
    /* ignore */
  }
};


// ---------------------------------------------------------------------------------------------
// Kuhi
// ---------------------------------------------------------------------------------------------

export function buildKuhiUrl(provider: string, anilistId: number, lang: 'sub' | 'dub', episode: number): string {
  const q = new URLSearchParams({ e: String(episode), provider, type: lang });
  return `${KUHI_BASE}/anime/extract/${anilistId}?${q.toString()}`;
}

/** Kuhi answers { streams: [{ url, type: hls|mp4|embed, referer, audio, subtitles, intro, outro, priority, isActive }], subtitles: [] }. */
export function kuhiToMedia(body: any, lang: 'sub' | 'dub'): ExtractedMedia {
  const out: ExtractedMedia = { sources: [], subtitles: [] };
  const list: any[] = Array.isArray(body?.streams) ? body.streams : [];
  const usable = list
    .filter((st) => st && typeof st.url === 'string' && (st.type === 'hls' || st.type === 'mp4'))
    .filter((st) => !st.audio || st.audio === lang)
    // streams that came with subtitles and are marked active first, direct files (which cannot send a Referer) last
    .sort((a, b) => {
      const score = (x: any) => (x.type === 'hls' ? 100 : 0) + (x.isActive ? 20 : 0) + (x.subtitles?.length ? 5 : 0) + (Number(x.priority) || 0);
      return score(b) - score(a);
    });

  const seen = new Set<string>();
  for (const st of usable) {
    const url = cleanUrl(st.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const referer = typeof st.referer === 'string' && st.referer ? st.referer : undefined;
    out.sources.push({
      url,
      kind: st.type === 'hls' ? 'hls' : 'file',
      label: typeof st.server === 'string' ? st.server : undefined,
      headers: referer ? { referer } : undefined,
    });
    if (!out.intro) out.intro = readRange(st.intro);
    if (!out.outro) out.outro = readRange(st.outro);
  }

  const subs: any[] = [...(Array.isArray(body?.subtitles) ? body.subtitles : []), ...usable.flatMap((st) => (Array.isArray(st.subtitles) ? st.subtitles : []))];
  const seenSub = new Set<string>();
  for (const sub of subs) {
    const url = typeof sub?.url === 'string' ? cleanUrl(sub.url) : null;
    // thumbnails.vtt is the seek-bar preview sheet, not a subtitle
    if (!url || seenSub.has(url) || /thumbnails?\.vtt/i.test(url) || /\/preview\//i.test(url)) continue;
    seenSub.add(url);
    out.subtitles.push({ url, label: sub.label || sub.srclang || 'Subtitles', lang: sub.srclang || sub.lang, isDefault: Boolean(sub.default) });
  }
  return out;
}

async function fetchKuhiRaw(
  provider: string,
  anilistId: number,
  lang: 'sub' | 'dub',
  episode: number,
  signal: AbortSignal | undefined,
  timeoutMs: number
): Promise<ExtractedMedia> {
  const url = buildKuhiUrl(provider, anilistId, lang, episode);
  const t = combineSignals(signal, timeoutMs);
  try {
    let res: Response | null = null;
    // a network hiccup is retried once (first the plain request, then through the site's own proxy: CORS)
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      try {
        res = await fetch(attempt === 1 ? proxiedUrl(url) : url, { signal: t.signal, headers: { accept: 'application/json' } });
      } catch (err: any) {
        if (t.signal.aborted) throw err;
        if (attempt === 2) throw err;
        if (attempt === 1) await new Promise((r) => setTimeout(r, 350));
      }
    }
    const text = await res!.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    debug('kuhi:' + provider, res!.status, url, body);
    if (lang === 'dub' && saysNoDub(body ?? text)) throw new AnivexaError(provider, 'no dub');
    if (!body) throw new AnivexaError(provider, res!.ok ? 'no stream found' : `HTTP ${res!.status}`);
    // asked for a dub but got the sub back (the server ignored the language): not a dub
    if (lang === 'dub' && typeof body.type === 'string' && body.type !== 'dub') throw new AnivexaError(provider, 'no dub');
    const media = kuhiToMedia(body, lang);
    if (!media.sources.length) throw new AnivexaError(provider, describeFailure(body) || 'no stream found');
    return media;
  } finally {
    t.done();
  }
}

// "This provider has nothing for this episode" is remembered for 10 minutes, so it is not asked again (each ask is a scraper run)
const kuhiMiss = new Map<string, number>();
const KUHI_MISS_MS = 10 * 60 * 1000;

async function fetchKuhi(
  provider: string,
  anilistId: number,
  lang: 'sub' | 'dub',
  episode: number,
  signal: AbortSignal | undefined,
  timeoutMs: number
): Promise<ExtractedMedia> {
  const key = `${provider}|${anilistId}|${lang}|${episode}`;
  const until = kuhiMiss.get(key);
  if (until && until > Date.now()) throw new AnivexaError(provider, lang === 'dub' ? 'no dub' : 'no stream found');
  try {
    return await fetchKuhiRaw(provider, anilistId, lang, episode, signal, timeoutMs);
  } catch (err: any) {
    if (err instanceof AnivexaError && (err.message === 'no dub' || err.message === 'no stream found' || err.message === 'HTTP 404')) {
      kuhiMiss.set(key, Date.now() + KUHI_MISS_MS);
    }
    throw err;
  }
}

/** Asks one provider for one episode. Resolves with playable sources or throws AnivexaError. */
export async function resolveFromProvider(
  provider: string,
  anilistId: number,
  lang: 'sub' | 'dub',
  episode: number,
  signal?: AbortSignal,
  timeoutMs = 14000,
  source: ApiSource = 'anivexa'
): Promise<ResolvedStream> {
  let lastReason = 'no stream found';
  if (source === 'kuhi') {
    try {
      const media = await fetchKuhi(provider, anilistId, lang, episode, signal, timeoutMs);
      return { ...media, provider, apiUrl: buildKuhiUrl(provider, anilistId, lang, episode) };
    } catch (err: any) {
      if (signal?.aborted) throw err;
      if (err instanceof AnivexaError) throw err;
      throw new AnivexaError(provider, err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timed out' : 'unreachable');
    }
  }
  for (const apiUrl of buildWatchUrls(provider, anilistId, lang, episode)) {
    const t = combineSignals(signal, timeoutMs);
    try {
      let res: Response;
      try {
        res = await fetch(apiUrl, { signal: t.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
      } catch (e: any) {
        if (t.signal.aborted) throw e;
        await new Promise((r) => setTimeout(r, 350)); // one quick retry for a network hiccup
        res = await fetch(apiUrl, { signal: t.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
      }
      const text = await res.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* plain text: extractMedia handles it */
      }
      debug(provider, res.status, apiUrl, body);
      if (lang === 'dub' && saysNoDub(body)) {
        lastReason = 'no dub';
        break; // the other URL of this provider says the same
      }
      const extracted = extractMedia(body);
      // Only real streams are played. Embed pages are ignored: they bring their own player, ads and no controls we own.
      const media = { ...extracted, sources: extracted.sources.filter((src) => src.kind === 'hls' || src.kind === 'file') };
      if (media.sources.length) return { ...media, provider, apiUrl };
      lastReason =
        describeFailure(body) ||
        (extracted.sources.length ? 'only an embed page' : res.ok ? 'no stream found' : `HTTP ${res.status}`);
    } catch (err: any) {
      if (signal?.aborted) throw err;
      lastReason = err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timed out' : 'unreachable';
      debug(provider, 'failed', apiUrl, err);
    } finally {
      t.done();
    }
  }
  throw new AnivexaError(provider, lastReason);
}

/**
 * "Auto" mode: asks providers a few at a time and returns the first one that has playable sources.
 * `order` is the priority; `skip` holds providers that already failed for this episode.
 */
export async function resolveFirstAvailable(
  order: string[],
  skip: Set<string>,
  anilistId: number,
  lang: 'sub' | 'dub',
  episode: number,
  signal?: AbortSignal,
  concurrency = 3,
  source: ApiSource = 'anivexa'
): Promise<{ stream: ResolvedStream | null; failures: Record<string, string> }> {
  const queue = order.filter((p) => !skip.has(p));
  const failures: Record<string, string> = {};
  // Kuhi runs a scraper per request: never ask more than two providers at the same time
  if (source === 'kuhi') concurrency = Math.min(concurrency, 2);

  while (queue.length) {
    if (signal?.aborted) return { stream: null, failures };
    const batch = queue.splice(0, concurrency);
    const inner = new AbortController();
    const onOuterAbort = () => inner.abort();
    signal?.addEventListener('abort', onOuterAbort, { once: true });

    try {
      const winner = await new Promise<ResolvedStream | null>((resolve) => {
        let pending = batch.length;
        let settled = false;
        // results are collected so an earlier (higher priority) provider wins ties that arrive together
        for (const provider of batch) {
          resolveFromProvider(provider, anilistId, lang, episode, inner.signal, 14000, source)
            .then((stream) => {
              if (settled) return;
              settled = true;
              resolve(stream);
              inner.abort();
            })
            .catch((err) => {
              // a provider cancelled because another one already won did not fail: it can still be tried later
              if (!inner.signal.aborted) {
                failures[provider] = err instanceof AnivexaError ? err.message : 'failed';
                skip.add(provider);
              }
              if (--pending === 0 && !settled) {
                settled = true;
                resolve(null);
              }
            });
        }
      });
      if (winner) return { stream: winner, failures };
    } finally {
      signal?.removeEventListener('abort', onOuterAbort);
    }
  }
  return { stream: null, failures };
}

// ---------------------------------------------------------------------------------------------
// Playback helpers
// ---------------------------------------------------------------------------------------------

/** Same-origin fallback that adds the headers a CDN wants and CORS. Only exists when deployed (see api/proxy.ts). */
export function proxiedUrl(url: string, headers?: Record<string, string>): string {
  const params = new URLSearchParams({ url });
  if (headers?.referer) params.set('ref', headers.referer);
  return `/api/proxy?${params.toString()}`;
}

/** SRT -> WebVTT, so .srt subtitle files can be used as <track>. */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r+/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + body.trim() + '\n';
}

/** ASS/SSA -> WebVTT (text and timing only: styling and positioning are dropped). */
export function assToVtt(ass: string): string {
  const time = (t: string) => {
    const m = t.trim().match(/^(\d+):(\d{2}):(\d{2})[.,](\d{1,3})$/);
    if (!m) return '00:00:00.000';
    return `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}.${m[4].padEnd(3, '0').slice(0, 3)}`;
  };
  let startIdx = 1;
  let endIdx = 2;
  let textIdx = 9;
  const cues: string[] = [];
  for (const line of ass.replace(/\r/g, '').split('\n')) {
    if (/^Format:/i.test(line) && /start/i.test(line) && /text/i.test(line)) {
      const cols = line.slice(7).split(',').map((c) => c.trim().toLowerCase());
      startIdx = cols.indexOf('start');
      endIdx = cols.indexOf('end');
      textIdx = cols.indexOf('text');
      continue;
    }
    if (!/^Dialogue:/i.test(line)) continue;
    const parts = line.slice(9).split(',');
    const text = parts
      .slice(textIdx)
      .join(',')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\N/gi, '\n')
      .replace(/\\h/g, ' ')
      .trim();
    if (!text) continue;
    cues.push(`${time(parts[startIdx])} --> ${time(parts[endIdx])}\n${text}`);
  }
  return 'WEBVTT\n\n' + cues.join('\n\n') + '\n';
}

/** "en" -> "English" (falls back to the code). */
export function languageName(code?: string): string | undefined {
  if (!code) return undefined;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code.replace('_', '-'));
    if (name && name.toLowerCase() !== code.toLowerCase()) return name;
  } catch {
    /* unknown code */
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------------------------

const LAST_KEY = 'anizoro_anivexa_last';
export const PROVIDER_PREF_KEY = 'anizoro_pref_provider';

export function rememberWorkingProvider(id: string, source: ApiSource = 'anivexa') {
  try {
    localStorage.setItem(`${LAST_KEY}_${source}`, id);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Providers that are always asked first. Nothing else is tried while one of these has a stream that plays;
 * the rest are only used once every provider in this list has failed or has no stream.
 * To add one, put its id (one of the ids above) here.
 */
export const PRIORITY_PROVIDERS: string[] = ['anikoto'];

/** Auto mode order as tiers: the priority providers, then everyone else (last one that worked first). */
export function autoTiers(source: ApiSource = 'anivexa'): string[][] {
  const known = providersFor(source).map((p) => p.id);
  const top = PRIORITY_PROVIDERS.filter((id) => known.includes(id));
  const rest = autoOrder(source).filter((id) => !top.includes(id));
  return [top, rest].filter((t) => t.length > 0);
}

/** Providers in the order Auto should try them: the last one that worked first. */
export function autoOrder(source: ApiSource = 'anivexa'): string[] {
  const ids = providersFor(source).map((p) => p.id);
  try {
    const last = localStorage.getItem(`${LAST_KEY}_${source}`);
    if (last && ids.includes(last)) return [last, ...ids.filter((i) => i !== last)];
  } catch {
    /* ignore */
  }
  return ids;
}

export function readProviderPref(): string {
  try {
    const v = localStorage.getItem(PROVIDER_PREF_KEY);
    if (v === 'auto' || ANIVEXA_PROVIDERS.some((p) => p.id === v)) return v as string;
  } catch {
    /* ignore */
  }
  return 'auto';
}
