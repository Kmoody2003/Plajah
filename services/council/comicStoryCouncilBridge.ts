/**
 * services/council/comicStoryCouncilBridge.ts — Master Creative Art Council & Story Council Bridge
 * 
 * Convenes the full spectrum of sequential art masters, story architects, and visual directors
 * to guide comic books, manga, graphic novels, and children's storybooks within the Tela document paradigm.
 * 
 * Bridges:
 * 1. Creative Art Council: 7 Master Art Directors & Aesthetic Lenses (Noir, Shonen/Seinen, Silver Age,
 *    Ligne Claire, Modern Cinematic, Shojo Emotional, and Children's Whimsical Storybook).
 * 2. Story Council: 5 Narrative Directors (World & Lore Architect, Screenplay & Adaptation Dramatist,
 *    Interactive Narrative & Play Designer, Lettering & Typography Master, Generative Co-Pilot).
 * 3. Dual-Audience Adaptation: Seamlessly translates between "Junior / School Explorer" (friendly, intuitive,
 *    1-click magic) and "Pro Studio Master" (Clip Studio & Autodesk Sketchbook parity).
 */

import { COMIC_MANGA_COUNCIL, type ComicCouncilId, type ComicCouncilMember } from './comicMangaCouncil';
import type { Character, LoreEntry, IPWorld } from '../../types';

export type AudienceTier = 'JUNIOR_SCHOOL' | 'PRO_STUDIO';

export interface ArtDirectorLens {
  id: string;
  name: string;
  epithet: string;
  role: 'ART_DIRECTOR' | 'AUTEUR';
  genreTradition: string;
  styleEra: string;
  voice: string;
  juniorAdvice: string;
  proAdvice: string;
  recommendedLayouts: string[];
  recommendedBrushes: string[];
  recommendedScreentones: string[];
  recommendedBalloons: string[];
  palette: {
    primary: string;
    accent: string;
    gutter: string;
    background: string;
    textColor: string;
  };
}

