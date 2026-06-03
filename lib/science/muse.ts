/**
 * Muse science AI — routes through the existing Plajah server endpoint.
 * Falls back to a pattern-based stub when the server is unavailable.
 */
import type { MuseTranslation, CrossConnectionSuggestion, SciencePost, ScienceDiscipline } from './types';
import { auth } from '../../services/backendService';

const SERVER = '/api/muse/science';

async function getIdToken(): Promise<string | null> {
  try { return await auth.currentUser?.getIdToken() ?? null; } catch { return null; }
}

async function callServer<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const token = await getIdToken();
  try {
    const res = await fetch(`${SERVER}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Plain-language translation ─────────────────────────────────────────────────

export async function translateForPublic(
  postId: string,
  content: string,
  disciplines: ScienceDiscipline[],
): Promise<MuseTranslation | null> {
  const result = await callServer<MuseTranslation>('/translate', { postId, content, disciplines });
  if (result) return result;

  // Local stub: extract first 2 sentences as a rough plain-language version
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10).slice(0, 2);
  return {
    postId,
    original: content,
    plainLanguage: sentences.join('. ').trim() + '.',
    detectedDisciplines: disciplines,
    keyTerms: [],
    significance: 'New scientific observation shared on Plajah Labs.',
    generatedAt: Date.now(),
    model: 'stub',
  };
}

// ── Discipline classification ──────────────────────────────────────────────────

export async function classifyDisciplines(content: string): Promise<ScienceDiscipline[]> {
  const result = await callServer<{ disciplines: ScienceDiscipline[] }>('/classify', { content });
  return result?.disciplines ?? [];
}

// ── Cross-connection suggestions ───────────────────────────────────────────────

export async function findCrossConnections(
  post: SciencePost,
  candidatePosts: SciencePost[],
): Promise<CrossConnectionSuggestion[]> {
  const result = await callServer<{ suggestions: CrossConnectionSuggestion[] }>('/connect', {
    postId: post.id,
    content: post.content,
    disciplines: post.science.discipline,
    candidateIds: candidatePosts.slice(0, 20).map(p => p.id),
  });
  return result?.suggestions ?? [];
}

// ── Key-term extraction ───────────────────────────────────────────────────────

export async function extractKeyTerms(content: string): Promise<string[]> {
  const result = await callServer<{ terms: string[] }>('/terms', { content });
  if (result?.terms) return result.terms;
  // Local fallback: grab capitalized multi-word sequences
  const matches = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) ?? [];
  return [...new Set(matches)].slice(0, 8);
}

// ── Nowcast event thread opener ────────────────────────────────────────────────
// Called when an API snapshot shows a significant event (earthquake, storm, etc.)

export async function generateNowcastSummary(
  eventType: string,
  data: Record<string, unknown>,
): Promise<string | null> {
  const result = await callServer<{ summary: string }>('/nowcast', { eventType, data });
  return result?.summary ?? null;
}
