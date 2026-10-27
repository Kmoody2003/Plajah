// services/council/livingDocumentTemplates.ts
// 20 Bespoke Art-Council Worksheet & Test/Quiz Designs:
//   - WING I: 10 Artistic & Experiential Living Designs (6 Living Worksheets + 4 Living Tests/Quizzes)
//   - WING II: 10 Clean, Modern, Contemporary & Elegant Standard Designs (6 Contemporary Worksheets + 4 Contemporary Tests/Quizzes)
//
// Co-designed by:
//   1. The Art Director Council (Classical, World-Eclectic, Futurist, Rebel, Baroque, Radical Minimal)
//   2. The Interactive Experience & Gaming Council (Gameplay Virtuoso, Japanese Auteur, Real-Time 3D/Shader Guru, Silicon Pioneer)
//   3. The Education & Pedagogy Council (Inductive Mastery, Cognitive Load, Active Recall, Neuro-Inclusive Calm)
//   4. The Lighting Director (Volumetric Paper-Edge Sheen, Dappled Satsuei Light, Active-Card Rim Illumination)

import type { CouncilDirectorId } from './councilTypes';

export type LivingTemplateCategory = 'WORKSHEET' | 'TEST_QUIZ';
export type LivingTemplateStyleFamily = 'ARTISTIC_LIVING' | 'CONTEMPORARY_MODERN';

export type LivingAmbientMotionKind =
  | 'WARM_VELLUM_SHEEN'
  | 'WOVEN_THREAD_SHIMMER'
  | 'CONSTELLATION_DRIFT'
  | 'DAPPLED_BOTANICAL_BREEZE'
  | 'RISOGRAPH_STAMP_PULSE'
  | 'ARCHITECTURAL_SPOTLIGHT'
  | 'ROSE_WINDOW_PETAL_GLOW'
  | 'SCHOLAR_QUEST_PIPS'
  | 'CHRONOMETER_DIAL_SWEEP'
  | 'ZENITH_BREATH_HALO';

export interface CouncilChimeIn {
  artCouncil: {
    directorId: CouncilDirectorId;
    directorName: string;
    memberLabel: string;
    note: string;
  };
  gamingAndInteractiveCouncil: {
    specialistName: string;
    microInteractionRule: string;
    microReward: string;
    note: string;
  };
  educationCouncil: {
    pedagogyLead: string;
    learningPrinciple: string;
    pedagogyFocus: string;
    note: string;
  };
  lightingDirector: {
    lightingStyle: string;
    lightSourceSpec: string;
    technique: string;
    keyToFillRatio: string;
    note: string;
  };
}

export interface LivingDocumentTemplate {
  id: string;
  name: string;
  subtitle: string;
  tagline: string;
  category: LivingTemplateCategory;
  styleFamily: LivingTemplateStyleFamily;
  architectureLabel: string;
  badgeEmoji: string;
  badgeLabel: string;
  teaserHook: string;
  // Surface & Lighting properties used across Studio, Desk & Modals
  surfaceGradient: string;
  accentGradient: string;
  cardBorder: string;
  ambientGlowColor: string;
  lightingOverlay: string;
  progressArtifactLabel: string;
  // Paper & Ink properties
  paperBg: string;
  paperTextureCss: string;
  inkColor: string;
  mutedInkColor: string;
  primaryAccent: string;
  secondaryAccent: string;
  borderTint: string;
  headerBgGradient: string;
  headerTextColor: string;
  cardBg: string;
  cardActiveGlowCss: string;
  headingFont: string;
  bodyFont: string;
  monoFont: string;
  ambientMotion: LivingAmbientMotionKind;
  progressIndicatorLabel: string;
  completionRewardLabel: string;
  councils: CouncilChimeIn;
}

/**
 * ============================================================================
 * WING I — 6 ARTISTIC & EXPERIENTIAL LIVING WORKSHEET DESIGNS (01–06)
 * ============================================================================
 */
