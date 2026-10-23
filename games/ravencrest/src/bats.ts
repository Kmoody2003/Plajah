// Dracula's bat swarm: real bats (one instanced draw, wings flapping in the vertex shader) that
// pour out of him, wheel around Jack, and peel off in diving bites. Every bat can be cut down —
// slashes through the swarm are part of the fun. Contact without a roll's i-frames stings.
import * as THREE from 'three/webgpu';
import { Fn, positionLocal, sin, time, float, vec3, attribute } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

interface Bat { pos: THREE.Vector3; vel: THREE.Vector3; alive: boolean; dive: number; ang: number; r: number; h: number; phase: number }

const MAX = 32;

export class BatSwarm {
  readonly mesh: THREE.InstancedMesh;
  private bats: Bat[] = [];
  private m4 = new THREE.Matrix4();
  active = false;
  private t = 0;

  constructor() {
    // A bat: body + two wing triangles, flapped by their |x| distance from the body.
    const g = new THREE.BufferGeometry();
    const v = [
      0, 0, 0.12, -0.03, 0.02, -0.1, 0.03, 0.02, -0.1,                  // body
      0, 0.01, 0.06, -0.32, 0.04, 0.02, -0.06, 0.01, -0.09,               // left wing
      -0.32, 0.04, 0.02, -0.2, 0.0, -0.14, -0.06, 0.01, -0.09,
      0, 0.01, 0.06, 0.32, 0.04, 0.02, 0.06, 0.01, -0.09,                 // right wing
      0.32, 0.04, 0.02, 0.2, 0.0, -0.14, 0.06, 0.01, -0.09,
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const phase = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) phase[i] = Math.random() * 6.28;
    g.setAttribute('bphase', new THREE.InstancedBufferAttribute(phase, 1));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardNodeMaterial({ color: 0x0b0809, roughness: 0.7, side: THREE.DoubleSide });
    m.positionNode = Fn(() => {
      const p: N = (positionLocal as N).toVar();
      const span: N = p.x.abs();
      const flap: N = sin((time as N).mul(28).add(attribute('bphase', 'float') as N)).mul(span).mul(1.2);
      return vec3(p.x.mul(float(1).sub(span.mul(0.4).mul(flap.abs()))), p.y.add(flap), p.z);
    })();
    m.emissive = new THREE.Color(0x220000);
    this.mesh = new THREE.InstancedMesh(g, m, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.userData.dynamic = true;
  }

  /** Pour `n` bats out of `from`. */
  release(from: THREE.Vector3, n = 22) {
    this.bats = [];
    for (let i = 0; i < Math.min(n, MAX); i++) {
      this.bats.push({ pos: from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6)), vel: new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6), alive: true, dive: -1, ang: Math.random() * 6.28, r: 2.2 + Math.random() * 1.6, h: 1.1 + Math.random() * 1.4, phase: Math.random() * 6 });
    }
    this.active = true;
    this.t = 0;
  }
  get alive() { return this.bats.filter((b) => b.alive).length; }
  /** Every bat bursts (their master is dead). Returns where they were. */
  scatter(): THREE.Vector3[] { const at = this.bats.filter((b) => b.alive).map((b) => b.pos.clone()); this.bats = []; this.active = false; this.mesh.count = 0; return at; }

  /** Kill the bats inside a cut: `from`, facing `dir`, within `reach` and half-angle `arc`. Returns kills. */
  cut(from: THREE.Vector3, dir: THREE.Vector3, reach: number, arc: number, onKill: (p: THREE.Vector3) => void) {
    let k = 0;
    for (const b of this.bats) {
      if (!b.alive) continue;
      const to = b.pos.clone().sub(from);
      if (to.y < -0.5 || to.y > 2.8) continue;
      to.setY(0);
      if (to.length() > reach || (to.length() > 0.4 && to.normalize().angleTo(dir) > arc)) continue;
      b.alive = false; k++; onKill(b.pos.clone());
    }
    return k;
  }

  /** Per frame. `bite` is called when a diving bat reaches Jack. */
  update(dt: number, target: THREE.Vector3, bite: (p: THREE.Vector3) => void) {
    if (!this.active) { this.mesh.count = 0; return; }
    this.t += dt;
    let n = 0;
    for (const b of this.bats) {
      if (!b.alive) continue;
      b.phase += dt;
      // Wheel around Jack; every so often one dives at him.
      if (b.dive < 0 && Math.random() < dt * 0.35) b.dive = 0;
      let want: THREE.Vector3;
      if (b.dive >= 0) {
        b.dive += dt;
        want = target.clone().setY(target.y + 1.4);
        if (b.pos.distanceTo(want) < 0.45) { bite(b.pos.clone()); b.dive = -1; b.vel.multiplyScalar(-0.6).setY(4); }
        if (b.dive > 1.6) b.dive = -1;
      } else {
        b.ang += dt * (1.6 + (b.r - 2) * 0.3);
        want = target.clone().add(new THREE.Vector3(Math.cos(b.ang) * b.r, b.h + Math.sin(b.phase * 3) * 0.4, Math.sin(b.ang) * b.r));
      }
      const steer = want.sub(b.pos).multiplyScalar(b.dive >= 0 ? 9 : 4);
      b.vel.lerp(steer, 1 - Math.exp(-dt * 4));
      b.pos.addScaledVector(b.vel, dt);
      const look = b.pos.clone().add(b.vel);
      this.m4.lookAt(look, b.pos, new THREE.Vector3(0, 1, 0));
      this.m4.setPosition(b.pos);
      this.mesh.setMatrixAt(n++, this.m4);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    // The swarm breaks up after a while (or when cut down).
    if (n === 0 || this.t > 14) { this.active = false; this.mesh.count = 0; }
  }
}
