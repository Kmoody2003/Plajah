// vector — the vector layer of a press page: words and shapes drawn as real PDF text and paths on top of
// the raster underlay (images, gradients, effects). Built in the browser by vectorPage.ts, drawn by
// pressPdf.ts. All geometry is in inches from the trim's top-left; colours are sRGB 0..255 and are
// separated to CMYK by the writer for CMYK conditions.

export interface VectorText {
  text: string;
  /** Left edge of the word and its baseline, inches from the trim's top-left. */
  xIn: number;
  baselineIn: number;
  /** Width the browser laid the word out at; the writer scales the PDF word to match. */
  widthIn: number;
  sizePt: number;
  /** Key into PressPdfOptions.fonts. */
  fontKey: string;
  color: [number, number, number];
  letterSpacingPt: number;
}

export interface VectorShape {
  /** Absolute M/L/C/Z path data, inches from the trim's top-left. */
  d: string;
  fill?: [number, number, number];
  stroke?: [number, number, number];
  strokePt?: number;
  dashPt?: number[];
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
  evenOdd?: boolean;
}

export interface VectorPage {
  texts: VectorText[];
  shapes: VectorShape[];
  /** What stayed in the raster underlay, and why (for the export report). */
  rasterized: Record<string, number>;
}

/** A font the browser resolved: bytes to embed and where it came from. */
export interface ResolvedFont {
  bytes: Uint8Array;
  family: string;
  weight: number;
  italic: boolean;
  /** Set when the requested family had no embeddable file and a same-class family stands in. */
  substitutedFor?: string;
}

export const fontKey = (family: string, weight: number, italic: boolean) => `${family}|${weight}|${italic ? 'i' : 'n'}`;
