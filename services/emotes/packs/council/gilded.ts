// Gilded — THE CLASSICAL MIND.
//
// "What is the measure, and what hangs from it?"
// The measure is the golden section of the 128 square: 128 / φ ≈ 79, so the major axis of every
// object sits on 79 or 49 and the eye rests where it has earned it. Three materials only — water-
// gilded gold, Carrara marble, and one enamel (Pompeian red or lapis) — and inscriptional capitals
// in the Roman manner: spaced, serifed, cut rather than printed.
//
// Under the shared light plot gold is where the rig is most itself: the KEY is the burnished band
// across the metal, the RIM is a cool cyan (the rig's rule for warm subjects), the contact SHADOW
// is low and wide because these things are heavy. Human trace: gold leaf is laid in squares, and
// the faint seams between leaves are left in, the way a gilder's work shows up close.

import { Svg, svgEmote, RIM_CYAN, KEY_LIGHT, shade } from '../../emoteRig';
import { type Spec, toDefs, esc, pol, f1 } from './kit';
import type { EmotePack } from '../../emoteTypes';

const PHI_MAJ = 79;                   // 128/φ — the golden-section line (its partner is 49)
const OXBLOOD = '#8E1F2A';            // Pompeian red enamel
const LAPIS = '#1F3F8F';
const MARBLE = '#F2EEE6';
const BRONZE_INK = '#4A2A06';         // the engraved line
const SERIF = "'Times New Roman','Book Antiqua',Georgia,'Palatino Linotype',serif";

/** Burnished gold: banded like real metal, hot band where the key hits. */
function goldFill(s: Svg, angle: 'diag' | 'vert' = 'diag'): string {
  const [x1, y1, x2, y2] = angle === 'vert' ? [0, 0, 0, 1] : [0.1, 0, 0.9, 1];
  return s.linear([[0, '#FFE9A8'], [0.18, '#F6C94E'], [0.36, '#FFF4C8'], [0.55, '#D49A2A'], [0.78, '#A86A12'], [1, '#6E4208']], x1, y1, x2, y2);
}
/** Leaf seams: the gilder's grid, clipped to the shape. */
function leafSeams(s: Svg, d: string, cell = 14) {
  let g = '';
  for (let x = 4; x < 128; x += cell) g += `M ${x} 0 L ${x} 128 `;
  for (let y = 6; y < 128; y += cell) g += `M 0 ${y} L 128 ${y} `;
  s.add(`<g ${s.clip(`<path d="${d}"/>`)}><path d="${g}" stroke="#8A5A10" stroke-width="0.6" opacity="0.28"/></g>`);
}
/** A gilded solid under the rig. */
function gild(s: Svg, d: string, o: { shadow?: boolean; seams?: boolean; edge?: number; rimW?: number; transform?: string } = {}) {
  const tf = o.transform ? ` transform="${o.transform}"` : '';
  s.add(`<g${tf}>`);
  s.add(`<path d="${d}" fill="${goldFill(s)}" ${o.shadow === false ? '' : s.shadowFilter(3, 2.2, 0.4)}/>`);
  if (o.seams !== false) leafSeams(s, d);
  const clip = s.clip(`<path d="${d}"/>`);
  s.add(`<g ${clip}><path d="${d}" fill="none" stroke="${KEY_LIGHT}" stroke-opacity="0.7" stroke-width="4" transform="translate(1.6 1.8)" ${s.blurFilter(1.4)}/></g>`);
  s.add(`<path d="${d}" fill="none" stroke="${BRONZE_INK}" stroke-width="${o.edge ?? 1.4}" stroke-linejoin="round" opacity="0.75"/>`);
  s.add(`<path d="${d}" fill="none" stroke="${s.rimGradient(RIM_CYAN, 0.85)}" stroke-width="${o.rimW ?? 2}" stroke-linejoin="round"/>`);
  s.add(`</g>`);
}
/** Enamel or marble — the one non-metal, lit by the same key. */
function enamel(s: Svg, d: string, base: string, o: { shadow?: boolean; rim?: string } = {}) {
  s.add(`<path d="${d}" fill="${s.keyGradient(base, { hi: 18, lo: 20 })}" ${o.shadow ? s.shadowFilter(2.4, 1.8, 0.35) : ''}/>`);
  s.add(`<path d="${d}" fill="none" stroke="${s.rimGradient(o.rim ?? RIM_CYAN, 0.7)}" stroke-width="1.8"/>`);
}
/** Inscriptional capitals cut into gold: dark incision, gold face, burnished top edge. */
function inscribe(s: Svg, text: string, o: { x?: number; y: number; size: number; spacing?: number; fill?: string; ink?: string; italic?: boolean }) {
  const x = o.x ?? 64;
  const st = `font-family:${SERIF};font-weight:700;font-size:${o.size}px;letter-spacing:${o.spacing ?? 2}px${o.italic ? ';font-style:italic' : ''}`;
  const t = esc(text);
  s.add(`<text x="${x}" y="${o.y}" text-anchor="middle" style="${st}" fill="none" stroke="${o.ink ?? BRONZE_INK}" stroke-width="3.6" stroke-linejoin="round" ${s.shadowFilter(2, 1.2, 0.4)}>${t}</text>`);
  s.add(`<text x="${x}" y="${o.y}" text-anchor="middle" style="${st}" fill="${o.fill ?? goldFill(s, 'vert')}">${t}</text>`);
  s.add(`<text x="${x - 0.5}" y="${o.y - 0.7}" text-anchor="middle" style="${st}" fill="none" stroke="${KEY_LIGHT}" stroke-width="0.5" opacity="0.7">${t}</text>`);
}

