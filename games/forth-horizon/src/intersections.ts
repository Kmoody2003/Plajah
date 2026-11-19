import * as THREE from 'three';
import { sampleAt } from './sim/geom';
import type { RoadGraph } from './sim/network';
import type { Lamp, SignalSystem } from './sim/signals';

/**
 * What a driver sees at a junction, from the sim's junction control (src/sim/signals.ts), so what is drawn is exactly what the traffic obeys:
 *  - a white stop line across the approach lanes, and a continental crosswalk in front of it where there is one (signals, all-way stops, everywhere downtown);
 *  - signals: a far-side galvanised mast arm over the approach with one three-lamp head per lane, and a second head on the pole, lit from the live phase;
 *  - stop signs on the near right corner, with an ALL WAY plaque at all-way stops.
 * Everything is instanced: about a dozen draws for the whole map. `update` recolours the lamps only when a phase changes.
 */
export interface IntersectionLayer { group: THREE.Group; update: () => void; near: (x: number, z: number, r: number) => boolean }

const LIT: Record<Lamp, number> = { R: 0xff2a14, Y: 0xffb300, G: 0x1dff6a };
const DARK = [0x2b0b08, 0x2b2108, 0x082b14];

function stopTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const oct = (r: number): void => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; g.lineTo(128 + r * Math.cos(a), 128 + r * Math.sin(a)); } g.closePath(); };
  g.fillStyle = '#ffffff'; oct(127); g.fill();
  g.fillStyle = '#c4161c'; oct(116); g.fill();
  g.fillStyle = '#ffffff'; g.font = 'bold 82px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 128, 132);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function plaqueTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c4161c'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#ffffff'; g.fillRect(6, 6, 244, 84); g.fillStyle = '#c4161c'; g.fillRect(12, 12, 232, 72);
  g.fillStyle = '#ffffff'; g.font = 'bold 50px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ALL WAY', 128, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildIntersections(sig: SignalSystem, g: RoadGraph, ground: (x: number, z: number) => number): IntersectionLayer {
  const group = new THREE.Group(); group.name = 'intersections';
  const m4 = new THREE.Matrix4(), frame = new THREE.Matrix4(), local = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), sc = new THREE.Vector3();
  const lists: Record<string, THREE.Matrix4[]> = { line: [], zebra: [], pole: [], arm: [], head: [], lamp: [], post: [], sign: [], plaque: [] };
  const lampRef: { j: number; a: number; k: number }[] = [];
  const poles: number[] = [];
  /** a world matrix at (x, z) on the ground, facing back toward a driver heading (dx, dz), with local +x to that driver's right */
  const at = (x: number, z: number, dx: number, dz: number, y?: number): THREE.Matrix4 => {
    q.setFromAxisAngle(up, Math.atan2(-dx, -dz));
    return frame.compose(v.set(x, y ?? ground(x, z), z), q, one).clone();
  };
  const put = (list: THREE.Matrix4[], F: THREE.Matrix4, lx: number, ly: number, lz: number, sx = 1, sy = 1, sz = 1, groundEach?: boolean): void => {
    local.compose(v.set(lx, ly, lz), new THREE.Quaternion(), sc.set(sx, sy, sz));
    m4.multiplyMatrices(F, local);
    if (groundEach) { const e = m4.elements; e[13] = ground(e[12], e[14]) + ly; }
    list.push(m4.clone());
  };
  sig.junctions.forEach((j) => {
    if (j.control === 'none') return;
    j.approaches.forEach((a, ai) => {
      const e = g.edges[a.edge];
      const sm = sampleAt(e.pts, e.cum, a.stopS);
      const dx = sm.dx, dz = sm.dz, rx = -dz, rz = dx;                   // driver's heading and right
      const F = at(sm.x, sm.z, dx, dz);
      const half = a.half;
      // stop line: the approach's own lanes (centre line to curb), 45 cm, just behind the line
      if (a.stopSign || j.control === 'signal') put(lists.line, F, half / 2, 0.035, 0.25, Math.max(1, half - 0.4), 1, 0.45, true);
      // continental crosswalk in front of the line: 50 cm bars along the road, 3 m long, every 1.1 m across the whole width
      if (a.crosswalk) for (let x = -half + 0.55; x <= half - 0.4; x += 1.1) put(lists.zebra, F, x, 0.035, -2.4, 0.5, 1, 3.0, true);
      if (j.control === 'signal') {
        // far side: the pole beyond the junction on the right of the departing lanes, the mast arm reaching back over the approach
        const crossHalf = Math.max(3, a.setback - (a.crosswalk ? 4.6 : 1.4));
        const far = a.setback + crossHalf + 1.5;                           // stop line -> centre -> just past the far curb
        const px = sm.x + dx * far, pz = sm.z + dz * far;
        const P = at(px, pz, dx, dz);
        const ox = half + 1.7;
        put(lists.pole, P, ox, 3.6, 0, 1, 1, 1);
        const lanes = Math.max(1, a.lanes), reach = Math.max(3.5, ox - 1.2);
        put(lists.arm, P, ox - reach / 2, 6.55, 0, reach, 1, 1);
        const heads: number[] = [];
        for (let k = 0; k < lanes; k++) heads.push(Math.min(ox - 1.0, 1.7 + 3.3 * k));
        heads.push(ox);                                                   // the pole head
        heads.forEach((hx, hi) => {
          const hy = hi < lanes ? 5.85 : 3.3;
          put(lists.head, P, hx, hy, hi < lanes ? 0 : 0.35, 1, 1, 1);
          for (let k = 0; k < 3; k++) { put(lists.lamp, P, hx, hy + 0.33 - k * 0.33, (hi < lanes ? 0 : 0.35) + 0.152, 1, 1, 1); lampRef.push({ j: j.id, a: ai, k }); }
        });
        poles.push(px + rx * ox, pz + rz * ox);
      } else if (a.stopSign) {
        // near right corner, a metre before the line
        const ox = half + 1.1;
        put(lists.post, F, ox, 1.25, 1.0, 1, 1, 1);
        put(lists.sign, F, ox, 2.2, 1.05, 1, 1, 1);
        if (j.control === 'allStop') put(lists.plaque, F, ox, 1.72, 1.05, 1, 1, 1);
        poles.push(sm.x + rx * ox, sm.z + rz * ox);
      }
    });
  });

  const paint = (color: number, factor: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: factor });
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.45, metalness: 0.75 });
  const octo = new THREE.CircleGeometry(0.38, 8).rotateZ(Math.PI / 8);
  const sets: [string, THREE.BufferGeometry, THREE.Material, boolean][] = [
    ['line', flat, paint(0xeeeeea, -4), false],
    ['zebra', flat, paint(0xeeeeea, -4), false],
    ['pole', new THREE.CylinderGeometry(0.13, 0.17, 7.2, 10), steel, true],
    ['arm', new THREE.CylinderGeometry(0.09, 0.11, 1, 8).rotateZ(Math.PI / 2), steel, true],
    // housing and black back plate in one box (a visor-less head), front face at local z +0.14
    ['head', new THREE.BoxGeometry(0.42, 1.08, 0.28), new THREE.MeshStandardMaterial({ color: 0x1c1d18, roughness: 0.7 }), true],
    ['lamp', new THREE.CircleGeometry(0.125, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), false],
    ['post', new THREE.BoxGeometry(0.06, 2.5, 0.06), steel, true],
    ['sign', octo, new THREE.MeshStandardMaterial({ map: stopTexture(), roughness: 0.5, side: THREE.DoubleSide }), true],
    ['plaque', new THREE.PlaneGeometry(0.46, 0.17), new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.5, side: THREE.DoubleSide }), false],
  ];
  let lamps: THREE.InstancedMesh | null = null;
  for (const [name, geo, mat, shadow] of sets) {
    const list = lists[name]; if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = shadow; im.receiveShadow = name !== 'lamp'; im.name = 'junction-' + name;
    im.computeBoundingSphere();
    group.add(im);
    if (name === 'lamp') lamps = im;
  }
  // lamp colours: only touched when an approach's lamp changes
  const shown = new Int8Array(lampRef.length).fill(-1), col = new THREE.Color();
  const LAMPS: Lamp[] = ['R', 'Y', 'G'];
  const update = (): void => {
    if (!lamps) return;
    let dirty = false;
    for (let i = 0; i < lampRef.length; i++) {
      const r = lampRef[i], j = sig.junctions[r.j], lit = sig.lamp(j, j.approaches[r.a]) === LAMPS[r.k] ? 1 : 0;
      if (shown[i] === lit) continue;
      shown[i] = lit; dirty = true;
      lamps.setColorAt(i, col.setHex(lit ? LIT[LAMPS[r.k]] : DARK[r.k]));
    }
    if (dirty && lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  };
  update();
  // poles and posts, for keeping trees and props off them
  const C = 20, grid = new Map<number, number[]>();
  for (let i = 0; i < poles.length; i += 2) { const k = Math.floor(poles[i] / C) * 100003 + Math.floor(poles[i + 1] / C); (grid.get(k) ?? (grid.set(k, []), grid.get(k)!)).push(poles[i], poles[i + 1]); }
  const near = (x: number, z: number, r: number): boolean => {
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) { const a = grid.get((cx + i) * 100003 + cz + k); if (a) for (let n = 0; n < a.length; n += 2) if ((a[n] - x) ** 2 + (a[n + 1] - z) ** 2 < r * r) return true; }
    return false;
  };
  console.log('intersections', sig.stats(), Object.fromEntries(Object.entries(lists).map(([k, l]) => [k, l.length])));
  return { group, update, near };
}
