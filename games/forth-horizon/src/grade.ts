// Colour grading and lenses for the game, the same looks as the platform's video playback: the cinematic LUT library (services/color) as a real 3D LUT, and the film and tape
// lens shaders (services/lenses: silent film, grindhouse, VHS camcorder, found footage, night vision) run on the finished frame. Runs after tone mapping, so the LUTs and
// lenses see the display-referred picture they were made for.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CINEMATIC_LUTS, type CinematicLut } from '../../../services/color/cinematicLutLibrary';
import { SILENT_FRAG, GRINDHOUSE_FRAG, VHS_FRAG, FOUND_FRAG } from '../../../services/lenses/lensShadersFilm';
import { NIGHT_FRAG } from '../../../services/lenses/lensShaders';

export type GameLens = 'none' | 'silent' | 'grindhouse' | 'vhs' | 'found' | 'night';
export const GAME_LENSES: { id: GameLens; label: string }[] = [
  { id: 'none', label: 'Off' }, { id: 'silent', label: 'Silent film' }, { id: 'grindhouse', label: 'Grindhouse' }, { id: 'vhs', label: 'VHS camcorder' },
  { id: 'found', label: 'Found footage' }, { id: 'night', label: 'Night vision' },
];
export const GAME_LUTS: { id: string; label: string }[] = CINEMATIC_LUTS.map((l) => ({ id: l.id, label: `${l.name}` }));

const FRAGS: Record<Exclude<GameLens, 'none'>, string> = { silent: SILENT_FRAG, grindhouse: GRINDHOUSE_FRAG, vhs: VHS_FRAG, found: FOUND_FRAG, night: NIGHT_FRAG };
const HOLD_FPS: Record<Exclude<GameLens, 'none'>, number> = { silent: 16, grindhouse: 18, vhs: 30, found: 30, night: 60 };

const VERT = `
in vec3 position; in vec2 uv; uniform float uFlip; out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.x, position.y * uFlip, 0.0, 1.0); }`;
const BLIT = `
precision highp float; precision highp sampler3D;
in vec2 vUv; out vec4 frag;
uniform sampler2D tSrc; uniform sampler3D tLut; uniform float uLut;
void main() {
  vec3 c = texture(tSrc, vUv).rgb;
  if (uLut > 0.001) { vec3 l = texture(tLut, clamp(c, 0.0, 1.0) * (16.0 / 17.0) + 0.5 / 17.0).rgb; c = mix(c, l, uLut); }
  frag = vec4(c, 1.0);
}`;

function lutTexture(lut: CinematicLut): THREE.Data3DTexture {
  const S = 17, data = new Uint8Array(S * S * S * 4);
  let i = 0;
  for (let b = 0; b < S; b++) for (let g = 0; g < S; g++) for (let r = 0; r < S; r++) {
    const [R, G, B] = lut.rgbTransfer(r / (S - 1), g / (S - 1), b / (S - 1));
    data[i++] = Math.round(Math.min(1, Math.max(0, R)) * 255); data[i++] = Math.round(Math.min(1, Math.max(0, G)) * 255); data[i++] = Math.round(Math.min(1, Math.max(0, B)) * 255); data[i++] = 255;
  }
  const t = new THREE.Data3DTexture(data, S, S, S);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.LinearFilter; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}
const raw = (frag: string, uniforms: Record<string, { value: unknown }>): THREE.RawShaderMaterial => new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag.replace(/^#version 300 es\s*/, ''), uniforms, depthTest: false, depthWrite: false, side: THREE.DoubleSide,     // the flip reverses the triangle's winding: do not cull it
});

