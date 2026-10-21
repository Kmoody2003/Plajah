// Chora Studio — the composer council, run entirely on the user's own machine. No cloud model, no
// account: whoever opens the studio can use it.
//
//   Rules (rulesArranger.ts)  bass, harmony, pads, arps, fills — from the song's chords and the mood.
//   Writer (one of, best first) melody and counter-melody:
//     • 'desktop' — the Plajah desktop app's native engine (NativeLlmService: llama.cpp on the PC's
//                  GPU via Vulkan — Gemma 4 when its GGUF is installed, else Qwen 2.5 7B, Nemotron 4B,
//                  Gemma 2 2B). No browser memory limit; this is the lane AI work should run on.
//     • 'device' — the web workaround: an in-browser model in its own worker (councilModel.ts: Gemma 4
//                  E2B, Qwen 2.5 1.5B, stepping down to 0.5B when memory is short). Downloads once.
//     • 'studio' — the studio's local score models through the music lab: YuE2 sings lyrics into a
//                  melody, Qwen (qwen-score) writes the rest. Only where that backend is connected.
//     • 'rules'  — the rules' own melody writer (always available, instant).
//   Critic (councilRepair.ts) repairs range / key / clashes / words-vs-notes / doubling / dynamics,
//   then critiqueComposition reports whatever is still worth knowing.

import { AriaLocalModel } from '../../../aria/ariaLocalModel';
import { isWindowsApp, getNativeLlmStatus, nativeLlmChat, downloadNativeLlmModel, type NativeLlmStatus } from '../../../windowsBridgeService';
import { councilModel, preferredCouncilEngine } from './councilModel';
import { getMusicEngines, runLocalMusicGeneration } from '../../generation/client';
import type { GenerationRequest } from '../../generation/types';
import { syllables, type ComposeContext, type PartRole } from './composeContext';
import { critiqueComposition, validateComposition, type Composition, type ComposedNote, type ComposedPart, type CouncilIssue } from './composeCouncil';
import { arrangeRole, defaultInstrument, MODEL_ROLES, readMood, regionChords, type Mood } from './rulesArranger';
import { parseNoteLines, partPrompt } from './noteLines';
import { repairComposition } from './councilRepair';
import { identifyChord, pcName } from '../../theory';

export type WriterLane = 'desktop' | 'device' | 'studio' | 'rules';

export interface LocalTake {
  composition: Composition;
  /** What the critic changed. */
  fixes: CouncilIssue[];
  /** What the critic still flags after repairing. */
  issues: CouncilIssue[];
  /** Who wrote what ("Melody: Gemma 4 on this device", "Bass: rules"). */
  credits: string[];
  engineTag: string;
}

export interface LaneStatus {
  lane: WriterLane; available: boolean; label: string; detail: string;
  /** A model the desktop app can download to make this lane available. */
  download?: { key: string; label: string };
}

/** Lanes in priority order: the desktop app's GPU first, the web's workarounds after. */
export const LANE_PRIORITY: WriterLane[] = ['desktop', 'studio', 'device', 'rules'];

const ROLE_NAME: Record<PartRole, string> = {
  melody: 'Melody', 'counter-melody': 'Counter-melody', harmony: 'Harmony', bass: 'Bass', pad: 'Pad', arp: 'Arp', fill: 'Fill',
};

