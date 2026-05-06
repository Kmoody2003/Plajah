import React, { createContext, useContext, useState, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../services/firebase';

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
        contentType: file.type || 'application/octet-stream'
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
