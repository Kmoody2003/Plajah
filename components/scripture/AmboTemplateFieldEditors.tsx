// AmboTemplateFieldEditors — the per-kind field editors for Ambo's slide-template
// gallery. Every editor reads and writes the template's plain-string field value
// (FieldDef.kind in services/ambo/slideTemplates/types.ts):
//
//   text / default  string (textarea when `multiline`)
//   image           one URL
//   images          URLs, one per line, in display order
//   video / audio   one URL (trim lives in sibling `inSec` / `outSec` fields)
//   number          the number as text
//   select          one of `options`
//   toggle          "true" | "false"
//   data            "Label, value" lines — or "Label, value, value2" for a 2nd series
//   visualizer      a generator mode ("STUDIO_AURORA", "MILKDROP:<preset>") or
//                   "SHADER:<library name>"; "" = none (see AmboTemplateVisualizerPicker)
//
// Where media comes from:
//   · Library — the same Plajah catalogues Ambo's library tabs read: Photos
//     (mine + Plajah), Reello videos (mine + platform), Chora audio (personal
//     locker, public albums, my Chora playlists). Loaded lazily, cached 5 min.
//   · Upload  — local files go through uploadTelaAsset (services/telaAssets):
//     signed-in users get a durable Firebase Storage URL under users/{uid}/tela/,
//     usable after reload and on every output machine. Guests (or a failed
//     upload) fall back to a session-only blob: URL, which the editor flags.
//   · URL     — paste any link.
//   · Recent  — durable URLs picked/uploaded here before (this browser only).
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon, Images, Film, Music, BarChart3, Sparkles, Hash, List as ListIcon, ToggleLeft,
  Upload, Link2, Library, X, Check, Search, Loader2, AlertTriangle, ChevronLeft, ChevronRight,
  Table2, FileText, Plus, Trash2, Scissors,
} from 'lucide-react';
import type { FieldDef, FieldKind } from '../../services/ambo/slideTemplates/types';

const LILAC = '#D0BCFF', CYAN = '#00DAF3', WARN = '#FFB547';
export const fieldBox: React.CSSProperties = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#fff' };
const chipBtn = 'h-6 px-2 rounded-md text-[10px] font-bold inline-flex items-center gap-1 bg-white/5 hover:bg-white/10 text-white/75 disabled:opacity-40';
const labelCls = 'block text-[9.5px] font-extrabold uppercase tracking-wider text-white/40 mb-1';

// ── Value helpers (exported for tests / other surfaces) ─────────────────────

export const splitLines = (v: string): string[] => (v || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
export const joinLines = (a: string[]): string => a.join('\n');
export const isSessionOnlyUrl = (u: string): boolean => /^blob:/i.test(u || '');

export interface DataRow { label: string; v1: string; v2: string }
const numLike = (s: string) => /^[-+]?[$€£¥]?\s*[-+]?\d[\d,]*(\.\d+)?\s*%?$|^[-+]?\.\d+%?$/.test(s.trim());
const cleanNum = (s: string) => s.trim().replace(/^[$€£¥]\s*/, '').replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/%$/, '');

/** "Label, value[, value2]" lines → rows. Labels may themselves contain commas. */
export function parseDataText(text: string): DataRow[] {
  return (text || '').split(/\r?\n/).filter(l => l.trim()).map(line => {
    const parts = line.split(',').map(s => s.trim());
    if (parts.length >= 3 && numLike(parts[parts.length - 1]) && numLike(parts[parts.length - 2]))
      return { label: parts.slice(0, -2).join(', '), v1: parts[parts.length - 2], v2: parts[parts.length - 1] };
    if (parts.length >= 2) return { label: parts.slice(0, -1).join(', '), v1: parts[parts.length - 1], v2: '' };
    return { label: line.trim(), v1: '', v2: '' };
  });
}

export function serializeDataRows(rows: DataRow[]): string {
  return rows
    .filter(r => r.label.trim() || r.v1.trim() || r.v2.trim())
    .map(r => [r.label.trim(), r.v1.trim(), ...(r.v2.trim() ? [r.v2.trim()] : [])].join(', '))
    .join('\n');
}

/** Spreadsheet paste (TSV, or CSV with quotes) → rows; null when it is not a table. */
export function parseTabular(text: string): DataRow[] | null {
  const lines = (text || '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return null;
  const tab = lines.some(l => l.includes('\t'));
  const splitCsv = (l: string) => {
    const out: string[] = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out.map(s => s.trim());
  };
  const cells = lines.map(l => (tab ? l.split('\t').map(s => s.trim()) : splitCsv(l)));
  if (!cells.some(c => c.length >= 2)) return null;
  // A header row ("Month | Attendance") has a non-numeric value column — skip it.
  const body = cells.length > 1 && cells[0][1] !== undefined && !numLike(cells[0][1]) && numLike(cells[1][1] || '') ? cells.slice(1) : cells;
  return body.map(c => ({ label: c[0] || '', v1: c[1] !== undefined && numLike(c[1]) ? cleanNum(c[1]) : (c[1] || ''), v2: c[2] !== undefined && numLike(c[2]) ? cleanNum(c[2]) : (c[2] || '') }));
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec) || sec < 0) return '';
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** A readable name for a stored URL (recent pick → filename → host). */
export function nameForUrl(u: string): string {
  const hit = readRecent().find(r => r.src === u);
  if (hit) return hit.name;
  if (isSessionOnlyUrl(u)) return 'Local file (this session)';
  try {
    const url = new URL(u);
    const path = decodeURIComponent(url.pathname).split('/').filter(Boolean).pop() || url.hostname;
    return path.replace(/^img_\d+_[a-z0-9]+_/, '');
  } catch { return u.slice(0, 60); }
}

// ── Recents (per-browser convenience — the slide itself holds the URL) ───────

