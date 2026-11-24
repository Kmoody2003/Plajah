// Grovewardens × player: the co-op side (design: docs/rift-realm-grovewardens-coop.md).
// The wardens themselves (bodies, walks, their moves) are the ents session's (src/ents/, `__rr.ents`). This file:
//  · Call (hold Y): the nearest willing warden walks with you for 90 s. Assist (tap Y): it does its signature move on
//    your lock-on target (or ahead). A dark soul is refused; a light soul gets a shorter cooldown.
//  · Synergy windows: when a warden's move lands near you ('ent-move' phase 'hit' on the forest network) a window opens
//    with a prompt; hit the key in time for the combined attack (12 signature combos, one per warden, in WARDEN_COMBOS).
// Built for Void Stalker first; each vessel will get its own takes on these (Kenne's fight-move set is coming).
import * as THREE from 'three/webgpu';
import type { Recipe, VfxSystem } from '../../../../services/vfx';
import { KILL_BURST } from '../../../../services/vfx';
import { LAVA_EMBERS, ROCK_IMPACT, SPARK_ARC, VENT_BURST } from '../../../../services/vfx/hazards';
import type { PlayerController } from '../player';
import type { DangerAudio } from './audio';
import type { PlayerStatus } from './status';
import { forest, type ForestEvent } from './forest';
import { abs, color, dot, float, normalView, positionViewDirection } from 'three/tsl';

export type ComboKey = 'strike' | 'heavy' | 'surge' | 'jump' | 'dash' | 'fire' | 'passive';
export type ComboFx = 'bark-ward' | 'void-burst' | 'rising-reap' | 'lumen-charge' | 'petal-storm' | 'spore-bloom' | 'thornbreak'
  | 'ember-rain' | 'skyroot-leap' | 'warden-hurl' | 'willow-lash' | 'frost-lock' | 'grove-blessing';
export interface ComboDef {
  /** The warden move (ents MOVES id) that opens the window. */
  move: string;
  name: string;
  key: ComboKey;
  fx: ComboFx;
  /** Seconds the window stays open. */
  window: number;
  /** Damage of the combined attack (before the player's multipliers). */
  dmg: number;
  /** Reach in metres. */
  r: number;
  color: number;
}

/** Each warden's signature combo, keyed to the warden's own signature move (src/ents/wardens.ts `signature`).
 *  Plain data; localStorage 'rrWardenCombos' merges over it. */
export const WARDEN_COMBOS: Record<string, ComboDef> = {
  oak: { move: 'root-grapple', name: 'Grapple Rend', key: 'strike', fx: 'thornbreak', window: 3, dmg: 60, r: 11, color: 0x9cff6a },
  banyan: { move: 'root-cage', name: 'Void Burst', key: 'surge', fx: 'void-burst', window: 4, dmg: 120, r: 10, color: 0xb36aff },
  baobab: { move: 'chest-slam', name: 'Rising Reap', key: 'strike', fx: 'rising-reap', window: 1.8, dmg: 55, r: 18, color: 0x7ae8ff },
  bioluminescent: { move: 'lumen-pulse', name: 'Lumen Charge', key: 'dash', fx: 'lumen-charge', window: 3, dmg: 40, r: 18, color: 0x3ae6ff },
  cherry: { move: 'petal-storm', name: 'Petal Storm', key: 'heavy', fx: 'petal-storm', window: 10, dmg: 45, r: 16, color: 0xffa8d8 },
  fungal: { move: 'spore-burst', name: 'Spore Bloom', key: 'passive', fx: 'spore-bloom', window: 12, dmg: 18, r: 15, color: 0xffb04a },
  ironwood: { move: 'thorn-field', name: 'Thornbreak', key: 'strike', fx: 'thornbreak', window: 2, dmg: 70, r: 16, color: 0xff4a3a },
  pine: { move: 'sap-wave', name: 'Ember Rain', key: 'fire', fx: 'ember-rain', window: 3, dmg: 60, r: 4, color: 0xffa030 },
  sequoia: { move: 'titan-hammer', name: 'Hammerfall Leap', key: 'jump', fx: 'skyroot-leap', window: 2, dmg: 90, r: 10, color: 0xc8ff9a },
  mangrove: { move: 'bog-drag', name: 'Mire Reap', key: 'strike', fx: 'thornbreak', window: 3.5, dmg: 55, r: 13, color: 0x8ac86a },
  willow: { move: 'vine-lash', name: 'Willow Lash', key: 'strike', fx: 'willow-lash', window: 2.2, dmg: 50, r: 25, color: 0xb8ff6a },
  birch: { move: 'blizzard', name: 'Frost Lock', key: 'strike', fx: 'frost-lock', window: 4, dmg: 30, r: 22, color: 0xbfe8ff },
};
/** The shared moves (any warden, and every warden before its own body lands). */
export const MOVE_COMBOS: Record<string, ComboDef> = {
  smash: { ...WARDEN_COMBOS.baobab, move: 'smash', r: 10 },
  sweep: { ...WARDEN_COMBOS.baobab, move: 'sweep', dmg: 35, r: 14 },
  'root-trap': { ...WARDEN_COMBOS.banyan, move: 'root-trap', r: 12 },
  impale: { ...WARDEN_COMBOS.ironwood, move: 'impale', r: 6 },
  shield: { move: 'shield', name: 'Bark Ward', key: 'passive', fx: 'bark-ward', window: 6, dmg: 0, r: 9, color: 0x9cff6a },
  lift: { move: 'lift', name: 'Skyroot Leap', key: 'jump', fx: 'skyroot-leap', window: 2.5, dmg: 80, r: 6, color: 0xc8ff9a },
  throw: { move: 'throw', name: 'Warden Hurl', key: 'strike', fx: 'warden-hurl', window: 2, dmg: 70, r: 5, color: 0x8aff7a },
  bless: { move: 'bless', name: 'Grove Blessing', key: 'passive', fx: 'grove-blessing', window: 20, dmg: 0, r: 12, color: 0xffe9a0 },
};
/** Warden kind names as the ents session spells them → the table's key. */
const KIND_ALIAS: Record<string, string> = { 'ancient-oak': 'oak', 'cherry-blossom': 'cherry', 'fungal-spore': 'fungal', 'ironwood-thorn': 'ironwood', 'pine-sentinel': 'pine', redwood: 'sequoia', 'giant-sequoia': 'sequoia', 'swamp-mangrove': 'mangrove', 'weeping-willow': 'willow', 'white-birch': 'birch' };

