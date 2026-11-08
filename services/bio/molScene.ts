// Structure -> three.js: cartoon (backbone tube by secondary structure), ball-and-stick and
// space-filling, coloured by element, chain, secondary structure or AlphaFold confidence.
// Instanced for speed; `bakeForExport` turns the instances into plain meshes for GLB.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Structure, type Atom, ELEMENT_COLOR, VDW, AMINO, NUCLEIC, plddtColor, secondaryAt, structureBounds } from './structure';

export type MolStyle = 'cartoon' | 'ball-stick' | 'spacefill';
export type MolColor = 'element' | 'chain' | 'secondary' | 'confidence';

const CHAIN_COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
const SS_COLOR = { helix: '#e0457b', sheet: '#f2c14e', coil: '#b8b8c8' };
const WATER = new Set(['HOH', 'WAT', 'H2O', 'DOD']);

export interface MolOptions { style: MolStyle; color: MolColor; showWater?: boolean; showHydrogens?: boolean; hiddenChains?: Set<string>; highlightChain?: string | null }

export function atomColor(s: Structure, a: Atom, mode: MolColor, chainIndex: Map<string, number>): string {
  if (mode === 'confidence') return s.predicted ? plddtColor(a.b) : ELEMENT_COLOR[a.element] ?? '#ff69b4';
  if (mode === 'chain') return CHAIN_COLORS[(chainIndex.get(a.chain) ?? 0) % CHAIN_COLORS.length];
  if (mode === 'secondary') return a.het ? ELEMENT_COLOR[a.element] ?? '#ff69b4' : SS_COLOR[secondaryAt(s, a.chain, a.resSeq) ?? 'coil'];
  return ELEMENT_COLOR[a.element] ?? '#ff69b4';
}

/** Group centred on the origin (structures sit far from it in their own coordinates). */
export function structureToGroup(s: Structure, o: MolOptions): THREE.Group {
  const root = new THREE.Group(); root.name = s.id;
  const { center } = structureBounds(s.atoms); root.position.set(-center[0], -center[1], -center[2]);
  const chainIndex = new Map(s.chains.map((c, i) => [c.id, i]));
  const visible = (a: Atom) => !o.hiddenChains?.has(a.chain) && (o.showWater || !WATER.has(a.resName)) && (o.showHydrogens || a.element !== 'H');
  const isPolymer = (a: Atom) => !a.het && (AMINO[a.resName] || NUCLEIC[a.resName]);

  // Which atoms are drawn as atoms: everything (ball-stick/spacefill), or only ligands with a cartoon.
  const atomIdx: number[] = [];
  s.atoms.forEach((a, i) => { if (visible(a) && (o.style !== 'cartoon' || !isPolymer(a))) atomIdx.push(i); });

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05, vertexColors: false });
  const color = new THREE.Color();
  if (atomIdx.length) {
    const sphere = new THREE.SphereGeometry(1, o.style === 'spacefill' ? 20 : 14, o.style === 'spacefill' ? 14 : 10);
    const inst = new THREE.InstancedMesh(sphere, mat, atomIdx.length); inst.name = 'atoms';
    const m = new THREE.Matrix4();
    atomIdx.forEach((ai, k) => {
      const a = s.atoms[ai];
      const r = o.style === 'spacefill' ? (VDW[a.element] ?? 1.7) : a.element === 'H' ? 0.16 : (WATER.has(a.resName) ? 0.22 : 0.3);
      m.makeScale(r, r, r).setPosition(a.x, a.y, a.z); inst.setMatrixAt(k, m);
      inst.setColorAt(k, color.set(o.highlightChain && a.chain === o.highlightChain ? '#ffb020' : atomColor(s, a, o.color, chainIndex)));
    });
    inst.userData.atomIndex = atomIdx;
    root.add(inst);
  }

  if (o.style !== 'spacefill') {
    const drawn = new Set(atomIdx); const pairs: Array<[number, number]> = [];
    for (let k = 0; k < s.bonds.length; k += 2) { const i = s.bonds[k], j = s.bonds[k + 1]; if (drawn.has(i) && drawn.has(j)) pairs.push([i, j]); }
    if (pairs.length) {
      const cyl = new THREE.CylinderGeometry(0.12, 0.12, 1, 8, 1, true); cyl.translate(0, 0.5, 0);
      const inst = new THREE.InstancedMesh(cyl, mat, pairs.length * 2); inst.name = 'bonds';
      const up = new THREE.Vector3(0, 1, 0); const q = new THREE.Quaternion(); const m = new THREE.Matrix4(); const sc = new THREE.Vector3();
      let n = 0;
      for (const [i, j] of pairs) {
        const a = s.atoms[i], b = s.atoms[j]; const pa = new THREE.Vector3(a.x, a.y, a.z), pb = new THREE.Vector3(b.x, b.y, b.z);
        const mid = pa.clone().add(pb).multiplyScalar(0.5);
        for (const [from, to, atom] of [[pa, mid, a], [pb, mid, b]] as const) {
          const dir = to.clone().sub(from); const len = dir.length(); q.setFromUnitVectors(up, dir.normalize());
          m.compose(from, q, sc.set(1, len, 1)); inst.setMatrixAt(n, m);
          inst.setColorAt(n++, color.set(o.highlightChain && atom.chain === o.highlightChain ? '#ffb020' : atomColor(s, atom, o.color, chainIndex)));
        }
      }
      root.add(inst);
    }
  }

  if (o.style === 'cartoon') for (const tube of cartoonTubes(s, o, chainIndex)) root.add(tube);
  return root;
}

