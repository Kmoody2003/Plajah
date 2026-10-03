// designersA — Welcome, Sermon Title, Sermon Point, Big Quote, Announcement,
// Event, Giving, Countdown. Each is its own composition; each re-flows across
// tall / portrait / standard / wide / ultra / panorama (see layout.ts).
import { rect, text, line, alpha, isDark } from '../../tela/templateKit';
import { box, fitText, Stack, bbox, shift, type Box } from './layout';
import { typeset, withAmb } from './themes';
import { prelude, qrSlot, photo, dim } from './parts';
import type { SlideDesigner, SlideObj, DesignCtx } from './types';

const ctx = (d: DesignCtx) => ({ ...d, u: d.L.u, S: d.L.safe, ty: typeset(d.th), m: d.th.motif, c: d.th.c });

/** Big numeral centred in a marker of radius r. */
function numeralIn(d: DesignCtx, cx: number, cy: number, r: number, value: string): SlideObj[] {
  const { ty, m, c } = ctx(d);
  const n = fitText(cx - r * .82, 0, r * 1.64, value, ty.display(r * 1.15, { align: 'center', wrap: false, transform: 'none', color: c.markerInk, label: 'Numeral' }), r * 2);
  const size = n.fontSize || r;
  n.y = cy - size * .66; n.h = size;
  return [...m.marker(cx, cy, r, value, d.L), n];
}

// ── Welcome — a monumental centred greeting ─────────────────────────────────
export const welcome: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c } = ctx(d);
  const out = prelude(d);
  let col: Box; const heroes: Box[] = [];
  if (L.vertical) {
    const hh = S.h * (L.cls === 'tall' ? .3 : .24);
    heroes.push(box(S.x, S.y, S.w, hh));
    col = box(S.x, S.y + hh + u * 2, S.w, S.h - hh - u * 2);
  } else if (L.stretched) {
    const cw = Math.min(S.w * (L.cls === 'panorama' ? .4 : .5), u * 92);
    col = box(S.cx - cw / 2, S.y, cw, S.h);
    const fw = Math.min((S.w - cw) / 2 - u * 5, S.h * .9);
    if (fw > u * 8) heroes.push(box(col.x - u * 5 - fw, S.cy - fw / 2, fw, fw), box(col.right + u * 5, S.cy - fw / 2, fw, fw));
  } else {
    const cw = Math.min(S.w, u * 96);
    col = box(S.cx - cw / 2, S.y, cw, S.h);
  }
  heroes.forEach((b, i) => out.push(...m.hero(b.x, b.y, b.w, b.h, L, seed + i)));
  const foot = f.footer ? text(col.x, 0, col.w, f.footer, ty.label(u * 1.5, { align: 'center', color: c.muted, label: 'Service time' })) : null;
  if (foot) foot.y = col.bottom - foot.h;
  const st = new Stack();
  if (f.kicker) st.add(text(col.x, 0, col.w, f.kicker, ty.label(u * 1.8, { align: 'center' })));
  st.add(fitText(col.x, 0, col.w, f.title, ty.display(u * (L.vertical ? 7.4 : 8.6), { align: 'center' }), col.h * .46), u * 1.6);
  st.add(m.divider(col.x, 0, col.w, 'center', L).objs, u * 2.4);
  if (f.subtitle) st.add(fitText(col.x, 0, col.w, f.subtitle, ty.accent(u * 3, { align: 'center' }), col.h * .2), u * 2.4);
  out.push(...st.centre(col.y, col.h - (foot ? foot.h + u * 2 : 0)));
  if (foot) out.push(foot);
  return out;
};

