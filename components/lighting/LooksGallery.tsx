// The looks gallery. Every tile plays the preset on a small virtual rig, through the same look and
// effect code the stage runs. One shared clock draws only the tiles on screen.

import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { boardEngine, useBoard } from '../../services/lighting/boardEngine';
import { LOOK_CATEGORIES, LOOK_PRESETS, type LookCategory, type LookPreset } from '../../services/lighting/looks';
import { previewFrame, restingFrame, type PreviewFixture } from '../../services/lighting/lookPreview';

const W = 160, H = 90;
const FRAME_MS = 50;

type Ctx = CanvasRenderingContext2D;

/** Set a colour's alpha, for a #rrggbb string. */
const alpha = (css: string, a: number) => `${css}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;

function drawStage(c: Ctx, fx: PreviewFixture[]) {
  c.fillStyle = '#0e0c12';
  c.fillRect(0, 62, W, 28);
  c.globalCompositeOperation = 'lighter';
  fx.forEach((f, i) => {
    const x0 = 18 + (i * 124) / Math.max(1, fx.length - 1);
    const floor = 60 / Math.max(0.25, Math.abs(f.y));
    const ex = x0 + f.x * floor;
    const ey = 6 + Math.min(1, f.y + 0.1) * 60;
    // Towards the viewer a beam opens up and shortens.
    const w = 9 + Math.abs(f.z) * 14;
    const g = c.createLinearGradient(x0, 6, ex, ey);
    g.addColorStop(0, alpha(f.css, 0.85 * f.on));
    g.addColorStop(1, alpha(f.css, 0.06 * f.on));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x0, 6);
    c.lineTo(ex - w, ey);
    c.lineTo(ex + w, ey);
    c.closePath();
    c.fill();
    if (f.y > 0.3) {
      c.fillStyle = alpha(f.css, 0.75 * f.on);
      c.beginPath();
      c.ellipse(ex, ey, w + 3, 3, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = alpha(f.css, Math.min(1, 0.2 + f.on));
    c.beginPath();
    c.arc(x0, 6, 1.8, 0, Math.PI * 2);
    c.fill();
  });
}

function drawBuilding(c: Ctx, fx: PreviewFixture[]) {
  c.fillStyle = '#08070b';
  c.fillRect(0, 78, W, 12);
  c.fillStyle = '#1a1820';
  c.beginPath();
  c.moveTo(24, 78); c.lineTo(24, 30); c.lineTo(80, 12); c.lineTo(136, 30); c.lineTo(136, 78);
  c.closePath();
  c.fill();
  c.globalCompositeOperation = 'lighter';
  fx.forEach((f, i) => {
    const x = 34 + i * 18.4;
    const g = c.createLinearGradient(0, 78, 0, 24);
    g.addColorStop(0, alpha(f.css, f.on));
    g.addColorStop(1, alpha(f.css, 0.04 * f.on));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x, 78); c.lineTo(x - 11, 26); c.lineTo(x + 11, 26);
    c.closePath();
    c.fill();
  });
}

const line = (x0: number, y0: number, x1: number, y1: number, n: number) => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1)]);
const HOUSE_DOTS = [...line(26, 44, 80, 16, 15), ...line(80, 16, 134, 44, 15), ...line(32, 72, 32, 48, 5), ...line(128, 72, 128, 48, 5), ...line(64, 74, 64, 54, 5), ...line(64, 54, 96, 54, 6), ...line(96, 54, 96, 74, 5)];

function drawHouse(c: Ctx, fx: PreviewFixture[]) {
  c.fillStyle = '#2a3040';
  c.fillRect(0, 76, W, 14);
  c.fillStyle = '#14121a';
  c.beginPath();
  c.moveTo(32, 76); c.lineTo(32, 44); c.lineTo(80, 18); c.lineTo(128, 44); c.lineTo(128, 76);
  c.closePath();
  c.fill();
  c.globalCompositeOperation = 'lighter';
  HOUSE_DOTS.forEach(([x, y], i) => {
    const f = fx[i % fx.length];
    c.fillStyle = alpha(f.css, f.on);
    c.beginPath();
    c.arc(x, y, 1.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = alpha(f.css, f.on * 0.22);
    c.beginPath();
    c.arc(x, y, 3.6, 0, Math.PI * 2);
    c.fill();
  });
}

function drawRoom(c: Ctx, fx: PreviewFixture[]) {
  c.fillStyle = '#16131a';
  c.fillRect(0, 66, W, 24);
  c.globalCompositeOperation = 'lighter';
  fx.forEach((f, i) => {
    const x = i ? 132 : 28;
    const g = c.createRadialGradient(x, 38, 0, x, 38, 44);
    g.addColorStop(0, alpha(f.css, f.on));
    g.addColorStop(1, alpha(f.css, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  });
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#0f0d12';
  c.fillRect(46, 48, 68, 24);
}

const DRAW: Partial<Record<LookCategory, (c: Ctx, fx: PreviewFixture[]) => void>> = { Architecture: drawBuilding, Christmas: drawHouse, Home: drawRoom };

function paint(canvas: HTMLCanvasElement, preset: LookPreset, fx: PreviewFixture[]) {
  const c = canvas.getContext('2d');
  if (!c) return;
  const k = canvas.width / W;
  c.setTransform(k, 0, 0, k, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#050408';
  c.fillRect(0, 0, W, H);
  (DRAW[preset.category] ?? drawStage)(c, fx);
}

// One clock for the whole gallery, so 86 tiles cost one timer and only visible ones draw.
const visible = new Map<HTMLCanvasElement, LookPreset>();
let raf = 0, lastDraw = 0;

// With the system's reduce-motion setting on, tiles rest and only play on hover, until the person
// chooses to play them all. The choice is remembered.
const MOTION_KEY = 'plajah.lightboard.previewMotion';
const systemReduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionListeners = new Set<() => void>();
function readMotion() {
  try {
    const saved = localStorage.getItem(MOTION_KEY);
    if (saved) return saved === 'on';
  } catch { /* storage blocked */ }
  return !systemReduced();
}
let motionOn = readMotion();
function setMotion(on: boolean) {
  motionOn = on;
  try { localStorage.setItem(MOTION_KEY, on ? 'on' : 'off'); } catch { /* this visit only */ }
  motionListeners.forEach((fn) => fn());
}

export function PreviewMotionToggle() {
  const [on, setOn] = useState(motionOn);
  useEffect(() => {
    const fn = () => setOn(motionOn);
    motionListeners.add(fn);
    return () => { motionListeners.delete(fn); };
  }, []);
  return (
    <button onClick={() => setMotion(!on)} aria-pressed={on} className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${on ? 'bg-white/[0.07] text-white/70 hover:text-white' : 'bg-[#FF8C00] text-black'}`}>
      {on ? <Pause size={12} /> : <Play size={12} />} {on ? 'Pause previews' : 'Play previews'}
    </button>
  );
}

