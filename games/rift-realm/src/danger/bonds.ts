// Creature bonds (the non-predators: deer and stags) and the Pray action.
//  · A creature has to like you first. A light soul isn't feared (you can walk up calmly); a dark soul is avoided from
//    further off. Trust (affinity 0…1) rises when you defend it (or its herd) from a predator, or when you walk up
//    calmly and Pray near it (hold T / L3: a short channel, interrupted by a hit).
//  · At full trust it bonds (up to 3 at once). A bonded creature doesn't bolt from you or your gunshots, and every
//    so often walks up with a gift: a blessing (hits soften), healing, the mycelium revealing nearby forage, spirit
//    charge for the guns, or a Spirit Gift for the bag.
//  · Sparing: staying near a calm creature without harming it counts as sparing it (once each).
import * as THREE from 'three/webgpu';
import type { Recipe, VfxSystem } from '../../../../services/vfx';
import type { PlayerController } from '../player';
import type { Prey, PreyDirector } from './prey';
import type { SoulMeter } from './soul';
import type { DangerAudio } from './audio';
import type { PlayerStatus } from './status';
import { forest } from './forest';

const PRAY_SEC = 2.4, PRAY_R = 14, MAX_BONDS = 3;

const PRAY_GLOW: Recipe = {
  id: 'pray_glow',
  emitters: [
    { layer: 'add', shape: 'soft', count: [2, 3], life: [1, 1.6], speed: [0.3, 0.7], spread: 0.4, size: [0.06, 0.01], color: [0xfff3c0, 0xffd070], intensity: 1.8, gravity: -0.8, radius: 0.6 },
  ],
};
const PRAY_DONE: Recipe = {
  id: 'pray_done',
  emitters: [
    { layer: 'add', shape: 'ring', count: 1, life: 1.1, speed: 0, size: [0.4, PRAY_R * 0.9], color: [0xfff3c0, 0xffd070], intensity: 0.9, alpha: [0.6, 0] },
    { layer: 'add', shape: 'soft', count: [14, 20], life: [1.2, 2], speed: [0.6, 1.6], spread: 1, size: [0.07, 0.01], color: [0xfff3c0, 0xffd070], intensity: 2, gravity: -0.5, radius: 0.8 },
  ],
};
/** A heart-mote rising off a creature whose trust grew. */
const TRUST_MOTE: Recipe = {
  id: 'trust_mote',
  emitters: [{ layer: 'add', shape: 'soft', count: [4, 6], life: [0.9, 1.4], speed: [0.4, 1], spread: 0.5, size: [0.08, 0.02], color: [0xc8ffe0, 0x7dffb0], intensity: 1.6, gravity: -1.2, radius: 0.3 }],
};
const GIFT_BURST: Recipe = {
  id: 'gift_burst',
  emitters: [
    { layer: 'add', shape: 'soft', count: [16, 24], life: [0.8, 1.5], speed: [1, 2.6], spread: 1, size: [0.08, 0.01], color: [0xffffff, 0xffe9a0], intensity: 2.2, gravity: -0.4 },
    { layer: 'add', shape: 'ring', count: 1, life: 0.7, speed: 0, size: [0.2, 2.2], color: [0xffffff, 0xffe9a0], intensity: 1, alpha: [0.7, 0] },
  ],
};

export interface BondsEnv {
  player: PlayerController;
  prey: PreyDirector;
  soul: SoulMeter;
  vfx: VfxSystem;
  audio: DangerAudio;
  status: PlayerStatus;
  busy?(): boolean;
  heal(n: number): void;
  charge(n: number, src: string): void;
  /** The mycelium lights the good forage around you for `sec` (a gift). */
  reveal(sec: number): void;
  /** Put an item in the bag (false if it's full). */
  give(kind: string): boolean;
  say(text: string, color: string): void;
  /** The player is sprinting / fighting (prey still startle at that, even for a light soul). */
  loud(): boolean;
}

export class Bonds {
  private keyHeld = false;
  private t = 0;
  private lastHp = 0;
  private fxT = 0;
  private prayCd = 0;
  private soulCd = 0;
  private spareBudget = 6;
  private spareT = 0;
  private prompt: HTMLDivElement; private ring: HTMLDivElement; private label: HTMLSpanElement;
  private v = new THREE.Vector3();
  private protectCd = new Map<number, number>();
  private clock = 0;
  private wasPad = false;

