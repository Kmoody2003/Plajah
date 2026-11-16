// Broadcast-style replay: records the drive, then plays it back through a camera director that cuts between aerial, trackside
// telephoto, kerb-level, chase-orbit, nose and wheel-detail shots, with TV overlays. Reference look: the Forza Motorsport /
// Horizon / Gran Turismo replay and the stills in the racer folder (aerial coastal turn, trackside with REPLAY + timing tower,
// kerb shot with sparks). Everything is derived from the recorded path, so it works on any circuit or free roam.
import * as THREE from 'three';

const STRIDE = 11;     // t, x, y, z, yaw, pitch, roll, speed, steer, hit, lat
const MAX_FRAMES = 60 * 60 * 15;

export interface ReplayDeps {
  camera: THREE.PerspectiveCamera;
  car: () => THREE.Group | null;
  hAt: (x: number, z: number) => number;
  exag: () => number;
  blocked: (x: number, z: number) => boolean;
  lapInfo: () => string;
}

type ShotType = 'heli' | 'trackside' | 'kerb' | 'orbit' | 'nose' | 'wheel' | 'pan';
interface Shot { t0: number; t1: number; type: ShotType; side: number; seed: number }
const LABEL: Record<ShotType, string> = { heli: 'AERIAL', trackside: 'TRACKSIDE', kerb: 'KERB CAM', orbit: 'CHASE', nose: 'FRONT CAM', wheel: 'WHEEL CAM', pan: 'PAN' };

export class Replay {
  data = new Float32Array(STRIDE * 4096);
  n = 0;
  active = false;
  paused = false;
  rate = 1;
  pt = 0;
  private shots: Shot[] = [];
  private shotIdx = -1;
  private manualCam: number | null = null;
  private anchor = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private fov = 40;
  private slow = 1;
  private t = 0;
  private wheelAng = 0;
  private el: { root: HTMLElement; top: HTMLElement; bot: HTMLElement; tag: HTMLElement; tower: HTMLElement; cam: HTMLElement; bar: HTMLElement; fill: HTMLElement; hint: HTMLElement };
  private baseFov = 55;

  constructor(private d: ReplayDeps) {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;display:none;pointer-events:none;font-family:Outfit,Inter,sans-serif;color:#fff;z-index:30';
    root.innerHTML = `
      <div data-r="top" style="position:absolute;left:0;right:0;top:0;height:0;background:#000;transition:height .5s"></div>
      <div data-r="bot" style="position:absolute;left:0;right:0;bottom:0;height:0;background:#000;transition:height .5s"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(10,0,16,.55) 100%)"></div>
      <div data-r="tag" style="position:absolute;left:26px;top:calc(9vh + 18px);padding:6px 16px 6px 12px;background:#c4122f;font:800 20px Outfit,sans-serif;letter-spacing:.08em;border-radius:3px">&#9679; REPLAY</div>
      <div data-r="tower" style="position:absolute;left:26px;top:calc(9vh + 64px);min-width:230px;background:rgba(26,0,38,.78);border-left:4px solid #FF8C00;font:600 14px JetBrains Mono,monospace;padding:8px 14px;line-height:1.6"></div>
      <div data-r="cam" style="position:absolute;left:26px;bottom:calc(9vh + 52px);padding:6px 14px;background:rgba(26,0,38,.78);border-left:4px solid #00DAF3;font:700 15px Outfit,sans-serif;letter-spacing:.14em"></div>
      <div data-r="bar" style="position:absolute;left:26px;right:26px;bottom:calc(9vh + 26px);height:5px;background:rgba(255,255,255,.18);border-radius:3px"><div data-r="fill" style="height:100%;width:0;background:#FF8C00;border-radius:3px"></div></div>
      <div data-r="hint" style="position:absolute;left:26px;bottom:calc(9vh + 6px);font:500 11px Inter,sans-serif;opacity:.75;letter-spacing:.05em">Space pause · ← → seek 5 s · [ ] speed · C next camera · 1-6 pick camera · Esc back to the race</div>`;
    document.body.appendChild(root);
    const q = (k: string): HTMLElement => root.querySelector(`[data-r="${k}"]`) as HTMLElement;
    this.el = { root, top: q('top'), bot: q('bot'), tag: q('tag'), tower: q('tower'), cam: q('cam'), bar: q('bar'), fill: q('fill'), hint: q('hint') };
  }

