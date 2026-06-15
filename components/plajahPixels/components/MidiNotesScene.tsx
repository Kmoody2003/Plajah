// MidiNotesScene — a Synthesia-style falling-notes + piano-roll visual, driven
// by live MIDI input (plajah-midi-note-on / note-off events from midiService).
// Notes fall from the top toward a keyboard at the bottom; held notes stretch.

import React, { useEffect, useRef } from 'react';

interface ActiveNote { note: number; startMs: number; vel: number; }
interface Bar { note: number; startMs: number; endMs: number | null; vel: number; }

const LOW = 36;   // C2
const HIGH = 96;  // C7
const FALL_MS = 2600; // time a note takes to travel top→keyboard

const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);

const MidiNotesScene: React.FC<{ palette: string[] }> = ({ palette }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<Map<number, ActiveNote>>(new Map());
  const barsRef = useRef<Bar[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const onNoteOn = (e: Event) => {
      const d = (e as CustomEvent).detail; const note = d.note, vel = (d.velocity || 100) / 127;
      const now = performance.now();
      activeRef.current.set(note, { note, startMs: now, vel });
      barsRef.current.push({ note, startMs: now, endMs: null, vel });
    };
    const onNoteOff = (e: Event) => {
      const d = (e as CustomEvent).detail; const note = d.note;
      const a = activeRef.current.get(note);
      if (a) {
        const bar = [...barsRef.current].reverse().find(b => b.note === note && b.endMs === null);
        if (bar) bar.endMs = performance.now();
        activeRef.current.delete(note);
      }
    };
    window.addEventListener('plajah-midi-note-on', onNoteOn);
    window.addEventListener('plajah-midi-note-off', onNoteOff);
    return () => {
      window.removeEventListener('plajah-midi-note-on', onNoteOn);
      window.removeEventListener('plajah-midi-note-off', onNoteOff);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true } as CanvasRenderingContext2DSettings);
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr; };
    window.addEventListener('resize', resize); resize();

    const accent = (i: number) => palette[i % palette.length] || '#b56cff';
    const span = HIGH - LOW + 1;

    const loop = () => {
      const W = canvas.width, H = canvas.height;
      const kbH = Math.min(H * 0.18, 160 * dpr);
      const rollH = H - kbH;
      const keyW = W / span;
      const now = performance.now();

      ctx.fillStyle = '#06060c'; ctx.fillRect(0, 0, W, H);

      // Falling note bars
      for (let i = barsRef.current.length - 1; i >= 0; i--) {
        const b = barsRef.current[i];
        const endMs = b.endMs ?? now;
        const ageHead = now - b.startMs;          // time since note start
        const headY = (ageHead / FALL_MS) * rollH; // bar head travels down
        const tail = (now - endMs);
        const tailY = b.endMs ? (tail / FALL_MS) * rollH : 0;
        if (headY - tailY > rollH + 80 * dpr) { barsRef.current.splice(i, 1); continue; } // off-screen
        const x = (b.note - LOW) * keyW;
        const col = accent(b.note);
        const y0 = Math.max(0, tailY);
        const y1 = Math.min(rollH, headY);
        if (y1 <= 0) continue;
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.55 + 0.45 * b.vel;
        const pad = isBlack(b.note) ? keyW * 0.22 : keyW * 0.1;
        roundRect(ctx, x + pad, y0, keyW - pad * 2, Math.max(3 * dpr, y1 - y0), 4 * dpr);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Keyboard
      ctx.fillStyle = '#0b0b14'; ctx.fillRect(0, rollH, W, kbH);
      // white keys
      for (let n = LOW; n <= HIGH; n++) {
        if (isBlack(n)) continue;
        const x = (n - LOW) * keyW;
        const down = activeRef.current.has(n);
        ctx.fillStyle = down ? accent(n) : '#e9e9f2';
        roundRect(ctx, x + 1, rollH + 2, keyW - 2, kbH - 4, 3 * dpr); ctx.fill();
        if (down) { ctx.fillStyle = accent(n); ctx.globalAlpha = 0.4; ctx.fillRect(x, rollH - 18 * dpr, keyW, 18 * dpr); ctx.globalAlpha = 1; }
      }
      // black keys
      for (let n = LOW; n <= HIGH; n++) {
        if (!isBlack(n)) continue;
        const x = (n - LOW) * keyW;
        const down = activeRef.current.has(n);
        ctx.fillStyle = down ? accent(n) : '#15151f';
        roundRect(ctx, x + keyW * 0.18, rollH + 2, keyW * 0.64, kbH * 0.62, 3 * dpr); ctx.fill();
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(rafRef.current); };
  }, [palette]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 1 }} />;
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export default MidiNotesScene;