/** Which writers this machine can use. The studio lane needs the music lab backend + access. */
export async function writerLanes(signal?: AbortSignal): Promise<LaneStatus[]> {
  const lanes: LaneStatus[] = [];
  if (isWindowsApp()) lanes.push(await desktopLane());
  const top = preferredCouncilEngine();
  const device: LaneStatus = typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
    ? {
      lane: 'device', available: true,
      // Same engine choice as Aria (her settings toggle): Gemma 4 when chosen and supported, else Qwen.
      label: `On this device · ${councilModel.ready ? councilModel.label : top.label}`,
      detail: councilModel.ready
        ? 'Loaded — runs offline on this machine'
        : AriaLocalModel.prefersWebGPU() ? `Downloads once (${top.size}), then runs offline on your GPU` : `Runs on the CPU here (${top.size}) — slower`,
    }
    : { lane: 'device', available: false, label: 'On this device', detail: 'This browser cannot run an on-device model' };
  let studio: LaneStatus = { lane: 'studio', available: false, label: 'Studio score models', detail: 'The music lab backend is not connected' };
  try {
    const engines = await getMusicEngines(signal);
    const qwen = engines.find((e) => e.id === 'qwen-score');
    const yue = engines.find((e) => e.id === 'yue2');
    const ok = (e?: { runtimeConnected: boolean; access: { allowed: boolean } }) => !!e && e.runtimeConnected && e.access.allowed;
    if (ok(qwen) || ok(yue)) {
      studio = { lane: 'studio', available: true, label: 'Studio score models', detail: [ok(qwen) && 'Qwen score', ok(yue) && 'YuE2 (sings lyrics)'].filter(Boolean).join(' + ') };
    }
  } catch { /* not signed in as an admin, or no backend: the lane stays off */ }
  // In the desktop app the in-browser model is only a fallback for when the native one can't run.
  if (lanes[0]?.available) device.detail = `Fallback — ${device.detail.charAt(0).toLowerCase()}${device.detail.slice(1)}`;
  lanes.push(device, studio, { lane: 'rules', available: true, label: 'Rules only', detail: 'Instant; melodies follow the chords and the words' });
  return lanes.sort((a, b) => LANE_PRIORITY.indexOf(a.lane) - LANE_PRIORITY.indexOf(b.lane));
}

let nativeStatus: NativeLlmStatus | null = null;

async function desktopLane(): Promise<LaneStatus> {
  try {
    nativeStatus = await getNativeLlmStatus();
    const model = nativeStatus.models.find((m) => m.present);
    const gpu = nativeStatus.gpu && !/browser/i.test(nativeStatus.gpu) ? nativeStatus.gpu : 'this PC';
    if (model) {
      return { lane: 'desktop', available: true, label: `This PC · ${model.label}`, detail: `Runs natively on ${gpu} — no download, no browser limits` };
    }
    const dl = nativeStatus.models.find((m) => m.downloadable);
    return {
      lane: 'desktop', available: false, label: 'This PC (desktop app)',
      detail: `No language model installed yet${dl ? ` — download ${dl.label} to run it on ${gpu}` : ''}`,
      download: dl ? { key: dl.key, label: dl.label } : undefined,
    };
  } catch (e) {
    return { lane: 'desktop', available: false, label: 'This PC (desktop app)', detail: `The app's model engine didn't answer (${e instanceof Error ? e.message : 'unknown error'})` };
  }
}

/** Download a model for the desktop lane (the panel shows progress, then re-checks the lanes). */
export function downloadDesktopModel(key: string, onProgress: (done: number, total: number) => void) {
  return downloadNativeLlmModel(key, onProgress);
}

// ── writers ──────────────────────────────────────────────────────────────────

type ChatFn = (messages: { role: 'system' | 'user' | 'assistant'; content: string }[], opts: { maxNewTokens: number; temperature: number; signal: AbortSignal; timeoutMs: number }) => Promise<string>;

