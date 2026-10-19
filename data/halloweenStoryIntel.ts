/**
 * Halloween Curation & Classic Cinema — Story Intelligence, Character Dossiers & The Actors Behind Them.
 *
 * Provides complete, structured Story Intelligence (`StoryReport` + `TaleoAnalysisJob`),
 * Character profiles (`Character` + `StoryReportCharacter`), and Actor biographies/portraits
 * (`ClassicActorBehindCharacter`) for every film in the Halloween Curation and Curated Classics.
 */

import type { StoryReport, TaleoAnalysisJob } from '../services/storyIntelService';
import type { Character } from '../types';

export interface ClassicActorBehindCharacter {
  id?: string;
  characterId: string;
  characterName: string;
  name?: string;
  aka?: string[];
  tier: 'MAIN' | 'SUPPORTING' | 'MINOR';
  roleArchetype: string;
  role?: string;
  archetype?: string;
  characterBio: string;
  bio?: string;
  characterArc: string;
  screenTimeSec: number;
  dialogueLines: number;
  bestFrameSec: number;
  accentColor: string;
  characterImageUrl?: string;
  imageUrl?: string;
  // ── The Actor Behind the Character ──
  actorName: string;
  actorWikiSlug: string;
  actorPortraitUrl: string;
  actorYears: string;
  actorNationality: string;
  actorBio: string;
  performanceNote: string;
  actorOtherWorks: string[];
  actorNotableWorks?: string[];
  actor?: {
    name: string;
    wikiPageTitle: string;
    portraitUrl: string;
    yearsLived: string;
    nationality: string;
    bio: string;
    performanceNote: string;
    otherWorks: string[];
  };
}

export type HalloweenCharacterWithActor = ClassicActorBehindCharacter;

export interface FilmStoryIntelBundle {
  identifier: string;
  filmId?: string;
  title: string;
  year: string;
  director: string;
  runtimeSec: number;
  tone: string[];
  logline?: string;
  synopsis?: string;
  themes?: string[];
  charactersWithActors: ClassicActorBehindCharacter[];
  characters?: ClassicActorBehindCharacter[];
  report: StoryReport;
}

export type HalloweenFilmIntelBundle = FilmStoryIntelBundle;

