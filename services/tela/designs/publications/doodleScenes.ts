// doodleScenes — the big line-art illustrations for "Doodle Day": colouring scenes,
// the cover cast, a mandala generator, and the half-pictures for draw-the-other-half.
// Unfilled outlines only (print-friendly). Thick weights for small hands, hairlines for big kids.
import type { TelaVectorObject } from '../../../../types';
import { rng } from '../../ornaments';
import type { Pt } from './kidsArtC';
import { circle } from '../../templateKit';
import { INK, ink, loop, open, circPts, ellPts, arcP, smooth, unionCircles, xf, icon, ring, dotInk, roundBox, type Sub } from './doodleKit';

type O = TelaVectorObject;

/** Height of a polyline curve at x (linear between samples). */
function yAt(curve: Pt[], x: number): number {
  for (let i = 1; i < curve.length; i++) if (x <= curve[i][0]) { const [x0, y0] = curve[i - 1], [x1, y1] = curve[i]; return y0 + (y1 - y0) * (x - x0) / Math.max(1e-6, x1 - x0); }
  return curve[curve.length - 1][1];
}
const smile = (cx: number, cy: number, w: number, depth: number): Pt[] => arcP(cx, cy - depth * .2, w / 2, depth, 25, 155, 12);
/** Face on a round body: two ink eyes and a smile. */
function faceOn(cx: number, cy: number, s: number, sw: number): O[] {
  return [dotInk(cx - s * .32, cy - s * .12, s * .09), dotInk(cx + s * .32, cy - s * .12, s * .09), ink([open(smile(cx, cy + s * .1, s * .6, s * .32))], sw, { label: 'Smile' })];
}

// ── butterfly + robot halves ──────────────────────────────────────────────────
/** Left half of a butterfly in axis-relative coordinates (x = 0 is the mirror line, y = 0 mid-body). */
export function butterflyHalf(): Sub[] {
  return [
    loop(smooth([[0, -8], [-30, -70], [-100, -150], [-190, -172], [-252, -122], [-236, -46], [-160, -8]], true, 7)),
    loop(smooth([[0, 10], [-170, 12], [-216, 70], [-192, 142], [-120, 152], [-52, 96]], true, 7)),
    loop(circPts(-168, -104, 30, 20)), loop(circPts(-96, -86, 15, 14)), loop(circPts(-138, 80, 24, 18)),
    open([[-6, -16], [-120, -112]]), open([[-6, 16], [-110, 86]]),
    open([[0, -100], [-14, -88], [-17, -40], [-14, 40], [-6, 100], [0, 110]]),
    open(arcP(0, -120, 17, 17, 270, 90, 10)),
    open(smooth([[-8, -135], [-36, -182], [-70, -200]], false, 6)), loop(circPts(-72, -202, 7, 10)),
  ];
}
/** Key points on the left half, for the 'dots to help' on the empty side. */
export const BUTTERFLY_GUIDES: Pt[] = [[-252, -122], [-190, -172], [-100, -150], [-236, -46], [-216, 70], [-192, 142], [-120, 152], [-168, -104], [-138, 80]];
export function robotHalf(): Sub[] {
  return [
    open([[0, -150], [-100, -150], [-120, -130], [-120, -30], [-100, -10], [0, -10]]),
    open([[0, -150], [0, -186]]), open(arcP(0, -200, 14, 14, 270, 90, 8)),
    loop([[-120, -104], [-144, -104], [-144, -58], [-120, -58]]),
    loop(circPts(-58, -92, 26, 20)), loop(circPts(-58, -92, 10, 10)),
    open([[-100, -44], [0, -44]]), open([[-100, -28], [0, -28]]), open([[-70, -44], [-70, -28]]), open([[-34, -44], [-34, -28]]),
    open([[-36, -10], [-36, 14]]),
    open([[0, 14], [-118, 14], [-138, 34], [-138, 142], [-118, 162], [0, 162]]),
    loop([[-98, 44], [0, 44], [0, 104], [-98, 104]].map(p => p as Pt)), loop(circPts(-70, 74, 10, 10)), loop(circPts(-30, 74, 10, 10)),
    loop([[-138, 50], [-194, 50], [-194, 122], [-138, 122]]), loop(circPts(-166, 140, 20, 14)),
    open([[-70, 162], [-70, 206], [-104, 206], [-104, 224]]), open([[-30, 162], [-30, 206]]),
  ];
}
export const ROBOT_GUIDES: Pt[] = [[-120, -130], [-120, -30], [-144, -104], [-144, -58], [-138, 34], [-194, 50], [-194, 122], [-104, 224], [-26, -10]];

