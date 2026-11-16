// Dynamic weather for the region game: clear, partly cloudy, overcast, fog, rain and storm. A rig holds the current look and eases it toward a target,
// draws the 3D rain around the camera, a 2D rain / fog / lightning overlay for the map screen, and plays rain and thunder. region.ts reads `cur`
// every frame and applies it to the lights, fog, clouds, terrain wetness and grip. Races have a weather plan (what the sky will do over the race)
// and the map previews the worst of it as a forecast.
import * as THREE from 'three';

export interface WxParams {
  sun: number; hemi: number; exposure: number;     // multipliers on the time-of-day lights, exposure is added
  cloud: number; cloudDark: number;                // cloud opacity multiplier, 0..1 how dark they go
  fogNear: number; fogFar: number; fogGrey: number;
  rain: number; wet: number; grip: number; wind: number;
}
export interface WxDef { label: string; icon: string; temp: number; severity: number; storm?: boolean; p: WxParams }

export const WEATHERS: Record<string, WxDef> = {
  clear:    { label: 'Clear', icon: '☀', temp: 24, severity: 0, p: { sun: 1, hemi: 1, exposure: 0, cloud: 0.55, cloudDark: 0, fogNear: 1, fogFar: 1, fogGrey: 0, rain: 0, wet: 0, grip: 1, wind: 0.1 } },
  partly:   { label: 'Partly cloudy', icon: '⛅', temp: 21, severity: 1, p: { sun: 0.82, hemi: 0.95, exposure: 0.02, cloud: 1.0, cloudDark: 0.1, fogNear: 0.9, fogFar: 0.95, fogGrey: 0.06, rain: 0, wet: 0, grip: 1, wind: 0.2 } },
  overcast: { label: 'Overcast', icon: '☁', temp: 17, severity: 2, p: { sun: 0.4, hemi: 0.82, exposure: 0.12, cloud: 1.5, cloudDark: 0.45, fogNear: 0.5, fogFar: 0.6, fogGrey: 0.38, rain: 0, wet: 0.05, grip: 0.98, wind: 0.3 } },
  fog:      { label: 'Fog', icon: '🌫', temp: 12, severity: 3, p: { sun: 0.3, hemi: 0.9, exposure: 0.16, cloud: 1.2, cloudDark: 0.3, fogNear: 0.02, fogFar: 0.1, fogGrey: 0.82, rain: 0, wet: 0.25, grip: 0.95, wind: 0.05 } },
  rain:     { label: 'Rain', icon: '🌧', temp: 14, severity: 4, p: { sun: 0.22, hemi: 0.7, exposure: 0.2, cloud: 1.7, cloudDark: 0.66, fogNear: 0.25, fogFar: 0.3, fogGrey: 0.62, rain: 0.75, wet: 0.88, grip: 0.82, wind: 0.35 } },
  storm:    { label: 'Thunderstorm', icon: '⛈', temp: 13, severity: 5, storm: true, p: { sun: 0.1, hemi: 0.55, exposure: 0.28, cloud: 2.0, cloudDark: 0.86, fogNear: 0.12, fogFar: 0.2, fogGrey: 0.72, rain: 1, wet: 1, grip: 0.7, wind: 0.8 } },
};
export const WEATHER_KEYS = Object.keys(WEATHERS);

/** the worst weather in a plan, which is what the map shows as the forecast */
export function worstOf(plan: { w: string }[]): string {
  return plan.reduce((a, b) => (WEATHERS[b.w].severity > WEATHERS[a].severity ? b.w : a), plan[0].w);
}
export function forecastText(plan: { w: string }[]): string {
  const names: string[] = [];
  for (const p of plan) { const l = WEATHERS[p.w].label; if (names[names.length - 1] !== l) names.push(l); }
  return names.join(' → ');
}

const copyP = (p: WxParams): WxParams => ({ ...p });

