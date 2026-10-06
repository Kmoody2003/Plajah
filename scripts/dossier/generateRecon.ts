/**
 * Generates reconstruction scenes through the Magnific API and registers them.
 *   npx tsx scripts/dossier/generateRecon.ts --only recon-shipyard [--model seedream-v4-5] [--res 2k] [--dry]
 *   npx tsx scripts/dossier/generateRecon.ts --all
 * Every submitted task is appended to docs/dossier/spend-ledger.json. Existing images are skipped
 * unless --force is passed. --dry prints the requests without calling the API.
 */
import fs from 'node:fs';
import path from 'node:path';
import { douglassDossier } from '../../data/dossier/douglass';
import { douglassScenes } from '../../data/dossier/douglassScenes';
import { buildImageRequest } from '../../services/dossier/characterGateway';
import { commonsThumb } from '../../services/dossier/sourceAdapters';
import { magnificProvider, type MagnificModel } from '../../services/dossier/magnificProvider';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const val = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

function readKey(): string {
  const env = fs.readFileSync('.env.local', 'utf8');
  const m = env.match(/^MAGNIFIC_API_KEY=(.*)$/m);
  const k = m?.[1]?.trim().replace(/^["']|["']$/g, '');
  if (!k) throw new Error('MAGNIFIC_API_KEY missing in .env.local');
  return k;
}

const only = val('only');
const model = (val('model') ?? 'flux-2-klein') as MagnificModel;
const resolution = (val('res') ?? '1k') as '1k' | '2k';
const scenes = douglassScenes.filter(s => flag('all') || s.id === only);
if (!scenes.length) throw new Error('Pass --only <scene-id> or --all');

const outDir = path.join('public', 'dossier', 'douglass', 'recon');
const ledgerPath = path.join('docs', 'dossier', 'spend-ledger.json');
fs.mkdirSync(outDir, { recursive: true });
const ledger: any[] = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : [];

(async () => {
  const d = douglassDossier;
  const provider = magnificProvider({
    apiKey: flag('dry') ? 'dry' : readKey(), model, resolution,
    onTask: t => { ledger.push({ at: new Date().toISOString(), scene: current, ...t }); fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2)); },
  });
  let current = '';
  for (const s of scenes) {
    const dest = path.join(outDir, `${s.id}.png`);
    if (fs.existsSync(dest) && !flag('force')) { console.log(`skip ${s.id} (exists)`); continue; }
    const req = buildImageRequest(s.spec, d.characters, d.assets);
    req.referenceUrls = req.referenceUrls.map(u => commonsThumb(u, 960));
    if (val('seed')) req.seed = Number(val('seed'));
    // Seedream cannot take references: only use it for scenes with no visible face.
    if (model === 'seedream-v4-5' && req.referenceUrls.length) throw new Error(`${s.id} has a visible face; use flux-2-klein with references`);
    if (flag('dry')) { console.log(s.id, JSON.stringify({ ...req, prompt: req.prompt.slice(0, 160) + '…' }, null, 1)); continue; }
    current = s.id;
    console.log(`generating ${s.id} with ${provider.name}, ${req.referenceUrls.length} refs…`);
    const out = await provider.generate(req);
    const img = await fetch(out.url);
    if (!img.ok) throw new Error(`download failed ${img.status}`);
    fs.writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
    console.log(`  saved ${dest} (${provider.name}, task ${out.providerRef})`);
  }
  if (!flag('dry')) console.log(`ledger: ${ledger.length} tasks total in ${ledgerPath}`);
})().catch(e => { console.error(String(e.message ?? e)); process.exit(1); });
