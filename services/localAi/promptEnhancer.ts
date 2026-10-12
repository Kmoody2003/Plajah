// promptEnhancer.ts — On-Device Cinematic AI Prompt Enhancer for Plajah Studio.
// Expands brief creative ideas into master-class directorial diffusion prompts
// with photorealistic optical depth, material micro-textures, and lighting harmony.

export interface PromptEnhanceOptions {
  style?: 'cinematic' | 'photoreal' | 'neon_noir' | 'vintage_film' | 'anime_comic' | 'epic_fantasy';
  lens?: 'anamorphic' | '35mm' | '50mm' | '85mm' | 'macro' | 'ultra_wide';
  lighting?: 'chiaroscuro' | 'golden_hour' | 'neon_noir' | 'studio_soft' | 'dramatic_rim';
  aspect?: string;
  addQualityTokens?: boolean;
}

const LENS_MODIFIERS: Record<string, string> = {
  anamorphic: 'Panavision anamorphic lens, horizontal streak flares, subtle oval bokeh discs, 2.39:1 widescreen depth',
  '35mm': 'Arri Master Prime 35mm f/1.4, organic 35mm Kodak Vision3 film grain, shallow depth of field, natural motion blur',
  '50mm': 'Leica Summilux-M 50mm f/1.4, natural human eye perspective, razor-sharp focus on subject, smooth falloff',
  '85mm': 'Cooke S4/i 85mm portrait prime, creamy background compression, exquisite facial skin textures and catchlights',
  macro: '100mm macro f/2.8, extreme close-up fidelity, visible micro-pores, surface textures and specular glints',
  ultra_wide: 'Zeiss 18mm ultra-wide cinema angle, dynamic vanishing lines, sweeping environmental grandeur',
};

const LIGHTING_MODIFIERS: Record<string, string> = {
  chiaroscuro: 'Rembrandt chiaroscuro key lighting, deep rich shadow gradients, dramatic specular contouring',
  golden_hour: 'low-angled golden hour sunlight, warm volumetric sunbeams, rim-lit edges, soft atmospheric dust motes',
  neon_noir: 'cyberpunk neon noir palette, dual-tone cyan and hot magenta rim lighting, wet reflective surfaces',
  studio_soft: 'three-point diffused studio lighting, gentle octabox fill, balanced tonal range, natural skin luminance',
  dramatic_rim: 'sharp theatrical kicker light, silhouette edge separation, moody deep shadows, volumetric atmospheric haze',
};

const STYLE_ENHANCERS: Record<string, { prefix: string; suffix: string }> = {
  cinematic: {
    prefix: 'Cinematic master film still of',
    suffix: 'shot on 65mm IMAX, director of photography Roger Deakins style, color graded in DaVinci Resolve, 8k raw photographic fidelity, tactile textures, photorealistic masterpiece',
  },
  photoreal: {
    prefix: 'National Geographic hyper-detailed documentary photography of',
    suffix: 'Hasselblad H6D-100c medium format, incredibly crisp micro-textures, authentic lighting, raw uncompressed detail, 8k resolution',
  },
  neon_noir: {
    prefix: 'Moody Blade Runner style cyber-noir scene of',
    suffix: 'drenched in rain, neon-soaked reflections, steam vents, high-contrast anamorphic flares, dark atmospheric cyberpunk cinematography',
  },
  vintage_film: {
    prefix: 'Vintage 1970s Panavision film capture of',
    suffix: 'Kodachrome 64 color tones, authentic analog grain, nostalgic warm hues, cinematic lens aberration, timeless auteur cinema',
  },
  anime_comic: {
    prefix: 'Exquisite dynamic graphic novel keyframe illustration of',
    suffix: 'Makoto Shinkai and Katsuhiro Otomo aesthetics, crisp line art, radiant atmospheric particle lighting, vivid emotional palette, ultra-clean vector inking',
  },
  epic_fantasy: {
    prefix: 'Grand epic high fantasy concept art of',
    suffix: 'volumetric god rays, intricate ornate armor and ancient stonework, atmospheric mist, cinematic scale, master painting composition',
  },
};

/**
 * Expands a short prompt into a rich, director-grade cinematic diffusion prompt.
 */
export function enhancePromptLocally(rawPrompt: string, options: PromptEnhanceOptions = {}): string {
  const clean = rawPrompt.trim();
  if (!clean) {
    return 'A cinematic master shot of a tranquil coastal lighthouse at blue hour, crashing sea spray illuminated by a rotating amber beam, dramatic volumetric mist, 35mm anamorphic prime lens, 8k raw photography, Roger Deakins lighting';
  }

  // Check if prompt is already heavily detailed (over 250 characters with camera terms)
  if (clean.length > 280 && (clean.includes('lens') || clean.includes('lighting') || clean.includes('8k'))) {
    return clean;
  }

  const styleKey = options.style || 'cinematic';
  const styleConfig = STYLE_ENHANCERS[styleKey] || STYLE_ENHANCERS.cinematic;

  const lensDesc = options.lens ? LENS_MODIFIERS[options.lens] : LENS_MODIFIERS.anamorphic;
  const lightDesc = options.lighting ? LIGHTING_MODIFIERS[options.lighting] : LIGHTING_MODIFIERS.chiaroscuro;

  // Seamlessly integrate the original prompt with directorial nuances
  const parts: string[] = [];

  // 1. Core subject with stylistic framing
  if (!clean.toLowerCase().startsWith('a ') && !clean.toLowerCase().startsWith('the ') && !clean.toLowerCase().startsWith('cinematic')) {
    parts.push(`${styleConfig.prefix} ${clean}`);
  } else {
    parts.push(clean);
  }

  // 2. Lighting & Atmosphere
  if (lightDesc && !clean.toLowerCase().includes('light')) {
    parts.push(lightDesc);
  }

  // 3. Camera Optics & Lens
  if (lensDesc && !clean.toLowerCase().includes('lens') && !clean.toLowerCase().includes('mm')) {
    parts.push(lensDesc);
  }

  // 4. Stylistic Grade & Resolution
  if (options.addQualityTokens !== false) {
    parts.push(styleConfig.suffix);
  }

  return parts.join(', ');
}

/**
 * Attempts to call local LLM (Nemotron or Ollama) if available, falling back to neural-rule expansion.
 */
export async function enhancePromptWithAi(
  rawPrompt: string,
  options: PromptEnhanceOptions = {}
): Promise<string> {
  const trimmed = rawPrompt.trim();
  if (!trimmed) {
    return enhancePromptLocally('', options);
  }

  // 1. Check local Ollama endpoint (port 11434)
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 1200);
    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: 'nemotron-mini',
        prompt: `You are an expert Hollywood cinematographer and generative image prompt engineer. Expand the following user prompt into an ultra-detailed, photorealistic cinematic image generation prompt. Include specific lighting, camera lens, atmospheric volumetric haze, textures, and color grade. Output ONLY the expanded prompt, nothing else:\n"${trimmed}"`,
        stream: false,
      }),
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.response && data.response.trim().length > trimmed.length) {
        return data.response.trim().replace(/^"|"$/g, '');
      }
    }
  } catch {
    // Local Ollama offline, continue
  }

  // 2. High-Fidelity On-Device Directorial Expansion
  return enhancePromptLocally(trimmed, options);
}
