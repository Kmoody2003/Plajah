// animeChars: Sakura (the girl), Kumo (the sky whale) and a few scenery props for story-anime.
// Everything is local-unit geometry placed by drawer(), so one definition serves a cover close-up,
// a tiny figure on a hill and a whale as wide as two pages.
import { drawer, smooth, taperPts, ringPts, arc, lin, radial, glowPaint, petalPts, star4, multiPoly, poly, circle, ellipse, rect, rng, AP, mix, lerp, type O, type Pt, type Tf } from './kidsArtAnime';

export type Mood = 'smile' | 'open' | 'wow' | 'happy' | 'sleepy' | 'shy' | 'worry' | 'fierce';
export type Pose = 'stand' | 'wave' | 'cheer' | 'run' | 'lean' | 'none';

const HAIR = { base: AP.sakura, shade: AP.sakuraD, hi: AP.sakuraL, line: '#B83F78' };

/** A tapered band along a centreline: width scaled by k, shifted along the normal by `shift` * width. */
function band(center: Pt[], w0: number, w1: number, bulge: number, k: number, shift: number): Pt[] {
  const n = center.length; const sh: Pt[] = []; const ws: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(n - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const t = i / (n - 1); const w = Math.max(0, lerp(w0, w1, t) + bulge * Math.sin(Math.PI * t)); ws.push(w * k);
    sh.push([center[i][0] - dy * shift * w, center[i][1] + dx * shift * w]);
  }
  const L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = sh[Math.max(0, i - 1)], b = sh[Math.min(n - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    L.push([sh[i][0] - dy * ws[i] / 2, sh[i][1] + dx * ws[i] / 2]); R.push([sh[i][0] + dy * ws[i] / 2, sh[i][1] - dx * ws[i] / 2]);
  }
  return [...L, ...R.reverse()];
}

/** One flowing lock of cel-shaded hair: base, hard shadow band, highlight band, two strand lines. */
function lock(d: ReturnType<typeof drawer>, ctrl: Pt[], w0: number, w1: number, bulge: number, o: { col?: string; sh?: string; hi?: string; ow?: number; side?: number; strands?: boolean; lite?: boolean } = {}) {
  const c = smooth(ctrl, false, o.lite ? 4 : 6); const side = o.side ?? 1;
  d.poly(taperPts(c, w0, w1, bulge), o.col || HAIR.base, { ow: o.ow ?? .045 });
  d.poly(band(c, w0, w1, bulge, .34, .3 * side), o.sh || HAIR.shade, { opacity: .95 });
  if (!o.lite) d.poly(band(c, w0, w1, bulge, .2, -.26 * side), o.hi || HAIR.hi, { opacity: .95 });
  if (o.strands !== false && !o.lite) d.tapers([{ c: c.slice(Math.floor(c.length * .12), Math.floor(c.length * .8)).map(p => [p[0] + (c[0][0] > 0 ? -.03 : .03), p[1]] as Pt), w0: .03, w1: 0 }], HAIR.line, { opacity: .8 });
}

export interface SakuraOpts { mood?: Mood; look?: [number, number]; swing?: number; tailLift?: number; back?: boolean; nobody?: boolean; blush?: number; lite?: boolean }

/** The head: tails, face, eyes, mouth, bangs, hair highlight, ahoge and the blossom pin. Origin = face centre, radius 1. */
export function sakuraHead(out: O[], tf: Tf, op: SakuraOpts = {}): void {
  const d = drawer(tf, out); const mood = op.mood || 'smile'; const sw = op.swing ?? 0; const lift = op.tailLift ?? 0; const look = op.look || [0, 0]; const lite = !!op.lite;
  const swingPts = (pts: Pt[], sgn: number): Pt[] => pts.map((p, i) => { const t = i / (pts.length - 1); return [p[0] + sw * t * t * (sgn > 0 ? 1 : 1), p[1] - lift * t * (1 - t) * 2] as Pt; });
  // back hair mass + twin tails
  d.poly(smooth([[-1.08, -.2], [-1.0, -.85], [-.5, -1.22], [.5, -1.22], [1.0, -.85], [1.08, -.2], [1.1, .6], [.8, 1.05], [0, 1.0], [-.8, 1.05], [-1.1, .6]], true, 6), HAIR.shade, { ow: .045 });
  const tailR = swingPts([[.98, -.5], [1.45, -.15], [1.62, .55], [1.4, 1.3], [1.6, 2.0]], 1), tailL = swingPts([[-.98, -.5], [-1.45, -.15], [-1.62, .55], [-1.4, 1.3], [-1.6, 2.0]], -1);
  lock(d, tailR, .5, 0, .46, { side: 1, lite }); lock(d, tailL, .5, 0, .46, { side: -1, lite });
  // face
  const face = smooth([[-.97, -.12], [-.93, .28], [-.58, .74], [0, .98], [.58, .74], [.93, .28], [.97, -.12], [.72, -.75], [0, -1.0], [-.72, -.75]], true, 6);
  d.poly(face, AP.skin, { ow: .04 });
  if (!op.back) {
    // forehead shadow cast by the bangs + jaw shade
    if (!lite) d.poly(smooth([[-.95, -.1], [-.7, .1], [-.3, .02], [0, .12], [.3, .02], [.7, .1], [.95, -.1], [.9, -.5], [-.9, -.5]], true, 5), AP.skinD, { opacity: .9 });
    if (!lite) d.poly(smooth([[.93, .28], [.58, .74], [0, .98], [.3, .7], [.7, .3]], true, 5), AP.skinD, { opacity: .55 });
    const bl = op.blush ?? 1;
    d.ell(-.6, .52, .2, .11, AP.sakura, { opacity: .5 * bl, blur: 2 }); d.ell(.6, .52, .2, .11, AP.sakura, { opacity: .5 * bl, blur: 2 });
    if (mood === 'shy' || mood === 'happy' || bl > 1) { for (const sx of [-1, 1]) d.tapers([0, 1, 2].map(i => ({ c: [[sx * (.5 + i * .09), .62], [sx * (.56 + i * .09), .5]] as Pt[], w0: .035, w1: .012 })), AP.sakuraD, { opacity: .85 }); }
    // eyes
    for (const sx of [-1, 1]) eye(d, sx, mood, look, lite);
    // brows
    const bc = HAIR.line;
    if (mood === 'fierce') { for (const sx of [-1, 1]) d.taper(smooth([[sx * .66, -.32], [sx * .46, -.26], [sx * .2, -.12]], false, 4), .05, .02, 0, bc); }
    else if (mood === 'worry') { for (const sx of [-1, 1]) d.taper(smooth([[sx * .68, -.18], [sx * .46, -.3], [sx * .22, -.38]], false, 4), .04, .02, 0, bc); }
    else for (const sx of [-1, 1]) d.taper(smooth([[sx * .2, -.27], [sx * .46, -.34], [sx * .68, -.24]], false, 4), .018, .03, 0, bc);
    // nose + mouth
    if (!lite) d.taper([[0, .55], [.025, .6]], .035, .02, 0, AP.skinD, { opacity: .9 });
    if (mood === 'open' || mood === 'wow') {
      const w = mood === 'wow' ? .12 : .17, h = mood === 'wow' ? .17 : .13;
      d.poly(smooth([[-w, .68], [0, .66], [w, .68], [w * .6, .68 + h], [0, .68 + h * 1.1], [-w * .6, .68 + h]], true, 5), '#7A1F4F', { ow: .028 });
      d.ell(0, .68 + h * .78, w * .6, h * .26, '#FF7FA0');
    } else if (mood === 'happy') {
      d.poly(smooth([[-.2, .66], [0, .7], [.2, .66], [.14, .84], [0, .92], [-.14, .84]], true, 5), '#7A1F4F', { ow: .028 }); d.ell(0, .84, .09, .05, '#FF7FA0');
    } else if (mood === 'shy') d.taper(smooth([[-.1, .72], [-.04, .68], [.04, .74], [.1, .7]], false, 4), .028, .028, 0, AP.ink);
    else if (mood === 'worry') d.taper(smooth([[-.1, .76], [0, .7], [.1, .76]], false, 4), .028, .028, 0, AP.ink);
    else if (mood === 'fierce') d.taper(smooth([[-.14, .72], [0, .74], [.14, .72]], false, 4), .035, .035, 0, AP.ink);
    else d.taper(smooth([[-.1, .68], [0, .74], [.1, .68]], false, 4), .026, .026, 0, AP.ink);
  }
  // hair cap with bang locks
  const cap: Pt[] = [[1.06, .05], [1.08, -.5], [.85, -.95], [.4, -1.16], [-.1, -1.2], [-.6, -1.08], [-.95, -.78], [-1.08, -.4], [-1.06, .05], [-.98, .45], [-.92, .72], [-.82, .1], [-.74, -.22], [-.58, -.44], [-.46, -.3], [-.3, -.48], [-.2, -.1], [-.08, -.4], [.08, -.06], [.2, -.42], [.3, -.5], [.46, -.28], [.6, -.46], [.74, -.2], [.84, .1], [.92, .72], [.98, .45]];
  if (op.back) { d.poly(smooth([[-1.08, -.2], [-1.0, -.85], [-.5, -1.22], [.5, -1.22], [1.0, -.85], [1.08, -.2], [1.04, .5], [.7, .9], [0, 1.02], [-.7, .9], [-1.04, .5]], true, 6), HAIR.base, { ow: .045 }); d.poly(smooth([[-.7, -.95], [-.2, -1.1], [.3, -1.05], [.1, -.85], [-.4, -.8]], true, 5), HAIR.hi, { opacity: .95 }); }
  else {
    d.poly(cap, HAIR.base, { ow: .045 });
    // hard shadow under the bang tips and a highlight band
    if (!lite) d.poly(smooth([[-1.0, -.2], [-.7, -.28], [-.4, -.22], [-.2, -.3], [0, -.2], [.2, -.32], [.5, -.24], [.8, -.3], [1.0, -.2], [1.02, -.4], [.9, -.9], [.4, -1.1], [-.2, -1.15], [-.8, -.9], [-1.02, -.4]], true, 5), HAIR.shade, { opacity: .35 });
    d.poly(smooth([[-.72, -.82], [-.3, -1.02], [.25, -1.04], [.62, -.88], [.3, -.88], [-.1, -.86], [-.45, -.72]], true, 5), HAIR.hi, { opacity: .95 });
    if (!lite) d.ell(.52, -.9, .07, .025, AP.white, { rot: -22, opacity: .9 });
    if (!lite) d.tapers([{ c: [[-.52, -.64], [-.5, -.42], [-.52, -.3]] as Pt[], w0: .035, w1: 0 }, { c: [[.22, -.7], [.24, -.5], [.22, -.36]] as Pt[], w0: .035, w1: 0 }, { c: [[.6, -.62], [.62, -.46], [.6, -.32]] as Pt[], w0: .035, w1: 0 }], HAIR.line, { opacity: .85 });
  }
  // ahoge + hair ties + blossom pin
  d.taper(smooth([[0, -1.15], [-.12, -1.42], [.1, -1.6], [.28, -1.46], [.18, -1.36]], false, 6), .07, .01, 0, HAIR.base, { ow: .03 });
  for (const sx of [-1, 1]) { d.ell(sx * .98, -.5, .17, .12, AP.lav, { ow: .035, rot: sx * -30 }); d.ell(sx * .98, -.5, .06, .06, AP.white); }
  const bx = tf.flip ? -.62 : .62; void bx;
  if (lite) d.circ(.66, -.82, .14, AP.white, { ow: .03 });
  else for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 - 1.2; d.ell(.66 + Math.cos(a) * .12, -.82 + Math.sin(a) * .12, .09, .1, AP.white, { ow: .022, rot: a * 57 + 90 }); }
  d.circ(.66, -.82, .05, AP.gold, { ow: .02 });
}

