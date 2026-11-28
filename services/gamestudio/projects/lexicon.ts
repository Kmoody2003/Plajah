// Lexicon: The Unwriting — the starter Game Project (docs/game-studio-unified-plan.md, dogfood rule).
// The game boots from this document; the Game Studio opens the same document and can change any of it.
// Markers place the player and the Unwritten (enemySpot name = which kind spawns there), zones are the
// trigger boxes the rules wait on, and the rules read as sentences in the Studio's Rules panel.

import { GAME_PROJECT_KIND, GAME_PROJECT_VERSION, type GameLevel, type AssetRef, type GameProject, type Marker, type Rule } from '../schema';

const spot = (id: string, name: string, x: number, z: number): Marker => ({ id, kind: 'enemySpot', name, pos: [x, 0, z] });
const rule = (id: string, when: Rule['when'], ...doActs: Rule['do']): Rule => ({ id, enabled: true, when, if: [], do: doActs });

const glossa: GameLevel = {
  id: 'glossa',
  name: 'Glossa Hollow',
  module: { id: 'lexicon.glossa', params: { dayLengthSec: 360 } },
  markers: [
    { id: 'm-spawn', kind: 'spawn', team: 'a', pos: [0, 0, 7], yaw: Math.PI },
    spot('e1', 'hushling', 26, 14), spot('e2', 'hushling', -28, 10), spot('e3', 'hushling', 18, -30),
    spot('e4', 'numeral', -22, -34), spot('e5', 'numeral', 34, -12), spot('e6', 'glyphmaw', -36, -18),
    spot('e7', 'hushling', 8, 38), spot('e8', 'numeral', -14, 44), spot('e9', 'glyphmaw', 12, -52),
  ],
  zones: [
    { id: 'z-gate', kind: 'trigger', name: 'the Cipher Gate', box: { center: [0, 1, -62], size: [16, 6, 8] } },
    { id: 'z-temple', kind: 'trigger', name: 'the Temple door', box: { center: [0, 1, -77], size: [6, 6, 3] } },
  ],
  instances: [],
  look: { preset: 'parchment-day' },
  rules: [
    rule('g-start', { event: 'levelStart' }, { action: 'showText', text: 'The Unwriting has reached Glossa Hollow. Words are vanishing. Rescue them.' }),
    rule('g-five', { event: 'itemsCollected', item: 'words', count: 5 }, { action: 'showText', text: 'Five words are safe. The Cipher Gate to the north is humming.' }),
    rule('g-gate', { event: 'enterZone', zone: 'z-gate' }, { action: 'showText', text: 'The Cipher Gate: weigh your words to open it.' }),
    rule('g-open', { event: 'gateOpened', gate: 'cipher' }, { action: 'unlockLevel', level: 'temple' }, { action: 'showText', text: 'The Temple of Numerals stands open.' }),
    rule('g-enter', { event: 'enterZone', zone: 'z-temple' }, { action: 'winLevel', next: 'temple' }),
  ],
};

const temple: GameLevel = {
  id: 'temple',
  name: 'Temple of Numerals',
  module: { id: 'lexicon.temple', params: {} },
  markers: [
    { id: 't-spawn', kind: 'spawn', team: 'a', pos: [0, 0, -4], yaw: Math.PI },
    spot('t1', 'numeral', -8, -28), spot('t2', 'numeral', 8, -28), spot('t3', 'glyphmaw', 0, -38),
  ],
  zones: [
    { id: 'z-arena', kind: 'trigger', name: 'the Redactor\'s hall', box: { center: [0, 1, -88], size: [10, 6, 4] } },
  ],
  instances: [],
  look: { preset: 'temple-torch' },
  rules: [
    rule('t-start', { event: 'levelStart' }, { action: 'showText', text: 'The Temple of Numerals. Every door here is a sum.' }, { action: 'spawnWave', count: 3, who: 'numeral' }),
    rule('t-hall', { event: 'waveCleared', wave: 1 }, { action: 'openGate', gate: 'hall' }, { action: 'showText', text: 'The bonds are broken. The hall door opens.' }),
    rule('t-boss', { event: 'enterZone', zone: 'z-arena' }, { action: 'spawnBoss', who: 'redactor' }),
    rule('t-win', { event: 'enemyDown', who: 'redactor' }, { action: 'showText', text: 'The Redactor is unwritten. Language breathes again.' }, { action: 'winLevel' }),
  ],
};

