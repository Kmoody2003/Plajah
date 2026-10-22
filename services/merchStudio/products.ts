// services/merchStudio/products.ts — the built-in merch product templates and their 3D bodies.
//
// Every template is built procedurally in three.js (no model files to ship): a body mesh in the
// product colour plus one "print" mesh per print area, a thin skin that follows the body's surface
// and carries the artwork as a transparent texture. Soft goods (tee, tote) are stitched from two
// pillowed panels so fabric reads as fabric rather than a cut-out slab.
//
// Imported and sculpted models don't use this file: they get their artwork as a projected decal
// (see stage.ts).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { StoreProduct } from '../../types';

export interface MerchPrintArea {
  id: string;
  label: string;
  /** width / height of the printable surface. */
  aspect: number;
  /** Physical print size, for the downloadable print file. */
  printInches: [number, number];
  /** Corner radius as a fraction of the area width (phone cases). */
  cornerRadius?: number;
}

export interface MerchProductTemplate {
  id: string;
  name: string;
  /** Used in generation prompts: "a ceramic mug". */
  noun: string;
  category: StoreProduct['category'];
  /** Hung products float above the floor like a ghost mannequin; standing ones sit on the set. */
  mount: 'stand' | 'hang';
  colors: string[];
  defaultColor: string;
  printAreas: MerchPrintArea[];
  suggestedPrice: number;
  blurb: string;
}

export const MERCH_PRODUCT_TEMPLATES: MerchProductTemplate[] = [
  {
    id: 'tee', name: 'Classic Tee', noun: 'a cotton t-shirt', category: 'APPAREL', mount: 'hang',
    colors: ['#f4f2ee', '#16161a', '#2b3a55', '#8a1c2b', '#5f6b4e', '#d9c7a6', '#e6a6b5'],
    defaultColor: '#f4f2ee',
    printAreas: [
      { id: 'front', label: 'Front', aspect: 0.82, printInches: [12, 14.6] },
      { id: 'back', label: 'Back', aspect: 0.82, printInches: [12, 14.6] },
    ],
    suggestedPrice: 28, blurb: 'Soft-pillowed tee, front + back print',
  },
  {
    id: 'mug', name: 'Ceramic Mug', noun: 'a glossy ceramic coffee mug', category: 'ACCESSORIES', mount: 'stand',
    colors: ['#fbfbf9', '#141416', '#1f3b63', '#c94f3d', '#f2d16b'],
    defaultColor: '#fbfbf9',
    printAreas: [{ id: 'front', label: 'Wrap', aspect: 1.47, printInches: [8.5, 3.5] }],
    suggestedPrice: 18, blurb: '11 oz glossy, handle-side wrap',
  },
  {
    id: 'tote', name: 'Canvas Tote', noun: 'a canvas tote bag', category: 'ACCESSORIES', mount: 'hang',
    colors: ['#e9dfc9', '#1b1b1d', '#3d5a40', '#a6452f', '#f1efe9'],
    defaultColor: '#e9dfc9',
    printAreas: [{ id: 'front', label: 'Front', aspect: 0.88, printInches: [12, 13.6] }],
    suggestedPrice: 24, blurb: 'Heavy canvas with webbing handles',
  },
  {
    id: 'tumbler', name: 'Steel Tumbler', noun: 'a powder-coated steel tumbler with a lid and straw', category: 'ACCESSORIES', mount: 'stand',
    colors: ['#e8e6e1', '#121214', '#7aa6b8', '#e7a7b0', '#4b5d3a', '#c9b27c'],
    defaultColor: '#e8e6e1',
    printAreas: [{ id: 'front', label: 'Wrap', aspect: 0.95, printInches: [4.5, 4.7] }],
    suggestedPrice: 32, blurb: '20 oz insulated, powder-coat finish',
  },
  {
    id: 'poster', name: 'Framed Print', noun: 'a framed art print', category: 'COLLECTIBLES', mount: 'stand',
    colors: ['#141414', '#f3f1ec', '#8a6a46', '#c9a35a'],
    defaultColor: '#141414',
    printAreas: [{ id: 'front', label: 'Print', aspect: 0.75, printInches: [18, 24] }],
    suggestedPrice: 45, blurb: '18×24 with mat and frame',
  },
  {
    id: 'phonecase', name: 'Phone Case', noun: 'a glossy phone case', category: 'ACCESSORIES', mount: 'stand',
    colors: ['#f6f6f6', '#111113', '#cfd8e3', '#f0c9c9', '#2c3e57'],
    defaultColor: '#f6f6f6',
    printAreas: [{ id: 'front', label: 'Back', aspect: 0.48, printInches: [3, 6.25], cornerRadius: 0.15 }],
    suggestedPrice: 22, blurb: 'Slim tough case, edge-to-edge back',
  },
];

