import React, { useEffect, useRef, useState } from 'react';
import { JikanAnime } from '../types';
import { jikanService } from '../lib/jikan';
import { BrowseCategory, BROWSE_GENRES, BROWSE_LABELS } from '../lib/browse';
import PosterCard from './PosterCard';
import { PosterGridSkeleton } from './Skeleton';

interface Props {
  category: BrowseCategory;
  /** genre picked from the Genres menu; the filter chips start on it */
  initialGenre?: string | null;
  onOpenDetails: (anime: JikanAnime) => void;
}

/** Real catalog pages for Movies, Series, New Releases, Popular and Top Rated, with a genre filter. */
export default function BrowseView({ category, initialGenre = null, onOpenDetails }: Props) {
  const [genre, setGenre] = useState<string | null>(initialGenre);
  const [items, setItems] = useState<JikanAnime[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const requestRef = useRef(0);

  // a different section (or a genre chosen from the menu) sets the filter
  useEffect(() => {
    setGenre(initialGenre);
  }, [category, initialGenre]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setItems([]);
    setPage(1);
    setFailed(false);
    jikanService.browseAnime(category, genre, 1).then((res) => {
      if (requestRef.current !== requestId) return;
      setFailed(Boolean(res.failed));
      setItems(res.items);
      setHasNext(res.hasNext);
      setLoading(false);
    });
  }, [category, genre, reloadTick]);

  const loadMore = async () => {
    const requestId = requestRef.current;
    setLoadingMore(true);
    const nextPage = page + 1;
    const res = await jikanService.browseAnime(category, genre, nextPage);
    if (requestRef.current !== requestId) return;
    setItems((prev) => {
      const seen = new Set(prev.map((a) => a.mal_id));
      return [...prev, ...res.items.filter((a) => !seen.has(a.mal_id))];
    });
    setPage(nextPage);
    setHasNext(res.hasNext);
    setLoadingMore(false);
  };

  const label = BROWSE_LABELS[category];
  const title = genre ? `${genre} anime` : label.title;

  return (
    <div className="max-w-[1760px] mx-auto px-4 sm:px-8 py-8 w-full relative z-10">
      <div className="flex items-center gap-2.5 border-b border-[#2a2b2a] pb-4">
        <span className="h-6 w-[3px] shrink-0 rounded-sm bg-[#3fcf8e]" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">{title}</h1>
          <p className="mt-0.5 text-xs text-zinc-400">{label.blurb}</p>
        </div>
      </div>

      {/* genre filter stays in view while the grid scrolls */}
      <div className="sticky top-14 sm:top-16 z-20 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3 bg-[#0c0d0c]/95 border-b border-[#2a2b2a]">
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {[null, ...BROWSE_GENRES].map((g) => (
            <button
              key={g ?? 'all'}
              type="button"
              onClick={() => setGenre(g)}
              className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                genre === g
                  ? 'border-[#3fcf8e] bg-[#3fcf8e] text-[#04120d]'
                  : 'border-[#2a2b2a] bg-[#151615] text-zinc-300 hover:border-[#3a3b3a] hover:text-white'
              }`}
            >
              {g ?? 'All genres'}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-6">
        {loading ? (
          <PosterGridSkeleton count={12} />
        ) : items.length === 0 ? (
          failed ? (
            <div className="py-16 text-center space-y-3">
              <p className="text-sm text-zinc-300">Couldn&apos;t load this list. The catalog service may be busy.</p>
              <button
                type="button"
                onClick={() => setReloadTick((n) => n + 1)}
                className="px-4 py-2 rounded-md bg-[#3fcf8e] text-[#04120d] text-xs font-bold cursor-pointer active:scale-95 transition-transform"
              >
                Try again
              </button>
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-zinc-400">Nothing matches this filter right now. Try another genre.</p>
          )
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 min-[1700px]:grid-cols-8 gap-x-3 sm:gap-x-4 gap-y-6">
              {items.map((anime) => (
                <PosterCard key={anime.mal_id} anime={anime} onOpen={onOpenDetails} />
              ))}
            </div>

            {hasNext && (
              <div className="flex justify-center pt-8">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-8 py-2.5 rounded-md frosted-glass-interactive text-sm font-bold text-white disabled:opacity-50 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