// ── shapes ──────────────────────────────────────────────────────────────────────────────────────
function leaf(cx: number, cy: number, len: number, wid: number, deg: number): string {
  const [tx, ty] = pol(cx, cy, len / 2, deg), [bx, by] = pol(cx, cy, len / 2, deg + 180);
  const [l1x, l1y] = pol(cx, cy, wid / 2, deg - 90), [l2x, l2y] = pol(cx, cy, wid / 2, deg + 90);
  return `M ${f1(bx)} ${f1(by)} Q ${f1(l1x + (tx - bx) * 0.1)} ${f1(l1y + (ty - by) * 0.1)} ${f1(tx)} ${f1(ty)} Q ${f1(l2x + (tx - bx) * 0.1)} ${f1(l2y + (ty - by) * 0.1)} ${f1(bx)} ${f1(by)} Z`;
}
/** One side of a wreath: leaves pairs along an arc. side = −1 left, +1 right. */
function wreathSide(cx: number, cy: number, r: number, side: 1 | -1, n = 8, from = 112, to = 248, len = 17, wid = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), a = from + (to - from) * t;
    const deg = side < 0 ? a : 180 - a;
    const [px, py] = pol(cx, cy, r, deg);
    const tangent = deg + (side < 0 ? 90 : -90);
    const k = 1 - t * 0.35;
    out.push(leaf(...pol(px, py, 6 * k, deg + 180), len * k, wid * k, tangent - 28 * side * -1 + (side < 0 ? 0 : 0)));
    out.push(leaf(...pol(px, py, 6 * k, deg), len * k, wid * k, tangent + 28 * side * -1));
  }
  return out;
}

const laurel = svgEmote(s => {
  s.contactShadow(64, 118, 36, 0.3);
  const stemL = `M ${f1(pol(64, 60, 42, 105)[0])} ${f1(pol(64, 60, 42, 105)[1])} A 42 42 0 0 1 ${f1(pol(64, 60, 42, 255)[0])} ${f1(pol(64, 60, 42, 255)[1])}`;
  const stemR = `M ${f1(pol(64, 60, 42, 75)[0])} ${f1(pol(64, 60, 42, 75)[1])} A 42 42 0 0 0 ${f1(pol(64, 60, 42, -75)[0])} ${f1(pol(64, 60, 42, -75)[1])}`;
  s.add(`<path d="${stemL} ${stemR}" stroke="#A86A12" stroke-width="3" fill="none" stroke-linecap="round"/>`);
  for (const d of [...wreathSide(64, 60, 42, -1, 8, 100, 248, 24, 11), ...wreathSide(64, 60, 42, 1, 8, 100, 248, 24, 11)]) gild(s, d, { shadow: false, seams: false, edge: 0.7, rimW: 0.9 });
  // the ribbon knot, in the one enamel
  enamel(s, 'M 64 102 L 50 122 L 56 122 L 64 112 L 72 122 L 78 122 Z', OXBLOOD, { shadow: true });
  s.add(`<ellipse cx="64" cy="104" rx="7" ry="5" fill="${s.sphereGradient(OXBLOOD)}"/>`);
  s.glint(36, 34, 5);
});

