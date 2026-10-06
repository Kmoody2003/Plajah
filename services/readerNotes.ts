// ─── Reader notes ────────────────────────────────────────────────────────────
// The per-location notes written inside the readers. Both live in the shared
// notebook (services/notebookService) as buckets — not in private stores.
//
//   verseNotes         Lectio + the legacy Bible reader + Vespers recaps.
//                      Keys are "book:chapter:verse", prefixed by canon for
//                      non-Protestant canons (e.g. "catholic.27:3:1").
//   sacredReaderNotes  Sacred Library readers (Quran, sutras, Gita, …).
//                      Keys are "workId/title/edition/segmentId".
//
// Service notes (services/serviceNotes) are deliberately NOT here: they are
// receipts the platform generated, kept apart from what the member wrote.

import { keyedNotesStore } from './keyedNotes';
import { migrateLegacyReceipts } from './serviceNotes';

export const verseNotes = keyedNotesStore({
  bucket: 'verseNotes',
  source: 'lectio',
  legacyKey: 'plajah_bible_notes_v1',
  maxLength: 5000,
  // Older builds wrote "Heard at…" receipts into the authored-notes map; move
  // them out before importing so they never become "your notes".
  beforeLegacyImport: () => { migrateLegacyReceipts(); },
  // Verse notes used to sync to their own top-level `bibleNotes` collection.
  legacyCloudImport: async (uid) => (await import('./backendService')).loadBibleNotes(uid),
});

export const sacredReaderNotes = keyedNotesStore({
  bucket: 'sacredReaderNotes',
  source: 'sacred-reader',
  legacyKey: 'plajah_sacred_reader_notes_v1',
});
