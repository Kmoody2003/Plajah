// scriptureLayouts — every way a verse can stand on an Ambo screen.
//
// THE RULE: scripture is READ, in a room, by people far from the screen. So
// every layout keeps the verse centred in a comfortable reading MEASURE (eye
// travel stays short even on a 32:9 wall), large, high-contrast, and settled.
// Motion belongs to the background and to entrances/exits — never to the text
// while someone is reading it. When the verse's own typography becomes the
// background art, the verse being read sits on a translucent plate so it is
// never lost in its own decoration.
//
// Every layout adapts to the output's aspect ratio (each output renders at
// its own size): vertical phone/story, portrait tablet, classic 4:3 & 5:4,
// screen 16:9/16:10, ultrawide 21:9/2.39, and LED walls 3:1–5:1. Layouts
// RE-FLOW per aspect class (a side panel becomes a bottom panel on vertical)
// rather than scaling one composition.
//
// Transitions are typographic and apply only when scripture comes up from
// clear (entrance) and when it is cleared (exit). Verse→verse changes are a
// short crossfade handled by the source.

import {
  type AspectClass, type ScriptureState, type LayoutFamily, type ScriptureLayout,
  aspectClass, SERIF, SANS, DISPLAY, GROTESK, MONO, GOLD, clamp01, easeOut, easeInOut, easeBack, rgba,
  decoAlpha, wrap, fit, measure, drawVerse, drawReference, drawReferenceLead, drawCopyright, plate,
  livingGradient, ruleSweep, safe, motionT, contextText, keyWords, scratch, centredVerse, readingPlate,
} from './scriptureKit';
import { MODERN_ABSTRACT_LAYOUTS } from './scriptureLooks/modernAbstract';
import { URBAN_GRUNGE_LAYOUTS } from './scriptureLooks/urbanGrunge';
export { aspectClass } from './scriptureKit';
export type { AspectClass, ScriptureState, LayoutFamily, ScriptureLayout } from './scriptureKit';

export interface ScriptureFormat { id: string; label: string; group: 'Screen & TV' | 'Traditional' | 'Ultrawide & LED' | 'Mobile & Social' | 'Tablet'; w: number; h: number }

/** Standard formats — for previews, galleries and output presets. */
export const SCRIPTURE_FORMATS: ScriptureFormat[] = [
  { id: 'hd', label: 'Screen / TV 16:9', group: 'Screen & TV', w: 1920, h: 1080 },
  { id: 'uhd', label: '4K UHD 16:9', group: 'Screen & TV', w: 3840, h: 2160 },
  { id: 'w1610', label: 'Projector 16:10', group: 'Screen & TV', w: 1920, h: 1200 },
  { id: 'c43', label: 'Traditional 4:3', group: 'Traditional', w: 1600, h: 1200 },
  { id: 'c54', label: 'Traditional 5:4', group: 'Traditional', w: 1280, h: 1024 },
  { id: 'sq', label: 'Square 1:1', group: 'Traditional', w: 1080, h: 1080 },
  { id: 'uw219', label: 'Ultrawide 21:9', group: 'Ultrawide & LED', w: 2560, h: 1080 },
  { id: 'cine', label: 'Cinema 2.39:1', group: 'Ultrawide & LED', w: 2580, h: 1080 },
  { id: 'uw329', label: 'Super-ultrawide 32:9', group: 'Ultrawide & LED', w: 3840, h: 1080 },
  { id: 'led3', label: 'LED wall 3:1', group: 'Ultrawide & LED', w: 3240, h: 1080 },
  { id: 'led4', label: 'LED wall 4:1', group: 'Ultrawide & LED', w: 4320, h: 1080 },
  { id: 'led5', label: 'Stage wall 5:1', group: 'Ultrawide & LED', w: 5400, h: 1080 },
  { id: 'v916', label: 'Vertical video 9:16', group: 'Mobile & Social', w: 1080, h: 1920 },
  { id: 'phone', label: 'Phone 19.5:9', group: 'Mobile & Social', w: 1080, h: 2340 },
  { id: 's45', label: 'Social 4:5', group: 'Mobile & Social', w: 1080, h: 1350 },
  { id: 't34', label: 'Tablet portrait 3:4', group: 'Tablet', w: 1536, h: 2048 },
  { id: 't43', label: 'Tablet landscape 4:3', group: 'Tablet', w: 2048, h: 1536 },
];

// ── state handed to a layout each frame ──────────────────────────────────────

export interface ScriptureTransition { id: string; name: string; blurb: string; inSec: number; outSec: number }

export const SCRIPTURE_TRANSITIONS: ScriptureTransition[] = [
  { id: 'crossfade', name: 'Crossfade', blurb: 'The default — the verse fades up, and fades away.', inSec: 0.6, outSec: 0.45 },
  { id: 'rise', name: 'Word Rise', blurb: 'Words rise into place in reading order; on exit they lift away.', inSec: 1.3, outSec: 0.6 },
  { id: 'cascade', name: 'Letter Cascade', blurb: 'Letters fall into place like type being set; on exit they drop.', inSec: 1.5, outSec: 0.7 },
  { id: 'focus', name: 'Focus Pull', blurb: 'The verse resolves from a soft, wide blur into sharp, tight type.', inSec: 1.0, outSec: 0.55 },
  { id: 'wipe', name: 'Ink Wipe', blurb: 'A soft edge writes each line across in reading direction.', inSec: 1.4, outSec: 0.6 },
  { id: 'reference', name: 'Reference Lead', blurb: 'The reference announces itself first, then the verse arrives.', inSec: 1.8, outSec: 0.6 },
  { id: 'split', name: 'Line Split', blurb: 'Lines glide in from alternating sides and lock into the column.', inSec: 1.2, outSec: 0.6 },
];
export const transitionById = (id?: string) => SCRIPTURE_TRANSITIONS.find(t => t.id === id) ?? SCRIPTURE_TRANSITIONS[0];

// ── layouts ──────────────────────────────────────────────────────────────────

