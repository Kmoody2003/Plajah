// games/apex/src/botanicalTextures.ts
//
// Botanical PBR texture generator for Plajah Motorsport: Apex vegetation:
//   1. Derives crisp tangent-space normal maps (midrib/vein + serrated leaf relief) and
//      waxy cuticle roughness maps directly from scanned leaf albedo sheets (`oak_color.png`,
//      `pine_color.png`, `ash_color.png`, `aspen_color.png`) once loaded — zero extra downloads,
//      100% WebGPU-safe valid 4x4 fallback canvas before load completes.
//   2. Synthesizes high-detail 512px alpha-tested botanical undergrowth PBR sets
//      (diffuse + tangent normal + waxy roughness) for Michigan woodland ferns and
//      meadow clover / wildflowers (Queen Anne's lace, goldenrod, chicory).

import * as THREE from 'three';

export interface BotanicalPbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

function makeFlatCanvas(hex: string, size = 4): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = hex;
  g.fillRect(0, 0, size, size);
  return c;
}

function buildNormalAndRoughnessFromImage(
  img: CanvasImageSource,
  srcW: number,
  srcH: number,
  maxDim = 512,
  normalStrength = 2.6,
): { nrmCanvas: HTMLCanvasElement; rghCanvas: HTMLCanvasElement } {
  const w = Math.min(maxDim, Math.max(64, srcW));
  const h = Math.min(maxDim, Math.max(64, srcH));
  const srcC = document.createElement('canvas');
  srcC.width = w;
  srcC.height = h;
  const sCtx = srcC.getContext('2d', { willReadFrequently: true })!;
  sCtx.drawImage(img, 0, 0, w, h);
  const px = sCtx.getImageData(0, 0, w, h).data;

  // Height proxy: bright green lamina sits slightly raised vs dark veins/stems; alpha bevel rounds leaf edges
  const ht = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4] / 255;
    const g = px[i * 4 + 1] / 255;
    const b = px[i * 4 + 2] / 255;
    const a = px[i * 4 + 3] / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    ht[i] = (lum * 0.72 + g * 0.28) * a;
  }

  const nrmC = document.createElement('canvas');
  nrmC.width = w;
  nrmC.height = h;
  const nCtx = nrmC.getContext('2d')!;
  const nImg = nCtx.createImageData(w, h);
  const nd = nImg.data;

  const rghC = document.createElement('canvas');
  rghC.width = w;
  rghC.height = h;
  const rCtx = rghC.getContext('2d')!;
  const rImg = rCtx.createImageData(w, h);
  const rd = rImg.data;

  const at = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(w - 1, x));
    const cy = Math.max(0, Math.min(h - 1, y));
    return ht[cy * w + cx];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      // 3x3 Sobel gradient for crisp central vein & serrated leaflet curvature
      const tl = at(x - 1, y - 1), tc = at(x, y - 1), tr = at(x + 1, y - 1);
      const ml = at(x - 1, y),                        mr = at(x + 1, y);
      const bl = at(x - 1, y + 1), bc = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const dy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      const nx = -dx * normalStrength;
      const ny = dy * normalStrength; // OpenGL +Y-up tangent normal
      const nz = 1.0;
      const invL = 1 / Math.hypot(nx, ny, nz);
      const o = idx * 4;
      nd[o] = Math.round((nx * invL * 0.5 + 0.5) * 255);
      nd[o + 1] = Math.round((ny * invL * 0.5 + 0.5) * 255);
      nd[o + 2] = Math.round((nz * invL * 0.5 + 0.5) * 255);
      nd[o + 3] = 255;

      // Waxy cuticle roughness: smooth leaf lamina ~0.36..0.48, veins/crevices/stems rougher ~0.68..0.82
      const gradMag = Math.min(1, Math.hypot(dx, dy) * 2.2);
      const rVal = Math.max(0.32, Math.min(0.86, 0.42 + gradMag * 0.34 + (1 - ht[idx]) * 0.14));
      const rb = Math.round(rVal * 255);
      rd[o] = rb;
      rd[o + 1] = rb;
      rd[o + 2] = rb;
      rd[o + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  return { nrmCanvas: nrmC, rghCanvas: rghC };
}

