import { useEffect, useRef, useState } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { loadResumable, clearResumable, RESUMABLE_EVENT, type ResumableUpload } from '../services/resumableUpload';

/**
 * Global banner (renders nothing when idle). If a film upload was interrupted —
 * tab closed, crash, network drop — it shows a "Resume upload" card. The user
 * re-selects the exact file (we validate name + size) and the upload continues
 * from where it left off against the same Mux url. Persists across reloads.
 */
const ResumeUploadPrompt = () => {
  const [pending, setPending] = useState<ResumableUpload | null>(() => loadResumable());
  const [resuming, setResuming] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refresh = () => { if (!resuming) setPending(loadResumable()); };
    window.addEventListener(RESUMABLE_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener(RESUMABLE_EVENT, refresh); window.removeEventListener('focus', refresh); };
  }, [resuming]);

  if (!pending) return null;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.name !== pending.fileName || file.size !== pending.fileSize) {
      setErr('That’s a different file — pick the exact file you were uploading.');
      return;
    }
    setErr('');
    setResuming(true);
    setProgress(pending.progress || 0);
    try {
      const { resumeVideoUpload } = await import('../services/backendService');
      await resumeVideoUpload(pending, file, (p) => setProgress(p));
      setPending(null);
    } catch (e2: any) {
      setErr(e2?.message || 'Resume failed — try again.');
      setResuming(false);
    }
  };

  const dismiss = () => { clearResumable(); setPending(null); };

  return (
    <div className="fixed fixed-bottom-safe right-4 z-[1200] w-[min(360px,92vw)] rounded-2xl bg-[#0e0e0e]/95 backdrop-blur-2xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.6)] p-4">
      <div className="flex items-start gap-3">
        <UploadCloud size={18} className="text-small-orange shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-white">Resume upload</p>
          <p className="text-[11px] text-white/50 truncate mt-0.5">{pending.fileName}</p>
          {resuming ? (
            <>
              <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-small-orange transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[10px] text-white/40 mt-1">{progress}% — resuming…</p>
            </>
          ) : (
            <>
              <p className="text-[10px] text-white/40 mt-1">
                Interrupted at {pending.progress || 0}%. Re-select this file to continue where it left off.
              </p>
              {err && <p className="text-[10px] text-red-400 mt-1">{err}</p>}
              <div className="flex gap-2 mt-2">
                <button onClick={() => inputRef.current?.click()}
                  className="px-3 py-1.5 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest">
                  Resume
                </button>
                <button onClick={dismiss}
                  className="px-3 py-1.5 rounded-full bg-white/8 text-white/60 text-[10px] font-black uppercase tracking-widest">
                  Discard
                </button>
              </div>
            </>
          )}
        </div>
        {!resuming && (
          <button onClick={dismiss} className="text-white/30 hover:text-white shrink-0"><X size={14} /></button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="video/*,.mov,.mxf,.mts,.m2ts,.mkv,.mp4,.m4v,.avi,.mpg,.mpeg,.ts,.vob,.gxf" className="hidden" onChange={onPick} />
    </div>
  );
};

export default ResumeUploadPrompt;
