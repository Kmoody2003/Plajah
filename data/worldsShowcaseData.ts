import type { IPWorld } from '../types';

export type Universe3DCoverId =
  | 'STARGATE_ODYSSEY'
  | 'KINGDOM_CHRONICLES'
  | 'AETHER_ARCHIPELAGO';

export type WorldEntryCategory =
  | 'characters'
  | 'locations'
  | 'factions'
  | 'lore'
  | 'rules';

export interface WorldEntry {
  id: string;
  category: WorldEntryCategory;
  name: string;
  description: string;
  tags: string[];
  imageUrl?: string;
  relationships: { targetId: string; label: string }[];
  appearances: {
    app: 'FABULA' | 'LOREA_BOOK' | 'LOREA_SCRIPT' | 'CHORA' | 'TALEO';
    projectId: string;
    projectTitle: string;
    context: string;
    timestamp: number;
  }[];
  createdAt: number;
  updatedAt: number;
}

export interface Universe3DNode {
  id: string;
  name: string;
  subtitle: string;
  regionType: string;
  factionOrRuler: string;
  synopsis: string;
  canonStatus: 'Canon Locked' | 'Active Frontier' | 'Uncharted Anomaly';
  storyIntelScore: number;
  linkedStudios: ('FABULA' | 'LOREA_BOOK' | 'LOREA_SCRIPT' | 'CHORA' | 'TALEO')[];
  primaryColor: string;
  secondaryColor: string;
  orbitRadius?: number;
  orbitSpeed?: number;
  orbitPhase?: number;
  planetSize?: number;
  hasRings?: boolean;
  isStargateAnchor?: boolean;
  mapPosition?: [number, number, number];
  /** Normalized [u, v] coordinate (0..1 left-to-right, top-to-bottom) on the Council-generated 16:9 Master Plate */
  plateUV?: [number, number];
  citadelScale?: number;
  islandAltitude?: number;
  stats: {
    characters: number;
    locations: number;
    loreEntries: number;
  };
}

export interface Universe3DCoverPreset {
  id: Universe3DCoverId;
  badge: string;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  cameraHint: string;
  masterPlateUrl: string;
  vfxBackdropUrl: string;
  blenderGlbUrl: string;
  councilLeadSummary: string;
  engineSpecs: string[];
  accentHex: string;
  secondaryHex: string;
  nodes: Universe3DNode[];
}

export interface ShowcaseWorld extends IPWorld {
  isShowcase: true;
  tagline: string;
  genre: string;
  coverImageUrl: string;
  defaultCoverPreset: Universe3DCoverId;
  storyIntelScore: number;
  canonHealth: number;
  activeCreators: number;
  totalAssets: number;
  entries: WorldEntry[];
  sources: {
    app: 'FABULA' | 'LOREA_BOOK' | 'LOREA_SCRIPT' | 'CHORA' | 'TALEO';
    projectId: string;
    projectTitle: string;
    publishedAt: number;
    entryCount: number;
  }[];
  featuredCharacters: {
    id: string;
    name: string;
    role: string;
    avatarUrl: string;
    faction: string;
  }[];
  activeStudios: {
    app: 'FABULA' | 'LOREA_BOOK' | 'LOREA_SCRIPT' | 'CHORA' | 'TALEO';
    label: string;
    projectTitle: string;
    status: string;
  }[];
}

