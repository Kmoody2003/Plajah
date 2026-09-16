// Save As / Open — the native project FILE.
//
// The groove already autosaves to the owner's cloud, but a portable local file is what "Save As"
// means to most people: a `.melos` you can back up, move between machines, or hand to a
// collaborator. It's just the GrooveDoc as JSON (the same shape Firestore stores), wrapped with a
// tiny header so the importer can recognise it. Opening one brings it in as a NEW groove (fresh id)
// so it never overwrites an existing project.

import { serializeGroove, deserializeGroove, type GrooveDoc } from './grooveDoc';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { getBytes, putBytes } from '../../fabula/mediaStore';

const MAGIC = 'melos.groove';
const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

/** Download the current groove as a `.melos` file. */
export async function exportGrooveFile(doc: GrooveDoc): Promise<void> {
  const refs = new Map<string, string>();
  for (const pad of doc.kit) if (pad.sample) refs.set(pad.sample.key, pad.sample.name);
  for (const track of doc.arrangement) for (const clip of track.clips) if (clip.audio) refs.set(clip.audio.sampleKey, clip.audio.name);
  const files: Record<string, Uint8Array> = {};
  const assets: { key: string; path: string; name: string }[] = [];
  let index = 0;
  for (const [key, name] of refs) {
    const blob = await getBytes(key);
    if (!blob) continue;
    const path = `audio/${index++}-${key.split('/').pop()}.bin`;
    files[path] = new Uint8Array(await blob.arrayBuffer());
    assets.push({ key, path, name });
  }
  const payload = { format: MAGIC, version: 2, exportedAt: Date.now(), doc: serializeGroove(doc), assets };
  files['project.json'] = strToU8(JSON.stringify(payload));
  const safe = (doc.name || 'Groove').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'Groove';
  const blob = new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/x-melos-project' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safe}.melos`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Read a `.melos` (or a bare exported groove JSON) into a fresh GrooveDoc, or null if unreadable. */
export async function importGrooveFile(file: Blob): Promise<GrooveDoc | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let parsed: any;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const files = unzipSync(bytes);
      if (!files['project.json']) return null;
      parsed = JSON.parse(strFromU8(files['project.json']));
      for (const asset of parsed.assets || []) {
        const data = files[asset.path];
        if (data && typeof asset.key === 'string') await putBytes(asset.key, new Blob([data as BlobPart], { type: 'application/octet-stream' }));
      }
    } else parsed = JSON.parse(strFromU8(bytes));
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
