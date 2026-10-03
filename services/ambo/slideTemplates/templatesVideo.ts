// templatesVideo — Video slides: starts in the design, takes over full screen, returns at the end.
//
// Every designer places ONE video well and hands its rectangle to the
// 'video.well' live drawer (videoSlide.ts). The well's frame, mat and poster
// are ordinary static objects drawn in the theme's own language; the live box
// spans the whole frame and is emitted LAST (and `front`) so the full-screen
// takeover covers the type and ornament beneath it.
import { rect, text, line, image, ellipse, alpha } from '../../tela/templateKit';
import { fitText, Stack, bbox, type Box, box } from './layout';
import { typeset } from './themes';
import { prelude, dim } from './parts';
import { parseVideoFields, VIDEO_WELL_DRAWER, type VideoWellProps } from './videoSlide';
import type { DesignCtx, FieldDef, SlideDesigner, SlideObj, SlideTemplateDef } from './types';

const F = (key: string, label: string, def: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, default: def, ...o });
const ctx = (d: DesignCtx) => ({ ...d, u: d.L.u, S: d.L.safe, ty: typeset(d.th), m: d.th.motif, c: d.th.c });

/** The playback fields every video slide shares. */
const PLAYBACK: FieldDef[] = [
  F('videoUrl', 'Video', '', { kind: 'video', hint: 'Video file or link (MP4 / WebM)' }),
  F('posterUrl', 'Poster image', '', { kind: 'image', hint: 'Optional still shown before the video plays' }),
  F('delaySec', 'Full screen after (s)', '2.5', { kind: 'number', hint: '0 = open full screen · -1 or "stay" = stay in the slide' }),
  F('ending', 'When it ends', 'Last frame', { kind: 'select', options: ['Last frame', 'Black'] }),
  F('returnFadeSec', 'Return to slide (s)', '1.2', { kind: 'number', hint: 'Length of the move / fade back to the design' }),
  F('volume', 'Volume', '1', { kind: 'number', hint: '0 – 1' }),
  F('muted', 'Mute', 'false', { kind: 'toggle' }),
  F('inSec', 'Start at (s)', '', { kind: 'number', hint: 'Optional trim in' }),
  F('outSec', 'End at (s)', '', { kind: 'number', hint: 'Optional trim out — empty plays to the end' }),
];

interface WellOpts {
  /** Corner radius in px (default: the theme's slot shape, capped so video never becomes a pill). */
  rx?: number;
  /** Multiplier on the theme's slot tilt (0 = upright). */
  tilt?: number;
  /** 'mat' = theme panel around the screen, 'line' = hairline frame, 'bare' = just the screen. */
  frame?: 'mat' | 'line' | 'bare';
}

/**
 * A video well at (x, y, w, h): static frame + optional poster, and the
 * full-frame live box (returned separately — push it LAST).
 */
function videoWell(d: DesignCtx, x: number, y: number, w: number, h: number, o: WellOpts = {}): { objs: SlideObj[]; live: SlideObj } {
  const { u, th, L, c, m, f } = ctx(d);
  const rx = o.rx ?? Math.min(w, h) * Math.min(th.slot.rx, .1);
  const rot = (o.tilt ?? 0) * th.slot.tilt;
  const objs: SlideObj[] = [];
  const frame = o.frame ?? 'line';
  if (frame === 'mat') {
    const p = u * 1.4;
    objs.push(...m.panel(x - p, y - p, w + p * 2, h + p * 2, L).map(q => { q.objectLabel = q.objectLabel === 'Panel' ? 'Screen mat' : q.objectLabel; return q; }));
  }
  const screen = rect(x, y, w, h, th.dark ? '#07060A' : '#141219', {
    rx, rotation: rot, label: 'Video well', role: 'IMAGE_SLOT',
    stroke: frame === 'bare' ? undefined : alpha(c.accent, .5), strokeWidth: frame === 'bare' ? 0 : Math.max(1, u * .12),
    shadow: { x: 0, y: u * .5, blur: u * 1.6, color: th.dark ? 'rgba(0,0,0,0.5)' : 'rgba(20,16,30,0.22)' },
  }) as SlideObj;
  objs.push(screen);
  if ((f.posterUrl || '').trim()) {
    const img = image(x, y, w, h, f.posterUrl.trim(), 1920, 1080, { label: 'Video poster', rotation: rot }) as SlideObj;
    img.rx = rx; objs.push(img);
  }
  const props: VideoWellProps = { ...parseVideoFields(f), well: { x, y, w, h, rx, rot }, u };
  const live = rect(0, 0, d.W, d.H, 'none', { label: 'Video', role: 'IMAGE_SLOT' }) as SlideObj;
  live.live = { drawer: VIDEO_WELL_DRAWER, props: props as unknown as Record<string, unknown> };
  live.front = true;
  return { objs, live };
}