/** The model lanes' writer: the desktop app's native engine, or the in-browser worker. */
async function modelWrite(
  lane: 'desktop' | 'device', ctx: ComposeContext, role: PartRole,
  extra: { melody?: ComposedNote[]; existing?: ComposedNote[] }, say: (s: string) => void, signal: AbortSignal,
): Promise<{ notes: ComposedNote[]; engine: string }> {
  let chat: ChatFn;
  let engine: string;
  if (lane === 'desktop') {
    engine = nativeStatus?.models.find((m) => m.present)?.label ?? 'the desktop model';
    chat = async (messages, o) => {
      const r = await nativeLlmChat(messages, { maxTokens: o.maxNewTokens, temperature: o.temperature, signal: o.signal, timeoutMs: o.timeoutMs });
      if (!r.success) throw new Error(r.error || 'the desktop model failed');
      engine = r.model || engine;
      return r.text;
    };
    if (!nativeStatus?.models.some((m) => m.loaded)) say(`Loading ${engine} on this PC's GPU…`);
  } else {
    if (!councilModel.ready) {
      const spec = await councilModel.ensure(say);
      if (!spec) throw new Error('No on-device model could load on this machine');
    }
    engine = councilModel.label;
    chat = (messages, o) => councilModel.chat(messages, { maxNewTokens: o.maxNewTokens, temperature: o.temperature, signal: o.signal, timeoutMs: o.timeoutMs });
  }
  const { system, user } = partPrompt(ctx, role, extra);
  say(`${engine} is writing the ${ROLE_NAME[role].toLowerCase()}…`);
  // ~7 tokens per note line: budget for the notes this part needs, not a page of prose.
  const lyricSyllables = ctx.lyrics.filter((l) => l.inRegion).reduce((s, l) => s + syllables(l.text), 0);
  const expected = role === 'melody' && lyricSyllables ? lyricSyllables : Math.round(ctx.region.beats * (role === 'counter-melody' ? 0.6 : 1.2));
  const maxNewTokens = Math.min(900, 40 + Math.round(expected * 1.6) * 8);
  // The desktop lane may need a cold load of a 7B model first; the browser lane gets two minutes.
  const timeoutMs = lane === 'desktop' ? 5 * 60_000 : 120_000;
  let notes = parseNoteLines(await chat([{ role: 'system', content: system }, { role: 'user', content: user }], { maxNewTokens, temperature: 0.8, signal, timeoutMs }), ctx);
  if (notes.length < 3) {
    // Small models sometimes answer in prose first time — one firmer retry.
    say(`${engine} is trying again…`);
    notes = parseNoteLines(await chat([
      { role: 'system', content: system },
      { role: 'user', content: `${user}\n\nAnswer with note lines only, like:\n1 1 1 A4\n1 2 1 C5` },
    ], { maxNewTokens, temperature: 0.6, signal, timeoutMs }), ctx);
  }
  return { notes, engine };
}

async function studioWrite(ctx: ComposeContext, role: PartRole, signal: AbortSignal, say: (s: string) => void): Promise<{ notes: ComposedNote[]; by: string }> {
  const regionLyrics = ctx.lyrics.filter((l) => l.inRegion).map((l) => l.text);
  const bars = ctx.bars.filter((b) => b.inRegion);
  const seed = Math.floor(Math.random() * 2 ** 31);
  const base = {
    kind: 'midi' as const, bpm: Math.max(30, Math.min(300, parseInt(ctx.song.tempo, 10) || 120)), bars: bars.length,
    seconds: Math.max(1, Math.min(360, ctx.region.seconds)), key: ctx.song.key ?? 'C major', seed,
  };
  const toNotes = (raw: { startBeats: number; lengthBeats: number; key: number; vel: number }[] = []) => raw
    .map((n) => ({ start: n.startBeats, length: n.lengthBeats, pitch: n.key, velocity: n.vel }))
    .filter((n) => n.start < ctx.region.beats);
  // A sung melody goes to YuE2 when it's there — it's built to set words.
  if (role === 'melody' && regionLyrics.length) {
    try {
      say('YuE2 is singing the words into a melody…');
      const req: GenerationRequest = { ...base, engine: 'yue2', prompt: ctx.request.description || 'a heartfelt song', lyrics: `[verse]\n${regionLyrics.join('\n')}` };
      const { result } = await runLocalMusicGeneration(req, signal, say);
      const notes = toNotes(result.notes);
      if (notes.length >= 3) return { notes, by: 'YuE2' };
    } catch (e) { if (signal.aborted) throw e; }
  }
  say(`Qwen is writing the ${ROLE_NAME[role].toLowerCase()}…`);
  const chords = bars.map((b) => `bar ${b.bar}: ${b.chord ?? '?'}${b.lyric ? ` (sung: "${b.lyric}")` : ''}`).join('; ');
  const prompt = [
    `Write ${role === 'counter-melody' ? 'a counter-melody that answers the lead' : role === 'melody' ? 'the lead melody' : `a ${role} part`} for ${bars.length} bars.`,
    `Feeling: ${ctx.request.description || 'what the song needs here'}.`,
    `Chords: ${chords}.`,
    regionLyrics.length && role === 'melody' ? 'It is sung: one note per syllable, stressed syllables on strong beats, a breath between lines.' : '',
  ].filter(Boolean).join(' ').slice(0, 3900);
  const { result } = await runLocalMusicGeneration({ ...base, engine: 'qwen-score', prompt, lyrics: '' }, signal, say);
  return { notes: toNotes(result.notes), by: 'Qwen score' };
}

