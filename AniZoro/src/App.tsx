import { DISCORD_URL } from './lib/links';
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams, useLocation, useNavigationType } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { storageService, deleteAllCookies } from './lib/storage';
import { UserProfile, TrackedAnime, RecentWatch, JikanAnime } from './types';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import AnimeDetailModal from './components/AnimeDetailModal';
import WatchPlayer from './components/WatchPlayer';
import AniZoroLogo from './components/AniZoroLogo';
import InfoModals, { InfoModalTab } from './components/InfoModals';
import LandingHero from './components/LandingHero';
import { PageSkeleton } from './components/Skeleton';
import type { BrowseCategory } from './lib/browse';
import { BROWSE_GENRES } from './lib/browse';
import { jikanService } from './lib/jikan';
import { KNOWN_FRANCHISE_MAP } from './lib/franchiseMap';
import { KNOWN_ANIME_TMDB_MAP } from './lib/animeTmdbMap';

import { parseAnimeSlug, getAnimeSlug } from './lib/slug';

const LANDING_DONE_KEY = 'anizoro_landing_done';

function hasLeftLanding(): boolean {
  try {
    return sessionStorage.getItem(LANDING_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function LandingContainer({
  setSearchTerm,
}: {
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
}) {
  const navigate = useNavigate();
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [infoModalTab, setInfoModalTab] = useState<InfoModalTab>('about');

  const handleOpenInfoModal = (tab: InfoModalTab) => {
    setInfoModalTab(tab);
    setIsInfoModalOpen(true);
  };

  // The landing page is only for a freshly opened tab: once the user leaves it,
  // it is replaced in history so Back never returns to it.
  const leaveLanding = (to: string, state?: Record<string, unknown>) => {
    try {
      sessionStorage.setItem(LANDING_DONE_KEY, '1');
    } catch {
      /* storage unavailable */
    }
    navigate(to, { replace: true, state });
  };

  return (
    <>
      <LandingHero
        onSearch={(q) => {
          setSearchTerm(q);
          leaveLanding('/anime', { searching: true });
        }}
        onVisitHome={() => {
          leaveLanding('/anime');
        }}
        onSelectAnime={(anime) => {
          leaveLanding(`/anime/${getAnimeSlug(anime)}`);
        }}
        onOpenInfoModal={handleOpenInfoModal}
      />

      <InfoModals
        isOpen={isInfoModalOpen}
        initialTab={infoModalTab}
        onClose={() => setIsInfoModalOpen(false)}
      />
    </>
  );
}

interface DashboardContainerProps {
  loadingAuth: boolean;
  profile: UserProfile | null;
  selectedAnime: JikanAnime | null;
  setSelectedAnime: React.Dispatch<React.SetStateAction<JikanAnime | null>>;
  trackedList: TrackedAnime[];
  setTrackedList: React.Dispatch<React.SetStateAction<TrackedAnime[]>>;
  recentWatches: RecentWatch[];
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  handleLogout: () => void;
  handleUpdateTracked: (item: TrackedAnime) => Promise<void> | void;
  handleRemoveTracked: (malId: number) => Promise<void> | void;
  handleAddRecentWatch: (malId: number, title: string, imageUrl: string, epNum: number, epTitle: string) => Promise<void> | void;
  handleRemoveRecentWatch: (malId: number) => Promise<void> | void;
  handleClearRecentWatches: () => Promise<void> | void;
  handleQuickToggleWatched: (malId: number, nextEpNum: number) => Promise<void> | void;
  handleAddSearchQuery: (query: string) => void;
  handleRemoveSearchQuery: (query: string) => void;
  watchedActiveCount: number;
  completedCount: number;
}

const DashboardContainer = ({
  loadingAuth,
  profile,
  selectedAnime,
  setSelectedAnime,
  trackedList,
  setTrackedList,
  recentWatches,
  searchTerm,
  setSearchTerm,
  handleLogout,
  handleUpdateTracked,
  handleRemoveTracked,
  handleAddRecentWatch,
  handleRemoveRecentWatch,
  handleClearRecentWatches,
  handleQuickToggleWatched,
  handleAddSearchQuery,
  handleRemoveSearchQuery,
  watchedActiveCount,
  completedCount,
}: DashboardContainerProps) => {
  const { animeSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navType = useNavigationType();
  const [loadingDetail, setLoadingDetail] = useState(false);

  // The active catalog section (Movies, Series...) is kept in the history entry, so Back returns to the previous page.
  const browseCategory = ((location.state as { browse?: BrowseCategory } | null)?.browse ?? null) as BrowseCategory | null;
  const browseGenre = ((location.state as { genre?: string | null } | null)?.genre ?? null) as string | null;
  const handleBrowse = (category: BrowseCategory, genre: string | null = null) => {
    setSearchTerm('');
    navigate('/anime', { state: { browse: category, genre } });
  };

  // Starting a search adds one history entry; pressing Back then clears the search and shows the home page.
  const isSearchEntry = Boolean((location.state as { searching?: boolean } | null)?.searching);
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    if (val.trim() && !isSearchEntry && !animeSlug) {
      navigate(location.pathname, { state: { searching: true } });
    }
  };
  useEffect(() => {
    if (navType === 'POP' && !isSearchEntry && !animeSlug && searchTerm.trim()) {
      setSearchTerm('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [infoModalTab, setInfoModalTab] = useState<InfoModalTab>('about');

  const handleOpenInfoModal = (tab: InfoModalTab) => {
    setInfoModalTab(tab);
    setIsInfoModalOpen(true);
  };

  useEffect(() => {
    if (!animeSlug) {
      setSelectedAnime(null);
      return;
    }
    const parsed = parseAnimeSlug(animeSlug);
    if (!parsed) {
      navigate('/anime', { replace: true });
      return;
    }
    if (selectedAnime?.mal_id === parsed.malId) {
      return;
    }

    let active = true;
    const fetchDetails = async () => {
      setLoadingDetail(true);
      try {
        const details = await jikanService.getAnimeDetails(parsed.malId);
        if (active) {
          setSelectedAnime(details);
        }
      } catch (err) {
        console.error('Failed to load details for slug:', err);
        if (active) {
          // Provide instant playable anime stub with the parsed malId instead of kicking back to home
          const fallbackAnime: JikanAnime = {
            mal_id: parsed.malId,
            title: parsed.slugTitle ? parsed.slugTitle.replace(/-/g, ' ') : `Anime Series`,
            title_english: parsed.slugTitle ? parsed.slugTitle.replace(/-/g, ' ') : `Anime Series`,
            title_japanese: null,
            images: {
              jpg: {
                image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-6DvdnZ2HDpqM.jpg',
                large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-6DvdnZ2HDpqM.jpg'
              }
            },
            trailer: null,
            episodes: 24,
            status: 'Finished Airing',
            synopsis: 'Streaming episode directly from cloud mirror.',
            score: 8.5,
            genres: [],
            studios: [],
            type: 'TV'
          };
          setSelectedAnime(fallbackAnime);
        }
      } finally {
        if (active) {
          setLoadingDetail(false);
        }
      }
    };
    fetchDetails();
    return () => { active = false; };
  }, [animeSlug, navigate]);

  if (loadingAuth || loadingDetail) {
    return <LoadingScreen />;
  }


  const handlePlayAnime = (anime: JikanAnime, customEp?: number) => {
    const recent = recentWatches.find(r => r.mal_id === anime.mal_id);
    let nextEpisode = customEp || 1;
    if (!customEp) {
      if (recent) {
        nextEpisode = recent.episode_number;
      } else {
        const tracked = trackedList.find(t => t.mal_id === anime.mal_id);
        if (tracked && tracked.watched_episodes.length > 0) {
          const maxWatched = Math.max(...tracked.watched_episodes);
          nextEpisode = maxWatched + 1;
          if (tracked.episodes_count && nextEpisode > tracked.episodes_count) {
            nextEpisode = tracked.episodes_count;
          }
        }
      }
    }

    // Determine true season number for franchise cour parts or standalone entries
    const knownFranchise = KNOWN_FRANCHISE_MAP[anime.mal_id];
    const franchisePart = knownFranchise?.parts.find(p => p.mal_id === anime.mal_id);
    const tmdbMapped = KNOWN_ANIME_TMDB_MAP[anime.mal_id];
    const targetSeason = franchisePart?.seasonNumber || tmdbMapped?.season || 1;

    navigate(`/anime/${getAnimeSlug(anime)}/s${targetSeason}/${nextEpisode}`);
  };

  return (
    <motion.div key="main-app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex flex-col min-h-screen">
      <Navbar
        profile={profile}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        onBrowse={handleBrowse}
        activeBrowse={searchTerm.trim() ? null : browseCategory}
        activeGenre={searchTerm.trim() ? null : browseGenre}
        onLogout={handleLogout}
        watchedCount={watchedActiveCount}
        completedCount={completedCount}
        onAddSearchQuery={handleAddSearchQuery}
        onRemoveSearchQuery={handleRemoveSearchQuery}
        onOpenInfoModal={handleOpenInfoModal}
        onSelectAnime={(anime) => {
          navigate(`/anime/${getAnimeSlug(anime)}`);
        }}
      />
      
      <Dashboard
        profile={profile}
        searchTerm={searchTerm}
        browseCategory={browseCategory}
        browseGenre={browseGenre}
        onBrowse={handleBrowse}
        trackedList={trackedList}
        recentWatches={recentWatches}
        onOpenDetails={(anime) => navigate(`/anime/${getAnimeSlug(anime)}`, { state: location.state })}
        onPlayAnime={handlePlayAnime}
        onQuickToggleWatched={handleQuickToggleWatched}
        onRemoveTracked={handleRemoveTracked}
        onRemoveRecentWatch={handleRemoveRecentWatch}
        onClearRecentWatches={handleClearRecentWatches}
        onAddSearchQuery={handleAddSearchQuery}
        onOpenInfoModal={handleOpenInfoModal}
      />

      {/* Info, Legal, DMCA & Settings Modal */}
      <InfoModals
        isOpen={isInfoModalOpen}
        initialTab={infoModalTab}
        onClose={() => setIsInfoModalOpen(false)}
      />

      <footer className="w-full mt-auto border-t border-[#2a2b2a] bg-[#0c0d0c] text-sm font-sans relative z-10">
        <div className="max-w-[1760px] mx-auto px-4 sm:px-8 pt-10 pb-8">
          <div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-x-6 gap-y-8">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1 space-y-3">
              <AniZoroLogo size="md" />
              <p className="text-[13px] text-zinc-400 max-w-md leading-relaxed">
                A catalog and discovery platform for anime. AniZoro does not host or store any media files; all video is provided by independent third-party services.
              </p>
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-[#5865F2]/15 border border-[#5865F2]/40 text-[#aab2ff] hover:bg-[#5865F2] hover:text-white transition-colors text-[13px] font-semibold"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.191.328-.403.77-.552 1.12a18.27 18.27 0 0 0-5.487 0A12.6 12.6 0 0 0 9.29 3a19.74 19.74 0 0 0-4.433 1.37C2.056 8.56 1.296 12.644 1.676 16.67a19.9 19.9 0 0 0 6.073 3.07c.49-.667.926-1.376 1.3-2.12a12.9 12.9 0 0 1-2.047-.98c.172-.126.34-.258.502-.394 3.95 1.82 8.226 1.82 12.129 0 .164.136.332.268.502.394-.653.385-1.34.713-2.05.98.375.744.81 1.453 1.3 2.12a19.86 19.86 0 0 0 6.075-3.07c.446-4.667-.762-8.714-3.143-12.3ZM8.68 14.2c-1.183 0-2.157-1.085-2.157-2.42s.955-2.42 2.157-2.42c1.21 0 2.176 1.095 2.157 2.42 0 1.335-.955 2.42-2.157 2.42Zm6.64 0c-1.183 0-2.157-1.085-2.157-2.42s.955-2.42 2.157-2.42c1.21 0 2.176 1.095 2.157 2.42 0 1.335-.947 2.42-2.157 2.42Z"/></svg>
                Join our community
              </a>
            </div>

            {/* Browse */}
            <nav aria-label="Browse" className="space-y-3">
              <h3 className="text-xs font-semibold tracking-tight text-zinc-500">Browse</h3>
              <ul className="space-y-2.5">
                <li><button type="button" onClick={() => handleBrowse('movies')} className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer text-left">Movies</button></li>
                <li><button type="button" onClick={() => handleBrowse('series')} className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer text-left">Series</button></li>
                <li><button type="button" onClick={() => handleBrowse('new')} className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer text-left">New releases</button></li>
                <li><button type="button" onClick={() => handleBrowse('popular')} className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer text-left">Popular</button></li>
                <li><button type="button" onClick={() => handleBrowse('top')} className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer text-left">Top rated</button></li>
              </ul>
            </nav>

            {/* Company */}
            <nav aria-label="Company" className="space-y-3">
              <h3 className="text-xs font-semibold tracking-tight text-zinc-500">Company</h3>
              <ul className="space-y-2.5">
                <li><button type="button" onClick={() => handleOpenInfoModal('about')} className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer text-left">About</button></li>
                <li><button type="button" onClick={() => handleOpenInfoModal('terms')} className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer text-left">Terms of Service</button></li>
                <li><button type="button" onClick={() => handleOpenInfoModal('privacy')} className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer text-left">Privacy Policy</button></li>
              </ul>
            </nav>

            {/* Support */}
            <nav aria-label="Support" className="space-y-3">
              <h3 className="text-xs font-semibold tracking-tight text-zinc-500">Support</h3>
              <ul className="space-y-2.5">
                <li><button type="button" onClick={() => handleOpenInfoModal('faq')} className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer text-left">FAQ &amp; Help</button></li>
                <li><button type="button" onClick={() => handleOpenInfoModal('dmca')} className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer text-left">DMCA Policy</button></li>
                <li><button type="button" onClick={() => handleOpenInfoModal('contact')} className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer text-left">Contact</button></li>
                <li><button type="button" onClick={() => handleOpenInfoModal('settings')} className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer text-left">Preferences</button></li>
              </ul>
            </nav>
          </div>

          <div className="mt-10 pt-6 border-t border-[#2a2b2a]">
            <h3 className="text-xs font-semibold tracking-tight text-zinc-500 mb-3">Genres</h3>
            <div className="flex flex-wrap gap-1.5">
              {BROWSE_GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => handleBrowse('popular', g)}
                  className="rounded-md border border-[#2a2b2a] bg-[#151615] px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-[#3fcf8e]/50 hover:text-white cursor-pointer"
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-[#2a2b2a] flex flex-col-reverse sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-zinc-500">
            <p>© {new Date().getFullYear()} AniZoro. All rights reserved.</p>
            <p>Built by <span className="font-semibold text-zinc-300">Yash</span></p>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {selectedAnime && animeSlug && (
          <AnimeDetailModal
            anime={selectedAnime}
            isOpen={Boolean(selectedAnime && animeSlug)}
            profile={profile}
            isTracked={Boolean(trackedList.find((x) => x.mal_id === selectedAnime.mal_id))}
            onClose={() => {
              setSelectedAnime(null);
              setTrackedList(storageService.getTrackerList());
              navigate('/anime', { state: location.state });
            }}
            onToggleTracked={(targetAnime) => {
              const exists = trackedList.find((x) => x.mal_id === targetAnime.mal_id);
              if (exists) {
                handleRemoveTracked(targetAnime.mal_id);
              } else {
                handleUpdateTracked({
                  mal_id: targetAnime.mal_id,
                  title: targetAnime.title_english || targetAnime.title,
                  image_url: targetAnime.images.jpg.large_image_url || targetAnime.images.jpg.image_url,
                  episodes_count: targetAnime.episodes || 12,
                  watched_episodes: [],
                  status: 'watching',
                  last_watched_at: new Date().toISOString(),
                  my_rating: 0,
                  my_notes: '',
                });
              }
            }}
            onPlayEpisode={(targetAnime, epNum, customSeason) => {
              const an = targetAnime || selectedAnime;
              const s = customSeason || 1;
              navigate(`/anime/${getAnimeSlug(an)}/s${s}/${epNum}`);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface PlayerContainerProps {
  loadingAuth: boolean;
  profile: UserProfile | null;
  trackedList: TrackedAnime[];
  handleFinishEpisodeFromPlayer: (anime: JikanAnime, epNum: number, epTitle: string) => Promise<void> | void;
}

const PlayerContainer = ({
  loadingAuth,
  profile,
  trackedList,
  handleFinishEpisodeFromPlayer,
}: PlayerContainerProps) => {
  const { animeSlug, season, episode } = useParams();
  const navigate = useNavigate();
  const [playerAnime, setPlayerAnime] = useState<JikanAnime | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);

  const episodeNum = parseInt(episode || '1', 10) || 1;
  const seasonNum = season ? parseInt(season.replace(/^s/i, ''), 10) || 1 : 1;

  useEffect(() => {
    if (!animeSlug) return;
    const parsed = parseAnimeSlug(animeSlug);
    if (!parsed) {
      navigate('/anime', { replace: true });
      return;
    }

    // If playerAnime is already loaded with full details and the same mal_id, avoid re-fetching
    if (playerAnime && playerAnime.mal_id === parsed.malId && playerAnime.synopsis) {
      return;
    }

    let active = true;
    const fetchDetails = async () => {
      // Only show full loading screen if we don't have playerAnime at all yet
      if (!playerAnime || playerAnime.mal_id !== parsed.malId) {
        setLoadingPlayer(true);
      }
      try {
        const details = await jikanService.getAnimeDetails(parsed.malId);
        if (active) {
          setPlayerAnime(details);
        }
      } catch (err) {
        console.error('Failed to load anime details for player:', err);
        if (active && !playerAnime) {
          const fallbackAnime: JikanAnime = {
            mal_id: parsed.malId,
            title: parsed.slugTitle ? parsed.slugTitle.replace(/-/g, ' ') : `Anime Series`,
            title_english: parsed.slugTitle ? parsed.slugTitle.replace(/-/g, ' ') : `Anime Series`,
            title_japanese: null,
            images: {
              jpg: {
                image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-6DvdnZ2HDpqM.jpg',
                large_image_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-6DvdnZ2HDpqM.jpg'
              }
            },
            trailer: null,
            episodes: 24,
            status: 'Finished Airing',
            synopsis: 'Streaming episode directly from cloud mirror.',
            score: 8.5,
            genres: [],
            studios: [],
            type: 'TV'
          };
          setPlayerAnime(fallbackAnime);
        }
      } finally {
        if (active) {
          setLoadingPlayer(false);
        }
      }
    };
    fetchDetails();
    return () => { active = false; };
  }, [animeSlug, navigate]);

  if (loadingAuth || (loadingPlayer && !playerAnime) || !playerAnime) {
    return <LoadingScreen variant="player" />;
  }

  return (
    <motion.div key="player" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.4 }} className="absolute inset-0 z-50">
      <WatchPlayer
        anime={playerAnime}
        episodeNumber={episodeNum}
        episodeTitle={`Episode ${episodeNum}`}
        seasonNumber={seasonNum}
        isFinished={(trackedList.find((x) => x.mal_id === playerAnime.mal_id)?.watched_episodes || []).includes(episodeNum)}
        onClose={() => navigate(`/anime/${getAnimeSlug(playerAnime)}`)}
        onFinishEpisode={(epNum) => handleFinishEpisodeFromPlayer(playerAnime, epNum, `Episode ${epNum}`)}
        onEpisodeChange={(epNum, newSeasonNum, targetAnime) => {
          const an = targetAnime || playerAnime;
          const s = newSeasonNum || seasonNum;
          if (targetAnime && targetAnime.mal_id !== playerAnime.mal_id) {
            setPlayerAnime(targetAnime);
          }
          navigate(`/anime/${getAnimeSlug(an)}/s${s}/${epNum}`, { replace: true });
        }}
        onSeasonChange={(newSeasonNum, targetAnime) => {
          const an = targetAnime || playerAnime;
          if (targetAnime && targetAnime.mal_id !== playerAnime.mal_id) {
            setPlayerAnime(targetAnime);
          }
          navigate(`/anime/${getAnimeSlug(an)}/s${newSeasonNum}/1`, { replace: true });
        }}
        onAnimeChange={(newAnime, targetSeasonNum) => {
          setPlayerAnime(newAnime);
          const s = targetSeasonNum || 1;
          navigate(`/anime/${getAnimeSlug(newAnime)}/s${s}/1`, { replace: true });
        }}
      />
    </motion.div>
  );
};

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(() => storageService.getProfile());
  const [trackedList, setTrackedList] = useState<TrackedAnime[]>(() => storageService.getTrackerList());
  const [recentWatches, setRecentWatches] = useState<RecentWatch[]>(() => storageService.getRecentWatchList());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnime, setSelectedAnime] = useState<JikanAnime | null>(null);

  const loadingAuth = false;

  const handleAddSearchQuery = (queryText: string) => {
    const cleanQuery = queryText.trim();
    if (!cleanQuery) return;

    storageService.addSearchQuery(cleanQuery);

    if (profile) {
      let currentHistory = profile.searchHistory ? [...profile.searchHistory] : [];
      currentHistory = currentHistory.filter((x) => x.toLowerCase() !== cleanQuery.toLowerCase());
      currentHistory.unshift(cleanQuery);
      if (currentHistory.length > 5) {
        currentHistory = currentHistory.slice(0, 5);
      }
      const updatedProfile: UserProfile = {
        ...profile,
        searchHistory: currentHistory,
      };
      storageService.saveProfile(updatedProfile);
      setProfile(updatedProfile);
    }
  };

  const handleRemoveSearchQuery = (queryText: string) => {
    const localHist = storageService.getSearchHistory().filter((x) => x !== queryText);
    storageService.saveSearchHistory(localHist);

    if (profile) {
      let currentHistory = profile.searchHistory ? [...profile.searchHistory] : [];
      currentHistory = currentHistory.filter((x) => x !== queryText);
      const updatedProfile: UserProfile = {
        ...profile,
        searchHistory: currentHistory,
      };
      storageService.saveProfile(updatedProfile);
      setProfile(updatedProfile);
    }
  };

  const handleUpdateTracked = (item: TrackedAnime) => {
    storageService.updateTrackerItem(item);
    setTrackedList(storageService.getTrackerList());
  };

  const handleRemoveTracked = (malId: number) => {
    storageService.removeTrackerItem(malId);
    setTrackedList(storageService.getTrackerList());
  };

  const handleAddRecentWatch = (
    malId: number,
    animeTitle: string,
    imageUrl: string,
    epNum: number,
    epTitle: string
  ) => {
    const watch: RecentWatch = {
      mal_id: malId,
      anime_title: animeTitle,
      image_url: imageUrl,
      episode_number: epNum,
      episode_title: epTitle || `Episode ${epNum}`,
      watched_at: new Date().toISOString(),
    };
    storageService.addRecentWatch(watch);
    setRecentWatches(storageService.getRecentWatchList());
  };

  const handleRemoveRecentWatch = (malId: number) => {
    storageService.removeRecentWatch(malId);
    setRecentWatches(storageService.getRecentWatchList());
  };

  const handleClearRecentWatches = () => {
    storageService.clearRecentWatches();
    setRecentWatches([]);
  };

  const handleQuickToggleWatched = (malId: number, nextEpNum: number) => {
    const list = [...trackedList];
    const match = list.find((x) => x.mal_id === malId);
    if (match) {
      if (!match.watched_episodes.includes(nextEpNum)) {
        match.watched_episodes.push(nextEpNum);
        match.watched_episodes.sort((a, b) => a - b);
      }

      if (match.episodes_count && match.watched_episodes.length === match.episodes_count) {
        match.status = 'completed';
      } else if (match.status === 'plan_to_watch') {
        match.status = 'watching';
      }

      match.last_watched_at = new Date().toISOString();
      handleUpdateTracked(match);

      handleAddRecentWatch(malId, match.title, match.image_url, nextEpNum, `Episode ${nextEpNum}`);
    }
  };

  const handleFinishEpisodeFromPlayer = (anime: JikanAnime, epNum: number, epTitle: string) => {
    const list = [...trackedList];
    let match = list.find((x) => x.mal_id === anime.mal_id);
    if (!match) {
      match = {
        mal_id: anime.mal_id,
        title: anime.title,
        image_url: anime.images.jpg.image_url,
        episodes_count: anime.episodes || 12,
        status: 'watching',
        watched_episodes: [epNum],
        last_watched_at: new Date().toISOString(),
        my_rating: 0,
        my_notes: '',
      };
    } else {
      if (!match.watched_episodes.includes(epNum)) {
        match.watched_episodes.push(epNum);
        match.watched_episodes.sort((a, b) => a - b);
      }
      if (match.status === 'plan_to_watch') {
        match.status = 'watching';
      }
      if (match.episodes_count && match.watched_episodes.length === match.episodes_count) {
        match.status = 'completed';
      }
      match.last_watched_at = new Date().toISOString();
    }
    handleUpdateTracked(match);
    handleAddRecentWatch(anime.mal_id, anime.title, anime.images.jpg.image_url, epNum, epTitle);
  };

  const handleLogout = () => {
    deleteAllCookies();
    storageService.clearAllData();
    setProfile(null);
    setTrackedList([]);
    setRecentWatches([]);
    setSearchTerm('');
    setSelectedAnime(null);
  };

  // Compute active & completed items count
  const watchedActiveCount = trackedList.filter((x) => x.status === 'watching').length;
  const completedCount = trackedList.filter((x) => x.status === 'completed').length;

  return (
    <div id="app-root-container" className="min-h-screen bg-[#0c0d0c] flex flex-col overflow-hidden text-zinc-100 relative font-sans">
      <Routes>
        <Route path="/" element={
          hasLeftLanding()
            ? <Navigate to="/anime" replace />
            : <LandingContainer setSearchTerm={setSearchTerm} />
        } />
        <Route path="/home" element={
          <Navigate to="/" replace />
        } />
        <Route path="/login" element={
          <Navigate to="/anime" replace />
        } />

        <Route path="/anime" element={
          <DashboardContainer
            loadingAuth={loadingAuth}
            profile={profile}
            selectedAnime={selectedAnime}
            setSelectedAnime={setSelectedAnime}
            trackedList={trackedList}
            setTrackedList={setTrackedList}
            recentWatches={recentWatches}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            handleLogout={handleLogout}
            handleUpdateTracked={handleUpdateTracked}
            handleRemoveTracked={handleRemoveTracked}
            handleAddRecentWatch={handleAddRecentWatch}
            handleRemoveRecentWatch={handleRemoveRecentWatch}
            handleClearRecentWatches={handleClearRecentWatches}
            handleQuickToggleWatched={handleQuickToggleWatched}
            handleAddSearchQuery={handleAddSearchQuery}
            handleRemoveSearchQuery={handleRemoveSearchQuery}
            watchedActiveCount={watchedActiveCount}
            completedCount={completedCount}
          />
        } />
        <Route path="/anime/" element={
          <DashboardContainer
            loadingAuth={loadingAuth}
            profile={profile}
            selectedAnime={selectedAnime}
            setSelectedAnime={setSelectedAnime}
            trackedList={trackedList}
            setTrackedList={setTrackedList}
            recentWatches={recentWatches}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            handleLogout={handleLogout}
            handleUpdateTracked={handleUpdateTracked}
            handleRemoveTracked={handleRemoveTracked}
            handleAddRecentWatch={handleAddRecentWatch}
            handleRemoveRecentWatch={handleRemoveRecentWatch}
            handleClearRecentWatches={handleClearRecentWatches}
            handleQuickToggleWatched={handleQuickToggleWatched}
            handleAddSearchQuery={handleAddSearchQuery}
            handleRemoveSearchQuery={handleRemoveSearchQuery}
            watchedActiveCount={watchedActiveCount}
            completedCount={completedCount}
          />
        } />

        <Route path="/anime/:animeSlug" element={
          <DashboardContainer
            loadingAuth={loadingAuth}
            profile={profile}
            selectedAnime={selectedAnime}
            setSelectedAnime={setSelectedAnime}
            trackedList={trackedList}
            setTrackedList={setTrackedList}
            recentWatches={recentWatches}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            handleLogout={handleLogout}
            handleUpdateTracked={handleUpdateTracked}
            handleRemoveTracked={handleRemoveTracked}
            handleAddRecentWatch={handleAddRecentWatch}
            handleRemoveRecentWatch={handleRemoveRecentWatch}
            handleClearRecentWatches={handleClearRecentWatches}
            handleQuickToggleWatched={handleQuickToggleWatched}
            handleAddSearchQuery={handleAddSearchQuery}
            handleRemoveSearchQuery={handleRemoveSearchQuery}
            watchedActiveCount={watchedActiveCount}
            completedCount={completedCount}
          />
        } />
        <Route path="/anime/:animeSlug/" element={
          <DashboardContainer
            loadingAuth={loadingAuth}
            profile={profile}
            selectedAnime={selectedAnime}
            setSelectedAnime={setSelectedAnime}
            trackedList={trackedList}
            setTrackedList={setTrackedList}
            recentWatches={recentWatches}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            handleLogout={handleLogout}
            handleUpdateTracked={handleUpdateTracked}
            handleRemoveTracked={handleRemoveTracked}
            handleAddRecentWatch={handleAddRecentWatch}
            handleRemoveRecentWatch={handleRemoveRecentWatch}
            handleClearRecentWatches={handleClearRecentWatches}
            handleQuickToggleWatched={handleQuickToggleWatched}
            handleAddSearchQuery={handleAddSearchQuery}
            handleRemoveSearchQuery={handleRemoveSearchQuery}
            watchedActiveCount={watchedActiveCount}
            completedCount={completedCount}
          />
        } />

        <Route path="/anime/:animeSlug/:season/:episode" element={
          <PlayerContainer
            loadingAuth={loadingAuth}
            profile={profile}
            trackedList={trackedList}
            handleFinishEpisodeFromPlayer={handleFinishEpisodeFromPlayer}
          />
        } />
        <Route path="/anime/:animeSlug/:season/:episode/" element={
          <PlayerContainer
            loadingAuth={loadingAuth}
            profile={profile}
            trackedList={trackedList}
            handleFinishEpisodeFromPlayer={handleFinishEpisodeFromPlayer}
          />
        } />

        <Route path="*" element={<Navigate to="/anime" replace />} />
      </Routes>
    </div>
  );
}

// Skeleton placeholder shown while data is syncing
function LoadingScreen({ variant = 'detail' }: { variant?: 'detail' | 'player' }) {
  return <PageSkeleton variant={variant} />;
}

