/**
 * microsoftAIService.ts — Microsoft AI integration layer for Plajah.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ENDPOINT STATUS (as of build date 2026-06-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * MAI Voice 2 and MAI Transcribe 1.5 were announced 2026-06-02.
 * Exact REST endpoints are pending official Microsoft documentation.
 * Endpoints below follow Azure Cognitive Services conventions and MUST be
 * updated to the production URLs once the Microsoft docs are published.
 *
 * To find the correct endpoints:
 *   1. https://learn.microsoft.com/azure/cognitive-services/
 *   2. Search "MAI Voice 2" and "MAI Transcribe 1.5"
 *   3. Update MAI_VOICE_ENDPOINT and MAI_TRANSCRIBE_ENDPOINT below.
 *
 * Environment variables required in .env.local:
 *   VITE_AZURE_SPEECH_KEY=<your MAI / Azure Cognitive Services key>
 *   VITE_AZURE_REGION=eastus   (or whichever region your resource is in)
 *   VITE_AZURE_TRANSLATOR_KEY=<Azure Translator key>
 *   VITE_AZURE_CONTENT_SAFETY_KEY=<Azure Content Safety key>
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Endpoint configuration ─────────────────────────────────────────────────────
const REGION = import.meta.env.VITE_AZURE_REGION || 'eastus';
const SPEECH_KEY = import.meta.env.VITE_AZURE_SPEECH_KEY || '';
const TRANSLATOR_KEY = import.meta.env.VITE_AZURE_TRANSLATOR_KEY || '';
const CONTENT_SAFETY_KEY = import.meta.env.VITE_AZURE_CONTENT_SAFETY_KEY || '';

/**
 * TODO: Replace with official MAI Voice 2 endpoint once docs are published.
 * Interim: falls back to Azure Neural TTS (same capability, older model generation).
 */
const MAI_VOICE_ENDPOINT = `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

/**
 * TODO: Replace with official MAI Transcribe 1.5 endpoint once docs are published.
 * Interim: falls back to Azure Speech STT (same capability, older model generation).
 */
const MAI_TRANSCRIBE_ENDPOINT = `https://${REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;

const TRANSLATOR_ENDPOINT = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0';
const CONTENT_SAFETY_ENDPOINT = `https://${REGION}.api.cognitive.microsoft.com/contentsafety/text:analyze?api-version=2023-10-01`;

// ── Voice profiles ─────────────────────────────────────────────────────────────
export interface MAIVoiceProfile {
  id: string;
  name: string;
  description: string;
  shortName: string;   // SSML voice name
  gender: 'Female' | 'Male' | 'Neutral';
  locale: string;
  style?: string;      // narration, conversational, newscast…
  emoji: string;
}

/**
 * MAI Voice 2 voice profiles.
 * Names match Azure Neural TTS as interim; update shortName values to
 * MAI Voice 2 identifiers once Microsoft publishes the voice catalog.
 */
export const MAI_VOICES: MAIVoiceProfile[] = [
  {
    id: 'aria-narration',
    name: 'Aria — Narrator',
    description: 'Warm, authoritative narrator. Perfect for literary fiction and non-fiction.',
    shortName: 'en-US-AriaNeural',
    gender: 'Female', locale: 'en-US', style: 'narration-professional', emoji: '📖',
  },
  {
    id: 'guy-story',
    name: 'Guy — Storyteller',
    description: 'Deep, engaging voice. Great for thrillers and adventure.',
    shortName: 'en-US-GuyNeural',
    gender: 'Male', locale: 'en-US', style: 'narration-professional', emoji: '🎙️',
  },
  {
    id: 'jenny-conversational',
    name: 'Jenny — Conversational',
    description: 'Natural, approachable. Ideal for self-help, memoir, and essays.',
    shortName: 'en-US-JennyNeural',
    gender: 'Female', locale: 'en-US', style: 'narration-relaxed', emoji: '💬',
  },
  {
    id: 'davis-expressive',
    name: 'Davis — Expressive',
    description: 'Energetic and characterful. Best for children\'s books and drama.',
    shortName: 'en-US-DavisNeural',
    gender: 'Male', locale: 'en-US', style: 'narration-professional', emoji: '✨',
  },
  {
    id: 'emma-literary',
    name: 'Emma — Literary',
    description: 'Crisp, precise. Excellent for poetry, classics, and academic texts.',
    shortName: 'en-US-EmmaNeural',
    gender: 'Female', locale: 'en-US', style: 'narration-professional', emoji: '📜',
  },
  {
    id: 'brandon-news',
    name: 'Brandon — Broadcast',
    description: 'Authoritative newscast tone. Good for articles and journalism.',
    shortName: 'en-US-BrandonNeural',
    gender: 'Male', locale: 'en-US', style: 'newscast', emoji: '📻',
  },
];

