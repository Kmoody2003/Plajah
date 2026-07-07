import React, { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, Check, X, Music, DollarSign, Ban, Clock, BadgeCheck } from 'lucide-react';
import { listIncomingLicenseRequests, respondToLicenseRequest } from '../services/licenseRequests';
import { auth } from '../services/firebase';
import type { SyncLicenseRequest } from '../types';

// Owner inbox: sync-license requests from filmmakers on tracks you haven't priced.
// Respond APPROVED (set a price → the track becomes licensable) or DENIED.

const LicenseRequestsInbox: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [reqs, setReqs] = useState<SyncLicenseRequest[] | null>(null);
  const [priceById, setPriceById] = useState<Record<string, string>>({});
  const [termsById, setTermsById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => { const uid = auth.currentUser?.uid; if (uid) listIncomingLicenseRequests(uid).then(setReqs); else setReqs([]); };
  useEffect(() => { load(); }, []);

  const respond = async (req: SyncLicenseRequest, decision: 'APPROVED' | 'DENIED') => {
    if (decision === 'APPROVED' && !(Number(priceById[req.id]) > 0)) { alert('Set a price first.'); return; }
    setBusyId(req.id);
    try {
      await respondToLicenseRequest(req, decision, { priceUsd: Number(priceById[req.id] || 0), terms: termsById[req.id] });
      load();
    } catch (e: any) { alert(e?.message || 'Could not save your response.'); }
    finally { setBusyId(null); }
  };

  const pending = (reqs || []).filter(r => r.status === 'PENDING');
  const resolved = (reqs || []).filter(r => r.status !== 'PENDING');

  return (
    <div className="h-full overflow-y-auto scrollbar-hide" style={{ background: '#0a0a0d' }}>
      <div className="px-6 lg:px-12 pt-6 pb-4 border-b border-white/8">
        {onBack && <button onClick={onBack} className="flex items-center gap-1.5 text-white/50 hover:text-white text-[11px] font-bold uppercase tracking-widest mb-4"><ChevronLeft size={16} /> Back</button>}
        <div className="flex items-center gap-3"><Music size={22} className="text-small-orange" /><div>
          <h1 className="text-2xl font-black tracking-tight text-white">Music License Requests</h1>
          <p className="text-[11px] text-white/45">Filmmakers asking to license your tracks. Set a price to approve — it lists the track for licensing at that fee.</p>
        </div></div>
      </div>

      <div className="px-6 lg:px-12 py-6 max-w-3xl mx-auto space-y-5">
        {!reqs ? (
          <div className="py-16 grid place-items-center text-white/30"><Loader2 size={20} className="animate-spin" /></div>
        ) : reqs.length === 0 ? (
          <div className="py-16 text-center"><Music size={30} className="mx-auto text-white/12 mb-3" /><p className="text-[11px] font-black uppercase tracking-widest text-white/30">No requests yet</p><p className="text-[10px] text-white/25 mt-1">When a filmmaker requests a track in Fabula, it shows up here.</p></div>
        ) : (
          <>
            {pending.length > 0 && <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{pending.length} awaiting your response</p>}
            {pending.map(req => (
              <div key={req.id} className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                <div className="flex items-center gap-3 mb-3">
                  {req.cover && <img src={req.cover} className="w-12 h-12 rounded-lg object-cover" alt="" />}
                  <div className="min-w-0 flex-1"><p className="text-sm font-black text-white truncate">{req.trackTitle}</p><p className="text-[10px] text-white/45 truncate">Requested by {req.requesterName}{req.editTitle ? ` · for "${req.editTitle}"` : ''}</p></div>
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-400"><Clock size={11} /> Pending</span>
                </div>
                <p className="text-[12px] text-white/70 leading-relaxed bg-black/30 rounded-xl px-3 py-2.5 mb-3">“{req.description}”</p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/40 border border-white/10">
                    <DollarSign size={13} className="text-small-orange" />
                    <input type="number" min={0} value={priceById[req.id] || ''} onChange={e => setPriceById(p => ({ ...p, [req.id]: e.target.value }))} placeholder="Price (USD)" className="w-24 bg-transparent text-sm text-white outline-none placeholder:text-white/25" />
                  </div>
                  <input value={termsById[req.id] || ''} onChange={e => setTermsById(p => ({ ...p, [req.id]: e.target.value }))} placeholder="Terms (optional)" className="flex-1 min-w-[140px] px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none placeholder:text-white/25" />
                  <button onClick={() => respond(req, 'APPROVED')} disabled={busyId === req.id} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-50">{busyId === req.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />} Approve</button>
                  <button onClick={() => respond(req, 'DENIED')} disabled={busyId === req.id} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white"><X size={13} /> Decline</button>
                </div>
              </div>
            ))}

            {resolved.length > 0 && (
              <div className="pt-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">History</p>
                <div className="space-y-2">
                  {resolved.map(req => (
                    <div key={req.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/8">
                      {req.cover && <img src={req.cover} className="w-9 h-9 rounded-lg object-cover" alt="" />}
                      <div className="min-w-0 flex-1"><p className="text-xs font-bold text-white truncate">{req.trackTitle}</p><p className="text-[9px] text-white/35 truncate">{req.requesterName}</p></div>
                      {req.status === 'APPROVED'
                        ? <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-400"><BadgeCheck size={11} /> Approved ${req.priceUsd}</span>
                        : <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-rose-400/70"><Ban size={11} /> Declined</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LicenseRequestsInbox;
