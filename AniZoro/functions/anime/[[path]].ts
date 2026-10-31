// Cloudflare Pages Function: link previews for shared anime / episode pages.
//
//   /anime/<id>-<slug>                 series page
//   /anime/<id>-<slug>/s<season>/<ep>  episode page
//
// Why: AniZoro is a single-page app, so every URL used to answer with the same index.html. WhatsApp, Telegram,
// Discord, X, Facebook, iMessage and Slack do not run JavaScript, so a shared anime link always showed the generic
// site card. This function takes the normal index.html, looks the anime up (AniList, with Jikan as a fallback) and
// rewrites the title, description, poster image, accent colour and canonical URL before the page is sent. Browsers
// get the same page as before and the React app takes over; only the <head> differs.
//
// Anything that goes wrong (unknown id, API down, timeout) falls back to the untouched index.html, so a share link
// can never break the site. Looked-up data is kept in the Cloudflare edge cache for 6 hours.

import { parseAnimeSlug } from '../../src/lib/slug';

// Provided by the Workers runtime (the project does not pull in @cloudflare/workers-types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const HTMLRewriter: any;

interface AnimeMeta {
  malId: number;
  title: string;
  description: string;
  cover: string;
  banner: string | null;
  color: string | null;
  score: number | null; // 0-10
  format: string | null;
  year: number | null;
  episodes: number | null;
  genres: string[];
  status: string | null;
}

const SITE = 'AniZoro';
const UA = 'Mozilla/5.0 (compatible; AniZoro/1.0; +https://anizoro-anime.pages.dev)';
const KEEP_SECONDS = 6 * 3600;

const ANILIST_QUERY = `query ($id: Int) {
  Media(idMal: $id, type: ANIME) {
    title { romaji english }
    description(asHtml: false)
    coverImage { extraLarge large color }
    bannerImage
    averageScore
    format
    seasonYear
    episodes
    status
    genres
  }
}`;

const FORMAT_LABEL: Record<string, string> = {
  TV: 'TV',
  TV_SHORT: 'TV Short',
  MOVIE: 'Movie',
  SPECIAL: 'Special',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Music',
};

const STATUS_LABEL: Record<string, string> = {
  FINISHED: 'Completed',
  RELEASING: 'Airing now',
  NOT_YET_RELEASED: 'Upcoming',
  CANCELLED: 'Cancelled',
  HIATUS: 'On hiatus',
};

/** AniList / Jikan synopses contain <br>, <i> and "(Source: ...)" tails; make them one clean paragraph. */
function cleanSynopsis(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&rsquo;/g, "'")
    .replace(/\[Written by [^\]]*\]|\(Source:[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!-]+$/, '') + '…';
}

async function fromAniList(malId: number): Promise<AnimeMeta | null> {
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': UA },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: { id: malId } }),
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) return null;
  const media = ((await res.json().catch(() => null)) as any)?.data?.Media; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!media) return null;
  const title = media.title?.english || media.title?.romaji;
  const cover = media.coverImage?.extraLarge || media.coverImage?.large;
  if (!title || !cover) return null;
  return {
    malId,
    title,
    description: cleanSynopsis(media.description),
    cover,
    banner: media.bannerImage || null,
    color: /^#[0-9a-f]{6}$/i.test(media.coverImage?.color || '') ? media.coverImage.color : null,
    score: typeof media.averageScore === 'number' ? media.averageScore / 10 : null,
    format: FORMAT_LABEL[media.format] || null,
    year: media.seasonYear || null,
    episodes: media.episodes || null,
    genres: Array.isArray(media.genres) ? media.genres : [],
    status: STATUS_LABEL[media.status] || null,
  };
}

