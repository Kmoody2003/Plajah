/**
 * forgeArmsLook.ts — the arms' look, painted from what they are made of.
 *
 * The Heritage Codex says what each surface of a sword is (polished tamahagane with a hamon, ray skin, braided silk,
 * gilt copper chased with nanako, forged iron, urushi over magnolia, buffalo horn); the context stage measured the
 * character's own colours from the flat-lay. Here each becomes a PBR material with its own maps, generated at the
 * resolution the piece is seen at:
 *
 *   blade     base colour + ORM + normal over koshirae.ts's blade UVs (u across, edge 0 → back 0.5, each face; v along):
 *             the ha frosted bright to the hamon's line (midare or notare as the art shows, the boshi turning back in
 *             the kissaki), nie sparkling along the line, the ji's itame grain in the polish, the shinogi-ji burnished
 *   same      a field of nodules;  ito  the braid's diagonal ridges;  fittings  nanako, rows of tiny raised rings
 *   tsuba     forged iron with a hammered face and a relief of radiating petals;  saya  deep lacquer, faint mottle
 */
import { PNG } from 'pngjs';
import type { GMaterial } from '../../services/argilla/creature/gltfWriter';

type RGB = [number, number, number];
export const ARMS_MATERIALS = ['blade', 'ito', 'same', 'fittings', 'tsuba', 'seppa', 'saya', 'sageo', 'horn'] as const;

const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
};
const fbm = (x: number, y: number, o = 4) => { let v = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { v += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; } return v; };
const srgb = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));

function png(w: number, h: number, f: (x: number, y: number) => [number, number, number]) {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y), i = (y * w + x) * 4; p.data[i] = c[0]; p.data[i + 1] = c[1]; p.data[i + 2] = c[2]; p.data[i + 3] = 255; }
  return new Uint8Array(PNG.sync.write(p));
}
/** Normal map from a height field over a w × h grid (wraps), strength in texels. */
function normals(w: number, h: number, height: Float32Array, strength: number) {
  return png(w, h, (x, y) => {
    const H = (xx: number, yy: number) => height[((yy + h) % h) * w + ((xx + w) % w)];
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    return [Math.round((-dx / l * 0.5 + 0.5) * 255), Math.round((-dy / l * 0.5 + 0.5) * 255), Math.round((1 / l * 0.5 + 0.5) * 255)];
  });
}

export interface ArmLook { colours: Partial<Record<'ito' | 'same' | 'fittings' | 'saya' | 'steel', RGB>>; features: { bohi?: boolean; hamon?: string }; materials: Record<string, { color: RGB; metallic: number; roughness: number }>; dims: { nagasa: number; kissaki: number } }

/** The hamon's line: how far across from the edge (0) the hardened band reaches, along the blade (t 0..1). */
export function hamonLine(kind: string | undefined, yokote: number) {
  return (t: number) => {
    if (t > yokote) { const k = (t - yokote) / (1 - yokote); return 0.3 + 0.5 * k * k; } // the boshi, turning back (komaru)
    const base = 0.28;
    if (kind === 'suguha') return base + 0.01 * Math.sin(t * 90);
    if (kind === 'notare') return base + 0.06 * Math.sin(t * Math.PI * 2 * 4.5 + 0.7) + 0.012 * Math.sin(t * 160);
    // midare: irregular, clustered heads (choji-like) riding a slow wave
    return base + 0.05 * Math.sin(t * Math.PI * 2 * 3.2) + 0.07 * Math.max(0, Math.sin(t * Math.PI * 2 * 11 + 3 * fbm(t * 6, 1.3))) ** 2 + 0.02 * (fbm(t * 40, 7) - 0.5);
  };
}

