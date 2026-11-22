// The eat / drink action: walk up to a carcass, a forage item or water and hold the action — H on the keyboard,
// D-pad up on a controller, the on-screen button on touch (it shows only when something is in reach). A short
// channel (1.2–1.8 s, the kind's `eat` time) that taking any hit interrupts, so eating in a fight is a gamble.
// A prompt names what's in reach ("??? fungus — look closer" until you've learned the kind) and a ring fills while
// you hold (H on the keyboard: G is the heavy attack). The body kneels into the characters' `eat` / `drink` clips.
import * as THREE from 'three/webgpu';
import type { Recipe } from '../../../../services/vfx';
import type { Forage, Item } from './forage';
import type { PreyDirector, Carcass } from './prey';
import type { PlayerController } from '../player';
import type { VfxSystem } from '../../../../services/vfx';

/** Water lapping at your hands while you drink. */
const SIP: Recipe = {
  id: 'water_sip',
  emitters: [
    { layer: 'add', shape: 'ring', count: 1, life: 0.5, speed: 0, size: [0.1, 0.7], color: ['tint+white', 'tint'], intensity: 0.8, alpha: [0.7, 0] },
    { layer: 'add', shape: 'soft', count: [3, 5], life: [0.3, 0.6], speed: [0.6, 1.4], spread: 0.6, size: [0.04, 0.01], color: ['tint+white', 'tint'], intensity: 1.5, gravity: 6 },
  ],
};
/** Bits flying while you eat (meat, berries, fungus). */
const MUNCH: Recipe = {
  id: 'munch',
  emitters: [{ layer: 'shard', count: [2, 3], life: [0.4, 0.8], speed: [1, 2.5], spread: 0.8, size: [0.04, 0.02], color: ['tint', 'tint'], intensity: 0.6, alpha: [1, 1], gravity: 9, spin: [4, 10] }],
};

type Target = { kind: 'forage'; item: Item } | { kind: 'carcass'; c: Carcass } | { kind: 'water'; id: string; at: THREE.Vector3 };

export interface EatEnv {
  player: PlayerController;
  forage: Forage;
  prey: PreyDirector;
  vfx: VfxSystem;
  /** Drinkable water at (x, z) near height y: the surface height and whether it's clean, swamp or toxic. */
  water(x: number, z: number, y: number): { y: number; kind: 'water' | 'swampwater' | 'toxicwater' } | null;
  touch(): boolean;
  /** Mid-strike, blocking or stunned (combat/melee.ts): no eating then. */
  busy?(): boolean;
}

export class EatAction {
  private held = false;
  private keyHeld = false;
  private touchHeld = false;
  private t = 0;
  private cur: Target | null = null;
  private lastHp = 0;
  private fxT = 0;
  private prompt: HTMLDivElement;
  private ring: HTMLDivElement;
  private label: HTMLSpanElement;
  private btn: HTMLButtonElement;

