// templatesAudio — Audio slides: taking one plays its file (Program window
// only, through the Ambo mixer's Slide Audio strip) while the slide shows a
// waveform with a playhead, an animated progress treatment that plays out
// over the file's length, a timed transcript, and optionally any platform
// visualizer reacting to the audio. Playback and drawing live in audioSlide.ts.
//
// Designers follow the same contract as every slide template: re-flowed per
// aspect class, words as real TEXT objects in the theme's type, ornaments in
// the theme's motif. The moving parts are `live` boxes.
import { rect, type TextOpts } from '../../tela/templateKit';
import { fontCss } from '../../tela/telaFonts';
import { box, fitText, Stack, bbox, type Box } from './layout';
import { typeset } from './themes';
import { prelude, photo, dim } from './parts';
import type { DesignCtx, FieldDef, SlideDesigner, SlideObj, SlideTemplateDef } from './types';
import { PROGRESS_STYLES, resolveProgressStyle, type ProgressStyle } from './audioProgressStyles';
import { resolveVizMode } from './audioSlide'; // also registers the audio.* live drawers

const F = (key: string, label: string, def: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, default: def, ...o });
const X = (d: DesignCtx) => ({ ...d, u: d.L.u, S: d.L.safe, ty: typeset(d.th), m: d.th.motif, c: d.th.c });

/** A box drawn every frame by an audio drawer. */
function live(x: number, y: number, w: number, h: number, drawer: string, props: Record<string, unknown>, label: string, role: SlideObj['templateRole'] = 'ORNAMENT'): SlideObj {
  const o = rect(x, y, Math.max(1, w), Math.max(1, h), 'none', { label, role }) as SlideObj;
  o.live = { drawer, props };
  return o;
}
const wave = (b: Box, style: string, seed: number, onPanel = false) => live(b.x, b.y, b.w, b.h, 'audio.waveform', { style, seed, onPanel }, 'Waveform');
const progress = (b: Box, style: ProgressStyle, f: Record<string, string>, seed: number, onPanel = false) =>
  live(b.x, b.y, b.w, b.h, 'audio.progress', { style, seed, onPanel, transcript: f.transcript || '' }, 'Progress', 'DECK');
/** Transcript box in a theme text style. */
function transcript(b: Box, f: Record<string, string>, o: TextOpts, mode: 'scroll' | 'single' | 'karaoke', extra: Record<string, unknown> = {}): SlideObj | null {
  if (!(f.transcript || '').trim()) return null;
  return live(b.x, b.y, b.w, b.h, 'audio.transcript', {
    text: f.transcript, mode, family: fontCss(String(o.font || 'inter')), weight: o.weight ?? 400, italic: !!o.italic,
    size: o.size, leading: o.leading ?? 1.3, align: o.align || 'left', ...extra,
  }, 'Transcript', 'BODY');
}
/** Visualizer region (ground or a well), when one is chosen. */
function viz(d: DesignCtx, b: Box, shape: string, fade: string, role: SlideObj['templateRole'] = 'ORNAMENT', opacity?: number): SlideObj | null {
  const mode = resolveVizMode(d.f.visualizer, d.th);
  if (!mode) return null;
  return live(b.x, b.y, b.w, b.h, 'audio.viz', { mode: d.f.visualizer, shape, fade, opacity }, 'Visualizer', role);
}
const push = (out: SlideObj[], ...o: Array<SlideObj | null | undefined>) => { for (const x of o) if (x) out.push(x); };

/** Ground first, then a full-bleed visualizer (if chosen), then the theme frame. */
function ground(d: DesignCtx, fullViz = false, frame = true): SlideObj[] {
  const out = prelude(d, false);
  if (fullViz) push(out, viz(d, box(0, 0, d.W, d.H), 'rect', 'edges', 'GROUND'));
  if (frame) out.push(...d.th.motif.frame(d.L));
  return out;
}

