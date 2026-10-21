// services/comicProject/store.ts — on-device persistence for Tela comic projects.
//
// Projects live in IndexedDB (a 294-panel graphic novel is too big for localStorage);
// a small index keeps the open-project picker fast. The last opened id is remembered
// so Tela comic mode reopens where the author left off.

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { ComicProject, ComicProjectSummary } from './types';

const KEY = (id: string) => `comicProject:${id}`;
const INDEX_KEY = 'comicProject:index';
const LAST_KEY = 'plajah.comicProject.last';

export function summarizeComicProject(p: ComicProject): ComicProjectSummary {
  let panelCount = 0;
  let coverUrl: string | undefined;
  for (const page of p.pages) {
    panelCount += page.panels.length;
    if (!coverUrl) coverUrl = page.panels.find((x) => x.renderedImageUrl)?.renderedImageUrl;
  }
  return {
    id: p.id,
    title: p.title,
    format: p.format,
    pageCount: p.pages.length,
    panelCount,
    coverUrl,
    source: p.source,
    updatedAt: p.updatedAt,
  };
}

export async function listComicProjects(): Promise<ComicProjectSummary[]> {
  const index = (await idbGet<ComicProjectSummary[]>(INDEX_KEY)) ?? [];
  return [...index].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadComicProject(id: string): Promise<ComicProject | null> {
  const p = await idbGet<ComicProject>(KEY(id));
  return p && p.schema === 'plajah.comicProject' ? p : null;
}

export async function saveComicProject(project: ComicProject): Promise<ComicProject> {
  const saved = { ...project, updatedAt: Date.now() };
  await idbSet(KEY(saved.id), saved);
  const index = (await idbGet<ComicProjectSummary[]>(INDEX_KEY)) ?? [];
  const summary = summarizeComicProject(saved);
  await idbSet(INDEX_KEY, [summary, ...index.filter((s) => s.id !== saved.id)]);
  setLastComicProjectId(saved.id);
  return saved;
}

export async function deleteComicProject(id: string): Promise<void> {
  await idbDel(KEY(id));
  const index = (await idbGet<ComicProjectSummary[]>(INDEX_KEY)) ?? [];
  await idbSet(INDEX_KEY, index.filter((s) => s.id !== id));
  if (getLastComicProjectId() === id) setLastComicProjectId(null);
}

export function getLastComicProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function setLastComicProjectId(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    // Private mode / blocked storage: reopening just starts blank.
  }
}

const PENDING_KEY = 'plajah.comicProject.pending';

/**
 * Synchronous snapshot for page close. An IndexedDB write started in `pagehide` can be cut
 * off by the unload, so the unsaved edit is parked in localStorage and recovered on next open.
 */
export function stashPendingComicProject(project: ComicProject) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ ...project, updatedAt: Date.now() }));
  } catch {
    // Over quota or blocked: the async save is the only attempt left.
  }
}

/** Returns (and clears) a project parked at page close, if any. */
export function takePendingComicProject(): ComicProject | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_KEY);
    const p = JSON.parse(raw);
    return p && p.schema === 'plajah.comicProject' ? (p as ComicProject) : null;
  } catch {
    return null;
  }
}

/** Downloads a project as a .plajah-comic.json file. */
export function downloadComicProject(project: ComicProject) {
  const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.title.replace(/[^\w\- ]+/g, '').trim() || 'comic'}.plajah-comic.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Reads a project file chosen by the author; rejects anything that isn't one. */
export async function readComicProjectFile(file: File): Promise<ComicProject> {
  const parsed = JSON.parse(await file.text());
  if (!parsed || parsed.schema !== 'plajah.comicProject' || !Array.isArray(parsed.pages)) {
    throw new Error('Not a Plajah comic project file');
  }
  return parsed as ComicProject;
}
