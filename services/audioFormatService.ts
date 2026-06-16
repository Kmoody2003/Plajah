/**
 * Plajah Audio Format Service
 *
 * Provides:
 *  - Exhaustive MIME type map for all audio formats
 *  - Browser capability detection (canPlayType)
 *  - WAV header inspector (detects 24-bit / 32-bit float / ADPCM / EXTENSIBLE)
 *  - AudioContext.decodeAudioData() fallback player for formats the <audio>
 *    element can't handle natively (24/32-bit WAV, AIFF, ALAC, etc.)
 *  - Diagnostic reporting to console so silent failures are never silent
 */

// ─── MIME map ────────────────────────────────────────────────────────────────

export const AUDIO_MIME_MAP: Record<string, string> = {
  // Lossy compressed
  mp3:  'audio/mpeg',
  mp2:  'audio/mpeg',
  mp1:  'audio/mpeg',
  m4a:  'audio/mp4',
  aac:  'audio/aac',
  ogg:  'audio/ogg',
  oga:  'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  webm: 'audio/webm',
  weba: 'audio/webm',
  amr:  'audio/amr',
  gsm:  'audio/gsm',
  ra:   'audio/x-realaudio',
  rm:   'audio/x-realaudio',
  wma:  'audio/x-ms-wma',

  // Lossless / PCM
  wav:  'audio/wav',
  wave: 'audio/wav',
  bwf:  'audio/wav',   // Broadcast Wave Format
  rf64: 'audio/wav',   // RF64 (>4 GB WAV)
  w64:  'audio/wav',   // Sony Wave64
  flac: 'audio/flac',
  aiff: 'audio/aiff',
  aif:  'audio/aiff',
  aifc: 'audio/aiff',
  alac: 'audio/mp4',   // Apple Lossless inside MP4
  ape:  'audio/x-ape',
  wv:   'audio/x-wavpack',
  tta:  'audio/x-tta',
  tak:  'audio/x-tak',
  shn:  'audio/x-shorten',
  caf:  'audio/x-caf', // Apple Core Audio

  // Container
  mka:  'audio/x-matroska',
  mkv:  'video/x-matroska',
  mp4:  'video/mp4',
  mov:  'video/quicktime',
  m4v:  'video/mp4',

  // Surround / broadcast
  ac3:  'audio/ac3',
  eac3: 'audio/eac3',
  dts:  'audio/vnd.dts',
  dtshd:'audio/vnd.dts.hd',
  mpc:  'audio/x-musepack',

  // Game audio
  iamf: 'audio/iamf',
  xma:  'audio/x-xma',
  at3:  'audio/x-atrac3',
  at9:  'audio/x-atrac9',
  hca:  'audio/x-hca',

  // MIDI / Tracker
  mid:  'audio/midi',
  midi: 'audio/midi',
  kar:  'audio/midi',
  mod:  'audio/x-mod',
  xm:   'audio/x-xm',
  it:   'audio/x-it',
  s3m:  'audio/x-s3m',
};

/** Derive MIME type from URL/filename. Falls back to 'audio/mpeg' if unknown. */
export function mimeFromUrl(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_MIME_MAP[ext] ?? 'audio/mpeg';
}

// ─── Browser capability ───────────────────────────────────────────────────────

export type PlaySupport = 'probably' | 'maybe' | 'no';

/** Ask the browser whether it can play a given MIME type. */
export function browserCanPlay(mime: string): PlaySupport {
  const a = document.createElement('audio');
  return (a.canPlayType(mime) || 'no') as PlaySupport;
}

/** Return true if the browser claims it can play this URL at all. */
export function canPlayUrl(url: string): boolean {
  const mime = mimeFromUrl(url);
  return browserCanPlay(mime) !== 'no';
}

// ─── WAV header inspector ─────────────────────────────────────────────────────

