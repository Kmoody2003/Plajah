import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Lock, FolderUp, BookOpen, Trash2, Loader2, Library } from 'lucide-react';
import { Album } from '../types';
import { fetchPersonalBooks, uploadPersonalBook, deletePersonalBook, auth } from '../services/backendService';

const BOOK_RE = /\.(epub|pdf|txt|cbz|cbr)$/i;
const isBookFile = (f: File): boolean => BOOK_RE.test(f.name);

// Clean a filename into a title. Handles "Title - Author", dots/underscores.
const parseBookName = (name: string): { title: string; author?: string } => {
  const base = name.replace(/\.[^/.]+$/, '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = base.match(/^(.*?)\s*[-–—]\s*(.+)$/);
  if (m && m[1] && m[2]) return { title: m[1].trim(), author: m[2].trim() };
  return { title: base };
};

const PersonalBookLocker: React.FC<{ onOpen: (book: Album) => void }> = ({ onOpen }) => {
  const [books, setBooks] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const uid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    setLoading(true);
    setBooks(await fetchPersonalBooks());
    setLoading(false);
  }, []);

  useEffect(() => { if (uid) load(); else setLoading(false); }, [uid, load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const picked = Array.from(files).filter(isBookFile);
    if (picked.length === 0) { alert('No supported ebooks found (EPUB, PDF, TXT, CBZ).'); return; }
    setProgress({ done: 0, total: picked.length });
    try {
      let done = 0;
      for (const file of picked) {
        const { title, author } = parseBookName(file.name);
        const uploaded = await uploadPersonalBook({ title, artist: author }, file);
        if (uploaded) setBooks(prev => [uploaded, ...prev]);
        done++; setProgress({ done, total: picked.length });
      }
    } catch (err) {
      console.error('Book locker upload failed:', err);
      alert('Some files could not be imported. Please try again.');
    } finally {
      setProgress(null);
      e.target.value = '';
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remove this from your library?')) return;
    await deletePersonalBook(id);
    setBooks(prev => prev.filter(b => b.id !== id));
  };

  if (!uid) {
    return (
      <div className="mt-4 py-16 flex flex-col items-center justify-center bg-white/[0.02] rounded-3xl border border-dashed border-white/10">
        <Lock className="text-white/15 mb-4" size={40} />
        <p className="text-white/30 font-black text-sm uppercase tracking-widest">Sign in to use your private library</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Private locker notice */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10 mb-5">
        <Lock size={16} className="text-orange-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-[11px] font-black uppercase tracking-widest text-white">Your private library</p>
          <p className="text-[10px] text-white/40 mt-1 leading-relaxed">Import ebooks you own (EPUB, PDF, TXT, CBZ) and read them in Lorea from any device you sign in on. These are <span className="text-white/70 font-bold">private to you and are never shared, posted, or discoverable</span>.</p>
        </div>
        <label className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-orange-400 transition-all shrink-0">
          <FolderUp size={14} /> Import
          <input type="file" multiple accept=".epub,.pdf,.txt,.cbz,.cbr,application/epub+zip,application/pdf" className="hidden" onChange={handleUpload} />
        </label>
      </div>

      {progress && (
        <div className="p-6 bg-white/5 border border-white/10 border-dashed rounded-2xl flex flex-col items-center gap-3 mb-5">
          <Loader2 size={22} className="animate-spin text-white/40" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Importing to your library — {progress.done} of {progress.total}</p>
          <div className="w-full max-w-sm h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-orange-400 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-white/30" /></div>
      ) : books.length === 0 ? (
        <div className="py-24 flex flex-col items-center justify-center bg-white/[0.02] rounded-3xl border border-dashed border-white/10">
          <Library className="text-white/15 mb-5" size={52} />
          <p className="text-white/30 font-black text-lg uppercase tracking-widest mb-1">Your library is empty</p>
          <p className="text-white/20 text-[11px] uppercase tracking-widest">Import the ebooks you own</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {books.map(b => (
            <motion.div key={b.id} whileHover={{ scale: 1.02 }} className="group relative aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/8 hover:border-orange-400/30 transition-all">
              <button onClick={() => onOpen(b)} className="absolute inset-0 w-full h-full text-left">
                {b.coverImage ? (
                  <img src={b.coverImage} loading="lazy" className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity" alt={b.title} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2a1a0e] to-black"><BookOpen size={40} className="text-white/15" /></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                <div className="absolute bottom-0 p-3 w-full">
                  <h4 className="text-xs font-black leading-tight line-clamp-2 uppercase tracking-tight text-white">{b.title}</h4>
                  {b.artist && <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mt-1 truncate">{b.artist}</p>}
                </div>
              </button>
              <button onClick={() => remove(b.id)} title="Remove from library" className="absolute top-2 right-2 z-10 p-2 rounded-full bg-black/60 text-white/60 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={13} /></button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PersonalBookLocker;
