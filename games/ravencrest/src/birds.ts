// Daybreak's birds: a loose flock sweeping over the bridge in the first morning light. One instanced
// mesh (a body and two wings per bird); the wings beat in the vertex shader, each bird on its own
// phase, so a whole flock is one draw.
import * as THREE from 'three/webgpu';
import { abs, color, float, instanceIndex, positionLocal, sin, time, vec3 } from 'three/tsl';

export class Flock {
  readonly mesh: THREE.InstancedMesh;
  private offs: THREE.Vector3[] = [];
  private t = -1;
  private path: THREE.CatmullRomCurve3 | null = null;
  private dur = 9;

  constructor(n = 46) {
    // A swallow-ish silhouette: a slim body, two swept wings (wing vertices sit at |x| > 0.04).
    const v = [
      0, 0, 0.18, 0.03, 0, -0.14, -0.03, 0, -0.14,                 // body
      0.02, 0, 0.06, 0.34, 0.02, -0.06, 0.02, 0, -0.08,          // right wing
      -0.02, 0, 0.06, -0.02, 0, -0.08, -0.34, 0.02, -0.06,       // left wing
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: true });
    m.colorNode = color(0x1d1a1c);
    const phase = float(instanceIndex).mul(1.7);
    const beat = sin(time.mul(13).add(phase));
    const p = positionLocal;
    m.positionNode = vec3(p.x, p.y.add(beat.mul(abs(p.x)).mul(0.9)), p.z);
    this.mesh = new THREE.InstancedMesh(g, m, n);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.userData.dynamic = true;
    for (let i = 0; i < n; i++) this.offs.push(new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 3.5, (Math.random() - 0.5) * 12));
  }

  /** Fly the flock along `points` over `dur` seconds. */
  start(points: THREE.Vector3[], dur = 9) {
    this.path = new THREE.CatmullRomCurve3(points);
    this.dur = dur; this.t = 0;
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (this.t < 0 || !this.path) return;
    this.t += dt;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1.4, 1.4, 1.4);
    this.offs.forEach((o, i) => {
      // Stragglers lag behind the leaders; everyone weaves a little.
      const u = THREE.MathUtils.clamp((this.t - (o.z + 6) * 0.08) / this.dur, 0, 1);
      const at = this.path!.getPointAt(u), tan = this.path!.getTangentAt(u);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      const pos = at.addScaledVector(side, o.x + Math.sin(this.t * 1.3 + i) * 0.6).add(new THREE.Vector3(0, o.y + Math.sin(this.t * 2 + i * 0.7) * 0.4, 0));
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
      m.compose(pos, q, s);
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.t > this.dur + 4) { this.mesh.visible = false; this.t = -1; }
  }
}
