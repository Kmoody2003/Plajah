/**
 * Plajah Pixels — Project Save / Load Service
 * Handles serialization and deserialization of .plajah project files,
 * plus cloud save/load to the user's Plajah profile via Firestore.
 */

import { PlajahProject, PlajahMediaRef, VisualizationConfig, BackgroundMedia } from '../types';
import { db, storage } from '../../../services/backendService';
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const FORMAT = 'plajah-pixels' as const;
const VERSION = '1.0.0';

// ─── Audio helpers ────────────────────────────────────────────────────────────

async function blobUrlToDataUrl(blobUrl: string): Promise<{ dataUrl: string; mimeType: string } | null> {
  try {
    const res = await fetch(blobUrl);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result as string, mimeType: blob.type || 'audio/mpeg' });
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function dataUrlToObjectUrl(dataUrl: string): string {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'audio/mpeg';
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: mime }));
}

// ─── Save ─────────────────────────────────────────────────────────────────────

/**
 * Convert a BackgroundMedia array to PlajahMediaRef[] for serialization.
 * Local blob: URLs are stored as data-URLs (re-encoded) so they survive across sessions.
 * Remote URLs are stored as-is.
 */
async function serializeMediaList(mediaList: BackgroundMedia[]): Promise<PlajahMediaRef[]> {
  const results: PlajahMediaRef[] = [];

  for (const m of mediaList) {
    const isBlob = m.url.startsWith('blob:');
    const isData = m.url.startsWith('data:');
    const isRemote = !isBlob && !isData;

    if (isRemote) {
      results.push({ id: m.id, type: m.type, name: m.id, url: m.url, isRemote: true });
    } else if (isData) {
      // Already a data-URL — store directly
      const name = m.id.length < 40 ? m.id : `${m.type}-${m.id.substring(0, 8)}`;
      results.push({ id: m.id, type: m.type, name, url: m.url, isRemote: false });
    } else if (isBlob) {
      // Fetch the blob and convert to data-URL for persistence
      try {
        const response = await fetch(m.url);
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const name = m.id.length < 40 ? m.id : `${m.type}-${m.id.substring(0, 8)}`;
        results.push({ id: m.id, type: m.type, name, url: dataUrl, isRemote: false });
      } catch (err) {
        console.warn('[Plajah] Could not serialize blob URL for media:', m.id, err);
        // Skip this entry rather than corrupting the project file
      }
    }
  }

  return results;
}

/**
 * Serialize the full app state into a PlajahProject and trigger a .plajah download.
 * audioBlobUrl — the blob: URL currently loaded in the <audio> element.
 */