export const LIVING_WORKSHEET_TEMPLATES: LivingDocumentTemplate[] = [
  {
    id: 'ws-sanctuary-vellum',
    name: 'Sanctuary Vellum & Gold Leaf',
    subtitle: '3-Column Illuminated Glossa Ordinaria Manuscript Codex',
    tagline: '3-column cream calfskin parchment codex with patristic marginalia, crimson rubrication & flickering golden menorah.',
    category: 'WORKSHEET',
    styleFamily: 'ARTISTIC_LIVING',
    architectureLabel: '3-Col Parchment Codex + Marginalia',
    badgeEmoji: '🕯️',
    badgeLabel: 'Worksheet 01 · Classical Illuminated Codex',
    teaserHook: 'Watch each answered prompt ignite a golden menorah flame and seal your marginalia in crimson ink.',
    surfaceGradient: 'linear-gradient(135deg, #2D1B0E 0%, #4A2C16 52%, #1F130A 100%)',
    accentGradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 55%, #B45309 100%)',
    cardBorder: 'rgba(245, 158, 11, 0.45)',
    ambientGlowColor: 'rgba(245, 158, 11, 0.35)',
    lightingOverlay: 'radial-gradient(circle at 20% 15%, rgba(251, 191, 36, 0.18) 0%, transparent 55%)',
    progressArtifactLabel: 'Seven Golden Lampstands',
    paperBg: '#F4EAD2',
    paperTextureCss: 'radial-gradient(circle at 14% 8%, rgba(245, 194, 73, 0.14) 0%, transparent 48%)',
    inkColor: '#2A180D',
    mutedInkColor: '#5C3A1D',
    primaryAccent: '#B45309',
    secondaryAccent: '#991B1B',
    borderTint: '#D6C29F',
    headerBgGradient: 'linear-gradient(135deg, #1E1610 0%, #3B2314 52%, #5C3A1B 100%)',
    headerTextColor: '#FFFBEB',
    cardBg: '#FAF3E0',
    cardActiveGlowCss: '0 10px 30px -8px rgba(184, 134, 11, 0.25)',
    headingFont: "'Newsreader', 'Georgia', serif",
    bodyFont: "'Georgia', serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'WARM_VELLUM_SHEEN',
    progressIndicatorLabel: 'Golden Lampstand Flames Lit',
    completionRewardLabel: 'All 7 Sanctuary Lamps Illuminated',
    councils: {
      artCouncil: {
        directorId: 'CLASSICAL',
        directorName: 'The Classical Maestro (Blaise × Rembrandt)',
        memberLabel: 'Classical Maestro · Illuminated Codex',
        note: 'True 3-column medieval Glossa Ordinaria manuscript on warm ivory calfskin vellum (#F4EAD2) with crimson rubrication and drop-caps.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Japanese Game Auteur',
        microInteractionRule: 'Answering a question ignites a flickering oil flame on the 7-branched SVG Golden Menorah.',
        microReward: '7-Branched Menorah Flame Ignition',
        note: 'Like annotating an ancient grimoire—each completed question seals the margin and lights a sanctuary lamp.',
      },
      educationCouncil: {
        pedagogyLead: 'Inductive Exegesis & Deep Reading Chair',
        learningPrinciple: 'Context-before-query marginalia scaffolding.',
        pedagogyFocus: 'Inductive Exegesis & Patristic Gloss',
        note: 'Places primary sources and Greek word studies directly beside the biblical text just like a classical study codex.',
      },
      lightingDirector: {
        lightingStyle: 'Warm 2,700K Clerestory Candlelight',
        lightSourceSpec: '18° top-left warm key light sweeping softly across the vellum grain.',
        technique: '2,700K Candlelight Vignette & Gold Specular',
        keyToFillRatio: '3.5 : 1 Chiaroscuro Warmth',
        note: 'Warm amber vignette along the parchment edges with gold-leaf specular highlights.',
      },
    },
  },
  {
    id: 'ws-sankofa-royal-tapestry',
    name: 'Sankofa Royal Kente Loom',
    subtitle: 'Interlocking Warp-and-Weft Tapestry & Cultural Synthesis',
    tagline: 'Interactive SVG Ashanti Kente loom where answering questions weaves golden weft threads across the warp.',
    category: 'WORKSHEET',
    styleFamily: 'ARTISTIC_LIVING',
    architectureLabel: 'Interactive Kente Loom + Zig-Zag Weave',
    badgeEmoji: '👑',
    badgeLabel: 'Worksheet 02 · World-Eclectic Tapestry Loom',
    teaserHook: 'Every completed prompt weaves a physical gold-and-crimson Kente thread across the live SVG loom.',
    surfaceGradient: 'linear-gradient(135deg, #170E29 0%, #2B102F 55%, #1A120B 100%)',
    accentGradient: 'linear-gradient(135deg, #F59E0B 0%, #EC4899 55%, #10B981 100%)',
    cardBorder: 'rgba(245, 158, 11, 0.5)',
    ambientGlowColor: 'rgba(236, 72, 153, 0.35)',
    lightingOverlay: 'radial-gradient(circle at 80% 20%, rgba(245, 158, 11, 0.2) 0%, transparent 55%)',
    progressArtifactLabel: 'Ashanti Gold Loom Threads',
    paperBg: '#120A21',
    paperTextureCss: 'radial-gradient(circle at 85% 12%, rgba(224, 154, 0, 0.15) 0%, transparent 45%)',
    inkColor: '#FFFDF7',
    mutedInkColor: '#E2D4F0',
    primaryAccent: '#F59E0B',
    secondaryAccent: '#EC4899',
    borderTint: '#F59E0B',
    headerBgGradient: 'linear-gradient(135deg, #2A1208 0%, #5A1818 50%, #7C4D0B 100%)',
    headerTextColor: '#FFFDF5',
    cardBg: '#1E1333',
    cardActiveGlowCss: '0 10px 28px -8px rgba(245, 158, 11, 0.3)',
    headingFont: "'Outfit', sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'WOVEN_THREAD_SHIMMER',
    progressIndicatorLabel: 'Kente Weft Threads Woven',
    completionRewardLabel: 'Sovereign Tapestry Complete',
    councils: {
      artCouncil: {
        directorId: 'WORLD_ECLECTIC',
        directorName: 'The World-Eclectic Traveler (Mokgosi × Wiley)',
        memberLabel: 'World Eclectic · Royal Kente Loom',
        note: 'Authentic Asante Kente geometric border strips with diagonal magazine typography and staggered checkerboard cards.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Gameplay Virtuoso',
        microInteractionRule: 'Live SVG Loom weaves physical gold, magenta, and emerald weft threads across the vertical warp cords.',
        microReward: 'Live SVG Warp-and-Weft Thread Weave',
        note: 'Students watch their intellectual synthesis physically weave a vibrant textile banner at the top of the sheet.',
      },
      educationCouncil: {
        pedagogyLead: 'Culturally Responsive & Relational Synthesis Lead',
        learningPrinciple: 'Relational cause-and-effect threading strengthens long-term retention.',
        pedagogyFocus: 'Relational Cause-Effect & Leadership',
        note: 'Connects textual anchors on the left warp to community & leadership applications on the right weft.',
      },
      lightingDirector: {
        lightingStyle: 'Anisotropic Silk & Gold Thread Sheen',
        lightSourceSpec: 'Warm metallic rim highlights over deep velvet indigo.',
        technique: 'Anisotropic Gold Thread Specular',
        keyToFillRatio: '3.0 : 1 Warm Gold Rim',
        note: 'Gives woven borders the tactile luster of embroidered gold silk.',
      },
    },
  },
  {
    id: 'ws-galilean-starlight-atlas',
    name: 'Galilean Starlight Astrolabe & Map',
    subtitle: 'Interactive Asia Minor Cartography & Rotating Brass Astrolabe',
    tagline: 'Radial celestial cartography map with rotating SVG brass astrolabe & clickable Seven Churches beacons.',
    category: 'WORKSHEET',
    styleFamily: 'ARTISTIC_LIVING',
    architectureLabel: 'Radial Star Map + Rotating Astrolabe',
    badgeEmoji: '🧭',
    badgeLabel: 'Worksheet 03 · Celestial Cartography Map',
    teaserHook: 'Chart the postal route of Revelation across an interactive SVG map and rotating brass astrolabe.',
    surfaceGradient: 'linear-gradient(135deg, #040B1C 0%, #09193A 55%, #050E24 100%)',
    accentGradient: 'linear-gradient(135deg, #38BDF8 0%, #F59E0B 100%)',
    cardBorder: 'rgba(56, 189, 248, 0.45)',
    ambientGlowColor: 'rgba(56, 189, 248, 0.35)',
    lightingOverlay: 'radial-gradient(circle at 50% 25%, rgba(56, 189, 248, 0.18) 0%, transparent 60%)',
    progressArtifactLabel: 'Star Coordinates Locked',
    paperBg: '#061129',
    paperTextureCss: 'radial-gradient(circle at 50% 20%, rgba(56, 189, 248, 0.14) 0%, transparent 55%)',
    inkColor: '#F0F9FF',
    mutedInkColor: '#BAE6FD',
    primaryAccent: '#38BDF8',
    secondaryAccent: '#F59E0B',
    borderTint: '#0284C7',
    headerBgGradient: 'linear-gradient(135deg, #061026 0%, #0F2347 55%, #1D3B6E 100%)',
    headerTextColor: '#F0F9FF',
    cardBg: '#081A3A',
    cardActiveGlowCss: '0 12px 32px -8px rgba(56, 189, 248, 0.3)',
    headingFont: "'Space Grotesk', 'Outfit', sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'CONSTELLATION_DRIFT',
    progressIndicatorLabel: 'Constellation Beacons Linked',
    completionRewardLabel: 'Celestial Star Map Fully Charted',
    councils: {
      artCouncil: {
        directorId: 'FUTURIST',
        directorName: 'The Futurist (Moebius × Hergé Ligne Claire)',
        memberLabel: 'The Futurist · Brass Astrolabe & Map',
        note: 'Combines 17th-century brass celestial cartography with crisp Ligne Claire vector map beacons.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Real-Time 3D & Shader Guru',
        microInteractionRule: 'Clicking city beacons and locking answers draws glowing golden constellation vectors across the dial.',
        microReward: 'Constellation Vector Lock & Astrolabe Spin',
        note: 'Turns geography and historical context into an interactive star-charting expedition.',
      },
      educationCouncil: {
        pedagogyLead: 'Spatial & Visual-Memory Curriculum Lead',
        learningPrinciple: 'Dual-coding spatial cartography anchors historical memory.',
        pedagogyFocus: 'Spatial Cartography & Archaeological Context',
        note: 'Students see where Patmos, Ephesus, Smyrna, and Pergamum physically sit while answering prompts.',
      },
      lightingDirector: {
        lightingStyle: '5,600K Starlight Cyan & Brass Specular',
        lightSourceSpec: 'Cool night-sky ambient fill with warm antique brass rim highlights.',
        technique: '5,600K Starlight + Brass Rim Specular',
        keyToFillRatio: '4.0 : 1 Nocturnal Starlight',
        note: 'Makes golden constellation nodes pop against midnight sapphire glass.',
      },
    },
  },
  {
    id: 'ws-eden-botanical-parchment',
    name: 'Eden Herbarium Open Field Journal',
    subtitle: 'Open 2-Page Stitched Botanical Sketchbook & Specimen Diagram',
    tagline: 'Open 2-page linen field notebook with stitched center spine, pressed Tree-of-Life diagram pins & Washi tape.',
    category: 'WORKSHEET',
    styleFamily: 'ARTISTIC_LIVING',
    architectureLabel: '2-Page Stitched Book + Diagram Pins',
    badgeEmoji: '🌿',
    badgeLabel: 'Worksheet 04 · Naturalist 2-Page Sketchbook',
    teaserHook: 'Inspect numbered botanical pins on the left page and log pressed field observations across the stitched spine.',
    surfaceGradient: 'linear-gradient(135deg, #12261A 0%, #1E3A29 52%, #0F2017 100%)',
    accentGradient: 'linear-gradient(135deg, #34D399 0%, #10B981 55%, #F59E0B 100%)',
    cardBorder: 'rgba(52, 211, 153, 0.45)',
    ambientGlowColor: 'rgba(16, 185, 129, 0.32)',
    lightingOverlay: 'radial-gradient(circle at 25% 20%, rgba(167, 243, 208, 0.16) 0%, transparent 55%)',
    progressArtifactLabel: 'Herbarium Specimens Pressed',
    paperBg: '#F3EFE2',
    paperTextureCss: 'radial-gradient(circle at 18% 12%, rgba(77, 124, 74, 0.10) 0%, transparent 50%)',
    inkColor: '#1A2E22',
    mutedInkColor: '#3B5244',
    primaryAccent: '#15803D',
    secondaryAccent: '#B45309',
    borderTint: '#A3B899',
    headerBgGradient: 'linear-gradient(135deg, #162B1E 0%, #264631 55%, #3B6043 100%)',
    headerTextColor: '#F4F9F4',
    cardBg: '#FAF8F0',
    cardActiveGlowCss: '0 10px 28px -8px rgba(21, 128, 61, 0.25)',
    headingFont: "'Lora', 'Georgia', serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'DAPPLED_BOTANICAL_BREEZE',
    progressIndicatorLabel: 'Botanical Pins Logged',
    completionRewardLabel: 'Herbarium Field Spread Complete',
    councils: {
      artCouncil: {
        directorId: 'CLASSICAL',
        directorName: 'Classical Naturalist (Beatrix Potter × Miyazaki)',
        memberLabel: 'Naturalist Atelier · 2-Page Field Book',
        note: 'Authentic open two-page linen field journal (#F3EFE2) with a realistic stitched center binding and Washi-taped specimen cards.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Japanese Game Auteur',
        microInteractionRule: 'Clicking anatomical diagram pins (①–④) blooms leaves on the Tree of Life and logs the specimen.',
        microReward: 'Interactive Diagram Pin Bloom',
        note: 'Feels like a collector’s almanac—students interact with the illustrated diagram on the left page to complete the right page.',
      },
      educationCouncil: {
        pedagogyLead: 'Contemplative & Visual Diagramming Lead',
        learningPrinciple: 'Anatomical & metaphorical diagram labeling deepens conceptual integration.',
        pedagogyFocus: 'Visual Diagram Labeling & Field Notes',
        note: 'Connects roots, trunk, blossoms, and fruit to doctrinal truth, endurance, love, and eternal promise.',
      },
      lightingDirector: {
        lightingStyle: 'Dappled Komorebi Canopy Sunlight',
        lightSourceSpec: 'Warm afternoon sun filtering through botanical leaves across the open book pages.',
        technique: 'Komorebi Dappled Leaf Sunlight',
        keyToFillRatio: '2.2 : 1 Natural Daylight',
        note: 'Soft page-spine shadow down the center gutter gives the illusion of a real open hardcover book.',
      },
    },
  },
  {
    id: 'ws-pentecost-ember-chronicle',
    name: 'Pentecost Risograph Punk Zine',
    subtitle: 'Tilted Collage Cutouts, Broadsheet Pull-Quotes & Rubber Stamps',
    tagline: 'High-contrast newsprint zine with tilted cutout blocks, 6px brutalist shadows & kinetic red rubber ink stamps.',
    category: 'WORKSHEET',
    styleFamily: 'ARTISTIC_LIVING',
    architectureLabel: 'Tilted Risograph Zine + Rubber Stamps',
    badgeEmoji: '🔥',
    badgeLabel: 'Worksheet 05 · Risograph Print-Shop Zine',
    teaserHook: 'Lock in your answers to physically slam an angled crimson verification stamp onto the newsprint.',
    surfaceGradient: 'linear-gradient(135deg, #271216 0%, #3B151E 52%, #1C1412 100%)',
    accentGradient: 'linear-gradient(135deg, #FF2A5F 0%, #F97316 55%, #FACC15 100%)',
    cardBorder: 'rgba(255, 42, 95, 0.55)',
    ambientGlowColor: 'rgba(255, 42, 95, 0.35)',
    lightingOverlay: 'radial-gradient(circle at 80% 15%, rgba(250, 204, 21, 0.16) 0%, transparent 55%)',
    progressArtifactLabel: 'Risograph Rubber Stamps',
    paperBg: '#FAF4E6',
    paperTextureCss: 'radial-gradient(rgba(17, 17, 17, 0.12) 1px, transparent 0)',
    inkColor: '#111111',
    mutedInkColor: '#3F3F46',
    primaryAccent: '#FF2A5F',
    secondaryAccent: '#FACC15',
    borderTint: '#111111',
    headerBgGradient: 'linear-gradient(135deg, #18181B 0%, #3F1D24 55%, #7F1D1D 100%)',
    headerTextColor: '#FAF4E6',
    cardBg: '#FFFFFF',
    cardActiveGlowCss: '6px 6px 0px #111111',
    headingFont: "'Syne', 'Outfit', sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'RISOGRAPH_STAMP_PULSE',
    progressIndicatorLabel: 'Clippings Stamped',
    completionRewardLabel: 'Zine Issue Approved for Press',
    councils: {
      artCouncil: {
        directorId: 'REBEL',
        directorName: 'The Rebel (Saul Bass × Emory Douglas)',
        memberLabel: 'The Rebel · Risograph Cutout Zine',
        note: 'Halftone dot newsprint (#FAF4E6), CMYK registration marks (┼), tilted (-1.2deg) black cutout banners, and hard 6px offset shadows.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Gameplay Virtuoso',
        microInteractionRule: 'Selecting an answer slams an angled red rubber ink stamp ([★ VERIFIED]) onto the evidence clipping.',
        microReward: 'Kinetic Red Rubber Ink Stamp Slam',
        note: 'Gives every completed question the visceral punch of a print-shop broadsheet press.',
      },
      educationCouncil: {
        pedagogyLead: 'Youth & Seminar Engagement Lead',
        learningPrinciple: 'Bold editorial chunking captures immediate attention for active debate.',
        pedagogyFocus: 'Seminar Broadsheet & Evidence Clippings',
        note: 'Ideal for youth ministries, college seminars, and critical-thinking discussions.',
      },
      lightingDirector: {
        lightingStyle: 'Print-Shop Raking Worklamp',
        lightSourceSpec: 'High-contrast studio worklamp over cotton newsprint grain.',
        technique: 'Hard Offset Shadow & Halftone Grain',
        keyToFillRatio: '5.0 : 1 Graphic Contrast',
        note: 'Crisp black ink shadows make every collage card jump off the newsprint.',
      },
    },
  },
  {
    id: 'ws-damascus-architectural-grid',
    name: 'Damascus Swiss Blueprint Grid',
    subtitle: '0px Cyanotype Engineering Specification & Logic Flowchart',
    tagline: 'Zero-radius Swiss Müller-Brockmann blueprint with exposed 1px hairlines, coordinate cells & logic flowchart.',
    category: 'WORKSHEET',
    styleFamily: 'ARTISTIC_LIVING',
    architectureLabel: '0px Swiss Blueprint + Logic Flowchart',
    badgeEmoji: '📐',
    badgeLabel: 'Worksheet 06 · Swiss Architectural Blueprint',
    teaserHook: 'Energize each structural coordinate cell (A1–A4) across a razor-sharp 0px blueprint specification grid.',
    surfaceGradient: 'linear-gradient(135deg, #071A33 0%, #0C2547 55%, #051224 100%)',
    accentGradient: 'linear-gradient(135deg, #38BDF8 0%, #0EA5E9 55%, #F59E0B 100%)',
    cardBorder: 'rgba(56, 189, 248, 0.65)',
    ambientGlowColor: 'rgba(56, 189, 248, 0.3)',
    lightingOverlay: 'linear-gradient(90deg, rgba(56, 189, 248, 0.08) 1px, transparent 1px)',
    progressArtifactLabel: 'Blueprint Nodes Energized',
    paperBg: '#071A33',
    paperTextureCss: 'linear-gradient(to right, rgba(56, 189, 248, 0.14) 1px, transparent 1px)',
    inkColor: '#E0F2FE',
    mutedInkColor: '#7DD3FC',
    primaryAccent: '#38BDF8',
    secondaryAccent: '#FF4F00',
    borderTint: '#38BDF8',
    headerBgGradient: 'linear-gradient(135deg, #041022 0%, #071A33 100%)',
    headerTextColor: '#FFFFFF',
    cardBg: '#0A2242',
    cardActiveGlowCss: '0 0 0 2px #38BDF8',
    headingFont: "'Space Grotesk', 'Inter', sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'ARCHITECTURAL_SPOTLIGHT',
    progressIndicatorLabel: 'Coordinate Cells Verified',
    completionRewardLabel: 'Structural Specification 100% Verified',
    councils: {
      artCouncil: {
        directorId: 'RADICAL_MINIMAL',
        directorName: 'The Radical Minimalist (Josef Müller-Brockmann)',
        memberLabel: 'Radical Minimalist · 0px Swiss Grid',
        note: 'Zero rounded corners (0px), exposed 1px structural crosshairs, engineering title block, and giant index numerals.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Silicon Valley Pioneer',
        microInteractionRule: 'Answering a coordinate cell flips the structural block into high-contrast cyan/amber energized state.',
        microReward: 'Circuit Node Energization',
        note: 'Instant, zero-latency structural feedback for analytical thinkers.',
      },
      educationCouncil: {
        pedagogyLead: 'Analytical & Systems Thinking Lead',
        learningPrinciple: 'Strict visual hierarchy and step-by-step flowcharts eliminate extraneous cognitive load.',
        pedagogyFocus: 'Algorithmic Flowchart & Matrix Analysis',
        note: 'Maps complex arguments (Diagnosis → Remember → Repent → Do First Works) as an unmistakable engineering schematic.',
      },
      lightingDirector: {
        lightingStyle: 'Architectural Gallery Louvers',
        lightSourceSpec: 'Razor-sharp cyanotype grid illumination.',
        technique: '5,000K Architectural Louver Contrast',
        keyToFillRatio: '4.5 : 1 Precision Line Contrast',
        note: 'Every 1px grid rule remains crystal-clear at any zoom level.',
      },
    },
  },
];

