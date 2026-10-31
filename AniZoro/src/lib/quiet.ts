// Production builds print nothing to the browser console (no API hosts, URLs or error details for visitors to read).
// The build also strips console.* calls from our own code (vite.config.ts); this covers libraries too.
if (import.meta.env.PROD && typeof console !== 'undefined') {
  const noop = () => {};
  for (const k of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'dir', 'dirxml', 'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd', 'assert', 'count'] as const) {
    try {
      (console as any)[k] = noop;
    } catch {
      /* read-only console */
    }
  }
}
