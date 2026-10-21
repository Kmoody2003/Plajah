import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  CURATED_HALLOWEEN_FILMS,
  ArchiveVideo,
} from '../../services/archiveContentService';
import {
  getHalloweenStoryIntelBundle,
  getCharactersForFilm,
  FilmStoryIntelBundle,
  HalloweenCharacterWithActor,
} from '../../data/halloweenStoryIntel';
import { pumpkinPatchV4 } from '../../data/showcase/comics/pumpkinPatchV4';
import {
  halloweenAudio,
  CastleSurfaceType,
  CastleMusicZone,
} from '../../services/halloween/halloweenAudioSfx';

export type CastleCouncilLensId =
  | 'RAVENCREST_REFERENCE'
  | 'UE5_PBR'
  | 'SATSUEI_ANIME'
  | 'HD2D_DIORAMA'
  | 'GRINDHOUSE_35MM';

export const CASTLE_COUNCIL_LENSES: Array<{
  id: CastleCouncilLensId;
  label: string;
  councilLead: string;
  exposure: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  envIntensity: number;
}> = [
  {
    id: 'RAVENCREST_REFERENCE',
    label: 'Ravencrest · Reference Art',
    councilLead: 'Cool moonlit stone, restrained amber practical lights',
    exposure: 1.05,
    bloomStrength: 0.18,
    bloomRadius: 0.35,
    bloomThreshold: 1.0,
    envIntensity: 0.55,
  },
  {
    id: 'UE5_PBR',
    label: 'Cinematic PBR + IBL',
    councilLead: 'Søren Lindqvist (3D Guru) & Rembrandt (Baroque)',
    exposure: 1.48,
    bloomStrength: 0.48,
    bloomRadius: 0.55,
    bloomThreshold: 0.62,
    envIntensity: 1.75,
  },
  {
    id: 'SATSUEI_ANIME',
    label: 'Satsuei High-Contrast Bloom',
    councilLead: 'Takumi Sato (Auteur) & Boccioni (Futurist)',
    exposure: 1.58,
    bloomStrength: 0.72,
    bloomRadius: 0.68,
    bloomThreshold: 0.48,
    envIntensity: 1.85,
  },
  {
    id: 'HD2D_DIORAMA',
    label: 'HD-2D Warm Torchlight',
    councilLead: 'Kenji Vance (Hardware) & Classical Council',
    exposure: 1.52,
    bloomStrength: 0.64,
    bloomRadius: 0.62,
    bloomThreshold: 0.52,
    envIntensity: 1.65,
  },
  {
    id: 'GRINDHOUSE_35MM',
    label: '35mm Grindhouse Chiaroscuro',
    councilLead: 'Elena Vance-Moreau (Gameplay) & Dark Noir',
    exposure: 1.38,
    bloomStrength: 0.54,
    bloomRadius: 0.5,
    bloomThreshold: 0.58,
    envIntensity: 1.55,
  },
];

// ============================================================================
// TYPES & ENCOUNTER DEFINITIONS (Sheet-Accurate 3D Rigs + 12-Room Castle Mansion)
// ============================================================================

export type PumpkinPatchEncounterId =
  | 'pumpkin_patch_tank'
  | 'miriam_monkeys'
  | 'pumpkin_patch_blades'
  | 'stitch_scarecrow'
  | 'katrina_crane_patrol'
  | 'lil_boo_jar';

export interface SparseCharacterEncounter {
  id: PumpkinPatchEncounterId;
  title: string;
  subtitle: string;
  characterIds: string[];
  portraitUrl: string;
  secondaryPortraitUrl?: string;
  stillUrl: string;
  comicPanelUrl: string;
  comicPageNumber: number;
  comicPanelId: string;
  scriptQuote: string;
  sfxText: string;
  storyIntelSceneTitle: string;
  storyIntelTimecode: string;
  durationMs: number;
  badgeColor: string;
  description: string;
}

export interface BillboardMovieNode {
  id: string;
  title: string;
  year: string;
  director: string;
  tagline: string;
  posterUrl: string;
  directionLabel: string;
  distanceMiles: string;
  compass: 'NORTH' | 'NE' | 'EAST' | 'SE' | 'SOUTH' | 'SW' | 'WEST' | 'NW';
  roadZone: 'CASTLE_APPROACH' | 'EAST_HIGHWAY' | 'SOUTH_TURNPIKE' | 'WEST_GOTHIC_ROAD';
  position: [number, number, number];
  rotationY: number;
  castleRoomId?: string;
  castlePaintingPos?: [number, number, number];
  castlePaintingRotY?: number;
  isHeroPumpkinPatch?: boolean;
  archiveFilm?: ArchiveVideo;
  storyIntel?: FilmStoryIntelBundle | null;
}

export interface CastleRoomDefinition {
  id: string;
  roomNumber: number;
  name: string;
  floorIndex: 0 | 1 | 2 | 3;
  floorLabel: string;
  elevationY: number;
  musicZone: CastleMusicZone;
  surface: CastleSurfaceType;
  center: [number, number, number];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  paintingPos: [number, number, number];
  paintingRotY: number;
  subtitle: string;
  accentColor: string;
}

const PUMPKIN_PATCH_FILM_ID = 'album_1787881859314_mlt23';

export const CASTLE_ROOMS: CastleRoomDefinition[] = [
  // LEVEL 0: SUBTERRANEAN BASEMENT CRYPT (Y = -6.0m — Reached via Center Crypt Staircase!)
  {
    id: 'crypt_alchemy',
    roomNumber: 1,
    name: 'Torture & Alchemy Crypt',
    floorIndex: 0,
    floorLabel: 'Basement Crypt (-6m)',
    elevationY: -6.0,
    musicZone: 'BASEMENT_CRYPT',
    surface: 'STONE',
    center: [-15.0, -6.0, -46.0],
    bounds: { minX: -23.5, maxX: -6.8, minZ: -54.5, maxZ: -36.5 },
    paintingPos: [-22.3, -3.3, -46.0],
    paintingRotY: Math.PI / 2,
    subtitle: 'Glowing emerald alchemical vats, iron cages & dungeon stone vaults',
    accentColor: '#10b981',
  },
  {
    id: 'crypt_catacombs',
    roomNumber: 2,
    name: 'Flooded Catacombs & Bone Vault',
    floorIndex: 0,
    floorLabel: 'Basement Crypt (-6m)',
    elevationY: -6.0,
    musicZone: 'BASEMENT_CRYPT',
    surface: 'CRYPT_WATER',
    center: [0.0, -6.0, -66.5],
    bounds: { minX: -23.5, maxX: 23.5, minZ: -71.5, maxZ: -55.0 },
    paintingPos: [0.0, -3.3, -70.3],
    paintingRotY: 0,
    subtitle: 'Ankle-deep subterranean black water, skull ossuary alcoves & catacomb arches',
    accentColor: '#06b6d4',
  },
  {
    id: 'crypt_ritual',
    roomNumber: 3,
    name: 'Sacrificial Blood Ritual Chamber',
    floorIndex: 0,
    floorLabel: 'Basement Crypt (-6m)',
    elevationY: -6.0,
    musicZone: 'BASEMENT_CRYPT',
    surface: 'STONE',
    center: [15.0, -6.0, -46.0],
    bounds: { minX: 6.8, maxX: 23.5, minZ: -54.5, maxZ: -36.5 },
    paintingPos: [22.3, -3.3, -46.0],
    paintingRotY: -Math.PI / 2,
    subtitle: 'Glowing crimson ritual seal, obsidian monoliths & ancient sarcophagi',
    accentColor: '#ef4444',
  },

  // LEVEL 1: GROUND FLOOR MANSION HALLS (Y = 0.0m — Enter across Moat Drawbridge at Z = -36!)
  {
    id: 'foyer_grand',
    roomNumber: 4,
    name: 'Grand Gothic Entrance Foyer & Nave',
    floorIndex: 1,
    floorLabel: 'Ground Floor (0m)',
    elevationY: 0.0,
    musicZone: 'GROUND_HALLS',
    surface: 'STONE',
    center: [0.0, 0.0, -41.5],
    bounds: { minX: -6.8, maxX: 6.8, minZ: -47.0, maxZ: -36.0 },
    paintingPos: [-6.3, 2.7, -41.5],
    paintingRotY: Math.PI / 2,
    subtitle: 'Open iron portcullis entrance from Drawbridge, crimson carpet & Grand Staircase arches',
    accentColor: '#f97316',
  },
  {
    id: 'gallery_portraits',
    roomNumber: 5,
    name: 'Cursed Portrait Gallery (West Wing)',
    floorIndex: 1,
    floorLabel: 'Ground Floor (0m)',
    elevationY: 0.0,
    musicZone: 'GROUND_HALLS',
    surface: 'STONE',
    center: [-15.0, 0.0, -44.0],
    bounds: { minX: -23.5, maxX: -7.0, minZ: -53.5, maxZ: -36.5 },
    paintingPos: [-22.3, 2.7, -43.5],
    paintingRotY: Math.PI / 2,
    subtitle: 'Ornate gold-framed interactive movie paintings & velvet exhibition ropes',
    accentColor: '#f59e0b',
  },
  {
    id: 'chapel_organ',
    roomNumber: 6,
    name: 'Haunted Pipe-Organ Chapel (East Wing)',
    floorIndex: 1,
    floorLabel: 'Ground Floor (0m)',
    elevationY: 0.0,
    musicZone: 'GROUND_HALLS',
    surface: 'STONE',
    center: [15.0, 0.0, -44.0],
    bounds: { minX: 7.0, maxX: 23.5, minZ: -53.5, maxZ: -36.5 },
    paintingPos: [22.3, 2.7, -43.5],
    paintingRotY: -Math.PI / 2,
    subtitle: 'Towering brass cathedral pipe organ, dark oak pews & crimson rose window',
    accentColor: '#a855f7',
  },
  {
    id: 'banquet_blood',
    roomNumber: 7,
    name: 'Blood Banquet Dining Hall (NW Wing)',
    floorIndex: 1,
    floorLabel: 'Ground Floor (0m)',
    elevationY: 0.0,
    musicZone: 'GROUND_HALLS',
    surface: 'STONE',
    center: [-15.0, 0.0, -63.0],
    bounds: { minX: -23.5, maxX: -7.0, minZ: -71.5, maxZ: -54.5 },
    paintingPos: [-15.0, 2.7, -70.3],
    paintingRotY: 0,
    subtitle: 'Long Gothic feast table, silver candelabras, roaring hearth & vampire goblets',
    accentColor: '#ec4899',
  },
  {
    id: 'library_occult',
    roomNumber: 8,
    name: 'Forbidden Occult Library (NE Wing)',
    floorIndex: 1,
    floorLabel: 'Ground Floor (0m)',
    elevationY: 0.0,
    musicZone: 'GROUND_HALLS',
    surface: 'STONE',
    center: [15.0, 0.0, -63.0],
    bounds: { minX: 7.0, maxX: 23.5, minZ: -71.5, maxZ: -54.5 },
    paintingPos: [15.0, 2.7, -70.3],
    paintingRotY: 0,
    subtitle: 'Floor-to-ceiling grimoire bookshelves, levitating tomes & reading lectern',
    accentColor: '#38bdf8',
  },

  // LEVEL 2: UPPER NOBLE FLOOR (Y = +6.0m — Reached via West Grand Staircase!)
  {
    id: 'rotunda_spiral',
    roomNumber: 9,
    name: 'Grand Imperial Staircase & North Gallery',
    floorIndex: 2,
    floorLabel: 'Upper Noble Floor (+6m)',
    elevationY: 6.0,
    musicZone: 'UPPER_NOBLE',
    surface: 'SPIRAL_STAIR',
    center: [0.0, 6.0, -66.5],
    bounds: { minX: -8.0, maxX: 8.0, minZ: -71.5, maxZ: -36.5 },
    paintingPos: [0.0, 8.7, -70.3],
    paintingRotY: 0,
    subtitle: 'Grand Gothic Mezzanine Gallery overlooking the Foyer & connecting to Belfry Attic Stairs',
    accentColor: '#eab308',
  },
  {
    id: 'miriam_lab',
    roomNumber: 10,
    name: "Wicked Witch Miriam's Coven Lab",
    floorIndex: 2,
    floorLabel: 'Upper Noble Floor (+6m)',
    elevationY: 6.0,
    musicZone: 'UPPER_NOBLE',
    surface: 'STONE',
    center: [-15.0, 6.0, -54.0],
    bounds: { minX: -23.5, maxX: -7.5, minZ: -71.5, maxZ: -36.5 },
    paintingPos: [-22.3, 8.7, -54.0],
    paintingRotY: Math.PI / 2,
    subtitle: 'Bubbling emerald witch cauldron, celestial astrolabe & spell apothecary',
    accentColor: '#22c55e',
  },
  {
    id: 'vampire_chamber',
    roomNumber: 11,
    name: 'Master Vampire Bedchamber & Balcony',
    floorIndex: 2,
    floorLabel: 'Upper Noble Floor (+6m)',
    elevationY: 6.0,
    musicZone: 'UPPER_NOBLE',
    surface: 'STONE',
    center: [15.0, 6.0, -54.0],
    bounds: { minX: 7.5, maxX: 23.5, minZ: -71.5, maxZ: -36.5 },
    paintingPos: [22.3, 8.7, -54.0],
    paintingRotY: -Math.PI / 2,
    subtitle: 'Four-poster crimson velvet canopy bed, ornate mirror & Moat overlook',
    accentColor: '#f43f5e',
  },

  // LEVEL 3: CREEPY COBWEBBED ATTIC & CLOCKTOWER BELFRY (Y = +12.0m — Reached via East Belfry Staircase!)
  {
    id: 'attic_belfry',
    roomNumber: 12,
    name: 'Creepy Cobwebbed Attic & Clocktower Belfry',
    floorIndex: 3,
    floorLabel: 'Creepy Attic (+12m)',
    elevationY: 12.0,
    musicZone: 'CREEPY_ATTIC',
    surface: 'WOOD_ATTIC',
    center: [0.0, 12.0, -42.5],
    bounds: { minX: -19.0, maxX: 19.0, minZ: -71.0, maxZ: -36.5 },
    paintingPos: [-15.2, 14.5, -54.0],
    paintingRotY: Math.PI / 2,
    subtitle: 'Pitched timber rafters, backlit Gothic clockface, antique mannequins & swinging bell',
    accentColor: '#c084fc',
  },
];

export const SPARSE_ENCOUNTERS: SparseCharacterEncounter[] = [
  {
    id: 'pumpkin_patch_tank',
    title: "Pumpkin Patch's Armored Tank Assault (Movie War-Rig)",
    subtitle: 'Heavy Armor Backup — Melvin, Tepes & Lil’ Boo Turret Salvo',
    characterIds: ['char_1', 'char_7', 'char_6'],
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_1_portrait.jpg',
    secondaryPortraitUrl: '/generated/comics/pumpkin_patch_v4/char_7_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/panel_165.jpg',
    comicPanelUrl: '/generated/comics/pumpkin_patch_v4/panel_195.jpg',
    comicPageNumber: 15,
    comicPanelId: 'p15_pan3',
    scriptQuote:
      '"I already told you... I don\'t work for government stooges. Lil\' Boo—light up those monsters on the road!"',
    sfxText: 'VRROOOM-CRUNCH! BOOM-BOOM-BOOM!',
    storyIntelSceneTitle:
      'Act II (37:21) — Armored Tank Escape from District 13 & Turret Barrage',
    storyIntelTimecode: '37:21',
    durationMs: 14000,
    badgeColor: '#f97316',
    description:
      'Pumpkin Patch drives his sheet-accurate 3D armored tank down the Castle Approach Road, sweeping its rotary turret and blasting nearby zombies, werewolves, and ghosts!',
  },
  {
    id: 'miriam_monkeys',
    title: 'Wicked Witch Miriam & Her Flying Monkey Army',
    subtitle: 'Aerial Witch Flyover + Cackling Laugh SFX',
    characterIds: ['char_3'],
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_3_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/frame_0630s.jpg',
    comicPanelUrl: '/generated/comics/pumpkin_patch_v4/panel_042.jpg',
    comicPageNumber: 4,
    comicPanelId: 'p4_pan2',
    scriptQuote:
      '"Fly, my winged legions! Tear open the Hexagon portal before Pumpkin Patch reaches the Castle Keep!"',
    sfxText: 'KRA-KOOOM! HAHAHAHA!',
    storyIntelSceneTitle:
      'Act I (10:30) — Miriam & Stitch Confront the Dimensional Portal',
    storyIntelTimecode: '10:30',
    durationMs: 9500,
    badgeColor: '#10b981',
    description:
      '3D rigged Wicked Witch Miriam sweeps across the blood-moon sky between the Haunted Castle spires, flanked by her squadron of winged monkeys.',
  },
  {
    id: 'pumpkin_patch_blades',
    title: 'Pumpkin Patch Materializes with Dual Plasma Blades',
    subtitle: 'Roadside Teleport Ambush & Monster Cleave',
    characterIds: ['char_1'],
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_1_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/frame_0450s.jpg',
    comicPanelUrl: '/generated/comics/pumpkin_patch_v4/panel_155.jpg',
    comicPageNumber: 12,
    comicPanelId: 'p12_pan4',
    scriptQuote:
      '"Looks like you could use a hand on this road. Stand back—my blades burn hotter than Hell!"',
    sfxText: 'FSHHH-CRACKLE! SLASH!',
    storyIntelSceneTitle:
      'Act I (07:30) & Act III (55:21) — Dual Orange Plasma Blades Ignited',
    storyIntelTimecode: '55:21',
    durationMs: 9000,
    badgeColor: '#fb923c',
    description:
      'Melvin Lester ("Pumpkin Patch") materializes in the road with his sheet-accurate 3D rig, ignites dual orange plasma blades, and cleaves roaming monsters.',
  },
  {
    id: 'stitch_scarecrow',
    title: 'Stitch the Scarecrow Stalks the Roadside Corn & Castle',
    subtitle: 'Miriam’s Enforcer Emergence',
    characterIds: ['char_4'],
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_4_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/panel_058.jpg',
    comicPanelUrl: '/generated/comics/pumpkin_patch_v4/panel_096.jpg',
    comicPageNumber: 8,
    comicPanelId: 'p8_pan1',
    scriptQuote:
      '"No traveler passes the Lonesome Crossroads without paying the Scarecrow’s toll..."',
    sfxText: 'SKRRTCH-RUSTLE!',
    storyIntelSceneTitle: 'Act II (28:15) — Stitch Patrols the Outer Perimeter',
    storyIntelTimecode: '28:15',
    durationMs: 8500,
    badgeColor: '#eab308',
    description:
      'Stitch the Scarecrow strides out of the midnight fog with his stitched burlap mask and tattered duster coat.',
  },
  {
    id: 'katrina_crane_patrol',
    title: 'Agent Katrina & Commander Crane (Robo-Bones) Recon',
    subtitle: 'District 13 Tactical Sweep',
    characterIds: ['char_2', 'char_5'],
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_2_portrait.jpg',
    secondaryPortraitUrl: '/generated/comics/pumpkin_patch_v4/char_5_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/frame_0270s.jpg',
    comicPanelUrl: '/generated/comics/pumpkin_patch_v4/panel_122.jpg',
    comicPageNumber: 10,
    comicPanelId: 'p10_pan2',
    scriptQuote:
      '"Scanner locked on dimensional signatures at the Castle Foyer. Keep your tactical beam steady, Katrina."',
    sfxText: 'WHIRRR-CLANK!',
    storyIntelSceneTitle: 'Act I (04:30) — District 13 Containment Briefing',
    storyIntelTimecode: '04:30',
    durationMs: 9000,
    badgeColor: '#38bdf8',
    description:
      '3D rigged Commander Crane (Robo-Bones) and Agent Katrina sweep the crossroads with cybernetic targeting optics.',
  },
  {
    id: 'lil_boo_jar',
    title: 'Lil’ Boo Spectral Recon Drift',
    subtitle: 'Friendly Ghost Companion Illumination',
    characterIds: ['char_6'],
    portraitUrl: '/generated/comics/pumpkin_patch_v4/char_6_portrait.jpg',
    stillUrl: '/generated/comics/pumpkin_patch_v4/panel_140.jpg',
    comicPanelUrl: '/generated/comics/pumpkin_patch_v4/panel_148.jpg',
    comicPageNumber: 11,
    comicPanelId: 'p11_pan3',
    scriptQuote:
      '"Follow the glowing paintings inside the 12 Castle Rooms—each frame holds a portal into the Vault!"',
    sfxText: 'WHOOO-GLIMMER!',
    storyIntelSceneTitle:
      "Act II (25:40) — The Farmhouse Sanctuary & Lil' Boo's Guidance",
    storyIntelTimecode: '25:40',
    durationMs: 8500,
    badgeColor: '#a855f7',
    description:
      "3D rigged Lil' Boo spirals around the directional movie road signs and castle portrait frames.",
  },
];

interface HauntedCastleExhibitionProps {
  onBackToVault: () => void;
  onPlayPumpkinPatch: () => void;
  onSelectArchiveFilm: (film: ArchiveVideo) => void;
  onOpenChatRoom?: () => void;
}

