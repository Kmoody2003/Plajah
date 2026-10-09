// Atlas — THE WORLD-ECLECTIC TRAVELLER.
//
// "Where is this from, exactly, and who made it? What does this look like in a second script?"
// Celebrations from named places, each one credited in its tags and in a note beside its art, and
// "thank you" in ten languages written in their own scripts — never transliterated into Latin
// letters on the art. Rules the Traveller set before a single line was drawn:
//   • no sacred objects, deities, ritual vestments or costumes; only things people hold, hang,
//     light or play at a celebration, the way they are actually made;
//   • no "national" stereotype palettes or flags — a word is a LANGUAGE, not a country, so each
//     thank-you stamp carries its ISO 639 language code, not a flag;
//   • the maker's method shows: cut tissue, a rope-tuned drum, a pinched clay lamp, a perforated
//     postage stamp (the Traveller's field-note object).
//
// Under the shared light plot: every object takes the house KEY (top-left), its own RIM gel and a
// contact SHADOW; the lamps and fireworks are emitters and add the GLOW. The thank-you stamps are
// paper under the key with a cool rim on the perforated edge.

import { svgEmote, RIM_CYAN, RIM_MAGENTA, shade, mix } from '../../emoteRig';
import { type Spec, toDefs, esc, f1, pol, jitter } from './kit';
import type { EmotePack } from '../../emoteTypes';

const PAPER = '#FBF4E4';

// ── thank-you postage stamps ────────────────────────────────────────────────────────────────────
/** Perforated stamp outline: a rectangle whose edge is a run of half-circle bites. */
function perforated(x: number, y: number, w: number, h: number, r = 3.2): string {
  const along = (x0: number, y0: number, x1: number, y1: number) => {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(L / (r * 3))), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    let d = '';
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) / n * L;
      const ax = x0 + ux * (c - r), ay = y0 + uy * (c - r), bx = x0 + ux * (c + r), by = y0 + uy * (c + r);
      d += ` L ${f1(ax)} ${f1(ay)} A ${r} ${r} 0 0 0 ${f1(bx)} ${f1(by)}`;
    }
    return d + ` L ${f1(x1)} ${f1(y1)}`;
  };
  return `M ${x} ${y}` + along(x, y, x + w, y) + along(x + w, y, x + w, y + h) + along(x + w, y + h, x, y + h) + along(x, y + h, x, y) + ' Z';
}

interface Word { text: string; lang: string; ink: string; font: string; size: number; dir?: 'rtl'; y?: number; lines?: string[]; spacing?: number;
  /** Fit a long Latin/Cyrillic word to this width (condenses the face slightly — never used on scripts whose shapes carry meaning). */
  fit?: number }

function thankYou(w: Word) {
  return svgEmote(s => {
    s.contactShadow(64, 118, 44, 0.26);
    const outline = perforated(10, 16, 108, 96);
    s.add(`<path d="${outline}" fill="${s.keyGradient(PAPER, { hi: 4, lo: 10 })}" ${s.shadowFilter(2.6, 2, 0.38)}/>`);
    s.add(`<path d="${outline}" fill="none" stroke="${s.rimGradient(RIM_CYAN, 0.9)}" stroke-width="1.6"/>`);
    // inner frame in the word's ink
    s.add(`<rect x="18" y="24" width="92" height="80" rx="3" fill="${mix(w.ink, PAPER, 0.88)}" stroke="${w.ink}" stroke-width="2.4"/>`);
    const st = `font-family:${w.font};font-weight:700;font-size:${w.size}px${w.spacing != null ? `;letter-spacing:${w.spacing}px` : ''}`;
    const lines = w.lines ?? [w.text];
    const lh = w.size * 1.08, y0 = (w.y ?? 64) - ((lines.length - 1) * lh) / 2 + w.size * 0.34;
    lines.forEach((ln, i) => {
      s.add(`<text x="64" y="${f1(y0 + i * lh)}" text-anchor="middle"${w.dir ? ` direction="${w.dir}"` : ''}${w.fit ? ` textLength="${w.fit}" lengthAdjust="spacingAndGlyphs"` : ''} style="${st}" fill="${w.ink}">${esc(ln)}</text>`);
    });
    // language code + a postmark arc (the Traveller's field note)
    s.add(`<text x="104" y="99" text-anchor="end" style="font-family:'Segoe UI',system-ui,sans-serif;font-weight:700;font-size:9px;letter-spacing:1px" fill="${w.ink}" opacity="0.8">${esc(w.lang)}</text>`);
    s.add(`<path d="M 24 96 Q 34 88 44 96 T 64 96" stroke="${w.ink}" stroke-width="1.4" fill="none" opacity="0.45"/>`);
    s.glint(22, 22, 4);
  });
}

