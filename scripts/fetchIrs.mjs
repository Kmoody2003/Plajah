// fetchIrs — populate/expand the convolution-reverb IR library from vetted, redistributable sources.
//
// The repo already ships a curated AKRT seed (CC BY 4.0) under public/irs/akrt. This script can pull the
// FULL AKRT packs so you can widen the manifest (services/melos/beats/fx/irLibrary.ts). Only sources that
// are cleared for commercial redistribution with credit live here — see docs/fabula/IR_LIBRARY_SOURCES.md.
//
//   node scripts/fetchIrs.mjs            # verify seed + (re)write public/irs/ATTRIBUTIONS.md
//   node scripts/fetchIrs.mjs --fetch    # also download + extract the full AKRT packs into public/irs/akrt-full
//
// Extraction shells out to `unzip` (present in git-bash / WSL / macOS / Linux). On bare Windows PowerShell,
// use Expand-Archive on the downloaded .zip files in public/irs/_zips instead.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const IRS = path.join(ROOT, 'public', 'irs');

// AKRT — CC BY 4.0, uniform. The complete pack list (springs, rooms, speaker cabs).
const AKRT_ZIPS = [
  'http://www.adventurekid.se/AKRTfiles/AKIR/AKIR_DualSpringer.zip',
  'http://www.adventurekid.se/AKRTfiles/AKIR/AKIR_Springer.zip',
  'http://www.adventurekid.se/AKRTfiles/AKIR/AKIR_UniSpringer.zip',
  'http://www.adventurekid.se/AKRTfiles/AKIR/AKIR_SmSpringer.zip',
  'http://www.adventurekid.se/AKRTfiles/AKIR/AKIR_BrokSpringer.zip',
  'http://www.adventurekid.se/AKRTfiles/AKIR/AKIR_WierdSpringer.zip',
  'http://www.adventurekid.se/wp-content/uploads/AK-SROOMS.zip',
  'http://www.adventurekid.se/wp-content/uploads/AK-SPKRS.zip',
];

const ATTRIBUTION = `# Impulse Response Attributions

The convolution reverbs (Spaces, Cosmos) can load the recorded impulse responses in this folder.
Every IR bundled here is cleared for **commercial redistribution with credit**. See
docs/fabula/IR_LIBRARY_SOURCES.md for the full licensing research.

## Bundled (in \`akrt/\`)

**Adventure Kid Reverb Tools (AKRT)** — Kristoffer Ekstrand, https://www.adventurekid.se/akrt/free-reverb-impulse-responses/
Licensed **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/).

Required credit:

> Reverb impulse responses: Adventure Kid Reverb Tools (AKRT) by Kristoffer Ekstrand — adventurekid.se — CC BY 4.0

## Bundled (in \`openair/\`)

**OpenAIR** — openairlib.net, Audiolab, University of York. Each room individually verified **CC BY 4.0**
(see docs/fabula/OPENAIR_CCBY_PICKS.md).

Required credit:

> Impulse responses from OpenAIR (openairlib.net), University of York — CC BY 4.0. Rooms: York Minster,
> Lady Chapel St Albans, Maes Howe, R1 Nuclear Reactor Hall, Hamilton Mausoleum, Tyndall Bruce Monument
> (Damian T. Murphy et al.); Elveden Hall (Matt Rogalsky).
`;

function writeAttribution() {
  fs.mkdirSync(IRS, { recursive: true });
  fs.writeFileSync(path.join(IRS, 'ATTRIBUTIONS.md'), ATTRIBUTION);
  console.log('wrote public/irs/ATTRIBUTIONS.md');
}

function verifySeed() {
  const seed = path.join(IRS, 'akrt');
  if (!fs.existsSync(seed)) { console.log('! seed missing: public/irs/akrt (run with --fetch, or restore from git)'); return; }
  const wavs = fs.readdirSync(seed).filter((f) => f.endsWith('.wav'));
  console.log(`seed OK: ${wavs.length} IR files in public/irs/akrt`);
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function fetchFull() {
  const zips = path.join(IRS, '_zips');
  const out = path.join(IRS, 'akrt-full');
  fs.mkdirSync(zips, { recursive: true });
  fs.mkdirSync(out, { recursive: true });
  for (const url of AKRT_ZIPS) {
    const name = path.basename(new URL(url).pathname);
    const zip = path.join(zips, name);
    process.stdout.write(`↓ ${name} … `);
    const bytes = await download(url, zip);
    console.log(`${(bytes / 1024 / 1024).toFixed(1)} MB`);
    try {
      execFileSync('unzip', ['-o', '-j', zip, '-d', out], { stdio: 'ignore' });
    } catch {
      console.log(`  (could not run \`unzip\` — extract ${zip} manually into ${out})`);
    }
  }
  const wavs = fs.readdirSync(out).filter((f) => f.toLowerCase().endsWith('.wav'));
  console.log(`\nfull AKRT set extracted: ${wavs.length} WAV files in public/irs/akrt-full`);
  console.log('Curate the ones you want into public/irs/akrt and add entries to irLibrary.ts (IR_LIBRARY).');
}

const doFetch = process.argv.includes('--fetch');
writeAttribution();
verifySeed();
if (doFetch) await fetchFull();
else console.log('(run with --fetch to download the full AKRT packs for expansion)');
