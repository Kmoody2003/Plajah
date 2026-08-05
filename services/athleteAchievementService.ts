// athleteAchievementService.ts — the "sports-class achievement" layer for Athlete
// accounts. Every time an athlete scores or makes a major play during a game, an
// achievement is created in a PENDING state. It does NOT go to the chain immediately.
// Instead it must be VERIFIED against game data sources — the on-platform sportscaster
// (the producer who logged the play, authoritative) and/or corroboration amalgamated
// from multiple parent/live streams of the same event. Once the corroboration crosses
// a confidence threshold the achievement is verified and minted on-chain (via the
// existing athleteChainService), then it permanently "follows" the athlete on their
// profile / State Card.
//
// This is the missing link: today sportscast highlights are fire-and-forget with no
// verification. This service adds the verify-then-mint guarantee.

import { db } from './firebase';
import {
  collection, addDoc, doc, updateDoc, onSnapshot, query, where, orderBy, getDocs, getDoc,
} from 'firebase/firestore';
import type { GameState, HighlightEvent, HighlightType } from './sportscastService';

export type AchievementStatus =
  | 'pending'     // logged, awaiting corroboration
  | 'verifying'   // corroboration arriving, not yet over threshold
  | 'verified'    // enough independent sources agree — eligible to mint
  | 'minted'      // recorded on-chain, permanent
  | 'disputed';   // sources conflict — held for review

/** A single corroborating data source for an achievement. */
export interface AchievementSource {
  kind: 'sportscaster' | 'parent-stream' | 'live-stream' | 'box-score' | 'official' | 'manual';
  label: string;          // e.g. "Coach producer feed", "Parent stream #3"
  weight: number;         // contribution to confidence (0..1)
  refId?: string;         // feedId / streamId / box-score id
  at: number;             // when this source corroborated
}

export interface SportsAchievement {
  id: string;
  athleteUserId: string;
  sport: string;                 // FOOTBALL / BASKETBALL / SOCCER / VOLLEYBALL …
  type: string;                  // TOUCHDOWN / GOAL / THREE_POINTER / KILL / ACE …
  title: string;                 // human title, e.g. "Game-winning goal"
  description: string;
  value?: number;                // points / yards / etc.
  gameLabel?: string;            // "vs. Jefferson — Sectional Final"
  feedId?: string;
  gameId?: string;
  occurredAt: number;

  // verification
  status: AchievementStatus;
  sources: AchievementSource[];
  confidence: number;            // 0..1 aggregate
  verifiedAt?: number;

  // chain
  txHash?: string;
  explorerUrl?: string;
  tokenId?: string;
  mintedAt?: number;

  // media
  clipUrl?: string;
  thumbnailUrl?: string;
  badge?: string;                // emoji/icon key for the badge that follows them

  isDemo?: boolean;
}

const COLLECTION = 'sports_achievements';

// A play is verified when corroboration reaches this confidence. The on-platform
// sportscaster alone (the producer physically present) is authoritative enough; two
// independent parent/live streams agreeing also clears the bar.
export const VERIFY_THRESHOLD = 0.66;

// How much each kind of source is trusted on its own.
const SOURCE_WEIGHT: Record<AchievementSource['kind'], number> = {
  official:     0.9,   // official scorekeeper / sanctioned box score
  sportscaster: 0.7,   // the Plajah producer who logged the play live
  'box-score':  0.5,   // aggregated post-game box score (e.g. MaxPreps-style)
  'live-stream':0.22,  // an independent live stream of the same game
  'parent-stream':0.2, // a parent's phone stream
  manual:       0.15,
};

const BADGE_FOR_TYPE: Record<string, string> = {
  TOUCHDOWN: '🏈', GOAL: '⚽', THREE_POINTER: '🏀', HOME_RUN: '⚾',
  INTERCEPTION: '🛡️', SAVE: '🧤', KILL: '🏐', ACE: '🎯', DIG: '🤾',
  BIG_PLAY: '⭐', MILESTONE: '🏅', CUSTOM: '🔥',
};

/** Aggregate confidence from independent sources (diminishing, capped at 1). */
export function computeConfidence(sources: AchievementSource[]): number {
  // 1 - Π(1 - w): independent corroboration compounds toward certainty.
  const remaining = sources.reduce((acc, s) => acc * (1 - Math.max(0, Math.min(1, s.weight))), 1);
  return Math.round((1 - remaining) * 100) / 100;
}

function statusFor(confidence: number, minted: boolean, disputed: boolean): AchievementStatus {
  if (disputed) return 'disputed';
  if (minted) return 'minted';
  if (confidence >= VERIFY_THRESHOLD) return 'verified';
  if (confidence > 0) return 'verifying';
  return 'pending';
}

function titleFor(type: string, value: number | undefined, sport: string): string {
  const map: Record<string, string> = {
    TOUCHDOWN: 'Touchdown', GOAL: 'Goal', THREE_POINTER: 'Three-pointer', HOME_RUN: 'Home run',
    INTERCEPTION: 'Interception', SAVE: 'Save', KILL: 'Kill', ACE: 'Service ace', BIG_PLAY: 'Big play',
    MILESTONE: 'Milestone', CUSTOM: 'Highlight',
  };
  return map[type] || (type.charAt(0) + type.slice(1).toLowerCase());
}

/**
 * Create a PENDING achievement the moment a play is logged. Seeds it with the
 * sportscaster source (the producer who logged it) so it already has a head start,
 * but it is NOT minted until corroboration crosses the threshold.
 */
