// gameCouncilService — The Game Developer & Interactive Experiences Specialist Council.
//
// Bridges the Art Council (services/council), the Animator & VFX Council (services/motion/council),
// and the four Game Development & Interactive Experience Specialists to power:
//   1. The Plajah Worlds Interactive Exploration Overworld Engine (Art Council Master Plate →
//      Animator Council Motion Pass → Game Council 3D Relief Displacement, Shaders & Playable Loop)
//   2. The Game Development & Interactive Experiences studio across Plajah.
//
// The Four Game & Interactive Specialists:
//   - HARDWARE_PIONEER ("The Silicon Pioneer & Pixel Architect" — Kenji "Raster" Vance):
//     50-year veteran from 1970s TTL/vector & 8-bit 6502 PPU through 16-bit Mode-7/Amiga blitters to
//     modern HD-2D voxel-pixel shaders. Master of hardware history, pixel art, tilemaps, and crisp silhouettes.
//   - REALTIME_3D_GURU ("The Real-Time 3D Engine & Shader Guru" — Søren Lindqvist):
//     Pushes real-time game engine rendering to absolute technical limits — high-density 3D heightfield
//     displacement from concept art, Sobel normal lighting, PBR shaders, volumetric god-rays, and 60fps GPU craft.
//   - GAMEPLAY_VIRTUOSO ("The Fun & Level Design Virtuoso" — Elena "Loop" Vance-Moreau):
//     Master of the 3-second fun loop, toy-first interactive exploration, sightlines ("weenies"),
//     pilotable overworld vessels, hit-stop camera juice, and rewarding discovery loops across every genre.
//   - JAPANESE_AUTEUR ("The Japanese Game Auteur & World Director" — Takumi Sato):
//     Tokyo-born world director steeped in Japanese video game history, JRPG overworld dioramas,
//     ma (intentional atmospheric stillness), satsuei lighting, and iconic silhouette storytelling.

import { ARIA_GAME_DIRECTOR_COUNCIL, type AriaGameDirectorLensId } from '../../aria/ariaCreativeRoles';
import type { CouncilDirectorId } from '../../council/councilTypes';
import type { MotionPersonaId } from '../../motion/council/motionCouncilTypes';
import { RAVENCREST_CANON, canonForSeat, ravencrestCanonBrief, type CanonPrinciple } from './ravencrestCanon';

export type GameCouncilMemberId = AriaGameDirectorLensId;

export type RenderLensMode = 'UE5_PBR' | 'SATSUEI_ANIME' | 'HD2D_PIXEL' | 'WIREFRAME_XRAY';

export interface GameCouncilSpecialist {
  id: GameCouncilMemberId;
  name: string;
  personaName: string;
  epithet: string;
  eraSpan: string;
  artCouncilAlly: CouncilDirectorId;
  animatorSeat: MotionPersonaId;
  rosterId: string;
  specialty: string;
  conviction: string;
  protects: string;
  challenges: string;
  voice: string;
  signatureMoves: string[];
  tensions: Partial<Record<GameCouncilMemberId, string>>;
  /** The Ravencrest Canon principles this seat guards (filled from ravencrestCanon.ts below). */
  canon?: CanonPrinciple[];
}