/** Kicker / title / sub stack in the theme's voice. */
function header(d: DesignCtx, x: number, w: number, maxTitleH: number, o: { kicker?: string; title: string; sub?: string; size: number; align?: 'left' | 'center'; divider?: boolean; onPanel?: boolean; subStyle?: 'body' | 'accent' }): Stack {
  const { ty, c, m, L, u } = X(d);
  const al = o.align || 'left', st = new Stack();
  const ink = o.onPanel ? c.panelInk : c.ink, muted = o.onPanel ? c.panelMuted : c.muted;
  if (o.kicker) st.add(fitText(x, 0, w, o.kicker, ty.label(u * 1.55, { align: al, color: o.onPanel ? c.panelMuted : c.accent }), u * 4.2, u * 1.05));
  st.add(fitText(x, 0, w, o.title, ty.display(o.size, { align: al, color: ink }), maxTitleH), u * 1.1);
  if (o.divider) st.add(m.divider(x, 0, w, al === 'center' ? 'center' : 'left', L).objs, u * 1.8);
  if (o.sub) {
    const so = o.subStyle === 'accent' ? ty.accent(u * 2.2, { align: al, color: muted, label: 'Speaker' }) : ty.body(u * 2.1, { align: al, weight: 600, color: muted, label: 'Speaker' });
    st.add(fitText(x, 0, w, o.sub, so, u * 6, u * 1.2), o.divider ? u * 1.8 : u * 1.2);
  }
  return st;
}

const AUDIO_FIELDS = (vizDefault = ''): FieldDef[] => [
  F('audioUrl', 'Audio file', '', { kind: 'audio', hint: 'MP3, WAV, M4A… plays on Program when the slide is taken' }),
  F('progress', 'Progress style', 'auto', { kind: 'select', options: ['auto', ...PROGRESS_STYLES], hint: 'auto picks the treatment that suits the theme' }),
  F('visualizer', 'Visualizer', vizDefault, { kind: 'visualizer', hint: 'Any Pixels visualizer, reacting to this audio — none, auto or a visualizer id' }),
  F('volume', 'Volume (%)', '100', { kind: 'number' }),
  F('loop', 'Loop', 'off', { kind: 'toggle' }),
  F('startSec', 'Start at', '0', { kind: 'number', hint: 'Seconds or m:ss into the file' }),
];
const TRANSCRIPT_HINT = 'Timed lines ("0:12 text"), LRC, SRT or WebVTT — or plain text, spread over the audio';

// ── 1. Sermon Audio — header, read-out, waveform and a running transcript ───
const sermonAudio: SlideDesigner = d => {
  const { L, f, u, S, ty, m, seed, th } = X(d);
  const style = resolveProgressStyle(f.progress, ['counter', 'chapters', 'journey', 'thread', 'sunrise', 'orbit'], th.id);
  const out = ground(d);
  const tOpts = ty.body(u * (L.vertical ? 2.8 : 2.5), { leading: 1.38 });
  if (L.vertical) {
    const hdr = header(d, S.x, S.w, S.h * .2, { kicker: f.kicker, title: f.title, sub: f.speaker, size: u * 6, divider: true }).place(S.y);
    const hb = bbox(hdr);
    let y = hb.bottom + u * 3;
    const wv = box(S.x, y, S.w, S.h * .1); y = wv.bottom + u * 2.5;
    const rd = box(S.x, y, S.w, S.h * .17); y = rd.bottom + u * 3;
    out.push(...hdr, wave(wv, 'spectral', seed), progress(rd, style, f, seed));
    push(out, transcript(box(S.x, y, S.w, Math.max(u * 6, S.bottom - y)), f, tOpts, 'scroll'));
    return out;
  }
  if (L.stretched) {
    const gap = u * 5, lw = S.w * .3, cw = S.w * .38, rw = S.w - lw - cw - gap * 2;
    const hdr = header(d, S.x, lw, S.h * .5, { kicker: f.kicker, title: f.title, sub: f.speaker, size: u * 5.8, divider: true }).centre(S.y, S.h);
    const cx = S.x + lw + gap;
    const wv = box(cx, S.y + S.h * .08, cw, S.h * .36), rd = box(cx, wv.bottom + u * 3, cw, S.bottom - wv.bottom - u * 3);
    out.push(...hdr, wave(wv, 'spectral', seed), progress(rd, style, f, seed));
    push(out, transcript(box(cx + cw + gap, S.y + S.h * .1, rw, S.h * .8), f, tOpts, 'scroll'));
    return out;
  }
  const hw = S.w * (L.cls === 'standard' ? .54 : .56), topH = S.h * (L.cls === 'standard' ? .4 : .42);
  const hdr = header(d, S.x, hw, topH * .62, { kicker: f.kicker, title: f.title, sub: f.speaker, size: u * 6.2, divider: true }).centre(S.y, topH, 0);
  const rd = box(S.x + hw + u * 4, S.y, S.w - hw - u * 4, topH);
  const wv = box(S.x, S.y + topH + u * 3, S.w, S.h * .2);
  out.push(...hdr, progress(rd, style, f, seed), wave(wv, 'spectral', seed));
  // A hairline seam under the waveform in the theme's ornament language.
  const div = m.divider(S.x, wv.bottom + u * 1.6, S.w, 'center', L);
  out.push(...dim(div.objs, .5));
  const ty0 = wv.bottom + u * 2.2 + div.h;
  push(out, transcript(box(S.x + S.w * .08, ty0, S.w * .84, Math.max(u * 5, S.bottom - ty0)), f, { ...tOpts, align: 'center' }, 'scroll', { maxLines: 2 }));
  return out;
};

