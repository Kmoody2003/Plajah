/**
 * meetingRecording — record a call into its chat room: a crash-safe copy on the host's device
 * (services/localRecordingStore), optional ~10 s cloud segments while recording, everyone's
 * captions as they speak, and a recap posted back into the room. Pure rules: ./meetingRecordingCore.
 */
import {
  collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy, limit, addDoc, getDocs, getDoc,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { sendMessage } from '../backendService';
import { encryptText } from '../cryptoService';
import { startLocalRecording, pickRecordingFile, type LiveRecordingSink } from '../localRecordingStore';
import { hasActiveSubscription } from '../subscriptionService';
import { DEFAULT_CLOUD_MODEL, costUsd, estTokens } from '../ai/aiLane';
import {
  CLOUD_SEGMENT_MS, allowanceFor, cloudExpiry, modeBlockedReason, rulesRecap, parseRecap, RECAP_SYSTEM,
  recapUserPrompt, speakersOf,
  type CaptionLine, type MeetingRecording, type MeetingRecap, type MeetingRecapRef, type RecordingKind,
  type RecordingMode, type RecordingAllowance,
} from './meetingRecordingCore';

const recCol = (roomId: string) => collection(db, 'chat_rooms', roomId, 'recordings');
const capCol = (roomId: string, recId: string) => collection(db, 'chat_rooms', roomId, 'recordings', recId, 'captions');

export async function myRecordingAllowance(): Promise<RecordingAllowance> {
  const uid = auth.currentUser?.uid;
  const paid = uid ? await hasActiveSubscription(uid).catch(() => false) : false;
  return allowanceFor(paid);
}

export function listenRecordings(roomId: string, cb: (recs: MeetingRecording[]) => void): () => void {
  return onSnapshot(query(recCol(roomId), orderBy('startedAt', 'desc'), limit(30)),
    snap => cb(snap.docs.map(d => ({ ...(d.data() as MeetingRecording), id: d.id }))),
    () => cb([]));
}

export async function getRecording(roomId: string, recId: string): Promise<MeetingRecording | null> {
  const snap = await getDoc(doc(recCol(roomId), recId));
  return snap.exists() ? { ...(snap.data() as MeetingRecording), id: snap.id } : null;
}

export interface ActiveRecording {
  id: string;
  mode: RecordingMode;
  kind: RecordingKind;
  startedAt: number;
  /** Feed every MediaRecorder chunk here (SessionRecorder onData). */
  write: (chunk: Blob) => void;
  /** Finish: flush uploads, close the device copy, mark the recording ended. */
  finish: () => Promise<MeetingRecording>;
  readonly bytes: number;
  readonly cloudFailed: boolean;
}

/**
 * Begin a recording. Call from the Record click: `alsoToFile` opens the OS save dialog, which
 * needs that user gesture. Throws with a readable message when the plan doesn't allow the mode.
 */
export async function beginMeetingRecording(opts: {
  roomId: string; title: string; mode: RecordingMode; kind: RecordingKind; alsoToFile?: boolean;
}): Promise<ActiveRecording> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to record.');
  const fileWritable = opts.alsoToFile ? await pickRecordingFile(`${opts.title.replace(/[^\w.\- ]+/g, '_')}.webm`) : null;
  const allowance = await myRecordingAllowance();
  const blocked = modeBlockedReason(opts.mode, opts.kind, allowance);
  if (blocked) throw new Error(blocked);

  const recRef = doc(recCol(opts.roomId));
  const startedAt = Date.now();
  const base: Omit<MeetingRecording, 'id'> = {
    hostUid: u.uid, hostName: u.displayName || 'Host', title: opts.title.slice(0, 200),
    mode: opts.mode, kind: opts.kind, status: 'RECORDING', startedAt,
    expiresAt: opts.mode === 'CLOUD' ? cloudExpiry(startedAt, allowance) : null,
  };
  await setDoc(recRef, base);

  // Device copy always: it is the safety net for cloud mode too.
  const sink: LiveRecordingSink = await startLocalRecording({
    title: opts.title, mime: opts.kind === 'AUDIO' ? 'audio/webm' : 'video/webm',
    streamId: `meeting:${opts.roomId}:${recRef.id}`, fileWritable,
  });

  // Cloud: ~10 s segments uploaded in order while recording.
  let buffer: Blob[] = [];
  let mime = '';
  let seq = 0;
  let lastFlush = Date.now();
  let failed = false;
  const urls: string[] = [];
  const paths: string[] = [];
  let queue: Promise<void> = Promise.resolve();
  const maxMs = allowance.maxCloudMinutes * 60_000;
  const flush = () => {
    if (!buffer.length) return;
    const i = seq++;
    const blob = new Blob(buffer, { type: mime || (opts.kind === 'AUDIO' ? 'audio/webm' : 'video/webm') });
    buffer = [];
    lastFlush = Date.now();
    const path = `meetings/${opts.roomId}/${recRef.id}/seg_${String(i).padStart(5, '0')}.webm`;
    queue = queue.then(async () => {
      try {
        const r = storageRef(storage, path);
        await uploadBytes(r, blob, { contentType: blob.type, customMetadata: { ownerUid: u.uid } });
        urls[i] = await getDownloadURL(r);
        paths[i] = path;
      } catch { failed = true; }
    });
  };

  return {
    id: recRef.id, mode: opts.mode, kind: opts.kind, startedAt,
    write(chunk: Blob) {
      if (!chunk?.size) return;
      if (!mime && chunk.type) mime = chunk.type;
      void sink.write(chunk);
      if (opts.mode !== 'CLOUD' || Date.now() - startedAt > maxMs) return;
      buffer.push(chunk);
      if (Date.now() - lastFlush >= CLOUD_SEGMENT_MS) flush();
    },
    async finish() {
      if (opts.mode === 'CLOUD') { flush(); await queue; }
      const complete = opts.mode === 'CLOUD' && !failed && urls.length === seq && seq > 0;
      await sink.close(complete);
      const endedAt = Date.now();
      const patch: Partial<MeetingRecording> = {
        status: 'ENDED', endedAt, durationSec: Math.round((endedAt - startedAt) / 1000), sizeBytes: sink.bytes,
        mime: mime || sink.meta.mime || undefined,
        ...(opts.mode === 'CLOUD' ? { segmentUrls: urls.filter(Boolean), segmentPaths: paths.filter(Boolean) } : {}),
      };
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      await updateDoc(recRef, clean).catch(() => { /* rules not deployed: the device copy is still safe */ });
      return { ...base, ...clean, id: recRef.id } as MeetingRecording;
    },
    get bytes() { return sink.bytes; },
    get cloudFailed() { return failed; },
  };
}

