// flyerPresets — themed flyers, posters and a one-page newsletter for announcements.
//
// Each preset is a designer that turns the composer's fields into a Tela page (vector objects)
// plus a living page (services/living/contracts) so the flyer stays interactive when it is read:
// the headline rises in, ornaments drift, the call-to-action glows on hover and fires
// `flyer:cta` when tapped (the reader opens the link). Objects carry stable labels so the
// behaviours survive edits in Tela. Text is whatever the author typed; empty fields fall back to
// a neutral prompt ("Your headline") so nothing pretends to be real event data.
import type { TelaDoc, TelaVectorObject } from '../../types';
import type { Behavior, LivingBook, LivingPage } from '../living/contracts';
import { rect, circle, ellipse, path, text, below, hr, alpha, mix } from '../tela/templateKit';
import { starPath, rng } from '../tela/ornaments';
import { newTelaId } from '../telaStore';

export interface FlyerFields {
  headline: string;
  kicker?: string;
  when?: string;
  where?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Org or class name printed in the footer. */
  footer?: string;
}

export type FlyerKind = 'FLYER' | 'POSTER' | 'NEWSLETTER' | 'ANNOUNCEMENT';

export interface FlyerPreset {
  id: string;
  name: string;
  kind: FlyerKind;
  blurb: string;
  /** Swatch for the picker: [paper, ink, accent]. */
  swatch: [string, string, string];
  width: number;
  height: number;
  defaults: Partial<FlyerFields>;
  build: (f: FlyerFields) => { objects: TelaVectorObject[]; living: LivingPage };
}

const or = (v: string | undefined, d: string) => (v && v.trim() ? v.trim() : d);

// ── shared behaviours ─────────────────────────────────────────────────────────
function standardLiving(f: FlyerFields, extra: Behavior[] = []): LivingPage {
  const b: Behavior[] = [
    { id: 'in-kicker', target: { label: 'Kicker' }, on: { type: 'enter' }, do: [{ do: 'animate', target: { label: 'Kicker' }, anim: { preset: 'fade-in', durationMs: 500 } }], once: true },
    { id: 'in-headline', target: { label: 'Headline' }, on: { type: 'enter' }, do: [{ do: 'animate', target: { label: 'Headline' }, anim: { preset: 'rise', durationMs: 700, delayMs: 120, easing: 'ease-out' } }], once: true },
    { id: 'in-details', target: { label: 'Details*' }, on: { type: 'enter' }, do: [{ do: 'animate', target: { label: 'Details*' }, anim: { preset: 'fade-in', durationMs: 600, delayMs: 380 } }], once: true },
    { id: 'drift', target: { label: 'Spark*' }, on: { type: 'idle' }, do: [{ do: 'animate', target: { label: 'Spark*' }, anim: { preset: 'float', amount: .6, durationMs: 4200, loop: 'infinite', direction: 'alternate' } }] },
    { id: 'hover-when', target: { label: 'Details card' }, on: { type: 'hover' }, do: [{ do: 'animate', target: { label: 'Details card' }, anim: { preset: 'grow', amount: .25, durationMs: 260 } }], cooldownMs: 600 },
  ];
  if (f.ctaLabel?.trim()) {
    b.push(
      { id: 'hover-cta', target: { label: 'CTA*' }, on: { type: 'hover' }, do: [{ do: 'animate', target: { label: 'CTA*' }, anim: { preset: 'pulse', amount: .5, durationMs: 520 } }], cooldownMs: 700 },
      { id: 'tap-cta', target: { label: 'CTA*' }, on: { type: 'tap' }, hint: f.ctaUrl ? `Open: ${f.ctaLabel.trim()}` : f.ctaLabel.trim(), do: [{ do: 'burst', at: { label: 'CTA' }, kind: 'confetti', count: 26 }, { do: 'emit', name: 'flyer:cta', payload: { url: f.ctaUrl || '' } }], reduced: [{ do: 'emit', name: 'flyer:cta', payload: { url: f.ctaUrl || '' } }], cooldownMs: 900 },
    );
  }
  return { page: 1, behaviors: [...b, ...extra], a11y: { summary: [f.kicker, f.headline, f.when, f.where].filter(Boolean).join(' · ') } };
}