// ── 2. Scripture Reading — the words, large, karaoke-timed ──────────────────
const scriptureAudio: SlideDesigner = d => {
  const { L, f, u, S, ty, m, seed, th } = X(d);
  const style = resolveProgressStyle(f.progress, ['journey', 'thread', 'sunrise', 'chapters', 'candle'], th.id);
  const out = ground(d);
  const cw = L.vertical ? S.w : L.stretched ? Math.min(S.w * (L.cls === 'panorama' ? .46 : .56), u * 110) : Math.min(S.w, u * 118);
  const x0 = S.cx - cw / 2;
  if (L.stretched) {
    const fw = Math.min((S.w - cw) / 2 - u * 6, S.h * .8);
    if (fw > u * 10) out.push(...dim(m.hero(S.x, S.cy - fw / 2, fw, fw, L, seed), .55), ...dim(m.hero(S.right - fw, S.cy - fw / 2, fw, fw, L, seed + 3), .55));
  }
  const hdr = header(d, x0, cw, u * 7, { kicker: f.kicker, title: f.reference, sub: f.reader, size: u * (L.vertical ? 4.6 : 4.2), align: 'center', subStyle: 'accent' }).place(S.y);
  const hb = bbox(hdr);
  const rdH = style === 'candle' || style === 'sunrise' ? Math.max(u * 9, S.h * (L.vertical ? .14 : .2)) : u * (L.vertical ? 7.5 : 6.5);
  const rw = Math.min(cw, style === 'candle' || style === 'sunrise' ? rdH * 3.2 : cw * .78);
  const rd = box(S.cx - rw / 2, S.bottom - rdH, rw, rdH);
  const wv = box(S.cx - cw * .39, rd.y - u * 1.8 - u * 3, cw * .78, u * 3);
  const tTop = hb.bottom + u * 3, tH = wv.y - u * 2.5 - tTop;
  out.push(...hdr, wave(wv, 'line', seed), progress(rd, style, f, seed));
  push(out, transcript(box(x0, tTop, cw, tH), f, ty.sentence(u * (L.vertical ? 5.6 : 5.4), { align: 'center' }), 'karaoke', { maxLines: L.vertical ? 6 : 3, hot: 'accent', leading: 1.18 }));
  return out;
};