export function eye(d: ReturnType<typeof drawer>, sx: number, mood: Mood, look: [number, number], lite = false) {
  const ex = sx * .43, ey = .22; const ink = AP.ink;
  const closed = mood === 'happy' || mood === 'sleepy';
  if (closed) {
    const up = mood === 'happy';
    const c = smooth(up ? [[sx * .2, ey + .08], [sx * .43, ey - .16], [sx * .68, ey + .08]] : [[sx * .2, ey - .02], [sx * .43, ey + .14], [sx * .68, ey - .02]], false, 6);
    d.taper(c, .035, .035, .045, ink);
    if (up) d.taper(smooth([[sx * .62, ey - .02], [sx * .76, ey - .1]], false, 3), .04, 0, 0, ink);
    return;
  }
  const wow = mood === 'wow', fierce = mood === 'fierce';
  d.ell(ex, ey, .255, .3, AP.white, { rot: sx * -5 });
  const ix = ex + look[0] * .04, iy = ey + .03 + look[1] * .04, irx = wow ? .225 : .205, iry = wow ? .29 : .275;
  d.ell(ix, iy, irx, iry, '#4B3FD0', { gradient: lin(90, '#2A1F75', '#5946E0', '#6FE6FF') });
  d.ell(ix, iy + .02, wow ? .07 : .09, wow ? .1 : .13, '#140F3A');
  if (!lite) d.ell(ix, iy - .13, irx, .11, '#1B1559', { opacity: .55 });
  d.ell(ix - .075, iy - .1, wow ? .095 : .078, wow ? .115 : .098, AP.white);
  d.circ(ix + .085, iy + .1, .036, AP.white);
  if (!lite) d.ell(ix + .01, iy + .2, .13, .045, '#CFF8FF', { opacity: .9 });
  if ((wow || fierce) && !lite) d.poly(star4(ix + .1, iy - .13, .06, .3).map(p => [p[0], p[1]] as Pt), AP.white, {});
  // upper lash line (heavy), outer flick and two lashes; lower lash
  const lid = smooth([[sx * .17, ey + .08], [sx * .27, ey - .2], [sx * .45, ey - .32], [sx * .63, ey - .22], [sx * .72, ey - .04]], false, 6);
  d.taper(lid, .028, .06, .05, ink);
  d.taper(smooth([[sx * .66, ey - .14], [sx * .77, ey - .2], [sx * .83, ey - .3]], false, 4), .06, 0, 0, ink);
  if (!lite) d.tapers([{ c: [[sx * .6, ey - .24], [sx * .72, ey - .36]] as Pt[], w0: .035, w1: 0 }, { c: [[sx * .5, ey - .3], [sx * .58, ey - .43]] as Pt[], w0: .03, w1: 0 }], ink);
  if (!lite) d.taper(smooth([[sx * .27, ey + .27], [sx * .43, ey + .32], [sx * .6, ey + .22]], false, 4), .014, .014, 0, ink, { opacity: .65 });
}

