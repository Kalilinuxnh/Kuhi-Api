import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, Search, Bell, X, Tv, Film, Flame, Star, Layers, Shield, HelpCircle, ChevronDown, Shuffle, Trophy } from 'lucide-react';
import { UserProfile, JikanAnime } from '../types';
import AniZoroLogo from './AniZoroLogo';
import { InfoModalTab } from './InfoModals';
import SearchPreviewModal from './SearchPreviewModal';
import { useNotifications, NotificationPanel } from './NotificationCenter';
import { jikanService } from '../lib/jikan';
import { BROWSE_GENRES } from '../lib/browse';
import type { BrowseCategory } from '../lib/browse';

interface NavbarProps {
  profile?: UserProfile | null;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  onLogout?: () => void;
  watchedCount?: number;
  completedCount?: number;
  onAddSearchQuery?: (val: string) => void;
  onRemoveSearchQuery?: (val: string) => void;
  onOpenInfoModal?: (tab: InfoModalTab) => void;
  onSelectAnime?: (anime: JikanAnime) => void;
  /** Open a catalog section (Movies, Series...), optionally filtered to one genre. */
  onBrowse?: (category: BrowseCategory, genre?: string | null) => void;
  activeBrowse?: BrowseCategory | null;
  activeGenre?: string | null;
}

const NAV_ITEMS: Array<{ id: BrowseCategory; label: string }> = [
  { id: 'movies', label: 'Movies' },
  { id: 'series', label: 'Series' },
  { id: 'new', label: 'New releases' },
  { id: 'popular', label: 'Popular' },
  { id: 'top', label: 'Top rated' },
];

const navItemClass = (active: boolean) =>
  `relative flex h-full items-center gap-1 whitespace-nowrap border-b-2 px-3 xl:px-3.5 text-sm font-semibold transition-colors cursor-pointer ${
    active ? 'border-[#3fcf8e] text-white' : 'border-transparent text-zinc-400 hover:text-white'
  }`;

