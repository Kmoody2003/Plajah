// The soul meter: dark ↔ light, for this session, moved only by what the player does.
//   toward light: protecting creatures from predators, praying, eating healthy mushrooms, sparing prey, bonding
//   toward dark:  killing creatures that never hunted you, eating poison you knew was poison, cruelty (striking a
//                 wounded animal that is running away), betraying a creature that trusted you
// The meanings are kept generic on purpose (no Void lore: Legend of Elohim is Kenne's canon).
// It shows as a subtle aura on the character (a warm gold rim and rising motes for light, a violet smoke rim and
// sinking wisps for dark), a small bar on the HUD, and on the forest network (forest.ts) so the trees, ents, fungi and
// creatures all know.
import * as THREE from 'three/webgpu';
import { float, normalView, positionViewDirection, sin, time, uniform, dot, abs } from 'three/tsl';
import type { Recipe, VfxSystem } from '../../../../services/vfx';
import { forest, type SoulBand } from './forest';

const LIGHT_MOTE: Recipe = {
  id: 'soul_light_mote',
  emitters: [{ layer: 'add', shape: 'soft', count: 1, life: [1.4, 2.2], speed: [0.2, 0.5], spread: 0.5, size: [0.05, 0.01], color: [0xfff3c0, 0xffd070], intensity: 1.6, gravity: -0.6, drag: 0.8, radius: 0.45 }],
};
const DARK_WISP: Recipe = {
  id: 'soul_dark_wisp',
  emitters: [{ layer: 'alpha', shape: 'smoke', count: 1, life: [1.2, 1.8], speed: [0.1, 0.3], spread: 0.6, size: [0.12, 0.4], color: [0x3a1458, 0x0a0410], alpha: [0.35, 0], gravity: 0.4, drag: 1.2, radius: 0.4 }],
};
export const SOUL_RING: Recipe = {
  id: 'soul_ring',
  emitters: [{ layer: 'add', shape: 'ring', count: 1, life: 0.9, speed: 0, size: [0.3, 2.4], color: ['tint+white', 'tint'], intensity: 1.2, alpha: [0.8, 0] }],
};

/** Deeds and how far each moves the meter (-100 … +100). Plain data: tune freely. */
export const DEEDS: Record<string, { light: number; label: string }> = {
  protect: { light: 7, label: 'You protected a creature' },
  pray: { light: 3, label: 'A quiet prayer' },
  'eat-good': { light: 1, label: '' },
  spare: { light: 2, label: 'You let it live' },
  bond: { light: 6, label: 'A creature trusts you' },
  'kill-prey': { light: -9, label: 'You killed a creature that meant no harm' },
  betray: { light: -25, label: 'You killed a creature that trusted you' },
  cruel: { light: -4, label: 'Cruelty' },
  'eat-poison': { light: -5, label: 'You ate poison, knowing' },
};

export class SoulMeter {
  /** -100 (dark) … +100 (light). */
  value = 0;
  private bandV: SoulBand = 'neutral';
  private aura: THREE.Mesh;
  private uCol = uniform(new THREE.Color(0xffd27a));
  private uAmt = uniform(0);
  private bar: HTMLDivElement; private mark: HTMLDivElement; private barLabel: HTMLSpanElement;
  private moteT = 0;
  private v = new THREE.Vector3();
  private flash = 0;

