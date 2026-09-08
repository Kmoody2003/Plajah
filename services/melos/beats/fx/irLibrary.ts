// irLibrary — the real-recording impulse-response bank for the convolution reverbs.
//
// The modelled SpacesDevice synthesises rooms at zero bytes; this is the complement — actual recorded
// IRs (springs, rooms, cabinets, and, once fetched, halls & cathedrals) served from /public/irs and
// decoded to AudioBuffers on demand. Every IR here is CLEARED for commercial redistribution with credit
// (see docs/fabula/IR_LIBRARY_SOURCES.md); nothing non-commercial or no-redistribution ships.
//
// Loading is async (fetch + decodeAudioData) with a per-sample-rate cache; devices read the cache
// synchronously (so the offline album render is deterministic) and fall back to a modelled IR until the
// real one is decoded. Call preloadIrs() before an offline export so the render includes the real tails.

export type IrCategory = 'Spring' | 'Room' | 'Cabinet' | 'Chamber' | 'Hall' | 'Cathedral' | 'Plate' | 'Weird';

export interface IrDef {
  /** Stable id = filename stem. */
  id: string;
  name: string;
  category: IrCategory;
  /** Path under /public/irs (e.g. "akrt/spring-short.wav"). */
  file: string;
  seconds: number;
  channels: number;
  credit: string;
  license: string;
}

const AKRT = 'Adventure Kid Reverb Tools (AKRT) — Kristoffer Ekstrand, adventurekid.se';
const CC_BY_4 = 'CC BY 4.0';

// The bundled seed set (AKRT, CC BY 4.0). The fetch script (scripts/fetchIrs.mjs) can expand this with
// the full AKRT packs and hand-picked OpenAIR CC-BY halls/cathedrals — add their entries here as they
// land under /public/irs.
export const IR_LIBRARY: IrDef[] = [
  { id: 'spring-short', name: 'Spring — Short', category: 'Spring', file: 'akrt/spring-short.wav', seconds: 1.79, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'spring-tank', name: 'Spring — Tank', category: 'Spring', file: 'akrt/spring-tank.wav', seconds: 2.18, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'spring-medium', name: 'Spring — Medium', category: 'Spring', file: 'akrt/spring-medium.wav', seconds: 2.88, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'spring-long', name: 'Spring — Long', category: 'Spring', file: 'akrt/spring-long.wav', seconds: 4.01, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'spring-cavern', name: 'Spring — Cavern', category: 'Spring', file: 'akrt/spring-cavern.wav', seconds: 6.91, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'room-booth', name: 'Vocal Booth', category: 'Room', file: 'akrt/room-booth.wav', seconds: 0.24, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'room-tight', name: 'Tight Room', category: 'Room', file: 'akrt/room-tight.wav', seconds: 0.35, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'room-chamber', name: 'Small Chamber', category: 'Chamber', file: 'akrt/room-chamber.wav', seconds: 0.35, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'room-hall-ish', name: 'Live Room', category: 'Room', file: 'akrt/room-hall-ish.wav', seconds: 0.31, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'room-plate-ish', name: 'Bright Plate', category: 'Plate', file: 'akrt/room-plate-ish.wav', seconds: 0.55, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'room-live', name: 'Large Live Room', category: 'Room', file: 'akrt/room-live.wav', seconds: 0.59, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'cab-speaker', name: 'Speaker Cab', category: 'Cabinet', file: 'akrt/cab-speaker.wav', seconds: 0.23, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'cab-vintage', name: 'Vintage Cab', category: 'Cabinet', file: 'akrt/cab-vintage.wav', seconds: 0.18, channels: 2, credit: AKRT, license: CC_BY_4 },
  { id: 'cab-80s', name: '80s Cab', category: 'Cabinet', file: 'akrt/cab-80s.wav', seconds: 0.19, channels: 2, credit: AKRT, license: CC_BY_4 },
];

export const irByIndex = (i: number): IrDef | undefined => IR_LIBRARY[Math.max(0, Math.min(IR_LIBRARY.length - 1, Math.round(i)))];

/** Base for IR URLs — defaults to site root; overridable for a non-root deploy base. */
let irBase = '/irs/';
export function setIrBase(base: string): void { irBase = base.endsWith('/') ? base : base + '/'; }
export const irUrl = (file: string): string => irBase + file;

const cache = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();
const cacheKey = (id: string, sr: number) => `${id}@${sr}`;

/** Synchronous cache read — what a device uses on setParams so the offline render is deterministic. */
export function getCachedIr(id: string, sampleRate: number): AudioBuffer | null {
  return cache.get(cacheKey(id, sampleRate)) ?? null;
}

/** Fetch + decode an IR (cached per sample rate). Returns null if the file isn't present or fails. */
export async function loadIr(ctx: BaseAudioContext, id: string): Promise<AudioBuffer | null> {
  const def = IR_LIBRARY.find((d) => d.id === id);
  if (!def) return null;
  const k = cacheKey(id, ctx.sampleRate);
  const hit = cache.get(k);
  if (hit) return hit;
  const pending = inflight.get(k);
  if (pending) return pending;
  const job = (async () => {
    try {
      const res = await fetch(irUrl(def.file));
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr);
      cache.set(k, buf);
      return buf;
    } catch {
      return null;
    } finally {
      inflight.delete(k);
    }
  })();
  inflight.set(k, job);
  return job;
}

/** Preload IRs (all, or a subset) — call before an offline export so real tails are cached and render. */
export async function preloadIrs(ctx: BaseAudioContext, ids: string[] = IR_LIBRARY.map((d) => d.id)): Promise<void> {
  await Promise.all(ids.map((id) => loadIr(ctx, id).catch(() => null)));
}

/** Distinct attribution lines for an in-app credits screen. */
export function irCredits(): string[] {
  return [...new Set(IR_LIBRARY.map((d) => `${d.credit} — ${d.license}`))];
}