// ── the council ──────────────────────────────────────────────────────────────

/** Phrase spans: a lyric line each (to the next line), else two bars each. */
function phraseSpans(ctx: ComposeContext, chords: { at: number }[]): [number, number][] {
  const lines = ctx.lyrics.filter((l) => l.inRegion);
  if (lines.length) {
    return lines.map((l, i) => {
      const from = ctx.bars.find((b) => b.bar === l.bar)?.at ?? 0;
      const next = lines[i + 1] ? ctx.bars.find((b) => b.bar === lines[i + 1].bar)?.at : undefined;
      return [from, next ?? ctx.region.beats] as [number, number];
    });
  }
  const out: [number, number][] = [];
  for (let i = 0; i < chords.length; i += 2) out.push([chords[i].at, chords[i + 2]?.at ?? ctx.region.beats]);
  return out;
}

function fillGaps(model: ComposedNote[], rules: ComposedNote[], spans: [number, number][]): { notes: ComposedNote[]; filled: number } {
  let filled = 0;
  const out = [...model];
  for (const [a, b] of spans) {
    const inSpan = (n: ComposedNote) => n.start >= a - 1e-6 && n.start < b - 1e-6;
    if (model.filter(inSpan).length >= 2) continue;
    for (let i = out.length - 1; i >= 0; i--) if (inSpan(out[i])) out.splice(i, 1);
    out.push(...rules.filter(inSpan));
    filled++;
  }
  return { notes: out.sort((x, y) => x.start - y.start || x.pitch - y.pitch), filled };
}

function briefFor(ctx: ComposeContext, mood: Mood, chordNames: string[]): string {
  const feel = [mood.energy < 0.35 ? 'calm' : mood.energy > 0.65 ? 'driving' : 'steady', mood.brightness < 0.4 ? 'dark' : mood.brightness > 0.6 ? 'bright' : 'warm', mood.lift > 0.4 ? 'rising at the end' : '']
    .filter(Boolean).join(', ');
  return `Bars ${ctx.region.startBar}–${ctx.region.endBar} in ${ctx.song.key ?? 'C major'} at ${ctx.song.tempo}, read as ${feel}. Chords: ${chordNames.join(' | ')}.`;
}

function lyricReadingFor(ctx: ComposeContext): string {
  const lines = ctx.lyrics.filter((l) => l.inRegion);
  if (!lines.length) return '';
  return lines.map((l) => `Bar ${l.bar}: "${l.text}" — a note per syllable, the line ending on a held note.`).join(' ');
}

