// Send a Stage presentation to Fabula as an edit timeline.
//
// Each slide becomes clips laid end to end with the same timing as Stage's
// timeline strip (own duration, else the presentation default — 8s):
//
//   V1 · PICTURE    the slide's video / image (video keeps its in point); if the
//                   slide has neither but has a rendered thumbnail, that still
//   S1 · SUBTITLES  the slide's words as a Fabula title clip (scripture, lyrics
//                   and Tela text included); a picture-less, word-less slide
//                   (generator, shader, live input) gets a title with its name so
//                   its slot on the timeline is still visible
//   A2 · MUSIC      the slide's audio bed, for the slide's span
//
// Uses Fabula's own import seam (production in IndexedDB + `studio:handoff` +
// OPEN_FABULA), the same path Melos and Dossier use. Local media (blob: / data:
// URLs) is copied into Fabula's OPFS media store so it survives a reload.

import { set as idbSet, get as idbGet } from 'idb-keyval';
import { putBytes as mediaPutBytes } from '../fabula/mediaStore';
import { packSequential } from '../fabula/clipEditStack';
import type { Show, Slide, LayerContent } from './showModel';
import { slideText } from './servicePlanDemo';
import { slideDurationSec } from './presentationTimeline';

const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

const SUB_FX = { op: 1, sc: 1, x: 0, y: 0, rot: 0, blur: 0, bri: 1, con: 1, sat: 1, blend: 'screen', fadeIn: 0.1, fadeOut: 0.15, matte: { t: 'none', x: 50, y: 50, w: 60, h: 60, f: 0 }, genNote: '' };
const TRACKS = [
  { id: 's1', name: 'S1 · SUBTITLES', type: 'subtitle' },
  { id: 'v2', name: 'V2 · OVERLAY', type: 'video' },
  { id: 'v1', name: 'V1 · PICTURE', type: 'video' },
  { id: 'a1', name: 'A1 · DIALOGUE', type: 'audio' },
  { id: 'a2', name: 'A2 · MUSIC', type: 'audio' },
];

export interface FabulaAssetDraft { id: string; name: string; type: 'video' | 'image' | 'audio'; src: string; bin: string; tags: string[] }
export interface FabulaClipDraft {
  id: string; trackId: string; start: number; duration: number; srcIn: number;
  kind: 'media' | 'title'; label: string; assetId?: string; text?: string; subtitle?: string; titleStyle?: string; fx?: any;
  ambo?: { slideId: string };
}

function picture(slide: Slide): Extract<LayerContent, { kind: 'VIDEO' | 'IMAGE' }> | null {
  const vis = slide.layers.filter(l => l.enabled !== false && l.visible !== false);
  const bg = vis.find(l => l.slot === 'background' && (l.content.kind === 'VIDEO' || l.content.kind === 'IMAGE'))
    ?? vis.find(l => l.content.kind === 'VIDEO' || l.content.kind === 'IMAGE');
  const c = bg?.content;
  return c && (c.kind === 'VIDEO' || c.kind === 'IMAGE') && c.src ? c : null;
}

function audio(slide: Slide): string | null {
  const l = slide.layers.find(x => x.enabled !== false && x.content.kind === 'AUDIO' && (x.content as any).src);
  if (l) return (l.content as Extract<LayerContent, { kind: 'AUDIO' }>).src;
  const a = slide.onEnter?.find(x => x.kind === 'AUDIO_PLAY') as { src?: string } | undefined;
  return a?.src || null;
}

function words(slide: Slide): { text: string; subtitle: string } | null {
  for (const l of slide.layers) {
    const c = l.content;
    if (c.kind === 'SCRIPTURE' && (c.lines?.length || c.reference)) return { text: (c.lines || []).join(' '), subtitle: c.reference || '' };
    if (c.kind === 'LYRICS' && c.lines.length) return { text: c.lines.map(x => x.text).join(' / ').slice(0, 400), subtitle: [c.title, c.artist].filter(Boolean).join(' — ') };
    if (c.kind === 'TEXT' && c.blocks.length) {
      const title = c.blocks.find(b => b.role === 'title') ?? c.blocks[0];
      const rest = c.blocks.filter(b => b !== title).map(b => b.text).join(' ');
      return { text: title.text, subtitle: rest };
    }
  }
  const t = slideText(slide);
  return t && t !== slide.label ? { text: t, subtitle: '' } : null;
}

