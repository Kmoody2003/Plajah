// components/plajahPixels/pixelsProjectDoc.ts — the one serializable document behind a Pixels set.
//
// Pixels keeps its state spread across the studio (config, two background media pools, the clip
// launcher's layer stack, the active look). This module folds that into a plain-JSON
// PixelsProjectDoc for local autosave (IndexedDB), personal cloud history (creative cloud) and live
// co-editing (services/coedit), and applies a doc back onto the studio touching only what changed —
// so a collaborator nudging one slider doesn't restart audio, re-import the launcher or reset media.
//
// Not in the doc (device-local by nature): blob:/data: media (user uploads, embedded .plajah media),
// uploaded audio files, MediaStreams, the launched column of each layer (performance state), the
// shader start clock. Local-only media stays put when a remote doc is applied.

import type { BackgroundMedia, VisualizationConfig, VisualizerMode } from './types';
import type { LauncherClip, LauncherLayer } from './components/ClipLauncher';
import type { Three3DConfig } from './components/ThreeScene';
import type { PathLabeler } from '../../services/coedit/labels';

export const PIXELS_DOC_FORMAT = 'plajah-pixels-doc' as const;
export const PIXELS_COEDIT_KIND = 'pixels';

/**
 * The active look on the canvas (library generator / shader / milkdrop / 3D / MIDI notes).
 * Milkdrop blend + opacity are left out on purpose: the launcher drives them per fired clip and its
 * modulation bus rewrites the opacity at audio rate, which would flood the shared history.
 */
export interface PixelsLook {
  shaderSrc: string | null;
  shaderParams: number[];
  libraryGeneratorMode: VisualizerMode | null;
  milkdrop: boolean;
  milkdropIdx: number;
  midiNotes: boolean;
  three3d: Three3DConfig | null;
}

/** The session's audio. `url` only when it's a shareable remote URL (e.g. a Storage download URL). */
export interface PixelsAudioRef {
  name?: string;
  url?: string;
}

/** A launcher clip whose media lives only on the device that added it (blob:/data:). */
export type PixelsDocClip = LauncherClip & { localOnly?: boolean };
/** A launcher layer minus its launched column (each performer launches on their own deck). */
export type PixelsDocLayer = Omit<LauncherLayer, 'activeCol' | 'clips'> & { clips: (PixelsDocClip | null)[] };

export interface PixelsProjectDoc {
  format: typeof PIXELS_DOC_FORMAT;
  v: 1;
  id: string;
  title: string;
  updatedAt: number;
  config: VisualizationConfig;
  bgMedia1: BackgroundMedia[];
  bgMedia2: BackgroundMedia[];
  layers: PixelsDocLayer[];
  look: PixelsLook;
  audio: PixelsAudioRef;
}

/** Everything the studio holds that the doc is built from. */
export interface PixelsLiveState {
  config: VisualizationConfig;
  bgMedia1: BackgroundMedia[];
  bgMedia2: BackgroundMedia[];
  layers: LauncherLayer[];
  look: PixelsLook;
  audio: PixelsAudioRef;
}

/** How a doc lands back on the studio. Each setter is only called for a part that changed. */
export interface PixelsApplyTarget {
  setConfig: (c: VisualizationConfig) => void;
  setBgMedia1: (m: BackgroundMedia[]) => void;
  setBgMedia2: (m: BackgroundMedia[]) => void;
  importLayers: (layers: LauncherLayer[]) => void;
  setLook: (patch: Partial<PixelsLook>) => void;
  /** Load a remote audio URL (paused, as a project load does). */
  loadAudio: (ref: PixelsAudioRef & { url: string }) => void;
  /** Only the label changed (the audio itself isn't shareable). */
  setAudioName: (name: string | undefined) => void;
}

