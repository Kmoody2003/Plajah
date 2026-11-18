// Control points (Team Arena / Battleground modes): stand in a ring to capture it for your team; enemies inside contest
// or take it back. Owned points tick score. Visual: ground ring + light column tinted by owner; HUD strip top-centre.
import * as THREE from 'three/webgpu';
import { color, float, smoothstep, uniform, uv } from 'three/tsl';

export interface ControlPointDef { id: string; name: string; pos: THREE.Vector3; radius: number }
type Owner = 'none' | 'blue' | 'orange';

const COL: Record<Owner, number> = { none: 0xdfe6ee, blue: 0x2f9dff, orange: 0xff8a2b };

interface CP { def: ControlPointDef; owner: Owner; progress: number; ring: THREE.Mesh; tint: { value: THREE.Color }; el: HTMLElement }

export class Objectives {
  readonly score = { blue: 0, orange: 0 };
  private points: CP[] = [];
  private hud: HTMLElement;
  private scoreEl: HTMLElement;
  private tick = 0;

  constructor(scene: THREE.Scene, defs: ControlPointDef[], groundAt: (x: number, z: number, y: number) => number | null) {
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;z-index:12;font:600 12px Segoe UI,sans-serif;letter-spacing:.1em;pointer-events:none';
    this.scoreEl = document.createElement('div');
    this.scoreEl.style.cssText = 'color:#cfe2f3;margin-left:10px;text-shadow:0 0 6px #000';
    document.body.appendChild(this.hud);
    for (const def of defs) {
      const y = groundAt(def.pos.x, def.pos.z, def.pos.y + 3) ?? def.pos.y;
      const tint = uniform(new THREE.Color(COL.none));
      const ringMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      ringMat.colorNode = tint.mul(0.9);
      // a soft wall of light rising from the ring
      ringMat.opacityNode = smoothstep(float(1.0), float(0.0), uv().y).mul(0.16); // readable, but under the bloom threshold so it never blows out to a white slab
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(def.radius, def.radius, 3.2, 48, 1, true), ringMat);
      ring.position.set(def.pos.x, y + 1.6, def.pos.z);
      const baseMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      baseMat.colorNode = tint.mul(1.0);
      baseMat.opacityNode = float(0.75);
      const base = new THREE.Mesh(new THREE.RingGeometry(def.radius - 0.18, def.radius, 64), baseMat);
      base.rotation.x = -Math.PI / 2; base.position.set(def.pos.x, y + 0.06, def.pos.z);
      scene.add(ring, base);
      const el = document.createElement('div');
      el.style.cssText = 'width:34px;height:34px;display:grid;place-items:center;border:2px solid #dfe6ee88;background:#0b1220aa;color:#fff;transform:rotate(45deg)';
      el.innerHTML = `<span style="transform:rotate(-45deg)">${def.id}</span>`;
      this.hud.appendChild(el);
      this.points.push({ def, owner: 'none', progress: 0, ring, tint, el });
    }
    if (defs.length) this.hud.appendChild(this.scoreEl);
  }

  /** progress: -1 = orange owns, +1 = blue owns. */
  update(dt: number, player: THREE.Vector3, enemies: THREE.Vector3[]) {
    for (const p of this.points) {
      const inside = (v: THREE.Vector3) => Math.hypot(v.x - p.def.pos.x, v.z - p.def.pos.z) < p.def.radius && Math.abs(v.y - p.ring.position.y) < 4;
      const b = inside(player) ? 1 : 0;
      const o = enemies.filter(inside).length;
      if (b && !o) p.progress = Math.min(1, p.progress + dt * 0.28);
      else if (o && !b) p.progress = Math.max(-1, p.progress - dt * 0.12 * Math.min(3, o));
      const prev = p.owner;
      if (p.progress >= 1) p.owner = 'blue'; else if (p.progress <= -1) p.owner = 'orange'; else if (Math.abs(p.progress) < 0.05) p.owner = 'none';
      const target = new THREE.Color(COL[p.owner]).lerp(new THREE.Color(p.progress > 0 ? COL.blue : COL.orange), p.owner === 'none' ? Math.abs(p.progress) : 0);
      p.tint.value.lerp(target, Math.min(1, dt * 6));
      p.ring.rotation.y += dt * 0.3;
      const contested = b && o;
      p.el.style.borderColor = '#' + new THREE.Color(COL[p.owner]).getHexString();
      p.el.style.background = p.owner === 'none' ? '#0b1220aa' : '#' + new THREE.Color(COL[p.owner]).multiplyScalar(0.45).getHexString() + 'cc';
      p.el.style.boxShadow = contested ? '0 0 12px #fbbf24' : 'none';
      if (prev !== p.owner && p.owner !== 'none') this.onCapture?.(p.def, p.owner);
    }
    this.tick += dt;
    if (this.tick >= 2) {
      this.tick = 0;
      for (const p of this.points) if (p.owner !== 'none') this.score[p.owner] += 1;
    }
    this.scoreEl.textContent = `${this.score.blue} — ${this.score.orange}`;
  }

  onCapture?: (def: ControlPointDef, owner: Owner) => void;
}
