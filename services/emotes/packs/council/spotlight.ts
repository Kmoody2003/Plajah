// Spotlight — THE BAROQUE DRAMATIST.
//
// "Where is the light coming from? What is the moment, and what happens the frame before it?"
// Every emote is a stage: a pool of darkness (chiaroscuro needs night to cut into), one hard
// follow-spot from the top-left, and the subject caught at its moment — the rose mid-landing,
// the bow at its lowest point, the flame at full draw. Velvet, gilt and wax; nothing flat.
//
// Under the shared light plot this pack is the plot turned UP: the KEY is literally a follow-spot
// whose cone you can see, the shadow side of every form drops almost to black (hard chiaroscuro),
// the RIM is a warm amber backlight from the wings, and the contact SHADOW becomes the spot's pool
// on the boards. Human trace: performance timing — each image is the frame after the cue.

import { Svg, svgEmote, KEY_LIGHT, shade } from '../../emoteRig';
import { type Spec, toDefs, esc, f1, wideBlur } from './kit';
import type { EmotePack } from '../../emoteTypes';

const VELVET = '#A3122A';
const GILT = '#E8B04A';
const AMBER_RIM = '#FFB347';
const NIGHT = '#0E0508';
const IVORY = '#F3E6CC';
const SERIF = "'Times New Roman','Book Antiqua',Georgia,serif";

/** The stage: a soft disc of night behind the subject (reads on any stream), then the spot. */
function stage(s: Svg, o: { cx?: number; floorY?: number; poolW?: number; cone?: boolean; dark?: number } = {}) {
  const cx = o.cx ?? 64, fy = o.floorY ?? 110, pw = o.poolW ?? 36;
  s.add(`<circle cx="64" cy="64" r="60" fill="${s.radial([[0, NIGHT, o.dark ?? 0.9], [0.72, NIGHT, (o.dark ?? 0.9) * 0.75], [1, NIGHT, 0]])}"/>`);
  if (o.cone !== false) {
    // the follow-spot, from high top-left, landing on the subject
    const g = s.linear([[0, KEY_LIGHT, 0.55], [1, KEY_LIGHT, 0.05]], 0, 0, 0.6, 1);
    s.add(`<path d="M 14 0 L 30 0 L ${cx + pw} ${fy} L ${cx - pw} ${fy} Z" fill="${g}" ${wideBlur(s, 3)}/>`);
  }
  // the pool on the boards
  s.add(`<ellipse cx="${cx}" cy="${fy}" rx="${pw + 4}" ry="${f1((pw + 4) * 0.2)}" fill="${s.radial([[0, '#FFF1D0', 0.85], [0.6, '#FFD894', 0.4], [1, '#FFD894', 0]])}"/>`);
}
/** Chiaroscuro fill: bright key side, shadow side near black. */
function chiaro(s: Svg, base: string, deep = 44) {
  return s.linear([[0, shade(base, 22)], [0.42, base], [1, shade(base, -deep)]], 0.1, 0.05, 0.85, 0.95);
}
function form(s: Svg, d: string, base: string, o: { deep?: number; rim?: string; shadow?: boolean; transform?: string } = {}) {
  const tf = o.transform ? ` transform="${o.transform}"` : '';
  s.add(`<g${tf}><path d="${d}" fill="${chiaro(s, base, o.deep)}" ${o.shadow === false ? '' : s.shadowFilter(3, 2, 0.5)}/>`);
  s.add(`<path d="${d}" fill="none" stroke="${s.rimGradient(o.rim ?? AMBER_RIM, 1)}" stroke-width="2.2" stroke-linejoin="round"/></g>`);
}

// ── emotes ──────────────────────────────────────────────────────────────────────────────────────
const followspot = svgEmote(s => {
  s.add(`<circle cx="64" cy="64" r="60" fill="${s.radial([[0, NIGHT, 0.92], [0.75, NIGHT, 0.7], [1, NIGHT, 0]])}"/>`);
  // the lamp itself, then the cone it throws onto an empty stage: the frame before the entrance
  const g = s.linear([[0, '#FFF6E0', 0.8], [1, '#FFE2A8', 0.12]], 0, 0, 0.5, 1);
  s.add(`<path d="M 26 34 L 44 26 L 108 104 L 52 114 Z" fill="${g}" ${wideBlur(s, 2.5)}/>`);
  s.add(`<ellipse cx="80" cy="109" rx="32" ry="8" fill="${s.radial([[0, '#FFFFFF', 0.95], [0.5, '#FFE6B0', 0.6], [1, '#FFE6B0', 0]])}"/>`);
  form(s, 'M 8 22 L 34 6 L 48 30 L 22 46 Z', '#3A3440', { rim: AMBER_RIM });
  s.add(`<ellipse cx="36" cy="37" rx="12" ry="6.5" fill="#FFF6E0" transform="rotate(-28 35 32)" ${s.glowFilter('#FFE2A8', 3, 1.4)}/>`);
  s.add(`<path d="M 22 44 L 16 62 M 22 44 L 32 60" stroke="#3A3440" stroke-width="3.4" stroke-linecap="round"/>`);
  s.glint(36, 30, 5);
});

