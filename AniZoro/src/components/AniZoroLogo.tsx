import React, { useId } from 'react';
import { GLYPHS, GLYPH_GAP, WORD, ACCENT_FROM, WORD_WIDTH } from './aniZoroGlyphs';

interface AniZoroLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  iconOnly?: boolean;
}

export const BRAND = { light: '#7af5c4', jade: '#34e0a1', deep: '#0fae7a', ink: '#05100d', snow: '#eefaf5' };

const LETTERS = (() => {
  const out: { ch: string; x: number; accent: boolean }[] = [];
  let x = 0;
  WORD.split('').forEach((ch, i) => {
    out.push({ ch, x, accent: i >= ACCENT_FROM });
    x += GLYPHS[ch].w + GLYPH_GAP;
  });
  return out;
})();

/** One letter: a filled outline. The Z gets a thin blade line slicing through it. */
export function GlyphPath({ ch, accent, gradientId }: { ch: string; accent: boolean; gradientId: string }) {
  const g = GLYPHS[ch];
  const fill = accent ? `url(#${gradientId})` : BRAND.snow;
  if (ch !== 'Z') return <path d={g.d} fill={fill} />;
  return (
    <g>
      <path d={g.d} fill={fill} />
      <path d={`M${g.w * 0.84} -16 L${g.w * 0.16} 116`} stroke="#050b0a" strokeWidth="6.5" opacity="0.9" />
      <path d={`M${g.w * 0.84} -16 L${g.w * 0.16} 116`} stroke={BRAND.light} strokeWidth="2.2" />
    </g>
  );
}

export function BrandGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor={BRAND.light} />
      <stop offset="1" stopColor={BRAND.deep} />
    </linearGradient>
  );
}

/** AniZoro wordmark: "Ani" in snow white, "Zoro" in jade, with a blade slicing through the Z. */
export function AniZoroWordmark({ className = '' }: { className?: string }) {
  const gid = useId();
  return (
    <svg viewBox={`-6 -12 ${WORD_WIDTH + 12} 124`} className={className} role="img" aria-label="AniZoro" overflow="visible">
      <defs>
        <BrandGradient id={gid} />
      </defs>
      {LETTERS.map(({ ch, x, accent }, i) => (
        <g key={i} transform={`translate(${x} 0)`}>
          <GlyphPath ch={ch} accent={accent} gradientId={gid} />
        </g>
      ))}
    </svg>
  );
}

/** Icon mark: a sharp Z cut by a blade, on a jade glass tile. */
export function AniZoroMark({ className = '' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="AniZoro">
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8ffad0" />
          <stop offset="1" stopColor="#0c9d6e" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".4" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <rect width="100" height="100" rx="26" />
        </clipPath>
      </defs>
      <rect width="100" height="100" rx="26" fill={`url(#${id}t)`} />
      <rect width="100" height="100" rx="26" fill={`url(#${id}s)`} />
      <g clipPath={`url(#${id}c)`}>
        <g transform="translate(50 52) scale(1.12) translate(-50 -50)">
          <path d="M23 23H79V36L43 64H79V77H21V64L57 36H23Z" fill="#04120d" stroke="#04120d" strokeWidth="3" strokeLinejoin="round" />
        </g>
        <path d="M74 6 L26 94" stroke={`url(#${id}t)`} strokeWidth="5.5" />
        <path d="M77 6 L29 94" stroke="#fff" strokeWidth="1.6" opacity=".9" />
      </g>
      <rect x=".75" y=".75" width="98.5" height="98.5" rx="25.3" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
    </svg>
  );
}

export default function AniZoroLogo({
  className = '',
  size = 'md',
  showSubtitle = false,
  iconOnly = false,
}: AniZoroLogoProps) {
  const markClass =
    size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12 sm:h-16 sm:w-16' : size === 'xl' ? 'h-16 w-16 sm:h-24 sm:w-24' : 'h-9 w-9 sm:h-10 sm:w-10';
  const wordClass =
    size === 'sm' ? 'h-7' : size === 'lg' ? 'h-12 sm:h-16' : size === 'xl' ? 'h-16 sm:h-24' : 'h-8 sm:h-9';

  if (iconOnly) {
    return (
      <div className={`inline-flex items-center shrink-0 select-none ${className}`}>
        <AniZoroMark className={`${markClass} drop-shadow-[0_6px_16px_rgba(52,224,161,0.35)]`} />
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-start justify-center gap-1 select-none leading-none cursor-pointer ${className}`}>
      <AniZoroWordmark className={`${wordClass} w-auto drop-shadow-[0_4px_14px_rgba(52,224,161,0.28)]`} />
      {showSubtitle && (
        <span className="text-[9px] font-semibold tracking-[0.3em] uppercase text-zinc-400">Anime Streaming</span>
      )}
    </div>
  );
}
