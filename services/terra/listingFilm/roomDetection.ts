/**
 * Room detection from narration — the heart of the auto-cut.
 *
 * An agent walks a property talking: "…and here's the chef's kitchen… down the
 * hall the primary bedroom with an en-suite… out back a big deck." We transcribe
 * that (timestamped), then turn the ROOM MENTIONS into an ordered set of scene
 * cuts. Each detected scene knows when it starts (the moment the room is named),
 * what to title it, and the exact narration quote that triggered the cut — so the
 * agent can see WHY it cut there and fix it if the walkthrough was out of order.
 *
 * Pure + deterministic. No I/O, no model call — a lexicon matcher. (An LLM pass
 * can refine this later, but a transparent lexicon is the honest, debuggable core
 * and it needs no key.)
 */

export interface TranscriptLine { time: number; text: string; }

export interface DetectedScene {
  id: string;
  /** Canonical room key. */
  room: string;
  /** Display title for the film's lower-third. */
  label: string;
  /** Seconds into the walkthrough where this scene begins. */
  startTime: number;
  /** Filled from the next scene's start (or clip end for the last). */
  endTime: number;
  /** The narration that triggered the cut — shown to the agent for trust. */
  quote: string;
  /** 'high' = specific multi-word match, 'med' = single keyword. */
  confidence: 'high' | 'med';
}

/**
 * Room lexicon. Order within a room doesn't matter; ACROSS rooms, longer/more
 * specific phrases win when two overlap in the same line (so "primary bedroom"
 * beats "bedroom", "powder room" beats "room"). We deliberately never match a
 * bare "room" — too noisy.
 */
interface RoomDef { key: string; label: string; phrases: string[]; }

const ROOMS: RoomDef[] = [
  { key: 'entry',      label: 'Entryway',        phrases: ['foyer', 'entryway', 'entry hall', 'front entry', 'grand entrance'] },
  { key: 'living',     label: 'Living Room',     phrases: ['living room', 'great room', 'sitting room', 'front room'] },
  { key: 'family',     label: 'Family Room',     phrases: ['family room', 'den', 'media room', 'bonus room'] },
  { key: 'kitchen',    label: 'Kitchen',         phrases: ["chef's kitchen", 'chefs kitchen', 'gourmet kitchen', 'kitchen', 'breakfast nook', 'kitchen island'] },
  { key: 'dining',     label: 'Dining Room',     phrases: ['formal dining', 'dining room', 'dining area'] },
  { key: 'primary',    label: 'Primary Suite',   phrases: ['primary bedroom', 'primary suite', 'master bedroom', 'master suite', "owner's suite", 'owners suite'] },
  { key: 'bedroom',    label: 'Bedroom',         phrases: ['second bedroom', 'third bedroom', 'guest bedroom', 'guest room', "kids' room", 'kids room', "children's room", 'bedroom'] },
  { key: 'bath',       label: 'Bathroom',        phrases: ['en-suite', 'ensuite', 'primary bath', 'full bathroom', 'full bath', 'powder room', 'half bath', 'bathroom'] },
  { key: 'office',     label: 'Office',          phrases: ['home office', 'office', 'study', 'flex room', 'flex space'] },
  { key: 'laundry',    label: 'Laundry',         phrases: ['laundry room', 'laundry', 'mudroom', 'mud room', 'utility room'] },
  { key: 'closet',     label: 'Walk-in Closet',  phrases: ['walk-in closet', 'walk in closet', 'walk-in wardrobe'] },
  { key: 'basement',   label: 'Lower Level',     phrases: ['finished basement', 'basement', 'lower level', 'rec room'] },
  { key: 'attic',      label: 'Loft',            phrases: ['attic', 'loft'] },
  { key: 'garage',     label: 'Garage',          phrases: ['two-car garage', 'garage', 'carport'] },
  { key: 'stairs',     label: 'Staircase',       phrases: ['staircase', 'grand staircase', 'landing'] },
  { key: 'outdoor',    label: 'Outdoor Space',   phrases: ['backyard', 'back yard', 'back deck', 'patio', 'deck', 'covered porch', 'porch', 'pool', 'garden', 'outdoor space', 'outdoor living'] },
  { key: 'exterior',   label: 'Exterior',        phrases: ['curb appeal', 'exterior', 'front of the house', 'street view'] },
];

/** Intro cues that open a film even before a room is named. */
const INTRO_CUES = ['welcome to', 'welcome home', "let's take a look", 'let me show you', 'come on in', 'take a tour'];

// Precompute (phrase, room, wordCount), longest phrase first so specific wins.
const PHRASE_INDEX: { phrase: string; room: RoomDef; words: number }[] = ROOMS
  .flatMap(room => room.phrases.map(phrase => ({ phrase, room, words: phrase.split(/\s+/).length })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

function normalize(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9'\- ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

/** Does `haystack` (already normalized, space-padded) contain `phrase` as words? */
function containsPhrase(haystack: string, phrase: string): boolean {
  return haystack.includes(` ${phrase} `);
}

/**
 * Detect the ordered room scenes in a narration transcript.
 *
 * Algorithm: walk lines in time order; for each line, find the FIRST (most
 * specific) room phrase it contains. The first time a given room appears becomes
 * that room's cut; later re-mentions of the same room are ignored (a tour visits
 * a room once). Scenes are returned in narration order, each spanning from its
 * cut to the next cut.
 */
export function detectRoomScenes(transcript: TranscriptLine[], clipDuration?: number): DetectedScene[] {
  const scenes: DetectedScene[] = [];
  const seen = new Set<string>();

  // Optional intro scene if the opening line is a welcome.
  const first = transcript[0];
  if (first) {
    const nf = normalize(first.text);
    if (INTRO_CUES.some(c => nf.includes(` ${c} `) || nf.trimStart().startsWith(c))) {
      scenes.push({
        id: 'scene-intro', room: 'intro', label: 'Welcome',
        startTime: first.time, endTime: first.time, quote: first.text.trim(), confidence: 'high',
      });
    }
  }

  for (const line of transcript) {
    const hay = normalize(line.text);
    // Find the most specific room phrase present in this line.
    const hit = PHRASE_INDEX.find(p => containsPhrase(hay, p.phrase));
    if (!hit) continue;
    if (seen.has(hit.room.key)) continue;         // room already cut — tours visit once
    seen.add(hit.room.key);
    scenes.push({
      id: `scene-${hit.room.key}`,
      room: hit.room.key,
      label: hit.room.label,
      startTime: line.time,
      endTime: line.time,
      quote: line.text.trim(),
      confidence: hit.words > 1 ? 'high' : 'med',
    });
  }

  // Order by time (intro stays first) and fill endTimes from the next start.
  scenes.sort((a, b) => a.startTime - b.startTime);
  const tail = clipDuration && clipDuration > 0
    ? clipDuration
    : (transcript.length ? transcript[transcript.length - 1].time + 4 : 0);
  for (let i = 0; i < scenes.length; i++) {
    scenes[i].endTime = i < scenes.length - 1 ? scenes[i + 1].startTime : Math.max(scenes[i].startTime + 2, tail);
  }
  return scenes;
}

/** Total covered duration — handy for the UI. */
export function scenesDuration(scenes: DetectedScene[]): number {
  if (!scenes.length) return 0;
  return scenes[scenes.length - 1].endTime - scenes[0].startTime;
}
