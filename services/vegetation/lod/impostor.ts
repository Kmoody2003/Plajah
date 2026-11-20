// Plajah Vegetation — hemi-octahedral impostors (docs/plajah-vegetation.md §2.3).
//
// A tree is rendered once, on the device, from F×F directions spread over the upper hemisphere (hemi-octahedral mapping
// gives foliage more side views than a full sphere would), into one atlas. Far away it is drawn as a single card that
// faces the camera and shows the baked view closest to the direction it is seen from — tens of thousands of trees for
// the cost of quads. Lighting and the art's glow are baked into the views.
import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, cos, cross, float, floor, max, min, normalize, positionLocal, sin, texture, uv, vec2, vec3 } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Direction on the upper hemisphere for atlas coords (u, v) in [0, 1]. */
export function hemiOctDecode(u: number, v: number, out = new THREE.Vector3()): THREE.Vector3 {
  const x = u * 2 - 1, y = v * 2 - 1;
  const px = (x + y) / 2, pz = (x - y) / 2;
  return out.set(px, 1 - Math.abs(px) - Math.abs(pz), pz).normalize();
}

/** Atlas coords (u, v) in [0, 1] for a direction (y ≥ 0 assumed; below the horizon is clamped to it). */
export function hemiOctEncode(d: THREE.Vector3): [number, number] {
  const y = Math.max(0, d.y), s = Math.abs(d.x) + y + Math.abs(d.z) || 1;
  const px = d.x / s, pz = d.z / s;
  return [(px + pz) * 0.5 + 0.5, (px - pz) * 0.5 + 0.5];
}

export interface ImpostorAtlas {
  texture: THREE.Texture;
  frames: number;
  /** Bounding sphere of the baked object, in its own units: card half-size and the sphere centre's height. */
  radius: number;
  centerY: number;
}

/**
 * Bake an impostor atlas for `objects` (meshes in the object's own frame: base at the origin, facing +Z).
 * `prepare` lets the caller swap materials/attributes for the bake (e.g. give wind attributes a still value).
 */
export async function bakeImpostor(renderer: THREE.WebGPURenderer, objects: THREE.Object3D[], o: { frames?: number; size?: number; envIntensity?: number } = {}): Promise<ImpostorAtlas> {
  const frames = o.frames ?? 6, size = o.size ?? 1024, cell = Math.floor(size / frames);
  const scene = new THREE.Scene();
  const holder = new THREE.Group();
  for (const ob of objects) holder.add(ob);
  scene.add(holder);
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x2a3a30, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-4, 10, 6); scene.add(sun);
  const box = new THREE.Box3().setFromObject(holder), sphere = box.getBoundingSphere(new THREE.Sphere());
  const R = sphere.radius, c = sphere.center;
  const cam = new THREE.OrthographicCamera(-R, R, R, -R, 0.01, R * 6);
  const cellRT = new THREE.RenderTarget(cell, cell, { colorSpace: THREE.SRGBColorSpace });
  const atlas = new THREE.RenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const prevTarget = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color() as N) as N, prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  // the atlas starts clear
  renderer.setRenderTarget(atlas); renderer.clear();
  const d = new THREE.Vector3();
  for (let j = 0; j < frames; j++) for (let i = 0; i < frames; i++) {
    hemiOctDecode(i / (frames - 1), j / (frames - 1), d);
    cam.position.copy(c).addScaledVector(d, R * 3);
    cam.up.set(0, 1, 0);
    if (Math.abs(d.y) > 0.985) cam.up.set(0, 0, -1);
    cam.lookAt(c);
    cam.updateMatrixWorld();
    renderer.setRenderTarget(cellRT);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.copyTextureToTexture(cellRT.texture, atlas.texture, null, new THREE.Vector2(i * cell, j * cell));
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  cellRT.dispose();
  for (const ob of objects) holder.remove(ob);
  return { texture: atlas.texture, frames, radius: R, centerY: c.y };
}

/**
 * The card material. Instances carry aCenter (world x, y, z, scale) and aYaw; the instance matrices stay identity —
 * the card is built in the vertex stage facing the camera, and the frame for the view direction is chosen per pixel.
 */
export function impostorMaterial(atlas: ImpostorAtlas, o: { alphaTest?: number; brightness?: number; flipV?: boolean } = {}): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: false, alphaTest: o.alphaTest ?? 0.35, side: THREE.DoubleSide });
  const F = atlas.frames, R = atlas.radius;
  const c: N = attribute('aCenter', 'vec4'), yaw: N = attribute('aYaw', 'float');
  const center: N = c.xyz.add((vec3 as N)(0, float(atlas.centerY).mul(c.w), 0));
  const view: N = normalize(cameraPosition.sub(center));
  const right: N = normalize(cross(vec3(0, 1, 0), view));
  const up: N = cross(view, right);
  m.positionNode = center.add(right.mul(positionLocal.x.mul(R * 2).mul(c.w))).add(up.mul(positionLocal.y.mul(R * 2).mul(c.w)));
  // view direction in the tree's own frame → hemi-octahedral coords → nearest baked frame
  const cy: N = cos(yaw), sy: N = sin(yaw);
  const lx: N = view.x.mul(cy).sub(view.z.mul(sy)), lz: N = view.x.mul(sy).add(view.z.mul(cy)), ly: N = max(view.y, float(0));
  const s: N = lx.abs().add(ly).add(lz.abs());
  const px: N = lx.div(s), pz: N = lz.div(s);
  const oct: N = vec2(px.add(pz), px.sub(pz)).mul(0.5).add(0.5);
  const frame: N = min(max(floor(oct.mul(F - 1).add(0.5)), vec2(0, 0)), vec2(F - 1, F - 1));
  const local: N = o.flipV ? vec2(uv().x, float(1).sub(uv().y)) : uv();
  const a: N = texture(atlas.texture, frame.add(local).div(F));
  m.colorNode = a.rgb.mul(o.brightness ?? 1);
  m.opacityNode = a.a;
  return m;
}

/** An instanced impostor mesh for `count` placements (fill with setImpostor). */
export function impostorMesh(atlas: ImpostorAtlas, count: number, mat = impostorMaterial(atlas)): THREE.InstancedMesh {
  const g = new THREE.PlaneGeometry(1, 1);
  g.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
  g.setAttribute('aYaw', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
  const im = new THREE.InstancedMesh(g, mat, count);
  im.frustumCulled = false; im.count = 0;
  const I = new THREE.Matrix4();
  for (let i = 0; i < count; i++) im.setMatrixAt(i, I);
  return im;
}

export function setImpostor(im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, scale: number) {
  const c = im.geometry.getAttribute('aCenter') as THREE.InstancedBufferAttribute, w = im.geometry.getAttribute('aYaw') as THREE.InstancedBufferAttribute;
  c.setXYZW(i, x, y, z, scale); w.setX(i, yaw);
  c.needsUpdate = true; w.needsUpdate = true;
}
