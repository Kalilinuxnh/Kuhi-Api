import React from 'react';
import { motion } from 'motion/react';
import { ServerOff, TimerOff, WifiOff, RotateCcw } from 'lucide-react';

export type StreamProblemKind = 'unavailable' | 'timeout' | 'unreachable';

interface ServerOption {
  key: string;
  name: string;
}

interface Props {
  kind: StreamProblemKind;
  serverName: string;
  others: ServerOption[];
  onSwitch: (key: string, name: string) => void;
  onRetry: () => void;
  /** Lets the viewer keep the stream anyway (the check can be wrong). */
  onDismiss?: () => void;
  /** Extra line under the message (for example which sources were tried) */
  detail?: string;
}

const COPY: Record<StreamProblemKind, { title: string; body: string; accent: string; glow: string }> = {
  unavailable: {
    title: 'Not available on this server',
    body: 'This server does not have this episode. Try a different server.',
    accent: '#ef4444',
    glow: 'rgba(239,68,68,0.25)',
  },
  timeout: {
    title: 'Taking too long to start',
    body: 'The video has not started playing. Try another server or retry.',
    accent: '#3fcf8e',
    glow: 'rgba(63,207,142,0.25)',
  },
  unreachable: {
    title: 'Server not reachable',
    body: 'This server did not respond. Try a different server.',
    accent: '#3fcf8e',
    glow: 'rgba(63,207,142,0.25)',
  },
};

/** Full-player screen shown when a server cannot play the episode. Works the same for every server. */
export default function StreamStatusScreen({ kind, serverName, others, onSwitch, onRetry, onDismiss, detail }: Props) {
  const copy = COPY[kind];
  const Icon = kind === 'unavailable' ? ServerOff : kind === 'timeout' ? TimerOff : WifiOff;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="absolute inset-0 z-20 overflow-hidden bg-[#0c0d0c] flex flex-col items-center justify-center gap-4 p-4 text-center"
      role="alert"
    >
      {/* ambient glow */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: `radial-gradient(60% 60% at 50% 45%, ${copy.glow}, transparent 70%)` }}
      />
      {/* moving scan lines */}
      <div aria-hidden="true" className="az-scanlines absolute inset-0 opacity-30" />

      {/* icon with pulsing rings */}
      <div className="relative w-20 h-20 flex items-center justify-center">
        <span className="az-ring absolute inset-0 rounded-full border" style={{ borderColor: copy.accent }} />
        <span className="az-ring az-ring-delay absolute inset-0 rounded-full border" style={{ borderColor: copy.accent }} />
        <motion.div
          initial={{ scale: 0.6, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 14 }}
          className="relative w-14 h-14 rounded-2xl flex items-center justify-center border"
          style={{ background: copy.glow, borderColor: copy.accent }}
        >
          <Icon className="w-7 h-7" style={{ color: copy.accent }} />
        </motion.div>
      </div>

      <div className="relative space-y-1 max-w-xs">
        <p className="az-glitch text-base sm:text-lg font-bold text-white">{copy.title}</p>
        <p className="text-xs sm:text-sm text-zinc-400">
          <span className="text-zinc-200 font-semibold">{serverName}</span> - {copy.body}
        </p>
        {detail && <p className="text-[11px] font-mono text-zinc-500 break-words">{detail}</p>}
      </div>

      <div className="relative flex flex-wrap items-center justify-center gap-2">
        {others.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onSwitch(o.key, o.name)}
            className="px-3.5 py-1.5 rounded-xl bg-[#3fcf8e] text-black text-xs font-bold cursor-pointer active:scale-95 transition-transform"
          >
            {o.name}
          </button>
        ))}
        <button
          type="button"
          onClick={onRetry}
          className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-zinc-100 text-xs font-bold cursor-pointer active:scale-95 transition-all flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="relative text-[11px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2 cursor-pointer"
        >
          {kind === 'timeout' ? 'Keep waiting' : 'Load it anyway'}
        </button>
      )}
    </motion.div>
  );
}
