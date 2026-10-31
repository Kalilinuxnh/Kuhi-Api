import { DISCORD_URL } from '../lib/links';
import React, { useState } from 'react';
import { Search } from 'lucide-react';
import AniZoroLogo from './AniZoroLogo';
import SearchPreviewModal from './SearchPreviewModal';
import LandingBackdrop from './LandingBackdrop';
import { motion } from 'motion/react';
import { APP_VERSION } from '../lib/version';
import { JikanAnime } from '../types';

interface LandingHeroProps {
  onSearch: (searchTerm: string) => void;
  onVisitHome: () => void;
  onSelectAnime?: (anime: JikanAnime) => void;
  onOpenInfoModal?: (tab: 'about' | 'faq' | 'terms' | 'privacy' | 'dmca' | 'settings') => void;
}

const POPULAR_SEARCHES = [
  'Solo Leveling',
  'One Piece',
  'Sakamoto Days',
  'Bleach',
  'Naruto Shippuden',
  'Re:Zero',
  'Mushoku Tensei',
  'Jujutsu Kaisen',
];

export default function LandingHero({
  onSearch,
  onVisitHome,
  onSelectAnime,
  onOpenInfoModal,
}: LandingHeroProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      onSearch(searchTerm.trim());
    }
  };

  const handlePopularClick = (query: string) => {
    setSearchTerm(query);
    setIsPreviewOpen(true);
  };

  const footerLink = 'text-zinc-400 hover:text-white transition-colors cursor-pointer';

  return (
    <div className="min-h-screen text-zinc-200 flex flex-col selection:bg-emerald-400/30 selection:text-white font-sans relative overflow-x-hidden">
      <LandingBackdrop />

      <main className="w-full flex-1 relative z-10">
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 pt-32 sm:pt-44 lg:pt-52 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <AniZoroLogo size="lg" />

            <p className="mt-5 text-base sm:text-lg text-zinc-300 max-w-md leading-snug">
              Watch what is airing this season, sub or dub. No account, no popups.
            </p>

            <form onSubmit={handleSearchSubmit} className="mt-8 flex items-stretch gap-2">
              <div className="relative flex-1">
                <input
                  type="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => {
                    if (searchTerm.trim().length > 0) setIsPreviewOpen(true);
                  }}
                  onClick={() => setIsPreviewOpen(true)}
                  placeholder="Search for an anime"
                  className="w-full h-full frosted-glass-input rounded-lg py-3.5 pl-11 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none"
                />
                <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <button
                type="button"
                onClick={onVisitHome}
                className="shrink-0 px-5 rounded-lg bg-[#3fcf8e] hover:bg-[#59dca3] text-[#0c0d0c] font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
              >
                <span>Browse</span>
              </button>
            </form>

            <p className="mt-5 text-sm text-zinc-500 leading-relaxed">
              Try{' '}
              {POPULAR_SEARCHES.slice(0, 6).map((query, i, arr) => (
                <React.Fragment key={query}>
                  <button
                    type="button"
                    onClick={() => handlePopularClick(query)}
                    className="text-zinc-300 hover:text-[#3fcf8e] underline decoration-zinc-700 underline-offset-4 hover:decoration-[#3fcf8e] transition-colors cursor-pointer"
                  >
                    {query}
                  </button>
                  {i < arr.length - 1 ? ', ' : ''}
                </React.Fragment>
              ))}
            </p>
          </motion.div>

          <section className="mt-20 sm:mt-28 border-t border-zinc-800 pt-8">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-bold text-white">About AniZoro</h2>
              <span className="text-xs text-zinc-500 font-mono">{APP_VERSION}</span>
            </div>
            <p className="mt-3 text-sm text-zinc-400 leading-relaxed max-w-prose">
              AniZoro lists what is airing, keeps track of what you have watched and picks up where you left off.
              Trending, seasonal and schedule data come from AniList and refresh through the week.
              Episodes play in our own player with no popups, or on a backup server if one is down.
            </p>
            <p className="mt-4 text-xs text-zinc-500 leading-relaxed max-w-prose">
              We do not store, host, or encode media files on our infrastructure. All streams are delivered via third-party embeds.
              By using this service you agree to our{' '}
              <button
                type="button"
                onClick={() => onOpenInfoModal?.('terms')}
                className="text-zinc-300 underline underline-offset-4 decoration-zinc-600 hover:text-[#3fcf8e] cursor-pointer"
              >
                Terms of Service
              </button>
              .
            </p>
          </section>
        </div>
      </main>

      <footer className="w-full border-t border-zinc-800 bg-[#0c0d0c] py-6 px-4 sm:px-6 relative z-10">
        <div className="max-w-2xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-xs">
          <nav className="flex items-center gap-x-5 gap-y-2 flex-wrap">
            <button type="button" onClick={onVisitHome} className={footerLink}>Browse</button>
            <button type="button" onClick={() => onOpenInfoModal?.('about')} className={footerLink}>About</button>
            <button type="button" onClick={() => onOpenInfoModal?.('faq')} className={footerLink}>FAQ</button>
            <button type="button" onClick={() => onOpenInfoModal?.('terms')} className={footerLink}>Terms</button>
            <button type="button" onClick={() => onOpenInfoModal?.('privacy')} className={footerLink}>Privacy</button>
            <button type="button" onClick={() => onOpenInfoModal?.('dmca')} className={footerLink}>DMCA</button>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-[#aab2ff] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.191.328-.403.77-.552 1.12a18.27 18.27 0 0 0-5.487 0A12.6 12.6 0 0 0 9.29 3a19.74 19.74 0 0 0-4.433 1.37C2.056 8.56 1.296 12.644 1.676 16.67a19.9 19.9 0 0 0 6.073 3.07c.49-.667.926-1.376 1.3-2.12a12.9 12.9 0 0 1-2.047-.98c.172-.126.34-.258.502-.394 3.95 1.82 8.226 1.82 12.129 0 .164.136.332.268.502.394-.653.385-1.34.713-2.05.98.375.744.81 1.453 1.3 2.12a19.86 19.86 0 0 0 6.075-3.07c.446-4.667-.762-8.714-3.143-12.3ZM8.68 14.2c-1.183 0-2.157-1.085-2.157-2.42s.955-2.42 2.157-2.42c1.21 0 2.176 1.095 2.157 2.42 0 1.335-.955 2.42-2.157 2.42Zm6.64 0c-1.183 0-2.157-1.085-2.157-2.42s.955-2.42 2.157-2.42c1.21 0 2.176 1.095 2.157 2.42 0 1.335-.947 2.42-2.157 2.42Z"/></svg>
              Discord
            </a>
          </nav>
          <p className="text-zinc-500">© {new Date().getFullYear()} AniZoro</p>
        </div>
      </footer>

      {/* Instant Search Preview Modal */}
      <SearchPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        initialQuery={searchTerm}
        onSelectAnime={(anime) => {
          setIsPreviewOpen(false);
          if (onSelectAnime) {
            onSelectAnime(anime);
          } else {
            onSearch(anime.title_english || anime.title);
          }
        }}
        onViewAll={(q) => {
          setIsPreviewOpen(false);
          onSearch(q);
        }}
      />
    </div>
  );
}
