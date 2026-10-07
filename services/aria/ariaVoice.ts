/**
 * ariaVoice.ts — client side of Aria's spoken voice.
 *
 * One reply plays at a time; pressing the same reply again stops it. Audio is
 * fetched from POST /api/aria/speak (see routes/ariaSpeak.ts) and cached per
 * message id for the session, so replaying a line costs nothing.
 *
 * Framework-agnostic store + a tiny React hook (useAriaVoice) at the bottom.
 */
import { useSyncExternalStore } from 'react';
import { auth } from '../backendService';

export interface AriaVoiceState {
  /** Message currently audible. */
  playingId: string | null;
  /** Message whose audio is being fetched. */
  loadingId: string | null;
  /** Server has a voice configured (null = not probed yet). */
  available: boolean | null;
  /** This account may use the premium voice (paid plan or admin). */
  eligible: boolean | null;
  /** Last failure, human-readable; cleared on the next attempt. */
  error: string | null;
}

const CACHE_LIMIT = 24;

class AriaVoice {
  private state: AriaVoiceState = { playingId: null, loadingId: null, available: null, eligible: null, error: null };
  private listeners = new Set<() => void>();
  private audio: HTMLAudioElement | null = null;
  private cache = new Map<string, string>(); // message id → object URL
  private probing: Promise<boolean> | null = null;
  /** Bumped by every speak()/stop() so a slow fetch can't start playback after the user moved on. */
  private ticket = 0;

  getState = (): AriaVoiceState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  private set(patch: Partial<AriaVoiceState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(l => l());
  }

  private async token(): Promise<string | null> {
    try { return (await auth.currentUser?.getIdToken()) || null; } catch { return null; }
  }

  /** Ask the server whether a voice is configured and this account may use it. Safe to call repeatedly. */
  probe(): Promise<boolean> {
    if (this.state.available !== null) return Promise.resolve(this.state.available && this.state.eligible === true);
    if (this.probing) return this.probing;
    this.probing = (async () => {
      let ok = false, eligible = false;
      try {
        const t = await this.token();
        if (t) {
          const res = await fetch('/api/aria/speak/status', { headers: { Authorization: `Bearer ${t}` } });
          if (res.ok) { const j = await res.json(); ok = !!j.available; eligible = !!j.eligible; }
        }
      } catch { /* leave unavailable */ }
      this.probing = null;
      // Only cache a definite answer; no token yet shouldn't pin us to "unavailable".
      if (ok || (await this.token())) this.set({ available: ok, eligible });
      return ok && eligible;
    })();
    return this.probing;
  }

  stop() {
    this.ticket++;
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
    if (this.state.playingId || this.state.loadingId) this.set({ playingId: null, loadingId: null });
  }

  /** Speak `text` for message `id`. Pressing the same id while it plays stops it. */
  async speak(id: string, text: string): Promise<void> {
    if (this.state.playingId === id || this.state.loadingId === id) { this.stop(); return; }
    this.stop();
    const mine = ++this.ticket;
    this.set({ loadingId: id, error: null });

    try {
      let url = this.cache.get(id);
      if (!url) {
        const t = await this.token();
        if (!t) throw new Error('Sign in to hear Aria.');
        const res = await fetch('/api/aria/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          if (res.status === 503) this.set({ available: false });
          if (res.status === 403) this.set({ eligible: false });
          const msg = (await res.json().catch(() => ({})))?.error;
          throw new Error(msg || 'Aria could not speak just now.');
        }
        url = URL.createObjectURL(await res.blob());
        this.cache.set(id, url);
        if (this.cache.size > CACHE_LIMIT) {
          const oldest = this.cache.keys().next().value as string;
          URL.revokeObjectURL(this.cache.get(oldest)!);
          this.cache.delete(oldest);
        }
      }
      if (mine !== this.ticket) return; // user stopped / started another while we fetched

      const audio = new Audio(url);
      this.audio = audio;
      audio.onended = () => { if (mine === this.ticket) { this.audio = null; this.set({ playingId: null }); } };
      audio.onerror = () => { if (mine === this.ticket) { this.audio = null; this.set({ playingId: null, error: 'Playback failed.' }); } };
      this.set({ loadingId: null, playingId: id });
      await audio.play();
    } catch (e: any) {
      if (mine !== this.ticket) return;
      this.audio = null;
      // NotAllowedError = autoplay blocked; stay quiet rather than nag.
      const blocked = e?.name === 'NotAllowedError';
      this.set({ loadingId: null, playingId: null, error: blocked ? null : (e?.message || 'Aria could not speak just now.') });
    }
  }
}

export const ariaVoice = new AriaVoice();

export function useAriaVoice(): AriaVoiceState {
  return useSyncExternalStore(ariaVoice.subscribe, ariaVoice.getState, ariaVoice.getState);
}
