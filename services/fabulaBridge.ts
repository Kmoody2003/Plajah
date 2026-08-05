// fabulaBridge.ts — Phase 1 of Pixels ↔ Fabula integration: the BRIDGE.
//
// Turns a Plajah Pixels session (launcher scenes + a live cut-list, or a timeline)
// into a Fabula production written straight into Fabula's own IndexedDB store, then
// hands off so Fabula opens it. No Fabula redesign — we populate its existing model:
//   • each Pixels scene → a mediaPool ("bin") item, carrying its full snapshot in a
//     `pixels` field so Phase 2 can render the real composite inside Fabula
//   • the cut-list → clips on a standalone `edit` timeline (V1), song on A1
//   • a matching CMX3600 EDL string for round-tripping to Resolve/Premiere/Avid
//
// The Pixels scene snapshot rides along on each media item, so a Pixels scene is
// effectively a NESTED clip in Fabula (it expands to a Pixels sub-composite when
// the Pixels render engine is mounted in Fabula — Phase 2).

import { get as idbGet, set as idbSet } from 'idb-keyval';
import type { SceneSnapshot } from '../components/plajahPixels/engine/timeline/sceneTimeline';

const uid = () => Math.random().toString(36).slice(2, 10);

export interface PixelsCut { sceneKey: string; t: number; }            // a launch at time t (seconds)
export interface PixelsScene { key: string; name: string; snapshot: SceneSnapshot; }
export interface PixelsExportPayload {
  title: string;
  scenes: PixelsScene[];               // distinct scenes available (→ the bin)
  cuts: PixelsCut[];                    // ordered cut-list from a live session (may be empty)
  totalDuration: number;               // seconds
  fps: number;
  palette?: string[];                  // Pixels colorPalette — carried for render fidelity in Fabula
  song?: { name: string; url?: string; duration?: number };
}

interface FabulaMediaItem {
  id: string; name: string; type: string; url?: string; duration?: number;
  bin: string; tags: string[]; offline?: boolean; pixels?: SceneSnapshot;
}
interface FabulaClip {
  id: string; trackId: string; start: number; duration: number; kind: string;
  label: string; assetId?: string; srcIn?: number;
}

// Pick a simple preview for a scene: a single media layer can preview directly in
// Fabula today; anything with generators/shaders is an offline placeholder until
// the Pixels render engine is mounted in Fabula (Phase 2).
function sceneToMediaItem(scene: PixelsScene): FabulaMediaItem {
  const layers = scene.snapshot.layers || [];
  const mediaLayer = layers.find(l => l.clip?.type === 'media' && l.clip.mediaUrl);
  const onlyMedia = mediaLayer && layers.every(l => l.clip?.type === 'media' || l.clip?.type === 'color');
  if (onlyMedia && mediaLayer) {
    return {
      id: uid(), name: scene.name, type: mediaLayer.clip.mediaType === 'image' ? 'image' : 'video',
      url: mediaLayer.clip.mediaUrl, bin: 'Pixels · Media', tags: ['pixels'], pixels: scene.snapshot,
    };
  }
  return {
    id: uid(), name: scene.name, type: 'graphic', bin: 'Pixels · Scenes',
    tags: ['pixels', 'generator'], offline: true, pixels: scene.snapshot,
  };
}

/** Build the clip list (V1) from the cut-list, or evenly from the scenes if none. */
function buildClips(payload: PixelsExportPayload, itemByKey: Map<string, FabulaMediaItem>): FabulaClip[] {
  const clips: FabulaClip[] = [];
  const cuts = [...payload.cuts].sort((a, b) => a.t - b.t);
  if (cuts.length) {
    for (let i = 0; i < cuts.length; i++) {
      const cut = cuts[i];
      const item = itemByKey.get(cut.sceneKey);
      if (!item) continue;
      const end = i + 1 < cuts.length ? cuts[i + 1].t : payload.totalDuration;
      const duration = Math.max(0.1, end - cut.t);
      clips.push({ id: uid(), trackId: 'v1', start: cut.t, duration, kind: 'media', label: item.name, assetId: item.id, srcIn: 0 });
    }
  } else if (payload.scenes.length) {
    // No live cut-list → lay the available scenes out sequentially.
    const per = (payload.totalDuration || payload.scenes.length * 4) / payload.scenes.length;
    payload.scenes.forEach((s, i) => {
      const item = itemByKey.get(s.key);
      if (!item) return;
      clips.push({ id: uid(), trackId: 'v1', start: i * per, duration: per, kind: 'media', label: item.name, assetId: item.id, srcIn: 0 });
    });
  }
  return clips;
}

