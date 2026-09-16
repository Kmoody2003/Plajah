import type { FontKey } from '../../tela/telaFonts';
import type { Ctx } from './kit';

/**
 * One hand-authored broadcast identity.
 *
 * The three primary formats are written out in full. The other six are derived from the
 * identity's own vocabulary — its type trio, its `mark`, its `field`, its palette — by
 * index.ts, so a bug or a score strip is still unmistakably this identity and not a shared
 * template with the colours swapped. An identity may override any derived format when its
 * idea demands a different answer (a scoreboard sport, a stencil transition).
 */
export interface BroadcastDesign {
  /** display / text / utility — chosen for the movement, two or three families */
  type: { display: FontKey; text: FontKey; utility: FontKey };
  /** the one idea, said in a sentence a designer would say */
  idea: string;
  opener(c: Ctx): string;
  lowerThird(c: Ctx): string;
  fullPage(c: Ctx): string;
  /** the identity's signature mark, drawn to fit a `size` box centred on (cx, cy) */
  mark(c: Ctx, cx: number, cy: number, size: number): string;
  /** the identity's ornament field across a box — what the derived formats are built on */
  field(c: Ctx, x: number, y: number, w: number, h: number, intensity?: number): string;
  bug?(c: Ctx): string;
  stinger?(c: Ctx): string;
  transition?(c: Ctx): string;
  scoreStrip?(c: Ctx): string;
  overlay?(c: Ctx): string;
  credits?(c: Ctx): string;
  /** which of the eight material surfaces this identity sits on; defaults to the council's */
  surface?: 'CLEAN' | 'PAPER' | 'GLOW' | 'GLASS' | 'INK' | 'TOPO' | 'SCAN' | 'GRAIN';
  /** case treatment for the title */
  titleCase?: 'upper' | 'lower' | 'normal';
  /**
   * Which palette entry is the ground. The packs' four colours are not ordered by role — a
   * sumi-e palette lists its vermilion last — so the designer decides what the frame sits on.
   */
  ground?: 'a' | 'b' | 'c' | 'd' | 'paper' | 'dark';
}
