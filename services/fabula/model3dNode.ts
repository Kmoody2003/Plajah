// model3dNode — the data model and deterministic math for Fabula's 3D node (imported geometry).
//
// The FX suite covers the LOOK of particle fields, terrain and extruded paths as raymarched
// registry effects, but it could never load an actual mesh — the log's last genuinely-unbuilt
// item. A raymarcher cannot import a .glb. This is the foundation of a real 3D node: a clip whose
// source is a loaded model, rendered by three.js to an offscreen canvas that the compositor
// composites like any other layer element. Because both hosts render the SAME scene at the SAME
// clip-local time, monitor and export match without the compositor learning anything new — the
// deliberate reason to bridge through a canvas rather than a second GL context.
//
// This module is PURE (no three.js, no DOM): the spec, its defaults, and the camera/framing math.
// The renderer (components/plajahPixels/engine/core/model3d.ts) consumes these. Keeping the math
// here means the part that decides where the camera goes and how the object is framed is unit
// tested, and the same numbers drive the live monitor and the offline export.

export interface Vec3 { x: number; y: number; z: number }

export interface Model3DSpec {
  /** Pool asset id of the model file (.glb/.gltf/.obj), or a direct url. */
  assetId?: string;
  url?: string;
  /** Orbit camera around the model's centre. Yaw/pitch in degrees, distance in model radii. */
  yaw: number;
  pitch: number;
  /** Camera distance as a MULTIPLE of the framed distance (1 = auto-framed to fit). */
  distanceScale: number;
  fov: number;                 // vertical field of view, degrees
  /** Auto-rotate: yaw advances by rotateSpeed (deg/sec) over clip-local time. */
  autoRotate: boolean;
  rotateSpeed: number;
  /** Model orientation offset (degrees), applied before the camera — for models authored Z-up etc. */
  modelYaw: number;
  modelPitch: number;
  /** Key light direction (degrees) and the three-point rig's intensity. */
  lightYaw: number;
  lightPitch: number;
  keyIntensity: number;
  fillIntensity: number;
  rimIntensity: number;
  /** Image-based lighting intensity (a neutral studio environment); 0 = lights only. */
  envIntensity: number;
  exposure: number;
  /** Transparent (composites over other layers) or a solid colour behind the model. */
  transparent: boolean;
  background: string;
  /** Shadow-catcher ground plane under the model. */
  ground: boolean;
}

export const MODEL3D_DEFAULT: Model3DSpec = {
  yaw: 30, pitch: 12, distanceScale: 1, fov: 35,
  autoRotate: true, rotateSpeed: 24,
  modelYaw: 0, modelPitch: 0,
  lightYaw: -35, lightPitch: 45, keyIntensity: 3, fillIntensity: 0.8, rimIntensity: 1.6,
  envIntensity: 1, exposure: 1,
  transparent: true, background: '#101014', ground: false,
};

const RANGES: Partial<Record<keyof Model3DSpec, [number, number]>> = {
  yaw: [-360, 360], pitch: [-89, 89], distanceScale: [0.2, 6], fov: [8, 90],
  rotateSpeed: [-360, 360], modelYaw: [-360, 360], modelPitch: [-360, 360],
  lightYaw: [-360, 360], lightPitch: [-89, 89],
  keyIntensity: [0, 12], fillIntensity: [0, 12], rimIntensity: [0, 12],
  envIntensity: [0, 4], exposure: [0.1, 4],
};

const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v;
const DEG = Math.PI / 180;

/** A spec with every numeric field clamped to a sane range and missing fields defaulted. */
export function normalizeModel3dSpec(spec: Partial<Model3DSpec> | undefined): Model3DSpec {
  const out: Model3DSpec = { ...MODEL3D_DEFAULT, ...(spec || {}) };
  for (const [key, range] of Object.entries(RANGES) as [keyof Model3DSpec, [number, number]][]) {
    const v = out[key];
    if (typeof v === 'number' && Number.isFinite(v)) (out as any)[key] = clamp(v, range[0], range[1]);
    else (out as any)[key] = MODEL3D_DEFAULT[key];
  }
  return out;
}

/**
 * The distance at which a sphere of the given radius exactly fills the frame, for a vertical FOV
 * and aspect. A sphere is fit by its angular radius: d = r / sin(halfAngle). The limiting axis is
 * the narrower one — vertical for landscape, horizontal for portrait — so we take the smaller
 * half-angle. A margin > 1 leaves breathing room so the model does not touch the edges.
 */
export function frameDistance(radius: number, fovVDeg: number, aspect: number, margin = 1.15): number {
  const halfV = (fovVDeg * DEG) / 2;
  // Horizontal half-angle from the vertical FOV and aspect (w/h).
  const halfH = Math.atan(Math.tan(halfV) * Math.max(0.0001, aspect));
  const half = Math.min(halfV, halfH);
  const d = radius / Math.max(1e-4, Math.sin(half));
  return d * margin;
}

/**
 * Camera position for an orbit around `target`. Yaw rotates around the world Y axis (0 looks down
 * -Z toward the model's front), pitch tilts up (+) / down (-). Distance is in world units.
 */
export function orbitCameraPosition(target: Vec3, yawDeg: number, pitchDeg: number, distance: number): Vec3 {
  const yaw = yawDeg * DEG, pitch = pitchDeg * DEG;
  const cp = Math.cos(pitch);
  return {
    x: target.x + distance * cp * Math.sin(yaw),
    y: target.y + distance * Math.sin(pitch),
    z: target.z + distance * cp * Math.cos(yaw),
  };
}

/** A unit direction from yaw/pitch, for placing a light. Points FROM the origin TOWARD the scene. */
export function directionFromAngles(yawDeg: number, pitchDeg: number): Vec3 {
  const yaw = yawDeg * DEG, pitch = pitchDeg * DEG;
  const cp = Math.cos(pitch);
  return { x: cp * Math.sin(yaw), y: Math.sin(pitch), z: cp * Math.cos(yaw) };
}

/**
 * The yaw to use at a clip-local time. Auto-rotate advances the base yaw by rotateSpeed deg/sec,
 * deterministically from the clip clock — so the monitor at t and the export frame at t agree,
 * which is the whole reason this maths lives in a pure module.
 */
export function yawAtTime(spec: Model3DSpec, localT: number): number {
  return spec.autoRotate ? spec.yaw + spec.rotateSpeed * Math.max(0, localT) : spec.yaw;
}

/** The complete resolved camera for a frame: eye position, look target, fov, given the model bounds. */
export interface ResolvedCamera { eye: Vec3; target: Vec3; fov: number; distance: number }
export function resolveCamera(spec: Model3DSpec, bounds: { center: Vec3; radius: number }, aspect: number, localT: number): ResolvedCamera {
  const distance = frameDistance(Math.max(1e-3, bounds.radius), spec.fov, aspect) * spec.distanceScale;
  const eye = orbitCameraPosition(bounds.center, yawAtTime(spec, localT), spec.pitch, distance);
  return { eye, target: bounds.center, fov: spec.fov, distance };
}

/** Accepted model file extensions and a guess at the loader to use. */
export function model3dLoaderFor(nameOrUrl: string): 'gltf' | 'obj' | 'fbx' | 'stl' | null {
  const m = nameOrUrl.toLowerCase().match(/\.(glb|gltf|obj|fbx|stl)(\?|#|$)/);
  if (!m) return null;
  return m[1] === 'glb' || m[1] === 'gltf' ? 'gltf' : (m[1] as 'obj' | 'fbx' | 'stl');
}
