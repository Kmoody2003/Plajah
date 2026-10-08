/**
 * Thesa — the Plajah stash. Card schema.
 *
 * Two families: IDEAs (read it, stash it) and MOMENTs (do it, 15–45 s). Every card carries its source
 * so it can link back to the real Plajah content it came from. Pure types; no runtime deps, so the
 * schema, validators and adapters can be unit-tested without a browser or Firebase.
 *
 * Blueprint: docs/PLAJAH_THESA_BLUEPRINT.md
 */

export type ThesaFamily = 'IDEA' | 'MOMENT';
export type ThesaKind = 'FACT' | 'PRINCIPLE' | 'TECHNIQUE' | 'BREATH' | 'SKETCH' | 'WORDPLAY';
export type ThesaStatus = 'DRAFT' | 'REVIEW' | 'LIVE';

export const IDEA_KINDS: readonly ThesaKind[] = ['FACT', 'PRINCIPLE', 'TECHNIQUE'];
export const MOMENT_KINDS: readonly ThesaKind[] = ['BREATH', 'SKETCH', 'WORDPLAY'];
export const familyOf = (k: ThesaKind): ThesaFamily => (IDEA_KINDS.includes(k) ? 'IDEA' : 'MOMENT');

/** Where a card came from, so "go deeper" and attribution are always honest. */
export interface ThesaSource {
  /** Plajah service the idea belongs to: 'chora' | 'taleo' | 'museion' | 'lorea' | … */
  service: string;
  /** Id of the originating record, when there is one. */
  refId?: string;
  /** Human label, e.g. "Taleo · Film History". */
  label: string;
}

/** In-app destination for "go deeper". `view` is an AppView name; kept a string so this stays dependency-free. */
export interface ThesaDeepLink { view: string; params?: Record<string, string> }

export type BreathPattern = 'coherent' | 'box' | '478' | 'physio';

export type WordplaySpec =
  | { game: 'UNSCRAMBLE'; answer: string; hint?: string }
  /** `text` contains exactly one `___` blank. */
  | { game: 'CLOZE'; text: string; answer: string; options?: string[] }
  | { game: 'LADDER'; from: string; to: string }
  | { game: 'RHYME'; word: string }
  | { game: 'CATEGORY'; category: string; letter: string };

/** Fields every card has. */
export interface ThesaCardBase {
  /** Globally unique and STABLE across releases (stash entries reference it). e.g. `thesa:edu:f_film1`. */
  id: string;
  family: ThesaFamily;
  kind: ThesaKind;
  /** Lower-case topic tag: 'music' | 'film' | 'history' | 'science' | 'wellbeing' … */
  topic: string;
  source: ThesaSource;
  deeper?: ThesaDeepLink;
  /** MOMENT only: how long the activity runs. */
  durationSec?: number;
  /**
   * Wellness cards never train the feed and never sit near ads (blueprint §7). BREATH is always wellness;
   * the validator enforces it so no code path can forget.
   */
  wellness: boolean;
  /** Reviewed as safe for under-13 / kids-mode accounts. Must be explicit — there is no default. */
  kidsSafe: boolean;
  status: ThesaStatus;
  /** Set for creator-attached or community cards. */
  authorUid?: string;
  createdAt?: number;
}

export type ThesaCard = ThesaCardBase & (
  | { kind: 'FACT'; payload: { headline?: string; text: string; emoji?: string; imageUrl?: string } }
  | { kind: 'PRINCIPLE'; payload: { text: string; attribution?: string } }
  | { kind: 'TECHNIQUE'; payload: { title: string; steps: string[] } }
  | { kind: 'BREATH'; payload: { pattern: BreathPattern } }
  | { kind: 'SKETCH'; payload: { prompt: string; hint?: string } }
  | { kind: 'WORDPLAY'; payload: WordplaySpec }
);

/** One saved card in a user's Thesa. Self-contained: carries a snapshot so it survives catalog changes. */
export interface ThesaStashEntry {
  cardId: string;
  card: ThesaCard;
  stashedAt: number;
  /** Bumped on every change; the newest wins when devices merge. */
  updatedAt: number;
  /** The user's own take on the card. Private. */
  note?: string;
  collectionIds: string[];
  /** Tombstone: an un-stash is recorded so another device's cache cannot resurrect the entry. */
  removed?: boolean;
}
