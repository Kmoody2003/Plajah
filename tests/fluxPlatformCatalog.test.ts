import test from 'node:test';
import assert from 'node:assert/strict';
import { FLUX_SCENES,normalizeFluxSpec } from '../services/fabula/fluxNode';
import { FLUX_MATH_SCENES } from '../services/fabula/fluxMathCatalog';
import { MODE_TO_FLUX_SCENE,FLUX_SCENE_TO_MODE,isFluxMode,VisualizerMode } from '../components/plajahPixels/types';
import { FLUX_PLATFORM_MODES } from '../components/plajahPixels/engine/fluxPlatformCatalog';
import { SCENE_CATALOG } from '../components/plajahPixels/engine/sceneCatalog';

test('all twelve math scenes and Odyssey round-trip through platform modes and shared pickers',()=>{
  for(const id of [...FLUX_MATH_SCENES.map(s=>s.id),'math-morph']){
    const mode=FLUX_SCENE_TO_MODE[id];assert.ok(mode,`${id} has a persisted platform mode`);
    assert.ok(isFluxMode(mode));assert.equal(MODE_TO_FLUX_SCENE[mode],id);
    assert.equal(normalizeFluxSpec({scene:id as any}).scene,id);
    assert.equal(FLUX_PLATFORM_MODES.filter(s=>s.id===id).length,1);
    const entry=SCENE_CATALOG.find(s=>s.mode===mode);assert.ok(entry);
    assert.equal(entry.kind,'three');assert.ok(entry.cat.startsWith('Flux ·'));
  }
});
test('every built Flux scene is offered once and existing FX preset indices remain stable',()=>{
  assert.deepEqual(new Set(FLUX_PLATFORM_MODES.map(s=>s.id)),new Set(FLUX_SCENES.filter(s=>s.built).map(s=>s.id)));
  assert.equal(FLUX_PLATFORM_MODES.length,new Set(FLUX_PLATFORM_MODES.map(s=>s.mode)).size);
  assert.equal(FLUX_PLATFORM_MODES[0].mode,VisualizerMode.FluxField);
  assert.equal(FLUX_PLATFORM_MODES[15].mode,VisualizerMode.AfricanBogolan);
  assert.equal(FLUX_PLATFORM_MODES.length,29);
});
