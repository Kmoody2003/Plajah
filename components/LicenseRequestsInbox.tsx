import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2, Check, X, Music, DollarSign, Ban, Clock, BadgeCheck, Film, Inbox, ListMusic } from 'lucide-react';
import { listIncomingLicenseRequests, respondToLicenseRequest, listMyLicenseRequests } from '../services/licenseRequests';
import { listMyGrants } from '../services/syncLicensing';
import { auth } from '../services/firebase';
import type { SyncLicenseRequest, SyncLicenseGrant } from '../types';

// Two sides of the sync-license desk:
//  • "Requests to me" — filmmakers asking to license your tracks; approve+price or decline.
//  • "My licenses"    — tracks you've licensed, grouped by film, plus your sent requests.

type Tab = 'INCOMING' | 'MINE';

const LicenseRequestsInbox: React.FC<{ onBack?: () => void; onOpenFilm?: (editId: string) => void }> = ({ onBack, onOpenFilm }) => {
  const [tab, setTab] = useState<Tab>('INCOMING');
  const [reqs, setReqs] = useState<SyncLicenseRequest[] | null>(null);
  const [grants, setGrants] = useState<SyncLicenseGrant[] | null>(null);
  const [myReqs, setMyReqs] = useState<SyncLicenseRequest[] | null>(null);
  const [priceById, setPriceById] = useState<Record<string, string>>({});
  const [termsById, setTermsById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setReqs([]); setGrants([]); setMyReqs([]); return; }
    listIncomingLicenseRequests(uid).then(setReqs);
    listMyGrants(uid).then(setGrants);
    listMyLicenseRequests(uid).then(setMyReqs);
  };
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
  const pendingCount = pending.length;

  // Group my grants by film (editId).
  const films = useMemo(() => {
    const by: Record<string, { editId: string; title: string; tracks: SyncLicenseGrant[] }> = {};
    for (const g of grants || []) {
      const k = g.editId || 'unknown';
      if (!by[k]) by[k] = { editId: g.editId, title: g.editTitle || 'Untitled film', tracks: [] };
      by[k].tracks.push(g);
    }
    return Object.values(by).sort((a, b) => b.tracks.length - a.tracks.length);
  }, [grants]);
  const myPendingReqs = (myReqs || []).filter(r => r.status === 'PENDING');
  const myOtherReqs = (myReqs || []).filter(r => r.status !== 'PENDING');

  return (
    <div className="h-full overflow-y-auto scrollbar-hide" style={{ background: '#0a0a0d' }}>
      <div className="px-6 lg:px-12 pt-6 pb-0 border-b border-white/8">
        {onBack && <button onClick={onBack} className="flex items-center gap-1.5 text-white/50 hover:text-white text-[11px] font-bold uppercase tracking-widest mb-4"><ChevronLeft size={16} /> Back</button>}
        <div className="flex items-center gap-3 mb-4"><Music size={22} className="text-small-orange" /><div>
          <h1 className="text-2xl font-black tracking-tight text-white">Music Licensing</h1>
          <p className="text-[11px] text-white/45">Requests for your tracks, and the music you’ve licensed for your films.</p>
        </div></div>
        <div className="flex gap-1">
          {([['INCOMING', 'Requests to me', Inbox], ['MINE', 'My licenses', ListMusic]] as const).map(([t, label, Icon]) => (
            <button key={t} onClick={() => setTab(t)} className={`relative flex items-center gap-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${tab === t ? 'border-small-orange text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}>
              <Icon size={13} /> {label}
              {t === 'INCOMING' && pendingCount > 0 && <span className="min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-small-orange text-black text-[9px] font-black tabular-nums">{pendingCount}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Requests to me ── */}
      {tab === 'INCOMING' && (
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
      )}

      {/* ── My licenses (grouped by film) ── */}
      {tab === 'MINE' && (
        <div className="px-6 lg:px-12 py-6 max-w-3xl mx-auto space-y-5">
          {!grants || !myReqs ? (
            <div className="py-16 grid place-items-center text-white/30"><Loader2 size={20} className="animate-spin" /></div>
          ) : films.length === 0 && (myReqs?.length || 0) === 0 ? (
            <div className="py-16 text-center"><ListMusic size={30} className="mx-auto text-white/12 mb-3" /><p className="text-[11px] font-black uppercase tracking-widest text-white/30">No licenses yet</p><p className="text-[10px] text-white/25 mt-1">License a song from Chora or Fabula and it’ll appear here, grouped by film.</p></div>
          ) : (
            <>
              {films.map(f => (
                <div key={f.editId} className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden">
                  <button onClick={() => onOpenFilm?.(f.editId)} className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/8 hover:bg-white/[0.02] transition-colors text-left">
                    <Film size={16} className="text-small-orange" />
                    <div className="min-w-0 flex-1"><p className="text-sm font-black text-white truncate">{f.title}</p><p className="text-[9px] text-white/40 uppercase tracking-widest">{f.tracks.length} licensed track{f.tracks.length === 1 ? '' : 's'}</p></div>
                    {onOpenFilm && <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Open →</span>}
                  </button>
                  <div className="divide-y divide-white/5">
                    {f.tracks.map(g => (
                      <div key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                        <BadgeCheck size={14} className="text-emerald-400 shrink-0" />
                        <p className="text-xs font-bold text-white truncate flex-1">{g.trackTitle || g.trackId}</p>
                        <span className="text-[10px] text-white/40 tabular-nums">${((g.feeCents || 0) / 100).toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {(myPendingReqs.length > 0 || myOtherReqs.length > 0) && (
                <div className="pt-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Requests you’ve sent</p>
                  <div className="space-y-2">
                    {[...myPendingReqs, ...myOtherReqs].map(r => (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/8">
                        {r.cover && <img src={r.cover} className="w-9 h-9 rounded-lg object-cover" alt="" />}
                        <div className="min-w-0 flex-1"><p className="text-xs font-bold text-white truncate">{r.trackTitle}</p><p className="text-[9px] text-white/35 truncate">{r.artist}{r.editTitle ? ` · ${r.editTitle}` : ''}</p></div>
                        {r.status === 'PENDING' ? <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-400"><Clock size={11} /> Pending</span>
                          : r.status === 'APPROVED' ? <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-400"><BadgeCheck size={11} /> Priced ${r.priceUsd}</span>
                          : <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-rose-400/70"><Ban size={11} /> Declined</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LicenseRequestsInbox;
