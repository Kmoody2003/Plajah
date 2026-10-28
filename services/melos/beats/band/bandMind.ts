// Chora Session Band — the players' AI. Desktop first: in the Plajah Windows app the question goes
// to the on-device model (NativeLlmService on the PC's GPU — nothing leaves the machine). Otherwise
// cloud Gemini through /api/band/teach, only after the person agreed to the cloud. With neither,
// or when a lane fails, the player answers from what they know (teach.answer) — always instant.

import { auth } from '../../../backendService';
import { isWindowsApp, nativeLlmChat } from '../../../windowsBridgeService';
import { localStatus } from '../../../ai/localLane';
import { answer } from './teach';
import { playerById } from './roster';
import { teacherSystem, teacherTurns, type TeacherContext, type TeacherTurn } from './teacherPrompt';

export type MindLane = 'device' | 'cloud' | 'built-in';
export interface MindReply { text: string; lane: MindLane; model?: string; note?: string }

const CONSENT_KEY = 'plajah.band.cloudConsent';
export function cloudConsent(): boolean { try { return localStorage.getItem(CONSENT_KEY) === 'yes'; } catch { return false; } }
export function setCloudConsent(on: boolean): void { try { localStorage.setItem(CONSENT_KEY, on ? 'yes' : 'no'); } catch { /* storage blocked */ } }

let device: Promise<{ ok: boolean; model?: string }> | null = null;
/** Is there an on-device model to use (desktop app with a model on disk)? Cached for the session. */
export function deviceLane(): Promise<{ ok: boolean; model?: string }> {
  if (!device) device = isWindowsApp() ? localStatus().then((s) => ({ ok: s.available, model: s.model })).catch(() => ({ ok: false })) : Promise.resolve({ ok: false });
  return device;
}

/**
 * Ask a player. `history` is the conversation so far (latest question last).
 * Lanes: device → cloud (when consented) → built-in.
 */
export async function askPlayer(playerId: string, history: TeacherTurn[], ctx: TeacherContext = {}, signal?: AbortSignal): Promise<MindReply> {
  const p = playerById(playerId);
  const turns = teacherTurns(history);
  const question = [...turns].reverse().find((t) => t.role === 'user')?.content ?? '';
  const builtIn = (note?: string): MindReply => {
    const a = answer(question, playerId);
    return { text: a.text + (a.also ? `\n\n${a.also}` : ''), lane: 'built-in', note };
  };
  if (!p || !question) return builtIn();

  const dev = await deviceLane();
  if (dev.ok) {
    try {
      const r = await nativeLlmChat(
        [{ role: 'system', content: teacherSystem(p, ctx, question) }, ...turns],
        { maxTokens: 420, temperature: 0.6, signal, timeoutMs: 120_000 },
      );
      if (r.success && r.text.trim()) return { text: r.text.trim(), lane: 'device', model: r.model };
    } catch { /* fall through to the next lane */ }
  }

  if (cloudConsent()) {
    try {
      const token = await auth.currentUser?.getIdToken?.();
      if (!token) return builtIn('Sign in to use the cloud teacher.');
      const res = await fetch('/api/band/teach', {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ playerId, messages: turns, context: ctx, cloudConsent: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.reply) return { text: String(j.reply), lane: 'cloud', model: j.model };
      return builtIn(j.error || 'The cloud teacher is unavailable right now.');
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      return builtIn('The cloud teacher is unavailable right now.');
    }
  }
  return builtIn(dev.ok ? 'The on-device model didn\'t answer.' : undefined);
}
