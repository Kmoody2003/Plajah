// imageWorldDirector — a beat-locked film director for the image worlds and plates.
//
//  · Cuts land on the grid: on the bar for long shots, on the beat when the cutting speeds up.
//  · Shot length comes from the section: long holds in intros and breakdowns, phrase-length shots in
//    verses, cuts that halve as a build closes on its drop (8 → 4 → 2 → 1 beat), and a hard cut ON
//    the drop to the council's impact shot.
//  · Movement inside a shot is measured in beats and scaled by the song's energy curve, so the camera
//    sweeps wide when the song is up and settles when it comes down.
//  · Lens dynamics on top: the kick punches the lens, bass wobble throbs and shakes it, the tempo pump
//    breathes it, the snare jolts the roll, a drop shakes the whole rig, a build trembles it.
//  · Plates keep the frame filled at every pose (the picture's edge is never seen).
// Deterministic from the cues (which are deterministic from the audio), like every Flux director.
import type { WorldCues } from './imageWorldAudio';
import type { PlateShot, WorldDirection, WorldShot } from './imageWorldDirection';

export type V3 = [number, number, number];
export interface WorldRig { target: V3; radius: number; extent: number; flyY: number; floorY: number; fov: number;
  /** A route through the world (u 0..1), e.g. down a river: flythroughs ride it instead of crossing the centre. */
  path?: (u: number) => V3;
  /** Share of shots that ride the route (0..1) whatever the section's shot list says. */
  ride?: number;
  /** Shots this world swaps for wides/orbits/cranes (e.g. no macro inside a ribbon field). */
  avoid?: WorldShot[];
  /** No move comes closer to the subject than this. */
  minDist?: number }
export interface PlateRig { radius: number; fov: number; halfW: number; halfH: number }
export interface Pose { pos: V3; target: V3; fov: number; roll: number }
export interface Manual { yaw: number; pitch: number; distance: number }

const D2R = Math.PI / 180;
const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const ease = (u: number) => u * u * (3 - 2 * u);
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sph = (yawDeg: number, pitchDeg: number, d: number): V3 => {
  const y = yawDeg * D2R, p = pitchDeg * D2R, cp = Math.cos(p);
  return [d * cp * Math.sin(y), d * Math.sin(p), d * cp * Math.cos(y)];
};
const noise = (t: number, s: number) => Math.sin(t * 1.7 + s) * 0.5 + Math.sin(t * 3.1 + s * 2.3) * 0.3 + Math.sin(t * 7.3 + s * 4.1) * 0.2;

interface Shot { kind: string; start: number; len: number; seed: number; side: number; n: number }

export class ImageDirector {
  private shot: Shot = { kind: '', start: 0, len: 16, seed: 0.3, side: 1, n: 0 };
  private jolt = 0; private shake = 0; private lastT = -1;
  private lastSection = '';
  /** Which way the Show mode is playing (set by the scene; the director only frames). */
  constructor(private dir: WorldDirection) {}

  setDirection(d: WorldDirection) { this.dir = d; }
  /** Cut on the next frame (e.g. Show mode switched between plate and world). */
  restart() { this.shot = { ...this.shot, kind: '' }; }
  get cutIndex() { return this.shot.n; }
  get shotKind() { return this.shot.kind; }

  /** Beats this shot should last, from the section and how close the drop is. */
  private lengthFor(c: WorldCues): number {
    const cam = this.dir.intensity.camera;
    let beats: number;
    switch (c.section) {
      case 'intro': beats = 32; break;
      case 'breakdown': beats = 32; break;
      case 'outro': beats = 32; break;
      case 'build': {
        if (c.songKnown && Number.isFinite(c.toDrop)) {
          const toDropBeats = c.toDrop / Math.max(0.2, c.beatLen);
          beats = toDropBeats > 16 ? 8 : toDropBeats > 8 ? 4 : toDropBeats > 4 ? 2 : 1;
        } else beats = c.build > 0.85 ? 2 : c.build > 0.6 ? 4 : 8;
        break;
      }
      case 'drop': beats = c.curve > 0.8 ? 4 : 8; break;
      default: beats = c.curve > 0.6 ? 8 : 16;
    }
    if (cam > 1.15 && beats >= 8) beats /= 2; else if (cam < 0.8 && beats <= 16) beats *= 2;
    return beats;
  }

