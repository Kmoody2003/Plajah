/**
 * Anthropic-compatible shim over Gemini.
 *
 * Older client code (Fabula, the lyric translator, the Education council's "claude" lane) still posts
 * Anthropic Messages-API bodies to /api/ai/anthropic and reads `content[0].text`. Rather than rewrite
 * every caller, the server now answers those requests with Gemini and replies in the same shape.
 * Text and base64 image blocks both carry over (Fabula's vision tagging needs images).
 *
 * Pure translation only; the call itself goes through services/ai/geminiLane.ts.
 */

import type { GeminiPart, GeminiTurn } from './geminiLane';

export interface AnthropicBlock {
  type: string;
  text?: string;
  source?: { type?: string; media_type?: string; data?: string };
}
export interface AnthropicMessage { role: 'user' | 'assistant'; content: string | AnthropicBlock[] }

const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif|heic|heif)$/i;
const MAX_IMAGE_B64 = 7_000_000; // ~5 MB decoded, in line with the proxy's 4 MB body limit plus headroom

/** `system` may be a string or an array of text blocks. */
export function systemText(system: unknown): string | undefined {
  if (typeof system === 'string') return system || undefined;
  if (Array.isArray(system)) {
    const t = system.map(b => (b && typeof b === 'object' && typeof (b as any).text === 'string' ? (b as any).text : '')).filter(Boolean).join('\n\n');
    return t || undefined;
  }
  return undefined;
}

function toParts(content: AnthropicMessage['content']): GeminiPart[] {
  if (typeof content === 'string') return content ? [{ text: content }] : [];
  const parts: GeminiPart[] = [];
  for (const b of Array.isArray(content) ? content : []) {
    if (b?.type === 'text' && typeof b.text === 'string' && b.text) parts.push({ text: b.text });
    else if (b?.type === 'image' && b.source?.type === 'base64' && typeof b.source.data === 'string'
      && IMAGE_TYPES.test(b.source.media_type || '') && b.source.data.length <= MAX_IMAGE_B64) {
      parts.push({ inlineData: { mimeType: b.source.media_type!.toLowerCase().replace('jpg', 'jpeg'), data: b.source.data } });
    }
    // Other block types (tool_use, documents) were never used by Plajah callers; they are dropped.
  }
  return parts;
}

/**
 * Anthropic `messages` → Gemini `contents`. Gemini requires alternating turns starting with the user,
 * so consecutive same-role messages are merged and a leading assistant turn is dropped.
 */
export function toGeminiContents(messages: unknown): GeminiTurn[] {
  const out: GeminiTurn[] = [];
  for (const m of Array.isArray(messages) ? messages as AnthropicMessage[] : []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const parts = toParts(m.content);
    if (!parts.length) continue;
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else out.push({ role, parts });
  }
  while (out.length && out[0].role === 'model') out.shift();
  return out;
}

/** A Gemini answer in the Anthropic response shape the old callers read. */
export function toAnthropicResponse(text: string, model: string, usage: { inTokens: number; outTokens: number }) {
  return {
    id: `msg_gemini_${Date.now().toString(36)}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: usage.inTokens, output_tokens: usage.outTokens },
  };
}
