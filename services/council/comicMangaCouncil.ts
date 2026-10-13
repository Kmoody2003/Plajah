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
