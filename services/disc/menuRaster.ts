// Browser rasteriser: draws menus (preview + remote simulator), button state bitmaps for the IG
// stream, pop-up panels, and subtitle cues for PGS. Same drawing code for preview and output, so
// what the filmmaker sees in Fabula is what the player shows.
import type { Raster } from './build';
import type { Rgba } from './ig';
import { quantize } from './palette';
import { parseSrt, type Cue } from './pgs';
import type { ButtonStyle, DiscMenu, DiscProject, DiscTitle, MenuButton, MenuDecor } from './project';
import { GRAPHICS_PLANE } from './spec';
import { btnArtKey, menuArtKey, motionArtKey } from './telaArt';

export type BtnState = 'normal' | 'selected' | 'activated';
const { w: W, h: H } = GRAPHICS_PLANE;

const fontOf = (s: { font: string; size: number; weight?: number }) => `${s.weight || 500} ${s.size}px "${s.font}", Inter, system-ui, sans-serif`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}

/** Draw one button at (ox, oy) in its state. */
export function drawButton(ctx: CanvasRenderingContext2D, b: MenuButton, state: BtnState, ox = b.x, oy = b.y, thumb?: CanvasImageSource, art?: CanvasImageSource) {
  if (art) {
    // Council/Tela button: the still (if any) sits under the designed frame for this state.
    if (b.thumb) { if (thumb) ctx.drawImage(thumb, ox, oy, b.w, b.h); else stillStandIn(ctx, ox, oy, b.w, b.h, b.thumb.timeSec); }
    ctx.drawImage(art, ox, oy, b.w, b.h);
    return;
  }
  const s: ButtonStyle = b.style;
  const col = state === 'normal' ? s.color : state === 'selected' ? s.selColor : s.actColor;
  const bg = state === 'normal' ? s.bg : state === 'selected' ? s.selBg ?? s.bg : s.actBg ?? s.selBg ?? s.bg;
  ctx.save();
  if (bg) { ctx.fillStyle = bg; roundRect(ctx, ox, oy, b.w, b.h, s.radius ?? 0); ctx.fill(); }
  let textY = oy + b.h / 2;
  if (b.thumb) {
    const th = b.h - s.size * 1.6;
    if (thumb) ctx.drawImage(thumb, ox, oy, b.w, th);
    else stillStandIn(ctx, ox, oy, b.w, th, b.thumb.timeSec);
    if (state !== 'normal') { ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.strokeRect(ox + 3, oy + 3, b.w - 6, th - 6); }
    textY = oy + th + s.size * 0.85;
  }
  ctx.font = fontOf(s); ctx.fillStyle = col; ctx.textBaseline = 'middle';
  const align = s.align || 'left';
  ctx.textAlign = align;
  const pad = s.mark === 'arrow' ? s.size * 1.1 : 12;
  const tx = align === 'center' ? ox + b.w / 2 : align === 'right' ? ox + b.w - 12 : ox + pad;
  if (state !== 'normal' && s.mark === 'glow') { ctx.shadowColor = col; ctx.shadowBlur = 18; }
  ctx.fillText(b.label, tx, textY, b.w - pad - 12);
  ctx.shadowBlur = 0;
  if (state !== 'normal' && !b.thumb) {
    const m = ctx.measureText(b.label); const tw = Math.min(m.width, b.w - 24);
    const x0 = align === 'center' ? tx - tw / 2 : align === 'right' ? tx - tw : tx;
    if (s.mark === 'underline') ctx.fillRect(x0, textY + s.size * 0.62, tw, Math.max(3, s.size * 0.08));
    if (s.mark === 'arrow') { ctx.beginPath(); ctx.moveTo(ox + 8, textY - s.size * 0.3); ctx.lineTo(ox + 8 + s.size * 0.5, textY); ctx.lineTo(ox + 8, textY + s.size * 0.3); ctx.closePath(); ctx.fill(); }
  }
  ctx.restore();
}

const hexRgb = (hex: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); const n = m ? parseInt(m[1], 16) : 0x14131a; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixHex = (hex: string, to: number, amt: number) => `rgb(${hexRgb(hex).map(v => Math.round(v + (to - v) * amt)).join(',')})`;

/** Stand-in for a motion background (a looped title) until real frames are grabbed: the template's
 *  ground colour, lit like a film still (key light, horizon haze, vignette). */
