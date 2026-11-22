// Sounds of a dangerous world, placed in 3D so you hear where the wolf is: predator howls, growls and strike whooshes,
// wasp buzz, fungi zaps, vent eruptions, rockfall rumbles, spore hisses. Samples are cut from the creature and FX
// reference reels (assets/audio/sfx/dz_*.mp3, picked from the AudioSet-labelled clip library); anything not loaded
// falls back to a short procedural sound. Its own AudioContext (the music director's is private), started on the
// first click or key like the score.
import * as THREE from 'three/webgpu';

const AUDIO = '/games/rift-realm/assets/audio/sfx/';
const BANK: Record<string, number> = {
  howl: 2, growl: 3, strike: 2, buzz: 1, zap: 2, rumble: 1, erupt: 1, hiss: 1, splash: 1, crack: 1, screech: 1,
};

export type DangerSound = keyof typeof BANK | 'sizzle' | 'thorn';

export class DangerAudio {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private fwd = new THREE.Vector3(); private up = new THREE.Vector3();

  constructor() {
    const wake = () => this.start();
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    try { this.ctx = new AudioContext(); } catch { return; }
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    this.out = ctx.createGain(); this.out.gain.value = 0.8;
    this.out.connect(comp).connect(ctx.destination);
    const n = ctx.sampleRate; this.noise = ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    for (const [name, k] of Object.entries(BANK)) for (let i = 1; i <= k; i++) {
      fetch(`${AUDIO}dz_${name}_${i}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? ctx.decodeAudioData(b) : null))
        .then((buf) => { if (buf) this.buffers.set(`${name}_${i}`, buf); }).catch(() => { /* procedural fallback */ });
    }
  }

  /** The listener follows the camera. */
  listen(cam: THREE.Camera) {
    const ctx = this.ctx; if (!ctx) return;
    const L = ctx.listener, p = cam.getWorldPosition(this.up);
    if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; } else L.setPosition(p.x, p.y, p.z);
    cam.getWorldDirection(this.fwd); this.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    if (L.forwardX) {
      L.forwardX.value = this.fwd.x; L.forwardY.value = this.fwd.y; L.forwardZ.value = this.fwd.z;
      L.upX.value = this.up.x; L.upY.value = this.up.y; L.upZ.value = this.up.z;
    } else L.setOrientation(this.fwd.x, this.fwd.y, this.fwd.z, this.up.x, this.up.y, this.up.z);
  }

  /** Play `name` at a world point (null = in the head). `gap` stops the same sound stacking up (seconds). */
  play(name: DangerSound, at: THREE.Vector3 | null, o: { gain?: number; rate?: number; gap?: number; range?: number } = {}) {
    const ctx = this.ctx, out = this.out;
    if (!ctx || !out || ctx.state !== 'running') return;
    const now = ctx.currentTime, key = `${name}@${at ? `${Math.round(at.x / 4)},${Math.round(at.z / 4)}` : ''}`;
    if (o.gap && now - (this.last.get(key) ?? -9) < o.gap) return;
    this.last.set(key, now);
    let dest: AudioNode = out;
    if (at) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 4; p.maxDistance = o.range ?? 90; p.rolloffFactor = 1.1;
      if (p.positionX) { p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z; } else p.setPosition(at.x, at.y, at.z);
      p.connect(out); dest = p;
    }
    const g = ctx.createGain(); g.gain.value = (o.gain ?? 1) * (0.9 + Math.random() * 0.15); g.connect(dest);
    const takes = Array.from({ length: BANK[name as string] ?? 0 }, (_, i) => this.buffers.get(`${name}_${i + 1}`)).filter(Boolean) as AudioBuffer[];
    if (takes.length) {
      const s = ctx.createBufferSource();
      s.buffer = takes[Math.floor(Math.random() * takes.length)];
      s.playbackRate.value = (o.rate ?? 1) * (0.93 + Math.random() * 0.14);
      s.connect(g); s.start();
      return;
    }
    this.synth(name, g, now);
  }

  /** Short procedural stand-ins: filtered noise (sizzle, hiss, rumble, thorn rustle) or a falling tone (growl, zap). */
  private synth(name: DangerSound, g: GainNode, t: number) {
    const ctx = this.ctx!;
    const env = (a: number, d: number, peak: number) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); return a + d; };
    const noisy: Record<string, [BiquadFilterType, number, number, number]> = {
      sizzle: ['highpass', 3200, 0.02, 0.5], hiss: ['bandpass', 5000, 0.05, 0.9], rumble: ['lowpass', 140, 0.15, 1.6],
      thorn: ['bandpass', 2400, 0.01, 0.18], splash: ['bandpass', 900, 0.01, 0.5], erupt: ['lowpass', 400, 0.05, 1.8], crack: ['bandpass', 1800, 0.005, 0.15],
    };
    const nz = noisy[name as string];
    if (nz && this.noise) {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = nz[0]; f.frequency.value = nz[1];
      s.connect(f).connect(g); const dur = env(nz[2], nz[3], 0.5); s.start(t, Math.random()); s.stop(t + dur + 0.05);
      return;
    }
    const o = ctx.createOscillator();
    const zap = name === 'zap' || name === 'buzz' || name === 'screech';
    o.type = zap ? 'square' : 'sawtooth';
    o.frequency.setValueAtTime(zap ? 1400 : 160, t); o.frequency.exponentialRampToValueAtTime(zap ? 180 : 70, t + 0.3);
    o.connect(g); const dur = env(0.01, zap ? 0.18 : 0.45, 0.35); o.start(t); o.stop(t + dur + 0.05);
  }
}