const curtains = svgEmote(s => {
  stage(s, { cone: true, poolW: 22, floorY: 112 });
  // pelmet + two drapes, swagged open — folds as alternating light/shadow
  const L = 'M 8 10 L 52 10 C 46 40 40 70 50 112 L 8 112 Z';
  const R = 'M 120 10 L 76 10 C 82 40 88 70 78 112 L 120 112 Z';
  for (const d of [L, R]) {
    form(s, d, VELVET, { deep: 40 });
    s.add(`<g ${s.clip(`<path d="${d}"/>`)}>${[16, 28, 40, 88, 100, 112].map(x => `<path d="M ${x} 10 Q ${x + (x < 64 ? 4 : -4)} 60 ${x + (x < 64 ? -2 : 2)} 112" stroke="${shade(VELVET, -30)}" stroke-width="4" fill="none" opacity="0.7"/>`).join('')}</g>`);
  }
  // gilt tassels where the drapes are tied back
  for (const x of [44, 84]) s.add(`<path d="M ${x} 70 L ${x} 82" stroke="${GILT}" stroke-width="3" stroke-linecap="round"/><path d="M ${x - 4} 82 L ${x + 4} 82 L ${x + 2} 92 L ${x - 2} 92 Z" fill="${GILT}"/>`);
  form(s, 'M 4 6 L 124 6 L 124 22 Q 94 32 64 22 Q 34 32 4 22 Z', VELVET, { deep: 30 });
  s.add(`<path d="M 4 22 Q 34 32 64 22 Q 94 32 124 22" stroke="${GILT}" stroke-width="3" fill="none"/>`);
  s.glint(60, 92, 4.5, '#FFF1D0');
});

const stagerose = svgEmote(s => {
  stage(s, { floorY: 106, poolW: 40 });
  // a rose thrown from the house, landed across the boards, petals catching the spot
  s.add(`<path d="M 30 100 Q 60 96 104 104" stroke="#1E5E32" stroke-width="5" fill="none" stroke-linecap="round"/>`);
  form(s, 'M 70 98 Q 80 86 92 90 Q 84 100 70 98 Z', '#2A8A4A', { rim: '#B6FFD2', shadow: false });
  const bloom = 'M 30 70 C 22 70 14 80 18 92 C 22 104 38 106 46 98 C 54 90 52 76 44 72 C 40 70 34 70 30 70 Z';
  s.add(`<g transform="translate(-10 -26) scale(1.36)">`);
  form(s, bloom, '#D0103A', { deep: 46 });
  s.add(`<path d="M 24 82 Q 32 74 42 80 Q 38 92 30 92 Z" fill="${shade('#D0103A', -24)}"/><path d="M 30 82 Q 36 78 40 84" stroke="${shade('#D0103A', -40)}" stroke-width="2" fill="none"/>`);
  s.add(`</g>`);
  // a single petal still falling — the frame after the throw
  form(s, 'M 84 40 Q 94 34 98 44 Q 90 52 84 40 Z', '#E01748', { shadow: false });
  s.glint(26, 74, 5);
});

