// services/coedit/crdt.ts — the merge engine behind live co-editing, offline catch-up and
// cross-device sync for every creative project (Tela, Chora, Fabula, Pixels…).
//
// Any JSON project is a tree of objects, id-keyed lists (arrays of objects with a string `id`:
// frames, layers, clips, tracks) and leaves. diff(prev, next) turns an edit into fine-grained ops;
// applyOps folds ops into a CrdtState. The rules that make it converge, whatever order ops arrive in:
//
//   • every leaf is a last-writer-wins register keyed by path (stamps are HLCs, see hlc.ts), so two
//     people changing DIFFERENT properties of the same shape both keep their change;
//   • id-keyed lists order by fractional position keys, so concurrent inserts and moves interleave
//     instead of clobbering the list;
//   • strings merge: concurrent edits to different parts of a text both land (3-way, merge3Text);
//   • an edit beats an older delete: editing a shape someone else just deleted brings it back (and
//     the caller is told, so the UI can offer "delete anyway").
//
// Ops write into an immutable copy (structural sharing), so React re-renders only what changed.
// Pure module — no Firebase — so tests and every app share one implementation.

import { TOP_STAMP, stampWall } from './hlc';

export type Path = string[]; // object keys, or '#<id>' for an element of an id-keyed list

export type Op =
  | { k: 'set'; p: Path; v: unknown; s: string }
  | { k: 'del'; p: Path; s: string }
  | { k: 'ins'; p: Path; id: string; v: unknown; pos: string; s: string }
  | { k: 'rm'; p: Path; id: string; s: string }
  | { k: 'mv'; p: Path; id: string; pos: string; s: string }
  | { k: 'txt'; p: Path; from: string; to: string; s: string };

export interface CrdtMeta {
  /** Last write stamp per exact path (JSON-encoded path). */
  stamps: Record<string, string>;
  /** Position key per list element: `${listKey}\u0001${id}`. */
  pos: Record<string, string>;
  /** Deleted values, so a newer edit can bring them back. */
  graves: Record<string, { v: unknown; s: string; pos?: string }>;
  /**
   * Recent text edits per prose field. The field's value is `base` with `ops` folded in stamp order,
   * so every site computes the same text from the same set of edits whatever order they arrived in.
   */
  text?: Record<string, TextLog>;
  /** Ops addressed to a value that hasn't arrived yet (an edit before its insert). */
  held?: Record<string, Op[]>;
}

export interface TextLog {
  base: string;
  /** Edits at or before this stamp are folded into base. */
  baseS: string;
  ops: Array<{ s: string; from: string; to: string }>;
  /** Stamps folded into base (duplicate detection after trimming). */
  gone?: string[];
}

export interface CrdtState<T = unknown> {
  doc: T;
  meta: CrdtMeta;
}

export interface ApplyEvent {
  kind: 'resurrected' | 'text-overlap';
  path: Path;
  stamp: string;
}

// ── helpers ─────────────────────────────────────────────────────────────────

export const pathKey = (p: Path) => JSON.stringify(p);
const posKey = (list: Path, id: string) => `${pathKey(list)}\u0001${id}`;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const elId = (seg: string) => (seg.startsWith('#') ? seg.slice(1) : null);

type Keyed = { id: string } | string;

/** A list element's identity: its `id`, or the string itself in a list of unique strings. */
export const idOf = (e: unknown): string | undefined => (typeof e === 'string' ? e : isObj(e) && typeof e.id === 'string' ? e.id : undefined);

/**
 * A list that merges per element: objects with unique string ids (frames, layers, clips), or unique
 * non-empty strings (id references like a page's device ids, tags). Concurrent adds both land.
 */
export function isKeyedList(v: unknown): v is Keyed[] {
  if (!Array.isArray(v) || v.length === 0) return false;
  const strings = typeof v[0] === 'string';
  const seen = new Set<string>();
  for (const e of v) {
    if (strings ? typeof e !== 'string' : !isObj(e)) return false;
    const id = idOf(e);
    if (!id || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], bb[i])) return false;
    return true;
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual((a as any)[k], (b as any)[k])) return false;
  return true;
}

// ── fractional positions ────────────────────────────────────────────────────

