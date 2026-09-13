// Shared contract for hand-designed Tela templates.
import type { TelaVectorObject } from '../../../types';
import type { TelaStyleEra } from '../../telaStyleEraLibrary';
import type { Frame } from '../templateKit';
import type { FontKey } from '../telaFonts';

/** What every designer receives. Palette is destructured from the era/template. */
export interface DesignCtx {
  W: number; H: number;
  /** Page frame with the design's chosen margin. */
  fr: Frame;
  paper: string; ink: string; accent: string; secondary: string;
  /** Deterministic seed for procedural motifs. */
  seed: number;
}
export interface EraCtx extends DesignCtx { entry: TelaStyleEra }

/** A designer returns PAGES — each page an object stack (index 0 = back). */
export type EraDesigner = (ctx: EraCtx) => TelaVectorObject[][];

/** The teaching layer every template carries. */
export interface DesignLesson {
  /** One design principle the template demonstrates, in 1–2 sentences. */
  principle: string;
  /** Brief history of the style / genre — where it came from, who shaped it, why it looked that way. 2–4 sentences. */
  history: string;
  /** A concrete exercise the user can try inside the template. */
  tryThis: string;
  /** Interest tag saved to the user's profile when they choose "Add to my interests". */
  interestTag: string;
  /** Optional related tags for discovery. */
  related?: string[];
}

export interface TemplatePageSpec { label: string; build: () => TelaVectorObject[] }

export type GalleryCollection = 'DESIGN_HISTORY' | 'PUBLICATION' | 'DOCUMENT' | 'POSTER' | 'SOCIAL' | 'PRESENTATION' | 'WEB' | 'MENU' | 'LOWER_THIRD';

/** One entry in the unified Tela template gallery. */
export interface TelaDesignTemplate {
  id: string; name: string; collection: GalleryCollection;
  /** Sub-group label shown as a chip (e.g. "MAGAZINE", "MODERNISM"). */
  group: string;
  tagline: string; description: string; audience?: string;
  palette: string[]; fonts: FontKey[];
  width: number; height: number; frameKind: 'PAPER' | 'SCREEN' | 'BOARD';
  pages: TemplatePageSpec[];
  lesson: DesignLesson;
  tags: string[];
  /** Style-era id this template descends from, when any. */
  family?: string;
}