export function drawStandIn(ctx: CanvasRenderingContext2D, tint: string, film: boolean) {
  const light = (hexRgb(tint).reduce((a, b) => a + b, 0) / 3) > 140;
  const toward = light ? 0 : 255;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mixHex(tint, toward, light ? 0.02 : 0.05)); g.addColorStop(0.58, mixHex(tint, toward, light ? 0.06 : 0.16)); g.addColorStop(1, mixHex(tint, 0, light ? 0.06 : 0.35));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = ctx.createRadialGradient(W * 0.68, H * 0.42, 20, W * 0.68, H * 0.42, W * 0.55);
  r.addColorStop(0, light ? 'rgba(255,255,255,0.55)' : `rgba(255,255,255,${film ? 0.12 : 0.09})`); r.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, light ? 'rgba(60,40,20,0.18)' : 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

/** Chapter-thumbnail stand-in: a distinct dusk-to-night still per chapter time. */
function stillStandIn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  const hue = (200 + (t / 37) * 23) % 360;
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, `hsl(${hue},38%,34%)`); g.addColorStop(0.62, `hsl(${(hue + 25) % 360},45%,22%)`); g.addColorStop(1, `hsl(${(hue + 40) % 360},30%,9%)`);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = `hsla(${(hue + 180) % 360},70%,75%,0.35)`; ctx.beginPath(); ctx.arc(x + w * (0.25 + ((t * 7) % 50) / 100), y + h * 0.38, h * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + h * 0.72);
  for (let i = 0; i <= 8; i++) ctx.lineTo(x + (w * i) / 8, y + h * (0.66 + 0.08 * Math.sin(t * 0.01 + i * 1.7)));
  ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
}