// ── Sermon Title — series, title, speaker; text block against a hero zone ───
export const sermonTitle: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c } = ctx(d);
  const out = prelude(d, false);
  let tb: Box, hb: Box;
  if (L.vertical) {
    const hh = S.h * (L.cls === 'tall' ? .4 : .34);
    hb = box(S.x, S.y, S.w, hh); tb = box(S.x, S.y + hh + u * 3, S.w, S.h - hh - u * 3);
  } else if (L.stretched) {
    const tw = Math.min(u * 84, S.w * .46), x0 = S.x + (L.cls === 'panorama' ? S.w * .06 : 0);
    tb = box(x0, S.y, tw, S.h);
    const rest = S.right - tb.right - u * 6, hs = Math.min(rest, S.h);
    hb = box(tb.right + u * 6 + (rest - hs) / 2, S.cy - hs / 2, hs, hs);
  } else {
    const tw = S.w * (L.cls === 'standard' ? .64 : .56);
    tb = box(S.x, S.y, tw, S.h); hb = box(S.x + tw + u * 4, S.y, S.w - tw - u * 4, S.h);
  }
  out.push(...m.hero(hb.x, hb.y, hb.w, hb.h, L, seed));
  const st = new Stack();
  if (f.series) st.add(text(tb.x, 0, tb.w, f.series, ty.label(u * 1.7, { label: 'Series' })));
  st.add(fitText(tb.x, 0, tb.w, f.title, ty.display(u * (L.vertical ? 7 : 7.8), { label: 'Sermon title' }), tb.h * .5), u * 1.4);
  st.add(m.divider(tb.x, 0, tb.w, 'left', L).objs, u * 2.4);
  if (f.speaker) st.add(text(tb.x, 0, tb.w, f.speaker, ty.body(u * 2.5, { weight: 600, label: 'Speaker' })), u * 2.2);
  if (f.reference) st.add(text(tb.x, 0, tb.w, f.reference, ty.accent(u * 2.2, { color: c.muted, label: 'Scripture reference' })), u * .9);
  out.push(...st.centre(tb.y, tb.h, L.vertical ? 0 : -.02));
  return out;
};

// ── Sermon Point — a numeral column and one strong sentence ─────────────────
export const sermonPoint: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c } = ctx(d);
  const out = prelude(d, false);
  const num = m.numeral(f.number || '1');
  if (L.vertical) {
    const r = Math.min(S.w * .16, u * 6.5);
    const st = new Stack();
    st.add(numeralIn(d, S.x + r, r, r, num));
    if (f.kicker) st.add(text(S.x, 0, S.w, f.kicker, ty.label(u * 1.7)), u * 3);
    st.add(fitText(S.x, 0, S.w, f.point, ty.sentence(u * 5.6), S.h * .48), u * 1.4);
    st.add(m.divider(S.x, 0, S.w, 'left', L).objs, u * 2.6);
    if (f.support) st.add(fitText(S.x, 0, S.w, f.support, ty.accent(u * 2.5), S.h * .16), u * 2.2);
    out.push(...st.centre(S.y, S.h));
    return out;
  }
  const cw = L.stretched ? Math.min(S.w * .62, u * 112) : Math.min(S.w, u * 116);
  const x0 = L.stretched ? S.x + (S.w * .62 - cw) / 2 + S.w * .02 : S.cx - cw / 2;
  const r = u * 6.4, gap = u * 4, tx = x0 + r * 2 + gap, tw = cw - r * 2 - gap;
  const st = new Stack();
  if (f.kicker) st.add(text(tx, 0, tw, f.kicker, ty.label(u * 1.7)));
  st.add(fitText(tx, 0, tw, f.point, ty.sentence(u * 6.2), S.h * .62), u * 1.4);
  st.add(m.divider(tx, 0, tw, 'left', L).objs, u * 2.6);
  if (f.support) st.add(fitText(tx, 0, tw, f.support, ty.accent(u * 2.5), S.h * .18), u * 2.2);
  const placed = st.centre(S.y, S.h);
  const top = bbox(placed).y;
  out.push(...numeralIn(d, x0 + r, top + r, r, num));
  // Hairline from the numeral down the text block — the point's spine.
  const b = bbox(placed);
  if (b.bottom > top + r * 2.6) out.push(line(x0 + r, top + r * 2.3, x0 + r, b.bottom, alpha(c.accent, .45), Math.max(1, u * .1), { label: 'Spine' }));
  if (L.stretched) {
    const rest = S.right - (x0 + cw) - u * 6, hs = Math.min(rest, S.h * .85);
    if (hs > u * 10) out.push(...dim(m.hero(S.right - hs - (rest - hs) / 2, S.cy - hs / 2, hs, hs, L, seed), .85));
  }
  out.push(...placed);
  return out;
};