  private cut(c: WorldCues, pool: readonly string[], forceFirst = false) {
    const s = this.shot, n = s.n + 1;
    let kind = forceFirst ? pool[0] : pool[Math.floor(hash(n * 3.17 + c.section.length) * pool.length)];
    if (!forceFirst && kind === s.kind && pool.length > 1) kind = pool[(pool.indexOf(kind) + 1) % pool.length];
    this.shot = { kind, start: Math.floor(c.beat + 1e-3), len: this.lengthFor(c), seed: hash(n * 9.13 + 0.7), side: hash(n * 5.71) > 0.5 ? 1 : -1, n };
  }

  /** Decide cuts for this frame. `pool` is the council's shot list for the current section. */
  private schedule(c: WorldCues, pool: readonly string[]) {
    const s = this.shot, elapsed = c.beat - s.start;
    const sectionChanged = c.section !== this.lastSection; this.lastSection = c.section;
    if (c.dropHit) { this.cut(c, pool, true); return; }                               // hard cut on the drop
    if (!s.kind || elapsed < -1 || elapsed > 256) { this.cut(c, pool); return; }
    if (sectionChanged && (c.section === 'breakdown' || c.section === 'build' || c.section === 'outro') && c.barHit) { this.cut(c, pool); return; }
    if (elapsed >= s.len - 1e-3 && c.beatHit && (s.len < 4 || c.barHit || elapsed >= s.len + 3)) this.cut(c, pool);
  }

  private dynamics(c: WorldCues, pose: Pose, scale: number, react: number): Pose {
    const dt = c.dt;
    if (c.snareHit) this.jolt += (hash(c.t * 3.3) > 0.5 ? 1 : -1) * 0.03 * (0.5 + c.curve) * react;
    this.jolt *= Math.exp(-dt / 0.18);
    if (c.dropHit) this.shake = 1;
    this.shake *= Math.exp(-dt / 0.5);
    const [px, py, pz] = pose.pos, [tx, ty, tz] = pose.target;
    let dx = tx - px, dy = ty - py, dz = tz - pz; const dist = Math.hypot(dx, dy, dz) || 1; dx /= dist; dy /= dist; dz /= dist;
    // kick: a short push toward the subject
    const push = c.kick * 0.03 * dist * react;
    // wobble + drop shake + build tremble: offsets across the view
    const wob = c.wob * c.wobDepth * 0.014 * dist * react;
    const sh = this.shake * 0.05 * dist + c.build * 0.006 * dist + (c.energy > 0.8 ? c.hat * 0.002 * dist : 0);
    const ox = noise(c.t * 22, 1) * sh, oy = noise(c.t * 19, 7) * sh + wob;
    // an approximate "up" and "right" for the offset
    const rx = dz, rz = -dx, rl = Math.hypot(rx, rz) || 1;
    const pos: V3 = [px + dx * push + (rx / rl) * ox * scale, py + dy * push + oy * scale, pz + dz * push + (rz / rl) * ox * scale];
    let fov = pose.fov;
    fov *= 1 - c.kick * 0.045 * react;
    fov *= 1 + c.wob * c.wobDepth * 0.035 * react;
    fov *= 1 - c.pump * 0.012 * c.curve;
    fov *= 1 + this.shake * 0.1;
    return { pos, target: pose.target, fov: clamp(fov, 12, 110), roll: pose.roll + this.jolt };
  }

  private applyManual(p: Pose, m: Manual): Pose {
    if (!m.yaw && !m.pitch && m.distance === 1) return p;
    const v: V3 = [p.pos[0] - p.target[0], p.pos[1] - p.target[1], p.pos[2] - p.target[2]];
    const d = Math.hypot(...v), yaw = Math.atan2(v[0], v[2]) + m.yaw * D2R, pitch = clamp(Math.asin(clamp(v[1] / (d || 1), -1, 1)) + m.pitch * D2R, -1.4, 1.4);
    return { ...p, pos: add(p.target, sph(yaw / D2R, pitch / D2R, d * m.distance)) };
  }

