// designersB — Song Title, Prayer, Section Divider, Speaker Intro, Bullet
// List, Image + Caption, Benediction, Social & Connect.
import { text, line, alpha } from '../../tela/templateKit';
import { box, fitText, Stack, bbox, shift, lines, maxLineWidth, type Box } from './layout';
import { typeset } from './themes';
import { prelude, qrSlot, photo, dim, chip } from './parts';
import type { SlideDesigner, SlideObj, DesignCtx } from './types';

const ctx = (d: DesignCtx) => ({ ...d, u: d.L.u, S: d.L.safe, ty: typeset(d.th), m: d.th.motif, c: d.th.c });

/** Chips flowed into rows inside width w. */
function flowChips(d: DesignCtx, x: number, w: number, items: string[], size: number, align: 'left' | 'center'): SlideObj[] {
  const { u, th, L } = ctx(d);
  const gap = u * 1.1, rows: Array<{ objs: SlideObj[]; w: number; h: number }[]> = [[]];
  let rw = 0;
  for (const it of items) {
    const c = chip(0, 0, it, th, L, size, false, w);
    if (rw && rw + gap + c.w > w) { rows.push([]); rw = 0; }
    rows[rows.length - 1].push(c); rw += (rw ? gap : 0) + c.w;
  }
  const out: SlideObj[] = [];
  let y = 0;
  for (const row of rows) {
    const total = row.reduce((a, c) => a + c.w, 0) + gap * Math.max(0, row.length - 1);
    let cx = align === 'center' ? x + (w - total) / 2 : x;
    for (const c of row) { out.push(...shift(c.objs, cx, y)); cx += c.w + gap; }
    y += (row[0]?.h || 0) + gap;
  }
  return out;
}

// ── Song Title — the title over a watermark of the theme's hero ─────────────
export const songTitle: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c } = ctx(d);
  const out = prelude(d, L.stretched);
  const hs = L.vertical ? Math.min(S.w * 1.05, S.h * .62) : Math.min(S.h * 1.1, S.w * .62);
  out.push(...dim(m.hero(S.cx - hs / 2, S.cy - hs / 2, hs, hs, L, seed), .2));
  const cw = L.vertical ? S.w : L.stretched ? Math.min(u * 100, S.w * .5) : Math.min(S.w * .86, u * 100);
  const x0 = S.cx - cw / 2;
  const st = new Stack();
  if (f.kicker) st.add(text(x0, 0, cw, f.kicker, ty.label(u * 1.7, { align: 'center' })));
  st.add(fitText(x0, 0, cw, f.title, ty.display(u * 8, { align: 'center', label: 'Song title' }), S.h * .46), u * 1.6);
  if (f.credit) st.add(fitText(x0, 0, cw, f.credit, ty.accent(u * 2.5, { align: 'center', label: 'Writers' }), S.h * .12), u * 2);
  out.push(...st.centre(S.y, S.h * .9));
  if (f.info) { const info = text(x0, 0, cw, f.info, ty.label(u * 1.35, { align: 'center', color: c.muted, label: 'Key and licence' })); info.y = S.bottom - info.h; out.push(info); }
  return out;
};

// ── Prayer — quiet: a small light, a modest title, a long breath of space ───
export const prayer: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c } = ctx(d);
  const out = prelude(d, false);
  const hs = L.vertical ? Math.min(S.w * .56, S.h * .26) : Math.min(S.h * .34, u * 32);
  const cw = L.vertical ? S.w : Math.min(S.w * .7, u * 78);
  const x0 = S.cx - cw / 2;
  const st = new Stack();
  st.add(m.hero(S.cx - hs / 2, 0, hs, hs, L, seed));
  if (f.kicker) st.add(text(x0, 0, cw, f.kicker, ty.label(u * 1.6, { align: 'center' })), u * 3.2);
  st.add(fitText(x0, 0, cw, f.title, ty.display(u * 5, { align: 'center' }), S.h * .24), u * 1.2);
  st.add(m.divider(x0, 0, cw, 'center', L).objs, u * 2.4);
  if (f.prompt) st.add(fitText(x0, 0, cw, f.prompt, ty.body(u * 2.4, { align: 'center', color: c.muted, leading: 1.45 }), S.h * .2), u * 2.4);
  out.push(...st.centre(S.y, S.h, 0));
  return out;
};

