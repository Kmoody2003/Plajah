// ColorScopes — Resolve-style video scopes for the Fabula color page.
// Samples the program monitor's active video element ~8×/sec into a small buffer and draws:
//   WAVEFORM (luma), RGB PARADE, VECTORSCOPE (Cb/Cr with skin-tone line), HISTOGRAM (RGB).
// Pure canvas math — no deps, no engine changes, and it can never affect the render output.

import { memo, useEffect, useRef } from "react";

const SW = 160, SH = 90; // sample size — plenty for scopes, cheap to read back

function drawScopes(px, canvases) {
  const { wave, parade, vector, histo } = canvases;
  const n = SW * SH;

  // WAVEFORM + PARADE ------------------------------------------------------
  const setup = (c) => { const g = c.getContext("2d"); g.fillStyle = "#0b0b10"; g.fillRect(0, 0, c.width, c.height); return g; };
  if (wave) {
    const g = setup(wave); const W = wave.width, H = wave.height;
    g.fillStyle = "rgba(120,220,150,0.5)";
    for (let x = 0; x < SW; x++) {
      const cx = (x / SW) * W;
      for (let y = 0; y < SH; y++) {
        const i = (y * SW + x) * 4;
        const luma = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        g.fillRect(cx, H - (luma / 255) * H, 1.2, 1.2);
      }
    }
    g.strokeStyle = "rgba(255,255,255,0.15)";
    for (const f of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(0, H * f); g.lineTo(W, H * f); g.stroke(); }
  }
  if (parade) {
    const g = setup(parade); const W = parade.width, H = parade.height, third = W / 3;
    const cols = [[255, 90, 90], [110, 235, 130], [110, 160, 255]];
    for (let ch = 0; ch < 3; ch++) {
      g.fillStyle = `rgba(${cols[ch][0]},${cols[ch][1]},${cols[ch][2]},0.45)`;
      for (let x = 0; x < SW; x++) {
        const cx = ch * third + (x / SW) * third;
        for (let y = 0; y < SH; y++) {
          const v = px[(y * SW + x) * 4 + ch];
          g.fillRect(cx, H - (v / 255) * H, 1, 1);
        }
      }
    }
  }

  // VECTORSCOPE ------------------------------------------------------------
  if (vector) {
    const g = setup(vector); const W = vector.width, H = vector.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 4;
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, R * 0.5, 0, Math.PI * 2); g.stroke();
    // skin-tone line (~33° up-left in Cb/Cr space)
    g.strokeStyle = "rgba(255,170,120,0.5)";
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * Math.cos(-2.53), cy + R * Math.sin(-2.53)); g.stroke();
    g.fillStyle = "rgba(170,220,255,0.5)";
    for (let i = 0; i < n * 4; i += 16) { // sample every 4th pixel
      const r = px[i], gr = px[i + 1], b = px[i + 2];
      const cb = (-0.1687 * r - 0.3313 * gr + 0.5 * b) / 127;      // -1..1
      const cr = (0.5 * r - 0.4187 * gr - 0.0813 * b) / 127;
      g.fillRect(cx + cb * R, cy - cr * R, 1.2, 1.2);
    }
    // graticule targets R/G/B/Y/Mg/Cy
    g.fillStyle = "rgba(255,255,255,0.5)"; g.font = "8px monospace";
    const targets = [["R", 0.32, -0.42], ["G", -0.42, 0.15], ["B", 0.42, 0.28], ["Y", -0.1, -0.55], ["Mg", 0.5, -0.15], ["Cy", -0.5, 0.1]];
    for (const [lbl, tb, tr2] of targets) g.fillText(lbl, cx + tb * R * 1.6 - 3, cy - tr2 * R * 1.6 + 3);
  }

  // HISTOGRAM ---------------------------------------------------------------
  if (histo) {
    const g = setup(histo); const W = histo.width, H = histo.height;
    const bins = [new Uint32Array(64), new Uint32Array(64), new Uint32Array(64)];
    for (let i = 0; i < n * 4; i += 4) { bins[0][px[i] >> 2]++; bins[1][px[i + 1] >> 2]++; bins[2][px[i + 2] >> 2]++; }
    let max = 1; for (const b of bins) for (const v of b) if (v > max) max = v;
    const cols = ["rgba(255,90,90,0.55)", "rgba(110,235,130,0.55)", "rgba(110,160,255,0.55)"];
    const bw = W / 64;
    for (let ch = 0; ch < 3; ch++) {
      g.fillStyle = cols[ch];
      for (let b = 0; b < 64; b++) { const h = (bins[ch][b] / max) * (H - 2); g.fillRect(b * bw, H - h, bw - 0.5, h); }
    }
  }
}

/** Live scopes fed by the program monitor's <video> (or any drawable element ref). */
function ColorScopes({ sourceRef }) {
  const waveRef = useRef(null), paradeRef = useRef(null), vectorRef = useRef(null), histoRef = useRef(null);
  const bufRef = useRef(null);
  useEffect(() => {
    let raf; let last = 0;
    if (!bufRef.current) { const c = document.createElement("canvas"); c.width = SW; c.height = SH; bufRef.current = c; }
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 125) return; // ~8 fps — plenty for scopes, negligible cost
      last = now;
      const src = sourceRef?.current;
      if (!src || (src.readyState != null && src.readyState < 2)) return;
      try {
        const g = bufRef.current.getContext("2d", { willReadFrequently: true });
        g.drawImage(src, 0, 0, SW, SH);
        const px = g.getImageData(0, 0, SW, SH).data;
        drawScopes(px, { wave: waveRef.current, parade: paradeRef.current, vector: vectorRef.current, histo: histoRef.current });
      } catch { /* CORS-tainted or mid-load — skip this sample */ }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sourceRef]);
  const box = { background: "#0b0b10", borderRadius: 8, width: "100%", display: "block", border: "1px solid rgba(255,255,255,0.08)" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <div><div className="lbl">WAVEFORM</div><canvas ref={waveRef} width={220} height={130} style={box} /></div>
      <div><div className="lbl">RGB PARADE</div><canvas ref={paradeRef} width={220} height={130} style={box} /></div>
      <div><div className="lbl">VECTORSCOPE</div><canvas ref={vectorRef} width={220} height={130} style={box} /></div>
      <div><div className="lbl">HISTOGRAM</div><canvas ref={histoRef} width={220} height={130} style={box} /></div>
    </div>
  );
}

export default memo(ColorScopes);
