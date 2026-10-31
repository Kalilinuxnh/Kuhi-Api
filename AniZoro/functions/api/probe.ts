// Cloudflare Pages Function: server-side check of a streaming embed URL (same behaviour as api/probe.ts).
// Browsers cannot read the HTTP status of a cross-origin iframe, so this reports it (e.g. 404 for an episode
// the server does not have). Only known player hosts are allowed.
const ALLOWED_HOSTS = ['megaplay.buzz'];

const reply = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
  try {
    const params = new URL(request.url).searchParams;
    const target = new URL(params.get('url') || '');
    const allowed =
      target.protocol === 'https:' && ALLOWED_HOSTS.some((h) => target.hostname === h || target.hostname.endsWith('.' + h));
    if (!allowed) return reply(400, { error: 'host not allowed' });

    const origin = params.get('origin') || '';
    const headers: Record<string, string> = {
      'user-agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
    };
    if (/^https:\/\/[\w.-]+$/.test(origin)) {
      headers.referer = origin + '/';
      headers.origin = origin;
    }

    const upstream = await fetch(target.toString(), { redirect: 'follow', headers, signal: AbortSignal.timeout(8000) });

    let looksEmpty = false;
    const type = upstream.headers.get('content-type') || '';
    if (upstream.status === 200 && type.includes('text/html')) {
      const text = await upstream.text();
      looksEmpty = text.length < 4000 && /(\b404\b|not found|no (video|source|stream)s?\s+(available|found)|unavailable)/i.test(text);
    }
    return reply(200, { status: upstream.status, looksEmpty }, { 'Cache-Control': 'public, max-age=30' });
  } catch {
    return reply(200, { status: 0, looksEmpty: false });
  }
};
