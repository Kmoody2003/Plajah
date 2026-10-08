// ─── Speaker-group sync: Chora player ⇄ Cast speaker ─────────────────────────
// While a Cast speaker / group is selected (PlajahSpeakers native plugin), the music plays THERE:
// the current Chora track's stream URL is loaded on the receiver, local playback is paused (and
// muted, so a track change's momentary local start is silent), and the two stay in step:
//
//   • track changes in the player (next / prev / pick)   → loadMedia on the speaker
//   • play/pause pressed on the remote or the UI           → toggles the speaker
//   • speaker finishes a track                             → player.next() → loads the next one
//   • back to "This TV" (or the speaker drops)             → local resumes at the speaker's position
//
// GlobalPlayerContext exposes no subscription API outside React, so the player state is fed in by
// a tiny hook, `useSpeakerSyncFeed()`, that must run somewhere under <GlobalPlayerProvider>.
// TvSpeakerPicker calls it (and startSpeakerSync) itself, so mounting the picker wires everything;
// <SpeakerSyncFeeder /> exists for mounting the feed without the picker (e.g. on phones).

import { useEffect } from 'react';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import { peekTrackStream, pickStreamUrl, getQuality } from './choraStreamService';
import {
  speakers, speakersAvailable, onSessionChanged, onMediaStatus,
  type SpeakerSession, type SpeakerMediaStatus, type SpeakerLoadOptions,
} from './speakerGroupsBridge';
import type { Track, Album } from '../types';

interface PlayerSnapshot {
  track: Track | null;
  album: Album | null;
  isPlaying: boolean;
  audioSource: 'LIBRARY' | 'RADIO' | 'VIDEO' | null;
  volume: number;
  currentTime: number;
  pause: () => void;
  resume: () => void;
  next: () => void;
  seek: (t: number) => void;
  setVolume: (v: number) => void;
}

export interface SpeakerSyncStatus {
  casting: boolean;
  deviceName: string | null;
  /** Last human-readable problem (e.g. "This track can't play on speakers"). */
  error: string | null;
}

// ── module state ──────────────────────────────────────────────────────────────
let started = false;
let snap: PlayerSnapshot | null = null;
let prevPlaying = false;
let casting = false;
let deviceName: string | null = null;
let loadedTrackId: string | null = null;
let loadedUrl: string | null = null;
let advancedFor: string | null = null;
let mutedVolume: number | null = null;
let lastMedia: SpeakerMediaStatus | null = null;
let error: string | null = null;
const statusSubs = new Set<(s: SpeakerSyncStatus) => void>();

const status = (): SpeakerSyncStatus => ({ casting, deviceName, error });
const emit = () => statusSubs.forEach(cb => { try { cb(status()); } catch { /* */ } });

export function getSpeakerSyncStatus(): SpeakerSyncStatus { return status(); }
export function onSpeakerSyncStatus(cb: (s: SpeakerSyncStatus) => void): () => void {
  statusSubs.add(cb);
  return () => { statusSubs.delete(cb); };
}

// ── helpers ───────────────────────────────────────────────────────────────────
function contentTypeFor(url: string, isHls: boolean): string {
  if (isHls) return 'application/x-mpegURL';
  const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return url.toLowerCase(); } })();
  if (path.endsWith('.m3u8')) return 'application/x-mpegURL';
  if (path.endsWith('.mpd')) return 'application/dash+xml';
  if (path.endsWith('.flac')) return 'audio/flac';
  if (path.endsWith('.wav')) return 'audio/wav';
  if (path.endsWith('.m4a') || path.endsWith('.aac') || path.endsWith('.mp4')) return 'audio/mp4';
  if (path.endsWith('.ogg') || path.endsWith('.oga')) return 'audio/ogg';
  if (path.endsWith('.opus')) return 'audio/ogg; codecs=opus';
  if (path.endsWith('.webm')) return 'audio/webm';
  return 'audio/mpeg'; // Audius /stream and most proxies serve MP3
}

const absolute = (u?: string | null): string | undefined => {
  if (!u) return undefined;
  try { return new URL(u, window.location.origin).href; } catch { return undefined; }
};

/** The URL the speaker should fetch — same choice the local player makes (transcoded first). */
export function resolveCastMedia(track: Track, album: Album | null, startSec = 0): SpeakerLoadOptions | null {
  const pick = pickStreamUrl(peekTrackStream(track.id), getQuality());
  const raw = pick?.url || track.url;
  if (!raw || /^(blob:|data:|file:|capacitor:)/i.test(raw)) return null;   // local-only media
  const url = absolute(raw);
  if (!url || !/^https?:/i.test(url) || /youtube\.com|youtu\.be/i.test(url)) return null;
  const isLive = !!(track as any).isLive;
  return {
    url,
    contentType: contentTypeFor(url, !!pick?.isHls),
    title: track.title || 'Plajah',
    artist: album?.artist || track.artist || '',
    album: album?.title || (track as any).albumTitle || 'Plajah Chora',
    artworkUrl: absolute(track.images?.[0] || (track as any).albumCover || album?.coverImage),
    startTimeMs: isLive ? 0 : Math.max(0, Math.round(startSec * 1000)),
    isLive,
    autoplay: true,
  };
}

function muteLocal() {
  if (!snap || mutedVolume !== null) return;
  mutedVolume = snap.volume > 0 ? snap.volume : 1;
  try { snap.setVolume(0); } catch { /* */ }
}
function unmuteLocal() {
  if (!snap || mutedVolume === null) return;
  try { snap.setVolume(mutedVolume); } catch { /* */ }
  mutedVolume = null;
}
function pauseLocal() {
  if (snap?.isPlaying) { try { snap.pause(); } catch { /* */ } }
}