function cta(x: number, y: number, w: number, label: string, fill: string, ink: string, font: string, rx = 999): TelaVectorObject[] {
  if (!label.trim()) return [];
  return [
    rect(x, y, w, 76, fill, { rx, label: 'CTA', role: 'ORNAMENT', shadow: { x: 0, y: 10, blur: 24, color: alpha('#000000', .22) } }),
    text(x, y + 22, w, label.trim(), { size: 28, font, weight: 800, color: ink, align: 'center', tracking: .04, wrap: false, label: 'CTA label', role: 'LABEL' }),
  ];
}

function detailsBlock(x: number, y: number, w: number, f: FlyerFields, o: { font: string; ink: string; muted: string; card?: string; size?: number; align?: 'left' | 'center' }): { objects: TelaVectorObject[]; bottom: number } {
  const size = o.size ?? 34;
  const lines = [f.when, f.where].filter(s => s && s.trim()) as string[];
  if (!lines.length) return { objects: [], bottom: y };
  const pad = o.card ? 28 : 0;
  const t = text(x + pad, y + pad, w - pad * 2, lines.join('\n'), { size, font: o.font, weight: 700, color: o.ink, align: o.align ?? 'left', leading: 1.3, label: 'Details · when & where' });
  const out: TelaVectorObject[] = [];
  if (o.card) out.push(rect(x, y, w, t.h + pad * 2, o.card, { rx: 22, label: 'Details card' }));
  out.push(t);
  return { objects: out, bottom: y + t.h + pad * 2 };
}

function bodyText(x: number, y: number, w: number, value: string | undefined, o: { font: string; color: string; size?: number; align?: 'left' | 'center'; max?: number }): TelaVectorObject[] {
  if (!value?.trim()) return [];
  const clipped = value.trim().slice(0, o.max ?? 320);
  return [text(x, y, w, clipped, { size: o.size ?? 26, font: o.font, weight: 400, color: o.color, align: o.align, leading: 1.45, label: 'Details · body' })];
}

function footer(W: number, H: number, value: string | undefined, color: string, font = 'inter'): TelaVectorObject[] {
  if (!value?.trim()) return [];
  return [text(60, H - 70, W - 120, value.trim(), { size: 20, font, weight: 700, color, align: 'center', tracking: .16, transform: 'uppercase', wrap: false, label: 'Footer', role: 'CAPTION' })];
}

const sparks = (seed: number, W: number, H: number, n: number, colors: string[], o: { star?: boolean; minR?: number; maxR?: number; avoid?: { y0: number; y1: number } } = {}): TelaVectorObject[] => {
  const r = rng(seed); const out: TelaVectorObject[] = [];
  for (let i = 0; i < n; i++) {
    const s = (o.minR ?? 8) + r() * ((o.maxR ?? 26) - (o.minR ?? 8));
    const x = r() * (W - s * 2) + s; let y = r() * (H - s * 2) + s;
    if (o.avoid && y > o.avoid.y0 && y < o.avoid.y1) y = r() < .5 ? o.avoid.y0 * r() : o.avoid.y1 + (H - o.avoid.y1) * r();
    const c = colors[i % colors.length];
    out.push(o.star ? path(x - s, y - s, s * 2, s * 2, starPath(5, .45), c, { opacity: .85, label: `Spark ${i + 1}` }) : circle(x, y, s, c, { opacity: .8, label: `Spark ${i + 1}` }));
  }
  return out;
};

const W = 1080, H = 1350;

