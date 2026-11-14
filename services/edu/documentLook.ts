// services/edu/documentLook.ts — whose look a lesson wears.
//
// The same lesson can go to many classes. What it SAYS, who may open it and how it is graded
// never change with the look; only the design does (one of the living templates in
// services/council/livingDocumentTemplates). The look is decided in this order:
//
//   1. the look the teacher picked for this assignment
//   2. the teacher's own look (their default in this organization)
//   3. the department's default (set by the org's admins)
//   4. the organization's default (set by the org's admins)
//   5. the lesson's own template, else the platform default
//
// Org and department defaults live in plajah-ops `orgTemplatePolicies/{orgId}` (admins write,
// everyone signed in reads). A teacher's own look lives in `eduTeacherLooks/{orgId}_{uid}`.
// Changing a look is never a content change: it does not make a custom copy of the lesson.
// Changing the WORDS does (lessonLibraryStore.copyAsTemplate → the teacher's custom lessons).
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, opsDb } from '../firebase';
import { validLook as valid, type EduLook, type OrgLooks } from './documentLookCore';
export * from './documentLookCore';

// ── Storage ─────────────────────────────────────────────────────────────────────────────────
const clean = (l: EduLook | undefined | null): EduLook => ({ ...(valid(l?.worksheet) ? { worksheet: l!.worksheet } : {}), ...(valid(l?.test) ? { test: l!.test } : {}) });
const readLocal = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const writeLocal = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };
export const LOOKS_CHANGED = 'plajah:eduLooksChanged';
const changed = () => { try { window.dispatchEvent(new Event(LOOKS_CHANGED)); } catch { /* not in a window */ } };
const ORG_KEY = (orgId: string) => `plajah:eduLooks:org:${orgId}`;
const MY_KEY = (orgId: string, uid: string) => `plajah:eduLooks:teacher:${orgId}:${uid}`;

function fromPolicy(d: Record<string, unknown> | undefined): OrgLooks {
  const dep = (d?.eduDeptLooks && typeof d.eduDeptLooks === 'object' ? d.eduDeptLooks : {}) as Record<string, EduLook>;
  const departments: Record<string, EduLook> = {};
  for (const [id, l] of Object.entries(dep)) { const c = clean(l); if (c.worksheet || c.test) departments[id] = c; }
  return { org: clean(d?.eduLook as EduLook | undefined), departments };
}

export async function getOrgLooks(orgId: string): Promise<OrgLooks> {
  if (!orgId) return { org: {}, departments: {} };
  if (auth.currentUser) {
    try {
      const s = await getDoc(doc(opsDb, 'orgTemplatePolicies', orgId));
      const looks = fromPolicy(s.exists() ? s.data() : undefined);
      writeLocal(ORG_KEY(orgId), looks);
      return looks;
    } catch { /* offline: the last copy this device saw */ }
  }
  return readLocal<OrgLooks>(ORG_KEY(orgId)) || { org: {}, departments: {} };
}

/** Org admins only (the rules refuse anyone else). Other fields of the policy doc are left alone. */
export async function setOrgLooks(orgId: string, looks: OrgLooks): Promise<{ synced: boolean }> {
  const next = fromPolicy({ eduLook: looks.org, eduDeptLooks: looks.departments });
  let synced = false;
  if (auth.currentUser) {
    try {
      await setDoc(doc(opsDb, 'orgTemplatePolicies', orgId), { orgId, eduLook: next.org, eduDeptLooks: next.departments, eduLooksUpdatedBy: auth.currentUser.uid, eduLooksUpdatedAt: Date.now() }, { merge: true });
      synced = true;
    } catch { /* not an admin, or offline */ }
  }
  if (synced) { writeLocal(ORG_KEY(orgId), next); changed(); }
  return { synced };
}

const teacherDocId = (orgId: string, uid: string) => `${orgId || 'me'}_${uid}`;

export async function getTeacherLook(orgId: string, uid: string): Promise<EduLook> {
  if (!uid) return {};
  if (auth.currentUser?.uid === uid) {
    try {
      const s = await getDoc(doc(opsDb, 'eduTeacherLooks', teacherDocId(orgId, uid)));
      const look = clean(s.exists() ? (s.data().look as EduLook) : undefined);
      writeLocal(MY_KEY(orgId, uid), look);
      return look;
    } catch { /* offline, or the rule isn't live yet: this device's copy */ }
  }
  return clean(readLocal<EduLook>(MY_KEY(orgId, uid)));
}

/** A teacher's own look. Always kept on this device; `synced` says whether it reached their account. */
export async function setTeacherLook(orgId: string, uid: string, look: EduLook): Promise<{ synced: boolean }> {
  const next = clean(look);
  writeLocal(MY_KEY(orgId, uid), next);
  let synced = false;
  if (auth.currentUser?.uid === uid) {
    try {
      await setDoc(doc(opsDb, 'eduTeacherLooks', teacherDocId(orgId, uid)), { orgId: orgId || '', uid, look: next, updatedAt: Date.now() });
      synced = true;
    } catch { /* offline */ }
  }
  changed();
  return { synced };
}
