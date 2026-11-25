// The garage as the game sees it: the player's active car as a physics spec, run tracking and medals, the results card, and the courier (delivery) mode with its markers and HUD.
// region.ts calls into this; the progress itself lives in garage/ and is shared with the showroom through localStorage.
import * as THREE from 'three';
import { CARS, type CarSpec } from './manufacturers';
import { RacingLine, type LinePt } from './racingline';
import { buildCar } from './garage/build';
import { DeliveryShift, TIERS, TIER_LIST, addressFor, mulberry32, nextTarget, type CarFeed, type JobKind, type ShiftEvent, type ShiftTier, type Spot } from './garage/delivery';
import { OUTCOME_CSS, cr, esc, outcomeHtml } from './garage/outcomeHtml';
import { Garage, type Outcome, type RunResult } from './garage/progress';
import { PlajahGamesBridge, type ApexAchievementTrigger } from './plajahBridge';
import { attachCloud } from './garage/cloud';

function safeStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | null {
  try { localStorage.setItem('apex.t', '1'); localStorage.removeItem('apex.t'); return localStorage; } catch { return null; }
}
export const garage = new Garage(safeStorage());
/** progress follows the player across devices when the game runs inside Plajah and they are signed in; on its own it just saves on this device */
export const cloud = attachCloud(garage);
const bridge = new PlajahGamesBridge();
garage.onAchievement = (id) => bridge.unlock(id as ApexAchievementTrigger);

/** the spec the player drives: the active car with its parts and tune, or the stock Sovereign until they have picked a car */
export function activeSpec(): CarSpec {
  const b = garage.built();
  return b ? b.spec : CARS.kestrel;
}
export const hasCar = (): boolean => !!garage.active;

// ---------- run tracking ----------
export interface Sample { x: number; z: number; speedMps: number; drifting: boolean; hit: boolean; wet: number }
export class RunTracker {
  top = 0; drift = 0; hits = 0; dist = 0; private wetSum = 0; private t = 0; private last: { x: number; z: number } | null = null; private cool = 0;
  constructor(readonly eventId: string, readonly parSec: number) {}
  sample(dt: number, s: Sample): void {
    this.t += dt; this.wetSum += s.wet * dt; this.cool = Math.max(0, this.cool - dt);
    if (this.last) { const d = Math.hypot(s.x - this.last.x, s.z - this.last.z); if (d < 80) this.dist += d; }
    this.last = { x: s.x, z: s.z };
    this.top = Math.max(this.top, s.speedMps);
    if (s.drifting && s.speedMps > 12) this.drift += s.speedMps * dt * 2.5;
    if (s.hit && this.cool <= 0) { this.hits++; this.cool = 0.9; }
  }
  /** the result for the lap or stage just finished, and start counting afresh */
  take(timeSec: number, laps: number, assists: { line: boolean; brake: boolean; steer: boolean }): RunResult {
    const r: RunResult = { eventId: this.eventId, timeSec, parSec: this.parSec, laps, collisions: this.hits, topMph: this.top * 2.23694, driftPoints: this.drift, distanceKm: this.dist / 1000, wetness: this.t > 0 ? this.wetSum / this.t : 0, assists };
    this.top = 0; this.drift = 0; this.hits = 0; this.dist = 0; this.wetSum = 0; this.t = 0;
    return r;
  }
}