/**
 * ============================================================================
 * WING I — 4 ARTISTIC & EXPERIENTIAL LIVING TEST & QUIZ DESIGNS (07–10)
 * ============================================================================
 */
export const LIVING_TEST_QUIZ_TEMPLATES: LivingDocumentTemplate[] = [
  {
    id: 'tq-cathedral-glass-mastery',
    name: 'Cathedral Rose Stained-Glass Triptych',
    subtitle: '3 Pointed Gothic Arch Lancets & Live 12-Petal Rose Window',
    tagline: '3 pointed Gothic arch lancet columns crowned by a live SVG Rose Window that fills with jewel caustics.',
    category: 'TEST_QUIZ',
    styleFamily: 'ARTISTIC_LIVING',
    architectureLabel: '3 Pointed Gothic Arches + Rose Window',
    badgeEmoji: ' stained-glass ',
    badgeLabel: 'Test Design 07 · Gothic Stained-Glass Triptych',
    teaserHook: 'Each completed exam column floods a petal of the Cathedral Rose Window in ruby, sapphire, and gold.',
    surfaceGradient: 'linear-gradient(180deg, #170B26 0%, #0F091C 55%, #090612 100%)',
    accentGradient: 'linear-gradient(135deg, #F59E0B 0%, #E11D48 52%, #2563EB 100%)',
    cardBorder: 'rgba(245, 158, 11, 0.55)',
    ambientGlowColor: 'rgba(225, 29, 72, 0.35)',
    lightingOverlay: 'radial-gradient(circle at 50% 12%, rgba(245, 158, 11, 0.22) 0%, transparent 55%)',
    progressArtifactLabel: 'Rose Window Petals Lit',
    paperBg: '#12091E',
    paperTextureCss: 'radial-gradient(circle at 50% 10%, rgba(169, 29, 58, 0.18) 0%, transparent 50%)',
    inkColor: '#FAF5FF',
    mutedInkColor: '#DDD6FE',
    primaryAccent: '#F59E0B',
    secondaryAccent: '#E11D48',
    borderTint: '#F59E0B',
    headerBgGradient: 'linear-gradient(135deg, #1A0F2E 0%, #3A154B 52%, #6B1D3A 100%)',
    headerTextColor: '#FFFBEB',
    cardBg: '#1E1035',
    cardActiveGlowCss: '0 14px 34px -8px rgba(245, 158, 11, 0.35)',
    headingFont: "'Cinzel', 'Georgia', serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'ROSE_WINDOW_PETAL_GLOW',
    progressIndicatorLabel: 'Rose Window Petals Lit',
    completionRewardLabel: 'Cathedral Rose Window Fully Illuminated',
    councils: {
      artCouncil: {
        directorId: 'BAROQUE',
        directorName: 'The Baroque Virtuoso (Eyvind Earle × Gothic Triforium)',
        memberLabel: 'Baroque Virtuoso · Gothic Triptych',
        note: 'Pointed Gothic lancet arches (border-radius: 140px 140px 14px 14px) crowned by a live 12-petal SVG Rose Window.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Real-Time 3D & Shader Guru',
        microInteractionRule: 'Every answered lancet illuminates stained-glass petals in ruby, sapphire, emerald, and gold.',
        microReward: 'Stained-Glass Rose Petal Illumination',
        note: 'Transforms a summative unit exam into a luminous architectural milestone.',
      },
      educationCouncil: {
        pedagogyLead: 'Summative Mastery & Capstone Assessment Chair',
        learningPrinciple: 'Ceremonial framing elevates pride of mastery.',
        pedagogyFocus: 'Summative Mastery Triptych',
        note: 'Groups exam questions into 3 clear thematic lancet arches.',
      },
      lightingDirector: {
        lightingStyle: 'Prismatic Stained-Glass Caustics',
        lightSourceSpec: 'Jewel-toned caustic rays streaming down from the rose window.',
        technique: 'Prismatic Jewel Caustic Rays',
        keyToFillRatio: '3.8 : 1 Cathedral Luminance',
        note: 'Subtle ruby, amber, and sapphire light pools warm the stone tracery.',
      },
    },
  },
  {
    id: 'tq-scroll-of-seals-trial',
    name: 'Scroll of the Seven Seals Spotlight',
    subtitle: 'Rolled Parchment Charter Stage & Hanging 3D Crimson Wax Seals',
    tagline: 'Single-card dramatic scroll framed by wooden dowels and 7 hanging crimson wax seals that press on answer.',
    category: 'TEST_QUIZ',
    styleFamily: 'ARTISTIC_LIVING',
    architectureLabel: 'Single-Card Rolled Scroll + Wax Seals',
    badgeEmoji: '🩸',
    badgeLabel: 'Test Design 08 · Single-Card Wax-Seal Scroll',
    teaserHook: 'Focus on one charter card at a time and press your signet ring into hanging crimson wax seals.',
    surfaceGradient: 'linear-gradient(135deg, #2A1015 0%, #451A03 55%, #1C0A0E 100%)',
    accentGradient: 'linear-gradient(135deg, #DC2626 0%, #F59E0B 100%)',
    cardBorder: 'rgba(220, 38, 38, 0.55)',
    ambientGlowColor: 'rgba(220, 38, 38, 0.35)',
    lightingOverlay: 'radial-gradient(circle at 50% 45%, rgba(251, 191, 36, 0.18) 0%, transparent 60%)',
    progressArtifactLabel: 'Crimson Wax Seals Pressed',
    paperBg: '#F5E8C7',
    paperTextureCss: 'radial-gradient(circle at 50% 50%, rgba(255, 248, 231, 0.9) 0%, transparent 70%)',
    inkColor: '#2B1410',
    mutedInkColor: '#78350F',
    primaryAccent: '#881337',
    secondaryAccent: '#D97706',
    borderTint: '#B45309',
    headerBgGradient: 'linear-gradient(135deg, #451A03 0%, #78350F 50%, #451A03 100%)',
    headerTextColor: '#FEF3C7',
    cardBg: '#FAF3E0',
    cardActiveGlowCss: '0 16px 40px -10px rgba(136, 19, 55, 0.4)',
    headingFont: "'Georgia', serif",
    bodyFont: "'Georgia', serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'SCHOLAR_QUEST_PIPS',
    progressIndicatorLabel: 'Charters Sealed in Wax',
    completionRewardLabel: 'All Seven Seals Officially Pressed',
    councils: {
      artCouncil: {
        directorId: 'CLASSICAL',
        directorName: 'Classical Guild Master (Sergio Toppi × Caravaggio)',
        memberLabel: 'Guild Master · Rolled Scroll & Wax Seals',
        note: 'Turned wooden scroll dowels top and bottom with a single-question spotlight stage and hanging crimson wax seals.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Gameplay Virtuoso',
        microInteractionRule: 'Locking an answer presses a 3D crimson wax signet seal along the bottom ribbon and advances the scroll.',
        microReward: '3D Signet Ring Wax-Seal Stamp',
        note: 'Eliminates vertical scroll fatigue by staging one dramatic charter trial at a time.',
      },
      educationCouncil: {
        pedagogyLead: 'Focused Active Recall Specialist',
        learningPrinciple: 'Single-item spotlighting prevents item-preview anxiety.',
        pedagogyFocus: 'Single-Item Spotlight Active Recall',
        note: 'Students give 100% focus to one question at a time while jumping freely via the wax-seal ribbon.',
      },
      lightingDirector: {
        lightingStyle: 'Warm Brass Library Spotlight',
        lightSourceSpec: 'Focused theatre pool on the active parchment scroll.',
        technique: 'Caravaggio Theatre Spotlight Pool',
        keyToFillRatio: '4.2 : 1 Dramatic Spotlight',
        note: 'Draws the eye straight to the active charter question.',
      },
    },
  },
  {
    id: 'tq-berean-scholastic-arena',
    name: 'Berean Telemetry Radar Cockpit',
    subtitle: 'Chamfered Aerospace HUD & Live SVG Polar Competency Radar',
    tagline: 'Split-screen chamfered telemetry cockpit with a live SVG polar radar polygon & 2×2 diagnostic matrix.',
    category: 'TEST_QUIZ',
    styleFamily: 'ARTISTIC_LIVING',
    architectureLabel: 'Chamfered HUD + Live Radar Polygon',
    badgeEmoji: '⚡',
    badgeLabel: 'Test Design 09 · Telemetry Radar Cockpit',
    teaserHook: 'Watch your live SVG Polar Competency Radar polygon expand across 4 axes as you lock in each probe.',
    surfaceGradient: 'linear-gradient(135deg, #041019 0%, #081E2E 55%, #030B12 100%)',
    accentGradient: 'linear-gradient(135deg, #2DD4BF 0%, #38BDF8 55%, #F59E0B 100%)',
    cardBorder: 'rgba(45, 212, 191, 0.55)',
    ambientGlowColor: 'rgba(45, 212, 191, 0.35)',
    lightingOverlay: 'radial-gradient(circle at 25% 50%, rgba(45, 212, 191, 0.16) 0%, transparent 55%)',
    progressArtifactLabel: 'Telemetry Vectors Locked',
    paperBg: '#041019',
    paperTextureCss: 'radial-gradient(circle at 80% 10%, rgba(45, 212, 191, 0.14) 0%, transparent 45%)',
    inkColor: '#CCFBF1',
    mutedInkColor: '#5EEAD4',
    primaryAccent: '#2DD4BF',
    secondaryAccent: '#38BDF8',
    borderTint: '#14B8A6',
    headerBgGradient: 'linear-gradient(135deg, #041019 0%, #0D2D3E 100%)',
    headerTextColor: '#CCFBF1',
    cardBg: '#071B2B',
    cardActiveGlowCss: '0 0 24px -4px rgba(45, 212, 191, 0.4)',
    headingFont: "'Space Grotesk', sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'CHRONOMETER_DIAL_SWEEP',
    progressIndicatorLabel: 'Radar Vectors Locked',
    completionRewardLabel: 'Full Telemetry Competency Polygon Locked',
    councils: {
      artCouncil: {
        directorId: 'FUTURIST',
        directorName: 'The Futurist (Syd Mead × Chronograph HUD)',
        memberLabel: 'The Futurist · Chamfered Radar HUD',
        note: 'Chamfered corner HUD panels (clip-path polygon), monospace telemetry logs, and a live SVG Spider/Radar polygon.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Silicon Pioneer',
        microInteractionRule: 'Each answered diagnostic probe dynamically expands the vertices of the SVG Polar Radar polygon.',
        microReward: 'Live SVG Radar Polygon Expansion',
        note: 'Turns standards mastery into a live mission-control telemetry readout.',
      },
      educationCouncil: {
        pedagogyLead: 'Standards-Referenced Psychometrics Lead',
        learningPrinciple: 'Multi-dimensional skill radar shows balanced mastery across domains.',
        pedagogyFocus: 'Multi-Axis Competency Telemetry',
        note: 'Visualizes Exegesis, History, Theology, and Application on a live radar graph.',
      },
      lightingDirector: {
        lightingStyle: 'Bioluminescent Cyan Edge-Lit Glass',
        lightSourceSpec: 'Crisp bioluminescent teal vector glow over carbon slate.',
        technique: 'Bioluminescent Teal Edge-Glow',
        keyToFillRatio: '3.6 : 1 HUD Contrast',
        note: 'High-contrast telemetry readouts eliminate eye strain.',
      },
    },
  },
  {
    id: 'tq-zenith-sanctuary-calm',
    name: 'Zenith Turrell Dawn Skyspace',
    subtitle: 'Low-Anxiety Dawn Alabaster Sanctuary & Breathing Halo',
    tagline: 'James Turrell dawn alabaster skyspace with a 6-second breathing halo & soft organic pebble cards.',
    category: 'TEST_QUIZ',
    styleFamily: 'ARTISTIC_LIVING',
    architectureLabel: 'Dawn Skyspace + Breathing Aperture',
    badgeEmoji: '🕊️',
    badgeLabel: 'Quiz Design 10 · Turrell Dawn Sanctuary',
    teaserHook: 'A gentle 6-second breathing skyspace halo and warm dawn alabaster paper dissolve test anxiety.',
    surfaceGradient: 'linear-gradient(135deg, #2D2342 0%, #3E2C54 52%, #4A3248 100%)',
    accentGradient: 'linear-gradient(135deg, #C084FC 0%, #F472B6 55%, #FBBF24 100%)',
    cardBorder: 'rgba(192, 132, 252, 0.45)',
    ambientGlowColor: 'rgba(192, 132, 252, 0.3)',
    lightingOverlay: 'radial-gradient(circle at 50% 15%, rgba(253, 232, 215, 0.22) 0%, transparent 60%)',
    progressArtifactLabel: 'Dawn Pearls Illuminated',
    paperBg: '#FBF8F3',
    paperTextureCss: 'linear-gradient(180deg, #FDE8D7 0%, #F9F5F0 38%, #EEF2FF 100%)',
    inkColor: '#27213C',
    mutedInkColor: '#5B527A',
    primaryAccent: '#7C3AED',
    secondaryAccent: '#EC4899',
    borderTint: '#DDD6FE',
    headerBgGradient: 'linear-gradient(135deg, #2E1065 0%, #581C87 55%, #831843 100%)',
    headerTextColor: '#FAF5FF',
    cardBg: '#FFFFFF',
    cardActiveGlowCss: '0 12px 32px -8px rgba(124, 58, 237, 0.2)',
    headingFont: "'Newsreader', 'Georgia', serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'ZENITH_BREATH_HALO',
    progressIndicatorLabel: 'Peaceful Reflections Logged',
    completionRewardLabel: 'Sanctuary Reflection Peacefully Completed',
    councils: {
      artCouncil: {
        directorId: 'RADICAL_MINIMAL',
        directorName: 'Minimalist Humanist (James Turrell × Tadao Ando)',
        memberLabel: 'Turrell × Ando · Dawn Skyspace',
        note: 'Warm dawn alabaster & rose skyspace (#FDE8D7 → #EEF2FF) with organic 36px pebble cards and zero harsh lines.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Japanese Game Auteur',
        microInteractionRule: 'A slow 6-second breathing skyspace halo paces calm focus while dawn pearls illuminate softly.',
        microReward: '6-Second Breathing Skyspace Halo',
        note: 'Proves that a living document can be deeply tranquil and restorative.',
      },
      educationCouncil: {
        pedagogyLead: 'Neuro-Inclusive & Test-Anxiety Reduction Specialist',
        learningPrinciple: 'Generous whitespace and breathing pacers lower cortisol during assessments.',
        pedagogyFocus: 'Neuro-Inclusive Calm Assessment',
        note: 'Designed so every learner can demonstrate mastery without time-pressure panic.',
      },
      lightingDirector: {
        lightingStyle: 'Golden-Hour Dawn Skyspace Diffusion',
        lightSourceSpec: 'Soft 1.4:1 diffused pastel horizon illumination.',
        technique: '1.4:1 Diffused Dawn Horizon Light',
        keyToFillRatio: '1.4 : 1 Soft Skyspace Fill',
        note: 'Eliminates harsh screen glare while keeping typography crisp.',
      },
    },
  },
];