export type MediaKind = 'image' | 'video' | 'audio';
export interface PickedMedia { src: string; name: string; thumb?: string; duration?: number }
interface RecentRow extends PickedMedia { kind: MediaKind; at: number }
const RECENT_KEY = 'ambo_tpl_media_recent_v1';
function readRecent(): RecentRow[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function rememberRecent(kind: MediaKind, items: PickedMedia[]) {
  const durable = items.filter(i => i.src && !isSessionOnlyUrl(i.src) && !/^data:/i.test(i.src));
  if (!durable.length) return;
  try {
    const now = Date.now();
    const rows = [...durable.map((i, n) => ({ ...i, kind, at: now - n })), ...readRecent().filter(r => !durable.some(d => d.src === r.src))].slice(0, 60);
    localStorage.setItem(RECENT_KEY, JSON.stringify(rows));
  } catch { /* storage blocked */ }
}

// ── Local files → durable URL ────────────────────────────────────────────────

const EXT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg', aif: 'audio/aiff', aiff: 'audio/aiff',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml', bmp: 'image/bmp',
};
export function acceptFor(kind: MediaKind): string { return kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : 'audio/*'; }
function fileMatches(kind: MediaKind, f: File): boolean {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const t = f.type || EXT_TYPES[ext] || '';
  return t.startsWith(kind + '/');
}

/**
 * Persist a local file for a slide. Signed in → Firebase Storage (durable URL).
 * Otherwise / on failure → session-only blob: URL (flagged to the operator).
 */
export async function persistLocalFile(file: File, onProgress?: (pct: number) => void): Promise<PickedMedia & { sessionOnly: boolean; error?: string }> {
  const name = file.name.replace(/\.[^.]+$/, '');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  // Storage rules only admit image/audio/video types — never send an empty type.
  const typed = !file.type && EXT_TYPES[ext] ? new File([file], file.name, { type: EXT_TYPES[ext] }) : file;
  try {
    const { uploadTelaAsset } = await import('../../services/telaAssets');
    const res = await uploadTelaAsset(typed, onProgress);
    return { src: res.src, name, sessionOnly: res.sessionOnly };
  } catch (e: any) {
    return { src: URL.createObjectURL(typed), name, sessionOnly: true, error: e?.code || e?.message || 'Upload failed' };
  }
}

// ── Plajah catalogues (Photos / Reello / Chora) ──────────────────────────────

interface CatalogItem extends PickedMedia { id: string; sub?: string; group: string }
const catalogCache: Partial<Record<MediaKind, { items: CatalogItem[]; ts: number }>> = {};
const durSec = (d: unknown): number | undefined => {
  if (typeof d === 'number' && isFinite(d) && d > 0) return d;
  if (typeof d === 'string') { const m = d.match(/^(\d+):(\d{2})(?::(\d{2}))?$/); if (m) return m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]; }
  return undefined;
};

async function loadCatalog(kind: MediaKind): Promise<CatalogItem[]> {
  const hit = catalogCache[kind];
  if (hit && Date.now() - hit.ts < 5 * 60_000) return hit.items;
  const be = await import('../../services/backendService');
  const uid = be.auth?.currentUser?.uid;
  const out: CatalogItem[] = [];
  const seen = new Set<string>();
  const push = (i: CatalogItem) => { if (!i.src || seen.has(i.src)) return; seen.add(i.src); out.push(i); };
  if (kind === 'image') {
    const [mine, all] = await Promise.all([uid ? be.fetchUserPhotos(uid).catch(() => []) : [], be.fetchGlobalPhotos(false).catch(() => [])]);
    for (const p of mine || []) push({ id: `p_${p.id}`, src: p.url, thumb: p.thumbUrl || p.url, name: p.title || p.description || 'Photo', group: 'My Photos' });
    for (const p of all || []) push({ id: `p_${p.id}`, src: p.url, thumb: p.thumbUrl || p.url, name: p.title || p.description || 'Photo', group: 'Plajah Photos' });
  } else if (kind === 'video') {
    const [mine, all] = await Promise.all([uid ? be.fetchUserVideos(uid).catch(() => []) : [], be.fetchAllVideos().catch(() => [])]);
    const add = (v: any, group: string) => { if (v?.url && !v.embedUrl) push({ id: `v_${v.id}`, src: v.url, thumb: v.thumbnailUrl || v.coverImageUrl, name: v.title || 'Video', duration: durSec(v.duration), group }); };
    for (const v of mine || []) add(v, 'My Videos');
    for (const v of all || []) add(v, 'Reello');
  } else {
    const [locker, albums, playlists] = await Promise.all([
      be.fetchPersonalTracks().catch(() => []), be.fetchAllPublicAlbums().catch(() => []), be.fetchPersonalPlaylists().catch(() => []),
    ]);
    const byId = new Map<string, CatalogItem>();
    for (const t of (locker || []) as any[]) {
      const it: CatalogItem = { id: `t_${t.id}`, src: t.url, thumb: t.coverImage, name: t.title || 'Track', sub: t.artist || 'My Music Locker', duration: durSec(t.duration), group: 'My Locker' };
      byId.set(t.id, it); push(it);
    }
    for (const al of (albums || []) as any[]) for (const t of al.tracks || []) {
      const it: CatalogItem = { id: `t_${t.id}`, src: t.url, thumb: al.coverImage, name: t.title || 'Track', sub: t.artist || al.artist || al.title, duration: durSec(t.duration), group: 'Chora Artists' };
      byId.set(t.id, it); push(it);
    }
    // Playlists list their songs again under their own group (same URL is fine there).
    for (const p of (playlists || []) as any[]) {
      const group = `Playlist · ${p.title || p.name || 'Untitled'}`;
      const tracks: any[] = Array.isArray(p.tracks) && p.tracks.length ? p.tracks : (p.trackIds || []).map((id: string) => byId.get(id)).filter(Boolean);
      for (const t of tracks) {
        const src = t.url || t.src; if (!src) continue;
        out.push({ id: `pl_${p.id}_${t.id}`, src, thumb: t.coverImage || t.thumb || p.coverImage, name: t.title || t.name || 'Track', sub: t.artist || t.sub, duration: durSec(t.duration), group });
      }
    }
  }
  // React keys: the same song can sit in a playlist twice.
  const ids = new Map<string, number>();
  for (const it of out) { const k = ids.get(it.id) || 0; ids.set(it.id, k + 1); if (k) it.id = `${it.id}~${k}`; }
  catalogCache[kind] = { items: out, ts: Date.now() };
  return out;
}

