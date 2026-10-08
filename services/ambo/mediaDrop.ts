// mediaDrop — turns dropped / imported media into Ambo slides. Pure (no DOM), so the
// multi-file rules are unit-tested. One kind table (mediaLibrary.classifyFile) feeds it.

import { newId, type Slide, type SlideLayer, type LayerContent, type Show, type PlaylistItem } from './showModel';
import type { MediaKindOrDoc } from './mediaLibrary';

export interface DropMedia {
  name: string;
  kind: MediaKindOrDoc | null;
  url: string;
}

const stem = (n: string) => n.replace(/\.[^/.]+$/, '');

/** A fresh slide for one dropped file (DOC / unknown kinds produce nothing). */
export function slideFromMedia(m: DropMedia): Slide | null {
  const label = stem(m.name);
  switch (m.kind) {
    case 'AUDIO':
      return {
        id: newId('sl_audio'), label, group: 'Audio Assets', groupColor: '#D0BCFF',
        layers: [
          { id: newId('ly_bg'), slot: 'background', content: { kind: 'GENERATOR', mode: 'WAVEFORM' } },
          { id: newId('ly_txt'), slot: 'slide', content: { kind: 'TEXT', blocks: [{ text: label, role: 'title' }, { text: 'Local Audio File • Playback', role: 'caption' }], style: { align: 'center', valign: 'middle' } } },
          { id: newId('ly_audio'), slot: 'overlay', content: { kind: 'AUDIO', src: m.url, volume: 1.0, loop: false } },
        ],
        onEnter: [{ kind: 'AUDIO_PLAY', src: m.url, volume: 1.0 }],
      };
    case 'VIDEO':
      return { id: newId('sl_video'), label, group: 'Video Media', groupColor: '#00DAF3', layers: [{ id: newId('ly_bg'), slot: 'background', content: { kind: 'VIDEO', src: m.url, loop: true } }] };
    case 'IMAGE':
      return { id: newId('sl_image'), label, group: 'Photos', groupColor: '#10B981', layers: [{ id: newId('ly_bg'), slot: 'background', content: { kind: 'IMAGE', src: m.url } }] };
    case 'LOTTIE':
      return {
        id: newId('sl_lottie'), label, group: 'Motion Graphics', groupColor: '#FF8C00',
        layers: [
          { id: newId('ly_bg'), slot: 'background', content: { kind: 'GENERATOR', mode: 'STUDIO_AURORA' } },
          { id: newId('ly_prop'), slot: 'prop', content: { kind: 'LOTTIE', src: m.url, loop: true } },
        ],
      };
    default:
      return null;
  }
}

function setBackground(slide: Slide, content: LayerContent): SlideLayer[] {
  const existing = slide.layers.find(l => l.slot === 'background');
  return existing
    ? slide.layers.map(l => (l.slot === 'background' ? { ...l, content } : l))
    : [{ id: newId('ly_bg'), slot: 'background', content }, ...slide.layers];
}

/**
 * Multi-file drop onto ONE slide card: the first image/video becomes its background, the
 * first audio becomes its audio cue, the first Lottie becomes its prop; EVERYTHING ELSE is
 * returned as new slides to insert right after it (in drop order). Nothing is dropped
 * silently except DOC/unknown kinds, which are reported in `skipped`.
 */
export function applyMediaToSlide(slide: Slide, media: DropMedia[]): { slide: Slide; extra: Slide[]; skipped: string[] } {
  let layers = slide.layers;
  let onEnter = slide.onEnter;
  let bgUsed = false, audioUsed = false, lottieUsed = false;
  const extra: Slide[] = [];
  const skipped: string[] = [];
  let working: Slide = slide;

  for (const m of media) {
    if (!m.kind || m.kind === 'DOC') { skipped.push(m.name); continue; }
    if ((m.kind === 'IMAGE' || m.kind === 'VIDEO') && !bgUsed) {
      bgUsed = true;
      working = { ...working, layers };
      layers = setBackground(working, m.kind === 'VIDEO' ? { kind: 'VIDEO', src: m.url, loop: true } : { kind: 'IMAGE', src: m.url });
    } else if (m.kind === 'AUDIO' && !audioUsed) {
      audioUsed = true;
      layers = [...layers.filter(l => l.content.kind !== 'AUDIO'), { id: newId('ly_audio'), slot: 'overlay', content: { kind: 'AUDIO', src: m.url, volume: 1.0 } }];
      onEnter = [...(onEnter || []).filter(a => a.kind !== 'AUDIO_PLAY'), { kind: 'AUDIO_PLAY' as const, src: m.url, volume: 1.0 }];
    } else if (m.kind === 'LOTTIE' && !lottieUsed) {
      lottieUsed = true;
      layers = [...layers.filter(l => l.content.kind !== 'LOTTIE'), { id: newId('ly_prop'), slot: 'prop', content: { kind: 'LOTTIE', src: m.url, loop: true } }];
    } else {
      const s = slideFromMedia(m);
      if (s) extra.push(s);
    }
  }
  return { slide: { ...slide, layers, onEnter }, extra, skipped };
}

/** A media-library drag payload (`ambo-source`) as a DropMedia, or null for LIVE / GENERATOR / SHADER sources. */
export function sourceToDropMedia(item: { name: string; kind: string; src?: string }): DropMedia | null {
  if (!item.src) return null;
  if (item.kind === 'IMAGE' || item.kind === 'VIDEO' || item.kind === 'AUDIO' || item.kind === 'LOTTIE') {
    return { name: item.name, kind: item.kind, url: item.src };
  }
  return null;
}

/** Service-plan entry for one dropped media item: its own one-slide show, like adding a song to the plan. */
export function playlistItemFromMedia(m: DropMedia): PlaylistItem | null {
  const slide = slideFromMedia(m);
  if (!slide) return null;
  const title = stem(m.name);
  const show: Show = { id: newId('show'), title, kind: 'MEDIA', slides: [slide] };
  return { id: newId('pi'), title, show, plannedSec: m.kind === 'IMAGE' ? 30 : 120 };
}