/**
 * ============================================================================
 * WING II — 10 CLEAN, MODERN, CONTEMPORARY & ELEGANT STANDARD DESIGNS (11–20)
 * (6 Contemporary Standard Worksheets + 4 Contemporary Standard Tests/Quizzes)
 * Crafted by the Art Council for crisp, timeless, modern editorial & academic excellence.
 * ============================================================================
 */
export const CONTEMPORARY_STANDARD_WORKSHEET_TEMPLATES: LivingDocumentTemplate[] = [
  {
    id: 'std-ws-cornell-ivy',
    name: 'Cornell Ivy Academic Note System',
    subtitle: 'Modern 3-Zone Cornell Split Sheet (Left Cue Rail · Right Notes · Bottom Synthesis)',
    tagline: 'Clean Ivy-League Cornell 3-zone layout with a 30% Cue & Key-Term Rail, 70% Structured Response Zone, and Executive Summary footer.',
    category: 'WORKSHEET',
    styleFamily: 'CONTEMPORARY_MODERN',
    architectureLabel: 'Cornell 3-Zone Split + Synthesis Footer',
    badgeEmoji: '🏛️',
    badgeLabel: 'Modern Standard 11 · Cornell Ivy System',
    teaserHook: 'Organize key concepts in the Left Cue Rail, respond in the Right Study Column, and lock your Synthesis Takeaway below.',
    surfaceGradient: 'linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #0F292A 100%)',
    accentGradient: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 55%, #0284C7 100%)',
    cardBorder: 'rgba(20, 184, 166, 0.45)',
    ambientGlowColor: 'rgba(13, 148, 136, 0.25)',
    lightingOverlay: 'radial-gradient(circle at 15% 15%, rgba(20, 184, 166, 0.12) 0%, transparent 55%)',
    progressArtifactLabel: 'Cornell Cues Synthesized',
    paperBg: '#FDFCF9',
    paperTextureCss: 'none',
    inkColor: '#0F172A',
    mutedInkColor: '#475569',
    primaryAccent: '#0F766E',
    secondaryAccent: '#0284C7',
    borderTint: '#E2E8F0',
    headerBgGradient: 'linear-gradient(135deg, #0F172A 0%, #134E4A 100%)',
    headerTextColor: '#F8FAFC',
    cardBg: '#FFFFFF',
    cardActiveGlowCss: '0 8px 24px -6px rgba(15, 118, 110, 0.18)',
    headingFont: "'Newsreader', 'Georgia', serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'WARM_VELLUM_SHEEN',
    progressIndicatorLabel: 'Cornell Prompts Completed',
    completionRewardLabel: 'Cornell Synthesis Sheet Complete',
    councils: {
      artCouncil: {
        directorId: 'CLASSICAL',
        directorName: 'Massimo Vignelli × Ivy League University Press',
        memberLabel: 'Contemporary Editorial · Cornell Split',
        note: 'Crisp alabaster paper (#FDFCF9) divided into the classic Walter Pauk Cornell ratio: 30% Left Cue Column, 70% Right Notes Column, and a full-width Bottom Summary Box.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Silicon Pioneer',
        microInteractionRule: 'Clicking a Cue Chip in the left rail highlights the matching question card and updates the synthesis ring.',
        microReward: 'Cue-to-Note Sync & Synthesis Ring',
        note: 'Clean, zero-clutter micro-feedback that keeps scholars in deep flow.',
      },
      educationCouncil: {
        pedagogyLead: 'University Study Systems Chair',
        learningPrinciple: 'Cornell cue-column partitioning boosts active recall and exam preparation by 40%.',
        pedagogyFocus: 'Cornell Cueing & Executive Summary',
        note: 'Trains students to pair every detailed answer with a concise recall cue and bottom summary.',
      },
      lightingDirector: {
        lightingStyle: 'Daylight Reading Room Diffusion',
        lightSourceSpec: '5,000K architectural library daylight with zero paper glare.',
        technique: '5,000K Matte Gallery Paper Light',
        keyToFillRatio: '1.8 : 1 Clean Editorial Balance',
        note: 'Subtle warm-white paper contrast engineered for effortless long-form reading.',
      },
    },
  },
  {
    id: 'std-ws-kinfolk-editorial',
    name: 'Kinfolk Editorial Magazine Spread',
    subtitle: '2-Column Nordic Editorial Print Spread with Pull-Quote Gutter',
    tagline: 'Breathable Kinfolk/Cereal magazine spread on warm gallery bone paper with serif display typography & 2-column flow.',
    category: 'WORKSHEET',
    styleFamily: 'CONTEMPORARY_MODERN',
    architectureLabel: '2-Col Magazine Spread + Pull-Quote',
    badgeEmoji: '📖',
    badgeLabel: 'Modern Standard 12 · Kinfolk Editorial',
    teaserHook: 'Experience a worksheet designed like a luxury independent arts & letters journal.',
    surfaceGradient: 'linear-gradient(135deg, #1C1917 0%, #292524 55%, #18181B 100%)',
    accentGradient: 'linear-gradient(135deg, #D97706 0%, #EA580C 100%)',
    cardBorder: 'rgba(217, 119, 6, 0.4)',
    ambientGlowColor: 'rgba(217, 119, 6, 0.22)',
    lightingOverlay: 'radial-gradient(circle at 80% 15%, rgba(251, 191, 36, 0.1) 0%, transparent 55%)',
    progressArtifactLabel: 'Editorial Folios Completed',
    paperBg: '#FAF8F5',
    paperTextureCss: 'none',
    inkColor: '#1C1917',
    mutedInkColor: '#57534E',
    primaryAccent: '#B45309',
    secondaryAccent: '#78716C',
    borderTint: '#E7E5E4',
    headerBgGradient: 'linear-gradient(135deg, #1C1917 0%, #292524 100%)',
    headerTextColor: '#FAF8F5',
    cardBg: '#FFFFFF',
    cardActiveGlowCss: '0 10px 30px -10px rgba(28, 25, 23, 0.12)',
    headingFont: "'Playfair Display', 'Georgia', serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'WARM_VELLUM_SHEEN',
    progressIndicatorLabel: 'Editorial Sections Read & Answered',
    completionRewardLabel: 'Editorial Feature Spread Complete',
    councils: {
      artCouncil: {
        directorId: 'RADICAL_MINIMAL',
        directorName: 'Kinfolk & Cereal Magazine Editorial Lead',
        memberLabel: 'Kinfolk Minimalist · 2-Col Magazine',
        note: 'Warm gallery bone surface (#FAF8F5), oversized serif issue numerals, hair-thin stone dividers (#E7E5E4), and a center pull-quote callout.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Tactile UI Virtuoso',
        microInteractionRule: 'Selecting an answer glides a Minimalist Terracotta Underline bar into place.',
        microReward: 'Editorial Underline & Folio Check',
        note: 'Refined, magazine-grade transitions that feel calm, modern, and effortlessly premium.',
      },
      educationCouncil: {
        pedagogyLead: 'Humanities & Reflective Writing Chair',
        learningPrinciple: 'Aesthetic calm and generous margins invite deeper written reflection.',
        pedagogyFocus: 'Close Reading & Reflective Synthesis',
        note: 'Ideal for literature, theology, humanities, and leadership seminars.',
      },
      lightingDirector: {
        lightingStyle: 'Nordic Gallery Skylight',
        lightSourceSpec: 'Soft 4,500K museum skylight across matte cotton stock.',
        technique: '4,500K Museum Skylight Diffusion',
        keyToFillRatio: '1.6 : 1 Gallery Softness',
        note: 'Creates a serene, museum-catalog reading experience.',
      },
    },
  },
  {
    id: 'std-ws-linear-studio',
    name: 'Bauhaus Linear Studio Workbook',
    subtitle: 'Dieter Rams / Linear Industrial Precision Sheet with Step Rail',
    tagline: 'Matte anodized light-gray industrial design sheet with tactile pill toggles, orange LED status dots & horizontal step rail.',
    category: 'WORKSHEET',
    styleFamily: 'CONTEMPORARY_MODERN',
    architectureLabel: 'Dieter Rams Industrial + Step Rail',
    badgeEmoji: '🎛️',
    badgeLabel: 'Modern Standard 13 · Linear Studio',
    teaserHook: 'Tactile hardware-inspired switches and orange LED status indicators make every question crisp and satisfying.',
    surfaceGradient: 'linear-gradient(135deg, #18181B 0%, #27272A 55%, #09090B 100%)',
    accentGradient: 'linear-gradient(135deg, #FF5500 0%, #F97316 55%, #FB923C 100%)',
    cardBorder: 'rgba(249, 115, 22, 0.45)',
    ambientGlowColor: 'rgba(255, 85, 0, 0.25)',
    lightingOverlay: 'radial-gradient(circle at 20% 10%, rgba(255, 85, 0, 0.12) 0%, transparent 50%)',
    progressArtifactLabel: 'Studio LED Indicators',
    paperBg: '#F4F4F2',
    paperTextureCss: 'none',
    inkColor: '#18181B',
    mutedInkColor: '#52525B',
    primaryAccent: '#FF5500',
    secondaryAccent: '#18181B',
    borderTint: '#D4D4D8',
    headerBgGradient: 'linear-gradient(135deg, #18181B 0%, #27272A 100%)',
    headerTextColor: '#FAFAFA',
    cardBg: '#FFFFFF',
    cardActiveGlowCss: '0 6px 20px -6px rgba(255, 85, 0, 0.2)',
    headingFont: "'Inter', system-ui, sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'ARCHITECTURAL_SPOTLIGHT',
    progressIndicatorLabel: 'Modules Switched On',
    completionRewardLabel: 'All Studio Modules Online',
    councils: {
      artCouncil: {
        directorId: 'RADICAL_MINIMAL',
        directorName: 'Dieter Rams (Braun) × Linear Design System',
        memberLabel: 'Dieter Rams · Industrial Precision',
        note: 'Anodized aluminum off-white (#F4F4F2), crisp 1px #D4D4D8 borders, monospace specification tags, and Braun-inspired #FF5500 orange LED indicators.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Hardware Pioneer',
        microInteractionRule: 'Selecting an answer snaps a tactile pill switch and lights the module’s orange/emerald LED indicator.',
        microReward: 'Tactile Switch & LED Status Light',
        note: 'Less, but better—every interaction feels like a precision-milled physical instrument.',
      },
      educationCouncil: {
        pedagogyLead: 'STEM & Structured Problem-Solving Lead',
        learningPrinciple: 'Clear numbered step progression reduces task initiation friction.',
        pedagogyFocus: 'Step-by-Step Modular Execution',
        note: 'Works brilliantly for both STEM problem sets and structured biblical outlines.',
      },
      lightingDirector: {
        lightingStyle: 'Anodized Studio Softbox',
        lightSourceSpec: 'Even top-down industrial studio lighting.',
        technique: '5,200K Anodized Matte Finish',
        keyToFillRatio: '2.0 : 1 Studio Precision',
        note: 'Clean micro-shadows define each modular card.',
      },
    },
  },
  {
    id: 'std-ws-bento-canvas',
    name: 'Apple Bento Modular Case Canvas',
    subtitle: 'Asymmetric 12-Column Rounded Bento Grid Architecture',
    tagline: 'Contemporary Apple-style 24px rounded Bento grid on frosted pearl gray with asymmetric source, vocab & prompt tiles.',
    category: 'WORKSHEET',
    styleFamily: 'CONTEMPORARY_MODERN',
    architectureLabel: 'Asymmetric 12-Col Bento Grid',
    badgeEmoji: '🍱',
    badgeLabel: 'Modern Standard 14 · Bento Modular Grid',
    teaserHook: 'Explore reading passages, primary source highlights, and interactive prompts in a sleek modular Bento grid.',
    surfaceGradient: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 55%, #111827 100%)',
    accentGradient: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 55%, #06B6D4 100%)',
    cardBorder: 'rgba(59, 130, 246, 0.45)',
    ambientGlowColor: 'rgba(59, 130, 246, 0.25)',
    lightingOverlay: 'radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.14) 0%, transparent 55%)',
    progressArtifactLabel: 'Bento Tiles Completed',
    paperBg: '#F1F5F9',
    paperTextureCss: 'none',
    inkColor: '#0F172A',
    mutedInkColor: '#475569',
    primaryAccent: '#2563EB',
    secondaryAccent: '#4F46E5',
    borderTint: '#E2E8F0',
    headerBgGradient: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
    headerTextColor: '#F8FAFC',
    cardBg: '#FFFFFF',
    cardActiveGlowCss: '0 12px 32px -8px rgba(37, 99, 235, 0.18)',
    headingFont: "'Outfit', 'Inter', sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'ARCHITECTURAL_SPOTLIGHT',
    progressIndicatorLabel: 'Bento Tiles Solved',
    completionRewardLabel: 'Bento Case Study 100% Complete',
    councils: {
      artCouncil: {
        directorId: 'FUTURIST',
        directorName: 'Contemporary Spatial & Bento UI Lead',
        memberLabel: 'Bento Studio · 12-Col Modular Grid',
        note: 'Frosted pearl canvas (#F1F5F9) with crisp white 24px-radius Bento tiles spanning 7+5 and 4+4+4 asymmetric columns.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Gameplay Virtuoso',
        microInteractionRule: 'Completing a Bento tile elevates the card with a subtle royal-blue rim and completion badge.',
        microReward: 'Bento Tile Elevation & Ring Fill',
        note: 'Chunking the worksheet into bite-sized Bento tiles makes the page feel inviting and scannable at a glance.',
      },
      educationCouncil: {
        pedagogyLead: 'Cognitive Chunking & Multimedia Learning Lead',
        learningPrinciple: 'Spatial Bento grouping prevents wall-of-text fatigue.',
        pedagogyFocus: 'Modular Case-Study Chunking',
        note: 'Separates primary text, key vocabulary, and assessment questions into distinct visual Bento zones.',
      },
      lightingDirector: {
        lightingStyle: 'Frosted Glass Ambient Occlusion',
        lightSourceSpec: 'Soft ambient drop-shadows with crisp white specular borders.',
        technique: 'Ambient Occlusion Bento Shadows',
        keyToFillRatio: '1.7 : 1 High-Key Clarity',
        note: 'Gives every Bento card floating depth against the pearl backdrop.',
      },
    },
  },
  {
    id: 'std-ws-socratic-columns',
    name: 'Socratic Dual-Perspective Matrix',
    subtitle: 'Side-by-Side Comparative Evidence Columns & Synthesis Bridge',
    tagline: 'Clean comparative seminar layout with Thesis Banner, Parallel Evidence Columns (A vs B) & Center Synthesis Bridge.',
    category: 'WORKSHEET',
    styleFamily: 'CONTEMPORARY_MODERN',
    architectureLabel: 'Dual-Column Compare + Synthesis Bridge',
    badgeEmoji: '⚖️',
    badgeLabel: 'Modern Standard 15 · Socratic Seminar Matrix',
    teaserHook: 'Weigh two perspectives side-by-side and bridge them into a unified synthesis.',
    surfaceGradient: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 55%, #0F172A 100%)',
    accentGradient: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 55%, #0EA5E9 100%)',
    cardBorder: 'rgba(99, 102, 241, 0.45)',
    ambientGlowColor: 'rgba(79, 70, 229, 0.28)',
    lightingOverlay: 'radial-gradient(circle at 50% 15%, rgba(99, 102, 241, 0.14) 0%, transparent 55%)',
    progressArtifactLabel: 'Dialectical Pillars Balanced',
    paperBg: '#F8FAFC',
    paperTextureCss: 'none',
    inkColor: '#0F172A',
    mutedInkColor: '#475569',
    primaryAccent: '#4F46E5',
    secondaryAccent: '#0284C7',
    borderTint: '#E2E8F0',
    headerBgGradient: 'linear-gradient(135deg, #1E1B4B 0%, #3730A3 100%)',
    headerTextColor: '#FFFFFF',
    cardBg: '#FFFFFF',
    cardActiveGlowCss: '0 10px 28px -8px rgba(79, 70, 229, 0.2)',
    headingFont: "'Outfit', sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'ARCHITECTURAL_SPOTLIGHT',
    progressIndicatorLabel: 'Socratic Columns Evaluated',
    completionRewardLabel: 'Socratic Synthesis Achieved',
    councils: {
      artCouncil: {
        directorId: 'CLASSICAL',
        directorName: 'Pentagram Editorial × Harkness Seminar Table',
        memberLabel: 'Pentagram Editorial · Dual-Column Matrix',
        note: 'Balanced architectural symmetry: Top Thesis Proposition, Left & Right Comparative Evidence Columns, and a spanning Bottom Synthesis Bridge.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Gameplay Virtuoso',
        microInteractionRule: 'Completing both left and right perspective columns unlocks and illuminates the center Synthesis Bridge.',
        microReward: 'Dialectical Balance Scale & Bridge Unlock',
        note: 'Visually rewards balanced analysis across contrasting viewpoints or textual tensions.',
      },
      educationCouncil: {
        pedagogyLead: 'Harkness & Socratic Seminar Director',
        learningPrinciple: 'Comparative juxtaposition sharpens critical discernment.',
        pedagogyFocus: 'Comparative Exegesis & Dialectical Synthesis',
        note: 'Built for comparing Scripture passages, historical viewpoints, or scientific hypotheses.',
      },
      lightingDirector: {
        lightingStyle: 'Balanced Dual-Key Seminar Lighting',
        lightSourceSpec: 'Symmetrical cool-indigo and warm-emerald column accents.',
        technique: 'Dual-Key Symmetrical Column Wash',
        keyToFillRatio: '1.9 : 1 Balanced Contrast',
        note: 'Keeps both comparative columns visually equal and crisp.',
      },
    },
  },
  {
    id: 'std-ws-executive-timeline',
    name: 'Atelier Executive Case & Timeline',
    subtitle: 'Monocle / FT Warm Salmon-Cream Brief with Vertical Stepper Spine',
    tagline: 'Executive case brief on warm editorial cream with a connected vertical timeline spine (① Context → ② Evidence → ③ Action).',
    category: 'WORKSHEET',
    styleFamily: 'CONTEMPORARY_MODERN',
    architectureLabel: 'Vertical Stepper Spine + Case Brief',
    badgeEmoji: '📋',
    badgeLabel: 'Modern Standard 16 · Executive Timeline Brief',
    teaserHook: 'Step through a connected vertical case-study spine from primary evidence to actionable leadership.',
    surfaceGradient: 'linear-gradient(135deg, #271C19 0%, #3E2723 55%, #1C1917 100%)',
    accentGradient: 'linear-gradient(135deg, #059669 0%, #10B981 55%, #D97706 100%)',
    cardBorder: 'rgba(16, 185, 129, 0.45)',
    ambientGlowColor: 'rgba(16, 185, 129, 0.25)',
    lightingOverlay: 'radial-gradient(circle at 20% 25%, rgba(245, 158, 11, 0.12) 0%, transparent 55%)',
    progressArtifactLabel: 'Timeline Milestones Cleared',
    paperBg: '#FBF7F2',
    paperTextureCss: 'none',
    inkColor: '#1C1917',
    mutedInkColor: '#57534E',
    primaryAccent: '#059669',
    secondaryAccent: '#B45309',
    borderTint: '#E7E0D6',
    headerBgGradient: 'linear-gradient(135deg, #1C1917 0%, #064E3B 100%)',
    headerTextColor: '#FBF7F2',
    cardBg: '#FFFFFF',
    cardActiveGlowCss: '0 10px 26px -8px rgba(5, 150, 105, 0.2)',
    headingFont: "'Newsreader', 'Georgia', serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'WARM_VELLUM_SHEEN',
    progressIndicatorLabel: 'Case Milestones Completed',
    completionRewardLabel: 'Executive Case Brief Signed Off',
    councils: {
      artCouncil: {
        directorId: 'WORLD_ECLECTIC',
        directorName: 'Monocle / Financial Times Editorial Studio',
        memberLabel: 'Monocle Editorial · Vertical Timeline Spine',
        note: 'Warm salmon-cream editorial stock (#FBF7F2) with a continuous vertical timeline spine connecting numbered milestone cards.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Silicon Pioneer',
        microInteractionRule: 'Answering each card illuminates the vertical connector line in forest emerald down to the next milestone.',
        microReward: 'Connected Vertical Timeline Illumination',
        note: 'Creates a clear narrative progression from top to bottom.',
      },
      educationCouncil: {
        pedagogyLead: 'Case-Method & Leadership Pedagogy Lead',
        learningPrinciple: 'Sequential narrative scaffolding guides learners from observation to application.',
        pedagogyFocus: 'Sequential Case-Method Progression',
        note: 'Ideal for historical timelines, biblical narrative arcs, and leadership case studies.',
      },
      lightingDirector: {
        lightingStyle: 'Warm Editorial Reading Lamp',
        lightSourceSpec: '3,800K warm editorial paper wash.',
        technique: '3,800K Warm Salmon-Cream Paper Wash',
        keyToFillRatio: '1.8 : 1 Warm Editorial',
        note: 'Easy on the eyes with high-contrast forest-emerald accents.',
      },
    },
  },
];

