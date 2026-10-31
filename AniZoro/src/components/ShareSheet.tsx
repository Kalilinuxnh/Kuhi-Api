import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Copy, Link2, Share2, X } from 'lucide-react';
import type { JikanAnime } from '../types';
import {
  SHARE_TARGETS,
  buildFacts,
  buildShareText,
  buildShareTitle,
  buildShareUrl,
  canNativeShare,
  copyText,
  nativeShare,
} from '../lib/share';

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  anime: JikanAnime;
  /** when set, the sheet offers "This episode" next to "Whole series" */
  episode?: number | null;
  season?: number | null;
}

/**
 * Share dialog with a live preview of what the link will look like when it is pasted into a chat
 * (poster, title, facts), a one-tap copy, the phone's own share sheet and the common apps.
 * The real preview in those apps is produced by functions/anime/[[path]].ts.
 */
export default function ShareSheet({ open, onClose, anime, episode = null, season = null }: ShareSheetProps) {
  const hasEpisode = Boolean(episode);
  const [scope, setScope] = useState<'episode' | 'series'>('episode');
  const [copied, setCopied] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // every time the sheet opens: start from the most specific link and a clean "copied" state
  useEffect(() => {
    if (open) {
      setScope(hasEpisode ? 'episode' : 'series');
      setCopied(false);
      setPosterFailed(false);
    }
  }, [open, hasEpisode, anime.mal_id]);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const subject = useMemo(
    () => ({ anime, episode: scope === 'episode' ? episode : null, season: scope === 'episode' ? season : null }),
    [anime, episode, season, scope]
  );
  const url = open ? buildShareUrl(subject) : '';
  const title = buildShareTitle(subject);
  const text = buildShareText(subject);
  const facts = buildFacts(anime);
  const poster = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
  const host = open ? window.location.host : '';

  const flashCopied = () => {
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2200);
  };

  const handleCopy = async () => {
    const ok = await copyText(url);
    if (ok) {
      flashCopied();
    } else {
      // last resort: select the field so the visitor can copy by hand
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const handleNative = async () => {
    const shared = await nativeShare({ title, text, url });
    if (shared) onClose();
  };

  // portal to <body>: the parents (player, detail modal) animate with transforms, which would trap a fixed overlay
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="share-sheet"
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          aria-label={`Share ${title}`}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-black/70 cursor-default"
          />

          <motion.div
            className="relative w-full sm:max-w-md bg-[#101210] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            initial={{ y: 40, opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 380 }}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-400" />
                Share
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {hasEpisode && (
              <div className="px-4 pb-3">
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5 border border-white/5">
                  {(['episode', 'series'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setScope(value)}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        scope === value ? 'bg-emerald-400 text-black' : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      {value === 'episode' ? `Episode ${episode}` : 'Whole series'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* what the pasted link will look like */}
            <div className="px-4 pb-4">
              <div className="flex gap-3 rounded-xl border border-white/10 bg-black/40 overflow-hidden">
                <div className="relative w-[84px] sm:w-24 shrink-0 aspect-[2/3] bg-zinc-900">
                  {poster && !posterFailed ? (
                    <img
                      src={poster}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={() => setPosterFailed(true)}
                      draggable={false}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
                      <Link2 className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 py-3 pr-3 flex flex-col justify-center gap-1">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold truncate">{host}</p>
                  <p className="text-sm font-bold text-white leading-snug line-clamp-2">{anime.title_english || anime.title}</p>
                  {scope === 'episode' && episode ? (
                    <p className="text-xs font-semibold text-emerald-400">Episode {episode}</p>
                  ) : null}
                  {facts.length > 0 && <p className="text-[11px] text-zinc-400 truncate">{facts.join(' · ')}</p>}
                  {anime.synopsis && (
                    <p className="text-[11px] text-zinc-500 line-clamp-2 leading-snug">{anime.synopsis}</p>
                  )}
                </div>
              </div>
            </div>

            {/* link + copy */}
            <div className="px-4 pb-4">
              <div className="flex items-stretch gap-2">
                <input
                  ref={inputRef}
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Link"
                  className="min-w-0 flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-zinc-300 outline-none focus:border-emerald-400/60"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    copied ? 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/40' : 'bg-emerald-400 text-black hover:bg-emerald-300'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 h-4 text-[11px] text-emerald-300" aria-live="polite">
                {copied ? 'Link copied. Paste it anywhere: it shows the poster and title.' : ''}
              </p>
            </div>

            {/* apps */}
            <div className="px-4 pb-5">
              <div className="grid grid-cols-4 gap-y-3 gap-x-2">
                {canNativeShare() && (
                  <button
                    type="button"
                    onClick={handleNative}
                    className="group flex flex-col items-center gap-1.5 cursor-pointer"
                  >
                    <span className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/10 text-white group-hover:bg-white/20 transition-colors">
                      <Share2 className="w-5 h-5" />
                    </span>
                    <span className="text-[11px] text-zinc-400 group-hover:text-white transition-colors">More</span>
                  </button>
                )}
                {SHARE_TARGETS.map((target) => (
                  <a
                    key={target.id}
                    href={target.href(url, text, title)}
                    target={target.id === 'email' ? undefined : '_blank'}
                    rel="noopener noreferrer"
                    onClick={() => {
                      if (target.id === 'email') onClose();
                    }}
                    className="group flex flex-col items-center gap-1.5"
                  >
                    <span
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-extrabold border border-white/10 group-hover:brightness-110 group-active:scale-95 transition"
                      style={{ background: target.color }}
                    >
                      {target.glyph}
                    </span>
                    <span className="text-[11px] text-zinc-400 group-hover:text-white transition-colors">{target.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
