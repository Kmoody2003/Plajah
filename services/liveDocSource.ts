// services/liveDocSource.ts — a real Tela document as a source on any live stream.
//
// It travels through the database rather than the video connection, so it reaches every kind of viewer,
// including Mux/HLS audiences that have no data channel:
//
//   liveSources/{id}                   host, title, mode, audience, the host's place (frame, scroll, media)
//   liveSources/{id}/chunks/{rev_i}    the audience's copy of the document, gzipped (no private Notes or keys)
//   liveSources/{id}/ops/{opId}        TOGETHER: every change, replayed in order by everyone
//   liveSources/{id}/hands/{uid}       raised hands, for the presenter to bring people on
//
// Rules: firestore.ops.rules `liveSources`.

import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, opsDb } from './firebase';
import { gunzipB64, gzipB64 } from './coedit/chunks';
import { prepareLiveDoc, type LiveDocMode } from './liveDocPrepare';
import type { TelaDoc } from '../types';
import type { TelaOp } from '../components/tela/telaOps';

export type LiveDocAudience = 'public' | 'signedIn' | 'members';

export interface LiveDocPlace {
  frameId?: string;
  /** 0–1 down the frame. */
  y?: number;
  /** The host's video or audio, so a following audience stays in step. */
  media?: { deviceId: string; playing: boolean; t: number; at: number };
  /** The host's hands on a simulation or 3D model, so a following audience sees the same thing. */
  figure?: LiveDocFigureState;
}

export interface LiveDocFigureState {
  /** deviceId:controlIndex → a slider or menu's value. */
  values: Record<string, string>;
  /** Buttons pressed, oldest first, numbered so each viewer plays each one once. */
  clicks: Array<{ deviceId: string; index: number; seq: number; by?: string }>;
  /** deviceId → model-viewer camera orbit. */
  orbits: Record<string, string>;
}

export interface LiveDocState extends LiveDocPlace {
  id: string;
  hostUid: string;
  hostName: string;
  title: string;
  docId: string;
  active: boolean;
  mode: LiveDocMode;
  audience: LiveDocAudience;
  memberUids: string[];
  /** Signed-in people the presenter brought on. Only they and the presenter can interact. */
  invitedUids: string[];
  rev: number;
  chunks: number;
  updatedAt: number;
}

const COL = 'liveSources';
const CHUNK_CHARS = 700_000;
const MAX_CHUNKS = 40;

export const liveSourceId = (sessionKey: string) => sessionKey.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
const ref = (id: string) => doc(opsDb, COL, id);

export function watchLiveSource(id: string, onState: (s: LiveDocState | null) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(ref(id), s => onState(s.exists() ? (s.data() as LiveDocState) : null), e => { onState(null); onError?.(e); });
}

export async function loadLiveDoc(s: Pick<LiveDocState, 'id' | 'rev' | 'chunks'>): Promise<TelaDoc> {
  const parts = await Promise.all(Array.from({ length: s.chunks }, async (_, i) => {
    const c = await getDoc(doc(opsDb, COL, s.id, 'chunks', `${s.rev}_${i}`));
    if (!c.exists()) throw new Error('This document is still loading.');
    return String(c.data().d ?? '');
  }));
  return JSON.parse(await gunzipB64(parts.join(''))) as TelaDoc;
}

export async function startLiveDoc(params: {
  id: string; doc: TelaDoc; mode: LiveDocMode; hostName: string; audience: LiveDocAudience; memberUids?: string[];
}): Promise<{ deadMedia: number }> {
  const hostUid = auth.currentUser?.uid;
  if (!hostUid) throw new Error('Sign in to present a document.');
  const { doc: clean, deadMedia } = prepareLiveDoc(params.doc);
  const data = await gzipB64(JSON.stringify(clean));
  const parts: string[] = [];
  for (let i = 0; i < data.length; i += CHUNK_CHARS) parts.push(data.slice(i, i + CHUNK_CHARS));
  if (parts.length > MAX_CHUNKS) throw new Error('This document is too large to present live. Move embedded files to links in Tela.');
  const rev = Date.now();
  const head: LiveDocState = {
    id: params.id, hostUid, hostName: params.hostName, title: clean.title || 'Tela document', docId: clean.id, active: false,
    mode: params.mode, audience: params.audience, memberUids: (params.memberUids || []).slice(0, 2000), invitedUids: [], rev, chunks: parts.length,
    updatedAt: Date.now(), frameId: clean.frames[0]?.id || '', y: 0,
  };
  // Claim it first: the rules let only the current host write chunks.
  await setDoc(ref(params.id), head);
  for (let i = 0; i < parts.length; i++) await setDoc(doc(opsDb, COL, params.id, 'chunks', `${rev}_${i}`), { d: parts[i] });
  await updateDoc(ref(params.id), { active: true, updatedAt: Date.now() });
  return { deadMedia };
}

