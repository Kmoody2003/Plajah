// The orbs' halo summons an angel: a tall figure of white-gold light in a flowing robe, great
// swept wings, a halo, and a long sword of lightning. Built from simple shapes and drawn almost
// entirely in emissive light (with bloom it reads as radiance, not geometry); it is on screen for a
// few seconds at a time, moving faster than the eye can follow.
import * as THREE from 'three/webgpu';
import { color, float, mix, positionLocal, smoothstep, time, uv, sin } from 'three/tsl';

export function buildAngel() {
  const g = new THREE.Group();
  g.userData.dynamic = true;
  const radiant = (c: number, k: number) => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    m.colorNode = color(c).mul(k);
    return m;
  };
  // Robe: a lathe that flares to the hem, brighter at the top, shimmering toward the hem.
  const prof = [[0, 0], [0.42, 0.02], [0.36, 0.5], [0.24, 1.05], [0.2, 1.4], [0.16, 1.55], [0.0, 1.6]].map(([x, y]) => new THREE.Vector2(x, y));
  const robeMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const ripple = sin(positionLocal.y.mul(9).sub(time.mul(6))).mul(0.15).add(0.85);
  robeMat.colorNode = mix(color(0xffe6b0), color(0xffffff), smoothstep(float(0.2), float(1.5), positionLocal.y)).mul(ripple).mul(2.2);
  const robe = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), robeMat);
  g.add(robe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), radiant(0xfff4dc, 3));
  head.position.y = 1.78;
  g.add(head);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 40), radiant(0xffd76a, 6));
  halo.rotation.x = Math.PI / 2; halo.position.y = 2.0;
  g.add(halo);
  // Wings: each a fan of long primary feathers and shorter coverts, every feather a soft-edged
  // blade of light (bright quill, barbs fading to the edges and the tip), so the wing reads as
  // feathers made of radiance rather than a cut-out.
  const featherMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const across = uv().x.sub(0.5).abs().mul(2);
  const quill = smoothstep(float(0.12), float(0.0), across);
  const barbs = sin(uv().y.mul(70).add(across.mul(18))).mul(0.25).add(0.75);
  const body = smoothstep(float(1.0), float(0.35), across).mul(smoothstep(float(1.0), float(0.6), uv().y)).mul(smoothstep(float(0.0), float(0.08), uv().y));
  featherMat.colorNode = mix(color(0xffd79a), color(0xffffff), quill).mul(body.mul(barbs).add(quill.mul(0.6))).mul(1.5);
  const featherGeo = new THREE.PlaneGeometry(1, 1);
  featherGeo.translate(0, 0.5, 0);                // base at the origin, growing up the local +Y
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(0.1 * side, 1.5, -0.14);
    const fan = (n: number, a0: number, a1: number, len: (k: number) => number, width: number, along: number) => {
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const f = new THREE.Mesh(featherGeo, featherMat);
        f.scale.set(width, len(k), 1);
        // Roots spread along the wing's arm, fanning from up-and-out to down-and-out.
        f.position.set(side * (0.15 + along * k), 0.35 * (1 - k), 0);
        f.rotation.z = -side * (a0 + (a1 - a0) * k);
        w.add(f);
      }
    };
    fan(11, 0.25, 2.0, (k) => 1.0 + 1.1 * Math.sin(Math.PI * (0.25 + 0.6 * k)), 0.36, 0.9);   // primaries
    fan(8, 0.6, 1.9, (k) => 0.55 + 0.35 * Math.sin(Math.PI * k), 0.4, 0.6);                  // coverts
    g.add(w);
    wings.push(w);
  }
  // The sword: a long blade of white lightning.
  const swordMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  swordMat.colorNode = mix(color(0x9fd2ff), color(0xffffff), smoothstep(float(0.35), float(0.5), uv().x).mul(smoothstep(float(0.65), float(0.5), uv().x))).mul(sin(time.mul(60)).mul(0.2).add(1)).mul(5);
  const sword = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 1.7), swordMat);
  sword.position.set(0.42, 1.3, 0.35);
  sword.rotation.x = -0.9;
  g.add(sword);
  return {
    group: g,
    /** Beat the wings and swing the sword (`strike` 0 → 1 raises then cuts). */
    pose(t: number, strike = 0) {
      const beat = Math.sin(t * 5) * 0.35;
      wings[0].rotation.y = -(0.35 + beat); wings[1].rotation.y = 0.35 + beat;
      sword.rotation.x = -0.9 - 1.6 * Math.sin(Math.PI * Math.min(1, strike)) + 2.2 * Math.max(0, strike - 0.5);
      halo.rotation.z = t * 2;
    },
  };
}
