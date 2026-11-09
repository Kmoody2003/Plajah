// Interactive Graphics (Blu-ray HDMV menus) → IG stream: ICS + PDS + ODS + END.
// Pages hold button-overlap groups (BOGs); each button has normal/selected/activated bitmaps,
// four neighbours and a list of HDMV navigation commands it runs when activated.
import { BitReader, BitWriter, concat } from './bits';
import { decode as decodeInsn, encode as encodeInsn, type Insn } from './hdmv';
import { quantize, type PaletteEntry } from './palette';
import { odsPayloads, pdsPayload, SEG, segment, MAX_SEG } from './pgs';
import { rleDecode } from './rle';
import { FRAME_RATE_CODE } from './spec';

export const NO_OBJECT = 0xffff;
export const NO_BUTTON = 0xffff;

export interface Rgba { w: number; h: number; data: Uint8Array | Uint8ClampedArray }

export interface IgButtonIn {
  id: number; x: number; y: number;
  normal: Rgba; selected: Rgba; activated: Rgba;
  nav: { up?: number; down?: number; left?: number; right?: number };
  commands: Insn[]; autoAction?: boolean; numeric?: number;
}
export interface IgPageIn {
  id: number; buttons: IgButtonIn[]; defaultButton: number;
  /** Static panel art drawn under the buttons (needed for pop-ups — top menus bake it into video). */
  panel?: { x: number; y: number; img: Rgba };
}
export interface IgMenuIn { video: { w: number; h: number; fps: number }; popup: boolean; pages: IgPageIn[]; userTimeoutSec?: number }

/** Quantize several bitmaps against one shared palette (a page references a single palette). */
export function quantizeShared(imgs: Rgba[]) {
  const w = Math.max(1, ...imgs.map(i => i.w));
  const h = imgs.reduce((s, i) => s + i.h, 0);
  const atlas = new Uint8ClampedArray(w * h * 4);
  let oy = 0;
  for (const im of imgs) {
    for (let y = 0; y < im.h; y++) atlas.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), ((oy + y) * w) * 4);
    oy += im.h;
  }
  const q = quantize(atlas, w, h);
  oy = 0;
  const out = imgs.map(im => {
    const px = new Uint8Array(im.w * im.h);
    for (let y = 0; y < im.h; y++) px.set(q.pixels.subarray((oy + y) * w, (oy + y) * w + im.w), y * im.w);
    oy += im.h;
    return { w: im.w, h: im.h, pixels: px };
  });
  return { palette: q.palette, images: out };
}

interface BuiltButton { b: IgButtonIn; obj: [number, number, number] }

