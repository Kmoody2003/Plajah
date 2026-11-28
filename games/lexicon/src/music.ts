// Lexicon's score: Kenne's full multi-track soundtrack (public/games/lexicon/assets/music).
// Plays continuous region playlists with smooth crossfades, auto-advance on track end (never stops after track 1!),
// and automatic Web Audio / HTMLAudio unlock recovery if browser autoplay blocked the initial call.
import type { AssetRef } from '../../../services/gamestudio/schema';
import { audioContext, audioStart } from './audio';

const KEY = 'lexicon_music_on';
let gain: GainNode | null = null;
let el: HTMLAudioElement | null = null;
let playlist: AssetRef[] = [];
let playlistKey = '';
let trackIdx = 0;
let currentId = '';
let currentTitle = '';
let level = 0.52;
let duck = 1;
let on = localStorage.getItem(KEY) !== '0';
let pendingResume = false;
let onTrackChanged: ((title: string) => void) | null = null;

function out() {
  const ctx = audioContext();
  if (!ctx) return null;
  if (!gain) {
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
  }
  return ctx;
}

function ramp(to: number, secs: number) {
  const ctx = out();
  if (!ctx || !gain) return;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(to, now + Math.max(0.05, secs));
}

const target = () => (on ? level * duck : 0);

/** All music assets declared in the Game Project. */
export function musicTracks(assets: AssetRef[]): AssetRef[] {
  return assets.filter((a) => a.kind === 'audio' && a.id.startsWith('music:'));
}

/** Pick the curated continuous playlist for each region / boss encounter. */
export function playlistForRegion(assets: AssetRef[], region: string): AssetRef[] {
  const all = musicTracks(assets);
  const byId = (ids: string[]) => ids.map((id) => all.find((t) => t.id === id)).filter((t): t is AssetRef => Boolean(t));
  let picks: AssetRef[] = [];
  if (region === 'glossa') {
    picks = byId(['music:glossa-explorer', 'music:glossa-curious', 'music:glossa-peaks', 'music:glossa-circle', 'music:glossa-answer']);
  } else if (region === 'cavern') {
    picks = byId(['music:cavern-call', 'music:cavern-fracture', 'music:glossa-circle']);
  } else if (region === 'minecart' || region === 'rapids') {
    picks = byId(['music:action-ayo', 'music:action-drum', 'music:combat-fight']);
  } else if (region === 'wilds') {
    picks = byId(['music:wilds-guardian', 'music:wilds-march', 'music:glossa-peaks', 'music:glossa-explorer']);
  } else if (region === 'temple') {
    picks = byId(['music:temple-hold', 'music:temple-firm', 'music:combat-fight']);
  } else if (region === 'boss') {
    picks = byId(['music:boss-redactor', 'music:boss-fullstop', 'music:combat-fight']);
  }
  return picks.length ? picks : all;
}

function playTrackInternal(track: AssetRef, fadeIn = 2.2) {
  const ctx = out();
  if (!ctx) {
    pendingResume = true;
    return;
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  // If the same track is already actively playing, keep going smoothly
  if (track.id === currentId && el && !el.paused && !el.ended) return;

  currentId = track.id;
  currentTitle = track.source ?? track.id.replace(/^music:/, '');

  const next = new Audio(track.url);
  next.loop = playlist.length <= 1;
  next.preload = 'auto';
  next.crossOrigin = 'anonymous';

  const prev = el;
  el = next;

  const advanceNext = () => {
    if (el !== next) return;
    if (playlist.length > 1) {
      trackIdx = (trackIdx + 1) % playlist.length;
      currentId = '';
      playTrackInternal(playlist[trackIdx]!, 1.8);
    } else {
      next.currentTime = 0;
      void next.play().catch(() => { pendingResume = true; });
    }
  };

  next.addEventListener('ended', advanceNext);
  next.addEventListener('error', () => {
    if (el === next && playlist.length > 1) {
      setTimeout(advanceNext, 1200);
    }
  });

  const start = () => {
    if (el !== next) return;
    try {
      ctx.createMediaElementSource(next).connect(gain!);
    } catch { /* fallback if already connected */ }
    next.play().then(() => {
      pendingResume = false;
      gain!.gain.setValueAtTime(Math.min(gain!.gain.value, 0.02), ctx.currentTime);
      ramp(target(), fadeIn);
      onTrackChanged?.(currentTitle);
    }).catch(() => {
      // Autoplay blocked before user gesture — mark pending so the very next tap/key/button starts it!
      pendingResume = true;
    });
  };

  if (prev) {
    ramp(0, 0.7);
    setTimeout(() => {
      try { prev.pause(); prev.src = ''; } catch { /* ignore */ }
      start();
    }, 750);
  } else {
    start();
  }
}

/** Play a continuous rotating soundtrack playlist for a region (or single track). */
export function playPlaylist(tracks: AssetRef[], key = 'default', fadeIn = 2.4) {
  if (!tracks.length) return;
  if (key === playlistKey && el && !el.paused && !el.ended) return;
  playlistKey = key;
  playlist = tracks;
  trackIdx = 0;
  currentId = '';
  playTrackInternal(playlist[0]!, fadeIn);
}

/** Single-track helper (kept compatible with callers expecting playMusic). */
export function playMusic(track: AssetRef | undefined, fadeIn = 2.4) {
  if (!track) return;
  playPlaylist([track], track.id, fadeIn);
}

/** Skip cleanly to the next track in the current region playlist. */
export function skipMusicTrack(): string {
  if (!playlist.length) return currentTitle;
  trackIdx = (trackIdx + 1) % playlist.length;
  currentId = '';
  playTrackInternal(playlist[trackIdx]!, 1.2);
  return currentTitle;
}

/** Call on any user gesture (click, keydown, controller button) to guarantee audio never stalls! */
export function ensureMusicPlaying() {
  if (!on) return;
  if (!audioContext()) audioStart();
  const ctx = out();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  if (el && (el.paused || pendingResume) && playlist.length) {
    if (el.ended) {
      trackIdx = (trackIdx + 1) % playlist.length;
      currentId = '';
      playTrackInternal(playlist[trackIdx]!, 1.2);
    } else {
      el.play().then(() => {
        pendingResume = false;
        ramp(target(), 1.0);
      }).catch(() => {
        pendingResume = true;
      });
    }
  } else if (!el && playlist.length) {
    playTrackInternal(playlist[trackIdx]!, 1.5);
  }
}

export function setTrackListener(fn: (title: string) => void) {
  onTrackChanged = fn;
}

export const currentTrackTitle = () => currentTitle;

/** Lower the music under a moment (a boss's voice, a song played on the Lyre) and bring it back. */
export function duckMusic(amount: number, secs = 0.6) {
  duck = amount;
  ramp(target(), secs);
}

/** Music on or off (kept between visits). */
export function toggleMusic() {
  on = !on;
  localStorage.setItem(KEY, on ? '1' : '0');
  if (on) ensureMusicPlaying();
  ramp(target(), 0.45);
  return on;
}
export const musicOn = () => on;
