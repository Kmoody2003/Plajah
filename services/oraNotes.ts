import { loadNotebook, putEntry, deleteEntry, type SyncableEntry } from './notebookService';
import { auth } from './backendService';

// ─────────────────────────────────────────────────────────────────────────
// Ora — Commonplace. Fast capture, attachable to anything on the platform.
//
// Built on notebookService rather than a new collection, deliberately: that
// service already gives us Firestore-plus-localStorage merge, offline-first
// reads, guest support, and owner-only rules at users/{uid}/notebook/{id}.
// Adding a parallel notes store would have meant re-earning all four.
//
// HOW THIS DIFFERS FROM LONGHAND (the journal):
//   Longhand is private reflection — encrypted, dated, compiled into a book.
//   Commonplace is reference — a thought, a quote, a lyric idea, pinned to the
//   thing it is about. It is NOT encrypted, because notes are meant to be
//   searched and attached, and pretending otherwise would be a false promise.
//   That difference is stated in the UI, not buried here.
//
// The attachment is the part no standalone notes app can do: a note can point at
// a track, a chapter, a scene, a match or a lesson, because those things live on
// the same platform.
// ─────────────────────────────────────────────────────────────────────────

export type NoteTargetKind =
  | 'TRACK' | 'ALBUM' | 'BOOK' | 'CHAPTER' | 'SCENE' | 'VIDEO'
  | 'MATCH' | 'LESSON' | 'PERSON' | 'NONE';

export interface NoteTarget {
  kind: NoteTargetKind;
  id: string;
  /** Human label, stored so a note still reads correctly if the target vanishes. */
  label: string;
}

export interface OraNote extends SyncableEntry {
  id: string;
  text: string;
  title?: string;
  tags: string[];
  attachedTo?: NoteTarget;
  createdAt: number;
  updatedAt: number;
}

/** Per-account bucket. Guests get a local-only notebook under the same key. */
const keyFor = () => `oraCommonplace_${auth.currentUser?.uid || 'guest'}`;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Tags are written inline as #word — parsed out so capture stays one field.
 *
 * The `#` must start the note or follow whitespace. Without that guard a pasted
 * URL fragment (`…/page#section`) or an ordinary `no#hash` silently becomes a
 * tag, and the tag list fills with noise the user never wrote. Uses a capture
 * group rather than lookbehind for older-Safari compatibility.
 */
export function parseTags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)) {
    if (m[1]) out.add(m[1].toLowerCase());
  }
  return Array.from(out);
}

export async function listNotes(): Promise<OraNote[]> {
  const entries = await loadNotebook(keyFor());
  return entries
    .filter((e): e is OraNote => typeof (e as OraNote).text === 'string')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function saveNote(
  input: { id?: string; text: string; title?: string; attachedTo?: NoteTarget; createdAt?: number },
): Promise<OraNote | null> {
  const text = input.text.trim();
  if (!text) return null;
  const now = Date.now();
  const note: OraNote = {
    id: input.id ?? newId(),
    text,
    title: input.title?.trim() || undefined,
    tags: parseTags(text),
    attachedTo: input.attachedTo,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  await putEntry(keyFor(), note);
  return note;
}

export async function removeNote(id: string): Promise<void> {
  await deleteEntry(keyFor(), id);
}

/** Plain substring search across title, body and tags. */
export function searchNotes(notes: OraNote[], q: string): OraNote[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return notes;
  return notes.filter((n) =>
    n.text.toLowerCase().includes(needle)
    || (n.title || '').toLowerCase().includes(needle)
    || n.tags.some((t) => t.includes(needle)),
  );
}

/** Every tag in use, most-used first — the closest thing to a table of contents. */
export function tagCloud(notes: OraNote[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) || 0) + 1);
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