function combos(): Record<string, ComboDef> {
  const out = { ...WARDEN_COMBOS };
  try { const raw = localStorage.getItem('rrWardenCombos'); if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, Partial<ComboDef>>)) out[k] = { ...(out[k] ?? WARDEN_COMBOS.baobab), ...v }; } catch { /* ignore a bad override */ }
  return out;
}

// ── looks ──
const VOID_IMPLODE: Recipe = {
  id: 'void_implode',
  emitters: [
    { layer: 'add', shape: 'ring', count: 1, life: 0.5, speed: 0, size: [9, 0.4], color: [0xe0b0ff, 0x7a2aff], intensity: 2, alpha: [0.2, 1] },
    { layer: 'add', shape: 'soft', count: [30, 40], delay: 0.45, life: [0.6, 1.2], speed: [4, 10], spread: 1, size: [0.25, 0.02], color: [0xffffff, 0x9a4aff], intensity: 3 },
    { layer: 'add', shape: 'ring', count: 1, delay: 0.45, life: 0.7, speed: 0, size: [0.5, 14], color: [0xffffff, 0x7a2aff], intensity: 2, alpha: [1, 0] },
  ],
  light: { color: 0x9a4aff, intensity: 30, range: 20, life: 0.8 },
  shake: 0.5,
};
const PETAL_BURST: Recipe = {
  id: 'petal_burst',
  emitters: [
    { layer: 'add', shape: 'soft', count: [50, 70], life: [0.8, 1.6], speed: [5, 11], spread: 1, size: [0.12, 0.05], color: [0xffe0f0, 0xff7ab8], intensity: 1.6, drag: 2, turbulence: 2 },
    { layer: 'add', shape: 'ring', count: 1, life: 0.5, speed: 0, size: [0.5, 15], color: [0xffffff, 0xff9ad0], intensity: 1.5, alpha: [0.9, 0] },
  ],
};
const PETAL_AURA: Recipe = {
  id: 'petal_aura',
  emitters: [{ layer: 'add', shape: 'soft', count: [2, 3], life: [0.8, 1.2], speed: [0.5, 1.2], spread: 1, size: [0.08, 0.04], color: [0xffe0f0, 0xff7ab8], intensity: 1.4, turbulence: 2, radius: 0.9 }],
};
const SPORE_CLOUD: Recipe = {
  id: 'spore_cloud',
  emitters: [
    { layer: 'alpha', shape: 'smoke', count: [6, 9], life: [1, 1.8], speed: [1, 2.5], spread: 1, size: [0.4, 1.6], color: [0xffb04a, 0x6a4a1a], alpha: [0.55, 0], drag: 1.5 },
    { layer: 'add', shape: 'soft', count: [12, 18], life: [0.8, 1.4], speed: [0.6, 2], spread: 1, size: [0.06, 0.02], color: [0xffe0a0, 0xffa030], intensity: 2, turbulence: 1.5 },
  ],
};
const FROST_GALE: Recipe = {
  id: 'frost_gale',
  emitters: [
    { layer: 'add', shape: 'soft', count: [40, 60], life: [0.8, 1.5], speed: [6, 12], spread: 1, size: [0.1, 0.04], color: [0xffffff, 0xbfe8ff], intensity: 1.8, drag: 1.5, turbulence: 3 },
    { layer: 'alpha', shape: 'smoke', count: [8, 12], life: [1, 1.6], speed: [3, 6], spread: 1, size: [0.8, 3], color: [0xe8f6ff, 0xa8d0f0], alpha: [0.5, 0], drag: 2 },
  ],
};
const ICE_SHATTER: Recipe = {
  id: 'ice_shatter',
  emitters: [{ layer: 'shard', count: [14, 20], life: [0.6, 1.1], speed: [4, 9], spread: 1, size: [0.14, 0.05], color: [0xe8f8ff, 0x9fd8ff], intensity: 1.2, alpha: [1, 1], gravity: 12, spin: [6, 14], bounce: 0.3 }],
  light: { color: 0xbfe8ff, intensity: 10, range: 10, life: 0.3 },
};
const WARD_RING: Recipe = {
  id: 'ward_ring',
  emitters: [{ layer: 'add', shape: 'ring', count: 1, life: 0.9, speed: 0, size: [0.8, 3.2], color: [0xd8ffb0, 0x6aff6a], intensity: 1.2, alpha: [0.8, 0] }],
};
const LUMEN_TRAIL: Recipe = {
  id: 'lumen_trail',
  emitters: [{ layer: 'add', shape: 'soft', count: [4, 6], life: [0.3, 0.6], speed: [0.5, 2], spread: 1, size: [0.15, 0.02], color: [0xffffff, 0x3ae6ff], intensity: 3 }],
};
const METEOR_TELL: Recipe = {
  id: 'meteor_tell',
  emitters: [{ layer: 'add', shape: 'ring', count: 1, life: 0.7, speed: 0, size: [4.5, 1], color: [0xffd080, 0xff5a10], intensity: 1.6, alpha: [0.3, 1] }],
};
const COMBO_FLASH: Recipe = {
  id: 'combo_flash',
  emitters: [{ layer: 'add', shape: 'soft', count: [10, 14], life: [0.3, 0.6], speed: [2, 5], spread: 1, size: [0.12, 0.02], color: ['tint+white', 'tint'], intensity: 3 }],
  light: { color: 0xffffff, intensity: 14, range: 12, life: 0.25 },
  shake: 0.2,
};
/** The big finishers land with a heavier jolt. */
const COMBO_SLAM: Recipe = {
  id: 'combo_slam',
  emitters: [{ layer: 'add', shape: 'ring', count: 1, life: 0.45, speed: 0, size: [0.6, 9], color: ['tint+white', 'tint'], intensity: 1.6, alpha: [0.9, 0] }],
  shake: 0.55,
};
const HEAVY: ComboFx[] = ['rising-reap', 'void-burst', 'thornbreak', 'skyroot-leap', 'warden-hurl', 'frost-lock'];

