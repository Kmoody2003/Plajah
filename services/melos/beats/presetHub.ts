// One place that knows every instrument's preset bank — factory AND user presets — and how to
// apply one to a track. The instrument panels each grew their own preset plumbing (with their
// own bugs: BAJO's apply silently no-oped when the engine instrument wasn't created yet), and
// the shared instrument window needs a single dropdown that works for all of them.

import type { GrooveDoc, InstrumentType, ArrangeTrack } from './grooveDoc';
import { isSuite, syncPadWithTrack } from './instrumentFactory';
import { BeatsEngine } from './engine/BeatsEngine';
import { FACTORY_PRESETS } from '../instruments/onda/presets';
import { serializePatch } from '../instruments/onda/patch';
import { BAJO_PRESETS } from '../instruments/bajo/presets';
import {
  newBajoPatch, deserializeBajoPatch, applyBajoPreset, serializeBajoPatch,
} from '../instruments/bajo/patch';
import { VELA_PRESETS } from '../instruments/vela/presets';
import {
  deserializeVelaPatch, applyVelaPreset, serializeVelaPatch, newVelaPatch,
} from '../instruments/vela/patch';
import { presetsFor } from '../instruments/vela/suite';

export interface PresetEntry {
  id: string;
  name: string;
  category?: string;
  /** Saved by the user (deletable), vs shipped factory. */
  user?: boolean;
}

// ── User presets (localStorage — per browser, instant, no schema migration) ──

const LS_KEY = 'melos.userPresets.v1';

interface UserPreset {
  id: string; name: string;
  patch: Record<string, unknown>;
  arp?: Record<string, unknown>;
  /** KERA: the serialized program (zones + sample refs) — the actual sound. */
  kera?: Record<string, unknown>;
}
type UserStore = Partial<Record<InstrumentType, UserPreset[]>>;

function readStore(): UserStore {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') as UserStore; } catch { return {}; }
}
function writeStore(s: UserStore): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function userPresets(type: InstrumentType): UserPreset[] {
  return readStore()[type] ?? [];
}

/** Snapshot the track's CURRENT patch as a named user preset. Returns the new entry. */
export function saveUserPreset(type: InstrumentType, name: string, track: ArrangeTrack): PresetEntry | null {
  if (!track.instrument?.patch) return null;
  const store = readStore();
  const list = store[type] ?? [];
  const entry: UserPreset = {
    id: `u_${Math.random().toString(36).slice(2, 10)}`,
    name: name.trim().slice(0, 40) || 'My preset',
    patch: JSON.parse(JSON.stringify(track.instrument.patch)) as Record<string, unknown>,
    arp: track.instrument.arp ? JSON.parse(JSON.stringify(track.instrument.arp)) as Record<string, unknown> : undefined,
    kera: track.instrument.kera ? JSON.parse(JSON.stringify(track.instrument.kera)) as Record<string, unknown> : undefined,
  };
  list.push(entry);
  store[type] = list;
  writeStore(store);
  return { id: entry.id, name: entry.name, user: true };
}

export function deleteUserPreset(type: InstrumentType, id: string): void {
  const store = readStore();
  store[type] = (store[type] ?? []).filter((p) => p.id !== id);
  writeStore(store);
}

export function renameUserPreset(type: InstrumentType, id: string, name: string): void {
  const store = readStore();
  const p = (store[type] ?? []).find((x) => x.id === id);
  if (p) { p.name = name.trim().slice(0, 40) || p.name; writeStore(store); }
}

// ── Listing ──────────────────────────────────────────────────────────────────

/** Every preset the dropdown should offer for a type — factory bank first, user bank after. */
export function listPresets(type: InstrumentType): PresetEntry[] {
  let factory: PresetEntry[] = [];
  if (type === 'onda') factory = FACTORY_PRESETS.map((p) => ({ id: `f_${p.name}`, name: p.name, category: p.category }));
  else if (type === 'bajo') factory = BAJO_PRESETS.map((p) => ({ id: `f_${p.id}`, name: p.name, category: p.genre }));
  else if (isSuite(type)) {
    const bank = type === 'vela' ? VELA_PRESETS : presetsFor(type);
    factory = bank.map((p) => ({ id: `f_${p.id}`, name: p.name }));
  }
  // KERA plays loaded programs, not patches — only user snapshots apply.
  const user = userPresets(type).map((p) => ({ id: p.id, name: p.name, user: true as const }));
  return [...factory, ...user];
}

// ── Applying ─────────────────────────────────────────────────────────────────

/**
 * Apply a preset to a track INSIDE a doc mutation (call from onMutate). Writes the serialized
 * patch, preset name, track name, and keeps the owning pad's label in step. Returns true when
 * something changed. Push it to the live engine afterwards with `pushTrackPatch`.
 */
export function applyPresetToDoc(d: GrooveDoc, trackId: string, presetId: string): boolean {
  const t = d.arrangement.find((x) => x.id === trackId && x.kind === 'instrument');
  if (!t?.instrument) return false;
  const type = t.instrument.type;

  if (presetId.startsWith('u_')) {
    const stored = userPresets(type).find((p) => p.id === presetId);
    if (!stored) return false;
    t.instrument.patch = JSON.parse(JSON.stringify(stored.patch)) as Record<string, unknown>;
    if (stored.arp) t.instrument.arp = JSON.parse(JSON.stringify(stored.arp)) as Record<string, unknown>;
    if (stored.kera) t.instrument.kera = JSON.parse(JSON.stringify(stored.kera)) as Record<string, unknown>;
    t.instrument.presetName = stored.name;
    t.name = stored.name;
    syncPadWithTrack(d, trackId);
    return true;
  }

  const fid = presetId.replace(/^f_/, '');
  if (type === 'onda') {
    const preset = FACTORY_PRESETS.find((p) => p.name === fid);
    if (!preset) return false;
    t.instrument.patch = serializePatch(preset);
    t.instrument.presetName = preset.name;
    t.name = preset.name;
  } else if (type === 'bajo') {
    const preset = BAJO_PRESETS.find((p) => p.id === fid);
    if (!preset) return false;
    const current = deserializeBajoPatch(t.instrument.patch);
    const next = current ? applyBajoPreset(current, preset) : newBajoPatch(preset);
    t.instrument.patch = serializeBajoPatch(next) as Record<string, unknown>;
    t.instrument.presetName = preset.name;
    t.name = preset.name;
  } else if (isSuite(type)) {
    const bank = type === 'vela' ? VELA_PRESETS : presetsFor(type);
    const preset = bank.find((p) => p.id === fid);
    if (!preset) return false;
    const current = deserializeVelaPatch(t.instrument.patch);
    const next = current ? applyVelaPreset(current, preset) : newVelaPatch(preset);
    t.instrument.patch = serializeVelaPatch(next) as Record<string, unknown>;
    t.instrument.presetName = preset.name;
    t.name = preset.name;
  } else {
    return false; // KERA factory presets don't exist
  }
  syncPadWithTrack(d, trackId);
  return true;
}

/**
 * Push a track's saved patch into its LIVE engine instrument — creating the instrument first if
 * it doesn't exist yet. This is the fix for "the preset changed on screen but not in my ears":
 * the old panels wrote the doc and then poked an instrument that was often not there.
 */
export function pushTrackPatch(trackId: string): void {
  const engine = BeatsEngine.get();
  const track = engine.getDoc().arrangement.find((x) => x.id === trackId);
  if (track) void engine.reloadPatch(track);
}
