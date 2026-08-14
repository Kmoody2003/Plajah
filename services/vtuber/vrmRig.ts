// vrmRig.ts — an imperative three.js VRM renderer that draws a rigged avatar to an offscreen
// canvas with a transparent background, so the engine can composite it. Reuses the exact VRM
// load/update pattern from AvatarViewer (GLTFLoader + VRMLoaderPlugin, vrm.update(delta)), but
// imperatively (no R3F) since we render to a canvas, not the DOM. applyFace() drives expressions
// + the head bone each frame; render() runs vrm.update (lookAt + spring-bone physics).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

const clampRad = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v || 0));

export class VrmRig {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private vrm: VRM | null = null;
  private clock = new THREE.Clock();
  /** Expression names this avatar actually defines. setValue() silently ignores unknown
   *  names, so without this a model missing the standard presets renders a completely
   *  frozen face with no error anywhere — the hardest kind of bug to see. */
  private exprNames = new Set<string>();
  private missingLogged = false;

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, premultipliedAlpha: false });
    this.renderer.setClearColor(0x000000, 0); // transparent — composited downstream
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, width / height, 0.1, 20);
    this.camera.position.set(0, 1.36, 1.15); // head-and-shoulders framing
    this.camera.lookAt(0, 1.32, 0);
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(1, 2, 2.5); this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  }

  async loadAvatar(url: string): Promise<boolean> {
    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm) return false;
      if (this.vrm) this.scene.remove(this.vrm.scene);
      this.vrm = vrm;
      vrm.scene.rotation.y = Math.PI; // face the camera
      this.scene.add(vrm.scene);

      // Catalogue what this avatar can actually express, and say so. A VRM exported without
      // expression presets will never animate its face no matter how good the tracking is,
      // and that needs to read as "this model has no expressions" rather than "tracking broke".
      this.exprNames.clear();
      this.missingLogged = false;
      const em: any = (vrm as any).expressionManager;
      const list: any[] = em?.expressions ?? [];
      for (const e of list) {
        const n = e?.expressionName || e?.name;
        if (n) this.exprNames.add(String(n));
      }
      if (!this.exprNames.size) {
        console.warn('[vtuber] This VRM defines NO expressions — its face cannot animate. Re-export with expression presets (aa/ih/ou/ee/oh, blink, happy…).');
      } else {
        console.info(`[vtuber] avatar expressions (${this.exprNames.size}):`, [...this.exprNames].join(', '));
      }
      return true;
    } catch (e) {
      console.warn('[vtuber] VRM load failed:', e);
      return false;
    }
  }

  /** Drive expressions + head bone for the current frame. Call before render(). */
  applyFace(expressions: Record<string, number>, head: { x: number; y: number; z: number }): void {
    const vrm = this.vrm;
    if (!vrm) return;
    const em: any = (vrm as any).expressionManager;
    if (em?.setValue) {
      const missing: string[] = [];
      for (const k in expressions) {
        // Only drive what exists. Unknown names are a no-op inside three-vrm, so sending
        // them costs work and — worse — hides the fact that they were never applied.
        if (this.exprNames.size && !this.exprNames.has(k)) { missing.push(k); continue; }
        try { em.setValue(k, expressions[k]); } catch { /* */ }
      }
      if (missing.length && !this.missingLogged) {
        this.missingLogged = true;
        console.warn(`[vtuber] avatar has no expression for: ${missing.join(', ')} — those signals are dropped.`);
      }
    }
    const h: any = vrm.humanoid;
    const headBone = h?.getNormalizedBoneNode?.(VRMHumanBoneName.Head) || h?.getBoneNode?.(VRMHumanBoneName.Head);
    // Clamp: a bad transform matrix (partial occlusion, extreme angle) otherwise snaps the
    // head through impossible rotations, which reads as the tracker "glitching out".
    if (headBone) headBone.rotation.set(clampRad(head.x, 0.7), clampRad(head.y, 0.9), clampRad(head.z, 0.6));
  }

  render(): void {
    const dt = this.clock.getDelta();
    if (this.vrm) this.vrm.update(dt); // lookAt + spring bones + applies normalized→raw
    this.renderer.render(this.scene, this.camera);
  }

  setSize(w: number, h: number): void {
    this.canvas.width = w; this.canvas.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    try { this.renderer.dispose(); } catch { /* */ }
    this.vrm = null;
  }
  get hasAvatar(): boolean { return !!this.vrm; }
}
