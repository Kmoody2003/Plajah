import React, { createContext, useContext, useState, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { storage, auth } from '../services/firebase';
import { reportError } from '../services/errorReporting';

/**
 * Guarantee a signed-in user with a FRESH id token before any Storage write.
 *
 * Storage rules gate `uploads/**` on `isAuth()` (request.auth != null). A
 * STORAGE/UNAUTHORIZED here means the request went out with NO valid token —
 * which happens when the account is mid-hot-switch (auth.currentUser briefly
 * null) or a long upload crossed the 1-hour token expiry. This waits for the
 * ACTIVE account and force-refreshes its token so the write is always credentialed
 * for the right user. Returns that user's uid so the caller can pin the upload to it.
 */
async function ensureUploadAuth(): Promise<string> {
  if (!auth.currentUser) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { unsub(); reject(new Error('You are not signed in — select your account and try again.')); }, 10000);
      const unsub = onAuthStateChanged(auth, (u) => { if (u) { clearTimeout(timer); unsub(); resolve(); } });
    });
  }
  const user = auth.currentUser;
  if (!user) throw new Error('You are not signed in — select your account and try again.');
  // Force-refresh: a fresh full-hour token for THIS account, so a stale/expired
  // token from a previous account can never leak into this upload.
  try { await user.getIdToken(true); } catch { /* the write below will surface a real auth error */ }
  return user.uid;
}

// Fallback content-type by upload kind — files (esp. .mov) can arrive with an empty file.type,
// which would default to application/octet-stream and be rejected by the Storage rules.
const FALLBACK_CT: Record<string, string> = { VIDEO: 'video/mp4', MUSIC: 'audio/mpeg', PHOTO: 'image/jpeg', BOOK: 'application/pdf' };
const extCt = (name: string): string => {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ({ mov: 'video/quicktime', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    pdf: 'application/pdf', epub: 'application/epub+zip' } as Record<string, string>)[ext] || '';
};

export interface UploadTask {
  id: string;
  fileName: string;
  progress: number;
  status: 'UPLOADING' | 'COMPLETED' | 'ERROR';
  downloadURL?: string;
  error?: string;
  type: 'MUSIC' | 'VIDEO' | 'PHOTO' | 'BOOK';
}

interface UploadContextType {
  tasks: UploadTask[];
  uploadFile: (file: File, type: UploadTask['type']) => Promise<string>;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);

  const uploadFile = useCallback(async (file: File, type: UploadTask['type']): Promise<string> => {
    const id = Math.random().toString(36).substring(7);
    const fileName = file.name;

    // Pin this upload to the account that STARTED it — a fresh, valid token for
    // the active user. Fixes STORAGE/UNAUTHORIZED when accounts are hot-switched.
    const ownerUid = await ensureUploadAuth();

    // Videos go through Firebase Storage (resumable, chunked) — the same reliable path as audio,
    // now that the rules allow up to 25 GB. (Mux is async/non-blocking by nature; wiring it into this
    // synchronous uploadFile() made film uploads hang waiting for the playback id and never resolve.
    // Big-file Mux should use the non-blocking pattern uploadVideo already has — a separate change.)
    const storageRef = ref(storage, `uploads/${type.toLowerCase()}s/${Date.now()}_${fileName}`);

    const newTask: UploadTask = {
      id,
      fileName,
      progress: 0,
      status: 'UPLOADING',
      type
    };

    setTasks(prev => [...prev, newTask]);

    return new Promise((resolve, reject) => {
      const metadata = {
        contentType: (file.type && file.type !== 'application/octet-stream') ? file.type : (extCt(fileName) || FALLBACK_CT[type] || 'application/octet-stream')
      };
      const uploadTask = uploadBytesResumable(storageRef, file, metadata);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setTasks(prev => prev.map(t => t.id === id ? { ...t, progress } : t));
        },
        (error: any) => {
          // Storage returns `storage/unauthorized` for ANY rules/attestation
          // rejection — not just expired auth. Classify it so the message names
          // the actual cause instead of always blaming sign-in.
          const code = error?.code || '';
          const msg = error?.message || '';
          const switched = auth.currentUser?.uid && auth.currentUser.uid !== ownerUid;
          const isAuthErr = code === 'storage/unauthorized' || /unauthorized|permission/i.test(msg);
          // App Check failures surface as unauthorized but mention app-check / attestation.
          const isAppCheck = /app-?check|attestation|app attest|appcheck/i.test(msg) || code === 'storage/app-check-token-is-invalid';
          const isQuotaOrSize = code === 'storage/quota-exceeded' || /exceeded|too large|payload/i.test(msg);
          let friendly: string;
          if (isAppCheck) {
            friendly = 'Upload blocked by app verification (App Check). Reload the page; if it persists, App Check enforcement may be on for a build that has no verification token.';
          } else if (isQuotaOrSize) {
            friendly = 'This file is too large to upload.';
          } else if (isAuthErr && switched) {
            friendly = 'Upload interrupted by an account switch — switch back to the account that started this upload and retry.';
          } else if (isAuthErr) {
            friendly = 'Upload was not authorized. Re-select your account and try again. (If this keeps happening, your account may not have upload access yet.)';
          } else {
            friendly = msg || 'Upload failed';
          }
          setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'ERROR', error: friendly } : t));
          console.error('[upload] failed', { code, msg, owner: ownerUid, active: auth.currentUser?.uid || 'none', switched: !!switched });
          reportError(error, { source: 'upload', context: `${type} upload · ${fileName} · ${metadata.contentType} · code=${code} · owner=${ownerUid} · active=${auth.currentUser?.uid || 'none'} · switched=${!!switched}` });
          reject(new Error(friendly || 'Upload failed'));
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'COMPLETED', progress: 100, downloadURL } : t));
          resolve(downloadURL);
        }
      );
    });
  }, []);

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const clearCompleted = () => {
    setTasks(prev => prev.filter(t => t.status === 'UPLOADING'));
  };

  return (
    <UploadContext.Provider value={{ tasks, uploadFile, removeTask, clearCompleted }}>
      {children}
    </UploadContext.Provider>
  );
};

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
};