/** The local copy's id in localRecordingStore, for download/recovery. */
export const localCopyStreamId = (roomId: string, recId: string) => `meeting:${roomId}:${recId}`;

/** Join the cloud segments into one playable Blob (MediaRecorder WebM chunks concatenate). */
export async function fetchCloudRecording(rec: MeetingRecording): Promise<Blob | null> {
  if (!rec.segmentUrls?.length) return null;
  const parts: Blob[] = [];
  for (const url of rec.segmentUrls) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Part of this recording could not be loaded. Try again.');
    parts.push(await res.blob());
  }
  return new Blob(parts, { type: rec.mime || (rec.kind === 'AUDIO' ? 'audio/webm' : 'video/webm') });
}

/** Host deletes the cloud copy (transcript and recap stay). */
export async function deleteCloudCopy(roomId: string, rec: MeetingRecording): Promise<void> {
  for (const p of rec.segmentPaths || []) await deleteObject(storageRef(storage, p)).catch(() => {});
  await updateDoc(doc(recCol(roomId), rec.id), { segmentUrls: [], segmentPaths: [], expiresAt: null });
}

// ── Captions ─────────────────────────────────────────────────────────────────

/** Save one finished sentence you said. */
export async function saveCaption(roomId: string, recId: string, line: Omit<CaptionLine, 'uid' | 'id'>): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !line.text.trim()) return;
  await addDoc(capCol(roomId, recId), { uid, name: line.name.slice(0, 100), text: line.text.trim().slice(0, 1500), at: Math.max(0, Math.round(line.at)) })
    .catch(() => { /* a dropped caption never stops the meeting */ });
}