// ── 3. Now Playing — artwork well, track, spectral waveform, lyrics ─────────
const nowPlaying: SlideDesigner = d => {
  const { L, f, u, S, ty, th, c, seed } = X(d);
  const style = resolveProgressStyle(f.progress, ['vu', 'tape', 'bar', 'orbit', 'vessel'], th.id);
  const out = ground(d);
  // No artwork + a visualizer: the visualizer plays in the well instead of a placeholder.
  const art = (x: number, y: number, s: number) => {
    const v = !f.artUrl ? viz(d, box(x, y, s, s), 'round', 'none', 'IMAGE_SLOT', .95) : null;
    if (!v) { out.push(...photo(x, y, s, s, th, L, f.artUrl, 'Album art')); return; }
    out.push(rect(x, y, s, s, th.dark ? '#07070C' : c.ground2, { rx: Math.min(s * .08, s * th.slot.rx), stroke: c.accent, strokeWidth: Math.max(1, u * .1), opacity: 1, label: 'Art well', role: 'IMAGE_SLOT' }) as SlideObj, v);
  };
  const lOpts = ty.accent(u * (L.vertical ? 2.8 : 2.4), { leading: 1.3 });
  if (L.vertical) {
    const s = Math.min(S.w * .78, S.h * .36), ax = S.cx - s / 2;
    art(ax, S.y, s);
    const hdr = header(d, S.x, S.w, S.h * .12, { kicker: f.kicker, title: f.title, sub: f.artist, size: u * 5.2, align: 'center' }).place(S.y + s + u * 3);
    let y = bbox(hdr).bottom + u * 2.5;
    const wv = box(S.x, y, S.w, S.h * .08); y = wv.bottom + u * 2;
    const rd = box(S.x, y, S.w, S.h * .11); y = rd.bottom + u * 2.5;
    out.push(...hdr, wave(wv, 'spectral', seed), progress(rd, style, f, seed));
    push(out, transcript(box(S.x, y, S.w, Math.max(u * 5, S.bottom - y)), f, { ...lOpts, align: 'center' }, 'scroll', { maxLines: 3, hot: 'accent' }));
    return out;
  }
  const s = Math.min(S.h, S.w * (L.cls === 'standard' ? .42 : .38));
  const ay = S.cy - s / 2;
  art(S.x, ay, s);
  const gap = u * 5, rx = S.x + s + gap;
  const lyricW = L.stretched ? Math.min(S.w * .26, u * 60) : 0;
  const rw = S.right - rx - (lyricW ? lyricW + gap : 0);
  const hdr = header(d, rx, rw, S.h * .24, { kicker: f.kicker, title: f.title, sub: f.artist, size: u * 6 }).place(ay);
  let y = bbox(hdr).bottom + u * 3;
  const tail = lyricW ? 0 : u * 8.5;
  const avail = ay + s - y - tail;
  const wv = box(rx, y, rw, Math.max(u * 4, avail * .5)); y = wv.bottom + u * 2;
  const rd = box(rx, y, rw, Math.max(u * 4, avail * .5 - u * 2)); y = rd.bottom + u * 2.5;
  out.push(...hdr, wave(wv, 'spectral', seed), progress(rd, style, f, seed));
  if (lyricW) push(out, transcript(box(S.right - lyricW, ay + s * .08, lyricW, s * .84), f, lOpts, 'scroll', { maxLines: 6, hot: 'accent' }));
  else push(out, transcript(box(rx, y, rw, Math.max(u * 5, ay + s - y)), f, lOpts, 'scroll', { maxLines: 2, hot: 'accent' }));
  return out;
};

// ── 4. Waveform Band — one monumental waveform across the screen ────────────
const waveformBand: SlideDesigner = d => {
  const { L, f, u, S, ty, th, seed } = X(d);
  const style = resolveProgressStyle(f.progress, ['bar', 'chapters', 'counter'], th.id);
  const out = ground(d);
  const urban = th.director === 'the Rebellious Hand';
  const hdr = header(d, S.x, L.vertical ? S.w : Math.min(S.w * .6, u * 90), S.h * .14, { kicker: f.kicker, title: f.title, sub: f.speaker, size: u * (L.vertical ? 5.4 : 4.8) }).place(S.y);
  const hb = bbox(hdr);
  const rdH = style === 'counter' ? u * (L.vertical ? 9 : 8) : u * (L.vertical ? 6.5 : 5.6);
  const tH = (f.transcript || '').trim() ? u * (L.vertical ? 9 : 5.2) : 0;
  const bottom = S.bottom - tH - (tH ? u * 2.5 : 0);
  const rd = box(S.x, bottom - rdH, S.w, rdH);
  const wTop = hb.bottom + u * 3, wv = box(S.x, wTop, S.w, Math.max(u * 6, rd.y - u * 3 - wTop));
  out.push(...hdr, wave(wv, urban ? 'blocks' : 'mirror', seed), progress(rd, style, f, seed));
  if (tH) push(out, transcript(box(S.x, S.bottom - tH, S.w, tH), f, ty.accent(u * (L.vertical ? 2.8 : 2.6), { align: 'center' }), 'single', { maxLines: L.vertical ? 3 : 1 }));
  return out;
};