const SANS = "'Segoe UI','Noto Sans',system-ui,sans-serif";
const JA = "'Yu Gothic UI','Yu Gothic','Meiryo','Noto Sans JP','Noto Sans CJK JP','Hiragino Sans',system-ui,sans-serif";
const KO = "'Malgun Gothic','Noto Sans KR','Noto Sans CJK KR','Apple SD Gothic Neo',system-ui,sans-serif";
const HI = "'Nirmala UI','Noto Sans Devanagari','Kohinoor Devanagari','Mangal',system-ui,sans-serif";
const AR = "'Segoe UI','Noto Naskh Arabic','Noto Sans Arabic','Geeza Pro','Arial',system-ui,sans-serif";

// Each ink is a pigment chosen for legibility on paper, deliberately not a flag colour.
const gracias = thankYou({ text: 'Gracias', lang: 'ES', ink: '#B4232F', font: SANS, size: 28, fit: 82 });           // Spanish
const merci = thankYou({ text: 'Merci', lang: 'FR', ink: '#1E4FA0', font: SANS, size: 32, fit: 78 });               // French
const obrigado = thankYou({ text: 'Obrigado', lang: 'PT', ink: '#0F7A5A', font: SANS, size: 27, fit: 84 });         // Portuguese
const asante = thankYou({ text: 'Asante', lang: 'SW', ink: '#B5541A', font: SANS, size: 29, fit: 82 });             // Swahili (Kiswahili)
const danke = thankYou({ text: 'Danke', lang: 'DE', ink: '#3A3A8C', font: SANS, size: 30, fit: 80 });               // German
const arigato = thankYou({ text: 'ありがとう', lang: 'JA', ink: '#C0304A', font: JA, size: 24, lines: ['ありが', 'とう'] });  // Japanese, hiragana
const gamsa = thankYou({ text: '감사합니다', lang: 'KO', ink: '#1F5FA8', font: KO, size: 25, lines: ['감사', '합니다'] });     // Korean, Hangul
const dhanyavad = thankYou({ text: 'धन्यवाद', lang: 'HI', ink: '#8A2D7A', font: HI, size: 26, y: 60 });          // Hindi, Devanagari
const shukran = thankYou({ text: 'شكرا', lang: 'AR', ink: '#0E6E6E', font: AR, size: 40, dir: 'rtl', y: 58 }); // Arabic
const spasibo = thankYou({ text: 'Спасибо', lang: 'RU', ink: '#5A2A8A', font: SANS, size: 27, fit: 84 });          // Russian, Cyrillic

