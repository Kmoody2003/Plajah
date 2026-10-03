import type { TelaVectorObject } from '../../types';

export interface BoldLayerSegmentation {
  environment: {
    description: string;
    keyElements: string[];
    lightingPass: string;
  };
  heroSubject: {
    name: string;
    description: string;
    opticsAndTextures: string;
  };
  kineticOverlays: {
    description: string;
    particleAndBeams: string;
  };
  typographyAndData: {
    headline: string;
    subtitle: string;
    hierarchy: string;
    admissionFields: string[];
  };
}

export interface BoldTemplateMaster {
  id: string;
  name: string;
  kind: 'ticket' | 'evite' | 'promo';
  conceptCounterpart: string;
  width: number;
  height: number;
  palette: [string, string, string, string];
  tagline: string;
  description: string;
  imageFileName: string;
  segmentation: BoldLayerSegmentation;
  motion: {
    duration: number;
    tracks: Array<{
      objectId: string;
      property: 'rotation' | 'x' | 'y' | 'opacity';
      from: number;
      to: number;
      delay: number;
      duration: number;
      loop?: 'restart' | 'alternate';
    }>;
  };
  audio: {
    notes: number[];
    tempo: number;
    synthesizerPatch: 'analog-lead' | 'celestial-pad' | 'sub-bass' | 'crystal-bell' | 'brass-fanfare';
  };
  council: {
    lead: string;
    counterpoint: string;
    editor: string;
    rationale: string;
  };
  build: () => TelaVectorObject[];
}