// ── Media metadata probe ─────────────────────────────────────────────────────

export function useMediaDuration(src: string, kind: 'video' | 'audio'): { duration: number | null; error: boolean } {
  const [st, setSt] = useState<{ duration: number | null; error: boolean }>({ duration: null, error: false });
  useEffect(() => {
    setSt({ duration: null, error: false });
    if (!src || typeof document === 'undefined') return;
    const el = document.createElement(kind);
    el.preload = 'metadata'; el.muted = true;
    let alive = true;
    el.onloadedmetadata = () => { if (alive) setSt({ duration: isFinite(el.duration) ? el.duration : null, error: false }); };
    el.onerror = () => { if (alive) setSt({ duration: null, error: true }); };
    el.src = src;
    return () => { alive = false; el.removeAttribute('src'); try { el.load(); } catch { /* */ } };
  }, [src, kind]);
  return st;
}

// ── Library picker (inline panel) ────────────────────────────────────────────

const MediaPicker: React.FC<{ kind: MediaKind; multi?: boolean; onPick: (items: PickedMedia[]) => void; onClose: () => void }> = ({ kind, multi, onPick, onClose }) => {
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [err, setErr] = useState('');
  const [group, setGroup] = useState('All');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const recent = useMemo(() => readRecent().filter(r => r.kind === kind).map(r => ({ ...r, id: `r_${r.src}`, group: 'Recent' } as CatalogItem)), [kind]);
  useEffect(() => {
    let alive = true;
    loadCatalog(kind).then(x => { if (alive) setItems(x); }).catch(e => { if (alive) { setItems([]); setErr(String(e?.message || e)); } });
    return () => { alive = false; };
  }, [kind]);
  const all = useMemo(() => [...recent, ...(items || [])], [recent, items]);
  const groups = useMemo(() => ['All', ...Array.from(new Set(all.map(i => i.group)))], [all]);
  const needle = q.trim().toLowerCase();
  const shown = all.filter(i => (group === 'All' || i.group === group) && (!needle || `${i.name} ${i.sub || ''}`.toLowerCase().includes(needle))).slice(0, 240);
  const toggle = (it: CatalogItem) => {
    if (!multi) { onPick([it]); return; }
    setSel(s => (s.includes(it.id) ? s.filter(x => x !== it.id) : [...s, it.id]));
  };
  const confirm = () => { const byId = new Map(all.map(i => [i.id, i])); onPick(sel.map(id => byId.get(id)!).filter(Boolean)); };
  const sourceName = kind === 'image' ? 'Photos' : kind === 'video' ? 'Reello videos' : 'Chora music';
  return (
    <div data-testid={`picker-${kind}`} className="mt-1.5 rounded-lg p-2" style={{ background: 'rgba(8,6,16,.85)', border: '1px solid rgba(208,188,255,.22)' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Library size={12} style={{ color: LILAC }} />
        <span className="text-[10.5px] font-bold">{sourceName}</span>
        <div className="flex-1 flex items-center gap-1 rounded-md px-1.5 h-6" style={fieldBox}>
          <Search size={11} className="text-white/40" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="flex-1 bg-transparent outline-none text-[10.5px] min-w-0" />
        </div>
        {multi && <button className={chipBtn} disabled={!sel.length} onClick={confirm} style={sel.length ? { background: 'rgba(0,218,243,.18)', color: CYAN } : undefined}><Check size={11} />Add {sel.length || ''}</button>}
        <button className="w-6 h-6 grid place-items-center rounded-md hover:bg-white/10" onClick={onClose} aria-label="Close picker"><X size={12} /></button>
      </div>
      <div className="flex gap-1 flex-wrap mb-1.5">
        {groups.map(g => (
          <button key={g} onClick={() => setGroup(g)} className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold"
            style={{ color: group === g ? '#0b0a12' : 'rgba(255,255,255,.55)', background: group === g ? LILAC : 'rgba(255,255,255,.05)' }}>{g}</button>
        ))}
      </div>
      <div className="max-h-[220px] overflow-y-auto">
        {items === null && <div className="text-[10px] text-white/45 flex items-center gap-1.5 p-2"><Loader2 size={12} className="animate-spin" />Loading {sourceName}…</div>}
        {items !== null && !shown.length && <div className="text-[10px] text-white/40 p-2">{err ? `Could not load ${sourceName}.` : `Nothing here${needle ? ' matching that' : ' yet'} — upload a file or paste a URL instead.`}</div>}
        {kind === 'audio' ? (
          <div className="space-y-0.5">
            {shown.map(it => {
              const on = sel.includes(it.id);
              return (
                <button key={it.id} data-src={it.src} onClick={() => toggle(it)} className="w-full flex items-center gap-2 px-1.5 py-1 rounded-md text-left hover:bg-white/5" style={on ? { background: 'rgba(0,218,243,.1)' } : undefined}>
                  <span className="w-7 h-7 rounded flex-none grid place-items-center overflow-hidden" style={{ background: 'rgba(208,188,255,.12)' }}>
                    {it.thumb ? <img src={it.thumb} alt="" className="w-full h-full object-cover" /> : <Music size={12} style={{ color: LILAC }} />}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[11px] font-semibold truncate">{it.name}</span>
                    <span className="block text-[9.5px] text-white/40 truncate">{[it.sub, it.group].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="text-[9.5px] font-mono text-white/40">{formatDuration(it.duration)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
            {shown.map(it => {
              const on = sel.includes(it.id);
              return (
                <button key={it.id} data-src={it.src} onClick={() => toggle(it)} title={it.name} className="relative rounded-md overflow-hidden text-left"
                  style={{ aspectRatio: '16 / 10', background: '#14121e', outline: on ? `2px solid ${CYAN}` : '1px solid rgba(255,255,255,.08)' }}>
                  {it.thumb ? <img src={it.thumb} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                    : kind === 'video' ? <video src={it.src + '#t=0.5'} muted preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                    : <ImageIcon size={14} className="absolute inset-0 m-auto text-white/30" />}
                  <span className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-[8.5px] font-semibold truncate" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,.8))' }}>{it.name}</span>
                  {it.duration ? <span className="absolute top-0.5 right-0.5 px-1 rounded text-[8px] font-mono bg-black/70">{formatDuration(it.duration)}</span> : null}
                  {on && <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full grid place-items-center" style={{ background: CYAN, color: '#0b0a12' }}><Check size={10} /></span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Shared source bar: Library · Upload · URL · Clear ───────────────────────

const SourceBar: React.FC<{
  kind: MediaKind; multi?: boolean; hasValue: boolean; up: Uploader;
  onPicked: (items: PickedMedia[]) => void; onClear?: () => void;
}> = ({ kind, multi, hasValue, up, onPicked, onClear }) => {
  const [panel, setPanel] = useState<'' | 'library' | 'url'>('');
  const [url, setUrl] = useState('');
  const { busy, note } = up;
  const fileRef = useRef<HTMLInputElement>(null);

  const commitUrl = () => {
    const list = (multi ? url.split(/\r?\n|\s+(?=https?:)/) : [url]).map(s => s.trim()).filter(Boolean);
    if (!list.length) return;
    const items = list.map(src => ({ src, name: nameForUrl(src) }));
    rememberRecent(kind, items);
    onPicked(items);
    setUrl(''); setPanel('');
  };

  return (
    <div>
      <div className="flex items-center gap-1 flex-wrap">
        <button className={chipBtn} onClick={() => setPanel(p => (p === 'library' ? '' : 'library'))} style={panel === 'library' ? { color: LILAC, background: 'rgba(208,188,255,.14)' } : undefined}>
          {kind === 'audio' ? <Music size={11} /> : <Library size={11} />}{kind === 'audio' ? 'Chora' : 'Library'}
        </button>
        <button className={chipBtn} disabled={!!busy} onClick={() => fileRef.current?.click()}><Upload size={11} />Upload</button>
        <button className={chipBtn} onClick={() => setPanel(p => (p === 'url' ? '' : 'url'))} style={panel === 'url' ? { color: LILAC, background: 'rgba(208,188,255,.14)' } : undefined}><Link2 size={11} />URL</button>
        {hasValue && onClear && <button className={chipBtn} onClick={onClear}><X size={11} />Clear</button>}
        {busy && <span className="text-[9.5px] flex items-center gap-1" style={{ color: CYAN }}><Loader2 size={11} className="animate-spin" />{busy}</span>}
        <input ref={fileRef} type="file" accept={acceptFor(kind)} multiple={!!multi} className="hidden" data-testid={`file-${kind}`}
          onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) void up.run(fs); }} />
      </div>
      {note && <div className="mt-1 text-[9.5px] flex items-start gap-1" style={{ color: WARN }}><AlertTriangle size={11} className="flex-none mt-px" />{note}</div>}
      {panel === 'url' && (
        <div className="mt-1.5 flex gap-1">
          {multi
            ? <textarea value={url} onChange={e => setUrl(e.target.value)} rows={2} placeholder="One link per line" className="flex-1 rounded-md px-2 py-1 text-[11px] outline-none resize-y" style={fieldBox} />
            : <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitUrl(); }} placeholder="https://…" className="flex-1 rounded-md px-2 py-1 text-[11px] outline-none" style={fieldBox} />}
          <button className={chipBtn} onClick={commitUrl} style={{ color: CYAN }}><Check size={11} />Use</button>
        </div>
      )}
      {panel === 'library' && <MediaPicker kind={kind} multi={multi} onClose={() => setPanel('')} onPick={items => { rememberRecent(kind, items); onPicked(items); setPanel(''); }} />}
    </div>
  );
};

/** Drop files onto a box → same upload path as the Upload button. */
function useFileDrop(kind: MediaKind, onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => { if (Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); setOver(true); } },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault(); setOver(false);
        onFiles(Array.from(e.dataTransfer.files).filter(f => fileMatches(kind, f)));
      },
    },
  };
}

const SessionWarn: React.FC<{ urls: string[] }> = ({ urls }) => urls.some(isSessionOnlyUrl)
  ? <div className="mt-1 text-[9.5px] flex items-start gap-1" style={{ color: WARN }}><AlertTriangle size={11} className="flex-none mt-px" />Local file kept for this session only — it will be missing after a reload or on another output machine. Sign in and upload again to keep it.</div>
  : null;

/** One upload path for the Upload button and for drag-drop onto an editor. */
interface Uploader { busy: string; note: string; run: (files: File[]) => Promise<void> }
function useUploader(kind: MediaKind, multi: boolean, onPicked: (items: PickedMedia[]) => void): Uploader {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const run = async (files: File[]) => {
    const ok = files.filter(f => fileMatches(kind, f));
    if (!ok.length) { setNote(`That is not ${kind === 'image' ? 'an image' : kind === 'audio' ? 'an audio' : 'a video'} file.`); return; }
    const done: PickedMedia[] = [];
    let session = false, error = '';
    for (let i = 0; i < ok.length; i++) {
      const pre = ok.length > 1 ? `${i + 1}/${ok.length} · ` : '';
      setBusy(`${pre}Uploading…`);
      const r = await persistLocalFile(ok[i], pct => setBusy(`${pre}${Math.round(pct)}%`));
      if (r.sessionOnly) session = true;
      if (r.error) error = r.error;
      done.push({ src: r.src, name: r.name });
    }
    setBusy('');
    // The session-only case itself is flagged by SessionWarn under the editor.
    setNote(session && error ? `Upload failed (${error}) — using a session-only copy.` : '');
    rememberRecent(kind, done);
    onPicked(multi ? done : done.slice(0, 1));
  };
  return { busy, note, run };
}

// ── image ────────────────────────────────────────────────────────────────────

const ImageEditor: React.FC<EditorProps> = ({ fd, value, onChange }) => {
  const up = useUploader('image', false, items => items[0] && onChange(items[0].src));
  const drop = useFileDrop('image', fs => void up.run(fs));
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [value]);
  return (
    <div>
      <div className="flex gap-2 items-start">
        <div {...drop.props} data-testid={`drop-${fd.key}`} className="w-[104px] h-[62px] flex-none rounded-md overflow-hidden grid place-items-center relative"
          style={{ background: 'repeating-conic-gradient(#1a1726 0% 25%, #14121e 0% 50%) 50% / 12px 12px', border: `1px dashed ${drop.over ? CYAN : 'rgba(255,255,255,.14)'}` }}>
          {value && !broken ? <img src={value} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setBroken(true)} />
            : <span className="text-[9px] text-white/35 text-center px-1">{broken ? "Can't load image" : 'Drop an image'}</span>}
          {up.busy && <span className="absolute inset-0 grid place-items-center bg-black/60 text-[9px]" style={{ color: CYAN }}>{up.busy}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] text-white/70 truncate mb-1" title={value}>{value ? nameForUrl(value) : <span className="text-white/35">{fd.hint || 'No image'}</span>}</div>
          <SourceBar kind="image" up={up} hasValue={!!value} onPicked={items => items[0] && onChange(items[0].src)} onClear={() => onChange('')} />
        </div>
      </div>
      <SessionWarn urls={[value]} />
    </div>
  );
};

// ── images (ordered) ─────────────────────────────────────────────────────────

const ImagesEditor: React.FC<EditorProps> = ({ fd, value, onChange }) => {
  const list = splitLines(value);
  const set = (a: string[]) => onChange(joinLines(a));
  const add = (items: PickedMedia[]) => set([...list, ...items.map(i => i.src)]);
  const up = useUploader('image', true, add);
  const drop = useFileDrop('image', fs => void up.run(fs));
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
    const a = [...list]; const [x] = a.splice(from, 1); a.splice(to, 0, x); set(a);
  };
  return (
    <div>
      <div {...drop.props} data-testid={`images-${fd.key}`} className="rounded-md p-1.5 grid gap-1.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', background: 'rgba(255,255,255,.03)', border: `1px dashed ${drop.over ? CYAN : 'rgba(255,255,255,.12)'}` }}>
        {list.map((src, i) => (
          <div key={`${i}_${src}`} data-idx={i} data-src={src} draggable
            onDragStart={e => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/x-ambo-image-index', String(i)); } catch { /* */ } }}
            onDragOver={e => { if (dragFrom !== null) { e.preventDefault(); setDragOver(i); } }}
            onDrop={e => { if (dragFrom === null) return; e.preventDefault(); e.stopPropagation(); move(dragFrom, i); setDragFrom(null); setDragOver(null); }}
            onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
            className="group relative rounded overflow-hidden cursor-grab"
            style={{ aspectRatio: '1', background: '#14121e', outline: dragOver === i && dragFrom !== i ? `2px solid ${CYAN}` : '1px solid rgba(255,255,255,.08)', opacity: dragFrom === i ? .45 : 1 }}>
            <img src={src} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
            <span className="absolute top-0.5 left-0.5 min-w-[16px] h-4 px-1 rounded text-[9px] font-extrabold grid place-items-center" style={{ background: 'rgba(0,0,0,.7)', color: isSessionOnlyUrl(src) ? WARN : LILAC }}>{i + 1}</span>
            <button aria-label={`Remove image ${i + 1}`} data-action="remove" onClick={() => set(list.filter((_, j) => j !== i))}
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded grid place-items-center bg-black/70 opacity-0 group-hover:opacity-100 hover:bg-red-500/80"><X size={10} /></button>
            <div className="absolute inset-x-0 bottom-0 flex justify-between opacity-0 group-hover:opacity-100">
              <button aria-label="Move earlier" data-action="left" disabled={i === 0} onClick={() => move(i, i - 1)} className="w-5 h-4 grid place-items-center bg-black/70 disabled:opacity-20"><ChevronLeft size={10} /></button>
              <button aria-label="Move later" data-action="right" disabled={i === list.length - 1} onClick={() => move(i, i + 1)} className="w-5 h-4 grid place-items-center bg-black/70 disabled:opacity-20"><ChevronRight size={10} /></button>
            </div>
          </div>
        ))}
        <div className="rounded grid place-items-center text-center text-[9px] text-white/35 p-1" style={{ aspectRatio: '1', border: '1px dashed rgba(255,255,255,.1)' }}>
          {up.busy ? <span style={{ color: CYAN }}>{up.busy}</span> : list.length ? 'Drop more' : 'Drop images here'}
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[9.5px] text-white/40">{list.length} image{list.length === 1 ? '' : 's'} · drag to reorder</span>
        {list.length > 0 && <button className="text-[9.5px] text-white/40 hover:text-white inline-flex items-center gap-0.5" onClick={() => set([])}><Trash2 size={10} />Remove all</button>}
      </div>
      <div className="mt-1"><SourceBar kind="image" multi up={up} hasValue={false} onPicked={add} /></div>
      <SessionWarn urls={list} />
    </div>
  );
};

// ── video ────────────────────────────────────────────────────────────────────

const TRIM_IN = ['inSec', 'in', 'trimIn', 'startSec'], TRIM_OUT = ['outSec', 'out', 'trimOut', 'endSec'];

const VideoEditor: React.FC<EditorProps> = ({ fd, value, onChange, ctx }) => {
  const up = useUploader('video', false, items => items[0] && onChange(items[0].src));
  const drop = useFileDrop('video', fs => void up.run(fs));
  const { duration, error } = useMediaDuration(value, 'video');
  const inKey = ctx?.keys.find(k => TRIM_IN.includes(k)), outKey = ctx?.keys.find(k => TRIM_OUT.includes(k));
  const [trimOpen, setTrimOpen] = useState(false);
  const vRef = useRef<HTMLVideoElement>(null);
  const inV = inKey ? ctx!.get(inKey) : '', outV = outKey ? ctx!.get(outKey) : '';
  const fmt = (n: number) => String(Math.round(n * 10) / 10);
  const inN = parseFloat(inV) || 0, outN = parseFloat(outV) || 0;
  const span = duration || Math.max(inN, outN, 1);
  return (
    <div>
      <div className="flex gap-2 items-start">
        <div {...drop.props} data-testid={`drop-${fd.key}`} className="w-[104px] h-[62px] flex-none rounded-md overflow-hidden grid place-items-center relative"
          style={{ background: '#0d0b14', border: `1px dashed ${drop.over ? CYAN : 'rgba(255,255,255,.14)'}` }}>
          {value && !error ? <video key={value} src={`${value}#t=${Math.max(0.1, inN)}`} muted preload="metadata" playsInline className="absolute inset-0 w-full h-full object-cover" />
            : <span className="text-[9px] text-white/35 text-center px-1">{error ? "Can't load video" : 'Drop a video'}</span>}
          {duration != null && <span data-testid={`dur-${fd.key}`} className="absolute bottom-0.5 right-0.5 px-1 rounded text-[8.5px] font-mono bg-black/75">{formatDuration(duration)}</span>}
          {up.busy && <span className="absolute inset-0 grid place-items-center bg-black/60 text-[9px]" style={{ color: CYAN }}>{up.busy}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] text-white/70 truncate mb-1" title={value}>{value ? nameForUrl(value) : <span className="text-white/35">{fd.hint || 'No video'}</span>}{duration != null && <span className="text-white/40"> · {formatDuration(duration)}</span>}</div>
          <SourceBar kind="video" up={up} hasValue={!!value} onPicked={items => items[0] && onChange(items[0].src)} onClear={() => onChange('')} />
        </div>
      </div>
      {(inKey || outKey) && (
        <div className="mt-1.5 rounded-md p-1.5" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Scissors size={11} style={{ color: LILAC }} /><span className="text-[9.5px] font-extrabold uppercase tracking-wider text-white/45">Trim</span>
            {inKey && <label className="flex items-center gap-1 text-[10px] text-white/55">In
              <input data-testid="trim-in" type="number" min={0} step={0.1} value={inV} onChange={e => ctx!.set(inKey, e.target.value)} className="w-14 rounded px-1 py-0.5 text-[10.5px] outline-none" style={fieldBox} />s</label>}
            {outKey && <label className="flex items-center gap-1 text-[10px] text-white/55">Out
              <input data-testid="trim-out" type="number" min={0} step={0.1} value={outV} placeholder={duration ? fmt(duration) : 'end'} onChange={e => ctx!.set(outKey, e.target.value)} className="w-14 rounded px-1 py-0.5 text-[10.5px] outline-none" style={fieldBox} />s</label>}
            {value && <button className={chipBtn + ' ml-auto'} onClick={() => setTrimOpen(o => !o)}>{trimOpen ? 'Hide player' : 'Mark in player'}</button>}
          </div>
          <div className="relative h-1.5 mt-1.5 rounded-full bg-white/10">
            <div className="absolute inset-y-0 rounded-full" style={{ left: `${Math.min(100, (inN / span) * 100)}%`, right: `${outN > 0 ? Math.max(0, 100 - (outN / span) * 100) : 0}%`, background: `linear-gradient(90deg, ${LILAC}, ${CYAN})` }} />
          </div>
          {trimOpen && value && (
            <div className="mt-1.5">
              <video ref={vRef} src={value} controls muted playsInline className="w-full rounded" style={{ maxHeight: 180, background: '#000' }} />
              <div className="flex gap-1 mt-1">
                {inKey && <button className={chipBtn} onClick={() => vRef.current && ctx!.set(inKey, fmt(vRef.current.currentTime))}>Set in here</button>}
                {outKey && <button className={chipBtn} onClick={() => vRef.current && ctx!.set(outKey, fmt(vRef.current.currentTime))}>Set out here</button>}
                {inKey && <button className={chipBtn + ' ml-auto'} onClick={() => { if (vRef.current) vRef.current.currentTime = inN; }}>Go to in</button>}
              </div>
            </div>
          )}
        </div>
      )}
      <SessionWarn urls={[value]} />
    </div>
  );
};

// ── audio ────────────────────────────────────────────────────────────────────

const AudioEditor: React.FC<EditorProps> = ({ fd, value, onChange }) => {
  const up = useUploader('audio', false, items => items[0] && onChange(items[0].src));
  const drop = useFileDrop('audio', fs => void up.run(fs));
  const { duration, error } = useMediaDuration(value, 'audio');
  return (
    <div {...drop.props} data-testid={`drop-${fd.key}`} className="rounded-md p-1.5" style={{ background: 'rgba(255,255,255,.03)', border: `1px dashed ${drop.over ? CYAN : 'rgba(255,255,255,.1)'}` }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-7 h-7 rounded grid place-items-center flex-none" style={{ background: 'rgba(208,188,255,.12)' }}><Music size={13} style={{ color: LILAC }} /></span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[11px] font-semibold truncate" title={value}>{value ? nameForUrl(value) : <span className="text-white/35 font-normal">{fd.hint || 'No audio — pick from Chora, upload or paste a link'}</span>}</div>
          <div className="text-[9.5px] text-white/40" data-testid={`dur-${fd.key}`}>{up.busy || (error ? "Can't load this audio" : duration != null ? formatDuration(duration) : value ? 'Reading length…' : '')}</div>
        </div>
      </div>
      {value && !error && <audio src={value} controls preload="none" className="w-full h-7 mb-1" style={{ colorScheme: 'dark' }} />}
      <SourceBar kind="audio" up={up} hasValue={!!value} onPicked={items => items[0] && onChange(items[0].src)} onClear={() => onChange('')} />
      <SessionWarn urls={[value]} />
    </div>
  );
};

// ── number / select / toggle ─────────────────────────────────────────────────

/** Range + step from the hint ("0–100", "1 to 12", "step 0.5") and the default. */
export function numberSpec(fd: FieldDef): { min?: number; max?: number; step: number; unit: string } {
  const h = fd.hint || '';
  const r = h.match(/(-?\d+(?:\.\d+)?)\s*(?:–|—|-|to|\.\.)\s*(-?\d+(?:\.\d+)?)/i);
  const st = h.match(/step\s*(\d+(?:\.\d+)?)/i);
  const min = r ? parseFloat(r[1]) : undefined, max = r ? parseFloat(r[2]) : undefined;
  const dec = (s: string) => (s.split('.')[1] || '').length;
  let step = st ? parseFloat(st[1]) : 0;
  if (!step) {
    const d = Math.max(dec(fd.default || ''), r ? Math.max(dec(r[1]), dec(r[2])) : 0);
    step = d ? Math.pow(10, -d) : min != null && max != null && max - min <= 1 ? 0.01 : min != null && max != null && max - min <= 10 ? 0.1 : 1;
  }
  const unit = (h.match(/\b(sec(?:onds?)?|s|ms|%|px|bpm|x)\b/i) || [])[1] || '';
  return { min, max, step, unit };
}

const NumberEditor: React.FC<EditorProps> = ({ fd, value, onChange }) => {
  const { min, max, step, unit } = numberSpec(fd);
  const n = parseFloat(value);
  const ranged = min != null && max != null;
  // Text input (not type=number): some fields also accept words ("stay"), and
  // an empty value must stay empty ("plays to the end"). Arrow keys still step.
  const nudge = (dir: 1 | -1) => {
    const base = isFinite(n) ? n : (min ?? 0);
    let next = Math.round((base + dir * step) / step) * step;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    const dec = (String(step).split('.')[1] || '').length;
    onChange(next.toFixed(dec));
  };
  return (
    <div>
      <div className="flex items-center gap-2">
        {ranged && (
          <input type="range" min={min} max={max} step={step} value={isFinite(n) ? n : min} onChange={e => onChange(e.target.value)} className="flex-1 accent-[#D0BCFF] h-1" aria-label={fd.label} />
        )}
        <input data-testid={`num-${fd.key}`} inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} placeholder={fd.default || ''}
          onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); nudge(e.key === 'ArrowUp' ? 1 : -1); } }}
          className={`${ranged ? 'w-20' : 'w-28'} rounded-lg px-2 py-1 text-[12px] outline-none font-mono`} style={{ ...fieldBox, color: value && !isFinite(n) ? WARN : '#fff' }} />
        {unit && <span className="text-[10px] text-white/40">{unit}</span>}
      </div>
      {fd.hint && <div className="text-[9.5px] text-white/35 mt-0.5">{fd.hint}</div>}
    </div>
  );
};

const SelectEditor: React.FC<EditorProps> = ({ fd, value, onChange }) => {
  const opts = fd.options && fd.options.length ? fd.options : [fd.default].filter(Boolean);
  if (opts.length <= 4 && opts.every(o => o.length <= 14)) {
    return (
      <div className="flex rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,.05)' }} role="radiogroup" aria-label={fd.label}>
        {opts.map(o => (
          <button key={o} role="radio" aria-checked={value === o} onClick={() => onChange(o)} className="flex-1 py-1 rounded-md text-[10.5px] font-bold capitalize"
            style={{ background: value === o ? 'rgba(208,188,255,.2)' : 'transparent', color: value === o ? LILAC : 'rgba(255,255,255,.55)' }}>{o}</button>
        ))}
      </div>
    );
  }
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={fd.label} className="w-full bg-white/5 border border-white/10 rounded-md px-1.5 py-1 text-[11px] text-white/85">
      {!opts.includes(value) && value && <option value={value}>{value}</option>}
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
};

const ToggleEditor: React.FC<EditorProps> = ({ fd, value, onChange }) => {
  const on = value === 'true';
  return (
    <button role="switch" aria-checked={on} aria-label={fd.label} onClick={() => onChange(on ? 'false' : 'true')} className="flex items-center gap-2">
      <span className="w-8 h-[18px] rounded-full relative transition-all" style={{ background: on ? `linear-gradient(135deg, ${LILAC}, ${CYAN})` : 'rgba(255,255,255,.12)' }}>
        <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all" style={{ left: on ? 16 : 2 }} />
      </span>
      <span className="text-[10.5px] font-semibold" style={{ color: on ? LILAC : 'rgba(255,255,255,.5)' }}>{on ? 'On' : 'Off'}</span>
      {fd.hint && <span className="text-[9.5px] text-white/35">{fd.hint}</span>}
    </button>
  );
};

// ── data ─────────────────────────────────────────────────────────────────────

const DataEditor: React.FC<EditorProps> = ({ fd, value, onChange }) => {
  const [raw, setRaw] = useState(false);
  // Rows are edited locally so a half-typed blank row survives the round-trip.
  const [rows, setRows] = useState<DataRow[]>(() => parseDataText(value));
  const lastOut = useRef(value);
  useEffect(() => { if (value !== lastOut.current) { setRows(parseDataText(value)); lastOut.current = value; } }, [value]);
  const [series2, setSeries2] = useState(() => parseDataText(value).some(r => r.v2));
  const [note, setNote] = useState('');
  const commit = (next: DataRow[]) => { setRows(next); const s = serializeDataRows(next); lastOut.current = s; onChange(s); };
  const edit = (i: number, k: keyof DataRow, v: string) => commit(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/\t|\n/.test(text)) return; // single cell — let the input take it
    const parsed = parseTabular(text);
    if (!parsed) return;
    e.preventDefault();
    commit(parsed);
    if (parsed.some(r => r.v2)) setSeries2(true);
    setNote(`Pasted ${parsed.length} row${parsed.length === 1 ? '' : 's'} from the clipboard.`);
    window.setTimeout(() => setNote(''), 2500);
  };
  const cell = 'w-full bg-transparent outline-none px-1.5 py-1 text-[11px]';
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <button className={chipBtn} onClick={() => setRaw(r => !r)} data-testid={`raw-${fd.key}`}>{raw ? <Table2 size={11} /> : <FileText size={11} />}{raw ? 'Table' : 'Raw text'}</button>
        {!raw && <button className={chipBtn} onClick={() => { if (series2) commit(rows.map(r => ({ ...r, v2: '' }))); setSeries2(s => !s); }}>{series2 ? 'Remove 2nd series' : '+ 2nd series'}</button>}
        <span className="ml-auto text-[9.5px] text-white/35">Paste from a spreadsheet</span>
      </div>
      {raw ? (
        <textarea data-testid={`rawtext-${fd.key}`} value={value} onChange={e => onChange(e.target.value)} rows={5} placeholder={fd.hint || 'Label, value'} className="w-full rounded-lg px-2.5 py-1.5 text-[11.5px] font-mono outline-none resize-y" style={fieldBox} />
      ) : (
        <div onPaste={onPaste} data-testid={`table-${fd.key}`} className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.1)' }}>
          <div className="grid text-[9px] font-extrabold uppercase tracking-wider text-white/40" style={{ gridTemplateColumns: series2 ? '1fr 72px 72px 24px' : '1fr 84px 24px', background: 'rgba(255,255,255,.05)' }}>
            <span className="px-1.5 py-1">Label</span><span className="px-1.5 py-1">Value</span>{series2 && <span className="px-1.5 py-1">Value 2</span>}<span />
          </div>
          {rows.map((r, i) => (
            <div key={i} data-row={i} className="grid border-t" style={{ gridTemplateColumns: series2 ? '1fr 72px 72px 24px' : '1fr 84px 24px', borderColor: 'rgba(255,255,255,.06)' }}>
              <input aria-label={`Row ${i + 1} label`} value={r.label} onChange={e => edit(i, 'label', e.target.value)} className={cell} />
              <input aria-label={`Row ${i + 1} value`} value={r.v1} inputMode="decimal" onChange={e => edit(i, 'v1', e.target.value)} className={cell + ' font-mono border-l'} style={{ borderColor: 'rgba(255,255,255,.06)', color: r.v1 && !numLike(r.v1) ? WARN : undefined }} />
              {series2 && <input aria-label={`Row ${i + 1} value 2`} value={r.v2} inputMode="decimal" onChange={e => edit(i, 'v2', e.target.value)} className={cell + ' font-mono border-l'} style={{ borderColor: 'rgba(255,255,255,.06)' }} />}
              <button aria-label={`Remove row ${i + 1}`} onClick={() => commit(rows.filter((_, j) => j !== i))} className="grid place-items-center text-white/35 hover:text-red-300"><X size={11} /></button>
            </div>
          ))}
          <button data-testid={`addrow-${fd.key}`} onClick={() => setRows(rs => [...rs, { label: '', v1: '', v2: '' }])} className="w-full flex items-center gap-1 px-1.5 py-1 text-[10px] font-semibold text-white/45 hover:text-white border-t" style={{ borderColor: 'rgba(255,255,255,.06)' }}><Plus size={11} />Add row</button>
        </div>
      )}
      {note && <div className="mt-1 text-[9.5px]" style={{ color: CYAN }}>{note}</div>}
    </div>
  );
};

