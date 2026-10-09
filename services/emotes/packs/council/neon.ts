// Neon Signal — THE FUTURIST.
//
// "What is the rule, and what does it do when the input changes?"
// The rule: every glyph is ONE bent glass tube of a single gauge on a 2 px grid, round caps,
// no fills. Light is the material — there is no object under the glow. Because each emote is a
// single stroke path, the same path can be re-driven (flicker, chase, dim to the beat) without
// redrawing the art; the gel IS the tube colour, so Crowd Light and the art can never disagree.
//
// Under the shared light plot the rig bends rather than breaks: the KEY becomes the specular
// hairline along the top-left of the glass, the RIM becomes a second-gas edge on the lower-right
// of each tube, and the contact SHADOW becomes its inverse — the light the sign spills on the floor.
// Human trace: the dark glass stand-offs that physically hold a real tube to its backing.

import { Svg, svgEmote, heartPath, mix, KEY_LIGHT } from '../../emoteRig';
import { type Spec, toDefs, floorSpill, pol, f1, wideBlur } from './kit';
import type { EmotePack } from '../../emoteTypes';

const GAUGE = 7.5;

interface TubeOpts { w?: number; rim?: string; mounts?: [number, number][]; spill?: boolean; spillY?: number }

/** Fades the outer halo to nothing before the edge of the 128 square, so a bloom never shows the
 *  hard edge of the emote's box on stream. */
function edgeFade(s: Svg): string {
  const id = s.uid('ef');
  const g = s.radial([[0.62, '#fff'], [1, '#000']], 0.5, 0.5, 0.5);
  s.def(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="128" height="128"><rect width="128" height="128" fill="${g}"/></mask>`);
  return `mask="url(#${id})"`;
}

/** One neon tube along `d`, lit under the bent rig. */
function tube(s: Svg, d: string, gel: string, o: TubeOpts = {}) {
  const w = o.w ?? GAUGE;
  const cap = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const core = mix(gel, '#FFFFFF', 0.7);
  // stand-offs: the glass clips that hold the tube (drawn first, behind the glow)
  for (const [x, y] of o.mounts ?? []) {
    s.add(`<circle cx="${x}" cy="${y}" r="${w * 0.62}" fill="#1a1622" stroke="#6b6378" stroke-width="1"/>`);
  }
  // the glass is a real object: it throws the key's soft shadow onto whatever wall is behind it
  // (invisible on a dark stream, what keeps the tube legible on a bright one)
  s.add(`<path d="${d}" stroke="#14061e" stroke-width="${w * 1.3}" opacity="0.32" ${cap} transform="translate(2.2 3.2)" ${wideBlur(s, 2.2)}/>`);
  s.add(`<g ${edgeFade(s)}><path d="${d}" stroke="${gel}" stroke-width="${w * 3.4}" opacity="0.34" ${cap} ${wideBlur(s, 7)}/></g>`);
  s.add(`<path d="${d}" stroke="${gel}" stroke-width="${w * 1.7}" opacity="0.7" ${cap} ${wideBlur(s, 2.4)}/>`);
  // rim: the second gas catching on the lower-right of the glass
  s.add(`<path d="${d}" stroke="${o.rim ?? gel}" stroke-width="${w}" ${cap} transform="translate(1 1.2)"/>`);
  s.add(`<path d="${d}" stroke="${gel}" stroke-width="${w}" ${cap}/>`);
  s.add(`<path d="${d}" stroke="${core}" stroke-width="${w * 0.42}" ${cap}/>`);
  // key: the specular hairline on the top-left of the glass
  s.add(`<path d="${d}" stroke="${KEY_LIGHT}" stroke-width="${w * 0.16}" opacity="0.85" ${cap} transform="translate(${-w * 0.2} ${-w * 0.22})"/>`);
}

/** A filled dot of light (the LIVE lamp, the pupil). */
function lamp(s: Svg, cx: number, cy: number, r: number, gel: string) {
  s.add(`<g ${edgeFade(s)}><circle cx="${cx}" cy="${cy}" r="${r * 2.4}" fill="${gel}" opacity="0.4" ${wideBlur(s, 6)}/></g>`);
  s.add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.radial([[0, '#FFFFFF'], [0.45, mix(gel, '#FFFFFF', 0.55)], [1, gel]], 0.4, 0.38, 0.6)}"/>`);
}

function sign(paths: string[] | string, gel: string, o: TubeOpts & { extra?: (s: Svg) => void; before?: (s: Svg) => void } = {}) {
  return svgEmote(s => {
    if (o.spill !== false) floorSpill(s, gel, 64, o.spillY ?? 120, 40, 0.38);
    o.before?.(s);
    for (const d of Array.isArray(paths) ? paths : [paths]) tube(s, d, gel, o);
    o.extra?.(s);
  });
}

// ── glyphs (monoline, one gauge) ────────────────────────────────────────────────────────────────
function gGlyph(cx: number, cy: number, r: number): string {
  const [sx, sy] = pol(cx, cy, r, -48);
  return `M ${f1(sx)} ${f1(sy)} A ${r} ${r} 0 1 0 ${f1(cx + r)} ${f1(cy + 2)} L ${f1(cx + r * 0.18)} ${f1(cy + 2)}`;
}
function sine(x0: number, x1: number, cy: number, amp: number, periods: number): string {
  let d = '';
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = cy - Math.sin(t * periods * Math.PI * 2) * amp;
    d += `${i ? 'L' : 'M'} ${f1(x)} ${f1(y)} `;
  }
  return d;
}

