// The bag: what you gather in the forest (mushrooms, berries, fruit, cut meat, Chargecaps, creature gifts).
//  · Tap the eat key (H / D-pad up) on something to take it; hold to eat it on the spot (danger/eat.ts).
//  · 12 bag slots; each kind stacks up to its shape's limit (STACK). Four quick slots on 6 7 8 9 (remappable), filled
//    with the first kinds you pick up; using one plays a short eat channel that a hit interrupts.
//  · I opens the bag screen: use, drop (it lands at your feet and can be picked up again), or put a kind on a slot.
// Items you haven't eaten yet stay "??? fungus" until you learn them.
import * as THREE from 'three/webgpu';
import { color, float, sin, time } from 'three/tsl';
import type { Forage } from './forage';
import type { ForageKind, ForageShape } from './forageTable';
import type { PlayerController } from '../player';

export const STACK: Record<ForageShape, number> = { cap: 8, berries: 12, fruit: 6, meat: 4, water: 0, gift: 3 };
export const BAG_SLOTS = 12;
export const QUICK_KEYS = ['Digit6', 'Digit7', 'Digit8', 'Digit9'];

export interface Slot { kind: string; n: number }
export interface Drop { kind: string; pos: THREE.Vector3; obj: THREE.Mesh; t: number }

export interface InventoryEnv {
  scene: THREE.Scene;
  player: PlayerController;
  forage: Forage;
  ground(x: number, z: number): number;
  /** Eat `kind` from the bag: a short channel (eat.ts); `done` runs when it completes. */
  channel(kind: string, done: () => void): boolean;
  say(text: string, color: string): void;
  /** Lines for the bag screen's header (soul, mycelium, bonds). */
  status(): string[];
}

