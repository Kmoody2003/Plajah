/**
 * Kith Quest — event-driven sound effects, synthesized on the shared Kith Party AudioContext
 * (gameAudio.context) so mute / unlock behave exactly like the rest of Kith Party.
 * Placeholder synth layer: swap in recorded CC0 one-shots later (canon: recorded over synth).
 */
import {gameAudio} from '../audio';
import type {QuestEvent} from './sim';

let out: GainNode | null = null;
let noise: AudioBuffer | null = null;

function bus(): {ctx: AudioContext; out: GainNode} | null {
 const ctx = gameAudio.context;
 if (!ctx || gameAudio.isMuted) return null;
 if (!out || out.context !== ctx) {
  out = ctx.createGain(); out.gain.value = .55;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  out.connect(comp); comp.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate * .5, ctx.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
 }
 return {ctx, out};
}

function tone(f: number, dur: number, type: OscillatorType = 'triangle', vol = .2, slide = 0, delay = 0) {
 const b = bus(); if (!b) return;
 const t = b.ctx.currentTime + delay;
 const o = b.ctx.createOscillator(), g = b.ctx.createGain();
 o.type = type; o.frequency.setValueAtTime(f, t);
 if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
 g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
 o.connect(g); g.connect(b.out); o.start(t); o.stop(t + dur + .02);
}
function hiss(dur: number, freq: number, vol = .2, type: BiquadFilterType = 'bandpass', sweep = 0, delay = 0) {
 const b = bus(); if (!b || !noise) return;
 const t = b.ctx.currentTime + delay;
 const src = b.ctx.createBufferSource(); src.buffer = noise;
 const f = b.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = 1.2;
 if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
 const g = b.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
 src.connect(f); f.connect(g); g.connect(b.out); src.start(t); src.stop(t + dur + .02);
}

