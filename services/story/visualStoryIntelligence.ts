/**
 * services/story/visualStoryIntelligence.ts
 *
 * Plajah Multimodal Visual & Audio Story Intelligence
 *
 * 1. Visual Asset Recognition:
 *    Identifies characters, locations, and props across images, storyboard cels,
 *    and video frames by matching against World dossiers and Character Bibles.
 * 2. Voice Print Profiling:
 *    Maps character dossiers to distinct vocal signatures (Kokoro, Fish Speech, WebSpeech)
 *    with timbre, speech cadence, and emotional ranges.
 */

import type { CharacterVoicePrint, CharacterStoryDossier } from '../anima/types.ts';
import { listSavedCharacters, type CharacterSheet } from './characterBible.ts';

export interface VisualRecognitionResult {
  matchedCharacter?: CharacterStoryDossier;
  confidence: number; // 0..1
  identifiedTraits: string[];
  matchedVisualAnchors: string[];
  recommendedVoicePrintId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DEFAULT STORY VOICE PRINT REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export const CANONICAL_VOICE_PRINTS: Record<string, CharacterVoicePrint> = {
  vp_kael: {
    id: 'vp_kael',
    characterId: 'char_kael',
    characterName: 'Kael',
    provider: 'kokoro',
    voiceId: 'am_fenrir',
    pitchMultiplier: 0.95,
    rateMultiplier: 1.02,
    timbreDescription: 'Resolute, gravelly baritone with sharp tactical cadence',
    emotionalPresets: {
      urgent: { pitch: 1.08, rate: 1.15, energy: 1.3 },
      whisper: { pitch: 0.90, rate: 0.92, energy: 0.5 },
      dramatic: { pitch: 0.92, rate: 0.95, energy: 1.2 },
    },
  },
  vp_maya: {
    id: 'vp_maya',
    characterId: 'char_maya',
    characterName: 'Maya',
    provider: 'kokoro',
    voiceId: 'af_heart',
    pitchMultiplier: 1.05,
    rateMultiplier: 1.05,
    timbreDescription: 'Warm, clear cinematic soprano with analytical precision',
    emotionalPresets: {
      urgent: { pitch: 1.12, rate: 1.2, energy: 1.35 },
      whisper: { pitch: 0.98, rate: 0.95, energy: 0.6 },
      dramatic: { pitch: 1.0, rate: 0.98, energy: 1.1 },
    },
  },
  vp_rello: {
    id: 'vp_rello',
    characterId: 'char_rello',
    characterName: 'Reello (Lumi)',
    provider: 'kokoro',
    voiceId: 'bm_george',
    pitchMultiplier: 1.15,
    rateMultiplier: 1.1,
    timbreDescription: 'Playful, animated mascot tenor with exuberant inflection',
    emotionalPresets: {
      urgent: { pitch: 1.25, rate: 1.25, energy: 1.4 },
      whisper: { pitch: 1.05, rate: 0.9, energy: 0.6 },
      dramatic: { pitch: 1.0, rate: 1.0, energy: 1.2 },
    },
  },
  vp_chora: {
    id: 'vp_chora',
    characterId: 'char_chora',
    characterName: 'Chora (Lorik)',
    provider: 'kokoro',
    voiceId: 'bf_emma',
    pitchMultiplier: 1.0,
    rateMultiplier: 0.96,
    timbreDescription: 'Melodic, resonant alto with lyrical, rhythmic phrasing',
    emotionalPresets: {
      urgent: { pitch: 1.1, rate: 1.15, energy: 1.3 },
      whisper: { pitch: 0.95, rate: 0.92, energy: 0.5 },
      dramatic: { pitch: 0.96, rate: 0.94, energy: 1.25 },
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. VOICE PRINT RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

export class StoryVoiceIntelligence {
  private voicePrints: Map<string, CharacterVoicePrint> = new Map();

  constructor() {
    Object.values(CANONICAL_VOICE_PRINTS).forEach(vp => {
      this.voicePrints.set(vp.characterName.toUpperCase(), vp);
      this.voicePrints.set(vp.id, vp);
    });
  }

  public getVoicePrintForCharacter(charNameOrId: string, dossier?: CharacterStoryDossier): CharacterVoicePrint {
    const key = charNameOrId.toUpperCase().trim();
    if (this.voicePrints.has(key)) {
      return this.voicePrints.get(key)!;
    }

    // Auto-generate Voice Print from Story Dossier / Archetype
    return this.synthesizeVoicePrintFromDossier(charNameOrId, dossier);
  }

  public registerVoicePrint(vp: CharacterVoicePrint): void {
    this.voicePrints.set(vp.characterName.toUpperCase(), vp);
    this.voicePrints.set(vp.id, vp);
  }

  public synthesizeVoicePrintFromDossier(name: string, dossier?: CharacterStoryDossier): CharacterVoicePrint {
    const arch = (dossier?.archetype || '').toLowerCase();
    const traits = (dossier?.personalityTraits || []).join(' ').toLowerCase();

    let voiceId = 'af_heart';
    let pitch = 1.0;
    let rate = 1.0;
    let timbre = 'Balanced cinematic delivery';

    if (arch.includes('titan') || arch.includes('heavy') || arch.includes('brute') || traits.includes('stoic')) {
      voiceId = 'am_adam';
      pitch = 0.88;
      rate = 0.92;
      timbre = 'Heavy, reverberant low baritone';
    } else if (arch.includes('child') || arch.includes('mascot') || traits.includes('playful')) {
      voiceId = 'bm_fable';
      pitch = 1.2;
      rate = 1.1;
      timbre = 'Lively, high-frequency animated mascot voice';
    } else if (arch.includes('mentor') || arch.includes('elder') || arch.includes('wizard')) {
      voiceId = 'am_michael';
      pitch = 0.94;
      rate = 0.94;
      timbre = 'Aged, distinguished cadence with natural pauses';
    } else if (arch.includes('tech') || arch.includes('android') || arch.includes('ai')) {
      voiceId = 'bf_isabella';
      pitch = 1.02;
      rate = 1.08;
      timbre = 'Crisp, articulate electronic clarity';
    }

    const newVp: CharacterVoicePrint = {
      id: `vp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      characterId: dossier?.characterId || `char_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      characterName: name,
      provider: 'kokoro',
      voiceId,
      pitchMultiplier: pitch,
      rateMultiplier: rate,
      timbreDescription: timbre,
      emotionalPresets: {
        urgent: { pitch: pitch * 1.1, rate: rate * 1.15, energy: 1.3 },
        whisper: { pitch: pitch * 0.95, rate: rate * 0.92, energy: 0.6 },
        dramatic: { pitch: pitch * 0.96, rate: rate * 0.96, energy: 1.2 },
      },
    };

    this.registerVoicePrint(newVp);
    return newVp;
  }
}

export const storyVoiceIntelligence = new StoryVoiceIntelligence();

// ─────────────────────────────────────────────────────────────────────────────
// 3. VISUAL STORY INTELLIGENCE (Artwork & Asset Recognition)
// ─────────────────────────────────────────────────────────────────────────────

export class VisualStoryIntelligence {
  /**
   * Matches an input image or canvas descriptor against saved Character Bibles and Lore Dossiers.
   */
  public recognizeCharacterInAsset(
    assetLabelOrHint: string,
    colorPalette: string[] = [],
    savedCharacters: CharacterSheet[] = listSavedCharacters(),
  ): VisualRecognitionResult {
    const hintLower = (assetLabelOrHint || '').toLowerCase();

    // Check canonical Kith Kaijus first
    if (hintLower.includes('rello') || hintLower.includes('lumi') || colorPalette.includes('#F2621C') || colorPalette.includes('#EF7426')) {
      return {
        matchedCharacter: {
          characterId: 'char_rello',
          name: 'Reello (Lumi)',
          archetype: 'The Vision Kaiju Mascot',
          role: 'Plajah Vision Mascot',
          physicalStats: { weight: '85 lbs', height: '3 ft 8 in', species: 'Kith Kaiju' },
          personalityTraits: ['curious', 'photographic', 'energetic', 'playful'],
          locomotionStyle: 'mascot_bob',
          defaultMood: 'joyful',
          voicePrintId: 'vp_rello',
        },
        confidence: 0.96,
        identifiedTraits: ['Orange bandit eye patch', 'Radiating frill fan', 'Camera flash pulse', 'Belly flame'],
        matchedVisualAnchors: ['Navy body', 'Orange mask', 'Flame core'],
        recommendedVoicePrintId: 'vp_rello',
      };
    }

    if (hintLower.includes('chora') || hintLower.includes('lorik') || colorPalette.includes('#7A66BC') || colorPalette.includes('#C2257C')) {
      return {
        matchedCharacter: {
          characterId: 'char_chora',
          name: 'Chora (Lorik)',
          archetype: 'The Sonic Kaiju Mascot',
          role: 'Plajah Music Mascot',
          physicalStats: { weight: '92 lbs', height: '3 ft 10 in', species: 'Kith Kaiju' },
          personalityTraits: ['melodic', 'thoughtful', 'rhythmic', 'attentive'],
          locomotionStyle: 'mascot_bob',
          defaultMood: 'serene',
          voicePrintId: 'vp_chora',
        },
        confidence: 0.95,
        identifiedTraits: ['Lavender bandit eye patch', 'Eighth note belly crest', 'Navy horn pair', 'Songbook'],
        matchedVisualAnchors: ['Purple body', 'Lavender mask', 'Eighth note emblem'],
        recommendedVoicePrintId: 'vp_chora',
      };
    }

    // Match against saved character sheets from CharacterBible
    for (const sheet of savedCharacters) {
      const sheetName = sheet.name.toLowerCase();
      const sheetAnchor = (sheet.visualAnchor || '').toLowerCase();

      let matchScore = 0;
      const matchedTraits: string[] = [];

      if (hintLower.includes(sheetName)) {
        matchScore += 0.7;
        matchedTraits.push(`Name match: ${sheet.name}`);
      }

      const anchorWords = sheetAnchor.split(/[\s,]+/).filter(w => w.length > 3);
      for (const word of anchorWords) {
        if (hintLower.includes(word)) {
          matchScore += 0.15;
          matchedTraits.push(`Visual anchor: ${word}`);
        }
      }

      if (matchScore >= 0.5) {
        return {
          matchedCharacter: {
            characterId: sheet.id,
            name: sheet.name,
            archetype: sheet.genderOrArchetype || 'Protagonist',
            physicalStats: { age: sheet.age },
            personalityTraits: matchedTraits,
            locomotionStyle: 'nimble_stride',
          },
          confidence: Math.min(0.99, matchScore),
          identifiedTraits: matchedTraits,
          matchedVisualAnchors: [sheet.visualAnchor],
          recommendedVoicePrintId: `vp_${sheet.id}`,
        };
      }
    }

    // Default unknown / generic
    return {
      confidence: 0.2,
      identifiedTraits: ['Unmatched character artwork'],
      matchedVisualAnchors: [],
    };
  }

  /**
   * Alias for recognizeCharacterInAsset
   */
  public recognizeCharacterInArtwork(
    artworkLabelOrPrompt: string,
    colorPalette: string[] = [],
    savedCharacters?: CharacterSheet[],
  ): VisualRecognitionResult {
    return this.recognizeCharacterInAsset(artworkLabelOrPrompt, colorPalette, savedCharacters);
  }
}

export const visualStoryIntelligence = new VisualStoryIntelligence();
