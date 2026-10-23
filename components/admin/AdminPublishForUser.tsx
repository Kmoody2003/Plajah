// Admin → Publish for User: upload an artist's album from the admin account and publish it ON THEIR account.
//
// Files go straight from the browser to Storage (albums/{albumId}/…, the same paths AlbumCreator uses), then
// POST /api/admin/publish-as/album hands every file to the artist and writes the album as theirs
// (routes/adminPublishAs.ts). Nothing on the published album names the admin.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, Image as ImageIcon, Loader2, Music, Search, Trash2, UploadCloud, UserCheck, X } from 'lucide-react';
import type { UserProfile } from '../../types';
import { auth } from '../../services/firebase';
import { uploadFile, uploadImageWithDerivatives } from '../../services/backendService';
import { publishAsTrackId, titleFromFilename } from '../../services/publishAsUser';
import { buildShareUrl } from '../../services/deepLinkService';

interface Target { uid: string; displayName: string; username: string; photoURL: string; isArtist: boolean }
interface DraftTrack { key: string; file: File; title: string; durationSec?: number }

const GENRES = ['Soundtrack', 'Hip-Hop', 'R&B', 'Pop', 'Rock', 'Electronic', 'Gospel', 'Jazz', 'Classical', 'Country', 'Latin', 'Afrobeats', 'Reggae', 'Metal', 'Folk', 'Ambient', 'Other'];

