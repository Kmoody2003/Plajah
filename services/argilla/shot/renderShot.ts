/**
 * renderShot.ts — a shot to video, frame-exact, off screen. Each frame puts the camera where the path says at
 * exactly frame / fps and renders the same three.js scene the room shows, at the output size, into an encoder
 * (mediabunny, as Anima's export does). Nothing on screen changes while it runs.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { cameraAt, type Shot } from './shot';
import { pickVideoCodec } from '../../anima/exportAnima';

export class RenderCancelled extends Error {
  constructor() { super('Render cancelled'); }
}

export interface RenderShotOptions {
  width?: number;
  height?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** Called before and after the render so the room can hide its gizmos. */
  prepare?: (rendering: boolean) => void;
}

export interface RenderedShot { blob: Blob; mime: string; width: number; height: number; fps: number; seconds: number }

/** MP4 (H.264) when the browser can, else WebM: Fabula and most editors read either. */
export async function renderShot(scene: THREE.Scene, shot: Shot, o: RenderShotOptions = {}): Promise<RenderedShot> {
  if (!shot.camera.length) throw new Error('Give the shot a camera move first.');
  const width = Math.round((o.width ?? 1920) / 2) * 2, height = Math.round((o.height ?? 1080) / 2) * 2;
  const { Output, BufferTarget, WebMOutputFormat, Mp4OutputFormat, CanvasSource, QUALITY_HIGH } = await import('mediabunny');
  let format: 'mp4' | 'webm' = 'mp4';
  let codec = await pickVideoCodec('mp4', width, height);
  if (!codec) { format = 'webm'; codec = await pickVideoCodec('webm', width, height); }
  if (!codec) throw new Error("This browser can't encode video. Open Plajah 3D in the Plajah desktop app.");

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.01, 1000);
  // The room's reflection map lives in the room's GL context; this renderer needs its own or metal goes black.
  const roomEnvironment = scene.environment;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = roomEnvironment ? pmrem.fromScene(new RoomEnvironment(), 0.04).texture : null;
  pmrem.dispose();

  const target = new BufferTarget();
  const output = new Output({ format: format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: shot.fps });
  const total = Math.max(1, Math.round(shot.seconds * shot.fps));
  o.prepare?.(true);
  if (environment) scene.environment = environment;
  await output.start();
  try {
    for (let i = 0; i < total; i++) {
      if (o.signal?.aborted) throw new RenderCancelled();
      const at = cameraAt(shot.camera, i / shot.fps)!;
      camera.position.set(...at.position);
      camera.fov = at.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(...at.target);
      renderer.render(scene, camera);
      await source.add(i / shot.fps, 1 / shot.fps);
      o.onProgress?.(i + 1, total);
      // Let the page breathe on long renders.
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    scene.environment = roomEnvironment;
    environment?.dispose();
    o.prepare?.(false);
    renderer.dispose();
  }
  const mime = format === 'webm' ? 'video/webm' : 'video/mp4';
  return { blob: new Blob([target.buffer!], { type: mime }), mime, width, height, fps: shot.fps, seconds: total / shot.fps };
}
