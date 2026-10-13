/**
 * plajahAudioCore.ts — Polymorphic Audio Core Service for Plajah.
 *
 * One core engine under the hood, expressed contextually across:
 *   1. Fabula Cinema Reel (Slate script breakdowns, multi-take auditions, video timing sync)
 *   2. Chora DAW (BPM-quantized vocal drops, Melos generative scoring, multitrack routing)
 *   3. Tela Document Studio (Audiobook narration, dynamic quote detection, chapter exports)
 *
 * Harnesses:
 *   - Kokoro 82M (WebGPU/WASM, Zero-cloud, Aria Heart 'af_heart')
 *   - Fish Speech 1.5 (Zero-shot cloning, chunked streaming, emotion prosody)
 *   - Procedural Foley Synthesizer (Zero-latency procedural sound design)
 */

import { kokoroProvider } from './aria/providers/kokoro';
import { fishSpeechProvider } from './aria/providers/fishSpeech';
import { proceduralFoley, FoleyPreset, FoleyRenderResult } from '../audio/proceduralFoleyEngine';
import type { VoiceProfile, SpeakResult, WordMark } from './aria/types';

// Default Aria Heart Voice Profile (On-Device Kokoro Baseline)
export const ARIA_DEFAULT_PROFILE: VoiceProfile = {
  id: 'aria_heart',
  name: 'Aria Heart (Warm / Cinematic)',
  persona: 'aria',
  rate: 1.0,
  pitch: 0,
  providerPrefs: {
    kokoro: { voice: 'af_heart' },
    fish_speech: { emotion: 'neutral' },
  },
  fallbackOrder: ['kokoro', 'fish_speech'],
  onDeviceOnly: true,
};

export interface FabulaDialogueRequest {
  text: string;
  speakerId?: string;
  speakerName?: string;
  emotion?: 'neutral' | 'urgent' | 'whisper' | 'dramatic' | 'intimate' | 'shout';
  sceneId?: string;
  sceneNum?: string;
  takeIndex?: number;
  engine?: 'kokoro' | 'fish_speech';
}

export interface FabulaDialogueTake {
  takeId: string;
  speakerName: string;
  emotion?: string;
  text: string;
  durationSeconds: number;
  audioBlob: Blob;
  wordMarks: WordMark[];
  engineUsed: string;
  sceneSnapSeconds: number; // Recommended video shot duration to cradle the vocal delivery
}

export interface ChoraVocalDropRequest {
  text: string;
  bpm: number;
  key?: string;
  scaleLock?: boolean;
  bars?: number;
  engine?: 'kokoro' | 'fish_speech';
}

export interface ChoraVocalDropResult {
  audioBlob: Blob;
  durationSeconds: number;
  bpm: number;
  key: string;
  quantizedBeats: number;
  stemTarget: 'VOCAL_LEAD' | 'VOCAL_CHOP' | 'FX_DROP';
}

export interface TelaAudiobookRequest {
  text: string;
  chapterId?: string;
  chapterTitle?: string;
  paragraphIndex?: number;
  narratorVoiceId?: string;
  detectQuotes?: boolean;
}

export interface TelaAudiobookSegment {
  segmentId: string;
  speakerType: 'NARRATOR' | 'CHARACTER_QUOTE';
  speakerName: string;
  text: string;
  durationSeconds: number;
  audioBlob: Blob;
}

export class PlajahAudioCore {
  private static instance: PlajahAudioCore | null = null;

  static getInstance(): PlajahAudioCore {
    if (!this.instance) {
      this.instance = new PlajahAudioCore();
    }
    return this.instance;
  }

  /**
   * Resilient synthesis helper: attempts Kokoro on-device, falling back gracefully to Fish Speech / acoustic standby.
   */
  private async synthVoice(
    text: string,
    profile: VoiceProfile,
    speed: number = 1.0,
    preferredEngine?: 'kokoro' | 'fish_speech'
  ): Promise<{ result: SpeakResult; engineUsed: string }> {
    if (preferredEngine === 'fish_speech') {
      const res = await fishSpeechProvider.synth(text, profile, { speed });
      return { result: res, engineUsed: 'fish_speech' };
    }
    try {
      const res = await kokoroProvider.synth(text, profile, { speed });
      return { result: res, engineUsed: 'kokoro' };
    } catch {
      const res = await fishSpeechProvider.synth(text, profile, { speed });
      return { result: res, engineUsed: 'fish_speech_fallback' };
    }
  }

  /**
   * 1. FABULA EXPRESSION: Synthesizes dialogue takes pre-populated from Slate breakdowns.
   */
  async synthesizeFabulaDialogue(req: FabulaDialogueRequest): Promise<FabulaDialogueTake> {
    const profile: VoiceProfile = {
      ...ARIA_DEFAULT_PROFILE,
      name: req.speakerName || 'Aria',
      providerPrefs: {
        kokoro: { voice: 'af_heart' },
        fish_speech: { emotion: req.emotion || 'neutral' },
      },
    };

    const { result, engineUsed } = await this.synthVoice(req.text, profile, 1.0, req.engine);

    const durSec = result.durationMs / 1000.0;
    // Add small breathing buffer (+0.2s pre-roll and +0.3s post-roll) for cinematic video cut snapping
    const sceneSnapSeconds = Math.round((durSec + 0.5) * 10) / 10;

    return {
      takeId: `take_${Date.now()}_${req.takeIndex || 1}`,
      speakerName: req.speakerName || 'Aria',
      emotion: req.emotion || 'neutral',
      text: req.text,
      durationSeconds: durSec,
      audioBlob: (result.audio instanceof Blob) ? result.audio : new Blob(),
      wordMarks: result.marks || [],
      engineUsed,
      sceneSnapSeconds,
    };
  }

