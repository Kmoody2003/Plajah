// motionKnowledge — the grounded facts the Motion Council reasons on, so its advice is anchored to real
// numbers (frame rates, beat grids, shutter angles, delivery specs, easing) rather than vibes. Mirrors
// services/melos/council/musicKnowledge for the music side.
import type { MotionSpec } from './motionCouncilTypes';

export interface DeliveryTarget {
  id: string;
  label: string;
  fps: number;
  aspect: string;
  colorSpace: string;
  note: string;
}

/** Where the piece is going — each target implies frame rate, aspect, colour space and safe-area rules. */
export const MOTION_DELIVERIES: DeliveryTarget[] = [
  { id: 'broadcast', label: 'Broadcast 1080i', fps: 30, aspect: '16:9', colorSpace: 'Rec.709', note: 'Title-safe 80% / action-safe 90%; interlacing hates thin horizontal moves; legal 16–235.' },
  { id: 'cinema', label: 'Cinema 24p', fps: 24, aspect: '2.39:1', colorSpace: 'DCI-P3', note: '180° shutter is the reference look; fast pans strobe at 24 — slow the move or add blur.' },
  { id: 'web', label: 'Web 60fps', fps: 60, aspect: '16:9', colorSpace: 'sRGB', note: 'Smooth UI/mograph; motion blur optional; keep file lean, motion can be crisp.' },
  { id: 'social-vertical', label: 'Social vertical 9:16', fps: 30, aspect: '9:16', colorSpace: 'sRGB', note: 'Type large and centred; top/bottom eaten by UI chrome; hook in the first second.' },
  { id: 'square', label: 'Social square 1:1', fps: 30, aspect: '1:1', colorSpace: 'sRGB', note: 'Feed-native; centre-weighted composition; readable muted.' },
  { id: 'led-wall', label: 'LED wall', fps: 60, aspect: '16:9', colorSpace: 'high-nit', note: 'High brightness and contrast; avoid full-white flashes; pixel pitch limits fine detail.' },
  { id: 'projection', label: 'Projection', fps: 30, aspect: '16:9', colorSpace: 'low-contrast', note: 'Blacks lift, contrast drops; lean on light not shadow; big shapes read, fine type does not.' },
];

export interface EasingPreset { id: string; label: string; use: string; }
/** The house easing vocabulary — arrivals ease out, exits ease in, mechanical loops stay linear. */
export const EASING_PRESETS: EasingPreset[] = [
  { id: 'ease-out', label: 'Ease out (decelerate)', use: 'Entrances — the element arrives with weight and settles.' },
  { id: 'ease-in', label: 'Ease in (accelerate)', use: 'Exits — the element gathers speed as it leaves.' },
  { id: 'ease-in-out', label: 'Ease in-out', use: 'Moves between two rests; the default for a considered transition.' },
  { id: 'overshoot', label: 'Overshoot / back', use: 'Playful, physical arrivals — a small overshoot then settle.' },
  { id: 'linear', label: 'Linear', use: 'Mechanical motion and seamless loops only — reads as "dead" for anything organic.' },
  { id: 'anticipation', label: 'Anticipation + snap', use: 'Character and impact — pull back before the action, then snap.' },
];

export function deliveryTarget(idOrLabel: string): DeliveryTarget | undefined {
  const q = (idOrLabel || '').toLowerCase();
  return MOTION_DELIVERIES.find(d => d.id === q || d.label.toLowerCase() === q || d.label.toLowerCase().includes(q));
}

/** Beat-grid math: seconds and frames per beat/division at a given tempo and frame rate. */
export function beatGrid(bpm: number, fps: number, division = 4) {
  const secPerBeat = 60 / bpm;
  const secPerStep = secPerBeat / (division / 4); // division=4 → quarter, 8 → eighth, 16 → sixteenth
  return {
    bpm, fps, division,
    secPerBeat,
    framesPerBeat: secPerBeat * fps,
    secPerStep,
    framesPerStep: secPerStep * fps,
  };
}

/** Shutter angle → motion-blur exposure fraction of a frame. 180° = half a frame (the film reference). */
export function shutterBlur(angleDeg: number, fps: number) {
  const exposureSec = (angleDeg / 360) / fps;
  return { angleDeg, fps, exposureSec, fractionOfFrame: angleDeg / 360 };
}

/** A compact grounding block for the model prompt. */
export function knowledgeGrounding(medium?: string, spec?: MotionSpec): string {
  const lines: string[] = [];
  const d = spec?.delivery ? deliveryTarget(spec.delivery) : undefined;
  if (d) lines.push(`Delivery ${d.label}: ${d.fps} fps, ${d.aspect}, ${d.colorSpace}. ${d.note}`);
  if (spec?.tempo && spec?.fps) {
    const g = beatGrid(spec.tempo, spec.fps, 8);
    lines.push(`At ${spec.tempo} BPM / ${spec.fps} fps: 1 beat = ${g.secPerBeat.toFixed(3)}s (${g.framesPerBeat.toFixed(1)} frames); 1/8 step = ${g.framesPerStep.toFixed(1)} frames. Cuts/keys land on the grid.`);
  }
  if (spec?.fps) {
    const s = shutterBlur(180, spec.fps);
    lines.push(`180° shutter at ${spec.fps} fps = ${(s.exposureSec * 1000).toFixed(1)} ms blur (half a frame) — the natural-motion reference.`);
  }
  lines.push('Easing: entrances ease-out, exits ease-in, loops linear; overshoot for playful arrivals, anticipation for impact.');
  if (medium === 'title' || medium === 'lower-third') lines.push('Titles: hold long enough to read twice; respect title-safe 80% on broadcast; kern in motion.');
  if (medium === 'vj-loop' || medium === 'generator' || medium === 'shader') lines.push('Loops/VJ: period must align to a whole number of bars; drive amplitude/colour/light by audio, never position/legibility.');
  return lines.join('\n');
}
