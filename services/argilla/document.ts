/**
 * document.ts — saving a sculpt, and the file Tela documents point at.
 *
 * A `.argilla` file is the sparse field, gzipped, with distances quantized to 16 bits across the
 * band. The project record syncs through Creative Cloud as JSON. The field itself lives on-device
 * and, when signed in, in the user's Tela storage, with the URL kept in the record.
 */

import { BRICK_STRIDE } from './brickPool';
import type { ClayFieldSnapshot } from './engine';

const MAGIC = 0x4c475241; // "ARGL"
const FORMAT = 1;

async function gzip(data: Uint8Array, mode: 'compress' | 'decompress'): Promise<Uint8Array> {
  const stream = mode === 'compress' ? new CompressionStream('gzip') : new DecompressionStream('gzip');
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeField(field: ClayFieldSnapshot): Promise<Blob> {
  const header = new Float32Array(1);
  header[0] = field.band;
  const ints = new Uint32Array([MAGIC, FORMAT, field.grid, field.cells.length]);
  const quant = new Int16Array(field.values.length);
  for (let i = 0; i < quant.length; i++) {
    quant[i] = Math.round(Math.max(-1, Math.min(1, field.values[i] / field.band)) * 32767);
  }
  const size = ints.byteLength + header.byteLength + field.states.byteLength + field.cells.byteLength + quant.byteLength;
  const raw = new Uint8Array(size);
  let at = 0;
  const put = (v: ArrayBufferView) => {
    raw.set(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), at);
    at += v.byteLength;
  };
  put(ints);
  put(header);
  // Keep the 4-byte alignment the cell list needs when it is read back.
  put(field.cells);
  put(field.states);
  put(quant);
  return new Blob([await gzip(raw, 'compress') as BlobPart], { type: 'application/x-plajah-argilla' });
}

export async function decodeField(blob: Blob): Promise<ClayFieldSnapshot> {
  const raw = await gzip(new Uint8Array(await blob.arrayBuffer()), 'decompress');
  const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const ints = new Uint32Array(buffer, 0, 4);
  if (ints[0] !== MAGIC) throw new Error('This is not a Plajah 3D sculpt.');
  if (ints[1] > FORMAT) throw new Error('This sculpt was saved by a newer version of Plajah.');
  const grid = ints[2];
  const brickCount = ints[3];
  const band = new Float32Array(buffer, 16, 1)[0];
  let at = 20;
  const cells = new Uint32Array(buffer.slice(at, at + brickCount * 4));
  at += brickCount * 4;
  const states = new Uint8Array(buffer.slice(at, at + grid ** 3));
  at += grid ** 3;
  const samples = brickCount * BRICK_STRIDE ** 3;
  const quant = new Int16Array(buffer.slice(at, at + samples * 2));
  const values = new Float32Array(samples);
  for (let i = 0; i < samples; i++) values[i] = (quant[i] / 32767) * band;
  return { grid, band, states, cells, values };
}

/** Triangles to a binary glTF, which is what Tela's 3D media and every other tool read. */
export async function meshToGlb(
  mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array },
  name: string,
): Promise<Blob> {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  const out = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#b5aea6', roughness: 0.65 }));
  out.name = name;
  const result = await new GLTFExporter().parseAsync(out, { binary: true });
  geo.dispose();
  return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
}

/** All triangles of a GLB in one pair of arrays, world transforms applied. */
export async function glbToTriangles(glb: Blob): Promise<{ positions: Float32Array; indices: Uint32Array }> {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().parseAsync(await glb.arrayBuffer(), '');
  gltf.scene.updateMatrixWorld(true);
  const positions: number[] = [];
  const indices: number[] = [];
  const v = new THREE.Vector3();
  gltf.scene.traverse((node) => {
    const mesh = node as import('three').Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) return;
    const base = positions.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      positions.push(v.x, v.y, v.z);
    }
    const index = mesh.geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) indices.push(base + i);
  });
  if (!indices.length) throw new Error('That file has no triangles to sculpt.');
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
