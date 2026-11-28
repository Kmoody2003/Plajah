// Cinematic Story — the scripture look built to read a passage over a painted
// story scene (pairs with the 'cine-story' slide template, which carries the
// scene and its heading).
//
// The Classical Mind's rules: the verse keeps the line breaks it was given,
// breaking at natural phrases instead of re-wrapping to a measure. It sits in a
// calm centred column on the wall, high-contrast warm ivory over a soft local
// shade, with no plate or box. The reference reads as "GENESIS 24:4   KJV" under
// a small glinting gold rule. Only light moves: the shade breathes and the rule
// glints. Words never move while held. On narrow outputs the lines shrink or
// re-wrap to fit, so nothing is clipped.
import {
  type ScriptureLayout, type ScriptureState,
  clamp01, easeOut, decoAlpha, fit, wrap, wordFx, drawReferenceLead, drawCopyright, safe, motionT, rgba,
} from '../scriptureKit';
import { ensureFontsLoaded } from '../../tela/telaFonts';

// The look sets its verse in Lora and its reference in Inter; ask for both up front
// (the look is animated, so it redraws in the real faces as soon as they arrive).
if (typeof document !== 'undefined') { try { ensureFontsLoaded(['lora', 'libreBaskerville', 'inter']); } catch { /* fallbacks are fine */ } }

type C = CanvasRenderingContext2D;
const VERSE_FONT = (sz: number) => `400 ${sz}px "Lora", "Libre Baskerville", Georgia, serif`;
const REF_FONT = (sz: number) => `600 ${sz}px "Inter", "Segoe UI", Arial, sans-serif`;
const IVORY = '#FFF9EE', REF_GOLD = '#FFE2A5';

/** Authored lines when they still describe `s.text`; otherwise null (re-wrap). */
function authored(s: ScriptureState): string[] | null {
  const ls = (s.lines ?? []).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (ls.length < 2) return null;
  return ls.join(' ') === s.text.replace(/\s+/g, ' ').trim() ? ls : null;
}

function drawLines(ctx: C, s: ScriptureState, lines: string[], size: number, cx: number, top: number, lh: number) {
  ctx.font = VERSE_FONT(size);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const space = ctx.measureText(' ').width;
  const total = lines.reduce((n, l) => n + l.split(' ').length, 0);
  let wi = 0;
  lines.forEach((line, li) => {
    const words = line.split(' ');
    const widths = words.map(w => ctx.measureText(w).width);
    const lineW = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
    const x0 = cx - lineW / 2, baseY = top + li * size * lh + size * .98;
    let x = x0;
    words.forEach((word, k) => {
      // Letter cascade has no per-word form; it reads as a soft per-word rise here.
      const fx = wordFx({ ...s, transition: s.transition === 'cascade' ? 'rise' : s.transition }, wi, total, li, lines.length, size, s.w, lineW ? (x - x0 + widths[k] / 2) / lineW : 0);
      if (fx.a > .003) {
        ctx.save();
        ctx.globalAlpha = fx.a;
        if (fx.blur > .4) ctx.filter = `blur(${fx.blur.toFixed(1)}px)`;
        ctx.shadowColor = 'rgba(10,7,4,0.82)'; ctx.shadowBlur = size * .3; ctx.shadowOffsetY = size * .06;
        ctx.fillStyle = IVORY;
        ctx.fillText(word, x + fx.dx + fx.track * (k - (words.length - 1) / 2), baseY + fx.dy);
        ctx.restore();
      }
      x += widths[k] + space; wi++;
    });
  });
}

function drawStoryReference(ctx: C, s: ScriptureState, cx: number, y: number, size: number) {
  const ref = (s.reference || '').toUpperCase() + (s.translation ? `   ${s.translation.toUpperCase()}` : '');
  if (!ref.trim()) return;
  const exiting = s.exitP > 0, p = exiting ? 1 - s.exitP : s.enterP;
  const a = s.transition === 'crossfade' ? easeOut(p) : easeOut(clamp01((p - .35) / .65));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = REF_FONT(size);
  (ctx as any).letterSpacing = `${Math.round(size * .14)}px`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let k = Math.min(3, Math.max(.5, s.refScale ?? 1));
  const tw = ctx.measureText(ref).width;
  if (tw * k > s.w * .9) k = (s.w * .9) / tw;
  ctx.translate(cx, y); ctx.scale(k, k);
  ctx.shadowColor = 'rgba(10,7,4,0.8)'; ctx.shadowBlur = size * .35;
  ctx.fillStyle = REF_GOLD;
  ctx.fillText(ref, 0, 0);
  (ctx as any).letterSpacing = '0px';
  ctx.restore();
}

