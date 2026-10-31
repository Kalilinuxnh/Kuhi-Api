// Fallback proxy for the direct player (AniZoro Direct). The player only uses it when a stream cannot be played
// straight from its CDN: the CDN wants a Referer/Origin header a browser cannot send, or it sends no CORS headers.
//
//   /api/proxy?url=<encoded https url>&ref=<optional referer>
//
// HLS playlists are rewritten so every segment / key / sub-playlist also comes back through this endpoint.
// Notes: Vercel functions cap a response at ~4.5 MB, so this suits HLS segments but not whole .mp4 files.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';
const MAX_REDIRECTS = 3;
const MAX_BYTES = 4_400_000;

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return false;
}

async function assertPublicHttps(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== 'https:') throw new Error('https only');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('blocked host');
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('blocked host');
    return u;
  }
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('blocked host');
  return u;
}

function absolutize(ref: string, base: URL): string | null {
  try {
    return new URL(ref, base).toString();
  } catch {
    return null;
  }
}

function toProxy(abs: string, referer: string | null): string {
  const p = new URLSearchParams({ url: abs });
  if (referer) p.set('ref', referer);
  return `/api/proxy?${p.toString()}`;
}

function rewritePlaylist(text: string, base: URL, referer: string | null): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        // URI="..." attributes (keys, init segments, media playlists, subtitles)
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          const abs = absolutize(uri, base);
          return abs ? `URI="${toProxy(abs, referer)}"` : _m;
        });
      }
      const abs = absolutize(t, base);
      return abs ? toProxy(abs, referer) : line;
    })
    .join('\n');
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'range');
  res.setHeader('Access-Control-Expose-Headers', 'content-length, content-range, content-type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    // Only pages of this site may use the proxy (a missing Referer is refused too)
    const pageRef = String(req.headers?.referer || '');
    let sameSite = false;
    try {
      sameSite = new URL(pageRef).host === String(req.headers?.host || '');
    } catch {
      sameSite = false;
    }
    if (!sameSite) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    let target = await assertPublicHttps(String(req.query?.url || ''));
    let referer: string | null = null;
    const rawRef = String(req.query?.ref || '');
    if (rawRef) {
      try {
        const r = new URL(rawRef);
        if (r.protocol === 'https:' || r.protocol === 'http:') referer = r.toString();
      } catch {
        referer = null;
      }
    }

    const headers: Record<string, string> = { 'user-agent': UA, accept: '*/*' };
    const refUrl = referer ? new URL(referer) : null;
    headers.referer = referer || target.origin + '/';
    headers.origin = refUrl ? refUrl.origin : target.origin;
    if (req.headers?.range) headers.range = String(req.headers.range);

    let upstream: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      upstream = await fetch(target.toString(), {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(9000),
      });
      if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get('location')) {
        target = await assertPublicHttps(new URL(upstream.headers.get('location')!, target).toString());
        continue;
      }
      break;
    }
    if (!upstream || (upstream.status >= 300 && upstream.status < 400)) {
      res.status(502).json({ error: 'too many redirects' });
      return;
    }

    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    const isPlaylist = /mpegurl/i.test(type) || /\.m3u8(\?|$)/i.test(target.pathname + target.search);

    if (isPlaylist && upstream.ok) {
      const text = await upstream.text();
      if (text.trimStart().startsWith('#EXTM3U')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 's-maxage=20');
        res.status(200).send(rewritePlaylist(text, target, referer));
        return;
      }
      // not a real playlist (an error page): pass it on as is
      res.status(upstream.status).setHeader('Content-Type', type).send(text);
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      res.status(413).json({ error: 'too large for proxy' });
      return;
    }
    res.setHeader('Content-Type', type);
    const range = upstream.headers.get('content-range');
    if (range) res.setHeader('Content-Range', range);
    res.setHeader('Cache-Control', upstream.ok ? 's-maxage=300' : 'no-store');
    res.status(upstream.status).send(buf);
  } catch (err: any) {
    res.status(502).json({ error: err?.message === 'https only' || err?.message === 'blocked host' ? err.message : 'upstream failed' });
  }
}
