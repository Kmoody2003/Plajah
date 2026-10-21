// Art-anchored layout. A reference camera is calibrated to a concept painting, and
// scene objects are placed by the pixel where they appear in that painting. Viewed
// from the reference camera the render then lines up with the art by construction;
// from anywhere else it is a consistent 3D place.
import * as THREE from 'three/webgpu';

export interface RefShot {
  id: string;
  image: string;
  width: number;   // pixel space the anchors are authored in
  height: number;
  eye: [number, number, number];
  horizonY: number; // pixel row of the true horizon (sets pitch)
  vanishX: number;  // pixel column of the road's vanishing point (sets yaw)
  vfovDeg: number;
  /** Architectural (shift) lens: camera stays level, horizon offset by lens shift. Keeps verticals vertical. */
  shift?: boolean;
}

// Concept art creation_3752929161: road → drawbridge → gatehouse, castle on the crag.
// Horizon chosen so the gate arch sits ~80 m away (see docs/ravencrest-engine.md).
export const ARRIVAL_SHOT: RefShot = {
  id: 'arrival_master',
  image: '/games/ravencrest/refs/arrival_master.jpg',
  width: 1280,
  height: 724,
  eye: [0, 1.6, 0],
  horizonY: 415,
  vanishX: 657,
  vfovDeg: 36.2,
};

// Concept art creation_3752887346: Grand Hall from the entrance doors toward the stair.
// Painted with a level, shift-lens camera (verticals stay vertical). Floor lines meet at
// (626, 497); vertical FOV chosen so the nave reads ~12.5 m between pier faces.
export const HALL_SHOT: RefShot = {
  id: 'hall_master',
  image: '/games/ravencrest/refs/hall_master.jpg',
  width: 1280,
  height: 724,
  eye: [0, 1.6, 0],
  horizonY: 497,
  vanishX: 626,
  vfovDeg: 45,
  shift: true,
};

export class ArtAnchor {
  readonly camera: THREE.PerspectiveCamera;
  private readonly ray = new THREE.Raycaster();

  constructor(readonly shot: RefShot) {
    const cam = new THREE.PerspectiveCamera(shot.vfovDeg, shot.width / shot.height, 0.1, 6000);
    const f = (shot.height / 2) / Math.tan(THREE.MathUtils.degToRad(shot.vfovDeg) / 2);
    cam.position.set(...shot.eye);
    cam.rotation.order = 'YXZ';
    // Road runs along -Z. A vanishing point right of centre means the camera is yawed left (+Y).
    cam.rotation.y = Math.atan((shot.vanishX - shot.width / 2) / f);
    if (shot.shift) {
      // Level camera; the visible frame is a window into a taller frustum centred on the horizon.
      const full = shiftFrame(shot);
      cam.fov = full.fovDeg;
      cam.aspect = shot.width / full.height;
      cam.setViewOffset(shot.width, full.height, 0, full.offsetY, shot.width, shot.height);
    } else {
      cam.rotation.x = Math.atan((shot.horizonY - shot.height / 2) / f);
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.camera = cam;
  }

  /** Focal length in reference pixels. */
  get focal() {
    return (this.shot.height / 2) / Math.tan(THREE.MathUtils.degToRad(this.shot.vfovDeg) / 2);
  }

  rayAt(px: number, py: number): THREE.Ray {
    const ndc = new THREE.Vector2((px / this.shot.width) * 2 - 1, -((py / this.shot.height) * 2 - 1));
    this.ray.setFromCamera(ndc, this.camera);
    return this.ray.ray.clone();
  }

  /** World point where the art pixel meets the horizontal plane y = h. */
  onY(px: number, py: number, h = 0): THREE.Vector3 {
    const r = this.rayAt(px, py);
    const t = (h - r.origin.y) / r.direction.y;
    if (!(t > 0)) throw new Error(`pixel (${px},${py}) never reaches y=${h}`);
    return r.at(t, new THREE.Vector3());
  }

  /** World point along the pixel's ray at a given distance from the eye. */
  atDistance(px: number, py: number, d: number): THREE.Vector3 {
    return this.rayAt(px, py).at(d, new THREE.Vector3());
  }

  /** World point where the pixel meets the vertical plane through `through` facing the eye. */
  onFacade(px: number, py: number, through: THREE.Vector3): THREE.Vector3 {
    const eye = this.camera.position;
    const n = new THREE.Vector3(through.x - eye.x, 0, through.z - eye.z).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, through);
    const hit = this.rayAt(px, py).intersectPlane(plane, new THREE.Vector3());
    if (!hit) throw new Error(`pixel (${px},${py}) misses facade`);
    return hit;
  }

  /** Height (world y) of art pixel row `py` on the facade standing at `base`. */
  heightAt(px: number, py: number, base: THREE.Vector3): number {
    return this.onFacade(px, py, base).y;
  }

  /** World width spanned by two pixel columns at the facade through `base`. */
  widthAt(pxA: number, pxB: number, py: number, base: THREE.Vector3): number {
    return this.onFacade(pxA, py, base).distanceTo(this.onFacade(pxB, py, base));
  }

  /** Apply this shot to a viewport camera (letterboxed to the shot's aspect in review mode). */
  applyTo(cam: THREE.PerspectiveCamera) {
    cam.position.copy(this.camera.position);
    cam.rotation.order = 'YXZ';
    cam.rotation.copy(this.camera.rotation);
    if (this.shot.shift) {
      const full = shiftFrame(this.shot);
      cam.fov = full.fovDeg;
      cam.aspect = this.shot.width / full.height;
      cam.setViewOffset(this.shot.width, full.height, 0, full.offsetY, this.shot.width, this.shot.height);
    } else {
      cam.clearViewOffset();
      cam.fov = this.shot.vfovDeg;
    }
    cam.updateProjectionMatrix();
  }
}

/** Full (unshifted) frustum for a shift-lens shot: centred on the horizon row. */
function shiftFrame(shot: RefShot) {
  const f = (shot.height / 2) / Math.tan(THREE.MathUtils.degToRad(shot.vfovDeg) / 2);
  const below = shot.horizonY > shot.height / 2;
  const height = 2 * Math.max(shot.horizonY, shot.height - shot.horizonY);
  const offsetY = below ? 0 : height - shot.height;
  return { height, offsetY, fovDeg: THREE.MathUtils.radToDeg(2 * Math.atan((height / 2) / f)) };
}