// ── 5. Visualizer Stage — a visualizer owns the ground; a plate carries the words ─
const vizStage: SlideDesigner = d => {
  const { L, f, u, S, ty, c, m, th, seed } = X(d);
  const style = resolveProgressStyle(f.progress, ['orbit', 'vu', 'vessel', 'bar'], th.id);
  const out = ground(d, true, false);
  const pad = u * 2.6;
  const pw = L.vertical ? S.w : L.stretched ? Math.min(S.w * .4, u * 96) : Math.min(S.w * .62, u * 100);
  const ph = L.vertical ? S.h * .44 : Math.min(S.h * .52, u * 34);
  const px = S.x, py = S.bottom - ph;
  out.push(...m.panel(px, py, pw, ph, L));
  const ix = px + pad, iy = py + pad, iw = pw - pad * 2, ih = ph - pad * 2;
  const rs = L.vertical ? Math.min(iw * .42, ih * .5) : Math.min(ih, iw * .34);
  const rd = box(ix, iy, rs, rs);
  const tx = L.vertical ? ix + rs + u * 2.5 : ix + rs + u * 3, tw = ix + iw - tx;
  const hdr = header(d, tx, tw, ih * .3, { kicker: f.kicker, title: f.title, sub: f.speaker, size: u * 4.4, onPanel: true }).place(iy);
  const hb = bbox(hdr);
  const lineTop = L.vertical ? Math.max(hb.bottom, rd.bottom) + u * 2.2 : hb.bottom + u * 2.2;
  const lx = L.vertical ? ix : tx, lw = L.vertical ? iw : tw;
  const wv = box(lx, lineTop, lw, u * 3.6);
  out.push(...hdr, progress(rd, style, f, seed, true), wave(wv, 'line', seed, true));
  const tTop = wv.bottom + u * 1.6;
  push(out, transcript(box(lx, tTop, lw, Math.max(u * 3.4, iy + ih - tTop)), f, ty.accent(u * 2.3, { color: c.panelInk }), 'single', { onPanel: true, maxLines: L.vertical ? 3 : 2 }));
  out.push(...th.motif.frame(L));
  return out;
};