async function authed(path: string, init?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

/** A pasted profile link (…/profile/<uid>) or a bare uid. */
const uidFromInput = (s: string): string | null => {
  const m = s.trim().match(/profile\/([\w-]{10,128})/) || s.trim().match(/^([\w-]{20,128})$/);
  return m ? m[1] : null;
};

const durationOf = (file: File) => new Promise<number | undefined>(resolve => {
  const a = new Audio(); const url = URL.createObjectURL(file);
  const done = (v?: number) => { URL.revokeObjectURL(url); resolve(v && Number.isFinite(v) ? v : undefined); };
  a.preload = 'metadata'; a.onloadedmetadata = () => done(a.duration); a.onerror = () => done(); a.src = url;
});

const fmt = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—');

export default function AdminPublishForUser({ users, initialUser }: { users: UserProfile[]; initialUser?: UserProfile | null }) {
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('Other');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [tracks, setTracks] = useState<DraftTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ albumId: string; tracks: number } | null>(null);

  const coverPreview = useMemo(() => (cover ? URL.createObjectURL(cover) : ''), [cover]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  const pick = async (uid: string) => {
    setLookupError('');
    try {
      const t: Target = await authed(`/api/admin/publish-as/user/${encodeURIComponent(uid)}`);
      setTarget(t);
      setArtist(a => a || t.displayName);
    } catch (e: any) { setLookupError(e.message || 'Lookup failed'); }
  };
  useEffect(() => { if (initialUser?.uid) pick(initialUser.uid); }, [initialUser?.uid]);

  const q = search.trim().toLowerCase();
  const pastedUid = uidFromInput(search);
  const matches = q && !pastedUid
    ? users.filter(u => (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || u.uid === search.trim()).slice(0, 24)
    : [];

  const addAudio = async (files: FileList | null) => {
    const list = Array.from(files || []).filter(f => f.type.startsWith('audio/') || /\.(wav|mp3|flac|m4a|aac|ogg|aiff?)$/i.test(f.name));
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const drafts = list.map(file => ({ key: `${file.name}_${file.size}_${Math.random().toString(36).slice(2, 7)}`, file, title: titleFromFilename(file.name) }));
    setTracks(prev => [...prev, ...drafts]);
    for (const d of drafts) {
      const sec = await durationOf(d.file);
      setTracks(prev => prev.map(t => (t.key === d.key ? { ...t, durationSec: sec } : t)));
    }
  };
  const move = (i: number, dir: -1 | 1) => setTracks(prev => {
    const next = [...prev]; const j = i + dir; if (j < 0 || j >= next.length) return prev;
    [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  const ready = !!target && !!title.trim() && !!artist.trim() && !!cover && tracks.length > 0 && !busy;
  const totalMb = tracks.reduce((s, t) => s + t.file.size, 0) / 1048576;

  const publish = async () => {
    if (!ready || !target || !cover) return;
    if (!window.confirm(`Publish "${title.trim()}" (${tracks.length} tracks) on ${target.displayName}'s account?\n\nIt will appear as their release, credited to "${artist.trim()}". Your admin account will not be named on it.`)) return;
    setBusy(true); setError(''); setDone(null);
    try {
      const albumId = `album_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setProgress({ label: 'Uploading cover', pct: 0 });
      const img = await uploadImageWithDerivatives(`albums/${albumId}/cover_${Date.now().toString(36)}`, cover);
      const totalBytes = tracks.reduce((s, t) => s + t.file.size, 0) || 1;
      let doneBytes = 0;
      const uploaded = [];
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        const id = publishAsTrackId(albumId, i + 1);
        const url = await uploadFile(`albums/${albumId}/tracks/${id}_${t.file.name}`, t.file, p =>
          setProgress({ label: `Uploading ${i + 1}/${tracks.length}: ${t.title}`, pct: ((doneBytes + (p / 100) * t.file.size) / totalBytes) * 100 }));
        doneBytes += t.file.size;
        uploaded.push({ id, title: t.title.trim() || `Track ${i + 1}`, url, durationSec: t.durationSec });
      }
      setProgress({ label: `Publishing to ${target.displayName}'s account`, pct: 100 });
      const r = await authed('/api/admin/publish-as/album', {
        method: 'POST',
        body: JSON.stringify({
          targetUid: target.uid, albumId, title: title.trim(), artist: artist.trim(), genre, description: description.trim(),
          tags: tags.split(',').map(s => s.trim()).filter(Boolean),
          cover: { display: img.display, thumb: img.thumb, original: img.original }, tracks: uploaded,
        }),
      });
      setDone({ albumId: r.albumId, tracks: r.tracks });
      setTracks([]); setCover(null); setTitle(''); setDescription(''); setTags('');
    } catch (e: any) {
      setError(e?.message || 'Publish failed');
    } finally { setBusy(false); setProgress(null); }
  };

  const field = 'w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-white/30 transition-all';
  const label = 'text-[10px] font-black uppercase tracking-widest text-white/40';

  return (
    <div className="space-y-10 max-w-5xl">
      <header className="space-y-2">
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-white italic">Publish for User</h1>
        <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Upload an artist's work and publish it on their account, as theirs</p>
      </header>

      {/* 1. Who this is for */}
      <section className="space-y-4">
        <p className={label}>1 · Artist account</p>
        {target ? (
          <div className="flex items-center gap-5 p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl">
            <img src={target.photoURL || undefined} alt="" className="w-14 h-14 rounded-2xl object-cover bg-white/10" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><UserCheck size={16} className="text-emerald-400" /><h3 className="font-black uppercase tracking-wide truncate">{target.displayName || '(no name)'}</h3></div>
              <p className="text-[11px] text-white/40 font-bold truncate">{target.username ? `@${target.username} · ` : ''}{target.uid}</p>
            </div>
            <a href={buildShareUrl('profile', target.uid)} target="_blank" rel="noreferrer" className="text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white flex items-center gap-1">Profile <ExternalLink size={12} /></a>
            {!busy && <button onClick={() => { setTarget(null); setArtist(''); setDone(null); }} className="p-2 text-white/40 hover:text-white" aria-label="Change artist"><X size={18} /></button>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email, or paste their profile link"
                className="w-full bg-white/5 border border-white/10 rounded-[2rem] py-4 pl-14 pr-6 text-base font-bold outline-none focus:border-white/30" />
            </div>
            {pastedUid && <button onClick={() => pick(pastedUid)} className="px-5 py-3 bg-white text-black rounded-2xl text-[11px] font-black uppercase tracking-widest">Use account {pastedUid}</button>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {matches.map(u => (
                <button key={u.uid} onClick={() => pick(u.uid)} className="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 text-left">
                  <img src={u.photoURL || undefined} alt="" className="w-10 h-10 rounded-xl object-cover bg-white/10" />
                  <div className="min-w-0"><h4 className="font-black uppercase tracking-wider text-xs truncate">{u.displayName}</h4><p className="text-[10px] text-white/30 truncate">{u.uid}</p></div>
                </button>
              ))}
            </div>
            {lookupError && <p className="text-red-400 text-xs font-bold">{lookupError}</p>}
          </div>
        )}
      </section>

      {target && (
        <>
          {/* 2. Release details */}
          <section className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
            <label className="block cursor-pointer">
              <p className={`${label} mb-3`}>2 · Cover art</p>
              <div className="aspect-square rounded-3xl border border-dashed border-white/20 bg-white/5 overflow-hidden flex items-center justify-center hover:border-white/40">
                {coverPreview ? <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" /> : <div className="text-center text-white/30"><ImageIcon className="mx-auto mb-2" /><span className="text-[10px] font-black uppercase tracking-widest">Choose image</span></div>}
              </div>
              <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={e => setCover(e.target.files?.[0] || null)} />
            </label>
            <div className="space-y-4">
              <p className={label}>Release details</p>
              <input className={field} placeholder="Album title" value={title} onChange={e => setTitle(e.target.value)} disabled={busy} />
              <div className="grid grid-cols-2 gap-4">
                <input className={field} placeholder="Artist name (credit)" value={artist} onChange={e => setArtist(e.target.value)} disabled={busy} />
                <select className={field} value={genre} onChange={e => setGenre(e.target.value)} disabled={busy}>
                  {GENRES.map(g => <option key={g} value={g} className="bg-black">{g}</option>)}
                </select>
              </div>
              <textarea className={`${field} min-h-[90px]`} placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} disabled={busy} />
              <input className={field} placeholder="Tags, comma separated (optional)" value={tags} onChange={e => setTags(e.target.value)} disabled={busy} />
            </div>
          </section>

          {/* 3. Tracks */}
          <section className="space-y-4">
            <div className="flex items-end justify-between">
              <p className={label}>3 · Tracks {tracks.length ? `· ${tracks.length} · ${totalMb.toFixed(0)} MB` : ''}</p>
              <label className="px-5 py-3 bg-white/10 hover:bg-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-2">
                <Music size={14} /> Add audio files
                <input type="file" accept="audio/*,.wav,.flac,.aif,.aiff" multiple className="hidden" disabled={busy} onChange={e => { addAudio(e.target.files); e.target.value = ''; }} />
              </label>
            </div>
            {tracks.length === 0 ? (
              <p className="text-white/30 text-xs font-bold p-6 border border-dashed border-white/10 rounded-3xl text-center">Add the album's audio files. They're ordered by file name; titles are editable.</p>
            ) : (
              <ol className="space-y-2">
                {tracks.map((t, i) => (
                  <li key={t.key} className="flex items-center gap-3 p-3 bg-white/5 border border-white/5 rounded-2xl">
                    <span className="w-8 text-center text-white/40 text-xs font-black">{i + 1}</span>
                    <input className="flex-1 min-w-0 bg-transparent border-b border-white/10 focus:border-white/40 outline-none text-sm font-bold py-1" value={t.title} disabled={busy}
                      onChange={e => setTracks(prev => prev.map(x => (x.key === t.key ? { ...x, title: e.target.value } : x)))} />
                    <span className="hidden md:block w-56 truncate text-[10px] text-white/30" title={t.file.name}>{t.file.name}</span>
                    <span className="w-12 text-right text-xs text-white/50 tabular-nums">{fmt(t.durationSec)}</span>
                    <button onClick={() => move(i, -1)} disabled={busy || i === 0} className="p-1 text-white/40 hover:text-white disabled:opacity-20" aria-label="Move up"><ArrowUp size={14} /></button>
                    <button onClick={() => move(i, 1)} disabled={busy || i === tracks.length - 1} className="p-1 text-white/40 hover:text-white disabled:opacity-20" aria-label="Move down"><ArrowDown size={14} /></button>
                    <button onClick={() => setTracks(prev => prev.filter(x => x.key !== t.key))} disabled={busy} className="p-1 text-white/40 hover:text-red-400 disabled:opacity-20" aria-label="Remove"><Trash2 size={14} /></button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* 4. Publish */}
          <section className="space-y-4">
            {progress && (
              <div className="space-y-2">
                <div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-white transition-all" style={{ width: `${Math.min(100, progress.pct)}%` }} /></div>
                <p className="text-[11px] text-white/60 font-bold">{progress.label} · {Math.round(progress.pct)}%</p>
              </div>
            )}
            {error && <p className="text-red-400 text-sm font-bold">{error}</p>}
            {done && (
              <div className="flex items-center gap-4 p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl">
                <CheckCircle2 className="text-emerald-400" />
                <p className="flex-1 text-sm font-bold">Published {done.tracks} tracks on {target.displayName}'s account. Streaming versions are being prepared in the background.</p>
                <a href={buildShareUrl('album', done.albumId)} target="_blank" rel="noreferrer" className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-emerald-300 hover:text-white">Open album <ExternalLink size={12} /></a>
              </div>
            )}
            <button onClick={publish} disabled={!ready}
              className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-white text-black rounded-[2rem] text-[12px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/90">
              {busy ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
              {busy ? 'Publishing…' : `Publish on ${target.displayName || 'their'}'s account`}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
