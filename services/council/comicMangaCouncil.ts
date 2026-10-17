/**
 * Comic Book & Manga Council (Sequential Art & Visual Storytelling)
 * 
 * Expands Plajah's Council architecture with dedicated master lenses for Comic Books,
 * Manga, Graphic Novels, and Visual Adaptations across historical style eras and genres.
 */

export type ComicCouncilId = 
  | 'DARK_NOIR'         // Frank Miller, Mike Mignola, Batman: Year One, Sin City
  | 'SEINEN_KINETIC'    // Katsuhiro Otomo (Akira), Kentaro Miura (Berserk), Tsutomu Nihei (Blame!)
  | 'DYNAMIC_ARCHITECT' // Jack Kirby, Will Eisner, Jim Steranko, Silver/Bronze Age
  | 'LIGNE_CLAIRE'      // Moebius (The Incal), Hergé, Enki Bilal, European BD
  | 'CINEMATIC_MODERN'  // Jim Lee, Fiona Staples (Saga), Brian K. Vaughan, Modern Image
  | 'SHOJO_EXPRESSION'; // CLAMP, Naoko Takeuchi, Gothic Lolita, Poetic Emotional Montages

export interface ComicCouncilMember {
  id: ComicCouncilId;
  name: string;
  role: 'WRITER' | 'ART_DIRECTOR' | 'AUTEUR';
  genre: string;
  styleEra: string;
  epithet: string;
  voice: string;
  layoutPhilosophy: string;
  framingRules: string[];
  balloonRules: string[];
  sfxRules: string[];
  tensions: Partial<Record<ComicCouncilId, string>>;
}

