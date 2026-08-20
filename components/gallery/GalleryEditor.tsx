import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Save, X, Star, ChevronUp, ChevronDown, Mic, Square, Play, Pause,
  Trash2, Boxes, Grid3x3, LayoutTemplate, Music2, Globe, Link2, Lock, Check, Loader2, Plus,
} from 'lucide-react';
import { PhotoGallery, Photo, Album, Track } from '../../types';
import { auth, fetchUserPhotos, fetchUserAlbums } from '../../services/backendService';
import {
  createGallery, updateGallery, fetchGallery,
  uploadGalleryAudioNote, uploadGalleryModel,
} from '../../services/galleryService';

/**
 * PLAJAH GALLERY — creation / edit editor (Phase 2).
 *
 * Create a NEW gallery (no galleryId) or edit an existing one. Sections:
 *   • Photos     — pick from the user's library (multi-select), reorder the selection
 *                  (drag or ▲▼), choose a cover.
 *   • Details    — title / curator / tagline / description.
 *   • View type  — Modern · Walk-in (3D) · Portfolio.
 *   • Soundtrack — a background track from the user's Chora albums (or None).
 *   • Voice notes — per selected photo, a ≤30s MediaRecorder note (auto-stops at 30s),
 *                   uploaded and stored on the GALLERY (audioNotes[photoId]) so the
 *                   Walk-in museum's proximity audio plays it without touching the Photo.
 *   • 3D models  — GLB/GLTF uploads that hang on plinths in the Walk-in museum.
 *   • Visibility — Public / Unlisted / Private.
 *
 * Heavy work is lazy: this whole module is imported on demand by App/PhotoManager.
 */

interface GalleryEditorProps {
  galleryId?: string;
  onDone: (gallery: PhotoGallery) => void;
  onCancel: () => void;
  /** Default curator name for a fresh gallery (usually the profile display name). */
  curatorNameDefault?: string;
}

type ViewType = 'MODERN' | 'WALK' | 'PORTFOLIO';
type Visibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

const MAX_NOTE_SECONDS = 30;