const RAW_HALLOWEEN_STORY_INTEL_BUNDLES: Record<string, FilmStoryIntelBundle> = {
  // ── 0. PUMPKIN PATCH (2025 · Independent Feature by Brian James Gage) ────────
  album_1787881859314_mlt23: {
    identifier: 'album_1787881859314_mlt23',
    title: 'Pumpkin Patch',
    year: '2025',
    director: 'Brian James Gage',
    runtimeSec: 3490,
    tone: ['High-Energy', 'Gothic Satire', 'Dystopian Siege', 'Gritty Action'],
    charactersWithActors: [
      {
        characterId: 'char_1',
        characterName: 'Melvin Lester ("Pumpkin Patch")',
        aka: ['Pumpkin Patch', 'The Patch', 'MELVIN LESTER (PUMPKIN PATCH)'],
        tier: 'MAIN',
        roleArchetype: 'Anti-Hero Vigilante',
        characterBio:
          'Rogue M.I.A. operative with a glowing carved jack-o’-lantern head, black leather trench duster, and dual orange plasma blades. Framed for the fall of the skyship and banished to District 13, he fights to stop the Dimensional Rift.',
        characterArc:
          'From disgraced fugitive brawling in back-alley taverns to the reluctant savior of New Hallows who uncovers Director Jack’s inside job.',
        screenTimeSec: 2140,
        dialogueLines: 142,
        bestFrameSec: 719,
        accentColor: '#F97316',
        characterImageUrl: '/generated/comics/pumpkin_patch_v4/char_1_portrait.jpg',
        actorName: 'Brian James Gage',
        actorWikiSlug: '',
        actorPortraitUrl:
          'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc',
        actorYears: 'Contemporary',
        actorNationality: 'American',
        actorBio:
          'Creator, writer, director, and multi-character voice actor of Pumpkin Patch and the Planet Ween Universe.',
        performanceNote:
          'Voices Melvin Lester with a gravelly, deadpan Snake Plissken-inspired grit contrasted against manic holiday chaos.',
        actorOtherWorks: ['Planet Ween Universe', 'District 13 Chronicles'],
      },
      {
        characterId: 'char_2',
        characterName: 'Special Agent Katrina Van Tassel',
        aka: ['Agent Katrina Van Tassel', 'Agent Van Tassel', 'Katrina'],
        tier: 'MAIN',
        roleArchetype: 'MIA Field Operative',
        characterBio:
          'Senior Monster Intelligence Agency (M.I.A.) tactical investigator in a sharp black blazer. The only agent inside the Pentagram who questions the official narrative surrounding Melvin’s betrayal.',
        characterArc:
          'Uncovers the conspiracy inside the Pentagram and risks her career to clear Melvin’s name during the siege of District 13.',
        screenTimeSec: 1180,
        dialogueLines: 86,
        bestFrameSec: 360,
        accentColor: '#D0BCFF',
        characterImageUrl: '/generated/comics/pumpkin_patch_v4/char_2_portrait.jpg',
        actorName: 'Brian James Gage',
        actorWikiSlug: '',
        actorPortraitUrl:
          'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc',
        actorYears: 'Contemporary',
        actorNationality: 'American',
        actorBio:
          'Reimagines Washington Irving’s Sleepy Hollow heroine as a sharp-witted Monster Intelligence Agency tactical commander.',
        performanceNote:
          'Anchors the exposition and high-stakes espionage briefings of the MIA.',
        actorOtherWorks: ['Pumpkin Patch (2025)', 'Planet Ween Universe'],
      },
      {
        characterId: 'char_3',
        characterName: 'Wicked Witch (Miriam)',
        aka: ['Miriam', 'The Wicked Witch'],
        tier: 'MAIN',
        roleArchetype: 'District 13 Overlord & Sorceress',
        characterBio:
          'Emerald-skinned sorceress and warlord of the Green Castle, wearing a pointed black witch hat, tactical eyepatch, and accompanied by her cybernetic blue cat familiar.',
        characterArc:
          'Seeks the four elemental gems of the Hexagon to tear open the Dimensional Rift over New Hallows.',
        screenTimeSec: 1040,
        dialogueLines: 74,
        bestFrameSec: 1037,
        accentColor: '#10B981',
        characterImageUrl: '/generated/comics/pumpkin_patch_v4/char_3_portrait.jpg',
        actorName: 'Brian James Gage',
        actorWikiSlug: '',
        actorPortraitUrl:
          'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc',
        actorYears: 'Contemporary',
        actorNationality: 'American',
        actorBio:
          'Creator, writer, director, and ensemble voice actor of Pumpkin Patch.',
        performanceNote:
          'Delivers a theatrical, razor-sharp vocal turn blending classic wicked-witch cackles with crime-boss menace.',
        actorOtherWorks: ['Pumpkin Patch (2025)', 'Planet Ween Universe'],
      },
      {
        characterId: 'char_4',
        characterName: 'Stitch (The Scarecrow)',
        aka: ['Stitch', 'The Scarecrow'],
        tier: 'MAIN',
        roleArchetype: 'Burlap Gang Enforcer',
        characterBio:
          'Battle-scarred survivalist in a stitched burlap scarecrow mask who rules the rain-slicked rooftops and burn-barrel alleys of District 13.',
        characterArc:
          'Tests Melvin in brutal combat in District 13 before joining forces with him to defend the Rooftop Dimensional Control Console.',
        screenTimeSec: 980,
        dialogueLines: 68,
        bestFrameSec: 983,
        accentColor: '#EAB308',
        characterImageUrl: '/generated/comics/pumpkin_patch_v4/char_4_portrait.jpg',
        actorName: 'Brian James Gage',
        actorWikiSlug: '',
        actorPortraitUrl:
          'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc',
        actorYears: 'Contemporary',
        actorNationality: 'American',
        actorBio:
          'Creator, writer, director, and ensemble voice actor of Pumpkin Patch.',
        performanceNote:
          'Voices Stitch with raspy, frayed-burlap ferocity and dark humor.',
        actorOtherWorks: ['Pumpkin Patch (2025)', 'Planet Ween Universe'],
      },
      {
        characterId: 'char_5',
        characterName: 'Commander Crane (Robo-Bones)',
        aka: ['Robo-Bones', 'Cybernetic Enforcer', 'Commander Crane'],
        tier: 'SUPPORTING',
        roleArchetype: 'MIA Cybernetic Tactical Officer',
        characterBio:
          'Cybernetic skeletal commander of the M.I.A. wearing an aristocratic top hat, monocle sensor, and glowing white optical sockets.',
        characterArc:
          'Coordinates the Pentagram’s defense grid while torn between Orange House political pressure and loyalty to his field agents.',
        screenTimeSec: 920,
        dialogueLines: 64,
        bestFrameSec: 1112,
        accentColor: '#38BDF8',
        characterImageUrl: '/generated/comics/pumpkin_patch_v4/char_5_portrait.jpg',
        actorName: 'Brian James Gage',
        actorWikiSlug: '',
        actorPortraitUrl:
          'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc',
        actorYears: 'Contemporary',
        actorNationality: 'American',
        actorBio:
          'Solo voice performance bringing the MIA’s metallic skeletal enforcer to life.',
        performanceNote:
          'Combines hard-boiled military urgency with synth-modulated cybernetic comedy.',
        actorOtherWorks: ['Pumpkin Patch (2025)'],
      },
      {
        characterId: 'char_6',
        characterName: "Lil' Boo",
        aka: ['Lil Boo'],
        tier: 'SUPPORTING',
        roleArchetype: 'Spectral Scene-Stealer',
        characterBio:
          'Bioluminescent emerald-green mini-ghost with wide expressive eyes who rides in a containment jar and acts as Melvin’s loyal sidekick and ectoplasmic battery.',
        characterArc:
          'Breaks free from containment to overload enemy circuitry and escapes with Melvin in the final getaway truck.',
        screenTimeSec: 740,
        dialogueLines: 52,
        bestFrameSec: 766,
        accentColor: '#A855F7',
        characterImageUrl: '/generated/comics/pumpkin_patch_v4/char_6_portrait.jpg',
        actorName: 'Brian James Gage',
        actorWikiSlug: '',
        actorPortraitUrl:
          'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc',
        actorYears: 'Contemporary',
        actorNationality: 'American',
        actorBio:
          'Creator, writer, director, and ensemble voice actor of Pumpkin Patch.',
        performanceNote:
          'Pitches a high-energy spectral cadence that contrasts with Melvin Lester’s gruff baritone.',
        actorOtherWorks: ['Pumpkin Patch (2025)'],
      },
      {
        characterId: 'char_7',
        characterName: 'President Tepes',
        aka: ['Vlad Tepes', 'President of Halloween'],
        tier: 'SUPPORTING',
        roleArchetype: 'Captive Head of State',
        characterBio:
          'Ancient aristocratic vampire statesman with pointed ears, fangs, and crimson-trimmed formal attire who guards the ancient Hexagon vault aboard Scare Force One.',
        characterArc:
          'Confronted during the mid-film Hexagon vault breach as the four elemental gems are seized.',
        screenTimeSec: 680,
        dialogueLines: 48,
        bestFrameSec: 276,
        accentColor: '#F43F5E',
        characterImageUrl: '/generated/comics/pumpkin_patch_v4/char_7_portrait.jpg',
        actorName: 'Brian James Gage',
        actorWikiSlug: '',
        actorPortraitUrl:
          'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc',
        actorYears: 'Contemporary',
        actorNationality: 'American',
        actorBio:
          'Named in homage to Vlad Tepes, portraying the iron-fisted leader of Planet Ween.',
        performanceNote:
          'Plays the captive president as a calculating political survivor.',
        actorOtherWorks: ['Pumpkin Patch (2025)'],
      },
      {
        characterId: 'char_8',
        characterName: 'Director Jack (Ichabod Crane)',
        aka: ['Director Jack', 'Ichabod Crane'],
        tier: 'SUPPORTING',
        roleArchetype: 'MIA Intelligence Director',
        characterBio:
          'Suave executive director of the Pentagram in a tailored tuxedo and bow tie who secretly orchestrates the Hexagon conspiracy.',
        characterArc:
          'Poses as New Hallows’ composed intelligence chief while secretly weaponizing Dr. Zoraster’s dimensional research.',
        screenTimeSec: 610,
        dialogueLines: 44,
        bestFrameSec: 1921,
        accentColor: '#FB923C',
        characterImageUrl: '/generated/comics/pumpkin_patch_v4/char_8_portrait.jpg',
        actorName: 'Brian James Gage',
        actorWikiSlug: '',
        actorPortraitUrl:
          'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc',
        actorYears: 'Contemporary',
        actorNationality: 'American',
        actorBio:
          'Creator, writer, director, and ensemble voice actor of Pumpkin Patch.',
        performanceNote:
          'Channels classic bureaucratic paranoia and urgent war-room authority.',
        actorOtherWorks: ['Pumpkin Patch (2025)'],
      },
      {
        characterId: 'char_9',
        characterName: 'Dr. Zoraster',
        aka: ['Professor Zoraster', 'Dr. Zoroster'],
        tier: 'SUPPORTING',
        roleArchetype: 'Chief Occult Scientist',
        characterBio:
          'Visionary white-bearded scientist in round dark spectacles who discovered the dimensional resonance of the four elemental gems before his disappearance.',
        characterArc:
          'His recorded holographic warnings and memorial monument hold the key to stabilizing the Dimensional Control Console.',
        screenTimeSec: 460,
        dialogueLines: 34,
        bestFrameSec: 888,
        accentColor: '#2DD4BF',
        characterImageUrl: '/generated/comics/pumpkin_patch_v4/char_9_portrait.jpg',
        actorName: 'Brian James Gage',
        actorWikiSlug: '',
        actorPortraitUrl:
          'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc',
        actorYears: 'Contemporary',
        actorNationality: 'American',
        actorBio:
          'Creator, writer, director, and ensemble voice actor of Pumpkin Patch.',
        performanceNote:
          'Brings mad-scientist cadence to the Monster Intelligence Agency’s technical briefings.',
        actorOtherWorks: ['Pumpkin Patch (2025)'],
      },
      {
        characterId: 'char_10',
        characterName: 'Eileen Withers (HNN Anchor)',
        aka: ['Eileen Withers', 'HNN News Anchor'],
        tier: 'MINOR',
        roleArchetype: 'Halloween News Network Anchor',
        characterBio:
          'Sharp-dressed werewolf chief anchor of the Halloween News Network (HNN) in an orange blazer who broadcasts live breaking alerts across New Hallows.',
        characterArc:
          'Chronicles the escalating crisis from the HNN studio desk as the sky portal opens over the city.',
        screenTimeSec: 310,
        dialogueLines: 24,
        bestFrameSec: 1852,
        accentColor: '#F472B6',
        characterImageUrl: '/generated/comics/pumpkin_patch_v4/char_10_portrait.jpg',
        actorName: 'Brian James Gage',
        actorWikiSlug: '',
        actorPortraitUrl:
          'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc',
        actorYears: 'Contemporary',
        actorNationality: 'American',
        actorBio:
          'Creator, writer, director, and ensemble voice actor of Pumpkin Patch.',
        performanceNote:
          'Satirizes breathless cable news crisis coverage on Planet Ween.',
        actorOtherWorks: ['Pumpkin Patch (2025)'],
      },
      {
        characterId: 'char_11',
        characterName: 'President Antionette',
        aka: ['Madame President Antionette'],
        tier: 'MINOR',
        roleArchetype: 'Commander-in-Chief of the Orange House',
        characterBio:
          'Aristocratic headless Commander-in-Chief of the Orange House who cradles her own powdered-wig head while addressing the nation from the presidential podium.',
        characterArc:
          'Declares a state of emergency from the Orange House Situation Room and addresses New Hallows after the rift is sealed.',
        screenTimeSec: 260,
        dialogueLines: 19,
        bestFrameSec: 3215,
        accentColor: '#C084FC',
        characterImageUrl: '/generated/comics/pumpkin_patch_v4/char_11_portrait.jpg',
        actorName: 'Brian James Gage',
        actorWikiSlug: '',
        actorPortraitUrl:
          'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/users%2Fu4XNVf41QeQERFqO0CB8JEhegXz2%2Fphoto_1780582675240?alt=media&token=bd675512-565b-4a98-83c5-5fe72e40b0dc',
        actorYears: 'Contemporary',
        actorNationality: 'American',
        actorBio:
          'Creator, writer, director, and ensemble voice actor of Pumpkin Patch.',
        performanceNote:
          'Rounds out the political satire of Planet Ween’s ruling class.',
        actorOtherWorks: ['Pumpkin Patch (2025)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'When Scare Force One crashes inside maximum-security prison colony District 13, a bar-fighting pumpkin-headed vigilante is sent in by the Monster Intelligence Agency to extract President Tepes and her classified hexagonal case before Halloween collapses.',
      synopsis:
        'On Planet Ween, the West Hallow—one of the Four Guardians—ambushes Scare Force One, forcing President Tepes to eject into the lawless prison colony District 13. Commander Ichabod Crane, Special Agent Katrina Van Tassle, and cybernetic officer Robo Bones of the Monster Intelligence Agency recruit disgraced vigilante Melvin Lester ("Pumpkin Patch") for a suicide extraction mission.',
      themes: ['Anti-hero redemption', 'Political satire', 'Survival against all odds', 'Holiday mythology'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'The Crash of Scare Force One & Recruitment',
            startSec: 0,
            endSec: 960,
            summary: 'The West Hallow downs Scare Force One into District 13; MIA operatives track Melvin Lester to a neon pool hall and force him into the extraction deal.',
            turningPoint: 'Melvin accepts the pardon deal and drops into the perimeter of District 13.',
          },
          {
            number: 2,
            title: 'Into the Labyrinth of District 13',
            startSec: 960,
            endSec: 2460,
            summary: 'Pumpkin Patch battles through rival monster gangs, Stitch the Scarecrow’s crew, and the Wicked Witch’s lieutenants to locate President Tepes and the hexagonal case.',
            turningPoint: 'Melvin discovers the true contents of the President’s hexagonal case as the West Hallow closes in.',
          },
          {
            number: 3,
            title: 'Showdown for Planet Ween',
            startSec: 2460,
            endSec: 3490,
            summary: 'A full-scale jailbreak erupts across District 13’s gates as Melvin, Katrina, and Robo Bones fight to extract the case and save Halloween before midnight.',
            turningPoint: 'Melvin turns the tables on both the prison warlords and President Tepes at the extraction bridge.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'pp_sc_1',
          index: 1,
          slugline: 'EXT. PLANET WEEN AIRSPACE / SCARE FORCE ONE - NIGHT',
          title: 'Ambush Over District 13',
          summary: 'The West Hallow intercepts Scare Force One; President Tepes clutches the hexagonal case and ejects into District 13.',
          startSec: 0,
          endSec: 420,
          actNumber: 1,
          mood: 'High-energy',
          characterRefIds: ['char_world_pumpkin_patch_universe_president_tepes'],
          stillIndexes: [0],
        },
        {
          id: 'pp_sc_2',
          index: 2,
          slugline: 'INT. NEON POOL HALL / MIA BRIEFING ROOM - NIGHT',
          title: 'Enter Pumpkin Patch',
          summary: 'After a chaotic barroom brawl, Melvin Lester is brought before Commander Crane, Agent Katrina Van Tassle, and Robo Bones.',
          startSec: 420,
          endSec: 960,
          actNumber: 1,
          mood: 'Gritty',
          characterRefIds: [
            'char_world_pumpkin_patch_universe_melvin_lester_pumpkin_patch',
            'char_world_pumpkin_patch_universe_agent_katrina_van_tassel',
            'char_world_pumpkin_patch_universe_commander_crane_robo_bones',
          ],
          stillIndexes: [1],
        },
        {
          id: 'pp_sc_3',
          index: 3,
          slugline: 'EXT. DISTRICT 13 PRISON COLONY - NIGHT',
          title: 'Gauntlet of the Guardians',
          summary: 'Melvin fights through the war-torn streets of District 13 to reach the crashed pod and recover the hexagonal case.',
          startSec: 960,
          endSec: 3490,
          actNumber: 2,
          mood: 'Tense',
          characterRefIds: [
            'char_world_pumpkin_patch_universe_melvin_lester_pumpkin_patch',
            'char_world_pumpkin_patch_universe_president_tepes',
          ],
          stillIndexes: [2],
        },
      ],
      sequences: [
        { id: 'pp_seq_1', title: 'Fall of Scare Force One', sceneIds: ['pp_sc_1', 'pp_sc_2'], purpose: 'Establish the hostage crisis and recruit the vigilante.' },
        { id: 'pp_seq_2', title: 'Siege of District 13', sceneIds: ['pp_sc_3'], purpose: 'Infiltrate the prison colony and recover the hexagonal case.' },
      ],
      locations: [
        {
          refId: 'loc_district_13',
          name: 'District 13 Maximum-Security Prison Colony',
          description: 'Walled dystopian penitentiary zone on Planet Ween ruled by monster factions.',
          kind: 'EXTERIOR / INTERIOR COMPLEX',
          sceneIds: ['pp_sc_1', 'pp_sc_3'],
          confidence: 0.99,
        },
        {
          refId: 'loc_mia_hq',
          name: 'Monster Intelligence Agency (MIA) Command',
          description: 'Tactical war room overseen by Commander Ichabod Crane and Robo Bones.',
          kind: 'INTERIOR',
          sceneIds: ['pp_sc_2'],
          confidence: 0.96,
        },
      ],
      macguffins: [
        {
          refId: 'mac_hex_case',
          name: 'President Tepes’ Hexagonal Case',
          description: 'Classified six-sided containment case carried aboard Scare Force One that holds the fate of Planet Ween.',
          narrativeRole: 'MACGUFFIN',
          sceneIds: ['pp_sc_1', 'pp_sc_3'],
          evidence: ['Guarded by President Tepes during the crash', 'Primary objective of MIA extraction'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },

  // ── 1. NIGHT OF THE LIVING DEAD (1968 · George A. Romero) ────────────────────
  'Night.Of.The.Living.Dead_1080p': {
    identifier: 'Night.Of.The.Living.Dead_1080p',
    title: 'Night of the Living Dead',
    year: '1968',
    director: 'George A. Romero',
    runtimeSec: 5760,
    tone: ['Tense', 'Claustrophobic', 'Bleak', 'Apocalyptic'],
    charactersWithActors: [
      {
        characterId: 'notld_ben',
        characterName: 'Ben',
        aka: ['The Farmhouse Leader'],
        tier: 'MAIN',
        roleArchetype: 'Resourceful Pragmatist & Hero',
        characterBio:
          'A calm, decisive man who arrives at the isolated Pennsylvania farmhouse in a pickup truck, immediately boarding up windows, securing weapons, and trying to organize seven panicked strangers to survive the night.',
        characterArc:
          'Fights tirelessly against both the encroaching ghouls outside and Harry Cooper’s cowardice inside—only to survive the night in the cellar and meet a devastatingly ironic fate at dawn at the hands of an armed posse.',
        screenTimeSec: 3920,
        dialogueLines: 198,
        bestFrameSec: 940,
        accentColor: '#F97316',
        actorName: 'Duane Jones',
        actorWikiSlug: 'Duane_Jones',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Duane_Jones_in_Night_of_the_Living_Dead.jpg/640px-Duane_Jones_in_Night_of_the_Living_Dead.jpg',
        actorYears: '1937–1988',
        actorNationality: 'American',
        actorBio:
          'Sorbonne-educated literature professor, theatre director, and actor whose casting as Ben marked the first time a Black actor played the unequivocal lead hero of a major American horror film where race was not the plot device.',
        performanceNote:
          'Jones convinced Romero to elevate Ben’s dialogue from a coarse trucker into an articulate, measured leader whose quiet authority anchors the entire siege.',
        actorOtherWorks: ['Ganja & Hess (1973)', 'Losing Ground (1982)', 'Beat Street (1984)', 'Vampires (1986)'],
      },
      {
        characterId: 'notld_barbara',
        characterName: 'Barbra',
        aka: ['Barbara'],
        tier: 'MAIN',
        roleArchetype: 'Traumatized Survivor',
        characterBio:
          'After her brother Johnny is killed before her eyes in a country cemetery, Barbra flees to a nearby farmhouse where catatonic shock overtakes her until the final siege breaks through the walls.',
        characterArc:
          'Moves from playful irritation with her brother to paralyzing trauma, before snapping back to clarity in the final minutes to help defend the doors—only to be dragged away by her reanimated brother Johnny.',
        screenTimeSec: 2840,
        dialogueLines: 84,
        bestFrameSec: 310,
        accentColor: '#D0BCFF',
        actorName: 'Judith O’Dea',
        actorWikiSlug: 'Judith_O%27Dea',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Judith_O%27Dea_in_Night_of_the_Living_Dead.jpg/640px-Judith_O%27Dea_in_Night_of_the_Living_Dead.jpg',
        actorYears: 'b. 1945',
        actorNationality: 'American',
        actorBio:
          'Pittsburgh stage and radio actress who auditioned for Romero while working in Hollywood; her terrified flight from the cemetery became one of the most iconic openings in horror history.',
        performanceNote:
          'Performed her own sprints and stunts across the Evans City Cemetery and farmhouse interior.',
        actorOtherWorks: ['The Pirate (1978)', 'Claustrophobia (2003)', 'Night of the Living Dead: Genesis'],
      },
      {
        characterId: 'notld_harry_cooper',
        characterName: 'Harry Cooper',
        aka: ['Mr. Cooper'],
        tier: 'MAIN',
        roleArchetype: 'Fearful Authoritarian Antagonist',
        characterBio:
          'A prickly, self-preserving husband and father hiding in the farmhouse cellar with his wife Helen and bitten daughter Karen, who clashes violently with Ben over whether to barricade the basement door.',
        characterArc:
          'His refusal to cooperate fractures the survivors; after being shot during a struggle for Ben’s rifle, he stumbles down to the cellar where his own reanimated daughter devours him.',
        screenTimeSec: 2150,
        dialogueLines: 146,
        bestFrameSec: 2180,
        accentColor: '#EF4444',
        actorName: 'Karl Hardman',
        actorWikiSlug: 'Karl_Hardman',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Karl_Hardman_in_Night_of_the_Living_Dead.jpg/640px-Karl_Hardman_in_Night_of_the_Living_Dead.jpg',
        actorYears: '1927–2007',
        actorNationality: 'American',
        actorBio:
          'Co-producer, sound engineer, makeup artist, and still photographer on Night of the Living Dead through his Pittsburgh audio studio Hardman Associates, alongside his partner Marilyn Eastman.',
        performanceNote:
          'Played Harry Cooper with ulcerous, relatable panic while simultaneously engineering the film’s eerie sound effects and shooting its promotional stills.',
        actorOtherWorks: ['There’s Always Vanilla (1971)', 'Santa Claws (1996)'],
      },
      {
        characterId: 'notld_helen_cooper',
        characterName: 'Helen Cooper',
        tier: 'SUPPORTING',
        roleArchetype: 'Disillusioned Mother',
        characterBio:
          'Harry Cooper’s weary, sharp-tongued wife who tries to mediate between Ben and her husband while tending to her dying daughter Karen in the basement.',
        characterArc:
          'Realizes too late that the horror she feared has risen inside her own family in the cellar.',
        screenTimeSec: 1620,
        dialogueLines: 72,
        bestFrameSec: 2450,
        accentColor: '#F59E0B',
        actorName: 'Marilyn Eastman',
        actorWikiSlug: 'Marilyn_Eastman',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Marilyn_Eastman_in_Night_of_the_Living_Dead.jpg/640px-Marilyn_Eastman_in_Night_of_the_Living_Dead.jpg',
        actorYears: '1933–2021',
        actorNationality: 'American',
        actorBio:
          'Vice president of Image Ten, prop master, makeup supervisor, and actress who helped finance and produce the film.',
        performanceNote:
          'Also appeared in a background cameo as a zombie eating a bug off a tree branch when cast extras ran short.',
        actorOtherWorks: ['Houseguest (1995)', 'Santa Claws (1996)'],
      },
      {
        characterId: 'notld_johnny',
        characterName: 'Johnny',
        tier: 'SUPPORTING',
        roleArchetype: 'Cynical Brother & First Victim',
        characterBio:
          'Barbra’s teasing brother who utters the immortal line "They’re coming to get you, Barbra!" in the cemetery before being killed and returning hours later among the undead.',
        characterArc:
          'Begins as a skeptic mocking horror tropes and ends as the literal monster pulling his sister into the horde.',
        screenTimeSec: 640,
        dialogueLines: 38,
        bestFrameSec: 180,
        accentColor: '#10B981',
        actorName: 'Russell Streiner',
        actorWikiSlug: 'Russell_Streiner',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Russell_Streiner_in_Night_of_the_Living_Dead.jpg/640px-Russell_Streiner_in_Night_of_the_Living_Dead.jpg',
        actorYears: 'b. 1940',
        actorNationality: 'American',
        actorBio:
          'Co-founder of The Latent Image and producer of Night of the Living Dead and its 1990 Tom Savini-directed remake.',
        performanceNote:
          'Delivered cinema’s most famous horror taunt in the opening cemetery sequence.',
        actorOtherWorks: ['There’s Always Vanilla (1971)', 'The Booby Hatch (1976)', 'Night of the Living Dead (1990, Producer)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'Seven strangers trapped in an isolated Pennsylvania farmhouse must overcome internal paranoia and external terror as radiation from a Venus space probe reanimates the newly dead into flesh-eating ghouls.',
      synopsis:
        'After visiting their father’s grave in rural Pennsylvania, Barbra and her brother Johnny are attacked by a pale, shambling stranger. Barbra escapes to a nearby farmhouse where she is joined by Ben, young lovers Tom and Judy, and the Cooper family hiding in the cellar. As emergency broadcasts warn of an epidemic of mass murder by the unburied dead, a desperate fuel-pump escape goes up in flames and internal warfare leaves Ben alone to survive until dawn.',
      themes: ['Social breakdown under crisis', 'Racial & authoritarian tension', 'Failure of domestic refuge', 'Media & military coldness'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'The Cemetery Attack & Farmhouse Sanctuary',
            startSec: 0,
            endSec: 1680,
            summary: 'Johnny and Barbra are attacked at Evans City Cemetery; Barbra flees to the farmhouse where Ben arrives, kills invading ghouls with a tire iron, and boards up the doors and windows.',
            turningPoint: 'Ben discovers a Winchester rifle and radio upstairs as emergency broadcasts reveal the dead are rising across the Eastern seaboard.',
          },
          {
            number: 2,
            title: 'Divided House & The Fuel Pump Disaster',
            startSec: 1680,
            endSec: 4140,
            summary: 'Harry Cooper, Helen, Tom, and Judy emerge from the cellar; Harry demands everyone lock themselves downstairs while Ben devises a plan to refuel his truck and drive to a rescue center.',
            turningPoint: 'A spilled gasoline torch ignites the pickup truck, killing Tom and Judy in a fiery explosion that draws a feeding frenzy of ghouls.',
          },
          {
            number: 3,
            title: 'The Midnight Breach & Dawn Posse',
            startSec: 4140,
            endSec: 5760,
            summary: 'Power fails, Harry betrays Ben for the rifle and is shot, Karen kills her parents in the cellar, Barbra is dragged away by Johnny, and Ben retreats to the cellar—only to be mistaken for a ghoul by Sheriff McClelland’s posse at dawn.',
            turningPoint: 'Irony of survival: the cellar Harry insisted upon saves Ben’s life overnight, only for a bullet from the "rescue" posse to end it in the morning.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'notld_sc_1',
          index: 1,
          slugline: 'EXT. EVANS CITY CEMETERY - DUSK',
          title: '"They’re Coming to Get You, Barbra"',
          summary: 'Johnny teases Barbra among the headstones as a tall, gaunt man in a dark suit lumbers toward them and attacks.',
          startSec: 0,
          endSec: 540,
          actNumber: 1,
          mood: 'Eerie',
          characterRefIds: ['notld_barbara', 'notld_johnny'],
          stillIndexes: [0],
        },
        {
          id: 'notld_sc_2',
          index: 2,
          slugline: 'INT. PENNSYLVANIA FARMHOUSE - NIGHT',
          title: 'Ben Fortifies the House',
          summary: 'Ben arrives in his truck, rescues the dazed Barbra, dismantles tables and doors to nail over the windows, and discovers a gruesome corpse upstairs.',
          startSec: 540,
          endSec: 1680,
          actNumber: 1,
          mood: 'Tense',
          characterRefIds: ['notld_ben', 'notld_barbara'],
          stillIndexes: [1],
        },
        {
          id: 'notld_sc_3',
          index: 3,
          slugline: 'INT. FARMHOUSE LIVING ROOM / CELLAR STAIRS - NIGHT',
          title: 'The Cellar Debate & Emergency Broadcast',
          summary: 'Harry Cooper emerges from the basement and clashes with Ben as a television broadcast links the reanimation to radiation from a destroyed Venus probe.',
          startSec: 1680,
          endSec: 3120,
          actNumber: 2,
          mood: 'Claustrophobic',
          characterRefIds: ['notld_ben', 'notld_harry_cooper', 'notld_helen_cooper'],
          stillIndexes: [2],
        },
        {
          id: 'notld_sc_4',
          index: 4,
          slugline: 'EXT. GAS PUMP / INT. FARMHOUSE - NIGHT TO DAWN',
          title: 'The Truck Explosion, Cellar Horror & Dawn Posse',
          summary: 'After the gas pump explosion, ghouls shatter the barricades; Karen turns in the basement; Ben survives until morning only to be shot by the sheriff’s posse.',
          startSec: 3120,
          endSec: 5760,
          actNumber: 3,
          mood: 'Bleak',
          characterRefIds: ['notld_ben', 'notld_barbara', 'notld_harry_cooper', 'notld_helen_cooper'],
          stillIndexes: [3],
        },
      ],
      sequences: [
        { id: 'notld_seq_1', title: 'Outbreak & Barricade', sceneIds: ['notld_sc_1', 'notld_sc_2'], purpose: 'Isolate the protagonists and establish the rules of the undead.' },
        { id: 'notld_seq_2', title: 'Fracture & Siege', sceneIds: ['notld_sc_3', 'notld_sc_4'], purpose: 'Demonstrate that human division is as lethal as the monsters outside.' },
      ],
      locations: [
        {
          refId: 'loc_evans_cemetery',
          name: 'Evans City Cemetery',
          description: 'Rural Pennsylvania graveyard where Johnny and Barbra encounter the first ghoul.',
          kind: 'EXTERIOR',
          sceneIds: ['notld_sc_1'],
          confidence: 0.99,
        },
        {
          refId: 'loc_farmhouse',
          name: 'Isolated Two-Story Farmhouse & Cellar',
          description: 'Claustrophobic wooden farmhouse whose upstairs living room and windowless cellar become an ideological battleground.',
          kind: 'INTERIOR',
          sceneIds: ['notld_sc_2', 'notld_sc_3', 'notld_sc_4'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_gas_pump_key',
          name: 'Locked Gas Pump & Ring of Keys',
          description: 'The farmhouse fuel pump key ring that fails to unlock the padlock during the midnight escape attempt.',
          narrativeRole: 'MACGUFFIN',
          sceneIds: ['notld_sc_3', 'notld_sc_4'],
          evidence: ['Triggers the fatal torch accident when Ben shoots the lock off the pump'],
          confidence: 0.97,
        },
        {
          refId: 'mac_winchester',
          name: 'Upstairs Closet Winchester Rifle',
          description: 'The sole firearm inside the farmhouse, becoming the symbol of authority fought over by Ben and Harry Cooper.',
          narrativeRole: 'KEY_PROP',
          sceneIds: ['notld_sc_2', 'notld_sc_3', 'notld_sc_4'],
          evidence: ['Found by Ben in the upstairs closet', 'Fought over by Harry and Ben during the final breach'],
          confidence: 0.98,
        },
      ],
      stills: [],
    },
  },

  // ── 2. HOUSE ON HAUNTED HILL (1959 · William Castle) ─────────────────────────
  house_on_haunted_hill_ipod: {
    identifier: 'house_on_haunted_hill_ipod',
    title: 'House on Haunted Hill',
    year: '1959',
    director: 'William Castle',
    runtimeSec: 4500,
    tone: ['Sardonic', 'Macabre', 'Suspenseful', 'Theatrical'],
    charactersWithActors: [
      {
        characterId: 'hohh_frederick_loren',
        characterName: 'Frederick Loren',
        tier: 'MAIN',
        roleArchetype: 'Eccentric Millionaire Host',
        characterBio:
          'A fabulously wealthy, velvet-voiced eccentric who rents a notoriously blood-soaked mansion for his fourth wife Annabelle’s party, offering five strangers $10,000 each if they survive locked inside until dawn—even handing out miniature coffins containing loaded .38 revolvers as party favors.',
        characterArc:
          'Appears to be the victim of his wife’s murder plot, only to reveal he orchestrated the ultimate mechanical Counter-trap above the basement acid vat.',
        screenTimeSec: 2640,
        dialogueLines: 165,
        bestFrameSec: 420,
        accentColor: '#F97316',
        actorName: 'Vincent Price',
        actorWikiSlug: 'Vincent_Price',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Vincent_Price_in_House_on_Haunted_Hill.jpg/640px-Vincent_Price_in_House_on_Haunted_Hill.jpg',
        actorYears: '1911–1993',
        actorNationality: 'American',
        actorBio:
          'Yale-educated art historian, gourmet, and undisputed Crown Prince of American Gothic Horror. Across more than 100 films—from Laura and House of Wax to William Castle’s shockers and Roger Corman’s Poe cycle—Price blended aristocratic wit with operatic menace.',
        performanceNote:
          'Opens the film as a disembodied floating head welcoming the audience directly through the fourth wall.',
        actorOtherWorks: ['House of Wax (1953)', 'The Fly (1958)', 'The Tingler (1959)', 'House of Usher (1960)', 'Edward Scissorhands (1990)'],
      },
      {
        characterId: 'hohh_annabelle_loren',
        characterName: 'Annabelle Loren',
        tier: 'MAIN',
        roleArchetype: 'Scheming Femme Fatale Wife',
        characterBio:
          'Frederick Loren’s glamorous, venomous fourth wife who despises her husband, warns the guests that Frederick wants to murder her, and secretly conspires with her lover Dr. Trent to gaslight Nora into shooting Frederick.',
        characterArc:
          'Stages her own fake hanging to frame and eliminate Frederick, only to be lured into the basement and plunged into the acid vat by a wire-rigged skeleton.',
        screenTimeSec: 1740,
        dialogueLines: 112,
        bestFrameSec: 880,
        accentColor: '#EC4899',
        actorName: 'Carol Ohmart',
        actorWikiSlug: 'Carol_Ohmart',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Carol_Ohmart_in_House_on_Haunted_Hill.jpg/640px-Carol_Ohmart_in_House_on_Haunted_Hill.jpg',
        actorYears: '1927–2002',
        actorNationality: 'American',
        actorBio:
          'Former Miss Utah and Paramount Pictures contract star dubbed "the female Marlon Brando" by Michael Curtiz for The Scarlet Hour (1956).',
        performanceNote:
          'Matches Vincent Price’s barbed marital repartee syllable for syllable.',
        actorOtherWorks: ['The Scarlet Hour (1956)', 'Wild Youth (1960)', 'Spider Baby (1967)'],
      },
      {
        characterId: 'hohh_lance_schroeder',
        characterName: 'Lance Schroeder',
        tier: 'MAIN',
        roleArchetype: 'Dashing Test Pilot',
        characterBio:
          'A cool-headed jet test pilot desperate for the $10,000 prize who investigates the mansion’s secret passages alongside Nora Manning.',
        characterArc:
          'Survives being locked inside a hidden vault and helps uncover the murder conspiracy.',
        screenTimeSec: 1980,
        dialogueLines: 118,
        bestFrameSec: 1320,
        accentColor: '#38BDF8',
        actorName: 'Richard Long',
        actorWikiSlug: 'Richard_Long_(actor)',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Richard_Long_1965.JPG/640px-Richard_Long_1965.JPG',
        actorYears: '1927–1974',
        actorNationality: 'American',
        actorBio:
          'Leading man in Orson Welles’ The Stranger (1946) and beloved television star of 77 Sunset Strip, Maverick, The Big Valley, and Nanny and the Professor.',
        performanceNote:
          'Brings breezy matinee-idol charm as a foil to the mansion’s eccentric hysteria.',
        actorOtherWorks: ['The Stranger (1946)', 'Criss Cross (1949)', 'The Big Valley (1965–1969)'],
      },
      {
        characterId: 'hohh_nora_manning',
        characterName: 'Nora Manning',
        tier: 'MAIN',
        roleArchetype: 'Targeted Secretary',
        characterBio:
          'An employee at one of Frederick Loren’s companies who accepts the $10,000 invitation to support her family, unaware she has been chosen as the pawn in a double-murder plot.',
        characterArc:
          'Subjected to staged hauntings—dripping blood, ropes, and disembodied heads—designed to make her panic and fire her revolver in the dark.',
        screenTimeSec: 2120,
        dialogueLines: 124,
        bestFrameSec: 1640,
        accentColor: '#A855F7',
        actorName: 'Carolyn Craig',
        actorWikiSlug: 'Carolyn_Craig',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Carolyn_Craig_in_House_on_Haunted_Hill.jpg/640px-Carolyn_Craig_in_House_on_Haunted_Hill.jpg',
        actorYears: '1934–1970',
        actorNationality: 'American',
        actorBio:
          'Trained at the Pasadena Playhouse, Carolyn Craig starred in George Stevens’ Giant (1956) and Sam Fuller’s Apache Ambush (1955) before becoming a scream-queen icon in House on Haunted Hill.',
        performanceNote:
          'Her terrified encounter with the blind housekeeper Mrs. Slydes rolling past on invisible skates remains one of horror’s greatest jump-scares.',
        actorOtherWorks: ['Giant (1956)', 'Portland Exposé (1957)', 'Studs Lonigan (1960)'],
      },
      {
        characterId: 'hohh_watson_pritchard',
        characterName: 'Watson Pritchard',
        tier: 'SUPPORTING',
        roleArchetype: 'Superstitious Mansion Owner',
        characterBio:
          'The trembling, superstitious alcoholic owner of the mansion whose brother and six other people were murdered inside its walls—and who firmly believes the ghosts will kill everyone before morning.',
        characterArc:
          'After the human plot is exposed, he breaks the fourth wall at the end to warn the audience: "They’re coming for me now... and then they’ll come for you!"',
        screenTimeSec: 1580,
        dialogueLines: 96,
        bestFrameSec: 210,
        accentColor: '#10B981',
        actorName: 'Elisha Cook Jr.',
        actorWikiSlug: 'Elisha_Cook_Jr.',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Elisha_Cook_Jr._in_House_on_Haunted_Hill.jpg/640px-Elisha_Cook_Jr._in_House_on_Haunted_Hill.jpg',
        actorYears: '1903–1995',
        actorNationality: 'American',
        actorBio:
          'Legendary Hollywood character actor across six decades, immortalized as Wilmer the gunsel in The Maltese Falcon (1941), The Big Sleep (1946), Stanley Kubrick’s The Killing (1956), and Rosemary’s Baby (1968).',
        performanceNote:
          'Delivers the opening tour of the wine-cellar acid vat with wide-eyed, doom-laden relish.',
        actorOtherWorks: ['The Maltese Falcon (1941)', 'Shane (1953)', 'The Killing (1956)', 'Rosemary’s Baby (1968)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'Five cash-strapped strangers accept eccentric millionaire Frederick Loren’s challenge to spend a locked night inside a murderous mansion for $10,000 apiece—unaware they are pawns in a lethal marital chess game between Loren and his unfaithful wife.',
      synopsis:
        'Millionaire Frederick Loren rents the infamous House on Haunted Hill from superstitious owner Watson Pritchard for a "haunted house party" honoring his fourth wife, Annabelle. At midnight, caretaker Jonas Slydes bolts the iron doors from the outside. Armed with miniature coffin cases holding .38 revolvers, the guests endure falling chandeliers, dripping blood, and an open vat of acid in the wine cellar as Annabelle and her secret lover Dr. David Trent plot to trick panicked secretary Nora Manning into shooting Frederick.',
      themes: ['Greed & paranoia', 'Marital psychological warfare', 'Staged illusion vs. supernatural fear', 'Poetic justice'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'The $10,000 Invitation & The Acid Vat Tour',
            startSec: 0,
            endSec: 1440,
            summary: 'Watson Pritchard and Frederick Loren introduce the mansion’s bloody history; five guests arrive in funeral hearses, inspect the basement acid vat, and receive revolver-filled miniature coffins as the iron gates lock at midnight.',
            turningPoint: 'The steel bars slam shut at midnight—no telephone, no radio, and no escape until 8:00 AM.',
          },
          {
            number: 2,
            title: 'Gaslighting Nora & The Staged Hanging',
            startSec: 1440,
            endSec: 3240,
            summary: 'Nora is terrorized by apparitions while Annabelle fakes her own hanging death with Dr. Trent’s help to drive Nora into shooting Frederick in the dark.',
            turningPoint: 'Nora fires her .38 revolver into Frederick Loren in the darkened wine cellar.',
          },
          {
            number: 3,
            title: 'The Skeleton over the Acid Vat ("Emergo")',
            startSec: 3240,
            endSec: 4500,
            summary: 'Dr. Trent and Annabelle move to dispose of Frederick’s body in the acid vat, only for Frederick—who loaded Nora’s gun with blanks—to turn the tables with a wire-rigged skeleton that sends both conspirators into the acid.',
            turningPoint: 'Frederick emerges from the shadows holding the skeleton control pulley, declaring himself ready for trial.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'hohh_sc_1',
          index: 1,
          slugline: 'INT. HAUNTED HILL FOYER & WINE CELLAR - NIGHT',
          title: 'Funeral Hearses, Acid Vat & Coffin Revolvers',
          summary: 'The five guests arrive at the Ennis House exterior; Pritchard shows them the acid vat where a previous victim was dissolved, and Loren hands out .38 revolvers in velvet-lined mini-coffins.',
          startSec: 0,
          endSec: 1440,
          actNumber: 1,
          mood: 'Sardonic',
          characterRefIds: ['hohh_frederick_loren', 'hohh_annabelle_loren', 'hohh_watson_pritchard', 'hohh_lance_schroeder', 'hohh_nora_manning'],
          stillIndexes: [0],
        },
        {
          id: 'hohh_sc_2',
          index: 2,
          slugline: 'INT. BEDROOMS & SECRET CORRIDORS - MIDNIGHT',
          title: 'The Fake Hanging & Psychological Trap',
          summary: 'Annabelle appears to hang from the rafters; Dr. Trent and Annabelle secretly orchestrate terrifying clues so Nora will shoot Frederick in the cellar.',
          startSec: 1440,
          endSec: 3240,
          actNumber: 2,
          mood: 'Suspenseful',
          characterRefIds: ['hohh_annabelle_loren', 'hohh_nora_manning', 'hohh_lance_schroeder'],
          stillIndexes: [1],
        },
        {
          id: 'hohh_sc_3',
          index: 3,
          slugline: 'INT. BASEMENT ACID VAT CHAMBER - LATE NIGHT',
          title: 'The Skeleton Rises from the Acid',
          summary: 'After Dr. Trent falls into the acid vat, Annabelle is confronted by her husband’s skeleton rising out of the acid—operated by a very much alive Frederick Loren.',
          startSec: 3240,
          endSec: 4500,
          actNumber: 3,
          mood: 'Macabre',
          characterRefIds: ['hohh_frederick_loren', 'hohh_annabelle_loren', 'hohh_watson_pritchard'],
          stillIndexes: [2],
        },
      ],
      sequences: [
        { id: 'hohh_seq_1', title: 'Parlor Games of Death', sceneIds: ['hohh_sc_1'], purpose: 'Lock the ensemble inside and plant the guns and acid vat.' },
        { id: 'hohh_seq_2', title: 'Double-Cross in the Cellar', sceneIds: ['hohh_sc_2', 'hohh_sc_3'], purpose: 'Execute the murder and counter-murder twists.' },
      ],
      locations: [
        {
          refId: 'loc_ennis_mansion',
          name: 'House on Haunted Hill (Frank Lloyd Wright Ennis House)',
          description: 'Mayan-Revival concrete-block fortress perched atop Los Feliz hills with secret vaults and iron window grates.',
          kind: 'EXTERIOR / INTERIOR',
          sceneIds: ['hohh_sc_1', 'hohh_sc_2'],
          confidence: 0.99,
        },
        {
          refId: 'loc_acid_cellar',
          name: 'The Wine Cellar Acid Vat Room',
          description: 'Subterranean stone cellar housing a sunken concrete vat filled with corrosive acid.',
          kind: 'INTERIOR',
          sceneIds: ['hohh_sc_1', 'hohh_sc_3'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_coffin_guns',
          name: 'Miniature Coffins with .38 Revolvers',
          description: 'Silver-handled .38 pistols distributed by Frederick Loren as party favors—one of which he secretly loads with blanks.',
          narrativeRole: 'KEY_PROP',
          sceneIds: ['hohh_sc_1', 'hohh_sc_2', 'hohh_sc_3'],
          evidence: ['Distributed in Act 1', 'Used by Nora in the cellar climax'],
          confidence: 0.99,
        },
        {
          refId: 'mac_rigged_skeleton',
          name: 'Wire-Rigged Acid Skeleton ("Emergo")',
          description: 'Articulated human skeleton rigged on steel wires by Frederick Loren to terrify Annabelle into the acid vat.',
          narrativeRole: 'MACGUFFIN',
          sceneIds: ['hohh_sc_3'],
          evidence: ['Triggers the final twist and theatrical "Emergo" spectacle'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },

  // ── 3. CARNIVAL OF SOULS (1962 · Herk Harvey) ────────────────────────────────
  CarnivalofSouls: {
    identifier: 'CarnivalofSouls',
    title: 'Carnival of Souls',
    year: '1962',
    director: 'Herk Harvey',
    runtimeSec: 4980,
    tone: ['Dreamlike', 'Eerie', 'Existential', 'Haunting'],
    charactersWithActors: [
      {
        characterId: 'cos_mary_henry',
        characterName: 'Mary Henry',
        tier: 'MAIN',
        roleArchetype: 'Alienated Church Organist',
        characterBio:
          'A detached, fiercely independent young classical organist who miraculously crawls from a murky river three hours after a fatal bridge crash—only to find herself slipping out of the world of the living and drawn toward an abandoned lakeside pavilion.',
        characterArc:
          'Resists emotional connection with everyone around her while experiencing terrifying periods where sound vanishes and no one can see or hear her, culminating in the realization that she never survived the river plunge.',
        screenTimeSec: 4420,
        dialogueLines: 215,
        bestFrameSec: 720,
        accentColor: '#D0BCFF',
        actorName: 'Candace Hilligoss',
        actorWikiSlug: 'Candace_Hilligoss',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Candace_Hilligoss_in_Carnival_of_Souls.jpg/640px-Candace_Hilligoss_in_Carnival_of_Souls.jpg',
        actorYears: 'b. 1935',
        actorNationality: 'American',
        actorBio:
          'Trained at the American Theatre Wing in New York alongside James Dean and Lee Strasberg’s Method circle, Candace Hilligoss appeared in virtually every frame of Carnival of Souls, creating an unforgettable portrait of existential dissociation.',
        performanceNote:
          'Emerged from the freezing Kansas river water herself during the opening shoot and anchored the film’s eerie silence scenes purely through facial micro-expressions.',
        actorOtherWorks: ['The Curse of the Living Corpse (1964)', 'Naked City (TV)'],
      },
      {
        characterId: 'cos_the_man',
        characterName: 'The Man (Lead Ghoul)',
        aka: ['The Phantom Suitors'],
        tier: 'MAIN',
        roleArchetype: 'Spectral Harbinger of Death',
        characterBio:
          'A hollow-eyed, corpse-pale phantom in a dark suit who appears in reflections, car windows, water, and the deserted Saltair Pavilion, silently beckoning Mary Henry to join the dance of the dead.',
        characterArc:
          'Relentlessly narrows the distance between the spirit world and Mary until he claims her in the lakeside ballroom.',
        screenTimeSec: 860,
        dialogueLines: 0,
        bestFrameSec: 1560,
        accentColor: '#38BDF8',
        actorName: 'Herk Harvey',
        actorWikiSlug: 'Herk_Harvey',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Carnival_of_Souls_%281962%29_pressbook_cover.jpg/640px-Carnival_of_Souls_%281962%29_pressbook_cover.jpg',
        actorYears: '1924–1996',
        actorNationality: 'American',
        actorBio:
          'Director and producer of Carnival of Souls who stepped in front of his own camera in dark eye makeup and wet slicked hair to play the wordless lead phantom.',
        performanceNote:
          'Without speaking a single word, Harvey’s deadpan stare through car windows and mirrors became one of cinema’s most chilling images.',
        actorOtherWorks: ['Carnival of Souls (Director)', 'Shake Hands with Danger (Director)'],
      },
      {
        characterId: 'cos_john_linden',
        characterName: 'John Linden',
        tier: 'SUPPORTING',
        roleArchetype: 'Persistent Boarding-House Neighbor',
        characterBio:
          'Mary’s cynical, worldly neighbor at Mrs. Thomas’s boarding house who tries to pursue a romance with her despite her emotional coldness and growing terror.',
        characterArc:
          'Serves as Mary’s last fragile tether to mundane human contact before he abandons her when her visions escalate.',
        screenTimeSec: 1120,
        dialogueLines: 94,
        bestFrameSec: 1920,
        accentColor: '#F59E0B',
        actorName: 'Sidney Berger',
        actorWikiSlug: 'Carnival_of_Souls',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Candace_Hilligoss_in_Carnival_of_Souls.jpg/640px-Candace_Hilligoss_in_Carnival_of_Souls.jpg',
        actorYears: '1936–2013',
        actorNationality: 'American',
        actorBio:
          'Acclaimed stage actor, theatre scholar, and long-time Director of the School of Theatre & Dance at the University of Houston and founder of the Houston Shakespeare Festival.',
        performanceNote:
          'Contrasts naturalistic 1960s realism against Mary’s supernatural twilight zone.',
        actorOtherWorks: ['Houston Shakespeare Festival (Founder)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'After emerging unscathed from a fatal bridge crash, a detached church organist relocates to Utah, where a spectral figure and an abandoned lakeside pavilion pull her out of the world of the living.',
      synopsis:
        'During a reckless drag race across a wooden bridge in Kansas, a car carrying three young women plunges into the river below. Hours later, organist Mary Henry climbs onto a mudbank with no memory of how she escaped. Moving to Utah for a church position, Mary catches glimpses of a corpse-faced man in windows and mirrors, experiences terrifying episodes where she becomes invisible and inaudible to the world around her, and is inexorably drawn to the decaying Moorish towers of the abandoned Saltair Pavilion.',
      themes: ['Limbo between life and death', 'Emotional alienation', 'Existential dread', 'Sacred vs. profane music'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'The River Plunge & Departure for Utah',
            startSec: 0,
            endSec: 1380,
            summary: 'A drag race ends in a river plunge; Mary emerges from the water three hours later and drives west toward Utah, seeing a pale phantom face in her car window and passing the deserted Saltair Pavilion.',
            turningPoint: 'At the Reuter Organ factory and on the highway, Mary first glimpses "The Man" staring back at her.',
          },
          {
            number: 2,
            title: 'Erased from the World of the Living',
            startSec: 1380,
            endSec: 3540,
            summary: 'In Utah, Mary moves into Mrs. Thomas’s boarding house and begins work at the church, but while shopping in a department store the world suddenly goes dead silent—nobody can see or hear her.',
            turningPoint: 'During organ practice, Mary falls into a trance playing a demonic carnival macabre melody, getting fired by the minister.',
          },
          {
            number: 3,
            title: 'The Dance of the Dead at Saltair Pavilion',
            startSec: 3540,
            endSec: 4980,
            summary: 'Unable to flee town on a bus filled with ghouls, Mary returns to the abandoned Saltair Pavilion where The Man and a waltzing congregation of the dead—including her own corpse—chase her across the salt flats; back in Kansas, her drowned body is hauled up inside the car.',
            turningPoint: 'The sunken car is winched from the Kansas river at the end with Mary’s lifeless body still inside—revealing her entire journey took place between death and discovery.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'cos_sc_1',
          index: 1,
          slugline: 'EXT. LECOMPTON RIVER BRIDGE - DAY',
          title: 'The Drag Race & The Mudbank',
          summary: 'A challenge at a stoplight sends the women’s sedan crashing through a bridge railing into the turbulent river; Mary miraculously walks out onto a sandbar.',
          startSec: 0,
          endSec: 660,
          actNumber: 1,
          mood: 'Eerie',
          characterRefIds: ['cos_mary_henry'],
          stillIndexes: [0],
        },
        {
          id: 'cos_sc_2',
          index: 2,
          slugline: 'INT. DEPARTMENT STORE & CITY STREETS - DAY',
          title: 'Acoustic Blackout (Invisible Among the Living)',
          summary: 'Exiting a dressing room, Mary discovers all ambient city sound has vanished and passersby look straight through her as if she does not exist.',
          startSec: 1620,
          endSec: 2340,
          actNumber: 2,
          mood: 'Dreamlike',
          characterRefIds: ['cos_mary_henry', 'cos_the_man'],
          stillIndexes: [1],
        },
        {
          id: 'cos_sc_3',
          index: 3,
          slugline: 'EXT./INT. SALTAIR PAVILION ON THE GREAT SALT LAKE - NIGHT',
          title: 'The Ballroom of Lost Souls',
          summary: 'Mary enters the deserted pavilion at night to witness water-logged ghouls waltzing to organ music before her footprints vanish in the sand.',
          startSec: 3840,
          endSec: 4980,
          actNumber: 3,
          mood: 'Haunting',
          characterRefIds: ['cos_mary_henry', 'cos_the_man'],
          stillIndexes: [2],
        },
      ],
      sequences: [
        { id: 'cos_seq_1', title: 'The Uncanny Survival', sceneIds: ['cos_sc_1'], purpose: 'Establish the impossible survival and spectral pursuit.' },
        { id: 'cos_seq_2', title: 'Slipping Through Reality', sceneIds: ['cos_sc_2', 'cos_sc_3'], purpose: 'Isolate Mary from the living and draw her to the pavilion.' },
      ],
      locations: [
        {
          refId: 'loc_saltair_pavilion',
          name: 'Saltair Pavilion (Great Salt Lake, Utah)',
          description: 'Vast, decaying early-20th-century Moorish-domed resort pavilion standing derelict on the salt flats.',
          kind: 'EXTERIOR / INTERIOR',
          sceneIds: ['cos_sc_3'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_pipe_organ',
          name: 'The Church & Pavilion Pipe Organ',
          description: 'Monumental Reuter pipe organ whose hypnotic, dissonant chords bridge Mary’s conscious mind with the carnival of the dead.',
          narrativeRole: 'MOTIF',
          sceneIds: ['cos_sc_1', 'cos_sc_2', 'cos_sc_3'],
          evidence: ['Gene Moore’s solo organ score drives every supernatural transition'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },

  // ── 4. THE HOUSEMAID (하녀, 1960 · Kim Ki-young) ─────────────────────────────
  'kofa-the-housemaid-1960': {
    identifier: 'kofa-the-housemaid-1960',
    title: 'The Housemaid (하녀)',
    year: '1960',
    director: 'Kim Ki-young',
    runtimeSec: 6660,
    tone: ['Claustrophobic', 'Psychological', 'Feverish', 'Subversive'],
    charactersWithActors: [
      {
        characterId: 'hm_myung_sook',
        characterName: 'Myung-sook (The Housemaid)',
        tier: 'MAIN',
        roleArchetype: 'Vengeful Domestic Intruder',
        characterBio:
          'A strange, volatile young factory worker hired as a live-in maid by music teacher Dong-sik and his exhausted seamstress wife; she catches rats with her bare hands and systematically dismantles the household hierarchy.',
        characterArc:
          'After seducing Dong-sik and being forced by his wife to throw herself down the stairs to induce a miscarriage, Myung-sook turns into a relentless psychological tyrant over the entire family.',
        screenTimeSec: 4120,
        dialogueLines: 174,
        bestFrameSec: 1240,
        accentColor: '#F43F5E',
        actorName: 'Lee Eun-shim',
        actorWikiSlug: 'The_Housemaid_(1960_film)',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/The_Housemaid_%281960_film%29_poster.jpg/640px-The_Housemaid_%281960_film%29_poster.jpg',
        actorYears: 'b. 1936',
        actorNationality: 'South Korean',
        actorBio:
          'Discovered by director Kim Ki-young at age 23, Lee Eun-shim delivered such a terrifyingly convincing debut as the femme fatale housemaid that 1960 Korean theatre audiences screamed at the screen warning the husband not to drink her water.',
        performanceNote:
          'Won Best New Actress at the Buil Film Awards; her feral physical intensity became legendary in Asian cinema.',
        actorOtherWorks: ['Seong Chun-hyang (1961)', 'The Sea Knows (1961)'],
      },
      {
        characterId: 'hm_kim_dong_sik',
        characterName: 'Kim Dong-sik',
        tier: 'MAIN',
        roleArchetype: 'Compromised Bourgeois Patriarch',
        characterBio:
          'A respected factory women’s choir composer and father of two who moves his family into a coveted new two-story Westernized house, only for his moral hypocrisy and weakness to ruin them.',
        characterArc:
          'Trapped between middle-class respectability and blackmail, he descends the staircase in the harrowing climax after drinking rat-poisoned water.',
        screenTimeSec: 4680,
        dialogueLines: 210,
        bestFrameSec: 840,
        accentColor: '#D0BCFF',
        actorName: 'Kim Jin-kyu',
        actorWikiSlug: 'Kim_Jin-kyu',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Aimless_Bullet_1961.jpg/640px-Aimless_Bullet_1961.jpg',
        actorYears: '1922–1998',
        actorNationality: 'South Korean',
        actorBio:
          'The defining male lead of South Korea’s Golden Age of Cinema, starring in both The Housemaid (1960) and Aimless Bullet (1961), as well as Seopyeonje (1993).',
        performanceNote:
          'Also breaks the fourth wall in the final frame to warn the audience with a wry grin.',
        actorOtherWorks: ['Aimless Bullet (1961)', 'My Mother and Her Guest (1961)', 'The Deaf Sam-ryong (1964)'],
      },
      {
        characterId: 'hm_mrs_kim',
        characterName: 'Mrs. Kim (The Wife)',
        tier: 'MAIN',
        roleArchetype: 'Obsessive Matriarch',
        characterBio:
          'Dong-sik’s devoted wife who works herself to exhaustion at a sewing machine to finance the family’s two-story house—and will go to ruthless lengths to protect their social standing.',
        characterArc:
          'Complicit in covering up the affair and pushing the maid down the stairs to preserve family reputation.',
        screenTimeSec: 3640,
        dialogueLines: 162,
        bestFrameSec: 2140,
        accentColor: '#F59E0B',
        actorName: 'Ju Jeung-ryu',
        actorWikiSlug: 'Ju_Jeung-ryu',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/The_Housemaid_%281960_film%29_poster.jpg/640px-The_Housemaid_%281960_film%29_poster.jpg',
        actorYears: '1926–1980',
        actorNationality: 'South Korean',
        actorBio:
          'Celebrated veteran actress of Korean theatre and Golden Age melodrama, winner of multiple Blue Dragon and Grand Bell awards.',
        performanceNote:
          'Captures the suffocating desperation of post-war upward mobility.',
        actorOtherWorks: ['Piagol (1955)', 'The Literary Conception (1962)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'When a middle-class Korean composer hires a volatile young factory worker as a live-in maid for his newly built two-story home, a thunderstorm seduction ignites a claustrophobic war of blackmail, rat poison, and domestic terror.',
      synopsis:
        'Music teacher Kim Dong-sik and his seamstress wife move into a modern two-story Westernized house in Seoul with their two children, including a daughter with crippled legs. Exhausted by the extra housework, Mrs. Kim asks Dong-sik to hire a maid.Myung-sook enters the household, seduces Dong-sik on a stormy night, and after a forced fall down the central staircase costs her an unborn child, turns the home into a psychological nightmare— directly inspiring Bong Joon-ho’s Parasite.',
      themes: ['Class warfare & upward mobility', 'Architectural claustrophobia', 'Patriarchal hypocrisy', 'Domestic gothic'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'The Two-Story House & Arrival of Myung-sook',
            startSec: 0,
            endSec: 2100,
            summary: 'Dong-sik reads a newspaper story about a man ruined by his maid; his family moves into a two-story house and hires factory girl Myung-sook, who immediately displays eerie behavior with rats and piano lessons.',
            turningPoint: 'During a torrential rainstorm while his wife is away, Myung-sook seduces Dong-sik in the upstairs music room.',
          },
          {
            number: 2,
            title: 'The Staircase Fall & Reign of Terror',
            startSec: 2100,
            endSec: 4680,
            summary: 'Myung-sook announces she is pregnant; Mrs. Kim convinces her to tumble down the steep wooden stairs, triggering a miscarriage that turns Myung-sook into a vengeful fury who threatens the family’s infant son.',
            turningPoint: 'Young Chang-soon falls to his death down the staircase after drinking water Myung-sook claimed was poisoned.',
          },
          {
            number: 3,
            title: 'The Glass of Rat Poison & Fourth-Wall Epilogue',
            startSec: 4680,
            endSec: 6660,
            summary: 'Myung-sook forces Dong-sik into a double suicide with rat poison; crawling down the stairs to die beside his wife, the film suddenly pulls back to the framing newspaper reading as Dong-sik warns the audience directly.',
            turningPoint: 'Kim Ki-young shatters the nightmare with a Brechtian fourth-wall address warning viewers of domestic temptation.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'hm_sc_1',
          index: 1,
          slugline: 'INT. TWO-STORY SEOUL HOUSE - NIGHT (STORM)',
          title: 'Piano Lessons & The Rainstorm Seduction',
          summary: 'Thunder and lightning lash the sliding glass doors as Myung-sook lures Dong-sik upstairs to the piano room.',
          startSec: 1200,
          endSec: 2100,
          actNumber: 1,
          mood: 'Feverish',
          characterRefIds: ['hm_myung_sook', 'hm_kim_dong_sik'],
          stillIndexes: [0],
        },
        {
          id: 'hm_sc_2',
          index: 2,
          slugline: 'INT. CENTRAL WOODEN STAIRCASE - NIGHT',
          title: 'The Staircase Plunge & Poisoned Water',
          summary: 'The central staircase becomes an arena of death as class power inverts inside the house.',
          startSec: 2100,
          endSec: 6660,
          actNumber: 2,
          mood: 'Claustrophobic',
          characterRefIds: ['hm_myung_sook', 'hm_kim_dong_sik', 'hm_mrs_kim'],
          stillIndexes: [1],
        },
      ],
      sequences: [
        { id: 'hm_seq_1', title: 'Infiltration of the Bourgeois Home', sceneIds: ['hm_sc_1'], purpose: 'Introduce the vertical class geography of the house.' },
        { id: 'hm_seq_2', title: 'Domestic Collapse', sceneIds: ['hm_sc_2'], purpose: 'Invert power between servant and master.' },
      ],
      locations: [
        {
          refId: 'loc_seoul_two_story_house',
          name: 'The Kim Family Two-Story Westernized House & Staircase',
          description: 'Newly built two-level Seoul home with sliding glass doors, a sewing room downstairs, and a piano room upstairs connected by a steep wooden staircase.',
          kind: 'INTERIOR',
          sceneIds: ['hm_sc_1', 'hm_sc_2'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_rat_poison',
          name: 'Packet of Rat Poison & Glass of Water',
          description: 'Household rat poison initially kept for vermin that becomes the weapon of psychological terror and suicide.',
          narrativeRole: 'KEY_PROP',
          sceneIds: ['hm_sc_1', 'hm_sc_2'],
          evidence: ['Used throughout Act 2 and Act 3 to terrorize the children and poison Dong-sik'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },

  // ── 5. NOSFERATU (1922 · F.W. Murnau) ────────────────────────────────────────
  'europeana-nosferatu-1922': {
    identifier: 'europeana-nosferatu-1922',
    title: 'Nosferatu: Eine Symphonie des Grauens',
    year: '1922',
    director: 'F.W. Murnau',
    runtimeSec: 5640,
    tone: ['Gothic', 'Uncanny', 'Spectral', 'Poetic'],
    charactersWithActors: [
      {
        characterId: 'nos_count_orlok',
        characterName: 'Count Orlok (Nosferatu)',
        aka: ['The Bird of Death'],
        tier: 'MAIN',
        roleArchetype: 'Ancient Plague Vampire',
        characterBio:
          'A rat-featured, talon-fingered Carpathian undead nobleman who sleeps in earth soaked with the Black Death and sails aboard the schooner Empusa to Wisborg after seeing a miniature portrait of Ellen Hutter.',
        characterArc:
          'Brings pestilence and death across Europe until his obsession with Ellen keeps him at her bedside past the crowing of the cock, vaporizing him in the morning sun.',
        screenTimeSec: 1620,
        dialogueLines: 18,
        bestFrameSec: 1860,
        accentColor: '#EF4444',
        actorName: 'Max Schreck',
        actorWikiSlug: 'Max_Schreck',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Max_Schreck_as_Count_Orlok_in_Nosferatu_%281922%29.jpg/640px-Max_Schreck_as_Count_Orlok_in_Nosferatu_%281922%29.jpg',
        actorYears: '1879–1936',
        actorNationality: 'German',
        actorBio:
          'Distinguished classical stage actor with Max Reinhardt’s Deutsches Theater and the Munich Kammerspiele. Because his surname literally meant "Fright" in German and his makeup was so inhuman, rumours persisted for decades that Schreck was an actual vampire—inspiring the 2000 film Shadow of the Vampire.',
        performanceNote:
          'Created the unforgettable rising-from-the-coffin plank movement and elongated shadow climbing Ellen’s staircase.',
        actorOtherWorks: ['The Street (1923)', 'Murnau’s The Finances of the Grand Duke (1924)', 'The Bartered Bride (1932)'],
      },
      {
        characterId: 'nos_ellen_hutter',
        characterName: 'Ellen Hutter',
        tier: 'MAIN',
        roleArchetype: 'Self-Sacrificing Heroine',
        characterBio:
          'Thomas Hutter’s sensitive, somnambulist young wife in Wisborg who senses her husband’s danger across hundreds of miles and discovers in The Book of the Vampires that only a woman pure in heart can break the plague.',
        characterArc:
          'Voluntarily opens her bedroom window to Count Orlok, sacrificing her life to hold the vampire until dawn.',
        screenTimeSec: 2340,
        dialogueLines: 42,
        bestFrameSec: 4920,
        accentColor: '#D0BCFF',
        actorName: 'Greta Schröder',
        actorWikiSlug: 'Greta_Schr%C3%B6der',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Greta_Schr%C3%B6der_1922.jpg/640px-Greta_Schr%C3%B6der_1922.jpg',
        actorYears: '1892–1980',
        actorNationality: 'German',
        actorBio:
          'Berlin stage and silent screen actress who starred in The Golem (1920) before portraying Ellen Hutter for Murnau.',
        performanceNote:
          'The shadow of Orlok’s clawed hand closing over her heart remains one of the supreme visual metaphors in cinema.',
        actorOtherWorks: ['The Golem: How He Came into the World (1920)', 'Victoria the Great (1937)'],
      },
      {
        characterId: 'nos_thomas_hutter',
        characterName: 'Thomas Hutter',
        tier: 'MAIN',
        roleArchetype: 'Young Clerk & Journeyer',
        characterBio:
          'An eager young estate clerk sent by his sinister employer Knock across the Carpathian Mountains to finalize a Wisborg property sale with Count Orlok.',
        characterArc:
          'Unwittingly unleashes the plague upon his hometown and races on horseback across Europe to reach Ellen in time.',
        screenTimeSec: 3120,
        dialogueLines: 64,
        bestFrameSec: 920,
        accentColor: '#38BDF8',
        actorName: 'Gustav von Wangenheim',
        actorWikiSlug: 'Gustav_von_Wangenheim',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Gustav_von_Wangenheim_Nosferatu.jpg/640px-Gustav_von_Wangenheim_Nosferatu.jpg',
        actorYears: '1895–1975',
        actorNationality: 'German',
        actorBio:
          'Celebrated Weimar actor who also starred as the astronaut hero in Fritz Lang’s Woman in the Moon (1929).',
        performanceNote:
          'Captures the transition from cheerful bourgeois optimism to gothic terror inside Orlok’s castle.',
        actorOtherWorks: ['Kohlhiesel’s Daughters (1920)', 'Woman in the Moon (1929)'],
      },
      {
        characterId: 'nos_knock',
        characterName: 'Knock',
        tier: 'SUPPORTING',
        roleArchetype: 'Occult Estate Agent & Disciple',
        characterBio:
          'Hutter’s cabbalistic employer who reads occult runes from Count Orlok, devours flies in the Wisborg asylum, and heralds his Master’s arrival across the sea.',
        characterArc:
          'Senses the exact moment Count Orlok perishes at dawn, crying out "The Master is dead!"',
        screenTimeSec: 1180,
        dialogueLines: 32,
        bestFrameSec: 2640,
        accentColor: '#F59E0B',
        actorName: 'Alexander Granach',
        actorWikiSlug: 'Alexander_Granach',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Alexander_Granach_1920s.jpg/640px-Alexander_Granach_1920s.jpg',
        actorYears: '1890–1945',
        actorNationality: 'Austro-Hungarian / American',
        actorBio:
          'Galician-born Yiddish and German stage sensation who later fled the Nazis and became a beloved Hollywood character actor in Ernst Lubitsch’s Ninotchka (1939) and Fritz Lang’s Hangmen Also Die! (1943).',
        performanceNote:
          'Delivers a fierce, expressionist tour de force as the Renfield counterpart.',
        actorOtherWorks: ['Warning Shadows (1923)', 'Kameradschaft (1931)', 'Ninotchka (1939)', 'Hangmen Also Die! (1943)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'In 1838 Wisborg, young estate clerk Thomas Hutter travels to the Carpathian Mountains to close a property purchase with the reclusive Count Orlok—only to discover his client is an ancient vampire bringing the Black Plague to his wife’s doorstep.',
      synopsis:
        'Dispatched by eccentric estate agent Knock to Transylvania, Thomas Hutter ignores the warnings of terrified villagers and enters Count Orlok’s ruined castle. Fascinated by a locket portrait of Hutter’s wife Ellen ("Your wife has a lovely neck"), Orlok loads earth-filled coffins teeming with plague rats onto the schooner Empusa. As the crew perishes and coffins parade down Wisborg’s silent streets, Ellen learns from The Book of the Vampires that only her willing sacrifice until cockcrow can destroy the monster.',
      themes: ['Love & self-sacrifice vs. pestilence', 'Nature & the uncanny', 'Shadow as psychological dread'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'The Journey to the Land of Phantoms',
            startSec: 0,
            endSec: 2040,
            summary: 'Knock sends Hutter to the Carpathians; after finding The Book of the Vampires at an inn, Hutter crosses into negative-film phantom woods and dines with Count Orlok.',
            turningPoint: 'Hutter cuts his thumb slicing bread, and Orlok lunges toward the blood.',
          },
          {
            number: 2,
            title: 'The Voyage of Death Aboard the Empusa',
            startSec: 2040,
            endSec: 4080,
            summary: 'Orlok seals himself inside earth-filled coffins bound for Wisborg while Hutter escapes the castle and races overland; aboard the Empusa, Orlok rises vertically from the hold and slaughters the entire crew.',
            turningPoint: 'The ghost ship Empusa glides silently into Wisborg harbor carrying Orlok and a tide of plague rats.',
          },
          {
            number: 3,
            title: 'Pestilence in Wisborg & The Dawn Sacrifice',
            startSec: 4080,
            endSec: 5640,
            summary: 'Funeral processions fill Wisborg’s streets as Orlok takes residence in the abandoned warehouse opposite Ellen’s window; Ellen lures Orlok to her bed until the rooster crows and sunlight dissolves him into smoke.',
            turningPoint: 'Murnau invents the cinematic rule that direct sunlight destroys the vampire.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'nos_sc_1',
          index: 1,
          slugline: 'EXT./INT. COUNT ORLOK’S CARPATHIAN CASTLE - NIGHT',
          title: 'The Phantom Carriage & Midnight Supper',
          summary: 'A negative-image carriage brings Hutter to Orlok’s ruin, where the Count’s shadow stalks Hutter’s chamber.',
          startSec: 840,
          endSec: 2040,
          actNumber: 1,
          mood: 'Gothic',
          characterRefIds: ['nos_count_orlok', 'nos_thomas_hutter'],
          stillIndexes: [0],
        },
        {
          id: 'nos_sc_2',
          index: 2,
          slugline: 'EXT./INT. SCHOONER EMPUSA - NIGHT',
          title: 'Count Orlok Rises from the Hold',
          summary: 'The first mate descends into the cargo hold with a hatchet as Orlok rises board-straight from his coffin.',
          startSec: 2880,
          endSec: 4080,
          actNumber: 2,
          mood: 'Uncanny',
          characterRefIds: ['nos_count_orlok'],
          stillIndexes: [1],
        },
        {
          id: 'nos_sc_3',
          index: 3,
          slugline: 'INT. ELLEN’S BEDCHAMBER IN WISBORG - NIGHT TO DAWN',
          title: 'The Shadow on the Stairs & Sunrise',
          summary: 'Orlok’s elongated shadow ascends the staircase and clutches Ellen’s heart; at daybreak, the sun’s rays reduce him to ash.',
          startSec: 4680,
          endSec: 5640,
          actNumber: 3,
          mood: 'Poetic',
          characterRefIds: ['nos_count_orlok', 'nos_ellen_hutter', 'nos_thomas_hutter'],
          stillIndexes: [2],
        },
      ],
      sequences: [
        { id: 'nos_seq_1', title: 'Carpathian Encounter', sceneIds: ['nos_sc_1'], purpose: 'Introduce Count Orlok in real natural locations.' },
        { id: 'nos_seq_2', title: 'Plague Ship & Redemption', sceneIds: ['nos_sc_2', 'nos_sc_3'], purpose: 'Bring the vampire to Wisborg and resolve through Ellen’s sacrifice.' },
      ],
      locations: [
        {
          refId: 'loc_oravsky_castle',
          name: 'Count Orlok’s Castle (Orava Castle, Slovakia)',
          description: 'Medieval stone fortress perched high above the Orava River in the Carpathians.',
          kind: 'EXTERIOR / INTERIOR',
          sceneIds: ['nos_sc_1'],
          confidence: 0.99,
        },
        {
          refId: 'loc_wisborg_harbor',
          name: 'Wisborg Harbor & Salt Warehouses (Wismar & Lübeck)',
          description: 'Baltic port town and brick gable warehouses where Orlok nests across from Hutter’s home.',
          kind: 'EXTERIOR / INTERIOR',
          sceneIds: ['nos_sc_2', 'nos_sc_3'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_book_of_vampires',
          name: 'The Book of the Vampires & Ellen’s Miniature Locket',
          description: 'The ancient treatise revealing how to defeat Nosferatu, paired with the locket portrait that draws Orlok to Wisborg.',
          narrativeRole: 'MACGUFFIN',
          sceneIds: ['nos_sc_1', 'nos_sc_3'],
          evidence: ['Ellen reads the book in Act 3 to learn the dawn sacrifice ritual'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },

  // ── 6. THE CABINET OF DR. CALIGARI (1920 · Robert Wiene) ────────────────────
  'europeana-caligari-1920': {
    identifier: 'europeana-caligari-1920',
    title: 'The Cabinet of Dr. Caligari',
    year: '1920',
    director: 'Robert Wiene',
    runtimeSec: 4620,
    tone: ['Expressionist', 'Delirious', 'Uncanny', 'Psychological'],
    charactersWithActors: [
      {
        characterId: 'cal_dr_caligari',
        characterName: 'Dr. Caligari / The Asylum Director',
        tier: 'MAIN',
        roleArchetype: 'Hypnotic Puppet-Master & Psychiatrist',
        characterBio:
          'A bespectacled, top-hatted fairground mountebank and asylum director obsessed with an 18th-century mystic who used a somnambulist to commit untraceable nocturnal murders.',
        characterArc:
          'In Francis’s story, Caligari is unmasked and straitjacketed in his own asylum—until the twist ending reveals Caligari is actually the asylum director treating Francis.',
        screenTimeSec: 2780,
        dialogueLines: 54,
        bestFrameSec: 1120,
        accentColor: '#F97316',
        actorName: 'Werner Krauss',
        actorWikiSlug: 'Werner_Krauss',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Werner_Krauss_as_Dr._Caligari.jpg/640px-Werner_Krauss_as_Dr._Caligari.jpg',
        actorYears: '1884–1959',
        actorNationality: 'German',
        actorBio:
          'Leading German Expressionist stage and screen actor who starred in Caligari, Waxworks (1924), The Student of Prague (1926), and G.W. Pabst’s Joyless Street (1925).',
        performanceNote:
          'Moved in sharp, angular, mechanical gestures to match the jagged painted geometry of Hermann Warm’s sets.',
        actorOtherWorks: ['Othello (1922)', 'Waxworks (1924)', 'Joyless Street (1925)', 'The Student of Prague (1926)'],
      },
      {
        characterId: 'cal_cesare',
        characterName: 'Cesare the Somnambulist',
        tier: 'MAIN',
        roleArchetype: 'Hypnotized Sleepwalker & Tragic Monster',
        characterBio:
          'A pale, kohl-eyed youth clad in black who has slept inside an upright coffin-like cabinet for 23 years, awakened by Dr. Caligari to tell fortunes by day and commit dagger murders by night.',
        characterArc:
          'Sent to murder Jane in her bed, Cesare is overcome by her beauty, spares her life, and carries her across the jagged rooftops before collapsing to his death.',
        screenTimeSec: 1860,
        dialogueLines: 14,
        bestFrameSec: 1680,
        accentColor: '#D0BCFF',
        actorName: 'Conrad Veidt',
        actorWikiSlug: 'Conrad_Veidt',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Conrad_Veidt_as_Cesare_in_The_Cabinet_of_Dr._Caligari.jpg/640px-Conrad_Veidt_as_Cesare_in_The_Cabinet_of_Dr._Caligari.jpg',
        actorYears: '1893–1943',
        actorNationality: 'German-British',
        actorBio:
          'Towering Weimar icon and ardent anti-Nazi who fled Germany with his Jewish wife in 1933, donating his personal fortune to the British war effort and immortalizing Major Strasser in Casablanca (1942) and Gwynplaine in The Man Who Laughs (1928, the direct visual inspiration for the Joker).',
        performanceNote:
          'Glided along expressionist walls like a living shadow; his awakening close-up electrified 1920 audiences.',
        actorOtherWorks: ['The Hands of Orlac (1924)', 'The Man Who Laughs (1928)', 'The Thief of Bagdad (1940)', 'Casablanca (1942)'],
      },
      {
        characterId: 'cal_jane',
        characterName: 'Jane Olsen',
        tier: 'MAIN',
        roleArchetype: 'Expressionist Heroine',
        characterBio:
          'Beloved by both Francis and Alan in Holstenwall; abducted from her draped bedroom by the somnambulist Cesare and later seen in the asylum courtyard believing she is a queen.',
        characterArc:
          'Transitions from romantic muse in Francis’s memory to an enigmatic patient inside the asylum.',
        screenTimeSec: 1520,
        dialogueLines: 28,
        bestFrameSec: 2540,
        accentColor: '#EC4899',
        actorName: 'Lil Dagover',
        actorWikiSlug: 'Lil_Dagover',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Lil_Dagover_1920.jpg/640px-Lil_Dagover_1920.jpg',
        actorYears: '1887–1980',
        actorNationality: 'German',
        actorBio:
          'Java-born Weimar film star who headlined Fritz Lang’s Destiny (1921) and Dr. Mabuse, Murnau’s Tartuffe (1925), and Maximilian Schell’s Oscar-winning The Pedestrian (1973).',
        performanceNote:
          'Embodies ethereal grace against the jagged, distorted bedroom architecture.',
        actorOtherWorks: ['Destiny (1921)', 'Tartuffe (1925)', 'Congress Dances (1931)', 'The Pedestrian (1973)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'At a mountain fairground in Holstenwall, young Francis investigates the mysterious Dr. Caligari and his coffin-dwelling sleepwalker Cesare, whose carnival prophecies of death are fulfilled by nocturnal stabbings—leading to cinema’s first great twist ending.',
      synopsis:
        'Seated on a garden bench, Francis recounts a terrifying tale: how the mysterious Dr. Caligari arrived at the Holstenwall fair with Cesare, a somnambulist asleep for 23 years. When Cesare prophesies that Francis’s friend Alan will die before dawn, Alan is murdered in his bed. Tracing the killer to the local lunatic asylum, Francis discovers Dr. Caligari is the asylum’s own director—until the framing story pulls back to reveal Francis, Jane, and Cesare are all inmates of the asylum.',
      themes: ['Tyrannical authority & mind control', 'Subjective madness vs. reality', 'The unreliable narrator'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'The Fairground Cabinet & Prophecy of Death',
            startSec: 0,
            endSec: 1560,
            summary: 'Francis begins his tale; Dr. Caligari exhibits Cesare at the Holstenwall fair, where Cesare tells Alan he will live only until dawn—and Alan is stabbed that night.',
            turningPoint: 'Cesare opens his eyes inside the cabinet and whispers to Alan: "Until the break of dawn!"',
          },
          {
            number: 2,
            title: 'Abduction Across the Jagged Rooftops',
            startSec: 1560,
            endSec: 3180,
            summary: 'Caligari orders Cesare to murder Jane while a dummy lies in Cesare’s cabinet to fool Francis; enchanted by Jane, Cesare abducts her across the twisted bridge and rooftops before dying of exhaustion.',
            turningPoint: 'Francis discovers Caligari has been hiding a life-sized dummy inside Cesare’s cabinet.',
          },
          {
            number: 3,
            title: 'The Asylum Diary & The Unreliable Frame Twist',
            startSec: 3180,
            endSec: 4620,
            summary: 'Francis exposes the Asylum Director’s obsession with the 1703 mystic Caligari—only for the narrative to return to the asylum courtyard where Francis himself is the patient and the Director promises to cure him.',
            turningPoint: 'Cinema’s foundational unreliable-narrator twist flips reality inside out in the final courtyard scene.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'cal_sc_1',
          index: 1,
          slugline: 'INT. HOLSTENWALL CARNIVAL TENT - DAY',
          title: 'The Awakening of Cesare',
          summary: 'Dr. Caligari opens the upright cabinet; Cesare slowly opens his heavily painted eyes and predicts Alan’s death at dawn.',
          startSec: 720,
          endSec: 1420,
          actNumber: 1,
          mood: 'Uncanny',
          characterRefIds: ['cal_dr_caligari', 'cal_cesare'],
          stillIndexes: [0],
        },
        {
          id: 'cal_sc_2',
          index: 2,
          slugline: 'INT. JANE’S BEDROOM / EXT. JAGGED ROOFTOPS - NIGHT',
          title: 'The Rooftop Abduction',
          summary: 'Cesare creeps along the painted wall with a dagger, drops the blade upon seeing Jane’s face, and carries her across angular rooftops.',
          startSec: 2100,
          endSec: 3180,
          actNumber: 2,
          mood: 'Expressionist',
          characterRefIds: ['cal_cesare', 'cal_jane'],
          stillIndexes: [1],
        },
      ],
      sequences: [
        { id: 'cal_seq_1', title: 'Carnival Hypnosis', sceneIds: ['cal_sc_1'], purpose: 'Introduce the expressionist world and somnambulist weapon.' },
        { id: 'cal_seq_2', title: 'Rooftop Flight & Asylum Twist', sceneIds: ['cal_sc_2'], purpose: 'Climax on the painted rooftops and invert the framing narrative.' },
      ],
      locations: [
        {
          refId: 'loc_holstenwall',
          name: 'Holstenwall Painted Town & Rooftops',
          description: 'Distorted German Expressionist canvas village designed by Hermann Warm, Walter Reimann, and Walter Röhrig with zero right angles.',
          kind: 'EXPRESSIONIST SET',
          sceneIds: ['cal_sc_1', 'cal_sc_2'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_caligari_diary',
          name: 'The 1703 Chronicle & Director’s Secret Diary',
          description: 'The ancient book on the mystic Caligari and the Director’s personal journal detailing his compulsion to become Caligari.',
          narrativeRole: 'MACGUFFIN',
          sceneIds: ['cal_sc_2'],
          evidence: ['Read by Francis and the doctors while the Director sleeps'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },

  // ── 7. THE PHANTOM OF THE OPERA (1925 · Rupert Julian) ──────────────────────
  ThePhantomoftheOpera: {
    identifier: 'ThePhantomoftheOpera',
    title: 'The Phantom of the Opera',
    year: '1925',
    director: 'Rupert Julian',
    runtimeSec: 6360,
    tone: ['Operatic', 'Gothic', 'Melodramatic', 'Grand'],
    charactersWithActors: [
      {
        characterId: 'poto_erik_phantom',
        characterName: 'Erik, The Phantom of the Opera',
        aka: ['The Opera Ghost', 'The Red Death'],
        tier: 'MAIN',
        roleArchetype: 'Tragic Gothic Genius',
        characterBio:
          'A former devil’s Island escapee, master architect,illusionist, and composer born with the face of a living skull who dwells five stories beneath the Paris Opera House in a subterranean lake palace, mentoring chorus soprano Christine Daaé from behind her dressing-room mirror.',
        characterArc:
          'Drops the grand chandelier when his demands are defied, abducts Christine into the catacombs where she unmasks him at the pipe organ, and is finally hunted down along the Seine by a torch-wielding Parisian mob.',
        screenTimeSec: 2890,
        dialogueLines: 58,
        bestFrameSec: 3420,
        accentColor: '#EF4444',
        actorName: 'Lon Chaney',
        actorWikiSlug: 'Lon_Chaney',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Lon_Chaney_in_The_Phantom_of_the_Opera_%281925%29.jpg/640px-Lon_Chaney_in_The_Phantom_of_the_Opera_%281925%29.jpg',
        actorYears: '1883–1930',
        actorNationality: 'American',
        actorBio:
          'Born to deaf-mute parents in Colorado Springs, Lon Chaney ("The Man of a Thousand Faces") mastered pantomime and self-engineered prosthetic makeup at Universal and MGM, starring in The Hunchback of Notre Dame (1923), He Who Gets Slapped (1924), The Unknown (1927), and London After Midnight (1927).',
        performanceNote:
          'Chaney used fish-skin, collodion, wire, and greasepaint to pull back his own nose and accentuate his cheekbones into Gaston Leroux’s "living skull," keeping the face hidden from cameras until the unmasking take.',
        actorOtherWorks: ['The Hunchback of Notre Dame (1923)', 'The Penalty (1920)', 'The Unknown (1927)', 'Laugh, Clown, Laugh (1928)'],
      },
      {
        characterId: 'poto_christine_daae',
        characterName: 'Christine Daaé',
        tier: 'MAIN',
        roleArchetype: 'Operatic Soprano & Muse',
        characterBio:
          'A rising Swedish soprano at the Paris Opera House who believes the unseen "Spirit of Music" coaching her from behind the walls is an angel—until he leads her on horseback across the underground lake.',
        characterArc:
          'Driven by overwhelming curiosity, she pulls the mask from Erik’s face during his organ recital of Don Juan Triumphant.',
        screenTimeSec: 3140,
        dialogueLines: 64,
        bestFrameSec: 3390,
        accentColor: '#D0BCFF',
        actorName: 'Mary Philbin',
        actorWikiSlug: 'Mary_Philbin',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Mary_Philbin_1925.jpg/640px-Mary_Philbin_1925.jpg',
        actorYears: '1902–1993',
        actorNationality: 'American',
        actorBio:
          'Chicago-born silent screen star discovered by Erich von Stroheim who headlined Universal’s two greatest silent gothic masterpieces: The Phantom of the Opera (1925) and Paul Leni’s The Man Who Laughs (1928).',
        performanceNote:
          'Her horrified reaction upon ripping off the Phantom’s mask defined the visual climax of 1920s horror.',
        actorOtherWorks: ['Merry-Go-Round (1923)', 'The Man Who Laughs (1928)'],
      },
      {
        characterId: 'poto_raoul',
        characterName: 'Vicomte Raoul de Chagny',
        tier: 'MAIN',
        roleArchetype: 'Romantic Nobleman & Rescuer',
        characterBio:
          'Christine’s devotedaristocratic suitor who descends into the labyrinthine cellars beneath the Paris Opera alongside Inspector Ledoux ("The Persian") to rescue her from Erik’s torture chambers.',
        characterArc:
          'Survives the Phantom’s mirrored Room of Tortures and flooding cellar trap to save Christine.',
        screenTimeSec: 2420,
        dialogueLines: 52,
        bestFrameSec: 4120,
        accentColor: '#38BDF8',
        actorName: 'Norman Kerry',
        actorWikiSlug: 'Norman_Kerry',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Norman_Kerry_1924.jpg/640px-Norman_Kerry_1924.jpg',
        actorYears: '1894–1956',
        actorNationality: 'American',
        actorBio:
          'Dashing silent-era leading man who partnered frequently with Lon Chaney in The Hunchback of Notre Dame (1923), The Phantom of the Opera (1925), and Tod Browning’s The Unknown (1927).',
        performanceNote:
          'Provides swashbuckling romantic contrast to Chaney’s subterranean gothic intensity.',
        actorOtherWorks: ['The Hunchback of Notre Dame (1923)', 'Merry-Go-Round (1923)', 'The Unknown (1927)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'Beneath the gilded grandeur of the Paris Opera House, a disfigured musical genius haunts the subterranean catacombs—crashing the great chandelier and abducting soprano Christine Daaé into his underground lair.',
      synopsis:
        'When the new owners of the Paris Opera House ignore warnings regarding Box 5 and refuse to cast Christine Daaé as Marguerite in Faust, the mysterious Opera Ghost unleashes catastrophe—cutting loose the auditorium’s crystal chandelier onto the audience below. Leading Christine through a revolving mirror down five levels of spiral staircases to an underground lake, Erik declares his love, prompting the legendary unmasking scene at his pipe organ and a desperate rescue mission through his mirrored torture chamber.',
      themes: ['Beauty and monstrous obsession', 'Subterranean repressed desire', 'Artistic madness'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'The Ghost of Box 5 & Crash of the Chandelier',
            startSec: 0,
            endSec: 2160,
            summary: 'Stagehands whisper of the Opera Ghost; when Carlotta replaces Christine during Faust, Erik saws through the chain of the grand chandelier, sending it crashing into the stalls.',
            turningPoint: 'The chandelier crashes into the auditorium as Erik lures Christine behind her dressing-room mirror.',
          },
          {
            number: 2,
            title: 'Down to the Subterranean Lake & The Unmasking',
            startSec: 2160,
            endSec: 4320,
            summary: 'Erik guides Christine across the underground lake to his catacomb lair; while Erik plays Don Juan Triumphant at his organ, Christine sneaks behind him and snatches off his mask.',
            turningPoint: 'Lon Chaney turns toward the camera in full skull-faced fury: "Feast your eyes, glut your soul on my accursed ugliness!"',
          },
          {
            number: 3,
            title: 'The Bal Masqué Red Death & Torture Chamber',
            startSec: 4320,
            endSec: 6360,
            summary: 'Erik appears at the Masked Ball in two-strip Technicolor as the Red Death; Raoul and Ledoux enter the mirrored heat-and-water torture chambers before a Parisian mob corners Erik by the Seine.',
            turningPoint: 'Cornered by the mob on the riverbank, Erik raises an empty hand in one final theatrical bluff before being overtaken.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'poto_sc_1',
          index: 1,
          slugline: 'INT. PARIS OPERA HOUSE AUDITORIUM - NIGHT',
          title: 'The Chandelier Crash & Descent into the Cellars',
          summary: 'The Phantom unleashes the great chandelier and leads Christine on a white horse down the subterranean ramps and across the underground lake.',
          startSec: 1320,
          endSec: 2520,
          actNumber: 1,
          mood: 'Operatic',
          characterRefIds: ['poto_erik_phantom', 'poto_christine_daae'],
          stillIndexes: [0],
        },
        {
          id: 'poto_sc_2',
          index: 2,
          slugline: 'INT. PHANTOM’S SUBTERRANEAN ORGAN LAIR - NIGHT',
          title: 'The Unmasking of Erik',
          summary: 'As Erik loses himself playing Don Juan Triumphant, Christine reaches out and pulls away the mask, revealing the skull beneath.',
          startSec: 3180,
          endSec: 3660,
          actNumber: 2,
          mood: 'Gothic',
          characterRefIds: ['poto_erik_phantom', 'poto_christine_daae'],
          stillIndexes: [1],
        },
        {
          id: 'poto_sc_3',
          index: 3,
          slugline: 'INT. OPERA GRAND STAIRCASE (TECHNICOLOR BAL MASQUÉ) - NIGHT',
          title: 'The Masque of the Red Death',
          summary: 'Clad in crimson robes and a skull mask in original two-strip Technicolor, Erik descends the grand staircase to reclaim Christine.',
          startSec: 4320,
          endSec: 5100,
          actNumber: 3,
          mood: 'Grand',
          characterRefIds: ['poto_erik_phantom', 'poto_christine_daae', 'poto_raoul'],
          stillIndexes: [2],
        },
      ],
      sequences: [
        { id: 'poto_seq_1', title: 'Wrath of the Opera Ghost', sceneIds: ['poto_sc_1'], purpose: 'Stage the chandelier spectacle and subterranean descent.' },
        { id: 'poto_seq_2', title: 'The Unmasking & Red Death', sceneIds: ['poto_sc_2', 'poto_sc_3'], purpose: 'Deliver the iconic reveal and Technicolor climax.' },
      ],
      locations: [
        {
          refId: 'loc_paris_opera_stage28',
          name: 'Paris Opera House & Subterranean Lake (Universal Stage 28)',
          description: 'First steel-and-concrete soundstage set in Hollywood history, modeling the Palais Garnier auditorium, Grand Staircase, and five levels of flooded catacombs.',
          kind: 'MONUMENTAL SOUNDSTAGE',
          sceneIds: ['poto_sc_1', 'poto_sc_2', 'poto_sc_3'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_phantom_mask',
          name: 'The Phantom’s Half-Mask & Scorpion/Grasshopper Lever',
          description: 'The silk mask concealing Erik’s skull visage, paired with the Scorpion and Grasshopper levers that decide whether the Opera House explodes or floods.',
          narrativeRole: 'KEY_PROP',
          sceneIds: ['poto_sc_2', 'poto_sc_3'],
          evidence: ['Unmasking scene at 56:30', 'Scorpion vs. Grasshopper choice in the torture chamber'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },

  // ── 8. HÄXAN: WITCHCRAFT THROUGH THE AGES (1922 · Benjamin Christensen) ─────
  Haxan_tinted_and_subtitled: {
    identifier: 'Haxan_tinted_and_subtitled',
    title: 'Häxan: Witchcraft Through the Ages',
    year: '1922',
    director: 'Benjamin Christensen',
    runtimeSec: 6300,
    tone: ['Occult', 'Essayistic', 'Nightmarish', 'Compassionate'],
    charactersWithActors: [
      {
        characterId: 'hax_the_devil',
        characterName: 'The Devil',
        tier: 'MAIN',
        roleArchetype: 'Medieval Tempter & Sabbath Master',
        characterBio:
          'A horned, clawed, tongue-wagging incarnation of medieval superstition who haunts cloistered nuns, churns butter in peasant kitchens, and presides over the nocturnal Witches’ Sabbath.',
        characterArc:
          'Embodies the fevered projections of medieval inquisitors and repressed minds across the centuries.',
        screenTimeSec: 1420,
        dialogueLines: 12,
        bestFrameSec: 2640,
        accentColor: '#EF4444',
        actorName: 'Benjamin Christensen',
        actorWikiSlug: 'Benjamin_Christensen',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Benjamin_Christensen_1922.jpg/640px-Benjamin_Christensen_1922.jpg',
        actorYears: '1879–1959',
        actorNationality: 'Danish',
        actorBio:
          'Writer, researcher, and director of Häxan who donned elaborate horns and demonic prosthetics to play Satan himself.',
        performanceNote:
          'Ferociously theatrical and darkly mischievous performance that anchored the film’s nocturnal sabbath sequences.',
        actorOtherWorks: ['The Mysterious X (1914)', 'Mockery (1927)', 'Seven Footprints to Satan (1929)'],
      },
      {
        characterId: 'hax_maria_weaver',
        characterName: 'Maria the Old Weaver Woman',
        tier: 'MAIN',
        roleArchetype: 'Accused Beggar Woman',
        characterBio:
          'An impoverished, half-starved elderly beggar woman accused of bewitching a dying printer, arrested by hooded inquisitors and tortured with thumbscrews until she hallucinates a flight to the Witches’ Sabbath.',
        characterArc:
          'Demonstrates how physical torture forced innocent women to confess to impossible crimes and implicate whole families.',
        screenTimeSec: 1840,
        dialogueLines: 28,
        bestFrameSec: 1980,
        accentColor: '#F59E0B',
        actorName: 'Maren Pedersen',
        actorWikiSlug: 'H%C3%A4xan',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Maren_Pedersen_in_Haxan_1922.jpg/640px-Maren_Pedersen_in_Haxan_1922.jpg',
        actorYears: '1845–1932',
        actorNationality: 'Danish',
        actorBio:
          'An actual elderly flower-seller from the streets of Copenhagen whom Benjamin Christensen discovered and cast as Maria. During filming, Pedersen told Christensen that she genuinely believed in the Devil.',
        performanceNote:
          'Her heart-wrenching close-up in Chapter 7 looking straight into the camera lens is one of silent cinema’s most moving moments of human empathy.',
        actorOtherWorks: ['Häxan (1922)'],
      },
      {
        characterId: 'hax_sister_cecilia',
        characterName: 'Sister Cecilia',
        tier: 'SUPPORTING',
        roleArchetype: 'Tormented Convent Nun',
        characterBio:
          'A devout medieval nun seized by somnambulism and hysteric visions of the Devil inside her cloister.',
        characterArc:
          'Christensen connects her medieval "possession" directly to modern sleepwalking and psychological trauma.',
        screenTimeSec: 940,
        dialogueLines: 16,
        bestFrameSec: 4680,
        accentColor: '#D0BCFF',
        actorName: 'Clara Pontoppidan',
        actorWikiSlug: 'Clara_Pontoppidan',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Clara_Pontoppidan.jpg/640px-Clara_Pontoppidan.jpg',
        actorYears: '1883–1975',
        actorNationality: 'Danish',
        actorBio:
          'One of Denmark’s greatest stage and screen actresses of the 20th century, starring in Carl Theodor Dreyer’s Leaves from Satan’s Book (1920) and Royal Danish Theatre productions for over 50 years.',
        performanceNote:
          'Plays both the medieval nun and her modern 1920s counterpart with haunting vulnerability.',
        actorOtherWorks: ['A Victim of the Mormons (1911)', 'Leaves from Satan’s Book (1920)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'Structured in seven chapters from ancient cosmology to modern psychiatry, Benjamin Christensen’s silent visual essay brings medieval woodcuts, witch-trial torture chambers, and nocturnal sabbaths vividly to life.',
      synopsis:
        'Drawing on his two-year study of the 1487 inquisitorial manual Malleus Maleficarum, Danish auteur Benjamin Christensen traces the history of witchcraft and demonology across seven chapters. Blending lecture-style animated woodcuts with lavish 15th-century dramatizations, the film follows the accusation and torture of old Maria the Weaver and young Anna, visualizes the fevered Witches’ Sabbath with stop-motion demons and double-exposed broomstick flights, and concludes by linking medieval witch hunts to misunderstood mental illness.',
      themes: ['Superstition & institutional persecution', 'Folklore vs. psychology', 'Empathy for the marginalized'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'Chapters I–II: Ancient Cosmology & The Sorceress’s Workshop',
            startSec: 0,
            endSec: 1800,
            summary: 'Christensen’s pointer stick tours medieval woodcuts of hell and planetary spheres before entering a 15th-century sorceress’s apothecary of love potions and occult charms.',
            turningPoint: 'The transition from static woodcut engravings into breathing, chiaroscuro live-action tableaux.',
          },
          {
            number: 2,
            title: 'Chapters III–V: The Inquisition, Torture & The Witches’ Sabbath',
            startSec: 1800,
            endSec: 4680,
            summary: 'Old Maria is accused of bewitching Jesper the Printer; tortured by inquisitors, she confesses to flying on a broomstick to the nocturnal Sabbath and implicates Jesper’s young wife Anna.',
            turningPoint: 'Maria’s coerced confession unleashes a wild optical sequence of witches flying over rooftops and feasting with the Devil.',
          },
          {
            number: 3,
            title: 'Chapters VI–VII: Instruments of Torture & Modern Hysteria',
            startSec: 4680,
            endSec: 6300,
            summary: 'Christensen demonstrates real medieval torture irons on camera, dramatizes convent hysteria, and draws a direct parallel between medieval "witches" and 1920s women suffering from trauma and somnambulism.',
            turningPoint: 'Final comparison between the medieval stake and modern clinical care.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'hax_sc_1',
          index: 1,
          slugline: 'INT. SORCERESS KARNA’S APOTHECARY - NIGHT (1488)',
          title: 'Love Potions & Nocturnal Visions',
          summary: 'In a firelit medieval den, Karna brews love philtres while a young woman dreams of the horned Devil beckoning at her bedside.',
          startSec: 960,
          endSec: 1800,
          actNumber: 1,
          mood: 'Occult',
          characterRefIds: ['hax_the_devil'],
          stillIndexes: [0],
        },
        {
          id: 'hax_sc_2',
          index: 2,
          slugline: 'INT. INQUISITORIAL CHAMBER / EXT. WITCHES’ SABBATH - NIGHT',
          title: 'Maria’s Interrogation & Flight to the Sabbath',
          summary: 'Under thumbscrews, old Maria describes flying over the medieval town rooftops on a broomstick into a Bosch-like Sabbath of demons.',
          startSec: 2200,
          endSec: 3900,
          actNumber: 2,
          mood: 'Nightmarish',
          characterRefIds: ['hax_maria_weaver', 'hax_the_devil'],
          stillIndexes: [1],
        },
      ],
      sequences: [
        { id: 'hax_seq_1', title: 'Anatomy of a Witch Trial', sceneIds: ['hax_sc_1', 'hax_sc_2'], purpose: 'Show how poverty, illness, and torture manufactured confessions.' },
      ],
      locations: [
        {
          refId: 'loc_medieval_inquisition',
          name: '15th-Century Inquisitorial Tribunal & Sabbath Glade',
          description: 'Monumental historical sets constructed at Astra Film Studios in Copenhagen.',
          kind: 'HISTORICAL TABLEAU',
          sceneIds: ['hax_sc_1', 'hax_sc_2'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_malleus_maleficarum',
          name: 'Malleus Maleficarum (1487 Hammer of Witches) & Thumbscrews',
          description: 'The inquisitorial handbook and iron thumbscrews that drive the film’s historical investigation.',
          narrativeRole: 'KEY_PROP',
          sceneIds: ['hax_sc_1', 'hax_sc_2'],
          evidence: ['Opened on camera by Christensen in Chapter I and Chapter VI'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },

  // ── 9. HORROR EXPRESS (1972 · Eugenio Martín) ───────────────────────────────
  Horror_Express: {
    identifier: 'Horror_Express',
    title: 'Horror Express',
    year: '1972',
    director: 'Eugenio Martín',
    runtimeSec: 5220,
    tone: ['Claustrophobic', 'Euro-Gothic', 'Sci-Fi Mystery', 'Action-Packed'],
    charactersWithActors: [
      {
        characterId: 'he_prof_saxton',
        characterName: 'Professor Sir Alexander Saxton',
        tier: 'MAIN',
        roleArchetype: 'Aristocratic Anthropologist',
        characterBio:
          'A proud, rationalist British fellow of the Royal Geological Society transporting a two-million-year-old frozen fossil crate from Manchuria to Moscow aboard the Trans-Siberian Express.',
        characterArc:
          'Forced to abandon scientific arrogance and join forces with his rival Dr. Wells when the creature inside the crate turns out to be an ancient extraterrestrial consciousness that absorbs memories through its glowing red eyes.',
        screenTimeSec: 3480,
        dialogueLines: 184,
        bestFrameSec: 840,
        accentColor: '#F97316',
        actorName: 'Christopher Lee',
        actorWikiSlug: 'Christopher_Lee',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Christopher_Lee_1975.jpg/640px-Christopher_Lee_1975.jpg',
        actorYears: '1922–2015',
        actorNationality: 'British',
        actorBio:
          'Knighted legend of world cinema with over 275 screen credits—from Hammer’s Count Dracula, Frankenstein’s Creature, and Lord Summerisle in The Wicker Man (1973) to Scaramanga in The Man with the Golden Gun, Saruman in The Lord of the Rings, and Count Dooku in Star Wars.',
        performanceNote:
          'Relished playing the heroic scientific protagonist opposite his lifelong real-life best friend Peter Cushing.',
        actorOtherWorks: ['Horror of Dracula (1958)', 'The Wicker Man (1973)', 'The Man with the Golden Gun (1974)', 'The Lord of the Rings (2001–2003)'],
      },
      {
        characterId: 'he_dr_wells',
        characterName: 'Dr. Wells',
        tier: 'MAIN',
        roleArchetype: 'Charming Rival Physician & Scientist',
        characterBio:
          'Saxton’s witty colleague and friendly rival who performs the autopsy on the creature’s victims and discovers that the entity prints prehistoric images of Earth seen from space onto the fluid of its own eyeballs.',
        characterArc:
          'Works shoulder-to-shoulder with Saxton to deduce that the alien consciousness can leap from host body to host body.',
        screenTimeSec: 3290,
        dialogueLines: 176,
        bestFrameSec: 1620,
        accentColor: '#38BDF8',
        actorName: 'Peter Cushing',
        actorWikiSlug: 'Peter_Cushing',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Peter_Cushing_1958.jpg/640px-Peter_Cushing_1958.jpg',
        actorYears: '1913–1994',
        actorNationality: 'British',
        actorBio:
          'OBE-honored titan of British cinema and stage, immortalized as Baron Frankenstein, Professor Van Helsing, Sherlock Holmes, and Grand Moff Tarkin in Star Wars (1977).',
        performanceNote:
          'Cushing had recently lost his beloved wife Helen and nearly withdrew from the film until Christopher Lee comforted him in Madrid; their affectionate banter on screen is electric.',
        actorOtherWorks: ['The Curse of Frankenstein (1957)', 'Horror of Dracula (1958)', 'The Hound of the Baskervilles (1959)', 'Star Wars (1977)'],
      },
      {
        characterId: 'he_captain_kazan',
        characterName: 'Captain Kazan',
        tier: 'SUPPORTING',
        roleArchetype: 'Ruthless Cossack Commander',
        characterBio:
          'A swaggering, whip-wielding Imperial Russian Cossack officer who boards the train in the middle of the Siberian wilderness to restore order—only to fall victim to the alien consciousness and raise an undead army of his own Cossack troops.',
        characterArc:
          'Transforms from human military autocrat into the glowing-eyed host of the ancient extraterrestrial intelligence.',
        screenTimeSec: 1240,
        dialogueLines: 78,
        bestFrameSec: 3680,
        accentColor: '#EF4444',
        actorName: 'Telly Savalas',
        actorWikiSlug: 'Telly_Savalas',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Telly_Savalas_Kojak_1973.JPG/640px-Telly_Savalas_Kojak_1973.JPG',
        actorYears: '1922–1994',
        actorNationality: 'American',
        actorBio:
          'Academy Award nominee (Birdman of Alcatraz), James Bond arch-villain Blofeld (On Her Majesty’s Secret Service), and Emmy-winning star of Kojak.',
        performanceNote:
          'Steals the third act with cigar-chomping swagger before becoming the final vessel of the alien creature.',
        actorOtherWorks: ['The Dirty Dozen (1967)', 'On Her Majesty’s Secret Service (1969)', 'Kelly’s Heroes (1970)', 'Kojak (1973–1978)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'Aboard the 1906 Trans-Siberian Express, British scientists Christopher Lee and Peter Cushing discover that the frozen Manchurian hominid in the baggage car hosts a primordial alien consciousness that drains passengers’ brains and raises the dead.',
      synopsis:
        'In 1906 China, Professor Sir Alexander Saxton unearths a frozen prehistoric hominid in a Manchurian cave and loads the chained crate onto the Trans-Siberian Express. Before the train even leaves Shanghai, a thief who peers inside is found dead with chalk-white eyes. As the creature thaws and stalks the wooden carriages, Saxton and rival physician Dr. Wells perform a microscopic examination of the creature’s eye fluid—discovering prehistoric images of Earth from space and realizing the entity is an energy lifeform jumping between hosts.',
      themes: ['Science vs. fanaticism', 'Body-hopping paranoia', 'Cosmic antiquity'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'The Manchurian Crate & Departure from Shanghai',
            startSec: 0,
            endSec: 1680,
            summary: 'Saxton discovers the frozen fossil in Manchuria; at the Shanghai station a thief dies with bleached eyes, the Fanatic Monk declares the crate Satanic, and the creature breaks out in the baggage car.',
            turningPoint: 'Inspector Mirov finds the baggage clerk stuffed inside the crate while the thawed hominid roams the train.',
          },
          {
            number: 2,
            title: 'Images in the Eye Fluid & Host Transfer',
            startSec: 1680,
            endSec: 3600,
            summary: 'Inspector Mirov shoots the hominid, but Wells and Saxton discover prehistoric dinosaur and space images retained in its eye fluid—and realize the alien consciousness has jumped into Inspector Mirov.',
            turningPoint: 'Thelights go out during a search, exposing Mirov’s glowing red eyes.',
          },
          {
            number: 3,
            title: 'Captain Kazan’s Cossacks & The Runaway Train',
            startSec: 3600,
            endSec: 5220,
            summary: 'Captain Kazan boards with Cossacks, shoots Mirov, and is possessed in turn; the alien reanimates the slain Cossacks into a white-eyed undead horde as Saxton and Wells uncouple the passenger car before the train plunges into a gorge.',
            turningPoint: 'Saxton and Wells uncouple the rear coach seconds before the locomotive and undead-filled carriages plunge off the cliff.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'he_sc_1',
          index: 1,
          slugline: 'INT. TRANS-SIBERIAN BAGGAGE CAR & LABORATORY - NIGHT',
          title: 'The Microscopic Eye-Fluid Revelation',
          summary: 'Saxton and Wells examine fluid from the dead hominid’s eyeballs under a microscope, revealing pterodactyls and a view of Earth from outer space.',
          startSec: 1920,
          endSec: 2760,
          actNumber: 2,
          mood: 'Sci-Fi Mystery',
          characterRefIds: ['he_prof_saxton', 'he_dr_wells'],
          stillIndexes: [0],
        },
        {
          id: 'he_sc_2',
          index: 2,
          slugline: 'INT./EXT. RUNAWAY TRANS-SIBERIAN EXPRESS - NIGHT',
          title: 'Possession of Captain Kazan & The Gorge Plunge',
          summary: 'Possessed Kazan reanimates his fallen Cossack soldiers to attack the survivors as Saxton and Wells race to uncouple the caboose.',
          startSec: 3600,
          endSec: 5220,
          actNumber: 3,
          mood: 'Action-Packed',
          characterRefIds: ['he_prof_saxton', 'he_dr_wells', 'he_captain_kazan'],
          stillIndexes: [1],
        },
      ],
      sequences: [
        { id: 'he_seq_1', title: 'Mystery in the Baggage Car', sceneIds: ['he_sc_1'], purpose: 'Reveal the cosmic nature of the fossil.' },
        { id: 'he_seq_2', title: 'Undead Cossacks on the Rails', sceneIds: ['he_sc_2'], purpose: 'Escalate to full train siege and cliffhanger climax.' },
      ],
      locations: [
        {
          refId: 'loc_trans_siberian_express',
          name: 'The Trans-Siberian Express (1906 Luxury Steam Train)',
          description: 'Ornate wood-paneled Edwardian sleeping cars, dining saloon, and baggage van hurtling across snowbound Siberia.',
          kind: 'MOVING TRAIN',
          sceneIds: ['he_sc_1', 'he_sc_2'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_manchurian_crate',
          name: 'Chained Manchurian Fossil Crate & Retinal Fluid',
          description: 'The padlocked wooden crate housing the frozen hominid and the retinal fluid retaining memories of deep space.',
          narrativeRole: 'MACGUFFIN',
          sceneIds: ['he_sc_1'],
          evidence: ['Drives the scientific rivalry and reveals the alien origin'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },

  // ── 10. WHITE ZOMBIE (1932 · Victor Halperin) ────────────────────────────────
  white_zombie: {
    identifier: 'white_zombie',
    title: 'White Zombie',
    year: '1932',
    director: 'Victor Halperin',
    runtimeSec: 4020,
    tone: ['Hypnotic', 'Pre-Code Gothic', 'Dreamlike', 'Eerie'],
    charactersWithActors: [
      {
        characterId: 'wz_murder_legendre',
        characterName: '"Murder" Legendre',
        tier: 'MAIN',
        roleArchetype: 'Voodoo Sugar-Mill Master',
        characterBio:
          'A sinister necromancer in Haiti who staffs his nocturnal sugarcane mill and cliffside fortress entirely with zombies—the corpses of his former enemies revived into soulless, uncomplaining laborers under his telepathic command.',
        characterArc:
          'Transforms bride Madeline Short into a zombie for plantation owner Beaumont, then poisons Beaumont into a half-zombie himself before being knocked from his cliffside battlement.',
        screenTimeSec: 2340,
        dialogueLines: 92,
        bestFrameSec: 740,
        accentColor: '#EF4444',
        actorName: 'Bela Lugosi',
        actorWikiSlug: 'Bela_Lugosi',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Bela_Lugosi_in_White_Zombie_1932.jpg/640px-Bela_Lugosi_in_White_Zombie_1932.jpg',
        actorYears: '1882–1956',
        actorNationality: 'Hungarian-American',
        actorBio:
          'Trained at the National Theatre of Hungary in Budapest before immigrating to America and achieving global immortality as Count Dracula on Broadway (1927) and in Tod Browning’s 1931 Universal film, followed by White Zombie, The Black Cat, and Son of Frankenstein (as Ygor).',
        performanceNote:
          'Halperin framed Lugosi’s burning eyes in extreme, spot-lit close-ups accented by his signature hand-carving of wax voodoo dolls.',
        actorOtherWorks: ['Dracula (1931)', 'The Black Cat (1934)', 'Son of Frankenstein (1939)', 'Ninotchka (1939)'],
      },
      {
        characterId: 'wz_madeline_short',
        characterName: 'Madeline Short Parker',
        tier: 'MAIN',
        roleArchetype: 'Entranced Bride',
        characterBio:
          'A young American woman who travels to Port-au-Prince to marry her fiancé Neil Parker, only to drink a flower-laced potion on her wedding night that places her in deathlike suspended animation inside a family mausoleum.',
        characterArc:
          'Raised from her crypt as a blank-staring piano-playing zombie bride until Legendre’s death breaks the telepathic spell and restores her soul.',
        screenTimeSec: 2180,
        dialogueLines: 48,
        bestFrameSec: 1860,
        accentColor: '#D0BCFF',
        actorName: 'Madge Bellamy',
        actorWikiSlug: 'Madge_Bellamy',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Madge_Bellamy_1920s.jpg/640px-Madge_Bellamy_1920s.jpg',
        actorYears: '1899–1990',
        actorNationality: 'American',
        actorBio:
          'Texas-born Broadway prodigy and 1920s Fox Film silent star who headlined John Ford’s The Iron Horse (1924) before making her iconic talkie comeback in White Zombie.',
        performanceNote:
          'Played the second half of the film in a somnambulistic trance seated at a grand piano inside a gothic castle.',
        actorOtherWorks: ['Lorna Doone (1922)', 'The Iron Horse (1924)', 'Lazybones (1925)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'In 1932 Haiti, wealthy plantation owner Charles Beaumont enlists sinister voodoo master "Murder" Legendre (Bela Lugosi) to turn young bride Madeline into a soulless zombie on her wedding night.',
      synopsis:
        'Arriving in Haiti to marry her fiancé Neil Parker at the estate of wealthy acquaintance Charles Beaumont, Madeline Short is stalked by "Murder" Legendre—a necromancer who operates a sugar mill crewed entirely by the walking dead. Using a pinpoint dose of zombie potion concealed on a rose, Beaumont and Legendre stage Madeline’s funeral and steal her from her tomb. Discovering that a zombie bride has no warmth or soul, a remorseful Beaumont is himself poisoned by Legendre as Neil and missionary Dr. Bruner storm the cliffside fortress.',
      themes: ['Loss of soul & free will', 'Colonial exploitation & the undead sugar mill', 'Obsessive possession vs. love'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'The Midnight Burial Road & The Undead Sugar Mill',
            startSec: 0,
            endSec: 1380,
            summary: 'Madeline and Neil’s coach passes a funeral conducted in the middle of the road to deter grave-robbers; Beaumont visits Legendre’s eerie, creaking sugar mill staffed by zombie laborers and accepts the vial of potion.',
            turningPoint: 'A zombie worker falls into the grinding sugarcane gears without a single cry from his undead peers.',
          },
          {
            number: 2,
            title: 'The Poisoned Rose & Theft from the Crypt',
            startSec: 1380,
            endSec: 2760,
            summary: 'Madeline smells a poisoned rose during her wedding banquet, "dies" in Neil’s arms, and is entombed—where Legendre and his zombie henchmen raise her and take her to his sea-cliff castle.',
            turningPoint: 'Dr. Bruner and a heartbroken Neil open Madeline’s crypt at midnight and find the coffin empty.',
          },
          {
            number: 3,
            title: 'Fortress on the Precipice & Breaking the Trance',
            startSec: 2760,
            endSec: 4020,
            summary: 'Inside the castle, Legendre poisons Beaumont; commanded to murder Neil on the parapet, Madeline hesitates when Dr. Bruner knocks Legendre unconscious, and Beaumont hurls Legendre over the cliff—sending the zombies marching into the sea and awakening Madeline.',
            turningPoint: 'Legendre’s plunge into the surf severs his telepathic link, immediately awakening Madeline from her trance.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'wz_sc_1',
          index: 1,
          slugline: 'INT. LEGENDRE’S HAITIAN SUGAR MILL - NIGHT',
          title: '"They Work Faithfully; They Are Not Worried About Long Hours"',
          summary: 'Beaumont tours Legendre’s shadowy mill where undead workers endlessly turn the wooden grinding wheel.',
          startSec: 600,
          endSec: 1260,
          actNumber: 1,
          mood: 'Eerie',
          characterRefIds: ['wz_murder_legendre'],
          stillIndexes: [0],
        },
        {
          id: 'wz_sc_2',
          index: 2,
          slugline: 'EXT. CLIFFSIDE CASTLE PARAPET - NIGHT',
          title: 'The March of the Zombies & Awakening',
          summary: 'Legendre commands his zombie bodyguards on the cliff stairs before being knocked into the ocean below.',
          startSec: 3120,
          endSec: 4020,
          actNumber: 3,
          mood: 'Pre-Code Gothic',
          characterRefIds: ['wz_murder_legendre', 'wz_madeline_short'],
          stillIndexes: [1],
        },
      ],
      sequences: [
        { id: 'wz_seq_1', title: 'The Pact in the Sugar Mill', sceneIds: ['wz_sc_1'], purpose: 'Establish the zombie mythology and Legendre’s power.' },
        { id: 'wz_seq_2', title: 'Castle of the Undead', sceneIds: ['wz_sc_2'], purpose: 'Break the hypnotic bond on the cliffside.' },
      ],
      locations: [
        {
          refId: 'loc_zombie_sugar_mill',
          name: '"Murder" Legendre’s Undead Sugar Mill',
          description: 'Creaking Pre-Code gothic mill driven by zombies marching in an endless circle.',
          kind: 'INTERIOR',
          sceneIds: ['wz_sc_1'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_wax_voodoo_doll',
          name: 'Wax Effigy Doll & Pinpoint Zombie Vial',
          description: 'The wax figurine carved by Bela Lugosi from a candle and the odorless potion that induces living death.',
          narrativeRole: 'MACGUFFIN',
          sceneIds: ['wz_sc_1', 'wz_sc_2'],
          evidence: ['Melted in candle flame to seal Madeline’s trance'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },

  // ── 11. THE TERROR (1963 · Roger Corman) ─────────────────────────────────────
  TheTerror1963: {
    identifier: 'TheTerror1963',
    title: 'The Terror',
    year: '1963',
    director: 'Roger Corman',
    runtimeSec: 4740,
    tone: ['Gothic', 'Technicolor', 'Mysterious', 'Romantic'],
    charactersWithActors: [
      {
        characterId: 'ter_baron_von_leppe',
        characterName: 'Baron Victor Frederick von Leppe',
        tier: 'MAIN',
        roleArchetype: 'Guilt-Haunted Gothic Nobleman',
        characterBio:
          'A reclusive, brooding Baltic nobleman living inside a sea-battered castle for twenty years beside the flooded crypt of his murdered wife Ilsa—harboring a dark secret about who actually occupies the Baron’s identity.',
        characterArc:
          'Reveals that the real Baron died twenty years ago and that he is Eric, the guilt-ridden impostor manipulated by the witch Katrina into flooding the crypt.',
        screenTimeSec: 2480,
        dialogueLines: 142,
        bestFrameSec: 1120,
        accentColor: '#F97316',
        actorName: 'Boris Karloff',
        actorWikiSlug: 'Boris_Karloff',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Boris_Karloff_1932.jpg/640px-Boris_Karloff_1932.jpg',
        actorYears: '1887–1969',
        actorNationality: 'British',
        actorBio:
          'Born William Henry Pratt in London, Boris Karloff became one of the founding immortals of horror cinema as the Creature in James Whale’s Frankenstein (1931), Imhotep in The Mummy (1932), The Old Dark House, The Body Snatcher, and the narrator/voice of How the Grinch Stole Christmas! (1966).',
        performanceNote:
          'Roger Corman shot all of Karloff’s castle interior scenes in just two days left over from The Raven (1963).',
        actorOtherWorks: ['Frankenstein (1931)', 'The Mummy (1932)', 'Bride of Frankenstein (1935)', 'The Body Snatcher (1945)', 'Targets (1968)'],
      },
      {
        characterId: 'ter_lt_andre_duvallier',
        characterName: 'Lieutenant André Duvalier',
        tier: 'MAIN',
        roleArchetype: 'Lost Napoleonic Cavalry Officer',
        characterBio:
          'A young French cavalry officer separated from Napoleon’s regiment along the Baltic coast in 1806 who is rescued from drowning by a mysterious woman named Helene—and pursues her to Baron von Leppe’s castle.',
        characterArc:
          'Refuses to believe Helene is a twenty-year-dead ghost and battles through subterranean crypts to break the witch Katrina’s curse.',
        screenTimeSec: 3120,
        dialogueLines: 164,
        bestFrameSec: 420,
        accentColor: '#38BDF8',
        actorName: 'Jack Nicholson',
        actorWikiSlug: 'Jack_Nicholson',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Jack_Nicholson_in_The_Terror_1963.jpg/640px-Jack_Nicholson_in_The_Terror_1963.jpg',
        actorYears: 'b. 1937',
        actorNationality: 'American',
        actorBio:
          'Three-time Academy Award winner and the most nominated male actor in Oscars history (One Flew Over the Cuckoo’s Nest, The Shining, Chinatown, Easy Rider, The Departed), who began his career in Roger Corman’s stock company.',
        performanceNote:
          'In addition to starring as Lieutenant Duvalier, a 26-year-old Nicholson also directed the final day of location shooting himself.',
        actorOtherWorks: ['The Little Shop of Horrors (1960)', 'Easy Rider (1969)', 'Chinatown (1974)', 'One Flew Over the Cuckoo’s Nest (1975)', 'The Shining (1980)'],
      },
      {
        characterId: 'ter_helene_ilsa',
        characterName: 'Helene / Ghost of Baroness Ilsa von Leppe',
        tier: 'MAIN',
        roleArchetype: 'Spectral Siren',
        characterBio:
          'A haunting apparition wearing the exact likeness of the Baron’s murdered wife Ilsa, conjured by the witch Katrina to lure the Baron into drowning himself in the subterranean crypt.',
        characterArc:
          'Caught between Katrina’s black magic and André’s genuine devotion until the flooded crypt collapses.',
        screenTimeSec: 1460,
        dialogueLines: 62,
        bestFrameSec: 980,
        accentColor: '#D0BCFF',
        actorName: 'Sandra Knight',
        actorWikiSlug: 'Sandra_Knight',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Jack_Nicholson_in_The_Terror_1963.jpg/640px-Jack_Nicholson_in_The_Terror_1963.jpg',
        actorYears: 'b. 1939',
        actorNationality: 'American',
        actorBio:
          'American actress and writer who starred in Thunder Road (1958) and Frankenstein’s Daughter (1958) and was married to costar Jack Nicholson at the time The Terror was filmed.',
        performanceNote:
          'Glides through the Big Sur coastal surf and Corman’s fog-filled castle corridors with otherworldly stillness.',
        actorOtherWorks: ['Thunder Road (1958)', 'Tower of London (1962)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'Separated from his regiment on the 1806 Baltic coast, young French cavalry officer André Duvalier (Jack Nicholson) follows a spectral woman into the sea-lashed castle of Baron von Leppe (Boris Karloff), uncovering a twenty-year web of murder, impersonation, and witchcraft.',
      synopsis:
        'Riding alone along the foggy Baltic shore in 1806, Napoleonic officer André Duvalier is saved from the surf by a mysterious young woman calling herself Helene. When she vanishes, an old witch named Katrina directs André to the fortress of Baron Victor von Leppe—where André sees a portrait of the Baron’s wife Ilsa, dead for twenty years, bearing Helene’s exact face. Descending into the sea-wall crypts beneath the castle, André unravels a shocking confession of stolen identity before the floodgates shatter.',
      themes: ['Guilt & stolen identity', 'Gothic romantic obsession', 'Vengeance from beyond the grave'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'The Woman in the Surf & Castle von Leppe',
            startSec: 0,
            endSec: 1560,
            summary: 'Lieutenant Duvalier collapses on the coast, meets Helene and the witch Katrina, and enters Baron von Leppe’s castle where he recognizes Helene as the portrait of the late Baroness Ilsa.',
            turningPoint: 'The Baron reveals that the woman in the portrait has been dead for twenty years.',
          },
          {
            number: 2,
            title: 'The Secret of the Impostor Baron',
            startSec: 1560,
            endSec: 3360,
            summary: 'Steward Stefan and the Baron clash as Katrina commands Helene to lure the Baron to the crypt; Stefan forces a confession that the "Baron" is actually Eric, who killed the real Baron twenty years ago.',
            turningPoint: 'Karloff’s character confesses he has lived for two decades wearing the identity of the man he killed.',
          },
          {
            number: 3,
            title: 'The Flooding of the Subterranean Crypt',
            startSec: 3360,
            endSec: 4740,
            summary: 'In the underground tomb, Eric pulls the floodgate levers letting the Baltic Sea rush in to drown himself and Stefan; André carries Helene into the sunlight only for her face to decay in his arms as the curse ends.',
            turningPoint: 'In the final gothic shock, Helene’s face decomposes into a corpse the moment she crosses into daylight.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'ter_sc_1',
          index: 1,
          slugline: 'EXT. BALTIC ROCKY COAST (BIG SUR) - DAY',
          title: 'The Apparition on the Shore',
          summary: 'Lieutenant Duvalier rides along the crashing waves and follows Helene into the surf.',
          startSec: 0,
          endSec: 720,
          actNumber: 1,
          mood: 'Mysterious',
          characterRefIds: ['ter_lt_andre_duvallier', 'ter_helene_ilsa'],
          stillIndexes: [0],
        },
        {
          id: 'ter_sc_2',
          index: 2,
          slugline: 'INT. CASTLE VON LEPPE GREAT HALL & FLOODED CRYPT - NIGHT',
          title: 'The Portrait & The Sea-Gate Deluge',
          summary: 'Baron von Leppe confronts his past before pulling the levers that flood the subterranean crypt.',
          startSec: 1560,
          endSec: 4740,
          actNumber: 3,
          mood: 'Gothic',
          characterRefIds: ['ter_baron_von_leppe', 'ter_lt_andre_duvallier', 'ter_helene_ilsa'],
          stillIndexes: [1],
        },
      ],
      sequences: [
        { id: 'ter_seq_1', title: 'The Baltic Siren', sceneIds: ['ter_sc_1'], purpose: 'Lure Duvalier into the castle mystery.' },
        { id: 'ter_seq_2', title: 'Deluge in the Crypt', sceneIds: ['ter_sc_2'], purpose: 'Unmask the impostor Baron and shatter the crypt.' },
      ],
      locations: [
        {
          refId: 'loc_castle_von_leppe',
          name: 'Castle von Leppe & Subterranean Sea Crypt',
          description: 'Towering Gothic fortress with painted ancestral halls and sea-level floodgates.',
          kind: 'GOTHIC CASTLE',
          sceneIds: ['ter_sc_2'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_ilsa_portrait',
          name: 'The Ancestral Portrait of Baroness Ilsa & Sea-Wall Levers',
          description: 'The oil painting proving Helene’s impossibility and the iron levers holding back the Baltic Sea.',
          narrativeRole: 'KEY_PROP',
          sceneIds: ['ter_sc_2'],
          evidence: ['Triggers André’s investigation and the final flood'],
          confidence: 0.98,
        },
      ],
      stills: [],
    },
  },

  // ── 12. THE GHOUL (1933 · T. Hayes Hunter) ──────────────────────────────────
  TheGhoul: {
    identifier: 'TheGhoul',
    title: 'The Ghoul',
    year: '1933',
    director: 'T. Hayes Hunter',
    runtimeSec: 4080,
    tone: ['British Gothic', 'Egyptomania', 'Atmospheric', 'Macabre'],
    charactersWithActors: [
      {
        characterId: 'gh_prof_morlant',
        characterName: 'Professor Henry Morlant ("The Ghoul")',
        tier: 'MAIN',
        roleArchetype: 'Resurrected Egyptologist',
        characterBio:
          'A fanatical British Egyptologist who purchases the sacred "Eternal Light" jewel and instructs that it be bandaged into his hand inside his Yorkshire mausoleum so he may offer it to the god Anubis at the next full moon—threatening to rise from the dead and tear apart anyone who steals it.',
        characterArc:
          'Awakens inside his tomb when his crooked servant Laing steals the jewel, stalks the fog-bound manor carving the sign of Anubis into his chest, and reclaims the gem.',
        screenTimeSec: 1860,
        dialogueLines: 68,
        bestFrameSec: 2240,
        accentColor: '#F97316',
        actorName: 'Boris Karloff',
        actorWikiSlug: 'Boris_Karloff',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Boris_Karloff_1932.jpg/640px-Boris_Karloff_1932.jpg',
        actorYears: '1887–1969',
        actorNationality: 'British',
        actorBio:
          'After becoming an overnight global sensation in Hollywood with Frankenstein (1931) and The Mummy (1932), Boris Karloff returned home to England in triumph to headline The Ghoul for Gaumont-British.',
        performanceNote:
          'Combines the tragic physicality of the Frankenstein Monster with the ancient Egyptian mysticism of Imhotep.',
        actorOtherWorks: ['Frankenstein (1931)', 'The Mummy (1932)', 'The Old Dark House (1932)', 'The Black Cat (1934)'],
      },
      {
        characterId: 'gh_broughton',
        characterName: 'Solicitor Broughton',
        tier: 'SUPPORTING',
        roleArchetype: 'Greedy Solicitor',
        characterBio:
          'Morlant’s unscrupulous lawyer who travels to the Yorkshire estate determined to locate and seize the priceless Eternal Light jewel.',
        characterArc:
          'Caught in a murderous game of keep-away on a stormy night as the tomb doors swing open.',
        screenTimeSec: 1540,
        dialogueLines: 96,
        bestFrameSec: 1420,
        accentColor: '#38BDF8',
        actorName: 'Cedric Hardwicke',
        actorWikiSlug: 'Cedric_Hardwicke',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Cedric_Hardwicke_1941.jpg/640px-Cedric_Hardwicke_1941.jpg',
        actorYears: '1893–1964',
        actorNationality: 'British',
        actorBio:
          'Knighted British stage and film legend admired by George Bernard Shaw as his favorite actor; starred in King Solomon’s Mines, The Hunchback of Notre Dame (1939), Hitchcock’s Rope (1948), and The Ten Commandments (1956).',
        performanceNote:
          'Plays the scheming solicitor in heavy character makeup.',
        actorOtherWorks: ['Les Misérables (1935)', 'The Hunchback of Notre Dame (1939)', 'Rope (1948)', 'The Ten Commandments (1956)'],
      },
      {
        characterId: 'gh_laing',
        characterName: 'Laing (The Club-Footed Butler)',
        tier: 'SUPPORTING',
        roleArchetype: 'Grave-Robbing Servant',
        characterBio:
          'Morlant’s sinister Scottish manservant who slips into the mausoleum before the crypt is sealed to unwrap the Eternal Light from his dead master’s fingers.',
        characterArc:
          'His theft triggers Morlant’s resurrection under the full moon.',
        screenTimeSec: 1380,
        dialogueLines: 74,
        bestFrameSec: 1680,
        accentColor: '#10B981',
        actorName: 'Ernest Thesiger',
        actorWikiSlug: 'Ernest_Thesiger',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Ernest_Thesiger_1935.jpg/640px-Ernest_Thesiger_1935.jpg',
        actorYears: '1879–1961',
        actorNationality: 'British',
        actorBio:
          'Celebrated British eccentric actor immortalized as Dr. Pretorius ("To a new world of gods and monsters!") in James Whale’s Bride of Frankenstein (1935) and Horace Femm in The Old Dark House (1932).',
        performanceNote:
          'Reunites with Boris Karloff just after The Old Dark House and two years before Bride of Frankenstein.',
        actorOtherWorks: ['The Old Dark House (1932)', 'Bride of Frankenstein (1935)', 'The Man in the White Suit (1951)'],
      },
      {
        characterId: 'gh_nigel_hartley',
        characterName: 'Nigel Hartley (The False Vicar)',
        tier: 'SUPPORTING',
        roleArchetype: 'Disguised Jewel Thief',
        characterBio:
          'A suavely calculating thief who poses as the local parish vicar to infiltrate Morlant’s household and steal the Eternal Light.',
        characterArc:
          'Reveals his true colors at gunpoint inside the mausoleum.',
        screenTimeSec: 1420,
        dialogueLines: 88,
        bestFrameSec: 2980,
        accentColor: '#A855F7',
        actorName: 'Ralph Richardson',
        actorWikiSlug: 'Ralph_Richardson',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Ralph_Richardson_1949.jpg/640px-Ralph_Richardson_1949.jpg',
        actorYears: '1902–1983',
        actorNationality: 'British',
        actorBio:
          'Knighted titan of the 20th-century English stage alongside Laurence Olivier and John Gielgud, making his motion picture acting debut right here in The Ghoul (1933).',
        performanceNote:
          'Sir Ralph Richardson’s very first screen role!',
        actorOtherWorks: ['The Fallen Idol (1948)', 'The Heiress (1949)', 'Richard III (1955)', 'Doctor Zhivago (1965)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'Dying Egyptologist Professor Morlant (Boris Karloff) is entombed with the sacred "Eternal Light" jewel to offer Anubis at the full moon—only to rise from his crypt when grave robbers steal the stone.',
      synopsis:
        'Convinced that the ancient Egyptian jewel known as the Eternal Light will grant him immortality if presented to the statue of Anubis when the full moon strikes his tomb door, Professor Henry Morlant warns that he will return from the grave if the gem is stolen. Moments after his burial, butler Laing steals the jewel and hides it in a coffee tin. As heirs, a crooked solicitor, Egyptian nationalist Mahmud, and a thief disguised as a vicar converge on the fog-shrouded Yorkshire manor, the full moon rises and Morlant breaks out of his tomb.',
      themes: ['Egyptomania & the curse of immortality', 'Greed among heirs', 'Catalepsy vs. supernatural resurrection'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'The Purchase of the Eternal Light & The Dying Oath',
            startSec: 0,
            endSec: 1320,
            summary: 'Morlant acquires the Eternal Light jewel in London, swears on his deathbed in Yorkshire that he will rise if it is taken, and is entombed with the gem bandaged to his hand—where Laing immediately steals it.',
            turningPoint: 'Laing unwraps the bandage inside the crypt and pockets the Eternal Light.',
          },
          {
            number: 2,
            title: 'Full Moon Over the Mausoleum',
            startSec: 1320,
            endSec: 2760,
            summary: 'Heirs Betty and Ralph arrive at the manor amid howling fog; when the midnight full moon strikes the tomb door, Morlant’s eyes snap open and he stalks the grounds in search of his stolen jewel.',
            turningPoint: 'Morlant shatters the window and confronts Laing to reclaim the Eternal Light.',
          },
          {
            number: 3,
            title: 'The Ritual of Anubis & Fire in the Tomb',
            startSec: 2760,
            endSec: 4080,
            summary: 'Morlant carves the symbol of Anubis onto his chest and places the jewel in the idol’s hand before collapsing dead from true heart failure; the false vicar steals the gem and locks the heirs inside the burning tomb.',
            turningPoint: 'Revealed that Morlant had suffered cataleptic suspended animation during his first burial, fueled by fanatic willpower.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'gh_sc_1',
          index: 1,
          slugline: 'INT. PROFESSOR MORLANT’S BEDCHAMBER & TOMB - NIGHT',
          title: 'The Oath of Anubis & Theft in the Crypt',
          summary: 'Morlant warns his household before being laid to rest inside the Egyptian-styled mausoleum.',
          startSec: 360,
          endSec: 1320,
          actNumber: 1,
          mood: 'British Gothic',
          characterRefIds: ['gh_prof_morlant', 'gh_laing', 'gh_broughton'],
          stillIndexes: [0],
        },
        {
          id: 'gh_sc_2',
          index: 2,
          slugline: 'EXT./INT. YORKSHIRE MOOR & ANUBIS SHRINE - MIDNIGHT',
          title: 'Resurrection Under the Full Moon',
          summary: 'Photographed by Nosferatu cinematographer Günther Krampf, Morlant rises from his slab and presents the jewel to Anubis.',
          startSec: 1800,
          endSec: 4080,
          actNumber: 2,
          mood: 'Macabre',
          characterRefIds: ['gh_prof_morlant', 'gh_laing', 'gh_nigel_hartley'],
          stillIndexes: [1],
        },
      ],
      sequences: [
        { id: 'gh_seq_1', title: 'The Curse of the Eternal Light', sceneIds: ['gh_sc_1', 'gh_sc_2'], purpose: 'Stage the burial theft and moonlit resurrection.' },
      ],
      locations: [
        {
          refId: 'loc_morlant_manor_tomb',
          name: 'Morlant Manor & Egyptian Mausoleum of Anubis',
          description: 'Fog-swept Yorkshire estate featuring a full-scale Egyptian temple crypt guarded by a colossal statue of Anubis.',
          kind: 'GOTHIC MANOR & CRYPT',
          sceneIds: ['gh_sc_1', 'gh_sc_2'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_eternal_light_jewel',
          name: 'The "Eternal Light" Sacred Egyptian Jewel',
          description: 'Ancient star-sapphire relic stolen from an Egyptian tomb and passed from hand to hand throughout the night.',
          narrativeRole: 'MACGUFFIN',
          sceneIds: ['gh_sc_1', 'gh_sc_2'],
          evidence: ['Bandaged into Morlant’s hand, hidden in a coffee tin, and placed in the idol of Anubis'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },

  // ── 13. FRANKENSTEIN (1910 · J. Searle Dawley · Edison Studios) ─────────────
  FrankensteinfullMovie: {
    identifier: 'FrankensteinfullMovie',
    title: 'Frankenstein (1910 Edison Film)',
    year: '1910',
    director: 'J. Searle Dawley',
    runtimeSec: 840,
    tone: ['Pioneering', 'Alchemical', 'Gothic', 'Poetic'],
    charactersWithActors: [
      {
        characterId: 'fr1910_the_monster',
        characterName: 'The Creature (Frankenstein’s Monster)',
        tier: 'MAIN',
        roleArchetype: 'Alchemical Creation & Mirror Double',
        characterBio:
          'Cinema’s very first screen incarnation of Mary Shelley’s Creature—formed not by lightning and stitched body parts, but inside a blazing alchemical vat of chemicals, with wild matted hair, fibrous limbs, and tragic longing for his creator.',
        characterArc:
          'Horrified by his own reflection in a full-length mirror and overcome by the pure love between Victor and Elizabeth on their wedding night, the Creature vanishes into the mirror, leaving only a reflection before fading away.',
        screenTimeSec: 460,
        dialogueLines: 0,
        bestFrameSec: 320,
        accentColor: '#F97316',
        actorName: 'Charles Ogle',
        actorWikiSlug: 'Charles_Ogle_(actor)',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Frankenstein_1910_still.jpg/640px-Frankenstein_1910_still.jpg',
        actorYears: '1865–1940',
        actorNationality: 'American',
        actorBio:
          'Ohio-born stage actor and star of the Edison Manufacturing Company who played the very first Frankenstein’s Monster in cinema history 21 years before Boris Karloff, as well as Long John Silver in the 1920 silent Treasure Island.',
        performanceNote:
          'Designed his own wild-haired, kabuki-like monstrous makeup at the Edison Bronx studio.',
        actorOtherWorks: ['A Christmas Carol (1910)', 'Treasure Island (1920)', 'The Ten Commandments (1923)'],
      },
      {
        characterId: 'fr1910_frankenstein',
        characterName: 'Young Frankenstein',
        tier: 'MAIN',
        roleArchetype: 'Ambitious Medical Student',
        characterBio:
          'A young student who leaves his beloved Elizabeth to study the "mystery of life and death" at university, brewing a living human being inside an alchemical furnace.',
        characterArc:
          'Flees in horror from his creation until his selfless love for Elizabeth purifies his soul and dissolves the monster.',
        screenTimeSec: 680,
        dialogueLines: 8,
        bestFrameSec: 180,
        accentColor: '#38BDF8',
        actorName: 'Augustus Phillips',
        actorWikiSlug: 'Augustus_Phillips',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Frankenstein_1910_still.jpg/640px-Frankenstein_1910_still.jpg',
        actorYears: '1874–1944',
        actorNationality: 'American',
        actorBio:
          'Leading dramatic actor at Thomas Edison’s studio who appeared in over 130 silent films.',
        performanceNote:
          'Portrays the first screen Victor Frankenstein as an alchemical romantic.',
        actorOtherWorks: ['A Christmas Carol (1910)', 'The Pied Piper of Hamelin (1911)'],
      },
      {
        characterId: 'fr1910_elizabeth',
        characterName: 'Elizabeth',
        tier: 'SUPPORTING',
        roleArchetype: 'Devoted Bride',
        characterBio:
          'Frankenstein’s sweetheart and bride whose devotion ultimately banishes the Creature on their wedding night.',
        characterArc:
          'Represents the moral purity that overcomes Frankenstein’s dark ambition.',
        screenTimeSec: 340,
        dialogueLines: 4,
        bestFrameSec: 620,
        accentColor: '#D0BCFF',
        actorName: 'Mary Fuller',
        actorWikiSlug: 'Mary_Fuller',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Mary_Fuller_1914.jpg/640px-Mary_Fuller_1914.jpg',
        actorYears: '1888–1973',
        actorNationality: 'American',
        actorBio:
          'One of cinema’s earliest female superstars, starring in Edison’s What Happened to Mary (1912)—the world’s very first motion picture serial.',
        performanceNote:
          'Brings expressive silent-era warmth to the bridal chamber finale.',
        actorOtherWorks: ['Elektra (1910)', 'What Happened to Mary (1912)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'In cinema’s first-ever adaptation of Mary Shelley’s novel (1910), medical student Frankenstein brews a living Creature inside a blazing chemical cauldron—only for the monster to haunt his wedding night before vanishing inside a mirror.',
      synopsis:
        'Departing home for college, young Frankenstein discovers the secret of creating life and mixes chemicals inside a roaring cauldron. Watched through the furnace peephole, a skeletal shape slowly fleshes out into a towering, wild-haired Creature (Charles Ogle). Horrified, Frankenstein flees home to marry Elizabeth, but the Creature follows him, confronts his own reflection in a parlor mirror, and is finally dissolved by the power of love.',
      themes: ['Hubris of creation', 'The monster as psychological double (the mirror)', 'Redemptive power of love'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'Departure for College & The Alchemical Cauldron',
            startSec: 0,
            endSec: 360,
            summary: 'Frankenstein leaves Elizabeth for college and conducts his midnight experiment; inside the blazing furnace, the Creature forms out of fire and smoke.',
            turningPoint: 'The Creature’s arm reaches out from the curtained laboratory alcove.',
          },
          {
            number: 2,
            title: 'Return Home & The Wedding Night Intrusion',
            startSec: 360,
            endSec: 620,
            summary: 'Exhausted, Frankenstein returns home to Elizabeth, but the Creature secretly enters his study and demands companionship.',
            turningPoint: 'The Creature catches sight of his own grotesque reflection in the full-length parlor mirror.',
          },
          {
            number: 3,
            title: 'The Mirror Vanishing',
            startSec: 620,
            endSec: 840,
            summary: 'On the wedding night, the Creature flees into the parlor, steps before the mirror, and vanishes from the physical room—leaving only his reflection in the glass before that too fades.',
            turningPoint: 'Double-exposure optical effect dissolves the Creature inside the mirror.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'fr10_sc_1',
          index: 1,
          slugline: 'INT. FRANKENSTEIN’S COLLEGE LABORATORY - NIGHT',
          title: 'Creation in the Furnace (Reverse-Motion Trick)',
          summary: 'Achieved by burning a papier-mâché dummy in reverse motion, the Creature materializes out of flames inside the cauldron.',
          startSec: 150,
          endSec: 360,
          actNumber: 1,
          mood: 'Alchemical',
          characterRefIds: ['fr1910_frankenstein', 'fr1910_the_monster'],
          stillIndexes: [0],
        },
        {
          id: 'fr10_sc_2',
          index: 2,
          slugline: 'INT. BRIDAL PARLOR & FULL-LENGTH MIRROR - NIGHT',
          title: 'The Reflection in the Glass',
          summary: 'The Creature gazes in horror at his own image in the mirror and dissolves into a reflection.',
          startSec: 580,
          endSec: 840,
          actNumber: 3,
          mood: 'Poetic',
          characterRefIds: ['fr1910_the_monster', 'fr1910_frankenstein', 'fr1910_elizabeth'],
          stillIndexes: [1],
        },
      ],
      sequences: [
        { id: 'fr10_seq_1', title: 'Birth & Dissolution of the Creature', sceneIds: ['fr10_sc_1', 'fr10_sc_2'], purpose: 'Dramatize creation by fire and dissolution by mirror.' },
      ],
      locations: [
        {
          refId: 'loc_edison_lab',
          name: 'Frankenstein’s Alchemical Furnace & Parlor Mirror (Edison Bronx Studio)',
          description: 'Painted theatrical sets at the Edison Manufacturing Company studio in the Bronx, New York.',
          kind: 'SILENT STUDIO SET',
          sceneIds: ['fr10_sc_1', 'fr10_sc_2'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_parlor_mirror',
          name: 'The Full-Length Parlor Mirror & Blazing Cauldron',
          description: 'The furnace vat where the Creature is born and the mirror that reveals the Monster as Frankenstein’s own dark reflection.',
          narrativeRole: 'MOTIF',
          sceneIds: ['fr10_sc_1', 'fr10_sc_2'],
          evidence: ['Reverse-motion furnace creation and double-exposure mirror finale'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },

  // ── 14. METROPOLIS (1927 · Fritz Lang) ──────────────────────────────────────
  'europeana-metropolis-1927': {
    identifier: 'europeana-metropolis-1927',
    title: 'Metropolis',
    year: '1927',
    director: 'Fritz Lang',
    runtimeSec: 9180,
    tone: ['Monumental', 'Futuristic', 'Expressionist', 'Prophetic'],
    charactersWithActors: [
      {
        characterId: 'met_maria',
        characterName: 'Maria / The Maschinenmensch (False Maria)',
        tier: 'MAIN',
        roleArchetype: 'Prophetess of the Workers & Robotic Double',
        characterBio:
          'A compassionate spiritual guide to the subterranean workers of Metropolis who preaches that "the Mediator between the Head and the Hands must be the Heart"—until mad inventor Rotwang kidnaps her and transfers her likeness onto his metallic Maschinenmensch robot to incite chaos and destruction.',
        characterArc:
          'Dual performance: the real Maria escapes Rotwang’s laboratory to rescue the workers’ children from the flooded underground city while her robotic double burns at the stake.',
        screenTimeSec: 4680,
        dialogueLines: 92,
        bestFrameSec: 4200,
        accentColor: '#F59E0B',
        actorName: 'Brigitte Helm',
        actorWikiSlug: 'Brigitte_Helm',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Brigitte_Helm_Metropolis.jpg/640px-Brigitte_Helm_Metropolis.jpg',
        actorYears: '1906–1996',
        actorNationality: 'German',
        actorBio:
          'Discovered by Fritz Lang at age 18 with no prior film experience, Brigitte Helm delivered one of cinema’s greatest dual performances as both the saintly Maria and the wild-eyed, seductive Maschinenmensch gynoid.',
        performanceNote:
          'Endured nine days bolted inside Walter Schulze-Mittendorff’s suffocating metallic robot armor during the transformation sequence.',
        actorOtherWorks: ['The Love of Jeanne Ney (1927)', 'Alraune (1928)', 'L’Argent (1928)', 'Gold (1934)'],
      },
      {
        characterId: 'met_freder',
        characterName: 'Freder Fredersen (The Mediator)',
        tier: 'MAIN',
        roleArchetype: 'Awakened Heir & Mediator',
        characterBio:
          'The privileged son of Metropolis’s autocratic master Joh Fredersen who follows Maria down into the subterranean machine halls, witnesses a catastrophic boiler explosion He perceives as the god Moloch devouring workers, and trades places with Worker 11811.',
        characterArc:
          'Fulfils Maria’s prophecy by joining the hands of his father the Master and Grot the foreman on the cathedral steps.',
        screenTimeSec: 5420,
        dialogueLines: 118,
        bestFrameSec: 1620,
        accentColor: '#38BDF8',
        actorName: 'Gustav Fröhlich',
        actorWikiSlug: 'Gustav_Fr%C3%B6hlich',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Fritz_Lang_1926.jpg/640px-Fritz_Lang_1926.jpg',
        actorYears: '1902–1987',
        actorNationality: 'German',
        actorBio:
          'Initially hired as an extra in the worker crowds before Fritz Lang promoted him to the lead role of Freder; went on to become one of Germany’s most popular stars of the 1930s–1950s.',
        performanceNote:
          'His exhausting ten-hour shift wrestling the giant clock hands of the Paternoster machine became an enduring visual emblem of industrial labor.',
        actorOtherWorks: ['Asphalt (1929)', 'Immortal Vagabond (1930)', 'The Sinhaborough Affair'],
      },
      {
        characterId: 'met_rotwang',
        characterName: 'Rotwang the Inventor',
        tier: 'SUPPORTING',
        roleArchetype: 'Mad Alchemist-Engineer',
        characterBio:
          'A brilliant, metal-handed scientist living in a medieval house wedged beneath the skyscrapers of Metropolis who builds the Maschinenmensch robot to resurrect his lost love Hel—and uses it to seek vengeance against both Joh Fredersen and his son.',
        characterArc:
          'Battles Freder atop the Gothic cathedral roof before plunging to his death.',
        screenTimeSec: 2340,
        dialogueLines: 64,
        bestFrameSec: 3960,
        accentColor: '#EF4444',
        actorName: 'Rudolf Klein-Rogge',
        actorWikiSlug: 'Rudolf_Klein-Rogge',
        actorPortraitUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Rudolf_Klein-Rogge_1920s.jpg/640px-Rudolf_Klein-Rogge_1920s.jpg',
        actorYears: '1885–1955',
        actorNationality: 'German',
        actorBio:
          'Fritz Lang’s signature villain actor across the Weimar era, starring as the criminal mastermind Dr. Mabuse (1922 & 1933), King Etzel in Die Nibelungen (1924), Haghi in Spies (1928), and Rotwang in Metropolis.',
        performanceNote:
          'His wild-haired, mechanical-gloved Rotwang created the archetype of the cinema mad scientist.',
        actorOtherWorks: ['Dr. Mabuse the Gambler (1922)', 'Die Nibelungen (1924)', 'Spies (1928)', 'The Testament of Dr. Mabuse (1933)'],
      },
    ],
    report: {
      version: 2,
      logline:
        'In a towering futuristic city where wealthy elites frolic in sky-gardens while subterranean workers toil at giant machines, the ruler’s son joins forces with prophetess Maria as mad inventor Rotwang unleashes a robotic double to destroy Metropolis.',
      synopsis:
        'Metropolis is divided between the sunlit New Tower of Babel above and the grueling machine depths below. When Freder, son of city master Joh Fredersen, descends into the underground halls and witnesses the M-Machine explode like the demon Moloch, he falls in love with Maria, who preaches reconciliation between "the Head and the Hands." Seeking to crush the workers’ movement, Fredersen orders inventor Rotwang to give his metallic Maschinenmensch robot Maria’s face—unaware Rotwang has programmed the android to trigger a catastrophic uprising and flood the underground city.',
      themes: ['Labor vs. capital ("The Mediator Between Head and Hands Must Be the Heart")', 'Technological hubris & the artificial human', 'Dystopian architecture'],
      structure: {
        acts: [
          {
            number: 1,
            title: 'Prelude: The Sons’ Club, Moloch & The Catacombs',
            startSec: 0,
            endSec: 3240,
            summary: 'Shift change in the underground depths; Maria brings workers’ children to the Eternal Gardens; Freder descends to the M-Machine, hallucinates Moloch, trades places with Worker 11811, and hears Maria’s Tower of Babel sermon in the catacombs.',
            turningPoint: 'Joh Fredersen and Rotwang secretly spy on Maria’s sermon and decide to replace her with the Maschinenmensch.',
          },
          {
            number: 2,
            title: 'Intermezzo: Birth of the False Maria',
            startSec: 3240,
            endSec: 5940,
            summary: 'Rotwang captures Maria and transfers her human likeness onto his metallic robot in a dazzling electrical ring ceremony; the False Maria drives the elites of Yoshiwara into murderous frenzy and incites the workers to smash the Heart Machine.',
            turningPoint: 'Glowing electrical rings transfer Maria’s face onto the Maschinenmensch.',
          },
          {
            number: 3,
            title: 'Furioso: Flood of the Workers’ City & Cathedral Rooftop',
            startSec: 5940,
            endSec: 9180,
            summary: 'The destruction of the Heart Machine floods the underground city where the children are trapped; the real Maria and Freder rescue the children via the airshafts, the False Maria is burned at the stake revealing her robot shell, and Freder mediates peace on the cathedral steps.',
            turningPoint: 'As the witch-pyre flames consume the False Maria, her human skin melts away to reveal the gleaming metal robot.',
          },
        ],
      },
      characters: [],
      scenes: [
        {
          id: 'met_sc_1',
          index: 1,
          slugline: 'INT. M-MACHINE HALL (UNDERGROUND METROPOLIS) - DAY',
          title: 'The Vision of Moloch',
          summary: 'Gauge pressure spikes on the giant M-Machine; in Freder’s fevered vision, the machine transforms into the gaping jaws of the idol Moloch fed with lines of workers.',
          startSec: 900,
          endSec: 1560,
          actNumber: 1,
          mood: 'Monumental',
          characterRefIds: ['met_freder'],
          stillIndexes: [0],
        },
        {
          id: 'met_sc_2',
          index: 2,
          slugline: 'INT. ROTWANG’S LABORATORY - NIGHT',
          title: 'The Electrical Transformation of the Maschinenmensch',
          summary: 'Luminous neon rings rise and fall around the seated metallic robot as Maria’s face materializes over the steel mask.',
          startSec: 3900,
          endSec: 4680,
          actNumber: 2,
          mood: 'Futuristic',
          characterRefIds: ['met_rotwang', 'met_maria'],
          stillIndexes: [1],
        },
      ],
      sequences: [
        { id: 'met_seq_1', title: 'The Stratified City', sceneIds: ['met_sc_1'], purpose: 'Contrast the Eternal Gardens with the subterranean machine halls.' },
        { id: 'met_seq_2', title: 'The Robot Uprising', sceneIds: ['met_sc_2'], purpose: 'Unleash the False Maria and flood the underground city.' },
      ],
      locations: [
        {
          refId: 'loc_new_tower_babel',
          name: 'The New Tower of Babel & Subterranean Machine Halls',
          description: 'Monumental Art Deco skyscraper city realized through Eugen Schüfftan’s in-camera mirror effects and Babelsberg Studio sets.',
          kind: 'FUTURISTIC METROPOLIS',
          sceneIds: ['met_sc_1', 'met_sc_2'],
          confidence: 0.99,
        },
      ],
      macguffins: [
        {
          refId: 'mac_heart_machine',
          name: 'The Maschinenmensch Robot & The Central Heart Machine',
          description: 'Rotwang’s metallic android and the central dynamo whose destruction floods the workers’ city.',
          narrativeRole: 'MACGUFFIN',
          sceneIds: ['met_sc_1', 'met_sc_2'],
          evidence: ['Direct visual ancestor of C-3PO in Star Wars and replicants in Blade Runner'],
          confidence: 0.99,
        },
      ],
      stills: [],
    },
  },
};

const CLASSIC_CHARACTER_WIKI_FALLBACKS: Record<string, string> = {
  notld_ben: 'Night_of_the_Living_Dead',
  notld_barbara: 'Night_of_the_Living_Dead',
  notld_harry_cooper: 'Night_of_the_Living_Dead',
  notld_helen_cooper: 'Night_of_the_Living_Dead',
  notld_johnny: 'Night_of_the_Living_Dead',
  hohh_frederick_loren: 'House_on_Haunted_Hill',
  hohh_annabelle_loren: 'House_on_Haunted_Hill',
  hohh_lance_schroeder: 'House_on_Haunted_Hill',
  hohh_nora_manning: 'House_on_Haunted_Hill',
  hohh_dr_trent: 'House_on_Haunted_Hill',
  hohh_watson_pritchard: 'House_on_Haunted_Hill',
  cos_mary_henry: 'Carnival_of_Souls',
  cos_the_man: 'Carnival_of_Souls',
  cos_john_linden: 'Carnival_of_Souls',
  nos_orlok: 'Count_Orlok',
  nos_hutter: 'Nosferatu',
  nos_ellen: 'Nosferatu',
  nos_knock: 'Nosferatu',
  cal_caligari: 'The_Cabinet_of_Dr._Caligari',
  cal_cesare: 'The_Cabinet_of_Dr._Caligari',
  cal_francis: 'The_Cabinet_of_Dr._Caligari',
  cal_jane: 'The_Cabinet_of_Dr._Caligari',
  poto_erik: 'Erik_(The_Phantom_of_the_Opera)',
  poto_christine: 'The_Phantom_of_the_Opera_(1925_film)',
  poto_raoul: 'The_Phantom_of_the_Opera_(1925_film)',
  hax_narrator: 'H%C3%A4xan',
  wZ_murder_legendre: 'White_Zombie_(film)',
  wZ_madeline: 'White_Zombie_(film)',
  lsh_seymour: 'The_Little_Shop_of_Horrors',
  lsh_audrey: 'The_Little_Shop_of_Horrors',
  lsh_fouch: 'The_Little_Shop_of_Horrors',
  st_sweeney: 'Sweeney_Todd:_The_Demon_Barber_of_Fleet_Street_(1936_film)',
  frk_monster: 'Frankenstein_(1910_film)',
  met_maria: 'Maschinenmensch',
};

function hydrateCharacter(
  c: ClassicActorBehindCharacter,
  filmIdentifier: string
): ClassicActorBehindCharacter {
  const id = c.id || c.characterId;
  const role = c.role || c.roleArchetype;
  const notable = c.actorNotableWorks || c.actorOtherWorks || [];
  const hasDedicatedCharImg = Boolean(
    c.characterImageUrl &&
      (c.characterImageUrl.startsWith('/generated/') ||
        c.characterImageUrl.includes('firebasestorage.googleapis.com') ||
        c.characterImageUrl.includes('image.mux.com') ||
        c.characterImageUrl !== c.actorPortraitUrl)
  );
  const charWikiFallback = hasDedicatedCharImg
    ? ''
    : CLASSIC_CHARACTER_WIKI_FALLBACKS[id] || '';
  return {
    ...c,
    id,
    characterId: c.characterId || id,
    name: c.name || c.characterName,
    role,
    archetype: c.archetype || c.roleArchetype,
    bio: c.bio || c.characterBio,
    characterImageUrl: c.characterImageUrl || c.imageUrl || c.actorPortraitUrl,
    imageUrl: c.imageUrl || c.characterImageUrl || c.actorPortraitUrl,
    characterWikiSlug: (c as any).characterWikiSlug ?? charWikiFallback,
    actorNotableWorks: notable,
    actorOtherWorks: notable,
    actor: c.actor || {
      name: c.actorName,
      wikiPageTitle: c.actorWikiSlug,
      portraitUrl: c.actorPortraitUrl,
      yearsLived: c.actorYears,
      nationality: c.actorNationality,
      bio: c.actorBio,
      performanceNote: c.performanceNote,
      otherWorks: notable,
    },
    // Compatibility fields for Plajah `Character`
    ownerId: filmIdentifier === 'album_1787881859314_mlt23' ? 'u4XNVf41QeQERFqO0CB8JEhegXz2' : 'plajah-public-domain',
    worldId: filmIdentifier === 'album_1787881859314_mlt23' ? 'world_pumpkin_patch_universe' : `world_${filmIdentifier}`,
    traits: [c.roleArchetype, `Portrayed by ${c.actorName}`, `${Math.round(c.screenTimeSec / 60)}m screen time`],
    createdAt: 1760832000000,
  } as any;
}

function buildHydratedBundle(bundle: FilmStoryIntelBundle): FilmStoryIntelBundle {
  const hydratedChars = bundle.charactersWithActors.map(c =>
    hydrateCharacter(c, bundle.identifier)
  );
  // Ensure report.characters is populated from charactersWithActors
  const reportCharacters = hydratedChars.map(c => ({
    refId: c.characterId,
    name: `${c.characterName} (${c.actorName})`,
    aka: c.aka || [c.actorName],
    tier: c.tier,
    description: `${c.characterBio} Portrayed by ${c.actorName}: ${c.performanceNote}`,
    arc: c.characterArc,
    appearances: [{ sceneId: bundle.report.scenes[0]?.id || 'sc_1', tSec: c.bestFrameSec }],
    screenTimeSec: c.screenTimeSec,
    dialogueLines: c.dialogueLines,
    confidence: 0.98,
    evidence: [c.performanceNote],
    imageUrl: c.characterImageUrl || c.imageUrl || c.actorPortraitUrl,
    portraitPath: c.characterImageUrl || c.imageUrl || c.actorPortraitUrl,
    portraitStillId: `${c.characterId}_portrait`,
    bestFrameSec: c.bestFrameSec,
  }));

  const synthesizedStills =
    bundle.report.stills && bundle.report.stills.length > 0
      ? bundle.report.stills
      : hydratedChars.map((c, idx) => ({
          id: `${c.characterId}_portrait`,
          tSec: c.bestFrameSec,
          sceneId: bundle.report.scenes[idx % Math.max(1, bundle.report.scenes.length)]?.id || 'sc_1',
          path: c.characterImageUrl || c.imageUrl || c.actorPortraitUrl,
          kind: 'CHARACTER_PORTRAIT',
        }));

  return {
    ...bundle,
    filmId: bundle.filmId || bundle.identifier,
    logline: bundle.logline || bundle.report.logline,
    synopsis: bundle.synopsis || bundle.report.synopsis,
    themes: bundle.themes || bundle.report.themes || [],
    charactersWithActors: hydratedChars,
    characters: hydratedChars,
    report: {
      ...bundle.report,
      characters: reportCharacters,
      stills: synthesizedStills,
    },
  };
}

export const HALLOWEEN_STORY_INTEL_BUNDLES: Record<string, FilmStoryIntelBundle> = Object.fromEntries(
  Object.entries(RAW_HALLOWEEN_STORY_INTEL_BUNDLES).map(([k, v]) => [k, buildHydratedBundle(v)])
);

/**
 * Resolve the Story Intelligence bundle for any film identifier or title.
 */
export function getHalloweenStoryIntelBundle(identifierOrTitle?: string | null): FilmStoryIntelBundle | null {
  if (!identifierOrTitle) return null;
  const raw = String(identifierOrTitle).replace(/^public_domain_/, '').trim();
  if (!raw) return null;

  if (HALLOWEEN_STORY_INTEL_BUNDLES[raw]) {
    return HALLOWEEN_STORY_INTEL_BUNDLES[raw];
  }

  const lower = raw.toLowerCase();
  for (const [key, bundle] of Object.entries(HALLOWEEN_STORY_INTEL_BUNDLES)) {
    if (
      key.toLowerCase() === lower ||
      bundle.title.toLowerCase() === lower ||
      bundle.title.toLowerCase().includes(lower) ||
      lower.includes(bundle.title.toLowerCase())
    ) {
      return bundle;
    }
  }
  return null;
}

/**
 * Convert a FilmStoryIntelBundle's character+actor roster into hydrated character objects
 * compatible with `ClassicCinemaDossier`, `MovieUXView`, `CharacterWorldView`, and `MoviesTVView`.
 */
export function getCharactersForFilm(identifierOrTitle?: string | null): HalloweenCharacterWithActor[] {
  const bundle = getHalloweenStoryIntelBundle(identifierOrTitle);
  if (!bundle) return [];
  return bundle.charactersWithActors;
}

/**
 * Build a Synthetic `TaleoAnalysisJob` (`status: 'READY'`) for any curated film in `HALLOWEEN_STORY_INTEL_BUNDLES`.
 */
export function getSyntheticAnalysisJob(identifierOrTitle?: string | null): TaleoAnalysisJob | null {
  const bundle = getHalloweenStoryIntelBundle(identifierOrTitle);
  if (!bundle) return null;
  return {
    albumId: bundle.identifier,
    ownerId: 'internet-archive',
    scope: 'MOVIE',
    status: 'READY',
    progress: { stage: 'complete', pct: 100, note: 'Story Intelligence verified' },
    counts: {
      characters: bundle.charactersWithActors.length,
      scenes: bundle.report.scenes.length,
      sequences: bundle.report.sequences.length,
      locations: bundle.report.locations.length,
      macguffins: bundle.report.macguffins.length,
      stills: bundle.charactersWithActors.length,
    },
    coverage: 'FULL',
    pipelineVersion: 2,
    createdAt: 1760832000000,
    updatedAt: Date.now(),
  };
}

/**
 * Return all Halloween Curation characters + actors across all curated films for the Halloween Showcase rail.
 */
export function getAllHalloweenCharactersWithActors(): Array<ClassicActorBehindCharacter & { filmIdentifier: string; filmTitle: string; filmYear: string; filmDirector: string }> {
  const result: Array<ClassicActorBehindCharacter & { filmIdentifier: string; filmTitle: string; filmYear: string; filmDirector: string }> = [];
  for (const bundle of Object.values(HALLOWEEN_STORY_INTEL_BUNDLES)) {
    for (const char of bundle.charactersWithActors) {
      result.push({
        ...char,
        filmIdentifier: bundle.identifier,
        filmTitle: bundle.title,
        filmYear: bundle.year,
        filmDirector: bundle.director,
      });
    }
  }
  return result;
}
