// The caller desk: live callers and chat for a virtual host's show.
//
// A real station has a producer screening calls and a delay with a "dump" button. This is that,
// as a pure state machine the call layer (huddles/meeting stack) and the radio UI drive:
//
//   requested → screening → ready → on-air → done
//                   ↘ declined          ↘ dumped (delay buffer discarded)
//
// Rules the desk enforces, whatever the model or UI asks for:
//   • only shows with takesCallers put callers on air; one caller on air at a time;
//   • a caller must consent to being on air, and chooses whether their first name is said;
//   • under-18 callers never go on air with their voice — their message can be read (scrubbed);
//   • every call has a hard time limit and runs behind a broadcast delay;
//   • anything that looks like a safety concern goes to the safety path, never to air.

import type { PersonaSheet } from './types';
import { needsSafetyHandoff, scrubListenerText } from './policy';

export const BROADCAST_DELAY_SEC = 7;
export const DEFAULT_CALL_LIMIT_SEC = 90;
export const MAX_QUEUE = 12;

export type CallerState = 'requested' | 'screening' | 'ready' | 'on-air' | 'done' | 'declined' | 'dumped' | 'safety';

export interface Caller {
  id: string;
  uid: string;
  /** Shown/said only if `nameOnAir`. */
  firstName: string;
  nameOnAir: boolean;
  consentToAir: boolean;
  isMinor: boolean;
  /** What they want to talk about / request, typed when they join the queue. */
  topic: string;
  requestedSongId?: string;
  state: CallerState;
  joinedAt: number;
  onAirAt?: number;
  endedAt?: number;
  reason?: string;
}

export interface DeskEvent { at: number; callerId: string; from: CallerState; to: CallerState; reason?: string }

export class CallerDesk {
  readonly host: PersonaSheet;
  readonly limitSec: number;
  private callers = new Map<string, Caller>();
  readonly log: DeskEvent[] = [];

  constructor(host: PersonaSheet, opts: { limitSec?: number } = {}) {
    this.host = host;
    this.limitSec = opts.limitSec ?? DEFAULT_CALL_LIMIT_SEC;
  }

  get open(): boolean { return !!this.host.show?.takesCallers; }

