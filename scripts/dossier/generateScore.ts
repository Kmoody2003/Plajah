/**
 * Generates an original instrumental score for a dossier via Magnific music generation.
 *   npx tsx scripts/dossier/generateScore.ts --slug douglass --seconds 90 --prompt "…"
 * Saves public/dossier/<slug>/score.<ext> and logs the task to docs/dossier/spend-ledger.json.
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const val = (n: string, d?: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const slug = val('slug', 'douglass')!;
const seconds = Number(val('seconds', '90'));
const prompt = val('prompt')!;
if (!prompt) throw new Error('--prompt required');

const key = fs.readFileSync('.env.local', 'utf8').match(/^MAGNIFIC_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!key) throw new Error('MAGNIFIC_API_KEY missing');
const H = { 'x-magnific-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' };
const BASE = 'https://api.magnific.com/v1/ai/music-generation';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

(async () => {
  const create = await fetch(BASE, { method: 'POST', headers: H, body: JSON.stringify({ prompt, music_length_seconds: seconds }) });
  const created: any = await create.json().catch(() => ({}));
  const id = created?.data?.task_id;
  if (!create.ok || !id) throw new Error(`create failed ${create.status}: ${JSON.stringify(created).slice(0, 400)}`);
  console.log(`task ${id} submitted (${seconds}s)`);

  const ledgerPath = path.join('docs', 'dossier', 'spend-ledger.json');
  const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : [];
  ledger.push({ at: new Date().toISOString(), scene: `score-${slug}`, model: 'music-generation', taskId: id, seconds });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

  const deadline = Date.now() + 8 * 60_000;
  while (Date.now() < deadline) {
    await sleep(5000);
    const r = await fetch(`${BASE}/${id}`, { headers: H });
    const j: any = await r.json().catch(() => ({}));
    const st = j?.data?.status;
    if (st === 'FAILED') throw new Error(`task failed: ${JSON.stringify(j).slice(0, 300)}`);
    if (st === 'COMPLETED') {
      const g = j.data.generated;
      const url: string | undefined = typeof g?.[0] === 'string' ? g[0] : g?.[0]?.url ?? j.data.audio_url ?? j.data.url;
      if (!url) throw new Error(`completed but no url: ${JSON.stringify(j).slice(0, 400)}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download ${res.status}`);
      const ext = (new URL(url).pathname.match(/\.(mp3|wav|m4a|ogg)$/i)?.[1] ?? 'mp3').toLowerCase();
      const dest = path.join('public', 'dossier', slug, `score.${ext}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      console.log(`saved ${dest} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
      return;
    }
    process.stdout.write('.');
  }
  throw new Error('timed out');
})().catch(e => { console.error(String(e.message ?? e)); process.exit(1); });
