import type { TelaVectorObject } from '../../../../types';
import type { TelaCreativeTemplate } from '../../../telaCreativeEngine';
import type { Frame } from '../../templateKit';

export interface CreativeCtx {
  template: TelaCreativeTemplate;
  W: number; H: number; fr: Frame;
  /** template.palette = [ground, primary, accent]. */
  ground: string; primary: string; accent: string;
  seed: number;
}
/** One designer per template NAME (ids are positional). */
export type CreativeDesigner = (ctx: CreativeCtx) => TelaVectorObject[];
