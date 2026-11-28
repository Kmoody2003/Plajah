// templatesCinematic — the Cinematic family: painted art that breathes behind
// calm, sturdy type, for contemporary services on wide LED walls.
//
// Direction comes from the Art Council's own themes. Dark scenes play under
// Sanctuary Classic (the Classical Mind: rise in, fade up). Parchment teaching
// slides play under Light & Airy (float). Only ornament moves: art drifts, light
// and dust wander on the wings, rules glint, coins shimmer, figures count up once.
// Words people read never move while held.
//
// Designed on a 1080-row grid (k = H / 1080) and re-flowed across the width, so a
// 3712×1080 wall, a 32:9 wall and a 16:9 confidence monitor all compose.
//
//   cine-title     full-bleed art, compact "THE POWER OF / STEWARDSHIP" title
//   cine-story     full-bleed story scene and its heading (a Scripture layer in
//                  the Story Verse look carries the verse and reference)
//   cine-overview  parchment, heading, three evenly weighted columns
//   cine-teach     story scene left, the lesson centred right: points, a two-season
//                  contrast or a tally, then a lesson band
//   cine-case      editorial portrait left, name, role and up to three fact blocks
//                  whose figures count up. Facts only: no advice band, on purpose
import { rect, text, line, circle } from '../../tela/templateKit';
import { fitText, lines, maxLineWidth } from './layout';
import type { FieldDef, SlideObj, SlideTemplateDef, DesignCtx } from './types';
import type { SceneProps, FigureProps } from './cinematicDrawers';
import './cinematicDrawers';

const F = (key: string, label: string, def: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, default: def, ...o });

const HEAD = '#FFF6E9', GOLD_INK = '#FFE2A5', PARCH = '#F7F0E4', INK = '#252421';
const SERIF = 'libreBaskerville', TITLE = 'cinzel', SANS = 'inter', VERSE = 'lora';

// ── small helpers ────────────────────────────────────────────────────────────
function hex(c: string, fb = '#8A5A12'): string { return /^#[0-9a-f]{6}$/i.test((c || '').trim()) ? c.trim() : fb; }
function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16));
  const x = p(hex(a)), y = p(hex(b));
  return '#' + x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join('');
}
const num = (s: string, fb: number) => { const v = parseFloat(s); return Number.isFinite(v) ? v : fb; };
/** "a | b | c" field rows. */
const rows = (s: string) => lines(s).map(l => l.split('|').map(x => x.trim()));

/** Legibility floor shared with the catalogue tests: projected type scales with the output. */
let FLOOR = 12;
/** Centred line fitted to maxW (vertically centred on cy); wraps to a second line before it would go below the floor. */
function lineAt(cx: number, cy: number, maxW: number, value: string, o: Parameters<typeof text>[4]): SlideObj {
  const min = Math.min(o.size, Math.max(FLOOR, o.size * .42));
  let t = fitText(cx - maxW / 2, 0, maxW, value, { ...o, align: 'center', wrap: false }, o.size * 1.6, min);
  if (maxLineWidth(t) > maxW + 1) t = fitText(cx - maxW / 2, 0, maxW, value, { ...o, align: 'center', wrap: true }, o.size * 3.2, Math.min(o.size, Math.max(FLOOR, o.size * .3)));
  t.y = cy - t.h / 2;
  return t;
}
/** A wrapped, centred block whose middle sits at cy. */
function blockAt(cx: number, cy: number, w: number, value: string, o: Parameters<typeof text>[4], maxH: number): SlideObj {
  const t = fitText(cx - w / 2, 0, w, value, { ...o, align: 'center', wrap: true }, maxH, Math.min(o.size, Math.max(FLOOR, o.size * .4)));
  t.y = cy - t.h / 2;
  return t;
}
/**
 * The design grid: 1080 rows scaled to fit (k), centred vertically (Y), re-flowed across the
 * width. On the 3712×1080 wall k = 1 and Y(v) = v. Text keeps to title-safe on every shape.
 */
function grid(d: DesignCtx) {
  const { W, H, L } = d;
  const k = Math.min(H / 1080, W / 1920), oy = (H - 1080 * k) / 2;
  FLOOR = L.u * .95;
  const safeX = Math.max(W * .055, 0), safeY = Math.max(H * .055, 0);
  return { k, oy, Y: (v: number) => Math.min(H - safeY, Math.max(safeY, oy + v * k)), safeX, safeY, cx: W / 2 };
}

