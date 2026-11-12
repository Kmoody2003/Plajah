// Training motion for the Plajah pose lifter: a varied subset of the CMU Motion Capture Library (FBX conversion,
// gbionics/cmu-fbx on Hugging Face). Licence: "You may include this data in commercially-sold products, but you may
// not resell this data directly, even in converted form." Credit: "Data from mocap.cs.cmu.edu (funded by NSF
// EIA-0196217)". Kenne approved this download 2026-11-11.
//
// Picks ~420 clips balanced across kinds of motion, a few per performer per kind (many bodies and styles), and
// leaves out every performer the ground-truth benchmark tests on (subjects 02, 13, 111, 135, 143) so the benchmark
// stays an honest test. Files go to D:/Plajah Models/mocap/cmu-fbx (outside the repo and the website).
//   node scripts/mocap/fetchCmuTraining.mjs            (resumable: skips files already there)
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = 'D:/Plajah Models/mocap/cmu-fbx';
const OUT = path.join(ROOT, 'animations');
const BASE = 'https://huggingface.co/datasets/gbionics/cmu-fbx/resolve/main/';
const HOLD_OUT = new Set(['02', '13', '111', '135', '143']);
const PER_SUBJECT = 4;

// kind → [quota, matcher on the description]
const KINDS = {
  walk: [55, /\bwalk/],
  run: [40, /\b(run|jog|sprint)/],
  jump: [40, /\b(jump|hop|leap)/],
  dance: [45, /\b(dance|salsa|waltz|charleston|swing dance|ballet|arabesque|lambada|indian dance|cartwheel)/],
  fight: [40, /\b(punch|kick|box|fight|martial|karate|kung|tai chi|sword|block|strike)/],
  sport: [35, /\b(basketball|dribble|soccer|golf|baseball|bat|swing|throw|catch|tennis|football|frisbee|bowl)/],
  floor: [35, /\b(sit|stand up|get up|lie|lying|crouch|kneel|crawl|roll|squat|floor)/],
  climb: [25, /\b(climb|stairs|step|ladder|ramp|uneven)/],
  carry: [30, /\b(carry|pick up|lift|reach|push|pull|suitcase|box|object|stool|drink|teapot)/],
  gesture: [35, /\b(arms|gesture|wave|signal|stretch|balance|pose|point|clap|mime|story|nursery)/],
  move: [25, /\b(turn|sideways|backward|sidestep|veer|zigzag|navigate|march|duck)/],
  animal: [15, /\b(chicken|monkey|dog|cat|elephant|bear|bird|frog|animal|dinosaur)/],
};

await fs.mkdir(OUT, { recursive: true });
const csv = await fs.readFile(path.join(ROOT, 'metadata.csv'), 'utf8');
const rows = csv.split(/\r?\n/).slice(1).filter(Boolean).map((line) => {
  const m = line.match(/^([^,]+),(?:"(.*)"|(.*))$/);
  return m ? { file: m[1], desc: (m[2] ?? m[3] ?? '').toLowerCase() } : null;
}).filter(Boolean);

const picked = new Map(); // file → kind
const perSubjectKind = new Map();
for (const [kind, [quota, re]] of Object.entries(KINDS)) {
  let n = 0;
  // Interleave subjects so one prolific performer can't fill a kind.
  const cands = rows.filter((r) => re.test(r.desc) && !picked.has(r.file) && !HOLD_OUT.has(r.file.split('_')[0]));
  const bySubject = new Map();
  for (const r of cands) { const s = r.file.split('_')[0]; if (!bySubject.has(s)) bySubject.set(s, []); bySubject.get(s).push(r); }
  const queues = [...bySubject.values()];
  for (let round = 0; n < quota && round < PER_SUBJECT; round++) {
    for (const q of queues) {
      if (n >= quota) break;
      const r = q[round]; if (!r) continue;
      const key = `${r.file.split('_')[0]}:${kind}`;
      if ((perSubjectKind.get(key) ?? 0) >= PER_SUBJECT) continue;
      picked.set(r.file, { kind, desc: r.desc }); perSubjectKind.set(key, (perSubjectKind.get(key) ?? 0) + 1); n++;
    }
  }
}

let ok = 0, bytes = 0, skipped = 0; const failed = [];
const list = [...picked.entries()];
for (const [i, [file]] of list.entries()) {
  const dst = path.join(OUT, file);
  try { await fs.access(dst); skipped++; ok++; continue; } catch { /* fetch */ }
  try {
    const r = await fetch(`${BASE}animations/${file}`, { headers: { 'User-Agent': 'plajah-mocap-training' }, redirect: 'follow' });
    if (!r.ok) { failed.push(`${file} (${r.status})`); continue; }
    const b = Buffer.from(await r.arrayBuffer());
    await fs.writeFile(dst, b); bytes += b.length; ok++;
  } catch (e) { failed.push(`${file} (${e.message})`); }
  if ((i + 1) % 25 === 0) console.log(`${i + 1}/${list.length} · ${(bytes / 1e6).toFixed(0)} MB`);
}

// Only clips that actually arrived go in the manifest (the training generator walks it).
const have = [];
for (const e of list) { try { await fs.access(path.join(OUT, e[0])); have.push(e); } catch { /* missing upstream */ } }
const missing = list.filter((e) => !have.includes(e)).map(([f]) => f.replace('.fbx', ''));
list.length = 0; list.push(...have);
const byKind = {};
for (const [, v] of list) byKind[v.kind] = (byKind[v.kind] ?? 0) + 1;
await fs.writeFile(path.join(ROOT, 'manifest.json'), JSON.stringify({
  source: 'gbionics/cmu-fbx (CMU Graphics Lab Motion Capture Database)',
  licence: 'You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form.',
  credit: 'Data from mocap.cs.cmu.edu (funded by NSF EIA-0196217)',
  heldOutSubjects: [...HOLD_OUT], perSubjectPerKind: PER_SUBJECT, byKind, missing,
  clips: Object.fromEntries(list.map(([f, v]) => [f.replace('.fbx', ''), v])),
}, null, 1));
await fs.writeFile(path.join(ROOT, 'CREDITS.md'), `# CMU motion capture (training data)\n\nData from mocap.cs.cmu.edu (funded by NSF EIA-0196217). FBX conversion: RancidMilk via cgspeed BVH, distributed as the gbionics/cmu-fbx dataset.\n\nLicence: "You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form." Plajah uses it to train its pose lifter; the clips themselves must not be sold or offered as a motion pack.\n`);
console.log(`done: ${ok}/${list.length} clips (${skipped} already there), ${(bytes / 1e6).toFixed(1)} MB fetched${failed.length ? `; failed ${failed.length}: ${failed.slice(0, 10).join(', ')}` : ''}`);
console.log(JSON.stringify(byKind));
