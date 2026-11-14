// import/types — the shared shape of a Photoshop / Illustrator import.
//
// Importers run in a worker or in node and know nothing about uploads, fonts or the DOM: they
// talk to an ImportEnv. The result is plain Tela vector pages plus an honest report of what stayed
// live, what was baked and what could not come across.
import type { TelaVectorObject } from '../../../types';
import type { TelaStudioDeviceExt } from '../studio/model';

export interface RgbaImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

export interface ResolvedFont {
  /** The name the source file asked for (PostScript name). */
  requested: string;
  /** CSS font-family stack; the original family is first, so an installed copy always wins. */
  css: string;
  family: string;
  weight: number;
  italic: boolean;
  status: 'installed' | 'library' | 'substitute';
}

export interface TextMetricsLite { width: number; inkLeft: number; inkAscent: number; fontAscent: number; fontDescent: number }

export interface ImportEnv {
  /** Store pixels; returns a URL the document can keep. */
  putImage(image: RgbaImage, name: string): Promise<{ src: string; storagePath?: string; sessionOnly?: boolean }>;
  /** Store original bytes (embedded smart objects, the source file). */
  putBlob?(bytes: Uint8Array, name: string, mime?: string): Promise<string>;
  resolveFonts?(names: string[]): Promise<Record<string, ResolvedFont>>;
  measureText?(cssFont: string, text: string): Promise<TextMetricsLite | null>;
  progress?(stage: string, done: number, total: number): void;
}

export type FeatureStatus = 'live' | 'look' | 'baked' | 'approx' | 'dropped';
export interface FeatureRow { feature: string; status: FeatureStatus; count: number; note?: string }

export interface ImportReport {
  fileName: string;
  format: 'psd' | 'psb' | 'ai' | 'pdf' | 'eps';
  width: number; height: number;
  colorMode?: string; bits?: number;
  layers: number;
  features: FeatureRow[];
  fonts: ResolvedFont[];
  warnings: string[];
  /** Embedded smart objects that can be opened as documents of their own. */
  smartObjects: Array<{ assetId: string; name: string; type?: string; layer: string }>;
}

export interface ImportedPage {
  name: string;
  width: number; height: number;
  objects: TelaVectorObject[];
  studio: TelaStudioDeviceExt;
  background?: string;
}

export interface ImportedDocument { pages: ImportedPage[]; report: ImportReport }

export class ReportBuilder {
  private rows = new Map<string, FeatureRow>();
  readonly warnings: string[] = [];
  note(feature: string, status: FeatureStatus, note?: string, count = 1) {
    const k = `${feature}|${status}`; const r = this.rows.get(k);
    if (r) { r.count += count; if (note && !r.note) r.note = note; } else this.rows.set(k, { feature, status, count, note });
  }
  warn(s: string) { if (!this.warnings.includes(s)) this.warnings.push(s); }
  features(): FeatureRow[] { const order: FeatureStatus[] = ['live', 'look', 'approx', 'baked', 'dropped']; return [...this.rows.values()].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.feature.localeCompare(b.feature)); }
}
