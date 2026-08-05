// vrmRig.ts — an imperative three.js VRM renderer that draws a rigged avatar to an offscreen
// canvas with a transparent background, so the engine can composite it. Reuses the exact VRM
// load/update pattern from AvatarViewer (GLTFLoader + VRMLoaderPlugin, vrm.update(delta)), but
// imperatively (no R3F) since we render to a canvas, not the DOM. applyFace() drives expressions
// + the head bone each frame; render() runs vrm.update (lookAt + spring-bone physics).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

export class VrmRig {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private vrm: VRM | null = null;
  private clock = new THREE.Clock();

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
      for (const k in expressions) { try { em.setValue(k, expressions[k]); } catch { /* expression absent on this avatar */ } }
    }
    const h: any = vrm.humanoid;
    const headBone = h?.getNormalizedBoneNode?.(VRMHumanBoneName.Head) || h?.getBoneNode?.(VRMHumanBoneName.Head);
    if (headBone) headBone.rotation.set(head.x, head.y, head.z);
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
