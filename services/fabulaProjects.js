import { db, storage, auth } from './firebase';
import { doc, setDoc, getDoc, getDocs, collection, query, where, deleteDoc } from 'firebase/firestore';
import { ref, uploadString, getBytes, deleteObject } from 'firebase/storage';

// ─────────────────────────────────────────────────────────────────────────
// Fabula project cloud persistence.
//
// Projects used to live ONLY in the browser's IndexedDB (idb-keyval), so they
// vanished on any storage eviction / site-data clear / different device, and
// save failures were swallowed silently. This makes projects durably live on
// the platform: the full project JSON goes to Firebase Storage (no 1 MB doc
// limit) and a small Firestore index doc backs listing + ownership. IndexedDB
// stays as a fast local cache in Fabula.jsx.
// ─────────────────────────────────────────────────────────────────────────

const COLLECTION = 'fabula_projects';
const storagePathFor = (uid, id) => `fabula/${uid}/${id}.json`;

/** Freshen the active account's token before any Storage/Firestore write (hot-switch gotcha). */
async function activeUid() {
  const u = auth.currentUser;
  if (!u) return null;
  try { await u.getIdToken(true); } catch { /* the write below surfaces a real auth error */ }
  return u.uid;
}

function sceneCountOf(project) {
  try { return (project.acts || []).reduce((n, a) => n + (a.scenes || []).length, 0); }
  catch { return 0; }
}

/** Save a project to the cloud (Storage JSON + Firestore index doc). Returns {ok, error?}. */
export async function saveProjectCloud(project) {
  if (!project || !project.id) return { ok: false, error: 'no-project' };
  const uid = await activeUid();
  if (!uid) return { ok: false, error: 'signed-out' };
  const storagePath = storagePathFor(uid, project.id);
  try {
    // JSON.stringify drops `undefined`, sidestepping the Firestore undefined-throw gotcha.
    await uploadString(ref(storage, storagePath), JSON.stringify(project), 'raw', { contentType: 'application/json' });
    await setDoc(doc(db, COLLECTION, project.id), {
      id: project.id,
      ownerId: uid,
      title: project.title || 'Untitled',
      type: project.type || 'film',
      updated: Date.now(),
      sceneCount: sceneCountOf(project),
      storagePath,
    }, { merge: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

/** List the signed-in user's cloud projects as index entries (client-sorted, newest first). */
export async function listProjectsCloud() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), where('ownerId', '==', uid)));
    return snap.docs
      .map((d) => d.data())
      .map((r) => ({ id: r.id, title: r.title || 'Untitled', type: r.type || 'film', updated: r.updated || 0, sceneCount: r.sceneCount || 0 }))
      .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  } catch {
    return []; // offline / rules — fall back to local
  }
}

/** Load a full project from the cloud, or null if absent/denied. */
export async function loadProjectCloud(id) {
  const uid = auth.currentUser?.uid;
  if (!uid || !id) return null;
  try {
    const meta = await getDoc(doc(db, COLLECTION, id));
    if (!meta.exists()) return null;
    const storagePath = meta.data().storagePath || storagePathFor(uid, id);
    const bytes = await getBytes(ref(storage, storagePath));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Delete a project's cloud artifacts (Storage object + index doc). Best-effort. */
export async function deleteProjectCloud(id) {
  const uid = auth.currentUser?.uid;
  if (!uid || !id) return;
  try {
    const meta = await getDoc(doc(db, COLLECTION, id));
    const storagePath = meta.exists() ? (meta.data().storagePath || storagePathFor(uid, id)) : storagePathFor(uid, id);
    try { await deleteObject(ref(storage, storagePath)); } catch { /* may already be gone */ }
    await deleteDoc(doc(db, COLLECTION, id));
  } catch { /* best-effort */ }
}
