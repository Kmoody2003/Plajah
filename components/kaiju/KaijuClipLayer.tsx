// KaijuClipLayer — plays the Kling reference videos of Lorik & Lumi as a beat-cut music video.
//
// The four source clips (public/kaiju/clips) are cut into tagged segments by mood. A tiny director
// reads the live KaijuFeatures each frame and, on bar boundaries, cuts to a segment that fits the
// music: calm (reading / sitting / hanging out) for meditation & ballet, hype (boxing, stomping,
// kicks, roars) for EDM & rock, intense close-up glares on rock accents, and the book-reading /
// talking shots whenever someone is singing or rapping. Two <video> elements A/B crossfade so cuts
// never show a loading frame. playbackRate follows the tempo a little, and each kick gives the frame
// a tiny punch-in. The layer uses mix-blend-mode: multiply so the clips' off-white studio
// background drops out and the pulsing Plajah logo behind them stays visible.

import React, { useEffect, useRef } from 'react';
import type { KaijuFeatures } from './kaijuAudio';

export type ClipMood = 'calm' | 'sing' | 'hype' | 'intense';
export interface ClipSeg { src: string; a: number; b: number; mood: ClipMood; label: string }

const C = (n: string) => `/kaiju/clips/${n}.mp4`;
/** Hand-tagged from contact sheets of each 15 s clip. */
export const KAIJU_CLIP_SEGMENTS: ClipSeg[] = [
  { src: C('kaiju-hangout'), a: 0.0, b: 4.3, mood: 'calm', label: 'Book & camera' },
  { src: C('kaiju-hangout'), a: 4.3, b: 7.4, mood: 'calm', label: 'Little wave' },
  { src: C('kaiju-hangout'), a: 7.4, b: 11.0, mood: 'sing', label: 'Close read' },
  { src: C('kaiju-hangout'), a: 11.0, b: 12.6, mood: 'hype', label: 'Point & kick' },
  { src: C('kaiju-hangout'), a: 12.6, b: 15.0, mood: 'calm', label: 'Sitting pretty' },
  { src: C('kaiju-boxing'), a: 0.0, b: 4.0, mood: 'hype', label: 'Boxing' },
  { src: C('kaiju-boxing'), a: 4.0, b: 8.6, mood: 'hype', label: 'Stomp walk' },
  { src: C('kaiju-boxing'), a: 8.6, b: 12.4, mood: 'intense', label: 'Death glare' },
  { src: C('kaiju-boxing'), a: 12.4, b: 15.0, mood: 'hype', label: 'Roar' },
  { src: C('kaiju-read'), a: 0.0, b: 7.6, mood: 'sing', label: 'Reading duet' },
  { src: C('kaiju-read'), a: 7.6, b: 15.0, mood: 'sing', label: 'Close-up chorus' },
  { src: C('kaiju-dance'), a: 0.0, b: 4.8, mood: 'hype', label: 'Stomp dance' },
  { src: C('kaiju-dance'), a: 4.8, b: 9.0, mood: 'hype', label: 'Kicks' },
  { src: C('kaiju-dance'), a: 9.0, b: 12.6, mood: 'intense', label: 'Crowd-in' },
  { src: C('kaiju-dance'), a: 12.6, b: 15.0, mood: 'hype', label: 'March out' },
];

interface Props {
  /** Updated every frame by the stage. */
  features: React.MutableRefObject<KaijuFeatures | null>;
  isPlaying: boolean;
  /** Called with the current segment label (for the HUD). */
  onSegment?: (label: string) => void;
  className?: string;
}

export function moodFor(f: KaijuFeatures): ClipMood {
  if (f.vocalMode !== 'none') return 'sing';
  if (f.style === 'edm') return 'hype';
  if (f.style === 'rock') return f.intensity > 1.2 && (Math.floor(f.beats / 4) * 7919) % 100 < 35 ? 'intense' : 'hype';
  return 'calm';
}