// ── 6. Testimony — a voice, a face and the words as they are spoken ─────────
const testimony: SlideDesigner = d => {
  const { L, f, u, S, ty, th, c, seed } = X(d);
  const style = resolveProgressStyle(f.progress, ['candle', 'sunrise', 'vessel', 'thread', 'hourglass'], th.id);
  const out = ground(d);
  const qOpts = ty.accent(u * (L.vertical ? 3.2 : 3.1), { leading: 1.32, color: c.ink });
  const memo = (b: Box) => {
    // Voice-memo pill: a soft capsule with the waveform inside it.
    out.push(rect(b.x, b.y, b.w, b.h, c.accent, { rx: b.h / 2, opacity: th.dark ? .1 : .08, stroke: c.accent, strokeWidth: Math.max(1, u * .1), label: 'Voice memo pill' }) as SlideObj);
    out.push(wave(box(b.x + b.h * .6, b.y + b.h * .2, b.w - b.h * 1.2, b.h * .6), 'pill', seed));
  };
  if (L.vertical) {
    const s = Math.min(S.w * .42, S.h * .2);
    out.push(...photo(S.cx - s / 2, S.y, s, s, th, L, f.photoUrl, 'Portrait'));
    const hdr = header(d, S.x, S.w, S.h * .1, { kicker: f.kicker, title: f.name, sub: f.role, size: u * 4.6, align: 'center', subStyle: 'accent' }).place(S.y + s + u * 2.5);
    const y = bbox(hdr).bottom + u * 3;
    const rdH = S.h * .13, pillH = u * 6.5;
    const rd = box(S.x, S.bottom - rdH, S.w, rdH), pill = box(S.x, rd.y - u * 2.5 - pillH, S.w, pillH);
    out.push(...hdr);
    push(out, transcript(box(S.x, y, S.w, pill.y - u * 3 - y), f, { ...qOpts, align: 'center' }, 'scroll', { maxLines: 6 }));
    memo(pill); out.push(progress(rd, style, f, seed));
    return out;
  }
  const lw = L.stretched ? S.w * .24 : S.w * (L.cls === 'standard' ? .32 : .3), gap = u * 5;
  const s = Math.min(lw, S.h * .52);
  const lx = S.x + (lw - s) / 2;
  out.push(...photo(lx, S.y + S.h * .04, s, s, th, L, f.photoUrl, 'Portrait'));
  out.push(...header(d, S.x, lw, S.h * .14, { kicker: f.kicker, title: f.name, sub: f.role, size: u * 4.4, align: 'center', subStyle: 'accent' }).place(S.y + S.h * .04 + s + u * 2.5));
  const rx = S.x + lw + gap;
  if (L.stretched) {
    const tw = S.w * .4, cx2 = rx + tw + gap, cw2 = S.right - cx2;
    push(out, transcript(box(rx, S.y + S.h * .06, tw, S.h * .88), f, qOpts, 'scroll', { maxLines: 7 }));
    const pillH = u * 6.5, rdH = S.h * .5;
    memo(box(cx2, S.cy - (pillH + rdH + u * 3) / 2, cw2, pillH));
    out.push(progress(box(cx2, S.cy - (pillH + rdH + u * 3) / 2 + pillH + u * 3, cw2, rdH), style, f, seed));
    return out;
  }
  const rw = S.right - rx, pillH = u * 6.5, rdH = S.h * .24;
  const rd = box(rx, S.bottom - rdH, rw, rdH), pill = box(rx, rd.y - u * 2.5 - pillH, rw, pillH);
  push(out, transcript(box(rx, S.y + S.h * .04, rw, pill.y - u * 3 - S.y - S.h * .04), f, qOpts, 'scroll', { maxLines: 5 }));
  memo(pill); out.push(progress(rd, style, f, seed));
  return out;
};

