// Sample clearance — the rights model and the clip mechanic behind "let my song be sampled".
//
// A clearance is a RIGHTS EVENT authored by the owner at (or after) release: what can be sampled
// (whole track or a region), how it's offered (sell / free / Melos Library / gated behind a club or
// Sanctuary), the split, and whether listeners may freely clip a section themselves. Every clip a
// listener makes references a clearance, so attribution, terms and payout travel with the audio —
// and the record is shaped to register on the OCME rights registry for portability.
//
// This module is self-contained (model + the pure region-extract mechanic); the creator publish UI
// and the Chora "Sample this" flow build on it.

export type SampleScope = 'whole' | 'region';
export type SampleOffer = 'sell' | 'free' | 'library' | 'gated';
export type ClipTerms = 'purchased' | 'free' | 'open-clip';

export interface SampleSplit { holderId: string; label: string; pct: number; }

/** The owner's rules for how their track may be sampled. */
export interface SampleClearance {
  id: string;
  sourceTrackId: string;         // the Chora track this clears
  sourceTitle: string;
  ownerId: string;
  ownerName: string;
  scope: SampleScope;
  regionStartSec?: number;       // scope === 'region'
  regionEndSec?: number;
  offer: SampleOffer;
  priceUSD?: number;             // offer === 'sell'
  gate?: { kind: 'club' | 'sanctuary'; id?: string; tier?: string }; // offer === 'gated'
  allowOpenClip: boolean;        // listeners may clip a section themselves (within scope)
  splits: SampleSplit[];         // must total 100
  ocmeRef?: string;              // OCME registry id when registered
  createdAt: number;
  updatedAt: number;
}

/** A clip a listener made from a cleared track — becomes a MuseAsset with these terms attached. */
export interface SampledFragment {
  id: string;
  sourceTrackId: string;
  clearanceId: string;
  startSec: number;
  endSec: number;
  sampleKey?: string;            // OPFS key of the extracted audio
  attribution: string;          // "Nightfall — Ada Reyes"
  terms: ClipTerms;
  createdAt: number;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

export function newClearance(sourceTrackId: string, sourceTitle: string, ownerId: string, ownerName: string): SampleClearance {
  const now = Date.now();
  return {
    id: uid(), sourceTrackId, sourceTitle, ownerId, ownerName,
    scope: 'region', offer: 'sell', priceUSD: 0, allowOpenClip: false,
    splits: [{ holderId: ownerId, label: ownerName || 'Owner', pct: 100 }],
    createdAt: now, updatedAt: now,
  };
}

/** True when the splits are a valid, complete allocation. */
export const splitsValid = (splits: SampleSplit[]): boolean => {
  if (!splits.length) return false;
  const total = splits.reduce((a, s) => a + (s.pct || 0), 0);
  return Math.abs(total - 100) < 0.01 && splits.every((s) => s.pct >= 0);
};

/** Is a proposed clip [startSec,endSec) allowed by the clearance? */
export function clipAllowed(c: SampleClearance, startSec: number, endSec: number): boolean {
  if (endSec <= startSec) return false;
  if (c.scope === 'whole') return true;
  const rs = c.regionStartSec ?? 0, re = c.regionEndSec ?? Infinity;
  // The clip must sit inside the cleared region.
  return startSec >= rs - 1e-3 && endSec <= re + 1e-3;
}

/** The terms a listener's clip lands on, given the offer. */
export function termsFor(c: SampleClearance): ClipTerms {
  if (c.offer === 'free' || c.offer === 'library') return 'free';
  if (c.offer === 'gated') return 'free'; // access is the gate; the clip itself is unpriced
  return c.allowOpenClip ? 'open-clip' : 'purchased';
}

/**
 * Extract a time region from a decoded buffer into a NEW buffer — the mechanic behind both
 * "define a sampleable region" (preview) and a listener "clip this section". `ctx` is optional; a
 * bare `new AudioBuffer` is used when none is passed (both exist in modern browsers).
 */
export function extractRegion(buffer: AudioBuffer, startSec: number, endSec: number, ctx?: BaseAudioContext): AudioBuffer {
  const sr = buffer.sampleRate;
  const s = Math.max(0, Math.floor(startSec * sr));
  const e = Math.min(buffer.length, Math.floor(endSec * sr));
  const len = Math.max(1, e - s);
  const ch = buffer.numberOfChannels;
  const out = ctx ? ctx.createBuffer(ch, len, sr) : new AudioBuffer({ numberOfChannels: ch, length: len, sampleRate: sr });
  for (let c = 0; c < ch; c++) out.copyToChannel(buffer.getChannelData(c).slice(s, e), c);
  return out;
}

export function makeFragment(c: SampleClearance, startSec: number, endSec: number): SampledFragment {
  return {
    id: uid(), sourceTrackId: c.sourceTrackId, clearanceId: c.id, startSec, endSec,
    attribution: `${c.sourceTitle} — ${c.ownerName}`, terms: termsFor(c), createdAt: Date.now(),
  };
}
