import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BrandLoader from './BrandLoader';
import {
  ResolvedStream,
  MediaSource,
  MediaSubtitle,
  autoTiers,
  type ApiSource,
  PRIORITY_PROVIDERS,
  assToVtt,
  languageName,
  proxiedUrl,
  rememberWorkingProvider,
  resolveFirstAvailable,
  srtToVtt,
} from '../lib/anivexa';
import type { StageTrack } from './VjsStage';
import { formatResumeTime, getProgress } from '../lib/progress';
import { isEnglishSub, pickDefaultSubtitle } from '../lib/subtitles';

// Video.js v10 is only downloaded when Vidstream 1 is actually used.
// The download starts as soon as DirectPlayer mounts, in parallel with looking up the stream, instead of after it.
const loadStage = () => import('./VjsStage');
const VjsStage = lazy(loadStage);

// Download the player code while the browser is idle, so the first episode starts without waiting for it
// (skipped on data saver / very slow connections).
if (typeof window !== 'undefined') {
  const conn = (navigator as any).connection;
  const thrifty = Boolean(conn?.saveData) || /(^|-)2g$|3g/.test(conn?.effectiveType || '');
  if (!thrifty) {
    const idle: (cb: () => void) => void = (window as any).requestIdleCallback
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 4000 })
      : (cb) => setTimeout(cb, 2500);
    idle(() => void loadStage());
  }
}

// Streams found ahead of time for the next episode (links expire, so they are only kept for a few minutes)
const PREFETCH_TTL_MS = 8 * 60 * 1000;
const prefetched = new Map<string, { stream: ResolvedStream; at: number }>();
const prefetchKey = (source: string, id: number, lang: string, ep: number) => `${source}:${id}:${lang}:${ep}`;
function takePrefetched(source: string, id: number, lang: string, ep: number, tried: Set<string>): ResolvedStream | null {
  const key = prefetchKey(source, id, lang, ep);
  const hit = prefetched.get(key);
  prefetched.delete(key);
  if (!hit || Date.now() - hit.at > PREFETCH_TTL_MS || tried.has(hit.stream.provider)) return null;
  return hit.stream;
}

export type DirectProblemKind = 'unavailable' | 'timeout' | 'unreachable';

interface DirectPlayerProps {
  /** undefined: still looking the id up, null: no AniList id exists for this title */
  anilistId: number | null | undefined;
  /** which self-hosted API feeds this player (Vidstream 1: anivexa, Vidstream 2: kuhi) */
  source?: ApiSource;
  /** other (AniList id, episode) pairs to try when the main one finds nothing (split-cour shows list parts differently per source) */
  alternates?: { anilistId: number; episode: number }[];
  episode: number;
  /** remembers the playhead for this episode between visits (e.g. "21:1:5") */
  progressId?: string;
  lang: 'sub' | 'dub';
  autoPlay: boolean;
  autoSkip: boolean;
  title: string;
  onPlaying: () => void;
  onEnded: () => void;
  onProblem: (kind: DirectProblemKind, detail?: string) => void;
  onNotice?: (message: string) => void;
  /** dub was asked for and no source has it (not a network problem): the page falls back to sub */
  onDubMissing?: () => void;
}

type Phase = 'lookup' | 'resolving' | 'playing' | 'failed';
type Variant = 'direct' | 'proxy';

const IS_DEV = Boolean((import.meta as any)?.env?.DEV);
const START_TIMEOUT_MS = 25000;
const MAX_SUBS = 10; // subtitle languages loaded per episode
const SUB_BATCH = 3; // fetched at a time after the first ones

function firstVariant(src: MediaSource): Variant {
  // a stream that needs a Referer/Origin can only work through the proxy (HLS only: files are too large for it)
  return src.kind === 'hls' && src.headers && !IS_DEV ? 'proxy' : 'direct';
}

/** If the player library itself crashes, report it like any other failed stream instead of a blank screen. */
class StageBoundary extends React.Component<{ onCrash: (msg: string) => void; children: React.ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onCrash(error instanceof Error ? error.message : 'player failed to start');
  }
  render() {
    return this.state.crashed ? null : this.props.children;
  }
}