/** progress along an open course (a point-to-point stage): started past the first few points, finished near the last */
export class PathProgress {
  idx = 0; started = false; done = false; t0 = 0;
  constructor(private pts: LinePt[]) {}
  update(x: number, z: number, now: number): { idx: number; frac: number } {
    const n = this.pts.length; let best = 1e18, bi = this.idx;
    for (let k = -20; k <= 45; k++) { const i = Math.min(n - 1, Math.max(0, this.idx + k)); const d = (this.pts[i].x - x) ** 2 + (this.pts[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
    if (best < 60 * 60) this.idx = Math.max(this.idx, bi);       // never goes back, and only counts while the car is near the course
    if (!this.started && this.idx >= 3) { this.started = true; this.t0 = now; }
    if (this.started && !this.done && this.idx >= n - 6) this.done = true;
    return { idx: this.idx, frac: this.idx / Math.max(1, n - 1) };
  }
}

/** the ideal-line time of the stock Sovereign on a course: the yardstick every car's medals are measured against */
export function refParSec(pts: LinePt[], closed: boolean, halfWidth: number): number {
  const g = CARS.kestrel.corneringGrip * 1.18 * 9.81;
  const line = new RacingLine(pts, closed, { aLat: g * 0.66, aBrake: 1.1 * CARS.kestrel.corneringGrip * 9.81 * 0.6, vmax: 80, halfWidth });
  let t = 0;
  for (let i = 0; i < line.n; i++) t += line.ds / Math.max(8, line.speed[i]);
  return t;
}

// ---------- the results card and banners ----------
let styled = false;
function style(): void {
  if (styled) return; styled = true;
  const s = document.createElement('style');
  s.textContent = OUTCOME_CSS + `
  .ge-card{position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:60;width:min(460px,92vw);padding:22px 26px;border-radius:28px;background:rgba(26,0,38,.92);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.16);box-shadow:0 30px 80px rgba(0,0,0,.6);color:#fff;font-family:Inter,sans-serif;max-height:76vh;overflow:auto}
  .ge-card .ge-x{margin-top:16px;height:44px;padding:0 26px;border-radius:999px;border:0;background:linear-gradient(135deg,#D40055,#FF8C00);color:#fff;font:800 12px Outfit,sans-serif;letter-spacing:.2em;cursor:pointer}
  .ge-victory{position:fixed;right:26px;top:50%;transform:translateY(-50%);z-index:62;width:min(470px,92vw);padding:20px 24px;border-radius:24px;background:rgba(14,10,28,.88);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.18);box-shadow:0 28px 90px rgba(0,0,0,.65);color:#fff;font-family:Inter,sans-serif;max-height:88vh;display:flex;flex-direction:column}
  .ge-v-scroll{overflow-y:auto;max-height:36vh;padding-right:4px}
  .ge-v-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:4px}
  .ge-v-rank{font:900 32px Outfit,sans-serif;letter-spacing:.04em;background:linear-gradient(135deg,#ffd166,#ff8c00);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .ge-v-rank.p2{background:linear-gradient(135deg,#eef2f7,#9cb0c9);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .ge-v-rank.p3{background:linear-gradient(135deg,#f0b07a,#c06c38);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .ge-v-rank.pn{background:linear-gradient(135deg,#68dbe4,#a0b8ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .ge-v-sub{font:600 12px Outfit,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#a9bbd0;margin-bottom:14px}
  .ge-v-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
  .ge-v-stat{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:8px 10px}
  .ge-v-stat span{display:block;font:600 9px Outfit,sans-serif;letter-spacing:.12em;color:#93a6bc;text-transform:uppercase}
  .ge-v-stat b{font:700 14px 'JetBrains Mono',monospace;color:#fff}
  .ge-v-table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:12px}
  .ge-v-table th{text-align:left;font:600 9px Outfit,sans-serif;letter-spacing:.12em;color:#8ba0b8;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase}
  .ge-v-table td{padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.06);font-family:'JetBrains Mono',monospace}
  .ge-v-table tr.me{background:rgba(0,218,243,.16);color:#68f2ff;font-weight:700}
  .ge-v-auto{margin:12px 0;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(104,219,228,.28);font:600 12px Inter,sans-serif;color:#d6e9f2}
  .ge-v-autobar{height:4px;margin-top:6px;border-radius:4px;background:rgba(255,255,255,.14);overflow:hidden}
  .ge-v-autobar i{display:block;height:100%;background:linear-gradient(90deg,#00daf3,#ff8c00);transition:width .25s linear}
  .ge-v-btns{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
  .ge-v-btn{flex:1;min-width:110px;height:42px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:800 11px Outfit,sans-serif;letter-spacing:.15em;cursor:pointer;text-transform:uppercase}
  .ge-v-btn.primary{border:0;background:linear-gradient(135deg,#D40055,#FF8C00)}
  .ge-v-btn:hover{filter:brightness(1.12)}
  .ge-ban{position:fixed;left:50%;top:21%;transform:translateX(-50%);z-index:55;padding:10px 22px;border-radius:999px;background:rgba(26,0,38,.88);border:1px solid rgba(255,255,255,.2);font:700 15px Outfit,sans-serif;color:#fff;letter-spacing:.04em;pointer-events:none;transition:opacity .4s,transform .4s;white-space:nowrap}
  .ge-ban.ok{border-color:#00f5d4;color:#00f5d4}.ge-ban.bad{border-color:#ff5d73;color:#ff8c9a}.ge-ban.gold{border-color:#ffd166;color:#ffd166}
  .ge-dl{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:30;width:min(520px,94vw);padding:10px 16px;border-radius:22px;background:rgba(26,0,38,.78);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.14);color:#fff;font-family:Inter,sans-serif;pointer-events:none}
  .ge-top{display:flex;align-items:center;gap:14px}.ge-clock{font:800 34px 'JetBrains Mono',monospace}.ge-clock.low{color:#ff5d73}.ge-chain{padding:3px 12px;border-radius:99px;background:rgba(0,245,212,.14);border:1px solid rgba(0,245,212,.5);font:800 13px Outfit,sans-serif;color:#00f5d4}.ge-earn{margin-left:auto;font:700 16px 'JetBrains Mono',monospace;color:#ffd166}
  .ge-job{display:grid;grid-template-columns:22px 1fr 50px;gap:8px;align-items:center;margin-top:6px;font:500 12px Inter,sans-serif}.ge-job i{display:block;width:18px;height:18px;border-radius:50%}.ge-job b{font-family:'JetBrains Mono',monospace;text-align:right}.ge-job .bar{grid-column:1/4;height:4px;border-radius:9px;background:rgba(255,255,255,.12);overflow:hidden}.ge-job .bar u{display:block;height:100%}
  .ge-arrow{position:fixed;left:50%;top:150px;z-index:30;width:54px;height:54px;margin-left:-27px;pointer-events:none;transition:transform .08s}.ge-arrow svg{width:100%;height:100%;filter:drop-shadow(0 0 10px currentColor)}.ge-arrow span{position:absolute;left:50%;top:58px;transform:translateX(-50%);font:700 12px 'JetBrains Mono',monospace;color:#fff;white-space:nowrap;text-shadow:0 1px 6px #000}`;
  document.head.appendChild(s);
}
export function showBanner(text: string, kind: 'ok' | 'bad' | 'gold' | '' = '', ms = 2600): void {
  style();
  const d = document.createElement('div'); d.className = 'ge-ban ' + kind; d.textContent = text; document.body.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transform = 'translateX(-50%) translateY(-8px)'; }, ms); setTimeout(() => d.remove(), ms + 500);
}
/** the results card; `onClose` runs when the player dismisses it */
export function showCard(title: string, sub: string, o: Outcome, onClose?: () => void): void {
  style();
  const d = document.createElement('div'); d.className = 'ge-card';
  d.innerHTML = outcomeHtml(title, sub, o) + '<button class="ge-x">CONTINUE</button>';
  document.body.appendChild(d);
  const close = (): void => { d.remove(); window.removeEventListener('keydown', key); onClose?.(); };
  const key = (e: KeyboardEvent): void => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); close(); } };
  (d.querySelector('.ge-x') as HTMLElement).onclick = close;
  window.addEventListener('keydown', key);
}

