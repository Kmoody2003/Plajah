/**
 * castFaceOverlay.ts
 *
 * Puts a Ravencrest cast member over the person in the fan room's webcam booth: the character is
 * rendered head-and-shoulders into an offscreen transparent WebGL canvas, its head turned with the
 * tracked face, then drawn onto the booth canvas so its head lands on (and scales with) the
 * person's head. Plugged into HalloweenFilterEngine as a FaceLayer.
 */

import * as THREE from 'three';
import type { FilterFacePose } from './halloweenFilterEngine';
import {
  STAGE_HEIGHT,
  loadCastRig,
  headTurnFromMatrix,
  playEmote,
  poseStageRig,
  recenterBody,
  setBodyPose,
  type BodyPoseInput,
  type CastEmoteId,
  type StageRig,
} from './ravencrestCastStage';
import { expressionFromBlendshapes, NEUTRAL_FACE } from './castFaceRig';

// Waist-up framing, wide enough that raised arms stay in the picture.
const OUT_W = 512;
const OUT_H = 512;
/** World height (m) treated as "one head" when matching the character's head to the face box. */
const HEAD_SPAN = 0.26;

export class CastFaceOverlay {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, OUT_W / OUT_H, 0.05, 20);
  private rig: StageRig | null = null;
  private url: string | null = null;
  private lastMs = 0;
  private headTop = new THREE.Vector3();
  private headBottom = new THREE.Vector3();
  private body: BodyPoseInput | null = null;
  /** Head pose that counts as "looking at the camera"; measured over the first second of tracking. */
  private neutral = { yaw: 0, pitch: 0 };
  private calib: { n: number; yaw: number; pitch: number } | null = { n: 0, yaw: 0, pitch: 0 };

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(OUT_W, OUT_H, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;

    this.scene.add(new THREE.AmbientLight(0x3a3550, 1.7));
    const key = new THREE.DirectionalLight(0xffe6c8, 3.0);
    key.position.set(1.2, 2.4, 2.6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xf97316, 1.8);
    rim.position.set(-2, 1.6, -1.5);
    this.scene.add(rim);

    this.camera.fov = 40;
    this.camera.position.set(0, STAGE_HEIGHT * 0.7, 2.6);
    this.camera.lookAt(0, STAGE_HEIGHT * 0.7, 0);
    this.camera.updateProjectionMatrix();
  }

  /** Switch character (a Ravencrest GLB url), or null to clear. Loads in the background. */
  setCharacter(url: string | null): Promise<void> {
    this.url = url;
    if (!url) {
      this.clear();
      return Promise.resolve();
    }
    return loadCastRig(url).then((rig) => {
      if (this.url !== url) return;
      this.clear();
      this.rig = rig;
      this.recenter(); // new skeleton: re-take the neutral pose
      this.scene.add(this.rig.root);
    });
  }

  /** Latest 3D body landmarks of the performer (null when not tracked). */
  setBodyPose(pose: BodyPoseInput | null) {
    this.body = pose;
  }

  /** Re-take "facing forward" from how the performer is sitting now (head and torso). */
  recenter() {
    this.calib = { n: 0, yaw: 0, pitch: 0 };
  }

  playEmote(id: CastEmoteId) {
    if (this.rig) playEmote(this.rig, id);
  }

  get ready(): boolean {
    return !!this.rig;
  }

  /** FaceLayer: draw the character over the tracked face. */
  draw = (ctx: CanvasRenderingContext2D, face: FilterFacePose, _W: number, _H: number, nowMs: number) => {
    const rig = this.rig;
    if (!rig) return;
    const dt = this.lastMs ? Math.min(0.1, (nowMs - this.lastMs) / 1000) : 1 / 30;
    this.lastMs = nowMs;

    rig.blend = face.blendshapes; // VTuber builds: 1:1 perfect sync
    // Face: real expression scores when tracked, else the jaw follows the (simulated) mouth.
    rig.expression = face.blendshapes
      ? expressionFromBlendshapes(face.blendshapes)
      : { ...NEUTRAL_FACE, jawOpen: Math.min(1, face.mouthOpen * 1.6) };
    setBodyPose(rig, this.body, dt);

    // Head turn/nod from the tracker's 3D head matrix (falls back to the eye-position estimate).
    let yaw = face.yaw;
    let pitch = face.pitch;
    if (face.headMatrix) {
      const t = headTurnFromMatrix(face.headMatrix, true);
      if (this.calib) {
        // Average ~1 s of tracking as the neutral pose, then lock it (and the torso) in.
        const c = this.calib;
        c.n++;
        c.yaw += t.yaw;
        c.pitch += t.pitch;
        if (c.n >= 24) {
          this.neutral = { yaw: c.yaw / c.n, pitch: c.pitch / c.n };
          recenterBody(rig);
          this.calib = null;
        }
      }
      yaw = t.yaw - this.neutral.yaw;
      pitch = t.pitch - this.neutral.pitch;
    }
    // Tilt is applied as a 2D rotation below (exactly matches the face); turn/nod go to the rig.
    poseStageRig(rig, dt, { yaw, pitch, roll: 0 }, 0.25);
    this.renderer.render(this.scene, this.camera);

    // Where the head landed in the offscreen image, and how tall it is there.
    const head = rig.head ?? rig.root;
    head.getWorldPosition(this.headTop);
    this.headBottom.copy(this.headTop);
    this.headTop.y += HEAD_SPAN * 0.6;
    this.headBottom.y -= HEAD_SPAN * 0.4;
    const top = this.toPixels(this.headTop);
    const bottom = this.toPixels(this.headBottom);
    const headPx = Math.max(8, Math.hypot(top.x - bottom.x, top.y - bottom.y));
    const hx = (top.x + bottom.x) / 2;
    const hy = (top.y + bottom.y) / 2;

    const scale = (face.ry * 2 * 1.15) / headPx;
    ctx.save();
    ctx.translate(face.cx, face.cy);
    ctx.rotate(face.roll);
    ctx.scale(scale, scale);
    ctx.drawImage(this.renderer.domElement, -hx, -hy);
    ctx.restore();
  };

  private toPixels(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * OUT_W, y: (0.5 - p.y * 0.5) * OUT_H };
  }

  private clear() {
    if (!this.rig) return;
    this.rig.mixer?.stopAllAction();
    this.scene.remove(this.rig.root);
    this.rig = null;
  }

  dispose() {
    this.clear();
    this.renderer.dispose();
  }
}