/**
 * ============================================================================
 * WING II — 4 CLEAN, MODERN, CONTEMPORARY & ELEGANT TEST/QUIZ DESIGNS (17–20)
 * ============================================================================
 */
export const CONTEMPORARY_STANDARD_TEST_QUIZ_TEMPLATES: LivingDocumentTemplate[] = [
  {
    id: 'std-tq-nordic-clarity',
    name: 'Nordic Clarity Modern Assessment',
    subtitle: 'Airy Scandinavian Daylight Sheet with Segmented Pill Navigator',
    tagline: 'Pure snow-white Scandinavian assessment with sticky segmented question pills, [A]–[D] keycap badges & calm progress bar.',
    category: 'TEST_QUIZ',
    styleFamily: 'CONTEMPORARY_MODERN',
    architectureLabel: 'Nordic Daylight + Keycap Option Grid',
    badgeEmoji: '❄️',
    badgeLabel: 'Modern Test 17 · Nordic Clarity',
    teaserHook: 'Crisp keyboard-style option badges ([A] [B] [C] [D]) and a sticky segmented progress bar make testing effortless.',
    surfaceGradient: 'linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #0C4A6E 100%)',
    accentGradient: 'linear-gradient(135deg, #0284C7 0%, #38BDF8 100%)',
    cardBorder: 'rgba(56, 189, 248, 0.45)',
    ambientGlowColor: 'rgba(2, 132, 199, 0.25)',
    lightingOverlay: 'radial-gradient(circle at 50% 10%, rgba(56, 189, 248, 0.14) 0%, transparent 55%)',
    progressArtifactLabel: 'Nordic Segments Completed',
    paperBg: '#F8FAFC',
    paperTextureCss: 'none',
    inkColor: '#0F172A',
    mutedInkColor: '#475569',
    primaryAccent: '#0284C7',
    secondaryAccent: '#0F172A',
    borderTint: '#E2E8F0',
    headerBgGradient: 'linear-gradient(135deg, #0F172A 0%, #0369A1 100%)',
    headerTextColor: '#FFFFFF',
    cardBg: '#FFFFFF',
    cardActiveGlowCss: '0 8px 24px -6px rgba(2, 132, 199, 0.18)',
    headingFont: "'Inter', system-ui, sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'ARCHITECTURAL_SPOTLIGHT',
    progressIndicatorLabel: 'Items Answered',
    completionRewardLabel: 'Assessment Complete',
    councils: {
      artCouncil: {
        directorId: 'RADICAL_MINIMAL',
        directorName: 'Stockholm Design Lab × Scandinavian Minimalist',
        memberLabel: 'Stockholm Minimalist · Daylight Assessment',
        note: 'Pure snow-white cards (#FFFFFF) over cool alabaster (#F8FAFC) with fjord-blue accents (#0284C7) and tactile [A] [B] [C] [D] keycap badges.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Silicon Pioneer',
        microInteractionRule: 'Clicking an option illuminates its keycap badge and fills the corresponding segment in the top navigator bar.',
        microReward: 'Keycap Badge Lock & Segment Bar Fill',
        note: 'Ultra-clean, distraction-free feedback for formal quizzes and benchmarks.',
      },
      educationCouncil: {
        pedagogyLead: 'Modern Psychometrics & Readability Lead',
        learningPrinciple: 'Maximum typographic clarity and zero visual noise optimize reading comprehension.',
        pedagogyFocus: 'High-Legibility Standard Assessment',
        note: 'The gold-standard clean modern quiz layout for any classroom.',
      },
      lightingDirector: {
        lightingStyle: 'Scandinavian High-Key Daylight',
        lightSourceSpec: '6,000K crisp northern daylight diffusion.',
        technique: '6,000K High-Key Daylight Clarity',
        keyToFillRatio: '1.5 : 1 Pure Daylight',
        note: 'Zero dark shadows—pure, inviting academic clarity.',
      },
    },
  },
  {
    id: 'std-tq-oxford-honors',
    name: 'Oxford Collegiate Honors Paper',
    subtitle: 'Clarendon University Press Exam Paper with Point-Margin Column',
    tagline: 'Prestigious cotton-bond university examination paper with double-rule header crest & right-hand [Marks] margin column.',
    category: 'TEST_QUIZ',
    styleFamily: 'CONTEMPORARY_MODERN',
    architectureLabel: 'University Exam Paper + Marks Gutter',
    badgeEmoji: '🎓',
    badgeLabel: 'Modern Test 18 · Oxford Collegiate Honors',
    teaserHook: 'Formal university examination typography with a dedicated right-hand Marks Allocation Gutter.',
    surfaceGradient: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 55%, #172554 100%)',
    accentGradient: 'linear-gradient(135deg, #1D4ED8 0%, #B45309 100%)',
    cardBorder: 'rgba(29, 78, 216, 0.45)',
    ambientGlowColor: 'rgba(29, 78, 216, 0.25)',
    lightingOverlay: 'radial-gradient(circle at 50% 10%, rgba(217, 119, 6, 0.12) 0%, transparent 55%)',
    progressArtifactLabel: 'Examination Marks Earned',
    paperBg: '#FCFBF7',
    paperTextureCss: 'none',
    inkColor: '#111827',
    mutedInkColor: '#4B5563',
    primaryAccent: '#1E3A8A',
    secondaryAccent: '#B45309',
    borderTint: '#D1D5DB',
    headerBgGradient: 'linear-gradient(135deg, #1E3A8A 0%, #172554 100%)',
    headerTextColor: '#FEFCE8',
    cardBg: '#FFFFFF',
    cardActiveGlowCss: '0 8px 24px -6px rgba(30, 58, 138, 0.16)',
    headingFont: "'Libre Baskerville', 'Georgia', serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'WARM_VELLUM_SHEEN',
    progressIndicatorLabel: 'Examination Papers Answered',
    completionRewardLabel: 'Honors Examination Paper Submitted',
    councils: {
      artCouncil: {
        directorId: 'CLASSICAL',
        directorName: 'Clarendon & Oxford University Press Typographer',
        memberLabel: 'Oxford Press · Collegiate Honors Paper',
        note: 'Warm 100% cotton bond paper (#FCFBF7), double-rule navy crest header, formal Roman numeral sections, and a dedicated right-hand [Marks] gutter.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Tactile UI Virtuoso',
        microInteractionRule: 'Answering each question stamps the right-hand Marks Gutter with [✓ Allocated].',
        microReward: 'Right-Margin Marks Allocation Stamp',
        note: 'Gives students the dignified feel of sitting a prestigious university honors paper.',
      },
      educationCouncil: {
        pedagogyLead: 'Higher-Ed & Seminary Assessment Chair',
        learningPrinciple: 'Explicit point-weight gutters help students allocate time proportionally.',
        pedagogyFocus: 'Point-Weighted Honors Assessment',
        note: 'Ideal for seminary exams, AP/Honors classes, and certification checks.',
      },
      lightingDirector: {
        lightingStyle: 'Bodleian Reading Room Lamp',
        lightSourceSpec: 'Warm 4,200K archival bond paper illumination.',
        technique: '4,200K Cotton Bond Paper Light',
        keyToFillRatio: '1.9 : 1 Classical Clarity',
        note: 'Crisp Oxford-navy ink on warm ivory cotton bond.',
      },
    },
  },
  {
    id: 'std-tq-glass-focus',
    name: 'Contemporary Glass Focus Carousel',
    subtitle: 'Single-Question Frosted Acrylic Card with Slide Navigator',
    tagline: 'Sleek contemporary frosted-glass single-card carousel over a soft pastel mesh gradient with Prev/Next slide pills.',
    category: 'TEST_QUIZ',
    styleFamily: 'CONTEMPORARY_MODERN',
    architectureLabel: 'Single-Card Glass Carousel + Dots',
    badgeEmoji: '💎',
    badgeLabel: 'Modern Quiz 19 · Frosted Glass Carousel',
    teaserHook: 'Glide through one sleek frosted-glass question card at a time with zero scroll clutter.',
    surfaceGradient: 'linear-gradient(135deg, #1E1B4B 0%, #311042 55%, #0F172A 100%)',
    accentGradient: 'linear-gradient(135deg, #6366F1 0%, #EC4899 55%, #06B6D4 100%)',
    cardBorder: 'rgba(99, 102, 241, 0.45)',
    ambientGlowColor: 'rgba(99, 102, 241, 0.28)',
    lightingOverlay: 'radial-gradient(circle at 75% 20%, rgba(236, 72, 153, 0.16) 0%, transparent 55%)',
    progressArtifactLabel: 'Carousel Slides Completed',
    paperBg: '#EEF2FF',
    paperTextureCss: 'linear-gradient(135deg, #EEF2FF 0%, #FDF2F8 50%, #ECFDF5 100%)',
    inkColor: '#0F172A',
    mutedInkColor: '#475569',
    primaryAccent: '#4F46E5',
    secondaryAccent: '#EC4899',
    borderTint: '#C7D2FE',
    headerBgGradient: 'linear-gradient(135deg, #312E81 0%, #4F46E5 100%)',
    headerTextColor: '#FFFFFF',
    cardBg: 'rgba(255, 255, 255, 0.92)',
    cardActiveGlowCss: '0 20px 50px -12px rgba(79, 70, 229, 0.22)',
    headingFont: "'Outfit', sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'ARCHITECTURAL_SPOTLIGHT',
    progressIndicatorLabel: 'Focus Cards Completed',
    completionRewardLabel: 'Focus Deck 100% Complete',
    councils: {
      artCouncil: {
        directorId: 'FUTURIST',
        directorName: 'Contemporary Spatial & Acrylic UI Studio',
        memberLabel: 'Spatial Studio · Frosted Glass Carousel',
        note: 'Frosted white acrylic card floating over a soft indigo-rose-mint mesh gradient with pill pagination dots.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Gameplay Virtuoso',
        microInteractionRule: 'Selecting an answer illuminates the pagination pill and lets you glide smoothly to the next card.',
        microReward: 'Smooth Card Glide & Pill Illumination',
        note: 'Modern consumer-app polish applied to formative quizzes.',
      },
      educationCouncil: {
        pedagogyLead: 'Micro-Learning & Formative Check Lead',
        learningPrinciple: 'One-card-per-screen pacing maximizes completion rates on mobile and desktop.',
        pedagogyFocus: 'Focused Single-Card Formative Pacing',
        note: 'Students never feel overwhelmed by a long page of questions.',
      },
      lightingDirector: {
        lightingStyle: 'Refractive Frosted Glass Edge-Light',
        lightSourceSpec: 'Soft pastel mesh refraction behind translucent white cards.',
        technique: 'Pastel Mesh Refraction & White Rim',
        keyToFillRatio: '1.6 : 1 Airy Spatial Light',
        note: 'Clean, modern, and luminous.',
      },
    },
  },
  {
    id: 'std-tq-mastery-rubric',
    name: 'Stripe Mastery & Confidence Matrix',
    subtitle: 'Split Assessment Prompt + 3-Tier Self-Confidence Rubric Rail',
    tagline: 'Contemporary Stripe-Press inspired check pairing each question with a 3-tier Metacognitive Confidence selector.',
    category: 'TEST_QUIZ',
    styleFamily: 'CONTEMPORARY_MODERN',
    architectureLabel: 'Prompt + Metacognitive Confidence Rail',
    badgeEmoji: '📊',
    badgeLabel: 'Modern Test 20 · Mastery & Confidence Matrix',
    teaserHook: 'Pair every answer with a Metacognitive Confidence check (Developing · Confident · Ready to Teach).',
    surfaceGradient: 'linear-gradient(135deg, #064E3B 0%, #0F172A 55%, #1E1B4B 100%)',
    accentGradient: 'linear-gradient(135deg, #10B981 0%, #6366F1 100%)',
    cardBorder: 'rgba(16, 185, 129, 0.45)',
    ambientGlowColor: 'rgba(16, 185, 129, 0.25)',
    lightingOverlay: 'radial-gradient(circle at 20% 20%, rgba(16, 185, 129, 0.14) 0%, transparent 55%)',
    progressArtifactLabel: 'Mastery & Confidence Logged',
    paperBg: '#F8FAFC',
    paperTextureCss: 'none',
    inkColor: '#0F172A',
    mutedInkColor: '#475569',
    primaryAccent: '#059669',
    secondaryAccent: '#4F46E5',
    borderTint: '#E2E8F0',
    headerBgGradient: 'linear-gradient(135deg, #064E3B 0%, #0F172A 100%)',
    headerTextColor: '#ECFDF5',
    cardBg: '#FFFFFF',
    cardActiveGlowCss: '0 10px 28px -8px rgba(5, 150, 105, 0.18)',
    headingFont: "'Outfit', sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    monoFont: "'JetBrains Mono', monospace",
    ambientMotion: 'ARCHITECTURAL_SPOTLIGHT',
    progressIndicatorLabel: 'Mastery Rows Verified',
    completionRewardLabel: 'Mastery & Metacognitive Check Complete',
    councils: {
      artCouncil: {
        directorId: 'RADICAL_MINIMAL',
        directorName: 'Stripe Press × Modern EdTech Systems Lead',
        memberLabel: 'Stripe Press · Mastery & Confidence Split',
        note: 'Crisp asymmetric 8+4 column row per question: Left 8 cols = Question & Choices; Right 4 cols = Metacognitive Confidence & Standard Rubric card.',
      },
      gamingAndInteractiveCouncil: {
        specialistName: 'The Silicon Pioneer',
        microInteractionRule: 'Selecting both an answer and a confidence tier lights up the Mastery Verification badge.',
        microReward: 'Dual Answer + Confidence Lock Badge',
        note: 'Rewards honest self-reflection alongside correct answers.',
      },
      educationCouncil: {
        pedagogyLead: 'Metacognition & Mastery Learning Chair',
        learningPrinciple: 'Metacognitive confidence calibration helps teachers spot lucky guesses vs. true mastery.',
        pedagogyFocus: 'Metacognitive Calibration & Standards',
        note: 'Gives teachers instant visibility into where students feel confident vs. uncertain.',
      },
      lightingDirector: {
        lightingStyle: 'Crisp Emerald & Indigo Studio Light',
        lightSourceSpec: 'High-contrast white cards with emerald and indigo status pills.',
        technique: '5,500K Studio White + Emerald Rim',
        keyToFillRatio: '1.7 : 1 Clean Diagnostic Light',
        note: 'Modern, authoritative, and crystal-clear.',
      },
    },
  },
];

