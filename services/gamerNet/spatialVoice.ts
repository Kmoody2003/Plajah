// Proximity voice — places each remote voice in 3D around the listener with Web Audio. Volume falls off with
// distance and stops completely past `maxDistance`; HRTF panning puts voices left/right/behind.
//
// A game feeds positions every frame (or every network tick):
//   voice.spatial.setListener({ x, y, z }, { x: fx, y: 0, z: fz })   // where I am, which way I face
//   voice.spatial.setPeer(uid, { x, y, z })                           // where each other player is
// Units are the game's own (metres in Forth Horizon). Players without a position yet are heard at full
// volume, centred, so voice works before the first state arrives.

export interface Vec3 { x: number; y: number; z: number }
export interface SpatialOpts {
  /** Full volume inside this distance. */
  refDistance?: number;
  /** Silent past this distance. */
  maxDistance?: number;
  /** How fast it fades between the two (Web Audio 'inverse' model). */
  rolloff?: number;
}

export const SPATIAL_DEFAULTS: Required<SpatialOpts> = { refDistance: 8, maxDistance: 120, rolloff: 1.4 };

/** Gain the 'inverse' model gives at distance d, with a hard cut at maxDistance (what the panner + gate do). */
export function proximityGain(d: number, o: Required<SpatialOpts> = SPATIAL_DEFAULTS): number {
  if (!Number.isFinite(d)) return 1;
  if (d >= o.maxDistance) return 0;
  const dd = Math.max(d, o.refDistance);
  return o.refDistance / (o.refDistance + o.rolloff * (dd - o.refDistance));
}

export const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

interface Node { src: MediaStreamAudioSourceNode; panner: PannerNode; gate: GainNode; el: HTMLAudioElement; pos: Vec3 | null }

export class SpatialVoice {
  private ctx: AudioContext;
  private out: GainNode;
  private nodes = new Map<string, Node>();
  private listener: Vec3 = { x: 0, y: 0, z: 0 };
  readonly opts: Required<SpatialOpts>;

  constructor(opts: SpatialOpts = {}) {
    this.opts = { ...SPATIAL_DEFAULTS, ...opts };
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.connect(this.ctx.destination);
  }

  resume() { if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {}); }

  /** Route a remote voice through the 3D graph. */
  add(id: string, stream: MediaStream): void {
    this.remove(id);
    // Chrome only feeds a remote WebRTC stream into Web Audio while a media element is playing it, so a muted
    // element keeps it flowing; the audible copy comes from the graph.
    const el = document.createElement('audio');
    el.muted = true; el.autoplay = true; el.style.display = 'none'; el.srcObject = stream;
    document.body.appendChild(el); void el.play().catch(() => {});
    const src = this.ctx.createMediaStreamSource(stream);
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = this.opts.refDistance;
    panner.maxDistance = this.opts.maxDistance;
    panner.rolloffFactor = this.opts.rolloff;
    const gate = this.ctx.createGain();
    src.connect(panner).connect(gate).connect(this.out);
    this.nodes.set(id, { src, panner, gate, el, pos: null });
    this.resume();
  }

  remove(id: string): void {
    const n = this.nodes.get(id); if (!n) return;
    try { n.src.disconnect(); n.panner.disconnect(); n.gate.disconnect(); } catch { /* already gone */ }
    n.el.pause(); n.el.srcObject = null; n.el.remove();
    this.nodes.delete(id);
  }

  setListener(pos: Vec3, forward: Vec3 = { x: 0, y: 0, z: -1 }): void {
    this.listener = pos;
    const L = this.ctx.listener as any, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(forward.x, t); L.forwardY.setValueAtTime(forward.y, t); L.forwardZ.setValueAtTime(forward.z, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else {
      L.setPosition?.(pos.x, pos.y, pos.z); L.setOrientation?.(forward.x, forward.y, forward.z, 0, 1, 0);
    }
    for (const n of this.nodes.values()) this.gateFor(n);
  }

  setPeer(id: string, pos: Vec3 | null): void {
    const n = this.nodes.get(id); if (!n) return;
    n.pos = pos;
    const p = pos ?? this.listener, t = this.ctx.currentTime;
    if (n.panner.positionX) { n.panner.positionX.setValueAtTime(p.x, t); n.panner.positionY.setValueAtTime(p.y, t); n.panner.positionZ.setValueAtTime(p.z, t); }
    else (n.panner as any).setPosition?.(p.x, p.y, p.z);
    this.gateFor(n);
  }

  /** The panner never reaches zero on its own; past maxDistance the gate closes. */
  private gateFor(n: Node) {
    const far = !!n.pos && distance(n.pos, this.listener) >= this.opts.maxDistance;
    n.gate.gain.setTargetAtTime(far ? 0 : 1, this.ctx.currentTime, 0.08);
  }

  /** Who is in earshot right now (for a "nearby" list). */
  inRange(): string[] {
    return [...this.nodes.entries()].filter(([, n]) => !n.pos || distance(n.pos, this.listener) < this.opts.maxDistance).map(([id]) => id);
  }

  dispose(): void {
    for (const id of [...this.nodes.keys()]) this.remove(id);
    void this.ctx.close().catch(() => {});
  }
}