export function getProductTemplate(id: string | undefined): MerchProductTemplate {
  return MERCH_PRODUCT_TEMPLATES.find((t) => t.id === id) ?? MERCH_PRODUCT_TEMPLATES[0];
}

// ── 2D geometry helpers (pure, unit-tested) ───────────────────────────────────

export type Pt = [number, number];

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Nearest point on the polygon outline, and the distance to it. */
export function nearestOnPolygon(p: Pt, poly: Pt[]): { point: Pt; dist: number } {
  let best: Pt = poly[0];
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    const q: Pt = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < bestD) { bestD = d; best = q; }
  }
  return { point: best, dist: bestD };
}

/** How far a soft panel puffs out at p: 0 at the seam, `depth` once `falloff` inside it. */
export function pillowDepth(p: Pt, poly: Pt[], depth: number, falloff: number): number {
  if (!pointInPolygon(p, poly)) return 0;
  const t = Math.min(1, nearestOnPolygon(p, poly).dist / falloff);
  return depth * Math.sqrt(t * (2 - t)); // quarter-circle profile: rounds over at the seam
}

/** Flattens a closed outline made of straight points and quadratic curves into a polygon. */
function sampleOutline(parts: Array<Pt | { q: Pt; to: Pt }>, steps = 10): Pt[] {
  const out: Pt[] = [];
  for (const part of parts) {
    if (Array.isArray(part)) { out.push(part); continue; }
    const from = out[out.length - 1];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      out.push([a * from[0] + b * part.q[0] + c * part.to[0], a * from[1] + b * part.q[1] + c * part.to[1]]);
    }
  }
  return out;
}

export const TEE_OUTLINE: Pt[] = sampleOutline([
  [-0.40, 0], [0.40, 0], [0.41, 0.72], [0.62, 0.60], [0.73, 0.86], [0.50, 1.10], [0.17, 1.18],
  { q: [0, 1.0], to: [-0.17, 1.18] },
  [-0.50, 1.10], [-0.73, 0.86], [-0.62, 0.60], [-0.41, 0.72],
]);

export const TOTE_OUTLINE: Pt[] = sampleOutline([
  [-0.44, 0], [0.44, 0], [0.45, 1.0], [-0.45, 1.0],
]);

// ── 3D builders ───────────────────────────────────────────────────────────────

/**
 * A pillowed fabric panel: a grid clipped to the outline, with the outside vertices pulled onto the
 * outline so the edge is smooth, and the inside puffed out along `side` (+1 front, -1 back).
 */
function pillowPanel(poly: Pt[], side: 1 | -1, depth: number, falloff: number, res = 96): THREE.BufferGeometry {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const pad = (maxX - minX) / res;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const nx = res, ny = Math.round(res * (maxY - minY) / (maxX - minX));
  const inside: boolean[] = [];
  const verts: Pt[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const p: Pt = [minX + (i / nx) * (maxX - minX), minY + (j / ny) * (maxY - minY)];
      verts.push(p);
      inside.push(pointInPolygon(p, poly));
    }
  }
  const idx = (i: number, j: number) => j * (nx + 1) + i;
  const used = new Map<number, number>();
  const positions: number[] = [];
  const index: number[] = [];
  const vid = (k: number) => {
    let v = used.get(k);
    if (v !== undefined) return v;
    let p = verts[k];
    let z = 0;
    if (inside[k]) z = pillowDepth(p, poly, depth, falloff);
    else p = nearestOnPolygon(p, poly).point; // snap to the seam
    v = positions.length / 3;
    positions.push(p[0], p[1], side * z);
    used.set(k, v);
    return v;
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      for (const tri of [[a, b, c], [a, c, d]]) {
        if (!tri.some((k) => inside[k])) continue;
        const [x, y, w] = tri.map(vid);
        if (side === 1) index.push(x, y, w); else index.push(x, w, y);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * A print skin over a rectangle of a pillowed panel, lifted just off the fabric. On the back panel x
 * is mirrored, which both reads the artwork the right way round from behind and flips the faces to -z.
 */
function pillowPrint(poly: Pt[], side: 1 | -1, depth: number, falloff: number, rect: { x: number; y: number; w: number; h: number }, res = 40): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(rect.w, rect.h, res, res);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = rect.x + side * pos.getX(i);
    const y = pos.getY(i) + rect.y;
    pos.setXYZ(i, x, y, side * (pillowDepth([x, y], poly, depth, falloff) + 0.003));
  }
  g.computeVertexNormals();
  return g;
}

