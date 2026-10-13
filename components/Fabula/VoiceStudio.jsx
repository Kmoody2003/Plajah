// VoiceStudio — the audio-page production toolkit: TEXT-TO-VOICE (Kokoro 82M / Fish Speech / Azure)
// SLATE SCRIPT REEL (scene breakdown, dialogue casting, and video shot snapping),
// VOICEOVER + ADR recording (mic capture; ADR loops picture while you perform to it),
// and a synthesized SOUND-FX / procedural Foley palette powered by plajahAudioCore.

import { useEffect, useRef, useState } from "react";
import { MAI_VOICES, synthesizeNarration, getMicrosoftAIConfig } from "../../services/microsoftAIService";
import { onDeviceVoiceEngine, KOKORO_VOICES } from "../../services/voice/onDeviceVoiceEngine";
import { plajahAudioCore } from "../../services/voice/plajahAudioCore";
import { proceduralFoley, FOLEY_PRESETS } from "../../services/audio/proceduralFoleyEngine";
import { wanVideoEngine } from "../../services/video/wanVideoEngine";
import SlateWaveformVisualizer from "./SlateWaveformVisualizer";

export default function VoiceStudio({ audioTracks = [], playhead, setPlayhead, setPlaying, onPlaceClip, ping, activeScene }) {
  const [tab, setTab] = useState("slate"); // Default to Slate Script Reel in Fabula!
  const cfg = getMicrosoftAIConfig();

  // TTS State
  const [text, setText] = useState("");
  const [voiceSource, setVoiceSource] = useState("kokoro"); // "kokoro" | "fish_speech" | "azure"
  const [voiceId, setVoiceId] = useState(KOKORO_VOICES[0]?.id || "af_heart");
  const [rate, setRate] = useState(1);
  const [emotion, setEmotion] = useState("urgent");
  const [busy, setBusy] = useState(false);
  const [track, setTrack] = useState(audioTracks[0]?.id || "a1");

  // Slate Script Reel State
  const [scriptLines, setScriptLines] = useState([
    {
      id: "sl_1",
      speakerName: "Aria",
      emotion: "urgent",
      text: "If the transmitter goes down tonight, none of our signals reach the orbital dock.",
      selectedTake: 2,
      takes: [
        { takeNum: 1, label: "Take 1 (Neutral)", dur: 2.6, emotion: "neutral" },
        { takeNum: 2, label: "Take 2 (Urgent)", dur: 2.4, emotion: "urgent" },
        { takeNum: 3, label: "Take 3 (Whisper)", dur: 2.8, emotion: "whisper" },
      ],
    },
    {
      id: "sl_2",
      speakerName: "Marcus",
      emotion: "neutral",
      text: "The auxiliary core is holding at forty percent. We still have a narrow window.",
      selectedTake: 1,
      takes: [
        { takeNum: 1, label: "Take 1 (Composed)", dur: 3.1, emotion: "neutral" },
        { takeNum: 2, label: "Take 2 (Tense)", dur: 2.9, emotion: "urgent" },
      ],
    },
  ]);
  const [activeLineId, setActiveLineId] = useState("sl_1");

  useEffect(() => {
    if (!audioTracks.find((t) => t.id === track) && audioTracks[0]) setTrack(audioTracks[0].id);
  }, [audioTracks, track]);

  // Generate Single TTS
  const generateTTS = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      if (voiceSource === "kokoro") {
        const res = await onDeviceVoiceEngine.synthesize({ text: text.trim(), voiceId, speed: rate });
        onPlaceClip(res.audioBlob, (text.trim().slice(0, 28) || "Kokoro VO"), { trackId: track, at: playhead });
        ping?.("🎙 On-device Kokoro voice clip placed at playhead");
      } else if (voiceSource === "fish_speech") {
        const take = await plajahAudioCore.synthesizeFabulaDialogue({
          text: text.trim(),
          speakerName: "Aria",
          emotion,
          engine: "fish_speech",
        });
        onPlaceClip(take.audioBlob, (text.trim().slice(0, 28) || "Fish VO"), { trackId: track, at: playhead });
        ping?.(`🎙 Fish Speech take placed (duration: ${take.durationSeconds.toFixed(1)}s, snap: ${take.sceneSnapSeconds}s)`);
      } else {
        const { audioBlob } = await synthesizeNarration({ text: text.trim(), voiceId, rate });
        onPlaceClip(audioBlob, (text.trim().slice(0, 28) || "VO"), { trackId: track, at: playhead });
        ping?.("🎙 Voice clip placed at the playhead");
      }
    } catch (e) {
      ping?.("TTS failed — " + (e?.message || "check voice parameters"));
    }
    setBusy(false);
  };

  // Place Slate Script Take onto Timeline with Auto-Snap
  const placeSlateTake = async (line, take) => {
    setBusy(true);
    try {
      const dialogueTake = await plajahAudioCore.synthesizeFabulaDialogue({
        text: line.text,
        speakerName: line.speakerName,
        emotion: take.emotion,
        takeIndex: take.takeNum,
        engine: voiceSource === "fish_speech" ? "fish_speech" : "kokoro",
      });

      onPlaceClip(dialogueTake.audioBlob, `${line.speakerName} (T${take.takeNum})`, {
        trackId: track,
        at: playhead,
      });

      ping?.(`🎬 ${line.speakerName} Take ${take.takeNum} placed. Video cut snapped to ${dialogueTake.sceneSnapSeconds}s!`);
    } catch (e) {
      ping?.("Failed placing script take: " + (e?.message || e));
    }
    setBusy(false);
  };

  // Generate Wan 2.1 Video Shot Snapped to Dialogue
  const generateWanVideoForTake = async (line, take, snapDuration) => {
    setBusy(true);
    ping?.(`🎬 Synthesizing Wan 2.1 video shot for ${line.speakerName} (T${take.takeNum}, ${snapDuration}s snapped)...`);
    try {
      const dialogueTake = await plajahAudioCore.synthesizeFabulaDialogue({
        text: line.text,
        speakerName: line.speakerName,
        emotion: take.emotion,
        takeIndex: take.takeNum,
        engine: voiceSource === "fish_speech" ? "fish_speech" : "kokoro",
      });

      const shot = await wanVideoEngine.generateDialogueSnappedShot({
        keyframeUrl: line.speakerName.toLowerCase().includes("aria")
          ? "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80"
          : "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80",
        prompt: `Cinematic medium shot, ${line.speakerName} in the observatory, dramatic rim lighting, 24fps motion`,
        dialogueTake,
        cameraMovement: take.emotion === "urgent" ? "push_in" : "pan_left",
        resolution: "480p",
      });

      // Place audio take onto timeline
      onPlaceClip(dialogueTake.audioBlob, `${line.speakerName} (T${take.takeNum})`, {
        trackId: track,
        at: playhead,
      });

      ping?.(`✨ Wan 2.1 video shot generated (${shot.dimensions.width}x${shot.dimensions.height} @ ${shot.fps}fps, ${shot.durationSeconds}s) & snapped to timeline!`);
    } catch (e) {
      ping?.("Wan Video generation failed: " + (e?.message || e));
    }
    setBusy(false);
  };

  // VOICEOVER / ADR record
  const recRef = useRef(null);
  const micRef = useRef(null);
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
      if (adr) {
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
        if (blob.size > 1000) {
          onPlaceClip(blob, adr ? "ADR take" : "VO take", { trackId: track, at: startAt });
          ping?.(adr ? "🎬 ADR take placed" : "🎙 Voiceover placed");
          onDeviceVoiceEngine.transcribe(blob).then((t) => {
            if (t?.text) ping?.(`📝 Whisper Transcribed: "${t.text.slice(0, 36)}…"`);
          }).catch(() => {});
        }
      };
      mr.start(); recRef.current = mr; setRecording(true);
    } catch (e) { ping?.("Mic unavailable — " + (e?.message || "permission denied")); }
  };

  const placeProceduralFoley = (presetId) => {
    try {
      const res = proceduralFoley.renderFoley({ presetId });
      onPlaceClip(res.wavBlob, res.name, { trackId: track, at: playhead });
      ping?.(`🔊 ${res.name} placed at playhead (${res.durationSeconds.toFixed(1)}s)`);
    } catch (e) {
      ping?.("Foley render failed — " + (e?.message || e));
    }
  };

  const activeLine = scriptLines.find((l) => l.id === activeLineId) || scriptLines[0];

  return (
    <div className="fxstudio glass-dark" style={{ border: "1px solid rgba(255,140,0,0.25)" }}>
      <div className="paneltitle" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          🎙 PLAHAH VOICE &amp; SOUND STUDIO
          <span className="dim small" style={{ marginLeft: 8, letterSpacing: 0, color: "#FF8C00" }}>
            polymorphic audio core · slate breakdown · kokoro · fish speech
          </span>
        </div>
        <span className="dim small font-mono" style={{ fontSize: 9, padding: "2px 8px", background: "rgba(255,140,0,0.15)", borderRadius: 9999, color: "#FF8C00" }}>
          FABULA CINEMA REEL
        </span>
      </div>

      <div className="fxtabs" style={{ maxWidth: 480 }}>
        {[
          ["slate", "🎬 SLATE SCRIPT REEL"],
          ["tts", "🎙 TEXT-TO-VOICE"],
          ["vo", "🔴 VO / ADR"],
          ["sfx", "🔊 PROCEDURAL FOLEY"]
        ].map(([id, l]) => (
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

      {/* TAB 1: SLATE SCRIPT REEL */}
      {tab === "slate" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="dim small font-mono" style={{ color: "#00DAF3" }}>
              INGESTED FROM SLATE: SCENE {activeScene?.sceneNum || "12"} (INT. OBSERVATORY - NIGHT)
            </span>
            <span className="dim small font-mono">{scriptLines.length} DIALOGUE OCCURRENCES</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
            {/* Left: Script Lines */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {scriptLines.map((line) => (
                <div
                  key={line.id}
                  onClick={() => setActiveLineId(line.id)}
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    border: `1px solid ${line.id === activeLineId ? "#FF8C00" : "rgba(255,255,255,0.08)"}`,
                    background: line.id === activeLineId ? "rgba(255,140,0,0.12)" : "rgba(255,255,255,0.02)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: "bold", color: "#FF8C00", marginBottom: 2 }}>
                    <span>{line.speakerName} ({line.emotion.toUpperCase()})</span>
                    <span className="font-mono">T{line.selectedTake}</span>
                  </div>
                  <div style={{ fontSize: 11, fontStyle: "italic", color: "#fff", lineHeight: 1.3 }}>
                    “{line.text}”
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Audition & Snapping Strip */}
            <div style={{ padding: 10, borderRadius: 8, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 10, fontWeight: "bold", color: "#00DAF3", marginBottom: 6, textTransform: "uppercase" }}>
                Multi-Take Audition Strip: {activeLine.speakerName}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activeLine.takes.map((take) => (
                  <SlateWaveformVisualizer
                    key={take.takeNum}
                    line={activeLine}
                    take={take}
                    isSelected={activeLine.selectedTake === take.takeNum}
                    voiceEngine={voiceSource === "fish_speech" ? "fish_speech" : "kokoro"}
                    onSelectTake={() => {
                      setScriptLines((prev) =>
                        prev.map((l) => (l.id === activeLine.id ? { ...l, selectedTake: take.takeNum } : l))
                      );
                    }}
                    onSnapTake={() => placeSlateTake(activeLine, take)}
                    onGenerateWanVideoShot={(snapDuration) => generateWanVideoForTake(activeLine, take, snapDuration)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TEXT-TO-VOICE */}
      {tab === "tts" && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <button
              className={`fxtab ${voiceSource === "kokoro" ? "on" : ""}`}
              style={{ fontSize: 9.5, padding: "3px 8px" }}
              onClick={() => { setVoiceSource("kokoro"); setVoiceId(KOKORO_VOICES[0]?.id || "af_heart"); }}
            >
              ⚡ KOKORO 82M (ZERO-CLOUD)
            </button>
            <button
              className={`fxtab ${voiceSource === "fish_speech" ? "on" : ""}`}
              style={{ fontSize: 9.5, padding: "3px 8px" }}
              onClick={() => { setVoiceSource("fish_speech"); }}
            >
              🐟 FISH SPEECH 1.5 (CLONING)
            </button>
            <button
              className={`fxtab ${voiceSource === "azure" ? "on" : ""}`}
              style={{ fontSize: 9.5, padding: "3px 8px" }}
              onClick={() => { setVoiceSource("azure"); setVoiceId(MAI_VOICES[0]?.id || ""); }}
            >
              ☁ AZURE NEURAL
            </button>
          </div>
          <textarea className="in" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type dialogue or narrative line…" />
          <div className="insp-row" style={{ marginTop: 6 }}>
            {voiceSource === "kokoro" && (
              <>
                <span className="lbl">VOICE</span>
                <select className="sel grow" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                  {KOKORO_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </>
            )}
            {voiceSource === "fish_speech" && (
              <>
                <span className="lbl">EMOTION</span>
                <select className="sel grow" value={emotion} onChange={(e) => setEmotion(e.target.value)}>
                  <option value="urgent">Urgent / High Tension</option>
                  <option value="whisper">Soft Whisper</option>
                  <option value="dramatic">Dramatic Film</option>
                  <option value="neutral">Neutral Narrative</option>
                </select>
              </>
            )}
            <span className="lbl" style={{ marginLeft: 8 }}>RATE</span>
            <input type="range" min="0.6" max="1.6" step="0.05" value={rate} onChange={(e) => setRate(parseFloat(e.target.value))} />
          </div>
          <div className="btnrow" style={{ marginTop: 8 }}>
            <button className="cta sm" disabled={busy || !text.trim()} onClick={generateTTS}>
              {busy ? "SYNTHESIZING…" : "🎙 GENERATE + PLACE AT PLAYHEAD"}
            </button>
          </div>
        </>
      )}

      {/* TAB 3: VO / ADR */}
      {tab === "vo" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {count > 0 && <div style={{ fontSize: 40, fontWeight: 900, color: "#FF8C00", width: 60, textAlign: "center" }}>{count}</div>}
          <button className="cta sm" style={recording ? { background: "#e5484d" } : undefined} onClick={() => startRecord(false)}>{recording ? "■ STOP" : "● VOICEOVER"}</button>
          <button className="cta sm" style={recording ? { background: "#e5484d" } : undefined} onClick={() => startRecord(true)} title="Count-in, then picture rolls while you perform to it">{recording ? "■ STOP" : "🎬 ADR (to picture)"}</button>
          <span className="dim small">Counts you in (3-2-1) and rolls video playback for direct audio-to-picture performance.</span>
        </div>
      )}

      {/* TAB 4: PROCEDURAL FOLEY */}
      {tab === "sfx" && (
        <div className="fxgrid" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {FOLEY_PRESETS.map((p) => (
            <button key={p.id} className="fxcard" onClick={() => placeProceduralFoley(p.id)} title={p.description}>
              <span className="fxthumb gen" style={{ background: "radial-gradient(circle at 40% 30%, #FF8C00, #0a0a12 75%)" }}>🔊</span>
              <span className="fxname" style={{ fontSize: 10, fontWeight: "bold" }}>{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
