import React, { useEffect, useRef, useState } from 'react';
import { X, Search, Loader2, Check } from 'lucide-react';
import { searchUsers } from '../services/backendService';
import type { UserProfile } from '../types';

// Reusable user picker — search Plajah members and select one (e.g. your partner).
const PartnerPickerModal: React.FC<{
  title?: string;
  excludeUid?: string;
  onPick: (user: UserProfile) => void;
  onClose: () => void;
  accent?: string;
}> = ({ title = 'Choose your partner', excludeUid, onPick, onClose, accent = '#ff6b6b' }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const rs = await searchUsers(q.trim());
        setResults((rs || []).filter(u => u.uid !== excludeUid).slice(0, 25));
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q, excludeUid]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-3xl border overflow-hidden" style={{ background: 'rgba(14,5,9,0.97)', borderColor: `${accent}44` }}>
        <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: `${accent}22` }}>
          <span className="text-sm font-black uppercase tracking-widest text-white">{title}</span>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X size={16} /></button>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 mb-3">
            <Search size={15} className="text-white/40" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name…" className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25" />
            {loading && <Loader2 size={14} className="animate-spin text-white/30" />}
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {!q.trim() ? (
              <p className="text-center text-[11px] text-white/30 py-8">Search for the person you're with.</p>
            ) : results.length === 0 && !loading ? (
              <p className="text-center text-[11px] text-white/30 py-8">No members found for "{q}".</p>
            ) : results.map(u => (
              <button key={u.uid} onClick={() => onPick(u)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left border border-transparent hover:border-white/10">
                <img src={(u as any).photoURL || (u as any).avatarUrl || ''} alt="" className="w-9 h-9 rounded-full object-cover bg-white/10" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                <div className="min-w-0 flex-1"><p className="text-sm font-bold text-white truncate">{u.displayName || 'Member'}</p>{(u as any).username && <p className="text-[10px] text-white/40 truncate">@{(u as any).username}</p>}</div>
                <Check size={15} className="text-white/20" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerPickerModal;