const DIG = '0123456789abcdefghijklmnopqrstuvwxyz';

/** A key strictly between a and b (null = open end). Keys never end in '0', so there is always room. */
export function posBetween(a: string | null, b: string | null): string {
  let out = '';
  let i = 0;
  let hi: string | null = b;
  for (;;) {
    const ca = a && i < a.length ? DIG.indexOf(a[i]) : 0;
    const cb = hi != null && i < hi.length ? DIG.indexOf(hi[i]) : DIG.length;
    if (ca === cb) {
      out += DIG[ca];
      i++;
      continue;
    }
    const mid = Math.floor((ca + cb) / 2);
    if (mid > ca) return out + DIG[mid];
    out += DIG[ca];
    i++;
    hi = null;
  }
}

/** Evenly spread initial keys for n elements (deterministic, so every site derives the same ones). */
export function initialPositions(n: number): string[] {
  const out: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    prev = posBetween(prev, null);
    out.push(prev);
  }
  return out;
}

// ── state ───────────────────────────────────────────────────────────────────

/** Wraps a plain document (no history yet) in CRDT state, seeding list positions from current order. */
export function fromDoc<T>(doc: T): CrdtState<T> {
  const meta: CrdtMeta = { stamps: {}, pos: {}, graves: {} };
  seedPositions(doc, [], meta);
  return { doc, meta };
}

function seedPositions(v: unknown, path: Path, meta: CrdtMeta) {
  if (isKeyedList(v)) {
    const keys = initialPositions(v.length);
    v.forEach((e, i) => {
      const id = idOf(e)!;
      const pk = posKey(path, id);
      if (!meta.pos[pk]) meta.pos[pk] = keys[i];
      if (typeof e !== 'string') seedPositions(e, [...path, `#${id}`], meta);
    });
  } else if (isObj(v)) {
    for (const k of Object.keys(v)) seedPositions(v[k], [...path, k], meta);
  }
}

// ── diff ────────────────────────────────────────────────────────────────────

/**
 * Ops that turn `prev` into `next`. `meta` supplies list positions (so moves land between the right
 * neighbours); `stamp` is called once per op. Unchanged subtrees that are reference-equal are skipped
 * without walking, so diffing an immutably-updated document is cheap.
 */
export function diff(prev: unknown, next: unknown, meta: CrdtMeta, stamp: () => string, path: Path = []): Op[] {
  const ops: Op[] = [];
  const localPos: Record<string, string> = {}; // keys assigned in this pass (meta stays untouched)
  walk(prev, next, path);
  return ops;

  function walk(a: unknown, b: unknown, p: Path) {
    if (a === b) return;
    if (typeof a === 'string' && typeof b === 'string' && isProse(a) && isProse(b)) {
      if (a !== b) ops.push({ k: 'txt', p, from: a, to: b, s: stamp() });
      return;
    }
    if (isObj(a) && isObj(b)) {
      for (const k of Object.keys(a)) if (!(k in b) || b[k] === undefined) {
        if (a[k] !== undefined) ops.push({ k: 'del', p: [...p, k], s: stamp() });
      }
      for (const k of Object.keys(b)) {
        if (b[k] === undefined) continue;
        if (!(k in a) || a[k] === undefined) ops.push({ k: 'set', p: [...p, k], v: b[k], s: stamp() });
        else walk(a[k], b[k], [...p, k]);
      }
      return;
    }
    const aKeyed = isKeyedList(a) || (Array.isArray(a) && a.length === 0 && isKeyedList(b));
    const bKeyed = isKeyedList(b) || (Array.isArray(b) && b.length === 0 && isKeyedList(a));
    const sameKind = !(Array.isArray(a) && Array.isArray(b) && a.length && b.length && typeof a[0] !== typeof b[0]);
    if (aKeyed && bKeyed && sameKind) return walkList(a as Keyed[], b as Keyed[], p);
    if (!deepEqual(a, b)) ops.push({ k: 'set', p, v: b, s: stamp() });
  }

  function walkList(a: Keyed[], b: Keyed[], p: Path) {
    const aById = new Map(a.map((e) => [idOf(e)!, e]));
    const bIds = new Set(b.map((e) => idOf(e)!));
    for (const e of a) if (!bIds.has(idOf(e)!)) ops.push({ k: 'rm', p, id: idOf(e)!, s: stamp() });

    // Elements kept in the same relative order (longest increasing subsequence) keep their key.
    const aIndex = new Map(a.map((e, i) => [idOf(e)!, i]));
    const common = b.filter((e) => aById.has(idOf(e)!));
    const stable = lisIds(common.map((e) => aIndex.get(idOf(e)!)!), common);
    const keyOf = (id: string) => localPos[posKey(p, id)] ?? meta.pos[posKey(p, id)] ?? null;

    let prevKey: string | null = null;
    for (let i = 0; i < b.length; i++) {
      const e = b[i];
      if (stable.has(idOf(e)!) && keyOf(idOf(e)!)) {
        prevKey = keyOf(idOf(e)!);
        walk(aById.get(idOf(e)!), e, [...p, `#${idOf(e)!}`]);
        continue;
      }
      // Next stable neighbour bounds the new key from above.
      let nextKey: string | null = null;
      for (let j = i + 1; j < b.length; j++) {
        if (stable.has(idOf(b[j])!) && keyOf(idOf(b[j])!)) {
          nextKey = keyOf(idOf(b[j])!);
          break;
        }
      }
      const pos = posBetween(prevKey, nextKey != null && prevKey != null && nextKey <= prevKey ? null : nextKey);
      if (aById.has(idOf(e)!)) {
        ops.push({ k: 'mv', p, id: idOf(e)!, pos, s: stamp() });
        localPos[posKey(p, idOf(e)!)] = pos; // later keys in this pass sit after it
        walk(aById.get(idOf(e)!), e, [...p, `#${idOf(e)!}`]);
      } else {
        ops.push({ k: 'ins', p, id: idOf(e)!, v: e, pos, s: stamp() });
        localPos[posKey(p, idOf(e)!)] = pos;
      }
      prevKey = pos;
    }
  }
}