function scene(x: number, y: number, w: number, h: number, props: SceneProps, label: string): SlideObj {
  const o = rect(x, y, w, h, 'transparent', { label, role: 'GROUND' }) as SlideObj;
  o.live = { drawer: 'cine.scene', props: props as unknown as Record<string, unknown> };
  return o;
}
function figure(x: number, y: number, w: number, h: number, props: FigureProps): SlideObj {
  const o = rect(x, y, w, h, 'transparent', { label: 'Figure', role: 'HEADLINE' }) as SlideObj;
  o.live = { drawer: 'cine.figure', props: props as unknown as Record<string, unknown> };
  o.front = true;
  return o;
}
/** Hairline with a diamond and a light glint travelling along it. */
function goldRule(cx: number, y: number, w: number, color: string, k: number, glint = '#FFF1CF'): SlideObj[] {
  const r = line(cx - w / 2, y, cx + w / 2, y, color, Math.max(2, 3 * k), { label: 'Rule' }) as SlideObj;
  r.amb = { kind: 'sweep', period: 9, color: glint, width: .35 };
  const d = 6.5 * k;
  const dia = rect(cx - d, y - d, d * 2, d * 2, color, { rotation: 45, label: 'Rule diamond', role: 'RULE' }) as SlideObj;
  return [r, dia];
}
const glow = (k: number) => ({ x: 0, y: 3 * k, blur: 9 * k, color: 'rgba(10,7,4,0.78)' });

// ── cine-title ───────────────────────────────────────────────────────────────
function cineTitle(d: DesignCtx): SlideObj[] {
  const { W, H, f, seed } = d, { k, Y, safeX, cx } = grid(d);
  const tyRow = num(f.titleY, .41) * 1080, ty = Y(tyRow);
  const out: SlideObj[] = [scene(0, 0, W, H, {
    src: f.image, kb: .035, base: '#1a140e', seed,
    vig: { cx: .5, cy: (ty + 20 * k) / H, rx: Math.min(1100 * k, W * .42) / W, ry: 340 * k / H, a: .64 },
    dust: 70, shafts: true, clear: .44,
  }, 'Scene')];
  const maxW = Math.min(W - safeX * 2, 2300 * k);
  const kick = lineAt(cx, Y(tyRow - 95), Math.min(maxW, 1200 * k), f.kicker, { size: 62 * k, font: SANS, weight: 600, color: GOLD_INK, tracking: .35, label: 'Kicker', role: 'LABEL', shadow: glow(k) });
  const title = lineAt(cx, Y(tyRow + 58), maxW, f.title, { size: 176 * k, font: TITLE, weight: 700, color: HEAD, tracking: .04, label: 'Title', role: 'HEADLINE', shadow: glow(k) });
  // Flanking rules hug the kicker as it was actually set.
  const half = Math.min(kick.w, maxLineWidth(kick)) / 2, ruleW = 150 * k, gap = 40 * k;
  if (cx + half + gap + ruleW < W - safeX) {
    for (const s of [-1, 1]) {
      const x0 = cx + s * (half + gap), x1 = x0 + s * ruleW, ry = kick.y + kick.h / 2;
      const r = line(Math.min(x0, x1), ry, Math.max(x0, x1), ry, GOLD_INK, Math.max(2, 3 * k), { label: 'Kicker rule' }) as SlideObj;
      r.amb = { kind: 'sweep', period: 8, color: '#FFF4D6', width: .5, phase: s > 0 ? .5 : 0 };
      out.push(r);
    }
  }
  out.push(kick, title);
  return out;
}

// ── cine-story ───────────────────────────────────────────────────────────────
function cineStory(d: DesignCtx): SlideObj[] {
  const { W, H, f, seed } = d, { k, Y, safeX, cx } = grid(d);
  const out: SlideObj[] = [scene(0, 0, W, H, {
    src: f.image, kb: .03, base: '#18120c', seed,
    vig: { cx: .5, cy: .40, rx: Math.min(1300 * k, W * .45) / W, ry: .5, a: .52 },
    dust: 56, shafts: true, clear: .58,
  }, 'Scene')];
  out.push(...goldRule(cx, Y(300), 160 * k, GOLD_INK, k));
  out.push(lineAt(cx, Y(220), Math.min(W - safeX * 2, 2250 * k), f.heading, { size: 96 * k, font: SERIF, weight: 700, color: HEAD, label: 'Heading', role: 'HEADLINE', shadow: glow(k) }));
  return out;
}

