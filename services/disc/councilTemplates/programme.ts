// Programme — Art House.
// Animation lead: The Ink-Wash Animator (24 fps on twos, ease-in-out; empty space is part of the
// painting, the brush breathes). Graphic designer: The Constructivist Agitator, held to the brief's
// Swiss page (one red diagonal, heavy condensed caps against an editorial serif, margins and
// footnotes). Lighting director: flat daylight on paper, a faint window gradient from the left.
// Structure: a printed programme note. The menu items live INSIDE the paragraph as italic words with
// small red roman numerals; selection is a hand-drawn pencil loop around the word (a PATH). Scenes
// are an index of plates with footnotes; lists are paragraphs; the pop-up is an erratum slip laid
// along the foot of the picture.
import { button as kitButton, glow, linear, txt, T, W, H, type Ctx, type Design, type Item, type O, type State } from './kit';
import type { MenuButton } from '../project';

/** Every button state carries an invisible gradient so its SVG has a <defs>: the font embedder
 *  (services/fabula/broadcastFontEmbed) only injects @font-face into an existing <defs>. */
const FONT_DEFS = () => T.rect(0, 0, 2, 2, '#000000', { opacity: 0, gradient: linear(0, [['#000000', 0, 0], ['#000000', 1, 0]]), label: 'defs' });
const button: typeof kitButton = (item, x, y, w, h, draw, nav) => kitButton(item, x, y, w, h, s => [FONT_DEFS(), ...draw(s)], nav);

const PAPER = '#F1ECE2', INK = '#1B1815', GREY = '#6A645B', RULE = '#2A2622', RED = '#C42A1E', PENCIL = '#4E5157', PENCIL_RED = '#B8261C';
const BODY = 'bodoni', CAPS = 'bigShoulders', HAND = 'kalam';
const L = 192, R = 1728;
const NBSP = ' ';
/** Roman numerals for any count (the kit's table stops at XII). */
const roman = (n: number) => {
  let out = '', v = n;
  for (const [k, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as [number, string][]) while (v >= k) { out += r; v -= k; }
  return out;
};

// Bodoni Moda advance widths (per 100 px), measured in a browser — the paragraph is set by hand,
// so each run must know where the next inline word begins.
const CH = "0123456789 !\"#$%&'()*+,-./:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~—–’“”·éñ…";
const WR = [61, 44, 56, 53, 58, 50, 56, 50, 56, 56, 25, 31, 36, 64, 56, 100, 81, 19, 36, 36, 64, 53, 22, 36, 19, 53, 19, 22, 56, 56, 56, 56, 100, 75, 64, 67, 69, 58, 56, 72, 75, 36, 42, 69, 58, 83, 75, 72, 61, 72, 69, 56, 64, 69, 75, 97, 72, 72, 56, 33, 53, 33, 56, 56, 50, 53, 61, 50, 61, 53, 35, 58, 58, 28, 31, 58, 31, 83, 58, 56, 61, 61, 42, 44, 33, 56, 56, 78, 56, 56, 47, 28, 22, 28, 69, 78, 53, 22, 42, 42, 19, 53, 58, 61];
const WI = [61, 44, 56, 53, 58, 50, 56, 50, 56, 56, 25, 31, 36, 64, 56, 100, 81, 19, 36, 36, 64, 53, 22, 36, 19, 53, 19, 22, 56, 56, 56, 56, 100, 72, 64, 67, 69, 58, 56, 72, 72, 36, 42, 67, 56, 83, 72, 72, 61, 72, 72, 56, 61, 69, 72, 97, 72, 72, 56, 33, 53, 33, 56, 56, 50, 56, 50, 44, 56, 44, 32, 58, 56, 28, 25, 50, 31, 81, 58, 47, 56, 50, 44, 42, 33, 56, 50, 72, 50, 50, 42, 28, 22, 28, 69, 78, 53, 22, 42, 42, 19, 44, 58, 61];
const width = (s: string, size: number, italic = false) => {
  const tbl = italic ? WI : WR; let w = 0;
  for (const c of s) { const i = CH.indexOf(c === NBSP ? ' ' : c); w += i >= 0 ? tbl[i] : 58; }
  return (w / 100) * size * 1.012;
};

const P = (x: number, y: number, w: number, h: number, d: string, fill: string, o: T.ShapeOpts = {}) => T.path(x, y, w, h, d, fill, { ...o, origin: { x: 0, y: 0, w, h } });

/** A pencil loop drawn round a w×h box: one stroke, slightly wobbly, overshooting where it began. */
function pencilLoop(w: number, h: number, seed: number, inset = 4): string {
  const cx = w / 2, cy = h / 2, rx = w / 2 - inset, ry = h / 2 - inset;
  const a0 = Math.PI * (0.92 + (seed % 3) * 0.05), turn = Math.PI * 2 + 0.55, n = 56;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (turn * i) / n;
    const k = 1 + 0.03 * Math.sin(3 * t + seed) - 0.02 * (i / n); // the hand drifts inward as it closes
    const px = cx + Math.cos(t) * rx * k, py = cy + Math.sin(t) * ry * k * (1 + 0.04 * Math.cos(2 * t));
    pts.push(`${px.toFixed(1)} ${py.toFixed(1)}`);
  }
  return 'M' + pts.join(' L');
}
/** A pencil rectangle round a plate: four strokes that overrun the corners. */
function pencilBox(w: number, h: number, seed: number): string {
  const j = (k: number) => ((Math.sin(seed * 7.3 + k * 2.1) + 1) / 2) * 5;
  return `M${-2 + j(1)} ${6 + j(2)} L${w - 4} ${3 + j(3)} M${w - 6 + j(4) * 0.4} -2 L${w - 4 - j(5) * 0.4} ${h - 2} M${w + 2} ${h - 6 - j(6)} L${4 + j(7)} ${h - 3} M${6 - j(8) * 0.4} ${h + 2} L${3 + j(9) * 0.4} ${2}`;
}

