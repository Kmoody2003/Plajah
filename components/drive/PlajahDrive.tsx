// Plajah Drive — your files and your organization's shared files, Dropbox-style.
// Left rail: My Drive, each org Drive, Trash, and the storage meter. Main: breadcrumb, toolbar,
// files and folders (list or grid), drag-and-drop anywhere to upload, and an upload tray that
// shows each file's progress. Everything goes through a DriveApi (services/drive/client.ts), so the
// lab runs the same view on an in-memory fake.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ChevronRight, CloudUpload, Download, File as FileIcon, FileArchive, FileAudio, FileImage, FileText, FileVideo,
  Folder, FolderPlus, HardDrive, LayoutGrid, List, Loader2, MoreHorizontal, Pencil, RotateCcw, Search, Trash2, Users, X, FolderInput, AlertTriangle, Check,
} from 'lucide-react';
import { formatBytes, type DriveApi, type DriveItem, type DriveScope, type DriveUsage } from '../../services/drive/client';

export interface DriveOrg { id: string; name: string }

interface Props {
  api: DriveApi;
  orgs?: DriveOrg[];
  onBack?: () => void;
  onAddStorage?: (org?: string) => void;
}

type Upload = { key: string; name: string; size: number; sent: number; status: 'up' | 'done' | 'error' | 'cancelled'; error?: string; ctrl: AbortController };

const DAY = 86_400_000;

function iconFor(it: DriveItem) {
  if (it.kind === 'folder') return Folder;
  const m = it.mime ?? '';
  if (m.startsWith('image/')) return FileImage;
  if (m.startsWith('video/')) return FileVideo;
  if (m.startsWith('audio/')) return FileAudio;
  if (m.includes('zip') || m.includes('compressed') || m.includes('tar')) return FileArchive;
  if (m.startsWith('text/') || m.includes('pdf') || m.includes('document') || m.includes('sheet') || m.includes('presentation')) return FileText;
  return FileIcon;
}

