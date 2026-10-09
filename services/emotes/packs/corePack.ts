// corePack — the classics every live platform needs, drawn under the house light plot.
//
// Faces share one lit amber sphere (Plajah amber, magenta rim). A few swap the sphere's colour
// when the feeling is the colour (rage red, cold cyan, sick green, devil purple). Features are a
// small grammar — eyes × mouth × extras — so the faces read as one family at 28 px.
// Icons are single lit objects with their own gel.

import type { EmoteDef, EmoteMotion, ChorusEvolution } from '../emoteTypes';
import {
  Svg, svgEmote, heartPath, starPath, softStarPath, polyPath, shade,
  INK, KEY_LIGHT, RIM_MAGENTA, RIM_CYAN,
} from '../emoteRig';

const AMBER = '#FFB82E';
const CX = 64, CY = 62, R = 50;
const EL = 45, ER = 83, EY = 56;      // eye centres
const MY = 84;                          // mouth line

type Eyes = 'dot' | 'happy' | 'closed' | 'wide' | 'heart' | 'star' | 'x' | 'side' | 'squint' | 'teary' | 'shades' | 'angry' | 'wink' | 'spiral' | 'half' | 'glasses' | 'up';
type Mouth = 'smile' | 'grin' | 'laugh' | 'o' | 'frown' | 'flat' | 'wavy' | 'tongue' | 'shout' | 'smirk' | 'teeth' | 'kiss' | 'tiny' | 'none';
type Extra = 'tears' | 'tear' | 'sweat' | 'blush' | 'steam' | 'zzz' | 'browAngry' | 'browWorried' | 'browRaise' | 'partyHat' | 'confetti' | 'halo' | 'horns' | 'frost' | 'heat' | 'sparkles' | 'hearts' | 'rofl' | 'cheeks';