  get length(): number { return this.n ? this.data[(this.n - 1) * STRIDE] : 0; }

  record(t: number, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, sp: number, steer: number, hit: number, lat: number): void {
    if (this.n * STRIDE >= this.data.length) {
      if (this.n >= MAX_FRAMES) { this.data.copyWithin(0, STRIDE * 600); this.n -= 600; }
      else { const nd = new Float32Array(this.data.length * 2); nd.set(this.data); this.data = nd; }
    }
    const o = this.n * STRIDE;
    this.data[o] = t; this.data[o + 1] = x; this.data[o + 2] = y; this.data[o + 3] = z; this.data[o + 4] = yaw; this.data[o + 5] = pitch;
    this.data[o + 6] = roll; this.data[o + 7] = sp; this.data[o + 8] = steer; this.data[o + 9] = hit; this.data[o + 10] = lat;
    this.n++;
  }
  clear(): void { this.n = 0; }

  private sample(t: number, out: number[]): void {
    const D = this.data, n = this.n;
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (D[m * STRIDE] <= t) lo = m; else hi = m; }
    const a = lo * STRIDE, b = Math.min(n - 1, lo + 1) * STRIDE;
    const span = D[b] - D[a], f = span > 1e-6 ? Math.min(1, Math.max(0, (t - D[a]) / span)) : 0;
    for (let k = 1; k < STRIDE; k++) out[k] = D[a + k] + (D[b + k] - D[a + k]) * f;
    out[0] = t;
  }
  private tmp: number[] = new Array(STRIDE).fill(0);
  private at(t: number): number[] { this.sample(Math.max(0, Math.min(this.length, t)), this.tmp); return this.tmp; }

  // cut list: aerial opener, then a rotation weighted by what the car is doing (fast = trackside, crash = kerb, end = chase)
  private plan(): void {
    this.shots = [];
    const T = this.length;
    const order: ShotType[] = ['heli', 'trackside', 'orbit', 'kerb', 'trackside', 'nose', 'wheel', 'pan', 'heli', 'orbit'];
    let t = 0, i = 0, rnd = 7;
    const rand = (): number => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
    while (t < T - 0.5) {
      let type = order[i++ % order.length];
      const s = this.at(t + 2);
      if (s[9] > 0.01) type = 'kerb';
      else if (Math.abs(s[7]) < 4 && type === 'trackside') type = 'orbit';
      const dur = type === 'heli' ? 6.5 : type === 'wheel' ? 3.2 : type === 'nose' ? 3.6 : 4.2 + rand() * 1.8;
      this.shots.push({ t0: t, t1: Math.min(T, t + dur), type, side: rand() < 0.5 ? -1 : 1, seed: rand() });
      t += dur;
    }
  }

  start(): boolean {
    if (this.n < 30) return false;
    this.active = true;
    this.paused = false;
    this.rate = 1;
    this.pt = 0;
    this.baseFov = this.d.camera.fov;
    this.plan();
    this.shotIdx = -1;
    this.manualCam = null;
    this.el.root.style.display = 'block';
    requestAnimationFrame(() => { this.el.top.style.height = '9vh'; this.el.bot.style.height = '9vh'; });
    return true;
  }
  stop(): void {
    this.active = false;
    this.el.root.style.display = 'none';
    this.el.top.style.height = '0'; this.el.bot.style.height = '0';
    this.d.camera.fov = this.baseFov;
    this.d.camera.updateProjectionMatrix();
  }

  key(code: string): boolean {
    if (!this.active) return false;
    if (code === 'Escape') { this.stop(); return true; }
    if (code === 'Space') this.paused = !this.paused;
    else if (code === 'ArrowRight') this.pt = Math.min(this.length, this.pt + 5);
    else if (code === 'ArrowLeft') this.pt = Math.max(0, this.pt - 5);
    else if (code === 'BracketRight') this.rate = Math.min(4, this.rate * 2);
    else if (code === 'BracketLeft') this.rate = Math.max(0.125, this.rate / 2);
    else if (code === 'KeyC') { this.manualCam = null; this.pt = this.shots[Math.min(this.shots.length - 1, Math.max(0, this.shotIdx) + 1)]?.t0 ?? 0; }
    else if (/^Digit[1-6]$/.test(code)) this.manualCam = Number(code.slice(5)) - 1;
    return true;
  }

  private local(s: number[], lx: number, ly: number, lz: number, out: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(s[4]), sn = Math.sin(s[4]);
    // car forward = (sin yaw, cos yaw); car left = (cos yaw, -sin yaw)
    return out.set(s[1] + lx * c + lz * sn, s[2] + ly, s[3] - lx * sn + lz * c);
  }

  private setupShot(sh: Shot): void {
    const mid = this.at((sh.t0 + sh.t1) * 0.5).slice();
    const fx = Math.sin(mid[4]), fz = Math.cos(mid[4]);
    const lx = Math.cos(mid[4]), lz = -Math.sin(mid[4]);
    const ground = (x: number, z: number): number => this.d.hAt(x, z) * this.d.exag();
    if (sh.type === 'trackside' || sh.type === 'kerb' || sh.type === 'pan') {
      // fixed camera beside the line, ahead of where the car will be mid-shot; the outside of the turn is tried first
      const dist = sh.type === 'kerb' ? 3.2 + sh.seed * 1.2 : sh.type === 'pan' ? 16 + sh.seed * 6 : 9 + sh.seed * 4;
      const ahead = sh.type === 'kerb' ? 9 : 22;
      let side = sh.side;
      let found = false;
      for (let attempt = 0; attempt < 4 && !found; attempt++) {
        const dd = dist * (1 - attempt * 0.18);
        const x = mid[1] + fx * ahead + lx * dd * side, z = mid[3] + fz * ahead + lz * dd * side;
        if (!this.d.blocked(x, z)) { this.anchor.set(x, ground(x, z) + (sh.type === 'kerb' ? 0.32 : 1.5 + sh.seed), z); found = true; }
        if (attempt === 1) side = -side;
      }
      if (!found) this.anchor.set(mid[1] + fx * 18 + lx * 6, mid[2] + 4, mid[3] + fz * 18 + lz * 6);
      this.camPos.copy(this.anchor);
    }
  }

  private frameShot(sh: Shot, local: number, dt: number, s: number[]): void {
    const cam = this.d.camera;
    const car = new THREE.Vector3(s[1], s[2] + 0.6, s[3]);
    const u = local / Math.max(0.01, sh.t1 - sh.t0);
    const ground = (x: number, z: number): number => this.d.hAt(x, z) * this.d.exag();
    const want = new THREE.Vector3(), look = car.clone();
    let fov = 40, follow = 6;
    const speed = Math.abs(s[7]);
    switch (sh.type) {
      case 'heli': {
        const a = s[4] + Math.PI + (sh.side * (0.7 - u * 1.3));
        const r = 55 - u * 14, h = 42 - u * 10;
        want.set(s[1] + Math.sin(a) * r, s[2] + h, s[3] + Math.cos(a) * r);
        look.set(s[1] + Math.sin(s[4]) * 10, s[2], s[3] + Math.cos(s[4]) * 10);
        fov = 34; follow = 2.2;
        break;
      }
      case 'trackside': case 'kerb': case 'pan': {
        want.copy(this.anchor);
        look.set(s[1], s[2] + (sh.type === 'kerb' ? 0.45 : 0.7), s[3]);
        const d = want.distanceTo(look);
        fov = sh.type === 'kerb' ? 52 - Math.min(14, d * 0.6) : Math.max(11, Math.min(34, 380 / Math.max(10, d + 10)));
        follow = 0;
        break;
      }
      case 'orbit': {
        const a = s[4] + Math.PI + sh.side * (0.9 - u * 1.5);
        const r = 5.6 + speed * 0.025;
        want.set(s[1] + Math.sin(a) * r, s[2] + 1.35 + u * 0.4, s[3] + Math.cos(a) * r);
        look.set(s[1] + Math.sin(s[4]) * 2.2, s[2] + 0.7, s[3] + Math.cos(s[4]) * 2.2);
        fov = 46 + Math.min(10, speed * 0.1); follow = 7;
        break;
      }
      case 'nose': {
        const a = s[4] + sh.side * 0.35;
        want.set(s[1] + Math.sin(a) * (4.4 - u * 1.2), s[2] + 0.55, s[3] + Math.cos(a) * (4.4 - u * 1.2));
        look.set(s[1], s[2] + 0.55, s[3]);
        fov = 62; follow = 8;
        break;
      }
      case 'wheel': {
        this.local(s, sh.side * 1.9, 0.42, 1.0 - u * 0.5, want);
        this.local(s, sh.side * 0.82, 0.36, 1.37, look);
        fov = 34; follow = 9;
        break;
      }
    }
    // keep the camera above the ground (the kerb camera stays at kerb height)
    const gmin = ground(want.x, want.z) + (sh.type === 'kerb' ? 0.28 : 0.9);
    if (want.y < gmin) want.y = gmin;
    if (follow === 0) this.camPos.copy(want);
    else this.camPos.lerp(want, 1 - Math.exp(-dt * follow));
    // aim: smoothed look target so telephoto pans do not jitter; a touch of speed shake sells the long lens
    this.camLook.lerp(look, 1 - Math.exp(-dt * 14));
    cam.position.copy(this.camPos);
    if (sh.type !== 'heli' && sh.type !== 'wheel') {
      const sh2 = speed * 0.00035 * (sh.type === 'kerb' ? 3 : 1);
      cam.position.x += Math.sin(this.t * 41) * sh2; cam.position.y += Math.sin(this.t * 53) * sh2;
    }
    cam.lookAt(this.camLook);
    this.fov += (fov - this.fov) * (1 - Math.exp(-dt * 6));
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  step(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    // slow motion around a hit, easing in and out
    const near = this.at(this.pt)[9] > 0.01 || this.at(this.pt + 0.5)[9] > 0.01;
    this.slow += ((near ? 0.3 : 1) - this.slow) * Math.min(1, dt * 4);
    if (!this.paused) this.pt += dt * this.rate * this.slow;
    if (this.pt >= this.length) this.pt = 0;
    const s = this.at(this.pt);
    // car
    const car = this.d.car();
    if (car) {
      car.position.set(s[1], s[2], s[3]);
      car.rotation.order = 'YXZ';
      car.rotation.set(s[5], s[4], s[6]);
      (car.userData.update as ((sp: number, st: number, dt: number) => void) | undefined)?.(s[7], s[8] * 0.42, this.paused ? 0 : dt * this.rate * this.slow);
    }
    // director
    let idx = this.shots.findIndex((x) => this.pt >= x.t0 && this.pt < x.t1);
    if (idx < 0) idx = this.shots.length - 1;
    let shot = this.shots[idx];
    if (this.manualCam !== null) shot = { ...shot, type: (['heli', 'trackside', 'kerb', 'orbit', 'nose', 'wheel'] as ShotType[])[this.manualCam] };
    if (idx !== this.shotIdx || (this.manualCam !== null && !this.manualShown)) {
      this.shotIdx = idx;
      this.manualShown = this.manualCam !== null;
      this.setupShot(shot);
      this.camLook.set(s[1], s[2] + 0.7, s[3]);
      this.camPos.copy(this.anchor);
      this.fov = this.d.camera.fov;
      // snap the moving rigs to their start so a cut is a cut, not a swoop
      if (shot.type !== 'trackside' && shot.type !== 'kerb' && shot.type !== 'pan') this.camPos.set(s[1] + 8, s[2] + 4, s[3] + 8);
      this.cutFlash = 1;
    }
    if (this.manualCam === null) this.manualShown = false;
    this.frameShot(shot, this.pt - shot.t0, dt, s);
    this.updateUi(shot, s);
  }
  private manualShown = false;
  private cutFlash = 0;

  private updateUi(shot: Shot, s: number[]): void {
    const e = this.el;
    e.fill.style.width = `${(this.pt / Math.max(0.01, this.length)) * 100}%`;
    const mm = Math.floor(this.pt / 60), ss = (this.pt % 60).toFixed(1).padStart(4, '0');
    e.tower.innerHTML = `<div style="opacity:.7;font-size:11px;letter-spacing:.12em">${this.d.lapInfo() || 'FREE ROAM'}</div>`
      + `<div>${mm}:${ss}</div><div>${Math.round(Math.abs(s[7]) * 3.6)} km/h</div>`
      + `<div style="opacity:.7;font-size:11px">${this.rate !== 1 ? this.rate + 'x · ' : ''}${this.slow < 0.8 ? 'SLOW-MO · ' : ''}${this.paused ? 'PAUSED' : 'LIVE REPLAY'}</div>`;
    e.cam.textContent = `CAM ${this.shotIdx + 1} · ${LABEL[shot.type]}`;
  }
}