// ── Big Quote — hanging quotation mark, a measured block ────────────────────
export const bigQuote: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c, th } = ctx(d);
  const out = prelude(d);
  const mw = L.vertical ? S.w : L.stretched ? Math.min(S.w * .56, u * 104) : Math.min(S.w * .84, u * 104);
  const x0 = S.cx - mw / 2;
  if (L.stretched) {
    const fw = Math.min((S.w - mw) / 2 - u * 6, S.h * .7);
    if (fw > u * 10) { out.push(...dim(m.hero(S.x, S.cy - fw / 2, fw, fw, L, seed), .5), ...dim(m.hero(S.right - fw, S.cy - fw / 2, fw, fw, L, seed + 1), .5)); }
  }
  const qs = u * (L.vertical ? 12 : 14);
  const mark = text(x0, 0, qs * 1.2, '“', { size: qs, font: th.t.display, weight: 700, color: c.accent, wrap: false, label: 'Quotation mark', role: 'ORNAMENT', leading: 1 });
  mark.h = qs * .5;
  const st = new Stack();
  st.add(mark);
  st.add(fitText(x0, 0, mw, f.quote, ty.sentence(u * 4.8, { label: 'Quote' }), S.h * (L.vertical ? .58 : .56)), u * 1.2);
  st.add(m.divider(x0, 0, mw, 'left', L).objs, u * 2.6);
  if (f.attribution) st.add(text(x0, 0, mw, f.attribution, ty.label(u * 1.7, { label: 'Attribution' })), u * 1.8);
  const placed = st.centre(S.y, S.h);
  // The mark's glyph sits high in its em box; lift the box so its ink hangs above the text.
  mark.y -= qs * .26; mark.h = qs * .76; if (mark.y < S.y) { const dy = S.y - mark.y; mark.y += dy; mark.h = Math.max(qs * .5, mark.h - dy); }
  out.push(...placed);
  return out;
};