// ── 7. Countdown Track — the song is the countdown ──────────────────────────
const countdownTrack: SlideDesigner = d => {
  const { L, f, u, S, ty, th, c, m, seed } = X(d);
  const style = resolveProgressStyle(f.progress, ['countdown', 'hourglass', 'candle', 'sunrise', 'orbit'], th.id);
  const out = ground(d);
  const hasT = !!(f.transcript || '').trim();
  const wvH = u * (L.vertical ? 5 : 4.2);
  const wv = box(S.x, S.bottom - wvH, S.w, wvH);
  // An optional visualizer rises behind the waveform along the foot of the screen.
  push(out, viz(d, box(0, wv.y - u * 8, d.W, d.H - wv.y + u * 8), 'rect', 'edges', 'ORNAMENT', th.dark ? .75 : .5));
  const note = (x: number, w: number, al: 'left' | 'center', maxH: number) => f.note ? fitText(x, 0, w, f.note, ty.body(u * 2.3, { align: al, color: c.muted, label: 'Note' }), maxH, u * 1.3) : null;
  const words = (b: Box, al: 'left' | 'center', lines: number) => transcript(b, f, ty.accent(u * 2.6, { align: al }), 'single', { maxLines: lines });
  if (L.vertical) {
    const rs = Math.min(S.w, S.h * .4);
    const rd = box(S.cx - rs / 2, S.y, rs, rs);
    const st = header(d, S.x, S.w, S.h * .14, { kicker: f.kicker, title: f.title, size: u * 5.4, align: 'center', divider: true });
    const n = note(S.x, S.w, 'center', S.h * .1); if (n) st.add(n, u * 2);
    const objs = st.place(rd.bottom + u * 3);
    const tb = bbox(objs);
    out.push(progress(rd, style, f, seed), ...objs, wave(wv, 'bottom', seed));
    if (hasT) push(out, words(box(S.x, tb.bottom + u * 2.5, S.w, Math.max(u * 4, wv.y - u * 5 - tb.bottom)), 'center', 2));
    return out;
  }
  const bandTop = S.bottom - wvH - u * 3;
  const rs = Math.min(bandTop - S.y, S.w * (L.stretched ? .3 : .44));
  const tw = L.stretched ? Math.min(S.w * .34, u * 80, (S.w - rs) / 2 - u * 6) : S.w - rs - u * 6;
  const rd = box(L.stretched ? S.cx - rs / 2 : S.right - rs, S.y + (bandTop - S.y - rs) / 2, rs, rs);
  const tx = L.stretched ? Math.max(S.x, rd.x - u * 6 - tw) : S.x;
  const st = header(d, tx, tw, S.h * .3, { kicker: f.kicker, title: f.title, size: u * 6, divider: true });
  const n = note(tx, tw, 'left', S.h * .14); if (n) st.add(n, u * 2.2);
  if (hasT && !L.stretched) { const w = words(box(tx, 0, tw, u * 7), 'left', 2); if (w) st.add(w, u * 2.4); }
  out.push(progress(rd, style, f, seed), ...st.centre(S.y, bandTop - S.y), wave(wv, 'bottom', seed));
  if (L.stretched) {
    const hx = rd.right + u * 6, hw = S.right - hx;
    if (hasT) push(out, words(box(hx, S.y + S.h * .2, hw, (bandTop - S.y) * .6), 'left', 4));
    else if (hw > u * 12) out.push(...dim(m.hero(hx, S.y, hw, bandTop - S.y, L, seed), .7));
  }
  return out;
};

// ── catalogue ───────────────────────────────────────────────────────────────
const SERMON_TEXT = 'Psalm twenty-three was not written for quiet afternoons. It was written by someone who knew the dark valley. ' +
  'The promise is not that the valley disappears, but that the shepherd walks through it with us. ' +
  'Notice the turn in verse four: the psalm stops talking about God and starts talking to Him. ' +
  'That is what presence does. It changes our language from description to conversation. ' +
  'So this week, when the road narrows, say it out loud: you are with me.';
const PSALM_23 = [
  '0:00 The LORD is my shepherd; I shall not want.',
  '0:05 He maketh me to lie down in green pastures: he leadeth me beside the still waters.',
  '0:12 He restoreth my soul: he leadeth me in the paths of righteousness for his name’s sake.',
  '0:20 Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me;',
  '0:29 thy rod and thy staff they comfort me.',
  '0:34 Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.',
  '0:45 Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.',
].join('\n');
const LYRICS = [
  '0:00 Morning light on the water',
  '0:08 every shadow giving way',
  '0:16 You were here before I woke',
  '0:24 and You will hold me through the day',
  '0:32 Morning light, morning light',
  '0:40 teach my heart to say Your name',
].join('\n');
const TESTIMONY = 'Three years ago I walked into this building because my daughter asked me to. I sat in the back row and planned to leave early. ' +
  'Somebody I had never met saved me a coffee and asked my name, and the next week she remembered it. ' +
  'That is how it started for me — not with an answer, but with a welcome. I am still here, and now I am the one saving the coffee.';