const derivedLeafCache = new Map<string, { normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture }>();

/**
 * Derive paired tangent normal + waxy cuticle roughness textures from a leaf scan URL.
 * Pre-allocates fixed 256x256 canvases (neutral normal/roughness) and updates their pixel
 * buffers in-place on load — ZERO .dispose() or .source swaps, 100% WebGPU bind-group safe!
 */
export function getDerivedLeafPbrMaps(albedoUrl: string, normalStrength = 2.6): {
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const hit = derivedLeafCache.get(albedoUrl);
  if (hit) return hit;

  const DIM = 256;
  const nrmCanvas = makeFlatCanvas('#8080ff', DIM);
  const nrm = new THREE.CanvasTexture(nrmCanvas);
  nrm.colorSpace = THREE.NoColorSpace;
  nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
  nrm.anisotropy = 4;
  nrm.needsUpdate = true;

  const rghCanvas = makeFlatCanvas('#787878', DIM);
  const rgh = new THREE.CanvasTexture(rghCanvas);
  rgh.colorSpace = THREE.NoColorSpace;
  rgh.wrapS = rgh.wrapT = THREE.RepeatWrapping;
  rgh.anisotropy = 4;
  rgh.needsUpdate = true;

  const pair = { normalMap: nrm, roughnessMap: rgh };
  derivedLeafCache.set(albedoUrl, pair);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const built = buildNormalAndRoughnessFromImage(img, DIM, DIM, DIM, normalStrength);
      const nCtx = nrmCanvas.getContext('2d');
      if (nCtx) {
        nCtx.clearRect(0, 0, DIM, DIM);
        nCtx.drawImage(built.nrmCanvas, 0, 0, DIM, DIM);
        nrm.needsUpdate = true;
      }
      const rCtx = rghCanvas.getContext('2d');
      if (rCtx) {
        rCtx.clearRect(0, 0, DIM, DIM);
        rCtx.drawImage(built.rghCanvas, 0, 0, DIM, DIM);
        rgh.needsUpdate = true;
      }
    } catch { /* keep flat fallback */ }
  };
  img.src = albedoUrl;
  return pair;
}

let cachedFernSet: BotanicalPbrSet | null = null;

