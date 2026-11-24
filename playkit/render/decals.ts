// playkit/render/decals.ts
//
// Instanced Projected Decal Ring-Buffer Pool shared across all Plajah 3D games:
//   - Rift Realm / Era Clash / Ravencrest: scorch marks, impacts, slashes, moss, rune burns
//   - Kith Racing / Apex: rubber skidmarks, drift burns, mud splashes
//   - Firstlight: turf scuffs, yard-line paint, tackle divots

import type { Vec3 } from '../physics/runtime';
import type { QualityTier } from '../core/engine';

export type DecalKind = 'scorch' | 'impact' | 'slash' | 'moss' | 'crack' | 'skidmark' | 'turf-scuff' | 'rune-mark';

export interface DecalInstance {
  id: number;
  kind: DecalKind;
  position: Vec3;
  normal: Vec3;
  sizeMeters: [number, number];
  rotationRad: number;
  tintHex: number;
  ageSec: number;
  maxLifeSec: number; // 0 = permanent until overwritten by ring buffer
  opacity: number;
}

const POOL_CAPACITY_BY_TIER: Record<QualityTier, number> = {
  low: 64,
  medium: 160,
  high: 320,
  ultra: 512,
};

export class DecalPool {
  readonly capacity: number;
  private slots: Array<DecalInstance | null>;
  private writeHead = 0;
  private nextId = 1;

  constructor(tierOrCapacity: QualityTier | number = 'medium') {
    this.capacity = typeof tierOrCapacity === 'number'
      ? Math.max(8, tierOrCapacity)
      : POOL_CAPACITY_BY_TIER[tierOrCapacity];
    this.slots = new Array(this.capacity).fill(null);
  }

  spawn(spec: {
    kind: DecalKind;
    position: Vec3;
    normal: Vec3;
    sizeMeters?: [number, number];
    rotationRad?: number;
    tintHex?: number;
    maxLifeSec?: number;
  }): DecalInstance {
    const inst: DecalInstance = {
      id: this.nextId++,
      kind: spec.kind,
      position: [...spec.position],
      normal: [...spec.normal],
      sizeMeters: spec.sizeMeters ?? [0.65, 0.65],
      rotationRad: spec.rotationRad ?? 0,
      tintHex: spec.tintHex ?? 0xffffff,
      ageSec: 0,
      maxLifeSec: spec.maxLifeSec ?? 25,
      opacity: 1,
    };
    this.slots[this.writeHead] = inst;
    this.writeHead = (this.writeHead + 1) % this.capacity;
    return inst;
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      const d = this.slots[i];
      if (!d) continue;
      d.ageSec += dt;
      if (d.maxLifeSec > 0) {
        if (d.ageSec >= d.maxLifeSec) {
          this.slots[i] = null;
          continue;
        }
        // Smooth fade out during final 20% of lifetime
        const rem = (d.maxLifeSec - d.ageSec) / (d.maxLifeSec * 0.2);
        d.opacity = Math.max(0, Math.min(1, rem));
      }
    }
  }

  activeDecals(): DecalInstance[] {
    const out: DecalInstance[] = [];
    for (const d of this.slots) {
      if (d) out.push(d);
    }
    return out;
  }

  clear(): void {
    this.slots.fill(null);
    this.writeHead = 0;
  }
}
