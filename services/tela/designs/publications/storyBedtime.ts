// storyBedtime — "Moon Blanket": a FELT & STITCHED TEXTILE picture book, ages 2-4, PORTRAIT 8 x 10 in (768 x 960 px).
//
// Medium (docs/tela/CHILDRENS_BOOK_ART_DIRECTION.md v3): appliqué felt pieces with a fuzzy fringe, visible
// running-stitch thread, button eyes with thread crosses, fibre flecks, soft stacked shadows on a quilted
// linen ground, chunky satin-stitch lettering, and a candle of yellow felt with a blurred halo. Palette: rich
// indigo, burgundy, mustard, cream, teal and rose felt (muted-warm, never grey).
//
// THE STORY IS DATA: the words, page count and page order come from data/showcase/books/moonBlanket.ts (spread n = pageIndex + 1);
// each spread's `beat` picks the layout family. Characters follow the locked Character Bible in that file:
//   BRAMBLE  small round honey-brown bear (#C98B4B), cream muzzle and tummy, left ear patched in mustard felt, black button eyes with a thread cross.
//   FLIT     tiny ember-orange moth (#F28C28) stitched with cream spots, plum antennae, tiny black button eyes.
//   THE MOON big cream felt moon (#FBEFC6), closed sleepy eyes, rosy cheeks, soft smile that grows a little on every page.
// Text is sized and wrapped with real font metrics (bookText.ts); a page that cannot fit its words throws instead of truncating.
import { rect } from '../../templateKit';
import {
  type O, type Pt, FT, felt, stitchLine, thread, button, embroTitle, stitchedText, quiltGround, feltVignette, halo,
} from './feltKit';
import { rn, roundRectPts, bevel, bumpy, starPts, blob, strokesPath } from './paintKit';
import { rad } from './kidsArtB';
import { mix, circle } from '../../templateKit';
import { fitParas } from './bookText';
import type { ShowcaseBook, ShowcaseSpread } from '../../../../data/showcase/types';

const W = 768, H = 960;
const PI = Math.PI;
const artSlot = (x: number, y: number, w: number, h: number, label: string): O => rect(x, y, w, h, 'rgba(255,255,255,0)', { rx: 24, label, role: 'IMAGE_SLOT', opacity: .01 });
const disc = (cx: number, cy: number, r: number, seed = 1, n = 22): Pt[] => blob(cx, cy, r, r, seed, .012, n);
const ov = (cx: number, cy: number, rx: number, ry: number, seed = 1, rot = 0, n = 20): Pt[] => blob(cx, cy, rx, ry, seed, .012, n, rot);
const P = (cx: number, cy: number, s: number, a: Array<[number, number]>): Pt[] => a.map(([u, v]) => [cx + u * s, cy + v * s] as Pt);

/** Locked looks from the Character Bible (data/showcase/books/moonBlanket.ts). */
const BR = { fur: '#C98B4B', cream: '#F3E2C0', patch: '#E0A82E', eye: '#1B1530' };
const FL = { wing: '#F28C28', spot: '#FFF1D0', plum: '#6B2D5C', plumL: '#8A4378' };
const MOON = '#FBEFC6', CHEEK = '#F4A6A0';

// ── Appliqué motifs ──────────────────────────────────────────────────────────
const star = (cx: number, cy: number, s: number, color: string, seed: number, o: { lite?: boolean; rot?: number } = {}): O[] =>
  felt(starPts(cx, cy, s, s * .52, 5, o.rot ?? -90).map(p => p), color, seed, { lite: o.lite ?? true, lift: 3, inset: Math.max(4, s * .16), stitch: FT.thread, label: 'Felt star' });
const flamePts = (cx: number, cy: number, s: number): Pt[] => P(cx, cy, s, [[0, -1.15], [.3, -.5], [.5, .1], [.38, .7], [0, .95], [-.38, .7], [-.5, .1], [-.3, -.5]]);

