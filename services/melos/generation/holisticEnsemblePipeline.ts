/** Local inference only. Independent recordings are never called synchronized stems. */
import type { InstrumentType } from '../beats/grooveDoc';
import type { GeneratedStem } from './webFallbackGenerator';
import { validateGeneratedNotes, validateGenerationRequest, type GeneratedNote, type GenerationRequest, type GenerationResult } from './types';
import { buildEnsemblePlan, validateEnsemblePlan, type EnsemblePlan } from './ensemblePlan';
import { instrumentGrounding, selectEnsembleVoices, type EnsembleVoice } from './instrumentKnowledge';

export interface HolisticSectionCue {
  title: string; startBeats: number; lengthBeats: number; color: string;
  dynamicMarking: EnsemblePlan['sections'][number]['dynamic']; dramaticCue: string;
}
export interface HolisticMidiTrackSpec extends EnsembleVoice {
  name: string; instrument: InstrumentType; color: string;
  role: 'harmonic_arpeggio' | 'choir_counterpoint' | 'melodic_doubler'; notes: GeneratedNote[];
}
export interface HolisticEnsembleOutput {
  prompt: string; bpm: number; keySignature: string; startBeats: number;
  regionBeats: number; regionBars: number; durationSec: number; modelsUsed: string[];
  sectionCues: HolisticSectionCue[]; audioStems: GeneratedStem[];
  masterAudioBlob?: Blob; masterAudioBytes?: Uint8Array;
  midiTracks: HolisticMidiTrackSpec[]; plan: EnsemblePlan; warnings: string[];
}
export interface EnsembleRuntime {
  engines(): Promise<Array<{ id: string; name: string; runtimeConnected: boolean; access: { allowed: boolean } }>>;
  generate(request: GenerationRequest, signal: AbortSignal, progress?: (text: string) => void): Promise<{ result: GenerationResult; audio?: Blob }>;
}
async function localRuntime(): Promise<EnsembleRuntime> {
  const client = await import('./client');
  return { engines: client.getMusicEngines, generate: client.runLocalMusicGeneration };
}