/** High-detail 512px alpha-tested Michigan woodland bracken/ostrich fern frond PBR set (diffuse + normal + waxy roughness). */
export function getWoodlandFernPbr(): BotanicalPbrSet {
  if (cachedFernSet) return cachedFernSet;
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, W, H);

  // Draw 3 layered overlapping graceful fern fronds radiating from the base
  const fronds: Array<{ baseX: number; tilt: number; len: number; scale: number; tint: number }> = [
    { baseX: W * 0.50, tilt: -0.34, len: 410, scale: 0.88, tint: 0.88 },
    { baseX: W * 0.50, tilt: 0.32,  len: 405, scale: 0.86, tint: 0.92 },
    { baseX: W * 0.50, tilt: 0.02,  len: 455, scale: 1.00, tint: 1.05 },
  ];

  for (const f of fronds) {
    g.save();
    g.translate(f.baseX, H - 18);
    g.rotate(f.tilt);

    // Central woody rachis stem
    const stemGrad = g.createLinearGradient(0, 0, 0, -f.len);
    stemGrad.addColorStop(0, '#2a3d1c');
    stemGrad.addColorStop(0.5, '#3b5d24');
    stemGrad.addColorStop(1, '#588530');
    g.strokeStyle = stemGrad;
    g.lineWidth = 6 * f.scale;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(10 * f.scale, -f.len * 0.55, 0, -f.len);
    g.stroke();

    // Paired serrated pinnae (leaflets) tapering cleanly toward frond apex
    const pairs = 22;
    for (let i = 0; i < pairs; i++) {
      const t = (i + 1) / (pairs + 1);
      const y = -t * f.len * 0.94 - 18;
      const env = Math.sin(Math.pow(t, 0.72) * Math.PI);
      const pLen = (16 + 112 * env) * f.scale;
      const pW = (5 + 14 * env) * f.scale;

      for (const side of [-1, 1]) {
        g.save();
        g.translate(0, y);
        g.rotate(side * (0.28 + (1 - t) * 0.22));
        const r = Math.round((46 + 44 * t) * f.tint);
        const gr = Math.round((98 + 64 * t) * f.tint);
        const b = Math.round((32 + 22 * t) * f.tint);
        const lg = g.createLinearGradient(0, 0, side * pLen, 0);
        lg.addColorStop(0, `rgb(${Math.max(18, r - 14)},${Math.max(40, gr - 22)},${Math.max(12, b - 8)})`);
        lg.addColorStop(0.65, `rgb(${r},${gr},${b})`);
        lg.addColorStop(1, `rgb(${Math.min(220, r + 24)},${Math.min(235, gr + 28)},${Math.min(160, b + 12)})`);
        g.fillStyle = lg;

        // Serrated lobed pinna silhouette
        g.beginPath();
        g.moveTo(0, -pW * 0.32);
        const lobes = Math.max(3, Math.round(pLen / 16));
        for (let k = 1; k <= lobes; k++) {
          const lt = k / lobes;
          const lx = side * pLen * lt;
          const lw = pW * (1 - lt * 0.82);
          g.quadraticCurveTo(lx - side * (pLen / lobes) * 0.45, -lw * 1.15, lx, -lw * 0.48);
        }
        g.lineTo(side * pLen * 1.04, 0);
        for (let k = lobes; k >= 1; k--) {
          const lt = k / lobes;
          const lx = side * pLen * lt;
          const lw = pW * (1 - lt * 0.82);
          g.quadraticCurveTo(lx - side * (pLen / lobes) * 0.45, lw * 1.15, lx - side * (pLen / lobes) * 0.85, lw * 0.45);
        }
        g.closePath();
        g.fill();

        // Central leaflet vein highlight
        g.strokeStyle = `rgba(${Math.min(235, r + 40)},${Math.min(245, gr + 42)},${Math.min(180, b + 20)},0.45)`;
        g.lineWidth = Math.max(1, 1.5 * f.scale);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(side * pLen * 0.88, 0);
        g.stroke();
        g.restore();
      }
    }
    g.restore();
  }

  const { nrmCanvas, rghCanvas } = buildNormalAndRoughnessFromImage(c, W, H, 256, 2.8);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.needsUpdate = true;

  const normalMap = new THREE.CanvasTexture(nrmCanvas);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.anisotropy = 4;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(rghCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.anisotropy = 4;
  roughnessMap.needsUpdate = true;

  cachedFernSet = { map, normalMap, roughnessMap };
  return cachedFernSet;
}

let cachedWildflowerSet: BotanicalPbrSet | null = null;