// ── celebration objects ─────────────────────────────────────────────────────────────────────────
// Paper lantern — China; hung for the Lantern Festival (元宵节, 15th day of the lunar new year) and
// across East and Southeast Asia. Drawn as the ribbed red silk/paper lantern with gilt caps + tassel.
const lantern = svgEmote(s => {
  s.contactShadow(64, 122, 26, 0.22);
  s.add(`<path d="M 64 2 L 64 16" stroke="#6B3A12" stroke-width="2.4"/>`);
  const body = 'M 64 22 C 108 22 116 50 116 64 C 116 78 108 104 64 104 C 20 104 12 78 12 64 C 12 50 20 22 64 22 Z';
  s.add(`<path d="${body}" fill="#FF5A2A" opacity="0.5" ${s.glowFilter('#FF7A3A', 7)}/>`);
  s.add(`<path d="${body}" fill="${s.sphereGradient('#E0282E', { hi: 26, lo: 22 })}"/>`);
  // the warm candle inside shows through the paper
  s.add(`<ellipse cx="64" cy="66" rx="34" ry="28" fill="${s.radial([[0, '#FFD27A', 0.75], [1, '#FF7A3A', 0]])}"/>`);
  s.add(`<g ${s.clip(`<path d="${body}"/>`)}>${[-36, -20, -6, 6, 20, 36].map(dx => `<path d="M 64 22 Q ${64 + dx * 1.6} 64 64 104" stroke="#9E1418" stroke-width="1.8" fill="none" opacity="0.7"/>`).join('')}</g>`);
  s.add(`<path d="${body}" fill="none" stroke="${s.rimGradient('#FFC93A')}" stroke-width="2.4"/>`);
  for (const [y, w] of [[18, 22], [100, 22]] as [number, number][]) s.add(`<rect x="${64 - w}" y="${y}" width="${w * 2}" height="8" rx="2" fill="${s.keyGradient('#E8B04A')}" stroke="#7A4A10" stroke-width="1"/>`);
  for (let i = -3; i <= 3; i++) s.add(`<path d="M ${64 + i * 2.2} 108 L ${64 + i * 2.8} 124" stroke="#E8B04A" stroke-width="1.6"/>`);
  s.glint(40, 40, 6);
});

// Diya — a pinched clay oil lamp from South Asia, lit in rows for Diwali and for everyday
// evenings. Plain terracotta, cotton wick, ghee or oil; no deity marks drawn on it.
const diya = svgEmote(s => {
  s.contactShadow(64, 112, 44, 0.3);
  s.add(`<circle cx="70" cy="44" r="30" fill="${s.radial([[0, '#FFD27A', 0.55], [1, '#FFB347', 0]])}"/>`);
  const bowl = 'M 10 72 Q 30 70 96 72 Q 112 70 120 62 Q 116 76 104 84 Q 84 104 56 104 Q 26 104 10 72 Z';
  s.add(`<path d="${bowl}" fill="${s.keyGradient('#C0602A', { hi: 20, lo: 26 })}" ${s.shadowFilter(3, 2, 0.4)}/>`);
  s.add(`<path d="M 12 72 Q 60 80 104 72" stroke="${shade('#C0602A', -26)}" stroke-width="3" fill="none"/>`);
  s.add(`<path d="M 22 86 Q 56 96 92 86" stroke="#E8A070" stroke-width="2" fill="none" stroke-dasharray="2 5" stroke-linecap="round" opacity="0.8"/>`);
  s.add(`<path d="${bowl}" fill="none" stroke="${s.rimGradient(RIM_MAGENTA, 0.8)}" stroke-width="2.2"/>`);
  // the wick at the pinched spout and its flame
  s.add(`<path d="M 108 66 L 112 60" stroke="#3A2010" stroke-width="2.4" stroke-linecap="round"/>`);
  s.add(`<path d="M 112 22 Q 124 44 114 60 Q 112 62 110 60 Q 100 44 112 22 Z" fill="${s.linear([[0, '#FFF6D0'], [0.55, '#FFC24A'], [1, '#FF6A1F']])}" ${s.glowFilter('#FFB347', 4.5, 1.6)}/>`);
  s.add(`<path d="M 112 40 Q 116 50 112 58 Q 108 50 112 40 Z" fill="#FFFFFF"/>`);
  s.glint(28, 70, 4);
});

