// humToMidi — sing / hum → MIDI notes for Melos's composer.
//
// Bridges the shipped YIN transcription engine (services/audioTranscription — pitch
// contour → beat-quantised notes, with detected key/mode/bpm) into Melos's own note
// model (NoteEvent, beats-based MIDI clips). The detected key does double duty: it
// snaps the melody to a musical scale AND tells the composer "what they're going for"
// so it can harmonise / extend in the right key.
import { transcribeTrack, type Transcription } from '../../audioTranscription';
import type { NoteEvent } from '../beats/grooveDoc';
import { nameToPc, snapToScale } from '../theory';

const nid = () => 'n' + Math.random().toString(36).slice(2, 9);

export interface HumResult {
  notes: NoteEvent[];
  key: string;                 // detected tonic, e.g. 'C', 'F#'
  mode: 'major' | 'minor';
  bpm: number;
  confidence: number;          // 0..1 grid-fit confidence
}

/**
 * Turn a Transcription into Melos NoteEvents.
 * @param voice which line to keep ('melody' by default; 'bass' for a bassline).
 * @param snapToKey nudge each note to the detected key's scale (default on) — humming
 *        is rarely perfectly in tune, so this cleans it up without changing the shape.
 */
export function transcriptionToNotes(
  tr: Transcription,
  opts: { voice?: 'melody' | 'bass'; snapToKey?: boolean } = {},
): NoteEvent[] {
  const voice = opts.voice ?? 'melody';
  const snap = opts.snapToKey ?? true;
  const rootPc = nameToPc(tr.key);
  const scaleId = tr.mode === 'minor' ? 'minor' : 'major';
  return tr.notes
    .filter((t) => t.voice === voice)
    .map((t) => ({
      id: nid(),
      startBeats: Math.max(0, t.startBeat),
      lengthBeats: Math.max(0.25, t.durBeats),
      key: snap ? snapToScale(t.midi, rootPc, scaleId, 'nearest') : t.midi,
      vel: Math.max(1, Math.min(127, Math.round(1 + (t.velocity ?? 0.7) * 126))),
    }))
    .sort((a, b) => a.startBeats - b.startBeats);
}

/**
 * Record a hum/sing (blob or file URL) and transcribe it to a Melos MIDI clip's
 * worth of NoteEvents, returning the detected key/mode/bpm alongside so the caller
 * can set the groove's key and let the composer harmonise in it.
 */
export async function humToNotes(
  url: string,
  opts: { voice?: 'melody' | 'bass'; snapToKey?: boolean; onProgress?: (stage: string, pct: number) => void } = {},
): Promise<HumResult> {
  const tr = await transcribeTrack(url, { onProgress: opts.onProgress });
  return {
    notes: transcriptionToNotes(tr, { voice: opts.voice, snapToKey: opts.snapToKey }),
    key: tr.key,
    mode: tr.mode,
    bpm: tr.bpm,
    confidence: tr.confidence,
  };
}
