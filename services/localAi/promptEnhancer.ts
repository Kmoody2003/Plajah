// promptEnhancer.ts — On-Device Cinematic AI Prompt Enhancer for Plajah Studio.
// Expands brief creative ideas into master-class directorial diffusion prompts
// with photorealistic optical depth, material micro-textures, human anatomical coherence, and lighting harmony.

export interface PromptEnhanceOptions {
  style?: 'none' | 'cinematic' | 'photoreal' | 'neon_noir' | 'vintage_film' | 'anime_comic' | 'epic_fantasy';
  lens?: string;
  lighting?: string;
  cameraAngle?: string;
  aspect?: string;
  addQualityTokens?: boolean;
}

export const LENS_MODIFIERS: Record<string, string> = {
  none: '',

  // --- Anamorphic Cinema Lenses (2x & 1.8x Squeeze) ---
  anamorphic: 'Panavision C-Series 35mm 2x anamorphic prime, subtle horizontal blue streak flare, oval bokeh discs, 2.39:1 widescreen depth',
  panavision_primo_anamorphic: 'Panavision Primo Anamorphic 50mm T1.9, crisp modern anamorphic contrast, controlled horizontal flare, oval bokeh',
  atlas_orion_anamorphic: 'Atlas Orion 40mm T2 2x anamorphic cinema prime, expressive cyan horizontal streak flares, silky oval bokeh falloff',
  cooke_anamorphic_sf: 'Cooke Anamorphic/i Special Flare 50mm T2.3, warm organic Cooke Look with amber-gold anamorphic flares, dimensional oval bokeh',
  hawk_v_lite_anamorphic: 'Vantage Hawk V-Lite 55mm 2x anamorphic lens, classic European cinema anamorphic micro-contrast, elliptical highlight bokeh',
  arricam_master_anamorphic: 'ARRI/Zeiss Master Anamorphic 50mm T1.9, zero-distortion rectilinear anamorphic precision, clean oval bokeh',
  vintage_anamorphic_flare: 'Lomo Roundfront 50mm Soviet 2x anamorphic lens, warm golden organic flares, vintage cinema halation and patina',
  kowa_prominar_anamorphic: 'Kowa Prominar 40mm vintage Japanese anamorphic prime, warm amber flare bloom, classic 1970s widescreen character',

  // --- Modern Spherical Cinema Primes & Zooms ---
  '35mm': 'ARRI/Zeiss Master Prime 35mm T1.3 on ARRI Alexa 35, zero breathing, razor-sharp optical micro-contrast, natural film grain',
  '50mm': 'Cooke S4/i 50mm T2 cinema prime, authentic warm Cooke Look, gentle organic skin rendition, creamy dimensional falloff',
  cooke_panchro_classic: 'Cooke Speed Panchro 50mm T2.2 vintage reissue, velvety midtone transition, flattering portrait skin rolloff',
  '85mm': 'Zeiss Supreme Prime 85mm T1.5 portrait cinema prime, creamy background compression, tack-sharp eye and eyelash isolation',
  arri_signature_prime_47: 'ARRI Signature Prime 47mm T1.8 large-format cinema lens, painterly natural skin tones, buttery smooth bokeh roll-off',
  leica_summilux_c_40: 'Leitz Summilux-C 40mm T1.4 cinema prime, exquisite skin micro-contrast, smooth focus roll-off, neutral color fidelity',
  '135mm_telephoto': 'Leitz Summilux-C 135mm T1.4 telephoto cinema prime, dramatic focal plane compression, intimate subject isolation',
  zeiss_super_speed_mk3: 'Zeiss B-Speed / Super Speed MkIII 35mm T1.3 wide-open, subtle triangular bokeh, gritty 1980s cinema highlight bloom',
  angenieux_optimo_zoom: 'Angénieux Optimo 24-290mm T2.8 reference cinema zoom, rich French warm color bias, Hollywood blockbuster compression',
  cine_zoom_24_290: 'Angénieux Optimo 24-290mm T2.8 cine zoom lens, smooth optical compression, classic Hollywood cinema optics',

  // --- Vintage & Character Cinema Lenses ---
  canon_k35_vintage: 'Canon K35 35mm T1.3 vintage 1970s cinema prime, warm magenta-amber flare bloom, creamy low-contrast shadows, Alien 1979 look',
  super_baltar_vintage: 'Bausch & Lomb Super Baltar 50mm T2.3 vintage cinema lens, warm golden halation, painterly portrait softness, Godfather aesthetic',
  helios_44_2_swirl: 'Helios 44-2 58mm f/2 Soviet cine-mod lens, iconic swirling cat-eye bokeh, organic flare bloom, tactile character',
  petzval_swirl: 'Lomography Joseph Petzval 85mm f/2.2 brass art lens, dramatic swirling vortex radial bokeh, tack-sharp center subject',
  kubrick_zeiss_planar_f07: 'Carl Zeiss Planar 50mm f/0.7 NASA ultra-fast lens, paper-thin depth of field, intimate candlelight luminance',
  vintage_16mm_bolex: 'Kern Paillard Switar 25mm f/1.4 Rx on 16mm Bolex camera, organic 16mm Kodak 7219 grain, nostalgic halation',
  super_8_kodak_ektar: 'Kodak Ektar 13mm f/1.1 on Super 8mm cartridge film, heavy organic film grain, warm gate-weave halation',

  // --- Large Format, IMAX & Medium Format Optics ---
  '70mm_imax': 'IMAX 15-perf 65mm/70mm Hasselblad 50mm large-format optics, breathtaking spatial depth, medium-format compression, infinite detail',
  panavision_system_65: 'Panavision Sphero 65 / System 65 65mm large-format prime, monumental depth of field, zero distortion, epic cinema scale',
  hasselblad_xcd_80_f19: 'Hasselblad XCD 80mm f/1.9 on 100MP medium-format sensor, three-dimensional subject pop, unmatched tonal gradation and skin pore fidelity',
  mamiya_sekor_80_f19: 'Mamiya Sekor C 80mm f/1.9 medium-format 645 prime, lush medium-format compression, creamy shallow depth, analog portrait magic',
  pentax_67_takumar_105: 'Pentax 67 Super-Multi-Coated Takumar 105mm f/2.4 medium-format portrait lens, legendary 3D subject separation, dreamy background melt',
  large_format_8x10_schneider: 'Schneider Symmar-S 300mm f/5.6 on 8x10 large-format view camera, Scheimpflug focal plane, hyper-detailed portrait presence',

  // --- Iconic Still & Portrait Primes ---
  noctilux_f095: 'Leica Noctilux-M 50mm f/0.95 ASPH wide-open, hyper-shallow ethereal depth of field, dreamlike liquid bokeh, sharp eye focus',
  leica_summilux_35_fle: 'Leica Summilux-M 35mm f/1.4 ASPH FLE, classic reportage environmental portrait perspective, micro-contrast pop, organic vignette',
  leica_apo_summicron_75: 'Leica APO-Summicron-M 75mm f/2 ASPH, apochromatic zero-aberration sharpness, natural portrait compression',
  canon_rf_85_f12_ds: 'Canon RF 85mm f/1.2L USM DS Defocus Smoothing portrait prime, ultra-feathered Gaussian bokeh discs, razor-sharp iris detail',
  nikon_noct_58_f095: 'Nikon NIKKOR Z 58mm f/0.95 S Noct, sagittal coma zero-flare point highlights, velvet background transition',
  sony_gm_135_f18: 'Sony FE 135mm f/1.8 GM telephoto portrait prime, clinical eyelash acutance, creamy background compression',
  zeiss_otus_55_f14: 'Zeiss Otus 55mm f/1.4 Apo Distagon, medium-format-like micro-contrast, three-dimensional tonal separation',
  canon_fd_55_f12_ssc: 'Vintage Canon FD 55mm f/1.2 S.S.C. Aspherical, warm 1970s coating glow, painterly skin highlight rolloff',

  // --- Ultra-Wide, Rectilinear & Fisheye Optics ---
  '24mm_cinema_wide': 'ARRI Master Prime 24mm T1.3 wide cinema prime, dynamic close-quarters environmental framing, natural rectilinear lines',
  ultra_wide_18mm: 'Zeiss Ultra Prime 18mm T1.9 wide-angle cinematography, grand spatial perspective, deep sharp architectural focus',
  ultra_wide: 'Zeiss 18mm ultra-wide cinema angle, dynamic vanishing lines, sweeping environmental grandeur',
  arri_ultra_prime_8r: 'ARRI/Zeiss Ultra Prime 8R 8mm T2.8 extreme rectilinear wide lens, dramatic deep-space perspective without fisheye curve',
  super_wide_12mm: 'Voigtländer Heliar-Hyper Wide 12mm rectilinear optics, sweeping panoramic immersion, dramatic vertical perspective',
  laowa_12mm_zero_d: 'Laowa 12mm T2.9 Zero-D Cine rectilinear ultra-wide, laser-straight architectural lines, expansive field of view',
  fisheye_8mm: 'Nikkor 8mm f/2.8 circular fisheye lens, 180-degree hemispherical barrel distortion, curved horizon perspective',
  fisheye_16mm_fullframe: '16mm f/2.8 full-frame diagonal fisheye lens, dynamic curved edge distortion, intense foreground presence',

  // --- Telephoto, Macro, Probe & Specialty Optics ---
  '200mm_f2_telephoto': 'Canon EF 200mm f/2L IS telephoto prime, extreme background compression, compressed atmospheric layers, velvet bokeh',
  '300mm_super_telephoto': '300mm f/2.8 super-telephoto cinema lens, flattened perspective, heat-haze compression, voyeuristic framing',
  macro_probe: 'Laowa 24mm T14 2x Periprobe Macro Probe lens, bug-eye ultra-close tubular perspective with wide contextual background',
  macro: '100mm f/2.8L Macro 1:1 reproduction lens, microscopic skin pore and iris fiber fidelity, specular moisture glints',
  tilt_shift_45mm: 'Canon TS-E 45mm f/2.8 tilt-shift lens, selective Scheimpflug focal plane, miniature diorama blur gradient',
  lensbaby_composer_sweet: 'Lensbaby Composer Pro Sweet 50 optic, sharp central sweet-spot surrounded by radial streaking blur',
  split_diopter_70s: '1970s Brian De Palma split-field diopter lens attachment, simultaneous tack-sharp foreground face and sharp deep background',
  pinhole_obscura: 'Camera obscura pinhole aperture optic, infinite soft-focus depth of field, dreamy pictorialist vignette',
};

