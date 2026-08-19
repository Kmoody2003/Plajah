// isfCatalog — runs the vendored ISF starter presets (engine/presets/isfPresets.ts)
// through isfLoader's translator once at module load, producing entries in the same
// shape ShaderPanel's own SHADERS array uses, so they merge into one library with
// zero downstream changes (ClipLauncher's SourceBrowser + the floating ShaderPanel
// both just iterate a flat array).

import { parseISF, type ISFParamBinding } from './core/isfLoader';
import { ISF_PRESETS } from './presets/isfPresets';

export interface CatalogEntry {
  name: string;
  cat: 'audio' | 'generative' | 'cinematic' | 'abstract';
  src: string;
  kind: 'isf';
  license: string;
  credit?: string;
  description?: string;
  paramBindings: ISFParamBinding[];
}

function classify(categories: string[] | undefined): CatalogEntry['cat'] {
  const c = (categories ?? []).map(s => s.toLowerCase());
  if (c.some(s => s.includes('audio'))) return 'audio';
  if (c.some(s => s.includes('cinematic') || s.includes('distortion'))) return 'cinematic';
  if (c.some(s => s.includes('abstract'))) return 'abstract';
  return 'generative';
}

function build(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const preset of ISF_PRESETS) {
    const parsed = parseISF(preset.isf, preset.name);
    if (!parsed.supported) {
      console.warn(`[isfCatalog] "${preset.name}" failed to translate: ${parsed.unsupportedReason}`);
      continue;
    }
    out.push({
      name: preset.name,
      cat: classify(parsed.meta.CATEGORIES),
      src: parsed.mainImageSrc,
      kind: 'isf',
      license: 'Plajah Original (MIT)',
      credit: parsed.meta.CREDIT,
      description: parsed.meta.DESCRIPTION,
      paramBindings: parsed.paramBindings,
    });
  }
  return out;
}

/** Translated + classified, ready to merge into the shader library. */
export const ISF_CATALOG: CatalogEntry[] = build();

/** For the "Import ISF" UI: parse arbitrary user-pasted ISF source at runtime. Returns
 *  null if unsupported (with a reason the caller can surface to the user). */
export function importISF(raw: string, name: string, license: string): CatalogEntry | { error: string } {
  const parsed = parseISF(raw, name);
  if (!parsed.supported) return { error: parsed.unsupportedReason || 'Unsupported ISF shader.' };
  return {
    name,
    cat: classify(parsed.meta.CATEGORIES),
    src: parsed.mainImageSrc,
    kind: 'isf',
    license: license || 'Unknown — verify before redistributing',
    credit: parsed.meta.CREDIT,
    description: parsed.meta.DESCRIPTION,
    paramBindings: parsed.paramBindings,
  };
}
