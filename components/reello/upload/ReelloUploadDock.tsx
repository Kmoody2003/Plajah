// App-level host for the Reello uploader: keeps watch folders and folder batches running for the
// signed-in account, shows a small progress pill while background uploads move, and opens the
// Upload Studio from anywhere via openReelloUploader().

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { auth } from '../../../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { subscribeQueue, type QueueItem } from '../../../services/reello/uploadQueue';
import { startFolderRunner, stopFolderRunner } from '../../../services/reello/folderRunner';

const ReelloUploadStudio = lazy(() => import('./ReelloUploadStudio'));

const OPEN_EVENT = 'reello:open-uploader';
type OpenDetail = { files?: File[]; tab?: 'UPLOAD' | 'FOLDERS' | 'TEMPLATES' | 'DRAFTS'; rightsConfirmed?: boolean };

/** Open the Reello Upload Studio, optionally with files already chosen or on a given tab. */
export function openReelloUploader(detail: OpenDetail = {}) {
  window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, { detail }));
}

const ReelloUploadDock: React.FC = () => {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid || null);
  const [open, setOpen] = useState<OpenDetail | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);

  useEffect(() => onAuthStateChanged(auth, u => setUid(u?.uid || null)), []);
  useEffect(() => {
    if (!uid) { stopFolderRunner(); return; }
    startFolderRunner(uid, auth.currentUser?.displayName || 'Creator');
  }, [uid]);
  useEffect(() => subscribeQueue(setItems), []);
  useEffect(() => {
    const on = (e: Event) => setOpen((e as CustomEvent<OpenDetail>).detail || {});
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);

  const bg = items.filter(i => i.source !== 'direct' || i.committed);
  const moving = bg.filter(i => i.status === 'QUEUED' || i.status === 'UPLOADING' || i.status === 'PUBLISHING');
  const uploading = moving.find(i => i.status === 'UPLOADING');

  return (
    <>
      {!open && moving.length > 0 && (
        <button onClick={() => setOpen({ tab: 'FOLDERS' })}
          className="fixed bottom-24 left-4 z-[300] flex items-center gap-3 pl-3 pr-4 py-2 rounded-full bg-[#111116]/95 border border-white/10 shadow-2xl text-white text-xs backdrop-blur">
          <Loader2 size={14} className="animate-spin text-[#00B4D8]" />
          <span className="max-w-[14rem] truncate">Reello · uploading {moving.length}{uploading ? ` · ${uploading.details.title} ${uploading.progress}%` : ''}</span>
          <UploadCloud size={14} className="text-white/50" />
        </button>
      )}
      {open && uid && (
        <Suspense fallback={null}>
          <ReelloUploadStudio onClose={() => setOpen(null)} seedFiles={open.files} initialTab={open.tab} rightsConfirmed={open.rightsConfirmed} />
        </Suspense>
      )}
    </>
  );
};

export default ReelloUploadDock;
