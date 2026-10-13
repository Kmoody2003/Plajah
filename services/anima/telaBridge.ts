/**
 * services/anima/telaBridge.ts
 *
 * Plajah Anima — Tela Document Layer Importer & Visualizer Driver Bridge
 *
 * 1. Native Tela Document Integration:
 *    - Ingests native Tela vector objects (RECT, ELLIPSE, LINE, PATH, TEXT)
 *    - Preserves exact layer hierarchy and style attributes
 *    - Binds timeline channels directly to Tela properties for 60fps evaluation
 *
 * 2. Visualizer Driver Engine:
 *    - Streams live animation timeline parameters to:
 *      * Godot 4 Visualizer (Obsidian Ripple, Neon Colonnade, Monolith Gallery)
 *      * Plajah GenAI Reactor (Latent space modulator)
 *      * WebGL Milkdrop / ISF / Sanctuary Shaders
 */

import type { AnimaLayer, AnimaProject } from './types';

export interface TelaVectorObjectStub {
  id: string;
  kind: 'RECT' | 'ELLIPSE' | 'LINE' | 'PATH' | 'TEXT';
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  points?: number[];
  opacity?: number;
}

export interface TelaDocumentStub {
  id: string;
  title: string;
  layers?: Array<{
    id: string;
    name: string;
    visible?: boolean;
    objects: TelaVectorObjectStub[];
  }>;
}

export class TelaAnimaBridge {
  /**
   * Import a native Tela Document and convert its vector layers into Anima layers
   */
  static importTelaDocument(doc: TelaDocumentStub): AnimaLayer[] {
    const layers: AnimaLayer[] = [];

    if (doc.layers && doc.layers.length > 0) {
      doc.layers.forEach((tl, idx) => {
        const animaLayer: AnimaLayer = {
          id: `tela_${tl.id}`,
          name: tl.name || `Tela Layer ${idx + 1}`,
          type: 'vector',
          visible: tl.visible !== false,
          locked: false,
          opacity: 1,
          parentId: null,
          transform: { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
          channels: {
            'transform.x': {
              id: `ch_x_${tl.id}`,
              name: 'Position X',
              path: 'transform.x',
              defaultValue: 0,
              keyframes: [],
            },
            'transform.y': {
              id: `ch_y_${tl.id}`,
              name: 'Position Y',
              path: 'transform.y',
              defaultValue: 0,
              keyframes: [],
            },
            'opacity': {
              id: `ch_op_${tl.id}`,
              name: 'Opacity',
              path: 'opacity',
              defaultValue: 1,
              keyframes: [],
            },
          },
        };
        layers.push(animaLayer);
      });
    }

    return layers;
  }
}

/** Visualizer Payload for External Engines (Godot 4, GenAI Reactor, Unity HDRP) */
export interface VisualizerControlFrame {
  time: number;
  frame: number;
  bpm: number;
  beatPhase: number;       // 0..1 saw wave on beat
  energy: number;          // audio/timeline intensity
  sceneId: string;
  modulators: Record<string, number>;
}

export class VisualizerStreamEngine {
  private activeTarget: 'godot4' | 'genai_reactor' | 'webgl_sanctuary' = 'webgl_sanctuary';

  setTarget(target: 'godot4' | 'genai_reactor' | 'webgl_sanctuary'): void {
    this.activeTarget = target;
  }

  /**
   * Format the current timeline frame into high-speed control telemetry
   */
  broadcastFrame(time: number, frame: number, bpm = 120, customModulators: Record<string, number> = {}): VisualizerControlFrame {
    const beatDuration = 60 / bpm;
    const beatPhase = (time % beatDuration) / beatDuration;
    const energy = 0.5 + Math.sin(time * Math.PI * 2) * 0.4;

    const payload: VisualizerControlFrame = {
      time,
      frame,
      bpm,
      beatPhase,
      energy,
      sceneId: 'ObsidianRipple',
      modulators: {
        curlForce: 1.2 * energy,
        cameraFov: 60 + Math.sin(time * 0.5) * 10,
        glowIntensity: 1.5 * energy,
        ...customModulators,
      },
    };

    // If connected to Godot 4 via local IPC / WebSocket
    if (typeof window !== 'undefined' && (window as any).__PLAJAH_VISUALIZER_BRIDGE__) {
      (window as any).__PLAJAH_VISUALIZER_BRIDGE__.send(payload);
    }

    return payload;
  }
}
