import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Captions, Mic, ArrowLeft, ArrowRight, Share2, CheckCircle, List, Grid, Search, Layers, Play, Check, Moon, Sun, Maximize2, Minimize2, Sliders, ChevronLeft, ChevronRight } from 'lucide-react';
import { JikanAnime, JikanEpisode } from '../types';
import { jikanService, releasedCapFromDates } from '../lib/jikan';
import NextEpisodeTimer from './NextEpisodeTimer';
import StreamStatusScreen, { StreamProblemKind } from './StreamStatusScreen';
import DirectPlayer from './DirectPlayer';
import { readPref, writePref } from '../lib/prefs';
import { STREAM_SERVERS, DEFAULT_SERVER, PLAYER_HOSTS, isServerKey, serverName, StreamServerKey, StreamServerInfo } from '../lib/servers';
import WatchRecommendations from './WatchRecommendations';
import ShareSheet from './ShareSheet';
import { DubStatus, dubCacheKey, getCachedDub, rememberDub, probeDirectDub, probeEmbedDub } from '../lib/dubAvailability';
import { getFranchiseSeasonsList, formatSeasonDisplayLabel, resolveFranchiseEpisode, getConsolidatedSeasonEpisodes, getFranchiseConfig, getFranchisePartAnilistId as getFranchiseAnilistId, getKnownAnilistId } from '../lib/franchiseMap';
import {
  KNOWN_ANIME_TMDB_MAP,
  isAnimeMovie,
  fetchExternalIds,
  DynamicExternalIds,
} from '../lib/animeTmdbMap';
export { KNOWN_ANIME_TMDB_MAP, isAnimeMovie };
import AniZoroLogo from './AniZoroLogo';
import { checkTitleSeasonAndChooseEpisode } from '../lib/seasonDetector';

export type { StreamServerKey };

interface WatchPlayerProps {
  anime: JikanAnime;
  episodeNumber: number;
  episodeTitle?: string;
  seasonNumber?: number;
  tmdbId?: number;
  onClose: () => void;
  onFinishEpisode: (epNum: number) => void;
  isFinished?: boolean;
  onEpisodeChange?: (epNum: number, seasonNum?: number, newAnime?: JikanAnime) => void;
  onSeasonChange?: (seasonNum: number, seasonAnime?: JikanAnime) => void;
  onAnimeChange?: (newAnime: JikanAnime, targetSeasonNum?: number) => void;
}

