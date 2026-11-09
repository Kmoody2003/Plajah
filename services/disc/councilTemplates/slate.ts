// Slate — the awards screener.
// Animation lead: The Interface Motion Designer (60 fps on ones, ease-out — motion is feedback, not
// flourish). Graphic designer: The Data Storyteller (honest tables, the comparison, the source).
// Lighting director: no theatrical light — an even neutral grey field, ruled lines, one status LED.
// Structure: the whole disc is ONE technical table. The film's spec sheet sits on top as read-only
// rows; every menu item is a further row of that table, and selection inverts the row like a
// terminal cursor. Scenes are a shot log (SC / description / TC in / TC out / duration), setup is a
// config table, and the pop-up is a narrow ruled sidebar that leaves the picture alone.
import { button, hms, mins, txt, T, W, type Ctx, type Design, type Item, type O, type State } from './kit';

const GROUND = '#25272A', RULE = '#3F4247', RULE_HI = '#5F636A', INK = '#E3E3DE', DIM = '#8F939A';
const INV = '#E8E8E3', INV_INK = '#111214', LED = '#FF3B30', LED_OFF = '#4A1512';
const MONO = 'ibmPlexMono', GROT = 'spaceGrotesk';
const X0 = 192, X1 = 1728, TW = X1 - X0;
const LED_X = X1 - 14, LED_Y = 92;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);
const tc = (sec: number) => `${hms(sec).padStart(8, '0')}:00`;
/** Mono glyph advance ≈ 0.6 em. */
const monoW = (s: string, size: number) => s.length * size * 0.6;

function extrasOf(ctx: Ctx) { return ctx.disc.titles.filter(t => t.kind === 'EXTRA' || t.kind === 'TRAILER'); }

/** The TARGET column: what the row resolves to, stated as data. */
function target(ctx: Ctx, it: Item): string {
  const a = it.action, m = ctx.main;
  if (a.kind === 'PLAY_TITLE') { const t = ctx.disc.titles.find(x => x.id === a.titleId); return t ? `TITLE ${String(ctx.disc.titles.indexOf(t) + 1).padStart(2, '0')} · ${hms(t.source.durationSec)}` : ''; }
  if (a.kind === 'PLAY_ALL') return `${a.titleIds.length} TITLES IN ORDER`;
  if (a.kind === 'GO_MENU') {
    if (/scene|setlist/i.test(it.label)) return `${m?.chapters.length ?? 0} CHAPTERS`;
    if (/setup/i.test(it.label)) return `${m?.audio.length ?? 0} AUDIO · ${m?.subtitles.length ?? 0} SUBTITLE`;
    if (/extra/i.test(it.label)) { const x = extrasOf(ctx); return `${x.length} ITEMS · ${mins(x.reduce((s, t) => s + t.source.durationSec, 0)).toUpperCase()}`; }
    if (/episode/i.test(it.label)) return `${ctx.disc.titles.filter(t => t.kind === 'EPISODE').length} EPISODES`;
  }
  return '';
}

/** Header strip shared by every full page: FYC left, status + LED right, one heavy rule. */
function header(ctx: Ctx, status: string, liveLed: boolean): O[] {
  const out: O[] = [];
  if (liveLed) {
    // The LED is a hole in a ground-coloured bezel; the lit dot (a motion layer) slides behind it,
    // so the lamp pulses even though the motion layers render under the page art.
    out.push(T.circle(LED_X, LED_Y, 38, 'none', { stroke: GROUND, strokeWidth: 56, label: 'LED bezel mask' }));
    out.push(T.circle(LED_X, LED_Y, 10, LED_OFF, { opacity: 0.45, label: 'LED lens' }));
  } else out.push(T.circle(LED_X, LED_Y, 10, LED, { label: 'LED' }));
  out.push(T.circle(LED_X, LED_Y, 12, 'none', { stroke: '#5A5D63', strokeWidth: 3, label: 'LED housing' }));
  out.push(txt(X0, 74, 900, 'FOR YOUR CONSIDERATION', 28, GROT, INK, { weight: 700, tracking: 0.24 }));
  out.push(txt(X1 - 40 - 700, 76, 700, status, 24, MONO, DIM, { align: 'right', tracking: 0.08 }));
  out.push(T.rect(X0, 126, TW, 3, RULE_HI, { label: 'Head rule' }));
  return out;
}

