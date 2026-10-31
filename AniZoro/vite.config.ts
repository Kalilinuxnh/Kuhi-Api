import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Link previews (WhatsApp, Discord, Telegram, X...) need absolute URLs. Fill them in at build time from
// VITE_SITE_URL (set it to your own domain), or from the domain Vercel / Cloudflare Pages gives the project.
function siteUrl(): string {
  const raw =
    process.env.VITE_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    process.env.CF_PAGES_URL ||
    '';
  return raw.replace(/\/+$/, '');
}

const siteUrlPlugin = (): Plugin => ({
  name: 'anizoro-site-url',
  transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl()),
});

export default defineConfig({
  plugins: [react(), tailwindcss(), siteUrlPlugin()],
  // no console.* / debugger in the shipped code, so nothing about our APIs is printed for visitors
  esbuild: { drop: ['console', 'debugger'] },
  build: { sourcemap: false },
});
