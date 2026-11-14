// Voice-design briefs for the Session Band — one per character, written from their character sheet
// (age, where they're from, timbre, pace, warmth), for ElevenLabs Voice Design (a voice made from a
// description). Each has a preview script in the character's own words. The characters are fictional:
// briefs describe a voice, never a real person's, and must not be used to imitate anyone.
// scripts/band/designBandVoices.ts designs each one through the ElevenLabs API and records the saved
// voice in elevenVoices.json (previews to audition in scratch/band-voices). Pre-rendered lines use these
// voices; live talk keeps the on-device voice (sheet.voice.kokoro) so nothing leaves the machine at runtime.

import ELEVEN_VOICES from './elevenVoices.json';

export interface VoiceDesignBrief {
  id: string;
  /** The description for Voice Design (what the voice sounds like). */
  prompt: string;
  /** What the preview says — in character, 100–1000 characters. */
  preview: string;
}

export interface DesignedVoice { voiceId: string; preview: number; name: string; designedAt: string }
/** The ElevenLabs voice designed for a character, if it has been. */
export const elevenVoiceFor = (id: string): DesignedVoice | undefined => (ELEVEN_VOICES as Record<string, DesignedVoice>)[id];

export const VOICE_BRIEFS: VoiceDesignBrief[] = [
  { id: 'marcus', prompt: 'A warm, low baritone voice of a Black American man in his early fifties from Memphis, Tennessee. Relaxed Southern cadence, unhurried, a smile you can hear, a little gravel at the bottom. Speaks like a patient drummer coaching a student — encouraging, easygoing, natural studio-mic intimacy.',
    preview: 'Alright, let\'s find the pocket together. Don\'t chase the beat — sit back and let it come to you. Hear that? Two and four, steady as Sunday morning. Now put a ghost note in between, soft, like you\'re whispering to the snare.' },
  { id: 'amara', prompt: 'A warm, low alto voice of a Nigerian woman in her late thirties who has lived in Havana. Calm, musical and patient, a gentle Nigerian English accent with a light rhythmic lilt. Clear diction, unhurried, the voice of a teacher who listens. Close, natural recording.',
    preview: 'Put your hands on the drum. Bass in the middle, tone near the edge, slap at the edge with relaxed fingers. Listen — the drum speaks first, and then we answer. Good. Now again, a little softer, and let it ring.' },
  { id: 'dwayne', prompt: 'A low, dry, easy voice of a Black American man in his mid-forties from Detroit. Laid-back drawl, few words, wry humor, unhurried and confident. Deep chest resonance, close mic, conversational.',
    preview: 'Less is more. Lock in with the kick drum and leave some space. The best note is usually the one you don\'t play. There — hear how the whole band just sat down on that? That\'s the floor. Stand on it.' },
  { id: 'rosa', prompt: 'A bright, warm voice of a Mexican-American woman in her early thirties from San Antonio, Texas. Confident and playful, a natural Texan warmth, quick to laugh, medium pace. Clear, friendly, close mic.',
    preview: 'Okay, play me something you love and we\'ll take it apart. Let that chord ring — don\'t choke it. See how the open strings fill the room? Now palm-mute the next bar and feel it tighten up. That\'s the whole trick.' },
  { id: 'theo', prompt: 'A soft, precise tenor voice of a Creole man in his late thirties from New Orleans who studied in Paris. Thoughtful and gentle, a light New Orleans warmth with careful diction. Calm medium pace, a musician thinking out loud. Close, intimate recording.',
    preview: 'Play a chord — any chord — and let\'s hear where it wants to go. That\'s D minor seven. Now leave the root to the bass player and hold the top note while the others move a step. Hear the voice leading? That\'s the whole story of a song.' },
  { id: 'hez', prompt: 'A deep, gentle bass voice of a Black American man in his sixties from Birmingham, Alabama. Warm, wise and encouraging, slow and spacious Southern cadence, a church musician\'s patience. Rich low resonance, close mic.',
    preview: 'Take your time. Sit a while and just listen to that chord breathe. Now pull that drawbar out a little — hear it open up? There\'s no hurry in this music. Let it swell, let it settle, and then we\'ll go on together.' },
  { id: 'nova', prompt: 'A cool, quick, precise voice of a Korean woman in her late twenties who lives in Berlin. Calm and focused, light Korean accent in clear English, efficient sentences, a hint of dry humor. Modern, close, clean recording.',
    preview: 'Turn the filter cutoff down. Hear the high harmonics disappear? That\'s subtractive synthesis. Now open it slowly while you hold the note. One change at a time, then play — your ears are the oscilloscope.' },
  { id: 'ingrid', prompt: 'A calm, clear, unhurried voice of a Norwegian woman in her forties from Bergen. Serene and precise, soft Norwegian accent in English, gentle warmth, the voice of a cellist who values listening. Close, quiet room.',
    preview: 'Play slowly for me. Long notes. Let the bow travel the whole length and keep the weight even. Breathe with the bow. There — that is your sound. Now we can make it sing.' },
  { id: 'priya', prompt: 'A bright, lively voice of a South Indian woman in her early thirties from Chennai who now lives in Nashville. Warm and quick to laugh, a light Tamil-English accent with a little Southern US softness. Energetic medium pace, close mic.',
    preview: 'Hi! Play me a phrase. Now slide into that last note instead of landing on it — hear the difference? In Carnatic music we do it one way, in fiddle tunes another, but it\'s the same idea: the note has a journey.' },
  { id: 'corny', prompt: 'A warm, natural, mid-range voice of a Black American man in his late twenties from New Orleans. Relaxed and confident, a smooth New Orleans accent, an easy smile in the voice without exaggeration. Conversational and grounded, a touch of swagger, the kind of trumpet player who makes everyone in the room comfortable. Clean, close studio recording',
    preview: 'Give me something and I\'ll answer it! That\'s it — call and response, like on the street in a second line. Now play it back to me with a little more air in it. Blow!' },
  { id: 'lena', prompt: 'A smoky, low alto voice of an Italian-American woman in her mid-forties from Chicago. Dry wit, direct and honest, a little husky, unhurried, a jazz musician\'s cool. Close mic, late-night club intimacy.',
    preview: 'Tell me a story. A solo is a sentence: a beginning, a middle and an end. Start simple, leave some space, then go somewhere. And don\'t play everything you know in the first bar — save something for the end.' },
  { id: 'felix', prompt: 'A friendly, quick, warm voice of an Irish man in his late thirties from Dublin. Easygoing storyteller, light Dublin accent, a smile in it, medium pace. Close, natural recording.',
    preview: 'Mind your breath now. Take a good one before the phrase, not halfway through it. Grand. That tune comes from the west of Ireland — you play it lightly, let the ornaments float on top. Try it again, nice and easy.' },
  { id: 'elena', prompt: 'A composed, resonant, exact voice of a Mexican woman in her early fifties from Mexico City, an orchestra conductor. Authoritative but warm, light Mexican Spanish accent in clear English, measured pace. Rich, close recording.',
    preview: 'From the top. Listen across the sections — the strings are covering the melody. Bring the violas down and let the horn come through. Good. Bar seventeen, everyone, and this time, breathe together.' },
];

export const voiceBriefById = (id: string) => VOICE_BRIEFS.find((b) => b.id === id);