export const HauntedCastleExhibition: React.FC<HauntedCastleExhibitionProps> = ({
  onBackToVault,
  onPlayPumpkinPatch,
  onSelectArchiveFilm,
  onOpenChatRoom,
}) => {
  // Build billboard / road-sign nodes AND map each movie to a Wall Painting inside the 12 Castle Rooms!
  const billboardNodes = useMemo<BillboardMovieNode[]>(() => {
    const ppIntel = getHalloweenStoryIntelBundle(PUMPKIN_PATCH_FILM_ID);
    const foyerRoom = CASTLE_ROOMS[3]; // Room 4: Grand Gothic Entrance Foyer
    const heroNode: BillboardMovieNode = {
      id: PUMPKIN_PATCH_FILM_ID,
      title: 'Pumpkin Patch (2025)',
      year: '2025',
      director: 'Brian James Gage',
      tagline:
        ppIntel?.report?.logline ||
        ppIntel?.logline ||
        'Framed into District 13, Melvin Lester awakens dual plasma blades and his armored tank to rescue President Tepes before Wicked Witch Miriam breaches the human realm.',
      posterUrl: '/covers/halloween/pumpkin-patch-cover.jpg',
      directionLabel: 'CASTLE FOYER & RIFT RIDGE',
      distanceMiles: '0.4 MI N',
      compass: 'NORTH',
      roadZone: 'CASTLE_APPROACH',
      position: [-8.2, 0, -5.5],
      rotationY: 0.28,
      castleRoomId: foyerRoom.id,
      castlePaintingPos: foyerRoom.paintingPos,
      castlePaintingRotY: foyerRoom.paintingRotY,
      isHeroPumpkinPatch: true,
      storyIntel: ppIntel,
    };

    const placements: Array<{
      compass: BillboardMovieNode['compass'];
      roadZone: BillboardMovieNode['roadZone'];
      directionLabel: string;
      distanceMiles: string;
      position: [number, number, number];
      rotationY: number;
      roomIdx: number;
    }> = [
      {
        compass: 'NORTH',
        roadZone: 'CASTLE_APPROACH',
        directionLabel: 'MOAT DRAWBRIDGE APPROACH',
        distanceMiles: '0.2 MI N',
        position: [8.4, 0, -5.5],
        rotationY: -0.28,
        roomIdx: 4, // Room 5: Cursed Portrait Gallery
      },
      {
        compass: 'NORTH',
        roadZone: 'CASTLE_APPROACH',
        directionLabel: 'CASTLE APPROACH RD W',
        distanceMiles: '0.4 MI N',
        position: [-9.2, 0, 7.5],
        rotationY: 0.32,
        roomIdx: 5, // Room 6: Haunted Pipe-Organ Chapel
      },
      {
        compass: 'NORTH',
        roadZone: 'CASTLE_APPROACH',
        directionLabel: 'CASTLE APPROACH RD E',
        distanceMiles: '0.5 MI N',
        position: [9.2, 0, 7.5],
        rotationY: -0.32,
        roomIdx: 6, // Room 7: Blood Banquet Dining Hall
      },
      {
        compass: 'EAST',
        roadZone: 'EAST_HIGHWAY',
        directionLabel: 'PHANTASM HIGHWAY E',
        distanceMiles: '1.1 MI E',
        position: [18.0, 0, 12.5],
        rotationY: -1.18,
        roomIdx: 7, // Room 8: Forbidden Occult Library
      },
      {
        compass: 'EAST',
        roadZone: 'EAST_HIGHWAY',
        directionLabel: 'CARNIVAL PAVILION PKWY',
        distanceMiles: '1.6 MI E',
        position: [28.0, 0, 27.5],
        rotationY: -1.88,
        roomIdx: 0, // Room 1: Torture & Alchemy Crypt
      },
      {
        compass: 'EAST',
        roadZone: 'EAST_HIGHWAY',
        directionLabel: 'TRANS-SIBERIAN RAILS',
        distanceMiles: '2.2 MI E',
        position: [38.0, 0, 12.5],
        rotationY: -1.28,
        roomIdx: 1, // Room 2: Flooded Catacombs
      },
      {
        compass: 'WEST',
        roadZone: 'WEST_GOTHIC_ROAD',
        directionLabel: 'NOSFERATU GOTHIC LN',
        distanceMiles: '1.2 MI W',
        position: [-18.0, 0, 12.5],
        rotationY: 1.18,
        roomIdx: 2, // Room 3: Sacrificial Ritual Chamber
      },
      {
        compass: 'WEST',
        roadZone: 'WEST_GOTHIC_ROAD',
        directionLabel: 'CALIGARI ASYLUM RD',
        distanceMiles: '1.8 MI W',
        position: [-28.0, 0, 27.5],
        rotationY: 1.88,
        roomIdx: 8, // Room 9: Grand Imperial Staircase
      },
      {
        compass: 'WEST',
        roadZone: 'WEST_GOTHIC_ROAD',
        directionLabel: 'HAXAN WITCH WOODS',
        distanceMiles: '2.4 MI W',
        position: [-38.0, 0, 12.5],
        rotationY: 1.28,
        roomIdx: 9, // Room 10: Wicked Witch Miriam's Coven Lab
      },
      {
        compass: 'SOUTH',
        roadZone: 'SOUTH_TURNPIKE',
        distanceMiles: '0.8 MI S',
        directionLabel: 'PUMPKIN PATCH TURNPIKE W',
        position: [-8.5, 0, 32.0],
        rotationY: 0.30,
        roomIdx: 10, // Room 11: Master Vampire Bedchamber
      },
      {
        compass: 'SOUTH',
        roadZone: 'SOUTH_TURNPIKE',
        directionLabel: 'PUMPKIN PATCH TURNPIKE E',
        distanceMiles: '1.1 MI S',
        position: [8.5, 0, 36.0],
        rotationY: -0.30,
        roomIdx: 11, // Room 12: Creepy Cobwebbed Attic (West Wall)
      },
      {
        compass: 'SOUTH',
        roadZone: 'SOUTH_TURNPIKE',
        directionLabel: 'DISTRICT 13 OUTPOST RD',
        distanceMiles: '1.5 MI S',
        position: [-8.8, 0, 46.0],
        rotationY: 0.25,
        roomIdx: 11, // Room 12: Creepy Cobwebbed Attic (East Wall)
      },
    ];

    const filmNodes: BillboardMovieNode[] = CURATED_HALLOWEEN_FILMS.slice(0, 12).map(
      (film, idx) => {
        const p = placements[idx % placements.length];
        const room = CASTLE_ROOMS[p.roomIdx] || CASTLE_ROOMS[0];
        const intel = getHalloweenStoryIntelBundle(film.identifier);
        // For the 12th film sharing the Attic, place its painting on the opposite East gable wall
        const paintingPos: [number, number, number] =
          idx === 11 ? [15.2, 14.5, -54.0] : room.paintingPos;
        const paintingRotY = idx === 11 ? -Math.PI / 2 : room.paintingRotY;

        return {
          id: film.identifier,
          title: film.title,
          year: film.year || 'Classic',
          director: film.director || 'Archive Masterpiece',
          tagline: intel?.report?.logline || intel?.logline || film.description,
          posterUrl:
            film.thumbnailUrl || `https://archive.org/services/img/${film.identifier}`,
          directionLabel: p.directionLabel,
          distanceMiles: p.distanceMiles || `${(0.8 + idx * 0.3).toFixed(1)} MI`,
          compass: p.compass,
          roadZone: p.roadZone,
          position: p.position,
          rotationY: p.rotationY,
          castleRoomId: room.id,
          castlePaintingPos: paintingPos,
          castlePaintingRotY: paintingRotY,
          archiveFilm: film,
          storyIntel: intel,
        };
      }
    );

    return [heroNode, ...filmNodes];
  }, []);

  // Exhibition, Castle Exploration & Grindhouse Combat State
  const [selectedBillboardId, setSelectedBillboardId] = useState<string>(PUMPKIN_PATCH_FILM_ID);
  const [activeEncounter, setActiveEncounter] = useState<SparseCharacterEncounter | null>(null);
  const [autoSparseMode, setAutoSparseMode] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [musicEnabled, setMusicEnabled] = useState<boolean>(true);
  const [grindhouseLook, setGrindhouseLook] = useState<boolean>(false);
  const [survivorGender, setSurvivorGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [pumpkinHelperActive, setPumpkinHelperActive] = useState<boolean>(true);
  const pumpkinHelperActiveRef = useRef<boolean>(pumpkinHelperActive);
  pumpkinHelperActiveRef.current = pumpkinHelperActive;
  const [cameraMode, setCameraMode] = useState<'THIRD_PERSON' | 'WAYPOINT_VIEW'>('THIRD_PERSON');
  const [showStoryIntelDrawer, setShowStoryIntelDrawer] = useState<boolean>(false);
  const [storyIntelTab, setStoryIntelTab] = useState<
    'COUNCIL_SHEETS' | 'ACTS' | 'CHARACTERS' | 'COMIC_PANELS'
  >('COUNCIL_SHEETS');
  const [selectedComicPageIdx, setSelectedComicPageIdx] = useState<number>(0);
  const [showSidePanels, setShowSidePanels] = useState<boolean>(true);
  const [showCastleMapModal, setShowCastleMapModal] = useState<boolean>(false);

  // Multi-Level Castle Room & Engine Telemetry State
  const [currentRoom, setCurrentRoom] = useState<CastleRoomDefinition | null>(null);
  const [currentFloorIdx, setCurrentFloorIdx] = useState<number>(1); // 0=Crypt, 1=Ground, 2=Upper, 3=Attic
  const [fpsCount, setFpsCount] = useState<number>(60);
  const [glbLoadedCount, setGlbLoadedCount] = useState<number>(0);
  const [councilLens, setCouncilLens] = useState<CastleCouncilLensId>('RAVENCREST_REFERENCE');
  const councilLensRef = useRef<CastleCouncilLensId>(councilLens);
  councilLensRef.current = councilLens;

  // Bushido Blade + Fortnite Fluid Combat & Movement HUD State
  const [bushidoStance, setBushidoStance] = useState<'HIGH' | 'MID' | 'LOW'>('MID');
  const [comboStep, setComboStep] = useState<number>(1);
  const [riposteCharged, setRiposteCharged] = useState<boolean>(false);
  const [combatCallout, setCombatCallout] = useState<{
    text: string;
    color: string;
    id: number;
  } | null>(null);
  const [playerHp, setPlayerHp] = useState<number>(100);
  const [playerMaxHp, setPlayerMaxHp] = useState<number>(100);
  const [playerXp, setPlayerXp] = useState<number>(0);
  const [playerLevel, setPlayerLevel] = useState<number>(1);
  const [rewardPopups, setRewardPopups] = useState<
    Array<{ id: number; xp: number; hp: number; label: string; color: string }>
  >([]);
  const [councilVoiceEnabled, setCouncilVoiceEnabled] = useState<boolean>(false);
  const councilVoiceEnabledRef = useRef<boolean>(false);
  councilVoiceEnabledRef.current = councilVoiceEnabled;
  const [artCouncilNote, setArtCouncilNote] = useState<string>(
    '🎨 ART COUNCIL (Søren & Rembrandt): "Ravencrest approach road active — wet specular asphalt, 3-lamp gooseneck billboards, and Mie-scattered moonlight diffusing through rolling ground fog."'
  );
  const [gameCouncilNote, setGameCouncilNote] = useState<string>(
    '🎮 GAME COUNCIL (Elena & Hideo): "Jack Thorne & Elise Carter high-poly rigs online with personality-driven katana/bat stances. Slay creatures of the fog to earn +XP, Level-Ups & +HP Leech!"'
  );
  const [monstersSlain, setMonstersSlain] = useState<number>(0);
  const [activeMonsterCount, setActiveMonsterCount] = useState<number>(8);
  const [combatLogText, setCombatLogText] = useState<string>(
    '🛣️ RAVENCREST — 12 MILES: Follow the wet moonlit highway past the Ravencrest billboards, cross the Moat Drawbridge, and enter Ravencrest Castle!'
  );

  const announceCouncilDirective = useCallback(
    (artMsg?: string, gameMsg?: string, speakText?: string) => {
      if (artMsg) setArtCouncilNote(artMsg);
      if (gameMsg) setGameCouncilNote(gameMsg);
      if (
        councilVoiceEnabledRef.current &&
        typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        speakText
      ) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(speakText);
          utter.rate = 1.04;
          utter.pitch = 0.92;
          utter.volume = 0.75;
          window.speechSynthesis.speak(utter);
        } catch {}
      }
    },
    []
  );

  const selectedNode = useMemo(
    () => billboardNodes.find((n) => n.id === selectedBillboardId) || billboardNodes[0],
    [billboardNodes, selectedBillboardId]
  );

  const pumpkinPatchCharacters = useMemo<HalloweenCharacterWithActor[]>(
    () => getCharactersForFilm(PUMPKIN_PATCH_FILM_ID),
    []
  );

  // Refs for Three.js & Player / Combat / Tank / Castle Physics state
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraModeRef = useRef<'THIRD_PERSON' | 'WAYPOINT_VIEW'>(cameraMode);
  cameraModeRef.current = cameraMode;
  const survivorGenderRef = useRef<'MALE' | 'FEMALE'>(survivorGender);
  survivorGenderRef.current = survivorGender;
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const bushidoStanceRef = useRef<'HIGH' | 'MID' | 'LOW'>(bushidoStance);
  bushidoStanceRef.current = bushidoStance;

  const cameraTargetPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 4.4, 58.5));
  const cameraLookAtTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 4.2, -22));

  // Player 3D Physics & Bushido Blade / Fortnite action state shared with the 60fps loop
  const playerStateRef = useRef<{
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    yaw: number;
    pitch: number;
    targetFloorY: number;
    onSpiralStairs: boolean;
    isMoving: boolean;
    isSprinting: boolean;
    footstepCooldown: number;
    batSwingTimer: number;
    swingDuration: number;
    comboIndex: number;
    comboResetTimer: number;
    parryWindowTimer: number;
    riposteEmpowerTimer: number;
    dodgeDashTimer: number;
    dodgeDirX: number;
    dodgeDirZ: number;
    hitStopTimer: number;
    cameraShakeTimer: number;
    molotovThrowQueue: number;
    hp: number;
    maxHp: number;
    xp: number;
    level: number;
    kills: number;
  }>({
    x: 0,
    y: 0,
    z: 52.0, // Start way out on the South Pumpkin Patch Highway facing North toward Crossroads, Moat Bridge & Castle!
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0, // 0 = facing North (-Z toward the Haunted Castle)
    pitch: 0.08,
    targetFloorY: 0,
    onSpiralStairs: false,
    isMoving: false,
    isSprinting: false,
    footstepCooldown: 0,
    batSwingTimer: 0,
    swingDuration: 0.34,
    comboIndex: 0,
    comboResetTimer: 0,
    parryWindowTimer: 0,
    riposteEmpowerTimer: 0,
    dodgeDashTimer: 0,
    dodgeDirX: 0,
    dodgeDirZ: -1,
    hitStopTimer: 0,
    cameraShakeTimer: 0,
    molotovThrowQueue: 0,
    hp: 100,
    maxHp: 100,
    xp: 0,
    level: 1,
    kills: 0,
  });

  const activeEncounterRef = useRef<SparseCharacterEncounter | null>(null);
  activeEncounterRef.current = activeEncounter;
  const encounterStartTimeRef = useRef<number>(0);

  // Sync audio & music state
  useEffect(() => {
    halloweenAudio.setMuted(!soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    halloweenAudio.setMusicEnabled(musicEnabled);
  }, [musicEnabled]);

  useEffect(() => {
    // Start Gothic Castle Organ & Dark Drone music on mount (resumes automatically on first click/key)
    halloweenAudio.startGothicCastleMusic('CROSSROADS');
    return () => {
      halloweenAudio.stopGothicCastleMusic();
    };
  }, []);

  // Teleport Player directly into any of the 12 Castle Rooms or Crossroads Road
  const teleportToCastleRoom = useCallback((room: CastleRoomDefinition | 'CROSSROADS') => {
    const p = playerStateRef.current;
    if (room === 'CROSSROADS') {
      p.x = 0;
      p.y = 0;
      p.z = 52.0;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.targetFloorY = 0;
      p.yaw = 0;
      setCurrentRoom(null);
      setCurrentFloorIdx(1);
      setCameraMode('THIRD_PERSON');
      halloweenAudio.setGothicMusicZone('CROSSROADS');
      halloweenAudio.playFootstepSfx('ASPHALT', true);
      setCombatLogText('🛣️ Teleported to The Lonesome Crossroads (Outside Castle Gate).');
      return;
    }

    p.x = room.center[0];
    p.y = room.elevationY;
    p.z = room.center[2];
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.targetFloorY = room.elevationY;
    p.yaw = room.paintingRotY + Math.PI; // Face toward the room's wall painting
    setCurrentRoom(room);
    setCurrentFloorIdx(room.floorIndex);
    setCameraMode('THIRD_PERSON');
    halloweenAudio.setGothicMusicZone(room.musicZone);
    halloweenAudio.playFootstepSfx(room.surface, true);

    // Also auto-select the movie painting hanging in this room!
    const roomMovie = billboardNodes.find((n) => n.castleRoomId === room.id);
    if (roomMovie) {
      setSelectedBillboardId(roomMovie.id);
    }
    setCombatLogText(
      `🏰 Entered Room #${room.roomNumber}: ${room.name} [${room.floorLabel}] — Click the Wall Painting to watch!`
    );
  }, [billboardNodes]);

  // Trigger a sparse character encounter (including Pumpkin Patch's Armored Tank!)
  const triggerEncounter = useCallback((encounterId?: PumpkinPatchEncounterId) => {
    const chosen = encounterId
      ? SPARSE_ENCOUNTERS.find((e) => e.id === encounterId) || SPARSE_ENCOUNTERS[0]
      : SPARSE_ENCOUNTERS[Math.floor(Math.random() * SPARSE_ENCOUNTERS.length)];

    encounterStartTimeRef.current = performance.now();
    setActiveEncounter(chosen);

    if (chosen.id === 'pumpkin_patch_tank') {
      halloweenAudio.playTankArrivalSfx();
      setCombatLogText(
        "🛡️ PUMPKIN PATCH ARRIVED IN HIS ARMORED WAR-RIG TANK! Turret cannons locking onto monsters!"
      );
    } else if (chosen.id === 'miriam_monkeys') {
      halloweenAudio.playWitchLaughAndMonkeys();
    } else if (chosen.id === 'pumpkin_patch_blades') {
      halloweenAudio.playPlasmaBladesAppear();
      setCombatLogText(
        '⚔️ PUMPKIN PATCH MATERIALIZED WITH DUAL ORANGE PLASMA BLADES! Cleaving nearby monsters!'
      );
    } else if (chosen.id === 'lil_boo_jar') {
      halloweenAudio.playGhostScreamSfx();
      void halloweenAudio.playRealCharacterMovieVoice('char_6', 5.0, 0.72);
    } else if (chosen.id === 'stitch_scarecrow') {
      halloweenAudio.playBatSwarmSfx();
      void halloweenAudio.playRealCharacterMovieVoice('char_4', 5.5, 0.75);
    } else if (chosen.id === 'katrina_crane_patrol') {
      halloweenAudio.playFlashlightClick();
      void halloweenAudio.playRealCharacterMovieVoice('char_2', 5.5, 0.75);
    }
  }, []);

  // Periodic automatic sparse encounters
  useEffect(() => {
    if (!autoSparseMode) return;
    const initTimer = window.setTimeout(() => {
      triggerEncounter('pumpkin_patch_tank');
    }, 3500);

    const interval = window.setInterval(() => {
      if (!activeEncounterRef.current) {
        triggerEncounter();
      }
    }, 24000);

    return () => {
      window.clearTimeout(initTimer);
      window.clearInterval(interval);
    };
  }, [autoSparseMode, triggerEncounter]);

  // Auto-clear encounter when duration expires
  useEffect(() => {
    if (!activeEncounter) return;
    const timer = window.setTimeout(() => {
      setActiveEncounter(null);
    }, activeEncounter.durationMs);
    return () => window.clearTimeout(timer);
  }, [activeEncounter]);

  // Bushido Blade Stance Switcher
  const cycleBushidoStance = useCallback((nextStance?: 'HIGH' | 'MID' | 'LOW') => {
    setBushidoStance((prev) => {
      const target =
        nextStance || (prev === 'MID' ? 'HIGH' : prev === 'HIGH' ? 'LOW' : 'MID');
      bushidoStanceRef.current = target;
      const stanceLabels = {
        HIGH: '🔥 HIGH STANCE (Jōdan — Overhead Lethal Execution)',
        MID: '⚡ MID STANCE (Chūdan — Wide Cleave & Guard Balance)',
        LOW: '🌪️ LOW STANCE (Gedan — Lunging Dash & Leg Sweep)',
      };
      setCombatLogText(`Stance Switched: ${stanceLabels[target]}`);
      return target;
    });
  }, []);

  // Trigger Bushido Blade Guard Parry / Deflect
  const triggerBushidoParry = useCallback(() => {
    const p = playerStateRef.current;
    if (p.parryWindowTimer <= 0) {
      p.parryWindowTimer = 0.48;
      halloweenAudio.playParryClangSfx();
      setCombatCallout({
        text: '🛡️ BUSHIDO PARRY GUARD!',
        color: '#38bdf8',
        id: Date.now(),
      });
      setCombatLogText(
        '🛡️ Bushido Blade Guard raised (0.48s Deflect Window)! Any monster strike triggers an instant Lethal Riposte!'
      );
    }
  }, []);

  // Trigger Fortnite-style Kinetic Dodge-Dash
  const triggerKineticDash = useCallback((dirX = 0, dirZ = -1) => {
    const p = playerStateRef.current;
    if (p.dodgeDashTimer <= 0) {
      p.dodgeDashTimer = 0.24;
      const len = Math.hypot(dirX, dirZ) || 1;
      p.dodgeDirX = dirX / len;
      p.dodgeDirZ = dirZ / len;
      halloweenAudio.playBatSwingSfx(false);
      setCombatCallout({
        text: '💨 KINETIC DASH!',
        color: '#a855f7',
        id: Date.now(),
      });
    }
  }, []);

  // Player Combat Actions (Fluid 3-Hit Bushido Blade Stance Combo & Molotov Cocktail)
  const triggerBatAttack = useCallback(() => {
    const p = playerStateRef.current;
    if (p.batSwingTimer <= 0.08) {
      const nextCombo = p.comboResetTimer > 0 ? (p.comboIndex % 3) + 1 : 1;
      p.comboIndex = nextCombo;
      const dur = nextCombo === 3 ? 0.42 : 0.30;
      p.swingDuration = dur;
      p.batSwingTimer = dur;
      p.comboResetTimer = 1.35;
      setComboStep(nextCombo);

      // Forward combat lunge impulse (Bushido Blade footwork)
      const lungeSpeed =
        bushidoStanceRef.current === 'LOW' ? 9.5 : nextCombo === 3 ? 7.5 : 4.5;
      p.vx += -Math.sin(p.yaw) * lungeSpeed;
      p.vz += -Math.cos(p.yaw) * lungeSpeed;

      if (bushidoStanceRef.current === 'HIGH' || nextCombo === 3) {
        halloweenAudio.playKatanaSlashSfx(false, nextCombo === 3);
      } else {
        halloweenAudio.playBatSwingSfx(false);
      }
    }
  }, []);

  const triggerMolotovThrow = useCallback(() => {
    playerStateRef.current.molotovThrowQueue += 1;
    halloweenAudio.playBatSwingSfx(false);
  }, []);

  // Update camera target when user clicks a billboard or castle painting in Waypoint mode
  const focusBillboardCamera = useCallback((node: BillboardMovieNode, preferCastlePainting = false) => {
    setSelectedBillboardId(node.id);
    if (preferCastlePainting && node.castlePaintingPos) {
      const [px, py, pz] = node.castlePaintingPos;
      const rot = node.castlePaintingRotY || 0;
      const normalX = Math.sin(rot);
      const normalZ = Math.cos(rot);
      cameraTargetPosRef.current.set(px + normalX * 4.2, py + 0.3, pz + normalZ * 4.2);
      cameraLookAtTargetRef.current.set(px, py + 0.2, pz);
      return;
    }
    const [bx, by, bz] = node.position;
    const normalX = Math.sin(node.rotationY);
    const normalZ = Math.cos(node.rotationY);
    cameraTargetPosRef.current.set(bx + normalX * 7.8, by + 3.4, bz + normalZ * 7.8);
    cameraLookAtTargetRef.current.set(bx, by + 3.5, bz);
  }, []);

  // ============================================================================
  // TUNED 60-FPS THREE.JS GAME ENGINE + 12-ROOM CASTLE MANSION + SHEET-ACCURATE GLBS
  // ============================================================================
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090614');
    scene.fog = new THREE.FogExp2('#0c071b', 0.0052);

    const camera = new THREE.PerspectiveCamera(54, width / height, 0.15, 340);
    camera.position.set(0, 4.4, 58.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.48;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // ==========================================================================
    // 0A. GAME PRODUCTION COUNCIL POST-PROCESSING (EffectComposer + UnrealBloom)
    // ==========================================================================
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.48,
      0.55,
      0.62
    );
    composer.addPass(bloomPass);
    // Bloom works in linear HDR; tone mapping and display conversion belong last.
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    // Shared GPU Wind & Shader Time Uniform (updated at 60 FPS)
    const windTimeUniform = { value: 0.0 };

    /**
     * Attaches a custom GLSL Vertex Wind-Sway / Cloth-Billow Shader to any PBR Material
     * so trees, ferns, roadside grass, and castle velvet window curtains blow in the wind!
     */
    const applyWindSwayShader = (
      mat: THREE.Material,
      mode: 'TREE_CANOPY' | 'FERN_PLANT' | 'VELVET_CURTAIN' = 'FERN_PLANT'
    ) => {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uWindTime = windTimeUniform;
        shader.vertexShader =
          `uniform float uWindTime;\n` +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            mode === 'VELVET_CURTAIN'
              ? `
                #include <begin_vertex>
                float hangFactor = clamp((2.05 - position.y) / 4.1, 0.0, 1.0);
                float curtainWave = sin(uWindTime * 2.3 + position.y * 2.8 + position.x * 3.5) * 0.24 * hangFactor;
                float curtainRipple = cos(uWindTime * 4.1 + position.x * 6.0 - position.y * 3.2) * 0.09 * hangFactor;
                transformed.z += curtainWave + curtainRipple;
                transformed.x += sin(uWindTime * 1.9 + position.y * 2.1) * 0.08 * hangFactor;
              `
              : mode === 'TREE_CANOPY'
              ? `
                #include <begin_vertex>
                float hFactor = clamp(position.y / 3.5, 0.0, 1.5);
                float gust = sin(uWindTime * 1.65 + position.x * 0.45 + position.z * 0.45) * 0.22 * hFactor * hFactor;
                float leafFlutter = cos(uWindTime * 4.8 + position.x * 3.2 + position.y * 2.7) * 0.055 * hFactor;
                transformed.x += gust + leafFlutter;
                transformed.z += gust * 0.65 - leafFlutter;
              `
              : `
                #include <begin_vertex>
                float fFactor = clamp((position.y + 0.1) * 1.2, 0.0, 1.2);
                float sway = sin(uWindTime * 2.6 + position.x * 1.8 + position.z * 1.8) * 0.16 * fFactor;
                transformed.x += sway;
                transformed.z += cos(uWindTime * 2.2 + position.z * 2.1) * 0.12 * fFactor;
              `
          );
      };
      mat.needsUpdate = true;
    };

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');

    const loadPbrTexSet = (
      colorUrl: string,
      normUrl: string,
      roughUrl: string,
      rx: number,
      ry: number
    ) => {
      const wrapAndRepeat = (t: THREE.Texture, isSrgb: boolean) => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(rx, ry);
        t.colorSpace = isSrgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return t;
      };
      const map = wrapAndRepeat(textureLoader.load(colorUrl), true);
      const normalMap = wrapAndRepeat(textureLoader.load(normUrl), false);
      const roughnessMap = wrapAndRepeat(textureLoader.load(roughUrl), false);
      return { map, normalMap, roughnessMap };
    };

    // Photographic IBL Environment Map from `sky_dome_grindhouse.png` ("lighting sources from photos")
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const skyDomeTex = textureLoader.load(
      '/models/halloween/plates/sky_dome_grindhouse.png',
      (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        const envRT = pmremGenerator.fromEquirectangular(tex);
        scene.environment = envRT.texture;
        scene.environmentIntensity = CASTLE_COUNCIL_LENSES.find(
          (lens) => lens.id === councilLensRef.current
        )!.envIntensity;
      }
    );
    skyDomeTex.colorSpace = THREE.SRGBColorSpace;

    const horizonPlateTex = textureLoader.load(
      '/models/halloween/plates/castle_horizon_plate.png'
    );
    horizonPlateTex.colorSpace = THREE.SRGBColorSpace;
    horizonPlateTex.wrapS = THREE.RepeatWrapping;
    horizonPlateTex.repeat.set(3, 1);

    const masterCrossroadsPlateTex = textureLoader.load(
      '/models/halloween/plates/haunted_crossroads_master_plate.png'
    );
    masterCrossroadsPlateTex.colorSpace = THREE.SRGBColorSpace;

    // Load Extracted RAVENCREST Master PBR Texture Sets (Color + Normal + Roughness from Hallowen Showcase assets.zip!)
    const asphaltPbr = loadPbrTexSet(
      '/models/halloween/textures/asphalt_road.png',
      '/models/halloween/textures/normals/asphalt_road_normal.png',
      '/models/halloween/textures/normals/asphalt_road_rough.png',
      4,
      24
    );
    const castleStonePbr = loadPbrTexSet(
      '/models/halloween/ravencrest/stone_wall.png',
      '/models/halloween/ravencrest/stone_wall_normal.png',
      '/models/halloween/ravencrest/stone_wall_roughness.png',
      10,
      6
    );
    const gothicBrickPbr = loadPbrTexSet(
      '/models/halloween/ravencrest/stone_wall.png',
      '/models/halloween/ravencrest/stone_wall_normal.png',
      '/models/halloween/ravencrest/stone_wall_roughness.png',
      7,
      5
    );
    const darkMarblePbr = loadPbrTexSet(
      '/models/halloween/ravencrest/stone_floor.png',
      '/models/halloween/ravencrest/stone_floor_normal.png',
      '/models/halloween/ravencrest/stone_floor_roughness.png',
      8,
      8
    );
    const woodFloorPbr = loadPbrTexSet(
      '/models/halloween/ravencrest/wood_planks.png',
      '/models/halloween/ravencrest/wood_planks_normal.png',
      '/models/halloween/ravencrest/wood_planks_roughness.png',
      6,
      6
    );
    const oakWoodPbr = loadPbrTexSet(
      '/models/halloween/ravencrest/wood_beam.png',
      '/models/halloween/ravencrest/wood_beam_normal.png',
      '/models/halloween/ravencrest/wood_beam_roughness.png',
      4,
      2
    );
    const velvetCurtainPbr = loadPbrTexSet(
      '/models/halloween/ravencrest/velvet_fabric.png',
      '/models/halloween/ravencrest/velvet_fabric_normal.png',
      '/models/halloween/ravencrest/velvet_fabric_roughness.png',
      2,
      2
    );
    const ravencrestCarpetPbr = loadPbrTexSet(
      '/models/halloween/ravencrest/carpet_rug.png',
      '/models/halloween/ravencrest/carpet_rug_normal.png',
      '/models/halloween/ravencrest/carpet_rug_roughness.png',
      1,
      4
    );
    const forestGroundPbr = loadPbrTexSet(
      '/models/halloween/textures/forest_ground.png',
      '/models/halloween/textures/normals/forest_ground_normal.png',
      '/models/halloween/textures/normals/forest_ground_rough.png',
      28,
      28
    );

    // ==========================================================================
    // 0B. MULTI-LAYERED SKY DOME, CURVED 360° HORIZON CYCLORAMA, HARVEST MOON
    //     & GLSL DIMENSIONAL RIFT AURORA SHADER
    // ==========================================================================
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(240, 40, 28),
      new THREE.MeshBasicMaterial({
        map: skyDomeTex,
        side: THREE.BackSide,
        fog: false,
      })
    );
    scene.add(skyDome);

    const horizonCyclorama = new THREE.Mesh(
      new THREE.CylinderGeometry(185, 185, 85, 64, 1, true),
      new THREE.MeshBasicMaterial({
        map: horizonPlateTex,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.88,
        fog: false,
      })
    );
    horizonCyclorama.position.set(0, 32, -15);
    scene.add(horizonCyclorama);

    const northernVistaPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 96),
      new THREE.MeshBasicMaterial({
        map: masterCrossroadsPlateTex,
        transparent: true,
        opacity: 0.72,
        fog: false,
      })
    );
    northernVistaPlate.position.set(0, 42, -135);
    scene.add(northernVistaPlate);

    const moonGroup = new THREE.Group();
    moonGroup.position.set(-34, 68, -118);
    const harvestMoon = new THREE.Mesh(
      new THREE.SphereGeometry(14.5, 32, 32),
      new THREE.MeshBasicMaterial({ color: '#ffb84d', fog: false })
    );
    moonGroup.add(harvestMoon);
    const moonHaloInner = new THREE.Mesh(
      new THREE.RingGeometry(14.8, 24.5, 48),
      new THREE.MeshBasicMaterial({
        color: '#ff7b00',
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
        fog: false,
      })
    );
    moonHaloInner.lookAt(0, 2, 16);
    moonGroup.add(moonHaloInner);
    const moonHaloOuter = new THREE.Mesh(
      new THREE.RingGeometry(24.5, 42.0, 48),
      new THREE.MeshBasicMaterial({
        color: '#a855f7',
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        fog: false,
      })
    );
    moonHaloOuter.lookAt(0, 2, 16);
    moonGroup.add(moonHaloOuter);
    scene.add(moonGroup);

    const riftAuroraMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: windTimeUniform,
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 pos = position;
          pos.y += sin(pos.x * 0.06 + uTime * 0.9) * 3.8;
          pos.z += cos(pos.x * 0.04 - uTime * 0.7) * 2.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        void main() {
          float wave = sin(vUv.x * 16.0 + uTime * 1.4) * 0.5 + 0.5;
          float band = smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
          vec3 emerald = vec3(0.12, 0.95, 0.68);
          vec3 violet = vec3(0.68, 0.25, 0.98);
          vec3 col = mix(emerald, violet, wave);
          float alpha = band * (0.28 + 0.18 * sin(vUv.x * 9.0 - uTime * 1.8));
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const riftAuroraMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(175, 26, 48, 8),
      riftAuroraMat
    );
    riftAuroraMesh.position.set(12, 74, -88);
    riftAuroraMesh.rotation.x = Math.PI * 0.22;
    scene.add(riftAuroraMesh);

    const emberGeo = new THREE.BufferGeometry();
    const emberCount = 550;
    const emberPositions = new Float32Array(emberCount * 3);
    const emberColors = new Float32Array(emberCount * 3);
    for (let i = 0; i < emberCount; i++) {
      emberPositions[i * 3] = (Math.random() - 0.5) * 120;
      emberPositions[i * 3 + 1] = Math.random() * 28 - 4;
      emberPositions[i * 3 + 2] = (Math.random() - 0.5) * 130 - 15;
      const isEmerald = i % 3 === 0;
      emberColors[i * 3] = isEmerald ? 0.2 : 1.0;
      emberColors[i * 3 + 1] = isEmerald ? 0.95 : 0.58;
      emberColors[i * 3 + 2] = isEmerald ? 0.68 : 0.15;
    }
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
    emberGeo.setAttribute('color', new THREE.BufferAttribute(emberColors, 3));
    const emberParticles = new THREE.Points(
      emberGeo,
      new THREE.PointsMaterial({
        size: 0.34,
        vertexColors: true,
        transparent: true,
        opacity: 0.82,
      })
    );
    scene.add(emberParticles);

    // ==========================================================================
    // 0C. CONSOLE-GRADE LIGHTING ARCHITECTURE (ZERO DARK ROOMS! FULL IBL + CHANDELIERS)
    // ==========================================================================
    const ambientLight = new THREE.AmbientLight('#49386b', 1.25);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight('#9d82e8', '#422c1d', 1.95);
    scene.add(hemiLight);

    const moonLight = new THREE.DirectionalLight('#ffdfc2', 2.95);
    moonLight.position.set(-32, 64, -28);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 2048;
    moonLight.shadow.mapSize.height = 2048;
    moonLight.shadow.camera.near = 5;
    moonLight.shadow.camera.far = 175;
    const d = 62;
    moonLight.shadow.camera.left = -d;
    moonLight.shadow.camera.right = d;
    moonLight.shadow.camera.top = d;
    moonLight.shadow.camera.bottom = -d;
    scene.add(moonLight);

    const crossroadsCenterLight = new THREE.PointLight('#ffaa44', 5.5, 48, 1.1);
    crossroadsCenterLight.position.set(0, 6.5, 4.0);
    scene.add(crossroadsCenterLight);

    const cryptChandelierLight = new THREE.PointLight('#2dd4bf', 6.8, 52, 1.05);
    cryptChandelierLight.position.set(0, -1.5, -40.0);
    scene.add(cryptChandelierLight);

    const groundHallChandelierLight = new THREE.PointLight('#ffbe6b', 9.2, 58, 1.0);
    groundHallChandelierLight.position.set(0, 4.8, -38.0);
    scene.add(groundHallChandelierLight);

    const upperNobleChandelierLight = new THREE.PointLight('#ffb066', 8.4, 54, 1.05);
    upperNobleChandelierLight.position.set(0, 10.8, -40.0);
    scene.add(upperNobleChandelierLight);

    const atticBelfryChandelierLight = new THREE.PointLight('#ff9838', 7.5, 50, 1.05);
    atticBelfryChandelierLight.position.set(0, 16.8, -38.0);
    scene.add(atticBelfryChandelierLight);

    const playerTorchLight = new THREE.PointLight('#ffb866', 6.2, 32, 1.15);
    playerTorchLight.position.set(0, 2.8, 16.5);
    scene.add(playerTorchLight);

    const actionDynamicLight = new THREE.PointLight('#ff5500', 0.0, 32, 1.3);
    actionDynamicLight.position.set(0, 3.0, 0);
    scene.add(actionDynamicLight);

    // ==========================================================================
    // SHARED NORMAL-MAPPED & ROUGHNESS-MAPPED PHOTOGRAPHIC PBR MATERIALS
    // ==========================================================================
    const stoneWallMat = new THREE.MeshStandardMaterial({
      map: castleStonePbr.map,
      normalMap: castleStonePbr.normalMap,
      normalScale: new THREE.Vector2(1.45, 1.45),
      roughnessMap: castleStonePbr.roughnessMap,
      color: '#9c92ad',
      roughness: 0.74,
      metalness: 0.08,
    });
    const gothicBrickMat = new THREE.MeshStandardMaterial({
      map: gothicBrickPbr.map,
      normalMap: gothicBrickPbr.normalMap,
      normalScale: new THREE.Vector2(1.35, 1.35),
      roughnessMap: gothicBrickPbr.roughnessMap,
      color: '#8f7d8a',
      roughness: 0.76,
      metalness: 0.06,
    });
    const darkTrimMat = new THREE.MeshStandardMaterial({
      color: '#2a2238',
      roughness: 0.42,
      metalness: 0.65,
    });
    const woodRafterMat = new THREE.MeshStandardMaterial({
      map: oakWoodPbr.map,
      normalMap: oakWoodPbr.normalMap,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughnessMap: oakWoodPbr.roughnessMap,
      color: '#966b49',
      roughness: 0.68,
      metalness: 0.06,
    });
    const woodPlankFloorMat = new THREE.MeshStandardMaterial({
      map: woodFloorPbr.map,
      normalMap: woodFloorPbr.normalMap,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughnessMap: woodFloorPbr.roughnessMap,
      color: '#8c6244',
      roughness: 0.54,
      metalness: 0.1,
    });
    const marbleFloorMat = new THREE.MeshStandardMaterial({
      map: darkMarblePbr.map,
      normalMap: darkMarblePbr.normalMap,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughnessMap: darkMarblePbr.roughnessMap,
      color: '#6b7688',
      roughness: 0.14,
      metalness: 0.36,
    });
    const cryptWaterMat = new THREE.MeshStandardMaterial({
      normalMap: darkMarblePbr.normalMap,
      normalScale: new THREE.Vector2(0.65, 0.65),
      color: '#0d3b49',
      roughness: 0.06,
      metalness: 0.90,
      emissive: new THREE.Color('#094c5e'),
      emissiveIntensity: 0.45,
    });
    const redCarpetMat = new THREE.MeshStandardMaterial({
      map: ravencrestCarpetPbr.map,
      normalMap: ravencrestCarpetPbr.normalMap,
      normalScale: new THREE.Vector2(1.2, 1.2),
      color: '#b82538',
      roughness: 0.58,
      emissive: new THREE.Color('#3b0712'),
      emissiveIntensity: 0.24,
    });
    const velvetCurtainMat = new THREE.MeshStandardMaterial({
      map: velvetCurtainPbr.map,
      normalMap: velvetCurtainPbr.normalMap,
      normalScale: new THREE.Vector2(1.35, 1.35),
      color: '#b81d3d',
      roughness: 0.62,
      metalness: 0.08,
      emissive: new THREE.Color('#420816'),
      emissiveIntensity: 0.32,
      side: THREE.DoubleSide,
    });
    applyWindSwayShader(velvetCurtainMat, 'VELVET_CURTAIN');

    const goldFrameMat = new THREE.MeshStandardMaterial({
      color: '#facc15',
      roughness: 0.22,
      metalness: 0.92,
      emissive: new THREE.Color('#854d0e'),
      emissiveIntensity: 0.38,
    });

    // ==========================================================================
    // 1. EXTERIOR TERRAIN, PUMPKIN PATCH HIGHWAY (`Z = +68` TO `-12`),
    //    DEEP SUBTERRANEAN WATER MOAT (`Z = -12` TO `-36`), ARCHED GOTHIC STONE
    //    DRAWBRIDGE, AND JACK-O'-LANTERNS!
    // ==========================================================================
    interface AABBCollider {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      minY: number;
      maxY: number;
    }
    const worldColliders: AABBCollider[] = [];
    const registerBoxCollider = (
      cx: number,
      cy: number,
      cz: number,
      w: number,
      h: number,
      d: number
    ) => {
      worldColliders.push({
        minX: cx - w * 0.5,
        maxX: cx + w * 0.5,
        minZ: cz - d * 0.5,
        maxZ: cz + d * 0.5,
        minY: cy - h * 0.5,
        maxY: cy + h * 0.5,
      });
    };

    const groundMat = new THREE.MeshStandardMaterial({
      map: forestGroundPbr.map,
      normalMap: forestGroundPbr.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughnessMap: forestGroundPbr.roughnessMap,
      color: '#5c4e6b',
      roughness: 0.86,
      metalness: 0.05,
    });

    // South Mainland Terrain (`Z = -12` to `Z = +90`)
    const southGround = new THREE.Mesh(new THREE.PlaneGeometry(240, 102), groundMat);
    southGround.rotation.x = -Math.PI / 2;
    southGround.position.set(0, -0.02, 39.0);
    southGround.receiveShadow = true;
    scene.add(southGround);

    // Deep Subterranean Castle Moat (`Z = -12` to `Z = -36`, 24 meters wide!)
    const moatBed = new THREE.Mesh(new THREE.PlaneGeometry(240, 26), stoneWallMat);
    moatBed.rotation.x = -Math.PI / 2;
    moatBed.position.set(0, -3.6, -24.0);
    moatBed.receiveShadow = true;
    scene.add(moatBed);

    // Animated Dark Reflective Moat Water Surface (`Y = -1.85m`)
    const moatWaterMat = new THREE.MeshStandardMaterial({
      normalMap: darkMarblePbr.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      color: '#0a2f3d',
      roughness: 0.06,
      metalness: 0.92,
      emissive: new THREE.Color('#0c4a5e'),
      emissiveIntensity: 0.42,
    });
    applyWindSwayShader(moatWaterMat, 'FERN_PLANT');
    const moatWater = new THREE.Mesh(new THREE.PlaneGeometry(240, 24.4, 48, 16), moatWaterMat);
    moatWater.rotation.x = -Math.PI / 2;
    moatWater.position.set(0, -1.85, -24.0);
    moatWater.receiveShadow = true;
    scene.add(moatWater);

    // Moat Stone Embankment Walls at `Z = -12.0` (South Bank) and `Z = -36.0` (Castle Cliff)
    for (const mz of [-12.0, -35.8]) {
      const bankWall = new THREE.Mesh(new THREE.BoxGeometry(220, 3.8, 0.9), stoneWallMat);
      bankWall.position.set(0, -1.85, mz);
      bankWall.receiveShadow = true;
      scene.add(bankWall);
    }
    // Low stone parapet walls along the South Moat Bank (`Z = -12.0`) to Left and Right of the Bridge
    registerBoxCollider(-62.0, 1.0, -12.0, 114.0, 3.0, 1.0);
    registerBoxCollider(62.0, 1.0, -12.0, 114.0, 3.0, 1.0);
    for (const side of [-1, 1]) {
      const bankParapet = new THREE.Mesh(new THREE.BoxGeometry(85, 1.05, 0.75), stoneWallMat);
      bankParapet.position.set(side * 47.2, 0.52, -12.0);
      bankParapet.castShadow = true;
      bankParapet.receiveShadow = true;
      scene.add(bankParapet);
    }

    // Castle Island Ground surrounding the Mansion (`Z = -36` to `-140`)
    const northBackGround = new THREE.Mesh(new THREE.PlaneGeometry(240, 80), groundMat);
    northBackGround.rotation.x = -Math.PI / 2;
    northBackGround.position.set(0, -0.02, -112.0);
    northBackGround.receiveShadow = true;
    scene.add(northBackGround);

    const westIslandGround = new THREE.Mesh(new THREE.PlaneGeometry(96, 38), groundMat);
    westIslandGround.rotation.x = -Math.PI / 2;
    westIslandGround.position.set(-72.0, -0.02, -54.0);
    westIslandGround.receiveShadow = true;
    scene.add(westIslandGround);

    const eastIslandGround = new THREE.Mesh(new THREE.PlaneGeometry(96, 38), groundMat);
    eastIslandGround.rotation.x = -Math.PI / 2;
    eastIslandGround.position.set(72.0, -0.02, -54.0);
    eastIslandGround.receiveShadow = true;
    scene.add(eastIslandGround);

    // ==========================================================================
    // 1A. VOLUMETRIC FOG & ANISOTROPIC MIE LIGHT-DIFFUSION SHADERS
    //     (Matches creation_3752878158, 3752926830 & 3752929161!)
    // ==========================================================================
    const volumetricFogMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: windTimeUniform,
        uMoonDir: { value: new THREE.Vector3(-0.35, 0.65, -0.68).normalize() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 pos = position;
          pos.z += sin(pos.x * 0.14 + uTime * 0.55) * 0.42;
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        uniform float uTime;
        uniform vec3 uMoonDir;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise2D(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            v += amp * noise2D(p);
            p = p * 2.03 + vec2(1.7, 9.2);
            amp *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 uvFlow1 = vWorldPos.xz * 0.042 + vec2(uTime * 0.16, -uTime * 0.11);
          vec2 uvFlow2 = vWorldPos.xz * 0.085 - vec2(uTime * 0.12, uTime * 0.19);
          float n = fbm(uvFlow1) * 0.65 + fbm(uvFlow2) * 0.35;

          // Edge fade so fog banks blend seamlessly without hard quad borders
          float edgeFade = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x)
                         * smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);

          // Henyey-Greenstein Anisotropic Moonlight Scattering + Warm Torch/Lamp Diffusion
          vec3 viewDir = normalize(vWorldPos - cameraPosition);
          float cosTheta = max(0.0, dot(viewDir, uMoonDir));
          float g = 0.68;
          float mieMoon = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5);

          // Warm amber light diffusion near road billboards, bridge braziers & gatehouse
          float roadWarmth = exp(-abs(vWorldPos.x) * 0.065) * (0.45 + 0.55 * sin(vWorldPos.z * 0.12 + uTime));
          vec3 coolMistCol = vec3(0.42, 0.56, 0.74) + vec3(0.18, 0.26, 0.38) * min(2.2, mieMoon * 0.35);
          vec3 warmTorchDiffusion = vec3(1.0, 0.58, 0.22) * roadWarmth * 0.42;
          vec3 finalCol = coolMistCol + warmTorchDiffusion;

          float alpha = smoothstep(0.28, 0.82, n) * edgeFade * 0.26;
          gl_FragColor = vec4(finalCol, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Helper: Add Anisotropic Volumetric Light-Diffusion Halo / Cone around any Light Source!
    const lightHaloMatCache: Record<string, THREE.ShaderMaterial> = {};
    const getLightDiffusionMat = (hexColor: string, intensity = 1.0) => {
      const key = `${hexColor}_${intensity}`;
      if (!lightHaloMatCache[key]) {
        const col = new THREE.Color(hexColor);
        lightHaloMatCache[key] = new THREE.ShaderMaterial({
          uniforms: {
            uTime: windTimeUniform,
            uColor: { value: new THREE.Vector3(col.r, col.g, col.b) },
            uIntensity: { value: intensity },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform vec3 uColor;
            uniform float uIntensity;
            void main() {
              vec2 d = (vUv - vec2(0.5)) * 2.0;
              float r = length(d);
              // Inverse-exponential Mie fog glow core + soft atmospheric halo
              float core = exp(-r * r * 6.5);
              float halo = exp(-r * 2.6) * 0.55;
              float flicker = 0.92 + 0.08 * sin(uTime * 7.5 + vUv.x * 4.0);
              float alpha = clamp((core + halo) * (1.0 - smoothstep(0.75, 1.0, r)) * uIntensity * flicker, 0.0, 0.85);
              gl_FragColor = vec4(uColor * (1.2 + core * 0.8), alpha);
            }
          `,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
      }
      return lightHaloMatCache[key];
    };

    const addVolumetricLightHalo = (
      parent: THREE.Object3D,
      lx: number,
      ly: number,
      lz: number,
      radius = 2.8,
      hexColor = '#ffaa44',
      intensity = 0.58
    ) => {
      const hMat = getLightDiffusionMat(hexColor, intensity);
      // Crossed dual planes so the volumetric diffusion halo is visible from all 360 degrees
      const p1 = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), hMat);
      p1.position.set(lx, ly, lz);
      parent.add(p1);
      const p2 = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), hMat);
      p2.position.set(lx, ly, lz);
      p2.rotation.y = Math.PI / 2;
      parent.add(p2);
    };

    // Place Multi-Layered Rolling Volumetric Ground Fog Banks along the Highway, Moat, Ravine & Castle!
    const fogLayerCoords: Array<[number, number, number, number, number]> = [
      [0, 0.45, 48, 86, 44],
      [0, 1.25, 36, 94, 48],
      [0, 0.38, 16, 92, 44],
      [0, 1.65, 2, 98, 42],
      [0, -0.85, -24, 140, 32], // Thick Moat Gorge Mist
      [0, 0.55, -24, 110, 30],  // Drawbridge Mist Layer
      [-28, 2.2, -18, 65, 45],
      [28, 2.2, -18, 65, 45],
      [0, 0.35, -45, 44, 32],   // Subtle Grand Hall Floor Mist
      [0, -5.55, -48, 44, 32],  // Subterranean Crypt Mist
    ];
    fogLayerCoords.forEach(([fx, fy, fz, fw, fd]) => {
      const fMesh = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd, 24, 24), volumetricFogMat);
      fMesh.rotation.x = -Math.PI / 2;
      fMesh.position.set(fx, fy, fz);
      scene.add(fMesh);
    });

    // Long Rain-Slicked Wet Specular Ravencrest Approach Highway (`Z = +68` to `Z = -12`, 80m long!)
    const roadMat = new THREE.MeshStandardMaterial({
      map: asphaltPbr.map,
      normalMap: asphaltPbr.normalMap,
      normalScale: new THREE.Vector2(1.55, 1.55),
      roughnessMap: asphaltPbr.roughnessMap,
      color: '#3b4252',
      roughness: 0.16,
      metalness: 0.38,
    });
    const nsRoad = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 80), roadMat);
    nsRoad.rotation.x = -Math.PI / 2;
    nsRoad.position.set(0, 0.02, 28.0);
    nsRoad.receiveShadow = true;
    scene.add(nsRoad);

    // Double Yellow Centerlines & White Shoulder Edge Stripes (Matches creation_3752878158.png!)
    const yellowPaintMat = new THREE.MeshStandardMaterial({
      color: '#eab308',
      roughness: 0.28,
      metalness: 0.15,
      emissive: new THREE.Color('#854d0e'),
      emissiveIntensity: 0.22,
    });
    const whitePaintMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.28,
      metalness: 0.15,
    });
    for (const cxOff of [-0.14, 0.14]) {
      const yellowLine = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 78), yellowPaintMat);
      yellowLine.rotation.x = -Math.PI / 2;
      yellowLine.position.set(cxOff, 0.036, 27.0);
      scene.add(yellowLine);
    }
    for (const wxOff of [-4.45, 4.45]) {
      const edgeStripe = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 78), whitePaintMat);
      edgeStripe.rotation.x = -Math.PI / 2;
      edgeStripe.position.set(wxOff, 0.036, 27.0);
      scene.add(edgeStripe);
    }

    // Continuous Steel W-Beam Highway Guardrail on the Right Shoulder (`X = +4.95`, `Z = +64` down to `-11`)
    // with Glowing Amber Road Reflectors & Yellow/Black Chevron Curve Signs (Matches creation_3752899931.png!)
    const guardrailMetalMat = new THREE.MeshStandardMaterial({
      color: '#64748b',
      roughness: 0.32,
      metalness: 0.88,
    });
    const amberReflectorMat = new THREE.MeshBasicMaterial({ color: '#ff9d00' });
    const guardrailBeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 75.0), guardrailMetalMat);
    guardrailBeam.position.set(4.95, 0.68, 26.5);
    guardrailBeam.castShadow = true;
    guardrailBeam.receiveShadow = true;
    scene.add(guardrailBeam);
    registerBoxCollider(4.95, 0.68, 26.5, 0.45, 1.4, 75.0);

    for (let gz = -10.5; gz <= 63.5; gz += 3.5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.82, 0.14), guardrailMetalMat);
      post.position.set(5.02, 0.41, gz);
      scene.add(post);

      const refl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.16), amberReflectorMat);
      refl.position.set(4.84, 0.72, gz);
      scene.add(refl);
    }

    // 4 Signature RAVENCREST Roadside Billboards (`creation_3752926830.png`, `926837.png`, `926851.png`)
    // with 3 Overhead Gooseneck Tungsten Lamps, Volumetric Light Diffusion Halos & Perched Black Ravens!
    const billboardBackTex = textureLoader.load('/models/halloween/ravencrest/billboard_back_wood.png');
    billboardBackTex.colorSpace = THREE.SRGBColorSpace;
    const billboardBackMat = new THREE.MeshStandardMaterial({
      map: billboardBackTex,
      roughness: 0.78,
      metalness: 0.12,
    });
    const ravenFeatherMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.35,
      metalness: 0.45,
    });
    const perchedRavens: THREE.Group[] = [];

    const addRavencrestRoadBillboard = (
      bx: number,
      bz: number,
      rotY: number,
      frontTexUrl: string,
      width = 5.6,
      height = 2.9
    ) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(bx, 0, bz);
      bGroup.rotation.y = rotY;

      const fTex = textureLoader.load(frontTexUrl);
      fTex.colorSpace = THREE.SRGBColorSpace;
      const frontMat = new THREE.MeshStandardMaterial({
        map: fTex,
        roughness: 0.42,
        metalness: 0.15,
        emissive: new THREE.Color('#ffbe73'),
        emissiveIntensity: 0.28,
      });

      // Two heavy weathered timber support posts
      for (const px of [-width * 0.36, width * 0.36]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, 4.6, 0.26), woodRafterMat);
        post.position.set(px, 2.3, 0);
        post.castShadow = true;
        bGroup.add(post);
      }

      // Rusted Iron Frame & Sign Panel
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.28, height + 0.28, 0.22), darkTrimMat);
      frame.position.set(0, 3.35, 0);
      frame.castShadow = true;
      bGroup.add(frame);

      const frontFace = new THREE.Mesh(new THREE.PlaneGeometry(width, height), frontMat);
      frontFace.position.set(0, 3.35, 0.125);
      bGroup.add(frontFace);

      const backFace = new THREE.Mesh(new THREE.PlaneGeometry(width, height), billboardBackMat);
      backFace.position.set(0, 3.35, -0.125);
      backFace.rotation.y = Math.PI;
      bGroup.add(backFace);

      // 3 Overhead Gooseneck Industrial Lamps + Warm Tungsten Volumetric Light-Diffusion Cones!
      for (const lx of [-width * 0.32, 0, width * 0.32]) {
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.65, 8), darkTrimMat);
        neck.position.set(lx, 3.35 + height * 0.5 + 0.18, 0.28);
        neck.rotation.x = Math.PI * 0.38;
        bGroup.add(neck);

        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 12), guardrailMetalMat);
        shade.position.set(lx, 3.35 + height * 0.5 + 0.08, 0.54);
        bGroup.add(shade);

        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.075, 10, 10),
          new THREE.MeshBasicMaterial({ color: '#ffd98a' })
        );
        bulb.position.set(lx, 3.35 + height * 0.5 + 0.02, 0.54);
        bGroup.add(bulb);

        addVolumetricLightHalo(bGroup, lx, 3.35 + height * 0.35, 0.58, 1.65, '#ffaa3b', 0.52);
      }

      const signLight = new THREE.PointLight('#ffaa44', 5.2, 18, 1.2);
      signLight.position.set(0, 4.6, 1.4);
      bGroup.add(signLight);

      // Perched 3D Black Raven atop the Billboard Frame (`creation_3752926817.png`)
      const raven = new THREE.Group();
      raven.position.set(-width * 0.18, 3.35 + height * 0.5 + 0.14, 0.04);
      const rBody = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), ravenFeatherMat);
      rBody.scale.set(0.85, 1.25, 1.45);
      rBody.rotation.x = 0.35;
      rBody.position.y = 0.16;
      raven.add(rBody);
      const rHead = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), ravenFeatherMat);
      rHead.position.set(0, 0.31, 0.12);
      raven.add(rHead);
      const rBeak = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.12, 6), ravenFeatherMat);
      rBeak.rotation.x = Math.PI * 0.55;
      rBeak.position.set(0, 0.30, 0.21);
      raven.add(rBeak);
      bGroup.add(raven);
      perchedRavens.push(raven);

      scene.add(bGroup);
      registerBoxCollider(bx, 2.3, bz, 1.6, 4.6, 1.6);
    };

    addRavencrestRoadBillboard(
      -7.4,
      53.5,
      0.24,
      '/models/halloween/ravencrest/billboard_directional_12mi.png',
      5.4,
      2.8
    );
    addRavencrestRoadBillboard(
      -7.8,
      36.0,
      0.22,
      '/models/halloween/ravencrest/billboard_history_mist.png',
      6.0,
      3.0
    );
    addRavencrestRoadBillboard(
      -7.6,
      11.5,
      0.20,
      '/models/halloween/ravencrest/billboard_legacy_remains.png',
      5.8,
      2.9
    );
    addRavencrestRoadBillboard(
      -7.4,
      -5.5,
      0.18,
      '/models/halloween/ravencrest/billboard_welcome.png',
      5.2,
      2.7
    );

    // East-West Lonesome Crossroads Highway at `Z = +20.0`
    const ewRoad = new THREE.Mesh(new THREE.PlaneGeometry(130, 9.2), roadMat);
    ewRoad.rotation.x = -Math.PI / 2;
    ewRoad.position.set(0, 0.03, 20.0);
    ewRoad.receiveShadow = true;
    scene.add(ewRoad);

    // Helper: Build a 3D Carved Glowing Jack-o'-Lantern Pumpkin Prop
    const pumpkinRindMat = new THREE.MeshStandardMaterial({
      color: '#ea580c',
      roughness: 0.42,
      metalness: 0.08,
      emissive: new THREE.Color('#9a3412'),
      emissiveIntensity: 0.35,
    });
    const pumpkinGlowMat = new THREE.MeshBasicMaterial({ color: '#fde047' });
    const pumpkinStemMat = new THREE.MeshStandardMaterial({ color: '#365314', roughness: 0.8 });

    const addJackOLanternProp = (px: number, py: number, pz: number, scale = 1.0, rotY = 0) => {
      const jGroup = new THREE.Group();
      jGroup.position.set(px, py, pz);
      jGroup.rotation.y = rotY;
      jGroup.scale.setScalar(scale);

      const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), pumpkinRindMat);
      body.scale.set(1.08, 0.84, 1.05);
      body.position.y = 0.28;
      body.castShadow = true;
      jGroup.add(body);

      const core = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), pumpkinGlowMat);
      core.position.set(0, 0.28, 0.12);
      jGroup.add(core);

      const stem = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), pumpkinStemMat);
      stem.position.set(0, 0.62, 0);
      stem.rotation.z = 0.22;
      jGroup.add(stem);

      scene.add(jGroup);
    };

    // ==========================================================================
    // 1B. MONUMENTAL ARCHED GOTHIC STONE & HEAVY OAK DRAWBRIDGE OVER THE MOAT
    //     (`Z = -12.0` to `Z = -36.0`, `X = -4.6` to `+4.6`)
    // ==========================================================================
    const moatBridgeGroup = new THREE.Group();
    scene.add(moatBridgeGroup);

    // Heavy Stone Bridge Deck & Oak Timber Planking (`Y = 0.0m`, `Z = -11.5` to `-36.5`)
    const bridgeDeckStone = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 0.55, 25.2),
      stoneWallMat
    );
    bridgeDeckStone.position.set(0, -0.25, -24.0);
    bridgeDeckStone.receiveShadow = true;
    bridgeDeckStone.castShadow = true;
    moatBridgeGroup.add(bridgeDeckStone);

    const bridgeOakPlanks = new THREE.Mesh(
      new THREE.BoxGeometry(7.8, 0.08, 24.8),
      woodPlankFloorMat
    );
    bridgeOakPlanks.position.set(0, 0.04, -24.0);
    bridgeOakPlanks.receiveShadow = true;
    moatBridgeGroup.add(bridgeOakPlanks);

    // Crimson Carpet Runner down the center of the Bridge
    const bridgeCarpet = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.04, 24.8),
      redCarpetMat
    );
    bridgeCarpet.position.set(0, 0.08, -24.0);
    moatBridgeGroup.add(bridgeCarpet);

    // Arched Gothic Stone Support Piers rising out of the Moat Water (`Z = -16, -24, -32`)
    for (const pierZ of [-16.0, -24.0, -32.0]) {
      for (const side of [-1, 1]) {
        const pier = new THREE.Mesh(
          new THREE.BoxGeometry(1.45, 4.2, 1.85),
          stoneWallMat
        );
        pier.position.set(side * 4.4, -1.8, pierZ);
        pier.castShadow = true;
        pier.receiveShadow = true;
        moatBridgeGroup.add(pier);

        // Gothic Brazier Pillar on top of each Bridge Pier
        const turretPost = new THREE.Mesh(
          new THREE.BoxGeometry(1.15, 2.2, 1.15),
          gothicBrickMat
        );
        turretPost.position.set(side * 4.55, 1.1, pierZ);
        turretPost.castShadow = true;
        moatBridgeGroup.add(turretPost);

        const brazierFlame = new THREE.Mesh(
          new THREE.ConeGeometry(0.36, 0.78, 10),
          new THREE.MeshBasicMaterial({ color: '#ff7b00' })
        );
        brazierFlame.position.set(side * 4.55, 2.55, pierZ);
        moatBridgeGroup.add(brazierFlame);

        // Carved Glowing Jack-o'-Lantern perched at each Bridge Pier!
        addJackOLanternProp(side * 3.85, 0.06, pierZ + 0.9, 1.15, side * -0.6);
      }
    }

    // Creneleted Gothic Stone Bridge Parapet Guardrails (`X = -4.5` and `X = +4.5`, `Z = -12` to `-36`)
    for (const side of [-1, 1]) {
      const railWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 1.25, 24.4),
        stoneWallMat
      );
      railWall.position.set(side * 4.5, 0.62, -24.0);
      railWall.castShadow = true;
      railWall.receiveShadow = true;
      moatBridgeGroup.add(railWall);
      registerBoxCollider(side * 4.5, 0.62, -24.0, 0.75, 2.4, 24.4);

      // Heavy Drawbridge Iron Chains angling down from the Castle Gatehouse to the Bridge
      const chainMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 14.5, 8),
        darkTrimMat
      );
      chainMesh.position.set(side * 4.3, 4.2, -31.0);
      chainMesh.rotation.x = Math.PI * 0.28;
      moatBridgeGroup.add(chainMesh);
    }

    // Bridge Lighting so the Moat & Stone Bridge glow dramatically
    const moatBridgeLight = new THREE.PointLight('#ff9d3b', 7.5, 42, 1.05);
    moatBridgeLight.position.set(0, 4.8, -24.0);
    scene.add(moatBridgeLight);

    // Center Crossroads Wooden Signpost at `(-5.4, 0, 24.5)` + Pumpkin Patch Clusters
    const signpostGroup = new THREE.Group();
    signpostGroup.position.set(-5.4, 0, 24.5);
    registerBoxCollider(-5.4, 2.0, 24.5, 0.8, 4.0, 0.8);
    const centerPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, 4.8, 12),
      woodRafterMat
    );
    centerPost.position.y = 2.4;
    signpostGroup.add(centerPost);
    for (const [plankY, rotY] of [
      [3.8, 0.2],
      [3.3, -1.3],
      [4.2, 1.5],
    ]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.32, 0.08), woodRafterMat);
      plank.position.set(0, plankY, 0);
      plank.rotation.y = rotY;
      signpostGroup.add(plank);
    }
    const lanternOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 16),
      new THREE.MeshBasicMaterial({ color: '#ffbe42' })
    );
    lanternOrb.position.set(0, 4.9, 0);
    signpostGroup.add(lanternOrb);
    scene.add(signpostGroup);

    // Scatter Glowing Carved 3D Jack-o'-Lanterns along the Pumpkin Patch Highway (`Z = +54` down to `Z = -10`)
    for (let jz = 52; jz >= -10; jz -= 8) {
      if (Math.abs(jz - 20) < 4) continue;
      addJackOLanternProp(-5.2, 0, jz, 0.95 + (Math.abs(jz) % 3) * 0.15, 0.45);
      addJackOLanternProp(5.2, 0, jz - 2, 0.95 + (Math.abs(jz) % 2) * 0.2, -0.45);
    }

    // Wind-Blown Roadside Autumn Grass & Reed Clusters (GPU Vertex Wind Shader!)
    const grassMat = new THREE.MeshStandardMaterial({
      color: '#4d6b3c',
      roughness: 0.78,
      side: THREE.DoubleSide,
    });
    applyWindSwayShader(grassMat, 'FERN_PLANT');
    const grassBladeGeo = new THREE.ConeGeometry(0.18, 1.15, 4);
    grassBladeGeo.translate(0, 0.55, 0);
    const grassGroup = new THREE.Group();
    for (let gIdx = 0; gIdx < 240; gIdx++) {
      const side = gIdx % 2 === 0 ? -1 : 1;
      const gx = side * (5.8 + (gIdx % 17) * 1.55);
      const gz = -10 + ((gIdx * 7) % 68);
      if (Math.abs(gz - 20) < 5.2 && Math.abs(gx) < 38) continue;
      const tuft = new THREE.Mesh(grassBladeGeo, grassMat);
      tuft.position.set(gx, 0, gz);
      tuft.rotation.y = (gIdx * 1.7) % Math.PI;
      tuft.scale.setScalar(0.75 + (gIdx % 5) * 0.18);
      grassGroup.add(tuft);
    }
    scene.add(grassGroup);

    // ==========================================================================
    // 2. TOTALLY EXPLORABLE 4-LEVEL, 12-ROOM GOTHIC CATHEDRAL & VAMPIRE CASTLE
    //    MANSION (`Z = -36` TO `-72`) WITH FLYING BUTTRESSES, OCTAGONAL KEEP
    //    TOWERS, 3 WALKABLE GRAND STONE STAIRCASES & FULL AABB COLLIDERS!
    // ==========================================================================
    // Note: We offset `castleMansionGroup` by `Z = -14.0m` so its local `Z in [-22, -58]`
    // maps to World `Z in [-36, -72]`, right across the Moat Drawbridge!
    const CASTLE_Z_SHIFT = -14.0;
    const castleMansionGroup = new THREE.Group();
    castleMansionGroup.position.set(0, 0, CASTLE_Z_SHIFT);
    scene.add(castleMansionGroup);

    // Reposition interior castle chandelier lights to match `CASTLE_Z_SHIFT`
    cryptChandelierLight.position.set(0, -1.5, -40.0 + CASTLE_Z_SHIFT);
    groundHallChandelierLight.position.set(0, 4.8, -38.0 + CASTLE_Z_SHIFT);
    upperNobleChandelierLight.position.set(0, 10.8, -40.0 + CASTLE_Z_SHIFT);
    atticBelfryChandelierLight.position.set(0, 16.8, -38.0 + CASTLE_Z_SHIFT);
    crossroadsCenterLight.position.set(0, 7.5, 20.0);

    const addBoxMesh = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material = stoneWallMat,
      rotY = 0,
      collidable = false
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      if (rotY !== 0) m.rotation.y = rotY;
      m.receiveShadow = true;
      m.castShadow = true;
      castleMansionGroup.add(m);
      if (collidable && rotY === 0) {
        registerBoxCollider(x, y, z + CASTLE_Z_SHIFT, w, h, d);
      }
      return m;
    };

    const addGothicChandelier = (cx: number, cy: number, cz: number, candleColor = '#ffbe42') => {
      const chGroup = new THREE.Group();
      chGroup.position.set(cx, cy, cz);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), darkTrimMat);
      chain.position.y = 0.65;
      chGroup.add(chain);
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(1.45, 0.09, 10, 24),
        goldFrameMat
      );
      wheel.rotation.x = Math.PI / 2;
      chGroup.add(wheel);
      const innerWheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.06, 8, 18),
        darkTrimMat
      );
      innerWheel.rotation.x = Math.PI / 2;
      innerWheel.position.y = 0.25;
      chGroup.add(innerWheel);
      const candleMat = new THREE.MeshStandardMaterial({ color: '#fef3c7', roughness: 0.4 });
      const flameMat = new THREE.MeshBasicMaterial({ color: candleColor });
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const rx = Math.cos(ang) * 1.45;
        const rz = Math.sin(ang) * 1.45;
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 8), candleMat);
        candle.position.set(rx, 0.22, rz);
        chGroup.add(candle);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), flameMat);
        flame.scale.set(0.8, 1.6, 0.8);
        flame.position.set(rx, 0.45, rz);
        chGroup.add(flame);
      }
      addVolumetricLightHalo(chGroup, 0, 0.25, 0, 2.9, candleColor, 0.48);
      castleMansionGroup.add(chGroup);
    };

    const addGothicWindowWithBillowingCurtains = (
      wx: number,
      wy: number,
      wz: number,
      rotY: number,
      glassColor = '#ff8c38',
      rayColor = '#ffbe73'
    ) => {
      const winGroup = new THREE.Group();
      winGroup.position.set(wx, wy, wz);
      winGroup.rotation.y = rotY;

      const outerFrame = new THREE.Mesh(
        new THREE.BoxGeometry(2.55, 4.45, 0.28),
        darkTrimMat
      );
      winGroup.add(outerFrame);

      // Pointed Gothic Lancet Arch Crest at top of window
      const archCrest = new THREE.Mesh(
        new THREE.ConeGeometry(1.35, 1.25, 4),
        darkTrimMat
      );
      archCrest.position.set(0, 2.75, 0);
      archCrest.rotation.y = Math.PI / 4;
      winGroup.add(archCrest);

      const glassMat = new THREE.MeshStandardMaterial({
        color: glassColor,
        emissive: new THREE.Color(glassColor),
        emissiveIntensity: 2.2,
        roughness: 0.15,
        metalness: 0.1,
      });
      const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 3.95), glassMat);
      glassPane.position.z = 0.16;
      winGroup.add(glassPane);

      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.95, 0.32), darkTrimMat);
      winGroup.add(vBar);
      for (const hy of [-0.8, 0.8]) {
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.09, 0.32), darkTrimMat);
        hBar.position.y = hy;
        winGroup.add(hBar);
      }

      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 3.4, 10),
        goldFrameMat
      );
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, 2.25, 0.32);
      winGroup.add(rod);
      for (const fx of [-1.72, 1.72]) {
        const finial = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), goldFrameMat);
        finial.position.set(fx, 2.25, 0.32);
        winGroup.add(finial);
      }

      const curtainGeo = new THREE.PlaneGeometry(1.15, 4.35, 14, 24);
      const leftCurtain = new THREE.Mesh(curtainGeo, velvetCurtainMat);
      leftCurtain.position.set(-1.08, 0.05, 0.34);
      winGroup.add(leftCurtain);

      const rightCurtain = new THREE.Mesh(curtainGeo, velvetCurtainMat);
      rightCurtain.position.set(1.08, 0.05, 0.34);
      winGroup.add(rightCurtain);

      const rayMat = new THREE.MeshBasicMaterial({
        color: rayColor,
        transparent: true,
        opacity: 0.11,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const rayShaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 1.85, 6.2, 14, 1, true),
        rayMat
      );
      rayShaft.position.set(0, -0.95, 2.45);
      rayShaft.rotation.x = Math.PI * 0.34;
      winGroup.add(rayShaft);

      castleMansionGroup.add(winGroup);
    };

    const addGothicColumn = (cx: number, floorY: number, cz: number, height = 5.8) => {
      const colGroup = new THREE.Group();
      colGroup.position.set(cx, floorY, cz);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.1), darkTrimMat);
      base.position.y = 0.225;
      colGroup.add(base);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.42, height - 0.9, 14),
        stoneWallMat
      );
      shaft.position.y = height * 0.5;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      colGroup.add(shaft);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.45, 1.15), darkTrimMat);
      cap.position.y = height - 0.225;
      colGroup.add(cap);
      const sconceFlame = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 8, 8),
        new THREE.MeshBasicMaterial({ color: '#ff9d3b' })
      );
      sconceFlame.position.set(0, height * 0.58, 0.52);
      colGroup.add(sconceFlame);
      castleMansionGroup.add(colGroup);
      registerBoxCollider(cx, floorY + height * 0.5, cz + CASTLE_Z_SHIFT, 0.95, height, 0.95);
    };

    const addGothicFireplace = (fx: number, fy: number, fz: number, rotY: number) => {
      const fpGroup = new THREE.Group();
      fpGroup.position.set(fx, fy, fz);
      fpGroup.rotation.y = rotY;
      const surround = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.2, 0.95), gothicBrickMat);
      surround.position.y = 1.6;
      fpGroup.add(surround);
      const mantel = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.35, 1.25), woodRafterMat);
      mantel.position.y = 3.25;
      fpGroup.add(mantel);
      const firebox = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.85, 0.55),
        new THREE.MeshBasicMaterial({ color: '#14080e' })
      );
      firebox.position.set(0, 0.95, 0.28);
      fpGroup.add(firebox);
      const hearthGlow = new THREE.Mesh(
        new THREE.ConeGeometry(0.78, 1.25, 12),
        new THREE.MeshBasicMaterial({ color: '#ff6a00' })
      );
      hearthGlow.position.set(0, 0.72, 0.42);
      fpGroup.add(hearthGlow);
      castleMansionGroup.add(fpGroup);
      registerBoxCollider(fx, fy + 1.6, fz + CASTLE_Z_SHIFT, 3.8, 3.2, 1.1);
    };

    // --- FLOOR SLABS WITH OPEN STAIRWELL CUTOUT AT `X in [-6.8, +6.8], Z in [-48.0, -32.0]` ---
    // (In World coordinates, the 3-Lane Grand Staircase Hall spans `Z in [-62.0, -46.0]`)
    const addFloorWithStairwellHole = (elevY: number, mat: THREE.Material) => {
      // South Foyer Slab (`Z in [-22, -32]`, full 48m width)
      addBoxMesh(48, 0.38, 10.0, 0, elevY - 0.19, -27.0, mat);
      // North Gallery Landing Slab (`Z in [-48, -58]`, full 48m width)
      addBoxMesh(48, 0.38, 10.0, 0, elevY - 0.19, -53.0, mat);
      // West Wing Slab (`X in [-24, -6.8]`, `Z in [-32, -48]`)
      addBoxMesh(17.2, 0.38, 16.0, -15.4, elevY - 0.19, -40.0, mat);
      // East Wing Slab (`X in [+6.8, +24]`, `Z in [-32, -48]`)
      addBoxMesh(17.2, 0.38, 16.0, 15.4, elevY - 0.19, -40.0, mat);
    };

    // Level 0: Basement Crypt Floor (`Y = -6.0m`)
    addBoxMesh(48, 0.42, 36, 0, -6.21, -40.0, marbleFloorMat);
    addBoxMesh(45, 0.08, 15.5, 0, -5.94, -49.5, cryptWaterMat);

    // Level 1: Ground Floor (`Y = 0.0m`) — note: West & East stair lanes at Y=0 have solid approaches!
    addFloorWithStairwellHole(0.0, marbleFloorMat);
    addBoxMesh(4.2, 0.38, 16.0, -4.6, -0.19, -40.0, marbleFloorMat);
    addBoxMesh(4.2, 0.38, 16.0, 4.6, -0.19, -40.0, marbleFloorMat);
    addBoxMesh(15.8, 0.04, 16.2, -15.2, 0.02, -49.0, woodPlankFloorMat);
    addBoxMesh(15.8, 0.04, 16.2, 15.2, 0.02, -49.0, woodPlankFloorMat);
    addBoxMesh(4.4, 0.05, 10.5, 0, 0.03, -27.0, redCarpetMat);

    // Circular Inlaid RAVENCREST RAVEN FLOOR MEDALLION in the Center of the Grand Entrance Hall (`creation_3752887346.png`!)
    const medallionTex = textureLoader.load('/models/halloween/ravencrest/ravencrest_medallion.png');
    medallionTex.colorSpace = THREE.SRGBColorSpace;
    const medallionMat = new THREE.MeshStandardMaterial({
      map: medallionTex,
      normalMap: darkMarblePbr.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.14,
      metalness: 0.42,
      transparent: true,
    });
    const grandHallMedallion = new THREE.Mesh(new THREE.CircleGeometry(4.4, 48), medallionMat);
    grandHallMedallion.rotation.x = -Math.PI / 2;
    grandHallMedallion.position.set(0, 0.058, -27.0);
    grandHallMedallion.receiveShadow = true;
    castleMansionGroup.add(grandHallMedallion);

    // Hanging RAVENCREST HERALDIC BANNERS (`banner_raven_navy.png` & `banner_raven_red.png`)
    // along the Gatehouse Towers, Grand Hall Gothic Piers, and Upper Gallery!
    const bannerNavyTex = textureLoader.load('/models/halloween/ravencrest/banner_raven_navy.png');
    bannerNavyTex.colorSpace = THREE.SRGBColorSpace;
    const bannerRedTex = textureLoader.load('/models/halloween/ravencrest/banner_raven_red.png');
    bannerRedTex.colorSpace = THREE.SRGBColorSpace;
    const bannerHouseTex = textureLoader.load('/models/halloween/ravencrest/banner_house_crest.png');
    bannerHouseTex.colorSpace = THREE.SRGBColorSpace;

    const bannerNavyMat = new THREE.MeshStandardMaterial({
      map: bannerNavyTex,
      roughness: 0.58,
      side: THREE.DoubleSide,
    });
    const bannerRedMat = new THREE.MeshStandardMaterial({
      map: bannerRedTex,
      roughness: 0.58,
      side: THREE.DoubleSide,
    });
    const bannerHouseMat = new THREE.MeshStandardMaterial({
      map: bannerHouseTex,
      roughness: 0.58,
      side: THREE.DoubleSide,
    });
    applyWindSwayShader(bannerNavyMat, 'VELVET_CURTAIN');
    applyWindSwayShader(bannerRedMat, 'VELVET_CURTAIN');
    applyWindSwayShader(bannerHouseMat, 'VELVET_CURTAIN');

    const addRavencrestHangingBanner = (
      bx: number,
      by: number,
      bz: number,
      rotY: number,
      mat: THREE.Material,
      bw = 1.45,
      bh = 3.4
    ) => {
      const bg = new THREE.Group();
      bg.position.set(bx, by, bz);
      bg.rotation.y = rotY;
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, bw + 0.35, 8),
        goldFrameMat
      );
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, bh * 0.5, 0);
      bg.add(rod);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh, 8, 16), mat);
      cloth.position.set(0, 0, 0.03);
      bg.add(cloth);
      castleMansionGroup.add(bg);
    };

    // Exterior Gatehouse Barbican Raven Banners (`creation_3752929161.png`)
    addRavencrestHangingBanner(-6.4, 8.2, -18.8, 0, bannerNavyMat, 1.8, 4.4);
    addRavencrestHangingBanner(6.4, 8.2, -18.8, 0, bannerNavyMat, 1.8, 4.4);

    // Grand Entrance Hall & Mezzanine Pier Raven Banners (`creation_3752887346.png`)
    for (const pz of [-26.0, -31.5, -48.5, -54.0]) {
      addRavencrestHangingBanner(-6.15, 3.4, pz, Math.PI / 2, bannerNavyMat, 1.35, 3.1);
      addRavencrestHangingBanner(6.15, 3.4, pz, -Math.PI / 2, bannerNavyMat, 1.35, 3.1);
      addRavencrestHangingBanner(-6.15, 9.4, pz, Math.PI / 2, bannerRedMat, 1.35, 3.1);
      addRavencrestHangingBanner(6.15, 9.4, pz, -Math.PI / 2, bannerRedMat, 1.35, 3.1);
    }

    // Framed Oil Portraits of Lord Ravencrest (`portrait_lord.png`) & Medieval Tapestries (`tapestry_castle.png`)
    const portraitLordTex = textureLoader.load('/models/halloween/ravencrest/portrait_lord.png');
    portraitLordTex.colorSpace = THREE.SRGBColorSpace;
    const tapestryCastleTex = textureLoader.load('/models/halloween/ravencrest/tapestry_castle.png');
    tapestryCastleTex.colorSpace = THREE.SRGBColorSpace;
    const portraitLordMat = new THREE.MeshStandardMaterial({ map: portraitLordTex, roughness: 0.38 });
    const tapestryCastleMat = new THREE.MeshStandardMaterial({ map: tapestryCastleTex, roughness: 0.72 });

    for (const [tx, ty, tz, ry, isTap] of [
      [-11.5, 3.2, -57.3, 0, true],
      [11.5, 3.2, -57.3, 0, true],
      [-11.5, 9.2, -57.3, 0, false],
      [11.5, 9.2, -57.3, 0, false],
      [-23.3, 3.2, -40.0, Math.PI / 2, true],
      [23.3, 3.2, -40.0, -Math.PI / 2, false],
    ] as Array<[number, number, number, number, boolean]>) {
      const decor = new THREE.Mesh(
        new THREE.PlaneGeometry(isTap ? 2.8 : 1.9, isTap ? 3.6 : 2.5),
        isTap ? tapestryCastleMat : portraitLordMat
      );
      decor.position.set(tx, ty, tz);
      decor.rotation.y = ry;
      castleMansionGroup.add(decor);
    }

    // Level 2: Upper Noble Floor (`Y = +6.0m`) — Center lane bridged at Y=6m so you can walk across North Gallery
    addFloorWithStairwellHole(6.0, woodPlankFloorMat);
    addBoxMesh(4.4, 0.38, 16.0, 0.0, 5.81, -40.0, woodPlankFloorMat);
    addBoxMesh(6.5, 0.05, 9.5, 0, 6.03, -53.0, redCarpetMat);

    // Level 3: Creepy Attic Floor (`Y = +12.0m`) — West & Center lanes floored at Y=12m, East lane open for Attic Stairs!
    addFloorWithStairwellHole(12.0, woodRafterMat);
    addBoxMesh(9.0, 0.38, 16.0, -2.2, 11.81, -40.0, woodRafterMat);

    // ==========================================================================
    // 2B. THREE REAL WALKABLE GRAND GOTHIC STONE STAIRCASES (`Z_local in [-32 .. -48]`,
    //     WHICH IS `Z_world in [-46 .. -62]`!)
    //     1) WEST GRAND STAIRCASE (`X in [-6.5, -2.5]`): Ground (0m at Z_w=-46) -> Upper (+6m at Z_w=-62)
    //     2) CENTER CRYPT STAIRCASE (`X in [-2.2, +2.2]`): Ground (0m at Z_w=-46) -> Crypt (-6m at Z_w=-62)
    //     3) EAST BELFRY STAIRCASE (`X in [+2.5, +6.5]`): Upper (+6m at Z_w=-62) -> Attic (+12m at Z_w=-46)
    // ==========================================================================
    const buildGrandStairFlight = (
      laneX: number,
      laneWidth: number,
      zStartLocal: number,
      zEndLocal: number,
      yStart: number,
      yEnd: number,
      carpetColor = '#a31d36'
    ) => {
      const steps = 28;
      const dz = (zEndLocal - zStartLocal) / steps;
      const dy = (yEnd - yStart) / steps;
      const stepDepth = Math.abs(dz) * 1.08;
      const stepHeight = Math.abs(dy) + 0.14;
      const runnerMat = new THREE.MeshStandardMaterial({
        color: carpetColor,
        roughness: 0.65,
      });

      for (let i = 0; i <= steps; i++) {
        const sz = zStartLocal + dz * i;
        const sy = yStart + dy * i;
        const tread = new THREE.Mesh(
          new THREE.BoxGeometry(laneWidth, stepHeight, stepDepth),
          i % 2 === 0 ? marbleFloorMat : stoneWallMat
        );
        tread.position.set(laneX, sy - stepHeight * 0.5, sz);
        tread.castShadow = true;
        tread.receiveShadow = true;
        castleMansionGroup.add(tread);

        const runner = new THREE.Mesh(
          new THREE.BoxGeometry(laneWidth * 0.56, 0.04, stepDepth * 1.02),
          runnerMat
        );
        runner.position.set(laneX, sy + 0.02, sz);
        castleMansionGroup.add(runner);
      }
    };

    // 1. West Flight: Ground Floor (`Y=0` at `z_local=-32`) UP to 2nd Floor (`Y=+6` at `z_local=-48`)
    buildGrandStairFlight(-4.5, 3.8, -32.0, -48.0, 0.0, 6.0, '#b91c1c');
    // 2. Center Flight: Ground Floor (`Y=0` at `z_local=-32`) DOWN to Crypt (`Y=-6` at `z_local=-48`)
    buildGrandStairFlight(0.0, 4.1, -32.0, -48.0, 0.0, -6.0, '#0f766e');
    // 3. East Flight: 2nd Floor (`Y=+6` at `z_local=-48`) UP to Creepy Attic (`Y=+12` at `z_local=-32`)
    buildGrandStairFlight(4.5, 3.8, -48.0, -32.0, 6.0, 12.0, '#7e22ce');

    // Stone Balustrade Divider Walls between the 3 Staircase Lanes (prevents falling sideways off stairs!)
    addBoxMesh(0.36, 14.0, 15.6, -6.6, 3.5, -40.0, darkTrimMat, 0, true);
    addBoxMesh(0.36, 14.0, 15.6, -2.35, 1.5, -40.0, darkTrimMat, 0, true);
    addBoxMesh(0.36, 14.0, 15.6, 2.35, 5.5, -40.0, darkTrimMat, 0, true);
    addBoxMesh(0.36, 14.0, 15.6, 6.6, 6.5, -40.0, darkTrimMat, 0, true);

    // Exterior Castle Walls with Colliders (`X = ±24`, `Z_local = -22` and `-58`)
    addBoxMesh(0.85, 22.0, 36.0, -24.0, 5.0, -40.0, stoneWallMat, 0, true);
    addBoxMesh(0.85, 22.0, 36.0, 24.0, 5.0, -40.0, stoneWallMat, 0, true);
    addBoxMesh(48.8, 22.0, 0.85, 0.0, 5.0, -58.0, stoneWallMat, 0, true);

    // 8 Exterior Gothic Cathedral Flying Buttresses & Corner Octagonal Keep Towers!
    for (const side of [-1, 1]) {
      for (const bz of [-26.0, -35.0, -45.0, -54.0]) {
        const pier = addBoxMesh(1.8, 16.5, 1.8, side * 27.2, 5.2, bz, stoneWallMat, 0, true);
        const flyer = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.75, 1.2), stoneWallMat);
        flyer.position.set(side * 25.5, 11.5, bz);
        flyer.rotation.z = side * -0.45;
        castleMansionGroup.add(flyer);
        const pinnacle = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.2, 6), darkTrimMat);
        pinnacle.position.set(side * 27.2, 15.0, bz);
        castleMansionGroup.add(pinnacle);
      }

      // Twin Gatehouse Barbican Towers flanking the Front Drawbridge Portal (`X = ±6.2, Z_local = -21.2`)
      const barbican = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.5, 21.0, 12),
        stoneWallMat
      );
      barbican.position.set(side * 6.4, 7.5, -21.2);
      barbican.castShadow = true;
      barbican.receiveShadow = true;
      castleMansionGroup.add(barbican);
      registerBoxCollider(side * 6.4, 2.0, -21.2 + CASTLE_Z_SHIFT, 3.8, 10.0, 3.8);

      const barbicanSpire = new THREE.Mesh(
        new THREE.ConeGeometry(2.6, 7.5, 12),
        darkTrimMat
      );
      barbicanSpire.position.set(side * 6.4, 21.6, -21.2);
      castleMansionGroup.add(barbicanSpire);
    }

    for (const wy of [0.85, 6.85]) {
      addBoxMesh(0.18, 1.65, 35.2, -23.48, wy, -40.0, woodRafterMat);
      addBoxMesh(0.18, 1.65, 35.2, 23.48, wy, -40.0, woodRafterMat);
      addBoxMesh(47.0, 1.65, 0.18, 0.0, wy, -57.48, woodRafterMat);
    }

    // Front Facade Wall left/right of the Open Portcullis Gate (`X in [-4.2 .. +4.2]` is OPEN!)
    addBoxMesh(19.8, 22.0, 0.85, -14.1, 5.0, -22.0, stoneWallMat, 0, true);
    addBoxMesh(19.8, 22.0, 0.85, 14.1, 5.0, -22.0, stoneWallMat, 0, true);
    addBoxMesh(8.4, 6.0, 0.85, 0.0, -3.2, -22.0, stoneWallMat);
    addBoxMesh(8.4, 10.8, 0.85, 0.0, 10.6, -22.0, stoneWallMat);

    for (let mx = -22; mx <= 22; mx += 4.0) {
      addBoxMesh(2.2, 1.6, 1.1, mx, 16.8, -22.0, darkTrimMat);
      addBoxMesh(2.2, 1.6, 1.1, mx, 16.8, -58.0, darkTrimMat);
    }

    for (let gx = -3.6; gx <= 3.6; gx += 0.6) {
      addBoxMesh(0.09, 1.8, 0.09, gx, 5.1, -21.8, darkTrimMat);
    }
    for (const tx of [-4.8, 4.8]) {
      addBoxMesh(0.7, 2.3, 0.7, tx, 1.15, -21.1, darkTrimMat);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 0.95, 10),
        new THREE.MeshBasicMaterial({ color: '#ff8800' })
      );
      flame.position.set(tx, 2.68, -21.1);
      castleMansionGroup.add(flame);
    }

    // --- GOTHIC WINDOWS WITH BILLOWING VELVET CURTAINS & MOONBEAM SHAFTS ACROSS THE MANSION ---
    for (const wz of [-28.0, -35.0, -45.0, -52.0]) {
      addGothicWindowWithBillowingCurtains(-23.5, 3.0, wz, Math.PI / 2, '#ff8c38', '#ffbe73');
      addGothicWindowWithBillowingCurtains(-23.5, 9.0, wz, Math.PI / 2, '#38bdf8', '#7dd3fc');
    }
    for (const wz of [-28.0, -35.0, -45.0, -52.0]) {
      addGothicWindowWithBillowingCurtains(23.5, 3.0, wz, -Math.PI / 2, '#f97316', '#fdba74');
      addGothicWindowWithBillowingCurtains(23.5, 9.0, wz, -Math.PI / 2, '#a855f7', '#d8b4fe');
    }
    for (const wx of [-17.0, -10.5, 10.5, 17.0]) {
      addGothicWindowWithBillowingCurtains(wx, 3.0, -22.45, 0, '#ff7b29', '#fdba74');
      addGothicWindowWithBillowingCurtains(wx, 9.0, -22.45, 0, '#ec4899', '#f9a8d4');
    }

    // --- HANGING WROUGHT-IRON & GOLD CANDLE CHANDELIERS IN EVERY ROOM & HALL ---
    addGothicChandelier(0, 4.6, -27.5, '#ffbe42');
    addGothicChandelier(-15.5, 4.6, -30.5, '#ffbe42');
    addGothicChandelier(15.5, 4.6, -30.5, '#ffbe42');
    addGothicChandelier(-15.5, 4.6, -49.0, '#ff9d3b');
    addGothicChandelier(15.5, 4.6, -49.0, '#ffbe42');
    addGothicChandelier(0, 10.6, -53.0, '#ffbe42');
    addGothicChandelier(-15.5, 10.6, -40.0, '#34d399');
    addGothicChandelier(15.5, 10.6, -40.0, '#f43f5e');
    addGothicChandelier(-15.0, -1.4, -31.0, '#34d399');
    addGothicChandelier(0, -1.4, -52.0, '#38bdf8');
    addGothicChandelier(15.0, -1.4, -31.0, '#ef4444');

    // --- FLUTED GOTHIC STONE PILLARS & RIBBED GROIN-VAULT CEILING ARCHES ---
    for (const cz of [-26.0, -31.5, -48.5, -54.0]) {
      for (const cx of [-6.8, 6.8]) {
        addGothicColumn(cx, -6.0, cz, 5.8);
        addGothicColumn(cx, 0.0, cz, 5.8);
        addGothicColumn(cx, 6.0, cz, 5.8);
      }
      addBoxMesh(14.2, 0.38, 0.45, 0, 5.65, cz, darkTrimMat);
      addBoxMesh(16.4, 0.38, 0.45, 0, 11.65, cz, darkTrimMat);
    }

    const addPartitionWallWithDoorway = (
      axis: 'X' | 'Z',
      fixedCoord: number,
      spanStart: number,
      spanEnd: number,
      floorY: number,
      wallHeight = 5.8,
      doorWidth = 4.6
    ) => {
      const totalLen = spanEnd - spanStart;
      const mid = (spanStart + spanEnd) * 0.5;
      const segLen = Math.max(0.5, (totalLen - doorWidth) * 0.5);
      const seg1Center = spanStart + segLen * 0.5;
      const seg2Center = spanEnd - segLen * 0.5;
      const yCenter = floorY + wallHeight * 0.5;

      if (axis === 'Z') {
        addBoxMesh(0.45, wallHeight, segLen, fixedCoord, yCenter, seg1Center, gothicBrickMat, 0, true);
        addBoxMesh(0.45, wallHeight, segLen, fixedCoord, yCenter, seg2Center, gothicBrickMat, 0, true);
        addBoxMesh(0.55, 1.15, doorWidth, fixedCoord, floorY + wallHeight - 0.58, mid, darkTrimMat);
      } else {
        addBoxMesh(segLen, wallHeight, 0.45, seg1Center, yCenter, fixedCoord, gothicBrickMat, 0, true);
        addBoxMesh(segLen, wallHeight, 0.45, seg2Center, yCenter, fixedCoord, gothicBrickMat, 0, true);
        addBoxMesh(doorWidth, 1.15, 0.55, mid, floorY + wallHeight - 0.58, fixedCoord, darkTrimMat);
      }
    };

    addPartitionWallWithDoorway('Z', -7.0, -40.5, -22.5, -6.0);
    addPartitionWallWithDoorway('Z', 7.0, -40.5, -22.5, -6.0);
    addPartitionWallWithDoorway('X', -40.5, -23.5, -7.0, -6.0);
    addPartitionWallWithDoorway('X', -40.5, 7.0, 23.5, -6.0);

    addPartitionWallWithDoorway('Z', -7.0, -39.5, -22.5, 0.0);
    addPartitionWallWithDoorway('Z', 7.0, -39.5, -22.5, 0.0);
    addPartitionWallWithDoorway('X', -40.0, -23.5, -7.0, 0.0);
    addPartitionWallWithDoorway('X', -40.0, 7.0, 23.5, 0.0);
    addPartitionWallWithDoorway('Z', -7.0, -57.5, -40.5, 0.0);
    addPartitionWallWithDoorway('Z', 7.0, -57.5, -40.5, 0.0);

    addPartitionWallWithDoorway('Z', -8.0, -57.5, -22.5, 6.0);
    addPartitionWallWithDoorway('Z', 8.0, -57.5, -22.5, 6.0);

    for (let rz = -25; rz >= -55; rz -= 4.5) {
      const leftBeam = new THREE.Mesh(new THREE.BoxGeometry(19.5, 0.48, 0.48), woodRafterMat);
      leftBeam.position.set(-8.2, 16.5, rz);
      leftBeam.rotation.z = Math.atan2(8.5, 16.0);
      castleMansionGroup.add(leftBeam);

      const rightBeam = new THREE.Mesh(new THREE.BoxGeometry(19.5, 0.48, 0.48), woodRafterMat);
      rightBeam.position.set(8.2, 16.5, rz);
      rightBeam.rotation.z = -Math.atan2(8.5, 16.0);
      castleMansionGroup.add(rightBeam);
    }

    const clockFace = new THREE.Mesh(
      new THREE.CircleGeometry(2.8, 32),
      new THREE.MeshBasicMaterial({ color: '#ffae38', side: THREE.DoubleSide })
    );
    clockFace.position.set(0, 15.5, -22.45);
    castleMansionGroup.add(clockFace);

    const belfryBellGroup = new THREE.Group();
    belfryBellGroup.position.set(0, 18.2, -34.0);
    const bellMesh = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.95, 20), goldFrameMat);
    bellMesh.position.y = -0.95;
    belfryBellGroup.add(bellMesh);
    castleMansionGroup.add(belfryBellGroup);

    // --- RICH REALISTIC FURNITURE, HEARTHS & SET DRESSING ACROSS ALL 12 ROOMS ---
    addGothicFireplace(-15.0, 0.0, -57.2, 0);
    addGothicFireplace(15.0, 0.0, -57.2, 0);
    addGothicFireplace(16.5, 6.0, -57.2, 0);

    const emeraldGlowMat = new THREE.MeshBasicMaterial({ color: '#10b981' });
    for (const vz of [-28, -35]) {
      const vat = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.5, 18), emeraldGlowMat);
      vat.position.set(-18.5, -4.75, vz);
      castleMansionGroup.add(vat);
    }
    addBoxMesh(2.6, 0.95, 4.2, -13.5, -5.52, -31.5, woodRafterMat, 0, true);

    for (const sx of [-14.0, 0.0, 14.0]) {
      addBoxMesh(2.8, 0.65, 4.6, sx, -5.65, -51.5, stoneWallMat, 0, true);
      addBoxMesh(2.2, 0.85, 3.8, sx, -5.0, -51.5, darkTrimMat);
    }

    const ritualRing = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 2.9, 32),
      new THREE.MeshBasicMaterial({ color: '#ef4444', side: THREE.DoubleSide })
    );
    ritualRing.rotation.x = -Math.PI / 2;
    ritualRing.position.set(14.5, -5.95, -32.0);
    castleMansionGroup.add(ritualRing);
    addBoxMesh(2.4, 1.15, 1.3, 14.5, -5.42, -32.0, darkTrimMat, 0, true);

    for (const bz of [-27.5, -33.5]) {
      addBoxMesh(1.2, 0.65, 2.8, -14.5, 0.32, bz, redCarpetMat, 0, true);
    }

    for (let pIdx = -6; pIdx <= 6; pIdx++) {
      const pipeH = 4.8 - Math.abs(pIdx) * 0.3;
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, pipeH, 12),
        goldFrameMat
      );
      pipe.position.set(22.8, 1.0 + pipeH * 0.5, -34.5 + pIdx * 0.42);
      castleMansionGroup.add(pipe);
    }
    for (const pewZ of [-26.5, -29.5, -32.5]) {
      addBoxMesh(4.6, 0.55, 0.85, 14.5, 0.28, pewZ, woodRafterMat, 0, true);
      addBoxMesh(4.6, 1.05, 0.18, 14.5, 0.52, pewZ + 0.35, woodRafterMat);
    }

    addBoxMesh(3.2, 0.95, 10.2, -15.0, 0.48, -48.5, woodRafterMat, 0, true);
    addBoxMesh(1.4, 0.98, 9.8, -15.0, 0.5, -48.5, redCarpetMat);
    for (let cZ = -44.5; cZ >= -52.5; cZ -= 2.0) {
      for (const side of [-1, 1]) {
        const chX = -15.0 + side * 2.15;
        addBoxMesh(0.65, 0.55, 0.65, chX, 0.28, cZ, woodRafterMat);
        addBoxMesh(0.14, 1.35, 0.65, chX + side * 0.26, 0.68, cZ, redCarpetMat);
        const goblet = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.07, 0.26, 10),
          goldFrameMat
        );
        goblet.position.set(-15.0 + side * 0.85, 1.12, cZ);
        castleMansionGroup.add(goblet);
      }
    }

    for (const shelfZ of [-43.5, -48.5, -53.5]) {
      addBoxMesh(0.95, 4.9, 3.8, 22.7, 2.45, shelfZ, woodRafterMat, 0, true);
      for (let rowY = 0.9; rowY <= 4.1; rowY += 0.8) {
        addBoxMesh(0.75, 0.52, 3.3, 22.55, rowY, shelfZ, redCarpetMat);
      }
    }
    addBoxMesh(2.4, 0.88, 3.4, 14.5, 0.44, -48.5, woodRafterMat, 0, true);

    const cauldron = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 0.98, 1.4, 20),
      darkTrimMat
    );
    cauldron.position.set(-15.0, 6.7, -40.0);
    castleMansionGroup.add(cauldron);
    registerBoxCollider(-15.0, 6.7, -40.0 + CASTLE_Z_SHIFT, 2.5, 1.8, 2.5);
    const cauldronBroth = new THREE.Mesh(
      new THREE.CircleGeometry(1.22, 20),
      emeraldGlowMat
    );
    cauldronBroth.rotation.x = -Math.PI / 2;
    cauldronBroth.position.set(-15.0, 7.42, -40.0);
    castleMansionGroup.add(cauldronBroth);

    addBoxMesh(3.8, 0.88, 4.6, 16.5, 6.44, -45.0, redCarpetMat, 0, true);
    for (const [px, pz] of [
      [14.7, -42.8],
      [18.3, -42.8],
      [14.7, -47.2],
      [18.3, -47.2],
    ]) {
      addBoxMesh(0.24, 3.9, 0.24, px, 7.95, pz, woodRafterMat);
    }
    addBoxMesh(4.0, 0.28, 4.8, 16.5, 9.9, -45.0, redCarpetMat);

    // ==========================================================================
    // 3. INTERACTIVE ROADSIDE BILLBOARDS (WITH WARM GROUND FLOODLIGHTS & JACK-O'-LANTERNS)
    //    & CASTLE WALL MOVIE PAINTINGS
    // ==========================================================================
    const selectableMovieMeshes: THREE.Object3D[] = [];
    const billboardPosterMeshes: Record<string, THREE.MeshStandardMaterial[]> = {};

    billboardNodes.forEach((node) => {
      const posterTex = textureLoader.load(node.posterUrl);
      posterTex.colorSpace = THREE.SRGBColorSpace;

      const isSelected = node.id === selectedBillboardId;
      const matsForNode: THREE.MeshStandardMaterial[] = [];

      const bbGroup = new THREE.Group();
      bbGroup.position.set(node.position[0], node.position[1], node.position[2]);
      bbGroup.rotation.y = node.rotationY;
      registerBoxCollider(node.position[0], 2.0, node.position[2], 2.2, 4.0, 2.2);

      for (const px of [-2.4, 2.4]) {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.24, 6.4, 10),
          woodRafterMat
        );
        leg.position.set(px, 3.2, -0.25);
        bbGroup.add(leg);
      }

      const boardFrame = new THREE.Mesh(
        new THREE.BoxGeometry(6.9, 4.3, 0.34),
        woodRafterMat
      );
      boardFrame.position.set(0, 4.0, 0);
      bbGroup.add(boardFrame);

      const trimBorder = new THREE.Mesh(
        new THREE.BoxGeometry(6.4, 3.75, 0.36),
        goldFrameMat
      );
      trimBorder.position.set(0, 4.0, 0.01);
      bbGroup.add(trimBorder);

      const posterMat = new THREE.MeshStandardMaterial({
        map: posterTex,
        emissiveMap: posterTex,
        emissive: new THREE.Color(isSelected ? '#ffae42' : '#e5d8c5'),
        emissiveIntensity: isSelected ? 1.05 : 0.68,
        roughness: 0.28,
        metalness: 0.08,
      });
      matsForNode.push(posterMat);

      const posterMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.1, 3.45), posterMat);
      posterMesh.position.set(0, 4.0, 0.21);
      posterMesh.userData = { movieNodeId: node.id, isCastlePainting: false };
      selectableMovieMeshes.push(posterMesh);
      bbGroup.add(posterMesh);

      for (const fx of [-1.8, 1.8]) {
        const floodBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.28, 0.38),
          darkTrimMat
        );
        floodBox.position.set(fx, 0.2, 1.45);
        bbGroup.add(floodBox);
        const floodLens = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 10, 10),
          new THREE.MeshBasicMaterial({ color: '#ffbe42' })
        );
        floodLens.position.set(fx, 0.34, 1.4);
        bbGroup.add(floodLens);
        const coneBeam = new THREE.Mesh(
          new THREE.ConeGeometry(1.65, 3.8, 14, 1, true),
          new THREE.MeshBasicMaterial({
            color: '#ffae42',
            transparent: true,
            opacity: 0.12,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        coneBeam.position.set(fx, 2.1, 0.78);
        coneBeam.rotation.x = -0.35;
        bbGroup.add(coneBeam);
      }

      scene.add(bbGroup);

      if (node.castlePaintingPos) {
        const [cpx, cpy, cpz] = node.castlePaintingPos;
        const paintGroup = new THREE.Group();
        paintGroup.position.set(cpx, cpy, cpz);
        paintGroup.rotation.y = node.castlePaintingRotY || 0;

        const outerFrame = new THREE.Mesh(
          new THREE.BoxGeometry(3.45, 2.4, 0.18),
          goldFrameMat
        );
        paintGroup.add(outerFrame);

        const innerMatte = new THREE.Mesh(
          new THREE.BoxGeometry(3.08, 2.04, 0.21),
          redCarpetMat
        );
        paintGroup.add(innerMatte);

        const paintingCanvasMat = new THREE.MeshStandardMaterial({
          map: posterTex,
          emissiveMap: posterTex,
          emissive: new THREE.Color(isSelected ? '#ffbe42' : '#f0e2c8'),
          emissiveIntensity: isSelected ? 1.1 : 0.75,
          roughness: 0.24,
          metalness: 0.06,
        });
        matsForNode.push(paintingCanvasMat);

        const paintingCanvas = new THREE.Mesh(
          new THREE.PlaneGeometry(2.85, 1.82),
          paintingCanvasMat
        );
        paintingCanvas.position.set(0, 0, 0.12);
        paintingCanvas.userData = {
          movieNodeId: node.id,
          isCastlePainting: true,
          roomId: node.castleRoomId,
        };
        selectableMovieMeshes.push(paintingCanvas);
        paintGroup.add(paintingCanvas);

        const lightBar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 1.7, 10),
          goldFrameMat
        );
        lightBar.rotation.z = Math.PI / 2;
        lightBar.position.set(0, 1.34, 0.28);
        paintGroup.add(lightBar);

        // Note: `node.castlePaintingPos` is already in World Z (`-36 .. -71`), so add directly to `scene`!
        scene.add(paintGroup);
      }

      billboardPosterMeshes[node.id] = matsForNode;
    });

    const raycaster = new THREE.Raycaster();
    const mouseNdc = new THREE.Vector2();
    const handleCanvasPointerDown = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouseNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouseNdc, camera);
      const hits = raycaster.intersectObjects(selectableMovieMeshes, false);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        const movieNodeId = hitObj.userData?.movieNodeId;
        if (movieNodeId && hits[0].distance < 34) {
          const foundNode = billboardNodes.find((b) => b.id === movieNodeId);
          if (foundNode) {
            setSelectedBillboardId(foundNode.id);
            halloweenAudio.playFlashlightClick();
            setCombatLogText(
              hitObj.userData?.isCastlePainting
                ? `🖼️ Selected Castle Wall Painting: "${foundNode.title}" (${foundNode.year}) — Click [Watch Full Movie] to screen!`
                : `🪧 Selected Roadside Billboard: "${foundNode.title}" (${foundNode.year}) — Click [Watch Full Movie] to screen!`
            );
            return;
          }
        }
      }
      triggerBatAttack();
    };
    renderer.domElement.addEventListener('mousedown', handleCanvasPointerDown);

    // ==========================================================================
    // 4. LOAD ALL CONSOLE-GRADE MIXAMO CHARACTER GLBS + LOCK IN BONE REST POSES
    // ==========================================================================
    const gltfLoader = new GLTFLoader();
    const loadedTemplates: Record<string, THREE.Object3D> = {};

    const attachLoadedRigToSlot = (slotGroup: THREE.Group, templateKey: string, scale = 1.0) => {
      const tpl = loadedTemplates[templateKey];
      if (!tpl) return false;
      while (slotGroup.children.length > 0) {
        slotGroup.remove(slotGroup.children[0]);
      }
      const cloned = SkeletonUtils.clone(tpl);
      cloned.scale.setScalar(scale);
      cloned.traverse((obj) => {
        // Store the exact factory rest quaternion & position on every bone so
        // skeletal animations NEVER invert or overwrite limb rest poses!
        obj.userData.restQuat = obj.quaternion.clone();
        obj.userData.restPos = obj.position.clone();
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.castShadow = true;
          m.receiveShadow = true;
          m.frustumCulled = false;
        }
      });
      slotGroup.add(cloned);
      return true;
    };

    const playerRoot = new THREE.Group();
    playerRoot.position.set(0, 0, 52.0);
    scene.add(playerRoot);

    const maleSurvivorGroup = new THREE.Group();
    maleSurvivorGroup.rotation.y = Math.PI;
    const femaleSurvivorGroup = new THREE.Group();
    femaleSurvivorGroup.rotation.y = Math.PI;
    femaleSurvivorGroup.visible = false;
    playerRoot.add(maleSurvivorGroup);
    playerRoot.add(femaleSurvivorGroup);

    // Bonus AI Helper Character: Pumpkin Patch (Melvin Lester) who comes in and helps fight monsters!
    const pumpkinAllyRoot = new THREE.Group();
    pumpkinAllyRoot.position.set(2.4, 0, 50.0);
    scene.add(pumpkinAllyRoot);
    const pumpkinHeroGroup = new THREE.Group();
    pumpkinHeroGroup.rotation.y = Math.PI;
    pumpkinAllyRoot.add(pumpkinHeroGroup);
    const allySlashMat = new THREE.MeshBasicMaterial({
      color: '#ff6a00',
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
    });
    const allySlashRibbon = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 2.25, 24, 1, -Math.PI * 0.65, Math.PI * 1.3),
      allySlashMat
    );
    allySlashRibbon.rotation.x = -Math.PI / 2;
    allySlashRibbon.position.set(0, 1.18, -0.35);
    pumpkinAllyRoot.add(allySlashRibbon);

    const slashRibbonMat = new THREE.MeshBasicMaterial({
      color: '#ff4500',
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
    });
    const slashRibbon = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 2.35, 24, 1, -Math.PI * 0.65, Math.PI * 1.3),
      slashRibbonMat
    );
    slashRibbon.rotation.x = -Math.PI / 2;
    slashRibbon.position.set(0, 1.18, -0.35);
    playerRoot.add(slashRibbon);

    const parryDomeMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.0,
      wireframe: true,
    });
    const parryDome = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 12), parryDomeMat);
    parryDome.position.set(0, 1.1, 0);
    playerRoot.add(parryDome);

    // ==========================================================================
    // 5. ROAMING MONSTERS (ALONG THE PUMPKIN PATCH HIGHWAY, CROSSROADS & CASTLE!)
    // ==========================================================================
    interface MonsterAgent {
      id: number;
      type: 'ZOMBIE' | 'WEREWOLF' | 'GHOST';
      group: THREE.Group;
      rigSlot: THREE.Group;
      hpBarFill: THREE.Mesh;
      x: number;
      y: number;
      z: number;
      floorY: number;
      homeX: number;
      homeZ: number;
      vx: number;
      vz: number;
      hp: number;
      maxHp: number;
      speed: number;
      hitFlashTimer: number;
      respawnTimer: number;
      phaseOffset: number;
    }

    const monsters: MonsterAgent[] = [];
    const monsterConfigs: Array<{
      type: 'ZOMBIE' | 'WEREWOLF' | 'GHOST';
      homeX: number;
      homeZ: number;
      floorY: number;
      speed: number;
      maxHp: number;
    }> = [
      { type: 'ZOMBIE', homeX: -6.5, homeZ: 34.0, floorY: 0, speed: 2.4, maxHp: 60 },
      { type: 'WEREWOLF', homeX: 8.5, homeZ: 18.0, floorY: 0, speed: 3.7, maxHp: 90 },
      { type: 'GHOST', homeX: -8.0, homeZ: 6.0, floorY: 0, speed: 2.9, maxHp: 50 },
      { type: 'ZOMBIE', homeX: 6.5, homeZ: -4.0, floorY: 0, speed: 2.5, maxHp: 60 },
      { type: 'ZOMBIE', homeX: 0.0, homeZ: -65.0, floorY: -6.0, speed: 2.2, maxHp: 70 },
      { type: 'WEREWOLF', homeX: -15.0, homeZ: -62.0, floorY: 0.0, speed: 3.4, maxHp: 95 },
      { type: 'GHOST', homeX: 15.0, homeZ: -44.0, floorY: 0.0, speed: 2.8, maxHp: 55 },
      { type: 'GHOST', homeX: 0.0, homeZ: -44.0, floorY: 12.0, speed: 3.0, maxHp: 65 },
    ];

    monsterConfigs.forEach((cfg, idx) => {
      const mGroup = new THREE.Group();
      const rigSlot = new THREE.Group();
      mGroup.add(rigSlot);

      const hpBg = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 0.13),
        new THREE.MeshBasicMaterial({ color: '#1f122b', side: THREE.DoubleSide })
      );
      hpBg.position.y = 2.55;
      mGroup.add(hpBg);

      const hpFill = new THREE.Mesh(
        new THREE.PlaneGeometry(1.04, 0.09),
        new THREE.MeshBasicMaterial({
          color:
            cfg.type === 'ZOMBIE'
              ? '#84cc16'
              : cfg.type === 'WEREWOLF'
              ? '#f97316'
              : '#38bdf8',
          side: THREE.DoubleSide,
        })
      );
      hpFill.position.set(0, 2.55, 0.01);
      mGroup.add(hpFill);

      mGroup.position.set(cfg.homeX, cfg.floorY, cfg.homeZ);
      scene.add(mGroup);

      monsters.push({
        id: idx,
        type: cfg.type,
        group: mGroup,
        rigSlot,
        hpBarFill: hpFill,
        x: cfg.homeX,
        y: cfg.floorY,
        z: cfg.homeZ,
        floorY: cfg.floorY,
        homeX: cfg.homeX,
        homeZ: cfg.homeZ,
        vx: 0,
        vz: 0,
        hp: cfg.maxHp,
        maxHp: cfg.maxHp,
        speed: cfg.speed,
        hitFlashTimer: 0,
        respawnTimer: 0,
        phaseOffset: idx * 1.5,
      });
    });

    // ==========================================================================
    // 6. SPARSE MOVIE CHARACTER 3D RIG ACTORS & PUMPKIN PATCH ARMORED TANK
    // ==========================================================================
    const encounterStageGroup = new THREE.Group();
    scene.add(encounterStageGroup);

    const tankGroup = new THREE.Group();
    tankGroup.visible = false;
    encounterStageGroup.add(tankGroup);

    const ppBladesGroup = new THREE.Group();
    ppBladesGroup.visible = false;
    encounterStageGroup.add(ppBladesGroup);

    const miriamFlightGroup = new THREE.Group();
    miriamFlightGroup.visible = false;
    encounterStageGroup.add(miriamFlightGroup);

    const stitchRoadGroup = new THREE.Group();
    stitchRoadGroup.visible = false;
    encounterStageGroup.add(stitchRoadGroup);

    const katrinaCraneGroup = new THREE.Group();
    katrinaCraneGroup.visible = false;
    encounterStageGroup.add(katrinaCraneGroup);

    const katrinaSubSlot = new THREE.Group();
    katrinaSubSlot.position.set(-1.3, 0, 0);
    const craneSubSlot = new THREE.Group();
    craneSubSlot.position.set(1.3, 0, 0);
    katrinaCraneGroup.add(katrinaSubSlot);
    katrinaCraneGroup.add(craneSubSlot);

    const lilBooDriftGroup = new THREE.Group();
    lilBooDriftGroup.visible = false;
    encounterStageGroup.add(lilBooDriftGroup);

    let loadedBundleCounter = 0;
    const markBundleReady = () => {
      loadedBundleCounter += 1;
      setGlbLoadedCount(loadedBundleCounter);
    };

    gltfLoader
      .loadAsync('/models/halloween/survivor_combat_rigs.glb')
      .then((gltf) => {
        ['MaleSurvivor_Rig', 'FemaleSurvivor_Rig'].forEach((name) => {
          const obj = gltf.scene.getObjectByName(name);
          if (obj) {
            obj.position.set(0, 0, 0);
            loadedTemplates[name] = obj;
          }
        });
        attachLoadedRigToSlot(maleSurvivorGroup, 'MaleSurvivor_Rig', 1.05);
        attachLoadedRigToSlot(femaleSurvivorGroup, 'FemaleSurvivor_Rig', 1.05);
        attachLoadedRigToSlot(katrinaSubSlot, 'FemaleSurvivor_Rig', 1.05);
        markBundleReady();
      })
      .catch((err) => console.warn('Survivor GLB load error:', err));

    gltfLoader
      .loadAsync('/models/halloween/monsters_enemy_rigs.glb')
      .then((gltf) => {
        ['Zombie_Rig', 'Werewolf_Rig', 'Ghost_Rig'].forEach((name) => {
          const obj = gltf.scene.getObjectByName(name);
          if (obj) {
            obj.position.set(0, 0, 0);
            loadedTemplates[name] = obj;
          }
        });
        monsters.forEach((m) => {
          const key =
            m.type === 'ZOMBIE'
              ? 'Zombie_Rig'
              : m.type === 'WEREWOLF'
              ? 'Werewolf_Rig'
              : 'Ghost_Rig';
          attachLoadedRigToSlot(m.rigSlot, key, 1.08);
        });
        attachLoadedRigToSlot(lilBooDriftGroup, 'Ghost_Rig', 0.92);
        markBundleReady();
      })
      .catch((err) => console.warn('Monsters GLB load error:', err));

    gltfLoader
      .loadAsync('/models/halloween/pumpkin_patch_cast_rigs.glb')
      .then((gltf) => {
        ['PumpkinPatch_Rig', 'Miriam_Rig', 'Stitch_Rig', 'RoboBones_Rig'].forEach(
          (name) => {
            const obj = gltf.scene.getObjectByName(name);
            if (obj) {
              obj.position.set(0, 0, 0);
              loadedTemplates[name] = obj;
            }
          }
        );
        // Attach the iconic Pumpkin Patch (Melvin Lester) 3D Rig as the Playable Hero!
        attachLoadedRigToSlot(pumpkinHeroGroup, 'PumpkinPatch_Rig', 1.08);
        attachLoadedRigToSlot(ppBladesGroup, 'PumpkinPatch_Rig', 1.12);
        attachLoadedRigToSlot(miriamFlightGroup, 'Miriam_Rig', 1.12);
        attachLoadedRigToSlot(stitchRoadGroup, 'Stitch_Rig', 1.10);
        attachLoadedRigToSlot(craneSubSlot, 'RoboBones_Rig', 1.10);
        markBundleReady();
      })
      .catch((err) => console.warn('Cast GLB load error:', err));

    gltfLoader
      .loadAsync('/models/halloween/haunted_castle_fortress.glb')
      .then((gltf) => {
        const tankObj = gltf.scene.getObjectByName('PumpkinPatch_Tank');
        if (tankObj) {
          tankObj.position.set(0, 0, 0);
          loadedTemplates['PumpkinPatch_Tank'] = tankObj;
          attachLoadedRigToSlot(tankGroup, 'PumpkinPatch_Tank', 1.15);
        }
        // This bundle also contains an older, differently sized castle shell.
        // The walkable castle above owns the architecture and collision layout.
        markBundleReady();
      })
      .catch((err) => console.warn('Tank/Castle GLB load error:', err));

    // Load Headless Blender 5.0.1 RAVENCREST SHOWCASE PROPS (`ravencrest_showcase_props.glb`)
    // — Suits of Knight Armor with Halberds, King's Throne, Four-Poster Canopy Beds, Standing Braziers & Observatory Telescope!
    gltfLoader
      .loadAsync('/models/halloween/ravencrest_showcase_props.glb')
      .then((gltf) => {
        const knightTpl = gltf.scene.getObjectByName('Ravencrest_KnightArmor');
        const throneTpl = gltf.scene.getObjectByName('Ravencrest_ThroneChair');
        const bedTpl = gltf.scene.getObjectByName('Ravencrest_CanopyBed');
        const brazierTpl = gltf.scene.getObjectByName('Ravencrest_StandingBrazier');
        const telescopeTpl = gltf.scene.getObjectByName('Ravencrest_Telescope');

        // 8 Full Suits of Medieval Plate Armor flanking the Grand Entrance Hall Piers & Gatehouse (`creation_3752887346.png`)
        if (knightTpl) {
          const armorPlacements: Array<[number, number, number, number]> = [
            [-5.6, 0.0, -25.2, Math.PI / 2],
            [5.6, 0.0, -25.2, -Math.PI / 2],
            [-5.6, 0.0, -30.8, Math.PI / 2],
            [5.6, 0.0, -30.8, -Math.PI / 2],
            [-5.6, 0.0, -49.2, Math.PI / 2],
            [5.6, 0.0, -49.2, -Math.PI / 2],
            [-5.6, 6.0, -52.5, Math.PI / 2],
            [5.6, 6.0, -52.5, -Math.PI / 2],
          ];
          armorPlacements.forEach(([ax, ay, az, rotY]) => {
            const kClone = knightTpl.clone(true);
            kClone.position.set(ax, ay, az);
            kClone.rotation.y = rotY;
            kClone.scale.setScalar(1.12);
            castleMansionGroup.add(kClone);
          });
        }

        // King's Gothic Throne Chair on the North Grand Gallery & Throne Dais (`creation_3752891684.png`)
        if (throneTpl) {
          for (const [tx, ty, tz, rotY] of [
            [0.0, 0.0, -31.2, 0],
            [0.0, 6.0, -56.2, 0],
          ] as Array<[number, number, number, number]>) {
            const tClone = throneTpl.clone(true);
            tClone.position.set(tx, ty, tz);
            tClone.rotation.y = rotY;
            tClone.scale.setScalar(1.25);
            castleMansionGroup.add(tClone);
          }
        }

        // Four-Poster Gothic Velvet Canopy Beds in the Royal Chambers (`creation_3752894391.png`)
        if (bedTpl) {
          for (const [bx, by, bz, rotY] of [
            [16.5, 6.0, -48.5, 0],
            [-16.5, 6.0, -30.5, 0],
          ] as Array<[number, number, number, number]>) {
            const bClone = bedTpl.clone(true);
            bClone.position.set(bx, by, bz);
            bClone.rotation.y = rotY;
            bClone.scale.setScalar(1.15);
            castleMansionGroup.add(bClone);
          }
        }

        // Wrought-Iron Standing Fire Braziers inside the Grand Entrance Doors & Stair Landing (`creation_3752887346.png`)
        if (brazierTpl) {
          for (const [brx, bry, brz] of [
            [-3.5, 0.0, -23.5],
            [3.5, 0.0, -23.5],
            [-3.5, 6.0, -50.5],
            [3.5, 6.0, -50.5],
          ] as Array<[number, number, number]>) {
            const brClone = brazierTpl.clone(true);
            brClone.position.set(brx, bry, brz);
            brClone.scale.setScalar(1.1);
            addVolumetricLightHalo(brClone, 0, 1.45, 0, 2.2, '#ff7b00', 0.65);
            castleMansionGroup.add(brClone);
          }
        }

        // 4th-Floor / Upper Observatory Brass Equatorial Telescope (`creation_3752884004.png`)
        if (telescopeTpl) {
          const telClone = telescopeTpl.clone(true);
          telClone.position.set(0.0, 12.0, -30.5);
          telClone.scale.setScalar(1.25);
          castleMansionGroup.add(telClone);
        }
      })
      .catch((err) => console.warn('Ravencrest props GLB load error:', err));

    // ==========================================================================
    // 6B. LOAD REAL 3D WIND-BLOWN TREES (`quiver_tree_01.glb`), FERNS (`fern_02.glb`),
    //     STREET LANTERNS (`Lantern.glb`) & GRIMOIRES (`book.glb`)
    // ==========================================================================
    gltfLoader
      .loadAsync('/models/flora/quiver_tree_01.glb')
      .then((gltf) => {
        const treeTpl = gltf.scene;
        treeTpl.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            const m = c as THREE.Mesh;
            m.castShadow = true;
            m.receiveShadow = true;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => {
              if (mat) applyWindSwayShader(mat, 'TREE_CANOPY');
            });
          }
        });
        const treeCoords: Array<[number, number, number]> = [
          [-16, 48, 2.3],
          [16, 48, 2.4],
          [-18, 34, 2.5],
          [18, 34, 2.5],
          [-24, 10, 2.6],
          [24, 10, 2.6],
          [-18, -4, 2.8],
          [18, -4, 2.8],
          [-32, -40, 3.2],
          [32, -40, 3.2],
          [-34, -62, 3.4],
          [34, -62, 3.4],
        ];
        treeCoords.forEach(([tx, tz, sc], idx) => {
          const tClone = treeTpl.clone(true);
          tClone.position.set(tx, 0, tz);
          tClone.rotation.y = idx * 1.15;
          tClone.scale.setScalar(sc);
          scene.add(tClone);
        });
      })
      .catch(() => {});

    gltfLoader
      .loadAsync('/models/flora/fern_02.glb')
      .then((gltf) => {
        const fernTpl = gltf.scene;
        fernTpl.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            const m = c as THREE.Mesh;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => {
              if (mat) applyWindSwayShader(mat, 'FERN_PLANT');
            });
          }
        });
        for (let fIdx = 0; fIdx < 32; fIdx++) {
          const side = fIdx % 2 === 0 ? -1 : 1;
          const fx = side * (6.8 + (fIdx % 6) * 3.2);
          const fz = 54 - fIdx * 2.0;
          if (Math.abs(fz - 20) < 5.2) continue;
          const fClone = fernTpl.clone(true);
          fClone.position.set(fx, 0, fz);
          fClone.rotation.y = fIdx * 0.9;
          fClone.scale.setScalar(1.4 + (fIdx % 3) * 0.35);
          scene.add(fClone);
        }
      })
      .catch(() => {});

    gltfLoader
      .loadAsync('/models/halloween/base_rigs/Lantern.glb')
      .then((gltf) => {
        const lanternTpl = gltf.scene;
        const lanternCoords: Array<[number, number]> = [
          [-5.2, 44.0],
          [5.2, 44.0],
          [-5.2, 28.0],
          [5.2, 28.0],
          [-5.2, 10.0],
          [5.2, 10.0],
          [-5.2, -10.0],
          [5.2, -10.0],
        ];
        lanternCoords.forEach(([lx, lz]) => {
          const lClone = lanternTpl.clone(true);
          lClone.position.set(lx, 0, lz);
          lClone.scale.setScalar(0.18);
          scene.add(lClone);
        });
      })
      .catch(() => {});

    gltfLoader
      .loadAsync('/models/mascots/props/book.glb')
      .then((gltf) => {
        const bookTpl = gltf.scene;
        const bookSpots: Array<[number, number, number]> = [
          [14.5, 0.95, -48.5],
          [-13.5, -4.95, -31.5],
          [14.5, -4.8, -32.0],
        ];
        bookSpots.forEach(([bx, by, bz], idx) => {
          const bClone = bookTpl.clone(true);
          bClone.position.set(bx, by, bz);
          bClone.scale.setScalar(0.85);
          bClone.rotation.y = idx * 1.2;
          castleMansionGroup.add(bClone);
        });
      })
      .catch(() => {});

    // ==========================================================================
    // 7. MOLOTOV COCKTAIL PROJECTILES & EXPLOSIONS
    // ==========================================================================
    interface ActiveMolotov {
      mesh: THREE.Group;
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      floorY: number;
    }
    interface ActiveExplosion {
      mesh: THREE.Mesh;
      age: number;
      maxAge: number;
      x: number;
      y: number;
      z: number;
    }
    const activeMolotovs: ActiveMolotov[] = [];
    const activeExplosions: ActiveExplosion[] = [];
    const explosionGeo = new THREE.SphereGeometry(1.0, 14, 12);

    // Reward Player with +XP, +HP Restoration, Level-Ups & Council Callouts on Slaying Any Creature!
    const grantMonsterSlayReward = (monsterType: 'ZOMBIE' | 'WEREWOLF' | 'GHOST', sourceLabel: string) => {
      const p = playerStateRef.current;
      const xpGain = monsterType === 'WEREWOLF' ? 80 : monsterType === 'GHOST' ? 65 : 45;
      const hpGain = monsterType === 'WEREWOLF' ? 22 : monsterType === 'GHOST' ? 18 : 14;
      const creatureName =
        monsterType === 'WEREWOLF'
          ? 'Werewolf (Moon Hunger)'
          : monsterType === 'GHOST'
          ? 'NightLord Vampire/Specter'
          : 'Ravencrest Zombie';

      p.kills += 1;
      p.xp += xpGain;
      const xpThreshold = p.level * 150;
      let leveledUp = false;
      if (p.xp >= xpThreshold) {
        p.level += 1;
        p.maxHp += 20;
        p.hp = p.maxHp;
        leveledUp = true;
      } else {
        p.hp = Math.min(p.maxHp, p.hp + hpGain);
      }

      setMonstersSlain(p.kills);
      setPlayerHp(Math.round((p.hp / p.maxHp) * 100));
      setPlayerMaxHp(p.maxHp);
      setPlayerXp(p.xp);
      setPlayerLevel(p.level);

      const popupId = Date.now() + Math.floor(Math.random() * 1000);
      const popupColor = leveledUp ? '#facc15' : monsterType === 'WEREWOLF' ? '#f97316' : '#34d399';
      const popupLabel = leveledUp
        ? `⭐ LEVEL UP! LVL ${p.level} (+20 MAX HP & +18% DMG!) • +${xpGain} XP`
        : `+${xpGain} XP  •  +${hpGain} HP  [${creatureName} Slain!]`;

      setRewardPopups((prev) => [
        ...prev.slice(-3),
        { id: popupId, xp: xpGain, hp: hpGain, label: popupLabel, color: popupColor },
      ]);
      window.setTimeout(() => {
        setRewardPopups((prev) => prev.filter((item) => item.id !== popupId));
      }, 2800);

      if (leveledUp) {
        announceCouncilDirective(
          `🎨 ART COUNCIL: "Level ${p.level} ascension! Notice how the crimson katana bloom and volumetric fog rim-lighting frame the survivor silhouette."`,
          `🎮 GAME COUNCIL: "LEVEL ${p.level} REACHED! Max HP boosted to ${p.maxHp} and melee lethality increased by +${(p.level - 1) * 18}%!"`,
          `Level ${p.level} reached! Maximum health and katana lethality increased.`
        );
      } else if (p.kills % 2 === 1) {
        announceCouncilDirective(
          undefined,
          `🎮 GAME COUNCIL: "${sourceLabel} slew a ${creatureName}! Awarded +${xpGain} XP and +${hpGain} HP Leech (${p.xp}/${p.level * 150} XP to Level ${p.level + 1})."`
        );
      }
    };

    const spawnExplosionAt = (ex: number, ey: number, ez: number, radius = 6.2, damage = 65) => {
      halloweenAudio.playMolotovExplosionSfx();
      const expMat = new THREE.MeshBasicMaterial({
        color: '#ff6a00',
        transparent: true,
        opacity: 0.9,
      });
      const expMesh = new THREE.Mesh(explosionGeo, expMat);
      expMesh.position.set(ex, ey + 0.6, ez);
      scene.add(expMesh);

      actionDynamicLight.position.set(ex, ey + 2.2, ez);
      actionDynamicLight.intensity = 14.0;

      activeExplosions.push({
        mesh: expMesh,
        age: 0,
        maxAge: 0.65,
        x: ex,
        y: ey,
        z: ez,
      });

      let killedAny = 0;
      monsters.forEach((m) => {
        if (m.respawnTimer > 0) return;
        if (Math.abs(m.y - ey) > 3.5) return;
        const d = Math.hypot(m.x - ex, m.z - ez);
        if (d <= radius) {
          m.hp -= damage;
          m.hitFlashTimer = 0.35;
          const pushAngle = Math.atan2(m.x - ex, m.z - ez);
          m.vx += Math.sin(pushAngle) * 11.0;
          m.vz += Math.cos(pushAngle) * 11.0;
          if (m.hp <= 0) {
            m.respawnTimer = 8.5;
            m.group.visible = false;
            grantMonsterSlayReward(m.type, 'Molotov Incendiary');
            killedAny += 1;
          }
        }
      });

      if (killedAny > 0) {
        setMonstersSlain(playerStateRef.current.kills);
        setCombatLogText(
          `🔥 EXPLOSIVE DETONATION! Incinerated ${killedAny} monster${
            killedAny > 1 ? 's' : ''
          }! Total Slain: ${playerStateRef.current.kills}`
        );
      }
    };

    // ==========================================================================
    // 8. KEYBOARD CONTROLS (WASD + Jump + Stances + Parry + Dash)
    // ==========================================================================
    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      keys[k] = true;

      if (k === 'f') {
        e.preventDefault();
        triggerBatAttack();
      } else if (k === 'g') {
        e.preventDefault();
        triggerMolotovThrow();
      } else if (k === '1') {
        e.preventDefault();
        cycleBushidoStance('HIGH');
      } else if (k === '2') {
        e.preventDefault();
        cycleBushidoStance('MID');
      } else if (k === '3') {
        e.preventDefault();
        cycleBushidoStance('LOW');
      } else if (k === 'q') {
        e.preventDefault();
        cycleBushidoStance();
      } else if (k === 'r') {
        e.preventDefault();
        triggerBushidoParry();
      } else if (k === ' ') {
        e.preventDefault();
        const p = playerStateRef.current;
        if (keys['shift']) {
          const moveX = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
          const moveZ = (keys['s'] ? 1 : 0) - (keys['w'] ? 1 : 0);
          const fX = -Math.sin(p.yaw);
          const fZ = -Math.cos(p.yaw);
          const rX = Math.cos(p.yaw);
          const rZ = -Math.sin(p.yaw);
          const dX = moveX !== 0 || moveZ !== 0 ? fX * -moveZ + rX * moveX : fX;
          const dZ = moveX !== 0 || moveZ !== 0 ? fZ * -moveZ + rZ * moveZ : fZ;
          triggerKineticDash(dX, dZ);
        } else if (Math.abs(p.y - p.targetFloorY) < 0.35) {
          p.vy = 7.8;
          halloweenAudio.playFootstepSfx('STONE', true);
        }
      } else if (k === 'c') {
        e.preventDefault();
        const p = playerStateRef.current;
        triggerKineticDash(-Math.sin(p.yaw), -Math.cos(p.yaw));
      } else if (k === 'p') {
        e.preventDefault();
        setPumpkinHelperActive((prev) => {
          const next = !prev;
          if (next) halloweenAudio.playPlasmaBladesAppear();
          setCombatLogText(next ? '🎃 BONUS ALLY: Pumpkin Patch materialized with Dual Orange Plasma Blades to help you fight!' : '🎃 Pumpkin Patch stepped back into the shadows.');
          return next;
        });
      } else if (k === 't') {
        e.preventDefault();
        triggerEncounter('pumpkin_patch_tank');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ==========================================================================
    // 9. REST-POSE-PRESERVING CALL OF DUTY / METAL GEAR SOLID V FOX-ENGINE
    //    MULTI-JOINT SKELETAL LOCOMOTION & BUSHIDO COMBAT ANIMATOR!
    // ==========================================================================
    const _deltaEuler = new THREE.Euler();
    const _deltaQuat = new THREE.Quaternion();

    const applyBoneDeltaEuler = (
      bone: THREE.Object3D,
      rx: number,
      ry: number,
      rz: number
    ) => {
      if (!bone.userData.restQuat) {
        bone.userData.restQuat = bone.quaternion.clone();
      }
      _deltaEuler.set(rx, ry, rz, 'XYZ');
      _deltaQuat.setFromEuler(_deltaEuler);
      bone.quaternion.copy(bone.userData.restQuat).multiply(_deltaQuat);
    };

    type AnimArchetype =
      | 'JACK_KATANA'
      | 'ELISE_AGILE'
      | 'PUMPKIN_ALLY'
      | 'ZOMBIE_SHAMBLE'
      | 'WEREWOLF_PROWL'
      | 'VAMPIRE_GHOST';

    const animateHumanoidSkeleton = (
      rigGroup: THREE.Group,
      timeSec: number,
      walkSpeed: number,
      swingPhase: number,
      stance: 'HIGH' | 'MID' | 'LOW',
      comboIdx: number,
      archetype: AnimArchetype = 'JACK_KATANA'
    ) => {
      const clampedSpeed = Math.min(1.5, Math.max(0.0, walkSpeed));
      const isLocomoting = clampedSpeed > 0.14;
      const isZombie = archetype === 'ZOMBIE_SHAMBLE';
      const isWolf = archetype === 'WEREWOLF_PROWL';
      const isGhost = archetype === 'VAMPIRE_GHOST';
      const isElise = archetype === 'ELISE_AGILE';
      const isPumpkin = archetype === 'PUMPKIN_ALLY';

      const baseFreq = isZombie
        ? 5.8
        : isWolf
        ? 10.4
        : isElise
        ? 9.4
        : clampedSpeed > 1.15
        ? 11.2
        : 8.4;
      const phase = timeSec * baseFreq;
      const sinP = Math.sin(phase);
      const cosP = Math.cos(phase);
      const sin2P = Math.sin(phase * 2.0);
      const breath = Math.sin(timeSec * (isWolf ? 4.2 : 2.6)) * (isWolf ? 0.065 : 0.04);

      // Periodic Idle Personality Flourishes (Katana figure-eight twirl, vigilant head scan, weight shift)
      const idleWeightShift = !isLocomoting ? Math.sin(timeSec * 1.15) * 0.032 : 0;
      const flourishWindow = !isLocomoting ? Math.max(0, Math.sin(timeSec * 0.85) - 0.55) * 2.2 : 0;
      const zombieLimp = isZombie ? Math.max(0, sinP) * 0.12 : 0;

      rigGroup.traverse((child) => {
        const n = child.name;
        if (!n) return;

        if (n === 'Hips') {
          if (!child.userData.restPos) {
            child.userData.restPos = child.position.clone();
          }
          const strideBounce = isLocomoting
            ? isZombie
              ? -zombieLimp * 0.07 + Math.abs(sinP) * 0.03
              : isWolf
              ? sin2P * 0.068 * clampedSpeed - 0.05
              : Math.abs(sinP) * 0.052 * clampedSpeed - 0.025 * clampedSpeed
            : Math.sin(timeSec * 2.4) * 0.012;
          child.position.y = child.userData.restPos.y + strideBounce;
          child.position.x = child.userData.restPos.x + idleWeightShift;

          const hipYaw = isLocomoting
            ? sinP * (isElise ? 0.11 : isZombie ? 0.14 : 0.08) * clampedSpeed
            : Math.sin(timeSec * 1.15) * 0.04;
          const hipRoll = isLocomoting
            ? cosP * (isElise ? 0.065 : isZombie ? 0.09 : 0.045) * clampedSpeed
            : idleWeightShift * 1.2;
          applyBoneDeltaEuler(child, isWolf ? 0.12 : 0, hipYaw, hipRoll);
        } else if (n === 'Spine' || n === 'Chest') {
          const forwardLean = isZombie
            ? 0.28 + Math.sin(phase) * 0.08
            : isWolf
            ? 0.34 + breath
            : isLocomoting
            ? (isElise ? 0.14 : 0.12) * clampedSpeed
            : 0.04 + breath;
          const counterTwist =
            swingPhase > 0
              ? Math.sin(swingPhase * Math.PI) * (comboIdx === 2 ? -0.56 : 0.58)
              : isLocomoting
              ? -sinP * (isPumpkin ? 0.14 : 0.095) * clampedSpeed
              : Math.sin(timeSec * 1.3) * 0.045;
          const lateralLean = isZombie
            ? 0.16 + Math.cos(phase) * 0.09
            : isLocomoting
            ? -cosP * 0.04 * clampedSpeed
            : -idleWeightShift * 0.8;
          applyBoneDeltaEuler(child, forwardLean, counterTwist, lateralLean);
        } else if (n === 'Head') {
          // Expressive head personality: zombies loll head sideways, wolves snarl & track, survivors scan mist!
          const headYaw = isZombie
            ? Math.sin(timeSec * 1.7) * 0.18
            : isLocomoting
            ? sinP * 0.06 * clampedSpeed
            : Math.sin(timeSec * 0.95) * 0.16 + Math.sin(timeSec * 2.3) * 0.04;
          const headPitch = isZombie
            ? 0.22 + Math.sin(phase) * 0.12
            : isWolf
            ? -0.18 + Math.sin(timeSec * 5.0) * 0.06
            : isLocomoting
            ? -0.07 * clampedSpeed
            : -breath * 0.6 + flourishWindow * 0.08;
          const headRoll = isZombie
            ? 0.28 + Math.cos(timeSec * 1.5) * 0.08
            : isWolf
            ? Math.sin(timeSec * 3.1) * 0.09
            : Math.sin(timeSec * 1.15) * 0.04;
          applyBoneDeltaEuler(child, headPitch, headYaw, headRoll);
        } else if (n === 'UpLeg_L') {
          const amp = isWolf ? 0.78 : isZombie ? 0.42 : isElise ? 0.68 : 0.64;
          const thighSwing = isLocomoting ? sinP * amp * clampedSpeed : 0.05;
          applyBoneDeltaEuler(child, thighSwing, 0, isElise ? -0.03 : 0);
        } else if (n === 'UpLeg_R') {
          const amp = isWolf ? 0.78 : isZombie ? 0.26 : isElise ? 0.68 : 0.64;
          const thighSwing = isLocomoting ? -sinP * amp * clampedSpeed : -0.05;
          applyBoneDeltaEuler(child, thighSwing, 0, isElise ? 0.03 : 0);
        } else if (n === 'LowLeg_L') {
          const kneeBend = isLocomoting
            ? -Math.max(0, cosP + 0.25) * (isWolf ? 0.82 : 0.70) * clampedSpeed
            : isWolf
            ? -0.28
            : -0.06;
          applyBoneDeltaEuler(child, kneeBend, 0, 0);
        } else if (n === 'LowLeg_R') {
          const kneeBend = isLocomoting
            ? -Math.max(0, -cosP + 0.25) * (isZombie ? 0.22 : isWolf ? 0.82 : 0.70) * clampedSpeed
            : isWolf
            ? -0.28
            : -0.06;
          applyBoneDeltaEuler(child, kneeBend, 0, 0);
        } else if (n === 'Foot_L') {
          const ankleFlex = isLocomoting ? cosP * 0.24 * clampedSpeed : 0;
          applyBoneDeltaEuler(child, ankleFlex, 0, 0);
        } else if (n === 'Foot_R') {
          const ankleFlex = isLocomoting ? -cosP * 0.24 * clampedSpeed : 0;
          applyBoneDeltaEuler(child, ankleFlex, 0, 0);
        } else if (n === 'UpperArm_R') {
          if (swingPhase > 0) {
            const arc = Math.sin(swingPhase * Math.PI);
            if (stance === 'HIGH' || comboIdx === 3 || isPumpkin) {
              applyBoneDeltaEuler(child, 1.42 - arc * 2.25, -0.32 * arc, -0.18);
            } else if (stance === 'LOW') {
              applyBoneDeltaEuler(child, 0.35 + arc * 1.25, 0.72 - arc * 1.45, -0.25);
            } else {
              applyBoneDeltaEuler(child, 0.68 + arc * 0.65, 0.82 - arc * 1.65, -0.22);
            }
          } else if (isZombie) {
            applyBoneDeltaEuler(child, 1.05 + Math.sin(phase) * 0.18, 0.12, -0.08);
          } else if (isWolf) {
            applyBoneDeltaEuler(child, 0.62 - sinP * 0.48 * clampedSpeed, 0.18, -0.22);
          } else if (isGhost) {
            applyBoneDeltaEuler(child, 0.75 + Math.sin(timeSec * 3.2) * 0.28, 0.25, -0.32);
          } else {
            const stanceGuardX =
              stance === 'HIGH' ? 0.72 : stance === 'LOW' ? 0.18 : 0.42;
            const armPump = isLocomoting
              ? -sinP * 0.42 * clampedSpeed
              : breath + flourishWindow * Math.sin(timeSec * 6.5) * 0.28;
            const flourishYaw = flourishWindow * Math.cos(timeSec * 6.5) * 0.32;
            applyBoneDeltaEuler(child, stanceGuardX + armPump, 0.14 + flourishYaw, -0.08);
          }
        } else if (n === 'LowerArm_R') {
          const elbowFlex =
            swingPhase > 0
              ? 0.48 * (1 - Math.sin(swingPhase * Math.PI) * 0.75)
              : isZombie
              ? 0.35 + Math.cos(phase) * 0.12
              : stance === 'HIGH'
              ? 0.66
              : 0.44 + flourishWindow * 0.35;
          applyBoneDeltaEuler(child, elbowFlex, flourishWindow * Math.sin(timeSec * 8.0) * 0.45, 0);
        } else if (n === 'Hand_R') {
          // Katana / Weapon wrist articulation & idle Bushido blade twirl!
          const wristTwirl =
            swingPhase > 0
              ? Math.sin(swingPhase * Math.PI) * 0.55
              : flourishWindow * Math.sin(timeSec * 9.0) * 0.65;
          applyBoneDeltaEuler(child, wristTwirl * 0.5, wristTwirl, 0);
        } else if (n === 'UpperArm_L') {
          if (swingPhase > 0) {
            const arc = Math.sin(swingPhase * Math.PI);
            // Left-Hand Nail-Spiked Baseball Bat / Dual Plasma Blade counter-strike!
            applyBoneDeltaEuler(child, 0.55 + arc * 1.15, -0.55 + arc * 1.15, 0.18);
          } else if (isZombie) {
            applyBoneDeltaEuler(child, 0.92 - Math.sin(phase) * 0.16, -0.15, 0.12);
          } else if (isWolf) {
            applyBoneDeltaEuler(child, 0.62 + sinP * 0.48 * clampedSpeed, -0.18, 0.22);
          } else if (isGhost) {
            applyBoneDeltaEuler(child, 0.75 + Math.cos(timeSec * 3.2) * 0.28, -0.25, 0.32);
          } else {
            const armPump = isLocomoting ? sinP * 0.42 * clampedSpeed : -breath * 1.2;
            applyBoneDeltaEuler(child, 0.34 + armPump, -0.14, 0.10);
          }
        } else if (n === 'LowerArm_L') {
          const elbowFlex = isLocomoting ? 0.52 : 0.40;
          applyBoneDeltaEuler(child, elbowFlex, 0, 0);
        }
      });
    };

    // ==========================================================================
    // 10. MAIN 60-FPS GAME ENGINE LOOP (SLIDING AABB COLLISION + WALKABLE STAIRS)
    // ==========================================================================
    let reqId = 0;
    let lastTime = performance.now();
    let tankCannonCooldown = 0;
    let fpsFrames = 0;
    let fpsAccum = 0;
    let activeRoomIdTracker: string | null = null;
    let smoothedGaitSpeed = 0;

    // 2D Circle-vs-AABB Sliding Depenetration Solver
    const resolvePlayerCollisions = (
      candX: number,
      candZ: number,
      playerY: number,
      radius = 0.54
    ): [number, number] => {
      let rx = candX;
      let rz = candZ;
      const pMinY = playerY + 0.35;
      const pMaxY = playerY + 1.65;

      for (let i = 0; i < worldColliders.length; i++) {
        const box = worldColliders[i];
        if (pMaxY < box.minY || pMinY > box.maxY) continue;

        const closestX = Math.max(box.minX, Math.min(rx, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(rz, box.maxZ));
        const dx = rx - closestX;
        const dz = rz - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          if (distSq > 0.00001) {
            const dist = Math.sqrt(distSq);
            const overlap = radius - dist;
            rx += (dx / dist) * overlap;
            rz += (dz / dist) * overlap;
          } else {
            // Center is inside AABB: push out along shallowest axis
            const penLeft = rx - box.minX;
            const penRight = box.maxX - rx;
            const penFront = rz - box.minZ;
            const penBack = box.maxZ - rz;
            const minPen = Math.min(penLeft, penRight, penFront, penBack);
            if (minPen === penLeft) rx = box.minX - radius;
            else if (minPen === penRight) rx = box.maxX + radius;
            else if (minPen === penFront) rz = box.minZ - radius;
            else rz = box.maxZ + radius;
          }
        }
      }
      return [rx, rz];
    };

    const animate = (now: number) => {
      reqId = requestAnimationFrame(animate);
      const rawDt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const t = now * 0.001;

      fpsFrames += 1;
      fpsAccum += rawDt;
      if (fpsAccum >= 0.5) {
        setFpsCount(Math.round(fpsFrames / fpsAccum));
        fpsFrames = 0;
        fpsAccum = 0;
      }

      const p = playerStateRef.current;
      if (p.hitStopTimer > 0) p.hitStopTimer = Math.max(0, p.hitStopTimer - rawDt);
      if (p.cameraShakeTimer > 0) p.cameraShakeTimer = Math.max(0, p.cameraShakeTimer - rawDt);
      const dt = p.hitStopTimer > 0 ? rawDt * 0.15 : rawDt;

      if (actionDynamicLight.intensity > 0) {
        actionDynamicLight.intensity = Math.max(0, actionDynamicLight.intensity - rawDt * 22);
      }

      // Toggle Playable Survivor Rig: Kenji (Male Survivor) vs Anya (Female Survivor)
      const isMale = survivorGenderRef.current === 'MALE';
      maleSurvivorGroup.visible = isMale;
      femaleSurvivorGroup.visible = !isMale;

      // Advance GPU Wind Shader & Dimensional Rift Aurora Time Uniform
      windTimeUniform.value = t;
      emberParticles.rotation.y = t * 0.03;

      // Sync active Art & Game Production Council Render Lens
      const activeLens =
        CASTLE_COUNCIL_LENSES.find((l) => l.id === councilLensRef.current) ||
        CASTLE_COUNCIL_LENSES[0];
      renderer.toneMappingExposure = activeLens.exposure;
      bloomPass.strength = activeLens.bloomStrength;
      bloomPass.radius = activeLens.bloomRadius;
      bloomPass.threshold = activeLens.bloomThreshold;
      scene.environmentIntensity = activeLens.envIntensity;
      const referenceLook = activeLens.id === 'RAVENCREST_REFERENCE';
      // Painted castles contain their own perspective and lighting. Layering them
      // behind the real castle creates conflicting silhouettes and doubled moons.
      horizonCyclorama.visible = !referenceLook;
      northernVistaPlate.visible = !referenceLook;
      moonGroup.visible = !referenceLook;
      riftAuroraMesh.visible = !referenceLook;
      emberParticles.visible = !referenceLook;
      ambientLight.color.set(referenceLook ? '#7d94a3' : '#49386b');
      ambientLight.intensity = referenceLook ? 0.32 : 1.25;
      hemiLight.color.set(referenceLook ? '#a6c4d6' : '#9d82e8');
      hemiLight.groundColor.set(referenceLook ? '#252729' : '#422c1d');
      hemiLight.intensity = referenceLook ? 0.65 : 1.95;
      moonLight.color.set(referenceLook ? '#bdd9ed' : '#ffdfc2');
      moonLight.intensity = referenceLook ? 2.1 : 2.95;
      scene.fog!.color.set(referenceLook ? '#14232c' : '#0c071b');

      belfryBellGroup.rotation.z = Math.sin(t * 1.6) * 0.28;

      // --- A. PLAYER MOVEMENT, 3 WALKABLE GRAND STAIRCASES & SLIDING AABB COLLISION ---
      if (cameraModeRef.current === 'THIRD_PERSON') {
        const turnSpeed = 2.45;
        if (keys['arrowleft'] || keys['a']) p.yaw += turnSpeed * dt;
        if (keys['arrowright'] || keys['d']) p.yaw -= turnSpeed * dt;

        let forwardInput = 0;
        if (keys['w'] || keys['arrowup']) forwardInput += 1;
        if (keys['s'] || keys['arrowdown']) forwardInput -= 1;

        const isSprinting = Boolean(keys['shift']) && forwardInput > 0;
        p.isSprinting = isSprinting;
        const moveSpeed = isSprinting ? 11.8 : 7.6;

        if (p.dodgeDashTimer > 0) {
          p.dodgeDashTimer = Math.max(0, p.dodgeDashTimer - dt);
          p.vx = p.dodgeDirX * 21.0;
          p.vz = p.dodgeDirZ * 21.0;
          p.isMoving = true;
        } else if (forwardInput !== 0) {
          p.vx += (-Math.sin(p.yaw) * forwardInput * moveSpeed - p.vx) * Math.min(1, dt * 14);
          p.vz += (-Math.cos(p.yaw) * forwardInput * moveSpeed - p.vz) * Math.min(1, dt * 14);
          p.isMoving = true;
        } else {
          p.vx *= Math.max(0, 1 - dt * 11);
          p.vz *= Math.max(0, 1 - dt * 11);
          p.isMoving = Math.hypot(p.vx, p.vz) > 0.32;
        }

        const rawNextX = Math.max(-56, Math.min(56, p.x + p.vx * dt));
        const rawNextZ = Math.max(-71.2, Math.min(64, p.z + p.vz * dt));
        const [resolvedX, resolvedZ] = resolvePlayerCollisions(rawNextX, rawNextZ, p.y, 0.54);
        p.x = resolvedX;
        p.z = resolvedZ;

        // --- DETERMINISTIC WALKABLE GRAND STAIRCASE RAMPS (`Z_world in [-62.0, -46.0]`) ---
        const inStairZBand = p.z <= -46.0 && p.z >= -62.0;
        const rampProgressNorth = Math.max(0, Math.min(1, (-46.0 - p.z) / 16.0)); // 0 at South (-46), 1 at North (-62)

        if (p.z >= -35.8) {
          // Outside on the Crossroads Road or Moat Drawbridge: elevation is 0.0m
          p.onSpiralStairs = false;
          p.targetFloorY = 0.0;
        } else if (inStairZBand && p.x >= -6.45 && p.x <= -2.5 && p.y >= -0.8 && p.y <= 6.8) {
          // 1) WEST GRAND STAIRCASE: Ground (0m at Z=-46) <-> Upper Noble Floor (+6m at Z=-62)
          p.onSpiralStairs = true;
          p.targetFloorY = rampProgressNorth * 6.0;
        } else if (inStairZBand && p.x >= -2.2 && p.x <= 2.2 && p.y >= -6.8 && p.y <= 0.8) {
          // 2) CENTER CRYPT STAIRCASE: Ground (0m at Z=-46) <-> Basement Crypt (-6m at Z=-62)
          p.onSpiralStairs = true;
          p.targetFloorY = -rampProgressNorth * 6.0;
        } else if (inStairZBand && p.x >= 2.5 && p.x <= 6.45 && p.y >= 5.2 && p.y <= 12.8) {
          // 3) EAST BELFRY STAIRCASE: Upper Noble (+6m at Z=-62) <-> Creepy Attic (+12m at Z=-46)
          p.onSpiralStairs = true;
          p.targetFloorY = 6.0 + (1.0 - rampProgressNorth) * 6.0;
        } else {
          p.onSpiralStairs = false;
          const levels = [-6.0, 0.0, 6.0, 12.0];
          let closestLvl = 0.0;
          let minDiff = 999;
          for (const lvl of levels) {
            const diff = Math.abs(p.targetFloorY - lvl);
            if (diff < minDiff) {
              minDiff = diff;
              closestLvl = lvl;
            }
          }
          p.targetFloorY = closestLvl;
        }

        // Vertical Gravity & Smooth Step-Up Physics
        if (p.y > p.targetFloorY + 0.08 && !p.onSpiralStairs) {
          p.vy -= 22.0 * dt;
          p.y += p.vy * dt;
          if (p.y <= p.targetFloorY) {
            p.y = p.targetFloorY;
            p.vy = 0;
          }
        } else {
          p.vy = 0;
          p.y += (p.targetFloorY - p.y) * Math.min(1, dt * 16);
        }

        // Detect which of the 12 Castle Rooms the player is currently inside
        let detectedRoom: CastleRoomDefinition | null = null;
        if (p.z < -36.0) {
          for (const rm of CASTLE_ROOMS) {
            if (
              Math.abs(p.y - rm.elevationY) < 2.9 &&
              p.x >= rm.bounds.minX &&
              p.x <= rm.bounds.maxX &&
              p.z >= rm.bounds.minZ &&
              p.z <= rm.bounds.maxZ
            ) {
              detectedRoom = rm;
              break;
            }
          }
        }

        const newRoomId = detectedRoom ? detectedRoom.id : null;
        if (newRoomId !== activeRoomIdTracker) {
          activeRoomIdTracker = newRoomId;
          setCurrentRoom(detectedRoom);
          if (detectedRoom) {
            setCurrentFloorIdx(detectedRoom.floorIndex);
            halloweenAudio.setGothicMusicZone(detectedRoom.musicZone);
            setCombatLogText(
              `🏰 Room #${detectedRoom.roomNumber}: ${detectedRoom.name} [${detectedRoom.floorLabel}] — ${detectedRoom.subtitle}`
            );
            announceCouncilDirective(
              `Room #${detectedRoom.roomNumber} — ${detectedRoom.name}: ${detectedRoom.subtitle}.`,
              `🎮 GAME COUNCIL: "Entered ${detectedRoom.name} on ${detectedRoom.floorLabel}. Watch for ambushing creatures — every slay awards +XP & +HP restoration!"`,
              `Entered ${detectedRoom.name}.`
            );
          } else if (p.z >= -35.8) {
            setCurrentFloorIdx(1);
            halloweenAudio.setGothicMusicZone('CROSSROADS');
          }
        }

        if (p.isMoving && Math.abs(p.y - p.targetFloorY) < 0.45) {
          p.footstepCooldown -= dt;
          if (p.footstepCooldown <= 0) {
            p.footstepCooldown = isSprinting ? 0.26 : 0.40;
            const surf: CastleSurfaceType = p.onSpiralStairs
              ? 'SPIRAL_STAIR'
              : detectedRoom
              ? detectedRoom.surface
              : p.z < -12.0 && p.z >= -36.0
              ? 'STONE'
              : 'ASPHALT';
            halloweenAudio.playFootstepSfx(surf, isSprinting);
          }
        }
      }

      playerRoot.position.set(p.x, p.y, p.z);
      playerRoot.rotation.y = p.yaw;
      playerTorchLight.position.set(p.x, p.y + 2.6, p.z);

      // Update Bushido Blade Parry & Combo Timers
      if (p.comboResetTimer > 0) p.comboResetTimer = Math.max(0, p.comboResetTimer - dt);
      if (p.parryWindowTimer > 0) {
        p.parryWindowTimer = Math.max(0, p.parryWindowTimer - dt);
        parryDomeMat.opacity = 0.38;
        parryDome.rotation.y += dt * 5.0;
      } else {
        parryDomeMat.opacity = 0.0;
      }
      if (p.riposteEmpowerTimer > 0) {
        p.riposteEmpowerTimer = Math.max(0, p.riposteEmpowerTimer - dt);
      }

      // Animate Player 3D Rig & Melee Slash Hit Detection
      let swingPhase = 0;
      if (p.batSwingTimer > 0) {
        const prevTimer = p.batSwingTimer;
        p.batSwingTimer = Math.max(0, p.batSwingTimer - dt);
        const totalDur = p.swingDuration || 0.32;
        swingPhase = 1 - p.batSwingTimer / totalDur;

        slashRibbonMat.color.set(
          p.riposteEmpowerTimer > 0
            ? '#38bdf8'
            : bushidoStanceRef.current === 'HIGH'
            ? '#ef4444'
            : bushidoStanceRef.current === 'LOW'
            ? '#a855f7'
            : '#f97316'
        );
        slashRibbonMat.opacity = Math.sin(swingPhase * Math.PI) * 0.78;
        slashRibbon.rotation.z = swingPhase * Math.PI * 1.4;

        const midTime = totalDur * 0.55;
        if (prevTimer >= midTime && p.batSwingTimer < midTime) {
          let hitCount = 0;
          const isRiposte = p.riposteEmpowerTimer > 0;
          const stance = bushidoStanceRef.current;
          const reach = stance === 'LOW' ? 5.2 : 4.5;

          monsters.forEach((m) => {
            if (m.respawnTimer > 0) return;
            if (Math.abs(m.y - p.y) > 2.8) return;
            const dx = m.x - p.x;
            const dz = m.z - p.z;
            const dist = Math.hypot(dx, dz);
            if (dist < reach) {
              hitCount += 1;
              const isExecution =
                isRiposte ||
                (stance === 'HIGH' && dist < 3.6 && Math.random() < 0.55) ||
                p.comboIndex === 3;
              const levelDmgScale = 1 + (p.level - 1) * 0.18;
              const dmg = isExecution ? m.maxHp : Math.round((stance === 'HIGH' ? 58 : 44) * levelDmgScale);
              m.hp -= dmg;
              m.hitFlashTimer = 0.3;
              const pushAngle = Math.atan2(dx, dz);
              m.vx += Math.sin(pushAngle) * 10.5;
              m.vz += Math.cos(pushAngle) * 10.5;

              if (m.hp <= 0) {
                m.respawnTimer = 8.5;
                m.group.visible = false;
                grantMonsterSlayReward(
                  m.type,
                  survivorGenderRef.current === 'MALE' ? 'Jack Thorne (Katana/Bat)' : 'Elise Carter (Katana/Bat)'
                );
              }
            }
          });

          if (hitCount > 0) {
            p.hitStopTimer = 0.055;
            p.cameraShakeTimer = 0.16;
            if (isRiposte) {
              p.riposteEmpowerTimer = 0;
              setRiposteCharged(false);
            }
            halloweenAudio.playKatanaSlashSfx(true, p.comboIndex === 3);
            setMonstersSlain(p.kills);
            setCombatCallout({
              text:
                p.comboIndex === 3
                  ? '⚔️ BUSHIDO EXECUTION!'
                  : `💥 ${stance} SLASH x${hitCount}!`,
              color: stance === 'HIGH' ? '#ef4444' : '#f97316',
              id: Date.now(),
            });
          }
        }
      } else {
        slashRibbonMat.opacity = 0.0;
      }

      const targetGait = p.isMoving ? (p.isSprinting ? 1.38 : 0.95) : 0.0;
      smoothedGaitSpeed += (targetGait - smoothedGaitSpeed) * Math.min(1, dt * 10);

      // Animate Perched 3D Ravens on top of the Ravencrest Roadside Billboards
      perchedRavens.forEach((rv, rIdx) => {
        rv.rotation.y = Math.sin(t * 1.8 + rIdx * 1.7) * 0.35;
        rv.position.y = 3.35 + 1.45 + 0.14 + Math.abs(Math.sin(t * 2.6 + rIdx)) * 0.04;
      });

      const activeSurvivorSlot = isMale ? maleSurvivorGroup : femaleSurvivorGroup;
      animateHumanoidSkeleton(
        activeSurvivorSlot,
        t,
        smoothedGaitSpeed,
        swingPhase,
        bushidoStanceRef.current,
        p.comboIndex,
        isMale ? 'JACK_KATANA' : 'ELISE_AGILE'
      );

      // --- A2. BONUS AI HELPER: PUMPKIN PATCH (MELVIN LESTER) COMES IN & HELPS FIGHT! ---
      pumpkinAllyRoot.visible = pumpkinHelperActiveRef.current;
      if (pumpkinHelperActiveRef.current) {
        let allyTargetMonster: MonsterAgent | null = null;
        let bestMonDist = 20.0;
        for (let i = 0; i < monsters.length; i++) {
          const m = monsters[i];
          if (m.respawnTimer > 0 || Math.abs(m.floorY - p.y) > 2.8) continue;
          const dToPlayer = Math.hypot(m.x - p.x, m.z - p.z);
          if (dToPlayer < bestMonDist) {
            bestMonDist = dToPlayer;
            allyTargetMonster = m;
          }
        }

        const curAx = pumpkinAllyRoot.position.x;
        const curAz = pumpkinAllyRoot.position.z;
        if (Math.hypot(curAx - p.x, curAz - p.z) > 22.0) {
          pumpkinAllyRoot.position.set(p.x + 2.2, p.y, p.z - 1.5);
        }

        let goalX = p.x + Math.cos(p.yaw) * 2.2 + Math.sin(p.yaw) * 1.4;
        let goalZ = p.z - Math.sin(p.yaw) * 2.2 + Math.cos(p.yaw) * 1.4;
        if (allyTargetMonster) {
          goalX = allyTargetMonster.x;
          goalZ = allyTargetMonster.z;
        }

        const adx = goalX - pumpkinAllyRoot.position.x;
        const adz = goalZ - pumpkinAllyRoot.position.z;
        const adist = Math.hypot(adx, adz) || 0.001;
        let allyGait = 0.0;
        let allySwingPhase = 0.0;

        if (adist > 1.75) {
          const allySpeed = allyTargetMonster ? 9.2 : 8.2;
          pumpkinAllyRoot.position.x += (adx / adist) * allySpeed * dt;
          pumpkinAllyRoot.position.z += (adz / adist) * allySpeed * dt;
          pumpkinAllyRoot.rotation.y = Math.atan2(-adx, -adz);
          allyGait = allyTargetMonster ? 1.3 : 1.0;
        } else if (allyTargetMonster) {
          pumpkinAllyRoot.rotation.y = Math.atan2(-adx, -adz);
          allySwingPhase = (t * 2.8) % 1.0;
          allySlashMat.opacity = Math.sin(allySwingPhase * Math.PI) * 0.72;
          allySlashRibbon.rotation.z = allySwingPhase * Math.PI * 1.6;
          if (Math.random() < dt * 2.6) {
            allyTargetMonster.hp -= 35;
            allyTargetMonster.hitFlashTimer = 0.25;
            allyTargetMonster.vx += (adx / adist) * 8.0;
            allyTargetMonster.vz += (adz / adist) * 8.0;
            if (allyTargetMonster.hp <= 0) {
              allyTargetMonster.respawnTimer = 8.5;
              allyTargetMonster.group.visible = false;
              grantMonsterSlayReward(allyTargetMonster.type, 'Pumpkin Patch (Bonus Ally)');
              setCombatCallout({
                text: '🎃 PUMPKIN PATCH ALLY CLEAVE! (+XP & +HP)',
                color: '#fb923c',
                id: Date.now(),
              });
            }
          }
        } else {
          allySlashMat.opacity = 0.0;
        }
        pumpkinAllyRoot.position.y += (p.y - pumpkinAllyRoot.position.y) * Math.min(1, dt * 12);
        if (!allyTargetMonster || adist > 1.75) {
          allySlashMat.opacity = 0.0;
        }
        animateHumanoidSkeleton(pumpkinHeroGroup, t + 0.4, allyGait, allySwingPhase, 'HIGH', 3, 'PUMPKIN_ALLY');
      }

      // Process Queued Molotov Cocktail Throws
      while (p.molotovThrowQueue > 0) {
        p.molotovThrowQueue -= 1;
        const mBottle = new THREE.Group();
        const flameOrb = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 10, 10),
          new THREE.MeshBasicMaterial({ color: '#ff7b00' })
        );
        mBottle.add(flameOrb);
        const startX = p.x - Math.sin(p.yaw) * 0.9;
        const startY = p.y + 1.5;
        const startZ = p.z - Math.cos(p.yaw) * 0.9;
        mBottle.position.set(startX, startY, startZ);
        scene.add(mBottle);

        activeMolotovs.push({
          mesh: mBottle,
          x: startX,
          y: startY,
          z: startZ,
          vx: -Math.sin(p.yaw) * 14.5,
          vy: 6.8,
          vz: -Math.cos(p.yaw) * 14.5,
          floorY: p.y,
        });
      }

      for (let i = activeMolotovs.length - 1; i >= 0; i--) {
        const mol = activeMolotovs[i];
        mol.vy -= 18.5 * dt;
        mol.x += mol.vx * dt;
        mol.y += mol.vy * dt;
        mol.z += mol.vz * dt;
        mol.mesh.position.set(mol.x, mol.y, mol.z);
        if (mol.y <= mol.floorY + 0.15) {
          scene.remove(mol.mesh);
          activeMolotovs.splice(i, 1);
          spawnExplosionAt(mol.x, mol.floorY, mol.z, 6.2, 65);
        }
      }

      for (let i = activeExplosions.length - 1; i >= 0; i--) {
        const exp = activeExplosions[i];
        exp.age += dt;
        const prog = exp.age / exp.maxAge;
        if (prog >= 1) {
          scene.remove(exp.mesh);
          (exp.mesh.material as THREE.Material).dispose();
          activeExplosions.splice(i, 1);
        } else {
          exp.mesh.scale.setScalar(1 + prog * 5.2);
          (exp.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - prog) * 0.85;
        }
      }

      // --- B. UPDATE ROAMING MONSTERS (OUTDOORS & INSIDE CASTLE ROOMS) ---
      let aliveMonsters = 0;
      monsters.forEach((m) => {
        if (m.respawnTimer > 0) {
          m.respawnTimer -= dt;
          if (m.respawnTimer <= 0) {
            m.hp = m.maxHp;
            m.x = m.homeX;
            m.y = m.floorY;
            m.z = m.homeZ;
            m.vx = 0;
            m.vz = 0;
            m.group.visible = true;
          }
          return;
        }
        aliveMonsters += 1;

        const sameFloor = Math.abs(p.y - m.floorY) < 2.5;
        const targetX = sameFloor ? p.x : m.homeX + Math.sin(t * 0.6 + m.phaseOffset) * 3.5;
        const targetZ = sameFloor ? p.z : m.homeZ + Math.cos(t * 0.6 + m.phaseOffset) * 3.5;

        const dx = targetX - m.x;
        const dz = targetZ - m.z;
        const dist = Math.hypot(dx, dz) || 1;

        m.vx *= Math.max(0, 1 - dt * 5);
        m.vz *= Math.max(0, 1 - dt * 5);

        if (dist > 1.55 && dist < 24.0) {
          const nextMx = m.x + (dx / dist) * m.speed * dt + m.vx * dt;
          const nextMz = m.z + (dz / dist) * m.speed * dt + m.vz * dt;
          // Keep outdoor monsters on the mainland (`z > -11.5`) or inside the castle (`z < -36.5`)
          if (m.homeZ > -11.5) {
            m.x = nextMx;
            m.z = Math.max(-10.5, nextMz);
          } else {
            m.x = Math.max(-22.5, Math.min(22.5, nextMx));
            m.z = Math.max(-70.5, Math.min(-37.0, nextMz));
          }
        } else if (sameFloor && dist <= 1.55) {
          if (p.parryWindowTimer > 0) {
            p.parryWindowTimer = 0;
            p.riposteEmpowerTimer = 3.5;
            setRiposteCharged(true);
            m.vx = -(dx / dist) * 12.0;
            m.vz = -(dz / dist) * 12.0;
            halloweenAudio.playParryClangSfx();
            setCombatCallout({
              text: '⚡ PERFECT DEFLECT! RIPOSTE READY!',
              color: '#38bdf8',
              id: Date.now(),
            });
          } else if (p.dodgeDashTimer <= 0 && Math.random() < dt * 1.4) {
            p.hp = Math.max(20, p.hp - 4);
            setPlayerHp(p.hp);
          }
        }

        const floatHover =
          m.type === 'GHOST' ? Math.sin(t * 3.2 + m.phaseOffset) * 0.28 + 0.25 : 0;
        m.group.position.set(m.x, m.floorY + floatHover, m.z);
        m.group.rotation.y = Math.atan2(dx, dz);

        const hpRatio = Math.max(0.05, m.hp / m.maxHp);
        m.hpBarFill.scale.x = hpRatio;
        m.hpBarFill.position.x = -(1 - hpRatio) * 0.52;
        m.hpBarFill.lookAt(camera.position);

        animateHumanoidSkeleton(
          m.rigSlot,
          t + m.phaseOffset,
          dist < 22 ? 0.95 : 0.35,
          dist < 1.9 && sameFloor ? (t * 2.5) % 1 : 0,
          'MID',
          1,
          m.type === 'ZOMBIE'
            ? 'ZOMBIE_SHAMBLE'
            : m.type === 'WEREWOLF'
            ? 'WEREWOLF_PROWL'
            : 'VAMPIRE_GHOST'
        );
      });
      if (Math.floor(t * 2) % 2 === 0) {
        setActiveMonsterCount(aliveMonsters);
      }

      // --- C. ANIMATE SPARSE MOVIE CHARACTER ENCOUNTERS & ARMORED TANK ---
      const enc = activeEncounterRef.current;
      const encElapsed = enc ? (now - encounterStartTimeRef.current) / enc.durationMs : 0;
      const clampedProg = Math.max(0, Math.min(1, encElapsed));

      tankGroup.visible = enc?.id === 'pumpkin_patch_tank';
      miriamFlightGroup.visible = enc?.id === 'miriam_monkeys';
      ppBladesGroup.visible = enc?.id === 'pumpkin_patch_blades';
      stitchRoadGroup.visible = enc?.id === 'stitch_scarecrow';
      katrinaCraneGroup.visible = enc?.id === 'katrina_crane_patrol';
      lilBooDriftGroup.visible = enc?.id === 'lil_boo_jar';

      if (enc?.id === 'pumpkin_patch_tank') {
        const tankZ = -8 + clampedProg * 54;
        const tankX = Math.sin(clampedProg * Math.PI * 2) * 2.2;
        tankGroup.position.set(tankX, 0, tankZ);
        tankGroup.rotation.y = 0;

        tankCannonCooldown -= dt;
        if (tankCannonCooldown <= 0) {
          let nearest: MonsterAgent | null = null;
          let bestD = 999;
          monsters.forEach((m) => {
            if (m.respawnTimer > 0 || Math.abs(m.floorY) > 1) return;
            const d = Math.hypot(m.x - tankX, m.z - tankZ);
            if (d < bestD) {
              bestD = d;
              nearest = m;
            }
          });
          if (nearest && bestD < 38) {
            tankCannonCooldown = 1.9;
            halloweenAudio.playTankCannonShotSfx();
            spawnExplosionAt(
              (nearest as MonsterAgent).x,
              0,
              (nearest as MonsterAgent).z,
              6.5,
              95
            );
          }
        }
      } else if (enc?.id === 'miriam_monkeys') {
        const mx = -28 + clampedProg * 56;
        const my = 14.5 + Math.sin(clampedProg * Math.PI * 3) * 2.2;
        const mz = 8 + Math.cos(clampedProg * Math.PI * 2) * 6;
        miriamFlightGroup.position.set(mx, my, mz);
        miriamFlightGroup.rotation.y = Math.PI / 2;
      } else if (enc?.id === 'pumpkin_patch_blades') {
        const px = p.x + Math.sin(t * 2.5) * 2.8;
        const pz = p.z - 3.5 + Math.cos(t * 2.5) * 2.2;
        ppBladesGroup.position.set(px, p.y, pz);
        ppBladesGroup.rotation.y = t * 5.5;
        animateHumanoidSkeleton(ppBladesGroup, t, 1.3, (t * 3) % 1, 'HIGH', 3);
      } else if (enc?.id === 'stitch_scarecrow') {
        const sx = -14 + clampedProg * 28;
        stitchRoadGroup.position.set(sx, 0, 14.0);
        stitchRoadGroup.rotation.y = Math.PI / 2;
        animateHumanoidSkeleton(stitchRoadGroup, t, 1.0, 0, 'MID', 1);
      } else if (enc?.id === 'katrina_crane_patrol') {
        const kz = 46 - clampedProg * 52;
        katrinaCraneGroup.position.set(3.2, 0, kz);
        katrinaCraneGroup.rotation.y = Math.PI;
        animateHumanoidSkeleton(katrinaSubSlot, t, 1.0, 0, 'MID', 1);
        animateHumanoidSkeleton(craneSubSlot, t + 0.5, 1.0, 0, 'MID', 1);
      } else if (enc?.id === 'lil_boo_jar') {
        const angle = clampedProg * Math.PI * 4;
        lilBooDriftGroup.position.set(
          p.x + Math.cos(angle) * 3.5,
          p.y + 1.8 + Math.sin(t * 4) * 0.4,
          p.z + Math.sin(angle) * 3.5
        );
        lilBooDriftGroup.lookAt(camera.position);
      }

      // --- D. CAMERA FOLLOW (3RD-PERSON SURVIVOR VIEW vs WAYPOINT VIEW) ---
      if (cameraModeRef.current === 'THIRD_PERSON') {
        const isInsideCastle = p.z < -35.8;
        const camDist = isInsideCastle ? 4.8 : p.isSprinting ? 6.8 : 6.0;
        const camHeight = isInsideCastle ? 2.55 : 2.95;
        const shoulderOffset = 0.62;

        const desiredCamX =
          p.x + Math.sin(p.yaw) * camDist + Math.cos(p.yaw) * shoulderOffset;
        const desiredCamY = p.y + camHeight;
        const desiredCamZ =
          p.z + Math.cos(p.yaw) * camDist - Math.sin(p.yaw) * shoulderOffset;

        camera.position.lerp(new THREE.Vector3(desiredCamX, desiredCamY, desiredCamZ), 0.16);

        const shakeX = p.cameraShakeTimer > 0 ? (Math.random() - 0.5) * 0.25 : 0;
        const shakeY = p.cameraShakeTimer > 0 ? (Math.random() - 0.5) * 0.25 : 0;

        const lookAheadX = p.x - Math.sin(p.yaw) * 7.5 + shakeX;
        const lookAheadY = p.y + 1.55 + shakeY;
        const lookAheadZ = p.z - Math.cos(p.yaw) * 7.5;
        cameraLookAtTargetRef.current.lerp(
          new THREE.Vector3(lookAheadX, lookAheadY, lookAheadZ),
          0.22
        );
        camera.lookAt(cameraLookAtTargetRef.current);
      } else {
        camera.position.lerp(cameraTargetPosRef.current, 0.08);
        camera.lookAt(cameraLookAtTargetRef.current);
      }

      composer.render();
    };

    reqId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    (container as any).__billboardPosterMeshes = billboardPosterMeshes;

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('mousedown', handleCanvasPointerDown);
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose();
      renderer.dispose();
    };
  }, [
    billboardNodes,
    triggerBatAttack,
    triggerMolotovThrow,
    triggerEncounter,
    cycleBushidoStance,
    triggerBushidoParry,
    triggerKineticDash,
  ]);

  // Update billboard & castle wall painting emissive highlight when selection changes
  useEffect(() => {
    const container = mountRef.current as any;
    const map = container?.__billboardPosterMeshes as
      | Record<string, THREE.MeshStandardMaterial[]>
      | undefined;
    if (!map) return;

    Object.entries(map).forEach(([id, mats]) => {
      const isSel = id === selectedBillboardId;
      mats.forEach((mat) => {
        mat.emissive.set(isSel ? '#ff9d3b' : '#d6cbb5');
        mat.emissiveIntensity = isSel ? 0.96 : 0.56;
      });
    });
  }, [selectedBillboardId]);

  const comicPages = useMemo(() => pumpkinPatchV4.pages || [], []);
  const currentComicPage = comicPages[selectedComicPageIdx] || comicPages[0];

  const roomsOnActiveFloor = useMemo(
    () => CASTLE_ROOMS.filter((r) => r.floorIndex === currentFloorIdx),
    [currentFloorIdx]
  );

  return (
    <div className="relative w-full h-[calc(100vh-5rem)] min-h-[760px] bg-[#040208] text-white overflow-hidden rounded-2xl border border-orange-500/30 shadow-[0_0_90px_rgba(249,115,22,0.18)] select-none">
      {/* 1. LIVE 3D CANVAS MOUNT */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full z-0 cursor-crosshair" />

      {/* 2. GRINDHOUSE 35MM FILM GRAIN & VIGNETTE OVERLAY */}
      {grindhouseLook && (
        <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 48%, rgba(0,0,0,0) 48%, rgba(8,3,15,0.52) 82%, rgba(2,1,5,0.88) 100%)',
            }}
          />
        </div>
      )}

      {/* 2B. FLOATING COMBAT CALLOUT & +XP / +HP SLAY REWARD POPUPS */}
      {combatCallout && (
        <div
          key={combatCallout.id}
          className="pointer-events-none absolute top-28 left-1/2 -translate-x-1/2 z-30 animate-bounce"
        >
          <div
            className="px-4 py-1.5 rounded-full bg-black/85 border-2 font-black text-xs uppercase tracking-widest shadow-2xl"
            style={{
              borderColor: combatCallout.color,
              color: combatCallout.color,
              boxShadow: `0 0 28px ${combatCallout.color}66`,
            }}
          >
            {combatCallout.text}
          </div>
        </div>
      )}

      {rewardPopups.length > 0 && (
        <div className="pointer-events-none absolute top-40 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5">
          {rewardPopups.map((rp) => (
            <div
              key={rp.id}
              className="px-4 py-1.5 rounded-xl bg-black/90 border-2 font-black text-xs uppercase tracking-wider shadow-[0_0_30px_rgba(16,185,129,0.5)] animate-pulse"
              style={{ borderColor: rp.color, color: rp.color }}
            >
              {rp.label}
            </div>
          ))}
        </div>
      )}

      {/* 2C. ACTIVE ART COUNCIL & GAME PRODUCTION COUNCIL LIVE DIRECTION BAR */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-gradient-to-r from-amber-950/85 via-zinc-950/90 to-cyan-950/85 border-b border-amber-500/30 text-[11px]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="px-1.5 py-0.5 rounded bg-amber-500 text-black font-black text-[9px] uppercase tracking-wider shrink-0">
            Scripted Art Notes
          </span>
          <span className="text-amber-200 font-semibold truncate">{artCouncilNote}</span>
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="px-1.5 py-0.5 rounded bg-cyan-400 text-black font-black text-[9px] uppercase tracking-wider shrink-0">
            Scripted Game Notes
          </span>
          <span className="text-cyan-200 font-semibold truncate">{gameCouncilNote}</span>
        </div>
        <button
          onClick={() => {
            setCouncilVoiceEnabled((prev) => {
              const next = !prev;
              if (next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                try {
                  const u = new SpeechSynthesisUtterance(
                    'Art Council and Game Production Council live voice direction enabled for Ravencrest Castle.'
                  );
                  u.rate = 1.04;
                  window.speechSynthesis.speak(u);
                } catch {}
              }
              return next;
            });
          }}
          className={`px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-wider cursor-pointer shrink-0 ${
            councilVoiceEnabled
              ? 'bg-emerald-500 text-black border-emerald-300'
              : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
          }`}
          title="Toggle Spoken Audio Commentary from the Art & Game Councils"
        >
          🎙️ Council Voice: {councilVoiceEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* 3. TOP BAR: NAVIGATION, ENGINE TELEMETRY, SURVIVOR & MUSIC/AUDIO CONTROLS */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-gradient-to-b from-black/90 via-black/70 to-transparent border-b border-orange-500/20">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBackToVault}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-bold text-zinc-200 transition cursor-pointer"
          >
            <span>←</span>
            <span>Exit to Vault</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-400">
                60FPS 3D Engine • 12-Room Castle Mansion • Sheet-Accurate Rigs
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                ⚡ {fpsCount} FPS • {glbLoadedCount}/4 GLB Bundles
              </span>
            </div>
            <h1 className="text-base md:text-lg font-black tracking-tight text-white">
              The Lonesome Crossroads &amp; 12-Room Haunted Castle Mansion
            </h1>
          </div>
        </div>

        {/* Survivor & Combat / Castle Map / Music Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Art & Game Production Council Render Lens Selector */}
          <div className="flex items-center bg-zinc-950/90 border border-amber-500/40 rounded-lg p-0.5">
            {CASTLE_COUNCIL_LENSES.map((lens) => (
              <button
                key={lens.id}
                onClick={() => setCouncilLens(lens.id)}
                title={lens.councilLead}
                className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                  councilLens === lens.id
                    ? 'bg-amber-500 text-black shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                🎨 {lens.label.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Playable Survivor Switch: Jack Thorne (Male Slayer) vs Elise Carter (Female Slayer) */}
          <div className="flex items-center bg-zinc-950/90 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => {
                setSurvivorGender('MALE');
                announceCouncilDirective(
                  '🎨 ART COUNCIL: "Switched to Jack Thorne (Male Monster Slayer) — Ranger jacket, tactical backpack, bloodied Katana & Spiked Bat active."',
                  '🎮 GAME COUNCIL: "Jack Thorne online: high-stance Bushido execution & wide bat cleave ready."'
                );
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'MALE'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🧑 Jack Thorne (Male)
            </button>
            <button
              onClick={() => {
                setSurvivorGender('FEMALE');
                announceCouncilDirective(
                  '🎨 ART COUNCIL: "Switched to Elise Carter (Female Monster Slayer) — High ponytail, hooded tactical jacket, survival pack & dual weapons active."',
                  '🎮 GAME COUNCIL: "Elise Carter online: agile scavenger footwork & rapid dual-weapon strikes ready."'
                );
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'FEMALE'
                  ? 'bg-pink-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              👩 Elise Carter (Female)
            </button>
          </div>

          {/* Bonus AI Helper Character: Pumpkin Patch (Melvin Lester) */}
          <button
            onClick={() => {
              setPumpkinHelperActive((prev) => {
                const next = !prev;
                if (next) halloweenAudio.playPlasmaBladesAppear();
                return next;
              });
            }}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
              pumpkinHelperActive
                ? 'bg-orange-600/90 border-orange-400 text-white shadow-[0_0_16px_rgba(249,115,22,0.5)]'
                : 'bg-zinc-950/90 border-orange-500/40 text-orange-300 hover:text-white'
            }`}
            title="Summon/Toggle Pumpkin Patch as your AI Bonus Helper (Hotkey: P)"
          >
            🎃 Ally: Pumpkin Patch {pumpkinHelperActive ? 'ON' : 'OFF'} (P)
          </button>

          {/* Bushido Blade 3-Stance Selector */}
          <div className="flex items-center bg-zinc-950/90 border border-red-500/40 rounded-lg p-0.5">
            {(['HIGH', 'MID', 'LOW'] as const).map((st, idx) => (
              <button
                key={st}
                onClick={() => cycleBushidoStance(st)}
                className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                  bushidoStance === st
                    ? st === 'HIGH'
                      ? 'bg-red-600 text-white'
                      : st === 'MID'
                      ? 'bg-amber-500 text-black'
                      : 'bg-purple-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                [{idx + 1}] {st}
              </button>
            ))}
          </div>

          {/* 12-Room Castle Map Modal Button */}
          <button
            onClick={() => setShowCastleMapModal((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
              showCastleMapModal
                ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_16px_rgba(168,85,247,0.5)]'
                : 'bg-purple-950/80 hover:bg-purple-900 border-purple-500/50 text-purple-200'
            }`}
          >
            🏰 12-Room Castle Map
          </button>

          {/* Summon Tank Backup */}
          <button
            onClick={() => triggerEncounter('pumpkin_patch_tank')}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 border border-emerald-300/40 text-[11px] font-black uppercase tracking-wider text-white transition cursor-pointer"
          >
            🚜 Tank Backup [T]
          </button>

          {/* Gothic Organ Music Toggle */}
          <button
            onClick={() => setMusicEnabled((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
              musicEnabled
                ? 'bg-indigo-950/80 border-indigo-500/50 text-indigo-200'
                : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'
            }`}
          >
            {musicEnabled ? '🎵 Organ Music: ON' : '🎵 Music: OFF'}
          </button>

          {/* Audio SFX Toggle */}
          <button
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
              soundEnabled
                ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'
            }`}
          >
            {soundEnabled ? '🔊 SFX: ON' : '🔇 SFX: MUTE'}
          </button>

          <button
            onClick={() => setShowStoryIntelDrawer((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-lg bg-purple-950/90 hover:bg-purple-900 border border-purple-500/50 text-[11px] font-bold text-purple-200 transition cursor-pointer"
          >
            🧠 Story Intel &amp; Character Sheets
          </button>

          <button
            onClick={() => setShowSidePanels((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 text-[11px] font-bold text-zinc-200 transition cursor-pointer"
          >
            {showSidePanels ? '👁️ Clean View' : '📋 Show HUD'}
          </button>
        </div>
      </div>

      {/* 3B. MULTI-LEVEL 12-ROOM CASTLE FLOORPLAN & QUICK TELEPORT RIBBON */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-black/85 border-b border-purple-500/30 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-purple-300 mr-1">
            🏰 Castle Floors:
          </span>
          <button
            onClick={() => teleportToCastleRoom('CROSSROADS')}
            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition cursor-pointer ${
              !currentRoom
                ? 'bg-orange-600 text-white'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-700'
            }`}
          >
            🛣️ Crossroads (Outside)
          </button>
          {[
            { idx: 0, label: '[B] Basement Crypt (-6m)', room: CASTLE_ROOMS[0] },
            { idx: 1, label: '[F1] Ground Mansion (0m)', room: CASTLE_ROOMS[3] },
            { idx: 2, label: '[F2] Upper Noble (+6m)', room: CASTLE_ROOMS[8] },
            { idx: 3, label: '[F3] Creepy Attic (+12m)', room: CASTLE_ROOMS[11] },
          ].map((fl) => (
            <button
              key={fl.idx}
              onClick={() => {
                setCurrentFloorIdx(fl.idx);
                teleportToCastleRoom(fl.room);
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition cursor-pointer ${
                currentRoom && currentFloorIdx === fl.idx
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-700'
              }`}
            >
              {fl.label}
            </button>
          ))}

          <span className="text-zinc-600 mx-1">|</span>
          <span className="text-[10px] font-bold text-zinc-400">Rooms on Floor:</span>
          {roomsOnActiveFloor.map((rm) => (
            <button
              key={rm.id}
              onClick={() => teleportToCastleRoom(rm)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                currentRoom?.id === rm.id
                  ? 'bg-amber-500 text-black font-black'
                  : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/70'
              }`}
            >
              #{rm.roomNumber} {rm.name.split(' (')[0]}
            </button>
          ))}
        </div>

        {/* Combat, Level, XP & Active Room Telemetry */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-[10px] font-black text-amber-300">
            ⭐ LVL {playerLevel}
          </span>
          <div className="flex items-center gap-1.5" title={`Health: ${playerHp}% of ${playerMaxHp} Max HP`}>
            <span className="text-[10px] font-black uppercase text-emerald-400">❤️ HP</span>
            <div className="w-20 h-2 rounded-full bg-zinc-800 overflow-hidden border border-zinc-700">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-emerald-400 transition-all"
                style={{ width: `${playerHp}%` }}
              />
            </div>
          </div>
          <div
            className="flex items-center gap-1.5"
            title={`XP: ${playerXp} / ${playerLevel * 150} (Slay monsters for +XP & +HP!)`}
          >
            <span className="text-[10px] font-black uppercase text-cyan-300">
              ⚡ XP {playerXp}/{playerLevel * 150}
            </span>
            <div className="w-20 h-2 rounded-full bg-zinc-800 overflow-hidden border border-cyan-500/40">
              <div
                className="h-full bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-300 transition-all"
                style={{
                  width: `${Math.min(100, ((playerXp % 150) / 150) * 100)}%`,
                }}
              />
            </div>
          </div>
          <span className="text-[11px] font-black text-orange-400">
            💀 Slain: {monstersSlain}
          </span>
          <span className="text-[11px] font-bold text-emerald-300 truncate max-w-[280px]">
            {combatLogText}
          </span>
        </div>
      </div>

      {/* 3C. INTERACTIVE 12-ROOM CASTLE FLOORPLAN MODAL */}
      {showCastleMapModal && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-4xl rounded-2xl bg-zinc-950/95 border-2 border-purple-500/60 p-5 backdrop-blur-xl shadow-[0_20px_90px_rgba(0,0,0,0.95)]">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                Multi-Level Gothic Architecture • Central Spiral Staircase (-6m to +12m)
              </span>
              <h2 className="text-lg font-black text-white">
                🏰 Haunted Castle Mansion — All 12 Explorable Rooms &amp; Wall Movie Paintings
              </h2>
            </div>
            <button
              onClick={() => setShowCastleMapModal(false)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 cursor-pointer"
            >
              ✕ Close Floorplan
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { floorIdx: 3, title: 'Level 3: Creepy Attic (+12m)' },
              { floorIdx: 2, title: 'Level 2: Upper Noble (+6m)' },
              { floorIdx: 1, title: 'Level 1: Ground Halls (0m)' },
              { floorIdx: 0, title: 'Level 0: Basement Crypt (-6m)' },
            ].map((lvl) => (
              <div
                key={lvl.floorIdx}
                className="rounded-xl bg-zinc-900/90 border border-zinc-800 p-3 flex flex-col gap-2"
              >
                <div className="text-xs font-black uppercase tracking-wider text-purple-300 border-b border-zinc-800 pb-1.5">
                  {lvl.title}
                </div>
                {CASTLE_ROOMS.filter((r) => r.floorIndex === lvl.floorIdx).map((rm) => {
                  const paintingFilm = billboardNodes.find((b) => b.castleRoomId === rm.id);
                  const isHere = currentRoom?.id === rm.id;
                  return (
                    <div
                      key={rm.id}
                      onClick={() => {
                        teleportToCastleRoom(rm);
                        setShowCastleMapModal(false);
                      }}
                      className={`p-2.5 rounded-lg border transition cursor-pointer ${
                        isHere
                          ? 'bg-purple-950/90 border-purple-400 shadow'
                          : 'bg-zinc-950/80 hover:bg-zinc-800/80 border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-white">
                          Room #{rm.roomNumber}: {rm.name}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                          Teleport →
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-1 line-clamp-2">
                        {rm.subtitle}
                      </p>
                      {paintingFilm && (
                        <div className="mt-1.5 text-[10px] font-bold text-amber-300 truncate">
                          🖼️ Wall Painting: {paintingFilm.title} ({paintingFilm.year})
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. LEFT HUD: ROADSIDE BILLBOARDS & CASTLE WALL MOVIE PAINTINGS DIRECTORY */}
      {showSidePanels && (
        <div className="absolute top-28 left-4 bottom-20 z-20 w-72 hidden lg:flex flex-col rounded-2xl bg-black/78 border border-zinc-800/90 backdrop-blur-md overflow-hidden shadow-2xl">
          <div className="px-3.5 py-2.5 border-b border-zinc-800 bg-zinc-950/90">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                🪧 Billboards &amp; 🖼️ Castle Paintings
              </span>
              <span className="text-[10px] font-bold text-zinc-400">
                {billboardNodes.length} Curated Films
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              Click any film below to inspect its Roadside Billboard or teleport to its Castle Wall Painting!
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {billboardNodes.map((node) => {
              const isSelected = node.id === selectedBillboardId;
              const room = CASTLE_ROOMS.find((r) => r.id === node.castleRoomId);
              return (
                <div
                  key={node.id}
                  onClick={() => {
                    setSelectedBillboardId(node.id);
                    if (cameraMode === 'WAYPOINT_VIEW') {
                      focusBillboardCamera(node, Boolean(currentRoom));
                    }
                  }}
                  className={`w-full text-left p-2 rounded-xl border transition cursor-pointer flex items-center gap-2.5 ${
                    isSelected
                      ? 'bg-gradient-to-r from-orange-950/90 via-amber-950/60 to-zinc-900 border-orange-400/80 shadow-[0_0_20px_rgba(249,115,22,0.25)]'
                      : 'bg-zinc-900/65 hover:bg-zinc-800/75 border-zinc-800/80'
                  }`}
                >
                  <img
                    src={node.posterUrl}
                    alt={node.title}
                    className="w-11 h-14 object-cover rounded-lg border border-zinc-700 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300">
                        {room ? `🏰 Rm #${room.roomNumber}` : node.compass}
                      </span>
                      {node.isHeroPumpkinPatch && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-orange-500 text-black">
                          FEATURED
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-extrabold text-white truncate mt-0.5">
                      {node.title}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-zinc-400 truncate">
                        {room ? room.name.split(' (')[0] : node.directionLabel}
                      </span>
                      {room && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            teleportToCastleRoom(room);
                          }}
                          className="px-1.5 py-0.5 rounded bg-purple-600/80 hover:bg-purple-500 text-[9px] font-black text-white cursor-pointer"
                        >
                          🖼️ Go to Painting
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. RIGHT HUD: SELECTED BILLBOARD / CASTLE WALL PAINTING INSPECTOR */}
      {showSidePanels && selectedNode && (
        <div className="absolute top-28 right-4 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-black/82 border border-orange-500/40 backdrop-blur-xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.9)]">
          <div className="relative h-36 bg-zinc-950 overflow-hidden">
            <img
              src={selectedNode.posterUrl}
              alt={selectedNode.title}
              className="w-full h-full object-cover opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
            <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-md bg-black/80 border border-amber-400/50 text-[10px] font-black uppercase tracking-wider text-amber-300">
                {currentRoom
                  ? `🖼️ Castle Room #${currentRoom.roomNumber} Painting`
                  : `🪧 ${selectedNode.directionLabel}`}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-orange-600/90 text-[10px] font-black text-white">
                {selectedNode.year}
              </span>
            </div>
            <div className="absolute bottom-2 left-3 right-3">
              <h2 className="text-base font-black text-white leading-tight drop-shadow">
                {selectedNode.title}
              </h2>
              <p className="text-[11px] text-zinc-300 font-medium">
                Directed by {selectedNode.director}
              </p>
            </div>
          </div>

          <div className="p-3.5 space-y-2.5">
            <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2">
              {selectedNode.tagline}
            </p>

            <div className="flex flex-col gap-1.5 pt-1">
              <button
                onClick={() => {
                  if (selectedNode.isHeroPumpkinPatch) {
                    onPlayPumpkinPatch();
                  } else if (selectedNode.archiveFilm) {
                    onSelectArchiveFilm(selectedNode.archiveFilm);
                  }
                }}
                className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-black font-black text-xs uppercase tracking-wider shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
              >
                <span>▶</span>
                <span>
                  {selectedNode.isHeroPumpkinPatch
                    ? 'Watch Pumpkin Patch Now'
                    : 'Watch Full Movie in Vault'}
                </span>
              </button>

              {selectedNode.castleRoomId && (
                <button
                  onClick={() => {
                    const rm = CASTLE_ROOMS.find((r) => r.id === selectedNode.castleRoomId);
                    if (rm) teleportToCastleRoom(rm);
                  }}
                  className="w-full py-1.5 px-3 rounded-xl bg-purple-950/90 hover:bg-purple-900 border border-purple-500/40 text-purple-200 font-bold text-xs transition cursor-pointer"
                >
                  🏰 View Wall Painting in Castle Room
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. ACTIVE SPARSE ENCOUNTER POPUP BANNER */}
      {activeEncounter && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-xl rounded-2xl bg-black/88 border-2 border-orange-500/70 backdrop-blur-xl p-3 shadow-[0_0_55px_rgba(249,115,22,0.4)]">
          <div className="flex items-center gap-3">
            <img
              src={activeEncounter.portraitUrl}
              alt={activeEncounter.title}
              className="w-12 h-12 rounded-xl object-cover border-2 border-orange-400 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded bg-orange-500 text-black text-[9px] font-black uppercase tracking-widest">
                  ⚡ LIVE 3D ENCOUNTER • {activeEncounter.storyIntelTimecode}
                </span>
                <button
                  onClick={() => setActiveEncounter(null)}
                  className="text-zinc-400 hover:text-white text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <h3 className="text-xs font-black text-white mt-0.5 truncate">
                {activeEncounter.title}
              </h3>
              <p className="text-[11px] italic text-amber-200/95 truncate">
                {activeEncounter.scriptQuote}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 7. BOTTOM ACTION DOCK: BUSHIDO COMBAT, MOLOTOV, SPIRAL STAIRS & ENCOUNTERS */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-1.5 px-3 py-2 rounded-2xl bg-black/88 border border-zinc-800/90 backdrop-blur-xl shadow-2xl max-w-[96vw]">
        <button
          onClick={triggerBatAttack}
          className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider shadow transition cursor-pointer"
        >
          ⚔️ Slash Combo #{comboStep} [Click/F]
        </button>
        <button
          onClick={triggerBushidoParry}
          className={`px-2.5 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wider transition cursor-pointer ${
            riposteCharged
              ? 'bg-cyan-500 text-black border-cyan-200 animate-pulse'
              : 'bg-sky-950/90 hover:bg-sky-900 border-sky-500/50 text-sky-200'
          }`}
        >
          🛡️ {riposteCharged ? 'RIPOSTE READY!' : 'Parry [R]'}
        </button>
        <button
          onClick={triggerMolotovThrow}
          className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-black text-xs font-black uppercase tracking-wider shadow transition cursor-pointer"
        >
          🔥 Throw Molotov [G]
        </button>

        <div className="h-4 w-px bg-zinc-800 mx-1" />

        {SPARSE_ENCOUNTERS.slice(0, 4).map((enc) => (
          <button
            key={enc.id}
            onClick={() => triggerEncounter(enc.id)}
            className="px-2.5 py-1 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-[11px] font-bold text-zinc-200 transition cursor-pointer"
          >
            {enc.id === 'pumpkin_patch_tank' && '🚜 Tank Assault'}
            {enc.id === 'miriam_monkeys' && '🧙‍♀️ Miriam Flyover'}
            {enc.id === 'pumpkin_patch_blades' && '🎃 Plasma Blades'}
            {enc.id === 'stitch_scarecrow' && '🌾 Stitch Patrol'}
          </button>
        ))}

        {onOpenChatRoom && (
          <button
            onClick={onOpenChatRoom}
            className="px-2.5 py-1 rounded-xl bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 text-[11px] font-bold text-orange-300 transition cursor-pointer"
          >
            🦇 Fan Chat &amp; VTuber
          </button>
        )}
      </div>

      {/* 8. STORY INTEL & CHARACTER SHEET GALLERY DRAWER */}
      {showStoryIntelDrawer && (
        <div className="absolute inset-y-14 right-0 z-40 w-full max-w-xl bg-zinc-950/95 border-l border-purple-500/40 backdrop-blur-2xl p-5 flex flex-col shadow-[0_0_80px_rgba(0,0,0,0.95)]">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                100% Sheet-Accurate 3D Volumetric Rigs • Story Intelligence
              </span>
              <h2 className="text-lg font-black text-white">
                {selectedNode.title} — Character Sheets &amp; Breakdown
              </h2>
            </div>
            <button
              onClick={() => setShowStoryIntelDrawer(false)}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-300 cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          <div className="flex items-center gap-1.5 mt-3 border-b border-zinc-800 pb-2.5">
            {(
              [
                { id: 'COUNCIL_SHEETS', label: '🎨 3D Turnaround Sheets' },
                { id: 'ACTS', label: '🎬 Script Acts' },
                { id: 'CHARACTERS', label: '🎃 3D Cast' },
                { id: 'COMIC_PANELS', label: '📖 Comic Stills' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStoryIntelTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  storyIntelTab === tab.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto mt-4 pr-1 space-y-3">
            {storyIntelTab === 'COUNCIL_SHEETS' && (
              <div className="space-y-3">
                {[
                  {
                    title: 'Ravencrest Castle — 5-Floor Architectural Blueprint (12 Bedrooms • 4 Towers • Observatory)',
                    url: '/models/halloween/ravencrest/floorplan_blueprint.jpg',
                  },
                  {
                    title: 'Ravencrest Castle — Grand Entrance Hall & Raven Floor Medallion Master Plate',
                    url: '/models/halloween/ravencrest/grand_hall_plate.jpg',
                  },
                  {
                    title: 'Jack Thorne & Elise Carter — Playable Survivors & Monster Slayers Master Sheet',
                    url: '/models/halloween/ravencrest/survivors_jack_elise.jpg',
                  },
                  {
                    title: 'The Ravencrest Outbreak — Zombies, Werewolves & Vampires Master Creature Sheet',
                    url: '/models/halloween/ravencrest/monsters_outbreak.jpg',
                  },
                  {
                    title: 'Ravencrest Castle Interior Modular Assets & PBR Material Swatches Sheet',
                    url: '/models/halloween/ravencrest/interior_assets_sheet.jpg',
                  },
                  {
                    title: 'Road to Ravencrest — Billboards, Guardrail, Moat Bridge & Volumetric Fog Sheet',
                    url: '/models/halloween/ravencrest/road_assets_sheet.jpg',
                  },
                  {
                    title: 'Ravencrest Castle Exterior Architectural Callouts (Spires, Buttresses, Viaduct & Keep)',
                    url: '/models/halloween/ravencrest/castle_architecture_callouts.jpg',
                  },
                  {
                    title: 'Pumpkin Patch (Melvin Lester) — Bonus AI Ally 3D Turnaround Sheet',
                    url: '/models/halloween/sheets/pumpkin_patch_sheet.png',
                  },
                ].map((item) => (
                  <div
                    key={item.url}
                    className="rounded-xl bg-zinc-900/90 border border-zinc-800 overflow-hidden"
                  >
                    <img
                      src={item.url}
                      alt={item.title}
                      className="w-full h-44 object-contain bg-black"
                    />
                    <div className="p-2.5 text-xs font-bold text-white">{item.title}</div>
                  </div>
                ))}
              </div>
            )}

            {storyIntelTab === 'ACTS' && (
              <div className="space-y-2.5">
                {(selectedNode.storyIntel?.report?.structure?.acts || []).map((act, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800"
                  >
                    <div className="text-xs font-black text-orange-400">
                      Act {act.number}: {act.title}
                    </div>
                    <p className="text-xs text-zinc-300 mt-1">{act.summary}</p>
                  </div>
                ))}
              </div>
            )}

            {storyIntelTab === 'CHARACTERS' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {pumpkinPatchCharacters.map((ch) => (
                  <div
                    key={ch.id}
                    className="p-2.5 rounded-xl bg-zinc-900/85 border border-zinc-800 flex items-start gap-2.5"
                  >
                    <img
                      src={ch.characterImageUrl || ch.imageUrl || ch.actorPortraitUrl}
                      alt={ch.name}
                      className="w-12 h-12 rounded-lg object-cover border border-orange-500/40 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-black text-white truncate">
                        {ch.name}
                      </div>
                      <div className="text-[10px] text-orange-400 font-bold">
                        {ch.role}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {storyIntelTab === 'COMIC_PANELS' && currentComicPage && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-400">
                    Page {selectedComicPageIdx + 1} of {comicPages.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() =>
                        setSelectedComicPageIdx(
                          (prev) => (prev - 1 + comicPages.length) % comicPages.length
                        )
                      }
                      className="px-2.5 py-1 rounded bg-zinc-800 text-xs font-bold cursor-pointer"
                    >
                      ← Prev
                    </button>
                    <button
                      onClick={() =>
                        setSelectedComicPageIdx((prev) => (prev + 1) % comicPages.length)
                      }
                      className="px-2.5 py-1 rounded bg-zinc-800 text-xs font-bold cursor-pointer"
                    >
                      Next →
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {currentComicPage.panels.map((pan, panelIndex) => (
                    <div
                      key={panelIndex}
                      className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900"
                    >
                      <img
                        src={pan.imageUrl}
                        alt={`Comic panel ${panelIndex + 1}`}
                        className="w-full h-32 object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HauntedCastleExhibition;