export const COMIC_MANGA_COUNCIL: Record<ComicCouncilId, ComicCouncilMember> = {
  DARK_NOIR: {
    id: 'DARK_NOIR',
    name: 'The Dark Noir Expressionist',
    role: 'AUTEUR',
    genre: 'Cyber-Gothic / Hardboiled Crime / Psychological Action',
    styleEra: '1980s Modern Dark Age & Mignola Gothic',
    epithet: 'The Shadow Carver',
    voice: 'Clipped, cynical, poetic gravel. Speaks in silhouettes and wet asphalt. Distrusts excessive color; demands spotting blacks that swallow the page.',
    layoutPhilosophy: 'Negative space is a character. Panels are carved out of pure darkness with razor-sharp black gutters. High-contrast chiaroscuro where light only exists to reveal danger.',
    framingRules: [
      'Spotting blacks: At least 40% of the panel must be deep ink or shadow.',
      'Asymmetric diagonal gutters to convey vertigo and psychological instability.',
      'Use heavy silhouettes for characters; highlight only eyes, weapon edges, and cigarette embers.',
      'Single vivid accent color (e.g. pumpkin orange, crimson blood, toxic emerald) against stark monochrome.'
    ],
    balloonRules: [
      'Square, rectangular caption boxes for hardboiled internal monologue; anchor at top-left or bottom-right.',
      'Spoken balloons are compact, brutal, and jagged with heavy outlines.',
      'Never clutter the shadow; tuck dialogue into ambient light fields.'
    ],
    sfxRules: [
      'Carved, jagged, heavy block lettering with zero drop shadow—the sound cuts directly into the art.',
      'Sounds like BLAM, CRACK, SNAP are drawn as bone-dry impacts.'
    ],
    tensions: {
      DYNAMIC_ARCHITECT: 'The Architect wants heroic symmetry. I want a crooked alleyway where nobody wins cleanly.',
      SHOJO_EXPRESSION: 'Emotion is not floral vapor. Emotion is bleeding in the gutter with your teeth in your hand.',
      LIGNE_CLAIRE: 'Uniform line weights are too polite. Lines should look like they were carved with an exacto knife.'
    }
  },

  SEINEN_KINETIC: {
    id: 'SEINEN_KINETIC',
    name: 'The Seinen Manga Kineticist',
    role: 'ART_DIRECTOR',
    genre: 'Hard Sci-Fi / Cyberpunk / Dark Fantasy / Body Horror',
    styleEra: '1980s–90s Golden Age Manga & Modern Seinen',
    epithet: 'The Speed of Steel',
    voice: 'Hyper-focused on physics, weight, momentum, and architectural scale. Analyzes motion vectors, explosive mechanical debris, and rotational camera arcs.',
    layoutPhilosophy: 'The page is a particle accelerator. Directional flow follows the exact velocity of the action. Multi-tiered horizontal letterbox panels build unbearable tension before exploding into double-page panoramic splashes.',
    framingRules: [
      'Extreme contrast between colossal architectural backdrops and microscopic human figures.',
      'Perspective grids with 3-point forced distortion for explosions, diving vehicles, and chain whips.',
      'Dynamic speed lines (Kakeami and Nagare) originating from the impact epicenter.',
      'Deconstruct complex physical acts into 3 rapid micro-beat panels before the impact frame.'
    ],
    balloonRules: [
      'Vertical or diagonal Japanese-hybrid speech bubbles with high-tension needle tails.',
      'Whispers and robotic radio comms in dashed-line or hexagonal technological balloons.',
      'Balloons never overlap the focal point of kinetic action—they ride the wake of the movement.'
    ],
    sfxRules: [
      'Onomatopoeia drawn as three-dimensional objects integrated into the physical world (KATZUMMM, DOKAAAAN, GYAAA).',
      'Lettering warps and bends along the perspective lines of the shockwave.'
    ],
    tensions: {
      DARK_NOIR: 'You hide everything in black ink because you are afraid to draw the internal pistons and hydraulic lines.',
      CINEMATIC_MODERN: 'Hollywood widescreen is static. A page should make the reader feel the wind pressure of the blast.',
      DYNAMIC_ARCHITECT: 'Your characters pose for photographs. My characters are caught in the middle of breaking their collarbones.'
    }
  },

  DYNAMIC_ARCHITECT: {
    id: 'DYNAMIC_ARCHITECT',
    name: 'The Dynamic Silver Architect',
    role: 'AUTEUR',
    genre: 'Cosmic Superhero / Pulpy Space Opera / Mythic Adventure',
    styleEra: '1960s–70s Silver Age (Kirby & Eisner Tradition)',
    epithet: 'The Cosmic Mason',
    voice: 'Booming, grand, mythic cadence. Believes in heroic anatomy, moral weight, cosmic machinery, and the architectural sanctity of the 9-panel and 6-panel grid.',
    layoutPhilosophy: 'The comic page is classical architecture. Panels are structural beams that hold the universe together—until the hero literally punches through the border into the gutter.',
    framingRules: [
      'Extreme foreshortening: A fist, weapon, or ship nose breaking out of the panel boundary.',
      'Kirby Krackle: Fractal black dots surrounded by colored energy aura around power sources.',
      'Heroic low-angle perspective making every protagonist look monumental.',
      'Clear, rhythmic Z-path reading flow that never confuses the reader for a second.'
    ],
    balloonRules: [
      'Graceful, curved oval balloons with elegant, tapering tails that aim precisely at the speaker mouth.',
      'Bold heraldic title banners and narrative scroll captions with ornate dropped capitals.',
      'Stacked double balloons for dramatic declarations.'
    ],
    sfxRules: [
      'Explosive, colorful, three-dimensional extruded letters with contrasting outlines and drop shadows (KRAK-BOOM, THRAKKK, ZZZWAPP!).'
    ],
    tensions: {
      DARK_NOIR: 'You wallow in misery and shadows. Comics are about energy, aspiration, and the boundless human spirit!',
      SHOJO_EXPRESSION: 'Where are the structural pillars? Floating petals cannot support a dramatic narrative!'
    }
  },

  LIGNE_CLAIRE: {
    id: 'LIGNE_CLAIRE',
    name: 'The Franco-Belgian Visionary',
    role: 'ART_DIRECTOR',
    genre: 'Philosophical Sci-Fi / Moebius Surrealism / European BD',
    styleEra: '1970s Métal Hurlant / Ligne Claire',
    epithet: 'The Desert Cartographer',
    voice: 'Contemplative, serene, observant. Speaks in quiet wonder; values the uniform weight of an ink line that treats a spaceship, a rock, and a human eyelash with equal sacred dignity.',
    layoutPhilosophy: 'Breathe. The universe is immense, silent, and indifferent. Wide, open gutters; clean rectangular panels with golden ratio proportions; expansive horizon lines that let the eye wander.',
    framingRules: [
      'Uniform line weight across foreground, midground, and background.',
      'Vast panoramic landscapes where machines and nature achieve strange surreal symbiosis.',
      'Generous white or neutral parchment gutters that give the artwork room to radiate.',
      'Delicate, meticulous stippling and crosshatching instead of solid ink fills.'
    ],
    balloonRules: [
      'Crisp, rectangular or gentle pill-shaped balloons with whisper-thin borders.',
      'Subdued, philosophical captions that read like journal entries from an ancient explorer.'
    ],
    sfxRules: [
      'Minimalist, whisper-quiet sound indicators (flic, clac, vroumm) that never overwhelm the line art.'
    ],
    tensions: {
      SEINEN_KINETIC: 'Why must everything scream and explode? The most terrifying moments in the cosmos are completely silent.',
      DARK_NOIR: 'Your black ink hides the world; my clear line reveals its infinite texture.'
    }
  },

  CINEMATIC_MODERN: {
    id: 'CINEMATIC_MODERN',
    name: 'The Modern Cinematic Sequentialist',
    role: 'WRITER',
    genre: 'Prestige Graphic Drama / Widescreen Action / Event Comics',
    styleEra: '2000s–Present Widescreen Revolution',
    epithet: 'The Director-in-Ink',
    voice: 'Sharp, television-literate, conversational. Thinks in anamorphic lenses, lighting cues, pacing beats, and cinematic match cuts. Prioritizes naturalistic character acting.',
    layoutPhilosophy: 'Decompress the emotional beats. Use widescreen 16:9 letterbox panels stacked vertically, interspersed with floating micro-insets to catch emotional shifts in a character eyes before a line is spoken.',
    framingRules: [
      'Anamorphic 2.39:1 widescreen panel ratios that mimic cinema cinematography.',
      'Overlapping portrait insets to capture micro-expressions during large group scenes.',
      'Dramatic page-turn reveals: Even-numbered pages end on a question/cliffhanger; odd-numbered pages hit with the visual answer.',
      'Volumetric digital rim-lighting and atmospheric color grading.'
    ],
    balloonRules: [
      'Conversational dialogue pacing: Staggered, overlapping bubbles that mimic natural speech interruptions.',
      'Off-panel dialogue indicates distance with muted fonts and directional dashed tails.'
    ],
    sfxRules: [
      'Subtle, cinematic ambient SFX integrated into the color pass rather than drawn as comic decals.'
    ],
    tensions: {
      DYNAMIC_ARCHITECT: 'Exposition is dead. Characters should talk like real human beings, not proclaim manifestos to the rafters.',
      SEINEN_KINETIC: 'Ten pages of flying rubble without emotional stakes is just visual noise.'
    }
  },

  SHOJO_EXPRESSION: {
    id: 'SHOJO_EXPRESSION',
    name: 'The Lyrical Emotional Expressionist',
    role: 'ART_DIRECTOR',
    genre: 'Psychological Dark Fantasy / Romantic Gothic / Emotional Metaphor',
    styleEra: '1990s Clamp & Classic Gothic Shojo',
    epithet: 'The Weaver of Solitude',
    voice: 'Passionate, lyrical, intuitive. Understands that a broken heart or a feeling of betrayal is more catastrophic than an exploding planet. Measures space by psychological weight.',
    layoutPhilosophy: 'Panel borders are fragile membranes. When emotion overflows, panels shatter, overlap, and bleed directly across the page. Backgrounds dissolve into symbolic dreamscapes—thorns, shattered glass, falling leaves, clock gears.',
    framingRules: [
      'Borderless bleeding figures that float across multiple chronological panel tiers.',
      'Diagonal dynamic panel slices that mirror internal psychological fracture.',
      'Extreme close-ups on eyes, trembling lips, and clenched hands surrounded by symbolic screentone patterns.',
      'High-contrast dramatic lighting with glowing atmospheric halos.'
    ],
    balloonRules: [
      'Borderless, soft-edged clouds for internal thought poetry.',
      'Text floats directly on the artwork during moments of spiritual crisis or realization.',
      'Tears and rain merge into shimmering vertical washes.',
      'Delicate, calligraphic tails that curve organically.'
    ],
    sfxRules: [
      'Lyrical, delicate sound effects (shiver, flutter, doki-doki, drip) rendered in thin, elegant brushstrokes.'
    ],
    tensions: {
      DARK_NOIR: 'You think darkness is tough; real darkness is feeling completely alone in a room full of people.',
      CINEMATIC_MODERN: 'Widescreen cameras cannot film what happens inside the soul.'
    }
  }
};