// ── Output formats ─────────────────────────────────────────────────────────────
export type AudioOutputFormat =
  | 'audio-16khz-128kbitrate-mono-mp3'
  | 'audio-24khz-160kbitrate-mono-mp3'
  | 'riff-24khz-16bit-mono-pcm';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface NarrationRequest {
  text: string;
  voiceId: string;
  rate?: number;     // 0.5–2.0 (default 1.0)
  pitch?: number;    // -50 to +50 Hz offset (default 0)
  format?: AudioOutputFormat;
}

export interface NarrationResult {
  audioBlob: Blob;
  durationMs: number;
  voiceId: string;
  characterCount: number;
}

export interface TranscriptionResult {
  transcript: string;
  confidence: number;      // 0–1
  words?: WordTimestamp[]; // per-word timing if available
  language?: string;
}

export interface WordTimestamp {
  word: string;
  offsetMs: number;
  durationMs: number;
}

export interface TranscriptionAccuracyResult {
  accuracy: number;         // 0–1 match score
  matchedWords: number;
  totalWords: number;
  mismatches: Array<{ expected: string; got: string; position: number }>;
}

export interface ContentSafetyResult {
  safe: boolean;
  categories: Record<string, { severity: number }>;
  flaggedText?: string;
}

export interface TranslationResult {
  translatedText: string;
  detectedLanguage?: string;
  targetLanguage: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildSsml(text: string, voice: MAIVoiceProfile, rate: number, pitch: number): string {
  const rateStr = rate === 1 ? 'default' : `${Math.round(rate * 100)}%`;
  const pitchStr = pitch === 0 ? 'default' : `${pitch > 0 ? '+' : ''}${pitch}Hz`;
  const styleAttr = voice.style ? ` style="${voice.style}"` : '';
  return `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
  xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${voice.locale}">
  <voice name="${voice.shortName}">
    <mstts:express-as${styleAttr}>
      <prosody rate="${rateStr}" pitch="${pitchStr}">
        ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`.trim();
}

function getVoiceProfile(voiceId: string): MAIVoiceProfile {
  return MAI_VOICES.find(v => v.id === voiceId) ?? MAI_VOICES[0];
}

// ── MAI Voice 2 — Text-to-Speech ──────────────────────────────────────────────
/**
 * Synthesize narration using MAI Voice 2.
 *
 * Implementation note: calls the Azure Neural TTS endpoint until MAI Voice 2
 * endpoint is published.  The SSML format and auth header pattern will be the
 * same for MAI Voice 2 — only MAI_VOICE_ENDPOINT changes.
 */
export async function synthesizeNarration(req: NarrationRequest): Promise<NarrationResult> {
  if (!SPEECH_KEY) throw new Error('VITE_AZURE_SPEECH_KEY not set — add it to .env.local');

  const voice = getVoiceProfile(req.voiceId);
  const ssml = buildSsml(req.text, voice, req.rate ?? 1, req.pitch ?? 0);
  const fmt = req.format ?? 'audio-24khz-160kbitrate-mono-mp3';

  const start = Date.now();
  const res = await fetch(MAI_VOICE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': fmt,
      'Ocp-Apim-Subscription-Key': SPEECH_KEY,
      'User-Agent': 'PlajahPlatform/1.0',
    },
    body: ssml,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`MAI Voice 2 synthesis failed (${res.status}): ${errText}`);
  }

  const audioBlob = await res.blob();
  const durationMs = Date.now() - start; // approximate; replace with actual duration if API returns it

  return {
    audioBlob,
    durationMs,
    voiceId: req.voiceId,
    characterCount: req.text.length,
  };
}

/**
 * Synthesize multiple text chunks in order, returning an array of audio blobs.
 * Used for per-paragraph narration in the audiobook studio.
 */