export function armsLook(look: ArmLook): { materials: GMaterial[]; images: Uint8Array[] } {
  const images: Uint8Array[] = [];
  const img = (b: Uint8Array) => { images.push(b); return images.length - 1; };
  const mat = look.materials;
  const col = (k: keyof ArmLook['colours'], fallback: RGB): RGB => look.colours[k] ?? fallback;
  // a metal's colour in a photo is mostly what it reflects (a dark room makes polished steel look black), so a metal
  // takes only its hue from the art and its brightness from what the codex says it is made of
  const metal = (k: keyof ArmLook['colours'], codex: RGB): RGB => {
    const m = look.colours[k]; if (!m) return codex;
    const L = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const k2 = L(codex) / Math.max(1e-4, L(m));
    // (hue kept, saturation held near the codex's: a grey photo of gilt stays gold, a warm cast on steel stays slight)
    const c = m.map((v) => v * k2) as RGB;
    return c.map((v, i) => Math.min(1, codex[i] * 0.5 + v * 0.5)) as RGB;
  };

  // ---- blade: 512 across (two faces), 2048 along ---------------------------------------------------------------------
  const BW = 512, BH = 2048, yokote = 1 - look.dims.kissaki / look.dims.nagasa;
  const line = hamonLine(look.features.hamon, yokote);
  const steel = metal('steel', mat.steel.color), ha = mat.hamon.color;
  const base = new Uint8Array(BW * BH * 3), orm = new Uint8Array(BW * BH * 3), height = new Float32Array(BW * BH);
  for (let y = 0; y < BH; y++) {
    const t = y / (BH - 1), hl = line(t);
    for (let x = 0; x < BW; x++) {
      const a = ((x / BW) % 0.5) * 2, i = y * BW + x;
      // itame hada: grain like wood, stretched along the blade
      const g = fbm(a * 9 + (x >= BW / 2 ? 50 : 0), t * 70, 5);
      const grain = Math.sin((g * 6 + a * 3) * Math.PI * 2) * 0.5 + 0.5;
      let c: RGB, rough: number, h = grain * 0.15, metalness = 1;
      if (a > 0.78) { const k = 0.8; c = [steel[0] * k, steel[1] * k, steel[2] * k]; rough = 0.17; h = 0; } // shinogi-ji: burnished
      else {
        // across the line: nioi, a soft misty transition; nie: bright crystals scattered along it
        const s = (hl - a) / 0.025, w = 1 / (1 + Math.exp(-s * 2.2));
        const nie = Math.abs(a - hl) < 0.05 && hash(x * 1.7, y * 3.1) > 0.965 ? 0.12 : 0;
        const ji = 0.92 + grain * 0.08;
        c = [steel[0] * ji * (1 - w) + ha[0] * w + nie, steel[1] * ji * (1 - w) + ha[1] * w + nie, steel[2] * ji * (1 - w) + ha[2] * w + nie];
        // (a near-mirror catches the sun hot enough to flood the bloom: in a game a polish glints at about 0.2)
        rough = 0.2 * (1 - w) + 0.38 * w + (nie ? -0.08 : 0);
        // the hardened band reads milky white, not mirror: its martensite scatters light, and the polisher's hazuya
        // stones frost it on purpose so the hamon shows against the dark mirror of the ji
        metalness = 1 - 0.5 * w;
        h = grain * 0.15 * (1 - w) + (hash(x, y) - 0.5) * 0.08 * w;
      }
      base[i * 3] = srgb(c[0]); base[i * 3 + 1] = srgb(c[1]); base[i * 3 + 2] = srgb(c[2]);
      orm[i * 3] = 255; orm[i * 3 + 1] = Math.round(rough * 255); orm[i * 3 + 2] = Math.round(metalness * 255);
      height[i] = h;
    }
  }
  const asPng = (buf: Uint8Array, w: number, h: number) => png(w, h, (x, y) => { const i = (y * w + x) * 3; return [buf[i], buf[i + 1], buf[i + 2]]; });
  const blade: GMaterial = { name: 'blade', color: [1, 1, 1, 1], metallic: 1, roughness: 1, baseColorTexture: img(asPng(base, BW, BH)), ormTexture: img(asPng(orm, BW, BH)), normalTexture: img(normals(BW, BH, height, 1.2)), normalScale: 0.25, doubleSided: true };

  // ---- same: nodules (square tile, one round of the grip) -------------------------------------------------------------
  const N = 256;
  const sameH = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const cell = 11; const cx = Math.floor(x / cell), cy = Math.floor(y / cell); let best = 9;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const gx = (cx + dx + 64) % Math.ceil(N / cell), gy = (cy + dy + 64) % Math.ceil(N / cell);
      const px = (cx + dx + 0.5 + (hash(gx, gy) - 0.5) * 0.5) * cell, py = (cy + dy + 0.5 + (hash(gy, gx) - 0.5) * 0.5) * cell;
      best = Math.min(best, Math.hypot(x - px, y - py) / (cell * (0.38 + 0.12 * hash(gx + 3, gy))));
    }
    sameH[y * N + x] = Math.sqrt(Math.max(0, 1 - best * best));
  }
  const sc = col('same', mat.same.color);
  const same: GMaterial = { name: 'same', color: [1, 1, 1, 1], metallic: 0, roughness: mat.same.roughness, baseColorTexture: img(png(N, N, (x, y) => { const h = sameH[y * N + x], k = 0.82 + 0.18 * h; return [srgb(sc[0] * k), srgb(sc[1] * k), srgb(sc[2] * k * 0.97)]; })), normalTexture: img(normals(N, N, sameH, 3)), normalScale: 1 };

  // ---- ito: braided ridges (u across the braid, v along) ----------------------------------------------------------------
  const itoH = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const strands = Math.abs(Math.sin((u * 6 + v * 8) * Math.PI)) * Math.abs(Math.sin((u * 6 - v * 8) * Math.PI));
    itoH[y * N + x] = strands * Math.sin(u * Math.PI) ** 0.4;
  }
  const ic = col('ito', mat.ito.color);
  const tint = (c: RGB, h: Float32Array, k0: number, k1: number) => png(N, N, (x, y) => { const k = k0 + k1 * h[y * N + x]; return [srgb(c[0] * k), srgb(c[1] * k), srgb(c[2] * k)]; });
  const ito: GMaterial = { name: 'ito', color: [1, 1, 1, 1], metallic: 0, roughness: mat.ito.roughness, baseColorTexture: img(tint(ic, itoH, 0.7, 0.55)), normalTexture: img(normals(N, N, itoH, 2.5)), normalScale: 1, sheen: { color: [Math.min(1, ic[0] * 3 + 0.03), Math.min(1, ic[1] * 3 + 0.03), Math.min(1, ic[2] * 3 + 0.05)], roughness: 0.3 }, doubleSided: true };
  const sageo: GMaterial = { ...ito, name: 'sageo', color: [1, 1, 1, 1], roughness: mat.sageo.roughness, extras: { uvScale: 6 }, uvScale: 6 };

  // ---- fittings: nanako (rows of tiny raised rings) --------------------------------------------------------------------
  const nanH = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const row = Math.floor(y / 8), xx = x + (row % 2) * 4, d = Math.hypot((xx % 8) - 4, (y % 8) - 4);
    nanH[y * N + x] = Math.exp(-((d - 2.4) ** 2) / 0.8);
  }
  const fc = metal('fittings', mat.fittings.color);
  const fittings: GMaterial = { name: 'fittings', color: [fc[0], fc[1], fc[2], 1], metallic: 1, roughness: mat.fittings.roughness, normalTexture: img(normals(N, N, nanH, 2)), normalScale: 0.8, extras: { uvScale: 3 }, uvScale: 3 };

  // ---- tsuba: forged iron, hammered, a relief of radiating petals (planar over the disc) -------------------------------
  const T = 512, tsH = new Float32Array(T * T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const u = x / T - 0.5, v = y / T - 0.5, r = Math.hypot(u, v) * 2, a = Math.atan2(v, u);
    const petal = r > 0.42 && r < 0.9 ? Math.max(0, Math.cos(a * 8)) ** 3 * Math.sin(Math.PI * (r - 0.42) / 0.48) : 0;
    tsH[y * T + x] = petal * 0.9 + fbm(x / 18, y / 18, 3) * 0.25;
  }
  const tc = mat.tsuba.color;
  const tsuba: GMaterial = { name: 'tsuba', color: [1, 1, 1, 1], metallic: mat.tsuba.metallic, roughness: mat.tsuba.roughness, baseColorTexture: img(png(T, T, (x, y) => { const h = tsH[y * T + x], k = 0.8 + 0.6 * h + 0.2 * (fbm(x / 40, y / 40) - 0.5); return [srgb(tc[0] * k * 1.05), srgb(tc[1] * k), srgb(tc[2] * k * 0.95)]; })), normalTexture: img(normals(T, T, tsH, 6)), normalScale: 1 };

  // ---- saya: deep urushi, a faint mottle under the clear coat ----------------------------------------------------------
  const yc = col('saya', mat.saya.color);
  const sayaH = new Float32Array(N * N); for (let i = 0; i < N * N; i++) sayaH[i] = fbm((i % N) / 30, Math.floor(i / N) / 30, 3);
  const saya: GMaterial = { name: 'saya', color: [1, 1, 1, 1], metallic: 0, roughness: 0.28, baseColorTexture: img(tint(yc, sayaH, 0.85, 0.3)), normalTexture: img(normals(N, N, sayaH, 0.6)), normalScale: 0.3, clearcoat: { factor: 1, roughness: 0.05 }, extras: { uvScale: 4 }, uvScale: 4 };

  const seppa: GMaterial = { name: 'seppa', color: [...mat.seppa.color, 1] as [number, number, number, number], metallic: 1, roughness: mat.seppa.roughness };
  const horn: GMaterial = { name: 'horn', color: [...mat.horn.color, 1] as [number, number, number, number], metallic: 0, roughness: mat.horn.roughness, clearcoat: { factor: 0.8, roughness: 0.1 } };
  const byName: Record<string, GMaterial> = { blade, ito, same, fittings, tsuba, seppa, saya, sageo, horn };
  return { materials: ARMS_MATERIALS.map((n) => byName[n]), images };
}