export const COMIC_COUNCIL_LIST = Object.values(COMIC_MANGA_COUNCIL);

// ============================================================================
// CINEMA-TO-GRAPHIC-NOVEL TRANSLITERATION & EDITORIAL CHOREOGRAPHY ENGINE
// ============================================================================

export type PageLayoutArchetype =
  | 'OPEN_BLEED_SLASH_WRAP'       // Open-bleed splash + 15° diagonal slash duel + interlocking L-wrap
  | 'LETTERBOX_SAM25D_SCOPE'      // 2.39:1 letterbox + Meta SAM 2.5D pop-out hero + circular reticle/lens scope
  | 'WIDESCREEN_PIP_INSET'        // Wide dramatic anchor with floating Eisner PIP inset + staccato reaction strip
  | 'SEINEN_VERTICAL_TRIPTYCH'    // 3 tall vertical pillars (stalking/tension) + bottom widescreen reveal
  | 'CINEMAGRAPH_KINETIC_CASCADE';// Live cinemagraph video loop hero + diagonal slash + asymmetric cascade

export interface TransliteratedBalloon {
  id: string;
  speaker: string;
  speakerRefId?: string;
  text: string;
  style: 'speech' | 'shout' | 'whisper' | 'comm' | 'thought';
  anchorCorner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  tailDirection: 'down-left' | 'down-right' | 'up-left' | 'up-right';
  startSec: number;
  endSec: number;
}

