// A published video's studio. Two tabs:
//   Details             everything the upload form set, editable after publishing: title, description,
//                       thumbnail (a frame Mux renders, or your own), tags, category, visibility, whether
//                       it's a Short, playlists and the department channel it posts to.
//   Story Intelligence  what was found in the video (summary, chapters, moments) and the drafts it made:
//                       blog post, Shorts, store listings. Run it from here if it never ran.
// Opened with openVideoStudio() (services/reello/videoStudio); ReelloUploadDock hosts it.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, Check, Globe, Lock, Image as ImageIcon, Sparkles, ListVideo, Building2, Smartphone, AlertCircle, ExternalLink } from 'lucide-react';
import type { Video, VideoPlaylist } from '../../types';
import { auth } from '../../services/firebase';
import {
  fetchVideoById, updateVideoSettings, uploadImageWithDerivatives, fetchUserVideoPlaylists, addVideoToPlaylist, removeVideoFromPlaylist,
} from '../../services/backendService';
import { postableDepartments, attachToDepartment, detachFromDepartment, type PostableOrg } from '../../services/reello/orgChannels';
import { getIntel, requestIntel } from '../../services/reello/reelloApi';
import { DEFAULT_INTEL_OPTIONS } from '../../services/reello/intel/core';
import type { ReelloIntelJob } from '../../services/reello/intel/types';
import { announceVideoUpdated, muxStillCandidates, type VideoStudioTab } from '../../services/reello/videoStudio';
import { isShortForm, videoSeconds, MAX_SHORT_SEC } from '../../services/reello/shortForm';
import { JobCard } from './upload/ReelloIntelDrafts';
import { openStoryIntelWorkspace } from '../../services/storyIntel/open';
import { findingsFromJob, stateOf } from '../../services/storyIntel/findings';
const PeerTubePublishModal = React.lazy(() => import('../networks/PeerTubePublishModal'));

const GENRES = ['General', 'Music', 'Vlog', 'Education', 'How-to', 'Comedy', 'Gaming', 'Faith', 'News', 'Sports', 'Food', 'Fashion', 'Business', 'Film & Animation'];
// firestore.rules isValidVideo: title < 200, description < 2000.
const TITLE_MAX = 100;
const DESC_MAX = 1999;

type Format = 'auto' | 'short' | 'long';
interface Draft {
  title: string; description: string; tags: string; genre: string; isPrivate: boolean; format: Format;
  thumbnailUrl: string; thumbFile: File | null; playlistIds: string[]; deptKey: string;
}

const deptKeyOf = (v: any) => v?.orgChannel?.orgId && v?.orgChannel?.departmentId ? `${v.orgChannel.orgId}::${v.orgChannel.departmentId}` : '';
const draftOf = (v: Video, inPlaylists: string[]): Draft => ({
  title: v.title || '', description: v.description || '', tags: (v.tags || []).join(', '), genre: v.genre || 'General',
  isPrivate: !!v.isPrivate, format: (v.format as Format) || 'auto', thumbnailUrl: v.thumbnailUrl || '', thumbFile: null,
  playlistIds: inPlaylists, deptKey: deptKeyOf(v),
});

// ── Details tab ──────────────────────────────────────────────────────────────