function lisIds(seq: number[], items: Keyed[]): Set<string> {
  const tails: number[] = [];
  const prevIdx = new Array(seq.length).fill(-1);
  const tailIdx: number[] = [];
  seq.forEach((v, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
    tailIdx[lo] = i;
    prevIdx[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  });
  const out = new Set<string>();
  let k = tailIdx[tails.length - 1] ?? -1;
  while (k >= 0) {
    out.add(idOf(items[k])!);
    k = prevIdx[k];
  }
  return out;
}

// ── apply ───────────────────────────────────────────────────────────────────

export interface ApplyResult<T> {
  state: CrdtState<T>;
  /** Ops that changed something (the rest lost to newer writes or were duplicates). */
  applied: Op[];
  events: ApplyEvent[];
}

/** Folds ops into state, idempotently and in any order. Returns a new state; the input is untouched. */
export function applyOps<T>(state: CrdtState<T>, ops: Op[]): ApplyResult<T> {
  const meta: CrdtMeta = { stamps: { ...state.meta.stamps }, pos: { ...state.meta.pos }, graves: { ...state.meta.graves }, text: { ...(state.meta.text ?? {}) }, held: { ...(state.meta.held ?? {}) } };
  let doc: unknown = state.doc;
  const applied: Op[] = [];
  const events: ApplyEvent[] = [];
  const touchedLists = new Map<string, Path>();

  const queue = [...ops];
  while (queue.length) {
    const op = queue.shift()!;
    const r = applyOne(doc, meta, op, events, touchedLists);
    doc = r.doc;
    if (r.changed) applied.push(op);
    if (r.wait) {
      const h = meta.held![STRUCT] ?? [];
      if (!h.some((x) => x.s === op.s && x.k === op.k)) meta.held![STRUCT] = [...h, op];
    } else if (r.changed && meta.held![STRUCT]?.length && op.k !== 'txt') {
      // Something appeared that waiting ops may have been addressed to: retry them.
      const h = meta.held![STRUCT];
      delete meta.held![STRUCT];
      queue.push(...h);
    }
  }
  for (const listPath of touchedLists.values()) doc = sortList(doc, listPath, meta);
  return { state: { doc: doc as T, meta }, applied, events };
}

const newer = (s: string, than: string | undefined) => !than || s > than;
const STRUCT = '@struct'; // ops addressed to a value that hasn't arrived yet
/** Text edits kept unfolded per field. Edits arriving later than this window behind merge best-effort. */
// Folding is driven by the edits' own stamps (not local time), so sites holding the same edits fold
// at the same point. Concurrent typing lands within seconds; a minute of window is plenty.
const TEXT_LOG_MAX = 64;
const TEXT_LOG_WINDOW_MS = 60_000;
const TEXT_GONE_KEEP = 512;

function foldText(log: TextLog): string {
  let cur = log.base;
  for (const o of log.ops) cur = merge3Text(o.from, cur, o.to, true).text;
  return cur;
}

function applyOne(doc: unknown, meta: CrdtMeta, op: Op, events: ApplyEvent[], lists: Map<string, Path>): { doc: unknown; changed: boolean; wait?: boolean } {
  // A write under a value that a newer write replaced, inserted or deleted wholesale is moot. Only
  // whole-value writes stamp interior paths (diff recurses into objects and lists, and text/leaf
  // stamps have no descendants), so any newer ancestor stamp shadows this op.
  const strict = op.k === 'ins' || op.k === 'rm' || op.k === 'mv' ? op.p.length : op.p.length - 1;
  for (let i = 1; i <= strict; i++) {
    const st = meta.stamps[pathKey(op.p.slice(0, i))];
    if (st && st > op.s) return { doc, changed: false };
  }

  // Make sure the containers exist, reviving any deleted by an OLDER op (edit beats delete).
  const container = op.k === 'ins' || op.k === 'rm' || op.k === 'mv' ? op.p : op.p.slice(0, -1);
  const ensured = ensurePath(doc, container, meta, op.s, events);
  if (!ensured.ok) return { doc, changed: false, wait: ensured.missing };
  doc = ensured.doc;

  switch (op.k) {
    case 'set':
    case 'del': {
      const key = pathKey(op.p);
      const cur = getIn(doc, op.p);
      if (!newer(op.s, meta.stamps[key])) {
        // A set older than a delete that already landed: keep the value as the grave so a newer
        // edit inside it can still bring it back.
        if (op.k === 'set' && cur === undefined && !meta.graves[key]) meta.graves[key] = { v: op.v, s: meta.stamps[key] };
        return { doc, changed: false };
      }
      if (op.k === 'del') {
        meta.stamps[key] = op.s;
        if (cur === undefined) return { doc, changed: false };
        // A delete loses to edits inside the value made after it.
        if (hasNewerDescendant(meta, op.p, op.s)) return { doc, changed: false };
        meta.graves[key] = { v: cur, s: op.s };
        return { doc: removeIn(doc, op.p), changed: true };
      }
      meta.stamps[key] = op.s;
      delete meta.graves[key];
      if (meta.text![key]) delete meta.text![key];
      if (isObj(op.v) || Array.isArray(op.v)) seedPositions(op.v, op.p, meta);
      if (deepEqual(cur, op.v)) return { doc, changed: false };
      return { doc: setIn(doc, op.p, op.v), changed: true };
    }
    case 'txt': {
      const key = pathKey(op.p);
      const cur = getIn(doc, op.p);
      const prevStamp = meta.stamps[key];
      if (typeof cur !== 'string') {
        if (!newer(op.s, prevStamp)) return { doc, changed: false };
        meta.stamps[key] = op.s;
        meta.text![key] = { base: op.to, baseS: op.s, ops: [] };
        return { doc: setIn(doc, op.p, op.to), changed: true };
      }
      const log: TextLog = meta.text![key] ?? { base: cur, baseS: prevStamp ?? '', ops: [] };
      if (op.s === log.baseS || log.ops.some((o) => o.s === op.s) || log.gone?.includes(op.s)) return { doc, changed: false };
      let next: TextLog;
      if (op.s < log.baseS) {
        // Older than everything we keep unfolded (a long-offline edit): merge it into the base.
        const m = merge3Text(op.from, log.base, op.to, false);
        if (m.overlap) events.push({ kind: 'text-overlap', path: op.p, stamp: op.s });
        next = { ...log, base: m.text, gone: [...(log.gone ?? []), op.s].slice(-TEXT_GONE_KEEP) };
      } else {
        const ops = [...log.ops, { s: op.s, from: op.from, to: op.to }].sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
        // Overlap is reported against what this site had, for the "both edited this line" hint.
        if (merge3Text(op.from, cur, op.to, true).overlap && cur !== op.from) events.push({ kind: 'text-overlap', path: op.p, stamp: op.s });
        next = { ...log, ops };
        const newestWall = stampWall(ops[ops.length - 1].s);
        let cut = 0;
        while (cut < ops.length - 1 && (ops.length - cut > TEXT_LOG_MAX || stampWall(ops[cut].s) < newestWall - TEXT_LOG_WINDOW_MS)) cut++;
        if (cut > 0) {
          const folded = ops.slice(0, cut);
          next = {
            base: foldText({ base: log.base, baseS: log.baseS, ops: folded }),
            baseS: folded[folded.length - 1].s,
            ops: ops.slice(cut),
            gone: [...(log.gone ?? []), ...folded.map((o) => o.s)].slice(-TEXT_GONE_KEEP),
          };
        }
      }
      meta.text![key] = next;
      if (newer(op.s, prevStamp)) meta.stamps[key] = op.s;
      const text = foldText(next);
      if (text === cur) return { doc, changed: false };
      return { doc: setIn(doc, op.p, text), changed: true };
    }
    case 'ins':
    case 'rm':
    case 'mv': {
      const list = getIn(doc, op.p);
      const arr = Array.isArray(list) ? (list as Keyed[]) : [];
      const elPath = [...op.p, `#${op.id}`];
      const ek = pathKey(elPath);
      const pk = posKey(op.p, op.id);
      const exists = arr.some((e) => idOf(e) === op.id);
      lists.set(pathKey(op.p), op.p);
      if (op.k === 'ins') {
        if (!newer(op.s, meta.stamps[ek])) {
          // Inserted before a remove we already saw: remember it as deleted (revivable).
          if (!exists && !meta.graves[ek]) {
            meta.graves[ek] = { v: op.v, s: meta.stamps[ek], pos: op.pos };
            if (newer(op.s, meta.stamps[`${ek}@pos`])) {
              meta.pos[pk] = op.pos;
              meta.stamps[`${ek}@pos`] = op.s;
            }
            return { doc, changed: true };
          }
          return { doc, changed: false };
        }
        meta.stamps[ek] = op.s;
        // The insert's position is a write to the position register; a newer move keeps its spot.
        if (newer(op.s, meta.stamps[`${ek}@pos`])) {
          meta.pos[pk] = op.pos;
          meta.stamps[`${ek}@pos`] = op.s;
        }
        delete meta.graves[ek];
        if (isObj(op.v)) seedPositions(op.v, elPath, meta);
        const next = exists ? arr.map((e) => (idOf(e) === op.id ? (op.v as Keyed) : e)) : [...arr, op.v as Keyed];
        return { doc: setIn(doc, op.p, next), changed: true };
      }
      if (op.k === 'rm') {
        if (!newer(op.s, meta.stamps[ek])) return { doc, changed: false };
        meta.stamps[ek] = op.s;
        if (!exists) return { doc, changed: false };
        if (hasNewerDescendant(meta, elPath, op.s)) return { doc, changed: false };
        meta.graves[ek] = { v: arr.find((e) => idOf(e) === op.id), s: op.s, pos: meta.pos[pk] };
        return { doc: setIn(doc, op.p, arr.filter((e) => idOf(e) !== op.id)), changed: true };
      }
      // mv: position is its own register
      const mk = `${ek}@pos`;
      if (!newer(op.s, meta.stamps[mk])) return { doc, changed: false };
      meta.stamps[mk] = op.s;
      meta.pos[pk] = op.pos;
      return { doc, changed: exists };
    }
  }
}

function hasNewerDescendant(meta: CrdtMeta, p: Path, s: string): boolean {
  const prefix = pathKey(p).slice(0, -1) + ',';
  for (const k in meta.stamps) if (k.startsWith(prefix) && meta.stamps[k] > s) return true;
  return false;
}

function ensurePath(doc: unknown, p: Path, meta: CrdtMeta, s: string, events: ApplyEvent[]): { ok: boolean; doc: unknown; missing?: boolean } {
  let cur: unknown = doc;
  for (let i = 0; i < p.length; i++) {
    const seg = p[i];
    const sub = p.slice(0, i + 1);
    const child = childOf(cur, seg);
    if (child !== undefined) {
      cur = child;
      continue;
    }
    const grave = meta.graves[pathKey(sub)];
    if (!grave) return { ok: false, doc, missing: true };
    if (grave.s > s) return { ok: false, doc };
    // Revive the deleted value; this edit is newer than its delete.
    delete meta.graves[pathKey(sub)];
    const id = elId(seg);
    if (id) {
      const listPath = p.slice(0, i);
      const list = getIn(doc, listPath);
      const arr = Array.isArray(list) ? list : [];
      // Position survives the delete as its own register; only fall back to the grave's copy.
      if (grave.pos && !meta.pos[posKey(listPath, id)]) meta.pos[posKey(listPath, id)] = grave.pos;
      doc = sortList(setIn(doc, listPath, [...arr, grave.v]), listPath, meta);
    } else {
      doc = setIn(doc, sub, grave.v);
    }
    events.push({ kind: 'resurrected', path: sub, stamp: s });
    cur = getIn(doc, sub);
  }
  return { ok: cur === undefined ? p.length === 0 : true, doc };
}

function sortList(doc: unknown, listPath: Path, meta: CrdtMeta): unknown {
  const list = getIn(doc, listPath);
  if (!Array.isArray(list) || list.length < 2) return doc;
  const key = (e: Keyed) => meta.pos[posKey(listPath, idOf(e) ?? '')] ?? '';
  const sorted = [...(list as Keyed[])].sort((x, y) => {
    const a = key(x);
    const b = key(y);
    const ix = idOf(x) ?? '';
    const iy = idOf(y) ?? '';
    return a < b ? -1 : a > b ? 1 : ix < iy ? -1 : ix > iy ? 1 : 0;
  });
  if (sorted.every((e, i) => e === list[i])) return doc;
  return setIn(doc, listPath, sorted);
}

// ── immutable path access ───────────────────────────────────────────────────

function childOf(v: unknown, seg: string): unknown {
  const id = elId(seg);
  if (id != null) return Array.isArray(v) ? v.find((e) => idOf(e) === id) : undefined;
  return isObj(v) ? v[seg] : undefined;
}

export function getIn(v: unknown, p: Path): unknown {
  let cur = v;
  for (const seg of p) {
    cur = childOf(cur, seg);
    if (cur === undefined) return undefined;
  }
  return cur;
}

function setIn(v: unknown, p: Path, value: unknown): unknown {
  if (p.length === 0) return value;
  const [seg, ...rest] = p;
  const id = elId(seg);
  if (id != null) {
    const arr = Array.isArray(v) ? v : [];
    return arr.map((e) => (idOf(e) === id ? setIn(e, rest, value) : e));
  }
  const obj = isObj(v) ? v : {};
  return { ...obj, [seg]: setIn(obj[seg], rest, value) };
}

function removeIn(v: unknown, p: Path): unknown {
  if (p.length === 1) {
    const seg = p[0];
    const id = elId(seg);
    if (id != null) return Array.isArray(v) ? v.filter((e) => idOf(e) !== id) : v;
    if (!isObj(v)) return v;
    const { [seg]: _gone, ...rest } = v;
    return rest;
  }
  const [seg, ...rest] = p;
  const child = childOf(v, seg);
  if (child === undefined) return v;
  return setIn(v, [seg], removeIn(child, rest));
}

// ── text merge ──────────────────────────────────────────────────────────────

/** Strings worth merging character-wise: text with spaces. Tokens of any length (colours, ids,
 *  storage keys, urls, data urls) are plain registers, never spliced. */
export function isProse(s: string): boolean {
  return /\s/.test(s) && !s.startsWith('data:') && s.length < 200_000;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

function singleEdit(base: string, next: string): Edit | null {
  if (base === next) return null;
  let s = 0;
  const max = Math.min(base.length, next.length);
  while (s < max && base[s] === next[s]) s++;
  let e = 0;
  while (e < max - s && base[base.length - 1 - e] === next[next.length - 1 - e]) e++;
  return { start: s, end: base.length - e, text: next.slice(s, next.length - e) };
}

/**
 * Three-way text merge. `mine` is the current local text, `theirs` the incoming one, both derived
 * from `base`. Edits to different parts both land; when they overlap, the newer side wins that region.
 */
export function merge3Text(base: string, mine: string, theirs: string, theirsNewer: boolean): { text: string; overlap: boolean } {
  if (mine === base) return { text: theirs, overlap: false };
  if (theirs === base || theirs === mine) return { text: mine, overlap: false };
  // `mine` may already contain several edits since base; compare region-wise.
  const em = singleEdit(base, mine)!;
  const et = singleEdit(base, theirs)!;
  const disjoint = em.end < et.start || et.end < em.start || (em.start === em.end && et.start === et.end ? true : em.end === et.start || et.end === em.start);
  if (disjoint) {
    // Apply the later-positioned edit first so earlier offsets stay valid. Same-point inserts:
    // the older one goes first.
    const [first, second] =
      em.start > et.start || (em.start === et.start && !theirsNewer) ? [em, et] : [et, em];
    let out = base.slice(0, first.start) + first.text + base.slice(first.end);
    out = out.slice(0, second.start) + second.text + out.slice(second.end);
    return { text: out, overlap: false };
  }
  // Overlapping edits behave like a plain last-writer-wins register, which is order-independent.
  return { text: theirsNewer ? theirs : mine, overlap: true };
}

// ── utilities for sessions ──────────────────────────────────────────────────

/** Re-stamps ops (publishing a held draft makes its edits the newest). */
export function restamp(ops: Op[], stamp: () => string): Op[] {
  return ops.map((o) => ({ ...o, s: stamp() }));
}

/** Collapses a run of local ops: one write per path survives; text chains keep the first `from`. */
export function coalesce(ops: Op[]): Op[] {
  const out: Op[] = [];
  const at = new Map<string, number>();
  for (const op of ops) {
    const key = op.k === 'ins' || op.k === 'rm' || op.k === 'mv' ? `${pathKey(op.p)}#${op.id}:${op.k === 'mv' ? 'mv' : 'el'}` : pathKey(op.p);
    const i = at.get(key);
    if (i != null) {
      const prev = out[i];
      out[i] = prev.k === 'txt' && op.k === 'txt' ? { ...op, from: prev.from } : op;
    } else {
      at.set(key, out.length);
      out.push(op);
    }
  }
  return out;
}

/** Overlays held ops on a state as if they were newest (draft view), without touching stamps. */
export function overlay<T>(state: CrdtState<T>, ops: Op[]): T {
  return applyOps(state, ops.map((o) => ({ ...o, s: TOP_STAMP }))).state.doc;
}

/** Ops that would make `from` look like `to` (whole or partial restore). */
export function opsToReach(from: unknown, to: unknown, meta: CrdtMeta, stamp: () => string, path: Path = []): Op[] {
  return diff(getIn(from, path), getIn(to, path), meta, stamp, path);
}

/**
 * Three-way merge of two edited copies of one JSON document (a project saved on two devices while
 * apart). Both sides' changes since `base` land; where both changed the same thing, `mine` wins
 * and the path is reported. Text edits to different parts of the same string both survive.
 */
export function merge3Json<T>(base: T, mine: T, theirs: T): { merged: T; conflicts: Path[] } {
  const start = fromDoc(base);
  let n = 0;
  // Their edits are stamped older than mine, so mine win on true conflicts.
  const theirOps = diff(base, theirs, start.meta, () => `0.${(n++).toString(36).padStart(6, '0')}.b`);
  const myOps = diff(base, mine, start.meta, () => `1.${(n++).toString(36).padStart(6, '0')}.a`);
  const theirKeys = new Set(theirOps.map((o) => pathKey(o.k === 'ins' || o.k === 'rm' || o.k === 'mv' ? [...o.p, `#${o.id}`] : o.p)));
  const conflicts = myOps
    .map((o) => (o.k === 'ins' || o.k === 'rm' || o.k === 'mv' ? [...o.p, `#${o.id}`] : o.p))
    .filter((p) => theirKeys.has(pathKey(p)));
  const merged = applyOps(applyOps(start, theirOps).state, myOps).state.doc;
  return { merged, conflicts };
}
