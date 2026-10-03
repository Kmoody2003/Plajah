// amboStorageService.ts — Offline-first persistence and multi-tier auto-save for Ambo projects.
// Persists instantaneously to IndexedDB + LocalStorage, and syncs to Firestore when authenticated.

import { get, set, del } from 'idb-keyval';
import {
  type AmboProject,
  type AmboProjectSummary,
  type ProjectScope,
  createDefaultProject,
  countProjectSlides,
  validateAmboProject,
} from './amboProjectModel';
import { auth, db } from '../backendService';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

const IDB_PREFIX = 'pj.ambo.prj.';
const IDB_INDEX_KEY = 'pj.ambo.projects.index';
const ACTIVE_PROJECT_KEY = 'pj.ambo.active.project.id';

/** Get the currently active project ID */
export function getActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
}

/** Set the currently active project ID */
export function setActiveProjectId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  } catch {}
}

/** Retrieve all cached project summaries from local storage */
export async function listLocalProjects(): Promise<AmboProjectSummary[]> {
  try {
    const raw = await get<AmboProjectSummary[]>(IDB_INDEX_KEY);
    if (Array.isArray(raw)) return raw;
  } catch {}
  return [];
}

/** Update the local project summaries index */
async function updateLocalIndex(summary: AmboProjectSummary, remove = false): Promise<void> {
  try {
    const list = await listLocalProjects();
    const filtered = list.filter(p => p.id !== summary.id);
    const updated = remove ? filtered : [summary, ...filtered];
    await set(IDB_INDEX_KEY, updated);
  } catch {}
}

/**
 * Load project by ID with fallback hierarchy:
 * 1. IndexedDB
 * 2. Firestore Cloud (if authenticated)
 * 3. Default fallback project
 */
export async function loadProject(projectId: string): Promise<AmboProject | null> {
  // 1. Try local IndexedDB
  try {
    const local = await get<AmboProject>(`${IDB_PREFIX}${projectId}`);
    if (local && validateAmboProject(local).valid) {
      return local;
    }
  } catch {}

  // 2. Try Firestore Cloud if online and authenticated
  const currentUser = auth?.currentUser;
  if (currentUser && db) {
    try {
      // Check user projects
      const userDocRef = doc(db, 'users', currentUser.uid, 'amboProjects', projectId);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const data = userDoc.data() as AmboProject;
        // Cache locally for offline use
        await set(`${IDB_PREFIX}${projectId}`, data);
        return data;
      }
    } catch {}
  }

  return null;
}

/**
 * Save project instantaneously to IndexedDB and sync to cloud in background.
 */
export async function saveProject(project: AmboProject): Promise<{ success: boolean; cloudSynced: boolean }> {
  const updatedProject: AmboProject = {
    ...project,
    updatedAt: Date.now(),
  };

  const summary: AmboProjectSummary = {
    id: updatedProject.id,
    name: updatedProject.name,
    scope: updatedProject.scope,
    organizationId: updatedProject.organizationId,
    organizationName: updatedProject.organizationName,
    updatedAt: updatedProject.updatedAt,
    showCount: updatedProject.shows.length,
    slideCount: countProjectSlides(updatedProject),
  };

  // 1. Write through to IndexedDB
  if (typeof indexedDB !== 'undefined') {
    try {
      await set(`${IDB_PREFIX}${updatedProject.id}`, updatedProject);
      await updateLocalIndex(summary);
      setActiveProjectId(updatedProject.id);
    } catch (err) {
      console.error('Failed to save Ambo project to IndexedDB', err);
      return { success: false, cloudSynced: false };
    }
  } else {
    setActiveProjectId(updatedProject.id);
  }

  // 2. Sync to Firestore if authenticated
  let cloudSynced = false;
  const currentUser = auth?.currentUser;
  if (currentUser && db) {
    try {
      let docRef;
      if (updatedProject.scope === 'ORGANIZATION' && updatedProject.organizationId) {
        docRef = doc(db, 'organizations', updatedProject.organizationId, 'amboProjects', updatedProject.id);
      } else {
        docRef = doc(db, 'users', currentUser.uid, 'amboProjects', updatedProject.id);
      }
      await setDoc(docRef, JSON.parse(JSON.stringify(updatedProject)), { merge: true });
      cloudSynced = true;
    } catch (e) {
      // Offline or network drop — local IndexedDB holds the authoritative copy
      cloudSynced = false;
    }
  }

  return { success: true, cloudSynced };
}

