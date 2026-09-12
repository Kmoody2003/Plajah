/**
 * ariaLocalPrompt.ts — builds the chat messages for Aria's on-device (Qwen) lane.
 *
 * The local model must behave like the cloud Aria: same persona, same awareness
 * of the live surface, and the same <ARIA_ACTION> protocol so the server can
 * parse and execute whatever it decides to do. This mirrors (compactly) the
 * server's ARIA_SYSTEM_PROMPT and LIVE CONTEXT block so a locally-generated
 * reply flows through the exact same persistence + action pipeline.
 */
import type { AriaContextSnapshot } from './ariaContext';
import type { LocalChatMessage } from './ariaLocalModel';
import { ARIA_CREATIVE_GUIDANCE } from './ariaCreativeRoles';

// Compact multi-domain persona + action protocol (kept short — small models
// follow short instructions better than long ones).
export const ARIA_LOCAL_SYSTEM_PROMPT = `You are Aria, the single AI collaborator across Plajah (writing, music, learning, and more). Be concise, direct, genuinely helpful, never sycophantic.

${ARIA_CREATIVE_GUIDANCE}

You may receive a [LIVE CONTEXT] block describing what the user is doing right now — the surface, their working text/selection, and the ACTIONS you may take. Ground your reply in it; never repeat it back verbatim.

When the context lists actions and the user's intent calls for one, DO it by emitting one block per action:
<ARIA_ACTION>{"id":"<action id from the context>","params":{...}}</ARIA_ACTION>
Only use action ids that appear in the context. Write one short human sentence before any action block. Put the real prose/values inside params. If no suitable action exists, help in words.

If the user just asks a general question, answer it directly.`;

function buildLocalContextBlock(s: AriaContextSnapshot | null): string {
  if (!s || !s.surface) return '';
  const parts: string[] = [];
  parts.push(`SURFACE: ${s.surface}${s.domain ? ` (domain: ${s.domain})` : ''}`);
  if (s.creativeRole) parts.push(`EXPERT LENS: ${s.creativeRole.label} — ${s.creativeRole.promise}`);
  if (s.title) parts.push(`DOING: ${s.title}`);
  if (s.summary) parts.push(`STATE: ${s.summary}`);
  if (s.selection) parts.push(`SELECTION:\n"""\n${String(s.selection).slice(0, 1500)}\n"""`);
  if (s.documentText) parts.push(`WORKING TEXT (may be truncated):\n"""\n${String(s.documentText).slice(0, 6000)}\n"""`);
  if (s.data) {
    try {
      const dj = JSON.stringify(s.data);
      if (dj && dj !== '{}') parts.push(`STATE DATA: ${dj.slice(0, 2000)}`);
    } catch { /* ignore un-serialisable data */ }
  }
  if (Array.isArray(s.actions) && s.actions.length) {
    const lines = s.actions.slice(0, 16).map((a) => {
      const ps = a.params && typeof a.params === 'object'
        ? ` [params: ${Object.entries(a.params).map(([k, v]) => `${k}=${v}`).join('; ')}]`
        : '';
      return `- ${a.id}: ${a.label || ''} — ${a.description || ''}${ps}`;
    }).join('\n');
    parts.push(`ACTIONS (invoke with <ARIA_ACTION>{"id":"…","params":{…}}</ARIA_ACTION>):\n${lines}`);
  }
  return `[LIVE CONTEXT]\n${parts.join('\n')}\n\n`;
}

export interface LocalHistoryTurn { role: 'user' | 'muse' | 'system'; content: string }

/** Assemble the full message list for the on-device model. */
export function buildLocalChatMessages(opts: {
  snapshot: AriaContextSnapshot | null;
  history: LocalHistoryTurn[];
  userMessage: string;
  maxHistory?: number;
}): LocalChatMessage[] {
  const { snapshot, history, userMessage, maxHistory = 8 } = opts;
  const msgs: LocalChatMessage[] = [{ role: 'system', content: ARIA_LOCAL_SYSTEM_PROMPT }];

  const recent = history.filter(h => h.role === 'user' || h.role === 'muse').slice(-maxHistory);
  for (const h of recent) {
    msgs.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content });
  }

  const ctx = buildLocalContextBlock(snapshot);
  msgs.push({ role: 'user', content: ctx + userMessage });
  return msgs;
}
