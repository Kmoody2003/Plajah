// renderWorker — Phase 2: runs the GL compositor + GPU generators OFF the main
// thread on a transferred OffscreenCanvas. The main thread only reads audio +
// posts tiny per-frame descriptors; all the GL work (generator shaders, blend
// composite, grade, present) happens here. This pays off for GPU-native scenes
// (GPU generators + grade); DOM sources (media / Milkdrop / Canvas2D generators /
// overlays) can't cross the thread boundary cheaply and are handled on the main
// thread compositor instead.
//
// Pure GL modules only (no React/DOM) so they run in a worker.

import { Compositor, LayerInput, GradeParams } from './compositor';
import { GeneratorRenderer } from './generators';
import { AudioTexture } from './audioTexture';

const ctx: any = self;

let comp: Compositor | null = null;
let gen: GeneratorRenderer | null = null;
let audioTex: AudioTexture | null = null;

interface GenLayer { id: string; mode: string; opacity: number; blend: string; params: number[]; }

ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      comp = new Compositor(msg.canvas as OffscreenCanvas);
      gen = new GeneratorRenderer(comp.gl);
      audioTex = new AudioTexture(comp.gl);
      ctx.postMessage({ type: 'ready' });
    } catch (err) {
      ctx.postMessage({ type: 'error', message: String(err) });
    }
    return;
  }

  if (msg.type === 'frame' && comp && gen && audioTex) {
    const { width, height, time, grade, freq, wave, layers, colors } = msg as {
      width: number; height: number; time: number; grade: GradeParams;
      freq: Uint8Array; wave: Uint8Array; layers: GenLayer[]; colors: number[][];
    };
    comp.resize(width, height);
    audioTex.updateFromArrays(freq, wave);
    const inputs: LayerInput[] = [];
    for (const L of layers) {
      const tex = gen.render(L.id, L.mode, width, height, { time, audio: audioTex, colors, params: L.params || [] });
      inputs.push({ texture: tex, opacity: L.opacity, blendMode: L.blend });
    }
    comp.render(inputs, grade);
    return;
  }

  if (msg.type === 'dispose') {
    gen?.dispose(); audioTex?.dispose(); comp?.dispose();
    comp = gen = audioTex = null;
  }
};
