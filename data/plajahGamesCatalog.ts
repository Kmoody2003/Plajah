import type { GameId as KithGameId } from '../components/kithParty/catalog';
import type { AnyLiveKind } from '../services/liveGames/client';

export type PlajahGameCategory =
  | 'ERA_CLASH'
  | 'ADVENTURE_3D'
  | 'KITH_PARTY'
  | 'PARLOR_BOARD_WORD';

export type PlajahLaunchAction =
  | { type: 'era-clash-2d' }
  | { type: 'era-clash-3d' }
  | { type: 'ravencrest' }
  | { type: 'kith-party'; gameId: KithGameId }
  | { type: 'cyber-ttt' }
  | { type: 'live-game'; kind: AnyLiveKind };

export interface CommercialScene {
  headline: string;
  subline: string;
  callout: string;
  imageUrl?: string;
  accentColor: string;
  canvasMode?: 'kart' | 'crystals' | 'rhythm' | 'tennis' | 'kombat' | 'quest' | 'ttt' | 'sketch' | 'trivia' | 'crowd' | 'impostor' | 'fighter' | 'campaign3d' | 'ravencrest';
}

export interface PlajahGameEntry {
  id: string;
  title: string;
  subtitle: string;
  category: PlajahGameCategory;
  categoryLabel: string;
  badge: string;
  engine: string;
  playersLabel: string;
  duration: string;
  accentGradient: string;
  accentColor: string;
  thumbnailUrl: string;
  screenshots: { url: string; caption: string }[];
  description: string;
  longDescription: string;
  features: string[];
  controls: string[];
  commercial: {
    tagline: string;
    durationSec: number;
    musicVibe: string;
    scenes: CommercialScene[];
  };
  achievementTriggers: string[];
  synergy: {
    inviteFriend: boolean;
    liveStream: boolean;
    postToFeed: boolean;
    choraProjectId?: string;
    combatAtlas?: boolean;
    cinemaVault?: boolean;
  };
  launch: PlajahLaunchAction;
  directUrl?: string;
  /** No real gameplay capture yet: the Games page draws a glyph cover instead of a stand-in image. */
  capturePending?: boolean;
  coverGlyph?: string;
  /** Captured gameplay commercial (MP4/WebM). Until it exists the page shows the animated scene spot. */
  commercialVideoUrl?: string;
}