export interface RaceFinishStanding {
  position: number;
  driverName: string;
  carName: string;
  gapSec: number;
  isPlayer: boolean;
}
export interface RaceFinishOptions {
  courseName: string;
  position: number;
  totalRacers: number;
  raceTimeText: string;
  bestLapText: string;
  parTimeText: string;
  topMph: number;
  standings: RaceFinishStanding[];
  outcome: Outcome;
  canReplay: boolean;
  autoReplaySec?: number;
  onReplay: () => void;
  onRestart: () => void;
  onContinue: () => void;
}
/**
 * Post-race Victory & Results overlay paired with the live 3D victory orbit cutscene:
 * shows final podium rank, timing stats, race standings, credits/XP rewards, action buttons,
 * and an automatic 12-second replay countdown.
 */
export function showRaceResultsOverlay(opts: RaceFinishOptions): { dismiss: () => void } {
  style();
  const d = document.createElement('div');
  d.className = 'ge-victory';
  const ord = (n: number): string => n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : `${n}TH`;
  const rankTitle = opts.position === 1 ? '1ST · VICTORY' : opts.position <= 3 ? `${ord(opts.position)} · PODIUM` : `${ord(opts.position)} PLACE`;
  const rankCls = opts.position === 1 ? '' : opts.position === 2 ? 'p2' : opts.position === 3 ? 'p3' : 'pn';
  const medalTxt = opts.outcome.medal ? `${opts.outcome.medal.toUpperCase()} MEDAL` : 'RACE COMPLETE';
  // Top 6 standings + always include player if finished > 6th
  const shown = opts.standings.slice(0, 6);
  if (!shown.some((s) => s.isPlayer)) {
    const me = opts.standings.find((s) => s.isPlayer);
    if (me) shown.push(me);
  }
  const tableRows = shown.map((s) =>
    `<tr class="${s.isPlayer ? 'me' : ''}"><td>P${s.position}</td><td>${esc(s.driverName)}</td><td>${esc(s.carName)}</td><td style="text-align:right">${s.position === 1 ? 'LEADER' : '+' + s.gapSec.toFixed(2) + 's'}</td></tr>`
  ).join('');
  const autoSec = opts.canReplay ? (opts.autoReplaySec ?? 12) : 0;

  d.innerHTML = `
    <div class="ge-v-head">
      <div class="ge-v-rank ${rankCls}">${rankTitle}</div>
      <span style="font:800 11px Outfit,sans-serif;letter-spacing:.14em;color:#ffd166">${medalTxt}</span>
    </div>
    <div class="ge-v-sub">${esc(opts.courseName)} · ${opts.position}/${opts.totalRacers}</div>
    <div class="ge-v-stats">
      <div class="ge-v-stat"><span>Race Time</span><b>${esc(opts.raceTimeText)}</b></div>
      <div class="ge-v-stat"><span>Best Lap</span><b>${esc(opts.bestLapText)}</b></div>
      <div class="ge-v-stat"><span>Ideal Par</span><b>${esc(opts.parTimeText)}</b></div>
      <div class="ge-v-stat"><span>Top Speed</span><b>${Math.round(opts.topMph)} mph</b></div>
    </div>
    <div class="ge-v-scroll">
      ${tableRows ? `<table class="ge-v-table"><thead><tr><th>Pos</th><th>Driver</th><th>Machine</th><th style="text-align:right">Gap</th></tr></thead><tbody>${tableRows}</tbody></table>` : ''}
      ${outcomeHtml('', '', opts.outcome)}
    </div>
    ${autoSec > 0 ? `<div class="ge-v-auto"><div style="display:flex;justify-content:space-between;align-items:center"><span data-auto-txt>Starting race replay automatically in ${autoSec}s...</span><button data-cancel-auto style="background:none;border:0;color:#68dbe4;font:700 11px Inter,sans-serif;cursor:pointer;text-decoration:underline">Cancel</button></div><div class="ge-v-autobar"><i data-auto-bar style="width:100%"></i></div></div>` : ''}
    <div class="ge-v-btns">
      ${opts.canReplay ? '<button class="ge-v-btn primary" data-act="replay">Watch Replay</button>' : ''}
      <button class="ge-v-btn" data-act="restart">Race Again</button>
      <button class="ge-v-btn" data-act="continue">Continue</button>
    </div>`;
  document.body.appendChild(d);

  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  const dismiss = (): void => {
    if (closed) return;
    closed = true;
    if (timer !== null) { clearInterval(timer); timer = null; }
    window.removeEventListener('keydown', onKey);
    d.remove();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'KeyP' && opts.canReplay) { e.preventDefault(); dismiss(); opts.onReplay(); }
    else if (e.code === 'Enter') { e.preventDefault(); dismiss(); opts.onContinue(); }
  };
  window.addEventListener('keydown', onKey);

  d.querySelector('[data-act="replay"]')?.addEventListener('click', () => { dismiss(); opts.onReplay(); });
  d.querySelector('[data-act="restart"]')?.addEventListener('click', () => { dismiss(); opts.onRestart(); });
  d.querySelector('[data-act="continue"]')?.addEventListener('click', () => { dismiss(); opts.onContinue(); });

  if (autoSec > 0) {
    let left = autoSec;
    const txtEl = d.querySelector('[data-auto-txt]') as HTMLElement | null;
    const barEl = d.querySelector('[data-auto-bar]') as HTMLElement | null;
    const cancelBtn = d.querySelector('[data-cancel-auto]') as HTMLElement | null;
    cancelBtn?.addEventListener('click', () => {
      if (timer !== null) { clearInterval(timer); timer = null; }
      if (txtEl) txtEl.textContent = 'Auto-replay cancelled · click Watch Replay anytime';
      if (barEl) barEl.style.width = '0%';
      if (cancelBtn) cancelBtn.style.display = 'none';
    });
    timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        dismiss();
        opts.onReplay();
        return;
      }
      if (txtEl) txtEl.textContent = `Starting race replay automatically in ${left}s...`;
      if (barEl) barEl.style.width = `${Math.max(0, (left / autoSec) * 100)}%`;
    }, 1000);
  }
  return { dismiss };
}

