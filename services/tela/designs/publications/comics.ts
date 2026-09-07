// comics — hand-designed publication page systems (see docs/tela/PUBLICATION_DESIGN_BRIEF.md).
//
// Eight comics & manga worlds. Every page is drawn the way a letterer and a
// page designer would build it: panels with real gutters and stroked borders,
// balloons with tails and copy inside them, caption boxes, SFX in a display
// face with a stroke, a folio. Manga pages carry a right-to-left cue and a
// right-side folio; the webtoon is a vertical scroll with breathing gaps.
import type { TelaVectorObject } from '../../../types';
import type { DesignLesson } from '../types';
import type { PublicationDesigner } from './types';
import type { FontKey } from '../../telaFonts';
import { rect, circle, ellipse, hr, vr, path, text, below, imageSlot, frame, alpha, mix, type Role } from '../../templateKit';
import { copy } from '../../copy';
import * as orn from '../../ornaments';

type Objs = TelaVectorObject[];
interface Box { x: number; y: number; w: number; h: number }

const ground = (W: number, H: number, paper: string) => rect(0, 0, W, H, paper, { label: 'Ground', role: 'GROUND' });
const R = (n: number) => Math.round(n);
const WHITE = '#FFFFFF';

// ── Panel craft ───────────────────────────────────────────────────────────────

/** What every panel of one template shares: border colour + weight, corner radius, art-well tone. */
interface PanelVoice { border?: string; bw: number; rx: number; fill: string; hintInk: string }

/** A panel = an art well with a stroked border (or none, for borderless manga). */
function panel(b: Box, v: PanelVoice, n: number | string, o: { silent?: boolean; fill?: string; hint?: string; label?: string } = {}): Objs {
  return imageSlot(b.x, b.y, b.w, b.h, { shade: o.fill || v.fill, frame: v.border, frameWidth: v.border ? v.bw : 0, rx: v.rx, ink: v.hintInk, caption: o.hint || `Panel ${n} · art`, silent: o.silent, label: o.label || `Image well · Panel ${n}` });
}

/** Panel grid: `cell(col,row,colSpan,rowSpan)` with real gutters (gx between columns, gy between rows). */
function grid(area: Box, cols: number, rows: number, gx: number, gy = gx) {
  const cw = (area.w - gx * (cols - 1)) / cols, rh = (area.h - gy * (rows - 1)) / rows;
  return (c: number, r: number, cs = 1, rs = 1): Box => ({ x: R(area.x + c * (cw + gx)), y: R(area.y + r * (rh + gy)), w: R(cs * cw + (cs - 1) * gx), h: R(rs * rh + (rs - 1) * gy) });
}

/** Diagonal panel — a quadrilateral drawn 1:1 in page space. */
function quad(pts: Array<[number, number]>, fill: string, o: { stroke?: string; strokeWidth?: number; label?: string; opacity?: number; role?: Role } = {}): TelaVectorObject {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  const d = `M${pts.map(p => `${R(p[0])} ${R(p[1])}`).join(' L')} Z`;
  return path(x, y, w, h, d, fill, { origin: { x, y, w, h }, stroke: o.stroke, strokeWidth: o.strokeWidth, opacity: o.opacity, label: o.label || 'Diagonal panel', role: o.role || 'IMAGE_SLOT' });
}

interface BalloonOpts { font: FontKey; size?: number; weight?: number; color?: string; fill?: string; stroke?: string; bw?: number; tail?: number; flip?: boolean; pad?: number; label?: string; italic?: boolean; leading?: number }
/**
 * Speech balloon sized around its lettering. The tail points down at `tail` %
 * of the width; `flip` rotates the balloon so the tail points up (it then
 * lands at 100 − tail).
 */
function balloon(x: number, y: number, w: number, str: string, o: BalloonOpts): { objs: Objs; bottom: number; h: number } {
  const pad = o.pad ?? 12, size = o.size ?? 12;
  const t = text(x + pad, y, w - pad * 2, str, { size, font: o.font, weight: o.weight ?? 700, color: o.color || '#111111', align: 'center', leading: o.leading ?? 1.25, italic: o.italic, label: 'Balloon lettering', role: 'BODY' });
  const bodyH = t.h + pad * 2;
  const total = R(bodyH / .76);
  t.y = o.flip ? y + (total - bodyH) + pad : y + pad;
  const p = path(x, y, w, total, orn.balloonPath(o.tail ?? 22), o.fill || WHITE, { stroke: o.stroke || '#111111', strokeWidth: o.bw ?? 2, rotation: o.flip ? 180 : 0, label: o.label || 'Speech balloon' });
  return { objs: [p, t], bottom: y + total, h: total };
}

/** Thought bubble: an ellipse and two trailing dots. */
function thought(x: number, y: number, w: number, str: string, o: BalloonOpts & { dotsAt?: 'left' | 'right' }): { objs: Objs; bottom: number } {
  const pad = o.pad ?? 16, size = o.size ?? 12;
  const t = text(x + pad, y + pad, w - pad * 2, str, { size, font: o.font, weight: o.weight ?? 500, italic: o.italic ?? true, color: o.color || '#111111', align: 'center', leading: o.leading ?? 1.3, label: 'Thought lettering', role: 'BODY' });
  const h = t.h + pad * 2;
  const stroke = o.stroke || 'none', bw = o.bw ?? 0, fill = o.fill || WHITE;
  const dx = o.dotsAt === 'right' ? x + w - 10 : x + 10, dir = o.dotsAt === 'right' ? 1 : -1;
  return { objs: [ellipse(x, y, w, h, fill, { stroke, strokeWidth: bw, label: o.label || 'Thought bubble' }), circle(dx, y + h + 8, 7, fill, { stroke, strokeWidth: bw, label: 'Thought dot' }), circle(dx + dir * 10, y + h + 22, 4, fill, { stroke, strokeWidth: bw, label: 'Thought dot' }), t], bottom: y + h + 26 };
}

interface CaptionOpts { font: FontKey; size?: number; color: string; fill: string; stroke?: string; bw?: number; pad?: number; upper?: boolean; weight?: number; italic?: boolean; label?: string; rx?: number; align?: 'left' | 'center' | 'right'; tracking?: number }
/** Caption / narration box. */
function captionBox(x: number, y: number, w: number, str: string, o: CaptionOpts): { objs: Objs; bottom: number } {
  const pad = o.pad ?? 8;
  const t = text(x + pad, y + pad, w - pad * 2, str, { size: o.size ?? 10, font: o.font, weight: o.weight ?? 700, italic: o.italic, color: o.color, leading: 1.3, tracking: o.tracking ?? (o.upper ? .04 : 0), transform: o.upper ? 'uppercase' : 'none', align: o.align, label: 'Caption lettering', role: 'CAPTION' });
  const h = t.h + pad * 2;
  return { objs: [rect(x, y, w, h, o.fill, { stroke: o.stroke || 'none', strokeWidth: o.stroke ? (o.bw ?? 2) : 0, rx: o.rx ?? 0, label: o.label || 'Caption box' }), t], bottom: y + h };
}

/** Sound effect — display face with a contrasting stroke, usually tilted. */
function sfx(x: number, y: number, w: number, str: string, o: { font: FontKey; size: number; color: string; stroke?: string; bw?: number; rotation?: number; align?: 'left' | 'center' | 'right'; label?: string; italic?: boolean; opacity?: number; tracking?: number }): TelaVectorObject {
  return text(x, y, w, str, { size: o.size, font: o.font, weight: 400, color: o.color, stroke: o.stroke, strokeWidth: o.stroke ? (o.bw ?? Math.max(2, o.size * .08)) : 0, rotation: o.rotation, align: o.align || 'center', italic: o.italic, wrap: false, opacity: o.opacity, tracking: o.tracking, label: o.label || 'Sound effect', role: 'HEADLINE' });
}

