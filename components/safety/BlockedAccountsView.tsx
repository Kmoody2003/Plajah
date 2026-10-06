import React, { useEffect, useState } from 'react';
import { Ban, VolumeX } from 'lucide-react';
import { useSocialSafety } from '../../hooks/useSocialSafety';
import { fetchProfilesLite, unblockUser, unmuteUser } from '../../services/socialSafetyService';

type Lite = { uid: string; displayName: string; photoURL: string };

const Row: React.FC<{ p: Lite; label: string; onUndo: () => void }> = ({ p, label, onUndo }) => (
  <div className="flex items-center gap-3">
    {p.photoURL ? <img src={p.photoURL} alt="" className="w-8 h-8 rounded-full object-cover bg-white/10" /> : <div className="w-8 h-8 rounded-full bg-white/10" />}
    <span className="text-sm font-bold text-white truncate flex-1 min-w-0">{p.displayName}</span>
    <button onClick={onUndo} className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-[10px] font-black uppercase tracking-widest text-white/70">{label}</button>
  </div>
);

/** Manage accounts you blocked or muted. Live (useSocialSafety); profile names are fetched lazily. */
const BlockedAccountsView: React.FC = () => {
  const { blocked, muted } = useSocialSafety();
  const [profiles, setProfiles] = useState<Record<string, Lite>>({});

  const key = [...blocked, ...muted].sort().join(',');
  useEffect(() => {
    const need = [...blocked, ...muted].filter(u => !profiles[u]);
    if (!need.length) return;
    let live = true;
    fetchProfilesLite(need).then(list => { if (live) setProfiles(prev => ({ ...prev, ...Object.fromEntries(list.map(p => [p.uid, p])) })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const lite = (u: string): Lite => profiles[u] ?? { uid: u, displayName: '...', photoURL: '' };

  const section = (title: string, icon: React.ReactNode, ids: Set<string>, label: string, undo: (u: string) => Promise<void>) => (
    <div className="p-5 bg-white/[0.03] border border-white/8 rounded-[1.5rem] space-y-3">
      <div className="flex items-center gap-2.5">{icon}<p className="text-xs font-black uppercase tracking-widest">{title} ({ids.size})</p></div>
      {ids.size === 0 && <p className="text-[10px] text-white/40">Nobody here.</p>}
      {[...ids].map(u => <Row key={u} p={lite(u)} label={label} onUndo={() => { undo(u).catch(() => {}); }} />)}
    </div>
  );

  return (
    <div className="space-y-4">
      {section('Blocked accounts', <Ban size={14} className="text-red-400" />, blocked, 'Unblock', unblockUser)}
      {section('Muted accounts', <VolumeX size={14} className="text-[#FF8C00]" />, muted, 'Unmute', unmuteUser)}
    </div>
  );
};

export default BlockedAccountsView;
