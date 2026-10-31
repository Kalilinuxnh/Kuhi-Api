import React, { useId } from 'react';
import { GLYPHS, WORD, ACCENT_FROM } from './aniZoroGlyphs';
import { BrandGradient, GlyphPath } from './AniZoroLogo';
import './brand-loader.css';

const LETTERS = WORD.split('');

/** AniZoro loader shown inside the Vidstream 1 player while a stream is being found: the wordmark hops letter by letter. */
export default function BrandLoader({ text }: { text?: string }) {
  const gid = useId();
  return (
    <div className="azl-wrap" role="status" aria-live="polite" aria-label={text || 'Loading'}>
      <div className="azl-glow" aria-hidden="true" />
      <div className="azl-word" aria-hidden="true">
        {LETTERS.map((ch, i) => {
          const g = GLYPHS[ch];
          return (
            <svg
              key={i}
              className={`azl-letter`}
              style={{ animationDelay: `${i * 0.08}s`, width: `calc(var(--azl-h) * ${(g.w + 8) / 100})` }}
              viewBox={`-4 -12 ${g.w + 8} 124`}
            >
              <defs>
                <BrandGradient id={`${gid}${i}`} />
              </defs>
              <GlyphPath ch={ch} accent={i >= ACCENT_FROM} gradientId={`${gid}${i}`} />
            </svg>
          );
        })}
      </div>
      {text && <div className="azl-text">{text}</div>}
    </div>
  );
}