type Tok = string | { item: Item; word: string; num?: string };

/**
 * Set a paragraph with inline menu items. Plain runs are text objects; each inline item is a button
 * (numeral + italic word) with the pencil loop as its selected state. Ragged right, Swiss.
 */
function setParagraph(tokens: Tok[], x0: number, y0: number, maxW: number, size: number, pitch: number, art: O[], buttons: MenuButton[], seed = 1) {
  const space = width(' ', size), PAD = Math.round(size * 0.5);
  const textDy = (pitch - size * 1.22) / 2;
  let x = x0, y = y0, run = '', runX = x0, first = true, air = 0, lastRight = -1;
  const flush = () => { if (run) art.push(txt(runX, y + textDy, x0 + maxW - runX + 40, run, size, BODY, INK)); run = ''; };
  const ends = new Map<number, number>();
  const newLine = () => { flush(); ends.set(y, x); x = x0; y += pitch; runX = x0; first = true; lastRight = -1; };
  const placed: { b: MenuButton; item: Item }[] = [];
  for (const tok of tokens) {
    if (typeof tok === 'string') {
      for (const word of tok.split(/[ \t\n]+/).filter(Boolean)) {
        const punct = /^[,.;:)!?]/.test(word);
        const w = width(word, size);
        if (!first && !punct && x + space + w > x0 + maxW) newLine();
        const gap = first ? 0 : punct ? -air : space;
        if (!run) { runX = x + gap; run = word; } else run += (punct ? '' : ' ') + word;
        x += gap + w; first = false; air = 0;
      }
    } else {
      const numW = tok.num ? width(tok.num, size * 0.72) + size * 0.22 : 0;
      const ww = width(tok.word, size, true);
      const bw = Math.max(64, Math.round(numW + ww + PAD * 2));
      air = Math.round(size * 0.12);
      if (!first && x + space + air + bw - PAD * 2 > x0 + maxW) newLine();
      flush();
      const bx = Math.max(Math.round(first ? x - PAD : x + space + air - PAD), first ? -1 : lastRight + 2);
      const it = tok.item, n = seed + buttons.length;
      const b = button(it, bx, y, bw, pitch, s => {
        const on = s !== 'normal', act = s === 'activated';
        const o: O[] = [];
        if (tok.num) o.push(txt(PAD, textDy + size * 0.2, numW, tok.num, Math.round(size * 0.72), BODY, RED, { weight: 600 }));
        o.push(txt(PAD + numW, textDy, ww + 12, tok.word, size, BODY, INK, { italic: true }));
        if (on) o.push(P(0, 0, bw, pitch, pencilLoop(bw, pitch, n), 'none', { stroke: act ? PENCIL_RED : PENCIL, strokeWidth: act ? 4.5 : 3.5, opacity: 0.92, label: 'Pencil loop' }));
        return o;
      });
      buttons.push(b); placed.push({ b, item: it }); lastRight = bx + bw;
      x = bx + bw - PAD + air; runX = x; first = false;
    }
  }
  flush(); ends.set(y, x);
  return { bottom: y + pitch, placed, ends };
}

