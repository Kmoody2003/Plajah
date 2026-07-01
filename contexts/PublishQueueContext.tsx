// PublishQueueContext — runs project publishes (albums, films, Reello videos) in the BACKGROUND so
// the creator can close and the user can start another. Each enqueued job runs its own async work
// concurrently, reporting progress; the publish tray surfaces them and lets the user reopen a job's
// detail. This is what makes multiple project uploads happen at once without blocking the UI.

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export interface PublishJob {
  id: string;
  title: string;
  kind: string;                 // 'Album' | 'Video' | 'Reello' | 'Film' | …
  status: 'RUNNING' | 'DONE' | 'ERROR';
  percent: number;
  text: string;
  error?: string;
  startedAt: number;
}

export interface EnqueueOpts {
  title: string;
  kind: string;
  /** The actual publish work. Call onProgress(text, percent) to report. Resolve with the result. */
  run: (onProgress: (text: string, percent: number) => void) => Promise<any>;
  /** Called with the result once the job succeeds (e.g. to refresh the library). */
  onDone?: (result: any) => void;
}

interface PublishQueueContextType {
  jobs: PublishJob[];
  enqueue: (opts: EnqueueOpts) => string;
  remove: (id: string) => void;
  clearFinished: () => void;
  retry: (id: string) => void;
}

const PublishQueueContext = createContext<PublishQueueContextType | undefined>(undefined);

export const PublishQueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const runners = useRef<Map<string, EnqueueOpts>>(new Map());

  const start = useCallback((id: string, opts: EnqueueOpts) => {
    runners.current.set(id, opts);
    const onProgress = (text: string, percent: number) =>
      setJobs(prev => prev.map(j => j.id === id ? { ...j, text, percent: Math.max(0, Math.min(100, Math.round(percent))) } : j));
    opts.run(onProgress)
      .then(result => {
        setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'DONE', percent: 100, text: 'Published' } : j));
        try { opts.onDone?.(result); } catch { /* */ }
      })
      .catch(err => setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'ERROR', text: 'Failed', error: err?.message || 'Upload failed' } : j)));
  }, []);

  const enqueue = useCallback((opts: EnqueueOpts): string => {
    const id = 'pub_' + Math.random().toString(36).slice(2, 9);
    setJobs(prev => [...prev, { id, title: opts.title || 'Untitled', kind: opts.kind || 'Project', status: 'RUNNING', percent: 0, text: 'Starting…', startedAt: Date.now() }]);
    start(id, opts);          // run immediately → concurrent background uploads
    return id;
  }, [start]);

  const remove = useCallback((id: string) => { runners.current.delete(id); setJobs(prev => prev.filter(j => j.id !== id)); }, []);
  const clearFinished = useCallback(() => setJobs(prev => prev.filter(j => j.status === 'RUNNING')), []);
  const retry = useCallback((id: string) => {
    const opts = runners.current.get(id); if (!opts) return;
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'RUNNING', percent: 0, text: 'Retrying…', error: undefined } : j));
    start(id, opts);
  }, [start]);

  return (
    <PublishQueueContext.Provider value={{ jobs, enqueue, remove, clearFinished, retry }}>
      {children}
    </PublishQueueContext.Provider>
  );
};

export function usePublishQueue(): PublishQueueContextType {
  const ctx = useContext(PublishQueueContext);
  if (!ctx) throw new Error('usePublishQueue must be used inside <PublishQueueProvider>');
  return ctx;
}
