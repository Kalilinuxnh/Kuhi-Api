import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays } from 'lucide-react';
import { JikanAnime } from '../types';
import { jikanService } from '../lib/jikan';
import PosterImage from './PosterImage';
import { Skeleton } from './Skeleton';
import { SectionHeader } from './ui';
import { formatDate, formatClock } from '../lib/formatTime';

interface Entry {
  anime: JikanAnime;
  episode: number;
  airingAt: number;
}

function dayKey(unix: number): string {
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface Props {
  onOpenDetails: (anime: JikanAnime) => void;
}

/** Next 7 days of episode releases, in the viewer's local time. */
export default function ScheduleSection({ onOpenDetails }: Props) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  // The schedule sits below the fold, so it waits until the viewer scrolls close to it (or 3 s have passed).
  // That keeps the first screen's requests (billboard, trending) from competing with it.
  useEffect(() => {
    if (started) return;
    const node = sectionRef.current;
    const timer = window.setTimeout(() => setStarted(true), 3000);
    let observer: IntersectionObserver | null = null;
    if (node && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (hits) => {
          if (hits.some((h) => h.isIntersecting)) setStarted(true);
        },
        { rootMargin: '700px 0px' }
      );
      observer.observe(node);
    } else {
      setStarted(true);
    }
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let active = true;
    setFailed(false);
    setEntries(null);
    jikanService
      .getWeeklySchedule()
      .then((list) => {
        if (active) setEntries(list);
      })
      .catch(() => {
        if (active) {
          setEntries([]);
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [started, reload]);

  const days = useMemo(() => {
    const out: Array<{ key: string; label: string; sub: string }> = [];
    const base = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      out.push({
        key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
        label: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
        sub: formatDate(Math.floor(d.getTime() / 1000)),
      });
    }
    return out;
  }, []);

  const dayEntries = useMemo(
    () => (entries || []).filter((e) => dayKey(e.airingAt) === days[selected]?.key),
    [entries, days, selected]
  );

  // One row per show per day: a show that releases several episodes at once (a whole season, a batch)
  // becomes a single "Episodes 1-10" row instead of ten repeated rows.
  const groups = useMemo(() => {
    const map = new Map<number, { anime: JikanAnime; episodes: number[]; airingAt: number }>();
    for (const e of dayEntries) {
      const g = map.get(e.anime.mal_id);
      if (!g) map.set(e.anime.mal_id, { anime: e.anime, episodes: [e.episode], airingAt: e.airingAt });
      else {
        g.episodes.push(e.episode);
        g.airingAt = Math.min(g.airingAt, e.airingAt);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.airingAt - b.airingAt);
  }, [dayEntries]);

  const episodeLabel = (episodes: number[]): string => {
    const sorted = Array.from(new Set(episodes)).sort((a, b) => a - b);
    if (sorted.length === 1) return `Episode ${sorted[0]}`;
    const range = `Episodes ${sorted[0]}-${sorted[sorted.length - 1]}`;
    return sorted.length >= 3 && sorted[0] === 1 ? `Full season - ${range}` : range;
  };

  const LIMIT = 8;
  const visibleGroups = showAll ? groups : groups.slice(0, LIMIT);

  return (
    <section ref={sectionRef} className="min-w-0 max-w-full">
      <SectionHeader title="Release schedule" note="Times in your timezone" icon={<CalendarDays className="w-4 h-4 text-[#3fcf8e]" />} />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {days.map((d, i) => (
          <button
            key={d.key}
            type="button"
            onClick={() => {
              setSelected(i);
              setShowAll(false);
            }}
            className={`shrink-0 px-3.5 py-2 rounded-md text-center transition-colors cursor-pointer border ${
              selected === i
                ? 'bg-[#3fcf8e] text-[#04120d] border-[#3fcf8e] font-bold'
                : 'bg-[#151615] text-zinc-300 border-[#2a2b2a] hover:border-[#3a3b3a] hover:text-white'
            }`}
          >
            <span className="block text-xs leading-tight">{d.label}</span>
            <span className={`block text-[10px] leading-tight ${selected === i ? 'text-black/70' : 'text-zinc-500'}`}>{d.sub}</span>
          </button>
        ))}
      </div>

      {failed ? (
        <div className="py-6 text-center space-y-3">
          <p className="text-sm text-zinc-400">Couldn't load the release schedule right now.</p>
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            className="px-4 py-2 rounded-md bg-[#3fcf8e] text-[#04120d] text-xs font-bold cursor-pointer active:scale-95 transition-transform"
          >
            Try again
          </button>
        </div>
      ) : entries === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="text-xs text-zinc-500 py-4 text-center">No notable releases on this day.</p>
      ) : (
        <div className="space-y-2 min-w-0">
          {visibleGroups.map((g, i) => (
            <motion.button
              key={g.anime.mal_id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => onOpenDetails(g.anime)}
              className="w-full h-16 grid grid-cols-[4.5rem_2.25rem_minmax(0,1fr)_auto] items-center gap-3 p-2 rounded-md bg-[#151615] hover:bg-[#1b1c1b] border border-[#2a2b2a] transition-colors text-left cursor-pointer overflow-hidden"
            >
              <span className="text-[12px] font-mono font-bold text-[#3fcf8e] leading-tight whitespace-nowrap">
                {formatClock(g.airingAt)}
              </span>
              <PosterImage
                src={g.anime.images?.jpg?.image_url}
                malId={g.anime.mal_id}
                alt={g.anime.title}
                className="w-9 h-12 rounded object-cover border border-white/10 bg-white/[0.06]"
              />
              <div className="min-w-0 overflow-hidden">
                <p
                  className="text-[13px] font-semibold text-white"
                  style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  title={g.anime.title_english || g.anime.title}
                >
                  {g.anime.title_english || g.anime.title}
                </p>
                <p className="text-[11px] text-zinc-400" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {episodeLabel(g.episodes)}
                </p>
              </div>
              {g.airingAt * 1000 < Date.now() ? (
                <span className="px-2 py-0.5 rounded bg-white/[0.07] text-[11px] font-semibold text-zinc-400">Aired</span>
              ) : (
                <span />
              )}
            </motion.button>
          ))}

          {groups.length > LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full py-2.5 rounded-md bg-[#151615] hover:bg-[#1b1c1b] border border-[#2a2b2a] text-xs font-bold text-zinc-200 transition-colors cursor-pointer"
            >
              {showAll ? 'Show less' : `View all (${groups.length})`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
