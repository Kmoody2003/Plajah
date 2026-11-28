// Smart Sync pipeline — one click from a pile of cameras and recorders to a synced, segmented, flagged and
// pre-cut program, with every stage re-runnable on its own and every number editable.
//
//   ingest → audio → transcript → fuse → vision → segment → flags → precut → council
//
// All I/O (decoding, speech recognition, frame grabs, the vision model, the council's language model) comes
// in through `SmartSyncIO`, so the logic is the same in the browser, on desktop, and in tests.
//
// Times: `state.words` are on the master's own clock. Sections, flags, cuts and locks are on the MULTICAM
// clock (0 = the earliest any angle starts). When a re-sync moves multicam 0, they are shifted with it.

import { alignAudio, resample } from './audioAlign';
import { alignTranscripts } from './transcriptAlign';
import { applyVision, fuseAngle, layout, timecodeCandidate } from './fuse';
import { VISION_PROMPT, lookFromName, mergeLooks, motionEnergy, motionLag, normalizeVerdict, probeTimes } from './visionLock';
import { segmentProgram, sentenceBreaks } from './segment';
import { carryDecisions, detectFlags } from './graphicsFlags';
import { councilPrompt, leadFor, locksFromCut, normalizeCouncil, precut, transcriptDigest, EDITOR_COUNCIL } from './editorCouncil';
import type { AngleLook, AngleSync, SmartSyncOptions, SmartSyncState, StageId, SyncAngle, SyncCandidate, TimedWord } from './types';

export interface FrameImage { data: string; media: string }

export interface SmartSyncIO {
  /** Mono PCM of an angle's sound at `rate`, or null (no sound / can't decode). */
  pcm(angle: SyncAngle, rate: number): Promise<Float32Array | null>;
  /** Speech → timed words. `pcm16k` is 16 kHz mono. */
  transcribe(pcm16k: Float32Array, onFrac?: (f: number) => void): Promise<TimedWord[]>;
  /** A still at an angle's source time (for the vision model). */
  frame?(angle: SyncAngle, srcTime: number): Promise<FrameImage | null>;
  /** Grey thumbnails from srcT0 to srcT1 at `fps` (for motion curves). */
  thumbs?(angle: SyncAngle, srcT0: number, srcT1: number, fps: number): Promise<Uint8ClampedArray[]>;
  vision?(images: FrameImage[], prompt: string): Promise<unknown>;
  llm?(system: string, user: string): Promise<unknown>;
  progress?(stage: StageId, frac: number, msg: string): void;
  cancelled?(): boolean;
}

export const STAGES: StageId[] = ['ingest', 'audio', 'transcript', 'fuse', 'vision', 'segment', 'flags', 'precut', 'council'];
export const STAGE_LABEL: Record<StageId, string> = {
  ingest: 'Reading angles', audio: 'Audio sync', transcript: 'Transcript sync', fuse: 'Locking offsets', vision: 'Vision lock',
  segment: 'Segmenting program', flags: 'Flagging graphics', precut: 'Pre-cutting', council: 'Editor Council',
};

const AUDIO_RATE = 8000;
const PROBE_SEC = 30;

export function defaultOptions(p: Partial<SmartSyncOptions> = {}): SmartSyncOptions {
  const programType = p.programType || 'church';
  return { programType, lead: p.lead || leadFor(programType), council: p.council ?? true, vision: p.vision ?? true, flags: p.flags ?? true, precut: p.precut ?? true, intent: p.intent || '', masterId: p.masterId, fps: p.fps || 30 };
}

export function newState(angles: SyncAngle[], options: SmartSyncOptions, prev?: SmartSyncState | null): SmartSyncState {
  return {
    version: 1, angles, options, masterId: options.masterId || pickMaster(angles),
    sync: prev?.sync?.filter((s) => s.candidates.some((c) => c.method === 'manual')) || [],
    words: [], looks: prev?.looks || [], sections: [], shotChanges: [], flags: prev?.flags || [], cut: prev?.cut || [], locks: prev?.locks || [],
    mcDuration: 0, mcZero: prev?.mcZero || 0, done: {}, errors: {},
  };
}

