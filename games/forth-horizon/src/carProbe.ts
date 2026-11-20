// The hero car's own reflections. A car's paint, glass and chrome are mostly reflection: lit only by the fixed sky, the car looked pasted onto the world. This captures the world around the car
// into a small cube map, one face per frame (so the cost is spread, never a spike), turns it into a blurred-by-roughness environment every full turn, and gives it to the car's materials only.
// The road and puddles keep the stable sky environment (a moving probe on the ground made the wet road reflections jump).
import * as THREE from 'three';

export class CarProbe {
  private rt: THREE.WebGLCubeRenderTarget;
  private cube: THREE.CubeCamera;
  private pmrem: THREE.PMREMGenerator;
  private env: THREE.WebGLRenderTarget | null = null;
  private face = 0;
  private applied = new WeakSet<THREE.Material>();
  /** the environment texture the car should use, or null until the first full capture */
  get texture(): THREE.Texture | null { return this.env ? this.env.texture : null; }

  constructor(renderer: THREE.WebGLRenderer, size = 128) {
    this.rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cube = new THREE.CubeCamera(0.4, 900, this.rt);
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  /** capture one face around `pos`; `hide` is drawn out of the capture (the car itself, grass, spray). Returns true when a new environment is ready. */
  step(renderer: THREE.WebGLRenderer, scene: THREE.Scene, pos: THREE.Vector3, hide: THREE.Object3D[]): boolean {
    this.cube.position.copy(pos);
    this.cube.updateMatrixWorld(true);
    const cams = this.cube.children as THREE.PerspectiveCamera[];
    if (cams.length < 6) { this.cube.update(renderer, scene); return false; }
    const was = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    const prevTarget = renderer.getRenderTarget(), prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel();
    const prevXr = renderer.xr.enabled; renderer.xr.enabled = false;
    renderer.setRenderTarget(this.rt, this.face);
    renderer.render(scene, cams[this.face]);
    renderer.setRenderTarget(prevTarget, prevFace, prevMip);
    renderer.xr.enabled = prevXr;
    hide.forEach((o, i) => { o.visible = was[i]; });
    this.face = (this.face + 1) % 6;
    if (this.face !== 0) return false;
    this.env = this.pmrem.fromCubemap(this.rt.texture, this.env ?? undefined);       // blur levels for every roughness, written into the same target each time
    return true;
  }

  /** point every lit material in `root` at the probe (materials that already have their own envMap are left alone) */
  apply(root: THREE.Object3D, intensityScale = 1): void {
    const tex = this.texture; if (!tex) return;
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material; if (!m) return;
      for (const mat of (Array.isArray(m) ? m : [m]) as THREE.MeshStandardMaterial[]) {
        if (!(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
        if (mat.envMap === tex) continue;
        // custom-shader materials opt in via userData.allowCarProbe (our Class-A smoothed hero paint)
        if (mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile && !mat.userData?.allowCarProbe) continue;
        if (mat.envMap && !this.applied.has(mat)) continue;
        mat.envMap = tex;
        if (!this.applied.has(mat)) { mat.envMapIntensity *= intensityScale; mat.needsUpdate = true; this.applied.add(mat); }
      }
    });
  }

  dispose(): void { this.rt.dispose(); this.env?.dispose(); this.pmrem.dispose(); }
}