/** Bramble: the honey-brown felt bear. S = head radius. Same drawing on every page; only the mood changes. */
function bear(cx: number, cy: number, S: number, o: { mood?: 'awake' | 'sleepy' | 'wow' | 'asleep' | 'happy'; body?: boolean; look?: number; seed?: number; lift?: number } = {}): O[] {
  const sd = o.seed ?? 3, mood = o.mood ?? 'awake', lift = o.lift ?? Math.max(3, S * .05); const out: O[] = [];
  const fur = BR.fur, thr = mix(fur, -.38);
  if (o.body !== false) {
    out.push(...felt(ov(cx, cy + S * 1.5, S * .95, S * 1.05, sd + 1), mix(fur, -.04), sd + 1, { lift, stitch: thr, inset: S * .1, label: 'Bear body' }));
    out.push(...felt(ov(cx, cy + S * 1.62, S * .52, S * .62, sd + 2), BR.cream, sd + 2, { lite: true, lift: 1, stitch: mix(BR.cream, -.3), inset: S * .07, label: 'Bear tummy' }));
    for (const sd2 of [-1, 1]) out.push(...felt(ov(cx + sd2 * S * .86, cy + S * 1.15, S * .26, S * .36, sd + 3 + sd2, sd2 * 20), fur, sd + 3, { lite: true, lift: 2, stitch: thr, inset: S * .06, label: 'Bear arm' }));
  }
  for (const sd2 of [-1, 1]) {
    out.push(...felt(disc(cx + sd2 * S * .72, cy - S * .72, S * .36, sd + 4 + sd2), fur, sd + 4, { lite: true, lift: 3, stitch: thr, inset: S * .07, label: 'Bear ear' }));
    if (sd2 === -1) out.push(...felt(roundRectPts(cx - S * .72 - S * .2, cy - S * .72 - S * .18, S * .4, S * .36, S * .09, sd + 5), BR.patch, sd + 5, { lite: true, lift: 1, stitch: FT.thread, inset: S * .05, dash: [Math.max(4, S * .05), Math.max(3, S * .04)], label: 'Mustard ear patch (felt)' }));
    else out.push(...felt(disc(cx + sd2 * S * .72, cy - S * .7, S * .2, sd + 5), mix(fur, .22), sd + 5, { lite: true, lift: 0, stitch: false, fuzz: .6, label: 'Bear inner ear' }));
  }
  out.push(...felt(ov(cx, cy, S, S * .93, sd, 0, 24), fur, sd, { lift, stitch: thr, inset: S * .09, label: 'Bear head' }));
  out.push(...felt(ov(cx, cy + S * .34, S * .5, S * .38, sd + 6), BR.cream, sd + 6, { lite: true, lift: 2, stitch: mix(BR.cream, -.3), inset: S * .07, label: 'Bear muzzle' }));
  out.push(...felt(ov(cx, cy + S * .17, S * .17, S * .12, sd + 7), FT.burgundyD, sd + 7, { lite: true, lift: 0, stitch: false, fuzz: .5, label: 'Bear nose' }));
  for (const sd2 of [-1, 1]) out.push(...felt(disc(cx + sd2 * S * .62, cy + S * .27, S * .15, sd + 8), FT.rose, sd + 8, { lite: true, lift: 0, stitch: false, fuzz: .5, opacity: .9, label: 'Bear cheek' }));
  const ey = cy - S * .17, ex = S * .4, lk = o.look ?? 0;
  if (mood === 'asleep') for (const sd2 of [-1, 1]) out.push(...thread(P(cx + sd2 * ex, ey, S, [[-.17, -.01], [0, .12], [.17, -.01]]), BR.eye, Math.max(3, S * .05), 'Sewn closed eye'));
  else {
    const br = S * (mood === 'wow' ? .2 : .16);
    for (const sd2 of [-1, 1]) out.push(...button(cx + sd2 * ex + lk * S * .03, ey, br, BR.eye, FT.thread, sd));
    if (mood === 'sleepy') for (const sd2 of [-1, 1]) {
      const bx = cx + sd2 * ex, rr = br * 1.18; const lid: Pt[] = []; for (let k = 0; k <= 10; k++) { const a = PI + k / 10 * PI; lid.push([bx + Math.cos(a) * rr, ey - br * .05 + Math.sin(a) * rr * .95]); }
      out.push(...felt(lid, fur, sd + 11, { lite: true, lift: 0, stitch: false, fuzz: .3, label: 'Heavy eyelid (felt)' }), ...thread([[bx - rr, ey - br * .05], [bx, ey - br * .05 + rr * .12], [bx + rr, ey - br * .05]], thr, Math.max(2.4, S * .035), 'Lid stitch'));
    }
  }
  out.push(...thread(P(cx, cy, S, [[0, .22], [0, .34]]), FT.burgundyD, Math.max(2.4, S * .035), 'Mouth stem'));
  if (mood === 'wow') out.push(...felt(ov(cx, cy + S * .5, S * .13, S * .1, sd + 9), FT.burgundyD, sd + 9, { lite: true, lift: 0, stitch: false, fuzz: .4, label: 'Open mouth' }));
  else out.push(...thread(P(cx, cy, S, [[-.2, .36], [-.1, .46], [0, .34], [.1, .46], [.2, .36]]), FT.burgundyD, Math.max(2.4, S * .035), 'Stitched smile'));
  return out;
}

/** Flit: the tiny ember-orange moth with cream spots and plum feathery antennae. S = half the wing-span. */
function moth(cx: number, cy: number, S: number, o: { rot?: number; seed?: number; lite?: boolean; big?: boolean; tear?: boolean } = {}): O[] {
  const sd = o.seed ?? 5, rot = (o.rot ?? 0) * PI / 180, c = Math.cos(rot), s = Math.sin(rot); const out: O[] = []; const lite = o.lite ?? S < 40;
  const R = (u: number, v: number): Pt => [cx + (u * c - v * s) * S, cy + (u * s + v * c) * S];
  const wing = (u: number, v: number, rx: number, ry: number, ang: number, col: string, sdx: number): O[] => { const [x, y] = R(u, v); return felt(ov(x, y, rx * S, ry * S, sd + sdx, ang + (o.rot ?? 0), 18), col, sd + sdx, { lite, lift: Math.max(2, S * .06), stitch: FT.thread, inset: Math.max(3.5, S * .1), label: 'Moth wing' }); };
  const low = mix(FL.wing, -.1);
  out.push(...wing(-.52, .36, .5, .34, 24, low, 3), ...wing(.52, .36, .5, .34, -24, low, 4), ...wing(-.74, -.3, .76, .48, -26, FL.wing, 1), ...wing(.74, -.3, .76, .48, 26, FL.wing, 2));
  const spots: Array<[number, number, number]> = [[.5, -.42, .1], [.82, -.18, .12], [1.08, -.42, .08], [.5, .4, .09]];
  for (const sx of [-1, 1]) for (const [u, v, rr] of spots) { const [x, y] = R(sx * u, v); out.push(...felt(disc(x, y, Math.max(1.6, rr * S), sd + 5 + Math.round(u * 10)), FL.spot, sd + 5, { lite: true, lift: 0, stitch: false, fuzz: .5, label: 'Cream wing spot' })); }
  const [bx, by] = R(0, .06); out.push(...felt(ov(bx, by, S * .13, S * .46, sd + 7, o.rot ?? 0, 14), FL.plum, sd + 7, { lite: true, lift: Math.max(1.5, S * .04), stitch: false, label: 'Moth body' }));
  const hr = o.big ? .2 : .15; const [hx, hy] = R(0, -.46);
  out.push(...felt(disc(hx, hy, hr * S, sd + 8, 16), FL.plumL, sd + 8, { lite: true, lift: Math.max(1.2, S * .03), stitch: false, label: 'Moth head' }));
  const eyeAt = (sg: number): Pt => R(sg * hr * .5, -.48);
  for (const sg of [-1, 1]) { const [ex, ey] = eyeAt(sg); if (o.big) out.push(...button(ex, ey, S * .052, BR.eye, FT.thread, sd)); else out.push(circle(ex, ey, Math.max(1.7, S * .042), BR.eye, { label: 'Moth button eye' })); }
  if (o.tear) { const [tx, ty] = R(.09, -.4); out.push(...felt(P(tx, ty, S, [[0, -.05], [.03, 0], [.035, .04], [0, .07], [-.035, .04], [-.03, 0]]), '#8FD3F2', sd + 20, { lite: true, lift: 1, stitch: FT.thread, inset: 2.5, label: 'Stitched tear (felt)' })); }
  const barbs: Array<[number, number, number, number]> = [];
  for (const sg of [-1, 1]) {
    const cv: Pt[] = [R(sg * .04, -.58), R(sg * .18, -.8), R(sg * .34, -.92), R(sg * .48, -.86)];
    out.push(...thread(cv, FL.plum, Math.max(1.8, S * .04), 'Moth antenna'));
    for (const [pa, pb] of [[0, 1], [1, 2], [2, 3]]) { const m: Pt = [(cv[pa][0] + cv[pb][0]) / 2, (cv[pa][1] + cv[pb][1]) / 2]; barbs.push([m[0], m[1], m[0] - S * .05 * c + S * .02, m[1] - S * .09]); barbs.push([m[0], m[1], m[0] + S * .07, m[1] - S * .04]); }
  }
  const bb = strokesPath(barbs, FL.plum, Math.max(1.2, S * .022), { label: 'Feathery antenna barbs' }); if (bb) out.push(bb);
  return out;
}