export const UNIVERSE_3D_COVER_PRESETS: Record<Universe3DCoverId, Universe3DCoverPreset> = {
  STARGATE_ODYSSEY: {
    id: 'STARGATE_ODYSSEY',
    badge: 'HOLLYWOOD VFX + BLENDER 5.0.1 + GAME COUNCIL · DEEP NEBULA & STARGATE',
    name: 'Aethelgard: Dyson Stargate & Carina-Helios Nebula',
    shortName: 'Stargate & Deep Nebula',
    tagline: 'Pilot the Aethel-VII Star-Skiff through the active quantum Stargate into an expansive multi-octave Carina-Helios emission nebula and solar system.',
    description:
      'Built from the ground up with Headless Blender 5.0.1 (stargate_odyssey.glb), a 6-octave Volumetric Domain-Warped Nebula Shader, ACES Filmic UnrealBloomPass post-processing, and the Hollywood VFX Deep Nebula Backdrop Plate.',
    cameraHint: 'Click any 3D Planet/Stargate Beacon to fly camera & inspect World Canon • Drag to orbit 360° • Switch Council Render Lens',
    masterPlateUrl: '/worlds/council_world_stargate.jpg',
    vfxBackdropUrl: '/worlds/vfx_nebula_stargate.jpg',
    blenderGlbUrl: '/worlds/models/stargate_odyssey.glb',
    councilLeadSummary: 'Lead: Søren Lindqvist (Real-Time 3D & Shader Guru) & Elena Vance-Moreau (Gameplay Virtuoso) · Headless Blender 5.0.1 + VFX Pipeline',
    engineSpecs: [
      'Blender 5.0.1 Sculpted .GLB Megastructure & Planets',
      '6-Octave Volumetric Nebula & Kawoosh Vortex GLSL',
      'ACES Filmic Tone Mapping + Real-Time HDR Bloom',
      'Live Plajah World Hub & Story Intel Canon Binding',
    ],
    accentHex: '#22d3ee',
    secondaryHex: '#f59e0b',
    nodes: [
      {
        id: 'node-stargate-prime',
        name: 'Aethelgard Orbital Stargate',
        subtitle: 'Sector 00 • Intergalactic Einstein-Rosen Bridge',
        regionType: 'Precursor Megastructure Ring',
        factionOrRuler: 'The Astral Navigators Guild',
        synopsis:
          'A 14-kilometer precursor titanium-and-gold ring anchored at the system Lagrange point. Nine articulated chevrons lock onto quantum signatures extracted by Story Intelligence to bridge distant galaxies.',
        canonStatus: 'Canon Locked',
        storyIntelScore: 99,
        linkedStudios: ['FABULA', 'LOREA_SCRIPT', 'CHORA'],
        primaryColor: '#22d3ee',
        secondaryColor: '#38bdf8',
        isStargateAnchor: true,
        plateUV: [0.375, 0.50],
        mapPosition: [-2.0, 0.0, 1.25],
        orbitRadius: 0,
        orbitSpeed: 0,
        orbitPhase: 0,
        planetSize: 3.2,
        stats: { characters: 14, locations: 6, loreEntries: 42 },
      },
      {
        id: 'node-helios-prime',
        name: 'Helios-IX (The Dyson Star & Forge)',
        subtitle: 'Inner Corona • Stellar Energy Matrix',
        regionType: 'Dyson Hearth & Inner Forge Moon',
        factionOrRuler: 'Solaris Directorate',
        synopsis:
          'Blazing golden coronal star and its tidally locked inner forge moon powering the Stargate’s 38-minute wormhole capacitor banks.',
        canonStatus: 'Canon Locked',
        storyIntelScore: 96,
        linkedStudios: ['FABULA', 'LOREA_BOOK', 'TALEO'],
        primaryColor: '#fbbf24',
        secondaryColor: '#f97316',
        plateUV: [0.668, 0.345],
        mapPosition: [2.69, 1.40, 0.95],
        orbitRadius: 19,
        orbitSpeed: 0.34,
        orbitPhase: 0.4,
        planetSize: 2.35,
        stats: { characters: 19, locations: 14, loreEntries: 68 },
      },
      {
        id: 'node-calypso-haven',
        name: 'Nereid-IV & The Cassini Rings',
        subtitle: 'Habitable Band • Ringed Sapphire Ocean World',
        regionType: 'Ringed Ocean Super-Planet',
        factionOrRuler: 'The Thalassian Senate',
        synopsis:
          'Encircled by luminous ice-and-shipyard rings, Nereid-IV is the diplomatic capital of the coalition where coral space-elevators rise from sapphire seas.',
        canonStatus: 'Canon Locked',
        storyIntelScore: 98,
        linkedStudios: ['FABULA', 'LOREA_BOOK', 'LOREA_SCRIPT', 'CHORA', 'TALEO'],
        primaryColor: '#38bdf8',
        secondaryColor: '#22d3ee',
        plateUV: [0.722, 0.535],
        mapPosition: [3.55, -0.32, 1.15],
        orbitRadius: 30,
        orbitSpeed: 0.22,
        orbitPhase: 2.1,
        planetSize: 2.85,
        hasRings: true,
        stats: { characters: 28, locations: 22, loreEntries: 94 },
      },
      {
        id: 'node-valkyrie-giant',
        name: 'Pyros-VII (Obsidian Magma World)',
        subtitle: 'Outer Rift • Tectonic Foundry Planet',
        regionType: 'Volcanic Magma Planet',
        factionOrRuler: 'House Vane Void-Armada',
        synopsis:
          'A fractured obsidian world interlaced with rivers of glowing planetary magma where orbital dreadnoughts are forged in zero-gravity drydocks.',
        canonStatus: 'Active Frontier',
        storyIntelScore: 94,
        linkedStudios: ['LOREA_SCRIPT', 'CHORA', 'TALEO'],
        primaryColor: '#f97316',
        secondaryColor: '#ef4444',
        plateUV: [0.872, 0.630],
        mapPosition: [5.95, -1.17, 1.05],
        orbitRadius: 44,
        orbitSpeed: 0.14,
        orbitPhase: 4.0,
        planetSize: 3.9,
        stats: { characters: 16, locations: 18, loreEntries: 57 },
      },
      {
        id: 'node-terminus-station',
        name: 'Krios-Omega Crystalline Vault',
        subtitle: 'Deep Rim • Frozen Precursor Archive',
        regionType: 'Crystalline Ice World',
        factionOrRuler: 'The Remnant Archivists',
        synopsis:
          'Orbiting on the outer golden astrolabe track, Krios-Omega conceals a subterranean crystal vault storing the genetic and narrative memory of twelve extinct civilizations.',
        canonStatus: 'Uncharted Anomaly',
        storyIntelScore: 92,
        linkedStudios: ['FABULA', 'LOREA_BOOK'],
        primaryColor: '#a5f3fc',
        secondaryColor: '#818cf8',
        plateUV: [0.910, 0.298],
        mapPosition: [6.56, 1.82, 0.85],
        orbitRadius: 57,
        orbitSpeed: 0.09,
        orbitPhase: 5.3,
        planetSize: 2.2,
        stats: { characters: 9, locations: 11, loreEntries: 49 },
      },
    ],
  },

  KINGDOM_CHRONICLES: {
    id: 'KINGDOM_CHRONICLES',
    badge: 'HOLLYWOOD VFX + BLENDER 5.0.1 + GAME COUNCIL · CLOCKWORK REALM MAP',
    name: 'Crown of Ember & Iron: Clockwork Realm Map',
    shortName: 'Clockwork Kingdom Map',
    tagline: 'March the Crown’s Clockwork Envoy across a Blender-sculpted 3D relief continent where toothed brass gears turn and lava rivers glow.',
    description:
      'Built from the ground up with Headless Blender 5.0.1 (kingdom_chronicles.glb), Cathedral Volumetric God-Ray Shaders, and the Hollywood VFX War-Chamber Backdrop Plate.',
    cameraHint: 'Click any 3D Kingdom Citadel to fly camera & inspect World Canon • Drag to tilt & orbit the war-table',
    masterPlateUrl: '/worlds/council_world_kingdoms.jpg',
    vfxBackdropUrl: '/worlds/vfx_backdrop_kingdoms.jpg',
    blenderGlbUrl: '/worlds/models/kingdom_chronicles.glb',
    councilLeadSummary: 'Lead: Elena Vance-Moreau (Gameplay Virtuoso) & Kenji "Raster" Vance (Silicon Pioneer) · Headless Blender 5.0.1 + VFX Pipeline',
    engineSpecs: [
      'Blender 5.0.1 Sculpted .GLB Continent & Gothic Keep',
      'Counter-Rotating Toothed Brass Clockwork Gears',
      'Cathedral Volumetric God-Ray & Candle Point-Lights',
      'Live Plajah World Hub & Story Intel Canon Binding',
    ],
    accentHex: '#f59e0b',
    secondaryHex: '#ef4444',
    nodes: [
      {
        id: 'kingdom-solaris-crown',
        name: 'The Sun-Crown Capital of Valoria',
        subtitle: 'Heartland Clockwork Pit • Seat of the High Sovereign',
        regionType: 'Imperial Clockwork Citadel',
        factionOrRuler: 'House Aurelius (The Golden Stag)',
        synopsis:
          'Rising from the center of interlocking golden clockwork gears and rotating brass astrolabe rings, Valoria governs the Seven Treaties of the Realm.',
        canonStatus: 'Canon Locked',
        storyIntelScore: 99,
        linkedStudios: ['FABULA', 'LOREA_BOOK', 'LOREA_SCRIPT', 'CHORA', 'TALEO'],
        primaryColor: '#f59e0b',
        secondaryColor: '#fde68a',
        plateUV: [0.500, 0.475],
        mapPosition: [0.0, 0.22, 1.35],
        citadelScale: 1.35,
        stats: { characters: 34, locations: 19, loreEntries: 112 },
      },
      {
        id: 'kingdom-ironhearth',
        name: 'Khazad-Vorn (Cinder-Peak Caldera)',
        subtitle: 'Northwest Obsidian Peaks • Volcanic Forge Kingdom',
        regionType: 'Volcanic Stronghold & Magma Foundry',
        factionOrRuler: 'The Obsidian Guild-Lords',
        synopsis:
          'Jagged black basalt peaks split by rivers of glowing molten gold magma that power the subterranean rune-forges of the northern legions.',
        canonStatus: 'Canon Locked',
        storyIntelScore: 97,
        linkedStudios: ['FABULA', 'LOREA_BOOK', 'TALEO'],
        primaryColor: '#ef4444',
        secondaryColor: '#f97316',
        plateUV: [0.235, 0.220],
        mapPosition: [-4.24, 2.52, 1.65],
        citadelScale: 1.2,
        stats: { characters: 21, locations: 15, loreEntries: 78 },
      },
      {
        id: 'kingdom-kraken-reach',
        name: 'Pyke-Haven & The Sapphire Harbor',
        subtitle: 'Southern Coast • Ivory Port & Brass Armada',
        regionType: 'Coastal Sea-Bastion & Harbor',
        factionOrRuler: 'The Iron-Tide Admirals',
        synopsis:
          'Sunlit carved stone docks sheltering miniature brass-and-timber galleons on luminous turquoise seas, connected directly to the capital by the Southern Gold Road.',
        canonStatus: 'Active Frontier',
        storyIntelScore: 94,
        linkedStudios: ['LOREA_SCRIPT', 'CHORA', 'TALEO'],
        primaryColor: '#38bdf8',
        secondaryColor: '#fbbf24',
        plateUV: [0.355, 0.775],
        mapPosition: [-2.32, -2.47, 0.75],
        citadelScale: 1.1,
        stats: { characters: 15, locations: 12, loreEntries: 54 },
      },
      {
        id: 'kingdom-ashen-wall',
        name: 'Solstice Cathedral Keep',
        subtitle: 'Northeast Highlands • Twin-Domed Mountain Bastion',
        regionType: 'Highland Stone Citadel',
        factionOrRuler: 'The Sworn Wardens of the Pale',
        synopsis:
          'Crowned with emerald-patina copper domes atop sheer carved cliffs, guarding the northern viaduct and ancient royal archives.',
        canonStatus: 'Canon Locked',
        storyIntelScore: 95,
        linkedStudios: ['FABULA', 'LOREA_SCRIPT'],
        primaryColor: '#eab308',
        secondaryColor: '#a7f3d0',
        plateUV: [0.710, 0.135],
        mapPosition: [3.36, 3.28, 1.30],
        citadelScale: 1.15,
        stats: { characters: 12, locations: 9, loreEntries: 63 },
      },
      {
        id: 'kingdom-sylvan-spire',
        name: 'Loth-Aethel (The Heartwood Sanctum)',
        subtitle: 'Eastern Wilds • Ancient World-Tree Ring',
        regionType: 'Gilded Forest Sanctuary',
        factionOrRuler: 'The Concord of Starlight',
        synopsis:
          'A colossal ancient emerald Heartwood Tree encircled by golden elven battlements and emerald moats, where immortal cartographers keep the living chronicle.',
        canonStatus: 'Canon Locked',
        storyIntelScore: 96,
        linkedStudios: ['FABULA', 'LOREA_BOOK', 'CHORA'],
        primaryColor: '#10b981',
        secondaryColor: '#fde047',
        plateUV: [0.875, 0.445],
        mapPosition: [6.00, 0.50, 1.45],
        citadelScale: 1.18,
        stats: { characters: 18, locations: 16, loreEntries: 86 },
      },
    ],
  },

  AETHER_ARCHIPELAGO: {
    id: 'AETHER_ARCHIPELAGO',
    badge: 'HOLLYWOOD VFX + BLENDER 5.0.1 + GAME COUNCIL · JRPG SKY OVERWORLD',
    name: 'Sora-No-Kiseki: Bioluminescent Sky Archipelago',
    shortName: 'Sky-Island Archipelago',
    tagline: 'Fly the Sora-Maru Sky-Skiff across glowing Ley-Line light bridges to the Blender-sculpted Crystal World-Tree.',
    description:
      'Built from the ground up with Headless Blender 5.0.1 (aether_archipelago.glb), Satsuei Aurora Borealis & Waterfall Shaders, and the Hollywood VFX Sky-Sea Backdrop Plate.',
    cameraHint: 'Click any 3D Floating Sky-Island to fly camera & inspect World Canon • Toggle Satsuei & HD-2D Lenses',
    masterPlateUrl: '/worlds/council_world_archipelago.jpg',
    vfxBackdropUrl: '/worlds/vfx_skysea_archipelago.jpg',
    blenderGlbUrl: '/worlds/models/aether_archipelago.glb',
    councilLeadSummary: 'Lead: Takumi Sato (Japanese Game Auteur) & Søren Lindqvist (Real-Time 3D Guru) · Headless Blender 5.0.1 + VFX Pipeline',
    engineSpecs: [
      'Blender 5.0.1 Sculpted .GLB Sky-Islands & World-Tree',
      'Satsuei Aurora Borealis & Waterfall Flow Shaders',
      '3 Rotating Golden Astronomical Orrery Rings',
      'Live Plajah World Hub & Story Intel Canon Binding',
    ],
    accentHex: '#2dd4bf',
    secondaryHex: '#c084fc',
    nodes: [
      {
        id: 'sky-axis-mundi',
        name: 'The World-Spire & Crystal Tree (Axis Mundi)',
        subtitle: 'Central Zenith • Heart of the Canon Loom',
        regionType: 'Bioluminescent Crystal World-Tree & Orrery',
        factionOrRuler: 'The Council of First Light',
        synopsis:
          'Crowned by a colossal glowing turquoise crystal canopy and golden astronomical rings, the central sanctuary island channels narrative memory across every Ley-Line bridge in the sky.',
        canonStatus: 'Canon Locked',
        storyIntelScore: 100,
        linkedStudios: ['FABULA', 'LOREA_BOOK', 'LOREA_SCRIPT', 'CHORA', 'TALEO'],
        primaryColor: '#2dd4bf',
        secondaryColor: '#fbbf24',
        plateUV: [0.525, 0.415],
        mapPosition: [0.40, 0.76, 1.45],
        islandAltitude: 6,
        citadelScale: 1.5,
        stats: { characters: 32, locations: 24, loreEntries: 128 },
      },
      {
        id: 'sky-obsidian-reliquary',
        name: 'The Wayfarer’s Crystal Overlook',
        subtitle: 'Southwest Foreground Cliff • Explorer’s Threshold',
        regionType: 'mossy Sky-Promontory & Crystal Shrine',
        factionOrRuler: 'The Horizon Pathfinders',
        synopsis:
          'The moss-clad cliffside promontory where travelers first gaze out across the golden cloud maelstrom toward the World-Tree before boarding their sky-skiff.',
        canonStatus: 'Canon Locked',
        storyIntelScore: 95,
        linkedStudios: ['FABULA', 'LOREA_BOOK', 'TALEO'],
        primaryColor: '#34d399',
        secondaryColor: '#22d3ee',
        plateUV: [0.165, 0.695],
        mapPosition: [-5.36, -1.75, 1.55],
        islandAltitude: 4.5,
        citadelScale: 1.1,
        stats: { characters: 14, locations: 13, loreEntries: 59 },
      },
      {
        id: 'sky-echo-conservatory',
        name: 'Zephyr Ley-Bridge Colonnade',
        subtitle: 'West Span • Ancient Stone Archway Isle',
        regionType: 'Resonant Ley-Bridge Sanctum',
        factionOrRuler: 'The Symphonic Weavers',
        synopsis:
          'An ancient colonnade island anchoring the western ribbon of cyan-and-gold Ley-Line light that hums in harmony with the wind.',
        canonStatus: 'Canon Locked',
        storyIntelScore: 96,
        linkedStudios: ['CHORA', 'LOREA_SCRIPT', 'TALEO'],
        primaryColor: '#38bdf8',
        secondaryColor: '#fde047',
        plateUV: [0.238, 0.595],
        mapPosition: [-4.19, -0.85, 1.05],
        islandAltitude: 8.0,
        citadelScale: 1.15,
        stats: { characters: 15, locations: 11, loreEntries: 62 },
      },
      {
        id: 'sky-solstice-sanctum',
        name: 'Cloud-Shrine Pavilion & Sky-Fleet',
        subtitle: 'Northwest Drift • Twin Waterfalls & Wind-Ships',
        regionType: 'Floating Temple & Sky-Harbor',
        factionOrRuler: 'Order of the Dawn Chorus',
        synopsis:
          'High-altitude sanctuary pavilion where silver waterfalls cascade into the clouds and winged wind-ships set sail beneath the emerald aurora.',
        canonStatus: 'Canon Locked',
        storyIntelScore: 97,
        linkedStudios: ['FABULA', 'LOREA_BOOK', 'CHORA'],
        primaryColor: '#c084fc',
        secondaryColor: '#60a5fa',
        plateUV: [0.160, 0.435],
        mapPosition: [-5.44, 0.58, 0.85],
        islandAltitude: 9.5,
        citadelScale: 1.15,
        stats: { characters: 19, locations: 14, loreEntries: 74 },
      },
      {
        id: 'sky-astral-harbor',
        name: 'Aether-Gate Waterfall Sanctum',
        subtitle: 'Eastern Cliff • Luminous Portal Arch & Twin Falls',
        regionType: 'Floating Portal Citadel',
        factionOrRuler: 'The Horizon Cartel',
        synopsis:
          'Joined to the central spire by the eastern Ley-Line bridge, this cliffside temple houses an active cyan Aether-Gate above twin thundering waterfalls.',
        canonStatus: 'Active Frontier',
        storyIntelScore: 95,
        linkedStudios: ['FABULA', 'LOREA_SCRIPT', 'TALEO'],
        primaryColor: '#22d3ee',
        secondaryColor: '#fbbf24',
        plateUV: [0.900, 0.555],
        mapPosition: [6.40, -0.50, 1.25],
        islandAltitude: 5.5,
        citadelScale: 1.15,
        stats: { characters: 22, locations: 17, loreEntries: 81 },
      },
    ],
  },
};

