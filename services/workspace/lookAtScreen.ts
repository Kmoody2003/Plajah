// Lets Ask Aria see the room you're working in. Only when you switch it on, and only when you ask.
//
//   On the Plajah desktop app with the vision model on this PC: Gemma 4 looks on your GPU. Nothing
//   leaves the computer.
//   Otherwise, signed in: the picture goes to the server (POST /api/build/workspace/look), which asks
//   Gemini and keeps nothing.
//   Otherwise Aria can't look, and still knows your work from what the room reports (RoomState).
//
// The model only DESCRIBES the picture. The description becomes one SCREEN fact next to the room's
// own report; the answer is still written and checked by askAria, so what's on screen can't change
// Aria's rules (text in the picture is content, not instructions).

import { lookPrompt, type RoomState } from './askAria';
import { isWindowsApp, getNativeLlmStatus, nativeLlmLook } from '../windowsBridgeService';

export type Eyes = 'device' | 'cloud' | 'none';
/** The longest side of the picture; past this a vision model's tokens are spread too thin anyway. */
const SIDE = 1024;

let deviceVision: Promise<boolean> | null = null;
/** Whether this PC's desktop app has the vision model ready (never downloads it). */
export function hasDeviceVision(): Promise<boolean> {
  if (!isWindowsApp()) return Promise.resolve(false);
  return (deviceVision ??= getNativeLlmStatus().then(s => !!s.vision).catch(() => false));
}
export async function eyesFor(signedIn: boolean): Promise<Eyes> {
  if (await hasDeviceVision()) return 'device';
  return signedIn ? 'cloud' : 'none';
}

/** A JPEG of the room (without Aria's own panel), longest side 1024 px, as base64 without the data: prefix. */
export async function captureRoom(el: HTMLElement): Promise<string> {
  const { default: html2canvas } = await import('html2canvas');
  const r = el.getBoundingClientRect();
  const scale = Math.min(1, SIDE / Math.max(1, r.width, r.height));
  const canvas = await html2canvas(el, {
    scale, backgroundColor: '#0b0d10', logging: false, useCORS: true,
    ignoreElements: e => e.classList?.contains('aa-panel') || e.getAttribute?.('data-aria-private') === '1',
  });
  return canvas.toDataURL('image/jpeg', 0.82).replace(/^data:image\/jpeg;base64,/, '');
}

const clean = (t: string) => t.replace(/```[a-z]*|```/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200);

/** Looks at the room and returns what the model saw, or throws with a sentence a person can read. */
export async function lookAtScreen(o: {
  el: HTMLElement; workspace: string; workspaceName: string; state: RoomState | null;
  eyes: Exclude<Eyes, 'none'>; getToken?: () => Promise<string | null>; signal?: AbortSignal;
}): Promise<{ seen: string; by: 'device' | 'cloud' }> {
  const image = await captureRoom(o.el);
  const prompt = lookPrompt(o.workspaceName, o.state);
  if (o.eyes === 'device') {
    const r = await nativeLlmLook(image, prompt, { maxTokens: 320, signal: o.signal, timeoutMs: 3 * 60_000 });
    if (!r.success || !r.text.trim()) throw new Error(r.error || 'The on-device model could not read the screen.');
    return { seen: clean(r.text), by: 'device' };
  }
  const token = await o.getToken?.().catch(() => null);
  if (!token) throw new Error('Sign in so Aria can look at your screen.');
  const res = await fetch('/api/build/workspace/look', {
    method: 'POST', signal: o.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ workspace: o.workspace, image, state: o.state }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || typeof j.seen !== 'string') throw new Error(j.error || 'Aria could not look at your screen just now.');
  return { seen: clean(j.seen), by: 'cloud' };
}
