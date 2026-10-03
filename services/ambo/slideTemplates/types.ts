// Ambo slide templates — shared contract.
//
// A slide template is a hand-written DESIGNER: (W, H, fields, theme) → Tela
// vector objects, re-flowed (not scaled) for whatever output it is drawn on.
// Themes own palette, type and ornament language; designers own layout.
import type { TelaVectorObject } from '../../../types';
import type { FontKey } from '../../tela/telaFonts';
import type { Lay } from './layout';

/** Ambient (on-screen) motion attached to an ornament. Text people read never moves. */
export type Ambient =
  | { kind: 'drift'; ax: number; ay: number; period: number; phase?: number }
  | { kind: 'spin'; degPerSec: number }
  /** Centre travels round (cx, cy) — an ellipse when squash < 1, tilted by `tilt` degrees. */
  | { kind: 'orbit'; cx: number; cy: number; degPerSec: number; squash?: number; tilt?: number }
  | { kind: 'pulse'; min: number; max: number; period: number; phase?: number }
  | { kind: 'sweep'; period: number; color: string; width?: number; phase?: number }
  /** Live countdown digits (TEXT only) — counts to `target` (e.g. "10:30" or "10:30 AM"). */
  | { kind: 'countdown'; target: string; fallback: string };

/** A Tela vector object plus the slide-only animation annotations. */
export type SlideObj = TelaVectorObject & {
  amb?: Ambient;
  /** Draw above the cached front layer (live text such as a countdown). */
  front?: boolean;
  /** Entrance group, assigned by the registry from templateRole (0 ground … 4 body). */
  grp?: number;
};

export type EnterStyle = 'rise' | 'fade' | 'slam' | 'wipe' | 'glow' | 'reveal' | 'float';
export type ExitStyle = 'fade-up' | 'fade' | 'slide' | 'wipe-out' | 'zoom-fade' | 'float-up';

export interface ThemeMotion { enter: EnterStyle; enterSec: number; exit: ExitStyle; exitSec: number; ruleGrow: boolean }

export interface ThemePalette {
  ground: string; ground2: string; ink: string; muted: string;
  accent: string; accent2: string; accent3: string;
  /** Card / panel surface and the ink that sits on it. */
  panel: string; panelInk: string; panelMuted: string;
  /** Ink for a numeral sitting on the theme marker. */
  markerInk: string;
}

export interface ThemeType {
  display: FontKey; text: FontKey; label: FontKey; accent: FontKey;
  displayWeight: number; displayItalic?: boolean; displayTransform: 'none' | 'uppercase';
  displayTracking: number; displayLeading: number;
  /** Optical size correction for the display face (small x-height faces > 1, wide faces < 1). */
  displayScale?: number;
  textWeight: number; labelWeight: number; labelTracking: number;
  accentItalic?: boolean; accentWeight?: number;
}

/** Ornament vocabulary — each theme draws these in its own language. */
export interface ThemeMotif {
  /** Full-bleed ground (role GROUND) + texture. */
  ground(L: Lay, seed: number): SlideObj[];
  /** Small divider ornament; returns objects and its height. */
  divider(x: number, y: number, w: number, align: 'left' | 'center', L: Lay): { objs: SlideObj[]; h: number };
  /** Optional page decoration inside the bleed (may be empty — absence is a choice). */
  frame(L: Lay): SlideObj[];
  /** A hero ornament filling an empty zone (beside text, flanks on ultrawide). */
  hero(x: number, y: number, w: number, h: number, L: Lay, seed: number): SlideObj[];
  /** Number / bullet marker centred at (cx, cy) with radius r. */
  marker(cx: number, cy: number, r: number, label: string, L: Lay): SlideObj[];
  /** Card surface behind grouped details. */
  panel(x: number, y: number, w: number, h: number, L: Lay): SlideObj[];
  /** How this theme writes numerals (Classical uses Roman). */
  numeral(n: string): string;
}

export interface SlideTheme {
  id: string; name: string;
  /** Art Council director whose lens authored the theme. */
  director: string; council: 'Art Council';
  lens: string; use: string;
  dark: boolean;
  c: ThemePalette; t: ThemeType; motion: ThemeMotion; motif: ThemeMotif;
  /** Photo-well shape: corner radius as a fraction of the short side, and tilt in degrees. */
  slot: { rx: number; tilt: number };
}

export interface FieldDef { key: string; label: string; default: string; multiline?: boolean; hint?: string }

export type TemplateCategory = 'Welcome' | 'Sermon' | 'Announcements' | 'Worship' | 'Giving' | 'Moments' | 'Media';

export interface DesignCtx {
  W: number; H: number; L: Lay; th: SlideTheme;
  /** Field values with defaults filled in. */
  f: Record<string, string>;
  seed: number;
}
export type SlideDesigner = (d: DesignCtx) => SlideObj[];

export interface SlideTemplateDef {
  id: string; name: string; category: TemplateCategory; blurb: string;
  fields: FieldDef[];
  /** Default Ambo layer slot for the inserted slide. */
  slot: 'slide' | 'background';
  design: SlideDesigner;
}
