// Slide ↔ Tela bridge. Ambo slides ARE Tela documents: a 16:9 SCREEN frame hosting
// a Writer device whose blocks are the slide's text. This is what "the slide system
// is powered by Tela" means at the model layer — the same TelaDoc/TelaBlock types the
// rest of the platform (Lorea, titling, Fabula) authors. The in-canvas editor
// (AmboSlideEditor) reads/writes through here.

import type { TelaDoc, TelaFrame, TelaWriterDevice, TelaBlock, TelaBlockKind } from '../../types';
import type { Slide } from './showModel';
import { slideText } from './servicePlanDemo';

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

/** A stable Tela id for a slide, so re-opening the same slide keeps its identity. */
export const telaIdForSlide = (slide: Slide) => `tela_ambo_${slide.id}`;

/** Build a Tela document from a slide (one SCREEN frame + one Writer device). */
export function slideToTela(slide: Slide, ownerId = 'ambo', now = 0): TelaDoc {
  const text = slideText(slide);
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const blocks: TelaBlock[] = (lines.length ? lines : ['']).map((t, i) => ({
    id: uid('blk'),
    kind: (i === 0 ? 'h1' : 'p') as TelaBlockKind,
    text: t, // plain text; Tela keeps inline HTML but a slide line has none
  }));
  const device: TelaWriterDevice = { id: uid('wr'), type: 'WRITER', blocks };
  const frame: TelaFrame = {
    id: uid('frm'), kind: 'SCREEN', preset: 'FREE',
    x: 0, y: 0, w: 1920, h: 1080,
    deviceIds: [device.id], label: slide.label,
  };
  return {
    id: telaIdForSlide(slide),
    ownerId,
    title: slide.label ?? 'Slide',
    frames: [frame],
    devices: { [device.id]: device },
    createdAt: now,
    updatedAt: now,
  };
}

/** The Writer blocks of a slide's Tela doc (first frame's first Writer device). */
export function telaWriterBlocks(doc: TelaDoc): TelaBlock[] {
  const frame = doc.frames[0];
  const devId = frame?.deviceIds[0];
  const dev = devId ? doc.devices[devId] : undefined;
  return dev && dev.type === 'WRITER' ? dev.blocks : [];
}

/** Read the plain text back out of a Tela doc (blocks joined by newlines). */
export function telaToText(doc: TelaDoc): string {
  return telaWriterBlocks(doc).map(b => b.text).join('\n');
}