export const ALL_CONTEMPORARY_STANDARD_TEMPLATES: LivingDocumentTemplate[] = [
  ...CONTEMPORARY_STANDARD_WORKSHEET_TEMPLATES,
  ...CONTEMPORARY_STANDARD_TEST_QUIZ_TEMPLATES,
];
export const CONTEMPORARY_STANDARD_TEMPLATES = ALL_CONTEMPORARY_STANDARD_TEMPLATES;

export const ALL_ARTISTIC_LIVING_TEMPLATES: LivingDocumentTemplate[] = [
  ...LIVING_WORKSHEET_TEMPLATES,
  ...LIVING_TEST_QUIZ_TEMPLATES,
];
export const ARTISTIC_LIVING_TEMPLATES = ALL_ARTISTIC_LIVING_TEMPLATES;

export const ALL_LIVING_DOCUMENT_TEMPLATES: LivingDocumentTemplate[] = [
  ...CONTEMPORARY_STANDARD_WORKSHEET_TEMPLATES,
  ...CONTEMPORARY_STANDARD_TEST_QUIZ_TEMPLATES,
  ...LIVING_WORKSHEET_TEMPLATES,
  ...LIVING_TEST_QUIZ_TEMPLATES,
];

/**
 * Design #12 (`std-ws-kinfolk-editorial` — Kinfolk Editorial Magazine Spread)
 * is the platform-wide default worksheet/document template.
 */