  constructor(private player: { object: THREE.Object3D }, private vfx: VfxSystem, private say: (t: string, c: string) => void) {
    // the aura: a soft rim around the body (fresnel), back faces culled so it never fogs the first-person view
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const fres = float(1).sub(abs(dot(normalView, positionViewDirection))).pow(3.4);
    const breathe = sin(time.mul(1.6)).mul(0.15).add(0.85);
    m.colorNode = this.uCol;
    m.opacityNode = fres.mul(this.uAmt).mul(breathe);
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m);
    this.aura.scale.set(0.62, 1.12, 0.62); this.aura.position.y = 0.98;
    this.aura.renderOrder = 5; this.aura.name = 'soul-aura'; this.aura.frustumCulled = false;
    player.object.add(this.aura);
    // the HUD bar: dark on the left, light on the right, a marker where you stand
    this.bar = document.createElement('div');
    this.bar.style.cssText = 'position:fixed;left:50%;bottom:46px;transform:translateX(-50%);z-index:12;pointer-events:none;width:180px;height:6px;border-radius:3px;background:linear-gradient(90deg,#5a1a8a,#2a2a3a 45%,#3a3a2a 55%,#ffd27a);opacity:.55;box-shadow:0 0 6px #000';
    this.mark = document.createElement('div');
    this.mark.style.cssText = 'position:absolute;top:-4px;left:50%;width:4px;height:14px;margin-left:-2px;border-radius:2px;background:#fff;box-shadow:0 0 6px #fff;transition:left .4s';
    this.barLabel = document.createElement('span');
    this.barLabel.style.cssText = 'position:absolute;bottom:9px;left:50%;transform:translateX(-50%);font:700 9px system-ui;letter-spacing:.2em;color:#cfd8e6;white-space:nowrap;text-shadow:0 0 4px #000';
    this.barLabel.textContent = 'SOUL';
    this.bar.append(this.mark, this.barLabel);
    document.body.appendChild(this.bar);
  }

  /** -1 … +1. */
  get soul() { return this.value / 100; }
  get band() { return this.bandV; }

  /** A deed at `pos` (a key of DEEDS, or a custom amount). */
  deed(name: string, pos: { x: number; y?: number; z: number }, amount?: number) {
    const d = DEEDS[name];
    const light = amount ?? d?.light ?? 0;
    if (!light) return;
    this.value = Math.max(-100, Math.min(100, this.value + light));
    forest.setSoul(this.soul);
    forest.notify('deed', pos, { deed: name, light, soul: this.soul }, 'player');
    if (d?.label) this.say(`${d.label} · ${light > 0 ? 'LIGHT' : 'DARK'} ${light > 0 ? '+' : ''}${light}`, light > 0 ? '#ffe9a0' : '#c08cff');
    this.flash = 1;
    const band: SoulBand = this.soul <= -0.3 ? 'dark' : this.soul >= 0.3 ? 'light' : 'neutral';
    if (band !== this.bandV) {
      this.bandV = band;
      forest.notify('soul', pos, { soul: this.soul, band }, 'player');
      this.say(band === 'light' ? 'YOUR SOUL TURNS TOWARD THE LIGHT · creatures no longer fear you' : band === 'dark' ? 'YOUR SOUL DARKENS · creatures shy away, the fungi grow restless' : 'YOUR SOUL SETTLES', band === 'dark' ? '#c08cff' : '#ffe9a0');
      this.vfx.spawn(SOUL_RING, this.v.copy(this.player.object.position).setY(this.player.object.position.y + 0.1), { tint: band === 'dark' ? 0x7a3aff : 0xffd27a });
    }
  }

  update(dt: number, visible: boolean) {
    const s = this.soul, a = Math.abs(s);
    this.flash = Math.max(0, this.flash - dt * 0.8);
    // subtle: nothing at neutral, a faint rim at the extremes, a brief swell when the meter moves
    this.uAmt.value = Math.min(0.6, Math.max(0, a - 0.15) * 0.45 + this.flash * 0.3);
    this.uCol.value.set(s >= 0 ? 0xffd27a : 0x8a3aff);
    if (s < 0) this.uCol.value.lerp(new THREE.Color(0x2a0a40), 0.3);
    this.aura.visible = visible && this.uAmt.value > 0.01;
    if (visible && a > 0.3 && (this.moteT -= dt) <= 0) {
      this.moteT = 0.9 - a * 0.5;
      const p = this.player.object.position;
      this.vfx.spawn(s > 0 ? LIGHT_MOTE : DARK_WISP, this.v.set(p.x, p.y + (s > 0 ? 0.6 : 1.3), p.z));
    }
    this.mark.style.left = `${50 + s * 50}%`;
    this.mark.style.background = s > 0.3 ? '#ffe9a0' : s < -0.3 ? '#c08cff' : '#ffffff';
  }
}
