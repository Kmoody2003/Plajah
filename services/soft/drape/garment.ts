// Arranging pattern pieces round the avatar and naming the seams, per template. Pieces start on
// simple surfaces (an elliptic cylinder round the torso, cylinders round the arms, planes beside
// the head, a ring for rib bands) where they are unstrained, then the seams sew them shut. Seams
// are found from landmarks on the drafted outline (hem corners, underarm, shoulder and neck
// points, sleeve cap top) so they follow any size or fit. Unknown pieces hang loose, unsewn.

import { type Pt, bbox, rect } from '../geometry';
import { type Pattern, type Piece, unfold } from '../patterns';
import { type Body, type V3, ellPerim, torsoAt } from './avatar';
import type { PlacedPiece, SeamSpec, GatherSpec, AttachSpec } from './cloth';
import { type Fabric, defaultFabric, fabricById } from './fabrics';

export type FabricFor = (role: string, piece: Piece) => Fabric;
export interface Rig { placed: PlacedPiece[]; seams: SeamSpec[]; gathers?: GatherSpec[]; attach?: AttachSpec[]; kind: 'garment' | 'plush' | 'loose'; notes: string[]; pressure?: { targetVolume: number; p0: number; planned: number }; needsBody: boolean }

const grainAngle = (p: Piece) => Math.atan2(p.grain[1][1] - p.grain[0][1], p.grain[1][0] - p.grain[0][0]);
const nearestIdx = (ring: Pt[], q: Pt) => { let bi = 0, bd = Infinity; ring.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = i; } }); return bi; };

/** Arc-length parametrised ellipse (x = a·sinθ, z = b·cosθ; θ = 0 at the front). */
function ellipseWalker(a: number, b: number) {
  const N = 720; const th: number[] = [0], s: number[] = [0];
  for (let i = 1; i <= N; i++) { const t = (i / N) * Math.PI * 2; const t0 = th[i - 1]; th.push(t); s.push(s[i - 1] + Math.hypot(a * (Math.sin(t) - Math.sin(t0)), b * (Math.cos(t) - Math.cos(t0)))); }
  const P = s[N];
  /** θ at signed arc length from the front centre. */
  const theta = (arc: number) => { let u = ((arc % P) + P) % P; let i = 1; while (i < N && s[i] < u) i++; const f = (u - s[i - 1]) / (s[i] - s[i - 1] || 1); return th[i - 1] + (th[i] - th[i - 1]) * f; };
  return { perimeter: P, theta, at: (t: number): [number, number] => [a * Math.sin(t), b * Math.cos(t)] };
}

/** Landmarks on an unfolded bodice outline (front or back), mirrored for side s. */
function bodiceMarks(seam: Pt[]) {
  const W = Math.max(...seam.map(p => p[0])); const L = Math.max(...seam.map(p => p[1]));
  const uaY = Math.max(...seam.filter(p => p[0] > W - 0.5).map(p => p[1]));
  const np = seam.filter(p => p[0] > 0).reduce((b, p) => (p[1] > b[1] ? p : b), [0, -1] as Pt);
  const sh = seam.filter(p => p[0] > np[0] + 1).reduce((b, p) => (p[1] > b[1] ? p : b), [0, -1] as Pt);
  const cn = seam.filter(p => Math.abs(p[0]) < 25 && p[1] > L * 0.5).reduce((b, p) => (Math.abs(p[0]) < Math.abs(b[0]) - 0.5 || (Math.abs(Math.abs(p[0]) - Math.abs(b[0])) <= 0.5 && p[1] < b[1]) ? p : b), [999, 0] as Pt);
  const side = (s: number) => ({ hem: [s * W, 0] as Pt, ua: [s * W, uaY] as Pt, np: [s * np[0], np[1]] as Pt, sh: [s * sh[0], sh[1]] as Pt });
  return { W, L, uaY, cn: [0, cn[1]] as Pt, hemC: [0, 0] as Pt, side };
}

