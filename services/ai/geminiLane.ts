/**
 * Gemini lane — the platform's server-side cloud model for councils and assistants.
 *
 * Owner decision (2026-10-25): council and assistant work moves off Anthropic onto Gemini to cut cost;
 * privacy-facing work prefers the user's own PC (services/ai/aiLane.ts) and only comes here with consent.
 *
 * Two entry points:
 *  - createGeminiLane(): the (system, user, maxTokens?, { json? }) → text shape every council takes.
 *  - geminiGenerate(): multi-turn and image input, for the chat and the Anthropic-compatible proxy
 *    (services/ai/anthropicCompat.ts) that older client code still calls.
 * Usage (tokens and dollars) is reported to an optional collector so callers can show what a run cost.
 *
 * Key: GOOGLE_AI_API_KEY or GEMINI_API_KEY (same as the rest of the server). Use a PAID-tier key for
 * anything with user content: Google may use free-tier traffic to improve its products.
 */

import { DEFAULT_CLOUD_MODEL, costUsd } from './aiLane';

export interface GeminiUsage { model: string; inTokens: number; outTokens: number; costUsd: number | null; seconds: number }
export type LaneFn = (system: string, user: string, maxTokens?: number, opts?: { json?: boolean; temperature?: number }) => Promise<string>;

/** Gemini content parts: text, or inline image/audio bytes (base64). */
export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
export interface GeminiTurn { role: 'user' | 'model'; parts: GeminiPart[] }

export function geminiKey(): string {
  return process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GOOGLE_AI_API_KEY || '';
}

export const geminiConfigured = () => !!geminiKey();

/** The model a feature should use: its own override env var, then the platform default. */
export function laneModel(featureEnv?: string): string {
  return (featureEnv && process.env[featureEnv]) || process.env.AI_COUNCIL_MODEL || DEFAULT_CLOUD_MODEL;
}

export interface GenerateOpts {
  model?: string;
  system?: string;
  contents: string | GeminiTurn[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
  onUsage?: (u: GeminiUsage) => void;
}

/**
 * One generation. Thinking is kept minimal: these are short structured answers, and thinking tokens
 * bill as output. Throws on an empty answer rather than returning "" for callers to misread.
 */
export async function geminiGenerate(o: GenerateOpts): Promise<{ text: string; usage: GeminiUsage }> {
  const key = geminiKey();
  if (!key) throw new Error('The cloud assistant is not configured yet.');
  const model = o.model || laneModel();
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: o.timeoutMs ?? 90_000 } } as any);
  const started = Date.now();
  const thinkingConfig = /^gemini-3/.test(model) ? { thinkingLevel: 'minimal' } : { thinkingBudget: 0 };
  const request = () => genai.models.generateContent({
    model,
    contents: o.contents as any,
    config: {
      ...(o.system ? { systemInstruction: o.system } : {}),
      maxOutputTokens: o.maxTokens ?? 1000,
      temperature: o.temperature ?? 0.3,
      ...(o.json ? { responseMimeType: 'application/json' } : {}),
      thinkingConfig,
    } as any,
  });
  // Google answers 503 ("model overloaded") and 429 under load; two short backoffs recover most of them.
  let response: any;
  for (let attempt = 0; ; attempt++) {
    try { response = await request(); break; }
    catch (err: any) {
      const status = Number(err?.status || err?.code);
      if (attempt >= 2 || ![429, 500, 503].includes(status)) throw err;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1) + Math.random() * 400));
    }
  }
  const u = response?.usageMetadata || {};
  const inTokens = Number(u.promptTokenCount) || 0;
  const outTokens = (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0);
  const usage: GeminiUsage = { model, inTokens, outTokens, costUsd: costUsd(model, inTokens, outTokens), seconds: (Date.now() - started) / 1000 };
  o.onUsage?.(usage);
  const text = typeof response?.text === 'string' ? response.text : '';
  if (!text) throw new Error('The cloud assistant returned an empty answer.');
  return { text, usage };
}

/** The council lane shape. `temperature` sets this lane's default; a call may override it. */
export function createGeminiLane(opts: { model?: string; temperature?: number; timeoutMs?: number; onUsage?: (u: GeminiUsage) => void } = {}): LaneFn {
  const model = opts.model || laneModel();
  return async (system, user, maxTokens = 1000, callOpts = {}) => (await geminiGenerate({
    model, system, contents: user, maxTokens, json: callOpts.json,
    temperature: callOpts.temperature ?? opts.temperature ?? 0.3, timeoutMs: opts.timeoutMs, onUsage: opts.onUsage,
  })).text;
}

/** Sum a run's usage records for display ("this review cost about 1¢ and took 9 seconds"). */
export function summarizeUsage(records: GeminiUsage[], wallSeconds?: number) {
  const inTokens = records.reduce((a, r) => a + r.inTokens, 0);
  const outTokens = records.reduce((a, r) => a + r.outTokens, 0);
  const costs = records.map(r => r.costUsd);
  return {
    model: records[0]?.model,
    calls: records.length,
    inTokens, outTokens,
    costUsd: costs.some(c => c === null) ? null : costs.reduce((a, c) => a + (c as number), 0),
    seconds: wallSeconds ?? records.reduce((a, r) => Math.max(a, r.seconds), 0),
  };
}
