// storyOcean — "Below the Blue": a WATERCOLOUR picture book, ages 6-8, SQUARE 8.5 x 8.5 in (816 x 816 px).
//
// Medium (docs/tela/CHILDRENS_BOOK_ART_DIRECTION.md v3): transparent washes, wet edges, blooms,
// granulation, salt, soft bleed, hand-wobbled pencil under-drawing, paper left white around every
// subject. Everything is built from watercolorKit's wash() stacks (blur + multiply + dashed
// edge strokes) so it can read as paint, not as flat vector.
//
// THE STORY IS DATA: words, page count and page order come from data/showcase/books/belowTheBlue.ts (spread n = pageIndex + 1); each spread's
// `beat` picks the layout family. Characters follow the locked Character Bible in that file:
//   CORAL  plump round fish, coral red (#E8564A), three tall golden-orange stripes (#F2A33A), deep-orange tail and fins, one huge round eye with a white highlight, a small friendly mouth.
//   LUMI   small slim silver-blue fish (#9FB8C8), big dark eyes, a ROW OF SOFT GLOWING TEAL DOTS ALONG HER BELLY (#46E0C9) and one larger glow near her eye, a teal halo round every light. (No antenna lure.)
//   MABEL  very large humpback whale in deep blue (#2B5E8A), pale belly, long white flippers, barnacles on her chin, one huge kind eye with a white highlight.
//   JELLIES translucent blue and violet domes (#6FB5E8, #B58CF0) with trailing tentacles and a ring of light.
// Story text is sized and wrapped with real font metrics (bookText.ts): serif italic narration + handwritten dialogue, never smaller than 22px,
// and a page that cannot fit its words THROWS instead of truncating.
import { mix, rect, ellipse, circle } from '../../templateKit';
import { groundRect } from './kidsArtB';
import {
  type O, type Pt, WC, wash, bloom, splatter, drips, flatBrush, pencil, inkLine, brushStroke, dryBrush, spatter, paperTexture, lightGlow, ribbon, sway, brushTitle, inkText,
  smooth, rawBox, dotsPath, strokesPath, compact, rn, blob, shift, scaleAbout, jitter,
} from './watercolorKit';
import { fitMixed, fitParas } from './bookText';
import type { ShowcaseBook, ShowcaseSpread } from '../../../../data/showcase/types';

const W = 816, H = 816;
const PI = Math.PI;
const artSlot = (x: number, y: number, w: number, h: number, label: string): O => rect(x, y, w, h, 'rgba(255,255,255,0)', { rx: 24, label, role: 'IMAGE_SLOT', opacity: .01 });

/** Locked looks from the Character Bible. */
const CO = { red: '#E8564A', gold: '#F2A33A', tail: '#D9631F' };
const LU = { silver: '#9FB8C8', teal: '#46E0C9', deep: '#12324A' };
const MB = { blue: '#2B5E8A', belly: '#D9E6EF' };
const JL = { blue: '#6FB5E8', violet: '#B58CF0' };
const LIGHT = '#FFFBEF', LIGHT2 = '#FFE9B0';

// ── Characters ───────────────────────────────────────────────────────────────
type Mood = 'happy' | 'wow' | 'worried' | 'sleepy' | 'cheer';
interface FishOpts { flip?: boolean; mood?: Mood; seed?: number; lift?: boolean; look?: number }

/** Coral: plump, coral red, three golden stripes, deep-orange tail and fins, one huge eye. S = body radius. Faces left unless flip. */
function coralFish(cx: number, cy: number, S: number, o: FishOpts = {}): O[] {
  const f = o.flip ? -1 : 1, sd = o.seed ?? 3, mood = o.mood ?? 'happy';
  const X = (u: number) => cx + f * u * S, Y = (v: number) => cy + v * S;
  const P = (a: Array<[number, number]>): Pt[] => a.map(([u, v]) => [X(u), Y(v)] as Pt);
  const off = (pts: Pt[]) => shift(pts, -f * S * .035, S * .03); // misregistered: paint slips off the pencil line
  const body = blob(cx, cy, S, S * .86, sd, .045, 10, 0);
  const tail = P([[.84, -.16], [1.2, -.56], [1.62, -.86], [1.72, -.36], [1.52, 0], [1.72, .36], [1.62, .86], [1.2, .56], [.84, .16]]);
  const top = P([[-.28, -.74], [-.04, -1.16], [.26, -.98], [.5, -1.22], [.74, -.56], [.2, -.5]]);
  const sideFin = P([[.28, .2], [.62, .14], [.86, .42], [.56, .64], [.3, .5]]);
  const out: O[] = [];
  if (o.lift) out.push(smooth(body, true, WC.white, { opacity: .92, blur: 1.2, label: 'Lifted paper under fish' }), smooth(tail, true, WC.white, { opacity: .75, blur: 1.2, label: 'Lifted paper under tail' }), smooth(top, true, WC.white, { opacity: .8, blur: 1.2, label: 'Lifted paper under fin' }), smooth(sideFin, true, WC.white, { opacity: .7, blur: 1.2, label: 'Lifted paper under side fin' }));
  out.push(...pencil(body, true, sd, { w: Math.max(1.2, S * .02), amt: 1 + S * .02 }), ...pencil(tail, true, sd + 1, { w: Math.max(1.1, S * .016) }), ...pencil(top, true, sd + 2, { w: Math.max(1.1, S * .016) }));
  out.push(...wash(off(tail), CO.tail, sd + 3, { lite: true, grain: 6 }));
  out.push(...wash(off(top), CO.tail, sd + 4, { lite: true, grain: 4, op: .9 }));
  out.push(...wash(off(body), CO.red, sd + 5, { fade: [f > 0 ? 300 : 240, .3], salt: 2, grain: 14, mottle: .6 }));
  out.push(...wash(off(sideFin), CO.tail, sd + 7, { lite: true, op: .9 }));
  // three tall golden stripes, painted opaque-ish over the red (gouache-like lifts of gold)
  for (const u of [-.02, .3, .6]) {
    const hgt = .88 * Math.sqrt(Math.max(0, 1 - u * u)) * .9; const line: Pt[] = [[X(u), Y(-hgt)], [X(u + .08), Y(0)], [X(u), Y(hgt)]];
    out.push(smooth(line, false, 'none', { stroke: CO.gold, strokeWidth: S * .14, opacity: .9, blur: .8, label: 'Golden stripe' }), smooth(shift(line, S * .05 * f, 0), false, 'none', { stroke: mix(CO.gold, -.3), strokeWidth: Math.max(1, S * .02), opacity: .35, blend: 'multiply', label: 'Golden stripe wet edge' }));
  }
  out.push(smooth(P([[-.74, -.5], [-.52, -.7], [-.22, -.76]]), false, 'none', { stroke: WC.white, strokeWidth: S * .07, opacity: .85, label: 'Lifted highlight' }));
  // face: one huge round eye, a small friendly mouth
  const ex = X(-.5), ey = Y(-.2), er = S * .3, lk = o.look ?? 0;
  const sep = WC.sepia, sw = Math.max(1.4, S * .03);
  out.push(circle(X(-.34), Y(.26), S * .13, WC.madder, { opacity: .45, blur: Math.max(1.5, S * .04), blend: 'multiply', label: 'Cheek blush' }));
  if (mood === 'sleepy') out.push(inkLine([[ex - er * .8, ey], [ex, ey + er * .5], [ex + er * .8, ey]], sw * 1.3));
  else {
    out.push(circle(ex, ey, er, WC.white, { stroke: sep, strokeWidth: sw, opacity: .97, label: 'Eye' }));
    out.push(circle(ex - f * er * .05 + lk * er * .25, ey + er * .05, er * .58, sep, { label: 'Pupil' }), circle(ex - f * er * .24 + lk * er * .25, ey - er * .24, er * .22, WC.white, { label: 'Eye sparkle' }));
  }
  if (mood === 'worried') out.push(inkLine([[ex - er * .9, ey - er * 1.05 + f * er * .4], [ex, ey - er * 1.4], [ex + er * .9, ey - er * 1.1 - f * er * .3]], sw));
  if (mood === 'cheer') out.push(smooth(P([[-.96, .2], [-.8, .34], [-.62, .38], [-.5, .3]]), false, 'none', { stroke: '#7A2336', strokeWidth: sw * 1.7, opacity: .9, label: 'Small happy mouth' }));
  else if (mood === 'wow') out.push(ellipse(X(-.74) - S * .08, Y(.28) - S * .09, S * .16, S * .19, '#7A2336', { stroke: sep, strokeWidth: sw, opacity: .9, rotation: f * -12, label: 'Small open mouth' }));
  else if (mood === 'worried') out.push(inkLine(P([[-.92, .4], [-.76, .28], [-.6, .36], [-.44, .3]]), sw * 1.2));
  else out.push(inkLine(P([[-.95, .14], [-.82, .34], [-.6, .4], [-.42, .26]]), sw * 1.3));
  return out;
}