export interface WavInfo {
  audioFormat: number;   // 1=PCM, 3=IEEE float, 6=ALAW, 7=MULAW, 65534=EXTENSIBLE
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  isSupported: boolean;  // true = standard 16-bit PCM that all browsers handle
  formatName: string;
}

/**
 * Read the first 44–68 bytes of a WAV file and return its header metadata.
 * Pass an ArrayBuffer that contains at least the header (first 64 bytes is enough).
 */
export function parseWavHeader(buffer: ArrayBuffer): WavInfo | null {
  try {
    const view = new DataView(buffer);
    // RIFF magic
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (riff !== 'RIFF' && riff !== 'RF64') return null;

    const audioFormat = view.getUint16(20, true);
    const numChannels = view.getUint16(22, true);
    const sampleRate  = view.getUint32(24, true);
    const bitsPerSample = view.getUint16(34, true);

    const FORMAT_NAMES: Record<number, string> = {
      1: 'PCM',
      2: 'ADPCM',
      3: 'IEEE Float',
      6: 'A-LAW',
      7: 'MU-LAW',
      17: 'IMA ADPCM',
      20: 'ITU G.723 ADPCM',
      49: 'GSM 6.10',
      64: 'ITU G.721',
      80: 'MPEG',
      65534: 'Extensible',
      65535: 'Experimental',
    };

    const formatName = FORMAT_NAMES[audioFormat] ?? `Unknown (${audioFormat})`;
    // Native <audio> elements reliably support only 16-bit PCM WAV
    const isSupported = audioFormat === 1 && bitsPerSample === 16;

    return { audioFormat, numChannels, sampleRate, bitsPerSample, isSupported, formatName };
  } catch {
    return null;
  }
}

/**
 * Fetch the first 64 bytes of an audio URL and inspect the WAV header.
 * Returns null if the fetch fails or the file is not WAV.
 */
export async function fetchWavInfo(url: string): Promise<WavInfo | null> {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (!['wav', 'wave', 'bwf', 'rf64', 'w64'].includes(ext)) return null;
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-127' }, cache: 'no-store' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return parseWavHeader(buf);
  } catch {
    return null;
  }
}

// ─── AudioContext decode fallback ─────────────────────────────────────────────

export interface DecodedAudioPlayer {
  /** Start/resume at offsetSeconds into the audio */
  play(offsetSeconds?: number): Promise<void>;
  /** Pause and return current playback position in seconds */
  pause(): number;
  /** Stop and release all resources */
  stop(): void;
  /** Current playback position in seconds */
  currentTime(): number;
  /** Total duration in seconds */
  duration: number;
  /** Register callback for when playback ends naturally */
  onEnded(cb: () => void): void;
}

/**
 * Fetch the full audio file and decode it via AudioContext.decodeAudioData.
 * Returns a player object that mimics the <audio> interface for pause/seek/resume.
 *
 * Supports: 24-bit WAV, 32-bit float WAV, AIFF, FLAC, and any format
 * decodeAudioData can handle.
 *
 * @param url        URL to fetch
 * @param audioCtx   Existing AudioContext (or creates a new one)
 * @param destination AudioNode to connect output to (defaults to ctx.destination)
 */
