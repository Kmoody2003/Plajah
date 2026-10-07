// kaijuDancer — drives a MascotRig (Chora / Reello) as a mocap dancer.
//
// The rig's own clips (idle, cheer, …) stay available; dances are extra actions on the same mixer.
// Face states in the GLB are bone-scale toggles (eye / happy-eye / brow / mouth_*), so here the face is
// driven directly (after the mixer + springs run) from the music: blink, grin on beats, open mouth when
// singing — instead of inheriting whatever face the last body clip had.

import * as THREE from 'three';
import type { MascotRig } from '../../mascots/mascotRuntime';
import { type DanceMeta, type Dances, danceTimeScale } from './kaijuDances';
import { EXPRESSIONS, EmotionDirector, resolveFace, type EmotionInput, type Expr, type Personality } from './kaijuFace';

const FACE_RE = /^(eye|heye|brow|mouth|blush|tear|sweat)/;
const EYE_OPEN = /^(eye_(L|R)|eye_wide_|eye_half_|eye_sad_)/;
export type FaceMode = Expr;

/** Per-bone scale for "shown" and "hidden", learned from the GLB's own clips (never hard-coded). */
export interface FacePresets { shown: Record<string, THREE.Vector3>; hidden: Record<string, THREE.Vector3> }

export function learnFace(clips: THREE.AnimationClip[]): FacePresets {
  const shown: Record<string, THREE.Vector3> = {}, hidden: Record<string, THREE.Vector3> = {};
  for (const c of clips) for (const t of c.tracks) {
    const m = /^(.+)\.scale$/.exec(t.name); if (!m || !FACE_RE.test(m[1])) continue;
    for (let i = 0; i < t.values.length; i += 3) {
      const v = new THREE.Vector3(t.values[i], t.values[i + 1], t.values[i + 2]);
      const hi = shown[m[1]], lo = hidden[m[1]];
      if (!hi || v.lengthSq() > hi.lengthSq()) shown[m[1]] = v.clone();
      if (!lo || v.lengthSq() < lo.lengthSq()) hidden[m[1]] = v.clone();
    }
  }
  return { shown, hidden };
}

export class DancerController {
  readonly rig: MascotRig;
  dances: Dances | null;
  private readonly face: FacePresets;
  /** every face bone this rig has (older GLBs only the basics, newer ones the full expression set) */
  readonly faceBones: Record<string, THREE.Bone> = {};
  private readonly faceRest: Record<string, THREE.Vector3> = {};
  readonly emotion: EmotionDirector;
  private lastExpr: Expr = 'grumpy';
  current: DanceMeta | null = null;
  private action: THREE.AnimationAction | null = null;
  private mode: 'idle' | 'dance' | 'cheer' = 'idle';
  private cheerUntil = 0;
  private clock = 0;
  faceMode: FaceMode = 'grumpy';
  /** 0..1 mouth/eyes "open" amount for singing; set by the stage each frame. */
  mouth = 0;
  /** extra yaw the stage may add (facing the partner / camera), radians. */
  readonly head = new THREE.Vector3();

  constructor(rig: MascotRig, clips: THREE.AnimationClip[], dances: Dances | null, who: Personality = 'chora') {
    this.rig = rig; this.dances = dances; this.face = learnFace(clips);
    this.emotion = new EmotionDirector(who, who === 'chora' ? 1 : 7);
    for (const [n, b] of Object.entries(rig.bones)) if (FACE_RE.test(n)) { this.faceBones[n] = b; this.faceRest[n] = b.position.clone(); }
    // parts added after the original clips (eye_wide_L …) are not in any clip: borrow the shown/hidden scale convention of eye_L
    const refShown = this.face.shown.eye_L ?? new THREE.Vector3(1, 1, 1), refHidden = this.face.hidden.eye_L ?? new THREE.Vector3(0.0001, 0.0001, 0.0001);
    for (const n of Object.keys(this.faceBones)) { if (!this.face.shown[n]) this.face.shown[n] = refShown.clone(); if (!this.face.hidden[n]) this.face.hidden[n] = refHidden.clone(); }
    // Keep only the clip we need ticking: stop the rig's default idle; body is ours from here on.
    rig.mixer.stopAllAction();
    this.idle(0);
  }

