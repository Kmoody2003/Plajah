import type { TelaCreativeTemplate, TelaTemplateCategory } from '../telaCreativeEngine';

export interface DesignStudyColor {
  hex: string;
  name: string;
  role: 'BACKGROUND' | 'SURFACE' | 'PRIMARY' | 'ACCENT' | 'TEXT' | 'MUTED';
  proportion?: number;
  contrastNote?: string;
}

export interface DesignReferenceStudy {
  title: string;
  accurateDescription: string;
  observedEvidence: string[];
  artisticInterpretation: string;
  historicalContexts: Array<{ movement: string; relationship: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }>;
  museumConnections: Array<{ collection: string; connection: string; searchTerms: string[] }>;
  palette: DesignStudyColor[];
  designLanguage: {
    principles: string[];
    typography: string;
    composition: string;
    shapeAndImage: string;
    textureAndMaterial: string;
    motion?: string;
    accessibility: string[];
    avoid: string[];
  };
  template: {
    name: string;
    category: TelaTemplateCategory;
    width: number;
    height: number;
    tone: TelaCreativeTemplate['tone'];
    creativeBrief: string;
  };
  uncertainty: string[];
}

const HEX = /^#[0-9a-f]{6}$/i;
export function normalizeDesignReferenceStudy(input: unknown): DesignReferenceStudy | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as any;
  if (!raw.title || !raw.accurateDescription || !raw.designLanguage || !raw.template) return null;
  const palette = (Array.isArray(raw.palette) ? raw.palette : [])
    .filter((color: any) => HEX.test(String(color?.hex || '')))
    .slice(0, 8)
    .map((color: any) => ({ ...color, hex: String(color.hex).toUpperCase() }));
  if (palette.length < 3) return null;
  return { ...raw, palette } as DesignReferenceStudy;
}

/** Converts a study into a Tela starting system. It carries principles forward,
 * not logos, illustrations, text, or a traced composition from the reference. */
export function studyToTelaTemplate(study: DesignReferenceStudy, id = `reference_${Date.now()}`): TelaCreativeTemplate {
  const colors = study.palette.map(color => color.hex);
  const category = study.template.category || 'DOCUMENT';
  return {
    id,
    name: study.template.name || study.title,
    category,
    width: Math.max(320, Math.min(4096, Number(study.template.width) || (category === 'DOCUMENT' ? 816 : 1080))),
    height: Math.max(320, Math.min(4096, Number(study.template.height) || (category === 'DOCUMENT' ? 1056 : 1080))),
    palette: [colors[0], colors[1] || colors[0], colors[2] || colors[1] || colors[0]],
    tone: study.template.tone || 'EDITORIAL',
  };
}

export const DESIGN_REFERENCE_STUDY_INSTRUCTIONS = `When the user asks to study an attached design reference, perform a visual study rather than identification theatre. Separate visible evidence from interpretation. Describe hierarchy, grid, spacing, type classification, color relationships, image treatment, material/texture, rhythm, symbols, and likely production constraints. Connect it to relevant art/design histories and Plajah museum collections, but label analogies and confidence; never claim provenance, artist, movement, or date from appearance alone. Extract 3–8 representative colors with HEX values, functional roles, approximate proportions, and contrast cautions. Create an original design-language system and an editable template brief inspired by transferable principles—not a trace, replica, trademark, character, logo, or near-duplicate layout. If the reference is associated with a living artist or recognizable brand, discuss broad characteristics and increase transformation. Include uncertainties caused by lighting, camera white balance, perspective, crop, glare, or resolution.`;