/** Tee / hoodie (and other set-in-sleeve tops drafted by `bodice`). */
function topRig(pattern: Pattern, body: Body, fab: FabricFor, off = 0): Rig {
  const by = (id: string) => pattern.pieces.find(p => p.id === id);
  const fr = by('front'), bk = by('back'), sl = by('sleeve'); if (!fr || !bk || !sl) return looseRig(pattern, body, fab);
  const F = unfold(fr), B = unfold(bk); const fm = bodiceMarks(F.seam), bm = bodiceMarks(B.seam);
  const placed: PlacedPiece[] = []; const seams: SeamSpec[] = []; const notes: string[] = [];
  const yHps = body.y.neckBase + 8; const L = fm.L;
  const ringsA = Math.max(...body.rings.slice(0, 6).map(r => r.a)), ringsB = Math.max(...body.rings.slice(0, 6).map(r => r.b + Math.abs(r.cz)));
  const cyl = ellipseWalker(ringsA + 38 + off, ringsB + 46 + off);
  const wrap = (back: boolean) => (q: Pt): V3 => { const th = cyl.theta(q[0]); const [x, z] = cyl.at(back ? Math.PI - th : th); return [x, yHps - (L - q[1]), z]; };
  placed.push({ id: 'front', name: 'Front', pieceId: 'front', role: 'body', seam: F.seam, fabric: fab(F.fabric, F), grainAngle: grainAngle(F), map: wrap(false) });
  placed.push({ id: 'back', name: 'Back', pieceId: 'back', role: 'body', seam: B.seam, fabric: fab(B.fabric, B), grainAngle: grainAngle(B), map: wrap(true) });
  for (const s of [1, -1]) {
    const f = fm.side(s), b = bm.side(s); const tag = s > 0 ? 'L' : 'R';
    seams.push({ name: `Side seam ${tag}`, a: [{ piece: 'front', from: f.hem, to: f.ua }], b: [{ piece: 'back', from: b.hem, to: b.ua }] });
    seams.push({ name: `Shoulder ${tag}`, a: [{ piece: 'front', from: f.sh, to: f.np }], b: [{ piece: 'back', from: b.sh, to: b.np }] });
  }
  // Sleeves round the arms: x across the sleeve → angle round the arm (front half toward +z).
  const sb = bbox(sl.seam); const Bw = sb.x1; const len = sb.y1; const capY = Math.max(...sl.seam.filter(p => p[0] > Bw - 0.5).map(p => p[1]));
  const hw = Math.max(...sl.seam.filter(p => p[1] < 0.5).map(p => p[0]));
  body.arms.forEach((arm, i) => {
    const s = i === 0 ? 1 : -1; const tag = s > 0 ? 'L' : 'R'; const d = arm.dir;
    const up = (() => { const u: V3 = [-d[0] * d[1], 1 - d[1] * d[1], -d[2] * d[1]]; const l = Math.hypot(...u) || 1; return u.map(x => x / l) as V3; })();
    const fw = (() => { const u: V3 = [-d[0] * d[2], -d[1] * d[2], 1 - d[2] * d[2]]; const l = Math.hypot(...u) || 1; return u.map(x => x / l) as V3; })();
    const R = Math.max(Bw / Math.PI, arm.r + 26 + off); const a0 = -(len - capY) * 0.35;
    const id = `sleeve-${tag}`;
    placed.push({ id, name: `Sleeve ${tag}`, pieceId: 'sleeve', role: 'sleeve', seam: sl.seam, fabric: fab(sl.fabric, sl), grainAngle: grainAngle(sl),
      map: q => { const ax = a0 + (len - q[1]); const ph = q[0] / R; const c = Math.cos(ph) * R, sn = Math.sin(ph) * R; return [arm.root[0] + d[0] * ax + up[0] * c + fw[0] * sn, arm.root[1] + d[1] * ax + up[1] * c + fw[1] * sn, arm.root[2] + d[2] * ax + up[2] * c + fw[2] * sn]; } });
    const f = fm.side(s), b = bm.side(s);
    seams.push({ name: `Armhole ${tag}`, a: [{ piece: id, from: [Bw, capY], to: [-Bw, capY], via: [0, len] }], b: [{ piece: 'front', from: f.ua, to: f.sh }, { piece: 'back', from: b.sh, to: b.ua }] });
    seams.push({ name: `Underarm ${tag}`, a: [{ piece: id, from: [Bw, capY], to: [hw, 0] }], b: [{ piece: id, from: [-Bw, capY], to: [-hw, 0] }] });
    const cuff = by('cuff');
    if (cuff) {
      const cw = bbox(cuff.seam).w, ch = bbox(cuff.seam).h / 2; const cid = `cuff-${tag}`; const Rc = Math.max(cw / (2 * Math.PI), arm.r * 0.55 + 14 + off);
      const wristAx = Math.hypot(arm.end[0] - arm.root[0], arm.end[1] - arm.root[1], arm.end[2] - arm.root[2]);
      const ax0 = Math.min(a0 + len, wristAx + 30);
      placed.push({ id: cid, name: `Cuff ${tag}`, pieceId: 'cuff', role: 'rib', seam: rect(0, 0, cw, ch), fabric: fab('rib', cuff), grainAngle: 0,
        map: q => { const ax = ax0 + (ch - q[1]); const ph = Math.PI - (q[0] / cw) * Math.PI * 2; const c = Math.cos(ph) * Rc, sn = Math.sin(ph) * Rc; return [arm.root[0] + d[0] * ax + up[0] * c + fw[0] * sn, arm.root[1] + d[1] * ax + up[1] * c + fw[1] * sn, arm.root[2] + d[2] * ax + up[2] * c + fw[2] * sn]; } });
      seams.push({ name: `Cuff ${tag}`, a: [{ piece: cid, from: [0, ch], to: [cw, ch] }], b: [{ piece: id, from: [hw, 0], to: [-hw, 0] }] });
      seams.push({ name: `Cuff join ${tag}`, a: [{ piece: cid, from: [0, 0], to: [0, ch] }], b: [{ piece: cid, from: [cw, 0], to: [cw, ch] }] });
    }
  });
  const hood = by('hood');
  if (hood) {
    const hb = bbox(hood.seam); const half = Math.max(...hood.seam.filter(p => p[1] < 1).map(p => p[0])); const topPt = hood.seam.reduce((b, p) => (p[1] > b[1] || (p[1] === b[1] && p[0] > b[0]) ? p : b), [0, -1] as Pt);
    const hx = body.head.r[0] + 34 + off, zFront = body.head.c[2] + body.head.r[2] * 0.95;
    for (const s of [1, -1]) {
      const id = `hood-${s > 0 ? 'L' : 'R'}`; const f = fm.side(s), b = bm.side(s);
      placed.push({ id, name: `Hood ${s > 0 ? 'L' : 'R'}`, pieceId: 'hood', role: 'hood', seam: hood.seam, fabric: fab(hood.fabric, hood), grainAngle: grainAngle(hood),
        map: q => { const curl = Math.min(1, q[1] / hb.h); return [s * (hx - 40 * curl * curl), body.y.neckBase - 15 + q[1], zFront - q[0]]; } });
      seams.push({ name: `Hood neck ${s > 0 ? 'L' : 'R'}`, a: [{ piece: id, from: [0, 0], to: [half, 0] }], b: [{ piece: 'front', from: fm.cn, to: f.np }, { piece: 'back', from: b.np, to: bm.cn }] });
    }
    seams.push({ name: 'Hood centre', a: [{ piece: 'hood-L', from: [half, 0], to: [0, hb.y1], via: topPt }], b: [{ piece: 'hood-R', from: [half, 0], to: [0, hb.y1], via: topPt }] });
  }
  const band = by('waistband');
  if (band) {
    const w = bbox(band.seam).w, hh = bbox(band.seam).h / 2; const hemY = yHps - L; const r = torsoAt(body, hemY - hh / 2); const k = r.b / r.a;
    const a = Math.max(w / ellPerim(1, k), r.a + 18 + off); const el = ellipseWalker(a, a * k);
    placed.push({ id: 'waistband', name: 'Waistband', pieceId: 'waistband', role: 'rib', seam: rect(0, 0, w, hh), fabric: fab('rib', band), grainAngle: 0,
      map: q => { const [x, z] = el.at(-Math.PI / 2 + (q[0] / w) * Math.PI * 2); return [x, hemY - hh + q[1] - 6, z + r.cz]; } });
    seams.push({ name: 'Waistband', a: [{ piece: 'waistband', from: [0, hh], to: [w, hh] }], b: [{ piece: 'front', from: fm.side(-1).hem, to: fm.side(1).hem }, { piece: 'back', from: bm.side(1).hem, to: bm.side(-1).hem }] });
    seams.push({ name: 'Waistband join', a: [{ piece: 'waistband', from: [0, 0], to: [0, hh] }], b: [{ piece: 'waistband', from: [w, 0], to: [w, hh] }] });
  }
  const nb = by('neckband');
  if (nb) {
    const w = bbox(nb.seam).w, hh = bbox(nb.seam).h / 2; const a = Math.max(w / (2 * Math.PI), body.neckR + 16 + off);
    placed.push({ id: 'neckband', name: 'Neckband', pieceId: 'neckband', role: 'rib', seam: rect(0, 0, w, hh), fabric: fab('rib', nb), grainAngle: 0,
      map: q => { const th = Math.PI - (q[0] / w) * Math.PI * 2; return [a * Math.sin(th), body.y.neckBase - 22 + q[1], a * 1.05 * Math.cos(th) - 6]; } });
    const L1 = fm.side(1), L2 = fm.side(-1), B1 = bm.side(1), B2 = bm.side(-1);
    seams.push({ name: 'Neckband', a: [{ piece: 'neckband', from: [0, 0], to: [w, 0] }], b: [{ piece: 'back', from: bm.cn, to: B1.np }, { piece: 'front', from: L1.np, to: L2.np, via: fm.cn }, { piece: 'back', from: B2.np, to: bm.cn }] });
    seams.push({ name: 'Neckband join', a: [{ piece: 'neckband', from: [0, 0], to: [0, hh] }], b: [{ piece: 'neckband', from: [w, 0], to: [w, hh] }] });
  }
  const pk = by('pocket'); const attach: AttachSpec[] = [];
  if (pk) {
    // Kangaroo pocket: centred on the front, its lower edge 45 mm above the hem, sewn along the top
    // and bottom edges; the outer ends stay open as the hand openings.
    const P = unfold(pk); const pb = bbox(P.seam); const hw = (pb.x1 - pb.x0) / 2, ph = pb.h; const cx = (pb.x0 + pb.x1) / 2; const y0 = 45;
    const at = (q: Pt): Pt => [q[0] - cx, q[1] - pb.y0 + y0]; const fmap = placed[0].map;
    placed.push({ id: 'pocket', name: 'Kangaroo pocket', pieceId: 'pocket', role: 'pocket', seam: P.seam, fabric: fab(P.fabric, P), grainAngle: grainAngle(P),
      map: q => { const w = fmap(at(q)); const r = Math.hypot(w[0], w[2]) || 1; return [w[0] + w[0] / r * 8, w[1], w[2] + w[2] / r * 8]; } });
    const open = hw * 0.3;
    attach.push({ name: 'Pocket bottom', piece: 'pocket', from: [pb.x0, pb.y0], to: [pb.x1, pb.y0], target: 'front', at },
      { name: 'Pocket top', piece: 'pocket', from: [pb.x0 + open, pb.y1], to: [pb.x1 - open, pb.y1], target: 'front', at });
    if (2 * hw > 2 * fm.W) notes.push(`The kangaroo pocket (${Math.round(2 * hw / 10)} cm) is wider than the front (${Math.round(2 * fm.W / 10)} cm): it wraps past the side seams. Check the pocket draft.`);
  }
  return { placed, seams, attach, kind: 'garment', notes, needsBody: true };
}

