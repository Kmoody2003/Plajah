// services/coedit/labels.ts — human words for paths and change sets ("Back page › Title text").
// Used by conflict cards, the activity feed and version diffs. Pure.

import { getIn, pathKey, type Op, type Path } from './crdt';

/** Optional per-app naming, e.g. Tela maps 'devices' → 'Layers'. */
export interface PathLabeler {
  /** Friendly name for a plain object key (return undefined to use the default). */
  key?: (key: string, parentPath: Path, parent: unknown) => string | undefined;
  /** Friendly name for a list element (return undefined to use the default). */
  element?: (el: Record<string, unknown>, listKey: string) => string | undefined;
}

const humanKey = (k: string) =>
  k
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());

export function elementName(el: Record<string, unknown> | undefined, listKey = ''): string {
  if (!el) return 'Item';
  for (const f of ['title', 'name', 'label', 'heading', 'caption']) {
    const v = el[f];
    if (typeof v === 'string' && v.trim()) return truncate(v.trim());
  }
  const text = typeof el.text === 'string' ? el.text : typeof el.content === 'string' ? el.content : '';
  const kind = typeof el.kind === 'string' ? el.kind : typeof el.type === 'string' ? el.type : '';
  if (text.trim()) return `${kind ? `${humanKey(kind.toLowerCase())} ` : ''}“${truncate(text.trim(), 22)}”`;
  if (kind) return humanKey(kind.toLowerCase());
  return listKey ? humanKey(listKey.replace(/s$/, '')) : 'Item';
}

function truncate(s: string, n = 28) {
  const one = s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

/** "Back page › Headline › Fill" for a path inside `doc`. */
export function describePath(doc: unknown, path: Path, labeler?: PathLabeler, maxParts = 3): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    if (seg.startsWith('#')) {
      const el = getIn(doc, path.slice(0, i + 1)) as Record<string, unknown> | undefined;
      const listKey = path[i - 1] ?? '';
      parts.push(labeler?.element?.(el ?? {}, listKey) ?? elementName(el, listKey));
      // the list key itself is noise once the element is named
      if (parts.length >= 2 && !path[i - 1]?.startsWith('#')) {
        const prev = parts[parts.length - 2];
        if (prev === (labeler?.key?.(listKey, path.slice(0, i - 1), getIn(doc, path.slice(0, i - 1))) ?? humanKey(listKey))) parts.splice(parts.length - 2, 1);
      }
    } else {
      parts.push(labeler?.key?.(seg, path.slice(0, i), getIn(doc, path.slice(0, i))) ?? humanKey(seg));
    }
  }
  const kept = parts.length > maxParts ? parts.slice(parts.length - maxParts) : parts;
  return kept.join(' › ') || 'Whole project';
}

/** The element (or top-level key) an op belongs to — what "a change" means to a person. */
export function opTarget(op: Op): Path {
  const p = op.k === 'ins' || op.k === 'rm' || op.k === 'mv' ? [...op.p, `#${op.id}`] : op.p;
  // deepest list element in the path, else the first two segments
  let last = -1;
  p.forEach((seg, i) => seg.startsWith('#') && (last = i));
  return last >= 0 ? p.slice(0, last + 1) : p.slice(0, Math.min(2, p.length));
}

export interface ChangeGroup {
  target: Path;
  key: string;
  label: string;
  kinds: Set<'added' | 'removed' | 'moved' | 'edited'>;
  count: number;
}

/** Groups ops by what they touched, labelled against `doc` (use the doc where the target exists). */
export function summarize(ops: Op[], docAfter: unknown, docBefore?: unknown, labeler?: PathLabeler): ChangeGroup[] {
  const groups = new Map<string, ChangeGroup>();
  for (const op of ops) {
    const target = opTarget(op);
    const key = pathKey(target);
    const exists = getIn(docAfter, target) !== undefined;
    const label = describePath(exists || docBefore === undefined ? docAfter : docBefore, target, labeler);
    const g = groups.get(key) ?? { target, key, label, kinds: new Set(), count: 0 };
    g.count++;
    g.kinds.add(op.k === 'ins' ? 'added' : op.k === 'rm' ? 'removed' : op.k === 'mv' ? 'moved' : 'edited');
    groups.set(key, g);
  }
  return [...groups.values()];
}

export function sentence(groups: ChangeGroup[], max = 3): string {
  if (!groups.length) return 'No changes';
  const verb = (g: ChangeGroup) => (g.kinds.has('added') ? 'added' : g.kinds.has('removed') ? 'removed' : g.kinds.has('moved') && g.kinds.size === 1 ? 'moved' : 'edited');
  const head = groups.slice(0, max).map((g) => `${verb(g)} ${g.label}`);
  const more = groups.length - max;
  return `${head.join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
}
