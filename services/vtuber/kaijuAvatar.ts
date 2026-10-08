// kaijuAvatar — the Kaiju characters (Lorik & Lumi) as a live VTuber avatar.
//
// A KAIJU2D avatar is the same canvas puppet the Kaiju visualizer uses (components/kaiju/stage2d): the SVG
// art baked once into sprites, drawn each frame under a Pose. Here the Pose's face comes from the person on
// camera via the shared tracker + retargeter (services/vtuber/kaijuFaceMap.ts — every expression the person
// makes comes through, including independent winks, laughing squints, brow tilt/asymmetry, tongue out) and the
// body gets an idle layer (breathing, tail swish, frill flare, a gentle sway that follows the head) so the
// character stays alive even when you hold still. Output is a transparent canvas the engine composites like
// any other avatar (AVATAR_ONLY / PIP / FACE_SWAP / green-screen).
//
// Heavy modules (React figure markup, sprite baker) load lazily — nothing here is imported until a kaiju
// avatar is actually started.

import type { KaijuKind } from '../../components/kaiju/KaijuFigure';
import type { RetargetResult } from './retarget';
import { kaijuPoseFromFace, neutralKaijuPose, type KaijuFaceOptions } from './kaijuFaceMap';

export type KaijuCharacter = 'lorik' | 'lumi';
export type KaijuFraming = 'bust' | 'full';
export interface KaijuAvatarOptions extends KaijuFaceOptions { size?: number; framing?: KaijuFraming; props?: boolean }

export class KaijuAvatarDriver {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private figure: import('../../components/kaiju/stage2d/kaijuCanvasFigure').KaijuCanvasFigure;
  private readonly pose = neutralKaijuPose();
  private t0 = performance.now(); private last = this.t0;
  private blinkAt = 1.5; private blinkT = -9; private tailPhase = 0;
  /** Optional 0..1 voice level: drives the mouth when the camera cannot see it (audio-only VTubing). */
  audioLevel = 0;

  private constructor(
    readonly character: KaijuCharacter,
    figure: import('../../components/kaiju/stage2d/kaijuCanvasFigure').KaijuCanvasFigure,
    private readonly opt: KaijuAvatarOptions,
  ) {
    const size = opt.size ?? 720;
    this.canvas = document.createElement('canvas'); this.canvas.width = size; this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    this.figure = figure;
  }

  static async create(character: KaijuCharacter, opt: KaijuAvatarOptions = {}): Promise<KaijuAvatarDriver> {
    const [{ bakeKaijuSprites, KaijuCanvasFigure }] = await Promise.all([import('../../components/kaiju/stage2d/kaijuCanvasFigure')]);
    const kind: KaijuKind = character;
    const size = opt.size ?? 720, framing = opt.framing ?? 'bust';
    const ppu = Math.max(2.2, Math.min(6, (size / (framing === 'bust' ? 270 : 310)) * 1.25));
    const sprites = await bakeKaijuSprites(kind, kind === 'lumi', ppu);
    return new KaijuAvatarDriver(character, new KaijuCanvasFigure(kind, sprites), opt);
  }

  /** Draw the avatar for this tracker frame. `tracking` false = no face found yet (idle blink + sway). */
  render(face: RetargetResult, tracking: boolean) {
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000), T = (now - this.t0) / 1000; this.last = now;
    const p = this.pose, W = this.canvas.width, H = this.canvas.height;
    if (tracking) kaijuPoseFromFace(face, p, this.opt);
    else {
      // nobody in frame: relaxed grumpy face with the occasional blink and a slow look-around
      if (T > this.blinkAt) { this.blinkT = T; this.blinkAt = T + 1.8 + ((Math.sin(T * 12.9898) * 43758.5453) % 1 + 1) % 1 * 3.4; }
      const bt = T - this.blinkT, blink = bt < 0 ? 0 : bt < 0.055 ? bt / 0.055 : bt < 0.085 ? 1 : bt < 0.185 ? 1 - (bt - 0.085) / 0.1 : 0;
      p.eyeL = p.eyeR = 1 - 0.95 * blink; p.lookX = Math.sin(T * 0.5) * 0.3; p.lookY = Math.sin(T * 0.37) * 0.15;
      p.mouth = 0; p.smile = -0.4; p.brow = 0; p.browY = 0; p.happy = 0; p.squint = 0; p.eyeScale = 1; p.tongue = 0; p.browAsym = 0;
      p.headRot *= 0.9; p.headX *= 0.9; p.headY *= 0.9; p.x *= 0.9; p.rot *= 0.9;
    }
    // voice → mouth when the camera is not driving it
    if (this.audioLevel > 0.04) p.mouth = Math.max(p.mouth, Math.min(1, this.audioLevel * 1.4));

    // idle body: breathing, tail swish that leans into head motion, arms resting with a little sway
    this.tailPhase += dt * (1.6 + Math.abs(p.headRot) * 0.04);
    p.sy = 1 + 0.012 * Math.sin(T * 2 * Math.PI / 3.4); p.sx = 1 - 0.006 * Math.sin(T * 2 * Math.PI / 3.4);
    p.tail = 14 * Math.sin(this.tailPhase) - p.headRot * 0.6;
    p.armL = 12 + 3 * Math.sin(T * 1.3) + Math.max(0, -p.headRot) * 0.3; p.armR = 12 + 3 * Math.sin(T * 1.3 + 1) + Math.max(0, p.headRot) * 0.3;
    p.y = 2 * Math.sin(T * 2 * Math.PI / 3.4);
    p.glow = 0; p.mic = this.opt.props && this.character === 'lorik' ? 1 : 0; p.book = 0; p.camUp = 0;
    if (this.character === 'lumi') p.camUp = 0;

    const ctx = this.ctx, bust = (this.opt.framing ?? 'bust') === 'bust';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    const s = H / (bust ? 270 : 310), top = bust ? 290 : 296;
    ctx.setTransform(s, 0, 0, s, W / 2, top * s);
    ctx.imageSmoothingQuality = 'high';
    this.figure.draw(ctx, p, { shadow: 'rgba(0,0,0,0)', aura: false });
  }

  dispose() { /* sprites are plain canvases — the GC owns them */ }
}
