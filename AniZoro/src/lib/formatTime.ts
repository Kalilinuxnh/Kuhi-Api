/** "12/2/2027" in the viewer's own date format. */
export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' });
}

/** "8:30 PM GMT+5:30" in the viewer's own timezone. */
export function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** "8:30 PM" in the viewer's own timezone (no zone name, for tight spaces). */
export function formatClock(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "12/2/2027 - 8:30 PM GMT+5:30" */
export function formatExact(unixSeconds: number): string {
  return `${formatDate(unixSeconds)} - ${formatTime(unixSeconds)}`;
}

/** "2d 5h 10m", "3h 12m", "7m 05s". Negative values count as already passed. */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0m 00s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
