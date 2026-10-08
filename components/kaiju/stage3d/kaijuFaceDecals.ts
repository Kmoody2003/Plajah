// kaijuFaceDecals — the 3D kaiju's FACE RIG brain (pure; no three.js, no DOM).
//
// The v2 3D characters have a blank white face mask. Their eyes, brows, mouth and little extras (blush, tears,
// sweat, hearts…) are decals: quads hugging the mask, each drawing one CELL of a sprite atlas (public/models/
// mascots/v2/face/*). This module decides, every frame, which cell each slot shows and how it is nudged
// (blink squash, gaze slide, brow lift/tilt, mouth open scale) — from either of the two things that can drive
// a face here:
//   • music acting     : EmotionOut (stage3d/kaijuFace.ts EmotionDirector → a named Expr)
//   • a person on camera: the continuous Pose produced by services/vtuber/kaijuFaceMap.ts
// so every expression a webcam sees, and every expression the music chooses, lands on the same decals.

import type { Pose } from '../kaijuPose';
import type { EmotionOut, Expr } from './kaijuFace';

export type EyeState = 'open' | 'half' | 'closed' | 'wide' | 'squint' | 'happy' | 'sad' | 'heart' | 'star' | 'look_up_left' | 'spiral' | 'sleepy';
export type BrowState = 'angry' | 'flat' | 'raised' | 'sad' | 'worried' | 'skeptic' | 'furrowed' | 'thin' | 'surprised' | 'villain' | 'soft' | 'wavy';
export type MouthState = 'rest_frown' | 'smile_small' | 'smile_wide' | 'smirk' | 'sad' | 'flat' | 'viseme_A' | 'viseme_E' | 'viseme_I' | 'viseme_O' | 'viseme_U' | 'viseme_FV' | 'viseme_L' | 'laugh' | 'shout' | 'tongue_out';
export type Extra = 'blush' | 'blush_big' | 'tear' | 'tear_streams' | 'sweat' | 'anger' | 'heart' | 'sparkle' | 'zzz' | 'notes' | 'exclaim' | 'question';

export interface DecalFace {
  eyeL: EyeState; eyeR: EyeState; browL: BrowState; browR: BrowState; mouth: MouthState;
  /** vertical squash of an open-type eye, 1 = fully open … ~0.08 = shut (smooth blinks, winks) */
  openL: number; openR: number;
  /** gaze in −1..1 (slides the eye decal inside the patch) */
  gazeX: number; gazeY: number;
  /** brow lift −1 (raised) … +1 (lowered), per brow, and tilt in radians (+ = angrier) */
  browLiftL: number; browLiftR: number; browTilt: number;
  /** extra scale on the mouth decal's height (voice loudness / jaw open) */
  mouthOpen: number;
  extras: Extra[];
}

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

export function neutralDecalFace(): DecalFace {
  return { eyeL: 'open', eyeR: 'open', browL: 'angry', browR: 'angry', mouth: 'rest_frown', openL: 1, openR: 1, gazeX: 0, gazeY: 0, browLiftL: 0, browLiftR: 0, browTilt: 0, mouthOpen: 1, extras: [] };
}

/** Each named expression → decal states (the music-acting path). */
const EXPR: Record<Expr, { eye: EyeState; brow: BrowState; mouth: MouthState; extras?: Extra[] }> = {
  grumpy: { eye: 'open', brow: 'angry', mouth: 'rest_frown' },
  calm: { eye: 'open', brow: 'soft', mouth: 'smile_small' },
  joy: { eye: 'happy', brow: 'raised', mouth: 'smile_wide', extras: ['blush_big'] },
  excited: { eye: 'wide', brow: 'surprised', mouth: 'laugh', extras: ['blush_big'] },
  surprised: { eye: 'wide', brow: 'surprised', mouth: 'viseme_O' },
  smug: { eye: 'half', brow: 'skeptic', mouth: 'smirk' },
  sleepy: { eye: 'sleepy', brow: 'soft', mouth: 'viseme_O' },
  sleep: { eye: 'closed', brow: 'flat', mouth: 'smile_small', extras: ['zzz'] },
  sad: { eye: 'sad', brow: 'sad', mouth: 'sad', extras: ['tear'] },
  love: { eye: 'heart', brow: 'raised', mouth: 'smile_small', extras: ['blush_big', 'heart'] },
  laugh: { eye: 'squint', brow: 'raised', mouth: 'laugh', extras: ['blush_big'] },
  angry: { eye: 'open', brow: 'furrowed', mouth: 'shout', extras: ['anger'] },
  worried: { eye: 'open', brow: 'worried', mouth: 'sad', extras: ['sweat'] },
  sing: { eye: 'open', brow: 'soft', mouth: 'viseme_O' },
  shout: { eye: 'open', brow: 'raised', mouth: 'shout' },
  wink: { eye: 'open', brow: 'raised', mouth: 'smirk' },
};

const OPEN_TYPE: ReadonlySet<EyeState> = new Set(['open', 'half', 'wide', 'sad', 'sleepy', 'look_up_left']);