/** Mirror a left-half sub-list to build the whole picture (used for the colouring butterfly). */
export const mirrorSubs = (subs: Sub[]): Sub[] => subs.map(s => ({ closed: s.closed, pts: s.pts.map(([x, y]) => [-x, y] as Pt) }));

// ── mandala ───────────────────────────────────────────────────────────────────
function lens(cx: number, cy: number, ang: number, r0: number, r1: number, hw: number): Pt[] {
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i <= 12; i++) { const u = i / 12, rr = r0 + (r1 - r0) * u, w = Math.sin(Math.PI * u) * hw; const nx = -Math.sin(ang), ny = Math.cos(ang); left.push([cx + rr * Math.cos(ang) + nx * w, cy + rr * Math.sin(ang) + ny * w]); right.push([cx + rr * Math.cos(ang) - nx * w, cy + rr * Math.sin(ang) - ny * w]); }
  return [...left, ...right.reverse()];
}
export function mandala(cx: number, cy: number, R: number, seed: number): O[] {
  const out: O[] = []; const r = rng(seed); const k = R / 340;
  // scalloped edge
  const N = 44; const sc: Sub[] = [];
  for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2; const mx = cx + R * .93 * Math.cos((a0 + a1) / 2), my = cy + R * .93 * Math.sin((a0 + a1) / 2); const rad = R * .93 * Math.sin(Math.PI / N); const am = (a0 + a1) / 2 * 180 / Math.PI; sc.push(open(arcP(mx, my, rad, rad, am - 90 - 180 + 180, am + 90, 8).map(p => p)));
    // arc bulging outward: from angle am-90 to am+90 through am
  }
  out.push(ink(sc, 3, { label: 'Mandala scallops' }));
  out.push(ring(cx, cy, R * .86, 2.5, 'Mandala ring'), ring(cx, cy, R * .8, 1.6, 'Mandala ring'));
  const bead: Array<[number, number, number]> = Array.from({ length: 56 }, (_, i) => [cx + R * .835 * Math.cos(i / 56 * Math.PI * 2), cy + R * .835 * Math.sin(i / 56 * Math.PI * 2), 3.2]);
  out.push(ink(bead.map(([x, y, rr]) => loop(circPts(x, y, rr, 8))), 1.6, { label: 'Mandala beads' }));
  const petals = (n: number, r0: number, r1: number, hw: number, phase: number, w: number, label: string) => ink(Array.from({ length: n }, (_, i) => loop(lens(cx, cy, phase + i / n * Math.PI * 2, r0 * k, r1 * k, hw * k))), w, { label });
  out.push(petals(22, 190, 285, 30, 0, 1.8, 'Outer petals'));
  out.push(petals(22, 140, 215, 22, Math.PI / 22, 1.6, 'Middle petals'));
  out.push(petals(16, 80, 165, 24, 0, 1.6, 'Inner petals'));
  // veins in the outer petals
  out.push(ink(Array.from({ length: 22 }, (_, i) => open([[cx + 200 * k * Math.cos(i / 22 * Math.PI * 2), cy + 200 * k * Math.sin(i / 22 * Math.PI * 2)], [cx + 270 * k * Math.cos(i / 22 * Math.PI * 2), cy + 270 * k * Math.sin(i / 22 * Math.PI * 2)]])), 1.2, { label: 'Petal veins' }));
  // star polygon {12/5}
  const sp: Pt[] = Array.from({ length: 12 }, (_, i) => [cx + 78 * k * Math.cos(i / 12 * Math.PI * 2), cy + 78 * k * Math.sin(i / 12 * Math.PI * 2)] as Pt);
  out.push(ink([loop(Array.from({ length: 12 }, (_, i) => sp[(i * 5) % 12]))], 1.6, { label: 'Mandala star' }));
  out.push(ring(cx, cy, 34 * k, 2, 'Mandala heart'), ring(cx, cy, 16 * k, 2, 'Mandala heart'));
  // small dots in the gaps (seeded)
  const dots: Sub[] = []; for (let i = 0; i < 22; i++) { const a = (i + .5) / 22 * Math.PI * 2 + Math.PI / 22 * 0; dots.push(loop(circPts(cx + 296 * k * Math.cos(a), cy + 296 * k * Math.sin(a), 4 + r() * 2.5, 8))); }
  out.push(ink(dots, 1.6, { label: 'Mandala dots' }));
  return out;
}

