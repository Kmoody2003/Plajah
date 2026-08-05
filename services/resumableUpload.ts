// Persists an in-progress Mux film upload so it can be resumed after a tab close,
// crash, or network drop. The Mux direct-upload URL is a resumable GCS endpoint —
// re-running UpChunk against the SAME url + the SAME file continues from the last
// byte GCS received (no restart). We can't persist a File handle across a reload,
// so on resume the user re-selects the exact file (we validate name + size).

const KEY = 'plajah:resumable-upload';
// Must not exceed the server's Mux upload `timeout` (24h) — after that the URL is dead.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ResumableUpload {
  uploadId: string;
  uploadUrl: string;
  fileName: string;
  fileSize: number;
  title: string;
  createdAt: number;
  progress: number;   // 0–100
}

export const RESUMABLE_EVENT = 'plajah:resumable-changed';

const emit = () => { try { window.dispatchEvent(new CustomEvent(RESUMABLE_EVENT)); } catch { /* ignore */ } };

export const saveResumable = (r: ResumableUpload): void => {
  try { localStorage.setItem(KEY, JSON.stringify(r)); emit(); } catch { /* ignore */ }
};

export const loadResumable = (): ResumableUpload | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as ResumableUpload;
    if (!r?.uploadUrl || Date.now() - r.createdAt > MAX_AGE_MS) { clearResumable(); return null; }
    return r;
  } catch { return null; }
};

export const updateResumableProgress = (progress: number): void => {
  const r = loadResumable();
  if (r) { r.progress = progress; try { localStorage.setItem(KEY, JSON.stringify(r)); emit(); } catch { /* ignore */ } }
};

export const clearResumable = (): void => {
  try { localStorage.removeItem(KEY); emit(); } catch { /* ignore */ }
};