/** One glowing dot with a teal halo (batched: halo + core). */
function lumiLights(dots: Array<[number, number, number]>, onDark: boolean): O[] {
  const halos = dotsPath(dots.map(([x, y, r]) => [x, y, r * 2.7] as [number, number, number]), LU.teal, { opacity: onDark ? .5 : .42, blur: Math.max(1.6, dots[0][2] * 1.1), blend: onDark ? 'screen' : undefined, label: 'Teal halos' });
  const rings = dotsPath(dots.map(([x, y, r]) => [x, y, r * 1.5] as [number, number, number]), '#BFFFF3', { opacity: .75, blur: Math.max(.8, dots[0][2] * .5), label: 'Glow rings' });
  const cores = dotsPath(dots, '#F4FFFC', { opacity: .98, label: 'Glowing dots' });
  return compact([halos, rings, cores]);
}

/** Lumi: a small slim silver-blue lanternfish with a ROW OF GLOWING DOTS along her belly and one larger glow near her eye. S = body half-length. */
function lumiFish(cx: number, cy: number, S: number, o: { flip?: boolean; glowR?: number; seed?: number; onDark?: boolean; lift?: boolean } = {}): O[] {
  const f = o.flip ? -1 : 1, sd = o.seed ?? 4, ink = WC.sepia, onDark = !!o.onDark;
  const X = (u: number) => cx + f * u * S, Y = (v: number) => cy + v * S;
  const out: O[] = [];
  if (o.glowR !== 0) out.push(lightGlow(X(.05), Y(.3), o.glowR ?? S * 5, onDark ? '#8DF7E4' : LU.teal, onDark ? .5 : .42, onDark, 'Lumi glow'));
  const body = blob(cx, cy, S, S * .52, sd, .04, 12);
  const tail: Pt[] = [[X(.8), Y(-.06)], [X(1.5), Y(-.5)], [X(1.32), Y(0)], [X(1.5), Y(.5)], [X(.8), Y(.06)]];
  if (o.lift) out.push(smooth(body, true, WC.white, { opacity: .9, blur: 1, label: 'Lifted paper under Lumi' }), smooth(tail, true, WC.white, { opacity: .8, blur: 1, label: 'Lifted paper under Lumi tail' }));
  const tiny = S < 18;
  if (!tiny) out.push(...pencil(body, true, sd, { w: Math.max(.9, S * .02), amt: S * .03 }));
  out.push(...wash(shift(tail, -f * S * .03, S * .03), mix(LU.silver, -.18), sd + 1, { lite: true, op: .85 }));
  out.push(...wash(shift(body, -f * S * .03, S * .03), LU.silver, sd + 2, tiny ? { lite: true, edge: .8 } : { fade: [300, .4], bleed: .6, grain: 8, salt: 1 }));
  if (!tiny) out.push(smooth([[X(-.55), Y(-.34)], [X(-.1), Y(-.46)], [X(.4), Y(-.36)]], false, 'none', { stroke: WC.white, strokeWidth: S * .07, opacity: .8, label: 'Lifted highlight' }));
  // the row of glowing dots along her belly, and one larger glow near the eye
  const dr = Math.max(1.5, S * .075); const dots: Array<[number, number, number]> = [];
  for (let k = 0; k < 6; k++) { const u = -.5 + k * .22; dots.push([X(u), Y(.5 * Math.sqrt(Math.max(0, 1 - u * u)) * .66), dr]); }
  dots.push([X(-.72), Y(.1), dr * 1.9]);
  out.push(...lumiLights(dots, onDark));
  // big dark eye
  const ex = X(-.5), ey = Y(-.1), er = S * .24;
  out.push(circle(ex, ey, er, '#0D2236', { stroke: ink, strokeWidth: Math.max(1, S * .03), label: 'Lumi eye' }), circle(ex - f * er * .28, ey - er * .3, Math.max(1, er * .26), WC.white, { label: 'Lumi sparkle' }));
  if (!tiny) out.push(inkLine([[X(-.95), Y(.12)], [X(-.84), Y(.22)], [X(-.68), Y(.18)]], Math.max(1.1, S * .04)));
  return out;
}

/** A brush-painted fish in one stroke: for schools. */
function tinyFish(cx: number, cy: number, s: number, color: string, flip: boolean, seed: number): O[] {
  const f = flip ? -1 : 1; const P = (a: Array<[number, number]>): Pt[] => a.map(([u, v]) => [cx + f * u * s, cy + v * s] as Pt);
  const body = P([[-1.1, 0], [-.7, -.5], [0, -.62], [.7, -.25], [1.3, -.62], [1.15, 0], [1.3, .62], [.7, .25], [0, .58], [-.7, .48]]);
  return [
    ...wash(jitter(body, seed, s * .05), color, seed, { lite: true, grain: 3, edge: .8 }),
    circle(cx - f * s * .62, cy - s * .12, Math.max(1.3, s * .1), WC.sepia, { opacity: .85, label: 'Fish eye' }),
  ];
}

