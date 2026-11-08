// CadModel <-> three.js: the viewport scene, GLB export (what a Tela document shows) and
// GLB import. Mesh node names are mesh ids, so a reopened GLB lines back up with the JSON.

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { type CadModel, emptyModel } from './model';
import { addMesh, finish } from './mesh';
import { flatten2D } from './dxf';

export interface SceneOptions { hiddenLayers?: Set<string>; hiddenElements?: Set<string>; highlight?: string | null }

/** Z-up sources (STEP, STL, 3MF, DXF) are turned to three.js Y-up at the root. */
export function isZUp(m: CadModel) { return (m.meta.upAxis ?? (m.format === 'ifc' || m.format === 'glb' || m.format === 'gltf' || m.format === 'obj' ? 'Y' : 'Z')) === 'Z'; }

export function modelToGroup(m: CadModel, opts: SceneOptions = {}): THREE.Group {
  const root = new THREE.Group(); root.name = m.name;
  if (isZUp(m)) root.rotation.x = -Math.PI / 2;
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color = '#c9c4d6', opacity = 1, hi = false) => {
    const key = `${color}|${opacity}|${hi}`; let mm = mats.get(key);
    if (!mm) { mm = new THREE.MeshStandardMaterial({ color: hi ? '#ffb020' : color, roughness: 0.62, metalness: 0.05, transparent: opacity < 0.999, opacity, side: THREE.DoubleSide }); mats.set(key, mm); }
    return mm;
  };
  for (const mesh of m.meshes) {
    if (mesh.layer && opts.hiddenLayers?.has(mesh.layer)) continue;
    if (mesh.elementId && opts.hiddenElements?.has(mesh.elementId)) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    if (mesh.normals && mesh.normals.length === mesh.positions.length) g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3)); else g.computeVertexNormals();
    const obj = new THREE.Mesh(g, mat(mesh.color, mesh.opacity ?? 1, !!opts.highlight && mesh.elementId === opts.highlight));
    obj.name = mesh.id; obj.userData = { elementId: mesh.elementId, cadMeshId: mesh.id };
    root.add(obj);
  }
  if (m.is2D) root.add(drawingLines(m, opts.hiddenLayers));
  return root;
}

/** 2D drafting as line segments lying on the XY plane (shown from above in the viewport). */
export function drawingLines(m: CadModel, hiddenLayers?: Set<string>): THREE.Group {
  const f = flatten2D(m, { hiddenLayers }); const group = new THREE.Group(); group.name = 'drawing';
  const byColor = new Map<string, number[]>();
  for (const p of f.paths) {
    const arr = byColor.get(p.color) ?? []; byColor.set(p.color, arr);
    const n = p.pts.length; const segs = p.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) { const a = p.pts[i], b = p.pts[(i + 1) % n]; arr.push(a[0], a[1], 0, b[0], b[1], 0); }
  }
  for (const [color, arr] of byColor) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color })));
  }
  return group;
}

export async function modelToGlb(m: CadModel): Promise<Uint8Array> {
  const scene = new THREE.Scene(); scene.add(modelToGroup({ ...m, is2D: false }));
  const out = await new GLTFExporter().parseAsync(scene, { binary: true });
  return new Uint8Array(out as ArrayBuffer);
}

export async function gltfToModel(bytes: Uint8Array, name: string): Promise<CadModel> {
  const m = emptyModel(name, name.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb', 'three'); m.units = 'm'; m.meta.upAxis = 'Y';
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o: THREE.Object3D) => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const g = (mesh.geometry as THREE.BufferGeometry).clone(); g.applyMatrix4(mesh.matrixWorld);
    const pos = g.getAttribute('position'); const positions = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { positions[i * 3] = pos.getX(i); positions[i * 3 + 1] = pos.getY(i); positions[i * 3 + 2] = pos.getZ(i); }
    const indices = g.index ? new Uint32Array(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: pos.count }, (_, i) => i);
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    addMesh(m, { name: mesh.name || 'Mesh', positions, indices, color: material?.color ? '#' + material.color.getHexString() : undefined, opacity: material?.opacity });
  });
  return finish(m);
}
