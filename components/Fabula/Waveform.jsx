// Waveform — professional, sample-accurate clip waveforms for the Fabula timeline.
//
// Replaces the old ~48 DOM <i> bars (abs-max only) with a canvas MIN/MAX peak envelope
// plus an RMS "body" — the way Resolve/Audition/Pro Tools draw clip audio. One decode per
// URL builds a compact peak PYRAMID (per-bucket min, max, rms over all channels); every clip
// that references the file reuses it. Drawing samples the pyramid across the clip's
// [srcIn, srcIn+duration] window at the canvas's true device-pixel width, so the envelope is
// accurate at any timeline zoom and re-renders instantly (no re-decode) when the clip resizes.

import { memo, useEffect, useRef } from "react";

// Pyramid bucket = 128 samples (~2.7ms @48k) — fine enough that a timeline pixel almost never
// covers less than one bucket, so the drawn envelope is effectively sample-accurate for a clip
// strip. (The dedicated AudioEditor is the per-sample zoom view.)
const BUCKET = 128;

const cache = new Map();   // url -> { min:Float32Array, max:Float32Array, rms:Float32Array, bps:number, dur:number } | null
const pending = new Map(); // url -> Promise

async function loadPeaks(url) {
  if (cache.has(url)) return cache.get(url);
  if (pending.has(url)) return pending.get(url);
  const p = (async () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const ab = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      try { ctx.close(); } catch { /* */ }
      const ch = ab.numberOfChannels;
      const len = ab.length;
      const nBuckets = Math.max(1, Math.ceil(len / BUCKET));
      const min = new Float32Array(nBuckets);
      const max = new Float32Array(nBuckets);
      const rms = new Float32Array(nBuckets);
      const chans = [];
      for (let c = 0; c < ch; c++) chans.push(ab.getChannelData(c));
      for (let b = 0; b < nBuckets; b++) {
        const s0 = b * BUCKET;
        const s1 = Math.min(len, s0 + BUCKET);
        let mn = 1, mx = -1, sq = 0, n = 0;
        for (let i = s0; i < s1; i++) {
          // average channels → one representative sample (true stereo sum feel without 2× memory)
          let v = 0;
          for (let c = 0; c < ch; c++) v += chans[c][i];
          v /= ch;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
          sq += v * v; n++;
        }
        min[b] = mn; max[b] = mx; rms[b] = n ? Math.sqrt(sq / n) : 0;
      }
      const v = { min, max, rms, bps: ab.sampleRate / BUCKET, dur: ab.duration };
      cache.set(url, v);
      return v;
    } catch { cache.set(url, null); return null; }
    finally { pending.delete(url); }
  })();
  pending.set(url, p);
  return p;
}

function draw(canvas, pk, srcIn, duration) {
  if (!canvas || !pk) return;
  const parent = canvas.parentElement;
  const cw = Math.max(1, Math.floor(canvas.clientWidth || parent?.clientWidth || 1));
  const chh = Math.max(1, Math.floor(canvas.clientHeight || parent?.clientHeight || 1));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(cw * dpr), H = Math.round(chh * dpr);
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, W, H);

  // window of the source this clip shows, in bucket units
  const b0 = Math.max(0, Math.floor((srcIn || 0) * pk.bps));
  const b1 = Math.min(pk.max.length, Math.ceil(((srcIn || 0) + (duration || pk.dur)) * pk.bps));
  const span = Math.max(1, b1 - b0);

  const mid = H / 2;
  const amp = mid * 0.94;
  const css = getComputedStyle(canvas);
  const peakCol = css.getPropertyValue("--wave-peak").trim() || "rgba(127,216,160,0.45)";
  const rmsCol = css.getPropertyValue("--wave-rms").trim() || "rgba(127,216,160,0.95)";

  // Pass 1 — min/max peak envelope (outer, translucent). One vertical extent per pixel column.
  g.fillStyle = peakCol;
  g.beginPath();
  // top edge (max) left→right
  for (let x = 0; x < W; x++) {
    const bs = b0 + Math.floor((x / W) * span);
    const be = b0 + Math.floor(((x + 1) / W) * span);
    let mx = -1;
    for (let b = bs; b < Math.max(bs + 1, be); b++) { if (b < pk.max.length && pk.max[b] > mx) mx = pk.max[b]; }
    const y = mid - mx * amp;
    if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  // bottom edge (min) right→left
  for (let x = W - 1; x >= 0; x--) {
    const bs = b0 + Math.floor((x / W) * span);
    const be = b0 + Math.floor(((x + 1) / W) * span);
    let mn = 1;
    for (let b = bs; b < Math.max(bs + 1, be); b++) { if (b < pk.min.length && pk.min[b] < mn) mn = pk.min[b]; }
    g.lineTo(x, mid - mn * amp);
  }
  g.closePath();
  g.fill();

  // Pass 2 — RMS body (inner, solid). Mirrors the RMS around the centre line.
  g.fillStyle = rmsCol;
  g.beginPath();
  for (let x = 0; x < W; x++) {
    const bs = b0 + Math.floor((x / W) * span);
    const be = b0 + Math.floor(((x + 1) / W) * span);
    let sq = 0, n = 0;
    for (let b = bs; b < Math.max(bs + 1, be); b++) { if (b < pk.rms.length) { sq += pk.rms[b] * pk.rms[b]; n++; } }
    const r = n ? Math.sqrt(sq / n) : 0;
    g.lineTo(x, mid - r * amp);
  }
  for (let x = W - 1; x >= 0; x--) {
    const bs = b0 + Math.floor((x / W) * span);
    const be = b0 + Math.floor(((x + 1) / W) * span);
    let sq = 0, n = 0;
    for (let b = bs; b < Math.max(bs + 1, be); b++) { if (b < pk.rms.length) { sq += pk.rms[b] * pk.rms[b]; n++; } }
    const r = n ? Math.sqrt(sq / n) : 0;
    g.lineTo(x, mid + r * amp);
  }
  g.closePath();
  g.fill();

  // faint centre line
  g.strokeStyle = "rgba(255,255,255,0.10)";
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, mid); g.lineTo(W, mid); g.stroke();
}

// memo: the editor re-renders every playback frame; props are stable per clip so the canvas
// only redraws when url/srcIn/duration change or the element resizes (timeline zoom).
function Waveform({ url, srcIn = 0, duration }) {
  const ref = useRef(null);
  const pkRef = useRef(null);

  useEffect(() => {
    let alive = true;
    pkRef.current = null;
    if (ref.current) { const g = ref.current.getContext("2d"); g && g.clearRect(0, 0, ref.current.width, ref.current.height); }
    if (!url) return undefined;
    loadPeaks(url).then((pk) => {
      if (!alive || !pk) return;
      pkRef.current = pk;
      draw(ref.current, pk, srcIn, duration);
    });
    return () => { alive = false; };
  }, [url, srcIn, duration]);

  // Redraw on resize (timeline zoom changes the clip's pixel width) without re-decoding.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => { if (pkRef.current) draw(el, pkRef.current, srcIn, duration); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [srcIn, duration]);

  return <canvas ref={ref} className="wave" />;
}

export default memo(Waveform);
