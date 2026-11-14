// Which recent Tela documents to show on the Tela home page, and under which filter.
//
// Tela docs are local-first: everything in this browser's storage lists, whichever account saved it,
// plus the projects other people share with you (services/coedit). So the home page filters:
//   • Mine   — docs you made, or edited yourself (TelaDoc.editedBy, stamped on your first edit).
//   • an org — docs made for that organization (TelaDoc.orgOrigin / the shared project's orgId) that are
//              yours or were shared with you, in an org you belong to (or made docs for yourself).
//   • Shared — docs other people shared with you.
// Pure: TelaHome and the tests call it.
import type { TelaDocMeta } from '../../types';

export type RecentScope = { kind: 'mine' } | { kind: 'org'; orgId: string } | { kind: 'shared' };

/** No account, or a doc made signed out on this device. */
const isLocalOwner = (ownerId: string) => !ownerId || ownerId === 'local';

export function isMine(d: TelaDocMeta, uid: string | null | undefined): boolean {
  if (!uid) return isLocalOwner(d.ownerId);
  return d.ownerId === uid || (d.editedBy || []).includes(uid);
}

/** Shared with this user by someone else (and not something they've worked on as their own). */
export function isSharedWithMe(d: TelaDocMeta, uid: string | null | undefined): boolean {
  return !!uid && !!d.sharedBy && d.ownerId !== uid;
}

/** Orgs whose documents this user may list: active memberships, plus orgs they made their own docs for. */
export function permittedOrgIds(docs: TelaDocMeta[], uid: string | null | undefined, memberOrgIds: Iterable<string>): Set<string> {
  const ok = new Set(memberOrgIds);
  if (uid) for (const d of docs) if (d.orgId && d.ownerId === uid) ok.add(d.orgId);
  return ok;
}

/** Docs this user may see at all: their own, plus shares (which carry the owner's permission). */
const visible = (d: TelaDocMeta, uid: string | null | undefined) => isMine(d, uid) || isSharedWithMe(d, uid);

export function filterRecents(docs: TelaDocMeta[], scope: RecentScope, uid: string | null | undefined, memberOrgIds: Iterable<string> = []): TelaDocMeta[] {
  if (scope.kind === 'mine') return docs.filter(d => isMine(d, uid));
  if (scope.kind === 'shared') return docs.filter(d => isSharedWithMe(d, uid));
  const ok = permittedOrgIds(docs, uid, memberOrgIds);
  if (!ok.has(scope.orgId)) return [];
  return docs.filter(d => d.orgId === scope.orgId && visible(d, uid));
}

export interface OrgChoice {
  orgId: string;
  orgName: string;
  count: number;
}

/** One filter chip per org that has documents this user may see, most documents first. */
export function orgChoices(docs: TelaDocMeta[], uid: string | null | undefined, memberOrgIds: Iterable<string> = [], names: Record<string, string> = {}): OrgChoice[] {
  const ok = permittedOrgIds(docs, uid, memberOrgIds);
  const by = new Map<string, OrgChoice>();
  for (const d of docs) {
    if (!d.orgId || !ok.has(d.orgId) || !visible(d, uid)) continue;
    const c = by.get(d.orgId) || { orgId: d.orgId, orgName: '', count: 0 };
    c.count++;
    c.orgName = c.orgName || d.orgName || names[d.orgId] || '';
    by.set(d.orgId, c);
  }
  return [...by.values()].map(c => ({ ...c, orgName: c.orgName || names[c.orgId] || 'Organization' })).sort((a, b) => b.count - a.count || a.orgName.localeCompare(b.orgName));
}

/** Adds this user to a doc's editors the first time they change it. Returns the same object when nothing changes. */
export function stampEditor<T extends { editedBy?: string[] }>(doc: T, uid: string | null | undefined): T {
  if (!uid || (doc.editedBy || []).includes(uid)) return doc;
  return { ...doc, editedBy: [...(doc.editedBy || []), uid].slice(-50) };
}