// Papel picado — cut tissue-paper banners from Mexico; the craft is centred on San Salvador
// Huixcolotla, Puebla, where artisans chisel stacks of tissue by hand. Patterns here are flowers
// and lattice (fiesta motifs), not the Día de Muertos calaveras, which carry their own meaning.
const papelpicado = svgEmote(s => {
  const cols = ['#FF3D8B', '#FFB020', '#22B8CF', '#7BC043'];
  s.add(`<path d="M 4 22 Q 64 34 124 22" stroke="#6B5A4A" stroke-width="2" fill="none"/>`);
  const flags: [number, number, number][] = [[20, 26, -5], [50, 30, -1], [80, 30, 2], [110, 26, 6]];
  flags.forEach(([cx, top, rot], i) => {
    const w = 28, h = 46, x = cx - w / 2;
    const scallop = Array.from({ length: 4 }, (_, k) => `Q ${f1(x + w - (k + 0.5) * (w / 4))} ${top + h + 5} ${f1(x + w - (k + 1) * (w / 4))} ${top + h}`).join(' ');
    const d = `M ${x} ${top} L ${x + w} ${top} L ${x + w} ${top + h} ${scallop} Z`;
    // the cut-outs: a flower + lattice, knocked out with evenodd
    const fx = cx, fy = top + 20;
    let holes = '';
    for (let p = 0; p < 6; p++) { const [px, py] = pol(fx, fy, 6, p * 60); holes += ` M ${f1(px + 2.6)} ${f1(py)} A 2.6 2.6 0 1 0 ${f1(px - 2.6)} ${f1(py)} A 2.6 2.6 0 1 0 ${f1(px + 2.6)} ${f1(py)} Z`; }
    holes += ` M ${fx + 2} ${fy} A 2 2 0 1 0 ${fx - 2} ${fy} A 2 2 0 1 0 ${fx + 2} ${fy} Z`;
    for (let k = 0; k < 3; k++) holes += ` M ${f1(x + 5 + k * 7.5)} ${top + 36} l 3 -3 l 3 3 l -3 3 Z`;
    s.add(`<g transform="rotate(${rot} ${cx} ${top})">`);
    s.add(`<path d="${d}${holes}" fill-rule="evenodd" fill="${s.keyGradient(cols[i], { hi: 14, lo: 12 })}" opacity="0.94" ${s.shadowFilter(2.4, 1.8, 0.35)}/>`);
    s.add(`<path d="${d}" fill="none" stroke="${s.rimGradient(mix(cols[i], '#FFFFFF', 0.5), 0.9)}" stroke-width="1.4"/>`);
    s.add(`<path d="M ${x - 1} ${top} L ${x + w + 1} ${top}" stroke="${shade(cols[i], -20)}" stroke-width="2.4"/>`);
    s.add(`</g>`);
  });
  // a second, lower string so it reads as a canopy at chat size
  s.add(`<path d="M 4 84 Q 64 96 124 84" stroke="#6B5A4A" stroke-width="2" fill="none"/>`);
  [[34, 88, '#9B5DE5'], [64, 92, '#FF6B3A'], [94, 88, '#FF3D8B']].forEach(([cx, top, c], i) => {
    const x = (cx as number) - 13;
    s.add(`<path d="M ${x} ${top} L ${x + 26} ${top} L ${x + 26} ${(top as number) + 26} L ${x + 13} ${(top as number) + 30} L ${x} ${(top as number) + 26} Z" fill="${s.keyGradient(c as string)}" opacity="0.94" transform="rotate(${(i - 1) * 4} ${cx} ${top})" ${s.shadowFilter(2, 1.6, 0.3)}/>`);
  });
  s.glint(14, 30, 4);
});

