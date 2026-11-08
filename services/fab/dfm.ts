// Design-for-manufacturing checks: the chosen process's rules against the actual part. Thin walls
// are found by shrinking slices by half the minimum wall and seeing which features vanish; overhangs
// from face normals; sharp inside corners and small holes from 2D loops.

import { type Loop, area, offset, regions, perimeter } from './geom2d';
import { type MeshIn, meshBounds, sliceAt } from './slice';
import { type Machine, type Process } from './machines';

export interface DfmFinding { level: 'error' | 'warn' | 'info' | 'pass'; title: string; detail: string }

export function dfm3d(meshes: MeshIn[], proc: Process, machine?: Machine | null): DfmFinding[] {
  const out: DfmFinding[] = []; const r = proc.rules; const b = meshBounds(meshes);
  const size = [0, 1, 2].map(k => b.max[k] - b.min[k]);
  if (machine && machine.bed[0] > 0) {
    const fits = (machine.bed[2] === 0 || size[2] <= machine.bed[2]) && ((size[0] <= machine.bed[0] && size[1] <= machine.bed[1]) || (size[1] <= machine.bed[0] && size[0] <= machine.bed[1]));
    out.push(fits ? { level: 'pass', title: 'Fits the machine', detail: `${size.map(v => v.toFixed(1)).join(' × ')} mm in a ${machine.bed.join(' × ')} mm volume.` } : { level: 'error', title: 'Too big for this machine', detail: `${size.map(v => v.toFixed(1)).join(' × ')} mm does not fit ${machine.bed.join(' × ')} mm. Split the part or choose a larger machine.` });
  }
  // Overhangs (printing only): downward faces steeper than the rule, above the first layer.
  if (r.overhang !== undefined && r.supports !== 'none') {
    let over = 0, total = 0; const lim = Math.cos((90 - r.overhang) * Math.PI / 180);
    for (const m of meshes) { const P = m.positions, I = m.indices; for (let t = 0; t < I.length; t += 3) {
      const a = [P[I[t] * 3], P[I[t] * 3 + 1], P[I[t] * 3 + 2]], bb = [P[I[t + 1] * 3], P[I[t + 1] * 3 + 1], P[I[t + 1] * 3 + 2]], c = [P[I[t + 2] * 3], P[I[t + 2] * 3 + 1], P[I[t + 2] * 3 + 2]];
      const u = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const A = Math.hypot(n[0], n[1], n[2]) / 2; if (!A) continue; total += A;
      const zMin = Math.min(a[2], bb[2], c[2]); if (n[2] / (2 * A) < -lim && zMin > b.min[2] + 0.3) over += A; } }
    const frac = total ? over / total : 0;
    out.push(frac > 0.02 ? { level: r.supports === 'required' ? 'info' : 'warn', title: `${(frac * 100).toFixed(0)}% of the surface overhangs past ${r.overhang}°`, detail: r.supports === 'required' ? 'Supports will be generated there; try reorienting to reduce them.' : 'Those areas need supports or a different orientation; chamfer downward edges at 45° where you can.' } : { level: 'pass', title: 'No steep overhangs', detail: `Nothing past ${r.overhang}° from vertical.` });
  }
  // Thin features: sample slices, shrink by half the minimum wall, see what disappears.
  if (r.minWall) {
    let thin = 0; const N = 16;
    for (let i = 1; i < N; i++) { const z = b.min[2] + (b.max[2] - b.min[2]) * i / N; for (const reg of regions(sliceAt(meshes, z))) if (Math.abs(area(reg.outer)) > 0.01 && !offset(reg.outer, -r.minWall / 2).length) thin++; }
    out.push(thin ? { level: 'warn', title: `Features thinner than ${r.minWall} mm`, detail: `Found in ${thin} sampled cross-section${thin === 1 ? '' : 's'}. ${proc.name} needs walls of at least ${r.minWall} mm.` } : { level: 'pass', title: `Walls at least ${r.minWall} mm`, detail: 'Every sampled cross-section is thick enough.' });
  }
  if (r.shrink) out.push({ level: 'info', title: `Scaled ${((1 / (1 - r.shrink) - 1) * 100).toFixed(1)}% larger for sintering`, detail: `The part shrinks about ${(r.shrink * 100).toFixed(0)}% in the furnace; the export is enlarged so it finishes at your size.` });
  if (r.machiningAllowance) out.push({ level: 'info', title: `${r.machiningAllowance} mm machining stock`, detail: 'Deposited near-net; finish-machine functional faces.' });
  if (proc.input === 'turned') {
    const rad = Math.max(Math.abs(b.max[0]), Math.abs(b.min[0]), Math.abs(b.max[1]), Math.abs(b.min[1])); const off = Math.hypot((b.max[0] + b.min[0]) / 2, (b.max[1] + b.min[1]) / 2);
    out.push(off > rad * 0.02 ? { level: 'error', title: 'Not centred on the turning axis', detail: 'Lathe parts are turned about Z through the origin.' } : { level: 'pass', title: 'Centred on the turning axis', detail: `Ø${(rad * 2).toFixed(2)} mm × ${size[2].toFixed(1)} mm.` });
  }
  r.notes.forEach(n => out.push({ level: 'info', title: n, detail: '' }));
  return out;
}

