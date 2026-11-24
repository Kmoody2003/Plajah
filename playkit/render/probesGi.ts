// playkit/render/probesGi.ts
//
// Runtime Global Illumination & Interior Reflection System:
//   1) L2 Spherical Harmonics (SH9) Irradiance Probe Volume (smooth inverse-distance blending
//      so dynamic characters/vehicles receive bounced indoor & outdoor GI at 60 fps)
//   2) Parallax-Corrected Box Reflection Probes (so room floors, armor, and glass reflect
//      the actual interior room instead of a generic outdoor skybox)

import {
  evaluateSH9,
  type BakedIrradianceProbe,
  type ParallaxReflectionBox,
  type SH9Coeffs,
} from '../../services/gamestudio/compiler/lightBaker';
import type { Vec3 } from '../physics/runtime';

export class IrradianceProbeVolume {
  private readonly probes: BakedIrradianceProbe[] = [];

  constructor(initialProbes: BakedIrradianceProbe[] = []) {
    this.probes.push(...initialProbes);
  }

  addProbe(probe: BakedIrradianceProbe): void {
    this.probes.push(probe);
  }

  get count(): number {
    return this.probes.length;
  }

  /** Blend the `k` nearest baked SH9 probes smoothly at `worldPos` and evaluate diffuse irradiance for `normal`. */
  sampleIrradiance(worldPos: Vec3, normal: Vec3, k = 4): Vec3 {
    if (this.probes.length === 0) return [0.15, 0.16, 0.2];
    const ranked = this.probes
      .map((p) => {
        const dx = worldPos[0] - p.position[0];
        const dy = worldPos[1] - p.position[1];
        const dz = worldPos[2] - p.position[2];
        return { p, distSq: dx * dx + dy * dy + dz * dz };
      })
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, Math.max(1, Math.min(k, this.probes.length)));

    const blended: SH9Coeffs = [
      [0, 0, 0], [0, 0, 0], [0, 0, 0],
      [0, 0, 0], [0, 0, 0], [0, 0, 0],
      [0, 0, 0], [0, 0, 0], [0, 0, 0],
    ];
    let totalW = 0;

    for (const item of ranked) {
      const w = 1 / (item.distSq + 0.05);
      totalW += w;
      for (let i = 0; i < 9; i++) {
        blended[i][0] += item.p.sh[i][0] * w;
        blended[i][1] += item.p.sh[i][1] * w;
        blended[i][2] += item.p.sh[i][2] * w;
      }
    }

    const inv = 1 / Math.max(1e-6, totalW);
    for (let i = 0; i < 9; i++) {
      blended[i][0] *= inv;
      blended[i][1] *= inv;
      blended[i][2] *= inv;
    }

    return evaluateSH9(blended, normal);
  }
}

/**
 * Lagarde's Parallax-Corrected Cubemap reflection direction for an interior room box.
 * Intersects ray `(worldPos + t * reflectDir)` with `[box.boxMin, box.boxMax]` and returns
 * the corrected cubemap lookup direction from `box.center`.
 */
export function parallaxCorrectReflection(
  worldPos: Vec3,
  reflectDir: Vec3,
  box: ParallaxReflectionBox,
): Vec3 {
  const rx = Math.abs(reflectDir[0]) < 1e-6 ? 1e-6 : reflectDir[0];
  const ry = Math.abs(reflectDir[1]) < 1e-6 ? 1e-6 : reflectDir[1];
  const rz = Math.abs(reflectDir[2]) < 1e-6 ? 1e-6 : reflectDir[2];

  const firstX = (box.boxMax[0] - worldPos[0]) / rx;
  const secondX = (box.boxMin[0] - worldPos[0]) / rx;
  const firstY = (box.boxMax[1] - worldPos[1]) / ry;
  const secondY = (box.boxMin[1] - worldPos[1]) / ry;
  const firstZ = (box.boxMax[2] - worldPos[2]) / rz;
  const secondZ = (box.boxMin[2] - worldPos[2]) / rz;

  const largestX = Math.max(firstX, secondX);
  const largestY = Math.max(firstY, secondY);
  const largestZ = Math.max(firstZ, secondZ);
  const dist = Math.min(largestX, largestY, largestZ);

  const hitX = worldPos[0] + reflectDir[0] * dist;
  const hitY = worldPos[1] + reflectDir[1] * dist;
  const hitZ = worldPos[2] + reflectDir[2] * dist;

  const cx = hitX - box.center[0];
  const cy = hitY - box.center[1];
  const cz = hitZ - box.center[2];
  const l = Math.hypot(cx, cy, cz) || 1;
  return [cx / l, cy / l, cz / l];
}

/** Find the interior reflection probe box containing `worldPos` (plus smooth edge blend weight). */
export function selectReflectionBox(
  worldPos: Vec3,
  boxes: ReadonlyArray<ParallaxReflectionBox>,
): { box: ParallaxReflectionBox; weight: number } | null {
  for (const box of boxes) {
    const inside =
      worldPos[0] >= box.boxMin[0] && worldPos[0] <= box.boxMax[0] &&
      worldPos[1] >= box.boxMin[1] && worldPos[1] <= box.boxMax[1] &&
      worldPos[2] >= box.boxMin[2] && worldPos[2] <= box.boxMax[2];
    if (!inside) continue;

    const dx = Math.min(worldPos[0] - box.boxMin[0], box.boxMax[0] - worldPos[0]);
    const dy = Math.min(worldPos[1] - box.boxMin[1], box.boxMax[1] - worldPos[1]);
    const dz = Math.min(worldPos[2] - box.boxMin[2], box.boxMax[2] - worldPos[2]);
    const minEdge = Math.min(dx, dy, dz);
    const weight = Math.max(0, Math.min(1, minEdge / Math.max(0.05, box.blendDistanceM)));
    return { box, weight };
  }
  return null;
}