export default function DirectPlayer({
  anilistId,
  source: apiSource = 'anivexa',
  alternates,
  episode,
  progressId,
  lang,
  autoPlay,
  autoSkip,
  title,
  onPlaying,
  onEnded,
  onProblem,
  onNotice,
  onDubMissing,
}: DirectPlayerProps) {
  const [phase, setPhase] = useState<Phase>('lookup');
  const [stream, setStream] = useState<ResolvedStream | null>(null);
  const [srcIndex, setSrcIndex] = useState(0);
  const [variant, setVariant] = useState<Variant>('direct');
  const [started, setStarted] = useState(false);
  const [triedCount, setTriedCount] = useState(0);
  const [subTracks, setSubTracks] = useState<StageTrack[]>([]);

  const triedRef = useRef<Set<string>>(new Set());
  const altRef = useRef(alternates);
  altRef.current = alternates;
  const workingCandRef = useRef<{ anilistId: number; episode: number } | null>(null);
  const resolveAbortRef = useRef<AbortController | null>(null);
  const timeRef = useRef(0);
  const resumeAtRef = useRef(0);
  const startedRef = useRef(false);
  // set per playback attempt (see the effect below)
  const failRef = useRef<((reason: string) => void) | null>(null);
  const loadedRef = useRef<(() => void) | null>(null);

  // latest values for callbacks fired from media / network events
  const live = useRef({ stream, srcIndex, variant });
  live.current = { stream, srcIndex, variant };
  const cb = useRef({ onPlaying, onEnded, onProblem, onNotice, onDubMissing });
  cb.current = { onPlaying, onEnded, onProblem, onNotice, onDubMissing };

  // start downloading the player code right away
  useEffect(() => {
    void loadStage();
  }, []);

  const source: MediaSource | undefined = stream?.sources[srcIndex];
  const attemptKey = stream ? `${stream.provider}|${srcIndex}|${variant}` : '';

  // ------------------------------------------------------------------ resolving (always Auto: first source that works)
  const resolveStream = useCallback(
    async (signal: AbortSignal) => {
      if (!anilistId) return;
      setPhase('resolving');
      setStarted(false);
      startedRef.current = false;

      // The main (AniList id, episode) pair first. If no source has it, the alternates are asked (priority providers
      // only), because some sources list a split show under one entry with continuous numbers, others per part.
      const candidates: { anilistId: number; episode: number }[] = [];
      const addCand = (c: { anilistId: number; episode: number } | null | undefined) => {
        if (c && !candidates.some((x) => x.anilistId === c.anilistId && x.episode === c.episode)) candidates.push(c);
      };
      addCand(workingCandRef.current);
      addCand({ anilistId, episode });
      (altRef.current || []).forEach(addCand);

      let subWarm = false;
      let found: ResolvedStream | null = null;
      let usedCand: { anilistId: number; episode: number } | null = null;
      const failures: Record<string, string> = {};
      for (let ci = 0; ci < candidates.length && !found; ci++) {
        const cand = candidates[ci];
        const tried = ci === 0 ? triedRef.current : new Set<string>();
        found = takePrefetched(apiSource, cand.anilistId, lang, cand.episode, tried);
        if (found) usedCand = cand;
        const tiers = ci === 0 ? autoTiers(apiSource) : autoTiers(apiSource).slice(0, 1);
        for (const tier of tiers) {
          if (found) break;
          const isPriority = tier.every((id) => PRIORITY_PROVIDERS.includes(id));
          // a dub is only a cheap API question per provider, so all of them are asked at once
          const res = await resolveFirstAvailable(tier, tried, cand.anilistId, lang, cand.episode, signal, lang === 'dub' || isPriority ? tier.length : 3, apiSource);
          if (signal.aborted) return;
          Object.assign(failures, res.failures);
          if (res.stream) {
            found = res.stream;
            usedCand = cand;
            if (ci > 0) triedRef.current = tried;
            break;
          }
          // The dub is not on the first tier: find the sub now, while the rest of the dub search runs, so the
          // fall back to sub is instant (and from the same provider) if no dub turns up.
          if (lang === 'dub' && !subWarm && ci === 0) {
            subWarm = true;
            const warmKey = prefetchKey(apiSource, cand.anilistId, 'sub', cand.episode);
            if (!prefetched.has(warmKey)) {
              resolveFirstAvailable(autoTiers(apiSource)[0] || [], new Set(), cand.anilistId, 'sub', cand.episode, undefined, 6, apiSource)
                .then((w) => {
                  if (w.stream) prefetched.set(warmKey, { stream: w.stream, at: Date.now() });
                })
                .catch(() => {});
            }
          }
        }
      }
      workingCandRef.current = found ? usedCand : null;
      setTriedCount(triedRef.current.size);
      const out = { stream: found, failures };

      if (!out.stream) {
        const reasons = Object.values(out.failures);
        const allNetwork = reasons.length > 0 && reasons.every((r) => r === 'unreachable' || r === 'timed out');
        setPhase('failed');
        if (lang === 'dub' && !allNetwork && cb.current.onDubMissing) {
          cb.current.onDubMissing();
          return;
        }
        cb.current.onProblem(allNetwork ? 'unreachable' : 'unavailable', `Checked ${triedRef.current.size} sources`);
        return;
      }

      triedRef.current.add(out.stream.provider);
      setStream(out.stream);
      setSrcIndex(0);
      setVariant(firstVariant(out.stream.sources[0]));
      setPhase('playing');
    },
    [anilistId, lang, episode, apiSource]
  );

  useEffect(() => {
    if (anilistId === undefined) {
      setPhase('lookup');
      return;
    }
    if (anilistId === null) {
      setPhase('failed');
      // deferred so the parent's reset effect (which runs after this one) cannot wipe the message
      const t = setTimeout(() => cb.current.onProblem('unavailable', 'This title has no AniList id'), 0);
      return () => clearTimeout(t);
    }
    const controller = new AbortController();
    resolveAbortRef.current = controller;
    triedRef.current = new Set();
    workingCandRef.current = null;
    // pick up where the viewer stopped last time
    const saved = progressId ? getProgress(progressId) : null;
    resumeAtRef.current = saved ? saved.t : 0;
    if (saved && saved.t > 5) cb.current.onNotice?.(`Resuming from ${formatResumeTime(saved.t)}`);
    setStream(null);
    resolveStream(controller.signal);
    return () => controller.abort();
  }, [anilistId, lang, episode, progressId, resolveStream]);

  // stop any re-resolve that is still running when the player goes away
  useEffect(() => () => resolveAbortRef.current?.abort(), []);

  // ------------------------------------------------------------------ moving to the next candidate
  const advance = useCallback(
    (reason: string) => {
      const { stream: s, srcIndex: i, variant: v } = live.current;
      if (!s) return;
      const src = s.sources[i];
      if (v === 'direct' && src?.kind === 'hls' && !IS_DEV) {
        setStarted(false);
        startedRef.current = false;
        setVariant('proxy');
        return;
      }
      if (i + 1 < s.sources.length) {
        setStarted(false);
        startedRef.current = false;
        setSrcIndex(i + 1);
        setVariant(firstVariant(s.sources[i + 1]));
        return;
      }
      // every link of this source failed: try the next one
      triedRef.current.add(s.provider);
      cb.current.onNotice?.('That source did not work, trying another one');
      resolveAbortRef.current?.abort();
      const controller = new AbortController();
      resolveAbortRef.current = controller;
      resolveStream(controller.signal);
      void reason;
    },
    [resolveStream]
  );
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  // ------------------------------------------------------------------ next episode: find its stream while this one plays
  useEffect(() => {
    if (!started || !anilistId) return;
    if (apiSource === 'kuhi') return; // each Kuhi ask is a scraper run: only look for the next episode when it is actually opened
    const conn = (navigator as any).connection;
    if (conn?.saveData) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const nextEp = episode + 1;
      const key = prefetchKey(apiSource, anilistId, lang, nextEp);
      if (prefetched.has(key)) return;
      for (const tier of autoTiers(apiSource)) {
        const out = await resolveFirstAvailable(tier, new Set(), anilistId, lang, nextEp, controller.signal, tier.length, apiSource);
        if (controller.signal.aborted) return;
        if (out.stream) {
          prefetched.set(key, { stream: out.stream, at: Date.now() });
          return;
        }
      }
    }, 30000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [started, anilistId, lang, episode]);

  // ------------------------------------------------------------------ one playback attempt = one candidate + watchdog
  useEffect(() => {
    if (phase !== 'playing' || !stream || !source) return;
    let done = false;
    let cancelled = false;

    const fail = (reason: string) => {
      if (done || cancelled) return;
      done = true;
      // keep the place in the video when the next candidate takes over mid-episode
      if (startedRef.current && timeRef.current > 5) resumeAtRef.current = timeRef.current;
      advanceRef.current(reason);
    };
    failRef.current = fail;

    const timer = setTimeout(() => fail('timed out'), START_TIMEOUT_MS);
    loadedRef.current = () => {
      clearTimeout(timer);
      startedRef.current = true;
      setStarted(true);
      rememberWorkingProvider(stream.provider, apiSource);
    };

    return () => {
      cancelled = true;
      clearTimeout(timer);
      failRef.current = null;
      loadedRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, attemptKey]);

  // ------------------------------------------------------------------ subtitles (fetched as text so they work cross-origin)
  // Cheap first: the default / English track is loaded and shown first, the other languages follow in small
  // batches in the background (at most MAX_SUBS), so a source with 20+ tracks no longer floods the network
  // and the text-track machinery before the video has even started.
  useEffect(() => {
    const all: MediaSubtitle[] = stream?.subtitles || [];
    setSubTracks([]);
    if (!all.length) return;
    let cancelled = false;
    const created: string[] = [];

    // The default track is English (or English SDH, see Settings): never a random language the source marked as default.
    // A dub has English audio, so it starts without subtitles.
    const defaultSub = lang === 'dub' ? null : pickDefaultSubtitle(all);
    const rank = (s: MediaSubtitle) => (s === defaultSub ? 4 : 0) + (isEnglishSub(s) ? 2 : 0);
    const subs = [...all].sort((a, b) => rank(b) - rank(a)).slice(0, MAX_SUBS);
    let first = subs.filter((s) => s === defaultSub || isEnglishSub(s)).slice(0, 2);
    if (!first.length) first = subs.slice(0, 1);
    const rest = subs.filter((s) => !first.includes(s));

    const load = async (s: MediaSubtitle): Promise<StageTrack | null> => {
      // Subtitle CDNs that want a Referer answer a plain browser request with 403, so with headers known the proxy goes first
      const viaProxy = proxiedUrl(s.url, stream?.sources[0]?.headers);
      const needsProxy = !IS_DEV && Boolean(stream?.sources[0]?.headers?.referer);
      const attempts = IS_DEV ? [s.url] : needsProxy ? [viaProxy, s.url] : [s.url, viaProxy];
      for (const u of attempts) {
        if (cancelled) return null;
        try {
          const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) continue;
          let text = (await res.text()).replace(/^\uFEFF/, '');
          if (!text.trim()) continue;
          // any of WebVTT, SRT and ASS/SSA end up as WebVTT for <track>
          if (/^\s*\[Script Info\]/i.test(text) || /^\s*Dialogue:/im.test(text)) text = assToVtt(text);
          else if (!/^WEBVTT/.test(text)) text = srtToVtt(text);
          if (cancelled) return null;
          const blobUrl = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
          created.push(blobUrl);
          const generic = !s.label || /^(subtitles?|captions?|track)\s*\d*$/i.test(s.label);
          const label = (generic ? languageName(s.lang) : s.label) || s.label || 'Subtitles';
          return { src: blobUrl, label, lang: (s.lang || 'en').slice(0, 5), isDefault: s === defaultSub };
        } catch {
          /* try the next route */
        }
      }
      return null;
    };

    // two tracks with the same name get numbered so the menu can tell them apart
    const finalize = (list: StageTrack[]): StageTrack[] => {
      const seen: Record<string, number> = {};
      const total: Record<string, number> = {};
      list.forEach((t) => (total[t.label] = (total[t.label] || 0) + 1));
      return list.map((t) => {
        if (total[t.label] <= 1) return t;
        seen[t.label] = (seen[t.label] || 0) + 1;
        return { ...t, label: `${t.label} ${seen[t.label]}` };
      });
    };

    (async () => {
      const loaded: StageTrack[] = [];
      const run = async (batch: MediaSubtitle[]) => {
        const out = (await Promise.all(batch.map(load))).filter(Boolean) as StageTrack[];
        if (cancelled || !out.length) return;
        loaded.push(...out);
        setSubTracks(finalize(loaded));
      };
      await run(first);
      for (let i = 0; i < rest.length && !cancelled; i += SUB_BATCH) await run(rest.slice(i, i + SUB_BATCH));
    })();

    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [stream, lang]);

  const loadingText = useMemo(() => {
    if (phase === 'lookup') return 'Finding this title...';
    if (phase === 'resolving') return triedCount > 0 ? `Looking for a working source (${triedCount} checked)...` : 'Looking for a working source...';
    return 'Loading...';
  }, [phase, triedCount]);

  const showLoading = phase !== 'failed' && (phase !== 'playing' || !started);
  const handleLoaded = useCallback(() => loadedRef.current?.(), []);
  const handlePlaying = useCallback(() => cb.current.onPlaying(), []);
  const handleEnded = useCallback(() => cb.current.onEnded(), []);
  const handleFail = useCallback((r: string) => failRef.current?.(r), []);
  const handleCrash = useCallback((m: string) => failRef.current?.(m), []);
  const mediaUrl = source ? (variant === 'proxy' ? proxiedUrl(source.url, source.headers) : source.url) : '';

  return (
    <div className="absolute inset-0 bg-black">
      {showLoading && <BrandLoader text={loadingText} />}

      {phase === 'playing' && source && (
        <StageBoundary key={attemptKey} onCrash={handleCrash}>
          <Suspense fallback={null}>
            <VjsStage
              url={mediaUrl}
              kind={source.kind === 'hls' ? 'hls' : 'file'}
              title={title}
              tracks={subTracks}
              intro={stream?.intro}
              outro={stream?.outro}
              autoPlay={autoPlay}
              autoSkip={autoSkip}
              resumeAt={resumeAtRef.current}
              progressId={progressId}
              timeRef={timeRef}
              onLoaded={handleLoaded}
              onPlaying={handlePlaying}
              onEnded={handleEnded}
              onFail={handleFail}
            />
          </Suspense>
        </StageBoundary>
      )}

    </div>
  );
}