// ── Sea life and scenery ─────────────────────────────────────────────────────
/** A jelly: translucent dome, trailing tentacles, a ring of light. */
function jellyfish(cx: number, cy: number, s: number, color: string, seed: number, o: { face?: boolean; glow?: boolean; onDark?: boolean } = {}): O[] {
  const r = rn(seed); const top: Pt[] = [];
  for (let i = 0; i <= 10; i++) { const a = PI + i / 10 * PI; top.push([cx + Math.cos(a) * s * (1 + (r() - .5) * .05), cy + Math.sin(a) * s * .85]); }
  const fr: Pt[] = []; for (let i = 0; i <= 5; i++) { const t = i / 5; fr.push([cx + s - t * s * 2, cy + s * .02 + (i % 2 ? s * .14 : -s * .02)]); }
  const shape = [...top, ...fr];
  const out: O[] = [];
  if (o.glow) out.push(lightGlow(cx, cy, s * 1.9, color, o.onDark ? .45 : .3, !!o.onDark, 'Jelly glow'));
  if (o.onDark) out.push(smooth(shape, true, '#DDEBFF', { opacity: .5, blur: 2, label: 'Lifted paper under jelly' }));
  const nt = s < 30 ? 3 : 5;
  for (let i = 0; i < nt; i++) {
    const x0 = cx - s * .7 + i * s * (1.4 / (nt - 1)), ph = r() * 6; const c: Pt[] = Array.from({ length: 7 }, (_, k) => [x0 + Math.sin(ph + k * 1.1) * s * .1, cy + s * .1 + k * s * .24] as Pt);
    out.push(...brushStroke(c, Math.max(2, s * .06), i % 2 ? JL.violet : color, .8, 'Jelly tentacle'));
  }
  out.push(...pencil(shape, true, seed, { w: 1.1 }));
  out.push(...wash(shift(shape, -2, 2), color, seed + 1, { fade: [90, .5], salt: 3, grain: 10 }));
  out.push(...wash(blob(cx + s * .1, cy - s * .2, s * .55, s * .32, seed + 2, .1, 9), JL.violet, seed + 2, { op: .5, lite: true, edge: .3 }));
  if (o.glow) out.push(smooth(shape, true, 'none', { stroke: '#E8FBFF', strokeWidth: Math.max(1.6, s * .045), opacity: .8, blur: .8, label: 'Ring of light' }));
  out.push(smooth([[cx - s * .6, cy - s * .55], [cx - s * .3, cy - s * .76], [cx + s * .05, cy - s * .78]], false, 'none', { stroke: WC.white, strokeWidth: s * .07, opacity: .85, label: 'Lifted highlight' }));
  if (o.face) out.push(circle(cx - s * .28, cy - s * .12, Math.max(1.5, s * .045), WC.sepia, {}), circle(cx + s * .22, cy - s * .12, Math.max(1.5, s * .045), WC.sepia, {}), inkLine([[cx - s * .12, cy + s * .02], [cx - s * .02, cy + s * .1], [cx + s * .1, cy + s * .02]], Math.max(1.2, s * .03)));
  return out;
}
function starfish(cx: number, cy: number, s: number, color: string, rot: number, seed: number): O[] {
  const pts: Pt[] = []; for (let i = 0; i < 10; i++) { const a = (rot - 90 + i * 36) * PI / 180; const rr = i % 2 ? s * .48 : s; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  const dots = scaleAbout(pts, .55).filter((_, i) => i % 2 === 0).map(([x, y]) => [x, y, Math.max(1.2, s * .05)] as [number, number, number]);
  return [...pencil(pts, true, seed, { w: 1 }), ...wash(shift(pts, -1.5, 2), color, seed + 1, { lite: true, grain: 6, edge: .8 }), dotsPath(dots, mix(color, -.45), { opacity: .6 })!, circle(cx - s * .16, cy - s * .08, Math.max(1.3, s * .06), WC.sepia, {}), circle(cx + s * .16, cy - s * .08, Math.max(1.3, s * .06), WC.sepia, {}), inkLine([[cx - s * .12, cy + s * .1], [cx, cy + s * .2], [cx + s * .12, cy + s * .1]], Math.max(1, s * .035))];
}
function seaweed(x: number, base: number, h: number, color: string, seed: number, lean = 1, n = 2): O[] {
  const out: O[] = [];
  for (let i = 0; i < n; i++) {
    const c = sway(x + i * 20 - 10, base, h * (1 - i * .22), lean * (i % 2 ? -1 : 1), seed + i * 5, 8, 15);
    const poly = ribbon(c, [1, 6, 9, 9, 8, 6, 4, 1]);
    out.push(...pencil(c, false, seed + i, { w: 1, op: .4 }), ...wash(shift(poly, -1, 1), i % 2 ? WC.turq : color, seed + i * 3, { lite: true, grain: 5, edge: .9 }));
  }
  return out;
}
/** Batched bubbles: pale tinted discs with a wet ring and a lifted glint. */
function bubbles(list: Array<[number, number, number]>, color = WC.ultra): O[] {
  const b = (() => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; list.forEach(([x, y, r]) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }); return { x: x0 - 4, y: y0 - 4, w: x1 - x0 + 8, h: y1 - y0 + 8 }; })();
  const rel = list.map(([x, y, r]) => `M${(x - b.x - r).toFixed(1)} ${(y - b.y).toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`).join('');
  const gl = list.map(([x, y, r]) => `M${(x - b.x - r * .5).toFixed(1)} ${(y - b.y - r * .3).toFixed(1)}a${(r * .6).toFixed(1)} ${(r * .6).toFixed(1)} 0 0 1 ${(r * .45).toFixed(1)} ${(-r * .35).toFixed(1)}`).join('');
  return [
    rawBox(b.x, b.y, b.w, b.h, rel, color, { opacity: .1, blend: 'multiply', label: 'Bubble tint' }),
    rawBox(b.x, b.y, b.w, b.h, rel, 'none', { stroke: color, strokeWidth: 1.7, opacity: .55, blend: 'multiply', label: 'Bubble wet rings' }),
    rawBox(b.x, b.y, b.w, b.h, gl, 'none', { stroke: WC.white, strokeWidth: 2, opacity: .9, label: 'Bubble glints' }),
  ];
}
function coralFan(x: number, y: number, h: number, color: string, seed: number): O[] {
  const r = rn(seed); const segs: Array<[number, number, number, number]> = []; const tips: Array<[number, number, number]> = [];
  const grow = (px: number, py: number, ang: number, len: number, depth: number) => {
    const nx = px + Math.cos(ang) * len, ny = py + Math.sin(ang) * len; segs.push([px, py, nx, ny]);
    if (depth > 0) { grow(nx, ny, ang - .5 - r() * .25, len * .75, depth - 1); grow(nx, ny, ang + .5 + r() * .25, len * .75, depth - 1); if (r() > .5) grow(nx, ny, ang + (r() - .5) * .3, len * .62, depth - 1); }
    else tips.push([nx, ny, 4 + r() * 3]);
  };
  grow(x, y, -PI / 2, h * .3, 4);
  return compact([strokesPath(segs, color, 9, { opacity: .52, blur: 1.2, blend: 'multiply', label: 'Coral branches' }), strokesPath(segs, mix(color, .25), 3, { opacity: .5, label: 'Coral branch lights' }), dotsPath(tips, mix(color, -.2), { opacity: .6, blur: .8, blend: 'multiply', label: 'Coral tips' }), strokesPath(segs.slice(0, 3), mix(color, -.35), 2, { opacity: .5, blend: 'multiply', label: 'Coral trunk' })]);
}
function lightShafts(x: number, w: number, y0: number, y1: number, n: number, seed: number, op = .26): O[] {
  const r = rn(seed); return Array.from({ length: n }, (_, i) => { const cx = x + (i + .5) / n * w + (r() - .5) * 40; const wd = 30 + r() * 50; return smooth([[cx - wd * .3, y0], [cx + wd * .3, y0], [cx + wd * 1.4 + 80, y1], [cx - wd * 1.4 + 80, y1]], true, '#FFFEF4', { opacity: op * (.6 + r() * .6), blur: 14, label: 'Lifted light shaft' }); });
}
/** A loose, floating sea-window vignette: ragged edges, white paper all round. */
function seaVignette(cx: number, cy: number, rx: number, ry: number, seed: number, o: { depth?: number; shade?: [string, string, string] } = {}): O[] {
  const [a, b, c] = o.shade ?? [WC.cerulean, WC.turq, WC.ultra]; const dp = o.depth ?? 1; const out: O[] = [];
  out.push(...wash(blob(cx, cy, rx, ry, seed, .1, 13), a, seed, { fade: [270, .6], salt: 7, op: .95 }));
  out.push(...wash(blob(cx - rx * .22, cy + ry * .12, rx * .66, ry * .52, seed + 1, .16, 11), b, seed + 1, { op: .8, bleed: .4, fade: [0, .5], grain: 12, edge: .7 }));
  out.push(...wash(blob(cx + rx * .1, cy + ry * .5, rx * .8, ry * .42, seed + 2, .12, 11), c, seed + 2, { op: .9 * dp, fade: [270, .25], grain: 18, salt: 4, edge: .8 }));
  out.push(...bloom(cx + rx * .35, cy - ry * .2, rx * .17, a, seed + 3), ...bloom(cx - rx * .38, cy + ry * .4, rx * .13, b, seed + 4, .8));
  const d = dryBrush(cx - rx * .7, cy - ry * .5, rx * 1.4, ry * 1.1, 26, mix(c, -.1), seed + 5, { tilt: -3, op: .26 }); if (d) out.push(d);
  const sp = splatter(cx, cy, Math.max(rx, ry) * .98, c, 22, seed + 6, .5); if (sp) out.push(sp);
  out.push(...drips([cx - rx * .35, cx + rx * .2, cx + rx * .5].slice(0, rx > 150 ? 3 : 2), cy + ry * .93, mix(c, -.1), seed + 7, ry * .22));
  return out;
}
/** Full-page deep water: wet-in-wet cerulean to ultramarine to deep blue. `dark` adds a heavy deep wash across the top. */
function deepSea(seed: number, dark = false): O[] {
  const bleedBox = (dx: number, dy: number, k: number, s: number): Pt[] => blob(W / 2 + dx, H / 2 + dy, W * k, H * k, s, .08, 14);
  const out: O[] = [];
  out.push(...wash(bleedBox(0, 0, .72, seed + 2), WC.cerulean, seed + 2, { fade: [270, .7], bleed: 1, edge: 0, grain: 40, salt: 14, blur: 3 }));
  out.push(...wash(bleedBox(-60, 120, .62, seed + 3), WC.turq, seed + 3, { op: .7, fade: [0, .6], edge: 0, grain: 30, bleed: .6 }));
  out.push(...wash(bleedBox(80, 220, .66, seed + 4), WC.ultra, seed + 4, { op: .88, fade: [270, .1], edge: 0, grain: 70, salt: 10 }));
  out.push(...wash(bleedBox(0, 340, .6, seed + 5), WC.deep, seed + 5, { op: .78, fade: [270, 0], edge: 0, grain: 60, salt: 8 }));
  if (dark) out.push(...wash(blob(W / 2, 120, W * .75, 330, seed + 6, .08, 14), WC.deep, seed + 6, { op: .8, fade: [90, .35], edge: 0, grain: 30, blur: 3 }));
  out.push(...wash(blob(150, 640, 280, 150, seed + 7, .14, 12), WC.violet, seed + 7, { op: .6, edge: 0, grain: 22 }));
  out.push(...bloom(560, 330, 70, WC.cerulean, seed + 31, .35), ...bloom(210, 440, 54, WC.turq, seed + 32, .3), ...bloom(640, 600, 60, WC.ultra, seed + 33, .3));
  const d = dryBrush(-20, 120, W + 40, 560, 70, WC.deep, seed + 8, { tilt: 0, op: .25 }); if (d) out.push(d);
  const sp = spatter(0, 0, W, H, 70, WC.white, seed + 9, { op: .6 }); if (sp) out.push(sp);
  return out;
}