const medal = svgEmote(s => {
  s.contactShadow(64, 120, 30, 0.3);
  // ribbon: oxblood with a marble stripe, folded at the golden-section line
  enamel(s, 'M 34 6 L 58 6 L 72 58 L 56 64 Z', OXBLOOD);
  enamel(s, 'M 94 6 L 70 6 L 56 58 L 72 64 Z', shade(OXBLOOD, -8));
  s.add(`<path d="M 44 6 L 48 6 L 63 60 L 60 61 Z M 84 6 L 80 6 L 65 60 L 68 61 Z" fill="${MARBLE}" opacity="0.9"/>`);
  const disc = 'M 64 50 A 30 30 0 1 1 63.9 50 Z';
  gild(s, disc);
  s.add(`<circle cx="64" cy="${PHI_MAJ + 1}" r="22.5" fill="none" stroke="${BRONZE_INK}" stroke-width="1.2" opacity="0.6"/>`);
  for (const d of [...wreathSide(64, 81, 20, -1, 5, 120, 240, 8, 4), ...wreathSide(64, 81, 20, 1, 5, 120, 240, 8, 4)]) s.add(`<path d="${d}" fill="#B87A16" stroke="${BRONZE_INK}" stroke-width="0.5" opacity="0.9"/>`);
  inscribe(s, 'I', { y: 92, size: 32, spacing: 0 });
  s.glint(48, 62, 5.5);
});

const crown = svgEmote(s => {
  s.contactShadow(64, 114, 46, 0.3);
  // a classical corona: band of proportion 1 : φ against its points
  const d = 'M 18 96 L 14 46 L 34 66 L 46 34 L 64 58 L 82 34 L 94 66 L 114 46 L 110 96 Z';
  gild(s, d);
  gild(s, 'M 16 90 L 112 90 L 110 108 L 18 108 Z', { shadow: false });
  for (const [x, y] of [[14, 46], [46, 34], [82, 34], [114, 46]] as [number, number][]) {
    s.add(`<circle cx="${x}" cy="${y}" r="5.5" fill="${s.sphereGradient(MARBLE, { lo: 14 })}" stroke="${BRONZE_INK}" stroke-width="0.8"/>`);
  }
  s.add(`<ellipse cx="64" cy="99" rx="8" ry="5.5" fill="${s.sphereGradient(LAPIS)}" stroke="${BRONZE_INK}" stroke-width="1"/>`);
  s.add(`<ellipse cx="38" cy="99" rx="5" ry="4" fill="${s.sphereGradient(OXBLOOD)}"/><ellipse cx="90" cy="99" rx="5" ry="4" fill="${s.sphereGradient(OXBLOOD)}"/>`);
  s.add(`<path d="M 64 64 L 70 74 L 64 84 L 58 74 Z" fill="${s.sphereGradient(LAPIS)}" stroke="${BRONZE_INK}" stroke-width="0.8"/>`);
  s.glint(40, 56, 5); s.glint(61, 97, 2.4);
});

const scroll = svgEmote(s => {
  s.contactShadow(64, 116, 46, 0.28);
  // parchment between two gilded rods
  enamel(s, 'M 26 26 L 102 26 L 102 98 L 26 98 Z', '#F1E3C2', { shadow: true, rim: '#E0B65A' });
  for (let i = 0; i < 5; i++) s.add(`<path d="M 38 ${44 + i * 10} L ${i === 4 ? 70 : 90} ${44 + i * 10}" stroke="#7A5A30" stroke-width="2.4" stroke-linecap="round" opacity="0.55"/>`);
  gild(s, 'M 18 16 L 110 16 Q 116 22 110 28 L 18 28 Q 12 22 18 16 Z', { seams: false });
  gild(s, 'M 18 96 L 110 96 Q 116 102 110 108 L 18 108 Q 12 102 18 96 Z', { seams: false });
  for (const [x, y] of [[12, 22], [116, 22], [12, 102], [116, 102]] as [number, number][]) {
    s.add(`<circle cx="${x}" cy="${y}" r="6" fill="${goldFill(s)}" stroke="${BRONZE_INK}" stroke-width="1"/>`);
  }
  // wax seal in oxblood at the golden section
  s.add(`<circle cx="${PHI_MAJ + 4}" cy="84" r="9" fill="${s.sphereGradient(OXBLOOD)}" ${s.shadowFilter(1.6, 1, 0.35)}/>`);
  s.glint(28, 18, 4);
});