function footer(ctx: Ctx): O[] {
  return [
    T.rect(X0, 984, TW, 2, RULE, { label: 'Foot rule' }),
    txt(X0, 994, 900, `SCREENER · NOT FOR SALE OR RENTAL · ${ctx.uhd ? 'UHD' : 'BD'}`, 24, MONO, DIM, { tracking: 0.06 }),
    txt(X1 - 700, 994, 700, 'INDIVIDUALLY WATERMARKED', 24, MONO, DIM, { align: 'right', tracking: 0.06 }),
  ];
}

interface Cols { id: string; label: string; mid?: string; mid2?: string; right?: string }
/** One table row. Selected = the row inverts and a block cursor sits after the label. */
function row(w: number, h: number, c: Cols, s: State, o: { size?: number; midX?: number; mid2X?: number; labelX?: number } = {}): O[] {
  const size = o.size ?? 34, labelX = o.labelX ?? 112, midX = o.midX ?? 820, mid2X = o.mid2X ?? 1080;
  const on = s !== 'normal';
  const ink = on ? INV_INK : INK, dim = on ? INV_INK : DIM;
  const ty = (h - size * 1.25) / 2, my = (h - 28 * 1.25) / 2;
  const out: O[] = [];
  if (on) out.push(T.rect(0, 0, w, h - 2, s === 'activated' ? LED : INV, { label: 'Inverted row' }));
  out.push(T.rect(0, h - 2, w, 2, on ? (s === 'activated' ? LED : INV) : RULE, { label: 'Row rule' }));
  out.push(txt(16, my, labelX - 24, on ? '>' + c.id : ' ' + c.id, 28, MONO, dim));
  const label = clip(c.label, Math.floor((midX - labelX - 40) / (size * 0.6)));
  out.push(txt(labelX, ty, midX - labelX - 20, label, size, MONO, ink, { weight: 600 }));
  if (on) out.push(T.rect(labelX + monoW(label, size) + 8, ty + size * 0.1, size * 0.55, size * 1.05, s === 'activated' ? INV_INK : INV_INK, { label: 'Block cursor' }));
  if (c.mid) out.push(txt(midX, my, (c.mid2 ? mid2X : w) - midX - 24, c.mid, 28, MONO, dim));
  if (c.mid2) out.push(txt(mid2X, my, 260, c.mid2, 28, MONO, dim));
  if (c.right) out.push(txt(w - 16 - 300, (h - 24 * 1.25) / 2, 300, s === 'activated' ? 'EXECUTING' : on ? '< ENTER' : c.right, 24, MONO, dim, { align: 'right', tracking: 0.06 }));
  return out;
}

const roleId = (it: Item, i: number) => String(i + 1).padStart(2, '0');

/** A titled table head: title, sub-line, column captions, heavy rule. Returns art + the y below. */
function tableHead(title: string, sub: string, cols: Array<[string, number, 'left' | 'right']>, y: number): O[] {
  const out: O[] = [
    txt(X0, 150, 1300, title, 64, GROT, INK, { weight: 700, tracking: -0.01 }),
    txt(X0, 236, 1300, sub, 28, MONO, DIM),
  ];
  cols.forEach(([s, x, align]) => out.push(txt(align === 'right' ? X0 + x - 300 : X0 + x, y, 300, s, 24, MONO, DIM, { tracking: 0.12, align })));
  out.push(T.rect(X0, y + 38, TW, 3, RULE_HI));
  return out;
}

