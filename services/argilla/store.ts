/**
 * store.ts — Argilla projects. The record syncs through Creative Cloud like every other creative
 * tool; the sculpt file goes to on-device storage and, when signed in, to the user's Tela storage.
 */

import { scheduleCreativeSync } from '../creativeCloud/cloudStore';
import { uploadTelaImage } from '../telaAssets';
import { getTelaAssetBlob, putTelaAsset } from '../tela/telaAssetStore';

export interface ArgillaProject {
  id: string;
  title: string;
  updatedAt: number;
  grid: number;
  /** On-device copy of the .argilla file. */
  assetId?: string;
  /** Durable copy for other devices. Absent for guests. */
  remoteUrl?: string;
  remotePath?: string;
}

const KEY = 'plajah.argilla.projects';

export const newArgillaId = () => `arg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function listArgillaProjects(): ArgillaProject[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function remember(project: ArgillaProject) {
  const rest = listArgillaProjects().filter((p) => p.id !== project.id);
  try {
    localStorage.setItem(KEY, JSON.stringify([project, ...rest].slice(0, 200)));
  } catch { /* the sculpt itself is already stored; only the list entry is lost */ }
}

export function getArgillaProject(id: string): ArgillaProject | null {
  return listArgillaProjects().find((p) => p.id === id) ?? null;
}

/** Autosave stays on this device. `toCloud` also uploads the file and syncs the record. */
export async function saveArgillaProject(
  project: ArgillaProject,
  file: Blob,
  toCloud: boolean,
): Promise<ArgillaProject> {
  const { assetId } = await putTelaAsset(file, 'argilla');
  let next: ArgillaProject = { ...project, assetId, updatedAt: Date.now() };
  if (toCloud) {
    const uploaded = await uploadTelaImage(new File([file], `${project.id}.argilla`, { type: file.type }));
    if (!uploaded.sessionOnly) next = { ...next, remoteUrl: uploaded.src, remotePath: uploaded.storagePath };
    scheduleCreativeSync({ kind: 'argilla', localId: project.id, title: project.title, json: JSON.stringify(next) });
  }
  remember(next);
  return next;
}

export async function loadArgillaFile(project: ArgillaProject): Promise<Blob> {
  if (project.assetId) {
    const local = await getTelaAssetBlob(project.assetId);
    if (local) return local;
  }
  if (project.remoteUrl) {
    const response = await fetch(project.remoteUrl);
    if (response.ok) return response.blob();
  }
  throw new Error('The sculpt file for this project could not be found.');
}