/** Largest w×h box of aspect `ar` inside (bw, bh). */
const fitAr = (bw: number, bh: number, ar: number) => { const w = Math.min(bw, bh * ar); return { w, h: w / ar }; };

// ── 1. Feature Screen — a framed screen with the title above ────────────────
const featureScreen: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m } = ctx(d);
  const out = prelude(d, !L.vertical);
  const mat = u * 1.4;
  if (L.stretched) {
    const { w, h } = fitAr(S.w * .52, S.h - mat * 2, 16 / 9);
    const x = S.cx - w / 2, y = S.cy - h / 2;
    const colW = Math.min(u * 60, x - mat - u * 5 - S.x);
    const st = new Stack();
    if (f.kicker) st.add(text(S.x, 0, colW, f.kicker, ty.label(u * 1.6)));
    st.add(fitText(S.x, 0, colW, f.title, ty.display(u * 5.4), S.h * .42), u * 1.2);
    st.add(m.divider(S.x, 0, colW, 'left', L).objs, u * 2.2);
    if (f.caption) st.add(fitText(S.x, 0, colW, f.caption, ty.body(u * 2.1, { leading: 1.42 }), S.h * .3), u * 2);
    out.push(...st.centre(S.y, S.h));
    const rx0 = x + w + mat + u * 5, rw = S.right - rx0, hs = Math.min(rw, S.h * .86);
    if (hs > u * 10) out.push(...dim(m.hero(rx0 + (rw - hs) / 2, S.cy - hs / 2, hs, hs, L, seed), .75));
    const v = videoWell(d, x, y, w, h, { frame: 'mat' });
    out.push(...v.objs, v.live);
    return out;
  }
  const head = new Stack();
  if (f.kicker) head.add(text(S.x, 0, S.w, f.kicker, ty.label(u * 1.6, { align: 'center' })));
  head.add(fitText(S.x, 0, S.w, f.title, ty.display(u * (L.vertical ? 5.6 : 4.6), { align: 'center' }), L.vertical ? S.h * .16 : S.h * .13), u * 1);
  const cap = f.caption ? fitText(S.x, 0, S.w, f.caption, ty.accent(u * 2.1, { align: 'center' }), L.vertical ? S.h * .12 : u * 3.4) : null;
  if (L.vertical) {
    const { w, h } = fitAr(S.w - mat * 2, S.h * .5, 16 / 9);
    const well = rect(S.cx - w / 2 - mat, 0, w + mat * 2, h + mat * 2, 'none', { label: 'spacer' });
    const st = new Stack().add(head.place(0)).add([well], u * 3.2);
    if (cap) st.add([cap], u * 2.6);
    const placed = st.centre(S.y, S.h, -.02).filter(o => o !== well);
    out.push(...placed);
    const v = videoWell(d, S.cx - w / 2, well.y + mat, w, h, { frame: 'mat' });
    out.push(...v.objs, v.live);
    return out;
  }
  const top = head.place(S.y);
  out.push(...top);
  const tb = bbox(top).bottom + u * 2.4 + mat;
  let bottom = S.bottom - mat;
  if (cap) { cap.y = S.bottom - cap.h; out.push(cap); bottom = cap.y - u * 2 - mat; }
  const { w, h } = fitAr(S.w - mat * 2, bottom - tb, 16 / 9);
  const v = videoWell(d, S.cx - w / 2, tb + (bottom - tb - h) / 2, w, h, { frame: 'mat' });
  out.push(...v.objs, v.live);
  return out;
};

