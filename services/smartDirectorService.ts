/**
 * smartDirectorService — the Firestore state layer for "Smart Director",
 * Plajah's multi-camera auto-production system for amateur sports.
 *
 * THE CORE IDEA (the "master feed" is shared state, not a media stream):
 *   Multiple people at a game each contribute a phone camera. A single shared
 *   DIRECTION STATE — which contributor camera is currently PROGRAM (on air) —
 *   lives in Firestore and is rendered by every viewer. Switching the program
 *   is just a tiny doc write; there is NO SFU / cloud compositor. The actual
 *   camera media rides Plajah's existing WebRTC backbone (services/rtcCore.ts);
 *   this service only owns the shared "who is live" truth + roster + settings.
 *
 * ─── Firestore model (CHOSEN PATH) ────────────────────────────────────────────
 *   smartProductions/{productionId}        ← one doc, the whole production
 *      {
 *        id, eventTitle, ownerId, feedId, status,
 *        feeds: DirectorFeed[],             ← the contributor roster (array in-doc)
 *        directionState: DirectionState,    ← programFeedId + AUTO/MANUAL + timing
 *        settings: ProductionSettings,      ← minShotMs / cooldownMs
 *        createdAt, updatedAt
 *      }
 *
 *   WHY a top-level collection (not a sub-doc of live_feeds):
 *     • The production is queryable on its own (list active games, join by id).
 *     • It still REUSES the sportscast scoreboard/clock unchanged: the doc
 *       carries a `feedId`, and the GameState continues to live exactly where
 *       sportscastService already puts it —  live_feeds/{feedId}/sportscast/gameState.
 *       By default feedId === productionId, so a production auto-owns a scoreboard
 *       namespace with zero extra wiring. Pass an existing LiveFeed id to attach
 *       Smart Director to an already-running SPORTS stream instead.
 *
 *   The roster is a single array field (small: a handful of phones per game).
 *   Roster mutations (join / updateFeed / leave) go through a transaction so two
 *   phones joining at once can't clobber each other's array write. directionState
 *   is written with a shallow merge (its own subfields), so a program switch never
 *   races the roster.
 *
 * Non-throwing / best-effort, mirroring sportscastService: every write is wrapped
 * so a permission/quota hiccup degrades gracefully instead of taking down the UI.
 * Firestore throws on `undefined` fields — every payload is run through
 * stripUndefined() first.
 */

import { db } from './firebase';
import { doc, collection, setDoc, getDoc, runTransaction } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';

// ─── Types (exported here; fold into root types.ts later if desired) ───────────

export type ContributorRole = 'camera' | 'correspondent' | 'commentator' | 'scorekeeper';

export type DirectorMode = 'AUTO' | 'MANUAL';

export type ProductionStatus = 'LIVE' | 'ENDED';

/** One contributor's camera/role slot in the production roster. */
export interface DirectorFeed {
  /** Stable feed id. Convention: same as the contributor's rtc peer id / uid so
   *  rtcCore remote streams can be matched to a tile by id. */
  id: string;
  contributorId: string;
  contributorName: string;
  role: ContributorRole;
  /** Human label shown on the tile ("Sideline", "End Zone", "Mom's phone"). */
  label: string;
  /** Whether this feed is currently connected / eligible to be taken to program. */
  active: boolean;
  joinedAt: number;
  /** Last time this feed was on PROGRAM (ms). Used by the director for recency. */
  lastOnAt?: number;
}

/** The shared "who is live" truth every viewer renders. */
export interface DirectionState {
  /** Feed id currently on PROGRAM (empty string = nothing taken yet). */
  programFeedId: string;
  mode: DirectorMode;
  /** ms timestamp of the last program switch — the director's min-shot clock. */
  lastSwitchAt: number;
  /** uid (or 'auto-director') that made the last switch. */
  updatedBy: string;
}

/** Director timing knobs. */
export interface ProductionSettings {
  /** Minimum ms a shot must stay live before the auto-director may switch away. */
  minShotMs: number;
  /** Minimum ms between ANY two switches (rate limit on top of minShot). */
  cooldownMs: number;
}

