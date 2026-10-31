import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, Tv, ShieldCheck, Zap, CheckCheck } from 'lucide-react';
import { JikanAnime } from '../types';
import { jikanService } from '../lib/jikan';
import PosterImage from './PosterImage';

type NoticeAction =
  | { type: 'terms' }
  | { type: 'anime'; anime: JikanAnime }
  | { type: 'none' };

export interface Notice {
  id: string;
  kind: 'airing' | 'tip' | 'legal';
  title: string;
  body: string;
  tag: string;
  action: NoticeAction;
  anime?: JikanAnime;
}

const READ_KEY = 'anizoro_notif_read_v2';
const DISMISSED_KEY = 'anizoro_notif_dismissed_v2';

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    /* storage unavailable */
  }
}

/** Builds the list of notices and tracks which are read / dismissed. */
export function useNotifications() {
  const [airing, setAiring] = useState<JikanAnime[]>([]);
  const [read, setRead] = useState<Set<string>>(() => loadSet(READ_KEY));
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadSet(DISMISSED_KEY));

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await jikanService.getTopAiringAnime();
        if (active && list?.length) setAiring(list.slice(0, 3));
      } catch {
        /* optional feed */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const all: Notice[] = useMemo(() => {
    const items: Notice[] = [
      ...airing.map<Notice>((a) => ({
        id: `airing-${a.mal_id}`,
        kind: 'airing',
        title: a.title_english || a.title,
        body: 'Airing now. Tap to view details and episodes.',
        tag: 'Airing',
        action: { type: 'anime', anime: a },
        anime: a,
      })),
      {
        id: 'tip-servers',
        kind: 'tip',
        title: 'Vidstream 1 is your default server',
        body: 'Sub and Dub are available on it. If a server fails, switch to Vidstream 2 or HD 1.',
        tag: 'Tip',
        action: { type: 'none' },
      },
      {
        id: 'legal-notice',
        kind: 'legal',
        title: 'Legal and DMCA notice',
        body: 'AniZoro does not host any video. Streams come from independent third parties.',
        tag: 'Info',
        action: { type: 'terms' },
      },
    ];
    return items.filter((n) => !dismissed.has(n.id));
  }, [airing, dismissed]);

  const unreadCount = all.filter((n) => !read.has(n.id)).length;

  const markRead = useCallback((id: string) => {
    setRead((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set<string>(prev);
      next.add(id);
      saveSet(READ_KEY, next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setRead((prev) => {
      const next = new Set<string>(prev);
      all.forEach((n) => next.add(n.id));
      saveSet(READ_KEY, next);
      return next;
    });
  }, [all]);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set<string>(prev);
      next.add(id);
      saveSet(DISMISSED_KEY, next);
      return next;
    });
  }, []);

  return { notices: all, read, unreadCount, markRead, markAllRead, dismiss };
}

const ICONS = {
  airing: Tv,
  tip: Zap,
  legal: ShieldCheck,
} as const;

interface PanelProps {
  notifications: ReturnType<typeof useNotifications>;
  onAction: (action: NoticeAction) => void;
}

/** The dropdown content. Place it inside a positioned glass container. */
export function NotificationPanel({ notifications, onAction }: PanelProps) {
  const { notices, read, unreadCount, markRead, markAllRead, dismiss } = notifications;

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-sm">Notifications</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#3fcf8e] text-black font-bold text-[10px]">{unreadCount}</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-[#3fcf8e] transition-colors cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2 max-h-[60vh] sm:max-h-96 overflow-y-auto pr-0.5 scrollbar-none">
        <AnimatePresence initial={false}>
          {notices.map((n, i) => {
            const Icon = ICONS[n.kind];
            const isUnread = !read.has(n.id);
            return (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 60, height: 0, marginTop: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 24, delay: i * 0.04 }}
                className={`relative flex gap-3 p-2.5 rounded-xl border transition-colors ${
                  isUnread ? 'bg-white/[0.06] border-[#3fcf8e]/25' : 'bg-white/[0.03] border-white/5'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    markRead(n.id);
                    onAction(n.action);
                  }}
                  className="flex gap-3 flex-1 min-w-0 text-left cursor-pointer"
                >
                  {n.anime ? (
                    <PosterImage
                      src={n.anime.images?.jpg?.image_url}
                      malId={n.anime.mal_id}
                      alt={n.title}
                      className="w-10 h-14 rounded-lg object-cover shrink-0 border border-white/10"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-[#3fcf8e]/15 border border-[#3fcf8e]/25 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-[#3fcf8e]" />
                    </div>
                  )}
                  <div className="min-w-0 space-y-0.5 pr-5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#3fcf8e]">{n.tag}</span>
                      {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-[#3fcf8e]" />}
                    </div>
                    <p className="font-semibold text-white text-[12px] leading-snug line-clamp-1">{n.title}</p>
                    <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">{n.body}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(n.id)}
                  className="absolute top-2 right-2 p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Dismiss"
                  aria-label="Dismiss notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {notices.length === 0 && (
          <div className="py-8 text-center space-y-2">
            <div className="mx-auto w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <Bell className="w-4 h-4 text-zinc-500" />
            </div>
            <p className="text-zinc-300 font-semibold text-[12px]">You're all caught up</p>
            <p className="text-zinc-500 text-[11px]">New updates will show up here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