// ---------- courier mode ----------
const KIND_COLOR: Record<JobKind, number> = { passenger: 0x00daf3, food: 0xff8c00, package: 0xffd166 };
const KIND_CSS: Record<JobKind, string> = { passenger: '#00daf3', food: '#ff8c00', package: '#ffd166' };
const KIND_NAME: Record<JobKind, string> = { passenger: 'Passenger', food: 'Food order', package: 'Package' };

/** drop points along the roads: resampled street runs and the highway, named with made-up addresses */
export function makeSpots(runs: { x: number; z: number }[][], seed = 4242): Spot[] {
  const rng = mulberry32(seed), out: Spot[] = [];
  for (const r of runs) {
    let acc = 0;
    for (let i = 1; i < r.length; i++) {
      const d = Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z); acc += d;
      if (acc >= 150) { acc = 0; out.push({ id: out.length, x: r[i].x, z: r[i].z, name: addressFor(out.length, rng) }); }
    }
  }
  return out;
}

export class DeliveryGame {
  readonly shift: DeliveryShift;
  readonly group = new THREE.Group();
  private beacons = new Map<string, THREE.Group>();
  private hud = document.createElement('div');
  private arrow = document.createElement('div');
  private ended = false;
  private t = 0;
  private statusT = 0;

  constructor(tier: ShiftTier['id'], spots: Spot[], private scene: THREE.Scene, private ground: (x: number, z: number) => number, private onEnd: (o: Outcome) => void) {
    style();
    this.shift = new DeliveryShift(tier, spots);
    scene.add(this.group);
    this.hud.className = 'ge-dl'; document.body.appendChild(this.hud);
    this.arrow.className = 'ge-arrow'; this.arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l8 18-8-5-8 5z"/></svg><span></span>'; document.body.appendChild(this.arrow);
  }