/** High-detail 512px alpha-tested Michigan clover + wildflower cluster (Queen Anne's lace, goldenrod, chicory) PBR set. */
export function getMeadowWildflowerPbr(): BotanicalPbrSet {
  if (cachedWildflowerSet) return cachedWildflowerSet;
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, W, H);

  let s = 31337;
  const rnd = (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };

  // 1. Lower dense clover & wild herb stems + trifoliate leaves
  for (let i = 0; i < 42; i++) {
    const x = 68 + rnd() * (W - 136);
    const topY = H - 90 - rnd() * 210;
    const lean = (rnd() - 0.5) * 44;
    g.strokeStyle = `rgb(${34 + Math.round(rnd() * 20)},${76 + Math.round(rnd() * 34)},${24 + Math.round(rnd() * 14)})`;
    g.lineWidth = 2.6 + rnd() * 1.8;
    g.beginPath();
    g.moveTo(x, H - 8);
    g.quadraticCurveTo(x + lean * 0.5, (H + topY) * 0.5, x + lean, topY);
    g.stroke();

    // Trifoliate clover leaf rosette along lower stem
    const lx = x + lean * 0.72;
    const ly = topY + 26 + rnd() * 38;
    const lr = 11 + rnd() * 10;
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI * 2 + rnd() * 0.4;
      const cx = lx + Math.cos(ang) * lr * 0.75;
      const cy = ly + Math.sin(ang) * lr * 0.75;
      g.fillStyle = `rgb(${44 + Math.round(rnd() * 24)},${98 + Math.round(rnd() * 44)},${30 + Math.round(rnd() * 16)})`;
      g.beginPath();
      g.ellipse(cx, cy, lr * 0.65, lr * 0.48, ang, 0, Math.PI * 2);
      g.fill();
    }
  }

  // 2. Taller flowering stalks with Michigan wildflower umbels (white Queen Anne's lace, warm goldenrod, blue chicory)
  const bloomCols = [
    { petal: '#f6f5ea', center: '#d8b44c', kind: 'umbel' },
    { petal: '#e9bd34', center: '#b87c18', kind: 'plume' },
    { petal: '#f3f1e4', center: '#c8a83e', kind: 'umbel' },
    { petal: '#7ea6e4', center: '#eef2ff', kind: 'daisy' },
  ];
  for (let i = 0; i < 18; i++) {
    const bx = 78 + (i / 17) * (W - 156) + (rnd() - 0.5) * 26;
    const topY = 74 + rnd() * 145;
    const lean = (rnd() - 0.5) * 42;
    g.strokeStyle = '#386228';
    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(bx, H - 10);
    g.quadraticCurveTo(bx + lean * 0.4, (H + topY) * 0.52, bx + lean, topY);
    g.stroke();

    const fx = bx + lean;
    const fy = topY;
    const style = bloomCols[i % bloomCols.length];
    if (style.kind === 'umbel') {
      // Lace floret cluster
      for (let d = 0; d < 14; d++) {
        const a = (d / 14) * Math.PI * 2 + rnd() * 0.3;
        const dist = 5 + rnd() * 18;
        g.fillStyle = style.petal;
        g.beginPath();
        g.arc(fx + Math.cos(a) * dist, fy + Math.sin(a) * dist * 0.68, 4.2 + rnd() * 2.5, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = style.center;
      g.beginPath();
      g.arc(fx, fy, 4.2, 0, Math.PI * 2);
      g.fill();
    } else if (style.kind === 'plume') {
      // Goldenrod flower plume
      for (let d = 0; d < 18; d++) {
        const t = d / 17;
        g.fillStyle = d % 3 === 0 ? style.center : style.petal;
        g.beginPath();
        g.arc(fx + (rnd() - 0.5) * (24 * (1 - t * 0.5)), fy + t * 38 - 14, 4.5 + rnd() * 2.2, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // Star-petal chicory / aster bloom
      g.fillStyle = style.petal;
      for (let p = 0; p < 9; p++) {
        const a = (p / 9) * Math.PI * 2;
        g.beginPath();
        g.ellipse(fx + Math.cos(a) * 10, fy + Math.sin(a) * 10, 7.5, 3.2, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = style.center;
      g.beginPath();
      g.arc(fx, fy, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  const { nrmCanvas, rghCanvas } = buildNormalAndRoughnessFromImage(c, W, H, 256, 2.4);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.needsUpdate = true;

  const normalMap = new THREE.CanvasTexture(nrmCanvas);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.anisotropy = 4;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(rghCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.anisotropy = 4;
  roughnessMap.needsUpdate = true;

  cachedWildflowerSet = { map, normalMap, roughnessMap };
  return cachedWildflowerSet;
}