export const SCRIPTURE_LAYOUTS: ScriptureLayout[] = [
  // ── Transparent (over camera, over visuals, for keys) ──
  {
    id: 'clean-center', name: 'Clean Center', family: 'Transparent', background: 'transparent', animated: false,
    blurb: 'Just the verse, centred, with a soft shadow and a quiet vignette behind the words only.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      ctx.save(); ctx.globalAlpha = a * 0.75;
      const rg = ctx.createRadialGradient(s.w / 2, s.h * 0.46, 0, s.w / 2, s.h * 0.46, Math.max(s.w, s.h) * 0.55);
      rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, s.w, s.h); ctx.restore();
      drawReferenceLead(ctx, s, '#fff');
      centredVerse(ctx, s, { shadow: s.h * 0.02 });
    },
  },
  {
    id: 'lower-third', name: 'Lower Third', family: 'Transparent', background: 'transparent', animated: true,
    blurb: 'The broadcast classic: a gold-ruled bar low on screen, with a light sweep along the rule.',
    draw(ctx, s) {
      const cls = aspectClass(s.w, s.h);
      const m = safe(s);
      const a = decoAlpha(s);
      // Wide formats: the bar is a READING MEASURE, not the screen width — a
      // verse stretched into one long line makes the room turn its heads.
      const wide = cls === 'wall' || cls === 'ultrawide';
      const barW = cls === 'vertical' || cls === 'portrait' ? s.w - m * 2 : Math.min(s.w - m * 2, s.h * (wide ? 1.55 : 1.95));
      const x = cls === 'vertical' || cls === 'portrait' ? m : wide ? (s.w - barW) / 2 : m * 1.5;
      const pad = s.h * 0.03;
      ctx.font = `${s.h * 0.05}px ${SERIF}`;
      const maxH = s.h * (cls === 'vertical' ? 0.3 : wide ? 0.3 : 0.26);
      const testFit = fit(ctx, s.text, sz => `${sz}px ${SERIF}`, barW - pad * 2.4, maxH, 1.3, s.h * (cls === 'vertical' ? 0.034 : wide ? 0.058 : 0.052), s.h * 0.024);
      const barH = testFit.lines.length * testFit.size * 1.3 + pad * 2 + testFit.size * 0.9;
      const y = s.h - m - barH;
      const slide = (1 - easeOut(s.enterP * 1.6)) * s.h * 0.04 + easeInOut(s.exitP) * s.h * 0.04;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(0, slide);
      const g = ctx.createLinearGradient(x, 0, x + barW, 0);
      g.addColorStop(0, 'rgba(9,7,16,0.92)'); g.addColorStop(0.7, 'rgba(9,7,16,0.78)'); g.addColorStop(1, 'rgba(9,7,16,0.15)');
      ctx.fillStyle = g; ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = s.accent; ctx.fillRect(x, y, Math.max(3, s.h * 0.005), barH);
      ruleSweep(ctx, s, x, y, barW * 0.9, Math.max(2, s.h * 0.0025), rgba(s.accent, 0.8));
      ctx.restore();
      ctx.save(); ctx.translate(0, slide);
      const r = drawVerse(ctx, s, { x: x + pad * 1.4, y: y + pad, w: barW - pad * 2.4, h: barH - pad * 2 - testFit.size * 0.9, align: 'left', valign: 'top' }, { font: sz => `${sz}px ${SERIF}`, color: '#fff', lh: 1.3, max: testFit.size, min: s.h * 0.022 });
      drawReference(ctx, s, x + pad * 1.4, r.bottom + testFit.size * 0.75, 'left', Math.max(12, testFit.size * 0.42), s.accent);
      ctx.restore();
      drawCopyright(ctx, s, s.w - m, s.h - m * 0.35, 'right');
    },
  },
  {
    id: 'glass-lower', name: 'Glass Lower Third', family: 'Transparent', background: 'transparent', animated: true,
    blurb: 'A frosted glass pill, centred low — modern and calm over any picture.',
    draw(ctx, s) {
      const cls = aspectClass(s.w, s.h);
      const m = safe(s);
      const a = decoAlpha(s);
      const pw = cls === 'vertical' || cls === 'portrait' ? s.w - m * 2 : Math.min(s.w * 0.8, s.h * 1.7);
      const ctxSize = cls === 'vertical' ? s.w * 0.06 : s.h * 0.048;
      const f = fit(ctx, s.text, sz => `500 ${sz}px ${DISPLAY}`, pw * 0.86, s.h * 0.24, 1.28, ctxSize, s.h * 0.022);
      const ph = f.lines.length * f.size * 1.28 + f.size * 2.4;
      const x = (s.w - pw) / 2, y = s.h - m - ph;
      const lift = (1 - easeOut(s.enterP * 1.5)) * s.h * 0.03 - easeInOut(s.exitP) * s.h * 0.02;
      ctx.save(); ctx.translate(0, lift);
      plate(ctx, x, y, pw, ph, { tint: 'rgba(14,12,26,0.55)', blur: s.h * 0.02, r: ph * 0.3, edge: 'rgba(255,255,255,0.18)', alpha: a });
      // shimmer along the top edge
      ctx.save(); ctx.globalAlpha = a * 0.6; ruleSweep(ctx, s, x + ph * 0.3, y, pw - ph * 0.6, 1.5, 'rgba(255,255,255,0.12)'); ctx.restore();
      const r = drawVerse(ctx, s, { x: x + pw * 0.07, y: y + f.size * 0.6, w: pw * 0.86, h: ph - f.size * 2.1, align: 'center', valign: 'top' }, { font: sz => `500 ${sz}px ${DISPLAY}`, color: '#fff', lh: 1.28, max: f.size, min: s.h * 0.02 });
      drawReference(ctx, s, s.w / 2, r.bottom + f.size * 0.85, 'center', Math.max(11, f.size * 0.4), 'rgba(255,255,255,0.75)', { font: `600 ${Math.max(11, f.size * 0.4)}px ${SANS}` });
      ctx.restore();
    },
  },
  {
    id: 'caption', name: 'Broadcast Caption', family: 'Transparent', background: 'transparent', animated: false,
    blurb: 'Small and unobtrusive for the stream — the picture stays the subject.',
    draw(ctx, s) {
      const m = safe(s);
      const cls = aspectClass(s.w, s.h);
      const w = cls === 'vertical' ? s.w - m * 2 : Math.min(s.w * 0.6, s.h * 1.3);
      const f = fit(ctx, s.text, sz => `${sz}px ${SANS}`, w - m * 0.6, s.h * 0.14, 1.3, s.h * 0.032, s.h * 0.018);
      const h = f.lines.length * f.size * 1.3 + f.size * 1.9;
      const x = (s.w - w) / 2, y = s.h - m * 0.8 - h;
      ctx.save(); ctx.globalAlpha = decoAlpha(s) * 0.85; ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.beginPath(); (ctx as any).roundRect?.(x, y, w, h, f.size * 0.4); ctx.fill(); ctx.restore();
      const r = drawVerse(ctx, s, { x: x + m * 0.3, y: y + f.size * 0.45, w: w - m * 0.6, h: h - f.size * 1.6, align: 'center', valign: 'top' }, { font: sz => `${sz}px ${SANS}`, color: '#fff', lh: 1.3, max: f.size, min: s.h * 0.016 });
      drawReference(ctx, s, s.w / 2, r.bottom + f.size * 0.85, 'center', Math.max(10, f.size * 0.55), s.accent, { tracking: 0.08 });
    },
  },

  // ── Panels ──
  ...(['left', 'right'] as const).map((side): ScriptureLayout => ({
    id: `${side}-panel`, name: side === 'left' ? 'Left Panel' : 'Right Panel', family: 'Panel', background: 'transparent', animated: true,
    blurb: `A tall reading panel on the ${side}, leaving the ${side === 'left' ? 'right' : 'left'} of the picture (speaker, camera, art) clear. Becomes a bottom panel on vertical screens.`,
    draw(ctx, s) {
      const cls = aspectClass(s.w, s.h);
      const a = decoAlpha(s);
      const stacked = cls === 'vertical' || cls === 'portrait';
      const pw = stacked ? s.w : cls === 'wall' ? s.h * 1.25 : cls === 'ultrawide' ? s.w * 0.34 : cls === 'classic' ? s.w * 0.46 : s.w * 0.4;
      const ph = stacked ? s.h * 0.46 : s.h;
      const px = stacked ? 0 : side === 'left' ? 0 : s.w - pw;
      const py = stacked ? s.h - ph : 0;
      const slideIn = (1 - easeOut(s.enterP * 1.4)) + easeInOut(s.exitP);
      const off = stacked ? slideIn * ph * 0.25 : (side === 'left' ? -1 : 1) * slideIn * pw * 0.25;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(stacked ? 0 : off, stacked ? off : 0);
      const g = stacked ? ctx.createLinearGradient(0, py, 0, py + ph) : ctx.createLinearGradient(side === 'left' ? pw : px, 0, side === 'left' ? 0 : s.w, 0);
      g.addColorStop(0, 'rgba(8,6,16,0.0)'); g.addColorStop(0.18, 'rgba(8,6,16,0.82)'); g.addColorStop(1, 'rgba(8,6,16,0.94)');
      ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
      // slow accent shimmer on the inner edge
      const ex = stacked ? 0 : side === 'left' ? pw - 3 : px;
      const shimmer = 0.55 + 0.25 * Math.sin(s.t * 0.8);
      ctx.fillStyle = rgba(s.accent, shimmer);
      if (stacked) ctx.fillRect(0, py + ph * 0.12, s.w, Math.max(2, s.h * 0.002)); else ctx.fillRect(ex, s.h * 0.18, 3, s.h * 0.64);
      ctx.restore();
      ctx.save(); ctx.translate(stacked ? 0 : off, stacked ? off : 0);
      const pad = Math.min(pw, ph) * 0.1;
      const bx = px + pad, bw = pw - pad * 2;
      const by = stacked ? py + ph * 0.18 : s.h * 0.18, bh = stacked ? ph * 0.6 : s.h * 0.56;
      const r = drawVerse(ctx, s, { x: bx, y: by, w: bw, h: bh, align: 'left', valign: 'middle' }, { font: sz => `${sz}px ${SERIF}`, color: '#fff', lh: 1.34, max: stacked ? s.w * 0.07 : s.h * 0.07, min: s.h * 0.022 });
      drawReference(ctx, s, bx, r.bottom + r.size * 1.1, 'left', Math.max(12, r.size * 0.4), s.accent);
      ctx.restore();
      drawCopyright(ctx, s, side === 'left' || stacked ? s.w - safe(s) : safe(s), s.h - safe(s) * 0.4, side === 'left' || stacked ? 'right' : 'left');
    },
  })),
  {
    id: 'center-band', name: 'Center Band', family: 'Overlay', background: 'transparent', animated: true,
    blurb: 'A translucent band across the middle of the picture — overlay without hiding everything.',
    draw(ctx, s) {
      const cls = aspectClass(s.w, s.h);
      const a = decoAlpha(s);
      const bw = measure(s.w, s.h, 0.84);
      const f = fit(ctx, s.text, sz => `${sz}px ${SERIF}`, bw, s.h * (cls === 'vertical' ? 0.42 : 0.36), 1.3, cls === 'vertical' ? s.w * 0.075 : s.h * 0.07, s.h * 0.026);
      const bh = f.lines.length * f.size * 1.3 + f.size * 2.6;
      const by = s.h * 0.5 - bh / 2;
      const open = easeOut(s.enterP * 1.6) * (1 - easeInOut(s.exitP));
      ctx.save(); ctx.globalAlpha = a;
      const half = bh / 2 * open;
      ctx.fillStyle = 'rgba(6,5,14,0.66)'; ctx.fillRect(0, s.h / 2 - half, s.w, half * 2);
      ruleSweep(ctx, s, 0, s.h / 2 - half, s.w, Math.max(1, s.h * 0.0016), rgba(s.accent, 0.6));
      ctx.fillStyle = rgba(s.accent, 0.6); ctx.fillRect(0, s.h / 2 + half - Math.max(1, s.h * 0.0016), s.w, Math.max(1, s.h * 0.0016));
      ctx.restore();
      drawReferenceLead(ctx, s, '#fff');
      const r = drawVerse(ctx, s, { x: (s.w - bw) / 2, y: by + f.size * 0.6, w: bw, h: bh - f.size * 2.2, align: 'center', valign: 'top' }, { font: sz => `${sz}px ${SERIF}`, color: '#fff', lh: 1.3, max: f.size, min: s.h * 0.024 });
      drawReference(ctx, s, s.w / 2, r.bottom + f.size * 0.9, 'center', Math.max(12, f.size * 0.38), s.accent);
    },
  },
  {
    id: 'vignette-overlay', name: 'Soft Overlay', family: 'Overlay', background: 'transparent', animated: true,
    blurb: 'Darkens the picture with a slow-breathing vignette and sets the verse large in the centre.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      const breathe = 0.04 * Math.sin(s.t * 0.4);
      ctx.save(); ctx.globalAlpha = a;
      const rg = ctx.createRadialGradient(s.w / 2, s.h / 2, Math.min(s.w, s.h) * 0.1, s.w / 2, s.h / 2, Math.max(s.w, s.h) * (0.75 + breathe));
      rg.addColorStop(0, 'rgba(0,0,0,0.45)'); rg.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, s.w, s.h); ctx.restore();
      drawReferenceLead(ctx, s, '#fff');
      centredVerse(ctx, s, { shadow: s.h * 0.012 });
    },
  },

  // ── Opaque ──
  {
    id: 'sanctuary', name: 'Sanctuary', family: 'Opaque', background: 'opaque', animated: true,
    blurb: 'The default auditorium look: deep violet field with a slow drifting light, large serif verse, gold reference.',
    draw(ctx, s) {
      ctx.save(); ctx.globalAlpha = decoAlpha(s);
      livingGradient(ctx, s, '#120d24', '#0b0816', '#06050c');
      ctx.restore();
      drawReferenceLead(ctx, s, GOLD);
      centredVerse(ctx, s, {});
    },
  },
  {
    id: 'parchment', name: 'Parchment', family: 'Opaque', background: 'opaque', animated: true,
    blurb: 'Dark ink on warm paper — for bright rooms where light text washes out.',
    draw(ctx, s) {
      ctx.save(); ctx.globalAlpha = decoAlpha(s);
      livingGradient(ctx, s, '#f3ead6', '#ece0c4', '#e2d3b0');
      // paper grain
      ctx.globalAlpha *= 0.06; ctx.fillStyle = '#6b5530';
      for (let i = 0; i < 160; i++) { const x = ((i * 977) % s.w), y = ((i * 613 + s.t * 0) % s.h); ctx.fillRect(x, y, 1.5, 1.5); }
      ctx.restore();
      drawReferenceLead(ctx, s, '#5a3e14');
      centredVerse(ctx, s, { color: '#2a1d0c', refColor: '#8a5a1a' });
    },
  },
  {
    id: 'midnight', name: 'Midnight Sleek', family: 'Opaque', background: 'opaque', animated: true,
    blurb: 'Really sleek: near-black, a modern sans set large, a hairline that slowly scans, tracked reference.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#050507'; ctx.fillRect(0, 0, s.w, s.h);
      const scanY = s.h * (0.15 + 0.7 * ((Math.sin(s.t * 0.15) + 1) / 2));
      const g = ctx.createLinearGradient(0, scanY - s.h * 0.2, 0, scanY + s.h * 0.2);
      g.addColorStop(0, 'rgba(120,140,255,0)'); g.addColorStop(0.5, 'rgba(120,140,255,0.06)'); g.addColorStop(1, 'rgba(120,140,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, scanY - s.h * 0.2, s.w, s.h * 0.4);
      ctx.restore();
      drawReferenceLead(ctx, s, '#fff');
      const r = centredVerse(ctx, s, { font: sz => `300 ${sz}px ${DISPLAY}`, refColor: '#9AA6FF', refFont: `500 {s}px ${GROTESK}` });
      ctx.save(); ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#fff';
      const lw = measure(s.w, s.h) * 0.12; ctx.fillRect(s.w / 2 - lw / 2, r.top - r.size * 0.8, lw, Math.max(1, s.h * 0.0014)); ctx.restore();
    },
  },
  {
    id: 'big-reference', name: 'Big Reference', family: 'Opaque', background: 'opaque', animated: true,
    blurb: 'Giant chapter:verse numerals as architecture beside the verse; stacks on vertical screens.',
    draw(ctx, s) {
      const cls = aspectClass(s.w, s.h);
      const a = decoAlpha(s);
      ctx.save(); ctx.globalAlpha = a;
      livingGradient(ctx, s, '#0d1220', '#0a0d18', '#07090f');
      const num = (s.reference.match(/\d+[:.]\d+(?:[-–]\d+)?|\d+$/) || [''])[0];
      const book = s.reference.replace(num, '').trim();
      const stacked = cls === 'vertical' || cls === 'portrait';
      const numSize = stacked ? s.w * 0.28 : s.h * 0.42;
      ctx.font = `200 ${numSize}px ${DISPLAY}`; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(s.accent, 0.22 + 0.04 * Math.sin(s.t * 0.5));
      const leftW = stacked ? s.w : Math.min(s.w * 0.42, s.h * 1.1);
      if (stacked) { ctx.textAlign = 'center'; ctx.fillText(num, s.w / 2, s.h * 0.3); }
      else { ctx.textAlign = 'right'; ctx.fillText(num, leftW, s.h * 0.62); }
      ctx.fillStyle = rgba('#ffffff', 0.7); ctx.font = `600 ${numSize * 0.11}px ${SANS}`;
      (ctx as any).letterSpacing = `${Math.round(numSize * 0.02)}px`;
      if (stacked) { ctx.fillText(book.toUpperCase(), s.w / 2, s.h * 0.36); } else { ctx.fillText(book.toUpperCase(), leftW, s.h * 0.7); }
      (ctx as any).letterSpacing = '0px';
      ctx.restore();
      const m = safe(s);
      const box = stacked ? { x: m, y: s.h * 0.42, w: s.w - m * 2, h: s.h * 0.48 } : { x: leftW + s.h * 0.08, y: s.h * 0.2, w: Math.min(s.w - leftW - s.h * 0.16 - m, s.h * 1.25), h: s.h * 0.6 };
      drawVerse(ctx, s, { ...box, align: stacked ? 'center' : 'left', valign: 'middle' }, { font: sz => `${sz}px ${SERIF}`, color: '#fff', max: stacked ? s.w * 0.07 : s.h * 0.075, min: s.h * 0.024 });
    },
  },

  // ── Art Council full pages ──
  {
    id: 'illuminated', name: 'Illuminated Page', family: 'Art Council', background: 'opaque', director: 'the Baroque Dramatist', animated: true,
    blurb: 'A manuscript page: gilded border, drop-cap initial, candle-warm vignette that slowly flickers.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      const m = safe(s);
      ctx.save(); ctx.globalAlpha = a;
      livingGradient(ctx, s, '#24160a', '#1a1008', '#100a05');
      const flick = 0.92 + 0.08 * Math.sin(s.t * 2.3) * Math.sin(s.t * 0.7);
      const rg = ctx.createRadialGradient(s.w / 2, s.h * 0.45, 0, s.w / 2, s.h * 0.45, Math.max(s.w, s.h) * 0.6);
      rg.addColorStop(0, `rgba(255,200,120,${0.12 * flick})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, s.w, s.h);
      // gilded double border with corner ornaments
      ctx.strokeStyle = rgba(GOLD, 0.85); ctx.lineWidth = Math.max(2, s.h * 0.003);
      ctx.strokeRect(m, m, s.w - m * 2, s.h - m * 2);
      ctx.lineWidth = Math.max(1, s.h * 0.0012); ctx.strokeRect(m * 1.35, m * 1.35, s.w - m * 2.7, s.h - m * 2.7);
      for (const [cx, cy] of [[m, m], [s.w - m, m], [m, s.h - m], [s.w - m, s.h - m]]) {
        ctx.beginPath(); ctx.arc(cx, cy, m * 0.28, 0, Math.PI * 2); ctx.fillStyle = rgba(GOLD, 0.9); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, m * 0.14, 0, Math.PI * 2); ctx.fillStyle = '#1a1008'; ctx.fill();
      }
      ctx.restore();
      drawReferenceLead(ctx, s, GOLD);
      // drop cap: first letter large in gold, verse beside/below
      const first = s.text.charAt(0), rest = s.text.slice(1);
      const cls = aspectClass(s.w, s.h);
      const bw = measure(s.w, s.h, 0.74), bx = (s.w - bw) / 2;
      const capSize = cls === 'vertical' ? s.w * 0.22 : s.h * 0.24;
      ctx.save(); ctx.globalAlpha = a * easeOut(s.enterP * 2) * (1 - easeInOut(s.exitP));
      ctx.font = `italic ${capSize}px ${SERIF}`; ctx.fillStyle = GOLD; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(255,190,90,0.35)'; ctx.shadowBlur = capSize * 0.12;
      const capW = ctx.measureText(first).width;
      ctx.fillText(first, bx, s.h * 0.24 + capSize * 0.8);
      ctx.restore();
      const r = drawVerse(ctx, { ...s, text: rest }, { x: bx + capW + capSize * 0.08, y: s.h * 0.24, w: bw - capW - capSize * 0.08, h: s.h * 0.5, align: 'left', valign: 'top' }, { font: sz => `${sz}px ${SERIF}`, color: '#F6E9CF', lh: 1.36, max: cls === 'vertical' ? s.w * 0.06 : s.h * 0.064, min: s.h * 0.024 });
      drawReference(ctx, s, s.w / 2, Math.min(s.h - m * 2, r.bottom + r.size * 1.6), 'center', Math.max(12, r.size * 0.42), GOLD, { font: `italic ${Math.max(12, r.size * 0.5)}px ${SERIF}`, upper: false, tracking: 0.04 });
      drawCopyright(ctx, s, s.w / 2, s.h - m * 0.45, 'center', 'rgba(246,233,207,0.45)');
    },
  },
  {
    id: 'swiss', name: 'Swiss Grid', family: 'Art Council', background: 'opaque', director: 'the Radical Minimalist', animated: true,
    blurb: 'A strict grid, one red rule, oversized reference numerals — the verse set flush-left in a disciplined column.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      const cls = aspectClass(s.w, s.h);
      const m = safe(s);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#F2F0EB'; ctx.fillRect(0, 0, s.w, s.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
      const cols = cls === 'vertical' ? 4 : cls === 'wall' ? 16 : 12;
      for (let i = 1; i < cols; i++) { const x = (s.w / cols) * i; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s.h); ctx.stroke(); }
      const ruleW = s.w * 0.22 * easeOut(s.enterP * 1.5) * (1 - easeInOut(s.exitP));
      ctx.fillStyle = '#E3261F'; ctx.fillRect(m, s.h * 0.18, ruleW, Math.max(3, s.h * 0.008));
      const num = (s.reference.match(/\d+[:.]\d+/) || [''])[0];
      ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.font = `700 ${cls === 'vertical' ? s.w * 0.4 : s.h * 0.62}px ${GROTESK}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      const drift = Math.sin(s.t * 0.05) * s.w * 0.01;
      ctx.fillText(num, s.w - m + drift, s.h - m);
      ctx.restore();
      const colW = cls === 'vertical' || cls === 'portrait' ? s.w - m * 2 : Math.min(s.w * 0.62, s.h * 1.45);
      const r = drawVerse(ctx, s, { x: m, y: s.h * 0.24, w: colW, h: s.h * 0.56, align: 'left', valign: 'top' }, { font: sz => `500 ${sz}px ${GROTESK}`, color: '#111', lh: 1.22, max: cls === 'vertical' ? s.w * 0.075 : s.h * 0.075, min: s.h * 0.024 });
      drawReference(ctx, s, m, r.bottom + r.size * 1.2, 'left', Math.max(12, r.size * 0.38), '#E3261F', { font: `700 ${Math.max(12, r.size * 0.38)}px ${GROTESK}`, tracking: 0.12 });
      drawCopyright(ctx, s, s.w - m, s.h - m * 0.4, 'right', 'rgba(0,0,0,0.4)');
    },
  },
  {
    id: 'futurist', name: 'Horizon Lines', family: 'Art Council', background: 'opaque', director: 'the Futurist', animated: true,
    blurb: 'Speed-lines and a horizon of light travelling slowly; the verse set clean and confident above it.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#070b16'; ctx.fillRect(0, 0, s.w, s.h);
      const hy = s.h * 0.78;
      for (let i = 0; i < 26; i++) {
        const y = hy + Math.pow(i / 26, 2) * (s.h - hy);
        ctx.strokeStyle = `rgba(92,225,230,${0.05 + 0.18 * (i / 26)})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s.w, y); ctx.stroke();
      }
      const off = (s.t * 0.06) % 1;
      for (let i = -12; i <= 12; i++) {
        const x = s.w / 2 + (i + off) * s.w * 0.08;
        ctx.strokeStyle = 'rgba(92,225,230,0.12)';
        ctx.beginPath(); ctx.moveTo(s.w / 2 + (x - s.w / 2) * 0.05, hy); ctx.lineTo(x * 1.0 + (x - s.w / 2) * 2, s.h); ctx.stroke();
      }
      const gl = ctx.createLinearGradient(0, hy - s.h * 0.02, 0, hy + s.h * 0.02);
      gl.addColorStop(0, 'rgba(92,225,230,0)'); gl.addColorStop(0.5, 'rgba(92,225,230,0.65)'); gl.addColorStop(1, 'rgba(92,225,230,0)');
      ctx.fillStyle = gl; ctx.fillRect(0, hy - s.h * 0.02, s.w, s.h * 0.04);
      ctx.restore();
      drawReferenceLead(ctx, s, '#5CE1E6');
      centredVerse(ctx, s, { font: sz => `400 ${sz}px ${DISPLAY}`, refColor: '#5CE1E6', yC: 0.4, boxH: 0.5, refFont: `500 {s}px ${MONO}` });
    },
  },
  {
    id: 'codex', name: 'Codex', family: 'Art Council', background: 'opaque', director: 'the Classical Mind', animated: true,
    blurb: 'Symmetry and proportion: fine double rules, small-caps reference, a page that breathes very slowly.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      const m = safe(s);
      ctx.save(); ctx.globalAlpha = a;
      livingGradient(ctx, s, '#13151c', '#0f1117', '#0b0c11');
      const bw = measure(s.w, s.h, 0.74);
      const x = (s.w - bw) / 2;
      ctx.strokeStyle = 'rgba(232,226,208,0.5)'; ctx.lineWidth = Math.max(1, s.h * 0.0012);
      for (const y of [s.h * 0.17, s.h * 0.175, s.h * 0.83, s.h * 0.825]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + bw, y); ctx.stroke(); }
      ctx.fillStyle = rgba('#E8E2D0', 0.55);
      ctx.beginPath(); ctx.arc(s.w / 2, s.h * 0.1725, s.h * 0.006, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      drawReferenceLead(ctx, s, '#E8E2D0');
      const r = drawVerse(ctx, s, { x, y: s.h * 0.22, w: bw, h: s.h * 0.5, align: 'center' }, { font: sz => `${sz}px ${SERIF}`, color: '#F3EEE0', lh: 1.4, max: aspectClass(s.w, s.h) === 'vertical' ? s.w * 0.065 : s.h * 0.066, min: s.h * 0.024 });
      drawReference(ctx, s, s.w / 2, s.h * 0.79, 'center', Math.max(12, r.size * 0.38), '#E8E2D0', { font: `${Math.max(12, r.size * 0.4)}px ${SERIF}`, tracking: 0.3 });
      drawCopyright(ctx, s, s.w / 2, s.h - m * 0.45, 'center');
    },
  },
  {
    id: 'zine', name: 'Paste-Up', family: 'Art Council', background: 'opaque', director: 'the Rebellious Hand', animated: true,
    blurb: 'Torn paper and tape on a dark wall — raw energy, but the verse sits on a clean, steady plate.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#16141a'; ctx.fillRect(0, 0, s.w, s.h);
      const shapes = 7;
      for (let i = 0; i < shapes; i++) {
        const seed = i * 97.31;
        const cx = ((Math.sin(seed) + 1) / 2) * s.w, cy = ((Math.cos(seed * 1.3) + 1) / 2) * s.h;
        const rw = s.w * (0.18 + 0.1 * Math.abs(Math.sin(seed * 2))), rh = s.h * (0.12 + 0.1 * Math.abs(Math.cos(seed)));
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(seed) * 0.4 + Math.sin(s.t * 0.1 + i) * 0.01);
        ctx.fillStyle = i % 3 === 0 ? 'rgba(227,38,31,0.5)' : i % 3 === 1 ? 'rgba(242,237,228,0.08)' : 'rgba(245,197,66,0.12)';
        ctx.beginPath(); ctx.moveTo(-rw / 2, -rh / 2);
        for (let k = 0; k <= 8; k++) ctx.lineTo(-rw / 2 + (rw * k) / 8, -rh / 2 + ((k % 2) - 0.5) * rh * 0.06);
        ctx.lineTo(rw / 2, rh / 2); ctx.lineTo(-rw / 2, rh / 2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      const cls = aspectClass(s.w, s.h);
      const bw = measure(s.w, s.h, 0.78);
      const f = fit(ctx, s.text, sz => `700 ${sz}px ${SANS}`, bw * 0.88, s.h * 0.5, 1.25, cls === 'vertical' ? s.w * 0.07 : s.h * 0.07, s.h * 0.024);
      const ph = f.lines.length * f.size * 1.25 + f.size * 3;
      const px = (s.w - bw) / 2, py = s.h * 0.46 - ph / 2;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(s.w / 2, s.h * 0.46); ctx.rotate(-0.012); ctx.translate(-s.w / 2, -s.h * 0.46);
      ctx.fillStyle = '#F2EDE4'; ctx.fillRect(px, py, bw, ph);
      ctx.fillStyle = 'rgba(245,197,66,0.6)'; ctx.fillRect(px + bw * 0.42, py - f.size * 0.3, bw * 0.16, f.size * 0.6);
      ctx.restore();
      drawReferenceLead(ctx, s, '#F2EDE4');
      const r = drawVerse(ctx, s, { x: px + bw * 0.06, y: py + f.size * 0.8, w: bw * 0.88, h: ph - f.size * 2.4, align: 'left', valign: 'top' }, { font: sz => `700 ${sz}px ${SANS}`, color: '#111', lh: 1.25, max: f.size, min: s.h * 0.022 });
      drawReference(ctx, s, px + bw * 0.06, r.bottom + f.size * 0.85, 'left', Math.max(12, f.size * 0.42), '#E3261F', { font: `900 ${Math.max(12, f.size * 0.42)}px ${SANS}` });
    },
  },
  {
    id: 'woven', name: 'Woven Geometry', family: 'Art Council', background: 'opaque', director: 'the World-Eclectic Traveller', animated: true,
    blurb: 'A slow-turning lattice of geometric bands frames a warm, quiet reading field.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      const m = safe(s);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#1b1220'; ctx.fillRect(0, 0, s.w, s.h);
      const band = Math.min(s.w, s.h) * 0.07;
      const cols = ['#C9853A', '#7A2E3B', '#2F6F6A', '#E0C27A'];
      const shift = (s.t * 6) % (band * 4);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, s.w, band); ctx.rect(0, s.h - band, s.w, band); ctx.clip();
      for (let x = -band * 4 + shift; x < s.w + band * 4; x += band) {
        const i = Math.floor((x - shift) / band) & 3;
        ctx.fillStyle = rgba(cols[(i + 4) % 4], 0.55);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + band, 0); ctx.lineTo(x + band / 2, band); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - shift * 2 % band, s.h); ctx.lineTo(x + band - shift * 2 % band, s.h); ctx.lineTo(x + band / 2 - shift * 2 % band, s.h - band); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(224,194,122,0.5)'; ctx.fillRect(0, band, s.w, 2); ctx.fillRect(0, s.h - band - 2, s.w, 2);
      ctx.restore();
      drawReferenceLead(ctx, s, '#E0C27A');
      centredVerse(ctx, s, { color: '#F7EEDC', refColor: '#E0C27A', boxH: 0.52 });
      void m;
    },
  },

  // ── Typographic: the verse's own type becomes the background art ──
  {
    id: 'type-field', name: 'Word Field', family: 'Typographic', background: 'opaque', animated: true,
    blurb: 'The rest of the chapter drifts in giant, faint type behind a frosted reading plate.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      const mt = motionT(s);
      ctx.save(); ctx.globalAlpha = a;
      livingGradient(ctx, { ...s, t: mt }, '#0f0b1e', '#0a0815', '#05040b');
      const source = contextText(s);
      const words = source.toUpperCase().replace(/[^A-Z' ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
      const rows = aspectClass(s.w, s.h) === 'vertical' ? 9 : 6;
      for (let r = 0; r < rows; r++) {
        const size = s.h * (rows > 6 ? 0.08 : 0.15) * (1 + 0.3 * (r % 3) / 2);
        ctx.font = `800 ${size}px ${DISPLAY}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        const off = (r * 7) % Math.max(1, words.length);
        const line = words.slice(off).concat(words.slice(0, off)).join('  ·  ') || 'SELAH';
        const lw = ctx.measureText(line).width || 1;
        // subtle–moderate drift; alternate directions per row
        const speed = (r % 2 ? 1 : -1) * s.h * 0.022 * (1 + r * 0.12);
        let x = (((mt * speed) % lw) + lw) % lw - lw;
        const y = (s.h / rows) * (r + 0.5);
        const gr = ctx.createLinearGradient(0, 0, s.w, 0);
        gr.addColorStop(0, rgba(s.accent, 0.02)); gr.addColorStop(0.5, rgba(s.accent, 0.12)); gr.addColorStop(1, rgba(s.accent, 0.02));
        ctx.fillStyle = gr;
        for (; x < s.w; x += lw) ctx.fillText(line, x, y);
      }
      ctx.restore();
      readingPlate(ctx, s, a);
    },
  },
  {
    id: 'type-monolith', name: 'Monolith', family: 'Typographic', background: 'opaque', animated: true,
    blurb: 'A key word from the surrounding verses, monumental, cut as a window onto moving light — the verse reads on a plate below.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      const mt = motionT(s);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#07060c'; ctx.fillRect(0, 0, s.w, s.h);
      // Strong words from the neighbouring verses; one leads at a time and
      // they hand over slowly (faster during transitions, via the motion clock).
      const pool = keyWords(contextText(s), 8);
      const slot = mt / 9;
      const i0 = Math.floor(slot) % pool.length, i1 = (i0 + 1) % pool.length;
      const blend = clamp01((slot % 1 - 0.8) / 0.2);
      const cls = aspectClass(s.w, s.h);
      const drawWord = (word: string, alpha: number) => {
        if (alpha <= 0.01) return;
        let size = cls === 'vertical' ? s.w * 0.3 : s.h * 0.5;
        ctx.font = `900 ${size}px ${DISPLAY}`;
        while (ctx.measureText(word).width > s.w * 0.94 && size > s.h * 0.08) { size *= 0.92; ctx.font = `900 ${size}px ${DISPLAY}`; }
        const off = scratch(s.w, s.h);
        const o = off.getContext('2d')!;
        o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, s.w, s.h);
        const lg = o.createLinearGradient(s.w * (Math.sin(mt * 0.35) * 0.5), 0, s.w * (1 + Math.cos(mt * 0.3) * 0.5), s.h);
        lg.addColorStop(0, rgba(s.accent, 0.6)); lg.addColorStop(0.5, 'rgba(111,76,255,0.5)'); lg.addColorStop(1, 'rgba(0,218,243,0.45)');
        o.fillStyle = lg; o.fillRect(0, 0, s.w, s.h);
        o.globalCompositeOperation = 'destination-in';
        o.font = `900 ${size}px ${DISPLAY}`; o.textAlign = 'center'; o.textBaseline = 'middle';
        o.fillText(word, s.w / 2 + Math.sin(mt * 0.12) * s.w * 0.015, cls === 'vertical' ? s.h * 0.3 : s.h * 0.4);
        ctx.globalAlpha = a * 0.55 * alpha; ctx.drawImage(off, 0, 0);
      };
      drawWord(pool[i0], 1 - blend);
      drawWord(pool[i1], blend);
      ctx.restore();
      readingPlate(ctx, s, a, cls === 'vertical' ? 0.66 : 0.68);
    },
  },
  {
    id: 'type-orbit', name: 'Orbit', family: 'Typographic', background: 'opaque', animated: true,
    blurb: 'The surrounding verses written around slowly turning rings — a halo of the chapter, with the verse readable at the centre.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      const mt = motionT(s);
      ctx.save(); ctx.globalAlpha = a;
      livingGradient(ctx, { ...s, t: mt }, '#0b0d1c', '#080914', '#05060c');
      const ctxVerses = s.context?.length ? s.context : [s.text];
      const R = Math.min(s.w, s.h);
      for (let ring = 0; ring < 4; ring++) {
        const radius = R * (0.32 + ring * 0.14);
        const size = R * (0.022 + ring * 0.004);
        const text = (ctxVerses[ring % ctxVerses.length] + '   ✦   ').toUpperCase();
        ctx.font = `600 ${size}px ${GROTESK}`; ctx.fillStyle = rgba(s.accent, 0.18 - ring * 0.03);
        const dir = ring % 2 ? -1 : 1;
        let ang = dir * mt * (0.05 - ring * 0.008);
        const end = ang + Math.PI * 2;
        for (let i = 0; ang < end && i < 2000; i++) {
          const ch = text[i % text.length];
          const cw = ctx.measureText(ch).width;
          ctx.save(); ctx.translate(s.w / 2 + Math.cos(ang) * radius, s.h / 2 + Math.sin(ang) * radius); ctx.rotate(ang + Math.PI / 2);
          ctx.fillText(ch, 0, 0); ctx.restore();
          ang += (cw + size * 0.08) / radius;
        }
      }
      ctx.restore();
      readingPlate(ctx, s, a, 0.5, true);
    },
  },
  {
    id: 'type-columns', name: 'Manuscript Wall', family: 'Typographic', background: 'opaque', animated: true,
    blurb: 'The whole chapter in small numbered verses climbs slowly up a scriptorium wall; the verse being read sits large on a plate.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      const mt = motionT(s);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = '#0d0a07'; ctx.fillRect(0, 0, s.w, s.h);
      const size = Math.max(10, s.h * 0.018), lh = size * 1.5;
      ctx.font = `${size}px ${SERIF}`; ctx.fillStyle = 'rgba(232,210,170,0.15)'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const colW = size * 18;
      const body = (s.context?.length ? s.context.join('  ') : s.text) + '  ✦  ';
      const lines = wrap(ctx, body.repeat(s.context?.length ? 2 : 6), colW);
      const ncols = Math.ceil(s.w / (colW + size * 2)) + 1;
      for (let c = 0; c < ncols; c++) {
        const x = c * (colW + size * 2) + size;
        const speed = s.h * (0.02 + 0.008 * (c % 3));
        const total = Math.max(lh, lines.length * lh);
        const y0 = -((mt * speed + c * 137) % total);
        for (let y = y0, i = Math.floor(c * 11); y < s.h; y += lh, i++) ctx.fillText(lines[i % lines.length], x, y);
      }
      const vg = ctx.createRadialGradient(s.w / 2, s.h / 2, s.h * 0.2, s.w / 2, s.h / 2, Math.max(s.w, s.h) * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, s.w, s.h);
      ctx.restore();
      readingPlate(ctx, s, a);
    },
  },
  {
    id: 'type-volume', name: 'Type Volume', family: 'Typographic', background: 'opaque', animated: true, typoVolume: 'DNA_HELIX',
    blurb: 'Chora\'s 3D kinetic-type engine spells the surrounding verses in a slow helix behind a frosted plate — and moves with the music.',
    draw(ctx, s) {
      const a = decoAlpha(s);
      ctx.save(); ctx.globalAlpha = a;
      if (s.typoFrame) {
        // cover-fit the TYPO frame, dimmed so it stays atmosphere
        const img: any = s.typoFrame;
        const iw = img.width || s.w, ih = img.height || s.h;
        const k = Math.max(s.w / iw, s.h / ih);
        ctx.drawImage(img, (s.w - iw * k) / 2, (s.h - ih * k) / 2, iw * k, ih * k);
        ctx.fillStyle = 'rgba(4,3,10,0.35)'; ctx.fillRect(0, 0, s.w, s.h);
      } else {
        livingGradient(ctx, { ...s, t: motionT(s) }, '#0d0a1c', '#08070f', '#040309');
      }
      ctx.restore();
      readingPlate(ctx, s, a);
    },
  },
];

