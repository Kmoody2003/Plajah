// ─── Lorea Scores — persistence for transcribed notation ──────────────────────
// The Breakdown's "Export notation to Lorea" dispatches a LOREA_SAVE_SCORE event.
// This service catches it and stores a real score document (MusicXML + notation
// model + metadata) in the user's Lorea library, so composers/musicians can find,
// view and download the sheet music later. Firestore is the system of record;
// localStorage is a always-works fallback (offline / signed-out).

import { db, auth } from './firebase';
import { collection, doc, setDoc, getDocs, query, where, orderBy, limit as qlimit } from 'firebase/firestore';
import type { Notation } from './musicNotation';

export interface LoreaScore {
  id: string;
  ownerId: string;
  title: string;
  artist: string;
  trackId?: string;
  key: string;
  scale: string;
  tempo: number;
  timeSignature: string;
  musicXml: string | null;
  notation: Notation | null;
  imageDataUrl?: string | null;
  backend?: string | null;
  createdAt: number;
}

export interface SaveScoreDetail {
  title: string;
  artist: string;
  trackId?: string;
  theory?: { key: string; scale: string; tempo: number; timeSignature: string };
  musicXml?: string | null;
  notation?: Notation | null;
  imageBlob?: Blob | null;
  backend?: string | null;
}

const LS_KEY = 'plajah_lorea_scores_v1';

function readLocal(): LoreaScore[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function writeLocal(scores: LoreaScore[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(scores.slice(0, 100))); } catch { /* quota */ }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

export async function saveScore(detail: SaveScoreDetail): Promise<LoreaScore> {
  const ownerId = auth.currentUser?.uid || 'local';
  const id = `score_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Keep the preview small enough for a Firestore field; drop it if oversized.
  let imageDataUrl: string | null = null;
  if (detail.imageBlob && detail.imageBlob.size < 700_000) {
    try { imageDataUrl = await blobToDataUrl(detail.imageBlob); } catch { /* skip preview */ }
  }

  const score: LoreaScore = {
    id,
    ownerId,
    title: detail.title,
    artist: detail.artist,
    trackId: detail.trackId,
    key: detail.theory?.key ?? '',
    scale: detail.theory?.scale ?? '',
    tempo: detail.theory?.tempo ?? 0,
    timeSignature: detail.theory?.timeSignature ?? '4/4',
    musicXml: detail.musicXml ?? null,
    notation: detail.notation ?? null,
    imageDataUrl,
    backend: detail.backend ?? null,
    createdAt: Date.now(),
  };

  // Local cache first (instant + offline-safe).
  writeLocal([score, ...readLocal().filter(s => s.trackId !== score.trackId || !score.trackId)]);

  // Firestore (best effort — never blocks the UX).
  if (ownerId !== 'local') {
    try {
      await setDoc(doc(collection(db, 'loreaScores'), id), score);
    } catch (e) {
      console.warn('[LoreaScores] Firestore save failed, kept local copy', e);
    }
  }
  return score;
}

export async function listScores(max = 50): Promise<LoreaScore[]> {
  const ownerId = auth.currentUser?.uid || 'local';
  const local = readLocal();
  if (ownerId === 'local') return local.slice(0, max);
  try {
    const q = query(
      collection(db, 'loreaScores'),
      where('ownerId', '==', ownerId),
      orderBy('createdAt', 'desc'),
      qlimit(max),
    );
    const snap = await getDocs(q);
    const remote = snap.docs.map(d => d.data() as LoreaScore);
    // Merge remote + local (dedupe by id), newest first.
    const byId = new Map<string, LoreaScore>();
    [...remote, ...local].forEach(s => { if (!byId.has(s.id)) byId.set(s.id, s); });
    return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, max);
  } catch (e) {
    console.warn('[LoreaScores] Firestore list failed, using local', e);
    return local.slice(0, max);
  }
}

let _listening = false;
/** Attach the global LOREA_SAVE_SCORE listener (idempotent). */
export function initLoreaScoreListener(): () => void {
  if (_listening || typeof window === 'undefined') return () => {};
  _listening = true;
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<SaveScoreDetail>).detail;
    if (!detail) return;
    saveScore(detail)
      .then(() => window.dispatchEvent(new CustomEvent('LOREA_SCORE_SAVED', { detail: { title: detail.title } })))
      .catch(err => console.warn('[LoreaScores] save failed', err));
  };
  window.addEventListener('LOREA_SAVE_SCORE', handler);
  return () => { window.removeEventListener('LOREA_SAVE_SCORE', handler); _listening = false; };
}

export function downloadMusicXml(score: LoreaScore): void {
  if (!score.musicXml) return;
  const url = URL.createObjectURL(new Blob([score.musicXml], { type: 'application/vnd.recordare.musicxml+xml' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${score.title.replace(/[^a-z0-9]/gi, '_')}.musicxml`; a.click();
  URL.revokeObjectURL(url);
}