export async function synthesizeParagraphs(
  paragraphs: string[],
  voiceId: string,
  rate = 1.0,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob[]> {
  const results: Blob[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) { results.push(new Blob([])); continue; }
    const { audioBlob } = await synthesizeNarration({ text: p, voiceId, rate });
    results.push(audioBlob);
    onProgress?.(i + 1, paragraphs.length);
  }
  return results;
}

// ── MAI Transcribe 1.5 — Speech-to-Text ──────────────────────────────────────
/**
 * Transcribe an audio recording using MAI Transcribe 1.5.
 *
 * Implementation note: calls the Azure Speech STT endpoint until MAI Transcribe 1.5
 * endpoint is published.  Accepts WAV, OGG, MP3 (16kHz mono recommended).
 */
export async function transcribeAudio(
  audioBlob: Blob,
  language = 'en-US',
): Promise<TranscriptionResult> {
  if (!SPEECH_KEY) throw new Error('VITE_AZURE_SPEECH_KEY not set');

  // Convert to correct format if needed
  const url = `${MAI_TRANSCRIBE_ENDPOINT}?language=${language}&format=detailed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': audioBlob.type || 'audio/wav',
      'Ocp-Apim-Subscription-Key': SPEECH_KEY,
    },
    body: audioBlob,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`MAI Transcribe 1.5 failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  // Azure STT response structure
  const bestResult = data.NBest?.[0] ?? {};
  const transcript: string = bestResult.Display ?? data.DisplayText ?? '';
  const confidence: number = bestResult.Confidence ?? 0;

  // Word-level timestamps (if available in detailed format)
  const words: WordTimestamp[] = (bestResult.Words ?? []).map((w: any) => ({
    word: w.Word,
    offsetMs: Math.round(w.Offset / 10000), // Azure returns 100ns ticks
    durationMs: Math.round(w.Duration / 10000),
  }));

  return { transcript, confidence, words: words.length ? words : undefined, language };
}

/**
 * Compare a transcript against source text and return accuracy metrics.
 * Used in the AudioBook Studio to highlight recording errors.
 */
export function measureTranscriptionAccuracy(
  sourceText: string,
  transcript: string,
): TranscriptionAccuracyResult {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

  const sourceWords = normalize(sourceText).split(' ');
  const transcriptWords = normalize(transcript).split(' ');

  let matched = 0;
  const mismatches: TranscriptionAccuracyResult['mismatches'] = [];

  for (let i = 0; i < sourceWords.length; i++) {
    const expected = sourceWords[i];
    const got = transcriptWords[i] ?? '';
    if (expected === got) {
      matched++;
    } else {
      mismatches.push({ expected, got, position: i });
    }
  }

  return {
    accuracy: sourceWords.length > 0 ? matched / sourceWords.length : 0,
    matchedWords: matched,
    totalWords: sourceWords.length,
    mismatches,
  };
}

// ── Azure Translator ───────────────────────────────────────────────────────────
/**
 * Translate book content, subtitles, or platform UI text.
 * Enables multi-language book publishing and localization.
 */
export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string,
): Promise<TranslationResult> {
  if (!TRANSLATOR_KEY) throw new Error('VITE_AZURE_TRANSLATOR_KEY not set');

  const url = TRANSLATOR_ENDPOINT +
    `&to=${targetLanguage}` +
    (sourceLanguage ? `&from=${sourceLanguage}` : '');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': TRANSLATOR_KEY,
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Region': REGION,
    },
    body: JSON.stringify([{ text }]),
  });

  if (!res.ok) throw new Error(`Azure Translator failed (${res.status})`);
  const data = await res.json();
  return {
    translatedText: data[0]?.translations?.[0]?.text ?? '',
    detectedLanguage: data[0]?.detectedLanguage?.language,
    targetLanguage,
  };
}

// ── Azure Content Safety ───────────────────────────────────────────────────────
/**
 * Screen uploaded text (book content, articles, posts) before publishing.
 * Severity 0–7: 0–2 safe, 3–4 moderate, 5–7 high.
 */
