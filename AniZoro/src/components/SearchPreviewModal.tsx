import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Star, Filter, ArrowRight, Loader2 } from 'lucide-react';
import { JikanAnime } from '../types';
import { jikanService } from '../lib/jikan';
import { SearchRowsSkeleton } from './Skeleton';

interface SearchPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAnime: (anime: JikanAnime) => void;
  onViewAll: (query: string) => void;
  initialQuery?: string;
}

export default function SearchPreviewModal({
  isOpen,
  onClose,
  onSelectAnime,
  onViewAll,
  initialQuery = '',
}: SearchPreviewModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<JikanAnime[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync initial query & auto-focus
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialQuery]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced search query
  useEffect(() => {
    if (!isOpen) return;
    const clean = query.trim();
    if (!clean) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await jikanService.searchAnime(clean);
        setResults(data.slice(0, 8));
      } catch (err) {
        console.warn('Search preview failed:', err);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onViewAll(query.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center pt-16 sm:pt-20 px-3 bg-black/80 animate-in fade-in duration-150">
      <div
        ref={containerRef}
        className="w-full max-w-xl frosted-glass-modal rounded-3xl overflow-hidden flex flex-col relative"
      >
        {/* Top Search Input Box */}
        <form onSubmit={handleSubmit} className="relative p-3.5 sm:p-4 border-b border-white/10 bg-transparent">
          <div className="relative flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search anime..."
              className="w-full frosted-glass-input rounded-xl px-4 py-3 pr-20 text-sm sm:text-base text-white placeholder-zinc-400 focus:outline-none font-medium"
            />
            <div className="absolute right-3 flex items-center gap-1.5 text-zinc-400">
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 hover:text-white transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#3fcf8e]" />
              ) : (
                <button
                  type="submit"
                  className="p-1 hover:text-emerald-400 transition-colors cursor-pointer"
                  title="Search"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Live Search Results Header */}
          <div className="flex items-center justify-between mt-3 text-xs font-semibold pt-1">
            <div className="flex items-center gap-2 text-zinc-400">
              <span className="text-white font-bold tracking-wide">Live Anime Results</span>
              {results.length > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400 text-[10px] font-mono font-bold">
                  {results.length} found
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (query.trim()) {
                  onViewAll(query.trim());
                  onClose();
                }
              }}
              className="flex items-center gap-1 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Full Catalog</span>
            </button>
          </div>
        </form>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-white/5 p-1.5">
          {query.trim() === '' ? (
            <div className="p-6 text-center text-xs text-zinc-400">
              Type anime title above to preview instant episodes and streams.
            </div>
          ) : loading && results.length === 0 ? (
            <SearchRowsSkeleton count={5} />
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400">
              No matching anime found for "{query}". Try another title or check spelling.
            </div>
          ) : (
            results.map((anime) => {
              const poster = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
              const title = anime.title_english || anime.title;
              const year = anime.year || (anime.aired?.string ? anime.aired.string.match(/\b(19|20)\d{2}\b/)?.[0] : null);

              return (
                <div
                  key={`preview-${anime.mal_id}`}
                  onClick={() => {
                    onSelectAnime(anime);
                    onClose();
                  }}
                  className="flex items-center gap-3 p-2.5 hover:bg-white/5 transition-colors cursor-pointer rounded-xl group"
                >
                  {/* Poster Thumbnail */}
                  <img
                    src={poster}
                    alt={title}
                    className="w-11 h-16 object-cover rounded-lg bg-zinc-900 border border-white/10 shrink-0"
                    loading="lazy"
                    onError={async (e) => {
                      const el = e.currentTarget;
                      if (el.dataset.recovered) return;
                      el.dataset.recovered = '1';
                      const fresh = await jikanService.getPosterByMalId(anime.mal_id);
                      if (fresh) el.src = fresh;
                    }}
                  />

                  {/* Title & Metadata Badges */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <h4 className="text-sm font-bold text-white group-hover:text-[#3fcf8e] transition-colors line-clamp-1">
                      {title}
                    </h4>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-400 flex-wrap">
                      <span className="px-1.5 py-0.2 rounded border border-zinc-700/80 text-zinc-400 font-mono text-[10px]">
                        {anime.rating?.includes('R') ? '17+' : 'PG-13'}
                      </span>

                      {anime.score ? (
                        <span className="flex items-center gap-1 font-semibold text-[#3fcf8e]">
                          <Star className="w-3 h-3 fill-[#f4c95d] text-[#f4c95d]" />
                          <span>{anime.score.toFixed(2)}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-500 font-mono">★</span>
                      )}

                      <span className="text-zinc-400 font-medium">{anime.type || 'TV'}</span>

                      {year && (
                        <span className="text-zinc-500 font-mono">{year}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom View All Link */}
        {query.trim() && results.length > 0 && (
          <div className="p-3 bg-black/30 border-t border-white/10 text-center">
            <button
              type="button"
              onClick={() => {
                onViewAll(query.trim());
                onClose();
              }}
              className="text-xs font-bold text-zinc-300 hover:text-[#3fcf8e] transition-colors flex items-center justify-center gap-1.5 w-full cursor-pointer py-1"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