export const LIGHTING_MODIFIERS: Record<string, string> = {
  none: '',
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
  natural_overcast: 'natural overcast sky illumination, soft shadowless light wrap, authentic true-to-life skin color rendition',
  butterfly_paramount: 'classic Hollywood Paramount butterfly lighting, high frontal beauty key light, sculpted cheekbone highlights, soft chin shadow',
  split_half_shadow: 'dramatic 90-degree lateral split lighting, half face in crisp key light and half face in deep velvet shadow',
  loop_portrait_key: 'flattering 35-degree loop portrait lighting, soft nose shadow loop on cheek, dimensional studio fill',
  clamshell_glamour: 'clamshell beauty lighting with overhead octabox key and silver reflector bounce from below, radiant skin sheen',
  sodium_vapor_street: 'urban night sodium-vapor 2100K amber streetlamp glow, damp pavement reflections, moody nocturnal atmosphere',
  campfire_ember_glow: 'low-angle warm campfire ember illumination, dancing orange-red light on skin against deep indigo night shadows',
  dappled_forest_canopy: 'dappled sunlight filtering through tree foliage gobo, organic sun-spots and soft woodland shadow pattern',
  practical_tungsten_room: 'motivated interior practical tungsten lamps, warm 2700K room glow contrasted with cool twilight window fill',
};

