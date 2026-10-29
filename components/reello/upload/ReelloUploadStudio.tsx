// Reello Upload Studio — the YouTube-Studio-shaped uploader.
//
//   Upload     drop / pick up to 5 videos; each starts uploading at once (as a private draft) while
//              its details are filled in — title, description, thumbnail (three auto stills or your
//              own), tags, category, visibility, Story Intelligence — then Publish. More than 5, or a
//              dropped folder → a background folder batch.
//   Folders    watch folders (auto-upload whatever lands in them, with a template) and batches.
//   Templates  upload templates + the default visibility for batch and automatic uploads.
//   Drafts     what Story Intelligence made from each upload, waiting for approval.
//
// Uploads run in services/reello/uploadQueue (app-wide), so closing this keeps them going.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, UploadCloud, FolderPlus, FolderSync, Folder, Film, Check, Loader2, AlertCircle, Trash2, Plus, Globe, Lock,
  Image as ImageIcon, Sparkles, RefreshCw, Pause, Play, Settings2, Inbox, ChevronRight,
} from 'lucide-react';
import { auth } from '../../../services/firebase';
import {
  MAX_DIRECT_FILES, DEFAULT_PREFS, applyTemplate, isVideoFile, newTemplate,
  type ReelloUploadPrefs, type UploadTemplate, type UploadVisibility,
} from '../../../services/reello/uploadPrefs';
import { loadPrefs, savePrefs } from '../../../services/reello/reelloApi';
import {
  enqueueUpload, subscribeQueue, updateDetails, commitUpload, retryUpload, cancelUpload, clearFinished,
  type QueueItem,
} from '../../../services/reello/uploadQueue';
import {
  addFolder, listFolders, removeFolder, updateFolder, reconnectFolder, folderPickerSupported, type ReelloFolder,
} from '../../../services/reello/watchFolders';
import { tick, refreshRunnerPrefs, subscribeRunner, startFolderRunner } from '../../../services/reello/folderRunner';
import { grabStills } from '../../../services/reello/grabStills';
import IntelOptionsEditor from './IntelOptionsEditor';
import ReelloIntelDrafts from './ReelloIntelDrafts';

type Tab = 'UPLOAD' | 'FOLDERS' | 'TEMPLATES' | 'DRAFTS';
const GENRES = ['General', 'Music', 'Vlog', 'Education', 'How-to', 'Comedy', 'Gaming', 'Faith', 'News', 'Sports', 'Food', 'Fashion', 'Business', 'Film & Animation'];