// ── Announcement — headline and a details strip ─────────────────────────────
function infoColumn(d: DesignCtx, x: number, w: number, label: string, value: string, maxH: number): SlideObj[] {
  const { u, ty, c } = ctx(d);
  const l = text(x, 0, w, label, ty.label(u * 1.35, { color: c.panelMuted, label: `${label} label` }));
  const v = fitText(x, l.h + u * .8, w, value, ty.body(u * 2.6, { weight: 600, color: c.panelInk, leading: 1.2, label: `${label} value` }), maxH);
  return [l, v];
}
export const announcement: SlideDesigner = d => {
  const { L, f, u, S, ty, m } = ctx(d);
  const out = prelude(d, false);
  const info = ([['Date', f.date], ['Time', f.time], ['Where', f.place]] as Array<[string, string]>).filter(([, v]) => v);
  const head = (x: number, w: number, maxTitle: number) => {
    const st = new Stack();
    if (f.kicker) st.add(text(x, 0, w, f.kicker, ty.label(u * 1.7)));
    st.add(fitText(x, 0, w, f.title, ty.display(u * 7.4), maxTitle), u * 1.4);
    if (f.detail) st.add(fitText(x, 0, w, f.detail, ty.body(u * 2.4, { color: d.th.c.muted }), maxTitle * .55), u * 2);
    return st;
  };
  const p = u * 2.4;
  if (L.vertical) {
    const rows: SlideObj[][] = info.map(([k, v]) => infoColumn(d, S.x + p, S.w - p * 2, k, v, u * 7));
    const rowH = rows.map(r => bbox(r).h);
    const ph = rowH.reduce((a, b) => a + b, 0) + p * 2 + u * 2.2 * Math.max(0, rows.length - 1);
    const py = S.bottom - ph;
    out.push(...m.panel(S.x, py, S.w, ph, L));
    let y = py + p;
    rows.forEach((r, i) => { shift(r, 0, y - bbox(r).y); y += rowH[i] + u * 2.2; out.push(...r); });
    out.push(...head(S.x, S.w, (py - S.y) * .5).centre(S.y, py - S.y - u * 3));
    return out;
  }
  if (L.stretched) {
    const lw = S.w * .44, rx = S.x + S.w * .5, rw = S.right - rx;
    out.push(...head(S.x, lw, S.h * .5).centre(S.y, S.h));
    const n = Math.max(1, info.length), cg = u * 3, cw = (rw - p * 2 - cg * (n - 1)) / n;
    const cols = info.map(([k, v], i) => infoColumn(d, rx + p + i * (cw + cg), cw, k, v, S.h * .4));
    const ch = Math.max(...cols.map(cc => bbox(cc).h), u * 4), ph = ch + p * 2, py = S.cy - ph / 2;
    out.push(...m.panel(rx, py, rw, ph, L));
    cols.forEach(cc => out.push(...shift(cc, 0, py + p - bbox(cc).y)));
    return out;
  }
  const n = Math.max(1, info.length), cg = u * 3, cw = (S.w - p * 2 - cg * (n - 1)) / n;
  const cols = info.map(([k, v], i) => infoColumn(d, S.x + p + i * (cw + cg), cw, k, v, S.h * .2));
  const ch = Math.max(...cols.map(cc => bbox(cc).h), u * 4), ph = ch + p * 2, py = S.bottom - ph;
  out.push(...m.panel(S.x, py, S.w, ph, L));
  cols.forEach((cc, i) => {
    out.push(...shift(cc, 0, py + p - bbox(cc).y));
    if (i) out.push(line(cc[0].x - cg / 2, py + p, cc[0].x - cg / 2, py + ph - p, alpha(d.th.c.panelInk, .2), Math.max(1, u * .08), { label: 'Column rule' }));
  });
  out.push(...head(S.x, Math.min(S.w * .8, u * 100), (py - S.y) * .62).centre(S.y, py - S.y - u * 3));
  return out;
};