export function buildIg(menu: IgMenuIn): { stream: Uint8Array; objectCount: number } {
  const pds: Uint8Array[] = [];
  const ods: Uint8Array[] = [];
  let nextObj = 0;
  const pages = menu.pages.map((pg, pi) => {
    const imgs: Rgba[] = [];
    if (pg.panel) imgs.push(pg.panel.img);
    for (const b of pg.buttons) imgs.push(b.normal, b.selected, b.activated);
    const q = quantizeShared(imgs);
    pds.push(segment(SEG.PDS, pdsPayload(pi, 0, q.palette)));
    let k = 0;
    const objFor = () => { const id = nextObj++; for (const p of odsPayloads(id, 0, q.images[k++])) ods.push(segment(SEG.ODS, p)); return id; };
    const panelObj = pg.panel ? objFor() : null;
    const buttons: BuiltButton[] = pg.buttons.map(b => ({ b, obj: [objFor(), objFor(), objFor()] }));
    return { pg, pi, panelObj, buttons };
  });

  // interactive_composition body
  const body = new BitWriter();
  body.bits(0, 1).bits(menu.popup ? 1 : 0, 1).zero(6); // stream_model=multiplexed, ui_model
  body.zero(7).bits(0, 33).zero(7).bits(0, 33); // composition / selection time-out PTS (0 = none)
  body.u24(Math.round((menu.userTimeoutSec || 0) * 90000) & 0xffffff);
  body.u8(pages.length);
  for (const { pg, pi, panelObj, buttons } of pages) {
    body.u8(pg.id).u8(0);
    body.u32(0).u32(0); // UO mask: allow everything
    body.u8(0).u8(0);   // in_effects: no windows, no effects
    body.u8(0).u8(0);   // out_effects
    body.u8(0);         // animation frame rate code (static)
    body.u16(pg.defaultButton).u16(NO_BUTTON).u8(pi);
    const bogs: { def: number; items: { id: number; numeric: number; auto: boolean; x: number; y: number; nav: number[]; obj: [number, number, number]; cmds: Insn[] }[] }[] = [];
    if (panelObj != null && pg.panel) {
      // Background panel lives in its own BOG as a never-reachable button.
      const pid = 0x0f00 + pi;
      bogs.push({ def: pid, items: [{ id: pid, numeric: 0xffff, auto: false, x: pg.panel.x, y: pg.panel.y, nav: [pid, pid, pid, pid], obj: [panelObj, panelObj, panelObj], cmds: [] }] });
    }
    for (const { b, obj } of buttons) {
      const n = (v?: number) => v ?? b.id;
      bogs.push({ def: b.id, items: [{ id: b.id, numeric: b.numeric ?? 0xffff, auto: !!b.autoAction, x: b.x, y: b.y, nav: [n(b.nav.up), n(b.nav.down), n(b.nav.left), n(b.nav.right)], obj, cmds: b.commands }] });
    }
    body.u8(bogs.length);
    for (const g of bogs) {
      body.u16(g.def).u8(g.items.length);
      for (const it of g.items) {
        body.u16(it.id).u16(it.numeric).bits(it.auto ? 1 : 0, 1).zero(7);
        body.u16(it.x).u16(it.y);
        for (const v of it.nav) body.u16(v);
        body.u16(it.obj[0]).u16(it.obj[0]).bits(0, 1).bits(0, 1).zero(6);           // normal
        body.u8(0xff).u16(it.obj[1]).u16(it.obj[1]).bits(0, 1).bits(0, 1).zero(6);  // selected (no sound)
        body.u8(0xff).u16(it.obj[2]).u16(it.obj[2]);                                 // activated
        body.u16(it.cmds.length);
        for (const c of it.cmds) body.raw(encodeInsn(c));
      }
    }
  }
  const data = body.done();

  // ICS segments (fragmented if the composition is larger than one segment).
  const head = (first: boolean, last: boolean) => new BitWriter()
    .u16(menu.video.w).u16(menu.video.h).bits(FRAME_RATE_CODE(menu.video.fps), 4).zero(4)
    .u16(0).bits(2, 2).zero(6)                      // composition number 0, state = epoch start
    .bits(first ? 1 : 0, 1).bits(last ? 1 : 0, 1).zero(6);
  const ics: Uint8Array[] = [];
  const firstRoom = MAX_SEG - 8 - 3;
  const nextRoom = MAX_SEG - 8;
  const frags: Uint8Array[] = [data.subarray(0, firstRoom)];
  for (let o = firstRoom; o < data.length; o += nextRoom) frags.push(data.subarray(o, o + nextRoom));
  frags.forEach((f, i) => {
    const w = head(i === 0, i === frags.length - 1);
    if (i === 0) w.u24(data.length);
    ics.push(segment(SEG.ICS, w.raw(f).done()));
  });
  return { stream: concat([...ics, ...pds, ...ods, segment(SEG.END, new Uint8Array(0))]), objectCount: nextObj };
}

// ── Parser (round-trip tests; reading IG from discs users import) ────────────
export interface ParsedButton { id: number; numeric: number; auto: boolean; x: number; y: number; nav: { up: number; down: number; left: number; right: number }; objects: { normal: number; selected: number; activated: number }; commands: Insn[] }
export interface ParsedPage { id: number; defaultButton: number; palette: number; bogs: { def: number; buttons: ParsedButton[] }[] }
export interface ParsedIg { w: number; h: number; popup: boolean; pages: ParsedPage[]; palettes: Map<number, PaletteEntry[]>; objects: Map<number, { w: number; h: number; pixels: Uint8Array }> }

