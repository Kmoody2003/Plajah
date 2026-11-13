/**
 * forgeArmourFit.ts — fits the kit's shape to the turnaround by search, not by eye.
 *
 *   FORGE_SPEC=… npx tsx scripts/eraclash3d/forgeArmourFit.ts [rounds=3] [--workers N] [--body]
 *
 * --body searches the body instead (forge fit-body): its build, musculature and weight, the sliders the anatomy grows
 * the skeleton, muscle and fat from, into body_fit.json. Each candidate grows a new body (no cache), so it is slower.
 *
 * A parallel pattern search over the wardrobe's ArmourFit (dō, watagami, eri, kusazuri, sode, hakama, scabbard):
 * - every parameter is stepped up and down from the current fit, and all those candidates are built and scored at once,
 *   N at a time (each in its own files: the body comes from the cache, so a build is seconds, and no kit is written);
 * - the moves that raised the score are then combined, best first, and the best combination is kept: one round moves
 *   every parameter that wants to move, not one at a time;
 * - a round that finds nothing halves the steps.
 * The score is half the figure's shape (head, torso double, legs: forgeFidelity.ts --fast) and half how well each kit
 * part overlaps the art's own part (cut by SAM in the parts stage), so each piece is pulled toward its counterpart.
 * The best fit goes to the character's armour_fit.json, which the build reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { ARMOUR_FIT_DEFAULT, FIT_STEPS, fitParamsOf, kitPieces, type ArmourFit } from '../../services/argilla/creature/wardrobe';
import { dataFile, WORK_DIR, spec } from './forgeSpec';

const args = process.argv.slice(2);
const BODY = args.includes('--body');
const FILE = dataFile(BODY ? 'body_fit.json' : 'armour_fit.json');
const rounds = Number(args.find((a) => /^\d+$/.test(a)) ?? 3);
const WORKERS = Number(args.includes('--workers') ? args[args.indexOf('--workers') + 1] : process.env.FORGE_WORKERS ?? Math.max(1, Math.min(4, Math.floor(os.totalmem() / 2 ** 30 / 7))));
// the parameters of the pieces this character wears (wardrobe.ts PIECES), each with its step, minimum and maximum
// (the body: shoulder breadth, muscle, fat; height is the spec's, the art's scale is set by it)
const BODY_STEPS: Record<string, [number, number, number]> = { build: [0.04, 0.85, 1.25], musculature: [0.08, 0, 1], weight: [0.08, 0, 0.8] };
const STEP = (BODY ? BODY_STEPS : Object.fromEntries(fitParamsOf(kitPieces(spec.kit)).map((k) => [k, FIT_STEPS[k]!]))) as Partial<Record<keyof ArmourFit, [number, number, number]>>;
const SCORED = ['do', 'kusazuri', 'sode', 'obi', 'hakama', 'shins', 'sword', 'arms'];
const slotDir = path.join(WORK_DIR, 'armour_search');
fs.mkdirSync(slotDir, { recursive: true });

function run(argv: string[], env: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    // node itself with tsx's loader: no shell (four npx.cmd shells at once fail to start on Windows, and a shell splits
    // an argument with a space, like the runtime folder's)
    const p = spawn(process.execPath, ['--import', 'tsx', ...argv], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${argv[0]} exited ${code}: ${err.slice(-800)}`))));
  });
}
/** Windows can hold a file a moment (indexer, antivirus): try again rather than lose a long search. */
function writeJson(file: string, v: unknown) {
  for (let k = 0; ; k++) {
    try { fs.writeFileSync(file, JSON.stringify(v, null, 2)); return; } catch (e) { if (k >= 20) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250); }
  }
}
/** Build and score one candidate in its own slot's files. */
async function evaluate(fit: ArmourFit, slot: number): Promise<number> {
  const fitFile = path.join(slotDir, `fit_${slot}.json`), glb = path.join(slotDir, `fit_${slot}.glb`);
  writeJson(fitFile, fit);
  await run(['scripts/eraclash3d/forgeBuild.ts'], { FORGE_KIT: '0', [BODY ? 'FORGE_BODY_FIT' : 'FORGE_ARMOUR_FIT']: fitFile, FORGE_OUT: glb });
  const out = JSON.parse((await run(['scripts/eraclash3d/forgeFidelity.ts', glb, '--fast'], {})).trim().split('\n').pop()!);
  let s = 0, w = 0, ps = 0, pw = 0;
  for (const v of ['front', 'side', 'back']) {
    // (the head's shape too: the collar stands up into it, round the neck)
    s += out[v].torso.shape * 2 + out[v].legs.shape + (out[v].head?.shape ?? 0); w += out[v].head ? 4 : 3;
    for (const p of SCORED) if (out[v].parts?.[p] !== undefined) { ps += out[v].parts[p]; pw++; }
  }
  return pw ? 0.5 * (s / w) + 0.5 * (ps / pw) : s / w;
}
/** Score many candidates, WORKERS at a time. */
async function evaluateAll(fits: ArmourFit[]): Promise<number[]> {
  const res = new Array<number>(fits.length).fill(-1);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(WORKERS, fits.length) }, async (_, slot) => {
    while (next < fits.length) {
      const i = next++;
      try { res[i] = await evaluate(fits[i], slot); } catch (e) { console.log(`  candidate ${i} failed: ${(e as Error).message.split('\n')[0]}`); }
    }
  }));
  return res;
}