  /** Frame the 3D world. */
  world(c: WorldCues, rig: WorldRig, manual: Manual, enabled: boolean): Pose {
    const react = this.dir.intensity.reactivity, camI = this.dir.intensity.camera;
    // a world with a route (a river) frames a stretch of it every shot, so wides never lose it
    if (enabled) this.schedule(c, this.dir.shots.world[c.section] as WorldShot[]);
    const T: V3 = rig.path ? rig.path(0.2 + 0.6 * hash(this.shot.n * 2.71)) : rig.target, R = rig.radius, X = rig.extent;
    let pose: Pose;
    if (!enabled) {
      pose = { pos: add(T, sph(c.t * 4, 14, R * 1.3)), target: T, fov: rig.fov, roll: 0 };
    } else {
      const s = this.shot, u = clamp((c.beat - s.start) / s.len, 0, 1), e = ease(u);
      const m = (0.45 + 0.9 * c.curve) * camI, y0 = s.seed * 360, side = s.side;
      let kind = rig.path && rig.ride && hash(s.n * 4.13) < rig.ride ? 'flythrough' : s.kind;
      if (rig.avoid?.includes(kind as WorldShot)) kind = (['wide', 'orbit', 'crane', 'wide'] as const)[Math.floor(hash(s.n * 6.7) * 4)];
      switch (kind as WorldShot) {
        case 'wide': pose = { pos: add(T, sph(y0 + side * 22 * m * u, 16 + 8 * u, R * (2.7 - 0.35 * m * e))), target: T, fov: rig.fov * 1.12, roll: 0 }; break;
        case 'orbit': pose = { pos: add(T, sph(y0 + side * (35 + 90 * m) * e, 10 + 12 * Math.sin(Math.PI * u), R * (1.05 - 0.12 * u))), target: T, fov: rig.fov, roll: 0 }; break;
        case 'flythrough': if (rig.path) {
          // ride the route: each shot covers a stretch of it, faster when the song is up
          const span = 0.18 + 0.22 * Math.min(1, m), u0 = (s.seed * 0.6) % (1 - span), f = u0 + e * span;
          const pos = rig.path(f), ahead = rig.path(Math.min(1, f + 0.04));
          pose = { pos, target: [ahead[0], ahead[1] - 1.2, ahead[2]], fov: rig.fov * 1.2, roll: side * 0.06 * Math.sin(Math.PI * u) + Math.sin(c.t * 1.3) * 0.02 * c.curve };
          break;
        } else {
          const a = y0 * D2R, f = e * (0.55 + 0.45 * Math.min(1, m));
          const p0: V3 = add(T, [-Math.sin(a) * X, rig.flyY, -Math.cos(a) * X]), p1: V3 = add(T, [Math.sin(a + side * 0.6) * X * 0.45, rig.flyY * 0.55, Math.cos(a + side * 0.6) * X * 0.45]);
          const pos: V3 = [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, p0[2] + (p1[2] - p0[2]) * f];
          const d: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], dl = Math.hypot(...d) || 1;
          pose = { pos, target: [pos[0] + d[0] / dl * 12, pos[1] + d[1] / dl * 12 - 1.5, pos[2] + d[2] / dl * 12], fov: rig.fov * 1.18, roll: side * 0.08 * Math.sin(Math.PI * u) };
          break;
        }
        case 'crane': pose = { pos: add(T, sph(y0 + side * 15 * u, 4 + 52 * e * Math.min(1.2, m), R * (1.3 - 0.3 * u))), target: T, fov: rig.fov, roll: 0 }; break;
        case 'hero': {
          const p = add(T, sph(y0 + side * 22 * u, -4, R * (0.78 - 0.08 * e)));
          p[1] = Math.max(p[1], rig.floorY + 1.2);
          pose = { pos: p, target: add(T, [0, R * 0.22, 0]), fov: rig.fov * 1.25, roll: 0 }; break;
        }
        case 'top': pose = { pos: add(T, sph(y0 + side * 35 * u * m, 76, R * 1.6)), target: T, fov: rig.fov, roll: side * 0.6 * u }; break;
        case 'macro': {
          const tg = add(T, [(hash(s.seed * 7) - 0.5) * X * 0.6, (hash(s.seed * 11) - 0.5) * R * 0.3, (hash(s.seed * 13) - 0.5) * X * 0.6]);
          pose = { pos: add(tg, sph(y0 + side * 28 * u * m, 14, R * 0.3)), target: tg, fov: rig.fov * 0.8, roll: 0 }; break;
        }
        case 'vertigo': {
          const d = R * (1.75 - 1.15 * e);
          const fov = 2 * Math.atan(Math.tan(rig.fov * D2R / 2) * R * 1.15 / d) / D2R;
          pose = { pos: add(T, sph(y0, 8, d)), target: T, fov: clamp(fov, 18, 105), roll: 0 }; break;
        }
        case 'truck': default: {
          const back = sph(y0, 10, R * 0.85), a = y0 * D2R, rx = Math.cos(a), rz = -Math.sin(a), off = (u - 0.5) * X * 0.9 * Math.min(1.3, m) * side;
          pose = { pos: add(add(T, back), [rx * off, 0, rz * off]), target: add(T, [rx * off * 0.6, 0, rz * off * 0.6]), fov: rig.fov, roll: 0 }; break;
        }
      }
    }
    if (rig.minDist) {   // keep the subject framed from at least minDist
      const v: V3 = [pose.pos[0] - pose.target[0], pose.pos[1] - pose.target[1], pose.pos[2] - pose.target[2]], dl = Math.hypot(...v) || 1;
      if (dl < rig.minDist) { const k = rig.minDist / dl; pose = { ...pose, pos: [pose.target[0] + v[0] * k, pose.target[1] + v[1] * k, pose.target[2] + v[2] * k] }; }
    }
    return this.applyManual(this.dynamics(c, pose, 1, react), manual);
  }

  /** Frame the 2.5D plate. Every pose keeps the picture filling the frame. */
  plate(c: WorldCues, rig: PlateRig, aspect: number, manual: Manual, enabled: boolean): Pose {
    const react = this.dir.intensity.reactivity, camI = this.dir.intensity.camera;
    const R = rig.radius, f0 = rig.fov;
    let d = R * 0.92, tx = 0, ty = 0, yaw = 0, roll = 0, fov = f0;
    if (enabled) {
      this.schedule(c, this.dir.shots.plate[c.section] as PlateShot[]);
      const s = this.shot, u = clamp((c.beat - s.start) / s.len, 0, 1), e = ease(u);
      const m = Math.min(1.3, (0.45 + 0.9 * c.curve) * camI), side = s.side;
      const px = (hash(s.seed * 7) - 0.5) * 2, py = (hash(s.seed * 11) - 0.5) * 2;
      switch (s.kind as PlateShot) {
        case 'push': d = R * (0.95 - 0.38 * m * e); tx = px * 0.6 * e; ty = py * 0.6 * e; break;
        case 'pull': d = R * (0.58 + 0.38 * e); tx = px * (1 - e); ty = py * (1 - e); break;
        case 'pan': d = R * 0.62; tx = side * (e - 0.5) * 2 * m; ty = py * 0.3; break;
        case 'tilt': d = R * 0.62; ty = side * (e - 0.5) * 2 * m; tx = px * 0.3; break;
        case 'rack': d = R * 0.74; yaw = side * 6 * (u - 0.5); tx = px * 0.4; break;
        case 'snap': d = R * 0.9; fov = f0 * (1 - 0.42 * easeOut(Math.min(1, u * 4))); tx = px * 0.7; ty = py * 0.7; break;
        case 'dutch': d = R * 0.72; roll = side * 0.16; tx = px * 0.5 * e; break;
        case 'drift': default: d = R * 0.86; yaw = side * 4 * (u - 0.5); tx = Math.sin(u * Math.PI) * px * 0.5; break;
      }
    } else {
      d = R * 0.9; tx = Math.sin(c.t * 0.05) * 0.5;
    }
    // keep the frame inside the picture: shrink the offset (and if needed the distance) to fit
    const fill = (dd: number, ff: number) => {
      const hv = dd * Math.tan(ff * D2R / 2), hw = hv * aspect, cr = Math.abs(Math.cos(roll)), sr = Math.abs(Math.sin(roll));
      return { ex: (hw * cr + hv * sr) * 1.04 + Math.abs(Math.sin(yaw * D2R)) * dd, ey: (hw * sr + hv * cr) * 1.04 };
    };
    let fit = fill(d, fov);
    for (let i = 0; i < 6 && (fit.ex > rig.halfW * 0.98 || fit.ey > rig.halfH * 0.98); i++) { d *= 0.9; fit = fill(d, fov); }
    const limX = Math.max(0, rig.halfW * 0.98 - fit.ex), limY = Math.max(0, rig.halfH * 0.98 - fit.ey);
    tx = clamp(tx * limX, -limX, limX); ty = clamp(ty * limY, -limY, limY);
    const pose: Pose = { pos: [tx + Math.sin(yaw * D2R) * d, ty, Math.cos(yaw * D2R) * d], target: [tx, ty, 0], fov, roll };
    const out = this.dynamics(c, pose, 0.6, react);
    out.fov = Math.min(out.fov, fov);   // lens may punch in, never out past the picture's edge
    return this.applyManual(out, manual);
  }
}