export default function Navbar({
  searchTerm,
  onSearchChange,
  onOpenInfoModal,
  onSelectAnime,
  onBrowse,
  activeBrowse,
  activeGenre,
}: NavbarProps) {
  const navigate = useNavigate();
  const [isSearchPreviewOpen, setIsSearchPreviewOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isGenresOpen, setIsGenresOpen] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);

  const notifications = useNotifications();

  const notificationRef = useRef<HTMLDivElement>(null);
  const genresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setIsNotificationOpen(false);
      }
      if (genresRef.current && !genresRef.current.contains(target)) {
        setIsGenresOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsGenresOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // "/" opens search, like the hint in the search box says
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setIsSearchPreviewOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const unreadCount = notifications.unreadCount;

  const handleSelectFromPreview = (anime: JikanAnime) => {
    setIsSearchPreviewOpen(false);
    if (onSelectAnime) {
      onSelectAnime(anime);
    } else {
      onSearchChange(anime.title_english || anime.title);
      navigate('/anime');
    }
  };

  const goHome = () => {
    onSearchChange('');
    navigate('/');
  };

  // Opens a random popular title
  const handleRandom = async () => {
    if (randomLoading || !onSelectAnime) return;
    setRandomLoading(true);
    try {
      const page = 1 + Math.floor(Math.random() * 4);
      const res = await jikanService.browseAnime('popular', null, page);
      if (res.items.length > 0) {
        onSelectAnime(res.items[Math.floor(Math.random() * res.items.length)]);
      }
    } catch {
      // nothing to show; the button simply becomes available again
    } finally {
      setRandomLoading(false);
    }
  };

  const drawerItemClass =
    'w-full text-left px-3 py-2.5 rounded-md text-sm font-semibold text-zinc-200 hover:text-white hover:bg-white/5 flex items-center gap-2.5 cursor-pointer transition-colors';

  return (
    <>
      <header className="sticky top-0 z-40 w-full frosted-glass-nav select-none font-sans">
        <div className="max-w-[1760px] mx-auto px-4 sm:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 lg:gap-6">
          {/* Left: menu (mobile) and logo */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="lg:hidden p-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              title="Menu"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div onClick={goHome} className="cursor-pointer" title="AniZoro: Anime Streaming">
              <AniZoroLogo size="md" />
            </div>
          </div>

          {/* Center: main navigation */}
          <nav className="hidden lg:flex h-full items-stretch" aria-label="Main">
            <button type="button" onClick={goHome} className={navItemClass(!activeBrowse && !activeGenre)}>
              Home
            </button>

            <div ref={genresRef} className="relative h-full">
              <button
                type="button"
                onClick={() => setIsGenresOpen((v) => !v)}
                aria-expanded={isGenresOpen}
                aria-haspopup="true"
                className={navItemClass(Boolean(activeGenre) || isGenresOpen)}
              >
                Genres
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isGenresOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isGenresOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.14 }}
                    className="absolute left-0 top-full mt-px w-[460px] rounded-lg frosted-glass-modal p-3"
                  >
                    <div className="grid grid-cols-3 gap-0.5">
                      {BROWSE_GENRES.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            setIsGenresOpen(false);
                            onBrowse?.('popular', g);
                          }}
                          className={`rounded-md px-3 py-2 text-left text-sm font-medium transition-colors cursor-pointer hover:bg-white/5 hover:text-[#3fcf8e] ${
                            activeGenre === g ? 'text-[#3fcf8e]' : 'text-zinc-300'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onBrowse?.(item.id)}
                className={navItemClass(activeBrowse === item.id && !activeGenre)}
              >
                {item.label}
              </button>
            ))}

            <button type="button" onClick={handleRandom} disabled={randomLoading} className={`${navItemClass(false)} disabled:opacity-60`}>
              <Shuffle className="w-3.5 h-3.5" />
              Random
            </button>
          </nav>

          {/* Right: search and notifications */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <div
              onClick={() => setIsSearchPreviewOpen(true)}
              role="button"
              tabIndex={0}
              aria-label="Search anime"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsSearchPreviewOpen(true);
                }
              }}
              className="group flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#3a3b3a] bg-[#151615] px-3 text-zinc-400 transition-colors hover:border-[#4b4c4b] hover:text-white min-w-0 w-10 sm:w-56 lg:w-64 xl:w-80 justify-center sm:justify-start"
            >
              <Search className="w-4 h-4 shrink-0" />
              <span className="hidden sm:block truncate text-[13px] font-medium">{searchTerm || 'Search anime'}</span>
              <kbd className="hidden lg:inline-block ml-auto rounded border border-[#3a3b3a] px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
                /
              </kbd>
            </div>

            <div ref={notificationRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                title="Notifications"
                aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              >
                <Bell className="w-[18px] h-[18px]" />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#3fcf8e] px-1 text-[10px] font-bold text-black">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {isNotificationOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="fixed inset-x-3 top-16 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 frosted-glass-modal rounded-xl p-4 z-50"
                  >
                    <NotificationPanel
                      notifications={notifications}
                      onAction={(action) => {
                        if (action.type === 'terms') {
                          setIsNotificationOpen(false);
                          onOpenInfoModal?.('terms');
                        } else if (action.type === 'anime') {
                          setIsNotificationOpen(false);
                          if (onSelectAnime) onSelectAnime(action.anime);
                        }
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Side drawer for phones and tablets */}
      <AnimatePresence>
        {isDrawerOpen && (
          <div className="fixed inset-0 z-50 flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/80"
            />

            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="relative w-72 max-w-[85vw] frosted-glass-modal h-full flex flex-col z-10 overflow-y-auto"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div
                  onClick={() => {
                    setIsDrawerOpen(false);
                    navigate('/');
                  }}
                  className="cursor-pointer"
                >
                  <AniZoroLogo size="md" />
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 space-y-0.5">
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    goHome();
                  }}
                  className={drawerItemClass}
                >
                  <Tv className="w-4 h-4 text-[#3fcf8e]" />
                  <span>Home</span>
                </button>
                <button onClick={() => { setIsDrawerOpen(false); onBrowse?.('movies'); }} className={drawerItemClass}>
                  <Film className="w-4 h-4 text-[#3fcf8e]" />
                  <span>Movies</span>
                </button>
                <button onClick={() => { setIsDrawerOpen(false); onBrowse?.('series'); }} className={drawerItemClass}>
                  <Layers className="w-4 h-4 text-[#3fcf8e]" />
                  <span>Series</span>
                </button>
                <button onClick={() => { setIsDrawerOpen(false); onBrowse?.('new'); }} className={drawerItemClass}>
                  <Flame className="w-4 h-4 text-[#3fcf8e]" />
                  <span>New releases</span>
                </button>
                <button onClick={() => { setIsDrawerOpen(false); onBrowse?.('popular'); }} className={drawerItemClass}>
                  <Star className="w-4 h-4 text-[#e8b84a]" />
                  <span>Popular</span>
                </button>
                <button onClick={() => { setIsDrawerOpen(false); onBrowse?.('top'); }} className={drawerItemClass}>
                  <Trophy className="w-4 h-4 text-[#e8b84a]" />
                  <span>Top rated</span>
                </button>
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    handleRandom();
                  }}
                  className={drawerItemClass}
                >
                  <Shuffle className="w-4 h-4 text-[#3fcf8e]" />
                  <span>Random anime</span>
                </button>
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setIsNotificationOpen(true);
                  }}
                  className={`${drawerItemClass} justify-between`}
                >
                  <div className="flex items-center gap-2.5">
                    <Bell className="w-4 h-4 text-[#3fcf8e]" />
                    <span>Notifications</span>
                  </div>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-[#3fcf8e]/20 text-[#3fcf8e] font-bold text-[10px]">
                      {unreadCount} new
                    </span>
                  )}
                </button>
              </div>

              <div className="px-4 pt-3 pb-4 border-t border-white/10">
                <p className="text-xs font-semibold text-zinc-500 mb-2.5">Genres</p>
                <div className="flex flex-wrap gap-1.5">
                  {BROWSE_GENRES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        setIsDrawerOpen(false);
                        onBrowse?.('popular', g);
                      }}
                      className="rounded-md border border-[#2a2b2a] bg-[#1b1c1b] px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-[#3fcf8e]/50 hover:text-white cursor-pointer"
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-auto p-3 border-t border-white/10 space-y-0.5">
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    onOpenInfoModal?.('terms');
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <Shield className="w-4 h-4 text-zinc-500" />
                  <span>Legal & DMCA</span>
                </button>
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    onOpenInfoModal?.('faq');
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-white flex items-center gap-2 cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4 text-zinc-500" />
                  <span>FAQ & help</span>
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <SearchPreviewModal
        isOpen={isSearchPreviewOpen}
        onClose={() => setIsSearchPreviewOpen(false)}
        initialQuery={searchTerm}
        onSelectAnime={handleSelectFromPreview}
        onViewAll={(q) => {
          onSearchChange(q);
          navigate('/anime');
        }}
      />
    </>
  );
}