/** The chibi body, drawn BEFORE the head so the chin and tails overlap it. */
export function sakuraBody(out: O[], tf: Tf, pose: Pose = 'stand', back = false): void {
  if (pose === 'none') return;
  const d = drawer(tf, out); const ow = .04;
  const run = pose === 'run';
  // legs
  const legs = run ? [{ top: [-.2, 2.3] as Pt, knee: [-.62, 2.55] as Pt, foot: [-.95, 2.4] as Pt }, { top: [.2, 2.3] as Pt, knee: [.5, 2.62] as Pt, foot: [.62, 3.02] as Pt }] : [{ top: [-.22, 2.3] as Pt, knee: [-.25, 2.65] as Pt, foot: [-.27, 3.0] as Pt }, { top: [.22, 2.3] as Pt, knee: [.25, 2.65] as Pt, foot: [.27, 3.0] as Pt }];
  for (const l of legs) { const c = smooth([l.top, l.knee, l.foot], false, 5); d.poly(taperPts(c, .26, .2, 0), AP.skin, { ow }); const sock = c.slice(Math.floor(c.length * .55)); d.poly(taperPts(sock, .23, .2, 0), AP.white, { ow }); d.ell(l.foot[0] + (run ? .05 : 0), l.foot[1] + .04, .21, .1, AP.sakuraD, { ow }); }
  // arms
  const arm = (s: number): Pt[] => {
    if (pose === 'wave' && s > 0) return [[.5, 1.15], [.9, .95], [1.12, .55]];
    if (pose === 'cheer') return [[s * .5, 1.15], [s * .95, .85], [s * 1.12, .35]];
    if (run) return s > 0 ? [[.5, 1.2], [.9, 1.45], [1.1, 1.2]] : [[-.5, 1.2], [-.9, 1.5], [-1.15, 1.85]];
    if (pose === 'lean') return [[s * .5, 1.2], [s * .85, 1.5], [s * 1.0, 1.82]];
    return [[s * .5, 1.2], [s * .78, 1.5], [s * .84, 1.85]];
  };
  const torsoTop = 1.0;
  d.poly(smooth([[-.52, torsoTop], [-.6, 1.5], [-.56, 2.0], [.56, 2.0], [.6, 1.5], [.52, torsoTop]], true, 5), AP.lav, { ow });
  d.poly(smooth([[.52, torsoTop], [.6, 1.5], [.56, 2.0], [.2, 2.0], [.34, 1.5]], true, 5), AP.lavD, { opacity: .55 });
  d.ell(0, .98, .18, .09, AP.skin, { ow: .03 });
  if (!back) {
    d.poly([[-.36, 1.0], [0, 1.52], [.36, 1.0], [.5, 1.08], [.18, 1.64], [-.18, 1.64], [-.5, 1.08]], AP.white, { ow: .03 });
    d.poly([[-.3, 1.08], [0, 1.5], [.3, 1.08]], AP.sakuraL, { opacity: .0 });
    d.poly([[-.2, 1.5], [-.5, 1.42], [-.5, 1.7], [-.2, 1.58], [0, 1.54], [.2, 1.58], [.5, 1.7], [.5, 1.42], [.2, 1.5]], AP.hot, { ow: .03 });
    d.circ(0, 1.54, .09, AP.sakura, { ow: .025 });
  } else {
    d.poly([[-.36, 1.0], [0, 1.18], [.36, 1.0], [.46, 1.1], [0, 1.4], [-.46, 1.1]], AP.white, { ow: .03 });
  }
  // skirt with hard-shadow pleats
  d.poly(smooth([[-.58, 1.92], [-.92, 2.42], [-.5, 2.5], [0, 2.46], [.5, 2.5], [.92, 2.42], [.58, 1.92]], true, 4), AP.lavD, { ow });
  d.tapers([-.55, -.18, .18, .55].map(x => ({ c: [[x * .7, 2.0], [x * 1.18, 2.46]] as Pt[], w0: .025, w1: 0 })), AP.night2, { opacity: .45 });
  d.taper([[-.58, 1.96], [.58, 1.96]], .07, .07, 0, AP.white);
  for (const s of [-1, 1]) {
    const a = arm(s); const c = smooth(a, false, 5);
    d.poly(taperPts(c, .27, .2, 0), AP.skin, { ow }); d.poly(taperPts(c.slice(0, Math.floor(c.length * .5)), .3, .28, 0), AP.lav, { ow });
    const h = a[a.length - 1]; d.circ(h[0], h[1], .15, AP.skin, { ow });
  }
}

