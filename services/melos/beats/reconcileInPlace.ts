// Chora docs are ONE mutable object shared with the engine and with every open view (the
// scheduler reads `doc` on each tick; drag handlers hold references to the clip/note objects they
// are moving). A merged document from a collaborator therefore can't simply be swapped in —
// that would orphan the engine's reference and every in-flight gesture. reconcileInPlace folds a
// new version INTO the existing object instead:
//
//   • plain objects keep their identity and are patched key by key;
//   • arrays get a NEW identity when anything in them changed (so `useEffect([doc.x])` and memo
//     deps still notice), but their element objects are reused — by `id` for id-keyed lists, by
//     index otherwise — so a clip being dragged is still the clip in the document;
//   • leaves are copied.
//
// Returns true when anything changed.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

function keyedIds(arr: unknown[]): boolean {
  if (!arr.length) return false;
  return arr.every((e) => isObj(e) && typeof e.id === 'string' && !!e.id);
}

function rec(t: unknown, s: unknown): [unknown, boolean] {
  if (t === s) return [t, false];
  if (isObj(t) && isObj(s)) return [t, patchObject(t, s)];
  if (Array.isArray(t) && Array.isArray(s)) {
    const byId = keyedIds(t) && keyedIds(s) ? new Map((t as Obj[]).map((e) => [e.id as string, e])) : null;
    let changed = t.length !== s.length;
    const next = s.map((e, i) => {
      const old = byId ? (isObj(e) ? byId.get(e.id as string) : undefined) : t[i];
      if (old === undefined) { changed = true; return e; }
      const [v, c] = rec(old, e);
      if (c || v !== t[i]) changed = true;
      return v;
    });
    return changed ? [next, true] : [t, false];
  }
  return Number.isNaN(t) && Number.isNaN(s) ? [t, false] : [s, true];
}

function patchObject(t: Obj, s: Obj): boolean {
  let changed = false;
  for (const k of Object.keys(t)) {
    if (!(k in s) || s[k] === undefined) {
      if (t[k] !== undefined) changed = true;
      delete t[k];
    }
  }
  for (const k of Object.keys(s)) {
    if (s[k] === undefined) continue;
    const had = k in t;
    const [v, c] = rec(t[k], s[k]);
    if (c || !had) { t[k] = v; changed = true; }
  }
  return changed;
}

/** Make `target` deep-equal to `source` while keeping `target`'s object identities. */
export function reconcileInPlace<T extends object>(target: T, source: T): boolean {
  return patchObject(target as unknown as Obj, source as unknown as Obj);
}
