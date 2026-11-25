// Run the sim headless on the real map data and print what it makes of it:  node node_modules/tsx/dist/cli.mjs games/apex/tools/sim_report.ts
import fs from 'node:fs';
import path from 'node:path';
import { featuresToSim } from '../src/sim/data';
import { layoutRail } from '../src/sim/rail';
import { layoutAirport } from '../src/sim/airport';
import { carveAirport, carveRail } from '../src/sim/carve';
import { buildRoadGraph } from '../src/sim/network';
import { SimWorld } from '../src/sim/world';

const REG = path.resolve(import.meta.dirname, '../../../public/games/apex/region');
const J = (f: string): any => { try { return JSON.parse(fs.readFileSync(path.join(REG, f), 'utf8')); } catch { return null; } };
const meta = J('region.json'), W = meta.width, H = meta.height, MPP = meta.mpp;
const buf = fs.readFileSync(path.join(REG, 'height.f32'));
const raw = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const heights = raw.slice();
const hAt = (x: number, z: number): number => {
  const fx = Math.max(0, Math.min(W - 1.001, x / MPP + W / 2)), fz = Math.max(0, Math.min(H - 1.001, z / MPP + H / 2)), ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const a = raw[iz * W + ix], b = raw[iz * W + ix + 1], c = raw[(iz + 1) * W + ix], d = raw[(iz + 1) * W + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
};
const um = J('user_map.json');
const data = featuresToSim(um, { country: [J('country_roads.json'), J('user_streets.json'), J('farbank_streets.json')].filter(Boolean), city: J('city_streets.json') ?? [], shoreline: J('shoreline_highway.json') });
let t0 = performance.now();
const graph = buildRoadGraph(data.roads);
console.log('road graph', graph.stats, (performance.now() - t0).toFixed(0) + ' ms');
const net = layoutRail(data.rails, data.stations, hAt, graph);
for (const l of net.lines) {
  const P = l.profile; let cutMax = 0, fillMax = 0;
  for (let i = 0; i < P.pts.length; i++) if (P.mode[i] === 'ground') { cutMax = Math.max(cutMax, P.g[i] - P.y[i]); fillMax = Math.max(fillMax, P.y[i] - P.g[i]); }
  console.log(`rail ${l.name}: ${(P.len / 1000).toFixed(1)} km, ${l.tracks} track(s), stops ${l.stops.map((s) => s.name).join(' > ')}`);
  console.log(`   bridges ${P.bridges.map((b) => `${b.from * 10}-${b.to * 10}m`).join(', ') || 'none'}; tunnels ${P.tunnels.map((b) => `${b.from * 10}-${b.to * 10}m`).join(', ') || 'none'}; max cut ${cutMax.toFixed(1)} m, max fill ${fillMax.toFixed(1)} m; slowest curve ${Math.min(...P.vmax).toFixed(0)} m/s`);
}
console.log('level crossings', net.crossings.filter((c) => c.level).length, 'grade-separated', net.crossings.filter((c) => !c.level).length);
const L = layoutAirport(data.airport, 0);
if (L) {
  const before = heights.slice();
  const lvl = carveAirport(heights, W, H, MPP, L);
  let cutMax = 0, fillMax = 0; for (let i = 0; i < before.length; i++) { const d = heights[i] - before[i]; if (d > fillMax) fillMax = d; if (-d > cutMax) cutMax = -d; }
  console.log(`airport ${L.designator}: ${L.len} m runway, ${L.gates.length} gates, field elevation ${lvl.toFixed(1)} m, max cut ${cutMax.toFixed(1)} m, max fill ${fillMax.toFixed(1)} m, ends ${L.a} ${L.b}`);
}
const touched = carveRail(heights, W, H, MPP, net.lines.map((l) => ({ profile: l.profile, double: l.kind === 'double' })));
console.log('rail carve touched', touched, 'cells');
t0 = performance.now();
const w = new SimWorld({ roads: data.roads, zones: data.zones, services: data.services, rail: net, airport: L, water: (x, z) => hAt(x, z) < 0.8, seed: 5 });
console.log('sim built', (performance.now() - t0).toFixed(0), 'ms; zones:');
for (const z of w.zones.zones) console.log(`   ${z.kind.padEnd(11)} ${Math.round(z.area / 1e4).toString().padStart(6)} ha  level ${z.level.toFixed(2)} pop ${Math.round(z.pop)} jobs ${Math.round(z.jobs)} anchors ${z.anchors.length} roadDist ${Math.round(z.roadDist)} landValue ${z.landValue.toFixed(2)}`);
console.log('demand', w.zones.demand);
w.setFocus(3000, 2500);
t0 = performance.now();
let n = 0;
for (let i = 0; i < 20 * 120; i++) { w.step(0.05); n++; }
const ms = (performance.now() - t0) / n;
console.log(`120 s simulated: ${w.cars.length} cars, ${w.stats.spawned} spawned, ${w.stats.arrived} arrived, ${w.stats.failedRoutes} failed routes, trips`, w.stats.trips, `busy edges ${w.busyEdges()}; ${ms.toFixed(3)} ms per step`);
console.log('trains', w.trains?.trains.map((t) => `${t.kind}@${net.lines[t.line].name}:${Math.round(t.s)}`).join(' '));
console.log('planes', w.air?.planes.map((p) => `${p.type}:${p.state}`).join(' '));