/** Each combo's stinger (dz_wd_*.mp3, cut from the matching co-op clip). */
const SFX: Record<ComboFx, string> = {
  'bark-ward': 'wd_ward', 'void-burst': 'wd_void', 'rising-reap': 'wd_reap', 'lumen-charge': 'wd_lumen', 'petal-storm': 'wd_petal', 'spore-bloom': 'wd_spore',
  thornbreak: 'wd_thorn', 'ember-rain': 'wd_ember', 'skyroot-leap': 'wd_leap', 'warden-hurl': 'wd_hurl', 'willow-lash': 'wd_lash', 'frost-lock': 'wd_frost', 'grove-blessing': 'wd_ward',
};

interface EntsApi {
  list(): { id: number; kind: string; pos: THREE.Vector3; awake: number | boolean; busy?: boolean; hp?: number; maxHp?: number }[];
  command(id: number, move: string, target?: { x: number; z: number } | null): boolean;
  moves?(id?: number): string[];
  follow(id: number, target: THREE.Object3D | null): boolean;
}
interface Foe { id: number; pos: THREE.Vector3; hp: number; maxHp: number; who: string; kind: 'enemy' | 'predator'; boss?: boolean }

export interface WardensEnv {
  player: PlayerController;
  vfx: VfxSystem;
  audio: DangerAudio;
  status: PlayerStatus;
  scene: THREE.Scene;
  ground(x: number, z: number): number;
  /** Everything hostile (the rift's creatures and the predators). */
  foes(): Foe[];
  /** Hit one foe for the player (credit, XP): returns killed. */
  hit(f: Foe, dmg: number, from: THREE.Vector3, o?: { knock?: number; launch?: number; hitstun?: number; toward?: THREE.Vector3 }): boolean;
  heal(n: number): void;
  charge(n: number, src: string): void;
  soul(): number;
  say(text: string, color: string): void;
  /** The lock-on target's position, if any. */
  lockTarget(): THREE.Vector3 | null;
}

type Window = { c: ComboDef; wardenId: number; at: THREE.Vector3; t: number; frozen?: Foe[] };