export async function composeLocally(
  ctx: ComposeContext,
  lane: WriterLane,
  opts: { signal: AbortSignal; onProgress?: (s: string) => void },
): Promise<LocalTake> {
  const say = (s: string) => opts.onProgress?.(s);
  const mood = readMood(ctx.request.description);
  const chords = regionChords(ctx, mood);
  const sung = ctx.lyrics.some((l) => l.inRegion);
  const credits: string[] = [];
  const parts: ComposedPart[] = [];

  // Melody first, so a counter-melody can answer it.
  const order = ctx.request.targets.map((t, i) => ({ t, i })).sort((a, b) => Number(b.t.role === 'melody') - Number(a.t.role === 'melody'));
  let melody: ComposedNote[] | undefined;
  for (const { t, i } of order) {
    opts.signal.throwIfAborted();
    const target = t.trackId ?? `new:${i}`;
    const existingTrack = t.trackId ? ctx.tracks.find((x) => x.id === t.trackId) : undefined;
    const existing = existingTrack?.notes?.filter((n) => n[0] >= 0 && n[0] < ctx.region.beats).map((n) => ({ start: n[0], length: n[1], pitch: n[2], velocity: n[3] }));
    let notes: ComposedNote[] = [];
    let by = 'rules';
    if (MODEL_ROLES.includes(t.role) && lane !== 'rules') {
      try {
        if (lane === 'desktop' || lane === 'device') {
          const r = await modelWrite(lane, ctx, t.role, { melody: t.role === 'counter-melody' ? melody : undefined, existing }, say, opts.signal);
          notes = r.notes;
          by = lane === 'desktop' ? `${r.engine} on this PC` : `${r.engine} in the browser`;
        } else {
          const r = await studioWrite(ctx, t.role, opts.signal, say);
          notes = r.notes; by = r.by;
        }
      } catch (e) {
        if (opts.signal.aborted) throw e;
        say(`${ROLE_NAME[t.role]}: ${e instanceof Error ? e.message : 'the writer failed'} — using the rules instead.`);
      }
      if (notes.length < 3) { notes = []; by = 'rules (the model gave no usable notes)'; }
    }
    if (!notes.length) {
      say(`Writing the ${ROLE_NAME[t.role].toLowerCase()} from the chords…`);
      notes = arrangeRole(t.role, ctx, chords, mood);
    } else if (MODEL_ROLES.includes(t.role)) {
      // Small models often stop early or skip a line: fill any phrase they left (nearly) empty
      // with the rules' own line for that span, so the take never has a hole.
      const merged = fillGaps(notes, arrangeRole(t.role, ctx, chords, mood), phraseSpans(ctx, chords));
      if (merged.filled) by += ` (+ rules for ${merged.filled} phrase${merged.filled > 1 ? 's' : ''} it left empty)`;
      notes = merged.notes;
    }
    if (t.role === 'melody') melody = notes;
    credits.push(`${existingTrack ? existingTrack.name : ROLE_NAME[t.role]}: ${by}`);
    parts.push({
      target, name: existingTrack?.name ?? ROLE_NAME[t.role], role: t.role,
      instrument: (existingTrack?.instrument as ComposedPart['instrument']) ?? defaultInstrument(t.role, sung),
      intent: '', notes,
    });
  }

  say('The critic is checking the take…');
  const draft = validateComposition({
    brief: briefFor(ctx, mood, chords.map((c) => ctx.bars.find((b) => b.bar === c.bar)?.chord
      ?? identifyChord(c.pcs.map((pc, k) => 48 + pc + (k ? 12 : 0)))?.symbol ?? c.pcs.map((pc) => pcName(pc)).join(' '))),
    lyricReading: lyricReadingFor(ctx),
    critique: '',
    parts,
  }, ctx);
  const repaired = repairComposition(draft, ctx);
  const composition = repaired.composition;
  const nameOf = (target: string) => composition.parts.find((p) => p.target === target)?.name ?? target;
  const fixes = repaired.fixes.map((f) => ({ ...f, message: `${nameOf(f.target)}: ${f.message}` }));
  const issues = critiqueComposition(composition, ctx).map((f) => ({ ...f, message: `${nameOf(f.target)}: ${f.message}` }));
  composition.critique = fixes.length
    ? `Fixed ${fixes.length} thing${fixes.length === 1 ? '' : 's'}${issues.length ? `; ${issues.length} still worth a look` : ''}.`
    : issues.length ? `${issues.length} thing${issues.length === 1 ? '' : 's'} worth a look.` : 'Passed every check.';
  return { composition, fixes, issues, credits, engineTag: `local-council:${lane}` };
}
