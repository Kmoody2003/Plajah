// Paints and bakes one object off the main thread.
import { finishObject } from './finishObject';
import type { LinePictureSource } from './finishRun';
import type { ClayFieldSnapshot } from '../engine';

self.onmessage = ({ data }: MessageEvent<{ field: ClayFieldSnapshot; source: LinePictureSource | null; textureSize: number; fine?: boolean }>) => {
  try {
    const { field, source, textureSize, fine } = data;
    const made = finishObject(field, source && {
      ...source,
      toU: (x: number) => source.u0 + x * source.uk,
      toV: (y: number) => source.v0 + y * source.vk,
    }, '#9a958c', textureSize, fine);
    (self as unknown as Worker).postMessage({ made }, [made.mesh.positions.buffer, made.mesh.normals.buffer, made.mesh.indices.buffer, made.uvs.buffer, made.texture.buffer, made.normalMap.buffer, ...(made.surface ? [made.surface.buffer] : []), ...(made.triangleParts ? [made.triangleParts.buffer] : [])] as ArrayBuffer[]);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Could not finish this object.' });
  }
};