export async function createDecodeAudioPlayer(
  url: string,
  audioCtx: AudioContext,
  destination: AudioNode = audioCtx.destination
): Promise<DecodedAudioPlayer> {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  let sourceNode: AudioBufferSourceNode | null = null;
  let startContextTime = 0;    // AudioContext.currentTime when we called start()
  let pauseOffset = 0;         // seconds into the track where we paused
  let isPlaying = false;
  let endedCb: (() => void) | null = null;

  const createSource = () => {
    const src = audioCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(destination);
    src.onended = () => {
      if (isPlaying) {
        isPlaying = false;
        endedCb?.();
      }
    };
    return src;
  };

  const getCurrentOffset = () => {
    if (!isPlaying) return pauseOffset;
    return Math.min(pauseOffset + (audioCtx.currentTime - startContextTime), audioBuffer.duration);
  };

  return {
    duration: audioBuffer.duration,

    async play(offsetSeconds?: number) {
      if (isPlaying) {
        sourceNode?.stop();
        isPlaying = false;
      }
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      pauseOffset = offsetSeconds ?? pauseOffset;
      sourceNode = createSource();
      startContextTime = audioCtx.currentTime;
      sourceNode.start(0, pauseOffset);
      isPlaying = true;
    },

    pause() {
      const offset = getCurrentOffset();
      if (isPlaying && sourceNode) {
        try { sourceNode.stop(); } catch (_) {}
        isPlaying = false;
      }
      pauseOffset = offset;
      return pauseOffset;
    },

    stop() {
      if (sourceNode) {
        try { sourceNode.stop(); } catch (_) {}
        sourceNode = null;
      }
      isPlaying = false;
      pauseOffset = 0;
    },

    currentTime() { return getCurrentOffset(); },

    onEnded(cb: () => void) { endedCb = cb; },
  };
}

// ─── Diagnostic reporter ──────────────────────────────────────────────────────

export interface AudioDiagnostic {
  url: string;
  ext: string;
  mime: string;
  browserSupport: PlaySupport;
  wavInfo?: WavInfo | null;
  issue?: string;
  recommendation?: string;
}

/**
 * Diagnose a URL and return human-readable info about why it might not play.
 * Call this when a track is silent or throws an error.
 */
export async function diagnoseAudioUrl(url: string): Promise<AudioDiagnostic> {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const mime = mimeFromUrl(url);
  const browserSupport = browserCanPlay(mime);

  const d: AudioDiagnostic = { url, ext, mime, browserSupport };

  if (browserSupport === 'no') {
    d.issue = `Browser cannot play ${mime} (${ext.toUpperCase()}) natively.`;
    d.recommendation = 'Will attempt AudioContext.decodeAudioData() fallback.';
  }

  if (['wav', 'wave', 'bwf', 'rf64'].includes(ext)) {
    d.wavInfo = await fetchWavInfo(url);
    if (d.wavInfo && !d.wavInfo.isSupported) {
      d.issue = `WAV file uses ${d.wavInfo.formatName} format at ${d.wavInfo.bitsPerSample}-bit / ${d.wavInfo.sampleRate} Hz. ` +
        `Native <audio> only reliably decodes 16-bit PCM WAV.`;
      d.recommendation = 'Routing through AudioContext.decodeAudioData() fallback.';
    }
  }

  if (!url || url === '' || url === window.location.origin || url === window.location.href) {
    d.issue = 'Track URL is empty or points to the app root — no audio file is referenced.';
    d.recommendation = 'Re-upload the track file.';
  }

  if (d.issue) {
    console.warn(`[Plajah Audio Diagnostics] ${d.issue}`, d);
  } else {
    console.info(`[Plajah Audio] "${ext.toUpperCase()}" → ${mime} (${browserSupport}) — no issues detected.`, d);
  }

  return d;
}

// ─── Exhaustive accept string for <input type="file"> ─────────────────────────

export const AUDIO_ACCEPT =
  // MIME types
  'audio/*,' +
  // Explicit extensions the browser might not include under audio/*
  '.wav,.wave,.bwf,.rf64,.w64,' +
  '.flac,' +
  '.aiff,.aif,.aifc,' +
  '.alac,' +
  '.ape,' +
  '.wv,' +
  '.tta,' +
  '.tak,' +
  '.shn,' +
  '.caf,' +
  '.mka,' +
  '.wma,' +
  '.ac3,.eac3,' +
  '.dts,.dtshd,' +
  '.mpc,' +
  '.amr,.gsm,' +
  '.iamf,' +
  '.ra,.rm,' +
  '.mid,.midi,.kar,' +
  '.mod,.xm,.it,.s3m';