const NOW = Date.now();

const createEntry = (
  id: string,
  category: WorldEntryCategory,
  name: string,
  description: string,
  tags: string[],
  imageUrl?: string
): WorldEntry => ({
  id,
  category,
  name,
  description,
  tags,
  imageUrl,
  relationships: [],
  appearances: [
    {
      app: 'FABULA',
      projectId: 'proj-flagship-1',
      projectTitle: 'Main Canon Bible',
      context: 'Primary World Pillar',
      timestamp: NOW - 86400000 * 3,
    },
    {
      app: 'LOREA_BOOK',
      projectId: 'proj-flagship-2',
      projectTitle: 'Book I: The First Gate',
      context: 'Act I Key Sequence',
      timestamp: NOW - 3600000 * 12,
    },
  ],
  createdAt: NOW - 86400000 * 14,
  updatedAt: NOW - 3600000 * 2,
});

const BASE_WORLD_FIELDS = {
  creatorId: 'plajah-flagship',
  worldType: 'FICTION' as const,
  status: 'PUBLISHED' as const,
  timelineConfig: { startYear: 0, endYear: 3000, unitName: 'Solar Era' },
  themeConfig: { primaryColor: '#22d3ee', secondaryColor: '#f59e0b', backgroundId: 'default' },
  assetIds: [],
  characterIds: [],
  loreIds: [],
  timelineIds: [],
  storyListIds: [],
  moduleIds: [],
  associatedClubIds: [],
  graphConnections: [],
};