let lastMote = 0, moteStep = 0;
export function questSfx(e: QuestEvent) {
 const ctx = gameAudio.context; if (!ctx) return;
 switch (e.type) {
  case 'jump': tone(e.data === 'spin' ? 330 : 392, .14, 'square', .07, 780); break;
  case 'djump': tone(523, .16, 'triangle', .12, 1046); tone(784, .12, 'sine', .06, 1568, .03); break;
  case 'walljump': tone(440, .1, 'square', .06, 880); hiss(.06, 3000, .08); break;
  case 'land': hiss(.06, 500, .12, 'lowpass'); break;
  case 'dash': hiss(.22, 900, .22, 'bandpass', 4000); break;
  case 'roll': hiss(.18, 1200, .12, 'bandpass', 300); break;
  case 'rev': tone(220 + Number(e.data || 0) * 160, .12, 'sawtooth', .06, 440 + Number(e.data || 0) * 300); break;
  case 'spinRelease': hiss(.3, 600, .25, 'bandpass', 5000); tone(180, .25, 'sawtooth', .08, 720); break;
  case 'mote': {
   const now = ctx.currentTime; moteStep = now - lastMote < .35 ? (moteStep + 1) % 8 : 0; lastMote = now;
   const scale = [0, 2, 4, 7, 9, 12, 14, 16];
   tone(1046 * Math.pow(2, scale[moteStep] / 12), .16, 'sine', .1); tone(2093 * Math.pow(2, scale[moteStep] / 12), .08, 'triangle', .03, 0, .02);
   break;
  }
  case 'seed': [0, 4, 7, 12, 16].forEach((n, i) => tone(523 * Math.pow(2, n / 12), .4, 'triangle', .12, 0, i * .07)); break;
  case 'petal': tone(660, .2, 'sine', .12, 990); tone(880, .3, 'sine', .08, 1320, .08); break;
  case 'spark': tone(880, .12, 'square', .05, 1760); tone(1320, .14, 'triangle', .06, 0, .05); break;
  case 'oneup': [0, 4, 7, 12, 7, 12].forEach((n, i) => tone(660 * Math.pow(2, n / 12), .14, 'square', .06, 0, i * .08)); break;
  case 'box': tone(988, .08, 'square', .08); tone(1318, .18, 'triangle', .08, 0, .06); break;
  case 'brick': hiss(.25, 700, .3, 'lowpass', 200); tone(120, .18, 'triangle', .2, 60); break;
  case 'head': tone(160, .08, 'triangle', .15, 90); break;
  case 'lash': hiss(.14, 2400, .16, 'bandpass', 700); break;
  case 'hit': tone(300, .08, 'square', .1, 150); hiss(.05, 2000, .1); break;
  case 'pop': tone(700, .12, 'square', .08, 180); hiss(.12, 1500, .12, 'bandpass', 400); break;
  case 'stomp': tone(240, .12, 'square', .12, 640); break;
  case 'parry': tone(1568, .2, 'triangle', .12, 2093); hiss(.08, 6000, .1, 'highpass'); break;
  case 'hurt': tone(330, .25, 'sawtooth', .12, 110); break;
  case 'die': [12, 7, 4, 0, -5].forEach((n, i) => tone(440 * Math.pow(2, n / 12), .2, 'triangle', .12, 0, i * .12)); break;
  case 'fall': tone(600, .5, 'sine', .1, 120); break;
  case 'respawn': tone(392, .3, 'sine', .1, 784); break;
  case 'spring': tone(200, .3, 'sine', .18, 900); break;
  case 'boost': hiss(.35, 800, .18, 'bandpass', 5000); tone(300, .3, 'sawtooth', .05, 900); break;
  case 'checkpoint': [0, 7, 12].forEach((n, i) => tone(587 * Math.pow(2, n / 12), .35, 'triangle', .1, 0, i * .09)); break;
  case 'sign': tone(1200, .05, 'sine', .05); break;
  case 'sub': hiss(.12, 1800, .1, 'bandpass', 3600); tone(520, .1, 'triangle', .06, 900); break;
  case 'shotHit': hiss(.1, 1200, .1, 'lowpass'); break;
  case 'spore': tone(180, .12, 'sine', .1, 320); break;
  case 'bashAim': tone(220, .4, 'sine', .08, 330); hiss(.3, 3000, .05, 'highpass'); break;
  case 'bash': tone(196, .3, 'sawtooth', .12, 784); hiss(.35, 900, .25, 'bandpass', 6000); break;
  case 'crumble': hiss(.2, 400, .1, 'lowpass'); break;
  case 'crumbleFall': hiss(.3, 300, .14, 'lowpass', 100); break;
  case 'bonk': tone(140, .1, 'square', .12, 70); break;
  case 'go': tone(523, .12, 'square', .08); tone(784, .25, 'square', .08, 0, .1); break;
  case 'bossIntro': tone(55, 1.4, 'sawtooth', .18, 41); hiss(1.2, 200, .2, 'lowpass'); break;
  case 'bossHit': tone(150, .14, 'square', .14, 80); hiss(.1, 2500, .12); break;
  case 'bossPhase': tone(70, .9, 'sawtooth', .2, 35); break;
  case 'bossVolley': tone(880, .18, 'sine', .07, 440); break;
  case 'bossTell': tone(e.data === 'slam' ? 110 : 330, .4, 'triangle', .08, e.data === 'slam' ? 220 : 660); break;
  case 'bossSlam': tone(60, .5, 'sine', .4, 30); hiss(.4, 300, .3, 'lowpass', 80); break;
  case 'bossBlink': tone(640, .24, 'sine', .11, 1320); hiss(.18, 3600, .09, 'highpass', 1200); break;
  case 'beetleCharge': tone(140, .18, 'sawtooth', .08, 280); hiss(.14, 900, .1, 'bandpass', 2400); break;
  case 'wispCast': tone(740, .18, 'sine', .07, 1180); break;
  case 'briarSnap': hiss(.12, 1600, .14, 'bandpass', 600); tone(260, .1, 'square', .08, 120); break;
  case 'bossDown': hiss(2.4, 1600, .2, 'bandpass', 120); break;
  case 'bossDead': [0, 4, 7, 11, 12, 16, 19].forEach((n, i) => tone(392 * Math.pow(2, n / 12), .5, 'triangle', .1, 0, i * .1)); break;
  case 'clear': break; // the score plays its own music-box cadence
  case 'gameover': [7, 3, 0, -5].forEach((n, i) => tone(330 * Math.pow(2, n / 12), .4, 'triangle', .12, 0, i * .2)); break;
 }
}