// ── Page helpers ─────────────────────────────────────────────────────────────
const wrapPage = (art: O[], txt: O[], tex = true, seed = 1, o: { ground?: string; specks?: number; vignette?: number } = {}): O[] => [groundRect(W, H, o.ground ?? WC.paper, undefined, 'Warm watercolour paper'), ...art, ...(tex ? paperTexture(W, H, seed, { specks: o.specks, vignette: o.vignette }) : []), ...txt];
const pencilNote = (x: number, y: number, w: number, s: string, size = 26, rot = -2, color: string = WC.sepia, align: 'left' | 'center' | 'right' = 'left'): O => inkText(x, y, w, s, { size, font: 'caveat', weight: 600, color, italic: false, rot, op: .85, align, leading: 1.1, label: 'Handwritten caption' });

interface BlockOpts { color?: string; handColor?: string; max?: number; min?: number; align?: 'left' | 'center'; allHand?: boolean; size?: number; handScale?: number; rot?: number }
/** The story's words as stacked paragraphs: serif italic narration, handwritten dialogue. Returns the objects and the block height. */
function storyBlock(x: number, y: number, w: number, maxH: number, str: string, o: BlockOpts = {}): { objs: O[]; h: number; size: number } {
  const fit = fitMixed(str, w, maxH, { max: o.size ?? o.max ?? 30, min: o.size ?? o.min ?? 22, allHand: o.allHand, handScale: o.handScale });
  const color = o.color ?? WC.ink, hc = o.handColor ?? o.color ?? WC.ink; const objs: O[] = []; let yy = y;
  for (const it of fit.items) {
    const hand = it.hand;
    objs.push(inkText(x, yy, w, it.lines.join('\n'), { size: it.size, font: hand ? 'caveat' : 'fraunces', weight: hand ? 600 : 500, italic: !hand, color: hand ? hc : color, align: o.align ?? 'left', leading: it.leading, rot: o.rot, label: 'Read-aloud text' }));
    yy += it.h + fit.gap;
  }
  return { objs, h: fit.h, size: fit.size };
}
const sdata = (book: ShowcaseBook, i: number): ShowcaseSpread => { const s = book.spreads[i]; if (!s) throw new Error(`Below the Blue has no spread ${i + 1}`); return s; };