// ── 2. Screen + Caption Panel — the well beside a theme panel of words ──────
const sidePanel: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c } = ctx(d);
  const out = prelude(d, false);
  const words = (x: number, w: number, maxT: number, align: 'left' | 'center') => {
    const st = new Stack();
    if (f.kicker) st.add(text(x, 0, w, f.kicker, ty.label(u * 1.5, { align, color: c.panelMuted })));
    st.add(fitText(x, 0, w, f.title, ty.display(u * 4.8, { align, color: c.panelInk }), maxT), u * 1.1);
    const rw = Math.min(w, u * 9);
    st.add([line(align === 'center' ? x + (w - rw) / 2 : x, 0, (align === 'center' ? x + (w - rw) / 2 : x) + rw, 0, alpha(c.panelInk, .35), Math.max(1, u * .14), { label: 'Panel rule' })], u * 2);
    if (f.caption) st.add(fitText(x, 0, w, f.caption, ty.body(u * 2.1, { align, color: c.panelInk, leading: 1.42 }), maxT * 1.3), u * 2);
    if (f.credit) st.add(fitText(x, 0, w, f.credit, ty.label(u * 1.2, { align, color: c.panelMuted, label: 'Credit' }), u * 3), u * 1.8);
    return st;
  };
  const pad = u * 2.8;
  if (L.vertical) {
    const { w, h } = fitAr(S.w, S.h * .42, 16 / 9);
    const st = words(S.x + pad, S.w - pad * 2, S.h * .14, 'center');
    const ph = Math.min(S.h - h - u * 3, st.height() + pad * 2);
    const total = h + u * 3 + ph, y0 = S.y + (S.h - total) / 2;
    out.push(...m.panel(S.x, y0 + h + u * 3, S.w, ph, L));
    out.push(...st.centre(y0 + h + u * 3, ph, 0));
    const v = videoWell(d, S.cx - w / 2, y0, w, h, { frame: 'line' });
    out.push(...v.objs, v.live);
    return out;
  }
  const share = L.cls === 'standard' ? .6 : L.cls === 'wide' ? .62 : .5;
  const { w, h } = fitAr(L.stretched ? S.w * .46 : S.w * share, S.h, 16 / 9);
  const x = L.stretched ? S.x + S.w * .04 : S.x, y = S.cy - h / 2;
  const px = x + w + u * 3.4;
  const pw = Math.min(S.right - px, L.stretched ? u * 64 : Infinity);
  out.push(...m.panel(px, y, pw, h, L));
  out.push(...words(px + pad, pw - pad * 2, h * .34, 'left').centre(y + pad * .6, h - pad * 1.2, 0));
  if (L.stretched) {
    const rx0 = px + pw + u * 5, rw = S.right - rx0, hs = Math.min(rw, S.h * .86);
    if (hs > u * 10) out.push(...dim(m.hero(rx0 + (rw - hs) / 2, S.cy - hs / 2, hs, hs, L, seed), .7));
  }
  const v = videoWell(d, x, y, w, h, { frame: 'line' });
  out.push(...v.objs, v.live);
  return out;
};