/** Gathered elastic-waist skirt: front and back panels round the hips, side seams, elastic waist. */
function skirtRig(pattern: Pattern, body: Body, fab: FabricFor, off = 0): Rig {
  const pc = pattern.pieces.find(p => p.id === 'panel'); if (!pc) return looseRig(pattern, body, fab);
  const P = unfold(pc); const b = bbox(P.seam); const hw = b.x1, len = b.y1; const full = 4 * hw;
  const r = torsoAt(body, body.y.hip); const k = r.b / r.a; const a = Math.max(full / ellPerim(1, k), r.a + 30 + off); const el = ellipseWalker(a, a * k);
  const scale = el.perimeter / full; const yTop = body.y.waist + 20;
  const wrap = (back: boolean) => (q: Pt): V3 => { const th = el.theta(q[0] * scale); const [x, z] = el.at(back ? Math.PI - th : th); return [x, yTop - (len - q[1]), z + r.cz]; };
  const placed: PlacedPiece[] = [{ id: 'front', name: 'Skirt front', pieceId: 'panel', role: 'body', seam: P.seam, fabric: fab(P.fabric, P), grainAngle: grainAngle(P), map: wrap(false) },
    { id: 'back', name: 'Skirt back', pieceId: 'panel', role: 'body', seam: P.seam, fabric: fab(P.fabric, P), grainAngle: grainAngle(P), map: wrap(true) }];
  const seams: SeamSpec[] = [1, -1].map(s => ({ name: `Side seam ${s > 0 ? 'L' : 'R'}`, a: [{ piece: 'front', from: [s * hw, 0] as Pt, to: [s * hw, len] as Pt }], b: [{ piece: 'back', from: [s * hw, 0] as Pt, to: [s * hw, len] as Pt }] }));
  const elastic = pattern.finished.find(f => /elastic/i.test(f[0]))?.[1] ?? full * 0.6; const ratio = Math.min(1, elastic / full);
  const gathers: GatherSpec[] = ['front', 'back'].map(id => ({ name: `Waist elastic (${id})`, piece: id, from: [-hw, len] as Pt, to: [hw, len] as Pt, ratio, force: 10 }));
  return { placed, seams, gathers, kind: 'garment', notes: [], needsBody: true };
}