export const CAMERA_ANGLE_MODIFIERS: Record<string, string> = {
  none: '',

  // --- Shot Scale / Subject Distance ---
  extreme_wide_shot: 'extreme wide establishing shot (EWS), vast environmental scale with subject small in frame, epic spatial geography',
  wide_establishing_shot: 'wide master shot (WS), full environment and complete head-to-toe subject in context, balanced cinematic staging',
  full_body_shot: 'full body head-to-toe shot (FS), complete human figure visible from crown to footwear, natural standing posture and proportions',
  medium_wide_knees: 'medium wide 3/4 shot (MWS) framed from knees up, dynamic body language and environmental depth',
  cowboy_american_shot: 'classic Hollywood cowboy shot (American shot) framed from mid-thighs up, heroic posture, expressive hands and torso',
  medium_waist_shot: 'medium waist-up shot (MS), natural conversational distance, clear torso gestures and facial expression',
  medium_close_up: 'medium close-up (MCU) framed from chest and shoulders up, intimate emotional presence, crisp facial structure',
  close_up_portrait: 'close-up portrait shot (CU) filling frame with head and collarbones, expressive eyes, natural skin micro-texture',
  choker_close_up: 'tight choker close-up framed from eyebrows to chin, intense psychological focus on eyes and mouth',
  extreme_close_up: 'extreme close-up (ECU) macro framing on eyes and bridge of nose, intricate iris fibers and natural skin pores',
  insert_detail_shot: 'narrative insert detail shot focusing tightly on hands, prop interaction, or tactile detail',

  // --- Camera Elevation & Vertical Pitch ---
  eye_level: 'neutral eye-level camera angle, direct 0-degree horizontal gaze, authentic human connection',
  low_angle_hero: 'heroic low camera angle looking upward at subject, commanding stature, monumental presence',
  extreme_worm_eye: 'extreme ground-level worm’s-eye view looking steeply upward, towering perspective, dramatic sky backdrop',
  subtle_low_authority: 'subtle 15-degree low-angle camera placement, quiet authority and dignified posture',
  subtle_high_empathy: 'subtle 15-degree high-angle camera placement, gentle empathetic perspective, flattering jawline definition',
  high_angle_bird: 'high 45-degree camera angle looking downward at subject, expansive floor plane and spatial context',
  overhead_god_view: '90-degree top-down zenith overhead god’s-eye view, perpendicular geometric composition',
  aerial_drone_vista: 'sweeping high-altitude aerial drone perspective, grand topographic scale',

  // --- Subject Orientation & Facial Angle ---
  front_portrait: 'direct frontal portrait angle, symmetrical face-on composition, direct eye contact with lens',
  three_quarter_left: 'classic 45-degree three-quarter portrait angle turned left, dimensional cheekbone and nose bridge sculpting',
  three_quarter_right: 'classic 45-degree three-quarter portrait angle turned right, dimensional cheekbone and nose bridge sculpting',
  profile_left: 'crisp 90-degree lateral side profile looking left, clean jawline and nose silhouette',
  profile_right: 'crisp 90-degree lateral side profile looking right, clean jawline and nose silhouette',
  over_shoulder_look_back: 'subject seen from three-quarter rear angle glancing back over their shoulder toward the camera',
  dorsal_from_behind: 'cinematic dorsal view from directly behind the subject looking out into the scene, contemplative Rückenfigur composition',

  // --- Compositional, Horizon & Multi-Subject Framing ---
  over_the_shoulder: 'over-the-shoulder (OTS) narrative framing with soft-focus foreground shoulder and sharp focus on facing subject',
  dirty_single_frame: 'dirty single cinema framing with subtle out-of-focus foreground element framing the primary subject',
  clean_single_isolated: 'clean single shot isolating the sole subject against a pure uncluttered background',
  two_shot_conversational: 'balanced cinematic two-shot framing two distinct characters in natural spatial interaction',
  dutch_angle: 'dramatic 18-degree Dutch tilt canted horizon, kinetic psychological tension',
  rule_of_thirds_offcenter: 'classical rule-of-thirds asymmetrical composition with subject positioned on the optical power line and open negative space',
  wes_anderson_symmetry: 'dead-center symmetrical planimetric composition, orthogonal vanishing lines, Wes Anderson framing',
  leading_lines_depth: 'deep-staging composition utilizing architectural leading lines converging directly on the subject',
  frame_within_frame: 'frame-within-a-frame composition viewing the subject through a doorway, window, or architectural arch',
  reflection_mirror_shot: 'cinematic reflection shot capturing the subject via a mirror, rain puddle, or glass window surface',
  silhouette_contre_jour: 'contre-jour backlit silhouette framing with glowing rim outline around the human form',

  // --- POV, Action, Editorial & Reference Sheets ---
  first_person_pov: 'immersive first-person point-of-view (POV) perspective looking out from the character’s own eyes',
  low_tracking_stride: 'dynamic low-angle Steadicam tracking shot following the subject mid-stride with natural motion energy',
  editorial_vogue_fashion: 'high-fashion editorial full-length pose, confident natural posture, tailored garment drape, studio presence',
  candid_street_moment: 'authentic unposed street photography moment, Henri Cartier-Bresson decisive moment, natural human expression',
  full_body_turnaround: 'multi-angle character model sheet turnaround, simultaneous front view, three-quarter view, profile view and rear view, consistent character design, neutral background',
};

