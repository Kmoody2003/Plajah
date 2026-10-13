// promptEnhancer.ts — On-Device Cinematic AI Prompt Enhancer for Plajah Studio.
// Expands brief creative ideas into master-class directorial diffusion prompts
// with photorealistic optical depth, material micro-textures, and lighting harmony.

export interface PromptEnhanceOptions {
  style?: 'cinematic' | 'photoreal' | 'neon_noir' | 'vintage_film' | 'anime_comic' | 'epic_fantasy';
  lens?: string;
  lighting?: string;
  cameraAngle?: string;
  aspect?: string;
  addQualityTokens?: boolean;
}

const LENS_MODIFIERS: Record<string, string> = {
  anamorphic: 'Panavision anamorphic lens, horizontal streak flares, subtle oval bokeh discs, 2.39:1 widescreen depth',
  '35mm': 'Arri Master Prime 35mm f/1.4, organic 35mm Kodak Vision3 film grain, shallow depth of field, natural motion blur',
  '50mm': 'Cooke S4/i 50mm cinema prime, gentle organic sharpness, creamy dimensional falloff, authentic Cooke Look',
  '85mm': 'Zeiss Supreme Prime 85mm f/1.4 portrait cinema prime, creamy background compression, razor sharp subject isolation',
  '135mm_telephoto': 'Leica Summilux-C 135mm telephoto prime, dramatic focal plane compression, distant background intimacy',
  macro_probe: 'Laowa 24mm f/14 2x Macro Probe lens, microscopic tactile surface detail, ultra-close perspective with deep ambient background',
  macro: '100mm macro f/2.8, extreme close-up fidelity, visible micro-pores, surface textures and specular glints',
  ultra_wide_18mm: 'Zeiss Ultra Prime 18mm wide angle cinematography, grand perspective scale, deep sharp architectural focus',
  ultra_wide: 'Zeiss 18mm ultra-wide cinema angle, dynamic vanishing lines, sweeping environmental grandeur',
  super_wide_12mm: 'Voigtländer 12mm ultra-wide rectilinear optics, sweeping panoramic immersion, dramatic vertical perspective',
  fisheye_8mm: '8mm circular fisheye lens, 180-degree hemispherical barrel distortion, dramatic curved horizon perspective',
  tilt_shift_45mm: 'Canon TS-E 45mm tilt-shift lens, selective miniature diorama focal plane, architectural perspective control',
  vintage_16mm_bolex: '16mm Switar vintage cinema prime, nostalgic 16mm optical halation, soft chromatic aberration, authentic analog film grain',
  '70mm_imax': 'IMAX 15-perf 70mm large format camera, Hasselblad optics, breathtaking spatial clarity, infinite textural resolution',
  noctilux_f095: 'Leica Noctilux-M 50mm f/0.95 lens, hyper-shallow ethereal depth of field, dreamlike liquid bokeh background',
  petzval_swirl: '19th-century Petzval 85mm brass lens, swirling vortex radial bokeh, razor sharp center sweet spot, vintage optical character',
  cine_zoom_24_290: 'Angénieux Optimo 24-290mm cine zoom lens, smooth optical vertigo compression, classic Hollywood cinema optics',
  vintage_anamorphic_flare: 'Lomo Roundfront Soviet anamorphic lens, warm golden organic streaks, expressive flare dynamics, vintage cinema patina',
};

