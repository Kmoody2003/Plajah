// Virtual light pool. Forward shading evaluates every point light for every pixel, so
// 20+ torches/candles cost dearly on integrated GPUs. All authored PointLights become
// virtual; each frame the K most relevant to the camera drive a fixed pool of real
// lights. The light count never changes, so shaders never recompile.
import * as THREE from 'three/webgpu';

export interface Virtual { pos: THREE.Vector3; color: THREE.Color; intensity: number; distance: number; decay: number; flicker: number; keepLit?: boolean }

export class LightPool {
  private virtuals: Virtual[] = [];
  private pool: THREE.PointLight[] = [];
  private time = 0;
  /** Global multiplier (the nightmare dims torches and candles toward silhouettes). */
  scale = 1;

  /** Convert every PointLight under `root` into a virtual light; add K real lights to `scene`. */
  constructor(root: THREE.Object3D, scene: THREE.Scene, k: number, flickering: Set<THREE.Light>) {
    root.updateMatrixWorld(true);
    const found: THREE.PointLight[] = [];
    root.traverse((o) => { if ((o as THREE.PointLight).isPointLight) found.push(o as THREE.PointLight); });
    found.forEach((l, i) => {
      this.virtuals.push({
        pos: l.getWorldPosition(new THREE.Vector3()), color: l.color.clone(), intensity: l.intensity,
        distance: l.distance, decay: l.decay, flicker: flickering.has(l) ? i * 1.7 + 0.3 : -1,
      });
      l.removeFromParent();
    });
    for (let i = 0; i < k; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 0, 2);
      l.name = `pool${i}`;
      scene.add(l);
      this.pool.push(l);
    }
  }

  /** Register a light that appears later (e.g. after async props load). */
  add(l: THREE.PointLight, flicker = true) {
    l.updateMatrixWorld(true);
    this.virtuals.push({ pos: l.getWorldPosition(new THREE.Vector3()), color: l.color.clone(), intensity: l.intensity, distance: l.distance, decay: l.decay, flicker: flicker ? this.virtuals.length * 1.7 : -1 });
    l.removeFromParent();
  }

  /** A short-lived light (molotov fire, plasma flash); returns a handle for `remove`. */
  addTransient(pos: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, distance: number): Virtual {
    const v: Virtual = { pos: pos.clone(), color: new THREE.Color(color), intensity, distance, decay: 2, flicker: this.virtuals.length * 1.7, keepLit: true };
    this.virtuals.push(v);
    return v;
  }
  remove(v: Virtual) { const i = this.virtuals.indexOf(v); if (i >= 0) this.virtuals.splice(i, 1); }

  get count() { return this.virtuals.length; }

  update(dt: number, viewer: THREE.Vector3) {
    this.time += dt;
    const t = this.time;
    // Relevance: brightness over distance². Ranked cut-off fades smoothly at the boundary.
    const scored = this.virtuals.map((v) => {
      const d2 = v.pos.distanceToSquared(viewer);
      return { v, d2, score: v.intensity / (1 + d2) };
    }).sort((a, b) => b.score - a.score);
    const k = this.pool.length;
    const edge = scored[k]?.score ?? 0;          // first light that didn't make it
    for (let i = 0; i < k; i++) {
      const l = this.pool[i];
      const s = scored[i];
      if (!s) { l.intensity = 0; continue; }
      const v = s.v;
      // Fade lights near the cut so swaps aren't visible pops.
      const fade = edge > 0 ? THREE.MathUtils.smoothstep(s.score / edge, 1, 1.6) : 1;
      const flick = v.flicker >= 0 ? 0.82 + 0.18 * Math.sin(t * 13 + v.flicker) * Math.sin(t * 7.3 + v.flicker * 0.7) : 1;
      l.position.copy(v.pos);
      l.color.copy(v.color);
      l.distance = v.distance;
      l.decay = v.decay;
      // Transient lights (orbs, fire, flashes) ignore the dim: in the dark they are the light.
      l.intensity = v.intensity * flick * fade * (v.keepLit ? 1 : this.scale);
    }
  }
}
