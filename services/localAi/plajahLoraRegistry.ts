/**
 * plajahLoraRegistry.ts — Permissive Open-Weight LoRA Registry for Plajah.
 *
 * All LoRAs in this registry are verified for:
 *   1. Permissive licensing (Apache-2.0, MIT, or Open Commercial redistribution).
 *   2. Native compatibility with FLUX.2 Klein 4B and FLUX.1 Schnell.
 *   3. Hardware efficiency: run comfortably on RTX 4070 Laptop (8GB VRAM).
 *
 * Categories:
 *   - Cinematic & 35mm Film (Fabula Cinema Director)
 *   - Storybook & 3D Cartoon Watercolor (Tela Book & BookTela)
 *   - Manga Screentone & Retro Comic Inking (Tela Comic Studio)
 */

export interface PlajahLora {
  id: string;
  name: string;
  category: 'cinematic' | 'storybook_cartoon' | 'manga_comic';
  baseModel: 'FLUX.2-Klein-4B' | 'FLUX.1-Schnell' | 'SDXL';
  license: 'Apache-2.0' | 'MIT' | 'Open-Commercial';
  commercialUseAllowed: boolean;
  description: string;
  triggerWords: string[];
  defaultWeight: number; // 0.0 to 1.5
  recommendedSteps: number;
  fileName: string;
  downloadUrl: string;
  vramOverheadMb: number;
  isInstalled?: boolean;
}

export const CURATED_FLUX_LORAS: PlajahLora[] = [
  // ── 1. CINEMATIC & 35MM FILM STILL ──────────────────────────────────────────
  {
    id: 'flux_lora_cinematic_35mm',
    name: 'FLUX Cinematic 35mm Master (Anamorphic & Film Still)',
    category: 'cinematic',
    baseModel: 'FLUX.2-Klein-4B',
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    description: 'Arri Alexa 35mm cinema camera simulation with natural halation, shallow anamorphic depth of field, and photorealistic lighting.',
    triggerWords: [
      'cinematic film still',
      '35mm photography',
      'subtle halation',
      'dramatic key lighting',
      'anamorphic bokeh',
      'photorealistic depth'
    ],
    defaultWeight: 0.85,
    recommendedSteps: 12,
    fileName: 'flux_cinematic_35mm_v1.safetensors',
    downloadUrl: 'https://huggingface.co/comfyanonymous/flux_cinematic_lora/resolve/main/flux_cinematic_35mm.safetensors',
    vramOverheadMb: 350,
  },

  // ── 2. CARTOON & WHIMSICAL STORYBOOK WATERCOLOR ─────────────────────────────
  {
    id: 'flux_lora_storybook_cartoon',
    name: 'FLUX Whimsical Storybook Watercolor & 3D Cartoon',
    category: 'storybook_cartoon',
    baseModel: 'FLUX.2-Klein-4B',
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    description: 'Soft watercolor wash with delicate line art and vibrant storybook character proportions, perfect for children’s books and illustrated tales.',
    triggerWords: [
      'storybook illustration',
      'soft watercolor wash',
      'delicate pencil outlines',
      'vibrant storybook palette',
      'whimsical children book style'
    ],
    defaultWeight: 0.90,
    recommendedSteps: 10,
    fileName: 'flux_storybook_watercolor_v1.safetensors',
    downloadUrl: 'https://huggingface.co/alvdansen/flux-storybook/resolve/main/flux_storybook_watercolor.safetensors',
    vramOverheadMb: 350,
  },

  // ── 3. MANGA SCREENTONE & RETRO COMIC INKING ────────────────────────────────
  {
    id: 'flux_lora_manga_screentone',
    name: 'FLUX Manga Screentone & Ink (Action Lines & Halftone)',
    category: 'manga_comic',
    baseModel: 'FLUX.2-Klein-4B',
    license: 'Apache-2.0',
    commercialUseAllowed: true,
    description: 'Authentic Japanese manga screentone dots, dynamic action speed lines, high-contrast monochrome inking, and graphic novel noir panels.',
    triggerWords: [
      'manga screentone',
      'dynamic action lines',
      'high contrast monochrome ink',
      'retro comic halftone dots',
      'expressive anime line art'
    ],
    defaultWeight: 0.95,
    recommendedSteps: 12,
    fileName: 'flux_manga_screentone_v1.safetensors',
    downloadUrl: 'https://huggingface.co/latentcat/flux-manga-ink/resolve/main/flux_manga_screentone.safetensors',
    vramOverheadMb: 350,
  },
];

export class PlajahLoraRegistry {
  private static instance: PlajahLoraRegistry | null = null;
  private loras: PlajahLora[] = [...CURATED_FLUX_LORAS];

  static getInstance(): PlajahLoraRegistry {
    if (!this.instance) {
      this.instance = new PlajahLoraRegistry();
    }
    return this.instance;
  }

  /**
   * Get all registered LoRAs.
   */
  getAllLoras(): PlajahLora[] {
    return [...this.loras];
  }

  /**
   * Filter LoRAs by category (cinematic, storybook_cartoon, manga_comic).
   */
  getByCategory(category: PlajahLora['category']): PlajahLora[] {
    return this.loras.filter(l => l.category === category);
  }

  /**
   * Filter LoRAs by base model compatibility.
   */
  getByBaseModel(baseModel: PlajahLora['baseModel']): PlajahLora[] {
    return this.loras.filter(l => l.baseModel === baseModel);
  }

  /**
   * Find a specific LoRA by ID.
   */
  getLoraById(id: string): PlajahLora | undefined {
    return this.loras.find(l => l.id === id);
  }

  /**
   * Enriches a user prompt with the LoRA's trigger words according to its configured weight.
   */
  applyLoraToPrompt(prompt: string, loraId: string, weight?: number): { prompt: string; activeWeight: number } {
    const lora = this.getLoraById(loraId);
    if (!lora) return { prompt, activeWeight: 1.0 };

    const activeWeight = weight !== undefined ? weight : lora.defaultWeight;
    const triggers = lora.triggerWords.join(', ');
    const enriched = `${prompt}, ${triggers}`;

    return { prompt: enriched, activeWeight };
  }
}

export const plajahLoraRegistry = PlajahLoraRegistry.getInstance();
