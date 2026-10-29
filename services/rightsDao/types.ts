/**
 * Chora Rights Association ("Rights DAO") — schema (types only, nothing wired).
 *
 * See docs/CHORA_RIGHTS_DAO.md for the scope, the legal limits and the anchoring decision.
 *
 * WHAT THIS IS
 * ────────────
 * A Plajah-native, member-governed association that does, for music made and played on Chora,
 * the jobs the industry spreads across five bodies:
 *
 *   ASCAP / BMI        work registration + public-performance shares   → WorkRegistration
 *   The MLC            mechanical shares (reproduction / interactive)   → WorkRegistration (MECH)
 *   SoundExchange      recording (master + performer) shares            → RecordingRegistration
 *   Copyright Office   proof of authorship and date                     → AuthorshipProof (evidence only)
 *   Luminate           play counts                                     → PlayPeriodReport
 *
 * WHAT IT BUILDS ON (no second copy of any of these)
 * ──────────────────────────────────────────────────
 *   services/registry/types.ts        Party / Work / Manifestation / Claim / LedgerStatement / RegistryEpoch.
 *                                     Works and recordings ARE RegistryWork / RegistryManifestation; this file
 *                                     only adds the association's registration, dispute and governance layer.
 *   services/ledger/licenseLedger.ts  per-work licence chain (MINT, RIGHTS_DECLARED…). Its chain heads are
 *                                     inputs to the epoch Merkle root, same as everything else below.
 *   services/chora/contrib/           per-project who-did-what chain. A 'sealed' entry is the proof-of-authorship
 *                                     record a registration cites; suggested splits come from derive.ts.
 *
 * THREE RULES
 * ───────────
 * 1. Claims, not truth. Like RegistryClaim, every registration is an assertion with evidence. Overlaps
 *    are CONFLICTED and money is held, never guessed.
 * 2. Nothing personal on-chain. Only hashes, Merkle roots, tallies and proposal ids leave Plajah's
 *    database. Legal names, addresses, IPs, payout details, contract text and audio stay off-chain.
 * 3. No token. Voting weight is a non-transferable membership fact computed from the ledger, never
 *    something that can be bought or sold (see docs §6 for why).
 */
import type { RightType, ClaimStatus, LedgerAnchor, Credit } from '../registry/types';
import type { ContribKind } from '../chora/contrib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Ids and shared pieces
// ─────────────────────────────────────────────────────────────────────────────

/** plj:party:… — a RegistryParty id. Members are parties with a Plajah account. */
export type PartyId = string;
/** plj:work:… — a RegistryWork id (the composition). */
export type WorkId = string;
/** plj:manif:… — a RegistryManifestation id of kind SOUND_RECORDING (the master). */
export type RecordingId = string;
/** Lower-case hex SHA-256. */
export type Sha256 = string;
/** Basis points, 0–10 000. Integer maths only: 10 000 bp = 100 %. */
export type Bps = number;
/** ISO 3166-1 alpha-2, or 'WORLD'. */
export type Territory = string;

/** A pointer into one of Plajah's hash chains — how anything here cites evidence. */
export interface ChainRef {
  chain: 'CONTRIB' | 'LICENSE' | 'REGISTRY' | 'ASSOCIATION';
  /** CONTRIB: projectId · LICENSE: workKey (`book:<id>`) · REGISTRY/ASSOCIATION: log name. */
  key: string;
  seq: number;
  hash: Sha256;
}

