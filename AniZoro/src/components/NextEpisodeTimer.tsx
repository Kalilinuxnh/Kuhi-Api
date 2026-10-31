import React, { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { jikanService } from '../lib/jikan';
import { formatCountdown, formatDate, formatExact, formatTime } from '../lib/formatTime';

interface Props {
  malId: number;
  /** exact AniList id (preferred when known) */
  anilistId?: number;
  /** compact = single small chip (for cards and the hero) */
  compact?: boolean;
  className?: string;
}

/** Shows when the next episode airs, with a live countdown. Renders nothing for finished shows. */
export default function NextEpisodeTimer({ malId, anilistId, compact = false, className = '' }: Props) {
  const [next, setNext] = useState<{ episode: number; airingAt: number } | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setNext(null);
    jikanService
      .getNextAiring(malId, anilistId)
      .then((res) => {
        if (active) setNext(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [malId, anilistId, refreshKey]);

  // tick every second only when under an hour away, otherwise every 30s
  useEffect(() => {
    if (!next) return;
    const remaining = next.airingAt - Math.floor(Date.now() / 1000);
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), remaining < 3600 ? 1000 : 30000);
    return () => clearInterval(interval);
  }, [next]);

  // when the countdown ends, look for the following episode
  useEffect(() => {
    if (!next) return;
    if (now > next.airingAt + 90) setRefreshKey((k) => k + 1);
  }, [now, next]);

  if (!next) return null;

  const remaining = next.airingAt - now;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-white/20 bg-black/40 text-[11px] font-semibold text-[#3fcf8e] ${className}`}
      >
        <CalendarClock className="w-3 h-3" />
        EP {next.episode} · {formatDate(next.airingAt)} · {remaining > 0 ? formatCountdown(remaining) : 'now'}
      </span>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 ${className}`}
      role="timer"
      aria-label={`Episode ${next.episode} airs ${formatExact(next.airingAt)}`}
    >
      <div className="w-9 h-9 rounded-lg bg-[#3fcf8e]/15 border border-[#3fcf8e]/25 flex items-center justify-center shrink-0">
        <CalendarClock className="w-4 h-4 text-[#3fcf8e]" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-[11px] text-zinc-400 leading-snug">
          Episode {next.episode} is expected to release on
        </p>
        <p className="text-[13px] sm:text-sm font-bold text-white font-mono leading-snug">
          <span className="whitespace-nowrap">{formatDate(next.airingAt)}</span>{' '}
          <span className="whitespace-nowrap">{formatTime(next.airingAt)}</span>
        </p>
        <p className="text-xs font-semibold text-[#3fcf8e] leading-snug">
          {remaining > 0 ? `in ${formatCountdown(remaining)}` : 'Airing now'}
        </p>
      </div>
    </div>
  );
}