/** One-piece legs (leggings): each leg round its thigh and calf, inseam, front and back crotch, elastic waist. */
function leggingsRig(pattern: Pattern, body: Body, fab: FabricFor, off = 0): Rig {
  const leg = pattern.pieces.find(p => p.id === 'leg'); if (!leg) return looseRig(pattern, body, fab);
  const sm = leg.seam; const ha = Math.max(...sm.filter(q => q[1] < 0.5).map(q => q[0]));
  const crF = sm.reduce((a, q) => (q[0] < a[0] ? q : a)), crB = sm.reduce((a, q) => (q[0] > a[0] ? q : a)); const yc = (crF[1] + crB[1]) / 2;
  const top = sm.filter(q => q[1] > yc + 1); const wF = top.filter(q => q[0] < 0).reduce((a, q) => (q[1] > a[1] ? q : a)), wB = top.filter(q => q[0] > 0).reduce((a, q) => (q[1] > a[1] ? q : a));
  const hipF: Pt = leg.notches?.[0] ?? [crF[0] + 20, yc + 30], hipB: Pt = leg.notches?.[1] ?? [crB[0] - 20, yc + 30];
  const width = crB[0] - crF[0]; const placed: PlacedPiece[] = []; const seams: SeamSpec[] = []; const gathers: GatherSpec[] = [];
  const elastic = pattern.finished.find(f => /elastic/i.test(f[0]))?.[1] ?? width; const waistEdge = Math.hypot(wB[0] - wF[0], wB[1] - wF[1]);
  body.legs.forEach((lg, i) => {
    const s = i === 0 ? 1 : -1; const tag = s > 0 ? 'L' : 'R'; const d = lg.dir; const R = Math.max(width / (2 * Math.PI), lg.r + 14 + off);
    // Lateral (the leg's outer side, where the one-piece leg has no seam) and forward, both across the leg axis.
    const lat: V3 = (() => { const u: V3 = [s - d[0] * d[0] * s, -d[1] * d[0] * s, -d[2] * d[0] * s]; const l = Math.hypot(...u) || 1; return u.map(x => x / l) as V3; })();
    const fw0: V3 = [lat[1] * d[2] - lat[2] * d[1], lat[2] * d[0] - lat[0] * d[2], lat[0] * d[1] - lat[1] * d[0]]; const fw: V3 = fw0[2] >= 0 ? fw0 : [-fw0[0], -fw0[1], -fw0[2]];
    const id = `leg-${tag}`; const a0 = lg.r * 0.2;
    placed.push({ id, name: `Leg ${tag}`, pieceId: 'leg', role: 'body', seam: sm, fabric: fab(leg.fabric, leg), grainAngle: grainAngle(leg),
      map: q => { const ax = (yc - q[1]) + a0; const ph = -q[0] / R; const c = Math.cos(ph) * R, sn = Math.sin(ph) * R; return [lg.root[0] + d[0] * ax + lat[0] * c + fw[0] * sn, lg.root[1] + d[1] * ax + lat[1] * c + fw[1] * sn, lg.root[2] + d[2] * ax + lat[2] * c + fw[2] * sn]; } });
    seams.push({ name: `Inseam ${tag}`, a: [{ piece: id, from: [-ha, 0], to: crF }], b: [{ piece: id, from: [ha, 0], to: crB }] });
    gathers.push({ name: `Waist elastic ${tag}`, piece: id, from: wF, to: wB, ratio: Math.min(1, elastic / (2 * waistEdge)), force: 8 });
  });
  seams.push({ name: 'Front crotch', a: [{ piece: 'leg-L', from: crF, to: wF, via: hipF }], b: [{ piece: 'leg-R', from: crF, to: wF, via: hipF }] });
  seams.push({ name: 'Back crotch', a: [{ piece: 'leg-L', from: crB, to: wB, via: hipB }], b: [{ piece: 'leg-R', from: crB, to: wB, via: hipB }] });
  return { placed, seams, gathers, kind: 'garment', notes: [], needsBody: true };
}