/** A complete Sakura: body then head. cx,cy = FACE centre, s = head radius. */
export function sakura(out: O[], tf: Tf, pose: Pose = 'stand', op: SakuraOpts = {}): void {
  if (pose !== 'none') sakuraBody(out, tf, pose, !!op.back);
  sakuraHead(out, tf, op);
}

/** Small chibi face for reaction panels and stickers (head only). */
export function chibiFace(out: O[], cx: number, cy: number, s: number, mood: Mood, extras: { sweat?: boolean; hearts?: boolean; vein?: boolean; sparkle?: boolean } = {}, rot = 0): void {
  sakuraHead(out, { cx, cy, s, rot }, { mood });
  void extras;
}

// ── Kumo, the friendly sky whale ────────────────────────────────────────────
const KU = { back: '#8E9CFF', backD: '#6A78EA', backL: '#B9C4FF', belly: '#E9ECFF', bellyD: '#C4CBF7', fin: '#7684F2', star: '#FFE14D' };
export interface WhaleOpts { mood?: 'smile' | 'wow' | 'sleep'; stars?: boolean; night?: boolean; tailBend?: number; glowOn?: boolean }
/** Length 2 units: tail at x=-1.25, nose at x=+1 (before flip). cx,cy = body centre; s = half length. */
export function whale(out: O[], tf: Tf, op: WhaleOpts = {}): void {
  const d = drawer(tf, out); const night = !!op.night; const bend = op.tailBend ?? 0;
  const cB = night ? '#4C58B8' : KU.back, cBD = night ? '#343F94' : KU.backD, cBL = night ? '#7480E0' : KU.backL, cBe = night ? '#9AA6F0' : KU.belly, cBeD = night ? '#6B78D2' : KU.bellyD;
  const U = smooth([[-.78, -.04 + bend * .05], [-.5, -.24], [-.1, -.42], [.3, -.44], [.7, -.34], [.93, -.14], [1.0, .06]], false, 8);
  const Lw = smooth([[1.0, .06], [.92, .26], [.62, .44], [.2, .52], [-.25, .42], [-.6, .22], [-.78, -.04 + bend * .05]], false, 8);
  const body = [...U, ...Lw];
  if (op.glowOn) d.ell(0, 0, 1.45, .9, KU.star, { gradient: glowPaint(KU.star, .35), label: 'Whale glow' } as never);
  // flukes (bent upward as if mid-flight) behind the body
  d.poly(smooth([[-.7, -.05], [-.92, -.2 - bend * .05], [-1.12, -.5 - bend * .1], [-1.34, -.52 - bend * .1], [-1.28, -.28], [-1.08, -.04], [-1.3, .16], [-1.36, .42], [-1.14, .44], [-.92, .24]], true, 5), cB, { ow: .035 });
  d.poly(smooth([[-.98, -.1], [-1.14, -.4], [-1.3, -.46], [-1.2, -.22], [-1.04, -.04]], true, 5), cBD, { opacity: .8 });
  d.poly(body, cB, { ow: .035 });
  // belly: pale zone + hard-edged shadow zone, built from the lower outline
  const inset = (chain: Pt[], k: number, y: number): Pt[] => chain.map(p => [p[0], lerp(p[1], y, k)] as Pt);
  const lw = Lw.slice(2, Lw.length - 6);
  d.poly([...lw, ...inset(lw, .5, -.02).reverse()], cBe, {});
  d.poly([...lw, ...inset(lw, .18, 0).reverse()], cBeD, { opacity: .9 });
  const Lrear = Lw.slice(Lw.length - 14);
  d.poly([...Lrear, ...inset(Lrear, .3, -.05).reverse()], cBD, { opacity: .7 });
  // back highlight band
  const up = U.slice(4, U.length - 10);
  d.poly([...up, ...up.map(p => [p[0] + .02, p[1] + .1] as Pt).reverse()], cBL, { opacity: .95 });
  // ventral grooves
  const gr: Pt[][] = []; for (let i = 0; i < 5; i++) { const x0 = .75 - i * .2; gr.push(taperPts(smooth([[x0, .27 + i * .005], [x0 - .06, .36], [x0 - .18, .43]], false, 4), .012, .004)); }
  d.out.push(multiPoly(gr.map(g => g.map(d.P)), cBeD, { label: 'Belly grooves' }));
  // pectoral fin
  d.poly(smooth([[.28, .36], [.1, .66], [-.1, .82], [.0, .5], [.12, .36]], true, 5), night ? '#5360CC' : KU.fin, { ow: .03 });
  d.poly(smooth([[.14, .5], [.04, .68], [-.02, .62]], true, 4), cBL, { opacity: .8 });
  // face: giant gentle eye, smile, blush
  const ex = .66, ey = -.02;
  if (op.mood === 'sleep') { d.taper(smooth([[ex - .1, ey], [ex, ey + .06], [ex + .1, ey]], false, 5), .02, .02, .016, AP.ink); }
  else {
    d.ell(ex, ey, .105, .12, AP.white, { ow: .012 }); d.ell(ex + .01, ey + .01, .083, .102, '#4B3FD0', { gradient: lin(90, '#2A1F75', '#5946E0', '#6FE6FF') }); d.ell(ex + .01, ey + .02, .042, .06, '#140F3A');
    d.ell(ex - .02, ey - .035, .034, .042, AP.white); d.circ(ex + .045, ey + .045, .017, AP.white);
    d.taper(smooth([[ex - .11, ey + .01], [ex - .05, ey - .1], [ex + .05, ey - .13], [ex + .12, ey - .06]], false, 5), .012, .03, .014, AP.ink);
    d.taper(smooth([[ex + .09, ey - .08], [ex + .15, ey - .13], [ex + .18, ey - .19]], false, 3), .024, 0, 0, AP.ink);
  }
  d.ell(.52, .15, .075, .04, AP.sakura, { opacity: .6, blur: 1.5 });
  d.taper(smooth([[.99, .14], [.82, .24], [.62, .26], [.5, .2]], false, 6), .018, .018, .006, AP.ink);
  d.circ(.52, .21, .007, AP.ink);
  // blowhole mist on the back
  d.out.push(...[]);
  if (op.stars !== false) {
    const r = rng(11); const big: Pt[][] = [], small: Pt[][] = [], spots: Pt[][] = [];
    const along = [[-.42, -.3], [-.28, -.37], [-.14, -.4], [.02, -.42], [.18, -.41], [.34, -.39], [.5, -.33], [.64, -.25], [-.56, -.2]];
    along.forEach(([x, y], i) => { const [px, py] = [x, y + .05 + (i % 3) * .035]; big.push(star4(px, py, .07 - (i % 3) * .012, .28, 1)); if (i % 2 === 0) small.push(star4(px + .09, py + .06, .028, .3)); spots.push(ringPts(px - .1, py + .1, .014, 6)); });
    d.out.push(multiPoly(big.map(s => s.map(d.P)), KU.star, { stroke: AP.ink, strokeWidth: d.sw(.012), label: 'Back stars' }));
    d.out.push(multiPoly(small.map(s => s.map(d.P)), AP.white, { label: 'Back star glints' }));
    d.out.push(multiPoly(spots.map(s => s.map(d.P)), cBL, { opacity: .9, label: 'Back dots' }));
    void r;
  }
}