export interface BuiltProduct {
  root: THREE.Group;
  /** Meshes carrying artwork, by print area id. */
  printMeshes: Record<string, THREE.Mesh>;
  /** Body materials that take the product colour. */
  colorMaterials: THREE.MeshPhysicalMaterial[];
  /** Print material roughness so the artwork sits in the surface (ink on cotton vs glaze on ceramic). */
  printRoughness: number;
}

function printMaterial(roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    transparent: true, roughness, metalness: 0, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return o;
}

export function buildProductModel(templateId: string, color: string): BuiltProduct {
  const t = getProductTemplate(templateId);
  const root = new THREE.Group();
  root.name = `merch:${t.id}`;
  const printMeshes: Record<string, THREE.Mesh> = {};
  const colorMaterials: THREE.MeshPhysicalMaterial[] = [];
  const body = (opts: THREE.MeshPhysicalMaterialParameters) => {
    const m = new THREE.MeshPhysicalMaterial({ color, ...opts });
    colorMaterials.push(m);
    return m;
  };
  let printRoughness = 0.6;

  if (t.id === 'tee' || t.id === 'tote') {
    const isTee = t.id === 'tee';
    const poly = isTee ? TEE_OUTLINE : TOTE_OUTLINE;
    const depth = isTee ? 0.07 : 0.035;
    const falloff = isTee ? 0.16 : 0.12;
    const fabric = body({ roughness: 0.92, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4), side: THREE.DoubleSide });
    root.add(new THREE.Mesh(pillowPanel(poly, 1, depth, falloff), fabric));
    root.add(new THREE.Mesh(pillowPanel(poly, -1, depth, falloff), fabric));
    printRoughness = 0.85;
    const rect = isTee ? { x: 0, y: 0.6, w: 0.44, h: 0.44 / 0.82 } : { x: 0, y: 0.47, w: 0.62, h: 0.62 / 0.88 };
    const front = new THREE.Mesh(pillowPrint(poly, 1, depth, falloff, rect), printMaterial(printRoughness));
    front.name = 'print:front';
    root.add(front);
    printMeshes.front = front;
    if (isTee) {
      const back = new THREE.Mesh(pillowPrint(poly, -1, depth, falloff, { ...rect, y: 0.66 }), printMaterial(printRoughness));
      back.name = 'print:back';
      root.add(back);
      printMeshes.back = back;
      // Ribbed collar along the neckline.
      const neck = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.17, 1.18, 0.004), new THREE.Vector3(0, 1.0, 0.03), new THREE.Vector3(-0.17, 1.18, 0.004));
      root.add(new THREE.Mesh(new THREE.TubeGeometry(neck, 32, 0.016, 8, false), fabric));
    } else {
      const strap = body({ roughness: 0.95, sheen: 0.6 });
      for (const z of [0.012, -0.012]) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-0.22, 0.96, z), new THREE.Vector3(-0.2, 1.3, z), new THREE.Vector3(0, 1.46, z),
          new THREE.Vector3(0.2, 1.3, z), new THREE.Vector3(0.22, 0.96, z),
        ]);
        root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.022, 10, false), strap));
      }
    }
  } else if (t.id === 'mug') {
    const profile = [
      [0, 0], [0.4, 0], [0.42, 0.02], [0.42, 0.93], [0.414, 0.952], [0.395, 0.952], [0.39, 0.93], [0.39, 0.07], [0, 0.07],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const ceramic = body({ roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 });
    root.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 128), ceramic));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 24, 64, Math.PI), ceramic);
    handle.rotation.z = -Math.PI / 2;
    handle.position.set(0.4, 0.49, 0);
    root.add(handle);
    printRoughness = 0.14;
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.4235, 0.4235, 0.78, 128, 1, true, -1.35, 2.7), printMaterial(printRoughness));
    wrap.position.y = 0.485;
    wrap.name = 'print:front';
    root.add(wrap);
    printMeshes.front = wrap;
  } else if (t.id === 'tumbler') {
    const rb = 0.3, rt = 0.37, h = 1.1;
    const steel = body({ roughness: 0.42, metalness: 0.25, clearcoat: 0.4 });
    const profile = [[0, 0], [rb - 0.01, 0], [rb, 0.015], [rt, h], [0, h]].map(([r, y]) => new THREE.Vector2(r, y));
    root.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 128), steel));
    const lidMat = new THREE.MeshPhysicalMaterial({ color: '#1a1a1c', roughness: 0.35, clearcoat: 0.6, transparent: true, opacity: 0.92 });
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(rt + 0.012, rt + 0.012, 0.09, 96), lidMat);
    lid.position.y = h + 0.045;
    root.add(lid);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 24), new THREE.MeshPhysicalMaterial({ color: '#f2f2f2', roughness: 0.2, transmission: 0.6, thickness: 0.02 }));
    straw.position.set(0.08, h + 0.3, 0);
    straw.rotation.z = -0.08;
    root.add(straw);
    printRoughness = 0.4;
    const y0 = 0.22, y1 = 0.92;
    const r = (y: number) => rb + (rt - rb) * (y / h) + 0.003;
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(r(y1), r(y0), y1 - y0, 128, 1, true, -1.4, 2.8), printMaterial(printRoughness));
    wrap.position.y = (y0 + y1) / 2;
    wrap.name = 'print:front';
    root.add(wrap);
    printMeshes.front = wrap;
  } else if (t.id === 'poster') {
    const frame = body({ roughness: 0.45, clearcoat: 0.3 });
    const group = new THREE.Group();
    const fw = 0.9, fh = 1.18, fd = 0.05, rail = 0.05;
    for (const [w, hh, x, y] of [[fw, rail, 0, fh / 2 - rail / 2], [fw, rail, 0, -fh / 2 + rail / 2], [rail, fh, -fw / 2 + rail / 2, 0], [rail, fh, fw / 2 - rail / 2, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, fd), frame);
      m.position.set(x, y, 0);
      group.add(m);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.02, fh - 0.02, 0.01), new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.9 }));
    back.position.z = -fd / 2 + 0.005;
    group.add(back);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(fw - 2 * rail, fh - 2 * rail), new THREE.MeshStandardMaterial({ color: '#f7f5f0', roughness: 0.95 }));
    mat.position.z = 0.004;
    group.add(mat);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.88), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }));
    paper.position.z = 0.006;
    group.add(paper);
    const print = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.88), printMaterial(0.7));
    print.position.z = 0.008;
    print.name = 'print:front';
    group.add(print);
    printMeshes.front = print;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(fw - 2 * rail, fh - 2 * rail), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, transmission: 1, thickness: 0.002, transparent: true, opacity: 0.12 }));
    glass.position.z = fd / 2 - 0.004;
    group.add(glass);
    // Leaning against an unseen wall.
    group.rotation.x = -0.1;
    group.position.set(0, fh / 2, -0.05);
    root.add(group);
    printRoughness = 0.7;
  } else if (t.id === 'phonecase') {
    const w = 0.5, h = 1.02, d = 0.07;
    const shell = body({ roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.12 });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 6, 0.07), shell));
    const bump = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.2, 0.03, 4, 0.04), new THREE.MeshPhysicalMaterial({ color: '#1b1b1e', roughness: 0.25, clearcoat: 1 }));
    bump.position.set(-0.11, 0.37, d / 2 + 0.01);
    group.add(bump);
    for (const [x, y] of [[-0.155, 0.415], [-0.065, 0.415], [-0.155, 0.325]]) {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 32), new THREE.MeshPhysicalMaterial({ color: '#050507', roughness: 0.05, metalness: 0.4, clearcoat: 1 }));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(x, y, d / 2 + 0.03);
      group.add(lens);
    }
    const print = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), printMaterial(0.3));
    print.position.z = d / 2 + 0.0015;
    print.name = 'print:front';
    group.add(print);
    printMeshes.front = print;
    group.rotation.x = -0.12;
    group.position.set(0, h / 2 + 0.02, 0);
    root.add(group);
    printRoughness = 0.3;
  }

  return { root: shadowed(root), printMeshes, colorMaterials, printRoughness };
}
