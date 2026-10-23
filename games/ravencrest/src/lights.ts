// Virtual light pool. Forward shading evaluates every point light for every pixel, so
// 20+ torches/candles cost dearly on integrated GPUs. All authored PointLights become
// virtual; each frame the K most relevant to the camera drive a fixed pool of real
// lights. The light count never changes, so shaders never recompile.
import * as THREE from 'three/webgpu';

interface Virtual { pos: THREE.Vector3; color: THREE.Color; intensity: number; distance: number; decay: number; flicker: number }

/**
 * Light discipline. In three.js a PointLight distance of 0 means INFINITE
 * range — several authored flames used it, so a candle could wash a whole
 * hall. Finite authored distances are respected; infinite ones get a class
 * radius by source size, so small sources stay small:
 * candle cluster ≈ 6 m, wall torch ≈ 10 m, brazier/fire pit ≈ 13 m,
 * fireplace/chandelier ≈ 17 m. Decay stays physical (2).
 */
function disciplined(intensity: number, distance: number): { intensity: number; distance: number } {
  if (distance > 0) return { intensity, distance };
  if (intensity <= 8) return { intensity, distance: 6 };
  if (intensity <= 16) return { intensity, distance: 10 };
  if (intensity <= 30) return { intensity, distance: 13 };
  return { intensity, distance: 17 };
}

export class LightPool {
  private virtuals: Virtual[] = [];
  private pool: THREE.PointLight[] = [];
  private time = 0;

  /** Convert every PointLight under `root` into a virtual light; add K real lights to `scene`. */
  constructor(root: THREE.Object3D, scene: THREE.Scene, k: number, flickering: Set<THREE.Light>) {
    root.updateMatrixWorld(true);
    const found: THREE.PointLight[] = [];
    root.traverse((o) => { if ((o as THREE.PointLight).isPointLight) found.push(o as THREE.PointLight); });
    found.forEach((l, i) => {
      const d = disciplined(l.intensity, l.distance);
      this.virtuals.push({
        pos: l.getWorldPosition(new THREE.Vector3()), color: l.color.clone(), intensity: d.intensity,
        distance: d.distance, decay: l.decay, flicker: flickering.has(l) ? i * 1.7 + 0.3 : -1,
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
    const d = disciplined(l.intensity, l.distance);
    this.virtuals.push({ pos: l.getWorldPosition(new THREE.Vector3()), color: l.color.clone(), intensity: d.intensity, distance: d.distance, decay: l.decay, flicker: flicker ? this.virtuals.length * 1.7 : -1 });
    l.removeFromParent();
  }

  get count() { return this.virtuals.length; }

  update(dt: number, viewer: THREE.Vector3, gust = 0.5) {
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
      // Flames gutter harder when the wind gusts: the dips deepen, peaks stay.
      const prod = Math.sin(t * 13 + v.flicker) * Math.sin(t * 7.3 + v.flicker * 0.7);
      const flick = v.flicker >= 0 ? 0.86 + 0.14 * prod - gust * 0.09 * (1 - prod) : 1;
      l.position.copy(v.pos);
      l.color.copy(v.color);
      l.distance = v.distance;
      l.decay = v.decay;
      l.intensity = v.intensity * flick * fade;
    }
  }
}