export async function createAchievementFromHighlight(
  athleteUserId: string,
  highlight: Pick<HighlightEvent, 'type' | 'label' | 'commentaryText'>,
  ctx: { sport: string; feedId?: string; gameId?: string; gameLabel?: string; value?: number; clipUrl?: string; thumbnailUrl?: string },
): Promise<string | null> {
  try {
    const sources: AchievementSource[] = [{
      kind: 'sportscaster',
      label: 'On-platform sportscaster',
      weight: SOURCE_WEIGHT.sportscaster,
      refId: ctx.feedId,
      at: Date.now(),
    }];
    const confidence = computeConfidence(sources);
    const ach: Omit<SportsAchievement, 'id'> = {
      athleteUserId,
      sport: ctx.sport,
      type: highlight.type,
      title: titleFor(highlight.type, ctx.value, ctx.sport),
      description: highlight.commentaryText || highlight.label || '',
      value: ctx.value,
      gameLabel: ctx.gameLabel,
      feedId: ctx.feedId,
      gameId: ctx.gameId,
      occurredAt: Date.now(),
      status: statusFor(confidence, false, false),
      sources,
      confidence,
      clipUrl: ctx.clipUrl,
      thumbnailUrl: ctx.thumbnailUrl,
      badge: BADGE_FOR_TYPE[highlight.type] || BADGE_FOR_TYPE.CUSTOM,
    };
    const ref = await addDoc(collection(db, COLLECTION), ach as any);
    // If the single authoritative source already clears the bar, mint immediately.
    if (ach.confidence >= VERIFY_THRESHOLD) verifyAndMint(ref.id).catch(() => {});
    return ref.id;
  } catch (e) {
    console.warn('[athleteAchievement] create failed:', e);
    return null;
  }
}

/**
 * Add a corroborating source (another stream of the same play, a box score, etc.),
 * recompute confidence, and auto-mint if it now crosses the threshold.
 */
export async function addCorroboratingSource(achievementId: string, source: Omit<AchievementSource, 'weight' | 'at'> & { weight?: number }): Promise<void> {
  try {
    const ref = doc(db, COLLECTION, achievementId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const a = snap.data() as SportsAchievement;
    if (a.status === 'minted') return;
    const full: AchievementSource = { ...source, weight: source.weight ?? SOURCE_WEIGHT[source.kind] ?? 0.2, at: Date.now() };
    const sources = [...(a.sources || []), full];
    const confidence = computeConfidence(sources);
    await updateDoc(ref, { sources: sources as any, confidence, status: statusFor(confidence, false, false) });
    if (confidence >= VERIFY_THRESHOLD) verifyAndMint(achievementId).catch(() => {});
  } catch (e) {
    console.warn('[athleteAchievement] corroborate failed:', e);
  }
}

/**
 * Verify (confidence must be at/over threshold) and mint on-chain. Minting is graceful:
 * if the chain isn't configured the achievement still becomes 'verified' and carries its
 * corroboration — it just lacks a txHash until the chain layer is live.
 */
export async function verifyAndMint(achievementId: string): Promise<void> {
  try {
    const ref = doc(db, COLLECTION, achievementId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const a = { id: snap.id, ...(snap.data() as SportsAchievement) };
    if (a.status === 'minted') return;
    if (a.confidence < VERIFY_THRESHOLD) return;

    await updateDoc(ref, { status: 'verified', verifiedAt: Date.now() });

    // Best-effort on-chain record. Lazy-imported so the chain stack never blocks the
    // (more important) verified state, and so a missing/unconfigured chain just no-ops.
    try {
      const { recordHighlightOnChain } = await import('./athleteChainService');
      const highlight: HighlightEvent = {
        type: a.type as HighlightType, label: a.title, team: null,
        commentaryText: a.description, timestamp: a.occurredAt,
      };
      const gs = { sport: a.sport } as unknown as GameState;
      const res = await recordHighlightOnChain(a.feedId || '', a.athleteUserId, highlight, gs, a.clipUrl || '');
      if (res?.txHash) {
        await updateDoc(ref, { status: 'minted', mintedAt: Date.now(), txHash: res.txHash, explorerUrl: (res as any).explorerUrl, tokenId: (res as any).tokenId });
      }
    } catch { /* chain not configured — remain 'verified' */ }
  } catch (e) {
    console.warn('[athleteAchievement] verifyAndMint failed:', e);
  }
}

/** Flag conflicting sources for manual review. */
export async function disputeAchievement(achievementId: string): Promise<void> {
  try { await updateDoc(doc(db, COLLECTION, achievementId), { status: 'disputed' }); } catch { /* */ }
}

/** Live list of an athlete's achievements, newest first. */
export function subscribeAthleteAchievements(athleteUserId: string, cb: (items: SportsAchievement[]) => void): () => void {
  const q = query(collection(db, COLLECTION), where('athleteUserId', '==', athleteUserId), orderBy('occurredAt', 'desc'));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as SportsAchievement) }))), () => cb([]));
}

/** One-shot fetch. */
export async function getAthleteAchievements(athleteUserId: string): Promise<SportsAchievement[]> {
  try {
    const q = query(collection(db, COLLECTION), where('athleteUserId', '==', athleteUserId), orderBy('occurredAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as SportsAchievement) }));
  } catch { return []; }
}

/** Short, human label for a verification status (used on cards/badges). */
export function statusLabel(s: AchievementStatus): string {
  return { pending: 'Awaiting verification', verifying: 'Verifying…', verified: 'Verified', minted: 'Verified · On-chain', disputed: 'Under review' }[s];
}
