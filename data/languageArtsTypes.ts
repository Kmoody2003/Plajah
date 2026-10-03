/**
 * Language Arts x Lorea x Chora Vault.
 *
 * Every classic in data/classicBooks.ts (free on Project Gutenberg, opened in the Lorea reader)
 * gets a ClassicGuide: where it sits in history, what to read for, and which Chora Vault recordings
 * (era music, speeches, oral histories, LibriVox read-alouds) let a learner hear the world the book
 * came from. The guides also drive the "Classic Literature" course in the Learn map, where each book
 * is a lesson with comprehension practice.
 */
export type GradeBand = '3-5' | '6-8' | '9-12' | 'college';

/** Vault kinds and the subgenre ids that actually exist in services/archiveContentService.ts VAULT_TAXONOMY. */
export type VaultKindId = 'MUSIC' | 'HISTORIC' | 'SPEECH' | 'AUDIOBOOK' | 'FIELD_RECORDING' | 'INTERVIEW';

export interface VaultPair {
  kind: VaultKindId;
  /** Optional subgenre id valid for that kind (see the allowed list in the authoring brief). */
  subgenreId?: string;
  /** One sentence: what listening to this adds to reading the book. */
  why: string;
}

export interface ClassicGuide {
  /** Gutenberg id as a string, identical to ArchiveBook.id in data/classicBooks.ts. */
  id: string;
  title: string;
  gradeBand: GradeBand;
  form: 'novel' | 'drama' | 'epic poem' | 'short stories' | 'nonfiction' | 'novella';
  /** e.g. 'Victorian England' */
  period: string;
  /** e.g. '1859' (year of first publication) */
  year: string;
  themes: string[];
  /** 2-3 sentences of historical and literary context a student needs before opening the book. */
  context: string;
  /** 4 words from the book worth knowing. */
  vocab: Array<{ word: string; meaning: string }>;
  /** 3 open discussion questions (no single right answer). */
  discuss: string[];
  /** 2 literary devices to hunt for, with what to look for in THIS book. */
  devices: Array<{ name: string; whatToSpot: string }>;
  /** Optional heads-up for sensitive content (violence, slurs in period text, etc.). */
  contentNote?: string;
  vaultPairs: VaultPair[];
}
