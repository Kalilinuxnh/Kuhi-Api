# AniZoro

A personal anime catalog and player built with React, TypeScript and Vite.

- Catalog data (trending, seasonal, airing schedule, recommendations, characters) comes from AniList, with Jikan as a fallback.
- Playback uses third-party embeds. AniZoro does not host any media.
- Servers (`src/lib/servers.ts`): **Vidstream 1** is the main server and the default (our own player fed by the self-hosted Anivexa API, AniList ID). Vidstream 2 (MegaPlay, MAL ID), Vidstream 3 (VidLink) and HD 1 (VidCore) are third-party iframes; the last two use the TMDb ID.
- Vidstream 1 asks the Anivexa API (`https://anivexa-api-pi.vercel.app`) for the episode, pulls the stream links out of the JSON (`src/lib/anivexa.ts`) and always uses Auto: it asks the priority providers first (`PRIORITY_PROVIDERS` in `src/lib/anivexa.ts`, currently Anikoto) and only moves on to the others when none of them has a stream that plays. Provider names are never shown to viewers.
- The player is Video.js v10 (beta) with a custom MegaPlay-style skin: `src/components/VjsStage.tsx` + `direct-skin.css` (accent colour and bar colours are CSS variables at the top of the stylesheet). `DirectPlayer.tsx` handles resolving and fallback (only real HLS/MP4 streams are played, embed pages with ads are ignored); `BrandLoader.tsx` is the hopping AniZoro loader. `api/proxy.ts` is a fallback for streams that need a Referer header or have no CORS.
- Point the app at another Anivexa deployment with `VITE_ANIVEXA_BASE`. To see the raw API answers in the console set `localStorage.anizoro_debug = '1'`.
- Check what the API returns for an episode: `npm run check:anivexa -- 16498 1 sub` (AniList ID, episode, sub|dub, optional provider).

## Run locally

```
npm install
npm run dev
```

No API keys are required.

## Deploy

The project is a static single-page app. It deploys to Vercel as is (`vercel.json` rewrites every route to `index.html`).

## Branding

- Name: **AniZoro** (formerly Nexa Stream). Look: flat near-black (`#0c0d0c`), one green accent (`#3fcf8e`), a touch of gold (`#e8b84a`) for ratings. Fonts: Archivo (headings) and Manrope (everything else), loaded in `index.html`.
- Theme: `src/index.css`. Flat solid surfaces with hairline borders, tight corners (radii are overridden in `@theme`), no blur, glow or gradient fills. The old `frosted-glass*` class names are kept but now draw plain panels. `zinc-*` and `emerald-*` are re-tinted in `@theme`.
- Logo: a Z cut by a blade (a nod to Zoro's swords). `src/components/AniZoroLogo.tsx` (geometry in `aniZoroGlyphs.ts`) draws the mark and the monoline ANI / ZORO wordmark as inline SVG (no font needed). `public/anizoro-logo.svg`, `favicon.svg`, `icon-512.svg`, the PNG icons and `og-anizoro.png` are the same artwork.
- Vidstream 1 loading animation: `BrandLoader.tsx` + `brand-loader.css` (hopping letters).
- Saved browser data moved from `nexa_*` to `anizoro_*` keys; `src/lib/migrateBranding.ts` copies old values over once.
- Link previews: `index.html` uses `%SITE_URL%`, filled in at build from `VITE_SITE_URL` (set this to your domain) or the Vercel project domain. The share image is `public/og-anizoro.png`; apps cache previews, so re-scrape the link (Facebook Sharing Debugger, or send it with `?v=2`) after the first deploy.

## Layout and UI components

- Home (`Dashboard.tsx`): full-bleed spotlight with poster thumbnails, Continue watching, then a main column (Trending now, Latest episodes grid with All / TV / ONA filter, Popular this season, Recommended, Release schedule) and a sidebar (Top anime with Trending / Season / Top rated tabs, Browse by genre).
- `PosterCard.tsx` is the one poster card used on every page (score, episode and type badges, play on hover). `ui.tsx` holds the shared `SectionHeader`, `Tabs` and `PosterRow`.
- Navbar: Genres menu, Movies / Series / New releases / Popular / Top rated, Random, and the `/` shortcut for search. Genre pages are `navigate('/anime', { state: { browse, genre } })` and open `BrowseView` with that genre selected.
- The footer repeats the browse links and genres.

## Remembered in the browser

- **Playback position** (`src/lib/progress.ts`, key `anizoro_progress_v1`): saved every 5 s, on pause and when the page is hidden. Reopening the episode in Vidstream 1 resumes a few seconds before where you stopped; finished episodes (last minute or 93%) start over. Third-party iframe servers cannot be resumed.
- **Player preferences** (`src/lib/prefs.ts`): volume, mute, speed, subtitle language and size, server, sub/dub, autoplay, auto skip, auto next, episode list view.
- **Faster starts:** the player code is fetched while the browser is idle, the next episode's stream is looked up 30 s into the current one, and upcoming hero banners are preloaded. Data saver and 2G/3G skip the background work.
- **Loading and rate limits (AniList):** every AniList request goes through one queue in `src/lib/jikan.ts` (`anilistPost`): at most 3 at a time, a 429 pauses the queue for the time AniList asks, and a failed request retries once. The billboard, Trending now and Popular this season come from one request (`getHomeLanes`); Latest releases and the Release Schedule keep their last good answer in localStorage (`anizoro_fresh_*`) and show it if the network fails. The schedule loads when scrolled near and shows a "Try again" message instead of disappearing.
- **Cloudflare Pages:** `functions/api/proxy.ts` and `functions/api/probe.ts` are the Pages Functions versions of `api/*` (which stay for Vercel). Build command `npm run build`, output `dist`. Set `VITE_SITE_URL` to your domain. Deploy from the CLI: `npx wrangler pages deploy dist --project-name anizoro`.

## Sharing and link previews

- **Share sheet** (`src/components/ShareSheet.tsx`, helpers in `src/lib/share.ts`): opened from the Share button on the anime page and in the player. It shows a preview card (poster, title, score, type, year, episodes), the link with one-tap Copy (works without `navigator.clipboard` too), the phone's own share sheet when available, and WhatsApp / Telegram / X / Reddit / Facebook / Email. In the player a switch picks "Episode N" or "Whole series".
- **Rich previews** (`functions/anime/[[path]].ts`): chat apps do not run JavaScript, so this Pages Function rewrites the `<head>` of `/anime/<id>-<slug>` and `/anime/<id>-<slug>/s<season>/<ep>` before the page is sent: title, description (score, type, year, episodes, genres, synopsis), poster as `og:image`, the poster's colour as `theme-color` (Discord's embed stripe), canonical URL and schema.org JSON-LD. Data comes from AniList (Jikan as fallback) and is cached at the edge for 6 hours. If anything fails, the normal `index.html` is served.
- `src/lib/slug.ts` is shared by the app and that function, so both read the same URLs.
- Test a preview: paste a link in Discord/Telegram, or use the Facebook Sharing Debugger / opengraph.xyz. Chat apps cache previews; add `?v=2` to force a fresh one. Quick local check after deploy: `curl -s https://<your-domain>/anime/16498-attack-on-titan | grep -i 'og:'`.
- Vercel: this Function is Cloudflare-only; on Vercel the generic site card is still used.