export const GAME_COUNCIL_SPECIALISTS: Record<GameCouncilMemberId, GameCouncilSpecialist> = {
  HARDWARE_PIONEER: {
    id: 'HARDWARE_PIONEER',
    name: 'The Silicon Pioneer & Pixel Architect',
    personaName: 'Kenji "Raster" Vance',
    epithet: 'the Silicon Pioneer',
    eraSpan: '1972–Present (TTL Vector · 8-Bit PPU · 16-Bit Mode-7 · HD-2D Shaders)',
    artCouncilAlly: 'CLASSICAL',
    animatorSeat: 'SIGNAL',
    rosterId: 'HARDWARE_PIONEER',
    specialty: 'Hardware History, Low-Level Register Craft, Master 2D Pixel Art & HD-2D Tilemap Shaders',
    conviction: ARIA_GAME_DIRECTOR_COUNCIL[0].conviction,
    protects: ARIA_GAME_DIRECTOR_COUNCIL[0].protects,
    challenges: ARIA_GAME_DIRECTOR_COUNCIL[0].challenges,
    voice: 'Speaks in H-blank interrupts, 16-color palette banks, Mode-7 scanline matrices, and sub-pixel silhouette economy.',
    signatureMoves: [
      'HD-2D Pixel-Shader & Mode-7 CRT Overworld Lens toggle with authentic phosphor aperture grille and dithered color ramps',
      '1x-readable iconographic beacon silhouettes and sub-pixel animated Wayfinder sprites',
      'Locked 60fps zero-allocation render loop discipline inspired by classic console VRAM budgets',
    ],
    tensions: {
      REALTIME_3D_GURU: 'Søren throws 40,000 triangles at a problem a Mode-7 affine plane and a tight 16-color palette solved in 1994.',
      JAPANESE_AUTEUR: 'Takumi talks about the poetry of the horizon; I built the H-blank interrupt that made that horizon bend!',
    },
  },
  REALTIME_3D_GURU: {
    id: 'REALTIME_3D_GURU',
    name: 'The Real-Time 3D Engine & Shader Guru',
    personaName: 'Søren Lindqvist',
    epithet: 'the 3D Engine Guru',
    eraSpan: '1996–Present (GLSL/HLSL · PBR · Ray-Marched Volumetrics · Nanite-Class Relief)',
    artCouncilAlly: 'FUTURIST',
    animatorSeat: 'CINEMATIC',
    rosterId: 'REALTIME_3D_GURU',
    specialty: 'Real-Time GPU Rendering, Concept-to-3D Relief Displacement, Custom GLSL Shaders & Volumetrics',
    conviction: ARIA_GAME_DIRECTOR_COUNCIL[1].conviction,
    protects: ARIA_GAME_DIRECTOR_COUNCIL[1].protects,
    challenges: ARIA_GAME_DIRECTOR_COUNCIL[1].challenges,
    voice: 'Relentless rendering engineer; talks in Sobel height-normals, Fresnel rim lighting, vertex displacement, and volumetric scattering.',
    signatureMoves: [
      '40,000-triangle 3D Relief Displacement Mesh extruded directly from Council-generated Master Concept Plates',
      'Real-time GLSL Sobel normal reconstruction with dynamic sweeping point lights, specular water/metal, and emissive magma/aurora passes',
      'Live 3D Wireframe + Heightfield X-Ray inspection mode to verify geometric relief fidelity',
    ],
    tensions: {
      HARDWARE_PIONEER: 'Kenji wants to quantize my volumetric god-rays into 8-bit registers. We have a modern GPU — let the heightfield and PBR shaders sing!',
      GAMEPLAY_VIRTUOSO: 'Elena would put arcade arrows over a cathedral. Let the light and parallax establish awe first.',
    },
  },
  GAMEPLAY_VIRTUOSO: {
    id: 'GAMEPLAY_VIRTUOSO',
    name: 'The Fun & Level Design Virtuoso',
    personaName: 'Elena "Loop" Vance-Moreau',
    epithet: 'the Gameplay Virtuoso',
    eraSpan: '1985–Present (Toy-First Prototyping · Spatial Level Design · Game Feel & Core Loops)',
    artCouncilAlly: 'REBEL',
    animatorSeat: 'KINETIC',
    rosterId: 'GAMEPLAY_VIRTUOSO',
    specialty: 'Interactive Exploration Loops, Spatial Sightlines ("Weenies"), Pilotable Vessels & Tactile Game Feel',
    conviction: ARIA_GAME_DIRECTOR_COUNCIL[2].conviction,
    protects: ARIA_GAME_DIRECTOR_COUNCIL[2].protects,
    challenges: ARIA_GAME_DIRECTOR_COUNCIL[2].challenges,
    voice: 'Infectiously energetic play-tester; measures input-to-joy in milliseconds and insists every world map be playable in 3 seconds.',
    signatureMoves: [
      'Pilotable 3D Wayfinder Vessel (Star-Skiff, Clockwork Pawn, Sky-Airship) driven by click-to-fly or WASD / Arrow Keys',
      'Juicy arrival shockwaves, camera spring-impulses, FOV warp surges, and interactive Lore Beacon discovery progression',
      'Clear triangular sightlines between central hub landmarks and perimeter realm portals',
    ],
    tensions: {
      REALTIME_3D_GURU: 'If the player cannot pilot a vessel through Søren’s arch in three seconds, it is a wallpaper, not a world.',
      JAPANESE_AUTEUR: 'Takumi holds on the aurora for five seconds while the player is itching to fly. Give them the controls while the wind blows!',
    },
  },
  JAPANESE_AUTEUR: {
    id: 'JAPANESE_AUTEUR',
    name: 'The Japanese Game Auteur & World Director',
    personaName: 'Takumi Sato',
    epithet: 'the Japanese World Auteur',
    eraSpan: '1986–Present (Famicom/SFC Overworlds · JRPG Dioramas · Satsuei & Ma)',
    artCouncilAlly: 'WORLD_ECLECTIC',
    animatorSeat: 'CHARACTER',
    rosterId: 'JAPANESE_AUTEUR',
    specialty: 'Japanese Game History, Overworld Diorama Scale, Ma (Atmospheric Stillness) & Satsuei Lighting',
    conviction: ARIA_GAME_DIRECTOR_COUNCIL[3].conviction,
    protects: ARIA_GAME_DIRECTOR_COUNCIL[3].protects,
    challenges: ARIA_GAME_DIRECTOR_COUNCIL[3].challenges,
    voice: 'Poetic and exact; speaks of ma, the silhouette of the World-Tree against the aurora, and how a classic JRPG overworld makes the chest swell.',
    signatureMoves: [
      'Iconic central landmark staging (Dyson Stargate, Imperial Clockwork Citadel, Bioluminescent Crystal World-Tree)',
      'Satsuei Cel-Anime Overworld Lens with golden-hour rim light, spirit embers, and twilight diffusion',
      'Dramatic realm arrival cartouches and intentional ma (breathing sky and sea around dense lore hubs)',
    ],
    tensions: {
      GAMEPLAY_VIRTUOSO: 'Elena wants constant input every half-second. Without ma — the quiet wind over the sky-islands — there is no wonder.',
      HARDWARE_PIONEER: 'Kenji counts scanlines; I care about the emotional silhouette when the overworld theme swells.',
    },
  },
};

