// services/tela/telaMediaSession.ts — lets this browser load a document's private media.
//
// Document images are served from /api/tela-media after a membership check, and an <img> can't send a Bearer token.
// So a signed-in browser holds a short HttpOnly cookie saying who it is. It says nothing about access: that is checked
// on every request. It follows sign-in and account switches on its own, and nobody sees any of this.

import { auth } from '../firebase';
import { mediaPidsIn } from '../telaDocPolicy';

const REFRESH_MS = 6 * 60 * 60 * 1000;
let current = '';
let pending: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function open(): Promise<void> {
  const u = auth.currentUser;
  if (!u || u.isAnonymous) return;
  const res = await fetch('/api/tela-media/session', { method: 'POST', credentials: 'same-origin', headers: { Authorization: `Bearer ${await u.getIdToken()}` } });
  if (res.ok) current = u.uid;
}

/** Resolves once the cookie matches the signed-in account. Failing quietly only means private images won't load. */
export function ensureTelaMediaSession(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || current === uid) return Promise.resolve();
  pending ??= open().catch(() => {}).finally(() => { pending = null; });
  return pending;
}

let started = false;
/** Called once at app start. */
export function startTelaMediaSession() {
  if (started) return;
  started = true;
  auth.onAuthStateChanged((u) => {
    if (timer) clearTimeout(timer);
    if (!u || u.isAnonymous) {
      if (current) { current = ''; void fetch('/api/tela-media/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {}); }
      return;
    }
    current = '';
    void ensureTelaMediaSession();
    const tick = () => { current = ''; void ensureTelaMediaSession(); timer = setTimeout(tick, REFRESH_MS); };
    timer = setTimeout(tick, REFRESH_MS);
  });
}

async function release(json: string, target: { public: true } | { roomId: string }) {
  const u = auth.currentUser;
  if (!u) return;
  const pids = mediaPidsIn(json);
  if (!pids.length) return;
  const token = await u.getIdToken();
  await Promise.all(pids.map((pid) => fetch('/api/tela-media/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pid, ...target }),
  }).catch(() => {})));
}

/** A publication is public, so the media in it is too. A document that was never shared needs none of this. */
export const releaseDocMediaToPublic = (doc: unknown) => release(JSON.stringify(doc), { public: true });
/** Everyone in a chat can see the images in a document sent there. */
export const releaseDocMediaToRoom = (doc: unknown, roomId: string) => release(JSON.stringify(doc), { roomId });

/** The document with its private media written inline, for a file that leaves the app (an exported HTML page). */
export async function inlineTelaMedia<T>(doc: T): Promise<T> {
  let json = JSON.stringify(doc);
  const urls = [...new Set(json.match(/\/api\/tela-media\/[^"\\\s]+/g) || [])];
  if (!urls.length) return doc;
  await ensureTelaMediaSession();
  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) continue;
      const blob = await res.blob();
      const data = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob); });
      json = json.split(url).join(data);
    } catch { /* the page keeps the link for that one */ }
  }
  return JSON.parse(json) as T;
}
