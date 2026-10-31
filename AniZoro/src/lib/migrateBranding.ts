// One-time move of saved browser data from the old "nexa_" keys to the new "anizoro_" keys,
// so viewers keep their server choice, autoplay settings and update-log state after the rename.
// Imported first in main.tsx so it runs before any module reads localStorage.
try {
  if (typeof localStorage !== 'undefined') {
    const old: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('nexa_')) old.push(k);
    }
    for (const k of old) {
      const next = 'anizoro_' + k.replace(/^nexa_(stream_)?/, '');
      if (localStorage.getItem(next) === null) {
        const v = localStorage.getItem(k);
        if (v !== null) localStorage.setItem(next, v);
      }
      localStorage.removeItem(k);
    }
  }
} catch {
  /* storage unavailable */
}
export {};