export const DEFAULT_LIVING_TEMPLATE_ID = 'std-ws-kinfolk-editorial';
export const DEFAULT_LIVING_TEMPLATE: LivingDocumentTemplate =
  CONTEMPORARY_STANDARD_WORKSHEET_TEMPLATES.find(t => t.id === DEFAULT_LIVING_TEMPLATE_ID) ||
  CONTEMPORARY_STANDARD_WORKSHEET_TEMPLATES[1] ||
  CONTEMPORARY_STANDARD_WORKSHEET_TEMPLATES[0];

const UNIT_TEMPLATE_PREF_KEY = 'plajah_living_doc_template_by_unit_v1';

export function getLivingTemplateById(id?: string): LivingDocumentTemplate {
  if (!id) return DEFAULT_LIVING_TEMPLATE;
  // Support legacy aliases
  const aliasMap: Record<string, string> = {
    'ws-kente-sovereign': 'ws-sankofa-royal-tapestry',
    'ws-celestial-astrolabe': 'ws-galilean-starlight-atlas',
    'ws-botanical-atelier': 'ws-eden-botanical-parchment',
    'ws-risograph-studio': 'ws-pentecost-ember-chronicle',
    'ws-swiss-kinetic': 'ws-damascus-architectural-grid',
    'tq-cathedral-mastery': 'tq-cathedral-glass-mastery',
    'tq-scholar-quest': 'tq-scroll-of-seals-trial',
    'tq-observatory-benchmark': 'tq-berean-scholastic-arena',
    'tq-zenith-calm': 'tq-zenith-sanctuary-calm',
  };
  const resolvedId = aliasMap[id] || id;
  return (
    ALL_LIVING_DOCUMENT_TEMPLATES.find((t) => t.id === resolvedId) ||
    DEFAULT_LIVING_TEMPLATE
  );
}

