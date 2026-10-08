// ─── Keyed notes on the shared notebook ──────────────────────────────────────
// Some readers attach one note to one location: a Bible verse, a passage in the
// Sacred Library. They read notes synchronously as a `{ key: text }` map while
// rendering. This adapter gives them that map while storing every note as an
// entry in the one shared notebook (services/notebookService → localStorage
// cache + users/{uid}/notebook), so these notes are not a separate silo.
//
// Each store names a bucket and, optionally, the legacy device-only map it used
// to live in; the legacy map is imported once per account on this device and
// left in place (read-only) so nothing is ever lost.

import {
  loadNotebook, notebookKey, readCachedNotebook, saveEntry, removeEntry, putEntry, NOTEBOOK_CHANGED,
  type SyncableEntry,
} from './notebookService';

export interface KeyedNoteEntry extends SyncableEntry {
  type: 'KEYED_NOTE';
  /** Location key, e.g. "45:8:28" or "quran/1/…/3". */
  key: string;
  text: string;
  /** Which reader wrote it, for display elsewhere (e.g. "lectio", "sacred-reader"). */
  source: string;
}

export interface KeyedNotesStore {
  /** Bucket name in the shared notebook. */
  readonly bucket: string;
  /** Storage key for the current account. */
  storageKey(): string;
  /** Current notes as a map, synchronously, from the local cache. */
  read(): Record<string, string>;
  /** Set (or clear, when blank) the note at `key`. Local now, account shortly after. */
  write(key: string, text: string): void;
  /** Pull the account copy and merge it into the cache. Resolves with the merged map. */
  sync(): Promise<Record<string, string>>;
  /** Subscribe to changes to this store; returns an unsubscribe function. */
  subscribe(fn: () => void): () => void;
}

interface Options {
  bucket: string;
  source: string;
  /** The device-only `{ key: text }` map this store replaces. */
  legacyKey?: string;
  /** Runs before the legacy import (e.g. to strip entries that don't belong). */
  beforeLegacyImport?: () => void;
  /** One-time import of an older account-side store, run on first sync per account. */
  legacyCloudImport?: (uid: string) => Promise<Record<string, string>>;
  /** Max chars per note. */
  maxLength?: number;
  /** Debounce for the account write while typing. */
  debounceMs?: number;
}

const idFor = (bucket: string, key: string) => `${bucket}:${key}`;
const uidOf = (storageKey: string) => storageKey.slice(storageKey.lastIndexOf('_') + 1);

function toMap(entries: SyncableEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) if (e?.type === 'KEYED_NOTE' && typeof e.key === 'string' && typeof e.text === 'string' && e.text.trim()) out[e.key] = e.text;
  return out;
}

export function keyedNotesStore(opts: Options): KeyedNotesStore {
  const { bucket, source, legacyKey, beforeLegacyImport, legacyCloudImport, maxLength = 20000, debounceMs = 800 } = opts;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const storageKey = () => notebookKey(bucket);

  const entryFor = (key: string, text: string): KeyedNoteEntry =>
    ({ id: idFor(bucket, key), type: 'KEYED_NOTE', key, text: text.slice(0, maxLength), source });

  /** Copy the old device-only map into this account's bucket, once. */
  function importLegacyLocal(sk: string) {
    if (!legacyKey) return;
    const flag = `${sk}__legacyImported`;
    try {
      if (localStorage.getItem(flag)) return;
      beforeLegacyImport?.();
      const legacy = JSON.parse(localStorage.getItem(legacyKey) || '{}');
      if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
        const existing = toMap(readCachedNotebook(sk));
        for (const [key, text] of Object.entries(legacy)) {
          if (typeof text !== 'string' || !text.trim() || existing[key] !== undefined) continue;
          // Local only here; pushed to the account on the next sync().
          saveEntry(sk, entryFor(key, text), { cloud: false });
        }
      }
      localStorage.setItem(flag, '1');
    } catch { /* storage unavailable — try again next time */ }
  }

  return {
    bucket,
    storageKey,
    read() {
      const sk = storageKey();
      importLegacyLocal(sk);
      return toMap(readCachedNotebook(sk));
    },
    write(key, text) {
      const sk = storageKey();
      importLegacyLocal(sk);
      const id = idFor(bucket, key);
      clearTimeout(timers.get(id));
      if (!text.trim()) { timers.delete(id); removeEntry(sk, id); return; }
      const saved = saveEntry(sk, entryFor(key, text), { cloud: false });
      timers.set(id, setTimeout(() => { timers.delete(id); void putEntry(sk, saved); }, debounceMs));
    },
    async sync() {
      const sk = storageKey();
      importLegacyLocal(sk);
      const uid = uidOf(sk);
      if (uid === 'guest') return toMap(readCachedNotebook(sk));

      // Older account-side store → this bucket, once per account.
      const cloudFlag = `${sk}__legacyCloudImported`;
      if (legacyCloudImport && !localStorage.getItem(cloudFlag)) {
        try {
          const older = await legacyCloudImport(uid);
          const have = toMap(readCachedNotebook(sk));
          for (const [key, text] of Object.entries(older)) if (text?.trim() && have[key] === undefined) saveEntry(sk, entryFor(key, text), { cloud: false });
          localStorage.setItem(cloudFlag, '1');
        } catch { /* retry next sync */ }
      }

      const merged = await loadNotebook(sk);
      // Push anything that only exists locally (legacy imports, offline edits).
      const pushFlag = `${sk}__legacyPushed`;
      if (!localStorage.getItem(pushFlag)) {
        await Promise.all(merged.filter(e => e.type === 'KEYED_NOTE').map(e => putEntry(sk, e)));
        try { localStorage.setItem(pushFlag, '1'); } catch { /* */ }
      }
      try { window.dispatchEvent(new CustomEvent(NOTEBOOK_CHANGED, { detail: { storageKey: sk } })); } catch { /* */ }
      return toMap(merged);
    },
    subscribe(fn) {
      const onChange = (e: Event) => { const d = (e as CustomEvent).detail; if (!d?.storageKey || d.storageKey === storageKey()) fn(); };
      const onStorage = (e: StorageEvent) => { if (e.key === storageKey()) fn(); };
      window.addEventListener(NOTEBOOK_CHANGED, onChange);
      window.addEventListener('storage', onStorage);
      return () => { window.removeEventListener(NOTEBOOK_CHANGED, onChange); window.removeEventListener('storage', onStorage); };
    },
  };
}