export const AUDIO_TEMPLATES: SlideTemplateDef[] = [
  { id: 'audio-sermon', name: 'Sermon Audio', category: 'Audio', media: 'audio', slot: 'slide', design: sermonAudio,
    blurb: 'Message audio with title, speaker, a progress read-out, waveform and running transcript.',
    fields: [F('kicker', 'Kicker', 'Listen again'), F('title', 'Title', 'The Shepherd Who Stays'), F('speaker', 'Speaker', 'Pastor Daniel Reyes · Psalm 23'),
      F('transcript', 'Transcript', SERMON_TEXT, { multiline: true, hint: TRANSCRIPT_HINT }), ...AUDIO_FIELDS()] },
  { id: 'audio-scripture', name: 'Scripture Reading', category: 'Audio', media: 'audio', slot: 'slide', design: scriptureAudio,
    blurb: 'A recorded reading: each phrase large and karaoke-timed, a journey line beneath.',
    fields: [F('kicker', 'Kicker', 'Scripture reading'), F('reference', 'Reference', 'Psalm 23'), F('reader', 'Reader', 'Read by Grace Choi'),
      F('transcript', 'Transcript', PSALM_23, { multiline: true, hint: TRANSCRIPT_HINT }), ...AUDIO_FIELDS()] },
  { id: 'audio-now-playing', name: 'Now Playing', category: 'Audio', media: 'audio', slot: 'slide', design: nowPlaying,
    blurb: 'Track card: artwork well, title and artist, spectral waveform, meter and lyrics.',
    fields: [F('kicker', 'Kicker', 'Now playing'), F('title', 'Track', 'Morning Light'), F('artist', 'Artist', 'Grace Worship Collective'),
      F('artUrl', 'Artwork', '', { kind: 'image', hint: 'Optional album art — empty shows the visualizer in the well' }),
      F('transcript', 'Lyrics', LYRICS, { multiline: true, hint: TRANSCRIPT_HINT }), ...AUDIO_FIELDS('auto')] },
  { id: 'audio-waveform', name: 'Waveform Band', category: 'Audio', media: 'audio', slot: 'slide', design: waveformBand,
    blurb: 'One monumental waveform across the screen, a slim read-out and a single caption line.',
    fields: [F('kicker', 'Kicker', 'Listen'), F('title', 'Title', 'Evening Prayer'), F('speaker', 'Line', 'Recorded at Grace Chapel'),
      F('transcript', 'Transcript', 'Stay with us, Lord, for the evening draws near. Be our light in the darkness. Keep watch over those who work, or watch, or weep this night.', { multiline: true, hint: TRANSCRIPT_HINT }), ...AUDIO_FIELDS()] },
  { id: 'audio-viz-stage', name: 'Visualizer Stage', category: 'Audio', media: 'audio', slot: 'slide', design: vizStage,
    blurb: 'Any platform visualizer owns the ground, dancing to the audio; a plate carries the words.',
    fields: [F('kicker', 'Kicker', 'Prelude'), F('title', 'Title', 'Be Still'), F('speaker', 'Line', 'Grace Strings'),
      F('transcript', 'Transcript', '0:00 Be still, and know that I am God.\n0:20 I will be exalted among the nations.\n0:40 I will be exalted in the earth.', { multiline: true, hint: TRANSCRIPT_HINT }), ...AUDIO_FIELDS('auto')] },
  { id: 'audio-testimony', name: 'Testimony', category: 'Audio', media: 'audio', slot: 'slide', design: testimony,
    blurb: 'A voice memo: portrait, name, the story scrolling as it is told, and a candle burning down.',
    fields: [F('kicker', 'Kicker', 'Testimony'), F('name', 'Name', 'Maria Alvarez'), F('role', 'Line', 'Part of Grace since 2023'),
      F('photoUrl', 'Portrait', '', { kind: 'image', hint: 'Optional portrait' }),
      F('transcript', 'Transcript', TESTIMONY, { multiline: true, hint: TRANSCRIPT_HINT }), ...AUDIO_FIELDS()] },
  { id: 'audio-countdown', name: 'Countdown Track', category: 'Audio', media: 'audio', slot: 'slide', design: countdownTrack,
    blurb: 'The walk-in song is the countdown: big numerals, ring or hourglass running out with the music.',
    fields: [F('kicker', 'Kicker', 'Our service begins in'), F('title', 'Title', 'Sunday Worship'), F('note', 'Note', 'Find a seat, grab a coffee, and say hello to someone new.', { multiline: true }),
      F('transcript', 'Lyrics / words', '', { multiline: true, hint: TRANSCRIPT_HINT }), ...AUDIO_FIELDS()] },
];