const t0 = Date.now();
const mins = () => ((Date.now() - t0) / 60000).toFixed(1);
let fit: ArmourFit = BODY
  ? { ...{ build: spec.body.build, musculature: spec.body.musculature, weight: spec.body.weight }, ...(fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {}) } as unknown as ArmourFit
  : { ...ARMOUR_FIT_DEFAULT, ...(fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {}) };
let [best] = await evaluateAll([fit]);
if (best < 0) throw new Error('the starting fit could not be built and scored (see the failure above)');
console.log(`start ${(best * 100).toFixed(2)}% (${WORKERS} workers, ${Object.keys(STEP).length} parameters)`);
const scale: Partial<Record<keyof ArmourFit, number>> = {};
for (let r = 0; r < rounds; r++) {
  // every parameter, a step each way
  const moves: { k: keyof ArmourFit; v: number }[] = [];
  for (const k of Object.keys(STEP) as (keyof ArmourFit)[]) {
    const [step0, lo, hi] = STEP[k]!, step = step0 * (scale[k] ?? 1);
    for (const dir of [1, -1]) { const v = +Math.max(lo, Math.min(hi, fit[k] + dir * step)).toFixed(4); if (v !== fit[k]) moves.push({ k, v }); }
  }
  const scores = await evaluateAll(moves.map((m) => ({ ...fit, [m.k]: m.v })));
  // the improving moves, one per parameter (its better direction), best first
  const gain = new Map<keyof ArmourFit, { v: number; s: number }>();
  moves.forEach((m, i) => { if (scores[i] > best + 0.0003 && scores[i] > (gain.get(m.k)?.s ?? -1)) gain.set(m.k, { v: m.v, s: scores[i] }); });
  const ranked = [...gain.entries()].sort((a, b) => b[1].s - a[1].s);
  // parameters that did not move get finer steps next round
  for (const k of Object.keys(STEP) as (keyof ArmourFit)[]) if (!gain.has(k)) scale[k] = (scale[k] ?? 1) / 2;
  if (!ranked.length) { console.log(`round ${r + 1}: no move helps; steps halved (${mins()} min)`); continue; }
  // combine: the best one, the best two, … (the moves are not independent, so each combination is scored)
  const combos = [1, 2, 3, 5, 8, ranked.length].filter((n, i, a) => n <= ranked.length && a.indexOf(n) === i)
    .map((n) => ({ ...fit, ...Object.fromEntries(ranked.slice(0, n).map(([k, g]) => [k, g.v])) }) as ArmourFit);
  const cs = await evaluateAll(combos.slice(1));
  let pick = combos[0], ps = ranked[0][1].s;
  cs.forEach((s, i) => { if (s > ps) { ps = s; pick = combos[i + 1]; } });
  const moved = (Object.keys(STEP) as (keyof ArmourFit)[]).filter((k) => pick[k] !== fit[k]).map((k) => `${k} ${fit[k]}→${pick[k]}`);
  fit = pick; best = ps;
  writeJson(FILE, fit);
  console.log(`round ${r + 1}: ${(best * 100).toFixed(2)}% (${moved.join(', ')}; ${mins()} min)`);
}
writeJson(FILE, fit);
await run(['scripts/eraclash3d/forgeBuild.ts'], {}); // the character and kit on disk are the best fit's
console.log(`best ${(best * 100).toFixed(2)}%: ${JSON.stringify(fit)} -> ${spec.out.character}`);