function buildProduction(payload: PixelsExportPayload) {
  const editId = uid();
  const mediaPool: FabulaMediaItem[] = [];
  const itemByKey = new Map<string, FabulaMediaItem>();
  for (const scene of payload.scenes) {
    const item = sceneToMediaItem(scene);
    mediaPool.push(item); itemByKey.set(scene.key, item);
  }

  const clips = buildClips(payload, itemByKey);

  let songItem: FabulaMediaItem | undefined;
  if (payload.song) {
    songItem = { id: uid(), name: payload.song.name, type: 'audio', url: payload.song.url, duration: payload.song.duration, bin: 'Music', tags: ['pixels'], offline: !payload.song.url };
    mediaPool.push(songItem);
    clips.push({ id: uid(), trackId: 'a1', start: 0, duration: payload.song.duration || payload.totalDuration, kind: 'media', label: payload.song.name, assetId: songItem.id, srcIn: 0 });
  }

  const fps = payload.fps || 30;
  const now = Date.now();
  const prod = {
    id: uid(), title: payload.title || 'Pixels Session', type: 'film', description: 'Imported from Plajah Pixels',
    themes: '', world: '', cast: [],
    mediaPool,
    defaults: {
      style: '', aspect: '16:9', service: 'kling', stillTarget: 'mj_magnific',
      format: { preset: 'hd1080', label: 'HD 1080p', w: 1920, h: 1080, fps, drop: false },
    },
    acts: [1, 2, 3].map((n) => ({ id: uid(), number: n, title: 'ACT ' + ['I', 'II', 'III'][n - 1], scenes: [] })),
    edits: [{ id: editId, title: payload.title || 'Pixels Session', timeline: { clips, trackSettings: {} }, updatedAt: now }],
    worldCats: {}, design: {},
    pixelsConfig: { colorPalette: payload.palette || [] }, // for Fabula's Pixels-powered render
    createdAt: now, updatedAt: now,
  };
  return { prod, editId };
}

/**
 * Write the production into Fabula's IndexedDB store and set a handoff key so Fabula
 * opens it on next boot. Returns the new production + edit ids. Best-effort: throws
 * only on a hard idb failure.
 */
export async function exportPixelsToFabula(payload: PixelsExportPayload): Promise<{ prodId: string; editId: string }> {
  const { prod, editId } = buildProduction(payload);
  await idbSet('studio:prod:' + prod.id, prod);
  const idx = (await idbGet('studio:index')) as { list?: any[] } | undefined;
  const entry = { id: prod.id, title: prod.title, type: prod.type, updated: Date.now(), sceneCount: 0 };
  const list = [entry, ...((idx?.list || []).filter((x: any) => x.id !== prod.id))];
  await idbSet('studio:index', { list });
  await idbSet('studio:handoff', { prodId: prod.id, editId });
  return { prodId: prod.id, editId };
}

/** CMX3600 EDL for the cut-list (matches Fabula's own EDL format → conformable). */
export function cutListToEDL(payload: PixelsExportPayload): string {
  const fps = payload.fps || 30;
  const tc = (s: number) => {
    const f = Math.round((s + 3600) * fps); // +1h per EDL convention
    const ff = f % fps; const tot = (f - ff) / fps;
    const ss = tot % 60; const mm = ((tot - ss) / 60) % 60; const hh = Math.floor(tot / 3600);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
  };
  const nameByKey = new Map(payload.scenes.map(s => [s.key, s.name]));
  const cuts = payload.cuts.length
    ? [...payload.cuts].sort((a, b) => a.t - b.t)
    : payload.scenes.map((s, i) => ({ sceneKey: s.key, t: i * ((payload.totalDuration || payload.scenes.length * 4) / Math.max(1, payload.scenes.length)) }));
  const lines = [`TITLE: ${(payload.title || 'PIXELS SESSION').toUpperCase()}`, 'FCM: NON-DROP FRAME', ''];
  cuts.forEach((cut, i) => {
    const end = i + 1 < cuts.length ? cuts[i + 1].t : payload.totalDuration;
    const dur = Math.max(0.1, end - cut.t);
    lines.push(`${String(i + 1).padStart(3, '0')}  AX       V     C        ${tc(0)} ${tc(dur)} ${tc(cut.t)} ${tc(cut.t + dur)}`);
    lines.push(`* FROM CLIP NAME: ${(nameByKey.get(cut.sceneKey) || 'scene').slice(0, 60)}`);
  });
  return lines.join('\n') + '\n';
}
