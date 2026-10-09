// Riso Riot — THE REBELLIOUS HAND.
//
// "What did a human actually do to this, and can I see it?"
// Two-drum risograph stickers: fluorescent pink over riso blue (or teal), each plate printed on
// its own pass so the second never lands where the first did. The overprint is a real multiply,
// so where the inks cross you get the third colour riso is loved for. Type is cut letter by letter
// and stuck down crooked; stamps are inked through a rubber texture that drops out.
//
// Under the shared light plot: the die-cut vinyl border casts the key light's drop shadow, the RIM
// catches the cut edge lower-right, and the CORE SHADOW is printed — a halftone screen that gets
// denser toward the lower-right, which is how a riso shades anything.

import { Svg, svgEmote, KEY_LIGHT } from '../../emoteRig';
import { type Spec, toDefs, esc, jitter, f1 } from './kit';
import type { EmotePack } from '../../emoteTypes';

const PINK = '#FF48B0';      // riso Fluorescent Pink
const BLUE = '#0078BF';      // riso Blue
const TEAL = '#00838A';      // riso Teal
const YELLOW = '#FFE800';    // riso Yellow
const PAPER = '#FFFBF2';
const FONT = "'Arial Black','Segoe UI Black',Impact,sans-serif";

const MUL = 'style="mix-blend-mode:multiply"';

/** Riso halftone screen (dots at 30°) in one ink. */
function screen(s: Svg, ink: string, cell = 4.2, r = 1.25): string {
  const id = s.uid('ht');
  s.def(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${cell}" height="${cell}" patternTransform="rotate(30)">`
    + `<circle cx="${cell / 2}" cy="${cell / 2}" r="${r}" fill="${ink}"/></pattern>`);
  return `url(#${id})`;
}
/** The key light, printed: no dots top-left, full screen bottom-right. */
function coreShadowMask(s: Svg): string {
  const id = s.uid('mk');
  const g = s.linear([[0.3, '#000'], [0.62, '#888'], [1, '#fff']], 0.1, 0.05, 0.9, 0.95);
  s.def(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="128" height="128"><rect width="128" height="128" fill="${g}"/></mask>`);
  return `mask="url(#${id})"`;
}
/** Rubber-stamp texture: ink that dropped out where the stamp didn't bite. */
function stampFilter(s: Svg, seed = 3): string {
  const id = s.uid('st');
  s.def(`<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="3" seed="${seed}" result="n"/>`
    + `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -10 6.6" result="m"/>`
    + `<feComposite in="SourceGraphic" in2="m" operator="in"/></filter>`);
  return `filter="url(#${id})"`;
}

// letter advance widths for Arial Black, em fractions (cut-letter layout)
const ADV: Record<string, number> = { I: 0.4, W: 1.02, M: 0.95, O: 0.84, ' ': 0.32, '!': 0.42, '?': 0.7, L: 0.68, A: 0.82, N: 0.84 };

interface Cut { ch: string; x: number; y: number; rot: number; size: number }
function layout(text: string, cx: number, y: number, size: number, seed: number, wobble = 7): Cut[] {
  const adv = [...text].map(c => (ADV[c] ?? 0.76) * size * 0.97);
  const total = adv.reduce((a, b) => a + b, 0);
  let x = cx - total / 2;
  return [...text].map((ch, i) => {
    const c = { ch, x: x + adv[i] / 2, y: y + jitter(seed + i * 3.1) * size * 0.06, rot: jitter(seed + i * 7.7) * wobble, size: size * (1 + jitter(seed + i * 1.3) * 0.05) };
    x += adv[i];
    return c;
  });
}
function letters(cuts: Cut[], attrs: string, dx = 0, dy = 0): string {
  return cuts.filter(c => c.ch !== ' ').map(c =>
    `<text x="${f1(c.x + dx)}" y="${f1(c.y + dy)}" text-anchor="middle" transform="rotate(${f1(c.rot)} ${f1(c.x + dx)} ${f1(c.y - c.size * 0.35 + dy)})" style="font-family:${FONT};font-weight:900;font-size:${f1(c.size)}px" ${attrs}>${esc(c.ch)}</text>`).join('');
}

