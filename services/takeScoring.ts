// Set-to-Cut P2 — transcribe a take and score it against the scripted dialogue.
// ----------------------------------------------------------------------------
// Reuses the footage-native transcriber (analyzeClipForScript → speaker-attributed
// timed dialogue) and the greenlit draft's scripted lines. The score is a plain,
// explainable containment metric: how much of the scripted dialogue the take
// actually contains — a flubbed or incomplete reading scores lower. Advisory only;
// the director's circle always wins.

import type { ScriptElement } from '../types';
import { analyzeClipForScript } from './geminiService';
import type { ProductionScene, ProductionTake } from './filmProductionService';

const MAX_INLINE_BYTES = 18 * 1024 * 1024; // analyzeClipForScript inlines the media; keep under the cap

/** Fetch a proxy URL and return its base64 + mime (for inline transcription). */
async function fetchAsBase64(url: string): Promise<{ b64: string; mime: string; bytes: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch the proxy (${res.status}).`);
  const blob = await res.blob();
  const b64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the proxy.'));
    reader.readAsDataURL(blob);
  });
  return { b64, mime: blob.type || 'video/mp4', bytes: blob.size };
}

/** Scripted DIALOGUE lines for one scene, pulled from the greenlit draft via the scene's heading element. */
export function sceneScriptedLines(scene: ProductionScene, elements: ScriptElement[]): string[] {
  if (!scene.sourceElementId || !elements.length) return [];
  const start = elements.findIndex(el => el.id === scene.sourceElementId);
  if (start < 0) return [];
  const lines: string[] = [];
  for (let i = start + 1; i < elements.length; i += 1) {
    if (elements[i].type === 'SCENE_HEADING') break;
    if (elements[i].type === 'DIALOGUE' && elements[i].text.trim()) lines.push(elements[i].text.trim());
  }
  return lines;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const contentWords = (s: string) => new Set(normalize(s).split(' ').filter(w => w.length > 2));

/**
 * 0–100 containment: of the meaningful words in the scripted dialogue, how many the
 * take's transcript actually spoke. High = a complete, on-book reading. Returns null
 * when the scene has no scripted dialogue to score against.
 */
export function scoreTranscript(transcriptText: string, scriptedLines: string[]): number | null {
  const scripted = contentWords(scriptedLines.join(' '));
  if (!scripted.size) return null;
  const spoken = contentWords(transcriptText);
  let hits = 0;
  scripted.forEach(word => { if (spoken.has(word)) hits += 1; });
  return Math.round((hits / scripted.size) * 100);
}

export interface TakeScoreResult { transcript: NonNullable<ProductionTake['transcript']>; matchScore: number | null; }

/** Transcribe a take's proxy and score it against its scene's scripted dialogue. */
export async function transcribeAndScoreTake(
  take: ProductionTake, scene: ProductionScene, draftElements: ScriptElement[], castNames: string[],
): Promise<TakeScoreResult | null> {
  if (!take.proxyUrl) return null;
  const { b64, mime, bytes } = await fetchAsBase64(take.proxyUrl);
  if (bytes > MAX_INLINE_BYTES) throw new Error('Proxy is too large to transcribe inline — chunking is a later phase.');
  const result = await analyzeClipForScript(b64, mime, castNames, `Sc ${take.sceneNum} · Take ${take.takeNumber}`);
  if (!result) throw new Error('Transcription returned nothing (AI unavailable or sign-in required).');
  const transcript = (result.dialogue || []).map(line => ({ time: line.time, speaker: line.speaker, text: line.text }));
  const matchScore = scoreTranscript(transcript.map(line => line.text).join(' '), sceneScriptedLines(scene, draftElements));
  return { transcript, matchScore };
}

/** Scenes with no usable (non-NG, proxy-bearing) take — the coverage gaps. */
export function coverageGaps(scenes: ProductionScene[], takes: ProductionTake[]): ProductionScene[] {
  return scenes.filter(scene =>
    scene.status !== 'OMIT' &&
    !takes.some(t => t.sceneId === scene.id && t.status !== 'NG' && (t.proxyUrl || t.proxyAssetId)),
  );
}