/** A contribution-ledger SEALED entry, cited as authorship evidence (services/chora/contrib). */
export interface ContribSealRef {
  projectId: string;
  /** seq of the 'sealed' entry and its own hash. */
  seq: number;
  hash: Sha256;
  /** The chain head the seal fixed (ContribEntry.sealedHead). */
  sealedHead: Sha256;
  /** Audio content addresses fixed by the seal. */
  audioSha256: Sha256[];
  label?: string;
  sealedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Membership
// ─────────────────────────────────────────────────────────────────────────────

export type MemberRole =
  | 'WRITER'        // composer / lyricist — holds work shares
  | 'PUBLISHER'     // self-publishing entity or a publisher acting for writers
  | 'ARTIST'        // featured / main performer on recordings
  | 'PERFORMER'     // non-featured session player or vocalist
  | 'PRODUCER'      // producer / engineer / mixer / mastering (credited, may hold master points)
  | 'MASTER_OWNER'; // owns sound recordings (an artist, a band entity, an indie label)

export type MemberStatus = 'APPLIED' | 'ACTIVE' | 'SUSPENDED' | 'LEFT';

/**
 * Outside affiliations a member keeps. The association never asks anyone to leave a PRO; it records
 * them so it knows which rights it may license directly and which it must not (docs §3).
 */
export interface OutsideAffiliation {
  body: 'ASCAP' | 'BMI' | 'SESAC' | 'GMR' | 'SOCAN' | 'PRS' | 'GEMA' | 'SACEM' | 'MLC' | 'SOUNDEXCHANGE' | 'OTHER';
  /** Society code / IPI / SoundExchange id, as the member gives it. Off-chain. */
  memberRef?: string;
  /** What that body administers for this member, so Plajah does not double-collect. */
  administers: RightType[];
  /** Exclusive grants (e.g. some publishing admin deals) block direct licensing of that right. */
  exclusive: boolean;
  territories?: Territory[];
}

export interface Member {
  partyId: PartyId;
  /** Plajah account. Off-chain; never hashed into anything public without a salt. */
  uid: string;
  roles: MemberRole[];
  status: MemberStatus;
  joinedAt: number;
  /** Identity checked (KYC-lite via payouts provider) — required for payouts and for voting. */
  verified: boolean;
  affiliations: OutsideAffiliation[];
  /**
   * Salted commitment published in the member roll: sha256(salt ‖ partyId). The salt stays with
   * Plajah and the member, so the public roll proves a count and inclusion without naming anyone.
   */
  rollCommitment: Sha256;
  /** Creator Passport DID whose key signs this member's statements and ballots. */
  did?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration — works (ASCAP/BMI + MLC jobs) and recordings (SoundExchange job)
// ─────────────────────────────────────────────────────────────────────────────

export type RegistrationStatus =
  | 'DRAFT'
  | 'PENDING_CONFIRMATION' // waiting for every share-holder to countersign
  | 'REGISTERED'           // all parties signed; in the log
  | 'CONFLICTED'           // overlaps another registration or claim — payouts held
  | 'SUSPENDED'            // dispute ruled against it, or takedown
  | 'WITHDRAWN';

/** One holder of a share in one right. Sums to 10 000 bp per (right, territory). */
export interface ShareLine {
  partyId: PartyId;
  right: RightType;
  /** WRITER vs PUBLISHER side of a work share (the classic 50/50 split is a convention, not a rule). */
  side?: 'WRITER' | 'PUBLISHER';
  bps: Bps;
  territories?: Territory[];
  /** When the line came from a publisher chain: the writer whose share this administers. */
  onBehalfOf?: PartyId;
}

/** A countersignature: every share-holder signs the exact same canonical split. */
export interface ShareConfirmation {
  partyId: PartyId;
  /** sha256 of the canonical ShareLine[] they agreed to. */
  splitHash: Sha256;
  /** Passport/passkey signature over splitHash. Off-chain; its hash enters the log. */
  signature: string;
  signedAt: number;
}

/** Where a proposed split came from — so a member can see why the numbers are what they are. */
export type SplitBasis =
  | { kind: 'AGREED'; note?: string }                                    // typed in and countersigned
  | { kind: 'CONTRIB_SUGGESTED'; seal: ContribSealRef; kinds: ContribKind[] } // from the contribution ledger
  | { kind: 'CONTRACT'; documentHash: Sha256 };                          // an off-chain agreement, hash only

export interface WorkRegistration {
  id: string;                  // plj:reg:work:<uuidv7>
  workId: WorkId;
  /** Performance + mechanical (+ print/sync if members choose) shares. */
  shares: ShareLine[];
  basis: SplitBasis;
  confirmations: ShareConfirmation[];
  status: RegistrationStatus;
  /** Samples / interpolations: the underlying works this one uses, and the clearance evidence. */
  uses?: { workId: WorkId; relation: 'SAMPLE' | 'INTERPOLATION' | 'ARRANGEMENT'; clearance?: Sha256; publicDomain?: boolean }[];
  /** Evidence of authorship and date — seals, prior statements, outside registrations. */
  evidence: AuthorshipProof[];
  /** The association-log statement that recorded the current state. */
  statement?: ChainRef;
  createdAt: number;
  updatedAt: number;
}

export interface RecordingRegistration {
  id: string;                  // plj:reg:rec:<uuidv7>
  recordingId: RecordingId;
  /** The work(s) embodied, with WorkUse-style portions (medleys). */
  embodies: { workId: WorkId; portionBps: Bps }[];
  /** MASTER shares (owners) and NEIGHBOURING shares (featured + non-featured performers). */
  shares: ShareLine[];
  /** Credits as derived from the contribution ledger and confirmed by members. */
  credits: Credit[];
  basis: SplitBasis;
  confirmations: ShareConfirmation[];
  status: RegistrationStatus;
  /** Audio fingerprint (content address) of the delivered master. The audio itself stays in storage. */
  audioSha256: Sha256;
  evidence: AuthorshipProof[];
  statement?: ChainRef;
  createdAt: number;
  updatedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Proof of authorship (the Copyright Office job — as EVIDENCE, not registration)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A timestamped, tamper-evident record that this content existed in this form at this time, attributed
 * to these accounts. It is evidence. It is NOT a U.S. copyright registration: 17 U.S.C. §411(a) still
 * requires Copyright Office registration before suing over a U.S. work, and §412 ties statutory damages
 * and fees to timely registration. OUTSIDE_REGISTRATION lets members attach that certificate.
 */
export type AuthorshipProof =
  | { kind: 'CONTRIB_SEAL'; seal: ContribSealRef }
  | { kind: 'LICENSE_LEDGER'; ref: ChainRef }
  | { kind: 'ANCHORED_STATEMENT'; ref: ChainRef; epoch: number }
  | { kind: 'OUTSIDE_REGISTRATION'; office: 'US_COPYRIGHT_OFFICE' | 'OTHER'; number: string; effectiveDate: string; documentHash?: Sha256 };

// ─────────────────────────────────────────────────────────────────────────────
// Play tracking (the Luminate job) — from Chora's own plays only
// ─────────────────────────────────────────────────────────────────────────────

/** Which Chora surface produced the play; rates and chart eligibility can differ per surface. */
export type PlaySurface = 'ON_DEMAND' | 'RADIO' | 'LIVE_STAGE' | 'LISTENING_PARTY' | 'SYNC_IN_VIDEO' | 'DOWNLOAD';

/** What counts as a play. Fixed per period by governance so counts cannot be redefined after the fact. */
export interface PlayRule {
  version: number;
  /** Minimum listened seconds for a counted stream. */
  minSeconds: number;
  /** One listener's repeats of one recording counted at most this many times per day. */
  maxPerListenerPerDay: number;
  /** Plays flagged by fraud checks are excluded, and the excluded count is published. */
  excludeFlagged: true;
}

/**
 * Per-recording, per-period aggregate. Raw play events (listener, IP, device, time) stay off-chain in
 * Plajah's analytics store under its normal retention; only these aggregates are Merkle-rooted.
 */
export interface PlayTally {
  recordingId: RecordingId;
  surface: PlaySurface;
  territory: Territory;
  counted: number;
  /** Plays seen but not counted (too short, over the repeat cap, flagged) — published for honesty. */
  excluded: number;
  listenSeconds: number;
}

export interface PlayPeriodReport {
  /** 'YYYY-MM' — monthly periods match how payouts run. */
  period: string;
  rule: PlayRule;
  tallies: PlayTally[];
  /** Merkle root over the canonical tallies; the leaf for one recording is its inclusion proof. */
  merkleRoot: Sha256;
  /** Count of distinct listeners, rounded down to the nearest 10 so small numbers cannot identify anyone. */
  listenersApprox: number;
  closedAt: number;
  anchors: LedgerAnchor[];
}

/** Money attributed from a period's tallies to share-holders. Amounts off-chain; the statement hash on. */
export interface DistributionStatement {
  period: string;
  partyId: PartyId;
  /** Sum per right, in minor units of `currency`. */
  lines: { right: RightType; recordingId?: RecordingId; workId?: WorkId; amountMinor: number }[];
  currency: string;
  /** Amounts held while a registration is CONFLICTED or DISPUTED. */
  heldMinor: number;
  statementHash: Sha256;
}

// ─────────────────────────────────────────────────────────────────────────────
// Disputes
// ─────────────────────────────────────────────────────────────────────────────

export type DisputeGround =
  | 'SPLIT'            // the shares are wrong
  | 'AUTHORSHIP'       // "I wrote / played that and I'm missing"
  | 'OWNERSHIP'        // who owns the master or the publishing
  | 'UNCLEARED_SAMPLE' // uses another work or recording without clearance
  | 'INFRINGEMENT'     // copies a third party's work (may also be a §512 notice — see docs §5)
  | 'PLAY_FRAUD'       // tallies inflated
  | 'IDENTITY';        // someone registered as a person they are not

export type DisputeStage =
  | 'FILED'
  | 'NEGOTIATION'      // 14 days for the parties to settle directly — most disputes end here
  | 'MEDIATION'        // a trained volunteer mediator, no ruling power
  | 'PANEL'            // a drawn panel of peers rules (docs §5.3)
  | 'APPEAL'           // a larger drawn panel, once, on the record
  | 'CLOSED';

export type DisputeOutcome =
  | 'SETTLED'          // the parties agreed; new split countersigned
  | 'UPHELD'           // the filer was right; registration amended
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'REFERRED_TO_COURT'; // the association steps back; held money stays held until a court order

export interface DisputeEvidence {
  submittedBy: PartyId;
  kind: 'CONTRIB_LEDGER' | 'SEAL' | 'SESSION_FILE' | 'CONTRACT' | 'MESSAGE' | 'AUDIO_COMPARISON' | 'OUTSIDE_REGISTRATION' | 'OTHER';
  /** Hash of the file; the file is stored privately and shown only to the parties and the panel. */
  documentHash: Sha256;
  ref?: ChainRef;
  note?: string;
  at: number;
}

export interface Dispute {
  id: string;                  // plj:dispute:<uuidv7>
  subject: { kind: 'WORK_REG' | 'RECORDING_REG' | 'PLAY_REPORT' | 'MEMBER'; id: string };
  ground: DisputeGround;
  filedBy: PartyId;
  respondents: PartyId[];
  stage: DisputeStage;
  /** Money held from the moment of filing. Released only on CLOSED. */
  holdsPayouts: boolean;
  evidence: DisputeEvidence[];
  panel?: JuryPanel;
  ruling?: Ruling;
  outcome?: DisputeOutcome;
  /** Each stage change is a statement in the association log. */
  history: { stage: DisputeStage; at: number; statement: ChainRef }[];
  filedAt: number;
}

/** Panel members drawn by a verifiable lottery; conflicted members are excluded before the draw. */
export interface JuryPanel {
  size: 3 | 5 | 7;
  /** Public randomness used for the draw (e.g. the hash of a named future Bitcoin block). */
  seed: { source: 'BTC_BLOCK_HASH'; height: number; value?: Sha256 };
  /** Roll commitments of the drawn members (not names — panelists are named only to the parties). */
  drawn: Sha256[];
  /** Why candidates were excluded: co-writers, same label, prior disputes with a party. */
  excludedCount: number;
}

export interface Ruling {
  decidedAt: number;
  votes: { for: number; against: number; abstain: number };
  /** Plain-language reasons, written by the panel, published with party names removed. */
  reasons: string;
  /** The corrected split, if any, which the registration then adopts. */
  amendedShares?: ShareLine[];
  statement: ChainRef;
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance — who votes on what, and how votes are weighted
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Proposal classes. Each class has its own electorate, weighting and threshold (GOVERNANCE_RULES below),
 * so the people a rule affects are the people who decide it.
 */
export type ProposalClass =
  | 'CHARTER'          // the constitution itself, member rights, dissolution
  | 'DISTRIBUTION'     // how play money is divided (per-play vs user-centric, rights ratios)
  | 'PLAY_RULE'        // what counts as a play, fraud thresholds
  | 'FEES'             // Plajah's fee within the cap the charter sets
  | 'DISPUTE_POLICY'   // panel sizes, deadlines, mediator roster
  | 'MEMBERSHIP'       // suspension / expulsion of a member (after a dispute finding)
  | 'TREASURY';        // spending of the association's own fund (legal defence, grants)

export type Weighting =
  /** One verified member, one vote. */
  | { kind: 'ONE_MEMBER_ONE_VOTE' }
  /**
   * One vote plus a bounded catalogue bonus: 1 + min(cap, sqrt(counted plays over the last 12 months) / scale).
   * Square root and a cap so a large catalogue counts more without being able to outvote everyone.
   */
  | { kind: 'CAPPED_SQRT_PLAYS'; cap: number; scale: number }
  /** Two houses must both pass it (e.g. writers and recording-side members). */
  | { kind: 'BICAMERAL'; houses: [MemberRole[], MemberRole[]] };

export interface GovernanceRule {
  cls: ProposalClass;
  /** Roles eligible to vote. Empty = every ACTIVE verified member. */
  electorate: MemberRole[];
  weighting: Weighting;
  /** Share of eligible weight that must take part for the vote to count. */
  quorumBps: Bps;
  /** Share of cast weight (yes / (yes+no)) needed to pass. */
  passBps: Bps;
  /** Discussion period before voting opens, and voting length, in days. */
  discussDays: number;
  voteDays: number;
  /** Days between passing and taking effect, so members can leave first if they disagree. */
  timelockDays: number;
  /** Plajah (the operator) may veto only for legal compliance, publicly, with reasons. */
  operatorVeto: 'NONE' | 'LEGAL_ONLY';
}

export const GOVERNANCE_RULES: Record<ProposalClass, GovernanceRule> = {
  CHARTER:        { cls: 'CHARTER',        electorate: [], weighting: { kind: 'ONE_MEMBER_ONE_VOTE' }, quorumBps: 2000, passBps: 6667, discussDays: 21, voteDays: 14, timelockDays: 30, operatorVeto: 'LEGAL_ONLY' },
  DISTRIBUTION:   { cls: 'DISTRIBUTION',   electorate: [], weighting: { kind: 'BICAMERAL', houses: [['WRITER', 'PUBLISHER'], ['ARTIST', 'PERFORMER', 'PRODUCER', 'MASTER_OWNER']] }, quorumBps: 1500, passBps: 6000, discussDays: 14, voteDays: 10, timelockDays: 30, operatorVeto: 'LEGAL_ONLY' },
  PLAY_RULE:      { cls: 'PLAY_RULE',      electorate: [], weighting: { kind: 'CAPPED_SQRT_PLAYS', cap: 4, scale: 100 }, quorumBps: 1000, passBps: 5001, discussDays: 7, voteDays: 7, timelockDays: 0, operatorVeto: 'LEGAL_ONLY' },
  FEES:           { cls: 'FEES',           electorate: [], weighting: { kind: 'ONE_MEMBER_ONE_VOTE' }, quorumBps: 1500, passBps: 6000, discussDays: 14, voteDays: 10, timelockDays: 60, operatorVeto: 'LEGAL_ONLY' },
  DISPUTE_POLICY: { cls: 'DISPUTE_POLICY', electorate: [], weighting: { kind: 'ONE_MEMBER_ONE_VOTE' }, quorumBps: 1000, passBps: 5001, discussDays: 7, voteDays: 7, timelockDays: 14, operatorVeto: 'LEGAL_ONLY' },
  MEMBERSHIP:     { cls: 'MEMBERSHIP',     electorate: [], weighting: { kind: 'ONE_MEMBER_ONE_VOTE' }, quorumBps: 1000, passBps: 6667, discussDays: 7, voteDays: 7, timelockDays: 0, operatorVeto: 'NONE' },
  TREASURY:       { cls: 'TREASURY',       electorate: [], weighting: { kind: 'CAPPED_SQRT_PLAYS', cap: 4, scale: 100 }, quorumBps: 1000, passBps: 5001, discussDays: 7, voteDays: 7, timelockDays: 7, operatorVeto: 'LEGAL_ONLY' },
};

export type ProposalStatus = 'DRAFT' | 'DISCUSSION' | 'VOTING' | 'PASSED' | 'FAILED' | 'VETOED' | 'ENACTED' | 'CANCELLED';

export interface Proposal {
  id: string;                  // plj:prop:<uuidv7>
  cls: ProposalClass;
  title: string;
  /** Full text lives off-chain; its hash is what the anchor commits to, so the text cannot be swapped. */
  bodyHash: Sha256;
  author: PartyId;
  /** Members needed to co-sponsor before it reaches DISCUSSION (spam guard). */
  sponsors: PartyId[];
  status: ProposalStatus;
  /** Snapshot of eligible voters + weights, fixed when voting opens. Root anchored with the proposal. */
  electorateRoot?: Sha256;
  opensAt?: number;
  closesAt?: number;
  tally?: Tally;
  veto?: { reason: string; at: number; statement: ChainRef };
  enactedAt?: number;
  statements: ChainRef[];
}

/**
 * One ballot. Signed by the member's Passport key and kept off-chain; only the Merkle root of all
 * ballots and the tally are anchored. A member can prove their ballot was counted with its inclusion path.
 */
export interface Ballot {
  proposalId: string;
  /** The voter's roll commitment, not their party id. */
  voter: Sha256;
  choice: 'YES' | 'NO' | 'ABSTAIN';
  /** Weight from the electorate snapshot, in milli-votes (integer). */
  weightMilli: number;
  /** A later ballot from the same voter replaces an earlier one until close. */
  castAt: number;
  signature: string;
}

export interface Tally {
  yesMilli: number;
  noMilli: number;
  abstainMilli: number;
  eligibleMilli: number;
  ballots: number;
  /** Merkle root over canonical ballots. */
  ballotsRoot: Sha256;
  quorumMet: boolean;
  passed: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// The association log and its anchors
// ─────────────────────────────────────────────────────────────────────────────

/** Every state change above is one statement in the association log (a RegistryStatement-style leaf). */
export type AssociationOp =
  | 'MEMBER_JOINED' | 'MEMBER_LEFT' | 'MEMBER_SUSPENDED'
  | 'WORK_REGISTERED' | 'RECORDING_REGISTERED' | 'REGISTRATION_AMENDED' | 'REGISTRATION_CONFLICTED'
  | 'DISPUTE_FILED' | 'DISPUTE_STAGE' | 'DISPUTE_RULED'
  | 'PLAY_PERIOD_CLOSED' | 'DISTRIBUTION_ISSUED'
  | 'PROPOSAL_OPENED' | 'PROPOSAL_CLOSED' | 'PROPOSAL_VETOED' | 'PROPOSAL_ENACTED';

export interface AssociationStatement {
  seq: number;
  op: AssociationOp;
  /** The record id the statement is about. */
  subject: string;
  /** sha256 of the canonical record AFTER the change. The record itself is not in the statement. */
  recordHash: Sha256;
  /** Signer: a member DID, or Plajah's operator key for system statements (period close, tallies). */
  signer: string;
  signature: string;
  at: number;
  prevHash: Sha256;
  hash: Sha256;
}

/**
 * What one anchor commits to. Plajah builds one Merkle tree per epoch over the heads of every chain it
 * keeps — association log, registry log, licence-ledger heads, contribution-ledger heads — and anchors
 * only the root (OpenTimestamps → Bitcoin, see docs §4). Any single record is then provable with a path.
 */
export interface AnchorEpoch {
  epoch: number;
  /** Root over the leaves below, in this order. */
  root: Sha256;
  leaves: {
    associationHead: Sha256;
    registryRoot?: Sha256;
    /** Merkle root over (workKey, head) of every licence chain changed this epoch. */
    licenseHeadsRoot?: Sha256;
    /** Merkle root over (projectId, head) of every contribution chain changed this epoch. */
    contribHeadsRoot?: Sha256;
    /** Proposals opened/closed this epoch: (proposalId, bodyHash, electorateRoot, ballotsRoot, tally). */
    governanceRoot?: Sha256;
    playReportRoot?: Sha256;
  };
  prevRoot: Sha256;
  anchors: LedgerAnchor[];
  closedAt: number;
}

/** Re-exported so callers of this module see the registry's claim states in one place. */
export type { ClaimStatus };