/** A cut-letter sticker. `lines` are stacked; plates: A = the top ink (solid), B = the misregistered under-plate. */
function cutSticker(lines: { text: string; y: number; size: number }[], o: { a?: string; b?: string; tilt?: number; seed?: number; rim?: string; reg?: [number, number] } = {}) {
  const A = o.a ?? PINK, B = o.b ?? BLUE, [rx, ry] = o.reg ?? [2.6, 2];
  return svgEmote(s => {
    const cuts = lines.flatMap((l, i) => layout(l.text, 64, l.y, l.size, (o.seed ?? 1) + i * 19));
    const border = Math.max(...lines.map(l => l.size)) * 0.34;
    const tf = o.tilt ? ` transform="rotate(${o.tilt} 64 64)"` : '';
    const rim = s.rimGradient(o.rim ?? B, 1);
    s.add(`<g${tf}>`);
    // die-cut vinyl: rim edge, then paper, with the key's drop shadow
    s.add(`<g ${s.shadowFilter(3, 2, 0.42)}>${letters(cuts, `fill="${PAPER}" stroke="${PAPER}" stroke-width="${f1(border + 3)}" stroke-linejoin="round"`)}</g>`);
    s.add(letters(cuts, `fill="none" stroke="${rim}" stroke-width="${f1(border + 3)}" stroke-linejoin="round"`));
    s.add(letters(cuts, `fill="${PAPER}" stroke="${PAPER}" stroke-width="${f1(border)}" stroke-linejoin="round"`));
    // plates
    s.add(`<g style="isolation:isolate">`);
    s.add(letters(cuts, `fill="${B}"`, rx, ry));
    s.add(letters(cuts, `fill="${A}"`));
    s.add(`<g ${MUL} ${coreShadowMask(s)}>${letters(cuts, `fill="${screen(s, B)}"`)}</g>`);
    s.add(`</g>`);
    s.glint(cuts[0].x - cuts[0].size * 0.26, cuts[0].y - cuts[0].size * 0.72, 4.5, KEY_LIGHT, 0.95);
    s.add(`</g>`);
  });
}

/** A die-cut sticker around any drawn shape: paper border + rim + shadow, then plates drawn by `ink`. */
function shapeSticker(outline: string, border: number, ink: (s: Svg) => void, o: { rim?: string; tilt?: number } = {}) {
  return svgEmote(s => {
    const tf = o.tilt ? ` transform="rotate(${o.tilt} 64 64)"` : '';
    s.add(`<g${tf}>`);
    s.add(`<path d="${outline}" fill="${PAPER}" stroke="${PAPER}" stroke-width="${border + 3}" stroke-linejoin="round" ${s.shadowFilter(3, 2, 0.42)}/>`);
    s.add(`<path d="${outline}" fill="none" stroke="${s.rimGradient(o.rim ?? BLUE, 1)}" stroke-width="${border + 3}" stroke-linejoin="round"/>`);
    s.add(`<path d="${outline}" fill="${PAPER}" stroke="${PAPER}" stroke-width="${border}" stroke-linejoin="round"/>`);
    s.add(`<g style="isolation:isolate">`);
    ink(s);
    s.add(`</g></g>`);
  });
}

// ── type stickers ───────────────────────────────────────────────────────────────────────────────
const lol = cutSticker([{ text: 'LOL', y: 84, size: 50 }], { tilt: -6, seed: 2 });
const noWay = cutSticker([{ text: 'NO', y: 58, size: 42 }, { text: 'WAY', y: 102, size: 40 }], { tilt: 5, seed: 5, a: PINK, b: TEAL, rim: TEAL });
const bruh = cutSticker([{ text: 'BRUH', y: 80, size: 34 }], { tilt: -4, seed: 11, a: BLUE, b: PINK, rim: PINK });
const sus = cutSticker([{ text: 'SUS', y: 84, size: 48 }], { tilt: 7, seed: 17, a: TEAL, b: PINK, rim: PINK });
const yikes = cutSticker([{ text: 'YIKES', y: 80, size: 30 }], { tilt: -8, seed: 23, a: PINK, b: BLUE });
const banger = cutSticker([{ text: 'BANG', y: 60, size: 36 }, { text: 'ER!', y: 102, size: 38 }], { tilt: -5, seed: 31, a: PINK, b: TEAL, rim: TEAL });
const real = cutSticker([{ text: 'FR', y: 88, size: 62 }], { tilt: 4, seed: 41, a: BLUE, b: PINK, rim: PINK });

