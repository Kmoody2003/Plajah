import type { BufferGeometry } from 'three';
import type { Geometry } from '../types';
import { GENERATORS } from './generators';
import { triCount } from './kit';

export { GENERATORS, triCount };

/** Build a fresh geometry for a part. The CALLER owns it and must dispose it (procedural geometry is never shared/cached here). */
export function buildGeometry(g: Geometry, overrides?: Record<string, number | string | boolean>): BufferGeometry {
  if (g.kind !== 'procedural') throw new Error('GLB geometry is loaded by the viewer (shared/cached assets are never disposed here)');
  const gen = GENERATORS[g.generator];
  if (!gen) throw new Error(`Unknown generator: ${g.generator}`);
  return gen({ ...g.params, ...(overrides || {}) });
}
