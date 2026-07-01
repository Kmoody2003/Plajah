import React, { createContext, useContext, useState, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../services/firebase';
import { reportError } from '../services/errorReporting';

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