export class GradePass extends Pass {
  lut = 'none'; lutAmount = 1; lens: GameLens = 'none';
  /** 0..1 how hard the car is going: the found-footage lens shakes with it */
  speed = 0;
  private A: THREE.WebGLRenderTarget; private Bt: THREE.WebGLRenderTarget;
  private quad = new FullScreenQuad();
  private blit: THREE.RawShaderMaterial;
  private lens3: Partial<Record<GameLens, THREE.RawShaderMaterial>> = {};
  private luts = new Map<string, THREE.Data3DTexture>();
  private empty = new THREE.Data3DTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, 1);
  private t = 0;
  private held = { frame: -1, n: 0 };

  constructor(w: number, h: number) {
    super();
    this.needsSwap = true;
    this.empty.format = THREE.RGBAFormat; this.empty.type = THREE.UnsignedByteType; this.empty.needsUpdate = true;
    this.A = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false });
    this.Bt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.blit = raw(BLIT, { tSrc: { value: null }, tLut: { value: this.empty }, uLut: { value: 0 }, uFlip: { value: 1 } });
  }
  setSize(w: number, h: number): void { this.A.setSize(w, h); this.Bt.setSize(w, h); }
  get active(): boolean { return this.lens !== 'none' || (this.lut !== 'none' && this.lutAmount > 0.001); }

  private lensMat(id: Exclude<GameLens, 'none'>): THREE.RawShaderMaterial {
    let m = this.lens3[id];
    if (!m) {
      m = raw(FRAGS[id], {
        uTex: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uT: { value: 0 }, uSeed: { value: 0 }, uFlip: { value: 1 },
        uEvt: { value: new THREE.Vector4(0, 0, 0, 1) }, uReel: { value: new THREE.Vector4(0.35, 0.25, 0.3, 0) },
        uCam: { value: new THREE.Vector4(0, 0, 0, 1) }, uVel: { value: new THREE.Vector2(0, 0) }, uFocus: { value: 0 }, uExpo: { value: 1 }, uGlitch: { value: 0 },
      });
      this.lens3[id] = m;
    }
    return m;
  }
  private lutTex(id: string): THREE.Data3DTexture | null {
    let t = this.luts.get(id);
    if (!t) { const l = CINEMATIC_LUTS.find((x) => x.id === id); if (!l) return null; t = lutTexture(l); this.luts.set(id, t); }
    return t;
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number): void {
    this.t += deltaTime;
    const out = this.renderToScreen ? null : writeBuffer;
    const lutTex = this.lut !== 'none' ? this.lutTex(this.lut) : null;
    const lutAmt = lutTex ? this.lutAmount : 0;
    const b = this.blit.uniforms;
    if (this.lens === 'none') {
      // grade only: one pass straight to the output (the texture's rows run the same way, so no flip)
      b.tSrc.value = readBuffer.texture; b.tLut.value = lutTex ?? this.empty; b.uLut.value = lutAmt; b.uFlip.value = 1;
      this.quad.material = this.blit;
      renderer.setRenderTarget(out); this.quad.render(renderer);
      return;
    }
    const size = new THREE.Vector2(); renderer.getDrawingBufferSize(size);
    // the lens shaders expect the picture top row first: flip into A (mipmapped), run the lens into B, flip back out with the grade
    b.tSrc.value = readBuffer.texture; b.tLut.value = this.empty; b.uLut.value = 0; b.uFlip.value = -1;
    this.quad.material = this.blit;
    renderer.setRenderTarget(this.A); this.quad.render(renderer);
    const id = this.lens as Exclude<GameLens, 'none'>;
    const m = this.lensMat(id), u = m.uniforms;
    const frame = Math.floor(this.t * HOLD_FPS[id]);
    u.uTex.value = this.A.texture; (u.uRes.value as THREE.Vector2).copy(size); u.uT.value = this.t; u.uSeed.value = frame; u.uFlip.value = 1;
    if (id === 'found') {
      const k = 0.0035 * (0.3 + this.speed);
      (u.uVel.value as THREE.Vector2).set((Math.sin(this.t * 9.1) + Math.sin(this.t * 17.3)) * k, (Math.sin(this.t * 11.7) + Math.sin(this.t * 23.9)) * k * 0.7);
      (u.uCam.value as THREE.Vector4).set(Math.sin(this.t * 3.1) * 0.004 * (1 + this.speed), Math.cos(this.t * 2.7) * 0.004 * (1 + this.speed), Math.sin(this.t * 1.9) * 0.006, 1.03);
      u.uFocus.value = 0.2; u.uGlitch.value = 0;
    }
    this.quad.material = m;
    renderer.setRenderTarget(this.Bt); this.quad.render(renderer);
    b.tSrc.value = this.Bt.texture; b.tLut.value = lutTex ?? this.empty; b.uLut.value = lutAmt; b.uFlip.value = -1;
    this.quad.material = this.blit;
    renderer.setRenderTarget(out); this.quad.render(renderer);
  }
  dispose(): void { this.A.dispose(); this.Bt.dispose(); this.blit.dispose(); this.quad.dispose(); for (const m of Object.values(this.lens3)) m?.dispose(); for (const t of this.luts.values()) t.dispose(); }
}
