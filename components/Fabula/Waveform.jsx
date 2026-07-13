// Waveform — real audio peaks for a timeline clip (replaces the placeholder random bars). Decodes
// the asset once (cached per URL across all clips), then draws peak bars over the clip's
// [srcIn, srcIn+duration] window. Cheap to re-render; decode is async + cached.

import { memo, useEffect, useState } from "react";

const cache = new Map(); // url -> { data: Float32Array, dur } | null (null = failed)
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
      const v = { data: ab.getChannelData(0), dur: ab.duration };
      cache.set(url, v);
      return v;
    } catch { cache.set(url, null); return null; }
    finally { pending.delete(url); }
  })();
  pending.set(url, p);
  return p;
}

// memo: during playback the editor re-renders every frame — without memo each audio clip's
// bar field (up to 180 <i> nodes) re-diffed 24-30×/sec for nothing. Props are stable per clip.
function Waveform({ url, srcIn = 0, duration, bars = 48 }) {
  const [peaks, setPeaks] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!url) { setPeaks(null); return undefined; }
    loadPeaks(url).then((b) => {
      if (!alive || !b || !b.data.length) return;
      const sr = b.data.length / b.dur;
      const startS = Math.max(0, Math.floor((srcIn || 0) * sr));
      const endS = Math.min(b.data.length, Math.floor(((srcIn || 0) + (duration || b.dur)) * sr));
      const span = Math.max(1, endS - startS);
      const step = Math.max(1, Math.floor(span / bars));
      const out = [];
      for (let i = startS; i < endS; i += step) {
        let max = 0;
        for (let j = i; j < Math.min(i + step, endS); j++) { const a = Math.abs(b.data[j]); if (a > max) max = a; }
        out.push(max);
      }
      setPeaks(out);
    });
    return () => { alive = false; };
  }, [url, srcIn, duration, bars]);

  if (!peaks) return null;
  return (
    <div className="wave">
      {peaks.map((p, i) => <i key={i} style={{ height: Math.max(6, Math.min(100, p * 150)) + "%" }} />)}
    </div>
  );
}

export default memo(Waveform);
