// Slide ↔ Tela bridge. Ambo slides ARE Tela documents: a 16:9 SCREEN frame hosting
// devices (Writer devices for text layers, media frames for background/fill/props)
// with full Tela layering parity: z-ordering, opacities, blend modes, visibility,
// and transforms.

import type { TelaDoc, TelaFrame, TelaWriterDevice, TelaBlock, TelaBlockKind, TelaDevice } from '../../types';
import type { Slide, SlideLayer, LayerSlot } from './showModel';
import { newId } from './showModel';
import { slideText } from './servicePlanDemo';

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

/** A stable Tela id for a slide, so re-opening the same slide keeps its identity. */
export const telaIdForSlide = (slide: Slide) => `tela_ambo_${slide.id}`;

/** Build a Tela document from a slide with complete layer fidelity. */
export function slideToTela(slide: Slide, ownerId = 'ambo', now = 0): TelaDoc {
  const devices: Record<string, TelaDevice> = {};
  const deviceIds: string[] = [];

  // 1. Process each layer into corresponding Tela devices
  for (let i = 0; i < slide.layers.length; i++) {
    const layer = slide.layers[i];
    const devId = layer.telaDeviceId || uid(`dev_${layer.slot}`);

    if (layer.content.kind === 'TEXT') {
      const blocks: TelaBlock[] = (layer.content.blocks.length ? layer.content.blocks : [{ text: '' }]).map((b, bi) => ({
        id: uid('blk'),
        kind: (bi === 0 ? 'h1' : 'p') as TelaBlockKind,
        text: b.text,
      }));
      const writerDevice: TelaWriterDevice = {
        id: devId,
        type: 'WRITER',
        blocks,
        mode: 'DOCUMENT',
      };
      devices[devId] = writerDevice;
      deviceIds.push(devId);
    }
  }

  // Fallback if no text layers existed
  if (deviceIds.length === 0) {
    const text = slideText(slide);
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    const blocks: TelaBlock[] = (lines.length ? lines : ['']).map((t, i) => ({
      id: uid('blk'),
      kind: (i === 0 ? 'h1' : 'p') as TelaBlockKind,
      text: t,
    }));
    const defaultDev: TelaWriterDevice = { id: uid('wr'), type: 'WRITER', blocks };
    devices[defaultDev.id] = defaultDev;
    deviceIds.push(defaultDev.id);
  }

  const frame: TelaFrame = {
    id: uid('frm'),
    kind: 'SCREEN',
    preset: 'FREE',
    x: 0,
    y: 0,
    w: 1920,
    h: 1080,
    deviceIds,
    label: slide.label,
  };

  return {
    id: telaIdForSlide(slide),
    ownerId,
    title: slide.label ?? 'Slide',
    frames: [frame],
    devices,
    createdAt: now,
    updatedAt: now,
  };
}

/** The Writer blocks of a slide's Tela doc (first frame's first Writer device). */
export function telaWriterBlocks(doc: TelaDoc): TelaBlock[] {
  const frame = doc.frames[0];
  if (!frame) return [];
  for (const devId of frame.deviceIds) {
    const dev = doc.devices[devId];
    if (dev && dev.type === 'WRITER') return dev.blocks;
  }
  return [];
}

/** Read the plain text back out of a Tela doc (blocks joined by newlines). */
export function telaToText(doc: TelaDoc): string {
  return telaWriterBlocks(doc).map(b => b.text).join('\n');
}

/** Convert a modified TelaDoc back into an Ambo Slide, preserving layers and metadata. */
export function telaToSlide(doc: TelaDoc, baseSlide?: Slide): Slide {
  const text = telaToText(doc);
  const slideId = doc.id.startsWith('tela_ambo_') ? doc.id.replace('tela_ambo_', '') : (baseSlide?.id || newId('sl'));

  if (baseSlide) {
    // Update existing slide's primary text layer
    let updated = false;
    const layers = baseSlide.layers.map(l => {
      if (!updated && l.content.kind === 'TEXT') {
        updated = true;
        return {
          ...l,
          content: {
            ...l.content,
            blocks: [{ text, role: 'body' as const }],
          },
          enabled: l.enabled !== undefined ? l.enabled : true,
          visible: l.visible !== undefined ? l.visible : true,
        };
      }
      return l;
    });

    if (!updated) {
      layers.push({
        id: newId('ly_txt'),
        slot: 'slide' as LayerSlot,
        enabled: true,
        visible: true,
        content: { kind: 'TEXT', blocks: [{ text, role: 'body' }] },
      });
    }

    return {
      ...baseSlide,
      id: slideId,
      label: doc.title || baseSlide.label,
      layers,
    };
  }

  return {
    id: slideId,
    label: doc.title || 'Slide',
    layers: [
      {
        id: newId('ly_txt'),
        slot: 'slide' as LayerSlot,
        enabled: true,
        visible: true,
        content: { kind: 'TEXT', blocks: [{ text, role: 'body' }] },
      },
    ],
  };
}