export interface PixelsApplyOptions {
  /** The platform's global player owns audio (Pixels opened from a track): never touch it. */
  skipAudio?: boolean;
  /** The platform feeds album art into media pool 1. */
  skipBgMedia1?: boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────────

export const newPixelsProjectId = () =>
  `pix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Media that only resolves on this device (or is too heavy to sync live). */
export const isLocalOnlyUrl = (url: string | undefined | null) =>
  !!url && /^(blob:|data:|mediastream:)/i.test(url);

export const isShareableUrl = (url: string | undefined | null) => !!url && /^https?:\/\//i.test(url);

/** Order-independent JSON — the content key that decides "did anything really change". */
export function stableKey(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) out[k] = (val as Record<string, unknown>)[k];
      return out;
    }
    return val;
  });
}

function dropUndefined<T extends object>(o: T): T {
  const out = {} as T;
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

/** Id-keyed lists merge per element only when ids are unique strings; make them so. */
function uniqueIds<T extends { id: string }>(list: T[], prefix: string): T[] {
  const seen = new Set<string>();
  let changed = false;
  const out = list.map((e, i) => {
    let id = typeof e.id === 'string' && e.id ? e.id : `${prefix}-${i}`;
    if (seen.has(id)) {
      let n = 2;
      while (seen.has(`${id}~${n}`)) n++;
      id = `${id}~${n}`;
    }
    seen.add(id);
    if (id === e.id) return e;
    changed = true;
    return { ...e, id };
  });
  return changed ? out : list;
}

function docClip(c: LauncherClip | null): PixelsDocClip | null {
  if (!c) return null;
  if (c.type === 'media' && isLocalOnlyUrl(c.mediaUrl)) {
    return dropUndefined({ ...c, mediaUrl: undefined, localOnly: true });
  }
  return c;
}

function docLayer(l: LauncherLayer): PixelsDocLayer {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { activeCol, clips, ...rest } = l;
  return dropUndefined({
    ...rest,
    autoMode: rest.autoMode ?? 'off',
    autoInterval: rest.autoInterval ?? 4,
    clips: (Array.isArray(clips) ? clips : []).map(docClip),
  });
}

/** The layer stack as it goes into the doc (no launched column, no device-local media). */
export function docLayers(layers: LauncherLayer[]): PixelsDocLayer[] {
  return uniqueIds(layers.map(docLayer), 'layer');
}

function docMedia(list: BackgroundMedia[], prefix: string): BackgroundMedia[] {
  return uniqueIds(list.filter((m) => m && !isLocalOnlyUrl(m.url)), prefix);
}

function docConfig(c: VisualizationConfig): VisualizationConfig {
  const emitters = Array.isArray(c.emitters) ? uniqueIds(c.emitters, 'emitter') : c.emitters;
  return emitters === c.emitters ? c : { ...c, emitters };
}

// ── build ────────────────────────────────────────────────────────────────────

export function buildPixelsDoc(meta: { id: string; title: string; updatedAt: number }, s: PixelsLiveState): PixelsProjectDoc {
  return {
    format: PIXELS_DOC_FORMAT,
    v: 1,
    id: meta.id,
    title: meta.title,
    updatedAt: meta.updatedAt,
    config: docConfig(s.config),
    bgMedia1: docMedia(s.bgMedia1, 'bg1'),
    bgMedia2: docMedia(s.bgMedia2, 'bg2'),
    layers: docLayers(s.layers),
    look: dropUndefined({ ...s.look, shaderParams: [...(s.look.shaderParams ?? [])] }),
    audio: dropUndefined({
      name: s.audio.name,
      url: isShareableUrl(s.audio.url) ? s.audio.url : undefined,
    }),
  };
}

/** Content key: everything except the save clock. */
export function pixelsDocKey(doc: PixelsProjectDoc): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { updatedAt, ...rest } = doc;
  return stableKey(rest);
}

export function parsePixelsDoc(input: string | unknown): PixelsProjectDoc | null {
  try {
    const d = (typeof input === 'string' ? JSON.parse(input) : input) as Partial<PixelsProjectDoc> | null;
    if (!d || d.format !== PIXELS_DOC_FORMAT || typeof d.id !== 'string' || !d.config) return null;
    return {
      format: PIXELS_DOC_FORMAT,
      v: 1,
      id: d.id,
      title: typeof d.title === 'string' ? d.title : 'Pixels set',
      updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
      config: d.config,
      bgMedia1: Array.isArray(d.bgMedia1) ? d.bgMedia1 : [],
      bgMedia2: Array.isArray(d.bgMedia2) ? d.bgMedia2 : [],
      layers: Array.isArray(d.layers) ? d.layers : [],
      look: { ...DEFAULT_LOOK, ...(d.look ?? {}) },
      audio: d.audio ?? {},
    };
  } catch {
    return null;
  }
}

const DEFAULT_LOOK: PixelsLook = {
  shaderSrc: null,
  shaderParams: [0.5, 0.5, 0.5, 0.5],
  libraryGeneratorMode: null,
  milkdrop: false,
  milkdropIdx: 0,
  midiNotes: false,
  three3d: null,
};

// ── apply ────────────────────────────────────────────────────────────────────

/** Doc layers back onto the live deck: keep each layer's launched column and this device's media. */
export function mergeLayersKeepingLocal(incoming: PixelsDocLayer[], local: LauncherLayer[]): LauncherLayer[] {
  const byId = new Map(local.map((l) => [l.id, l]));
  return incoming.map((l) => {
    const mine = byId.get(l.id);
    const clips = (l.clips ?? []).map((c, ci) => {
      if (!c) return null;
      if (c.localOnly && !c.mediaUrl) {
        const own = mine?.clips?.[ci];
        if (own && own.id === c.id && own.mediaUrl) return { ...c, mediaUrl: own.mediaUrl } as LauncherClip;
      }
      return c as LauncherClip;
    });
    const activeCol = mine && mine.activeCol != null && mine.activeCol < clips.length && clips[mine.activeCol] ? mine.activeCol : null;
    return { ...l, clips, activeCol } as LauncherLayer;
  });
}

/** Doc media list + this device's local-only media (uploads stay where they were). */
export function mergeMediaKeepingLocal(incoming: BackgroundMedia[], local: BackgroundMedia[]): BackgroundMedia[] {
  const ids = new Set(incoming.map((m) => m.id));
  const mineOnly = local.filter((m) => isLocalOnlyUrl(m.url) && !ids.has(m.id));
  return mineOnly.length ? [...mineOnly, ...incoming] : incoming;
}

const LOOK_KEYS: (keyof PixelsLook)[] = [
  'shaderSrc', 'shaderParams', 'libraryGeneratorMode', 'milkdrop', 'milkdropIdx', 'midiNotes', 'three3d',
];

/**
 * Applies `doc` onto the studio, part by part, calling only the setters whose part changed. Returns
 * the layers it imported (null when the deck was left alone).
 */
export function applyPixelsDoc(
  doc: PixelsProjectDoc,
  cur: PixelsLiveState,
  t: PixelsApplyTarget,
  opts: PixelsApplyOptions = {}
): LauncherLayer[] | null {
  if (stableKey(doc.config) !== stableKey(docConfig(cur.config))) t.setConfig(doc.config);

  if (!opts.skipBgMedia1 && stableKey(doc.bgMedia1) !== stableKey(docMedia(cur.bgMedia1, 'bg1')))
    t.setBgMedia1(mergeMediaKeepingLocal(doc.bgMedia1, cur.bgMedia1));
  if (stableKey(doc.bgMedia2) !== stableKey(docMedia(cur.bgMedia2, 'bg2')))
    t.setBgMedia2(mergeMediaKeepingLocal(doc.bgMedia2, cur.bgMedia2));

  let imported: LauncherLayer[] | null = null;
  if (doc.layers.length && stableKey(doc.layers) !== stableKey(docLayers(cur.layers))) {
    imported = mergeLayersKeepingLocal(doc.layers, cur.layers);
    t.importLayers(imported);
  }

  const lookPatch: Partial<PixelsLook> = {};
  const look = { ...DEFAULT_LOOK, ...doc.look };
  for (const k of LOOK_KEYS) {
    if (stableKey(look[k] ?? null) !== stableKey(cur.look[k] ?? null)) (lookPatch as Record<string, unknown>)[k] = look[k];
  }
  if (Object.keys(lookPatch).length) t.setLook(lookPatch);

  if (!opts.skipAudio) {
    const a = doc.audio ?? {};
    if (isShareableUrl(a.url) && a.url !== cur.audio.url) t.loadAudio({ ...a, url: a.url! });
    else if (!isShareableUrl(a.url) && a.name !== cur.audio.name) t.setAudioName(a.name);
  }
  return imported;
}

/** Friendlier history/activity labels ("Look › Shader", "Deck › VIZ"). */
export const pixelsLabeler: PathLabeler = {
  key: (k) =>
    ({
      config: 'Settings',
      bgMedia1: 'Media pool 1',
      bgMedia2: 'Media pool 2',
      layers: 'Deck',
      look: 'Look',
      audio: 'Audio',
      shaderSrc: 'Shader',
      shaderParams: 'Shader params',
      libraryGeneratorMode: 'Generator',
      three3d: '3D scene',
      midiNotes: 'MIDI notes',
      colorPalette: 'Palette',
    } as Record<string, string>)[k],
};
