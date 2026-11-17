// Print a rail line's ground / rail height profile:  node node_modules/tsx/dist/cli.mjs games/forth-horizon/tools/rail_profile_dump.ts <name fragment> [step m]
import fs from 'node:fs';
import path from 'node:path';
import { featuresToSim } from '../src/sim/data';
import { railProfile } from '../src/sim/railProfile';

const REG = path.resolve(import.meta.dirname, '../../../public/games/forth-horizon/region');
const meta = JSON.parse(fs.readFileSync(path.join(REG, 'region.json'), 'utf8')), W = meta.width, H = meta.height, MPP = meta.mpp;
const buf = fs.readFileSync(path.join(REG, 'height.f32'));
const raw = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const hAt = (x: number, z: number): number => {
  const fx = Math.max(0, Math.min(W - 1.001, x / MPP + W / 2)), fz = Math.max(0, Math.min(H - 1.001, z / MPP + H / 2)), ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  return (raw[iz * W + ix] * (1 - tx) + raw[iz * W + ix + 1] * tx) * (1 - tz) + (raw[(iz + 1) * W + ix] * (1 - tx) + raw[(iz + 1) * W + ix + 1] * tx) * tz;
};
const data = featuresToSim(JSON.parse(fs.readFileSync(path.join(REG, 'user_map.json'), 'utf8')));
const frag = process.argv[2] ?? 'main', step = Number(process.argv[3] ?? 250);
const line = data.rails.find((r) => (r.name ?? r.id).toLowerCase().includes(frag) || r.id.includes(frag))!;
const P = railProfile(line.pts, hAt);
console.log(line.id, 'len', P.len);
for (let i = 0; i < P.pts.length; i += Math.round(step / 10)) console.log(String(i * 10).padStart(6), `x ${Math.round(P.pts[i][0])} z ${Math.round(P.pts[i][1])}`.padEnd(20), 'ground', P.g[i].toFixed(1).padStart(6), 'rail', P.y[i].toFixed(1).padStart(6), P.mode[i]);