// ── Section Divider — numeral | rule | title; a band on ultrawide ───────────
export const sectionDivider: SlideDesigner = d => {
  const { L, f, u, S, ty, m, c } = ctx(d);
  const out = prelude(d, false);
  const num = m.numeral(f.number || '1');
  const numOpts = ty.display(u * (L.vertical ? 18 : 17), { color: c.accent, wrap: false, transform: 'none', label: 'Section number', leading: 1 });
  if (L.vertical) {
    const n = fitText(S.x, 0, S.w, num, numOpts, S.h * .3); n.w = Math.min(S.w, maxLineWidth(n) + 4);
    const st = new Stack();
    st.add(n);
    st.add(line(S.x, 0, S.x + S.w, 0, alpha(c.accent, .6), Math.max(1, u * .14), { label: 'Section rule' }), u * 2.4);
    st.add(fitText(S.x, 0, S.w, f.title, ty.display(u * 8), S.h * .3), u * 2.4);
    if (f.subtitle) st.add(fitText(S.x, 0, S.w, f.subtitle, ty.accent(u * 2.8), S.h * .14), u * 1.6);
    out.push(...st.centre(S.y, S.h));
    return out;
  }
  const gap = u * 4;
  const n = fitText(S.x, 0, S.w * .4, num, numOpts, S.h * .6); const nw = Math.min(S.w * .4, maxLineWidth(n) + 4); n.w = nw;
  const tw = Math.min(L.stretched ? u * 80 : u * 76, S.w - nw - gap * 2);
  const title = fitText(0, 0, tw, f.title, ty.display(u * 8.4), S.h * .5);
  const sub = f.subtitle ? fitText(0, 0, tw, f.subtitle, ty.accent(u * 2.8), S.h * .2) : null;
  const textW = Math.min(tw, Math.max(maxLineWidth(title), sub ? maxLineWidth(sub) : 0));
  title.w = textW + 2; if (sub) sub.w = textW + 2;
  const st = new Stack().add(title);
  if (sub) st.add(sub, u * 1.6);
  const tb = st.height();
  const rowW = nw + gap * 2 + textW;
  const x0 = Math.max(S.x, S.cx - rowW / 2), cy = S.cy, nh = n.fontSize || 0;
  n.x = x0; n.y = cy - nh * .62; n.h = nh;
  const rx = x0 + nw + gap, rh = Math.max(tb, nh * .8);
  out.push(line(rx, cy - rh / 2, rx, cy + rh / 2, alpha(c.accent, .7), Math.max(1.5, u * .18), { label: 'Section rule' }), n);
  out.push(...shift(st.place(cy - tb / 2), rx + gap, 0));
  if (L.stretched || L.cls === 'wide') {
    // The band: hairlines run out from the row to the safe edges.
    const end = rx + gap + textW;
    if (x0 - S.x > u * 8) out.push(line(S.x, cy, x0 - gap, cy, alpha(c.accent, .35), Math.max(1, u * .1), { label: 'Band rule' }));
    if (S.right - end > u * 8) out.push(line(end + gap, cy, S.right, cy, alpha(c.accent, .35), Math.max(1, u * .1), { label: 'Band rule' }));
  }
  return out;
};