function mask(smile: boolean) {
  return svgEmote(s => {
    stage(s, { floorY: 116, poolW: 30 });
    const face = 'M 24 20 Q 64 6 104 20 Q 108 64 92 92 Q 80 112 64 114 Q 48 112 36 92 Q 20 64 24 20 Z';
    form(s, face, smile ? IVORY : '#C9C2B8', { deep: 52, rim: smile ? AMBER_RIM : '#7FB8FF' });
    const eyes = smile
      ? 'M 36 50 Q 46 38 56 50 Q 46 46 36 50 Z M 72 50 Q 82 38 92 50 Q 82 46 72 50 Z'
      : 'M 36 44 Q 46 56 56 44 Q 46 50 36 44 Z M 72 44 Q 82 56 92 44 Q 82 50 72 44 Z';
    const mouth = smile
      ? 'M 40 74 Q 64 104 88 74 Q 64 88 40 74 Z'
      : 'M 42 96 Q 64 70 86 96 Q 64 86 42 96 Z';
    s.add(`<path d="${eyes} ${mouth}" fill="${NIGHT}" stroke="${shade(IVORY, -30)}" stroke-width="1.2"/>`);
    s.add(`<path d="${smile ? 'M 34 36 Q 46 28 58 36 M 70 36 Q 82 28 94 36' : 'M 34 32 Q 46 38 58 30 M 70 30 Q 82 38 94 32'}" stroke="${shade(IVORY, -40)}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
    // gilt ribbon ties
    s.add(`<path d="M 104 26 Q 116 36 110 52 Q 118 60 114 72" stroke="${smile ? GILT : VELVET}" stroke-width="4" fill="none" stroke-linecap="round"/>`);
    if (!smile) s.add(`<path d="M 46 58 Q 44 66 46 70" stroke="#9FD3FF" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.9"/>`);
    s.glint(40, 26, 5);
  });
}

const ovation = svgEmote(s => {
  // the house, from behind: silhouettes on their feet, rimmed by the stage light beyond them
  s.add(`<circle cx="64" cy="64" r="60" fill="${s.radial([[0, '#FFE2A8', 0.85], [0.45, '#FF9A3A', 0.45], [0.8, NIGHT, 0.6], [1, NIGHT, 0]], 0.5, 0.3, 0.7)}"/>`);
  const figs: [number, number, number][] = [[24, 92, 0.9], [50, 86, 1.05], [80, 88, 1], [106, 94, 0.88]];
  for (const [x, y, k] of figs) {
    const h = (n: number) => f1(n * k);
    const d = `M ${x - 14 * k} 124 L ${x - 14 * k} ${y + 10 * k} Q ${x - 14 * k} ${y} ${x} ${y} Q ${x + 14 * k} ${y} ${x + 14 * k} ${y + 10 * k} L ${x + 14 * k} 124 Z`;
    s.add(`<path d="${d}" fill="${NIGHT}"/>`);
    s.add(`<circle cx="${x}" cy="${y - 10 * k}" r="${h(9)}" fill="${NIGHT}"/>`);
    // arms up (the ovation)
    s.add(`<path d="M ${x - 11 * k} ${y + 4 * k} L ${x - 18 * k} ${y - 28 * k} M ${x + 11 * k} ${y + 4 * k} L ${x + 18 * k} ${y - 28 * k}" stroke="${NIGHT}" stroke-width="${h(6)}" stroke-linecap="round"/>`);
    // rim from the stage
    s.add(`<circle cx="${x}" cy="${y - 10 * k}" r="${h(9)}" fill="none" stroke="${AMBER_RIM}" stroke-width="1.6" stroke-dasharray="${h(16)} 100" transform="rotate(200 ${x} ${y - 10 * k})"/>`);
  }
  for (const [x, y] of [[40, 30], [70, 22], [94, 36]] as [number, number][]) s.glint(x, y, 4, '#FFF1D0', 0.9);
});

const chandelier = svgEmote(s => {
  stage(s, { cone: false, floorY: 118, poolW: 30 });
  s.add(`<path d="M 64 4 L 64 30" stroke="${GILT}" stroke-width="2.4"/>`);
  // gilt arms
  s.add(`<path d="M 20 54 Q 30 76 64 76 Q 98 76 108 54 M 36 54 Q 44 68 64 68 Q 84 68 92 54" stroke="${GILT}" stroke-width="4" fill="none" stroke-linecap="round" ${s.shadowFilter(2, 1.4, 0.4)}/>`);
  form(s, 'M 56 30 L 72 30 L 76 50 Q 64 82 52 50 Z', GILT, { deep: 36, rim: AMBER_RIM });
  // candles + flames
  for (const x of [20, 36, 92, 108]) {
    s.add(`<rect x="${x - 3}" y="44" width="6" height="10" fill="${IVORY}"/>`);
    s.add(`<path d="M ${x} 30 Q ${x + 5} 38 ${x} 44 Q ${x - 5} 38 ${x} 30 Z" fill="#FFD27A" ${s.glowFilter('#FFB347', 3.2, 1.4)}/>`);
  }
  // crystal drops — each a glint
  for (const [x, y] of [[28, 72], [48, 82], [64, 92], [80, 82], [100, 72]] as [number, number][]) {
    s.add(`<path d="M ${x} ${y - 6} L ${x + 4} ${y + 2} L ${x} ${y + 8} L ${x - 4} ${y + 2} Z" fill="${s.linear([[0, '#FFFFFF'], [1, '#9FD3FF']])}" opacity="0.95"/>`);
    s.glint(x, y, 3.2);
  }
});

const candle = svgEmote(s => {
  stage(s, { cone: false, floorY: 116, poolW: 26 });
  // the candle is its own key: a warm halo
  s.add(`<circle cx="64" cy="34" r="30" fill="${s.radial([[0, '#FFD27A', 0.6], [1, '#FFB347', 0]])}"/>`);
  const wax = 'M 48 54 Q 50 50 56 52 Q 58 60 60 52 L 80 52 L 80 112 L 48 112 Z';
  form(s, wax, IVORY, { deep: 48, rim: AMBER_RIM });
  s.add(`<path d="M 56 52 Q 58 66 55 72 Q 52 76 52 68" fill="none" stroke="#FFF7E6" stroke-width="3" stroke-linecap="round"/>`);
  s.add(`<path d="M 64 52 L 64 44" stroke="#2A1A10" stroke-width="2"/>`);
  s.add(`<path d="M 64 14 Q 76 32 66 46 Q 64 48 62 46 Q 52 32 64 14 Z" fill="${s.linear([[0, '#FFF6D0'], [0.6, '#FFC24A'], [1, '#FF6A1F']])}" ${s.glowFilter('#FFB347', 4, 1.6)}/>`);
  s.add(`<path d="M 64 30 Q 68 38 64 44 Q 60 38 64 30 Z" fill="#FFFFFF"/>`);
  form(s, 'M 38 110 L 90 110 Q 92 118 84 120 L 44 120 Q 36 118 38 110 Z', GILT, { shadow: false });
});

const operafan = svgEmote(s => {
  stage(s, { cone: true, floorY: 112, poolW: 30 });
  // a half-open fan, struck at the moment it snaps open
  const P = 64, Q = 104, R = 58;
  let ribs = '', leaf = `M ${P} ${Q}`;
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = ((200 + (140 * i) / n) * Math.PI) / 180;
    const x = P + Math.cos(a) * R, y = Q + Math.sin(a) * R;
    leaf += ` L ${f1(x)} ${f1(y)}`;
    ribs += `M ${P} ${Q} L ${f1(x)} ${f1(y)} `;
  }
  leaf += ' Z';
  form(s, leaf, VELVET, { deep: 46 });
  // alternating pleats
  for (let i = 0; i < n; i += 2) {
    const a1 = ((200 + (140 * i) / n) * Math.PI) / 180, a2 = ((200 + (140 * (i + 1)) / n) * Math.PI) / 180;
    s.add(`<path d="M ${P} ${Q} L ${f1(P + Math.cos(a1) * R)} ${f1(Q + Math.sin(a1) * R)} L ${f1(P + Math.cos(a2) * R)} ${f1(Q + Math.sin(a2) * R)} Z" fill="${NIGHT}" opacity="0.28"/>`);
  }
  s.add(`<path d="${ribs}" stroke="${GILT}" stroke-width="1.6"/>`);
  s.add(`<path d="M ${f1(P + Math.cos((200 * Math.PI) / 180) * (R - 6))} ${f1(Q + Math.sin((200 * Math.PI) / 180) * (R - 6))} A ${R - 6} ${R - 6} 0 0 1 ${f1(P + Math.cos((340 * Math.PI) / 180) * (R - 6))} ${f1(Q + Math.sin((340 * Math.PI) / 180) * (R - 6))}" stroke="${GILT}" stroke-width="2.4" fill="none" stroke-dasharray="2 3"/>`);
  s.add(`<circle cx="${P}" cy="${Q}" r="5" fill="${s.sphereGradient(GILT)}"/>`);
  s.add(`<path d="M ${P} ${Q + 4} Q ${P + 4} ${Q + 14} ${P - 2} ${Q + 18}" stroke="${GILT}" stroke-width="2" fill="none"/>`);
  s.glint(34, 66, 4.5);
});

