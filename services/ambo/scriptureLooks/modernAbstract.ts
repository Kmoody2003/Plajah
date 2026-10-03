// Modern & Abstract — 24 scripture looks from the six Art Council lenses.
//
// Modern, postmodern and abstract design, each look its own designer with its
// own composition: Bauhaus and De Stijl geometry, Swiss arcs, Memphis, riso,
// deconstructed type, op-art, gradient-mesh glass, generative tiles,
// data-as-art, cut paper, hard-edge suns, colour fields, constructivist
// diagonals and the radical minimum. Motifs stay generic and geometric.
//
// The rules from scriptureLayouts.ts hold: the verse is large, high-contrast,
// centred in a reading measure and never moves while settled; anything busy
// sits BEHIND a plate (or the composition is built so nothing crosses the
// verse); ornaments animate in and out with the transition and drift on the
// motion clock; every composition re-flows per aspect class.

import {
  type ScriptureLayout, type ScriptureState,
  aspectClass, SERIF, SANS, DISPLAY, GROTESK, MONO, clamp01, easeOut, easeInOut, easeBack, rgba,
  decoAlpha, fit, measure, drawVerse, drawReference, drawReferenceLead, drawCopyright, plate,
  safe, motionT, contextText, scratch, lightLeak, grain, halftone, coverFrame,
} from '../scriptureKit';

type C = CanvasRenderingContext2D;
type S = ScriptureState;
const TAU = Math.PI * 2;
const FAM = 'Modern & Abstract' as const;
const CM = 'the Classical Mind', RH = 'the Rebellious Hand', FU = 'the Futurist';
const WT = 'the World-Eclectic Traveller', BD = 'the Baroque Dramatist', RM = 'the Radical Minimalist';

// ── local helpers ────────────────────────────────────────────────────────────

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const U = (s: S) => Math.min(s.w, s.h);
const tall = (s: S) => { const c = aspectClass(s.w, s.h); return c === 'vertical' || c === 'portrait'; };
const wideCls = (s: S) => { const c = aspectClass(s.w, s.h); return c === 'ultrawide' || c === 'wall'; };

/** Verse size ceiling per aspect class (auditorium scale). */
function vMax(s: S, k = 1) {
  const c = aspectClass(s.w, s.h);
  return (c === 'vertical' ? s.w * 0.078 : c === 'portrait' ? s.w * 0.066 : s.h * 0.074) * k;
}
const vMin = (s: S) => Math.min(s.h * 0.024, s.w * 0.04);

/**
 * Staggered life of ornament i of n: `i` 0→1 on entrance (in order), `o` 0→1
 * on exit (reverse order), `v` = visible amount.
 */
function life(s: S, i = 0, n = 1, span = 0.4) {
  const k = n > 1 ? i / (n - 1) : 0;
  const ip = s.transition === 'crossfade' ? s.enterP : clamp01(s.enterP * 1.45);
  const inn = easeOut(clamp01((ip - k * span) / (1 - span)));
  const op = clamp01((s.exitP * 1.3 - (1 - k) * span * 0.5) / (1 - span * 0.5));
  const out = easeInOut(op);
  return { i: inn, o: out, v: inn * (1 - out) };
}

/** The reading block: plate rect (x,y,w,h) + text column (tx,ty,tw,th) at a fixed fitted size. */
interface Read { x: number; y: number; w: number; h: number; tx: number; ty: number; tw: number; th: number; size: number; lh: number }
function readBlock(ctx: C, s: S, o: { font: (z: number) => string; lh?: number; frac?: number; cx?: number; cy?: number; maxH?: number; pad?: number; padY?: number; k?: number }): Read {
  const cls = aspectClass(s.w, s.h);
  const lh = o.lh ?? 1.3;
  const bw = measure(s.w, s.h, o.frac ?? (cls === 'vertical' ? 0.8 : cls === 'portrait' ? 0.78 : 0.66));
  const maxH = o.maxH ?? s.h * (cls === 'vertical' ? 0.42 : cls === 'portrait' ? 0.44 : 0.48);
  const f = fit(ctx, s.text, o.font, bw, maxH, lh, vMax(s, o.k ?? 1), vMin(s));
  const th = f.lines.length * f.size * lh;
  ctx.font = o.font(f.size);
  let lw = 0;
  for (const l of f.lines) lw = Math.max(lw, ctx.measureText(l).width);
  const padX = f.size * (o.pad ?? 1.0), padY = f.size * (o.padY ?? 0.85);
  const refH = f.size * 1.25;
  const w = lw + padX * 2, h = th + refH + padY * 2;
  const cx = o.cx ?? s.w / 2, cy = o.cy ?? s.h * 0.5;
  return { x: cx - w / 2, y: cy - h / 2, w, h, tx: cx - lw / 2, ty: cy - h / 2 + padY, tw: lw, th, size: f.size, lh };
}

/** Set the verse + reference inside a read block (size locked so wrapping never changes). */
function setVerse(ctx: C, s: S, L: Read, o: { font: (z: number) => string; color: string; ref?: string; refFont?: (z: number) => string; align?: CanvasTextAlign; shadow?: number; refTrack?: number; refUpper?: boolean }) {
  const align = o.align ?? 'center';
  const r = drawVerse(ctx, s, { x: L.tx - 1, y: L.ty, w: L.tw + 2, h: L.th + 2, align, valign: 'top' }, { font: o.font, color: o.color, lh: L.lh, max: L.size, min: L.size, shadow: o.shadow });
  const rs = Math.max(12, L.size * 0.38);
  const rx = align === 'center' ? L.tx + L.tw / 2 : align === 'right' ? L.tx + L.tw : L.tx;
  drawReference(ctx, s, rx, r.bottom + L.size * 0.85, align, rs, o.ref ?? s.accent, { font: o.refFont ? o.refFont(rs) : undefined, tracking: o.refTrack, upper: o.refUpper });
  return r;
}

function rr(ctx: C, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, w, h, k); else ctx.rect(x, y, w, h);
}
function poly(ctx: C, pts: number[]) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}
function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
const bookOf = (s: S) => s.reference.replace(/\s*\d+[:.]\d+.*$/, '').trim() || s.reference;
const numOf = (s: S) => (s.reference.match(/\d+[:.]\d+(?:[-–]\d+)?/) || [''])[0];