const glyph = (s: ForageShape) => (s === 'cap' ? '🍄' : s === 'berries' ? '●' : s === 'fruit' ? '◆' : s === 'meat' ? '▬' : s === 'gift' ? '✦' : '~');
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export class Inventory {
  readonly slots: Slot[] = [];
  readonly quick: (string | null)[] = [null, null, null, null];
  readonly drops: Drop[] = [];
  private hud: HTMLDivElement;
  private panel: HTMLDivElement;
  private open = false;
  private sel = -1;
  private dirty = true;
  private dropGeo = new THREE.IcosahedronGeometry(0.16, 1);
  private dropMats = new Map<string, THREE.Material>();

  constructor(private env: InventoryEnv) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const q = QUICK_KEYS.indexOf(e.code);
      if (q >= 0 && this.env.player.enabled) { const k = this.quick[q]; if (k) this.use(k); else this.env.say(`Quick slot ${q + 6} is empty · press I to fill it`, '#cfd8e6'); }
      if (e.code === 'KeyI') this.toggle();
      if (e.code === 'Escape' && this.open) this.toggle(false);
    });
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:fixed;right:18px;bottom:96px;z-index:12;display:flex;gap:6px;pointer-events:none;font:700 10px system-ui,sans-serif;color:#e2f3ff';
    this.panel = document.createElement('div');
    this.panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;width:520px;max-width:94vw;padding:18px 20px;border:1px solid #6a8aa8;border-radius:6px;background:#04101cf0;color:#e2f3ff;font:13px/1.45 system-ui,sans-serif;display:none;box-shadow:0 10px 40px #000a';
    for (const ev of ['mousedown', 'mouseup', 'click', 'pointerdown', 'wheel'] as const) this.panel.addEventListener(ev, (e) => e.stopPropagation());
    document.body.append(this.hud, this.panel);
  }

  private kind(id: string): ForageKind | undefined { return this.env.forage.kind(id); }
  name(id: string) {
    const k = this.kind(id);
    if (!k) return id;
    if (this.env.forage.known(id) || k.shape === 'meat' || k.shape === 'gift') return k.name;
    return `??? ${k.shape === 'cap' ? 'fungus' : k.shape}`;
  }
  count(id: string) { return this.slots.filter((s) => s.kind === id).reduce((a, s) => a + s.n, 0); }
  get isOpen() { return this.open; }

  /** Put one `kind` in the bag. False (and a toast) if there's no room. */
  add(id: string, quiet = false): boolean {
    const k = this.kind(id); if (!k) return false;
    const max = STACK[k.shape] || 1;
    let s = this.slots.find((x) => x.kind === id && x.n < max);
    if (!s) {
      if (this.slots.length >= BAG_SLOTS) { this.env.say('BAG FULL · press I to drop something', '#fb7185'); return false; }
      s = { kind: id, n: 0 }; this.slots.push(s);
    }
    s.n++;
    if (!this.quick.includes(id)) { const e = this.quick.indexOf(null); if (e >= 0) this.quick[e] = id; }
    if (!quiet) this.env.say(`+1 ${this.name(id)} · ${this.count(id)} in the bag`, '#cfe8ff');
    this.dirty = true;
    return true;
  }

  remove(id: string, n = 1) {
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i]; if (s.kind !== id) continue;
      const t = Math.min(n, s.n); s.n -= t; n -= t;
      if (s.n <= 0) this.slots.splice(i, 1);
    }
    if (!this.count(id)) for (let q = 0; q < 4; q++) if (this.quick[q] === id) this.quick[q] = null;
    this.dirty = true;
  }

  /** Eat one from the bag (a short channel). */
  use(id: string) {
    if (!this.count(id)) return false;
    return this.env.channel(id, () => this.remove(id));
  }

  /** The first filled quick slot (a controller's tap of D-pad up with nothing in reach). */
  quickUse() { const k = this.quick.find((q) => q && this.count(q)); if (k) this.use(k); }

  /** Drop one at your feet (pick it up again with a tap of the eat key). */
  drop(id: string) {
    if (!this.count(id)) return;
    this.remove(id);
    const p = this.env.player, pp = p.object.position;
    const x = pp.x - Math.sin(p.bodyYaw) * 0.9 + (Math.random() - 0.5) * 0.3, z = pp.z - Math.cos(p.bodyYaw) * 0.9 + (Math.random() - 0.5) * 0.3;
    const obj = new THREE.Mesh(this.dropGeo, this.dropMat(id));
    obj.position.set(x, this.env.ground(x, z) + 0.2, z); obj.name = `drop-${id}`;
    this.env.scene.add(obj);
    this.drops.push({ kind: id, pos: obj.position, obj, t: Math.random() * 6 });
  }
  private dropMat(id: string) {
    let m = this.dropMats.get(id);
    if (!m) {
      const k = this.kind(id);
      const mm = new THREE.MeshStandardNodeMaterial({ color: k?.color ?? 0x333333, roughness: 0.5 });
      mm.emissiveNode = color(k?.glow ?? 0xffffff).mul(sin(time.mul(2)).mul(0.25).add(0.75)).mul(float(0.9));
      m = mm; this.dropMats.set(id, m);
    }
    return m;
  }
  nearestDrop(at: THREE.Vector3, r: number) {
    let best: Drop | null = null, bd = r;
    for (const d of this.drops) { const x = Math.hypot(d.pos.x - at.x, d.pos.z - at.z); if (x < bd) { best = d; bd = x; } }
    return best;
  }
  takeDrop(d: Drop) {
    if (!this.add(d.kind)) return false;
    this.env.scene.remove(d.obj);
    this.drops.splice(this.drops.indexOf(d), 1);
    return true;
  }

  toggle(on = !this.open) {
    this.open = on;
    this.panel.style.display = on ? 'block' : 'none';
    if (on) { try { document.exitPointerLock(); } catch { /* none */ } this.sel = this.slots.length ? 0 : -1; this.dirty = true; }
  }

  private refreshT = 0;
  update(dt: number) {
    if (this.open && (this.refreshT -= dt) <= 0) { this.refreshT = 1.5; this.dirty = true; }
    for (const d of this.drops) { d.t += dt; d.obj.rotation.y += dt; d.obj.position.y = this.env.ground(d.pos.x, d.pos.z) + 0.2 + Math.sin(d.t * 2) * 0.04; }
    if (!this.dirty) return;
    this.dirty = false;
    // quick slots HUD
    this.hud.innerHTML = this.quick.map((id, i) => {
      const k = id ? this.kind(id) : null, n = id ? this.count(id) : 0;
      return `<div style="width:46px;height:46px;border:1px solid ${k ? hex(k.glow) : '#4a5a6a'}88;border-radius:4px;background:#020a12b0;position:relative;display:grid;place-items:center;opacity:${k ? 1 : 0.45}">
        <span style="font-size:18px;color:${k ? hex(k.glow) : '#4a5a6a'};text-shadow:0 0 6px ${k ? hex(k.glow) : 'transparent'}">${k ? glyph(k.shape) : ''}</span>
        <span style="position:absolute;left:3px;top:1px;color:#9fb4c8">${i + 6}</span>
        ${n ? `<span style="position:absolute;right:3px;bottom:1px">${n}</span>` : ''}</div>`;
    }).join('');
    if (!this.open) return;
    this.renderPanel();
  }

  private renderPanel() {
    const cells = Array.from({ length: BAG_SLOTS }, (_, i) => {
      const s = this.slots[i], k = s ? this.kind(s.kind) : null;
      const on = i === this.sel;
      return `<button data-cell="${i}" style="height:64px;border:1px solid ${on ? '#e2f3ff' : k ? hex(k.glow) + '66' : '#2a3a4a'};border-radius:4px;background:${on ? '#123048' : '#061626'};color:#e2f3ff;cursor:${s ? 'pointer' : 'default'};position:relative;font:12px system-ui">
        ${k ? `<div style="font-size:22px;color:${hex(k.glow)};text-shadow:0 0 8px ${hex(k.glow)}">${glyph(k.shape)}</div><div style="font-size:10px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this.name(s!.kind)}</div><span style="position:absolute;right:5px;top:3px;font-weight:700">${s!.n}</span>` : ''}
      </button>`;
    }).join('');
    const s = this.sel >= 0 ? this.slots[this.sel] : null, k = s ? this.kind(s.kind) : null;
    const known = s ? this.env.forage.known(s.kind) || k?.shape === 'gift' : false;
    const btn = (act: string, label: string, col = '#cfe8ff') => `<button data-act="${act}" style="padding:6px 12px;border:1px solid ${col};border-radius:3px;background:transparent;color:${col};font:700 12px system-ui;letter-spacing:.06em;cursor:pointer">${label}</button>`;
    this.panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><b style="letter-spacing:.2em">BAG</b><span style="opacity:.6;font-size:11px">I or Esc to close · 6 7 8 9 quick slots</span></div>
      <div style="font-size:11px;opacity:.85;margin-bottom:10px">${this.env.status().map((l) => `<div>${l}</div>`).join('')}</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${cells}</div>
      <div style="margin-top:12px;min-height:70px">${s && k ? `
        <div style="font-weight:700;color:${hex(k.glow)}">${this.name(s.kind)} × ${this.count(s.kind)}</div>
        <div style="opacity:.8;font-size:12px;margin:2px 0 8px">${known ? k.hint : 'You have not eaten one yet. Look closer at its glow and its tells before you trust it.'}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${btn('use', 'USE', '#7dffb0')}${btn('drop', 'DROP', '#fb7185')}${[0, 1, 2, 3].map((q) => btn(`q${q}`, `SLOT ${q + 6}${this.quick[q] === s.kind ? ' ✓' : ''}`)).join('')}</div>` : '<div style="opacity:.6">Tap H on a mushroom, berry, fruit or carcass to put it in the bag.</div>'}
      </div>`;
    this.panel.querySelectorAll<HTMLButtonElement>('[data-cell]').forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.cell); if (this.slots[i]) { this.sel = i; this.dirty = true; } }));
    this.panel.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const cur = this.sel >= 0 ? this.slots[this.sel] : null; if (!cur) return;
      const a = b.dataset.act!;
      if (a === 'use') { this.toggle(false); this.use(cur.kind); }
      else if (a === 'drop') { this.drop(cur.kind); this.sel = Math.min(this.sel, this.slots.length - 1); }
      else { const q = Number(a.slice(1)); for (let i = 0; i < 4; i++) if (this.quick[i] === cur.kind) this.quick[i] = null; this.quick[q] = cur.kind; }
      this.dirty = true;
    }));
  }
}