const quill = svgEmote(s => {
  s.contactShadow(56, 118, 30, 0.26);
  const vane = 'M 104 10 C 84 14 56 34 42 66 C 36 80 34 90 32 98 C 46 86 52 84 60 80 C 84 66 102 40 104 10 Z';
  enamel(s, vane, MARBLE, { shadow: true, rim: RIM_CYAN });
  // barbs: hand-ruled
  for (let i = 0; i < 9; i++) {
    const t = i / 9, x = 100 - t * 60, y = 16 + t * 70;
    s.add(`<path d="M ${f1(x)} ${f1(y)} q ${f1(-8 + t * 4)} ${f1(-2 - t * 2)} ${f1(-14 + t * 5)} ${f1(2 - t * 4)}" stroke="#B9AE9C" stroke-width="1" fill="none"/>`);
  }
  s.add(`<path d="M 104 10 C 86 30 62 60 32 98" stroke="#8A7A62" stroke-width="2" fill="none"/>`);
  // the gilded nib
  gild(s, 'M 36 92 L 24 118 L 30 116 L 34 120 L 42 96 Z', { seams: false });
  s.add(`<path d="M 30 116 L 37 98" stroke="${BRONZE_INK}" stroke-width="0.8"/>`);
  s.glint(90, 22, 4.5);
});

const lyre = svgEmote(s => {
  s.contactShadow(64, 120, 34, 0.28);
  // two horns + crossbar (the yoke) + sound box — gold
  gild(s, 'M 44 104 C 22 88 18 58 30 40 C 36 30 30 20 22 16 C 36 14 46 26 42 42 C 38 58 44 82 58 96 Z');
  gild(s, 'M 84 104 C 106 88 110 58 98 40 C 92 30 98 20 106 16 C 92 14 82 26 86 42 C 90 58 84 82 70 96 Z');
  gild(s, 'M 28 34 L 100 34 L 100 42 L 28 42 Z', { shadow: false, seams: false });
  gild(s, 'M 38 98 L 90 98 Q 92 112 80 114 L 48 114 Q 36 112 38 98 Z');
  for (const x of [52, 60, 68, 76]) s.add(`<path d="M ${x} 42 L ${x} 98" stroke="${MARBLE}" stroke-width="1.4"/>`);
  s.add(`<path d="M 50 42 L 50 98" stroke="${s.rimGradient(RIM_CYAN)}" stroke-width="1"/>`);
  s.glint(28, 22, 4.5);
});

const olive = svgEmote(s => {
  s.contactShadow(64, 118, 34, 0.25);
  const stem = 'M 18 110 C 40 92 70 64 112 22';
  s.add(`<path d="${stem}" stroke="${goldFill(s)}" stroke-width="6" fill="none" stroke-linecap="round" ${s.shadowFilter(2, 1.4, 0.35)}/>`);
  const OLIVE_LEAF = '#8A9E58';
  const leaves: [number, number, number][] = [[32, 98, -150], [46, 90, 24], [56, 78, -138], [70, 68, 30], [76, 58, -130], [94, 44, 34], [100, 36, -120], [108, 22, -60]];
  for (const [x, y, a] of leaves) {
    const d = leaf(...pol(x, y, 15, a), 32, 11, a);
    s.add(`<path d="${d}" fill="${s.keyGradient(OLIVE_LEAF, { hi: 22, lo: 18 })}"/>`);
    s.add(`<path d="${d}" fill="none" stroke="${s.rimGradient(RIM_CYAN, 0.7)}" stroke-width="1.2"/>`);
  }
  for (const [x, y] of [[54, 100], [88, 72]] as [number, number][]) {
    s.add(`<ellipse cx="${x}" cy="${y}" rx="7.5" ry="10" fill="${s.sphereGradient('#3A3A2A', { hi: 30 })}" transform="rotate(-30 ${x} ${y})"/>`);
  }
  s.glint(56, 88, 2.4);
});

const mvp = svgEmote(s => {
  s.contactShadow(64, 112, 50, 0.3);
  // a marble tablet with a gilded inscription, M·V·P cut in Roman capitals
  enamel(s, 'M 10 34 L 118 34 L 118 98 L 10 98 Z', MARBLE, { shadow: true, rim: '#C9A35A' });
  s.add(`<path d="M 16 40 L 112 40 L 112 92 L 16 92 Z" fill="none" stroke="#C9B89A" stroke-width="1.4"/>`);
  inscribe(s, 'M·V·P', { y: 81, size: 40, spacing: 0 });
  s.glint(20, 38, 4);
});