export const BOLD_MASTER_TEMPLATES: BoldTemplateMaster[] = [
  {
    id: 'bold-ticket-signal',
    name: 'Futura Fest 2077 · Voltage Rising',
    kind: 'ticket',
    conceptCounterpart: 'Signal / 09',
    width: 900,
    height: 420,
    palette: ['#040a0e', '#00ff66', '#ff2255', '#00d4ff'],
    tagline: 'High-voltage cyberpunk festival stage with holographic badge and chromatic laser grid.',
    description: 'A radical reinvention of the electronic listening ticket: hyper-saturated laser beams intersect in 3D atmospheric haze across a stadium crowd, anchored by a beveled holographic neon pass and verified admittance matrix.',
    imageFileName: 'bold_signal_ticket_1790723946899.jpg',
    segmentation: {
      environment: {
        description: 'Deep obsidian arena floor, volumetric smoke hazers, line-array speaker towers, silhouettes of euphoric concertgoers.',
        keyElements: ['Atmospheric haze', 'Crowd silhouettes', 'Acoustic array towers', 'Reflective stage floor'],
        lightingPass: 'Volumetric RGB laser cones with chromatic lens flare and specular floor bounce.',
      },
      heroSubject: {
        name: 'Holographic Neon Festival Pass',
        description: 'Iridescent metallic bevel badge with integrated QR routing, date stamps, and neon border framing.',
        opticsAndTextures: 'Brushed chromatic metal foil, retro-futuristic rounded notches, luminescent phosphor letterforms.',
      },
      kineticOverlays: {
        description: 'Multi-directional laser beam sweeps and stroboscopic beam bursts timed to musical kicks.',
        particleAndBeams: 'Neon emerald and crimson laser shafts with dust motes and prism flares.',
      },
      typographyAndData: {
        headline: 'FUTURA FEST 2077',
        subtitle: 'VOLTAGE RISING / NEO-KYOTO AMPHITHEATRE',
        hierarchy: 'Massive heavy sans-serif branding, monospace coordinate stamps, high-contrast admission stub.',
        admissionFields: ['ADMISSION TICKET', 'VALID FOR 3 DAYS', 'PASS: FF2077-A0349', 'TIER: VIP KINETIC'],
      },
    },
    motion: {
      duration: 3200,
      tracks: [
        { objectId: 'laser-accent', property: 'opacity', from: 0.4, to: 1.0, delay: 0, duration: 1600, loop: 'alternate' },
        { objectId: 'badge-glow', property: 'opacity', from: 0.7, to: 1.0, delay: 200, duration: 1400, loop: 'alternate' },
      ],
    },
    audio: {
      notes: [36, 48, 51, 55, 60],
      tempo: 130,
      synthesizerPatch: 'sub-bass',
    },
    council: {
      lead: 'FUTURIST (Hyper-kinetic stadium optics & raw electrical pulse)',
      counterpoint: 'REBEL (Underground counter-culture festival grit)',
      editor: 'CONVERSION CLARITY (Uncompromising legibility of venue, time, and entry credentials)',
      rationale: 'Moves beyond flat geometric abstraction into photoreal spatial immersion, delivering festival euphoria without sacrificing ticket functionality.',
    },
    build: () => [
      { id: 'bold-signal-ground', kind: 'RECT', x: 0, y: 0, w: 900, h: 420, fill: '#050a0f', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'GROUND' },
      { id: 'bold-signal-laser-accent', kind: 'LINE', x: 0, y: 0, w: 900, h: 200, fill: 'none', stroke: '#00ff66', strokeWidth: 3, rotation: 0, opacity: 0.85, points: [0, 40, 600, 320], templateRole: 'ORNAMENT' },
      { id: 'bold-signal-laser-sub', kind: 'LINE', x: 0, y: 0, w: 900, h: 200, fill: 'none', stroke: '#ff2255', strokeWidth: 2, rotation: 0, opacity: 0.9, points: [900, 20, 250, 380], templateRole: 'ORNAMENT' },
      { id: 'bold-signal-badge-glow', kind: 'RECT', x: 40, y: 60, w: 680, h: 290, fill: '#0a1420', stroke: '#00ff66', strokeWidth: 2, rx: 16, rotation: 0, opacity: 0.92, templateRole: 'ORNAMENT' },
      { id: 'bold-signal-title', kind: 'TEXT', x: 75, y: 105, w: 600, h: 64, fill: '#00ff66', text: 'FUTURA FEST 2077', fontSize: 46, fontFamily: 'Arial, sans-serif', fontWeight: 900, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'HEADLINE' },
      { id: 'bold-signal-subtitle', kind: 'TEXT', x: 75, y: 175, w: 580, h: 32, fill: '#ff4466', text: 'VOLTAGE RISING · NEO-KYOTO AMPHITHEATRE', fontSize: 18, fontFamily: 'Arial, sans-serif', fontWeight: 700, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'DECK' },
      { id: 'bold-signal-meta', kind: 'TEXT', x: 75, y: 250, w: 580, h: 48, fill: '#e0f4ff', text: 'FRI 08 – SUN 10 NOV 2077  /  DOORS 19:00  /  ALL AGES', fontSize: 15, fontFamily: 'monospace', fontWeight: 600, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.95, templateRole: 'LABEL' },
      { id: 'bold-signal-stub-line', kind: 'LINE', x: 730, y: 30, w: 2, h: 360, fill: 'none', stroke: '#00d4ff', strokeWidth: 2, strokeDash: [6, 6], rotation: 0, opacity: 0.6, points: [730, 30, 730, 390], templateRole: 'RULE' },
      { id: 'bold-signal-admit', kind: 'TEXT', x: 748, y: 80, w: 130, h: 30, fill: '#ffffff', text: 'ADMIT', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.8, templateRole: 'LABEL' },
      { id: 'bold-signal-tier', kind: 'TEXT', x: 746, y: 120, w: 130, h: 60, fill: '#00ff66', text: 'VIP', fontSize: 44, fontFamily: 'Arial, sans-serif', fontWeight: 900, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'LABEL' },
      { id: 'bold-signal-qr-sim', kind: 'RECT', x: 755, y: 250, w: 90, h: 90, fill: '#00ff66', stroke: '#003311', strokeWidth: 2, rx: 6, rotation: 0, opacity: 0.9, templateRole: 'ORNAMENT' },
    ],
  },
  {
    id: 'bold-ticket-nocturne',
    name: 'Cosmic Nocturne · Celestial Amphitheater',
    kind: 'ticket',
    conceptCounterpart: 'Nocturne Society',
    width: 900,
    height: 420,
    palette: ['#070b1a', '#2858ff', '#ffb834', '#a188f2'],
    tagline: 'Lapis lazuli & floating burnished gold astrolabe rings hovering in deep galactic space.',
    description: 'Elevates the chamber music concept into an interstellar acoustic colosseum where astronomical rings track harmonies against nebular dust clouds and celestial bodies.',
    imageFileName: 'bold_nocturne_ticket_1790723956271.jpg',
    segmentation: {
      environment: {
        description: 'Vast cosmic void with deep cobalt nebulae, spiral galaxies, and shimmering stellar clusters.',
        keyElements: ['Deep space nebulae', 'Floating orbital platforms', 'Galactic core starfield', 'Iridescent crystalline dust'],
        lightingPass: 'Warm burnished gold celestial rim lights contrasting cool galactic cyan illumination.',
      },
      heroSubject: {
        name: 'Monumental Concentric Astrolabe Rings',
        description: 'Colossal floating acoustic gimbals engraved with constellation markings framing the master performance podium.',
        opticsAndTextures: 'Polished royal lapis lazuli inlays, hammered 24k gold leaf, mirror glass reflections.',
      },
      kineticOverlays: {
        description: 'Slow counter-rotating celestial rings and drifting stellar dust motes pulsing with acoustic resonance.',
        particleAndBeams: 'Gold stellar embers, gravitational lensing light rings, soft cosmic glow.',
      },
      typographyAndData: {
        headline: 'NOCTURNE CELESTIAL',
        subtitle: 'INTERSTELLAR SYMPHONIC ASSEMBLY · SECTOR 07',
        hierarchy: 'Grand Roman serif headings, refined classical spacing, precise orbital docket numerals.',
        admissionFields: ['CEREMONIAL CHAMBER', 'SEAT: ORBITAL TIER A-01', 'DATE: EQUINOX 2026'],
      },
    },
    motion: {
      duration: 6000,
      tracks: [
        { objectId: 'celestial-ring', property: 'rotation', from: 0, to: 360, delay: 0, duration: 24000, loop: 'restart' },
        { objectId: 'nebula-glow', property: 'opacity', from: 0.6, to: 0.95, delay: 0, duration: 4000, loop: 'alternate' },
      ],
    },
    audio: {
      notes: [48, 55, 60, 64, 67, 72],
      tempo: 68,
      synthesizerPatch: 'celestial-pad',
    },
    council: {
      lead: 'CLASSICAL (Eternal harmonic geometry & celestial music of the spheres)',
      counterpoint: 'BAROQUE (Opulent gilded ornamentation & astronomical depth)',
      editor: 'RADICAL MINIMAL (Uncluttered typographic air and pristine admission hierarchy)',
      rationale: 'Transforms traditional classical ticket layouts into a timeless cosmic cathedral of sound.',
    },
    build: () => [
      { id: 'bold-nocturne-ground', kind: 'RECT', x: 0, y: 0, w: 900, h: 420, fill: '#060a18', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'GROUND' },
      { id: 'bold-nocturne-nebula-glow', kind: 'ELLIPSE', x: 450, y: 180, w: 500, h: 320, fill: '#1b2c68', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.6, blur: 40, templateRole: 'ORNAMENT' },
      { id: 'bold-nocturne-celestial-ring', kind: 'ELLIPSE', x: 550, y: 40, w: 320, h: 320, fill: 'none', stroke: '#ffb834', strokeWidth: 2, rotation: 15, opacity: 0.85, templateRole: 'ORNAMENT' },
      { id: 'bold-nocturne-celestial-inner', kind: 'ELLIPSE', x: 580, y: 70, w: 260, h: 260, fill: 'none', stroke: '#8c78df', strokeWidth: 1.5, rotation: 35, opacity: 0.7, templateRole: 'ORNAMENT' },
      { id: 'bold-nocturne-title', kind: 'TEXT', x: 60, y: 110, w: 520, h: 56, fill: '#f6eedb', text: 'NOCTURNE', fontSize: 50, fontFamily: 'Georgia, serif', fontWeight: 400, letterSpacing: 0.08, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'HEADLINE' },
      { id: 'bold-nocturne-subtitle', kind: 'TEXT', x: 64, y: 175, w: 480, h: 28, fill: '#ffb834', text: 'CELESTIAL CHAMBER ASSEMBLY · THE OBSERVATORY', fontSize: 16, fontFamily: 'Georgia, serif', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.9, templateRole: 'DECK' },
      { id: 'bold-nocturne-date', kind: 'TEXT', x: 64, y: 280, w: 460, h: 32, fill: '#c9d2f2', text: 'SATURDAY 24 OCTOBER · 20:00 CET', fontSize: 15, fontFamily: 'monospace', fontWeight: 600, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.85, templateRole: 'LABEL' },
      { id: 'bold-nocturne-divider', kind: 'LINE', x: 64, y: 250, w: 460, h: 1, fill: 'none', stroke: '#ffb834', strokeWidth: 1, opacity: 0.4, points: [64, 250, 524, 250], templateRole: 'RULE' },
      { id: 'bold-nocturne-stub', kind: 'LINE', x: 740, y: 30, w: 2, h: 360, fill: 'none', stroke: '#ffb834', strokeWidth: 1.5, strokeDash: [4, 4], opacity: 0.5, points: [740, 30, 740, 390], templateRole: 'RULE' },
      { id: 'bold-nocturne-num', kind: 'TEXT', x: 765, y: 120, w: 100, h: 70, fill: '#ffb834', text: '01', fontSize: 52, fontFamily: 'Georgia, serif', fontWeight: 400, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'LABEL' },
      { id: 'bold-nocturne-tier', kind: 'TEXT', x: 760, y: 220, w: 110, h: 24, fill: '#e6ebff', text: 'CHAMBER TIER', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.75, templateRole: 'LABEL' },
    ],
  },
  {
    id: 'bold-ticket-tidal',
    name: 'Bioluminescent Abyss · Oceanic Symphony',
    kind: 'ticket',
    conceptCounterpart: 'Tidal Listening',
    width: 900,
    height: 420,
    palette: ['#03101c', '#00f7d2', '#ff3388', '#2a4480'],
    tagline: 'Submerged oceanic auditorium with gliding giant mantas and luminous coral caustics.',
    description: 'Reinterprets the coastal tidal score into a deep-sea benthic performance hall where underwater pressure waves, electric coral polyps, and acoustic sonar create a transcendent sonic experience.',
    imageFileName: 'bold_tidal_ticket_1790723971217.jpg',
    segmentation: {
      environment: {
        description: 'Deep ocean abyss auditorium, amphitheater seating descending into an ancient marine trench, living coral reef walls.',
        keyElements: ['Bioluminescent reef shelves', 'Submerged stepped seating', 'Deep sea water columns', 'Underwater caustics'],
        lightingPass: 'Overhead ocean surface sunbeams refracted through deep water columns onto glowing coral tips.',
      },
      heroSubject: {
        name: 'Gliding Pelagic Giant Mantas',
        description: 'Luminescent giant oceanic mantas hovering overhead in synchronized formation, echoing the symphony.',
        opticsAndTextures: 'Subsurface scattering on translucent cartilage, neon cyan counter-shading, water droplet caustics.',
      },
      kineticOverlays: {
        description: 'Rippling water caustics, floating bioluminescent plankton spore clouds, gentle sonar concentric pulses.',
        particleAndBeams: 'Electric blue spark motes, undulating light water ripples, deep marine ambient glow.',
      },
      typographyAndData: {
        headline: 'TIDAL ABYSS',
        subtitle: 'DEEP OCEAN ACOUSTIC STUDIES · TRENCH LAB 04',
        hierarchy: 'Fluid organic sans-serif paired with marine navigation coordinate data.',
        admissionFields: ['DEPTH: 3,200 METERS', 'VESSEL DOCK: MARIANA', 'SUB-PRESSURE ACCESS'],
      },
    },
    motion: {
      duration: 4800,
      tracks: [
        { objectId: 'caustic-drift', property: 'y', from: 0, to: -20, delay: 0, duration: 2400, loop: 'alternate' },
        { objectId: 'sonar-pulse', property: 'opacity', from: 0.3, to: 0.9, delay: 400, duration: 2000, loop: 'alternate' },
      ],
    },
    audio: {
      notes: [41, 48, 53, 58, 65],
      tempo: 74,
      synthesizerPatch: 'analog-lead',
    },
    council: {
      lead: 'WORLD ECLECTIC (Organic natural underwater marine biome)',
      counterpoint: 'FUTURIST (Speculative deep-sea acoustic research)',
      editor: 'LEGIBILITY (Crystal clear contrast against deep aquatic blues)',
      rationale: 'Replaces simple wave line graphs with a truly breathtaking, photoreal oceanic sanctuary.',
    },
    build: () => [
      { id: 'bold-tidal-ground', kind: 'RECT', x: 0, y: 0, w: 900, h: 420, fill: '#04101d', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'GROUND' },
      { id: 'bold-tidal-sonar-pulse', kind: 'ELLIPSE', x: 500, y: 60, w: 340, h: 280, fill: 'none', stroke: '#00f7d2', strokeWidth: 2, rotation: 0, opacity: 0.7, templateRole: 'ORNAMENT' },
      { id: 'bold-tidal-title', kind: 'TEXT', x: 60, y: 110, w: 500, h: 56, fill: '#00f7d2', text: 'TIDAL ABYSS', fontSize: 48, fontFamily: 'Arial, sans-serif', fontWeight: 800, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'HEADLINE' },
      { id: 'bold-tidal-subtitle', kind: 'TEXT', x: 62, y: 175, w: 460, h: 28, fill: '#ff4998', text: 'PELAGIC SYMPHONIC SUITE · DEPTH 3200M', fontSize: 16, fontFamily: 'Arial, sans-serif', fontWeight: 600, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.9, templateRole: 'DECK' },
      { id: 'bold-tidal-meta', kind: 'TEXT', x: 62, y: 280, w: 450, h: 32, fill: '#a0d8ef', text: 'COASTAL RESEARCH LAB / ADAPTIVE SONAR SEAT 09', fontSize: 14, fontFamily: 'monospace', fontWeight: 600, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.85, templateRole: 'LABEL' },
      { id: 'bold-tidal-stub', kind: 'LINE', x: 740, y: 30, w: 2, h: 360, fill: 'none', stroke: '#00f7d2', strokeWidth: 1.5, strokeDash: [6, 4], opacity: 0.5, points: [740, 30, 740, 390], templateRole: 'RULE' },
      { id: 'bold-tidal-admit', kind: 'TEXT', x: 760, y: 100, w: 110, h: 30, fill: '#00f7d2', text: 'OCEANIC', fontSize: 14, fontFamily: 'monospace', fontWeight: 700, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.9, templateRole: 'LABEL' },
      { id: 'bold-tidal-seat', kind: 'TEXT', x: 755, y: 150, w: 110, h: 60, fill: '#ffffff', text: 'A-22', fontSize: 44, fontFamily: 'Arial, sans-serif', fontWeight: 900, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'LABEL' },
    ],
  },
  {
    id: 'bold-ticket-prism',
    name: 'Obsidian Prism · Volcanic Spectrum',
    kind: 'ticket',
    conceptCounterpart: 'Prism Cinema',
    width: 900,
    height: 420,
    palette: ['#09090c', '#ff5500', '#00f2ff', '#ffd700'],
    tagline: 'Volcanic obsidian colosseum with rivers of molten gold lava splitting into rainbow laser beams.',
    description: 'Takes the faceted cinema prism concept and situates it inside a titanic volcanic crater of black mirror obsidian, where a colossal crystal pyramid fractures overhead spotlight beams into laser spectrum rays.',
    imageFileName: 'bold_prism_ticket_1790723980351.jpg',
    segmentation: {
      environment: {
        description: 'Vast volcanic subterranean amphitheater carved from black obsidian basalt columns, tiered seating for thousands, glowing cascading lava falls.',
        keyElements: ['Basalt columns', 'Cascading molten lava veins', 'Mirrored obsidian floor', 'Stepped stone seating tiers'],
        lightingPass: 'High-contrast chiaroscuro: blazing amber volcanic up-lighting against cold spectral laser down-lighting.',
      },
      heroSubject: {
        name: 'Monolithic Triangular Crystal Prism',
        description: 'Flawless optical glass monolith suspended at the stage center, catching an overhead vertical laser pillar.',
        opticsAndTextures: 'Cauchy dispersion caustics, total internal reflection, razor-sharp beveled crystal edges.',
      },
      kineticOverlays: {
        description: 'Blazing rainbow spectrum rays projecting across the dark arena walls with rising incandescent lava embers.',
        particleAndBeams: 'Refracted 7-color laser fan, drifting volcanic spark motes, subtle thermal distortion waves.',
      },
      typographyAndData: {
        headline: 'PRISM CINEMA',
        subtitle: 'THE 70MM MONOLITH EXPERIENCE · VOLCANIC CALDERA',
        hierarchy: 'Bold industrial display grotesque with volcanic gold foil accents and sharp geometric rules.',
        admissionFields: ['PREMIERE SCREENING', 'THE CALDERA DOME', 'RESERVED SPECTRAL TIER'],
      },
    },
    motion: {
      duration: 3800,
      tracks: [
        { objectId: 'spectrum-beam', property: 'opacity', from: 0.5, to: 1.0, delay: 0, duration: 1900, loop: 'alternate' },
        { objectId: 'lava-glow', property: 'opacity', from: 0.7, to: 1.0, delay: 300, duration: 1500, loop: 'alternate' },
      ],
    },
    audio: {
      notes: [45, 52, 57, 60, 69],
      tempo: 84,
      synthesizerPatch: 'crystal-bell',
    },
    council: {
      lead: 'BAROQUE (Dramatic chiaroscuro contrasts & theatrical grandeur)',
      counterpoint: 'FUTURIST (Hyper-precise optical dispersion & laser mechanics)',
      editor: 'EDITORIAL CLARITY (Strong black letter-boxing and sharp screen hierarchy)',
      rationale: 'Replaces abstract triangles with a jaw-dropping physical spectacle of elemental fire and optical glass.',
    },
    build: () => [
      { id: 'bold-prism-ground', kind: 'RECT', x: 0, y: 0, w: 900, h: 420, fill: '#0a0a0d', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'GROUND' },
      { id: 'bold-prism-lava-glow', kind: 'RECT', x: 420, y: 280, w: 460, h: 100, fill: '#ff4400', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.4, blur: 30, templateRole: 'ORNAMENT' },
      { id: 'bold-prism-title', kind: 'TEXT', x: 60, y: 110, w: 500, h: 56, fill: '#ffffff', text: 'PRISM CINEMA', fontSize: 46, fontFamily: 'Arial, sans-serif', fontWeight: 900, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'HEADLINE' },
      { id: 'bold-prism-subtitle', kind: 'TEXT', x: 62, y: 175, w: 480, h: 28, fill: '#ffd700', text: 'VOLCANIC EXPANDED CINEMA PREMIERE · CALDERA 01', fontSize: 16, fontFamily: 'Arial, sans-serif', fontWeight: 700, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.95, templateRole: 'DECK' },
      { id: 'bold-prism-spectrum-beam', kind: 'LINE', x: 460, y: 40, w: 400, h: 240, fill: 'none', stroke: '#00f2ff', strokeWidth: 4, opacity: 0.9, points: [520, 160, 880, 80], templateRole: 'ORNAMENT' },
      { id: 'bold-prism-spectrum-red', kind: 'LINE', x: 460, y: 40, w: 400, h: 240, fill: 'none', stroke: '#ff2255', strokeWidth: 4, opacity: 0.9, points: [520, 160, 880, 240], templateRole: 'ORNAMENT' },
      { id: 'bold-prism-stub', kind: 'LINE', x: 740, y: 30, w: 2, h: 360, fill: 'none', stroke: '#ffd700', strokeWidth: 1.5, strokeDash: [6, 4], opacity: 0.5, points: [740, 30, 740, 390], templateRole: 'RULE' },
      { id: 'bold-prism-admit', kind: 'TEXT', x: 760, y: 90, w: 110, h: 30, fill: '#ffd700', text: '70MM ADMIT', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.9, templateRole: 'LABEL' },
      { id: 'bold-prism-seat', kind: 'TEXT', x: 755, y: 140, w: 110, h: 60, fill: '#ffffff', text: 'PR-1', fontSize: 44, fontFamily: 'Arial, sans-serif', fontWeight: 900, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'LABEL' },
    ],
  },
  {
    id: 'bold-ticket-paper',
    name: 'Neon Riot · Explosive Tactile Punk Fair',
    kind: 'ticket',
    conceptCounterpart: 'Paper Riot',
    width: 900,
    height: 420,
    palette: ['#121113', '#ff5500', '#eeff00', '#222222'],
    tagline: 'Dimensional torn neon cardstock collage with physical paper relief and screenprint textures.',
    description: 'An aggressive, uninhibited tribute to underground zine culture and DIY music festivals: jagged torn edges of fluorescent stock burst forward from heavy black archival paper with visceral tactile authenticity.',
    imageFileName: 'bold_paper_ticket_1790724061326.jpg',
    segmentation: {
      environment: {
        description: 'Matte black heavy archival cotton ground, casting physical drop shadows under shredded paper edges.',
        keyElements: ['Torn paper fibers', 'Cast drop shadows', 'Heavy cotton rag paper ground'],
        lightingPass: 'Direct overhead studio photography lighting with sharp contact shadows along shredded paper edges.',
      },
      heroSubject: {
        name: 'Exploded 3D Torn Paper Ticket Deck',
        description: 'Layered collage of fluorescent orange, acid-yellow, and jet-black paper stocks torn by hand.',
        opticsAndTextures: 'Visible paper pulp fibers, matte silkscreen ink texture, offset registration misalignments.',
      },
      kineticOverlays: {
        description: 'Subtle mechanical vibration tremor and micro-shadow movement mimicking live sub-frequency rattles.',
        particleAndBeams: 'Paper confetti fragments, silkscreen halftone dots, rough torn fiber micro-details.',
      },
      typographyAndData: {
        headline: 'NEON RIOT FESTIVAL',
        subtitle: 'INDEPENDENT MUSIC / ART / ANARCHY · BROOKLYN WAREHOUSE',
        hierarchy: 'Distressed custom brush-ink festival lettering, hand-stamped numbers, perforated admit stub.',
        admissionFields: ['ADMIT ONE', 'AUG 16-18', 'PRICE: $25', 'PASS: 0721'],
      },
    },
    motion: {
      duration: 2800,
      tracks: [
        { objectId: 'paper-jitter', property: 'x', from: 0, to: 4, delay: 0, duration: 1400, loop: 'alternate' },
        { objectId: 'neon-burst', property: 'opacity', from: 0.85, to: 1.0, delay: 200, duration: 1200, loop: 'alternate' },
      ],
    },
    audio: {
      notes: [40, 47, 52, 55, 62],
      tempo: 140,
      synthesizerPatch: 'brass-fanfare',
    },
    council: {
      lead: 'REBEL (Raw DIY punk energy & genuine material friction)',
      counterpoint: 'CLASSICAL (Respect for traditional print-making & bookbinding substrate physics)',
      editor: 'PUNCH (Maximum visual attitude and undeniable shelf presence)',
      rationale: 'Replaces simple flat SVG cutouts with visceral tactile paper craft that feels like a collector artifact.',
    },
    build: () => [
      { id: 'bold-paper-ground', kind: 'RECT', x: 0, y: 0, w: 900, h: 420, fill: '#141416', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'GROUND' },
      { id: 'bold-paper-torn-orange', kind: 'RECT', x: 80, y: 60, w: 600, h: 280, fill: '#ff5500', stroke: 'none', strokeWidth: 0, rotation: -2, opacity: 0.95, rx: 4, templateRole: 'ORNAMENT' },
      { id: 'bold-paper-torn-yellow', kind: 'RECT', x: 120, y: 90, w: 520, h: 220, fill: '#e6ff00', stroke: 'none', strokeWidth: 0, rotation: 2, opacity: 0.98, rx: 2, templateRole: 'ORNAMENT' },
      { id: 'bold-paper-title', kind: 'TEXT', x: 140, y: 125, w: 480, h: 60, fill: '#111111', text: 'NEON RIOT', fontSize: 52, fontFamily: 'Arial, sans-serif', fontWeight: 900, stroke: 'none', strokeWidth: 0, rotation: 1, opacity: 1, templateRole: 'HEADLINE' },
      { id: 'bold-paper-subtitle', kind: 'TEXT', x: 145, y: 200, w: 460, h: 32, fill: '#ff2200', text: 'INDEPENDENT MUSIC / ART / ANARCHY', fontSize: 18, fontFamily: 'Arial, sans-serif', fontWeight: 800, stroke: 'none', strokeWidth: 0, rotation: 1, opacity: 1, templateRole: 'DECK' },
      { id: 'bold-paper-venue', kind: 'TEXT', x: 145, y: 260, w: 460, h: 28, fill: '#111111', text: 'AUG 16-18 · BROOKLYN WAREHOUSE · $25', fontSize: 15, fontFamily: 'monospace', fontWeight: 700, stroke: 'none', strokeWidth: 0, rotation: 1, opacity: 0.9, templateRole: 'LABEL' },
      { id: 'bold-paper-stub', kind: 'LINE', x: 740, y: 30, w: 2, h: 360, fill: 'none', stroke: '#ff5500', strokeWidth: 2, strokeDash: [8, 4], opacity: 0.8, points: [740, 30, 740, 390], templateRole: 'RULE' },
      { id: 'bold-paper-admit', kind: 'TEXT', x: 755, y: 90, w: 120, h: 30, fill: '#e6ff00', text: 'ADMIT ONE', fontSize: 15, fontFamily: 'Arial, sans-serif', fontWeight: 900, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'LABEL' },
      { id: 'bold-paper-price', kind: 'TEXT', x: 760, y: 150, w: 110, h: 60, fill: '#ffffff', text: '$25', fontSize: 44, fontFamily: 'Arial, sans-serif', fontWeight: 900, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'LABEL' },
    ],
  },
  {
    id: 'bold-evite-masque',
    name: 'The Grand Venetian Masquerade',
    kind: 'evite',
    conceptCounterpart: 'Midnight Masque',
    width: 600,
    height: 800,
    palette: ['#160822', '#d4af37', '#800020', '#4a154b'],
    tagline: 'Sculpted ruby & 24k gold filigree mask floating above royal purple velvet drapery.',
    description: 'An invitation of supreme aristocratic drama: deep crushed royal purple velvet drapery illuminated by warm chiaroscuro candlelight, with an ornate Venetian filigree mask studded with pigeon-blood rubies.',
    imageFileName: 'bold_masque_evite_1790723999431.jpg',
    segmentation: {
      environment: {
        description: 'Dramatic backdrop of heavy, gathered royal purple crushed velvet curtains with rich specular sheen.',
        keyElements: ['Crushed purple velvet folds', 'Golden candlelit bokeh', 'Dramatic overhead key spotlight', 'Soft velvet shadows'],
        lightingPass: 'Warm theatrical chiaroscuro with floating golden bokeh orbs and rim light on the mask.',
      },
      heroSubject: {
        name: 'Sculpted Imperial Venetian Filigree Mask',
        description: 'Ornate gold repoussé masquerade mask encrusted with faceted deep red rubies and natural pearls.',
        opticsAndTextures: 'Hand-chiseled antique gold, deep ruby refractions, baroque scrollwork, tactile velvet.',
      },
      kineticOverlays: {
        description: 'Gently drifting candlelit dust particles and subtle velvet shimmer that deepens with mouse movement.',
        particleAndBeams: 'Golden light motes, soft ambient lens flares, subtle vignetting.',
      },
      typographyAndData: {
        headline: 'The Grand Venetian Masquerade Ball',
        subtitle: 'SATURDAY, OCTOBER 26TH · PALAZZO SERENISSIMA, VENICE',
        hierarchy: 'Opulent calligraphic flourish script balanced with refined classical Roman capitals.',
        admissionFields: ['BLACK TIE & MASK MANDATORY', 'DOORS AT EIGHT O’CLOCK', 'RSVP PRIVÉ'],
      },
    },
    motion: {
      duration: 5200,
      tracks: [
        { objectId: 'mask-float', property: 'y', from: 0, to: -16, delay: 0, duration: 2600, loop: 'alternate' },
        { objectId: 'ember-twinkle', property: 'opacity', from: 0.6, to: 1.0, delay: 400, duration: 1800, loop: 'alternate' },
      ],
    },
    audio: {
      notes: [45, 52, 57, 60, 64, 69],
      tempo: 64,
      synthesizerPatch: 'celestial-pad',
    },
    council: {
      lead: 'BAROQUE (Unapologetic theatrical luxury & chiaroscuro drama)',
      counterpoint: 'CLASSICAL (Renaissance Venetian proportions & dignified reserve)',
      editor: 'LUXURY (Every detail communicates elevated occasion)',
      rationale: 'Replaces a flat 2D mask graphic with an opulent museum-grade physical visual that commands immediate attendance.',
    },
    build: () => [
      { id: 'bold-masque-ground', kind: 'RECT', x: 0, y: 0, w: 600, h: 800, fill: '#14061f', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'GROUND' },
      { id: 'bold-masque-velvet-accent', kind: 'RECT', x: 40, y: 40, w: 520, h: 720, fill: '#280c3e', stroke: '#d4af37', strokeWidth: 1.5, rx: 12, rotation: 0, opacity: 0.85, templateRole: 'ORNAMENT' },
      { id: 'bold-masque-title', kind: 'TEXT', x: 60, y: 490, w: 480, h: 64, fill: '#f6e2b8', text: 'The Grand Venetian Masquerade', fontSize: 32, fontFamily: 'Georgia, serif', fontStyle: 'italic', textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'HEADLINE' },
      { id: 'bold-masque-subtitle', kind: 'TEXT', x: 60, y: 565, w: 480, h: 28, fill: '#d4af37', text: 'SATURDAY, OCTOBER 26TH · PALAZZO SERENISSIMA', fontSize: 14, fontFamily: 'Georgia, serif', textAlign: 'center', letterSpacing: 0.1, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.95, templateRole: 'DECK' },
      { id: 'bold-masque-details', kind: 'TEXT', x: 60, y: 620, w: 480, h: 48, fill: '#eedbc2', text: 'DOORS AT EIGHT O’CLOCK  /  VENICE, ITALY  /  MASKS REQUIRED', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.85, templateRole: 'LABEL' },
      { id: 'bold-masque-rsvp', kind: 'TEXT', x: 60, y: 695, w: 480, h: 24, fill: '#d4af37', text: 'KINDLY RSVP BY 10 OCTOBER', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', letterSpacing: 0.15, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.8, templateRole: 'LABEL' },
    ],
  },
  {
    id: 'bold-evite-vow',
    name: 'Astral Union · Celestial Rose-Gold Vow',
    kind: 'evite',
    conceptCounterpart: 'Modern Vow',
    width: 600,
    height: 800,
    palette: ['#281022', '#ff8ea8', '#ffb066', '#fdf5eb'],
    tagline: 'Monumental liquid rose-gold infinity rings reflecting on a tranquil twilight alpine mirror lake.',
    description: 'Transcends standard wedding invites into a monumental dreamscape: two colossal intertwining rings of molten rose gold hover between mountain peaks and an ethereal dusk lake lined with cascading floral garlands.',
    imageFileName: 'bold_vow_evite_1790724009106.jpg',
    segmentation: {
      environment: {
        description: 'Tranquil alpine lake at twilight, snow-capped mountain backdrop, vibrant magenta and tangerine sunset gradients, glass water reflections.',
        keyElements: ['Sunset reflection lake', 'Garland pavilion', 'Alpine tree horizon', 'Twinkling string lights'],
        lightingPass: 'Warm golden hour sunbeam refracting across the water surface with glowing starlight emissions from the rings.',
      },
      heroSubject: {
        name: 'Monumental Intertwining Rose-Gold Rings',
        description: 'Two colossal interlocking rings of liquid rose-gold and crystal stardust floating gracefully in mid-air.',
        opticsAndTextures: 'Brushed rose gold, internal crystal refractions, water reflections, blooming pink and purple bougainvillea.',
      },
      kineticOverlays: {
        description: 'Gentle golden light glimmering off the water ripples and delicate starlight particles cascading from the rings.',
        particleAndBeams: 'Starlight embers, twilight atmospheric glow, floating blossom petals.',
      },
      typographyAndData: {
        headline: 'Together, Always',
        subtitle: 'THE WEDDING CELEBRATION OF MIRA & ELLIS',
        hierarchy: 'Romantic high-contrast serif with generous tracking and refined modern spacing.',
        admissionFields: ['LAKE TE ANAU, NEW ZEALAND', 'SATURDAY 18 OCTOBER', 'RECEPTION TO FOLLOW'],
      },
    },
    motion: {
      duration: 6400,
      tracks: [
        { objectId: 'ring-float', property: 'y', from: 0, to: -12, delay: 0, duration: 3200, loop: 'alternate' },
        { objectId: 'lake-ripple', property: 'opacity', from: 0.7, to: 1.0, delay: 200, duration: 2200, loop: 'alternate' },
      ],
    },
    audio: {
      notes: [48, 55, 60, 64, 67],
      tempo: 60,
      synthesizerPatch: 'celestial-pad',
    },
    council: {
      lead: 'CLASSICAL (Sacred lifelong vow & timeless romantic dignity)',
      counterpoint: 'RADICAL MINIMAL (Uncluttered editorial restraint allowing the monumental image to breathe)',
      editor: 'EMOTION (Pure cinematic romance and unforgettable wonder)',
      rationale: 'Elevates two simple intersecting SVG circles into a monumental, world-class celebration of love.',
    },
    build: () => [
      { id: 'bold-vow-ground', kind: 'RECT', x: 0, y: 0, w: 600, h: 800, fill: '#1f0d1b', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'GROUND' },
      { id: 'bold-vow-lake-ripple', kind: 'RECT', x: 40, y: 40, w: 520, h: 720, fill: '#2a1125', stroke: '#ff8ea8', strokeWidth: 1.5, rx: 16, rotation: 0, opacity: 0.85, templateRole: 'ORNAMENT' },
      { id: 'bold-vow-title', kind: 'TEXT', x: 60, y: 520, w: 480, h: 60, fill: '#fdf5eb', text: 'Together, Always', fontSize: 38, fontFamily: 'Georgia, serif', textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'HEADLINE' },
      { id: 'bold-vow-subtitle', kind: 'TEXT', x: 60, y: 590, w: 480, h: 28, fill: '#ffb066', text: 'THE CELEBRATION OF MIRA & ELLIS', fontSize: 14, fontFamily: 'Georgia, serif', textAlign: 'center', letterSpacing: 0.12, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.95, templateRole: 'DECK' },
      { id: 'bold-vow-venue', kind: 'TEXT', x: 60, y: 640, w: 480, h: 48, fill: '#eedad2', text: 'SATURDAY 18 OCTOBER · 17:00  /  LAKE TE ANAU, NEW ZEALAND', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.85, templateRole: 'LABEL' },
      { id: 'bold-vow-rsvp', kind: 'TEXT', x: 60, y: 705, w: 480, h: 24, fill: '#ff8ea8', text: 'KINDLY RSVP BY 15 SEPTEMBER', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', letterSpacing: 0.15, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.8, templateRole: 'LABEL' },
    ],
  },
  {
    id: 'bold-evite-dance',
    name: 'Body Electric · Neon Kinetic Movement Gala',
    kind: 'evite',
    conceptCounterpart: 'Body Electric',
    width: 600,
    height: 800,
    palette: ['#0d0c15', '#00ff88', '#ff0077', '#7b2cbf'],
    tagline: 'Dynamic dancer in mid-leap surrounded by explosive ribbons of neon light trails.',
    description: 'Pure kinetic momentum captured on camera: a contemporary dancer executing an impossible mid-air leap, leaving vibrant long-exposure light trails of neon lime, hot magenta, and deep electric violet.',
    imageFileName: 'bold_dance_evite_1790724025859.jpg',
    segmentation: {
      environment: {
        description: 'Dark, scuffed wooden studio dance floor reflecting vibrant light ribbons, theatrical stage rigging, audience silhouettes in background.',
        keyElements: ['Reflective floor marks', 'Theatrical flood lights', 'Dark velvet backdrop'],
        lightingPass: 'Dramatic purple stage spotlights from above with neon light ribbons casting dynamic multi-colored bounce on the dancer.',
      },
      heroSubject: {
        name: 'Dynamic Leap Contemporary Dancer',
        description: 'Solo dancer in athletic cut-out costume frozen in peak elevation with flawless physical tension.',
        opticsAndTextures: 'High-speed shutter sharpness, sheer mesh fabrics, defined musculature, polished wood grain.',
      },
      kineticOverlays: {
        description: 'Long-exposure light painting trails curving through 3D space around the limbs and torso.',
        particleAndBeams: 'Electric lime, cyan, and magenta phosphor ribbons with subtle motion blur glow.',
      },
      typographyAndData: {
        headline: 'BODY ELECTRIC',
        subtitle: 'A NIGHT OF CONTEMPORARY DANCE & KINETIC SOUND',
        hierarchy: 'Bold athletic typography cutting diagonally across the dark stage space.',
        admissionFields: ['THE MOVEMENT PAVILION', 'DOORS: 20:30', 'GENERAL ADMISSION'],
      },
    },
    motion: {
      duration: 2400,
      tracks: [
        { objectId: 'neon-ribbon', property: 'opacity', from: 0.7, to: 1.0, delay: 0, duration: 1200, loop: 'alternate' },
        { objectId: 'dancer-pulse', property: 'y', from: 0, to: -8, delay: 100, duration: 1100, loop: 'alternate' },
      ],
    },
    audio: {
      notes: [43, 50, 55, 62, 67],
      tempo: 126,
      synthesizerPatch: 'analog-lead',
    },
    council: {
      lead: 'REBEL (Electrifying physical momentum & raw club euphoria)',
      counterpoint: 'FUTURIST (Experimental light painting & biometric motion aesthetics)',
      editor: 'PUNCH (Unstoppable energy and instant kinetic pull)',
      rationale: 'Replaces abstract stick figures with breathtaking human athletic artistry and dazzling light trails.',
    },
    build: () => [
      { id: 'bold-dance-ground', kind: 'RECT', x: 0, y: 0, w: 600, h: 800, fill: '#0c0a14', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'GROUND' },
      { id: 'bold-dance-neon-ribbon', kind: 'RECT', x: 35, y: 35, w: 530, h: 730, fill: '#141026', stroke: '#00ff88', strokeWidth: 2, rx: 14, rotation: 0, opacity: 0.9, templateRole: 'ORNAMENT' },
      { id: 'bold-dance-title', kind: 'TEXT', x: 60, y: 530, w: 480, h: 56, fill: '#00ff88', text: 'BODY ELECTRIC', fontSize: 44, fontFamily: 'Arial, sans-serif', fontWeight: 900, textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'HEADLINE' },
      { id: 'bold-dance-subtitle', kind: 'TEXT', x: 60, y: 600, w: 480, h: 28, fill: '#ff0077', text: 'CONTEMPORARY DANCE / KINETIC FREQUENCIES', fontSize: 15, fontFamily: 'Arial, sans-serif', fontWeight: 700, textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.95, templateRole: 'DECK' },
      { id: 'bold-dance-venue', kind: 'TEXT', x: 60, y: 655, w: 480, h: 48, fill: '#e0f4ff', text: 'FRIDAY 14 NOVEMBER · 21:00  /  THE COMPLEX, STUDIO 4', fontSize: 13, fontFamily: 'monospace', textAlign: 'center', fontWeight: 600, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.85, templateRole: 'LABEL' },
      { id: 'bold-dance-rsvp', kind: 'TEXT', x: 60, y: 720, w: 480, h: 24, fill: '#00ff88', text: 'RSVP REQUIRED · OPEN FLOOR', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', letterSpacing: 0.15, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.8, templateRole: 'LABEL' },
    ],
  },
  {
    id: 'bold-evite-supper',
    name: 'The Sensory Banquet · Culinary Alchemy',
    kind: 'evite',
    conceptCounterpart: 'Supper Club',
    width: 600,
    height: 800,
    palette: ['#0f0d11', '#d4af37', '#8b1e2a', '#e8dccb'],
    tagline: 'Michelin-star culinary feast with swirling dry ice smoke, 24k gold leaf & obsidian table.',
    description: 'An invitation into high gastronomy: a polished black mirror obsidian banquet table garnished with pure 24k edible gold flakes, dry ice vapor swirling around iced crimson raspberries, vintage crystal decanters, and tall taper candles.',
    imageFileName: 'bold_supper_evite_1790724069863.jpg',
    segmentation: {
      environment: {
        description: 'Historic stone cellar dining room, rough vaulted masonry arches, glowing candle sconces in deep background.',
        keyElements: ['Vaulted stone masonry', 'Flickering taper candles', 'Mirrored black marble banquet table'],
        lightingPass: 'Warm intimate candlelight with specular reflections on vintage cut-crystal decanters and wine glasses.',
      },
      heroSubject: {
        name: 'The Plated Culinary Masterpiece',
        description: 'Pan-seared duck breast with wild forest chanterelles, rich blackberry reduction, edible gold leaf, and aromatic rosemary smoke.',
        opticsAndTextures: 'Cut-crystal refractions, edible gold leaf flecks, matte stone plate, dry ice mist vapor.',
      },
      kineticOverlays: {
        description: 'Swirling aromatic dry ice mist cascading across the table surface and dancing candle flames.',
        particleAndBeams: 'Cold smoke eddies, warm candle flickers, golden reflections on poured Pinot Noir.',
      },
      typographyAndData: {
        headline: 'The Sensory Banquet',
        subtitle: 'AN INTIMATE NINE-COURSE CULINARY TASTING',
        hierarchy: 'Refined letterspaced Roman capitals with classical editorial poise.',
        admissionFields: ['BY CHEF ALEXANDRE VALOIS', 'ONLY SIXTEEN SEATS', 'OCTOBER 19TH'],
      },
    },
    motion: {
      duration: 4800,
      tracks: [
        { objectId: 'smoke-swirl', property: 'y', from: 0, to: -10, delay: 0, duration: 2400, loop: 'alternate' },
        { objectId: 'candle-flicker', property: 'opacity', from: 0.8, to: 1.0, delay: 200, duration: 1600, loop: 'alternate' },
      ],
    },
    audio: {
      notes: [48, 52, 55, 60, 67],
      tempo: 72,
      synthesizerPatch: 'crystal-bell',
    },
    council: {
      lead: 'BAROQUE (Sensual richness, dark shadows & culinary decadence)',
      counterpoint: 'CLASSICAL (Timeless hospitality & measured menu typography)',
      editor: 'ATMOSPHERE (Immediate sensory appeal: aroma, smoke, candlelight)',
      rationale: 'Replaces generic plate outlines with a mouth-watering, hyper-luxurious dining experience.',
    },
    build: () => [
      { id: 'bold-supper-ground', kind: 'RECT', x: 0, y: 0, w: 600, h: 800, fill: '#0e0b12', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'GROUND' },
      { id: 'bold-supper-card', kind: 'RECT', x: 40, y: 40, w: 520, h: 720, fill: '#1a1420', stroke: '#d4af37', strokeWidth: 1.5, rx: 8, rotation: 0, opacity: 0.85, templateRole: 'ORNAMENT' },
      { id: 'bold-supper-title', kind: 'TEXT', x: 60, y: 530, w: 480, h: 56, fill: '#f6eedb', text: 'The Sensory Banquet', fontSize: 36, fontFamily: 'Georgia, serif', textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'HEADLINE' },
      { id: 'bold-supper-subtitle', kind: 'TEXT', x: 60, y: 595, w: 480, h: 28, fill: '#d4af37', text: 'NINE COURSES · NATIVE WINE PAIRINGS', fontSize: 14, fontFamily: 'Georgia, serif', textAlign: 'center', letterSpacing: 0.12, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.95, templateRole: 'DECK' },
      { id: 'bold-supper-details', kind: 'TEXT', x: 60, y: 650, w: 480, h: 48, fill: '#eedbc2', text: 'THURSDAY 19 OCTOBER · 19:30  /  LA RÉSERVE OBSIDIENNE', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.85, templateRole: 'LABEL' },
      { id: 'bold-supper-rsvp', kind: 'TEXT', x: 60, y: 710, w: 480, h: 24, fill: '#d4af37', text: 'RESERVATIONS STRICTLY LIMITED TO SIXTEEN SEATS', fontSize: 10, fontFamily: 'monospace', textAlign: 'center', letterSpacing: 0.15, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.8, templateRole: 'LABEL' },
    ],
  },
  {
    id: 'bold-evite-garden',
    name: 'Bioluminescent Glasshouse Gala',
    kind: 'evite',
    conceptCounterpart: 'Garden Party',
    width: 600,
    height: 800,
    palette: ['#071616', '#3df5b8', '#ff70a6', '#f2d398'],
    tagline: 'Victorian glass conservatory bursting with glowing orchids and suspended starlight wisteria.',
    description: 'An otherworldly twilight garden soiree: an ornate wrought-iron Victorian glasshouse filled with bioluminescent exotic flora, with glowing wisteria blossoms weeping from ancient trees under a starlit crescent moon.',
    imageFileName: 'bold_garden_evite_1790724096476.jpg',
    segmentation: {
      environment: {
        description: 'Lush nighttime botanical grounds with stone cobblestone pathway lit by warm brass lanterns, wisteria trees weeping liquid light, deep starry night sky with a silver crescent moon.',
        keyElements: ['Victorian iron greenhouse', 'Cobblestone lantern walkway', 'Starry night sky with crescent moon'],
        lightingPass: 'Warm amber lantern light along the ground balancing cool cyan and magenta luminescence from within the glasshouse.',
      },
      heroSubject: {
        name: 'The Bioluminescent Conservatory',
        description: 'Cathedral-scale glasshouse with illuminated arched glass panes showcasing glowing exotic tropical flora.',
        opticsAndTextures: 'Reflective beveled glass panes, wrought-iron filigree, glowing neon petals, dewy foliage.',
      },
      kineticOverlays: {
        description: 'Gently twinkling starlight drops falling from wisteria branches and lantern glow pulses.',
        particleAndBeams: 'Liquid starlight droplets, golden firefly embers, soft moonbeams.',
      },
      typographyAndData: {
        headline: 'Magical Evening Garden Party',
        subtitle: 'AT THE BIOLUMINESCENT GLASSHOUSE · BOTANICAL SANCTUARY',
        hierarchy: 'Graceful botanical flourishes balanced by clear invitation specifics on an easel board.',
        admissionFields: ['SATURDAY, MAY 18TH', 'DOORS: 20:00', 'RSVP PRIVÉ'],
      },
    },
    motion: {
      duration: 5600,
      tracks: [
        { objectId: 'lantern-pulse', property: 'opacity', from: 0.75, to: 1.0, delay: 0, duration: 2800, loop: 'alternate' },
        { objectId: 'starlight-drift', property: 'y', from: 0, to: 12, delay: 300, duration: 3200, loop: 'alternate' },
      ],
    },
    audio: {
      notes: [52, 59, 64, 68, 71],
      tempo: 68,
      synthesizerPatch: 'celestial-pad',
    },
    council: {
      lead: 'WORLD ECLECTIC (Exotic biological wonderland & lush botanical immersion)',
      counterpoint: 'CLASSICAL (Victorian conservatory architecture & formal evening etiquette)',
      editor: 'WONDER (Captivating fairy-tale escapism that excites guests)',
      rationale: 'Replaces simple flat pastel flowers with an enchanting, luminous botanical sanctuary.',
    },
    build: () => [
      { id: 'bold-garden-ground', kind: 'RECT', x: 0, y: 0, w: 600, h: 800, fill: '#081717', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'GROUND' },
      { id: 'bold-garden-card', kind: 'RECT', x: 40, y: 40, w: 520, h: 720, fill: '#102626', stroke: '#3df5b8', strokeWidth: 1.5, rx: 16, rotation: 0, opacity: 0.85, templateRole: 'ORNAMENT' },
      { id: 'bold-garden-title', kind: 'TEXT', x: 60, y: 520, w: 480, h: 64, fill: '#f6eedb', text: 'Magical Evening Garden Party', fontSize: 32, fontFamily: 'Georgia, serif', textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'HEADLINE' },
      { id: 'bold-garden-subtitle', kind: 'TEXT', x: 60, y: 590, w: 480, h: 28, fill: '#3df5b8', text: 'BIOLUMINESCENT GLASSHOUSE · BOTANICAL SANCTUARY', fontSize: 13, fontFamily: 'Georgia, serif', textAlign: 'center', letterSpacing: 0.1, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.95, templateRole: 'DECK' },
      { id: 'bold-garden-details', kind: 'TEXT', x: 60, y: 645, w: 480, h: 48, fill: '#eedbc2', text: 'SATURDAY 18 MAY · 20:00  /  DRESS CODE: BOTANICAL SOIREE', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.85, templateRole: 'LABEL' },
      { id: 'bold-garden-rsvp', kind: 'TEXT', x: 60, y: 705, w: 480, h: 24, fill: '#3df5b8', text: 'KINDLY RSVP BY 1 MAY', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', letterSpacing: 0.15, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.8, templateRole: 'LABEL' },
    ],
  },
  {
    id: 'bold-evite-observatory',
    name: 'Night Observatory Celestial Gala',
    kind: 'evite',
    conceptCounterpart: 'Night Observatory',
    width: 600,
    height: 800,
    palette: ['#080a14', '#e5b869', '#38d9d8', '#8b78cf'],
    tagline: 'Colossal brass telescope inside an open dome aiming into an intense swirling iridescent galaxy.',
    description: 'A monument to cosmic discovery: guests in black tie gather inside a grand wooden and stone observatory dome where a colossal Victorian brass telescope peers directly into a swirling purple and cyan galaxy, with a glowing armillary sphere.',
    imageFileName: 'bold_observatory_evite_1790724105534.jpg',
    segmentation: {
      environment: {
        description: 'Vast wooden-ribbed astronomical dome with open observation shutter framing a giant swirling spiral galaxy.',
        keyElements: ['Open observatory dome', 'Swirling spiral galaxy', 'Gilded armillary sphere', 'Dressed evening guests'],
        lightingPass: 'Cyan and violet galactic starlight pouring in from the open dome balanced by warm brass sconces.',
      },
      heroSubject: {
        name: 'The Master Astronomical Refractor',
        description: 'Colossal polished brass refractor telescope with precision glass lenses, gear counterweights, and riveted casing.',
        opticsAndTextures: 'Reflective burnished brass, optical glass coatings, dark oak flooring, glowing celestial charts.',
      },
      kineticOverlays: {
        description: 'Slow rotation of the gilded armillary rings and soft spiral swirl of the central galactic core.',
        particleAndBeams: 'Starlight dust motes, telescope ocular glow, constellation lines.',
      },
      typographyAndData: {
        headline: 'Night Observatory Celestial Gala',
        subtitle: 'AN EVENING OF STARGAZING & DEEP COSMIC CONVERSATION',
        hierarchy: 'Precise navigational cartographic typography paired with classical elegance.',
        admissionFields: ['MOUNT WILSON OBSERVATORY', 'EQUINOX GATHERING', 'RSVP CELESTIAL'],
      },
    },
    motion: {
      duration: 6200,
      tracks: [
        { objectId: 'galaxy-pulse', property: 'opacity', from: 0.7, to: 1.0, delay: 0, duration: 3100, loop: 'alternate' },
        { objectId: 'armillary-turn', property: 'rotation', from: 0, to: 360, delay: 0, duration: 36000, loop: 'restart' },
      ],
    },
    audio: {
      notes: [48, 55, 60, 67, 72],
      tempo: 66,
      synthesizerPatch: 'celestial-pad',
    },
    council: {
      lead: 'FUTURIST (Astronomical exploration & stellar mechanics)',
      counterpoint: 'WORLD ECLECTIC (Classical navigation instruments & historic domes)',
      editor: 'ELEVATION (Transcendent scale that makes attendance unforgettable)',
      rationale: 'Replaces simple abstract constellation lines with a breathtaking peek into the infinite cosmos.',
    },
    build: () => [
      { id: 'bold-obs-ground', kind: 'RECT', x: 0, y: 0, w: 600, h: 800, fill: '#070912', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'GROUND' },
      { id: 'bold-obs-card', kind: 'RECT', x: 40, y: 40, w: 520, h: 720, fill: '#101428', stroke: '#e5b869', strokeWidth: 1.5, rx: 14, rotation: 0, opacity: 0.85, templateRole: 'ORNAMENT' },
      { id: 'bold-obs-title', kind: 'TEXT', x: 60, y: 520, w: 480, h: 60, fill: '#f6eedb', text: 'Night Observatory Gala', fontSize: 36, fontFamily: 'Georgia, serif', textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'HEADLINE' },
      { id: 'bold-obs-subtitle', kind: 'TEXT', x: 60, y: 590, w: 480, h: 28, fill: '#e5b869', text: 'STARGAZING & CELESTIAL MUSIC · SECTOR EQUINOX', fontSize: 13, fontFamily: 'Georgia, serif', textAlign: 'center', letterSpacing: 0.1, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.95, templateRole: 'DECK' },
      { id: 'bold-obs-details', kind: 'TEXT', x: 60, y: 645, w: 480, h: 48, fill: '#d1ddf4', text: 'FRIDAY 21 NOVEMBER · 20:00  /  MOUNT WILSON OBSERVATORY', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.85, templateRole: 'LABEL' },
      { id: 'bold-obs-rsvp', kind: 'TEXT', x: 60, y: 705, w: 480, h: 24, fill: '#e5b869', text: 'KINDLY RSVP BEFORE THE FULL MOON', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', letterSpacing: 0.15, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.8, templateRole: 'LABEL' },
    ],
  },
  {
    id: 'bold-promo-chrome',
    name: 'Kosmic Flux · Voidstar Release Campaign',
    kind: 'promo',
    conceptCounterpart: 'Chrome Current',
    width: 600,
    height: 1067,
    palette: ['#050814', '#00f0ff', '#ff7700', '#e0eaff'],
    tagline: 'Colossal liquid mirror chrome typography erupting from a reflective mercury sea at sunset.',
    description: 'The pinnacle of high-gloss futuristic music promotion: hyper-reflective molten chrome lettering rises from undulating mercury sea waves beneath an electric cobalt and burning amber sunset sky with cybernetic wireframe grids.',
    imageFileName: 'bold_chrome_promo_1790724039566.jpg',
    segmentation: {
      environment: {
        description: 'Infinite mercury ocean reflecting blazing orange sunset rays, cybernetic grid lines projecting into deep space, starry stratosphere.',
        keyElements: ['Mercury ocean waves', 'Burning sunset horizon', 'Perspective cybernetic grid', 'Satellite constellation'],
        lightingPass: 'Blazing sunset rim light casting fiery amber highlights on the top surfaces of the mirror-chrome forms, with cold cobalt ocean reflections underneath.',
      },
      heroSubject: {
        name: 'Molten Chrome 3D Calligraphy',
        description: 'Sculptural liquid metal lettering with fluid droplets splashing into the ocean in zero-friction suspension.',
        opticsAndTextures: 'Perfect mirror reflection, fluid surface tension, caustic splashes, chromatic dispersion.',
      },
      kineticOverlays: {
        description: 'Pulsing cybernetic perspective wireframe grid and undulating liquid mercury wave crests.',
        particleAndBeams: 'Liquid mercury droplets, electric cyan neon glow pulses, stellar sparkles.',
      },
      typographyAndData: {
        headline: 'KOSMIC FLUX · VOIDSTAR',
        subtitle: 'THE NEW ALBUM · OUT NOW ON PLAJAH CHORA',
        hierarchy: 'High-tech cybernetic display typography with streaming platform badges and release date stamps.',
        admissionFields: ['STREAM / BUY', 'CHORA EXCLUSIVE', 'NOV 15 | 2026'],
      },
    },
    motion: {
      duration: 3600,
      tracks: [
        { objectId: 'grid-pulse', property: 'opacity', from: 0.6, to: 1.0, delay: 0, duration: 1800, loop: 'alternate' },
        { objectId: 'chrome-float', property: 'y', from: 0, to: -14, delay: 200, duration: 1600, loop: 'alternate' },
      ],
    },
    audio: {
      notes: [36, 48, 55, 60, 67, 72],
      tempo: 128,
      synthesizerPatch: 'sub-bass',
    },
    council: {
      lead: 'FUTURIST (Liquid metal fluidity & speculative cybernetic worlds)',
      counterpoint: 'BAROQUE (Monumental scale & opulent sunset reflection physics)',
      editor: 'CONVERSION CLARITY (Streamlined multi-platform streaming call-to-action)',
      rationale: 'Takes the flat chrome gradient idea and explodes it into a breathtaking, photoreal 3D liquid metal spectacle.',
    },
    build: () => [
      { id: 'bold-chrome-ground', kind: 'RECT', x: 0, y: 0, w: 600, h: 1067, fill: '#050a16', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'GROUND' },
      { id: 'bold-chrome-grid-pulse', kind: 'RECT', x: 30, y: 30, w: 540, h: 1007, fill: '#0a1428', stroke: '#00f0ff', strokeWidth: 2, rx: 12, rotation: 0, opacity: 0.9, templateRole: 'ORNAMENT' },
      { id: 'bold-chrome-edition', kind: 'TEXT', x: 60, y: 80, w: 480, h: 32, fill: '#e0f4ff', text: 'THE NEW ALBUM', fontSize: 16, fontFamily: 'Arial, sans-serif', fontWeight: 800, letterSpacing: 0.2, textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.95, templateRole: 'LABEL' },
      { id: 'bold-chrome-title', kind: 'TEXT', x: 60, y: 440, w: 480, h: 72, fill: '#ffffff', text: 'KOSMIC FLUX', fontSize: 50, fontFamily: 'Arial, sans-serif', fontWeight: 900, textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'HEADLINE' },
      { id: 'bold-chrome-album', kind: 'TEXT', x: 60, y: 760, w: 480, h: 48, fill: '#00f0ff', text: 'VOIDSTAR', fontSize: 38, fontFamily: 'Arial, sans-serif', fontWeight: 900, letterSpacing: 0.15, textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, templateRole: 'DECK' },
      { id: 'bold-chrome-cta', kind: 'TEXT', x: 60, y: 830, w: 480, h: 28, fill: '#ffffff', text: 'OUT NOW | STREAM / BUY', fontSize: 16, fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 0.1, textAlign: 'center', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.9, templateRole: 'LABEL' },
      { id: 'bold-chrome-date', kind: 'TEXT', x: 60, y: 920, w: 480, h: 32, fill: '#ff7700', text: 'AVAILABLE ON PLAJAH CHORA · ALL FORMATS', fontSize: 13, fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.95, templateRole: 'LABEL' },
    ],
  },
];