// ── parchment ground (teaching) ──────────────────────────────────────────────
function parchment(d: DesignCtx, accent: string): SlideObj {
  return scene(0, 0, d.W, d.H, { src: d.f.ground, kb: .012, base: PARCH, seed: d.seed + 3, dust: 26, dustColor: mixHex(accent, '#FFD98A', .6), clear: .7 }, 'Parchment');
}
function card(x: number, y: number, w: number, h: number, accent: string, k: number, fill = '#FFFBF3'): SlideObj {
  return rect(x, y, w, h, fill, { rx: 24 * k, stroke: mixHex(PARCH, accent, .35), strokeWidth: Math.max(1.5, 2 * k), shadow: { x: 0, y: 6 * k, blur: 14 * k, color: 'rgba(60,40,20,0.10)' }, label: 'Card', role: 'ORNAMENT' }) as SlideObj;
}
function marker(cx: number, cy: number, r: number, n: string, accent: string, k: number): SlideObj[] {
  const m = circle(cx, cy, r, accent, { label: 'Marker', role: 'ORNAMENT', shadow: { x: 0, y: 3 * k, blur: 6 * k, color: 'rgba(0,0,0,0.18)' } }) as SlideObj;
  const t = text(cx - r, 0, r * 2, n, { size: Math.max(FLOOR, r * 1.1), font: SERIF, weight: 700, color: HEAD, align: 'center', wrap: false, label: 'Numeral', role: 'ORNAMENT' });
  t.y = cy - t.h / 2 + 2 * k;
  return [m, t];
}

// ── cine-overview ────────────────────────────────────────────────────────────
function cineOverview(d: DesignCtx): SlideObj[] {
  const { W, f } = d, { k, Y, safeX, cx } = grid(d), acc = hex(f.accent);
  const out: SlideObj[] = [parchment(d, acc)];
  const maxW = W - safeX * 2;
  out.push(lineAt(cx, Y(185), Math.min(maxW, 2600 * k), f.heading, { size: 112 * k, font: SERIF, weight: 700, color: INK, label: 'Heading', role: 'HEADLINE' }));
  out.push(lineAt(cx, Y(300), Math.min(maxW, 2400 * k), f.subhead, { size: 56 * k, font: SERIF, italic: true, color: mixHex(INK, acc, .45), label: 'Subhead', role: 'DECK' }));
  out.push(...goldRule(cx, Y(375), 200 * k, acc, k, '#FFE7B0'));
  const cols = rows(f.columns).slice(0, 4);
  const n = Math.max(1, cols.length), gap = 80 * k;
  const cw = Math.min(1040 * k, (maxW - gap * (n - 1)) / n);
  const x0 = cx - (n * cw + gap * (n - 1)) / 2, y0 = Y(445), ch = Y(960) - y0;
  cols.forEach(([title = '', body = '', ref = ''], i) => {
    const x = x0 + i * (cw + gap), c = x + cw / 2;
    out.push(card(x, y0, cw, ch, acc, k));
    out.push(...marker(c, y0, 52 * k, String(i + 1), acc, k));
    out.push(lineAt(c, Y(585), cw - 80 * k, title, { size: 68 * k, font: SERIF, weight: 700, color: INK, label: 'Column title', role: 'HEADLINE' }));
    out.push(blockAt(c, Y(735), cw - 120 * k, body, { size: 50 * k, font: VERSE, color: INK, leading: 1.36, label: 'Column body', role: 'BODY' }, 190 * k));
    out.push(lineAt(c, Y(885), cw - 60 * k, ref, { size: 42 * k, font: SANS, weight: 600, color: acc, tracking: .12, transform: 'uppercase', label: 'Reference', role: 'CAPTION' }));
  });
  return out;
}