const fmtBytes = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`;
const accountName = () => auth.currentUser?.displayName || 'Your account';

const STATUS_TEXT: Record<QueueItem['status'], string> = {
  QUEUED: 'Waiting', UPLOADING: 'Uploading', AWAITING_DETAILS: 'Uploaded — ready to publish', PUBLISHING: 'Publishing',
  DONE: 'Published', ERROR: 'Failed', CANCELLED: 'Cancelled',
};

const VisibilityPicker: React.FC<{ value: UploadVisibility; onChange: (v: UploadVisibility) => void; name: string }> = ({ value, onChange, name }) => (
  <div className="grid grid-cols-2 gap-2">
    {(['PRIVATE', 'PUBLIC'] as const).map(v => (
      <label key={v} className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer ${value === v ? 'border-[#00B4D8]/60 bg-[#00B4D8]/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
        <input type="radio" name={name} className="sr-only" checked={value === v} onChange={() => onChange(v)} />
        {v === 'PUBLIC' ? <Globe size={16} className="mt-0.5 text-white/80" /> : <Lock size={16} className="mt-0.5 text-white/80" />}
        <span><span className="block text-sm font-semibold text-white">{v === 'PUBLIC' ? 'Public' : 'Private'}</span>
          <span className="block text-xs text-white/50">{v === 'PUBLIC' ? 'Everyone can watch it' : 'Only you can watch it'}</span></span>
      </label>
    ))}
  </div>
);

// ── Upload tab: one direct item's details ───────────────────────────────────

const DetailsEditor: React.FC<{ item: QueueItem; templates: UploadTemplate[] }> = ({ item, templates }) => {
  const d = item.details;
  const [stills, setStills] = useState<{ blob: Blob; url: string }[]>([]);
  const [framesRead, setFramesRead] = useState(false);
  const [custom, setCustom] = useState<{ blob: Blob; url: string } | null>(null);
  const [tagText, setTagText] = useState(d.tags.join(', '));
  const thumbInput = useRef<HTMLInputElement>(null);
  const set = (p: Partial<QueueItem['details']>) => updateDetails(item.id, p);

  useEffect(() => {
    let live = true; const urls: string[] = [];
    grabStills(item.file, 3).then(bs => {
      if (!live) return;
      const s = bs.map(b => { const url = URL.createObjectURL(b); urls.push(url); return { blob: b, url }; });
      setStills(s); setFramesRead(true);
      if (!item.details.thumbnail && s[0]) set({ thumbnail: s[0].blob });
    });
    setTagText(item.details.tags.join(', '));
    return () => { live = false; urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [item.id]);

  const fillFromTemplate = (id: string) => {
    const t = templates.find(x => x.id === id);
    if (!t) return;
    const a = applyTemplate(t, { fileName: item.file.name, account: accountName() }, { defaultVisibility: d.visibility });
    set({ title: a.title, description: a.description, tags: a.tags, genre: a.genre, visibility: a.visibility, storyIntel: a.storyIntel, intel: a.intel });
    setTagText(a.tags.join(', '));
  };

  const locked = item.status === 'DONE' || item.status === 'PUBLISHING' || item.committed;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-white">Details</h3>
        {templates.length > 0 && !locked && (
          <select defaultValue="" onChange={e => { fillFromTemplate(e.target.value); e.target.value = ''; }} className="bg-[#181820] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white">
            <option value="" disabled>Fill from a template…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
      <fieldset disabled={locked} className="space-y-5 disabled:opacity-70">
        <label className="block rounded-xl border border-white/10 focus-within:border-[#00B4D8] px-3 py-2">
          <span className="flex justify-between text-xs text-white/50"><span>Title (required)</span><span>{d.title.length}/100</span></span>
          <textarea rows={2} maxLength={100} value={d.title} onChange={e => set({ title: e.target.value })} placeholder="Add a title that describes your video" className="w-full bg-transparent text-white resize-none focus:outline-none" />
        </label>
        <label className="block rounded-xl border border-white/10 focus-within:border-[#00B4D8] px-3 py-2">
          <span className="flex justify-between text-xs text-white/50"><span>Description</span><span>{d.description.length}/5000</span></span>
          <textarea rows={5} maxLength={5000} value={d.description} onChange={e => set({ description: e.target.value })} placeholder="Tell viewers about your video. Links and prices here help Story Intelligence too." className="w-full bg-transparent text-white text-sm resize-y focus:outline-none" />
        </label>
        <div>
          <p className="text-sm font-semibold text-white">Thumbnail</p>
          <p className="text-xs text-white/50 mb-2">Pick a frame from the video, or upload your own.</p>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => thumbInput.current?.click()} className="w-32 h-[72px] rounded-lg border border-dashed border-white/20 text-white/60 text-xs grid place-items-center hover:border-white/40"><span className="flex flex-col items-center gap-1"><ImageIcon size={16} />Upload</span></button>
            <input ref={thumbInput} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { const c = { blob: f, url: URL.createObjectURL(f) }; setCustom(c); set({ thumbnail: f }); } }} />
            {custom && <button type="button" onClick={() => set({ thumbnail: custom.blob })} className={`w-32 h-[72px] rounded-lg overflow-hidden ring-2 ${d.thumbnail === custom.blob ? 'ring-[#00B4D8]' : 'ring-transparent'}`}><img src={custom.url} alt="" className="w-full h-full object-cover" /></button>}
            {stills.map((s, i) => <button key={i} type="button" onClick={() => set({ thumbnail: s.blob })} className={`w-32 h-[72px] rounded-lg overflow-hidden ring-2 ${d.thumbnail === s.blob ? 'ring-[#00B4D8]' : 'ring-transparent'}`}><img src={s.url} alt={`Frame ${i + 1}`} className="w-full h-full object-cover" /></button>)}
            {!stills.length && <div className="w-32 h-[72px] rounded-lg bg-white/5 grid place-items-center text-center px-2 text-[11px] text-white/40">{framesRead ? 'No preview frames for this format' : 'Reading frames…'}</div>}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-white/60">Tags</span>
            <input value={tagText} onChange={e => { setTagText(e.target.value); set({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 30) }); }} placeholder="comma, separated" className="mt-1 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-white/60">Category</span>
            <select value={d.genre} onChange={e => set({ genre: e.target.value })} className="mt-1 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
              {[...new Set([d.genre, ...GENRES])].map(g => <option key={g}>{g}</option>)}
            </select>
          </label>
        </div>
        <IntelOptionsEditor enabled={d.storyIntel} onEnabled={v => set({ storyIntel: v })} value={d.intel} onChange={v => set({ intel: v })} accountName={accountName()} videoTitle={d.title} />
        <div>
          <p className="text-sm font-semibold text-white mb-2">Visibility</p>
          <VisibilityPicker name={`vis-${item.id}`} value={d.visibility} onChange={v => set({ visibility: v })} />
        </div>
      </fieldset>
    </div>
  );
};

const QueueRow: React.FC<{ it: QueueItem; active?: boolean; onClick?: () => void }> = ({ it, active, onClick }) => (
  <button type="button" onClick={onClick} className={`w-full text-left flex items-center gap-3 p-2.5 rounded-xl ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}>
    <div className="w-12 h-8 rounded bg-black/60 grid place-items-center shrink-0"><Film size={14} className="text-white/40" /></div>
    <div className="min-w-0 flex-1">
      <p className="text-sm text-white truncate">{it.details.title || it.file.name}</p>
      <div className="flex items-center gap-2 text-[11px] text-white/50">
        <span className={it.status === 'ERROR' ? 'text-red-300' : it.status === 'DONE' ? 'text-emerald-300' : ''}>{STATUS_TEXT[it.status]}{it.status === 'UPLOADING' ? ` ${it.progress}%` : ''}</span>
        {it.status === 'DONE' && <span>· {it.details.visibility === 'PUBLIC' ? 'Public' : 'Private'}</span>}
        {it.committed && it.status === 'UPLOADING' && it.source === 'direct' && <span>· publishes when done</span>}
        {it.folderName && <span className="truncate">· {it.folderName}</span>}
      </div>
      {(it.status === 'UPLOADING' || it.status === 'QUEUED') && <div className="mt-1 h-1 rounded bg-white/10 overflow-hidden"><div className="h-full bg-[#00B4D8] transition-all" style={{ width: `${it.progress}%` }} /></div>}
      {it.error && <p className="text-[11px] text-red-300 truncate">{it.error}</p>}
    </div>
    {it.status === 'ERROR' && <span role="button" onClick={e => { e.stopPropagation(); retryUpload(it.id); }} className="text-[11px] text-white/70 hover:text-white">Retry</span>}
    {it.status === 'QUEUED' && it.source !== 'direct' && <span role="button" onClick={e => { e.stopPropagation(); cancelUpload(it.id); }} className="text-white/40 hover:text-white"><X size={14} /></span>}
  </button>
);

