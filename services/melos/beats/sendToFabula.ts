// Send to Fabula — bounce the Melos groove to audio and hand it to the Fabula editor as a music
// track, using Fabula's own import seam (the `studio:handoff` + OPEN_FABULA path Pixels and Reprise
// already use). No Fabula-side change: we write the bytes and a production the exact way Fabula
// reads them, then fire the event that opens it.
//
// Fabula has no synth engine, so it can't play Melos's MIDI/instruments live — but it doesn't need
// to: the bounce prints the WHOLE song (pads + instruments + audio) as one 24-bit WAV, which lands
// on Fabula's A2·MUSIC lane. The groove id rides along on the asset so a future "Edit in Melos"
// button can round-trip back.

import { set as idbSet, get as idbGet } from 'idb-keyval';
import { putBytes as mediaPutBytes } from '../../fabula/mediaStore';
import { renderGroove } from './render';
import type { GrooveDoc } from './grooveDoc';

const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

export async function sendGrooveToFabula(doc: GrooveDoc, buffers: [string, AudioBuffer][]): Promise<'ok' | 'failed'> {
  const result = await renderGroove(doc, buffers, { range: 'song', bitDepth: 24 });
  if (!result) return 'failed';

  const name = (doc.name || 'Melos Beat').slice(0, 80);
  const dur = result.buffer.duration;
  const assetId = uid(), prodId = uid(), editId = uid(), now = Date.now();

  // Bytes → OPFS the way Fabula's rehydrateBlobs reads them (stGet routes "studio:blob:*" to OPFS).
  await mediaPutBytes(`studio:blob:${assetId}`, result.blob);

  const asset = {
    id: assetId, name: `${name}.wav`, type: 'audio', duration: dur,
    bin: 'Melos Beats', tags: ['melos'], offline: true,
    // Provenance rides on the asset (like musicTrackId / pixels / reprise) for the round-trip.
    melosGrooveId: doc.id, melos: { grooveId: doc.id, bpm: doc.bpm },
  };
  const clip = { id: uid(), trackId: 'a2', start: 0, duration: dur, kind: 'media', assetId, label: name, srcIn: 0 };
  const prod = {
    id: prodId, title: name, type: 'film', description: 'From Melos Beats',
    themes: '', world: '', cast: [], mediaPool: [asset],
    defaults: { style: '', aspect: '16:9', service: 'kling', stillTarget: 'mj_magnific', format: { preset: 'hd1080', label: 'HD 1080p', w: 1920, h: 1080, fps: 30, drop: false } },
    acts: [1, 2, 3].map((n) => ({ id: uid(), number: n, title: `ACT ${['I', 'II', 'III'][n - 1]}`, scenes: [] })),
    edits: [{ id: editId, title: name, timeline: { clips: [clip], trackSettings: {} }, updatedAt: now }],
    worldCats: {}, design: {}, createdAt: now, updatedAt: now,
  };

  await idbSet(`studio:prod:${prodId}`, prod);
  const idx = (await idbGet('studio:index')) as { list?: { id: string }[] } | undefined || {};
  await idbSet('studio:index', { list: [{ id: prodId, title: name, type: 'film', updated: now, sceneCount: 0 }, ...((idx.list || []).filter((x) => x.id !== prodId))] });
  await idbSet('studio:handoff', { prodId, editId });

  window.dispatchEvent(new CustomEvent('OPEN_FABULA'));
  return 'ok';
}