/**
 * Strips screenplay/camera directions ("Extreme Wide Shot of...", "The camera pans...", "MCU:", etc.)
 * and transliterates only meaningful narrative/location/internal-monologue anchors into concise comic captions.
 * Returns null if the panel is best served by pure sequential art + dialogue/SFX without a caption box.
 */
export function transliterateActionToComicCaption(
  rawAction: string,
  slugline: string,
  isFirstPanelOfPage: boolean,
  hasHeavyDialogue: boolean
): { header?: string; body: string } | null {
  if (!rawAction && !isFirstPanelOfPage) return null;

  // Strip all cinematic camera/framing jargon that never belongs inside a comic panel frame
  let cleaned = (rawAction || '')
    .replace(
      /^(extreme\s+wide\s+shot|wide\s+shot|medium\s+wide\s+shot|medium\s+shot|medium\s+close[- ]?up|close[- ]?up|extreme\s+close[- ]?up|two[- ]?shot|over[- ]?the[- ]?shoulder\s+shot|pov\s+shot|insert\s+shot|establishing\s+shot|low[- ]?angle\s+shot|high[- ]?angle\s+shot|tracking\s+shot|aerial\s+shot|dutch\s+angle\s+shot|ews|ws|mws|ms|mcu|cu|ecu|ots|pov)\b\s*(of|on|showing|capturing|revealing|framing|:|-|—)?\s*/gi,
      ''
    )
    .replace(
      /\b(the\s+camera\s+(pans|tilts|tracks|dollies|zooms|pulls\s+back|pushes\s+in|follows|holds|lingers)[^.;,]*[.,;]?)/gi,
      ''
    )
    .replace(/\b(in\s+a\s+(wide|medium|tight|close|low|high|static|handheld)\s+(shot|angle|frame)\b[,;.]?)/gi, '')
    .replace(/\b(we\s+see|framed\s+in|cut\s+to|dissolve\s+to|smash\s+cut\s+to)\b\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // First panel of a page always gets a crisp location/atmosphere anchor box
  if (isFirstPanelOfPage) {
    const cleanLoc = (slugline || '')
      .replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*/i, '')
      .replace(/\s*-\s*/g, ' // ')
      .trim();
    const firstSentence = (cleaned.split(/(?<=[.!?])\s+/)[0] || '').slice(0, 95);
    return {
      header: cleanLoc || 'NIGHTFALL',
      body: firstSentence,
    };
  }

  // If the panel already has 2+ dialogue balloons, omit the caption so we NEVER obscure the artwork!
  if (hasHeavyDialogue) {
    return null;
  }

  // Only emit an editorial narrative caption on pivotal atmospheric beats (keep under 16 words)
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 5 && words.length <= 18 && /(blood|shadow|mask|knife|tape|grave|dark|silence|wind|scream|fire|pumpkin|woods)/i.test(cleaned)) {
    return {
      body: words.slice(0, 16).join(' ') + (words.length > 16 ? '...' : ''),
    };
  }

  return null;
}

/**
 * Splits a long spoken dialogue line into natural, Breath-Sized Comic Balloons (max ~18-22 words / 115 chars)
 * so that no single speech balloon ever turns into a wall of text covering the panel art.
 */
