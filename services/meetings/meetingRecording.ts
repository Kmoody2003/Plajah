/**
 * meetingRecording — record a call into its chat room: a crash-safe copy on the host's device
 * (services/localRecordingStore), optional ~10 s cloud segments while recording, everyone's
 * captions as they speak, and a recap posted back into the room. Pure rules: ./meetingRecordingCore.
 *
 * Cloud segments go to the private bucket (services/objectStore) under meetings/{free|plus}/…, whose
 * lifecycle rule deletes them after 30 or 365 days; Firebase Storage is the fallback when the server
 * has no bucket configured, and older recordings still play from there.
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
import { meetingSegmentKey, type RecordingPlan } from '../objectStore/objectKeys';
import { ObjectStoreUnavailable, putObject, signMany } from '../objectStore/client';
import { DEFAULT_CLOUD_MODEL, costUsd, estTokens } from '../ai/aiLane';
import {
  CLOUD_SEGMENT_MS, allowanceFor, cloudExpiry, modeBlockedReason, rulesRecap, parseRecap, RECAP_SYSTEM,
  recapUserPrompt, speakersOf,
  type CaptionLine, type MeetingRecording, type MeetingRecap, type MeetingRecapRef, type RecordingKind,
  type RecordingMode, type RecordingAllowance,
} from './meetingRecordingCore';

const recCol = (roomId: string) => collection(db, 'chat_rooms', roomId, 'recordings');
const capCol = (roomId: string, recId: string) => collection(db, 'chat_rooms', roomId, 'recordings', recId, 'captions');

async function iAmPaid(): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  return uid ? await hasActiveSubscription(uid).catch(() => false) : false;
}

export async function myRecordingAllowance(): Promise<RecordingAllowance> {
  return allowanceFor(await iAmPaid());
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
  const paid = await iAmPaid();
  const allowance = allowanceFor(paid);
  const plan: RecordingPlan = paid ? 'plus' : 'free';
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
  let store: 'bucket' | 'firebase' | null = null;
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
    queue = queue.then(async () => {
      try {
        if (store !== 'firebase') {
          const key = meetingSegmentKey(plan, opts.roomId, recRef.id, i);
          try {
            await putObject(key, blob, blob.type.split(';')[0] || 'video/webm');
            store = 'bucket';
            paths[i] = key;
            return;
          } catch (e) {
            if (!(e instanceof ObjectStoreUnavailable) || store === 'bucket') throw e;
            store = 'firebase';
          }
        }
        const path = `meetings/${opts.roomId}/${recRef.id}/seg_${String(i).padStart(5, '0')}.webm`;
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
      const complete = opts.mode === 'CLOUD' && !failed && seq > 0 && paths.filter(Boolean).length === seq;
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

const isBucketKey = (p: string) => /^meetings\/(free|plus)\//.test(p);
const bucketKeys = (rec: MeetingRecording) => (rec.segmentPaths || []).filter(isBucketKey);
const mimeOf = (rec: MeetingRecording) => rec.mime || (rec.kind === 'AUDIO' ? 'audio/webm' : 'video/webm');
const EXPIRED = 'This cloud copy has expired or was removed. The transcript is still here.';

/** Is there a cloud copy to play (bucket keys, or Firebase download links from older recordings)? */
export const hasCloudCopy = (rec: MeetingRecording) => rec.mode === 'CLOUD' && (bucketKeys(rec).length > 0 || !!rec.segmentUrls?.length);

/** Links for every segment, in order: freshly signed for the bucket, stored ones for Firebase. */
async function segmentLinks(rec: MeetingRecording): Promise<string[]> {
  const keys = bucketKeys(rec);
  return keys.length ? (await signMany('get', keys)).urls : rec.segmentUrls || [];
}

async function fetchSegment(url: string): Promise<ArrayBuffer | 'expired'> {
  const res = await fetch(url);
  if (res.status === 404) throw new Error(EXPIRED);
  if (res.status === 403 || res.status === 401) return 'expired';
  if (!res.ok) throw new Error('Part of this recording could not be loaded. Try again.');
  return res.arrayBuffer();
}

