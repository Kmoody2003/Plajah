// VoiceStudio — the audio-page production toolkit: TEXT-TO-VOICE (MAI Voice 2 / Azure Neural TTS
// → placeable clips), VOICEOVER + ADR recording (mic capture; ADR loops picture while you perform
// to it), and a synthesized SOUND-FX / sound-design palette. Everything lands as an audio clip in
// the media pool (and optionally straight onto a track at the playhead), so it flows through the
// same mixer + render as any other audio.

import { useEffect, useRef, useState } from "react";
import { MAI_VOICES, synthesizeNarration, getMicrosoftAIConfig } from "../../services/microsoftAIService";

// AudioBuffer → 16-bit PCM WAV blob (for synthesized SFX; universally decodable).
function bufferToWav(buf) {
  const nCh = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const out = new ArrayBuffer(44 + len * nCh * 2), dv = new DataView(out);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); dv.setUint32(4, 36 + len * nCh * 2, true); ws(8, "WAVE"); ws(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nCh, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * nCh * 2, true); dv.setUint16(32, nCh * 2, true);
  dv.setUint16(34, 16, true); ws(36, "data"); dv.setUint32(40, len * nCh * 2, true);
  let off = 44;
  for (let i = 0; i < len; i++) for (let ch = 0; ch < nCh; ch++) {
    const s = Math.max(-1, Math.min(1, buf.getChannelData(ch)[i]));
    dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
  }
  return new Blob([out], { type: "audio/wav" });
}

// Procedural sound-design generators — each returns a rendered AudioBuffer.
const SFX = [
  { id: "whoosh", name: "Whoosh", dur: 0.8, build: (ctx, t) => { const n = noise(ctx, 0.8); const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(4000, t + 0.4); f.frequency.exponentialRampToValueAtTime(300, t + 0.8); f.Q.value = 1.5; const g = env(ctx, t, 0.8, 0.05, 0.5); n.connect(f); f.connect(g); return g; } },
  { id: "impact", name: "Impact", dur: 0.6, build: (ctx, t) => { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.5); const n = noise(ctx, 0.1); const g = env(ctx, t, 0.6, 0.001, 0.5); o.connect(g); n.connect(g); o.start(t); o.stop(t + 0.6); return g; } },
  { id: "riser", name: "Riser", dur: 1.5, build: (ctx, t) => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(2000, t + 1.5); const g = env(ctx, t, 1.5, 1.4, 0.1); o.connect(g); o.start(t); o.stop(t + 1.5); return g; } },
  { id: "boom", name: "Sub Boom", dur: 1.0, build: (ctx, t) => { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.9); const g = env(ctx, t, 1.0, 0.002, 0.8); o.connect(g); o.start(t); o.stop(t + 1.0); return g; } },
  { id: "click", name: "UI Click", dur: 0.12, build: (ctx, t) => { const o = ctx.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(1200, t); const g = env(ctx, t, 0.12, 0.001, 0.08); o.connect(g); o.start(t); o.stop(t + 0.12); return g; } },
  { id: "sparkle", name: "Sparkle", dur: 0.9, build: (ctx, t) => { const g = ctx.createGain(); g.gain.value = 0; for (let i = 0; i < 6; i++) { const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 900 + i * 500; const e = env(ctx, t + i * 0.06, 0.3, 0.005, 0.25); o.connect(e); e.connect(g); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.3); } g.gain.value = 1; return g; } },
];
function noise(ctx, dur) { const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = ctx.createBufferSource(); s.buffer = b; s.start(0); return s; }
function env(ctx, t, dur, atk, rel) { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + atk); g.gain.setValueAtTime(0.9, t + dur - rel); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); return g; }
async function renderSfx(spec) {
  const ctx = new OfflineAudioContext(1, Math.ceil(48000 * (spec.dur + 0.05)), 48000);
  const out = spec.build(ctx, 0); out.connect(ctx.destination);
  const buf = await ctx.startRendering();
  return bufferToWav(buf);
}

