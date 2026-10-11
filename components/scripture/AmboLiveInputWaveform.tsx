// AmboLiveInputWaveform — the room, as Ambo hears it.
//
// A narrow horizontal strip that only exists while Ambo is listening. It is
// deliberately NOT the playback waveform: playback is a static, pre-rendered
// picture of a file; this is a live scope — a mirrored mint ribbon on a dark
// grid that is born at the right-hand "now" edge and scrolls left.
//
// The live transcription rides on top of it: every word sits over the audio it
// came from, and action words light up in colour —
//   gold   a spoken reference (book + chapter / verse)
//   blue   a scripture cue ("turn to", "open your bibles")
//   rose   giving language ("tithes and offerings")
// — and the ribbon under them takes the same colour. When a trigger fires (a
// verse goes up, the giving graphic comes in) a marker drops onto the strip.

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  getAutoScriptureState, subscribeAutoScripture, getLiveAudio, getLiveFeed,
  type LiveWord, type LiveMarker,
} from '../../services/ambo/autoScripture';
import type { WordTag } from '../../services/ambo/speechIntents';

const MINT = '#2BE0A8';
const OPERATOR = '#B9A6FF';
export const TAG_COLOR: Record<WordTag, string> = { scripture: '#E3C57E', cue: '#7FB2FF', giving: '#FF6FAE' };
const MARKER_COLOR = { scripture: '#E3C57E', giving: '#FF6FAE' } as const;

const COL_MS = 32;                 // one ribbon column per ~2 px
const KEEP_MS = 40_000;

interface Col { t: number; v: number; op: number; }

interface Props {
  height?: number;
  /** Lay the live transcript over the waveform. */
  showWords?: boolean;
  /** Tiny meter-sized strip (no words, no markers) for a toolbar button. */
  compact?: boolean;
  className?: string;
}

/** 0..1 loudness of an analyser frame, perceptually compressed. */
function analyserValue(an: AnalyserNode, buf: Float32Array): number {
  (an.getFloatTimeDomainData as (b: Float32Array) => void).call(an, buf);
  let sum = 0, peak = 0;
  for (let i = 0; i < buf.length; i++) { const s = buf[i]; sum += s * s; const a = s < 0 ? -s : s; if (a > peak) peak = a; }
  const rms = Math.sqrt(sum / buf.length);
  return Math.min(1, Math.pow(rms * 4.5 + peak * 0.6, 0.72));
}

