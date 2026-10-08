// RunwayPluginPanel — DaVinci Resolve & Premiere Pro style Workflow Integration for Fabula.
// Provides a dedicated panel running against the user's OWN Runway subscription account (spending
// their existing monthly plan credits), with timeline clip restyling, take staging, and A/B comparison.

import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles, X, ExternalLink, Copy, Check, Film, UploadCloud, Play,
  Layers, RefreshCw, Eye, EyeOff, ShieldCheck, Zap, Sliders, ArrowRight
} from "lucide-react";

export default function RunwayPluginPanel({
  isOpen,
  onClose,
  selectedClip,
  clips = [],
  prod,
  onImportTake,
  onUpdateClips,
}) {
  const [tab, setTab] = useState("studio"); // 'studio' | 'embedded' | 'import'
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [aspect, setAspect] = useState("16:9");
  const [copied, setCopied] = useState(false);
  const [importedUrl, setImportedUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [compareMode, setCompareMode] = useState("b"); // 'a' (original) | 'b' (runway take)
  const [preset, setPreset] = useState("");

  const PRESETS = [
    { label: "Cinematic 35mm", text: "35mm anamorphic film, subtle grain, cinematic color grade, photorealistic lighting" },
    { label: "Anime / Cel Shaded", text: "Makoto Shinkai anime aesthetic, hand-drawn vibrant skies, cel-shaded characters" },
    { label: "Cyberpunk Neon", text: "Volumetric neon lighting, rainy cyberpunk reflections, gritty high-contrast night atmosphere" },
    { label: "70s Vintage Film", text: "Vintage 1970s Technicolor, warm golden hour, slight chromatic aberration, retro analog film" },
  ];

  // Sync selected clip label into prompt if empty
  useEffect(() => {
    if (selectedClip && !prompt) {
      setPrompt(`Cinematic restyle of ${selectedClip.label || "footage"}`);
    }
  }, [selectedClip]);

  if (!isOpen) return null;

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenRunway = () => {
    // Open Runway Gen-3 / Gen-4 studio directly in new window
    window.open("https://app.runwayml.com/generate", "_blank", "noopener,noreferrer");
  };

  const handleApplyPreset = (p) => {
    setPreset(p.label);
    setPrompt(p.text);
  };

  const handleDropTake = async (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files[0]) {
      const file = files[0];
      const localUrl = URL.createObjectURL(file);
      insertTakeIntoTimeline(localUrl, file.name);
    }
  };

  const insertTakeIntoTimeline = (videoUrl, fileName = "runway-take.mp4") => {
    if (!selectedClip) {
      alert("Please select a timeline clip first to link the new Runway take.");
      return;
    }

    setImporting(true);
    try {
      onImportTake?.({
        url: videoUrl,
        name: fileName,
        targetClipId: selectedClip.id,
        trackId: "v2",
        aspect,
      });
    } finally {
      setImporting(false);
      setImportedUrl("");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 48,
        right: 16,
        bottom: 48,
        width: 460,
        maxWidth: "calc(100vw - 32px)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        background: "rgba(18, 19, 24, 0.94)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 12,
        boxShadow: "0 24px 48px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        color: "#f3f4f6",
        fontFamily: "Inter, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* ── Plugin Header (Resolve / Premiere Style) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.2) 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(16, 185, 129, 0.4)",
            }}
          >
            <Sparkles size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 6 }}>
              RUNWAY WORKFLOW INTEGRATION
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  padding: "2px 5px",
                  borderRadius: 4,
                  background: "rgba(16, 185, 129, 0.2)",
                  color: "#34d399",
                  border: "1px solid rgba(16, 185, 129, 0.4)",
                }}
              >
                SUBSCRIPTION
              </span>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)" }}>
              DaVinci Resolve & Premiere Pro Plugin Parity
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255, 255, 255, 0.5)",
            cursor: "pointer",
            padding: 4,
            borderRadius: 4,
          }}
          title="Close Runway Plugin"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Subscription Wallet Banner ── */}
      <div
        style={{
          padding: "8px 14px",
          background: "rgba(16, 185, 129, 0.08)",
          borderBottom: "1px solid rgba(16, 185, 129, 0.18)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          color: "#a7f3d0",
        }}
      >
        <ShieldCheck size={14} color="#34d399" />
        <span>
          Generations draw directly from your <b>Runway Subscription Credits</b> (Standard, Pro, or Unlimited).
        </span>
      </div>

      {/* ── Plugin Tabs ── */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(0, 0, 0, 0.2)",
        }}
      >
        {[
          { id: "studio", label: "Edit Studio", icon: Sliders },
          { id: "embedded", label: "Runway Webview", icon: Film },
          { id: "import", label: "Sync & A/B", icon: Layers },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "9px 8px",
                background: active ? "rgba(255, 255, 255, 0.08)" : "transparent",
                border: "none",
                borderBottom: active ? "2px solid #10b981" : "2px solid transparent",
                color: active ? "#fff" : "rgba(255, 255, 255, 0.5)",
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              <Icon size={12} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Content Viewports ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {/* ─── TAB 1: EDIT STUDIO (Clip Sync & Generation Staging) ─── */}
        {tab === "studio" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Selected Clip Card */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: "rgba(255, 255, 255, 0.4)", marginBottom: 6 }}>
                ACTIVE TIMELINE CLIP
              </div>
              {selectedClip ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#fff" }}>
                      {selectedClip.label || "Untitled Clip"}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.5)", marginTop: 2 }}>
                      Track: {selectedClip.trackId?.toUpperCase() || "V1"} · Duration: {selectedClip.duration?.toFixed(1) || 0}s · Start: {selectedClip.start?.toFixed(1) || 0}s
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      background: "rgba(249, 115, 22, 0.15)",
                      color: "#fb923c",
                      padding: "3px 7px",
                      borderRadius: 4,
                      fontWeight: 600,
                    }}
                  >
                    SYNCED
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.4)", fontStyle: "italic" }}>
                  No timeline clip selected. Click any clip in the timeline to sync it with Runway.
                </div>
              )}
            </div>

            {/* Restyling Presets */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255, 255, 255, 0.6)", marginBottom: 6 }}>
                RESTYLING LOOK PRESETS
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => handleApplyPreset(p)}
                    style={{
                      padding: "6px 10px",
                      fontSize: 11,
                      background: preset === p.label ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.05)",
                      border: preset === p.label ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 6,
                      color: preset === p.label ? "#34d399" : "rgba(255, 255, 255, 0.7)",
                      cursor: "pointer",
                      textAlign: "left",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Input */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255, 255, 255, 0.6)" }}>
                  RUNWAY MOTION PROMPT
                </span>
                <button
                  onClick={() => copyToClipboard(prompt)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: copied ? "#34d399" : "rgba(255, 255, 255, 0.5)",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="Describe camera movement, lighting, or restyling transformation..."
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "rgba(0, 0, 0, 0.35)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  color: "#fff",
                  fontSize: 12,
                  fontFamily: "inherit",
                  resize: "vertical",
                  outline: "none",
                }}
              />
            </div>

            {/* Generation Controls */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: "rgba(255, 255, 255, 0.5)", display: "block", marginBottom: 4 }}>
                  ASPECT RATIO
                </label>
                <select
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    background: "rgba(0, 0, 0, 0.35)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 11,
                    outline: "none",
                  }}
                >
                  <option value="16:9">16:9 Widescreen</option>
                  <option value="9:16">9:16 Vertical</option>
                  <option value="1:1">1:1 Square</option>
                  <option value="2.39:1">2.39:1 Scope (Crop to Frame)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: "rgba(255, 255, 255, 0.5)", display: "block", marginBottom: 4 }}>
                  DURATION
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    background: "rgba(0, 0, 0, 0.35)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 11,
                    outline: "none",
                  }}
                >
                  <option value={5}>5 Seconds (Gen-3/4 Standard)</option>
                  <option value={10}>10 Seconds (Extended Take)</option>
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              <button
                onClick={() => {
                  copyToClipboard(prompt);
                  handleOpenRunway();
                }}
                style={{
                  padding: "10px 14px",
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: "0 4px 12px rgba(16, 185, 129, 0.35)",
                }}
              >
                <ExternalLink size={14} />
                Generate on Runway (Spends Subscription)
              </button>

              <button
                onClick={() => setTab("embedded")}
                style={{
                  padding: "8px 12px",
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: 6,
                  color: "rgba(255, 255, 255, 0.8)",
                  fontWeight: 500,
                  fontSize: 11,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Film size={13} />
                Open In-Panel Webview
              </button>
            </div>
          </div>
        )}

        {/* ─── TAB 2: EMBEDDED RUNWAY STUDIO WEBVIEW ─── */}
        {tab === "embedded" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 10px",
                background: "rgba(255, 255, 255, 0.05)",
                borderRadius: 6,
                fontSize: 11,
              }}
            >
              <span>Embedded Runway Workspace</span>
              <button
                onClick={handleOpenRunway}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#34d399",
                  fontSize: 11,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Open in Browser <ExternalLink size={11} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 380,
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                overflow: "hidden",
                position: "relative",
                background: "#0d0e12",
              }}
            >
              <iframe
                src="https://app.runwayml.com/generate"
                title="Runway Studio"
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              />
            </div>
          </div>
        )}

        {/* ─── TAB 3: SYNC & A/B COMPARISON (Resolve Edit Studio Parity) ─── */}
        {tab === "import" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.7)", lineHeight: 1.4 }}>
              Drop the generated video file from Runway here to place it directly into the cut as an alternate take.
            </div>

            {/* Drag & Drop Target */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropTake}
              style={{
                border: "2px dashed rgba(16, 185, 129, 0.35)",
                borderRadius: 10,
                padding: 24,
                textAlign: "center",
                background: "rgba(16, 185, 129, 0.04)",
                cursor: "pointer",
              }}
            >
              <UploadCloud size={32} color="#10b981" style={{ margin: "0 auto 8px" }} />
              <div style={{ fontWeight: 600, fontSize: 13, color: "#fff" }}>
                Drop Runway .mp4 Render Here
              </div>
              <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.4)", marginTop: 4 }}>
                Or select file from your downloads folder
              </div>
              <input
                type="file"
                accept="video/*"
                style={{ display: "none" }}
                id="runway-file-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const localUrl = URL.createObjectURL(file);
                    insertTakeIntoTimeline(localUrl, file.name);
                  }
                }}
              />
              <button
                onClick={() => document.getElementById("runway-file-input")?.click()}
                style={{
                  marginTop: 12,
                  padding: "5px 12px",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Browse Files
              </button>
            </div>

            {/* Direct URL Ingest */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255, 255, 255, 0.6)", marginBottom: 4 }}>
                OR PASTE DIRECT CLOUD / DOWNLOAD URL
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  placeholder="https://.../runway-video.mp4"
                  value={importedUrl}
                  onChange={(e) => setImportedUrl(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    background: "rgba(0, 0, 0, 0.35)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 11,
                    outline: "none",
                  }}
                />
                <button
                  disabled={!importedUrl.trim() || importing}
                  onClick={() => insertTakeIntoTimeline(importedUrl.trim())}
                  style={{
                    padding: "7px 14px",
                    background: "#10b981",
                    border: "none",
                    borderRadius: 6,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Lay In Cut
                </button>
              </div>
            </div>

            {/* A/B Comparison Tool (Resolve Edit Studio Feature) */}
            <div
              style={{
                marginTop: 6,
                padding: 12,
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: "rgba(255, 255, 255, 0.5)", marginBottom: 8 }}>
                A/B SPLIT TAKE COMPARISON
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => {
                    setCompareMode("a");
                    // Toggle original clip on / runway take off
                    if (selectedClip) {
                      onUpdateClips?.((curr) =>
                        curr.map((c) =>
                          c.id === selectedClip.id
                            ? { ...c, disabled: false }
                            : c.shotId === selectedClip.shotId && c.id !== selectedClip.id
                            ? { ...c, disabled: true }
                            : c
                        )
                      );
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    background: compareMode === "a" ? "rgba(249, 115, 22, 0.2)" : "rgba(255, 255, 255, 0.05)",
                    border: compareMode === "a" ? "1px solid #f97316" : "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 6,
                    color: compareMode === "a" ? "#fb923c" : "rgba(255, 255, 255, 0.6)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  A: Original Cut
                </button>
                <button
                  onClick={() => {
                    setCompareMode("b");
                    // Toggle runway take on / original clip off
                    if (selectedClip) {
                      onUpdateClips?.((curr) =>
                        curr.map((c) =>
                          c.id === selectedClip.id
                            ? { ...c, disabled: true }
                            : c.shotId === selectedClip.shotId && c.id !== selectedClip.id
                            ? { ...c, disabled: false }
                            : c
                        )
                      );
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    background: compareMode === "b" ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.05)",
                    border: compareMode === "b" ? "1px solid #10b981" : "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 6,
                    color: compareMode === "b" ? "#34d399" : "rgba(255, 255, 255, 0.6)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  B: Runway Take
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Plugin Footer ── */}
      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(0, 0, 0, 0.25)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          color: "rgba(255, 255, 255, 0.4)",
        }}
      >
        <span>Fabula ↔ Runway Plugin v1.0</span>
        <button
          onClick={handleOpenRunway}
          style={{
            background: "transparent",
            border: "none",
            color: "#34d399",
            fontSize: 11,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          app.runwayml.com <ExternalLink size={11} />
        </button>
      </div>
    </div>
  );
}
