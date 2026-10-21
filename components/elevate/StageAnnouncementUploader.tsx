// StageAnnouncementUploader — the sender's side of Stage's Announcements row (services/ambo/stageInbox.ts).
//
// Opened from the operator's QR / link (?stageUpload=<orgId>) or the "Send to Stage" button in an
// Elevate org. A department member, leader, volunteer or guest musician picks a photo, video or
// backing track from their phone, adds a sticky-note instruction for the operator and sends it.
// Once the operator grants remote control of an item, this screen becomes its play/stop remote.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, Megaphone, Play, Square, Trash2, Loader2, Image as ImageIcon, Film, Music, Smartphone, Check, AlertTriangle } from 'lucide-react';
import { auth } from '../../services/firebase';
import { fetchOrganization, fetchUserMemberships, fetchUserOrganizations } from '../../services/organizationService';
import {
  uploadToStageInbox, listenToStageInboxControl, listenToMyStageUploads, sendStageRemoteCommand, withdrawStageUpload,
  kindForFile, LEADERSHIP_SOURCE, GUEST_SOURCE, STAGE_INBOX_MAX_BYTES,
  type StageInboxControl, type StageInboxItem,
} from '../../services/ambo/stageInbox';
import type { Organization, OrgMembership } from '../../types';

interface Props {
  orgId?: string;
  onClose: () => void;
}

const KIND_ICON = { image: ImageIcon, video: Film, audio: Music } as const;
const STATUS_LABEL: Record<StageInboxItem['status'], string> = {
  uploading: 'Uploading', ready: 'Waiting in Stage', live: 'On screen now', played: 'Played', dismissed: 'Cleared by operator', failed: 'Upload failed',
};

