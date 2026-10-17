// generatorDirector — Director mode for the Cosmos and Fluid generators.
//
// The Flux scenes have a beat-cut camera director (fluxDirector.ts). These generators are 2D, so
// the director drives a virtual camera over the frame instead: each shot (push-in, tight close-up,
// orbit, crane, snap zoom, dutch angle — or the cinematic set: establishing, macro, rack, truck,
// flythrough) becomes a pan, zoom and roll. Cuts land on the beat, drops force a cut, kicks punch
// the lens. The camera only ever crops *into* the frame (zoom ≥ 1, rolled window kept inside), so
// the edge of the scene is never seen.
//
// Director modes are the base mode + "_DIRECTOR". They share the base mode's live simulation, so
// switching between the standard and the directed version never resets the liquid or the gas.

import { FluxDirector } from './fluxDirector';
import { driveFluxAudio, newFluxAudioState } from '../../../../services/fabula/fluxNode';
import type { AudioTexture } from './audioTexture';

export const DIRECTOR_SUFFIX = '_DIRECTOR';

/** "COSMIC_ORION_DIRECTOR" → "COSMIC_ORION"; null when the mode isn't a director mode. */
export function directorBase(mode: string): string | null {
  return mode.endsWith(DIRECTOR_SUFFIX) ? mode.slice(0, -DIRECTOR_SUFFIX.length) : null;
}

/** Which generators get a director version. */
export function hasDirectorVersion(mode: string): boolean {
  return mode.startsWith('COSMIC_') || mode.startsWith('FLUID_') || mode.startsWith('PLANES_') || mode.startsWith('OPTIC_');
}

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUvIn;
void main(){ vUvIn = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;
export const DIRECTOR_VS = VS;

// Every vUv the shader reads is seen through the director's camera.
const CAM = `
uniform vec4 iCam;   // camera centre x, y (aspect space), zoom, roll
vec2 camUv(){
  float ax = iResolution.x / max(iResolution.y, 1.0);
  vec2 s = (vUvIn - 0.5) * vec2(ax, 1.0);
  float c = cos(iCam.w), sn = sin(iCam.w);
  vec2 w = iCam.xy + mat2(c, sn, -sn, c) * s / max(iCam.z, 1.0);
  return w / vec2(ax, 1.0) + 0.5;
}
#define vUv camUv()
`;

/** Turn a generator fragment shader into its directed version. */
export function directorize(src: string): string {
  const anchor = 'uniform float iParam0, iParam1, iParam2, iParam3;';
  if (!src.includes('in vec2 vUv;') || !src.includes(anchor)) return src;
  return src.replace('in vec2 vUv;', 'in vec2 vUvIn;').replace(anchor, anchor + '\n' + CAM);
}

export type CamShot = [cx: number, cy: number, zoom: number, roll: number];

export class GeneratorDirector {
  private flux = new FluxDirector();
  private st = newFluxAudioState();
  constructor(private cinematic: boolean) {}

  /** The camera for this frame at clip time `time`. */
  update(time: number, audio: AudioTexture, aspect: number): CamShot {
    const voice = Math.max(audio.vocal?.[0] ?? 0, audio.vocal?.[1] ?? 0);
    const a = driveFluxAudio(this.st, { bass: audio.bass, mid: audio.mid, treble: audio.treble, level: audio.level, beat: 0, voice }, time, 1.3);
    const s = this.flux.update(a, time, false, this.cinematic);
    let zoom = Math.min(2.8, Math.max(1, 1 / Math.max(0.3, s.radiusMul * s.fovMul)));
    const roll = Math.max(-0.35, Math.min(0.35, s.roll));
    let px = s.tx + (s.yaw / 90) * 0.30;
    let py = s.ty + (s.pitch / 90) * 0.22;
    // Keep the rolled, zoomed window inside the frame: never show past the scene's edge.
    const hx0 = aspect / 2, hy0 = 0.5, c = Math.abs(Math.cos(roll)), sn = Math.abs(Math.sin(roll));
    zoom = Math.max(zoom, (c * hx0 + sn * hy0) / hx0, (sn * hx0 + c * hy0) / hy0);
    const bx = (c * hx0 + sn * hy0) / zoom, by = (sn * hx0 + c * hy0) / zoom;
    px = Math.max(-(hx0 - bx), Math.min(hx0 - bx, px));
    py = Math.max(-(hy0 - by), Math.min(hy0 - by, py));
    return [px, py, zoom, roll];
  }
}