export default function WatchPlayer({
  anime,
  episodeNumber,
  episodeTitle,
  seasonNumber,
  tmdbId,
  onClose,
  onFinishEpisode,
  isFinished,
  onEpisodeChange,
  onSeasonChange,
  onAnimeChange,
  }: WatchPlayerProps) {
  // Active server (see src/lib/servers.ts)
  const [selectedServerKey, setSelectedServerKey] = useState<StreamServerKey>(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const saved = readPref('anizoro_pref_server');
      if (isServerKey(saved)) return saved;
    }
    return DEFAULT_SERVER;
  });
  // What the viewer asked for. The format that actually plays (activeFormat) is derived from it below,
  // because a dub that does not exist for this episode / server must fall back to sub.
  const [preferredFormat, setPreferredFormat] = useState<'sub' | 'dub'>(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const saved = readPref('anizoro_pref_format');
      if (saved === 'sub' || saved === 'dub') return saved;
    }
    return 'sub';
  });
  const [activeServerName, setActiveServerName] = useState<string>(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const saved = readPref('anizoro_pref_server');
      if (isServerKey(saved)) return serverName(saved);
    }
    return serverName(DEFAULT_SERVER);
  });

  // Vidstream 1 (our own player): why it failed, and the AniList id it is addressed by
  const [directDetail, setDirectDetail] = useState<string | null>(null);
  const [anilistLookup, setAnilistLookup] = useState<{ malId: number; id: number | null } | null>(null);

  // Dub availability per server and episode (see lib/dubAvailability.ts); missing = not checked yet
  const [dubMap, setDubMap] = useState<Record<string, DubStatus>>({});
  const setDub = (key: string, status: DubStatus) => {
    rememberDub(key, status);
    setDubMap((m) => (m[key] === status ? m : { ...m, [key]: status }));
  };
  const [directPlayed, setDirectPlayed] = useState(false);

  // Dynamic External IDs (TMDb, IMDb, Season for TMDB servers)
  const [dynamicIds, setDynamicIds] = useState<DynamicExternalIds | null>(null);
  const [idsSettledFor, setIdsSettledFor] = useState<number | null>(null);
  const [idsOwner, setIdsOwner] = useState<number | null>(null);



  // Player Settings Toggles with localStorage persistence
  const [isAutoPlay, setIsAutoPlay] = useState<boolean>(() => {
    const saved = readPref('anizoro_autoplay');
    return saved !== null ? saved === 'true' : true;
  });
  const [isAutoSkip, setIsAutoSkip] = useState<boolean>(() => {
    const saved = readPref('anizoro_autoskip');
    return saved !== null ? saved === 'true' : true;
  });
  const [isAutoNext, setIsAutoNext] = useState<boolean>(() => {
    const saved = readPref('anizoro_autonext');
    return saved !== null ? saved === 'true' : true;
  });
  const [isSkipFiller, setIsSkipFiller] = useState<boolean>(() => {
    const saved = readPref('anizoro_skipfiller');
    return saved !== null ? saved === 'true' : true;
  });

  // Read from callbacks fired by the player, so flipping a switch never restarts the video you are watching
  const autoNextRef = useRef(isAutoNext);
  autoNextRef.current = isAutoNext;

  // Filler episodes (from Jikan) for the season entry being watched
  const [fillerEpisodes, setFillerEpisodes] = useState<Set<number>>(new Set());


  // In-memory cache for instant season episodes loading
  const episodeCache = useRef<Record<number, JikanEpisode[]>>({});

  // Stream Player State
  const [iframeLoading, setIframeLoading] = useState<boolean>(true);
  const [streamProblem, setStreamProblem] = useState<StreamProblemKind | null>(null);
  const [problemDismissed, setProblemDismissed] = useState<boolean>(false);
  const [slowHint, setSlowHint] = useState<boolean>(false);
  const streamFailed = streamProblem !== null && !problemDismissed;
  const playedRef = useRef<boolean>(false);
  const interactedRef = useRef<boolean>(false);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Servers that have been seen sending play events. Only those can be timed out reliably.
  const capableRef = useRef<Record<string, boolean>>({});
  const [reloadKey, setReloadKey] = useState<number>(0);
  const loadedRef = useRef<boolean>(false);
  const minDoneRef = useRef<boolean>(false);


  // Server & Share Modals
  const [shareOpen, setShareOpen] = useState(false);

  // Focus / Dim Lights, Expand Player Canvas & Action Toast
  const [isDimLights, setIsDimLights] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2500);
  };

  // Seasons & Episodes resolution
  const [mappedSeasons, setMappedSeasons] = useState<JikanAnime[]>([]);
  const [seasonEpisodes, setSeasonEpisodes] = useState<JikanEpisode[]>([]);
  const [malIdOverride, setMalIdOverride] = useState<number>(anime.mal_id);
  const [tmdbSeason, setTmdbSeason] = useState<number>(seasonNumber || 1);
  const [episodesSearch, setEpisodesSearch] = useState('');
  const [epViewMode, setEpViewModeState] = useState<'grid' | 'list'>(() => {
    try {
      return readPref('anizoro_ep_view') === 'grid' ? 'grid' : 'list'; // list is the default
    } catch {
      return 'list';
    }
  });
  const setEpViewMode = (mode: 'grid' | 'list') => {
    setEpViewModeState(mode);
    try {
      writePref('anizoro_ep_view', mode);
    } catch {
      /* storage unavailable */
    }
  };

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sync props
  useEffect(() => {
    setMalIdOverride(anime.mal_id);
    if (seasonNumber) setTmdbSeason(seasonNumber);
  }, [anime.mal_id, seasonNumber]);

  const currentSeason = tmdbSeason || seasonNumber || 1;
  const currentEpisode = episodeNumber || 1;

  // Seamlessly resolve merged part boundaries (e.g. AOT S3 E15 -> Part 2 Episode 3 on MAL 38524)
  const resolvedEp = useMemo(() => {
    return resolveFranchiseEpisode(anime, currentSeason, currentEpisode);
  }, [anime, currentSeason, currentEpisode]);

  // Load Seasons Franchise Matrix (Consolidated into unified single seasons)
  useEffect(() => {
    let active = true;
    const loadFranchise = async () => {
      try {
        const jikanSeasons = await jikanService.getAnimeSeasonsList(anime.mal_id, anime);
        if (active) {
          const unlocked = getFranchiseSeasonsList(anime, jikanSeasons);
          setMappedSeasons(unlocked);
        }
      } catch (e) {
        if (active) {
          setMappedSeasons(getFranchiseSeasonsList(anime, [anime]));
        }
      }
    };
    loadFranchise();
    return () => {
      active = false;
    };
  }, [anime.mal_id]);

  // Load Consolidated Season Episodes (e.g. 22 episodes for Season 3)
  useEffect(() => {
    let active = true;
    const cacheKey = `${anime.mal_id}-s${currentSeason}`;

    if (episodeCache.current[cacheKey]) {
      setSeasonEpisodes(episodeCache.current[cacheKey]);
      return;
    }

    const loadEps = async () => {
      try {
        const eps = await getConsolidatedSeasonEpisodes(anime, currentSeason);
        if (active) {
          episodeCache.current[cacheKey] = eps;
          setSeasonEpisodes(eps);
        }
      } catch (e) {
        console.warn('Episodes notice:', e);
      }
    };
    loadEps();
    return () => {
      active = false;
    };
  }, [anime.mal_id, currentSeason]);

  const targetMalId = (malIdOverride && malIdOverride !== anime.mal_id ? malIdOverride : null)
    || resolvedEp.targetMalId
    || anime.mal_id;

  // System that checks if title contains season word, checks the number, and accordingly chooses the episode:
  const titleDetection = useMemo(() => {
    return checkTitleSeasonAndChooseEpisode({
      candidateTitles: [
        anime.title_english,
        anime.title,
        anime.title_japanese,
        episodeTitle,
        resolvedEp.seasonTitle,
        resolvedEp.partTitle,
      ],
      requestedSeason: currentSeason,
      requestedEpisode: currentEpisode,
      anime,
      malId: targetMalId,
      knownOffset: (resolvedEp.partEpisodeNumber && resolvedEp.partEpisodeNumber > currentEpisode)
        ? (resolvedEp.partEpisodeNumber - currentEpisode)
        : undefined,
    });
  }, [anime, episodeTitle, resolvedEp, currentSeason, currentEpisode, targetMalId]);

  const mappedKnown = KNOWN_ANIME_TMDB_MAP[targetMalId] || KNOWN_ANIME_TMDB_MAP[anime.mal_id];

  // Fetch dynamic external IDs (TMDb, IMDb, Season) via ARM API.
  // IDs from the previous title are cleared first so a stale TMDb ID can never be used for a new title.
  useEffect(() => {
    let active = true;
    const loadIds = async () => {
      try {
        const res = await fetchExternalIds(targetMalId);
        if (active) {
          setDynamicIds(res || null);
          setIdsOwner(targetMalId);
        }
      } catch (e) {
        console.warn('External ID fetch notice:', e);
      } finally {
        if (active) setIdsSettledFor(targetMalId);
      }
    };
    loadIds();
    return () => {
      active = false;
    };
  }, [targetMalId]);

  // TMDb-based servers (Vidstream 2, HD 1) need a real TMDb ID. Never guess one.
  const idsReady = idsSettledFor === targetMalId;
  const freshDynamicIds = idsOwner === targetMalId ? dynamicIds : null;
  const resolvedTmdbId: number | undefined = mappedKnown?.tmdbId || freshDynamicIds?.themoviedb || tmdbId || undefined;
  const needsTmdb = STREAM_SERVERS.find((srv) => srv.key === selectedServerKey)?.needsTmdb ?? true;
  const isDirect = Boolean(STREAM_SERVERS.find((srv) => srv.key === selectedServerKey)?.direct);
  const waitingForIds = needsTmdb && !resolvedTmdbId && !idsReady;

  // A title without a MyAnimeList id cannot be opened on Vidstream 1: use Vidstream 2 instead (this view only)
  const noMalForMegaplay = selectedServerKey === 'megaplay_prime' && anime.mal_id_is_real === false && targetMalId === anime.mal_id;
  useEffect(() => {
    if (noMalForMegaplay) {
      setSelectedServerKey('anivexa');
      setActiveServerName(serverName('anivexa'));
      showToast(`${serverName('megaplay_prime')} does not have this title. Switched to ${serverName('anivexa')}.`);
    }
  }, [noMalForMegaplay]);

  // If a title has no TMDb mapping, fall back to Vidstream 1 (MAL ID based) for this view only.
  useEffect(() => {
    if (needsTmdb && !resolvedTmdbId && idsReady) {
      setSelectedServerKey('megaplay_prime');
      setActiveServerName(serverName('megaplay_prime'));
      showToast(`No TMDb match for this title. Switched to ${serverName('megaplay_prime')}.`);
    }
  }, [needsTmdb, resolvedTmdbId, idsReady]);

  // Multi-part season episode resolution: Continuous playback across servers

  // Episodes that have actually aired: while a show is still airing, only released episodes are listed.
  // The airing entry is the last part of the season; its "next episode" number tells how many are out.
  const airingEntry = useMemo(() => {
    const total = resolvedEp.totalSeasonEpisodes;
    if (total && total > 0) {
      const last = resolveFranchiseEpisode(anime, currentSeason, total);
      return {
        malId: last.targetMalId,
        offset: total - (last.partEpisodeNumber ?? total),
        anilistId: getFranchiseAnilistId(last.targetMalId) ?? (last.targetMalId === anime.mal_id ? anime.anilist_id : undefined),
      };
    }
    return { malId: targetMalId, offset: 0, anilistId: targetMalId === anime.mal_id ? anime.anilist_id : undefined };
  }, [anime, currentSeason, resolvedEp.totalSeasonEpisodes, targetMalId]);

  const [aired, setAired] = useState<{ known: boolean; limit: number | null } | null>(null);
  useEffect(() => {
    let active = true;
    setAired(null);
    if (!airingEntry.malId) return;
    jikanService
      .getAiredLimit(airingEntry.malId, airingEntry.anilistId)
      .then((r) => {
        if (!active) return;
        setAired(r.known && r.limit ? { known: true, limit: r.limit + airingEntry.offset } : r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [airingEntry.malId, airingEntry.offset, airingEntry.anilistId]);

  const effectiveEpCount = useMemo(() => {
    let base: number;
    if (resolvedEp.totalSeasonEpisodes && resolvedEp.totalSeasonEpisodes > 0) {
      base = resolvedEp.totalSeasonEpisodes;
    } else if (seasonEpisodes.length > 0) {
      base = seasonEpisodes.length;
      if (seasonEpisodes.length >= 500) base = Math.max(base, mappedKnown?.episodesCount || 0, anime.episodes || 0);
    } else if (mappedKnown?.episodesCount) {
      base = mappedKnown.episodesCount;
    } else if (anime.episodes && anime.episodes > 0) {
      base = anime.episodes;
    } else {
      // nothing is known: for a show that is still airing, do not invent unreleased episodes
      base = /airing/i.test(anime.status || '') ? Math.max(currentEpisode, 1) : Math.max(currentEpisode, 12);
    }
    // 1) AniList says how many are out
    if (aired?.known && aired.limit) base = Math.min(base, aired.limit);
    // 2) episodes dated in the future are never listed
    const byDate = releasedCapFromDates(seasonEpisodes);
    if (byDate && !resolvedEp.totalSeasonEpisodes) base = Math.min(base, byDate);
    // 3) still waiting for AniList (or it failed) on an airing show: only what the episode list shows, never the full total
    if ((!aired || !aired.known) && /airing/i.test(anime.status || '')) {
      base = Math.min(base, Math.max(currentEpisode, seasonEpisodes.length, 1));
    }
    return Math.max(1, base);
  }, [resolvedEp.totalSeasonEpisodes, seasonEpisodes, mappedKnown, anime.episodes, anime.status, currentEpisode, aired]);

  // 45 Episodes Per Range Chunking (Prevents episode list from going forever)
  const EPISODES_PER_CHUNK = 45;
  const totalChunks = Math.max(1, Math.ceil(effectiveEpCount / EPISODES_PER_CHUNK));
  const [selectedChunkIndex, setSelectedChunkIndex] = useState<number>(() => {
    return Math.floor(Math.max(0, currentEpisode - 1) / EPISODES_PER_CHUNK);
  });

  // Auto-sync active chunk when currentEpisode or totalChunks changes
  useEffect(() => {
    const targetChunk = Math.floor(Math.max(0, currentEpisode - 1) / EPISODES_PER_CHUNK);
    if (targetChunk < totalChunks) {
      setSelectedChunkIndex(targetChunk);
    }
  }, [currentEpisode, totalChunks]);

  const activeChunkStart = selectedChunkIndex * EPISODES_PER_CHUNK + 1;
  const activeChunkEnd = Math.min((selectedChunkIndex + 1) * EPISODES_PER_CHUNK, effectiveEpCount);

  // List of episodes to display (either matching search, or within active 45-episode chunk)
  const displayedEpisodes = useMemo(() => {
    if (episodesSearch.trim()) {
      return Array.from({ length: effectiveEpCount }, (_, i) => i + 1).filter((epNum) =>
        epNum.toString().includes(episodesSearch.trim())
      );
    }
    if (effectiveEpCount > 45) {
      const list: number[] = [];
      for (let i = activeChunkStart; i <= activeChunkEnd; i++) {
        list.push(i);
      }
      return list;
    }
    return Array.from({ length: effectiveEpCount }, (_, i) => i + 1);
  }, [effectiveEpCount, episodesSearch, activeChunkStart, activeChunkEnd]);

  // Keyboard navigation for episodes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'ArrowLeft' && currentEpisode > 1) {
        onEpisodeChange?.(currentEpisode - 1, currentSeason);
      } else if (e.key === 'ArrowRight' && currentEpisode < effectiveEpCount) {
        goToNextRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentEpisode, effectiveEpCount, currentSeason, onEpisodeChange]);

  // Compute clean anime title without duplicating season numbers
  const displayAnimeTitle = useMemo(() => {
    const raw = anime.title_english || anime.title || 'Anime';
    if (/(?:season|part)\s+\d+/i.test(raw)) {
      return raw;
    }
    return currentSeason > 1 ? `${raw} Season ${currentSeason}` : raw;
  }, [anime.title_english, anime.title, currentSeason]);

  // Construct Explicit Embed URL with Multi-Server Engine:
  // - Vidstream 1 (MegaPlay): MAL ID
  // - Vidstream 2 (VidLink): TMDb ID
  // - HD 1 (VidCore): TMDb ID
  // The MyAnimeList entry and the episode number inside it that every server is addressed by
  const streamTarget = useMemo(() => {
    // 1. Resolve exact MAL ID (prioritize custom ID, season override, resolved part, then base MAL ID)
    let finalMalId = ((malIdOverride && malIdOverride !== anime.mal_id) ? malIdOverride : null)
      || resolvedEp.targetMalId
      || anime.mal_id;

    // For generic franchises without hardcoded parts, map season from Jikan mappedSeasons
    const isKnownConfigured = Boolean(getFranchiseConfig(anime.mal_id));
    if (!isKnownConfigured && currentSeason > 1 && mappedSeasons && mappedSeasons.length >= currentSeason) {
      const seasonAnime = mappedSeasons[currentSeason - 1];
      if (seasonAnime && seasonAnime.mal_id) {
        finalMalId = seasonAnime.mal_id;
      }
    }

    const targetEp = titleDetection.chosenStreamEpisode || resolvedEp.partEpisodeNumber || currentEpisode || 1;

    // Vidstream 1 (AniList based): a split part such as AoT S3 Part 2 is its own AniList entry that starts at
    // episode 1. targetEp is continuous across the parts (13..22), so the part's own offset is taken off again.
    // Long continuous shows (Black Clover) share one entry for every season and keep the continuous number.
    let directEp = targetEp;
    const franchise = getFranchiseConfig(anime.mal_id) || getFranchiseConfig(finalMalId);
    if (franchise) {
      const sameEntry = franchise.parts.filter((pt) => pt.mal_id === finalMalId);
      if (sameEntry.length === 1 && (sameEntry[0].episodesOffset ?? 0) > 0) {
        directEp = Math.max(1, targetEp - (sameEntry[0].episodesOffset ?? 0));
      }
    }

    // Other ways a source may list the same episode (tried only when the main one finds nothing):
    //  - the part's own entry with the continuous number (S3 Part 2 episode 15 on 104578)
    //  - the season's first entry with the continuous number (S3 episode 15 on 99147)
    const directAlternates: { anilistId: number; episode: number }[] = [];
    if (franchise) {
      const partAl = getFranchiseAnilistId(finalMalId);
      if (partAl && targetEp !== directEp) directAlternates.push({ anilistId: partAl, episode: targetEp });
      const seasonParts = franchise.parts.filter((pt) => pt.seasonNumber === resolvedEp.seasonNumber);
      const first = seasonParts[0];
      if (first?.anilist_id && first.mal_id !== finalMalId && resolvedEp.seasonEpisodeNumber) {
        directAlternates.push({ anilistId: first.anilist_id, episode: resolvedEp.seasonEpisodeNumber });
      }
    }
    // the hand-made id of a single title: tried after the looked-up id, in case that one has no sources
    const looseId = getKnownAnilistId(finalMalId);
    if (looseId && !franchise) directAlternates.push({ anilistId: looseId, episode: directEp });
    return { finalMalId, targetEp, directEp, directAlternates };
  }, [malIdOverride, anime, resolvedEp.targetMalId, resolvedEp.partEpisodeNumber, currentSeason, mappedSeasons, titleDetection.chosenStreamEpisode, currentEpisode]);

  // Vidstream 1 is addressed by AniList id: use the one we already have, otherwise look it up from the MAL id
  const knownAnilistId = useMemo<number | undefined>(() => {
    const mal = streamTarget.finalMalId;
    // Franchises with one MAL id (and one AniList id) per season/part: that list is exact, so it wins.
    // (The loose list of single titles is only an alternate below: an id looked up from MAL comes first.)
    const fromMap = getFranchiseAnilistId(mal);
    if (fromMap) return fromMap;
    if (mal === anime.mal_id) return anime.anilist_id ?? (anime.mal_id_is_real === false ? anime.mal_id : undefined);
    return mappedSeasons.find((sn) => sn.mal_id === mal)?.anilist_id;
  }, [streamTarget.finalMalId, anime, mappedSeasons]);

  useEffect(() => {
    if (!isDirect || knownAnilistId) return;
    let active = true;
    const malId = streamTarget.finalMalId;
    jikanService.getAnilistIdByMal(malId).then((id) => {
      if (active) setAnilistLookup({ malId, id });
    });
    return () => {
      active = false;
    };
  }, [isDirect, knownAnilistId, streamTarget.finalMalId]);

  // undefined: still looking, null: AniList has no entry for it
  const directAnilistId: number | null | undefined =
    knownAnilistId ?? (anilistLookup?.malId === streamTarget.finalMalId ? anilistLookup.id : undefined);

  // ---- dub availability for this episode
  // Each server is addressed differently, so each one has its own key: Vidstream 1 by AniList id, Vidstream 2 by MAL id.
  const dubKeyFor = (key: StreamServerKey): string | null => {
    if (key === 'anivexa' || key === 'kuhi') return directAnilistId ? dubCacheKey(key, directAnilistId, streamTarget.directEp) : null;
    if (key === 'megaplay_prime') {
      if (streamTarget.finalMalId === anime.mal_id && anime.mal_id_is_real === false) return null;
      return dubCacheKey('megaplay_prime', streamTarget.finalMalId, streamTarget.targetEp);
    }
    return null;
  };
  const selectedInfo: StreamServerInfo | undefined = STREAM_SERVERS.find((srv) => srv.key === selectedServerKey);
  const dubStatusOf = (key: StreamServerKey): DubStatus | 'checking' | 'none' => {
    if (!STREAM_SERVERS.find((srv) => srv.key === key)?.dub) return 'none'; // this server never has a dub
    const k = dubKeyFor(key);
    if (!k) return 'unknown';
    return dubMap[k] ?? getCachedDub(k) ?? 'checking';
  };
  const selectedDub = dubStatusOf(selectedServerKey);
  // the DUB section exists only once the API has confirmed a dub for this episode (or the dub is already playing)
  const episodeHasDub = STREAM_SERVERS.some((srv) => dubStatusOf(srv.key) === 'yes');
  // dub only plays where it is wanted AND the server supports it AND it is not known to be missing
  const dubPlayable = Boolean(selectedInfo?.dub) && selectedDub !== 'no';
  const activeFormat: 'sub' | 'dub' = preferredFormat === 'dub' && dubPlayable ? 'dub' : 'sub';

  // changes whenever Vidstream 1 has to start over (new episode, audio or source)
  const directKey = isDirect ? `${selectedServerKey}|${streamTarget.finalMalId}|${streamTarget.directEp}|${activeFormat}` : '';

  const embedStreamUrl = useMemo(() => {
    // Vidstream 1 plays in our own player (see DirectPlayer), not in an iframe
    if (isDirect) return '';
    const { finalMalId, targetEp } = streamTarget;
    const isKnownConfigured = Boolean(getFranchiseConfig(anime.mal_id));
    const subDubFormat = activeFormat === 'dub' ? 'dub' : 'sub';

    // TMDb ID resolution for the TMDb-based servers
    const isMovie = isAnimeMovie(anime) || mappedKnown?.isMovie;
    const effectiveTmdbId = resolvedTmdbId;
    // Titles that are not in the hand-made map use ani.zip's per-episode numbering when it has it
    const zipEpisode = !mappedKnown && !isKnownConfigured ? freshDynamicIds?.episodes?.[targetEp] : undefined;
    const resolvedTmdbSeason = zipEpisode?.s || mappedKnown?.season || freshDynamicIds?.season || currentSeason || 1;
    const tmdbEpisode = zipEpisode?.e || targetEp;

    // HD 1 (MegaPlay) -> MAL ID
    if (selectedServerKey === 'megaplay_prime') {
      // This server needs a real MyAnimeList id. Without one, mal_id holds an AniList id and would open a wrong title.
      if (finalMalId === anime.mal_id && anime.mal_id_is_real === false) return '';
      return `https://megaplay.buzz/stream/mal/${finalMalId}/${targetEp}/${subDubFormat}?autoPlay=1&autoSkip=1`;
    }

    return '';
  }, [
    selectedServerKey,
    targetMalId,
    malIdOverride,
    currentSeason,
    mappedSeasons,
    titleDetection.chosenStreamEpisode,
    resolvedEp.partEpisodeNumber,
    currentEpisode,
    activeFormat,
    anime,
    resolvedTmdbId,
    freshDynamicIds,
    mappedKnown,
    isDirect,
    streamTarget,
  ]);

  // Loading overlay + failure detection.
  // - The overlay stays until the embed has loaded AND a minimum time has passed
  //   (HD 1: 10s, so its raw loading text is never visible; others: 1.8s).
  // - A server-side check reports the real HTTP status, so a 404 shows "not available" right away.
  // - If the embed cannot be reached or never finishes loading (15s), the server is reported as unreachable.
  // - After it loads, 20s without any sign of playback gives a timeout screen (see the message listener below).
  useEffect(() => {
    setIframeLoading(true);
    setStreamProblem(null);
    setProblemDismissed(false);
    setSlowHint(false);
    loadedRef.current = false;
    minDoneRef.current = false;
    playedRef.current = false;
    interactedRef.current = false;
    if (playTimerRef.current) clearTimeout(playTimerRef.current);
    setDirectDetail(null);
    setDirectPlayed(false);
    // Vidstream 1 reports its own loading / failure state (DirectPlayer)
    if (isDirect) {
      setIframeLoading(false);
      return;
    }
    if (!embedStreamUrl) return;

    const minMs = 1800;
    const minTimer = setTimeout(() => {
      minDoneRef.current = true;
      if (loadedRef.current) setIframeLoading(false);
    }, minMs);

    const failTimer = setTimeout(() => {
      if (!loadedRef.current) {
        setIframeLoading(false);
        setStreamProblem((p) => p ?? 'unreachable');
      }
    }, 15000);

    // Network-level probe: catches DNS / connection failures right away.
    const controller = new AbortController();
    fetch(embedStreamUrl, { mode: 'no-cors', signal: controller.signal }).catch((err) => {
      if (err?.name === 'AbortError') return;
      if (!loadedRef.current) {
        setIframeLoading(false);
        setStreamProblem((p) => p ?? 'unreachable');
      }
    });

    // Status probe through our own endpoint. Anything unexpected (dev server, errors, 403) is ignored.
    fetch(`/api/probe?url=${encodeURIComponent(embedStreamUrl)}&origin=${encodeURIComponent(window.location.origin)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('application/json') ? r.json() : null))
      .then((info) => {
        if (!info || typeof info.status !== 'number') return;
        if (info.status === 404 || info.status === 410 || info.looksEmpty) {
          setIframeLoading(false);
          setStreamProblem('unavailable');
        }
      })
      .catch(() => {});

    // Clicking inside the player means the viewer is trying to play it themselves
    const onBlur = () => {
      setTimeout(() => {
        if (document.activeElement === iframeRef.current) interactedRef.current = true;
      }, 0);
    };
    window.addEventListener('blur', onBlur);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(failTimer);
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      window.removeEventListener('blur', onBlur);
      controller.abort();
    };
  }, [embedStreamUrl, selectedServerKey, reloadKey, isDirect, directKey]);

  // Remember which servers have been seen reporting playback
  useEffect(() => {
    try {
      capableRef.current = JSON.parse(readPref('anizoro_player_events') || '{}');
    } catch {
      capableRef.current = {};
    }
  }, []);

  // ---- dub detection (runs per episode; results are cached for the session)
  // Vidstream 2: one cheap page check, right away
  const megaDubKey = dubKeyFor('megaplay_prime');
  useEffect(() => {
    if (!megaDubKey || getCachedDub(megaDubKey) || dubMap[megaDubKey]) return;
    const controller = new AbortController();
    const url = `https://megaplay.buzz/stream/mal/${streamTarget.finalMalId}/${streamTarget.targetEp}/dub`;
    probeEmbedDub(url, controller.signal).then((status) => {
      if (!controller.signal.aborted) setDub(megaDubKey, status);
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [megaDubKey]);

  // Vidstream 1's dub: asked in the background (after the sub has started, when Vidstream 1 is the one playing)
  // (when the dub itself is playing, the player already answers the question)
  const directServers = STREAM_SERVERS.filter((srv) => srv.direct);
  const directDubKeys = directServers.map((srv) => dubKeyFor(srv.key) || '').join(',');
  useEffect(() => {
    if (!directAnilistId) return;
    const controller = new AbortController();
    for (const srv of directServers) {
      const k = dubKeyFor(srv.key);
      if (!k) continue;
      // Kuhi runs a scraper per ask: its dub is only looked up when the viewer wants the dub
      if (srv.api === 'kuhi' && preferredFormat !== 'dub') continue;
      // on the server that is playing, wait until the sub is playing (and skip it while the dub itself plays)
      if (isDirect && srv.key === selectedServerKey && (!directPlayed || activeFormat === 'dub')) continue;
      if (getCachedDub(k) || dubMap[k]) continue;
      probeDirectDub(directAnilistId, streamTarget.directEp, controller.signal, srv.api).then((status) => {
        if (!controller.signal.aborted) setDub(k, status);
      });
    }
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directDubKeys, directPlayed, activeFormat, isDirect, selectedServerKey, preferredFormat]);

  // Dub was wanted but this episode does not have it on the current server: say why the audio changed
  const dubMissingNow = preferredFormat === 'dub' && Boolean(selectedInfo?.dub) && selectedDub === 'no';
  useEffect(() => {
    if (dubMissingNow) showToast(`No dub for this episode on ${activeServerName}, playing Sub`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dubMissingNow, currentEpisode]);

  const switchServerTemp = (key: StreamServerKey, name: string) => {
    setSelectedServerKey(key);
    setActiveServerName(name);
    showToast(`Switched to ${name}`);
  };



  // Load filler flags for the current season entry
  useEffect(() => {
    let active = true;
    setFillerEpisodes(new Set());
    if (!targetMalId) return;
    jikanService
      .getAnimeEpisodes(targetMalId, {
        anilistId: targetMalId === anime.mal_id ? anime.anilist_id : undefined,
        malIsReal: targetMalId === anime.mal_id ? anime.mal_id_is_real : undefined,
      })
      .then((eps) => {
        if (!active) return;
        setFillerEpisodes(new Set(eps.filter((e) => e.filler).map((e) => e.mal_id)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [targetMalId]);

  // Go to the next episode, jumping over filler when "Skip Filler" is on
  const goToNextEpisode = (auto = false) => {
    let next = currentEpisode + 1;
    let skipped = 0;
    if (isSkipFiller && fillerEpisodes.size > 0) {
      const offset = resolvedEp.partEpisodeNumber ? resolvedEp.partEpisodeNumber - currentEpisode : 0;
      let probe = next;
      while (probe <= effectiveEpCount && fillerEpisodes.has(probe + offset)) probe++;
      if (probe <= effectiveEpCount) {
        skipped = probe - next;
        next = probe;
      } else if (auto) {
        return; // only filler is left: do not auto-play it
      }
    }
    if (next > effectiveEpCount) return;
    if (skipped > 0) showToast(`Skipped ${skipped} filler episode${skipped > 1 ? 's' : ''}`);
    onEpisodeChange?.(next, currentSeason);
  };
  const goToNextRef = useRef(goToNextEpisode);
  goToNextRef.current = goToNextEpisode;

  // Player messages: some servers report playback (play / timeupdate / ended) to the page.
  // This tells us the video really started, and when it ended (Auto Next). Only trusted player origins are listened to.
  const endedHandledRef = useRef('');
  useEffect(() => {
    endedHandledRef.current = '';
    const trusted = PLAYER_HOSTS;
    const handler = (event: MessageEvent) => {
      let host = '';
      try {
        host = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (!trusted.some((h) => host === h || host.endsWith('.' + h))) return;

      let data: any = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          data = { event: data };
        }
      }
      const inner = data && typeof data.data === 'object' && data.data ? data.data : data;
      const name = String(inner?.event ?? data?.event ?? data?.type ?? '').toLowerCase();
      const cur = Number(inner?.currentTime ?? inner?.time);
      const dur = Number(inner?.duration);

      // video is really playing
      const playing = name === 'play' || name === 'playing' || ((name === 'timeupdate' || name === 'time') && cur > 0);
      if (playing) {
        playedRef.current = true;
        setSlowHint(false);
        setStreamProblem((p) => (p === 'timeout' ? null : p));
        if (!capableRef.current[selectedServerKey]) {
          capableRef.current[selectedServerKey] = true;
          try {
            writePref('anizoro_player_events', JSON.stringify(capableRef.current));
          } catch {
            /* storage unavailable */
          }
        }
      }

      // Auto Next is a Vidstream 1 feature (our own player reports the end reliably; embeds do not)
      if (!isDirect || !isAutoNext) return;
      let ended = ['ended', 'complete', 'completed', 'finish', 'finished', 'end'].includes(name);
      if (!ended && (name === 'timeupdate' || name === 'time') && dur > 120 && cur / dur > 0.985) ended = true;
      if (!ended) return;

      const key = `${selectedServerKey}-${currentSeason}-${currentEpisode}`;
      if (endedHandledRef.current === key) return;
      endedHandledRef.current = key;
      showToast('Playing next episode');
      goToNextRef.current(true);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoNext, isDirect, selectedServerKey, currentSeason, currentEpisode]);

  // Events from Vidstream 1's own player
  const handleDirectPlaying = () => {
    playedRef.current = true;
    setDirectPlayed(true);
    // a dub that is really playing is the best proof that it exists
    if (activeFormat === 'dub') {
      const k = dubKeyFor(selectedServerKey);
      if (k) setDub(k, 'yes');
    }
    setSlowHint(false);
    setStreamProblem((p) => (p === 'timeout' ? null : p));
  };
  const handleDirectEnded = () => {
    if (!autoNextRef.current) return;
    const key = `${selectedServerKey}-${currentSeason}-${currentEpisode}`;
    if (endedHandledRef.current === key) return;
    endedHandledRef.current = key;
    showToast('Playing next episode');
    goToNextRef.current(true);
  };
  // Vidstream 1 asked every source for the dub and none has it: remember that and play the sub instead
  const handleDirectDubMissing = () => {
    const k = dubKeyFor(selectedServerKey);
    if (k) setDub(k, 'no');
  };
  // When a server has nothing for this episode, the next server is tried by itself (once per server and episode):
  // Vidstream 1 -> Vidstream 2 -> HD 1. The viewer's saved default server is not changed.
  const autoFallbackRef = useRef<{ episode: string; tried: Set<string> }>({ episode: '', tried: new Set() });
  const handleDirectProblem = (kind: StreamProblemKind, detail?: string) => {
    const episodeKey = `${targetMalId}|${currentSeason}|${currentEpisode}`;
    if (autoFallbackRef.current.episode !== episodeKey) autoFallbackRef.current = { episode: episodeKey, tried: new Set() };
    autoFallbackRef.current.tried.add(selectedServerKey);
    const next = STREAM_SERVERS.find((srv) => !autoFallbackRef.current.tried.has(srv.key));
    if (next && (kind === 'unavailable' || kind === 'unreachable')) {
      autoFallbackRef.current.tried.add(next.key);
      setStreamProblem(null);
      setDirectDetail(null);
      setSelectedServerKey(next.key);
      setActiveServerName(next.name);
      showToast(`${serverName(selectedServerKey)} has no working source for this episode. Trying ${next.name}...`);
      return;
    }
    setDirectDetail(detail ?? null);
    setIframeLoading(false);
    setStreamProblem(kind);
  };

  // Toggle Player Preferences & Save to LocalStorage with instant feedback
  const handleToggleAutoPlay = () => {
    setIsAutoPlay(prev => {
      const next = !prev;
      writePref('anizoro_autoplay', String(next));
      showToast(next ? 'Auto Play: ON' : 'Auto Play: OFF');
      return next;
    });
  };

  const handleToggleAutoSkip = () => {
    setIsAutoSkip(prev => {
      const next = !prev;
      writePref('anizoro_autoskip', String(next));
      showToast(next ? 'Auto Skip Intro: ON' : 'Auto Skip Intro: OFF');
      return next;
    });
  };

  const handleToggleAutoNext = () => {
    setIsAutoNext(prev => {
      const next = !prev;
      writePref('anizoro_autonext', String(next));
      showToast(next ? 'Auto Next Episode: ON' : 'Auto Next Episode: OFF');
      return next;
    });
  };

  const handleToggleSkipFiller = () => {
    setIsSkipFiller(prev => {
      const next = !prev;
      writePref('anizoro_skipfiller', String(next));
      showToast(next ? 'Skip Filler: ON' : 'Skip Filler: OFF');
      return next;
    });
  };

  const handleToggleDimLights = () => {
    setIsDimLights(prev => {
      const next = !prev;
      showToast(next ? 'Dim Lights: ON (Click backdrop to restore)' : 'Dim Lights: OFF');
      return next;
    });
  };

  const handleToggleExpand = () => {
    setIsExpanded(prev => {
      const next = !prev;
      showToast(next ? 'Player View: Expanded' : 'Player View: Standard');
      return next;
    });
  };

  // Season Select
  const handleSeasonSelect = (seasonIdx: number) => {
    const seasonAnime = mappedSeasons[seasonIdx] || anime;
    const labelInfo = formatSeasonDisplayLabel(seasonAnime, seasonIdx);
    const targetSeasonNum = labelInfo.seasonNumber || seasonIdx + 1;

    setTmdbSeason(targetSeasonNum);
    setMalIdOverride(seasonAnime.mal_id);
    setIframeLoading(true);

    if (onAnimeChange && seasonAnime.mal_id !== anime.mal_id) {
      onAnimeChange(seasonAnime, targetSeasonNum);
    } else if (onSeasonChange) {
      onSeasonChange(targetSeasonNum, seasonAnime);
    } else if (onEpisodeChange) {
      onEpisodeChange(1, targetSeasonNum, seasonAnime);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0c0d0c] text-zinc-100 flex flex-col overflow-y-auto font-sans select-none">
      {/* Top Header - Frosted Glass */}
      <header className="sticky top-0 z-40 frosted-glass-nav px-4 md:px-8 py-3.5 flex items-center justify-between" style={{ backgroundColor: 'rgba(9,9,11,0.9)' }}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            id="watch-player-back-btn"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition-colors cursor-pointer shrink-0"
            title="Back to Details"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0 flex-1 flex items-center gap-2.5">
            <AniZoroLogo size="sm" showSubtitle={false} className="hidden lg:inline-flex shrink-0" />
            <div className="min-w-0 flex-1">
              <h1 className="block text-xs sm:text-sm font-bold text-white truncate whitespace-nowrap overflow-hidden text-ellipsis">
                {displayAnimeTitle}
              </h1>
              <p className="block text-[11px] text-zinc-400 truncate whitespace-nowrap overflow-hidden text-ellipsis">
                {episodeTitle || `Episode ${currentEpisode}`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pl-3">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Share"
            aria-label="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} anime={anime} episode={currentEpisode} season={seasonNumber || 1} />

      {/* Toast Notification Banner for Player Settings */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            className="fixed top-16 right-4 sm:right-8 z-50 px-4 py-2 rounded-xl bg-[#0b1513]/90 backdrop-blur-xl border border-[#3fcf8e]/40 text-xs font-semibold text-white flex items-center gap-2 pointer-events-none"
          >
            <span className="w-2 h-2 rounded-full bg-[#3fcf8e]" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dim Lights Backdrop */}
      {isDimLights && (
        <div
          onClick={handleToggleDimLights}
          className="fixed inset-0 z-30 bg-black/85 backdrop-blur-sm cursor-pointer transition-opacity flex items-start justify-center pt-8"
        >
          <div className="px-4 py-1.5 rounded-full bg-zinc-900 border border-white/20 text-xs font-mono text-[#3fcf8e] flex items-center gap-2">
            <Sun className="w-3.5 h-3.5" />
            <span>Lights Dimmed · Click anywhere to restore</span>
          </div>
        </div>
      )}

      {/* Main Player Screen Canvas */}
      <main className={`flex-1 w-full mx-auto p-4 sm:p-6 flex flex-col gap-4 sm:gap-6 transition-all duration-300 ${isExpanded ? 'max-w-[98vw] px-2 sm:px-4' : 'max-w-[1500px] xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start'}`}>

        {/* Stage 1: Video Player (16:9 Screen) */}
        <div className={`relative w-full aspect-video bg-black border border-white/10 rounded-2xl overflow-hidden flex items-center justify-center transition-all ${isDimLights ? 'z-40 ring-1 ring-white/20' : 'z-0'}`}>
          {streamFailed && streamProblem && (
            <StreamStatusScreen
              kind={streamProblem}
              serverName={activeServerName}
              others={STREAM_SERVERS.filter((srv) => srv.key !== selectedServerKey).map((srv) => ({ key: srv.key, name: srv.name }))}
              onSwitch={(key, name) => switchServerTemp(key as StreamServerKey, name)}
              onRetry={() => setReloadKey((k) => k + 1)}
              onDismiss={streamProblem === 'unreachable' || isDirect ? undefined : () => setProblemDismissed(true)}
              detail={isDirect ? directDetail ?? undefined : undefined}
            />
          )}
          {isDirect && (
            <DirectPlayer
              key={`direct-${directKey}-${reloadKey}`}
              anilistId={directAnilistId}
              episode={streamTarget.directEp}
              alternates={streamTarget.directAlternates}
              source={selectedInfo?.api}
              progressId={`${anime.mal_id}:${currentSeason}:${currentEpisode}`}
              lang={activeFormat}
              autoPlay={isAutoPlay}
              autoSkip={isAutoSkip}
              title={`${displayAnimeTitle} Episode ${currentEpisode}`}
              onPlaying={handleDirectPlaying}
              onEnded={handleDirectEnded}
              onProblem={handleDirectProblem}
              onNotice={showToast}
              onDubMissing={handleDirectDubMissing}
            />
          )}
          {!isDirect && (iframeLoading || waitingForIds) && !streamFailed && (
            <div className="absolute inset-0 bg-[#0c0d0c] flex flex-col items-center justify-center gap-3 z-10 overflow-hidden">
              <div className="skeleton absolute inset-0 opacity-60" />
              <div className="skeleton w-14 h-14 rounded-full flex items-center justify-center"><Play className="w-6 h-6 text-white/40 fill-white/30" /></div>
              <span className="relative text-xs font-mono text-zinc-300">
                Connecting to {activeServerName} ({activeFormat.toUpperCase()})...
              </span>
              <span className="relative text-[11px] text-zinc-500 font-mono">Buffering stream</span>
            </div>
          )}
          {embedStreamUrl && (
          <iframe
            ref={iframeRef}
            key={`iframe-${embedStreamUrl}-${selectedServerKey}-${currentSeason}-${currentEpisode}-${activeFormat}-${malIdOverride}-${reloadKey}`}
            src={embedStreamUrl}
            title={`${displayAnimeTitle} Episode ${currentEpisode}`}
            className="w-full h-full border-0"
            width="100%"
            height="100%"
            scrolling="no"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            onLoad={() => {
              loadedRef.current = true;
              setStreamProblem((p) => (p === 'unreachable' ? null : p));
              if (minDoneRef.current) setIframeLoading(false);
              // 20 seconds to start playing. Servers known to report playback get a timeout screen;
              // for the others a small, dismissible hint is shown (and only if nobody touched the player).
              if (playTimerRef.current) clearTimeout(playTimerRef.current);
              playTimerRef.current = setTimeout(() => {
                if (playedRef.current) return;
                if (capableRef.current[selectedServerKey]) setStreamProblem((p) => p ?? 'timeout');
                else if (!interactedRef.current) setSlowHint(true);
              }, 20000);
            }}
          />
          )}
        </div>

        {/* Stage 2: episode info + controls (one grid item) */}
        <div className="flex flex-col gap-4 sm:gap-5 min-w-0">

          {/* Episode info */}
          <div className="frosted-glass rounded-2xl p-4 sm:p-5 space-y-3 relative overflow-hidden">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-mono font-bold text-[#3fcf8e] uppercase tracking-wider whitespace-nowrap">
                    Episode {currentEpisode}
                  </span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">SUB</span>
                  {STREAM_SERVERS.some((srv) => dubStatusOf(srv.key) === 'yes') && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300" title="An English dub exists for this episode">DUB</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onFinishEpisode(currentEpisode);
                    showToast(isFinished ? 'Episode marked uncompleted' : 'Episode marked watched');
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                    isFinished ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{isFinished ? 'Watched' : 'Mark watched'}</span>
                </button>
              </div>
              <div className="min-w-0 space-y-0.5">
                <h2 className="text-base sm:text-xl font-bold text-white leading-snug line-clamp-2 break-words" title={displayAnimeTitle}>{displayAnimeTitle}</h2>
                <p className="text-xs text-zinc-400 line-clamp-1 break-words">{episodeTitle || `Episode ${currentEpisode}`}</p>
              </div>
            </div>
            <NextEpisodeTimer malId={targetMalId} anilistId={targetMalId === anime.mal_id ? anime.anilist_id : undefined} />
          </div>

          {slowHint && !streamFailed && (
            <div className="bg-white/[0.06] border border-[#3fcf8e]/30 rounded-2xl p-3 flex items-center gap-2 text-xs text-zinc-300 flex-wrap">
              <span className="flex-1 min-w-[180px]">Video not starting? Try another server.</span>
              {STREAM_SERVERS.filter((srv) => srv.key !== selectedServerKey).map((srv) => (
                <button
                  key={srv.key}
                  type="button"
                  onClick={() => switchServerTemp(srv.key, srv.name)}
                  className="px-3 py-1.5 rounded-lg bg-[#3fcf8e] text-black font-bold cursor-pointer active:scale-95 transition-transform"
                >
                  {srv.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSlowHint(false)}
                className="px-2 py-1.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                aria-label="Dismiss"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Controls */}
          <div className="frosted-glass rounded-2xl p-4 sm:p-5 space-y-5 relative overflow-hidden">

            {/* Servers: a SUB section (every server) and a DUB section that only exists when this episode has a dub */}
            <div className="space-y-3">
              {([
                { fmt: 'sub' as const, label: 'SUB', Icon: Captions, servers: STREAM_SERVERS },
                // dub servers whose dub is confirmed missing for this episode are left out
                ...(episodeHasDub
                  ? [{ fmt: 'dub' as const, label: 'DUB', Icon: Mic, servers: STREAM_SERVERS.filter((srv) => srv.dub && dubStatusOf(srv.key) !== 'no') }]
                  : []),
              ]).map((group) => (
                <div key={group.fmt} className="space-y-2">
                  <ControlLabel>
                    <span className="inline-flex items-center gap-1.5">
                      <group.Icon className="w-3.5 h-3.5" />
                      {group.label}
                    </span>
                  </ControlLabel>
                  <div className="grid grid-cols-2 gap-1.5" role="tablist" aria-label={`${group.label} servers`}>
                    {group.servers.map((srv) => {
                      const selected = selectedServerKey === srv.key && activeFormat === group.fmt;
                      return (
                        <button
                          key={`${group.fmt}-${srv.key}`}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          onClick={() => {
                            setSelectedServerKey(srv.key);
                            setActiveServerName(srv.name);
                            setPreferredFormat(group.fmt);
                            if (typeof localStorage !== 'undefined') {
                              writePref('anizoro_pref_server', srv.key);
                              writePref('anizoro_pref_format', group.fmt);
                            }
                            showToast(`${srv.name} (${group.label})`);
                          }}
                          className={`min-w-0 px-3 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer active:scale-95 border ${
                            selected
                              ? 'bg-[#3fcf8e] text-black border-[#3fcf8e] shadow-sm'
                              : 'bg-black/30 border-white/10 text-zinc-300 hover:text-white hover:bg-white/5'
                          }`}
                          title={`${srv.name} (${srv.provider}) - ${group.label}`}
                        >
                          <span className={`w-4 h-4 rounded-full grid place-items-center shrink-0 ${selected ? 'bg-black/80' : 'bg-white/20'}`}>
                            <Play className={`w-2 h-2 ${selected ? 'text-[#3fcf8e] fill-[#3fcf8e]' : 'text-zinc-300 fill-zinc-300'}`} />
                          </span>
                          <span className="truncate">{srv.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Audio + episode navigation */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-2 flex-1 min-w-[200px]">
                <ControlLabel>Episode</ControlLabel>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={currentEpisode <= 1}
                    onClick={() => onEpisodeChange?.(currentEpisode - 1, currentSeason)}
                    className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-zinc-200 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                    title="Previous episode (Left arrow)"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>
                  <button
                    type="button"
                    disabled={currentEpisode >= effectiveEpCount}
                    onClick={() => goToNextEpisode()}
                    className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-zinc-200 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                    title="Next episode (Right arrow)"
                  >
                    <span>Next</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Playback options: Auto Play / Skip / Next need our own player, so they exist on Vidstream 1 only */}
            <div className="space-y-2">
              <ControlLabel>Playback</ControlLabel>
              <div className="flex flex-wrap gap-2">
                {isDirect && (
                  <>
                    <ToggleChip active={isAutoPlay} onClick={handleToggleAutoPlay} title="Start the video as soon as an episode loads (applies from the next episode)">
                      Auto Play
                    </ToggleChip>
                    <ToggleChip active={isAutoSkip} onClick={handleToggleAutoSkip} title="Skip the intro automatically when the source marks it">
                      Auto Skip
                    </ToggleChip>
                    <ToggleChip active={isAutoNext} onClick={handleToggleAutoNext} title="Play the next episode when this one ends">
                      Auto Next
                    </ToggleChip>
                  </>
                )}
                <ToggleChip active={isSkipFiller} onClick={handleToggleSkipFiller} title="Jump over filler episodes when going to the next episode">
                  Skip Filler
                </ToggleChip>
              </div>
              {!isDirect && (
                <p className="text-[11px] text-zinc-500">
                  Auto Play, Auto Skip and Auto Next work on{' '}
                  <button
                    type="button"
                    onClick={() => {
                      const srv = STREAM_SERVERS.find((x) => x.direct);
                      if (!srv) return;
                      setSelectedServerKey(srv.key);
                      setActiveServerName(srv.name);
                      writePref('anizoro_pref_server', srv.key);
                      showToast(`Switched to ${srv.name}`);
                    }}
                    className="text-[#3fcf8e] font-semibold hover:underline cursor-pointer"
                  >
                    {STREAM_SERVERS.find((x) => x.direct)?.name || 'Vidstream 1'}
                  </button>
                  .
                </p>
              )}
            </div>

            {/* View options */}
            <div className="space-y-2">
              <ControlLabel>View</ControlLabel>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleToggleDimLights}
                  className={`px-3 py-2 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                    isDimLights ? 'bg-[#3fcf8e]/20 border-[#3fcf8e]/50 text-[#3fcf8e]' : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
                  }`}
                  title="Dim the area around the player"
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>{isDimLights ? 'Lights dimmed' : 'Dim lights'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleExpand}
                  className={`hidden md:flex px-3 py-2 rounded-full border text-xs font-semibold items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                    isExpanded ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
                  }`}
                  title="Make the player wider"
                >
                  {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  <span>{isExpanded ? 'Standard width' : 'Wide'}</span>
                </button>
              </div>
            </div>

            {/* Stream info */}
            <div className="pt-3 border-t border-white/10 flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="truncate">
                Now streaming: <strong className="text-zinc-200 font-semibold">{activeServerName}</strong>
                {selectedInfo?.dub ? ` (${activeFormat.toUpperCase()})` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Stage 3: Seasons & Episodes Navigation Matrix - Frosted Glass */}
        <section className={`frosted-glass rounded-2xl p-4 sm:p-6 space-y-4 relative overflow-hidden ${isExpanded ? '' : 'xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto'}`}>
          
          {/* Header & View Controls */}
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-zinc-400" />
                <span>Episodes & Seasons</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {mappedSeasons.length > 1 ? `${mappedSeasons.length} Seasons available` : 'Season 1'} • {effectiveEpCount} Total Episodes
              </p>
            </div>

            {/* Search and Grid/List Toggles */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search Ep #..."
                  value={episodesSearch}
                  onChange={(e) => setEpisodesSearch(e.target.value)}
                  className="pl-8 pr-3 py-2 frosted-glass-input rounded-xl text-xs text-white placeholder:text-zinc-400 w-full focus:outline-none"
                />
              </div>

              <div className="flex shrink-0 frosted-glass-subtle rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => setEpViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    epViewMode === 'grid' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Grid View"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
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
          </div>

          {/* Franchise Seasons Tab Strip */}
          {mappedSeasons.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              {mappedSeasons.map((sAnime, sIdx) => {
                const labelInfo = formatSeasonDisplayLabel(sAnime, sIdx);
                const isCurrent = labelInfo.seasonNumber === currentSeason || sAnime.mal_id === resolvedEp.targetMalId;
                return (
                  <button
                    key={`season-btn-${sAnime.mal_id}-${sIdx}`}
                    type="button"
                    onClick={() => handleSeasonSelect(sIdx)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer active:scale-95 ${
                      isCurrent
                        ? 'bg-white text-black font-bold shadow-md'
                        : 'bg-black/50 border border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <span>{labelInfo.subtitle || `Season ${sIdx + 1}`}</span>
                    {labelInfo.shortBadge && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isCurrent ? 'bg-black/10 text-black font-bold' : 'bg-white/10 text-zinc-400'}`}>
                        {labelInfo.shortBadge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Episode Range Selector & Slider (Active when total episodes > 45) */}
          {effectiveEpCount > 45 && !episodesSearch && (
            <div className="space-y-3 pt-1">
              {/* Range Tabs / Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  disabled={selectedChunkIndex <= 0}
                  onClick={() => setSelectedChunkIndex(prev => Math.max(0, prev - 1))}
                  className="p-1.5 rounded-xl frosted-glass-interactive disabled:opacity-30 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
                  title="Previous Range"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: totalChunks }, (_, idx) => {
                  const s = idx * EPISODES_PER_CHUNK + 1;
                  const e = Math.min((idx + 1) * EPISODES_PER_CHUNK, effectiveEpCount);
                  const isCurrentRange = idx === selectedChunkIndex;
                  const containsPlayingEp = currentEpisode >= s && currentEpisode <= e;

                  return (
                    <button
                      key={`range-chunk-${idx}`}
                      type="button"
                      onClick={() => setSelectedChunkIndex(idx)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 border flex items-center gap-1.5 active:scale-95 ${
                        isCurrentRange
                          ? 'bg-[#3fcf8e] text-black border-[#3fcf8e] shadow-md shadow-emerald-500/20 font-bold'
                          : containsPlayingEp
                          ? 'frosted-glass-subtle text-[#3fcf8e] border-[#3fcf8e]/40 hover:bg-white/10'
                          : 'frosted-glass-subtle text-zinc-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span>{String(s).padStart(3, '0')} - {String(e).padStart(3, '0')}</span>
                      {containsPlayingEp && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isCurrentRange ? 'bg-black' : 'bg-[#3fcf8e]'}`} />
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  disabled={selectedChunkIndex >= totalChunks - 1}
                  onClick={() => setSelectedChunkIndex(prev => Math.min(totalChunks - 1, prev + 1))}
                  className="p-1.5 rounded-xl frosted-glass-interactive disabled:opacity-30 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
                  title="Next Range"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Range Slider Control (Reference match with yellow theme) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 frosted-glass-subtle border border-white/10 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-[#3fcf8e]" />
                  <span className="text-xs font-semibold text-zinc-200">
                    Episode Range Slider:
                  </span>
                  <span className="text-xs font-mono font-bold text-[#3fcf8e] bg-[#3fcf8e]/10 border border-[#3fcf8e]/20 px-2 py-0.5 rounded-md">
                    EP {activeChunkStart} - {activeChunkEnd}
                  </span>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-72">
                  <span className="text-[10px] font-mono text-zinc-500">1</span>
                  <input
                    type="range"
                    min={0}
                    max={totalChunks - 1}
                    value={selectedChunkIndex}
                    onChange={(e) => setSelectedChunkIndex(Number(e.target.value))}
                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#3fcf8e]"
                  />
                  <span className="text-[10px] font-mono text-zinc-500">{effectiveEpCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* Episodes Grid / List */}
          <div className="pt-2">
            {epViewMode === 'grid' ? (
              <div className={`grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 ${isExpanded ? 'lg:grid-cols-12' : 'lg:grid-cols-12 xl:grid-cols-5'}`}>
                {displayedEpisodes.map((epNum) => {
                  const isSelected = epNum === currentEpisode;
                  return (
                    <button
                      key={`ep-grid-btn-${epNum}`}
                      type="button"
                      onClick={() => onEpisodeChange?.(epNum, currentSeason)}
                      className={`h-11 rounded-xl text-xs font-mono font-bold flex items-center justify-center transition-all cursor-pointer active:scale-95 border ${
                        isSelected
                          ? 'bg-[#3fcf8e] text-black border-[#3fcf8e] shadow-lg shadow-emerald-500/30 scale-105'
                          : 'bg-black/50 border-white/10 text-zinc-300 hover:bg-zinc-800 hover:text-white hover:border-[#3fcf8e]/40'
                      }`}
                    >
                      {epNum}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {displayedEpisodes.map((epNum) => {
                  const isSelected = epNum === currentEpisode;
                  const jikanEp = seasonEpisodes.find((e) => e.mal_id === epNum);
                  return (
                    <button
                      key={`ep-list-btn-${epNum}`}
                      type="button"
                      onClick={() => onEpisodeChange?.(epNum, currentSeason)}
                      className={`w-full p-3 rounded-xl text-left text-xs font-sans flex items-center justify-between transition-all cursor-pointer active:scale-95 border ${
                        isSelected
                          ? 'bg-[#3fcf8e] text-black border-[#3fcf8e] shadow-md font-bold'
                          : 'bg-black/40 border-white/10 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-xs">EP {epNum}</span>
                        <span className="truncate max-w-md">
                          {jikanEp?.title || `Episode ${epNum}`}
                        </span>
                      </div>
                      <Play className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </section>

        {/* Stage 4: recommendations (fills the space under the episode details) */}
        <WatchRecommendations
          anime={anime}
          relatedMalIds={mappedSeasons.filter((sn) => sn.mal_id_is_real !== false).map((sn) => sn.mal_id).slice(0, 3)}
          onPick={(rec) => onAnimeChange?.(rec, 1)}
        />

      </main>

    </div>
  );
}

function ControlLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold tracking-tight text-zinc-500">{children}</p>;
}

function ToggleChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`px-3 py-2 rounded-full border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-95 ${
        active ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      <span className={`w-2 h-2 rounded-full transition-colors ${active ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
      <span>{children}</span>
    </button>
  );
}
