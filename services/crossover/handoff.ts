// How media moves between Crossover and the other studios. A view may not be mounted yet when
// something is sent to it, so items wait here until it collects them.

import { sortCues, type CaptionCue } from './captions';

export type HandoffTarget = 'crossover' | 'fabula' | 'pixels';

export interface MediaHandoff {
  name: string;
  file?: File | Blob;
  /** Local path, in the desktop app. */
  path?: string;
  url?: string;
  sizeBytes?: number;
  /** Captions travelling with the media, or on their own. */
  cues?: CaptionCue[];
  /** Fabula: the timeline second cue 0 sits at. */
  timelineOffsetSec?: number;
}

const waiting: Record<HandoffTarget, MediaHandoff[]> = { crossover: [], fabula: [], pixels: [] };
const EVENT = 'plajah:handoff';
const OPEN: Record<HandoffTarget, string> = { crossover: 'OPEN_CROSSOVER_MEDIA', fabula: 'OPEN_FABULA_MEDIA', pixels: 'OPEN_PIXELS_MEDIA' };

/** The shapes senders already use: a browser File, or the desktop's picked-file record. */
export function normalizeHandoff(detail: any): MediaHandoff | null {
  const f = detail?.file ?? detail;
  if (!f) return null;
  if (typeof Blob !== 'undefined' && f instanceof Blob) {
    return { name: (f as File).name || detail?.name || 'media', file: f, sizeBytes: f.size, cues: detail?.cues, timelineOffsetSec: detail?.timelineOffsetSec };
  }
  if (!f.name && !f.url && !detail?.cues) return null;
  return {
    name: f.name || detail?.name || 'media',
    path: f.fullPath ?? f.path,
    url: f.url,
    sizeBytes: f.size ?? f.sizeBytes,
    cues: detail?.cues ?? f.cues,
    timelineOffsetSec: detail?.timelineOffsetSec,
  };
}

/** App calls this when an OPEN_*_MEDIA event arrives, then switches view. */
export function acceptHandoff(target: HandoffTarget, detail: any): void {
  const item = normalizeHandoff(detail);
  if (!item) return;
  waiting[target].push(item);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: { target } }));
}

/** Everything waiting for this view, once. */
export const takeHandoffs = (target: HandoffTarget): MediaHandoff[] => waiting[target].splice(0);

/** Collect now, and again whenever more arrives. Returns the unsubscribe. */
export function subscribeHandoffs(target: HandoffTarget, on: (items: MediaHandoff[]) => void): () => void {
  const drain = () => { const items = takeHandoffs(target); if (items.length) on(items); };
  const handler = (e: Event) => { if ((e as CustomEvent).detail?.target === target) drain(); };
  window.addEventListener(EVENT, handler);
  drain();
  return () => window.removeEventListener(EVENT, handler);
}

/** Send something to another studio from anywhere. */
export function sendTo(target: HandoffTarget, item: MediaHandoff): void {
  window.dispatchEvent(new CustomEvent(OPEN[target], { detail: item }));
}

// ── Fabula subtitle clips ───────────────────────────────────────────────────

/** Fabula's subtitle clips to cues, so a timeline's captions can go out as MCC, SCC or anything else. */
export function clipsToCues(clips: { id?: string; kind?: string; start: number; duration: number; text?: string }[]): CaptionCue[] {
  return sortCues(clips
    .filter((c) => c.kind === 'subtitle' && (c.text || '').trim())
    .map((c, i) => ({ id: c.id ?? `clip${i}`, startSec: c.start, endSec: c.start + c.duration, text: (c.text || '').trim() })));
}

/** Cues to the fields of Fabula's subtitle clips; Fabula adds its own ids, track and styling. */
export function cuesToClipFields(cues: CaptionCue[], offsetSec = 0) {
  return sortCues(cues).map((c) => ({ start: c.startSec + offsetSec, duration: Math.max(0.1, c.endSec - c.startSec), text: c.text.replace(/<[^>]+>/g, ''), label: 'Subtitle' }));
}
