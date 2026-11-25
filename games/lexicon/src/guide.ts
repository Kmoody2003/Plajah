// The guide: what to do next, worked out from the save (never a script that can fall out of step with it). The game
// shows the goal on the HUD, a gold beacon where it is, and a tip card with the keys for the step until it is done.
// Order follows the opening the way the adventure is meant to teach it: talk to the elder, rescue a word from the
// Unwritten, bring it home, play a song at a shrine, weigh words at the Cipher Gate, enter the temple.
import { VILLAGERS, SIGILS } from './content';

export interface GuideState {
  level: 'glossa' | 'temple';
  words: Set<string>;
  starting: string[];
  freed: string[];
  met: string[];
  sigils: string[];
  gates: string[];
  templeDone: boolean;
  /** Song words the player carries, with their power. */
  songs: { w: string; power: string }[];
  /** Live Unwritten (not bound or dying), nearest first. */
  enemies: { kind: string; x: number; z: number }[];
  player: [number, number];
}

export interface GuideStep {
  id: string;
  goal: string;
  /** Where the beacon stands (x, z), if the goal is a place. */
  at?: [number, number];
  /** The card: how to do it, with keys as [K] marks. */
  tip: string;
}

const CIPHER_AT: [number, number] = [0, -59];
const TEMPLE_DOOR: [number, number] = [0, -77];
const ARENA: [number, number] = [0, -86];

export function nextStep(s: GuideState): GuideStep | null {
  const near = (kind?: string) => s.enemies.find((e) => !kind || e.kind === kind);
  if (s.level === 'temple') {
    if (s.templeDone) return { id: 'done', goal: 'Return to Glossa Hollow', at: [0, 2], tip: 'The Redactor is gone. Walk back out the way you came.' };
    const e = near();
    if (e) return { id: 'temple-fight', goal: 'Break the Numerals’ bonds', at: [e.x, e.z], tip: 'Hold [Shift] to lock on, strike with [J]. When one cracks, answer its sum with [1]–[4].' };
    return { id: 'temple-hall', goal: 'Face the Redactor in the far hall', at: ARENA, tip: 'Strike the pillar whose word weighs what he asks (A = 1 … Z = 26).' };
  }

  const elder = VILLAGERS[0];
  if (!s.met.includes('elder')) return { id: 'elder', goal: `Talk to ${elder.name}`, at: elder.pos, tip: 'Walk with [W][A][S][D], turn the camera with the mouse. Follow the gold light, then press [E].' };

  const rescued = [...s.words].filter((w) => !s.starting.includes(w));
  if (!rescued.length && !s.freed.length) {
    const e = near('hushling') ?? near();
    return { id: 'first-rescue', goal: 'Rescue a word from a Hushling', at: e ? [e.x, e.z] : undefined,
      tip: 'Hold [Shift] to lock on, strike with [J] or click. After two hits it falters: pick the missing letter with [1]–[4] before the bar runs out.' };
  }

  const carry = VILLAGERS.find((v) => !s.freed.includes(v.id) && s.words.has(v.word));
  if (carry) return { id: `give-${carry.id}`, goal: `Bring ${carry.word} to ${carry.name}`, at: carry.pos, tip: `Talk to ${carry.name.split(' ')[0]} with [E] and choose “Give ${carry.word}”. They’ll give you a word back.` };

  for (const song of s.songs) {
    const sig = SIGILS.find((g) => g.level === 'glossa' && g.power === song.power && !s.sigils.includes(g.id));
    if (sig) return { id: `sigil-${sig.id}`, goal: `Play ${song.w} at ${sig.label.replace(/^An? /, 'the ').toLowerCase()}`, at: sig.pos,
      tip: `Stand by it, press [Q] to raise the Lyre, then type ${[...song.w].map((c) => `[${c}]`).join('')} (or click the song).` };
  }

  if (!s.gates.includes('cipher')) {
    if (s.words.size >= 4) return { id: 'cipher', goal: 'Weigh your words at the Cipher Gate', at: CIPHER_AT, tip: 'Press [E] at the gate. Each letter weighs its place in the alphabet: pick words that add up to its number.' };
  } else if (!s.templeDone) return { id: 'temple', goal: 'Enter the Temple of Numerals', at: TEMPLE_DOOR, tip: 'The gate is open. Walk north through it to the temple door.' };

  const lost = VILLAGERS.find((v) => !s.freed.includes(v.id));
  const e = near();
  if (lost) return { id: 'rescue', goal: `Rescue more words · ${lost.name.split(' ')[0]} lost “${lost.word}”`, at: e ? [e.x, e.z] : undefined,
    tip: 'Each of the Unwritten you break gives back a word. Numerals ask sums, Glyphmaws ask what a word weighs.' };
  return e ? { id: 'rescue-more', goal: 'Rescue every lost word', at: [e.x, e.z], tip: 'Open the Archive with [Tab] to see which words are still blank.' } : null;
}

/** "[E]" marks → key chips. */
export const tipHtml = (tip: string) => tip.replace(/\[([^\]]+)\]/g, '<span class="key">$1</span>');
