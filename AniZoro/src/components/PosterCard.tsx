import React from 'react';
import PosterImage from './PosterImage';
import { JikanAnime } from '../types';

/** Release year from the year field or the aired string; empty when unknown. */
export function getReleaseYear(anime: JikanAnime): string {
  if (anime.year) return String(anime.year);
  if (anime.aired?.string) {
    const match = anime.aired.string.match(/\b(19|20)\d{2}\b/);
    if (match) return match[0];
  }
  return '';
}

interface PosterCardProps {
  anime: JikanAnime;
  onOpen: (anime: JikanAnime) => void;
  /** above-the-fold posters load right away */
  priority?: boolean;
  /** width / layout classes from the parent (rows set a fixed width, grids leave it empty) */
  className?: string;
  /** small line under the title; defaults to the release year */
  caption?: string;
}

/**
 * The one poster card used on every page: poster with score, episode and type badges,
 * a play button on hover, then title and a small info line underneath.
 */
export default function PosterCard({ anime, onOpen, priority = false, className = '', caption }: PosterCardProps) {
  const title = anime.title_english || anime.title;
  const line = caption ?? getReleaseYear(anime);
  const total = anime.episodes;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      onClick={() => onOpen(anime)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(anime);
        }
      }}
      className={`group flex flex-col min-w-0 cursor-pointer outline-offset-4 ${className}`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-[#1b1c1b] border border-white/10 group-hover:border-[#3fcf8e]/70 group-focus-visible:border-[#3fcf8e] transition-colors duration-150">
        <PosterImage
          priority={priority}
          src={anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url}
          malId={anime.mal_id}
          alt={title}
          className="h-full w-full object-cover"
        />

        {/* darkening at the bottom keeps the badges readable on any poster */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 to-transparent" />

        {anime.score ? (
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-bold leading-none text-[#e8b84a] font-mono">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
              <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8L12 2.5z" />
            </svg>
            {anime.score.toFixed(1)}
          </span>
        ) : null}

        <div className="absolute inset-x-1.5 bottom-1.5 flex items-end justify-between gap-1">
          {anime.latest_episode ? (
            <span className="rounded bg-[#3fcf8e] px-1.5 py-0.5 text-[11px] font-bold leading-none text-[#04120d] font-mono">
              EP {anime.latest_episode}
              {total ? <span className="font-semibold opacity-70"> / {total}</span> : null}
            </span>
          ) : total ? (
            <span className="rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-zinc-100 font-mono">
              {total} eps
            </span>
          ) : (
            <span />
          )}
          {anime.type ? (
            <span className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-zinc-200">
              {anime.type}
            </span>
          ) : null}
        </div>

      </div>

      <h3 className="mt-2.5 font-display text-[13px] sm:text-sm font-semibold leading-snug text-zinc-100 line-clamp-2 min-h-[2.6em] transition-colors group-hover:text-white">
        {title}
      </h3>
      {line ? <p className="mt-0.5 text-xs text-zinc-500 font-mono">{line}</p> : null}
    </div>
  );
}