/** Set the paragraph at the largest size whose last line stays above `floor`. */
function fitParagraph(tokens: Tok[], x0: number, y0: number, maxW: number, sizes: [number, number][], floor: number, art: O[], buttons: MenuButton[], seed = 1) {
  let res: ReturnType<typeof setParagraph> | undefined;
  for (const [i, [size, pitch]] of sizes.entries()) {
    const a: O[] = [], b: MenuButton[] = [];
    res = setParagraph(tokens, x0, y0, maxW, size, pitch, a, b, seed);
    if (res.bottom <= floor || i === sizes.length - 1) { art.push(...a); buttons.push(...b); break; }
  }
  return res!;
}

/** Paper, window light from the left, the page's running head and rule. */
function page(ctx: Ctx, head: string, folio: string, opaque = true): O[] {
  return [
    ...(opaque ? [T.rect(0, 0, W, H, PAPER, { label: 'Paper' })] : []),
    T.rect(0, 0, W, H, '#FFF8E8', { gradient: linear(0, [['#FFF8E8', 0, 0.55], ['#FFF8E8', 0.4, 0.1], ['#000000', 1, 0.06]]), label: 'Window light' }),
    txt(L, 100, 800, head, 28, CAPS, RED, { weight: 700, tracking: 0.3 }),
    txt(R - 800, 100, 800, `${ctx.uhd ? '4K Ultra HD' : 'Blu-ray'} · ${folio}`.toUpperCase(), 28, CAPS, INK, { weight: 700, tracking: 0.3, align: 'right' }),
    T.rect(L, 146, R - L, 3, RULE, { label: 'Head rule' }),
  ];
}
function foot(lines: string, folio: string): O[] {
  return [
    T.rect(L, 950, R - L, 1, RULE, { label: 'Foot rule' }),
    txt(L, 962, R - L - 200, lines, 24, BODY, GREY),
    txt(R - 200, 962, 200, folio, 24, BODY, GREY, { align: 'right', italic: true }),
  ];
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const join = (parts: Tok[][], last = 'or'): Tok[] => parts.flatMap((p, i) => (i === 0 ? p : i === parts.length - 1 ? [last, ...p] : [',', ...p]));
const dur = (ctx: Ctx) => (ctx.main ? `${Math.floor(ctx.main.source.durationSec / 3600)} h ${Math.round((ctx.main.source.durationSec % 3600) / 60)} min` : '');

export const programme: Design = {
  id: 'arthouse',
  // The frontispiece is a window cut in the printed page: the film plays in it.
  background: ctx => (ctx.main ? { kind: 'title', value: PAPER, titleId: ctx.main.id, fromSec: Math.min(480, ctx.main.source.durationSec * 0.25), loopSec: 30 } : { kind: 'color', value: PAPER }),
  subBackground: () => ({ kind: 'color', value: PAPER }),

  main(ctx, items) {
    const PX = 1176, PY = 180, PW = 552, PH = 310;
    const art: O[] = [
      T.rect(0, 0, W, PY, PAPER), T.rect(0, PY + PH, W, H - PY - PH, PAPER), T.rect(0, PY, PX, PH, PAPER), T.rect(PX + PW, PY, W - PX - PW, PH, PAPER),
      ...page(ctx, 'Programme', 'No. 1', false),
      T.rect(PX, PY, PW, PH, 'none', { stroke: INK, strokeWidth: 2, label: 'Plate keyline' }),
      txt(PX, PY + PH + 14, PW, 'Frontispiece. From the film, in motion.', 24, BODY, GREY, { italic: true }),
      // The one diagonal: a red bar driven across the gutter.
      T.rect(1150, 790, 640, 18, RED, { rotation: -16, label: 'Constructivist bar' }),
    ];
    const name = ctx.title.toUpperCase();
    const size = Math.max(84, Math.min(132, Math.floor(1700 / Math.max(8, name.length))));
    const title = T.text(L - 4, 176, 900, name, { size, font: CAPS, weight: 800, color: INK, wrap: true, leading: 0.9 });
    art.push(title);
    const buttons: MenuButton[] = [];
    const tokens: Tok[] = [];
    const t = ctx.main;
    tokens.push(`This edition of ${ctx.title} runs ${dur(ctx) || 'its full length'}${t && t.chapters.length > 1 ? `, in ${t.chapters.length} chapters` : ''}.`);
    let n = 0;
    for (const it of items) {
      const num = `${roman(++n).toLowerCase()}.`;
      const tk = { item: it, word: it.label, num };
      if (it.role === 'primary') tokens.push('One may begin at once and', { ...tk, word: lower(it.label) === 'play all' ? 'play all' : 'play' }, 'the film, reading nothing further;');
      else if (it.label === 'Episodes') tokens.push('each instalment may be taken alone from the', tk, ';');
      else if (it.label === 'Scenes' || it.label === 'Setlist') tokens.push('or enter midway by the', tk, ', an index of plates;');
      else if (it.label === 'Setup') tokens.push('sound and subtitles are chosen in the', tk, ';');
      else if (it.label === 'Extras') tokens.push('and, as in any good programme, the', tk, 'are kept at the back.');
      else tokens.push('see also', tk, ';');
    }
    const last = tokens[tokens.length - 1];
    if (typeof last === 'string' && last.endsWith(';')) tokens[tokens.length - 1] = last.slice(0, -1) + '.';
    const y0 = Math.max(T.below(title, 48), 372);
    const { placed, ends } = fitParagraph(tokens, L, y0, 860, [[34, 62], [32, 58], [30, 54]], 930, art, buttons);
    const play = placed.find(p => p.item.role === 'primary');
    if (play) {
      // A pencil note in the margin of the line, when the line leaves room for one.
      const end = (ends.get(play.b.y) ?? 0) + 26, limit = play.b.y + 62 > PY && play.b.y < PY + PH ? PX - 16 : R;
      if (end + 160 < limit) art.push(txt(end, play.b.y + 10, 220, '← begin here', 30, HAND, PENCIL, { rotation: -4 }));
    }
    art.push(...foot(`Running time ${dur(ctx)}. Choices are marked in pencil; the arrows move the pencil from one to the next.`, '— i —'));
    return { art, buttons };
  },

  scenes(ctx, items, page_, pages) {
    const art: O[] = [...page(ctx, 'Index of Plates', pages > 1 ? `Plates ${page_ + 1}/${pages}` : 'Plates')];
    const chapters = items.filter(i => i.thumb), nav = items.filter(i => !i.thumb);
    const BW = 440, BH = 248, M = 14;
    const buttons: MenuButton[] = chapters.map((it, i) => {
      const k = i % 3, r = Math.floor(i / 3);
      const x = L + k * 548, y = 196 + r * 340;
      const mark = '¹²³⁴⁵⁶⁷⁸⁹'[i] || '*';
      art.push(txt(x + M, y + BH + 6, 120, `Pl. ${roman(it.index!)}`, 28, CAPS, RED, { weight: 700, tracking: 0.06 }));
      art.push(txt(x + M + 100, y + BH + 4, BW - 120, `${it.label}${mark}`, 28, BODY, INK, { italic: true }));
      return button(it, x, y, BW, BH, s => {
        const on = s !== 'normal', act = s === 'activated';
        const o: O[] = [
          T.rect(0, 0, BW, M, PAPER), T.rect(0, BH - M, BW, M, PAPER), T.rect(0, 0, M, BH, PAPER), T.rect(BW - M, 0, M, BH, PAPER),
          T.rect(M, M, BW - M * 2, BH - M * 2, 'none', { stroke: INK, strokeWidth: 2, label: 'Plate keyline' }),
        ];
        if (on) o.push(P(0, 0, BW, BH, pencilBox(BW, BH, i + 1), 'none', { stroke: act ? PENCIL_RED : PENCIL, strokeWidth: act ? 5 : 4, opacity: 0.92, label: 'Pencil marks' }));
        return o;
      });
    });
    // Navigation is a sentence, as everything here is.
    const prev = nav.find(n => n.label === 'Previous'), next = nav.find(n => n.label === 'Next'), back = nav.find(n => n.role === 'back');
    const tk: Tok[] = ['Turn'];
    if (prev) tk.push('back to the', { item: prev, word: 'earlier plates' }, next || back ? ',' : '.');
    if (next) tk.push(prev ? 'on to the' : 'on to the', { item: next, word: 'later plates' }, back ? ',' : '.');
    if (back) tk.push(prev || next ? 'or' : '', { item: back, word: 'return to the note' }, '.');
    setParagraph(tk.filter(t => t !== ''), L, 868, R - L, 34, 62, art, buttons, 9);
    art.push(...foot(chapters.map((c, i) => `${'¹²³⁴⁵⁶⁷⁸⁹'[i] || '*'} ${c.meta}`).join('   '), `— ${roman(page_ + 2).toLowerCase()} —`));
    return { art, buttons };
  },

  list(ctx, heading, kind, items) {
    const art: O[] = [...page(ctx, kind === 'SETUP' ? 'Notes on the Edition' : kind === 'EXTRAS' ? 'Appendix' : 'Contents', heading)];
    const back = items.find(i => i.role === 'back'), rows = items.filter(i => i.role !== 'back');
    const title = T.text(L - 4, 176, 1100, heading.toUpperCase(), { size: 112, font: CAPS, weight: 800, color: INK, wrap: true, leading: 0.9 });
    art.push(title);
    // Ornament: a big red numeral and the diagonal, on the right of the measure.
    art.push(txt(1300, 180, 428, kind === 'SETUP' ? 'II' : kind === 'EXTRAS' ? 'III' : 'IV', 260, CAPS, RED, { weight: 800, align: 'right', opacity: 0.92 }));
    art.push(T.rect(1290, 660, 520, 18, RED, { rotation: -16 }));
    const buttons: MenuButton[] = [];
    let n = 0;
    const word = (it: Item): Exclude<Tok, string> => ({ item: it, word: it.label, num: `${roman(++n).toLowerCase()}.` });
    const tokens: Tok[] = [];
    if (kind === 'SETUP') {
      const audio = rows.filter(r => r.sub === 'Audio'), subs = rows.filter(r => r.sub === 'Subtitles'), other = rows.filter(r => r.sub !== 'Audio' && r.sub !== 'Subtitles');
      if (audio.length) tokens.push('The film may be heard in', ...join(audio.map(a => [word(a)])), '.');
      if (subs.length) {
        const off = subs.find(s => s.label === 'Off'), rest = subs.filter(s => s !== off);
        tokens.push('It may be read');
        if (off) tokens.push('without subtitles', { ...word(off), word: 'off' }, rest.length ? ', or with subtitles in' : '.');
        else tokens.push('with subtitles in');
        if (rest.length) tokens.push(...join(rest.map(r => [word(r)])), '.');
      }
      if (other.length) tokens.push('Also:', ...join(other.map(o => [word(o)]), 'and'), '.');
    } else {
      const lead = kind === 'EXTRAS' ? 'Appended to this edition are' : `${ctx.title} is printed in ${rows.length} parts:`;
      tokens.push(lead, ...rows.flatMap((r, i) => [...(i === 0 ? [] : i === rows.length - 1 ? ['and'] : [',']), word(r), ...(r.meta ? [`(${r.meta.replace(/ /g, NBSP)})`] : [])]), '.');
    }
    if (back) tokens.push('When finished,', { item: back, word: 'return to the note' }, '.');
    fitParagraph(tokens, L, Math.max(T.below(title, 56), 400), 1040, [[38, 70], [34, 62], [30, 56], [28, 50]], 936, art, buttons, 3);
    art.push(...foot(kind === 'SETUP' ? 'The choice is remembered for this sitting.' : 'Durations are approximate, rounded to the minute.', `— ${kind === 'SETUP' ? 'ii' : 'iii'} —`));
    return { art, buttons };
  },

  popup(ctx, items) {
    // An erratum slip laid along the foot of the picture.
    const Y = 900, art: O[] = [
      T.rect(120, Y, 1680, 104, PAPER, { shadow: { x: 0, y: 6, blur: 14, color: 'rgba(0,0,0,0.45)' }, label: 'Slip' }),
      T.rect(120, Y, 12, 104, RED, { label: 'Red edge' }),
      txt(160, Y + 8, 400, 'ERRATUM SLIP', 24, CAPS, RED, { weight: 700, tracking: 0.3 }),
    ];
    const buttons: MenuButton[] = [];
    const resume = items.find(i => i.role === 'primary'), home = items.find(i => i.role === 'back');
    const ch = items.filter(i => i.index != null);
    const tk: Tok[] = [];
    if (resume) tk.push({ item: resume, word: lower(resume.label) }, 'the film, or turn to chapter');
    ch.forEach(c => tk.push({ item: c, word: roman(c.index!).toLowerCase() }));
    if (home) tk.push(', or the', { item: home, word: 'contents' }, '.');
    setParagraph(tk, 400, Y + 22, 1380, 30, 62, art, buttons, 5);
    return { art, buttons };
  },

  motion: () => ({
    // Ink-wash restraint: nothing moves on the page; only daylight slides across the plate's gloss.
    layers: [{ art: [glow(260, 200, 260, 200, '#FFFFFF', 0.18, 'Daylight on the plate')], w: 520, h: 400, from: [1000, 140], to: [1420, 160], periodSec: 20, ease: 'sine', blend: 'screen' }],
    grain: 4,
    note: 'Ink-wash: on twos at 24 fps; the pencil loop draws on in 6 drawings; the page itself holds still.',
  }),
};
