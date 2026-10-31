// Shows what the Anivexa API returns for one episode and what the player would extract from it.
//   npx tsx scripts/anivexa-check.ts <anilistId> <episode> [sub|dub] [provider]
// Example: npx tsx scripts/anivexa-check.ts 16498 1 sub
import { ANIVEXA_PROVIDERS, buildWatchUrls, extractMedia } from '../src/lib/anivexa';

const [idArg, epArg, langArg = 'sub', only] = process.argv.slice(2);
const anilistId = Number(idArg);
const episode = Number(epArg || 1);
const lang = langArg === 'dub' ? 'dub' : 'sub';
if (!anilistId) {
  console.log('usage: npx tsx scripts/anivexa-check.ts <anilistId> <episode> [sub|dub] [provider]');
  process.exit(1);
}

const providers = ANIVEXA_PROVIDERS.filter((p) => !only || p.id === only);
await Promise.all(
  providers.map(async (p) => {
    for (const url of buildWatchUrls(p.id, anilistId, lang, episode)) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const text = await res.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          /* plain text */
        }
        const media = extractMedia(body);
        const kinds = media.sources.map((s) => s.kind).join(',') || 'none';
        console.log(`${res.ok ? 'OK ' : 'ERR'} ${res.status} ${p.id.padEnd(11)} sources=${media.sources.length} (${kinds}) subs=${media.subtitles.length}  ${url}`);
        if (only) console.log(JSON.stringify(body, null, 2).slice(0, 3000));
      } catch (e: any) {
        console.log(`ERR --- ${p.id.padEnd(11)} ${e?.name || e}  ${url}`);
      }
    }
  })
);