function goldRule(ctx: C, s: ScriptureState, cx: number, y: number, w: number) {
  const a = decoAlpha(s);
  if (a <= 0) return;
  const t = motionT(s), th = Math.max(2, s.h * .0028), d = s.h * .006;
  const grow = easeOut(clamp01(s.enterP * 1.4));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = REF_GOLD;
  ctx.fillRect(cx - w / 2 * grow, y - th / 2, w * grow, th);
  ctx.translate(cx, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-d, -d, d * 2, d * 2);
  ctx.restore();
  // Glint: a soft highlight crossing the rule every few seconds.
  const cyc = ((t / 6.5) % 1 + 1) % 1, gx = cx - w / 2 - w * .3 + cyc * w * 1.6;
  ctx.save();
  ctx.globalAlpha = a * .9; ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(gx - w * .25, 0, gx + w * .25, 0);
  g.addColorStop(0, 'rgba(255,241,207,0)'); g.addColorStop(.5, 'rgba(255,241,207,0.9)'); g.addColorStop(1, 'rgba(255,241,207,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - w / 2, y - th, w, th * 2);
  ctx.restore();
}

export const CINEMATIC_STORY_LAYOUTS: ScriptureLayout[] = [
  {
    id: 'story-verse', name: 'Story Verse', family: 'Art Council', background: 'transparent', director: 'the Classical Mind', animated: true,
    blurb: 'Reads over a painted story scene: authored line breaks, warm ivory serif in a softly shaded centre, and a gold-ruled "GENESIS 24:4   KJV" reference. Pairs with the Cinematic Story Scene slide.',
    draw(ctx, s) {
      const a = decoAlpha(s), t = motionT(s);
      const cx = s.w / 2, k = s.h / 1080;
      // Soft local shade behind the words only, breathing very slightly.
      ctx.save();
      ctx.globalAlpha = a * (.42 + .03 * Math.sin(t * .37));
      ctx.translate(cx, s.h * .47); ctx.scale(Math.min(s.w * .36, s.h * 1.25), s.h * .36);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      rg.addColorStop(0, 'rgba(10,7,4,0.9)'); rg.addColorStop(.6, 'rgba(10,7,4,0.5)'); rg.addColorStop(1, 'rgba(10,7,4,0)');
      ctx.fillStyle = rg; ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();

      drawReferenceLead(ctx, s, REF_GOLD);

      // The verse column: designed at 66 px on a 1080 row, 96 px leading, centred on y = 480.
      const maxW = Math.min(s.w - safe(s) * 2, s.h * 2.1);
      const lh = 96 / 66, yC = s.h * (480 / 1080), maxH = s.h * .36;
      let lines = authored(s), size = 66 * k;
      if (lines) {
        ctx.font = VERSE_FONT(size);
        const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
        if (widest > maxW) size *= maxW / widest;
        if (lines.length * size * lh > maxH) size = maxH / (lines.length * lh);
        // Far too small to read: honour the measure instead of the breaks.
        if (size < 44 * k) lines = null;
      }
      if (!lines) {
        const r = fit(ctx, s.text, VERSE_FONT, maxW, maxH, lh, 66 * k, 30 * k);
        size = r.size; lines = r.lines.length ? r.lines : wrap(ctx, s.text, maxW);
      }
      const top = yC - (lines.length * size * lh) / 2;
      drawLines(ctx, s, lines, size, cx, top, lh);

      goldRule(ctx, s, cx, s.h * (672 / 1080), 90 * k);
      drawStoryReference(ctx, s, cx, s.h * (740 / 1080), 44 * k);
      drawCopyright(ctx, s, cx, s.h - safe(s) * .5, 'center', rgba('#FFFFFF', .45));
    },
  },
];