  list(state?: CallerState): Caller[] {
    const all = [...this.callers.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    return state ? all.filter((c) => c.state === state) : all;
  }

  get onAir(): Caller | undefined { return this.list('on-air')[0]; }

  private move(c: Caller, to: CallerState, now: number, reason?: string) {
    this.log.push({ at: now, callerId: c.id, from: c.state, to, reason });
    c.state = to;
    if (reason) c.reason = reason;
  }

  /** A listener asks to call in. Returns the caller, or a reason it was refused. */
  request(input: Omit<Caller, 'state' | 'joinedAt'>, now = Date.now()): Caller | { refused: string } {
    if (!this.open) return { refused: 'This show is not taking calls — send a request in chat instead.' };
    const waiting = this.list().filter((c) => ['requested', 'screening', 'ready'].includes(c.state));
    if (waiting.length >= MAX_QUEUE) return { refused: 'The lines are full right now. Try again in a few minutes.' };
    if (waiting.some((c) => c.uid === input.uid)) return { refused: 'You are already in the queue.' };
    const c: Caller = { ...input, topic: input.topic.slice(0, 280), state: 'requested', joinedAt: now };
    this.callers.set(c.id, c);
    this.log.push({ at: now, callerId: c.id, from: 'requested', to: 'requested' });
    return c;
  }

  /** Screening: the automated producer. Decides ready / declined / safety. */
  screen(id: string, now = Date.now()): Caller | undefined {
    const c = this.callers.get(id);
    if (!c || c.state !== 'requested') return c;
    this.move(c, 'screening', now);
    if (needsSafetyHandoff(c.topic)) { this.move(c, 'safety', now, 'safety handoff'); return c; }
    if (!c.consentToAir) { this.move(c, 'declined', now, 'no consent to air'); return c; }
    if (c.isMinor) { this.move(c, 'declined', now, 'under 18: message can be read, voice stays off air'); return c; }
    this.move(c, 'ready', now);
    return c;
  }

  /** Puts the next ready caller on air (or a named one). Only one at a time. */
  takeNext(now = Date.now(), id?: string): Caller | { refused: string } {
    if (this.onAir) return { refused: 'Someone is already on air.' };
    const c = id ? this.callers.get(id) : this.list('ready')[0];
    if (!c || c.state !== 'ready') return { refused: 'No caller is ready.' };
    c.onAirAt = now;
    this.move(c, 'on-air', now);
    return c;
  }

  /** The live transcript arrives (through the delay). A safety line pulls the call before it airs. */
  hear(id: string, transcriptChunk: string, now = Date.now()): 'ok' | 'dumped' {
    const c = this.callers.get(id);
    if (!c || c.state !== 'on-air') return 'ok';
    if (needsSafetyHandoff(transcriptChunk)) { this.dump(id, now, 'safety handoff'); c.state = 'safety'; return 'dumped'; }
    return 'ok';
  }

  /** The dump button: discards the delay buffer and ends the call. */
  dump(id: string, now = Date.now(), reason = 'dumped'): void {
    const c = this.callers.get(id);
    if (!c || c.state !== 'on-air') return;
    c.endedAt = now;
    this.move(c, 'dumped', now, reason);
  }

  end(id: string, now = Date.now()): void {
    const c = this.callers.get(id);
    if (!c || c.state !== 'on-air') return;
    c.endedAt = now;
    this.move(c, 'done', now);
  }

  /** Called on a timer: ends a call that ran past the limit. Returns the caller it ended, if any. */
  tick(now = Date.now()): Caller | undefined {
    const c = this.onAir;
    if (c?.onAirAt != null && now - c.onAirAt >= this.limitSec * 1000) { this.end(c.id, now); return c; }
    return undefined;
  }

  /** The name the host may say: the first name if they opted in, otherwise "caller". */
  static spokenName(c: Caller): string {
    return c.nameOnAir && c.firstName ? c.firstName.split(/\s+/)[0] : 'caller';
  }
}

// ─── Chat ────────────────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  uid: string;
  firstName: string;
  text: string;
  at: number;
  /** The listener chose to let hosts read their message on air. */
  okToRead: boolean;
  isMinor?: boolean;
  kind?: 'request' | 'dedication' | 'shoutout' | 'chat';
}

export interface ChatMention { messageId: string; uid: string; spokenName: string; text: string; kind: ChatMessage['kind'] }

/**
 * Picks what a host reads from chat on the next link: opted-in messages only, one per listener,
 * newest first with requests and dedications ahead of plain chat. Text is scrubbed; anything that
 * looks like a safety concern is held back (and returned separately for the safety path).
 */
export function pickChatMentions(msgs: ChatMessage[], n = 2, now = Date.now(), windowMs = 10 * 60_000): { read: ChatMention[]; safety: ChatMessage[] } {
  const safety: ChatMessage[] = [];
  const rank = (k?: ChatMessage['kind']) => (k === 'dedication' ? 0 : k === 'request' ? 1 : k === 'shoutout' ? 2 : 3);
  const fresh = msgs.filter((m) => now - m.at <= windowMs).sort((a, b) => rank(a.kind) - rank(b.kind) || b.at - a.at);
  const seen = new Set<string>();
  const read: ChatMention[] = [];
  for (const m of fresh) {
    if (needsSafetyHandoff(m.text)) { safety.push(m); continue; }
    if (!m.okToRead || seen.has(m.uid)) continue;
    const text = scrubListenerText(m.text).slice(0, 200);
    if (!text.trim() || /^[—\s]+$/.test(text)) continue;
    seen.add(m.uid);
    // Minors' messages can be read, but never with their name.
    read.push({ messageId: m.id, uid: m.uid, spokenName: m.isMinor ? 'a listener' : m.firstName.split(/\s+/)[0] || 'a listener', text, kind: m.kind });
    if (read.length >= n) break;
  }
  return { read, safety };
}
