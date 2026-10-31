import React, { useEffect, useRef, useState } from 'react';
import { jikanService } from '../lib/jikan';

interface PosterImageProps {
  src?: string;
  malId?: number;
  alt: string;
  className?: string;
  /** above-the-fold posters: load right away instead of lazily */
  priority?: boolean;
}

/** <img> that fades in once decoded (no half-drawn pop-in) and recovers from a dead URL by looking up the real poster for the MAL id. */
export default function PosterImage({ src, malId, alt, className, priority = false }: PosterImageProps) {
  const [current, setCurrent] = useState<string | undefined>(src);
  const [loaded, setLoaded] = useState(false);
  const tried = useRef(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setCurrent(src);
    setLoaded(false);
    tried.current = false;
  }, [src, malId]);

  // images that were already cached finish before React attaches onLoad
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true);
  }, [current]);

  const recover = async () => {
    if (tried.current || !malId) return;
    tried.current = true;
    const fresh = await jikanService.getPosterByMalId(malId);
    if (fresh && fresh !== current) setCurrent(fresh);
  };

  return (
    <img
      ref={ref}
      src={current}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      {...(priority ? { fetchPriority: 'high' as const } : {})}
      referrerPolicy="no-referrer"
      className={className}
      style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.35s ease' }}
      onLoad={() => setLoaded(true)}
      onError={recover}
    />
  );
}