/** Word lengths of the surrounding chapter (cached — data-as-art source). */
let lenKey = '', lenVals: number[] = [];
function wordLengths(src: string): number[] {
  if (src !== lenKey) {
    lenKey = src;
    lenVals = src.split(/\s+/).map(w => w.replace(/[^A-Za-z']/g, '').length).filter(n => n > 0);
    if (!lenVals.length) lenVals = [3, 5, 2, 7, 4];
  }
  return lenVals;
}

// ── Memphis shape kit ────────────────────────────────────────────────────────
function memphisShape(ctx: C, type: number, sz: number, mt: number, i: number) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (type) {
    case 0: { // squiggle
      ctx.strokeStyle = '#141414'; ctx.lineWidth = sz * 0.13; ctx.beginPath();
      for (let k = 0; k <= 28; k++) { const x = -sz + (k / 28) * sz * 2; const y = Math.sin((k / 28) * TAU * 2 + mt * 0.7 + i) * sz * 0.22; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); break;
    }
    case 1: { // triangle with offset shadow
      poly(ctx, [-sz * 0.6 + sz * 0.1, sz * 0.5 + sz * 0.1, sz * 0.1, -sz * 0.6 + sz * 0.1, sz * 0.7, sz * 0.5 + sz * 0.1]); ctx.fillStyle = '#141414'; ctx.fill();
      poly(ctx, [-sz * 0.6, sz * 0.5, 0, -sz * 0.6, sz * 0.6, sz * 0.5]); ctx.fillStyle = '#FF7EB6'; ctx.fill();
      break;
    }
    case 2: { // striped circle
      ctx.beginPath(); ctx.arc(0, 0, sz * 0.55, 0, TAU); ctx.fillStyle = '#FFD23F'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = '#141414';
      for (let k = -4; k <= 4; k++) ctx.fillRect(-sz, k * sz * 0.16 - sz * 0.025, sz * 2, sz * 0.05);
      ctx.restore(); break;
    }
    case 3: { // zigzag
      ctx.strokeStyle = '#21B8A8'; ctx.lineWidth = sz * 0.14; ctx.beginPath();
      for (let k = 0; k <= 6; k++) { const x = -sz * 0.8 + k * sz * 0.27, y = (k % 2 ? -1 : 1) * sz * 0.2; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); break;
    }
    case 4: { // confetti dashes
      ctx.strokeStyle = '#3A6BFF'; ctx.lineWidth = sz * 0.14;
      for (let k = 0; k < 3; k++) { const an = hash(i * 9 + k) * Math.PI; const ox = (k - 1) * sz * 0.45, oy = (hash(i + k * 3) - 0.5) * sz * 0.6; ctx.beginPath(); ctx.moveTo(ox - Math.cos(an) * sz * 0.18, oy - Math.sin(an) * sz * 0.18); ctx.lineTo(ox + Math.cos(an) * sz * 0.18, oy + Math.sin(an) * sz * 0.18); ctx.stroke(); }
      break;
    }
    default: { // dotted half-ring
      ctx.fillStyle = '#141414';
      for (let k = 0; k <= 9; k++) { const an = Math.PI + (k / 9) * Math.PI; ctx.beginPath(); ctx.arc(Math.cos(an) * sz * 0.6, Math.sin(an) * sz * 0.6 + sz * 0.2, sz * 0.06, 0, TAU); ctx.fill(); }
    }
  }
}

// ── organic cut-paper forms (generic, Matisse-like) ──────────────────────────
function paperForm(ctx: C, kind: number, R: number, ph: number) {
  if (kind === 0) { // lobed blob
    ctx.beginPath();
    const lobes = 5 + Math.floor(hash(ph) * 3);
    for (let k = 0; k <= 72; k++) { const th = (k / 72) * TAU; const r = R * (0.68 + 0.32 * Math.sin(lobes * th + ph)); k ? ctx.lineTo(Math.cos(th) * r, Math.sin(th) * r) : ctx.moveTo(Math.cos(th) * r, Math.sin(th) * r); }
    ctx.closePath(); ctx.fill();
  } else if (kind === 1) { // frond: leaflets along a spine
    for (let k = 0; k < 6; k++) {
      const y = R * 1.1 - k * R * 0.42, side = k % 2 ? 1 : -1;
      ctx.save(); ctx.translate(side * R * 0.12, y); ctx.rotate(side * 0.9);
      ctx.beginPath(); ctx.ellipse(side * R * 0.22, 0, R * 0.34 * (1 - k * 0.08), R * 0.13, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.fillRect(-R * 0.04, -R * 1.2, R * 0.08, R * 2.4);
  } else if (kind === 2) { // spiky star
    ctx.beginPath();
    for (let k = 0; k <= 16; k++) { const th = (k / 16) * TAU + ph; const r = k % 2 ? R * 0.42 : R; k ? ctx.lineTo(Math.cos(th) * r, Math.sin(th) * r) : ctx.moveTo(Math.cos(th) * r, Math.sin(th) * r); }
    ctx.closePath(); ctx.fill();
  } else { // teardrop
    ctx.beginPath(); ctx.moveTo(0, -R);
    ctx.bezierCurveTo(R * 0.8, -R * 0.2, R * 0.6, R * 0.8, 0, R * 0.8);
    ctx.bezierCurveTo(-R * 0.6, R * 0.8, -R * 0.8, -R * 0.2, 0, -R);
    ctx.fill();
  }
}

// ── the looks ────────────────────────────────────────────────────────────────

export const MODERN_ABSTRACT_LAYOUTS: ScriptureLayout[] = [
  // ════ the Classical Mind ════
  {
    id: 'ma-bauhaus-primer', name: 'Bauhaus Primer', family: FAM, background: 'opaque', director: CM, animated: true,
    blurb: 'Circle, square and triangle in primary colours roll into balance around a calm cream reading card.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), T = tall(s);
      const font = (z: number) => `500 ${z}px ${DISPLAY}`;
      const L = readBlock(ctx, s, { font, lh: 1.24 });
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#EAE2D0'; ctx.fillRect(0, 0, s.w, s.h);
      const wingL = Math.max(L.x, u * 0.22), wingR = Math.max(s.w - L.x - L.w, u * 0.22);
      const lx = T ? s.w * 0.26 : L.x * 0.5, rx = T ? s.w * 0.74 : s.w - (s.w - L.x - L.w) * 0.5;
      const ty = T ? L.y * 0.48 : s.h * 0.28, by = T ? L.y + L.h + (s.h - L.y - L.h) * 0.52 : s.h * 0.74;
      const sz = T ? Math.min(s.w * 0.34, Math.max(L.y, s.h - L.y - L.h) * 0.8) : Math.min(u * 0.46, Math.min(wingL, wingR) * 1.25);
      ctx.globalCompositeOperation = 'multiply';
      // blue square — drops from above
      let e = life(s, 0, 4);
      ctx.save(); ctx.translate(rx, by - (1 - e.i) * s.h * 0.7 + e.o * s.h * 0.7); ctx.rotate(0.22 + Math.sin(mt * 0.11) * 0.14 + e.o);
      ctx.fillStyle = '#2152A8'; ctx.fillRect(-sz * 0.4, -sz * 0.4, sz * 0.8, sz * 0.8); ctx.restore();
      // yellow triangle — slides from the right
      e = life(s, 1, 4);
      ctx.save(); ctx.translate(rx + (1 - e.i) * s.w * 0.5 + e.o * s.w * 0.5, ty + Math.sin(mt * 0.17) * u * 0.012); ctx.rotate(mt * 0.03);
      const tr = sz * 0.5; poly(ctx, [0, -tr, tr * 0.866, tr * 0.5, -tr * 0.866, tr * 0.5]); ctx.fillStyle = '#F2B705'; ctx.fill(); ctx.restore();
      // red circle — rolls in from the left
      e = life(s, 2, 4);
      const cx = lx + Math.sin(mt * 0.2) * u * 0.018 - (1 - e.i) * s.w * 0.5 - e.o * s.w * 0.5;
      ctx.beginPath(); ctx.arc(cx, ty, sz * 0.46, 0, TAU); ctx.fillStyle = '#D7332A'; ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#151515'; ctx.lineWidth = Math.max(2, u * 0.004);
      ctx.beginPath(); ctx.arc(cx, ty, sz * 0.58, mt * 0.15, mt * 0.15 + Math.PI * 1.2 * e.v); ctx.stroke();
      // black bar — extends along its axis
      e = life(s, 3, 4);
      ctx.save(); ctx.translate(lx + Math.sin(mt * 0.23) * sz * 0.08, by); ctx.rotate(-0.62);
      ctx.fillStyle = '#151515'; ctx.fillRect(-sz * 0.65 * e.v, -sz * 0.06, sz * 1.3 * e.v, sz * 0.12); ctx.restore();
      // dot row
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(rx - sz * 0.5 + k * sz * 0.25, by + sz * 0.62, sz * 0.03 * life(s, k, 5).v, 0, TAU); ctx.fill(); }
      // cream card
      const g = life(s, 0, 1).v;
      const cw = L.w * (0.3 + 0.7 * g);
      ctx.fillStyle = '#FBF8F0'; ctx.fillRect(L.x, L.y, cw, L.h);
      ctx.strokeStyle = '#151515'; ctx.lineWidth = Math.max(2, s.h * 0.0022); ctx.strokeRect(L.x, L.y, cw, L.h);
      ctx.fillStyle = '#D7332A'; ctx.fillRect(L.x, L.y, L.size * 0.34, L.size * 0.34);
      ctx.restore();
      drawReferenceLead(ctx, s, '#151515');
      setVerse(ctx, s, L, { font, color: '#141414', ref: '#C62E24', refFont: z => `700 ${z}px ${GROTESK}`, refTrack: 0.16 });
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.45, 'center', 'rgba(20,20,20,0.5)');
    },
  },
  {
    id: 'ma-golden-section', name: 'Golden Section', family: FAM, background: 'opaque', director: CM, animated: true,
    blurb: 'The frame divided by proportion into squares and a spiral, a point of light travelling its curve behind the verse.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s);
      const font = (z: number) => `${z}px ${SERIF}`;
      const L = readBlock(ctx, s, { font, lh: 1.36, pad: 1.3, padY: 1.0 });
      ctx.save(); ctx.globalAlpha = a;
      const bg = ctx.createLinearGradient(0, 0, 0, s.h); bg.addColorStop(0, '#101a2c'); bg.addColorStop(1, '#0a111e');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, s.w, s.h);
      // recursive subdivision (works at any aspect)
      let x = 0, y = 0, w = s.w, h = s.h, d = 0;
      const arcs: number[] = [];
      for (let i = 0; i < 11 && Math.min(w, h) > 6; i++) {
        for (let k = 0; k < 4; k++) { const horiz = d % 2 === 0; if ((horiz && w >= h) || (!horiz && h > w)) break; d = (d + 1) % 4; }
        const q = Math.min(w, h);
        let sx = x, sy = y, cx = 0, cy = 0, a0 = 0;
        if (d === 0) { cx = sx + q; cy = sy + q; a0 = Math.PI; x += q; w -= q; }
        else if (d === 1) { cx = sx; cy = sy + q; a0 = 1.5 * Math.PI; y += q; h -= q; }
        else if (d === 2) { sx = x + w - q; cx = sx; cy = sy; a0 = 0; w -= q; }
        else { sy = y + h - q; cx = sx + q; cy = sy; a0 = 0.5 * Math.PI; h -= q; }
        arcs.push(cx, cy, q, a0);
        const e = life(s, i, 11, 0.55);
        // breathing fill wave
        const wave = 0.5 + 0.5 * Math.sin(mt * 0.5 - i * 0.7);
        ctx.fillStyle = `rgba(201,176,122,${(0.015 + 0.03 * wave) * e.v})`; ctx.fillRect(sx, sy, q, q);
        ctx.strokeStyle = `rgba(201,176,122,${0.22 * e.v})`; ctx.lineWidth = Math.max(1, u * 0.0012);
        ctx.strokeRect(sx + 0.5, sy + 0.5, q - 1, q - 1);
        ctx.strokeStyle = `rgba(226,204,150,${0.55 * e.v})`; ctx.lineWidth = Math.max(1.5, u * 0.0022);
        ctx.beginPath(); ctx.arc(cx, cy, q, a0, a0 + (Math.PI / 2) * e.i); ctx.stroke();
        d = (d + 1) % 4;
      }
      // a point of light travelling the spiral
      const n = arcs.length / 4;
      const pos = ((mt * 0.035) % 1) * n, ai = Math.floor(pos) * 4, f = pos % 1;
      const px = arcs[ai] + Math.cos(arcs[ai + 3] + f * Math.PI / 2) * arcs[ai + 2];
      const py = arcs[ai + 1] + Math.sin(arcs[ai + 3] + f * Math.PI / 2) * arcs[ai + 2];
      const gl = ctx.createRadialGradient(px, py, 0, px, py, u * 0.06);
      gl.addColorStop(0, 'rgba(255,236,190,0.9)'); gl.addColorStop(0.15, 'rgba(255,226,160,0.35)'); gl.addColorStop(1, 'rgba(255,226,160,0)');
      ctx.fillStyle = gl; ctx.fillRect(px - u * 0.06, py - u * 0.06, u * 0.12, u * 0.12);
      ctx.restore();
      const g = life(s).v;
      plate(ctx, L.x, L.y + L.h * (1 - g) / 2, L.w, L.h * g, { tint: 'rgba(10,16,30,0.84)', blur: u * 0.02, r: 0, edge: rgba('#C9B07A', 0.55), alpha: a });
      ctx.save(); ctx.globalAlpha = a * g; ctx.strokeStyle = rgba('#C9B07A', 0.35); ctx.lineWidth = 1;
      ctx.strokeRect(L.x + L.size * 0.25, L.y + L.size * 0.25, L.w - L.size * 0.5, L.h - L.size * 0.5); ctx.restore();
      drawReferenceLead(ctx, s, '#E8D9B0');
      setVerse(ctx, s, L, { font, color: '#F4EEDF', ref: '#D9C08A', refFont: z => `${z * 1.05}px ${SERIF}`, refTrack: 0.3 });
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.45, 'center');
    },
  },
  {
    id: 'ma-international', name: 'International', family: FAM, background: 'opaque', director: CM, animated: true,
    blurb: 'Swiss-poster concentric arcs turn slowly from a corner; the verse is set flush-left in a clean black knockout.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), cls = aspectClass(s.w, s.h), m = safe(s);
      const font = (z: number) => `500 ${z}px ${GROTESK}`;
      const L = readBlock(ctx, s, { font, lh: 1.2, pad: 1.1, cy: s.h * (cls === 'vertical' ? 0.56 : 0.54) });
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#0C0C0C'; ctx.fillRect(0, 0, s.w, s.h);
      const ox = cls === 'vertical' ? s.w * 0.86 : cls === 'portrait' ? s.w * 0.88 : wideCls(s) ? s.w * 0.88 : s.w * 0.84;
      const oy = cls === 'vertical' ? s.h * 0.14 : cls === 'portrait' ? s.h * 0.12 : wideCls(s) ? s.h * 0.42 : s.h * 0.22;
      const rings = 18;
      for (let i = 0; i < rings; i++) {
        const e = life(s, i, rings, 0.5);
        const r = u * (0.07 + i * 0.062) * (1 + e.o * 0.25);
        const sp = (hash(i + 9) - 0.5) * 0.22;
        const st = hash(i) * TAU + mt * sp;
        const ext = (0.5 + hash(i + 3) * 2.2) * e.v;
        ctx.strokeStyle = i === 4 || i === 11 ? '#E3261F' : `rgba(240,238,232,${0.55 + 0.4 * hash(i + 7)})`;
        ctx.lineWidth = u * (0.008 + hash(i + 5) * 0.026);
        ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(ox, oy, r, st, st + ext); ctx.stroke();
      }
      // caption: book, red rule
      const cap = Math.max(12, s.h * (tall(s) ? 0.016 : 0.022));
      ctx.fillStyle = '#F0EEE8'; ctx.font = `700 ${cap}px ${GROTESK}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      (ctx as any).letterSpacing = `${Math.round(cap * 0.1)}px`;
      ctx.fillText(bookOf(s).toUpperCase(), m, m);
      (ctx as any).letterSpacing = '0px';
      ctx.fillStyle = '#E3261F'; ctx.fillRect(m, m + cap * 1.6, u * 0.16 * life(s).v, Math.max(3, u * 0.006));
      ctx.restore();
      const g = life(s).v;
      plate(ctx, L.x, L.y, L.w * (0.2 + 0.8 * g), L.h, { tint: 'rgba(12,12,12,0.95)', blur: 0, r: 0, alpha: a });
      drawReferenceLead(ctx, s, '#F0EEE8');
      setVerse(ctx, s, L, { font, color: '#F4F2EC', align: 'left', ref: '#E3261F', refFont: z => `700 ${z}px ${GROTESK}`, refTrack: 0.12 });
      drawCopyright(ctx, s, m, s.h - m * 0.45, 'left');
    },
  },
  {
    id: 'ma-neoplastic', name: 'Neo-Plastic', family: FAM, background: 'opaque', director: CM, animated: true,
    blurb: 'A De Stijl grid of black bars and primary planes builds itself around a large white reading cell.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s);
      const font = (z: number) => `500 ${z}px ${DISPLAY}`;
      const L = readBlock(ctx, s, { font, lh: 1.24, pad: 1.1 });
      const t = Math.max(6, u * 0.017);
      const osc = (k: number) => Math.sin(mt * 0.14 + k * 1.9) * u * 0.025;
      const x0 = L.x, x1 = L.x + L.w, y0 = L.y, y1 = L.y + L.h;
      const T = tall(s);
      // landscape: the grid divides the side wings; portrait: the bands above and below
      const xa = T ? s.w * 0.36 + osc(0) : Math.max(t * 2, x0 * 0.45 + osc(0));
      const xb = T ? s.w * 0.64 + osc(1) : Math.min(s.w - t * 2, x1 + (s.w - x1) * 0.56 + osc(1));
      const ya = Math.max(t * 2, y0 * 0.5 + osc(2)), yb = Math.min(s.h - t * 2, y1 + (s.h - y1) * 0.5 + osc(3));
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#F1EEE6'; ctx.fillRect(0, 0, s.w, s.h);
      // primary planes grow from their corners
      const cell = (i: number, col: string, rx: number, ry: number, rw: number, rh: number, fx: number, fy: number) => {
        const e = life(s, i, 5, 0.5); if (e.v <= 0 || rw <= 0 || rh <= 0) return;
        ctx.fillStyle = col; const ww = rw * e.v, hh = rh * e.v;
        ctx.fillRect(fx ? rx + rw - ww : rx, fy ? ry + rh - hh : ry, ww, hh);
      };
      if (T) {
        cell(0, '#D52B1E', 0, 0, xa, ya, 0, 0);
        cell(1, '#F2C500', xb, y1, s.w - xb, yb - y1, 1, 0);
        cell(2, '#1F4E9C', xb, yb, s.w - xb, s.h - yb, 1, 1);
        cell(3, '#141414', x1, 0, s.w - x1, ya, 1, 0);
      } else {
        cell(0, '#D52B1E', 0, 0, xa, ya, 0, 0);
        cell(1, '#1F4E9C', xb, yb, s.w - xb, s.h - yb, 1, 1);
        cell(2, '#F2C500', 0, y1, xa, s.h - y1, 0, 1);
        cell(3, '#141414', xb, 0, s.w - xb, Math.min(ya, y0) * 0.6, 1, 0);
        cell(4, '#F2C500', x1, yb, xb - x1, s.h - yb, 0, 1);
      }
      // reading cell
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x0, y0, L.w, L.h);
      // bars draw on
      ctx.fillStyle = '#141414';
      const bars: [number, number, number, number, number][] = T ? [
        [1, x0, 0, x0, s.h], [1, x1, 0, x1, s.h], [0, 0, y0, s.w, y0], [0, 0, y1, s.w, y1],
        [1, xa, 0, xa, y0], [1, xb, y1, xb, s.h], [0, 0, ya, xa, ya], [0, xb, yb, s.w, yb],
      ] : [
        [1, x0, 0, x0, s.h], [1, x1, 0, x1, s.h], [0, 0, y0, s.w, y0], [0, 0, y1, s.w, y1],
        [1, xa, 0, xa, y1], [1, xb, y0, xb, s.h], [0, 0, ya, x0, ya], [0, x1, yb, s.w, yb],
      ];
      bars.forEach(([vert, ax, ay, bx, by], i) => {
        const e = life(s, i, bars.length, 0.6); if (e.v <= 0) return;
        if (vert) { const len = (by - ay) * e.v; ctx.fillRect(ax - t / 2, i % 2 ? by - len : ay, t, len); }
        else { const len = (bx - ax) * e.v; ctx.fillRect(i % 2 ? bx - len : ax, ay - t / 2, len, t); }
      });
      ctx.restore();
      drawReferenceLead(ctx, s, '#141414');
      setVerse(ctx, s, L, { font, color: '#121212', ref: '#D52B1E', refFont: z => `700 ${z}px ${GROTESK}`, refTrack: 0.14 });
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.3, 'center', 'rgba(255,255,255,0.7)');
    },
  },

  // ════ the Rebellious Hand ════
  {
    id: 'ma-memphis', name: 'Memphis', family: FAM, background: 'opaque', director: RH, animated: true,
    blurb: 'Squiggles, zigzags, striped dots and confetti bounce around a black card with a hot-pink shadow.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s);
      const font = (z: number) => `600 ${z}px ${DISPLAY}`;
      const L = readBlock(ctx, s, { font, lh: 1.24, pad: 1.0 });
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#F6EDE0'; ctx.fillRect(0, 0, s.w, s.h);
      // drifting dot grid
      const gs = u * 0.055, off = (mt * u * 0.01) % gs;
      ctx.fillStyle = 'rgba(20,20,20,0.16)';
      for (let y = -gs + off; y < s.h + gs; y += gs) for (let x = -gs + off; x < s.w + gs; x += gs) ctx.fillRect(x, y, u * 0.004, u * 0.004);
      const n = 18;
      for (let i = 0; i < n; i++) {
        const e = life(s, i, n, 0.55);
        const th = (i / n) * TAU + hash(i) * 0.5;
        const rad = 0.62 + 0.3 * hash(i + 4);
        const ox = Math.cos(th), oy = Math.sin(th);
        const fly = e.o * u * 0.7;
        const x = s.w / 2 + ox * s.w * 0.5 * rad + ox * fly + Math.sin(mt * 0.3 + i) * u * 0.012;
        const y = s.h / 2 + oy * s.h * 0.5 * rad + oy * fly + Math.cos(mt * 0.26 + i * 2) * u * 0.012;
        const sz = u * (0.06 + 0.05 * hash(i + 2)) * (s.transition === 'crossfade' ? 1 : easeBack(e.i));
        if (sz <= 0.5) continue;
        ctx.save(); ctx.translate(x, y); ctx.rotate(hash(i + 1) * TAU + Math.sin(mt * 0.25 + i) * 0.3 + e.o * 3);
        memphisShape(ctx, i % 6, sz, mt, i); ctx.restore();
      }
      // card with hard shadow — slides up
      const e = life(s);
      const dy = (1 - (s.transition === 'crossfade' ? e.i : easeBack(e.i))) * s.h * 0.15 + e.o * s.h * 0.1;
      ctx.translate(0, dy);
      ctx.fillStyle = '#FF7EB6'; ctx.fillRect(L.x + L.size * 0.4, L.y + L.size * 0.4, L.w, L.h);
      ctx.fillStyle = '#141414'; ctx.fillRect(L.x, L.y, L.w, L.h);
      ctx.restore();
      ctx.save(); ctx.translate(0, dy);
      drawReferenceLead(ctx, s, '#141414');
      setVerse(ctx, s, L, { font, color: '#FFFFFF', ref: '#FFD23F', refFont: z => `700 ${z}px ${GROTESK}`, refTrack: 0.14 });
      ctx.restore();
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center', 'rgba(20,20,20,0.55)');
    },
  },
  {
    id: 'ma-riso', name: 'Risograph', family: FAM, background: 'opaque', director: RH, animated: true,
    blurb: 'Two-ink riso print — fluoro pink and blue overprinting, slightly off-register — with the verse on a clean paper card.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), T = tall(s);
      const font = (z: number) => `600 ${z}px ${GROTESK}`;
      const L = readBlock(ctx, s, { font, lh: 1.24, pad: 1.0 });
      const PINK = 'rgba(255,72,176,0.85)', BLUE = 'rgba(0,120,191,0.82)';
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#F2ECE1'; ctx.fillRect(0, 0, s.w, s.h);
      const e = life(s);
      const mis = u * 0.006 + (1 - e.i) * u * 0.08 + e.o * u * 0.1;
      const rx = Math.sin(mt * 0.6) * u * 0.003 + mis, ry = Math.cos(mt * 0.5) * u * 0.003 + mis * 0.6;
      ctx.globalCompositeOperation = 'multiply';
      const TL = { x: L.x, y: L.y }, BR = { x: L.x + L.w, y: L.y + L.h };
      const drift = (k: number) => Math.sin(mt * 0.12 + k) * u * 0.02;
      // pink circle (top-left of card) + blue echo ring
      const c1x = T ? s.w * 0.28 : TL.x + drift(0), c1y = T ? L.y * 0.55 : TL.y + drift(1);
      const r1 = T ? Math.min(s.w * 0.3, L.y * 0.6) : u * 0.32;
      ctx.fillStyle = PINK; ctx.beginPath(); ctx.arc(c1x, c1y, r1, 0, TAU); ctx.fill();
      ctx.strokeStyle = BLUE; ctx.lineWidth = u * 0.012; ctx.beginPath(); ctx.arc(c1x + rx, c1y + ry, r1 * 1.12, 0, TAU); ctx.stroke();
      // blue slab (bottom-right) + pink outline off-register
      const bx = T ? s.w * 0.66 : BR.x + drift(2), by = T ? BR.y + (s.h - BR.y) * 0.5 : BR.y + drift(3);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(-0.18 + Math.sin(mt * 0.08) * 0.04);
      ctx.fillStyle = BLUE; ctx.fillRect(-u * 0.3, -u * 0.17, u * 0.6, u * 0.34);
      ctx.strokeStyle = PINK; ctx.lineWidth = u * 0.008; ctx.strokeRect(-u * 0.3 - rx, -u * 0.17 - ry, u * 0.6, u * 0.34);
      ctx.restore();
      // pink stripe band
      ctx.save(); ctx.translate(T ? s.w * 0.5 : TL.x + L.w * 0.1, T ? BR.y + (s.h - BR.y) * 0.2 : BR.y + u * 0.04); ctx.rotate(-0.08);
      ctx.fillStyle = PINK;
      for (let k = 0; k < 6; k++) ctx.fillRect(-u * 0.3 + rx, k * u * 0.025, u * 0.5 * e.v, u * 0.011);
      ctx.restore();
      if (wideCls(s)) {
        ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(s.w * 0.07 + drift(4), s.h * 0.7, s.h * 0.24, 0, TAU); ctx.fill();
        ctx.fillStyle = PINK; ctx.fillRect(s.w * 0.9 - rx + drift(5), s.h * 0.12, s.h * 0.36, s.h * 0.5);
      }
      // halftone wash in blue, falling away from a corner
      halftone(ctx, s, 'rgba(0,120,191,0.42)', u * 0.03, 0.3, (fx, fy) => (1 - Math.hypot(fx - 0.15, fy - 0.85) * 1.8) * 0.9);
      ctx.globalCompositeOperation = 'source-over';
      grain(ctx, s, 0.07, 0);
      // paper card with off-register pink keyline
      const g = e.v;
      ctx.fillStyle = '#F8F3E9'; ctx.fillRect(L.x, L.y + L.h * (1 - g), L.w, L.h * g);
      ctx.strokeStyle = PINK; ctx.lineWidth = Math.max(2, u * 0.004); ctx.strokeRect(L.x + rx * 0.6, L.y + ry * 0.6 + L.h * (1 - g), L.w, L.h * g);
      ctx.restore();
      drawReferenceLead(ctx, s, '#1B2556');
      setVerse(ctx, s, L, { font, color: '#16204D', ref: '#E0287F', refFont: z => `700 ${z}px ${GROTESK}`, refTrack: 0.14 });
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center', 'rgba(22,32,77,0.55)');
    },
  },
  {
    id: 'ma-deconstruct', name: 'Deconstruct', family: FAM, background: 'opaque', director: RH, animated: true,
    blurb: 'Postmodern layers — the rest of the chapter torn into giant, rotated, outlined type — with the verse on a stark white slab.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s);
      const font = (z: number) => `600 ${z}px ${GROTESK}`;
      const L = readBlock(ctx, s, { font, lh: 1.22, pad: 1.0 });
      const verses = s.context?.length ? s.context : [contextText(s)];
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#161616'; ctx.fillRect(0, 0, s.w, s.h);
      const ROT = [0, -Math.PI / 2, 0, 0.11, 0, Math.PI / 2, -0.09, 0];
      const SZ = [0.17, 0.1, 0.24, 0.08, 0.13, 0.09, 0.19, 0.06];
      const YF = [0.13, 0.5, 0.42, 0.7, 0.88, 0.5, 0.25, 0.6];
      const XF = [0, 0.08, 0, 0, 0, 0.93, 0, 0];
      for (let k = 0; k < 8; k++) {
        const e = life(s, k, 8, 0.5);
        const txt = verses[k % verses.length].toUpperCase();
        const size = (ROT[k] && Math.abs(ROT[k]) > 1 ? s.w : s.h) * SZ[k] * (tall(s) && Math.abs(ROT[k]) < 1 ? 0.6 : 1);
        ctx.save();
        ctx.translate(XF[k] * s.w, YF[k] * s.h); ctx.rotate(ROT[k]);
        ctx.font = `800 ${size}px ${GROTESK}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        const lw = ctx.measureText(txt + '   ').width || 1;
        const dir = k % 2 ? 1 : -1;
        const span = Math.abs(ROT[k]) > 1 ? s.h : s.w;
        let x = ((((mt * dir * u * 0.02 * (1 + k * 0.15)) % lw) + lw) % lw) - lw - span * 0.5;
        x += dir * ((1 - e.i) + e.o) * span * 0.6;
        const fillA = [0.09, 0.0, 0.07, 0.0, 0.12, 0.0, 0.05, 0.3][k];
        for (; x < span * 1.2; x += lw) {
          if (k === 7) { ctx.fillStyle = `rgba(255,59,31,${0.45 * e.v})`; ctx.fillText(txt, x, 0); }
          else if (fillA > 0) { ctx.fillStyle = `rgba(240,236,228,${fillA * e.v})`; ctx.fillText(txt, x, 0); }
          else { ctx.strokeStyle = `rgba(240,236,228,${0.22 * e.v})`; ctx.lineWidth = Math.max(1, size * 0.012); ctx.strokeText(txt, x, 0); }
        }
        ctx.restore();
      }
      // crossing rules
      for (let k = 0; k < 3; k++) {
        const e = life(s, k, 3);
        ctx.save(); ctx.translate(s.w * (0.3 + k * 0.22), s.h * 0.5); ctx.rotate(-0.5 + k * 0.42);
        ctx.fillStyle = k === 1 ? `rgba(255,59,31,${0.7 * e.v})` : `rgba(240,236,228,${0.35 * e.v})`;
        const len = Math.hypot(s.w, s.h) * e.v;
        ctx.fillRect(-len / 2 + Math.sin(mt * 0.2 + k) * u * 0.05, -u * 0.004 * (k + 1), len, u * 0.008 * (k + 1)); ctx.restore();
      }
      // crop marks
      const m = safe(s), cm = u * 0.03;
      ctx.strokeStyle = 'rgba(240,236,228,0.5)'; ctx.lineWidth = 1;
      for (const [cx, cy] of [[m, m], [s.w - m, m], [m, s.h - m], [s.w - m, s.h - m]]) {
        ctx.beginPath(); ctx.moveTo(cx - cm, cy); ctx.lineTo(cx + cm, cy); ctx.moveTo(cx, cy - cm); ctx.lineTo(cx, cy + cm); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, cm * 0.45, 0, TAU); ctx.stroke();
      }
      // slabs: red under-layer, white reading slab — they separate on exit
      const e = life(s);
      const sep = (1 - e.i) * L.size * 3 + e.o * L.size * 4;
      ctx.fillStyle = '#FF3B1F'; ctx.fillRect(L.x - L.size * 0.45 - sep, L.y + L.size * 0.45 + sep, L.w, L.h);
      ctx.fillStyle = '#F4F1EA'; ctx.fillRect(L.x + sep * 0.5, L.y - sep * 0.5, L.w, L.h);
      ctx.restore();
      ctx.save(); ctx.translate(sep * 0.5, -sep * 0.5);
      drawReferenceLead(ctx, s, '#F4F1EA');
      setVerse(ctx, s, L, { font, color: '#111111', ref: '#E3301A', refFont: z => `800 ${z}px ${GROTESK}`, refTrack: 0.1 });
      ctx.restore();
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center');
    },
  },
  {
    id: 'ma-brutalist', name: 'Brutalist Slab', family: FAM, background: 'transparent', director: RH, animated: true,
    blurb: 'Over the picture: a raw black slab on an acid-yellow block, heavy grotesk type and a marching hazard band.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), T = tall(s);
      const font = (z: number) => `700 ${z}px ${GROTESK}`;
      const L = readBlock(ctx, s, { font, lh: 1.18, pad: 0.9, padY: 1.1, cy: s.h * (T ? 0.58 : 0.56) });
      const ACID = '#E4FF1A';
      ctx.save(); ctx.globalAlpha = a;
      // giant outline numeral behind, cropped
      const num = numOf(s) || '§';
      const ns = T ? s.w * 0.32 : s.h * 0.34;
      const e0 = life(s, 0, 3);
      ctx.font = `800 ${ns}px ${GROTESK}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.strokeStyle = rgba(ACID, 0.9 * e0.v); ctx.lineWidth = Math.max(2, ns * 0.012);
      ctx.strokeText(num, L.x - (1 - e0.i) * ns * 0.5, L.y + ns * 0.3);
      // acid block, wiping from the left
      const e1 = life(s, 1, 3);
      const off = L.size * 0.5;
      ctx.fillStyle = ACID; ctx.fillRect(L.x + off + L.w * e1.o, L.y + off, L.w * (e1.i - e1.o), L.h);
      // slab drops in
      const e2 = life(s, 2, 3);
      const dy = (1 - e2.i) * -s.h * 0.06 + e2.o * s.h * 0.08;
      ctx.translate(0, dy);
      ctx.fillStyle = `rgba(10,10,10,${0.92 * e2.v})`; ctx.fillRect(L.x, L.y, L.w, L.h);
      // hazard band along the top edge
      const bh = L.size * 0.32;
      ctx.save(); ctx.beginPath(); ctx.rect(L.x, L.y - bh, L.w, bh); ctx.clip();
      ctx.globalAlpha = a * e2.v;
      ctx.fillStyle = '#0A0A0A'; ctx.fillRect(L.x, L.y - bh, L.w, bh);
      ctx.fillStyle = ACID;
      const st = bh * 1.4, so = (mt * u * 0.03) % (st * 2);
      for (let x = L.x - st * 2 + so; x < L.x + L.w + st; x += st * 2) poly(ctx, [x, L.y, x + st, L.y, x + st + bh, L.y - bh, x + bh, L.y - bh]), ctx.fill();
      ctx.restore();
      ctx.restore();
      ctx.save(); ctx.translate(0, dy);
      drawReferenceLead(ctx, s, '#FFFFFF');
      setVerse(ctx, s, L, { font, color: '#FFFFFF', align: 'left', ref: ACID, refFont: z => `800 ${z}px ${GROTESK}`, refTrack: 0.12 });
      ctx.restore();
      drawCopyright(ctx, s, s.w - safe(s), s.h - safe(s) * 0.4, 'right');
    },
  },

  // ════ the Futurist ════
  {
    id: 'ma-op-art', name: 'Op Art', family: FAM, background: 'opaque', director: FU, animated: true,
    blurb: 'Black-and-white stripes ripple in an optical current behind a solid black reading panel.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), T = tall(s);
      const font = (z: number) => `500 ${z}px ${DISPLAY}`;
      const L = readBlock(ctx, s, { font, lh: 1.26, pad: 1.1 });
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#0A0A0A'; ctx.fillRect(0, 0, s.w, s.h);
      const e = life(s);
      const N = T ? 40 : 30;
      const amp = u * 0.045 * e.i * (1 + e.o * 2.5);
      const cxm = s.w * (0.5 + 0.35 * Math.sin(mt * 0.07));
      const freq = T ? 1.6 : wideCls(s) ? 3.6 : 2.4;
      const steps = 64, dx = s.w / steps;
      const Y = (j: number, x: number) => {
        const bump = Math.exp(-Math.pow((x - cxm) / (s.w * 0.32), 2)) * 0.85 + 0.15;
        return (j / N) * s.h * 1.06 - s.h * 0.03 + amp * bump * Math.sin((x / s.w) * TAU * freq + mt * 0.55 + j * 0.42);
      };
      ctx.fillStyle = '#ECECEC';
      const reveal = s.w * 0.5 * (s.transition === 'crossfade' ? 1 : e.i);
      ctx.save(); ctx.beginPath(); ctx.rect(s.w / 2 - reveal - 2, 0, reveal * 2 + 4, s.h); ctx.clip();
      for (let j = 0; j < N; j += 2) {
        ctx.beginPath();
        for (let k = 0; k <= steps; k++) { const x = k * dx; k ? ctx.lineTo(x, Y(j, x)) : ctx.moveTo(x, Y(j, x)); }
        for (let k = steps; k >= 0; k--) { const x = k * dx; ctx.lineTo(x, Y(j + 1, x)); }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.restore();
      const g = e.v;
      plate(ctx, L.x, L.y + L.h * (1 - g) / 2, L.w, L.h * g, { tint: 'rgba(6,6,6,0.96)', blur: 0, r: 0, edge: 'rgba(236,236,236,0.9)', alpha: a });
      ctx.save(); ctx.globalAlpha = a * g; ctx.fillStyle = '#FF3B30'; ctx.fillRect(L.x, L.y + L.h * (1 - g) / 2, Math.max(4, L.size * 0.12), L.h * g); ctx.restore();
      drawReferenceLead(ctx, s, '#FFFFFF');
      setVerse(ctx, s, L, { font, color: '#FFFFFF', ref: '#FF5A4E', refFont: z => `600 ${z}px ${GROTESK}`, refTrack: 0.18 });
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center', 'rgba(255,255,255,0.6)');
    },
  },
  {
    id: 'ma-glass-mesh', name: 'Glass Mesh', family: FAM, background: 'opaque', director: FU, animated: true, generator: 'LIQUID',
    blurb: 'A living gradient mesh of colour flows behind a frosted-glass panel with floating glass orbs.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s);
      const font = (z: number) => `500 ${z}px ${DISPLAY}`;
      const L = readBlock(ctx, s, { font, lh: 1.26, pad: 1.2, padY: 1.0 });
      const e = life(s);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#0B0820'; ctx.fillRect(0, 0, s.w, s.h);
      const hasGen = coverFrame(ctx, s, s.genFrame, 0.6);
      const COLS = ['#7B3FF2', '#FF5E7E', '#18C8E8', '#FFB443', '#3B5BFF'];
      ctx.globalCompositeOperation = 'screen';
      const R = Math.max(s.w, s.h) * 0.45 * (0.3 + 0.7 * e.i) * (1 - e.o * 0.5);
      for (let i = 0; i < (hasGen ? 2 : 5); i++) {
        const cx = s.w * (0.5 + 0.42 * Math.sin(mt * 0.11 * (1 + i * 0.17) + i * 1.7));
        const cy = s.h * (0.5 + 0.4 * Math.cos(mt * 0.09 * (1 + i * 0.13) + i));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, rgba(COLS[i], hasGen ? 0.35 : 0.75)); g.addColorStop(1, rgba(COLS[i], 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h);
      }
      ctx.globalCompositeOperation = 'source-over';
      // floating glass orbs in the margins
      for (let i = 0; i < 4; i++) {
        const oe = life(s, i, 4);
        const left = i % 2 === 0;
        const ox = tall(s) ? s.w * (0.2 + 0.6 * hash(i + 3)) : left ? L.x * (0.3 + 0.4 * hash(i)) : L.x + L.w + (s.w - L.x - L.w) * (0.3 + 0.4 * hash(i));
        const oy = tall(s) ? (i < 2 ? L.y * 0.5 : L.y + L.h + (s.h - L.y - L.h) * 0.5) : s.h * (0.22 + 0.56 * hash(i + 7));
        const or = u * (0.05 + 0.05 * hash(i + 11)) * oe.v;
        const fy = oy + Math.sin(mt * 0.3 + i * 1.3) * u * 0.02;
        if (or < 1) continue;
        ctx.beginPath(); ctx.arc(ox, fy, or, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, u * 0.0015); ctx.stroke();
        ctx.beginPath(); ctx.arc(ox, fy, or * 0.78, Math.PI * 1.1, Math.PI * 1.45); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
      }
      ctx.restore();
      const lift = (1 - e.i) * s.h * 0.04 - e.o * s.h * 0.03;
      ctx.save(); ctx.translate(0, lift);
      plate(ctx, L.x, L.y, L.w, L.h, { tint: 'rgba(14,10,34,0.52)', blur: u * 0.045, r: L.size * 0.8, edge: 'rgba(255,255,255,0.38)', alpha: a * e.v });
      ctx.save(); ctx.globalAlpha = a * e.v; rr(ctx, L.x, L.y, L.w, L.h, L.size * 0.8); ctx.clip();
      const sh = ctx.createLinearGradient(0, L.y, 0, L.y + L.h * 0.5); sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sh; ctx.fillRect(L.x, L.y, L.w, L.h * 0.5); ctx.restore();
      drawReferenceLead(ctx, s, '#FFFFFF');
      setVerse(ctx, s, L, { font, color: '#FFFFFF', shadow: s.h * 0.008, ref: 'rgba(255,255,255,0.85)', refFont: z => `600 ${z}px ${SANS}`, refTrack: 0.2 });
      ctx.restore();
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center', 'rgba(255,255,255,0.6)');
    },
  },
  {
    id: 'ma-truchet', name: 'Generative Grid', family: FAM, background: 'opaque', director: FU, animated: true,
    blurb: 'A generative field of quarter-circle tiles that keep flipping into new paths, rippling out from the reading plate.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), T = tall(s);
      const font = (z: number) => `400 ${z}px ${DISPLAY}`;
      const L = readBlock(ctx, s, { font, lh: 1.28, pad: 1.1 });
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#0A0F1C'; ctx.fillRect(0, 0, s.w, s.h);
      const c = u * (T ? 0.11 : 0.085);
      const cols = Math.ceil(s.w / c) + 1, rows = Math.ceil(s.h / c) + 1;
      const ox = (s.w - cols * c) / 2, oy = (s.h - rows * c) / 2;
      const maxd = Math.hypot(s.w, s.h) / 2;
      const ip = s.transition === 'crossfade' ? s.enterP : clamp01(s.enterP * 1.4);
      ctx.lineWidth = c * 0.11; ctx.lineCap = 'round';
      // batch arcs into a few paths by colour/brightness bucket (one stroke each)
      const NB = 6;
      const paths: Path2D[] = [];
      for (let b = 0; b < NB * 2; b++) paths.push(new Path2D());
      const hc = c / 2;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = ox + (i + 0.5) * c, y = oy + (j + 0.5) * c;
        const dd = Math.hypot(x - s.w / 2, y - s.h / 2) / maxd;
        const qi = clamp01(ip * 1.6 - dd * 0.6), qo = clamp01(s.exitP * 1.8 - (1 - dd) * 0.8);
        const sc = (s.transition === 'crossfade' ? 1 : easeBack(qi)) * (1 - easeInOut(qo));
        if (sc <= 0.02) continue;
        const h0 = hash(i * 31 + j * 17);
        const ph = mt * 0.16 + h0 * 7;
        const n = Math.floor(ph), lf = ph - n;
        const rot = (n + easeInOut(clamp01((lf - 0.82) / 0.18)) + (h0 > 0.5 ? 1 : 0)) * Math.PI / 2;
        const wave = 0.5 + 0.5 * Math.sin(dd * 9 - mt * 0.7);
        const p = paths[(h0 > 0.86 ? NB : 0) + Math.min(NB - 1, Math.floor(wave * NB))];
        const cr = Math.cos(rot) * hc * sc, sr = Math.sin(rot) * hc * sc, r = hc * sc;
        // arc 1 centred at rotated (-c/2,-c/2), arc 2 at rotated (c/2,c/2)
        const c1x = x + (-cr + sr), c1y = y + (-sr - cr), c2x = x + (cr - sr), c2y = y + (sr + cr);
        p.moveTo(c1x + Math.cos(rot) * r, c1y + Math.sin(rot) * r); p.arc(c1x, c1y, r, rot, rot + Math.PI / 2);
        p.moveTo(c2x + Math.cos(rot + Math.PI) * r, c2y + Math.sin(rot + Math.PI) * r); p.arc(c2x, c2y, r, rot + Math.PI, rot + Math.PI * 1.5);
      }
      for (let b = 0; b < NB * 2; b++) {
        const wv = (b % NB + 0.5) / NB;
        ctx.strokeStyle = b >= NB ? `rgba(255,94,170,${0.35 + 0.4 * wv})` : `rgba(79,209,255,${0.16 + 0.42 * wv})`;
        ctx.stroke(paths[b]);
      }
      ctx.restore();
      const g = life(s).v;
      plate(ctx, L.x + L.w * (1 - g) / 2, L.y, L.w * g, L.h, { tint: 'rgba(6,10,22,0.88)', blur: u * 0.02, r: L.size * 0.4, edge: 'rgba(79,209,255,0.5)', alpha: a });
      drawReferenceLead(ctx, s, '#BFEFFF');
      setVerse(ctx, s, L, { font, color: '#FFFFFF', ref: '#4FD1FF', refFont: z => `500 ${z}px ${MONO}`, refTrack: 0.14 });
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center');
    },
  },
  {
    id: 'ma-signal', name: 'Signal', family: FAM, background: 'transparent', director: FU, animated: true,
    blurb: 'Over the picture: the surrounding verses become a scrolling data skyline of word lengths beneath a glass reading plate.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), T = tall(s), m = safe(s);
      const font = (z: number) => `500 ${z}px ${GROTESK}`;
      const bandH = s.h * (T ? 0.1 : 0.15);
      const base = s.h - m * 0.7;
      const L = readBlock(ctx, s, { font, lh: 1.26, pad: 1.0, cy: (base - bandH) * 0.5 + m * 0.2, maxH: s.h * (T ? 0.42 : 0.44) });
      const vals = wordLengths(contextText(s));
      ctx.save(); ctx.globalAlpha = a;
      // legibility floor for the band
      const fl = ctx.createLinearGradient(0, base - bandH * 1.8, 0, s.h);
      fl.addColorStop(0, 'rgba(0,0,0,0)'); fl.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = fl; ctx.fillRect(0, base - bandH * 1.8, s.w, s.h - base + bandH * 1.8);
      const bw = Math.max(3, u * 0.006), step = bw * 1.9;
      const scroll = mt * u * 0.045;
      const i0 = Math.floor(scroll / step), sub = scroll % step;
      const ip = s.transition === 'crossfade' ? s.enterP : clamp01(s.enterP * 1.4);
      let prevY = 0, avg = 0;
      ctx.beginPath();
      for (let k = 0, x = -sub; x < s.w + step; k++, x += step) {
        const v = vals[(i0 + k) % vals.length];
        const xf = x / s.w;
        const q = clamp01(ip * 1.7 - xf * 0.7) * (1 - easeInOut(clamp01(s.exitP * 1.7 - (1 - xf) * 0.7)));
        const bh = Math.min(1, v / 11) * bandH * q;
        ctx.fillStyle = v >= 7 ? 'rgba(255,255,255,0.92)' : rgba(s.accent, 0.7);
        ctx.fillRect(x, base - bh, bw, bh);
        avg = avg * 0.85 + v * 0.15;
        const ay = base - bandH * 1.15 - Math.min(1, avg / 8) * bandH * 0.45 * q;
        if (k === 0) ctx.moveTo(x, ay); else ctx.lineTo(x, ay);
        prevY = ay;
      }
      void prevY;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(1.5, u * 0.002); ctx.stroke();
      // axis + caption
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, base, s.w * life(s).v, 1);
      const cap = Math.max(10, s.h * (T ? 0.011 : 0.016));
      ctx.font = `500 ${cap}px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      (ctx as any).letterSpacing = `${Math.round(cap * 0.12)}px`;
      ctx.fillText(`${bookOf(s).toUpperCase()} · CHAPTER · WORD LENGTH`, m, base - bandH * 1.7);
      (ctx as any).letterSpacing = '0px';
      ctx.restore();
      const g = life(s);
      ctx.save(); ctx.translate(0, (1 - g.i) * s.h * 0.03);
      plate(ctx, L.x, L.y, L.w, L.h, { tint: 'rgba(8,10,18,0.7)', blur: u * 0.03, r: L.size * 0.3, edge: rgba(s.accent, 0.45), alpha: a * g.v });
      drawReferenceLead(ctx, s, '#FFFFFF');
      setVerse(ctx, s, L, { font, color: '#FFFFFF', ref: s.accent, refFont: z => `500 ${z}px ${MONO}`, refTrack: 0.12 });
      ctx.restore();
    },
  },

  // ════ the World-Eclectic Traveller ════
  {
    id: 'ma-cut-paper', name: 'Cut Paper', family: FAM, background: 'opaque', director: WT, animated: true,
    blurb: 'Bold cut-paper leaves, stars and fronds sway around the edge of a deep blue field; the verse rests on a paper card.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s);
      const font = (z: number) => `${z}px ${SERIF}`;
      const L = readBlock(ctx, s, { font, lh: 1.32, pad: 1.1 });
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#1D3FA8'; ctx.fillRect(0, 0, s.w, s.h);
      const rg = ctx.createRadialGradient(s.w / 2, s.h / 2, 0, s.w / 2, s.h / 2, Math.max(s.w, s.h) * 0.7);
      rg.addColorStop(0, 'rgba(255,255,255,0.06)'); rg.addColorStop(1, 'rgba(0,0,20,0.25)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, s.w, s.h);
      const COLS = ['#F8F4EA', '#FF6B4A', '#FFD84A', '#2FA36B', '#111111', '#F8F4EA'];
      const n = wideCls(s) ? 20 : 14;
      const inset = u * 0.07, pw = s.w - inset * 2, ph = s.h - inset * 2, per = 2 * (pw + ph);
      for (let i = 0; i < n; i++) {
        const e = life(s, i, n, 0.5);
        let p = ((i + hash(i) * 0.6) / n) * per;
        let x: number, y: number;
        if (p < pw) { x = inset + p; y = inset; } else if ((p -= pw) < ph) { x = inset + pw; y = inset + p; } else if ((p -= ph) < pw) { x = inset + pw - p; y = inset + ph; } else { p -= pw; x = inset; y = inset + ph - p; }
        const R = u * (0.07 + 0.07 * hash(i + 5));
        const outx = x - s.w / 2, outy = y - s.h / 2, ol = Math.hypot(outx, outy) || 1;
        const fly = e.o * u * 0.5;
        ctx.save();
        ctx.translate(x + (outx / ol) * fly, y + (outy / ol) * fly + Math.sin(mt * 0.2 + i) * u * 0.006);
        ctx.rotate(hash(i + 2) * TAU + Math.sin(mt * 0.25 + i * 1.3) * 0.14 + e.o * 2);
        const sc = s.transition === 'crossfade' ? e.v : easeBack(e.i) * (1 - e.o * 0.4);
        ctx.scale(sc, sc);
        ctx.fillStyle = COLS[i % COLS.length];
        paperForm(ctx, i % 4, R, i * 1.7);
        ctx.restore();
      }
      // paper card with a soft cast shadow
      const e = life(s);
      const ty = (1 - e.i) * s.h * 0.05 + e.o * s.h * 0.05;
      ctx.translate(0, ty);
      ctx.fillStyle = 'rgba(0,0,30,0.3)'; ctx.fillRect(L.x + L.size * 0.25, L.y + L.size * 0.3, L.w, L.h);
      ctx.fillStyle = '#132E85'; ctx.fillRect(L.x, L.y, L.w, L.h);
      ctx.restore();
      grain(ctx, s, 0.04);
      ctx.save(); ctx.translate(0, ty);
      drawReferenceLead(ctx, s, '#FFFFFF');
      setVerse(ctx, s, L, { font, color: '#FFFFFF', ref: '#FFD84A' });
      ctx.restore();
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center');
    },
  },
  {
    id: 'ma-hard-edge-sun', name: 'Hard-Edge Sun', family: FAM, background: 'opaque', director: WT, animated: true,
    blurb: 'A hard-edged sun of earth-coloured bands rises on a striped horizon, its rays turning slowly beneath the verse.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), T = tall(s), m = safe(s);
      const font = (z: number) => `${z}px ${SERIF}`;
      const W = wideCls(s);
      const stripeH = s.h * 0.055;
      let L: ReturnType<typeof readBlock>, Rmax: number;
      const suns: number[] = [];
      if (W) {
        // wide walls: the verse holds the centre, a sun rises in each wing
        L = readBlock(ctx, s, { font, lh: 1.32, frac: 0.56, cy: s.h * 0.46 });
        const wing = (s.w - L.w) / 2;
        Rmax = Math.min(s.h * 0.44, wing * 0.46);
        suns.push(wing * 0.5, s.w - wing * 0.5);
      } else {
        Rmax = T ? s.w * 0.5 : s.h * 0.34;
        const sunTop = s.h - stripeH - Rmax;
        const zoneTop = m * 0.9, zoneBot = sunTop - u * 0.04;
        L = readBlock(ctx, s, { font, lh: 1.32, cy: (zoneTop + zoneBot) / 2, maxH: Math.min(s.h * 0.46, (zoneBot - zoneTop) * 0.74) });
        suns.push(s.w / 2);
      }
      const e = life(s);
      ctx.save(); ctx.globalAlpha = a;
      const sky = ctx.createLinearGradient(0, 0, 0, s.h); sky.addColorStop(0, '#1C1430'); sky.addColorStop(1, '#3B1E3C');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, s.w, s.h);
      const BANDS = ['#2C6E6A', '#E0A030', '#D9603B', '#F2D7A6', '#A33B4C', '#F7EFE0'];
      suns.forEach((cx, si) => {
        const cy = s.h - stripeH + Rmax * ((1 - e.i) + e.o) * 1.1;
        // rays — never across the verse block
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, s.w, s.h); ctx.rect(L.x - u * 0.02, L.y - u * 0.02, L.w + u * 0.04, L.h + u * 0.04); ctx.clip('evenodd');
        const nr = 24, rot = mt * 0.02 * (si ? -1 : 1);
        ctx.fillStyle = 'rgba(242,215,166,0.07)';
        for (let k = 0; k < nr; k++) {
          const a0 = rot + (k / nr) * TAU, a1 = a0 + TAU / nr / 2, R = Rmax * 1.45;
          poly(ctx, [cx, cy, cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R]); ctx.fill();
        }
        ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, s.w, s.h - stripeH); ctx.clip();
        BANDS.forEach((col, i) => {
          const r = Rmax * (1 - i / BANDS.length) * (1 + 0.018 * Math.sin(mt * 0.4 - i * 0.7 + si));
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, TAU); ctx.closePath(); ctx.fill();
        });
        ctx.restore();
      });
      // striped horizon
      const SC = ['#A33B4C', '#E0A030', '#2C6E6A', '#F2D7A6'];
      for (let k = 0; k < 4; k++) {
        const ek = life(s, k, 4);
        ctx.fillStyle = SC[k];
        const w = s.w * ek.v; ctx.fillRect(k % 2 ? s.w - w : 0, s.h - stripeH + (k * stripeH) / 4, w, stripeH / 4 + 1);
      }
      ctx.restore();
      drawReferenceLead(ctx, s, '#F7EFE0');
      setVerse(ctx, s, L, { font, color: '#FBF1E0', ref: '#E9B045' });
      drawCopyright(ctx, s, s.w - m, m * 0.7, 'right', 'rgba(251,241,224,0.45)');
    },
  },
  {
    id: 'ma-tessera', name: 'Tessera', family: FAM, background: 'opaque', director: WT, animated: true, generator: 'KALEIDOSCOPE',
    blurb: 'A shimmering triangle mosaic in earth and indigo tones flips into place behind a dark reading plate.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s);
      const font = (z: number) => `${z}px ${SERIF}`;
      const L = readBlock(ctx, s, { font, lh: 1.32, pad: 1.1 });
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#0E0C10'; ctx.fillRect(0, 0, s.w, s.h);
      const hasGen = coverFrame(ctx, s, s.genFrame, 0.55);
      const PAL = ['#C9853A', '#2B3A67', '#2F7F79', '#A8432F', '#E9D8B4', '#6B2F4F'];
      const side = u * (tall(s) ? 0.12 : 0.1), hh = side * 0.866;
      const rows = Math.ceil(s.h / hh) + 1, cols = Math.ceil(s.w / (side / 2)) + 2;
      const maxd = Math.hypot(s.w, s.h) / 2;
      const ip = s.transition === 'crossfade' ? s.enterP : clamp01(s.enterP * 1.4);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const up = (r + c) % 2 === 0;
        const x = c * side / 2 - side / 2, y = r * hh;
        const gx = x, gy = y + (up ? hh * 0.66 : hh * 0.33);
        const dd = Math.hypot(gx - s.w / 2, gy - s.h / 2) / maxd;
        const qi = clamp01(ip * 1.6 - dd * 0.6), qo = clamp01(s.exitP * 1.8 - dd * 0.8);
        const k = easeOut(qi) * (1 - easeInOut(qo)) * 0.9;
        if (k <= 0.02) continue;
        const h0 = hash(r * 57 + c * 13);
        const wave = 0.5 + 0.5 * Math.sin(mt * 0.6 + gx * 0.004 + gy * 0.006 + h0 * 3);
        ctx.fillStyle = PAL[Math.floor(h0 * PAL.length)];
        ctx.globalAlpha = a * (hasGen ? 0.22 + 0.2 * wave : 0.45 + 0.5 * wave);
        const p = up ? [x, y + hh, x + side / 2, y, x + side, y + hh] : [x, y, x + side, y, x + side / 2, y + hh];
        // shrink toward centroid (grout) and flip in vertically
        const ccx = (p[0] + p[2] + p[4]) / 3, ccy = (p[1] + p[3] + p[5]) / 3;
        for (let q = 0; q < 6; q += 2) { p[q] = ccx + (p[q] - ccx) * k; p[q + 1] = ccy + (p[q + 1] - ccy) * k; }
        poly(ctx, p); ctx.fill();
      }
      ctx.globalAlpha = a;
      const vg = ctx.createRadialGradient(s.w / 2, s.h / 2, U(s) * 0.2, s.w / 2, s.h / 2, Math.max(s.w, s.h) * 0.7);
      vg.addColorStop(0, 'rgba(14,12,16,0.25)'); vg.addColorStop(1, 'rgba(14,12,16,0.75)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, s.w, s.h);
      ctx.restore();
      const g = life(s).v;
      plate(ctx, L.x, L.y + L.h * (1 - g) / 2, L.w, L.h * g, { tint: 'rgba(14,12,16,0.88)', blur: u * 0.02, r: 0, edge: rgba('#E9D8B4', 0.45), alpha: a });
      drawReferenceLead(ctx, s, '#FBF4E6');
      setVerse(ctx, s, L, { font, color: '#FBF4E6', ref: '#E9B45A' });
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center');
    },
  },
  {
    id: 'ma-ribbons', name: 'Colour Ribbons', family: FAM, background: 'transparent', director: WT, animated: true,
    blurb: 'Over the picture: a sash of bright twisting ribbons flows along the lower edge beneath a dark reading plate.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), T = tall(s);
      const font = (z: number) => `${z}px ${SERIF}`;
      const L = readBlock(ctx, s, { font, lh: 1.32, pad: 1.1, cy: s.h * (T ? 0.48 : 0.44) });
      const COLS = ['#E8B23A', '#D2483C', '#2E8B7E', '#3A4FA0', '#F1E6D0'];
      const e = life(s);
      ctx.save(); ctx.globalAlpha = a;
      const sash = (yb: number, flip: number) => {
        const bt = u * 0.028, A = u * 0.05, steps = 72;
        const x0 = s.w * e.o, x1 = s.w * (s.transition === 'crossfade' ? 1 : e.i);
        if (x1 <= x0) return;
        ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, s.h); ctx.clip();
        const Y = (x: number) => yb + flip * (A * Math.sin((x / s.w) * TAU * (T ? 0.8 : 1.2) + mt * 0.35) + A * 0.4 * Math.sin((x / s.w) * TAU * 2.7 - mt * 0.22));
        const W = (x: number) => 0.55 + 0.45 * Math.cos((x / s.w) * TAU * 1.5 + mt * 0.27);
        COLS.forEach((col, k) => {
          const o0 = (k - 2.5), o1 = (k - 1.5);
          ctx.beginPath();
          for (let i = 0; i <= steps; i++) { const x = (i / steps) * s.w; const yy = Y(x) + o0 * bt * W(x); i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
          for (let i = steps; i >= 0; i--) { const x = (i / steps) * s.w; ctx.lineTo(x, Y(x) + o1 * bt * W(x)); }
          ctx.closePath(); ctx.fillStyle = rgba(col, 0.92); ctx.fill();
        });
        ctx.restore();
      };
      sash(s.h * (T ? 0.88 : 0.85), 1);
      if (T || aspectClass(s.w, s.h) === 'classic') sash(s.h * (T ? 0.1 : 0.12), -1);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = a * 0.6;
      const rg = ctx.createRadialGradient(s.w / 2, L.y + L.h / 2, 0, s.w / 2, L.y + L.h / 2, Math.max(L.w, L.h) * 0.9);
      rg.addColorStop(0, 'rgba(0,0,0,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, s.w, s.h); ctx.restore();
      plate(ctx, L.x, L.y, L.w, L.h, { tint: 'rgba(12,9,16,0.72)', blur: u * 0.02, r: L.size * 0.5, edge: 'rgba(241,230,208,0.35)', alpha: a * e.v });
      drawReferenceLead(ctx, s, '#FFFFFF');
      setVerse(ctx, s, L, { font, color: '#FFFFFF', ref: '#F0BE4A' });
    },
  },

  // ════ the Baroque Dramatist ════
  {
    id: 'ma-colour-field', name: 'Colour Field', family: FAM, background: 'opaque', director: BD, animated: true,
    blurb: 'Glowing soft-edged fields of vermilion and wine stacked like a great abstract painting, the verse in the dark middle field.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), m = safe(s);
      const font = (z: number) => `${z}px ${SERIF}`;
      const L = readBlock(ctx, s, { font, lh: 1.34, pad: 1.4, padY: 1.1 });
      const e = life(s);
      ctx.save(); ctx.globalAlpha = a;
      // paint the fields at low resolution and scale up: soft painterly edges for free
      const sw = 160, sh = Math.max(24, Math.round(160 * s.h / s.w));
      const off = scratch(sw, sh); const o = off.getContext('2d')!;
      const kx = sw / s.w, ky = sh / s.h;
      o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1;
      o.fillStyle = '#3D0E13'; o.fillRect(0, 0, sw, sh);
      const mx = s.w * (wideCls(s) ? 0.05 : 0.07), wob = (k: number) => Math.sin(mt * 0.13 + k * 2.1) * u * 0.006;
      const open = e.i * (1 - e.o * 0.6);
      const mid = s.h / 2;
      const field = (y0: number, y1: number, col: string, k: number, al: number) => {
        const cy = (y0 + y1) / 2, hh = (y1 - y0) * open;
        o.globalAlpha = al; o.fillStyle = col;
        o.fillRect((mx + wob(k)) * kx, (cy - hh / 2 + wob(k + 1)) * ky, (s.w - mx * 2) * kx, hh * ky);
      };
      const gap = u * 0.03;
      const top0 = m * 0.8, bot1 = s.h - m * 0.8;
      const breathe = 0.86 + 0.14 * Math.sin(mt * 0.3);
      field(top0, L.y - gap, '#C23B22', 0, breathe);
      field(L.y + L.h + gap, bot1, '#7A1A24', 2, 0.9 + 0.1 * Math.sin(mt * 0.23 + 1));
      field(L.y, L.y + L.h, '#1E0709', 4, 1);
      void mid;
      ctx.imageSmoothingEnabled = true; (ctx as any).imageSmoothingQuality = 'high';
      ctx.drawImage(off, 0, 0, sw, sh, 0, 0, s.w, s.h);
      lightLeak(ctx, s, ['#ff7a2f', '#ff3d4e'], 0.35);
      ctx.restore();
      grain(ctx, s, 0.05);
      drawReferenceLead(ctx, s, '#F7E6D0');
      setVerse(ctx, s, L, { font, color: '#F8EAD6', ref: '#F08A5D', refFont: z => `${z * 1.05}px ${SERIF}`, refTrack: 0.24 });
      drawCopyright(ctx, s, s.w / 2, s.h - m * 0.3, 'center', 'rgba(248,234,214,0.45)');
    },
  },
  {
    id: 'ma-agitprop', name: 'Agitprop Diagonal', family: FAM, background: 'opaque', director: BD, animated: true,
    blurb: 'A constructivist poster: a red wedge, a black disc and bars shooting along the diagonal around a black reading slab.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), T = tall(s);
      const font = (z: number) => `600 ${z}px ${GROTESK}`;
      const L = readBlock(ctx, s, { font, lh: 1.22, pad: 1.0 });
      const th = -Math.atan2(s.h, s.w) * 0.85;
      const dx = Math.cos(th), dy = Math.sin(th);
      const D = Math.hypot(s.w, s.h);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#EAE3D2'; ctx.fillRect(0, 0, s.w, s.h);
      // red wedge from the lower-left corner
      let e = life(s, 0, 5);
      const wsh = ((1 - e.i) + e.o) * D * 0.5;
      ctx.save(); ctx.translate(-dx * wsh, -dy * wsh);
      const br = 1 + 0.02 * Math.sin(mt * 0.3);
      poly(ctx, [-s.w * 0.02, s.h * 1.02, s.w * (T ? 0.95 : 0.5) * br, s.h * 1.02, -s.w * 0.02, s.h * (T ? 0.55 : 0.12) / br]);
      ctx.fillStyle = '#D8241B'; ctx.fill(); ctx.restore();
      // bars along the diagonal
      for (let k = 0; k < 4; k++) {
        e = life(s, k + 1, 5);
        const th2 = k === 0 ? u * 0.07 : u * (0.012 + 0.006 * k);
        const offN = (k - 1.2) * u * 0.11;
        const glide = Math.sin(mt * 0.18 + k * 1.4) * u * 0.06 + ((1 - e.i) * -1 + e.o) * D * (k % 2 ? 1 : -1);
        ctx.save(); ctx.translate(s.w / 2 - dy * offN + dx * glide, s.h / 2 + dx * offN + dy * glide); ctx.rotate(th);
        ctx.fillStyle = k === 2 ? '#D8241B' : '#141414';
        ctx.fillRect(-D * (0.3 + 0.12 * k), -th2 / 2, D * (0.6 + 0.1 * k), th2); ctx.restore();
      }
      // black disc + red square
      e = life(s, 4, 5);
      const dcx = T ? s.w * 0.74 : s.w * 0.82, dcy = T ? L.y * 0.5 : s.h * 0.22;
      const dr = (T ? Math.min(s.w * 0.18, L.y * 0.36) : u * 0.15) * (s.transition === 'crossfade' ? 1 : easeBack(e.i)) * (1 - e.o);
      if (dr > 0) {
        ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.arc(dcx + Math.sin(mt * 0.15) * u * 0.02, dcy, dr, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(dcx - dr * 1.3, dcy + dr * 1.2); ctx.rotate(th + mt * 0.05); ctx.fillStyle = '#D8241B'; ctx.fillRect(-dr * 0.22, -dr * 0.22, dr * 0.44, dr * 0.44); ctx.restore();
      }
      ctx.restore();
      grain(ctx, s, 0.05, 0);
      const g = life(s).v;
      plate(ctx, L.x, L.y, L.w * (0.25 + 0.75 * g), L.h, { tint: '#141414', blur: 0, r: 0, alpha: a });
      drawReferenceLead(ctx, s, '#141414');
      setVerse(ctx, s, L, { font, color: '#F4EFE4', ref: '#FF4A3A', refFont: z => `800 ${z}px ${GROTESK}`, refTrack: 0.14 });
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center', 'rgba(20,20,20,0.55)');
    },
  },
  {
    id: 'ma-prism', name: 'Prism', family: FAM, background: 'opaque', director: BD, animated: true,
    blurb: 'A single beam strikes a glass prism and throws a slow-swaying spectrum across the dark, behind a smoked reading plate.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), T = tall(s);
      const font = (z: number) => `${z}px ${SERIF}`;
      const L = readBlock(ctx, s, { font, lh: 1.32, pad: 1.1, cy: s.h * (T ? 0.58 : 0.5) });
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, s.w, s.h);
      const px = T ? s.w * 0.5 : Math.min(Math.max(L.x * 0.5, u * 0.22), s.w * 0.22), py = T ? Math.max(u * 0.22, L.y * 0.45) : s.h * 0.5;
      const side = u * (T ? 0.2 : 0.17);
      const e1 = life(s, 0, 2), e2 = life(s, 1, 2);
      ctx.translate(px, py); ctx.rotate(T ? Math.PI / 2 : 0);
      const v0 = [0, -side * 0.577], v1 = [-side / 2, side * 0.289], v2 = [side / 2, side * 0.289];
      const M = [(v0[0] + v1[0]) / 2, (v0[1] + v1[1]) / 2], N = [(v0[0] + v2[0]) / 2, (v0[1] + v2[1]) / 2];
      const D = Math.hypot(s.w, s.h) * 1.2;
      // incoming beam
      const src = [-D * 0.5, M[1] - D * 0.5 * 0.35];
      const bx = src[0] + (M[0] - src[0]) * e1.v, by = src[1] + (M[1] - src[1]) * e1.v;
      const bg = ctx.createLinearGradient(src[0], src[1], M[0], M[1]);
      bg.addColorStop(0, 'rgba(255,255,255,0)'); bg.addColorStop(1, 'rgba(255,255,255,0.85)');
      ctx.strokeStyle = bg; ctx.lineWidth = Math.max(2, u * 0.006);
      ctx.beginPath(); ctx.moveTo(src[0], src[1]); ctx.lineTo(bx, by); ctx.stroke();
      // spectrum fan
      const SPEC = ['#FF3B3B', '#FF8A2B', '#FFE14A', '#4BE36A', '#2FB8FF', '#4A5BFF', '#A34BFF'];
      const dir = 0.12 + Math.sin(mt * 0.15) * 0.07, spread = 0.36 + 0.05 * Math.sin(mt * 0.23);
      const len = D * e2.v;
      ctx.globalCompositeOperation = 'lighter';
      SPEC.forEach((col, i) => {
        const a0 = dir - spread / 2 + (i / SPEC.length) * spread, a1 = a0 + spread / SPEC.length;
        const g = ctx.createLinearGradient(N[0], N[1], N[0] + Math.cos(dir) * len, N[1] + Math.sin(dir) * len);
        g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        poly(ctx, [N[0], N[1], N[0] + Math.cos(a0) * len, N[1] + Math.sin(a0) * len, N[0] + Math.cos(a1) * len, N[1] + Math.sin(a1) * len]); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
      // the prism
      poly(ctx, [v0[0], v0[1], v1[0], v1[1], v2[0], v2[1]]);
      const pg = ctx.createLinearGradient(v1[0], v1[1], v2[0], v0[1]); pg.addColorStop(0, 'rgba(255,255,255,0.04)'); pg.addColorStop(1, 'rgba(255,255,255,0.16)');
      ctx.fillStyle = pg; ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.75 * e1.v + 0.1})`; ctx.lineWidth = Math.max(1.5, u * 0.003); ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.globalAlpha = a; lightLeak(ctx, s, ['#7a5bff', '#ff4f8a', '#2fb8ff'], 0.3); ctx.restore();
      const g = life(s);
      plate(ctx, L.x, L.y, L.w, L.h, { tint: 'rgba(6,6,10,0.82)', blur: u * 0.03, r: L.size * 0.3, edge: 'rgba(255,255,255,0.2)', alpha: a * g.v });
      drawReferenceLead(ctx, s, '#FFFFFF');
      setVerse(ctx, s, L, { font, color: '#FFFFFF', ref: '#C9B8FF' });
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center');
    },
  },
  {
    id: 'ma-proscenium', name: 'Proscenium', family: FAM, background: 'transparent', director: BD, animated: true,
    blurb: 'Over the picture: faceted gold-and-black shards sweep in like a stage curtain and a spotlight falls on the verse.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), T = tall(s);
      const font = (z: number) => `${z}px ${SERIF}`;
      const L = readBlock(ctx, s, { font, lh: 1.32, pad: 1.2, padY: 1.0 });
      ctx.save(); ctx.globalAlpha = a;
      // dim the picture a little for drama
      const vg = ctx.createRadialGradient(s.w / 2, s.h / 2, U(s) * 0.25, s.w / 2, s.h / 2, Math.max(s.w, s.h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0.25)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, s.w, s.h);
      // spotlight cone from above
      const sx = s.w / 2 + Math.sin(mt * 0.2) * U(s) * 0.08;
      const cone = ctx.createLinearGradient(0, 0, 0, L.y + L.h);
      cone.addColorStop(0, 'rgba(255,240,200,0.0)'); cone.addColorStop(1, 'rgba(255,240,200,0.12)');
      ctx.fillStyle = cone; poly(ctx, [sx - u * 0.04, 0, sx + u * 0.04, 0, L.x + L.w + u * 0.05, L.y + L.h, L.x - u * 0.05, L.y + L.h]); ctx.fill();
      // shards in (u along depth, v along edge)
      const SH = [
        [0, -0.05, 0.9, 0.1, 0, 0.36], [0, 0.2, 1, 0.44, 0, 0.6], [0, 0.48, 0.7, 0.66, 0, 0.86],
        [0, 0.72, 0.95, 0.96, 0, 1.06], [0, 0.04, 0.5, 0.26, 0.12, 0.5], [0, 0.56, 0.45, 0.8, 0.1, 1],
      ];
      const depth = T ? Math.min(s.h * 0.2, Math.max(L.y, s.h - L.y - L.h) * 0.95) : Math.min(u * 0.5, Math.max(L.x, u * 0.2) * 1.05);
      const sheen = (mt * 0.08) % 1;
      const sides = T ? ['top', 'bottom'] : ['left', 'right'];
      sides.forEach((side, si) => {
        SH.forEach((sh, i) => {
          const e = life(s, i, SH.length, 0.5);
          const pull = ((1 - e.i) + e.o) * depth * 1.3;
          const map = (uu: number, vv: number): [number, number] => {
            const dd = uu * depth - pull;
            if (side === 'left') return [dd, vv * s.h];
            if (side === 'right') return [s.w - dd, (1 - vv) * s.h];
            if (side === 'top') return [(1 - vv) * s.w, dd];
            return [vv * s.w, s.h - dd];
          };
          const p0 = map(sh[0], sh[1]), p1 = map(sh[2], sh[3]), p2 = map(sh[4], sh[5]);
          poly(ctx, [p0[0], p0[1], p1[0], p1[1], p2[0], p2[1]]);
          if ((i + si) % 2 === 0) {
            const g = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
            const k = (sheen + i * 0.17) % 1;
            g.addColorStop(0, '#6E5212'); g.addColorStop(Math.max(0, k - 0.15), '#A88326'); g.addColorStop(k, '#F6DC8A'); g.addColorStop(Math.min(1, k + 0.15), '#A88326'); g.addColorStop(1, '#5A430E');
            ctx.fillStyle = g;
          } else ctx.fillStyle = 'rgba(10,8,5,0.92)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(233,196,106,0.85)'; ctx.lineWidth = Math.max(1, u * 0.0016); ctx.stroke();
        });
      });
      ctx.restore();
      const g = life(s);
      plate(ctx, L.x, L.y, L.w, L.h, { tint: 'rgba(10,8,6,0.78)', blur: u * 0.02, r: 0, edge: 'rgba(233,196,106,0.7)', alpha: a * g.v });
      ctx.save(); ctx.globalAlpha = a * g.v; ctx.strokeStyle = 'rgba(233,196,106,0.35)'; ctx.lineWidth = 1;
      ctx.strokeRect(L.x + L.size * 0.22, L.y + L.size * 0.22, L.w - L.size * 0.44, L.h - L.size * 0.44); ctx.restore();
      drawReferenceLead(ctx, s, '#FFF6E0');
      setVerse(ctx, s, L, { font, color: '#FFF6E0', ref: '#E9C46A', refFont: z => `${z * 1.05}px ${SERIF}`, refTrack: 0.26 });
    },
  },

  // ════ the Radical Minimalist ════
  {
    id: 'ma-one-line', name: 'One Line', family: FAM, background: 'opaque', director: RM, animated: true,
    blurb: 'Warm white, one black line and a single travelling point — nothing else competes with the verse.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), W = wideCls(s);
      const font = (z: number) => `400 ${z}px ${GROTESK}`;
      const L = readBlock(ctx, s, { font, lh: 1.3, pad: W ? 1.6 : 0.6, padY: W ? 0.6 : 1.4 });
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#F3F2EE'; ctx.fillRect(0, 0, s.w, s.h);
      const e = life(s);
      const t = Math.max(2, s.h * 0.0028);
      ctx.fillStyle = '#141414';
      if (W) {
        const x = L.x, y0 = L.ty, len = L.h - (L.ty - L.y) * 2;
        ctx.fillRect(x, y0 + len * e.o, t, len * (e.i - e.o));
        const dp = 0.5 + 0.5 * Math.sin(mt * 0.12);
        if (e.v > 0.5) { ctx.beginPath(); ctx.arc(x + t / 2, y0 + len * dp, t * 3, 0, TAU); ctx.fill(); }
      } else {
        const y = L.y + L.size * 0.5, x0 = L.tx, len = L.tw * (0.92 + 0.08 * Math.sin(mt * 0.1));
        ctx.fillRect(x0 + len * e.o, y, len * (e.i - e.o), t);
        const dp = 0.5 + 0.5 * Math.sin(mt * 0.12);
        if (e.v > 0.5) { ctx.beginPath(); ctx.arc(x0 + len * dp, y + t / 2, t * 3, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
      void u;
      drawReferenceLead(ctx, s, '#141414');
      if (W) { const L2 = { ...L, tx: L.x + L.size * 1.6 - L.size * 0.6 }; setVerse(ctx, s, L2, { font, color: '#141414', align: 'left', ref: '#6B6B6B', refFont: z => `500 ${z}px ${GROTESK}`, refTrack: 0.24 }); }
      else setVerse(ctx, s, L, { font, color: '#141414', ref: '#6B6B6B', refFont: z => `500 ${z}px ${GROTESK}`, refTrack: 0.24 });
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center', 'rgba(20,20,20,0.45)');
    },
  },
  {
    id: 'ma-disc', name: 'Disc', family: FAM, background: 'opaque', director: RM, animated: true,
    blurb: 'Charcoal ground and one vermilion disc that breathes slowly beside the verse.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s), cls = aspectClass(s.w, s.h);
      const font = (z: number) => `${z}px ${SERIF}`;
      const stack = cls === 'vertical' || cls === 'portrait' || cls === 'classic';
      const L = readBlock(ctx, s, { font, lh: 1.34, frac: stack ? undefined : 0.56, cy: s.h * (stack ? 0.6 : 0.5), maxH: s.h * (stack ? 0.4 : 0.5) });
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#121214'; ctx.fillRect(0, 0, s.w, s.h);
      let cx: number, cy: number, r: number;
      if (stack) { cy = L.y * 0.52; r = Math.min(L.y * 0.34, s.w * 0.2); cx = cls === 'classic' ? L.x + L.w - r : s.w / 2; }
      else { const wing = s.w - L.x - L.w; cx = L.x + L.w + wing * 0.5; cy = s.h * 0.5; r = Math.min(wing * 0.34, s.h * 0.26); }
      const e = life(s);
      const rr2 = r * (1 + 0.03 * Math.sin(mt * 0.5)) * (s.transition === 'crossfade' ? 1 : easeBack(e.i)) * (1 - e.o * 0.7);
      const dcx = cx + Math.sin(mt * 0.07) * u * 0.01, dcy = cy + Math.cos(mt * 0.06) * u * 0.008 + e.o * u * 0.08;
      if (rr2 > 0.5) {
        const la = mt * 0.1;
        const g = ctx.createRadialGradient(dcx + Math.cos(la) * rr2 * 0.4, dcy + Math.sin(la) * rr2 * 0.4, rr2 * 0.1, dcx, dcy, rr2);
        g.addColorStop(0, '#F25A3F'); g.addColorStop(1, '#D63A24');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dcx, dcy, rr2, 0, TAU); ctx.fill();
      }
      ctx.restore();
      drawReferenceLead(ctx, s, '#FFFFFF');
      setVerse(ctx, s, L, { font, color: '#F6F4EF', ref: '#E8553A' });
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center');
    },
  },
  {
    id: 'ma-hairline', name: 'Hairline', family: FAM, background: 'transparent', director: RM, animated: true,
    blurb: 'Over the picture: a soft dark band, four hairline corners and one quiet tick tracing the frame of the verse.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), u = U(s);
      const font = (z: number) => `500 ${z}px ${SANS}`;
      const L = readBlock(ctx, s, { font, lh: 1.3, pad: 1.0, padY: 1.0 });
      ctx.save(); ctx.globalAlpha = a;
      const pad = L.h * 0.45;
      const band = ctx.createLinearGradient(0, L.y - pad, 0, L.y + L.h + pad);
      band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.25, 'rgba(0,0,0,0.58)'); band.addColorStop(0.75, 'rgba(0,0,0,0.58)'); band.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = band; ctx.fillRect(0, L.y - pad, s.w, L.h + pad * 2);
      const arm = L.size * 1.3, t = Math.max(1, s.h * 0.0014);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const corners: [number, number, number, number][] = [[L.x, L.y, 1, 1], [L.x + L.w, L.y, -1, 1], [L.x, L.y + L.h, 1, -1], [L.x + L.w, L.y + L.h, -1, -1]];
      corners.forEach(([x, y, sx, sy], i) => {
        const e = life(s, i, 4); const k = arm * e.v;
        ctx.fillRect(sx > 0 ? x : x - k, sy > 0 ? y : y - t, k, t);
        ctx.fillRect(sx > 0 ? x : x - t, sy > 0 ? y : y - k, t, k);
      });
      // a quiet tick travelling the bottom edge between the corners
      const span = L.w - arm * 2.4;
      if (span > 0) {
        const p = 0.5 + 0.5 * Math.sin(mt * 0.18);
        ctx.fillStyle = `rgba(255,255,255,${0.7 * life(s).v})`;
        ctx.fillRect(L.x + arm * 1.2 + span * p - u * 0.02, L.y + L.h - t, u * 0.04, t);
      }
      ctx.restore();
      drawReferenceLead(ctx, s, '#FFFFFF');
      setVerse(ctx, s, L, { font, color: '#FFFFFF', shadow: s.h * 0.012, ref: 'rgba(255,255,255,0.82)', refFont: z => `500 ${z}px ${SANS}`, refTrack: 0.32 });
    },
  },
  {
    id: 'ma-tone', name: 'Tone', family: FAM, background: 'opaque', director: RM, animated: true,
    blurb: 'One slow, deep two-tone gradient that turns and shifts hue over minutes — only the verse, large and quiet.',
    draw(ctx, s) {
      const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h);
      const font = (z: number) => `400 ${z}px ${DISPLAY}`;
      const L = readBlock(ctx, s, { font, lh: 1.28, frac: cls === 'vertical' ? 0.84 : 0.72 });
      const PAIRS: [string, string][] = [['#0F4A4C', '#0A1020'], ['#3E1F52', '#0B0D1C'], ['#4D2C14', '#120A08'], ['#1B3566', '#070B16']];
      const cyc = mt / 45, i0 = Math.floor(cyc) % PAIRS.length, i1 = (i0 + 1) % PAIRS.length, f = easeInOut(cyc % 1);
      const c1 = mixHex(PAIRS[i0][0], PAIRS[i1][0], f), c2 = mixHex(PAIRS[i0][1], PAIRS[i1][1], f);
      const e = life(s);
      ctx.save(); ctx.globalAlpha = a;
      const R = Math.hypot(s.w, s.h) / 2;
      ctx.beginPath(); ctx.arc(s.w / 2, s.h / 2, R * (s.transition === 'crossfade' ? 1 : e.i) * (1 - e.o * 0.4) + 1, 0, TAU); ctx.clip();
      const an = mt * 0.02;
      const gx = Math.cos(an) * R, gy = Math.sin(an) * R;
      const g = ctx.createLinearGradient(s.w / 2 - gx, s.h / 2 - gy, s.w / 2 + gx, s.h / 2 + gy);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h);
      // a single soft sheen crossing very slowly
      const sp = ((mt * 0.01) % 1.6) - 0.3;
      const sg = ctx.createLinearGradient(s.w * (sp - 0.25), 0, s.w * (sp + 0.25), s.h);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.05)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, s.w, s.h);
      ctx.restore();
      drawReferenceLead(ctx, s, '#FFFFFF');
      setVerse(ctx, s, L, { font, color: '#FFFFFF', ref: 'rgba(255,255,255,0.7)', refFont: z => `500 ${z}px ${SANS}`, refTrack: 0.3 });
      drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center');
    },
  },
];