// ── 3. Wide Screen + Lower Band — a broad well over a title band ────────────
const lowerBand: SlideDesigner = d => {
  const { L, f, u, S, ty, m, c } = ctx(d);
  const out = prelude(d, false);
  if (L.vertical) {
    const h = d.W * 9 / 16, y = S.y + u * 2;
    const st = new Stack();
    if (f.kicker) st.add(text(S.x, 0, S.w, f.kicker, ty.label(u * 1.6, { align: 'center' })));
    st.add(fitText(S.x, 0, S.w, f.title, ty.display(u * 5.6, { align: 'center' }), S.h * .18), u * 1.2);
    st.add(m.divider(S.x, 0, S.w, 'center', L).objs, u * 2.4);
    if (f.caption) st.add(fitText(S.x, 0, S.w, f.caption, ty.body(u * 2.3, { align: 'center', leading: 1.42 }), S.h * .16), u * 2.2);
    out.push(...st.centre(y + h + u * 3, S.bottom - (y + h + u * 3)));
    const v = videoWell(d, 0, y, d.W, h, { rx: 0, frame: 'bare' });
    out.push(...v.objs, v.live);
    return out;
  }
  const bandH = Math.max(u * 11, S.h * .24);
  const avail = S.h - bandH - u * 2.6;
  const { w, h } = fitAr(S.w, avail, L.stretched ? 2.39 : 2.1);
  const x = S.cx - w / 2, y = S.y;
  const by = y + h + u * 2.6;
  // Band: title left, a rule, caption right.
  const leftW = w * (L.cls === 'standard' ? .5 : .46), rightX = x + leftW + u * 4, rightW = x + w - rightX;
  const st = new Stack();
  if (f.kicker) st.add(text(x, 0, leftW, f.kicker, ty.label(u * 1.5)));
  st.add(fitText(x, 0, leftW, f.title, ty.display(u * 4.6), bandH - u * 3.2), u * .9);
  out.push(...st.centre(by, bandH, 0));
  out.push(line(rightX - u * 2, by + u * .6, rightX - u * 2, by + bandH - u * .6, alpha(c.accent, .55), Math.max(1, u * .14), { label: 'Band rule' }));
  const rs = new Stack();
  if (f.caption) rs.add(fitText(rightX, 0, rightW, f.caption, ty.body(u * 2.1, { leading: 1.42 }), bandH - u * 3));
  if (f.credit) rs.add(fitText(rightX, 0, rightW, f.credit, ty.label(u * 1.2, { color: c.muted, label: 'Credit' }), u * 2.4), u * 1.2);
  out.push(...rs.centre(by, bandH, 0));
  const v = videoWell(d, x, y, w, h, { frame: 'line' });
  out.push(...v.objs, v.live);
  return out;
};

// ── 4. Vertical Story — a phone-shaped well for portrait clips ──────────────
function phone(d: DesignCtx, x: number, y: number, w: number, h: number): { objs: SlideObj[]; live: SlideObj } {
  const { u, th } = ctx(d);
  const b = Math.max(u * .7, w * .035), rot = th.slot.tilt * .6;
  const body = rect(x - b, y - b, w + b * 2, h + b * 2, th.dark ? '#1A1820' : '#121016', {
    rx: (w + b * 2) * .13, rotation: rot, label: 'Phone body', stroke: 'rgba(255,255,255,0.14)', strokeWidth: Math.max(1, u * .1),
    shadow: { x: 0, y: u * .8, blur: u * 2.2, color: th.dark ? 'rgba(0,0,0,0.55)' : 'rgba(20,16,30,0.28)' },
  }) as SlideObj;
  const v = videoWell(d, x, y, w, h, { rx: w * .1, tilt: .6, frame: 'bare' });
  const notch = rect(x + w / 2 - w * .14, y + b * .6, w * .28, Math.max(3, b * 1.1), '#000000', { rx: b, rotation: rot, label: 'Phone notch' }) as SlideObj;
  return { objs: [body, ...v.objs, notch], live: v.live };
}
const verticalStory: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m } = ctx(d);
  const out = prelude(d, true);
  const words = (x: number, w: number, align: 'left' | 'center', maxT: number) => {
    const st = new Stack();
    if (f.kicker) st.add(text(x, 0, w, f.kicker, ty.label(u * 1.6, { align })));
    st.add(fitText(x, 0, w, f.title, ty.display(u * 5.4, { align }), maxT), u * 1.2);
    st.add(m.divider(x, 0, w, align, L).objs, u * 2.2);
    if (f.caption) st.add(fitText(x, 0, w, f.caption, ty.body(u * 2.2, { align, leading: 1.42 }), maxT * .9), u * 2.2);
    return st;
  };
  if (L.vertical) {
    const ph = S.h * (L.cls === 'tall' ? .6 : .52), pw = Math.min(S.w * .7, ph * 9 / 16);
    const h = pw * 16 / 9;
    const st = words(S.x, S.w, 'center', S.h * .12);
    const sh = st.height(), gap = u * 4, total = sh + gap + h;
    const y0 = S.y + Math.max(0, (S.h - total) / 2);
    out.push(...st.place(y0));
    const p = phone(d, S.cx - pw / 2, y0 + sh + gap, pw, h);
    out.push(...p.objs, p.live);
    return out;
  }
  const h = S.h * .94 - u * 1.4, w = h * 9 / 16;
  const x = L.stretched ? S.cx - w / 2 : S.x + Math.max(u * 2, S.w * .1), y = S.cy - h / 2;
  if (L.stretched) {
    const colW = Math.min(u * 60, x - u * 7 - S.x);
    out.push(...words(x - u * 7 - colW, colW, 'left', S.h * .4).centre(S.y, S.h));
    const rx0 = x + w + u * 7, rw = S.right - rx0, hs = Math.min(rw, S.h * .8);
    if (hs > u * 10) out.push(...dim(m.hero(rx0 + (rw - hs) / 2, S.cy - hs / 2, hs, hs, L, seed), .8));
  } else {
    const tx = x + w + u * 8, tw = Math.min(S.right - tx, u * 72);
    out.push(...words(tx, tw, 'left', S.h * .36).centre(S.y, S.h));
  }
  const p = phone(d, x, y, w, h);
  out.push(...p.objs, p.live);
  return out;
};

