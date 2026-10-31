import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Star, Layers, CheckCircle2, Bookmark, Share2, ArrowLeft, BookOpen, Users, Search, List, Grid } from 'lucide-react';
import { JikanAnime, JikanEpisode, UserProfile, JikanCharacter } from '../types';
import { jikanService, releasedCapFromDates } from '../lib/jikan';
import { prefersReducedMotion } from '../lib/motionPrefs';
import NextEpisodeTimer from './NextEpisodeTimer';
import ShareSheet from './ShareSheet';
import { getFranchiseSeasonsList, formatSeasonDisplayLabel, getConsolidatedSeasonEpisodes } from '../lib/franchiseMap';

interface AnimeDetailModalProps {
  anime: JikanAnime | null;
  isOpen: boolean;
  onClose: () => void;
  onPlayEpisode: (anime: JikanAnime, episodeNumber: number, seasonNumber?: number) => void;
  profile: UserProfile | null;
  onToggleTracked?: (anime: JikanAnime) => void;
  isTracked?: boolean;
}

export default function AnimeDetailModal({
  anime,
  isOpen,
  onClose,
  onPlayEpisode,
  profile,
  onToggleTracked,
  isTracked = false,
}: AnimeDetailModalProps) {
  if (!isOpen || !anime) return null;

  const [shareOpen, setShareOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'seasons' | 'characters'>('overview');
  const [seasonsList, setSeasonsList] = useState<JikanAnime[]>([]);
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState<number>(0);
  const [episodes, setEpisodes] = useState<JikanEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [episodesSearch, setEpisodesSearch] = useState('');
  const [epViewMode, setEpViewModeState] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('anizoro_ep_view') === 'grid' ? 'grid' : 'list'; // list is the default
    } catch {
      return 'list';
    }
  });
  const setEpViewMode = (mode: 'grid' | 'list') => {
    setEpViewModeState(mode);
    try {
      localStorage.setItem('anizoro_ep_view', mode);
    } catch {
      /* storage unavailable */
    }
  };


  // Cast and Characters state
  const [characters, setCharacters] = useState<JikanCharacter[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(false);
  const [characterSearch, setCharacterSearch] = useState('');
  const [characterRoleFilter, setCharacterRoleFilter] = useState<'all' | 'Main' | 'Supporting'>('all');

  // Simple, quick fade-up when the details open
  const [zoom] = useState(() =>
    prefersReducedMotion()
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
      : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 10 } }
  );

  // In-component memory cache for instant season switching without delay
  const seasonEpisodeCache = React.useRef<Record<number, JikanEpisode[]>>({});

  // Fetch Characters
  useEffect(() => {
    let active = true;
    if (isOpen && anime?.mal_id) {
      setLoadingCharacters(true);
      jikanService.getAnimeCharacters(anime.mal_id).then((data) => {
        if (active) {
          setCharacters(data || []);
          setLoadingCharacters(false);
        }
      }).catch(() => {
        if (active) {
          setCharacters([]);
          setLoadingCharacters(false);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [anime?.mal_id, isOpen]);

  // Fetch Seasons
  useEffect(() => {
    let active = true;
    const fetchSeasons = async () => {
      try {
        const jikanSeasons = await jikanService.getAnimeSeasonsList(anime.mal_id, anime);
        if (active) {
          const unlocked = getFranchiseSeasonsList(anime, jikanSeasons);
          setSeasonsList(unlocked);
        }
      } catch (err) {
        if (active) {
          setSeasonsList(getFranchiseSeasonsList(anime, [anime]));
        }
      }
    };
    fetchSeasons();
    return () => {
      active = false;
    };
  }, [anime.mal_id]);

  // Current active season anime & season number
  const activeSeasonAnime = seasonsList[selectedSeasonIdx] || anime;
  const activeSeasonLabelInfo = useMemo(() => {
    return formatSeasonDisplayLabel(activeSeasonAnime, selectedSeasonIdx);
  }, [activeSeasonAnime, selectedSeasonIdx]);
  const activeSeasonNumber = activeSeasonLabelInfo.seasonNumber || (selectedSeasonIdx + 1);

  // Fetch Episodes for active season with instant cache retrieval
  useEffect(() => {
    let active = true;
    const cacheKey = `${anime.mal_id}-s${activeSeasonNumber}`;

    // If cached in memory, set immediately without network delay
    if (seasonEpisodeCache.current[cacheKey as any]) {
      setEpisodes(seasonEpisodeCache.current[cacheKey as any]);
      setLoadingEpisodes(false);
      return;
    }

    const fetchEps = async () => {
      setLoadingEpisodes(true);
      try {
        const data = await getConsolidatedSeasonEpisodes(anime, activeSeasonNumber);
        if (active) {
          seasonEpisodeCache.current[cacheKey as any] = data;
          setEpisodes(data);
        }
      } catch (err) {
        console.warn('Episodes fetch notice:', err);
      } finally {
        if (active) setLoadingEpisodes(false);
      }
    };
    fetchEps();
    return () => {
      active = false;
    };
  }, [anime.mal_id, activeSeasonNumber]);

  // While a show is still airing, only list the episodes that are actually out
  const [aired, setAired] = useState<{ known: boolean; limit: number | null } | null>(null);
  useEffect(() => {
    let active = true;
    setAired(null);
    jikanService
      .getAiredLimit(activeSeasonAnime.mal_id, activeSeasonAnime.anilist_id)
      .then((r) => {
        if (active) setAired(r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [activeSeasonAnime.mal_id, activeSeasonAnime.anilist_id]);

  const episodeCount = useMemo(() => {
    let base = 12;
    if (episodes.length > 0) {
      base = episodes.length;
      // the Jikan list stops at 500 entries, so long-running shows use their known total
      if (episodes.length >= 500) base = Math.max(base, activeSeasonLabelInfo.episodesCount || 0, activeSeasonAnime.episodes || 0);
    }
    else if (activeSeasonLabelInfo.episodesCount) base = activeSeasonLabelInfo.episodesCount;
    else if (activeSeasonAnime.episodes && activeSeasonAnime.episodes > 0) base = activeSeasonAnime.episodes;

    // 1) AniList says how many are out
    if (aired?.known && aired.limit) base = Math.min(base, aired.limit);
    // 2) episodes dated in the future are never listed
    const byDate = releasedCapFromDates(episodes);
    if (byDate) base = Math.min(base, byDate);
    // 3) still waiting for AniList (or it failed) on an airing show: stay with what the episode list already shows
    if ((!aired || !aired.known) && /airing/i.test(activeSeasonAnime.status || '')) {
      base = Math.min(base, episodes.length > 0 ? episodes.length : 1);
    }
    return Math.max(1, base);
  }, [activeSeasonLabelInfo, activeSeasonAnime, episodes, aired]);

  const filteredEpisodes = useMemo(() => {
    const total = episodeCount;
    const epArray = Array.from({ length: total }, (_, i) => {
      const epNum = i + 1;
      const apiEp = episodes.find((e) => e.mal_id === epNum);
      return {
        number: epNum,
        title: apiEp?.title || `Episode ${epNum}`,
        score: apiEp?.score,
        aired: apiEp?.aired,
      };
    });

    if (!episodesSearch.trim()) return epArray;
    return epArray.filter((e) =>
      e.title.toLowerCase().includes(episodesSearch.toLowerCase()) ||
      String(e.number).includes(episodesSearch)
    );
  }, [episodeCount, episodes, episodesSearch]);

  const currentSeasonAnime = seasonsList[selectedSeasonIdx] || anime;

  return (
    <motion.div
      initial={zoom.initial}
      animate={zoom.animate}
      exit={zoom.exit}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/85 flex flex-col font-sans select-none text-zinc-100"
    >
      {/* Top Bar - Frosted Glass */}
      <header className="sticky top-0 z-40 frosted-glass-nav px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xs sm:text-sm font-bold text-white truncate max-w-sm sm:max-w-md">
            {anime.title_english || anime.title}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShareOpen(true)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Share"
            aria-label="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
          {onToggleTracked && (
            <button
              onClick={() => onToggleTracked(anime)}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                isTracked ? 'bg-white text-black' : 'bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white'
              }`}
              title="Bookmark / Track"
            >
              <Bookmark className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Details Canvas (Exact layout from Screenshot 5) */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        
        {/* Top Section: Poster + Metadata + Airing Card */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 items-start">
          
          {/* Left: Poster Image (Screenshot 5) */}
          <div className="md:col-span-4 lg:col-span-4 flex flex-col items-center">
            <div className="relative w-full max-w-[260px] aspect-[3/4.4] rounded-xl overflow-hidden border border-white/15 bg-zinc-900">
              <img
                src={anime.images.jpg.large_image_url || anime.images.jpg.image_url}
                alt={anime.title}
                referrerPolicy="no-referrer"
                onError={async (e) => {
                  const el = e.currentTarget;
                  if (el.dataset.recovered) return;
                  el.dataset.recovered = '1';
                  const fresh = await jikanService.getPosterByMalId(anime.mal_id);
                  if (fresh) el.src = fresh;
                }}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Right: Titles, Badges, Action Button, Airing Countdown Card */}
          <div className="md:col-span-8 lg:col-span-8 space-y-5">
            {/* Titles */}
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight leading-tight">
                {anime.title_english || anime.title}
              </h1>
              {anime.title_japanese && (
                <p className="text-xs sm:text-sm text-zinc-400 font-mono">
                  {anime.title_japanese}
                </p>
              )}
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Score */}
              {anime.score ? (
                <span className="px-2 py-0.5 rounded bg-[#3fcf8e]/20 border border-[#3fcf8e]/40 text-[#3fcf8e] font-bold text-xs font-mono flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-[#f4c95d] text-[#f4c95d]" />
                  <span>{anime.score.toFixed(1)}</span>
                </span>
              ) : null}

              {/* Type */}
              <span className="px-2 py-0.5 rounded bg-zinc-800 border border-white/10 text-zinc-200 font-bold text-xs font-mono">
                {anime.type || 'TV'}
              </span>

              {/* Status */}
              {anime.status ? (
                <span className="px-2 py-0.5 rounded bg-zinc-800/80 border border-white/10 text-zinc-300 font-semibold text-xs font-mono">
                  {anime.status}
                </span>
              ) : null}
            </div>

            {/* Action Buttons: Watch Now & Bookmark */}
            <div className="flex items-center gap-3 pt-1">
              <button
                id="details-watch-now-btn"
                onClick={() => onPlayEpisode(currentSeasonAnime, 1, activeSeasonNumber)}
                className="flex-1 py-3 rounded-lg bg-[#3fcf8e] hover:bg-[#1f9a63] text-black font-display font-bold text-xs sm:text-sm tracking-tight flex items-center justify-center gap-2 active:scale-98 transition-all shadow-xl cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Watch now</span>
              </button>

              {onToggleTracked && (
                <button
                  onClick={() => onToggleTracked(anime)}
                  className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                    isTracked
                      ? 'bg-white/20 border-white text-white'
                      : 'bg-zinc-900 border-white/15 text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                  title="Bookmark"
                >
                  <Bookmark className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Metadata Summary Card - Frosted Glass */}
            <div className="frosted-glass rounded-xl p-5 sm:p-6 relative overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-zinc-500 font-semibold block">Studio</span>
                  <span className="text-xs font-semibold text-white truncate block">
                    {anime.studios?.[0]?.name || 'Ufotable / MAPPA'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-zinc-500 font-semibold block">Aired</span>
                  <span className="text-xs font-semibold text-white truncate block">
                    {anime.aired?.string || anime.year || '2019 - Present'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-zinc-500 font-semibold block">Episodes</span>
                  <span className="text-xs font-semibold text-white truncate block">
                    {episodeCount} Total Episodes
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-zinc-500 font-semibold block">Duration</span>
                  <span className="text-xs font-semibold text-white truncate block">
                    {anime.duration || '24 min / ep'}
                  </span>
                </div>
              </div>

              {anime.genres && anime.genres.length > 0 && (
                <div className="mt-3.5 pt-3 border-t border-white/5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-zinc-500 font-semibold mr-1">Genres</span>
                  {anime.genres.slice(0, 4).map((g) => (
                    <span
                      key={g.mal_id}
                      className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[11px] font-medium text-zinc-300"
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Navigation Tabs (Overview, Seasons, Characters - Screenshot 5) */}
        <div className="flex bg-white/[0.05] border border-white/10 rounded-lg p-1 gap-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'overview' ? 'bg-white text-black shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('seasons')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'seasons' ? 'bg-white text-black shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Seasons ({seasonsList.length || 1})</span>
          </button>
          <button
            onClick={() => setActiveTab('characters')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'characters' ? 'bg-white text-black shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Characters</span>
          </button>
        </div>

        {/* Tab 1: Overview & Synopsis (Screenshot 5) */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <NextEpisodeTimer malId={anime.mal_id} anilistId={anime.anilist_id} />

            {/* Synopsis Header */}
            <div className="bg-white/[0.05] border border-white/10 rounded-xl p-6 space-y-3">
              <h3 className="text-sm font-display font-bold text-white flex items-center gap-2">
                <span className="h-4 w-[3px] rounded-sm bg-[#3fcf8e]" aria-hidden="true" />
                <span>Synopsis</span>
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                {anime.synopsis || 'No synopsis available.'}
              </p>
            </div>

            {/* Quick Episodes Preview */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-display font-bold text-white flex items-center gap-2">
                  <span className="h-4 w-[3px] rounded-sm bg-[#3fcf8e]" aria-hidden="true" />
                  Episodes ({episodeCount})
                </h3>
                <button
                  onClick={() => setActiveTab('seasons')}
                  className="text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer flex items-center gap-1"
                >
                  <span>View all seasons & episodes</span>
                  <span>→</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {Array.from({ length: Math.min(episodeCount, 12) }, (_, i) => i + 1).map((epNum) => (
                  <button
                    key={`quick-ep-${epNum}`}
                    onClick={() => onPlayEpisode(currentSeasonAnime, epNum, activeSeasonNumber)}
                    className="p-3 rounded-lg bg-white/[0.05] hover:bg-white text-zinc-300 hover:text-black border border-white/10 hover:border-white font-mono font-bold text-xs flex items-center justify-between transition-all cursor-pointer group active:scale-95 shadow-sm"
                  >
                    <span>EP {epNum}</span>
                    <Play className="w-3.5 h-3.5 fill-current opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Seasons & All Episodes */}
        {activeTab === 'seasons' && (
          <div className="space-y-6">
            
            {/* Visual Season Cards with Pictures (Details Tab Only) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-display font-bold text-white flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-[#3fcf8e]" />
                  <span>Select season / part</span>
                </h3>
                <span className="text-[11px] font-mono text-zinc-500">
                  {selectedSeasonIdx + 1} of {seasonsList.length || 1} Selected
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                {(seasonsList.length > 0 ? seasonsList : [anime]).map((s, idx) => {
                  const isSelected = selectedSeasonIdx === idx;
                  const labelInfo = formatSeasonDisplayLabel(s, idx);
                  const seasonImg = s.images?.jpg?.large_image_url || s.images?.jpg?.image_url || anime.images.jpg.large_image_url || anime.images.jpg.image_url;
                  
                  return (
                    <motion.button
                      key={`detail-season-pic-${s.mal_id}-${idx}`}
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSelectedSeasonIdx(idx)}
                      className={`relative text-left rounded-lg overflow-hidden border transition-all cursor-pointer flex flex-col group ${
                        isSelected
                          ? 'ring-2 ring-white border-white bg-zinc-900 shadow-xl shadow-white/5'
                          : 'border-white/10 bg-white/[0.05] hover:border-white/30 hover:bg-zinc-900'
                      }`}
                    >
                      {/* Season Poster Picture */}
                      <div className="relative w-full aspect-[3/4] overflow-hidden bg-zinc-950">
                        <img
                          src={seasonImg}
                          alt={s.title}
                          referrerPolicy="no-referrer"
                          onError={async (e) => {
                            const el = e.currentTarget;
                            if (el.dataset.recovered) return;
                            el.dataset.recovered = '1';
                            const fresh = await jikanService.getPosterByMalId(s.mal_id);
                            if (fresh) el.src = fresh;
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                        
                        {/* Top Badge: Season Tag */}
                        <div className="absolute top-2 left-2">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold shadow-md ${
                            isSelected
                              ? 'bg-white text-black'
                              : 'bg-black/75 text-zinc-300 border border-white/15'
                          }`}>
                            {labelInfo.shortBadge || `S${idx + 1}`}
                          </span>
                        </div>

                        {/* Bottom Score & Status in image */}
                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] font-mono font-bold text-white">
                          <span className="flex items-center gap-1 bg-black/70 px-1.5 py-0.5 rounded-md text-[#3fcf8e]">
                            <Star className="w-3 h-3 fill-[#f4c95d] text-[#f4c95d]" />
                            {s.score ? s.score.toFixed(1) : (anime.score ? anime.score.toFixed(1) : '9.0')}
                          </span>
                          <span className="bg-black/70 px-1.5 py-0.5 rounded-md text-zinc-300">
                            {s.episodes ? `${s.episodes} eps` : 'TV'}
                          </span>
                        </div>
                      </div>

                      {/* Season Title and Info */}
                      <div className="p-3 space-y-1 flex-1 flex flex-col justify-between">
                        <h4 className={`text-xs font-bold line-clamp-2 leading-snug transition-colors ${
                          isSelected ? 'text-white font-black' : 'text-zinc-300 group-hover:text-white'
                        }`}>
                          {labelInfo.mainTitle || s.title_english || s.title}
                        </h4>
                        
                        <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-400 font-mono">
                          <span>{s.year || anime.year || 'Series'}</span>
                          {isSelected && (
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Episodes Controls: Search & Grid/List Toggle */}
            <div className="flex items-center justify-between gap-3 bg-white/[0.05] border border-white/10 rounded-lg p-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter episodes by name or number..."
                  value={episodesSearch}
                  onChange={(e) => setEpisodesSearch(e.target.value)}
                  className="w-full bg-[#0a0a0d] border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30"
                />
              </div>

              <div className="flex items-center gap-1 bg-black/60 border border-white/10 rounded-xl p-0.5">
                <button
                  onClick={() => setEpViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    epViewMode === 'grid' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Grid View"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEpViewMode('list')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    epViewMode === 'list' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                  }`}
                  title="List View"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Episode List with Smooth Motion and Loading Skeleton */}
            {loadingEpisodes ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={`skeleton-ep-${i}`}
                    className="p-3.5 rounded-lg bg-white/[0.05] border border-white/5 space-y-2"
                  >
                    <div className="skeleton h-4 rounded-md w-16" />
                    <div className="skeleton h-3 rounded-md w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`ep-view-${activeSeasonAnime.mal_id}-${selectedSeasonIdx}-${epViewMode}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {epViewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {filteredEpisodes.map((ep) => (
                        <button
                          key={`all-ep-${ep.number}`}
                          onClick={() => onPlayEpisode(currentSeasonAnime, ep.number, activeSeasonNumber)}
                          className="p-3.5 rounded-lg bg-white/[0.05] hover:bg-white text-zinc-300 hover:text-black border border-white/10 hover:border-white font-mono font-bold text-xs flex flex-col justify-between gap-2 transition-all cursor-pointer group text-left active:scale-95 shadow-sm"
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="text-xs font-bold">EP {ep.number}</span>
                            <Play className="w-3 h-3 fill-current opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <span className="text-[10px] text-zinc-400 group-hover:text-zinc-700 font-sans line-clamp-1">
                            {ep.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredEpisodes.map((ep) => (
                        <button
                          key={`all-ep-list-${ep.number}`}
                          onClick={() => onPlayEpisode(currentSeasonAnime, ep.number, activeSeasonNumber)}
                          className="w-full p-3.5 rounded-lg bg-white/[0.05] hover:bg-white text-zinc-300 hover:text-black border border-white/10 hover:border-white flex items-center justify-between gap-4 transition-all cursor-pointer group text-left active:scale-[0.99] shadow-sm"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-12 text-xs font-mono font-bold text-zinc-400 group-hover:text-black shrink-0">
                              EP {ep.number}
                            </span>
                            <span className="text-xs font-medium text-white group-hover:text-black truncate">
                              {ep.title}
                            </span>
                          </div>
                          <Play className="w-4 h-4 fill-current shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        )}

        {/* Tab 3: Characters & Voice Actors */}
        {activeTab === 'characters' && (
          <div className="space-y-4">
            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/[0.05] border border-white/10 rounded-lg p-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search character or voice actor..."
                  value={characterSearch}
                  onChange={(e) => setCharacterSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#3fcf8e]/50"
                />
              </div>

              {/* Role filter buttons */}
              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
                {(['all', 'Main', 'Supporting'] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setCharacterRoleFilter(role)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                      characterRoleFilter === role
                        ? 'bg-[#3fcf8e] text-black font-bold shadow-sm'
                        : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {role === 'all' ? 'All Roles' : role}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading State */}
            {loadingCharacters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="skeleton h-28 rounded-lg border border-white/5" />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loadingCharacters && characters.length === 0 && (
              <div className="bg-white/[0.05] border border-white/10 rounded-xl p-8 text-center space-y-2">
                <Users className="w-8 h-8 text-zinc-500 mx-auto" />
                <h4 className="text-sm font-bold text-white">No Cast Information Available</h4>
                <p className="text-xs text-zinc-400">
                  Character and voice actor records are currently updating for this title.
                </p>
              </div>
            )}

            {/* Characters Grid */}
            {!loadingCharacters && characters.length > 0 && (
              (() => {
                const filtered = characters.filter((c) => {
                  const matchesRole = characterRoleFilter === 'all' || c.role?.toLowerCase() === characterRoleFilter.toLowerCase();
                  const q = characterSearch.trim().toLowerCase();
                  if (!q) return matchesRole;

                  const charNameMatch = c.character?.name?.toLowerCase().includes(q);
                  const vaMatch = c.voice_actors?.some((va) => va.person?.name?.toLowerCase().includes(q));
                  return matchesRole && (charNameMatch || vaMatch);
                });

                if (filtered.length === 0) {
                  return (
                    <div className="bg-white/[0.05] border border-white/10 rounded-lg p-6 text-center text-xs text-zinc-400">
                      No characters or voice actors matching &quot;{characterSearch}&quot;
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filtered.map((item, idx) => {
                      const charImg = item.character?.images?.jpg?.image_url;
                      const isMain = item.role?.toLowerCase() === 'main';

                      // Prioritize English VA (user language preference: English only)
                      const jaVa = item.voice_actors?.find((va) => va.language?.toLowerCase() === 'japanese');
                      const enVa = item.voice_actors?.find((va) => va.language?.toLowerCase() === 'english');
                      const primaryVa = enVa || jaVa || item.voice_actors?.[0];

                      return (
                        <div
                          key={`${item.character?.mal_id || idx}-${idx}`}
                          className="bg-white/[0.05] border border-white/10 hover:border-white/20 rounded-lg p-3 flex gap-3 transition-all group"
                        >
                          {/* Character Avatar */}
                          <div className="w-16 h-20 rounded-xl overflow-hidden bg-black shrink-0 relative border border-white/5">
                            {charImg ? (
                              <img
                                src={charImg}
                                alt={item.character?.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                referrerPolicy="no-referrer"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                <Users className="w-5 h-5" />
                              </div>
                            )}
                          </div>

                          {/* Info Column */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <h5 className="text-xs font-bold text-white truncate group-hover:text-[#3fcf8e] transition-colors">
                                  {item.character?.name}
                                </h5>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                                    isMain
                                      ? 'bg-[#3fcf8e]/20 text-[#3fcf8e] border border-[#3fcf8e]/30'
                                      : 'bg-white/10 text-zinc-400'
                                  }`}
                                >
                                  {item.role || 'Supporting'}
                                </span>
                              </div>
                            </div>

                            {/* Voice Actor Information */}
                            <div className="space-y-1 mt-1 pt-1.5 border-t border-white/5">
                              {primaryVa ? (
                                <div className="flex items-center gap-2">
                                  {primaryVa.person?.images?.jpg?.image_url && (
                                    <img
                                      src={primaryVa.person.images.jpg.image_url}
                                      alt={primaryVa.person.name}
                                      className="w-5 h-5 rounded-full object-cover border border-white/10 shrink-0"
                                      referrerPolicy="no-referrer"
                                      loading="lazy"
                                    />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-medium text-zinc-300 truncate">
                                      {primaryVa.person?.name}
                                    </p>
                                    <span className="text-[9px] text-zinc-500 font-mono uppercase">
                                      {primaryVa.language || 'Voice Actor'}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[10px] text-zinc-500 italic">No VA listed</span>
                              )}

                              {enVa && enVa !== primaryVa && (
                                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                                  <span className="text-zinc-600 font-mono text-[9px] uppercase">EN:</span>
                                  <span className="truncate">{enVa.person?.name}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        )}

      </main>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} anime={anime} />
    </motion.div>
  );
}