// ── colour scene 1: the garden ────────────────────────────────────────────────
export function gardenScene(seed: number): O[] {
  const r = rng(seed); const out: O[] = []; const W = 8;
  out.push(roundBox(40, 236, 736, 772, 30, 8, { label: 'Scene frame' }));
  // sun with a face
  const sx = 636, sy = 346; const rays: Sub[] = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; rays.push(open([[sx + 88 * Math.cos(a), sy + 88 * Math.sin(a)], [sx + (i % 2 ? 116 : 134) * Math.cos(a), sy + (i % 2 ? 116 : 134) * Math.sin(a)]])); }
  out.push(ink(rays, W, { label: 'Sun rays' }), ring(sx, sy, 68, W, 'Sun'), ...faceOn(sx, sy + 4, 120, 7), ring(sx - 48, sy + 6, 9, 4, 'Cheek'), ring(sx + 48, sy + 6, 9, 4, 'Cheek'));
  // clouds
  out.push(icon('cloud', 190, 336, 100, 0, W, false, true), icon('cloud', 430, 296, 72, 0, W, false, true));
  // birds
  out.push(ink([open([[300, 400], [318, 384], [336, 400]]), open([[336, 400], [354, 384], [372, 400]]), open([[430, 420], [444, 408], [458, 420]]), open([[458, 420], [472, 408], [486, 420]])], 6, { label: 'Birds' }));
  // hills (open curves, never crossing)
  const hillA = smooth([[40, 650], [200, 598], [380, 624], [560, 586], [776, 626]], false, 10);
  const hillB = smooth([[40, 776], [230, 722], [430, 760], [620, 710], [776, 742]], false, 10);
  const hillC = smooth([[40, 898], [260, 852], [500, 890], [776, 846]], false, 10);
  out.push(ink([open(hillA)], W, { label: 'Back hill' }), ink([open(hillB)], W, { label: 'Middle hill' }), ink([open(hillC)], W, { label: 'Front hill' }));
  // tree on the middle hill
  const tx = 150, ty = yAt(hillB, tx);
  out.push(ink([loop([[tx - 24, ty], [tx - 30, ty - 190], [tx + 30, ty - 190], [tx + 24, ty]]), open([[tx - 6, ty - 40], [tx - 6, ty - 90]]), open([[tx + 8, ty - 110], [tx + 8, ty - 150]])], W, { label: 'Tree trunk', fill: true }));
  const crown: Array<[number, number, number]> = [[tx - 62, ty - 236, 62], [tx + 4, ty - 296, 78], [tx + 74, ty - 232, 64], [tx + 4, ty - 206, 70]];
  out.push(ink([loop(unionCircles(crown, 40))], W, { label: 'Tree crown', fill: true }), ...[[tx - 56, ty - 240], [tx + 34, ty - 280], [tx + 60, ty - 214], [tx - 12, ty - 200]].map(([x, y]) => ring(x, y, 17, 6, 'Apple')));
  // flowers on the front hill
  const fl = [[330, 188], [520, 232], [690, 176]] as Array<[number, number]>;
  fl.forEach(([x, h], i) => {
    const by = yAt(hillC, x);
    out.push(ink([open(smooth([[x, by], [x + (i % 2 ? 10 : -10), by - h * .5], [x, by - h]], false, 8))], W, { label: 'Stem' }), icon('leaf', x + (i % 2 ? -34 : 34), by - h * .38, 30, i % 2 ? 30 : -30, 6), icon('flower', x, by - h - 26, 66, i * 17, W, false, true));
  });
  // tulip
  const tux = 440, tuy = yAt(hillC, tux);
  out.push(ink([open([[tux, tuy], [tux, tuy - 110]]), loop([[tux - 30, tuy - 190], [tux - 30, tuy - 130], [tux, tuy - 108], [tux + 30, tuy - 130], [tux + 30, tuy - 190], [tux + 14, tuy - 164], [tux, tuy - 190], [tux - 14, tuy - 164]])], W, { label: 'Tulip', fill: true }));
  // bee with a flight trail
  out.push(icon('bee', 360, 506, 52, -10, W, false, true), ink([open(smooth([[300, 560], [250, 520], [280, 470], [236, 440]], false, 8))], 7, { dash: [2, 16], label: 'Flight trail' }));
  // butterfly
  const bf = butterflyHalf(); out.push(ink(xf([...bf, ...mirrorSubs(bf)], 580, 482, .28, 12), 6, { label: 'Butterfly', fill: true }));
  // ladybug on the front hill
  const lx = 230, ly = yAt(hillC, lx) + 70;
  out.push(circle(lx, ly, 52, '#FFFFFF', { stroke: INK, strokeWidth: W, label: 'Ladybug' }), ink([open([[lx, ly - 52], [lx, ly + 52]])], 6, { label: 'Ladybug wing line' }), ...[[-26, -14], [22, -20], [-24, 22], [26, 20]].map(([dx, dy]) => ring(lx + dx, ly + dy, 9, 5, 'Spot')), ink([open(arcP(lx, ly - 52, 22, 20, 180, 360, 10))], 6, { label: 'Ladybug head' }), ink([open(smooth([[lx - 10, ly - 70], [lx - 24, ly - 92]], false, 4)), open(smooth([[lx + 10, ly - 70], [lx + 24, ly - 92]], false, 4))], 5, { label: 'Antennae' }));
  // grass tufts
  const tufts: Sub[] = []; for (let i = 0; i < 12; i++) { const gx = 70 + i * 62 + r() * 26; const gy = yAt(hillC, gx) + 40 + r() * 70; if (Math.hypot(gx - lx, gy - ly) < 90) continue; tufts.push(open([[gx - 12, gy], [gx - 6, gy - 22]]), open([[gx, gy], [gx, gy - 28]]), open([[gx + 12, gy], [gx + 6, gy - 22]])); }
  out.push(ink(tufts, 6, { label: 'Grass tufts' }));
  return out;
}

