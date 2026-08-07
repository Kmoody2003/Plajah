// liveCloudRecorder — real-time cloud recording for a live stream. As the MediaRecorder emits
// its ~1s chunks, we buffer them into ~6s segments and upload each straight to Cloud Storage
// under liveRecordings/{streamId}/seg_NNNNN.webm — so the whole recording lands in the cloud AS
// IT HAPPENS, not as a big device upload when the stream ends. On finalize we write a manifest
// doc; the server's /api/live/finalize then concatenates the segments and hands them to Mux.
//
// Concatenated MediaRecorder chunks form a valid WebM (only the first chunk carries the header),
// so as long as segments are numbered and joined in order the result plays. Uploads are queued so
// they never overlap or reorder. All failures are non-fatal — the on-device backup + the
// end-of-stream device upload remain the safety net, so a flaky network never loses a stream.

import { ref, uploadBytes } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { storage, db, auth } from './firebase';

const SEGMENT_MS = 6000; // flush a segment roughly every 6s of recording

export interface LiveCloudSink {
  write: (chunk: Blob) => void;
  finalize: () => Promise<{ segments: number } | null>;
  readonly uploaded: number;
  readonly failed: boolean;
}

export function startCloudRecording(opts: { streamId: string; mime?: string }): LiveCloudSink {
  const { streamId } = opts;
  const mime = opts.mime || 'video/webm';
  const uid = auth.currentUser?.uid || 'anon';

  let buffer: Blob[] = [];
  let seq = 0;
  let uploaded = 0;
  let failed = false;
  let lastFlush = Date.now();
  let queue: Promise<void> = Promise.resolve(); // serialize uploads → strict segment order

  const path = (i: number) => `liveRecordings/${streamId}/seg_${String(i).padStart(5, '0')}.webm`;

  const flush = () => {
    if (!buffer.length) return;
    const segIndex = seq++;
    const blob = new Blob(buffer, { type: mime });
    buffer = [];
    lastFlush = Date.now();
    // Chain onto the queue so segments upload strictly in order, one at a time.
    queue = queue.then(async () => {
      try {
        await uploadBytes(ref(storage, path(segIndex)), blob, { contentType: mime });
        uploaded++;
      } catch {
        failed = true; // non-fatal — the device backup still has this chunk
      }
    });
  };

  return {
    write(chunk: Blob) {
      if (!chunk || !chunk.size) return;
      buffer.push(chunk);
      if (Date.now() - lastFlush >= SEGMENT_MS) flush();
    },
    async finalize() {
      flush();                 // push the tail segment
      await queue;             // wait for every segment to finish uploading
      if (seq === 0) return null;
      try {
        await setDoc(doc(db, 'liveRecordings', streamId), {
          streamId, ownerUid: uid, mime, segments: seq, createdAt: Date.now(),
        }, { merge: true });
      } catch { /* manifest write failed — server finalize will report no manifest → device fallback */ }
      return { segments: seq };
    },
    get uploaded() { return uploaded; },
    get failed() { return failed; },
  };
}
