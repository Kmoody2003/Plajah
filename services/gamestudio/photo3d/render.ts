// A small software renderer: enough to put the model in the photo's frame (and a few other angles) for the
// scorer and the eye. Albedo with a soft key light, like the Forge's fidelity renders, so colour compares with
// the photo's colour rather than with our lighting.

import { basis, project } from './camera';
import type { TriMesh } from './mesh';
import { vertexNormals } from './mesh';
import type { Picture } from './score';
import type { ModelCamera, Vec3 } from './schema';

export interface RenderOut { picture: Picture; depth: Float32Array }

export interface RenderOpts {
  /** Light direction in view space terms: from upper left by default. */
  ambient?: number;
  /** sRGB bytes of the background where nothing is drawn (alpha stays 0). */
  background?: [number, number, number];
  /** Skip colour, only depth and coverage (faster; for visibility tests). */
  depthOnly?: boolean;
}

export function renderMesh(m: TriMesh, cam: ModelCamera, opts: RenderOpts = {}): RenderOut {
  const W = cam.width, H = cam.height;
  const data = new Uint8ClampedArray(W * H * 4);
  const bg = opts.background ?? [255, 255, 255];
  for (let i = 0; i < W * H; i++) { data[i * 4] = bg[0]; data[i * 4 + 1] = bg[1]; data[i * 4 + 2] = bg[2]; data[i * 4 + 3] = 0; }
  const depth = new Float32Array(W * H).fill(Infinity);
  const b = basis(cam);
  const N = m.normals ?? vertexNormals(m);
  const C = m.colours;
  const nv = m.positions.length / 3;
  const sx = new Float32Array(nv), sy = new Float32Array(nv), sz = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    const p: Vec3 = [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
    const [x, y, z] = project(cam, p, b);
    sx[i] = x; sy[i] = y; sz[i] = z;
  }
  // Key light from the camera's upper left, a little in front.
  const L: Vec3 = (() => { const v: Vec3 = [-b.right[0] * 0.5 + b.up[0] * 0.6 - b.fwd[0] * 0.8, -b.right[1] * 0.5 + b.up[1] * 0.6 - b.fwd[1] * 0.8, -b.right[2] * 0.5 + b.up[2] * 0.6 - b.fwd[2] * 0.8]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
  const amb = opts.ambient ?? 0.62;
  const shadeAt = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    let d = N[i * 3] * L[0] + N[i * 3 + 1] * L[1] + N[i * 3 + 2] * L[2];
    // Two-sided: scans have the odd flipped patch.
    const facing = -(N[i * 3] * b.fwd[0] + N[i * 3 + 1] * b.fwd[1] + N[i * 3 + 2] * b.fwd[2]);
    if (facing < 0) d = -d;
    shadeAt[i] = amb + (1 - amb) * Math.max(0, d);
  }
  const I = m.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], c1 = I[t + 1], c2 = I[t + 2];
    if (sz[a] <= 1e-4 || sz[c1] <= 1e-4 || sz[c2] <= 1e-4) continue;
    const x0 = sx[a], y0 = sy[a], x1 = sx[c1], y1 = sy[c1], x2 = sx[c2], y2 = sy[c2];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) continue;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      const qx = px + 0.5, qy = py + 0.5;
      const w0 = ((x1 - qx) * (y2 - qy) - (x2 - qx) * (y1 - qy)) / area;
      const w1 = ((x2 - qx) * (y0 - qy) - (x0 - qx) * (y2 - qy)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      // Perspective-correct depth: interpolate 1/z.
      const iz = w0 / sz[a] + w1 / sz[c1] + w2 / sz[c2];
      const z = 1 / iz;
      const k = py * W + px;
      if (z >= depth[k]) continue;
      depth[k] = z;
      data[k * 4 + 3] = 255;
      if (opts.depthOnly) continue;
      const u0 = w0 / sz[a] / iz, u1 = w1 / sz[c1] / iz, u2 = w2 / sz[c2] / iz;
      const s = shadeAt[a] * u0 + shadeAt[c1] * u1 + shadeAt[c2] * u2;
      for (let ch = 0; ch < 3; ch++) {
        const col = C ? C[a * 3 + ch] * u0 + C[c1 * 3 + ch] * u1 + C[c2 * 3 + ch] * u2 : 0.71;
        data[k * 4 + ch] = Math.round(Math.min(1, col * s) * 255);
      }
    }
  }
  return { picture: { width: W, height: H, data }, depth };
}

/** Side by side (for the eye and for people reading the run's pictures). */
export function sideBySide(pics: Picture[], gap = 8): Picture {
  const H = Math.max(...pics.map(p => p.height));
  const W = pics.reduce((s, p) => s + p.width, 0) + gap * (pics.length - 1);
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  let ox = 0;
  for (const p of pics) {
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
      const s = (y * p.width + x) * 4, d = (y * W + ox + x) * 4, a = p.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) data[d + c] = Math.round(p.data[s + c] * a + 255 * (1 - a));
    }
    ox += p.width + gap;
  }
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width: W, height: H, data };
}
