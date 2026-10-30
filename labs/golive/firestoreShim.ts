// Lab-only in-memory Firestore for the Go Live lab. Every other firebase/firestore export is the real
// SDK; the document API (doc/collection/query/set/update/add/delete/get/onSnapshot + sentinels) is
// replaced by a Map synced between same-origin frames over BroadcastChannel, so a host frame and a
// viewer frame signal WebRTC to each other exactly as they would through Firestore.
// Wired by golive-lab.vite.config.mjs.
export * from 'firebase/firestore';

type Data = Record<string, any>;
const store = new Map<string, Data>();
const chan = new BroadcastChannel('golive-lab-firestore');
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => { try { l(); } catch (e) { console.error(e); } });

chan.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.t === 'hello') { chan.postMessage({ t: 'dump', entries: [...store.entries()] }); return; }
  if (m.t === 'dump') { for (const [k, v] of m.entries) if (!store.has(k)) store.set(k, v); notify(); return; }
  if (m.t === 'set') store.set(m.path, m.data);
  if (m.t === 'del') store.delete(m.path);
  notify();
};
chan.postMessage({ t: 'hello' });

const norm = (segs: string[]) => segs.join('/').split('/').filter(Boolean).join('/');
let autoId = 0;
const newId = () => `${Date.now().toString(36)}${(++autoId).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

class Ref {
  constructor(public path: string, public kind: 'doc' | 'col') {}
  get id() { return this.path.split('/').pop()!; }
  get parent(): any { const p = this.path.split('/'); p.pop(); return p.length ? new Ref(p.join('/'), this.kind === 'doc' ? 'col' : 'doc') : null; }
  withConverter() { return this; }
  toJSON() { return this.path; }
}
interface Q { col: string; wheres: [string, string, any][]; order: [string, 'asc' | 'desc'][]; lim?: number; kind: 'query' }

const base = (a: any): string => (a instanceof Ref ? a.path : '');
export function doc(parent: any, ...segs: string[]): any {
  const p = norm([base(parent), ...segs]);
  if (!segs.length && parent instanceof Ref && parent.kind === 'col') return new Ref(`${parent.path}/${newId()}`, 'doc');
  return new Ref(p, 'doc');
}
export function collection(parent: any, ...segs: string[]): any { return new Ref(norm([base(parent), ...segs]), 'col'); }
export function collectionGroup(_db: any, id: string): any { return { col: `**/${id}`, wheres: [], order: [], kind: 'query' } as Q; }
export function where(field: string, op: string, value: any) { return { w: [field, op, value] }; }
export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc') { return { o: [field, dir] }; }
export function limit(n: number) { return { l: n }; }
export function limitToLast(n: number) { return { l: n }; }
export function startAfter() { return {}; }
export function query(src: any, ...parts: any[]): any {
  const q: Q = src.kind === 'query' ? { ...src, wheres: [...src.wheres], order: [...src.order] } : { col: src.path, wheres: [], order: [], kind: 'query' };
  for (const p of parts) { if (p.w) q.wheres.push(p.w); if (p.o) q.order.push(p.o); if (p.l != null) q.lim = p.l; }
  return q;
}

// ── sentinels ────────────────────────────────────────────────────────────────────
export const serverTimestamp = () => ({ __op: 'ts' });
export const increment = (n: number) => ({ __op: 'inc', n });
export const arrayUnion = (...v: any[]) => ({ __op: 'union', v });
export const arrayRemove = (...v: any[]) => ({ __op: 'remove', v });
export const deleteField = () => ({ __op: 'del' });
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
function resolve(prev: any, v: any): any {
  if (v && typeof v === 'object' && v.__op) {
    if (v.__op === 'ts') return { __ts: Date.now() };
    if (v.__op === 'inc') return (typeof prev === 'number' ? prev : 0) + v.n;
    if (v.__op === 'union') { const a = Array.isArray(prev) ? [...prev] : []; v.v.forEach((x: any) => { if (!a.some(y => same(x, y))) a.push(x); }); return a; }
    if (v.__op === 'remove') return (Array.isArray(prev) ? prev : []).filter((y: any) => !v.v.some((x: any) => same(x, y)));
  }
  if (v instanceof Ref) return v.path;
  if (v && typeof v === 'object' && !Array.isArray(v) && !(v.__ts) && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Data = {};
    for (const [k, x] of Object.entries(v)) { if (x && (x as any).__op === 'del') continue; out[k] = resolve(prev?.[k], x); }
    return out;
  }
  if (v && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
  return v;
}
function hydrate(v: any): any {
  if (v && typeof v === 'object') {
    if (typeof v.__ts === 'number') { const ms = v.__ts; return { toMillis: () => ms, toDate: () => new Date(ms), seconds: Math.floor(ms / 1000), nanoseconds: 0 }; }
    if (Array.isArray(v)) return v.map(hydrate);
    const o: Data = {}; for (const [k, x] of Object.entries(v)) o[k] = hydrate(x); return o;
  }
  return v;
}
function write(path: string, data: Data | null) {
  if (data == null) { store.delete(path); chan.postMessage({ t: 'del', path }); }
  else { store.set(path, data); chan.postMessage({ t: 'set', path, data }); }
  queueMicrotask(notify);
}

export async function setDoc(ref: Ref, data: Data, opts?: { merge?: boolean }) {
  const prev = store.get(ref.path);
  const next = resolve(opts?.merge ? prev : undefined, data);
  write(ref.path, opts?.merge ? { ...(prev || {}), ...next } : next);
}
export async function updateDoc(ref: Ref, data: Data | string, ...rest: any[]) {
  const prev = store.get(ref.path);
  if (!prev) throw Object.assign(new Error(`No document to update: ${ref.path}`), { code: 'not-found' });
  const patch: Data = typeof data === 'string' ? { [data]: rest[0] } : data;
  const next: Data = JSON.parse(JSON.stringify(prev));
  for (const [k, v] of Object.entries(patch)) {
    const keys = k.split('.'); let o = next;
    for (const key of keys.slice(0, -1)) o = (o[key] = o[key] && typeof o[key] === 'object' ? o[key] : {});
    const last = keys[keys.length - 1];
    if (v && (v as any).__op === 'del') delete o[last]; else o[last] = resolve(o[last], v);
  }
  write(ref.path, next);
}
export async function addDoc(col: Ref, data: Data) { const r = new Ref(`${col.path}/${newId()}`, 'doc'); await setDoc(r, data); return r; }
export async function deleteDoc(ref: Ref) { write(ref.path, null); }

const snapDoc = (path: string) => {
  const d = store.get(path);
  return { id: path.split('/').pop()!, ref: new Ref(path, 'doc'), exists: () => !!d, data: () => (d ? hydrate(d) : undefined), get: (f: string) => (d ? hydrate(d)[f] : undefined), metadata: { hasPendingWrites: false, fromCache: false } };
};
const field = (d: Data, f: string) => f.split('.').reduce((o, k) => (o == null ? o : o[k]), d as any);
const cmpVal = (v: any) => (v && typeof v === 'object' && typeof v.__ts === 'number' ? v.__ts : v);
function matches(q: Q): string[] {
  const deep = q.col.startsWith('**/');
  const want = deep ? q.col.slice(3) : q.col;
  let paths = [...store.keys()].filter(p => {
    const parts = p.split('/'); const parentCol = parts.slice(0, -1).join('/');
    return deep ? parts[parts.length - 2] === want : parentCol === want;
  });
  for (const [f, op, val] of q.wheres) {
    paths = paths.filter(p => {
      const v = cmpVal(field(store.get(p)!, f)); const w = cmpVal(val);
      switch (op) {
        case '==': return same(v, w); case '!=': return !same(v, w);
        case '<': return v < w; case '<=': return v <= w; case '>': return v > w; case '>=': return v >= w;
        case 'in': return Array.isArray(w) && w.some(x => same(x, v)); case 'not-in': return Array.isArray(w) && !w.some(x => same(x, v));
        case 'array-contains': return Array.isArray(v) && v.some((x: any) => same(x, w));
        case 'array-contains-any': return Array.isArray(v) && Array.isArray(w) && v.some((x: any) => w.some(y => same(x, y)));
        default: return true;
      }
    });
  }
  for (const [f, dir] of [...q.order].reverse()) {
    paths.sort((a, b) => { const x = cmpVal(field(store.get(a)!, f)), y = cmpVal(field(store.get(b)!, f)); return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'desc' ? -1 : 1); });
  }
  return q.lim != null ? paths.slice(0, q.lim) : paths;
}
const toQuery = (src: any): Q => (src.kind === 'query' ? src : { col: src.path, wheres: [], order: [], kind: 'query' });
function snapQuery(paths: string[], prev: Map<string, string> | null) {
  const docs = paths.map(snapDoc);
  const changes: any[] = [];
  const cur = new Map(paths.map(p => [p, JSON.stringify(store.get(p))]));
  paths.forEach((p, i) => {
    if (!prev || !prev.has(p)) changes.push({ type: 'added', doc: docs[i], newIndex: i, oldIndex: -1 });
    else if (prev.get(p) !== cur.get(p)) changes.push({ type: 'modified', doc: docs[i], newIndex: i, oldIndex: i });
  });
  if (prev) for (const p of prev.keys()) if (!cur.has(p)) changes.push({ type: 'removed', doc: snapDoc(p), newIndex: -1, oldIndex: 0 });
  return { snap: { docs, size: docs.length, empty: !docs.length, forEach: (fn: any) => docs.forEach(fn), docChanges: () => changes, metadata: { hasPendingWrites: false, fromCache: false } }, cur };
}

export async function getDoc(ref: Ref) { return snapDoc(ref.path); }
export const getDocFromServer = getDoc;
export async function getDocs(src: any) { return snapQuery(matches(toQuery(src)), null).snap; }
export const getDocsFromServer = getDocs;
export async function getCountFromServer(src: any) { const n = matches(toQuery(src)).length; return { data: () => ({ count: n }) }; }

export function onSnapshot(src: any, ...args: any[]): () => void {
  const opts = args[0] && typeof args[0] === 'object' && !('next' in args[0]) && typeof args[0] !== 'function' ? args.shift() : null;
  void opts;
  const obs = typeof args[0] === 'object' ? args[0] : { next: args[0], error: args[1] };
  let last: any = undefined;
  let prev: Map<string, string> | null = null;
  const fire = () => {
    if (src instanceof Ref && src.kind === 'doc') {
      const key = JSON.stringify(store.get(src.path) ?? null);
      if (key === last) return; last = key;
      obs.next?.(snapDoc(src.path));
    } else {
      const paths = matches(toQuery(src));
      const { snap, cur } = snapQuery(paths, prev);
      const key = JSON.stringify([...cur.entries()]);
      if (key === last) return; last = key; prev = cur;
      obs.next?.(snap);
    }
  };
  listeners.add(fire);
  queueMicrotask(fire);
  return () => { listeners.delete(fire); };
}

export function writeBatch() {
  const ops: (() => Promise<void>)[] = [];
  const b = {
    set: (r: Ref, d: Data, o?: any) => { ops.push(() => setDoc(r, d, o)); return b; },
    update: (r: Ref, d: Data) => { ops.push(() => updateDoc(r, d)); return b; },
    delete: (r: Ref) => { ops.push(() => deleteDoc(r)); return b; },
    commit: async () => { for (const op of ops) await op(); },
  };
  return b;
}
export async function runTransaction(_db: any, fn: (tx: any) => Promise<any>) {
  const tx = {
    get: getDoc,
    set: (r: Ref, d: Data, o?: any) => { setDoc(r, d, o); return tx; },
    update: (r: Ref, d: Data) => { updateDoc(r, d); return tx; },
    delete: (r: Ref) => { deleteDoc(r); return tx; },
  };
  return fn(tx);
}

/** Lab inspection: every stored doc under a path prefix. */
export function __labDump(prefix = '') { return [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ path: k, ...hydrate(v) })); }