export class Wardens {
  private table = combos();
  private win: Window | null = null;
  private rally: { id: number; t: number; kind: string } | null = null;
  private assistCd = 0;
  private yDown = -1; private yHeld = false;
  private pressed = new Set<ComboKey>();
  private prompt: HTMLDivElement; private bar: HTMLDivElement; private label: HTMLSpanElement; private chip: HTMLDivElement;
  private v = new THREE.Vector3(); private v2 = new THREE.Vector3();
  private arcs: { obj: THREE.Line; t: number }[] = [];
  private arcMat = new THREE.LineBasicMaterial({ color: 0xc8a0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  private ice: { mesh: THREE.Mesh; f: Foe; t: number }[] = [];
  private iceGeo = new THREE.IcosahedronGeometry(1, 1);
  private iceMat = (() => {   // clear blue ice: a fresnel rim, mostly see-through so the frozen creature shows inside
    const m = new THREE.MeshStandardNodeMaterial({ color: 0x9fd8ff, roughness: 0.04, metalness: 0, transparent: true, depthWrite: false });
    const rim = float(1).sub(abs(dot(normalView, positionViewDirection))).pow(2);
    m.opacityNode = rim.mul(0.7).add(0.12);
    m.emissiveNode = color(0x6ac8ff).mul(rim.mul(1.4));
    return m;
  })();
  private pending: { at: number; fn: () => void }[] = [];
  private clock = 0;
  private wardT = 0; private petalArmed = 0; private sporeHits = 0; private diveArmed = 0; private lumenT = 0;
  private lumenHit = new Set<number>();
  private groveT = 0;
  private unsub: (() => void)[] = [];
  private padPrev: boolean[] = [];

  constructor(private env: WardensEnv) {
    const key = (e: KeyboardEvent, down: boolean) => {
      if (e.code === 'KeyY') {
        if (down && !this.yHeld) { this.yHeld = true; this.yDown = performance.now(); }
        if (!down && this.yHeld) { this.yHeld = false; if (performance.now() - this.yDown < 400) this.assist(); }
        return;
      }
      if (!down || e.repeat) return;
      const k: ComboKey | null = e.code === 'KeyF' || e.code === 'KeyE' ? 'strike' : e.code === 'KeyG' ? 'heavy' : e.code === 'KeyQ' ? 'surge' : e.code === 'Space' ? 'jump' : e.code === 'ShiftLeft' ? 'dash' : null;
      if (k) this.pressed.add(k);
    };
    window.addEventListener('keydown', (e) => key(e, true));
    window.addEventListener('keyup', (e) => key(e, false));
    window.addEventListener('mousedown', (e) => { if (e.button === 0) this.pressed.add('fire'); if (e.button === 2) this.pressed.add('strike'); });
    window.addEventListener('blur', () => { this.yHeld = false; });
    this.prompt = document.createElement('div');
    this.prompt.style.cssText = 'position:fixed;left:50%;top:30%;transform:translateX(-50%);z-index:14;pointer-events:none;text-align:center;font:800 15px/1.3 system-ui,sans-serif;letter-spacing:.14em;text-shadow:0 0 10px #000;opacity:0;transition:opacity .12s';
    this.label = document.createElement('span');
    const track = document.createElement('div'); track.style.cssText = 'margin:6px auto 0;width:200px;height:4px;background:#ffffff22;border-radius:2px;overflow:hidden';
    this.bar = document.createElement('div'); this.bar.style.cssText = 'height:100%;width:100%;background:currentColor';
    track.appendChild(this.bar); this.prompt.append(this.label, track);
    this.chip = document.createElement('div');
    this.chip.style.cssText = 'position:fixed;right:18px;bottom:152px;z-index:12;pointer-events:none;padding:4px 10px;border:1px solid #8aff9a88;border-radius:3px;background:#03120ab0;color:#b8ffc0;font:700 11px system-ui;letter-spacing:.1em;display:none';
    document.body.append(this.prompt, this.chip);
    env.scene.add(this.ring);
    this.unsub.push(forest.subscribe('ent-move', (ev) => this.onMove(ev)));
  }

  private ents(): EntsApi | null { return (globalThis as unknown as { __rr?: { ents?: EntsApi | null } }).__rr?.ents ?? null; }
  /** The combo a warden's move opens: its signature for its own moves (e.g. the White Birch's 'blizzard') or the shared
   *  move its signature names; the shared table otherwise. */
  private comboFor(kind: string, move: string): ComboDef | null {
    const k = KIND_ALIAS[kind] ?? kind, sig = this.table[k];
    if (sig && (sig.move === move || !(move in MOVE_COMBOS))) return sig;
    return MOVE_COMBOS[move] ?? null;
  }
  /** What Assist asks for: the warden's own move if it has one (ents.moves(id) beyond the shared set), else its signature. */
  private signature(id: number, kind: string) {
    const sig = this.table[KIND_ALIAS[kind] ?? kind]?.move;
    return sig && (this.ents()?.moves?.(id) ?? [sig]).includes(sig) ? sig : 'smash';
  }
  private keyName(k: ComboKey) { return k === 'strike' ? 'F / RMB' : k === 'heavy' ? 'G' : k === 'surge' ? 'SURGE' : k === 'jump' ? 'SPACE' : k === 'dash' ? 'SHIFT' : k === 'fire' ? 'FIRE' : ''; }

  /** Damage taken while a Bark Ward holds is mostly soaked. */
  absorb(dmg: number) { return this.wardT > 0 ? dmg * 0.2 : dmg; }
  /** Strikes from under a Bark Ward or a Grove Blessing hit harder. */
  get dmgMul() { return (this.wardT > 0 ? 1.3 : 1) * (this.groveT > 0 ? 1.2 : 1); }

  // ── call / assist ──
  private call() {
    const E = this.ents(); if (!E) { this.env.say('No warden is near enough to hear you.', '#b8ffc0'); return; }
    const pp = this.env.player.object.position, s = this.env.soul();
    if (s <= -0.3) { this.env.say('The wardens will not answer a darkened soul.', '#c08cff'); return; }
    let best: ReturnType<EntsApi['list']>[number] | null = null, bd = 90;
    for (const w of E.list()) { const d = w.pos.distanceTo(pp), awake = typeof w.awake === 'number' ? w.awake : w.awake ? 1 : 0; if (d < bd && (s >= 0.3 || awake > 0.4)) { best = w; bd = d; } }
    if (!best) { this.env.say('No warden is near enough, or awake enough, to answer.', '#b8ffc0'); return; }
    E.follow(best.id, this.env.player.object);
    this.rally = { id: best.id, t: 90, kind: best.kind };
    forest.notify('warden-call', pp, { id: best.id, kind: best.kind }, 'player');
    this.env.say(`A WARDEN WALKS WITH YOU · tap [Y] for its ${this.table[KIND_ALIAS[best.kind] ?? best.kind]?.name ?? 'strength'}`, '#b8ffc0');
    this.env.audio.play('rumble', best.pos, { gain: 0.6, rate: 0.7 });
  }
  private assist() {
    const E = this.ents();
    if (!E || !this.rally) { this.env.say('Hold [Y] to call a warden first.', '#b8ffc0'); return; }
    if (this.assistCd > 0) { this.env.say(`The warden gathers itself · ${Math.ceil(this.assistCd)} s`, '#b8ffc0'); return; }
    const pp = this.env.player.object.position, t = this.env.lockTarget();
    const at = t ? { x: t.x, z: t.z } : { x: pp.x - Math.sin(this.env.player.bodyYaw) * 12, z: pp.z - Math.cos(this.env.player.bodyYaw) * 12 };
    const move = this.signature(this.rally.id, this.rally.kind);
    // a shelter or a lift lands on the player, not the target
    const onPlayer = move === 'shield' || move === 'lift' || move === 'throw' || move === 'bless';
    if (E.command(this.rally.id, move, onPlayer ? { x: pp.x, z: pp.z } : at)) this.assistCd = this.env.soul() >= 0.3 ? 10 : 15;
  }

  // ── synergy windows ──
  private onMove(ev: ForestEvent) {
    const phase = ev.data.phase;
    const E = this.ents(), id = Number(ev.data.id), move = String(ev.data.move ?? '');
    const w = E?.list().find((q) => q.id === id), c = this.comboFor(w?.kind ?? 'placeholder', move);
    if (!c) return;
    const pp = this.env.player.object.position, at = new THREE.Vector3(ev.pos.x, this.env.ground(ev.pos.x, ev.pos.z), ev.pos.z);
    if (Math.hypot(at.x - pp.x, at.z - pp.z) > c.r + 14 || this.env.soul() <= -0.3) { if (phase !== 'tell') this.heads = null; return; }
    if (phase === 'tell') { this.heads = { c, at, t: 3 }; return; }
    if (phase === 'end') { if (this.heads?.c === c) this.heads = null; return; }
    this.heads = null;
    this.open(c, id, at);
  }
  /** A warden is winding up a move with a combo: the heads-up (prompt, dim) and the ring where it lands. */
  private heads: { c: ComboDef; at: THREE.Vector3; t: number } | null = null;
  private popT = 9;
  private ring = (() => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const g = new THREE.RingGeometry(0.93, 1, 64); g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, m); mesh.visible = false; mesh.renderOrder = 5; mesh.frustumCulled = false;
    return mesh;
  })();
  /** Open a synergy window (also for scripted / debug use: `__rr.danger.wardens.open(...)`). */
  open(c: ComboDef, wardenId: number, at: THREE.Vector3) {
    this.win = { c, wardenId, at, t: c.window };
    this.popT = 0;
    const env = this.env;
    if (c.key === 'passive' || c.fx === 'frost-lock' || c.fx === 'petal-storm') env.audio.play(SFX[c.fx], env.player.object.position, { gain: 0.8 });
    switch (c.fx) {   // passive halves land as the window opens
      case 'bark-ward': this.wardT = c.window; env.status.buff('ward', 'BARK WARD', '#9cff6a', c.window); env.vfx.spawn(WARD_RING, this.v.copy(env.player.object.position).setY(env.player.object.position.y + 0.1)); this.win = null; break;
      case 'grove-blessing': if (env.soul() >= 0.3) { this.groveT = c.window; env.heal(25); env.status.buff('grove', 'GROVE BLESSING', '#ffe9a0', c.window); env.vfx.spawn(WARD_RING, this.v.copy(env.player.object.position), { tint: 0xffe9a0 }); } this.win = null; break;
      case 'spore-bloom': env.heal(40); this.sporeHits = 3; env.status.buff('spores', 'SPORE BLOOM ×3', '#ffb04a', c.window); env.vfx.spawn(SPORE_CLOUD, this.v.copy(env.player.object.position).setY(env.player.object.position.y + 0.8)); this.win = null; break;
      case 'petal-storm': this.petalArmed = c.window; env.status.buff('petal', 'PETAL STORM · [G]', '#ffa8d8', c.window); break;
      case 'frost-lock': {
        env.vfx.spawn(FROST_GALE, this.v.copy(at).setY(at.y + 1));
        const frozen: Foe[] = [];
        for (const f of env.foes()) if (f.pos.distanceTo(at) < c.r) { env.hit(f, c.dmg, at, { hitstun: 3 }); frozen.push(f); this.freeze(f, 3); }
        this.win.frozen = frozen;
        break;
      }
      default: break;
    }
    if (this.win) { env.audio.play('zap', at, { gain: 0.4, rate: 1.6 }); this.pressed.clear(); }
  }

