// One Line — THE RADICAL MINIMALIST.
//
// "What can be removed without loss? What is the one contrast that carries the meaning?"
// One stroke weight (8 on the 128 grid — the thinnest line that still survives 28 px chat), one
// colour per glyph, round ends, nothing else. Most of each square is empty on purpose: the
// emptiness is the frame the gesture needs. A dot is the same weight as every line, because it
// IS the line, stopped.
//
// Under the shared light plot this pack takes the least: no gradient, no glint, no outline. What
// is kept is the one thing a mark needs to sit on a moving picture — the key light's shadow, a
// faint soft offset down-right — and a hairline of the rim gel on the lower-right edge of the
// stroke. Remove those and the glyph floats; keep them and it sits.

import { Svg, svgEmote, heartPath, mix } from '../../emoteRig';
import { type Spec, toDefs } from './kit';
import type { EmotePack } from '../../emoteTypes';

const W = 8;
/** A full stop is optically larger than the stem it ends — every typeface does this. Not decoration:
 *  the correction that lets a dot weigh the same as a line. */
const DOT = W * 0.82;

function line(d: string, color: string, o: { dots?: [number, number][]; dotR?: number } = {}) {
  return svgEmote(s => {
    const cap = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    const sh = s.shadowFilter(2.2, 1.6, 0.4);
    const marks = (stroke: string, extra = '') =>
      (d ? `<path d="${d}" stroke="${stroke}" stroke-width="${W}" ${cap} ${extra}/>` : '')
      + (o.dots ?? []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${o.dotR ?? DOT}" fill="${stroke}" ${extra}/>`).join('');
    s.add(`<g ${sh}>${marks(color)}</g>`);
    // the rim: a hairline of lighter gel left on the lower-right edge of the stroke
    s.add(`<g ${clipToStroke(s, d, o.dots, o.dotR ?? DOT)}>${marks(mix(color, '#FFFFFF', 0.6))}<g transform="translate(-1.5 -1.5)">${marks(color)}</g></g>`);
  });
}
/** Clip the rim to the stroke so it only shows as an edge. */
function clipToStroke(s: Svg, d: string, dots: [number, number][] | undefined, r: number): string {
  const id = s.uid('ms');
  s.def(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="128" height="128">`
    + (d ? `<path d="${d}" stroke="#fff" stroke-width="${W}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : '')
    + (dots ?? []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join('')
    + `</mask>`);
  return `mask="url(#${id})"`;
}

const RED = '#FF4D5E', BLUE = '#3D8BFF', AMBER = '#FFB020', GREEN = '#27C281', VIOLET = '#9B6BFF', SKY = '#4FB8FF', PINK = '#FF5FA2', CORAL = '#FF7A59', TEAL = '#1FB5C9';

const lineheart = line(heartPath(64, 66, 76), RED);
const lineok = line('M 86.6 34.4 A 38 38 0 1 0 101.6 58', GREEN);   // a circle, left open where the hand lifted
const ellipsis = line('', SKY, { dots: [[38, 64], [64, 64], [90, 64]] });
const lineq = line('M 46 40 Q 46 24 64 24 Q 82 24 82 40 Q 82 52 64 58 L 64 74', VIOLET, { dots: [[64, 98]] });
const linebang = line('M 64 24 L 64 76', CORAL, { dots: [[64, 100]] });
const tilde = line('M 30 66 Q 47 46 64 64 Q 81 82 98 62', TEAL);
const lineup = line('M 64 100 L 64 30 M 44 50 L 64 30 L 84 50', BLUE);
const linesmile = line('M 40 70 Q 64 92 88 70', AMBER);
const linex = line('M 44 44 L 84 84 M 84 44 L 44 84', RED);
// the lone dot is the subject, not punctuation — it is drawn at the size it would be if it were the whole word
const dot = line('', PINK, { dots: [[64, 64]], dotR: 15 });
const lineplus = line('M 64 40 L 64 88 M 40 64 L 88 64', GREEN);

const SPECS: Spec[] = [
  ['lineheart', 'Line heart', RED, 'pulse', lineheart, 'heart love like minimal line', undefined, 'storm'],
  ['lineok', 'Circle', GREEN, 'pop', lineok, 'ok okay fine good circle minimal'],
  ['ellipsis', 'Ellipsis', SKY, 'pulse', ellipsis, 'ellipsis dots typing waiting speechless minimal'],
  ['lineq', 'Question', VIOLET, 'pop', lineq, 'question huh what why minimal'],
  ['linebang', 'Exclamation', CORAL, 'shake', linebang, 'exclamation wow whoa minimal'],
  ['tilde', 'Tilde', TEAL, 'float', tilde, 'tilde wave vibe chill so-so approximately minimal'],
  ['lineup', 'Up', BLUE, 'beam', lineup, 'up arrow rising agree upvote minimal'],
  ['linesmile', 'Smile line', AMBER, 'float', linesmile, 'smile happy content nice minimal'],
  ['linex', 'Cross', RED, 'shake', linex, 'x no cross wrong nope minimal'],
  ['dot', 'Dot', PINK, 'pop', dot, 'dot here present period full stop minimal'],
  ['lineplus', 'Plus', GREEN, 'pop', lineplus, 'plus add more agree same minimal'],
];

export const ONELINE_PACK: EmotePack = {
  id: 'oneline',
  name: 'One Line',
  blurb: 'The Radical Minimalist: one weight, one colour, and the room around it.',
  director: 'RADICAL_MINIMAL',
  icon: 'oneline.lineheart',
  emotes: toDefs('oneline', SPECS),
};