// ── visualizer (lazy: pulls the Pixels catalogues + preview tiles) ───────────

const LazyVisualizer = React.lazy(() => import('./AmboTemplateVisualizerPicker'));
const VisualizerEditor: React.FC<EditorProps> = ({ value, onChange }) => (
  <Suspense fallback={<div className="text-[10px] text-white/40 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />Loading visualizers…</div>}>
    <LazyVisualizer value={value} onChange={onChange} />
  </Suspense>
);

// ── text (default) ───────────────────────────────────────────────────────────

const TextEditor: React.FC<EditorProps> = ({ fd, value, onChange }) => fd.multiline
  ? <textarea aria-label={fd.label} value={value} onChange={e => onChange(e.target.value)} rows={3} placeholder={fd.hint} className="w-full rounded-lg px-2.5 py-1.5 text-[12px] outline-none resize-y" style={fieldBox} />
  : <input aria-label={fd.label} value={value} onChange={e => onChange(e.target.value)} placeholder={fd.hint} className="w-full rounded-lg px-2.5 py-1.5 text-[12px] outline-none" style={fieldBox} />;

// ── Dispatcher ───────────────────────────────────────────────────────────────

/** Sibling-field access for editors that drive more than their own value (video trim). */
export interface FieldCtx { keys: string[]; get: (k: string) => string; set: (k: string, v: string) => void }
interface EditorProps { fd: FieldDef; value: string; onChange: (v: string) => void; ctx?: FieldCtx }

const EDITORS: Record<FieldKind, React.FC<EditorProps>> = {
  text: TextEditor, image: ImageEditor, images: ImagesEditor, video: VideoEditor, audio: AudioEditor,
  number: NumberEditor, select: SelectEditor, toggle: ToggleEditor, data: DataEditor, visualizer: VisualizerEditor,
};

export const FIELD_KIND_ICON: Partial<Record<FieldKind, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>>> = {
  image: ImageIcon, images: Images, video: Film, audio: Music, data: BarChart3, visualizer: Sparkles, number: Hash, select: ListIcon, toggle: ToggleLeft,
};

/** Fields a video editor absorbs into its trim strip (hidden from the plain list). */
export function trimFieldKeys(fields: FieldDef[]): Set<string> {
  if (!fields.some(f => f.kind === 'video')) return new Set();
  return new Set(fields.filter(f => TRIM_IN.includes(f.key) || TRIM_OUT.includes(f.key)).map(f => f.key));
}

/** Declared kind, else infer the picture links older templates carry as plain text. */
export function inferKind(fd: FieldDef): FieldKind {
  if (fd.kind && EDITORS[fd.kind]) return fd.kind;
  if (/^(image|photo|poster|qr|logo|cover)(Url|Src)$/i.test(fd.key)) return 'image';
  return 'text';
}

export const TemplateFieldEditor: React.FC<{ fd: FieldDef; value: string; onChange: (v: string) => void; ctx?: FieldCtx }> = ({ fd, value, onChange, ctx }) => {
  const kind = inferKind(fd);
  const Ed = EDITORS[kind];
  const Icon = FIELD_KIND_ICON[kind];
  return (
    <div className="block" data-field={fd.key} data-kind={kind}>
      <span className={labelCls + ' flex items-center gap-1'}>
        {Icon && <Icon size={10} style={{ color: LILAC, opacity: .8 }} />}{fd.label}
      </span>
      <Ed fd={fd} value={value ?? ''} onChange={onChange} ctx={ctx} />
    </div>
  );
};

export default TemplateFieldEditor;