  constructor(private env: EatEnv) {
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyH') this.keyHeld = true; });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyH') this.keyHeld = false; });
    window.addEventListener('blur', () => { this.keyHeld = false; });
    this.prompt = document.createElement('div');
    this.prompt.style.cssText = 'position:fixed;left:50%;bottom:140px;transform:translateX(-50%);z-index:12;pointer-events:none;display:flex;align-items:center;gap:10px;font:700 13px/1.3 system-ui,sans-serif;letter-spacing:.08em;color:#e2f3ff;text-shadow:0 0 6px #000;opacity:0;transition:opacity .15s';
    this.ring = document.createElement('div');
    this.ring.style.cssText = 'width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font:800 12px system-ui;color:#04111c;background:conic-gradient(#7dffb0 0deg,#e2f3ff22 0deg)';
    this.label = document.createElement('span');
    this.prompt.append(this.ring, this.label);
    this.btn = document.createElement('button');
    this.btn.textContent = 'EAT';
    this.btn.style.cssText = 'position:fixed;right:150px;bottom:190px;z-index:13;width:70px;height:70px;border-radius:50%;border:2px solid #7dffb0;background:#02140ccc;color:#7dffb0;font:800 13px system-ui;letter-spacing:.1em;display:none;touch-action:none';
    const down = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.touchHeld = true; };
    const up = (e: Event) => { e.preventDefault(); this.touchHeld = false; };
    this.btn.addEventListener('pointerdown', down); this.btn.addEventListener('pointerup', up); this.btn.addEventListener('pointercancel', up); this.btn.addEventListener('pointerleave', up);
    document.body.append(this.prompt, this.btn);
  }

  /** True while channelling (the game may want to block firing). */
  get eating() { return this.held && !!this.cur && this.t > 0; }

  private find(pos: THREE.Vector3): Target | null {
    const c = this.env.prey.nearestCarcass(pos, 2.4);
    if (c) return { kind: 'carcass', c };
    const it = this.env.forage.nearest(pos, 1.8);
    if (it) return { kind: 'forage', item: it };
    // water: at your feet, or a step ahead
    for (const r of [0, 1.2]) {
      const p = this.env.player, fx = pos.x - Math.sin(p.bodyYaw) * r, fz = pos.z - Math.cos(p.bodyYaw) * r;
      const w = this.env.water(fx, fz, pos.y);
      if (w && pos.y - w.y < 1.2 && pos.y - w.y > -1.6) return { kind: 'water', id: w.kind, at: new THREE.Vector3(fx, w.y, fz) };
    }
    return null;
  }

  private same(a: Target | null, b: Target | null) {
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === 'carcass' && b.kind === 'carcass') return a.c === b.c;
    if (a.kind === 'forage' && b.kind === 'forage') return a.item === b.item;
    return a.kind === 'water' && b.kind === 'water' && a.id === b.id;
  }

  private kindOf(t: Target) { return t.kind === 'forage' ? t.item.kind : t.kind === 'carcass' ? t.c.meat : t.id; }
  private at(t: Target) { return t.kind === 'forage' ? t.item.pos : t.kind === 'carcass' ? t.c.pos : t.at; }

  update(dt: number) {
    const p = this.env.player, pos = p.object.position, F = this.env.forage;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads?.[0];
    const padHeld = !!pad && !!(pad.buttons[12]?.pressed);
    this.held = (this.keyHeld || padHeld || this.touchHeld) && p.enabled && !p.downed && !this.env.busy?.();
    const tgt = p.enabled && !p.downed ? this.find(pos) : null;
    // a real hit breaks the channel (poison / burn ticks of a few points don't, so you can eat a cure while sick)
    const hurt = this.lastHp - p.hp >= 5;
    this.lastHp = p.hp;
    if (!this.same(tgt, this.cur)) { this.cur = tgt; this.t = 0; }
    if (!tgt) { this.prompt.style.opacity = '0'; this.btn.style.display = 'none'; this.t = 0; return; }
    const kind = this.kindOf(tgt), k = F.kind(kind);
    const dur = k?.eat ?? 1.2;
    if (hurt && this.t > 0) { this.t = 0; this.label.textContent = 'INTERRUPTED'; }
    if (this.held) {
      // kneel into the characters' eat / drink clip once per channel (full body: it needs the player standing still)
      if (this.t === 0) p.playClip(tgt.kind === 'water' ? 'drink' : 'eat', 1, dur);
      this.t += dt;
      if ((this.fxT -= dt) <= 0) {
        this.fxT = 0.25;
        const a = this.at(tgt).clone().setY(this.at(tgt).y + (tgt.kind === 'water' ? 0.05 : 0.4));
        this.env.vfx.spawn(tgt.kind === 'water' ? SIP : MUNCH, a, { tint: k?.glow ?? 0x8fd8ff, count: 0.8 });
      }
      if (this.t >= dur) {
        this.t = 0;
        if (tgt.kind === 'forage') F.eat(tgt.item);
        else if (tgt.kind === 'carcass') { if (this.env.prey.bite(tgt.c)) F.consume(tgt.c.meat, tgt.c.pos); }
        else F.consume(tgt.id, tgt.at);
        this.cur = null;
      }
    } else this.t = Math.max(0, this.t - dt * 3);
    // the prompt: what it is (if you know), the key, the fill ring
    const known = F.known(kind);
    const noun = tgt.kind === 'water' ? (known && k ? k.name : 'water') : tgt.kind === 'carcass' ? `${k?.name ?? 'meat'} (${tgt.c.bites})` : known && k ? k.name : `??? ${tgt.item.k.shape === 'cap' ? 'fungus' : tgt.item.k.shape === 'berries' ? 'berries' : 'fruit'} — look closer`;
    const verb = tgt.kind === 'water' ? 'Drink' : 'Eat';
    const key = this.env.touch() ? '' : pad ? 'D-pad ▲' : 'H';
    const txt = `${key ? `[${key}] ` : ''}Hold to ${verb} · ${noun}`;
    if (this.label.textContent !== txt && this.label.textContent !== 'INTERRUPTED') this.label.textContent = txt;
    if (this.label.textContent === 'INTERRUPTED' && this.held && this.t > 0.2) this.label.textContent = txt;
    const col = known && k ? (k.good ? '#7dffb0' : '#fb7185') : '#e2f3ff';
    this.prompt.style.color = col;
    this.ring.style.background = `conic-gradient(${col} ${Math.round((this.t / dur) * 360)}deg,#e2f3ff22 0deg)`;
    this.ring.textContent = key.length === 1 ? key : '';
    this.prompt.style.opacity = '1';
    this.btn.style.display = this.env.touch() ? 'block' : 'none';
  }
}