// ── 5. Cinema Letterbox — a scope-ratio screen between quiet bands ──────────
const cinema: SlideDesigner = d => {
  const { L, f, u, S, ty, c } = ctx(d);
  const out = prelude(d, false);
  const hair = (y: number, x0: number, x1: number) => line(x0, y, x1, y, alpha(c.accent, .5), Math.max(1, u * .1), { label: 'Screen rule' });
  if (L.stretched) {
    const { w, h } = fitAr(S.w * .56, S.h * .78, 2.39);
    const x = S.cx - w / 2, y = S.cy - h / 2;
    const colW = Math.min(u * 56, x - u * 5 - S.x);
    const st = new Stack();
    if (f.kicker) st.add(text(x - u * 5 - colW, 0, colW, f.kicker, ty.label(u * 1.5, { align: 'right' })));
    st.add(fitText(x - u * 5 - colW, 0, colW, f.title, ty.display(u * 4.6, { align: 'right' }), S.h * .5), u * 1.1);
    out.push(...st.centre(S.y, S.h));
    const rx0 = x + w + u * 5, rw = Math.min(u * 56, S.right - rx0);
    if (f.caption) { const cap = fitText(rx0, 0, rw, f.caption, ty.accent(u * 2.2, { leading: 1.4 }), S.h * .5); cap.y = S.cy - cap.h / 2; out.push(cap); }
    out.push(hair(y - u * 1.2, x, x + w), hair(y + h + u * 1.2, x, x + w));
    const v = videoWell(d, x, y, w, h, { rx: 0, frame: 'bare' });
    out.push(...v.objs, v.live);
    return out;
  }
  const ar = L.vertical ? 16 / 9 : 2.39;
  const w = d.W, h = Math.min(w / ar, S.h * .62);
  const y = (d.H - h) / 2 + (L.vertical ? 0 : u * .6);
  const top = new Stack();
  if (f.kicker) top.add(text(S.x, 0, S.w, f.kicker, ty.label(u * 1.5, { align: 'center' })));
  top.add(fitText(S.x, 0, S.w, f.title, ty.display(u * (L.vertical ? 5 : 4), { align: 'center' }), Math.max(u * 3, y - u * 2.4 - S.y - (f.kicker ? u * 3 : 0))), u * .8);
  const tb = top.height();
  out.push(...top.place(Math.max(S.y, y - u * 2.6 - tb - (L.vertical ? u * 2 : 0))));
  if (f.caption) {
    const cap = fitText(S.x, 0, S.w, f.caption, ty.accent(u * 2.1, { align: 'center', leading: 1.36 }), Math.max(u * 3, S.bottom - (y + h + u * 2.6)));
    cap.y = Math.min(y + h + u * 2.6, S.bottom - cap.h); out.push(cap);
  }
  out.push(hair(y - u * 1.1, S.x, S.right), hair(y + h + u * 1.1, S.x, S.right));
  const v = videoWell(d, 0, y, w, h, { rx: 0, frame: 'bare' });
  out.push(...v.objs, v.live);
  return out;
};

