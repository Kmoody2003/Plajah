// PBR sets split from the art folder's material sheets + canvas-painted foliage/rune textures.
import * as THREE from 'three/webgpu';
import { rng } from './geom';

import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const loader = new THREE.TextureLoader();
const BASE = '/games/rift-realm/assets/pbr/';
const cache = new Map<string, THREE.Texture>();

// GPU-compressed textures (KTX2 / Basis Universal, scripts/riftrealm/ktxPack.py): stay block-compressed in video memory
// (BC7/BC1 on desktop, ASTC/ETC on phones) — about 4-6x less than decoded jpgs. The jpgs remain as the fallback.
let ktx2: KTX2Loader | null = null;
export function initKTX2(renderer: THREE.WebGPURenderer): KTX2Loader {
  ktx2 = new KTX2Loader().setTranscoderPath('/games/rift-realm/basis/');
  ktx2.detectSupport(renderer as unknown as Parameters<KTX2Loader['detectSupport']>[0]);
  return ktx2;
}
export const getKTX2 = () => ktx2;

/** Load the KTX2 versions of these material sets into the cache before a level is built. */
export async function preloadSets(sets: string[]) {
  if (!ktx2) return;
  let manifest: Record<string, string[]> = {};
  try { manifest = await (await fetch(`${BASE}manifest.json`)).json(); } catch { return; }
  const jobs: Promise<void>[] = [];
  for (const set of sets) for (const map of manifest[set] ?? []) {
    const srgb = map === 'albedo' || map === 'emissive';
    jobs.push(ktx2.loadAsync(`${BASE}${set}/${map}.ktx2`).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      cache.set(`${BASE}${set}/${map}.jpg${srgb}`, t);
    }).catch(() => { /* the jpg fallback loads on demand */ }));
  }
  await Promise.all(jobs);
}

function tex(path: string, srgb: boolean): THREE.Texture {
  const key = path + srgb;
  let t = cache.get(key);
  if (!t) {
    t = loader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    cache.set(key, t);
  }
  return t;
}

export interface PBROpts {
  maps: Array<'normal' | 'roughness' | 'ao' | 'emissive' | 'metallic'>;
  tint?: number;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

/** A standard node material from one split material set (public/games/rift-realm/assets/pbr/<name>/). */
export function pbr(name: string, o: PBROpts): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  m.map = tex(`${BASE}${name}/albedo.jpg`, true);
  if (o.tint !== undefined) m.color.setHex(o.tint);
  if (o.maps.includes('normal')) { m.normalMap = tex(`${BASE}${name}/normal.jpg`, false); const s = o.normalScale ?? 1; m.normalScale.set(s, s); }
  if (o.maps.includes('roughness')) m.roughnessMap = tex(`${BASE}${name}/roughness.jpg`, false);
  if (o.maps.includes('ao')) { m.aoMap = tex(`${BASE}${name}/ao.jpg`, false); m.aoMapIntensity = 0.9; }
  if (o.maps.includes('metallic')) m.metalnessMap = tex(`${BASE}${name}/metallic.jpg`, false);
  if (o.maps.includes('emissive')) {
    m.emissiveMap = tex(`${BASE}${name}/emissive.jpg`, true);
    m.emissive.setHex(o.emissive ?? 0x22e6ff);
    m.emissiveIntensity = o.emissiveIntensity ?? 2.2;
  }
  m.roughness = o.roughness ?? 1;
  m.metalness = o.metalness ?? 0;
  return m;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}
function toTex(c: HTMLCanvasElement, srgb = true): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Cluster of broad leaves with veins, alpha-cut, for canopy cards. */
export function leafTexture(): THREE.Texture {
  const [c, g] = canvas(512, 512);
  const r = rng(11);
  for (let i = 0; i < 70; i++) {
    const x = 40 + r() * 432, y = 40 + r() * 432, a = r() * Math.PI * 2, L = 46 + r() * 54, W = L * (0.34 + r() * 0.12);
    const d = r();
    g.save(); g.translate(x, y); g.rotate(a);
    const grad = g.createLinearGradient(0, -L, 0, L);
    grad.addColorStop(0, `hsl(${150 + d * 25} 45% ${14 + d * 12}%)`);
    grad.addColorStop(1, `hsl(${130 + d * 20} 40% ${9 + d * 8}%)`);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, -L); g.quadraticCurveTo(W, -L * 0.2, 0, L); g.quadraticCurveTo(-W, -L * 0.2, 0, -L); g.fill();
    g.strokeStyle = 'rgba(120,255,210,.22)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, -L * 0.9); g.lineTo(0, L * 0.9); g.stroke();
    g.restore();
  }
  return toTex(c);
}