// ── Scenery props ───────────────────────────────────────────────────────────
export function hill(x0: number, x1: number, y: number, amp: number, seed: number, bottom: number, fill: string, grad?: [string, string]): O {
  const r = rng(seed); const n = 7; const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) pts.push([lerp(x0, x1, i / n), y - amp * (.3 + r() * .7) * (i % 2 ? 1 : .55)]);
  const crest = smooth(pts, false, 8);
  return poly([[x0, bottom], ...crest, [x1, bottom]], fill, { gradient: grad ? lin(90, grad[0], grad[1]) : undefined, label: 'Hill' });
}
/** Cherry tree: curved trunk, cloud-like canopy in pink tones, blossom dots. */
export function sakuraTree(out: O[], x: number, baseY: number, h: number, seed: number, flip = false): void {
  const d = drawer({ cx: x, cy: baseY, s: h, flip }, out); const r = rng(seed);
  d.poly(taperPts(smooth([[0, 0], [-.05, -.3], [.06, -.55], [.0, -.78]], false, 6), .14, .05, 0), '#6B4A66', { ow: .015 });
  d.taper(smooth([[.02, -.5], [.2, -.66], [.34, -.72]], false, 4), .06, .02, 0, '#6B4A66');
  const blobs: Array<[number, number, number, string]> = [[-.05, -.92, .3, AP.sakura], [.24, -.8, .22, AP.sakura], [-.3, -.78, .2, AP.sakura], [.0, -1.05, .2, AP.sakuraL], [.2, -.95, .16, AP.sakuraL]];
  for (const [bx, by, br, col] of blobs) d.ell(bx, by, br, br * .86, col, { ow: .012 });
  d.ell(-.1, -.82, .22, .14, AP.sakuraD, { opacity: .35 });
  const dots: Pt[][] = []; for (let i = 0; i < 9; i++) dots.push(ringPts(-.2 + r() * .5, -1.1 + r() * .4, .022, 6));
  d.out.push(multiPoly(dots.map(q => q.map(d.P)), AP.white, { opacity: .85, label: 'Blossoms' }));
}
/** A row of little pastel houses (cel-shaded roofs) for a town on a hill. */
export function townRow(out: O[], x0: number, x1: number, baseY: number, seed: number, scale = 1, palette: string[] = [AP.peachL, AP.lavL, AP.skyL, AP.white]): void {
  const r = rng(seed); let x = x0;
  while (x < x1) {
    const w = (46 + r() * 40) * scale, h = (40 + r() * 54) * scale; const col = palette[Math.floor(r() * palette.length)];
    out.push(rect(x, baseY - h, w, h, col, { stroke: AP.ink, strokeWidth: 2.5 * scale, label: 'House' }));
    out.push(rect(x + w * .66, baseY - h, w * .34, h, mix(col, -.14), { opacity: .7, label: 'House shade' }));
    const rc = r() > .5 ? AP.sakuraD : AP.lavD;
    out.push(poly([[x - 5 * scale, baseY - h], [x + w / 2, baseY - h - 34 * scale], [x + w + 5 * scale, baseY - h]], rc, { stroke: AP.ink, strokeWidth: 2.5 * scale, label: 'Roof' }));
    out.push(poly([[x + w / 2, baseY - h - 34 * scale], [x + w + 5 * scale, baseY - h], [x + w * .6, baseY - h]], mix(rc, -.22), { opacity: .6, label: 'Roof shade' }));
    out.push(rect(x + w * .2, baseY - h * .62, w * .22, h * .26, AP.gold, { stroke: AP.ink, strokeWidth: 1.8 * scale, label: 'Lit window' }));
    x += w + (8 + r() * 14) * scale;
  }
}
void circle; void ellipse; void radial; void arc; void petalPts; void poly; void rect;