// ── cine-teach ───────────────────────────────────────────────────────────────
function cineTeach(d: DesignCtx): SlideObj[] {
  const { W, H, f, seed } = d, { k, Y, safeX } = grid(d), acc = hex(f.accent);
  const out: SlideObj[] = [parchment(d, acc)];
  // Scene on the left (about 36 % of a 3712 wall), feathered into the parchment.
  const sw = Math.min(1320 * k, W * .36);
  out.push(scene(0, 0, sw, H, { src: f.image, kb: .03, seed: seed + 7, dust: 18, clear: 0, feather: { px: 260 * k, color: PARCH } }, 'Scene'));
  const x0 = sw, right = W - safeX, cx = (x0 + right) / 2, avail = right - x0;
  out.push(lineAt(cx, Y(165), avail, f.heading, { size: 108 * k, font: SERIF, weight: 700, color: INK, label: 'Heading', role: 'HEADLINE' }));
  if (f.subhead) out.push(lineAt(cx, Y(268), avail, f.subhead, { size: 50 * k, font: SERIF, italic: true, color: mixHex(INK, acc, .4), label: 'Subhead', role: 'DECK' }));
  out.push(lineAt(cx, Y(345), avail, f.reference, { size: 42 * k, font: SANS, weight: 600, color: acc, tracking: .14, transform: 'uppercase', label: 'Reference', role: 'LABEL' }));
  const items = rows(f.items);
  const mode = (f.mode || 'points').toLowerCase();
  const y = Y(440), h = Y(800) - y;
  if (mode === 'contrast') {
    const gap = Math.min(200 * k, avail * .12), bw = Math.min(860 * k, (avail - gap) / 2);
    items.slice(0, 2).forEach(([big = '', lab = '', col = ''], i) => {
      const c0 = hex(col, i ? '#8E4A2A' : '#C9962A');
      const x = cx - (2 * bw + gap) / 2 + i * (bw + gap), c = x + bw / 2;
      out.push(rect(x, y, bw, h, i ? '#F6E9DE' : '#FFF7E1', { rx: 24 * k, stroke: c0, strokeWidth: 4 * k, shadow: { x: 0, y: 6 * k, blur: 14 * k, color: 'rgba(60,40,20,0.10)' }, label: 'Season', role: 'ORNAMENT' }) as SlideObj);
      out.push(figure(x + 30 * k, y + h * .21, bw - 60 * k, h * .36, { value: big, size: 112 * k, color: c0, font: SANS, weight: 700, delay: .5 + i * .45, dur: 1.4 }));
      out.push(lineAt(c, y + h * .73, bw - 60 * k, lab, { size: 64 * k, font: SERIF, italic: true, color: INK, label: 'Season label', role: 'BODY' }));
    });
    // Arrow from plenty toward famine, nudging gently forward.
    const ay = y + h / 2, ac = cx, al = Math.min(70 * k, gap * .35);
    const shaft = line(ac - al, ay, ac + al * .6, ay, acc, Math.max(3, 8 * k), { label: 'Arrow' }) as SlideObj;
    const tip = { ...rect(ac + al * .4, ay - 22 * k, 44 * k, 44 * k, acc, { label: 'Arrow head' }), kind: 'PATH' as const, svgPathData: 'M0 0 L100 50 L0 100 Z', pathOriginX: 0, pathOriginY: 0, pathOriginW: 100, pathOriginH: 100, pathClosed: true } as SlideObj;
    for (const o of [shaft, tip]) o.amb = { kind: 'drift', ax: 10 * k, ay: 0, period: 3.2 };
    out.push(shaft, tip);
  } else if (mode === 'tally') {
    const n = Math.min(4, items.length || 1), gap = Math.min(90 * k, avail * .05);
    const bw = Math.min(620 * k, (avail - gap * (n - 1)) / n);
    items.slice(0, n).forEach(([big = '', lab = ''], i) => {
      const x = cx - (n * bw + gap * (n - 1)) / 2 + i * (bw + gap), c = x + bw / 2;
      out.push(card(x, y, bw, h, acc, k, '#FCFAEE'));
      out.push(figure(x, y + h * .19, bw, h * .39, { value: big, size: 150 * k, color: acc, font: SERIF, weight: 700, delay: .5 + i * .3, dur: 1 }));
      out.push(lineAt(c, y + h * .68, bw - 60 * k, lab, { size: 46 * k, font: SANS, weight: 600, color: INK, tracking: .08, label: 'Tally label', role: 'BODY' }));
      const coins = Math.max(0, Math.min(12, Math.round(parseFloat(big) || 0))), r = Math.min(13 * k, bw / (coins * 3 + 2)), step = 3 * r;
      for (let j = 0; j < coins; j++) {
        const px = c - (coins * step - r) / 2 + r + j * step;
        const coin = circle(px, y + h * .84, r, '#C9962A', { stroke: mixHex('#C9962A', INK, .3), strokeWidth: Math.max(1, 2 * k), label: 'Coin', role: 'ORNAMENT' }) as SlideObj;
        coin.amb = { kind: 'pulse', min: .72, max: 1, period: 3.4, phase: (i * 5 + j) * .13 };
        out.push(coin);
      }
    });
  } else {
    const n = Math.min(4, items.length || 1), gap = Math.min(50 * k, avail * .03);
    const bw = Math.min(690 * k, (avail - gap * (n - 1)) / n), py = Y(470), ph = Y(770) - py;
    items.slice(0, n).forEach(([title = '', ref = ''], i) => {
      const x = cx - (n * bw + gap * (n - 1)) / 2 + i * (bw + gap), c = x + bw / 2;
      out.push(card(x, py, bw, ph, acc, k));
      out.push(...marker(c, py, 40 * k, String(i + 1), acc, k));
      out.push(blockAt(c, py + ph * .47, bw - 60 * k, title, { size: 54 * k, font: SERIF, weight: 700, color: INK, leading: 1.2, label: 'Point', role: 'HEADLINE' }, ph * .5));
      out.push(lineAt(c, py + ph * .82, bw - 40 * k, ref, { size: 38 * k, font: SANS, weight: 600, color: acc, tracking: .06, label: 'Reference', role: 'CAPTION' }));
    });
  }
  if (f.lesson) {
    const by = Y(850), band = mixHex(acc, INK, .28);
    out.push(rect(x0, by, W - x0, H - by, band, { label: 'Lesson band', role: 'ORNAMENT' }) as SlideObj);
    const edge = rect(x0, by, W - x0, Math.max(2, 5 * k), mixHex(acc, '#FFE2A5', .55), { label: 'Lesson rule', role: 'RULE' }) as SlideObj;
    edge.amb = { kind: 'sweep', period: 11, color: '#FFF1CF', width: .18 };
    out.push(edge);
    const ly = Math.min((by + (H - H * .055)) / 2, by + 100 * k);
    out.push(lineAt(cx, ly, avail, f.lesson, { size: 60 * k, font: SERIF, italic: true, color: HEAD, label: 'Lesson', role: 'BODY' }));
  }
  return out;
}

