// Real grass: instanced 3D tufts of painted blades around the camera, so the verges and fields are grass you can see into, not a green texture on a plane.
// Tufts sit on a jittered grid so they never flicker as the camera moves, take their colour from the satellite albedo under them (so a dry field is straw and a
// lawn is green), grow only where the satellite says green and the road checks say clear, shrink out toward the edge of the radius, and sway in the wind.
import * as THREE from 'three';

const R_NEAR = 64;       // grass radius (m)
const CELL = 1.35;       // one tuft per cell

function bladeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  let s = 4242; const r = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 64; i++) {
    const bx = 8 + r() * 240, h = 120 + r() * 130, bend = (r() - 0.5) * 70, w = 3.5 + r() * 4.5;
    const grad = g.createLinearGradient(0, 256, 0, 256 - h);
    grad.addColorStop(0, '#4a5a30'); grad.addColorStop(0.45, `rgb(${150 + r() * 40},${180 + r() * 40},${96 + r() * 30})`); grad.addColorStop(1, `rgb(${215 + r() * 30},${235 + r() * 20},${150 + r() * 30})`);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(bx - w, 256);
    g.quadraticCurveTo(bx - w * 0.5 + bend * 0.25, 256 - h * 0.55, bx + bend, 256 - h);
    g.quadraticCurveTo(bx + w * 0.5 + bend * 0.25, 256 - h * 0.55, bx + w, 256);
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
  return t;
}

/** three crossed quads, normals straight up so the lighting is soft */
function tuftGeo(): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3, c = Math.cos(a), sn = Math.sin(a), b = pos.length / 3;
    for (const [x, y, u, v] of [[-0.5, 0, 0, 0], [0.5, 0, 1, 0], [0.5, 1, 1, 1], [-0.5, 1, 0, 1]]) { pos.push(x * c, y, x * sn); uv.push(u, v); nor.push(0, 1, 0); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

export interface GrassOpts {
  rw: number; rh: number;                                     // region size in metres (centred on the origin)
  albedoUrl: string;
  ground: (x: number, z: number) => number;                   // world height of the terrain mesh
  ok: (x: number, z: number) => boolean;                      // may grass grow here (not road, not water, not near the course)
}

export class GrassField {
  readonly group = new THREE.Group();
  private im: THREE.InstancedMesh;
  private albedo: { d: Uint8ClampedArray; w: number; h: number } | null = null;
  private uTime = { value: 0 };
  private uWind = { value: 0.3 };
  private cap = 14000;
  private last = new THREE.Vector2(1e9, 1e9);
  private accT = 0;
  private mat: THREE.MeshStandardMaterial;
  count = 0;

  constructor(private o: GrassOpts) {
    this.mat = new THREE.MeshStandardMaterial({ map: bladeTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime; sh.uniforms.uWind = this.uWind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float gh = position.y;
        vec3 ib = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
        float gw = uWind * gh * gh * 0.28;
        transformed.x += sin(uTime * 2.1 + ib.x * 0.9 + ib.z * 0.6) * gw + sin(uTime * 5.3 + ib.x * 2.3) * gw * 0.25;
        transformed.z += cos(uTime * 1.7 + ib.z * 0.8 + ib.x * 0.4) * gw * 0.6;
        #endif`);
    };
    this.mat.customProgramCacheKey = () => 'grassfield';
    this.im = new THREE.InstancedMesh(tuftGeo(), this.mat, this.cap);
    this.im.count = 0; this.im.frustumCulled = false; this.im.receiveShadow = false; this.im.castShadow = false;
    this.group.add(this.im);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0);
      this.albedo = { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
      this.last.set(1e9, 1e9);
    };
    img.src = o.albedoUrl;
  }

  setWind(w: number): void { this.uWind.value = w; }
  setWet(w: number): void { this.mat.color.setScalar(1 - 0.32 * w); }

  private sample(x: number, z: number): [number, number, number] | null {
    const a = this.albedo!;
    const u = (x + this.o.rw / 2) / this.o.rw, v = (z + this.o.rh / 2) / this.o.rh;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
    const i = (Math.floor(v * a.h) * a.w + Math.floor(u * a.w)) * 4;
    return [a.d[i] / 255, a.d[i + 1] / 255, a.d[i + 2] / 255];
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.uTime.value += dt;
    this.accT += dt;
    if (!this.albedo || this.accT < 0.2 || Math.hypot(cam.x - this.last.x, cam.z - this.last.y) < 5) return;
    this.accT = 0; this.last.set(cam.x, cam.z);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const i0 = Math.floor((cam.x - R_NEAR) / CELL), i1 = Math.floor((cam.x + R_NEAR) / CELL), j0 = Math.floor((cam.z - R_NEAR) / CELL), j1 = Math.floor((cam.z + R_NEAR) / CELL);
    let n = 0;
    const hash = (a: number, b: number, s: number): number => { const t = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453; return t - Math.floor(t); };
    for (let i = i0; i <= i1 && n < this.cap; i++) for (let j = j0; j <= j1 && n < this.cap; j++) {
      const x = (i + hash(i, j, 1)) * CELL, z = (j + hash(i, j, 2)) * CELL;
      const d = Math.hypot(x - cam.x, z - cam.z);
      if (d > R_NEAR) continue;
      const fade = 1 - Math.min(1, Math.max(0, (d - R_NEAR * 0.55) / (R_NEAR * 0.45)));
      if (fade <= 0.02 || hash(i, j, 3) > 0.35 + 0.65 * fade) continue;           // thin out toward the edge
      const c = this.sample(x, z); if (!c) continue;
      const green = c[1] - Math.max(c[0], c[2]);
      const lum = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
      // grass where the satellite is green or straw-yellow and not dark (water, asphalt, roofs) or pale (sand, concrete)
      if (!(green > 0.015 || (c[0] > c[2] * 1.18 && c[1] > c[2] * 1.1 && lum > 0.2 && lum < 0.6)) || lum < 0.12 || lum > 0.72) continue;
      if (!this.o.ok(x, z)) continue;
      const h = Math.min(0.62, 0.2 + hash(i, j, 4) * 0.3 + Math.max(0, green) * 0.6) * fade;
      const w = h * (1.15 + hash(i, j, 5) * 0.8) + 0.2;
      q.setFromAxisAngle(up, hash(i, j, 6) * 6.283);
      pos.set(x, this.o.ground(x, z) - 0.03, z); sc.set(w, h, w);
      m4.compose(pos, q, sc);
      this.im.setMatrixAt(n, m4);
      // tint from the ground under it, lifted toward a blade green so the satellite's shadows do not turn it black
      col.setRGB(Math.min(1, c[0] * 1.1 + 0.05), Math.min(1, c[1] * 1.15 + 0.07), Math.min(1, c[2] * 1.0 + 0.03)).multiplyScalar(0.62 + hash(i, j, 7) * 0.4);
      this.im.setColorAt(n, col);
      n++;
    }
    this.im.count = n; this.count = n;
    this.im.instanceMatrix.needsUpdate = true;
    if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true;
  }
}