/** Backbone tubes through CA (protein) or P (nucleic) atoms, split into runs of one secondary type. */
function cartoonTubes(s: Structure, o: MolOptions, chainIndex: Map<string, number>): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const byChain = new Map<string, Atom[]>();
  for (const a of s.atoms) {
    if (a.het || o.hiddenChains?.has(a.chain)) continue;
    if ((AMINO[a.resName] && a.name === 'CA') || (NUCLEIC[a.resName] && a.name === 'P')) { const l = byChain.get(a.chain) ?? []; l.push(a); byChain.set(a.chain, l); }
  }
  for (const [chain, trace] of byChain) {
    if (trace.length < 2) continue;
    // Break the trace where residues are missing (gap > 4.5 Å between CAs, > 8 Å between Ps).
    const segments: Atom[][] = [[trace[0]]];
    for (let i = 1; i < trace.length; i++) {
      const p = trace[i - 1], a = trace[i]; const d = Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z);
      if (d > (a.name === 'P' ? 8 : 4.5)) segments.push([a]); else segments[segments.length - 1].push(a);
    }
    for (const seg of segments) {
      if (seg.length < 2) continue;
      // Runs of the same kind, sharing their boundary residue so the tube stays continuous.
      let start = 0;
      for (let i = 1; i <= seg.length; i++) {
        const kindOf = (a: Atom) => a.name === 'P' ? 'coil' : secondaryAt(s, a.chain, a.resSeq) ?? 'coil';
        if (i < seg.length && kindOf(seg[i]) === kindOf(seg[start])) continue;
        const run = seg.slice(Math.max(0, start - 1), Math.min(seg.length, i + 1)); const kind = kindOf(seg[start]);
        if (run.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(run.map(a => new THREE.Vector3(a.x, a.y, a.z)), false, 'centripetal');
          const radius = kind === 'helix' ? 0.9 : kind === 'sheet' ? 0.7 : 0.3;
          const tubular = Math.max(4, run.length * 6), radial = kind === 'coil' ? 6 : 10;
          const geo = new THREE.TubeGeometry(curve, tubular, radius, radial, false);
          // Colour ring by ring from the nearest residue, so per-residue colours (confidence) show.
          const residueColor = (a: Atom) => o.highlightChain === chain ? '#ffb020' : o.color === 'confidence' && s.predicted ? plddtColor(a.b) : o.color === 'chain' ? CHAIN_COLORS[(chainIndex.get(chain) ?? 0) % CHAIN_COLORS.length] : SS_COLOR[kind];
          const cols = new Float32Array((tubular + 1) * (radial + 1) * 3); const cc = new THREE.Color();
          for (let i = 0; i <= tubular; i++) {
            cc.set(residueColor(run[Math.round(i / tubular * (run.length - 1))]));
            for (let j = 0; j <= radial; j++) { const v = (i * (radial + 1) + j) * 3; cols[v] = cc.r; cols[v + 1] = cc.g; cols[v + 2] = cc.b; }
          }
          geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
          const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.05 }));
          mesh.name = `cartoon_${chain}_${seg[start].resSeq}`; mesh.userData.chain = chain;
          out.push(mesh);
        }
        start = i;
      }
    }
  }
  return out;
}

/** Instances become plain coloured meshes, so a GLB opens in any viewer (model-viewer too). */
export function bakeForExport(group: THREE.Group): THREE.Group {
  const out = new THREE.Group(); out.name = group.name; out.position.copy(group.position);
  group.updateMatrixWorld(true);
  group.traverse(obj => {
    const inst = obj as THREE.InstancedMesh;
    if ((inst as any).isInstancedMesh) {
      const byColor = new Map<string, THREE.BufferGeometry[]>(); const m = new THREE.Matrix4(); const c = new THREE.Color();
      // Lower-poly copies keep big structures exportable.
      const src = inst.geometry.clone(); const base = inst.count > 3000 ? simplifySphere(src) : src;
      for (let k = 0; k < inst.count; k++) {
        inst.getMatrixAt(k, m); inst.getColorAt(k, c);
        const g = base.clone().applyMatrix4(m); g.deleteAttribute('uv');
        const key = '#' + c.getHexString(); const l = byColor.get(key) ?? []; l.push(g); byColor.set(key, l);
      }
      for (const [hex, geos] of byColor) { const merged = mergeGeometries(geos, false); if (merged) out.add(new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45 }))); }
    } else if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh; out.add(new THREE.Mesh(mesh.geometry.clone(), mesh.material));
    }
  });
  return out;
}

function simplifySphere(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.type === 'SphereGeometry' ? new THREE.SphereGeometry(1, 8, 6) : g.type === 'CylinderGeometry' ? (() => { const c = new THREE.CylinderGeometry(0.12, 0.12, 1, 5, 1, true); c.translate(0, 0.5, 0); return c; })() : g;
}

export async function structureToGlb(s: Structure, o: MolOptions): Promise<Uint8Array> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const scene = new THREE.Scene(); scene.add(bakeForExport(structureToGroup(s, o)));
  return new Uint8Array(await new GLTFExporter().parseAsync(scene, { binary: true }) as ArrayBuffer);
}