// ── Event — photo well, calendar tile, the details ──────────────────────────
function calendarTile(d: DesignCtx, x: number, y: number, s: number): SlideObj[] {
  const { u, ty, c, th } = ctx(d);
  const ink = isDark(c.accent) ? '#FFFFFF' : '#121212';
  const h = s * 1.08, band = h * .28;
  return [
    rect(x, y, s, h, c.accent, { rx: th.slot.rx > .3 ? s * .12 : s * th.slot.rx, rotation: th.slot.tilt, label: 'Calendar tile' }),
    rect(x, y + band, s, Math.max(1, u * .12), alpha(ink, .35), { rotation: th.slot.tilt, label: 'Tile rule' }),
    text(x, y + band * .5 - u * .75, s, d.f.month, ty.label(Math.min(u * 1.5, band * .5), { align: 'center', color: ink, wrap: false, label: 'Month' })),
    fitText(x + s * .08, y + band + (h - band) * .1, s * .84, d.f.day, ty.display(Math.min((h - band) * .78, u * 7), { align: 'center', color: ink, wrap: false, transform: 'none', label: 'Day' }), (h - band) * .82),
  ];
}
export const eventCard: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c, th } = ctx(d);
  const out = prelude(d, false);
  const when = [f.weekday && f.month && f.day ? `${f.weekday}, ${f.month} ${f.day}` : '', f.time].filter(Boolean).join('  ·  ');
  const body = (x: number, w: number, maxTitle: number) => {
    const st = new Stack();
    const ts = Math.min(u * 10, w * .32);
    st.add(calendarTile(d, x, 0, ts));
    if (f.eyebrow) st.add(text(x, 0, w, f.eyebrow, ty.label(u * 1.7)), u * 3);
    st.add(fitText(x, 0, w, f.title, ty.display(u * 7), maxTitle), u * 1.2);
    if (when) st.add(text(x, 0, w, when, ty.body(u * 2.3, { weight: 600, label: 'When' })), u * 2);
    if (f.place) st.add(text(x, 0, w, f.place, ty.body(u * 2.3, { color: c.muted, label: 'Where' })), u * .8);
    if (f.cta) st.add([...m.divider(x, 0, w, 'left', L).objs], u * 2.4).add(text(x, 0, w, f.cta, ty.accent(u * 2.2, { label: 'Call to action' })), u * 1.6);
    return st;
  };
  if (L.vertical) {
    const ph = d.H * (L.cls === 'tall' ? .38 : .34);
    out.push(...photo(0, 0, d.W, ph, th, L, f.imageUrl, 'Event photo', { bleed: true, tilt: false }));
    out.push(...body(S.x, S.w, S.h * .2).centre(ph + u * 3, S.bottom - ph - u * 3, 0));
    return out;
  }
  const pw = d.W * (L.stretched ? (L.cls === 'panorama' ? .26 : .34) : L.cls === 'standard' ? .4 : .44);
  out.push(...photo(0, 0, pw, d.H, th, L, f.imageUrl, 'Event photo', { bleed: true, tilt: false }));
  const x = Math.max(S.x, pw + u * 6), w = Math.min(S.right - x, L.stretched ? u * 84 : S.right - x);
  out.push(...body(x, w, S.h * .34).centre(S.y, S.h));
  if (L.stretched) {
    const rest = S.right - (x + w) - u * 6, hs = Math.min(rest, S.h * .8);
    if (hs > u * 10) out.push(...m.hero(x + w + u * 6 + (rest - hs) / 2, S.cy - hs / 2, hs, hs, L, seed));
  }
  return out;
};

// ── Giving — message, ways to give, a QR well ───────────────────────────────
export const giving: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c, th } = ctx(d);
  const out = prelude(d, false);
  const text$ = (x: number, w: number, align: 'left' | 'center', maxT: number) => {
    const st = new Stack();
    if (f.kicker) st.add(text(x, 0, w, f.kicker, ty.label(u * 1.7, { align })));
    st.add(fitText(x, 0, w, f.title, ty.display(u * 7.6, { align }), maxT), u * 1.2);
    if (f.message) st.add(fitText(x, 0, w, f.message, ty.body(u * 2.4, { align, color: c.muted }), maxT * .9), u * 2);
    st.add(m.divider(x, 0, w, align, L).objs, u * 2.6);
    if (f.link) st.add(fitText(x, 0, w, f.link, ty.body(u * 2.6, { align, weight: 700, color: c.ink, label: 'Giving link' }), u * 6), u * 2.2);
    if (f.textCode) st.add(text(x, 0, w, f.textCode, ty.label(u * 1.6, { align, color: c.muted, label: 'Text to give' })), u * 1.2);
    return st;
  };
  if (L.vertical) {
    const qs = Math.min(S.w * .5, S.h * .26);
    const st = text$(S.x, S.w, 'center', S.h * .16);
    const qr = qrSlot(S.cx - qs / 2, 0, qs, th, L, seed, f.qrUrl, f.qrLabel);
    st.add(qr, u * 4);
    out.push(...st.centre(S.y, S.h - u * 3));
    return out;
  }
  const qs = Math.min(S.h * .56, S.w * (L.stretched ? .2 : .3));
  const tw = L.stretched ? Math.min(u * 86, S.w * .44) : S.w - qs - u * 10;
  out.push(...text$(S.x, tw, 'left', S.h * .3).centre(S.y, S.h));
  const qx = L.stretched ? S.x + tw + u * 10 : S.right - qs, qy = S.cy - qs / 2 - u * 1.5;
  out.push(...m.panel(qx - u * 2, qy - u * 2, qs + u * 4, qs + u * 7.2, L));
  out.push(...qrSlot(qx, qy, qs, th, L, seed, f.qrUrl, f.qrLabel, c.panelMuted));
  if (L.stretched) {
    const rx = qx + qs + u * 8, rest = S.right - rx, hs = Math.min(rest, S.h * .8);
    if (hs > u * 10) out.push(...m.hero(rx + (rest - hs) / 2, S.cy - hs / 2, hs, hs, L, seed));
  }
  return out;
};