// ── drawn stickers ──────────────────────────────────────────────────────────────────────────────
const SKULL = 'M 64 14 C 94 14 110 34 110 60 C 110 76 102 84 94 88 L 94 104 Q 94 112 86 112 L 42 112 Q 34 112 34 104 L 34 88 C 26 84 18 76 18 60 C 18 34 34 14 64 14 Z';
const skull = shapeSticker(SKULL, 10, s => {
  const holes = 'M 34 60 Q 34 46 48 48 Q 58 50 56 62 Q 54 74 44 72 Q 34 70 34 60 Z M 94 60 Q 94 46 80 48 Q 70 50 72 62 Q 74 74 84 72 Q 94 70 94 60 Z M 64 74 L 71 88 L 57 88 Z';
  // blue under-plate (misregistered), pink top plate with the holes knocked out
  s.add(`<path d="${SKULL}" fill="${BLUE}" transform="translate(3 2)"/>`);
  s.add(`<path d="${SKULL} ${holes}" fill="${PINK}" fill-rule="evenodd"/>`);
  s.add(`<path d="${SKULL}" fill="${screen(s, BLUE)}" ${coreShadowMask(s)} ${MUL}/>`);
  s.add(`<path d="M 48 96 L 48 112 M 60 96 L 60 112 M 72 96 L 72 112 M 84 96 L 84 112" stroke="${BLUE}" stroke-width="3.6" stroke-linecap="round" transform="translate(2 1)" ${MUL}/>`);
}, { tilt: -7 });

/** Two strips of torn tape crossed — the X you make when you have no marker. */
function tapeStrip(x1: number, y1: number, x2: number, y2: number, w: number, seed: number): string {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const P = (t: number, n: number) => `${f1(x1 + ux * t + nx * n)} ${f1(y1 + uy * t + ny * n)}`;
  let d = `M ${P(0, -w / 2)} L ${P(L, -w / 2)}`;
  for (let i = 1; i <= 5; i++) d += ` L ${P(L + jitter(seed + i) * 4, -w / 2 + (w * i) / 5)}`;   // torn end
  d += ` L ${P(0, w / 2)}`;
  for (let i = 4; i >= 1; i--) d += ` L ${P(jitter(seed + 20 + i) * 4, -w / 2 + (w * i) / 5)}`;
  return d + ' Z';
}
const xTape = svgEmote(s => {
  const a = tapeStrip(18, 22, 110, 106, 26, 3), b = tapeStrip(110, 20, 18, 108, 26, 9);
  s.add(`<g ${s.shadowFilter(2.4, 1.6, 0.35)}><path d="${a}" fill="${PAPER}"/><path d="${b}" fill="${PAPER}"/></g>`);
  s.add(`<g style="isolation:isolate">`);
  s.add(`<path d="${a}" fill="${PINK}" opacity="0.92" ${MUL}/>`);
  s.add(`<path d="${b}" fill="${BLUE}" opacity="0.9" ${MUL}/>`);
  s.add(`<path d="${b}" fill="${screen(s, PINK, 4.2, 1.1)}" ${coreShadowMask(s)} ${MUL}/>`);
  s.add(`</g>`);
  s.add(`<path d="${a}" fill="none" stroke="${s.rimGradient(BLUE, 0.9)}" stroke-width="1.8"/><path d="${b}" fill="none" stroke="${s.rimGradient(PINK, 0.9)}" stroke-width="1.8"/>`);
  s.glint(30, 30, 4.5);
});

// melting face: a sticker you left on the dashboard
const MELT = 'M 64 14 C 92 14 110 34 110 60 C 110 72 106 80 104 86 C 102 94 106 100 104 108 C 102 116 92 116 92 106 C 92 98 86 96 80 100 C 76 104 78 116 70 118 C 60 120 60 108 56 102 C 50 96 44 104 38 108 C 30 114 22 108 24 98 C 26 90 18 80 18 60 C 18 34 36 14 64 14 Z';
const melt = shapeSticker(MELT, 9, s => {
  s.add(`<path d="${MELT}" fill="${YELLOW}" transform="translate(3 2.4)"/>`);
  s.add(`<path d="${MELT}" fill="${PINK}"/>`);
  s.add(`<path d="${MELT}" fill="${screen(s, BLUE)}" ${coreShadowMask(s)} ${MUL}/>`);
  // features printed on the blue drum, a hair off
  s.add(`<g transform="translate(-1.6 1.4)" ${MUL}>`
    + `<path d="M 40 54 Q 46 48 52 54" stroke="${BLUE}" stroke-width="5" fill="none" stroke-linecap="round"/>`
    + `<path d="M 76 54 Q 82 48 88 54" stroke="${BLUE}" stroke-width="5" fill="none" stroke-linecap="round"/>`
    + `<path d="M 42 74 Q 52 84 62 76 Q 72 68 86 80" stroke="${BLUE}" stroke-width="5.5" fill="none" stroke-linecap="round"/>`
    + `<path d="M 86 80 Q 88 90 84 96" stroke="${BLUE}" stroke-width="4" fill="none" stroke-linecap="round"/>`
    + `</g>`);
}, { rim: BLUE });

