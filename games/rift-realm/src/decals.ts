// Canvas decals shared by levels (glowing circuit traces).
import * as THREE from 'three/webgpu';
import { rng } from './geom';

/** Circuit traces on a transparent canvas: the art's glowing rune-circuits (gold in the throne hall, cyan in the forge). */
export function circuitTexture(w: number, h: number, col: string, seed: number, traces: number, alongY: boolean) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const r = rng(seed), S = 16;
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3; g.lineJoin = 'miter';
  for (let i = 0; i < traces; i++) {
    let x = alongY ? w * (0.2 + 0.6 * (i + 0.5) / traces) : Math.round(r() * w / S) * S;
    let y = alongY ? h : Math.round(r() * h / S) * S;
    g.beginPath(); g.moveTo(x, y);
    const segs = alongY ? 40 : 3 + Math.floor(r() * 4);
    for (let k = 0; k < segs; k++) {
      const len = S * (1 + Math.floor(r() * (alongY ? 4 : 5)));
      if (alongY) { // runs up the aisle, jogging sideways on 45° diagonals
        const jog = r() < 0.35 ? (r() < 0.5 ? -1 : 1) * S * (1 + Math.floor(r() * 2)) : 0;
        const nx = Math.min(w * 0.85, Math.max(w * 0.15, x + jog));
        y -= Math.abs(nx - x) || 0; x = nx; g.lineTo(x, y);
        y -= len; g.lineTo(x, y);
        if (y < 0) break;
      } else {
        const d = Math.floor(r() * 8), dx = [1, 1, 0, -1, -1, -1, 0, 1][d], dy = [0, 1, 1, 1, 0, -1, -1, -1][d];
        x = Math.min(w - 8, Math.max(8, x + dx * len)); y = Math.min(h - 8, Math.max(8, y + dy * len)); g.lineTo(x, y);
      }
    }
    g.stroke();
    g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    if (!alongY) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.stroke(); }
  }
  if (alongY) for (const ex of [6, w - 6]) { g.beginPath(); g.moveTo(ex, 0); g.lineTo(ex, h); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
