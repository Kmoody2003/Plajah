// emotion — a playful, ESTIMATED emotional state from the 52 face blendshapes (not a diagnosis, not
// a measurement of anything real: it's a heuristic that maps expressions to aura colours for fun).
//
// ARKit-style blendshape names come straight from MediaPipe FaceLandmarker. Each emotion is a weighted
// sum of the expressions that usually signal it, then competing emotions suppress each other a little so
// a big smile doesn't also read as surprise just because the jaw dropped.

export type EmotionId = 'joy' | 'calm' | 'sad' | 'anger' | 'surprise';
type RGB = [number, number, number];

export const EMOTIONS: Record<EmotionId, { label: string; icon: string; a: RGB; b: RGB }> = {
  joy:      { label: 'Joyful',    icon: '😊', a: [1.0, 0.82, 0.22], b: [1.0, 0.36, 0.72] },   // gold → pink
  calm:     { label: 'Serene',    icon: '😌', a: [0.48, 0.36, 1.0], b: [0.18, 0.9, 0.84] },    // violet → teal
  sad:      { label: 'Blue',      icon: '😢', a: [0.24, 0.45, 1.0], b: [0.14, 0.14, 0.55] },   // blue → indigo
  anger:    { label: 'Fired up',  icon: '😠', a: [1.0, 0.16, 0.12], b: [1.0, 0.55, 0.0] },     // red → orange
  surprise: { label: 'Amazed',    icon: '😮', a: [0.0, 0.9, 1.0], b: [0.95, 0.98, 1.0] },      // cyan → white
};
export const EMOTION_IDS = Object.keys(EMOTIONS) as EmotionId[];

const avg = (bs: Record<string, number>, a: string, b: string) => ((bs[a] ?? 0) + (bs[b] ?? 0)) / 2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Raw 0..1 scores for one frame of blendshapes. */
export function scoreEmotions(bs: Record<string, number>): Record<EmotionId, number> {
  const smile = avg(bs, 'mouthSmileLeft', 'mouthSmileRight');
  const cheek = avg(bs, 'cheekSquintLeft', 'cheekSquintRight');
  const wide = avg(bs, 'eyeWideLeft', 'eyeWideRight');
  const browDown = avg(bs, 'browDownLeft', 'browDownRight');
  const sneer = avg(bs, 'noseSneerLeft', 'noseSneerRight');
  const squint = avg(bs, 'eyeSquintLeft', 'eyeSquintRight');
  const frown = avg(bs, 'mouthFrownLeft', 'mouthFrownRight');
  const press = avg(bs, 'mouthPressLeft', 'mouthPressRight');
  const innerUp = bs.browInnerUp ?? 0, outerUp = avg(bs, 'browOuterUpLeft', 'browOuterUpRight');
  const jaw = bs.jawOpen ?? 0;

  const joy = clamp01(smile * 1.7 + cheek * 0.5);
  const surprise = clamp01(wide * 1.8 + innerUp * 0.5 + outerUp * 0.6 + jaw * 0.35 - joy * 0.6);
  const anger = clamp01(browDown * 2.1 + sneer * 1.2 + press * 0.5 + squint * 0.3 - joy * 0.8);
  const sad = clamp01(frown * 2.3 + innerUp * 0.7 - wide * 0.8 - joy * 0.9);
  const calm = clamp01(1 - Math.max(joy, surprise, anger, sad) * 1.7) * 0.9;
  return { joy, calm, sad, anger, surprise };
}

export interface AuraState {
  scores: Record<EmotionId, number>;
  dominant: EmotionId;
  /** How strongly the dominant non-calm emotion is showing (0 = placid). */
  intensity: number;
  a: RGB; b: RGB;
}

/** Eases per-frame scores into a calm, readable state — an aura that flickered with every blink would be noise. */
export class EmotionSmoother {
  private s: Record<EmotionId, number> = { joy: 0, calm: 1, sad: 0, anger: 0, surprise: 0 };
  /** `null` = no face this frame: drift back to calm. */
  push(next: Record<EmotionId, number> | null, dt: number) {
    const target = next ?? { joy: 0, calm: 1, sad: 0, anger: 0, surprise: 0 };
    const k = 1 - Math.exp(-dt * 3.2);
    for (const id of EMOTION_IDS) this.s[id] += (target[id] - this.s[id]) * k;
  }
  get(): AuraState {
    let dominant: EmotionId = 'calm', best = -1, wsum = 0;
    const w: Record<string, number> = {};
    for (const id of EMOTION_IDS) {
      const v = this.s[id];
      if (v > best) { best = v; dominant = id; }
      w[id] = Math.pow(v, 1.6) + 1e-4; wsum += w[id];
    }
    const a: RGB = [0, 0, 0], b: RGB = [0, 0, 0];
    for (const id of EMOTION_IDS) {
      const k = w[id] / wsum, e = EMOTIONS[id];
      for (let i = 0; i < 3; i++) { a[i] += e.a[i] * k; b[i] += e.b[i] * k; }
    }
    const intensity = Math.max(this.s.joy, this.s.sad, this.s.anger, this.s.surprise);
    return { scores: { ...this.s }, dominant, intensity, a, b };
  }
}