  private beacon(key: string, x: number, z: number, color: number, drop: boolean): THREE.Group {
    let g = this.beacons.get(key);
    if (g) return g;
    g = new THREE.Group();
    const y = this.ground(x, z);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: drop ? 0.5 : 0.34, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(drop ? 4 : 3, drop ? 4 : 3, 160, 20, 1, true), mat); beam.position.y = 80; g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(13.5, 15.5, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; g.add(ring);
    g.position.set(x, y, z); this.group.add(g); this.beacons.set(key, g);
    return g;
  }
  private syncBeacons(): void {
    const want = new Set<string>();
    for (const j of this.shift.offers) { const k = 'p' + j.id; want.add(k); this.beacon(k, j.from.x, j.from.z, KIND_COLOR[j.kind], false); }
    for (const j of this.shift.carrying) { const k = 'd' + j.id; want.add(k); this.beacon(k, j.to.x, j.to.z, 0xffffff, true); }
    for (const [k, g] of this.beacons) if (!want.has(k)) { this.group.remove(g); g.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); }); this.beacons.delete(k); }
    const pulse = 1 + 0.07 * Math.sin(this.t * 5);
    for (const [k, g] of this.beacons) g.children[1].scale.setScalar(k[0] === 'd' ? pulse : 1);
  }

  /** advance the shift; `yaw` is the car's heading, for the pointer */
  update(dt: number, car: CarFeed, yaw: number): void {
    if (this.ended) return;
    this.t += dt;
    const events = this.shift.update(dt, car);
    for (const e of events) this.handle(e);
    this.syncBeacons();
    this.draw(car, yaw);
  }

  private handle(e: ShiftEvent): void {
    switch (e.type) {
      case 'pickup': showBanner(`${KIND_NAME[e.job.kind]} aboard → ${e.job.to.name} · ${Math.round(e.job.allowedSec)} s`, ''); break;
      case 'deliver': showBanner(e.onTime ? `+${e.pay.toLocaleString()} cr${e.mult > 1 ? ` ×${e.mult}` : ''}${e.tip ? ` · tip ${e.tip}` : ''} · +${e.bonusSec}s · chain ${e.chain}` : `Late drop: +${e.pay.toLocaleString()} cr · chain lost`, e.onTime ? 'gold' : 'bad'); break;
      case 'late': showBanner(`Late for ${e.job.to.name}!`, 'bad'); break;
      case 'failed': showBanner(`Order lost: ${e.job.to.name}`, 'bad'); break;
      case 'hit': if (e.job.kind === 'passenger') showBanner('Easy! Your passenger felt that.', 'bad', 1400); else if (e.job.fragile) showBanner('Careful! Fragile cargo.', 'bad', 1400); break;
      case 'end': this.finish(e.summary); break;
      default: break;
    }
  }

  private finish(summary: ReturnType<DeliveryShift['summary']>): void {
    if (this.ended) return;
    this.ended = true;
    const o = garage.recordDelivery(summary);
    const t = TIERS[summary.tier];
    showCard(`${t.name} over`, `${summary.deliveries} deliveries · ${summary.onTime} on time · best chain ${summary.chainBest}`, o, () => this.onEnd(o));
  }
  /** the player leaves the shift (Escape, or back to the map) */
  quit(): void { if (!this.ended) this.handle(this.shift.quit()); }

  private draw(car: CarFeed, yaw: number): void {
    const s = this.shift, t = s.tier;
    const m = Math.max(0, Math.floor(s.clock / 60)), sec = Math.max(0, Math.floor(s.clock % 60));
    const jobs = s.carrying.map((j) => {
      const frac = Math.max(0, Math.min(1, j.left / j.allowedSec)), late = j.left < 0;
      return `<div class="ge-job"><i style="background:${KIND_CSS[j.kind]}"></i><span>${KIND_NAME[j.kind]} → ${esc(j.to.name)}</span><b style="color:${late ? '#ff5d73' : '#fff'}">${late ? '+' : ''}${Math.abs(Math.round(j.left))}s</b><div class="bar"><u style="width:${frac * 100}%;background:${late ? '#ff5d73' : frac < 0.25 ? '#ffd166' : KIND_CSS[j.kind]}"></u></div></div>`;
    }).join('');
    const hint = s.carrying.length < t.capacity && s.offers.length ? `<div class="ge-job" style="opacity:.7"><i style="background:#666"></i><span>${s.carrying.length}/${t.capacity} loaded · drive into a beam and slow down to pick up</span><b></b></div>` : '';
    this.hud.innerHTML = `<div class="ge-top"><span class="ge-clock ${s.clock < 20 ? 'low' : ''}">${m}:${String(sec).padStart(2, '0')}</span><span class="ge-chain">CHAIN ${s.chain}${s.mult > 1 ? ` · ×${s.mult}` : ''}</span><span class="ge-earn">${cr(s.earnings)}</span></div>${jobs}${hint}`;
    const tg = nextTarget(s, car);
    if (tg) {
      const ang = Math.atan2(tg.spot.x - car.x, tg.spot.z - car.z) - yaw;       // 0 = straight ahead
      (this.arrow.firstElementChild as SVGElement).style.transform = `rotate(${(-ang * 180) / Math.PI + 180}deg)`;
      this.arrow.style.color = tg.kind === 'drop' ? '#ffffff' : KIND_CSS[tg.job.kind];
      (this.arrow.lastElementChild as HTMLElement).textContent = `${tg.kind === 'drop' ? 'DROP' : 'PICKUP'} ${tg.dist >= 1000 ? (tg.dist / 1000).toFixed(1) + ' km' : Math.round(tg.dist) + ' m'}`;
      this.arrow.style.display = 'block';
    } else this.arrow.style.display = 'none';
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); });
    this.beacons.clear(); this.hud.remove(); this.arrow.remove();
  }
}
export { TIER_LIST, TIERS };