/** Two-panel plush critter with a base: front and back sewn round the outline, base into the bottom. */
function plushPalRig(pattern: Pattern, fab: FabricFor): Rig {
  const fr = pattern.pieces.find(p => p.id === 'front'), bk = pattern.pieces.find(p => p.id === 'back'), base = pattern.pieces.find(p => p.id === 'base');
  if (!fr || !bk) return looseRig(pattern, null, fab);
  const gu = pattern.pieces.find(p => p.id === 'gusset'); if (gu) return gussetRig(pattern, fr, bk, gu, fab);
  const ys = Math.min(...fr.seam.map(p => p[1])); const bottom = fr.seam.filter(p => p[1] < ys + 0.6);
  const BL = bottom.reduce((a, p) => (p[0] < a[0] ? p : a)), BR = bottom.reduce((a, p) => (p[0] > a[0] ? p : a)); const top = fr.seam.reduce((a, p) => (p[1] > a[1] ? p : a));
  const H = bbox(fr.seam).h; const A = base ? bbox(base.seam).w / 2 : (BR[0] - BL[0]) / 2; const D = base ? bbox(base.seam).h / 2 : A * 0.6;
  const lift = 4, d = D + 6; const centre: V3 = [0, H * 0.42, 0];
  const placed: PlacedPiece[] = [
    { id: 'front', name: 'Front', pieceId: 'front', role: 'plush', seam: fr.seam, fabric: fab(fr.fabric, fr), grainAngle: grainAngle(fr), map: q => [q[0], q[1] - ys + lift, d], outwardFrom: centre },
    { id: 'back', name: 'Back', pieceId: 'back', role: 'plush', seam: bk.seam, fabric: fab(bk.fabric, bk), grainAngle: grainAngle(bk), map: q => [-q[0], q[1] - ys + lift, -d], outwardFrom: centre },
  ];
  const seams: SeamSpec[] = [{ name: 'Outline', a: [{ piece: 'front', from: BR, to: BL, via: top }], b: [{ piece: 'back', from: [-BR[0], BR[1]], to: [-BL[0], BL[1]], via: [-top[0], top[1]] }] }];
  if (base) {
    placed.push({ id: 'base', name: 'Base', pieceId: 'base', role: 'plush', seam: base.seam, fabric: fab(base.fabric, base), grainAngle: grainAngle(base), map: q => [q[0], lift, q[1]], outwardFrom: centre });
    seams.push({ name: 'Base front', a: [{ piece: 'front', from: BL, to: BR }], b: [{ piece: 'base', from: [-A, 0], to: [A, 0], via: [0, D] }] });
    seams.push({ name: 'Base back', a: [{ piece: 'back', from: [-BR[0], BR[1]], to: [-BL[0], BL[1]] }], b: [{ piece: 'base', from: [A, 0], to: [-A, 0], via: [0, -D] }] });
  }
  const litres = pattern.fill?.litres ?? 1;
  return { placed, seams, kind: 'plush', notes: pattern.pieces.some(p => p.id === 'ear-inner') ? ['Inner-ear appliqués are flat on the front; shown in 2D only.'] : [], pressure: { targetVolume: litres * 1e6 * 1.02, p0: 2500, planned: litres * 1e6 }, needsBody: false };
}