const curtaincall = svgEmote(s => {
  stage(s, { cx: 62, floorY: 112, poolW: 36 });
  // the performer at the bottom of the bow: torso folded, head below the shoulders,
  // one arm swept up behind, tails flying — the frame after the applause lands
  const DARK = '#2A1E2E';
  const strokes: [string, number][] = [
    ['M 50 112 L 54 80', 9], ['M 62 112 L 58 80', 9],          // legs, planted
    ['M 56 80 L 78 64', 17],                                    // torso folded forward
    ['M 76 66 Q 70 76 62 80', 6],                               // hand to the heart
    ['M 78 66 Q 92 82 100 96', 6],                              // arm swept down to the house
  ];
  const draw = (col: string, dx: number, dy: number, op = 1) => {
    s.add(`<g transform="translate(${dx} ${dy})" opacity="${op}">`
      + strokes.map(([d, w]) => `<path d="${d}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`).join('')
      + `<circle cx="90" cy="68" r="8.5" fill="${col}"/>`                                     // head, below the shoulders
      + `<path d="M 54 76 L 38 98 L 50 92 Z" fill="${col}"/>`                                  // tails flying
      + `<path d="M 94 98 L 112 98 L 110 92 L 106 92 L 106 80 L 98 80 L 98 92 L 94 92 Z" fill="${col}" transform="rotate(-14 104 92)"/>`   // top hat in hand
      + `</g>`);
  };
  draw(AMBER_RIM, 1.6, 1.4);            // rim from the wings
  draw(KEY_LIGHT, -1.2, -1.4, 0.55);    // the spot catching the top edge
  draw(DARK, 0, 0);
  // roses already on the boards
  for (const [x, y, r] of [[22, 110, -20], [72, 113, 25], [30, 104, -50]] as [number, number, number][]) {
    s.add(`<g transform="rotate(${r} ${x} ${y})"><path d="M ${x} ${y} L ${x + 12} ${y}" stroke="#1E5E32" stroke-width="2.4" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="4.5" fill="${s.sphereGradient('#D0103A')}"/></g>`);
  }
  s.glint(70, 62, 3.4);
});

