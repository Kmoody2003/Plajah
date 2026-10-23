// opsMirror — keeps read-only copies of the plajah-prod docs that plajah-ops rules authorize against.
//
// Firestore rules can only get()/exists() documents in their own database, and the ops rules
// (firestore.ops.rules) decide access from organizations (admins, creatorId, staffUids, pastorUids…),
// productions, businessPages and admins. So those collections are copied, field-for-field, into
// plajah-ops. No client rule allows them there; only this server writes them.
//
// Every entry point COPIES THE CURRENT TRUTH from plajah-prod and never trusts a request body, so the
// endpoints that trigger it can be unauthenticated: the worst a forged call can do is cause a re-copy.
//   • mirrorDoc       — one document (Eventarc write trigger, or the client right after it edits an org)
//   • reconcileMirrors — every document of every mirrored collection; also drops copies whose source is gone
//
// Server-only. Talks Firestore REST with the caller's service-account headers, like the rest of server.ts.

import { OPS_DATABASE_ID, OPS_MIRRORED_COLLECTIONS, PROD_DATABASE_ID } from './opsCollections';

const PROJECT_ID = 'gen-lang-client-0665118474';
const root = (db: string) => `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${db}/documents`;
const MIRRORED: ReadonlySet<string> = new Set(OPS_MIRRORED_COLLECTIONS);

export type AuthHeaders = () => Promise<Record<string, string>>;

/** True when `collection/id` is a mirrored top-level doc (no subcollections are mirrored). */
export const isMirroredPath = (collection: string, id: string) =>
  MIRRORED.has(collection) && !!id && !id.includes('/');

/** Copy plajah-prod/{collection}/{id} into plajah-ops, or delete the copy if the source is gone. */
export async function mirrorDoc(authHeaders: AuthHeaders, collection: string, id: string): Promise<'copied' | 'deleted' | 'skipped' | 'error'> {
  if (!isMirroredPath(collection, id)) return 'skipped';
  const h = await authHeaders();
  const path = `${collection}/${encodeURIComponent(id)}`;
  try {
    const src = await fetch(`${root(PROD_DATABASE_ID)}/${path}`, { headers: h });
    if (src.status === 404) {
      const del = await fetch(`${root(OPS_DATABASE_ID)}/${path}`, { method: 'DELETE', headers: h });
      return del.ok || del.status === 404 ? 'deleted' : 'error';
    }
    if (!src.ok) return 'error';
    const j = await src.json() as { fields?: Record<string, unknown> };
    // PATCH without an update mask replaces the whole document, so removed fields are removed here too.
    const put = await fetch(`${root(OPS_DATABASE_ID)}/${path}`, {
      method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: j.fields || {} }),
    });
    return put.ok ? 'copied' : 'error';
  } catch { return 'error'; }
}

async function listIds(h: Record<string, string>, db: string, collection: string): Promise<string[] | null> {
  const ids: string[] = [];
  let pageToken = '';
  do {
    const qs = `pageSize=300&mask.fieldPaths=__name__${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const r = await fetch(`${root(db)}/${collection}?${qs}`, { headers: h });
    if (!r.ok) return null;
    const j = await r.json() as { documents?: { name: string }[]; nextPageToken?: string };
    for (const d of j.documents || []) ids.push(decodeURIComponent(d.name.split('/').pop()!));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return ids;
}

/** Re-copy every mirrored doc and delete copies whose source no longer exists. */
export async function reconcileMirrors(authHeaders: AuthHeaders): Promise<Record<string, { copied: number; deleted: number; errors: number }>> {
  const out: Record<string, { copied: number; deleted: number; errors: number }> = {};
  for (const collection of OPS_MIRRORED_COLLECTIONS) {
    const tally = { copied: 0, deleted: 0, errors: 0 };
    out[collection] = tally;
    const h = await authHeaders();
    const [prodIds, opsIds] = await Promise.all([listIds(h, PROD_DATABASE_ID, collection), listIds(h, OPS_DATABASE_ID, collection)]);
    if (!prodIds || !opsIds) { tally.errors++; continue; }
    const live = new Set(prodIds);
    // mirrorDoc deletes the copy when its source is missing, so one pass over both sets covers both cases.
    for (const id of new Set([...prodIds, ...opsIds.filter(x => !live.has(x))])) {
      const r = await mirrorDoc(authHeaders, collection, id);
      if (r === 'copied') tally.copied++; else if (r === 'deleted') tally.deleted++; else if (r === 'error') tally.errors++;
    }
  }
  return out;
}

/** The doc a Firestore Eventarc CloudEvent is about, from its `ce-subject` header
 *  ("documents/organizations/abc"). The event body is ignored on purpose. */
export function subjectToDoc(subject: string | undefined): { collection: string; id: string } | null {
  const m = /^documents\/([^/]+)\/([^/]+)$/.exec(String(subject || ''));
  return m ? { collection: m[1], id: decodeURIComponent(m[2]) } : null;
}