/** Motion layers + flicker at time t (same maths the ffmpeg menu clip uses). */
export function motionPos(l: { from: [number, number]; to: [number, number]; periodSec: number; ease: 'sine' | 'linear' }, t: number): [number, number] {
  const ph = (t % l.periodSec) / l.periodSec;
  const k = l.ease === 'sine' ? 0.5 - 0.5 * Math.cos(2 * Math.PI * ph) : ph;
  return [l.from[0] + (l.to[0] - l.from[0]) * k, l.from[1] + (l.to[1] - l.from[1]) * k];
}
export function drawMotion(ctx: CanvasRenderingContext2D, menu: DiscMenu, t: number, art: Map<string, CanvasImageSource>) {
  const m = menu.motion!;
  m.layers.forEach((l, i) => {
    const img = art.get(motionArtKey(menu.id, i)); if (!img) return;
    const [x, y] = motionPos(l, t);
    ctx.save(); ctx.globalAlpha = l.opacity ?? 1; if (l.blend === 'screen') ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(img, x, y, l.w, l.h); ctx.restore();
  });
  if (m.flicker) {
    const f = m.flicker.amount * (0.6 * Math.sin(2 * Math.PI * m.flicker.hz * t) + 0.4 * Math.sin(2 * Math.PI * m.flicker.hz * 2.7 * t + 1.3));
    ctx.save(); ctx.fillStyle = f > 0 ? `rgba(255,190,120,${f})` : `rgba(0,0,0,${-f})`; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
}

export function drawDecor(ctx: CanvasRenderingContext2D, d: MenuDecor, images?: Map<string, CanvasImageSource>) {
  ctx.save();
  if (d.kind === 'rect') { ctx.globalAlpha = d.opacity ?? 1; ctx.fillStyle = d.fill; roundRect(ctx, d.x, d.y, d.w, d.h, d.radius || 0); ctx.fill(); }
  else if (d.kind === 'image') { const im = images?.get(d.src); ctx.globalAlpha = d.opacity ?? 1; if (im) ctx.drawImage(im, d.x, d.y, d.w, d.h); }
  else {
    ctx.font = fontOf(d); ctx.fillStyle = d.color; ctx.textAlign = d.align || 'left'; ctx.textBaseline = 'top';
    if (d.letterSpacing && 'letterSpacing' in ctx) (ctx as any).letterSpacing = `${d.letterSpacing}px`;
    ctx.fillText(d.text, d.x, d.y);
  }
  ctx.restore();
}

export interface DrawOpts { /** seconds into the menu loop, for motion layers */ time?: number; art?: Map<string, CanvasImageSource>; selected?: string; activated?: string; showNav?: boolean; showSafe?: boolean; background?: CanvasImageSource; images?: Map<string, CanvasImageSource>; thumbs?: Map<string, CanvasImageSource>; filmUnder?: boolean }

/** Whole-menu preview at 1920×1080. */
export function drawMenu(ctx: CanvasRenderingContext2D, menu: DiscMenu, o: DrawOpts = {}) {
  ctx.clearRect(0, 0, W, H);
  if (o.background) ctx.drawImage(o.background, 0, 0, W, H);
  else if (menu.background.kind === 'color' && menu.background.value !== 'transparent') { ctx.fillStyle = menu.background.value; ctx.fillRect(0, 0, W, H); }
  else if (menu.background.kind === 'image' && o.images?.get(menu.background.value)) ctx.drawImage(o.images.get(menu.background.value)!, 0, 0, W, H);
  else drawStandIn(ctx, o.filmUnder ? '#2a3440' : (menu.background.value && menu.background.value !== 'transparent' ? menu.background.value : '#14131a'), !!o.filmUnder);
  if (menu.motion && o.art) drawMotion(ctx, menu, o.time ?? 0, o.art);
  const art = o.art?.get(menuArtKey(menu.id));
  if (art) ctx.drawImage(art, 0, 0, W, H);
  else for (const d of menu.decor) drawDecor(ctx, d, o.images);
  for (const b of menu.buttons) {
    const st: BtnState = b.id === o.activated ? 'activated' : b.id === o.selected ? 'selected' : 'normal';
    drawButton(ctx, b, st, b.x, b.y, o.thumbs?.get(b.id), o.art?.get(btnArtKey(menu.id, b.id, st)));
  }
  if (o.showSafe) {
    ctx.save(); ctx.setLineDash([12, 10]); ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,200,0,.55)'; ctx.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
    ctx.strokeStyle = 'rgba(0,200,255,.45)'; ctx.strokeRect(W * 0.1, H * 0.1, W * 0.8, H * 0.8);
    ctx.restore();
  }
  if (o.showNav) {
    ctx.save(); ctx.strokeStyle = 'rgba(127,212,255,.7)'; ctx.fillStyle = 'rgba(127,212,255,.7)'; ctx.lineWidth = 3;
    const c = (b: MenuButton) => [b.x + b.w / 2, b.y + b.h / 2];
    for (const b of menu.buttons) for (const n of Object.values(b.nav)) {
      const t = menu.buttons.find(x => x.id === n); if (!t || t.id === b.id) continue;
      const [x0, y0] = c(b), [x1, y1] = c(t); const a = Math.atan2(y1 - y0, x1 - x0);
      const out = (bb: MenuButton, dir: number) => { const dx = Math.cos(a) * dir, dy = Math.sin(a) * dir; const k = Math.min(dx ? (bb.w / 2 + 6) / Math.abs(dx) : Infinity, dy ? (bb.h / 2 + 6) / Math.abs(dy) : Infinity); return k; };
      // Offset parallel arrows (A→B and B→A) so both directions stay readable.
      const nx = -Math.sin(a) * 7, ny = Math.cos(a) * 7;
      const ks = out(b, 1), ke = out(t, -1);
      const sx = x0 + Math.cos(a) * ks + nx, sy = y0 + Math.sin(a) * ks + ny, ex = x1 - Math.cos(a) * ke + nx, ey = y1 - Math.sin(a) * ke + ny;
      if (Math.hypot(ex - sx, ey - sy) < 12) continue;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 14 * Math.cos(a - 0.4), ey - 14 * Math.sin(a - 0.4)); ctx.lineTo(ex - 14 * Math.cos(a + 0.4), ey - 14 * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}

const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const toRgba = (c: HTMLCanvasElement): Rgba => ({ w: c.width, h: c.height, data: c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data });

export function buttonArt(b: MenuButton, thumb?: CanvasImageSource, art?: Map<string, CanvasImageSource>, menuId?: string) {
  const st = (state: BtnState) => { const c = canvas(b.w, b.h); drawButton(c.getContext('2d')!, b, state, 0, 0, thumb, menuId ? art?.get(btnArtKey(menuId, b.id, state)) : undefined); return toRgba(c); };
  return { normal: st('normal'), selected: st('selected'), activated: st('activated') };
}

export function panelArt(menu: DiscMenu, art?: Map<string, CanvasImageSource>): { x: number; y: number; img: Rgba } | undefined {
  const layer = art?.get(menuArtKey(menu.id));
  if (layer) {
    // Crop the full-plane Tela art to its painted box so the IG object stays small.
    const full = canvas(W, H); const fx = full.getContext('2d')!; fx.drawImage(layer, 0, 0, W, H);
    const d = fx.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 4) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return undefined;
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(W - 1, x1 + 2); y1 = Math.min(H - 1, y1 + 2);
    const c = canvas(x1 - x0 + 1, y1 - y0 + 1); c.getContext('2d')!.drawImage(full, -x0, -y0);
    return { x: x0, y: y0, img: toRgba(c) };
  }
  if (!menu.decor.length) return undefined;
  const box = menu.decor.reduce((a, d) => {
    const r = d.kind === 'text' ? { x: d.align === 'center' ? d.x - 900 : d.x, y: d.y, w: 1800, h: d.size * 1.4 } : d;
    return { x0: Math.min(a.x0, r.x), y0: Math.min(a.y0, r.y), x1: Math.max(a.x1, r.x + r.w), y1: Math.max(a.y1, r.y + r.h) };
  }, { x0: W, y0: H, x1: 0, y1: 0 });
  const x = Math.max(0, Math.floor(box.x0)), y = Math.max(0, Math.floor(box.y0));
  const c = canvas(Math.min(W, box.x1) - x, Math.min(H, box.y1) - y);
  const ctx = c.getContext('2d')!; ctx.translate(-x, -y);
  for (const d of menu.decor) drawDecor(ctx, d);
  return { x, y, img: toRgba(c) };
}

/** Subtitle cues → bitmaps placed bottom-centre inside title-safe, white with a soft black edge. */
export function renderCues(srt: string, video: { w: number; h: number }, o: { size?: number; forced?: boolean } = {}): Cue[] {
  const scale = video.h / 1080; const size = Math.round((o.size || 46) * scale);
  return parseSrt(srt).map(cue => {
    const lines = cue.text.split('\n');
    const probe = canvas(10, 10).getContext('2d')!; probe.font = `600 ${size}px Inter, system-ui, sans-serif`;
    const w = Math.ceil(Math.max(...lines.map(l => probe.measureText(l).width)) + size);
    const h = Math.ceil(lines.length * size * 1.25 + size * 0.4);
    const c = canvas(w, h); const ctx = c.getContext('2d')!;
    ctx.font = probe.font; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
    lines.forEach((l, i) => { const y = size * 0.2 + i * size * 1.25; ctx.lineWidth = size * 0.16; ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.strokeText(l, w / 2, y); ctx.fillStyle = '#fff'; ctx.fillText(l, w / 2, y); });
    const rgba = ctx.getImageData(0, 0, w, h).data;
    return { startSec: cue.startSec, endSec: cue.endSec, image: quantize(rgba, w, h, 16), x: Math.round((video.w - w) / 2), y: Math.round(video.h * 0.9 - h), forced: o.forced };
  });
}

/** Raster with every Tela layer rendered first — use this for real builds. */
export async function prepareRaster(p: DiscProject): Promise<Raster> {
  const { prepareArt, menuArtPng, layerPng } = await import('./telaArt');
  const art = await prepareArt(p);
  return {
    ...browserRaster(p, art),
    menuArtPng: async id => { const m = p.menus.find(x => x.id === id); return m ? menuArtPng(m) : undefined; },
    motionPngs: async id => { const m = p.menus.find(x => x.id === id); return m?.motion ? Promise.all(m.motion.layers.map(l => layerPng(l.art, l.w, l.h))) : []; },
  };
}

export function browserRaster(p: DiscProject, art?: Map<string, CanvasImageSource>): Raster {
  return {
    buttons: (menuId, buttonId) => {
      const b = p.menus.find(m => m.id === menuId)!.buttons.find(x => x.id === buttonId)!;
      return buttonArt(b, undefined, art, menuId);
    },
    panel: (menuId) => panelArt(p.menus.find(m => m.id === menuId)!, art),
    cues: (t: DiscTitle, k: number) => { const s = t.subtitles[k]; return s?.srt ? renderCues(s.srt, p.format === 'UHD' ? GRAPHICS_PLANE : p.video, { forced: s.forced }) : []; },
  };
}
