// Chora ↔ live jam glue (services/melos/jam + services/coedit/{assets,rig}). Pure helpers and small
// stores; the React side lives in components/melos/beats/jam/useChoraJam.ts.
//
//   • ledger samples — a clip/pad sample keyed `ledger:{assetId}` plays a project-ledger asset
//     (proxy → master as it syncs) instead of this device's OPFS cache;
//   • the Takes tray — commit-mode takes wait in IndexedDB (full-quality master + proxy) until
//     "Commit take" or "Discard";
//   • rig items — what Chora can bring to a session (user presets, KERA programs, Melos samples) and
//     how a request for one becomes a ledger contribution, and how an arrived one lands in the song;
//   • song lines — the saved "versions" (session + each person's line) of any song's groove.

import { createStore, del, get, set, values, type UseStore } from 'idb-keyval';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { opsDb } from '../../firebase';
import { COEDIT, coProjectId } from '../../coedit/project';
import type { ContributeInput, SharedAsset } from '../../coedit/assets';
import type { RigItem } from '../../coedit/rig';
import type { VersionMeta } from '../../coedit/session';
import { grooveUid, type GrooveDoc, type InstrumentType, type TimelineClip } from './grooveDoc';
import { userPresets } from './presetHub';
import { addInstrument } from './instrumentFactory';
/** Same shape as instrument/useInstrumentKeyboard RecordedNote. */
export interface RecordedNote { key: number; vel: number; startBeats: number }

// ── ledger-backed samples ────────────────────────────────────────────────────

export const LEDGER_PREFIX = 'ledger:';
export const ledgerKey = (assetId: string) => `${LEDGER_PREFIX}${assetId}`;
export const ledgerAssetId = (key: string | undefined | null) => (key && key.startsWith(LEDGER_PREFIX) ? key.slice(LEDGER_PREFIX.length) : null);

/** Every ledger asset id the song plays (audio clips + sample pads). */
export function ledgerKeysIn(doc: GrooveDoc): string[] {
  const out = new Set<string>();
  for (const p of doc.kit) if (p.sample && ledgerAssetId(p.sample.key)) out.add(p.sample.key);
  for (const t of doc.arrangement) for (const c of t.clips) if (c.audio && ledgerAssetId(c.audio.sampleKey)) out.add(c.audio.sampleKey);
  return [...out];
}

export function audioPeaks(buffer: AudioBuffer, count = 320): number[] {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const step = Math.max(1, Math.floor(buffer.length / count));
  return Array.from({ length: Math.min(count, Math.ceil(buffer.length / step)) }, (_, i) => {
    let peak = 0;
    const end = Math.min(buffer.length, (i + 1) * step);
    for (let x = i * step; x < end; x += Math.max(1, Math.floor(step / 24))) for (const ch of channels) peak = Math.max(peak, Math.abs(ch[x] || 0));
    return Math.round(peak * 1000) / 1000;
  });
}

/**
 * Put a take on a lane as an audio clip that plays the ledger asset. A take that starts inside an
 * existing ledger clip on the same lane REPLACES it (and is recorded as a new version of it).
 * Returns the asset it replaced, if any. Call inside a doc mutation.
 */
export function placeLedgerClip(
  d: GrooveDoc,
  trackId: string,
  take: { assetId: string; name: string; startBeat: number; durationSec: number; peaks?: number[] },
): string | null {
  const t = d.arrangement.find((x) => x.id === trackId);
  if (!t) return null;
  const lengthBeats = Math.max(0.25, (take.durationSec * (d.bpm || 120)) / 60);
  let replaced: string | null = null;
  const hit = t.clips.find((c) => c.audio && ledgerAssetId(c.audio.sampleKey) && take.startBeat >= c.startBeats - 0.01 && take.startBeat < c.startBeats + c.lengthBeats);
  if (hit) {
    replaced = ledgerAssetId(hit.audio!.sampleKey);
    t.clips = t.clips.filter((c) => c !== hit);
  }
  const clip: TimelineClip = {
    id: grooveUid(),
    startBeats: Math.max(0, take.startBeat),
    lengthBeats,
    name: take.name,
    audio: {
      sampleKey: ledgerKey(take.assetId), name: take.name, offsetSec: 0, gainDb: 0, durationSec: take.durationSec,
      ...(take.peaks ? { peaks: take.peaks } : {}),
    },
  };
  t.clips.push(clip);
  return replaced;
}

/** The ledger asset of the take a new recording at `startBeat` would replace (for versionOf). */
export function replacedTakeAt(d: GrooveDoc, trackId: string, startBeat: number): string | null {
  const t = d.arrangement.find((x) => x.id === trackId);
  const hit = t?.clips.find((c) => c.audio && ledgerAssetId(c.audio.sampleKey) && startBeat >= c.startBeats - 0.01 && startBeat < c.startBeats + c.lengthBeats);
  return hit ? ledgerAssetId(hit.audio!.sampleKey) : null;
}

// ── the Takes tray (commit mode) ─────────────────────────────────────────────

