import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton } from '../ui';
import { frameToTc, secToFrame, stripMarkup, type CaptionCue, type FrameRate } from '../../services/crossover/captions';
import { mono } from './shared';

interface Props {
  cues: CaptionCue[];
  duration: number;
  time: number;
  rate: FrameRate;
  startTcFrame?: number;
  selectedId?: string | null;
  issueIds?: Set<string>;
  /** Mono 16 kHz samples, for the waveform. */
  pcm?: Float32Array | null;
  onSeek: (sec: number) => void;
  onSelect: (id: string) => void;
  onRetime: (id: string, startSec: number, endSec: number) => void;
}

const HEIGHT_RULER = 20;
const HEIGHT_WAVE = 44;
const HEIGHT_CUES = 34;

/**
 * Words against sound: the waveform sits right under the caption blocks, so a caption that starts
 * before or after someone speaks is visible at a glance. Drag a block to move it, or its edges to
 * change when it starts and ends.
 */
const CaptionTimeline: React.FC<Props> = ({ cues, duration, time, rate, startTcFrame = 0, selectedId, issueIds, pcm, onSeek, onSelect, onRetime }) => {
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pxPerSec, setPxPerSec] = useState(24);
  const [view, setView] = useState({ left: 0, width: 800 });
  const total = Math.max(duration, cues.length ? cues[cues.length - 1].endSec + 2 : 0, 1);
  const width = total * pxPerSec;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setView({ left: el.scrollLeft, width: el.clientWidth });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, []);

  // Keep the playhead in view while it runs.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const x = time * pxPerSec;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - el.clientWidth * 0.2);
  }, [time, pxPerSec]);

  // Only the visible stretch of waveform is drawn, so an hour-long file costs the same as a short one.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.floor(view.width * dpr));
    c.height = HEIGHT_WAVE * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!pcm) return;
    const styles = getComputedStyle(c);
    ctx.fillStyle = styles.getPropertyValue('--pj-cyan') || 'cyan';
    ctx.globalAlpha = 0.75;
    const samplesPerPx = 16000 / (pxPerSec * dpr);
    const mid = c.height / 2;
    for (let x = 0; x < c.width; x++) {
      const start = Math.floor((view.left * dpr + x) * samplesPerPx);
      const end = Math.min(pcm.length, Math.floor(start + samplesPerPx));
      let peak = 0;
      const stride = Math.max(1, Math.floor((end - start) / 40));
      for (let i = start; i < end; i += stride) { const v = Math.abs(pcm[i]); if (v > peak) peak = v; }
      const h = Math.max(1, Math.min(1, peak * 1.6) * mid);
      ctx.fillRect(x, mid - h, 1, h * 2);
    }
  }, [pcm, pxPerSec, view]);

  const ticks = useMemo(() => {
    const step = [1, 2, 5, 10, 30, 60, 120, 300, 600].find((s) => s * pxPerSec >= 80) ?? 1200;
    const out: number[] = [];
    const from = Math.floor(view.left / pxPerSec / step) * step;
    for (let t = from; t * pxPerSec < view.left + view.width + 100 && t <= total; t += step) out.push(t);
    return out;
  }, [pxPerSec, view, total]);

  const drag = useRef<{ id: string; mode: 'move' | 'start' | 'end'; x: number; s: number; e: number } | null>(null);
  const [preview, setPreview] = useState<{ id: string; s: number; e: number } | null>(null);

  const beginDrag = (e: React.PointerEvent, cue: CaptionCue, mode: 'move' | 'start' | 'end') => {
    e.stopPropagation();
    onSelect(cue.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: cue.id, mode, x: e.clientX, s: cue.startSec, e: cue.endSec };
  };
  const snap = useCallback((sec: number) => (secToFrame(Math.max(0, sec), rate) * rate.den) / rate.num, [rate]);
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = (e.clientX - d.x) / pxPerSec;
    const len = d.e - d.s;
    if (d.mode === 'move') { const s = snap(d.s + dt); setPreview({ id: d.id, s, e: s + len }); }
    else if (d.mode === 'start') setPreview({ id: d.id, s: Math.min(snap(d.s + dt), d.e - 0.1), e: d.e });
    else setPreview({ id: d.id, s: d.s, e: Math.max(snap(d.e + dt), d.s + 0.1) });
  };
  const endDrag = () => {
    if (drag.current && preview) onRetime(preview.id, preview.s, preview.e);
    drag.current = null;
    setPreview(null);
  };

  const visible = cues.filter((c) => c.endSec * pxPerSec >= view.left - 200 && c.startSec * pxPerSec <= view.left + view.width + 200);

  return (
    <div className="flex flex-col min-h-0" style={{ background: 'var(--glass-1)', border: '1px solid var(--m3-border)', borderRadius: 'var(--pj-radius-lg)' }} data-testid="caption-timeline">
      <div className="flex items-center gap-2 px-3 h-10 shrink-0">
        <span className="pj-eyebrow">Timing</span>
        <span className="type-body-sm truncate" style={{ color: 'var(--on-surface-variant)' }}>
          {cues.length ? `${cues.length} caption${cues.length === 1 ? '' : 's'}` : 'No captions yet'}
          {pcm ? ' · waveform on' : ''}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton variant="ghost" size="xs" aria-label="Zoom out" onClick={() => setPxPerSec((p) => Math.max(2, p / 1.6))}><ZoomOut /></IconButton>
          <IconButton variant="ghost" size="xs" aria-label="Zoom in" onClick={() => setPxPerSec((p) => Math.min(400, p * 1.6))}><ZoomIn /></IconButton>
        </div>
      </div>
      <div ref={scroller} className="relative overflow-x-auto overflow-y-hidden" style={{ height: HEIGHT_RULER + HEIGHT_WAVE + HEIGHT_CUES + 12 }}
        onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="relative" style={{ width, height: '100%' }}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onSeek(Math.max(0, (e.clientX - r.left) / pxPerSec));
          }}>
          <canvas ref={canvas} className="absolute pointer-events-none" style={{ left: view.left, top: HEIGHT_RULER, width: view.width, height: HEIGHT_WAVE }} />
          {ticks.map((t) => (
            <div key={t} className="absolute top-0 pointer-events-none" style={{ left: t * pxPerSec, height: HEIGHT_RULER + HEIGHT_WAVE, borderLeft: '1px solid var(--m3-border)' }}>
              <span className="pl-1 type-label-sm whitespace-nowrap" style={{ ...mono, color: 'var(--on-surface-variant)', fontSize: 11 }}>{frameToTc(secToFrame(t, rate) + startTcFrame, rate)}</span>
            </div>
          ))}
          {visible.map((c) => {
            const p = preview?.id === c.id ? preview : null;
            const s = p ? p.s : c.startSec;
            const e = p ? p.e : c.endSec;
            const selected = c.id === selectedId;
            const flagged = issueIds?.has(c.id);
            return (
              <div key={c.id} data-testid="cue-block" className="absolute select-none touch-none overflow-hidden flex items-center"
                style={{
                  left: s * pxPerSec, width: Math.max(4, (e - s) * pxPerSec), top: HEIGHT_RULER + HEIGHT_WAVE + 4, height: HEIGHT_CUES,
                  borderRadius: 'var(--pj-radius-xs)',
                  background: selected ? 'var(--pj-grad-brand)' : 'var(--glass-4)',
                  border: `1px solid ${flagged ? 'var(--pj-warning)' : selected ? 'transparent' : 'var(--m3-border-strong)'}`,
                  cursor: 'grab',
                }}
                onPointerDown={(ev) => beginDrag(ev, c, 'move')}>
                <span className="absolute left-0 inset-y-0 w-2" style={{ cursor: 'ew-resize' }} onPointerDown={(ev) => beginDrag(ev, c, 'start')} />
                <span className="px-2 type-body-sm truncate pointer-events-none" style={{ color: 'var(--text-primary)' }}>{stripMarkup(c.text).replace(/\n/g, ' ')}</span>
                <span className="absolute right-0 inset-y-0 w-2" style={{ cursor: 'ew-resize' }} onPointerDown={(ev) => beginDrag(ev, c, 'end')} />
              </div>
            );
          })}
          <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: time * pxPerSec, width: 2, background: 'var(--pj-orange)' }} data-testid="playhead" />
        </div>
      </div>
    </div>
  );
};

export default CaptionTimeline;