// ── colour scene 2: the friendly octopus ──────────────────────────────────────
export function octopusScene(seed: number): O[] {
  const r = rng(seed); const out: O[] = []; const W = 7;
  out.push(roundBox(40, 236, 736, 772, 30, 8, { label: 'Scene frame' }));
  // waves across the top of the water
  out.push(ink([open(Array.from({ length: 60 }, (_, i) => [56 + i / 59 * 704, 280 + Math.sin(i / 59 * Math.PI * 9) * 11] as Pt)), open(Array.from({ length: 60 }, (_, i) => [56 + i / 59 * 704, 318 + Math.sin(i / 59 * Math.PI * 9 + 1.6) * 9] as Pt))], 5, { label: 'Waves' }));
  const cx = 408, cy = 560, hr = 150;
  // tentacles (tapered ribbons): outer ones first, inner ones on top with a white fill so they hide what they cross
  const order = [0, 7, 1, 6, 2, 5, 3, 4];
  const tentObjs: O[] = []; const suckers: Sub[] = [];
  for (const i of order) {
    const t0 = (i - 3.5) / 3.5; const x0 = cx + t0 * hr * .85, y0 = cy + hr * .6; const dir = t0 < 0 ? -1 : 1;
    const L = 250 + (1 - Math.abs(t0)) * 30, left: Pt[] = [], right: Pt[] = []; const reach = 40 + Math.abs(t0) * 150;
    const centre = (u: number): Pt => [x0 + dir * u * reach + Math.sin(u * Math.PI * 2.4 + i * 1.3) * 22 * u, y0 + u * L];
    for (let s2 = 0; s2 <= 22; s2++) {
      const u = s2 / 22; const [px, py] = centre(u); const [qx, qy] = centre(Math.min(1, u + .04));
      let dx = qx - px, dy = qy - py; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl; const w = 24 * (1 - u) + 6;
      left.push([px - dy * w, py + dx * w]); right.push([px + dy * w, py - dx * w]);
      if (s2 % 3 === 1 && u < .85) suckers.push(loop(circPts(px, py, 3 + 4 * (1 - u), 8)));
    }
    tentObjs.push(ink([loop([...left, ...right.reverse()])], W, { label: 'Tentacle', fill: true }));
  }
  out.push(...tentObjs, ink(suckers, 3, { label: 'Suckers' }));
  // head
  out.push(ink([loop(unionCircles([[cx, cy - 40, hr], [cx - 60, cy + 40, 90], [cx + 60, cy + 40, 90]], 60))], W + 1, { label: 'Octopus head', fill: true }));
  out.push(ring(cx - 62, cy - 40, 44, 6, 'Eye'), ring(cx + 62, cy - 40, 44, 6, 'Eye'), dotInk(cx - 54, cy - 36, 18), dotInk(cx + 70, cy - 36, 18), ring(cx - 44, cy - 54, 6, 3, 'Eye shine'), ring(cx + 80, cy - 54, 6, 3, 'Eye shine'));
  out.push(ink([open(arcP(cx, cy + 12, 60, 50, 20, 160, 14))], 7, { label: 'Big smile' }), ring(cx - 108, cy + 14, 16, 4, 'Cheek'), ring(cx + 108, cy + 14, 16, 4, 'Cheek'));
  // head spots
  out.push(...[[cx - 20, cy - 150, 15], [cx + 36, cy - 134, 11], [cx + 4, cy - 100, 8], [cx - 66, cy - 120, 10]].map(([x, y, rr]) => ring(x, y, rr, 5, 'Spot')));
  // bubbles scattered, none overlapping the octopus (seeded)
  const bubs: Sub[] = []; let tries = 0; const placed: Array<[number, number, number]> = [];
  while (placed.length < 10 && tries++ < 600) { const rr = 12 + r() * 18; const x = 80 + r() * 620, y = 350 + r() * 290; if (Math.hypot(x - cx, y - (cy - 20)) < hr + rr + 28) continue; if (y > 600 && Math.abs(x - cx) < 330) continue; if (placed.some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + rr + 14)) continue; placed.push([x, y, rr]); }
  placed.forEach(([x, y, rr]) => { bubs.push(loop(circPts(x, y, rr, 20)), open(arcP(x, y, rr * .6, rr * .6, 200, 260, 6))); });
  out.push(ink(bubs, 5, { label: 'Bubbles' }));
  // fish, seaweed, shells
  out.push(icon('fish', 150, 450, 50, -8, W), icon('fish', 668, 410, 40, 6, W, true));
  out.push(ink([open(smooth([[100, 1000], [84, 940], [112, 890], [90, 840]], false, 8)), open(smooth([[140, 1000], [158, 950], [132, 900], [150, 870]], false, 8)), open(smooth([[690, 1000], [706, 940], [680, 890], [700, 850]], false, 8))], 8, { label: 'Seaweed' }));
  out.push(ink([loop([[330, 1000], [345, 960], [372, 944], [399, 960], [414, 1000]]), open([[372, 1000], [372, 948]]), open([[352, 1000], [359, 954]]), open([[392, 1000], [385, 954]])], 6, { label: 'Shell' }), icon('star', 600, 970, 36, 12, 6), icon('star', 250, 960, 26, -10, 5));
  return out;
}

