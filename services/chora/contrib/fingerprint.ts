// Turns "the song changed" into "who did what": a cheap per-entity fingerprint of a GrooveDoc,
// and a diff of two fingerprints into classified contribution events. Pure.
//
// Only LOCAL edits are ever diffed (the tracker rebaselines after a collaborator's merge lands),
// so everything this reports was done by the person at this keyboard.

import type { ArrangeTrack, GrooveDoc, TimelineClip } from '../../melos/beats/grooveDoc';
import type { ContribEvent, ContribKind, ContribOrigin } from './types';

/** One thing a person can change, with what kind of work changing it is. */
interface Entity {
  kind: ContribKind;
  target: string;
  track?: string;
  instrument?: string;
  hash: number;
  sha256?: string[];
  origin?: ContribOrigin;
}

export type Fingerprint = Map<string, Entity>;

/** FNV-1a over a string — collisions only cost a missed attribution, never a wrong one. */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const h = (v: unknown) => fnv(JSON.stringify(v ?? null));

const shaOf = (sampleKey: string | undefined) => {
  const m = sampleKey && /([0-9a-f]{64})/i.exec(sampleKey);
  return m ? [m[1].toLowerCase()] : undefined;
};

function clipEntity(t: ArrangeTrack, c: TimelineClip, idx: number): Entity {
  const label = `${t.name || 'Track'} › ${c.name || c.audio?.name || `Clip ${idx + 1}`}`;
  if (c.audio) {
    const o = c.audio.origin;
    const kind: ContribKind = c.audio.generativeEngine || o?.how === 'generated' ? 'generated'
      : o?.how === 'recorded' ? 'recorded' : 'imported';
    return {
      kind, target: label, track: t.name,
      // Placement/trim/gain changes are arrangement or mix work; the take itself is keyed by its audio.
      hash: h([c.audio.sampleKey]),
      sha256: shaOf(c.audio.sampleKey),
      origin: o ? { input: o.input, file: o.file, engine: o.engine ?? c.audio.generativeEngine, performer: o.byUid } : c.audio.generativeEngine ? { engine: c.audio.generativeEngine } : undefined,
    };
  }
  if (c.notes) return { kind: c.generativeEngine ? 'generated' : 'notes', target: label, track: t.name, instrument: t.instrument?.type, hash: h(c.notes), origin: c.generativeEngine ? { engine: c.generativeEngine } : undefined };
  return { kind: 'arranged', target: label, track: t.name, hash: h([c.patternId, c.padLens]) };
}

export function fingerprint(doc: GrooveDoc): Fingerprint {
  const fp: Fingerprint = new Map();
  const put = (key: string, e: Entity) => fp.set(key, e);

  for (const t of doc.arrangement) {
    if (t.isFolder) continue;
    t.clips.forEach((c, i) => {
      put(`clip:${c.id}`, clipEntity(t, c, i));
      // Where/how long a clip sits is arrangement; its own gain/automation is mixing.
      put(`clipPos:${c.id}`, { kind: 'arranged', target: `${t.name} › placement`, track: t.name, hash: h([c.startBeats, c.lengthBeats, c.contentOffsetBeats, c.loop, c.audio?.offsetSec, c.audio?.loop]) });
      put(`clipMix:${c.id}`, { kind: 'mixed', target: `${t.name} › clip level`, track: t.name, hash: h([c.audio?.gainDb, c.automationLanes]) });
    });
    if (t.instrument) put(`sound:${t.id}`, { kind: 'sound', target: `${t.name} › ${t.instrument.presetName || t.instrument.type}`, track: t.name, instrument: t.instrument.type, hash: h([t.instrument.patch, t.instrument.kera, t.instrument.arp]) });
    put(`mix:${t.id}`, { kind: 'mixed', target: `${t.name} › channel`, track: t.name, hash: h([t.gainDb, t.pan, t.inserts, t.sends, t.automationLanes, t.mute]) });
  }

  doc.kit.forEach((p, i) => {
    if (p.empty) return;
    put(`pad:${i}`, { kind: 'sound', target: `Pad ${p.name}`, hash: h([p.source, p.sample?.key, p.synthVoice, p.drumSynth]), sha256: shaOf(p.sample?.key) });
  });
  for (const pat of doc.patterns) put(`pattern:${pat.id}`, { kind: 'beat', target: `Pattern ${pat.name || pat.id}`, hash: h(pat) });

  for (const l of doc.lyrics ?? []) put(`lyric:${l.id}`, { kind: 'lyrics', target: `Lyrics › bar ${l.bar + 1}`, hash: h(l.text) });

  put('song', { kind: 'arranged', target: 'Song › tempo, key & structure', hash: h([doc.bpm, doc.swing, doc.tempoMap, doc.meter, doc.key, doc.sections, doc.scenes]) });
  put('buses', { kind: 'mixed', target: 'Mixer › groups & sends', hash: h([doc.mixer.groups, doc.mixer.sendBuses]) });
  put('master', { kind: 'mastered', target: 'Master bus', hash: h(doc.mixer.master) });
  return fp;
}

/**
 * Classified events for everything that changed from `before` to `after`. Removals are not
 * contributions (deleting someone's take credits nobody), so only added/changed entities count.
 */
export function diffFingerprints(before: Fingerprint, after: Fingerprint, base: { clientAt: number; origin?: ContribOrigin }): ContribEvent[] {
  // Fold per (kind, track) so one session of mixing the vocal is one event, not forty.
  const out = new Map<string, ContribEvent>();
  for (const [key, e] of after) {
    const prev = before.get(key);
    if (prev && prev.hash === e.hash) continue;
    // A brand-new clip's placement/level entries are part of adding it, not separate work.
    if (!prev && (key.startsWith('clipPos:') || key.startsWith('clipMix:'))) continue;
    const fold = `${e.kind}|${e.track ?? e.target}|${e.origin?.performer ?? ""}`;
    const ev = out.get(fold);
    if (ev) {
      ev.count++;
      if (e.sha256) ev.sha256 = [...new Set([...(ev.sha256 ?? []), ...e.sha256])];
      continue;
    }
    out.set(fold, {
      kind: e.kind, target: e.target, track: e.track, instrument: e.instrument, count: 1,
      sha256: e.sha256, clientAt: base.clientAt,
      origin: e.origin || base.origin ? { ...base.origin, ...e.origin } : undefined,
    });
  }
  return [...out.values()];
}