export const SHOWCASE_WORLDS: ShowcaseWorld[] = [
  {
    ...BASE_WORLD_FIELDS,
    id: 'showcase-helios-odyssey',
    name: 'Helios-IX: The Stargate Odyssey',
    tagline: 'Nine Precursor Stargates. Five Colonized Worlds. One Fractured Solar Coalition.',
    genre: 'Hard Sci-Fi & Interstellar Space Opera',
    description:
      'When the Aethelgard Orbital Stargate re-ignited after four millennia of silence, five planetary factions raced to claim its quantum network. Every planet, orbital ring, and fleet movement is tracked in real time across Fabula, Lorea, Chora, and Cinema.',
    coverImage: '/worlds/council_world_stargate.jpg',
    coverImageUrl: '/worlds/council_world_stargate.jpg',
    defaultCoverPreset: 'STARGATE_ODYSSEY',
    isShowcase: true,
    storyIntelScore: 99,
    canonHealth: 98,
    activeCreators: 14,
    totalAssets: 312,
    featuredCharacters: [
      {
        id: 'char-vance',
        name: 'Commander Kaelen Vance',
        role: 'Stargate Pathfinder',
        avatarUrl: '/src/assets/images/scifi_character_1777698077214.png',
        faction: 'Astral Navigators Guild',
      },
      {
        id: 'char-elara',
        name: 'Arch-Savant Elara',
        role: 'Quantum Telemetry Architect',
        avatarUrl: '/src/assets/images/sage_elara_char_1777698135254.png',
        faction: 'Solaris Directorate',
      },
    ],
    activeStudios: [
      { app: 'FABULA', label: 'Fabula Story Engine', projectTitle: 'Season 1 Show Bible & System Map', status: 'Synced' },
      { app: 'LOREA_SCRIPT', label: 'Lorea Screenplay', projectTitle: 'Ep 101: Chevron Nine', status: 'Act III Lock' },
      { app: 'CHORA', label: 'Chora Audio Score', projectTitle: 'Event Horizon Orchestral Suite', status: '24 Stems' },
      { app: 'TALEO', label: 'Cinema Graphic Novel', projectTitle: 'The Cassini Ring Drift #1', status: '48 Panels' },
    ],
    entries: [
      createEntry(
        'e-sg-1',
        'locations',
        'Aethelgard Orbital Stargate',
        'A 14km precursor Einstein-Rosen bridge anchored at the Lagrange point with nine quantum chevrons.',
        ['Megastructure', 'Stargate', 'Zero-G'],
        '/worlds/council_world_stargate.jpg'
      ),
      createEntry(
        'e-sg-2',
        'locations',
        'Helios-IX (The Dyson Hearth)',
        'Tidally locked volcanic inner planet powering the sector’s warp capacitors.',
        ['Forge World', 'Inner System', 'Dyson Array']
      ),
      createEntry(
        'e-sg-3',
        'locations',
        'Calypso Prime',
        'Bioluminescent ocean world and diplomatic capital of the Thalassian Senate.',
        ['Habitable Core', 'Space Elevator', 'Capital']
      ),
      createEntry(
        'e-sg-4',
        'characters',
        'Commander Kaelen Vance',
        'Veteran recon pilot who survived the first unshielded transit through the ninth chevron.',
        ['Protagonist', 'Pilot', 'Pathfinder'],
        '/src/assets/images/scifi_character_1777698077214.png'
      ),
      createEntry(
        'e-sg-5',
        'factions',
        'The Astral Navigators Guild',
        'Custodians of the Stargate telemetry codes and deep-space jump charts.',
        ['Guild', 'Navigators', 'High Council']
      ),
      createEntry(
        'e-sg-6',
        'rules',
        'The 38-Minute Horizon Law',
        'No wormhole transit may remain open beyond 38 standard minutes without triggering solar core harmonic collapse.',
        ['Physics Law', 'Stargate Limit', 'Hard Sci-Fi']
      ),
    ],
    sources: [
      {
        app: 'FABULA',
        projectId: 'fab-helios',
        projectTitle: 'Helios-IX Master Show Bible',
        publishedAt: NOW - 86400000 * 5,
        entryCount: 42,
      },
      {
        app: 'LOREA_SCRIPT',
        projectId: 'scr-helios',
        projectTitle: 'Pilot Script: Event Horizon',
        publishedAt: NOW - 3600000 * 6,
        entryCount: 19,
      },
    ],
    createdAt: NOW - 86400000 * 30,
  },
  {
    ...BASE_WORLD_FIELDS,
    id: 'showcase-valoria-chronicles',
    name: 'Chronicles of the Clockwork Crown',
    tagline: 'Five Sovereign Kingdoms. One Rising Mechanical Continent. Every Treaty Written in Blood & Brass.',
    genre: 'Epic High Fantasy & Clockwork Cartography',
    description:
      'Across the carved continent of Valoria, great clockwork citadels rise from mountain calderas and river valleys as houses vie for the Sun-Crown. Built for sprawling fantasy novels, tabletop RPG campaigns, and prestige television adaptations.',
    coverImage: '/worlds/council_world_kingdoms.jpg',
    coverImageUrl: '/worlds/council_world_kingdoms.jpg',
    defaultCoverPreset: 'KINGDOM_CHRONICLES',
    isShowcase: true,
    storyIntelScore: 98,
    canonHealth: 99,
    activeCreators: 19,
    totalAssets: 428,
    featuredCharacters: [
      {
        id: 'char-aldric',
        name: 'Lord Aldric Aurelius',
        role: 'Protector of the Sun-Crown',
        avatarUrl: '/src/assets/images/fantasy_character_1777698090574.png',
        faction: 'House Aurelius',
      },
      {
        id: 'char-elara-2',
        name: 'High Cartographer Lyra',
        role: 'Keeper of the Brass Astrolabe',
        avatarUrl: '/src/assets/images/sage_elara_char_1777698135254.png',
        faction: 'Concord of Starlight',
      },
    ],
    activeStudios: [
      { app: 'LOREA_BOOK', label: 'Lorea Novel Studio', projectTitle: 'Book I: The Clockwork Throne (140k words)', status: 'Published' },
      { app: 'FABULA', label: 'Fabula Beat Board', projectTitle: 'Five Kingdoms War Timeline', status: 'Synced' },
      { app: 'TALEO', label: 'Cinema Illustrated Atlas', projectTitle: 'Heraldry & Citadel Blueprints', status: '64 Plates' },
      { app: 'CHORA', label: 'Chora Symphony', projectTitle: 'Main Title: Gears of Valoria', status: 'Mastered' },
    ],
    entries: [
      createEntry(
        'e-kc-1',
        'locations',
        'The Sun-Crown Capital of Valoria',
        'Imperial clockwork citadel where massive brass astrolabe rings track the seasons of the realm.',
        ['Capital', 'Citadel', 'Astrolabe'],
        '/worlds/council_world_kingdoms.jpg'
      ),
      createEntry(
        'e-kc-2',
        'locations',
        'Khazad-Vorn (The Ironhearth Peaks)',
        'Volcanic mountain fortress powered by magma-driven iron cogwheels.',
        ['Stronghold', 'Volcanic', 'Forge']
      ),
      createEntry(
        'e-kc-3',
        'locations',
        'Loth-Aethel (The Silver-Bough Sanctum)',
        'Elven observatory spires woven into petrified golden redwoods.',
        ['Sanctum', 'Forest', 'Observatory']
      ),
      createEntry(
        'e-kc-4',
        'characters',
        'Lord Aldric Aurelius',
        'Heir to the Sun-Crown who must unite the five clockwork realms before the Long Eclipse.',
        ['Royalty', 'Commander', 'POV Character'],
        '/src/assets/images/fantasy_character_1777698090574.png'
      ),
      createEntry(
        'e-kc-5',
        'factions',
        'House Aurelius (The Golden Stag)',
        'Ruling dynasty of the Heartland Plains and builders of the Grand Astrolabe.',
        ['Royal House', 'Valoria', 'Sovereign']
      ),
      createEntry(
        'e-kc-6',
        'rules',
        'The Law of the Great Mainspring',
        'Every royal decree must be ratified before the Grand Astrolabe completes its vernal rotation.',
        ['Realm Law', 'Succession', 'Clockwork Oath']
      ),
    ],
    sources: [
      {
        app: 'LOREA_BOOK',
        projectId: 'bk-valoria-1',
        projectTitle: 'The Clockwork Throne (Manuscript)',
        publishedAt: NOW - 86400000 * 2,
        entryCount: 68,
      },
    ],
    createdAt: NOW - 86400000 * 45,
  },
  {
    ...BASE_WORLD_FIELDS,
    id: 'showcase-aetherium-archipelago',
    name: 'The Aetherium Sky-Archipelago',
    tagline: 'A Bioluminescent World-Spire. Five Floating Sky-Sanctums. Connected by Living Bridges of Light.',
    genre: 'Mythic Aetherpunk & Sky-Island Fantasy',
    description:
      'Suspended above an endless sea of clouds beneath shimmering aurora curtains, five floating sky-realms draw their power from the crystalline World-Spire. Navigate along glowing Ley-Line bridges to explore every island’s characters, music, and lore.',
    coverImage: '/worlds/council_world_archipelago.jpg',
    coverImageUrl: '/worlds/council_world_archipelago.jpg',
    defaultCoverPreset: 'AETHER_ARCHIPELAGO',
    isShowcase: true,
    storyIntelScore: 98,
    canonHealth: 97,
    activeCreators: 11,
    totalAssets: 265,
    featuredCharacters: [
      {
        id: 'char-seraphina',
        name: 'Seraphina of the Ley-Loom',
        role: 'Sky-Bridge Weaver',
        avatarUrl: '/src/assets/images/surreal_character_1777698103671.png',
        faction: 'Council of First Light',
      },
      {
        id: 'char-elara-3',
        name: 'Master Orin',
        role: 'Keeper of the World-Spire',
        avatarUrl: '/src/assets/images/sage_elara_char_1777698135254.png',
        faction: 'Order of the Dawn Chorus',
      },
    ],
    activeStudios: [
      { app: 'FABULA', label: 'Fabula World Architect', projectTitle: 'Sky-Archipelago Lore & Ley-Lines', status: 'Synced' },
      { app: 'CHORA', label: 'Chora Spatial Audio', projectTitle: 'Echo Conservatory Interactive Score', status: 'Dolby Atmos' },
      { app: 'TALEO', label: 'Cinema Webtoon Series', projectTitle: 'Children of the World-Spire', status: 'Episode 18' },
      { app: 'LOREA_BOOK', label: 'Lorea Anthology', projectTitle: 'Tales of the Zephyr Harbor', status: 'In Review' },
    ],
    entries: [
      createEntry(
        'e-aa-1',
        'locations',
        'The World-Spire (Axis Mundi)',
        'Colossal bioluminescent crystal spire anchoring all floating islands via Ley-Line bridges.',
        ['Axis Mundi', 'World-Tree', 'Core Sanctum'],
        '/worlds/council_world_archipelago.jpg'
      ),
      createEntry(
        'e-aa-2',
        'locations',
        'Isle of the Golden Solstice',
        'High-altitude floating temple plateau with twin starlight waterfalls.',
        ['Sky Island', 'Sun Temple', 'Waterfalls']
      ),
      createEntry(
        'e-aa-3',
        'locations',
        'The Echo Conservatory',
        'Acoustic crystal amphitheater suspended on the western wind currents.',
        ['Conservatory', 'Music', 'Floating Isle']
      ),
      createEntry(
        'e-aa-4',
        'characters',
        'Seraphina of the Ley-Loom',
        'Aether-weaver capable of forging new light bridges between drifting sky-continents.',
        ['Protagonist', 'Weaver', 'Sky-Navigator'],
        '/src/assets/images/surreal_character_1777698103671.png'
      ),
      createEntry(
        'e-aa-5',
        'factions',
        'The Council of First Light',
        'Sworn guardians of the central World-Spire and its harmonic Ley-Lines.',
        ['Council', 'Spire Guardians', 'Order']
      ),
      createEntry(
        'e-aa-6',
        'rules',
        'Resonance Buoyancy Law',
        'Any sky-island severed from its Ley-Line bridge loses harmonic buoyancy within seven solar cycles.',
        ['World Physics', 'Ley-Lines', 'Buoyancy']
      ),
    ],
    sources: [
      {
        app: 'FABULA',
        projectId: 'fab-aether',
        projectTitle: 'Aetherium Master Bible',
        publishedAt: NOW - 86400000 * 4,
        entryCount: 54,
      },
    ],
    createdAt: NOW - 86400000 * 21,
  },
];