  private fire(c: ComboDef, at: THREE.Vector3) {
    const env = this.env, pl = env.player, pp = pl.object.position;
    env.say(c.name.toUpperCase(), `#${c.color.toString(16).padStart(6, '0')}`);
    env.audio.play(SFX[c.fx], pp, { gain: 0.9 });
    forest.notify('warden-combo', pp, { combo: c.name, fx: c.fx }, 'player');
    env.vfx.spawn(COMBO_FLASH, this.v.copy(pp).setY(pp.y + 1.2), { tint: c.color });
    if (HEAVY.includes(c.fx)) env.vfx.spawn(COMBO_SLAM, this.v.copy(at).setY(at.y + 0.15), { tint: c.color });
    this.popT = 0;
    const dmg = (f: Foe, d: number, o?: Parameters<WardensEnv['hit']>[3]) => env.hit(f, Math.round(d), at, o);
    switch (c.fx) {
      case 'rising-reap': {
        pl.hop(9); pl.airHang(0.8); pl.playClip('heavy_2', 1, 0.6);
        const hit = env.foes().filter((f) => f.pos.distanceTo(at) < c.r + 2).slice(0, 8);
        hit.forEach((f, i) => { dmg(f, c.dmg * 2.2, { launch: 6, hitstun: 0.8 }); if (i) this.arc(hit[i - 1].pos, f.pos, c.color); else this.arc(pp, f.pos, c.color); });
        env.vfx.spawn(SPARK_ARC, this.v.copy(at).setY(at.y + 1), { tint: c.color, count: 2 });
        env.audio.play('zap', at, { gain: 0.8, rate: 0.9 });
        break;
      }
      case 'void-burst': {
        env.vfx.spawn(VOID_IMPLODE, this.v.copy(at).setY(at.y + 1));
        env.audio.play('erupt', at, { gain: 0.9, rate: 1.4 });
        this.later(0.45, () => { for (const f of env.foes()) if (f.pos.distanceTo(at) < c.r) dmg(f, c.dmg, { knock: 2, launch: 3 }); });
        pl.playClip('finisher', 1, 0.8);
        break;
      }
      case 'lumen-charge': this.lumenT = 0.7; this.lumenHit.clear(); env.charge(30, 'creature'); env.audio.play('zap', pp, { gain: 0.8, rate: 1.2 }); break;
      case 'thornbreak': {
        env.vfx.spawn(ROCK_IMPACT, this.v.copy(at).setY(at.y + 0.3), { scale: 1.5 });
        for (const f of env.foes()) if (f.pos.distanceTo(at) < c.r) { dmg(f, c.dmg * 1.6, { hitstun: 1.5, launch: 4 }); env.vfx.spawn(KILL_BURST, this.v.copy(f.pos).setY(f.pos.y + 1), { tint: c.color, count: 0.4 }); }
        pl.playClip('heavy_3', 1, 0.6); env.audio.play('crack', at, { gain: 0.9, rate: 0.7 });
        break;
      }
      case 'ember-rain': {
        const t = env.lockTarget() ?? this.v2.set(pp.x - Math.sin(pl.bodyYaw) * 16, pp.y, pp.z - Math.cos(pl.bodyYaw) * 16).clone();
        for (let i = 0; i < 3; i++) {
          const p = new THREE.Vector3(t.x + (Math.random() - 0.5) * 5, 0, t.z + (Math.random() - 0.5) * 5); p.y = env.ground(p.x, p.z);
          this.later(i * 0.25, () => env.vfx.spawn(METEOR_TELL, p.clone().setY(p.y + 0.1)));
          this.later(0.7 + i * 0.25, () => {
            env.vfx.spawn(VENT_BURST, p.clone().setY(p.y + 0.3)); env.vfx.spawn(LAVA_EMBERS, p.clone().setY(p.y + 0.5));
            env.audio.play('erupt', p, { gain: 0.8, rate: 1.2 });
            for (const f of env.foes()) if (f.pos.distanceTo(p) < c.r) dmg(f, c.dmg, { knock: 3, launch: 4 });
          });
        }
        break;
      }
      case 'skyroot-leap': pl.hop(c.move === 'lift' ? 6 : 14); pl.airHang(0.6);   // off a lift the warden already threw you up (ents 'lift'); off a hammer you ride the shock this.diveArmed = 4; env.status.buff('dive', 'DIVE SLAM · strike', '#c8ff9a', 4); env.audio.play('rumble', pp, { gain: 0.5, rate: 1.3 }); break;
      case 'warden-hurl': {
        // the warden's throw already flings you (ents 'throw'); the strike turns the landing into a slam
        const t = env.lockTarget();
        if (t) { const dir = this.v.subVectors(t, pp).setY(0); if (dir.lengthSq() > 4) pl.lunge(dir, Math.min(18, dir.length() / 0.7), 0.5); }
        pl.playClip('heavy_3', 1, 0.6);
        this.later(0.7, () => { const lp = pl.object.position.clone(); env.vfx.spawn(ROCK_IMPACT, lp.clone().setY(lp.y + 0.2), { scale: 1.4 }); env.audio.play('crack', lp, { gain: 0.9, rate: 0.8 }); for (const f of env.foes()) if (f.pos.distanceTo(lp) < c.r) dmg(f, c.dmg, { knock: 4, launch: 5 }); });
        break;
      }
      case 'willow-lash': {
        const foes = env.foes().filter((f) => f.pos.distanceTo(pp) < c.r).sort((a, b) => (b.boss ? 1e6 : b.maxHp) - (a.boss ? 1e6 : a.maxHp));
        const f = foes[0]; if (!f) break;
        this.arc(at, f.pos, c.color);
        dmg(f, c.dmg, { hitstun: 2, toward: pp.clone(), knock: Math.max(0, f.pos.distanceTo(pp) - 2.5) });
        env.audio.play('crack', f.pos, { gain: 0.8, rate: 1.5 });
        break;
      }
      case 'frost-lock': {
        for (const f of this.win?.frozen ?? []) {
          if (f.hp <= 0) continue;
          if (f.pos.distanceTo(pp) > 6) continue;
          dmg(f, f.hp <= f.maxHp * 0.4 ? f.hp + 1 : c.dmg * 1.5, { knock: 3 });
          env.vfx.spawn(ICE_SHATTER, this.v.copy(f.pos).setY(f.pos.y + 1)); this.unfreeze(f);
        }
        env.audio.play('crack', pp, { gain: 0.9, rate: 1.8 });
        break;
      }
      default: break;
    }
  }

