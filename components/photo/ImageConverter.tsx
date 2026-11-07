// Image Converter: HEIC → JPEG/PNG (and anything → JPEG/PNG/WebP) inside Photos and the image
// viewer, on the website, the Windows app and the Android app. Single file, batch, or pick a
// subset by click / shift-click / ctrl-click / drag-box. Conversion runs on this device through
// Crossover Image (services/crossover/imageConvert) — nothing is uploaded unless the user also
// chooses "Add to my Photos".

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Upload, FolderOpen, Check, Loader2, AlertTriangle, Download, Repeat, Trash2,
  CheckSquare, Square, Image as ImageIcon, FolderSearch, Images,
} from 'lucide-react';
import {
  IMAGE_TARGETS, CONVERTIBLE_ACCEPT, ImageTarget, canSaveBesideSource, convertImageBlob,
  isConvertibleFile, isHeicFile, saveBesideSource, zipResults,
} from '../../services/crossover/imageConvert';
import { crossoverHost } from '../../services/crossover/host';
import { saveBlob } from '../../services/crossover/save';
import { revealNative } from '../../services/crossover/nativeEngine';
import { isWindowsApp, pickWindowsFolder, readWindowsFileBytes, WindowsPickedFile } from '../../services/windowsBridgeService';

/** Anything the converter can read: a dropped/picked File, a local desktop file, or a URL. */
export interface ConvertSource {
  id: string;
  name: string;
  size?: number;
  type?: string;
  /** Desktop: absolute path, so output can go beside it. */
  path?: string;
  file?: File;
  url?: string;
}

export const sourceFromFile = (f: File): ConvertSource => ({
  id: `f:${f.name}:${f.size}:${f.lastModified}`, name: f.name, size: f.size, type: f.type, file: f,
});
export const sourceFromPicked = (p: WindowsPickedFile): ConvertSource => ({
  id: `p:${p.fullPath || p.url}`, name: p.name, size: p.size, path: p.fullPath || undefined, url: p.url,
});
export const sourceFromUrl = (url: string, name?: string): ConvertSource => ({
  id: `u:${url}`, name: name || decodeURIComponent(url.split('?')[0].split('/').pop() || 'image'), url,
});

async function readSource(s: ConvertSource): Promise<Blob> {
  if (s.file) return s.file;
  if (s.url) {
    try {
      const r = await fetch(s.url);
      if (r.ok) return await r.blob();
    } catch { /* fall back to the native read */ }
  }
  if (s.path && isWindowsApp()) {
    const bytes = await readWindowsFileBytes(s.path);
    if (bytes?.length) return new Blob([bytes as BlobPart]);
  }
  throw new Error(`Couldn't open ${s.name}.`);
}

type ItemState = 'idle' | 'working' | 'done' | 'error';
interface Item {
  src: ConvertSource;
  state: ItemState;
  error?: string;
  out?: { name: string; blob: Blob; savedPath?: string; width: number; height: number };
}

type OutputMode = 'beside' | 'zip' | 'files';
const SIZES: { label: string; value?: number }[] = [
  { label: 'Original' }, { label: '4096 px', value: 4096 }, { label: '2048 px', value: 2048 }, { label: '1080 px', value: 1080 },
];

const fmtBytes = (n?: number) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const PREF_KEY = 'plajah.imageConverter.v1';
const loadPrefs = (): { target?: ImageTarget; quality?: number; sizeIdx?: number } => {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
};

export interface ImageConverterProps {
  open: boolean;
  onClose: () => void;
  initialSources?: ConvertSource[];
  title?: string;
  /** Which of `initialSources` start selected (default: all). */
  preselect?: (s: ConvertSource) => boolean;
  /** Called with converted files when the user picks "Add to my Photos". */
  onAddToPhotos?: (files: File[]) => Promise<void> | void;
}

