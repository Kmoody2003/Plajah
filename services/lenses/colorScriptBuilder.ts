// colorScriptBuilder — works a film's colour script out from what the film itself says, before it plays.
//
//   • Dialogue: subtitles are scanned for colour mentions ("that red dress", "the green door", "her blonde
//     hair") and each is tied to what it describes — a costume, a set material, a character's hair — and
//     to the moment it was said. A costume line colours the person on screen around that line; a set line
//     colours that material for the scene; repeated set mentions become film-wide.
//   • Every decision keeps its evidence (the quoted line and its timecode) so a viewer or editor can see
//     why the curtains turned green, and later passes (shot detection, the desktop vision model, cast
//     records) can confirm, refine or overrule it.
//
// Rules-only and deterministic: no model, nothing leaves the machine.
import type { ColorScript, ColorShot, HC, MaterialName, ShotPerson } from './colorScript';

export interface Cue { t0: number; t1: number; text: string }

/** SRT or WebVTT → cues (seconds). Tolerant of BOMs, styling tags and missing indices. */
export function parseSubtitles(src: string): Cue[] {
  const out: Cue[] = [];
  const ts = (s: string) => {
    const m = s.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
    return m ? (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000 : NaN;
  };
  for (const block of src.replace(/^﻿/, '').replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const at = lines.findIndex(l => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->');
    const t0 = ts(a), t1 = ts(b);
    const text = lines.slice(at + 1).join(' ').replace(/<[^>]+>|\{[^}]+\}/g, '').replace(/\s+/g, ' ').trim();
    if (Number.isFinite(t0) && Number.isFinite(t1) && text) out.push({ t0, t1, text });
  }
  return out;
}

// ── colour words, as the colour they usually name (sRGB), converted to Oklab hue/chroma ──
const COLOUR_HEX: Record<string, string> = {
  red: 'b3262e', scarlet: 'c8231c', crimson: 'a4142f', ruby: '9b1b30', cherry: 'a5182a', maroon: '6e1e24', burgundy: '6d2234', wine: '6f2537',
  pink: 'e39bb0', rose: 'd27b8f', coral: 'e8735f', salmon: 'e48c75',
  orange: 'd9692a', amber: 'c98a1e', rust: '9a4a26', copper: 'a8622e',
  yellow: 'e2c44a', gold: 'c9a43c', golden: 'c9a43c', mustard: 'b8962e', lemon: 'e6d65a',
  green: '3f7d43', emerald: '1f7a55', olive: '6b6b33', jade: '3a8a6e', lime: '8fbf3f', 'bottle green': '1f4d33',
  blue: '2f5fa8', navy: '1f2d55', azure: '4a8ad1', sapphire: '23418c', turquoise: '3aa6a0', teal: '2c7a7a', 'sky blue': '7fb1dc', 'royal blue': '2a4fb0',
  purple: '5e3a87', violet: '6a4a9a', lavender: 'a996c8', lilac: 'b69ac9', plum: '673a5c', mauve: '9c7a95',
  brown: '6b4a32', tan: 'b08a63', beige: 'cbb79a', khaki: 'a6986a', chocolate: '4e3122', chestnut: '7a3e26', tawny: '9a6a3a',
  white: 'ece8de', ivory: 'eee6cf', cream: 'e9dfc3', black: '1c1b1d', grey: '7c7b78', gray: '7c7b78', silver: 'a9aaad', charcoal: '3a3b3d',
};
const HAIR_HEX: Record<string, string> = {
  blonde: 'c7a669', blond: 'c7a669', 'platinum': 'ddd3bd', redhead: '8f3f22', auburn: '7a3524', ginger: '9c4a22', brunette: '4a3122',
  'dark hair': '2e231c', 'black hair': '1f1a17', 'grey hair': '8a8782', 'gray hair': '8a8782', 'white hair': 'd9d6cf', 'red hair': '8f3f22', 'brown hair': '553a26',
};
function hexToHC(hex: string): HC {
  const v = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = v;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return [((Math.atan2(B, A) * 180) / Math.PI + 360) % 360, Math.hypot(A, B)];
}

type Target = { kind: 'top' | 'bottom' | 'dress' } | { kind: 'material'; mat: MaterialName };
const NOUNS: [RegExp, Target][] = [
  [/\b(dress|gown|frock)\b/, { kind: 'dress' }],
  [/\b(skirt|trousers|pants|slacks|breeches)\b/, { kind: 'bottom' }],
  [/\b(coat|jacket|suit|shirt|blouse|sweater|jumper|vest|waistcoat|uniform|robe|cloak|cape|tie|scarf|shawl|blazer|tunic|tuxedo|overcoat)\b/, { kind: 'top' }],
  [/\b(curtains?|drapes|sofa|couch|cushions?|upholstery|velvet|bedspread|blanket)\b/, { kind: 'material', mat: 'fabric' }],
  [/\b(doors?|table|desk|cabinet|chair|panell?ing|staircase|bannister)\b/, { kind: 'material', mat: 'wood' }],
  [/\b(walls?|ceiling|wallpaper|room|parlou?r|hall)\b/, { kind: 'material', mat: 'plaster' }],
  [/\b(carpet|rug|floor)\b/, { kind: 'material', mat: 'floor' }],
  [/\b(car|automobile|sedan|cab|taxi|truck|roadster|limousine|motorcar)\b/, { kind: 'material', mat: 'metal' }],
  [/\b(roses?|flowers?|tulips?|violets?|lilies|daisies|bouquet)\b/, { kind: 'material', mat: 'flower' }],
  [/\b(house|mansion|cottage|building|barn|church|castle)\b/, { kind: 'material', mat: 'building' }],
  [/\b(sky|skies)\b/, { kind: 'material', mat: 'sky' }],
  [/\b(sea|ocean|lake|river|water|pool)\b/, { kind: 'material', mat: 'water' }],
  [/\b(grass|lawn|meadow|field)\b/, { kind: 'material', mat: 'grass' }],
  [/\b(trees?|leaves|forest|woods|hedge|garden)\b/, { kind: 'material', mat: 'foliage' }],
  [/\b(lamp|light|lantern|candles?)\b/, { kind: 'material', mat: 'light' }],
];

export interface Mention { t: number; phrase: string; colour: string; hc: HC; target: Target | { kind: 'hair' } }

const COLOUR_RE = new RegExp(`\\b(${Object.keys(COLOUR_HEX).sort((a, b) => b.length - a.length).join('|')})\\b`, 'g');
const HAIR_RE = new RegExp(`\\b(${Object.keys(HAIR_HEX).sort((a, b) => b.length - a.length).join('|')})\\b`, 'g');
const NEGATED = /\b(not|never|no|isn'?t|wasn'?t|without)\b/;
const IDIOMS = /\b(black and white|red herring|red[- ]handed|blue moon|in the black|in the red|out of the blue|green with envy|white lie|black market|yellow streak|golden (age|rule|opportunity)|silver lining|feeling blue|grey area|gray area)\b/;

/** Colour mentions tied to what they describe: "red" + the nearest costume/set noun within a few words. */
export function colourMentions(cues: Cue[]): Mention[] {
  const out: Mention[] = [];
  for (const c of cues) {
    const text = c.text.toLowerCase();
    if (IDIOMS.test(text)) continue;
    for (const m of text.matchAll(HAIR_RE)) out.push({ t: (c.t0 + c.t1) / 2, phrase: c.text, colour: m[1], hc: hexToHC(HAIR_HEX[m[1]]), target: { kind: 'hair' } });
    for (const m of text.matchAll(COLOUR_RE)) {
      const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 32);   // "red velvet curtains"
      const before = text.slice(Math.max(0, m.index! - 40), m.index!);                // "the curtains are red"
      if (NEGATED.test(before.slice(-14))) continue;
      if (/^\s*hair\b/.test(after)) continue;                                          // handled by HAIR_RE
      let target: Target | null = null;
      for (const [re, t] of NOUNS) if (re.test(after.split(/[.,;!?]/)[0])) { target = t; break; }
      if (!target) for (const [re, t] of NOUNS) if (re.test(before.split(/[.,;!?]/).pop() || '')) { target = t; break; }
      if (target) out.push({ t: (c.t0 + c.t1) / 2, phrase: c.text, colour: m[1], hc: hexToHC(COLOUR_HEX[m[1]]), target });
    }
  }
  return out;
}