// Fireworks — gunpowder fireworks were developed in China (Tang–Song dynasties); Liuyang, Hunan,
// is still the world's centre of fireworks making. Drawn as a chrysanthemum shell (菊花 burst).
const fireworks = svgEmote(s => {
  const bursts: [number, number, number, string][] = [[56, 50, 40, '#FFD23A'], [98, 34, 20, '#FF3D8B'], [100, 88, 16, '#3FE6FF']];
  for (const [cx, cy, R, c] of bursts) {
    const n = R > 30 ? 18 : 12;
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 360 + jitter(i + R) * 6, r0 = R * 0.22, r1 = R * (0.9 + jitter(i * 3 + R) * 0.1);
      const [x0, y0] = pol(cx, cy, r0, a), [x1, y1] = pol(cx, cy, r1, a);
      d += `M ${f1(x0)} ${f1(y0)} L ${f1(x1)} ${f1(y1)} `;
    }
    s.add(`<path d="${d}" stroke="${c}" stroke-width="${R > 30 ? 3.6 : 2.6}" stroke-linecap="round" ${s.glowFilter(c, 3, 1.2)}/>`);
    for (let i = 0; i < n; i++) { const [x, y] = pol(cx, cy, R * 0.98, (i / n) * 360 + jitter(i + R) * 6); s.add(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${R > 30 ? 2.8 : 2}" fill="#FFF6D0"/>`); }
    s.glint(cx, cy, R * 0.18);
  }
  // the shell's trail from the ground
  s.add(`<path d="M 50 124 Q 54 100 56 76" stroke="${s.linear([[0, '#FFD23A', 0], [1, '#FFD23A', 0.9]], 0, 1, 0, 0)}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
});

// Djembe — the rope-tuned goblet drum of the Mandinka people of West Africa (today's Mali,
// Guinea, Senegal, Côte d'Ivoire). Carved hardwood shell, goatskin head, rope tension in a
// diamond weave.
const djembe = svgEmote(s => {
  s.contactShadow(64, 120, 30, 0.32);
  const shell = 'M 26 20 L 102 20 Q 100 46 76 62 Q 72 66 74 72 L 84 112 L 44 112 L 54 72 Q 56 66 52 62 Q 28 46 26 20 Z';
  s.add(`<path d="${shell}" fill="${s.keyGradient('#8A4A22', { hi: 22, lo: 26 })}" ${s.shadowFilter(3, 2.2, 0.4)}/>`);
  // carved band on the foot
  s.add(`<path d="M 50 92 L 78 92 M 48 100 L 80 100" stroke="${shade('#8A4A22', -26)}" stroke-width="2.4"/>`);
  s.add(`<path d="M 52 92 L 56 100 L 60 92 L 64 100 L 68 92 L 72 100 L 76 92" stroke="#D9A05A" stroke-width="1.6" fill="none"/>`);
  // rope tension: diamond weave down the bowl
  let rope = '';
  for (let i = 0; i < 8; i++) { const xt = 30 + i * 9.7, xb = 56 + i * 2.3; rope += `M ${f1(xt)} 26 L ${f1(xb + 1.2)} 66 `; if (i < 7) rope += `M ${f1(xt)} 26 L ${f1(56 + (i + 1) * 2.3 + 1.2)} 66 `; }
  s.add(`<path d="${rope}" stroke="#F1E3C2" stroke-width="1.6" opacity="0.92"/>`);
  s.add(`<path d="M 50 64 L 78 64" stroke="#F1E3C2" stroke-width="3" stroke-linecap="round"/>`);
  // the goatskin head
  s.add(`<ellipse cx="64" cy="20" rx="40" ry="10" fill="${s.sphereGradient('#EAD9B5', { hi: 10, lo: 12 })}" stroke="#F1E3C2" stroke-width="3"/>`);
  s.add(`<path d="${shell}" fill="none" stroke="${s.rimGradient(RIM_CYAN, 0.8)}" stroke-width="2"/>`);
  s.glint(44, 16, 4.5);
});

// Marigold — Tagetes erecta, native to Mexico (cempasúchil, from Nahuatl cempōhualxōchitl) and
// strung into garlands across South Asia (genda). The bloom itself, not an altar.
const marigold = svgEmote(s => {
  s.contactShadow(64, 116, 36, 0.26);
  const cx = 64, cy = 60;
  for (const [R, n, base, off] of [[48, 18, '#E8780A', 0], [38, 16, '#F59A12', 10], [27, 13, '#FFB020', 5], [15, 9, '#FFC93A', 20]] as [number, number, string, number][]) {
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 360 + off, [tx, ty] = pol(cx, cy, R, a), [l, m] = pol(cx, cy, R * 0.5, a - 180 / n), [r, q] = pol(cx, cy, R * 0.5, a + 180 / n);
      const [c1x, c1y] = pol(cx, cy, R * 1.05, a - 120 / n), [c2x, c2y] = pol(cx, cy, R * 1.05, a + 120 / n);
      d += `M ${f1(l)} ${f1(m)} Q ${f1(c1x)} ${f1(c1y)} ${f1(tx)} ${f1(ty)} Q ${f1(c2x)} ${f1(c2y)} ${f1(r)} ${f1(q)} Z `;
    }
    s.add(`<path d="${d}" fill="${s.sphereGradient(base, { hi: 18, lo: 24 })}" stroke="${shade(base, -22)}" stroke-width="0.9" ${R === 48 ? s.shadowFilter(3, 2, 0.35) : ''}/>`);
    if (R === 48) s.add(`<path d="${d}" fill="none" stroke="${s.rimGradient(RIM_MAGENTA, 0.85)}" stroke-width="1.6"/>`);
  }
  s.add(`<circle cx="${cx}" cy="${cy}" r="6" fill="${s.sphereGradient('#C25A06')}"/>`);
  s.glint(44, 40, 5);
});

const SPECS: Spec[] = [
  ['lantern', 'Paper lantern', '#FF5A2A', 'float', lantern, 'lantern festival celebrate lunar new year origin:china credit:lantern-festival', undefined, 'storm'],
  ['diya', 'Diya', '#FFB347', 'float', diya, 'diya lamp light diwali celebrate origin:south-asia credit:diwali', undefined, 'storm'],
  ['papelpicado', 'Papel picado', '#FF3D8B', 'pop', papelpicado, 'papel picado fiesta banner party celebrate origin:mexico credit:san-salvador-huixcolotla-puebla', undefined, 'wall'],
  ['fireworks', 'Fireworks', '#FFD23A', 'beam', fireworks, 'fireworks celebrate party new year origin:china credit:liuyang-hunan', undefined, 'firework'],
  ['djembe', 'Djembe', '#C0702A', 'stomp', djembe, 'djembe drum beat rhythm music origin:west-africa credit:mandinka', undefined, 'shockwave'],
  ['marigold', 'Marigold', '#F59A12', 'spin', marigold, 'marigold flower cempasuchil genda bloom origin:mexico credit:nahuatl-cempohualxochitl'],
  ['gracias', 'Gracias', '#B4232F', 'float', gracias, 'gracias thank you thanks spanish lang:es'],
  ['merci', 'Merci', '#1E4FA0', 'float', merci, 'merci thank you thanks french lang:fr'],
  ['obrigado', 'Obrigado', '#0F7A5A', 'float', obrigado, 'obrigado obrigada thank you thanks portuguese lang:pt'],
  ['asante', 'Asante', '#B5541A', 'float', asante, 'asante thank you thanks swahili kiswahili lang:sw'],
  ['danke', 'Danke', '#3A3A8C', 'float', danke, 'danke thank you thanks german lang:de'],
  ['arigato', 'Arigatō', '#C0304A', 'float', arigato, 'arigato arigatou thank you thanks japanese hiragana lang:ja'],
  ['gamsahamnida', 'Gamsahamnida', '#1F5FA8', 'float', gamsa, 'gamsahamnida kamsahamnida thank you thanks korean hangul lang:ko'],
  ['dhanyavad', 'Dhanyavād', '#8A2D7A', 'float', dhanyavad, 'dhanyavad dhanyavaad thank you thanks hindi devanagari lang:hi'],
  ['shukran', 'Shukran', '#0E6E6E', 'float', shukran, 'shukran thank you thanks arabic lang:ar'],
  ['spasibo', 'Spasibo', '#5A2A8A', 'float', spasibo, 'spasibo thank you thanks russian cyrillic lang:ru'],
];

export const ATLAS_PACK: EmotePack = {
  id: 'atlas',
  name: 'Atlas',
  blurb: 'The World-Eclectic Traveller: celebrations from named places, credited — and thank you in ten scripts.',
  director: 'WORLD_ECLECTIC',
  icon: 'atlas.lantern',
  emotes: toDefs('atlas', SPECS),
};