export class WeatherRig {
  cur: WxParams = copyP(WEATHERS.partly.p);
  target: WxParams = copyP(WEATHERS.partly.p);
  name = 'partly';
  flash = 0;
  private fast = false;
  private nextBolt = 6;
  private t = 0;
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private off: Float32Array;
  private N = 9000;
  private overlay: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private streaks: { x: number; y: number; l: number; v: number }[] = [];
  private actx: AudioContext | null = null;
  private rainGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private level = 0.5;

  constructor(scene: THREE.Scene) {
    this.off = new Float32Array(this.N * 3);
    for (let i = 0; i < this.N; i++) { this.off[i * 3] = (Math.random() - 0.5) * 80; this.off[i * 3 + 1] = Math.random() * 45; this.off[i * 3 + 2] = (Math.random() - 0.5) * 80; }
    this.rainPos = new Float32Array(this.N * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    const al = new Float32Array(this.N * 2); for (let i = 0; i < this.N; i++) { al[i * 2] = 1; al[i * 2 + 1] = 0; }       // bright head, fading tail: reads as motion blur
    g.setAttribute('aA', new THREE.BufferAttribute(al, 1));
    // hair-thin streaks; none right at the lens (those read as cartoon lines), thinning out with distance
    this.rain = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uOp: { value: 0 }, uCol: { value: new THREE.Color(0xdfe8f4) } },
      vertexShader: 'attribute float aA; varying float vA; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); float d = length(cameraPosition - wp.xyz); vA = aA * smoothstep(3.0, 9.0, d) * (1.0 - smoothstep(28.0, 62.0, d)); gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: 'uniform float uOp; uniform vec3 uCol; varying float vA; void main() { gl_FragColor = vec4(uCol, vA * uOp); }',
    }));
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 9;
    this.rain.visible = false;
    scene.add(this.rain);
    // 2D overlay for the map screen
    const c = document.createElement('canvas');
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;display:none';
    document.body.appendChild(c);
    this.overlay = c;
    this.octx = c.getContext('2d')!;
    for (let i = 0; i < 260; i++) this.streaks.push({ x: Math.random(), y: Math.random(), l: 0.02 + Math.random() * 0.05, v: 0.9 + Math.random() * 0.9 });
  }

  setWeather(name: string, instant = false, fast = false): void {
    const d = WEATHERS[name];
    if (!d) return;
    this.name = name;
    this.target = copyP(d.p);
    this.fast = fast;
    if (instant) this.cur = copyP(d.p);
  }
  setAudioLevel(v: number): void { this.level = v; }

  /** call after a user gesture: starts the rain bed */
  ensureAudio(): void {
    if (this.actx) { if (this.actx.state === 'suspended') void this.actx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.actx = ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3400; bp.Q.value = 0.5;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(ctx.destination);
    src.start();
    this.rainGain = g;
  }
  private thunder(delay: number, power: number): void {
    const ctx = this.actx; if (!ctx || !this.noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(420, t); lp.frequency.exponentialRampToValueAtTime(70, t + 2.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55 * power * this.level, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0005, t + 2.8);
    src.connect(lp); lp.connect(g); g.connect(ctx.destination);
    src.start(t); src.stop(t + 3);
  }
  setPaused(p: boolean): void { if (this.rainGain && this.actx) this.rainGain.gain.setTargetAtTime(p ? 0 : this.cur.rain * 0.07 * this.level, this.actx.currentTime, 0.2); }

  step(dt: number, cam: THREE.Vector3, mapMode: boolean, carSpeed = 0, muted = false): void {
    this.t += dt;
    const k = 1 - Math.exp(-dt / (this.fast ? 0.9 : 7));
    const c = this.cur as unknown as Record<string, number>, tg = this.target as unknown as Record<string, number>;
    for (const key of Object.keys(c)) c[key] += (tg[key] - c[key]) * k;
    // lightning: bright flashes with thunder a moment later
    this.flash = Math.max(0, this.flash - dt * 6);
    if (WEATHERS[this.name].storm && this.cur.rain > 0.8) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flash = 1;
        this.nextBolt = 3 + Math.random() * 9;
        if (!muted) this.thunder(0.35 + Math.random() * 1.6, 0.5 + Math.random() * 0.5);
        if (Math.random() < 0.4) setTimeout(() => { this.flash = Math.max(this.flash, 0.7); }, 110);
      }
    }
    // 3D rain around the camera (in the race)
    const rain = this.cur.rain;
    this.rain.visible = !mapMode && rain > 0.03;
    if (this.rain.visible) {
      (this.rain.material as THREE.ShaderMaterial).uniforms.uOp.value = Math.min(0.5, 0.12 + rain * 0.38);
      const fall = 26 + rain * 14, wind = this.cur.wind * 9;
      for (let i = 0; i < this.N; i++) {
        let oy = this.off[i * 3 + 1] - fall * dt;
        let ox = this.off[i * 3] + wind * dt - carSpeed * 0.0 * dt;
        if (oy < -3) { oy += 48; ox = (Math.random() - 0.5) * 70; this.off[i * 3 + 2] = (Math.random() - 0.5) * 70; }
        if (ox > 35) ox -= 70;
        this.off[i * 3] = ox; this.off[i * 3 + 1] = oy;
        const x = cam.x + ox, y = cam.y + oy - 6, z = cam.z + this.off[i * 3 + 2];
        const j = i * 6, len = 0.32 + rain * 0.3;
        this.rainPos[j] = x; this.rainPos[j + 1] = y; this.rainPos[j + 2] = z;
        this.rainPos[j + 3] = x - wind * 0.018 * len; this.rainPos[j + 4] = y + len; this.rainPos[j + 5] = z;
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.rainGain && this.actx) this.rainGain.gain.setTargetAtTime(muted ? 0 : rain * 0.07 * this.level, this.actx.currentTime, 0.3);
    // map overlay
    const show = mapMode && (rain > 0.03 || this.cur.fogGrey > 0.3 || this.flash > 0.02);
    this.overlay.style.display = show ? 'block' : 'none';
    if (show) this.drawOverlay(dt);
  }

  private drawOverlay(dt: number): void {
    const c = this.overlay, ctx = this.octx;
    if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; }
    ctx.clearRect(0, 0, c.width, c.height);
    const fog = this.cur.fogGrey;
    if (fog > 0.2) {
      const g = ctx.createLinearGradient(0, 0, 0, c.height);
      g.addColorStop(0, `rgba(150,160,175,${fog * 0.22})`); g.addColorStop(0.6, `rgba(170,178,190,${fog * 0.34})`); g.addColorStop(1, `rgba(150,158,170,${fog * 0.2})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    }
    const rain = this.cur.rain;
    if (rain > 0.03) {
      ctx.strokeStyle = `rgba(210,222,240,${0.18 + rain * 0.3})`;
      ctx.lineWidth = 1.2;
      const n = Math.floor(this.streaks.length * rain);
      const slant = 0.12 + this.cur.wind * 0.18;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const s = this.streaks[i];
        s.y += s.v * dt * 1.3; s.x += slant * s.v * dt * 0.5;
        if (s.y > 1.05) { s.y = -0.06; s.x = Math.random(); }
        if (s.x > 1.05) s.x -= 1.1;
        const x = s.x * c.width, y = s.y * c.height;
        ctx.moveTo(x, y); ctx.lineTo(x - slant * s.l * c.height, y + s.l * c.height);
      }
      ctx.stroke();
      ctx.fillStyle = `rgba(20,26,40,${rain * 0.16})`; ctx.fillRect(0, 0, c.width, c.height);
    }
    if (this.flash > 0.02) { ctx.fillStyle = `rgba(220,230,255,${this.flash * 0.45})`; ctx.fillRect(0, 0, c.width, c.height); }
  }
}