export interface TrayTake {
  id: string;
  projectId: string;
  trackId: string;
  trackName: string;
  kind: 'audio' | 'midi';
  startBeat: number;
  createdAt: number;
  // audio
  master?: Blob;
  proxy?: Blob | null;
  durationSec?: number;
  sampleRate?: number;
  channels?: number;
  // midi
  notes?: Array<{ rec: RecordedNote; endBeats: number }>;
}

let trayStore: UseStore | null = null;
const tray = () => (trayStore ??= createStore('chora-jam-takes', 'takes'));

export async function putTrayTake(t: TrayTake): Promise<void> {
  await set(t.id, t, tray()).catch((e) => console.warn('[jam] take tray write failed', e));
}
export async function listTrayTakes(projectId: string): Promise<TrayTake[]> {
  try {
    return (await values<TrayTake>(tray())).filter((t) => t.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}
export async function getTrayTake(id: string): Promise<TrayTake | null> {
  try { return (await get<TrayTake>(id, tray())) ?? null; } catch { return null; }
}
export async function delTrayTake(id: string): Promise<void> {
  await del(id, tray()).catch(() => {});
}

// ── what Chora brings to a session ──────────────────────────────────────────

const PRESET_TYPES: InstrumentType[] = ['onda', 'kera', 'vela', 'cantus', 'ison', 'pneuma', 'bajo', 'aura', 'soma', 'lyra'];

/** This device's shareable items: user presets (+ KERA programs as instruments) and Melos samples. */
export function chorasRigItems(samples: Array<{ id: string; title: string; url: string }> = []): { instruments: RigItem[]; presets: RigItem[]; library: RigItem[] } {
  const instruments: RigItem[] = [];
  const presets: RigItem[] = [];
  for (const type of PRESET_TYPES) {
    for (const p of userPresets(type)) {
      const item: RigItem = { id: `${type}:${p.id}`, name: p.name, kind: type === 'kera' ? 'instrument' : 'preset', instrument: type };
      (type === 'kera' ? instruments : presets).push(item);
    }
  }
  const library: RigItem[] = samples.map((s) => ({ id: `melos:${s.id}`, name: s.title, kind: 'sample' }));
  return { instruments, presets, library };
}

/** Turn a request for one of my items into a ledger contribution (null when I no longer have it). */
export async function contributionFor(
  item: RigItem & { category: 'preset' | 'instrument' | 'library' },
  requestedBy: string,
  samples: Array<{ id: string; title: string; url: string }> = [],
): Promise<ContributeInput | null> {
  if (item.category === 'library') {
    const s = samples.find((x) => `melos:${x.id}` === item.id);
    if (!s) return null;
    const res = await fetch(s.url);
    if (!res.ok) return null;
    return { kind: 'sample', name: s.title, master: await res.blob(), source: { library: item.id }, data: { requestedBy } };
  }
  const [type, presetId] = item.id.split(':') as [InstrumentType, string];
  const p = userPresets(type).find((x) => x.id === presetId);
  if (!p) return null;
  const data = { requestedBy, type, name: p.name, patch: p.patch, arp: p.arp ?? null, kera: p.kera ?? null };
  return {
    kind: item.category === 'instrument' ? 'instrument' : 'preset',
    name: p.name,
    master: new Blob([JSON.stringify(data)], { type: 'application/json' }),
    source: { instrument: type, library: item.id },
    data,
  };
}

/** A preset / instrument that arrived for me: a new instrument track playing it. Inside a mutation. */
export function applyArrivedPreset(d: GrooveDoc, asset: SharedAsset): string | null {
  const data = asset.data as { type?: InstrumentType; name?: string; patch?: Record<string, unknown>; arp?: Record<string, unknown> | null; kera?: Record<string, unknown> | null } | undefined;
  if (!data?.type || !data.patch) return null;
  const id = addInstrument(d, data.type, undefined, data.name);
  const t = d.arrangement.find((x) => x.id === id);
  if (t?.instrument) {
    t.instrument.patch = JSON.parse(JSON.stringify(data.patch));
    if (data.arp) t.instrument.arp = JSON.parse(JSON.stringify(data.arp));
    // KERA zones reference samples in the giver's OPFS — they play once those are ledger samples too.
    if (data.kera) t.instrument.kera = JSON.parse(JSON.stringify(data.kera));
    t.instrument.presetName = data.name;
    t.name = `${data.name || t.name} (${asset.ownerName.split(' ')[0]})`;
  }
  return id;
}

// ── song lines (versions of any song, without opening it) ───────────────────

export interface SongLine { id: string; label: string; byName?: string; at: number; version?: VersionMeta }

/** The shared lines saved for a song's groove (each person's newest version), newest first. */
export async function listSongLines(grooveId: string): Promise<SongLine[]> {
  try {
    const col = collection(opsDb, COEDIT, coProjectId('beats', grooveId), 'versions');
    const snap = await getDocs(query(col, where('private', '==', false), limit(300)));
    const newest = new Map<string, VersionMeta>();
    const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VersionMeta, 'id'>) })).sort((a, b) => b.at - a.at);
    for (const v of all) if (v.reason === 'line' && v.line && !newest.has(v.line)) newest.set(v.line, v);
    return [...newest.values()].map((v) => ({ id: v.line!, label: v.label || `${v.byName}'s version`, byName: v.byName, at: v.at, version: v }));
  } catch { return []; }
}