function eye(s: Svg, kind: Eyes, x: number, right: boolean) {
  const y = EY;
  switch (kind) {
    case 'dot':
      s.add(`<ellipse cx="${x}" cy="${y}" rx="6" ry="8.5" fill="${INK}"/>`);
      s.add(`<circle cx="${x - 2}" cy="${y - 3.5}" r="2.2" fill="#fff"/>`);
      break;
    case 'up':
      s.add(`<ellipse cx="${x}" cy="${y - 2}" rx="6" ry="8.5" fill="${INK}"/><circle cx="${x - 1}" cy="${y - 7}" r="2.2" fill="#fff"/>`);
      break;
    case 'half':
      s.add(`<path d="M ${x - 9} ${y - 1} Q ${x} ${y - 4} ${x + 9} ${y - 1} L ${x + 8} ${y + 4} Q ${x} ${y + 9} ${x - 8} ${y + 4} Z" fill="${INK}"/>`);
      s.add(`<path d="M ${x - 10} ${y - 2} Q ${x} ${y - 6} ${x + 10} ${y - 2}" stroke="${INK}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`);
      break;
    case 'happy':
      s.add(`<path d="M ${x - 9} ${y + 3} Q ${x} ${y - 10} ${x + 9} ${y + 3}" stroke="${INK}" stroke-width="5.5" fill="none" stroke-linecap="round"/>`);
      break;
    case 'closed':
      s.add(`<path d="M ${x - 9} ${y} Q ${x} ${y + 8} ${x + 9} ${y}" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`);
      break;
    case 'squint': {
      const d = right ? -1 : 1;
      s.add(`<path d="M ${x - 8 * d} ${y - 7} L ${x + 7 * d} ${y} L ${x - 8 * d} ${y + 7}" stroke="${INK}" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
      break;
    }
    case 'wide':
      s.add(`<ellipse cx="${x}" cy="${y - 1}" rx="12" ry="14" fill="#fff" stroke="${INK}" stroke-width="2.4"/>`);
      s.add(`<circle cx="${x}" cy="${y + 1}" r="5.5" fill="${INK}"/><circle cx="${x - 2}" cy="${y - 1.5}" r="1.8" fill="#fff"/>`);
      break;
    case 'side':
      s.add(`<ellipse cx="${x}" cy="${y}" rx="11" ry="8" fill="#fff" stroke="${INK}" stroke-width="2.2"/>`);
      s.add(`<circle cx="${x + 5}" cy="${y + 1}" r="4.6" fill="${INK}"/>`);
      s.add(`<path d="M ${x - 12} ${y - 3} Q ${x} ${y - 9} ${x + 12} ${y - 3}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`);
      break;
    case 'x':
      s.add(`<path d="M ${x - 7} ${y - 7} L ${x + 7} ${y + 7} M ${x + 7} ${y - 7} L ${x - 7} ${y + 7}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`);
      break;
    case 'heart':
      s.litPath(heartPath(x, y + 1, 26), '#FF2E63', { rim: '#FFD1DC', hi: 22, noShadow: true, highlight: 0.8 });
      s.glint(x - 5, y - 4, 2.6);
      break;
    case 'star':
      s.litPath(softStarPath(x, y, 13, 6.2), '#FFD23A', { rim: '#FF7A00', hi: 18, noShadow: true, glow: '#FFE680', glowStd: 1.6 });
      break;
    case 'teary':
      s.add(`<ellipse cx="${x}" cy="${y}" rx="10" ry="12" fill="${INK}"/>`);
      s.add(`<ellipse cx="${x}" cy="${y + 5}" rx="8.5" ry="5.5" fill="#58C8FF" opacity="0.85"/>`);
      s.add(`<circle cx="${x - 3}" cy="${y - 4}" r="3.6" fill="#fff"/><circle cx="${x + 3.5}" cy="${y + 2}" r="1.8" fill="#fff"/>`);
      break;
    case 'angry':
      s.add(`<ellipse cx="${x}" cy="${y + 2}" rx="5.5" ry="6.5" fill="${INK}"/>`);
      break;
    case 'wink':
      if (right) s.add(`<path d="M ${x - 9} ${y + 2} Q ${x} ${y - 9} ${x + 9} ${y + 2}" stroke="${INK}" stroke-width="5.5" fill="none" stroke-linecap="round"/>`);
      else eye(s, 'dot', x, false);
      break;
    case 'spiral': {
      let d = `M ${x} ${y}`;
      for (let i = 1; i <= 26; i++) { const a = i * 0.55, r = i * 0.42; d += ` L ${(x + Math.cos(a) * r).toFixed(1)} ${(y + Math.sin(a) * r).toFixed(1)}`; }
      s.add(`<path d="${d}" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
      break;
    }
    case 'shades': {
      if (right) return;   // one piece, drawn once
      const d = `M 24 46 L 104 46 Q 106 46 105 50 L 100 64 Q 97 70 88 70 L 78 70 Q 70 70 67 62 L 64 56 L 61 62 Q 58 70 50 70 L 40 70 Q 31 70 28 64 L 23 50 Q 22 46 24 46 Z`;
      s.add(`<path d="${d}" fill="${s.linear([[0, '#3a3550'], [0.5, '#0f0b18'], [1, '#06040b']])}"/>`);
      s.add(`<path d="M 30 50 L 52 50 L 40 66 Z M 72 50 L 94 50 L 82 66 Z" fill="${KEY_LIGHT}" opacity="0.22"/>`);
      s.add(`<path d="M 24 46 L 104 46" stroke="${s.rimGradient(RIM_CYAN)}" stroke-width="2"/>`);
      s.glint(38, 52, 3.4);
      break;
    }
    case 'glasses':
      s.add(`<circle cx="${x}" cy="${y}" r="13" fill="#fff" fill-opacity="0.35" stroke="${INK}" stroke-width="3.4"/>`);
      s.add(`<circle cx="${x}" cy="${y + 1}" r="4.6" fill="${INK}"/><circle cx="${x - 1.6}" cy="${y - 1}" r="1.6" fill="#fff"/>`);
      if (!right) s.add(`<path d="M ${x + 13} ${y - 2} Q 64 ${y - 7} ${ER - 13} ${y - 2}" stroke="${INK}" stroke-width="3.2" fill="none"/>`);
      break;
  }
}

function mouth(s: Svg, kind: Mouth) {
  const y = MY;
  switch (kind) {
    case 'smile':
      s.add(`<path d="M 46 ${y - 3} Q 64 ${y + 14} 82 ${y - 3}" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`);
      break;
    case 'tiny':
      s.add(`<path d="M 57 ${y} Q 64 ${y + 5} 71 ${y}" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`);
      break;
    case 'grin': {
      const d = `M 40 ${y - 6} Q 64 ${y - 2} 88 ${y - 6} Q 86 ${y + 18} 64 ${y + 19} Q 42 ${y + 18} 40 ${y - 6} Z`;
      s.add(`<path d="${d}" fill="#5B0E2D"/>`);
      s.add(`<g ${s.clip(`<path d="${d}"/>`)}><rect x="38" y="${y - 8}" width="52" height="9" rx="2" fill="#fff"/>`
        + `<ellipse cx="64" cy="${y + 19}" rx="15" ry="9" fill="#FF6F91"/></g>`);
      s.add(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>`);
      break;
    }
    case 'laugh': {
      const d = `M 36 ${y - 9} Q 64 ${y - 5} 92 ${y - 9} Q 90 ${y + 24} 64 ${y + 24} Q 38 ${y + 24} 36 ${y - 9} Z`;
      s.add(`<path d="${d}" fill="#5B0E2D"/>`);
      s.add(`<g ${s.clip(`<path d="${d}"/>`)}><rect x="34" y="${y - 11}" width="60" height="9" fill="#fff"/>`
        + `<ellipse cx="64" cy="${y + 24}" rx="18" ry="11" fill="#FF6F91"/></g>`);
      s.add(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>`);
      break;
    }
    case 'shout': {
      s.add(`<ellipse cx="64" cy="${y + 6}" rx="15" ry="18" fill="#5B0E2D" stroke="${INK}" stroke-width="3.2"/>`);
      s.add(`<g ${s.clip(`<ellipse cx="64" cy="${y + 6}" rx="15" ry="18"/>`)}><ellipse cx="64" cy="${y + 22}" rx="11" ry="8" fill="#FF6F91"/></g>`);
      break;
    }
    case 'o':
      s.add(`<ellipse cx="64" cy="${y + 2}" rx="8" ry="10" fill="#5B0E2D" stroke="${INK}" stroke-width="3"/>`);
      break;
    case 'frown':
      s.add(`<path d="M 48 ${y + 8} Q 64 ${y - 6} 80 ${y + 8}" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`);
      break;
    case 'flat':
      s.add(`<path d="M 50 ${y + 2} L 78 ${y + 2}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`);
      break;
    case 'wavy':
      s.add(`<path d="M 44 ${y + 2} Q 49 ${y - 4} 54 ${y + 2} T 64 ${y + 2} T 74 ${y + 2} T 84 ${y + 2}" stroke="${INK}" stroke-width="4.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
      break;
    case 'tongue':
      s.add(`<path d="M 62 ${y + 3} Q 62 ${y + 20} 71 ${y + 19} Q 79 ${y + 18} 77 ${y + 2} Z" fill="#FF5C86" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`);
      s.add(`<path d="M 69.5 ${y + 6} L 70 ${y + 13}" stroke="#D93466" stroke-width="2" stroke-linecap="round"/>`);
      s.add(`<path d="M 44 ${y - 4} Q 64 ${y + 10} 84 ${y - 4}" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`);
      break;
    case 'smirk':
      s.add(`<path d="M 50 ${y + 3} Q 70 ${y + 6} 82 ${y - 6}" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`);
      break;
    case 'teeth': {
      s.add(`<rect x="40" y="${y - 6}" width="48" height="18" rx="8" fill="#fff" stroke="${INK}" stroke-width="3.2"/>`);
      s.add(`<path d="M 40 ${y + 3} L 88 ${y + 3} M 52 ${y - 6} L 52 ${y + 12} M 64 ${y - 6} L 64 ${y + 12} M 76 ${y - 6} L 76 ${y + 12}" stroke="${INK}" stroke-width="2"/>`);
      break;
    }
    case 'kiss':
      s.add(`<path d="M 60 ${y - 6} Q 70 ${y - 4} 63 ${y + 1} Q 71 ${y + 5} 60 ${y + 9}" stroke="${INK}" stroke-width="4.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
      break;
    case 'none': break;
  }
}

function extra(s: Svg, kind: Extra) {
  switch (kind) {
    case 'blush':
      s.add(`<ellipse cx="34" cy="74" rx="9" ry="5.5" fill="#FF5C8A" opacity="0.45" ${s.blurFilter(1.4)}/><ellipse cx="94" cy="74" rx="9" ry="5.5" fill="#FF5C8A" opacity="0.45" ${s.blurFilter(1.4)}/>`);
      break;
    case 'cheeks':
      s.add(`<ellipse cx="32" cy="72" rx="7" ry="4.5" fill="#FF5C8A" opacity="0.38"/><ellipse cx="96" cy="72" rx="7" ry="4.5" fill="#FF5C8A" opacity="0.38"/>`);
      break;
    case 'tears': {
      const water = s.linear([[0, '#9BE7FF'], [1, '#2FA8FF']]);
      s.add(`<path d="M 34 60 Q 22 70 20 92 Q 19 101 26 101 Q 33 100 32 90 Q 31 76 38 64 Z" fill="${water}" stroke="#1B79C9" stroke-width="1.6"/>`);
      s.add(`<path d="M 94 60 Q 106 70 108 92 Q 109 101 102 101 Q 95 100 96 90 Q 97 76 90 64 Z" fill="${water}" stroke="#1B79C9" stroke-width="1.6"/>`);
      s.add(`<path d="M 24 84 Q 23 92 26 96" stroke="#fff" stroke-width="1.8" fill="none" opacity="0.8"/><path d="M 104 84 Q 105 92 102 96" stroke="#fff" stroke-width="1.8" fill="none" opacity="0.8"/>`);
      break;
    }
    case 'tear': {
      const water = s.linear([[0, '#B5EEFF'], [1, '#2FA8FF']]);
      s.add(`<path d="M 84 64 Q 92 76 90 82 Q 88 88 83 88 Q 77 87 78 81 Q 78 75 84 64 Z" fill="${water}" stroke="#1B79C9" stroke-width="1.4"/>`);
      s.glint(82, 78, 2);
      break;
    }
    case 'sweat': {
      const water = s.linear([[0, '#C8F3FF'], [1, '#3BB0FF']]);
      s.add(`<path d="M 100 22 Q 110 36 108 42 Q 106 49 100 49 Q 93 48 93 41 Q 94 34 100 22 Z" fill="${water}" stroke="#1B79C9" stroke-width="1.6"/>`);
      s.glint(98, 38, 2.4);
      break;
    }
    case 'steam': {
      const puff = (x: number, y: number, k: number) => `<path d="M ${x} ${y} q ${-7 * k} ${-2 * k} ${-6 * k} ${-9 * k} q ${1 * k} ${-7 * k} ${8 * k} ${-6 * k} q ${3 * k} ${-6 * k} ${10 * k} ${-3 * k} q ${7 * k} ${2 * k} ${5 * k} ${9 * k} q ${6 * k} ${4 * k} ${1 * k} ${9 * k} Z" fill="#fff" opacity="0.92" stroke="#E7D6E8" stroke-width="1.4"/>`;
      s.add(puff(14, 32, 1) + puff(108, 30, 1.05));
      break;
    }
    case 'zzz':
      s.litText('z', { x: 98, y: 34, size: 20, base: '#B9A8FF', rim: RIM_CYAN, outlineW: 5 });
      s.litText('z', { x: 110, y: 18, size: 14, base: '#B9A8FF', rim: RIM_CYAN, outlineW: 4 });
      break;
    case 'browAngry':
      s.add(`<path d="M 30 40 L 56 50 M 98 40 L 72 50" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`);
      break;
    case 'browWorried':
      s.add(`<path d="M 32 44 Q 42 36 54 40 M 96 44 Q 86 36 74 40" stroke="${INK}" stroke-width="4.6" fill="none" stroke-linecap="round"/>`);
      break;
    case 'browRaise':
      s.add(`<path d="M 72 36 Q 84 28 96 36" stroke="${INK}" stroke-width="4.6" fill="none" stroke-linecap="round"/><path d="M 32 44 L 54 44" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/>`);
      break;
    case 'partyHat': {
      const d = 'M 74 4 L 98 40 Q 86 46 66 34 Z';
      s.litPath(d, '#7B2CFF', { rim: '#FFC93A', noShadow: true });
      s.add(`<g ${s.clip(`<path d="${d}"/>`)}><path d="M 66 20 L 100 28 M 60 32 L 100 42 M 70 8 L 96 16" stroke="#FFC93A" stroke-width="4"/></g>`);
      s.add(`<circle cx="74" cy="5" r="5.5" fill="#FF3D8B"/>`);
      s.glint(73, 3, 2.4);
      break;
    }
    case 'confetti': {
      const bits: [number, number, string, number][] = [[12, 20, '#3FE6FF', 20], [116, 64, '#FF3D8B', -30], [18, 104, '#FFC93A', 50], [110, 104, '#7B2CFF', 10], [8, 62, '#4ADE80', -10]];
      for (const [x, y, c, r] of bits) s.add(`<rect x="${x - 4}" y="${y - 2}" width="8" height="4" rx="1" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`);
      break;
    }
    case 'halo':
      s.add(`<ellipse cx="64" cy="10" rx="30" ry="7" fill="none" stroke="#FFE680" stroke-width="5" ${s.glowFilter('#FFF2B0', 3)}/>`);
      break;
    case 'horns':
      s.litPath('M 26 32 Q 14 18 18 2 Q 30 14 40 22 Z', '#C21E56', { rim: '#FFB0C8', noShadow: true });
      s.litPath('M 102 32 Q 114 18 110 2 Q 98 14 88 22 Z', '#C21E56', { rim: '#FFB0C8', noShadow: true });
      break;
    case 'frost':
      for (const [x, y, k] of [[22, 30, 1], [104, 92, 0.8], [104, 28, 0.6]] as [number, number, number][])
        s.add(`<path d="M ${x} ${y - 8 * k} L ${x} ${y + 8 * k} M ${x - 7 * k} ${y - 4 * k} L ${x + 7 * k} ${y + 4 * k} M ${x - 7 * k} ${y + 4 * k} L ${x + 7 * k} ${y - 4 * k}" stroke="#E6FBFF" stroke-width="2.6" stroke-linecap="round"/>`);
      break;
    case 'heat':
      s.add(`<path d="M 18 104 Q 24 96 18 88 M 110 104 Q 104 96 110 88" stroke="#FFE1A6" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>`);
      break;
    case 'sparkles':
      s.glint(14, 22, 7, '#FFE680'); s.glint(112, 30, 5, '#FFE680'); s.glint(110, 100, 6, '#FFF'); s.glint(18, 96, 4, '#FFF');
      break;
    case 'hearts':
      s.litPath(heartPath(16, 26, 20), '#FF2E63', { rim: '#FFD1DC', noShadow: true });
      s.litPath(heartPath(112, 34, 16), '#FF2E63', { rim: '#FFD1DC', noShadow: true });
      s.litPath(heartPath(106, 106, 14), '#FF5C8A', { rim: '#FFD1DC', noShadow: true });
      break;
    case 'rofl': break;   // handled by rotating the whole face
  }
}

function face(base: string, eyes: Eyes, m: Mouth, extras: Extra[] = [], o: { rim?: string; tilt?: number; before?: Extra[] } = {}) {
  return svgEmote(s => {
    for (const e of o.before ?? []) extra(s, e);
    if (o.tilt) s.add(`<g transform="rotate(${o.tilt} 64 64)">`);
    s.litSphere(CX, CY, R, base, o.rim ?? RIM_MAGENTA);
    for (const e of extras) if (e === 'blush' || e === 'cheeks') extra(s, e);
    eye(s, eyes, EL, false); eye(s, eyes, ER, true);
    mouth(s, m);
    for (const e of extras) if (e !== 'blush' && e !== 'cheeks') extra(s, e);
    if (o.tilt) s.add(`</g>`);
  });
}

// ── icons ────────────────────────────────────────────────────────────────────────────────────────
const fire = svgEmote(s => {
  s.contactShadow(64, 120, 30, 0.3);
  const outer = 'M 64 6 C 72 26 98 38 98 70 C 98 98 82 116 64 116 C 44 116 28 100 28 76 C 28 58 38 48 44 38 C 46 50 52 56 56 56 C 52 40 56 22 64 6 Z';
  const mid = 'M 66 36 C 72 52 88 62 88 82 C 88 100 78 110 64 110 C 50 110 40 100 40 86 C 40 74 48 66 52 60 C 54 70 58 74 62 74 C 60 62 60 48 66 36 Z';
  const core = 'M 64 66 C 68 76 78 84 78 94 C 78 104 72 110 64 110 C 56 110 50 104 50 96 C 50 88 56 84 58 80 C 60 86 62 88 64 88 C 62 82 62 74 64 66 Z';
  s.litPath(outer, '#FF3D1F', { rim: '#FFD23A', glow: '#FF5A1F', glowStd: 5, noShadow: true, hi: 14 });
  s.litPath(mid, '#FF8A1F', { rim: '#FFF0A0', noShadow: true, hi: 16 });
  s.litPath(core, '#FFE06A', { rim: '#FFFFFF', noShadow: true, hi: 12, highlight: 0.8 });
});

const heart = svgEmote(s => {
  s.contactShadow(64, 118, 34);
  s.litPath(heartPath(64, 62, 104), '#FF1F5A', { rim: '#FFB0C8', glow: '#FF4D7E', glowStd: 3.5, hi: 20, lo: 22 });
  s.add(`<path d="M 30 44 Q 30 26 46 24" stroke="${KEY_LIGHT}" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.85"/>`);
  s.glint(42, 38, 5);
});
const purpleHeart = svgEmote(s => {
  s.contactShadow(64, 118, 34);
  s.litPath(heartPath(64, 62, 104), '#8A2BE2', { rim: '#FF8CC6', glow: '#B04BFF', glowStd: 3.5, hi: 22, lo: 22 });
  s.add(`<path d="M 30 44 Q 30 26 46 24" stroke="${KEY_LIGHT}" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.8"/>`);
  s.glint(42, 38, 5);
});
const brokenHeart = svgEmote(s => {
  s.contactShadow(64, 118, 34);
  const L = 'M 64 101 C 52 91 12 66 12 44 C 12 24 28 14 41 14 C 52 14 59 20 62 29 L 54 46 L 66 58 L 56 74 L 64 101 Z';
  const Rt = 'M 72 101 C 84 91 124 66 124 44 C 124 24 108 14 95 14 C 84 14 77 20 74 29 L 66 46 L 78 58 L 68 74 L 72 101 Z';
  s.litPath(L, '#E0154F', { rim: '#FFB0C8', transform: 'rotate(-6 40 60) translate(-4 4)' });
  s.litPath(Rt, '#E0154F', { rim: '#FFB0C8', transform: 'rotate(7 96 60) translate(0 6)' });
});
const sparkleHeart = svgEmote(s => {
  s.contactShadow(64, 118, 34);
  s.litPath(heartPath(64, 64, 96), '#FF4FA3', { rim: '#FFE680', glow: '#FF8CC6', glowStd: 4, hi: 24 });
  s.glint(40, 40, 6); s.glint(18, 18, 8, '#FFE680'); s.glint(110, 22, 6, '#FFE680'); s.glint(108, 96, 5, '#FFF');
});

const hundred = svgEmote(s => {
  s.litText('100', { y: 78, size: 54, base: '#FF2A3D', rim: '#FFD23A', italic: true, rotate: -8, spacing: -3 });
  s.add(`<path d="M 18 92 Q 64 84 110 88" stroke="#FF2A3D" stroke-width="7" fill="none" stroke-linecap="round" transform="rotate(-8 64 90)"/>`);
  s.add(`<path d="M 26 104 Q 64 98 104 100" stroke="#FF2A3D" stroke-width="6" fill="none" stroke-linecap="round" transform="rotate(-8 64 100)"/>`);
});

const star = svgEmote(s => {
  s.contactShadow(64, 120, 34);
  s.litPath(starPath(64, 62, 56, 25), '#FFC21F', { rim: '#FF7A00', glow: '#FFE680', glowStd: 4, hi: 22 });
  s.glint(48, 44, 6);
});
const sparkles = svgEmote(s => {
  const big = 'M 54 14 Q 58 46 90 52 Q 58 58 54 92 Q 50 58 18 52 Q 50 46 54 14 Z';
  s.litPath(big, '#FFD23A', { rim: '#FF8A00', glow: '#FFF0A0', glowStd: 4, noShadow: true, hi: 24 });
  s.litPath('M 96 66 Q 98 82 114 86 Q 98 90 96 106 Q 94 90 78 86 Q 94 82 96 66 Z', '#FFE680', { rim: '#FF8A00', glow: '#FFF0A0', noShadow: true });
  s.litPath('M 100 8 Q 101 18 110 20 Q 101 22 100 32 Q 99 22 90 20 Q 99 18 100 8 Z', '#FFF3B0', { rim: '#FFB000', noShadow: true });
});
const bolt = svgEmote(s => {
  s.contactShadow(60, 120, 24);
  s.litPath('M 74 4 L 26 70 L 58 70 L 46 124 L 102 48 L 68 48 L 80 4 Z', '#FFD000', { rim: '#FF6A00', glow: '#FFF08A', glowStd: 5, hi: 20, stroke: '#7A4A00', strokeW: 2 });
});
const crown = svgEmote(s => {
  s.contactShadow(64, 112, 44);
  const d = 'M 14 96 L 8 34 L 38 60 L 64 18 L 90 60 L 120 34 L 114 96 Z';
  s.litPath(d, '#FFC21F', { rim: '#FF7A00', hi: 26, lo: 24 });
  s.litPath('M 14 96 L 114 96 L 112 108 L 16 108 Z', '#E8A000', { rim: '#FF7A00', noShadow: true });
  s.litPath('M 64 52 L 72 64 L 64 76 L 56 64 Z', '#FF2E63', { rim: '#FFFFFF', noShadow: true, glow: '#FF7AA0', glowStd: 2 });
  s.litPath('M 32 72 L 38 80 L 32 88 L 26 80 Z', '#3FE6FF', { rim: '#FFFFFF', noShadow: true });
  s.litPath('M 96 72 L 102 80 L 96 88 L 90 80 Z', '#3FE6FF', { rim: '#FFFFFF', noShadow: true });
  for (const [x, y] of [[8, 34], [64, 18], [120, 34]] as [number, number][]) s.add(`<circle cx="${x}" cy="${y}" r="6" fill="#FFE680" stroke="#B87400" stroke-width="1.6"/>`);
  s.glint(52, 40, 5);
});
const trophy = svgEmote(s => {
  s.contactShadow(64, 120, 30);
  s.litPath('M 30 12 L 98 12 L 96 46 Q 92 74 64 78 Q 36 74 32 46 Z', '#FFC21F', { rim: '#FF7A00', hi: 26, lo: 26 });
  s.add(`<path d="M 32 22 Q 10 22 14 42 Q 18 56 36 58 M 96 22 Q 118 22 114 42 Q 110 56 92 58" stroke="#E8A000" stroke-width="7" fill="none" stroke-linecap="round"/>`);
  s.litPath('M 56 76 L 72 76 L 74 94 L 54 94 Z', '#E8A000', { rim: '#FF7A00', noShadow: true });
  s.litPath('M 34 94 L 94 94 L 98 116 L 30 116 Z', '#5B2C83', { rim: '#FFC21F', noShadow: true });
  s.litPath(starPath(64, 40, 14, 6), '#FFF3B0', { rim: '#FF9A00', noShadow: true });
  s.glint(44, 26, 6);
});
const gem = svgEmote(s => {
  s.contactShadow(64, 120, 30);
  const outer: [number, number][] = [[30, 22], [98, 22], [120, 50], [64, 116], [8, 50]];
  s.litPath(polyPath(outer), '#16D6F0', { rim: '#B04BFF', glow: '#7FF3FF', glowStd: 3.6, hi: 24 });
  s.add(`<path d="M 8 50 L 120 50 M 30 22 L 46 50 L 64 116 L 82 50 L 98 22 M 46 50 L 64 22 L 82 50" stroke="#E8FDFF" stroke-width="2" fill="none" opacity="0.8"/>`);
  s.add(`<path d="M 30 22 L 46 50 L 8 50 Z" fill="#fff" opacity="0.35"/><path d="M 64 22 L 82 50 L 46 50 Z" fill="#fff" opacity="0.18"/>`);
  s.glint(40, 34, 6);
});
const rocket = svgEmote(s => {
  s.add(`<g transform="rotate(38 64 64)">`);
  s.litPath('M 64 4 Q 88 24 88 64 L 88 88 L 40 88 L 40 64 Q 40 24 64 4 Z', '#F2F0FA', { rim: RIM_MAGENTA, hi: 6, lo: 20 });
  s.add(`<circle cx="64" cy="48" r="11" fill="${s.sphereGradient('#3FB7FF')}" stroke="#5B2C83" stroke-width="4"/>`);
  s.litPath('M 40 64 L 22 92 L 40 88 Z', '#FF3D8B', { rim: '#FFC93A', noShadow: true });
  s.litPath('M 88 64 L 106 92 L 88 88 Z', '#FF3D8B', { rim: '#FFC93A', noShadow: true });
  s.litPath('M 46 88 L 82 88 Q 78 112 64 124 Q 50 112 46 88 Z', '#FF8A1F', { rim: '#FFF0A0', glow: '#FFB000', glowStd: 4, noShadow: true });
  s.add(`</g>`);
});
const note = svgEmote(s => {
  s.contactShadow(56, 120, 30);
  s.litPath('M 38 82 C 22 82 14 92 18 102 C 22 114 40 116 50 106 C 54 102 56 96 56 90 L 56 36 L 100 24 L 100 72 C 86 70 76 78 76 90 C 76 102 90 108 102 102 C 110 98 114 92 114 84 L 114 6 L 44 24 L 44 82 Z', '#B04BFF', { rim: '#3FE6FF', glow: '#C77DFF', glowStd: 3, hi: 24 });
  s.glint(30, 92, 4);
});
const eyes = svgEmote(s => {
  for (const x of [38, 90]) {
    s.contactShadow(x, 116, 20, 0.22);
    s.add(`<ellipse cx="${x}" cy="62" rx="24" ry="40" fill="${s.sphereGradient('#FFFFFF', { lo: 16 })}" stroke="${INK}" stroke-width="3"/>`);
    s.add(`<ellipse cx="${x + 8}" cy="66" rx="11" ry="15" fill="${INK}"/><circle cx="${x + 4}" cy="60" r="4" fill="#fff"/>`);
  }
});
const skull = svgEmote(s => {
  s.contactShadow(64, 120, 34);
  s.litPath('M 64 8 C 96 8 114 30 114 58 C 114 76 106 84 98 88 L 98 108 Q 98 116 90 116 L 38 116 Q 30 116 30 108 L 30 88 C 22 84 14 76 14 58 C 14 30 32 8 64 8 Z', '#F4EFF8', { rim: '#B04BFF', hi: 4, lo: 22 });
  s.add(`<path d="M 30 56 Q 30 42 46 44 Q 58 46 56 60 Q 54 74 42 72 Q 30 70 30 56 Z M 98 56 Q 98 42 82 44 Q 70 46 72 60 Q 74 74 86 72 Q 98 70 98 56 Z" fill="${INK}"/>`);
  s.add(`<path d="M 64 72 L 72 88 L 56 88 Z" fill="${INK}"/>`);
  s.add(`<path d="M 46 98 L 46 116 M 58 98 L 58 116 M 70 98 L 70 116 M 82 98 L 82 116" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`);
  s.add(`<circle cx="44" cy="56" r="3" fill="#B04BFF"/><circle cx="84" cy="56" r="3" fill="#B04BFF"/>`);
});
const ghost = svgEmote(s => {
  s.contactShadow(64, 122, 28, 0.2);
  s.litPath('M 24 60 C 24 30 42 10 64 10 C 86 10 104 30 104 60 L 104 112 L 92 102 L 80 114 L 64 102 L 48 114 L 36 102 L 24 112 Z', '#F5F2FF', { rim: '#7FF3FF', glow: '#CFC4FF', glowStd: 4, hi: 4, lo: 18 });
  s.add(`<ellipse cx="50" cy="56" rx="7" ry="10" fill="${INK}"/><ellipse cx="78" cy="56" rx="7" ry="10" fill="${INK}"/>`);
  s.add(`<ellipse cx="64" cy="80" rx="8" ry="10" fill="${INK}"/>`);
});
const rose = svgEmote(s => {
  s.add(`<path d="M 64 66 Q 60 92 68 124" stroke="#1F8A4C" stroke-width="6" fill="none" stroke-linecap="round"/>`);
  s.litPath('M 66 96 Q 88 84 100 96 Q 84 108 66 96 Z', '#2DBE6C', { rim: '#B6FFD2', noShadow: true });
  s.litPath('M 64 8 C 92 8 104 26 100 46 C 96 64 80 72 64 72 C 48 72 32 64 28 46 C 24 26 36 8 64 8 Z', '#E01748', { rim: '#FF9AB8', hi: 18, lo: 26 });
  s.add(`<path d="M 46 30 Q 64 18 82 30 Q 76 50 64 50 Q 52 50 46 30 Z" fill="${shade('#E01748', -18)}"/><path d="M 54 32 Q 64 26 74 32 Q 70 42 64 42 Q 58 42 54 32 Z" fill="${shade('#E01748', -30)}"/>`);
  s.add(`<path d="M 34 44 Q 44 62 64 62 Q 84 62 94 44" stroke="${shade('#E01748', -26)}" stroke-width="2.4" fill="none"/>`);
  s.glint(44, 22, 4);
});
const gift = svgEmote(s => {
  s.contactShadow(64, 120, 44);
  s.litPath('M 18 54 L 110 54 L 106 116 L 22 116 Z', '#8A2BE2', { rim: '#FF8CC6', hi: 20 });
  s.litPath('M 12 38 L 116 38 L 116 58 L 12 58 Z', '#A050F0', { rim: '#FF8CC6', noShadow: true });
  s.add(`<rect x="56" y="38" width="16" height="78" fill="${s.keyGradient('#FFC21F')}"/>`);
  s.litPath('M 64 38 C 44 10 22 22 34 34 C 40 40 56 40 64 38 Z', '#FFC21F', { rim: '#FF7A00', noShadow: true });
  s.litPath('M 64 38 C 84 10 106 22 94 34 C 88 40 72 40 64 38 Z', '#FFC21F', { rim: '#FF7A00', noShadow: true });
  s.glint(28, 46, 4);
});
const popper = svgEmote(s => {
  s.litPath('M 14 116 L 46 50 L 78 82 Z', '#FF3D8B', { rim: '#FFC93A', hi: 20 });
  s.add(`<g ${s.clip('<path d="M 14 116 L 46 50 L 78 82 Z"/>')}><path d="M 20 84 L 60 100 M 28 66 L 70 90 M 10 102 L 50 116" stroke="#FFC93A" stroke-width="6"/></g>`);
  const bits: [number, number, string, number][] = [[70, 40, '#3FE6FF', 30], [92, 30, '#FFC93A', -20], [100, 56, '#7B2CFF', 60], [82, 14, '#4ADE80', 10], [112, 40, '#FF3D8B', -40], [58, 22, '#FFC93A', 70], [104, 78, '#3FE6FF', 20]];
  for (const [x, y, c, r] of bits) s.add(`<rect x="${x - 5}" y="${y - 2.5}" width="10" height="5" rx="1.4" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`);
  s.add(`<path d="M 66 22 Q 74 10 70 2 M 116 70 Q 124 64 126 56" stroke="#FFC93A" stroke-width="3" fill="none" stroke-linecap="round"/>`);
  s.glint(56, 60, 5, '#FFF0A0'); s.glint(118, 18, 5, '#FFF0A0');
});
const check = svgEmote(s => {
  s.litSphere(64, 62, 50, '#22C55E', '#B6FFD2');
  s.add(`<path d="M 38 62 L 56 80 L 92 42" stroke="#fff" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round" ${s.shadowFilter(2, 1.4, 0.3)}/>`);
});
const cross = svgEmote(s => {
  s.litSphere(64, 62, 50, '#EF2D4A', '#FFB0C8');
  s.add(`<path d="M 42 40 L 86 84 M 86 40 L 42 84" stroke="#fff" stroke-width="13" stroke-linecap="round" ${s.shadowFilter(2, 1.4, 0.3)}/>`);
});
const question = svgEmote(s => s.litText('?', { y: 104, size: 112, base: '#3FB7FF', rim: '#B04BFF', outlineW: 10 }));
const bang = svgEmote(s => s.litText('!!', { y: 104, size: 104, base: '#FF2A3D', rim: '#FFD23A', outlineW: 10, spacing: -8 }));

// text callouts — the chat-speak every stream needs
const word = (text: string, base: string, rim: string, size: number, o: { y?: number; rotate?: number; glow?: string; italic?: boolean } = {}) =>
  svgEmote(s => s.litText(text, { y: o.y ?? 64 + size * 0.36, size, base, rim, rotate: o.rotate, glow: o.glow, italic: o.italic }));

// ── definitions ──────────────────────────────────────────────────────────────────────────────────
type Spec = [code: string, name: string, gel: string, motion: EmoteMotion, art: () => string, tags: string, unicode?: string, evolution?: ChorusEvolution];

const SPECS: Spec[] = [
  // faces
  ['lol', 'Crying laughing', '#FFB82E', 'bounce', face(AMBER, 'squint', 'laugh', ['tears']), 'laugh funny haha lmao joy', '😂', 'storm'],
  ['rofl', 'Rolling', '#FFB82E', 'spin', face(AMBER, 'squint', 'laugh', ['tears'], { tilt: -28 }), 'laugh rolling floor dead funny', '🤣'],
  ['smile', 'Smile', '#FFB82E', 'float', face(AMBER, 'happy', 'smile', ['blush']), 'happy nice warm'],
  ['grin', 'Big grin', '#FFB82E', 'pop', face(AMBER, 'dot', 'grin', ['cheeks']), 'happy grin teeth', '😁'],
  ['love', 'Heart eyes', '#FF2E63', 'pulse', face(AMBER, 'heart', 'grin', ['blush']), 'love heart crush adore', '😍'],
  ['kiss', 'Blow a kiss', '#FF5C8A', 'float', face(AMBER, 'wink', 'kiss', ['blush', 'hearts']), 'kiss mwah love', '😘'],
  ['wink', 'Wink', '#FFB82E', 'pop', face(AMBER, 'wink', 'tongue', ['cheeks']), 'wink cheeky playful', '😜'],
  ['cool', 'Cool', '#3FE6FF', 'pop', face(AMBER, 'shades', 'smirk', [], { rim: RIM_CYAN }), 'cool sunglasses chill', '😎'],
  ['wow', 'Wow', '#FFB82E', 'shake', face(AMBER, 'wide', 'o', ['browRaise']), 'wow omg shocked surprised', '😮'],
  ['scream', 'Screaming', '#7FD3FF', 'shake', face('#FFD27A', 'wide', 'shout', ['sweat'], { rim: RIM_CYAN }), 'scream scared shock horror', '😱', 'shockwave'],
  ['cry', 'Sobbing', '#2FA8FF', 'rain', face(AMBER, 'teary', 'frown', ['tears', 'browWorried'], { rim: RIM_CYAN }), 'cry sad sob tears', '😭'],
  ['sad', 'Sad', '#5AA9FF', 'rain', face(AMBER, 'dot', 'frown', ['tear', 'browWorried'], { rim: RIM_CYAN }), 'sad down blue', '😢'],
  ['rage', 'Rage', '#FF2A2A', 'shake', face('#FF5A3A', 'angry', 'teeth', ['browAngry', 'steam'], { rim: '#FFD23A' }), 'angry mad rage furious', '😡', 'shockwave'],
  ['think', 'Thinking', '#FFB82E', 'pop', face(AMBER, 'up', 'smirk', ['browRaise']), 'think hmm wonder', '🤔'],
  ['sus', 'Sus', '#FFB82E', 'pop', face(AMBER, 'side', 'flat', []), 'sus suspicious side eye doubt', '🤨'],
  ['sleep', 'Sleepy', '#B9A8FF', 'float', face(AMBER, 'closed', 'o', ['zzz'], { rim: '#B9A8FF' }), 'sleep tired zzz bored', '😴'],
  ['dizzy', 'Dizzy', '#FFB82E', 'spin', face(AMBER, 'spiral', 'wavy', []), 'dizzy confused woozy', '😵‍💫'],
  ['party', 'Party', '#7B2CFF', 'bounce', face(AMBER, 'happy', 'laugh', ['partyHat', 'confetti', 'cheeks']), 'party celebrate birthday', '🥳', 'firework'],
  ['starstruck', 'Star-struck', '#FFD23A', 'pop', face(AMBER, 'star', 'grin', []), 'star struck amazed wow', '🤩'],
  ['nervous', 'Nervous', '#7FD3FF', 'shake', face(AMBER, 'dot', 'wavy', ['sweat', 'browWorried']), 'nervous awkward yikes', '😅'],
  ['smug', 'Smug', '#FFB82E', 'pop', face(AMBER, 'half', 'smirk', ['blush']), 'smug proud sly', '😏'],
  ['angel', 'Angel', '#FFE680', 'float', face(AMBER, 'happy', 'smile', ['halo', 'cheeks'], { rim: '#FFE680' }), 'angel innocent halo blessed', '😇'],
  ['devil', 'Devil', '#C21E56', 'pop', face('#8A3BE2', 'angry', 'smirk', ['horns', 'browAngry'], { rim: '#FF3D8B' }), 'devil evil mischief', '😈'],
  ['cold', 'Freezing', '#7FF3FF', 'shake', face('#7FD8FF', 'dot', 'teeth', ['frost'], { rim: '#E6FBFF' }), 'cold freezing ice brr', '🥶'],
  ['hot', 'Overheating', '#FF5A1F', 'pulse', face('#FF7A3A', 'half', 'tongue', ['sweat', 'heat'], { rim: '#FFD23A' }), 'hot spicy heat sweating', '🥵'],
  ['sick', 'Queasy', '#7EE07A', 'shake', face('#A7E36A', 'x', 'wavy', ['sweat'], { rim: '#E6FFB0' }), 'sick gross ew nauseous', '🤢'],
  ['nerd', 'Nerd', '#3FB7FF', 'pop', face(AMBER, 'glasses', 'teeth', []), 'nerd smart actually', '🤓'],
  ['dead', 'Dead', '#FFB82E', 'rain', face(AMBER, 'x', 'tongue', []), 'dead im dead lmao', undefined],
  ['blessed', 'Blessed', '#FFE680', 'float', face(AMBER, 'closed', 'smile', ['sparkles', 'blush']), 'blessed grateful content', '☺️'],
  // icons
  ['fire', 'Fire', '#FF5A1F', 'beam', fire, 'fire lit hot flame', '🔥', 'storm'],
  ['heart', 'Heart', '#FF1F5A', 'float', heart, 'heart love like', '❤️', 'storm'],
  ['purpleheart', 'Plajah heart', '#B04BFF', 'float', purpleHeart, 'heart love plajah purple', '💜', 'storm'],
  ['sparkleheart', 'Sparkle heart', '#FF4FA3', 'float', sparkleHeart, 'heart sparkle love cute', '💖'],
  ['heartbreak', 'Heartbreak', '#E0154F', 'rain', brokenHeart, 'heartbreak broken sad', '💔'],
  ['hundred', '100', '#FF2A3D', 'pop', hundred, '100 perfect facts', '💯'],
  ['star', 'Star', '#FFC21F', 'spin', star, 'star favorite best', '⭐'],
  ['sparkles', 'Sparkles', '#FFD23A', 'pop', sparkles, 'sparkles magic shine', '✨'],
  ['bolt', 'Lightning', '#FFD000', 'beam', bolt, 'lightning bolt power energy', '⚡', 'storm'],
  ['crown', 'Crown', '#FFC21F', 'pop', crown, 'crown king queen royalty', '👑'],
  ['trophy', 'Trophy', '#FFC21F', 'stomp', trophy, 'trophy win champion', '🏆'],
  ['gem', 'Gem', '#16D6F0', 'spin', gem, 'gem diamond precious', '💎'],
  ['rocket', 'Rocket', '#FF8A1F', 'beam', rocket, 'rocket launch moon hype', '🚀', 'firework'],
  ['music', 'Music', '#B04BFF', 'float', note, 'music note song vibe', '🎵'],
  ['eyes', 'Eyes', '#FFFFFF', 'pop', eyes, 'eyes looking watching', '👀'],
  ['skull', 'Skull', '#B04BFF', 'shake', skull, 'skull dead im dead', '💀'],
  ['ghost', 'Ghost', '#CFC4FF', 'orbit', ghost, 'ghost boo spooky', '👻'],
  ['rose', 'Rose', '#E01748', 'rain', rose, 'rose flower bravo love', '🌹'],
  ['gift', 'Gift', '#8A2BE2', 'bounce', gift, 'gift present', '🎁'],
  ['popper', 'Party popper', '#FF3D8B', 'pop', popper, 'party popper celebrate confetti', '🎉', 'firework'],
  ['yes', 'Yes', '#22C55E', 'pop', check, 'yes check correct agree', '✅'],
  ['no', 'No', '#EF2D4A', 'shake', cross, 'no wrong cross disagree', '❌'],
  ['huh', 'Huh', '#3FB7FF', 'pop', question, 'question huh what confused', '❓'],
  ['bang', 'Whoa', '#FF2A3D', 'shake', bang, 'exclamation whoa wow', '‼️'],
  // chat-speak
  ['gg', 'GG', '#3FE6FF', 'stomp', word('GG', '#3FE6FF', '#B04BFF', 68, { glow: '#3FE6FF' }), 'gg good game'],
  ['w', 'W', '#22C55E', 'stomp', word('W', '#4ADE80', '#FFE680', 96), 'w win dub', undefined, 'wall'],
  ['l', 'L', '#EF2D4A', 'rain', word('L', '#FF4A5E', '#3FE6FF', 96), 'l loss'],
  ['hype', 'HYPE', '#FF3D8B', 'shake', word('HYPE', '#FF3D8B', '#FFD23A', 40, { rotate: -10, glow: '#FF3D8B' }), 'hype lets go hyped', undefined, 'wall'],
  ['omg', 'OMG', '#FFC21F', 'shake', word('OMG', '#FFC21F', RIM_MAGENTA, 46, { rotate: -6 }), 'omg wow'],
  ['bruh', 'Bruh', '#9AA3B8', 'pop', word('bruh', '#B9C1D6', '#FF3D8B', 40, { rotate: -4 }), 'bruh really'],
  ['f', 'F', '#7FD3FF', 'rain', word('F', '#7FD3FF', '#B04BFF', 96), 'f respects pay respects'],
  ['plus1', '+1', '#22C55E', 'pop', word('+1', '#4ADE80', '#3FE6FF', 72), 'plus one agree same'],
  ['clip', 'Clip it', '#FF2A3D', 'stomp', word('CLIP IT', '#FF4A5E', '#FFFFFF', 30, { rotate: -8 }), 'clip it record moment highlight'],
  ['letsgo', "Let's go", '#FF8C00', 'beam', word("LET'S GO", '#FF8C00', '#FF3D8B', 28, { rotate: -8, italic: true }), 'lets go hype', undefined, 'wall'],
];

export const CORE_EMOTES: EmoteDef[] = SPECS.map(([code, name, gel, motion, svg, tags, unicode, evolution]) => ({
  id: `core.${code}`, code, name, pack: 'core', gel, motion, tags: tags.split(' '), unicode, evolution,
  art: { kind: 'svg', svg },
}));