  /**
   * 2. CHORA DAW EXPRESSION: Synthesizes BPM-quantized vocal drops and musical stems.
   */
  async synthesizeChoraVocalDrop(req: ChoraVocalDropRequest): Promise<ChoraVocalDropResult> {
    const profile: VoiceProfile = {
      ...ARIA_DEFAULT_PROFILE,
      rate: 1.05,
    };

    const { result } = await this.synthVoice(req.text, profile, 1.05, req.engine || 'fish_speech');
    const durSec = result.durationMs / 1000.0;

    // Calculate musical bar quantization
    const secPerBeat = 60.0 / req.bpm;
    const beatsCalculated = Math.max(1, Math.ceil(durSec / secPerBeat));

    return {
      audioBlob: (result.audio instanceof Blob) ? result.audio : new Blob(),
      durationSeconds: durSec,
      bpm: req.bpm,
      key: req.key || 'D Minor',
      quantizedBeats: beatsCalculated,
      stemTarget: 'VOCAL_LEAD',
    };
  }

  /**
   * 3. TELA EXPRESSION: Synthesizes document paragraphs and audiobooks with dynamic quote detection.
   */
  async synthesizeTelaAudiobook(req: TelaAudiobookRequest): Promise<TelaAudiobookSegment[]> {
    const segments: TelaAudiobookSegment[] = [];
    const text = req.text.trim();

    // Regex to detect spoken dialogue inside quotes
    const quoteRegex = /“([^”]+)”|"([^"]+)"/g;
    const hasQuotes = req.detectQuotes !== false && quoteRegex.test(text);

    if (!hasQuotes) {
      // Entire paragraph is narration
      const { result } = await this.synthVoice(text, ARIA_DEFAULT_PROFILE, 1.0);
      segments.push({
        segmentId: `seg_${Date.now()}_0`,
        speakerType: 'NARRATOR',
        speakerName: 'Aria (Narrator)',
        text,
        durationSeconds: result.durationMs / 1000.0,
        audioBlob: (result.audio instanceof Blob) ? result.audio : new Blob(),
      });
    } else {
      // Split into narration and character quotes
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      let segCount = 0;

      // Re-run regex match loop
      const runner = /“([^”]+)”|"([^"]+)"/g;
      while ((match = runner.exec(text)) !== null) {
        // Preceding narration
        if (match.index > lastIndex) {
          const narrationText = text.slice(lastIndex, match.index).trim();
          if (narrationText) {
            const { result: nRes } = await this.synthVoice(narrationText, ARIA_DEFAULT_PROFILE, 1.0);
            segments.push({
              segmentId: `seg_${Date.now()}_${segCount++}`,
              speakerType: 'NARRATOR',
              speakerName: 'Aria (Narrator)',
              text: narrationText,
              durationSeconds: nRes.durationMs / 1000.0,
              audioBlob: (nRes.audio instanceof Blob) ? nRes.audio : new Blob(),
            });
          }
        }

        // Quoted character speech
        const quoteText = match[1] || match[2];
        const { result: cRes } = await this.synthVoice(quoteText, ARIA_DEFAULT_PROFILE, 1.02, 'fish_speech');
        segments.push({
          segmentId: `seg_${Date.now()}_${segCount++}`,
          speakerType: 'CHARACTER_QUOTE',
          speakerName: 'Character Dialogue',
          text: quoteText,
          durationSeconds: cRes.durationMs / 1000.0,
          audioBlob: (cRes.audio instanceof Blob) ? cRes.audio : new Blob(),
        });

        lastIndex = runner.lastIndex;
      }

      // Trailing narration
      if (lastIndex < text.length) {
        const trailingText = text.slice(lastIndex).trim();
        if (trailingText) {
          const { result: tRes } = await this.synthVoice(trailingText, ARIA_DEFAULT_PROFILE, 1.0);
          segments.push({
            segmentId: `seg_${Date.now()}_${segCount++}`,
            speakerType: 'NARRATOR',
            speakerName: 'Aria (Narrator)',
            text: trailingText,
            durationSeconds: tRes.durationMs / 1000.0,
            audioBlob: (tRes.audio instanceof Blob) ? tRes.audio : new Blob(),
          });
        }
      }
    }

    return segments;
  }

  /**
   * PROCEDURAL & AI FOLEY DISPATCHER
   */
  triggerFoley(presetId: string, bpm?: number, beatBars?: number): FoleyRenderResult {
    return proceduralFoley.renderFoley({ presetId, bpm, beatBars });
  }

  /**
   * List available procedural sound design presets.
   */
  getFoleyPresets(): FoleyPreset[] {
    return proceduralFoley.listPresets();
  }
}

export const plajahAudioCore = PlajahAudioCore.getInstance();