/** Plush with a side gusset: front and back a gusset-width apart, the strip wrapped round the outline from the bottom centre (front seam[0]). */
function gussetRig(pattern: Pattern, fr: Piece, bk: Piece, gu: Piece, fab: FabricFor): Rig {
  const S = fr.seam, n = S.length; const arc: number[] = [0]; for (let i = 1; i <= n; i++) arc.push(arc[i - 1] + Math.hypot(S[i % n][0] - S[i - 1][0], S[i % n][1] - S[i - 1][1]));
  const P = arc[n]; const gb = bbox(gu.seam); const G = gb.h, L = gb.w; const ys = Math.min(...S.map(p => p[1])); const lift = 4, d = G / 2 + 4; const H = bbox(S).h; const centre: V3 = [0, H * 0.42, 0];
  const at = (s: number): Pt => { const u = Math.max(0, Math.min(P, s * P / L)); let i = 1; while (i < n && arc[i] < u) i++; const f = (u - arc[i - 1]) / (arc[i] - arc[i - 1] || 1); const a = S[i - 1], b = S[i % n]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  const sAt = (f: number) => S[Math.min(n - 1, Math.round(f * n)) % n];
  const placed: PlacedPiece[] = [
    { id: 'front', name: 'Front', pieceId: 'front', role: 'plush', seam: S, fabric: fab(fr.fabric, fr), grainAngle: grainAngle(fr), map: q => [q[0], q[1] - ys + lift, d], outwardFrom: centre },
    { id: 'back', name: 'Back', pieceId: 'back', role: 'plush', seam: bk.seam, fabric: fab(bk.fabric, bk), grainAngle: grainAngle(bk), map: q => [-q[0], q[1] - ys + lift, -d], outwardFrom: centre },
    { id: 'gusset', name: 'Side gusset', pieceId: 'gusset', role: 'plush', seam: gu.seam, fabric: fab(gu.fabric, gu), grainAngle: grainAngle(gu), outwardFrom: centre,
      map: q => { const p = at(q[0]); return [p[0], p[1] - ys + lift, d - (q[1] / G) * 2 * d]; } },
  ];
  const m = (p: Pt): Pt => [-p[0], p[1]]; const half = Math.round(n / 2) % n;
  const seams: SeamSpec[] = [
    { name: 'Gusset front A', a: [{ piece: 'front', from: S[0], to: S[half], via: sAt(0.25) }], b: [{ piece: 'gusset', from: [0, 0], to: [L / 2, 0], via: [L / 4, 0] }] },
    { name: 'Gusset front B', a: [{ piece: 'front', from: S[half], to: S[0], via: sAt(0.75) }], b: [{ piece: 'gusset', from: [L / 2, 0], to: [L, 0], via: [3 * L / 4, 0] }] },
    { name: 'Gusset back A', a: [{ piece: 'back', from: m(S[0]), to: m(S[half]), via: m(sAt(0.25)) }], b: [{ piece: 'gusset', from: [0, G], to: [L / 2, G], via: [L / 4, G] }] },
    { name: 'Gusset back B', a: [{ piece: 'back', from: m(S[half]), to: m(S[0]), via: m(sAt(0.75)) }], b: [{ piece: 'gusset', from: [L / 2, G], to: [L, G], via: [3 * L / 4, G] }] },
    { name: 'Gusset join', a: [{ piece: 'gusset', from: [0, 0], to: [0, G] }], b: [{ piece: 'gusset', from: [L, 0], to: [L, G] }] },
  ];
  const litres = pattern.fill?.litres ?? 1;
  return { placed, seams, kind: 'plush', notes: [], pressure: { targetVolume: litres * 1e6 * 1.02, p0: 2500, planned: litres * 1e6 }, needsBody: false };
}

/** Plush ball: N gores laid on a sphere, each sewn to the next. */
function plushBallRig(pattern: Pattern, fab: FabricFor): Rig {
  const g = pattern.pieces[0]; const N = g.cut; const b = bbox(g.seam); const L = b.h; const R = L / Math.PI; const wmax = b.x1; const c: V3 = [0, R * 1.25 + 4, 0];
  const placed: PlacedPiece[] = []; const seams: SeamSpec[] = [];
  for (let i = 0; i < N; i++) {
    const lon0 = (i / N) * Math.PI * 2; const Rr = R * 1.18;
    placed.push({ id: `gore-${i}`, name: `Panel ${i + 1}`, pieceId: g.id, role: 'plush', seam: g.seam, fabric: fab(g.fabric, g), grainAngle: grainAngle(g), outwardFrom: c,
      map: q => { const lat = q[1] / R; const cl = Math.max(0.04, Math.cos(lat)); const lon = lon0 + q[0] / (R * cl); return [c[0] + Rr * cl * Math.sin(lon), c[1] + Rr * Math.sin(lat), c[2] + Rr * cl * Math.cos(lon)]; } });
  }
  for (let i = 0; i < N; i++) seams.push({ name: `Panel ${i + 1}–${((i + 1) % N) + 1}`, a: [{ piece: `gore-${i}`, from: [0, b.y0], to: [0, b.y1], via: [wmax, 0] }], b: [{ piece: `gore-${(i + 1) % N}`, from: [0, b.y0], to: [0, b.y1], via: [-wmax, 0] }] });
  return { placed, seams, kind: 'plush', notes: [], pressure: { targetVolume: (pattern.fill?.litres ?? 1) * 1e6 * 1.02, p0: 2500, planned: (pattern.fill?.litres ?? 1) * 1e6 }, needsBody: false };
}

/** Anything else (imported pieces, home goods): hang each piece flat round the body, unsewn. */
export function looseRig(pattern: Pattern, body: Body | null, fab: FabricFor): Rig {
  const pieces = pattern.pieces.map(unfold); const placed: PlacedPiece[] = []; const n = pieces.length;
  const Rr = body ? Math.max(...body.rings.map(r => r.a)) + 80 : 300; const yTop = body ? body.y.shoulder + 40 : 900;
  pieces.forEach((p, i) => { const b = bbox(p.seam); const th = (i / Math.max(1, n)) * Math.PI * 2; const cx = (b.x0 + b.x1) / 2;
    placed.push({ id: `${p.id}-${i}`, name: p.name, pieceId: p.id, role: 'other', seam: p.seam, fabric: fab(p.fabric, p), grainAngle: grainAngle(p),
      map: q => { const ang = th + (q[0] - cx) / Rr; return [Rr * Math.sin(ang), yTop - (b.y1 - q[1]), Rr * Math.cos(ang)]; } }); });
  return { placed, seams: [], kind: 'loose', notes: ['These pieces have no seam plan yet, so they hang unsewn to show the drape and fabric.'], needsBody: !!body };
}

export function rigFor(pattern: Pattern, body: Body, fab: FabricFor = (r, p) => (pattern.features.snug && r !== 'rib' ? fabricById('stretch-jersey')! : defaultFabric(r, pattern.kind) ?? defaultFabric(p.fabric, pattern.kind)), off = 0): Rig {
  if (pattern.template === 'plush-pal' || pattern.template === 'plush-drawing') return plushPalRig(pattern, fab);
  if (pattern.template === 'plush-ball') return plushBallRig(pattern, fab);
  if (pattern.template === 'skirt') return skirtRig(pattern, body, fab, off);
  if (pattern.template === 'leggings') return leggingsRig(pattern, body, fab, off);
  if (pattern.kind === 'apparel' && pattern.pieces.some(p => p.id === 'sleeve') && pattern.pieces.some(p => p.id === 'front')) return topRig(pattern, body, fab, off);
  return looseRig(pattern, body, fab);
}

/**
 * An outfit: several garments on one body, innermost first. Each garment's pieces start a little
 * further out (so layers begin in order) and carry their layer and garment index for the solver's
 * layer separation; ids and seams are prefixed so garments never sew to each other.
 */
export function outfitRig(patterns: Pattern[], body: Body, fab?: (garment: number) => FabricFor | undefined): Rig {
  const rigs = patterns.map((p, k) => rigFor(p, body, fab?.(k) ?? undefined, k * 16));
  if (rigs.length === 1) return { ...rigs[0], placed: rigs[0].placed.map(pp => ({ ...pp, layer: 0, garment: 0 })) };
  const pre = (k: number, id: string) => `g${k}:${id}`; const out: Rig = { placed: [], seams: [], gathers: [], kind: 'garment', notes: [], needsBody: true };
  rigs.forEach((r, k) => {
    out.placed.push(...r.placed.map(pp => ({ ...pp, id: pre(k, pp.id), layer: k, garment: k })));
    out.seams.push(...r.seams.map(sm => ({ ...sm, name: `${patterns[k].name}: ${sm.name}`, a: sm.a.map(x => ({ ...x, piece: pre(k, x.piece) })), b: sm.b.map(x => ({ ...x, piece: pre(k, x.piece) })) })));
    out.gathers!.push(...(r.gathers ?? []).map(g => ({ ...g, name: `${patterns[k].name}: ${g.name}`, piece: pre(k, g.piece) })));
    (out.attach ??= []).push(...(r.attach ?? []).map(a => ({ ...a, name: `${patterns[k].name}: ${a.name}`, piece: pre(k, a.piece), target: pre(k, a.target) })));
    out.notes.push(...r.notes.map(n => `${patterns[k].name}: ${n}`));
  });
  return out;
}
