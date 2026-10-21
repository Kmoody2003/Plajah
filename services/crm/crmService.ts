/**
 * crmService — Firestore persistence for the business CRM.
 *
 * Collections (rules in firestore.rules: owner of businessPages/{businessId} or admin):
 *   crmContacts/{id}    — CrmContact, keyed by businessId = businessPages doc id
 *   crmActivities/{id}  — CrmActivity, append-only timeline
 *
 * Queries use a single equality filter (plus an optional second equality) and sort client-side, so no
 * composite index is required.
 *
 * Not here on purpose: an upsert-from-POS-sale hook. Sales are recorded server-side (routes/pos*) and
 * already bump totalSpend / visitCount; wiring CRM activity rows from there belongs in that route.
 */
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { CrmActivity, CrmContact } from '../../types';
import { planImport, type ImportPlan } from './crmCore';

export interface CrmActor { uid: string; displayName?: string }

const CONTACTS = 'crmContacts';
const ACTIVITIES = 'crmActivities';

/** Firestore rejects `undefined`; strip it recursively (keeps null, arrays, nested maps). */
export function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(x => clean(x)) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) out[k] = clean(x);
    return out as T;
  }
  return v;
}

// ── Contacts ─────────────────────────────────────────────────────────────

export function subscribeContacts(
  businessId: string,
  cb: (contacts: CrmContact[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const q = query(collection(db, CONTACTS), where('businessId', '==', businessId));
  return onSnapshot(q, snap => {
    const rows = snap.docs.map(d => ({ ...(d.data() as CrmContact), id: d.id }));
    rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    cb(rows);
  }, e => onError?.(e));
}

function blankContact(businessId: string, id: string, now: number): CrmContact {
  return {
    id, businessId, name: 'Contact', tags: [], notes: '', rewardPoints: 0, totalSpend: 0, visitCount: 0, createdAt: now,
  };
}

/**
 * Create or update a contact. Sets updatedAt; when the stage (or pipeline) changes, stamps stageEnteredAt
 * and appends a 'stage' activity. Pass `prev` when you have it to save a read.
 */
export async function saveContact(
  input: Partial<CrmContact> & { businessId: string },
  actor: CrmActor,
  prev?: CrmContact | null,
): Promise<CrmContact> {
  const now = Date.now();
  const isNew = !input.id;
  const ref = isNew ? doc(collection(db, CONTACTS)) : doc(db, CONTACTS, input.id!);
  let before: CrmContact | null = prev ?? null;
  if (!isNew && !before) {
    const snap = await getDoc(ref);
    before = snap.exists() ? ({ ...(snap.data() as CrmContact), id: snap.id }) : null;
  }
  const base = before || blankContact(input.businessId, ref.id, now);
  const next: CrmContact = { ...base, ...input, id: ref.id, businessId: input.businessId, updatedAt: now };
  if (!next.name?.trim()) next.name = [next.firstName, next.lastName].filter(Boolean).join(' ') || next.email || 'Contact';

  const stageChanged = !!next.stageId && (next.stageId !== before?.stageId || next.pipelineId !== before?.pipelineId);
  if (stageChanged) next.stageEnteredAt = now;

  await setDoc(ref, clean(next));
  if (stageChanged) {
    await logActivity({
      businessId: next.businessId, contactId: next.id, kind: 'stage',
      summary: before?.stageId ? 'Moved stage' : 'Added to pipeline',
      fromStageId: before?.pipelineId === next.pipelineId ? before?.stageId : undefined,
      toStageId: next.stageId, byUid: actor.uid, byName: actor.displayName,
    }).catch(() => { /* timeline is best-effort; the move itself saved */ });
  } else if (isNew) {
    await logActivity({
      businessId: next.businessId, contactId: next.id, kind: 'system', summary: 'Contact created',
      byUid: actor.uid, byName: actor.displayName,
    }).catch(() => {});
  }
  return next;
}

export async function deleteContact(id: string): Promise<void> {
  await deleteDoc(doc(db, CONTACTS, id));
}

/** Patch many contacts at once (bulk tag / bulk stage). Stage changes get their own activity rows. */
export async function bulkUpdate(
  contacts: CrmContact[],
  patchFor: (c: CrmContact) => Partial<CrmContact> | null,
  actor: CrmActor,
): Promise<number> {
  const now = Date.now();
  let n = 0;
  for (let i = 0; i < contacts.length; i += 200) {
    const batch = writeBatch(db);
    for (const c of contacts.slice(i, i + 200)) {
      const patch = patchFor(c);
      if (!patch) continue;
      const stageChanged = !!patch.stageId && (patch.stageId !== c.stageId || (patch.pipelineId ?? c.pipelineId) !== c.pipelineId);
      const upd = clean({ ...patch, updatedAt: now, ...(stageChanged ? { stageEnteredAt: now } : {}) });
      batch.set(doc(db, CONTACTS, c.id), upd, { merge: true });
      if (stageChanged) {
        const a = doc(collection(db, ACTIVITIES));
        batch.set(a, clean<CrmActivity>({
          id: a.id, businessId: c.businessId, contactId: c.id, kind: 'stage', summary: 'Moved stage (bulk)',
          fromStageId: c.stageId, toStageId: patch.stageId, byUid: actor.uid, byName: actor.displayName, at: now,
        }));
      }
      n++;
    }
    await batch.commit();
  }
  return n;
}

// ── Activities ───────────────────────────────────────────────────────────

export function subscribeActivities(
  businessId: string,
  contactId: string | undefined,
  cb: (acts: CrmActivity[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const q = contactId
    ? query(collection(db, ACTIVITIES), where('businessId', '==', businessId), where('contactId', '==', contactId))
    : query(collection(db, ACTIVITIES), where('businessId', '==', businessId));
  return onSnapshot(q, snap => {
    const rows = snap.docs.map(d => ({ ...(d.data() as CrmActivity), id: d.id }));
    rows.sort((a, b) => b.at - a.at);
    cb(contactId ? rows : rows.slice(0, 300));
  }, e => onError?.(e));
}

export async function logActivity(a: Omit<CrmActivity, 'id' | 'at'> & { at?: number }): Promise<CrmActivity> {
  const ref = doc(collection(db, ACTIVITIES));
  const row: CrmActivity = { ...a, id: ref.id, at: a.at ?? Date.now() };
  await setDoc(ref, clean(row));
  return row;
}

/**
 * One activity per recipient (kind = channel) plus lastContactAt on each contact. Used by every
 * CorrespondenceStudio send so the timeline shows exactly what went to whom.
 */
export async function recordCorrespondence(
  contacts: CrmContact[],
  info: { kind: CrmActivity['kind']; summary: string; body?: string; templateId?: string },
  actor: CrmActor,
): Promise<void> {
  const now = Date.now();
  for (let i = 0; i < contacts.length; i += 200) {
    const batch = writeBatch(db);
    for (const c of contacts.slice(i, i + 200)) {
      const a = doc(collection(db, ACTIVITIES));
      batch.set(a, clean<CrmActivity>({
        id: a.id, businessId: c.businessId, contactId: c.id, kind: info.kind, summary: info.summary,
        body: info.body ? info.body.slice(0, 4000) : undefined, templateId: info.templateId,
        byUid: actor.uid, byName: actor.displayName, at: now,
      }));
      batch.set(doc(db, CONTACTS, c.id), { lastContactAt: now, updatedAt: now }, { merge: true });
    }
    await batch.commit();
  }
}

// ── Import ───────────────────────────────────────────────────────────────

export interface ImportResult { created: number; updated: number; duplicatesInFile: number; unchanged: number }

/** Import parsed CSV rows, de-duplicating by email / phone against the business's existing contacts. */
export async function importContacts(
  businessId: string,
  rows: Partial<CrmContact>[],
  actor: CrmActor,
  existing?: CrmContact[],
): Promise<ImportResult> {
  let current = existing;
  if (!current) {
    const snap = await getDocs(query(collection(db, CONTACTS), where('businessId', '==', businessId)));
    current = snap.docs.map(d => ({ ...(d.data() as CrmContact), id: d.id }));
  }
  const plan: ImportPlan = planImport(current, rows);
  const now = Date.now();
  const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
  for (const r of plan.creates) {
    ops.push(b => {
      const ref = doc(collection(db, CONTACTS));
      b.set(ref, clean({ ...blankContact(businessId, ref.id, now), ...r, id: ref.id, businessId, source: r.source || 'import', updatedAt: now }));
    });
  }
  for (const u of plan.updates) {
    ops.push(b => b.set(doc(db, CONTACTS, u.id), clean({ ...u.patch, updatedAt: now }), { merge: true }));
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
  void actor;
  return { created: plan.creates.length, updated: plan.updates.length, duplicatesInFile: plan.duplicatesInFile, unchanged: plan.unchanged };
}