export async function runHolisticEnsemblePipeline(params: {
  prompt: string; lyrics?: string; bpm: number; keySignature: string;
  startBeats: number; regionBeats: number; seed?: number;
  onProgress?: (stage: string) => void; signal?: AbortSignal;
  includeMidi?: boolean; includeAudio?: boolean; midiInstrument?: InstrumentType;
  audioEngine?: 'ace-step' | 'heartmula';
}, runtimeOverride?: EnsembleRuntime): Promise<HolisticEnsembleOutput> {
  const { prompt, bpm, keySignature, startBeats, regionBeats, onProgress } = params;
  let plan = buildEnsemblePlan({ ...params, allowShort: params.includeAudio === false });
  const signal = params.signal || new AbortController().signal;
  signal.throwIfAborted();
  const runtime = runtimeOverride || await localRuntime();
  const engines = await runtime.engines();
  const wantsVocals = !!params.lyrics?.trim() || /vocal|singer|singing|lyrics/i.test(prompt);
  const available = (id: string) => engines.some(e => e.id === id && e.runtimeConnected && e.access.allowed);
  const audioEngine = params.audioEngine || (wantsVocals && available('heartmula') ? 'heartmula'
    : available('ace-step') ? 'ace-step' : available('heartmula') ? 'heartmula' : 'ace-step');
  const required = [...(params.includeAudio === false ? [] : [audioEngine]), ...(params.includeMidi === false ? [] : ['qwen-score'])];
  if (!required.length) throw new Error('Choose audio or MIDI output.');
  for (const id of required) {
    if (!engines.some(e => e.id === id && e.runtimeConnected && e.access.allowed)) {
      throw new Error(`Connect and authorize ${id} in Music Lab before generating this arrangement.`);
    }
  }
  const base = validateGenerationRequest({ engine: audioEngine, kind: 'audio', prompt,
    lyrics: params.lyrics || '', bpm, bars: plan.bars, seconds: Math.max(1, plan.seconds),
    key: keySignature, seed: params.seed ?? 42 });
  const midiTracks: HolisticMidiTrackSpec[] = [];
  const modelsUsed: string[] = [];
  const warnings = [
    'MIDI is composed for the selected platform presets. Generated audio is not a transcription or an extracted stem of these parts.',
    'The renderer is prompted with shared harmony and form; exact harmonic and timing adherence has not been measured.',
  ];
  const voices = selectEnsembleVoices(prompt, params.midiInstrument);
  const grounding = instrumentGrounding();
  if (params.includeMidi !== false) {
    onProgress?.('Qwen director · Planning form, harmony, motifs and platform instrument roles…');
    const directed = await runtime.generate({ ...base, engine: 'qwen-score', kind: 'midi', purpose: 'arrangement-plan',
      prompt: `${prompt.slice(0, 1800)}\n${grounding}\nPlatform parts: ${voices.map(v => `${v.instrument.toUpperCase()} / ${v.presetName}: ${v.description.slice(0, 180)}. ${v.instruction.slice(0, 120)}`).join('; ')}\nPlan exactly ${plan.bars} bars. Complement the platform parts with generated audio for vocals/percussion/textures.`,
    }, signal, onProgress);
    if (!directed.result.plan) throw new Error('The local director returned no arrangement plan.');
    // The server validates the plan too; validate at the artifact boundary as defence in depth.
    plan = validateEnsemblePlan({ ...directed.result.plan,
      concept: directed.result.plan.summary.slice(-500) }, plan);
  }
  // Sequential short phrases respect the single GPU slot and bounded JSON output.
  if (params.includeMidi !== false) {
    for (const [voiceIndex, role] of voices.entries()) {
      const notes: GeneratedNote[] = [];
      for (const section of plan.sections) {
        for (let offset = 0; offset < section.bars; offset += 4) {
          signal.throwIfAborted();
          const bars = Math.min(4, section.bars - offset);
          const at = section.startBar + offset;
          onProgress?.(`Qwen · ${role.instrument.toUpperCase()} / ${role.presetName} · ${section.title} · bars ${at + 1}–${at + bars}`);
          const response = await runtime.generate({ ...base, engine: 'qwen-score', kind: 'midi', bars,
            prompt: `${prompt.slice(0, 900)}\n${plan.summary.slice(0, 500)}\n${grounding}\nSelected ${role.instrument.toUpperCase()} preset: ${role.presetName}. ${role.description.slice(0, 220)}\nPart: ${role.instruction} Stay in MIDI ${role.minMidi}–${role.maxMidi}.\nOther synth roles: ${voices.filter(v => v !== role).map(v => `${v.instrument}: ${v.instruction.slice(0, 100)}`).join('; ')}\nSection: ${section.title}; ${section.direction}.\nGlobal bars ${at + 1}–${at + bars}; local beat zero starts this chunk. Chords per bar: ${plan.chords.slice(at, at + bars).join(' | ')}.\nPrevious phrase: ${JSON.stringify(notes.slice(-4))}. Develop its motif; do not copy its timestamps. Fit all notes in ${bars * 4} local beats.`,
          }, signal, onProgress);
          notes.push(...validateGeneratedNotes(response.result.notes, bars * 4).map(n => ({ ...n, startBeats: n.startBeats + at * 4 })));
        }
      }
      midiTracks.push({ ...role, role: (['harmonic_arpeggio', 'choir_counterpoint', 'melodic_doubler'] as const)[voiceIndex],
        name: `${role.instrument.toUpperCase()} · ${role.presetName}`, notes: validateGeneratedNotes(notes, regionBeats) });
    }
    modelsUsed.push(engines.find(e => e.id === 'qwen-score')!.name);
  }
  signal.throwIfAborted();
  onProgress?.('Rendering local audio from the shared arrangement brief…');
  const rendered = params.includeAudio === false ? undefined : await runtime.generate({ ...base,
    prompt: `${prompt.slice(0, 700)}\n${plan.summary.slice(0, 400)}\n${plan.sections.map(s => `${s.title.slice(0, 30)}: bars ${s.startBar + 1}–${s.startBar + s.bars}, ${s.direction.slice(0, 70)}`).join('; ')}\nChord progression per bar: ${plan.chords.join('|')}. Preserve motif identity and phrase development. Natural transients, clear bass, restrained bus compression.\n${midiTracks.length ? `Render the complementary audio layer: drums, percussion, lead vocals when requested, and organic textures. These live synth parts will be added separately: ${voices.map(v => `${v.instrument.toUpperCase()} / ${v.presetName}: ${v.instruction.slice(0, 90)}`).join('; ')}. Leave those roles out of this audio and preserve space for them.` : 'Render a complete musical arrangement.'}`,
  }, signal, onProgress);
  signal.throwIfAborted();
  if (rendered && !rendered.audio?.size) throw new Error('The local renderer returned no audio; no arrangement was inserted.');
  if (rendered) modelsUsed.push(engines.find(e => e.id === audioEngine)!.name);
  if (rendered?.result.warning) warnings.push(rendered.result.warning);
  const bytes = rendered?.audio ? new Uint8Array(await rendered.audio.arrayBuffer()) : undefined;
  return {
    prompt, bpm, keySignature, startBeats, regionBeats, regionBars: plan.bars, durationSec: plan.seconds,
    modelsUsed, plan, warnings, midiTracks,
    sectionCues: plan.sections.map(s => ({ title: s.title, startBeats: startBeats + s.startBar * 4,
      lengthBeats: s.bars * 4, color: '#00DAF3', dynamicMarking: s.dynamic, dramaticCue: s.direction })),
    audioStems: rendered?.audio && bytes ? [{ id: 'lead_atmosphere', name: `${audioEngine} · ${midiTracks.length ? 'Complementary audio' : 'Reference mix'}`, color: '#00DAF3',
      wavBytes: bytes, blob: rendered.audio, durationSec: plan.seconds }] : [],
    masterAudioBlob: rendered?.audio, masterAudioBytes: bytes,
  };
}