/** One page of the book by index; the words come from the book's data. */
export function oceanPage(i: number, seed: number, book: ShowcaseBook): O[] {
  const r = rn(seed);
  const sp = sdata(book, i);
  const words = sp.text;
  const paras = words.split('\n');
  switch (sp.beat) {
    // ── COVER: a poster. Painted sea-window, Coral big, title in brush lettering ──
    case 'cover': {
      const art: O[] = [];
      art.push(...seaVignette(408, 575, 300, 232, 11));
      art.push(...lightShafts(240, 300, 380, 700, 3, 4, .22));
      art.push(lightGlow(610, 440, 130, '#FFE066', .5, false, 'Surface sun glow'));
      art.push(...seaweed(215, 770, 150, WC.turq, 3, 1, 2), ...seaweed(615, 780, 120, WC.moss, 8, -1, 2));
      art.push(...bubbles([[300, 470, 11], [322, 430, 7], [286, 410, 5], [530, 700, 9], [550, 672, 6], [655, 520, 8]]));
      art.push(...[[560, 525, 14, WC.ochre, true], [598, 548, 10, WC.madder, true], [210, 598, 12, WC.ochre, false], [250, 640, 9, WC.turq, false]].flatMap(([x, y, s, c, fl], k) => tinyFish(x as number, y as number, s as number, c as string, fl as boolean, 40 + k)));
      art.push(...coralFish(400, 580, 102, { mood: 'cheer', seed: 6, lift: true }));
      art.push(...lumiFish(215, 705, 34, { flip: true, glowR: 150, seed: 9, onDark: true, lift: true }));
      art.push(artSlot(130, 380, 560, 420, 'Cover illustration slot'));
      const [a, ...rest] = words.split(' ');
      const txt: O[] = [
        ...brushTitle(400, 22, a, 188, [WC.ultra, WC.cerulean, WC.ultra, WC.turq, WC.ultra], 3, { tilt: 4 }),
        ...brushTitle(420, 178, rest.join(' '), 150, [WC.cerulean, WC.turq, WC.ultra, WC.cerulean, WC.madder, WC.ultra, WC.turq, WC.cerulean], 5, { tilt: 4 }),
      ];
      return wrapPage(art, txt, true, 1);
    }

    // ── HERO: the bright top of the sea, golden ribbons across the sand, Coral mid-somersault, a smiling sun ──
    case 'hero': {
      const art: O[] = [];
      art.push(...seaVignette(408, 225, 345, 205, 21, { shade: [WC.sky, WC.cerulean, WC.turq], depth: .7 }));
      art.push(smooth(blob(408, 378, 300, 34, 24, .06, 14), true, WC.white, { opacity: .9, blur: 3, label: 'Lifted sand paper' }), ...wash(blob(408, 378, 290, 32, 22, .1, 12), WC.ochre, 22, { op: .6, edge: .5, grain: 30, lite: true }));
      art.push(...flatBrush([[130, 356], [310, 344], [500, 366], [690, 350]], 30, '#F7CB52', 5, .55), ...flatBrush([[180, 388], [360, 378], [560, 396], [660, 384]], 22, '#F7CB52', 6, .5));
      art.push(...lightShafts(380, 330, 40, 360, 3, 6, .22));
      art.push(lightGlow(690, 72, 120, '#FFE066', .6, false, 'Sun glow'), ...wash(blob(690, 72, 46, 46, 23, .04, 12), '#FFC93C', 23, { op: .95, edge: 1, lite: true }), circle(676, 64, 3.2, WC.sepia, { label: 'Sun eye' }), circle(704, 64, 3.2, WC.sepia, { label: 'Sun eye' }), inkLine([[672, 80], [690, 92], [708, 80]], 2.6));
      art.push(...seaweed(120, 392, 120, WC.turq, 2, 1, 2), ...seaweed(700, 396, 100, WC.moss, 7, -1, 2));
      const arc: Array<[number, number, number]> = Array.from({ length: 12 }, (_, k) => { const a = -PI * .9 + k / 11 * PI * 1.7; return [430 + Math.cos(a) * 120, 245 + Math.sin(a) * 100, 2.6] as [number, number, number]; });
      art.push(dotsPath(arc, WC.sepia, { opacity: .5, label: 'Somersault path' })!);
      art.push(...coralFish(430, 245, 74, { mood: 'cheer', seed: 7, lift: true, flip: true }));
      art.push(...tinyFish(660, 330, 12, WC.ochre, true, 50), ...tinyFish(190, 200, 10, WC.madder, false, 51), ...bubbles([[520, 150, 9], [542, 122, 6], [200, 330, 7]]));
      art.push(artSlot(60, 20, 700, 420, 'Hero illustration slot'));
      const b = storyBlock(58, 474, 700, 300, words, { color: WC.ink, max: 28 });
      return wrapPage(art, b.objs, true, 2);
    }

    // ── VIGNETTE ──
    case 'vignette': {
      if (i === 2) {
        // a round porthole onto the sky going dark: a big cloud hides the sun, Coral small and wide-eyed
        const art: O[] = [];
        art.push(...wash(blob(408, 245, 208, 204, 31, .03, 16), WC.sky, 31, { fade: [270, .55], bleed: 1, salt: 8, grain: 20 }));
        art.push(...wash(blob(408, 372, 200, 110, 32, .06, 12), WC.cerulean, 32, { op: .8, edge: .4, grain: 14 }), ...wash(blob(420, 425, 190, 62, 33, .06, 12), WC.ultra, 33, { op: .75, edge: 0, grain: 12 }));
        art.push(lightGlow(520, 150, 100, '#FFD54A', .5, false, 'Hidden sun glow'));
        const grey = '#8794C2';
        ([[320, 150, 110, 54], [430, 126, 124, 66], [530, 152, 100, 52], [395, 178, 160, 42]] as Array<[number, number, number, number]>).forEach(([x, y, rx, ry], k) => art.push(smooth(blob(x, y, rx * 1.04, ry * 1.04, 44 + k, .1, 10), true, WC.white, { opacity: .85, blur: 2.5, label: 'Lifted cloud paper' }), ...wash(blob(x, y, rx, ry, 34 + k, .1, 10), grey, 34 + k, { op: .8, edge: .9, grain: 14, lite: k > 1 })));
        art.push(...wash(blob(400, 205, 175, 20, 39, .1, 10), mix(grey, -.3), 39, { op: .6, lite: true }));
        art.push(smooth(blob(408, 245, 214, 210, 37, .01, 24), true, 'none', { stroke: WC.sepia, strokeWidth: 7, opacity: .45, blur: 1.2, label: 'Porthole rim' }), ...pencil(blob(408, 245, 218, 214, 38, .01, 24), true, 38, { w: 1.2, op: .45 }));
        art.push(...coralFish(420, 375, 40, { mood: 'wow', seed: 8, lift: true }));
        art.push(...bubbles([[300, 360, 8], [320, 332, 5], [510, 392, 6]]), ...tinyFish(560, 300, 9, WC.turq, true, 52));
        art.push(artSlot(190, 40, 440, 410, 'Porthole illustration slot'));
        const b = storyBlock(58, 484, 700, 300, words, { color: WC.ink, max: 28 });
        return wrapPage(art, b.objs, true, 3);
      }
      // i === 7: the words ride two wavy ribbons; Coral and Lumi rise together, their lights pooling
      const art: O[] = [];
      art.push(...wash(blob(408, 408, 430, 400, 71, .07, 15), WC.sky, 71, { fade: [270, .6], bleed: 1, salt: 10, grain: 30, op: .75 }));
      art.push(...wash(blob(300, 560, 300, 150, 72, .12, 12), WC.turq, 72, { op: .45, edge: 0, grain: 14 }));
      const band = (y: number, h: number, s: number): O[] => [smooth([[30, y + 8], [200, y - 10], [420, y + 14], [620, y - 8], [790, y + 10], [786, y + h - 6], [600, y + h + 14], [400, y + h - 10], [200, y + h + 12], [34, y + h - 4]], true, WC.white, { opacity: .9, blur: 3, label: 'Lifted paper ribbon' }), ...pencil([[30, y + 8], [200, y - 10], [420, y + 14], [620, y - 8], [790, y + 10]], false, s, { w: 1.1, op: .35 })];
      const topTxt = paras.slice(0, 2).join('\n'), botTxt = paras.slice(2).join('\n');
      const tb = fitMixed(topTxt, 690, 170, { max: 30, min: 22 }), bb = fitMixed(botTxt, 690, 190, { max: 30, min: 22 });
      const size = Math.min(tb.size, bb.size);
      art.push(...band(34, tb.h + 52, 3), ...band(816 - bb.h - 90, bb.h + 56, 4));
      art.push(...lightShafts(300, 260, 250, 600, 3, 9, .28));
      art.push(lightGlow(400, 440, 150, '#7FF5E0', .42, false, 'Pooled light'));
      art.push(...lumiFish(330, 520, 40, { glowR: 120, seed: 5, lift: true }), ...coralFish(500, 395, 56, { mood: 'happy', seed: 9, lift: true, flip: true }));
      art.push(...bubbles([[250, 440, 9], [270, 408, 6], [590, 320, 8], [610, 290, 5], [200, 330, 6]]), ...tinyFish(660, 480, 11, WC.ochre, true, 53));
      art.push(artSlot(150, 250, 520, 360, 'Rising illustration slot'));
      const t1 = storyBlock(60, 60, 690, tb.h + 8, topTxt, { size, color: WC.ink, handColor: WC.ink }), t2 = storyBlock(60, 816 - bb.h - 62, 690, bb.h + 8, botTxt, { size, color: WC.ink, handColor: WC.ink });
      return wrapPage(art, [...t1.objs, ...t2.objs], true, 7);
    }

    // ── STRIP: three painted bands, getting darker, Coral swimming down past a starfish toward the little lights ──
    case 'strip': {
      const art: O[] = [];
      art.push(...wash(blob(408, 140, 500, 150, 41, .05, 16), WC.sky, 41, { fade: [270, .5], edge: .8, salt: 10, grain: 30, op: .95 }));
      art.push(...wash(blob(408, 408, 500, 150, 42, .05, 16), WC.cerulean, 42, { fade: [270, .3], edge: .8, grain: 30, op: .95 }), ...wash(blob(408, 420, 500, 140, 46, .05, 14), WC.ultra, 46, { op: .6, edge: 0, grain: 20 }));
      art.push(...wash(blob(408, 686, 500, 150, 43, .05, 16), WC.deep, 43, { fade: [270, .1], edge: .8, grain: 50, op: .95 }), ...wash(blob(408, 700, 500, 130, 47, .05, 14), WC.violet, 47, { op: .35, edge: 0, grain: 20 }));
      // band 1: the reef, a sleepy starfish; band 2: the water deepens; band 3: the little lights ahead
      art.push(...coralFan(600, 262, 130, WC.madder, 4), ...coralFan(700, 262, 100, WC.rose, 6), ...starfish(520, 252, 18, WC.ochre, 14, 3), ...seaweed(560, 262, 80, WC.turq, 5, 1, 1));
      art.push(...coralFish(680, 150, 36, { mood: 'wow', seed: 9, lift: true, flip: true }), ...bubbles([[600, 120, 7], [616, 96, 5]]));
      art.push(...coralFish(660, 420, 36, { mood: 'happy', seed: 10, lift: true, flip: true }), ...bubbles([[560, 380, 7], [574, 354, 5], [720, 460, 6]]));
      art.push(...coralFish(610, 690, 34, { mood: 'worried', seed: 11, lift: true, flip: true }));
      const lights: Array<[number, number, number]> = [[720, 630, 3.4], [754, 664, 3], [770, 612, 3.6], [738, 706, 3], [784, 700, 3.2], [706, 750, 2.8], [766, 756, 3.4]];
      art.push(...lumiLights(lights, true));
      art.push(artSlot(440, 20, 360, 780, 'Descent illustration slot'));
      // text: paragraphs 1+2 on band 1, paragraph 3 on band 2, paragraph 4 on band 3 (one common size)
      const parts = [paras.slice(0, 2).join('\n'), paras[2], paras.slice(3).join('\n')];
      const fits = parts.map(p => fitMixed(p, 430, 215, { max: 28, min: 22 })); const size = Math.min(...fits.map(f => f.size));
      const cols = [WC.ink, LIGHT, LIGHT]; const hcols = [WC.ink, LIGHT2, LIGHT2]; const txt: O[] = [];
      parts.forEach((p, k) => { const fh = fitMixed(p, 430, 230, { max: size, min: size }); const b = storyBlock(44, 136 + k * 272 - fh.h / 2, 430, fh.h + 6, p, { size, color: cols[k], handColor: hcols[k] }); txt.push(...b.objs); });
      return wrapPage(art, txt, true, 4);
    }

    // ── QUIET: the dark, heavy water; tiny Coral; one small teal light turns toward her ──
    case 'quiet': {
      const art: O[] = [...deepSea(60, true)];
      art.push(...bloom(430, 450, 54, WC.turq, 61, .7), ...bloom(250, 560, 40, WC.ultra, 62, .6));
      art.push(...lumiFish(500, 430, 15, { glowR: 120, seed: 9, flip: true, onDark: true }), ...lumiLights([[455, 410, 4.6]], true));
      art.push(...coralFish(140, 690, 28, { mood: 'worried', seed: 12, lift: true, flip: true }));
      art.push(...bubbles([[96, 640, 5], [110, 616, 4]], WC.white));
      art.push(artSlot(100, 300, 560, 420, 'Quiet page illustration slot'));
      const top = storyBlock(60, 52, 640, 240, paras.slice(0, 3).join('\n'), { color: LIGHT, handColor: LIGHT2, max: 32 });
      const bot = storyBlock(250, 600, 520, 170, paras.slice(3).join('\n'), { color: LIGHT, handColor: LIGHT2, max: 30 });
      return wrapPage(art, [...top.objs, ...bot.objs], true, 5, { vignette: .05 });
    }

    // ── REVEAL ──
    case 'reveal': {
      if (i === 5) {
        // Lumi close up, her lights glowing teal; Coral small and astonished beside her
        const art: O[] = [...deepSea(80, true)];
        art.push(lightGlow(480, 410, 300, '#7FF5E0', .4, true, 'Lumi big glow'));
        art.push(...lumiFish(500, 410, 120, { glowR: 260, seed: 4, onDark: true, lift: true }));
        art.push(...coralFish(160, 470, 40, { mood: 'wow', seed: 13, lift: true, flip: true }));
        art.push(...bubbles([[110, 410, 7], [130, 380, 5], [680, 300, 8], [700, 268, 5]], WC.white));
        art.push(artSlot(60, 200, 700, 420, 'Lumi close-up illustration slot'));
        const top = storyBlock(58, 44, 700, 190, paras.slice(0, 2).join('\n'), { color: LIGHT, handColor: LIGHT2, max: 32 });
        const bot = storyBlock(58, 590, 700, 190, paras.slice(2).join('\n'), { color: LIGHT, handColor: LIGHT2, max: 32 });
        return wrapPage(art, [...top.objs, ...bot.objs], true, 6, { vignette: .05 });
      }
      // i === 9: Mabel's enormous kind eye fills the page; Coral and Lumi tiny beside it
      const art: O[] = [];
      art.push(...wash(blob(430, 430, 520, 470, 61, .06, 16), MB.blue, 61, { fade: [300, .45], edge: .7, salt: 10, grain: 60, op: 1, blur: 3 }));
      art.push(...wash(blob(340, 560, 440, 280, 62, .1, 13), WC.deep, 62, { op: .85, edge: 0, grain: 40, fade: [270, .1] }));
      art.push(...wash(blob(408, 40, 560, 210, 168, .06, 14), WC.deep, 168, { op: .85, edge: 0, grain: 30, fade: [90, .3], blur: 3 }));
      art.push(...wash(blob(560, 740, 360, 90, 63, .12, 11), WC.turq, 63, { op: .5, edge: 0, grain: 14 }));
      art.push(...wash(blob(250, 250, 200, 120, 160, .2, 10), WC.violet, 160, { op: .45, edge: .5, grain: 20 }), ...wash(blob(640, 560, 190, 140, 161, .2, 10), WC.violet, 161, { op: .4, edge: .5, grain: 20 }));
      // pale belly and a long white flipper sweeping across the foot of the page; barnacles on her chin
      art.push(...wash(blob(640, 790, 330, 70, 164, .1, 12), MB.belly, 164, { op: .8, edge: .5, grain: 20 }));
      art.push(...wash(ribbon([[-20, 700], [120, 690], [260, 720], [380, 780]], [4, 26, 30, 8]), '#E8F1F7', 165, { op: .75, edge: .8, lite: true }));
      art.push(dotsPath([[690, 645, 5], [712, 660, 4], [676, 668, 4.5], [730, 640, 3.4], [704, 686, 3.8], [748, 668, 3]], '#EDE6D6', { opacity: .9, label: 'Barnacles' })!);
      const d = dryBrush(-10, 60, W, 700, 70, WC.deep, 66, { op: .25, tilt: -4 }); if (d) art.push(d);
      art.push(...pencil(blob(430, 400, 215, 196, 67, .02, 16), true, 68, { w: 1.6, op: .5, color: WC.white }));
      art.push(smooth(blob(430, 404, 210, 190, 69, .03, 14), true, '#FFF9EA', { opacity: .96, blur: 1.5, label: 'Whale eye white' }));
      art.push(...wash(blob(445, 410, 135, 128, 70, .04, 12), WC.cerulean, 70, { op: .8, edge: .9, bleed: .5, grain: 20 }));
      art.push(smooth(blob(445, 410, 76, 76, 71, .02, 12), true, '#17194A', { opacity: .96, blur: .8, label: 'Whale pupil' }));
      art.push(circle(406, 366, 24, WC.white, { opacity: .95, label: 'Eye glint' }), circle(484, 458, 9, WC.white, { opacity: .85, label: 'Eye glint small' }));
      art.push(smooth([[222, 262], [330, 190], [470, 170], [610, 214]], false, 'none', { stroke: '#0C1556', strokeWidth: 9, opacity: .6, blur: 2.4, blend: 'multiply', label: 'Whale brow' }));
      art.push(smooth([[210, 610], [300, 650], [420, 664], [560, 640]], false, 'none', { stroke: '#0C1556', strokeWidth: 7, opacity: .5, blur: 2, blend: 'multiply', label: 'Whale smile' }));
      art.push(...coralFish(150, 380, 26, { mood: 'wow', seed: 8, lift: true, look: .7, flip: true }), ...lumiFish(106, 300, 14, { glowR: 70, seed: 3, onDark: true, lift: true, flip: true }));
      art.push(...bubbles([[70, 470, 8], [90, 440, 5], [60, 420, 4]], WC.white));
      art.push(artSlot(140, 140, 540, 520, 'Scale-shock illustration slot'));
      const top = storyBlock(48, 22, 720, 160, paras.slice(0, 3).join('\n'), { color: LIGHT, handColor: LIGHT2, max: 28 });
      const bot = storyBlock(48, 676, 560, 120, paras.slice(3).join('\n'), { color: LIGHT, handColor: LIGHT2, max: 28 });
      return wrapPage(art, [...top.objs, ...bot.objs], true, 10, { vignette: .04 });
    }

    // ── PANORAMA: a wide, dark-blue spread glittering with jellies; Lumi explains, Coral is amazed ──
    case 'panorama': {
      const art: O[] = [...deepSea(90, true)];
      art.push(...jellyfish(110, 470, 44, JL.blue, 31, { glow: true, onDark: true }), ...jellyfish(230, 380, 36, JL.violet, 32, { glow: true, onDark: true }), ...jellyfish(640, 380, 46, JL.violet, 33, { glow: true, onDark: true }), ...jellyfish(730, 480, 38, JL.blue, 34, { glow: true, onDark: true }), ...jellyfish(540, 530, 28, JL.blue, 35, { onDark: true }));
      art.push(...lumiFish(440, 430, 44, { glowR: 160, seed: 6, onDark: true, lift: true }), ...coralFish(320, 450, 40, { mood: 'wow', seed: 14, lift: true, flip: true }));
      art.push(artSlot(60, 300, 700, 300, 'Panorama illustration slot'));
      // paragraphs 1-3 above the jellies, 4-5 below
      const top = storyBlock(48, 38, 720, 250, paras.slice(0, 3).join('\n'), { color: LIGHT, handColor: LIGHT2, max: 28 });
      const bot = storyBlock(48, 590, 720, 200, paras.slice(3).join('\n'), { color: LIGHT, handColor: LIGHT2, max: 28 });
      return wrapPage(art, [...top.objs, ...bot.objs], true, 9, { vignette: .05 });
    }

    // ── CLOSING ──
    case 'closing': {
      if (i === 8) {
        // bright aqua again: Coral reaches the light, golden ribbons across the sand, Lumi a small glow below, waving
        const art: O[] = [];
        art.push(...seaVignette(408, 160, 380, 150, 81, { shade: [WC.sky, WC.cerulean, WC.turq], depth: .6 }));
        art.push(lightGlow(620, 40, 150, '#FFE066', .6, false, 'Sun glow'));
        art.push(...lightShafts(350, 360, 10, 280, 3, 8, .28));
        art.push(...flatBrush([[90, 250], [280, 236], [480, 256], [700, 240]], 22, '#F7CB52', 5, .55));
        art.push(...coralFish(540, 112, 52, { mood: 'cheer', seed: 15, lift: true, flip: true }), ...lumiFish(250, 190, 26, { glowR: 90, seed: 7, lift: true }));
        art.push(...jellyfish(130, 100, 26, JL.blue, 40, {}), ...bubbles([[420, 160, 8], [440, 130, 5], [350, 100, 6]]));
        art.push(...seaweed(90, 262, 70, WC.turq, 2, 1, 1), ...seaweed(720, 264, 70, WC.moss, 9, -1, 1));
        art.push(artSlot(60, 20, 700, 250, 'Return illustration slot'));
        const b = storyBlock(54, 328, 708, 460, words, { color: WC.ink, max: 28 });
        return wrapPage(art, b.objs, true, 8);
      }
      // i === 10: a calm dawn wash; Coral and Lumi side by side under fading stars, a golden ribbon of light behind them
      const art: O[] = [];
      art.push(lightGlow(408, 560, 330, '#FFD54A', .4, false, 'Dawn glow'));
      art.push(...seaVignette(408, 548, 330, 200, 91, { shade: [WC.sky, WC.cerulean, WC.ultra], depth: .8 }));
      art.push(...flatBrush([[120, 640], [300, 560], [520, 540], [700, 470]], 46, '#F7CB52', 7, .5));
      art.push(dryBrush(160, 470, 500, 160, 26, WC.white, 95, { op: .5, tilt: 0, width: 2.2 })!);
      const sr = rn(55); art.push(dotsPath(Array.from({ length: 9 }, () => [190 + sr() * 440, 380 + sr() * 70, 1.3 + sr() * 1.7] as [number, number, number]), WC.white, { opacity: .8, label: 'Fading stars' })!);
      art.push(...coralFish(360, 560, 66, { mood: 'happy', seed: 16, lift: true }), ...lumiFish(530, 580, 36, { flip: true, glowR: 110, seed: 8, lift: true }));
      art.push(...bubbles([[300, 500, 9], [322, 470, 6], [610, 520, 7]]));
      art.push(artSlot(110, 360, 600, 380, 'Dawn illustration slot'));
      const b = storyBlock(58, 60, 700, 230, words, { color: WC.ink, max: 32, align: 'left' });
      return wrapPage(art, b.objs, true, 11);
    }

    // ── ACTIVITY: spot Lumi, count the jellies, draw your own glowing fish ──
    case 'activity': {
      const art: O[] = [];
      art.push(...wash(blob(408, 360, 345, 245, 81, .07, 15), WC.sky, 81, { fade: [270, .5], bleed: 1, salt: 10, grain: 30, op: .85 }));
      art.push(...wash(blob(300, 430, 240, 140, 82, .12, 12), WC.turq, 82, { op: .6, edge: 0, grain: 20 }));
      art.push(...wash(blob(520, 480, 240, 120, 83, .12, 12), WC.cerulean, 83, { op: .7, edge: 0, grain: 20 }));
      art.push(...wash(blob(408, 590, 320, 50, 84, .1, 14), WC.ochre, 84, { op: .85, edge: .4, grain: 34 }));
      art.push(...coralFan(180, 590, 220, WC.madder, 21), ...coralFan(620, 590, 230, WC.violet, 22));
      art.push(...seaweed(120, 596, 160, WC.turq, 24, 1, 2));
      art.push(...jellyfish(300, 260, 36, JL.blue, 27, { face: true }), ...jellyfish(470, 200, 28, JL.violet, 28, {}), ...jellyfish(600, 300, 32, JL.blue, 29, {}), ...jellyfish(210, 400, 24, JL.violet, 30, {}));
      art.push(...coralFish(560, 330, 40, { mood: 'happy', seed: 14, lift: true, flip: true }));
      const spots: Array<[number, number, boolean]> = [[165, 215, false], [440, 470, true], [660, 540, false], [345, 535, true], [620, 195, true]];
      spots.forEach(([x, y, fl], k) => art.push(...lumiFish(x, y, 15, { flip: fl, glowR: 50, seed: 30 + k, lift: true })));
      art.push(artSlot(90, 130, 640, 480, 'Activity scene slot'));
      // the empty circle to draw a glowing fish in
      const ring = Array.from({ length: 40 }, (_, k) => { const a = k / 40 * PI * 2; return [650 + Math.cos(a) * 80, 706 + Math.sin(a) * 66] as Pt; });
      art.push(...pencil(ring, true, 7, { w: 2, op: .6 }));
      const title = paras[0]; const rest = paras.slice(1).join('\n');
      const fit = fitMixed(rest, 520, 200, { max: 30, min: 24, allHand: true });
      const txt: O[] = [...brushTitle(408, 24, title, 76, [WC.ultra, WC.cerulean, WC.turq], 3, { tilt: 3 })];
      txt.push(...storyBlock(70, 644, 520, 200, rest, { size: fit.size, allHand: true, color: WC.ink, handScale: 1 }).objs);
      return wrapPage(art, txt, true, 9);
    }

    // ── BACK COVER: the blurb, a barcode, the age band ──
    default: {
      const art: O[] = [];
      art.push(...seaVignette(408, 520, 175, 150, 111, { depth: .9 }));
      art.push(...lumiFish(478, 566, 30, { glowR: 140, seed: 6, onDark: true, lift: true, flip: true }));
      art.push(...coralFish(352, 520, 52, { mood: 'happy', seed: 17, lift: true }));
      art.push(artSlot(230, 380, 360, 300, 'Back cover illustration slot'));
      const bars = rn(7); let bx = 598; const barcode: Array<[number, number, number, number]> = [];
      while (bx < 740) { const t = 2 + Math.floor(bars() * 3); barcode.push([bx + t / 2, 708, bx + t / 2, 738]); bx += t + 2 + Math.floor(bars() * 3); }
      art.push(rect(580, 696, 176, 84, WC.white, { rx: 6, stroke: mix(WC.sepia, .4), strokeWidth: 1.4, opacity: .96, label: 'Barcode paper' }), strokesPath(barcode, WC.sepia, 2.4, { opacity: .85, label: 'Barcode' })!);
      const f = fitParas(words, 'fraunces', 600, 205, { max: 30, min: 22, leading: 1.36, gapEm: 0 });
      const blurb = inkText(408 - 300, 196, 600, f.paras.flat().join('\n'), { size: f.size, font: 'fraunces', weight: 500, italic: true, color: WC.ink, align: 'center', leading: 1.36, label: 'Back-cover blurb' });
      const txt: O[] = [
        ...brushTitle(408, 40, book.title, 98, [WC.ultra, WC.cerulean, WC.turq, WC.ultra], 6, { tilt: 3 }),
        blurb,
        pencilNote(596, 742, 160, `Ages ${book.ageMin}-${book.ageMax}`, 24, 0, WC.sepia, 'center'),
      ];
      return wrapPage(art, txt, true, 12);
    }
  }
}