export function getDefaultLivingTemplateForUnit(
  unitOrKind?:
    | {
        id?: string;
        kind?: string;
        title?: string;
      }
    | string
    | null,
  maybeTitle?: string
): LivingDocumentTemplate {
  if (!unitOrKind) return DEFAULT_LIVING_TEMPLATE;

  const unit =
    typeof unitOrKind === 'string'
      ? { kind: unitOrKind, title: maybeTitle || '' }
      : unitOrKind;

  if (unit.id) {
    try {
      const raw = localStorage.getItem(UNIT_TEMPLATE_PREF_KEY);
      if (raw) {
        const map = JSON.parse(raw) as Record<string, string>;
        if (map[unit.id]) {
          const found = getLivingTemplateById(map[unit.id]);
          if (found) return found;
        }
      }
    } catch {}
  }

  // Design #12 (Kinfolk Editorial Magazine Spread) is the default template across the platform
  return DEFAULT_LIVING_TEMPLATE;
}

export function saveLivingTemplateForUnit(unitId: string, templateId: string): void {
  if (!unitId) return;
  try {
    const raw = localStorage.getItem(UNIT_TEMPLATE_PREF_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    map[unitId] = templateId;
    localStorage.setItem(UNIT_TEMPLATE_PREF_KEY, JSON.stringify(map));
  } catch {}
}
