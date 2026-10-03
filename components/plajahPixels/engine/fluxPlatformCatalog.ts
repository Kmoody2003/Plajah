import { MODE_TO_FLUX_SCENE, type VisualizerMode } from '../types';
import { FLUX_SCENES } from '../../../services/fabula/fluxNode';

/** Every built Flux scene, in stable platform-mode order for saved preset indices. */
export const FLUX_PLATFORM_MODES = Object.entries(MODE_TO_FLUX_SCENE).flatMap(([mode,id])=>{
  const scene=FLUX_SCENES.find(s=>s.id===id&&s.built);
  return scene?[{...scene,mode:mode as VisualizerMode}]:[];
});