export function parseIg(stream: Uint8Array): ParsedIg {
  const r = new BitReader(stream);
  const icsData: number[] = []; let w = 0, h = 0;
  const palettes = new Map<number, PaletteEntry[]>();
  const objects = new Map<number, { w: number; h: number; pixels: Uint8Array }>();
  let odsAcc: { id: number; w: number; h: number; data: number[] } | null = null;
  while (r.byte + 3 <= stream.length) {
    const type = r.u8(); const len = r.u16(); const start = r.byte;
    if (type === SEG.ICS) {
      w = r.u16(); h = r.u16(); r.u8(); r.u16(); r.u8(); const seq = r.u8();
      if (seq & 0x80) r.u24();
      while (r.byte < start + len) icsData.push(r.u8());
    } else if (type === SEG.PDS) {
      const id = r.u8(); r.u8(); const e: PaletteEntry[] = [];
      while (r.byte < start + len) e.push({ id: r.u8(), y: r.u8(), cr: r.u8(), cb: r.u8(), t: r.u8() });
      palettes.set(id, e);
    } else if (type === SEG.ODS) {
      const id = r.u16(); r.u8(); const f = r.u8();
      if (f & 0x80) { r.u24(); odsAcc = { id, w: r.u16(), h: r.u16(), data: [] }; }
      while (r.byte < start + len) odsAcc!.data.push(r.u8());
      if (f & 0x40 && odsAcc) { objects.set(odsAcc.id, { w: odsAcc.w, h: odsAcc.h, pixels: rleDecode(Uint8Array.from(odsAcc.data), odsAcc.w, odsAcc.h) }); odsAcc = null; }
    }
    r.seekByte(start + len);
  }
  const b = new BitReader(Uint8Array.from(icsData));
  b.bits(1); const popup = !!b.bits(1); b.skip(6);
  b.skip(40); b.skip(40); b.u24();
  const np = b.u8(); const pages: ParsedPage[] = [];
  const skipEffects = () => {
    const nw = b.u8(); b.skip(nw * 9 * 8);
    const ne = b.u8();
    for (let i = 0; i < ne; i++) { b.u24(); b.u8(); const nc = b.u8(); for (let j = 0; j < nc; j++) { b.u16(); b.u8(); const f = b.u8(); b.u16(); b.u16(); if (f & 0x80) b.skip(64); } }
  };
  for (let p = 0; p < np; p++) {
    const id = b.u8(); b.u8(); b.skip(64); skipEffects(); skipEffects(); b.u8();
    const defaultButton = b.u16(); b.u16(); const palette = b.u8();
    const nb = b.u8(); const bogs: ParsedPage['bogs'] = [];
    for (let g = 0; g < nb; g++) {
      const def = b.u16(); const n = b.u8(); const buttons: ParsedButton[] = [];
      for (let k = 0; k < n; k++) {
        const bid = b.u16(), numeric = b.u16(), auto = !!b.bits(1); b.skip(7);
        const x = b.u16(), y = b.u16();
        const nav = { up: b.u16(), down: b.u16(), left: b.u16(), right: b.u16() };
        const normal = b.u16(); b.u16(); b.skip(8);
        b.u8(); const selected = b.u16(); b.u16(); b.skip(8);
        b.u8(); const activated = b.u16(); b.u16();
        const nc = b.u16(); const commands: Insn[] = [];
        for (let c = 0; c < nc; c++) { const bytes = new Uint8Array(12); for (let q = 0; q < 12; q++) bytes[q] = b.u8(); commands.push(decodeInsn(bytes)); }
        buttons.push({ id: bid, numeric, auto, x, y, nav, objects: { normal, selected, activated }, commands });
      }
      bogs.push({ def, buttons });
    }
    pages.push({ id, defaultButton, palette, bogs });
  }
  return { w, h, popup, pages, palettes, objects };
}
