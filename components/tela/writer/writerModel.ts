// writerModel — the Tela Writer device ⇄ WriterDocument bridge.
//
// A Writer device persists `story` (the source of truth), `document` (page setup, styles,
// notes, comments, media…) and the DERIVED legacy `blocks`. Devices written before the engine
// (blocks only) migrate on read; devices whose blocks were changed by a legacy writer since the
// story last derived them (SET_WRITER_BLOCKS, Melos hydration, template code assigning
// `writer.blocks`) are reconciled on read. Everything is memoised per device object, so a
// render never re-migrates and an edit touches one paragraph.

import type { TelaBlock, TelaWriterDevice } from '../../../types';
import {
  type WriterDocument, type WriterDocumentParts, type WriterOp,
  applyWriterOps, blocksHash, deriveBlocks, documentParts, reconcileStory, storyFromBlocks, writerCoalesce,
} from '../../../services/text/document';

const memo = new WeakMap<TelaWriterDevice, WriterDocument>();

/** The device's document (migrated / reconciled as needed). Pure and memoised. */
export function writerDocumentOf(device: TelaWriterDevice): WriterDocument {
  const hit = memo.get(device);
  if (hit) return hit;
  const blocks = device.blocks ?? [];
  const parts: WriterDocumentParts = device.document ? { ...documentParts(), ...device.document } : documentParts();
  let story = device.story;
  if (!story || !story.paragraphs?.length) story = storyFromBlocks(blocks);
  else if (parts.blocksHash !== blocksHash(blocks)) story = reconcileStory(story, blocks);
  const doc: WriterDocument = { ...parts, story };
  memo.set(device, doc);
  return doc;
}

/** The device after `ops`: story + parts persisted, blocks re-derived, hash recorded. */
export function applyWriterEdit(device: TelaWriterDevice, ops: WriterOp[]): TelaWriterDevice {
  const before = writerDocumentOf(device);
  const after = applyWriterOps(before, ops);
  return deviceFromDocument(device, after);
}

export function deviceFromDocument(device: TelaWriterDevice, doc: WriterDocument): TelaWriterDevice {
  const blocks = deriveBlocks(doc.story);
  const { story, ...parts } = doc;
  const next: TelaWriterDevice = { ...device, story, document: { ...parts, blocksHash: blocksHash(blocks) }, blocks };
  memo.set(next, { ...doc, blocksHash: next.document!.blocksHash });
  return next;
}

/** Blocks changed by a legacy writer: keep the story, fold the block changes in. */
export function applyLegacyBlocks(device: TelaWriterDevice, blocks: TelaBlock[]): TelaWriterDevice {
  if (!device.story) return { ...device, blocks };
  const doc = writerDocumentOf(device);
  const story = reconcileStory(doc.story, blocks);
  return deviceFromDocument(device, { ...doc, story });
}

export { writerCoalesce };