const fmt = (t: number) => `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * Fold the mentions into a colour script. `shots` (seconds) are the detected shot boundaries when known;
 * otherwise each mention gets a window around the line (costumes −5 s … +40 s, sets −10 s … +90 s).
 */
export function scriptFromDialogue(base: ColorScript, cues: Cue[], shots?: { t0: number; t1: number }[]): ColorScript {
  const ms = colourMentions(cues);
  const script: ColorScript = { ...base, shots: [...(base.shots || [])] };
  const setCount: Partial<Record<MaterialName, Map<string, number>>> = {};
  for (const m of ms) {
    const ev = `subtitle ${fmt(m.t)} "${m.phrase}"`;
    const isCostume = m.target.kind === 'top' || m.target.kind === 'bottom' || m.target.kind === 'dress' || m.target.kind === 'hair';
    const span = shots?.length
      ? (() => { const i = shots.findIndex(s => m.t >= s.t0 && m.t < s.t1); return i >= 0 ? { t0: shots[i].t0, t1: shots[Math.min(shots.length - 1, i + (isCostume ? 3 : 8))].t1 } : null; })()
      : { t0: Math.max(0, m.t - (isCostume ? 5 : 10)), t1: m.t + (isCostume ? 40 : 90) };
    if (!span) continue;
    const shot: ColorShot = { t0: span.t0, t1: span.t1, evidence: [ev] };
    if (m.target.kind === 'material') {
      shot.materials = { [m.target.mat]: m.hc };
      const tally = (setCount[m.target.mat] ||= new Map()); tally.set(m.colour, (tally.get(m.colour) || 0) + 1);
    } else if (m.target.kind === 'hair') {
      continue;                                                      // hair belongs to a cast member (cast pass), not a shot
    } else {
      const p: ShotPerson = {};
      if (m.target.kind !== 'bottom') p.top = m.hc;
      if (m.target.kind !== 'top') p.bottom = m.hc;
      shot.people = [p];
    }
    script.shots!.push(shot);
  }
  // a set colour named twice or more becomes the film's own (the house's walls are the house's walls)
  for (const [mat, tally] of Object.entries(setCount)) {
    const best = [...tally!.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2) script.materials = { ...script.materials, [mat]: hexToHC(COLOUR_HEX[best[0]]) };
  }
  script.shots = mergeShots(script.shots!);
  return script;
}

/** Non-overlapping, time-sorted shots: later evidence wins inside an overlap, earlier evidence is kept. */
function mergeShots(shots: ColorShot[]): ColorShot[] {
  const cuts = [...new Set(shots.flatMap(s => [s.t0, s.t1]))].sort((a, b) => a - b);
  const out: ColorShot[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1];
    const live = shots.filter(s => s.t0 <= a && s.t1 >= b);
    if (!live.length) continue;
    const merged: ColorShot = { t0: a, t1: b, evidence: [] };
    for (const s of live) {
      if (s.materials) merged.materials = { ...merged.materials, ...s.materials };
      if (s.people) {                                                 // story says who, dialogue says what they wear
        const prev = merged.people || [];
        merged.people = Array.from({ length: Math.max(prev.length, s.people.length) }, (_, k) => ({ ...prev[k], ...s.people![k] }));
      }
      merged.evidence!.push(...(s.evidence || []));
    }
    const prev = out[out.length - 1];
    if (prev && prev.t1 === a && JSON.stringify([prev.materials, prev.people]) === JSON.stringify([merged.materials, merged.people])) prev.t1 = b;
    else out.push(merged);
  }
  return out;
}

export { hexToHC };
