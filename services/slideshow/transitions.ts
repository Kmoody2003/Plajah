// Themed Shows — transitions from Fabula's library.
//
// Fabula's registry transitions (components/plajahPixels/engine/fx/phase3Transitions.ts) are
// data: each defines `vec4 tx(vec2 uv, float p)` over an outgoing and an incoming frame with
// up to four params. The show compiles the same GLSL into a full-screen pass, so a cut in a
// show and a cut in Fabula are the same shader. Each theme has a palette the planner picks
// from automatically ("auto"), and the owner can pin any transition and its length.

import * as THREE from 'three';
import { PHASE3_TRANSITIONS, TX_HEADER, TX_MAIN, type TransitionDef } from '../../components/plajahPixels/engine/fx/phase3Transitions';
import type { ShowThemeId } from './types';

export const SHOW_TRANSITIONS = PHASE3_TRANSITIONS;
export const transitionById = (id: string) => PHASE3_TRANSITIONS.find((t) => t.id === id);

/**
 * Theme palettes, chosen for each theme's feeling: the Back Yard memorial gets soft light
 * and graceful dissolves (no wipes, no shatter); Classic gets clean editorial cuts.
 * [id, preset id | undefined]
 */
export const THEME_TRANSITIONS: Record<ShowThemeId, [string, string?][]> = {
  'backyard': [['exposure-blur', 'bloom'], ['dissolve-diffuse'], ['glint-dissolve'], ['dolly-fade'], ['exposure-blur', 'cool-haze']],
  'lantern-garden': [['exposure-blur', 'bloom'], ['glint-dissolve'], ['dissolve-diffuse']],
  'classic': [['dolly-fade'], ['exposure-blur', 'bloom'], ['dissolve-diffuse'], ['glint-dissolve'], ['film-burn']],
};

/** "id" or "id:preset" → the transition and its params. */
export function resolveTransition(ref: string): { def: TransitionDef; params: number[] } | null {
  const [id, preset] = ref.split(':');
  const def = transitionById(id);
  if (!def) return null;
  const pre = preset ? def.presets.find((p) => p.id === preset) : undefined;
  const params = def.params.map((p) => (pre?.params?.[p.key] ?? p.default) as number);
  while (params.length < 4) params.push(0);
  return { def, params };
}

/** Deterministic auto pick for cut k in a theme. */
export function autoTransition(theme: ShowThemeId, k: number): string {
  const pal = THEME_TRANSITIONS[theme] || THEME_TRANSITIONS.classic;
  const [id, preset] = pal[k % pal.length];
  return preset ? `${id}:${preset}` : id;
}

const VS = `in vec3 position; in vec2 uv; out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/**
 * Two render targets + one compiled program per transition. Render the outgoing frame into
 * `outgoing`, the incoming into `incoming`, then `blend(ref, p)` draws the cut to the canvas.
 * Targets are sRGB-encoded, matching the Fabula pipeline's sRGB inputs.
 */
export class TransitionPass {
  readonly outgoing: THREE.WebGLRenderTarget;
  readonly incoming: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private programs = new Map<string, THREE.RawShaderMaterial>();
  private t0 = performance.now();

  constructor(private renderer: THREE.WebGLRenderer, w: number, h: number) {
    const mk = () => {
      const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      return rt;
    };
    this.outgoing = mk();
    this.incoming = mk();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setSize(w: number, h: number) { this.outgoing.setSize(w, h); this.incoming.setSize(w, h); }

  private program(def: TransitionDef) {
    let m = this.programs.get(def.id);
    if (!m) {
      const header = TX_HEADER.replace('#version 300 es', '').replace('in vec2 vUv;', 'in vec2 vUv;');
      m = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: VS,
        fragmentShader: header + '\n' + def.glsl + TX_MAIN,
        uniforms: {
          uOutgoing: { value: null }, uIncoming: { value: null }, uResolution: { value: new THREE.Vector2() },
          uProgress: { value: 0 }, uTime: { value: 0 }, P0: { value: 0 }, P1: { value: 0 }, P2: { value: 0 }, P3: { value: 0 },
        },
        depthTest: false, depthWrite: false,
      });
      this.programs.set(def.id, m);
    }
    return m;
  }

  /** Draw the transition at progress p (0..1) to the current render target (the canvas). */
  blend(ref: string, p: number, time?: number) {
    const tr = resolveTransition(ref) || resolveTransition('dolly-fade')!;
    const m = this.program(tr.def);
    const u = m.uniforms;
    u.uOutgoing.value = this.outgoing.texture;
    u.uIncoming.value = this.incoming.texture;
    u.uResolution.value.set(this.outgoing.width, this.outgoing.height);
    u.uProgress.value = p;
    u.uTime.value = time ?? (performance.now() - this.t0) / 1000;
    u.P0.value = tr.params[0]; u.P1.value = tr.params[1]; u.P2.value = tr.params[2]; u.P3.value = tr.params[3];
    this.quad.material = m;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
    r.setRenderTarget(prev);
  }

  dispose() {
    this.outgoing.dispose(); this.incoming.dispose();
    for (const m of this.programs.values()) m.dispose();
    this.quad.geometry.dispose();
  }
}
