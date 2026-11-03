// Turns a generated mesh to the picture and into clay, off the main thread: the page stays usable, and a hidden tab
// doesn't throttle it the way it throttles anything that yields with timers.
import { alignToPicture, AlignTarget } from './alignShape';
import { voxelizeMesh } from '../voxelize';

type Job =
  | { kind: 'align'; positions: Float32Array; indices: Uint32Array; target: AlignTarget }
  | { kind: 'voxelize'; positions: Float32Array; indices: Uint32Array; grid: number };

self.onmessage = async ({ data }: MessageEvent<Job>) => {
  try {
    if (data.kind === 'align') {
      self.postMessage({ alignment: await alignToPicture(data.positions, data.indices, data.target) });
    } else {
      const field = await voxelizeMesh(data.positions, data.indices, { grid: data.grid, inPlace: true });
      (self as unknown as Worker).postMessage({ field }, [field.states.buffer, field.cells.buffer, field.values.buffer] as ArrayBuffer[]);
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Could not work on this shape.' });
  }
};
