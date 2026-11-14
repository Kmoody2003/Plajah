// Keeps watch folders and folder batches flowing into the upload queue while Plajah is open — with
// the uploader closed. Started once per signed-in account (components/reello/upload/ReelloUploadDock).

import { listFolders, scanForNew, markUploaded, updateFolder, type ReelloFolder } from './watchFolders';
import { enqueueUpload, isQueued, onItemDone, queueItems } from './uploadQueue';
import { applyTemplate, type ReelloUploadPrefs } from './uploadPrefs';
import { loadPrefs } from './reelloApi';

const TICK_MS = 60_000;
/** Never put more than this many folder files in the queue at once — the rest wait for the next tick. */
const MAX_PENDING = 20;

let state: { uid: string; account: string; prefs: ReelloUploadPrefs | null; timer: any; busy: boolean; offDone: () => void; onFocus: () => void } | null = null;
const listeners = new Set<(s: RunnerStatus) => void>();

export interface RunnerStatus { folders: ReelloFolder[]; settling: Record<string, number>; lastTick: number }
let status: RunnerStatus = { folders: [], settling: {}, lastTick: 0 };
const emit = () => listeners.forEach(l => { try { l(status); } catch { /* */ } });
export function subscribeRunner(fn: (s: RunnerStatus) => void) { listeners.add(fn); fn(status); return () => { listeners.delete(fn); }; }

export function startFolderRunner(uid: string, account: string) {
  if (state?.uid === uid) return;
  stopFolderRunner();
  const offDone = onItemDone(item => {
    if (item.folderId && item.fileKey && state) void markUploaded(state.uid, item.folderId, [item.fileKey]).then(() => tick());
  });
  const onFocus = () => { void tick(); };
  state = { uid, account, prefs: null, timer: setInterval(() => void tick(), TICK_MS), busy: false, offDone, onFocus };
  window.addEventListener('focus', onFocus);
  void tick();
}

export function stopFolderRunner() {
  if (!state) return;
  clearInterval(state.timer); state.offDone(); window.removeEventListener('focus', state.onFocus);
  state = null; status = { folders: [], settling: {}, lastTick: 0 }; emit();
}

/** The uploader saved templates/defaults — pick them up for the next files. */
export function refreshRunnerPrefs(prefs?: ReelloUploadPrefs) { if (state) state.prefs = prefs || null; void tick(); }

/** Rescan now (the uploader's "Scan now" button, and after a folder is added). */
export async function tick(): Promise<void> {
  const s = state;
  if (!s || s.busy) return;
  s.busy = true;
  try {
    if (!s.prefs) s.prefs = await loadPrefs();
    const folders = await listFolders(s.uid);
    const settling: Record<string, number> = {};
    let pending = queueItems().filter(i => i.source !== 'direct' && (i.status === 'QUEUED' || i.status === 'UPLOADING')).length;
    for (const f of folders) {
      if (f.meta.paused || f.meta.done || f.permission !== 'granted') continue;
      const scan = await scanForNew(s.uid, f.id).catch(() => null);
      if (!scan) continue;
      settling[f.id] = scan.settling;
      const inFlight = queueItems().some(i => i.folderId === f.id && i.status !== 'DONE' && i.status !== 'ERROR' && i.status !== 'CANCELLED');
      if (!f.meta.watch && !scan.ready.length && !scan.settling && !inFlight) { await updateFolder(s.uid, f.id, { done: true }); continue; }
      const tpl = s.prefs.templates.find(t => t.id === f.meta.templateId) || s.prefs.templates.find(t => t.id === s.prefs!.defaultTemplateId) || null;
      for (const file of scan.ready) {
        if (pending >= MAX_PENDING) break;
        if (isQueued(f.id, file.key)) continue;
        const d = applyTemplate(tpl, { fileName: file.name, folder: f.name, index: f.fileCount + pending, account: s.account }, s.prefs);
        enqueueUpload({
          file: file.file, source: f.meta.watch ? 'watch' : 'folder', folderId: f.id, folderName: f.name, fileKey: file.key,
          details: { title: d.title, description: d.description, tags: d.tags, genre: d.genre, visibility: d.visibility, storyIntel: d.storyIntel, intel: d.intel },
        });
        pending++;
      }
    }
    status = { folders: await listFolders(s.uid), settling, lastTick: Date.now() };
    emit();
  } finally { s.busy = false; }
}