const GalleryEditor: React.FC<GalleryEditorProps> = ({ galleryId, onDone, onCancel, curatorNameDefault }) => {
  const uid = auth.currentUser?.uid || '';
  // A stable id chosen up-front so audio/model uploads land under the doc id we'll save.
  const stableId = useRef(galleryId || `gallery_${Date.now()}`).current;
  const existingRef = useRef<PhotoGallery | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // library + selection
  const [library, setLibrary] = useState<Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<string>('');

  // details
  const [title, setTitle] = useState('');
  const [curatorName, setCuratorName] = useState(curatorNameDefault || auth.currentUser?.displayName || '');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');

  // presentation
  const [viewType, setViewType] = useState<ViewType>('MODERN');
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC');

  // soundtrack
  const [albums, setAlbums] = useState<Album[]>([]);
  const [soundtrackAlbumId, setSoundtrackAlbumId] = useState('');
  const [soundtrackTrackId, setSoundtrackTrackId] = useState('');

  // gallery-scoped media
  const [audioNotes, setAudioNotes] = useState<Record<string, string>>({});
  const [noteBusy, setNoteBusy] = useState<Record<string, boolean>>({});
  const [models3d, setModels3d] = useState<{ url: string; title?: string }[]>([]);
  const [modelUploading, setModelUploading] = useState(false);
  const modelInputRef = useRef<HTMLInputElement>(null);

  // ── load library, albums, and (when editing) the gallery ──────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const [photos, albs] = await Promise.all([
        uid ? fetchUserPhotos(uid) : Promise.resolve([] as Photo[]),
        uid ? fetchUserAlbums(uid) : Promise.resolve([] as Album[]),
      ]);
      if (!alive) return;
      setLibrary(photos);
      setAlbums(albs);
      if (galleryId) {
        const g = await fetchGallery(galleryId);
        if (alive && g) {
          existingRef.current = g;
          setTitle(g.title || '');
          setCuratorName(g.curatorName || curatorNameDefault || auth.currentUser?.displayName || '');
          setTagline(g.tagline || '');
          setDescription(g.description || '');
          setViewType((g.viewType as ViewType) || 'MODERN');
          setVisibility((g.visibility as Visibility) || (g.isPublic ? 'PUBLIC' : 'PRIVATE'));
          setSelectedIds((g.order?.length ? g.order : g.photoIds) || []);
          setCoverImage(g.coverImage || '');
          setSoundtrackAlbumId(g.soundtrackAlbumId || '');
          setSoundtrackTrackId(g.soundtrackTrackId || '');
          setAudioNotes(g.audioNotes || {});
          setModels3d(g.models3d || []);
        }
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, uid]);

  const byId = useMemo(() => new Map(library.map(p => [p.id, p])), [library]);
  const selectedPhotos = useMemo(
    () => selectedIds.map(id => byId.get(id)).filter(Boolean) as Photo[],
    [selectedIds, byId],
  );
  const coverUrl = coverImage || selectedPhotos[0]?.url || '';

  // ── selection + ordering ──────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelectedIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));

  const removeSelected = (id: string) => {
    setSelectedIds(ids => ids.filter(x => x !== id));
    const p = byId.get(id);
    if (p && coverImage && p.url === coverImage) setCoverImage('');
    setAudioNotes(n => { const { [id]: _drop, ...rest } = n; return rest; });
  };

  const move = (from: number, to: number) =>
    setSelectedIds(ids => {
      if (to < 0 || to >= ids.length) return ids;
      const next = [...ids];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });

  const dragIndex = useRef<number | null>(null);
  const onDrop = (to: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from == null || from === to) return;
    move(from, to);
  };

  // ── per-photo voice note upload (called by the recorder on stop) ───────────────
  const saveNote = async (photoId: string, blob: Blob) => {
    if (!uid) return;
    setNoteBusy(b => ({ ...b, [photoId]: true }));
    const url = await uploadGalleryAudioNote(uid, stableId, photoId, blob);
    if (url) setAudioNotes(n => ({ ...n, [photoId]: url }));
    setNoteBusy(b => { const { [photoId]: _d, ...rest } = b; return rest; });
  };
  const deleteNote = (photoId: string) =>
    setAudioNotes(n => { const { [photoId]: _d, ...rest } = n; return rest; });

  // ── 3D model upload ────────────────────────────────────────────────────────────
  const onModelFiles = async (files: FileList | null) => {
    if (!files || !files.length || !uid) return;
    setModelUploading(true);
    for (const file of Array.from(files)) {
      const url = await uploadGalleryModel(uid, file);
      if (url) setModels3d(m => [...m, { url, title: file.name.replace(/\.(glb|gltf)$/i, '') }]);
    }
    setModelUploading(false);
    if (modelInputRef.current) modelInputRef.current.value = '';
  };

  // ── save ────────────────────────────────────────────────────────────────────────
  const onSave = async () => {
    if (!uid) { setError('Sign in to save a gallery.'); return; }
    setSaving(true);
    setError('');
    const patch: Partial<PhotoGallery> = {
      id: stableId,
      title: title.trim() || 'Untitled Gallery',
      description: description.trim(),
      curatorName: curatorName.trim(),
      tagline: tagline.trim(),
      photoIds: selectedIds,
      order: selectedIds,
      viewType,
      coverImage: coverUrl,
      visibility,
      isPublic: visibility === 'PUBLIC',
      soundtrackAlbumId: soundtrackAlbumId || '',
      soundtrackTrackId: soundtrackTrackId || '',
      models3d,
      audioNotes,
    };
    try {
      if (galleryId) {
        await updateGallery(galleryId, patch);
        const merged = { ...(existingRef.current || {}), ...patch } as PhotoGallery;
        onDone(merged);
      } else {
        const g = await createGallery(patch);
        if (g) onDone(g);
        else setError('Could not save the gallery. Try again.');
      }
    } catch (e) {
      console.error('[GalleryEditor] save failed', e);
      setError('Could not save the gallery. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const soundtrackAlbum = albums.find(a => a.id === soundtrackAlbumId);

  return (
    <div style={S.root}>
      <style>{css}</style>

      {/* top bar */}
      <div className="pjge-top">
        <button className="pjge-back" onClick={onCancel}><ArrowLeft size={16} /> Cancel</button>
        <span className="pjge-kick">Plajah · Gallery {galleryId ? 'Editor' : 'Studio'}</span>
        <button className="pjge-save" onClick={onSave} disabled={saving || loading}>
          {saving ? <Loader2 size={15} className="pjge-spin" /> : <Save size={15} />}
          {galleryId ? 'Save changes' : 'Create gallery'}
        </button>
      </div>

      {loading ? (
        <div className="pjge-loading"><Loader2 size={18} className="pjge-spin" /> Loading your library…</div>
      ) : (
        <div className="pjge-frame">
          {error && <div className="pjge-error">{error}</div>}

          {/* ── PHOTOS ─────────────────────────────────────────── */}
          <section className="pjge-sec">
            <h3 className="pjge-h">Photos <span>{selectedIds.length} selected</span></h3>

            {/* selected, reorderable strip */}
            {selectedPhotos.length > 0 && (
              <div className="pjge-strip">
                {selectedPhotos.map((p, i) => {
                  const isCover = (coverImage || selectedPhotos[0]?.url) === p.url;
                  return (
                    <div
                      key={p.id}
                      className="pjge-chip"
                      draggable
                      onDragStart={() => { dragIndex.current = i; }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => onDrop(i)}
                    >
                      <div className="pjge-chip-img" style={{ backgroundImage: `url(${p.thumbUrl || p.url})` }}>
                        {isCover && <span className="pjge-cover-badge"><Star size={10} fill="#fff" /> Cover</span>}
                        <span className="pjge-chip-n">{i + 1}</span>
                      </div>
                      <div className="pjge-chip-ctl">
                        <button title="Move up" onClick={() => move(i, i - 1)} disabled={i === 0}><ChevronUp size={13} /></button>
                        <button title="Move down" onClick={() => move(i, i + 1)} disabled={i === selectedPhotos.length - 1}><ChevronDown size={13} /></button>
                        <button title="Set as cover" className={isCover ? 'on' : ''} onClick={() => setCoverImage(p.url)}><Star size={13} /></button>
                        <button title="Remove" onClick={() => removeSelected(p.id)}><X size={13} /></button>
                      </div>
                      {/* per-photo voice note */}
                      <AudioNoteRecorder
                        photoId={p.id}
                        existingUrl={audioNotes[p.id]}
                        uploading={!!noteBusy[p.id]}
                        onRecorded={blob => saveNote(p.id, blob)}
                        onDelete={() => deleteNote(p.id)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* library picker */}
            <div className="pjge-lib">
              {library.length === 0 && <div className="pjge-empty">No photos in your library yet. Upload some in the Photo Archive first.</div>}
              {library.map(p => {
                const on = selectedIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    className={`pjge-tile ${on ? 'on' : ''}`}
                    style={{ backgroundImage: `url(${p.thumbUrl || p.url})` }}
                    onClick={() => toggleSelect(p.id)}
                    title={p.title || 'Untitled'}
                  >
                    {on && <span className="pjge-tick"><Check size={13} /></span>}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── DETAILS ─────────────────────────────────────────── */}
          <section className="pjge-sec">
            <h3 className="pjge-h">Details</h3>
            <div className="pjge-grid2">
              <label className="pjge-field">
                <span>Title</span>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Untitled Gallery" />
              </label>
              <label className="pjge-field">
                <span>Curator</span>
                <input value={curatorName} onChange={e => setCuratorName(e.target.value)} placeholder="Your name" />
              </label>
            </div>
            <label className="pjge-field">
              <span>Tagline</span>
              <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="A short one-line kicker" />
            </label>
            <label className="pjge-field">
              <span>Description</span>
              <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell visitors about this collection…" />
            </label>
          </section>

          {/* ── VIEW TYPE ───────────────────────────────────────── */}
          <section className="pjge-sec">
            <h3 className="pjge-h">Opening view</h3>
            <div className="pjge-seg">
              <button className={viewType === 'MODERN' ? 'on' : ''} onClick={() => setViewType('MODERN')}><Grid3x3 size={14} /> Modern</button>
              <button className={viewType === 'WALK' ? 'on' : ''} onClick={() => setViewType('WALK')}><Boxes size={14} /> Walk-in (3D)</button>
              <button className={viewType === 'PORTFOLIO' ? 'on' : ''} onClick={() => setViewType('PORTFOLIO')}><LayoutTemplate size={14} /> Portfolio</button>
            </div>
          </section>

          {/* ── SOUNDTRACK ──────────────────────────────────────── */}
          <section className="pjge-sec">
            <h3 className="pjge-h"><Music2 size={14} style={{ verticalAlign: -2 }} /> Soundtrack <span>optional · plays quietly</span></h3>
            <div className="pjge-grid2">
              <label className="pjge-field">
                <span>Album</span>
                <select
                  value={soundtrackAlbumId}
                  onChange={e => { setSoundtrackAlbumId(e.target.value); setSoundtrackTrackId(''); }}
                >
                  <option value="">None</option>
                  {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </label>
              {soundtrackAlbum && (
                <label className="pjge-field">
                  <span>Track</span>
                  <select value={soundtrackTrackId} onChange={e => setSoundtrackTrackId(e.target.value)}>
                    <option value="">First track (auto)</option>
                    {(soundtrackAlbum.tracks || []).map((t: Track) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </label>
              )}
            </div>
          </section>

          {/* ── 3D MODELS ───────────────────────────────────────── */}
          <section className="pjge-sec">
            <h3 className="pjge-h"><Boxes size={14} style={{ verticalAlign: -2 }} /> 3D pieces <span>GLB / GLTF · shown on plinths in Walk-in</span></h3>
            {models3d.length > 0 && (
              <div className="pjge-models">
                {models3d.map((m, i) => (
                  <div className="pjge-model" key={i}>
                    <Boxes size={14} />
                    <span className="pjge-model-t">{m.title || `Model ${i + 1}`}</span>
                    <button title="Remove" onClick={() => setModels3d(ms => ms.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            <input ref={modelInputRef} type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" multiple hidden onChange={e => onModelFiles(e.target.files)} />
            <button className="pjge-add" onClick={() => modelInputRef.current?.click()} disabled={modelUploading}>
              {modelUploading ? <Loader2 size={14} className="pjge-spin" /> : <Plus size={14} />} Add 3D model
            </button>
          </section>

          {/* ── VISIBILITY ──────────────────────────────────────── */}
          <section className="pjge-sec">
            <h3 className="pjge-h">Visibility</h3>
            <div className="pjge-seg">
              <button className={visibility === 'PUBLIC' ? 'on' : ''} onClick={() => setVisibility('PUBLIC')}><Globe size={14} /> Public</button>
              <button className={visibility === 'UNLISTED' ? 'on' : ''} onClick={() => setVisibility('UNLISTED')}><Link2 size={14} /> Unlisted</button>
              <button className={visibility === 'PRIVATE' ? 'on' : ''} onClick={() => setVisibility('PRIVATE')}><Lock size={14} /> Private</button>
            </div>
          </section>

          {/* footer save */}
          <div className="pjge-footer">
            <button className="pjge-cancel" onClick={onCancel}>Cancel</button>
            <button className="pjge-save wide" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 size={15} className="pjge-spin" /> : <Save size={15} />}
              {galleryId ? 'Save changes' : 'Create gallery'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── per-photo ≤30s voice-note recorder (MediaRecorder) ──────────────────────────
// Record / Stop / Re-record / Play / Delete. Auto-stops at 30s with a live countdown.
// The parent owns upload (onRecorded) + persistence; this only captures the blob.
const AudioNoteRecorder: React.FC<{
  photoId: string;
  existingUrl?: string;
  uploading?: boolean;
  onRecorded: (blob: Blob) => void;
  onDelete: () => void;
}> = ({ existingUrl, uploading, onRecorded, onDelete }) => {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [localUrl, setLocalUrl] = useState('');
  const [denied, setDenied] = useState(false);
  const [playing, setPlaying] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playUrl = localUrl || existingUrl || '';
  const hasNote = !!playUrl;

  const cleanupStream = () => {
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* non-fatal */ }
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => () => {
    cleanupStream();
    if (localUrl) URL.revokeObjectURL(localUrl);
    try { audioRef.current?.pause(); } catch { /* non-fatal */ }
  }, [localUrl]);

  const stop = () => {
    try { recRef.current?.state !== 'inactive' && recRef.current?.stop(); } catch { /* non-fatal */ }
  };

  const start = async () => {
    setDenied(false);
    if (localUrl) { URL.revokeObjectURL(localUrl); setLocalUrl(''); }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find(t => (window as any).MediaRecorder?.isTypeSupported?.(t)) || '';
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        cleanupStream();
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size) {
          const u = URL.createObjectURL(blob);
          setLocalUrl(u);
          onRecorded(blob);
        }
      };
      rec.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed(s => {
          const next = s + 1;
          if (next >= MAX_NOTE_SECONDS) stop();   // hard 30s cap
          return next;
        });
      }, 1000);
    } catch {
      setDenied(true);
      cleanupStream();
    }
  };

  const togglePlay = () => {
    if (!playUrl) return;
    let a = audioRef.current;
    if (!a) { a = new Audio(playUrl); audioRef.current = a; a.onended = () => setPlaying(false); }
    else if (a.src !== playUrl) { a.src = playUrl; }
    if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
    else { a.pause(); setPlaying(false); }
  };

  const remaining = MAX_NOTE_SECONDS - elapsed;

  return (
    <div className="pjge-note">
      {recording ? (
        <button className="pjge-note-btn rec" onClick={stop} title="Stop">
          <Square size={12} /> {remaining}s
        </button>
      ) : (
        <button className="pjge-note-btn" onClick={start} title={hasNote ? 'Re-record' : 'Record voice note'}>
          <Mic size={12} /> {hasNote ? 'Re-record' : uploading ? '' : 'Note'}
        </button>
      )}
      {uploading && <Loader2 size={12} className="pjge-spin" />}
      {hasNote && !recording && !uploading && (
        <>
          <button className="pjge-note-ic" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button className="pjge-note-ic" onClick={() => { onDelete(); if (localUrl) { URL.revokeObjectURL(localUrl); setLocalUrl(''); } }} title="Delete note">
            <Trash2 size={12} />
          </button>
        </>
      )}
      {denied && <span className="pjge-note-deny">Mic blocked</span>}
    </div>
  );
};

// ── styles (album-like dark surface + --pj-* tokens, mirroring GalleryView) ──────
const S: Record<string, React.CSSProperties> = {
  root: { minHeight: '100%', background: 'var(--pj-bg,#050409)', color: 'var(--text-primary,#F6F1FB)', paddingBottom: 60 },
};

const css = `
  .pjge-top{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:12px;padding:12px 20px;max-width:1160px;margin:0 auto;background:linear-gradient(180deg,var(--pj-bg,#050409),transparent)}
  .pjge-back{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid var(--pj-border,rgba(255,255,255,.14));color:inherit;border-radius:9999px;height:34px;padding:0 14px;font-weight:700;font-size:.78rem;cursor:pointer}
  .pjge-kick{font-size:.62rem;font-weight:800;letter-spacing:.28em;text-transform:uppercase;color:var(--pj-faint,#6E6480)}
  .pjge-save{margin-left:auto;display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 18px;border-radius:9999px;font-weight:800;font-size:.78rem;border:1px solid transparent;color:#fff;cursor:pointer;background:var(--pj-grad-warm,linear-gradient(135deg,#6B0099,#D40055,#FF8C00))}
  .pjge-save:disabled{opacity:.55;cursor:default}
  .pjge-save.wide{height:42px;padding:0 26px;font-size:.85rem}
  .pjge-loading{max-width:1160px;margin:60px auto;display:flex;gap:10px;align-items:center;justify-content:center;color:var(--pj-faint,#6E6480);font-size:.85rem}
  .pjge-frame{max-width:1160px;margin:0 auto;padding:0 20px;display:flex;flex-direction:column;gap:14px}
  .pjge-error{background:rgba(212,0,85,.14);border:1px solid var(--pj-magenta,#D40055);color:#ffd7e5;border-radius:12px;padding:10px 14px;font-size:.8rem;font-weight:700}
  .pjge-sec{border:1px solid var(--pj-border,rgba(255,255,255,.08));border-radius:18px;background:var(--pj-bg2,#0A0810);padding:16px 18px}
  .pjge-h{font-style:italic;font-weight:900;font-size:1.02rem;margin:0 0 12px;display:flex;align-items:center;gap:8px}
  .pjge-h span{font-style:normal;font-weight:700;font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;color:var(--pj-faint,#6E6480)}
  .pjge-empty{color:var(--pj-faint,#6E6480);font-size:.82rem;padding:10px 0}

  .pjge-strip{display:flex;gap:12px;overflow-x:auto;padding:4px 2px 12px;margin-bottom:8px}
  .pjge-chip{flex:none;width:132px;display:flex;flex-direction:column;gap:6px}
  .pjge-chip-img{position:relative;width:132px;height:100px;border-radius:12px;background-size:cover;background-position:center;background-color:#161320;border:1px solid var(--pj-border-strong,rgba(255,255,255,.14));cursor:grab}
  .pjge-chip-n{position:absolute;top:6px;left:6px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:rgba(0,0,0,.6);color:#fff;font-size:.62rem;font-weight:800;display:grid;place-items:center}
  .pjge-cover-badge{position:absolute;bottom:6px;left:6px;display:inline-flex;align-items:center;gap:3px;background:var(--pj-grad-brand,linear-gradient(135deg,#6B0099,#D40055));color:#fff;font-size:.56rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:3px 6px;border-radius:8px}
  .pjge-chip-ctl{display:flex;gap:4px}
  .pjge-chip-ctl button{flex:1;height:26px;display:grid;place-items:center;background:var(--pj-glass-1,rgba(255,255,255,.045));border:1px solid var(--pj-border,rgba(255,255,255,.08));border-radius:8px;color:var(--pj-muted,#A398B4);cursor:pointer}
  .pjge-chip-ctl button.on{color:#fff;background:var(--pj-grad-brand,linear-gradient(135deg,#6B0099,#D40055));border-color:transparent}
  .pjge-chip-ctl button:disabled{opacity:.35;cursor:default}

  .pjge-note{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
  .pjge-note-btn{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 9px;border-radius:8px;font-size:.64rem;font-weight:800;border:1px solid var(--pj-border-strong,rgba(255,255,255,.14));background:var(--pj-glass-1,rgba(255,255,255,.045));color:var(--pj-muted,#A398B4);cursor:pointer}
  .pjge-note-btn.rec{background:var(--pj-magenta,#D40055);border-color:transparent;color:#fff;animation:pjge-pulse 1s infinite}
  .pjge-note-ic{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;border:1px solid var(--pj-border,rgba(255,255,255,.08));background:var(--pj-glass-1,rgba(255,255,255,.045));color:var(--pj-muted,#A398B4);cursor:pointer}
  .pjge-note-deny{font-size:.58rem;color:var(--pj-magenta,#D40055);font-weight:700}
  @keyframes pjge-pulse{50%{opacity:.55}}

  .pjge-lib{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px;max-height:280px;overflow-y:auto;padding:2px}
  .pjge-tile{position:relative;aspect-ratio:1;border-radius:10px;background-size:cover;background-position:center;background-color:#161320;border:1px solid var(--pj-border,rgba(255,255,255,.08));cursor:pointer;padding:0}
  .pjge-tile.on{outline:2px solid var(--pj-cyan,#00DAF3);outline-offset:1px}
  .pjge-tick{position:absolute;top:5px;right:5px;width:20px;height:20px;border-radius:50%;background:var(--pj-cyan,#00DAF3);color:#04121a;display:grid;place-items:center}

  .pjge-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media(max-width:640px){.pjge-grid2{grid-template-columns:1fr}}
  .pjge-field{display:flex;flex-direction:column;gap:5px;margin-bottom:10px}
  .pjge-field span{font-size:.62rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--pj-faint,#6E6480)}
  .pjge-field input,.pjge-field textarea,.pjge-field select{background:var(--pj-glass-1,rgba(255,255,255,.045));border:1px solid var(--pj-border-strong,rgba(255,255,255,.14));border-radius:11px;padding:10px 13px;color:var(--text-primary,#F6F1FB);font-size:.85rem;outline:none;font-family:inherit}
  .pjge-field input:focus,.pjge-field textarea:focus,.pjge-field select:focus{border-color:var(--pj-cyan,#00DAF3)}
  .pjge-field textarea{resize:vertical}
  .pjge-field select option{background:#0A0810;color:#F6F1FB}

  .pjge-seg{display:inline-flex;gap:5px;background:rgba(0,0,0,.25);border:1px solid var(--pj-border,rgba(255,255,255,.08));border-radius:9999px;padding:4px;flex-wrap:wrap}
  .pjge-seg button{border:0;background:transparent;color:var(--pj-muted,#A398B4);font-weight:800;font-size:.74rem;padding:8px 16px;border-radius:9999px;cursor:pointer;display:inline-flex;gap:7px;align-items:center}
  .pjge-seg button.on{color:#fff;background:var(--pj-grad-brand,linear-gradient(135deg,#6B0099,#D40055))}

  .pjge-models{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
  .pjge-model{display:flex;align-items:center;gap:9px;background:var(--pj-glass-1,rgba(255,255,255,.045));border:1px solid var(--pj-border,rgba(255,255,255,.08));border-radius:11px;padding:9px 12px;color:var(--pj-muted,#A398B4)}
  .pjge-model-t{flex:1;font-size:.8rem;font-weight:700;color:var(--text-primary,#F6F1FB);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pjge-model button{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;border:1px solid var(--pj-border,rgba(255,255,255,.08));background:transparent;color:var(--pj-muted,#A398B4);cursor:pointer}
  .pjge-add{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 16px;border-radius:11px;font-weight:800;font-size:.78rem;border:1px dashed var(--pj-border-strong,rgba(255,255,255,.2));background:transparent;color:var(--text-primary,#F6F1FB);cursor:pointer}
  .pjge-add:disabled{opacity:.55;cursor:default}

  .pjge-footer{display:flex;gap:10px;justify-content:flex-end;align-items:center;padding:8px 0 4px}
  .pjge-cancel{height:42px;padding:0 22px;border-radius:9999px;font-weight:800;font-size:.82rem;background:transparent;border:1px solid var(--pj-border-strong,rgba(255,255,255,.14));color:inherit;cursor:pointer}
  .pjge-spin{animation:pjge-rot 1s linear infinite}
  @keyframes pjge-rot{to{transform:rotate(360deg)}}
`;

export default GalleryEditor;