const STYLE_ENHANCERS: Record<string, { prefix: string; suffix: string }> = {
  none: {
    prefix: '',
    suffix: 'natural human anatomy, coherent single-subject composition, realistic skin micro-texture, focused expressive eyes, crisp optical fidelity',
  },
  cinematic: {
    prefix: 'Cinematic master film still of',
    suffix: 'natural human proportions, realistic skin pores and expressive eyes, color graded in DaVinci Resolve, 8k raw photographic fidelity',
  },
  photoreal: {
    prefix: 'Hyper-detailed documentary portrait photography of',
    suffix: 'Hasselblad medium format, natural human anatomy, authentic skin micro-texture, focused eyes with natural catchlights, raw uncompressed detail',
  },
  neon_noir: {
    prefix: 'Moody cyber-noir cinema still of',
    suffix: 'drenched in rain, neon-soaked reflections, natural human anatomy, high-contrast anamorphic flares, atmospheric cyberpunk cinematography',
  },
  vintage_film: {
    prefix: 'Vintage 1970s Panavision 35mm film capture of',
    suffix: 'Kodachrome 64 color tones, authentic analog grain, natural human proportions, nostalgic warm hues, timeless auteur cinema',
  },
  anime_comic: {
    prefix: 'Exquisite dynamic graphic novel keyframe illustration of',
    suffix: 'Makoto Shinkai and Katsuhiro Otomo aesthetics, crisp line art, coherent character anatomy, vivid emotional palette',
  },
  epic_fantasy: {
    prefix: 'Grand epic high fantasy concept art of',
    suffix: 'volumetric god rays, coherent heroic anatomy, intricate ornate wardrobe and ancient stonework, atmospheric mist',
  },
};