export interface StoryDirectorLens {
  id: string;
  name: string;
  title: string;
  craft: 'WORLD_LORE' | 'SCREENPLAY_FILM' | 'INTERACTIVE_PLAY' | 'LETTERING_SFX' | 'GENERATIVE_AI';
  voice: string;
  juniorGuidance: string;
  proGuidance: string;
  mandates: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATIVE ART COUNCIL (7 Master Aesthetic Lenses)
// ─────────────────────────────────────────────────────────────────────────────

export const ART_COUNCIL_LENSES: Record<string, ArtDirectorLens> = {
  STORYBOOK_WHIMSY: {
    id: 'STORYBOOK_WHIMSY',
    name: 'The Whimsical Storyteller',
    epithet: 'The Picture Book Weaver',
    role: 'AUTEUR',
    genreTradition: 'Children’s Picture Book / Whimsical Fantasy / Gentle Fable',
    styleEra: 'Beatrix Potter, Maurice Sendak & Studio Ghibli Watercolor',
    voice: 'Warm, encouraging, imaginative, and cozy. Believes every child has a magic world inside waiting to be painted.',
    juniorAdvice: 'Make your pictures big and friendly! Put your hero right in the middle, and leave space at the bottom for your words so everyone can read along.',
    proAdvice: 'Preserve natural paper tooth and pigment pooling. Integrate organic text flow around negative space with soft watercolor washes and delicate graphite outlines.',
    recommendedLayouts: ['picture_book_top_bottom', 'bedtime_split_2', 'storybook_grid_4', 'sunday_funnies_3'],
    recommendedBrushes: ['watercolor_wash', 'sketching_pencil_2b', 'soft_airbrush'],
    recommendedScreentones: ['none', 'dots_fine'],
    recommendedBalloons: ['children_scribble', 'storybook_ribbon', 'thought_cloud'],
    palette: {
      primary: '#f59e0b',
      accent: '#10b981',
      gutter: '#fef3c7',
      background: '#fffbeb',
      textColor: '#1e293b',
    },
  },

  DARK_NOIR: {
    id: 'DARK_NOIR',
    name: 'The Dark Noir Expressionist',
    epithet: 'The Shadow Carver',
    role: 'AUTEUR',
    genreTradition: 'Hardboiled Detective / Cyber-Gothic / Sin City',
    styleEra: '1980s Dark Age, Frank Miller & Mike Mignola',
    voice: 'Clipped, cynical, poetic gravel. Demands deep spotting blacks that swallow the page and high-contrast chiaroscuro.',
    juniorAdvice: 'Turn off the lights! Draw strong dark shadows and make your hero’s eyes or jacket glow like a flashlight in the dark.',
    proAdvice: 'Negative space is your primary architecture. Use high-tension asymmetric gutters, minimum 40% spotting blacks, and razor-sharp rim lights with single saturated color accents.',
    recommendedLayouts: ['grid_6_classic', 'manga_slanted_slash_6', 'cinematic_letterbox_3'],
    recommendedBrushes: ['g_pen', 'kabura_pen', 'kneaded_eraser'],
    recommendedScreentones: ['crosshatch', 'dots_coarse'],
    recommendedBalloons: ['narration_parchment', 'internal_monologue_dark', 'shout_burst'],
    palette: {
      primary: '#f43f5e',
      accent: '#fbbf24',
      gutter: '#090a0f',
      background: '#0f1117',
      textColor: '#f8fafc',
    },
  },

  SEINEN_KINETIC: {
    id: 'SEINEN_KINETIC',
    name: 'The Seinen Manga Kineticist',
    epithet: 'The Speed of Steel',
    role: 'ART_DIRECTOR',
    genreTradition: 'Cyberpunk Action / Dark Fantasy / Hard Sci-Fi',
    styleEra: 'Otomo (Akira), Miura (Berserk), Nihei (Blame!)',
    voice: 'Hyper-focused on momentum, mechanical anatomy, explosive debris, and forced 3-point perspective lines.',
    juniorAdvice: 'Zoom in fast! Add lots of cool speed lines so your robot or ninja looks like they are zooming right off the screen with a giant sound effect!',
    proAdvice: 'Align all panel vectors along kinetic velocity arcs. Employ multi-tiered horizontal tiers leading into an explosive 3-point perspective climax with genuine screentone gradients.',
    recommendedLayouts: ['shonen_dynamic_5', 'seinen_perspective_blast', 'manga_slanted_slash_6'],
    recommendedBrushes: ['maru_pen', 'g_pen', 'screentone_speedlines'],
    recommendedScreentones: ['speed_lines', 'radial_burst', 'dots_fine'],
    recommendedBalloons: ['high_tension_needle', 'cyber_hexagonal', 'shout_burst'],
    palette: {
      primary: '#06b6d4',
      accent: '#ec4899',
      gutter: '#ffffff',
      background: '#18181b',
      textColor: '#000000',
    },
  },

  DYNAMIC_ARCHITECT: {
    id: 'DYNAMIC_ARCHITECT',
    name: 'The Dynamic Silver Architect',
    epithet: 'The Cosmic Mason',
    role: 'AUTEUR',
    genreTradition: 'Cosmic Superhero / Mythic Pulp Adventure',
    styleEra: '1960s–70s Silver Age (Kirby, Eisner, Steranko)',
    voice: 'Booming, mythic, architectural. Believes in heroic anatomy, cosmic machinery, and breaking through the panel boundary.',
    juniorAdvice: 'Make your superhero punch right out of the panel box! Big sound effects like BOOM and POW make everything super exciting!',
    proAdvice: 'Establish rigid structural grids (6 or 9-panel) so when your character breaks foreshortening through the border, the structural rupture feels monumental. Add Kirby Krackle energy dots.',
    recommendedLayouts: ['grid_6_classic', 'grid_9_watchman', 'heroic_splash_insets'],
    recommendedBrushes: ['g_pen', 'copic_marker', 'technical_fineliner'],
    recommendedScreentones: ['dots_coarse', 'radial_burst'],
    recommendedBalloons: ['standard_oval', 'shout_burst', 'storybook_ribbon'],
    palette: {
      primary: '#eab308',
      accent: '#3b82f6',
      gutter: '#ffffff',
      background: '#1e293b',
      textColor: '#0f172a',
    },
  },

  LIGNE_CLAIRE: {
    id: 'LIGNE_CLAIRE',
    name: 'The Franco-Belgian Visionary',
    epithet: 'The Desert Cartographer',
    role: 'ART_DIRECTOR',
    genreTradition: 'European BD / Philosophical Sci-Fi / Exploration',
    styleEra: 'Moebius (The Incal), Hergé (Tintin), Enki Bilal',
    voice: 'Serene, contemplative, meticulous. Line weights are sacred and uniform, treating architecture and human eyes with equal grace.',
    juniorAdvice: 'Draw clean, neat lines that don’t wobble, and color everything with bright, even colors like a coloring book master!',
    proAdvice: 'Maintain uniform vector stroke thickness across planes. Let vast horizons and generous neutral parchment gutters give the illustration cosmic scale and breathing room.',
    recommendedLayouts: ['grid_6_classic', 'panoramic_double_spread', 'asymmetric_stagger_5'],
    recommendedBrushes: ['technical_fineliner', 'maru_pen', 'copic_marker'],
    recommendedScreentones: ['crosshatch', 'dots_fine'],
    recommendedBalloons: ['standard_oval', 'narration_parchment'],
    palette: {
      primary: '#14b8a6',
      accent: '#f97316',
      gutter: '#f8fafc',
      background: '#f1f5f9',
      textColor: '#0f172a',
    },
  },

  CINEMATIC_MODERN: {
    id: 'CINEMATIC_MODERN',
    name: 'The Modern Cinematic Sequentialist',
    epithet: 'The Director-in-Ink',
    role: 'WRITER',
    genreTradition: 'Prestige Graphic Drama / Widescreen Action',
    styleEra: '2000s Widescreen Revolution (Jim Lee, Fiona Staples)',
    voice: 'Sharp, conversational, cinematic. Thinks in 2.39:1 anamorphic framing, natural lighting, and psychological pacing.',
    juniorAdvice: 'Think like a movie director! Put a wide shot first to show where we are, then zoom in close on your hero’s face when they talk.',
    proAdvice: 'Decompress emotional beats. Stack widescreen letterbox panels with floating micro-insets to catch subtle eye shifts before dialogue lands. Color grade with volumetric rim lighting.',
    recommendedLayouts: ['cinematic_letterbox_3', 'heroic_splash_insets', 'webtoon_scroll_4'],
    recommendedBrushes: ['copic_marker', 'soft_airbrush', 'g_pen'],
    recommendedScreentones: ['none', 'dots_fine'],
    recommendedBalloons: ['standard_oval', 'whisper_dashed', 'narration_parchment'],
    palette: {
      primary: '#6366f1',
      accent: '#06b6d4',
      gutter: '#0b0f19',
      background: '#0f172a',
      textColor: '#ffffff',
    },
  },

  SHOJO_EXPRESSION: {
    id: 'SHOJO_EXPRESSION',
    name: 'The Lyrical Emotional Expressionist',
    epithet: 'The Weaver of Solitude',
    role: 'ART_DIRECTOR',
    genreTradition: 'Psychological Romance / Gothic Fantasy / Shojo Manga',
    styleEra: 'CLAMP, Naoko Takeuchi & Gothic Shojo',
    voice: 'Lyrical, intense, romantic. Measures space by heartache and wonder. Borders shatter when emotion overflows.',
    juniorAdvice: 'Draw pretty floating stars, hearts, and flower petals around your characters to show how happy, excited, or dreamy they feel!',
    proAdvice: 'Panel borders are emotional barriers. Dissolve rectangular panels into bleeding diagonal silhouettes, cherry blossoms, and starry gradients. Float internal poetry directly across the art.',
    recommendedLayouts: ['shojo_emotional_shatter', 'manga_slanted_slash_6', 'webtoon_dramatic_climax'],
    recommendedBrushes: ['watercolor_wash', 'soft_airbrush', 'maru_pen'],
    recommendedScreentones: ['dots_fine', 'radial_burst'],
    recommendedBalloons: ['shojo_blossom', 'thought_cloud', 'telepathic_aura'],
    palette: {
      primary: '#ec4899',
      accent: '#8b5cf6',
      gutter: '#fff1f2',
      background: '#fdf2f8',
      textColor: '#831843',
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. STORY COUNCIL (5 Master Narrative Directors)
// ─────────────────────────────────────────────────────────────────────────────

export const STORY_COUNCIL_LENSES: Record<string, StoryDirectorLens> = {
  WORLD_ARCHITECT: {
    id: 'WORLD_ARCHITECT',
    name: 'The World & Lore Architect',
    title: 'Keeper of Continuities',
    craft: 'WORLD_LORE',
    voice: 'Rigorous, encyclopedic, and visionary. Connects every character, artifact, and location into a living, interconnected World graph.',
    juniorGuidance: 'Pick your hero from your World Cast! Give them a fun name, a special superpower, and a pet companion so they are never lonely.',
    proGuidance: 'Synchronize character turnarounds, facial embeddings, and relationship trees from Fabula World. Ensure zero costume drift across sequential panels.',
    mandates: [
      'Every recurring character must have an immutable visual anchor (silhouette, color token, signature prop).',
      'Location backdrops must maintain geographical landmarks across reverse camera angles.',
      'Auto-sync newly introduced artifacts and factions back to the platform IPWorld ledger.',
    ],
  },

  SCREENPLAY_DRAMATIST: {
    id: 'SCREENPLAY_DRAMATIST',
    name: 'The Screenplay & Adaptation Dramatist',
    title: 'Director of the Film Bridge',
    craft: 'SCREENPLAY_FILM',
    voice: 'Fluent in cinematic screenplay structure, dramatic arcs, three-act pacing, and Hollywood formatting.',
    juniorGuidance: 'Tell a story with a Beginning, a Middle where something surprising happens, and a Grand Ending where your hero saves the day!',
    proGuidance: 'Bidirectional translation between standard Fountain/Final Draft screenplay scenes and sequential comic panels. Panels map directly into Fabula video animatic keyframes.',
    mandates: [
      'Establish scene location and time with proper SLUG LINES (e.g. EXT. RAINY ROOFTOP - NIGHT).',
      'Format internal monologue as VO (Voice Over) and dialogue as standard character cues.',
      'Provide 1-click export to Fabula video timeline with automated dialogue take synchronization.',
    ],
  },

  INTERACTIVE_PLAY: {
    id: 'INTERACTIVE_PLAY',
    name: 'The Interactive & Playful Narrative Designer',
    title: 'Architect of Living Documents',
    craft: 'INTERACTIVE_PLAY',
    voice: 'Joyful, game-literate, tactile. Believes reading should be an interactive adventure of touch, sound, and surprise.',
    juniorGuidance: 'Add fun sound buttons! Press a button to hear a thunder crash or make your characters talk with funny silly voices!',
    proGuidance: 'Leverage the Tela document engine: attach tap triggers, animated SVG screentone shaders, sequential audio foley, and karaoke text-to-speech highlighting.',
    mandates: [
      'Enable panel-by-panel audio playback via Plajah Audio Core and Procedural Foley.',
      'Support interactive tap-to-reveal panels and hidden Easter eggs for young readers.',
      'Retain non-destructive vector layers for instant translation and accessibility re-voicing.',
    ],
  },

  LETTERING_SFX: {
    id: 'LETTERING_SFX',
    name: 'The Lettering & Typography Master',
    title: 'Architect of the Voice & Impact',
    craft: 'LETTERING_SFX',
    voice: 'Obsessive about legibility, balloon balloon-tail trajectory, kerning, reading order, and dynamic sound effects.',
    juniorGuidance: 'Put the speech bubbles right next to who is talking so everyone knows who said what! Make the sounds super loud and colorful!',
    proGuidance: 'Balloons must lead the eye along an effortless reading Z-path. Balloon tails point toward the speaker mouth without crossing faces. SFX typography integrates into the physical scene perspective.',
    mandates: [
      'Maximum 25–35 words per speech balloon to prevent visual suffocation.',
      'Use 3D extrusion and dual-color outlines for explosive onomatopoeia.',
      'Support freely movable Bezier curve tails and multi-speaker branch tails.',
    ],
  },

  GENERATIVE_COPILOT: {
    id: 'GENERATIVE_COPILOT',
    name: 'The Generative Co-Pilot & PAI Bridge',
    title: 'Curator of Latent Synthesis',
    craft: 'GENERATIVE_AI',
    voice: 'Local-first, respectful of human handcraft, precision prompt engineer, master of style LoRAs and face anchors.',
    juniorGuidance: 'Type what you want to see—like "A golden dragon eating strawberry ice cream"—and watch the magic picture appear inside your panel!',
    proGuidance: 'Seamless PAI Gallery integration: pull past generations into any panel, freely transform, non-destructively clip, inpaint expressions, and apply authentic screentone shaders without leaving the canvas.',
    mandates: [
      'Enforce zero character likeness drift across panels using Face Embedding references.',
      'Keep AI layers non-destructive so artists can draw, ink, and erase over them.',
      'Support bidirectional PAI Gallery logic hooks: send to panel, extract layer to gallery.',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. CONVENED COUNCIL DELIBERATION & ADVICE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface CouncilProjectBrief {
  title: string;
  genre: string;
  storyPromptOrProse: string;
  audienceTier: AudienceTier;
  targetLayoutId?: string;
  selectedArtLensId?: string;
}

export interface CouncilSynthesisVerdict {
  leadArtDirector: ArtDirectorLens;
  leadStoryDirector: StoryDirectorLens;
  headlineSummary: string;
  practicalActionSteps: string[];
  recommendedLayout: string;
  recommendedBrush: string;
  recommendedPalette: ArtDirectorLens['palette'];
  sampleDialogueFormat: {
    speaker: string;
    line: string;
    balloonStyle: string;
  };
  sampleSfx: {
    word: string;
    style: string;
    positionAdvice: string;
  };
}

/**
 * Convene the Art Council and Story Council for a project.
 * Analyzes the user's genre, story, and audience level to synthesize tailored direction.
 */
export function conveneComicStoryCouncil(brief: CouncilProjectBrief): CouncilSynthesisVerdict {
  const isJunior = brief.audienceTier === 'JUNIOR_SCHOOL';
  
  // Pick primary art lens
  let artLensKey = brief.selectedArtLensId || 'STORYBOOK_WHIMSY';
  if (!brief.selectedArtLensId) {
    const text = (brief.title + ' ' + brief.genre + ' ' + brief.storyPromptOrProse).toLowerCase();
    if (isJunior || text.includes('kid') || text.includes('children') || text.includes('fable') || text.includes('fairy')) {
      artLensKey = 'STORYBOOK_WHIMSY';
    } else if (text.includes('cyber') || text.includes('noir') || text.includes('detective') || text.includes('shadow')) {
      artLensKey = 'DARK_NOIR';
    } else if (text.includes('mecha') || text.includes('manga') || text.includes('battle') || text.includes('shonen') || text.includes('action')) {
      artLensKey = 'SEINEN_KINETIC';
    } else if (text.includes('superhero') || text.includes('hero') || text.includes('cosmic') || text.includes('space')) {
      artLensKey = 'DYNAMIC_ARCHITECT';
    } else if (text.includes('love') || text.includes('romance') || text.includes('magic') || text.includes('shojo') || text.includes('gothic')) {
      artLensKey = 'SHOJO_EXPRESSION';
    } else if (text.includes('sci-fi') || text.includes('alien') || text.includes('desert') || text.includes('journey')) {
      artLensKey = 'LIGNE_CLAIRE';
    } else {
      artLensKey = 'CINEMATIC_MODERN';
    }
  }

  const leadArt = ART_COUNCIL_LENSES[artLensKey] || ART_COUNCIL_LENSES.STORYBOOK_WHIMSY;
  const leadStory = isJunior ? STORY_COUNCIL_LENSES.INTERACTIVE_PLAY : STORY_COUNCIL_LENSES.SCREENPLAY_DRAMATIST;

  const headline = isJunior
    ? `🌟 Welcome Young Creator! ${leadArt.name} and ${leadStory.name} are ready to turn your story into a magical comic book!`
    : `⚡ Council Convened: ${leadArt.name} (${leadArt.epithet}) & ${leadStory.name} presiding. Delivering studio-grade sequential grammar.`;

  const steps = isJunior
    ? [
        '1. Pick a fun page layout (like the big Picture Book or 3-panel strip)!',
        '2. Choose your hero or draw them with the soft watercolor brush!',
        '3. Type your story or let Story Magic automatically turn it into panels!',
        '4. Add big talking bubbles and colorful sound effects like POW and WHOOSH!',
        '5. Press Play to hear your comic talk out loud!',
      ]
    : [
        `1. Layout Architecture: Deploy the "${leadArt.recommendedLayouts[0]}" layout to establish cadence.`,
        `2. Inking Precision: Use the "${leadArt.recommendedBrushes[0]}" with Streamline smoothing to capture clean, dynamic gesture lines.`,
        `3. Character Continuity: Lock your Character Bible face reference to prevent sequential drift.`,
        '4. Lettering & SFX: Place vector balloons with Bezier tails; position onomatopoeia along scene velocity vectors.',
        '5. Film & Storyboard Export: 1-click generate Hollywood screenplay scenes and Fabula video animatic tracks.',
      ];

  return {
    leadArtDirector: leadArt,
    leadStoryDirector: leadStory,
    headlineSummary: headline,
    practicalActionSteps: steps,
    recommendedLayout: leadArt.recommendedLayouts[0] || 'grid_6_classic',
    recommendedBrush: leadArt.recommendedBrushes[0] || 'g_pen',
    recommendedPalette: leadArt.palette,
    sampleDialogueFormat: {
      speaker: 'HERO',
      line: isJunior ? 'Look what I found in the enchanted garden!' : 'The orbital ciphers were compromised three minutes ago...',
      balloonStyle: isJunior ? 'children_scribble' : 'standard_oval',
    },
    sampleSfx: {
      word: isJunior ? 'WHOOSH!' : 'CRACKLE!',
      style: isJunior ? 'orange-kinetic' : 'cyan-electric',
      positionAdvice: 'Position in the upper-right corner breaking slightly into the gutter for maximum visual impact.',
    },
  };
}