export default function VoiceStudio({ audioTracks, playhead, setPlayhead, setPlaying, onPlaceClip, ping }) {
  const [tab, setTab] = useState("tts");
  const cfg = getMicrosoftAIConfig();
  // TTS
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState(MAI_VOICES[0]?.id || "");
  const [rate, setRate] = useState(1);
  const [busy, setBusy] = useState(false);
  const [track, setTrack] = useState(audioTracks[0]?.id || "a1");
  useEffect(() => { if (!audioTracks.find((t) => t.id === track) && audioTracks[0]) setTrack(audioTracks[0].id); }, [audioTracks, track]);

  const generateTTS = async () => {
    if (!text.trim() || busy) return;
    if (!cfg.voiceReady) { window.speechSynthesis?.speak(new SpeechSynthesisUtterance(text)); ping?.("Spoke a preview — set VITE_AZURE_SPEECH_KEY to place TTS clips on the timeline."); return; }
    setBusy(true);
    try {
      const { audioBlob } = await synthesizeNarration({ text: text.trim(), voiceId, rate });
      onPlaceClip(audioBlob, (text.trim().slice(0, 28) || "VO"), { trackId: track, at: playhead });
      ping?.("🎙 Voice clip placed at the playhead");
    } catch (e) { ping?.("TTS failed — " + (e?.message || "check the speech key")); }
    setBusy(false);
  };

  // VOICEOVER / ADR record
  const recRef = useRef(null); const micRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
  const stopRec = () => { try { recRef.current?.state !== "inactive" && recRef.current?.stop(); } catch { /* */ } };
  useEffect(() => () => { stopRec(); try { micRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* */ } }, []);

  const startRecord = async (adr) => {
    if (recording) { stopRec(); return; }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      micRef.current = mic;
      const startAt = playhead;
      if (adr) { // 3-2-1 count-in, then roll picture from the playhead so you perform to it
        for (let n = 3; n >= 1; n--) { setCount(n); await new Promise((r) => setTimeout(r, 700)); }
        setCount(0); setPlaying?.(true);
      }
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const mr = new MediaRecorder(mic, { mimeType: mime, audioBitsPerSecond: 256000 });
      const chunks = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        setRecording(false); setPlaying?.(false);
        try { mic.getTracks().forEach((t) => t.stop()); } catch { /* */ }
        const blob = new Blob(chunks, { type: "audio/webm" });
        if (blob.size > 1000) { onPlaceClip(blob, adr ? "ADR take" : "VO take", { trackId: track, at: startAt }); ping?.(adr ? "🎬 ADR take placed" : "🎙 Voiceover placed"); }
      };
      mr.start(); recRef.current = mr; setRecording(true);
    } catch (e) { ping?.("Mic unavailable — " + (e?.message || "permission denied")); }
  };

  const placeSfx = async (spec) => {
    try { const blob = await renderSfx(spec); onPlaceClip(blob, spec.name, { trackId: track, at: playhead }); ping?.(`🔊 ${spec.name} placed at the playhead`); }
    catch (e) { ping?.("SFX render failed — " + (e?.message || e)); }
  };

  return (
    <div className="fxstudio glass-dark">
      <div className="paneltitle">🎙 VOICE &amp; SOUND STUDIO
        <span className="dim small" style={{ marginLeft: 8, letterSpacing: 0 }}>text-to-voice · voiceover · ADR · sound design</span>
      </div>
      <div className="fxtabs" style={{ maxWidth: 360 }}>
        {[["tts", "TEXT-TO-VOICE"], ["vo", "VO / ADR"], ["sfx", "SOUND FX"]].map(([id, l]) => (
          <button key={id} className={`fxtab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>
      <div className="insp-row" style={{ marginBottom: 8 }}>
        <span className="lbl">TO TRACK</span>
        <select className="sel grow" value={track} onChange={(e) => setTrack(e.target.value)}>
          {audioTracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="dim small">placed at playhead {playhead != null ? playhead.toFixed(1) + "s" : ""}</span>
      </div>

      {tab === "tts" && (
        <>
          <textarea className="in" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type the line to speak… (narration, character VO, temp dialogue)" />
          <div className="insp-row" style={{ marginTop: 6 }}>
            <span className="lbl">VOICE</span>
            <select className="sel grow" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              {MAI_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name || v.id}</option>)}
            </select>
            <span className="lbl" style={{ marginLeft: 8 }}>RATE</span>
            <input type="range" min="0.6" max="1.6" step="0.05" value={rate} onChange={(e) => setRate(parseFloat(e.target.value))} />
          </div>
          <div className="btnrow" style={{ marginTop: 8 }}>
            <button className="cta sm" disabled={busy || !text.trim()} onClick={generateTTS}>{busy ? "SYNTHESIZING…" : cfg.voiceReady ? "🎙 GENERATE + PLACE" : "🔈 SPEAK PREVIEW"}</button>
          </div>
          {!cfg.voiceReady && <div className="dim small" style={{ marginTop: 6 }}>Placeable TTS clips need a speech key (VITE_AZURE_SPEECH_KEY / MAI Voice 2). Without it, GENERATE previews aloud in your browser.</div>}
        </>
      )}

      {tab === "vo" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {count > 0 && <div style={{ fontSize: 40, fontWeight: 900, color: "#FF8C00", width: 60, textAlign: "center" }}>{count}</div>}
          <button className="cta sm" style={recording ? { background: "#e5484d" } : undefined} onClick={() => startRecord(false)}>{recording ? "■ STOP" : "● VOICEOVER"}</button>
          <button className="cta sm" style={recording ? { background: "#e5484d" } : undefined} onClick={() => startRecord(true)} title="Count-in, then picture rolls while you perform to it">{recording ? "■ STOP" : "🎬 ADR (to picture)"}</button>
          <span className="dim small">Records your mic to the selected track. ADR counts you in (3-2-1) then plays the video from the playhead so you can lip-sync. Raw mic (no auto-gain) for clean captures.</span>
        </div>
      )}

      {tab === "sfx" && (
        <div className="fxgrid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          {SFX.map((s) => (
            <button key={s.id} className="fxcard" onClick={() => placeSfx(s)} title={`Render + place ${s.name}`}>
              <span className="fxthumb gen" style={{ background: "radial-gradient(circle at 40% 30%, #31c6a8, #0a0a12 75%)" }}>🔊</span>
              <span className="fxname">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
