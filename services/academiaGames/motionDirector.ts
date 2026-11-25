/**
 * Motion Council Director adapter for Plajah Academia & Elevate Games.
 *
 * Connects directly to Plajah's real Motion Graphics & VFX Council
 * (services/motion/council/motionCouncilService.ts + motionRoster.ts)
 * so every handmade world is directed by an authentic Studio Roster crew
 * (Pastoral Naturalist, Cel-Era Painter, Live2D Rigger, Digital Compositing Director,
 * Tabletop Miniaturist, Ink-Wash Animator, Simulation TD, Installation Artist).
 */

import { localAdvice, speakerName, type MotionDeliberation } from '../motion/council/motionCouncilService';
import { rosterMember, type RosterMember } from '../motion/council/motionRoster';
import type { WorldId } from './contracts';

export type SteppingMode = 1 | 2 | 3; // 1 = silky 60fps, 2 = theatrical 24fps on-2s (12 poses/s), 3 = storybook on-3s (8 poses/s)

export interface DirectorSettings {
  stepping: SteppingMode;
  windStrength: number;    // 0.4 (Calm Ma) .. 1.0 (Gentle Breeze) .. 1.6 (Lively Valley)
  grainAndWrap: boolean;   // Satsuei / Compositor matched cold-press paper grain & warm light-wrap
  showRigGuides: boolean;  // Optional director's guide boxes showing live painted-mesh rig zones
}

export const DEFAULT_DIRECTOR_SETTINGS: DirectorSettings = {
  stepping: 2,             // Pastoral Naturalist default: 24fps on twos (12 poses/s) for hand-drawn warmth
  windStrength: 1.0,
  grainAndWrap: true,
  showRigGuides: false,
};

interface WorldCrewSpec {
  crewIds: string[];
  ask: string;
  defaultStepping: SteppingMode;
  bpm: number;
}

const WORLD_CREWS: Record<WorldId | 'ora', WorldCrewSpec> = {
  reading: {
    crewIds: ['PASTORAL', 'LIVE2D', 'CEL_OVA', 'SATSUEI'],
    ask: 'Pastoral gouache woodland brook with swaying lanterns, breathing woodland fox, rippling watercolor creek, and gentle komorebi sunbeams.',
    defaultStepping: 2,
    bpm: 76,
  },
  math: {
    crewIds: ['PASTORAL', 'SIM_TD', 'CEL_OVA', 'LIVE2D'],
    ask: 'Sunlit hillside timber aqueduct workshop with rotating mossy waterwheel, billowing clothesline laundry and wisteria, flowing fraction streams, and curling cottage chimney smoke.',
    defaultStepping: 2,
    bpm: 88,
  },
  science: {
    crewIds: ['SATSUEI', 'MINIATURE', 'SIM_TD', 'LIVE2D'],
    ask: 'Twilight wrought-iron botanical conservatory with rustling oak terrarium leaves, pulsing emerald mycorrhizal roots, damped brass galvanometer needle, and glowing Edison tungsten filament.',
    defaultStepping: 1,
    bpm: 68,
  },
  studio: {
    crewIds: ['INSTALLATION', 'SATSUEI', 'SIM_TD'],
    ask: 'Museum gallery glass vitrine with kinetic spun-gold and verdigris Flux mathematical sculpture, optical base caustics, and delicate archival drafting atmosphere.',
    defaultStepping: 1,
    bpm: 64,
  },
  history: {
    crewIds: ['MINIATURE', 'INK_WASH', 'SATSUEI'],
    ask: 'Sunlit watercolor tabletop historical diorama with gently bobbing riverboats, rotating brass astrolabe dial, and drifting window-leaf shadows across cotton parchment.',
    defaultStepping: 2,
    bpm: 72,
  },
  elevate: {
    crewIds: ['PASTORAL', 'INK_WASH', 'LIVE2D', 'SATSUEI'],
    ask: 'Golden-hour Galilean olive hillside with shimmering turquoise sea, billowing woven courtyard awning, flickering clay oil lamps, and gentle breathing shepherd and flock.',
    defaultStepping: 2,
    bpm: 66,
  },
  ora: {
    crewIds: ['PASTORAL', 'SAND_GLASS', 'INK_WASH', 'SATSUEI'],
    ask: 'Twilight cedar tea veranda stillness (Ma) with silky rising ceramic teacup steam, gently rippling lily pond, swinging bronze wind-bell, swimming koi, and rhythmic firefly breath ring.',
    defaultStepping: 2,
    bpm: 60,
  },
};

export interface WorldMotionDirection {
  world: WorldId | 'ora';
  crew: RosterMember[];
  deliberation: MotionDeliberation;
  defaultStepping: SteppingMode;
}

const cache = new Map<WorldId | 'ora', WorldMotionDirection>();

/** Resolve deterministic Plajah Motion Council direction for a world (zero silent cloud AI). */
export function getWorldMotionDirection(world: WorldId | 'ora'): WorldMotionDirection {
  const hit = cache.get(world);
  if (hit) return hit;

  const cfg = WORLD_CREWS[world];
  const crew = cfg.crewIds.map(rosterMember).filter(Boolean) as RosterMember[];
  const deliberation = localAdvice(
    {
      ask: cfg.ask,
      medium: world === 'studio' ? 'generator' : 'character',
      crew: cfg.crewIds,
    },
    {
      fps: 24,
      tempo: cfg.bpm,
      energy: world === 'math' ? 0.55 : 0.28,
    },
  );

  const out: WorldMotionDirection = {
    world,
    crew,
    deliberation,
    defaultStepping: cfg.defaultStepping,
  };
  cache.set(world, out);
  return out;
}

export { speakerName };

/** Quantize continuous time (sec) to feature hand-drawn cadence (on 2s = 12fps, on 3s = 8fps, on 1s = continuous). */
export function quantizeMotionTime(timeSec: number, stepping: SteppingMode): number {
  if (stepping === 1) return timeSec;
  const poseRate = stepping === 2 ? 12 : 8;
  return Math.floor(timeSec * poseRate) / poseRate;
}