/** Best sound: a dedicated recorder or board feed, then anything named like one, then the longest take. */
export function pickMaster(angles: SyncAngle[]): string {
  const audio = angles.filter((a) => a.kind === 'audio').sort((a, b) => b.duration - a.duration)[0];
  if (audio) return audio.assetId;
  const named = angles.find((a) => /board|mix|feed|sound|audio|lav|zoom|tascam/i.test(a.name));
  if (named) return named.assetId;
  return [...angles].sort((a, b) => b.duration - a.duration)[0]?.assetId || angles[0]?.assetId || '';
}

const master = (s: SmartSyncState) => s.angles.find((a) => a.assetId === s.masterId) || s.angles[0];

/** Re-layout after any lag change; shifts multicam-clock data with multicam 0. */
export function relayout(s: SmartSyncState): SmartSyncState {
  const { mcZero, mcDuration } = layout(s.angles, s.sync);
  const d = s.mcZero - mcZero;
  const sh = <T extends { start: number; end: number }>(x: T): T => ({ ...x, start: x.start + d, end: x.end + d });
  if (Math.abs(d) > 1e-6 && (s.done.segment || s.done.flags || s.done.precut)) {
    return { ...s, mcZero, mcDuration, sections: s.sections.map(sh), cut: s.cut.map(sh), locks: s.locks.map(sh), flags: s.flags.map((f) => ({ ...f, at: f.at + d })), shotChanges: s.shotChanges.map((c) => ({ ...c, t: c.t + d })) };
  }
  return { ...s, mcZero, mcDuration };
}

export const offsetsOf = (s: SmartSyncState) => layout(s.angles, s.sync).offsets;
/** Master-clock words on the multicam clock. */
export const mcWords = (s: SmartSyncState): TimedWord[] => s.words.map((w) => ({ ...w, t: w.t - s.mcZero, end: w.end - s.mcZero }));

function candidatesFor(s: SmartSyncState, id: string): SyncCandidate[] {
  return s.sync.find((x) => x.assetId === id)?.candidates || [];
}
function putCandidate(s: SmartSyncState, id: string, c: SyncCandidate | null, method: SyncCandidate['method']) {
  const keep = candidatesFor(s, id).filter((x) => x.method !== method);
  const next = c ? [...keep, c] : keep;
  const i = s.sync.findIndex((x) => x.assetId === id);
  const base: AngleSync = i >= 0 ? s.sync[i] : { assetId: id, lag: 0, confidence: 0, status: 'review', method: 'audio', candidates: [], notes: [] };
  const upd = { ...base, candidates: next };
  if (i >= 0) s.sync[i] = upd; else s.sync.push(upd);
}

/** Probe windows (angle source times) spread through a take for transcript sync. */
const probeStarts = (dur: number) => dur <= PROBE_SEC * 3 ? [0] : [0.15, 0.5, 0.82].map((f) => Math.max(0, dur * f - PROBE_SEC / 2));

export interface RunOptions {
  /** Start at this stage (earlier results are kept). */
  from?: StageId;
  /** Stop after this stage. */
  to?: StageId;
  /** Only re-sync these angles (audio/transcript/vision). */
  angleIds?: string[];
}