function tick(now: number) {
  raf = visible.size ? requestAnimationFrame(tick) : 0;
  if (now - lastDraw < FRAME_MS) return;
  lastDraw = now;
  visible.forEach((preset, canvas) => paint(canvas, preset, previewFrame(preset, now / 1000)));
}

function useAnimatedTile(preset: LookPreset) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hover = useRef<(on: boolean) => void>(() => {});
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * scale;
    canvas.height = H * scale;
    paint(canvas, preset, restingFrame(preset));
    let onScreen = false, hovered = false;
    const sync = () => {
      if (onScreen && (motionOn || hovered)) {
        visible.set(canvas, preset);
        if (!raf) raf = requestAnimationFrame(tick);
      } else if (visible.delete(canvas)) paint(canvas, preset, restingFrame(preset));
    };
    hover.current = (on) => { hovered = on; sync(); };
    const io = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); });
    io.observe(canvas);
    motionListeners.add(sync);
    return () => { io.disconnect(); motionListeners.delete(sync); visible.delete(canvas); };
  }, [preset]);
  return { ref, hover };
}

export function LookTile({ preset, active, onPlay, label, disabled }: { preset: LookPreset; active: boolean; onPlay: () => void; label?: string; disabled?: boolean }) {
  const { ref, hover } = useAnimatedTile(preset);
  return (
    <button onClick={onPlay} disabled={disabled} aria-pressed={active} onMouseEnter={() => hover.current(true)} onMouseLeave={() => hover.current(false)} onFocus={() => hover.current(true)} onBlur={() => hover.current(false)} className={`text-left rounded-lg overflow-hidden border-2 ${active ? 'border-white' : 'border-transparent hover:border-white/30'} bg-black disabled:cursor-not-allowed`}>
      <canvas ref={ref} data-look={preset.id} className="block w-full aspect-video" aria-hidden="true" />
      <span className="block px-2 py-1.5 text-xs font-medium truncate bg-white/[0.05]">{label ?? preset.name}</span>
    </button>
  );
}

export function LooksGallery() {
  const board = useBoard();
  const [category, setCategory] = useState<LookCategory | 'All'>('All');
  const shown = category === 'All' ? LOOK_CATEGORIES : [category];
  const empty = board.show.fixtures.length === 0;

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 overflow-x-auto pb-1 flex-1 min-w-0">
          {(['All', ...LOOK_CATEGORIES] as const).map((c) => (
            <button key={c} onClick={() => setCategory(c)} aria-pressed={category === c} className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap ${category === c ? 'bg-white text-black font-medium' : 'bg-white/[0.07] text-white/70 hover:text-white'}`}>{c}</button>
          ))}
        </div>
        <PreviewMotionToggle />
      </div>
      {empty && <p className="text-xs text-amber-200/90">Add lights first (Patch, Fixtures or Smart) so a look has something to light.</p>}
      {shown.map((c) => (
        <section key={c}>
          <h3 className="text-xs font-semibold text-white/70 mb-1.5">{c} <span className="font-normal text-white/40">{LOOK_PRESETS.filter((p) => p.category === c).length}</span></h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
            {LOOK_PRESETS.filter((p) => p.category === c).map((p) => (
              <LookTile key={p.id} preset={p} active={board.activeLookId === p.id} onPlay={() => boardEngine.playLook(p)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