/**
 * List all projects for a specific scope (Personal or Organization).
 */
export async function listProjects(
  scope: ProjectScope = 'USER',
  organizationId?: string,
): Promise<AmboProjectSummary[]> {
  const localList = await listLocalProjects();
  let filtered = localList.filter(p => {
    if (scope === 'ORGANIZATION') {
      return p.scope === 'ORGANIZATION' && (!organizationId || p.organizationId === organizationId);
    }
    return p.scope === 'USER';
  });

  // Attempt to merge from Firestore if authenticated
  const currentUser = auth?.currentUser;
  if (currentUser && db) {
    try {
      let q;
      if (scope === 'ORGANIZATION' && organizationId) {
        q = query(collection(db, 'organizations', organizationId, 'amboProjects'), orderBy('updatedAt', 'desc'));
      } else {
        q = query(collection(db, 'users', currentUser.uid, 'amboProjects'), orderBy('updatedAt', 'desc'));
      }
      const snap = await getDocs(q);
      const cloudSummaries: AmboProjectSummary[] = snap.docs.map(d => {
        const data = d.data() as AmboProject;
        return {
          id: data.id,
          name: data.name,
          scope: data.scope || scope,
          organizationId: data.organizationId,
          organizationName: data.organizationName,
          updatedAt: data.updatedAt || Date.now(),
          showCount: data.shows?.length || 0,
          slideCount: countProjectSlides(data),
        };
      });

      // Merge and deduplicate by ID
      const map = new Map<string, AmboProjectSummary>();
      for (const item of filtered) map.set(item.id, item);
      for (const item of cloudSummaries) map.set(item.id, item);
      filtered = Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {}
  }

  // If list is completely empty for local user, create a default template project
  if (filtered.length === 0 && scope === 'USER') {
    const defaultPrj = createDefaultProject('Sunday Gathering', 'USER', currentUser?.uid || 'local-user');
    await saveProject(defaultPrj);
    return [{
      id: defaultPrj.id,
      name: defaultPrj.name,
      scope: 'USER',
      updatedAt: defaultPrj.updatedAt,
      showCount: defaultPrj.shows.length,
      slideCount: countProjectSlides(defaultPrj),
    }];
  }

  return filtered;
}

/** Delete a project from local storage and cloud */
export async function deleteProject(projectId: string, scope: ProjectScope, organizationId?: string): Promise<boolean> {
  try {
    await del(`${IDB_PREFIX}${projectId}`);
    const summary: AmboProjectSummary = {
      id: projectId,
      name: '',
      scope,
      updatedAt: 0,
      showCount: 0,
      slideCount: 0,
    };
    await updateLocalIndex(summary, true);

    const currentUser = auth?.currentUser;
    if (currentUser && db) {
      const docRef = scope === 'ORGANIZATION' && organizationId
        ? doc(db, 'organizations', organizationId, 'amboProjects', projectId)
        : doc(db, 'users', currentUser.uid, 'amboProjects', projectId);
      await deleteDoc(docRef);
    }
    return true;
  } catch {
    return false;
  }
}

/** Duplicate an existing project */
export async function duplicateProject(projectId: string): Promise<AmboProject | null> {
  const original = await loadProject(projectId);
  if (!original) return null;

  const now = Date.now();
  const copy: AmboProject = {
    ...original,
    id: `prj_${now}_${Math.random().toString(36).substring(2, 7)}`,
    name: `${original.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };

  await saveProject(copy);
  return copy;
}

/** Save a project under a new name (Save As), persist it, and set as active */
export async function saveProjectAs(project: AmboProject, newName: string): Promise<AmboProject> {
  const now = Date.now();
  const copy: AmboProject = {
    ...project,
    id: `prj_${now}_${Math.random().toString(36).substring(2, 7)}`,
    name: newName.trim() || `${project.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };
  await saveProject(copy);
  setActiveProjectId(copy.id);
  return copy;
}