/** The candle: yellow felt wax, a felt flame and a big blurred halo. */
function candle(cx: number, baseY: number, sc: number, o: { halo?: number; lit?: boolean } = {}): O[] {
  const out: O[] = []; const ww = 74 * sc, wh = 150 * sc; const lit = o.lit !== false;
  if (lit) out.push(halo(cx, baseY - wh - 20 * sc, o.halo ?? 280 * sc, '#FFD24A', .85, 'Candle halo'), halo(cx, baseY - wh - 20 * sc, (o.halo ?? 280 * sc) * .38, '#FFF2B8', .9, 'Candle halo core'));
  out.push(...felt(ov(cx, baseY - 14 * sc, ww * .95, 24 * sc, 5), FT.teal, 5, { lift: 5 * sc, stitch: FT.thread, inset: 6 * sc, label: 'Candle dish' }));
  out.push(...felt(roundRectPts(cx - ww / 2, baseY - 26 * sc - wh, ww, wh, 16 * sc, 3, .8), FT.yellow, 6, { lift: 6 * sc, stitch: mix(FT.yellow, -.35), inset: 8 * sc, label: 'Candle wax (yellow felt)' }));
  out.push(...felt(P(cx - ww * .1, baseY - 26 * sc - wh + 10 * sc, 1, [[-ww * .4, 0], [ww * .3, 0], [ww * .35, 22 * sc], [ww * .12, 40 * sc], [-ww * .1, 24 * sc], [-ww * .3, 36 * sc]]), FT.cream, 8, { lite: true, lift: 1, stitch: false, fuzz: .6, label: 'Wax drip' }));
  out.push(...thread([[cx, baseY - 26 * sc - wh], [cx, baseY - 36 * sc - wh]], FT.night, 3 * sc, 'Wick'));
  if (lit) {
    out.push(...felt(flamePts(cx, baseY - 26 * sc - wh - 38 * sc, 34 * sc), FT.coral, 9, { lite: true, lift: 0, stitch: false, label: 'Flame (felt)' }));
    out.push(...felt(flamePts(cx, baseY - 26 * sc - wh - 30 * sc, 19 * sc), FT.yellow, 10, { lite: true, lift: 0, stitch: false, fuzz: .5, label: 'Flame core (felt)' }));
  }
  return out;
}

/** The Moon: big cream felt moon, closed sleepy eyes, rosy cheeks. `smile` scales the smile (it grows a little on every page). */
function moon(cx: number, cy: number, r: number, o: { face?: 'sleepy' | 'none'; seed?: number; craters?: boolean; smile?: number } = {}): O[] {
  const sd = o.seed ?? 2; const out: O[] = [];
  out.push(halo(cx, cy, r * 1.5, '#FFE9A8', .35, 'Moon halo'));
  out.push(...felt(disc(cx, cy, r, sd, 30), MOON, sd, { lift: r * .035, stitch: FT.mustard, inset: r * .06, dash: [Math.max(7, r * .06), Math.max(6, r * .05)], thread: Math.max(2.4, r * .02), label: 'Moon' }));
  if (o.craters !== false) { [[-.38, -.3, .2], [.34, -.42, .13], [.1, .42, .24], [-.55, .28, .1], [.55, .15, .09]].forEach(([dx, dy, rr], i) => out.push(...felt(disc(cx + dx * r, cy + dy * r, rr * r, sd + 10 + i, 16), FT.creamD, sd + 10 + i, { lite: true, lift: 0, stitch: false, fuzz: .7, label: 'Moon crater' }))); }
  if ((o.face ?? 'sleepy') === 'sleepy') {
    const k = o.smile ?? 1;
    for (const sg of [-1, 1]) out.push(...thread(P(cx + sg * r * .32, cy - r * .05, r, [[-.14, 0], [0, .09], [.14, 0]]), FT.burgundyD, Math.max(3.4, r * .03), 'Sewn closed eye'));
    out.push(...thread(P(cx, cy + r * .2, r, [[-.12 * k, 0], [0, .08 * k], [.12 * k, 0]]), FT.burgundyD, Math.max(3, r * .028), 'Moon smile'));
    for (const sg of [-1, 1]) out.push(...felt(disc(cx + sg * r * .5, cy + r * .17, r * .1, sd + 3), CHEEK, sd + 3, { lite: true, lift: 0, stitch: false, fuzz: .6, label: 'Moon cheek' }));
  }
  return out;
}

