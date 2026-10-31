import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Info, Clock, Shuffle } from 'lucide-react';
import PosterImage from './PosterImage';
import PosterCard, { getReleaseYear } from './PosterCard';
import { SectionHeader, Tabs, PosterRow, ROW_CARD } from './ui';
import { PosterGridSkeleton, PosterRowSkeleton, Skeleton } from './Skeleton';
import NextEpisodeTimer from './NextEpisodeTimer';
import BrowseView from './BrowseView';
import { BrowseCategory, BROWSE_GENRES } from '../lib/browse';
import ScheduleSection from './ScheduleSection';
import { JikanAnime, TrackedAnime, RecentWatch, UserProfile } from '../types';
import { jikanService } from '../lib/jikan';
import { getProgressRatio } from '../lib/progress';
import { prefersReducedMotion } from '../lib/motionPrefs';
import WatchHistoryModal from './WatchHistoryModal';
import { InfoModalTab } from './InfoModals';

interface DashboardProps {
  profile: UserProfile | null;
  searchTerm: string;
  browseCategory?: BrowseCategory | null;
  browseGenre?: string | null;
  trackedList: TrackedAnime[];
  recentWatches: RecentWatch[];
  onOpenDetails: (anime: JikanAnime) => void;
  onPlayAnime: (anime: JikanAnime, episode?: number) => void;
  onQuickToggleWatched: (malId: number, nextEpNum: number) => void;
  onRemoveTracked: (malId: number) => void;
  onRemoveRecentWatch?: (malId: number) => void;
  onClearRecentWatches?: () => void;
  onAddSearchQuery?: (q: string) => void;
  onOpenInfoModal?: (tab: InfoModalTab) => void;
  onBrowse?: (category: BrowseCategory, genre?: string | null) => void;
}

const HERO_MS = 7000;

