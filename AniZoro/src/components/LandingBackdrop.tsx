import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { jikanService } from '../lib/jikan';
import { prefersReducedMotion } from '../lib/motionPrefs';

interface Art {
  cover: string;
  banner: string;
  title: string;
}

// Loads and decodes an image fully before it is used, so it never pops in half-drawn.
async function preload(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return true;
  } catch {
    return false;
  }
}

// Each layer gets its own GPU layer so fading/zooming does not repaint the glass above it.
const GPU_LAYER: React.CSSProperties = {
  willChange: 'opacity, transform',
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden',
};

/** Slowly cross-fading anime artwork that fades out toward the left and bottom. Sits behind the page content. */
export default function LandingBackdrop() {
  const [arts, setArts] = useState<Art[]>([]);
  const [index, setIndex] = useState(0);
  const reduced = prefersReducedMotion();

  // Artwork of what is airing and trending right now (same list as the home spotlight)
  useEffect(() => {
    let active = true;
    (async () => {
      let airing: Awaited<ReturnType<typeof jikanService.getTopAiringAnime>> = [];
      try {
        airing = await jikanService.getTopAiringAnime();
      } catch {
        return;
      }
      for (const anime of airing.slice(0, 6)) {
        if (!active) return;
        const cover = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
        const banner = anime.banner_image || '';
        if (!cover) continue;
        const [coverOk, bannerOk] = await Promise.all([preload(cover), preload(banner)]);
        if (!coverOk || !active) continue;
        setArts((prev) =>
          prev.some((p) => p.cover === cover)
            ? prev
            : [...prev, { cover, banner: bannerOk ? banner : '', title: anime.title_english || anime.title }]
        );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (arts.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % arts.length), 7000);
    return () => clearInterval(timer);
  }, [arts.length]);

  const current = arts.length > 0 ? arts[index % arts.length] : null;

  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 top-0 h-[34rem] sm:h-[40rem] overflow-hidden pointer-events-none z-0"
      style={{
        maskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
      }}
    >
      <AnimatePresence mode="sync">
        {current && (
          <motion.div
            key={current.cover}
            className="absolute inset-0"
            style={GPU_LAYER}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, ease: 'easeInOut' }}
          >
            {/* soft wide wash from the banner (or the cover, blurred) */}
            <img
              src={current.banner || current.cover}
              alt=""
              decoding="async"
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover opacity-25 blur-2xl scale-110"
            />
            {/* main artwork, anchored right, fading to the left */}
            <motion.img
              src={current.cover}
              alt=""
              decoding="async"
              referrerPolicy="no-referrer"
              initial={reduced ? undefined : { scale: 1.08, x: 20 }}
              animate={reduced ? undefined : { scale: 1, x: 0 }}
              transition={{ duration: 8, ease: 'easeOut' }}
              className="absolute right-0 top-0 h-full w-full sm:w-[62%] lg:w-[48%] object-cover object-top opacity-60 sm:opacity-80"
              style={{
                ...GPU_LAYER,
                maskImage: 'linear-gradient(to left, black 35%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to left, black 35%, transparent 100%)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {/* keep text readable */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0c0d0c] via-[#0c0d0c]/55 to-transparent sm:via-[#0c0d0c]/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d0c] via-transparent to-[#0c0d0c]/40" />
    </div>
  );
}