/** Pure mapping: presentation → Fabula assets + clips (asset `src` still the Stage URL). */
export function buildFabulaTimeline(show: Show, slides: readonly Slide[] = show.slides): { assets: FabulaAssetDraft[]; clips: FabulaClipDraft[]; total: number } {
  const assets: FabulaAssetDraft[] = [];
  const bySrc = new Map<string, string>();
  const assetFor = (src: string, type: FabulaAssetDraft['type'], name: string): string => {
    const k = `${type}|${src}`;
    const hit = bySrc.get(k);
    if (hit) return hit;
    const id = uid();
    assets.push({ id, name, type, src, bin: 'Stage', tags: ['stage', 'ambo'] });
    bySrc.set(k, id);
    return id;
  };

  const spans = packSequential(slides.map(s => ({ slide: s, start: 0, duration: slideDurationSec(s, show) })));
  const clips: FabulaClipDraft[] = [];
  spans.forEach(({ slide, start, duration }, i) => {
    const label = slide.label || `Slide ${i + 1}`;
    const ambo = { slideId: slide.id };
    const pic = picture(slide);
    if (pic) {
      clips.push({ id: uid(), trackId: 'v1', start, duration, srcIn: pic.kind === 'VIDEO' ? Math.max(0, pic.inSec || 0) : 0, kind: 'media', label, assetId: assetFor(pic.src, pic.kind === 'VIDEO' ? 'video' : 'image', label), ambo });
    } else if (slide.thumb) {
      clips.push({ id: uid(), trackId: 'v1', start, duration, srcIn: 0, kind: 'media', label, assetId: assetFor(slide.thumb, 'image', `${label} (still)`), ambo });
    }
    const w = words(slide);
    if (w || !pic) {
      clips.push({ id: uid(), trackId: 's1', start, duration, srcIn: 0, kind: 'title', text: w?.text || label, subtitle: w?.subtitle || '', titleStyle: 'modern', label, fx: { ...SUB_FX }, ambo });
    }
    const snd = audio(slide);
    if (snd) clips.push({ id: uid(), trackId: 'a2', start, duration, srcIn: 0, kind: 'media', label: `${label} · audio`, assetId: assetFor(snd, 'audio', `${label} audio`), ambo });
  });
  const last = spans[spans.length - 1];
  return { assets, clips, total: last ? last.start + last.duration : 0 };
}

/** Builds the production, stores it where Fabula reads it, and opens Fabula on the new edit. */
export async function sendPresentationToFabula(show: Show, slides: readonly Slide[] = show.slides): Promise<{ prodId: string; editId: string; skipped: number }> {
  const { assets, clips } = buildFabulaTimeline(show, slides);
  let skipped = 0;
  const mediaPool = await Promise.all(assets.map(async a => {
    const base = { id: a.id, name: a.name, type: a.type, bin: a.bin, tags: a.tags, amboSrc: a.src };
    if (/^(blob|data):/i.test(a.src)) {
      try {
        const blob = await (await fetch(a.src)).blob();
        await mediaPutBytes(`studio:blob:${a.id}`, blob);
        return { ...base, offline: true };
      } catch { skipped++; return { ...base, offline: true }; }
    }
    return { ...base, url: a.src };
  }));

  const title = (show.title || 'Stage Presentation').slice(0, 80);
  const prodId = uid(), editId = uid(), now = Date.now();
  const prod = {
    id: prodId, title, type: 'film', description: 'From Stage', themes: '', world: '', cast: [], mediaPool,
    tracks: TRACKS.map(t => ({ ...t })),
    defaults: { style: '', aspect: '16:9', service: 'kling', stillTarget: 'mj_magnific', format: { preset: 'hd1080', label: 'HD 1080p', w: 1920, h: 1080, fps: 30, drop: false } },
    acts: [1, 2, 3].map(n => ({ id: uid(), number: n, title: `ACT ${['I', 'II', 'III'][n - 1]}`, scenes: [] })),
    edits: [{ id: editId, title, timeline: { clips, trackSettings: {} }, updatedAt: now }],
    worldCats: {}, design: {}, createdAt: now, updatedAt: now,
    ambo: { showId: show.id },
  };

  await idbSet(`studio:prod:${prodId}`, prod);
  const idx = ((await idbGet('studio:index')) as { list?: { id: string }[] } | undefined) || {};
  await idbSet('studio:index', { list: [{ id: prodId, title, type: 'film', updated: now, sceneCount: 0 }, ...((idx.list || []).filter(x => x.id !== prodId))] });
  await idbSet('studio:handoff', { prodId, editId });
  window.dispatchEvent(new CustomEvent('OPEN_FABULA'));
  return { prodId, editId, skipped };
}