// ── the cover cast ────────────────────────────────────────────────────────────
export function catFace(cx: number, cy: number, s: number): O[] {
  const out: O[] = [];
  out.push(ink([loop(ellPts(cx, cy, 150 * s, 122 * s, 40)), loop([[cx - 128 * s, cy - 70 * s], [cx - 112 * s, cy - 172 * s], [cx - 40 * s, cy - 112 * s]]), loop([[cx + 128 * s, cy - 70 * s], [cx + 112 * s, cy - 172 * s], [cx + 40 * s, cy - 112 * s]])], 8, { label: 'Cat head' }));
  out.push(ink([loop([[cx - 106 * s, cy - 100 * s], [cx - 100 * s, cy - 140 * s], [cx - 66 * s, cy - 112 * s]]), loop([[cx + 106 * s, cy - 100 * s], [cx + 100 * s, cy - 140 * s], [cx + 66 * s, cy - 112 * s]])], 5, { label: 'Inner ears' }));
  out.push(ring(cx - 54 * s, cy - 18 * s, 30 * s, 7, 'Eye'), ring(cx + 54 * s, cy - 18 * s, 30 * s, 7, 'Eye'), dotInk(cx - 48 * s, cy - 14 * s, 13 * s), dotInk(cx + 60 * s, cy - 14 * s, 13 * s));
  out.push(ink([loop([[cx - 14 * s, cy + 30 * s], [cx + 14 * s, cy + 30 * s], [cx, cy + 46 * s]]), open([[cx, cy + 46 * s], [cx, cy + 62 * s]]), open(arcP(cx - 24 * s, cy + 62 * s, 24 * s, 16 * s, 0, 160, 8)), open(arcP(cx + 24 * s, cy + 62 * s, 24 * s, 16 * s, 20, 180, 8))], 6, { label: 'Cat nose and mouth' }));
  out.push(ink([open([[cx - 96 * s, cy + 30 * s], [cx - 170 * s, cy + 14 * s]]), open([[cx - 96 * s, cy + 50 * s], [cx - 172 * s, cy + 56 * s]]), open([[cx + 96 * s, cy + 30 * s], [cx + 170 * s, cy + 14 * s]]), open([[cx + 96 * s, cy + 50 * s], [cx + 172 * s, cy + 56 * s]]), open([[cx - 14 * s, cy - 120 * s], [cx - 10 * s, cy - 84 * s]]), open([[cx, cy - 122 * s], [cx, cy - 78 * s]]), open([[cx + 14 * s, cy - 120 * s], [cx + 10 * s, cy - 84 * s]])], 4, { label: 'Whiskers and stripes' }));
  return out;
}
export function pencil(cx: number, cy: number, rot: number): O[] {
  const L = 420; const body: Sub[] = [
    loop([[-L / 2, -34], [L / 2 - 120, -34], [L / 2 - 120, 34], [-L / 2, 34]]),
    loop([[L / 2 - 120, -34], [L / 2, 0], [L / 2 - 120, 34]]), loop([[L / 2 - 52, -14], [L / 2, 0], [L / 2 - 52, 14]]),
    open([[-L / 2 + 70, -34], [-L / 2 + 70, 34]]), open([[-L / 2 + 92, -34], [-L / 2 + 92, 34]]),
    loop([[-L / 2 - 66, -34], [-L / 2, -34], [-L / 2, 34], [-L / 2 - 66, 34]]),
    open([[L / 2 - 200, -34], [L / 2 - 200, 34]]),
  ];
  return [ink(xf(body, cx, cy, 1, rot), 7, { label: 'Giant pencil' })];
}
