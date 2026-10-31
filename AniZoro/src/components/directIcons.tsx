// Solid (filled) icons for the Vidstream 1 player, drawn to match the MegaPlay control set.
import React from 'react';

type P = React.SVGProps<SVGSVGElement>;
const svg = (p: P): P => ({ width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true, focusable: 'false', ...p });

export const IconVolume = (p: P) => (
  <svg {...svg(p)}>
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
);
export const IconMuted = (p: P) => (
  <svg {...svg(p)}>
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
  </svg>
);
export const IconPlay = (p: P) => (
  <svg {...svg(p)}>
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.2-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
  </svg>
);
export const IconPause = (p: P) => (
  <svg {...svg(p)}>
    <rect x="5.5" y="3.5" width="4.6" height="17" rx="1" />
    <rect x="13.9" y="3.5" width="4.6" height="17" rx="1" />
  </svg>
);
export const IconBack10 = (p: P) => (
  <svg {...svg(p)}>
    <path d="M12 5V1L6.5 6 12 11V7a6 6 0 1 1-6 6H3.5a8.5 8.5 0 1 0 8.5-8z" />
    <text x="12" y="15.9" textAnchor="middle" fontSize="7.6" fontWeight="800" fontFamily="system-ui,sans-serif">10</text>
  </svg>
);
export const IconForward10 = (p: P) => (
  <svg {...svg(p)}>
    <path d="M12 5V1l5.5 5L12 11V7a6 6 0 1 0 6 6h2.5A8.5 8.5 0 1 1 12 5z" />
    <text x="12" y="15.9" textAnchor="middle" fontSize="7.6" fontWeight="800" fontFamily="system-ui,sans-serif">10</text>
  </svg>
);
export const IconCast = (p: P) => (
  <svg {...svg(p)}>
    <path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z" />
  </svg>
);
export const IconCC = (p: P) => (
  <svg {...svg(p)}>
    <rect x="1" y="4" width="22" height="16" rx="3.2" />
    <text x="12" y="15.4" textAnchor="middle" fontSize="8.6" fontWeight="800" fontFamily="system-ui,sans-serif" style={{ fill: 'var(--az-cc-ink, #1b1b20)' }}>CC</text>
  </svg>
);
export const IconGear = (p: P) => (
  <svg {...svg(p)}>
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z" />
  </svg>
);
export const IconPip = (p: P) => (
  <svg {...svg(p)}>
    <path d="M19 7h-8v6h8V7zm2-4H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 1.98h18a2 2 0 0 0 2-1.98V5a2 2 0 0 0-2-2zm0 16.01H3V4.98h18v14.03z" />
  </svg>
);
export const IconEnterFullscreen = (p: P) => (
  <svg {...svg(p)}>
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
  </svg>
);
export const IconExitFullscreen = (p: P) => (
  <svg {...svg(p)}>
    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
  </svg>
);