  /** The rig's own relaxed loop (no music / silence). */
  idle(fade = 0.5) {
    const a = this.rig.actions.idle; if (!a) return;
    this.fadeOutDance(fade);
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    this.mode = 'idle';
  }

  private fadeOutDance(fade: number) {
    for (const [n, a] of Object.entries(this.rig.actions)) if (a.isRunning() || a.getEffectiveWeight() > 0) { if (n !== 'idle' || this.mode !== 'idle') a.fadeOut(fade); }
  }

  dance(meta: DanceMeta, bpm: number, fade = 0.45, startFrac?: number) {
    if (!this.dances) return;
    const clip = this.dances.clip(meta);
    const next = this.rig.mixer.clipAction(clip);
    if (next === this.action && this.mode === 'dance') return;
    for (const a of Object.values(this.rig.actions)) if (a.isRunning()) a.fadeOut(fade);
    if (this.action && this.action !== next) this.action.fadeOut(fade);
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.time = (startFrac ?? Math.random() * 0.6) * Math.max(0.1, meta.duration - 4);
    next.setEffectiveTimeScale(danceTimeScale(meta, bpm)).setEffectiveWeight(1).fadeIn(fade).play();
    this.action = next; this.current = meta; this.mode = 'dance';
  }

  retime(bpm: number) { if (this.action && this.current && this.mode === 'dance') this.action.setEffectiveTimeScale(danceTimeScale(this.current, bpm)); }

  /** One-shot celebration (the rig's `cheer`), then back to whatever dance was playing. */
  cheer(bpm: number) {
    const a = this.rig.actions.cheer; if (!a || this.mode === 'cheer') return;
    const resume = this.current;
    for (const x of Object.values(this.rig.actions)) if (x !== a && x.isRunning()) x.fadeOut(0.15);
    if (this.action) this.action.fadeOut(0.15);
    a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(1).fadeIn(0.15).play();
    this.mode = 'cheer'; this.cheerUntil = this.clock + Math.max(0.6, a.getClip().duration) ;
    this.resumeAfterCheer = () => { a.fadeOut(0.3); if (resume) { this.action = null; this.dance(resume, bpm, 0.3, 0.3); } else this.idle(0.3); };
  }
  private resumeAfterCheer: (() => void) | null = null;

  update(dt: number, inp: Omit<EmotionInput, 'dt' | 't'>) {
    this.clock += dt;
    if (this.mode === 'cheer' && this.clock >= this.cheerUntil && this.resumeAfterCheer) { const f = this.resumeAfterCheer; this.resumeAfterCheer = null; f(); }
    this.rig.update(dt);
    if (this.mode === 'cheer') this.emotion.emote('joy', 0.4);
    this.applyFace(this.emotion.update({ ...inp, dt, t: this.clock }));
  }

  private applyFace(e: ReturnType<EmotionDirector['update']>) {
    this.faceMode = e.expr;
    const has = (b: string) => b in this.faceBones;
    const spec = { ...EXPRESSIONS[e.expr] };
    // singing: the mouth follows the voice (open "o" for soft notes, wide for loud ones, closed between syllables)
    if (e.expr === 'sing') spec.mouth = e.mouth > 0.62 ? 'mouth_shout' : e.mouth > 0.2 ? 'mouth_o' : 'mouth_smile';
    const visible = new Set(resolveFace(spec, has));
    const eyeShown = (n: string) => visible.has(n) && /^(eye|eye_wide|eye_half|eye_sad)_/.test(n) && !/heye|closed|squint|heart/.test(n);
    for (const [n, b] of Object.entries(this.faceBones)) {
      const on = visible.has(n);
      const v = on ? this.face.shown[n] : this.face.hidden[n];
      if (v) b.scale.copy(v);
      const rest = this.faceRest[n];
      if (!rest) continue;
      b.position.copy(rest);
      if (on && eyeShown(n)) {
        // blink = a fast vertical squash of the open eye; gaze = a small slide inside the eye patch
        b.scale.y = v.y * (1 - 0.93 * e.blink);
        b.position.x += e.gazeX * 0.012 * (n.endsWith('_L') ? 1 : 1); b.position.y += e.gazeY * 0.009;
      }
      if (on && n.startsWith('brow')) b.position.y += e.browLift * 0.014;
    }
  }

  dispose() { this.rig.dispose(); }
}