const StageAnnouncementUploader: React.FC<Props> = ({ orgId: initialOrgId, onClose }) => {
  const uid = auth.currentUser?.uid || '';
  const [orgId, setOrgId] = useState<string | undefined>(initialOrgId);
  const [myOrgs, setMyOrgs] = useState<Organization[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<OrgMembership | null>(null);
  const [control, setControl] = useState<StageInboxControl | null>(null);
  const [mine, setMine] = useState<StageInboxItem[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!uid || initialOrgId) return;
    fetchUserOrganizations(uid).then(list => { setMyOrgs(list); if (list.length === 1) setOrgId(list[0].id); }).catch(() => {});
  }, [uid, initialOrgId]);

  useEffect(() => {
    if (!orgId || !uid) return;
    setOrg(null); setMembership(null); setControl(null);
    fetchOrganization(orgId).then(o => setOrg(o as Organization | null)).catch(() => setOrg(null));
    fetchUserMemberships(uid).then(ms => setMembership(ms.find(m => m.orgId === orgId && m.status === 'ACTIVE') || null)).catch(() => {});
    const offC = listenToStageInboxControl(orgId, setControl);
    const offM = listenToMyStageUploads(orgId, uid, setMine);
    return () => { offC(); offM(); };
  }, [orgId, uid]);

  const isLead = !!org && (org.creatorId === uid || org.admins?.includes(uid) || !!org.pastorUids?.includes(uid) || !!org.leaderUids?.includes(uid) || !!org.staffUids?.includes(uid));
  const sources = useMemo(() => {
    const ministries = (org?.ministries || []).filter(m => isLead || membership?.ministryIds?.includes(m.id));
    return [
      ...ministries.map(m => ({ id: m.id, name: m.name })),
      ...(isLead ? [LEADERSHIP_SOURCE] : []),
      GUEST_SOURCE,
    ];
  }, [org, membership, isLead]);
  useEffect(() => { if (!sources.find(s => s.id === sourceId)) setSourceId(sources[0]?.id || ''); }, [sources, sourceId]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f: File | undefined) => {
    setError(''); setSent(false);
    if (!f) return;
    const kind = kindForFile(f);
    if (!kind) { setError('Pick a photo, video or audio track.'); return; }
    if (f.size > STAGE_INBOX_MAX_BYTES) { setError('That file is over the 4 GB limit.'); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    // A backing track almost always comes from the guest musician.
    if (kind === 'audio' && !isLead && !membership?.ministryIds?.length) setSourceId(GUEST_SOURCE.id);
  };

  const send = async () => {
    if (!file || !orgId) return;
    const source = sources.find(s => s.id === sourceId) || GUEST_SOURCE;
    setError(''); setProgress(0);
    try {
      await uploadToStageInbox({ orgId, file, title, note, source, remoteDefault: control?.remoteDefault }, setProgress);
      setSent(true); setFile(null); setPreview(''); setTitle(''); setNote('');
    } catch (e: any) {
      const msg = String(e?.message || e);
      setError(/permission|insufficient/i.test(msg) ? 'Stage is not accepting uploads from your account right now. Ask the operator to turn Receiving on, and make sure you are a member of this organization.' : msg);
    } finally {
      setProgress(null);
    }
  };

  const kind = file ? kindForFile(file) : null;
  const accepting = !!control?.accepting;

  return (
    <div className="fixed inset-0 z-[400] bg-[#0b0712] text-white overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 pb-10">
        <header className="sticky top-0 z-10 -mx-4 px-4 py-3 flex items-center gap-3 bg-[#0b0712]/95 backdrop-blur border-b border-white/10">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#D40055,#FF8C00)' }}><Megaphone size={18} /></div>
          <div className="flex-1 min-w-0">
            <div className="font-bold leading-tight">Send to Stage</div>
            <div className="text-xs text-white/50 truncate">{org?.name || 'Announcements & media for the service'}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center" aria-label="Close"><X size={18} /></button>
        </header>

        {!uid && <p className="mt-6 text-sm text-white/70">Sign in to send announcements and media to Stage.</p>}

        {uid && !orgId && (
          <div className="mt-5 space-y-2">
            <p className="text-sm text-white/60">Which organization is this for?</p>
            {myOrgs.length === 0 && <p className="text-sm text-white/40">You are not a member of any organization yet.</p>}
            {myOrgs.map(o => (
              <button key={o.id} onClick={() => setOrgId(o.id)} className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-semibold">{o.name}</button>
            ))}
          </div>
        )}

        {uid && orgId && (
          <>
            <div className={`mt-4 flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${accepting ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 bg-white/5 text-white/60'}`}>
              <span className={`w-2 h-2 rounded-full ${accepting ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
              {control === null ? 'Checking Stage…' : accepting ? 'Stage is receiving uploads' : 'Stage is not receiving uploads right now — the operator turns this on during service prep.'}
            </div>

            <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <input ref={fileInput} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
              {!file ? (
                <button onClick={() => fileInput.current?.click()} className="w-full h-36 rounded-xl border-2 border-dashed border-white/20 hover:border-[#FF8C00]/70 flex flex-col items-center justify-center gap-2 text-white/70">
                  <Upload size={26} />
                  <span className="font-semibold">Choose a photo, video or backing track</span>
                  <span className="text-xs text-white/40">From your camera roll, files or recorder</span>
                </button>
              ) : (
                <div className="rounded-xl overflow-hidden bg-black/50 border border-white/10">
                  {kind === 'image' && <img src={preview} alt="" className="w-full max-h-64 object-contain" />}
                  {kind === 'video' && <video src={preview} controls playsInline className="w-full max-h-64" />}
                  {kind === 'audio' && <div className="p-4 flex flex-col gap-2"><div className="flex items-center gap-2 text-sm font-semibold"><Music size={16} /> {file.name}</div><audio src={preview} controls className="w-full" /></div>}
                  <div className="flex items-center justify-between px-3 py-2 text-xs text-white/50">
                    <span className="truncate">{file.name} · {(file.size / 1024 ** 2).toFixed(1)} MB</span>
                    <button onClick={() => { setFile(null); setPreview(''); }} className="text-white/70 hover:text-white">Change</button>
                  </div>
                </div>
              )}

              <label className="block">
                <span className="text-xs font-semibold text-white/60">Title</span>
                <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Youth retreat sign-ups" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 focus:border-[#FF8C00]/70 outline-none text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-white/60">From</span>
                <select value={sourceId} onChange={e => setSourceId(e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 outline-none text-sm">
                  {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-white/60">Note for the operator</span>
                <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={600} rows={3}
                  placeholder={kind === 'audio' ? 'Backing track for the offertory song — starts after the count-in' : 'Show while I announce the retreat, right after the welcome'}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none" style={{ background: '#FDE68A', color: '#422006' }} />
              </label>

              {error && <div className="flex gap-2 text-sm text-red-300"><AlertTriangle size={16} className="flex-none mt-0.5" /> {error}</div>}
              {sent && <div className="flex gap-2 text-sm text-emerald-300"><Check size={16} /> Sent — it is now in the Announcements row in Stage.</div>}

              <button onClick={send} disabled={!file || !accepting || progress !== null}
                className="w-full h-12 rounded-xl font-extrabold tracking-wide disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#D40055,#FF8C00)' }}>
                {progress !== null ? <><Loader2 size={16} className="animate-spin" /> Sending {Math.round(progress)}%</> : <><Megaphone size={16} /> Send to Stage</>}
              </button>
            </section>

            {mine.length > 0 && (
              <section className="mt-6">
                <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-white/45 mb-2">Your uploads</h3>
                <div className="space-y-2">
                  {mine.map(it => {
                    const Icon = KIND_ICON[it.kind];
                    const live = it.status === 'live';
                    return (
                      <div key={it.id} className={`rounded-xl border p-3 ${live ? 'border-red-500/70 bg-red-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
                        <div className="flex items-center gap-3">
                          <Icon size={18} className="text-white/60 flex-none" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate">{it.title}</div>
                            <div className="text-xs text-white/45">{it.sourceName} · {it.status === 'uploading' ? `Uploading ${it.progress || 0}%` : STATUS_LABEL[it.status]}</div>
                          </div>
                          {(it.status === 'ready' || it.status === 'uploading' || it.status === 'failed') && (
                            <button onClick={() => withdrawStageUpload(it).catch(() => {})} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/50" aria-label="Withdraw"><Trash2 size={15} /></button>
                          )}
                        </div>
                        {it.remoteAllowed && it.status !== 'dismissed' && it.status !== 'uploading' && it.status !== 'failed' && (
                          <div className="mt-3 flex items-center gap-2">
                            <span className="flex items-center gap-1 text-[11px] text-cyan-300 mr-auto"><Smartphone size={12} /> You have remote control</span>
                            {live ? (
                              <button onClick={() => sendStageRemoteCommand(it, 'stop').catch(e => setError(e.message))} className="h-11 px-5 rounded-xl bg-red-600 font-bold flex items-center gap-2"><Square size={15} /> Stop</button>
                            ) : (
                              <button onClick={() => sendStageRemoteCommand(it, 'play').catch(e => setError(e.message))} className="h-11 px-5 rounded-xl font-bold flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#D40055,#FF8C00)' }}><Play size={15} /> Play</button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StageAnnouncementUploader;