export const ImageConverter: React.FC<ImageConverterProps> = ({ open, onClose, initialSources, title, preselect, onAddToPhotos }) => {
  const host = crossoverHost();
  const prefs = useMemo(loadPrefs, []);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<ImageTarget>(prefs.target || 'jpg');
  const [quality, setQuality] = useState(prefs.quality ?? 0.9);
  const [sizeIdx, setSizeIdx] = useState(prefs.sizeIdx ?? 0);
  const besideOk = canSaveBesideSource();
  const [output, setOutput] = useState<OutputMode>('files');
  const [addToPhotos, setAddToPhotos] = useState(false);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const abortRef = useRef<{ aborted: boolean } | null>(null);
  const anchorRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ target, quality, sizeIdx })); } catch { /* private mode */ }
  }, [target, quality, sizeIdx]);

  const addSources = useCallback((srcs: ConvertSource[], pick?: (s: ConvertSource) => boolean) => {
    const ok = srcs.filter((s) => isConvertibleFile({ name: s.name, type: s.type }));
    const skipped = srcs.length - ok.length;
    setItems((prev) => {
      const have = new Set(prev.map((i) => i.src.id));
      const fresh = ok.filter((s) => !have.has(s.id)).map((src) => ({ src, state: 'idle' as ItemState }));
      if (fresh.length) setSelected((sel) => { const n = new Set(sel); fresh.forEach((f) => (!pick || pick(f.src)) && n.add(f.src.id)); return n; });
      return [...prev, ...fresh];
    });
    setNote(skipped ? `${skipped} file${skipped > 1 ? 's' : ''} skipped — not an image.` : null);
  }, []);

  // Reset on open with the caller's files.
  useEffect(() => {
    if (!open) return;
    setItems([]); setSelected(new Set()); setNote(null);
    if (initialSources?.length) addSources(initialSources, preselect);
    setOutput(besideOk && initialSources?.some((s) => s.path) ? 'beside' : 'files');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSources]);

  // Thumbnails: direct for browser-readable images, decoded one at a time for HEIC.
  const thumbBusy = useRef(false);
  const thumbsRef = useRef(thumbs);
  thumbsRef.current = thumbs;
  useEffect(() => {
    if (!open || thumbBusy.current) return;
    const need = items.find((i) => !(i.src.id in thumbsRef.current));
    if (!need) return;
    const { src } = need;
    if (!isHeicFile({ name: src.name, type: src.type })) {
      const url = src.file ? URL.createObjectURL(src.file) : src.url || '';
      setThumbs((t) => ({ ...t, [src.id]: url }));
      return;
    }
    thumbBusy.current = true;
    (async () => {
      let url = '';
      try {
        const r = await convertImageBlob(await readSource(src), src.name, { target: 'jpg', quality: 0.7, maxEdge: 320 });
        url = URL.createObjectURL(r.blob);
      } catch { /* tile shows a placeholder */ }
      thumbBusy.current = false;
      setThumbs((t) => ({ ...t, [src.id]: url }));
    })();
  }, [open, items, thumbs]);

  // Revoke blob thumbnails when the dialog closes.
  useEffect(() => {
    if (open) return;
    Object.values(thumbsRef.current).forEach((u) => u.startsWith('blob:') && URL.revokeObjectURL(u));
    setThumbs({});
  }, [open]);

  // ── Selection: click, shift-range, ctrl-toggle, drag-box ────────────────────
  const order = items.map((i) => i.src.id);
  const onTileClick = (id: string, e: React.MouseEvent) => {
    setSelected((sel) => {
      const n = new Set(sel);
      if (e.shiftKey && anchorRef.current) {
        const a = order.indexOf(anchorRef.current), b = order.indexOf(id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        if (!(e.ctrlKey || e.metaKey)) n.clear();
        order.slice(lo, hi + 1).forEach((x) => n.add(x));
      } else if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    if (!e.shiftKey) anchorRef.current = id;
  };

  const gridRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef(new Map<string, HTMLElement>());
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const boxBase = useRef<Set<string>>(new Set());

  const onGridPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || running) return;
    if ((e.target as HTMLElement).closest('[data-tile]')) return; // tiles handle their own clicks
    const g = gridRef.current!;
    const r = g.getBoundingClientRect();
    const x = e.clientX - r.left + g.scrollLeft, y = e.clientY - r.top + g.scrollTop;
    boxBase.current = e.ctrlKey || e.metaKey || e.shiftKey ? new Set(selected) : new Set();
    setBox({ x0: x, y0: y, x1: x, y1: y });
    g.setPointerCapture(e.pointerId);
  };
  const onGridPointerMove = (e: React.PointerEvent) => {
    if (!box) return;
    const g = gridRef.current!;
    const r = g.getBoundingClientRect();
    const x1 = e.clientX - r.left + g.scrollLeft, y1 = e.clientY - r.top + g.scrollTop;
    setBox((b) => (b ? { ...b, x1, y1 } : b));
    // Rect in viewport coords for hit-testing tiles.
    const vx0 = Math.min(box.x0, x1) - g.scrollLeft + r.left, vx1 = Math.max(box.x0, x1) - g.scrollLeft + r.left;
    const vy0 = Math.min(box.y0, y1) - g.scrollTop + r.top, vy1 = Math.max(box.y0, y1) - g.scrollTop + r.top;
    const n = new Set(boxBase.current);
    tileRefs.current.forEach((el, id) => {
      const t = el.getBoundingClientRect();
      if (t.right > vx0 && t.left < vx1 && t.bottom > vy0 && t.top < vy1) n.add(id);
    });
    setSelected(n);
    // Auto-scroll near the edges.
    if (e.clientY > r.bottom - 24) g.scrollTop += 12; else if (e.clientY < r.top + 24) g.scrollTop -= 12;
  };
  const endBox = (e: React.PointerEvent) => {
    if (!box) return;
    if (Math.abs(box.x1 - box.x0) < 4 && Math.abs(box.y1 - box.y0) < 4 && !boxBase.current.size) setSelected(new Set());
    setBox(null);
    try { gridRef.current?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };

  // ── Adding files ────────────────────────────────────────────────────────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) addSources(files.map(sourceFromFile));
  };
  const addFolderDesktop = async () => {
    const res = await pickWindowsFolder();
    if (!res || res.cancelled || !res.files) return;
    addSources(res.files.filter((f) => (f.mediaKind || f.kind) !== 'VIDEO' && (f.mediaKind || f.kind) !== 'AUDIO').map(sourceFromPicked));
  };
  const removeSelected = () => {
    setItems((prev) => prev.filter((i) => !selected.has(i.src.id)));
    setSelected(new Set());
  };

  // ── Convert ─────────────────────────────────────────────────────────────────
  const queue = items.filter((i) => selected.has(i.src.id));
  const targetMeta = IMAGE_TARGETS.find((t) => t.id === target)!;

  const patch = (id: string, p: Partial<Item>) => setItems((prev) => prev.map((i) => (i.src.id === id ? { ...i, ...p } : i)));

  const run = async () => {
    if (!queue.length || running) return;
    const job = { aborted: false };
    abortRef.current = job;
    setRunning(true); setNote(null);
    const opts = { target, quality, maxEdge: SIZES[sizeIdx]?.value };
    const done: { name: string; blob: Blob }[] = [];
    let failed = 0;
    const work = [...queue];
    const concurrency = host === 'android' ? 1 : 2; // HEIC decode is memory-heavy on phones
    const worker = async () => {
      while (work.length && !job.aborted) {
        const it = work.shift()!;
        patch(it.src.id, { state: 'working', error: undefined });
        try {
          const r = await convertImageBlob(await readSource(it.src), it.src.name, opts);
          let savedPath: string | undefined;
          if (output === 'beside' && it.src.path) savedPath = await saveBesideSource(it.src.path, r.name, r.blob);
          else if (output === 'files' || (output === 'zip' && queue.length === 1)) savedPath = (await saveBlob(r.name, r.blob, r.blob.type)).path;
          done.push({ name: r.name, blob: r.blob });
          patch(it.src.id, { state: 'done', out: { ...r, savedPath } });
        } catch (e) {
          failed++;
          patch(it.src.id, { state: 'error', error: (e as Error)?.message || 'Conversion failed.' });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, work.length) }, worker));

    try {
      if (output === 'zip' && done.length > 1 && !job.aborted) {
        const stamp = new Date().toISOString().slice(0, 10);
        await saveBlob(`Converted-${targetMeta.label}-${stamp}.zip`, await zipResults(done), 'application/zip');
      }
      if (addToPhotos && onAddToPhotos && done.length && !job.aborted) {
        await onAddToPhotos(done.map((d) => new File([d.blob], d.name, { type: d.blob.type })));
      }
    } catch (e) {
      setNote((e as Error)?.message || 'Saving failed.');
    }

    setRunning(false);
    abortRef.current = null;
    const where = output === 'beside' ? 'next to the originals' : output === 'zip' && done.length > 1 ? 'in one zip' : host === 'android' ? 'to Downloads/Crossover' : '';
    if (job.aborted) setNote(`Stopped — ${done.length} converted.`);
    else setNote(`${done.length} converted to ${targetMeta.label}${where ? ` ${where}` : ''}${failed ? ` · ${failed} failed` : ''}${addToPhotos && done.length ? ' · added to your Photos' : ''}.`);
    // Done items drop out of the selection so a second run only picks up what's left.
    setSelected((sel) => { const n = new Set(sel); queue.forEach((q) => n.delete(q.src.id)); return n; });
  };

  // Esc closes (when idle).
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running) { e.stopPropagation(); onClose(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !(e.target as HTMLElement)?.closest('input,textarea')) {
        e.preventDefault(); setSelected(new Set(items.map((i) => i.src.id)));
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [open, running, onClose, items]);

  if (!open) return null;

  const heicCount = items.filter((i) => isHeicFile({ name: i.src.name, type: i.src.type })).length;
  const allSelected = items.length > 0 && selected.size === items.length;
  const single = items.length === 1;

  return (
    <div className="fixed inset-0 z-[12000] flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => !running && onClose()}>
      <div
        className="relative flex flex-col w-full sm:w-[min(980px,94vw)] h-full sm:h-[min(760px,90vh)] sm:rounded-2xl border overflow-hidden text-white"
        style={{ background: 'var(--pj-surface-1, #121318)', borderColor: 'var(--pj-border, rgba(255,255,255,0.08))' }}
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
        onDrop={onDrop}
      >
        {/* Header */}
        <header className="flex items-center gap-3 px-4 sm:px-5 h-14 border-b shrink-0" style={{ borderColor: 'var(--pj-border, rgba(255,255,255,0.08))' }}>
          <Repeat size={18} className="text-white/70" />
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight">{title || 'Convert images'}</h2>
            <p className="text-[11px] text-white/45 leading-tight truncate">HEIC, PNG, JPEG, WebP and more · converted on this device</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button className="pj-btn pj-btn--sm pj-btn--secondary" onClick={() => inputRef.current?.click()} disabled={running}>
              <Upload size={14} /> <span className="hidden sm:inline">Add files</span>
            </button>
            {isWindowsApp() && (
              <button className="pj-btn pj-btn--sm pj-btn--secondary" onClick={addFolderDesktop} disabled={running}>
                <FolderOpen size={14} /> <span className="hidden sm:inline">Add folder</span>
              </button>
            )}
            <button className="pj-btn pj-btn--sm pj-btn--ghost" onClick={onClose} disabled={running} aria-label="Close"><X size={16} /></button>
          </div>
          <input
            ref={inputRef} type="file" multiple accept={CONVERTIBLE_ACCEPT} className="hidden"
            onChange={(e) => { addSources(Array.from(e.target.files || []).map(sourceFromFile)); e.target.value = ''; }}
          />
        </header>

        {/* Selection bar */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-2 text-[12px] text-white/60 border-b shrink-0" style={{ borderColor: 'var(--pj-border, rgba(255,255,255,0.06))' }}>
            <button className="inline-flex items-center gap-1.5 hover:text-white" onClick={() => setSelected(allSelected ? new Set() : new Set(order))} disabled={running}>
              {allSelected ? <CheckSquare size={14} /> : <Square size={14} />} {allSelected ? 'Select none' : 'Select all'}
            </button>
            {heicCount > 0 && heicCount < items.length && (
              <button className="hover:text-white" disabled={running}
                onClick={() => setSelected(new Set(items.filter((i) => isHeicFile({ name: i.src.name, type: i.src.type })).map((i) => i.src.id)))}>
                HEIC only ({heicCount})
              </button>
            )}
            <span className="text-white/35">·</span>
            <span>{selected.size} of {items.length} selected</span>
            <span className="hidden md:inline text-white/30">— click, shift-click, ctrl-click or drag a box</span>
            {selected.size > 0 && !running && (
              <button className="ml-auto inline-flex items-center gap-1 hover:text-red-300" onClick={removeSelected}><Trash2 size={13} /> Remove</button>
            )}
          </div>
        )}

        {/* Grid / drop zone */}
        <div
          ref={gridRef}
          className="relative flex-1 overflow-y-auto p-4 sm:p-5 select-none"
          onPointerDown={onGridPointerDown}
          onPointerMove={onGridPointerMove}
          onPointerUp={endBox}
          onPointerCancel={endBox}
        >
          {items.length === 0 ? (
            <button
              className="w-full h-full min-h-[260px] flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-white/55 hover:text-white/80 transition-colors"
              style={{ borderColor: dragOver ? 'var(--pj-accent, #8b5cf6)' : 'rgba(255,255,255,0.12)' }}
              onClick={() => inputRef.current?.click()}
            >
              <Images size={36} />
              <span className="text-[15px] font-medium">Drop photos here, or tap to choose</span>
              <span className="text-[12px] text-white/40">iPhone HEIC → JPEG or PNG · one file or a whole batch</span>
            </button>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${single ? 260 : 132}px, 1fr))` }}>
              {items.map((it) => {
                const id = it.src.id;
                const sel = selected.has(id);
                const thumb = thumbs[id];
                return (
                  <div
                    key={id}
                    data-tile
                    ref={(el) => { if (el) tileRefs.current.set(id, el); else tileRefs.current.delete(id); }}
                    onClick={(e) => !running && onTileClick(id, e)}
                    className="group relative rounded-xl overflow-hidden border cursor-pointer transition-shadow"
                    style={{
                      borderColor: sel ? 'var(--pj-accent, #8b5cf6)' : 'rgba(255,255,255,0.08)',
                      boxShadow: sel ? '0 0 0 2px var(--pj-accent, #8b5cf6)' : undefined,
                      background: 'rgba(255,255,255,0.03)',
                    }}
                    title={it.error || it.out?.savedPath || it.src.name}
                  >
                    <div className="aspect-square flex items-center justify-center bg-black/30">
                      {thumb ? (
                        <img src={thumb} alt="" draggable={false} className="w-full h-full object-cover" onError={(e) => ((e.currentTarget.style.display = 'none'))} />
                      ) : thumb === '' ? (
                        <ImageIcon size={28} className="text-white/25" />
                      ) : (
                        <Loader2 size={20} className="animate-spin text-white/30" />
                      )}
                    </div>
                    {/* Checkbox */}
                    <span className={`absolute top-2 left-2 w-5 h-5 rounded-md flex items-center justify-center border ${sel ? 'bg-[var(--pj-accent,#8b5cf6)] border-transparent' : 'bg-black/50 border-white/40 opacity-70 group-hover:opacity-100'}`}>
                      {sel && <Check size={13} strokeWidth={3} />}
                    </span>
                    {/* State */}
                    {it.state !== 'idle' && (
                      <span className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center ${it.state === 'done' ? 'bg-emerald-500' : it.state === 'error' ? 'bg-red-500' : 'bg-black/60'}`}>
                        {it.state === 'working' && <Loader2 size={14} className="animate-spin" />}
                        {it.state === 'done' && <Check size={14} strokeWidth={3} />}
                        {it.state === 'error' && <AlertTriangle size={13} />}
                      </span>
                    )}
                    <div className="px-2 py-1.5">
                      <div className="text-[12px] truncate">{it.state === 'done' && it.out ? it.out.name : it.src.name}</div>
                      <div className="text-[10.5px] text-white/40 truncate">
                        {it.state === 'error' ? <span className="text-red-300">{it.error}</span>
                          : it.out ? `${it.out.width}×${it.out.height} · ${fmtBytes(it.out.blob.size)}`
                          : `${(it.src.name.split('.').pop() || '').toUpperCase()}${it.src.size ? ` · ${fmtBytes(it.src.size)}` : ''}`}
                      </div>
                    </div>
                    {it.state === 'done' && it.out && (
                      <div className="absolute inset-x-0 bottom-12 flex justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {it.out.savedPath && host === 'desktop' ? (
                          <button className="pj-btn pj-btn--sm pj-btn--secondary" onClick={(e) => { e.stopPropagation(); revealNative(it.out!.savedPath!); }}>
                            <FolderSearch size={13} /> Show
                          </button>
                        ) : (
                          <button className="pj-btn pj-btn--sm pj-btn--secondary" onClick={(e) => { e.stopPropagation(); saveBlob(it.out!.name, it.out!.blob); }}>
                            <Download size={13} /> Save
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {box && (
            <div className="absolute pointer-events-none border rounded-sm"
              style={{
                left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1),
                width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0),
                borderColor: 'var(--pj-accent, #8b5cf6)', background: 'color-mix(in srgb, var(--pj-accent, #8b5cf6) 18%, transparent)',
              }} />
          )}
          {dragOver && items.length > 0 && (
            <div className="absolute inset-2 rounded-xl border-2 border-dashed pointer-events-none flex items-center justify-center text-[15px] font-medium bg-black/50"
              style={{ borderColor: 'var(--pj-accent, #8b5cf6)' }}>Drop to add</div>
          )}
        </div>

        {/* Settings + action */}
        <footer className="shrink-0 border-t px-4 sm:px-5 py-3 flex flex-col gap-3" style={{ borderColor: 'var(--pj-border, rgba(255,255,255,0.08))' }}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-white/40">To</span>
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                {IMAGE_TARGETS.map((t) => (
                  <button key={t.id} title={t.note} disabled={running}
                    className={`px-3 h-8 text-[12.5px] font-medium ${target === t.id ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'}`}
                    onClick={() => setTarget(t.id)}>{t.label}</button>
                ))}
              </div>
            </div>
            {targetMeta.lossy && (
              <label className="flex items-center gap-2 text-[12px] text-white/60">
                Quality
                <input type="range" min={0.5} max={1} step={0.01} value={quality} disabled={running}
                  onChange={(e) => setQuality(Number(e.target.value))} className="w-24 accent-[var(--pj-accent,#8b5cf6)]" />
                <span className="w-8 tabular-nums">{Math.round(quality * 100)}</span>
              </label>
            )}
            <label className="flex items-center gap-2 text-[12px] text-white/60">
              Size
              <select value={sizeIdx} disabled={running} onChange={(e) => setSizeIdx(Number(e.target.value))}
                className="h-8 rounded-md bg-white/5 border border-white/10 px-2 text-white text-[12px]">
                {SIZES.map((s, i) => <option key={s.label} value={i} className="bg-neutral-900">{s.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[12px] text-white/60">
              Save
              <select value={output} disabled={running} onChange={(e) => setOutput(e.target.value as OutputMode)}
                className="h-8 rounded-md bg-white/5 border border-white/10 px-2 text-white text-[12px]">
                {besideOk && <option value="beside" className="bg-neutral-900">Next to originals</option>}
                <option value="files" className="bg-neutral-900">{host === 'android' ? 'To Downloads' : 'As separate files'}</option>
                <option value="zip" className="bg-neutral-900">As one zip</option>
              </select>
            </label>
            {onAddToPhotos && (
              <label className="flex items-center gap-2 text-[12px] text-white/60 cursor-pointer">
                <input type="checkbox" checked={addToPhotos} disabled={running} onChange={(e) => setAddToPhotos(e.target.checked)} className="accent-[var(--pj-accent,#8b5cf6)]" />
                Add to my Photos
              </label>
            )}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[12px] text-white/50 min-w-0 truncate">
              {note || (target === 'jpg' ? 'JPEG has no transparency — clear areas turn white. Location data is removed.' : 'Location data is removed from converted copies.')}
            </p>
            <div className="ml-auto flex items-center gap-2">
              {running && <button className="pj-btn pj-btn--sm pj-btn--ghost" onClick={() => { if (abortRef.current) abortRef.current.aborted = true; }}>Stop</button>}
              <button className="pj-btn pj-btn--primary" disabled={!queue.length || running} onClick={run}>
                {running ? <Loader2 size={15} className="animate-spin" /> : <Repeat size={15} />}
                {running ? 'Converting…' : queue.length <= 1 ? `Convert to ${targetMeta.label}` : `Convert ${queue.length} to ${targetMeta.label}`}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ImageConverter;