// ── 6. Screen on the Wall — a television hung in the theme's room ───────────
function television(d: DesignCtx, x: number, y: number, w: number, h: number): { objs: SlideObj[]; live: SlideObj; bottom: number } {
  const { u, th, c } = ctx(d);
  const b = Math.max(u * .8, w * .022);
  const objs: SlideObj[] = [];
  const standW = w * .2, neckW = w * .035, neckH = Math.max(u * 1.6, h * .07), baseH = Math.max(u * .6, h * .022);
  const sx = x + w / 2;
  objs.push(rect(sx - neckW / 2, y + h + b, neckW, neckH, th.dark ? '#24222A' : '#2A2730', { label: 'TV neck' }) as SlideObj);
  objs.push(rect(sx - standW / 2, y + h + b + neckH, standW, baseH, th.dark ? '#2C2A33' : '#24212A', { rx: baseH / 2, label: 'TV stand', shadow: { x: 0, y: u * .3, blur: u, color: 'rgba(0,0,0,0.3)' } }) as SlideObj);
  objs.push(rect(x - b, y - b, w + b * 2, h + b * 2, '#0C0B0F', {
    rx: b * .7, label: 'TV bezel', stroke: 'rgba(255,255,255,0.12)', strokeWidth: Math.max(1, u * .08),
    shadow: { x: 0, y: u * .9, blur: u * 2.4, color: th.dark ? 'rgba(0,0,0,0.6)' : 'rgba(20,16,30,0.3)' },
  }) as SlideObj);
  objs.push(ellipse(x + w - b * .2 - u * .5, y + h + b * .5 - u * .2, u * .4, u * .4, c.accent, { label: 'Power light', opacity: .9 }) as SlideObj);
  const v = videoWell(d, x, y, w, h, { rx: b * .25, frame: 'bare' });
  objs.push(...v.objs);
  return { objs, live: v.live, bottom: y + h + b + neckH + baseH };
}
const tvWall: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c } = ctx(d);
  const out = prelude(d, true);
  const words = (x: number, w: number, align: 'left' | 'center', maxT: number) => {
    const st = new Stack();
    if (f.kicker) st.add(text(x, 0, w, f.kicker, ty.label(u * 1.6, { align })));
    st.add(fitText(x, 0, w, f.title, ty.display(u * 5.2, { align }), maxT), u * 1.2);
    if (f.caption) st.add(fitText(x, 0, w, f.caption, ty.body(u * 2.1, { align, leading: 1.42, color: c.muted }), maxT * .8), u * 2);
    return st;
  };
  const shelf = (yy: number, x0: number, x1: number) => line(x0, yy, x1, yy, alpha(c.accent, .35), Math.max(1, u * .12), { label: 'Shelf line' });
  if (L.vertical) {
    const { w, h } = fitAr(S.w - u * 2, S.h * .38, 16 / 9);
    const st = words(S.x, S.w, 'center', S.h * .16);
    const standH = Math.max(u * 1.6, h * .07) + Math.max(u * .6, h * .022) + u;
    const total = h + standH + u * 5 + st.height();
    const y0 = S.y + Math.max(0, (S.h - total) / 2);
    const tv = television(d, S.cx - w / 2, y0, w, h);
    out.push(shelf(tv.bottom, S.x, S.right));
    out.push(...st.place(tv.bottom + u * 5));
    out.push(...tv.objs, tv.live);
    return out;
  }
  const tvShare = L.stretched ? .42 : L.cls === 'standard' ? .58 : .56;
  const { w, h } = fitAr(S.w * tvShare, S.h * .78, 16 / 9);
  const x = L.stretched ? S.cx - w / 2 : S.x + u * 1.5, y = S.y + (S.h * .86 - h) / 2;
  const tv = television(d, x, y, w, h);
  out.push(shelf(tv.bottom, L.stretched ? S.x : S.x, S.right));
  if (L.stretched) {
    const colW = Math.min(u * 58, x - u * 7 - S.x);
    out.push(...words(x - u * 7 - colW, colW, 'left', S.h * .4).centre(S.y, tv.bottom - S.y));
    const rx0 = x + w + u * 7, rw = S.right - rx0, hs = Math.min(rw, (tv.bottom - S.y) * .9);
    if (hs > u * 10) out.push(...dim(m.hero(rx0 + (rw - hs) / 2, S.y + (tv.bottom - S.y - hs) / 2, hs, hs, L, seed), .8));
  } else {
    const tx = x + w + u * 7, tw = Math.min(S.right - tx, u * 64);
    out.push(...words(tx, tw, 'left', S.h * .34).centre(S.y, tv.bottom - S.y));
  }
  out.push(...tv.objs, tv.live);
  return out;
};