export const slate: Design = {
  id: 'screener',
  background: () => ({ kind: 'color', value: GROUND }),
  subBackground: () => ({ kind: 'color', value: GROUND }),

  main(ctx, items) {
    const m = ctx.main, p = ctx.disc;
    const art: O[] = [...header(ctx, `SCREENER COPY · ${p.region === 'ABC' ? 'REGION FREE' : 'REGION ' + p.region}`, true)];
    const title = ctx.title.toUpperCase();
    const tSize = Math.min(88, Math.floor(TW / Math.max(1, title.length * 0.62)));
    art.push(txt(X0, 150, TW, title, tSize, GROT, INK, { weight: 700, tracking: -0.01 }));
    art.push(txt(X1 - 420, 162, 420, `COPY No. ${String(Math.abs(hashOf(p.id)) % 10000).padStart(4, '0')}`, 28, MONO, INK, { align: 'right' }));
    art.push(txt(X1 - 420, 200, 420, 'FIRST PLAY · FEATURE', 24, MONO, DIM, { align: 'right', tracking: 0.06 }));
    art.push(txt(X0, 150 + tSize * 1.2 + 6, TW, `${ctx.uhd ? 'ULTRA HD BLU-RAY' : 'BLU-RAY'} SCREENER  ·  ${ctx.tagline.toUpperCase()}`, 28, MONO, DIM));

    // Spec sheet: read-only rows of the same table.
    const v = p.video;
    const ratio = m?.source.w && m?.source.h ? (m.source.w / m.source.h).toFixed(2) + ':1' : (v.w / v.h).toFixed(2) + ':1';
    const subs = m?.subtitles.map(s => s.label).join(' / ') || 'NONE';
    const spec: Array<[string, string]> = [
      ['RUNTIME', m ? hms(m.source.durationSec) : '—'], ['ASPECT', ratio],
      ['VIDEO', `${v.w}×${v.h}${v.scan} ${v.fps}`], ['DYNAMIC', v.dynamic.replace('SDR709', 'SDR · BT.709')],
      ['AUDIO', m?.audio[0] ? m.audio[0].label + (m.audio.length > 1 ? ` +${m.audio.length - 1}` : '') : '—'], ['SUBTITLES', subs],
      ['CHAPTERS', String(m?.chapters.length ?? 0)], ['CONTACT', 'AWARDS DESK · SEE LETTER'],
    ];
    const SY = 330, RH = 54, CX = 780;
    art.push(T.rect(X0, SY, TW, 3, RULE_HI));
    spec.forEach(([k, val], i) => {
      const col = i % 2, r = Math.floor(i / 2), x = X0 + col * CX, y = SY + 3 + r * RH;
      art.push(txt(x + 16, y + 14, 200, k, 24, MONO, DIM, { tracking: 0.08 }));
      art.push(txt(x + 200, y + 11, CX - 230, clip(val.toUpperCase(), Math.floor((CX - 240) / 16.8)), 28, MONO, INK));
      if (col === 0) art.push(T.rect(X0, y + RH - 2, TW, 2, RULE));
    });
    art.push(T.rect(X0 + CX - 12, SY + 3, 2, RH * 4 - 2, RULE, { label: 'Column rule' }));

    // Action rows.
    const AY = SY + 3 + RH * 4 + 26;
    [['#', 16], ['ACTION', 112], ['TARGET', 820]].forEach(([s, x]) => art.push(txt(X0 + (x as number), AY, 300, s as string, 24, MONO, DIM, { tracking: 0.12 })));
    art.push(txt(X1 - 316, AY, 300, 'STATUS', 24, MONO, DIM, { tracking: 0.12, align: 'right' }));
    art.push(T.rect(X0, AY + 36, TW, 3, RULE_HI));
    art.push(...footer(ctx));
    const RH2 = items.length > 4 ? 66 : items.length > 3 ? 76 : 84, top = AY + 39;
    const buttons = items.map((it, i) => button(it, X0, top + i * RH2, TW, RH2, s => row(TW, RH2, { id: roleId(it, i), label: it.label.toUpperCase(), mid: target(ctx, it), right: it.role === 'primary' ? 'READY' : 'OK' }, s)));
    return { art, buttons };
  },

  scenes(ctx, items, page, pages) {
    const m = ctx.main;
    const art: O[] = [...header(ctx, `SHOT LOG · REEL ${page + 1} OF ${pages}`, false),
      ...tableHead('SHOT LOG', `${ctx.title.toUpperCase()} · ${m?.chapters.length ?? 0} CHAPTERS · ${m ? tc(m.source.durationSec) : ''}`,
        [['SC', 16, 'left'], ['DESCRIPTION', 150, 'left'], ['TC IN', 860, 'left'], ['TC OUT', 1110, 'left'], ['DUR', TW - 16, 'right']], 292),
      ...footer(ctx)];
    const chapters = items.filter(i => i.index != null), nav = items.filter(i => i.index == null);
    const top = 333, RH = 72;
    // The shot log is pure data, so the still is left off (a wide table row would stretch it).
    const buttons = chapters.map((it, i) => {
      const ch = m?.chapters[it.index! - 1];
      const tin = ch?.timeSec ?? 0, next = m?.chapters[it.index!]?.timeSec ?? m?.source.durationSec ?? tin;
      return button({ ...it, thumb: undefined }, X0, top + i * RH, TW, RH, s => row(TW, RH, { id: 'SC' + String(it.index).padStart(2, '0'), label: it.label.toUpperCase(), mid: tc(tin), mid2: tc(next), right: hms(next - tin).replace(/^0:/, '') }, s, { size: 32, labelX: 150, midX: 860, mid2X: 1110 }));
    });
    const ny = top + chapters.length * RH + 28;
    art.push(T.rect(X0, ny - 10, TW, 3, RULE_HI));
    nav.forEach((it, i) => buttons.push(button(it, X0, ny + i * 60, TW, 60, s => row(TW, 60, { id: it.role === 'back' ? '<<' : it.label === 'Next' ? '>>' : '<', label: it.role === 'back' ? 'BACK TO INDEX' : it.label === 'Next' ? 'NEXT REEL' : 'PREVIOUS REEL', mid: it.role === 'back' ? 'MAIN MENU' : `REEL ${it.label === 'Next' ? page + 2 : page} OF ${pages}`, right: 'NAV' }, s, { size: 30 }))));
    return { art, buttons };
  },

  list(ctx, heading, kind, items) {
    const title = kind === 'SETUP' ? 'CONFIGURATION' : kind === 'EPISODES' ? 'EPISODE TABLE' : 'SUPPLEMENTS';
    const art: O[] = [...header(ctx, `${heading.toUpperCase()} · ${items.filter(i => i.role !== 'back').length} ROWS`, false),
      ...tableHead(title, `${ctx.title.toUpperCase()} · ${heading.toUpperCase()}`,
        [['ID', 16, 'left'], [kind === 'SETUP' ? 'TRACK' : 'TITLE', 112, 'left'], [kind === 'SETUP' ? 'STREAM' : 'RUNTIME', 820, 'left'], ['STATE', TW - 16, 'right']], 292),
      ...footer(ctx)];
    let y = 333, group = '', gi = 0;
    const counts: Record<string, number> = {};
    const RH = items.length > 7 ? 58 : 64;
    const buttons = items.map(it => {
      if (it.role === 'back') {
        y = Math.max(y + 18, 900);
        art.push(T.rect(X0, y - 8, TW, 3, RULE_HI));
        return button(it, X0, y, TW, 60, s => row(TW, 60, { id: '<<', label: 'BACK TO INDEX', mid: 'MAIN MENU', right: 'NAV' }, s, { size: 30 }));
      }
      if (it.sub && it.sub !== group) {
        group = it.sub; gi = 0;
        art.push(T.rect(X0, y, TW, 40, '#2E3034', { label: 'Section row' }));
        art.push(txt(X0 + 16, y + 7, 600, `[ ${group.toUpperCase()} ]`, 24, MONO, DIM, { tracking: 0.12 }));
        art.push(T.rect(X0, y + 38, TW, 2, RULE));
        y += 40;
      }
      const pre = it.sub === 'Audio' ? 'A' : it.sub === 'Subtitles' ? 'S' : kind === 'EPISODES' ? 'E' : 'X';
      counts[pre] = (counts[pre] || 0) + 1;
      const id = it.sub === 'Subtitles' ? (it.label === 'Off' ? 'S-' : 'S' + (counts[pre] - 1)) : pre + (it.index ?? counts[pre]);
      const mid = it.sub === 'Audio' ? stream(ctx, it, 'a') : it.sub === 'Subtitles' ? stream(ctx, it, 's') : (it.meta || '').toUpperCase();
      const b = button(it, X0, y, TW, RH, s => row(TW, RH, { id, label: it.label.toUpperCase(), mid, right: it.sub ? 'SELECT' : 'PLAY' }, s, { size: 32 }));
      y += RH; gi++;
      return b;
    });
    return { art, buttons };
  },

  popup(ctx, items) {
    // A narrow ruled sidebar on the left edge; the picture's centre and right stay untouched.
    const PX = 96, PW = 520, RH = items.length > 9 ? 62 : 66, PY = 140;
    const ph = 64 + items.length * RH + 16;
    const art: O[] = [
      T.rect(PX, PY, PW, ph, GROUND, { opacity: 0.92, label: 'Sidebar' }),
      T.rect(PX, PY, PW, 3, RULE_HI),
      T.circle(PX + PW - 30, PY + 32, 9, LED, { label: 'LED' }),
      txt(PX + 16, PY + 16, 400, 'SCREENER · INDEX', 24, GROT, INK, { weight: 700, tracking: 0.18 }),
      T.rect(PX, PY + 62, PW, 2, RULE_HI),
    ];
    const buttons = items.map((it, i) => button(it, PX, PY + 64 + i * RH, PW, RH, s => {
      const on = s !== 'normal', ink = on ? INV_INK : INK, dim = on ? INV_INK : DIM;
      const out: O[] = [];
      if (on) out.push(T.rect(0, 0, PW, RH - 2, s === 'activated' ? LED : INV));
      out.push(T.rect(0, RH - 2, PW, 2, on ? INV : RULE));
      const id = it.role === 'primary' ? '>>' : it.role === 'back' ? '<<' : String(it.index).padStart(2, '0');
      out.push(txt(14, (RH - 30) / 2, 60, id, 24, MONO, dim));
      const label = it.role === 'primary' ? 'RESUME' : it.role === 'back' ? 'MAIN MENU' : it.label.toUpperCase();
      out.push(txt(70, (RH - 35) / 2, 300, clip(label, 17), 28, MONO, ink, { weight: 600 }));
      if (it.meta) out.push(txt(PW - 14 - 140, (RH - 30) / 2, 140, it.meta, 24, MONO, dim, { align: 'right' }));
      return out;
    }));
    return { art, buttons };
  },

  motion: () => ({
    // Interface motion: nothing drifts. One status LED pulses (a lit dot sliding behind its lens).
    layers: [{ art: [T.circle(13, 13, 12, LED, { label: 'LED lit' })], w: 26, h: 26, from: [LED_X - 13, LED_Y - 13], to: [LED_X + 31, LED_Y - 13], periodSec: 1.6, ease: 'sine' }],
    note: 'No theatrical light. Rows invert instantly (ease-out 120 ms in the player); the only motion is the status LED.',
  }),
};

/** Stream description for a setup row. */
function stream(ctx: Ctx, it: Item, k: 'a' | 's'): string {
  const m = ctx.main; if (!m) return '';
  const a = it.action;
  if (k === 'a' && a.kind === 'SET_AUDIO') { const t = m.audio[a.trackIndex]; return t ? `${t.codec.toUpperCase()} ${t.channels === 6 ? '5.1' : t.channels === 8 ? '7.1' : t.channels + '.0'} · ${t.lang.toUpperCase()}` : ''; }
  if (k === 's' && a.kind === 'SET_SUBTITLE') { if (a.trackIndex === 'off') return 'NO STREAM'; const t = m.subtitles[a.trackIndex]; return t ? `PGS · ${t.lang.toUpperCase()}${t.sdh ? ' · SDH' : ''}` : ''; }
  return '';
}
void W;
function hashOf(s: string) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