/** One fern frond with pinnate leaflets on a transparent ground. */
export function fernTexture(): THREE.Texture {
  const [c, g] = canvas(256, 512);
  const stem = (t: number) => ({ x: 128 + Math.sin(t * 2.4) * 34 * t, y: 505 - t * 480 });
  g.lineCap = 'round';
  const r = rng(21);
  for (let i = 0; i < 64; i++) {
    const t = 0.03 + (i / 64) * 0.94, p = stem(t), p2 = stem(Math.min(1, t + 0.02));
    const ang = Math.atan2(p2.y - p.y, p2.x - p.x);
    const L = (1 - t * 0.9) * 112 + 6;
    for (const s of [-1, 1]) {
      const a = ang + s * (1.15 - t * 0.55) + (r() - 0.5) * 0.12;
      const ex = p.x + Math.cos(a) * L, ey = p.y + Math.sin(a) * L + L * 0.18; // leaflets droop
      g.strokeStyle = `hsl(${128 + t * 24} ${50 + r() * 10}% ${22 + t * 22 + r() * 8}%)`;
      g.lineWidth = 2.6 * (1 - t * 0.6) + 0.9;
      g.beginPath(); g.moveTo(p.x, p.y); g.quadraticCurveTo((p.x + ex) / 2, (p.y + ey) / 2 - L * 0.22, ex, ey); g.stroke();
    }
  }
  g.strokeStyle = '#2c6a46'; g.lineWidth = 3.2;
  g.beginPath(); for (let t = 0; t <= 1; t += 0.05) { const p = stem(t); t === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y); } g.stroke();
  return toTex(c);
}

/** Soft mossy ground-cover patch (alpha blotches) for decals. */
export function mossTexture(): THREE.Texture {
  const [c, g] = canvas(512, 512);
  const r = rng(5);
  for (let i = 0; i < 520; i++) {
    const x = 256 + (r() - 0.5) * 420 * (0.5 + r() * 0.6), y = 256 + (r() - 0.5) * 420 * (0.5 + r() * 0.6);
    const R = 8 + r() * 26;
    const d = Math.hypot(x - 256, y - 256) / 256;
    const grad = g.createRadialGradient(x, y, 0, x, y, R);
    const a = Math.max(0, 0.55 - d * 0.5);
    grad.addColorStop(0, `hsla(${95 + r() * 30} 48% ${16 + r() * 14}% / ${a})`);
    grad.addColorStop(1, 'hsla(110 40% 20% / 0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, R, 0, 6.3); g.fill();
  }
  return toTex(c);
}

/** Grass tuft blade fan. */
export function grassTexture(): THREE.Texture {
  const [c, g] = canvas(128, 256);
  const r = rng(3);
  for (let i = 0; i < 26; i++) {
    const bx = 64 + (r() - 0.5) * 44, tip = (r() - 0.5) * 80, h = 90 + r() * 150;
    g.fillStyle = `hsl(${100 + r() * 40} 45% ${14 + r() * 16}%)`;
    g.beginPath(); g.moveTo(bx - 3.2, 256); g.quadraticCurveTo(bx + tip * 0.2, 256 - h * 0.55, bx + tip, 256 - h); g.quadraticCurveTo(bx + tip * 0.25, 256 - h * 0.5, bx + 3.2, 256); g.fill();
  }
  return toTex(c);
}

/** Manhattan circuit traces in cyan on black â€” emissive map for rune pillars and cables. */
export function circuitTexture(seed = 1): THREE.Texture {
  const [c, g] = canvas(256, 1024);
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 1024);
  const r = rng(seed);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let k = 0; k < 11; k++) {
    let x = 20 + Math.floor(r() * 7) * 36, y = Math.floor(r() * 1000);
    g.beginPath(); g.moveTo(x, y);
    const steps = 3 + Math.floor(r() * 4);
    for (let s = 0; s < steps; s++) {
      if (s % 2 === 0) y += (r() - 0.35) * 220; else x = Math.min(236, Math.max(20, x + (r() - 0.5) * 140));
      g.lineTo(x, Math.max(10, Math.min(1014, y)));
    }
    g.stroke();
    g.beginPath(); g.arc(x, Math.max(10, Math.min(1014, y)), 8, 0, 6.3); g.fill();
  }
  return toTex(c);
}

/** Radial soft glow sprite. */
export function glowTexture(): THREE.Texture {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return toTex(c);
}