export async function saveProject(
  config: VisualizationConfig,
  bgMedia1: BackgroundMedia[],
  bgMedia2: BackgroundMedia[],
  audioFileName?: string,
  audioBlobUrl?: string
): Promise<void> {
  const [serialized1, serialized2, audioResult] = await Promise.all([
    serializeMediaList(bgMedia1),
    serializeMediaList(bgMedia2),
    audioBlobUrl ? blobUrlToDataUrl(audioBlobUrl) : Promise.resolve(null),
  ]);

  const project: PlajahProject = {
    __format: FORMAT,
    version: VERSION,
    projectName: config.name || 'Plajah Project',
    savedAt: new Date().toISOString(),
    config,
    bgMedia1: serialized1,
    bgMedia2: serialized2,
    audioFileName,
    audioData: audioResult?.dataUrl,
    audioMimeType: audioResult?.mimeType,
  };

  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(project.projectName)}.plajah`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export interface LoadedProject {
  config: VisualizationConfig;
  bgMedia1: BackgroundMedia[];
  bgMedia2: BackgroundMedia[];
  projectName: string;
  savedAt: string;
  audioFileName?: string;
  /** Blob object-URL ready to set as audio.src (caller must revoke when done) */
  audioBlobUrl?: string;
}

/**
 * Deserialize a PlajahMediaRef[] back into BackgroundMedia[] usable by the app.
 * Data-URLs are converted back to blob: URLs for efficient in-memory use.
 */
function deserializeMediaList(refs: PlajahMediaRef[]): BackgroundMedia[] {
  return refs.map(ref => {
    if (ref.isRemote || ref.url.startsWith('data:')) {
      // Remote URLs and data-URLs can be used directly
      // (data-URL is a bit slow for video but works fine for images)
      return { id: ref.id, type: ref.type, url: ref.url };
    }
    return { id: ref.id, type: ref.type, url: ref.url };
  });
}

/**
 * Load a .plajah project file selected by the user.
 * Returns structured data ready to be set into app state.
 */
export function loadProject(file: File): Promise<LoadedProject> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const raw = event.target?.result as string;
        const project: PlajahProject = JSON.parse(raw);

        // Validate format
        if (project.__format !== FORMAT) {
          throw new Error(`Not a valid Plajah Pixels project file (got format: "${project.__format}")`);
        }

        const audioBlobUrl = project.audioData ? dataUrlToObjectUrl(project.audioData) : undefined;
        resolve({
          config: project.config,
          bgMedia1: deserializeMediaList(project.bgMedia1 ?? []),
          bgMedia2: deserializeMediaList(project.bgMedia2 ?? []),
          projectName: project.projectName,
          savedAt: project.savedAt,
          audioFileName: project.audioFileName,
          audioBlobUrl,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read project file'));
    reader.readAsText(file);
  });
}

// ─── Cloud Save / Load ────────────────────────────────────────────────────────

export interface CloudProjectMeta {
  id: string;
  projectName: string;
  savedAt: string;
  mode: string;
  thumbnail?: string; // data-URL of a canvas screenshot, optional
}

/**
 * Save a project to the user's profile in Firestore.
 * Path: users/{uid}/plajahProjects/{projectId}
 * The project JSON is stored as a string field to avoid Firestore size limits on objects.
 */
export async function saveProjectToCloud(
  uid: string,
  config: VisualizationConfig,
  bgMedia1: BackgroundMedia[],
  bgMedia2: BackgroundMedia[],
  audioFileName?: string,
  audioBlobUrl?: string,
  thumbnail?: string
): Promise<string> {
  const [serialized1, serialized2] = await Promise.all([
    serializeMediaList(bgMedia1),
    serializeMediaList(bgMedia2),
  ]);

  const projectsCol = collection(db, 'users', uid, 'plajahProjects');
  const projectRef = doc(projectsCol);

  // Upload audio to Firebase Storage (avoids Firestore 1 MB doc limit)
  let audioStorageUrl: string | undefined;
  if (audioBlobUrl) {
    try {
      const res = await fetch(audioBlobUrl);
      const audioBlob = await res.blob();
      const ext = audioFileName?.split('.').pop() ?? 'mp3';
      const audioRef = storageRef(storage, `users/${uid}/plajahAudio/${projectRef.id}.${ext}`);
      await uploadBytes(audioRef, audioBlob, { contentType: audioBlob.type || 'audio/mpeg' });
      audioStorageUrl = await getDownloadURL(audioRef);
    } catch (e) {
      console.warn('[projectService] Could not upload audio to Storage:', e);
    }
  }

  const project: PlajahProject = {
    __format: 'plajah-pixels',
    version: '1.0.0',
    projectName: config.name || 'Plajah Project',
    savedAt: new Date().toISOString(),
    config,
    bgMedia1: serialized1,
    bgMedia2: serialized2,
    audioFileName,
    audioStorageUrl,
  };

  await setDoc(projectRef, {
    projectName: project.projectName,
    mode: config.mode,
    savedAt: serverTimestamp(),
    savedAtIso: project.savedAt,
    thumbnail: thumbnail ?? null,
    projectJson: JSON.stringify(project),
  });

  return projectRef.id;
}

/**
 * List all cloud-saved projects for a user, ordered by save date (newest first).
 */
export async function listCloudProjects(uid: string): Promise<CloudProjectMeta[]> {
  const projectsCol = collection(db, 'users', uid, 'plajahProjects');
  const q = query(projectsCol, orderBy('savedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    const savedAt = data.savedAt instanceof Timestamp
      ? data.savedAt.toDate().toISOString()
      : (data.savedAtIso ?? '');
    return {
      id: d.id,
      projectName: data.projectName ?? 'Untitled',
      savedAt,
      mode: data.mode ?? '',
      thumbnail: data.thumbnail ?? undefined,
    };
  });
}

/**
 * Load a specific cloud project by ID.
 */
export async function loadCloudProject(uid: string, projectId: string): Promise<LoadedProject> {
  const projectRef = doc(db, 'users', uid, 'plajahProjects', projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) throw new Error('Project not found');
  const data = snap.data();
  const project: PlajahProject = JSON.parse(data.projectJson);
  if (project.__format !== 'plajah-pixels') throw new Error('Invalid project format');

  // Audio: prefer Storage URL, fall back to embedded data-URL
  const audioSrc = project.audioStorageUrl ?? (project.audioData ? dataUrlToObjectUrl(project.audioData) : undefined);
  return {
    config: project.config,
    bgMedia1: deserializeMediaList(project.bgMedia1 ?? []),
    bgMedia2: deserializeMediaList(project.bgMedia2 ?? []),
    projectName: project.projectName,
    savedAt: project.savedAt,
    audioFileName: project.audioFileName,
    audioBlobUrl: audioSrc,
  };
}

/**
 * Delete a cloud project and its associated Storage assets.
 */
export async function deleteCloudProject(uid: string, projectId: string): Promise<void> {
  // Try to delete audio from Storage (best-effort — ignore if not found)
  for (const ext of ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']) {
    try {
      await deleteObject(storageRef(storage, `users/${uid}/plajahAudio/${projectId}.${ext}`));
    } catch { /* file may not exist for this extension */ }
  }
  await deleteDoc(doc(db, 'users', uid, 'plajahProjects', projectId));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9_\-\s]/gi, '').replace(/\s+/g, '_').toLowerCase() || 'plajah_project';
}