/** Rubber stamp on a round paper sticker. */
function stamp(word: string, ink: string, o: { size: number; ring: string; tilt: number; strike?: boolean; seed: number; band: string }) {
  const OUT = 'M 64 8 A 56 56 0 1 1 63.9 8 Z';
  return shapeSticker(OUT, 2, s => {
    const tex = stampFilter(s, o.seed);
    const ring = s.uid('rp');
    s.def(`<path id="${ring}" d="M 64 22 A 42 42 0 1 1 63.9 22"/>`);
    s.add(`<g ${tex} transform="rotate(${o.tilt} 64 64)" ${MUL}>`
      + `<circle cx="64" cy="64" r="51" fill="none" stroke="${ink}" stroke-width="5"/>`
      + `<circle cx="64" cy="64" r="34" fill="none" stroke="${ink}" stroke-width="2.4"/>`
      + `<text style="font-family:${FONT};font-weight:900;font-size:10.5px;letter-spacing:2.6px" fill="${ink}"><textPath href="#${ring}">${esc(o.ring)}</textPath></text>`
      + `<rect x="10" y="${64 - o.size * 0.5}" width="108" height="${o.size * 0.98}" fill="${PAPER}"/>`

      + `<rect x="10" y="${64 - o.size * 0.5}" width="108" height="${o.size * 0.98}" fill="none" stroke="${ink}" stroke-width="4"/>`
      // the second drum: the same word in the other ink, a hair out of register
      + `<text x="66.5" y="${66 + o.size * 0.33}" text-anchor="middle" style="font-family:${FONT};font-weight:900;font-size:${o.size}px;letter-spacing:-1px" fill="${o.band}" opacity="0.85">${esc(word)}</text>`
      + `<text x="64" y="${64 + o.size * 0.33}" text-anchor="middle" style="font-family:${FONT};font-weight:900;font-size:${o.size}px;letter-spacing:-1px" fill="${ink}">${esc(word)}</text>`
      + (o.strike ? `<path d="M 16 ${64 + 4} L 112 ${64 - 6}" stroke="${PINK}" stroke-width="6" stroke-linecap="round"/>` : '')
      + `</g>`);
  }, { rim: ink });
}
const noCap = stamp('NO CAP', BLUE, { size: 24, ring: '★ CERTIFIED ★ CERTIFIED ★ CERTIFIED ', tilt: -12, seed: 4, band: PINK });
const cap = stamp('CAP', PINK, { size: 34, ring: '✕ NOT TRUE ✕ NOT TRUE ✕ NOT TRUE ', tilt: 10, seed: 8, band: BLUE });

const SPECS: Spec[] = [
  ['risolol', 'LOL sticker', PINK, 'bounce', lol, 'lol laugh funny haha riso sticker', undefined, 'storm'],
  ['noway', 'No way', PINK, 'shake', noWay, 'no way what shocked omg riso'],
  ['risobruh', 'Bruh sticker', BLUE, 'pop', bruh, 'bruh really riso'],
  ['risosus', 'Sus sticker', TEAL, 'pop', sus, 'sus suspicious sketchy riso'],
  ['yikes', 'Yikes', PINK, 'shake', yikes, 'yikes cringe oof awkward riso'],
  ['banger', 'Banger', PINK, 'stomp', banger, 'banger song tune fire hype riso', undefined, 'shockwave'],
  ['fr', 'For real', BLUE, 'stomp', real, 'fr for real true facts riso'],
  ['risoskull', 'Skull sticker', PINK, 'shake', skull, 'skull dead im dead lmao riso'],
  ['risox', 'Taped X', BLUE, 'stomp', xTape, 'x no nope wrong cross riso tape'],
  ['melt', 'Melting', PINK, 'rain', melt, 'melt melting embarrassed overwhelmed hot riso', '🫠'],
  ['nocap', 'No cap', BLUE, 'stomp', noCap, 'no cap true real honest facts stamp riso', undefined, 'wall'],
  ['cap', 'Cap', PINK, 'stomp', cap, 'cap lie false fake stamp riso'],
];

export const RISO_PACK: EmotePack = {
  id: 'riso',
  name: 'Riso Riot',
  blurb: 'The Rebellious Hand: two inks, never in register, cut out and stuck down crooked.',
  director: 'REBEL',
  icon: 'riso.risolol',
  emotes: toDefs('riso', SPECS),
};