// ── Speaker Intro — portrait well and a short biography ─────────────────────
export const speakerIntro: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c, th } = ctx(d);
  const out = prelude(d, false);
  const bio = (x: number, w: number, align: 'left' | 'center', maxBio: number) => {
    const st = new Stack();
    if (f.kicker) st.add(text(x, 0, w, f.kicker, ty.label(u * 1.7, { align })));
    st.add(fitText(x, 0, w, f.name, ty.display(u * 6.6, { align, label: 'Speaker name' }), S.h * .3), u * 1.2);
    if (f.role) st.add(fitText(x, 0, w, f.role, ty.body(u * 2.4, { align, weight: 600, color: c.muted, label: 'Role' }), u * 7), u * 1.4);
    st.add(m.divider(x, 0, w, align, L).objs, u * 2.4);
    if (f.bio) st.add(fitText(x, 0, w, f.bio, ty.body(u * 2.2, { align, leading: 1.45 }), maxBio), u * 2.4);
    return st;
  };
  if (L.vertical) {
    const ph = S.h * (L.cls === 'tall' ? .36 : .4), pw = Math.min(S.w * .72, ph * .82);
    const st = bio(S.x, S.w, 'center', S.h * .2);
    const p = photo(S.cx - pw / 2, 0, pw, ph, th, L, f.photoUrl, 'Speaker portrait');
    const all = new Stack().add(p).add(st.place(0), u * 4);
    out.push(...all.centre(S.y, S.h));
    return out;
  }
  const ph = S.h * .88, pw = Math.min(ph * .8, S.w * .36);
  const px = L.stretched ? S.x + S.w * .06 : S.x;
  out.push(...photo(px, S.cy - ph / 2, pw, ph, th, L, f.photoUrl, 'Speaker portrait'));
  const x = px + pw + u * 6, w = Math.min(S.right - x, L.stretched ? u * 82 : S.right - x);
  out.push(...bio(x, w, 'left', S.h * .34).centre(S.y, S.h));
  if (L.stretched) {
    const rest = S.right - (x + w) - u * 6, hs = Math.min(rest, S.h * .8);
    if (hs > u * 10) out.push(...dim(m.hero(x + w + u * 6 + (rest - hs) / 2, S.cy - hs / 2, hs, hs, L, seed), .8));
  }
  return out;
};

// ── Bullet List — header + items that re-column with the aspect ─────────────
export const bulletList: SlideDesigner = d => {
  const { L, f, u, S, ty, m, c } = ctx(d);
  const out = prelude(d, false);
  const items = lines(f.items).slice(0, 12).map(s => { const p = s.split(/\s+[—–-]\s+/); return { a: p[0], b: p.slice(1).join(' — ') }; });
  const rowsPer = { tall: 12, portrait: 8, standard: 5, wide: 4, ultra: 3, panorama: 2 }[L.cls];
  const cols = Math.min(3, Math.max(1, Math.ceil(items.length / rowsPer)));
  const rows = Math.max(1, Math.ceil(items.length / cols));
  let area: Box;
  if (L.stretched) {
    const hw = Math.min(S.w * .28, u * 60);
    const head = new Stack();
    if (f.kicker) head.add(text(S.x, 0, hw, f.kicker, ty.label(u * 1.7)));
    head.add(fitText(S.x, 0, hw, f.title, ty.display(u * 6.4), S.h * .6), u * 1.2);
    head.add(m.divider(S.x, 0, hw, 'left', L).objs, u * 2.4);
    out.push(...head.centre(S.y, S.h));
    area = box(S.x + hw + u * 8, S.y, S.w - hw - u * 8, S.h);
  } else {
    const head = new Stack();
    if (f.kicker) head.add(text(S.x, 0, S.w, f.kicker, ty.label(u * 1.7)));
    head.add(fitText(S.x, 0, S.w, f.title, ty.display(u * 6.4), S.h * .22), u * 1.2);
    head.add(m.divider(S.x, 0, S.w, 'left', L).objs, u * 2.2);
    const placed = head.place(S.y);
    out.push(...placed);
    const top = bbox(placed).bottom + u * 3.6;
    area = box(S.x, top, S.w, S.bottom - top);
  }
  const gap = u * 4, colW = (area.w - gap * (cols - 1)) / cols, rowGap = u * 2;
  let size = Math.min(u * 3.6, (area.h - rowGap * (rows - 1)) / rows * .5);
  let blocks: SlideObj[][] = [];
  for (let iter = 0; iter < 14; iter++) {
    const r = size * .5, tx = r * 2 + size * .9;
    blocks = items.map(it => {
      const a = fitText(tx, 0, colW - tx, it.a, ty.body(size, { weight: 600, leading: 1.18, label: 'Item' }), size * 2.6);
      const objs: SlideObj[] = [a];
      if (it.b) objs.push(text(tx, a.h + size * .3, colW - tx, it.b, ty.body(size * .78, { color: c.muted, leading: 1.2, label: 'Item detail' })));
      return objs;
    });
    const maxH = Math.max(...blocks.map(b => bbox(b).h), 0);
    if (maxH * rows + rowGap * (rows - 1) <= area.h || size < u * 1.4) break;
    size *= .9;
  }
  const r = size * .5;
  const step = Math.max(...blocks.map(b => bbox(b).h), 0) + rowGap;
  const total = step * rows - rowGap;
  const y0 = area.y + Math.max(0, (area.h - total) / 2) * (L.stretched ? 1 : .6);
  blocks.forEach((b, i) => {
    const col = Math.floor(i / rows), row = i % rows;
    const x = area.x + col * (colW + gap), y = y0 + row * step;
    out.push(...m.marker(x + r, y + size * .55, r * .72, '', L));
    out.push(...shift(b, x, y));
  });
  return out;
};