export const KaijuClipLayer: React.FC<Props> = ({ features, isPlaying, onSegment, className }) => {
  const va = useRef<HTMLVideoElement>(null), vb = useRef<HTMLVideoElement>(null), wrap = useRef<HTMLDivElement>(null);
  const live = useRef({ isPlaying, onSegment });
  live.current = { isPlaying, onSegment };

  useEffect(() => {
    const vids = [va.current!, vb.current!];
    let front = 0, seg: ClipSeg | null = null, mood: ClipMood | null = null, cutBeat = -999, raf = 0, punch = 0, last = performance.now();
    const recent: ClipSeg[] = [];

    const choose = (m: ClipMood) => {
      let pool = KAIJU_CLIP_SEGMENTS.filter(s => s.mood === m);
      if (m === 'intense' && !pool.length) pool = KAIJU_CLIP_SEGMENTS.filter(s => s.mood === 'hype');
      const fresh = pool.filter(s => !recent.includes(s));
      const list = fresh.length ? fresh : pool;
      return list[Math.floor(Math.random() * list.length)];
    };

    const cutTo = (s: ClipSeg) => {
      const back = 1 - front, v = vids[back];
      const start = () => {
        v.currentTime = s.a;
        void v.play().catch(() => {});
        v.style.opacity = '1';
        vids[front].style.opacity = '0';
        const old = vids[front];
        setTimeout(() => old.pause(), 320);
        front = back;
      };
      if (!v.src.endsWith(s.src)) { v.src = s.src; v.addEventListener('loadeddata', start, { once: true }); v.load(); }
      else start();
      seg = s; recent.push(s); if (recent.length > 4) recent.shift();
      live.current.onSegment?.(s.label);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const f = features.current;
      const playing = live.current.isPlaying && !!f && !f.silent;
      const v = vids[front];
      if (!playing) { if (!v.paused) v.pause(); return; }
      if (!f) return;

      const m = moodFor(f);
      const barLen = m === 'hype' || m === 'intense' ? 4 : 8;
      const onBar = Math.floor(f.beats / barLen) !== Math.floor(cutBeat / barLen);
      const moodChanged = m !== mood && (m === 'sing' || mood === 'sing' || f.beats - cutBeat >= 2);
      if (!seg || moodChanged || (onBar && f.beats - cutBeat >= barLen - 0.01)) {
        mood = m; cutBeat = f.beats;
        cutTo(choose(m));
      } else if (seg && v.currentTime >= seg.b - 0.05) {
        v.currentTime = seg.a; // loop inside the segment until the next cut
      }
      if (v.paused && v.readyState >= 2) void v.play().catch(() => {});

      const bpm = f.bpm || 110;
      const rate = mood === 'calm' || mood === 'sing' ? Math.min(1.05, Math.max(0.85, bpm / 120)) : Math.min(1.2, Math.max(0.9, bpm / 115));
      if (Math.abs(v.playbackRate - rate) > 0.02) v.playbackRate = rate;

      punch = Math.max(punch * Math.exp(-dt * 9), f.kick);
      if (wrap.current) wrap.current.style.transform = `scale(${(1 + 0.018 * punch).toFixed(4)})`;
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); vids.forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); }); };
  }, [features]);

  const vStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: '50% 100%', opacity: 0,
    transition: 'opacity 260ms ease', filter: 'brightness(1.06) contrast(1.04) saturate(1.06)',
  };
  return (
    // Top 17% is left free for the stage's pulsing Plajah title badge.
    <div className={className} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '17%', mixBlendMode: 'multiply', pointerEvents: 'none' }}>
      <div ref={wrap} style={{ position: 'absolute', inset: 0, transformOrigin: '50% 60%' }}>
        <video ref={va} muted playsInline preload="auto" style={vStyle} />
        <video ref={vb} muted playsInline preload="auto" style={vStyle} />
      </div>
    </div>
  );
};

export default KaijuClipLayer;