export const STORY_INTEL_PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Manuscript & Script Ingestion',
    subtitle: 'Story Intelligence Scanner',
    description:
      'Drop any novel, screenplay, comic script, or show bible. Story Intelligence extracts every character, realm, faction, and world rule automatically.',
    codeRef: 'services/storyIntelBridge.ts → extractEntities()',
  },
  {
    step: '02',
    title: '3D Universe Cover Auto-Mapping',
    subtitle: 'Instant Spatial Visualization',
    description:
      'Extracted locations and factions automatically populate onto your chosen 3D Universe Cover—as orbiting planets, clockwork kingdoms, or floating sky-islands.',
    codeRef: 'components/Worlds/UniverseHero3DStage.tsx',
  },
  {
    step: '03',
    title: '1-Click Fabula & World Hub Sync',
    subtitle: '94%+ Affinity Match & Deduplication',
    description:
      'Matches entities against existing universes, merges duplicates without losing lore, and seeds your Fabula story bible in one click.',
    codeRef: 'services/worldHub.ts → upsertEntities() & mergeEntries()',
  },
  {
    step: '04',
    title: 'Cross-Studio Canon Lock',
    subtitle: 'Fabula • Lorea • Chora • Cinema',
    description:
      'Every update to a character, faction, or rule propagates across your books, screenplays, comics, and audio scores with zero canon drift.',
    codeRef: 'services/storyIntelBridge.ts → syncStoryReportToWorldAndUniverse()',
  },
];
