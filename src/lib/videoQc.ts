/**
 * videoQc — verify a video file is real, playable, and not corrupt, from the
 * browser alone. Loads the media, reads its metadata, seeks into the timeline
 * and decodes a real frame to a canvas. A truncated / corrupt / mislabeled file
 * fails one of these stages, so we can BLOCK it before it ever propagates to the
 * Taleo (film/TV) or Reello (UGC) surfaces.
 */

export interface VideoProbe {
  status: 'pass' | 'warn' | 'fail';
  issue?: string;
  duration?: number;
  width?: number;
  height?: number;
  hasVideo?: boolean;
  hasAudio?: boolean;
}

const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

/** Probe a video by URL (blob: or remote) or File. Never throws — returns a report. */
export async function probeVideo(source: string | File): Promise<VideoProbe> {
  const isFile = typeof source !== 'string';
  const url = isFile ? URL.createObjectURL(source as File) : (source as string);
  const cleanup = () => { if (isFile) { try { URL.revokeObjectURL(url); } catch {} } };

  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.src = url;

  try {
    // 1) Metadata — a corrupt header or non-video file never fires loadedmetadata.
    await withTimeout(new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error(mediaErr(video)));
    }), 20000, 'Timed out reading video — the file may be corrupt or unsupported');

    const duration = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const hasVideo = width > 0 && height > 0;
    // Some browsers expose track hints; fall back to the video dimensions.
    const hasAudio = (video as any).mozHasAudio
      || Boolean((video as any).webkitAudioDecodedByteCount)
      || (video as any).audioTracks?.length > 0
      || undefined;

    if (!isFinite(duration) || duration <= 0) {
      cleanup();
      return { status: 'fail', duration, width, height, hasVideo, issue: 'No playable duration — the file is likely truncated or corrupt' };
    }
    if (!hasVideo) {
      cleanup();
      return { status: 'warn', duration, width, height, hasVideo, hasAudio, issue: 'No video track detected — this looks like an audio-only file' };
    }
    if (duration < 0.5) {
      cleanup();
      return { status: 'fail', duration, width, height, hasVideo, issue: `Too short (${duration.toFixed(2)}s) — likely a broken or empty file` };
    }

    // 2) Decode a real frame from mid-timeline — catches truncated / corrupt streams
    //    that report metadata but can't actually decode.
    const seekTo = Math.min(Math.max(duration * 0.5, 0.1), Math.max(duration - 0.1, 0.1));
    try {
      await withTimeout(new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error(mediaErr(video)));
        video.currentTime = seekTo;
      }), 20000, 'Timed out decoding a frame — the stream may be corrupt');

      const canvas = document.createElement('canvas');
      canvas.width = Math.min(width, 320);
      canvas.height = Math.min(height, 240);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // A fully black/blank frame from a mid-timeline seek is a decode-failure signal.
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let nonBlack = 0;
        for (let i = 0; i < data.length; i += 4) { if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) { nonBlack++; if (nonBlack > 20) break; } }
        if (nonBlack <= 20) {
          cleanup();
          return { status: 'warn', duration, width, height, hasVideo, hasAudio, issue: 'Frame decoded blank — verify the video actually plays' };
        }
      }
    } catch (e: any) {
      cleanup();
      return { status: 'fail', duration, width, height, hasVideo, issue: e?.message || 'Could not decode video frames — corrupt file' };
    }

    cleanup();
    return { status: 'pass', duration, width, height, hasVideo, hasAudio };
  } catch (e: any) {
    cleanup();
    // A remote URL that blocks canvas/CORS is inconclusive rather than definitively bad.
    if (!isFile && /timed out/i.test(e?.message || '')) {
      return { status: 'warn', issue: 'Could not fully verify a remote video — confirm it plays before publishing' };
    }
    return { status: 'fail', issue: e?.message || 'Could not read the video — corrupt or unsupported file' };
  }
}

function mediaErr(video: HTMLVideoElement): string {
  const code = video.error?.code;
  switch (code) {
    case 1: return 'Video load aborted';
    case 2: return 'Network error while reading the video';
    case 3: return 'Video is corrupt — decoding failed';
    case 4: return 'Video format is not supported or the file is corrupt';
    default: return 'Video could not be read — likely corrupt';
  }
}