/** A felt window onto the night with the moon in it. */
function windowPane(cx: number, cy: number, w: number, h: number, moonR: number, smile: number, seed: number): O[] {
  const out: O[] = [];
  out.push(...felt(roundRectPts(cx - w / 2 - 14, cy - h / 2 - 14, w + 28, h + 28, 30, seed, 1), FT.burgundy, seed, { lift: 8, stitch: FT.thread, inset: 8, label: 'Window frame (felt)' }));
  out.push(...felt(roundRectPts(cx - w / 2, cy - h / 2, w, h, 20, seed + 1, 1), FT.night, seed + 1, { lite: true, lift: 0, stitch: false, label: 'Night pane' }));
  out.push(...moon(cx, cy, moonR, { face: 'sleepy', seed: seed + 2, smile }));
  return out;
}

/** A patch of felt that carries the read-aloud text; the text is sewn in thread, the patch has a stitched border. Sized from real font metrics: never clipped. */
function patch(cx: number, cy: number, str: string, o: { maxW: number; maxH: number; max?: number; min?: number; fill?: string; ink?: string; stitch?: string; seed?: number; padX?: number; padY?: number; size?: number }): O[] {
  const padX = o.padX ?? 70, padY = o.padY ?? 52; const sd = o.seed ?? 2;
  const f = fitParas(str, 'sniglet', o.maxW - padX, o.maxH - padY, { max: o.size ?? o.max ?? 44, min: o.size ?? o.min ?? 24, leading: 1.28, gapEm: 0, oneLineAtLeast: o.size ? undefined : 30 });
  const w = f.w + padX, h = f.h + padY;
  const piece = felt(roundRectPts(cx - w / 2, cy - h / 2, w, h, Math.min(34, h / 2.4), sd, 1.2), o.fill ?? FT.cream, sd, { lift: 6, stitch: o.stitch ?? FT.burgundy, inset: 10, label: 'Text patch (felt)' });
  const t = stitchedText(cx - f.w / 2 - 6, cy - f.h / 2 + f.size * .06, f.w + 12, f.paras.flat().join('\n'), f.size, o.ink ?? FT.navy, { align: 'center' });
  return [...piece, t];
}
/** Bare satin-stitched story text on the ground (no patch): for the quiet pages. */
function sewnText(cx: number, top: number, str: string, o: { maxW: number; maxH: number; max: number; min?: number; color: string }): O {
  const f = fitParas(str, 'sniglet', o.maxW, o.maxH, { max: o.max, min: o.min ?? 24, leading: 1.28, gapEm: 0 });
  return stitchedText(cx - f.w / 2 - 6, top, f.w + 12, f.paras.flat().join('\n'), f.size, o.color, { align: 'center' });
}

const finish = (art: O[], txt: O[], v = .4): O[] => [...art, feltVignette(W, H, v), ...txt];
const scatterStars = (r: () => number, n: number, x: number, y: number, w: number, h: number, cols: string[], smin = 12, smax = 24, avoid: Array<[number, number, number, number]> = []): O[] => {
  const out: O[] = []; let tries = 0, k = 0;
  while (k < n && tries < n * 30) { tries++; const px = x + r() * w, py = y + r() * h; if (avoid.some(([ax, ay, aw, ah]) => px > ax - 30 && px < ax + aw + 30 && py > ay - 30 && py < ay + ah + 30)) continue; out.push(...star(px, py, smin + r() * (smax - smin), cols[k % cols.length], 70 + k, { rot: -90 + (r() - .5) * 40 })); k++; }
  return out;
};
/** The big moon-coloured blanket as felt patchwork, from y0 down to the page foot. */
function blanketPatches(y0: number, seed = 60): O[] {
  const pieces: Array<[Pt[], string, string]> = [
    [roundRectPts(-20, y0, 300, 250, 30, 1, 1.5), MOON, FT.mustard], [roundRectPts(260, y0 - 10, 280, 260, 30, 2, 1.5), FT.cream, FT.teal], [roundRectPts(520, y0, 270, 250, 30, 3, 1.5), FT.creamD, FT.burgundy],
    [roundRectPts(-20, y0 + 215, 300, 280, 30, 4, 1.5), FT.cream, FT.burgundy], [roundRectPts(260, y0 + 225, 280, 270, 30, 5, 1.5), MOON, FT.mustard], [roundRectPts(520, y0 + 215, 270, 280, 30, 6, 1.5), '#F2DDAA', FT.teal],
  ];
  return pieces.flatMap(([pts, col, th], k) => felt(pts, col, seed + k, { lift: 8, stitch: th, inset: 13, flecks: k < 3 ? 1 : 0, label: 'Blanket patch (moon-coloured felt)' }));
}
/** A small round hole in felt: frayed rim, dark inside. */
function holeIn(cx: number, cy: number, r: number, seed: number): O[] {
  const out: O[] = [];
  out.push(...felt(blob(cx, cy, r * 1.22, r * 1.18, seed, .05, 20), mix(MOON, -.14), seed, { lift: r * .06, stitch: false, fuzz: 2.4, label: 'Frayed hole rim' }));
  out.push(circle(cx, cy, r, '#120C38', { gradient: rad([0, '#2A2480'], [.7, '#150F45'], [1, '#07041F']), label: 'Hole' }));
  const fr: Array<[number, number, number, number]> = []; const rr = rn(seed + 4);
  for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2 + rr() * .3; const l = r * (.2 + rr() * .22); fr.push([cx + Math.cos(a) * r * 1.16, cy + Math.sin(a) * r * 1.12, cx + Math.cos(a) * (r * 1.16 + l), cy + Math.sin(a) * (r * 1.12 + l)]); }
  const sp = strokesPath(fr, mix(MOON, -.1), Math.max(1.6, r * .03), { label: 'Loose threads' }); if (sp) out.push(sp);
  return out;
}

const sdata = (book: ShowcaseBook, i: number): ShowcaseSpread => {
  const s = book.spreads[i]; if (!s) throw new Error(`Moon Blanket has no spread ${i + 1}`); return s;
};

