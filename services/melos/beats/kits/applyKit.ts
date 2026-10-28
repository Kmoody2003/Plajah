// Write a parsed kit onto a MEKA Group — what Maschine does when you load a Group: all 16 Sounds
// are replaced, pads the kit doesn't fill go empty, and a kit bigger than 16 spills into the next
// Groups (created as needed). Pure doc mutation; the caller ingests the audio first and hands in
// a SampleRef per slot.

import { addPadBank, PAD_BANK, BANK_LETTERS, type GrooveDoc, type GroupMeta, type PadConfig, type SampleRef } from '../grooveDoc';
import { clearPad, detachPadInstrument } from '../channelOps';
import { CATEGORY_COLOR, classifySample } from './drumClassify';
import { KIT_FORMAT_LABEL, type KitPadSpec, type KitSpec } from './types';

/** A sample pad's envelope: hold the whole sample at full level (one-shot), short tail. */
export function oneShotEnv(durationSec: number): PadConfig['env'] {
  return { attackMs: 0, holdMs: Math.round(Math.min(30, Math.max(0.05, durationSec)) * 1000), decayMs: 80, sustain: 0, releaseMs: 80 };
}

export const groupLabel = (doc: GrooveDoc, bank: number) => doc.groupMeta?.[bank]?.name || `Group ${BANK_LETTERS[bank] ?? bank + 1}`;

export function setGroupMeta(doc: GrooveDoc, bank: number, patch: Partial<GroupMeta>): void {
  const meta = (doc.groupMeta ??= []);
  while (meta.length <= bank) meta.push({});
  meta[bank] = { ...meta[bank], ...patch };
}

/** Write one kit pad onto a MEKA pad. */
export function applyPadSpec(pad: PadConfig, spec: KitPadSpec, ref: SampleRef): void {
  pad.source = 'sample';
  pad.sample = ref;
  pad.empty = false;
  pad.mute = false;
  pad.name = spec.name.slice(0, 18);
  pad.color = spec.color || CATEGORY_COLOR[classifySample(ref.name || spec.name)];
  pad.pitchSemis = Math.max(-24, Math.min(24, spec.tuneSemis ?? 0));
  pad.gainDb = Math.max(-48, Math.min(12, spec.gainDb ?? 0));
  pad.pan = Math.max(-1, Math.min(1, spec.pan ?? 0));
  pad.choke = Math.max(0, Math.min(8, spec.choke ?? 0));
  pad.startSec = spec.startSec ?? (spec.startFrac ? spec.startFrac * ref.durationSec : 0);
  pad.env = oneShotEnv(ref.durationSec - pad.startSec);
  pad.filter = { type: 'off', cutoff: 8000, q: 0.8 };
  pad.velCurve = 'linear';
  pad.nks = undefined;
  pad.melos = undefined;
}

export interface ApplyResult { banks: number[]; filled: number; missing: string[] }

/**
 * Load `kit` into Group `bank` (and the Groups after it, if the kit has more than 16 pads).
 * `refs` maps a kit slot → its ingested sample; a slot with no ref is listed in `missing`.
 */
export function applyKitToGroup(doc: GrooveDoc, bank: number, kit: KitSpec, refs: Map<number, SampleRef>): ApplyResult {
  const maxSlot = kit.pads.reduce((m, p) => Math.max(m, p.slot), 0);
  const bankSpan = Math.max(1, Math.floor(maxSlot / PAD_BANK) + 1);
  while (doc.kit.length < (bank + bankSpan) * PAD_BANK) addPadBank(doc.kit);
  const bySlot = new Map(kit.pads.map((p) => [p.slot, p]));
  const missing: string[] = [];
  let filled = 0;
  for (let slot = 0; slot < bankSpan * PAD_BANK; slot++) {
    const idx = bank * PAD_BANK + slot;
    const spec = bySlot.get(slot);
    const ref = refs.get(slot);
    const pad = doc.kit[idx];
    if (!pad) continue;
    if (spec && ref) {
      detachPadInstrument(doc, idx);
      applyPadSpec(pad, spec, ref);
      filled++;
      continue;
    }
    clearPad(doc, idx);
    pad.choke = 0;
    if (spec) { missing.push(spec.name); pad.name = spec.name.slice(0, 18); } // keep the slot's name so the gap is legible
  }
  const banks = Array.from({ length: bankSpan }, (_, i) => bank + i);
  banks.forEach((b, i) => setGroupMeta(doc, b, {
    name: (bankSpan > 1 ? `${kit.name} ${i + 1}` : kit.name).slice(0, 28),
    source: { format: KIT_FORMAT_LABEL[kit.format], kit: kit.name },
  }));
  return { banks, filled, missing };
}

/** A Group's pads as a portable user kit (sample refs are content-addressed, so they reload). */
export interface UserKit {
  id: string;
  name: string;
  savedAt: number;
  color?: string;
  pads: (Omit<PadConfig, 'id' | 'instrumentTrackId' | 'inserts' | 'sends' | 'stepFx'> | null)[];
}

export function snapshotGroup(doc: GrooveDoc, bank: number, name: string): UserKit {
  const pads = doc.kit.slice(bank * PAD_BANK, bank * PAD_BANK + PAD_BANK).map((p) => {
    if (!p || p.empty || p.source === 'instrument') return null; // instruments live on tracks — not portable here
    const { id: _id, instrumentTrackId: _t, inserts: _i, sends: _s, stepFx: _f, ...rest } = p;
    return JSON.parse(JSON.stringify(rest)) as UserKit['pads'][number];
  });
  return { id: Math.random().toString(36).slice(2, 10), name, savedAt: Date.now(), color: doc.groupMeta?.[bank]?.color, pads };
}

export function applyUserKit(doc: GrooveDoc, bank: number, kit: UserKit): void {
  while (doc.kit.length < (bank + 1) * PAD_BANK) addPadBank(doc.kit);
  for (let slot = 0; slot < PAD_BANK; slot++) {
    const idx = bank * PAD_BANK + slot;
    const saved = kit.pads[slot];
    detachPadInstrument(doc, idx);
    if (!saved) { clearPad(doc, idx); continue; }
    Object.assign(doc.kit[idx], JSON.parse(JSON.stringify(saved)), { instrumentTrackId: undefined });
  }
  setGroupMeta(doc, bank, { name: kit.name.slice(0, 28), color: kit.color, source: { format: 'MEKA kit', kit: kit.name } });
}