export async function stopLiveDoc(s: Pick<LiveDocState, 'id' | 'rev' | 'chunks'>): Promise<void> {
  await updateDoc(ref(s.id), { active: false, updatedAt: Date.now() }).catch(() => {});
  await Promise.all(Array.from({ length: s.chunks }, (_, i) => deleteDoc(doc(opsDb, COL, s.id, 'chunks', `${s.rev}_${i}`)).catch(() => {})));
}

export const setLiveDocInvited = (id: string, invitedUids: string[]) => updateDoc(ref(id), { invitedUids: invitedUids.slice(0, 200), updatedAt: Date.now() });

/** Someone brought on drives the simulations for everyone following; the presenter keeps everything else. */
export const setLiveDocFigure = (id: string, figure: LiveDocFigureState) => updateDoc(ref(id), { figure: JSON.parse(JSON.stringify(figure)), updatedAt: Date.now() });

export interface LiveDocHand { uid: string; name: string; rev: number; at: number }

export async function raiseLiveHand(id: string, rev: number): Promise<void> {
  const u = auth.currentUser;
  if (!u || u.isAnonymous) throw new Error('Sign in to raise your hand.');
  await setDoc(doc(opsDb, COL, id, 'hands', u.uid), { uid: u.uid, name: u.displayName || 'Guest', rev, at: Date.now() });
}

export const lowerLiveHand = (id: string, uid: string) => deleteDoc(doc(opsDb, COL, id, 'hands', uid));

export function watchLiveHands(id: string, rev: number, onHands: (h: LiveDocHand[]) => void): () => void {
  return onSnapshot(
    query(collection(opsDb, COL, id, 'hands'), where('rev', '==', rev)),
    s => onHands(s.docs.map(d => d.data() as LiveDocHand).sort((a, b) => a.at - b.at)),
    e => console.warn('[liveDoc] hands unavailable', e),
  );
}

export function watchMyLiveHand(id: string, uid: string, onHand: (h: LiveDocHand | null) => void): () => void {
  return onSnapshot(doc(opsDb, COL, id, 'hands', uid), s => onHand(s.exists() ? (s.data() as LiveDocHand) : null), () => onHand(null));
}

export const setLiveDocMode = (id: string, mode: LiveDocMode) => updateDoc(ref(id), { mode, updatedAt: Date.now() });

export function setLiveDocPlace(id: string, place: LiveDocPlace): Promise<void> {
  return updateDoc(ref(id), JSON.parse(JSON.stringify({ ...place, updatedAt: Date.now() })));
}

// ── TOGETHER ────────────────────────────────────────────────────────────────

export interface LiveDocOpRecord { id: string; rev: number; uid: string; at: number; json: string }

export function watchLiveOps(id: string, rev: number, onOps: (ops: LiveDocOpRecord[]) => void): () => void {
  return onSnapshot(
    query(collection(opsDb, COL, id, 'ops'), where('rev', '==', rev), orderBy('at', 'asc')),
    s => onOps(s.docs.map(d => d.data() as LiveDocOpRecord)),
    e => console.warn('[liveDoc] shared changes unavailable', e),
  );
}

export async function sendLiveOp(id: string, rev: number, opId: string, op: TelaOp): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to work on the shared copy.');
  const json = JSON.stringify(op);
  if (json.length > 60_000) throw new Error('That change is too large to share.');
  await setDoc(doc(opsDb, COL, id, 'ops', opId), { id: opId, rev, uid, at: Date.now(), json });
}
