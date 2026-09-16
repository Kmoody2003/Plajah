import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MODEL3D_DEFAULT, normalizeModel3dSpec, frameDistance, orbitCameraPosition, directionFromAngles, yawAtTime, resolveCamera, model3dLoaderFor } from '../services/fabula/model3dNode';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('Model3D node — deterministic camera + framing', () => {
  it('normalizes a spec, clamping every field and defaulting the rest', () => {
    const s = normalizeModel3dSpec({ fov: 500, pitch: -200, distanceScale: 0, keyIntensity: -3, rotateSpeed: 9999 } as any);
    assert.equal(s.fov, 90); assert.equal(s.pitch, -89); assert.equal(s.distanceScale, 0.2);
    assert.equal(s.keyIntensity, 0); assert.equal(s.rotateSpeed, 360);
    assert.equal(s.autoRotate, MODEL3D_DEFAULT.autoRotate);
    // a garbage numeric falls back to the default, not NaN
    assert.equal(normalizeModel3dSpec({ fov: NaN } as any).fov, MODEL3D_DEFAULT.fov);
  });

  it('frames a sphere so its angular radius fills the narrower axis', () => {
    // Vertical fit at square aspect: d = r / sin(fovV/2), times the margin.
    const r = 2, fov = 60, margin = 1.15;
    const d = frameDistance(r, fov, 1, margin);
    assert.ok(near(d, r / Math.sin((fov * Math.PI / 180) / 2) * margin), `got ${d}`);
    // Portrait (aspect < 1) is horizontally limited, so it must sit FURTHER back than landscape.
    const portrait = frameDistance(r, fov, 9 / 16, margin);
    const landscape = frameDistance(r, fov, 16 / 9, margin);
    assert.ok(portrait > landscape, `portrait ${portrait} should exceed landscape ${landscape}`);
    // A bigger object needs proportionally more distance.
    assert.ok(near(frameDistance(4, fov, 1, margin), 2 * d));
  });

  it('orbits the camera around the target', () => {
    const t = { x: 0, y: 0, z: 0 };
    // yaw 0, pitch 0 → straight in front on +Z.
    let e = orbitCameraPosition(t, 0, 0, 5);
    assert.ok(near(e.x, 0) && near(e.y, 0) && near(e.z, 5), JSON.stringify(e));
    // yaw 90 → on +X.
    e = orbitCameraPosition(t, 90, 0, 5);
    assert.ok(near(e.x, 5) && near(e.z, 0, 1e-6), JSON.stringify(e));
    // pitch 90 → straight above.
    e = orbitCameraPosition(t, 0, 90, 5);
    assert.ok(near(e.y, 5), JSON.stringify(e));
    // distance is preserved: |eye - target| == distance for any angle.
    e = orbitCameraPosition(t, 37, 21, 5);
    assert.ok(near(Math.hypot(e.x, e.y, e.z), 5, 1e-6));
    // orbit respects a non-zero target (centre offset).
    e = orbitCameraPosition({ x: 1, y: 2, z: 3 }, 0, 0, 5);
    assert.ok(near(e.x, 1) && near(e.y, 2) && near(e.z, 8), JSON.stringify(e));
  });

  it('light direction is a unit vector from the angles', () => {
    const d = directionFromAngles(0, 0);
    assert.ok(near(d.x, 0) && near(d.y, 0) && near(d.z, 1));
    assert.ok(near(Math.hypot(...Object.values(directionFromAngles(123, 45))), 1, 1e-6));
  });

  it('auto-rotate advances yaw deterministically from clip-local time', () => {
    const spec = normalizeModel3dSpec({ yaw: 10, autoRotate: true, rotateSpeed: 24 });
    assert.equal(yawAtTime(spec, 0), 10);
    assert.equal(yawAtTime(spec, 1), 34);          // +24 deg after 1s
    assert.equal(yawAtTime(spec, 2), 58);
    // the same t always gives the same yaw — the property that makes monitor == export
    assert.equal(yawAtTime(spec, 1.5), yawAtTime(spec, 1.5));
    // negative time never runs the rotation backwards past the start
    assert.equal(yawAtTime(spec, -5), 10);
    // static when auto-rotate is off
    assert.equal(yawAtTime(normalizeModel3dSpec({ yaw: 10, autoRotate: false }), 3), 10);
  });

  it('resolves a full camera whose eye sits distanceScale × the framed distance from the centre', () => {
    const spec = normalizeModel3dSpec({ fov: 40, distanceScale: 1.5, autoRotate: false, yaw: 0, pitch: 0 });
    const bounds = { center: { x: 0, y: 1, z: 0 }, radius: 3 };
    const cam = resolveCamera(spec, bounds, 16 / 9, 0);
    const expectedD = frameDistance(3, 40, 16 / 9) * 1.5;
    assert.ok(near(cam.distance, expectedD));
    assert.ok(near(Math.hypot(cam.eye.x - 0, cam.eye.y - 1, cam.eye.z - 0), expectedD, 1e-6));
    assert.deepEqual(cam.target, bounds.center);
    assert.equal(cam.fov, 40);
  });

  it('recognises the model file types it can load', () => {
    assert.equal(model3dLoaderFor('robot.glb'), 'gltf');
    assert.equal(model3dLoaderFor('scene.gltf?v=2'), 'gltf');
    assert.equal(model3dLoaderFor('bust.OBJ'), 'obj');
    assert.equal(model3dLoaderFor('rig.fbx'), 'fbx');
    assert.equal(model3dLoaderFor('part.stl#x'), 'stl');
    assert.equal(model3dLoaderFor('notes.txt'), null);
    assert.equal(model3dLoaderFor('clip.mp4'), null);
  });
});
