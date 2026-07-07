import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Music, Play, Pause, Search, X, Loader2, BadgeCheck, Plus, ShieldCheck, ExternalLink } from 'lucide-react';
import { getLicensableTracks, type MusicBinTrack } from '../services/fabulaMusic';
import { purchaseSyncLicense, grantKey } from '../services/syncLicensing';

// Gallery-style music sync-licensing STORE for Fabula's edit page. Browse every
// artist's licensable track, PREVIEW it inline, and license + drop it into the cut.
// Licensing routes payment to the artist (minus the platform fee) via Stripe; the
// grant clears the track for THIS edit.

const fmtDur = (s?: number) => s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '';

const MusicLicensingStore: React.FC<{
  editId: string;
  editTitle?: string;
  licensedKeys: Set<string>;          // "trackId::editId" grants the buyer already holds
  onAddToProject: (track: MusicBinTrack) => void;
  onClose: () => void;
}> = ({ editId, editTitle, licensedKeys, onAddToProject, onClose }) => {
  const [tracks, setTracks] = useState<MusicBinTrack[] | null>(null);
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('ALL');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { getLicensableTracks(120).then(setTracks); }, []);
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
    audioRef.current.src = t.url;
    audioRef.current.play().catch(() => {});
    setPreviewId(t.id);
    audioRef.current.onended = () => setPreviewId(null);
  };

  const licenseAndAdd = async (t: MusicBinTrack) => {
    const licensed = licensedKeys.has(grantKey(t.id, editId));
    onAddToProject(t);                        // drop into the cut immediately
    if (licensed) return;                     // already cleared for this edit
    setBusyId(t.id);
    try { await purchaseSyncLicense({ track: t, editId, editTitle }); }   // → Stripe checkout
    catch (e: any) { alert(e?.message || 'Could not start the license checkout.'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="fixed inset-0 z-[350] bg-[#0a0a0d]/95 backdrop-blur-sm flex flex-col" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-white/8">
        <Music size={18} className="text-small-orange" />
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white leading-none">Music Licensing Store</p>
          <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mt-1">License a track for {editTitle || 'this edit'} — pays the artist directly</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10">
            <Search size={13} className="text-white/40" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tracks, artists…" className="bg-transparent text-xs text-white outline-none w-44 placeholder:text-white/25" />
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 grid place-items-center text-white/40 hover:text-white"><X size={15} /></button>
        </div>
      </div>

      {/* Genre chips */}
      <div className="shrink-0 flex gap-1.5 px-5 py-2.5 overflow-x-auto scrollbar-hide border-b border-white/6">
        {genres.map(g => (
          <button key={g} onClick={() => setGenre(g)} className={`shrink-0 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors ${genre === g ? 'bg-small-orange text-black' : 'bg-white/5 text-white/45 hover:text-white'}`}>{g === 'ALL' ? 'All' : g}</button>
        ))}
      </div>

      {/* Gallery */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        {!tracks ? (
          <div className="h-full grid place-items-center text-white/30"><Loader2 size={20} className="animate-spin" /></div>
        ) : shown.length === 0 ? (
          <div className="h-full grid place-items-center text-center">
            <div><Music size={30} className="mx-auto text-white/12 mb-3" /><p className="text-[11px] font-black uppercase tracking-widest text-white/30">No licensable tracks yet</p><p className="text-[10px] text-white/25 mt-1 max-w-xs">Artists set a sync-license fee on a track in the Album Creator to list it here.</p></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 max-w-7xl mx-auto">
            {shown.map(t => {
              const licensed = licensedKeys.has(grantKey(t.id, editId));
              const playing = previewId === t.id;
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
                      <span className="text-sm font-black text-small-orange tabular-nums">${(t.syncLicenseFee || 0).toFixed(0)}<span className="text-[8px] text-white/30 font-bold"> {fmtDur(t.duration)}</span></span>
                      <button onClick={() => licenseAndAdd(t)} disabled={busyId === t.id}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors disabled:opacity-50 ${licensed ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-small-orange text-black hover:brightness-110'}`}>
                        {busyId === t.id ? <Loader2 size={11} className="animate-spin" /> : licensed ? <><Plus size={11} /> Add</> : <><ShieldCheck size={11} /> License</>}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 px-5 py-2 border-t border-white/8 flex items-center gap-2 text-[9px] text-white/35">
        <ShieldCheck size={12} className="text-small-orange/70" /> Licensing charges your card and pays the artist (minus the platform fee) via their connected Stripe — the grant clears the track for this project.
        <a href="https://audius.co" onClick={e => e.preventDefault()} className="ml-auto hidden" tabIndex={-1}><ExternalLink size={10} /></a>
      </div>
    </div>
  );
};

export default MusicLicensingStore;
