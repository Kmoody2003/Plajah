// telaVectorForge.ts — Generates 2D illustrations and converts them into native, editable Tela vectors.
// Bridges Plajah's on-device generative runtime directly with Tela's vector engine (TelaVectorObject / TelaVectorNode).

import { executePlajahNativeTask } from './plajahNativeRunner';
import { PlajahNativeTask } from './plajahPipelineEngine';
import { traceBitmapToTela, TelaTracePreset } from '../telaImageTrace';
import type { TelaVectorObject } from '../../types';

export interface VectorForgeRequest {
  prompt: string;
  style: 'flat_vector' | 'bold_comic' | 'vintage_poster' | 'minimal_icon' | 'storybook_woodcut';
  paletteHint?: string;
  tracePreset?: TelaTracePreset; // 'LOGO' | 'LINE_ART' | 'DETAILED'
  maxLayers?: number;
}

export interface VectorForgeResult {
  ok: boolean;
  bitmapUrl?: string;
  vectorObjects: TelaVectorObject[];
  svgString?: string;
  durationMs: number;
  error?: string;
}

/** Converts array of TelaVectorObject to standard SVG XML string */
export function telaVectorsToSvg(objects: TelaVectorObject[], width = 1024, height = 1024): string {
  const paths = objects.map((obj) => {
    // Generate path element with stroke, fill, opacity
    const fill = obj.fill || '#000000';
    const stroke = obj.stroke && obj.stroke !== 'none' ? `stroke="${obj.stroke}" stroke-width="${obj.strokeWidth || 1}"` : '';
    const opacity = obj.opacity !== undefined ? `opacity="${obj.opacity}"` : '';
    return `<path d="${obj.svgPathData || ''}" fill="${fill}" ${stroke} ${opacity} />`;
  }).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n  ${paths}\n</svg>`;
}

/** Master generation + vectorization pipeline */
export async function forgeVectorArt(
  req: VectorForgeRequest,
  onStatusUpdate?: (status: string) => void
): Promise<VectorForgeResult> {
  const start = performance.now();
  onStatusUpdate?.('Generating flat illustration with Plajah Native Engine…');

  const task: PlajahNativeTask = {
    id: `plajah_vector_${Date.now()}`,
    taskType: 'vector_art',
    modelId: 'animagine_xl',
    prompt: `${req.prompt}, ${req.style} illustration, clean crisp outlines, flat vector graphic, vibrant clean solid fills, svg asset`,
    negativePrompt: 'photorealistic, blurry, 3d, gradient shading, noise, messy sketch',
    dimensions: { width: 1024, height: 1024 },
    steps: 25,
    cfgScale: 7.0,
    seed: Math.floor(Math.random() * 2147483647),
  };

  // Step 1: Generate clean 2D artwork natively
  const genRes = await executePlajahNativeTask(task);

  if (!genRes.success || !genRes.mediaUrl) {
    return {
      ok: false,
      vectorObjects: [],
      durationMs: Math.round(performance.now() - start),
      error: genRes.error || 'Failed to generate bitmap for vectorization',
    };
  }

  const bitmapUrl = genRes.mediaUrl;
  onStatusUpdate?.('Tracing raster into editable Bézier vector curves…');

  // Step 2: Trace into native Tela vector nodes using Tela's existing ImageTracer engine
  try {
    const traceResult = await traceBitmapToTela(bitmapUrl, req.tracePreset || 'LOGO', {
      layerMode: 'EDITABLE_CONTOURS',
      maxLayers: req.maxLayers || 36,
      dropPaperWhite: true,
      maxNodesPerLayer: 60,
    });

    const vectorObjects = traceResult.objects;
    const svgString = traceResult.previewSvg || telaVectorsToSvg(vectorObjects, 1024, 1024);

    return {
      ok: true,
      bitmapUrl,
      vectorObjects,
      svgString,
      durationMs: Math.round(performance.now() - start),
    };
  } catch (err: any) {
    return {
      ok: false,
      bitmapUrl,
      vectorObjects: [],
      durationMs: Math.round(performance.now() - start),
      error: `Vector tracing failed: ${err.message}`,
    };
  }
}
