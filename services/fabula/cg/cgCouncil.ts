// cgCouncil — who authored what in the Fabula CG library and the FX preset bank.
//
// The platform's councils are rosters of archetype personas (services/council,
// services/motion/council, services/melos/council). We don't import those modules
// here (they pull in LLM + store code); we mirror just the ids and display names
// needed for attribution so the CG library stays bundle-light and node-testable.
// tests/fabulaCg.test.ts pins these ids against the source rosters.
export type CgCouncilId = 'art' | 'motion' | 'roster' | 'music';

export interface CgCouncilMember { id: string; name: string; epithet: string }
export interface CgCouncil { id: CgCouncilId; name: string; members: CgCouncilMember[] }

const m = (id: string, name: string, epithet: string): CgCouncilMember => ({ id, name, epithet });

export const CG_COUNCILS: Record<CgCouncilId, CgCouncil> = {
  art: {
    id: 'art', name: 'Council of Art Directors',
    members: [
      m('CLASSICAL', 'The Classical Mind', 'the Classical Mind'),
      m('REBEL', 'The Rebellious Hand', 'the Rebellious Hand'),
      m('FUTURIST', 'The Futurist', 'the Futurist'),
      m('WORLD_ECLECTIC', 'The World-Eclectic Traveller', 'the World-Eclectic Traveller'),
      m('BAROQUE', 'The Baroque Dramatist', 'the Baroque Dramatist'),
      m('RADICAL_MINIMAL', 'The Radical Minimalist', 'the Radical Minimalist'),
    ],
  },
  motion: {
    id: 'motion', name: 'Motion Graphics & VFX Council',
    members: [
      m('KINETIC', 'The Kinetic Typographer', 'the Kinetic Typographer'),
      m('CHARACTER', 'The Animator', 'the Animator'),
      m('COMPOSITOR', 'The Compositor', 'the Compositor'),
      m('GENERATIVE', 'The Generative Artist', 'the Generative Artist'),
      m('SIGNAL', 'The Signal Bender', 'the Signal Bender'),
      m('CINEMATIC', 'The 3D Dramatist', 'the 3D Dramatist'),
    ],
  },
  roster: {
    id: 'roster', name: 'Motion Studio Roster',
    members: [
      m('MODERNIST_TITLE', 'The Modernist Title Designer', 'the Modernist Title Designer'),
      m('SPORTS_BROADCAST', 'The Sports Broadcast Designer', 'the Sports Broadcast Designer'),
      m('CONSTRUCTIVIST', 'The Constructivist Agitator', 'the Constructivist Agitator'),
      m('EXPLAINER', 'The Explainer Systematist', 'the Explainer Systematist'),
      m('DATA_STORY', 'The Data Storyteller', 'the Data Storyteller'),
      m('ART_DECO', 'The Art Deco Showman', 'the Art Deco Showman'),
      m('COLLAGE', 'The Collage Zinester', 'the Collage Zinester'),
      m('PSYCHEDELIC', 'The Psychedelic Colourist', 'the Psychedelic Colourist'),
      m('UI_MOTION', 'The Interface Motion Designer', 'the Interface Motion Designer'),
      m('ARCADE', 'The Arcade Attract-Mode Showman', 'the Arcade Attract-Mode Showman'),
      m('DEMOSCENE', 'The Demoscene Coder', 'the Demoscene Coder'),
      m('VIRTUAL_PROD', 'The Virtual Production Cinematographer', 'the Virtual Production Cinematographer'),
      m('SATSUEI', 'The Digital Compositing Director', 'the Digital Compositing Director'),
      m('MIDCENTURY', 'The Mid-Century Modernist', 'the Mid-Century Modernist'),
      m('BOLD_FLAT', 'The Bold-Flat TV Stylist', 'the Bold-Flat TV Stylist'),
      m('AFRO_PATTERN', 'The Afrofuturist Pattern Animator', 'the Afrofuturist Pattern Animator'),
      m('GEOMETRIC_CALLIGRAPHIC', 'The Geometric & Calligraphic Animator', 'the Geometric & Calligraphic Animator'),
      m('LIGNE_CLAIRE', 'The Ligne Claire Animator', 'the Ligne Claire Animator'),
      m('INK_WASH', 'The Ink-Wash Animator', 'the Ink-Wash Animator'),
      m('SOUTH_ASIAN_FOLK', 'The South Asian Folk & Title Animator', 'the South Asian Folk & Title Animator'),
      m('WEBTOON', 'The Webtoon Motion Artist', 'the Webtoon Motion Artist'),
      m('STRUCTURAL', 'The Structural Filmmaker', 'the Structural Filmmaker'),
      m('VISUAL_MUSIC', 'The Visual Music Abstractionist', 'the Visual Music Abstractionist'),
      m('ABSTRACT_LOOP', 'The Abstract 3D Loop Artist', 'the Abstract 3D Loop Artist'),
      m('GAME_VFX', 'The Stylised Game VFX Artist', 'the Stylised Game VFX Artist'),
      m('PIXEL_ART', 'The Pixel-Art Sprite Animator', 'the Pixel-Art Sprite Animator'),
      m('TV_LIMITED', 'The TV Limited-Animation Economist', 'the TV Limited-Animation Economist'),
      m('DIRECT_FILM', 'The Direct-on-Film Scratcher', 'the Direct-on-Film Scratcher'),
      m('SIM_TD', 'The Simulation Technical Director', 'the Simulation Technical Director'),
      m('FLASH_INDIE', 'The Flash-Era Indie Animator', 'the Flash-Era Indie Animator'),
    ],
  },
  music: {
    id: 'music', name: 'Music Council',
    members: [
      m('PRODUCER', 'The Producer', 'the Producer'),
      m('MIX', 'The Mix Engineer', 'the Mix Engineer'),
      m('MASTER', 'The Master Engineer', 'the Master Engineer'),
      m('MUSICIAN', 'The Virtuoso & Orchestrator', 'the Virtuoso & Orchestrator'),
      m('COMPOSER', 'The Master Film & Classical Composer', 'the Master Composer'),
      m('LD', 'The Lighting Director', 'the Lighting Director'),
    ],
  },
};

export function cgMember(council: CgCouncilId | string, id: string): CgCouncilMember | undefined {
  return CG_COUNCILS[council as CgCouncilId]?.members.find(x => x.id === id);
}

export function cgCreditLine(c?: { council: string; member: string }): string {
  if (!c) return '';
  const mem = cgMember(c.council, c.member);
  const council = CG_COUNCILS[c.council as CgCouncilId];
  return mem ? `${mem.name} · ${council?.name ?? c.council}` : '';
}