/** Join the cloud segments into one playable Blob (MediaRecorder WebM chunks concatenate). */
export async function fetchCloudRecording(rec: MeetingRecording): Promise<Blob | null> {
  let links = await segmentLinks(rec);
  if (!links.length) return null;
  const parts: ArrayBuffer[] = [];
  for (let i = 0; i < links.length; i++) {
    let got = await fetchSegment(links[i]);
    if (got === 'expired') { links = await segmentLinks(rec); got = await fetchSegment(links[i]); }
    if (got === 'expired') throw new Error('This recording could not be opened. Try again.');
    parts.push(got);
  }
  return new Blob(parts, { type: mimeOf(rec) });
}

const appended = (sb: SourceBuffer) => new Promise<void>((resolve, reject) => {
  sb.addEventListener('updateend', () => resolve(), { once: true });
  sb.addEventListener('error', () => reject(new Error('This recording could not be played.')), { once: true });
});

/**
 * Play while it downloads: segments feed a MediaSource one after another, so playback starts after the
 * first ~10 s instead of after the whole meeting. `media` lets long videos drop what has already played
 * when the browser's buffer fills. Browsers without MediaSource for this format get one Blob instead.
 */
export async function openCloudPlayback(
  rec: MeetingRecording,
  opts: { media?: () => HTMLMediaElement | null; onError?: (message: string) => void } = {},
): Promise<{ url: string; stop: () => void } | null> {
  const mime = mimeOf(rec);
  if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(mime)) {
    const blob = await fetchCloudRecording(rec);
    return blob ? { url: URL.createObjectURL(blob), stop: () => {} } : null;
  }
  let links = await segmentLinks(rec);
  if (!links.length) return null;
  const ms = new MediaSource();
  const url = URL.createObjectURL(ms);
  let stopped = false;
  ms.addEventListener('sourceopen', async () => {
    try {
      const sb = ms.addSourceBuffer(mime);
      sb.mode = 'sequence';
      for (let i = 0; i < links.length && !stopped; i++) {
        let got = await fetchSegment(links[i]);
        if (got === 'expired') { links = await segmentLinks(rec); got = await fetchSegment(links[i]); }
        if (got === 'expired') throw new Error('This recording could not be opened. Try again.');
        for (;;) {
          if (stopped || ms.readyState !== 'open') return;
          try {
            const done = appended(sb);
            sb.appendBuffer(got);
            await done;
            break;
          } catch (e: any) {
            if (e?.name !== 'QuotaExceededError') throw e;
            // Buffer full: let playback catch up, then drop what's already been watched.
            await new Promise((r) => setTimeout(r, 1500));
            const played = (opts.media?.()?.currentTime ?? 0) - 10;
            if (played > 0 && !sb.updating) { const done = appended(sb); sb.remove(0, played); await done; }
          }
        }
      }
      if (!stopped && ms.readyState === 'open') ms.endOfStream();
    } catch (e: any) {
      opts.onError?.(e?.message || 'This recording could not be played.');
      try { if (ms.readyState === 'open') ms.endOfStream('network'); } catch { /* already closed */ }
    }
  }, { once: true });
  return { url, stop: () => { stopped = true; } };
}

/** Host deletes the cloud copy (transcript and recap stay). */
export async function deleteCloudCopy(roomId: string, rec: MeetingRecording): Promise<void> {
  const keys = bucketKeys(rec);
  if (keys.length) {
    const { urls } = await signMany('delete', keys);
    for (let i = 0; i < urls.length; i += 8) {
      await Promise.all(urls.slice(i, i + 8).map((u) => fetch(u, { method: 'DELETE' }).catch(() => null)));
    }
  }
  for (const p of (rec.segmentPaths || []).filter((p) => !isBucketKey(p))) await deleteObject(storageRef(storage, p)).catch(() => {});
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