const column = svgEmote(s => {
  s.contactShadow(64, 120, 40, 0.32);
  // Ionic: a marble shaft (fluted) between a gilded capital and base
  const shaft = 'M 44 34 L 84 34 L 82 102 L 46 102 Z';
  enamel(s, shaft, MARBLE, { shadow: true, rim: RIM_CYAN });
  for (const x of [52, 58, 64, 70, 76]) s.add(`<path d="M ${x} 36 L ${x - (x - 64) * 0.05} 100" stroke="#C8BFAE" stroke-width="2"/>`);
  gild(s, 'M 30 22 L 98 22 L 98 34 L 30 34 Z', { seams: false });
  for (const x of [30, 98]) {
    s.add(`<circle cx="${x}" cy="30" r="9" fill="${goldFill(s)}" stroke="${BRONZE_INK}" stroke-width="1"/>`);
    s.add(`<path d="M ${x} 30 m -4 0 a 4 4 0 1 1 4 4 a 2 2 0 1 1 -2 -2" stroke="${BRONZE_INK}" stroke-width="1.2" fill="none"/>`);
  }
  gild(s, 'M 38 102 L 90 102 L 94 110 L 34 110 Z', { seams: false });
  gild(s, 'M 26 110 L 102 110 L 102 118 L 26 118 Z', { seams: false });
  s.glint(48, 40, 4.5);
});

const primus = svgEmote(s => {
  s.contactShadow(64, 118, 36, 0.28);
  for (const d of [...wreathSide(64, 62, 46, -1, 7, 108, 248, 22, 10), ...wreathSide(64, 62, 46, 1, 7, 108, 248, 22, 10)]) gild(s, d, { shadow: false, seams: false, edge: 0.7, rimW: 0.9 });
  inscribe(s, 'I', { y: 86, size: 62, spacing: 0 });
  s.glint(54, 36, 5);
});

const bravo = svgEmote(s => {
  s.contactShadow(64, 106, 52, 0.3);
  // a cartouche plaque: gold frame, oxblood field, cut capitals
  const plaque = 'M 14 40 Q 8 64 14 88 L 114 88 Q 120 64 114 40 Z';
  gild(s, plaque);
  enamel(s, 'M 20 46 Q 15 64 20 82 L 108 82 Q 113 64 108 46 Z', OXBLOOD);
  inscribe(s, 'BRAVO', { y: 75, size: 28, spacing: 1.5 });
  s.glint(20, 42, 4.5);
});

const encore = svgEmote(s => {
  s.contactShadow(64, 106, 52, 0.3);
  // BRAVO's twin in lapis: the same cartouche, the second enamel
  const plaque = 'M 14 40 Q 8 64 14 88 L 114 88 Q 120 64 114 40 Z';
  gild(s, plaque);
  enamel(s, 'M 20 46 Q 15 64 20 82 L 108 82 Q 113 64 108 46 Z', LAPIS);
  inscribe(s, 'ENCORE', { y: 74, size: 23, spacing: 0.5 });
  s.glint(20, 42, 4.5);
});

const SPECS: Spec[] = [
  ['bravo', 'Bravo', '#F6C94E', 'pop', bravo, 'bravo applause well done gold classical', undefined, 'wall'],
  ['encore', 'Encore', '#F6C94E', 'stomp', encore, 'encore again more one more classical gold'],
  ['laurel', 'Laurel wreath', '#F6C94E', 'spin', laurel, 'laurel wreath winner victory honour gold'],
  ['medal', 'Gold medal', '#F6C94E', 'bounce', medal, 'medal gold first winner champion'],
  ['gildedcrown', 'Gilded crown', '#F6C94E', 'pop', crown, 'crown king queen royalty gold classical', undefined, 'firework'],
  ['scroll', 'Scroll', '#E8D3A0', 'float', scroll, 'scroll decree proclaim record history'],
  ['quill', 'Quill', '#F2EEE6', 'float', quill, 'quill write poet pen signed lore'],
  ['lyre', 'Lyre', '#F6C94E', 'float', lyre, 'lyre music harp song classical'],
  ['olive', 'Olive branch', '#9DB060', 'float', olive, 'olive branch peace truce calm'],
  ['mvp', 'MVP', '#F6C94E', 'stomp', mvp, 'mvp most valuable best player champion'],
  ['column', 'Column', '#F2EEE6', 'stomp', column, 'column pillar support solid foundation classical'],
  ['primus', 'Primus', '#F6C94E', 'pop', primus, 'first number one primus winner laurel'],
];

export const GILDED_PACK: EmotePack = {
  id: 'gilded',
  name: 'Gilded',
  blurb: 'The Classical Mind: gold leaf, marble and one enamel, composed on the golden section.',
  director: 'CLASSICAL',
  icon: 'gilded.laurel',
  emotes: toDefs('gilded', SPECS),
};