// Every seat carries the Ravencrest lessons it guards; the whole council is bound by all of them.
for (const s of Object.values(GAME_COUNCIL_SPECIALISTS)) s.canon = canonForSeat(s.id);
export const GAME_COUNCIL_CANON = RAVENCREST_CANON;
/** Brief for one seat (its own principles with evidence, the rest by name) or the whole council. */
export const gameCouncilCanonBrief = (seat?: GameCouncilMemberId) => ravencrestCanonBrief(seat);

export const GAME_COUNCIL_LIST: GameCouncilSpecialist[] = [
  GAME_COUNCIL_SPECIALISTS.HARDWARE_PIONEER,
  GAME_COUNCIL_SPECIALISTS.REALTIME_3D_GURU,
  GAME_COUNCIL_SPECIALISTS.GAMEPLAY_VIRTUOSO,
  GAME_COUNCIL_SPECIALISTS.JAPANESE_AUTEUR,
];

export interface WorldArtTo3DPipelineStage {
  step: number;
  council: 'ART_COUNCIL' | 'ANIMATOR_COUNCIL' | 'GAME_COUNCIL';
  title: string;
  lead: string;
  summary: string;
  outputArtifact: string;
}

export interface WorldCouncilBlueprint {
  engineId: 'STARGATE_ODYSSEY' | 'KINGDOM_CHRONICLES' | 'AETHER_ARCHIPELAGO';
  masterPlateUrl: string;
  artCouncilLead: string;
  animatorCouncilCrew: string[];
  gameCouncilLead: GameCouncilMemberId;
  gameCouncilCounterpoint: GameCouncilMemberId;
  vesselName: string;
  vesselType: 'STAR_SKIFF' | 'CLOCKWORK_PAWN' | 'SKY_AIRSHIP';
  pipelineStages: WorldArtTo3DPipelineStage[];
  specialistNotes: Record<GameCouncilMemberId, string>;
}