export interface SmartProduction {
  id: string;
  eventTitle: string;
  ownerId: string;
  /** live_feeds/{feedId} that holds the sportscast scoreboard (defaults to id). */
  feedId: string;
  status: ProductionStatus;
  feeds: DirectorFeed[];
  directionState: DirectionState;
  settings: ProductionSettings;
  createdAt: number;
  updatedAt: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: ProductionSettings = {
  minShotMs: 3500,
  cooldownMs: 1200,
};

export function defaultDirectionState(): DirectionState {
  return { programFeedId: '', mode: 'AUTO', lastSwitchAt: 0, updatedBy: '' };
}

// ─── undefined-stripper (Firestore throws on undefined fields) ────────────────

function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj
      .map(v => (v && typeof v === 'object' ? stripUndefined(v) : v))
      .filter(v => v !== undefined) as unknown as T;
  }
  if (typeof obj !== 'object') return obj;
  return Object.entries(obj as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .reduce((acc, [k, v]) => {
      acc[k] = v && typeof v === 'object' ? stripUndefined(v) : v;
      return acc;
    }, {} as Record<string, unknown>) as T;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

const COLLECTION = 'smartProductions';
const productionRef = (id: string) => doc(db, COLLECTION, id);

// ─── Producer / owner ops ─────────────────────────────────────────────────────

export interface CreateProductionParams {
  ownerId: string;
  ownerName: string;
  eventTitle: string;
  /** Optional existing LiveFeed id to attach the scoreboard to (defaults to the
   *  new production id, giving the production its own scoreboard namespace). */
  feedId?: string;
  /** Optional explicit production id (else auto-generated). */
  id?: string;
  settings?: Partial<ProductionSettings>;
  /** If true, the owner is added to the roster as the first camera feed. */
  ownerJoinsAsCamera?: boolean;
  ownerRole?: ContributorRole;
  ownerLabel?: string;
}

export async function createProduction(params: CreateProductionParams): Promise<SmartProduction | null> {
  try {
    const ref = params.id ? productionRef(params.id) : doc(collection(db, COLLECTION));
    const id = ref.id;
    const now = Date.now();
    const feeds: DirectorFeed[] = [];
    if (params.ownerJoinsAsCamera) {
      feeds.push({
        id: params.ownerId,
        contributorId: params.ownerId,
        contributorName: params.ownerName,
        role: params.ownerRole ?? 'camera',
        label: params.ownerLabel ?? 'Cam 1',
        active: true,
        joinedAt: now,
      });
    }
    const production: SmartProduction = {
      id,
      eventTitle: params.eventTitle,
      ownerId: params.ownerId,
      feedId: params.feedId ?? id,
      status: 'LIVE',
      feeds,
      directionState: {
        ...defaultDirectionState(),
        // If the owner joined, take them to program immediately so there's a
        // picture from the first second.
        programFeedId: feeds[0]?.id ?? '',
        lastSwitchAt: feeds.length ? now : 0,
        updatedBy: feeds.length ? params.ownerId : '',
      },
      settings: { ...DEFAULT_SETTINGS, ...(params.settings ?? {}) },
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(ref, stripUndefined(production));
    return production;
  } catch (e) {
    console.warn('[smartDirector] createProduction failed:', (e as Error)?.message);
    return null;
  }
}

/** Read a production once (e.g. to resolve feedId before subscribing). */
export async function getProduction(productionId: string): Promise<SmartProduction | null> {
  try {
    const snap = await getDoc(productionRef(productionId));
    return snap.exists() ? (snap.data() as SmartProduction) : null;
  } catch (e) {
    console.warn('[smartDirector] getProduction failed:', (e as Error)?.message);
    return null;
  }
}

// ─── Contributor roster ops (transactional array mutations) ───────────────────

export interface JoinParams {
  contributorId: string;
  contributorName: string;
  role?: ContributorRole;
  label?: string;
  /** Feed id (defaults to contributorId so rtc peer ids line up with tiles). */
  feedId?: string;
}

/** Join a production as a contributor. Idempotent on contributorId: re-joining
 *  reactivates and refreshes the existing slot instead of duplicating it. */
export async function joinAsContributor(productionId: string, params: JoinParams): Promise<void> {
  const feedId = params.feedId ?? params.contributorId;
  try {
    await runTransaction(db, async tx => {
      const ref = productionRef(productionId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data() as SmartProduction;
      const feeds = [...(data.feeds ?? [])];
      const existing = feeds.findIndex(f => f.contributorId === params.contributorId);
      const now = Date.now();
      const nextCamIndex = feeds.filter(f => f.role === 'camera').length + 1;
      const slot: DirectorFeed = {
        id: feedId,
        contributorId: params.contributorId,
        contributorName: params.contributorName,
        role: params.role ?? 'camera',
        label: params.label ?? `Cam ${nextCamIndex}`,
        active: true,
        joinedAt: existing >= 0 ? feeds[existing].joinedAt : now,
        lastOnAt: existing >= 0 ? feeds[existing].lastOnAt : undefined,
      };
      if (existing >= 0) feeds[existing] = { ...feeds[existing], ...slot };
      else feeds.push(slot);
      tx.set(ref, stripUndefined({ feeds, updatedAt: now }), { merge: true });
    });
  } catch (e) {
    console.warn('[smartDirector] joinAsContributor failed:', (e as Error)?.message);
  }
}

/** Patch a single feed slot (role change, label, active toggle, lastOnAt). */
export async function updateFeed(
  productionId: string,
  feedId: string,
  patch: Partial<Omit<DirectorFeed, 'id' | 'contributorId'>>,
): Promise<void> {
  try {
    await runTransaction(db, async tx => {
      const ref = productionRef(productionId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data() as SmartProduction;
      const feeds = [...(data.feeds ?? [])];
      const idx = feeds.findIndex(f => f.id === feedId);
      if (idx < 0) return;
      feeds[idx] = { ...feeds[idx], ...patch };
      tx.set(ref, stripUndefined({ feeds, updatedAt: Date.now() }), { merge: true });
    });
  } catch (e) {
    console.warn('[smartDirector] updateFeed failed:', (e as Error)?.message);
  }
}

/** Remove a contributor from the roster (their phone left / disconnected). If
 *  they were on program, the program is cleared so the director/producer re-picks. */
export async function leaveProduction(productionId: string, contributorId: string): Promise<void> {
  try {
    await runTransaction(db, async tx => {
      const ref = productionRef(productionId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data() as SmartProduction;
      const leaving = (data.feeds ?? []).find(f => f.contributorId === contributorId);
      const feeds = (data.feeds ?? []).filter(f => f.contributorId !== contributorId);
      const patch: Record<string, unknown> = { feeds, updatedAt: Date.now() };
      if (leaving && data.directionState?.programFeedId === leaving.id) {
        patch.directionState = {
          ...data.directionState,
          programFeedId: '',
          lastSwitchAt: Date.now(),
          updatedBy: 'auto-director',
        };
      }
      tx.set(ref, stripUndefined(patch), { merge: true });
    });
  } catch (e) {
    console.warn('[smartDirector] leaveProduction failed:', (e as Error)?.message);
  }
}

// ─── Direction (the "master feed" switch) ─────────────────────────────────────

/** TAKE a feed to PROGRAM. Also stamps that feed's lastOnAt so recency heuristics
 *  work. `by` is the uid making the switch, or 'auto-director' from the engine. */
export async function setProgram(productionId: string, feedId: string, by: string): Promise<void> {
  try {
    const now = Date.now();
    await runTransaction(db, async tx => {
      const ref = productionRef(productionId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data() as SmartProduction;
      if (data.directionState?.programFeedId === feedId) return; // no-op
      const feeds = (data.feeds ?? []).map(f =>
        f.id === feedId ? { ...f, lastOnAt: now } : f,
      );
      tx.set(ref, stripUndefined({
        feeds,
        directionState: {
          ...data.directionState,
          programFeedId: feedId,
          lastSwitchAt: now,
          updatedBy: by,
        },
        updatedAt: now,
      }), { merge: true });
    });
  } catch (e) {
    console.warn('[smartDirector] setProgram failed:', (e as Error)?.message);
  }
}

/** Flip AUTO ↔ MANUAL. In MANUAL the auto-director stands down (returns null). */
export async function setMode(productionId: string, mode: DirectorMode, by: string): Promise<void> {
  try {
    await setDoc(productionRef(productionId), stripUndefined({
      directionState: { mode, updatedBy: by },
      updatedAt: Date.now(),
    }), { merge: true });
  } catch (e) {
    console.warn('[smartDirector] setMode failed:', (e as Error)?.message);
  }
}

/** Update director timing knobs. */
export async function updateSettings(productionId: string, patch: Partial<ProductionSettings>): Promise<void> {
  try {
    await setDoc(productionRef(productionId), stripUndefined({
      settings: patch,
      updatedAt: Date.now(),
    }), { merge: true });
  } catch (e) {
    console.warn('[smartDirector] updateSettings failed:', (e as Error)?.message);
  }
}

export async function endProduction(productionId: string): Promise<void> {
  try {
    await setDoc(productionRef(productionId), stripUndefined({
      status: 'ENDED' as ProductionStatus,
      updatedAt: Date.now(),
    }), { merge: true });
  } catch (e) {
    console.warn('[smartDirector] endProduction failed:', (e as Error)?.message);
  }
}

// ─── Subscriber ───────────────────────────────────────────────────────────────

export function subscribeProduction(
  productionId: string,
  callback: (production: SmartProduction | null) => void,
): () => void {
  return onSnapshot(productionRef(productionId), snap => {
    callback(snap.exists() ? (snap.data() as SmartProduction) : null);
  });
}
