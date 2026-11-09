// Enclosures that fit the electronics: every physical part has a body size and, if it reaches the
// outside, a cutout on a face. Bodies are packed in rows (front-panel parts at the front, back-panel
// parts at the back), the box grows around them, and we emit a printable base + lid and flat
// panels for laser cutting. Millimetres, Z up; the base sits on z = 0.

import { type P2, extrude, translate, circlePts, merge, type Solid } from '../mech/geometry';
import { type CadModel, emptyModel, type CadEntity2D } from '../cad/model';
import { addMesh, finish } from '../cad/mesh';

export type Face = 'top' | 'front' | 'back' | 'left' | 'right' | 'inside';
export type Cutout = { shape: 'circle'; d: number } | { shape: 'rect'; w: number; h: number } | { shape: 'grille'; d: number };
export interface Item { name: string; ref?: string; w: number; d: number; h: number; face: Face; cutout?: Cutout; note?: string }

/** Physical sizes for common parts (body w × d × h, mm) and how they meet the case. */
export const PHYSICAL: Record<string, (p: Record<string, number | string>) => Omit<Item, 'name'>> = {
  led: () => ({ w: 6, d: 6, h: 9, face: 'top', cutout: { shape: 'circle', d: 5.2 }, note: '5 mm LED: 5.2 mm hole, push-fit or a bezel' }),
  resistor: () => ({ w: 10, d: 3, h: 3, face: 'inside' }),
  capacitor: () => ({ w: 5, d: 3, h: 6, face: 'inside' }),
  electrolytic: () => ({ w: 6, d: 6, h: 12, face: 'inside' }),
  diode: () => ({ w: 8, d: 3, h: 3, face: 'inside' }),
  npn: () => ({ w: 5, d: 4, h: 5, face: 'inside' }),
  nmos: () => ({ w: 10, d: 5, h: 15, face: 'inside' }),
  potentiometer: () => ({ w: 17, d: 17, h: 12, face: 'top', cutout: { shape: 'circle', d: 7.5 }, note: '16 mm pot, 7 mm bushing: 7.5 mm hole; leave 25 mm for the knob' }),
  switch: p => (p.state === 'open' ? { w: 12, d: 12, h: 8, face: 'top', cutout: { shape: 'circle', d: 12.2 }, note: '12 mm momentary button' } : { w: 21, d: 15, h: 22, face: 'back', cutout: { shape: 'rect', w: 19.2, h: 13 }, note: 'Snap-in rocker switch, 19 × 13 mm cutout' }),
  fuse: () => ({ w: 30, d: 12, h: 12, face: 'back', cutout: { shape: 'circle', d: 12.5 }, note: 'Panel fuse holder' }),
  speaker: p => { const W = Number(p.P ?? 0.5); const dia = W <= 1 ? 40 : W <= 3 ? 57 : W <= 10 ? 77 : 102; return { w: dia, d: dia, h: dia > 60 ? 30 : 20, face: 'front', cutout: { shape: 'grille', d: dia - 6 }, note: `${dia} mm driver behind a hole grille` }; },
  battery: p => (Number(p.V ?? 9) > 8 ? { w: 27, d: 18, h: 48, face: 'inside', note: '9 V battery clip' } : { w: 58, d: 48, h: 16, face: 'inside', note: '3 × AA holder with cover' }),
  coincell: () => ({ w: 22, d: 22, h: 6, face: 'inside', note: 'CR2032 holder (screw-secured cover for Reese\'s Law)' }),
  usb5v: () => ({ w: 9, d: 8, h: 4, face: 'back', cutout: { shape: 'rect', w: 9.5, h: 3.8 }, note: 'USB-C socket' }),
  dcsupply: () => ({ w: 14, d: 9, h: 11, face: 'back', cutout: { shape: 'circle', d: 8 }, note: '5.5 × 2.1 mm barrel jack' }),
  mains: () => ({ w: 28, d: 20, h: 22, face: 'back', cutout: { shape: 'rect', w: 27.5, h: 19.5 }, note: 'IEC C8 or C14 inlet (panel-mount, certified)' }),
  reg7805: () => ({ w: 10, d: 5, h: 16, face: 'inside', note: 'TO-220 on the board' }),
  ne555: () => ({ w: 10, d: 7, h: 4, face: 'inside' }),
  pico: () => ({ w: 51, d: 21, h: 4, face: 'back', cutout: { shape: 'rect', w: 11, h: 6 }, note: 'Pico USB port at the back edge' }),
  esp32: () => ({ w: 55, d: 28, h: 8, face: 'back', cutout: { shape: 'rect', w: 11, h: 6 }, note: 'Dev board USB at the back edge' }),
  nano: () => ({ w: 45, d: 18, h: 7, face: 'back', cutout: { shape: 'rect', w: 10, h: 6 } }),
  rpi: () => ({ w: 85, d: 56, h: 17, face: 'inside', note: 'Leave the side open or cut ports for USB/Ethernet/HDMI; vent above the CPU' }),
  amp: () => ({ w: 25, d: 18, h: 4, face: 'inside' }),
  acdc: () => ({ w: 34, d: 23, h: 16, face: 'inside', note: 'Keep 6 mm clear of low-voltage parts' }),
  sensor: () => ({ w: 15, d: 12, h: 3, face: 'back', cutout: { shape: 'rect', w: 12, h: 4 }, note: 'Vent slot so the sensor sees outside air' }),
  usbload: () => ({ w: 13, d: 15, h: 6, face: 'front', cutout: { shape: 'rect', w: 13.2, h: 5.8 }, note: 'USB-A receptacle' }),
  ledstrip: () => ({ w: 0, d: 0, h: 0, face: 'inside', note: 'Strip runs outside the box: 2-pin connector on the back' }),
  jack: () => ({ w: 12, d: 30, h: 12, face: 'right', cutout: { shape: 'circle', d: 9.6 }, note: '¼" jack, 3/8" (9.5 mm) hole' }),
  pickup: () => ({ w: 0, d: 0, h: 0, face: 'inside' }),
  signal: () => ({ w: 12, d: 14, h: 6, face: 'back', cutout: { shape: 'circle', d: 6.2 }, note: '3.5 mm audio-in jack' }),
};