// ── Countdown — live digits; three zones on ultrawide ───────────────────────
export const countdown: SlideDesigner = d => {
  const { L, f, seed, u, S, ty, m, c, th } = ctx(d);
  const out = prelude(d);
  const digits = (x: number, w: number, maxH: number, align: 'left' | 'center') => {
    const o = fitText(x, 0, w, '00:00', { size: u * 15, font: th.t.display, weight: Math.max(400, th.t.displayWeight), italic: th.t.displayItalic, tracking: .02, color: c.ink, align, wrap: false, label: 'Countdown digits', role: 'HEADLINE', leading: 1 }, maxH);
    o.text = f.countTo ? '00:00' : (f.atZero || '');
    return withAmb(Object.assign(o, { front: true }), { kind: 'countdown', target: f.countTo || '', fallback: f.atZero || 'Welcome' });
  };
  if (L.stretched) {
    const zw = (S.w - u * 12) / 3;
    const left = new Stack();
    if (f.kicker) left.add(text(S.x, 0, zw, f.kicker, ty.label(u * 1.7)));
    left.add(fitText(S.x, 0, zw, f.title, ty.display(u * 5.4), S.h * .5), u * 1.2);
    out.push(...left.centre(S.y, S.h));
    const dz = digits(S.x + zw + u * 6, zw, S.h * .5, 'center');
    dz.y = S.cy - (dz.fontSize || 0) * .62;
    out.push(line(S.x + zw + u * 3, S.cy - S.h * .3, S.x + zw + u * 3, S.cy + S.h * .3, alpha(c.accent, .5), Math.max(1, u * .12), { label: 'Zone rule' }),
      line(S.x + zw * 2 + u * 9, S.cy - S.h * .3, S.x + zw * 2 + u * 9, S.cy + S.h * .3, alpha(c.accent, .5), Math.max(1, u * .12), { label: 'Zone rule' }), dz);
    if (f.note) out.push(...new Stack().add(fitText(S.right - zw, 0, zw, f.note, ty.accent(u * 2.6), S.h * .6)).centre(S.y, S.h));
    return out;
  }
  const st = new Stack();
  if (L.vertical) { const hs = Math.min(S.w * .7, S.h * .24); st.add(m.hero(S.cx - hs / 2, 0, hs, hs, L, seed), 0); }
  const cw = L.vertical ? S.w : Math.min(S.w, u * 96);
  const x0 = S.cx - cw / 2;
  if (f.kicker) st.add(text(x0, 0, cw, f.kicker, ty.label(u * 1.9, { align: 'center' })), u * 3);
  st.add(digits(x0, cw, S.h * .34, 'center'), u * 1.2);
  st.add(m.divider(x0, 0, cw, 'center', L).objs, u * 1.6);
  st.add(fitText(x0, 0, cw, f.title, ty.display(u * 4.2, { align: 'center' }), S.h * .16), u * 2.4);
  if (f.note) st.add(fitText(x0 + cw * .1, 0, cw * .8, f.note, ty.accent(u * 2.3, { align: 'center' }), S.h * .14), u * 1.6);
  out.push(...st.centre(S.y, S.h));
  return out;
};
