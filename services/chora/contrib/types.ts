// Chora contribution ledger — who did what on a song, recorded as it happens.
//
// Every local edit to a Chora project is classified (recorded a take, drew notes, wrote lyrics,
// mixed, mastered…) and appended to the project's own hash-chained ledger on the server, which
// stamps the verified account, the server time and (privately) the network address. Credits are
// then derived from the ledger instead of typed from memory, and a SEALED entry fixes the exact
// audio (sha-256) a release was cut from — a proof-of-authorship record the artist owns.
//
// Plajah keeps the record; it is not a party to what collaborators agree between themselves.
// Pure types only — safe for client and server.

/** What a person did. Each maps to a credit category/role in derive.ts. */
export type ContribKind =
  | 'recorded'      // captured audio from an input (vocal, guitar, console take)
  | 'imported'      // brought an existing audio file into the project
  | 'generated'     // produced audio/notes with a generative engine
  | 'notes'         // wrote or played MIDI notes on an instrument track
  | 'beat'          // programmed drum patterns / pads
  | 'sound'         // designed a sound (instrument patch, drum synth, pad sample)
  | 'lyrics'        // wrote or edited words
  | 'arranged'      // song structure: sections, scenes, tempo, key, meter, clip placement
  | 'mixed'         // levels, pan, inserts, sends, automation, group buses
  | 'mastered'      // master bus chain
  | 'sealed';       // fixed a version: audio hash + ledger head (proof of authorship)

/** Where a contribution physically came from — what the client can honestly say. */
export interface ContribOrigin {
  /** 'web' | 'desktop' | 'phone' — the Plajah surface. */
  app?: string;
  /** OS + browser, e.g. "Windows · Chrome 141". */
  device?: string;
  /** Audio input it was recorded from, e.g. "StudioLive 32SX · input 7" or a mic label. */
  input?: string;
  /** Original file name for imports. */
  file?: string;
  /** Generative engine id for generated material. */
  engine?: string;
  /** A collaborator who PLAYED a take someone else recorded (their streamed jam input) — uid claim. */
  performer?: string;
  /** Server-resolved display name of `performer`. */
  performerName?: string;
}

/** One classified contribution, as the client sends it. */
export interface ContribEvent {
  kind: ContribKind;
  /** Human target: "Vocals › Verse take", "Bass › Clip 2", "Master bus". */
  target: string;
  /** Track name it happened on, when there is one — credits use it as the instrument. */
  track?: string;
  /** Instrument type for notes/sound (onda, kera, soma, lyra…). */
  instrument?: string;
  /** How many changes were folded into this event (a knob drag is many). */
  count: number;
  /** Content addresses (sha-256) of audio involved — sample keys are already content-addressed. */
  sha256?: string[];
  origin?: ContribOrigin;
  /** Client clock when the work happened (the server's `at` is the authoritative time). */
  clientAt: number;
}

/** A stored ledger entry. Server-stamped fields are never taken from the client. */
export interface ContribEntry extends ContribEvent {
  projectId: string;
  seq: number;
  /** Verified account that did it. */
  uid: string;
  /** Display name at the time. */
  name: string;
  /** Server time. */
  at: number;
  /** For 'sealed': the head hash of the chain at the moment of sealing. */
  sealedHead?: string;
  /** For 'sealed': a title / version label. */
  label?: string;
  prevHash: string;
  hash: string;
}

export interface ChainCheck {
  ok: boolean;
  length: number;
  head: string;
  problem?: string;
  atSeq?: number;
}

export const CONTRIB_KINDS: ReadonlyArray<ContribKind> = ['recorded', 'imported', 'generated', 'notes', 'beat', 'sound', 'lyrics', 'arranged', 'mixed', 'mastered', 'sealed'];

export const KIND_LABEL: Record<ContribKind, string> = {
  recorded: 'Recorded',
  imported: 'Imported audio',
  generated: 'Generated',
  notes: 'Notes',
  beat: 'Beat programming',
  sound: 'Sound design',
  lyrics: 'Lyrics',
  arranged: 'Arrangement',
  mixed: 'Mixing',
  mastered: 'Mastering',
  sealed: 'Sealed version',
};