// ── cine-case ────────────────────────────────────────────────────────────────
// Facts only. The case slides carry no lesson or advice line, on purpose: the
// teaching is biblical stewardship, and figures on a screen are not counsel.
function cineCase(d: DesignCtx): SlideObj[] {
  const { W, H, f, seed } = d, { k, Y, safeX } = grid(d), acc = hex(f.accent);
  const bg = mixHex(PARCH, acc, .07);
  const out: SlideObj[] = [rect(0, 0, W, H, bg, { label: 'Ground', role: 'GROUND' }) as SlideObj];
  const pw = Math.min(1080 * k, W * .29);
  out.push(scene(0, 0, pw, H, { src: f.image, kb: .025, seed: seed + 11, feather: { px: 240 * k, color: bg } }, 'Portrait'));
  const x0 = pw + 40 * k, x1 = W - safeX, cx = (x0 + x1) / 2, avail = x1 - x0;
  out.push(lineAt(cx, Y(150), avail, f.kicker, { size: 42 * k, font: SANS, weight: 600, color: acc, tracking: .3, label: 'Kicker', role: 'LABEL' }));
  out.push(lineAt(cx, Y(268), avail, f.name, { size: 128 * k, font: SERIF, weight: 700, color: INK, label: 'Name', role: 'HEADLINE' }));
  out.push(lineAt(cx, Y(372), avail, f.role, { size: 50 * k, font: SANS, color: mixHex(INK, acc, .35), label: 'Role', role: 'DECK' }));
  const blocks = rows(f.blocks).slice(0, 3);
  const n = Math.max(1, blocks.length), gap = Math.min(60 * k, avail * .03);
  const bw = n === 3 ? (avail - gap * 2) / 3 : Math.min(940 * k, (avail - gap * (n - 1)) / n);
  const bx0 = cx - (n * bw + gap * (n - 1)) / 2, y = Y(455), h = Y(930) - y;
  blocks.forEach(([label = '', fig = '', cap = ''], i) => {
    const x = bx0 + i * (bw + gap), c = x + bw / 2;
    out.push(rect(x, y, bw, h, '#FFFCF6', { rx: 22 * k, stroke: mixHex(bg, acc, .3), strokeWidth: 2 * k, shadow: { x: 0, y: 6 * k, blur: 14 * k, color: 'rgba(40,30,20,0.08)' }, label: 'Fact block', role: 'ORNAMENT' }) as SlideObj);
    const cap0 = rect(x, y, bw, 12 * k, acc, { rx: 4 * k, label: 'Fact cap', role: 'RULE' }) as SlideObj;
    cap0.amb = { kind: 'sweep', period: 10, color: '#FFFFFF', width: .25, phase: i * .3 };
    out.push(cap0);
    out.push(lineAt(c, y + h * .17, bw - 50 * k, label, { size: 42 * k, font: SANS, weight: 600, color: acc, tracking: .14, transform: 'uppercase', label: 'Block label', role: 'LABEL' }));
    if (fig && fig !== '-') {
      out.push(figure(x + 30 * k, y + h * .31, bw - 60 * k, h * .28, { value: fig, size: 116 * k, color: INK, font: SANS, weight: 700, delay: .6 + i * .35, dur: 1.8, rule: acc }));
      out.push(blockAt(c, y + h * .77, bw - 70 * k, cap, { size: 44 * k, font: SANS, color: mixHex(INK, bg, .15), leading: 1.25, label: 'Caption', role: 'BODY' }, h * .3));
    } else {
      out.push(blockAt(c, y + h * .58, bw - 80 * k, cap.split('/').map(s => s.trim()).join('\n'), { size: 56 * k, font: SERIF, color: INK, leading: 1.36, label: 'Statement', role: 'BODY' }, h * .62));
    }
  });
  out.push(...goldRule(cx, Y(1000), 240 * k, acc, k, '#FFFFFF'));
  return out;
}

