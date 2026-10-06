import React, { useEffect, useState } from 'react';
import { UserPlus, Check, X as XIcon } from 'lucide-react';
import { listenIncomingFollowRequests, approveFollowRequest, declineFollowRequest, type FollowRequest } from '../../services/socialSafetyService';

/** Pending follow requests for the signed-in (private) account. Renders nothing when empty. */
const FollowRequestsInbox: React.FC<{ onVisitUser?: (uid: string) => void; showWhenEmpty?: boolean }> = ({ onVisitUser, showWhenEmpty = false }) => {
  const [reqs, setReqs] = useState<FollowRequest[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');

  useEffect(() => listenIncomingFollowRequests(setReqs), []);

  const act = async (r: FollowRequest, kind: 'approve' | 'decline') => {
    setBusy(b => new Set(b).add(r.requesterId)); setErr('');
    try { await (kind === 'approve' ? approveFollowRequest(r.requesterId) : declineFollowRequest(r.requesterId)); }
    catch { setErr('That did not go through. Try again.'); }
    finally { setBusy(b => { const n = new Set(b); n.delete(r.requesterId); return n; }); }
  };

  if (!reqs.length && !showWhenEmpty) return null;

  return (
    <div className="p-5 bg-white/[0.03] border border-white/8 rounded-[1.5rem] space-y-3">
      <div className="flex items-center gap-2.5">
        <UserPlus size={14} className="text-[#FF8C00]" />
        <p className="text-xs font-black uppercase tracking-widest">Follow requests{reqs.length ? ` (${reqs.length})` : ''}</p>
      </div>
      {!reqs.length && <p className="text-[10px] text-white/40">No pending requests.</p>}
      {reqs.map(r => (
        <div key={r.id} className="flex items-center gap-3">
          <button onClick={() => onVisitUser?.(r.requesterId)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
            {r.requesterPhoto
              ? <img src={r.requesterPhoto} alt="" className="w-9 h-9 rounded-full object-cover bg-white/10" />
              : <div className="w-9 h-9 rounded-full bg-white/10" />}
            <span className="text-sm font-bold text-white truncate">{r.requesterName || 'Someone'}</span>
          </button>
          <button disabled={busy.has(r.requesterId)} onClick={() => act(r, 'approve')} aria-label="Approve"
            className="p-2 rounded-full bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-40"><Check size={14} /></button>
          <button disabled={busy.has(r.requesterId)} onClick={() => act(r, 'decline')} aria-label="Decline"
            className="p-2 rounded-full bg-white/8 text-white/50 hover:text-white hover:bg-white/15 disabled:opacity-40"><XIcon size={14} /></button>
        </div>
      ))}
      {err && <p className="text-[10px] text-red-400">{err}</p>}
    </div>
  );
};

export default FollowRequestsInbox;
