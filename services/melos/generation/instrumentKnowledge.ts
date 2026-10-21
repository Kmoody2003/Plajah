/** Ground orchestration in the factory banks used by the instrument editors. */
import { AURA_PRESETS } from '../instruments/aura/presets';
import { BAJO_PRESETS } from '../instruments/bajo/presets';
import { FACTORY_PRESETS } from '../instruments/onda/presets';
import { SUITE, SUITE_ORDER, presetsFor } from '../instruments/vela/suite';
import { VELA_PRESETS } from '../instruments/vela/presets';
import { newAuraPatch, serializeAuraPatch } from '../instruments/aura/patch';
import { newBajoPatch, serializeBajoPatch } from '../instruments/bajo/patch';
import { newVelaPatch, serializeVelaPatch } from '../instruments/vela/patch';
import { serializePatch } from '../instruments/onda/patch';
import type { InstrumentType } from '../beats/grooveDoc';

export interface EnsembleVoice {
  instrument: InstrumentType; presetId: string; presetName: string;
  description: string; instruction: string; minMidi: number; maxMidi: number;
  gainDb: number; pan: number; color: string;
}
const suiteBank = (type: typeof SUITE_ORDER[number]) => type === 'vela' ? VELA_PRESETS : presetsFor(type);
const catalog = [
  ...AURA_PRESETS.map(p => ({ instrument: 'aura' as const, id: p.id, name: p.name, description: `${p.category}: ${p.description}` })),
  ...BAJO_PRESETS.map(p => ({ instrument: 'bajo' as const, id: p.id, name: p.name, description: `${p.genre}, ${p.family}: ${p.description}` })),
  ...FACTORY_PRESETS.map(p => ({ instrument: 'onda' as const, id: p.name, name: p.name, description: `${p.category}; ${p.tags.join(', ')}` })),
  ...SUITE_ORDER.flatMap(type => suiteBank(type).map(p => ({ instrument: type, id: p.id, name: p.name,
    description: `${SUITE[type].blurb} ${p.description}` }))),
];

export function instrumentGrounding(): string {
  return `Platform instruments: ONDA wavetable bass/lead/pad/pluck; AURA vintage analogue keys/brass/strings; BAJO mono bass, plucked upright, wobble and gate; ${SUITE_ORDER.map(id => `${SUITE[id].name}: ${SUITE[id].blurb}`).join('; ')}. CANTUS is a formant synth, not a lyric singer. KERA requires an explicitly loaded sample program; do not assume orchestral samples are installed.`;
}

/** Genre routing is explicit and deterministic. Presets come from the live banks. */
export function selectEnsembleVoices(prompt: string, preferredInstrument?: InstrumentType): EnsembleVoice[] {
  const electronic = /edm|dub\s*step|electronic|house|techno|trap|hip[ -]?hop/i.test(prompt);
  const cinematic = /cinematic|scor(e|ing)|orchestral|film/i.test(prompt);
  const choir = /choir|choral|chant|vocal|singer/i.test(prompt);
  const tokens = prompt.toLowerCase().match(/[a-z]{3,}/g) || [];
  function voice(instrument: InstrumentType, roleWords: string, instruction: string, minMidi: number, maxMidi: number, gainDb: number, pan: number, color: string): EnsembleVoice {
    const rankWords = [...tokens, ...roleWords.split(' '), ...roleWords.split(' ')];
    const candidates = catalog.filter(p => p.instrument === instrument);
    candidates.sort((a, b) => {
      const score = (p: typeof a) => rankWords.reduce((sum, word) => sum + (new RegExp(`\\b${word}\\b`, 'i').test(`${p.name} ${p.description}`) ? 1 : 0), 0);
      return score(b) - score(a);
    });
    const p = candidates[0];
    if (!p) throw new Error(`No factory preset is available for ${instrument}`);
    return { instrument, presetId: p.id, presetName: p.name, description: p.description, instruction,
      minMidi, maxMidi, gainDb, pan, color };
  }
  if (preferredInstrument) {
    const bass = preferredInstrument === 'bajo';
    return [voice(preferredInstrument, bass ? 'bass sub' : 'warm expressive',
      bass ? 'A monophonic bass part, chord roots and rhythmic rests; leave space for the kick.'
        : 'A playable expressive part appropriate to this instrument and the requested style, with motif development, rests and voice leading.',
      bass ? 28 : 48, bass ? 55 : 88, -12, 0, '#FFD166')];
  }
  return [
    voice(cinematic && !electronic ? 'vela' : 'aura', cinematic ? 'bowed sustained strings' : 'keys warm poly',
      'Harmonic accompaniment: voice-led chords, occasional arpeggios, phrase-end rests. Thin voicings below a vocal; no constant block chords.', 48, 84, -12, -0.15, '#FFD166'),
    voice('bajo', electronic ? 'sub bass wobble' : 'upright plucked acoustic',
      'Bass: monophonic, chord roots on strong beats with tasteful approaches. Leave kick space. Use short notes for fast bass articulation.', 28, 55, -9, 0, '#FF4D8D'),
    voice(choir ? 'cantus' : electronic ? 'onda' : 'pneuma', choir ? 'choir chant' : electronic ? 'pluck lead' : 'flute breath',
      choir ? 'Wordless choir counterline: sustained chord tones and rests; do not claim to sing lyrics. Yield to the generated lead vocal.'
        : 'Countermelody: a memorable singable motif repeated with variation, breaths and cadences. Answer the lead rather than doubling it.',
      60, 88, -15, 0.15, '#5B8CFF'),
  ];
}

/** Resolve the SAME preset that was described to the composer, rather than an Init patch. */
export function ensembleVoicePatch(voice: Pick<EnsembleVoice, 'instrument' | 'presetId'>): Record<string, unknown> {
  if (voice.instrument === 'aura') {
    const p = AURA_PRESETS.find(p => p.id === voice.presetId);
    if (p) return serializeAuraPatch(newAuraPatch(p));
  } else if (voice.instrument === 'bajo') {
    const p = BAJO_PRESETS.find(p => p.id === voice.presetId);
    if (p) return serializeBajoPatch(newBajoPatch(p));
  } else if (voice.instrument === 'onda') {
    const p = FACTORY_PRESETS.find(p => p.name === voice.presetId);
    if (p) return serializePatch(p);
  } else if (SUITE_ORDER.includes(voice.instrument as any)) {
    const p = suiteBank(voice.instrument as typeof SUITE_ORDER[number]).find(p => p.id === voice.presetId);
    if (p) return serializeVelaPatch(newVelaPatch(p));
  }
  throw new Error('The selected ensemble preset is no longer available.');
}