// ── catalogue ────────────────────────────────────────────────────────────────
export const CINEMATIC_TEMPLATES: SlideTemplateDef[] = [
  { id: 'cine-title', name: 'Cinematic Title', category: 'Sermon', slot: 'slide', blurb: 'Painted art that breathes, with a compact series title in the quiet middle.', design: cineTitle,
    fields: [F('image', 'Artwork', '', { kind: 'image' }), F('kicker', 'Kicker', 'THE POWER OF'), F('title', 'Title', 'STEWARDSHIP'), F('titleY', 'Title height (0–1)', '0.41', { kind: 'number' })] },
  { id: 'cine-story', name: 'Cinematic Story Scene', category: 'Sermon', slot: 'slide', blurb: 'A full-bleed story scene and its heading — pair with the Story Verse scripture look.', design: cineStory,
    fields: [F('image', 'Scene', '', { kind: 'image' }), F('heading', 'Heading', 'The steward prays for direction')] },
  { id: 'cine-overview', name: 'Cinematic Overview', category: 'Sermon', slot: 'slide', blurb: 'Parchment, a heading and three evenly weighted teaching columns.', design: cineOverview,
    fields: [F('ground', 'Parchment art', '', { kind: 'image' }), F('heading', 'Heading', 'What faithful stewardship looks like'), F('subhead', 'Subhead', 'Care for what God has entrusted to you.'),
      F('columns', 'Columns ("Title | text | reference")', 'God owns it | Receive what you have with gratitude. | Psalm 24:1', { multiline: true }), F('accent', 'Accent', '#8A5A12')] },
  { id: 'cine-teach', name: 'Cinematic Teaching', category: 'Sermon', slot: 'slide', blurb: 'Story scene left; points, a contrast or a tally right; a lesson band below.', design: cineTeach,
    fields: [F('image', 'Scene', '', { kind: 'image' }), F('ground', 'Parchment art', '', { kind: 'image' }), F('heading', 'Heading', 'Eliezer receives the assignment'),
      F('subhead', 'Subhead', ''), F('reference', 'Reference', 'Genesis 24:2–27'),
      F('mode', 'Layout', 'points', { kind: 'select', options: ['points', 'contrast', 'tally'] }),
      F('items', 'Items ("A | B" per line)', 'Accept the responsibility | Genesis 24:2–4', { multiline: true }),
      F('lesson', 'Lesson', ''), F('accent', 'Accent', '#A8492F')] },
  { id: 'cine-case', name: 'Cinematic Case Study', category: 'Sermon', slot: 'slide', blurb: 'Editorial portrait and up to three fact blocks whose figures count up. Facts only.', design: cineCase,
    fields: [F('image', 'Portrait', '', { kind: 'image' }), F('kicker', 'Kicker', 'THE POWER OF STEWARDSHIP'), F('name', 'Name', 'Name'), F('role', 'Role', 'Role'),
      F('blocks', 'Blocks ("LABEL | figure or - | caption")', 'EARNINGS | ≈$1M | estimated earnings', { multiline: true }), F('accent', 'Accent', '#C2700E')] },
];