export function dfm2d(loops: Loop[], proc: Process, o: { thickness?: number; material?: string; tool?: number } = {}): DfmFinding[] {
  const out: DfmFinding[] = []; const r = proc.rules;
  if (/pvc|vinyl/i.test(o.material ?? '') && proc.id.startsWith('laser')) out.push({ level: 'error', title: 'Do not laser-cut PVC or vinyl', detail: 'Cutting it releases chlorine gas: toxic to breathe and it corrodes the machine. Use acrylic, or a vinyl cutter.' });
  if (o.thickness && r.maxThickness && o.thickness > r.maxThickness) out.push({ level: 'error', title: `${o.thickness} mm is past this process (${r.maxThickness} mm max)`, detail: 'Choose a thicker-cutting process such as waterjet or plasma.' });
  // Small holes: closed loops that are holes in a region.
  const holes = regions(loops).flatMap(g => g.holes); const minHole = Math.max(r.minHole ?? 0, proc.id === 'plasma' && o.thickness ? o.thickness * 1.5 : 0);
  const small = holes.filter(h => 4 * Math.abs(area(h)) / perimeter(h) < minHole);
  out.push(small.length ? { level: 'warn', title: `${small.length} hole${small.length === 1 ? '' : 's'} under ${minHole.toFixed(1)} mm`, detail: proc.id === 'plasma' ? 'Plasma holes this small taper badly; mark them and drill.' : `${proc.name} holds holes down to about ${minHole} mm.` } : { level: 'pass', title: 'Holes are large enough', detail: holes.length ? `${holes.length} holes checked.` : 'No holes.' });
  // Sharp inside corners for rotating tools / wire.
  const rad = Math.max(r.minInsideRadius ?? 0, o.tool ? o.tool / 2 : 0);
  if (rad > 0 && ['router', 'mill3', 'mill5', 'wire-edm'].includes(proc.id)) {
    let sharp = 0;
    for (const g of regions(loops)) for (const l of [g.outer, ...g.holes]) for (let i = 0; i < l.length; i++) {
      const a = l[(i + l.length - 1) % l.length], p = l[i], c = l[(i + 1) % l.length]; const turn = (p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0]);
      const ang = Math.acos(Math.max(-1, Math.min(1, ((a[0] - p[0]) * (c[0] - p[0]) + (a[1] - p[1]) * (c[1] - p[1])) / (Math.hypot(a[0] - p[0], a[1] - p[1]) * Math.hypot(c[0] - p[0], c[1] - p[1]) || 1))));
      const concave = (turn < 0) === (area(l) > 0); if (concave && ang < Math.PI * 0.95 && Math.min(Math.hypot(a[0] - p[0], a[1] - p[1]), Math.hypot(c[0] - p[0], c[1] - p[1])) > rad) sharp++;
    }
    out.push(sharp ? { level: 'warn', title: `${sharp} sharp inside corner${sharp === 1 ? '' : 's'}`, detail: `The ${(rad * 2).toFixed(2)} mm tool leaves a ${rad.toFixed(2)} mm radius there. Add dog-bone reliefs if a square part must fit in.` } : { level: 'pass', title: 'Inside corners suit the tool', detail: `Tool radius ${rad.toFixed(2)} mm.` });
  }
  if (r.kerf) out.push({ level: 'info', title: `Kerf ${r.kerf} mm compensated`, detail: 'Outlines are cut outside the line and holes inside, so parts finish at drawn size.' });
  r.notes.forEach(n => out.push({ level: /never|do not|hazard|toxic/i.test(n) ? 'warn' : 'info', title: n, detail: '' }));
  return out;
}