export async function runSmartSync(state: SmartSyncState, io: SmartSyncIO, ro: RunOptions = {}): Promise<SmartSyncState> {
  let s: SmartSyncState = { ...state, sync: state.sync.map((x) => ({ ...x, candidates: [...x.candidates] })), errors: {} };
  const from = STAGES.indexOf(ro.from || 'ingest'), to = STAGES.indexOf(ro.to || 'council');
  const want = (st: StageId) => { const i = STAGES.indexOf(st); return i >= from && i <= to; };
  const P = (st: StageId, f: number, m: string) => io.progress?.(st, f, m);
  const stop = () => { if (io.cancelled?.()) throw new Error('cancelled'); };
  const M = master(s);
  const others = s.angles.filter((a) => a.assetId !== M.assetId && (!ro.angleIds || ro.angleIds.includes(a.assetId)));
  // Shared across stages within one run.
  let masterPcm: Float32Array | null = null;
  const anglePcm = new Map<string, Float32Array | null>();

  const stage = async (st: StageId, fn: () => Promise<void>) => {
    if (!want(st)) return;
    stop(); P(st, 0, STAGE_LABEL[st]);
    try { await fn(); s.done = { ...s.done, [st]: Date.now() }; }
    catch (e: any) { if (e?.message === 'cancelled') throw e; s.errors = { ...s.errors, [st]: e?.message || String(e) }; }
    P(st, 1, STAGE_LABEL[st]);
  };

  await stage('ingest', async () => {
    s.masterId = M.assetId;
    if (!s.sync.some((x) => x.assetId === M.assetId)) s.sync.push({ assetId: M.assetId, lag: 0, confidence: 1, status: 'master', method: 'master', candidates: [], notes: ['Master sound — every angle locks to this clock.'] });
    for (const a of others) { const tc = timecodeCandidate(M, a); putCandidate(s, a.assetId, tc, 'timecode'); }
  });

  await stage('audio', async () => {
    masterPcm = await io.pcm(M, AUDIO_RATE);
    if (!masterPcm) throw new Error(`No usable sound on the master (${M.name}).`);
    let k = 0;
    for (const a of others) {
      stop(); P('audio', k++ / others.length, `Listening to ${a.name}`);
      const pcm = await io.pcm(a, AUDIO_RATE);
      anglePcm.set(a.assetId, pcm);
      putCandidate(s, a.assetId, pcm ? alignAudio(masterPcm, pcm, AUDIO_RATE) : null, 'audio');
    }
  });

  await stage('transcript', async () => {
    // Master: the whole program, in windows (also the source for segments, flags and the cut).
    if (!s.words.length || !ro.angleIds) {
      const m16 = await io.pcm(M, 16000);
      if (!m16) throw new Error('Master has no sound to transcribe.');
      const words: TimedWord[] = [];
      const win = 16000 * 30;
      for (let i = 0; i < m16.length; i += win) {
        stop();
        const t0 = i / 16000;
        P('transcript', (i / m16.length) * 0.8, `Transcribing master ${fmt(t0)} / ${fmt(m16.length / 16000)}`);
        const ws = await io.transcribe(m16.subarray(i, Math.min(m16.length, i + win)));
        for (const w of ws) words.push({ ...w, t: w.t + t0, end: w.end + t0 });
      }
      s.words = words;
    }
    // Each other angle: three short probes, matched against the master's words.
    let k = 0;
    for (const a of others) {
      stop(); P('transcript', 0.8 + 0.2 * (k++ / Math.max(1, others.length)), `Matching words in ${a.name}`);
      let pcm = anglePcm.get(a.assetId);
      if (pcm === undefined) { pcm = await io.pcm(a, AUDIO_RATE); anglePcm.set(a.assetId, pcm); }
      if (!pcm) { putCandidate(s, a.assetId, null, 'transcript'); continue; }
      const probe: TimedWord[] = [];
      for (const st0 of probeStarts(pcm.length / AUDIO_RATE)) {
        const seg = pcm.subarray(Math.floor(st0 * AUDIO_RATE), Math.floor((st0 + PROBE_SEC) * AUDIO_RATE));
        const ws = await io.transcribe(resample(seg, AUDIO_RATE, 16000));
        for (const w of ws) probe.push({ ...w, t: w.t + st0, end: w.end + st0 });
      }
      const r = alignTranscripts(s.words, probe);
      putCandidate(s, a.assetId, r ? { method: 'transcript', lag: r.lag, confidence: r.confidence, note: r.note } : null, 'transcript');
      if (r?.driftPpm !== undefined) { const i = s.sync.findIndex((x) => x.assetId === a.assetId); if (i >= 0) s.sync[i] = { ...s.sync[i], driftPpm: r.driftPpm }; }
    }
  });

  await stage('fuse', async () => {
    s.sync = s.sync.map((x) => x.assetId === s.masterId ? x : { ...fuseAngle(x.assetId, x.candidates), driftPpm: x.driftPpm, vision: x.vision });
    for (const x of s.sync) if (x.driftPpm !== undefined && Math.abs(x.driftPpm) >= 40) x.notes.push(`Clock drift ≈ ${x.driftPpm} ppm (${(x.driftPpm * 3.6 / 1000).toFixed(2)} s per hour) — long takes may slip; re-sync per section if so.`);
    s = relayout(s);
  });

  await stage('vision', async () => {
    const looks = new Map<string, Array<Omit<AngleLook, 'assetId'> | undefined>>();
    const vids = s.angles.filter((a) => a.kind === 'video');
    // Picture reference: the master if it has picture, else the best-locked video angle.
    const lagOf = (id: string) => s.sync.find((x) => x.assetId === id)?.lag ?? 0;
    const ref = M.kind === 'video' ? M : [...vids].sort((a, b) => (s.sync.find((x) => x.assetId === b.assetId)?.confidence ?? 0) - (s.sync.find((x) => x.assetId === a.assetId)?.confidence ?? 0))[0];
    if (!s.options.vision || !ref || !io.frame || !io.vision) {
      for (const a of s.angles) if (!s.looks.some((l) => l.assetId === a.assetId)) looks.set(a.assetId, []);
      s.looks = s.angles.map((a) => s.looks.find((l) => l.assetId === a.assetId) || lookFromName(a.assetId, a.name, a.kind));
      return;
    }
    const targets = vids.filter((a) => a.assetId !== ref.assetId && (!ro.angleIds || ro.angleIds.includes(a.assetId)));
    let k = 0;
    for (const a of targets) {
      stop(); P('vision', k++ / Math.max(1, targets.length), `Looking at ${a.name}`);
      const la = lagOf(a.assetId), lr = lagOf(ref.assetId);
      const ov0 = Math.max(la, lr), ov1 = Math.min(la + a.duration, lr + ref.duration); // master-clock overlap
      const v = { agree: 0, disagree: 0, unsure: 0 };
      const shifts: number[] = [];
      for (const mt of probeTimes(ov0, ov1, 3)) {
        stop();
        const [fr, fa] = await Promise.all([io.frame(ref, mt - lr), io.frame(a, mt - la)]);
        if (fr && fa) {
          try {
            const verdict = normalizeVerdict(await io.vision([fr, fa], VISION_PROMPT));
            v[verdict.same === 'yes' ? 'agree' : verdict.same === 'no' ? 'disagree' : 'unsure']++;
            (looks.get(ref.assetId) || looks.set(ref.assetId, []).get(ref.assetId)!).push(verdict.master);
            (looks.get(a.assetId) || looks.set(a.assetId, []).get(a.assetId)!).push(verdict.angle);
          } catch { v.unsure++; }
        }
        // Motion: does the picture move with the master's picture at this lag?
        if (io.thumbs) {
          const dt = 0.1;
          const [tr, ta] = await Promise.all([io.thumbs(ref, mt - lr - 3, mt - lr + 3, 1 / dt), io.thumbs(a, mt - la - 3, mt - la + 3, 1 / dt)]);
          if (tr.length > 20 && ta.length > 20) {
            const m = motionLag(motionEnergy(tr), motionEnergy(ta), dt, 0.6);
            if (m.score >= 0.5) shifts.push(m.lag);
          }
        }
      }
      const i = s.sync.findIndex((x) => x.assetId === a.assetId);
      if (i < 0) continue;
      let upd = applyVision(s.sync[i], v);
      // Consistent picture shift = this camera's picture sits off its own sound (wireless / board-fed audio
      // latency). The cut uses the master sound, so move the PICTURE: lag_true = lag − shift.
      if (shifts.length >= 2) {
        const sorted = [...shifts].sort((x, y) => x - y), med = sorted[sorted.length >> 1];
        const spread = sorted[sorted.length - 1] - sorted[0];
        const frame = 1 / (s.options.fps || 30);
        if (Math.abs(med) >= frame * 0.9 && spread <= frame * 2.5 && upd.status !== 'manual') {
          upd = { ...upd, lag: upd.lag - med, notes: [...upd.notes, `Picture sits ${Math.round(Math.abs(med) / frame)} frame(s) ${med > 0 ? 'late' : 'early'} against its sound — corrected from motion.`] };
          upd.candidates = [...upd.candidates.filter((c) => c.method !== 'vision'), { method: 'vision', lag: upd.lag, confidence: 0.6, note: 'motion-matched picture' }];
        }
      }
      s.sync[i] = upd;
    }
    s.looks = s.angles.map((a) => {
      const l = looks.get(a.assetId);
      if (l && l.some(Boolean)) return mergeLooks(a.assetId, l);
      return s.looks.find((x) => x.assetId === a.assetId) || lookFromName(a.assetId, a.name, a.kind);
    });
    s = relayout(s);
  });

  await stage('segment', async () => {
    s.sections = segmentProgram(mcWords(s), s.mcDuration, s.options.programType);
  });

  await stage('flags', async () => {
    if (!s.options.flags) return;
    s.flags = carryDecisions(detectFlags(mcWords(s), s.sections, s.options.programType), s.flags);
  });

  const cutNow = (council?: SmartSyncState['council']) => precut({
    angles: s.angles, offsets: offsetsOf(s), looks: s.looks, sections: s.sections, breaks: sentenceBreaks(mcWords(s)),
    flags: s.flags, locks: locksFromCut(s.cut, s.locks), duration: s.mcDuration, lead: s.options.lead, council, fps: s.options.fps,
  }).map((c) => {
    // Keep approvals on segments that survive unchanged.
    const old = s.cut.find((o) => Math.abs(o.start - c.start) < 0.02 && Math.abs(o.end - c.end) < 0.02 && o.angle === c.angle);
    return old?.approved ? { ...c, approved: true } : c;
  });

  await stage('precut', async () => {
    if (!s.options.precut) return;
    s.cut = cutNow(s.council?.lead === s.options.lead ? s.council : undefined);
  });

  await stage('council', async () => {
    if (!s.options.precut || !s.options.council || !io.llm || !s.cut.length) return;
    const seats = [s.options.lead, ...EDITOR_COUNCIL.map((m) => m.id).filter((id) => id !== s.options.lead)].slice(0, 6);
    const names = s.angles.map((a, index) => ({ ...(s.looks.find((l) => l.assetId === a.assetId) || lookFromName(a.assetId, a.name, a.kind)), index, name: a.name }));
    const { system, user } = councilPrompt({
      type: s.options.programType, lead: s.options.lead, members: seats, intent: s.options.intent, sections: s.sections,
      looks: names.filter((n) => s.angles[n.index].kind === 'video'), cut: s.cut, flags: s.flags, transcriptDigest: transcriptDigest(mcWords(s), s.sections),
    });
    P('council', 0.3, 'The council is watching the pre-cut');
    s.council = normalizeCouncil(await io.llm(system, user), s.options.lead, s.sections);
    P('council', 0.8, 'Re-cutting with the council\'s notes');
    s.cut = cutNow(s.council);
  });

  return s;
}

