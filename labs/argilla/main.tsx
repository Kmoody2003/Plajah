// The real sculpting room with no app around it, and the engine on window for scripted strokes.
//   npx vite --config argilla-lab.vite.config.mjs  ->  http://127.0.0.1:3214/argilla-lab.html
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import ArgillaStudio from '../../components/argilla/ArgillaStudio';
import * as brushes from '../../services/argilla/brushes';
import * as recipe from '../../services/argilla/recipe';
import * as doc from '../../services/argilla/document';
import * as vox from '../../services/argilla/voxelize';
import * as engine from '../../services/argilla/engine';
import * as picture from '../../services/argilla/pictureClay';
import * as npu from '../../services/argilla/npuLane';

import * as codex from '../../services/argilla/creature/codex';
import * as anatomy from '../../services/argilla/creature/anatomy';
import * as exportCreature from '../../services/argilla/creature/exportCreature';
import * as sheet from '../../services/argilla/creature/sheetClay';
import * as run from '../../services/argilla/understand/run';
import * as vocab from '../../services/argilla/understand/vocabulary';
import * as flow from '../../services/argilla/understand/studioFlow';
import * as parts from '../../services/argilla/understand/parts';
import * as align from '../../services/argilla/understand/alignShape';
import * as look from '../../services/argilla/understand/lookAtParts';

// Exports the creature on screen and reads the file back the way another tool would.
async function roundTrip() {
  const stage = (window as any).creature;
  const glb = await exportCreature.creatureToGlb(stage.model, stage.motion.style, 'Round trip');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().parseAsync(await glb.arrayBuffer(), '');
  let skinned = 0, bones = 0, morphs = 0, map = false, triangles = 0;
  gltf.scene.traverse((node: any) => {
    if (!node.isSkinnedMesh) return;
    skinned++;
    bones = node.skeleton.bones.length;
    morphs = Object.keys(node.morphTargetDictionary ?? {}).length;
    map = !!node.material.map;
    triangles = node.geometry.index.count / 3;
  });
  return { megabytes: +(glb.size / 1048576).toFixed(1), skinned, bones, morphs, map, triangles, clips: gltf.animations.map((c: any) => `${c.name} ${c.duration.toFixed(2)}s ${c.tracks.length} tracks`) };
}

(window as any).argillaLab = { brushes, recipe, doc, vox, engine, picture, npu, codex, anatomy, exportCreature, roundTrip, sheet, run, vocab, flow, parts, align, look };
createRoot(document.getElementById('root')!).render(
  <ArgillaStudio initialProjectId={new URLSearchParams(location.search).get('project') ?? undefined} onEngine={(e) => { (window as any).argilla = e; }} onStage={(s) => { (window as any).creature = s; }} onModeling={(m) => { (window as any).modeling = m; }} onScene={(s) => { (window as any).sceneRoom = s; }} />,
);
