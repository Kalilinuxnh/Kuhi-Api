import React, { useState } from 'react';
import { jikanService } from '../lib/jikan';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Trash2, Clock, Film, Search } from 'lucide-react';
import { RecentWatch, JikanAnime } from '../types';
import { getProgressRatio } from '../lib/progress';

interface WatchHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  recentWatches: RecentWatch[];
  onPlayAnime: (anime: JikanAnime, epNum?: number) => void;
  onRemoveWatch: (malId: number) => void;
  onClearAll: () => void;
}

export const WatchHistoryModal: React.FC<WatchHistoryModalProps> = ({
  isOpen,
  onClose,
  recentWatches,
  onPlayAnime,
  onRemoveWatch,
  onClearAll,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  if (!isOpen) return null;

  const filteredWatches = recentWatches.filter((w) =>
    w.anime_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.episode_title && w.episode_title.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-3xl max-h-[85vh] frosted-glass-modal rounded-xl flex flex-col overflow-hidden z-10"
        >
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between gap-4 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white">
                <Clock className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                  Watch history
                </h2>
                <p className="text-xs text-zinc-400 font-mono">
                  {recentWatches.length} {recentWatches.length === 1 ? 'title' : 'titles'} you can resume
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {recentWatches.length > 0 && (
                <>
                  {showClearConfirm ? (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-xl">
                      <span className="text-xs text-red-400 font-medium">Clear all?</span>
                      <button
                        onClick={() => {
                          onClearAll();
                          setShowClearConfirm(false);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors cursor-pointer"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors cursor-pointer"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-white/10 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Clear watch history"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Clear all</span>
                    </button>
                  )}
                </>
              )}

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search Bar if multiple items */}
          {recentWatches.length > 3 && (
            <div className="px-5 py-3 border-b border-white/10 frosted-glass-subtle">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filter watch history..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl frosted-glass-input text-xs sm:text-sm text-white placeholder-zinc-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Watch List Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 custom-scrollbar">
            {filteredWatches.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 mx-auto flex items-center justify-center text-zinc-500">
                  <Film className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-zinc-300">No watch history found</p>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                  {searchTerm ? 'No results matched your search term.' : 'Episodes you watch will appear here so you can easily resume anytime.'}
                </p>
              </div>
            ) : (
              filteredWatches.map((watch) => (
                <div
                  key={`history-${watch.mal_id}`}
                  className="group relative frosted-glass-subtle hover:bg-white/[0.08] border border-white/10 hover:border-white/25 rounded-lg p-3 sm:p-4 flex items-center justify-between gap-4 transition-all"
                >
                  {/* Left: Thumbnail & Info */}
                  <div
                    onClick={() => {
                      const dummyAnime: JikanAnime = {
                        mal_id: watch.mal_id,
                        title: watch.anime_title,
                        images: { jpg: { image_url: watch.image_url, large_image_url: watch.image_url } },
                      } as any;
                      onPlayAnime(dummyAnime, watch.episode_number);
                      onClose();
                    }}
                    className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="relative aspect-video w-24 sm:w-32 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-white/10">
                      <img
                        src={watch.image_url}
                        alt={watch.anime_title}
                        referrerPolicy="no-referrer"
                        onError={async (e) => {
                          const el = e.currentTarget;
                          if (el.dataset.recovered) return;
                          el.dataset.recovered = '1';
                          const fresh = await jikanService.getPosterByMalId(watch.mal_id);
                          if (fresh) el.src = fresh;
                        }}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-7 h-7 rounded-full bg-[#3fcf8e] text-[#04120d] flex items-center justify-center">
                          <Play className="w-3 h-3 fill-current ml-0.5" />
                        </div>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                        <div className="h-full bg-[#3fcf8e]" style={{ width: `${Math.round(getProgressRatio(`${watch.mal_id}:1:${watch.episode_number}`) * 100)}%` }} />
                      </div>
                    </div>

                    <div className="min-w-0 space-y-1">
                      <span className="px-2 py-0.5 rounded bg-[#3fcf8e] text-[#04120d] font-mono font-bold text-[11px]">
                        EP {watch.episode_number}
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-zinc-200">
                        {watch.anime_title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {watch.episode_title || `Episode ${watch.episode_number}`}
                      </p>
                      {watch.watched_at && (
                        <p className="text-[10px] text-zinc-400 font-mono">
                          {new Date(watch.watched_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        const dummyAnime: JikanAnime = {
                          mal_id: watch.mal_id,
                          title: watch.anime_title,
                          images: { jpg: { image_url: watch.image_url, large_image_url: watch.image_url } },
                        } as any;
                        onPlayAnime(dummyAnime, watch.episode_number);
                        onClose();
                      }}
                      className="px-3 sm:px-4 py-2 rounded-md bg-[#3fcf8e] text-[#04120d] font-bold text-xs flex items-center gap-1.5 hover:bg-[#6af0b8] active:scale-95 transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span className="hidden sm:inline">Resume</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveWatch(watch.mal_id);
                      }}
                      className="w-8 h-8 rounded-xl bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-white/10 flex items-center justify-center transition-colors cursor-pointer"
                      title="Remove from history"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default WatchHistoryModal;
