// fluxDirector — the beat-cut camera director for the Flux scenes (the Deco Morph scene has its own).
//
// Cuts on the beat between shot types built around each scene's own orbital framing (target,
// radius, yaw, pitch, fov): a slow base drift, push-ins, tight angled close-ups, orbits, crane moves,
// snap zooms and dutch angles. Shot length is 2–16 beats, shorter when the music is intense; a drop
// (fast energy jumping over the long-term level) forces a cut. Kicks punch the lens, snares jolt the
// roll. Scenes that were composed as fixed shots (cam.lock) get the GENTLE variant: the same cuts
// with smaller moves, so a tunnel still looks down its tunnel and a wall stays a wall.
// Deterministic from the driven audio and clip time, so offline renders match the live monitor.
import type { FluxDriven } from '../../../../services/fabula/fluxNode';

export interface FluxShot { yaw: number; pitch: number; radiusMul: number; fovMul: number; roll: number; tx: number; ty: number }

const KINDS = ['base', 'push', 'tight', 'orbit', 'crane', 'snap', 'dutch'] as const;
const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export class FluxDirector {
  private lastT = -1; private clock = 0; private start = 0; private n = 0; private len = 8; private seed = 0.5;
  private kind: (typeof KINDS)[number] = 'base';
  private eF = 0; private eS = 0; private lastDrop = -99; private jolt = 0; private prevSnare = 0;
  private readonly shot: FluxShot = { yaw: 0, pitch: 0, radiusMul: 1, fovMul: 1, roll: 0, tx: 0, ty: 0 };

  update(a: FluxDriven, t: number, gentle: boolean): FluxShot {
    if (this.lastT < 0 || t < this.lastT || t - this.lastT > 2) { this.clock = 0; this.start = 0; this.n = 0; this.eF = this.eS = 0; this.lastDrop = -99; this.jolt = 0; }
    const dt = this.lastT < 0 ? 1 / 60 : Math.min(0.2, Math.max(0, t - this.lastT));
    this.lastT = t;
    const energy = Math.min(1, a.intensity ?? a.energy ?? 0);
    this.clock += dt * (0.8 + energy * 0.6);
    const beats = (a.tempoConfidence ?? 0) > 0.3 && Number.isFinite(a.beatPosition) ? (a.beatPosition as number) : this.clock * 2;
    const k1 = (tau: number) => 1 - Math.exp(-dt / tau);
    this.eF += (energy - this.eF) * k1(0.35); this.eS += (energy - this.eS) * k1(8);
    const drop = this.eF - this.eS > 0.25 && beats - this.lastDrop > 16;
    if (drop) this.lastDrop = beats;

    if (drop || beats - this.start >= this.len || beats < this.start) {
      this.start = Math.floor(beats); this.n++;
      const e = this.eF;
      const lens = e > 0.55 ? [2, 2, 4, 4, 8] : e > 0.3 ? [2, 4, 4, 8, 8, 16] : [4, 8, 8, 16];
      this.len = lens[Math.floor(hash(this.n * 5.17) * lens.length)];
      this.kind = drop ? (hash(t) > 0.5 ? 'snap' : 'push') : KINDS[Math.floor(hash(this.n * 2.31) * KINDS.length)];
      this.seed = hash(this.n * 9.13);
    }
    const u = Math.min(1, Math.max(0, (beats - this.start) / this.len)), ease = u * u * (3 - 2 * u);
    const side = this.seed > 0.5 ? 1 : -1, g = gentle ? 0.35 : 1;
    const s = this.shot;
    s.yaw = 0; s.pitch = 0; s.radiusMul = 1; s.fovMul = 1; s.roll = 0; s.tx = 0; s.ty = 0;
    switch (this.kind) {
      case 'base': s.radiusMul = 1 - 0.08 * u * g; s.yaw = side * 6 * u * g; break;
      case 'push': s.radiusMul = 1 - 0.5 * ease * (gentle ? 0.6 : 1); break;
      case 'tight':
        s.radiusMul = gentle ? 0.7 : 0.45; s.yaw = side * (25 + 10 * u) * g; s.pitch = hash(this.seed * 7) * 16 * g;   // tilts only up: going under a landscape scene reads as a black screen
        s.tx = (hash(this.seed * 3) - 0.5) * 0.3 * g; s.ty = (hash(this.seed * 11) - 0.5) * 0.2 * g;
        s.fovMul = 0.85; s.roll = (hash(this.seed * 13) - 0.5) * 0.35 * g; break;
      case 'orbit': s.yaw = side * (15 + 55 * ease) * g; s.radiusMul = 0.9; break;
      case 'crane': s.pitch = (side > 0 ? u : 1 - u) * 34 * g; s.radiusMul = 0.8; s.tx = (u - 0.5) * 0.25 * side * g; break;
      case 'snap': { const z = 1 - Math.pow(1 - Math.min(1, u * 4), 3); s.fovMul = side > 0 ? 1 - 0.45 * z : 0.55 + 0.45 * z; break; }
      case 'dutch': s.roll = side * 0.3 * (gentle ? 0.6 : 1); s.radiusMul = 0.85; break;
    }
    const snare = a.snare ?? 0;
    if (snare > 0.45 && this.prevSnare <= 0.45) this.jolt += (hash(t * 5.3) - 0.5) * 0.3 * g;
    this.prevSnare = snare;
    this.jolt *= Math.exp(-dt / 0.25);
    s.roll += this.jolt;
    s.fovMul *= 1 - (a.kick ?? 0) * 0.08;
    return s;
  }
}