export function decalsFromExpr(e: EmotionOut, out: DecalFace = neutralDecalFace()): DecalFace {
  const x = EXPR[e.expr];
  out.eyeL = out.eyeR = x.eye; out.browL = out.browR = x.brow;
  out.extras = (x.extras ?? []).slice();
  // singing: the mouth follows the voice envelope through the vowel shapes
  out.mouth = e.expr === 'sing' ? (e.mouth > 0.7 ? 'viseme_A' : e.mouth > 0.38 ? 'viseme_O' : e.mouth > 0.12 ? 'viseme_U' : 'smile_small') : x.mouth;
  out.mouthOpen = 1;
  // blink = a vertical squash of whichever open-type eye is showing
  const sq = OPEN_TYPE.has(x.eye) ? 1 - 0.92 * clamp(e.blink) : 1;
  out.openL = out.openR = sq;
  if (e.expr === 'wink') out.openR = 1 - 0.92;     // the right eye closes, the left stays open
  out.gazeX = e.gazeX; out.gazeY = e.gazeY;
  out.browLiftL = out.browLiftR = -e.browLift * 0.8; out.browTilt = 0;
  return out;
}

/** A continuous tracker Pose (services/vtuber/kaijuFaceMap.ts) → decal states (the webcam / VTuber path). */
export function decalsFromPose(p: Pose, out: DecalFace = neutralDecalFace()): DecalFace {
  const eye = (open: number): EyeState =>
    p.hearts > 0.5 ? 'heart' : p.squint > 0.5 ? 'squint' : p.happy > 0.5 ? 'happy' : open < 0.14 ? 'closed' : p.eyeScale > 1.16 ? 'wide' : p.brow < -0.6 && p.smile < 0 ? 'sad' : open < 0.55 ? 'half' : 'open';
  out.eyeL = eye(p.eyeL * p.eyeOpen); out.eyeR = eye(p.eyeR * p.eyeOpen);
  out.openL = OPEN_TYPE.has(out.eyeL) ? clamp(p.eyeL * p.eyeOpen, 0.08, 1) : 1;
  out.openR = OPEN_TYPE.has(out.eyeR) ? clamp(p.eyeR * p.eyeOpen, 0.08, 1) : 1;
  out.gazeX = p.lookX; out.gazeY = p.lookY;

  const brow: BrowState = p.brow > 0.85 ? 'furrowed' : p.brow > 0.45 ? 'angry' : p.eyeScale > 1.12 && p.browY < -0.5 ? 'surprised' : p.brow < -0.8 && p.browY < -0.3 ? 'worried' : p.brow < -0.45 ? 'sad' : p.browY < -0.55 ? (p.eyeScale > 1.12 ? 'surprised' : 'raised') : Math.abs(p.browAsym) > 0.5 ? 'skeptic' : p.browY > 0.5 ? 'flat' : p.brow < -0.15 ? 'soft' : 'angry';
  out.browL = out.browR = brow;
  if (Math.abs(p.browAsym) > 0.5) { out.browL = p.browAsym > 0 ? 'angry' : 'raised'; out.browR = p.browAsym > 0 ? 'raised' : 'angry'; }
  out.browLiftL = clamp(p.browY + p.browAsym * 0.6, -1, 1); out.browLiftR = clamp(p.browY - p.browAsym * 0.6, -1, 1); out.browTilt = clamp(p.brow, -1, 1) * 0.3;

  // mouth: the dominant shape wins
  const open = p.mouth, wide = p.mouthW;
  out.mouth =
    p.tongue > 0.5 ? 'tongue_out' :
    open > 0.72 && p.brow > 0.35 ? 'shout' :
    open > 0.4 && p.smile > 0.55 ? 'laugh' :
    open > 0.5 ? 'viseme_A' :
    open > 0.22 ? (wide < 0.3 ? 'viseme_O' : wide > 0.72 ? 'viseme_E' : 'viseme_A') :
    open > 0.1 ? (wide < 0.3 ? 'viseme_U' : wide > 0.6 ? 'viseme_I' : 'viseme_O') :
    p.smile > 0.65 ? 'smile_wide' : p.smile > 0.25 ? 'smile_small' : p.smile < -0.75 ? 'sad' : p.smile < -0.45 ? 'rest_frown' : 'flat';
  out.mouthOpen = open > 0.1 ? clamp(0.7 + open * 0.6, 0.7, 1.3) : 1;

  const ex: Extra[] = [];
  if (p.blush > 0.7) ex.push('blush_big'); else if (p.blush > 0.35) ex.push('blush');
  if (p.tear > 0.5) ex.push('tear'); if (p.sweat > 0.5) ex.push('sweat'); if (p.hearts > 0.5) ex.push('heart');
  out.extras = ex;
  return out;
}

/** Atlas cell lookup. `states` come from the atlas JSON written by scripts/decals/buildFaceAtlas.py. */
export interface AtlasInfo { cols: number; rows: number; cell: number; states: { name: string; col: number; row: number; size: [number, number] }[] }
export function atlasUV(a: AtlasInfo, name: string): { offset: [number, number]; repeat: [number, number]; size: [number, number] } | null {
  const s = a.states.find(x => x.name === name); if (!s) return null;
  return { offset: [s.col / a.cols, 1 - (s.row + 1) / a.rows], repeat: [1 / a.cols, 1 / a.rows], size: s.size };
}
