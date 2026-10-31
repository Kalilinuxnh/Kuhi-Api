import React, { memo, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { JikanAnime } from '../types';
import { jikanService } from '../lib/jikan';
import PosterImage from './PosterImage';

interface WatchRecommendationsProps {
  anime: JikanAnime;
  /** other seasons / parts of the same series: used as extra seeds and never recommended back */
  relatedMalIds: number[];
  onPick: (anime: JikanAnime) => void;
}

// one lookup per series per session
const cache = new Map<string, JikanAnime[]>();

/** "You might also like": fills the space under the episode details on the watch page. */
function WatchRecommendations({ anime, relatedMalIds, onPick }: WatchRecommendationsProps) {
  const ids = Array.from(new Set([anime.mal_id, ...relatedMalIds]));
  // an id that is really an AniList id (mal_id_is_real === false) cannot seed a MAL lookup
  const seeds = anime.mal_id_is_real === false ? [] : ids;
  const cacheKey = `${anime.mal_id}|${relatedMalIds.join(',')}`;
  const [items, setItems] = useState<JikanAnime[] | null>(() => cache.get(cacheKey) ?? null);

  useEffect(() => {
    const hit = cache.get(cacheKey);
    if (hit) {
      setItems(hit);
      return;
    }
    let active = true;
    setItems(null);
    jikanService
      .getRecommendations(seeds, ids)
      .then((list) => {
        const out = list.slice(0, 12);
        cache.set(cacheKey, out);
        if (active) setItems(out);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  if (items && items.length === 0) return null;

  return (
    <section className="frosted-glass rounded-2xl p-4 sm:p-6 space-y-4 relative overflow-hidden min-w-0 xl:col-start-1">
      <div>
        <h3 className="text-base font-bold text-white">You might also like</h3>
        <p className="text-xs text-zinc-400 mt-0.5 truncate">Because you are watching {anime.title_english || anime.title}</p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
        {items === null
          ? Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton aspect-[2/3] rounded-xl" />)
          : items.map((rec) => (
              <button
                key={rec.mal_id}
                type="button"
                onClick={() => onPick(rec)}
                className="group text-left min-w-0 cursor-pointer active:scale-95 transition-transform"
                title={rec.title_english || rec.title}
              >
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 border border-white/10 group-hover:border-[#3fcf8e]/50 transition-colors">
                  <PosterImage
                    src={rec.images?.jpg?.large_image_url || rec.images?.jpg?.image_url}
                    malId={rec.mal_id}
                    alt={rec.title_english || rec.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {typeof rec.score === 'number' && rec.score > 0 && (
                    <span className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 text-[10px] font-bold text-[#3fcf8e]">
                      <Star className="w-2.5 h-2.5 fill-current" />
                      {rec.score.toFixed(1)}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] font-semibold text-zinc-200 group-hover:text-white line-clamp-2 leading-snug">
                  {rec.title_english || rec.title}
                </p>
              </button>
            ))}
      </div>
    </section>
  );
}

export default memo(WatchRecommendations);