  private arc(a: THREE.Vector3, b: THREE.Vector3, col: number) {
    const pts: THREE.Vector3[] = [], n = 10;
    for (let i = 0; i <= n; i++) { const t = i / n, j = i && i < n ? 0.6 : 0; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j, a.y + 1.2 + (b.y - a.y) * t + (Math.random() - 0.5) * j, a.z + (b.z - a.z) * t + (Math.random() - 0.5) * j)); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.arcMat);
    this.arcMat.color.set(col); line.frustumCulled = false;
    this.env.scene.add(line); this.arcs.push({ obj: line, t: 0.35 });
  }
  private freeze(f: Foe, sec: number) {
    const m = new THREE.Mesh(this.iceGeo, this.iceMat); m.scale.set(1.3, 1.1, 1.6); m.rotation.y = Math.random() * 6.28; m.position.copy(f.pos).setY(f.pos.y + 1.2);
    this.env.scene.add(m); this.ice.push({ mesh: m, f, t: sec });
  }
  private unfreeze(f: Foe) { for (const i of this.ice) if (i.f.id === f.id && i.f.kind === f.kind) i.t = 0; }
  private later(sec: number, fn: () => void) { this.pending.push({ at: this.clock + sec, fn }); }

  update(dt: number) {
    this.clock += dt; this.assistCd -= dt; this.wardT -= dt; this.groveT -= dt; this.petalArmed -= dt; this.diveArmed -= dt; this.lumenT -= dt;
    const env = this.env, pl = env.player, pp = pl.object.position;
    // the controller: X strike, Y surge, A jump, B dash, RT fire
    const pad = navigator.getGamepads ? navigator.getGamepads()?.[0] : null;
    if (pad) {
      const map: [number, ComboKey][] = [[2, 'strike'], [3, 'surge'], [0, 'jump'], [1, 'dash'], [7, 'fire']];
      for (const [b, k] of map) { const on = !!pad.buttons[b]?.pressed; if (on && !this.padPrev[b]) this.pressed.add(k); this.padPrev[b] = on; }
    }
    if (this.yHeld && performance.now() - this.yDown > 800) { this.yHeld = false; this.call(); }
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].at <= this.clock) { const p = this.pending.splice(i, 1)[0]; p.fn(); }
    // rally
    if (this.rally && (this.rally.t -= dt) <= 0) { this.ents()?.follow(this.rally.id, null); this.rally = null; env.say('The warden returns to its grove.', '#b8ffc0'); }
    this.chip.style.display = this.rally ? 'block' : 'none';
    if (this.rally) this.chip.textContent = `WARDEN · ${this.assistCd > 0 ? `${Math.ceil(this.assistCd)} s` : '[Y] ASSIST'}`;
    // passive effects
    if (this.wardT > 0 && Math.floor(this.clock * 2) !== Math.floor((this.clock - dt) * 2)) env.heal(2);
    if (this.petalArmed > 0 && Math.random() < dt * 6) env.vfx.spawn(PETAL_AURA, this.v.copy(pp).setY(pp.y + 1));
    if (this.lumenT > 0) {
      env.vfx.spawn(LUMEN_TRAIL, this.v.copy(pp).setY(pp.y + 1));
      for (const f of env.foes()) if (!this.lumenHit.has(f.id) && f.pos.distanceTo(pp) < 4) { this.lumenHit.add(f.id); this.arc(pp, f.pos, 0x3ae6ff); env.hit(f, 40, pp, { hitstun: 0.6 }); }
    }
    // armed follow-ups (no window needed)
    if (this.pressed.has('heavy') && this.petalArmed > 0) {
      this.petalArmed = 0; env.status.endBuff('petal');
      env.vfx.spawn(PETAL_BURST, this.v.copy(pp).setY(pp.y + 1)); env.audio.play('zap', pp, { gain: 0.7, rate: 2 });
      let n = 0; for (const f of env.foes()) if (f.pos.distanceTo(pp) < 7) { env.hit(f, 45, pp, { knock: 4 }); n++; }
      if (n) env.heal(4 * n);
    }
    if (this.pressed.has('strike') && this.sporeHits > 0) {
      this.sporeHits--; env.status.buff('spores', `SPORE BLOOM ×${this.sporeHits}`, '#ffb04a', this.sporeHits ? 12 : 0);
      if (!this.sporeHits) env.status.endBuff('spores');
      const f0 = this.v.set(pp.x - Math.sin(pl.bodyYaw) * 2, pp.y + 0.8, pp.z - Math.cos(pl.bodyYaw) * 2);
      env.vfx.spawn(SPORE_CLOUD, f0, { scale: 0.7 });
      for (const f of env.foes()) if (f.pos.distanceTo(f0) < 4) env.hit(f, 18, pp, {});
    }
    if (this.pressed.has('strike') && this.diveArmed > 0) {
      this.diveArmed = 0; env.status.endBuff('dive');
      pl.playClip('heavy_3', 1, 0.5);
      this.later(0.35, () => { const lp = pl.object.position.clone(); lp.y = env.ground(lp.x, lp.z); env.vfx.spawn(VOID_IMPLODE, lp.clone().setY(lp.y + 0.5), { scale: 0.6 }); env.audio.play('erupt', lp, { gain: 0.8, rate: 1.6 }); for (const f of env.foes()) if (f.pos.distanceTo(lp) < 6) env.hit(f, 80, lp, { knock: 4, launch: 5 }); });
    }
    // the synergy window
    const w = this.win;
    if (w) {
      w.t -= dt;
      if (w.t <= 0) this.win = null;
      else if (this.pressed.has(w.c.key)) { this.fire(w.c, w.at); this.win = null; }
    }
    this.popT += dt;
    if (this.heads && (this.heads.t -= dt) <= 0) this.heads = null;
    const show = this.win, hd = !show ? this.heads : null;
    if (show) {
      const col = `#${show.c.color.toString(16).padStart(6, '0')}`, frac = show.t / show.c.window;
      this.prompt.style.color = frac < 0.35 && Math.floor(this.clock * 8) % 2 ? '#ffffff' : col;   // flashes as it runs out
      this.label.textContent = `[${this.keyName(show.c.key)}]  ${show.c.name.toUpperCase()}`;
      this.bar.style.width = `${Math.max(0, frac * 100)}%`;
      this.prompt.style.opacity = '1';
      this.prompt.style.transform = `translateX(-50%) scale(${(1 + Math.max(0, 0.25 - this.popT) * 1.6).toFixed(3)})`;
    } else if (hd && hd.c.key !== 'passive') {
      this.prompt.style.color = `#${hd.c.color.toString(16).padStart(6, '0')}`;
      this.label.textContent = `GET READY · [${this.keyName(hd.c.key)}] ${hd.c.name.toUpperCase()}`;
      this.bar.style.width = '0%';
      this.prompt.style.opacity = '0.6';
      this.prompt.style.transform = 'translateX(-50%) scale(0.9)';
    } else this.prompt.style.opacity = '0';
    // the ring on the ground: where the warden's move lands (the tell), then the combo's reach while the window is open
    const rg = show ? { c: show.c, at: show.at } : hd;
    this.ring.visible = !!rg && rg.c.fx !== 'bark-ward' && rg.c.fx !== 'grove-blessing';
    if (rg && this.ring.visible) {
      this.ring.position.copy(rg.at).setY(rg.at.y + 0.12);
      const r = Math.min(rg.c.r, 22);
      this.ring.scale.setScalar(show ? r : r * (1.15 - 0.15 * Math.sin(this.clock * 6)));
      const m = this.ring.material as THREE.MeshBasicNodeMaterial;
      m.color.set(rg.c.color);
      m.opacity = show ? 0.55 + 0.3 * Math.sin(this.clock * 10) : 0.25 + 0.15 * Math.sin(this.clock * 6);
    }
    this.pressed.clear();
    // looks
    for (let i = this.arcs.length - 1; i >= 0; i--) { const a = this.arcs[i]; if ((a.t -= dt) <= 0) { this.env.scene.remove(a.obj); a.obj.geometry.dispose(); this.arcs.splice(i, 1); } }
    for (let i = this.ice.length - 1; i >= 0; i--) {
      const c = this.ice[i];
      c.t -= dt; c.mesh.position.copy(c.f.pos).setY(c.f.pos.y + 1.2);
      if (c.t <= 0 || c.f.hp <= 0) { this.env.scene.remove(c.mesh); this.ice.splice(i, 1); if (c.t > -0.1 && c.f.hp > 0) env.vfx.spawn(ICE_SHATTER, c.mesh.position, { count: 0.5 }); }
    }
  }

  info() { return { rally: this.rally, window: this.win ? { name: this.win.c.name, key: this.win.c.key, t: +this.win.t.toFixed(2) } : null, ward: +Math.max(0, this.wardT).toFixed(1), assistCd: +Math.max(0, this.assistCd).toFixed(1), ice: this.ice.length }; }
  dispose() { for (const u of this.unsub) u(); }
}