// Small seeded shuffle so the billboard differs on every visit but stays stable while the page is open
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** "5m ago", "3h ago", "2d ago" */
function timeAgo(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type TopTab = 'trending' | 'season' | 'top';
type LatestTab = 'all' | 'tv' | 'ona';

export default function Dashboard({
  profile,
  searchTerm,
  browseCategory,
  browseGenre,
  trackedList,
  recentWatches,
  onOpenDetails,
  onPlayAnime,
  onQuickToggleWatched,
  onRemoveTracked,
  onRemoveRecentWatch,
  onClearRecentWatches,
  onAddSearchQuery,
  onOpenInfoModal,
  onBrowse,
}: DashboardProps) {
  const dedupeList = (items: JikanAnime[]) => {
    const seen = new Set<number>();
    return items.filter((a) => {
      if (!a || !a.mal_id || seen.has(a.mal_id)) return false;
      seen.add(a.mal_id);
      return true;
    });
  };

  const [isWatchHistoryOpen, setIsWatchHistoryOpen] = useState(false);

  // Group and deduplicate recent watches by anime
  const uniqueRecentWatches = React.useMemo(() => {
    const map = new Map<number, RecentWatch>();
    for (const item of recentWatches) {
      if (!map.has(item.mal_id)) {
        map.set(item.mal_id, item);
      } else {
        const existing = map.get(item.mal_id)!;
        if (
          item.episode_number > existing.episode_number ||
          new Date(item.watched_at).getTime() > new Date(existing.watched_at).getTime()
        ) {
          map.set(item.mal_id, item);
        }
      }
    }
    return Array.from(map.values());
  }, [recentWatches]);

  // Data lanes (live from AniList)
  const [spotlight, setSpotlight] = useState<JikanAnime[]>([]);
  const [heroSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [trendingAnime, setTrendingAnime] = useState<JikanAnime[]>([]);
  const [seriesAnime, setSeriesAnime] = useState<JikanAnime[]>([]);
  const [latestAnime, setLatestAnime] = useState<JikanAnime[]>([]);
  const [recommended, setRecommended] = useState<JikanAnime[]>([]);
  const [lanesLoading, setLanesLoading] = useState(true);
  const [latestLoading, setLatestLoading] = useState(true);
  const [lanesReload, setLanesReload] = useState(0);

  // Sidebar "Top anime" and the latest-episodes filter
  const [topTab, setTopTab] = useState<TopTab>('trending');
  const [topRated, setTopRated] = useState<JikanAnime[]>([]);
  const [topRatedLoading, setTopRatedLoading] = useState(false);
  const [latestTab, setLatestTab] = useState<LatestTab>('all');

  // Search state
  const [searchResults, setSearchResults] = useState<JikanAnime[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Hero Spotlight state
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [isHoveringHero, setIsHoveringHero] = useState(false);

  const heroCountRef = useRef(0);

  // Auto-advance the billboard. Restarts after every change, so picking a slide gives it a full turn.
  useEffect(() => {
    if (spotlight.length === 0 || isHoveringHero || searchTerm.trim().length > 0 || prefersReducedMotion()) return;
    const timer = setTimeout(() => {
      setActiveHeroIndex((prev) => (prev + 1) % Math.max(1, heroCountRef.current));
    }, HERO_MS);
    return () => clearTimeout(timer);
  }, [activeHeroIndex, spotlight.length, isHoveringHero, searchTerm]);

  // Load the live lanes. Each lane fills in as soon as ITS data arrives: the billboard, "Trending now" and
  // "Popular this season" come from one request and no longer wait for "Latest releases" (the slowest one).
  useEffect(() => {
    let active = true;
    setLanesLoading(true);
    jikanService
      .getHomeLanes()
      .then(({ airing, trending, season }) => {
        if (!active) return;
        const pool = dedupeList([...airing.slice(0, 12), ...season.slice(0, 8), ...trending.slice(0, 8)]).filter(
          (a) => a.images?.jpg?.large_image_url && a.synopsis
        );
        setSpotlight(pool);
        setTrendingAnime(dedupeList(trending));
        setSeriesAnime(dedupeList(season));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLanesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [lanesReload]);

  useEffect(() => {
    let active = true;
    setLatestLoading(true);
    jikanService
      .getLatestReleases()
      .then((latest) => {
        if (active) setLatestAnime(dedupeList(latest));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLatestLoading(false);
      });
    return () => {
      active = false;
    };
  }, [lanesReload]);

  // The "Top rated" tab loads the first time it is opened
  useEffect(() => {
    if (topTab !== 'top' || topRated.length > 0) return;
    let active = true;
    setTopRatedLoading(true);
    jikanService
      .browseAnime('top', null, 1)
      .then((res) => {
        if (active) setTopRated(dedupeList(res.items));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setTopRatedLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topTab]);

  // Recommendations come from what the user has watched or tracked
  const seedIds = React.useMemo(() => {
    const ids: number[] = [];
    uniqueRecentWatches.forEach((w) => ids.push(w.mal_id));
    trackedList.forEach((t) => ids.push(t.mal_id));
    return Array.from(new Set(ids));
  }, [uniqueRecentWatches, trackedList]);
  const seedKey = seedIds.slice(0, 4).join(',');
  useEffect(() => {
    let active = true;
    jikanService
      .getRecommendations(seedIds.slice(0, 4), seedIds)
      .then((list) => {
        if (active) setRecommended(dedupeList(list));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  // Handle live search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setSearchError('');
      setLoadingSearch(false);
      return;
    }

    let active = true;
    setLoadingSearch(true);
    setSearchError('');

    const timer = setTimeout(async () => {
      try {
        const results = await jikanService.searchAnime(searchTerm.trim());
        if (active) {
          setSearchResults(dedupeList(results));
          if (results.length === 0) {
            setSearchError(`No anime titles found matching "${searchTerm}".`);
          }
        }
      } catch (err) {
        if (active) {
          console.warn('Search failed:', err);
          setSearchError('Search request could not be completed. Please try again.');
        }
      } finally {
        if (active) setLoadingSearch(false);
      }
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const spotlightList = React.useMemo(() => {
    const picked = seededShuffle(spotlight, heroSeed).slice(0, 7);
    // when we know what the user watches, give two billboard slots to recommendations
    const recs = recommended.filter((r) => r.images?.jpg?.large_image_url && r.synopsis).slice(0, 2);
    if (recs.length > 0 && picked.length >= 4) {
      const base = picked.filter((p) => !recs.some((r) => r.mal_id === p.mal_id)).slice(0, picked.length - recs.length);
      return [base[0], recs[0], ...base.slice(1, 3), ...(recs[1] ? [recs[1]] : []), ...base.slice(3)].filter(Boolean) as JikanAnime[];
    }
    return picked;
  }, [spotlight, recommended, heroSeed]);
  heroCountRef.current = spotlightList.length;
  const currentHero = spotlightList[activeHeroIndex] || spotlightList[0];

  // warm the next hero slides so the carousel never shows a half-loaded banner
  useEffect(() => {
    if (spotlightList.length < 2) return;
    for (let step = 1; step <= 2; step++) {
      const next = spotlightList[(activeHeroIndex + step) % spotlightList.length];
      const url = next?.banner_image || next?.images?.jpg?.large_image_url || next?.images?.jpg?.image_url;
      if (url) {
        const img = new Image();
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.src = url;
      }
    }
  }, [activeHeroIndex, spotlightList]);
  const knownAnime = [...spotlight, ...trendingAnime, ...seriesAnime, ...latestAnime, ...recommended];

  const topList = topTab === 'trending' ? trendingAnime : topTab === 'season' ? seriesAnime : topRated;
  const topIsLoading = topTab === 'top' ? topRatedLoading : lanesLoading;

  const latestFiltered = React.useMemo(() => {
    if (latestTab === 'all') return latestAnime;
    const wanted = latestTab === 'tv' ? 'TV' : 'ONA';
    return latestAnime.filter((a) => (a.type || 'TV').toUpperCase() === wanted);
  }, [latestAnime, latestTab]);

  const retryButton = (
    <button
      type="button"
      onClick={() => setLanesReload((n) => n + 1)}
      className="px-4 py-2 rounded-md bg-[#3fcf8e] text-[#04120d] text-xs font-bold cursor-pointer active:scale-95 transition-transform"
    >
      Try again
    </button>
  );

  const heroTitle = currentHero ? currentHero.title_english || currentHero.title : '';
  const heroYear = currentHero ? getReleaseYear(currentHero) : '';

  return (
    <div className="flex-1 w-full aurora-canvas text-zinc-100 flex flex-col font-sans pb-16 relative overflow-x-hidden">
      {/* Search results */}
      {searchTerm.trim().length > 0 ? (
        <div className="max-w-[1760px] mx-auto px-4 sm:px-8 py-8 w-full space-y-6">
          <div className="flex items-end justify-between gap-4 border-b border-[#2a2b2a] pb-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-white">
                Results for “{searchTerm}”
              </h1>
              {!loadingSearch && !searchError && (
                <p className="text-xs text-zinc-400 mt-1">
                  {searchResults.length} {searchResults.length === 1 ? 'title' : 'titles'} found
                </p>
              )}
            </div>
            {onAddSearchQuery && (
              <button
                onClick={() => onAddSearchQuery(searchTerm)}
                className="text-xs font-semibold text-[#3fcf8e] hover:underline cursor-pointer"
              >
                Save search
              </button>
            )}
          </div>

          {loadingSearch ? (
            <PosterGridSkeleton count={12} />
          ) : searchError ? (
            <div className="py-20 text-center space-y-2">
              <p className="text-sm text-zinc-300">{searchError}</p>
              <p className="text-xs text-zinc-500">Check the spelling or try a more popular title.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 min-[1700px]:grid-cols-8 gap-x-3 sm:gap-x-4 gap-y-6">
              {searchResults.map((anime) => (
                <PosterCard key={`search-card-${anime.mal_id}`} anime={anime} onOpen={onOpenDetails} />
              ))}
            </div>
          )}
        </div>
      ) : browseCategory ? (
        <BrowseView category={browseCategory} initialGenre={browseGenre ?? null} onOpenDetails={onOpenDetails} />
      ) : (
        <>
          {/* ===================== Spotlight ===================== */}
          {!currentHero && lanesLoading && (
            <div className="skeleton w-full min-h-[460px] sm:min-h-[540px] lg:min-h-[600px] border-b border-[#2a2b2a]" />
          )}
          {currentHero && (
            <section
              onMouseEnter={() => setIsHoveringHero(true)}
              onMouseLeave={() => setIsHoveringHero(false)}
              onFocus={() => setIsHoveringHero(true)}
              onBlur={() => setIsHoveringHero(false)}
              className="relative w-full min-h-[460px] sm:min-h-[540px] lg:min-h-[600px] flex items-end overflow-hidden border-b border-[#2a2b2a]"
              aria-label="Spotlight"
            >
              <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <AnimatePresence mode="sync">
                  <motion.img
                    key={`hero-bg-${currentHero.mal_id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.85 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    src={currentHero.banner_image || currentHero.images.jpg.large_image_url || currentHero.images.jpg.image_url}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={async (e) => {
                      const el = e.currentTarget;
                      if (el.dataset.recovered) return;
                      el.dataset.recovered = '1';
                      const fresh = await jikanService.getPosterByMalId(currentHero.mal_id);
                      if (fresh) el.src = fresh;
                    }}
                    className="absolute inset-0 w-full h-full object-cover object-right-top md:object-right"
                  />
                </AnimatePresence>
                {/* scrims keep the text readable on any artwork */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#0c0d0c] via-[#0c0d0c]/75 md:via-[#0c0d0c]/45 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d0c] via-[#0c0d0c]/25 to-transparent" />
              </div>

              <div className="relative z-10 mx-auto w-full max-w-[1760px] px-4 sm:px-8 pt-24 pb-8 sm:pb-12">
                <div className="flex items-end justify-between gap-10">
                  <motion.div
                    key={`hero-text-${currentHero.mal_id}`}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className="max-w-xl lg:max-w-2xl"
                  >
                    <h1 className="font-display font-extrabold tracking-tight text-3xl sm:text-5xl lg:text-6xl leading-[1.05] text-white line-clamp-3">
                      {heroTitle}
                    </h1>

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-300">
                      {currentHero.score ? (
                        <span className="font-mono font-semibold text-[#e8b84a]">★ {currentHero.score.toFixed(1)}</span>
                      ) : null}
                      {currentHero.type ? <span className="font-semibold text-white">{currentHero.type}</span> : null}
                      {heroYear ? <span className="font-mono">{heroYear}</span> : null}
                      {currentHero.episodes ? <span className="font-mono">{currentHero.episodes} eps</span> : null}
                      {currentHero.genres && currentHero.genres.length > 0 ? (
                        <span className="text-zinc-400">{currentHero.genres.slice(0, 3).map((g) => g.name).join(', ')}</span>
                      ) : null}
                    </div>

                    <NextEpisodeTimer
                      key={`hero-timer-${currentHero.mal_id}`}
                      malId={currentHero.mal_id}
                      anilistId={currentHero.anilist_id}
                      compact
                      className="mt-3"
                    />

                    {currentHero.synopsis && (
                      <p className="mt-4 max-w-lg text-sm leading-relaxed text-zinc-300 line-clamp-3">{currentHero.synopsis}</p>
                    )}

                    <div className="mt-6 flex items-center gap-2.5">
                      <button
                        id="hero-watch-btn"
                        onClick={() => onPlayAnime(currentHero, 1)}
                        className="flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#3fcf8e] px-6 py-3 font-display text-sm font-bold text-[#04120d] transition-colors hover:bg-[#6af0b8] active:scale-[0.98] cursor-pointer"
                      >
                        <Play className="h-4 w-4 fill-current" />
                        <span>Watch now</span>
                      </button>

                      <button
                        id="hero-details-btn"
                        onClick={() => onOpenDetails(currentHero)}
                        className="flex items-center justify-center gap-2 whitespace-nowrap rounded-md frosted-glass-interactive px-5 py-3 font-display text-sm font-bold text-white active:scale-[0.98] cursor-pointer"
                      >
                        <Info className="h-4 w-4 text-zinc-300" />
                        <span>Details</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const pool = knownAnime.filter((a) => a.mal_id !== currentHero.mal_id);
                          if (pool.length > 0) onOpenDetails(pool[Math.floor(Math.random() * pool.length)]);
                        }}
                        className="rounded-md frosted-glass-interactive p-3 text-zinc-200 hover:text-white active:scale-[0.98] cursor-pointer"
                        title="Surprise me"
                        aria-label="Open a random anime"
                      >
                        <Shuffle className="h-4 w-4" />
                      </button>
                    </div>
                  </motion.div>

                  {/* Slide picker: poster thumbnails on desktop */}
                  <div className="hidden lg:flex items-end gap-2 shrink-0 pb-1" role="tablist" aria-label="Choose spotlight">
                    {spotlightList.map((item, i) => (
                      <button
                        key={`hero-thumb-${item.mal_id}`}
                        type="button"
                        role="tab"
                        aria-selected={activeHeroIndex === i}
                        aria-label={`Show ${item.title_english || item.title}`}
                        onClick={() => setActiveHeroIndex(i)}
                        className={`relative h-[88px] w-[60px] overflow-hidden rounded border-2 bg-[#1b1c1b] cursor-pointer transition-all ${
                          activeHeroIndex === i
                            ? 'border-[#3fcf8e]'
                            : 'border-transparent opacity-55 hover:opacity-100'
                        }`}
                      >
                        <PosterImage
                          src={item.images?.jpg?.image_url || item.images?.jpg?.large_image_url}
                          malId={item.mal_id}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slide picker: dots on phones and tablets */}
                <div className="mt-4 flex items-center gap-1 lg:hidden">
                  {spotlightList.map((_, i) => (
                    <button
                      key={`hero-dot-${i}`}
                      type="button"
                      onClick={() => setActiveHeroIndex(i)}
                      className="flex h-8 cursor-pointer items-center"
                      aria-label={`Go to slide ${i + 1}`}
                      aria-current={activeHeroIndex === i}
                    >
                      <span
                        className={`block h-1.5 rounded-full transition-all ${
                          activeHeroIndex === i ? 'w-7 bg-[#3fcf8e]' : 'w-2 bg-white/25'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ===================== Page body ===================== */}
          <main className="max-w-[1760px] mx-auto px-4 sm:px-8 w-full mt-8 sm:mt-10 space-y-10 sm:space-y-12">
            {/* Continue watching */}
            {uniqueRecentWatches.length > 0 && (
              <section>
                <SectionHeader title="Continue watching" icon={<Clock className="h-4 w-4 text-[#3fcf8e]" />}>
                  {onClearRecentWatches && (
                    <button
                      onClick={onClearRecentWatches}
                      className="text-xs text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      Clear history
                    </button>
                  )}
                  <button
                    onClick={() => setIsWatchHistoryOpen(true)}
                    className="text-xs font-semibold text-[#3fcf8e] hover:underline cursor-pointer"
                  >
                    View all ({recentWatches.length})
                  </button>
                </SectionHeader>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                  {uniqueRecentWatches.slice(0, 5).map((item) => {
                    const ratio = getProgressRatio(`${item.mal_id}:1:${item.episode_number}`);
                    return (
                      <div
                        key={`recent-card-${item.mal_id}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Resume ${item.anime_title}, episode ${item.episode_number}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).click();
                          }
                        }}
                        onClick={() => {
                          const target =
                            knownAnime.find((a) => a.mal_id === item.mal_id) ||
                            ({
                              mal_id: item.mal_id,
                              title: item.anime_title,
                              images: { jpg: { image_url: item.image_url, large_image_url: item.image_url } },
                            } as JikanAnime);
                          onPlayAnime(target, item.episode_number);
                        }}
                        className="group cursor-pointer flex flex-col min-w-0"
                      >
                        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-[#1b1c1b] border border-white/10 group-hover:border-[#3fcf8e]/60 transition-colors">
                          <img
                            src={item.image_url}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3fcf8e] text-[#04120d]">
                              <Play className="ml-0.5 h-4 w-4 fill-current" />
                            </span>
                          </div>
                          <span className="absolute bottom-2 left-2 rounded bg-[#3fcf8e] px-1.5 py-0.5 text-[11px] font-bold leading-none text-[#04120d] font-mono">
                            EP {item.episode_number}
                          </span>
                          {ratio > 0 ? (
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" aria-label="Watched so far">
                              <div className="h-full bg-[#3fcf8e]" style={{ width: `${Math.round(ratio * 100)}%` }} />
                            </div>
                          ) : null}
                        </div>
                        <h4 className="mt-2 truncate font-display text-[13px] sm:text-sm font-semibold text-zinc-100 transition-colors group-hover:text-[#3fcf8e]">
                          {item.anime_title}
                        </h4>
                        <p className="truncate text-[11px] text-zinc-500">
                          {item.episode_title || `Episode ${item.episode_number}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="grid gap-10 xl:gap-8 xl:grid-cols-[minmax(0,1fr)_21rem]">
              {/* ---------- Main column ---------- */}
              <div className="min-w-0 space-y-10 sm:space-y-12">
                <PosterRow title="Trending now">
                  {trendingAnime.length === 0 && lanesLoading && <PosterRowSkeleton />}
                  {trendingAnime.length === 0 && !lanesLoading && (
                    <div className="w-full py-10 text-center space-y-3">
                      <p className="text-sm text-zinc-400">Couldn't load the catalog right now.</p>
                      {retryButton}
                    </div>
                  )}
                  {trendingAnime.slice(0, 12).map((anime, i) => (
                    <PosterCard key={`trending-${anime.mal_id}`} anime={anime} onOpen={onOpenDetails} priority={i < 4} className={ROW_CARD} />
                  ))}
                </PosterRow>

                <section className="min-w-0">
                  <SectionHeader title="Latest episodes" note="Aired in the last 7 days">
                    <Tabs
                      label="Filter latest episodes"
                      value={latestTab}
                      onChange={setLatestTab}
                      tabs={[
                        { id: 'all', label: 'All' },
                        { id: 'tv', label: 'TV' },
                        { id: 'ona', label: 'ONA' },
                      ]}
                    />
                  </SectionHeader>

                  {!latestLoading && latestAnime.length === 0 && (
                    <div className="py-10 text-center space-y-3">
                      <p className="text-sm text-zinc-400">Couldn't load the latest episodes right now.</p>
                      {retryButton}
                    </div>
                  )}
                  {!latestLoading && latestAnime.length > 0 && latestFiltered.length === 0 && (
                    <p className="py-10 text-center text-sm text-zinc-500">No {latestTab.toUpperCase()} episodes aired this week.</p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 min-[1500px]:grid-cols-6 gap-x-3 sm:gap-x-4 gap-y-6">
                    {latestAnime.length === 0 &&
                      latestLoading &&
                      Array.from({ length: 12 }).map((_, i) => (
                        <div key={`latest-sk-${i}`} className="flex flex-col">
                          <Skeleton className="aspect-[2/3] w-full rounded-md" />
                          <Skeleton className="h-3 w-4/5 mt-3" />
                        </div>
                      ))}
                    {latestFiltered.slice(0, 12).map((anime) => (
                      <PosterCard
                        key={`latest-${anime.mal_id}`}
                        anime={anime}
                        onOpen={onOpenDetails}
                        caption={anime.aired_at ? timeAgo(anime.aired_at) : undefined}
                      />
                    ))}
                  </div>
                </section>

                <PosterRow title="Popular this season">
                  {seriesAnime.length === 0 && lanesLoading && <PosterRowSkeleton />}
                  {seriesAnime.slice(0, 12).map((anime) => (
                    <PosterCard key={`season-${anime.mal_id}`} anime={anime} onOpen={onOpenDetails} className={ROW_CARD} />
                  ))}
                </PosterRow>

                {recommended.length > 0 && (
                  <PosterRow title={seedIds.length > 0 ? 'Recommended for you' : 'Top rated'}>
                    {recommended.slice(0, 12).map((anime) => (
                      <PosterCard key={`rec-${anime.mal_id}`} anime={anime} onOpen={onOpenDetails} className={ROW_CARD} />
                    ))}
                  </PosterRow>
                )}

                <ScheduleSection onOpenDetails={onOpenDetails} />
              </div>

              {/* ---------- Sidebar ---------- */}
              <aside className="min-w-0 space-y-6">
                <section className="rounded-lg border border-[#2a2b2a] bg-[#151615] p-4">
                  <SectionHeader title="Top anime" />
                  <div className="mb-3">
                    <Tabs
                      label="Choose ranking"
                      value={topTab}
                      onChange={setTopTab}
                      tabs={[
                        { id: 'trending', label: 'Trending' },
                        { id: 'season', label: 'Season' },
                        { id: 'top', label: 'Top rated' },
                      ]}
                    />
                  </div>

                  {topList.length === 0 && topIsLoading ? (
                    <div className="space-y-2" role="status" aria-label="Loading ranking">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-[62px] rounded-md" />
                      ))}
                    </div>
                  ) : topList.length === 0 ? (
                    <p className="py-6 text-center text-xs text-zinc-500">Nothing to show right now.</p>
                  ) : (
                    <ol className="divide-y divide-[#2a2b2a]">
                      {topList.slice(0, 10).map((anime, i) => (
                        <li key={`top-${topTab}-${anime.mal_id}`}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => onOpenDetails(anime)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onOpenDetails(anime);
                              }
                            }}
                            className="group flex cursor-pointer items-center gap-3 py-2.5 transition-colors"
                          >
                            <span
                              className={`w-6 shrink-0 text-center font-display text-lg font-extrabold ${
                                i < 3 ? 'text-[#3fcf8e]' : 'text-zinc-600'
                              }`}
                            >
                              {i + 1}
                            </span>
                            <PosterImage
                              src={anime.images?.jpg?.image_url || anime.images?.jpg?.large_image_url}
                              malId={anime.mal_id}
                              alt=""
                              className="h-[62px] w-11 shrink-0 rounded object-cover bg-[#1b1c1b]"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-100 transition-colors group-hover:text-[#3fcf8e]">
                                {anime.title_english || anime.title}
                              </p>
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                                {anime.type ? <span>{anime.type}</span> : null}
                                {anime.score ? <span className="font-mono text-[#e8b84a]">★ {anime.score.toFixed(1)}</span> : null}
                                {anime.episodes ? <span className="font-mono">{anime.episodes} eps</span> : null}
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                {onBrowse && (
                  <section className="rounded-lg border border-[#2a2b2a] bg-[#151615] p-4">
                    <SectionHeader title="Browse by genre" />
                    <div className="flex flex-wrap gap-1.5">
                      {BROWSE_GENRES.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => onBrowse('popular', g)}
                          className="rounded-md border border-[#2a2b2a] bg-[#1b1c1b] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-[#3fcf8e]/50 hover:text-white cursor-pointer"
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </aside>
            </div>
          </main>
        </>
      )}

      {/* History Modal */}
      <WatchHistoryModal
        isOpen={isWatchHistoryOpen}
        onClose={() => setIsWatchHistoryOpen(false)}
        recentWatches={recentWatches}
        onPlayAnime={(placeholder, episode) => {
          const anime = knownAnime.find((a) => a.mal_id === placeholder.mal_id) || placeholder;
          onPlayAnime(anime, episode);
        }}
        onRemoveWatch={(malId) => onRemoveRecentWatch?.(malId)}
        onClearAll={() => onClearRecentWatches?.()}
      />
    </div>
  );
}