/** One page of the book by index; the words come from the book's data. */
export function bedtimePage(i: number, seed: number, book: ShowcaseBook): O[] {
  const r = rn(seed);
  const sp = sdata(book, i);
  const words = sp.text;
  switch (sp.beat) {
    // ── COVER: a poster. Big felt moon, Bramble asleep-but-smiling under a moon-coloured patchwork blanket, Flit on the edge, lit candle ──
    case 'cover': {
      const art: O[] = [...quiltGround(W, H, FT.indigoD, 1, { cell: 150 })];
      art.push(...moon(590, 520, 150, { face: 'sleepy', seed: 4, smile: .7 }));
      art.push(...scatterStars(r, 3, 30, 360, 700, 280, [FT.mustard, FT.roseL, FT.cream], 12, 22, [[380, 360, 420, 320], [140, 540, 400, 330]]));
      art.push(...bear(330, 650, 118, { mood: 'asleep', body: false, seed: 6 }));
      const patches: Array<[Pt[], string, string]> = [
        [roundRectPts(-30, 720, 330, 250, 36, 1, 1.5), MOON, FT.mustard], [roundRectPts(250, 740, 300, 240, 34, 2, 1.5), FT.cream, FT.teal], [roundRectPts(520, 730, 290, 250, 36, 3, 1.5), FT.creamD, FT.burgundy], [roundRectPts(60, 850, 320, 140, 30, 4, 1.5), '#F2DDAA', FT.burgundy], [roundRectPts(360, 860, 330, 130, 30, 5, 1.5), MOON, FT.mustard],
      ];
      patches.forEach(([pts, col, th], k) => art.push(...felt(pts, col, 20 + k, { lift: 7, stitch: th, inset: 11, label: 'Blanket patch (moon-coloured felt)' })));
      art.push(...candle(668, 800, 1.1, { halo: 300 }));
      art.push(...moth(470, 722, 30, { rot: -10, seed: 8 }));
      art.push(artSlot(60, 420, 640, 520, 'Cover illustration slot'));
      const [a, b] = words.split(/\s+/);
      const txt: O[] = [...embroTitle(384, 36, a, 176, [FT.mustard, FT.cream, FT.mustard, FT.cream], 3, { tilt: 5 }), ...embroTitle(384, 214, b, 142, [FT.cream, FT.roseL, FT.mustard, FT.cream, FT.roseL, FT.mustard, FT.cream], 7, { tilt: 5 })];
      return finish(art, txt, .35);
    }

    // ── HERO: Bramble in his bed, the blanket spread behind him like a pale moon ──
    case 'hero': {
      if (i === 1) {
        const art: O[] = [...quiltGround(W, H, FT.indigoD, 2, { cell: 160 })];
        art.push(...scatterStars(r, 6, 20, 20, 730, 620, [FT.mustard, FT.roseL, FT.cream], 12, 20, [[70, 40, 630, 600]]));
        art.push(...felt(bumpy(384, 330, 292, 282, 16, .05, 3, 3), MOON, 12, { lift: 10, stitch: FT.mustard, dash: [10, 8], inset: 14, label: 'Moon-coloured blanket spread out' }));
        [[-.45, -.3, .16], [.4, -.45, .1], [.18, .45, .2], [-.55, .35, .08], [.6, .2, .07]].forEach(([dx, dy, rr], k) => art.push(...felt(disc(384 + dx * 270, 330 + dy * 260, rr * 270, 40 + k, 16), FT.creamD, 40 + k, { lite: true, lift: 0, stitch: false, fuzz: .7, label: 'Blanket puff' })));
        art.push(...felt(roundRectPts(100, 565, 568, 120, 40, 5, 1.2), FT.teal, 13, { lift: 7, stitch: FT.thread, inset: 10, label: 'Bed (felt)' }));
        art.push(...bear(384, 345, 104, { mood: 'awake', body: true, seed: 3 }));
        art.push(artSlot(80, 60, 610, 640, 'Hero illustration slot'));
        return finish(art, patch(384, 818, words, { maxW: 720, maxH: 232, max: 46, fill: FT.mustard, ink: FT.night, stitch: FT.burgundyD, seed: 3 }), .38);
      }
      // Bramble tucked in, chin deep under the blanket, candle glowing, the moon at the window
      const art: O[] = [...quiltGround(W, H, FT.indigoD, 8, { cell: 150 })];
      art.push(...windowPane(384, 130, 270, 190, 62, .85, 14));
      art.push(...felt(roundRectPts(130, 330, 508, 250, 70, 2, 1.5), FT.cream, 31, { lift: 9, stitch: FT.creamD, inset: 14, label: 'Pillow' }));
      art.push(...bear(384, 440, 138, { mood: 'sleepy', body: false, seed: 5 }));
      art.push(...blanketPatches(560, 60));
      for (const sg of [-1, 1]) art.push(...felt(ov(384 + sg * 150, 590, 54, 44, 70 + sg), BR.fur, 70, { lite: true, lift: 5, stitch: mix(BR.fur, -.38), inset: 8, label: 'Bear paw' }));
      art.push(...candle(78, 700, .72, { halo: 230 }));
      art.push(artSlot(110, 280, 550, 560, 'Tucked-in illustration slot'));
      return finish(art, patch(384, 842, words, { maxW: 700, maxH: 190, max: 42, fill: FT.cream, ink: FT.navy, seed: 2 }), .35);
    }

    // ── REVEAL: close-up of the blanket, one tiny hole, one button eye looking through ──
    case 'reveal': {
      if (i === 3) {
        const art: O[] = [...quiltGround(W, H, '#E9DAB0', 4, { cell: 190, stitch: '#BFA170', puff: 1.4, weave: .12 })];
        art.push(...felt(roundRectPts(26, 40, 330, 230, 30, 7, 1.5), FT.cream, 91, { lift: 6, stitch: FT.teal, inset: 11, label: 'Blanket patch (moon-coloured felt)' }), ...felt(roundRectPts(430, 580, 320, 220, 30, 8, 1.5), '#F2DDAA', 92, { lift: 6, stitch: FT.burgundy, inset: 11, label: 'Blanket patch (moon-coloured felt)' }));
        const cx = 384, cy = 345;
        art.push(...holeIn(cx, cy, 118, 9));
        art.push(...felt(blob(cx, cy + 8, 104, 100, 12, .03, 18), BR.fur, 12, { lite: true, lift: 0, stitch: false, fuzz: .8, label: 'Bramble fur seen through the hole' }));
        art.push(...felt(ov(cx, cy + 92, 74, 40, 14), BR.cream, 14, { lite: true, lift: 0, stitch: false, fuzz: .6, label: 'Bramble muzzle through the hole' }));
        art.push(...felt(disc(cx + 36, cy + 56, 15, 15), FT.rose, 15, { lite: true, lift: 0, stitch: false, fuzz: .5, opacity: .9, label: 'Bear cheek' }));
        art.push(...button(cx - 24, cy - 12, 38, BR.eye, FT.thread, 3));
        art.push(...thread(P(cx - 24, cy - 12, 1, [[-48, -52], [-22, -66], [8, -56]]), mix(BR.fur, -.38), 4, 'Eyebrow stitch'));
        art.push(artSlot(180, 140, 410, 410, 'Peeking-through-the-hole slot'));
        return finish(art, patch(384, 792, words, { maxW: 660, maxH: 270, max: 54, fill: FT.burgundy, ink: FT.cream, stitch: FT.cream, seed: 6 }), .3);
      }
      // i === 6: Flit, huge for a moment, a stitched tear on her cheek; Bramble tiny beside her
      const art: O[] = [...quiltGround(W, H, FT.burgundyD, 7, { cell: 160, stitch: '#D8708F' })];
      art.push(...moth(384, 330, 238, { seed: 11, big: true, tear: true, lite: false }));
      art.push(...bear(92, 600, 46, { mood: 'wow', body: true, seed: 3, look: -.4 }));
      art.push(artSlot(60, 20, 640, 700, 'Scale-shock illustration slot'));
      return finish(art, patch(384, 832, words, { maxW: 720, maxH: 210, max: 38, fill: FT.mustard, ink: FT.night, stitch: FT.burgundyD, seed: 5 }), .4);
    }

    // ── STRIP: three tall quilt panels, a guessing game: mouse? cat? moon? ──
    case 'strip': {
      const art: O[] = [...quiltGround(W, H, FT.night, 3, { cell: 150, stitch: '#6F66C9' })];
      const lines = words.split('\n'); const head = lines[0]; const guesses = lines.slice(1);
      const xs = [26, 275, 524], pw = 218, py = 172, ph = 490; const cols = [FT.teal, FT.burgundy, FT.indigo];
      xs.forEach((x, k) => art.push(...felt(roundRectPts(x, py, pw, ph, 28, 10 + k, 1.2), cols[k], 10 + k, { lift: 9, stitch: FT.thread, inset: 11, label: 'Quilt panel' })));
      // 1 the mouse
      { const mx = xs[0] + pw / 2, my = 440; const tan = '#C4967A';
        art.push(...thread([[mx + 40, my + 150], [mx + 90, my + 150], [mx + 96, my + 100], [mx + 70, my + 78]], FT.rose, 6, 'Mouse tail'));
        art.push(...felt(ov(mx, my + 110, 62, 74, 21), tan, 21, { lift: 5, stitch: mix(tan, -.35), inset: 8, label: 'Mouse body' }), ...felt(ov(mx, my + 124, 36, 48, 22), FT.cream, 22, { lite: true, lift: 0, stitch: false, label: 'Mouse tummy' }));
        for (const sg of [-1, 1]) art.push(...felt(disc(mx + sg * 50, my - 42, 30, 23 + sg), tan, 23, { lite: true, lift: 3, stitch: mix(tan, -.35), inset: 5, label: 'Mouse ear' }), ...felt(disc(mx + sg * 50, my - 42, 17, 25 + sg), FT.rose, 25, { lite: true, lift: 0, stitch: false, fuzz: .5, label: 'Mouse inner ear' }));
        art.push(...felt(ov(mx, my, 62, 54, 24), tan, 24, { lift: 5, stitch: mix(tan, -.35), inset: 8, label: 'Mouse head' }), ...felt(ov(mx, my + 24, 28, 22, 26), FT.cream, 26, { lite: true, lift: 1, stitch: false, label: 'Mouse snout' }), ...felt(disc(mx, my + 14, 8, 27, 12), FT.rose, 27, { lite: true, lift: 0, stitch: false, label: 'Mouse nose' }));
        for (const sg of [-1, 1]) art.push(...button(mx + sg * 24, my - 8, 9, BR.eye, FT.thread, 2), ...thread([[mx + sg * 14, my + 24], [mx + sg * 50, my + 18]], FT.thread, 1.8, 'Whisker'), ...thread([[mx + sg * 14, my + 30], [mx + sg * 48, my + 36]], FT.thread, 1.8, 'Whisker'));
      }
      // 2 the cat
      { const cx = xs[1] + pw / 2, cy = 440; const org = FT.coral;
        art.push(...thread([[cx + 40, cy + 150], [cx + 96, cy + 130], [cx + 100, cy + 70], [cx + 84, cy + 40]], mix(org, -.1), 14, 'Cat tail'));
        art.push(...felt(ov(cx, cy + 112, 66, 78, 31), org, 31, { lift: 5, stitch: mix(org, -.35), inset: 8, label: 'Cat body' }), ...felt(ov(cx, cy + 124, 38, 50, 32), FT.cream, 32, { lite: true, lift: 0, stitch: false, label: 'Cat tummy' }));
        for (const sg of [-1, 1]) art.push(...felt(bevel(P(cx + sg * 44, cy - 54, 1, [[-26, 30], [sg * 2, -34], [26, 30]]), .18), org, 33, { lite: true, lift: 3, stitch: mix(org, -.35), inset: 5, label: 'Cat ear' }), ...felt(bevel(P(cx + sg * 44, cy - 44, 1, [[-13, 18], [sg, -18], [13, 18]]), .18), FT.rose, 34, { lite: true, lift: 0, stitch: false, label: 'Cat inner ear' }));
        art.push(...felt(ov(cx, cy, 68, 58, 35), org, 35, { lift: 5, stitch: mix(org, -.35), inset: 8, label: 'Cat head' }));
        for (const sg of [-1, 1]) art.push(...thread([[cx + sg * 10, cy - 54], [cx + sg * 14, cy - 36]], mix(org, -.3), 6, 'Cat stripe'), ...button(cx + sg * 26, cy - 6, 11, FT.mustard, BR.eye, 4), ...thread([[cx + sg * 14, cy + 22], [cx + sg * 58, cy + 12]], FT.thread, 1.8, 'Whisker'), ...thread([[cx + sg * 14, cy + 28], [cx + sg * 56, cy + 34]], FT.thread, 1.8, 'Whisker'));
        art.push(...felt(bevel(P(cx, cy + 14, 1, [[-9, -4], [9, -4], [0, 8]]), .1), FT.rose, 36, { lite: true, lift: 0, stitch: false, label: 'Cat nose' }), ...thread(P(cx, cy, 1, [[-14, 30], [0, 38], [14, 30]]), FT.burgundyD, 2.6, 'Cat smile'));
      }
      // 3 the moon at the window
      { const mx = xs[2] + pw / 2;
        art.push(...felt(roundRectPts(xs[2] + 22, py + 140, pw - 44, 330, 22, 41, 1), FT.night, 41, { lite: true, lift: 0, stitch: false, label: 'Night window' }));
        art.push(...scatterStars(rn(5), 1, xs[2] + 40, py + 160, pw - 80, 40, [FT.mustard], 8, 12));
        art.push(...moon(mx, 450, 74, { face: 'sleepy', seed: 6, smile: .95 }));
        art.push(...felt(roundRectPts(xs[2] + 14, py + 440, pw - 28, 36, 12, 42, 1), FT.creamD, 42, { lift: 5, stitch: FT.burgundy, inset: 6, label: 'Window sill' }));
      }
      art.push(artSlot(26, 172, 716, 490, 'Guessing strip illustration slot'));
      // captions: one common size
      const maxCap = 28;
      const fits = guesses.map(g => fitParas(g, 'sniglet', pw - 36, 150, { max: maxCap, min: 22, leading: 1.28, gapEm: 0 }));
      const capSize = Math.min(...fits.map(f => f.size));
      const txt: O[] = [...patch(384, 92, head, { maxW: 720, maxH: 120, max: 54, fill: FT.mustard, ink: FT.night, stitch: FT.burgundyD, seed: 8 })];
      guesses.forEach((g, k) => txt.push(...patch(xs[k] + pw / 2, 800, g, { maxW: pw, maxH: 200, padX: 30, padY: 44, size: capSize, fill: FT.cream, ink: FT.navy, seed: 12 + k })));
      // the question marks, stitched on each panel
      xs.forEach((x, k) => txt.push(...embroTitle(x + pw / 2, py + 4, '?', 96, [[FT.cream], [FT.mustard], [FT.roseL]][k], 20 + k, { tilt: 5 })));
      return finish(art, txt, .35);
    }

    // ── QUIET: almost empty. A candle, a hole in a corner of blanket, two antennae ──
    case 'quiet': {
      if (i === 5) {
        const art: O[] = [...quiltGround(W, H, FT.night, 6, { cell: 170, stitch: '#5C54B8', puff: .8 })];
        art.push(...candle(120, 880, .95, { halo: 330 }));
        art.push(...felt(roundRectPts(290, 640, 520, 420, 40, 9, 1.5), '#EBDDB0', 51, { lift: 9, stitch: FT.mustard, inset: 14, label: 'Blanket corner (moon-coloured felt)' }));
        const hx = 540, hy = 760;
        // two plum antennae peek out of the hole
        art.push(...holeIn(hx, hy, 40, 17));
        for (const sg of [-1, 1]) {
          const cv: Pt[] = [[hx + sg * 12, hy - 24], [hx + sg * 30, hy - 66], [hx + sg * 54, hy - 92], [hx + sg * 76, hy - 82]];
          art.push(...thread(cv, FL.plum, 5, 'Moth antenna'));
          const bs = strokesPath([[cv[1][0], cv[1][1], cv[1][0] - sg * 4 + 8, cv[1][1] - 14], [cv[1][0], cv[1][1], cv[1][0] + 16, cv[1][1] - 2], [cv[2][0], cv[2][1], cv[2][0] + 3, cv[2][1] - 15], [cv[2][0], cv[2][1], cv[2][0] + 17, cv[2][1] - 6]], FL.plum, 3, { label: 'Feathery antenna barbs' }); if (bs) art.push(bs);
        }
        art.push(artSlot(100, 560, 640, 380, 'Quiet page illustration slot'));
        return finish(art, patch(384, 250, words, { maxW: 560, maxH: 330, max: 46, fill: FT.indigo, ink: FT.cream, stitch: FT.thread, seed: 9 }), .5);
      }
      // i === 9: Goodnight. The window, the sleeping moon, the blanket mound rising and falling, a last stitched star
      const art: O[] = [...quiltGround(W, H, FT.indigoD, 10, { cell: 160, puff: .9 })];
      art.push(...moon(384, 372, 112, { face: 'sleepy', seed: 6, smile: 1.45 }));
      art.push(...scatterStars(r, 4, 20, 270, 730, 100, [FT.mustard, FT.cream, FT.roseL], 10, 18, [[260, 260, 250, 300]]));
      art.push(...star(630, 330, 30, FT.mustard, 99, { lite: false }));
      art.push(...felt(roundRectPts(160, 560, 450, 150, 56, 3, 1.5), FT.cream, 60, { lift: 8, stitch: FT.creamD, inset: 12, label: 'Pillow' }));
      art.push(...bear(384, 590, 96, { mood: 'asleep', body: false, seed: 4 }));
      blanketPatches(690, 70).forEach(o => art.push(o));
      art.push(...candle(668, 640, .7, { lit: false }));
      art.push(...stitchLine([[668, 510], [650, 490], [684, 466], [656, 440], [690, 414]], FT.cream, 3.6, [3, 8], 'Smoke thread'));
      art.push(...moth(170, 700, 28, { rot: -12, seed: 8 }));
      art.push(artSlot(100, 300, 560, 560, 'Goodnight illustration slot'));
      return finish(art, [sewnText(384, 34, words, { maxW: 700, maxH: 220, max: 62, color: FT.cream })], .45);
    }

    // ── VIGNETTE: Bramble lifts a corner of the blanket; warm golden light spills out; Flit flutters toward it ──
    case 'vignette': {
      const art: O[] = [...quiltGround(W, H, FT.tealD, 9, { cell: 150, stitch: '#7FD2C3' })];
      art.push(...scatterStars(r, 5, 20, 250, 730, 260, [FT.mustard, FT.cream, FT.roseL], 12, 20, [[100, 380, 500, 360]]));
      art.push(...felt(roundRectPts(-20, 700, 800, 300, 40, 9, 1.5), FT.indigoD, 52, { lift: 8, stitch: FT.thread, inset: 14, label: 'Bed (felt)' }));
      art.push(halo(560, 650, 330, '#FFC83A', .85, 'Warm light spilling out'), halo(560, 650, 130, '#FFF2B8', .9, 'Warm light core'));
      art.push(...bear(250, 520, 120, { mood: 'awake', body: true, seed: 3 }));
      // the blanket lies over the bed; a corner is lifted, its lining glowing gold
      art.push(...felt(roundRectPts(-20, 700, 560, 300, 36, 3, 1.5), MOON, 53, { lift: 8, stitch: FT.mustard, inset: 13, label: 'Blanket (moon-coloured felt)' }));
      art.push(...felt(bevel([[430, 700], [760, 560], [800, 700], [560, 760]], .08), '#F6C453', 54, { lift: 8, stitch: FT.burgundy, inset: 12, label: 'Lifted blanket corner (golden lining)' }));
      art.push(...felt(ov(400, 640, 50, 40, 55, -30), BR.fur, 56, { lite: true, lift: 5, stitch: mix(BR.fur, -.38), inset: 7, label: 'Bear paw' }));
      art.push(...stitchLine([[640, 440], [600, 520], [560, 590]], FT.thread, 3, [2, 10], 'Flutter trail'));
      art.push(...moth(650, 420, 34, { rot: 22, seed: 9 }));
      art.push(artSlot(60, 280, 650, 560, 'Come-in illustration slot'));
      return finish(art, patch(384, 128, words, { maxW: 700, maxH: 220, max: 42, fill: FT.cream, ink: FT.navy, seed: 4 }), .38);
    }

    // ── CLOSING: snug together under the blanket, only their faces showing, the moon at the window ──
    case 'closing': {
      const art: O[] = [...quiltGround(W, H, FT.indigoD, 8, { cell: 150 })];
      art.push(...windowPane(384, 130, 280, 190, 62, 1.15, 16));
      art.push(...scatterStars(r, 4, 20, 270, 730, 90, [FT.mustard, FT.cream, FT.roseL], 12, 18));
      art.push(...felt(roundRectPts(110, 330, 548, 250, 70, 2, 1.5), FT.cream, 31, { lift: 9, stitch: FT.creamD, inset: 14, label: 'Pillow' }));
      art.push(...bear(330, 440, 118, { mood: 'happy', body: false, seed: 5 }));
      art.push(...blanketPatches(540, 60));
      for (const sg of [-1, 1]) art.push(...felt(ov(330 + sg * 130, 575, 48, 40, 70 + sg), BR.fur, 70, { lite: true, lift: 5, stitch: mix(BR.fur, -.38), inset: 8, label: 'Bear paw' }));
      art.push(...holeIn(575, 520, 58, 21));
      art.push(...moth(575, 516, 40, { seed: 6, lite: true }));
      art.push(...felt(roundRectPts(460, 548, 200, 110, 28, 17, 1.2), MOON, 18, { lift: 5, stitch: FT.mustard, inset: 9, label: 'Blanket patch (moon-coloured felt)' }));
      art.push(artSlot(100, 300, 570, 330, 'Snug illustration slot'));
      return finish(art, patch(384, 835, words, { maxW: 700, maxH: 200, max: 42, fill: FT.mustard, ink: FT.night, stitch: FT.burgundyD, seed: 8 }), .35);
    }

    // ── BACK COVER: the blurb on a felt patch, a barcode patch ──
    default: {
      const art: O[] = [...quiltGround(W, H, FT.burgundyD, 11, { cell: 150, stitch: '#D8708F' })];
      art.push(...bear(384, 220, 86, { mood: 'happy', body: false, seed: 7 }));
      art.push(...moth(600, 120, 40, { rot: 14, seed: 9 }));
      art.push(...scatterStars(r, 5, 20, 20, 400, 170, [FT.mustard, FT.cream, FT.roseL], 12, 20, [[300, 120, 180, 200]]));
      art.push(...felt(roundRectPts(60, 340, 648, 350, 38, 5, 1.5), FT.cream, 80, { lift: 9, stitch: FT.burgundy, inset: 14, label: 'Blurb patch' }));
      art.push(...felt(roundRectPts(470, 760, 250, 164, 20, 9, 1.2), FT.cream, 81, { lift: 6, stitch: FT.burgundy, inset: 10, label: 'Barcode patch' }));
      const br = rn(5); let bx = 500; const bars: Array<[number, number, number, number]> = []; while (bx < 690) { const t = 2 + Math.floor(br() * 3); bars.push([bx + t / 2, 790, bx + t / 2, 850]); bx += t + 2 + Math.floor(br() * 3); }
      art.push(strokesPath(bars, FT.navy, 2.6, { label: 'Barcode' })!);
      art.push(...candle(150, 900, .6, { halo: 160 }));
      const f = fitParas(words, 'sniglet', 560, 290, { max: 36, min: 22, leading: 1.3, gapEm: 0 });
      const txt: O[] = [
        stitchedText(384 - f.w / 2 - 6, 340 + (350 - f.h) / 2, f.w + 12, f.paras.flat().join('\n'), f.size, FT.navy, { align: 'center', leading: 1.3 }),
        stitchedText(470, 866, 250, `Ages ${book.ageMin}-${book.ageMax}`, 26, FT.burgundyD, { align: 'center' }),
      ];
      return finish(art, txt, .4);
    }
  }
}