// ── presets ───────────────────────────────────────────────────────────────────
export const FLYER_PRESETS: FlyerPreset[] = [
  {
    id: 'celebration', name: 'Celebration', kind: 'POSTER', blurb: 'Bold gradient poster for events and big news.',
    swatch: ['#2a0f4a', '#ffffff', '#ff4fd8'], width: W, height: H,
    defaults: { kicker: 'You’re invited', ctaLabel: 'RSVP' },
    build: f => {
      const bg = rect(0, 0, W, H, '#2a0f4a', { label: 'Background', gradient: { kind: 'LINEAR', angle: 135, stops: [{ offset: 0, color: '#ff2fb3' }, { offset: .5, color: '#7b2cff' }, { offset: 1, color: '#16c7ff' }] } });
      const glow = ellipse(-200, 760, 1100, 900, '#ffffff', { opacity: .08, blur: 40, label: 'Glow' });
      const kick = text(90, 150, W - 180, or(f.kicker, 'You’re invited'), { size: 32, font: 'outfit', weight: 800, color: '#ffffff', tracking: .22, transform: 'uppercase', label: 'Kicker' });
      const head = text(90, below(kick, 30), W - 180, or(f.headline, 'Your headline'), { size: 132, font: 'unbounded', weight: 800, color: '#ffffff', leading: .98, label: 'Headline' });
      const d = detailsBlock(90, below(head, 56), W - 180, f, { font: 'outfit', ink: '#ffffff', muted: '#ffffffcc', card: alpha('#ffffff', .14) });
      const body = bodyText(90, d.bottom + 34, W - 180, f.body, { font: 'outfit', color: alpha('#ffffff', .9) });
      const by = Math.min(H - 200, (body[0] ? below(body[0], 48) : d.bottom + 48));
      return { objects: [bg, glow, ...sparks(7, W, H, 14, ['#ffffff', '#ffe36e', '#7ef9ff'], { star: true, minR: 6, maxR: 18, avoid: { y0: 120, y1: by } }), kick, head, ...d.objects, ...body, ...cta(90, by, 360, f.ctaLabel || '', '#ffffff', '#5a12c9', 'outfit'), ...footer(W, H, f.footer, alpha('#ffffff', .8))], living: standardLiving(f, [
        { id: 'twinkle', target: { label: 'Spark*' }, on: { type: 'idle' }, do: [{ do: 'animate', target: { label: 'Spark*' }, anim: { preset: 'twinkle', durationMs: 2600, loop: 'infinite' } }] },
      ]) };
    },
  },
  {
    id: 'sanctuary', name: 'Evening light', kind: 'FLYER', blurb: 'Navy and gold, for services, concerts and holidays.',
    swatch: ['#0d1630', '#f4e3b2', '#d9b25f'], width: W, height: H,
    defaults: { kicker: 'Join us', ctaLabel: 'Add to calendar' },
    build: f => {
      const gold = '#d9b25f', cream = '#f4e3b2';
      const bg = rect(0, 0, W, H, '#0d1630', { label: 'Background', gradient: { kind: 'RADIAL', stops: [{ offset: 0, color: '#1d2b57' }, { offset: 1, color: '#070c1c' }] } });
      const frameO = rect(46, 46, W - 92, H - 92, 'none', { stroke: alpha(gold, .7), strokeWidth: 2, label: 'Frame' });
      const frameI = rect(62, 62, W - 124, H - 124, 'none', { stroke: alpha(gold, .3), strokeWidth: 1, label: 'Frame inner' });
      const star = path(W / 2 - 34, 150, 68, 68, starPath(8, .38), gold, { label: 'Spark star' });
      const kick = text(120, 260, W - 240, or(f.kicker, 'Join us'), { size: 30, font: 'cinzel', weight: 600, color: gold, align: 'center', tracking: .3, transform: 'uppercase', label: 'Kicker' });
      const head = text(110, below(kick, 26), W - 220, or(f.headline, 'Your headline'), { size: 104, font: 'cormorant', weight: 600, color: cream, align: 'center', leading: 1.02, label: 'Headline' });
      const rule = hr(W / 2 - 120, below(head, 40), 240, gold, 2, { label: 'Rule' });
      const d = detailsBlock(120, below(head, 80), W - 240, f, { font: 'cormorant', ink: cream, muted: gold, align: 'center', size: 40 });
      const body = bodyText(140, d.bottom + 30, W - 280, f.body, { font: 'ebGaramond', color: alpha(cream, .85), align: 'center', size: 28 });
      const by = Math.min(H - 220, body[0] ? below(body[0], 50) : d.bottom + 50);
      return { objects: [bg, ...sparks(19, W, H, 24, [alpha(cream, .7)], { minR: 1.5, maxR: 3.5, avoid: { y0: 140, y1: by + 80 } }), frameO, frameI, star, kick, head, rule, ...d.objects, ...body, ...cta(W / 2 - 220, by, 440, f.ctaLabel || '', gold, '#0d1630', 'cinzel', 8), ...footer(W, H - 30, f.footer, alpha(gold, .85), 'cinzel')], living: standardLiving(f, [
        { id: 'star-glow', target: { label: 'Spark star' }, on: { type: 'idle' }, do: [{ do: 'animate', target: { label: 'Spark star' }, anim: { preset: 'breathe', durationMs: 3600, loop: 'infinite' } }] },
        { id: 'star-tap', target: { label: 'Spark star' }, on: { type: 'tap' }, hint: 'Light the star', do: [{ do: 'burst', at: { label: 'Spark star' }, kind: 'sparkles', count: 22 }], cooldownMs: 800 },
      ]) };
    },
  },
  {
    id: 'sunny-kids', name: 'Sunny kids', kind: 'FLYER', blurb: 'Bright and round, for kids’ classes and family days.',
    swatch: ['#ffd84d', '#1f2a6b', '#ff6b4a'], width: W, height: H,
    defaults: { kicker: 'Kids & families', ctaLabel: 'Sign up' },
    build: f => {
      const ink = '#1f2a6b';
      const bg = rect(0, 0, W, H, '#ffd84d', { label: 'Background' });
      const blobs = [circle(980, 120, 220, '#ff6b4a', { label: 'Spark sun' }), circle(90, 1260, 260, '#4ac7ff', { opacity: .9, label: 'Spark pool' }), circle(900, 1180, 90, '#7bd96a', { label: 'Spark ball' }), circle(140, 220, 46, '#ffffff', { opacity: .8, label: 'Spark bubble' })];
      const card = rect(70, 300, W - 140, 760, '#ffffff', { rx: 48, label: 'Card', shadow: { x: 0, y: 18, blur: 0, color: ink } });
      const kick = text(120, 350, W - 240, or(f.kicker, 'Kids & families'), { size: 32, font: 'fredoka', weight: 700, color: '#ff6b4a', align: 'center', tracking: .06, label: 'Kicker' });
      const head = text(110, below(kick, 16), W - 220, or(f.headline, 'Your headline'), { size: 110, font: 'fredoka', weight: 700, color: ink, align: 'center', leading: 1, label: 'Headline' });
      const d = detailsBlock(140, below(head, 36), W - 280, f, { font: 'fredoka', ink, muted: ink, align: 'center', size: 36, card: '#fff4c2' });
      const body = bodyText(150, d.bottom + 24, W - 300, f.body, { font: 'nunito', color: alpha(ink, .85), align: 'center', size: 26, max: 220 });
      const by = Math.max(1100, Math.min(H - 190, (body[0] ? below(body[0], 40) : d.bottom + 40)));
      return { objects: [bg, ...blobs, card, kick, head, ...d.objects, ...body, ...cta(W / 2 - 190, by, 380, f.ctaLabel || '', '#ff6b4a', '#ffffff', 'fredoka'), ...footer(W, H, f.footer, ink, 'fredoka')], living: standardLiving(f, [
        { id: 'bounce', target: { label: 'Spark ball' }, on: { type: 'idle' }, do: [{ do: 'animate', target: { label: 'Spark ball' }, anim: { preset: 'bounce', durationMs: 1400, loop: 'infinite' } }] },
        { id: 'sun', target: { label: 'Spark sun' }, on: { type: 'idle' }, do: [{ do: 'animate', target: { label: 'Spark sun' }, anim: { preset: 'spin', amount: .2, durationMs: 24000, loop: 'infinite' } }] },
        { id: 'bubble-tap', target: { label: 'Spark bubble' }, on: { type: 'tap' }, hint: 'Pop the bubble', do: [{ do: 'burst', at: { label: 'Spark bubble' }, kind: 'bubbles', count: 18 }, { do: 'animate', target: { label: 'Spark bubble' }, anim: { preset: 'jelly', durationMs: 600 } }], cooldownMs: 600 },
      ]) };
    },
  },
  {
    id: 'notice', name: 'Notice board', kind: 'ANNOUNCEMENT', blurb: 'Clean paper notice for class and staff updates.',
    swatch: ['#f7f3ea', '#1d1b18', '#b4472b'], width: W, height: H,
    defaults: { kicker: 'Announcement' },
    build: f => {
      const ink = '#1d1b18', red = '#b4472b';
      const bg = rect(0, 0, W, H, '#f7f3ea', { label: 'Background' });
      const band = rect(0, 0, W, 18, red, { label: 'Top band' });
      const kick = text(100, 140, W - 200, or(f.kicker, 'Announcement'), { size: 26, font: 'inter', weight: 800, color: red, tracking: .24, transform: 'uppercase', label: 'Kicker' });
      const r1 = hr(100, below(kick, 22), W - 200, ink, 3, { label: 'Rule' });
      const head = text(100, below(kick, 56), W - 200, or(f.headline, 'Your headline'), { size: 96, font: 'playfair', weight: 800, color: ink, leading: 1.04, label: 'Headline' });
      const d = detailsBlock(100, below(head, 44), W - 200, f, { font: 'inter', ink, muted: ink, size: 32, card: mix('#f7f3ea', -0.05) });
      const body = bodyText(100, d.bottom + 36, W - 200, f.body, { font: 'libreBaskerville', color: alpha(ink, .88), size: 27, max: 520 });
      const by = Math.min(H - 200, body[0] ? below(body[0], 48) : d.bottom + 48);
      return { objects: [bg, band, kick, r1, head, ...d.objects, ...body, ...cta(100, by, 360, f.ctaLabel || '', ink, '#f7f3ea', 'inter', 10), hr(100, H - 100, W - 200, alpha(ink, .3), 1, { label: 'Footer rule' }), ...footer(W, H - 20, f.footer, alpha(ink, .7))], living: standardLiving(f) };
    },
  },
  {
    id: 'harvest', name: 'Harvest table', kind: 'FLYER', blurb: 'Warm and friendly, for meals, bake sales and fundraisers.',
    swatch: ['#fff1de', '#5a2a12', '#e8742c'], width: W, height: H,
    defaults: { kicker: 'Everyone welcome', ctaLabel: 'Count me in' },
    build: f => {
      const ink = '#5a2a12', orange = '#e8742c';
      const bg = rect(0, 0, W, H, '#fff1de', { label: 'Background' });
      const arc = ellipse(-160, -520, W + 320, 1080, orange, { label: 'Sun arc' });
      const leaves = [path(80, 90, 120, 160, 'M50 0 C90 30 100 70 50 100 C0 70 10 30 50 0 Z', '#f7b267', { rotation: -24, label: 'Spark leaf 1' }), path(880, 70, 110, 150, 'M50 0 C90 30 100 70 50 100 C0 70 10 30 50 0 Z', '#ffd29a', { rotation: 30, label: 'Spark leaf 2' })];
      const kick = text(100, 120, W - 200, or(f.kicker, 'Everyone welcome'), { size: 32, font: 'dmSans', weight: 800, color: '#fff1de', align: 'center', tracking: .2, transform: 'uppercase', label: 'Kicker' });
      const head = text(100, 600, W - 200, or(f.headline, 'Your headline'), { size: 116, font: 'shrikhand', weight: 400, color: ink, align: 'center', leading: 1.02, label: 'Headline' });
      const d = detailsBlock(140, below(head, 40), W - 280, f, { font: 'dmSans', ink, muted: ink, size: 34, align: 'center' });
      const body = bodyText(150, d.bottom + 24, W - 300, f.body, { font: 'dmSans', color: alpha(ink, .85), align: 'center', size: 26, max: 240 });
      const by = Math.min(H - 190, body[0] ? below(body[0], 44) : d.bottom + 44);
      return { objects: [bg, arc, ...leaves, kick, head, ...d.objects, ...body, ...cta(W / 2 - 200, by, 400, f.ctaLabel || '', orange, '#ffffff', 'dmSans'), ...footer(W, H, f.footer, alpha(ink, .75), 'dmSans')], living: standardLiving(f, [
        { id: 'leaves', target: { label: 'Spark leaf*' }, on: { type: 'idle' }, do: [{ do: 'animate', target: { label: 'Spark leaf*' }, anim: { preset: 'sway', durationMs: 3200, loop: 'infinite', direction: 'alternate' } }] },
      ]) };
    },
  },
  {
    id: 'hands', name: 'Hands needed', kind: 'POSTER', blurb: 'A clear ask for volunteers, helpers and sign-ups.',
    swatch: ['#0f4c4a', '#ffffff', '#5fe0c2'], width: W, height: H,
    defaults: { kicker: 'Volunteers needed', ctaLabel: 'I can help' },
    build: f => {
      const mint = '#5fe0c2';
      const bg = rect(0, 0, W, H, '#0f4c4a', { label: 'Background' });
      const stripes = Array.from({ length: 6 }, (_, i) => rect(-200 + i * 260, -100, 90, H + 200, '#ffffff', { opacity: .04, rotation: 18, label: `Stripe ${i + 1}` }));
      const kick = text(90, 140, W - 180, or(f.kicker, 'Volunteers needed'), { size: 34, font: 'inter', weight: 800, color: mint, tracking: .2, transform: 'uppercase', label: 'Kicker' });
      const head = text(90, below(kick, 22), W - 180, or(f.headline, 'Your headline').toUpperCase(), { size: 150, font: 'bebas', weight: 400, color: '#ffffff', leading: .92, label: 'Headline' });
      const d = detailsBlock(90, below(head, 50), W - 180, f, { font: 'inter', ink: '#ffffff', muted: mint, size: 32, card: alpha('#ffffff', .1) });
      const body = bodyText(90, d.bottom + 32, W - 180, f.body, { font: 'inter', color: alpha('#ffffff', .88), size: 27 });
      const by = Math.min(H - 200, body[0] ? below(body[0], 48) : d.bottom + 48);
      const dots = [circle(930, 1180, 70, mint, { opacity: .9, label: 'Spark dot 1' }), circle(1010, 1080, 34, '#ffffff', { opacity: .7, label: 'Spark dot 2' })];
      return { objects: [bg, ...stripes, ...dots, kick, head, ...d.objects, ...body, ...cta(90, by, 380, f.ctaLabel || '', mint, '#0f4c4a', 'inter', 14), ...footer(W, H, f.footer, alpha('#ffffff', .7))], living: standardLiving(f) };
    },
  },
  {
    id: 'trail', name: 'Trailhead', kind: 'FLYER', blurb: 'Mountains and pines, for camps, trips and retreats.',
    swatch: ['#e9f1e4', '#173d2a', '#f2a541'], width: W, height: H,
    defaults: { kicker: 'Pack your bags', ctaLabel: 'Save my spot' },
    build: f => {
      const ink = '#173d2a';
      const bg = rect(0, 0, W, H, '#e9f1e4', { label: 'Background', gradient: { kind: 'LINEAR', angle: 180, stops: [{ offset: 0, color: '#cfe6f2' }, { offset: .6, color: '#e9f1e4' }] } });
      const sun = circle(820, 220, 110, '#f2a541', { label: 'Spark sun' });
      const far = path(0, 300, W, 360, 'M0 100 L18 40 L32 70 L52 18 L70 60 L84 34 L100 100 Z', '#8fb59a', { label: 'Mountains far' });
      const near = path(0, 420, W, 300, 'M0 100 L14 52 L28 78 L46 30 L64 74 L80 44 L100 100 Z', '#2f6b4a', { label: 'Mountains near' });
      const ground = rect(0, 718, W, H - 718, '#e9f1e4', { label: 'Ground' });
      const kick = text(90, 770, W - 180, or(f.kicker, 'Pack your bags'), { size: 32, font: 'permanentMarker', weight: 400, color: '#c4701a', label: 'Kicker' });
      const head = text(90, below(kick, 10), W - 180, or(f.headline, 'Your headline'), { size: 96, font: 'archivoBlack', weight: 400, color: ink, leading: 1, label: 'Headline' });
      const d = detailsBlock(90, below(head, 34), W - 180, f, { font: 'archivo', ink, muted: ink, size: 32 });
      const body = bodyText(90, d.bottom + 20, W - 180, f.body, { font: 'archivo', color: alpha(ink, .85), size: 25, max: 200 });
      const by = Math.min(H - 180, body[0] ? below(body[0], 36) : d.bottom + 36);
      return { objects: [bg, sun, far, near, ground, kick, head, ...d.objects, ...body, ...cta(90, by, 380, f.ctaLabel || '', ink, '#ffffff', 'archivo', 12), ...footer(W, H, f.footer, alpha(ink, .7), 'archivo')], living: standardLiving(f, [
        { id: 'sun-rise', target: { label: 'Spark sun' }, on: { type: 'enter' }, do: [{ do: 'animate', target: { label: 'Spark sun' }, anim: { preset: 'rise', durationMs: 1400, easing: 'ease-out' } }], once: true },
        { id: 'parallax', target: { label: 'Mountains near' }, on: { type: 'idle' }, do: [{ do: 'animate', target: { label: 'Mountains near' }, anim: { preset: 'parallax', amount: .4 } }] },
      ]) };
    },
  },
  {
    id: 'newsletter', name: 'One-page newsletter', kind: 'NEWSLETTER', blurb: 'Masthead and columns; each blank line in Details starts a new story.',
    swatch: ['#ffffff', '#141414', '#7b2cff'], width: 816, height: 1056,
    defaults: { kicker: 'This week', headline: 'Newsletter' },
    build: f => {
      const NW = 816, NH = 1056, ink = '#141414', violet = '#7b2cff';
      const objs: TelaVectorObject[] = [rect(0, 0, NW, NH, '#ffffff', { label: 'Background' })];
      const kick = text(56, 54, NW - 112, or(f.kicker, 'This week'), { size: 13, font: 'inter', weight: 800, color: violet, tracking: .24, transform: 'uppercase', label: 'Kicker' });
      const head = text(56, below(kick, 8), NW - 112, or(f.headline, 'Newsletter'), { size: 58, font: 'fraunces', weight: 800, color: ink, leading: 1, label: 'Headline' });
      objs.push(kick, head, rect(56, below(head, 14), NW - 112, 4, ink, { label: 'Masthead rule' }));
      const meta = [f.when, f.where].filter(Boolean).join('  ·  ');
      let y = below(head, 30);
      if (meta) { const m = text(56, y, NW - 112, meta, { size: 14, font: 'inter', weight: 700, color: alpha(ink, .7), label: 'Details · when & where' }); objs.push(m); y = below(m, 22); }
      const stories = (f.body || 'Write each story in Details.\n\nLeave a blank line between stories; the first line of each becomes its heading.').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).slice(0, 6);
      const colW = (NW - 112 - 28) / 2; const colY = [y, y];
      stories.forEach((s, i) => {
        const c = colY[0] <= colY[1] ? 0 : 1; const x = 56 + c * (colW + 28);
        const [first, ...rest] = s.split('\n');
        const h2 = text(x, colY[c], colW, first, { size: 24, font: 'fraunces', weight: 700, color: ink, leading: 1.15, label: `Details · story ${i + 1} heading` });
        const p = rest.length ? text(x, below(h2, 8), colW, rest.join('\n').slice(0, 600), { size: 16, font: 'inter', weight: 400, color: alpha(ink, .86), leading: 1.5, label: `Details · story ${i + 1}` }) : null;
        const card = rect(x - 14, colY[c] - 12, colW + 28, (p ? below(p, 0) : below(h2, 0)) - colY[c] + 24, mix('#ffffff', -0.03), { rx: 10, label: `Story card ${i + 1}` });
        objs.push(card, h2, ...(p ? [p] : []));
        colY[c] = (p ? below(p, 0) : below(h2, 0)) + 34;
      });
      const by = Math.min(NH - 120, Math.max(...colY) + 4);
      if (f.ctaLabel?.trim()) { objs.push(rect(56, by, 260, 48, violet, { rx: 999, label: 'CTA' }), text(56, by + 14, 260, f.ctaLabel.trim(), { size: 16, font: 'inter', weight: 800, color: '#ffffff', align: 'center', wrap: false, label: 'CTA label', role: 'LABEL' })); }
      if (f.footer?.trim()) objs.push(hr(56, NH - 64, NW - 112, alpha(ink, .25), 1, { label: 'Footer rule' }), text(56, NH - 50, NW - 112, f.footer.trim(), { size: 11, font: 'inter', weight: 700, color: alpha(ink, .6), tracking: .18, transform: 'uppercase', label: 'Footer', role: 'CAPTION' }));
      return { objects: objs, living: standardLiving(f, [
        { id: 'story-hover', target: { label: 'Story card*' }, on: { type: 'hover' }, do: [{ do: 'set', target: { label: 'Story card*' }, props: { fill: alpha(violet, .08) } }], cooldownMs: 200 },
      ]) };
    },
  },
];

export const findFlyerPreset = (id: string) => FLYER_PRESETS.find(p => p.id === id);

/** A complete Tela document for a filled preset: one page, its objects and its living layer. */
export function flyerToTelaDoc(preset: FlyerPreset, fields: FlyerFields, ownerId: string, id = newTelaId()): TelaDoc {
  const { objects, living } = preset.build(fields);
  const deviceId = `${id}_page`;
  const book: LivingBook = { version: 1, bookId: id, pages: [living], scores: {}, defaults: { narrate: 'off', ambient: false } };
  const now = Date.now();
  return {
    id, ownerId, title: fields.headline?.trim() || preset.name,
    frames: [{ id: `${id}_f1`, kind: preset.width === 816 ? 'PAPER' : 'SCREEN', preset: preset.width === 816 ? 'LETTER' : 'FREE', x: 0, y: 0, w: preset.width, h: preset.height, deviceIds: [deviceId], label: preset.name }],
    devices: { [deviceId]: { id: deviceId, type: 'VECTOR', name: preset.name, width: preset.width, height: preset.height, objects } },
    living: book,
    templatePreset: { schemaVersion: 1, templateId: `flyer:${preset.id}`, status: 'available' },
    createdAt: now, updatedAt: now,
  };
}