export async function checkContentSafety(text: string): Promise<ContentSafetyResult> {
  if (!CONTENT_SAFETY_KEY) {
    // Graceful degradation — return safe if key not configured
    return { safe: true, categories: {} };
  }

  const res = await fetch(CONTENT_SAFETY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': CONTENT_SAFETY_KEY,
    },
    body: JSON.stringify({ text: text.slice(0, 10000), outputType: 'FourSeverityLevels' }),
  });

  if (!res.ok) return { safe: true, categories: {} }; // fail open

  const data = await res.json();
  const categories: Record<string, { severity: number }> = {};
  let maxSeverity = 0;

  for (const cat of data.categoriesAnalysis ?? []) {
    categories[cat.category] = { severity: cat.severity };
    if (cat.severity > maxSeverity) maxSeverity = cat.severity;
  }

  return { safe: maxSeverity <= 2, categories };
}

// ── Microsoft Phi-4 (on-device pattern) ───────────────────────────────────────
/**
 * Pattern for running Microsoft Phi-4 via ONNX Runtime Web for on-device,
 * privacy-preserving inference.  Use for:
 *   - Smart text completion in the book editor (no server round-trip)
 *   - Private content recommendations without sending reading history off-device
 *   - Spell/grammar check in the authoring studio
 *
 * IMPLEMENTATION: Install @microsoft/onnxruntime-web and download the
 * phi-4-mini-4k-instruct ONNX model from HuggingFace.
 * This is a placeholder interface — implement when ONNX model is bundled.
 */
export async function runPhi4OnDevice(
  prompt: string,
  _options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  console.warn('[Phi-4] On-device inference not yet initialized. Returning empty response.');
  // TODO: Initialize ONNX Runtime Web session and run inference
  // const session = await ort.InferenceSession.create('./models/phi-4-mini.onnx');
  // const result = await runLLMSession(session, prompt, options);
  return '';
}

// ── Azure AI Search (semantic) ─────────────────────────────────────────────────
/**
 * Semantic search across Plajah content using Azure AI Search.
 * Enables "find me something like X" experiences across books, music, articles.
 */
export interface AzureSearchResult {
  id: string;
  title: string;
  type: 'BOOK' | 'ALBUM' | 'ARTICLE' | 'VIDEO';
  score: number;
  snippet?: string;
}

export async function semanticSearch(
  query: string,
  types?: AzureSearchResult['type'][],
): Promise<AzureSearchResult[]> {
  const SEARCH_KEY = import.meta.env.VITE_AZURE_SEARCH_KEY || '';
  const SEARCH_ENDPOINT = import.meta.env.VITE_AZURE_SEARCH_ENDPOINT || '';

  if (!SEARCH_KEY || !SEARCH_ENDPOINT) return [];

  const res = await fetch(
    `${SEARCH_ENDPOINT}/indexes/plajah-content/docs/search?api-version=2024-05-01-preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': SEARCH_KEY },
      body: JSON.stringify({
        search: query,
        queryType: 'semantic',
        semanticConfiguration: 'default',
        queryLanguage: 'en-US',
        top: 10,
        filter: types?.length ? `search.in(type, '${types.join(',')}')` : undefined,
      }),
    },
  );

  if (!res.ok) return [];
  const data = await res.json();
  return (data.value ?? []).map((d: any) => ({
    id: d.id,
    title: d.title,
    type: d.type,
    score: d['@search.rerankerScore'] ?? d['@search.score'],
    snippet: d['@search.captions']?.[0]?.text,
  }));
}

// ── Utility: estimate narration duration ──────────────────────────────────────
/** Rough estimate: average speaking rate ~150 words/min at 1× speed */
export function estimateNarrationDurationMs(text: string, rate = 1.0): number {
  const words = text.trim().split(/\s+/).length;
  return Math.round((words / 150 / rate) * 60 * 1000);
}

/** Split long text into chunks ≤ maxChars for TTS batching */
export function splitForTTS(text: string, maxChars = 2000): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["']?\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ── Service health check ───────────────────────────────────────────────────────
export function getMicrosoftAIConfig(): { voiceReady: boolean; transcribeReady: boolean; translatorReady: boolean; contentSafetyReady: boolean } {
  return {
    voiceReady:       SPEECH_KEY.length > 0,
    transcribeReady:  SPEECH_KEY.length > 0,
    translatorReady:  TRANSLATOR_KEY.length > 0,
    contentSafetyReady: CONTENT_SAFETY_KEY.length > 0,
  };
}
