import React, { useEffect, useMemo, useState } from 'react';
import { X, Film, Music, Loader2, ShieldCheck, Check, MailQuestion, Plus, DollarSign } from 'lucide-react';
import type { Track, Album } from '../types';
import { choraTrackToMusicBin, attachLicensedTrackToProject } from '../services/licenseAttach';
import { listProjectsCloud } from '../services/fabulaProjects';
import { purchaseSyncLicense, listMyGrants, grantKey } from '../services/syncLicensing';
import { createLicenseRequest, listMyLicenseRequests, myRequestsByTrack } from '../services/licenseRequests';
import { auth } from '../services/firebase';
import type { SyncLicenseRequest } from '../types';

// Chora → Fabula: license a song for a film without leaving the music player. Pick a
// film, then License & attach (priced), Attach free (your own track), or Request a
// license (owner hasn't priced it). Attaching drops the track into the film's Media
// Pool so it's waiting on the timeline and visible in the Fabula film hub.

type FilmRow = { id: string; title: string; updated: number; sceneCount: number };

const LicenseForFilmModal: React.FC<{
  track: Track; album: Album;
  onOpenFabula?: () => void;
  onClose: () => void;
}> = ({ track, album, onOpenFabula, onClose }) => {
  const mb = useMemo(() => choraTrackToMusicBin(track, album), [track, album]);
  const myUid = auth.currentUser?.uid;
  const isOwner = !!myUid && mb.rightsOwnerId === myUid;
  const fee = Number(mb.syncLicenseFee || 0);

  const [films, setFilms] = useState<FilmRow[] | null>(null);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [reqByTrack, setReqByTrack] = useState<Record<string, SyncLicenseRequest>>({});
  const [pick, setPick] = useState<string>('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    listProjectsCloud().then(rows => {
      const list = (rows || []).map((r: any) => ({ id: r.id, title: r.title, updated: r.updated, sceneCount: r.sceneCount }));
      setFilms(list);
      if (list[0]) setPick(list[0].id);
    });
    if (myUid) {
      listMyGrants(myUid).then(gs => setGrants(new Set(gs.map(g => grantKey(g.trackId, g.editId)))));
      listMyLicenseRequests(myUid).then(r => setReqByTrack(myRequestsByTrack(r)));
    }
  }, [myUid]);

  const req = reqByTrack[mb.id];
  const alreadyGranted = !!pick && grants.has(grantKey(mb.id, pick));
  // What can we do for the selected film?
  const mode: 'attach-free' | 'license' | 'request' | 'requested' =
    isOwner ? 'attach-free'
    : (fee > 0 || alreadyGranted) ? 'license'
    : req && req.status === 'PENDING' ? 'requested'
    : 'request';

  const finish = (msg: string) => { setDone(msg); setBusy(false); };

  const doAttach = async (): Promise<boolean> => {
    const res = await attachLicensedTrackToProject(pick, mb);
    if (!res.ok) { alert(res.error === 'project-not-found' ? 'Could not open that film.' : 'Could not attach to the film.'); return false; }
    return true;
  };

  const onLicense = async () => {
    if (!pick) { alert('Pick a film first.'); return; }
    setBusy(true);
    try {
      const attached = await doAttach();
      if (!attached) { setBusy(false); return; }
      if (mode === 'attach-free' || alreadyGranted) {
        finish(alreadyGranted ? 'Already licensed — attached to your film.' : 'Attached to your film.');
        return;
      }
      // Priced: kick off Stripe checkout (grant is written on success). We've already
      // dropped the track into the film so it's waiting when they return.
      const film = films?.find(f => f.id === pick);
      await purchaseSyncLicense({ track: mb, editId: pick, editTitle: film?.title });
      // purchaseSyncLicense redirects to Stripe; code below only runs if it didn't.
      finish('Attached — complete checkout to clear the license.');
    } catch (e: any) { alert(e?.message || 'Could not start licensing.'); setBusy(false); }
  };

  const onRequest = async () => {
    if (!pick) { alert('Pick a film first.'); return; }
    if (!desc.trim()) { alert('Add a short note about your use.'); return; }
    setBusy(true);
    try {
      const film = films?.find(f => f.id === pick);
      const r = await createLicenseRequest({ track: mb, editId: pick, editTitle: film?.title, description: desc });
      if (r) setReqByTrack(p => ({ ...p, [mb.id]: r }));
      finish('Request sent — the artist will set a price or decline.');
    } catch (e: any) { alert(e?.message || 'Could not send the request.'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[360] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-3xl bg-[#0c0c11] border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
          {mb.cover ? <img src={mb.cover} className="w-12 h-12 rounded-xl object-cover" alt="" /> : <div className="w-12 h-12 rounded-xl bg-white/5 grid place-items-center"><Music size={18} className="text-white/30" /></div>}
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-small-orange">Use in a film</p>
            <p className="text-sm font-black text-white truncate">{mb.title}</p>
            <p className="text-[10px] text-white/45 truncate">{mb.artist}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 grid place-items-center text-white/40 hover:text-white"><X size={15} /></button>
        </div>

        {done ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 grid place-items-center mx-auto"><Check size={26} className="text-emerald-400" /></div>
            <p className="text-sm font-bold text-white">{done}</p>
            <div className="flex gap-3 justify-center">
              {onOpenFabula && <button onClick={onOpenFabula} className="px-5 py-2.5 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Film size={13} /> Open in Fabula</button>}
              <button onClick={onClose} className="px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-white/70 text-[10px] font-black uppercase tracking-widest">Done</button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Film picker */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Attach to which film?</p>
              {!films ? (
                <div className="py-6 grid place-items-center text-white/25"><Loader2 size={18} className="animate-spin" /></div>
              ) : films.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center">
                  <Film size={22} className="mx-auto text-white/15 mb-2" />
                  <p className="text-[11px] text-white/45">You don’t have a Fabula film yet.</p>
                  {onOpenFabula && <button onClick={onOpenFabula} className="mt-3 px-4 py-2 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5"><Plus size={12} /> Create a film in Fabula</button>}
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                  {films.map(f => (
                    <button key={f.id} onClick={() => setPick(f.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${pick === f.id ? 'border-small-orange/50 bg-small-orange/10' : 'border-white/8 bg-white/[0.02] hover:border-white/20'}`}>
                      <Film size={15} className={pick === f.id ? 'text-small-orange' : 'text-white/30'} />
                      <div className="min-w-0 flex-1"><p className="text-xs font-bold text-white truncate">{f.title || 'Untitled'}</p><p className="text-[9px] text-white/35">{f.sceneCount || 0} scene{f.sceneCount === 1 ? '' : 's'}</p></div>
                      {pick === f.id && <Check size={14} className="text-small-orange" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Terms / price line */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/8 px-4 py-3 flex items-center gap-3">
              <ShieldCheck size={16} className="text-small-orange/70 shrink-0" />
              <p className="text-[11px] text-white/55 leading-snug">
                {mode === 'attach-free' && 'This is your track — attach it to your film for free.'}
                {mode === 'license' && (alreadyGranted ? 'You already hold a license for this film — just attach it.' : <>Licensing fee <span className="text-small-orange font-black">${fee.toFixed(0)}</span>{mb.syncLicenseTerms ? ` · ${mb.syncLicenseTerms}` : ''}. Paid to the artist via Stripe.</>)}
                {mode === 'requested' && 'You’ve already requested this track — waiting on the artist to set a price.'}
                {mode === 'request' && 'The artist hasn’t priced this for sync yet. Send a request and they’ll set a price or decline.'}
              </p>
            </div>

            {/* Request note */}
            {mode === 'request' && (
              <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} maxLength={800}
                placeholder="How you’d like to use it — e.g. opening montage of a 10-min short, festival + online…"
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 resize-none" />
            )}

            {/* Action */}
            <div className="flex gap-3 pt-1">
              {mode === 'requested' ? (
                <button disabled className="flex-1 py-3 rounded-full bg-white/5 border border-amber-500/20 text-amber-400 text-[11px] font-black uppercase tracking-widest">Request pending</button>
              ) : mode === 'request' ? (
                <button onClick={onRequest} disabled={busy || !pick || !desc.trim()} className="flex-1 py-3 rounded-full bg-small-orange text-black text-[11px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2">{busy ? <Loader2 size={14} className="animate-spin" /> : <MailQuestion size={14} />} Send request</button>
              ) : (
                <button onClick={onLicense} disabled={busy || !pick} className="flex-1 py-3 rounded-full bg-small-orange text-black text-[11px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : mode === 'attach-free' || alreadyGranted ? <Check size={14} /> : <DollarSign size={14} />}
                  {mode === 'attach-free' ? 'Attach to film' : alreadyGranted ? 'Attach to film' : `License & attach · $${fee.toFixed(0)}`}
                </button>
              )}
              <button onClick={onClose} className="px-5 py-3 rounded-full bg-white/5 border border-white/10 text-white/60 text-[11px] font-black uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LicenseForFilmModal;