const AmboLiveInputWaveform: React.FC<Props> = ({ height = 46, showWords = true, compact = false, className = '' }) => {
  const state = useSyncExternalStore(subscribeAutoScripture, getAutoScriptureState);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = state.running || state.starting;

  useEffect(() => {
    if (!live) return;
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = height, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(40, wrap.clientWidth);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrap);

    const speed = compact ? 0.035 : 0.062;          // px per ms (~62 px/s)
    const cols: Col[] = [];
    let acc = 0, accOp = 0, accStart = performance.now();
    let roomSmooth = 0, opSmooth = 0;
    const bufs = new WeakMap<AnalyserNode, Float32Array>();
    const widths = new Map<number, number>();
    const fontMain = `700 ${compact ? 9 : 11}px Inter, ui-sans-serif, system-ui, sans-serif`;
    const fontOp = '600 9.5px Inter, ui-sans-serif, system-ui, sans-serif';
    // Feed timestamps are Date.now(); the ribbon runs on performance.now(). One offset joins them.
    const clockOffset = () => Date.now() - performance.now();

    const read = (tap: { level: number; analyser: AnalyserNode | null }, smooth: number) => {
      let v = 0;
      if (tap.analyser) {
        let b = bufs.get(tap.analyser);
        if (!b) { b = new Float32Array(tap.analyser.fftSize); bufs.set(tap.analyser, b); }
        try { v = analyserValue(tap.analyser, b); } catch { v = 0; }
      }
      // Native engines only report a level; it also covers a suspended AudioContext.
      const lv = Math.min(1, Math.pow(tap.level, 0.8));
      const next = smooth + (Math.max(v, lv * 0.9) - smooth) * 0.45;
      return tap.analyser ? Math.max(v, next * 0.6) : next * (0.78 + Math.random() * 0.22);
    };

    const tagAt = (t: number, words: LiveWord[]): WordTag | null => {
      // newest first: a fresh tag wins over an old one at the same moment
      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i];
        if (w.at + 60 < t) break;
        if (w.tag && w.channel === 'room' && t >= w.at - 280) return w.tag;
      }
      return null;
    };

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const { room, operator } = getLiveAudio();
      roomSmooth = read(room, roomSmooth);
      const opLive = !!operator.analyser || operator.level > 0;
      opSmooth = opLive ? read(operator, opSmooth) : 0;
      acc = Math.max(acc, roomSmooth); accOp = Math.max(accOp, opSmooth);
      if (now - accStart >= COL_MS) {
        cols.push({ t: now, v: acc, op: accOp });
        acc = 0; accOp = 0; accStart = now;
        const oldest = now - Math.max(KEEP_MS, W / speed + 500);
        while (cols.length && cols[0].t < oldest) cols.shift();
      }

      const feed = getLiveFeed();
      const off = clockOffset();
      const words = feed.words;
      const hasOpLane = !compact && (opLive || words.some(w => w.channel === 'operator'));
      const laneH = hasOpLane ? H * 0.68 : H;
      const mid = laneH / 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // ── ground: dark scope glass, a centre line, a moving one-second grid ──
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#04110d'); g.addColorStop(1, '#071a14');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const lastMarker = feed.markers[feed.markers.length - 1];
      if (lastMarker) {
        const age = Date.now() - lastMarker.at;
        if (age < 900) { ctx.fillStyle = hexA(MARKER_COLOR[lastMarker.kind], 0.22 * (1 - age / 900)); ctx.fillRect(0, 0, W, H); }
      }
      ctx.strokeStyle = 'rgba(43,224,168,0.10)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, mid + 0.5); ctx.lineTo(W, mid + 0.5); ctx.stroke();
      if (!compact) {
        ctx.strokeStyle = 'rgba(43,224,168,0.06)';
        const sec = 1000 * speed;
        const phase = (now % 1000) * speed;
        ctx.beginPath();
        for (let x = W - phase; x > 0; x -= sec) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
        ctx.stroke();
      }

      // ── ribbon ──
      const barW = compact ? 1.5 : 2;
      for (let i = cols.length - 1; i >= 0; i--) {
        const c = cols[i];
        const x = W - (now - c.t) * speed - barW;
        if (x < -barW) break;
        const fade = 0.28 + 0.72 * Math.max(0, Math.min(1, x / W));
        const tag = compact ? null : tagAt(c.t + off, words);
        const amp = Math.max(0.6, c.v * (mid - 2));
        if (tag) {
          ctx.fillStyle = hexA(TAG_COLOR[tag], 0.28 * fade);
          ctx.fillRect(x - 1, mid - amp - 2, barW + 2, amp * 2 + 4);
          ctx.fillStyle = hexA(TAG_COLOR[tag], Math.min(1, fade + 0.15));
        } else {
          ctx.fillStyle = hexA(MINT, fade * (0.55 + c.v * 0.45));
        }
        ctx.fillRect(x, mid - amp, barW, amp * 2);
        if (hasOpLane) {
          const oh = (H - laneH) / 2 - 1, oy = laneH + (H - laneH) / 2;
          const oa = Math.max(0.4, c.op * oh);
          ctx.fillStyle = hexA(OPERATOR, fade * 0.7);
          ctx.fillRect(x, oy - oa, barW, oa * 2);
        }
      }
      if (hasOpLane) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, laneH, W, 1);
      }

      // ── trigger markers ──
      if (!compact) {
        ctx.font = '800 9px Inter, ui-sans-serif, system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        for (const m of feed.markers as LiveMarker[]) {
          const x = W - (now - (m.at - off)) * speed;
          if (x < -120 || x > W + 4) continue;
          const col = MARKER_COLOR[m.kind];
          ctx.fillStyle = hexA(col, m.ok ? 0.9 : 0.45);
          ctx.fillRect(Math.round(x), 0, 1.5, H);
          const label = `${m.kind === 'giving' ? '♥' : '▶'} ${m.label}${m.ok ? '' : ' ✕'}`;
          const tw = ctx.measureText(label).width + 8;
          const lx = Math.max(2, x - tw - 2);
          ctx.fillStyle = hexA(col, m.ok ? 0.95 : 0.5);
          roundRect(lx, 2, tw, 12, 3); ctx.fill();
          ctx.fillStyle = '#140f04';
          ctx.fillText(label, lx + 4, 8.5);
        }
      }

      // ── words over their audio, newest pinned at the edge, older pushed left ──
      if (showWords && !compact && words.length) {
        const lanes: Array<{ ch: 'room' | 'operator'; y: number; font: string }> = [{ ch: 'room', y: mid, font: fontMain }];
        if (hasOpLane) lanes.push({ ch: 'operator', y: laneH + (H - laneH) / 2, font: fontOp });
        for (const lane of lanes) {
          ctx.font = lane.font; ctx.textBaseline = 'middle';
          let nextLeft = W - 6;
          for (let i = words.length - 1; i >= 0; i--) {
            const w = words[i];
            if (w.channel !== lane.ch) continue;
            let tw = widths.get(w.id);
            if (tw === undefined) { tw = ctx.measureText(w.text).width; widths.set(w.id, tw); }
            const pad = w.tag ? 4 : 0;
            const ideal = W - (now - (w.at - off)) * speed - tw / 2;
            const x = Math.min(ideal, nextLeft - tw - pad);
            if (x + tw < 0) break;
            nextLeft = x - pad - 4;
            const a = Math.max(0, Math.min(1, (x + tw) / (W * 0.35)));
            if (a <= 0) continue;
            ctx.globalAlpha = a;
            if (w.tag) {
              const col = TAG_COLOR[w.tag];
              roundRect(x - pad, lane.y - 7.5, tw + pad * 2, 15, 4);
              ctx.fillStyle = col; ctx.fill();
              ctx.fillStyle = '#120d02';
              ctx.fillText(w.text, x, lane.y + 0.5);
            } else {
              ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,10,8,0.85)'; ctx.lineJoin = 'round';
              ctx.strokeText(w.text, x, lane.y + 0.5);
              ctx.fillStyle = lane.ch === 'operator' ? OPERATOR : 'rgba(240,255,250,0.92)';
              ctx.fillText(w.text, x, lane.y + 0.5);
            }
            ctx.globalAlpha = 1;
          }
        }
        if (widths.size > 400) { const keep = new Set(words.map(w => w.id)); for (const k of widths.keys()) if (!keep.has(k)) widths.delete(k); }
      }

      // ── the "now" edge ──
      const pulse = 0.55 + 0.45 * Math.sin(now / 260);
      ctx.fillStyle = hexA(MINT, 0.35 * pulse); ctx.fillRect(W - 6, 0, 6, H);
      ctx.fillStyle = MINT; ctx.fillRect(W - 1.5, 0, 1.5, H);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [live, height, showWords, compact]);

  if (!live) return null;

  const hearing = state.hearingGiving ? 'giving' : state.hearing ? 'scripture' : null;
  const ring = hearing ? TAG_COLOR[hearing] : 'rgba(43,224,168,0.35)';

  if (compact) {
    return (
      <div ref={wrapRef} className={`relative overflow-hidden rounded-sm ${className}`} style={{ height, boxShadow: `inset 0 0 0 1px ${ring}` }}>
        <canvas ref={canvasRef} className="block" />
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`relative overflow-hidden rounded-md transition-shadow ${className}`}
      style={{ height, boxShadow: hearing ? `0 0 0 1px ${ring}, 0 0 14px ${hexA(ring, 0.45)}` : `0 0 0 1px ${ring}` }}
      title="Live input — what Ambo is hearing right now">
      <canvas ref={canvasRef} className="block" />
      <span className="absolute left-1.5 top-1 inline-flex items-center gap-1 px-1.5 py-[1px] rounded-sm text-[8px] font-black tracking-[0.14em] pointer-events-none"
        style={{ background: 'rgba(4,17,13,0.82)', color: MINT, border: '1px solid rgba(43,224,168,0.35)' }}>
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: state.running ? '#FF4D4D' : '#888' }} />
        {state.starting ? 'STARTING' : 'LIVE IN'}
      </span>
      {hearing && (
        <span className="absolute left-1.5 bottom-1 px-1.5 py-[1px] rounded-sm text-[9px] font-extrabold pointer-events-none"
          style={{ background: TAG_COLOR[hearing], color: '#120d02' }}>
          {hearing === 'giving' ? '♥ Giving cue heard…' : `Hearing ${state.hearing?.label}…`}
        </span>
      )}
    </div>
  );
};

/** '#RRGGBB' (or an rgba string, returned as is) at an alpha. */
function hexA(col: string, a: number): string {
  if (!col.startsWith('#') || col.length !== 7) return col;
  const n = parseInt(col.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

export default AmboLiveInputWaveform;
