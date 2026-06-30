import React, { createContext, useContext, useState, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../services/firebase';
import { reportError } from '../services/errorReporting';
import { uploadVideoFileMux, pollMuxUploadUntilReady } from '../services/backendService';

// Big videos go direct-to-Mux (chunked, transcoded, HLS delivery) instead of browser→Storage.
const MUX_VIDEO_THRESHOLD = 200 * 1024 * 1024; // 200 MB

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

    // Big videos → Mux direct upload (chunked, transcoded, HLS) instead of browser→Storage.
    if (type === 'VIDEO' && file.size > MUX_VIDEO_THRESHOLD) {
      setTasks(prev => [...prev, { id, fileName, progress: 0, status: 'UPLOADING', type }]);
      try {
        const uploadId = await uploadVideoFileMux(file, (p) => setTasks(prev => prev.map(t => t.id === id ? { ...t, progress: p } : t)));
        // upload to Mux done — wait for the asset's playback id (transcoding continues server-side).
        setTasks(prev => prev.map(t => t.id === id ? { ...t, progress: 100 } : t));
        const playbackId = await new Promise<string>((resolve, reject) => {
          let done = false;
          pollMuxUploadUntilReady(uploadId, (pid) => { done = true; resolve(pid); }, 90, 4000);
          setTimeout(() => { if (!done) reject(new Error('Mux processing timed out — please retry.')); }, 90 * 4000 + 5000);
        });
        const url = `https://stream.mux.com/${playbackId}.m3u8`;
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'COMPLETED', progress: 100, downloadURL: url } : t));
        return url;
      } catch (e: any) {
        reportError(e, { source: 'upload-mux', context: `VIDEO Mux · ${fileName} · ${(file.size / 1e9).toFixed(2)}GB` });
        setTasks(prev => prev.filter(t => t.id !== id)); // drop the Mux task; fall through to Storage as a backup
      }
    }

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
        (error) => {
          setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'ERROR', error: error.message } : t));
          reportError(error, { source: 'upload', context: `${type} upload · ${fileName} · ${metadata.contentType}` });
          reject(error);
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
