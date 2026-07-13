// AudioEditor — Sound Forge-style, fully NON-DESTRUCTIVE clip audio editor for the audio page.
// Draws the clip's waveform, lets you set cleanup (high-pass / low-pass / hum-notch / trim / denoise /
// normalize) and hear it live through the SAME DSP engine the timeline uses. Nothing is baked into the
// media — every control writes clip.audio.clean, which AudioLayer (live) and fabulaRender (export) read.
// Works on a standalone audio clip OR the linked audio of a video clip (both carry clip.audio).
import React, { useEffect, useRef, useState, useCallback } from "react";
import { X, Play, Pause, Wand2, RotateCcw, Volume2 } from "lucide-react";
import { attachAudioGraph, resumeAudioCtx, getAudioCtx, CLEAN_DEFAULT } from "../../services/fabula/audioGraph";

const H = 128;

export default function AudioEditor({ clip, url, blob, clipAudio, onChange, onClose }) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const graphRef = useRef(undefined);
  const rafRef = useRef(0);
  const [peaks, setPeaks] = useState(null);
  const [dur, setDur] = useState(clip?.duration || 0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const clean = { ...CLEAN_DEFAULT, ...(clipAudio?.clean || {}) };

  // decode → peak envelope (downsampled min/max per pixel column)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const bytes = blob ? await blob.arrayBuffer() : await (await fetch(url)).arrayBuffer();
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const ab = await ac.decodeAudioData(bytes.slice(0));
        ac.close();
        if (!alive) return;
        setDur(ab.duration);
        const W = 900, ch = ab.getChannelData(0), step = Math.max(1, Math.floor(ch.length / W));
        const p = new Float32Array(W);
        for (let x = 0; x < W; x++) {
          let peak = 0; const s = x * step, e = Math.min(ch.length, s + step);
          for (let i = s; i < e; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
          p[x] = peak;
        }
        setPeaks(p);
      } catch { if (alive) setPeaks(new Float32Array(0)); }
    })();
    return () => { alive = false; };
  }, [url, blob]);

  // draw waveform + playhead
  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !peaks) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 900;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d"); g.scale(dpr, dpr);
    g.clearRect(0, 0, W, H);
    // hum-cut / band shading hint
    g.fillStyle = "rgba(255,255,255,0.02)"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,0.08)"; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    const n = peaks.length || 1, cw = W / n;
    for (let x = 0; x < n; x++) {
      const h = Math.max(1, peaks[x] * (H / 2 - 4));
      const grad = g.createLinearGradient(0, H / 2 - h, 0, H / 2 + h);
      grad.addColorStop(0, "#ffb45a"); grad.addColorStop(0.5, "#f97316"); grad.addColorStop(1, "#ffb45a");
      g.fillStyle = grad; g.fillRect(x * cw, H / 2 - h, Math.max(1, cw - 0.4), h * 2);
    }
    if (dur > 0) { const px = (pos / dur) * W; g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke(); }
  }, [peaks, pos, dur]);

  const applyLive = useCallback((nextClean) => {
    const a = audioRef.current; if (!a) return;
    resumeAudioCtx();
    const ctx = getAudioCtx();
    if (ctx && ctx.state === "running" && graphRef.current === undefined) graphRef.current = attachAudioGraph(a);
    const g = graphRef.current;
    if (g) g.apply({ vol: clipAudio?.vol ?? 1, eq: clipAudio?.eq || [], comp: clipAudio?.comp || { on: false }, clean: nextClean }, { vol: 1 });
  }, [clipAudio]);

  const set = (patch) => { const next = { ...clean, ...patch }; onChange(next); applyLive(next); };

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) { resumeAudioCtx(); applyLive(clean); a.play().catch(() => {}); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };
  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    const tick = () => { setPos(a.currentTime); rafRef.current = requestAnimationFrame(tick); };
    if (playing) rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  const seek = (e) => {
    const a = audioRef.current, cv = canvasRef.current; if (!a || !cv || !dur) return;
    const r = cv.getBoundingClientRect(); const t = ((e.clientX - r.left) / r.width) * dur;
    a.currentTime = Math.max(0, Math.min(dur, t)); setPos(a.currentTime);
  };

  const Row = ({ label, children, hint }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
      <div style={{ width: 108, fontSize: 11, fontWeight: 700, color: "#cfcfd6", letterSpacing: 0.3 }}>{label}
        {hint && <div style={{ fontSize: 9, fontWeight: 500, color: "#8a8a92" }}>{hint}</div>}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>{children}</div>
    </div>
  );
  const num = (v, s) => <span style={{ width: 52, textAlign: "right", fontSize: 11, color: "#f97316", fontVariantNumeric: "tabular-nums" }}>{v}{s}</span>;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-dark" style={{ width: 960, maxWidth: "95vw", maxHeight: "92vh", overflow: "auto", borderRadius: 14, padding: 18, border: "1px solid rgba(255,140,0,0.28)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div className="paneltitle" style={{ margin: 0 }}>🎚 AUDIO EDITOR — {clip?.label || "clip"}
            <span className="dim small" style={{ marginLeft: 8, letterSpacing: 0 }}>non-destructive · nothing baked into the media</span></div>
          <button className="minibtn" onClick={onClose}><X size={13} /></button>
        </div>

        <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.35)" }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: H, display: "block", cursor: "text" }} onClick={seek} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <button className="minibtn" onClick={toggle} style={{ width: 40 }}>{playing ? <Pause size={13} /> : <Play size={13} />}</button>
          <span className="dim small" style={{ fontVariantNumeric: "tabular-nums" }}>{pos.toFixed(2)}s / {dur.toFixed(2)}s</span>
          <div style={{ flex: 1 }} />
          <button className="minibtn" onClick={() => set({ ...CLEAN_DEFAULT })} title="Reset all cleanup"><RotateCcw size={12} /> RESET</button>
          <button className="minibtn" onClick={() => set({ hpf: 90, hum: 60, denoise: 0.4, trim: clean.trim })} title="Dialogue cleanup: rumble HPF + 60Hz hum + gentle denoise"><Wand2 size={12} /> VOICE CLEANUP</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 14 }}>
          <div>
            <div className="lbl">CLEAN-UP FILTERS <span className="dim small" style={{ letterSpacing: 0 }}>· live</span></div>
            <Row label="High-pass" hint="cut rumble / low hum">
              <input type="range" min={0} max={400} step={5} value={clean.hpf} onChange={(e) => set({ hpf: +e.target.value })} style={{ flex: 1 }} />
              {num(clean.hpf === 0 ? "off" : clean.hpf, clean.hpf === 0 ? "" : "Hz")}
            </Row>
            <Row label="Low-pass" hint="tame hiss / sibilance">
              <input type="range" min={0} max={22000} step={250} value={clean.lpf} onChange={(e) => set({ lpf: +e.target.value })} style={{ flex: 1 }} />
              {num(clean.lpf === 0 ? "off" : (clean.lpf / 1000).toFixed(1), clean.lpf === 0 ? "" : "k")}
            </Row>
            <Row label="Hum notch" hint="mains buzz">
              <div style={{ display: "flex", gap: 6 }}>
                {[0, 50, 60].map((h) => (
                  <button key={h} className="minibtn" onClick={() => set({ hum: h })}
                    style={{ background: clean.hum === h ? "#f97316" : undefined, color: clean.hum === h ? "#1a1200" : undefined }}>
                    {h === 0 ? "OFF" : h + "Hz"}
                  </button>
                ))}
              </div>
            </Row>
          </div>
          <div>
            <div className="lbl">LEVEL &amp; NOISE</div>
            <Row label="Trim gain" hint="live make-up / cut">
              <input type="range" min={-24} max={24} step={0.5} value={clean.trim} onChange={(e) => set({ trim: +e.target.value })} style={{ flex: 1 }} />
              {num(clean.trim > 0 ? "+" + clean.trim : clean.trim, "dB")}
            </Row>
            <Row label="Denoise" hint="spectral gate · applied on render">
              <input type="range" min={0} max={1} step={0.05} value={clean.denoise} onChange={(e) => set({ denoise: +e.target.value })} style={{ flex: 1 }} />
              {num(Math.round(clean.denoise * 100), "%")}
            </Row>
            <Row label="Normalize" hint="peak to −1 dBFS · on render">
              <button className="minibtn" onClick={() => set({ normalize: !clean.normalize })}
                style={{ background: clean.normalize ? "#f97316" : undefined, color: clean.normalize ? "#1a1200" : undefined }}>
                <Volume2 size={12} /> {clean.normalize ? "ON" : "OFF"}
              </button>
            </Row>
          </div>
        </div>
        <div className="dim small" style={{ marginTop: 12, lineHeight: 1.5 }}>
          Filters &amp; trim preview live above and in the timeline. Denoise (spectral gate) and Normalize are look-ahead
          processes applied cleanly at export. For true stem separation, right-click the clip → <strong>Separate stems</strong>.
        </div>

        <audio ref={audioRef} src={url} preload="auto" crossOrigin="anonymous"
          onEnded={() => setPlaying(false)} style={{ display: "none" }} />
      </div>
    </div>
  );
}