async function fromJikan(malId: number): Promise<AnimeMeta | null> {
  const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`, {
    headers: { accept: 'application/json', 'user-agent': UA },
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) return null;
  const d = ((await res.json().catch(() => null)) as any)?.data; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!d) return null;
  const cover = d.images?.jpg?.large_image_url || d.images?.jpg?.image_url;
  const title = d.title_english || d.title;
  if (!title || !cover) return null;
  return {
    malId,
    title,
    description: cleanSynopsis(d.synopsis),
    cover,
    banner: null,
    color: null,
    score: typeof d.score === 'number' ? d.score : null,
    format: d.type || null,
    year: d.year || (d.aired?.from ? new Date(d.aired.from).getUTCFullYear() : null),
    episodes: d.episodes || null,
    genres: Array.isArray(d.genres) ? d.genres.map((g: { name: string }) => g.name) : [],
    status: d.status === 'Currently Airing' ? 'Airing now' : d.status === 'Finished Airing' ? 'Completed' : null,
  };
}

async function loadMeta(malId: number, waitUntil?: (p: Promise<unknown>) => void): Promise<AnimeMeta | null> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://og-cache.anizoro.invalid/mal/${malId}`);
  const hit = await cache.match(key).catch(() => undefined);
  if (hit) {
    const stored = (await hit.json().catch(() => null)) as AnimeMeta | null;
    if (stored) return stored;
  }
  const meta = (await fromAniList(malId).catch(() => null)) ?? (await fromJikan(malId).catch(() => null));
  if (meta) {
    const put = cache
      .put(
        key,
        new Response(JSON.stringify(meta), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${KEEP_SECONDS}` },
        })
      )
      .catch(() => undefined);
    if (waitUntil) waitUntil(put);
  }
  return meta;
}

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One-line facts: "★ 8.6 · TV · 2023 · 24 eps · Action, Fantasy, Adventure" */
function factsLine(m: AnimeMeta): string {
  const bits: string[] = [];
  if (m.score) bits.push(`★ ${m.score.toFixed(1)}`);
  if (m.format) bits.push(m.format);
  if (m.year) bits.push(String(m.year));
  if (m.episodes) bits.push(`${m.episodes} ${m.episodes === 1 ? 'ep' : 'eps'}`);
  if (m.status && m.status !== 'Completed') bits.push(m.status);
  if (m.genres.length) bits.push(m.genres.slice(0, 3).join(', '));
  return bits.join(' · ');
}

export const onRequest = async (context: {
  request: Request;
  next: () => Promise<Response>;
  waitUntil?: (p: Promise<unknown>) => void;
}): Promise<Response> => {
  const { request } = context;
  const original = await context.next();

  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') return original;
    if (!(original.headers.get('content-type') || '').includes('text/html')) return original;

    const url = new URL(request.url);
    const [, slug, seasonRaw, episodeRaw] = url.pathname.split('/').filter(Boolean); // anime / <slug> / s1 / 3
    if (!slug) return original; // /anime (browse page): keep the default site card

    const parsed = parseAnimeSlug(slug);
    if (!parsed) return original;

    const meta = await loadMeta(parsed.malId, context.waitUntil ? (p) => context.waitUntil!(p) : undefined);
    if (!meta) return original;

    const episode = episodeRaw && /^\d+$/.test(episodeRaw) ? parseInt(episodeRaw, 10) : null;
    const season = seasonRaw && /^s\d+$/i.test(seasonRaw) ? parseInt(seasonRaw.slice(1), 10) : null;

    const canonical = url.origin + url.pathname.replace(/\/+$/, '');
    const facts = factsLine(meta);
    const synopsis = truncate(meta.description, 170);

    const title = episode
      ? `${meta.title} Episode ${episode} - Watch Online Free | ${SITE}`
      : `${meta.title} - Watch Online Free in HD | ${SITE}`;
    const shortTitle = episode ? `${meta.title} · Episode ${episode}` : meta.title;
    const description = episode
      ? `Watch ${meta.title}${season && season > 1 ? ` Season ${season}` : ''} Episode ${episode} free in HD, sub & dub, on ${SITE}.${facts ? ` ${facts}.` : ''}`
      : `${facts ? `${facts}. ` : ''}${synopsis || `Watch ${meta.title} free in HD, sub & dub, on ${SITE}.`}`;
    const alt = `${meta.title} poster`;
    // Large card on X needs a wide image: the banner when AniList has one, else the poster as a small square card.
    const twitterImage = meta.banner || meta.cover;
    const twitterCard = meta.banner ? 'summary_large_image' : 'summary';

    const jsonLd = JSON.stringify(
      episode
        ? {
            '@context': 'https://schema.org',
            '@type': 'TVEpisode',
            name: `${meta.title} Episode ${episode}`,
            episodeNumber: episode,
            image: meta.cover,
            url: canonical,
            partOfSeries: { '@type': 'TVSeries', name: meta.title },
          }
        : {
            '@context': 'https://schema.org',
            '@type': 'TVSeries',
            name: meta.title,
            image: meta.cover,
            url: canonical,
            description: synopsis || undefined,
            genre: meta.genres.length ? meta.genres : undefined,
            numberOfEpisodes: meta.episodes || undefined,
          }
    ).replace(/</g, '\\u003c');

    const setContent = (value: string) => ({
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', value);
      },
    });
    const drop = { element: (el: { remove(): void }) => el.remove() };

    const rewritten = new HTMLRewriter()
      .on('title', { element: (el: { setInnerContent(t: string): void }) => el.setInnerContent(title) })
      .on('meta[name="description"]', setContent(description))
      .on('meta[property="og:title"]', setContent(shortTitle))
      .on('meta[property="og:description"]', setContent(description))
      .on('meta[property="og:url"]', setContent(canonical))
      .on('meta[property="og:image"]', setContent(meta.cover))
      .on('meta[property="og:image:alt"]', setContent(alt))
      // the site-wide card is 1200x630 PNG; the poster is neither, so let each app measure the real image
      .on('meta[property="og:image:width"]', drop)
      .on('meta[property="og:image:height"]', drop)
      .on('meta[property="og:image:type"]', drop)
      .on('meta[name="twitter:card"]', setContent(twitterCard))
      .on('meta[name="twitter:title"]', setContent(shortTitle))
      .on('meta[name="twitter:description"]', setContent(description))
      .on('meta[name="twitter:image"]', setContent(twitterImage))
      // Discord paints its embed stripe with this colour: use the poster's own
      .on('meta[name="theme-color"]', setContent(meta.color || '#0c0d0c'))
      .on('head', {
        element(el: { append(html: string, opts: { html: boolean }): void }) {
          el.append(
            `<link rel="canonical" href="${escAttr(canonical)}" />` +
              `<meta property="og:image:secure_url" content="${escAttr(meta.cover)}" />` +
              `<meta name="twitter:image:alt" content="${escAttr(alt)}" />` +
              `<script type="application/ld+json">${jsonLd}</script>`,
            { html: true }
          );
        },
      })
      .transform(original);

    const headers = new Headers(rewritten.headers);
    headers.set('Cache-Control', 'public, max-age=0, s-maxage=600, must-revalidate');
    headers.set('x-og-meta', 'anime');
    return new Response(rewritten.body, { status: rewritten.status, headers });
  } catch {
    return original;
  }
};