async function loadCurrent(startSec: number) {
  const s = snap;
  if (!s?.track || s.audioSource === 'VIDEO') return;
  const media = resolveCastMedia(s.track, s.album, startSec);
  loadedTrackId = s.track.id;
  advancedFor = null;
  if (!media) {
    loadedUrl = null;
    error = `"${s.track.title}" can't play on speakers`;
    emit();
    return;
  }
  loadedUrl = media.url;
  const ok = await speakers.loadMedia(media);
  error = ok ? null : `Couldn't start "${s.track.title}" on ${deviceName || 'the speaker'}`;
  emit();
}

// ── reactions ─────────────────────────────────────────────────────────────────
function handleSession(sess: SpeakerSession) {
  const nowCasting = sess.connected && (sess.state === 'started' || sess.state === 'current' || sess.state === 'resuming');
  if (nowCasting && !casting) {
    casting = true;
    deviceName = sess.deviceName || null;
    error = null;
    emit();
    if (snap?.track && snap.audioSource !== 'VIDEO') {
      const at = snap.currentTime || 0;
      muteLocal();
      pauseLocal();
      // Resumed sessions may already be playing our track — don't restart it.
      if (sess.state !== 'current' || !lastMedia || lastMedia.playerState === 'idle') loadCurrent(at);
      else loadedTrackId = snap.track.id;
    }
    return;
  }
  if (casting && (sess.state === 'ended' || sess.state === 'failed' || (!sess.connected && sess.state !== 'starting' && sess.state !== 'resuming' && sess.state !== 'suspended'))) {
    const wasPlaying = lastMedia?.playerState === 'playing' || lastMedia?.playerState === 'buffering';
    const posSec = (lastMedia?.positionMs || 0) / 1000;
    const sameTrack = !!snap?.track && snap.track.id === loadedTrackId;
    casting = false;
    deviceName = null;
    loadedTrackId = null;
    loadedUrl = null;
    lastMedia = null;
    emit();
    unmuteLocal();
    if (snap && sameTrack) {
      if (posSec > 0.5) { try { snap.seek(posSec); } catch { /* */ } }
      if (wasPlaying) { try { snap.resume(); } catch { /* */ } }
    }
  }
}

function handleMedia(m: SpeakerMediaStatus) {
  lastMedia = m;
  if (!casting || !loadedUrl) return;
  // Speaker reached the end of the track → advance the player's queue (which reloads via feed).
  if (m.playerState === 'idle' && m.idleReason === 'finished' && advancedFor !== loadedUrl
      && (!m.contentId || m.contentId === loadedUrl)) {
    advancedFor = loadedUrl;
    try { snap?.next(); } catch { /* */ }
  }
}

function handleSnapshot(s: PlayerSnapshot) {
  const prev = snap;
  snap = s;
  const risingPlay = s.isPlaying && !prevPlaying;
  prevPlaying = s.isPlaying;
  if (!casting) return;

  // Videos keep playing locally (Reello / YouTube can't go to a speaker) — give them their sound.
  if (s.audioSource === 'VIDEO') {
    if (prev?.audioSource !== 'VIDEO') { unmuteLocal(); speakers.pause(); }
    return;
  }
  if (!s.track) return;

  if (s.track.id !== loadedTrackId) {
    muteLocal();
    pauseLocal();
    loadCurrent(s.currentTime > 1 ? s.currentTime : 0);
    return;
  }
  if (risingPlay) {
    // Local "play" while casting = the user pressed play/pause (remote, now-playing bar):
    // toggle the speaker instead and keep the TV quiet.
    muteLocal();
    pauseLocal();
    const playing = lastMedia?.playerState === 'playing' || lastMedia?.playerState === 'buffering';
    if (playing) speakers.pause();
    else if (lastMedia?.playerState === 'idle') loadCurrent(0);
    else speakers.play();
  }
}

// ── public API ────────────────────────────────────────────────────────────────
/** Idempotent. Wires the native session/media listeners. Safe on web (no-op). */
export function startSpeakerSync(): void {
  if (started) return;
  started = true;
  speakersAvailable().then(ok => {
    if (!ok) return;
    onMediaStatus(handleMedia);
    onSessionChanged(handleSession);
    // Pick up a session that survived an app restart / WebView reload.
    speakers.getState().then(s => {
      if (!s) return;
      if (s.media) lastMedia = s.media;
      handleSession(s);
    });
  });
}

/** Feeds the player state into the sync. Call once under <GlobalPlayerProvider> (TvSpeakerPicker does). */
export function useSpeakerSyncFeed(): void {
  const p = useGlobalPlayerState();
  const { currentTime, seek } = useGlobalPlayerProgress();
  // Position is read lazily (no effect per timeupdate) — only needed at handover moments.
  if (snap) snap.currentTime = currentTime;
  useEffect(() => {
    handleSnapshot({
      track: p.currentTrack, album: p.currentAlbum, isPlaying: p.isPlaying, audioSource: p.audioSource,
      volume: p.volume, currentTime, pause: p.pause, resume: p.resume, next: p.next, seek, setVolume: p.setVolume,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.currentTrack, p.currentAlbum, p.isPlaying, p.audioSource, p.volume, p.pause, p.resume, p.next, seek, p.setVolume]);
}

/** Render-nothing component form of useSpeakerSyncFeed (for mounting without the picker). */
export function SpeakerSyncFeeder(): null {
  useSpeakerSyncFeed();
  return null;
}