/** Editor sets an angle's offset by hand (multicam offset seconds, as the inspector shows it). */
export function setManualOffset(s: SmartSyncState, assetId: string, offset: number): SmartSyncState {
  // offset = mcZero − lag  →  lag = mcZero − offset
  const lag = s.mcZero - offset;
  const sync = s.sync.map((x) => x.assetId !== assetId ? x : { ...x, lag, status: 'manual' as const, method: 'manual' as const, confidence: 1, candidates: [...x.candidates.filter((c) => c.method !== 'manual'), { method: 'manual' as const, lag, confidence: 1, note: 'set by editor' }], notes: ['Set by hand.'] });
  return relayout({ ...s, sync });
}

/** Use one of the alternative candidates for an angle. */
export function chooseCandidate(s: SmartSyncState, assetId: string, method: SyncCandidate['method']): SmartSyncState {
  const x = s.sync.find((y) => y.assetId === assetId); const c = x?.candidates.find((k) => k.method === method);
  if (!x || !c) return s;
  return relayout({ ...s, sync: s.sync.map((y) => y.assetId !== assetId ? y : { ...y, lag: c.lag, method: c.method, status: 'manual', confidence: c.confidence, notes: [`Using the ${c.method} result (chosen by editor).`] }) });
}

/** Clear an angle's manual override so the next run decides again. */
export function clearManual(s: SmartSyncState, assetId: string): SmartSyncState {
  return { ...s, sync: s.sync.map((y) => y.assetId !== assetId ? y : { ...fuseAngle(y.assetId, y.candidates.filter((c) => c.method !== 'manual')), driftPpm: y.driftPpm, vision: y.vision }) };
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
