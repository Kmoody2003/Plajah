// kaijuExpression2D — maps an Expr (from the shared EmotionDirector) onto the 2D puppet's Pose channels.
//
// The sheet's default face is the grumpy wedge-browed one; every other expression is "acting" on top of
// it: wide eyes + raised brows for surprise, hearts for love, a squint + big laugh, a tear and worried
// brows for sad, a sweat drop for nerves, half-lids for smug / sleepy. Blinks squash the open eye quickly.

import type { Pose } from '../kaijuPose';
import type { EmotionOut, Expr } from '../stage3d/kaijuFace';

type Face = Partial<Pose>;
export const FACE_2D: Record<Expr, Face> = {
  grumpy:    { eyeOpen: 1, smile: -0.4, mouth: 0, brow: 0, browY: 0, blush: 0.25 },
  calm:      { eyeOpen: 0.88, smile: 0.4, mouth: 0, brow: -0.55, browY: 0.1, blush: 0.4 },
  joy:       { happy: 1, smile: 0.9, mouth: 0.2, mouthW: 0.8, brow: -0.6, browY: -0.4, blush: 0.85 },
  excited:   { eyeScale: 1.2, smile: 0.95, mouth: 0.75, mouthW: 0.9, brow: -0.7, browY: -0.8, blush: 0.8 },
  surprised: { eyeScale: 1.28, smile: 0, mouth: 0.6, mouthW: 0.15, brow: -0.9, browY: -1, blush: 0.2 },
  smug:      { eyeOpen: 0.5, smile: 0.8, mouth: 0, brow: 0.3, browY: -0.2, blush: 0.35 },
  sleepy:    { eyeOpen: 0.3, smile: 0.1, mouth: 0.18, mouthW: 0.2, brow: -0.4, browY: 0.5, blush: 0.4 },
  sleep:     { closed: 1, smile: 0.35, mouth: 0, brow: -0.5, browY: 0.5, blush: 0.5 },
  sad:       { eyeOpen: 0.78, smile: -1, mouth: 0, brow: -1.05, browY: 0.3, blush: 0.1, tear: 1 },
  love:      { hearts: 1, smile: 0.95, mouth: 0.1, brow: -0.5, browY: -0.5, blush: 1 },
  laugh:     { squint: 1, smile: 1, mouth: 0.85, mouthW: 1, brow: -0.6, browY: -0.5, blush: 0.9 },
  angry:     { eyeOpen: 0.82, smile: -1, mouth: 0.5, mouthW: 0.8, brow: 1.15, browY: 0.6, blush: 0.1 },
  worried:   { eyeOpen: 1, smile: -0.7, mouth: 0.08, brow: -0.95, browY: -0.3, blush: 0.2, sweat: 1 },
  sing:      { eyeOpen: 1, smile: 0.2, brow: -0.35, browY: -0.2, blush: 0.5 },
  shout:     { eyeOpen: 0.9, smile: 0, mouth: 0.9, mouthW: 0.9, brow: 0.25, browY: -0.4, blush: 0.4 },
  wink:      { eyeOpen: 0.9, happy: 0.55, smile: 0.85, mouth: 0.05, brow: -0.3, browY: -0.4, blush: 0.7 },
};
const NEUTRAL_EXTRA = { eyeScale: 1, squint: 0, hearts: 0, tear: 0, sweat: 0, happy: 0, closed: 0 };

/**
 * Write an expression onto `target`. When `keepMouth` (the singer's mouth is driven by the voice) the mouth
 * channels are left alone. Blink and gaze from the emotion director are applied last.
 */
export function applyExpression(target: Pose, em: EmotionOut, o: { keepMouth?: boolean; partnerSide?: number } = {}) {
  const f = FACE_2D[em.expr];
  const t = target as { -readonly [K in keyof Pose]: Pose[K] };
  Object.assign(t, NEUTRAL_EXTRA, f);
  if (o.keepMouth) { /* the vocal overlay writes the mouth afterwards */ }
  t.browY += -em.browLift * 0.8;
  t.eyeOpen *= 1 - 0.93 * em.blink;
  t.lookX = clamp(em.gazeX * 0.9 + (o.partnerSide ?? 0) * 0.15, -1, 1); t.lookY = clamp(em.gazeY, -1, 1);
}
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