export const PLAJAH_GAMES_CATALOG: PlajahGameEntry[] = [
  // ── ERA CLASH: 2D FIGHTING MODE ───────────────────────────────────────────
  {
    id: 'era-clash-2d',
    title: 'Era Clash: 2D Arcade Fighter',
    subtitle: 'Six warriors across six historical ages · Frame-tight 2D combat',
    category: 'ERA_CLASH',
    categoryLabel: '2D Fighting Mode',
    badge: 'Plajah Original · 2D',
    engine: 'HTML5 Canvas + WebRTC Netplay',
    playersLabel: '1–2 Players (Local & Online Duel)',
    duration: 'Best of 3 Rounds',
    accentGradient: 'from-amber-500/30 via-rose-600/25 to-stone-950',
    accentColor: '#f59e0b',
    thumbnailUrl: '/games/screens/era-clash-2d-ko.jpg',
    screenshots: [
      { url: '/games/screens/era-clash-2d-ko.jpg', caption: 'Colosseum · Maximus lands the K.O. on Haru' },
      { url: '/games/screens/era-clash-2d-fight.jpg', caption: 'Colosseum · Haru vs Maximus, Renewal relic active' },
      { url: '/games/screens/era-clash-2d-select.jpg', caption: 'Choose your warrior · six ages, six fighting styles' },
      { url: '/games/screens/era-clash-2d-menu.jpg', caption: 'Title screen · Single Player, Versus, Online Duel, Campaign' },
    ],
    description: 'Six warriors from six ages clash in fast 2D arcade combat — Story Mode, vs CPU, 2-player local, or WebRTC online duels.',
    longDescription: 'Era Clash 2D brings crisp frame-driven martial arts combat to the Plajah Arcade. Master parries, guard breaks, era-specific specials, and momentum meters across 15+ historical arenas—from Kyoto bamboo courtyards to the Colosseum. Every arena features an original Chora Studio soundtrack and direct links to the Combat Atlas.',
    features: [
      '6+ historical warriors with distinct movesets & super arts',
      'Online WebRTC peer-to-peer duels & local 2P shared keyboard',
      'Direct Chora Studio soundtrack project integration per arena',
      'Verified Plajah Gamer Ledger achievements & XP',
    ],
    controls: [
      'Move / Jump / Crouch: Arrow Keys or WASD',
      'Light / Heavy / Special: J / K / L (or Z / X / C)',
      'Block / Parry: Hold Back or Space',
    ],
    commercial: {
      tagline: 'SIX ERAS. ONE ARENA. ZERO MERCY.',
      durationSec: 12,
      musicVibe: 'Taiko & Shamisen Battle Cadence',
      scenes: [
        {
          headline: 'SIX WARRIORS ACROSS TIME',
          subline: 'Samurai · Viking · Knight · Jaguar · Shaolin · Gladiator',
          callout: 'CAPTURED 2D GAMEPLAY',
          imageUrl: '/games/screens/era-clash-2d-ko.jpg',
          accentColor: '#f59e0b',
          canvasMode: 'fighter',
        },
        {
          headline: 'FRAME-TIGHT PARRIES & SUPERS',
          subline: 'Punish openings and unleash Era Overdrives',
          callout: '60 FPS ARCADE COMBAT',
          imageUrl: '/games/screens/era-clash-2d-fight.jpg',
          accentColor: '#ef4444',
          canvasMode: 'fighter',
        },
        {
          headline: 'DUEL FRIENDS ONLINE OR COUCH',
          subline: 'WebRTC netplay + Plajah Gamer Score ranked',
          callout: 'PLAY NOW ON PLAJAH',
          imageUrl: '/games/screens/era-clash-2d-select.jpg',
          accentColor: '#fbbf24',
          canvasMode: 'fighter',
        },
      ],
    },
    achievementTriggers: ['ERACLASH_FIRST_WIN', 'ERACLASH_PERFECT_VICTORY', 'ERACLASH_TALE_COMPLETE'],
    synergy: {
      inviteFriend: true,
      liveStream: true,
      postToFeed: true,
      choraProjectId: 'eraclash-japan',
      combatAtlas: true,
    },
    launch: { type: 'era-clash-2d' },
    directUrl: '/games/era-clash/index.html',
  },

  // ── ERA CLASH: 3D CAMPAIGN MODE ───────────────────────────────────────────
  {
    id: 'era-clash-3d',
    title: 'Era Clash: Tales of the Ages (3D)',
    subtitle: 'Full 3D Action-Adventure Campaign · WebGPU / Three.js',
    category: 'ERA_CLASH',
    categoryLabel: '3D Campaign Mode',
    badge: '3D Campaign · Live',
    engine: 'Three.js WebGPU / TSL',
    playersLabel: '1 Player Story Campaign',
    duration: 'Multi-Chapter Saga',
    accentGradient: 'from-amber-600/35 via-orange-900/30 to-stone-950',
    accentColor: '#fb923c',
    thumbnailUrl: '/games/era-clash/3d/screenshots/ch1_hilltop.jpg',
    screenshots: [
      { url: '/games/era-clash/3d/screenshots/ch1_hilltop.jpg', caption: 'Chapter 1 · Hilltop Stronghold Overlook' },
      { url: '/games/era-clash/3d/screenshots/ch1_fight.jpg', caption: '3D Melee Combat · Raiders on the Road' },
      { url: '/games/era-clash/3d/screenshots/arch2_street.jpg', caption: 'Walled Market Town · Era Architecture' },
      { url: '/games/era-clash/3d/screenshots/c1_haru.jpg', caption: 'Haru · Playable 3D Warrior Rig' },
    ],
    description: 'Step into the 3D world of Era Clash. Traverse forest roads, market towns, and castle hills in a third-person historical action campaign.',
    longDescription: 'Tales of the Ages 3D transforms the Era Clash universe into an expansive third-person 3D action campaign. Built on Plajah’s custom Three.js WebGPU & BVH engine, battle waves of raiders alongside allies, explore living townsfolk markets, and unlock historical lore chapters.',
    features: [
      'Full 3D third-person sword & martial combat with ally squads',
      'Hand-crafted historical settlements, canals, and forest roads',
      'Cinematic story cards, wave encounters, and custom keybind editor',
      'Scored by Chora Studio’s orchestral & period ensembles',
    ],
    controls: [
      'Move: WASD · Camera: Mouse / Right Stick',
      'Light / Heavy Strike: Left Click / Right Click (or J / K)',
      'Dodge / Parry / Special: Space / Shift / E',
    ],
    commercial: {
      tagline: 'WALK THE ROAD OF LEGENDS IN FULL 3D.',
      durationSec: 12,
      musicVibe: 'Epic Orchestral & Taiko Campaign',
      scenes: [
        {
          headline: 'ENTER THE 3D CAMPAIGN',
          subline: 'Forest roads, hilltop keeps, and living market towns',
          callout: 'CAPTURED 3D GAMEPLAY',
          imageUrl: '/games/era-clash/3d/screenshots/ch1_hilltop.jpg',
          accentColor: '#fb923c',
          canvasMode: 'campaign3d',
        },
        {
          headline: 'REAL-TIME 3D SQUAD COMBAT',
          subline: 'Chain combos, build momentum, and command allies',
          callout: 'WEBGPU 3D ENGINE',
          imageUrl: '/games/era-clash/3d/screenshots/ch1_fight.jpg',
          accentColor: '#ef4444',
          canvasMode: 'campaign3d',
        },
        {
          headline: 'FORGED FOR PLAJAH',
          subline: 'Full-screen 3D adventure straight in your browser',
          callout: 'PLAY CAMPAIGN NOW',
          imageUrl: '/games/era-clash/3d/screenshots/arch2_street.jpg',
          accentColor: '#f59e0b',
          canvasMode: 'campaign3d',
        },
      ],
    },
    achievementTriggers: ['ERACLASH_TALE_COMPLETE', 'ERACLASH_FIRST_WIN'],
    synergy: {
      inviteFriend: true,
      liveStream: true,
      postToFeed: true,
      choraProjectId: 'eraclash-title',
      combatAtlas: true,
    },
    launch: { type: 'era-clash-3d' },
    directUrl: '/games/era-clash/3d/play/index.html',
  },

  // ── RAVENCREST (CURRENT LIVE BUILD) ───────────────────────────────────────
  {
    id: 'ravencrest',
    title: 'Ravencrest',
    subtitle: 'Gothic 3D Horror-Adventure · Current Live Build',
    category: 'ADVENTURE_3D',
    categoryLabel: '3D Gothic Adventure',
    badge: 'Current Build · WebGPU',
    engine: 'Three.js WebGPU + FSR1 / Ultra',
    playersLabel: '1 Player + VR / XR Support',
    duration: 'Full Estate & Bosses',
    accentGradient: 'from-purple-700/35 via-rose-900/30 to-black',
    accentColor: '#c084fc',
    thumbnailUrl: '/games/ravencrest/screenshots/viaduct_view_v1.png',
    screenshots: [
      { url: '/games/ravencrest/screenshots/viaduct_view_v1.png', caption: 'The Haunted Viaduct · Bridge Troll Encounter' },
      { url: '/games/ravencrest/screenshots/yard_v4.png', caption: 'Ravencrest Courtyard · Moonlit Approach' },
      { url: '/games/ravencrest/screenshots/terrace_view_v2.png', caption: 'Castle Terrace & Gargoyle Overlook' },
      { url: '/games/ravencrest/screenshots/wing2_banquet.png', caption: 'Grand Banquet Hall · Dracula’s Domain' },
    ],
    description: 'Explore the cursed Ravencrest estate in full 3D. Confront the Bridge Troll, survive the Nightmare, and break Dracula’s curse.',
    longDescription: 'Ravencrest is Plajah’s flagship 3D gothic action-adventure, featuring dynamic WebGPU rendering (720p FSR1 baseline in browsers and Ultra tier on Plajah Desktop), full-body VRM/GLB cast performances, and direct integration with Plajah’s Classic Cinema Vault.',
    features: [
      'Explore the Viaduct, Courtyard, Banquet Hall, Cinema & Library',
      'Boss encounters: Bridge Troll, Werewolf, Dracula & Curse Breaker',
      'Interactive paintings & billboards that launch Classic Cinema films',
      'WebGPU + WebXR spatial mode + Plajah Achievement Ledger',
    ],
    controls: [
      'Move: WASD · Sprint: Shift · Jump: Space',
      'Interact / Watch Film Painting: E · Attack / Banish: Left Click',
      'Pause / Quality / Exit to Plajah: Esc or P',
    ],
    commercial: {
      tagline: 'THE VIADUCT CALLS. BREAK THE CURSE OF RAVENCREST.',
      durationSec: 12,
      musicVibe: 'Gothic Organ & Haunted Strings',
      scenes: [
        {
          headline: 'CROSS THE CURSED VIADUCT',
          subline: 'Face the Bridge Troll in moonlit WebGPU 3D',
          callout: 'CURRENT LIVE BUILD',
          imageUrl: '/games/ravencrest/screenshots/viaduct_view_v1.png',
          accentColor: '#c084fc',
          canvasMode: 'ravencrest',
        },
        {
          headline: 'ENTER THE GRAND ESTATE',
          subline: 'Courtyards, banquet halls, and living portraits',
          callout: 'CAPTURED 3D GAMEPLAY',
          imageUrl: '/games/ravencrest/screenshots/wing2_banquet.png',
          accentColor: '#f43f5e',
          canvasMode: 'ravencrest',
        },
        {
          headline: 'CINEMA MEETS GAMEPLAY',
          subline: 'Unlock Troll Slayer, Dracula Slain & Curse Breaker',
          callout: 'PLAY RAVENCREST NOW',
          imageUrl: '/games/ravencrest/screenshots/yard_v4.png',
          accentColor: '#a855f7',
          canvasMode: 'ravencrest',
        },
      ],
    },
    achievementTriggers: ['RAVENCREST_TROLL_SLAYER', 'RAVENCREST_DRACULA_SLAIN', 'RAVENCREST_CURSE_BREAKER'],
    synergy: {
      inviteFriend: true,
      liveStream: true,
      postToFeed: true,
      cinemaVault: true,
    },
    launch: { type: 'ravencrest' },
    directUrl: '/games/ravencrest/play/index.html',
  },

  // ── KITH PARTY GAMES (6 GAMES) ────────────────────────────────────────────
  {
    id: 'kith-circuit',
    title: 'Kith Racing',
    subtitle: '3D Kart Racing across 6 wild worlds · Drift boosts & Kith Specials',
    category: 'KITH_PARTY',
    categoryLabel: 'Kith Party · 3D Racing',
    badge: '3D Kart Racing',
    engine: 'Three.js 3D Physics',
    playersLabel: '1–2 Local Players + Bots',
    duration: '3 Laps / Sprint',
    accentGradient: 'from-lime-500/25 via-emerald-800/25 to-slate-950',
    accentColor: '#84cc16',
    thumbnailUrl: '/games/screens/kith-racing-tunnel.jpg',
    screenshots: [
      { url: '/games/screens/kith-racing-tunnel.jpg', caption: 'Crestfall Gardens · ring tunnel at 142 km/h' },
      { url: '/games/screens/kith-racing-crestfall.jpg', caption: 'Crestfall Gardens · guardian banners and afterburner' },
      { url: '/games/screens/kith-racing-sprint.jpg', caption: 'Crestfall Gardens · final sprint to the line' },
    ],
    description: 'Six wild 3D courses with jumps, 360° loops, tunnels, bridges, item boxes, 3-tier drift boosts, and Kith Type Specials.',
    longDescription: 'Tear through Prism Parkway, Crestfall Gardens, and Amazonian loops with real kart physics, launch torque, glider segments, and twist-kicker aerial stunts. Powered by Lyria AI note-driven music.',
    features: [
      '6 3D circuits & point-to-point sprint worlds',
      '3-tier drift mini-turbos, rocket starts & glider flight',
      '10 playable Kith characters with unique Type Specials',
      'Local 2-player split-screen + Party Cup tournament mode',
    ],
    controls: [
      'Steer: ← → · Gas: ↑ · Brake/Reverse: ↓',
      'Hop & Drift: Space · Fire Item: Enter · Kith Special: Right Shift',
    ],
    commercial: {
      tagline: 'TRIPLE-TIER DRIFT. 360° LOOPS. PURE KITH CHAOS.',
      durationSec: 10,
      musicVibe: 'Lyria AI High-BPM Kart Synth',
      scenes: [
        {
          headline: '6 WILD 3D RACING WORLDS',
          subline: 'Loops, gliders, shortcuts & rocket starts',
          callout: 'CAPTURED KITH GAMEPLAY',
          accentColor: '#84cc16',
          canvasMode: 'kart',
        },
        {
          headline: 'UNLEASH KITH TYPE SPECIALS',
          subline: 'Charge your meter and blast past the pack',
          callout: '1–2 PLAYERS · PARTY CUP',
          accentColor: '#f97316',
          canvasMode: 'kart',
        },
      ],
    },
    achievementTriggers: [],
    synergy: { inviteFriend: true, liveStream: true, postToFeed: true },
    launch: { type: 'kith-party', gameId: 'circuit' },
  },
  {
    id: 'kith-tennis',
    title: 'Kith Tennis',
    subtitle: '3D Singles & Doubles on 6 scenic courts',
    category: 'KITH_PARTY',
    categoryLabel: 'Kith Party · 3D Sports',
    badge: '3D Tennis',
    engine: 'Three.js 3D Court Engine',
    playersLabel: '1–2 Local Players',
    duration: 'Quick Match / Set',
    accentGradient: 'from-sky-500/25 via-cyan-800/25 to-slate-950',
    accentColor: '#38bdf8',
    thumbnailUrl: '/games/screens/kith-tennis-rally.jpg',
    screenshots: [
      { url: '/games/screens/kith-tennis-rally.jpg', caption: 'Crestfall Garden Court · rally from the baseline' },
      { url: '/games/screens/kith-tennis-serve.jpg', caption: 'Crestfall Garden Court · serve to open the set' },
    ],
    description: 'Singles or doubles on six 3D courts: grass, clay, ice, neon, and basalt. Charge shots, smashes, dives, and Kith Specials.',
    longDescription: 'Real tennis scoring (deuce, tie-breaks, sets) meets arcade Kith energy. Time your toss serve at the apex, charge topspins or slices, and trigger your Kith Special when the rally heats up.',
    features: [
      '6 3D courts with distinct surface physics (Grass, Clay, Ice, Neon, Basalt)',
      'Topspin, Slice, Lob, Drop Shot & Diving Saves',
      'Singles or Doubles with real tennis scoring',
    ],
    controls: [
      'Move: Arrow Keys (P2: WASD)',
      'Topspin: Space · Slice: Enter · Lob: Left Shift · Special: Right Shift',
    ],
    commercial: {
      tagline: 'SERVE. SMASH. DOMINATE SIX 3D COURTS.',
      durationSec: 10,
      musicVibe: 'Upbeat Court Rally Synth',
      scenes: [
        {
          headline: 'SIX 3D COURTS & SURFACES',
          subline: 'From Neon Night Courts to Frozen Glaciers',
          callout: '3D SPORTS GAMEPLAY',
          accentColor: '#38bdf8',
          canvasMode: 'tennis',
        },
        {
          headline: 'CHARGE SHOTS & KITH SPECIALS',
          subline: 'Singles or doubles on one screen',
          callout: 'PLAY KITH TENNIS NOW',
          accentColor: '#22d3ee',
          canvasMode: 'tennis',
        },
      ],
    },
    achievementTriggers: [],
    synergy: { inviteFriend: true, liveStream: true, postToFeed: true },
    launch: { type: 'kith-party', gameId: 'tennis' },
  },
  {
    id: 'kith-kombat',
    title: 'Kart Kombat',
    subtitle: '8-Kart Battle Royale inside a closing storm',
    category: 'KITH_PARTY',
    categoryLabel: 'Kith Party · Battle Royale',
    badge: 'Battle Royale',
    engine: 'Kith Arena Engine',
    playersLabel: '1–2 Players vs AI Pack',
    duration: '3:30 Max',
    accentGradient: 'from-rose-500/30 via-red-900/25 to-slate-950',
    accentColor: '#f43f5e',
    thumbnailUrl: '/games/screens/kart-kombat-arena.jpg',
    screenshots: [
      { url: '/games/screens/kart-kombat-arena.jpg', caption: 'Kombat arena · item crate and the closing storm' },
      { url: '/games/screens/kart-kombat-ramp.jpg', caption: 'Kombat arena · ramp line with three lives left' },
    ],
    description: 'Eight karts, one arena, a closing storm. Loot crates, blast rivals with items and Type Specials, and be the last kart rolling.',
    longDescription: 'Drop into the arena with 3 lives each. Race for gold crates in the center, dodge the shrinking storm ring, and outlast 7 rival karts in high-speed vehicular mayhem.',
    features: [
      '8-kart arena battle royale with shrinking storm circle',
      'Gold center crates with high-tier powerups',
      '3-life survival or KO score victory',
    ],
    controls: [
      'Drive: Arrow Keys (P2: WASD) · Drift: Space / F',
      'Fire Item: Enter / G · Kith Special: Right Shift / H',
    ],
    commercial: {
      tagline: 'EIGHT KARTS ENTER. ONE KART LEAVES.',
      durationSec: 10,
      musicVibe: 'High-Octane Arena Bass',
      scenes: [
        {
          headline: 'LOOT CRATES. DODGE THE STORM.',
          subline: '8-kart vehicular battle royale',
          callout: 'BATTLE ROYALE',
          accentColor: '#f43f5e',
          canvasMode: 'kombat',
        },
        {
          headline: 'BLAST RIVALS WITH SPECIALS',
          subline: 'Three lives. Last kart rolling wins.',
          callout: 'PLAY KART KOMBAT',
          accentColor: '#fb7185',
          canvasMode: 'kombat',
        },
      ],
    },
    achievementTriggers: [],
    synergy: { inviteFriend: true, liveStream: true, postToFeed: true },
    launch: { type: 'kith-party', gameId: 'kombat' },
  },
  {
    id: 'kith-crystals',
    title: 'Crystal Scramble',
    subtitle: '60-second arena dash for sparkling crystals',
    category: 'KITH_PARTY',
    categoryLabel: 'Kith Party · Arena',
    badge: 'Party Arena',
    engine: 'Kith Party 2D/3D',
    playersLabel: '1–2 Local Players',
    duration: '60 Seconds',
    accentGradient: 'from-violet-500/25 via-fuchsia-800/25 to-slate-950',
    accentColor: '#d946ef',
    thumbnailUrl: '/games/screens/crystal-scramble-field.jpg',
    screenshots: [
      { url: '/games/screens/crystal-scramble-field.jpg', caption: 'The Sparkle Commons · crystals and crates' },
      { url: '/games/screens/crystal-scramble-chase.jpg', caption: 'The Sparkle Commons · stealing the lead' },
    ],
    description: 'A pocketful of sparkle. A field full of friendly chaos. Dash to snatch glowing crystals and dodge roaming bumpers.',
    longDescription: 'Pure 60-second arcade adrenaline. Time your invulnerable dash through roaming orange bumpers, steal crystal clusters before rivals, and rack up the highest haul.',
    features: [
      'Fast 60-second party rounds',
      'Invulnerable dash mechanic to outplay bumpers',
      'Shared-screen 2-player local competition',
    ],
    controls: [
      'Move: Arrow Keys · Dash (Protects from bumpers): Space',
    ],
    commercial: {
      tagline: '60 SECONDS. ONE ARENA. GRAB EVERY CRYSTAL.',
      durationSec: 9,
      musicVibe: 'Sparkling Arcade Chiptune',
      scenes: [
        {
          headline: 'DASH THROUGH THE CHAOS',
          subline: 'Snatch glowing crystals in 60-second sprints',
          callout: 'PARTY ARENA',
          accentColor: '#d946ef',
          canvasMode: 'crystals',
        },
      ],
    },
    achievementTriggers: [],
    synergy: { inviteFriend: true, liveStream: true, postToFeed: true },
    launch: { type: 'kith-party', gameId: 'crystals' },
  },
  {
    id: 'kith-rhythm',
    title: 'Chora’s Beat Garden',
    subtitle: '4-lane flower rhythm party powered by Chora tracks',
    category: 'KITH_PARTY',
    categoryLabel: 'Kith Party · Rhythm',
    badge: 'Rhythm Party',
    engine: 'Chora Beat Sync',
    playersLabel: '1–2 Local Players',
    duration: '45 Seconds / Song',
    accentGradient: 'from-pink-500/25 via-orange-700/25 to-slate-950',
    accentColor: '#f472b6',
    thumbnailUrl: '/games/screens/beat-garden-lanes.jpg',
    screenshots: [
      { url: '/games/screens/beat-garden-lanes.jpg', caption: 'Glowmoss Gallop · 138 BPM flower lanes' },
      { url: '/games/screens/beat-garden-groove.jpg', caption: 'Glowmoss Gallop · Chora keeps the beat' },
    ],
    description: 'Follow the flowers. Find your groove. Make a little noise in Chora’s 4-lane rhythm garden.',
    longDescription: 'Built around Plajah’s Chora music engine, hit the 4 beat lanes as flowers bloom into their target rings. Play solo or head-to-head on one keyboard.',
    features: [
      'Multiple Chora-composed songs & difficulty tiers',
      '1-player and 2-player simultaneous rhythm lanes',
      'Combo multipliers for Perfect timing',
    ],
    controls: [
      'Player 1: Keys 1 2 3 4 (or Arrow Keys / WASD)',
      'Player 2: Keys 7 8 9 0',
    ],
    commercial: {
      tagline: 'FOLLOW THE FLOWERS. RIDE THE CHORA GROOVE.',
      durationSec: 9,
      musicVibe: 'Chora Garden Groove',
      scenes: [
        {
          headline: 'SYNC TO CHORA’S BEAT',
          subline: '4-lane rhythm battles on one keyboard',
          callout: 'RHYTHM PARTY',
          accentColor: '#f472b6',
          canvasMode: 'rhythm',
        },
      ],
    },
    achievementTriggers: [],
    synergy: { inviteFriend: true, liveStream: true, postToFeed: true },
    launch: { type: 'kith-party', gameId: 'rhythm' },
  },
  {
    id: 'kith-quest',
    title: 'Kith Quest',
    subtitle: 'Hand-built 2D Action Platformer · 3 Stages + Hollow Warden Boss',
    category: 'KITH_PARTY',
    categoryLabel: 'Kith Party · Platformer',
    badge: '2D Platformer',
    engine: 'Custom 2D Physics & Sim',
    playersLabel: '1 Player Adventure',
    duration: '3 Stages + Boss',
    accentGradient: 'from-indigo-500/25 via-blue-800/25 to-slate-950',
    accentColor: '#60a5fa',
    thumbnailUrl: '/games/screens/kith-quest-forest.jpg',
    screenshots: [
      { url: '/games/screens/kith-quest-forest.jpg', caption: 'Glowmoss Hollow · lantern forest' },
      { url: '/games/screens/kith-quest-run.jpg', caption: 'Glowmoss Hollow · first gap and the brick row' },
    ],
    description: 'Run, roll, glide, wall-jump and bash across three hand-built stages, then face the Hollow Warden at the top of Lanternkeep.',
    longDescription: 'A tight, responsive 2D action-platformer starring the Kith crew. Collect all three Star Seeds per stage, chain wall-jumps and air-glides, and defeat the Hollow Warden.',
    features: [
      '3 hand-built platforming stages + multi-phase boss fight',
      'Glide, dash-bash, roll, and sub-weapon combat',
      'Hidden Star Seeds & speedrun scoring',
    ],
    controls: [
      'Move: Arrows / WASD · Jump / Glide: Space',
      'Lash: X · Dash/Bash: Shift · Roll: ↓ · Sub-weapon: C',
    ],
    commercial: {
      tagline: 'RUN. GLIDE. CONQUER LANTERNKEEP.',
      durationSec: 10,
      musicVibe: 'Quest Chiptune & Orchestral Synth',
      scenes: [
        {
          headline: 'CLIMB TO LANTERNKEEP',
          subline: 'Wall-jump, glide & bash through 3 stages',
          callout: '2D ACTION PLATFORMER',
          accentColor: '#60a5fa',
          canvasMode: 'quest',
        },
      ],
    },
    achievementTriggers: [],
    synergy: { inviteFriend: false, liveStream: true, postToFeed: true },
    launch: { type: 'kith-party', gameId: 'quest' },
  },

  // ── PARLOR, BOARD & WORD GAMES (5 GAMES) ──────────────────────────────────
  {
    id: 'cyber-ttt',
    coverGlyph: '✕ ◯',
    title: 'Cyber Tic Tac Toe',
    subtitle: 'Neon Parlor & Board Strategy · Ranked ELO & Verified Ledger',
    category: 'PARLOR_BOARD_WORD',
    categoryLabel: 'Parlor & Board Game',
    badge: 'Ranked · Ledger Verified',
    engine: 'Plajah GamerNet Rules Engine',
    playersLabel: 'vs CPU · 2P Local · Online Ranked',
    duration: '1–3 Min Matches',
    accentGradient: 'from-cyan-500/25 via-fuchsia-600/20 to-slate-950',
    accentColor: '#22d3ee',
    thumbnailUrl: '/games/screens/cyber-ttt-win.jpg',
    screenshots: [
      { url: '/games/screens/cyber-ttt-win.jpg', caption: 'Three in a row on the neon grid · the CPU takes the round' },
      { url: '/games/screens/cyber-ttt-draw.jpg', caption: 'Grid locked · scoreboard tracks wins, draws and losses' },
    ],
    description: 'Classic parlor board strategy supercharged with neon aesthetics, smart CPU AI, same-device 2P, and server-refereed online ranked matches.',
    longDescription: 'Cyber Tic Tac Toe is the flagship parlor board game on Plajah’s decentralized Gamer Network. Every online match is refereed server-side and recorded onto your cryptographic Gamer Ledger, moving your ELO rating and unlocking Plajah Achievements.',
    features: [
      'Server-refereed online ranked matchmaking & ELO rating',
      'Instant Playable Card posting right into the Plajah Social Feed',
      'Direct friend challenges from profiles, chats, or game pages',
      'vs CPU and 2-player same-device couch mode',
    ],
    controls: [
      'Click or Tap any open cell on the 3×3 neon grid',
      '45-second per-move clock in online ranked matches',
    ],
    commercial: {
      tagline: 'EVERY MOVE REFEREED. EVERY WIN ON THE LEDGER.',
      durationSec: 9,
      musicVibe: 'Neon Synthwave Parlor',
      scenes: [
        {
          headline: 'RANKED PARLOR STRATEGY',
          subline: 'Play vs CPU, 2P on one device, or Ranked Online',
          callout: 'GAMER LEDGER VERIFIED',
          accentColor: '#22d3ee',
          canvasMode: 'ttt',
        },
        {
          headline: 'CHALLENGE ANYONE ON PLAJAH',
          subline: 'Drop playable boards straight into your social feed',
          callout: 'PLAY CYBER TTT NOW',
          accentColor: '#e879f9',
          canvasMode: 'ttt',
        },
      ],
    },
    achievementTriggers: ['ttt.first-win', 'ttt.streak-3', 'ttt.wins-10', 'ttt.rating-1400'],
    synergy: { inviteFriend: true, liveStream: true, postToFeed: true },
    launch: { type: 'cyber-ttt' },
  },
  {
    id: 'sketch-rush',
    coverGlyph: '✎',
    title: 'Sketch Rush',
    subtitle: 'Live Drawing & Word-Guessing Party · Streamed to Your Feed',
    category: 'PARLOR_BOARD_WORD',
    categoryLabel: 'Drawing & Word Game',
    badge: 'Live Stream Party',
    engine: 'Plajah LiveGames Canvas',
    playersLabel: '1 Host + Unlimited Audience',
    duration: '5–10 Min Rooms',
    accentGradient: 'from-pink-500/25 via-violet-700/25 to-slate-950',
    accentColor: '#ec4899',
    thumbnailUrl: '/games/screens/sketch-rush-guess.jpg',
    screenshots: [
      { url: '/games/screens/sketch-rush-guess.jpg', caption: 'Live drawing streams to every phone · guesses roll in' },
      { url: '/games/screens/sketch-rush-draw.jpg', caption: 'Hints reveal letters as the clock runs down' },
    ],
    description: 'Go live and draw! Your audience guesses the secret word from the stream or right inside their Plajah feed for Gamer Score.',
    longDescription: 'Sketch Rush turns your live stream into an interactive parlor party. Draw on the studio canvas while viewers type guesses in real time—faster guesses earn more points on the Plajah Gamer Ledger.',
    features: [
      'Burns the live drawing board directly into your video stream',
      'Audience joins straight from the Plajah feed—no extra app needed',
      'Earns verified Live Game points toward your Plajah Gamer Score',
    ],
    controls: [
      'Host: Draw with mouse, pen, or touch; pick brush size & color',
      'Players: Type word guesses in the live room or feed card',
    ],
    commercial: {
      tagline: 'YOU DRAW. THE FEED GUESSES. GO LIVE IN SECONDS.',
      durationSec: 9,
      musicVibe: 'Playful Studio Groove',
      scenes: [
        {
          headline: 'DRAW LIVE ON STREAM',
          subline: 'Your audience plays directly from their feed',
          callout: 'LIVE WORD & SKETCH PARTY',
          accentColor: '#ec4899',
          canvasMode: 'sketch',
        },
      ],
    },
    achievementTriggers: [],
    synergy: { inviteFriend: true, liveStream: true, postToFeed: true },
    launch: { type: 'live-game', kind: 'sketch' },
  },
  {
    id: 'brain-rush',
    coverGlyph: '?',
    title: 'Brain Rush',
    subtitle: 'Rapid-Fire Live Trivia Parlor · Speed & Accuracy Win',
    category: 'PARLOR_BOARD_WORD',
    categoryLabel: 'Parlor Trivia Game',
    badge: 'Live Trivia',
    engine: 'Plajah LiveParty Engine',
    playersLabel: '1 Host + Room / Feed Crowd',
    duration: '5–20 Rounds',
    accentGradient: 'from-sky-500/25 via-indigo-800/25 to-slate-950',
    accentColor: '#0ea5e9',
    thumbnailUrl: '/games/screens/brain-rush-question.jpg',
    screenshots: [
      { url: '/games/screens/brain-rush-question.jpg', caption: 'Rapid-fire trivia played right from the feed' },
      { url: '/games/screens/brain-rush-reveal.jpg', caption: 'Ten questions a round · right and fast wins' },
    ],
    description: 'Rapid-fire trivia for your stream or friend group. Right and fast wins the round and climbs the live room leaderboard.',
    longDescription: 'Host a trivia night in seconds. Pick a question pack, set round timers (8–20s), post to your feed or go live on video, and watch scores update live.',
    features: [
      'Curated question packs with configurable rounds & timers',
      'Feed-native join + live video overlay mode',
      'Verified Gamer Score payouts for top finishers',
    ],
    controls: [
      'Tap or click the right answer before the round clock hits zero',
    ],
    commercial: {
      tagline: 'THINK FAST. LOCK IN. OWN THE LEADERBOARD.',
      durationSec: 9,
      musicVibe: 'Game Show Countdown Pulse',
      scenes: [
        {
          headline: 'RAPID-FIRE TRIVIA NIGHT',
          subline: 'Host for friends or your entire live audience',
          callout: 'LIVE TRIVIA PARLOR',
          accentColor: '#0ea5e9',
          canvasMode: 'trivia',
        },
      ],
    },
    achievementTriggers: [],
    synergy: { inviteFriend: true, liveStream: true, postToFeed: true },
    launch: { type: 'live-game', kind: 'trivia' },
  },
  {
    id: 'crowd-says',
    coverGlyph: '#1',
    title: 'Crowd Says',
    subtitle: 'Word & Survey Party · The Room Makes the Board',
    category: 'PARLOR_BOARD_WORD',
    categoryLabel: 'Word & Survey Parlor',
    badge: 'Word Party',
    engine: 'Plajah LiveParty Engine',
    playersLabel: '3+ Players / Live Room',
    duration: '3–10 Rounds',
    accentGradient: 'from-amber-500/25 via-orange-800/25 to-slate-950',
    accentColor: '#f59e0b',
    thumbnailUrl: '/games/screens/crowd-says-board.jpg',
    screenshots: [
      { url: '/games/screens/crowd-says-board.jpg', caption: 'The crowd’s top answers, ranked live' },
      { url: '/games/screens/crowd-says-answer.jpg', caption: 'Lock in what you think most people said' },
    ],
    description: 'Answer like the crowd! Every player submits a word or phrase—the room’s own answers build the scoring board.',
    longDescription: 'A modern parlor word game where the audience IS the survey. Type the answer you think everyone else will say; matching answers cluster together for massive points.',
    features: [
      'Dynamic word-clustering board built from live player answers',
      'Zero sign-up friction for feed & stream participants',
      'Custom round count & answer timers',
    ],
    controls: [
      'Type your best crowd-pleasing word or phrase before time expires',
    ],
    commercial: {
      tagline: 'READ THE ROOM. MATCH THE CROWD. WIN THE BOARD.',
      durationSec: 9,
      musicVibe: 'Funky Parlor Brass',
      scenes: [
        {
          headline: 'THE ROOM MAKES THE BOARD',
          subline: 'Match the crowd’s words to sweep the round',
          callout: 'WORD & SURVEY PARTY',
          accentColor: '#f59e0b',
          canvasMode: 'crowd',
        },
      ],
    },
    achievementTriggers: [],
    synergy: { inviteFriend: true, liveStream: true, postToFeed: true },
    launch: { type: 'live-game', kind: 'crowd' },
  },
  {
    id: 'impostor-night',
    coverGlyph: '◐',
    title: 'Impostor Night',
    subtitle: 'Social Deduction Word Game · Clue, Bluff, Vote',
    category: 'PARLOR_BOARD_WORD',
    categoryLabel: 'Word Deduction Parlor',
    badge: 'Social Deduction',
    engine: 'Plajah LiveParty Engine',
    playersLabel: '4+ Players / Live Stream',
    duration: '2–8 Rounds',
    accentGradient: 'from-emerald-500/25 via-teal-900/25 to-slate-950',
    accentColor: '#10b981',
    thumbnailUrl: '/games/screens/impostor-night-clues.jpg',
    screenshots: [
      { url: '/games/screens/impostor-night-clues.jpg', caption: 'Everyone gets the secret word except the impostor' },
      { url: '/games/screens/impostor-night-vote.jpg', caption: 'One-word clues, then the vote' },
    ],
    description: 'Everyone knows the secret word except the Impostor. Drop a subtle clue, spot the bluff, and vote them out.',
    longDescription: 'A razor-sharp parlor word deduction game. Crew members give one-word clues without giving away the secret word; the Impostor has to blend in or guess the word before getting voted out.',
    features: [
      'Secret word assignment with hidden Impostor role',
      'Timed clue phase, debate, and live room voting',
      'Stream-ready overlay for creators & friend groups',
    ],
    controls: [
      'Submit a 1-word clue during the clue phase, then vote for the suspect',
    ],
    commercial: {
      tagline: 'ONE SECRET WORD. ONE LIAR. TRUST NOBODY.',
      durationSec: 9,
      musicVibe: 'Mystery Synth Tension',
      scenes: [
        {
          headline: 'CLUE. ARGUE. VOTE.',
          subline: 'Everyone knows the word—except one',
          callout: 'SOCIAL DEDUCTION WORD GAME',
          accentColor: '#10b981',
          canvasMode: 'impostor',
        },
      ],
    },
    achievementTriggers: [],
    synergy: { inviteFriend: true, liveStream: true, postToFeed: true },
    launch: { type: 'live-game', kind: 'impostor' },
  },
];

export const getPlajahGameById = (id: string) =>
  PLAJAH_GAMES_CATALOG.find((g) => g.id === id) ?? null;