const PINK = '#FF2E9A', CYAN = '#22E4FF', LIME = '#A8FF2E', VIOLET = '#A15CFF', AMBER = '#FFB020', RED = '#FF3344', MINT = '#3BFFA0', ICE = '#BFE9FF';

const neonW = sign('M 14 30 L 36 98 L 64 44 L 92 98 L 114 30', LIME, { rim: MINT, mounts: [[36, 98], [92, 98]] });
const neonGG = sign([gGlyph(36, 64, 24), gGlyph(92, 64, 24)], CYAN, {
  rim: VIOLET, w: 7,
  // the blacked-out return tube between letters — on a real sign it is painted over, not removed
  before: s => s.add(`<path d="M 60 66 Q 64 76 68 66" stroke="#2a2433" stroke-width="5" fill="none" stroke-linecap="round"/>`),
});
const neonLive = sign([
  'M 34 44 L 34 84 L 50 84',
  'M 60 44 L 60 84',
  'M 70 44 L 80 84 L 90 44',
  'M 114 44 L 100 44 L 100 84 L 114 84 M 100 64 L 111 64',
], RED, { rim: PINK, w: 6.5, extra: s => lamp(s, 17, 64, 7.5, RED) });
const neonHeart = sign(heartPath(64, 66, 100), PINK, { rim: VIOLET, mounts: [[64, 104]] });
const neonBolt = sign('M 76 10 L 38 68 L 64 68 L 50 118 L 92 52 L 66 52 L 80 10', AMBER, { rim: RED });
const neonCheck = sign('M 22 66 L 50 94 L 106 34', MINT, { rim: CYAN, w: 9, mounts: [[50, 94]] });
const neonInf = sign('M 64 64 C 80 38 112 38 112 64 C 112 90 80 90 64 64 C 48 38 16 38 16 64 C 16 90 48 90 64 64 Z', VIOLET, { rim: PINK });
const neonUp = sign(['M 64 112 L 64 20', 'M 32 52 L 64 20 L 96 52'], CYAN, { rim: MINT, w: 9 });
const neonWave = sign(sine(12, 116, 64, 24, 2), PINK, { rim: AMBER, mounts: [[12, 64], [116, 64]] });
const neonEye = sign(['M 12 64 Q 64 14 116 64 Q 64 114 12 64 Z', 'M 64 47 A 17 17 0 1 1 63.9 47'], ICE, {
  rim: CYAN, w: 6.5, extra: s => lamp(s, 64, 64, 6.5, CYAN),
});
const neonCrown = sign(['M 24 94 L 16 38 L 42 62 L 64 26 L 86 62 L 112 38 L 104 94 Z', 'M 26 108 L 102 108'], AMBER, {
  rim: PINK, w: 7, spillY: 122,
  extra: s => { lamp(s, 64, 76, 6, PINK); },
});
const neonOK = sign(['M 42 40 A 24 24 0 1 1 41.9 40', 'M 82 38 L 82 90', 'M 110 38 L 84 66 L 110 90'], LIME, { rim: CYAN, w: 7.5 });

const SPECS: Spec[] = [
  ['neonw', 'Neon W', LIME, 'stomp', neonW, 'w win dub neon sign', undefined, 'wall'],
  ['neongg', 'Neon GG', CYAN, 'pop', neonGG, 'gg good game neon'],
  ['neonlive', 'Live sign', RED, 'pulse', neonLive, 'live on air streaming neon', undefined, 'shockwave'],
  ['neonheart', 'Neon heart', PINK, 'pulse', neonHeart, 'heart love neon glow', undefined, 'storm'],
  ['neonbolt', 'Neon bolt', AMBER, 'beam', neonBolt, 'bolt lightning energy power neon'],
  ['neoncheck', 'Neon check', MINT, 'pop', neonCheck, 'yes check correct agree neon'],
  ['neoninf', 'Infinity', VIOLET, 'orbit', neonInf, 'infinity forever endless loop neon'],
  ['neonup', 'Level up', CYAN, 'beam', neonUp, 'up arrow level up rising higher neon', undefined, 'firework'],
  ['neonwave', 'Signal', PINK, 'float', neonWave, 'wave signal vibe frequency sound neon'],
  ['neoneye', 'Watching', ICE, 'pop', neonEye, 'eye watching see looking neon'],
  ['neoncrown', 'Neon crown', AMBER, 'pop', neonCrown, 'crown king queen royalty neon'],
  ['neonok', 'OK', LIME, 'pop', neonOK, 'ok okay fine agree neon'],
];

export const NEON_PACK: EmotePack = {
  id: 'neon',
  name: 'Neon Signal',
  blurb: 'The Futurist: light is the material. One tube, one gauge, nothing behind the glow.',
  director: 'FUTURIST',
  icon: 'neon.neonheart',
  emotes: toDefs('neon', SPECS),
};