// ── Image + Caption — a bleeding photo and a caption column ─────────────────
export const imageCaption: SlideDesigner = d => {
  const { L, f, u, S, ty, m, c, th } = ctx(d);
  const out = prelude(d, false);
  const cap = (x: number, w: number, maxT: number) => {
    const st = new Stack();
    if (f.kicker) st.add(text(x, 0, w, f.kicker, ty.label(u * 1.6)));
    st.add(fitText(x, 0, w, f.title, ty.display(u * 5.6), maxT), u * 1.2);
    st.add(m.divider(x, 0, w, 'left', L).objs, u * 2.2);
    if (f.caption) st.add(fitText(x, 0, w, f.caption, ty.body(u * 2.3, { leading: 1.45 }), maxT * 1.2), u * 2.2);
    if (f.credit) st.add(text(x, 0, w, f.credit, ty.label(u * 1.25, { color: c.muted, label: 'Photo credit' })), u * 2);
    return st;
  };
  if (L.vertical) {
    const ih = d.H * (L.cls === 'tall' ? .56 : .52);
    out.push(...photo(0, 0, d.W, ih, th, L, f.imageUrl, 'Photo', { bleed: true, tilt: false }));
    out.push(...cap(S.x, S.w, S.h * .16).centre(ih + u * 3, S.bottom - ih - u * 3, 0));
    return out;
  }
  const iw = d.W * (L.cls === 'standard' ? .56 : L.cls === 'wide' ? .6 : L.cls === 'ultra' ? .58 : .5);
  out.push(...photo(0, 0, iw, d.H, th, L, f.imageUrl, 'Photo', { bleed: true, tilt: false }));
  const x = iw + u * 6, w = Math.min(S.right - x, u * 76);
  out.push(...cap(x, w, S.h * .3).centre(S.y, S.h));
  return out;
};