  constructor(private env: BondsEnv) {
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyT') this.keyHeld = true; });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyT') this.keyHeld = false; });
    window.addEventListener('blur', () => { this.keyHeld = false; });
    this.prompt = document.createElement('div');
    this.prompt.style.cssText = 'position:fixed;left:50%;bottom:180px;transform:translateX(-50%);z-index:12;pointer-events:none;display:flex;align-items:center;gap:10px;font:700 13px/1.3 system-ui,sans-serif;letter-spacing:.08em;color:#ffe9a0;text-shadow:0 0 6px #000;opacity:0;transition:opacity .2s';
    this.ring = document.createElement('div');
    this.ring.style.cssText = 'width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font:800 12px system-ui;color:#1c1404';
    this.label = document.createElement('span');
    this.prompt.append(this.ring, this.label);
    document.body.appendChild(this.prompt);
  }

  get praying() { return this.t > 0; }
  bonded(): Prey[] { return this.env.prey.list.filter((p) => p.bonded); }

  /** How close the player may come before `p` bolts: trust and the soul change it (PreyEnv.fearR). */
  fearR(p: Prey, base: number) {
    if (p.bonded) return 0;
    const s = this.env.soul.soul, loud = this.env.loud();
    let r = base;
    if (s >= 0.3 && !loud) r = p.affinity > 0.25 ? 0 : 4;          // a light soul isn't feared
    else if (s > 0) r = base * (1 - s);
    else if (s <= -0.3) r = base * (1.3 + -s * 0.6);               // a dark soul is avoided from further off
    return r * (1 - Math.min(0.9, p.affinity));
  }

  private trust(p: Prey, amount: number, why: string) {
    if (!p.alive) return;
    const s = this.env.soul.soul;
    const mul = s >= 0.3 ? 1.5 : s <= -0.3 ? 0.35 : 1;
    p.affinity = Math.min(1, p.affinity + amount * mul);
    this.env.vfx.spawn(TRUST_MOTE, this.v.copy(p.pos).setY(p.pos.y + p.body.height));
    if (p.affinity >= 1 && !p.bonded) {
      if (this.bonded().length >= MAX_BONDS) { p.affinity = 0.95; return; }
      p.bonded = true; p.calmT = 0;
      (p as unknown as { giftT: number }).giftT = 25 + Math.random() * 20;
      this.env.soul.deed('bond', p.pos);
      forest.notify('bond', p.pos, { who: p.who, why }, 'player');
      this.env.say(`${p.who.toUpperCase()} TRUSTS YOU · it will bring you gifts`, '#7dffb0');
      this.env.audio.play('zap', this.v.copy(p.pos), { gain: 0.5, rate: 2.6 });
    }
  }

  /** The player hurt a predator: if it was hunting a creature (or any is near it), that creature (and its herd) warm to
   *  you. Returns true when it counted as protecting one. */
  defended(predPos: THREE.Vector3, quarry: Prey | null) {
    const near = quarry ? [quarry] : this.env.prey.list.filter((p) => p.alive && p.pos.distanceTo(predPos) < 14 && p.state === 'flee');
    let any = false;
    for (const q of near) {
      if ((this.protectCd.get(q.id) ?? -99) > this.clock - 8) continue;
      this.protectCd.set(q.id, this.clock);
      this.trust(q, 0.45, 'protect');
      for (const o of this.env.prey.list) if (o !== q && o.herd === q.herd && o.alive) o.affinity = Math.min(0.95, o.affinity + 0.2);
      any = true;
    }
    if (any) this.env.soul.deed('protect', predPos);
    return any;
  }

  /** The player killed a prey animal (deed bookkeeping lives here so a betrayal weighs more). */
  killed(p: Prey) { this.env.soul.deed(p.bonded || p.affinity > 0.5 ? 'betray' : 'kill-prey', p.pos); }
  /** The player struck a prey that is already wounded and running. */
  struck(p: Prey, wasHurt: boolean, wasFleeing: boolean) { if (wasHurt && wasFleeing) this.env.soul.deed('cruel', p.pos); p.affinity = 0; p.bonded = false; p.come = null; }

  private gift(p: Prey) {
    const env = this.env, pl = env.player.object.position;
    this.env.vfx.spawn(GIFT_BURST, this.v.copy(p.pos).lerp(pl, 0.5).setY(pl.y + 1.2));
    this.env.audio.play('zap', this.v, { gain: 0.5, rate: 3 });
    const r = Math.random();
    if (r < 0.25) { env.status.buff('blessed', 'BLESSED', '#fff0b0', 30); env.say(`${p.who} blesses you · hits soften for 30 s`, '#fff0b0'); }
    else if (r < 0.45) { env.heal(35); env.say(`${p.who} heals you · +35 HP`, '#7dffb0'); }
    else if (r < 0.65) { env.reveal(25); env.say(`${p.who} shows you the forest's food`, '#b8ff9a'); }
    else if (r < 0.85) { env.charge(25, 'gift'); env.say(`${p.who} gives you spirit · +25 charge`, '#ffe46a'); }
    else if (env.give('spiritgift')) env.say(`${p.who} leaves you a Spirit Gift (in your bag)`, '#fff0b0');
    else { env.heal(20); env.say(`${p.who} heals you · +20 HP`, '#7dffb0'); }
    forest.notify('bond', p.pos, { who: p.who, gift: true }, 'creature');
  }

  update(dt: number) {
    this.clock += dt; this.prayCd -= dt; this.soulCd -= dt;
    const env = this.env, pl = env.player, pp = pl.object.position;
    // ── pray (hold T / L3) ──
    const pad = navigator.getGamepads ? navigator.getGamepads()?.[0] : null;
    const padHeld = !!pad?.buttons[10]?.pressed;
    const can = pl.enabled && !pl.downed && !env.busy?.();
    const held = (this.keyHeld || padHeld) && can;
    const hurt = this.lastHp - pl.hp >= 5; this.lastHp = pl.hp;
    if (held && this.prayCd <= 0) {
      if (this.t === 0) {
        const rig = (pl as unknown as { rig?: { has(n: string): boolean } }).rig;
        pl.playClip(rig?.has('pray') ? 'pray' : 'eat', 1, PRAY_SEC);
      }
      this.t += dt;
      if (hurt) { this.t = 0; this.prayCd = 1; this.label.textContent = 'INTERRUPTED'; }
      if ((this.fxT -= dt) <= 0) { this.fxT = 0.3; env.vfx.spawn(PRAY_GLOW, this.v.copy(pp).setY(pp.y + 0.4)); }
      if (this.t >= PRAY_SEC) this.finishPray();
    } else if (!held) this.t = 0;
    const show = this.t > 0 || this.label.textContent === 'INTERRUPTED';
    if (this.t > 0) {
      const near = env.prey.list.some((p) => p.alive && p.state !== 'flee' && p.pos.distanceTo(pp) < PRAY_R);
      this.label.textContent = `Praying${near ? ' · the creatures are listening' : ''}`;
      this.ring.style.background = `conic-gradient(#ffe9a0 ${Math.round((this.t / PRAY_SEC) * 360)}deg,#ffe9a022 0deg)`;
    }
    this.prompt.style.opacity = show ? '1' : '0';
    if (!held && this.label.textContent === 'INTERRUPTED' && this.prayCd < 0) this.label.textContent = '';
    this.wasPad = padHeld;

    // ── sparing, gifts ──
    this.spareBudget = Math.min(6, this.spareBudget + dt / 20);
    for (const p of env.prey.list) {
      if (!p.alive) continue;
      const d = p.pos.distanceTo(pp);
      if (!p.spared && d < 12 && p.state !== 'flee' && pl.enabled && !pl.downed) {
        if ((p.calmT += dt) > 6 && this.spareBudget >= 1) { p.spared = true; this.spareBudget -= 1; env.soul.deed('spare', p.pos); this.trust(p, 0.1, 'spare'); }
      }
      if (p.bonded) {
        const g = p as unknown as { giftT: number };
        if (d < 30) g.giftT -= dt;
        if (g.giftT <= 0 && !p.come && d < 30) p.come = pp.clone();
        if (p.come) { p.come.copy(pp); if (d < 2.6) { p.come = null; g.giftT = 50 + Math.random() * 40; this.gift(p); } }
        // bonded ones drift after you, loosely
        else if (d > 18 && d < 45 && p.state === 'graze' && Math.random() < dt * 0.3) { p.come = pp.clone(); }
      }
    }
  }

  private finishPray() {
    const env = this.env, pp = env.player.object.position;
    this.t = 0; this.prayCd = 2;
    env.vfx.spawn(PRAY_DONE, this.v.copy(pp).setY(pp.y + 0.1));
    env.audio.play('zap', this.v, { gain: 0.35, rate: 1.6 });
    let heard = 0;
    for (const p of env.prey.list) {
      if (!p.alive || p.state === 'flee' || p.pos.distanceTo(pp) > PRAY_R) continue;
      this.trust(p, 0.34, 'pray'); heard++;
    }
    if (this.soulCd <= 0) { this.soulCd = 20; env.soul.deed('pray', pp); }
    else forest.notify('deed', pp, { deed: 'pray', light: 0, soul: env.soul.soul }, 'player');
    if (!heard) env.say('A quiet prayer. No creature is near enough to hear it.', '#ffe9a0');
  }
}
