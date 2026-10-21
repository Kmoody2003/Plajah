// Suit of gothic plate armour on a plinth, holding a halberd (Grand Hall sentinels).
// Procedural stand-in until a sheet-accurate generated asset is approved.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ni = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);

export function knight(plinthMat: THREE.Material, height = 2.2): THREE.Group {
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0x2a2c30, roughness: 0.32, metalness: 1 });
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x0c0d0f, roughness: 0.6, metalness: 0.8 });
  const wood = new THREE.MeshStandardNodeMaterial({ color: 0x2b1d14, roughness: 0.7 });
  const parts: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    geo.scale(sx, sy, sz);
    geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz);
    geo.translate(x, y, z);
    parts.push(ni(geo));
  };
  // Legs: sabatons, greaves, poleyns, cuisses.
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.16, 0.08, 0.3), s * 0.13, 0.04, 0.04);
    add(new THREE.CylinderGeometry(0.075, 0.065, 0.42, 12), s * 0.13, 0.29, 0);
    add(new THREE.SphereGeometry(0.085, 12, 8), s * 0.13, 0.52, 0.02, 0, 0, 0, 1, 0.9, 1.1);
    add(new THREE.CylinderGeometry(0.095, 0.08, 0.38, 12), s * 0.13, 0.74, 0);
  }
  // Faulds (skirt lames), breastplate with central ridge, backplate.
  for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.2 + i * 0.008, 0.215 + i * 0.008, 0.07, 18, 1, true), 0, 0.95 + i * 0.06, 0, 0, 0, 0, 1, 1, 0.75);
  add(new THREE.SphereGeometry(0.24, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, 1.22, 0, Math.PI, 0, 0, 1, 1.35, 0.8);
  add(new THREE.BoxGeometry(0.02, 0.32, 0.04), 0, 1.36, 0.19);
  // Gorget, pauldrons, rerebraces, couters, vambraces, gauntlets.
  add(new THREE.CylinderGeometry(0.1, 0.13, 0.1, 14), 0, 1.6, 0);
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), s * 0.27, 1.53, 0, 0, 0, -s * 0.35, 1, 0.8, 1.1);
    add(new THREE.CylinderGeometry(0.06, 0.055, 0.28, 10), s * 0.32, 1.33, 0.0, 0, 0, s * 0.12);
    add(new THREE.SphereGeometry(0.065, 10, 8), s * 0.34, 1.17, 0.03);
    add(new THREE.CylinderGeometry(0.055, 0.045, 0.26, 10), s * 0.33, 1.02, 0.08, -0.5, 0, 0);
    add(new THREE.BoxGeometry(0.09, 0.12, 0.11), s * 0.32, 0.88, 0.17);
  }
  // Great helm with visor ridge and crest.
  add(new THREE.CylinderGeometry(0.12, 0.13, 0.26, 16), 0, 1.78, 0);
  add(new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.9, 0);
  add(new THREE.BoxGeometry(0.02, 0.1, 0.22), 0, 2.0, 0);
  const body = new THREE.Mesh(mergeGeometries(parts)!, steel);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.04), dark);
  visor.position.set(0, 1.8, 0.115);
  // Halberd in the right hand: shaft, axe blade, spike.
  const halberd = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.6, 8), wood);
  shaft.position.y = 1.3;
  const blade = new THREE.Shape();
  blade.moveTo(0, -0.18); blade.quadraticCurveTo(0.32, -0.2, 0.34, 0.02); blade.quadraticCurveTo(0.3, 0.2, 0, 0.18); blade.closePath();
  const bm = new THREE.Mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.012, bevelEnabled: false }), steel);
  bm.position.set(0.02, 2.35, -0.006);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.35, 6), steel);
  spike.position.y = 2.77;
  halberd.add(shaft, bm, spike);
  halberd.position.set(0.36, 0, 0.18);

  const suit = new THREE.Group();
  suit.add(body, visor, halberd);
  suit.scale.setScalar(height / 2.05);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.9), plinthMat);
  plinth.position.y = 0.225;
  suit.position.y = 0.45;
  const g = new THREE.Group();
  g.add(plinth, suit);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