// ── 7. Picture in Collage — the screen as one tile of a theme mosaic ────────
const collage: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c } = ctx(d);
  const out = prelude(d, false);
  const g = u * 1.8;
  const titleTile = (b: Box, align: 'left' | 'center') => {
    out.push(...m.panel(b.x, b.y, b.w, b.h, L));
    const p = u * 2.4, st = new Stack();
    if (f.kicker) st.add(text(b.x + p, 0, b.w - p * 2, f.kicker, ty.label(u * 1.45, { align, color: c.panelMuted })));
    st.add(fitText(b.x + p, 0, b.w - p * 2, f.title, ty.display(u * 4.4, { align, color: c.panelInk }), b.h * .5), u * 1);
    if (f.caption) st.add(fitText(b.x + p, 0, b.w - p * 2, f.caption, ty.body(u * 2, { align, color: c.panelInk, leading: 1.4 }), b.h * .34), u * 1.6);
    out.push(...st.centre(b.y + p * .5, b.h - p, 0));
  };
  const heroTile = (b: Box) => {
    const hs = Math.min(b.w, b.h) * .9;
    out.push(rect(b.x, b.y, b.w, b.h, alpha(c.accent, d.th.dark ? .1 : .08), { label: 'Collage tile', rx: Math.min(b.w, b.h) * Math.min(d.th.slot.rx, .08), stroke: alpha(c.accent, .3), strokeWidth: Math.max(1, u * .1) }));
    out.push(...m.hero(b.cx - hs / 2, b.cy - hs / 2, hs, hs, L, seed));
  };
  let well: Box;
  if (L.vertical) {
    const { w, h } = fitAr(S.w, S.h * .44, 16 / 9);
    well = box(S.cx - w / 2, S.y, w, h);
    const rest = S.bottom - well.bottom - g;
    const th2 = rest * .58;
    titleTile(box(S.x, well.bottom + g, S.w, th2), 'center');
    const tw = (S.w - g) / 2, ty2 = well.bottom + g * 2 + th2, hh = S.bottom - ty2;
    heroTile(box(S.x, ty2, tw, hh));
    out.push(rect(S.x + tw + g, ty2, tw, hh, alpha(c.accent2 || c.accent, .22), { label: 'Collage tile', rx: Math.min(tw, hh) * Math.min(d.th.slot.rx, .08) }));
  } else if (L.stretched) {
    const { w, h } = fitAr(S.w * .5, S.h, 16 / 9);
    well = box(S.cx - w / 2, S.cy - h / 2, w, h);
    const lw = well.x - g - S.x, rw = S.right - well.right - g;
    heroTile(box(S.x, S.y, lw, S.h));
    titleTile(box(well.right + g, S.y, rw, S.h), 'left');
  } else {
    const { w, h } = fitAr(S.w * .64, S.h, 16 / 9);
    well = box(S.x, S.cy - h / 2, w, h);
    const rx0 = well.right + g, rw = S.right - rx0;
    const th1 = (S.h - g) * .62;
    titleTile(box(rx0, S.y, rw, th1), 'left');
    heroTile(box(rx0, S.y + th1 + g, rw, S.h - th1 - g));
  }
  const v = videoWell(d, well.x, well.y, well.w, well.h, { tilt: .5, frame: 'line' });
  out.push(...v.objs, v.live);
  return out;
};

