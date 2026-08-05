// engine/timeline/parser.ts — rule-based natural-language → ParamDiff.
// Zero-dependency, instant, fully offline. This is the always-available
// fallback. For richer phrasing, LocalLLM (./llm/localLLM.ts) returns the
// same ParamDiff shape and can replace this transparently.

import { ParamDiff, InstructionParser } from './types';
import { PALETTE_NAMES } from '../params';

const SCENE_KEYWORDS: Record<string, string[]> = {
  aurora: ['aurora', 'calm', 'tranquil', 'peaceful', 'ambient', 'chill', 'soft', 'gentle', 'dream'],
  chrome: ['chrome', 'liquid', 'metal', 'molten', 'blob', 'mercury'],
  bauhaus: ['bauhaus', 'flat', 'geometric', 'shapes', 'pop', 'graphic', 'clean'],
  nebula: ['nebula', 'space', 'star', 'cosmic', 'galaxy', 'particle'],
  gravity: ['gravity', 'physics', 'orbs', 'bounce', 'collide', 'planet'],
  kinetic: ['kinetic', 'kaleido', 'mirror', 'spin', 'energetic', 'frantic', 'rave'],
  ripple: ['ripple', 'wave', 'interference', 'sonar'],
  plasma: ['plasma', 'fluid', 'flow', 'melt', 'warp', 'lava', 'smoke'],
  raymarch: ['raymarch', 'tunnel', 'depth', 'infinite', '3d'],
};
const PALETTE_KEYWORDS: Record<number, string[]> = {
  0: ['violet', 'purple', 'neon', 'magenta'],
  1: ['synth', 'pink', 'teal', 'vapor'],
  2: ['sunset', 'orange', 'heat', 'fire', 'warm', 'red'],
  3: ['ocean', 'blue', 'deep', 'sea', 'cool', 'water'],
  4: ['amethyst', 'lavender', 'plum'],
  5: ['mono', 'grey', 'gray', 'minimal', 'white', 'black'],
};

export function parseInstruction(text: string): ParamDiff {
  const s = ' ' + text.toLowerCase() + ' ';
  const diff: ParamDiff = { set: {}, mul: {}, scene: null, palette: null, label: text.trim() };

  for (const [sc, kws] of Object.entries(SCENE_KEYWORDS)) {
    if (kws.some(k => s.includes(k))) { diff.scene = sc; break; }
  }
  for (const [pi, kws] of Object.entries(PALETTE_KEYWORDS)) {
    if (kws.some(k => s.includes(k))) { diff.palette = +pi; break; }
  }
  if (/\b(drop|hard|intense|bang|peak|climax|go off|full)\b/.test(s)) { diff.set.speed = 2.2; diff.set.glow = 1.7; diff.set.sens = 1.9; if (!diff.scene) diff.scene = 'kinetic'; }
  if (/\b(build|rising|tension|grow)\b/.test(s)) { diff.set.speed = 1.5; diff.set.glow = 1.3; }
  if (/\b(calm|tranquil|peaceful|chill|relax|breakdown|quiet|soft|ambient)\b/.test(s)) { diff.set.speed = 0.5; diff.set.glow = 0.85; diff.set.trail = 0.8; if (!diff.scene) diff.scene = 'aurora'; }
  if (/half ?speed|slow(er)?|slow down/.test(s)) diff.set.speed = 0.5;
  if (/double ?speed|fast(er)?|speed up/.test(s)) diff.set.speed = 2.0;
  const sp = s.match(/speed (?:to |at )?([\d.]+)x?/); if (sp) diff.set.speed = Math.max(0.1, Math.min(3, +sp[1]));
  if (/glow up|bright(er)?|bloom|shine/.test(s)) diff.set.glow = 1.6;
  if (/dark(er)?|dim|fade/.test(s)) diff.set.glow = 0.5;
  if (/trail|smear|ghost|long exposure/.test(s)) diff.set.trail = 0.85;
  if (/sharp|crisp|no trail|clean/.test(s)) diff.set.trail = 0.05;
  if (/mirror|kaleido|symmetr/.test(s)) diff.set.mirror = true;
  if (/punch|react(ive)? (more|harder)|sensitive/.test(s)) diff.set.sens = 2.2;
  return diff;
}

export function describeDiff(d: ParamDiff): string {
  const parts: string[] = [];
  if (d.scene) parts.push('scene→' + d.scene);
  if (d.palette != null) parts.push('palette→' + PALETTE_NAMES[d.palette]);
  Object.entries(d.set).forEach(([k, v]) => parts.push(k + '=' + (typeof v === 'number' ? v.toFixed(2) : v)));
  return parts.length ? parts.join('  ') : 'no change detected — try a color, mood, or scene';
}

export class RuleParser implements InstructionParser {
  parse(text: string): ParamDiff { return parseInstruction(text); }
}