/** Comic folio: centred page number. */
function pageNumber(W: number, y: number, n: number, color: string, font: FontKey, size = 10): TelaVectorObject {
  return text(W / 2 - 40, y, 80, String(n), { size, font, weight: 700, color, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' });
}

/** Manga foot: folio on the outer (right) edge + a reading-direction cue on the left. */
function mangaFoot(W: number, H: number, m: number, n: number, ink: string, font: FontKey, cue = true): Objs {
  const y = H - m + 16;
  const out: Objs = [text(W - m - 60, y, 60, String(n), { size: 10, font, weight: 700, color: ink, align: 'right', wrap: false, label: 'Folio (right)', role: 'FOLIO' })];
  if (cue) out.push(text(m, y, 220, '◄ read right to left', { size: 8, font, weight: 700, color: ink, tracking: .14, transform: 'uppercase', wrap: false, opacity: .7, label: 'Reading-direction cue', role: 'LABEL' }));
  return out;
}

/** EAN-style barcode from stripes — the small typographic block every cover carries. */
function barcode(x: number, y: number, w: number, h: number, ink: string, paper: string, seed: number, label: string, font: FontKey, rx = 0): Objs {
  const r = orn.rng(seed); const out: Objs = [rect(x, y, w, h, paper, { rx, label: 'Barcode field' })];
  let cx = x + 6;
  while (cx < x + w - 8) { const bw = 1 + Math.floor(r() * 3); out.push(rect(cx, y + 4, bw, h - 18, ink, { label: 'Barcode bar' })); cx += bw + 1 + Math.floor(r() * 2); }
  out.push(text(x, y + h - 12, w, label, { size: 7, font, weight: 600, color: ink, align: 'center', tracking: .1, wrap: false, label: 'Barcode number', role: 'LABEL' }));
  return out;
}

/** Drifting petals (shōjo) — seeded leaf shapes. */
function petals(W: number, H: number, count: number, colors: string[], seed: number, sizeMin = 12, sizeMax = 30): Objs {
  const r = orn.rng(seed); const out: Objs = [];
  for (let i = 0; i < count; i++) { const s = sizeMin + r() * (sizeMax - sizeMin); out.push(path(r() * W, r() * H, s * .7, s, orn.leafPath(), colors[i % colors.length], { rotation: r() * 360, opacity: .35 + r() * .5, label: 'Petal' })); }
  return out;
}

/** Stat bar (character sheets): label, track, fill. */
function statBar(x: number, y: number, w: number, label: string, value: number, ink: string, track: string, fill: string, font: FontKey): Objs {
  return [
    text(x, y, w, label, { size: 8, font, weight: 800, color: ink, tracking: .14, transform: 'uppercase', wrap: false, label: 'Stat label', role: 'LABEL' }),
    rect(x, y + 13, w, 6, track, { label: 'Stat track' }),
    rect(x, y + 13, R(w * value), 6, fill, { label: 'Stat fill' }),
  ];
}

const HERO_CREDITS = copy.byline('comic', 0);

// ─────────────────────────────────────────────────────────────────────────────
// VELOCITY COMICS — superhero. Yellow/red/blue, diagonals, thick black borders.
// ─────────────────────────────────────────────────────────────────────────────
const superhero: PublicationDesigner = ({ W, H, pageType, pageIndex, paper: yellow, ink, accent: red, secondary: blue, seed }) => {
  const v: PanelVoice = { border: ink, bw: 3, rx: 0, fill: alpha(blue, .18), hintInk: alpha(ink, .5) };
  const fr = frame(W, H, 36, { bottom: 54 });
  const G = 12;
  const out: Objs = [];
  const cap = (x: number, y: number, w: number, s: string) => captionBox(x, y, w, s, { font: 'comicNeue', size: 10, color: ink, fill: yellow, stroke: ink, bw: 2, upper: true, pad: 7 });
  const say = (x: number, y: number, w: number, s: string, tail = 22, flip = false) => balloon(x, y, w, s, { font: 'comicNeue', size: 12, weight: 700, color: ink, stroke: ink, bw: 2.5, tail, flip });
  const bang = (x: number, y: number, w: number, s: string, size: number, color: string, rot: number) => sfx(x, y, w, s, { font: 'bangers', size, color, stroke: ink, bw: Math.max(3, size * .07), rotation: rot });

  switch (pageType) {
    case 'COMIC COVER': {
      out.push(ground(W, H, ink));
      out.push(...orn.radialLines(W * .62, 560, 40, 980, 34, yellow, 5, { opacity: .16, label: 'Cover ray' }));
      out.push(...imageSlot(0, 190, W, H - 190, { tone: 'dark', shade: alpha(blue, .3), caption: 'Cover art · hero mid-flight', ink: alpha(WHITE, .5), label: 'Cover art slot' }));
      out.push(rect(0, 34, W, 168, red, { label: 'Masthead band' }));
      out.push(rect(0, 202, W, 8, ink, { label: 'Masthead rule' }));
      out.push(text(36, 26, 744, 'VELOCITY', { size: 150, font: 'bangers', color: yellow, stroke: ink, strokeWidth: 7, wrap: false, tracking: .02, label: 'Masthead', role: 'HEADLINE' }));
      out.push(text(560, 160, 220, 'COMICS', { size: 30, font: 'bangers', color: WHITE, tracking: .2, wrap: false, align: 'right', label: 'Masthead · imprint', role: 'LABEL' }));
      out.push(rect(36, 44, 132, 44, WHITE, { stroke: ink, strokeWidth: 3, label: 'Publisher box' }));
      out.push(text(42, 48, 120, 'VELOCITY COMICS GROUP', { size: 8, font: 'archivo', weight: 800, color: ink, tracking: .08, wrap: false, label: 'Publisher', role: 'LABEL' }));
      out.push(text(42, 62, 120, 'No. 1 · SEPT · ALL AGES', { size: 9, font: 'archivo', weight: 900, color: red, tracking: .06, wrap: false, label: 'Issue slug', role: 'LABEL' }));
      out.push(path(W - 226, 226, 200, 200, orn.burstPath(16, seed), red, { stroke: yellow, strokeWidth: 5, label: 'Burst badge' }));
      out.push(text(W - 206, 278, 160, 'FIRST\nISSUE!', { size: 40, font: 'bangers', color: WHITE, align: 'center', leading: .92, wrap: false, rotation: -8, label: 'Badge lettering', role: 'LABEL' }));
      out.push(text(36, 720, 640, 'THE GATHERING STORM', { size: 64, font: 'bangers', color: yellow, stroke: ink, strokeWidth: 5, wrap: false, rotation: -5, label: 'Cover line', role: 'HEADLINE' }));
      out.push(rect(44, 812, 470, 44, ink, { rotation: -5, label: 'Cover line band' }));
      out.push(text(56, 822, 450, 'Can one courier outrun a city coming down?', { size: 16, font: 'comicNeue', weight: 700, color: WHITE, wrap: false, rotation: -5, label: 'Cover line · deck', role: 'DECK' }));
      out.push(text(36, 900, 400, 'PLUS: THE UNDERTOW STRIKES!', { size: 30, font: 'bangers', color: WHITE, stroke: ink, strokeWidth: 3, wrap: false, label: 'Second cover line', role: 'LABEL' }));
      out.push(text(36, 962, 200, '$4.99 US', { size: 26, font: 'bangers', color: yellow, wrap: false, label: 'Price', role: 'LABEL' }));
      out.push(...barcode(W - 156, H - 96, 120, 60, ink, WHITE, seed, '7 61234 00001 1', 'archivo'));
      return out;
    }
    case 'CHARACTER SHEET': {
      out.push(ground(W, H, yellow));
      out.push(rect(0, 0, W, 118, ink, { label: 'Header band' }));
      out.push(text(36, 14, 520, 'THE CAST', { size: 80, font: 'bangers', color: yellow, stroke: red, strokeWidth: 4, wrap: false, label: 'Section title', role: 'HEADLINE' }));
      out.push(text(500, 40, 280, 'Velocity Comics · Character File · No. 1', { size: 9, font: 'archivo', weight: 800, color: WHITE, tracking: .1, transform: 'uppercase', align: 'right', wrap: false, label: 'Running head', role: 'LABEL' }));
      out.push(text(500, 58, 280, 'Who they are · what they want · what stops them', { size: 9, font: 'comicNeue', weight: 700, color: yellow, align: 'right', wrap: false, label: 'Header deck', role: 'DECK' }));
      const cast = [
        { name: 'VELOCITY', role: 'THE HERO', tag: red, bio: 'Nadia Okoro, bike courier. One bad storm, one downed power line, and now the city moves at her speed. Wants the bridge to hold. Fears being late for the thing that matters.', stats: [.95, .6, .85], move: 'SIGNATURE MOVE · THE CROSSTOWN CUT' },
        { name: 'THE UNDERTOW', role: 'THE RIVAL', tag: blue, bio: 'Nobody has seen his face. Everybody has felt the pull. Wants the city to sink to its true level. Fears the one person fast enough to swim against him.', stats: [.7, .9, .5], move: 'SIGNATURE MOVE · THE DRAG' },
        { name: 'SPARKPLUG', role: 'THE ALLY', tag: red, bio: 'Ines Batalha, fifteen, fixes everything except her own timing. Built the suit from a scooter battery and a kettle. Wants in on the mission. Fears nobody will ask.', stats: [.4, .8, .95], move: 'SIGNATURE MOVE · THE JUMP-START' },
      ];
      const cols = grid({ x: fr.x, y: 150, w: fr.w, h: 800 }, 3, 1, 24);
      cast.forEach((c, i) => {
        const b = cols(i, 0);
        out.push(...panel({ x: b.x, y: b.y, w: b.w, h: 380 }, v, `figure ${i + 1}`, { hint: 'Full figure · art', fill: i === 1 ? alpha(ink, .12) : v.fill }));
        out.push(rect(b.x, b.y + 380 + G, b.w, 52, c.tag, { stroke: ink, strokeWidth: 3, label: 'Name plate' }));
        out.push(text(b.x + 8, b.y + 380 + G + 6, b.w - 16, c.name, { size: 30, font: 'bangers', color: WHITE, stroke: ink, strokeWidth: 2, wrap: false, label: 'Character name', role: 'LABEL' }));
        out.push(text(b.x, b.y + 452, b.w, c.role, { size: 9, font: 'archivo', weight: 900, color: ink, tracking: .16, wrap: false, label: 'Role label', role: 'LABEL' }));
        const bio = text(b.x, b.y + 470, b.w, c.bio, { size: 10.5, font: 'comicNeue', weight: 700, color: ink, leading: 1.4, label: 'Character bio', role: 'BODY' });
        out.push(bio);
        let sy = below(bio, 14);
        ['POWER', 'SPEED', 'RESOLVE'].forEach((s, k) => { out.push(...statBar(b.x, sy, b.w, s, c.stats[k], ink, alpha(ink, .15), k === 1 ? blue : red, 'archivo')); sy += 30; });
        out.push(...cap(b.x, sy + 4, b.w, c.move).objs);
      });
      out.push(pageNumber(W, H - 30, pageIndex, ink, 'archivo'));
      return out;
    }
    case 'SPLASH PAGE': {
      out.push(ground(W, H, yellow));
      out.push(rect(fr.x, fr.y, fr.w, fr.h, alpha(blue, .22), { stroke: ink, strokeWidth: 4, label: 'Splash panel', role: 'IMAGE_SLOT' }));
      out.push(...orn.radialLines(fr.x + fr.w * .55, fr.y + fr.h * .42, 30, 400, 40, red, 4, { opacity: .35, label: 'Impact ray' }));
      out.push(text(fr.x, fr.y + fr.h * .42 - 8, fr.w, 'Splash art · full page', { size: 11, font: 'inter', weight: 700, color: alpha(ink, .5), align: 'center', tracking: .14, transform: 'uppercase', wrap: false, label: 'Image slot hint', role: 'LABEL' }));
      out.push(...cap(fr.x + 18, fr.y + 18, 330, 'The harbor bridge. 6:42 pm. Forty seconds before everything changed.').objs);
      out.push(bang(60, 330, 700, 'WHOOM', 170, yellow, -8));
      const b = say(470, 560, 250, 'Not today. Not on my watch.', 30);
      out.push(...b.objs);
      out.push(rect(fr.x + 4, fr.bottom - 196, fr.w - 8, 192, alpha(ink, .9), { label: 'Title block' }));
      out.push(text(fr.x + 28, fr.bottom - 184, 300, 'CHAPTER ONE', { size: 22, font: 'bangers', color: yellow, tracking: .18, wrap: false, label: 'Chapter kicker', role: 'LABEL' }));
      out.push(text(fr.x + 28, fr.bottom - 158, fr.w - 56, 'THE GATHERING STORM', { size: 66, font: 'bangers', color: WHITE, stroke: red, strokeWidth: 3, wrap: false, label: 'Story title', role: 'HEADLINE' }));
      out.push(text(fr.x + 28, fr.bottom - 74, fr.w - 56, HERO_CREDITS, { size: 10, font: 'archivo', weight: 800, color: yellow, tracking: .06, wrap: false, label: 'Credits', role: 'CAPTION' }));
      out.push(text(fr.x + 28, fr.bottom - 56, fr.w - 56, 'Colors · Ada Lindgren   Editor · Sol Marquez   Velocity created by Torres & Oda', { size: 9, font: 'archivo', weight: 600, color: WHITE, tracking: .04, wrap: false, label: 'Credits · second line', role: 'CAPTION' }));
      out.push(pageNumber(W, H - 30, pageIndex, ink, 'archivo'));
      return out;
    }
    case 'COMIC PAGE': {
      out.push(ground(W, H, yellow));
      const x0 = fr.x, x1 = fr.right, y0 = fr.y;
      if (pageIndex === 3) {
        // Tier 1 wide · tier 2 diagonal pair · tier 3 wide
        out.push(...panel({ x: x0, y: y0, w: fr.w, h: 300 }, v, 1));
        out.push(...cap(x0 + 14, y0 + 14, 260, copy.caption('comic', 0)).objs);
        out.push(...say(x1 - 300, y0 + 26, 270, 'The bridge won’t hold! Get them clear!', 70).objs);
        const y2 = y0 + 300 + G, y3 = y2 + 330;
        out.push(quad([[x0, y2], [470, y2], [390, y3], [x0, y3]], v.fill, { stroke: ink, strokeWidth: 3, label: 'Panel 2 · diagonal' }));
        out.push(quad([[482, y2], [x1, y2], [x1, y3], [402, y3]], alpha(red, .14), { stroke: ink, strokeWidth: 3, label: 'Panel 3 · diagonal' }));
        out.push(bang(50, y2 + 90, 300, 'KRAK!', 84, red, -14));
        out.push(...say(x0 + 24, y3 - 130, 210, 'Hold on to me!', 60).objs);
        out.push(...captionBox(560, y2 + 20, 200, 'She had maybe four seconds.', { font: 'comicNeue', size: 10, color: WHITE, fill: ink, upper: true, pad: 7 }).objs);
        const y4 = y3 + G;
        out.push(...panel({ x: x0, y: y4, w: fr.w, h: fr.bottom - y4 }, v, 4));
        out.push(...say(x0 + 20, y4 + 20, 280, copy.body('comic', 1), 24).objs);
        out.push(...say(x1 - 300, y4 + 60, 280, 'Then stop running and start catching.', 70).objs);
        out.push(bang(x0 + 40, fr.bottom - 110, 220, 'SKRRT', 44, blue, 6));
      } else if (pageIndex === 4) {
        // Tall left · two stacked right · diagonal pair below
        out.push(...panel({ x: x0, y: y0, w: 400, h: 600 }, v, 1));
        out.push(...say(x0 + 20, y0 + 20, 250, 'Velocity — behind you!', 30).objs);
        out.push(bang(x0 + 20, y0 + 440, 360, 'BOOM', 110, red, -6));
        out.push(...panel({ x: x0 + 400 + G, y: y0, w: fr.w - 400 - G, h: 294 }, v, 2, { fill: alpha(red, .12) }));
        out.push(...cap(x0 + 400 + G + 14, y0 + 14, 220, copy.caption('comic', 1)).objs);
        out.push(...panel({ x: x0 + 400 + G, y: y0 + 294 + G, w: fr.w - 400 - G, h: 294 }, v, 3));
        out.push(...say(x0 + 400 + G + 30, y0 + 294 + G + 20, 270, 'Is that… the whole reservoir?', 40).objs);
        const y2 = y0 + 600 + G;
        out.push(quad([[x0, y2], [520, y2], [440, fr.bottom], [x0, fr.bottom]], v.fill, { stroke: ink, strokeWidth: 3, label: 'Panel 4 · diagonal' }));
        out.push(quad([[532, y2], [x1, y2], [x1, fr.bottom], [452, fr.bottom]], alpha(blue, .3), { stroke: ink, strokeWidth: 3, label: 'Panel 5 · diagonal' }));
        out.push(...say(x0 + 24, y2 + 24, 260, 'Everybody grab something bolted down.', 20).objs);
        out.push(...captionBox(x0 + 24, fr.bottom - 60, 300, 'Three hundred tons of water, one very fast woman.', { font: 'comicNeue', size: 10, color: ink, fill: yellow, stroke: ink, bw: 2, upper: true, pad: 7 }).objs);
        out.push(bang(470, y2 + 130, 320, 'WHOOM', 90, yellow, 12));
      } else {
        // Three across · steep diagonal pair · wide with an inset
        const row = grid({ x: x0, y: y0, w: fr.w, h: 280 }, 3, 1, G);
        out.push(...panel(row(0, 0), v, 1), ...panel(row(1, 0), v, 2, { fill: alpha(red, .12) }), ...panel(row(2, 0), v, 3));
        out.push(...say(row(0, 0).x + 14, y0 + 16, 210, 'Sparkplug, tell me the kettle trick works.', 30).objs);
        out.push(...say(row(1, 0).x + 14, y0 + 16, 210, 'It works. Mostly. On Tuesdays.', 40).objs);
        out.push(bang(row(2, 0).x + 10, y0 + 150, 220, 'ZZZAK', 54, blue, -10));
        const y2 = y0 + 280 + G, y3 = y2 + 300;
        out.push(quad([[x0, y2], [560, y2], [640, y3], [x0, y3]], v.fill, { stroke: ink, strokeWidth: 3, label: 'Panel 4 · diagonal' }));
        out.push(quad([[572, y2], [x1, y2], [x1, y3], [652, y3]], alpha(ink, .12), { stroke: ink, strokeWidth: 3, label: 'Panel 5 · diagonal' }));
        out.push(...cap(x0 + 14, y2 + 14, 240, 'The Undertow was already in the pipes.').objs);
        out.push(...say(300, y3 - 120, 250, 'It’s him. He’s under the whole street.', 60).objs);
        const y4 = y3 + G;
        out.push(...panel({ x: x0, y: y4, w: fr.w, h: fr.bottom - y4 }, v, 6));
        out.push(...panel({ x: x1 - 230, y: y4 + 20, w: 210, h: 150 }, v, '6 inset', { hint: 'Inset · close-up', fill: WHITE }));
        out.push(...say(x0 + 20, y4 + 24, 300, copy.body('comic', 3), 30).objs);
        out.push(bang(x0 + 60, fr.bottom - 140, 400, 'KRAK!', 96, red, -8));
      }
      out.push(pageNumber(W, H - 30, pageIndex, ink, 'archivo'));
      return out;
    }
    default: { // BACK COVER
      out.push(ground(W, H, ink));
      out.push(...orn.radialLines(W * .3, 300, 60, 700, 26, yellow, 3, { opacity: .12, label: 'Back ray' }));
      out.push(text(36, 48, 500, 'NEXT ISSUE', { size: 64, font: 'bangers', color: yellow, stroke: red, strokeWidth: 4, wrap: false, label: 'Next-issue title', role: 'HEADLINE' }));
      out.push(path(W - 236, 30, 190, 190, orn.burstPath(14, seed + 2), red, { stroke: yellow, strokeWidth: 5, label: 'Issue burst' }));
      out.push(text(W - 216, 82, 150, 'No. 2', { size: 56, font: 'bangers', color: WHITE, align: 'center', wrap: false, rotation: 6, label: 'Burst lettering', role: 'LABEL' }));
      out.push(...imageSlot(70, 170, 470, 330, { tone: 'dark', shade: alpha(blue, .35), rotation: -3, frame: WHITE, frameWidth: 4, caption: 'Preview art · issue 2', ink: alpha(WHITE, .55), label: 'Preview slot' }));
      out.push(text(560, 200, 220, 'THE UNDERTOW RISES', { size: 34, font: 'bangers', color: yellow, wrap: true, leading: .95, label: 'Teaser title', role: 'LABEL' }));
      out.push(text(560, 290, 220, 'The reservoir is empty, the harbor is full, and Sparkplug has a plan involving four kettles. Velocity has one night to learn that speed is not the same as being on time.', { size: 11, font: 'comicNeue', weight: 700, color: WHITE, leading: 1.4, label: 'Teaser copy', role: 'BODY' }));
      out.push(rect(36, 560, fr.w, 4, red, { label: 'Colophon rule' }));
      out.push(text(36, 580, 470, 'LETTERS PAGE', { size: 22, font: 'bangers', color: yellow, wrap: false, label: 'Letters head', role: 'LABEL' }));
      out.push(text(36, 612, 470, 'Write to Velocity, c/o Velocity Comics Group, Box 4499, Harbor Station. Tell us which bridge you would save first. The best letter each month gets a signed page and, if Sparkplug is feeling generous, a kettle.', { size: 11, font: 'comicNeue', weight: 700, color: WHITE, leading: 1.45, label: 'Letters copy', role: 'BODY' }));
      out.push(text(36, 780, 500, 'VELOCITY COMICS No. 1, September. Published monthly by Velocity Comics Group. Story Mia Torres · Art Kenji Oda · Letters Bea Oyelaran · Colors Ada Lindgren. All characters are fictional; any resemblance to actual couriers is a compliment. Printed on the fast press.', { size: 8.5, font: 'archivo', weight: 500, color: alpha(WHITE, .7), leading: 1.45, label: 'Colophon', role: 'CAPTION' }));
      out.push(text(36, 900, 300, 'VELOCITY', { size: 60, font: 'bangers', color: yellow, stroke: red, strokeWidth: 3, wrap: false, label: 'Masthead · small', role: 'LABEL' }));
      out.push(text(38, 966, 300, 'COMICS GROUP', { size: 12, font: 'archivo', weight: 900, color: WHITE, tracking: .22, wrap: false, label: 'Imprint', role: 'LABEL' }));
      out.push(...barcode(W - 156, H - 96, 120, 60, ink, WHITE, seed + 1, '7 61234 00002 8', 'archivo'));
      return out;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MIDNIGHT CASEFILES — noir. Cream + black, cinematic wides, blinds and shadows.
// ─────────────────────────────────────────────────────────────────────────────
const noir: PublicationDesigner = ({ W, H, pageType, pageIndex, paper: cream, ink, accent: red, secondary: grey, seed }) => {
  const v: PanelVoice = { border: ink, bw: 2.5, rx: 0, fill: alpha(grey, .32), hintInk: alpha(ink, .55) };
  const fr = frame(W, H, 44, { bottom: 62 });
  const G = 14;
  const out: Objs = [];
  const narr = (x: number, y: number, w: number, s: string) => captionBox(x, y, w, s, { font: 'specialElite', size: 10.5, weight: 400, color: ink, fill: cream, stroke: ink, bw: 1.5, pad: 9 });
  const say = (x: number, y: number, w: number, s: string, tail = 22, flip = false) => balloon(x, y, w, s, { font: 'oswald', size: 12, weight: 500, color: ink, fill: cream, stroke: ink, bw: 2, tail, flip, pad: 11 });
  /** Heavy inset shadow: a black block filling one side of a panel. */
  const shadow = (b: Box, side: 'left' | 'right' | 'top' | 'bottom', frac: number) => {
    const inset = v.bw / 2;
    if (side === 'left') return rect(b.x + inset, b.y + inset, R(b.w * frac), b.h - inset * 2, ink, { opacity: .88, label: 'Inset shadow' });
    if (side === 'right') return rect(b.x + b.w - R(b.w * frac) - inset, b.y + inset, R(b.w * frac), b.h - inset * 2, ink, { opacity: .88, label: 'Inset shadow' });
    if (side === 'top') return rect(b.x + inset, b.y + inset, b.w - inset * 2, R(b.h * frac), ink, { opacity: .88, label: 'Inset shadow' });
    return rect(b.x + inset, b.y + b.h - R(b.h * frac) - inset, b.w - inset * 2, R(b.h * frac), ink, { opacity: .88, label: 'Inset shadow' });
  };
  const blinds = (b: Box, count: number) => orn.stripes(b.x + 2, b.y + 2, b.w - 4, b.h - 4, count, R((b.h - 4) / count * .45), ink, { opacity: .55, label: 'Venetian blind shadow' });

  switch (pageType) {
    case 'COMIC COVER': {
      out.push(ground(W, H, ink));
      out.push(quad([[150, 0], [430, 0], [720, 800], [40, 800]], cream, { opacity: .94, label: 'Window light' }));
      out.push(...orn.stripes(40, 0, 680, 800, 16, 12, ink, { opacity: .85, label: 'Blind slat' }));
      for (let i = 0; i < 18; i++) out.push(vr(60 + i * 40 + (i % 3) * 7, 0, 260 + (i % 4) * 60, cream, 1, { opacity: .18, dash: [14, 22], label: 'Rain streak' }));
      out.push(...imageSlot(270, 250, 300, 560, { tone: 'dark', shade: alpha(grey, .45), caption: 'Cover art · figure in the light', ink: alpha(cream, .6), label: 'Cover art slot' }));
      out.push(text(44, 30, 400, 'A Plajah Crime Comic', { size: 9, font: 'oswald', weight: 500, color: cream, tracking: .3, transform: 'uppercase', wrap: false, label: 'Imprint line', role: 'LABEL' }));
      out.push(rect(0, 800, W, 256, ink, { label: 'Title band' }));
      out.push(hr(44, 800, W - 88, cream, 1, { label: 'Title rule' }));
      out.push(text(44, 812, W - 88, 'MIDNIGHT\nCASEFILES', { size: 92, font: 'anton', color: cream, leading: .92, wrap: false, tracking: .01, label: 'Masthead', role: 'HEADLINE' }));
      out.push(text(44, 992, 500, 'Case No. 7 · The Woman Who Wasn’t There', { size: 12, font: 'oswald', weight: 500, color: red, tracking: .2, transform: 'uppercase', wrap: false, label: 'Case slug', role: 'LABEL' }));
      out.push(text(44, 1014, 500, 'Torres · Oda · Oyelaran', { size: 9, font: 'specialElite', color: alpha(cream, .7), tracking: .12, wrap: false, label: 'Creators', role: 'CAPTION' }));
      out.push(text(W - 244, 986, 90, '$5.99', { size: 16, font: 'oswald', weight: 600, color: cream, align: 'right', wrap: false, label: 'Price', role: 'LABEL' }));
      out.push(...barcode(W - 144, 984, 100, 52, ink, cream, seed, '7 20001 00007 3', 'specialElite'));
      return out;
    }
    case 'CHARACTER SHEET': {
      out.push(ground(W, H, cream));
      out.push(rect(44, 44, 236, 34, ink, { label: 'Folder tab' }));
      out.push(text(56, 53, 220, 'CASE FILE 07 · PERSONS OF INTEREST', { size: 9, font: 'specialElite', color: cream, tracking: .08, wrap: false, label: 'Folder tab label', role: 'LABEL' }));
      out.push(hr(44, 78, W - 88, ink, 2, { label: 'Folder edge' }));
      out.push(text(44, 92, 600, 'PERSONS OF\nINTEREST', { size: 64, font: 'anton', color: ink, leading: .9, wrap: false, label: 'Section title', role: 'HEADLINE' }));
      out.push(rect(520, 100, 230, 54, 'none', { stroke: red, strokeWidth: 3, rotation: -12, label: 'Stamp frame' }));
      out.push(text(520, 112, 230, 'CONFIDENTIAL', { size: 26, font: 'oswald', weight: 700, color: red, align: 'center', tracking: .12, wrap: false, rotation: -12, opacity: .85, label: 'Stamp', role: 'LABEL' }));
      const people = [
        { name: 'Vera Lask', alias: 'The Widow', seen: 'Pier 9, 02:10, under a black umbrella', notes: 'Says she never met him. The photograph in his coat pocket says otherwise. Left-handed. Pays cash. Knows the ferry timetable better than the ferrymen.', side: 'left' as const },
        { name: 'Det. Ray Calloway', alias: 'None on file', seen: 'The all-night diner on Ninth, most nights', notes: 'Twenty-two years on the job, eleven of them sober. Keeps the case in a shoebox because the department stopped asking. Owes the coroner a favor and the widow an apology.', side: 'right' as const },
      ];
      people.forEach((p, i) => {
        const y = 250 + i * 360;
        const shot: Box = { x: 44, y, w: 230, h: 300 };
        out.push(...panel(shot, v, `mugshot ${i + 1}`, { hint: 'Portrait · art' }));
        out.push(shadow(shot, p.side, .38));
        out.push(...orn.stripes(shot.x + 2, shot.y + 16, shot.w - 4, 6, 4, 1, ink, { opacity: .6, label: 'Height mark' }));
        const fx = 300, fw = W - 44 - fx;
        const fields: Array<[string, string]> = [['NAME', p.name], ['ALIAS', p.alias], ['LAST SEEN', p.seen]];
        let fy = y + 4;
        fields.forEach(([k, val]) => {
          out.push(text(fx, fy, 90, `${k}:`, { size: 10, font: 'specialElite', color: alpha(ink, .6), wrap: false, label: 'Field label', role: 'LABEL' }));
          const val2 = text(fx + 96, fy, fw - 96, val, { size: 12, font: 'specialElite', color: ink, label: 'Field value', role: 'BODY' });
          out.push(val2, hr(fx + 96, below(val2, 3), fw - 96, ink, .8, { dash: [2, 3], label: 'Typed underline' }));
          fy = below(val2, 18);
        });
        out.push(text(fx, fy + 6, 90, 'NOTES:', { size: 10, font: 'specialElite', color: alpha(ink, .6), wrap: false, label: 'Field label', role: 'LABEL' }));
        out.push(text(fx, fy + 26, fw, p.notes, { size: 11.5, font: 'specialElite', color: ink, leading: 1.55, label: 'Case notes', role: 'BODY' }));
        out.push(rect(fx, y + 264, 110, 26, red, { rotation: -4, opacity: .9, label: 'Status tag' }));
        out.push(text(fx, y + 270, 110, i ? 'INVESTIGATING' : 'SUSPECT', { size: 10, font: 'oswald', weight: 700, color: cream, align: 'center', tracking: .12, wrap: false, rotation: -4, label: 'Status', role: 'LABEL' }));
      });
      out.push(pageNumber(W, H - 34, pageIndex, ink, 'specialElite'));
      return out;
    }
    case 'SPLASH PAGE': {
      out.push(ground(W, H, ink));
      const wide: Box = { x: 44, y: 300, w: W - 88, h: 400 };
      out.push(rect(wide.x, wide.y, wide.w, wide.h, alpha(grey, .5), { stroke: cream, strokeWidth: 2, label: 'Cinematic panel', role: 'IMAGE_SLOT' }));
      out.push(shadow(wide, 'right', .42));
      out.push(hr(wide.x + 2, wide.y + 240, wide.w * .58, cream, 1, { opacity: .5, label: 'Light edge' }));
      out.push(text(wide.x, wide.y + 190, wide.w * .58, 'Wide establishing shot · art', { size: 11, font: 'inter', weight: 700, color: alpha(cream, .6), align: 'center', tracking: .14, transform: 'uppercase', wrap: false, label: 'Image slot hint', role: 'LABEL' }));
      out.push(...narr(60, 220, 330, copy.body('comic', 0)).objs);
      out.push(...narr(W - 44 - 330, 716, 330, 'Rain for three days. The kind that gets into your files.').objs);
      out.push(sfx(wide.x + wide.w - 200, wide.y + 330, 180, 'CLICK.', { font: 'anton', size: 26, color: cream, align: 'right', tracking: .1 }));
      out.push(text(44, 60, 400, 'CASE No. 7', { size: 40, font: 'anton', color: red, wrap: false, label: 'Case kicker', role: 'HEADLINE' }));
      out.push(text(44, 110, W - 88, 'THE WOMAN WHO WASN’T THERE', { size: 54, font: 'anton', color: cream, wrap: false, label: 'Story title', role: 'HEADLINE' }));
      out.push(hr(44, 180, 220, cream, 1, { label: 'Title rule' }));
      out.push(text(44, 820, 400, HERO_CREDITS, { size: 9, font: 'oswald', weight: 500, color: cream, tracking: .16, transform: 'uppercase', label: 'Credits', role: 'CAPTION' }));
      out.push(text(44, 880, W - 88, 'She left the umbrella. People who plan to come back don’t leave the umbrella.', { size: 13, font: 'specialElite', color: alpha(cream, .8), leading: 1.5, label: 'Opening narration', role: 'BODY' }));
      out.push(pageNumber(W, H - 34, pageIndex, cream, 'specialElite'));
      return out;
    }
    case 'COMIC PAGE': {
      out.push(ground(W, H, cream));
      const x0 = fr.x, y0 = fr.y;
      if (pageIndex === 3) {
        // Four cinematic strips
        const g = grid({ x: x0, y: y0, w: fr.w, h: fr.h }, 1, 4, G);
        const s1 = g(0, 0), s2 = g(0, 1), s3 = g(0, 2), s4 = g(0, 3);
        out.push(...panel(s1, v, 1)); out.push(...blinds(s1, 7));
        out.push(...narr(s1.x + 12, s1.y + 12, 300, 'Three days of rain. The river came up to meet it.').objs);
        out.push(...panel(s2, v, 2)); out.push(shadow(s2, 'left', .3));
        out.push(...say(s2.x + s2.w * .35, s2.y + 16, 200, 'You’re late, Detective.', 30).objs);
        out.push(...say(s2.x + s2.w - 250, s2.y + 96, 236, 'I’m never late. Everyone else is early.', 70).objs);
        out.push(...panel(s3, v, 3, { silent: true })); out.push(shadow(s3, 'right', .55));
        out.push(...narr(s3.x + 12, s3.y + s3.h - 60, 280, 'She said she didn’t know him. The photograph said otherwise.').objs);
        out.push(...panel(s4, v, 4)); out.push(shadow(s4, 'top', .5));
        out.push(sfx(s4.x + 20, s4.y + 30, 300, copy.quote('comic', 4), { font: 'specialElite', size: 24, color: cream, align: 'left' }));
        out.push(...narr(s4.x + s4.w - 292, s4.y + s4.h - 62, 280, 'Footsteps on wet stone. Not hers.').objs);
      } else if (pageIndex === 4) {
        // Wide · 60/40 pair · wide
        const s1: Box = { x: x0, y: y0, w: fr.w, h: 300 };
        out.push(...panel(s1, v, 1)); out.push(shadow(s1, 'right', .34));
        out.push(...narr(s1.x + 12, s1.y + 12, 320, 'The diner on Ninth. Two coffees, one of them going cold on purpose.').objs);
        const y2 = y0 + 300 + G;
        const p2: Box = { x: x0, y: y2, w: R(fr.w * .6 - G / 2), h: 300 }, p3: Box = { x: x0 + p2.w + G, y: y2, w: fr.w - p2.w - G, h: 300 };
        out.push(...panel(p2, v, 2)); out.push(...blinds(p2, 9));
        out.push(...say(p2.x + 20, p2.y + 20, 240, 'Who was he to you?', 26).objs);
        out.push(...panel(p3, v, 3)); out.push(shadow(p3, 'left', .5));
        out.push(...say(p3.x + p3.w - 220, p3.y + 22, 200, 'Someone who kept his promises. It got him killed.', 74).objs);
        const y3 = y2 + 300 + G;
        const s4: Box = { x: x0, y: y3, w: fr.w, h: fr.bottom - y3 };
        out.push(...panel(s4, v, 4)); out.push(shadow(s4, 'bottom', .45));
        out.push(...narr(s4.x + 12, s4.y + 12, 300, 'I had two questions and one match. I struck the match.').objs);
        out.push(sfx(s4.x + s4.w - 240, s4.y + s4.h - 70, 220, 'fssst', { font: 'specialElite', size: 22, color: cream, align: 'right', italic: true }));
      } else {
        // Evidence column left · tall panel right · wide foot
        const colW = 236;
        const ev = grid({ x: x0, y: y0, w: colW, h: 640 }, 1, 3, G);
        ['A', 'B', 'C'].forEach((k, i) => {
          const b = ev(0, i);
          out.push(...panel(b, v, `exhibit ${k}`, { hint: `Exhibit ${k} · close-up` }));
          out.push(shadow(b, i % 2 ? 'left' : 'right', .28));
          out.push(rect(b.x + 8, b.y + b.h - 30, 96, 20, cream, { stroke: ink, strokeWidth: 1.2, label: 'Evidence tag' }));
          out.push(text(b.x + 8, b.y + b.h - 26, 96, `EXHIBIT ${k}`, { size: 8.5, font: 'specialElite', color: ink, align: 'center', tracking: .1, wrap: false, label: 'Evidence label', role: 'LABEL' }));
        });
        const tall: Box = { x: x0 + colW + G, y: y0, w: fr.w - colW - G, h: 640 };
        out.push(...panel(tall, v, 4)); out.push(shadow(tall, 'left', .4)); out.push(...blinds({ x: tall.x + R(tall.w * .4), y: tall.y, w: R(tall.w * .6), h: tall.h }, 11));
        out.push(...narr(tall.x + tall.w * .42, tall.y + 14, 250, 'A key, a matchbook, a photograph. Three things that should never have been in the same coat.').objs);
        out.push(...say(tall.x + tall.w - 236, tall.y + tall.h - 150, 220, 'Tell me about the ferry, Vera.', 72, false).objs);
        const y3 = y0 + 640 + G;
        const s5: Box = { x: x0, y: y3, w: fr.w, h: fr.bottom - y3 };
        out.push(...panel(s5, v, 5)); out.push(shadow(s5, 'top', .5));
        out.push(...say(s5.x + 30, s5.y + s5.h - 110, 250, 'I took it once. I didn’t come back the same.', 30, true).objs);
        out.push(...narr(s5.x + s5.w - 300, s5.y + s5.h - 62, 288, 'For the first time all week, it stopped raining.').objs);
      }
      out.push(pageNumber(W, H - 34, pageIndex, ink, 'specialElite'));
      return out;
    }
    default: {
      out.push(ground(W, H, cream));
      out.push(rect(0, 0, W, 90, ink, { label: 'Head band' }));
      out.push(text(44, 24, 500, 'MIDNIGHT CASEFILES', { size: 34, font: 'anton', color: cream, wrap: false, label: 'Masthead · small', role: 'HEADLINE' }));
      out.push(text(W - 344, 40, 300, 'Case No. 7 · Closed', { size: 9, font: 'oswald', weight: 500, color: red, tracking: .26, transform: 'uppercase', align: 'right', wrap: false, label: 'Case status', role: 'LABEL' }));
      const win: Box = { x: 258, y: 200, w: 300, h: 220 };
      out.push(...panel(win, v, 'closing', { hint: 'Closing image · rain on glass' }));
      out.push(...blinds(win, 8));
      out.push(text(120, 470, W - 240, 'Every case closes. Not every case ends.', { size: 20, font: 'specialElite', color: ink, align: 'center', leading: 1.4, label: 'Closing line', role: 'DECK' }));
      out.push(rect(W / 2 - 100, 560, 200, 46, 'none', { stroke: red, strokeWidth: 3, rotation: -8, label: 'Stamp frame' }));
      out.push(text(W / 2 - 100, 570, 200, 'TO BE CONTINUED', { size: 18, font: 'oswald', weight: 700, color: red, align: 'center', tracking: .14, wrap: false, rotation: -8, opacity: .85, label: 'Stamp', role: 'LABEL' }));
      out.push(hr(44, 700, W - 88, ink, 1, { label: 'Colophon rule' }));
      out.push(text(44, 716, 340, 'MIDNIGHT CASEFILES No. 7. Story Mia Torres · Art Kenji Oda · Letters Bea Oyelaran. Published by Plajah Crime Comics. The city in these pages is not yours, but you will recognise the rain.', { size: 9.5, font: 'specialElite', color: ink, leading: 1.55, label: 'Colophon', role: 'CAPTION' }));
      out.push(text(430, 716, 342, 'NEXT CASE · No. 8 · THE LONG WAY TO THE FERRY\n\nCalloway takes the 02:10. Vera is already on it. Only one of them bought a return ticket.', { size: 9.5, font: 'specialElite', color: ink, leading: 1.55, label: 'Next case', role: 'CAPTION' }));
      out.push(text(44, 900, 400, 'Letters: casefiles@plajah.example · Every letter is read. Not every letter is answered. That’s the job.', { size: 9, font: 'specialElite', color: alpha(ink, .7), leading: 1.5, label: 'Contact', role: 'CAPTION' }));
      out.push(...barcode(W - 144, H - 92, 100, 52, ink, WHITE, seed + 1, '7 20001 00008 0', 'specialElite'));
      return out;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BRIGHT SIDE COMICS — kids. Open grids, rounded corners, big balloons, pastel.
// ─────────────────────────────────────────────────────────────────────────────
const kids: PublicationDesigner = ({ W, H, pageType, pageIndex, paper, ink, accent: coral, secondary: teal, seed }) => {
  const sun = '#FFD166';
  const pastel = [alpha(coral, .18), alpha(teal, .18), alpha(sun, .35), alpha(ink, .08)];
  const v: PanelVoice = { border: ink, bw: 3, rx: 14, fill: pastel[0], hintInk: alpha(ink, .45) };
  const fr = frame(W, H, 40, { bottom: 64 });
  const G = 14;
  const out: Objs = [];
  const say = (x: number, y: number, w: number, s: string, tail = 22, flip = false, size = 14) => balloon(x, y, w, s, { font: 'comicNeue', size, weight: 700, color: ink, stroke: ink, bw: 3, tail, flip, pad: 14, leading: 1.2 });
  const cap = (x: number, y: number, w: number, s: string) => captionBox(x, y, w, s, { font: 'comicNeue', size: 11, weight: 700, color: ink, fill: WHITE, stroke: ink, bw: 2, rx: 10, pad: 8 });
  const pop = (x: number, y: number, w: number, s: string, size: number, color: string, rot: number) => sfx(x, y, w, s, { font: 'baloo', size, color, stroke: WHITE, bw: Math.max(3, size * .09), rotation: rot });
  const face = (cx: number, cy: number, r: number, fill: string): Objs => [circle(cx, cy, r, fill, { stroke: ink, strokeWidth: 3, label: 'Character dot' }), circle(cx - r * .3, cy - r * .15, r * .13, ink, { label: 'Eye' }), circle(cx + r * .3, cy - r * .15, r * .13, ink, { label: 'Eye' }), path(cx - r * .3, cy + r * .1, r * .6, r * .3, 'M0 0 Q50 100 100 0', 'none', { stroke: ink, strokeWidth: 3, open: true, label: 'Smile' })];
  const folioDot = (n: number): Objs => [circle(W / 2, H - 30, 14, coral, { stroke: ink, strokeWidth: 2, label: 'Folio dot' }), text(W / 2 - 20, H - 38, 40, String(n), { size: 12, font: 'baloo', weight: 800, color: WHITE, align: 'center', wrap: false, label: 'Folio', role: 'FOLIO' })];

  switch (pageType) {
    case 'COMIC COVER': {
      out.push(ground(W, H, paper));
      out.push(...orn.radialLines(W * .78, 150, 130, 400, 18, sun, 10, { opacity: .55, label: 'Sun ray' }));
      out.push(circle(W * .78, 150, 118, sun, { stroke: ink, strokeWidth: 4, label: 'Sun' }));
      out.push(ellipse(-120, 780, 700, 420, mix(teal, .55), { stroke: ink, strokeWidth: 4, label: 'Hill · near' }));
      out.push(ellipse(380, 820, 620, 380, mix(coral, .6), { stroke: ink, strokeWidth: 4, label: 'Hill · far' }));
      out.push(rect(52, 66, 520, 150, WHITE, { rx: 40, stroke: ink, strokeWidth: 4, label: 'Title pill' }));
      out.push(text(72, 72, 480, 'Bright Side', { size: 82, font: 'baloo', weight: 800, color: ink, wrap: false, label: 'Masthead', role: 'HEADLINE' }));
      out.push(text(76, 168, 480, 'COMICS · No. 1 · Spring', { size: 20, font: 'baloo', weight: 700, color: coral, tracking: .12, wrap: false, label: 'Masthead · imprint', role: 'LABEL' }));
      out.push(...imageSlot(52, 260, 712, 500, { shade: alpha(teal, .15), rx: 24, frame: ink, frameWidth: 4, caption: 'Cover art · the gang on the hill', ink: alpha(ink, .45), label: 'Cover art slot' }));
      out.push(...say(430, 290, 300, 'Race you to the big tree!', 30, false, 18).objs);
      out.push(...face(120, 900, 44, coral), ...face(230, 930, 36, teal), ...face(330, 905, 40, sun));
      out.push(text(400, 880, 300, 'Starring Pip, Margo\nand Biscuit!', { size: 22, font: 'baloo', weight: 800, color: ink, leading: 1.05, wrap: false, label: 'Cover line', role: 'DECK' }));
      out.push(circle(W - 100, 900, 46, coral, { stroke: ink, strokeWidth: 3, label: 'Age badge' }));
      out.push(text(W - 146, 880, 92, 'AGES\n6+', { size: 18, font: 'baloo', weight: 800, color: WHITE, align: 'center', leading: 1, wrap: false, label: 'Age badge lettering', role: 'LABEL' }));
      out.push(...barcode(W - 160, H - 80, 116, 54, ink, WHITE, seed, '7 55555 00001 6', 'comicNeue', 8));
      out.push(text(52, H - 60, 300, '$3.99 · Plajah Kids', { size: 12, font: 'comicNeue', weight: 700, color: ink, wrap: false, label: 'Price', role: 'LABEL' }));
      return out;
    }
    case 'CHARACTER SHEET': {
      out.push(ground(W, H, paper));
      out.push(text(40, 40, 600, 'Meet the Gang!', { size: 64, font: 'baloo', weight: 800, color: ink, wrap: false, label: 'Section title', role: 'HEADLINE' }));
      out.push(text(42, 118, 500, 'Three friends, one hill, and a lot of very good ideas.', { size: 14, font: 'comicNeue', weight: 700, color: ink, wrap: false, label: 'Deck', role: 'DECK' }));
      const cast = [
        { name: 'Pip', who: 'A very fast snail', likes: 'Racing, rain, the smell of new leaves', not: 'Being called slow. Salt.', fill: pastel[0], face: coral },
        { name: 'Margo', who: 'Inventor, age 9', likes: 'Kettles, cardboard, a good plan', not: 'When the plan works too early', fill: pastel[1], face: teal },
        { name: 'Biscuit', who: 'Dog, expert digger', likes: 'Digging, sticks, Pip (gently)', not: 'Baths. Thunder. Baths in thunder.', fill: pastel[2], face: sun },
      ];
      const g = grid({ x: fr.x, y: 160, w: fr.w, h: 720 }, 3, 1, 20);
      cast.forEach((c, i) => {
        const b = g(i, 0);
        out.push(rect(b.x, b.y, b.w, b.h, c.fill, { rx: 22, stroke: ink, strokeWidth: 3, label: 'Character card' }));
        out.push(...imageSlot(b.x + 20, b.y + 20, b.w - 40, b.w - 40, { shade: WHITE, rx: (b.w - 40) / 2, frame: ink, frameWidth: 3, caption: `${c.name} · portrait`, ink: alpha(ink, .45), label: 'Portrait slot' }));
        out.push(...face(b.x + b.w - 34, b.y + 34, 22, c.face));
        out.push(text(b.x + 20, b.y + b.w + 4, b.w - 40, c.name, { size: 40, font: 'baloo', weight: 800, color: ink, wrap: false, label: 'Character name', role: 'LABEL' }));
        out.push(text(b.x + 20, b.y + b.w + 52, b.w - 40, c.who, { size: 12, font: 'comicNeue', weight: 700, color: coral, wrap: false, label: 'Who', role: 'LABEL' }));
        const l1 = text(b.x + 20, b.y + b.w + 84, b.w - 40, 'Likes', { size: 11, font: 'baloo', weight: 800, color: teal, tracking: .1, transform: 'uppercase', wrap: false, label: 'Likes label', role: 'LABEL' });
        const l2 = text(b.x + 20, below(l1, 4), b.w - 40, c.likes, { size: 12, font: 'comicNeue', weight: 700, color: ink, leading: 1.35, label: 'Likes', role: 'BODY' });
        const n1 = text(b.x + 20, below(l2, 14), b.w - 40, 'Not so much', { size: 11, font: 'baloo', weight: 800, color: coral, tracking: .1, transform: 'uppercase', wrap: false, label: 'Dislikes label', role: 'LABEL' });
        const n2 = text(b.x + 20, below(n1, 4), b.w - 40, c.not, { size: 12, font: 'comicNeue', weight: 700, color: ink, leading: 1.35, label: 'Dislikes', role: 'BODY' });
        out.push(l1, l2, n1, n2);
        out.push(path(b.x + 20, b.y + b.h - 56, 32, 32, orn.starPath(5, .45), sun, { stroke: ink, strokeWidth: 2, label: 'Star' }));
        out.push(text(b.x + 60, b.y + b.h - 50, b.w - 80, ['Fastest friend', 'Best ideas', 'Bravest bark'][i], { size: 12, font: 'comicNeue', weight: 700, color: ink, wrap: false, label: 'Superlative', role: 'CAPTION' }));
      });
      out.push(...say(60, 900, 320, 'Do snails have birthdays?', 30, false, 15).objs);
      out.push(...say(440, 910, 320, 'Every day, if you ask nicely.', 60, false, 15).objs);
      out.push(...folioDot(pageIndex));
      return out;
    }
    case 'SPLASH PAGE': {
      out.push(ground(W, H, paper));
      out.push(...panel({ x: fr.x, y: fr.y, w: fr.w, h: fr.h }, v, 'splash', { hint: 'Splash art · the big race', fill: pastel[1] }));
      for (let i = 0; i < 7; i++) out.push(hr(70, 520 + i * 26, 160 + (i % 3) * 60, ink, 4, { opacity: .8, label: 'Motion line' }));
      out.push(...cap(fr.x + 20, fr.y + 20, 320, 'Saturday. The hill. The big race.').objs);
      out.push(...say(fr.x + 60, 140, 380, 'WAIT FOR MEEEE!', 26, false, 30).objs);
      out.push(pop(300, 560, 460, 'ZOOM!', 120, coral, -12));
      out.push(...thought(fr.right - 290, fr.bottom - 220, 250, 'Is it cheating if the hill is on my side?', { font: 'comicNeue', size: 13, stroke: ink, bw: 2.5, dotsAt: 'left' }).objs);
      out.push(...folioDot(pageIndex));
      return out;
    }
    case 'COMIC PAGE': {
      out.push(ground(W, H, paper));
      const area: Box = { x: fr.x, y: fr.y, w: fr.w, h: fr.h };
      if (pageIndex === 3) {
        const g = grid(area, 2, 2, G);
        const cells = [g(0, 0), g(1, 0), g(0, 1), g(1, 1)];
        cells.forEach((b, i) => out.push(...panel(b, v, i + 1, { fill: pastel[i % 4] })));
        out.push(...say(cells[0].x + 20, cells[0].y + 20, 260, 'I found a rock that looks like a duck!', 26).objs);
        out.push(...say(cells[1].x + 60, cells[1].y + 20, 260, 'Does it quack?', 60).objs);
        out.push(...say(cells[2].x + 20, cells[2].y + 30, 280, 'Only on the inside.', 30).objs);
        out.push(pop(cells[3].x + 20, cells[3].y + cells[3].h - 170, cells[3].w - 40, 'SPLAT', 84, teal, 8));
        out.push(...cap(cells[3].x + 16, cells[3].y + 16, 220, 'Biscuit did not wait to find out.').objs);
      } else if (pageIndex === 4) {
        const top: Box = { x: area.x, y: area.y, w: area.w, h: 400 };
        out.push(...panel(top, v, 1, { fill: pastel[2] }));
        out.push(...cap(top.x + 20, top.y + 20, 300, 'Margo’s workshop. Mostly cardboard.').objs);
        out.push(...say(top.x + top.w - 320, top.y + 40, 300, 'Behold! The Snail Speeder 3000!', 70).objs);
        const y2 = top.y + top.h + G;
        const g = grid({ x: area.x, y: y2, w: area.w, h: area.h - top.h - G }, 3, 1, G);
        [0, 1, 2].forEach(i => out.push(...panel(g(i, 0), v, i + 2, { fill: pastel[(i + 3) % 4] })));
        out.push(...say(g(0, 0).x + 14, y2 + 20, g(0, 0).w - 28, 'Does it go fast?', 30).objs);
        out.push(...say(g(1, 0).x + 14, y2 + 20, g(1, 0).w - 28, 'It goes. Fast is a bonus.', 50).objs);
        out.push(pop(g(2, 0).x + 10, y2 + 200, g(2, 0).w - 20, 'BOING!', 60, coral, -10));
      } else {
        const tall: Box = { x: area.x, y: area.y, w: R(area.w * .55), h: area.h };
        out.push(...panel(tall, v, 1, { fill: pastel[1] }));
        out.push(...say(tall.x + 24, tall.y + 24, 300, 'Okay. Deep breath. On three.', 26).objs);
        out.push(pop(tall.x + 20, tall.y + tall.h - 220, tall.w - 40, 'WHEEE', 80, sun, -16));
        const g = grid({ x: tall.x + tall.w + G, y: area.y, w: area.w - tall.w - G, h: area.h }, 1, 3, G);
        [0, 1, 2].forEach(i => out.push(...panel(g(0, i), v, i + 2, { fill: pastel[(i + 2) % 4] })));
        out.push(...say(g(0, 0).x + 16, g(0, 0).y + 18, g(0, 0).w - 32, 'One…', 30).objs);
        out.push(...say(g(0, 1).x + 16, g(0, 1).y + 18, g(0, 1).w - 32, 'Two…', 50).objs);
        out.push(...say(g(0, 2).x + 16, g(0, 2).y + 18, g(0, 2).w - 32, 'Biscuit, that was two!', 70).objs);
      }
      out.push(...folioDot(pageIndex));
      return out;
    }
    default: {
      out.push(ground(W, H, paper));
      out.push(text(40, 44, 700, 'The End… for now!', { size: 62, font: 'baloo', weight: 800, color: ink, wrap: false, label: 'Closing title', role: 'HEADLINE' }));
      out.push(rect(40, 150, W - 80, 440, WHITE, { rx: 22, stroke: ink, strokeWidth: 3, dash: [12, 10], label: 'Draw-here panel' }));
      out.push(text(60, 170, W - 120, 'Draw what happens next!', { size: 24, font: 'baloo', weight: 800, color: coral, align: 'center', wrap: false, label: 'Activity prompt', role: 'DECK' }));
      out.push(...say(80, 420, 280, 'Pip, where did you learn to skate?', 30, false, 13).objs);
      out.push(...face(120, 520, 34, coral), ...face(W - 150, 500, 40, teal), ...face(W - 260, 540, 30, sun));
      out.push(rect(40, 630, W - 80, 120, pastel[2], { rx: 18, stroke: ink, strokeWidth: 3, label: 'Next-issue card' }));
      out.push(text(64, 646, 400, 'NEXT TIME', { size: 12, font: 'baloo', weight: 800, color: coral, tracking: .16, wrap: false, label: 'Next kicker', role: 'LABEL' }));
      out.push(text(64, 664, W - 128, 'Pip Learns to Skate (Sort Of)', { size: 34, font: 'baloo', weight: 800, color: ink, wrap: false, label: 'Next title', role: 'LABEL' }));
      out.push(text(64, 710, W - 128, 'Margo builds a ramp. Biscuit eats the ramp. Pip is still deciding.', { size: 13, font: 'comicNeue', weight: 700, color: ink, wrap: false, label: 'Next teaser', role: 'CAPTION' }));
      out.push(text(40, 790, 460, 'BRIGHT SIDE COMICS No. 1, Spring. Made by the Bright Side studio for readers aged six and up, and for grown-ups who read aloud with good voices. Story Mia Torres · Art Kenji Oda · Letters Bea Oyelaran. Every issue is printed on paper you can draw on.', { size: 10, font: 'comicNeue', weight: 700, color: ink, leading: 1.5, label: 'Colophon', role: 'CAPTION' }));
      out.push(text(40, 920, 400, 'Bright Side', { size: 44, font: 'baloo', weight: 800, color: ink, wrap: false, label: 'Masthead · small', role: 'LABEL' }));
      out.push(text(42, 972, 400, 'comics for the curious', { size: 12, font: 'comicNeue', weight: 700, color: teal, wrap: false, label: 'Tagline', role: 'LABEL' }));
      out.push(...barcode(W - 160, H - 84, 116, 54, ink, WHITE, seed + 1, '7 55555 00002 3', 'comicNeue', 8));
      return out;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PANEL STORIES — literary anthology. Playfair titles, Lora, hairline discipline.
// ─────────────────────────────────────────────────────────────────────────────
const anthology: PublicationDesigner = ({ W, H, pageType, pageIndex, paper, ink, accent: wine, secondary: pine, seed }) => {
  const v: PanelVoice = { border: ink, bw: 2, rx: 0, fill: alpha(ink, .07), hintInk: alpha(ink, .45) };
  const fr = frame(W, H, 60, { top: 76, bottom: 84 });
  const G = 14;
  const out: Objs = [];
  const say = (x: number, y: number, w: number, s: string, tail = 22, flip = false) => balloon(x, y, w, s, { font: 'lora', size: 11.5, weight: 500, color: ink, fill: paper, stroke: ink, bw: 1.5, tail, flip, pad: 11, leading: 1.3 });
  const cap = (x: number, y: number, w: number, s: string) => captionBox(x, y, w, s, { font: 'lora', size: 10.5, weight: 400, italic: true, color: ink, fill: paper, stroke: ink, bw: 1, pad: 8 });
  const runningHead = (title: string, n: number): Objs => {
    const verso = n % 2 === 0;
    return [
      text(verso ? fr.x : fr.x + fr.w / 2, 40, fr.w / 2, title, { size: 10, font: 'playfair', italic: true, color: ink, align: verso ? 'left' : 'right', wrap: false, label: 'Running head', role: 'FOLIO' }),
      text(verso ? fr.x : fr.x + fr.w / 2, H - 52, fr.w / 2, String(n), { size: 10, font: 'inter', weight: 500, color: ink, align: verso ? 'left' : 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
      hr(fr.x, 56, fr.w, ink, .6, { label: 'Head rule' }),
    ];
  };

  switch (pageType) {
    case 'COMIC COVER': {
      out.push(ground(W, H, paper));
      out.push(hr(60, 62, W - 120, ink, .8, { label: 'Masthead rule · top' }));
      out.push(text(60, 74, W - 120, 'Panel Stories', { size: 74, font: 'playfair', weight: 900, color: ink, align: 'center', wrap: false, label: 'Masthead', role: 'HEADLINE' }));
      out.push(hr(60, 170, W - 120, ink, .8, { label: 'Masthead rule · bottom' }));
      out.push(text(60, 180, W - 120, 'Volume Three · Autumn · Short comics in a long tradition', { size: 9, font: 'inter', weight: 600, color: ink, tracking: .22, transform: 'uppercase', align: 'center', wrap: false, label: 'Volume line', role: 'LABEL' }));
      out.push(...imageSlot(120, 228, W - 240, 560, { shade: alpha(pine, .14), frame: ink, frameWidth: 1, caption: 'Cover comic · one panel', ink: alpha(ink, .45), label: 'Cover slot' }));
      out.push(rect(W / 2 - 7, 808, 14, 14, wine, { label: 'Accent mark' }));
      out.push(text(120, 840, W - 240, 'Comics by Ines Ferreira · Tomasz Wrona · Ada Nkemelu · Ren Ishikawa · Marisol Vega', { size: 13, font: 'lora', italic: true, color: ink, align: 'center', leading: 1.45, label: 'Contributors', role: 'DECK' }));
      out.push(text(120, 900, W - 240, 'With an editors’ note on the three-panel page and why it still works', { size: 11, font: 'lora', color: alpha(ink, .75), align: 'center', leading: 1.4, label: 'Cover note', role: 'CAPTION' }));
      out.push(text(60, H - 70, 300, 'No. 3 · $14 · ISSN 2831-0000', { size: 8.5, font: 'inter', weight: 600, color: ink, tracking: .12, transform: 'uppercase', wrap: false, label: 'Issue slug', role: 'LABEL' }));
      out.push(text(W - 360, H - 70, 300, 'panelstories.example', { size: 8.5, font: 'inter', weight: 600, color: ink, tracking: .12, align: 'right', wrap: false, label: 'URL', role: 'LABEL' }));
      return out;
    }
    case 'CONTENTS': {
      out.push(ground(W, H, paper));
      out.push(...runningHead('Panel Stories · Volume Three', pageIndex));
      out.push(text(fr.x, 90, 400, 'Contents', { size: 44, font: 'playfair', weight: 700, color: ink, wrap: false, label: 'Section title', role: 'HEADLINE' }));
      const entries = [
        ['Tidewater', 'Ines Ferreira', '3'], ['The Long Lunch', 'Tomasz Wrona', '11'], ['Salt & Static', 'Ada Nkemelu', '19'], ['A Door on Fennel Street', 'Ren Ishikawa', '27'], ['What the Radio Knew', 'Marisol Vega', '35'], ['Editors’ note', 'The collective', '43'],
      ];
      const colW = 440;
      let y = 176;
      entries.forEach(([t, by, pg], i) => {
        out.push(text(fr.x, y - 6, 60, String(i + 1).padStart(2, '0'), { size: 30, font: 'playfair', weight: 400, color: wine, wrap: false, label: 'Entry number', role: 'LABEL' }));
        out.push(text(fr.x + 64, y, colW - 120, t, { size: 19, font: 'playfair', weight: 700, color: ink, wrap: false, label: 'Entry title', role: 'LABEL' }));
        out.push(text(fr.x + 64, y + 26, colW - 120, by, { size: 11, font: 'lora', italic: true, color: ink, wrap: false, label: 'Entry creator', role: 'CAPTION' }));
        out.push(hr(fr.x + 64, y + 22, colW - 130, ink, .6, { dash: [1, 3], opacity: .6, label: 'Leader' }));
        out.push(text(fr.x + colW - 50, y, 50, pg, { size: 14, font: 'inter', weight: 500, color: ink, align: 'right', wrap: false, label: 'Entry page', role: 'LABEL' }));
        y += 96;
      });
      const tx = fr.x + colW + 40, tw = fr.right - tx;
      [0, 1, 2, 3].forEach(i => {
        out.push(...imageSlot(tx, 176 + i * 150, tw, 116, { shade: alpha(i % 2 ? pine : wine, .12), frame: ink, frameWidth: .8, caption: `Story ${i + 1} · panel`, ink: alpha(ink, .45), label: 'Thumbnail slot' }));
        out.push(text(tx, 176 + i * 150 + 120, tw, ['Tidewater', 'The Long Lunch', 'Salt & Static', 'A Door on Fennel Street'][i], { size: 9, font: 'inter', weight: 500, color: ink, tracking: .06, wrap: false, label: 'Thumbnail caption', role: 'CAPTION' }));
      });
      out.push(rect(fr.x, 820, 14, 14, wine, { label: 'Accent mark' }));
      out.push(text(fr.x + 26, 818, colW, 'Cover: a panel from Tidewater. Every story in this volume was drawn for these pages and appears here first.', { size: 10.5, font: 'lora', color: ink, leading: 1.45, label: 'Contents note', role: 'CAPTION' }));
      return out;
    }
    case 'COMIC PAGE': {
      out.push(ground(W, H, paper));
      const area: Box = { x: fr.x, y: fr.y, w: fr.w, h: fr.h };
      if (pageIndex === 2) {
        out.push(...runningHead('Tidewater · Ines Ferreira', pageIndex));
        const g = grid(area, 3, 1, G);
        [0, 1, 2].forEach(i => out.push(...panel(g(i, 0), v, i + 1, { fill: alpha(pine, .06 + i * .05) })));
        out.push(...cap(g(0, 0).x + 12, g(0, 0).y + 12, g(0, 0).w - 24, 'The tide went out further than anyone remembered.').objs);
        out.push(...say(g(1, 0).x + 12, g(1, 0).y + 200, g(1, 0).w - 24, 'Do you remember the house on Fennel Street?', 30).objs);
        out.push(...say(g(2, 0).x + 12, g(2, 0).y + 330, g(2, 0).w - 24, 'I remember the door. Everything else is a rumour.', 60).objs);
        out.push(sfx(g(2, 0).x + 10, g(2, 0).y + g(2, 0).h - 90, g(2, 0).w - 20, 'hush', { font: 'playfair', size: 34, color: alpha(ink, .55), italic: true }));
      } else {
        out.push(...runningHead('The Long Lunch · Tomasz Wrona', pageIndex));
        const g = grid(area, 2, 3, G);
        let n = 1;
        for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) out.push(...panel(g(c, r), v, n++, { fill: alpha(wine, .05 + ((r + c) % 2) * .05), silent: r === 1 && c === 1 }));
        out.push(...cap(g(0, 0).x + 12, g(0, 0).y + 12, g(0, 0).w - 60, 'Sunday. The table was set for six and there were two of us.').objs);
        out.push(...say(g(1, 0).x + 30, g(1, 0).y + 20, g(1, 0).w - 60, 'You cooked for everyone.', 60).objs);
        out.push(...say(g(0, 1).x + 20, g(0, 1).y + 20, g(0, 1).w - 60, 'I cooked for whoever came. That’s different.', 26).objs);
        out.push(...cap(g(0, 2).x + 12, g(0, 2).y + g(0, 2).h - 56, g(0, 2).w - 24, 'The soup did not mind.').objs);
        out.push(...say(g(1, 2).x + 30, g(1, 2).y + 24, g(1, 2).w - 60, 'Pass the bread. Tell me about the door.', 70).objs);
      }
      return out;
    }
    case 'SPLASH PAGE': {
      out.push(ground(W, H, paper));
      out.push(...runningHead('The Long Lunch · Tomasz Wrona', pageIndex));
      out.push(rect(fr.x, fr.y, fr.w, fr.h, alpha(wine, .08), { stroke: ink, strokeWidth: 1, label: 'Opening panel', role: 'IMAGE_SLOT' }));
      out.push(text(fr.x, fr.y + fr.h * .4, fr.w, 'Opening image · full page', { size: 11, font: 'inter', weight: 700, color: alpha(ink, .45), align: 'center', tracking: .14, transform: 'uppercase', wrap: false, label: 'Image slot hint', role: 'LABEL' }));
      out.push(...cap(fr.x + 24, fr.y + 24, 300, '“Nobody wants to be understood quickly. They want to be understood well.”').objs);
      out.push(rect(fr.x + 1, fr.bottom - 170, fr.w - 2, 169, paper, { label: 'Title strip' }));
      out.push(hr(fr.x + 1, fr.bottom - 170, fr.w - 2, ink, 1, { label: 'Title strip rule' }));
      out.push(text(fr.x + 30, fr.bottom - 150, fr.w - 60, 'The Long Lunch', { size: 58, font: 'playfair', weight: 900, color: ink, wrap: false, label: 'Story title', role: 'HEADLINE' }));
      out.push(text(fr.x + 32, fr.bottom - 74, fr.w - 60, 'by Tomasz Wrona · eight pages · lettered by hand', { size: 12, font: 'lora', italic: true, color: ink, wrap: false, label: 'Story byline', role: 'DECK' }));
      out.push(rect(fr.right - 44, fr.bottom - 44, 14, 14, wine, { label: 'Accent mark' }));
      return out;
    }
    case 'EDITOR’S NOTE': {
      out.push(ground(W, H, paper));
      out.push(...runningHead('Editors’ note', pageIndex));
      out.push(text(fr.x, 92, 420, 'From the editors', { size: 36, font: 'playfair', weight: 700, color: ink, wrap: false, label: 'Section title', role: 'HEADLINE' }));
      out.push(text(fr.x, 140, 420, 'On the three-panel page, and why we keep coming back to it', { size: 13, font: 'lora', italic: true, color: ink, leading: 1.4, label: 'Deck', role: 'DECK' }));
      out.push(...imageSlot(fr.right - 150, 92, 150, 190, { shade: alpha(pine, .14), frame: ink, frameWidth: .8, caption: 'Editors · portrait', ink: alpha(ink, .45), label: 'Portrait slot' }));
      out.push(text(fr.right - 150, 288, 150, 'The Panel Stories collective, photographed at the long table.', { size: 8.5, font: 'inter', weight: 500, color: ink, leading: 1.4, label: 'Portrait caption', role: 'CAPTION' }));
      const mw = 400;
      const cap0 = text(fr.x, 202, 62, 'W', { size: 78, font: 'playfair', weight: 900, color: wine, wrap: false, label: 'Drop cap', role: 'ORNAMENT' });
      out.push(cap0);
      const p1 = text(fr.x + 66, 214, mw - 66, 'e asked five cartoonists for eight pages each and one rule: at least one page had to be three panels tall, with nothing else on it. Three tall panels are the oldest rhythm in comics and the hardest to fake. There is no room to hide a weak drawing behind a busy grid.', { size: 12, font: 'lora', color: ink, leading: 1.55, label: 'Letter paragraph', role: 'BODY' });
      out.push(p1);
      const p2 = text(fr.x, below(p1, 14), mw, 'What came back surprised us. Ines Ferreira drew a tide going out. Tomasz Wrona drew a table set for six. Nobody drew an explosion, and nobody needed to; the tall panel does the slowing down for you. You read it the way you walk into a room.', { size: 12, font: 'lora', color: ink, leading: 1.55, label: 'Letter paragraph', role: 'BODY' });
      out.push(p2);
      const p3 = text(fr.x, below(p2, 14), mw, 'This volume is lettered by hand throughout, on paper, and then scanned. Some of the balloons lean. We left them. A balloon that leans is a voice with a body behind it.', { size: 12, font: 'lora', color: ink, leading: 1.55, label: 'Letter paragraph', role: 'BODY' });
      out.push(p3);
      const p4 = text(fr.x, below(p3, 14), mw, 'Thank you for reading slowly. The next volume is about doors.', { size: 12, font: 'lora', color: ink, leading: 1.55, label: 'Letter paragraph', role: 'BODY' });
      out.push(p4);
      out.push(text(fr.x, below(p4, 26), mw, '— The Panel Stories collective', { size: 13, font: 'playfair', italic: true, color: ink, wrap: false, label: 'Signature', role: 'CAPTION' }));
      out.push(hr(fr.x, below(p4, 60), 120, wine, 1.2, { label: 'Signature rule' }));
      out.push(...imageSlot(fr.right - 150, 340, 150, 110, { shade: alpha(wine, .1), frame: ink, frameWidth: .8, caption: 'Process · pencils', ink: alpha(ink, .45), label: 'Process slot' }));
      out.push(text(fr.right - 150, 456, 150, 'Pencils for page 3 of Tidewater, before the tide was inked.', { size: 8.5, font: 'inter', weight: 500, color: ink, leading: 1.4, label: 'Process caption', role: 'CAPTION' }));
      return out;
    }
    default: {
      out.push(ground(W, H, paper));
      out.push(hr(60, 62, W - 120, ink, .8, { label: 'Masthead rule · top' }));
      out.push(text(60, 70, W - 120, 'Panel Stories', { size: 30, font: 'playfair', weight: 900, color: ink, align: 'center', wrap: false, label: 'Masthead · small', role: 'LABEL' }));
      out.push(hr(60, 112, W - 120, ink, .8, { label: 'Masthead rule · bottom' }));
      out.push(...imageSlot(258, 220, 300, 300, { shade: alpha(pine, .12), frame: ink, frameWidth: 1, caption: 'Closing panel', ink: alpha(ink, .45), label: 'Closing slot' }));
      out.push(text(140, 550, W - 280, '“A margin is a promise that the page is not finished with you.”', { size: 16, font: 'playfair', italic: true, color: ink, align: 'center', leading: 1.4, label: 'Closing line', role: 'DECK' }));
      out.push(rect(W / 2 - 7, 620, 14, 14, wine, { label: 'Accent mark' }));
      const cols = [fr.x, fr.x + fr.w / 2 + 20];
      out.push(text(cols[0], 680, fr.w / 2 - 20, 'PANEL STORIES · VOLUME THREE', { size: 8.5, font: 'inter', weight: 700, color: ink, tracking: .16, wrap: false, label: 'Colophon head', role: 'LABEL' }));
      out.push(text(cols[0], 698, fr.w / 2 - 20, 'Edited by the Panel Stories collective. Comics © their creators. Set in Playfair Display and Lora; lettered by hand. Printed in a run of 800 on uncoated stock by a press that still answers the phone.', { size: 9.5, font: 'lora', color: ink, leading: 1.5, label: 'Colophon', role: 'CAPTION' }));
      out.push(text(cols[1], 680, fr.w / 2 - 20, 'CONTRIBUTORS', { size: 8.5, font: 'inter', weight: 700, color: ink, tracking: .16, wrap: false, label: 'Contributors head', role: 'LABEL' }));
      out.push(text(cols[1], 698, fr.w / 2 - 20, 'Ines Ferreira · Tomasz Wrona · Ada Nkemelu · Ren Ishikawa · Marisol Vega\n\nSubmissions open each spring. Eight pages, one three-panel page, no explosions required.', { size: 9.5, font: 'lora', color: ink, leading: 1.5, label: 'Contributors', role: 'CAPTION' }));
      out.push(text(60, H - 70, 300, 'ISSN 2831-0000 · No. 3', { size: 8.5, font: 'inter', weight: 600, color: ink, tracking: .12, wrap: false, label: 'Issue slug', role: 'LABEL' }));
      out.push(...barcode(W - 170, H - 90, 110, 50, ink, paper, seed, '9 772831 000003', 'inter'));
      return out;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RISING IMPACT — shōnen. White/black/red, speed lines, reaction strips, RTL.
// ─────────────────────────────────────────────────────────────────────────────
const shonen: PublicationDesigner = ({ W, H, pageType, pageIndex, paper: white, ink, accent: red, secondary: grey, seed }) => {
  const v: PanelVoice = { border: ink, bw: 3, rx: 0, fill: alpha(grey, .22), hintInk: alpha(ink, .5) };
  const M = 30;
  const fr = frame(W, H, M, { top: 40, bottom: 60 });
  const GX = 8, GY = 14;
  const out: Objs = [];
  const say = (x: number, y: number, w: number, s: string, tail = 22, flip = false) => balloon(x, y, w, s, { font: 'zenKaku', size: 11.5, weight: 700, color: ink, stroke: ink, bw: 2, tail, flip, pad: 11 });
  const cap = (x: number, y: number, w: number, s: string) => captionBox(x, y, w, s, { font: 'zenKaku', size: 10, weight: 700, color: white, fill: ink, pad: 7 });
  const bang = (x: number, y: number, w: number, s: string, size: number, color: string, rot: number) => sfx(x, y, w, s, { font: 'bangers', size, color, stroke: color === ink ? white : ink, bw: Math.max(3, size * .07), rotation: rot });
  const speed = (b: Box, count: number, color = ink) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; const r1 = Math.min(b.w, b.h) / 2 - 4; return orn.radialLines(cx, cy, r1 * .35, r1, count, color, 1.5, { opacity: .7, label: 'Speed line' }); };

  switch (pageType) {
    case 'COMIC COVER': {
      out.push(ground(W, H, white));
      out.push(circle(W * .64, 420, 290, red, { label: 'Impact disc' }));
      out.push(...orn.radialLines(W * .64, 420, 300, 760, 44, ink, 2, { opacity: .55, label: 'Speed line' }));
      out.push(...imageSlot(W * .27, 250, 400, 720, { shade: alpha(grey, .35), caption: 'Cover art · hero mid-strike', ink: alpha(ink, .55), label: 'Cover art slot' }));
      out.push(text(M, 56, 700, 'RISING', { size: 128, font: 'delaGothic', color: ink, stroke: white, strokeWidth: 6, wrap: false, label: 'Masthead · line 1', role: 'HEADLINE' }));
      out.push(text(150, 190, 640, 'IMPACT', { size: 128, font: 'delaGothic', color: red, stroke: ink, strokeWidth: 6, wrap: false, label: 'Masthead · line 2', role: 'HEADLINE' }));
      out.push(rect(W - 190, 330, 150, 76, ink, { rotation: -6, label: 'Volume plate' }));
      out.push(text(W - 190, 340, 150, 'VOL. 1', { size: 44, font: 'bangers', color: white, align: 'center', wrap: false, rotation: -6, label: 'Volume', role: 'LABEL' }));
      out.push(rect(0, H - 130, W, 130, ink, { label: 'Foot band' }));
      out.push(text(M, H - 114, 500, 'Story & Art · Kenji Oda', { size: 14, font: 'zenKaku', weight: 700, color: white, wrap: false, label: 'Author', role: 'LABEL' }));
      out.push(text(M, H - 90, 500, 'Weekly Impact Comics · Round One: The Iron Gym', { size: 10, font: 'zenKaku', weight: 500, color: alpha(white, .75), tracking: .06, wrap: false, label: 'Imprint line', role: 'CAPTION' }));
      out.push(text(M, H - 60, 500, 'This book reads right to left. Start from the back.', { size: 9, font: 'zenKaku', weight: 700, color: red, tracking: .08, transform: 'uppercase', wrap: false, label: 'RTL notice', role: 'LABEL' }));
      out.push(...barcode(W - 160, H - 106, 120, 60, ink, white, seed, '4 91234 56789 0', 'zenKaku'));
      return out;
    }
    case 'CHARACTER SHEET': {
      out.push(ground(W, H, white));
      out.push(rect(0, 40, W, 70, ink, { label: 'Header bar' }));
      out.push(text(M, 52, 600, 'CHARACTER FILE', { size: 40, font: 'delaGothic', color: white, wrap: false, label: 'Section title', role: 'HEADLINE' }));
      out.push(rect(W - 230, 58, 200, 34, red, { label: 'Header tag' }));
      out.push(text(W - 230, 66, 200, 'ROUND ONE · THE IRON GYM', { size: 9, font: 'zenKaku', weight: 700, color: white, align: 'center', tracking: .12, wrap: false, label: 'Arc tag', role: 'LABEL' }));
      const cast = [
        { name: 'REN KAIDO', tag: 'PROTAGONIST', bio: 'Sixteen. The boxing club’s last member after everyone else quit. Trains on the roof because the gym is locked. Cannot block, refuses to fall down.', stats: [.55, .35, .98], quote: 'You call that a punch? My grandmother hits harder — and she’s a florist!' },
        { name: 'TAIGA MORIMOTO', tag: 'RIVAL', bio: 'The one who quit and came back with a new coach and an old grudge. Technically perfect. Has never once been surprised in the ring.', stats: [.9, .85, .6], quote: 'Then let’s see what the florist taught you.' },
      ];
      cast.forEach((c, i) => {
        const y = 140 + i * 470;
        const rightSide = i === 0; // first read = right (RTL)
        const px = rightSide ? W - M - 300 : M, tx = rightSide ? M : M + 320;
        out.push(...panel({ x: px, y, w: 300, h: 400 }, v, `portrait ${i + 1}`, { hint: 'Full figure · art' }));
        out.push(...speed({ x: px, y, w: 300, h: 400 }, 0));
        out.push(text(tx, y, 440, c.name, { size: 44, font: 'delaGothic', color: ink, wrap: false, label: 'Character name', role: 'HEADLINE' }));
        out.push(rect(tx, y + 62, 140, 24, i ? ink : red, { label: 'Role tag' }));
        out.push(text(tx, y + 67, 140, c.tag, { size: 9, font: 'zenKaku', weight: 700, color: white, align: 'center', tracking: .14, wrap: false, label: 'Role', role: 'LABEL' }));
        const bio = text(tx, y + 104, 440, c.bio, { size: 11, font: 'zenKaku', weight: 500, color: ink, leading: 1.55, label: 'Bio', role: 'BODY' });
        out.push(bio);
        let sy = below(bio, 20);
        ['STRIKE', 'GUARD', 'GUTS'].forEach((s, k) => { out.push(...statBar(tx, sy, 300, s, c.stats[k], ink, alpha(ink, .12), k === 2 ? red : ink, 'zenKaku')); sy += 32; });
        out.push(...say(tx, sy + 10, 360, c.quote, rightSide ? 80 : 20).objs);
      });
      out.push(...mangaFoot(W, H, M, pageIndex, ink, 'zenKaku'));
      return out;
    }
    case 'MANGA PAGE': {
      out.push(ground(W, H, white));
      const x0 = fr.x, x1 = fr.right, y0 = fr.y;
      if (pageIndex === 2) {
        // Wide · unequal pair (first read on the right) · reaction strip
        const p1: Box = { x: x0, y: y0, w: fr.w, h: 330 };
        out.push(...panel(p1, v, 1));
        out.push(...cap(x1 - 14 - 250, y0 + 14, 250, 'Round one. Nobody in the seats. Everybody on the roof.').objs);
        const y2 = y0 + 330 + GY;
        const p2: Box = { x: x1 - 440, y: y2, w: 440, h: 380 }, p3: Box = { x: x0, y: y2, w: 440 - GX - 0 - (440 - (fr.w - 440 - GX)) , h: 380 };
        p3.w = fr.w - 440 - GX;
        out.push(...panel(p2, v, 2)); out.push(...speed(p2, 36));
        out.push(bang(p2.x + 20, p2.y + 130, p2.w - 40, 'KRAK!', 110, red, -12));
        out.push(...panel(p3, v, 3));
        out.push(...say(p3.x + 16, p3.y + 20, p3.w - 32, 'You call that a punch? My grandmother hits harder — and she’s a florist!', 70).objs);
        const y3 = y2 + 380 + GY;
        const strip = grid({ x: x0, y: y3, w: fr.w, h: fr.bottom - y3 }, 3, 1, GX);
        const lines = ['No way.', 'Eh?!', '…!'];
        [2, 1, 0].forEach((c, k) => { const b = strip(c, 0); out.push(...panel(b, v, 4 + k, { hint: 'Reaction · face' })); out.push(...say(b.x + 20, b.y + 18, b.w - 40, lines[k], 50).objs); });
      } else if (pageIndex === 3) {
        // Tall right panel (first read) · left stack with a slanted panel
        const tall: Box = { x: x1 - 300, y: y0, w: 300, h: fr.h };
        out.push(...panel(tall, v, 1));
        out.push(...say(tall.x + 16, tall.y + 20, tall.w - 32, 'Then let’s see what the florist taught you.', 60).objs);
        out.push(bang(tall.x + 10, tall.y + tall.h - 300, tall.w - 20, 'DOOM', 72, ink, 90));
        const lw = fr.w - 300 - GX;
        const l1: Box = { x: x0, y: y0, w: lw, h: 300 };
        out.push(...panel(l1, v, 2));
        out.push(...cap(l1.x + 14, l1.y + 14, 240, copy.caption('comic', 1)).objs);
        const y2 = y0 + 300 + GY, y3 = y2 + 380;
        out.push(quad([[x0, y2], [x0 + lw, y2], [x0 + lw, y3 - 60], [x0, y3]], v.fill, { stroke: ink, strokeWidth: 3, label: 'Panel 3 · slanted' }));
        out.push(...say(x0 + 20, y2 + 24, 260, 'Coach said keep my guard up. Coach also said don’t train on roofs.', 26).objs);
        const y4 = y3 + GY;
        const l3: Box = { x: x0, y: y4 - 60, w: lw, h: fr.bottom - y4 + 60 };
        out.push(quad([[x0, y4], [x0 + lw, y4 - 60], [x0 + lw, fr.bottom], [x0, fr.bottom]], alpha(red, .12), { stroke: ink, strokeWidth: 3, label: 'Panel 4 · slanted' }));
        out.push(...speed({ x: l3.x, y: l3.y + 40, w: l3.w, h: l3.h - 60 }, 40, red));
        out.push(bang(l3.x + 10, l3.y + l3.h / 2 - 50, l3.w - 20, 'WHOOM', 96, ink, -8));
      } else {
        // Two up · silent wide · three (middle silent, black) · wide close
        const r1 = grid({ x: x0, y: y0, w: fr.w, h: 280 }, 2, 1, GX);
        const a: Box = { x: x1 - 420, y: y0, w: 420, h: 280 }, b: Box = { x: x0, y: y0, w: fr.w - 420 - GX, h: 280 };
        void r1;
        out.push(...panel(a, v, 1)); out.push(...panel(b, v, 2));
        out.push(...say(a.x + 20, a.y + 20, 280, 'Get up, Kaido. The bell hasn’t rung.', 70).objs);
        out.push(...say(b.x + 16, b.y + 20, b.w - 32, '…I know.', 40).objs);
        const y2 = y0 + 280 + GY;
        const wide: Box = { x: x0, y: y2, w: fr.w, h: 250 };
        out.push(...panel(wide, v, 3, { silent: true, fill: alpha(grey, .12) }));
        out.push(text(wide.x, wide.y + wide.h / 2 - 6, wide.w, 'Silent panel · the roof, the city, no lettering', { size: 9, font: 'zenKaku', weight: 700, color: alpha(ink, .4), align: 'center', tracking: .14, transform: 'uppercase', wrap: false, label: 'Silent panel note', role: 'LABEL' }));
        const y3 = y2 + 250 + GY;
        const r3 = grid({ x: x0, y: y3, w: fr.w, h: 260 }, 3, 1, GX);
        out.push(...panel(r3(2, 0), v, 4, { hint: 'Fist · close-up' }));
        out.push(...panel(r3(1, 0), v, 5, { silent: true, fill: ink }));
        out.push(...panel(r3(0, 0), v, 6, { hint: 'Eyes · close-up' }));
        out.push(...cap(r3(0, 0).x + 12, r3(0, 0).y + r3(0, 0).h - 50, r3(0, 0).w - 24, 'Something the florist said.').objs);
        const y4 = y3 + 260 + GY;
        const close: Box = { x: x0, y: y4, w: fr.w, h: fr.bottom - y4 };
        out.push(...panel(close, v, 7));
        out.push(bang(close.x + 40, close.y + 30, close.w - 80, 'ZZZAK', 84, red, -6));
        out.push(...say(close.x + 30, close.y + close.h - 110, 300, 'Keep your hands up.', 30, true).objs);
      }
      out.push(...mangaFoot(W, H, M, pageIndex, ink, 'zenKaku'));
      return out;
    }
    case 'SPLASH PAGE': {
      out.push(ground(W, H, white));
      out.push(rect(fr.x, fr.y, fr.w, fr.h, alpha(grey, .14), { stroke: ink, strokeWidth: 4, label: 'Splash frame', role: 'IMAGE_SLOT' }));
      out.push(...orn.radialLines(W * .5, H * .44, 70, 900, 72, ink, 2, { opacity: .8, label: 'Speed line' }));
      out.push(circle(W * .5, H * .44, 200, white, { label: 'Impact core' }));
      out.push(text(W * .5 - 150, H * .44 - 8, 300, 'Splash art · the punch lands', { size: 10, font: 'zenKaku', weight: 700, color: alpha(ink, .5), align: 'center', tracking: .14, transform: 'uppercase', wrap: false, label: 'Image slot hint', role: 'LABEL' }));
      out.push(bang(40, 560, 736, 'KRAK!!', 190, red, -12));
      out.push(rect(W - M - 84, fr.y + 30, 84, 300, ink, { label: 'Vertical title strip' }));
      out.push(text(W - M - 84, fr.y + 46, 84, 'R\nO\nU\nN\nD\n\nO\nN\nE', { size: 20, font: 'delaGothic', color: white, align: 'center', leading: 1.15, wrap: false, label: 'Chapter title · stacked', role: 'LABEL' }));
      out.push(rect(W - M - 84, fr.y + 336, 84, 26, red, { label: 'Chapter number plate' }));
      out.push(text(W - M - 84, fr.y + 342, 84, 'CH. 01', { size: 10, font: 'zenKaku', weight: 700, color: white, align: 'center', tracking: .12, wrap: false, label: 'Chapter number', role: 'LABEL' }));
      out.push(...cap(fr.x + 16, fr.y + 16, 260, 'The Iron Gym. Locked for eleven years. Open tonight.').objs);
      out.push(rect(fr.x + 4, fr.bottom - 64, 360, 60, ink, { label: 'Credit plate' }));
      out.push(text(fr.x + 18, fr.bottom - 54, 340, 'RISING IMPACT', { size: 22, font: 'delaGothic', color: white, wrap: false, label: 'Title in credit plate', role: 'LABEL' }));
      out.push(text(fr.x + 18, fr.bottom - 24, 340, 'Story & Art · Kenji Oda', { size: 9.5, font: 'zenKaku', weight: 700, color: red, tracking: .08, wrap: false, label: 'Author credit', role: 'CAPTION' }));
      out.push(...mangaFoot(W, H, M, pageIndex, ink, 'zenKaku', false));
      return out;
    }
    default: {
      out.push(ground(W, H, ink));
      out.push(text(M, 70, W - 60, 'STOP!', { size: 120, font: 'delaGothic', color: white, align: 'center', wrap: false, label: 'Stop headline', role: 'HEADLINE' }));
      out.push(text(M, 214, W - 60, 'You’re reading the wrong way.', { size: 22, font: 'zenKaku', weight: 700, color: red, align: 'center', wrap: false, label: 'Stop deck', role: 'DECK' }));
      out.push(text(120, 256, W - 240, 'Rising Impact is printed in its original right-to-left format. Flip the book over and start from the other end. Read each page from the top-right panel to the bottom-left, balloons the same way.', { size: 12, font: 'zenKaku', weight: 500, color: white, align: 'center', leading: 1.55, label: 'Reading instructions', role: 'BODY' }));
      const dg = grid({ x: 168, y: 370, w: 480, h: 440 }, 2, 3, 16);
      const order: Array<[number, number]> = [[1, 0], [0, 0], [1, 1], [0, 1], [1, 2], [0, 2]];
      order.forEach(([c, r], i) => {
        const b = dg(c, r);
        out.push(rect(b.x, b.y, b.w, b.h, alpha(white, .08), { stroke: white, strokeWidth: 2, label: 'Reading-order panel' }));
        out.push(text(b.x, b.y + b.h / 2 - 30, b.w, String(i + 1), { size: 56, font: 'delaGothic', color: i === 0 ? red : white, align: 'center', wrap: false, label: 'Reading-order number', role: 'LABEL' }));
        if (i % 2 === 0) out.push(path(b.x - 30, b.y + b.h / 2 - 10, 28, 20, orn.chevronPath(40), red, { rotation: 180, label: 'Direction arrow' }));
      });
      out.push(text(M, 850, W - 60, 'Sound effects and signage have been kept in the original artwork. Turn to the back for a glossary.', { size: 10, font: 'zenKaku', weight: 500, color: alpha(white, .7), align: 'center', leading: 1.5, label: 'Note', role: 'CAPTION' }));
      out.push(text(M, 940, 420, 'RISING IMPACT Vol. 1 · Weekly Impact Comics · Story & Art Kenji Oda · Lettering Bea Oyelaran · Translation Mia Torres. First printing.', { size: 8.5, font: 'zenKaku', weight: 500, color: alpha(white, .7), leading: 1.5, label: 'Colophon', role: 'CAPTION' }));
      out.push(text(M, 1040, 300, 'RISING IMPACT', { size: 26, font: 'delaGothic', color: white, wrap: false, label: 'Masthead · small', role: 'LABEL' }));
      out.push(...barcode(W - 160, H - 110, 120, 60, ink, white, seed + 1, '4 91234 56789 0', 'zenKaku'));
      return out;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PETALS & PROMISES — shōjo. Borderless fills, drifting petals, oval insets.
// ─────────────────────────────────────────────────────────────────────────────
const shojo: PublicationDesigner = ({ W, H, pageType, pageIndex, paper, ink, accent: pink, secondary: lavender, seed }) => {
  const soft = [alpha(pink, .13), alpha(lavender, .16), alpha(pink, .22), alpha(lavender, .09)];
  const v: PanelVoice = { bw: 0, rx: 0, fill: soft[0], hintInk: alpha(ink, .4) };
  const M = 40;
  const fr = frame(W, H, M, { top: 48, bottom: 66 });
  const G = 18;
  const out: Objs = [];
  const say = (x: number, y: number, w: number, s: string, tail = 22, flip = false) => balloon(x, y, w, s, { font: 'zenKaku', size: 11.5, weight: 500, color: ink, stroke: alpha(ink, .8), bw: 1.2, tail, flip, pad: 12, leading: 1.35 });
  const inner = (x: number, y: number, w: number, s: string) => text(x, y, w, s, { size: 12.5, font: 'cormorant', italic: true, weight: 500, color: ink, leading: 1.45, label: 'Floating monologue', role: 'BODY' });
  const oval = (b: Box, hint: string): Objs => imageSlot(b.x, b.y, b.w, b.h, { shade: paper, rx: Math.min(b.w, b.h) / 2, frame: WHITE, frameWidth: 4, caption: hint, ink: alpha(ink, .4), label: 'Oval inset' });

  switch (pageType) {
    case 'COMIC COVER': {
      out.push(ground(W, H, paper));
      out.push(circle(560, 400, 330, alpha(lavender, .32), { label: 'Soft disc' }));
      out.push(circle(300, 520, 260, alpha(pink, .2), { label: 'Soft disc · blush' }));
      out.push(...orn.dotField(560, 40, 220, 160, 12, alpha(pink, .5), { rMin: 1, rMax: 2.6, grade: 'y', label: 'Screentone' }));
      out.push(...imageSlot(240, 190, 340, 620, { shade: alpha(WHITE, .8), rx: 170, frame: WHITE, frameWidth: 6, caption: 'Cover art · two figures, spring', ink: alpha(ink, .4), label: 'Cover portrait slot' }));
      out.push(...petals(W, H, 20, [pink, lavender, mix(pink, .35)], seed, 14, 34));
      out.push(path(-40, 700, W + 80, 120, orn.wavePath(2, 14, 4, .4), pink, { opacity: .7, label: 'Ribbon' }));
      out.push(text(60, 816, 700, 'Petals &\nPromises', { size: 74, font: 'shippori', weight: 700, color: ink, leading: .98, wrap: false, label: 'Masthead', role: 'HEADLINE' }));
      out.push(text(64, 972, 400, 'Volume One', { size: 22, font: 'cormorant', italic: true, weight: 500, color: pink, wrap: false, label: 'Volume', role: 'DECK' }));
      out.push(text(64, 1004, 400, 'Story & Art · Hana Sato', { size: 10, font: 'zenKaku', weight: 500, color: ink, tracking: .1, wrap: false, label: 'Author', role: 'LABEL' }));
      out.push(text(W - 300, 1000, 260, 'reads right to left ◄', { size: 8, font: 'zenKaku', weight: 700, color: ink, tracking: .14, transform: 'uppercase', align: 'right', wrap: false, opacity: .7, label: 'RTL notice', role: 'LABEL' }));
      out.push(...barcode(W - 150, H - 100, 110, 56, ink, WHITE, seed, '4 92222 00001 4', 'zenKaku', 8));
      return out;
    }
    case 'CHARACTER SHEET': {
      out.push(ground(W, H, paper));
      out.push(...petals(W, H, 12, [pink, lavender], seed + 1, 10, 24));
      out.push(text(M, 60, 500, 'Cast', { size: 54, font: 'shippori', weight: 700, color: ink, wrap: false, label: 'Section title', role: 'HEADLINE' }));
      out.push(text(M + 2, 128, 500, 'Class 2-B, the river path, and one letter that never got sent.', { size: 13, font: 'cormorant', italic: true, color: ink, wrap: false, label: 'Deck', role: 'DECK' }));
      const cast = [
        { name: 'Aoi Natsume', facts: 'Class 2-B · Birthday: April 3 · Blood type: A', secret: 'Keeps a letter in her pencil case. Rewrites it every spring.', fill: soft[0], right: true },
        { name: 'Sora Hayashi', facts: 'Class 2-B · Birthday: November 19 · Blood type: O', secret: 'Walks the long way home so the river path takes longer.', fill: soft[1], right: false },
      ];
      cast.forEach((c, i) => {
        const y = 190 + i * 430;
        const cardX = M, cardW = W - M * 2;
        out.push(rect(cardX, y, cardW, 380, c.fill, { rx: 30, label: 'Character card' }));
        const ox = c.right ? cardX + cardW - 260 - 30 : cardX + 30;
        out.push(...oval({ x: ox, y: y + 30, w: 260, h: 320 }, `${c.name.split(' ')[0]} · portrait`));
        const tx = c.right ? cardX + 40 : cardX + 330, tw = cardW - 330 - 40;
        out.push(text(tx, y + 50, tw, c.name, { size: 38, font: 'shippori', weight: 700, color: ink, wrap: false, label: 'Character name', role: 'LABEL' }));
        out.push(hr(tx, y + 104, 80, pink, 1.5, { label: 'Name rule' }));
        out.push(text(tx, y + 118, tw, c.facts, { size: 9.5, font: 'zenKaku', weight: 500, color: ink, tracking: .06, leading: 1.5, label: 'Profile facts', role: 'CAPTION' }));
        out.push(text(tx, y + 168, tw, 'Secret', { size: 10, font: 'zenKaku', weight: 700, color: pink, tracking: .16, transform: 'uppercase', wrap: false, label: 'Secret label', role: 'LABEL' }));
        out.push(inner(tx, y + 188, tw, c.secret));
        out.push(...thought(tx, y + 262, tw - 20, i ? 'She always looks at the river. Never at me.' : 'If I say it now, will you still be here in spring?', { font: 'cormorant', size: 13, fill: WHITE, stroke: alpha(ink, .5), bw: 1, dotsAt: c.right ? 'right' : 'left' }).objs);
      });
      out.push(...mangaFoot(W, H, M, pageIndex, ink, 'zenKaku'));
      return out;
    }
    case 'MANGA PAGE': {
      out.push(ground(W, H, paper));
      const x0 = fr.x, x1 = fr.right, y0 = fr.y;
      if (pageIndex === 2) {
        // Tall right (first read) · two left · wide foot · oval inset across the gutter
        const tall: Box = { x: x1 - 420, y: y0, w: 420, h: 700 };
        out.push(...panel(tall, v, 1, { fill: soft[2] }));
        const lw = fr.w - 420 - G;
        out.push(...panel({ x: x0, y: y0, w: lw, h: 340 }, v, 2, { fill: soft[1] }));
        out.push(...panel({ x: x0, y: y0 + 340 + G, w: lw, h: 700 - 340 - G }, v, 3, { fill: soft[3] }));
        out.push(...oval({ x: x1 - 420 - 90, y: y0 + 300, w: 180, h: 180 }, 'Inset · her eyes'));
        out.push(...say(tall.x + 30, tall.y + 30, 300, 'The cherry trees along the river were early this year.', 70).objs);
        out.push(inner(x0 + 16, y0 + 24, lw - 32, 'He always walks the long way. I always pretend not to notice.'));
        out.push(...say(x0 + 20, y0 + 340 + G + 40, lw - 40, 'Aoi. Wait.', 30).objs);
        const foot: Box = { x: x0, y: y0 + 700 + G, w: fr.w, h: fr.bottom - (y0 + 700 + G) };
        out.push(...panel(foot, v, 4, { fill: soft[1] }));
        out.push(...petals(W, H, 10, [pink, lavender], seed + 2, 10, 26));
        out.push(...thought(foot.x + foot.w - 320, foot.y + 30, 290, 'If I say it now, will you still be here in spring?', { font: 'cormorant', size: 13.5, fill: WHITE, stroke: alpha(ink, .5), bw: 1, dotsAt: 'right' }).objs);
      } else if (pageIndex === 3) {
        // Three soft bands with oval insets and floating monologue
        const hs = [300, 420, fr.h - 300 - 420 - G * 2];
        let y = y0;
        hs.forEach((h, i) => {
          const b: Box = { x: x0, y, w: fr.w, h };
          out.push(...panel(b, v, i + 1, { fill: soft[(i + 1) % 4] }));
          y += h + G;
        });
        out.push(...oval({ x: x1 - 220, y: y0 + 60, w: 180, h: 180 }, 'Inset · his hands'));
        out.push(inner(x0 + 24, y0 + 30, 380, 'There is a way people stand when they are about to say something. He stood like that for the whole walk.'));
        out.push(...say(x0 + 40, y0 + 300 + G + 40, 300, 'I wrote you something. Last spring. And the spring before.', 26).objs);
        out.push(...say(x1 - 340, y0 + 300 + G + 220, 300, 'I know. I kept the envelopes.', 70).objs);
        out.push(...oval({ x: x0 + 40, y: y0 + 300 + G + 420 + G + 30, w: 150, h: 150 }, 'Inset · the letter'));
        out.push(inner(x0 + 220, y0 + 300 + G + 420 + G + 60, 380, 'The envelopes. He had kept the envelopes.'));
        out.push(...petals(W, H, 14, [pink, lavender, mix(pink, .35)], seed + 3, 10, 28));
      } else {
        // The blush page: one panel bleeds to the page edge, white space does the rest
        out.push(...panel({ x: x1 - 300, y: y0, w: 300, h: 320 }, v, 1, { fill: soft[1] }));
        out.push(...say(x1 - 280, y0 + 24, 260, 'Say it again. Slower.', 60).objs);
        out.push(rect(0, y0 + 320 + G, x1 - 300 - G, 520, soft[2], { label: 'Panel 2 · bleeds left', role: 'IMAGE_SLOT' }));
        out.push(text(0, y0 + 320 + G + 250, x1 - 300 - G, 'Panel 2 · art · bleeds off the left edge', { size: 10, font: 'zenKaku', weight: 700, color: alpha(ink, .4), align: 'center', tracking: .14, transform: 'uppercase', wrap: false, label: 'Image slot hint', role: 'LABEL' }));
        out.push(...orn.dotField(x1 - 300 - G - 200, y0 + 320 + G, 200, 140, 12, alpha(pink, .45), { rMin: .8, rMax: 2.4, grade: 'x', label: 'Screentone' }));
        out.push(inner(x1 - 280, y0 + 340 + G, 250, 'The river kept moving. For once, I did not.'));
        out.push(...panel({ x: x1 - 300, y: fr.bottom - 260, w: 300, h: 260 }, v, 3, { fill: soft[3] }));
        out.push(...thought(x0 + 40, fr.bottom - 220, 320, 'I’ll be here. I promised.', { font: 'cormorant', size: 15, fill: WHITE, stroke: alpha(ink, .5), bw: 1, dotsAt: 'right' }).objs);
        out.push(...petals(W, H, 18, [pink, lavender, mix(pink, .35)], seed + 4, 14, 40));
      }
      out.push(...mangaFoot(W, H, M, pageIndex, ink, 'zenKaku'));
      return out;
    }
    case 'SPLASH PAGE': {
      out.push(ground(W, H, paper));
      out.push(circle(W * .5, H * .42, 380, alpha(pink, .16), { label: 'Soft disc' }));
      out.push(circle(W * .62, H * .3, 260, alpha(lavender, .2), { label: 'Soft disc · lavender' }));
      out.push(...imageSlot(W / 2 - 190, 150, 380, 640, { shade: alpha(WHITE, .7), rx: 190, frame: WHITE, frameWidth: 5, caption: 'Chapter art · under the cherry trees', ink: alpha(ink, .4), label: 'Splash portrait slot' }));
      out.push(...petals(W, H, 26, [pink, lavender, mix(pink, .35)], seed + 5, 18, 60));
      out.push(text(M, 840, W - M * 2, 'Chapter 3', { size: 14, font: 'zenKaku', weight: 500, color: pink, tracking: .3, transform: 'uppercase', align: 'center', wrap: false, label: 'Chapter kicker', role: 'LABEL' }));
      out.push(text(M, 866, W - M * 2, 'The Letter I Didn’t Send', { size: 44, font: 'shippori', weight: 700, color: ink, align: 'center', wrap: false, label: 'Chapter title', role: 'HEADLINE' }));
      out.push(text(120, 940, W - 240, 'If I say it now, will you still be here in spring?', { size: 18, font: 'cormorant', italic: true, color: ink, align: 'center', leading: 1.4, label: 'Monologue line', role: 'DECK' }));
      out.push(...mangaFoot(W, H, M, pageIndex, ink, 'zenKaku', false));
      return out;
    }
    default: {
      out.push(ground(W, H, mix(lavender, .78)));
      out.push(circle(W * .7, 260, 220, alpha(pink, .18), { label: 'Soft disc' }));
      out.push(...petals(W, H, 22, [pink, lavender, WHITE], seed + 6, 12, 40));
      out.push(text(90, 420, W - 180, 'A promise is a petal you decide not to let go of.', { size: 24, font: 'cormorant', italic: true, color: ink, align: 'center', leading: 1.4, label: 'Closing line', role: 'DECK' }));
      out.push(hr(W / 2 - 40, 520, 80, pink, 1.5, { label: 'Closing rule' }));
      out.push(text(M, 700, 420, 'Petals & Promises', { size: 30, font: 'shippori', weight: 700, color: ink, wrap: false, label: 'Masthead · small', role: 'LABEL' }));
      out.push(text(M, 742, 420, 'Volume One · Chapters 1–4', { size: 11, font: 'cormorant', italic: true, color: pink, wrap: false, label: 'Volume line', role: 'LABEL' }));
      out.push(text(M, 780, 440, 'Story & Art Hana Sato · Lettering Bea Oyelaran · Translation Mia Torres. First published in Ribbon Monthly. This edition keeps the original right-to-left reading order; please begin from the other cover.', { size: 9, font: 'zenKaku', weight: 500, color: ink, leading: 1.55, label: 'Colophon', role: 'CAPTION' }));
      out.push(text(M, 900, 440, 'Next volume: the school trip, the shrine steps, and a second letter that does get sent.', { size: 11, font: 'cormorant', italic: true, color: ink, leading: 1.45, label: 'Next volume', role: 'CAPTION' }));
      out.push(...barcode(W - 150, H - 100, 110, 56, ink, WHITE, seed + 7, '4 92222 00002 1', 'zenKaku', 8));
      return out;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// AFTERIMAGE — seinen. Measured grids, silent panels, thin borders, one red.
// ─────────────────────────────────────────────────────────────────────────────
const seinen: PublicationDesigner = ({ W, H, pageType, pageIndex, paper, ink, accent: grey, secondary: red, seed }) => {
  const v: PanelVoice = { border: ink, bw: 1.5, rx: 0, fill: alpha(grey, .16), hintInk: alpha(ink, .4) };
  const M = 48;
  const fr = frame(W, H, M, { top: 56, bottom: 72 });
  const GX = 10, GY = 16;
  const out: Objs = [];
  const say = (x: number, y: number, w: number, s: string, tail = 22, flip = false) => balloon(x, y, w, s, { font: 'zenKaku', size: 11, weight: 500, color: ink, fill: paper, stroke: ink, bw: 1.2, tail, flip, pad: 10, leading: 1.4 });
  const mono = (x: number, y: number, w: number, s: string) => captionBox(x, y, w, s, { font: 'ibmPlexMono', size: 9, weight: 500, color: paper, fill: ink, pad: 6, tracking: .04 });
  const silentNote = (b: Box) => text(b.x, b.y + b.h / 2 - 6, b.w, 'silent', { size: 8, font: 'ibmPlexMono', weight: 500, color: alpha(ink, .35), align: 'center', tracking: .3, transform: 'uppercase', wrap: false, label: 'Silent panel note', role: 'LABEL' });
  void seed;

  switch (pageType) {
    case 'COMIC COVER': {
      out.push(ground(W, H, paper));
      out.push(rect(0, 0, W, 300, mix(grey, .55), { label: 'Upper field' }));
      out.push(...imageSlot(0, 300, W, 420, { tone: 'dark', shade: alpha(ink, .78), caption: 'Cover art · empty platform at dawn', ink: alpha(paper, .5), label: 'Cover art slot' }));
      out.push(vr(W * .18, 0, H, red, 2, { label: 'Red thread' }));
      out.push(text(M, 780, W - M * 2, 'AFTERIMAGE', { size: 58, font: 'notoSerifJp', weight: 700, color: ink, tracking: .18, wrap: false, label: 'Masthead', role: 'HEADLINE' }));
      out.push(text(M + 2, 860, 500, 'A story in twelve stations', { size: 12, font: 'zenKaku', weight: 500, color: grey, tracking: .08, wrap: false, label: 'Deck', role: 'DECK' }));
      out.push(text(M + 2, 900, 500, 'VOL. 1 · STATIONS 01–04', { size: 9, font: 'ibmPlexMono', weight: 500, color: ink, tracking: .14, wrap: false, label: 'Volume slug', role: 'LABEL' }));
      out.push(text(M + 2, 1040, 400, 'Story & Art · Mari Ishikawa', { size: 10, font: 'zenKaku', weight: 500, color: ink, wrap: false, label: 'Author', role: 'LABEL' }));
      out.push(text(W - 330, 1040, 290, 'reads right to left ◄', { size: 8, font: 'ibmPlexMono', weight: 500, color: ink, tracking: .14, transform: 'uppercase', align: 'right', wrap: false, opacity: .7, label: 'RTL notice', role: 'LABEL' }));
      out.push(text(M + 2, 60, 300, 'Big Quiet Comics', { size: 9, font: 'ibmPlexMono', weight: 500, color: ink, tracking: .14, transform: 'uppercase', wrap: false, label: 'Imprint', role: 'LABEL' }));
      out.push(...barcode(W - 150, 940, 110, 56, ink, paper, 11, '4 93333 00001 8', 'ibmPlexMono'));
      return out;
    }
    case 'CHARACTER SHEET': {
      out.push(ground(W, H, paper));
      out.push(text(M, 60, 500, 'Dramatis personae', { size: 30, font: 'notoSerifJp', weight: 700, color: ink, wrap: false, label: 'Section title', role: 'HEADLINE' }));
      out.push(hr(M, 104, W - M * 2, ink, .8, { label: 'Head rule' }));
      const people = [
        { id: '01', name: 'HARUKI ONO', meta: '41 · station master · Kitagawa Line', note: 'Has worked the last platform for nineteen years. Knows which passengers are waiting for a train and which are waiting for something else. Stopped checking the clock the year his daughter left.' },
        { id: '02', name: 'NOA', meta: '19 · the one who keeps missing the 11:40', note: 'Arrives at 11:41 every night with a bag she never opens. Says she is meeting someone. Ono has never seen anyone arrive.' },
      ];
      people.forEach((p, i) => {
        const y = 140 + i * 460;
        const right = i === 0;
        const px = right ? W - M - 280 : M, tx = right ? M : M + 310, tw = W - M * 2 - 310;
        out.push(...panel({ x: px, y, w: 280, h: 380 }, v, `portrait ${p.id}`, { hint: 'Portrait · art' }));
        out.push(text(tx, y, tw, `${p.id} /`, { size: 9, font: 'ibmPlexMono', weight: 500, color: red, tracking: .14, wrap: false, label: 'Index', role: 'LABEL' }));
        out.push(text(tx, y + 20, tw, p.name, { size: 30, font: 'notoSerifJp', weight: 700, color: ink, tracking: .06, wrap: false, label: 'Character name', role: 'LABEL' }));
        out.push(text(tx, y + 66, tw, p.meta, { size: 9, font: 'ibmPlexMono', weight: 500, color: ink, tracking: .06, wrap: false, label: 'Meta', role: 'CAPTION' }));
        out.push(hr(tx, y + 88, tw, ink, .6, { label: 'Entry rule' }));
        out.push(text(tx, y + 104, tw, p.note, { size: 11, font: 'zenKaku', weight: 500, color: ink, leading: 1.6, label: 'Notes', role: 'BODY' }));
        out.push(...say(tx, y + 250, Math.min(tw, 320), i ? 'I’m meeting someone.' : 'The 11:40 is late. It’s always late.', right ? 78 : 22).objs);
      });
      out.push(...mangaFoot(W, H, M, pageIndex, ink, 'ibmPlexMono'));
      return out;
    }
    case 'MANGA PAGE': {
      out.push(ground(W, H, paper));
      const x0 = fr.x, x1 = fr.right, y0 = fr.y;
      if (pageIndex === 2) {
        // 2×3 grid, two silent panels, one black
        const g = grid({ x: x0, y: y0, w: fr.w, h: fr.h }, 2, 3, GX, GY);
        const order: Array<[number, number]> = [[1, 0], [0, 0], [1, 1], [0, 1], [1, 2], [0, 2]];
        order.forEach(([c, r], i) => {
          const b = g(c, r);
          const silent = i === 2 || i === 4;
          out.push(...panel(b, v, i + 1, { silent, fill: i === 4 ? ink : v.fill }));
          if (silent && i !== 4) out.push(silentNote(b));
        });
        out.push(...mono(g(1, 0).x + 10, g(1, 0).y + 10, 150, '11:40 — late again.').objs);
        out.push(...say(g(0, 0).x + 20, g(0, 0).y + 20, g(0, 0).w - 40, 'You said you’d stopped.', 30).objs);
        out.push(...say(g(0, 1).x + 20, g(0, 1).y + 30, g(0, 1).w - 40, 'I did. Then I started again.', 40).objs);
        out.push(...mono(g(0, 2).x + 10, g(0, 2).y + g(0, 2).h - 40, 200, 'Platform 4. Nobody boards.').objs);
      } else if (pageIndex === 3) {
        // Environmental wide top · 2×2 below
        const wide: Box = { x: x0, y: y0, w: fr.w, h: 470 };
        out.push(...panel(wide, v, 1, { silent: true, fill: alpha(grey, .1) }));
        out.push(hr(wide.x + 1, wide.y + 300, wide.w - 2, ink, .8, { opacity: .6, label: 'Horizon' }));
        out.push(text(wide.x, wide.y + 140, wide.w, 'Environmental wide · the platform, the rails, the fog', { size: 9, font: 'ibmPlexMono', weight: 500, color: alpha(ink, .4), align: 'center', tracking: .14, transform: 'uppercase', wrap: false, label: 'Image slot hint', role: 'LABEL' }));
        out.push(...mono(wide.x + 12, wide.y + 12, 130, 'Station 04').objs);
        const g = grid({ x: x0, y: y0 + 470 + GY, w: fr.w, h: fr.bottom - (y0 + 470 + GY) }, 2, 2, GX, GY);
        [[1, 0], [0, 0], [1, 1], [0, 1]].forEach(([c, r], i) => out.push(...panel(g(c, r), v, i + 2, { silent: i === 1 })));
        out.push(silentNote(g(0, 0)));
        out.push(...say(g(1, 0).x + 20, g(1, 0).y + 20, g(1, 0).w - 40, 'Who are you meeting, Noa?', 70).objs);
        out.push(...say(g(1, 1).x + 20, g(1, 1).y + 20, g(1, 1).w - 40, 'Someone who’s always on the next one.', 70).objs);
        out.push(vr(x1 - 1, g(0, 1).y, g(0, 1).h, red, 2, { label: 'Red mark' }));
      } else {
        // Narrow vertical on the right · wide · pair · wide
        const nw = 160;
        const strip: Box = { x: x1 - nw, y: y0, w: nw, h: fr.h };
        out.push(...panel(strip, v, 1, { hint: 'Clock · vertical' }));
        const lw = fr.w - nw - GX;
        const t: Box = { x: x0, y: y0, w: lw, h: 300 };
        out.push(...panel(t, v, 2));
        out.push(...mono(t.x + 10, t.y + 10, 190, '11:41. She is here.').objs);
        const y2 = y0 + 300 + GY;
        const g = grid({ x: x0, y: y2, w: lw, h: 320 }, 2, 1, GX);
        out.push(...panel(g(1, 0), v, 3)); out.push(...panel(g(0, 0), v, 4, { silent: true })); out.push(silentNote(g(0, 0)));
        out.push(...say(g(1, 0).x + 16, g(1, 0).y + 20, g(1, 0).w - 32, 'You can stop pretending to check the board.', 70).objs);
        const y3 = y2 + 320 + GY;
        const b: Box = { x: x0, y: y3, w: lw, h: fr.bottom - y3 };
        out.push(...panel(b, v, 5));
        out.push(...say(b.x + b.w - 300, b.y + 24, 280, 'I wasn’t pretending. The board is the only thing here that changes.', 74).objs);
        out.push(rect(strip.x + 1, strip.y + strip.h - 40, nw - 2, 8, red, { label: 'Red mark' }));
      }
      out.push(...mangaFoot(W, H, M, pageIndex, ink, 'ibmPlexMono'));
      return out;
    }
    case 'SPLASH PAGE': {
      out.push(ground(W, H, paper));
      const wide: Box = { x: fr.x, y: 320, w: fr.w, h: 380 };
      out.push(...panel(wide, v, 'splash', { silent: true, fill: alpha(grey, .12) }));
      out.push(hr(wide.x + 1, wide.y + 250, wide.w - 2, ink, .8, { opacity: .6, label: 'Horizon' }));
      out.push(text(wide.x, wide.y + 120, wide.w, 'Environmental splash · the last train, seen from the bridge', { size: 9, font: 'ibmPlexMono', weight: 500, color: alpha(ink, .4), align: 'center', tracking: .14, transform: 'uppercase', wrap: false, label: 'Image slot hint', role: 'LABEL' }));
      out.push(text(fr.x, 120, 300, '04 · THE PLATFORM', { size: 9, font: 'ibmPlexMono', weight: 500, color: red, tracking: .18, wrap: false, label: 'Chapter slug', role: 'LABEL' }));
      out.push(text(fr.x, 140, fr.w, 'Afterimage', { size: 40, font: 'notoSerifJp', weight: 700, color: ink, tracking: .1, wrap: false, label: 'Chapter title', role: 'HEADLINE' }));
      out.push(...captionBox(fr.x, 740, 360, 'The 11:40 was late. It’s always late.', { font: 'zenKaku', size: 11, weight: 500, color: ink, fill: paper, stroke: ink, bw: 1, pad: 10 }).objs);
      out.push(text(fr.right - 300, 1000, 300, 'Story & Art · Mari Ishikawa', { size: 9, font: 'ibmPlexMono', weight: 500, color: ink, tracking: .08, align: 'right', wrap: false, label: 'Author credit', role: 'CAPTION' }));
      out.push(...mangaFoot(W, H, M, pageIndex, ink, 'ibmPlexMono', false));
      return out;
    }
    default: {
      out.push(ground(W, H, paper));
      out.push(rect(0, 0, W, 640, mix(grey, .55), { label: 'Upper field' }));
      out.push(rect(W * .18 - 1, 0, 2, H, red, { label: 'Red thread' }));
      out.push(text(M + 2, 500, W - M * 2, 'Some stations you pass through. Some pass through you.', { size: 18, font: 'notoSerifJp', weight: 500, color: ink, leading: 1.5, label: 'Closing line', role: 'DECK' }));
      out.push(text(M + 2, 700, 400, 'AFTERIMAGE', { size: 22, font: 'notoSerifJp', weight: 700, color: ink, tracking: .18, wrap: false, label: 'Masthead · small', role: 'LABEL' }));
      out.push(text(M + 2, 740, 420, 'VOL. 1 · STATIONS 01–04 · BIG QUIET COMICS', { size: 8.5, font: 'ibmPlexMono', weight: 500, color: ink, tracking: .14, wrap: false, label: 'Volume slug', role: 'LABEL' }));
      out.push(text(M + 2, 770, 440, 'Story & Art Mari Ishikawa · Lettering Bea Oyelaran · Translation Mia Torres. Serialised in Big Quiet monthly. Right-to-left reading order preserved; sound effects retained in the original artwork with a glossary at the back.', { size: 9, font: 'zenKaku', weight: 500, color: ink, leading: 1.6, label: 'Colophon', role: 'CAPTION' }));
      out.push(text(M + 2, 900, 440, 'Vol. 2 · Stations 05–08 · The bridge, the fog, and the passenger who finally arrives.', { size: 10, font: 'zenKaku', weight: 500, color: grey, leading: 1.5, label: 'Next volume', role: 'CAPTION' }));
      out.push(...barcode(W - 150, 1000, 110, 56, ink, paper, 12, '4 93333 00002 5', 'ibmPlexMono'));
      return out;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INFINITE SCROLL — webtoon. 800×2400 vertical stack, breathing gaps, one reveal.
// ─────────────────────────────────────────────────────────────────────────────
const webtoon: PublicationDesigner = ({ W, H, pageType, pageIndex, paper: dark, ink: light, accent: violet, secondary: pink, seed }) => {
  const v: PanelVoice = { border: alpha(light, .22), bw: 1, rx: 8, fill: alpha(violet, .16), hintInk: alpha(light, .5) };
  const M = 48, CW = W - M * 2;
  const out: Objs = [];
  const say = (x: number, y: number, w: number, s: string, tail = 22, flip = false) => balloon(x, y, w, s, { font: 'sora', size: 13, weight: 600, color: dark, fill: light, stroke: 'none', bw: 0, tail, flip, pad: 14, leading: 1.35 });
  const cap = (x: number, y: number, w: number, s: string) => captionBox(x, y, w, s, { font: 'sora', size: 11, weight: 500, color: light, fill: alpha(dark, .9), stroke: alpha(light, .3), bw: 1, rx: 8, pad: 10 });
  const scrollCue = (y: number, label = 'scroll'): Objs => [
    text(0, y, W, label, { size: 10, font: 'sora', weight: 600, color: alpha(light, .55), align: 'center', tracking: .3, transform: 'uppercase', wrap: false, label: 'Scroll cue', role: 'LABEL' }),
    path(W / 2 - 12, y + 22, 24, 14, orn.chevronPath(40), alpha(light, .55), { rotation: 90, label: 'Scroll arrow' }),
  ];
  const glow = (cx: number, cy: number, r: number, color: string) => circle(cx, cy, r, color, { opacity: .18, blur: 40, label: 'Glow' });

  switch (pageType) {
    case 'COMIC COVER': {
      out.push(ground(W, H, dark));
      out.push(glow(W * .7, 700, 300, violet));
      out.push(glow(W * .25, 1600, 260, pink));
      out.push(text(M, 100, CW, 'Episode 12 · The Twelfth Floor', { size: 14, font: 'sora', weight: 600, color: violet, tracking: .08, wrap: false, label: 'Episode slug', role: 'LABEL' }));
      out.push(text(M, 130, CW, 'INFINITE\nSCROLL', { size: 96, font: 'unbounded', weight: 900, color: light, leading: .95, wrap: false, label: 'Masthead', role: 'HEADLINE' }));
      out.push(rect(M, 330, 120, 6, pink, { rx: 3, label: 'Accent bar' }));
      out.push(text(M, 352, CW, 'by Juno Vale', { size: 13, font: 'sora', weight: 500, color: alpha(light, .8), wrap: false, label: 'Creator', role: 'DECK' }));
      out.push(...imageSlot(M, 420, CW, 1460, { tone: 'dark', shade: alpha(violet, .2), rx: 16, frame: alpha(light, .2), frameWidth: 1, caption: 'Cover art · vertical hero', ink: alpha(light, .5), label: 'Cover art slot' }));
      out.push(...say(M + 40, 1660, 320, copy.body('comic', 2), 30).objs);
      const pills = ['Likes 12.4k', 'Comments 803', 'Subscribe'];
      pills.forEach((p, i) => { const px = M + i * 236; out.push(rect(px, 1930, 220, 44, i === 2 ? violet : alpha(light, .08), { rx: 22, stroke: alpha(light, .25), strokeWidth: 1, label: 'Stat pill' })); out.push(text(px, 1943, 220, p, { size: 11, font: 'sora', weight: 600, color: light, align: 'center', wrap: false, label: 'Stat', role: 'LABEL' })); });
      out.push(text(M, 2020, CW, 'Updates every Thursday · 14 episodes · rated Teen', { size: 10, font: 'sora', weight: 500, color: alpha(light, .55), tracking: .06, wrap: false, label: 'Series meta', role: 'CAPTION' }));
      out.push(hr(M, 2060, CW, alpha(light, .15), 1, { label: 'Foot rule' }));
      out.push(...scrollCue(2200, 'scroll to read'));
      return out;
    }
    case 'WEBTOON EPISODE': {
      out.push(ground(W, H, dark));
      if (pageIndex === 1) {
        out.push(text(M, 30, CW, 'Ep. 12 · The Twelfth Floor · 1/2', { size: 9, font: 'sora', weight: 600, color: alpha(light, .5), tracking: .16, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
        const p1: Box = { x: M, y: 80, w: CW, h: 480 };
        out.push(...panel(p1, v, 1));
        out.push(...cap(p1.x + 20, p1.y + 20, 300, 'The elevator only goes to eleven.').objs);
        out.push(...say(p1.x + p1.w - 340, p1.y + p1.h - 150, 300, copy.body('comic', 2), 70).objs);
        // Dialogue floats in the breathing gap
        out.push(...say(M + 60, 600, 320, 'It’s just the building settling.', 30, true).objs);
        const p2: Box = { x: M, y: 720, w: CW, h: 400 };
        out.push(...panel(p2, v, 2, { fill: alpha(pink, .14) }));
        out.push(...say(p2.x + 30, p2.y + 30, 300, 'Buildings don’t settle upward.', 26).objs);
        out.push(glow(W * .5, 1720, 340, violet));
        const reveal: Box = { x: M, y: 1320, w: CW, h: 820 };
        out.push(...panel(reveal, v, 3, { hint: 'Reveal · full height', fill: alpha(violet, .26) }));
        out.push(sfx(reveal.x + 20, reveal.y + 80, reveal.w - 40, 'K R R R K', { font: 'unbounded', size: 60, color: light, stroke: violet, bw: 6, rotation: -4, tracking: .08 }));
        out.push(...cap(reveal.x + 20, reveal.y + reveal.h - 70, 320, 'That’s… not the ceiling.').objs);
        out.push(...scrollCue(2270, 'keep scrolling'));
      } else {
        out.push(text(M, 30, CW, 'Ep. 12 · The Twelfth Floor · 2/2', { size: 9, font: 'sora', weight: 600, color: alpha(light, .5), tracking: .16, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }));
        // Full-bleed opener
        out.push(rect(0, 60, W, 620, alpha(pink, .18), { label: 'Panel 1 · full bleed', role: 'IMAGE_SLOT' }));
        out.push(text(0, 60 + 300, W, 'Panel 1 · art · full bleed', { size: 11, font: 'sora', weight: 600, color: alpha(light, .5), align: 'center', tracking: .14, transform: 'uppercase', wrap: false, label: 'Image slot hint', role: 'LABEL' }));
        out.push(...say(M + 20, 100, 300, 'Okay. Nobody move.', 26).objs);
        out.push(...cap(W - M - 320, 600, 320, 'Floor twelve. The one that isn’t on the panel.').objs);
        // Reaction pair
        const pairY = 860;
        const a: Box = { x: M, y: pairY, w: 344, h: 380 }, b: Box = { x: M + 344 + 16, y: pairY, w: 344, h: 380 };
        out.push(...panel(a, v, 2, { hint: 'Reaction · Mara' }), ...panel(b, v, 3, { hint: 'Reaction · Theo', fill: alpha(pink, .14) }));
        out.push(...say(a.x + 16, a.y + 16, a.w - 32, 'I told you the building was weird.', 30).objs);
        out.push(...say(b.x + 16, b.y + 16, b.w - 32, 'You said haunted. This is worse. This is architecture.', 60).objs);
        out.push(glow(W * .5, 1760, 360, pink));
        const reveal: Box = { x: M, y: 1420, w: CW, h: 700 };
        out.push(...panel(reveal, v, 4, { hint: 'Reveal · the door', fill: alpha(violet, .28) }));
        out.push(sfx(reveal.x + 20, reveal.y + reveal.h / 2 - 40, reveal.w - 40, 'D I N G', { font: 'unbounded', size: 72, color: light, stroke: pink, bw: 6, tracking: .12 }));
        out.push(rect(M, 2200, CW, 120, violet, { rx: 16, label: 'To-be-continued card' }));
        out.push(text(M, 2226, CW, 'To be continued', { size: 26, font: 'unbounded', weight: 800, color: light, align: 'center', wrap: false, label: 'To be continued', role: 'LABEL' }));
        out.push(text(M, 2268, CW, 'Next · Ep. 13 · The Stairwell · Thursday', { size: 11, font: 'sora', weight: 600, color: alpha(light, .85), align: 'center', tracking: .06, wrap: false, label: 'Next episode', role: 'CAPTION' }));
      }
      return out;
    }
    default: {
      out.push(ground(W, H, dark));
      out.push(glow(W * .5, 500, 320, violet));
      out.push(text(M, 260, CW, 'Thanks for\nreading', { size: 64, font: 'unbounded', weight: 900, color: light, align: 'center', leading: 1, wrap: false, label: 'End-card title', role: 'HEADLINE' }));
      out.push(...imageSlot(W / 2 - 70, 440, 140, 140, { tone: 'dark', shade: alpha(pink, .3), rx: 70, frame: alpha(light, .3), frameWidth: 1, caption: 'Creator', ink: alpha(light, .55), label: 'Creator avatar slot' }));
      out.push(text(M, 600, CW, 'Juno Vale', { size: 20, font: 'sora', weight: 700, color: light, align: 'center', wrap: false, label: 'Creator name', role: 'LABEL' }));
      out.push(text(M, 632, CW, 'Draws at night. Answers comments in the morning.', { size: 12, font: 'sora', weight: 500, color: alpha(light, .7), align: 'center', wrap: false, label: 'Creator line', role: 'CAPTION' }));
      ['Like', 'Comment', 'Share'].forEach((p, i) => { const px = M + i * 236; out.push(rect(px, 720, 220, 52, alpha(light, .06), { rx: 26, stroke: alpha(light, .3), strokeWidth: 1, label: 'Action pill' })); out.push(text(px, 737, 220, p, { size: 12, font: 'sora', weight: 600, color: light, align: 'center', wrap: false, label: 'Action', role: 'LABEL' })); });
      out.push(rect(M, 880, CW, 300, alpha(light, .05), { rx: 16, stroke: alpha(light, .18), strokeWidth: 1, label: 'Next-episode card' }));
      out.push(...imageSlot(M + 20, 900, 260, 260, { tone: 'dark', shade: alpha(violet, .28), rx: 12, caption: 'Ep. 13 · art', ink: alpha(light, .5), label: 'Next-episode art slot' }));
      out.push(text(M + 300, 920, CW - 320, 'NEXT EPISODE', { size: 10, font: 'sora', weight: 700, color: pink, tracking: .2, wrap: false, label: 'Next kicker', role: 'LABEL' }));
      out.push(text(M + 300, 944, CW - 320, 'Ep. 13\nThe Stairwell', { size: 30, font: 'unbounded', weight: 800, color: light, leading: 1.05, wrap: false, label: 'Next title', role: 'LABEL' }));
      out.push(text(M + 300, 1030, CW - 320, 'Mara counts the steps. There are more on the way down than there were on the way up. Thursday.', { size: 12, font: 'sora', weight: 500, color: alpha(light, .75), leading: 1.5, label: 'Next teaser', role: 'BODY' }));
      out.push(text(M, 1280, CW, 'Support the series', { size: 12, font: 'sora', weight: 700, color: light, align: 'center', wrap: false, label: 'Support head', role: 'LABEL' }));
      out.push(rect(W / 2 - 130, 1310, 260, 50, pink, { rx: 25, label: 'Support button' }));
      out.push(text(W / 2 - 130, 1326, 260, 'Buy the artist a coffee', { size: 12, font: 'sora', weight: 700, color: dark, align: 'center', wrap: false, label: 'Support label', role: 'LABEL' }));
      out.push(hr(M, 1500, CW, alpha(light, .15), 1, { label: 'Colophon rule' }));
      out.push(text(M, 1520, CW, 'INFINITE SCROLL · Episode 12 · The Twelfth Floor. Story & Art Juno Vale · Lettering Bea Oyelaran · Colors Ada Lindgren. Published on Plajah Webtoons. Updates every Thursday. All floors are fictional, including the twelfth.', { size: 10, font: 'sora', weight: 500, color: alpha(light, .6), leading: 1.55, label: 'Colophon', role: 'CAPTION' }));
      out.push(text(M, 1700, CW, 'INFINITE SCROLL', { size: 28, font: 'unbounded', weight: 900, color: light, wrap: false, label: 'Masthead · small', role: 'LABEL' }));
      out.push(text(M, 1740, CW, `Series ID ${String(1000 + (seed % 900)).padStart(4, '0')} · Season 2`, { size: 9, font: 'sora', weight: 600, color: alpha(light, .5), tracking: .12, transform: 'uppercase', wrap: false, label: 'Series id', role: 'LABEL' }));
      out.push(path(W / 2 - 12, 2220, 24, 14, orn.chevronPath(40), alpha(light, .55), { rotation: -90, label: 'Back-to-top arrow' }));
      out.push(text(0, 2246, W, 'back to top', { size: 10, font: 'sora', weight: 600, color: alpha(light, .55), align: 'center', tracking: .3, transform: 'uppercase', wrap: false, label: 'Back-to-top cue', role: 'LABEL' }));
      return out;
    }
  }
};

export const DESIGNS: Record<string, PublicationDesigner> = {
  'comic-superhero': superhero,
  'comic-noir': noir,
  'comic-kids': kids,
  'comic-anthology': anthology,
  'manga-shonen': shonen,
  'manga-shojo': shojo,
  'manga-seinen': seinen,
  'comic-webtoon': webtoon,
};

export const LESSONS: Record<string, DesignLesson> = {
  'comic-superhero': {
    principle: 'A superhero page is choreography: the diagonal gutters push the eye down and to the right at the speed of the action, and the splash page pays off the rhythm you built on the pages before it.',
    history: 'The genre took shape with Action Comics #1 (1938) and the Golden Age publishers that followed. In the 1960s Jack Kirby broke panels along diagonals, let figures burst past borders and invented the exploding-dot energy later called "Kirby Krackle"; Marvel’s house style, and much of modern action lettering, descends from him. Bold display SFX with a contrasting outline came from hand-letterers such as Artie Simek and Sam Rosen.',
    tryThis: 'Rotate one of the diagonal panel edges the other way and notice how the page suddenly reads slower, or fights the eye. Then move the SFX so its baseline follows the new diagonal.',
    interestTag: 'Comics & manga',
    related: ['Superhero comics', 'Comic lettering', 'Page layout'],
  },
  'comic-noir': {
    principle: 'Noir is drawn with darkness, not lines: a heavy black shape inside every panel gives the eye somewhere to rest, and the wide letterbox panel makes the reader feel they are watching a film.',
    history: 'Crime comics boomed in the 1940s (Lev Gleason’s Crime Does Not Pay, 1942) until the 1954 Comics Code cut them off. Will Eisner’s The Spirit had already shown how cinematic lighting, rain and a title worked into the splash could carry a mood, and Frank Miller’s Sin City (1991) pushed the idea to pure black-and-white silhouettes. Typewriter narration boxes borrow from the pulp paperbacks the stories grew up beside.',
    tryThis: 'Slide the black inset shadow to the opposite side of one panel and see how the light source, and the mood, changes without redrawing anything.',
    interestTag: 'Comics & manga',
    related: ['Noir', 'Crime comics', 'Chiaroscuro'],
  },
  'comic-kids': {
    principle: 'Clarity is kindness: four open panels, rounded corners, big balloons and one idea per panel let a young reader find the order without being told.',
    history: 'The four-panel rhythm comes from the daily newspaper strip, perfected by Charles Schulz in Peanuts from 1950. Hergé’s ligne claire school in Belgium taught that a clean, even outline and flat colour make a picture instantly readable. The modern kids’ graphic-novel boom, from Raina Telgemeier’s Smile (2010) to Dav Pilkey’s Dog Man, keeps those lessons and adds warm, rounded panel borders that feel friendly rather than strict.',
    tryThis: 'Enlarge one balloon until it nearly fills its panel. Comics for young readers can afford it, and the drawing underneath will tell you when it has gone too far.',
    interestTag: 'Comics & manga',
    related: ['Picture books', 'Comic strips', 'Ligne claire'],
  },
  'comic-anthology': {
    principle: 'An anthology is a book first: a shared running head, folio and title strip make five very different artists feel like one publication, while the page rhythm (three tall, six square, one splash) changes with each story.',
    history: 'Literary comics anthologies began with underground and alternative magazines: Art Spiegelman and Françoise Mouly’s RAW (1980) treated comics as an art object with large pages and fine printing, and Drawn & Quarterly (1990) and Kramers Ergot carried the idea forward. Their design language of serif titles, wide margins and hand lettering framed by a quiet editorial grid is what separates a graphic anthology from a floppy.',
    tryThis: 'Swap the story title in the running head and re-letter one balloon in your own handwriting scan. The grid should hold; if it does not, the grid is doing too little.',
    interestTag: 'Comics & manga',
    related: ['Graphic novels', 'Anthologies', 'Editorial design'],
  },
  'manga-shonen': {
    principle: 'Right-to-left reading changes everything: the first panel sits top-right, balloons stack toward the left, and speed lines converge on the impact so the eye arrives exactly when the punch does.',
    history: 'Shōnen manga grew up in weekly magazines, above all Weekly Shōnen Jump (Shueisha, 1968), whose serials were collected into tankōbon volumes. Osamu Tezuka’s cinematic paneling in the late 1940s set the vocabulary; later artists such as Akira Toriyama refined the compressed reaction strip and the full-page impact splash. When English publishers began keeping the original right-to-left orientation in the early 2000s, the "Stop! You’re reading the wrong way" back-cover diagram became a genre convention of its own.',
    tryThis: 'Read one of the pages left to right on purpose and notice where the story breaks. Then move a single balloon so the right-to-left path becomes unmistakable.',
    interestTag: 'Comics & manga',
    related: ['Manga', 'Action comics', 'Speed lines'],
  },
  'manga-shojo': {
    principle: 'Emotion needs air: borderless panels, oval insets and a page that is a third empty let interior monologue float free of the action, so the reader lingers instead of racing.',
    history: 'Shōjo manga’s visual language was largely shaped in the 1970s by the Year 24 Group, including Moto Hagio and Keiko Takemiya, and by Riyoko Ikeda’s The Rose of Versailles (1972). They dissolved panel borders, layered portraits over scenes, and filled backgrounds with flowers and screentone to express feeling rather than place. Magazines such as Ribon and Margaret carried the style to generations of readers.',
    tryThis: 'Delete one panel fill entirely and let the figure stand on white paper. Then move a petal so it crosses the gutter; the page should feel more connected, not less.',
    interestTag: 'Comics & manga',
    related: ['Manga', 'Romance', 'Screentone'],
  },
  'manga-seinen': {
    principle: 'Silence is a panel too: a measured five-or-six panel grid with one empty frame gives the reader time, and the single red mark tells them where the page is really looking.',
    history: 'Adult-oriented manga traces to the gekiga movement named by Yoshihiro Tatsumi in the late 1950s and the alternative magazine Garo (1964), which favoured realism and quiet over spectacle. Seinen magazines such as Big Comic (1968) carried the approach into the mainstream. Jiro Taniguchi’s The Walking Man (1992) and later Naoki Urasawa and Inio Asano showed how wide environmental panels and wordless beats could hold a page.',
    tryThis: 'Remove the dialogue from one more panel. If the page still reads, the pictures were carrying it; if not, put the shortest possible line back.',
    interestTag: 'Comics & manga',
    related: ['Manga', 'Gekiga', 'Slow storytelling'],
  },
  'comic-webtoon': {
    principle: 'The scroll is the gutter: on a phone the reader controls the pace with a thumb, so the vertical gaps between panels are the timing, and one panel taller than the rest is the reveal.',
    history: 'Webtoons emerged in South Korea in the early 2000s as portals such as Daum (2003) and Naver (2004) began hosting comics drawn for vertical scrolling on screen. The format dropped the printed page entirely: full-colour, long panels, generous negative space and dialogue placed in the gaps. Global platforms in the 2010s carried it worldwide, and series such as Tower of God and Lore Olympus made the vertical strip a mainstream comics form.',
    tryThis: 'Double the gap above the reveal panel and read the episode on your phone. The extra scroll is a held breath; find the length where it stops being suspense and starts being a wait.',
    interestTag: 'Comics & manga',
    related: ['Webtoons', 'Mobile design', 'Vertical comics'],
  },
};
