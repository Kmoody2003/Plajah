/**
 * protectedThreads — the single guard for Source Mode's "protected thread" rules.
 *
 * A thread (chat room or a mail conversation) marked protected must obey a set of
 * hard operational rules: never sent to AI, no notification previews, no breadcrumbs,
 * photo metadata stripped, no link unfurling, excluded from export and search, and
 * optional auto-delete. Those rules are ENFORCED IN ONE PLACE — here — because a rule
 * enforced in components quietly stops applying the day someone adds a seventh place
 * that renders or sends a message. Every call site asks this module; nobody re-decides.
 *
 * The protected flag lives on chat_rooms/{roomId}. This module caches it so the common
 * "is this protected?" check on a hot path (before an AI call, before a push) is cheap.
 *
 * PHASE 1 SCOPE: protected messages are NOT yet end-to-end encrypted — the server can
 * still read them. What this closes is the operational leaks, which is where real-world
 * harm overwhelmingly comes from. The E2EE upgrade is Phase 2; see the disclosure panel.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { setTracePrivate } from './sessionTrace';
import { isProbablyImage, stripImageMetadata } from './exifService';
import type { ProtectedThreadConfig } from '../types';

/** Thrown when a caller tries to do something a protected thread forbids. */
export class ProtectedThreadError extends Error {
  constructor(message = 'This is a protected conversation.') {
    super(message);
    this.name = 'ProtectedThreadError';
  }
}

/* ── Protected-flag cache ───────────────────────────────────────────────────── */

const cache = new Map<string, ProtectedThreadConfig>();

/** Best-effort synchronous read for hot paths that already warmed the cache. */
export function isProtectedCached(roomId: string): boolean {
  return cache.get(roomId)?.protected === true;
}

/** Authoritative read of a thread's protection config. Cached after first fetch. */
export async function getThreadConfig(roomId: string): Promise<ProtectedThreadConfig> {
  const cached = cache.get(roomId);
  if (cached) return cached;
  let config: ProtectedThreadConfig = { protected: false, retentionDays: null };
  try {
    const snap = await getDoc(doc(db, 'chat_rooms', roomId));
    if (snap.exists()) {
      const data = snap.data() as { protected?: boolean; retentionDays?: number | null };
      config = { protected: data.protected === true, retentionDays: data.retentionDays ?? null };
    }
  } catch {
    // On a read failure, fail SAFE: treat as protected so we do not leak by default.
    config = { protected: true, retentionDays: null };
  }
  cache.set(roomId, config);
  return config;
}

export async function isThreadProtected(roomId: string): Promise<boolean> {
  return (await getThreadConfig(roomId)).protected;
}

/** Turn protection on or off for a thread, and refresh the cache. */
export async function setThreadProtected(
  roomId: string,
  on: boolean,
  retentionDays: number | null = null,
): Promise<void> {
  await setDoc(
    doc(db, 'chat_rooms', roomId),
    { protected: on, retentionDays: on ? retentionDays : null },
    { merge: true },
  );
  cache.set(roomId, { protected: on, retentionDays: on ? retentionDays : null });
}

/* ── Guard 1 · never send a protected thread to AI ──────────────────────────── */

/**
 * Call before ANY /api/ai/* request that includes conversation content. Throws if the
 * thread is protected. This is the client half; the belt-and-suspenders server refusal
 * belongs in the AI routes once they carry a thread id.
 */
export async function assertAiAllowed(roomId: string | undefined): Promise<void> {
  if (!roomId) return;
  if (await isThreadProtected(roomId)) {
    throw new ProtectedThreadError('Protected conversations are never sent to AI features.');
  }
}

/* ── Guard 2 · notifications carry no content ───────────────────────────────── */

export interface NotificationCopy { title: string; body: string }

const REDACTED: NotificationCopy = { title: 'Plajah', body: 'New protected message' };

/**
 * Redact a push payload for a protected thread. ASYNC and FAIL-CLOSED: it awaits the
 * authoritative config, and if that read fails it redacts. Notifications frequently run
 * in a cold context (service worker, first message after reload) where a cache would be
 * empty, so a sync cache-based version would leak sender + body onto a lock screen on a
 * miss — the exact thing this prevents. Only a CONFIRMED non-protected thread keeps its
 * original copy.
 */
export async function redactNotification(roomId: string, original: NotificationCopy): Promise<NotificationCopy> {
  try {
    return (await getThreadConfig(roomId)).protected ? REDACTED : original;
  } catch {
    return REDACTED;
  }
}

/** Sync best-effort variant for a already-warm cache. Fails closed on a miss: if the
 *  thread's protection is unknown, it redacts. Prefer the async version off a hot path. */
export function redactNotificationCached(roomId: string, original: NotificationCopy): NotificationCopy {
  return cache.get(roomId)?.protected === false ? original : REDACTED;
}

/* ── Guard 3 · strip photo metadata before sending ──────────────────────────── */

/**
 * Sanitise an attachment for a protected thread: re-encode to discard EXIF/GPS. Images
 * only; other file types are passed through unchanged (and the UI should warn that a
 * document may carry its own metadata). Throws if an image cannot be sanitised, so the
 * caller blocks the send rather than leaking.
 */
export async function sanitizeAttachment(roomId: string, file: Blob): Promise<Blob> {
  if (!(await isThreadProtected(roomId))) return file;
  // Detect images by magic bytes, not the (often empty/generic) MIME type — a JPEG with
  // GPS that arrives as application/octet-stream must still be stripped.
  if (await isProbablyImage(file)) return stripImageMetadata(file);
  return file;
}

/* ── Guard 4 · breadcrumbs off while a protected thread is open ──────────────── */

let openProtectedCount = 0;

/**
 * Call on entering/leaving a protected surface (a protected thread, or the vault).
 * Reference-counted so nested opens behave, and it suspends the breadcrumb trail while
 * anything sensitive is on screen.
 */
export function markProtectedSurfaceOpen(open: boolean): void {
  openProtectedCount = Math.max(0, openProtectedCount + (open ? 1 : -1));
  setTracePrivate(openProtectedCount > 0);
}

/* ── Guard 5 · link unfurling ───────────────────────────────────────────────── */

/** Whether it is safe to fetch a link preview in this thread. */
export async function mayUnfurlLinks(roomId: string): Promise<boolean> {
  return !(await isThreadProtected(roomId));
}

/* ── Guard 6 · retention ────────────────────────────────────────────────────── */

/** True when a message older than the thread's retention window should be deleted. */
export function isExpired(config: ProtectedThreadConfig, messageTimestamp: number): boolean {
  if (!config.protected || !config.retentionDays) return false;
  const ageMs = Date.now() - messageTimestamp;
  return ageMs > config.retentionDays * 24 * 60 * 60 * 1000;
}