const LIGHTING_MODIFIERS: Record<string, string> = {
  chiaroscuro: 'dramatic chiaroscuro lighting, deep rich shadow falloff, triangular Rembrandt cheek highlight, moody key light',
  golden_hour: 'low-angled golden hour sunlight, warm volumetric sunbeams, rim-lit edges, soft atmospheric dust motes',
  neon_noir: 'cyberpunk neon noir palette, dual-tone cyan and hot magenta rim lighting, wet reflective surfaces',
  dramatic_rim: 'sharp theatrical kicker light, silhouette edge separation, moody deep shadows, volumetric atmospheric haze',
  high_key_commercial: 'high-key commercial studio lighting, pure radiant clean daylight, soft wrap-around bounce, zero harsh shadows',
  low_key_film_noir: 'classic 1940s film noir lighting, Venetian blind shadow slits, harsh tungsten key light, smoke and cigarette haze',
  moonlight_cyan: 'cinematic cool moonlight, desaturated cyan ambient fill, midnight deep blue shadows, crisp silver edge highlights',
  volumetric_godrays: 'cathedral volumetric god rays, intense directional shafts of sunlight piercing misty dust motes, divine atmosphere',
  warm_candlelight: 'intimate 1800K flickering candlelight, soft amber inverse-square falloff, warm shadows, cozy fireplace glow',
  bifrost_neon_synth: 'synthwave bifrost dual-tone lighting, saturated electric violet key paired with burning neon crimson rim light',
  overcast_softbox: 'northern sky softbox lighting, overcast diffuse cloud illumination, natural skin tones, smooth micro-contrast',
  ringlight_beauty: 'editorial beauty ring light, circular ocular catchlights in eyes, flawless even facial illumination, beauty dish fill',
  stage_spotlight: 'theatrical overhead follow-spotlight, intense focused beam cutting through pure pitch black darkness, stark isolation',
  underwater_caustics: 'underwater caustic light refractions, undulating turquoise ripples dancing across subject, deep ocean light scattering',
  fluorescent_grit: 'industrial fluorescent tube lighting, cold green-tinted institutional glare, gritty urban realism, flickering tungsten',
  sunset_silhouette: 'blazing crimson-orange sunset horizon, total subject silhouette, stark black graphic profile against vibrant sky',
  studio_soft: 'three-point diffused studio lighting, gentle octabox fill, balanced tonal range, natural skin luminance',
};

const CAMERA_ANGLE_MODIFIERS: Record<string, string> = {
  eye_level: 'frontal direct eye-level camera angle, 0-degree natural eye gaze, balanced compositional framing',
  front_portrait: 'frontal direct camera angle, 0-degree eye-level gaze, centered symmetrical framing',
  three_quarter_left: 'three-quarter view turned 45 degrees to the left, dynamic facial depth, locked character likeness',
  three_quarter_right: 'three-quarter view turned 45 degrees to the right, dynamic facial depth, locked character likeness',
  profile_left: 'sharp 90-degree side profile view looking left, crisp silhouette jawline, clean lateral perspective',
  profile_right: 'sharp 90-degree side profile view looking right, crisp silhouette jawline, clean lateral perspective',
  low_angle_hero: 'heroic low camera angle looking upward, powerful commanding stature, ground-level lens perspective',
  high_angle_bird: 'high camera angle looking downward at 45 degrees, vulnerable perspective, expansive floor plane',
  overhead_god_view: '90-degree top-down nadir overhead god view, flat perpendicular perspective, architectural geometric layout',
  over_the_shoulder: 'over-the-shoulder conversation shot, foreground shoulder framing, narrative depth of field',
  dutch_angle: 'dramatic 15-degree Dutch angle camera tilt, canted horizon line, psychological tension',
  extreme_close_up: 'extreme close-up macro framing, intimate focus on eyes and facial expression, razor thin depth',
  full_body_turnaround: 'multi-angle character model sheet turnaround, simultaneous front view, three-quarter view, profile view and rear view, consistent character design, neutral background',
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
  const angleDesc = options.cameraAngle ? CAMERA_ANGLE_MODIFIERS[options.cameraAngle] : undefined;

  // Seamlessly integrate the original prompt with directorial nuances
  const parts: string[] = [];

  // 1. Core subject with stylistic framing
  if (!clean.toLowerCase().startsWith('a ') && !clean.toLowerCase().startsWith('the ') && !clean.toLowerCase().startsWith('cinematic')) {
    parts.push(`${styleConfig.prefix} ${clean}`);
  } else {
    parts.push(clean);
  }

  // 2. Camera Angle & Perspective
  if (angleDesc && !clean.toLowerCase().includes('angle') && !clean.toLowerCase().includes('view')) {
    parts.push(angleDesc);
  }

  // 3. Lighting & Atmosphere
  if (lightDesc && !clean.toLowerCase().includes('light')) {
    parts.push(lightDesc);
  }

  // 4. Camera Optics & Lens
  if (lensDesc && !clean.toLowerCase().includes('lens') && !clean.toLowerCase().includes('mm')) {
    parts.push(lensDesc);
  }

  // 5. Stylistic Grade & Resolution
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
