import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Music, Play, Pause, Search, X, Loader2, BadgeCheck, Plus, ShieldCheck, Clock, MailQuestion, Ban } from 'lucide-react';
import { getChoraMusicCatalog, type MusicBinTrack } from '../services/fabulaMusic';
import { purchaseSyncLicense, grantKey } from '../services/syncLicensing';
import { createLicenseRequest, listMyLicenseRequests, myRequestsByTrack } from '../services/licenseRequests';
import { auth } from '../services/firebase';
import type { SyncLicenseRequest } from '../types';

// Gallery-style music sync-licensing STORE for Fabula's edit page. It shows the WHOLE
// Chora catalog: tracks the artist has priced can be licensed now; the rest can be
// REQUESTED — the filmmaker sends a brief use description and the owner replies with a
// price (or a no). Licensing pays the artist via Stripe and clears the track for this edit.

const fmtDur = (s?: number) => s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '';

const MusicLicensingStore: React.FC<{
  editId: string;
  editTitle?: string;
  licensedKeys: Set<string>;
  onAddToProject: (track: MusicBinTrack) => void;
  onClose: () => void;
}> = ({ editId, editTitle, licensedKeys, onAddToProject, onClose }) => {
  const [tracks, setTracks] = useState<MusicBinTrack[] | null>(null);
  const [reqByTrack, setReqByTrack] = useState<Record<string, SyncLicenseRequest>>({});
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('ALL');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [requestFor, setRequestFor] = useState<MusicBinTrack | null>(null);
  const [desc, setDesc] = useState('');
  const [sending, setSending] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadReqs = () => { const uid = auth.currentUser?.uid; if (uid) listMyLicenseRequests(uid).then(r => setReqByTrack(myRequestsByTrack(r))); };
  useEffect(() => { getChoraMusicCatalog(200).then(setTracks); loadReqs(); }, []);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const genres = useMemo(() => ['ALL', ...Array.from(new Set((tracks || []).map(t => t.genre).filter(Boolean))).slice(0, 12)] as string[], [tracks]);
  const shown = useMemo(() => (tracks || []).filter(t => {
    if (genre !== 'ALL' && t.genre !== genre) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (t.title || '').toLowerCase().includes(s) || (t.artist || '').toLowerCase().includes(s) || (t.albumTitle || '').toLowerCase().includes(s);
  }), [tracks, q, genre]);

  const togglePreview = (t: MusicBinTrack) => {
    if (!t.url) return;
    if (previewId === t.id) { audioRef.current?.pause(); setPreviewId(null); return; }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = t.url; audioRef.current.play().catch(() => {});
    setPreviewId(t.id); audioRef.current.onended = () => setPreviewId(null);
  };

  // Fee to license at: the track's own fee, or an approved request's price.
  const feeFor = (t: MusicBinTrack) => Number(t.syncLicenseFee || 0) || Number(reqByTrack[t.id]?.status === 'APPROVED' ? reqByTrack[t.id]?.priceUsd : 0) || 0;

  const licenseAndAdd = async (t: MusicBinTrack) => {
    const licensed = licensedKeys.has(grantKey(t.id, editId));
    onAddToProject(t);
    if (licensed) return;
    setBusyId(t.id);
    try { await purchaseSyncLicense({ track: { ...t, syncLicenseFee: feeFor(t) }, editId, editTitle }); }
    catch (e: any) { alert(e?.message || 'Could not start the license checkout.'); }
    finally { setBusyId(null); }
  };

  const sendRequest = async () => {
    if (!requestFor || !desc.trim()) return;
    setSending(true);
    try {
      const r = await createLicenseRequest({ track: requestFor, editId, editTitle, description: desc });
      if (r) setReqByTrack(prev => ({ ...prev, [requestFor.id]: r }));
      setRequestFor(null); setDesc('');
    } catch (e: any) { alert(e?.message || 'Could not send the request.'); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-[350] bg-[#0a0a0d]/95 backdrop-blur-sm flex flex-col" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-white/8">
        <Music size={18} className="text-small-orange" />
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white leading-none">Music Licensing Store</p>
          <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mt-1">The whole Chora catalog — license or request for {editTitle || 'this edit'}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10">
            <Search size={13} className="text-white/40" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tracks, artists…" className="bg-transparent text-xs text-white outline-none w-44 placeholder:text-white/25" />
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 grid place-items-center text-white/40 hover:text-white"><X size={15} /></button>
        </div>
      </div>

      <div className="shrink-0 flex gap-1.5 px-5 py-2.5 overflow-x-auto scrollbar-hide border-b border-white/6">
        {genres.map(g => (
          <button key={g} onClick={() => setGenre(g)} className={`shrink-0 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors ${genre === g ? 'bg-small-orange text-black' : 'bg-white/5 text-white/45 hover:text-white'}`}>{g === 'ALL' ? 'All' : g}</button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        {!tracks ? (
          <div className="h-full grid place-items-center text-white/30"><Loader2 size={20} className="animate-spin" /></div>
        ) : shown.length === 0 ? (
          <div className="h-full grid place-items-center text-center"><div><Music size={30} className="mx-auto text-white/12 mb-3" /><p className="text-[11px] font-black uppercase tracking-widest text-white/30">No tracks found</p></div></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 max-w-7xl mx-auto">
            {shown.map(t => {
              const licensed = licensedKeys.has(grantKey(t.id, editId));
              const playing = previewId === t.id;
              const req = reqByTrack[t.id];
              const fee = feeFor(t);
              const canLicense = fee > 0;
              return (
                <div key={t.id} className="rounded-2xl bg-white/[0.03] border border-white/8 overflow-hidden group hover:border-white/20 transition-colors flex flex-col">
                  <div className="relative aspect-square bg-black">
                    {t.cover ? <img src={t.cover} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center"><Music size={26} className="text-white/12" /></div>}
                    <button onClick={() => togglePreview(t)} title="Preview" className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="w-11 h-11 rounded-full bg-white/90 text-black grid place-items-center">{playing ? <Pause size={18} fill="black" /> : <Play size={18} fill="black" className="ml-0.5" />}</span>
                    </button>
                    {playing && <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-small-orange text-black text-[7px] font-black uppercase tracking-widest">Previewing</span>}
                    {licensed && <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/90 text-black text-[7px] font-black uppercase tracking-widest"><BadgeCheck size={9} /> Licensed</span>}
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <p className="text-xs font-black text-white truncate">{t.title}</p>
                    <p className="text-[10px] text-white/45 truncate">{t.artist}</p>
                    {t.syncLicenseTerms && <p className="text-[8px] text-white/30 mt-1 line-clamp-2 leading-tight">{t.syncLicenseTerms}</p>}
                    <div className="mt-auto pt-2.5 flex items-center justify-between gap-2">
                      <span className="text-sm font-black text-small-orange tabular-nums">{canLicense ? `$${fee.toFixed(0)}` : <span className="text-[9px] text-white/30 uppercase tracking-widest">No price yet</span>}<span className="text-[8px] text-white/30 font-bold"> {fmtDur(t.duration)}</span></span>
                      {canLicense ? (
                        <button onClick={() => licenseAndAdd(t)} disabled={busyId === t.id}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors disabled:opacity-50 ${licensed ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-small-orange text-black hover:brightness-110'}`}>
                          {busyId === t.id ? <Loader2 size={11} className="animate-spin" /> : licensed ? <><Plus size={11} /> Add</> : <><ShieldCheck size={11} /> License</>}
                        </button>
                      ) : req?.status === 'PENDING' ? (
                        <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-white/5 text-amber-400 border border-amber-500/20"><Clock size={11} /> Pending</span>
                      ) : req?.status === 'DENIED' ? (
                        <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-white/5 text-rose-400/70 border border-rose-500/20"><Ban size={11} /> Declined</span>
                      ) : (
                        <button onClick={() => { setRequestFor(t); setDesc(''); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-white/8 text-white/70 hover:text-white border border-white/10">
                          <MailQuestion size={11} /> Request
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 px-5 py-2 border-t border-white/8 flex items-center gap-2 text-[9px] text-white/35">
        <ShieldCheck size={12} className="text-small-orange/70" /> Licensing pays the artist (minus the platform fee) via Stripe and clears the track for this project. Un-priced tracks: request a license and the artist sets a price.
      </div>

      {/* Request-a-license modal */}
      {requestFor && (
        <div className="absolute inset-0 z-[10] bg-black/70 flex items-center justify-center p-4" onClick={() => setRequestFor(null)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-[#0d0d11] border border-white/10 p-5 space-y-4">
            <div className="flex items-center gap-3">
              {requestFor.cover && <img src={requestFor.cover} className="w-12 h-12 rounded-lg object-cover" alt="" />}
              <div className="min-w-0"><p className="text-sm font-black text-white truncate">{requestFor.title}</p><p className="text-[10px] text-white/45 truncate">{requestFor.artist}</p></div>
              <button onClick={() => setRequestFor(null)} className="ml-auto text-white/40 hover:text-white"><X size={16} /></button>
            </div>
            <p className="text-[11px] text-white/45 leading-relaxed">This track isn’t priced for sync yet. Tell the artist how you’d like to use it — they’ll reply with a price, or decline.</p>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} maxLength={800}
              placeholder="e.g. Opening montage of a 12-min indie short, festival + online release, one-time use…"
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 resize-none" />
            <div className="flex gap-3">
              <button onClick={sendRequest} disabled={sending || !desc.trim()} className="flex-1 py-3 rounded-full bg-small-orange text-black font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2">{sending ? <Loader2 size={14} className="animate-spin" /> : <MailQuestion size={14} />} Send request</button>
              <button onClick={() => setRequestFor(null)} className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white/70 font-black text-xs uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicLicensingStore;
