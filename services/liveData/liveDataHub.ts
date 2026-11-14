// liveDataHub — one place every live data feed in Plajah comes through.
//
// A source is a saved description (where the data lives + how often to look);
// the hub turns it into a LiveTable, keeps the latest snapshot in memory,
// notifies subscribers only when the content actually changes, and shares one
// poller per source no matter how many graphics, rundowns or outputs listen.
//
// Source kinds are pluggable adapters (registerLiveAdapter). Built in:
//   csv-url / json-url   polled HTTP(S) feeds (Google Sheets "publish to CSV", APIs)
//   csv-text             a pasted or uploaded CSV (editable in place)
//   csv-file             a local file the user picked; re-read on an interval (File System Access handle)
//   table                rows held in the source itself (edited by hand, or pushed by code)
// Platform adapters registered by liveDataAdapters.ts:
//   tela-sheet           a Tela Sheet device — live as cells change
//   math                 the Tela Sheet formula engine (MATLAB-style ranges/functions) evaluated to a table
//   build-file           a JSON/CSV file from a Plajah Build project
//   simulator            a numeric series from a platform simulator / data visualizer
//
// Sources persist in localStorage (same origin → Fabula, TV Studio and Stage share them)
// and snapshots are mirrored over BroadcastChannel so a feed polled in one window
// updates graphics in every window.
import { tableFromCsv, tableFromRecords, tableSignature, type LiveTable } from './csv';

export type LiveSourceKind = 'csv-url' | 'json-url' | 'csv-text' | 'csv-file' | 'table' | 'tela-sheet' | 'math' | 'build-file' | 'simulator' | (string & {});

export interface LiveSource {
  id: string;
  name: string;
  kind: LiveSourceKind;
  /** Adapter-specific settings (url, text, docId, expression…). */
  config: Record<string, any>;
  /** Poll interval in ms for pull adapters (default 5000; min 500). */
  intervalMs?: number;
  createdAt: number;
}

export interface LiveSnapshot { table: LiveTable | null; status: 'idle' | 'loading' | 'ok' | 'error'; error?: string; sig?: string; fetchedAt?: number }

export interface LiveAdapterContext {
  source: LiveSource;
  /** Push a fresh table (push adapters call this whenever their data changes). */
  emit(table: LiveTable): void;
  fail(message: string): void;
}
export interface LiveAdapter {
  kind: string;
  label: string;
  /** Pull adapters: fetch once; the hub polls on `intervalMs`. */
  fetch?(source: LiveSource, signal: AbortSignal): Promise<LiveTable>;
  /** Push adapters: start watching; return a stop function. */
  watch?(ctx: LiveAdapterContext): () => void;
}

// ── adapters ────────────────────────────────────────────────────────────────
const adapters = new Map<string, LiveAdapter>();
export function registerLiveAdapter(a: LiveAdapter) { adapters.set(a.kind, a); }
export function liveAdapters(): LiveAdapter[] { return [...adapters.values()]; }

function withCacheBust(url: string) { return url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now(); }