/** Names the game shows for ids the rules mention. */
export const LEXICON_NAMES: Record<string, string> = {
  'cast:numeral': 'Numerals', 'cast:hushling': 'Hushlings', 'cast:glyphmaw': 'Glyphmaws', 'cast:redactor': 'The Redactor',
  'cast:elder': 'Elder Mira', 'level:temple': 'Temple of Numerals', 'level:glossa': 'Glossa Hollow',
  'zone:z-gate': 'the Cipher Gate', 'zone:z-temple': 'the Temple door', 'zone:z-arena': "the Redactor's hall",
  'item:words': 'words',
};

/** The score: Kenne's full Lexicon soundtrack from `public/games/lexicon/assets/music`. */
export const LEXICON_MUSIC: AssetRef[] = [
  { id: 'music:glossa-explorer', kind: 'audio', url: '/games/lexicon/assets/music/explorers-path.mp3', license: 'owner', source: "The Explorer's Path" },
  { id: 'music:glossa-curious', kind: 'audio', url: '/games/lexicon/assets/music/curious-path.mp3', license: 'owner', source: 'The Curious Path' },
  { id: 'music:glossa-peaks', kind: 'audio', url: '/games/lexicon/assets/music/folktale-peaks.mp3', license: 'owner', source: 'The Folktale of the Peaks' },
  { id: 'music:glossa-circle', kind: 'audio', url: '/games/lexicon/assets/music/ancestral-circle.mp3', license: 'owner', source: 'The Ancestral Circle' },
  { id: 'music:glossa-answer', kind: 'audio', url: '/games/lexicon/assets/music/we-answer.mp3', license: 'owner', source: 'We Answer' },
  { id: 'music:cavern-call', kind: 'audio', url: '/games/lexicon/assets/music/ancestral-call.mp3', license: 'owner', source: 'Ancestral Call' },
  { id: 'music:cavern-fracture', kind: 'audio', url: '/games/lexicon/assets/music/conscious-fracture.mp3', license: 'owner', source: 'Conscious Fracture' },
  { id: 'music:action-ayo', kind: 'audio', url: '/games/lexicon/assets/music/ayo-exciting.mp3', license: 'owner', source: 'Ayo! Ayo!' },
  { id: 'music:action-drum', kind: 'audio', url: '/games/lexicon/assets/music/talking-drum-call.mp3', license: 'owner', source: "The Talking Drum's Call" },
  { id: 'music:wilds-guardian', kind: 'audio', url: '/games/lexicon/assets/music/guardian-of-the-grove.mp3', license: 'owner', source: 'The Guardian of the Grove' },
  { id: 'music:wilds-march', kind: 'audio', url: '/games/lexicon/assets/music/ancestral-march.mp3', license: 'owner', source: 'The Ancestral March' },
  { id: 'music:temple-hold', kind: 'audio', url: '/games/lexicon/assets/music/hold-the-ground.mp3', license: 'owner', source: 'Hold the Ground' },
  { id: 'music:temple-firm', kind: 'audio', url: '/games/lexicon/assets/music/stand-firm.mp3', license: 'owner', source: 'Stand Firm' },
  { id: 'music:combat-fight', kind: 'audio', url: '/games/lexicon/assets/music/word-fight.mp3', license: 'owner', source: 'Word Fight' },
  { id: 'music:boss-redactor', kind: 'audio', url: '/games/lexicon/assets/music/redactor-boss.mp3', license: 'owner', source: 'Ominous Chants (The Redactor)' },
  { id: 'music:boss-fullstop', kind: 'audio', url: '/games/lexicon/assets/music/full-stop-lexicon.mp3', license: 'owner', source: 'Full Stop (Lexicon)' },
];

export function lexiconProject(now = Date.now()): GameProject {
  return {
    kind: GAME_PROJECT_KIND, version: GAME_PROJECT_VERSION, id: 'lexicon', name: 'Lexicon: The Unwriting',
    template: 'adventure', runtime: { game: 'lexicon' }, startLevel: 'glossa',
    levels: [structuredClone(glossa), structuredClone(temple)], assets: LEXICON_MUSIC.map((a) => ({ ...a })), rules: [],
    createdAt: now, updatedAt: now,
  };
}