export const VIDEO_TEMPLATES: SlideTemplateDef[] = [
  { id: 'video-feature', name: 'Feature Screen', category: 'Video', media: 'video', slot: 'slide', design: featureScreen,
    blurb: 'A matted screen under the title; opens to full screen, then settles back.',
    fields: [F('kicker', 'Kicker', 'Watch'), F('title', 'Title', 'Serve Day 2026'), F('caption', 'Caption', 'Two hundred volunteers, one city, one Saturday.'), ...PLAYBACK] },
  { id: 'video-panel', name: 'Screen + Caption Panel', category: 'Video', media: 'video', slot: 'slide', design: sidePanel,
    blurb: 'The screen beside a theme panel of words; stacks on vertical screens.',
    fields: [F('kicker', 'Kicker', 'Missions update'), F('title', 'Title', 'Clean Water in Kisumu'), F('caption', 'Caption', 'Our partners finished the third well this spring — here is the village celebrating the first water.', { multiline: true }), F('credit', 'Credit', 'Video · Global Partners'), ...PLAYBACK] },
  { id: 'video-band', name: 'Wide Screen + Band', category: 'Video', media: 'video', slot: 'slide', design: lowerBand,
    blurb: 'A broad screen over a lower band of title and caption.',
    fields: [F('kicker', 'Kicker', 'Baptism Sunday'), F('title', 'Title', 'Stories of New Life'), F('caption', 'Caption', 'Six people share why they are taking the next step.', { multiline: true }), F('credit', 'Credit', 'Filmed by the Media Team'), ...PLAYBACK] },
  { id: 'video-story', name: 'Vertical Story', category: 'Video', media: 'video', slot: 'slide', design: verticalStory,
    blurb: 'A phone-shaped well for portrait clips and testimonies.',
    fields: [F('kicker', 'Kicker', 'From our feed'), F('title', 'Title', 'Youth Camp Highlights'), F('caption', 'Caption', 'Shot on phones by our students all week.', { multiline: true }), ...PLAYBACK] },
  { id: 'video-cinema', name: 'Cinema Letterbox', category: 'Video', media: 'video', slot: 'slide', design: cinema,
    blurb: 'A scope-ratio screen between quiet title bands.',
    fields: [F('kicker', 'Kicker', 'Now showing'), F('title', 'Title', 'The Prodigal'), F('caption', 'Caption', 'A short film by our Creative Arts ministry.'), ...PLAYBACK] },
  { id: 'video-tv', name: 'Screen on the Wall', category: 'Video', media: 'video', slot: 'slide', design: tvWall,
    blurb: 'A television on a shelf in the theme’s room, with the title beside it.',
    fields: [F('kicker', 'Kicker', 'Announcements'), F('title', 'Title', 'This Week at Grace'), F('caption', 'Caption', 'Everything happening in the life of our church.', { multiline: true }), ...PLAYBACK] },
  { id: 'video-collage', name: 'Picture in Collage', category: 'Video', media: 'video', slot: 'slide', design: collage,
    blurb: 'The screen as one tile of a theme mosaic with a title tile.',
    fields: [F('kicker', 'Kicker', 'Recap'), F('title', 'Title', 'Easter at Grace'), F('caption', 'Caption', 'Three services, one story.'), ...PLAYBACK] },
];

