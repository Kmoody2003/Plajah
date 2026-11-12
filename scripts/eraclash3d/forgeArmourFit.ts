/**
 * forgeArmourFit.ts — fits the armour's shape to the turnaround by search, not by eye.
 *
 *   npx tsx scripts/eraclash3d/forgeArmourFit.ts [rounds=2]
 *
 * Coordinate descent over the wardrobe's ArmourFit (dō, kusazuri, sode): each parameter is stepped up and down, Haru is
 * rebuilt (the body comes from the cache, so a build is seconds), posed like the art with his springs settled, and
 * scored on the torso and legs from the front, side and back (forgeFidelity.ts --fast). A step stays only if the score
 * rises; steps halve each round. The best fit is written to scripts/eraclash3d/data/haru_armour_fit.json, which the
 * build reads.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ARMOUR_FIT_DEFAULT, type ArmourFit } from '../../services/argilla/creature/wardrobe';

const FILE = 'scripts/eraclash3d/data/haru_armour_fit.json';
const rounds = Number(process.argv[2] ?? 2);
const STEP: Record<keyof ArmourFit, [number, number, number]> = { // step, min, max
  doBottom: [0.02, 0.95, 1.1], doTop: [0.02, 1.3, 1.42], doClear: [0.01, 0.015, 0.06],
  kusaLameH: [0.006, 0.04, 0.08], kusaFlare: [0.004, 0, 0.025], kusaClear: [0.006, 0, 0.04],
  sodeX: [0.02, 0.17, 0.3], sodeY: [0.02, 1.42, 1.54], sodeZ: [0.02, -0.06, 0.05], sodeOut: [6, -5, 35],
  sodeLameH: [0.005, 0.03, 0.06], sodeW: [0.03, 0.16, 0.32], sodeR: [0.008, 0.01, 0.05],
  hakLat: [0.015, 0.04, 0.16], hakFB: [0.015, 0.05, 0.18], sayaDown: [4, 20, 65], sayaOut: [5, 0, 50],
};
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (args: string[]) => execFileSync(npx, ['tsx', ...args], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'inherit'] });
/**
 * Half the whole figure's shape (torso double: the dō and the sode live there; legs for the kusazuri's hem), half how
 * well each armour part overlaps the art's own (forgeFidelity --parts cut them with SAM): so each part is pulled toward
 * its counterpart, and a part grown over its neighbours no longer wins on the silhouette alone.
 */
const SCORED = ['do', 'kusazuri', 'sode', 'obi', 'hakama', 'shins', 'sword'];
/** Windows can hold the file a moment (indexer, antivirus): try again rather than lose a long search. */
function writeFit(fit: ArmourFit) {
  for (let k = 0; ; k++) {
    try { fs.writeFileSync(FILE, JSON.stringify(fit, null, 2)); return; } catch (e) { if (k >= 20) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250); }
  }
}
function evaluate(fit: ArmourFit): number {
  writeFit(fit);
  run(['scripts/eraclash3d/forgeHaru.ts']);
  const out = JSON.parse(run(['scripts/eraclash3d/forgeFidelity.ts', '--fast']).trim().split('\n').pop()!);
  let s = 0, w = 0, ps = 0, pw = 0;
  for (const v of ['front', 'side', 'back']) {
    s += out[v].torso.shape * 2 + out[v].legs.shape; w += 3;
    for (const p of SCORED) if (out[v].parts?.[p] !== undefined) { ps += out[v].parts[p]; pw++; }
  }
  return pw ? 0.5 * (s / w) + 0.5 * (ps / pw) : s / w;
}

let fit: ArmourFit = { ...ARMOUR_FIT_DEFAULT, ...(fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {}) };
let best = evaluate(fit);
console.log(`start ${(best * 100).toFixed(2)}%`);
const t0 = Date.now();
for (let r = 0; r < rounds; r++) {
  for (const k of Object.keys(STEP) as (keyof ArmourFit)[]) {
    const [step0, lo, hi] = STEP[k];
    const step = step0 / 2 ** r;
    for (const dir of [1, -1]) {
      let moved = false;
      for (let tries = 0; tries < 4; tries++) {
        const v = Math.max(lo, Math.min(hi, fit[k] + dir * step));
        if (v === fit[k]) break;
        const cand = { ...fit, [k]: +v.toFixed(4) };
        const s = evaluate(cand);
        if (s > best + 0.0005) { best = s; fit = cand; moved = true; console.log(`  ${k} -> ${cand[k]}  ${(best * 100).toFixed(2)}%`); }
        else break;
      }
      if (moved) break; // went up: no need to try down
    }
  }
  console.log(`round ${r + 1}: ${(best * 100).toFixed(2)}% (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}
writeFit(fit);
run(['scripts/eraclash3d/forgeHaru.ts']); // the GLB on disk is the best fit
console.log(`best ${(best * 100).toFixed(2)}%: ${JSON.stringify(fit)}`);
