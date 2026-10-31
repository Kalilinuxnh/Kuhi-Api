// Server-side check of a streaming embed URL. Browsers cannot read the HTTP status of a cross-origin iframe,
// so this reports it (e.g. 404 for an episode the server does not have). Only known player hosts are allowed.
const ALLOWED_HOSTS = ['megaplay.buzz'];

export default async function handler(req: any, res: any) {
  try {
    const raw = String(req.query?.url || '');
    const target = new URL(raw);
    const allowed =
      target.protocol === 'https:' &&
      ALLOWED_HOSTS.some((h) => target.hostname === h || target.hostname.endsWith('.' + h));
    if (!allowed) {
      res.status(400).json({ error: 'host not allowed' });
      return;
    }

    const origin = String(req.query?.origin || '');
    const headers: Record<string, string> = {
      'user-agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
    };
    if (/^https:\/\/[\w.-]+$/.test(origin)) {
      headers.referer = origin + '/';
      headers.origin = origin;
    }

    const upstream = await fetch(target.toString(), {
      redirect: 'follow',
      headers,
      signal: AbortSignal.timeout(8000),
    });

    let looksEmpty = false;
    const type = upstream.headers.get('content-type') || '';
    if (upstream.status === 200 && type.includes('text/html')) {
      const text = await upstream.text();
      // a tiny page that talks about "not found" is an error page, not a player
      looksEmpty = text.length < 4000 && /(\b404\b|not found|no (video|source|stream)s?\s+(available|found)|unavailable)/i.test(text);
    }

    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).json({ status: upstream.status, looksEmpty });
  } catch {
    res.status(200).json({ status: 0, looksEmpty: false });
  }
}
