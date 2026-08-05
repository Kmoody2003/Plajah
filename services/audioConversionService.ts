/**
 * audioConversionService.ts
 *
 * Browser-side audio conversion pipeline.
 * Problem tracks (24-bit WAV, 32-bit float, AIFF, etc.) are decoded via the
 * Web Audio API and re-encoded as 16-bit PCM WAV — a format every browser
 * can play natively without a decode fallback.  The original file is kept;
 * only the playback URL is swapped.
 */

import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { storage, db, auth } from './firebase';
import { fetchWavInfo } from './audioFormatService';
import type { Track, Album } from '../types';

// ─── WAV encoder (pure JS, no dependencies) ───────────────────────────────────

function encodeAudioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bitsPerSample = 16;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  // RIFF chunk
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');

  // fmt sub-chunk
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);          // sub-chunk size
  view.setUint16(20, 1, true);           // PCM = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channels and convert Float32 → Int16
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ─── Compatibility checker ────────────────────────────────────────────────────

export interface TrackCompatReport {
  track: Track;
  albumId: string;
  needsConversion: boolean;
  reason: string;
  formatName: string;
  bitsPerSample: number | null;
}

const WAV_LIKE_EXTS = new Set(['wav', 'wave', 'bwf', 'rf64', 'w64']);

export async function checkTrackCompatibility(track: Track, albumId: string): Promise<TrackCompatReport> {
  const url = track.browserCompatUrl || track.url;
  if (!url || url.startsWith('blob:')) {
    return { track, albumId, needsConversion: false, reason: 'Local file — no check needed', formatName: '—', bitsPerSample: null };
  }

  // Already converted
  if (track.browserCompatUrl && track.browserCompatStatus === 'done') {
    return { track, albumId, needsConversion: false, reason: 'Already optimized', formatName: 'WAV 16-bit PCM', bitsPerSample: 16 };
  }

  const ext = url.toLowerCase().split('?')[0].split('.').pop() ?? '';

  if (WAV_LIKE_EXTS.has(ext)) {
    try {
      const wavInfo = await fetchWavInfo(url);
      if (!wavInfo.isSupported) {
        return {
          track, albumId, needsConversion: true,
          reason: `${wavInfo.formatName} — browser cannot decode natively`,
          formatName: wavInfo.formatName,
          bitsPerSample: wavInfo.bitsPerSample,
        };
      }
      return { track, albumId, needsConversion: false, reason: 'WAV 16-bit PCM — fully compatible', formatName: wavInfo.formatName, bitsPerSample: wavInfo.bitsPerSample };
    } catch {
      return { track, albumId, needsConversion: false, reason: 'Header check failed — assuming compatible', formatName: ext.toUpperCase(), bitsPerSample: null };
    }
  }

  // AIFF, ALAC, APE, WavPack etc. — these often fail native play
  const PROBLEMATIC_EXTS = new Set(['aiff', 'aif', 'aifc', 'alac', 'ape', 'wv', 'tta', 'tak', 'shn', 'caf', 'mpc']);
  if (PROBLEMATIC_EXTS.has(ext)) {
    return {
      track, albumId, needsConversion: true,
      reason: `${ext.toUpperCase()} — limited browser support`,
      formatName: ext.toUpperCase(),
      bitsPerSample: null,
    };
  }

  return { track, albumId, needsConversion: false, reason: 'Format supported natively', formatName: ext.toUpperCase(), bitsPerSample: null };
}

export async function scanAlbumCompatibility(album: Album): Promise<TrackCompatReport[]> {
  const results = await Promise.all(
    (album.tracks ?? []).map(t => checkTrackCompatibility(t, album.id))
  );
  return results;
}

// ─── Conversion pipeline ──────────────────────────────────────────────────────

export interface ConversionProgress {
  stage: 'fetching' | 'decoding' | 'encoding' | 'uploading' | 'saving' | 'done' | 'error';
  pct: number;
  message: string;
}

export async function convertTrackForBrowser(
  track: Track,
  album: Album,
  onProgress: (p: ConversionProgress) => void
): Promise<string> {
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not signed in');

  const originalUrl = track.originalUrl || track.url;

  // 1 — Fetch the raw audio bytes
  onProgress({ stage: 'fetching', pct: 5, message: 'Fetching original audio…' });
  const res = await fetch(originalUrl);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();

  // 2 — Decode via Web Audio API
  onProgress({ stage: 'decoding', pct: 30, message: 'Decoding audio…' });
  const ctx = new AudioContext();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    ctx.close();
  }

  // 3 — Encode as 16-bit PCM WAV
  onProgress({ stage: 'encoding', pct: 55, message: 'Encoding to 16-bit PCM WAV…' });
  const wavBlob = encodeAudioBufferToWav(audioBuffer);

  // 4 — Upload to Firebase Storage
  onProgress({ stage: 'uploading', pct: 65, message: 'Uploading browser-optimized file…' });
  const baseName = originalUrl.split('/').pop()?.split('?')[0].replace(/\.[^/.]+$/, '') ?? track.id;
  const storagePath = `converted/${userId}/${album.id}/${baseName}_compat.wav`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, wavBlob, { contentType: 'audio/wav' });

  const downloadUrl: string = await new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      snapshot => {
        const uploadPct = (snapshot.bytesTransferred / snapshot.totalBytes) * 30;
        onProgress({ stage: 'uploading', pct: 65 + uploadPct, message: 'Uploading…' });
      },
      reject,
      async () => {
        try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); }
        catch (e) { reject(e); }
      }
    );
  });

  // 5 — Update Firestore: swap url ↔ originalUrl, set browserCompatUrl
  onProgress({ stage: 'saving', pct: 97, message: 'Saving to your library…' });
  const albumRef = doc(db, 'albums', album.id);
  const albumSnap = await getDoc(albumRef);
  if (!albumSnap.exists()) throw new Error('Album not found');
  const albumData = albumSnap.data() as Album;

  const updatedTracks = albumData.tracks.map(t => {
    if (t.id !== track.id) return t;
    return {
      ...t,
      url: downloadUrl,                           // now points to compat WAV
      originalUrl: originalUrl,                   // preserve source
      browserCompatUrl: downloadUrl,
      browserCompatStatus: 'done' as const,
    };
  });

  await updateDoc(albumRef, { tracks: updatedTracks });

  onProgress({ stage: 'done', pct: 100, message: 'Track optimized successfully' });
  return downloadUrl;
}
