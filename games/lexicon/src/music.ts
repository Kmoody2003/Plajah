// Lexicon's score: Kenne's own tracks, declared in the Game Project as audio assets (`music:<id>`, licence 'owner').
// One track plays at a time, looping, faded in and out; the main theme is the first music asset until a level or a
// moment names another. Played through the same AudioContext as the sound cues (audio.ts), on its own gain.
import type { AssetRef } from '../../../services/gamestudio/schema';
import { audioContext } from './audio';

const KEY = 'lexicon_music_on';
let gain: GainNode | null = null;
let el: HTMLAudioElement | null = null;
let current = '';
let level = 0.55; // the music under the cues
let duck = 1;
let on = localStorage.getItem(KEY) !== '0';

function out() {
  const ctx = audioContext();
  if (!ctx) return null;
  if (!gain) { gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination); }
  return ctx;
}
function ramp(to: number, secs: number) {
  const ctx = out(); if (!ctx || !gain) return;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(to, ctx.currentTime + secs);
}
const target = () => (on ? level * duck : 0);

/** The project's music, in the order it declares it (the first is the main theme). */
export function musicTracks(assets: AssetRef[]) { return assets.filter((a) => a.kind === 'audio' && a.id.startsWith('music:')); }

/** Play a track (looping), crossing over from whatever plays: a short fade out, then this one fades in. */
export function playMusic(track: AssetRef | undefined, fadeIn = 3) {
  const ctx = out(); if (!ctx || !track || track.id === current) return;
  current = track.id;
  const next = new Audio(track.url);
  next.loop = true; next.preload = 'auto'; next.crossOrigin = 'anonymous';
  const prev = el; el = next;
  const start = () => {
    if (el !== next) return;
    ctx.createMediaElementSource(next).connect(gain!);
    void next.play().catch((e) => console.warn('[lexicon] music did not start:', e));
    gain!.gain.setValueAtTime(0, ctx.currentTime);
    ramp(target(), fadeIn);
  };
  if (prev) { ramp(0, 0.8); setTimeout(() => { prev.pause(); start(); }, 850); } else start();
}

/** Lower the music under a moment (a boss's voice, a song played on the Lyre) and bring it back. */
export function duckMusic(amount: number, secs = 0.6) { duck = amount; ramp(target(), secs); }

/** Music on or off (kept between visits). */
export function toggleMusic() { on = !on; localStorage.setItem(KEY, on ? '1' : '0'); ramp(target(), 0.5); return on; }
export const musicOn = () => on;
