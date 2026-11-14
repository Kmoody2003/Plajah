// Finishes a creature off the main thread: skinning 60k vertices against the field takes seconds.
import type { ClayFieldSnapshot } from '../engine';
import type { Anatomy } from './anatomy';
import type { SurfaceBrief } from './codex';
import { finishCreature, type FinishOptions } from './finish';

self.onmessage = ({ data }: MessageEvent<{ field: ClayFieldSnapshot; anatomy: Anatomy; surface: SurfaceBrief; options: FinishOptions }>) => {
  try {
    const model = finishCreature(data.field, data.anatomy, data.surface, {
      ...data.options,
      onProgress: (fraction, label) => self.postMessage({ fraction, label }),
    });
    const buffers = [
      model.positions, model.normals, model.uvs, model.indices, model.skinIndex, model.skinWeight, model.furLength, model.furDir, model.texture, ...(model.normalMap ? [model.normalMap] : []),
      ...model.muscles.flatMap((m) => [m.verts, m.amounts]),
    ].map((a) => a.buffer as ArrayBuffer);
    (self as unknown as Worker).postMessage({ model }, buffers);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Could not finish this creature.' });
  }
};