registerLiveAdapter({
  kind: 'csv-url', label: 'CSV from a URL (Google Sheets, Airtable, any published CSV)',
  async fetch(s, signal) {
    const r = await fetch(withCacheBust(String(s.config.url || '')), { signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return tableFromCsv(await r.text(), { hasHeader: s.config.hasHeader !== false });
  },
});
registerLiveAdapter({
  kind: 'json-url', label: 'JSON from a URL (array of records)',
  async fetch(s, signal) {
    const r = await fetch(withCacheBust(String(s.config.url || '')), { signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let data: any = await r.json();
    for (const k of String(s.config.path || '').split('.').filter(Boolean)) data = data?.[k];
    if (!Array.isArray(data)) throw new Error('Expected an array of records' + (s.config.path ? ` at "${s.config.path}"` : ''));
    return tableFromRecords(data);
  },
});
registerLiveAdapter({
  kind: 'csv-text', label: 'Pasted / uploaded CSV',
  async fetch(s) { return tableFromCsv(String(s.config.text || ''), { hasHeader: s.config.hasHeader !== false }); },
});
registerLiveAdapter({
  kind: 'table', label: 'Manual table',
  async fetch(s) { return { columns: s.config.columns || [], rows: s.config.rows || [], updatedAt: s.config.updatedAt || Date.now() }; },
});
// Local file: the handle can't be persisted in localStorage, so it lives in memory for the session.
const fileHandles = new Map<string, { getFile(): Promise<File> }>();
export function attachFileHandle(sourceId: string, handle: { getFile(): Promise<File> }) { fileHandles.set(sourceId, handle); refreshSource(sourceId); }
registerLiveAdapter({
  kind: 'csv-file', label: 'Local CSV file (re-read as it changes)',
  async fetch(s) {
    const h = fileHandles.get(s.id);
    if (!h) { if (s.config.text) return tableFromCsv(String(s.config.text)); throw new Error('Re-select the file to keep it live this session'); }
    const f = await h.getFile();
    const text = await f.text();
    return /\.json$/i.test(f.name) ? tableFromRecords(JSON.parse(text)) : tableFromCsv(text);
  },
});

// ── source registry (persisted) ─────────────────────────────────────────────
const KEY = 'plajah.liveData.sources.v1';
function store(): Storage | null { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }
let sources: LiveSource[] | null = null;
const registryListeners = new Set<() => void>();

export function listSources(): LiveSource[] {
  if (!sources) { try { sources = JSON.parse(store()?.getItem(KEY) || '[]'); } catch { sources = []; } if (!Array.isArray(sources)) sources = []; }
  return sources;
}
function persist() { try { store()?.setItem(KEY, JSON.stringify(listSources())); } catch { /* quota */ } registryListeners.forEach(f => f()); bus()?.postMessage({ type: 'REGISTRY' }); }
export function onSourcesChange(fn: () => void) { registryListeners.add(fn); return () => { registryListeners.delete(fn); }; }
export function getSource(id: string) { return listSources().find(s => s.id === id); }

export function addSource(s: Omit<LiveSource, 'id' | 'createdAt'> & { id?: string }): LiveSource {
  const src: LiveSource = { ...s, id: s.id || `src_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() };
  sources = [...listSources().filter(x => x.id !== src.id), src];
  persist();
  return src;
}
export function updateSource(id: string, patch: Partial<LiveSource>) {
  sources = listSources().map(s => (s.id === id ? { ...s, ...patch, config: { ...s.config, ...(patch.config || {}) } } : s));
  persist();
  restart(id);
}
export function removeSource(id: string) { sources = listSources().filter(s => s.id !== id); persist(); stop(id); snapshots.delete(id); }

// ── runtime: one runner per subscribed source ───────────────────────────────
const snapshots = new Map<string, LiveSnapshot>();
const subs = new Map<string, Set<(s: LiveSnapshot) => void>>();
const runners = new Map<string, { stop(): void; refresh(): void }>();

export function snapshot(id: string): LiveSnapshot { return snapshots.get(id) || { table: null, status: 'idle' }; }
/** Latest table synchronously (renderers call this every frame; it never blocks). */
export function liveTable(id: string): LiveTable | null { return snapshots.get(id)?.table ?? null; }

function publish(id: string, snap: LiveSnapshot, fromBus = false) {
  const prev = snapshots.get(id);
  if (prev && prev.status === snap.status && prev.sig === snap.sig && prev.error === snap.error) return;
  snapshots.set(id, snap);
  subs.get(id)?.forEach(fn => fn(snap));
  globalListeners.forEach(fn => fn(id, snap));
  if (!fromBus && snap.status === 'ok') bus()?.postMessage({ type: 'SNAP', id, snap });
}
const globalListeners = new Set<(id: string, s: LiveSnapshot) => void>();
/** Any source changed (playouts use this to redraw bound graphics). */
export function onAnyLiveData(fn: (id: string, s: LiveSnapshot) => void) { globalListeners.add(fn); return () => { globalListeners.delete(fn); }; }

function emitTable(id: string, table: LiveTable) {
  const sig = tableSignature(table);
  const prev = snapshots.get(id);
  publish(id, { table: prev?.sig === sig && prev.table ? prev.table : { ...table, updatedAt: prev?.sig === sig ? prev.table!.updatedAt : Date.now() }, status: 'ok', sig, fetchedAt: Date.now() });
}

function start(id: string) {
  if (runners.has(id)) return;
  const src = getSource(id);
  if (!src) { publish(id, { table: null, status: 'error', error: 'Source not found' }); return; }
  const a = adapters.get(src.kind);
  if (!a) { publish(id, { table: null, status: 'error', error: `No adapter for "${src.kind}"` }); return; }
  if (!snapshots.has(id)) publish(id, { table: null, status: 'loading' });
  if (a.watch) {
    const stopWatch = a.watch({ source: src, emit: (t) => emitTable(id, t), fail: (m) => publish(id, { ...snapshot(id), status: 'error', error: m }) });
    runners.set(id, { stop: stopWatch, refresh: () => { /* push adapters update themselves */ } });
    return;
  }
  let ctl: AbortController | null = null, timer: ReturnType<typeof setTimeout> | null = null, alive = true;
  const tick = async () => {
    if (!alive) return;
    ctl?.abort(); ctl = new AbortController();
    try { emitTable(id, await a.fetch!(getSource(id) || src, ctl.signal)); }
    catch (e: any) { if (e?.name !== 'AbortError') publish(id, { ...snapshot(id), status: 'error', error: String(e?.message || e) }); }
    if (alive) timer = setTimeout(tick, Math.max(500, (getSource(id) || src).intervalMs ?? 5000));
  };
  void tick();
  runners.set(id, { stop: () => { alive = false; ctl?.abort(); if (timer) clearTimeout(timer); }, refresh: () => { if (timer) clearTimeout(timer); void tick(); } });
}
function stop(id: string) { runners.get(id)?.stop(); runners.delete(id); }
function restart(id: string) { if (runners.has(id)) { stop(id); start(id); } }
export function refreshSource(id: string) { runners.get(id)?.refresh(); }

/** Subscribe to a source's snapshots. The first subscriber starts it; the last one stops it. */
export function subscribeSource(id: string, fn: (s: LiveSnapshot) => void): () => void {
  let set = subs.get(id);
  if (!set) { set = new Set(); subs.set(id, set); }
  set.add(fn);
  start(id);
  fn(snapshot(id));
  return () => { set!.delete(fn); if (!set!.size) { subs.delete(id); stop(id); } };
}

/** Push rows into a 'table' source (scoreboards, scripts, other apps). */
export function pushRows(id: string, rows: Record<string, string>[], opts: { append?: boolean } = {}) {
  const src = getSource(id); if (!src || src.kind !== 'table') return;
  const prev: Record<string, string>[] = opts.append ? (src.config.rows || []) : [];
  const all = [...prev, ...rows];
  const columns: string[] = [...(src.config.columns || [])];
  for (const r of rows) for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
  updateSource(id, { config: { columns, rows: all, updatedAt: Date.now() } });
  emitTable(id, { columns, rows: all, updatedAt: Date.now() });
}

// ── cross-window mirror ─────────────────────────────────────────────────────
let ch: BroadcastChannel | null | undefined;
function bus(): BroadcastChannel | null {
  if (ch !== undefined) return ch;
  ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('plajah-live-data-v1') : null;
  (ch as unknown as { unref?: () => void } | null)?.unref?.();
  if (ch) ch.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (m?.type === 'SNAP' && m.id) publish(m.id, m.snap, true);
    else if (m?.type === 'REGISTRY') { sources = null; registryListeners.forEach(f => f()); }
  };
  return ch;
}
bus();

export type { LiveTable };