function when(t: number) {
  if (!t) return '';
  const d = new Date(t), now = Date.now();
  if (now - t < DAY && d.getDate() === new Date(now).getDate()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
}

function usageState(u: DriveUsage | null): string {
  if (!u) return 'ok';
  return typeof u.state === 'string' ? u.state : u.state.state;
}

export default function PlajahDrive({ api, orgs = [], onBack, onAddStorage }: Props) {
  const [org, setOrg] = useState<string | undefined>(undefined);
  const [trash, setTrash] = useState(false);
  const [parent, setParent] = useState<string | null>(null);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [path, setPath] = useState<Array<{ id: string; name: string }>>([]);
  const [usage, setUsage] = useState<DriveUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [layout, setLayout] = useState<'list' | 'grid'>(() => { try { return (localStorage.getItem('drive.layout') as 'grid') || 'list'; } catch { return 'list'; } });
  const [filter, setFilter] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [naming, setNaming] = useState<null | string>(null); // new-folder name draft
  const [moving, setMoving] = useState<DriveItem | null>(null);
  const [confirm, setConfirm] = useState<DriveItem | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const scope: DriveScope = org ? { kind: 'o', orgId: org } : { kind: 'u' };
  const driveName = org ? (orgs.find(o => o.id === org)?.name ?? 'Organization') : 'My Drive';

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [l, u] = await Promise.all([api.list(org, trash ? null : parent, trash), api.usage(org).catch(() => null)]);
      setItems(l.items); setPath(l.path); setUsage(u); setClosed(false);
    } catch (e: any) {
      if (e?.code === 'drive_off') setClosed(true);
      else setError(e?.message ?? 'Couldn’t open Drive.');
      setItems([]);
    } finally { setLoading(false); }
  }, [api, org, parent, trash]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { try { localStorage.setItem('drive.layout', layout); } catch { /* private mode */ } }, [layout]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const go = (o: string | undefined, t = false) => { setOrg(o); setTrash(t); setParent(null); setFilter(''); };
  const open = (it: DriveItem) => { if (it.kind === 'folder') { setParent(it.id); setFilter(''); } else void download(it, true); };

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? items.filter(i => i.name.toLowerCase().includes(f)) : items;
  }, [items, filter]);

  async function act<T>(fn: () => Promise<T>, done?: string) {
    try { await fn(); if (done) setToast(done); await load(); }
    catch (e: any) { setToast(e?.message ?? 'Something went wrong.'); }
  }

  async function download(it: DriveItem, inline = false) {
    try {
      const url = await api.downloadUrl(org, it.id, inline);
      if (inline) window.open(url, '_blank', 'noopener');
      else { const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; a.click(); }
    } catch (e: any) { setToast(e?.message ?? 'Couldn’t get that file.'); }
  }

  function startUploads(files: FileList | File[]) {
    if (trash) return;
    const list = Array.from(files).filter(f => f.size > 0);
    if (!list.length) return;
    const target = parent, sc = scope;
    for (const f of list) {
      const u: Upload = { key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`, name: f.name, size: f.size, sent: 0, status: 'up', ctrl: new AbortController() };
      setUploads(prev => [...prev, u]);
      const patch = (p: Partial<Upload>) => setUploads(prev => prev.map(x => (x.key === u.key ? { ...x, ...p } : x)));
      api.upload(sc, f, target, sent => patch({ sent }), u.ctrl.signal)
        .then(() => { patch({ status: 'done', sent: f.size }); void load(); })
        .catch((e: any) => patch(e?.name === 'AbortError' ? { status: 'cancelled' } : { status: 'error', error: e?.message ?? 'Upload failed' }));
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); dragDepth.current = 0; setDragging(false);
    if (e.dataTransfer.files?.length) startUploads(e.dataTransfer.files);
  };

  const state = usageState(usage);
  const used = usage ? usage.liveBytes + usage.trashBytes : 0;
  const pct = usage && usage.allowance ? Math.min(100, (used / usage.allowance) * 100) : 0;
  const activeUploads = uploads.filter(u => u.status === 'up').length;

  /* ── rail ─────────────────────────────────────────────────────────────────── */
  const railItem = (key: string, active: boolean, Icon: any, label: string, onClick: () => void) => (
    <button key={key} onClick={onClick} className={`pd-rail-item ${active ? 'is-active' : ''}`}>
      <Icon size={17} strokeWidth={1.9} /><span className="truncate">{label}</span>
    </button>
  );

  const rail = (
    <aside className="pd-rail">
      <div className="pd-brand">
        {onBack && <button className="pd-icon-btn" onClick={onBack} aria-label="Back"><ArrowLeft size={18} /></button>}
        <HardDrive size={20} className="text-sky-300" /><span>Drive</span>
      </div>
      <nav className="pd-rail-nav">
        {railItem('me', !org && !trash, HardDrive, 'My Drive', () => go(undefined))}
        {orgs.map(o => railItem(o.id, org === o.id && !trash, Users, o.name, () => go(o.id)))}
        {railItem('trash', trash, Trash2, 'Trash', () => go(org, true))}
      </nav>
      {usage && (
        <div className="pd-meter">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="text-white/80 font-medium">{driveName}</span>
            <span className="text-white/45 tabular-nums">{Math.round(pct)}%</span>
          </div>
          <div className="pd-meter-bar"><div className={`pd-meter-fill is-${state}`} style={{ width: `${pct}%` }} /></div>
          <div className="text-[12px] text-white/55 tabular-nums">{formatBytes(used)} of {formatBytes(usage.allowance)}</div>
          {usage.trashBytes > 0 && <div className="pd-meter-extra text-[11px] text-white/40">Trash holds {formatBytes(usage.trashBytes)}</div>}
          {state !== 'ok' && (
            <div className={`pd-meter-note is-${state}`}>
              {state === 'warn' && 'Almost full.'}
              {state === 'grace' && 'Over your space. Uploads keep working for a short grace period.'}
              {state === 'blocked' && 'Full. New uploads are paused; nothing is deleted.'}
            </div>
          )}
          {onAddStorage && <button className="pd-link" onClick={() => onAddStorage(org)}>Add storage</button>}
        </div>
      )}
    </aside>
  );

  /* ── item actions ─────────────────────────────────────────────────────────── */
  const menuFor = (it: DriveItem) => (
    <div className="pd-menu" onClick={e => e.stopPropagation()} role="menu">
      {trash ? <>
        <button role="menuitem" onClick={() => { setMenu(null); void act(() => api.restore(org, it.id), `Restored ${it.name}`); }}><RotateCcw size={15} />Restore</button>
        <button role="menuitem" className="is-danger" onClick={() => { setMenu(null); setConfirm(it); }}><Trash2 size={15} />Delete forever</button>
      </> : <>
        {it.kind === 'file' && <button role="menuitem" onClick={() => { setMenu(null); void download(it); }}><Download size={15} />Download</button>}
        <button role="menuitem" onClick={() => { setMenu(null); setRenaming(it.id); }}><Pencil size={15} />Rename</button>
        <button role="menuitem" onClick={() => { setMenu(null); setMoving(it); }}><FolderInput size={15} />Move to…</button>
        <button role="menuitem" className="is-danger" onClick={() => { setMenu(null); void act(() => api.trash(org, it.id), `Moved ${it.name} to the trash`); }}><Trash2 size={15} />Move to trash</button>
      </>}
    </div>
  );

  const nameCell = (it: DriveItem) => {
    const Icon = iconFor(it);
    if (renaming === it.id) {
      return (
        <form className="flex items-center gap-2 min-w-0 flex-1" onClick={e => e.stopPropagation()} onSubmit={e => {
          e.preventDefault();
          const v = String(new FormData(e.currentTarget).get('n') ?? '').trim();
          setRenaming(null);
          if (v && v !== it.name) void act(() => api.update(org, it.id, { name: v }));
        }}>
          <Icon size={18} className={it.kind === 'folder' ? 'text-sky-300 shrink-0' : 'text-white/55 shrink-0'} />
          <input name="n" autoFocus defaultValue={it.name} className="pd-input flex-1 min-w-0" onBlur={e => e.currentTarget.form?.requestSubmit()}
            onKeyDown={e => { if (e.key === 'Escape') setRenaming(null); }}
            onFocus={e => { const dot = it.kind === 'file' ? it.name.lastIndexOf('.') : -1; e.currentTarget.setSelectionRange(0, dot > 0 ? dot : it.name.length); }} />
        </form>
      );
    }
    return (
      <span className="flex items-center gap-3 min-w-0">
        <Icon size={18} className={it.kind === 'folder' ? 'text-sky-300 shrink-0' : 'text-white/55 shrink-0'} />
        <span className="truncate">{it.name}</span>
        {it.scan === 'infected' && <span className="pd-chip is-danger">Blocked</span>}
      </span>
    );
  };

  const menuButton = (it: DriveItem) => (
    <div className="relative">
      <button className="pd-icon-btn" aria-label={`Actions for ${it.name}`} onClick={e => { e.stopPropagation(); setMenu(menu === it.id ? null : it.id); }}>
        <MoreHorizontal size={17} />
      </button>
      {menu === it.id && menuFor(it)}
    </div>
  );

  /* ── main ─────────────────────────────────────────────────────────────────── */
  const crumbs = trash ? [{ id: null as string | null, name: 'Trash' }] : [{ id: null as string | null, name: driveName }, ...path];

  const body = closed ? (
    <div className="pd-empty">
      <HardDrive size={40} className="text-sky-300/80" />
      <h2>Drive is almost here</h2>
      <p>Store, share and send files of any size, for you and your organization. We’ll let you know when it opens.</p>
    </div>
  ) : error ? (
    <div className="pd-empty"><AlertTriangle size={36} className="text-amber-300" /><h2>Couldn’t open Drive</h2><p>{error}</p><button className="pd-btn" onClick={() => void load()}>Try again</button></div>
  ) : loading && !items.length ? (
    <div className="pd-empty"><Loader2 size={28} className="animate-spin text-white/50" /></div>
  ) : !shown.length && naming === null ? (
    <div className="pd-empty">
      {trash ? <><Trash2 size={36} className="text-white/40" /><h2>Trash is empty</h2><p>Deleted files stay here for 30 days and still count toward your space.</p></>
        : filter ? <><Search size={36} className="text-white/40" /><h2>No matches</h2><p>Nothing here is named like “{filter}”.</p></>
        : <><CloudUpload size={40} className="text-sky-300/80" /><h2>Drop files here</h2><p>Or use Upload. Big files go up in pieces, so a dropped connection doesn’t start you over.</p>
          <button className="pd-btn is-primary" onClick={() => fileInput.current?.click()}><CloudUpload size={16} />Upload files</button></>}
    </div>
  ) : layout === 'list' ? (
    <div className="pd-table" role="table">
      <div className="pd-row is-head" role="row">
        <span role="columnheader">Name</span><span role="columnheader" className="pd-col-size">Size</span>
        <span role="columnheader" className="pd-col-date">{trash ? 'Deletes' : 'Modified'}</span><span />
      </div>
      {naming !== null && newFolderRow()}
      {shown.map(it => (
        <div key={it.id} role="row" className="pd-row" onDoubleClick={() => !trash && open(it)} onClick={() => { if (window.matchMedia('(pointer: coarse)').matches && !trash) open(it); }}>
          <span role="cell" className="min-w-0 flex">{nameCell(it)}</span>
          <span role="cell" className="pd-col-size tabular-nums">{it.kind === 'file' ? formatBytes(it.size) : '—'}</span>
          <span role="cell" className="pd-col-date">{trash && it.purgeAt ? `in ${Math.max(0, Math.ceil((it.purgeAt - Date.now()) / DAY))} days` : when(it.updatedAt)}</span>
          <span role="cell" className="flex justify-end">{menuButton(it)}</span>
        </div>
      ))}
    </div>
  ) : (
    <div className="pd-grid">
      {naming !== null && <div className="pd-tile">{newFolderRow(true)}</div>}
      {shown.map(it => {
        const Icon = iconFor(it);
        return (
          <div key={it.id} className="pd-tile" onDoubleClick={() => !trash && open(it)} onClick={() => { if (window.matchMedia('(pointer: coarse)').matches && !trash) open(it); }}>
            <div className="pd-tile-art"><Icon size={38} strokeWidth={1.4} className={it.kind === 'folder' ? 'text-sky-300' : 'text-white/50'} /></div>
            <div className="flex items-center gap-1 min-w-0">
              <div className="min-w-0 flex-1">{renaming === it.id ? nameCell(it) : <div className="truncate text-[13px]">{it.name}</div>}
                <div className="text-[11px] text-white/40 tabular-nums">{it.kind === 'file' ? formatBytes(it.size) : 'Folder'}</div></div>
              {menuButton(it)}
            </div>
          </div>
        );
      })}
    </div>
  );

  function newFolderRow(compact?: boolean) {
    return (
      <form className={compact ? 'flex flex-col gap-2 p-1' : 'pd-row'} onSubmit={e => {
        e.preventDefault();
        const v = String(new FormData(e.currentTarget).get('n') ?? '').trim();
        setNaming(null);
        if (v) void act(() => api.createFolder(org, v, parent), `Created ${v}`);
      }}>
        <span className="flex items-center gap-3 min-w-0">
          <Folder size={18} className="text-sky-300 shrink-0" />
          <input name="n" autoFocus defaultValue="New folder" onFocus={e => e.currentTarget.select()} className="pd-input flex-1 min-w-0"
            onKeyDown={e => { if (e.key === 'Escape') setNaming(null); }} onBlur={e => e.currentTarget.form?.requestSubmit()} />
        </span>
      </form>
    );
  }

  return (
    <div className="pd-root" onDragEnter={e => { if (trash || !e.dataTransfer.types.includes('Files')) return; e.preventDefault(); dragDepth.current++; setDragging(true); }}
      onDragOver={e => { if (!trash && e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
      onDrop={onDrop}>
      <style>{CSS}</style>
      {rail}
      <main className="pd-main">
        <header className="pd-top">
          <nav className="pd-crumbs" aria-label="Folder path">
            {crumbs.map((c, i) => (
              <React.Fragment key={c.id ?? 'root'}>
                {i > 0 && <ChevronRight size={15} className="text-white/30 shrink-0" />}
                <button className={`pd-crumb ${i === crumbs.length - 1 ? 'is-here' : ''}`} onClick={() => setParent(c.id)} disabled={i === crumbs.length - 1}>{c.name}</button>
              </React.Fragment>
            ))}
          </nav>
          <div className="pd-tools">
            <label className="pd-search"><Search size={15} className="text-white/40" /><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter this folder" /></label>
            <div className="pd-seg" role="group" aria-label="Layout">
              <button className={layout === 'list' ? 'is-on' : ''} onClick={() => setLayout('list')} aria-label="List"><List size={16} /></button>
              <button className={layout === 'grid' ? 'is-on' : ''} onClick={() => setLayout('grid')} aria-label="Grid"><LayoutGrid size={16} /></button>
            </div>
            {!trash && !closed && <>
              <button className="pd-btn" onClick={() => setNaming('')}><FolderPlus size={16} /><span className="pd-hide-sm">New folder</span></button>
              <button className="pd-btn is-primary" onClick={() => fileInput.current?.click()} disabled={state === 'blocked'}><CloudUpload size={16} /><span className="pd-hide-sm">Upload</span></button>
            </>}
            <input ref={fileInput} type="file" multiple hidden onChange={e => { if (e.target.files) startUploads(e.target.files); e.target.value = ''; }} />
          </div>
        </header>
        <section className="pd-body">{body}</section>
      </main>

      {dragging && <div className="pd-drop"><CloudUpload size={44} /><div>Drop to upload to <b>{crumbs[crumbs.length - 1].name}</b></div></div>}

      {uploads.length > 0 && (
        <div className="pd-tray" role="status">
          <div className="pd-tray-head">
            <span>{activeUploads ? `Uploading · ${uploads.length - activeUploads} of ${uploads.length} done` : 'Uploads finished'}</span>
            {!activeUploads && <button className="pd-icon-btn" onClick={() => setUploads([])} aria-label="Close uploads"><X size={16} /></button>}
          </div>
          <div className="pd-tray-list">
            {uploads.map(u => (
              <div key={u.key} className="pd-tray-item">
                <div className="flex items-center gap-2 min-w-0">
                  {u.status === 'done' ? <Check size={15} className="text-emerald-400 shrink-0" /> : u.status === 'error' ? <AlertTriangle size={15} className="text-rose-400 shrink-0" /> : u.status === 'cancelled' ? <X size={15} className="text-white/40 shrink-0" /> : <Loader2 size={15} className="animate-spin text-sky-300 shrink-0" />}
                  <span className="truncate flex-1 text-[13px]">{u.name}</span>
                  {u.status === 'up' && <button className="pd-icon-btn" onClick={() => u.ctrl.abort()} aria-label={`Cancel ${u.name}`}><X size={14} /></button>}
                </div>
                {u.status === 'up' && <div className="pd-meter-bar"><div className="pd-meter-fill is-ok" style={{ width: `${u.size ? (u.sent / u.size) * 100 : 0}%` }} /></div>}
                <div className="text-[11px] text-white/45 tabular-nums">
                  {u.status === 'error' ? u.error : u.status === 'cancelled' ? 'Cancelled' : u.status === 'done' ? formatBytes(u.size) : `${formatBytes(u.sent)} of ${formatBytes(u.size)}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {moving && <MoveDialog api={api} org={org} item={moving} rootName={driveName} onClose={() => setMoving(null)}
        onMove={to => { const it = moving; setMoving(null); void act(() => api.update(org, it.id, { parentId: to }), `Moved ${it.name}`); }} />}

      {confirm && (
        <div className="pd-modal-back" onClick={() => setConfirm(null)}>
          <div className="pd-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pd-confirm-title">
            <h3 id="pd-confirm-title">Delete “{confirm.name}” forever?</h3>
            <p>{confirm.kind === 'folder' ? 'The folder and everything in it will be erased.' : 'The file will be erased.'} This can’t be undone.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button className="pd-btn" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="pd-btn is-danger" onClick={() => { const it = confirm; setConfirm(null); void act(() => api.deleteForever(org, it.id), `Deleted ${it.name}`); }}>Delete forever</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="pd-toast" role="status">{toast}</div>}
    </div>
  );
}

/** Pick a destination folder, one level at a time. */
function MoveDialog({ api, org, item, rootName, onClose, onMove }: { api: DriveApi; org?: string; item: DriveItem; rootName: string; onClose: () => void; onMove: (to: string | null) => void }) {
  const [at, setAt] = useState<string | null>(null);
  const [folders, setFolders] = useState<DriveItem[]>([]);
  const [path, setPath] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    let live = true;
    api.list(org, at).then(r => { if (live) { setFolders(r.items.filter(i => i.kind === 'folder' && i.id !== item.id)); setPath(r.path); } }).catch(() => {});
    return () => { live = false; };
  }, [api, org, at, item.id]);
  const here = at === item.parentId;
  return (
    <div className="pd-modal-back" onClick={onClose}>
      <div className="pd-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pd-move-title">
        <h3 id="pd-move-title">Move “{item.name}”</h3>
        <div className="pd-crumbs mt-3">
          {[{ id: null as string | null, name: rootName }, ...path].map((c, i) => (
            <React.Fragment key={c.id ?? 'root'}>{i > 0 && <ChevronRight size={14} className="text-white/30" />}<button className="pd-crumb" onClick={() => setAt(c.id)}>{c.name}</button></React.Fragment>
          ))}
        </div>
        <div className="pd-move-list">
          {folders.length ? folders.map(f => (
            <button key={f.id} className="pd-move-item" onClick={() => setAt(f.id)}><Folder size={16} className="text-sky-300" /><span className="truncate flex-1 text-left">{f.name}</span><ChevronRight size={15} className="text-white/30" /></button>
          )) : <div className="text-[13px] text-white/40 p-3">No folders here.</div>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="pd-btn" onClick={onClose}>Cancel</button>
          <button className="pd-btn is-primary" disabled={here} onClick={() => onMove(at)}>Move here</button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.pd-root{position:fixed;inset:0;display:flex;background:#0b0d12;color:#e7e9ee;font-family:Inter,system-ui,sans-serif;z-index:40}
.pd-rail{width:248px;flex-shrink:0;border-right:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column;padding:14px 12px;gap:14px;background:#0e1117}
.pd-brand{display:flex;align-items:center;gap:10px;font-weight:650;font-size:17px;padding:4px 6px}
.pd-rail-nav{display:flex;flex-direction:column;gap:2px}
.pd-rail-item{display:flex;align-items:center;gap:11px;padding:8px 10px;border-radius:9px;font-size:14px;color:rgba(255,255,255,.72);text-align:left;min-width:0}
.pd-rail-item:hover{background:rgba(255,255,255,.05);color:#fff}
.pd-rail-item.is-active{background:rgba(125,211,252,.12);color:#e0f2fe}
.pd-meter{margin-top:auto;display:flex;flex-direction:column;gap:7px;padding:12px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06)}
.pd-meter-bar{height:6px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}
.pd-meter-fill{height:100%;border-radius:99px;transition:width .3s}
.pd-meter-fill.is-ok{background:#7dd3fc}.pd-meter-fill.is-warn{background:#fbbf24}.pd-meter-fill.is-grace{background:#fb923c}.pd-meter-fill.is-blocked{background:#f43f5e}
.pd-meter-note{font-size:12px;line-height:1.4;padding:7px 9px;border-radius:8px}
.pd-meter-note.is-warn{background:rgba(251,191,36,.1);color:#fde68a}.pd-meter-note.is-grace{background:rgba(251,146,60,.12);color:#fed7aa}.pd-meter-note.is-blocked{background:rgba(244,63,94,.12);color:#fecdd3}
.pd-link{font-size:13px;color:#7dd3fc;text-align:left;font-weight:550}.pd-link:hover{text-decoration:underline}
.pd-main{flex:1;min-width:0;display:flex;flex-direction:column}
.pd-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 22px;border-bottom:1px solid rgba(255,255,255,.07);flex-wrap:wrap}
.pd-crumbs{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden}
.pd-crumb{font-size:15px;padding:4px 7px;border-radius:7px;color:rgba(255,255,255,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.pd-crumb:hover:not(:disabled){background:rgba(255,255,255,.06);color:#fff}
.pd-crumb.is-here{color:#fff;font-weight:600;font-size:17px}
.pd-tools{display:flex;align-items:center;gap:8px}
.pd-search{display:flex;align-items:center;gap:7px;height:36px;padding:0 11px;border-radius:9px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07)}
.pd-search input{background:transparent;outline:none;font-size:13.5px;width:150px;color:#fff}
.pd-seg{display:flex;border-radius:9px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);padding:2px}
.pd-seg button{width:32px;height:30px;display:grid;place-items:center;border-radius:7px;color:rgba(255,255,255,.55)}
.pd-seg button.is-on{background:rgba(255,255,255,.1);color:#fff}
.pd-btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;border-radius:9px;font-size:13.5px;font-weight:550;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.08);color:#fff}
.pd-btn:hover:not(:disabled){background:rgba(255,255,255,.11)}
.pd-btn:disabled{opacity:.45;cursor:not-allowed}
.pd-btn.is-primary{background:#38bdf8;border-color:#38bdf8;color:#04121c}.pd-btn.is-primary:hover:not(:disabled){background:#7dd3fc}
.pd-btn.is-danger{background:#e11d48;border-color:#e11d48}.pd-btn.is-danger:hover{background:#f43f5e}
.pd-icon-btn{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;color:rgba(255,255,255,.6)}
.pd-icon-btn:hover{background:rgba(255,255,255,.08);color:#fff}
.pd-body{flex:1;overflow:auto;padding:8px 22px 120px}
.pd-table{display:flex;flex-direction:column}
.pd-row{display:grid;grid-template-columns:minmax(0,1fr) 110px 130px 40px;align-items:center;gap:12px;min-height:48px;padding:0 10px;border-radius:9px;font-size:14px;cursor:default}
.pd-row:not(.is-head):hover{background:rgba(255,255,255,.04)}
.pd-row.is-head{min-height:38px;font-size:12px;color:rgba(255,255,255,.42);font-weight:550;border-bottom:1px solid rgba(255,255,255,.06);border-radius:0;margin-bottom:4px}
.pd-col-size,.pd-col-date{color:rgba(255,255,255,.5);font-size:13px}
.pd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:12px;padding-top:10px}
.pd-tile{border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06);padding:10px;display:flex;flex-direction:column;gap:8px}
.pd-tile:hover{background:rgba(255,255,255,.06)}
.pd-tile-art{aspect-ratio:4/3;border-radius:8px;background:rgba(0,0,0,.25);display:grid;place-items:center}
.pd-input{background:rgba(0,0,0,.35);border:1px solid #38bdf8;border-radius:7px;padding:5px 8px;font-size:14px;color:#fff;outline:none}
.pd-menu{position:absolute;right:0;top:34px;z-index:20;min-width:180px;padding:5px;border-radius:11px;background:#171b24;border:1px solid rgba(255,255,255,.1);box-shadow:0 14px 40px rgba(0,0,0,.5)}
.pd-menu button{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:7px;font-size:13.5px;color:rgba(255,255,255,.85);text-align:left}
.pd-menu button:hover{background:rgba(255,255,255,.07)}
.pd-menu button.is-danger{color:#fda4af}
.pd-chip{font-size:11px;padding:2px 7px;border-radius:99px}.pd-chip.is-danger{background:rgba(244,63,94,.15);color:#fda4af}
.pd-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;padding:90px 20px;color:rgba(255,255,255,.55)}
.pd-empty h2{font-size:19px;font-weight:600;color:#fff;margin-top:6px}
.pd-empty p{max-width:420px;font-size:14px;line-height:1.55}
.pd-empty .pd-btn{margin-top:8px}
.pd-drop{position:fixed;inset:12px;z-index:60;border:2px dashed #38bdf8;border-radius:18px;background:rgba(8,47,73,.72);backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#e0f2fe;font-size:16px;pointer-events:none}
.pd-tray{position:fixed;right:20px;bottom:20px;z-index:50;width:340px;max-height:50vh;display:flex;flex-direction:column;border-radius:14px;background:#151922;border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden}
.pd-tray-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 10px 14px;font-size:13.5px;font-weight:600;border-bottom:1px solid rgba(255,255,255,.07)}
.pd-tray-list{overflow:auto;padding:6px}
.pd-tray-item{display:flex;flex-direction:column;gap:5px;padding:8px}
.pd-modal-back{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:16px}
.pd-modal{width:100%;max-width:440px;border-radius:16px;background:#151922;border:1px solid rgba(255,255,255,.1);padding:22px}
.pd-modal h3{font-size:17px;font-weight:600}
.pd-modal p{font-size:14px;color:rgba(255,255,255,.6);margin-top:8px;line-height:1.5}
.pd-move-list{margin-top:10px;max-height:280px;overflow:auto;border-radius:10px;background:rgba(0,0,0,.25);padding:4px}
.pd-move-item{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border-radius:8px;font-size:14px}
.pd-move-item:hover{background:rgba(255,255,255,.06)}
.pd-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:80;padding:10px 16px;border-radius:10px;background:#f1f5f9;color:#0b0d12;font-size:13.5px;font-weight:550;box-shadow:0 10px 30px rgba(0,0,0,.4)}
@media (max-width:760px){
  .pd-root{flex-direction:column}
  .pd-rail{width:auto;border-right:0;border-bottom:1px solid rgba(255,255,255,.07);padding:10px 12px;gap:8px}
  .pd-rail-nav{flex-direction:row;overflow-x:auto;gap:4px}
  .pd-rail-item{flex-shrink:0;padding:7px 11px}
  .pd-meter{margin-top:0;padding:8px 10px;gap:5px}
  .pd-top{padding:10px 16px}
  .pd-tools{width:100%}
  .pd-search{flex:1}.pd-search input{width:100%}
  .pd-hide-sm{display:none}
  .pd-body{padding:6px 16px 140px}
  .pd-row{grid-template-columns:minmax(0,1fr) 72px 36px}
  .pd-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .pd-tile-art{aspect-ratio:16/10}
  .pd-meter-extra{display:none}
  .pd-meter{flex-direction:row;flex-wrap:wrap;align-items:center;column-gap:10px}
  .pd-meter>.flex{flex:1 1 100%}
  .pd-meter-bar{flex:1 1 100%}
  .pd-col-date{display:none}
  .pd-tray{left:16px;right:16px;width:auto;bottom:16px}
  .pd-crumb{max-width:130px}
}
`;