export interface Placement extends Item { x: number; y: number; z: number }
export interface Enclosure { W: number; D: number; H: number; wall: number; items: Placement[]; notes: string[]; model: CadModel; panels: CadModel }

const holeLoop = (c: Cutout, cx: number, cy: number): P2[][] => {
  if (c.shape === 'circle') return [circlePts(c.d / 2, 40, cx, cy)];
  if (c.shape === 'rect') return [[[cx - c.w / 2, cy - c.h / 2], [cx + c.w / 2, cy - c.h / 2], [cx + c.w / 2, cy + c.h / 2], [cx - c.w / 2, cy + c.h / 2]]];
  // Grille: rings of 3 mm holes inside the driver diameter.
  const out: P2[][] = []; const r0 = c.d / 2 - 2;
  for (let y = -r0; y <= r0; y += 5) for (let x = -r0; x <= r0; x += 5) if (x * x + y * y <= (r0 - 1.5) ** 2) out.push(circlePts(1.5, 12, cx + x + (Math.round(y / 5) % 2 ? 2.5 : 0), cy + y));
  return out.filter(h => h.every(([x, y]) => (x - cx) ** 2 + (y - cy) ** 2 <= (c.d / 2) ** 2));
};

/** Pack bodies and build the case. `minInterior` lets a product (a speaker) force a bigger box. */
export function designEnclosure(raw: Item[], o: { wall?: number; clearance?: number; name?: string; minInterior?: [number, number, number] } = {}): Enclosure {
  const wall = o.wall ?? 2.4, gap = o.clearance ?? 3; const notes: string[] = [];
  const items = raw.filter(i => i.w > 0 && i.d > 0);
  // Side-panel items are packed with the inside rows but hug their wall.
  const front = items.filter(i => i.face === 'front'), back = items.filter(i => i.face === 'back' || i.face === 'left' || i.face === 'right'), mid = items.filter(i => i.face === 'top' || i.face === 'inside');
  const sorted = [...mid].sort((a, b) => b.d - a.d);
  const totalArea = items.reduce((s, i) => s + (i.w + gap) * (i.d + gap), 0);
  const widest = Math.max(30, ...items.map(i => i.w + 2 * gap), front.reduce((s, i) => s + i.w + gap, gap), back.reduce((s, i) => s + i.w + gap, gap));
  let W = Math.max(widest, Math.sqrt(totalArea * 1.6));
  // Shelf packing.
  const rows: Item[][] = []; if (front.length) rows.push(front);
  let cur: Item[] = []; let cw = gap;
  for (const it of sorted) { if (cw + it.w + gap > W && cur.length) { rows.push(cur); cur = []; cw = gap; } cur.push(it); cw += it.w + gap; }
  if (cur.length) rows.push(cur); if (back.length) rows.push(back);
  W = Math.max(W, ...rows.map(r => r.reduce((s, i) => s + i.w + gap, gap)));
  const placed: Placement[] = []; let y = gap;
  for (const r of rows) { let x = gap; const depth = Math.max(...r.map(i => i.d)); for (const it of r) { placed.push({ ...it, x: x + it.w / 2, y: y + it.d / 2, z: it.h / 2 }); x += it.w + gap; } y += depth + gap; }
  let D = y; let H = Math.max(15, ...items.map(i => i.h + (i.face === 'top' ? 2 : 4)));
  const front0 = placed.filter(p => p.face === 'front'); for (const p of front0) H = Math.max(H, p.h + 4, p.cutout?.shape === 'grille' ? p.w + 4 : 0);
  if (o.minInterior) { W = Math.max(W, o.minInterior[0]); D = Math.max(D, o.minInterior[1]); H = Math.max(H, o.minInterior[2]); }
  W = Math.ceil(W); D = Math.ceil(D); H = Math.ceil(H);
  // Front-panel parts face the front wall (y = 0); back ones the back wall (y = D).
  for (const p of placed) {
    if (p.face === 'front') { p.y = p.d / 2; p.z = Math.max(p.h / 2, p.cutout?.shape === 'grille' ? H / 2 : p.h / 2); }
    if (p.face === 'back') p.y = D - p.d / 2;
    if (p.face === 'right') p.x = W - p.w / 2;
    if (p.face === 'left') p.x = p.w / 2;
    if (p.face === 'top') p.z = H - p.h / 2;
  }
  const lidT = wall; const outer: [number, number, number] = [W + 2 * wall, D + 2 * wall, H + wall + lidT];
  notes.push(`Inside ${W} × ${D} × ${H} mm; outside ${outer.map(v => v.toFixed(0)).join(' × ')} mm with ${wall} mm walls.`);
  const vol = items.reduce((s, i) => s + i.w * i.d * i.h, 0); notes.push(`Parts fill ${Math.round(vol / (W * D * H) * 100)}% of the inside.`);

  // ---- Solids: base = floor + four walls (walls sit on the floor, sides between front/back), lid = top panel with a locating lip.
  const rect = (w: number, h: number, x0 = 0, y0 = 0): P2[] => [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
  const holesOn = (face: Face, toLocal: (p: Placement) => P2) => placed.filter(p => p.face === face && p.cutout).flatMap(p => holeLoop(p.cutout!, ...toLocal(p)));
  // A vertical wall panel drawn in (u, v) and rotated into place.
  const wallSolid = (w: number, h: number, holes: P2[][], place: (u: number, v: number, t: number) => [number, number, number]): Solid => {
    const s = extrude(rect(w, h), holes, 0, wall); const P = s.positions;
    for (let i = 0; i < P.length; i += 3) { const [x, yy, z] = place(P[i], P[i + 1], P[i + 2]); P[i] = x; P[i + 1] = yy; P[i + 2] = z; }
    // Every placement used here is a reflection (determinant -1): flip winding so normals point out.
    for (let i = 0; i < s.indices.length; i += 3) { const t = s.indices[i + 1]; s.indices[i + 1] = s.indices[i + 2]; s.indices[i + 2] = t; }
    return s;
  };
  const Wo = W + 2 * wall, Do = D + 2 * wall;
  const floor = extrude(rect(Wo, Do), [], 0, wall);
  // Front wall: u along +X, v up; outer face at y = 0.
  const frontW = wallSolid(Wo, H, holesOn('front', p => [p.x + wall, p.z]), (u, v, t) => [u, t, wall + v]);
  const backW = wallSolid(Wo, H, holesOn('back', p => [Wo - (p.x + wall), p.z]), (u, v, t) => [Wo - u, Do - t, wall + v]);
  const leftW = wallSolid(D, H, holesOn('left', p => [D - p.y, p.z]), (u, v, t) => [t, wall + D - u, wall + v]);
  const rightW = wallSolid(D, H, holesOn('right', p => [p.y, p.z]), (u, v, t) => [Wo - t, wall + u, wall + v]);
  const lidHoles = holesOn('top', p => [p.x + wall, p.y + wall]);
  const lid = merge(extrude(rect(Wo, Do), lidHoles, 0, lidT), extrude(rect(W - 0.6, D - 0.6, wall + 0.3, wall + 0.3), [rect(W - 0.6 - 2 * 1.6, D - 0.6 - 2 * 1.6, wall + 0.3 + 1.6, wall + 0.3 + 1.6)], -3, 0));
  const model = emptyModel(`${o.name ?? 'enclosure'}.stl`, 'stl', 'plajah-elec'); model.units = 'mm'; model.meta.upAxis = 'Z';
  addMesh(model, { name: 'Base', positions: new Float32Array(merge(floor, frontW, backW, leftW, rightW).positions), indices: new Uint32Array(merge(floor, frontW, backW, leftW, rightW).indices), color: '#94a3b8' });
  const lidUp = translate(lid, 0, 0, wall + H + 12);
  addMesh(model, { name: 'Lid (printed upside down)', positions: new Float32Array(lidUp.positions), indices: new Uint32Array(lidUp.indices), color: '#cbd5e1' });
  finish(model);

  // ---- Flat panels for a laser-cut box (butt joints, glue or corner brackets), laid out in a row.
  const panels = emptyModel(`${o.name ?? 'enclosure'}-panels.dxf`, 'dxf', 'plajah-elec'); panels.units = 'mm'; panels.is2D = true;
  panels.layers = [{ name: 'CUT', color: '#ff0000', visible: true }, { name: 'LABEL', color: '#888888', visible: true }];
  let px = 0; const ents: CadEntity2D[] = [];
  const addPanel = (label: string, w: number, h: number, holes: P2[][]) => {
    const loop = (l: P2[]): CadEntity2D => ({ type: 'polyline', layer: 'CUT', closed: true, points: l.map(([x, yy]) => [x + px, yy, 0]) });
    ents.push(loop(rect(w, h)), ...holes.map(loop), { type: 'text', layer: 'LABEL', at: [px + 2, h + 3, 0], height: 3, rotation: 0, text: label });
    px += w + 8;
  };
  addPanel('Bottom', Wo, Do, []); addPanel('Top', Wo, Do, lidHoles);
  addPanel('Front', Wo, H, holesOn('front', p => [p.x + wall, p.z])); addPanel('Back', Wo, H, holesOn('back', p => [Wo - (p.x + wall), p.z]));
  addPanel('Left', D, H, holesOn('left', p => [D - p.y, p.z])); addPanel('Right', D, H, holesOn('right', p => [p.y, p.z]));
  panels.entities = ents; panels.bounds = { min: [0, 0, 0], max: [px, Math.max(Do, H) + 8, 0] };
  notes.push('Laser panels use butt joints for 3 mm sheet: glue, or add corner brackets.');
  return { W, D, H, wall, items: placed, notes, model, panels };
}