export async function loadCaptions(roomId: string, recId: string): Promise<CaptionLine[]> {
  const snap = await getDocs(query(capCol(roomId, recId), orderBy('at'), limit(5000)));
  return snap.docs.map(d => ({ ...(d.data() as CaptionLine), id: d.id }));
}

// ── Recap ────────────────────────────────────────────────────────────────────

export type RecapLane = 'local' | 'cloud' | 'rules';

/** Which lanes this device can offer. The desktop app's GPU model is preferred (nothing leaves the PC). */
export async function availableRecapLanes(): Promise<{ local: boolean; cloud: boolean; localModel?: string }> {
  const { localStatus } = await import('../ai/localLane');
  const s = await localStatus().catch(() => null);
  return { local: !!s?.qualifies, cloud: true, localModel: s?.model };
}

/** Write a recap. 'rules' never fails; a model lane falls back to rules if its answer is unusable. */
export async function writeRecap(title: string, lines: CaptionLine[], lane: RecapLane): Promise<MeetingRecap> {
  if (lane === 'rules' || !lines.length) return rulesRecap(lines);
  const user = recapUserPrompt(title, lines);
  let reply = '';
  if (lane === 'local') {
    const { createLocalLane } = await import('../ai/localLane');
    reply = await createLocalLane()(RECAP_SYSTEM, user, 1200);
  } else {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/ai/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: DEFAULT_CLOUD_MODEL,
        contents: [{ role: 'user', parts: [{ text: user }] }],
        config: { systemInstruction: RECAP_SYSTEM, responseMimeType: 'application/json', maxOutputTokens: 1500, temperature: 0.2 },
      }),
    });
    if (!res.ok) throw new Error(res.status === 503 ? 'The cloud assistant is not set up yet.' : 'The cloud assistant could not write a recap. Try again.');
    reply = ((await res.json()) as { text?: string }).text || '';
  }
  return parseRecap(reply, lane) || rulesRecap(lines);
}

/** Save the recap on the recording and post a recap card into the room. */
export async function publishRecap(roomId: string, rec: MeetingRecording, recap: MeetingRecap, lines: CaptionLine[]): Promise<void> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to share the recap.');
  await updateDoc(doc(recCol(roomId), rec.id), { recap });
  const ref: MeetingRecapRef = {
    recordingId: rec.id, title: rec.title, durationSec: rec.durationSec || 0, mode: rec.mode,
    hostName: rec.hostName, speakers: speakersOf(lines).slice(0, 12), actionCount: recap.actionItems.length,
  };
  await sendMessage(roomId, {
    senderId: u.uid, senderName: u.displayName || 'Host', senderPhoto: u.photoURL || '',
    type: 'ACTION',
    text: await encryptText(`Meeting recap: ${rec.title}\n${recap.summary}`, roomId),
    meetingRecap: ref,
  } as any);
}

/** Cost line shown on the cloud button (the click is the consent): ~13k input tokens per meeting hour. */
export function cloudRecapEstimate(lines: CaptionLine[]): { tokens: number; usd: number | null; model: string } {
  const chars = lines.reduce((n, l) => n + l.text.length + l.name.length + 12, 0);
  const tokens = estTokens(chars + RECAP_SYSTEM.length);
  return { tokens, usd: costUsd(DEFAULT_CLOUD_MODEL, tokens, 900), model: DEFAULT_CLOUD_MODEL };
}