// ── Folders tab ──────────────────────────────────────────────────────────────

const FoldersTab: React.FC<{ uid: string; prefs: ReelloUploadPrefs; onAddFolder: (watch: boolean, templateId?: string) => void }> = ({ uid, prefs, onAddFolder }) => {
  const [folders, setFolders] = useState<ReelloFolder[]>([]);
  const [settling, setSettling] = useState<Record<string, number>>({});
  const [newTpl, setNewTpl] = useState(prefs.defaultTemplateId || '');
  const reload = () => listFolders(uid).then(setFolders);
  useEffect(() => { reload(); return subscribeRunner(s => { setSettling(s.settling); if (s.lastTick) setFolders(s.folders); }); }, [uid]);
  const tplName = (id?: string) => prefs.templates.find(t => t.id === id)?.name;

  if (!folderPickerSupported()) return <p className="text-sm text-white/60">Folders need Chrome or Edge on a computer — this browser can’t give Plajah access to a folder. You can still pick up to {MAX_DIRECT_FILES} files at a time.</p>;
  return (
    <div className="space-y-5">
      <div className="p-4 rounded-2xl bg-[#111116] border border-white/10 space-y-3">
        <p className="text-sm font-semibold text-white">Add a folder</p>
        <label className="block text-xs text-white/60">Upload template
          <select value={newTpl} onChange={e => setNewTpl(e.target.value)} className="mt-1 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
            <option value="">None — title from the file name, {prefs.defaultVisibility === 'PUBLIC' ? 'public' : 'private'}</option>
            {prefs.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onAddFolder(true, newTpl || undefined)} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#00B4D8] text-black text-sm font-bold"><FolderSync size={16} />Watch a folder</button>
          <button onClick={() => onAddFolder(false, newTpl || undefined)} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-semibold"><FolderPlus size={16} />Upload a folder once</button>
        </div>
        <p className="text-xs text-white/40">A watch folder uploads every new video that lands in it, filled in from its template. Watching runs while Plajah is open in this browser; files still being written wait until they stop changing.</p>
      </div>
      {!folders.length && <p className="text-sm text-white/50">No folders yet.</p>}
      {folders.map(f => (
        <div key={f.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
          {f.meta.watch ? <FolderSync size={20} className="text-[#00B4D8]" /> : <Folder size={20} className="text-white/60" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{f.name}</p>
            <p className="text-xs text-white/50">
              {f.meta.watch ? (f.meta.paused ? 'Watching paused' : 'Watching') : f.meta.done ? 'Batch finished' : 'Batch uploading'}
              {' · '}{f.fileCount} uploaded{settling[f.id] ? ` · ${settling[f.id]} still being written` : ''}
              {' · '}{tplName(f.meta.templateId) ? `template “${tplName(f.meta.templateId)}”` : 'no template'}
            </p>
          </div>
          <select value={f.meta.templateId || ''} onChange={e => updateFolder(uid, f.id, { templateId: e.target.value || undefined }).then(reload)} className="bg-[#181820] border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
            <option value="">No template</option>
            {prefs.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {f.permission !== 'granted'
            ? <button onClick={() => reconnectFolder(f.id).then(() => { reload(); tick(); })} className="text-xs px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-200">{f.permission === 'missing' ? 'Folder gone — remove it' : 'Allow access again'}</button>
            : f.meta.watch && <button onClick={() => updateFolder(uid, f.id, { paused: !f.meta.paused }).then(() => { reload(); tick(); })} className="text-white/60 hover:text-white" title={f.meta.paused ? 'Resume' : 'Pause'}>{f.meta.paused ? <Play size={16} /> : <Pause size={16} />}</button>}
          <button onClick={() => tick()} className="text-white/60 hover:text-white" title="Scan now"><RefreshCw size={16} /></button>
          <button onClick={() => { if (window.confirm(`Stop using “${f.name}”? Videos already uploaded stay up.`)) removeFolder(uid, f.id).then(reload); }} className="text-white/40 hover:text-red-300" title="Remove"><Trash2 size={16} /></button>
        </div>
      ))}
    </div>
  );
};

// ── Templates tab ────────────────────────────────────────────────────────────

const TOKENS = ['{name}', '{filename}', '{folder}', '{date}', '{n}', '{account}'];

const TemplatesTab: React.FC<{ prefs: ReelloUploadPrefs; onSave: (p: ReelloUploadPrefs) => Promise<void> }> = ({ prefs, onSave }) => {
  const [draft, setDraft] = useState(prefs);
  const [sel, setSel] = useState<string | null>(prefs.templates[0]?.id || null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { setDraft(prefs); }, [prefs]);
  const t = draft.templates.find(x => x.id === sel) || null;
  const setT = (p: Partial<UploadTemplate>) => setDraft(d => ({ ...d, templates: d.templates.map(x => x.id === sel ? { ...x, ...p, updatedAt: Date.now() } : x) }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(prefs);
  const preview = t ? applyTemplate(t, { fileName: 'my_trip-to-lisbon_FINAL.mp4', folder: 'Travel', index: 2, account: accountName() }, draft) : null;

  const save = async () => {
    setSaving(true); setMsg('');
    try { await onSave(draft); setMsg('Saved.'); } catch (e: any) { setMsg(e?.message || 'Could not save.'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <section className="p-4 rounded-2xl bg-[#111116] border border-white/10 space-y-3">
        <p className="text-sm font-semibold text-white">Defaults for batch and automatic uploads</p>
        <p className="text-xs text-white/50">Folder batches and watch-folder uploads use this when their template doesn’t choose.</p>
        <VisibilityPicker name="default-vis" value={draft.defaultVisibility} onChange={v => setDraft(d => ({ ...d, defaultVisibility: v }))} />
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" className="accent-[#00B4D8]" checked={draft.storyIntelDefault} onChange={e => setDraft(d => ({ ...d, storyIntelDefault: e.target.checked }))} />
          Turn Story Intelligence on for new uploads
        </label>
        {draft.templates.length > 0 && (
          <label className="block text-xs text-white/60">Template for hand-picked uploads
            <select value={draft.defaultTemplateId || ''} onChange={e => setDraft(d => ({ ...d, defaultTemplateId: e.target.value || undefined }))} className="mt-1 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">None</option>
              {draft.templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )}
      </section>

      <section className="grid md:grid-cols-[14rem_1fr] gap-4">
        <div className="space-y-1">
          {draft.templates.map(x => <button key={x.id} onClick={() => setSel(x.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm ${sel === x.id ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5'}`}>{x.name}</button>)}
          <button onClick={() => { const n = newTemplate(`Template ${draft.templates.length + 1}`); setDraft(d => ({ ...d, templates: [...d.templates, n] })); setSel(n.id); }} className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#7fe3f5] hover:bg-white/5"><Plus size={14} />New template</button>
        </div>
        {t ? (
          <div className="space-y-4 p-4 rounded-2xl bg-[#111116] border border-white/10">
            <div className="flex gap-2">
              <input value={t.name} onChange={e => setT({ name: e.target.value })} className="flex-1 bg-transparent text-base font-bold text-white border-b border-white/10 focus:outline-none focus:border-[#00B4D8]" />
              <button onClick={() => { setDraft(d => ({ ...d, templates: d.templates.filter(x => x.id !== t.id), defaultTemplateId: d.defaultTemplateId === t.id ? undefined : d.defaultTemplateId })); setSel(null); }} className="text-white/40 hover:text-red-300" title="Delete template"><Trash2 size={16} /></button>
            </div>
            <label className="block text-xs text-white/60">Title
              <input value={t.titlePattern} onChange={e => setT({ titlePattern: e.target.value })} className="mt-1 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
            <div className="flex flex-wrap gap-1">{TOKENS.map(k => <button key={k} onClick={() => setT({ titlePattern: `${t.titlePattern} ${k}`.trim() })} className="px-2 py-0.5 rounded-full bg-white/10 text-[11px] text-white/70 hover:bg-white/20">{k}</button>)}</div>
            <label className="block text-xs text-white/60">Description
              <textarea rows={4} value={t.description} onChange={e => setT({ description: e.target.value })} placeholder="Links, credits, shop info… tokens work here too." className="mt-1 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs text-white/60">Tags
                <input defaultValue={t.tags.join(', ')} key={t.id} onChange={e => setT({ tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="mt-1 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              </label>
              <label className="block text-xs text-white/60">Category
                <select value={t.genre} onChange={e => setT({ genre: e.target.value })} className="mt-1 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">{GENRES.map(g => <option key={g}>{g}</option>)}</select>
              </label>
            </div>
            <label className="block text-xs text-white/60">Visibility
              <select value={t.visibility || ''} onChange={e => setT({ visibility: (e.target.value || null) as UploadVisibility | null })} className="mt-1 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Account default ({draft.defaultVisibility === 'PUBLIC' ? 'public' : 'private'})</option>
                <option value="PRIVATE">Private</option><option value="PUBLIC">Public</option>
              </select>
            </label>
            <IntelOptionsEditor enabled={t.storyIntel} onEnabled={v => setT({ storyIntel: v })} value={t.intel} onChange={v => setT({ intel: v })} accountName={accountName()} />
            {preview && (
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 text-xs text-white/60">
                <p className="text-white/40 mb-1">Preview for “my_trip-to-lisbon_FINAL.mp4” in folder “Travel”:</p>
                <p className="text-white font-semibold">{preview.title}</p>
                {preview.description && <p className="whitespace-pre-line mt-1">{preview.description.slice(0, 300)}</p>}
                <p className="mt-1">{preview.visibility === 'PUBLIC' ? 'Public' : 'Private'} · {preview.genre}{preview.storyIntel ? ' · Story Intelligence on' : ''}</p>
              </div>
            )}
          </div>
        ) : <p className="text-sm text-white/50 p-4">Make a template to fill uploads in automatically — watch folders use one each.</p>}
      </section>
      <div className="flex items-center gap-3">
        <button disabled={!dirty || saving} onClick={save} className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#00B4D8] text-black text-sm font-bold disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Save</button>
        {msg && <span className="text-xs text-white/60">{msg}</span>}
      </div>
    </div>
  );
};

// ── The studio ───────────────────────────────────────────────────────────────

export interface ReelloUploadStudioProps {
  onClose: () => void;
  /** Files handed over from elsewhere (e.g. a local video the user chose to share). */
  seedFiles?: File[];
  initialTab?: Tab;
  /** The content-rights declaration was already made (e.g. in VideoManager) for this hand-off. */
  rightsConfirmed?: boolean;
}

const RIGHTS_TEXT = "I hereby declare, under penalty of applicable law, that I am the original creator of or hold all necessary intellectual property rights, licenses, and permissions to upload, store, and distribute this video content. I confirm this upload does not infringe any copyright, trademark, right of publicity, privacy right, or any other proprietary right of any third party, and that I am in full compliance with all applicable federal, state, and international laws including the Digital Millennium Copyright Act (DMCA). I understand that uploading content I do not own violates Plajah's Terms of Service and may result in immediate content removal, account suspension, and potential legal liability.";
const rightsKey = (uid: string) => `reello:rightsDeclared:${uid}`;

const ReelloUploadStudio: React.FC<ReelloUploadStudioProps> = ({ onClose, seedFiles, initialTab = 'UPLOAD', rightsConfirmed }) => {
  const uid = auth.currentUser?.uid || '';
  // The rights declaration is made once per browser session, before the first file or folder is taken
  // (a watch folder's later uploads are covered by the declaration made when it was added).
  const [rightsOk, setRightsOk] = useState<boolean>(() => { try { return !!rightsConfirmed || sessionStorage.getItem(rightsKey(uid)) === '1'; } catch { return !!rightsConfirmed; } });
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null);
  const [rightsTick, setRightsTick] = useState(false);
  const guard = (fn: () => void) => { if (rightsOk) fn(); else { setRightsTick(false); setPendingAction(() => fn); } };
  const [tab, setTab] = useState<Tab>(initialTab);
  const [prefs, setPrefs] = useState<ReelloUploadPrefs>(DEFAULT_PREFS);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [mine, setMine] = useState<string[]>([]);  // direct items picked in this studio session
  const [sel, setSel] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tooMany?: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { loadPrefs().then(setPrefs); }, []);
  useEffect(() => subscribeQueue(setQueue), []);
  useEffect(() => { if (uid) startFolderRunner(uid, accountName()); }, [uid]);
  useEffect(() => { if (seedFiles?.length) guard(() => takeFiles(seedFiles)); }, []);
  useEffect(() => { if (rightsConfirmed && uid) try { sessionStorage.setItem(rightsKey(uid), '1'); } catch { /* */ } }, []);

  const direct = useMemo(() => queue.filter(i => mine.includes(i.id)), [queue, mine]);
  const background = useMemo(() => queue.filter(i => i.source !== 'direct'), [queue]);
  const selected = direct.find(i => i.id === sel) || direct[0] || null;

  function takeFiles(list: File[]) {
    const vids = list.filter(isVideoFile);
    const skipped = list.length - vids.length;
    const room = MAX_DIRECT_FILES - direct.filter(i => i.status !== 'DONE').length;
    if (vids.length > room) {
      setNotice({ text: `That’s ${vids.length} videos. You can pick up to ${MAX_DIRECT_FILES} at a time here — for more, choose their folder and they’ll upload in the background.`, tooMany: vids.length });
      return;
    }
    setNotice(skipped ? { text: `${skipped} file${skipped === 1 ? ' isn’t' : 's aren’t'} a video and ${skipped === 1 ? 'was' : 'were'} skipped.` } : null);
    const tpl = prefs.templates.find(t => t.id === prefs.defaultTemplateId) || null;
    const ids = vids.map((file, i) => {
      const a = applyTemplate(tpl, { fileName: file.name, index: i, account: accountName() }, { defaultVisibility: 'PRIVATE' });
      return enqueueUpload({
        file, source: 'direct',
        details: { title: a.title, description: a.description, tags: a.tags, genre: a.genre, visibility: tpl?.visibility || 'PRIVATE', storyIntel: tpl ? a.storyIntel : prefs.storyIntelDefault, intel: a.intel },
      });
    });
    if (ids.length) { setMine(m => [...m, ...ids]); setSel(ids[0]); setTab('UPLOAD'); }
  }

  const onAddFolder = (watch: boolean, templateId?: string) => guard(() => void addFolderNow(watch, templateId));
  const addFolderNow = async (watch: boolean, templateId?: string) => {
    try {
      const f = await addFolder(uid, { watch, templateId });
      if (!f) return;
      setNotice({ text: watch ? `Watching “${f.name}”. New videos in it upload automatically.` : `Uploading “${f.name}” in the background — you can close this.` });
      startFolderRunner(uid, accountName());
      await tick();
    } catch (e: any) { setNotice({ text: e?.message || 'Could not open that folder.' }); }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    // Read the drop synchronously — DataTransfer is emptied once the event returns.
    const items = [...(e.dataTransfer.items || [])];
    const handlesP = Promise.all(items.map(it => (it as any).getAsFileSystemHandle?.()?.catch?.(() => null) ?? null));
    const files = [...e.dataTransfer.files];
    guard(() => void takeDrop(handlesP, files));
  };
  const takeDrop = async (handlesP: Promise<any[]>, files: File[]) => {
    // A dropped FOLDER (Chromium hands over a directory handle) becomes a background batch.
    const handles = await handlesP.catch(() => [] as any[]);
    const dir = handles.find(h => h?.kind === 'directory');
    if (dir) {
      const { addSyncFolderFromHandle } = await import('../../../services/fabula/syncFolders');
      const f = await addSyncFolderFromHandle(`reello-${uid}`, dir);
      await updateFolder(uid, f.id, { watch: false, templateId: prefs.defaultTemplateId, done: false });
      setNotice({ text: `Uploading the folder “${f.name}” in the background.` });
      startFolderRunner(uid, accountName()); await tick();
      return;
    }
    takeFiles(files);
  };

  const savePrefsAndRefresh = async (p: ReelloUploadPrefs) => {
    const saved = await savePrefs(p);
    setPrefs(saved); refreshRunnerPrefs(saved);
  };

  const publishable = direct.filter(i => !i.committed && i.details.title.trim());
  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'UPLOAD', label: 'Upload', icon: <UploadCloud size={16} /> },
    { id: 'FOLDERS', label: 'Folders', icon: <FolderSync size={16} /> },
    { id: 'TEMPLATES', label: 'Templates & defaults', icon: <Settings2 size={16} /> },
    { id: 'DRAFTS', label: 'Drafts', icon: <Inbox size={16} /> },
  ];

  return (
    <div className="fixed inset-0 z-[400] bg-black/70 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Upload videos">
      <div className="relative w-full max-w-6xl h-full sm:h-[min(92vh,900px)] bg-[#07060a] sm:rounded-3xl border border-white/10 flex flex-col overflow-hidden text-white">
        <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/10">
          <h2 className="text-lg font-bold">Upload videos</h2>
          <nav className="flex gap-1 ml-2 overflow-x-auto">
            {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${tab === t.id ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'}`}>{t.icon}<span className="hidden sm:inline">{t.label}</span></button>)}
          </nav>
          <button onClick={onClose} className="ml-auto p-2 rounded-full hover:bg-white/10" aria-label="Close"><X size={20} /></button>
        </header>

        {notice && (
          <div className="mx-4 sm:mx-6 mt-3 flex flex-wrap items-center gap-3 p-3 rounded-xl bg-[#00B4D8]/10 border border-[#00B4D8]/30 text-sm">
            <AlertCircle size={16} className="text-[#7fe3f5] shrink-0" />
            <span className="flex-1 min-w-[12rem]">{notice.text}</span>
            {notice.tooMany && folderPickerSupported() && <button onClick={() => onAddFolder(false, prefs.defaultTemplateId)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00B4D8] text-black text-xs font-bold"><FolderPlus size={14} />Choose the folder</button>}
            <button onClick={() => setNotice(null)} className="text-white/50 hover:text-white"><X size={14} /></button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          {tab === 'UPLOAD' && (direct.length === 0 ? (
            <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
              className={`h-full min-h-[22rem] flex flex-col items-center justify-center text-center rounded-3xl border-2 border-dashed transition-colors ${dragging ? 'border-[#00B4D8] bg-[#00B4D8]/5' : 'border-white/10'}`}>
              <div className="w-32 h-32 rounded-full bg-[#111116] grid place-items-center mb-6"><UploadCloud size={52} className="text-white/50" /></div>
              <p className="text-lg font-semibold">Drag and drop video files to upload</p>
              <p className="text-sm text-white/50 mt-1 max-w-md">Up to {MAX_DIRECT_FILES} at a time. Drop a folder, or choose one, to upload more in the background.</p>
              <div className="flex flex-wrap justify-center gap-3 mt-6">
                <button onClick={() => guard(() => fileInput.current?.click())} className="px-6 py-2.5 rounded-full bg-[#00B4D8] text-black font-bold text-sm">Select files</button>
                {folderPickerSupported() && <button onClick={() => onAddFolder(false, prefs.defaultTemplateId)} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/10 font-semibold text-sm"><FolderPlus size={16} />Choose a folder</button>}
              </div>
              <p className="text-xs text-white/40 mt-6">Batch and automatic uploads are <b className="text-white/70">{prefs.defaultVisibility === 'PUBLIC' ? 'public' : 'private'}</b> by default · <button className="underline" onClick={() => setTab('TEMPLATES')}>change</button></p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[18rem_1fr] gap-6">
              <aside className="space-y-2">
                {direct.map(i => <QueueRow key={i.id} it={i} active={selected?.id === i.id} onClick={() => setSel(i.id)} />)}
                {direct.filter(i => i.status !== 'DONE').length < MAX_DIRECT_FILES && (
                  <button onClick={() => guard(() => fileInput.current?.click())} className="w-full inline-flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-white/15 text-sm text-white/60 hover:text-white"><Plus size={14} />Add videos</button>
                )}
                <p className="text-[11px] text-white/40 px-1">Uploads keep going if you close this. Videos stay private until you publish.</p>
              </aside>
              <section>{selected && <DetailsEditor key={selected.id} item={selected} templates={prefs.templates} />}</section>
            </div>
          ))}

          {tab === 'FOLDERS' && <FoldersTab uid={uid} prefs={prefs} onAddFolder={onAddFolder} />}
          {tab === 'TEMPLATES' && <TemplatesTab prefs={prefs} onSave={savePrefsAndRefresh} />}
          {tab === 'DRAFTS' && <ReelloIntelDrafts />}

          {tab !== 'DRAFTS' && background.length > 0 && (
            <section className="mt-8">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white/50">Background uploads · {background.filter(i => i.status === 'DONE').length}/{background.length} done</h3>
                <button onClick={clearFinished} className="text-xs text-white/50 hover:text-white">Clear finished</button>
              </div>
              <div className="grid sm:grid-cols-2 gap-1">{background.slice(-40).reverse().map(i => <QueueRow key={i.id} it={i} />)}</div>
            </section>
          )}
        </main>

        {tab === 'UPLOAD' && direct.length > 0 && (
          <footer className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 border-t border-white/10">
            <span className="text-xs text-white/50 flex items-center gap-2">
              {direct.some(i => i.details.storyIntel && !i.committed) && <><Sparkles size={14} className="text-[#00B4D8]" />Story Intelligence drafts land in <button className="underline" onClick={() => setTab('DRAFTS')}>Drafts</button></>}
            </span>
            <div className="ml-auto flex gap-2">
              {selected && !selected.committed && (
                <button disabled={!selected.details.title.trim()} onClick={() => { commitUpload(selected.id); const next = direct.find(i => !i.committed && i.id !== selected.id); if (next) setSel(next.id); }} className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/10 text-sm font-semibold disabled:opacity-40">
                  Publish this one<ChevronRight size={14} />
                </button>
              )}
              <button disabled={!publishable.length} onClick={() => publishable.forEach(i => commitUpload(i.id))} className="px-5 py-2 rounded-full bg-[#00B4D8] text-black text-sm font-bold disabled:opacity-40">
                {publishable.length > 1 ? `Publish all ${publishable.length}` : 'Publish'}
              </button>
            </div>
          </footer>
        )}

        {pendingAction && (
          <div className="absolute inset-0 z-10 bg-black/70 grid place-items-center p-4">
            <div className="w-full max-w-lg rounded-2xl bg-[#111116] border border-white/10 p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold">Content rights declaration</h3>
                <p className="text-xs text-white/50">Required before uploading — covers this upload session and any folder you add.</p>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1 accent-[#00B4D8]" checked={rightsTick} onChange={e => setRightsTick(e.target.checked)} />
                <span className="text-xs text-white/70 leading-relaxed">{RIGHTS_TEXT}</span>
              </label>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setPendingAction(null)} className="px-4 py-2 rounded-full bg-white/10 text-sm">Cancel</button>
                <button disabled={!rightsTick} onClick={() => { const fn = pendingAction; setPendingAction(null); setRightsOk(true); try { sessionStorage.setItem(rightsKey(uid), '1'); } catch { /* */ } fn?.(); }} className="px-4 py-2 rounded-full bg-[#00B4D8] text-black text-sm font-bold disabled:opacity-40">Confirm & continue</button>
              </div>
            </div>
          </div>
        )}

        <input ref={fileInput} type="file" accept="video/*" multiple className="hidden" onChange={e => { takeFiles([...(e.target.files || [])]); e.target.value = ''; }} />
      </div>
    </div>
  );
};

export default ReelloUploadStudio;