// Modern/postmodern/abstract Art Council pieces and the urban/grunge set live in
// their own files (services/ambo/scriptureLooks/) and join the registry here.
SCRIPTURE_LAYOUTS.push(...MODERN_ABSTRACT_LAYOUTS, ...URBAN_GRUNGE_LAYOUTS);

export const DEFAULT_SCRIPTURE_LAYOUT = 'sanctuary';

export function scriptureLayoutById(id?: string): ScriptureLayout {
  return SCRIPTURE_LAYOUTS.find(l => l.id === id) ?? SCRIPTURE_LAYOUTS.find(l => l.id === DEFAULT_SCRIPTURE_LAYOUT)!;
}

/** Draw one frame of a scripture layout. Never throws (a look must not kill an output). */
export function renderScripture(ctx: CanvasRenderingContext2D, layoutId: string | undefined, s: ScriptureState): void {
  ctx.save();
  try { scriptureLayoutById(layoutId).draw(ctx, s); }
  catch (e) { /* fall back to the plain default rather than black */ try { scriptureLayoutById(DEFAULT_SCRIPTURE_LAYOUT).draw(ctx, s); } catch { /* */ } }
  ctx.restore();
}

/** Public-domain (KJV) sample for previews and galleries. */
export const SAMPLE_SCRIPTURE = {
  text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.',
  reference: 'Jeremiah 29:11',
  translation: 'KJV',
};
