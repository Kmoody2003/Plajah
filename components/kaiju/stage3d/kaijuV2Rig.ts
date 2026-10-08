// kaijuV2Rig — runtime for the NEW image-to-3D Chora / Reello (public/models/mascots/v2/{who}.glb).
//
// One skinned mesh, one textured PBR material ('skin'), the old skeleton (root, hips, spine, chest, head, arm_*, hand_*,
// leg_*, foot_*, tail_1..4) + spring chains (fin_* plates, horn_*), 10 body clips, and an armature extra `spring_tails`
// (bone → Blender-space tail) that the spring solver needs. The face is a BLANK mask: eyes / brows / mouth are decals
// (kaijuFaceRig.ts), so there is nothing face-related in here.
//
// It exposes the same surface DancerController / KaijuStage3D use from the old MascotRig:
//   root, bones{name→Bone}, mixer, actions{name→AnimationAction}, update(dt), dispose()
// plus `skin` (the material), `mesh`, and `look` tweaks (exposure / saturation / light) kept in ONE place: V2_LOOK.

import * as THREE from 'three';
import { SPRING_FOR, SpringJoint } from '../../mascots/mascotRuntime';

/** The look the user approved in the artifact viewer (docs/kaiju-fidelity/viewer: exposure 0.80, saturation 1.15, light 0.70). */
export const V2_LOOK = {
  /** final-colour multiplier on the lit skin (the viewer's toneMappingExposure) */
  exposure: 0.8,
  /** saturation of the albedo (1 = untouched) */
  saturation: 1.15,
  /** scale on the direct + ambient light that reaches the skin (the viewer's “Light” slider) */
  light: 0.7,
  /** roughness / spec kept modest */
  roughness: 0.74,
  envMapIntensity: 0.9,
  /** soft tinted ambient lift so shadow sides stay coloured rather than black */
  ambientLift: [0.1, 0.085, 0.12] as [number, number, number],
};
export type V2Look = typeof V2_LOOK;

const LOOPS = new Set(['idle', 'listen', 'encourage', 'excited', 'think', 'hop']);

export interface V2Uniforms { uExposure: { value: number }; uSat: { value: number }; uLight: { value: number } }

/** Patch a MeshStandardMaterial in place: saturation on the albedo + exposure/light gains. One extra MAD or two per pixel. */
export function patchSkin(mat: THREE.MeshStandardMaterial, look: V2Look = V2_LOOK): V2Uniforms {
  const u: V2Uniforms = { uExposure: { value: look.exposure }, uSat: { value: look.saturation }, uLight: { value: look.light } };
  const lift = look.ambientLift;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uExposure; uniform float uSat; uniform float uLight;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = max(vec3(0.0), mix(vec3(lum), diffuseColor.rgb, uSat)); }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse *= uLight; reflectedLight.directSpecular *= uLight; reflectedLight.indirectDiffuse *= uLight; reflectedLight.indirectSpecular *= uLight;
        reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(${lift[0].toFixed(3)}, ${lift[1].toFixed(3)}, ${lift[2].toFixed(3)});`)
      .replace('#include <opaque_fragment>', 'outgoingLight *= uExposure;\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'kaijuV2skin';
  return u;
}

export interface V2Options { reducedMotion?: boolean; look?: Partial<V2Look> }

export class KaijuV2Rig {
  readonly kind = 'v2' as const;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction> = {};
  bones: Record<string, THREE.Bone> = {};
  springs: SpringJoint[] = [];
  mesh: THREE.SkinnedMesh | null = null;
  skin: THREE.MeshStandardMaterial;
  uniforms: V2Uniforms;
  reduced: boolean;
  base = 'idle'; current = 'idle';

  /** `gltf.scene` must already be a private clone (SkeletonUtils.clone) — the rig mutates it. */
  constructor(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, opts: V2Options = {}) {
    this.root = gltf.scene; this.reduced = !!opts.reducedMotion;
    const look = { ...V2_LOOK, ...opts.look };
    let skin: THREE.MeshStandardMaterial | null = null;
    this.root.traverse((o: any) => {
      if (o.isBone) this.bones[o.name] = o;
      if (!o.isMesh) return;
      o.frustumCulled = false;                 // skinned bounds are wrong under big dance clips
      if (!this.mesh && o.isSkinnedMesh) this.mesh = o;
      const m = o.material as THREE.MeshStandardMaterial;
      if (m && !skin) {
        skin = m.clone();                      // private material → per-dancer uniforms, safe disposal
        if (skin.map) skin.map.colorSpace = THREE.SRGBColorSpace;
        skin.roughness = look.roughness; skin.metalness = 0; skin.envMapIntensity = look.envMapIntensity;
      }
      if (skin) o.material = skin;
    });
    this.skin = skin ?? new THREE.MeshStandardMaterial();
    this.uniforms = patchSkin(this.skin, look);

    this.mixer = new THREE.AnimationMixer(this.root);
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      if (!LOOPS.has(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[clip.name] = a;
    }
    this.actions.idle?.play();

    // ---- springs: tails come from the armature extras (Blender rest positions), else from the child bone
    this.root.updateMatrixWorld(true);
    let armature: THREE.Object3D | null = null;
    this.root.traverse((o: any) => { if (!armature && o.userData?.spring_tails) armature = o; });
    const tails: Record<string, number[]> = (armature as any)?.userData?.spring_tails ?? {};
    const toThree = (p: number[]) => new THREE.Vector3(p[0], p[2], -p[1]);   // Blender Z-up → glTF Y-up
    for (const [name, bone] of Object.entries(this.bones)) {
      const spec = SPRING_FOR(name); if (!spec) continue;
      let local: THREE.Vector3 | null = null;
      if (tails[name] && armature) {
        const w = toThree(tails[name]); (armature as THREE.Object3D).localToWorld(w); local = bone.worldToLocal(w.clone());
      } else {
        const child = bone.children.find((c: any) => c.isBone) as THREE.Bone | undefined;
        if (child) local = child.position.clone();
      }
      if (local && local.lengthSq() > 1e-8) this.springs.push(new SpringJoint(bone, this.reduced ? { ...spec, maxDeg: spec.maxDeg * 0.5 } : spec, local));
    }
    this.springs.sort((a, b) => a.depth - b.depth);
  }

  /** Live look tweaks (for the face lab / settings). */
  setLook(l: Partial<V2Look>) {
    if (l.exposure != null) this.uniforms.uExposure.value = l.exposure;
    if (l.saturation != null) this.uniforms.uSat.value = l.saturation;
    if (l.light != null) this.uniforms.uLight.value = l.light;
    if (l.roughness != null) this.skin.roughness = l.roughness;
    if (l.envMapIntensity != null) this.skin.envMapIntensity = l.envMapIntensity;
  }

  fadeTo(name: string, dur = 0.3) {
    const next = this.actions[name]; if (!next) return;
    for (const [n, a] of Object.entries(this.actions)) if (n !== name && a.isRunning()) a.fadeOut(dur);
    next.reset().setEffectiveTimeScale(this.reduced ? 0.6 : 1).setEffectiveWeight(1).fadeIn(dur).play();
    this.current = name; if (LOOPS.has(name)) this.base = name;
  }

  update(dt: number) {
    dt = Math.min(dt, 1 / 20);
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    const steps = dt > 1 / 45 ? 2 : 1;                     // sub-step springs for stability at low frame rates
    for (let s = 0; s < steps; s++) for (const j of this.springs) j.update(dt / steps);
  }

  dispose() {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root);
    this.skin.dispose();
  }
}