const DetailsTab: React.FC<{ video: Video; onSaved: (v: Video) => void }> = ({ video, onSaved }) => {
  const uid = auth.currentUser?.uid || '';
  const [playlists, setPlaylists] = useState<VideoPlaylist[]>([]);
  const [orgs, setOrgs] = useState<PostableOrg[]>([]);
  const initialPlaylists = useMemo(() => playlists.filter(p => (p.videoIds || []).includes(video.id)).map(p => p.id), [playlists, video.id]);
  const [d, setD] = useState<Draft>(() => draftOf(video, []));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [localThumb, setLocalThumb] = useState('');
  const set = (p: Partial<Draft>) => { setD(x => ({ ...x, ...p })); setMsg(null); };

  useEffect(() => {
    if (!uid) return;
    fetchUserVideoPlaylists(uid).then(ps => {
      setPlaylists(ps);
      const ids = ps.filter(p => (p.videoIds || []).includes(video.id)).map(p => p.id);
      setD(x => ({ ...x, playlistIds: ids }));
    }).catch(() => {});
    postableDepartments().then(setOrgs).catch(() => {});
  }, [uid, video.id]);
  useEffect(() => () => { if (localThumb) URL.revokeObjectURL(localThumb); }, [localThumb]);

  const secs = videoSeconds(video);
  const stills = muxStillCandidates((video as any).muxPlaybackId, secs);
  const autoIsShort = isShortForm({ ...video, format: undefined });

  const save = async () => {
    if (!d.title.trim()) { setMsg({ ok: false, text: 'Add a title.' }); return; }
    setBusy(true); setMsg(null);
    const notes: string[] = [];
    try {
      let thumbnailUrl = d.thumbnailUrl;
      if (d.thumbFile) thumbnailUrl = (await uploadImageWithDerivatives(`videos/${video.id}/thumb_${Date.now().toString(36)}`, d.thumbFile)).display;
      const patch: Partial<Video> = {
        title: d.title.trim().slice(0, TITLE_MAX), description: d.description.slice(0, DESC_MAX),
        tags: d.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 30), genre: d.genre, isPrivate: d.isPrivate,
        ...(thumbnailUrl && thumbnailUrl !== video.thumbnailUrl ? { thumbnailUrl } : {}),
      };
      // 'auto' clears the creator's call so shape and length decide again.
      (patch as any).format = d.format === 'auto' ? null : d.format;
      await updateVideoSettings(video.id, patch);

      // Playlists: add and remove only what changed.
      const before = new Set(initialPlaylists), after = new Set(d.playlistIds);
      for (const id of after) if (!before.has(id)) await addVideoToPlaylist(id, video.id).catch(() => notes.push('a playlist could not be updated'));
      for (const id of before) if (!after.has(id)) await removeVideoFromPlaylist(id, video.id).catch(() => notes.push('a playlist could not be updated'));

      // Department channel: move it, take it off, or put it on one.
      const was = deptKeyOf(video);
      if (was !== d.deptKey) {
        if (was) { const [orgId, departmentId] = was.split('::'); await detachFromDepartment('video', video.id, { orgId, departmentId }).catch(e => notes.push(`Department: ${e?.message || e}`)); }
        if (d.deptKey) { const [orgId, departmentId] = d.deptKey.split('::'); await attachToDepartment('video', video.id, { orgId, departmentId }).catch(e => notes.push(`Department: ${e?.message || e}`)); }
      }
      const fresh = (await fetchVideoById(video.id)) || ({ ...video, ...patch } as Video);
      announceVideoUpdated(fresh);
      onSaved(fresh);
      setD(x => ({ ...x, thumbFile: null, thumbnailUrl: fresh.thumbnailUrl || x.thumbnailUrl }));
      setMsg({ ok: !notes.length, text: notes.length ? `Saved, but ${[...new Set(notes)].join('; ')}.` : 'Saved.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not save.' });
    } finally { setBusy(false); }
  };

  const shownThumb = localThumb || d.thumbnailUrl;
  return (
    <div className="space-y-5">
      <label className="block rounded-xl border border-white/10 focus-within:border-[#00B4D8] px-3 py-2">
        <span className="flex justify-between text-xs text-white/50"><span>Title (required)</span><span>{d.title.length}/{TITLE_MAX}</span></span>
        <textarea rows={2} maxLength={TITLE_MAX} value={d.title} onChange={e => set({ title: e.target.value })} className="w-full bg-transparent text-white resize-none focus:outline-none" />
      </label>
      <label className="block rounded-xl border border-white/10 focus-within:border-[#00B4D8] px-3 py-2">
        <span className="flex justify-between text-xs text-white/50"><span>Description</span><span>{d.description.length}/{DESC_MAX}</span></span>
        <textarea rows={6} maxLength={DESC_MAX} value={d.description} onChange={e => set({ description: e.target.value })} className="w-full bg-transparent text-white text-sm resize-y focus:outline-none" />
      </label>

      <div>
        <p className="text-sm font-semibold text-white">Thumbnail</p>
        <p className="text-xs text-white/50 mb-2">Pick a frame from the video, or upload your own.</p>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => fileInput.current?.click()} className="w-32 h-[72px] rounded-lg border border-dashed border-white/20 text-white/60 text-xs grid place-items-center hover:border-white/40"><span className="flex flex-col items-center gap-1"><ImageIcon size={16} />Upload</span></button>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={e => {
            const f = e.target.files?.[0]; if (!f) return;
            if (localThumb) URL.revokeObjectURL(localThumb);
            setLocalThumb(URL.createObjectURL(f)); set({ thumbFile: f });
          }} />
          {shownThumb && <div className="w-32 h-[72px] rounded-lg overflow-hidden ring-2 ring-[#00B4D8] relative"><img src={shownThumb} alt="Current thumbnail" className="w-full h-full object-cover" /><span className="absolute bottom-0 inset-x-0 text-[9px] text-center bg-black/60 text-white/80">{d.thumbFile ? 'Your picture' : 'Current'}</span></div>}
          {stills.filter(s => s !== d.thumbnailUrl).map((s, i) => (
            <button key={s} type="button" onClick={() => { if (localThumb) URL.revokeObjectURL(localThumb); setLocalThumb(''); set({ thumbnailUrl: s, thumbFile: null }); }} className="w-32 h-[72px] rounded-lg overflow-hidden ring-2 ring-transparent hover:ring-white/30">
              <img src={s} alt={`Frame ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-white/60">Tags</span>
          <input value={d.tags} onChange={e => set({ tags: e.target.value })} placeholder="comma, separated" className="mt-1 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-white/60">Category</span>
          <select value={d.genre} onChange={e => set({ genre: e.target.value })} className="mt-1 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
            {[...new Set([d.genre, ...GENRES])].map(g => <option key={g}>{g}</option>)}
          </select>
        </label>
      </div>

      <div>
        <p className="text-sm font-semibold text-white flex items-center gap-2"><Smartphone size={15} className="text-white/60" />Shorts</p>
        <p className="text-xs text-white/50 mb-2">Shorts are vertical or square and up to {MAX_SHORT_SEC / 60} minutes. Full-length videos stay out of Shorts.</p>
        <div className="grid sm:grid-cols-3 gap-2">
          {([['auto', `Automatic (${autoIsShort ? 'a Short' : 'not a Short'})`], ['short', 'Show in Shorts'], ['long', 'Keep out of Shorts']] as [Format, string][]).map(([k, label]) => (
            <label key={k} className={`p-2.5 rounded-xl border text-xs cursor-pointer ${d.format === k ? 'border-[#00B4D8]/60 bg-[#00B4D8]/10 text-white' : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]'}`}>
              <input type="radio" name={`fmt-${video.id}`} className="sr-only" checked={d.format === k} onChange={() => set({ format: k })} />{label}
            </label>
          ))}
        </div>
        {d.format === 'short' && secs > MAX_SHORT_SEC && <p className="mt-2 text-[11px] text-amber-300">This video is {Math.round(secs / 60)} minutes long. Shorts from it are better made in Story Intelligence.</p>}
      </div>

      {playlists.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-white flex items-center gap-2"><ListVideo size={15} className="text-white/60" />Playlists</p>
          <div className="mt-2 max-h-36 overflow-y-auto space-y-1">
            {playlists.map(p => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" checked={d.playlistIds.includes(p.id)} onChange={e => set({ playlistIds: e.target.checked ? [...d.playlistIds, p.id] : d.playlistIds.filter(x => x !== p.id) })} />
                <span className="truncate">{p.title}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {(orgs.length > 0 || d.deptKey) && (
        <label className="block">
          <span className="text-sm font-semibold text-white flex items-center gap-2"><Building2 size={15} className="text-white/60" />Post to</span>
          <select value={d.deptKey} onChange={e => set({ deptKey: e.target.value })} className="mt-2 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
            <option value="">My channel</option>
            {d.deptKey && !orgs.some(o => o.departments.some(x => `${o.orgId}::${x.id}` === d.deptKey)) && (
              <option value={d.deptKey}>{(video as any).orgChannel?.orgName || 'Organization'} · {(video as any).orgChannel?.departmentName || 'Department'}</option>
            )}
            {orgs.map(o => (
              <optgroup key={o.orgId} label={o.orgName}>
                {o.departments.map(x => <option key={x.id} value={`${o.orgId}::${x.id}`}>{x.iconEmoji ? `${x.iconEmoji} ` : ''}{o.orgName} · {x.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      <div>
        <p className="text-sm font-semibold text-white mb-2">Visibility</p>
        <div className="grid grid-cols-2 gap-2">
          {([false, true] as const).map(priv => (
            <label key={String(priv)} className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer ${d.isPrivate === priv ? 'border-[#00B4D8]/60 bg-[#00B4D8]/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
              <input type="radio" name={`vis-${video.id}`} className="sr-only" checked={d.isPrivate === priv} onChange={() => set({ isPrivate: priv })} />
              {priv ? <Lock size={16} className="mt-0.5 text-white/80" /> : <Globe size={16} className="mt-0.5 text-white/80" />}
              <span><span className="block text-sm font-semibold text-white">{priv ? 'Private' : 'Public'}</span><span className="block text-xs text-white/50">{priv ? 'Only you can watch it' : 'Everyone can watch it'}</span></span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button disabled={busy} onClick={save} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#00B4D8] text-black text-sm font-bold disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Save</button>
        {msg && <p className={`text-xs flex items-center gap-1.5 ${msg.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{msg.ok ? <Check size={13} /> : <AlertCircle size={13} />}{msg.text}</p>}
      </div>
    </div>
  );
};

// ── Story Intelligence tab ──────────────────────────────────────────────────

const IntelTab: React.FC<{ video: Video; onClose: () => void }> = ({ video, onClose }) => {
  const [job, setJob] = useState<ReelloIntelJob | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [starting, setStarting] = useState(false);
  const load = useCallback(() => {
    getIntel(video.id).then(j => { setJob(j); setErr(''); }).catch(e => {
      if (/No such job/i.test(e?.message || '')) setJob(null); else setErr(e?.message || 'Could not load Story Intelligence.');
    });
  }, [video.id]);
  useEffect(() => { load(); }, [load]);
  // Poll while it works; it watches the whole video, which takes a few minutes.
  const working = !!job && !['READY', 'FAILED', 'SKIPPED'].includes(job.status);
  useEffect(() => { if (!working) return; const t = setInterval(load, 15_000); return () => clearInterval(t); }, [working, load]);

  const start = async () => {
    setStarting(true); setErr('');
    try { await requestIntel(video.id, { ...DEFAULT_INTEL_OPTIONS }, job?.status === 'FAILED'); load(); }
    catch (e: any) { setErr(e?.message || 'Could not start Story Intelligence.'); }
    finally { setStarting(false); }
  };

  if (err && job === undefined) return <p className="text-sm text-red-300">{err}</p>;
  if (job === undefined) return <div className="flex items-center gap-2 text-sm text-white/50"><Loader2 size={16} className="animate-spin" />Loading…</div>;
  if (job === null) return (
    <div className="text-center py-12 space-y-3">
      <Sparkles size={28} className="mx-auto text-[#00B4D8]" />
      <p className="text-sm text-white">Story Intelligence hasn't watched this video yet.</p>
      <p className="text-xs text-white/50 max-w-sm mx-auto">It watches and listens, then drafts a blog post, Shorts from the strongest moments and store listings for anything offered. Nothing posts until you approve it.</p>
      <button disabled={starting} onClick={start} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#00B4D8] text-black text-sm font-bold disabled:opacity-50">{starting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}Run Story Intelligence</button>
      {err && <p className="text-xs text-red-300">{err}</p>}
    </div>
  );
  const r = job.report;
  return (
    <div className="space-y-4">
      {r && (r.chapters.length > 0 || r.topics.length > 0) && (
        <section className="rounded-2xl bg-[#111116] border border-white/10 p-4 space-y-3">
          {r.topics.length > 0 && <div className="flex flex-wrap gap-1.5">{r.topics.map(t => <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">{t}</span>)}</div>}
          {r.chapters.length > 0 && (
            <ol className="space-y-1">
              {r.chapters.map(c => <li key={c.tSec} className="text-xs text-white/70"><span className="text-[#7fe3f5] tabular-nums mr-2">{Math.floor(c.tSec / 60)}:{String(Math.floor(c.tSec % 60)).padStart(2, '0')}</span>{c.title}</li>)}
            </ol>
          )}
        </section>
      )}
      {job.status === 'READY' && r && (() => {
        const fs = findingsFromJob(job).filter(f => f.kind !== 'product');
        const waiting = fs.filter(f => stateOf(f, job.worldFiling) === 'NEW').length;
        const people = fs.filter(f => f.kind === 'character').length;
        return (
          <section className="rounded-2xl bg-[#15131f] border border-[#b9a4ff]/25 p-4 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Add it to a World</p>
              <p className="text-xs text-white/60">{people} {people === 1 ? 'person' : 'people'}, {fs.length - people} more findings{waiting ? `, ${waiting} not added yet` : ', all reviewed'}.</p>
            </div>
            <button onClick={() => { openStoryIntelWorkspace({ videoId: job.videoId, view: 'desk' }); onClose(); }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#7c5cff] text-white text-xs font-bold"><Sparkles size={13} />Open in Tela</button>
          </section>
        );
      })()}
      <JobCard job={job} onChange={setJob} hideTitle />
      {job.status === 'FAILED' && <button disabled={starting} onClick={start} className="text-xs text-[#7fe3f5] hover:underline">Try again</button>}
      {err && <p className="text-xs text-red-300">{err}</p>}
    </div>
  );
};

// ── The panel ───────────────────────────────────────────────────────────────

const VideoStudioPanel: React.FC<{ videoId: string; initialTab?: VideoStudioTab; onClose: () => void }> = ({ videoId, initialTab = 'details', onClose }) => {
  const [tab, setTab] = useState<VideoStudioTab>(initialTab);
  const [peertubeOpen, setPeertubeOpen] = useState(false);
  const [video, setVideo] = useState<Video | null | undefined>(undefined);
  useEffect(() => { setTab(initialTab); }, [initialTab, videoId]);
  useEffect(() => { let live = true; setVideo(undefined); fetchVideoById(videoId).then(v => { if (live) setVideo(v); }); return () => { live = false; }; }, [videoId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const uid = auth.currentUser?.uid;
  const mine = !!video && !!uid && video.ownerId === uid;
  return (
    <div className="fixed inset-0 z-[100050] bg-black/70 backdrop-blur-sm flex justify-end" onClick={onClose} role="dialog" aria-label="Video studio">
      <div className="w-full max-w-2xl h-full bg-[#0c0c11] border-l border-white/10 flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          {video?.thumbnailUrl && <img src={video.thumbnailUrl} alt="" className="w-20 h-12 rounded-md object-cover bg-black shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Video studio</p>
            <h2 className="text-base font-bold text-white truncate">{video?.title || (video === null ? 'Video not found' : 'Loading…')}</h2>
          </div>
          {video && mine && !video.isPrivate && <button onClick={() => setPeertubeOpen(true)} className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-orange-500/15 border border-orange-400/30 text-orange-200 hover:bg-orange-500/25" title="Also publish to a PeerTube server you choose">PeerTube</button>}
          {video && !video.isPrivate && <a href={`/?v=${encodeURIComponent(video.id)}`} target="_blank" rel="noreferrer" className="text-white/50 hover:text-white" title="Open the watch page"><ExternalLink size={16} /></a>}
          <button onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white"><X size={20} /></button>
        </header>
        {mine && (
          <nav className="flex gap-1 px-5 pt-3">
            {([['details', 'Details'], ['intel', 'Story Intelligence']] as [VideoStudioTab, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-full text-xs font-bold ${tab === k ? 'bg-white text-black' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                {k === 'intel' && <Sparkles size={12} className="inline mr-1.5 -mt-0.5" />}{label}
              </button>
            ))}
          </nav>
        )}
        <div className="flex-1 overflow-y-auto p-5">
          {video === undefined && <div className="flex items-center gap-2 text-sm text-white/50"><Loader2 size={16} className="animate-spin" />Loading…</div>}
          {video === null && <p className="text-sm text-white/60">This video was removed, or you can't open it.</p>}
          {video && !mine && <p className="text-sm text-white/60">Only the account that uploaded this video can edit it.</p>}
          {video && mine && tab === 'details' && <DetailsTab video={video} onSaved={setVideo} />}
          {video && mine && tab === 'intel' && <IntelTab video={video} onClose={onClose} />}
        </div>
      </div>
      {peertubeOpen && video && (
        <React.Suspense fallback={null}>
          <div onClick={e => e.stopPropagation()}><PeerTubePublishModal video={video} onClose={() => setPeertubeOpen(false)} /></div>
        </React.Suspense>
      )}
    </div>
  );
};

export default VideoStudioPanel;