/**
 * Expands a short prompt into a rich, director-grade cinematic diffusion prompt
 * while respecting 'none' overrides and keeping token length within CLIP's sweet spot.
 */
export function enhancePromptLocally(rawPrompt: string, options: PromptEnhanceOptions = {}): string {
  const clean = rawPrompt.trim();
  if (!clean) {
    return 'Cinematic portrait of a subject in natural directional window light, single unified human figure, symmetrical facial structure, expressive focused eyes, realistic skin pore texture, 50mm cinema prime';
  }

  // Check if prompt is already heavily detailed (over 260 characters with camera/anatomy terms)
  if (clean.length > 260 && (clean.includes('lens') || clean.includes('lighting') || clean.includes('anatomy') || clean.includes('8k'))) {
    return clean;
  }

  const styleKey = options.style || 'cinematic';
  const styleConfig = STYLE_ENHANCERS[styleKey] || STYLE_ENHANCERS.cinematic;

  const lensKey = options.lens ?? 'none';
  const lightKey = options.lighting ?? 'none';
  const angleKey = options.cameraAngle ?? 'none';

  const lensDesc = lensKey !== 'none' ? LENS_MODIFIERS[lensKey] : '';
  const lightDesc = lightKey !== 'none' ? LIGHTING_MODIFIERS[lightKey] : '';
  const angleDesc = angleKey !== 'none' ? CAMERA_ANGLE_MODIFIERS[angleKey] : '';

  const parts: string[] = [];

  // 1. Core subject with optional stylistic framing
  if (
    styleConfig.prefix &&
    !clean.toLowerCase().startsWith('a ') &&
    !clean.toLowerCase().startsWith('an ') &&
    !clean.toLowerCase().startsWith('the ') &&
    !clean.toLowerCase().startsWith('cinematic')
  ) {
    parts.push(`${styleConfig.prefix} ${clean}`);
  } else {
    parts.push(clean);
  }

  // 2. Camera Angle & Shot Framing (only if not 'none')
  if (angleDesc && !clean.toLowerCase().includes(angleDesc.slice(0, 18).toLowerCase())) {
    parts.push(angleDesc);
  }

  // 3. Lighting & Atmosphere (only if not 'none')
  if (lightDesc && !clean.toLowerCase().includes(lightDesc.slice(0, 18).toLowerCase())) {
    parts.push(lightDesc);
  }

  // 4. Camera Optics & Lens (only if not 'none')
  if (lensDesc && !clean.toLowerCase().includes(lensDesc.slice(0, 18).toLowerCase())) {
    parts.push(lensDesc);
  }

  // 5. Anatomical Coherence & Optical Fidelity Suffix
  if (options.addQualityTokens !== false && styleConfig.suffix) {
    parts.push(styleConfig.suffix);
  }

  return parts.filter(Boolean).join(', ');
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
        prompt: `You are an expert Hollywood cinematographer and generative image prompt engineer. Expand the following user prompt into a concise, coherent, photorealistic image generation prompt (under 65 words). Ensure single-subject human anatomical coherence, natural skin texture, expressive eyes, and clean composition. Output ONLY the expanded prompt, nothing else:\n"${trimmed}"`,
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
