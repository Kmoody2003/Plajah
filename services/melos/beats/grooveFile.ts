// Save As / Open — the native project FILE.
//
// The groove already autosaves to the owner's cloud, but a portable local file is what "Save As"
// means to most people: a `.melos` you can back up, move between machines, or hand to a
// collaborator. It's just the GrooveDoc as JSON (the same shape Firestore stores), wrapped with a
// tiny header so the importer can recognise it. Opening one brings it in as a NEW groove (fresh id)
// so it never overwrites an existing project.

import { serializeGroove, deserializeGroove, type GrooveDoc } from './grooveDoc';

const MAGIC = 'melos.groove';
const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

/** Download the current groove as a `.melos` file. */
export function exportGrooveFile(doc: GrooveDoc): void {
  const payload = { format: MAGIC, version: 1, exportedAt: Date.now(), doc: serializeGroove(doc) };
  const safe = (doc.name || 'Groove').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'Groove';
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safe}.melos`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Read a `.melos` (or a bare exported groove JSON) into a fresh GrooveDoc, or null if unreadable. */
export async function importGrooveFile(file: Blob): Promise<GrooveDoc | null> {
  try {
    const parsed = JSON.parse(await file.text());
    const raw = parsed?.format === MAGIC ? parsed.doc : parsed; // accept our wrapper or a bare doc
    const doc = deserializeGroove(raw);
    if (!doc) return null;
    // A brought-in file becomes a NEW project so it never clobbers one already in the account.
    doc.id = uid() + uid();
    doc.name = doc.name ? `${doc.name} (imported)` : 'Imported groove';
    return doc;
  } catch {
    return null;
  }
}