export const WORLD_COUNCIL_BLUEPRINTS: Record<'STARGATE_ODYSSEY' | 'KINGDOM_CHRONICLES' | 'AETHER_ARCHIPELAGO', WorldCouncilBlueprint> = {
  STARGATE_ODYSSEY: {
    engineId: 'STARGATE_ODYSSEY',
    masterPlateUrl: '/worlds/council_world_stargate.jpg',
    artCouncilLead: 'The Futurist + The Baroque Dramatist',
    animatorCouncilCrew: ['MECHA (The Mecha Choreographer)', 'SATSUEI (The Digital Compositing Director)', 'DEMOSCENE (The Demoscene Coder)'],
    gameCouncilLead: 'REALTIME_3D_GURU',
    gameCouncilCounterpoint: 'GAMEPLAY_VIRTUOSO',
    vesselName: 'Aethel-VII Star-Skiff',
    vesselType: 'STAR_SKIFF',
    pipelineStages: [
      {
        step: 1,
        council: 'ART_COUNCIL',
        title: 'Stage 1 · Art Council Master Concept Plate Generation',
        lead: 'The Futurist & The Baroque Dramatist',
        summary: 'Generated the 16:9 widescreen orbital master plate featuring the foreground titanium-and-gold Dyson Stargate ring, quantum sapphire vortex, and the Helios multi-planet solar system with golden astrolabe orbit lanes.',
        outputArtifact: '/worlds/council_world_stargate.jpg',
      },
      {
        step: 2,
        council: 'ANIMATOR_COUNCIL',
        title: 'Stage 2 · Animator Council Motion & Satsuei Pass',
        lead: 'The 3D Dramatist, The Mecha Choreographer & Satsuei Director',
        summary: 'Choreographed the heavy mechanical chevron locks on threes, the swirling spiral event-horizon shader inside the gate aperture, coronal sun god-rays, and orbital velocity arcs.',
        outputArtifact: 'GLSL Event Horizon Vortex + Solar Corona Volumetric Pass',
      },
      {
        step: 3,
        council: 'GAME_COUNCIL',
        title: 'Stage 3 · Game Council 3D Relief Reconstruction & Playable Overworld',
        lead: 'Søren Lindqvist (3D Guru) & Elena Vance-Moreau (Gameplay Virtuoso)',
        summary: 'Extruded the Stargate ring and planets into a 40,000-triangle 3D displaced relief stage with Sobel normal specular lighting, 3D rotating glyph rings, and the pilotable Aethel-VII Star-Skiff that warps through the gate.',
        outputArtifact: 'Real-Time 3D Displaced Stargate & Solar System Overworld',
      },
    ],
    specialistNotes: {
      REALTIME_3D_GURU: 'Extruded the Stargate titanium bezel and planetary spheres using luminance-weighted vertex displacement, then layered a custom GLSL spiral quantum vortex inside the gate aperture (`uv: 0.37, 0.50`) and coronal god-rays from Helios (`uv: 0.67, 0.34`).',
      GAMEPLAY_VIRTUOSO: 'Placed the pilotable Aethel-VII Star-Skiff on the orbital spline. Clicking any planet or pressing WASD/Arrows fires thrusters, triggers a Stargate wormhole FOV surge, and locks onto the target world’s canon beacon.',
      JAPANESE_AUTEUR: 'Framed the colossal Stargate on the left third against the vast cosmic ma of the Helios system on the right, so the player feels the scale of crossing between stars.',
      HARDWARE_PIONEER: 'Added the HD-2D / 16-Bit Mode-7 CRT lens option with palette-cycled wormhole shimmer and crisp 1x orbital telemetry reticles.',
    },
  },
  KINGDOM_CHRONICLES: {
    engineId: 'KINGDOM_CHRONICLES',
    masterPlateUrl: '/worlds/council_world_kingdoms.jpg',
    artCouncilLead: 'The Classical Mind + The Baroque Dramatist',
    animatorCouncilCrew: ['PUPPET (The Armature Puppeteer)', 'CINEMATIC (The 3D Dramatist)', 'GAME_VFX (The Stylised Game VFX Artist)'],
    gameCouncilLead: 'GAMEPLAY_VIRTUOSO',
    gameCouncilCounterpoint: 'HARDWARE_PIONEER',
    vesselName: 'The Crown’s Clockwork Envoy',
    vesselType: 'CLOCKWORK_PAWN',
    pipelineStages: [
      {
        step: 1,
        council: 'ART_COUNCIL',
        title: 'Stage 1 · Art Council Master Concept Plate Generation',
        lead: 'The Classical Mind & The Baroque Dramatist',
        summary: 'Generated the 45-degree carved stone-and-brass tabletop relief map with the central Imperial Clockwork Citadel, Cinder-Peak volcano, Sapphire Tide harbor, and Sylvan Heartwood sanctuary lit by warm perimeter candles.',
        outputArtifact: '/worlds/council_world_kingdoms.jpg',
      },
      {
        step: 2,
        council: 'ANIMATOR_COUNCIL',
        title: 'Stage 2 · Animator Council Clockwork & Elemental Pass',
        lead: 'The 3D Dramatist & The Stylised Game VFX Artist',
        summary: 'Timed the interlocking brass astrolabe gears around the central citadel, pulsing molten magma veins down the northwest caldera, and flickering candlelight chiaroscuro across the carved mountains.',
        outputArtifact: '3D Clockwork Gear Rig + Magma & Harbor Wave Shaders',
      },
      {
        step: 3,
        council: 'GAME_COUNCIL',
        title: 'Stage 3 · Game Council 3D Relief Tabletop & Strategic Overworld Loop',
        lead: 'Elena Vance-Moreau (Gameplay Virtuoso) & Kenji Vance (Silicon Pioneer)',
        summary: 'Built a tilted 3D relief map mesh with deep topographic extrusion, dynamic point-light candle shadows, golden highway splines, and a playable Clockwork Envoy piece that marches between kingdoms.',
        outputArtifact: 'Real-Time 3D Carved Relief Kingdom Overworld',
      },
    ],
    specialistNotes: {
      GAMEPLAY_VIRTUOSO: 'Designed the golden embossed trade roads as playable transit splines. Marching the Clockwork Envoy between the five kingdoms triggers tactile gear-lock shockwaves and reveals faction treaties.',
      REALTIME_3D_GURU: 'Reconstructed the carved mountain ridges and recessed brass gear-pit in 3D relief geometry with high-specular metallic response on the clockwork rings (`uv: 0.50, 0.48`) and emissive lava channels (`uv: 0.23, 0.21`).',
      HARDWARE_PIONEER: 'In HD-2D mode, the tilt-shift depth of field and dithered candlelight make the tabletop map look like the ultimate 32-bit tactical RPG overworld.',
      JAPANESE_AUTEUR: 'Balanced the four elemental outer realms (Volcano, Harbor, Cathedral, Heartwood Tree) around the central Imperial Keep like a classic mandala overworld.',
    },
  },
  AETHER_ARCHIPELAGO: {
    engineId: 'AETHER_ARCHIPELAGO',
    masterPlateUrl: '/worlds/council_world_archipelago.jpg',
    artCouncilLead: 'The World-Eclectic Traveler + The Futurist',
    animatorCouncilCrew: ['PASTORAL (The Pastoral Naturalist)', 'SATSUEI (The Digital Compositing Director)', 'SAKUGA (The Sakuga Key Animator)'],
    gameCouncilLead: 'JAPANESE_AUTEUR',
    gameCouncilCounterpoint: 'REALTIME_3D_GURU',
    vesselName: 'Sora-Maru Sky-Skiff',
    vesselType: 'SKY_AIRSHIP',
    pipelineStages: [
      {
        step: 1,
        council: 'ART_COUNCIL',
        title: 'Stage 1 · Art Council Master Concept Plate Generation',
        lead: 'The World-Eclectic Traveler & The Futurist',
        summary: 'Generated the panoramic JRPG sky-island sanctuary plate crowned by the Bioluminescent Crystal World-Tree, golden astronomical orrery spire, arched Ley-Line light bridges, cascading waterfalls, and twilight cloud maelstrom.',
        outputArtifact: '/worlds/council_world_archipelago.jpg',
      },
      {
        step: 2,
        council: 'ANIMATOR_COUNCIL',
        title: 'Stage 2 · Animator Council Pastoral Wind & Satsuei Light Pass',
        lead: 'The Pastoral Naturalist & The Digital Compositing Director (Satsuei)',
        summary: 'Added sequential wind motion across the aurora borealis curtains, flowing cyan-and-gold Ley-Line bridge pulses, silver waterfall foam shaders, and floating bioluminescent spirit particles.',
        outputArtifact: 'Satsuei Aurora & Waterfall Shader + Ley-Line Pulse System',
      },
      {
        step: 3,
        council: 'GAME_COUNCIL',
        title: 'Stage 3 · Game Council Multi-Plane 3D Sky-Archipelago & Airship Loop',
        lead: 'Takumi Sato (Japanese Auteur) & Søren Lindqvist (3D Guru)',
        summary: 'Separated the foreground cliff, floating islands, central World-Tree spire, and cloud maelstrom into buoyant 3D depth planes with a pilotable Sora-Maru Sky-Skiff airship.',
        outputArtifact: 'Real-Time 3D Sky-Island Exploration Overworld',
      },
    ],
    specialistNotes: {
      JAPANESE_AUTEUR: 'Placed the lone wayfarer on the foreground cliff (`uv: 0.16, 0.70`) looking across the Ley-Line bridges toward the central Crystal World-Tree (`uv: 0.52, 0.42`) — the classic Japanese overworld invitation to adventure.',
      REALTIME_3D_GURU: 'Applied multi-plane 3D relief displacement with vertical island buoyancy, animated UV waterfall flow on the cliff edges, and real-time aurora borealis wave shaders across the upper sky.',
      GAMEPLAY_VIRTUOSO: 'Piloting the Sora-Maru Sky-Skiff across the glowing Ley-Line bridges or riding the golden cloud maelstrom gives instant, joyful aerial exploration.',
      HARDWARE_PIONEER: 'Crafted sub-pixel wind-sail silhouettes and an HD-2D shader pass that pays homage to the greatest 16-bit and 32-bit sky-island RPGs in history.',
    },
  },
};