export function splitSpokenLineIntoComicClauses(text: string, maxChars = 110): string[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  // First split by sentence boundaries (. ! ? — ;)
  const sentences = clean
    .split(/(?<=[.!?—;])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const flushChunk = (str: string) => {
    if (str.length <= maxChars) {
      chunks.push(str);
      return;
    }
    // Further split long single sentences at comma / conjunction pauses
    const clauses = str.split(/(?<=,)\s+|\s+(?=(?:and|but|because|while|before|until|so|when)\b)/i);
    let sub = '';
    for (const cl of clauses) {
      if (!sub) {
        sub = cl;
      } else if ((sub + ' ' + cl).length <= maxChars) {
        sub += ' ' + cl;
      } else {
        chunks.push(sub.trim());
        sub = cl;
      }
    }
    if (sub.trim()) chunks.push(sub.trim());
  };

  for (const sent of sentences) {
    if (!current) {
      current = sent;
    } else if ((current + ' ' + sent).length <= maxChars) {
      current += ' ' + sent;
    } else {
      flushChunk(current);
      current = sent;
    }
  }
  if (current) flushChunk(current);
  return chunks;
}

/**
 * Selects a non-repeating, story-driven Page Layout Archetype so every page feels
 * curated by a veteran Graphic Novel Editor rather than a uniform grid.
 */
export function selectEditorialPageLayout(
  pageNumber: number,
  sceneTone: string,
  panelCount: number,
  prevLayout?: PageLayoutArchetype
): PageLayoutArchetype {
  const archetypes: PageLayoutArchetype[] = [
    'OPEN_BLEED_SLASH_WRAP',
    'LETTERBOX_SAM25D_SCOPE',
    'WIDESCREEN_PIP_INSET',
    'SEINEN_VERTICAL_TRIPTYCH',
    'CINEMAGRAPH_KINETIC_CASCADE',
  ];
  const tone = (sceneTone || '').toLowerCase();
  let preferredIdx = (pageNumber - 1) % archetypes.length;

  if (/terror|panic|slash|attack|murder|climax|blood/i.test(tone)) {
    preferredIdx = pageNumber % 2 === 0 ? 0 : 4;
  } else if (/stalk|dread|suspense|isolation|paranoid/i.test(tone)) {
    preferredIdx = pageNumber % 2 === 0 ? 1 : 3;
  } else if (/secret|confession|intimate|grief|memory/i.test(tone)) {
    preferredIdx = 2;
  }

  let chosen = archetypes[preferredIdx];
  if (chosen === prevLayout) {
    chosen = archetypes[(preferredIdx + 1) % archetypes.length];
  }
  return chosen;
}

// ============================================================================
// HARD EDITORIAL RULE: ZERO FACE OR KEY-ACTION OBSTRUCTION BY DIALOGUE
// ============================================================================

export const COMIC_LETTERING_SAFE_ZONE_RULES = [
  'RULE 1 (NO FACE OCCLUSION): Dialogue balloons, thought clouds, and captions must NEVER cover a character face, eyes, mouth, or head silhouette.',
  'RULE 2 (NO KEY-ACTION OCCLUSION): The central action corridor (x: 22%–78%, y: 18%–78%) and high-energy kinetic focal points (weapons, hands, impacts, key props) are strict No-Fly Zones for balloon bodies.',
  'RULE 3 (NEGATIVE-SPACE & GUTTER DOCKING): Balloons must be placed in verified low-saliency negative space (sky, shadow, wall, floor margin) or docked flush against the panel border / gutter rail.',
  'RULE 4 (CLOSE-UP CHIN/GUTTER RAIL): In Close-Up (CU) and Extreme Close-Up (ECU) panels where a face fills the upper/middle frame, balloons must dock flush to the bottom gutter rail (y >= 74%) or top border rail (y <= 4%) with compact width (<= 36%) so 100% of the eyes and facial expression remain unobstructed.',
  'RULE 5 (DIRECTIONAL TAIL VECTORING): Only the thin SVG pointer tail aims toward the speaker mouth quadrant, terminating outside the face bounding box.',
] as const;

export type SafeAnchorZone =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-gutter-flush'
  | 'bottom-gutter-flush';

export interface BoundingBoxPct {
  /** 0..100 percentage of panel width/height */
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'face' | 'action';
  confidence: number;
}

export interface SafeBalloonPlacement {
  anchorZone: SafeAnchorZone;
  /** 0..100 percentage left position for Konva / CSS */
  x: number;
  /** 0..100 percentage top position for Konva / CSS */
  y: number;
  /** 0..100 percentage width */
  width: number;
  tailDirection: 'down-left' | 'down-right' | 'up-left' | 'up-right';
  /** Target speaker mouth/head coordinate (0..100%) for pointer tail orientation */
  tailTargetX: number;
  tailTargetY: number;
  obstructionScore: number;
}

const CANDIDATE_ZONES: Record<
  SafeAnchorZone,
  { x: number; y: number; width: number; height: number }
> = {
  'top-left': { x: 3, y: 4, width: 36, height: 18 },
  'top-right': { x: 61, y: 4, width: 36, height: 18 },
  'bottom-left': { x: 3, y: 76, width: 36, height: 18 },
  'bottom-right': { x: 61, y: 76, width: 36, height: 18 },
  'top-gutter-flush': { x: 32, y: 2, width: 36, height: 14 },
  'bottom-gutter-flush': { x: 32, y: 82, width: 36, height: 14 },
};

function computeBoxIoU(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const areaA = Math.max(1, a.width * a.height);
  return inter / areaA;
}

/**
 * Estimates default face and key-action bounding boxes from cinematic framing and action description
 * when pixel-level image saliency has not yet run.
 */
export function estimateFramingFaceAndActionBoxes(
  framing = 'MS',
  actionText = ''
): BoundingBoxPct[] {
  const f = (framing || 'MS').toUpperCase();
  const act = (actionText || '').toLowerCase();
  const boxes: BoundingBoxPct[] = [];

  if (f.includes('ECU') || f.includes('EXTREME CLOSE') || f === 'CU' || f.includes('CLOSE-UP')) {
    // Tight close-up: face occupies upper-middle and center of the frame (x: 24..76, y: 8..72)
    boxes.push({ x: 24, y: 8, width: 52, height: 64, kind: 'face', confidence: 0.95 });
  } else if (f.includes('MCU') || f.includes('MEDIUM CLOSE')) {
    // Medium close-up: head/face in upper-center (x: 30..70, y: 8..48), torso/hands below
    boxes.push({ x: 30, y: 8, width: 40, height: 40, kind: 'face', confidence: 0.9 });
    boxes.push({ x: 28, y: 48, width: 44, height: 36, kind: 'action', confidence: 0.75 });
  } else if (f.includes('TWO') || f.includes('OTS') || /two|both|each other|confront/i.test(act)) {
    // Two-shot / OTS: faces at left-mid and right-mid upper third
    boxes.push({ x: 16, y: 12, width: 26, height: 34, kind: 'face', confidence: 0.85 });
    boxes.push({ x: 58, y: 12, width: 26, height: 34, kind: 'face', confidence: 0.85 });
    boxes.push({ x: 25, y: 40, width: 50, height: 40, kind: 'action', confidence: 0.75 });
  } else {
    // Wide / Medium shot: head in upper-center, key action in center corridor
    boxes.push({ x: 34, y: 12, width: 32, height: 30, kind: 'face', confidence: 0.8 });
    boxes.push({ x: 24, y: 34, width: 52, height: 42, kind: 'action', confidence: 0.85 });
  }

  // Directional action cues in description
  if (/\bleft\b/i.test(act)) {
    boxes.push({ x: 10, y: 18, width: 38, height: 50, kind: 'action', confidence: 0.8 });
  }
  if (/\bright\b/i.test(act)) {
    boxes.push({ x: 52, y: 18, width: 38, height: 50, kind: 'action', confidence: 0.8 });
  }

  return boxes;
}

/**
 * Computes the optimal balloon placement that NEVER covers a character's face or obstructs key action.
 */
export function computeSafeBalloonPlacement(params: {
  balloonIndex: number; // 0 for first balloon on panel, 1 for second balloon on panel
  totalBalloonsOnPanel: number;
  hasOpeningCaption?: boolean;
  framing?: string;
  actionText?: string;
  detectedBoxes?: BoundingBoxPct[];
  zoneEnergyScores?: Partial<Record<SafeAnchorZone, number>>;
  alreadyUsedZones?: SafeAnchorZone[];
}): SafeBalloonPlacement {
  const {
    balloonIndex,
    hasOpeningCaption = false,
    framing = 'MS',
    actionText = '',
    detectedBoxes,
    zoneEnergyScores = {},
    alreadyUsedZones = [],
  } = params;

  const boxes =
    detectedBoxes && detectedBoxes.length > 0
      ? detectedBoxes
      : estimateFramingFaceAndActionBoxes(framing, actionText);

  const primaryFace =
    boxes.find((b) => b.kind === 'face') ||
    boxes[0] || { x: 35, y: 15, width: 30, height: 30, kind: 'face' as const, confidence: 0.8 };
  const faceCenterX = primaryFace.x + primaryFace.width / 2;
  const faceCenterY = primaryFace.y + primaryFace.height / 2;

  const isCloseUp = /^(CU|ECU|MCU)$/i.test((framing || '').trim());

  const candidateOrder: SafeAnchorZone[] =
    balloonIndex === 0
      ? isCloseUp
        ? ['bottom-left', 'bottom-right', 'bottom-gutter-flush', 'top-left', 'top-right', 'top-gutter-flush']
        : ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'bottom-gutter-flush', 'top-gutter-flush']
      : ['bottom-right', 'bottom-left', 'bottom-gutter-flush', 'top-right', 'top-left', 'top-gutter-flush'];

  let bestZone: SafeAnchorZone = candidateOrder[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (let orderIdx = 0; orderIdx < candidateOrder.length; orderIdx++) {
    const zoneName = candidateOrder[orderIdx];
    if (alreadyUsedZones.includes(zoneName)) continue;
    // Never collide with the opening caption box in top-left
    if (hasOpeningCaption && (zoneName === 'top-left' || zoneName === 'top-gutter-flush')) continue;

    const zRect = CANDIDATE_ZONES[zoneName];
    let score = orderIdx * 4; // slight preference for natural reading order (top-to-bottom, left-to-right)

    // Add pixel saliency / edge energy score if available (0..100)
    if (typeof zoneEnergyScores[zoneName] === 'number') {
      score += zoneEnergyScores[zoneName]!;
    }

    // Check overlap with every Face and Key-Action bounding box
    for (const box of boxes) {
      const overlap = computeBoxIoU(zRect, box);
      if (overlap > 0) {
        // Massive penalty for touching a character's face (Rule 1) or key action (Rule 2)
        const weight = box.kind === 'face' ? 10000 : 4500;
        score += overlap * weight * (box.confidence || 1);
      }
    }

    // In Close-Ups (CU/ECU), strongly favor bottom gutter rails so eyes/forehead are 100% clear
    if (isCloseUp && zoneName.startsWith('top-')) {
      score += 250;
    }

    if (score < bestScore) {
      bestScore = score;
      bestZone = zoneName;
    }
  }

  const chosenRect = CANDIDATE_ZONES[bestZone];
  const zoneCenterX = chosenRect.x + chosenRect.width / 2;
  const zoneCenterY = chosenRect.y + chosenRect.height / 2;

  // Compute pointer tail orientation pointing toward the speaker's face/mouth without overlapping it
  const tailUp = zoneCenterY > faceCenterY;
  const tailLeft = zoneCenterX > faceCenterX;
  const tailDirection: SafeBalloonPlacement['tailDirection'] = tailUp
    ? tailLeft
      ? 'up-left'
      : 'up-right'
    : tailLeft
      ? 'down-left'
      : 'down-right';

  return {
    anchorZone: bestZone,
    x: chosenRect.x,
    y: chosenRect.y,
    width: chosenRect.width,
    tailDirection,
    tailTargetX: Math.round(faceCenterX),
    tailTargetY: Math.round(Math.min(85, primaryFace.y + primaryFace.height * 0.78)),
    obstructionScore: Math.round(bestScore),
  };
}

/**
 * Real-time HTML5 Canvas image analyzer that detects skin-tone / face clusters and high-contrast
 * action edge energy across a loaded panel HTMLImageElement, returning face/action bounding boxes
 * and candidate zone obstruction scores so balloons automatically dodge faces and key action.
 */
export function analyzeImageElementForFaceAndActionSafeZones(
  img: HTMLImageElement
): {
  boxes: BoundingBoxPct[];
  zoneEnergyScores: Record<SafeAnchorZone, number>;
} {
  const defaultScores: Record<SafeAnchorZone, number> = {
    'top-left': 20,
    'top-right': 20,
    'bottom-left': 15,
    'bottom-right': 15,
    'top-gutter-flush': 25,
    'bottom-gutter-flush': 12,
  };

  try {
    const W = 64;
    const H = 64;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { boxes: [], zoneEnergyScores: defaultScores };

    ctx.drawImage(img, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;

    // 1. Compute per-pixel skin-tone likelihood (YCrCb + warm flesh lighting) & Sobel edge energy
    const skinGrid = new Float32Array(W * H);
    const edgeGrid = new Float32Array(W * H);
    const lumaGrid = new Float32Array(W * H);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const Y = 0.299 * r + 0.587 * g + 0.114 * b;
        const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        lumaGrid[y * W + x] = Y;

        // Skin cluster in YCrCb space (works across diverse skin tones and warm tungsten/pumpkin lighting)
        const isSkin =
          Y > 35 &&
          Y < 245 &&
          Cr >= 131 &&
          Cr <= 178 &&
          Cb >= 75 &&
          Cb <= 132 &&
          r > g &&
          r > b;
        // Weight upper-two-thirds higher for faces/heads
        const headPrior = y < H * 0.68 ? 1.35 : 0.55;
        skinGrid[y * W + x] = isSkin ? headPrior : 0;
      }
    }

    let maxEdge = 1;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const gx =
          -lumaGrid[(y - 1) * W + (x - 1)] +
          lumaGrid[(y - 1) * W + (x + 1)] -
          2 * lumaGrid[y * W + (x - 1)] +
          2 * lumaGrid[y * W + (x + 1)] -
          lumaGrid[(y + 1) * W + (x - 1)] +
          lumaGrid[(y + 1) * W + (x + 1)];
        const gy =
          -lumaGrid[(y - 1) * W + (x - 1)] -
          2 * lumaGrid[(y - 1) * W + x] -
          lumaGrid[(y - 1) * W + (x + 1)] +
          lumaGrid[(y + 1) * W + (x - 1)] +
          2 * lumaGrid[(y + 1) * W + x] +
          lumaGrid[(y + 1) * W + (x + 1)];
        const mag = Math.hypot(gx, gy);
        edgeGrid[y * W + x] = mag;
        if (mag > maxEdge) maxEdge = mag;
      }
    }

    // 2. Locate primary Face centroid & bounding box
    let skinSum = 0;
    let skinX = 0;
    let skinY = 0;
    for (let y = 2; y < Math.floor(H * 0.78); y++) {
      for (let x = 4; x < W - 4; x++) {
        const w = skinGrid[y * W + x] * (1 + (edgeGrid[y * W + x] / maxEdge) * 0.5);
        if (w > 0) {
          skinSum += w;
          skinX += x * w;
          skinY += y * w;
        }
      }
    }

    const boxes: BoundingBoxPct[] = [];
    if (skinSum > 8) {
      const cxPct = (skinX / skinSum / W) * 100;
      const cyPct = (skinY / skinSum / H) * 100;
      const spreadPct = Math.min(48, Math.max(22, Math.sqrt(skinSum) * 2.2));
      boxes.push({
        x: Math.max(4, cxPct - spreadPct / 2),
        y: Math.max(4, cyPct - spreadPct / 2),
        width: spreadPct,
        height: spreadPct * 1.15,
        kind: 'face',
        confidence: 0.92,
      });
    }

    // 3. Locate primary Action / Focal Edge centroid
    let actSum = 0;
    let actX = 0;
    let actY = 0;
    for (let y = 4; y < H - 4; y++) {
      for (let x = 4; x < W - 4; x++) {
        const e = edgeGrid[y * W + x] / maxEdge;
        if (e > 0.28) {
          actSum += e;
          actX += x * e;
          actY += y * e;
        }
      }
    }
    if (actSum > 5) {
      const axPct = (actX / actSum / W) * 100;
      const ayPct = (actY / actSum / H) * 100;
      boxes.push({
        x: Math.max(8, axPct - 20),
        y: Math.max(8, ayPct - 20),
        width: 40,
        height: 40,
        kind: 'action',
        confidence: 0.85,
      });
    }

    // 4. Score all 6 candidate perimeter & gutter zones (lower = cleaner negative space)
    const zoneEnergyScores = {} as Record<SafeAnchorZone, number>;
    (Object.keys(CANDIDATE_ZONES) as SafeAnchorZone[]).forEach((zKey) => {
      const rect = CANDIDATE_ZONES[zKey];
      const x0 = Math.max(0, Math.floor((rect.x / 100) * W));
      const y0 = Math.max(0, Math.floor((rect.y / 100) * H));
      const x1 = Math.min(W, Math.ceil(((rect.x + rect.width) / 100) * W));
      const y1 = Math.min(H, Math.ceil(((rect.y + rect.height) / 100) * H));
      let sumScore = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const skinPenalty = skinGrid[y * W + x] * 180;
          const edgePenalty = (edgeGrid[y * W + x] / maxEdge) * 65;
          sumScore += skinPenalty + edgePenalty;
          count++;
        }
      }
      zoneEnergyScores[zKey] = count > 0 ? sumScore / count : 20;
    });

    return { boxes, zoneEnergyScores };
  } catch {
    return { boxes: [], zoneEnergyScores: defaultScores };
  }
}