const spotencore = svgEmote(s => {
  stage(s, { floorY: 112, poolW: 44 });
  // a painted banner unfurling — swallow-tailed velvet, gilt script
  const banner = 'M 6 52 L 20 44 L 108 44 L 122 52 L 112 64 L 122 76 L 108 84 L 20 84 L 6 76 L 16 64 Z';
  form(s, banner, VELVET, { deep: 40 });
  s.add(`<path d="M 20 48 L 108 48 M 20 80 L 108 80" stroke="${GILT}" stroke-width="1.6"/>`);
  const st = `font-family:${SERIF};font-weight:700;font-style:italic;font-size:28px;letter-spacing:0px`;
  s.add(`<text x="64" y="74" text-anchor="middle" style="${st}" fill="none" stroke="${NIGHT}" stroke-width="4" stroke-linejoin="round">${esc('Encore!')}</text>`);
  s.add(`<text x="64" y="74" text-anchor="middle" style="${st}" fill="${s.linear([[0, '#FFF1C0'], [0.5, GILT], [1, '#A86A12']])}">${esc('Encore!')}</text>`);
  s.glint(26, 48, 4.5);
});

const SPECS: Spec[] = [
  ['followspot', 'Follow spot', '#FFE2A8', 'pop', followspot, 'spotlight follow spot stage attention you main character', undefined, 'shockwave'],
  ['curtains', 'Curtain up', VELVET, 'pop', curtains, 'curtains stage theatre show start reveal'],
  ['stagerose', 'Rose on stage', '#D0103A', 'rain', stagerose, 'rose bravo flowers thrown stage love', undefined, 'storm'],
  ['comedy', 'Comedy', '#FFD894', 'bounce', mask(true), 'comedy mask theatre laugh funny drama'],
  ['tragedy', 'Tragedy', '#7FB8FF', 'rain', mask(false), 'tragedy mask theatre sad drama cry'],
  ['ovation', 'Standing ovation', '#FFB347', 'stomp', ovation, 'standing ovation applause clap crowd bravo', undefined, 'wall'],
  ['chandelier', 'Chandelier', '#FFD27A', 'float', chandelier, 'chandelier opera fancy glamour elegant'],
  ['candle', 'Candle', '#FFB347', 'float', candle, 'candle light flame vigil calm warm'],
  ['operafan', 'Opera fan', VELVET, 'pop', operafan, 'fan opera drama flirt fancy shade'],
  ['curtaincall', 'Curtain call', '#FFB347', 'pop', curtaincall, 'bow curtain call thank you humble take a bow'],
  ['spotencore', 'Encore!', VELVET, 'stomp', spotencore, 'encore again more one more stage banner', undefined, 'firework'],
];

export const SPOTLIGHT_PACK: EmotePack = {
  id: 'spotlight',
  name: 'Spotlight',
  blurb: 'The Baroque Dramatist: one hard spot, a pool of night, and the frame right after the cue.',
  director: 'BAROQUE',
  icon: 'spotlight.followspot',
  emotes: toDefs('spotlight', SPECS),
};
