// What lies in the forest besides the trees and the undergrowth (docs/era-clash-3d-forest-road.md, phase 2):
// fallen trunks furred with moss on their tops, boulders mossed the same way, low mist lying over the river and in
// the hollows, and shafts of light standing in the glades.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture, uv, positionWorld, normalWorld, smoothstep, mix, vec3, vec2, float, time, sin, color, normalMap, cameraPosition, length } from 'three/tsl';
import { collide } from './core/collision';
import { pbr } from './core/materials';
import { barkMaps } from './core/forest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

function hash(x: number, z: number) { let h = (x * 374761393 + z * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

export interface FloorPlacer {
  heightAt(x: number, z: number): number;
  /** Somewhere a log or rock may lie: off the road, out of the river, not under a building. */
  free(x: number, z: number, r: number): boolean;
  riverEdge(x: number, z: number): number;
  /** 0…1: how much of a glade (an opening in the wood) this is. */
  glade(x: number, z: number): number;
}

/** Moss on whatever faces up: a soft green over the surface, thickest on the tops. */
function mossOver(base: N, amount = 1): N {
  const up: N = smoothstep(0.25, 0.85, normalWorld.y).mul(amount);
  const fg = pbr('forrest_ground_01');
  const grain: N = texture(fg.diff, positionWorld.xz.mul(0.6)).rgb.dot(vec3(0.33, 0.33, 0.33));
  const moss: N = mix(vec3(0.16, 0.24, 0.07), vec3(0.3, 0.38, 0.12), grain);
  return mix(base, moss, up.mul(grain.mul(0.5).add(0.6)).clamp(0, 1));
}

export function buildForestFloor(o: { area: { x0: number; x1: number; z0: number; z1: number }; place: FloorPlacer; sunDir: THREE.Vector3 }) {
  const { area: A, place: P } = o;
  const group = new THREE.Group(); group.name = 'forestFloor';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();

  // ── fallen logs ──
  {
    const B = barkMaps('oak');
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    const bark: N = texture(B.color, uv().mul(vec2(2, 1.2))).rgb.mul(color(0x8a8070));
    mat.colorNode = mossOver(bark.mul(0.85), 1.1);
    mat.normalNode = normalMap(texture(B.normal, uv().mul(vec2(2, 1.2))));
    const big: THREE.BufferGeometry[] = [], small: THREE.BufferGeometry[] = [];
    let n = 0;
    for (let i = 0; i < 4000 && n < 150; i++) {
      const x = A.x0 + hash(i, 11) * (A.x1 - A.x0), z = A.z0 + hash(17, i) * (A.z1 - A.z0);
      const r = 0.2 + hash(i, 5) * 0.22 + (hash(i, 9) < 0.15 ? 0.18 : 0), len = 3 + hash(i, 7) * 5;
      if (!P.free(x, z, len / 2 + 0.6)) continue;
      const yaw = hash(i, 3) * Math.PI;
      const dx = Math.sin(yaw) * len / 2, dz = Math.cos(yaw) * len / 2;
      const ya = P.heightAt(x - dx, z - dz), yb = P.heightAt(x + dx, z + dz);
      if (Math.abs(ya - yb) > len * 0.35) continue;
      const pitch = Math.atan2(yb - ya, len);
      // a trunk: tapering, a little bent (two segments), lying along its axis (z), sunk a third into the litter
      const g = new THREE.CylinderGeometry(r * 0.8, r, len, 10, 4, false).rotateX(Math.PI / 2);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) { const t = pos.getZ(k) / len; pos.setY(k, pos.getY(k) + Math.sin((t + 0.5) * Math.PI) * r * 0.25 * (hash(i, 1) - 0.5)); }
      e.set(-pitch, yaw, hash(i, 2) * 0.4, 'YXZ'); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, (ya + yb) / 2 + r * 0.55, z), q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m4);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      (r > 0.32 ? big : small).push(g.index ? g.toNonIndexed() : g);
      n++;
    }
    for (const [list, solid] of [[big, true], [small, false]] as const) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list, false)!, mat); mesh.castShadow = mesh.receiveShadow = true;
      group.add(solid ? collide(mesh) : mesh);   // the big ones are in the way; small ones step over
    }
  }

  // ── boulders: lumpy, half-buried, mossed on top ──
  {
    const RK = pbr('aerial_rocks_02');
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const tri: N = mix(texture(RK.diff, positionWorld.zy.mul(0.35)).rgb, texture(RK.diff, positionWorld.xy.mul(0.35)).rgb, smoothstep(0.3, 0.7, normalWorld.z.abs()));
    const top: N = texture(RK.diff, positionWorld.xz.mul(0.35)).rgb;
    mat.colorNode = mossOver(mix(tri, top, smoothstep(0.5, 0.9, normalWorld.y)).mul(0.8), 1.2);
    const big: THREE.BufferGeometry[] = [], small: THREE.BufferGeometry[] = [];
    let n = 0;
    for (let i = 0; i < 5000 && n < 230; i++) {
      const x = A.x0 + hash(i, 41) * (A.x1 - A.x0), z = A.z0 + hash(43, i) * (A.z1 - A.z0);
      const s = 0.35 + Math.pow(hash(i, 47), 2.2) * 1.8;
      // boulders gather by the river and in clusters
      const near = P.riverEdge(x, z);
      if (hash(i, 53) > (near > 0 && near < 5 ? 0.9 : 0.35)) continue;
      if (!P.free(x, z, s + 0.4)) continue;
      const g = new THREE.IcosahedronGeometry(1, 2);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, k);
        const nn = 0.78 + 0.3 * hash(Math.round(v.x * 3 + i), Math.round(v.y * 3 + v.z * 7)) + 0.1 * Math.sin(v.x * 3 + i) * Math.cos(v.z * 2.5);
        v.multiplyScalar(nn); v.y *= 0.62;
        pos.setXYZ(k, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      e.set(hash(i, 59) * 0.3, hash(i, 61) * 6.28, hash(i, 67) * 0.3); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, P.heightAt(x, z) + s * 0.12, z), q, new THREE.Vector3(s * (0.8 + hash(i, 71) * 0.5), s, s));
      g.applyMatrix4(m4);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      (s > 0.75 ? big : small).push(g.index ? g.toNonIndexed() : g);
      n++;
    }
    for (const [list, solid] of [[big, true], [small, false]] as const) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list, false)!, mat); mesh.castShadow = mesh.receiveShadow = true;
      group.add(solid ? collide(mesh) : mesh);
    }
  }

  // ── mist: soft sheets lying low over the river and in the hollows, drifting ──
  {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g2 = c.getContext('2d')!;
    for (let i = 0; i < 40; i++) {
      const x = 20 + Math.random() * 88, y = 20 + Math.random() * 88, r = 14 + Math.random() * 30;
      const gr = g2.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const drift: N = vec2(time.mul(0.012), time.mul(0.007));
    const cloud: N = texture(tex, uv().add(drift)).a.mul(texture(tex, uv().mul(1.7).sub(drift.mul(1.3))).a.mul(1.6).add(0.4));
    const edge: N = smoothstep(0.5, 0.15, length(uv().sub(0.5)));
    // thin out close to the eye (a sheet seen from inside is a flat wash)
    const near: N = smoothstep(2.5, 9, length(cameraPosition.sub(positionWorld)));
    mat.colorNode = vec3(0.86, 0.84, 0.86);
    mat.opacityNode = cloud.mul(edge).mul(near).mul(0.28).clamp(0, 0.18);
    const sheets: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 900 && sheets.length < 90; i++) {
      const x = A.x0 + hash(i, 101) * (A.x1 - A.x0), z = A.z0 + hash(103, i) * (A.z1 - A.z0);
      const rv = P.riverEdge(x, z), h = P.heightAt(x, z);
      const around = (P.heightAt(x + 9, z) + P.heightAt(x - 9, z) + P.heightAt(x, z + 9) + P.heightAt(x, z - 9)) / 4;
      const hollow = around - h > 0.35, overWater = rv < 1 && rv > -6;
      if (!hollow && !overWater && hash(i, 107) > 0.08) continue;
      const w = 14 + hash(i, 109) * 14;
      for (const lift of [0.5, 1.3]) {
        const sg = new THREE.PlaneGeometry(w, w * 0.75).rotateX(-Math.PI / 2).rotateY(hash(i, 113) * 3);
        sg.translate(x, (overWater ? Math.min(h, 0.6) + 0.6 : h) + lift, z);
        sheets.push(sg);
      }
    }
    if (sheets.length) { const mist = new THREE.Mesh(mergeGeometries(sheets, false)!, mat); mist.renderOrder = 2; mist.frustumCulled = true; group.add(mist); }
  }

  // ── shafts of light standing in the glades ──
  {
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const v: N = uv().y, u: N = uv().x;
    const across: N = sin(u.mul(Math.PI)).pow(2.2);
    const shimmer: N = sin(time.mul(0.6).add(positionWorld.x.mul(0.3))).mul(0.25).add(0.75);
    const near: N = smoothstep(3, 12, length(cameraPosition.sub(positionWorld)));
    mat.colorNode = vec3(1.0, 0.82, 0.55).mul(across.mul(v.pow(0.7)).mul(shimmer).mul(near).mul(0.16));
    const shafts: THREE.BufferGeometry[] = [];
    const sun = o.sunDir.clone().normalize();
    const tilt = Math.min(0.85, Math.atan2(Math.hypot(sun.x, sun.z), -sun.y)),   // (a low sun's shafts are drawn steeper: they read better)
      yaw = Math.atan2(sun.x, sun.z);
    for (let i = 0; i < 1500 && shafts.length < 60; i++) {
      const x = A.x0 + hash(i, 201) * (A.x1 - A.x0), z = A.z0 + hash(203, i) * (A.z1 - A.z0);
      if (P.glade(x, z) < 0.55 || hash(i, 207) > 0.5) continue;
      const len = 14 + hash(i, 209) * 8, w = 1.6 + hash(i, 211) * 2.2;
      for (const turn of [0, Math.PI / 2]) {
        const g = new THREE.PlaneGeometry(w, len).translate(0, len / 2, 0);
        g.rotateY(turn); g.rotateX(tilt); g.rotateY(yaw + Math.PI);
        g.translate(x, P.heightAt(x, z) - 0.2, z);
        shafts.push(g);
      }
    }
    if (shafts.length) { const m = new THREE.Mesh(mergeGeometries(shafts, false)!, mat); m.renderOrder = 3; group.add(m); }
  }
  void float;
  return group;
}