// ── Benediction — a framed tablet of blessing ───────────────────────────────
export const benediction: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c } = ctx(d);
  const out = prelude(d);
  const cw = L.vertical ? S.w - u * 4 : L.stretched ? Math.min(S.w * .5, u * 96) : Math.min(S.w * .78, u * 96);
  const x0 = S.cx - cw / 2;
  if (L.stretched) {
    const fw = Math.min((S.w - cw) / 2 - u * 8, S.h * .7);
    if (fw > u * 10) out.push(...dim(m.hero(S.x, S.cy - fw / 2, fw, fw, L, seed), .6), ...dim(m.hero(S.right - fw, S.cy - fw / 2, fw, fw, L, seed + 2), .6));
  }
  const foot = f.footer ? text(x0, 0, cw, f.footer, ty.label(u * 1.4, { align: 'center', color: c.muted, label: 'Footer' })) : null;
  if (foot) foot.y = S.bottom - foot.h;
  const avail = S.h - (foot ? foot.h + u * 3 : 0);
  const pad = u * 3.2;
  const st = new Stack();
  // Words sit ON the theme panel, so they take the panel's inks.
  if (f.kicker) st.add(text(x0 + pad, 0, cw - pad * 2, f.kicker, ty.label(u * 1.7, { align: 'center', color: c.panelMuted })));
  st.add(m.divider(x0 + pad, 0, cw - pad * 2, 'center', L).objs, u * 2);
  st.add(fitText(x0 + pad, 0, cw - pad * 2, f.text, ty.sentence(u * 4.2, { align: 'center', color: c.panelInk, label: 'Blessing' }), avail * .56), u * 2.4);
  if (f.reference) st.add(text(x0 + pad, 0, cw - pad * 2, f.reference, ty.accent(u * 2.2, { align: 'center', color: c.panelMuted, label: 'Reference' })), u * 2);
  const sh = st.height();
  const ph = Math.min(avail, sh + pad * 2), py = S.y + (avail - ph) / 2;
  out.push(...m.panel(x0, py, cw, ph, L));
  out.push(...st.place(py + (ph - sh) / 2));
  if (foot) out.push(foot);
  return out;
};

// ── Social & Connect — handle, platforms, a connect-card QR ─────────────────
export const socialConnect: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c, th } = ctx(d);
  const out = prelude(d, false);
  const plats = lines(f.platforms).slice(0, 8);
  const ident = (x: number, w: number, align: 'left' | 'center') => {
    const st = new Stack();
    st.add(fitText(x, 0, w, f.title, ty.display(u * 6.4, { align }), S.h * .24));
    if (f.handle) st.add(fitText(x, 0, w, f.handle, ty.display(u * 4.6, { align, transform: 'none', color: c.accent, label: 'Handle' }), u * 12), u * 1.4);
    if (f.web) st.add(text(x, 0, w, f.web, ty.body(u * 2.3, { align, weight: 600, color: c.muted, label: 'Website' })), u * 1.4);
    return st;
  };
  const connect = (cx: number, top: number, qs: number, w: number) => {
    const objs = qrSlot(cx - qs / 2, top, qs, th, L, seed, f.qrUrl, f.qrLabel);
    if (f.connect) objs.push(fitText(cx - w / 2, top + qs + u * 4.6, w, f.connect, ty.body(u * 2, { align: 'center', color: c.muted, leading: 1.4, label: 'Connect prompt' }), u * 9));
    return objs;
  };
  if (L.vertical) {
    const qs = Math.min(S.w * .42, S.h * .2);
    const st = ident(S.x, S.w, 'center');
    if (plats.length) st.add(flowChips(d, S.x, S.w, plats, u * 1.5, 'center'), u * 3);
    st.add(connect(S.cx, 0, qs, S.w), u * 4);
    out.push(...st.centre(S.y, S.h));
    return out;
  }
  if (L.stretched) {
    const zw = (S.w - u * 16) / 3;
    out.push(...ident(S.x, zw, 'left').centre(S.y, S.h));
    if (plats.length) out.push(...new Stack().add(flowChips(d, S.x + zw + u * 8, zw, plats, u * 1.6, 'center')).centre(S.y, S.h));
    const qs = Math.min(S.h * .5, zw * .6);
    out.push(...new Stack().add(connect(S.right - zw / 2, 0, qs, zw)).centre(S.y, S.h));
    return out;
  }
  const lw = S.w * .58;
  const st = ident(S.x, lw, 'left');
  st.add(m.divider(S.x, 0, lw, 'left', L).objs, u * 2.6);
  if (plats.length) st.add(flowChips(d, S.x, lw, plats, u * 1.5, 'left'), u * 2.6);
  out.push(...st.centre(S.y, S.h));
  const rw = S.w - lw - u * 6, qs = Math.min(S.h * .48, rw * .7);
  out.push(...new Stack().add(connect(S.right - rw / 2, 0, qs, rw)).centre(S.y, S.h));
  return out;
};
