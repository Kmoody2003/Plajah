import MediaRepair from './MediaRepair';
import { reportMediaHealth } from '../../services/fabula/mediaHealth';
import { buildEditingProxy } from '../../services/fabula/proxyBuilder';
import IndexedVideoCanvas from './IndexedVideoCanvas';
import { indexedVideoAvailable } from '../../services/mediaEngine/indexedVideo';
import PanelDivider from "./PanelDivider";
import { timelineBoundaries, crossedTimelineBoundary } from "../../services/fabula/timelineBoundaries";
import { resolveMediaSource } from "../../services/fabula/mediaSource";
import { useState, useEffect, useRef, useMemo, memo, Fragment } from "react";
import {
  Film, Music, Clapperboard, Layers, Play, Pause, SkipBack, Plus, Upload,
  Sparkles, ChevronLeft, Wand2, Users, Globe, Trash2, MonitorPlay, X, ListVideo,
  Palette, Box, Cpu, Lock, Unlock, Camera, Brush, Type, Captions, Keyboard,
  Scissors, MousePointer2, FlagTriangleRight, FlagTriangleLeft,
  SlidersHorizontal, Mic2, FolderOpen, Search, Tag, FileText, RefreshCw,
  Image as ImageIcon,
} from "lucide-react";
import * as THREE from "three";
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from "idb-keyval";
import { putBytes as mediaPutBytes, getBytes as mediaGetBytes, delBytes as mediaDelBytes } from "../../services/fabula/mediaStore";
import { acquire as acquireDecoder } from "../../services/fabula/decoderBudget";
import { createCompositor, webgpuAvailable } from "../../services/fabula/gpuComposite";
import { renderFabulaToBlob } from "../../services/fabulaRender";
import { crossover } from "../../services/crossover";
import { kindOf as codecKind, importAccept as codecImportAccept } from "../../services/fabula/codecMatrix";
import SceneView from "../plajahPixels/components/SceneView";
import { useContextMenu } from "../ui/ContextMenu";
import { getMyMusicTracks, buildSubtitleClips, syncLicenseInfo } from "../../services/fabulaMusic";
import { isFeatureEnabled } from "../../services/featureFlagService";
import { getLicense } from "../../services/licensingService";
import { purchaseSyncLicense, listMyGrants, grantSet, grantKey } from "../../services/syncLicensing";
import { getMyVideos } from "../../services/fabulaVideos";
import { useFabulaShortcuts } from "./useFabulaShortcuts";
import KeyboardShortcutsEditor from "./KeyboardShortcutsEditor";
import { loadShortcutPrefs } from "../../services/fabula/shortcuts";
import Waveform from "./Waveform";
import { attachAudioGraph, getAudioCtx, meterRegistry, needsCors, resumeAudioCtx, CLIP_AUDIO_DEFAULT, COMP_DEFAULT, EQ_LABELS } from "../../services/fabula/audioGraph";
import { transcodeToProxy, canTranscode } from "../plajahPixels/engine/core/proxyTranscoder";
import { FxLibraryPanel, LottieBuilder, PerformCapture, CompBuilder } from "./FxLibrary";
import { UniversalLibraryPanel } from "../shared/UniversalLibrary/UniversalLibraryPanel";
import { FX_EFFECTS } from "../plajahPixels/engine/fx/effects";
import { createEffectInstance } from "../../services/fabula/forgeEffects";
import { createForgeTransition } from "../../services/fabula/forgeTransitions";
import { instantiateLook, lookFromStack, saveUserLook, LOOK_CATEGORIES, FORGE_LOOKS } from "../../services/fabula/forgeLooks";
import { AUDIO_SOURCES } from "../plajahPixels/engine/fx/audioReact";
import { TextOverlayCache } from "../../services/fabula/textOverlay";
import { meshAuxElement, createMeshSequence, meshReferenceSample, trackMeshFrame, upsertMeshSample, meshTrackedRange } from "../../services/fabula/meshTrack";
import { estimateEffectCost, stackCost, TIER_LABEL, TIER_HINT } from "../../services/fabula/effectCost";
import { expandStack, customLookup, customEffectDescriptor, isCustomEffectId, bareCustomId, createCustomInstance, customFromStack, promoteControl, validateCustomEffect, loadCustomEffects, saveCustomEffect, deleteCustomEffect } from "../../services/fabula/customEffects";
import { masterAnalyser } from "../../services/fabula/audioGraph";
import { parseCubeLut } from "../../services/fabula/cubeLut";
import { createVectorTrack, stabilizationAt, trackPoint, upsertTrackSample, grayFromRgba } from "../../services/fabula/vectorTrack";
import { createPlanarSequence, referenceSample, trackPlanarFrame, upsertPlanarSample, samplePlanarAt, planarStabilizeAt, cornerPinAt, planarTrackedRange, quadPoint, exportCornerPin } from "../../services/fabula/planarSequence";
import { invertHomography, toPixelSpace, mat3ToCssMatrix3d, isIdentityMat3, containBox, solveHomography, transformPoint } from "../../services/fabula/planarTrack";
import { resolveInstanceForFrame, maskOutlineAt, MASK_DEFAULT, BINDING_SOURCES } from "../../services/fabula/forgeBindings";
import { segmentSubjectLatest } from "../../services/fabula/subjectMatte";
import { segmentSamLatest } from "../../services/fabula/samMatte";
import { renderModel3dLatest } from "../plajahPixels/engine/core/model3d";
import { MODEL3D_DEFAULT } from "../../services/fabula/model3dNode";
import { estimateDepthLatest, depthRangeCanvas } from "../../services/fabula/depthMatte";
import { glyphStates, TITLE_ANIMS, TITLE_ANIM_DEFAULT } from "../../services/fabula/titleAnimators";
import { dynamicText, DYNAMIC_TYPES, DYNAMIC_DEFAULT } from "../../services/fabula/titleDynamic";
import { trackFrameOffset, canShareTrack, rebaseVectorTrack, rebasePlanarTrack } from "../../services/fabula/trackShare";
import { Compositor as PixelsCompositor } from "../plajahPixels/engine/core/compositor";
import NodeGraphEditor from "./NodeGraphEditor";
import DataVizBuilder from "./DataVizBuilder";
import BroadcastSystemsLibrary from "./BroadcastSystemsLibrary";
import TelaChart from "../tela/TelaChart";
import ColorScopes from "./ColorScopes";
import GradePreview from "./GradePreview";
import MixConsole from "./MixConsole";
import VoiceStudio from "./VoiceStudio";
import AudioEditor from "./AudioEditor";
import AudioTimeline from "./AudioTimeline";
import ColorWheels from "./ColorWheels";
import CurveEditor from "./CurveEditor";
import { buildCurveLut, isCurvesIdentity } from "../../services/fabula/gradeCurves";
import { isQualifierIdentity, keyFromPixel, QUALIFIER_DEFAULT } from "../../services/fabula/hslKey";
import { isWindowEnabled, WINDOW_DEFAULT } from "../../services/fabula/gradeWindow";
import { rangeClips } from "../../services/fabula/rangeClips";
import {
  startPlayback, stopPlayback, engineRunning, engineClock, setEngineTracks,
  warmAudio, subscribePlayback, enginePlayable, registerLiveVideo, unregisterLiveVideo, syncLiveVideos, engineStats, engineIsDead,
} from "../../services/fabula/playbackEngine";
import { sampleTrack, sampleParam as kfSample, isAnimated as kfIsAnimated, hasKeys as kfHasKeys, addKey as kfAddKey, removeKey as kfRemoveKey, keyAt as kfKeyAt, prevKeyTime as kfPrev, nextKeyTime as kfNext, KF_PARAMS, KF_ALL } from "../../services/fabula/keyframes";
import { quickStems, separateStemsCloud } from "../../services/fabula/stemSeparation";
import { exportFCPXML, importFCPXML } from "../../services/fabula/fcpxml";
import { initResumableUploads, enqueueUpload, onUploadProgress, pendingCount, setUploadsPaused, uploadsPaused, clearUploadQueue } from "../../services/fabula/resumableUpload";
import { listSyncFolders, addSyncFolder, removeSyncFolder, rescanNew, markSeen, getFileFromFolder } from "../../services/fabula/syncFolders";
import { isVectorFile, rasterizeVector } from "../../services/fabula/vectorRaster";
import GeneratePanel from "./GeneratePanel";
import { specFromShot, connectorById, placeResultInCut } from "../../services/fabula/genAgent";
import { auth } from "../../services/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { saveProjectCloud, listProjectsCloud, loadProjectCloud, deleteProjectCloud } from "../../services/fabulaProjects";
import { fetchAlbumById, uploadFabulaAsset, uploadVideo } from "../../services/backendService";
import ConnectToWorld from "../Worlds/ConnectToWorld";
import { syncProductionToWorld, worldCharactersForProduction } from "../../services/fabulaWorldBridge";
import SpatialMixer from "../spatialMixer/SpatialMixer";
import { setComicHandoff } from "../../services/comicHandoff";
import MusicLicensingStore from "../MusicLicensingStore";
import { CREATIVE_LOOKS, DEFAULT_PHOTO_ADJUSTMENTS, photoAdjustmentsToEffects } from "../../services/photoEditingService";
import LowerThirdMonitor from "./LowerThirdMonitor";
import LowerThirdGallery from "./LowerThirdGallery";
import LowerThirdInspector from "./LowerThirdInspector";
import BroadcastGraphicMonitor from "./BroadcastGraphicMonitor";
import { findLowerThird } from "../../services/fabula/lowerThirdRegistry";
import { openLowerThirdInTela } from "../../services/fabula/lowerThirdToTela";

// Read a drag-and-drop into { path, name, file } items, recursively walking dropped FOLDERS via the
// webkitGetAsEntry directory API (mirroring their structure into `path`). This is a picker-free way to
// read a local folder — drag it straight onto the media area. Falls back to flat files where the
// directory API is unavailable.
async function readDroppedItems(dataTransfer) {
  const out = [];
  const items = dataTransfer?.items ? Array.from(dataTransfer.items) : [];
  const entries = items.map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) {
    for (const f of Array.from(dataTransfer?.files || [])) {
      const rel = f.webkitRelativePath || f.name;
      out.push({ path: rel.split("/").slice(0, -1).join("/"), name: f.name, file: f });
    }
    return out;
  }
  const readEntry = (entry, prefix) => new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((f) => { out.push({ path: prefix, name: f.name, file: f }); resolve(); }, () => resolve());
    } else if (entry.isDirectory) {
      const dirPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const reader = entry.createReader();
      const acc = [];
      const readBatch = () => reader.readEntries((batch) => {
        if (!batch.length) { Promise.all(acc.map((c) => readEntry(c, dirPath))).then(resolve); return; }
        acc.push(...batch); readBatch();
      }, () => resolve());
      readBatch();
    } else resolve();
  });
  await Promise.all(entries.map((e) => readEntry(e, "")));
  return out;
}

/* ════════════════════════════════════════════════════════════
   FABULA — holistic storytelling studio. The whole story, then the telling.
   PRODUCTIONS (knowledge layer) · SLATE (coverage intelligence)
   · EDIT (timeline where script clips live before footage exists)
   One shared data model. Persistent. Claude as the brain.
   ════════════════════════════════════════════════════════════ */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const SERVICES = [
  { id: "runway", label: "Runway Gen-4", hint: "Terse, motion-first phrasing. No audio cues." },
  { id: "kling", label: "Kling", hint: "Rich motion + performance language. Lip-sync after." },
  { id: "seedance", label: "Seedance", hint: "Natural-language shot description, supports multi-action beats." },
  { id: "veo", label: "Veo 3", hint: "Supports native dialogue audio — include spoken lines in quotes." },
];
const STILL_TARGETS = [
  { id: "mj_magnific", label: "Midjourney → Magnific" },
  { id: "flux", label: "Flux / Krea" },
  { id: "ideogram", label: "Ideogram" },
];
const ASPECTS = ["2.39:1", "2.35:1", "2:1", "1.85:1", "1.66:1", "16:9", "4:3", "1:1", "9:16"];

/* project format presets — industry standard up to 4K/60; beyond = custom */
const RES_PRESETS = [
  { id: "sd-ntsc", label: "SD NTSC", w: 720, h: 480 },
  { id: "sd-pal", label: "SD PAL", w: 720, h: 576 },
  { id: "hd720", label: "HD 720p", w: 1280, h: 720 },
  { id: "hd1080", label: "HD 1080p", w: 1920, h: 1080 },
  { id: "2k-dci", label: "2K DCI", w: 2048, h: 1080 },
  { id: "uhd4k", label: "UHD 4K", w: 3840, h: 2160 },
  { id: "dci4k", label: "DCI 4K", w: 4096, h: 2160 },
  { id: "custom", label: "CUSTOM", w: 0, h: 0 },
];
const FPS_OPTIONS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
const isDropCapable = (fps) => Math.abs(fps - 29.97) < 0.01 || Math.abs(fps - 59.94) < 0.01;

/* world knowledge sub-categories */
const WORLD_CATS = [
  { id: "environments", label: "ENVIRONMENTS" },
  { id: "props", label: "PROPS" },
  { id: "logic", label: "WORLD LOGIC & RULES" },
  { id: "lore", label: "LORE & HISTORY" },
  { id: "places", label: "PLACES" },
  { id: "sets", label: "SETS" },
];
const FOLDER_MAP = [
  [/environment|biome|terrain|landscape|atmos/i, "environments"],
  [/prop|object|item|weapon|artifact|vehicle/i, "props"],
  [/logic|rule|system|magic|tech\b|physics|law/i, "logic"],
  [/lore|history|backstory|timeline|canon|myth|legend/i, "lore"],
  [/place|location|map|city|town|region|district|geograph/i, "places"],
  [/\bset\b|sets\b|stage|interior|exterior|build/i, "sets"],
  [/character|cast|people|hero|villain/i, "__cast"],
];
// Content licensing surfaces (badges / warnings / terms) only show when the
// CONTENT_LICENSING flag is on (off by default) — matches the Chora picker gate.
const licensingEnabled = () => {
  const u = auth.currentUser;
  return isFeatureEnabled("CONTENT_LICENSING", u?.uid || "", u?.email === "kmoody2003@gmail.com");
};

// Per-project clearance for a music track: freely usable (open license), owned by
// the editor, or licensed via a paid grant for THIS edit. Else it needs a license.
const trackClearance = (meta, grants, editId, uid) => {
  const li = syncLicenseInfo(meta);
  const owned = !!(meta?.rightsOwnerId && uid && meta.rightsOwnerId === uid);
  if (li.usable || owned) return { cleared: true, needsLicense: false, fee: 0, li, granted: false };
  const granted = !!(editId && grants && grants.has(grantKey(meta?.id, editId)));
  if (granted) return { cleared: true, needsLicense: false, fee: 0, li, granted: true };
  const fee = Number(meta?.syncLicenseFee || 0);
  return { cleared: false, needsLicense: fee > 0, fee, li, granted: false };
};

const EXT_TYPE = (name) => {
  const e = (name.split(".").pop() || "").toLowerCase();
  // Graphics / 3D / text stay hard-coded (the codec matrix only covers A/V/still media).
  if (["svg", "ai", "eps", "psd"].includes(e)) return "graphic";
  if (["glb", "gltf", "obj", "fbx", "stl", "usdz", "blend", "c4d"].includes(e)) return "model";
  if (["txt", "md", "json", "csv", "rtf"].includes(e)) return "text";
  if (e === "gif") return "image";
  const k = codecKind(name);            // 'video' | 'audio' | 'image' | null
  if (k) return k;
  return "graphic";
};

/* cinematic looks (3D-LUT gallery — preview approximated via CSS, full strength in prompts) */
const LOOKS = [
  { id: "k2383", name: "KODAK 2383 PRINT", sw: ["#1a2733", "#c9a36a", "#e8e3d5", "#5a3b2e"], filter: "contrast(1.12) saturate(1.08) sepia(.08)", prompt: "Kodak 2383 print film emulation: rich blacks with teal shadow lean, warm amber highlights, gentle highlight rolloff, subtle halation" },
  { id: "eterna", name: "FUJI ETERNA", sw: ["#2e3a36", "#9fb3a5", "#e3e7df", "#7a6f5e"], filter: "contrast(.94) saturate(.82)", prompt: "Fuji Eterna look: soft low-contrast curve, muted greens, creamy desaturated skin tones, cinematic flat grade" },
  { id: "noir", name: "TUNGSTEN NOIR", sw: ["#0a0a0d", "#3d2f1e", "#b07c3f", "#f0d9a8"], filter: "contrast(1.25) brightness(.92) saturate(.85) sepia(.12)", prompt: "tungsten noir: deep crushed shadows, warm practical key sources, hard low-key contrast, amber-on-black palette" },
  { id: "tealorange", name: "TEAL & ORANGE", sw: ["#0e3a45", "#1a6d7a", "#e8843c", "#f5c89a"], filter: "contrast(1.1) saturate(1.25) hue-rotate(-6deg)", prompt: "modern blockbuster teal-and-orange grade: cool teal shadows and midtones against warm orange skin highlights, punchy saturation" },
  { id: "bleach", name: "BLEACH BYPASS", sw: ["#22221f", "#6e6a60", "#b8b4a8", "#e8e6df"], filter: "contrast(1.35) saturate(.45)", prompt: "bleach bypass process: retained silver look, desaturated high-contrast image, gritty metallic texture, harsh detail" },
  { id: "dfn", name: "DAY FOR NIGHT", sw: ["#0b1426", "#1d2f52", "#3e5a8a", "#8aa3c9"], filter: "brightness(.7) contrast(1.1) saturate(.7) hue-rotate(15deg)", prompt: "day-for-night grade: deep blue cast, underexposed two stops, suppressed highlights, moonlit cool palette" },
  { id: "pastel", name: "ANDERSON PASTEL", sw: ["#f3d9c6", "#d98f7e", "#a8c5c0", "#f0e6b8"], filter: "contrast(.92) saturate(1.18) brightness(1.06)", prompt: "symmetrical pastel storybook grade: lifted blacks, candy-pastel palette, flat even lighting, high-key whimsy" },
];

/* local generation engine kinds — local-first, extensible */
const ENGINE_KINDS = [
  { id: "comfyui", label: "ComfyUI (local)", hint: "Universal local host — runs FLUX schnell/klein, Z-Image-Turbo, SDXL, SD3.5, LTX-2.3 video. Paste a workflow JSON with {{PROMPT}} placeholder.", testPath: "/system_stats" },
  { id: "ltx", label: "LTX-2.3 server (local)", hint: "Lightricks LTX Desktop / API — local 4K50 video gen on consumer GPUs.", testPath: "/" },
  { id: "rest", label: "Custom REST", hint: "POST {prompt} → expects JSON {url} back. Wrap anything: FastSD, your own service, a cloud relay.", testPath: "/" },
];

/* per-clip effects defaults — the compositing model */
const FX_DEFAULTS = { op: 1, sc: 1, x: 0, y: 0, rot: 0, blur: 0, bri: 1, con: 1, sat: 1, blend: "normal", fadeIn: 0, fadeOut: 0, matte: { t: "none", x: 50, y: 50, w: 60, h: 60, f: 0 }, stack: [], genNote: "" };
const ensureFx = (c) => ({ ...FX_DEFAULTS, ...(c.fx || {}), matte: { ...FX_DEFAULTS.matte, ...(c.fx?.matte || {}) }, stack: Array.isArray(c.fx?.stack) ? c.fx.stack : [] });
const BLENDS = ["normal", "multiply", "screen", "overlay", "soft-light", "hard-light", "lighten", "darken", "difference", "color-dodge"];

const TRACKS = [
  { id: "v2", name: "V2 · OVERLAY", type: "video" },
  { id: "v1", name: "V1 · PICTURE", type: "video" },
  { id: "a1", name: "A1 · DIALOGUE", type: "audio" },
  { id: "a2", name: "A2 · MUSIC", type: "audio" },
];

const BLANK_SCENE = () => ({
  id: uid(), title: "", slugline: "", mode: "dialogue", script: "",
  tone: "", environment: "", styleNotes: "",
  bible: null, shots: [], timeline: { clips: [] }, updatedAt: Date.now(),
});

/* ---------------- storage ---------------- */
// Persistence: IndexedDB via idb-keyval. (The original artifact used the Claude
// artifact runtime's window.storage, which does not exist in a normal browser —
// so projects silently never saved/loaded inside Plajah. IndexedDB also handles
// large editing projects far better than localStorage's ~5MB cap.) Falls back to
// the artifact's window.storage if it ever IS present.
// Media + proxy bytes route through the OPFS media substrate (fast, high-capacity, out of the IDB
// value store); everything else (project docs, index, settings) stays in idb-keyval. Callers are
// unchanged — they still stGet/stSet "studio:blob:<id>" / "studio:proxy:<id>".
const isMediaKey = (k) => typeof k === "string" && (k.startsWith("studio:blob:") || k.startsWith("studio:proxy:"));
async function stGet(k) {
  try {
    if (isMediaKey(k)) return (await mediaGetBytes(k)) || null;
    const r = await idbGet(k);
    if (r !== undefined && r !== null) return r;
    if (typeof window !== "undefined" && window.storage?.get) {
      const legacy = await window.storage.get(k);
      return legacy ? JSON.parse(legacy.value) : null;
    }
    return null;
  } catch { return null; }
}
async function stSet(k, v) { try { if (isMediaKey(k)) return await mediaPutBytes(k, v); await idbSet(k, v); return true; } catch { return false; } }
async function stDel(k) { try { if (isMediaKey(k)) { await mediaDelBytes(k); return; } await idbDel(k); } catch {} }

/* ---------------- Claude API + robust JSON ---------------- */
// Firebase restores the session asynchronously on load, so auth.currentUser can be
// momentarily null even for a signed-in user. Wait for it, then mint a token
// (force-refresh on demand to dodge a stale-token 401).
async function getAuthToken(forceRefresh = false) {
  let u = auth.currentUser;
  if (!u) {
    u = await new Promise((res) => {
      const unsub = onAuthStateChanged(auth, (usr) => { unsub(); res(usr); });
      setTimeout(() => { try { unsub(); } catch {} res(auth.currentUser); }, 5000);
    });
  }
  if (!u) return null;
  try { return await u.getIdToken(forceRefresh); } catch { return null; }
}

async function callClaude(system, user, maxRetries = 2) {
  // /api/ai/anthropic is behind authMiddleware — attach a fresh Firebase ID token,
  // and on a 401 force-refresh the token and retry (covers stale/just-restored auth).
  let token = await getAuthToken();
  let lastErr;
  for (let a = 0; a <= maxRetries; a++) {
    try {
      const res = await fetch("/api/ai/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000, system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (res.status === 401) { token = await getAuthToken(true); const b = await res.json().catch(() => ({})); lastErr = new Error(`auth (${b.error || "401"})`); continue; }
      if (!res.ok) { const b = await res.json().catch(() => ({})); lastErr = new Error(`AI ${res.status}${b.error ? ": " + b.error : ""}`); continue; }
      const data = await res.json();
      const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("\n");
      if (!text) { lastErr = new Error("empty response"); continue; }
      return text;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("AI request failed");
}
const stripTC = (s) => s.replace(/,\s*([}\]])/g, "$1");
function balanceWalk(t) {
  let out = "", inStr = false, esc = false; const stack = [];
  for (const ch of t) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === "\\") { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === "\n" || ch === "\r") { out += "\\n"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      out += ch; continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    if (ch === "{" || ch === "[") { stack.push(ch); out += ch; continue; }
    if (ch === "}" || ch === "]") { stack.pop(); out += ch; continue; }
    out += ch;
  }
  if (inStr) out += '"';
  out = out.replace(/,\s*$/, "").replace(/:\s*$/, ': ""');
  while (stack.length) { const b = stack.pop(); out += b === "{" ? "}" : "]"; }
  return stripTC(out);
}
function parseJsonRobust(text) {
  let t = text.replace(/```json|```/gi, "").trim();
  const s = t.indexOf("{"); if (s === -1) throw new Error("No JSON found");
  t = t.slice(s);
  const e = t.lastIndexOf("}");
  if (e !== -1) { try { return JSON.parse(stripTC(t.slice(0, e + 1))); } catch {} }
  try { return JSON.parse(balanceWalk(t)); } catch {}
  let cut = t;
  for (let i = 0; i < 6; i++) {
    const lc = cut.lastIndexOf(","); if (lc <= 0) break;
    cut = cut.slice(0, lc);
    try { return JSON.parse(balanceWalk(cut)); } catch {}
  }
  throw new Error("Could not repair JSON");
}
async function callClaudeJson(system, user) {
  let err;
  for (let a = 0; a < 2; a++) {
    const raw = await callClaude(system, user);
    try { return parseJsonRobust(raw); } catch (e) { err = e; }
  }
  throw new Error("agent response unparseable — " + err.message);
}

/* ---------------- prompts ---------------- */
const AGENT = `You are SLATE, a cinematic intelligence agent — a fusion of seasoned screenwriter, script supervisor, production designer, and Director of Photography (think Deakins-level craft). You read scenes for INTENT and SUBTEXT, not just surface action. You design coverage that serves the story: where the camera is, what lens, what light, and WHY. You think in eyelines, axis, escalation, and emotional geography. You are precise, technical, and never generic.`;

const FORMAT_AGNOSTIC = `READING RULES — the material may arrive in ANY form: formatted screenplay, loose prose, a story, chat-style exchange, rough notes, or a one-paragraph concept. Do NOT require screenplay formatting. Read it as a storyteller:
- Attribute every dialogue line to its speaker via any signal: NAME: line, quoted dialogue with tags, alternating rhythm, vocative clues, narrative logic.
- Treat prose description and stage notes as action/direction cues.
- If a speaker is ambiguous, make the most story-logical attribution rather than dropping the line.
- Reported speech counts as a beat, not a line. Never invent dialogue; never lose dialogue.`;

const JSON_RULES = `STRICT JSON OUTPUT RULES: respond with valid JSON only — no preamble, no fences. Escape double quotes inside strings. No raw line breaks inside string values. No trailing commas. Keep the ENTIRE response short enough that it never truncates.`;

const bibleSystem = () => `${AGENT}\n\n${FORMAT_AGNOSTIC}\n\nTASK: Produce a SCENE BIBLE — the consistency backbone reused verbatim across every generated prompt. If PRODUCTION CONTEXT (world, themes, established cast looks) is provided, stay rigorously consistent with it.\n\n${JSON_RULES}\nSchema:\n{\n "intent": "1-2 sentences: what this scene is really about dramatically",\n "subtext_read": "1-2 sentences: what's underneath the lines",\n "suggestions": ["2-4 short concrete ways to sharpen the scene"],\n "characters": [{"name":"NAME","visual_lock":"one dense sentence: age, face, hair, build, wardrobe, defining detail — pasted verbatim into image prompts","voice_profile":"timbre, pitch, pace, accent, texture — usable as a TTS voice-design description","arc_in_scene":"short phrase: emotional start to end"}],\n "environment_lock": "one dense sentence: architecture, surfaces, dressing, era, condition — pasted verbatim into every prompt",\n "lighting_plan": "key source, quality, color temp, practicals, time of day, evolution across the scene",\n "palette": "3-5 colors and texture notes defining the grade"\n}\nHonor provided character references exactly — extend, never contradict. If a character has an established look from production context, REUSE IT VERBATIM (adapt wardrobe only if this scene requires).`;

const detectSystem = () => `${AGENT}\n\n${FORMAT_AGNOSTIC}\n\nTASK: Extract every CHARACTER who appears, speaks, or acts — whatever the format. Infer what the text supports: explicit description plus careful inference from dialogue voice, actions, relationships, era, setting. Phrase inferences as inferences. Leave thin if the text is thin.\n\n${JSON_RULES}\nSchema:\n{"characters":[{"name":"name the story uses (or role, e.g. WAITRESS)","ref":"inferred visual: age range, build, wardrobe, physical details. Empty if nothing inferable.","voice":"inferred voice: register, pace, attitude, accent. Empty if nothing inferable.","evidence":"under 10 words: what supports this read"}]}\nInclude unnamed but present figures who act or speak. Exclude characters only mentioned.`;

const shotListSystem = (mode) => {
  const rules = mode === "action"
    ? `MODE: ACTION SET PIECE. Break action into beats. Geography first, then escalating coverage — wides for choreography, mediums for impact, CUs and inserts for detail/pain/decision, kinetic moves for peaks. Vary rhythm: long-short-short-long. Every shot advances the set piece's mini-story (setup, complication, turn, cost).`
    : `MODE: DIALOGUE SCENE. Every dialogue line gets a shot assignment. Grammar available: establishing, master, 50-50, OTS pairs, singles, inserts, reactions — BREAK grammar when subtext demands. Reactions often beat the speaker. Plan size progression tracking emotional escalation.`;
  return `${AGENT}\n\n${FORMAT_AGNOSTIC}\n\nTASK: Design the shot list for maximum storytelling flow. ${rules}\n\n${JSON_RULES}\nSchema:\n{"shots":[{"slug":"1A","type":"shot size + setup, e.g. 'OTS MED — MAYA'","subject":"who/what the frame is about, 3-8 words","character":"speaking character name, empty if none","lines":"verbatim dialogue covered, or the action beat. Empty if silent.","camera":"lens mm, angle, movement — terse","purpose":"storytelling reason, under 12 words"}]}\nRules: 6-14 shots. Cover EVERY dialogue line. Terse fields — skeleton only. Order = edit order.`;
};

const shotPromptSystem = (service, stillTarget, aspect) => {
  const svc = SERVICES.find((s) => s.id === service) || SERVICES[0];
  const dlg = service === "veo"
    ? "Video service supports native audio: include the spoken line in quotes with delivery direction inside the video prompt."
    : "Video service does NOT generate dialogue audio: direct the PERFORMANCE of the line (mouth, breath, expression); audio added in post via TTS + lip-sync.";
  return `${AGENT}\n\nTASK: Write production-ready generation prompts for ONE shot, given the Scene Bible (identity locks), shot spec, and neighbors.\n\nVIDEO TARGET: ${svc.label}. ${svc.hint} ${dlg}\nSTILL TARGET: ${stillTarget}. ASPECT: ${aspect}.\n\n${JSON_RULES}\nSchema:\n{\n "still": "full text-to-image prompt. Open with framing + lens, paste relevant character visual_lock(s) and environment_lock VERBATIM, then blocking/pose/expression, lighting adapted from lighting_plan, grade/palette, technical tail: 'shot on Alexa 65, [lens]mm at T[stop], filmic grain, photorealistic, cinematic still, ${aspect}'. One paragraph.",\n "video": "image-to-video prompt assuming chosen still is the start frame: camera move, performance beats, micro-actions, atmosphere motion, pacing, duration (e.g. 5s). ${svc.label} phrasing.",\n "voice": "if there's a line: 'LINE: <verbatim>' then delivery direction (emotion, pace, breath placement, volume) referencing voice_profile. Empty if no line.",\n "continuity": "1 short line: what must match adjacent shots (light direction, props, eyeline, state)"\n}\nLocks verbatim, every time. Technically specific, never vague.`;
};

/* ---------------- pacing engine ---------------- */
function estimateShotSeconds(shot, mode) {
  const words = (shot.lines || "").trim() ? shot.lines.trim().split(/\s+/).length : 0;
  let d;
  if (!words) d = /EST|WIDE|MASTER/i.test(shot.type || "") ? 4 : 2;
  else if (mode === "action") d = Math.min(8, Math.max(2.5, words / 3 + 2));
  else d = Math.min(12, Math.max(2, words / 2.3 + 1.1));
  return Math.round(d * 10) / 10;
}
/* ---------------- professional SMPTE timecode (NDF + drop-frame) ---------------- */
const fmtTc = (s, fmt) => {
  const fps = fmt?.fps || 24;
  const drop = !!fmt?.drop && isDropCapable(fps);
  const base = drop ? (fps > 40 ? 60 : 30) : Math.round(fps);
  let fn = Math.max(0, Math.round(s * (drop ? (base * 1000) / 1001 : fps)));
  if (drop) {
    // standard SMPTE drop-frame renumbering (drops 2 or 4 frame NUMBERS per minute except every 10th)
    const dc = base === 60 ? 4 : 2;
    const fp10 = base * 600 - dc * 9;
    const fpm = base * 60 - dc;
    const d = Math.floor(fn / fp10), m = fn % fp10;
    fn += dc * 9 * d + (m > dc ? dc * Math.floor((m - dc) / fpm) : 0);
  }
  const fr = fn % base, sec = Math.floor(fn / base) % 60, min = Math.floor(fn / (base * 60)) % 60, hr = Math.floor(fn / (base * 3600));
  const sep = drop ? ";" : ":";
  return `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}${sep}${String(fr).padStart(2, "0")}`;
};

/* ---------------- asset intelligence: vision + text tagging ---------------- */
const blobToB64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1]);
  r.onerror = rej; r.readAsDataURL(blob);
});
async function imageUrlB64(url) {
  const b = await (await fetch(url)).blob();
  return { data: await blobToB64(b), media: b.type && b.type.startsWith("image") ? b.type : "image/png" };
}
function videoFrameB64(url) {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = url;
    const bail = setTimeout(() => rej(new Error("frame grab timeout")), 9000);
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        c.width = v.videoWidth || 640; c.height = v.videoHeight || 360;
        c.getContext("2d").drawImage(v, 0, 0);
        clearTimeout(bail);
        res({ data: c.toDataURL("image/jpeg", 0.82).split(",")[1], media: "image/jpeg" });
      } catch (e) { clearTimeout(bail); rej(e); }
    };
    v.onerror = () => { clearTimeout(bail); rej(new Error("video load failed")); };
  });
}
async function claudeVisionJson(images, prompt, maxRetries = 2) {
  // images: [{data, media}] — supports reference + candidate comparisons
  // Routed through /api/ai/anthropic (same auth + retry pattern as callClaude) —
  // the proxy holds the API key; it passes messages through untouched.
  const content = [...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.media, data: im.data } })), { type: "text", text: prompt }];
  let token = await getAuthToken();
  let lastErr;
  for (let a = 0; a <= maxRetries; a++) {
    try {
      const res = await fetch("/api/ai/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1024, messages: [{ role: "user", content }] }),
      });
      if (res.status === 401) { token = await getAuthToken(true); const b = await res.json().catch(() => ({})); lastErr = new Error(`auth (${b.error || "401"})`); continue; }
      if (!res.ok) { const b = await res.json().catch(() => ({})); lastErr = new Error(`AI ${res.status}${b.error ? ": " + b.error : ""}`); continue; }
      const data = await res.json();
      const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("\n");
      if (!text) { lastErr = new Error("empty response"); continue; }
      return parseJsonRobust(text);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("AI vision request failed");
}
async function claudeTagMedia(b64, media, hint) {
  return claudeVisionJson([{ data: b64, media }],
    `You are a film production asset librarian. This asset belongs to: ${hint}. Respond ONLY with JSON, no fences: {"tags":["5-8 short lowercase production tags: subject, era, mood, materials, lighting"],"note":"one dense sentence of production context for this asset"}`);
}
async function claudeTagText(text, hint) {
  return callClaudeJson(
    `You are a film production librarian. Respond ONLY with JSON: {"tags":["5-8 short lowercase tags"],"note":"one dense sentence: what this document establishes for the story world"}`,
    `Asset context: ${hint}\n\nDOCUMENT (excerpt):\n${text.slice(0, 2400)}`
  );
}
const filenameTags = (name, folder) =>
  Array.from(new Set((folder + " " + name.replace(/\.[^.]+$/, "")).toLowerCase().split(/[\s_\-./]+/).filter((w) => w.length > 2 && !/^\d+$/.test(w)))).slice(0, 6);

/* ---------------- timeline import: EDL · FCP7/Premiere XML · FCPXML ---------------- */
const tc2sec = (tc, fps) => {
  const p = tc.replace(";", ":").split(":").map(Number);
  if (p.length !== 4 || p.some(isNaN)) return null;
  return p[0] * 3600 + p[1] * 60 + p[2] + p[3] / fps;
};
const parseRational = (v) => {
  if (!v) return 0;
  const m = String(v).match(/^(-?\d+)(?:\/(\d+))?s?$/);
  if (!m) return 0;
  return m[2] ? parseInt(m[1]) / parseInt(m[2]) : parseInt(m[1]);
};
const mapTrack = (kind, layer) => kind === "audio" ? (layer >= 2 ? "a2" : "a1") : (layer >= 2 ? "v2" : "v1");

/** CMX3600 EDL → [{name, trackId, start, duration, srcIn}] */
function parseEDL(text, fps) {
  const events = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const ev = line.match(/^\s*\d+\s+(\S+)\s+(V|A2|AA\/V|A\/V|AA|A|B)\s+\S+(?:\s+\S+)?\s+(\d{2}[:;]\d{2}[:;]\d{2}[:;]\d{2})\s+(\d{2}[:;]\d{2}[:;]\d{2}[:;]\d{2})\s+(\d{2}[:;]\d{2}[:;]\d{2}[:;]\d{2})\s+(\d{2}[:;]\d{2}[:;]\d{2}[:;]\d{2})\s*$/);
    if (ev) {
      const [, reel, ch, srcIn, , recIn, recOut] = ev;
      events.push({ name: reel, channel: ch, srcIn: tc2sec(srcIn, fps), recIn: tc2sec(recIn, fps), recOut: tc2sec(recOut, fps) });
      continue;
    }
    const nm = line.match(/^\s*\*\s*FROM CLIP NAME:\s*(.+?)\s*$/i);
    if (nm && events.length) events[events.length - 1].name = nm[1];
  }
  const valid = events.filter((e) => e.recIn != null && e.recOut != null && e.recOut > e.recIn);
  if (!valid.length) return [];
  const offset = Math.min(...valid.map((e) => e.recIn)); // EDLs often start at 01:00:00:00
  const out = [];
  valid.forEach((e) => {
    const base = { name: e.name, start: e.recIn - offset, duration: e.recOut - e.recIn, srcIn: e.srcIn || 0 };
    const ch = e.channel.toUpperCase();
    if (ch.includes("V") || ch === "B") out.push({ ...base, trackId: "v1" });
    if (ch.includes("A")) out.push({ ...base, trackId: ch.includes("A2") ? "a2" : "a1" });
  });
  return out;
}

/** FCP7 / Premiere XML (xmeml) */
function parseXMEML(doc) {
  const out = [];
  const seq = doc.querySelector("sequence");
  if (!seq) return out;
  const seqTb = parseFloat(seq.querySelector(":scope > rate > timebase, media rate timebase")?.textContent) || 24;
  ["video", "audio"].forEach((kind) => {
    const media = seq.querySelector(`media > ${kind}`);
    if (!media) return;
    const trackEls = Array.from(media.children).filter((el) => el.tagName.toLowerCase() === "track");
    trackEls.forEach((trackEl, ti) => {
      trackEl.querySelectorAll(":scope > clipitem").forEach((ci) => {
        const tb = parseFloat(ci.querySelector("rate > timebase")?.textContent) || seqTb;
        const start = parseFloat(ci.querySelector(":scope > start")?.textContent);
        const end = parseFloat(ci.querySelector(":scope > end")?.textContent);
        const inF = parseFloat(ci.querySelector(":scope > in")?.textContent) || 0;
        if (isNaN(start) || isNaN(end) || start < 0 || end <= start) return; // skip transition stubs
        out.push({
          name: ci.querySelector(":scope > name")?.textContent || "clip",
          trackId: mapTrack(kind, ti + 1),
          start: start / tb, duration: (end - start) / tb, srcIn: inF / tb,
        });
      });
    });
  });
  return out;
}

/** FCPXML (Final Cut Pro X / Resolve export) — walks the primary spine + lanes */
function parseFCPXML(doc) {
  const out = [];
  const spines = doc.querySelectorAll("spine");
  if (!spines.length) return out;
  const spine = spines[0];
  const walk = (el, parentStart) => {
    Array.from(el.children).forEach((node) => {
      const tag = node.tagName.toLowerCase();
      if (!["asset-clip", "video", "clip", "mc-clip", "sync-clip", "title", "ref-clip", "gap"].includes(tag)) return;
      const offset = parseRational(node.getAttribute("offset")) + parentStart;
      const duration = parseRational(node.getAttribute("duration"));
      const lane = parseInt(node.getAttribute("lane") || "0");
      if (tag !== "gap" && duration > 0) {
        const isAudio = tag === "asset-clip" && node.getAttribute("audioRole") && !node.getAttribute("format");
        out.push({
          name: node.getAttribute("name") || tag,
          trackId: lane < 0 ? mapTrack("audio", -lane) : mapTrack(isAudio ? "audio" : "video", lane + 1),
          start: offset, duration, srcIn: parseRational(node.getAttribute("start")),
        });
      }
      // connected clips ride inside their parent
      walk(node, offset);
    });
  };
  walk(spine, 0);
  // normalize to zero
  if (out.length) {
    const min = Math.min(...out.map((c) => c.start));
    out.forEach((c) => { c.start -= min; });
  }
  return out;
}

function parseTimelineFile(filename, text, fps) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".edl")) return { clips: parseEDL(text, fps), format: "CMX3600 EDL" };
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML didn't parse — is the file intact?");
  if (doc.querySelector("fcpxml")) return { clips: parseFCPXML(doc), format: "FCPXML" };
  if (doc.querySelector("xmeml")) return { clips: parseXMEML(doc), format: "FCP7/Premiere XML" };
  throw new Error("Unrecognized format — expected EDL, FCPXML, or xmeml XML.");
}

/* ---------------- atoms ---------------- */
function CopyBtn({ text, label = "COPY", small }) {
  const [done, setDone] = useState(false);
  return (
    <button className={`copybtn ${small ? "sm" : ""}`} onClick={async (e) => {
      e.stopPropagation();
      try { await navigator.clipboard.writeText(text); }
      catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
      setDone(true); setTimeout(() => setDone(false), 1300);
    }}>{done ? "✓ COPIED" : label}</button>
  );
}

/* ════════════════════════ APP ════════════════════════ */
export default function Fabula() {
  /* ----- splash ----- */
  const [splash, setSplash] = useState(true);
  const [splashOut, setSplashOut] = useState(false);
  useEffect(() => {
    if (!splash) return;
    const t1 = setTimeout(() => setSplashOut(true), 4600);
    const t2 = setTimeout(() => setSplash(false), 5350);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [splash]);
  const skipSplash = () => { setSplashOut(true); setTimeout(() => setSplash(false), 400); };

  const [page, setPage] = useState("productions"); // productions | slate | edit
  const [index, setIndex] = useState([]);
  const [prod, setProd] = useState(null);
  const [syncGrants, setSyncGrants] = useState(() => new Set()); // "trackId::editId" keys the buyer holds
  const [sceneSel, setSceneSel] = useState(null); // {actId, sceneId}
  const [prodTab, setProdTab] = useState("structure"); // structure | cast | world | design | media
  const [mediaSearch, setMediaSearch] = useState("");  // keyword/tag search — shared media + edit pages
  const [mediaBin, setMediaBin] = useState("all");     // folder filter for the Media Assets tab
  const [mediaSel, setMediaSel] = useState(null);      // asset id being previewed in the Media Assets tab
  const [mediaCollapsed, setMediaCollapsed] = useState(() => new Set()); // collapsed folder paths in the tree
  const [mediaAddScene, setMediaAddScene] = useState("");                // "actId|sceneId" target for add-to-scene
  const [mediaPage, setMediaPage] = useState(1);                         // Media Assets grid page (1-based)
  const [mediaPageSize, setMediaPageSize] = useState(50);               // items per page: 25 | 50 | 75
  const [editPoolPage, setEditPoolPage] = useState(1);                   // edit-workspace media pool page
  const [srcPoolCap, setSrcPoolCap] = useState(300);                     // source-viewer pool: cap DOM cards on huge libraries
  const screenRef = useRef(null);                                        // program-monitor .screen element (for the GPU canvas to size to)
  const gpuRegRef = useRef(new Map());                                   // clip.id → { el, fx, fade, z } registered by eligible MonitorLayers
  const [gpuMonitor, setGpuMonitor] = useState(() => { try { return webgpuAvailable() && localStorage.getItem("fabula:gpuMonitor") === "on"; } catch { return false; } });
  const toggleGpuMonitor = () => setGpuMonitor((v) => { const n = !v; try { localStorage.setItem("fabula:gpuMonitor", n ? "on" : "off"); } catch { /* */ } if (!n) gpuRegRef.current.clear(); return n; });
  const [mediaAutoSync, setMediaAutoSync] = useState(() => { try { return localStorage.getItem("fabula:autoSyncMedia") === "1"; } catch { return false; } }); // default LOCAL-FIRST — big folders don't flood the cloud uploader
  const [syncPaused, setSyncPaused] = useState(false);                 // uploader paused (mirrors resumableUpload)
  const [scriptImporting, setScriptImporting] = useState(false); // Lorea .txt → structured script
  const [scriptMsg, setScriptMsg] = useState("");                // SLATE auto-breakdown progress
  const [connectWorldOpen, setConnectWorldOpen] = useState(false); // Plajah World link modal
  const [storageReady, setStorageReady] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [slateStep, setSlateStep] = useState("setup");
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("film");

  /* editor state */
  const [clips, setClips] = useState([]);
  const [saveState, setSaveState] = useState("idle"); // 'idle' | 'saving' | 'saved' | 'error'
  const clipsSaveTimer = useRef(null);
  const skipClipsSaveRef = useRef(false);
  const [editSel, setEditSel] = useState(null);     // standalone edit id (timelines independent of scenes)
  const [rendering, setRendering] = useState(false); // Pixels-powered MP4 render in progress
  const [renderPct, setRenderPct] = useState(0);
  const [renderStage, setRenderStage] = useState("");
  const renderAbortRef = useRef(null);
  // ── Render queue: several export jobs (format × range) run in sequence, with a
  //    done-list you can come back to. deliverRange picks what a new job covers. ──
  const [deliverRange, setDeliverRange] = useState("all"); // all | inout | markers
  const [renderQueue, setRenderQueue] = useState([]);      // {id,kind,label,t0,t1,status,pct}
  const [queueRunning, setQueueRunning] = useState(false);
  const queueAbortRef = useRef(false);
  const [editWs, setEditWs] = useState("edit");     // resolve-style workspace: media|edit|vfx|color|audio|deliver
  const [colorTab, setColorTab] = useState("wheels"); // color room control-bar tab: looks|wheels|curves|primaries
  const [audioTab, setAudioTab] = useState("mixer");  // audio room control-band tab: mixer|voice|clips
  const [vfxTab, setVfxTab] = useState("nodes");      // vfx room: nodes (primary, Mockup B) | comp | lottie | capture
  const [eyedrop, setEyedrop] = useState(false);      // qualifier eyedropper armed → next monitor click samples a key
  const [gradeLayer, setGradeLayer] = useState(0);    // color room: which grade layer the tabs edit (0 = base)
  const [colorStills, setColorStills] = useState([]); // grabbed reference stills {id,url,label} (session)
  const [wipeStill, setWipeStill] = useState(null);   // still id wiped against the grade monitor
  const [wipePos, setWipePos] = useState(0.5);        // wipe divider 0..1
  const [binFilter, setBinFilter] = useState("all");
  const sourceLeaseRef = useRef(null);
  const sourceRequestRef = useRef(0);
  useEffect(()=>()=>sourceLeaseRef.current?.release(),[]);
  const [previewAsset, setPreviewAsset] = useState(null); // source viewer (dual canvas, à la resolve)
  const [srcPlaying, setSrcPlaying] = useState(false);
  const [srcTc, setSrcTc] = useState(0);
  const [srcIn, setSrcIn] = useState(null);   // source-viewer mark-in (seconds into the asset)
  const [srcOut, setSrcOut] = useState(null);  // source-viewer mark-out
  const [srcDur, setSrcDur] = useState(0);     // source media real duration (from loadedmetadata)
  useEffect(() => { setSrcIn(null); setSrcOut(null); setSrcTc(0); }, [previewAsset?.id]); // reset marks on new source
  const srcVideoRef = useRef(null);
  const srcWantPlayRef = useRef(false); // autoplay the source on load (double-click behaviour)
  const relinkRef = useRef(null);       // hidden file input for relinking offline media
  const relinkTargetRef = useRef(null); // asset id being relinked
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selClipId, setSelClipId] = useState(null);
  const [selIds, setSelIds] = useState([]);        // timeline multi-select (Ctrl+click / marquee)
  const [tlMarquee, setTlMarquee] = useState(null); // live marquee rect over the timeline
  const [toolMode, setToolMode] = useState("select"); // select | razor
  const [zoom, setZoom] = useState(1);
  const [followPlayhead, setFollowPlayhead] = useState(() => { try { return localStorage.getItem('fabula:timeline:follow') !== '0'; } catch { return true; } });
  const followPlayheadRef = useRef(followPlayhead); followPlayheadRef.current = followPlayhead;
  /* edit toolset: snapping, clipboard, markers, in/out, undo history, shortcuts */
  const [snapOn, setSnapOn] = useState(true);
  const [trimMode, setTrimMode] = useState("normal"); // normal | ripple | roll | slip
  const [clipboard, setClipboard] = useState(null);
  const [audioEdit, setAudioEdit] = useState(null); // { clip, url, blob } → open AudioEditor
  const [stemBusy, setStemBusy] = useState(false);   // stem-split / separation in flight
  const [uploadPending, setUploadPending] = useState(0); // background resumable uploads still in flight
  const [syncFolders, setSyncFolders] = useState([]);    // watch folders for this project
  const [folderSyncing, setFolderSyncing] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);   // top menu bar: 'File' | 'Edit' | 'View' | 'Clip' | 'Help'
  const [repairTab, setRepairTab] = useState(false);
  const [poolSel, setPoolSel] = useState([]);       // selected media-pool asset ids (multi-select)
  const [poolCtx, setPoolCtx] = useState(null);     // media-pool right-click menu { x, y }
  const [marquee, setMarquee] = useState(null);     // rubber-band selection rect { x0, y0, x1, y1 }
  const folderRelinkRef = useRef(null);             // folder picker for batch relink
  const folderRelinkTargetsRef = useRef(null);      // asset ids to relink from a folder (null = all offline)
  const marqueeActiveRef = useRef(false);           // true while a marquee drag is happening (suppresses the click)
  const [markers, setMarkers] = useState([]);
  const [markIn, setMarkIn] = useState(null);
  const [markOut, setMarkOut] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  /* Clip right-click menu — the shared design-system primitive (ctx = clip id). */
  const clipMenu = useContextMenu((clipId) => {
    const c = clips.find((x) => x.id === clipId);
    if (!c) return [];
    const items = [
      { id: "copy", label: "Copy", icon: <Layers size={14} />, shortcut: "⌘C", onSelect: copySel },
      { id: "cut", label: "Cut", icon: <Scissors size={14} />, shortcut: "⌘X", onSelect: cutSel },
      { id: "paste", label: "Paste", icon: <Plus size={14} />, shortcut: "⌘V", disabled: !clipboard, onSelect: pasteClip },
      { kind: "separator" },
      { id: "trans", label: "Default transition", icon: <Wand2 size={14} />, onSelect: addCrossDissolve },
      { id: "split", label: "Split at playhead", icon: <Scissors size={14} />, onSelect: bladeAtPlayhead },
      { id: "dup", label: "Duplicate", icon: <Plus size={14} />, onSelect: duplicateSel },
    ];
    if (c.assetId) items.push(
      {id:"relink",label:"Relink source file…",onSelect:()=>openRelink(c.assetId)},
      {id:"repair",label:"Show in Media repair",onSelect:()=>{setPoolSel([c.assetId]);setRepairTab(true);setEditWs("media");const a=prod.mediaPool.find(x=>x.id===c.assetId);if(a)openInViewer(a,false);}}
    );
    if (c.assetId && c.trackId?.startsWith("v") && !c.av) {
      items.push({ id: "detach", label: "Split audio to track", icon: <Music size={14} />, shortcut: (selIds.length > 1 && selIds.includes(c.id)) ? `×${selIds.length}` : undefined, onSelect: () => detachAudio(c.id) });
    }
    items.push({ id: "transcribe", label: transcribing ? "Transcribing…" : "Transcribe clip", icon: <Captions size={14} />, disabled: transcribing || !c.assetId, onSelect: () => transcribeClip(c) });
    // Generation, in the cut. Only offered on clips that trace back to a SLATE shot — everything else
    // has no prompt to regenerate from, and a menu item that can only fail is worse than no item.
    if (c.shotId && shotForClip(c)) {
      items.push(
        { kind: "separator" },
        {
          id: "regen-video", label: c.kind === "script" ? "Generate shot…" : "Generate alternate take…",
          icon: <Sparkles size={14} />, shortcut: shotForClip(c)?.shot?.slug,
          onSelect: () => openGenForClip(c, "video"),
        },
        { id: "regen-still", label: "Generate still for this shot…", icon: <ImageIcon size={14} />, onSelect: () => openGenForClip(c, "still") },
      );
    }
    if (c.assetId && (c.trackId?.startsWith("a") || c.kind === "media")) {
      items.push(
        { kind: "separator" },
        { id: "ae", label: "Send to audio editor", icon: <SlidersHorizontal size={14} />, onSelect: () => openAudioEditor(c) },
        { id: "stem-vm", label: stemBusy ? "Separating…" : "Isolate vocals + music", icon: <Mic2 size={14} />, disabled: stemBusy, shortcut: "instant", onSelect: () => splitClipStems(c, "vocals-music") },
        { id: "stem-4", label: stemBusy ? "Separating…" : "Separate stems (Crossover)", icon: <Wand2 size={14} />, disabled: stemBusy, shortcut: "HQ", onSelect: () => splitClipStems(c, "4stem") },
        { id: "stem-v", label: stemBusy ? "Detecting…" : "Split voices to tracks (Crossover)", icon: <Users size={14} />, disabled: stemBusy, shortcut: "HQ", onSelect: () => splitClipStems(c, "voices") },
      );
    }
    items.push({ id: "toggle", label: c.disabled ? "Enable clip" : "Disable clip", icon: c.disabled ? <Unlock size={14} /> : <Lock size={14} />, onSelect: toggleDisable });
    items.push(
      { kind: "separator" },
      { id: "del", label: "Delete (leave gap)", icon: <Trash2 size={14} />, danger: true, shortcut: "Del", onSelect: liftDelete },
      { id: "ripple", label: "Ripple delete", icon: <Trash2 size={14} />, danger: true, onSelect: rippleDelete },
    );
    return items;
  });
  const [shortcutPrefs, setShortcutPrefs] = useState(() => loadShortcutPrefs());
  const rateRef = useRef(1);
  const histRef = useRef({ past: [], future: [] });
  const dragRef = useRef(null);
  const tlScrollRef = useRef(null);          // the scrolling timeline viewport (for zoom-to-fit width)
  const [tlHeight, setTlHeight] = useState(320); // resizable timeline height (drag the divider)
  // Resizable work sections (persisted): media-pool + inspector widths, pool view mode.
  const [panelSizes, setPanelSizes] = useState(() => { try { return JSON.parse(localStorage.getItem("fabula:panels") || "{}"); } catch { return {}; } });
  const panelSize = (key, fallback) => Number.isFinite(panelSizes[key]) ? panelSizes[key] : fallback;
  const divider = (key, fallback, props = {}) => <PanelDivider label={"Resize " + key} value={panelSize(key, fallback)} onChange={(value) => setPanelSizes((old) => ({ ...old, [key]: value }))} {...props} />;
  useEffect(() => { try { localStorage.setItem("fabula:panels", JSON.stringify(panelSizes)); } catch { /* optional */ } }, [panelSizes]);
  const [poolW, setPoolW] = useState(() => parseInt(localStorage.getItem("fabula:poolw"), 10) || 230);
  const [inspW, setInspW] = useState(() => parseInt(localStorage.getItem("fabula:inspw"), 10) || 262);
  const [poolView, setPoolView] = useState(() => localStorage.getItem("fabula:poolview") || "list"); // list | thumbs
  // Proxy media: 540p short-GOP instant-seek H.264 proxies per video asset (WebCodecs), stored in
  // IndexedDB. The MONITOR plays proxies (Resolve-style scrub perf); EXPORT always uses full-res.
  const [indexedMode, setIndexedMode] = useState(() => localStorage.getItem("fabula:decoder") === "indexed");
  const [proxyOn, setProxyOn] = useState(() => (localStorage.getItem("fabula:proxy") ?? "1") === "1");
  const [proxies, setProxies] = useState(() => new Map()); // assetId → object URL of proxy blob
  const [proxyBusy, setProxyBusy] = useState(null);        // "2/7 · name" while building
  const [guides, setGuides] = useState(() => localStorage.getItem("fabula:guides") === "1"); // title/action-safe overlay (never rendered)
  const [fxLibOpen, setFxLibOpen] = useState(() => localStorage.getItem("fabula:fxlib") === "1"); // effects library panel (edit page)
  const [ulOpen, setUlOpen] = useState(false); // Universal Library overlay
  const [poolImportOpen, setPoolImportOpen] = useState(false); // collapse the pool's import tools → pool reads as project contents
  // Export destinations: one rendered file, flag-routed to Reello and/or the Fabula library.
  const [exportReady, setExportReady] = useState(null); // { blob, name } — opens the destination dialog
  const [pubReello, setPubReello] = useState(true);     // default: Reello checked…
  const [pubVisibility, setPubVisibility] = useState("private"); // …but PRIVATE
  const [pubFabula, setPubFabula] = useState(false);
  const [pubTaleo, setPubTaleo] = useState(false);      // Taleo movies & TV catalog (subType MOVIE)
  const [pubDownload, setPubDownload] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [localFonts, setLocalFonts] = useState([]);        // families from the Local Font Access API
  const [ltGallery, setLtGallery] = useState(null);         // null | "add" | clipId being swapped
  const loadLocalFonts = async () => {
    try {
      if (typeof window.queryLocalFonts !== "function") { window.alert("This browser doesn't expose local fonts (Chrome/Edge only)."); return; }
      const fonts = await window.queryLocalFonts();
      const fams = Array.from(new Set(fonts.map((f) => f.family))).sort();
      setLocalFonts(fams);
      ping(`${fams.length} local font familes loaded`);
    } catch (e) { ping("Local fonts unavailable — " + (e?.message || "permission denied")); }
  };
  const activeViewerRef = useRef("program"); // "program" | "source" — which viewer Space controls
  const dragAssetRef = useRef(null);         // asset being dragged from the source viewer → timeline
  const saveTimer = useRef(null);
  const cancelRef = useRef(false);
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const pxPerSec = 46 * zoom;

  const ping = (m) => { setNotice(m); setTimeout(() => setNotice(""), 2600); };

  /* ----- boot ----- */
  useEffect(() => { (async () => {
    let localList = [];
    try { const idx = await stGet("studio:index"); localList = idx?.list || []; setIndex(localList); setStorageReady(true); }
    catch { setStorageReady(false); }
    // Cloud sync: projects durably live on the platform (Storage + Firestore), not just
    // this browser's IndexedDB. Merge the cloud list in (newest `updated` wins) so projects
    // survive local eviction / other devices, then back up any local-only projects to the cloud.
    try {
      const cloud = await listProjectsCloud();
      if (cloud.length || localList.length) {
        const byId = new Map();
        for (const e of localList) byId.set(e.id, e);
        for (const e of cloud) { const ex = byId.get(e.id); if (!ex || (e.updated || 0) > (ex.updated || 0)) byId.set(e.id, e); }
        const merged = [...byId.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0));
        setIndex(merged);
        stSet("studio:index", { list: merged });
        // Back up local-only projects to the cloud (best-effort) — rescues the current project.
        const cloudIds = new Set(cloud.map((e) => e.id));
        for (const e of localList) if (!cloudIds.has(e.id)) {
          const full = await stGet("studio:prod:" + e.id);
          if (full) saveProjectCloud(full).catch(() => {});
        }
      }
    } catch { /* offline — local cache still works */ }
    // Pixels → Fabula handoff: if a session was just exported, open that production
    // straight into its edit (the standalone timeline). Consumed once.
    try {
      const h = await stGet("studio:handoff");
      if (h?.prodId) {
        await stDel("studio:handoff");
        await openProduction(h.prodId);
        if (h.editId) { setEditSel(h.editId); setSceneSel(null); setPage("edit"); }
      } else if (h?.importClip) {
        // External clip handoff (e.g. "Send to Fabula" from a Reello live-stream replay): the clip
        // Blob was stashed under a plain idb key; pull it, then import it as a new edit silently.
        await stDel("studio:handoff");
        try {
          const rec = await idbGet("fabula:incomingClip");
          await idbDel("fabula:incomingClip");
          if (rec?.blob) {
            const file = new File([rec.blob], rec.name || "live-clip.webm", { type: rec.mime || "video/webm" });
            importEditToProduction(file, "scene");
          }
        } catch { /* clip missing — ignore */ }
      }
    } catch { /* no handoff */ }
  })(); }, []);

  /* ----- recover orphaned projects: the index list can lose an entry, but each project's full
     data survives under studio:prod:<id>. Rescan IndexedDB and merge any missing ones back in. ----- */
  const recoverProjects = async () => {
    try {
      const allKeys = await idbKeys();
      const prodKeys = (allKeys || []).filter((k) => typeof k === "string" && k.startsWith("studio:prod:"));
      const found = [];
      for (const k of prodKeys) {
        const p = await stGet(k);
        if (p && p.id) {
          const sceneCount = (p.acts || []).reduce((n, a) => n + (a.scenes || []).length, 0);
          found.push({ id: p.id, title: p.title || "Untitled", type: p.type || "film", updated: p.updatedAt || Date.now(), sceneCount });
        }
      }
      let added = 0;
      setIndex((cur) => {
        const byId = new Map((cur || []).map((x) => [x.id, x]));
        for (const r of found) if (!byId.has(r.id)) { byId.set(r.id, r); added++; }
        const next = [...byId.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0));
        stSet("studio:index", { list: next });
        return next;
      });
      return added;
    } catch { return 0; }
  };
  useEffect(() => { const t = setTimeout(() => recoverProjects(), 400); return () => clearTimeout(t); }, []);
  const onRecover = async () => { const n = await recoverProjects(); ping(n ? `Recovered ${n} project${n > 1 ? "s" : ""}.` : "No additional projects found in storage."); };

  /* ----- persistence (debounced full-production save) ----- */
  useEffect(() => {
    if (!prod) return;
    clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      await stSet("studio:prod:" + prod.id, prod);
      const sceneCount = prod.acts.reduce((n, a) => n + a.scenes.length, 0);
      const entry = { id: prod.id, title: prod.title, type: prod.type, updated: Date.now(), sceneCount };
      setIndex((cur) => {
        const next = cur.some((x) => x.id === prod.id) ? cur.map((x) => (x.id === prod.id ? entry : x)) : [entry, ...cur];
        stSet("studio:index", { list: next });
        return next;
      });
      // Durable cloud save. saveState reflects the CLOUD result so a failure to persist
      // to the platform is visible (local IndexedDB still holds a backup either way).
      const res = await saveProjectCloud(prod);
      setSaveState(res.ok ? "saved" : "error");
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [prod]);

  /* ----- derived ----- */
  const scene = useMemo(() => {
    if (!prod || !sceneSel) return null;
    const act = prod.acts.find((a) => a.id === sceneSel.actId);
    return act?.scenes.find((s) => s.id === sceneSel.sceneId) || null;
  }, [prod, sceneSel]);

  const allScenes = useMemo(() => prod ? prod.acts.flatMap((a) => a.scenes.map((s) => ({ actId: a.id, act: a, scene: s }))) : [], [prod]);

  /* ----- mutators ----- */
  // structuredClone is a native deep-clone — dramatically faster than the JSON round-trip on large
  // productions (thousands of pool assets), and it doesn't choke on non-JSON values. Fall back to JSON
  // where structuredClone is unavailable or a value isn't cloneable (e.g. a stray function/handle).
  const deepClone = (o) => { try { return typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)); } catch { return JSON.parse(JSON.stringify(o)); } };
  const updateProd = (mut) => setProd((p) => { if (!p) return p; const n = deepClone(p); mut(n); n.updatedAt = Date.now(); return n; });
  const updateScene = (mut) => updateProd((p) => {
    const act = p.acts.find((a) => a.id === sceneSel?.actId);
    const sc = act?.scenes.find((s) => s.id === sceneSel?.sceneId);
    if (sc) { mut(sc, p); sc.updatedAt = Date.now(); }
  });

  /* sync editor local clips <-> scene */
  useEffect(() => {
    const tl = editSel ? prod?.edits?.find((e) => e.id === editSel)?.timeline : scene?.timeline;
    skipClipsSaveRef.current = true; // this setClips is a LOAD, not an edit — don't re-commit it
    setClips(tl?.clips ? JSON.parse(JSON.stringify(tl.clips)) : []);
    setSelClipId(null); setPlayhead(0); setPlaying(false);
  }, [sceneSel?.sceneId, editSel, prod?.id]);
  const commitClips = (next) => {
    const v = next || clips;
    if (editSel) updateProd((p) => { const ed = p.edits.find((e) => e.id === editSel); if (ed) ed.timeline = { ...(ed.timeline || {}), clips: v }; });
    else updateScene((sc) => { sc.timeline = { ...(sc.timeline || {}), clips: v }; });
  };

  /* ----- continuous timeline autosave -----
     Any live edit to `clips` (drag, trim, blade, keyframe, inspector tweak) is
     debounced straight into the production so nothing lingers uncommitted — the
     full-production save above then persists it to storage. Skips the load-sync
     above so opening a scene doesn't count as an edit. */
  useEffect(() => {
    if (skipClipsSaveRef.current) { skipClipsSaveRef.current = false; return; }
    if (!prod || (!sceneSel && !editSel)) return;
    clearTimeout(clipsSaveTimer.current);
    clipsSaveTimer.current = setTimeout(() => commitClips(clips), 450);
    return () => clearTimeout(clipsSaveTimer.current);
  }, [clips]); // eslint-disable-line react-hooks/exhaustive-deps

  /* playback (rate-aware for JKL shuttle) — WALL-CLOCK, FRAME-GATED transport.
     The clock accumulates measured elapsed time in a ref every rAF (so it can never drift from
     the video's clock, unlike the old fixed-increment interval), but React state only updates
     when the playhead crosses a PROJECT FRAME boundary. Two wins: every rendered position lands
     exactly on a frame (frame-accurate by construction), and the whole editor re-renders at the
     project's 24/30fps instead of the display's 60–165Hz — the single biggest playback-perf lever
     in a component this size. */
  const clockRef = useRef(0);
  const gradeMonRef = useRef(null); // color page's GL grade-monitor canvas (scopes read it)
  const phlineRef = useRef(null);   // playhead line — moved imperatively during playback
  const tcRef = useRef(null);       // transport timecode — updated imperatively during playback
  const pxPerSecRef = useRef(46);   // kept current every render so the imperative line tracks zoom
  pxPerSecRef.current = pxPerSec;
  useEffect(() => {
    if (!playing) return undefined;
    const fps = vfmt?.fps || 24;
    clockRef.current = playhead;
    // ZERO-REACT TRANSPORT. The video/audio elements free-run on their own clocks during
    // playback; React is only needed when something on screen CHANGES STATE — a cut (buffer
    // swap), a subtitle/title entering or leaving, a fade animating. So: build the set of
    // those moments once, move the playhead line + timecode imperatively every rAF (no
    // re-render), and setPlayhead only when the clock crosses a boundary. Editor re-renders
    // during playback drop from ~30/sec to roughly one per cut — the difference between
    // "web app scrubbing along" and native-feeling playback.
    const bounds = timelineBoundaries(clips);
    // ── AUDIO-MASTERED TRANSPORT. At 1× the playhead derives from the playback
    // ENGINE's AudioContext clock (sample-accurate, immune to main-thread jank);
    // scheduled-buffer audio makes dropouts structurally impossible. The wall
    // clock only drives JKL shuttle (≠1×), where audio is silent by design.
    // syncLiveVideos slaves the visible <video>s to the same clock every ~160ms
    // with playbackRate nudges — no drift, no yank at cuts, no end-of-file wrap.
    const engineOpts = () => ({ clips, mediaPool: prod?.mediaPool || [], trackSettings: container?.timeline?.trackSettings || {}, t0: clockRef.current });
    if (rateRef.current === 1) startPlayback(engineOpts());
    let raf; let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now; // clamp tab-stall jumps
      const prev = clockRef.current;
      let cur;
      if (rateRef.current === 1) {
        if (!engineRunning()) startPlayback(engineOpts());       // gesture-gated ctx → retry until it runs
        cur = engineRunning() ? engineClock() : Math.max(0, prev + dt);
      } else {
        if (engineRunning()) stopPlayback();                     // shuttle: wall clock, engine silent
        cur = Math.max(0, prev + dt * rateRef.current);
      }
      clockRef.current = cur;
      syncLiveVideos(cur, rateRef.current);
      if (phlineRef.current) phlineRef.current.style.left = (128 + cur * pxPerSecRef.current) + "px";
      if (followPlayheadRef.current && tlScrollRef.current) {
        const el = tlScrollRef.current, x = 128 + cur * pxPerSecRef.current;
        if (x < el.scrollLeft + 150 || x > el.scrollLeft + el.clientWidth - 90) el.scrollLeft = Math.max(0, x - el.clientWidth * .35);
      }
      if (tcRef.current) tcRef.current.textContent = fmtTc(cur, vfmt);
      // Clip membership uses the actual clock. Rounding here can select the
      // outgoing clip and leave it active until the NEXT cut several seconds later.
      if (crossedTimelineBoundary(bounds, prev, cur)) setPlayhead(cur);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // On pause, land React exactly where the clock stopped (frame-quantized).
    return () => { cancelAnimationFrame(raf); stopPlayback(); setPlayhead(Math.max(0, Math.round(clockRef.current * fps) / fps)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  /* ----- production CRUD ----- */
  const migrate = (p) => {
    p.mediaPool = p.mediaPool || []; p.cast = p.cast || [];
    p.defaults = p.defaults || {};
    p.defaults.aspect = p.defaults.aspect || "2.39:1"; p.defaults.service = p.defaults.service || "kling";
    p.defaults.stillTarget = p.defaults.stillTarget || "mj_magnific"; p.defaults.style = p.defaults.style || "";
    p.defaults.format = p.defaults.format || { preset: "hd1080", label: "HD 1080p", w: 1920, h: 1080, fps: 30, drop: false };
    p.worldCats = p.worldCats || {};
    WORLD_CATS.forEach((c) => { p.worldCats[c.id] = p.worldCats[c.id] || []; });
    p.mediaPool.forEach((a) => { a.tags = a.tags || []; });
    p.cast.forEach((c) => { c.media = c.media || []; c.wardrobe = c.wardrobe || []; });
    p.design = p.design || {};
    p.design.briefs = p.design.briefs || { props: [], staging: [], stunts: [], storyboards: [] };
    p.design.lookId = p.design.lookId || null;
    p.design.luts = p.design.luts || [];
    p.design.palette = p.design.palette || [];
    p.edits = p.edits || []; // standalone timelines — docs, music videos, any cut not bound to a scene
    p.mediaPool.forEach((a) => { a.bin = a.bin || "imports"; });
    p.bins = p.bins || []; // user-created media bins (empty ones persist even with no assets yet)
    p.tracks = p.tracks && p.tracks.length ? p.tracks : TRACKS.map((t) => ({ ...t })); // dynamic, unlimited tracks
    // Ensure the standard audio pair exists — older projects predate A2, so it never rendered.
    ["a1", "a2"].forEach((aid) => {
      if (!p.tracks.some((t) => t.id === aid)) p.tracks.push({ id: aid, name: aid.toUpperCase() + (aid === "a1" ? " · DIALOGUE" : " · MUSIC"), type: "audio" });
    });
    return p;
  };

  const createProduction = async () => {
    if (!newTitle.trim()) return;
    const p = migrate({
      id: uid(), title: newTitle.trim(), type: newType, description: "",
      themes: "", world: "", cast: [], mediaPool: [],
      defaults: { style: "", aspect: "2.39:1", service: "kling", stillTarget: "mj_magnific" },
      acts: [1, 2, 3].map((n) => ({ id: uid(), number: n, title: "ACT " + ["I", "II", "III"][n - 1], scenes: [] })),
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    await stSet("studio:prod:" + p.id, p);
    saveProjectCloud(p).catch(() => {}); // durable platform copy (debounced save also covers edits)
    setProd(p); setNewTitle(""); setSceneSel(null); setProdTab("structure");
  };
  const openProduction = async (id) => {
    // Local-first (instant), cloud-fallback if IndexedDB lost it (the disappearing-project case).
    let p = await stGet("studio:prod:" + id);
    if (!p) {
      p = await loadProjectCloud(id);
      if (p) stSet("studio:prod:" + id, p).catch(() => {}); // re-seed the local cache
    }
    if (!p) { setError("Couldn't load that production."); return; }
    const mp = migrate(p);
    await rehydrateBlobs(mp); // local-first: prefer stashed original bytes, else cloud copy
    setProd(mp); setSceneSel(null); setProdTab("structure");
    scheduleAutoSync(null); // upload anything local that has no cloud copy yet (silent)
  };
  const deleteProduction = async (id) => {
    if (!window.confirm("Delete this production and everything inside it?")) return;
    await stDel("studio:prod:" + id);
    deleteProjectCloud(id).catch(() => {}); // remove the cloud copy too
    setIndex((cur) => { const n = cur.filter((x) => x.id !== id); stSet("studio:index", { list: n }); return n; });
    if (prod?.id === id) { setProd(null); setSceneSel(null); }
  };
  const addScene = (actId) => updateProd((p) => {
    const act = p.acts.find((a) => a.id === actId);
    const sc = BLANK_SCENE();
    sc.title = "SCENE " + (act.scenes.length + 1);
    sc.styleNotes = p.defaults.style;
    act.scenes.push(sc);
  });
  const deleteScene = (actId, sceneId) => {
    if (!window.confirm("Delete this scene?")) return;
    updateProd((p) => { const a = p.acts.find((x) => x.id === actId); a.scenes = a.scenes.filter((s) => s.id !== sceneId); });
    if (sceneSel?.sceneId === sceneId) setSceneSel(null);
  };
  const gotoScene = (actId, sceneId, target) => {
    setSceneSel({ actId, sceneId }); setEditSel(null); setPage(target);
    if (target === "slate") setSlateStep("setup");
  };

  /* ----- context assembly ----- */
  const productionContext = () => {
    if (!prod) return "";
    const cast = prod.cast.filter((c) => c.name?.trim());
    const worldKnowledge = WORLD_CATS.map((c) => {
      const items = (prod.worldCats?.[c.id] || []).filter((i) => i.name?.trim());
      if (!items.length) return "";
      return `${c.label}: ` + items.slice(0, 12).map((i) => `${i.name}${i.tags?.length ? " [" + i.tags.slice(0, 4).join(", ") + "]" : ""}${i.notes ? " — " + i.notes.slice(0, 110) : ""}`).join("; ");
    }).filter(Boolean).join("\n");
    return [
      `PRODUCTION CONTEXT — "${prod.title}" (${prod.type})`,
      prod.themes ? `THEMES: ${prod.themes}` : "",
      prod.world ? `WORLD BIBLE (stay consistent): ${prod.world.slice(0, 700)}` : "",
      worldKnowledge ? `WORLD KNOWLEDGE (established assets — reference and stay consistent):\n${worldKnowledge.slice(0, 1400)}` : "",
      cast.length ? `ESTABLISHED CAST (reuse these looks verbatim):\n${cast.map((c) => `- ${c.name}: ${c.looks || "look not yet established"}${c.voice ? ` | voice: ${c.voice}` : ""}${c.personality ? ` | ${c.personality.slice(0, 90)}` : ""}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
  };
  const sceneContext = () => [
    `SCENE: ${scene.slugline || scene.title}`,
    `MODE: ${scene.mode === "action" ? "ACTION SET PIECE" : "DIALOGUE SCENE"}`,
    productionContext(),
    scene.tone ? `EMOTIONAL TONE / SUBTEXT (from the filmmaker): ${scene.tone}` : "",
    scene.environment ? `ENVIRONMENT NOTES: ${scene.environment}` : "",
    scene.styleNotes ? `VISUAL STYLE / REFERENCES: ${scene.styleNotes}` : "",
    `ASPECT RATIO: ${prod.defaults.aspect}`,
    `\nSCRIPT / SCENE CONCEPT:\n${scene.script}`,
  ].filter(Boolean).join("\n\n");
  const bibleText = (b) => b ? [
    `INTENT: ${b.intent}`, `SUBTEXT: ${b.subtext_read}`,
    `CHARACTERS:\n${(b.characters || []).map((c) => `- ${c.name} | VISUAL_LOCK: ${c.visual_lock} | VOICE: ${c.voice_profile} | ARC: ${c.arc_in_scene}`).join("\n")}`,
    `ENVIRONMENT_LOCK: ${b.environment_lock}`, `LIGHTING_PLAN: ${b.lighting_plan}`, `PALETTE: ${b.palette}`,
  ].join("\n") : "";

  /* ----- WORLD: folder import + asset intelligence ----- */
  const [worldCat, setWorldCat] = useState("overview");
  const folderRef = useRef(null);
  const mirrorFolderRef = useRef(null);             // literal folder → mirrored bins (production Media tab + FSA fallback)
  const editFolderRef = useRef(null);               // same, but the editor media-page IMPORT FOLDER (own ref, no cross-mount clash)
  const mediaFilesRef = useRef(null);               // plain files → auto-tagged import (media assets tab)
  const scriptFilesRef = useRef(null);              // .txt/.md/.fountain → Lorea script structuring
  const [genOpen, setGenOpen] = useState(false);    // generation agent panel (Kling/Magnific → bins)
  // Context for the generation panel when it's opened from a SLATE shot card or a timeline clip rather
  // than the media pool — carries the compiled ShotSpec so the panel opens pre-filled with the shot's
  // prompt and the scene bible's identity locks as references. null = opened bare from the pool.
  const [genCtx, setGenCtx] = useState(null);

  const inferCategory = (relPath) => {
    for (const [re, cat] of FOLDER_MAP) if (re.test(relPath)) return cat;
    return null;
  };

  const tagWorldItem = async (catId, itemId) => {
    const item = prod.worldCats[catId].find((i) => i.id === itemId);
    const asset = item?.assetId ? prod.mediaPool.find((a) => a.id === item.assetId) : null;
    if (!item) return;
    setBusy(true); setBusyMsg(`Tagging "${item.name}"…`);
    try {
      const hint = `${WORLD_CATS.find((c) => c.id === catId)?.label} for the production "${prod.title}"${prod.themes ? " (themes: " + prod.themes + ")" : ""}`;
      let r = null;
      if (asset && (asset.type === "image" || asset.type === "graphic") && asset.url) {
        const { data, media } = await imageUrlB64(asset.url);
        r = await claudeTagMedia(data, media, hint);
      } else if (asset && asset.type === "video" && asset.url) {
        const { data, media } = await videoFrameB64(asset.url);
        r = await claudeTagMedia(data, media, hint);
      } else if ((asset && asset.type === "text") || item.notes) {
        r = await claudeTagText(item.textContent || item.notes || item.name, hint);
      } else {
        // audio / 3D model / offline: heuristic from name + folder (transcription hooks up server-side later)
        r = { tags: filenameTags(item.name, item.folder || ""), note: asset?.type === "audio" ? "Audio asset — tagged from filename; transcription needs a server-side service." : "Tagged from filename — no visual/text content readable in-browser." };
      }
      updateProd((p) => {
        const it = p.worldCats[catId].find((i) => i.id === itemId);
        if (it) {
          it.tags = Array.from(new Set([...(it.tags || []), ...(r.tags || [])])).slice(0, 10);
          if (r.note && !it.notes) it.notes = r.note;
          const a = it.assetId ? p.mediaPool.find((x) => x.id === it.assetId) : null;
          if (a) a.tags = it.tags;
        }
      });
      ping(`Tagged "${item.name}"`);
    } catch (e) { setError(`Tagging "${item.name}" failed — ${e.message}`); }
    setBusy(false);
  };

  const importWorldFolder = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true); setBusyMsg(`Reading folder — ${files.length} files…`);
    setError("");
    try {
      const entries = files
        .filter((f) => !f.name.startsWith("."))
        .map((f) => ({ f, rel: f.webkitRelativePath || f.name, type: EXT_TYPE(f.name), cat: null }));
      entries.forEach((e) => { e.cat = inferCategory(e.rel.split("/").slice(0, -1).join("/") + "/" + e.f.name); });

      // unresolved paths → one batched AI classification
      const unknown = entries.filter((e) => !e.cat);
      if (unknown.length) {
        setBusyMsg(`Classifying ${unknown.length} uncategorized files…`);
        try {
          const map = await callClaudeJson(
            `You are a film production librarian. Classify each file path into exactly one category id from: ${WORLD_CATS.map((c) => c.id).join(", ")}, or "__cast" for character material. Respond ONLY with JSON: {"map":{"<index>":"<category_id>"}}`,
            unknown.map((e, i) => `${i}: ${e.rel}`).join("\n")
          );
          unknown.forEach((e, i) => { const c = map.map?.[String(i)]; e.cat = WORLD_CATS.some((w) => w.id === c) || c === "__cast" ? c : "lore"; });
        } catch { unknown.forEach((e) => { e.cat = "lore"; }); }
      }

      const castSnapshot = prod.cast.map((c) => ({ ...c }));
      const findCastMatch = (str) => castSnapshot.find((c) => c.name.trim() && (str.toLowerCase().includes(c.name.trim().toLowerCase()) || c.name.trim().toLowerCase().includes(str.toLowerCase())));
      const verifyQueue = [];
      const newItems = [];
      for (const e of entries) {
        const folder = e.rel.split("/").slice(0, -1).join("/");
        const baseName = e.f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
        let textContent = "";
        if (e.type === "text") { try { textContent = (await e.f.text()).slice(0, 4000); } catch {} }

        if (e.cat === "__cast") {
          const folderSeg = folder.split("/").pop() || baseName;
          const match = findCastMatch(folderSeg) || findCastMatch(baseName);
          if (e.type === "text") {
            updateProd((p) => {
              let c = match ? p.cast.find((x) => x.id === match.id) : null;
              if (!c && !p.cast.some((x) => x.name.toLowerCase() === baseName.toLowerCase())) {
                c = { id: uid(), name: baseName.toUpperCase(), looks: "", voice: "", personality: "", dos: "", donts: "", media: [], wardrobe: [], evidence: "folder import" };
                p.cast.push(c);
              }
              if (c && textContent) c.personality = (c.personality ? c.personality + " " : "") + textContent.slice(0, 400);
            });
            continue;
          }
          // media in a character folder: create asset + attach (verified against the matched member's identity)
          const assetId = uid();
          const url = URL.createObjectURL(e.f);
          let memberId = match?.id;
          updateProd((p) => {
            p.mediaPool.push({ id: assetId, name: e.f.name, type: e.type, url, duration: e.type === "video" || e.type === "audio" ? 5 : 0, session: true, tags: [], worldCat: "__cast", bin: folder.split("/").pop() || "cast" });
            let c = memberId ? p.cast.find((x) => x.id === memberId) : null;
            if (!c) {
              c = { id: uid(), name: (folderSeg || baseName).toUpperCase().replace(/[_-]+/g, " "), looks: "", voice: "", personality: "", dos: "", donts: "", media: [], wardrobe: [], evidence: "folder import" };
              p.cast.push(c); memberId = c.id;
            }
            c.media.push({ assetId, role: e.type === "audio" ? "voice" : "reference", locked: false, note: "pending verification", verified: null });
          });
          if ((e.type === "image" || e.type === "video") && match) verifyQueue.push({ memberId, assetId, url, type: e.type, member: match });
          continue;
        }
        // non-cast files whose NAME matches a cast member also get identity-checked
        const nameMatch = (e.type === "image" || e.type === "video") ? findCastMatch(baseName) : null;

        const assetId = uid(), itemId = uid();
        const url = URL.createObjectURL(e.f);
        const item = { id: itemId, name: baseName, notes: e.type === "text" ? textContent.slice(0, 800) : "", textContent, tags: [], assetId, folder };
        updateProd((p) => {
          p.mediaPool.push({ id: assetId, name: e.f.name, type: e.type, url, duration: e.type === "video" || e.type === "audio" ? 5 : 0, session: true, tags: [], worldCat: e.cat, bin: folder.split("/").pop() || e.cat });
          p.worldCats[e.cat].push(item);
          if (nameMatch) {
            const c = p.cast.find((x) => x.id === nameMatch.id);
            if (c) c.media.push({ assetId, role: "reference", locked: false, note: "name match — pending verification", verified: null });
          }
        });
        if (nameMatch) verifyQueue.push({ memberId: nameMatch.id, assetId, url, type: e.type, member: nameMatch });
        newItems.push({ cat: e.cat, itemId, name: baseName, type: e.type, url, textContent, folder });
      }

      // visual identity verification (face / identifying features) — capped per import
      const toVerify = verifyQueue.slice(0, 4);
      for (let i = 0; i < toVerify.length; i++) {
        const q = toVerify[i];
        setBusyMsg(`Verifying "${q.member.name}" identity ${i + 1}/${toVerify.length}…`);
        try {
          const im = q.type === "video" ? await videoFrameB64(q.url) : await imageUrlB64(q.url);
          const r = await verifyCharacterAsset(q.member, im.data, im.media);
          updateProd((p) => {
            const c = p.cast.find((x) => x.id === q.memberId);
            const m = c?.media.find((x) => x.assetId === q.assetId);
            if (m) {
              m.verified = !!r.match; m.confidence = r.confidence;
              m.note = r.observed || "";
              m.suggestedWardrobe = r.wardrobe || []; m.suggestedProps = r.props || [];
              if (!r.match) m.note = "⚠ does not appear to be this character — " + (r.observed || "");
            }
          });
        } catch (e) { console.warn("[fabula] vision call failed", e); }
      }

      // auto-tag the first taggable assets from local records (state-safe); the rest tag on demand
      const taggable = newItems.filter((n) => ["image", "graphic", "video", "text"].includes(n.type)).slice(0, 6);
      for (let i = 0; i < taggable.length; i++) {
        const n = taggable[i];
        setBusyMsg(`Auto-tagging "${n.name}" (${i + 1}/${taggable.length})…`);
        try {
          const hint = `${WORLD_CATS.find((c) => c.id === n.cat)?.label} for the production "${prod.title}"`;
          let r;
          if (n.type === "video") { const { data, media } = await videoFrameB64(n.url); r = await claudeTagMedia(data, media, hint); }
          else if (n.type === "text") { r = await claudeTagText(n.textContent || n.name, hint); }
          else { const { data, media } = await imageUrlB64(n.url); r = await claudeTagMedia(data, media, hint); }
          updateProd((p) => {
            const it = p.worldCats[n.cat].find((i2) => i2.id === n.itemId);
            if (it) {
              it.tags = Array.from(new Set([...(it.tags || []), ...(r.tags || [])])).slice(0, 10);
              if (r.note && !it.notes) it.notes = r.note;
              const a = p.mediaPool.find((x) => x.id === it.assetId);
              if (a) a.tags = it.tags;
            }
          });
        } catch (e) { console.warn("[fabula] vision call failed", e); }
      }
      const castN = entries.filter((e) => e.cat === "__cast").length;
      ping(`Folder imported — ${entries.length - castN} world assets sorted${castN ? `, ${castN} routed to cast` : ""}, ${taggable.length} auto-tagged`);
    } catch (e) { setError("Folder import failed: " + e.message); }
    setBusy(false);
  };

  /* ----- CHARACTER intelligence: visual verification + extraction ----- */
  const charRefImage = (member) => {
    // first locked reference image asset, if any — used for face comparison
    for (const m of member.media || []) {
      if (m.locked && m.role === "reference") {
        const a = prod.mediaPool.find((x) => x.id === m.assetId);
        if (a && (a.type === "image" || a.type === "graphic") && a.url) return a;
      }
    }
    return null;
  };

  const verifyCharacterAsset = async (member, candB64, candMedia) => {
    const refAsset = charRefImage(member);
    const images = [{ data: candB64, media: candMedia }];
    let prompt;
    if (refAsset) {
      const ref = await imageUrlB64(refAsset.url);
      images.unshift({ data: ref.data, media: ref.media });
      prompt = `Image 1 is the LOCKED reference for the character "${member.name}". Image 2 is a candidate asset. Compare facial structure, hair, build, and identifying features. Respond ONLY with JSON: {"match":true|false,"confidence":0-100,"observed":"one sentence: identifying features seen","wardrobe":["visible wardrobe pieces"],"props":["objects the character holds/wears/uses"]}`;
    } else {
      prompt = `Character "${member.name}" is described as: ${member.looks || "no description yet"}. Does this image plausibly depict that character? Respond ONLY with JSON: {"match":true|false,"confidence":0-100,"observed":"one sentence: identifying features seen","wardrobe":["visible wardrobe pieces"],"props":["objects the character holds/wears/uses"]}`;
    }
    return claudeVisionJson(images, prompt);
  };

  const extractWardrobeProps = async (memberId, assetId) => {
    const member = prod.cast.find((c) => c.id === memberId);
    const asset = prod.mediaPool.find((a) => a.id === assetId);
    if (!member || !asset?.url) return;
    setBusy(true); setBusyMsg(`Reading wardrobe & props from "${asset.name}"…`);
    try {
      const im = asset.type === "video" ? await videoFrameB64(asset.url) : await imageUrlB64(asset.url);
      const r = await claudeVisionJson([{ data: im.data, media: im.media }],
        `This depicts the character "${member.name}" (${member.looks?.slice(0, 200) || ""}). Extract production design elements. Respond ONLY with JSON: {"wardrobe":["each distinct wardrobe piece, with color/material"],"props":["each distinct prop/object, with brief description"]}`);
      updateProd((p) => {
        const c = p.cast.find((x) => x.id === memberId);
        if (c) c.wardrobe = Array.from(new Set([...(c.wardrobe || []), ...(r.wardrobe || [])])).slice(0, 16);
        (r.props || []).forEach((pr) => {
          if (!p.worldCats.props.some((i) => i.name.toLowerCase() === pr.toLowerCase().slice(0, 40))) {
            p.worldCats.props.push({ id: uid(), name: pr.slice(0, 60), notes: `Extracted from ${member.name}'s asset "${asset.name}"`, tags: ["extracted", member.name.toLowerCase()], folder: "extracted" });
          }
        });
      });
      ping(`Extracted ${(r.wardrobe || []).length} wardrobe + ${(r.props || []).length} props → World/Props`);
    } catch (e) { setError("Extraction failed — " + e.message); }
    setBusy(false);
  };

  /* ----- PRODUCTION DESIGN agent ----- */
  const [designTab, setDesignTab] = useState("briefs");
  const buildDesignBriefs = async () => {
    const scripts = allScenes.filter(({ scene: s }) => s.script?.trim())
      .map(({ act, scene: s }) => `${act.title} / ${s.title} ${s.slugline}:\n${s.script.slice(0, 900)}`).join("\n\n");
    if (!scripts) { setError("No scene scripts yet — write scenes first, then the design agent reads them."); return; }
    setBusy(true); setBusyMsg("Design agent reading every scene — building briefs…");
    try {
      const r = await callClaudeJson(
        `${AGENT}\nYou are now acting as PRODUCTION DESIGNER + STUNT COORDINATOR + STORYBOARD SUPERVISOR. Read the scenes and identify what must be DESIGNED.\n${JSON_RULES}\nSchema: {"props":[{"name":"prop","scene":"scene ref","needs":"design requirements, under 15 words"}],"staging":[{"scene":"ref","plan":"blocking/staging need, under 18 words"}],"stunts":[{"scene":"ref","beats":"stunt/choreo beats, under 18 words","safety":"key safety note"}],"storyboards":[{"scene":"ref","hint":"what the boards must solve, under 15 words"}]} Max 8 entries per list. Only what the script genuinely requires.`,
        `${productionContext()}\n\nSCENES:\n${scripts.slice(0, 6000)}`
      );
      updateProd((p) => {
        p.design.briefs = {
          props: (r.props || []).map((b) => ({ ...b, id: uid(), doc: "" })),
          staging: (r.staging || []).map((b) => ({ ...b, id: uid(), doc: "" })),
          stunts: (r.stunts || []).map((b) => ({ ...b, id: uid(), doc: "" })),
          storyboards: (r.storyboards || []).map((b) => ({ ...b, id: uid(), doc: "" })),
        };
      });
      ping("Design briefs built from the script");
    } catch (e) { setError("Brief generation failed — " + e.message); }
    setBusy(false);
  };
  const developBrief = async (kind, id) => {
    const brief = prod.design.briefs[kind].find((b) => b.id === id);
    if (!brief) return;
    setBusy(true); setBusyMsg(`Developing ${kind} design — "${brief.name || brief.scene}"…`);
    const roles = { props: "prop designer: materials, era accuracy, hero vs background versions, practical needs, generation prompt", staging: "staging designer: geography, blocking diagram in text, sightlines, camera positions, practical light sources", stunts: "stunt coordinator: beat-by-beat choreography, rigging/safety plan, camera coverage for impact, doubles vs principals", storyboards: "storyboard supervisor: panel-by-panel board list with framing, motion arrows, and the storytelling job of each panel" };
    try {
      const doc = await callClaude(
        `${AGENT}\nAct as ${roles[kind]}. Write a tight, production-usable design document. Plain text, short labeled sections, no markdown headers, under 350 words.`,
        `${productionContext()}\n\nBRIEF: ${JSON.stringify(brief)}\n\nRelevant world assets: ${(prod.worldCats.props || []).slice(0, 10).map((i) => i.name).join(", ") || "none yet"}`
      );
      updateProd((p) => { const b = p.design.briefs[kind].find((x) => x.id === id); if (b) b.doc = doc.trim(); });
    } catch (e) { setError("Development failed — " + e.message); }
    setBusy(false);
  };

  /* ----- ENGINES (local-first generation) ----- */
  const [engines, setEngines] = useState([]);
  useEffect(() => { (async () => { const e = await stGet("studio:engines"); if (e?.list) setEngines(e.list); })(); }, []);
  const saveEngines = (list) => { setEngines(list); stSet("studio:engines", { list }); };
  const testEngine = async (eng) => {
    setBusy(true); setBusyMsg(`Testing ${eng.name}…`);
    try {
      const kind = ENGINE_KINDS.find((k) => k.id === eng.kind);
      const res = await fetch(eng.url.replace(/\/$/, "") + (kind?.testPath || "/"), { method: "GET" });
      ping(res.ok ? `${eng.name} is reachable ✓` : `${eng.name} answered ${res.status}`);
    } catch { setError(`${eng.name} unreachable — is it running, and is CORS enabled? (ComfyUI: --enable-cors-header)`); }
    setBusy(false);
  };
  const generateViaEngine = async (shot, kind) => {
    const eng = engines[0];
    if (!eng) return;
    const promptText = kind === "video" ? shot.video : shot.still;
    setBusy(true); setBusyMsg(`Sending to ${eng.name}…`);
    try {
      if (eng.kind === "rest") {
        const res = await fetch(eng.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: promptText }) });
        const j = await res.json();
        if (j.url) {
          updateScene((sc) => { const t = sc.shots.find((s) => s.id === shot.id); if (t) t.frameUrl = j.url; });
          ping("Engine returned a frame — attached to the shot");
        } else ping("Engine accepted the prompt");
      } else if (eng.kind === "comfyui") {
        if (!eng.workflow?.includes("{{PROMPT}}")) { setError("Paste a ComfyUI workflow JSON containing {{PROMPT}} in the engine settings first."); setBusy(false); return; }
        const wf = JSON.parse(eng.workflow.replaceAll("{{PROMPT}}", promptText.replace(/"/g, '\\"').slice(0, 1800)));
        const res = await fetch(eng.url.replace(/\/$/, "") + "/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: wf }) });
        ping(res.ok ? "Queued in ComfyUI — pull the result from its output folder and attach it" : "ComfyUI rejected the workflow");
      } else {
        const res = await fetch(eng.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: promptText }) });
        ping(res.ok ? `Sent to ${eng.name}` : `${eng.name} answered ${res.status}`);
      }
    } catch (e) { setError(`Engine call failed — ${e.message}. Local engines need CORS enabled.`); }
    setBusy(false);
  };

  /* ----- SLATE actions ----- */
  const detectCharacters = async () => {
    if (!scene?.script?.trim()) { setError("Write or paste the scene first."); return; }
    setError(""); setBusy(true); setBusyMsg("Reading the story — detecting characters…");
    try {
      const parsed = await callClaudeJson(detectSystem(), `${productionContext()}\n\nSCRIPT / SCENE:\n${scene.script}`);
      const det = (parsed.characters || []).filter((c) => c.name?.trim());
      if (!det.length) { setError("No characters detected in the text."); setBusy(false); return; }
      updateProd((p) => {
        det.forEach((d) => {
          const ex = p.cast.find((c) => c.name.trim().toLowerCase() === d.name.trim().toLowerCase());
          if (ex) {
            if (!ex.looks?.trim() && d.ref) ex.looks = d.ref;
            if (!ex.voice?.trim() && d.voice) ex.voice = d.voice;
          } else {
            p.cast.push({ id: uid(), name: d.name, looks: d.ref || "", voice: d.voice || "", personality: "", dos: "", donts: "", evidence: d.evidence || "" });
          }
        });
      });
      ping(`${det.length} character${det.length > 1 ? "s" : ""} synced to the cast`);
    } catch (e) { setError("Character detection failed — try again. (" + e.message + ")"); }
    setBusy(false);
  };

  const generateBible = async () => {
    if (!scene?.script?.trim()) { setError("Write or paste the scene first."); return; }
    setError(""); setBusy(true); setBusyMsg("Reading the scene — intent, subtext, identity locks…");
    try {
      const b = await callClaudeJson(bibleSystem(), sceneContext());
      updateProd((p) => {
        const act = p.acts.find((a) => a.id === sceneSel.actId);
        const sc = act.scenes.find((s) => s.id === sceneSel.sceneId);
        sc.bible = b;
        // feed locks back into the production cast (fill gaps only)
        (b.characters || []).forEach((bc) => {
          const ex = p.cast.find((c) => c.name.trim().toLowerCase() === bc.name.trim().toLowerCase());
          if (ex) { if (!ex.looks?.trim()) ex.looks = bc.visual_lock; if (!ex.voice?.trim()) ex.voice = bc.voice_profile; }
          else p.cast.push({ id: uid(), name: bc.name, looks: bc.visual_lock, voice: bc.voice_profile, personality: "", dos: "", donts: "" });
        });
      });
      setSlateStep("bible");
    } catch (e) { setError("Bible generation failed — try again. (" + e.message + ")"); }
    setBusy(false);
  };

  const generateShotList = async () => {
    setError(""); setBusy(true); setBusyMsg("Designing coverage — building the shot list…");
    try {
      const parsed = await callClaudeJson(shotListSystem(scene.mode), `SCENE BIBLE:\n${bibleText(scene.bible)}\n\n${sceneContext()}`);
      const shots = (parsed.shots || []).map((s) => ({ ...s, id: uid(), still: "", video: "", voice: "", continuity: "", notes: "", status: "planned", frameUrl: "" }));
      updateScene((sc) => { sc.shots = shots; });
      setSlateStep("shots");
    } catch (e) { setError("Shot list failed — try again. (" + e.message + ")"); }
    setBusy(false);
  };

  const generateShotPrompts = async (shotId, notes = "") => {
    const list = scene.shots; const idx = list.findIndex((s) => s.id === shotId);
    const shot = list[idx], prev = list[idx - 1], next = list[idx + 1];
    const look = LOOKS.find((l) => l.id === prod.design?.lookId);
    const palette = (prod.design?.palette || []).filter((c) => c.meaning?.trim());
    const user = [
      `SCENE BIBLE:\n${bibleText(scene.bible)}`,
      `FILMMAKER STYLE: ${scene.styleNotes || "—"} | TONE: ${scene.tone || "—"}`,
      look ? `PRODUCTION LOOK (grade every prompt with this): ${look.name} — ${look.prompt}` : "",
      palette.length ? `COLOR-AS-THEME (use deliberately in dressing/light/grade): ${palette.map((c) => `${c.hex} = ${c.meaning}`).join("; ")}` : "",
      `THIS SHOT: ${shot.slug} | ${shot.type} | subject: ${shot.subject} | camera: ${shot.camera} | purpose: ${shot.purpose}`,
      shot.lines ? `COVERS: "${shot.lines}"` : "COVERS: silent beat",
      prev ? `PREVIOUS SHOT: ${prev.slug} ${prev.type} — ${prev.subject}` : "PREVIOUS SHOT: none (opener)",
      next ? `NEXT SHOT: ${next.slug} ${next.type} — ${next.subject}` : "NEXT SHOT: none (scene out)",
      notes ? `FILMMAKER CORRECTION NOTES (must obey): ${notes}` : "",
    ].filter(Boolean).join("\n\n");
    const p = await callClaudeJson(shotPromptSystem(prod.defaults.service, STILL_TARGETS.find((t) => t.id === prod.defaults.stillTarget)?.label, prod.defaults.aspect), user);
    updateScene((sc) => {
      const t = sc.shots.find((s) => s.id === shotId);
      if (t) { t.still = p.still || ""; t.video = p.video || ""; t.voice = p.voice || ""; t.continuity = p.continuity || ""; t.status = "ready"; }
    });
  };

  const generateAllPrompts = async () => {
    setError(""); setBusy(true); cancelRef.current = false;
    const ids = scene.shots.filter((s) => s.status !== "ready").map((s) => s.id);
    for (let i = 0; i < ids.length; i++) {
      if (cancelRef.current) break;
      const slug = scene.shots.find((s) => s.id === ids[i])?.slug;
      setBusyMsg(`Writing prompts — shot ${slug} (${i + 1}/${ids.length})…`);
      try { await generateShotPrompts(ids[i]); } catch { setError(`Shot ${slug} failed — retry it individually.`); }
    }
    setBusy(false);
  };

  /* ----- EDIT actions ----- */
  const buildEditFromBreakdown = () => {
    if (!scene?.shots?.length) { setError("No shot list yet — run the SLATE breakdown first."); return; }
    if (clips.length && !window.confirm("Rebuild the timeline from the breakdown? Current clips will be replaced.")) return;
    let cursor = 0; const next = [];
    scene.shots.forEach((shot) => {
      const dur = estimateShotSeconds(shot, scene.mode);
      next.push({ id: uid(), trackId: "v1", start: cursor, duration: dur, kind: "script", shotId: shot.id, label: `${shot.slug} · ${shot.type}` });
      if ((shot.lines || "").trim() && scene.mode !== "action") {
        next.push({ id: uid(), trackId: "a1", start: Math.round((cursor + 0.15) * 10) / 10, duration: Math.max(1, Math.round((dur - 0.3) * 10) / 10), kind: "voice", shotId: shot.id, label: shot.lines.slice(0, 40) });
      }
      cursor = Math.round((cursor + dur) * 10) / 10;
    });
    setClips(next); commitClips(next); setPlayhead(0); setSelClipId(null);
    ping(`Edit pre-built — ${scene.shots.length} shots, ${fmtTc(cursor, prod.defaults.format)} runtime, pacing from the script`);
  };

  const addAssetToPool = (asset) => updateProd((p) => { p.mediaPool.push(asset); });
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    const added = files.map((f) => {
      const isLottie = /\.(lottie)$/i.test(f.name) || (/\.json$/i.test(f.name)) || f.type === "application/json";
      const type = isLottie ? "lottie" : f.type.startsWith("video") ? "video" : f.type.startsWith("audio") ? "audio" : "image";
      const id = uid();
      addAssetToPool({ id, name: f.name, type, url: URL.createObjectURL(f), duration: type === "image" ? 0 : 5, session: true, bin: "imports" });
      stSet("studio:blob:" + id, f); // stash the bytes so the media survives a reload + can sync to cloud later
      return { id, f, type };
    });
    if (files.length) ping(`Imported ${files.length} asset${files.length > 1 ? "s" : ""}`);
    if (files.length) scheduleAutoSync(added.map((x) => x.id)); // cloud copy happens by itself
    e.target.value = "";
    // Crossover: probe real duration + browser-compatibility (client-side, instant),
    // replacing the old hardcoded 5s guess and flagging formats that won't decode.
    for (const { id, f, type } of added) {
      if (type === "lottie") continue; // vector animation — nothing to probe
      try {
        const probe = await crossover.probe({ id, name: f.name, kind: type, sizeBytes: f.size, file: f });
        const dur = probe.durationSec && isFinite(probe.durationSec) ? probe.durationSec : undefined;
        const incompatible = type !== "image" && (probe.corrupt || !dur);
        updateProd((p) => {
          const a = p.mediaPool.find((x) => x.id === id);
          if (!a) return;
          if (dur) a.duration = dur;
          if (probe.width) a.width = probe.width;
          if (probe.height) a.height = probe.height;
          if (probe.fps) a.fps = probe.fps;
          if (incompatible) a.needsConversion = true;
        });
        if (incompatible) ping(`"${f.name}" may not play/render in-browser — hit CONVERT on it to transcode via Crossover.`);
      } catch { /* probe is best-effort */ }
    }
  };

  // Crossover: transcode a media-pool asset to a browser-friendly format in place.
  // Audio converts instantly in-browser; video routes to the Crossover cloud.
  const convertAssetToBrowserFriendly = async (assetId) => {
    const a = (prod?.mediaPool || []).find((x) => x.id === assetId);
    if (!a?.url) { ping("This asset is offline — relink it first."); return; }
    ping(`Converting "${a.name}" via Crossover…`);
    try {
      const blob = await (await fetch(a.url)).blob();
      const kind = a.type === "audio" ? "audio" : a.type === "image" ? "image" : "video";
      const file = new File([blob], a.name, { type: blob.type || "application/octet-stream" });
      const recipe =
        kind === "audio" ? { containerId: "wav", audioCodecId: "pcm_s16le", hwAccel: "auto", qualityMode: "lossless", fixTimestamps: true }
        : kind === "image" ? { containerId: "png", imageFormatId: "png", hwAccel: "auto", qualityMode: "crf" }
        : { containerId: "mp4", videoCodecId: "h264", audioCodecId: "aac", hwAccel: "auto", qualityMode: "crf", crf: 20, audioBitrate: "256k", fixTimestamps: true };
      const result = await crossover.convert({ id: a.id, name: a.name, kind, sizeBytes: blob.size, file }, recipe, () => {});
      updateProd((p) => {
        const x = p.mediaPool.find((y) => y.id === assetId);
        if (x) { x.url = result.outputUrl; x.name = result.outputName; x.needsConversion = false; x.converted = true; }
      });
      ping(`Converted "${a.name}" (${result.backend === "client" ? "in browser" : "on Plajah cloud"}).`);
    } catch (err) {
      ping(`Convert failed: ${err?.message || err}. Video/pro formats need the Crossover cloud (deploy pending).`);
    }
  };
  const insertAssetClip = (asset, range, opts = {}) => {
    const isMc = asset.type === "multicam";
    // Honor a source-viewer in/out sub-range if a valid one was marked.
    const hasRange = range && range.in != null && range.out != null && range.out > range.in;
    const srcInVal = hasRange ? qFrame(range.in) : 0;
    const duration = Math.max(1 / (vfmt.fps || 24), qFrame(hasRange ? (range.out - range.in) : (asset.duration || 5)));
    const start = qFrame(opts.at != null ? Math.max(0, opts.at) : playhead);
    const aTrack = tracks.find((t) => t.type === "audio")?.id || "a1";
    const dropType = opts.trackId ? tracks.find((t) => t.id === opts.trackId)?.type : null;
    // Audio-only asset, OR dropped onto an audio track → a single audio clip.
    if (asset.type === "audio" || dropType === "audio") {
      const clip = { id: uid(), trackId: dropType === "audio" ? opts.trackId : aTrack, start, duration, srcIn: srcInVal, kind: "media", assetId: asset.id, label: asset.name };
      const next = [...clips, clip]; setClips(next); commitClips(next); setSelClipId(clip.id); return;
    }
    // Imported 3D model → a model3d clip (three.js render; camera/lighting live on clip.model3d).
    if (asset.type === "model") {
      const trackId = opts.trackId && dropType === "video" ? opts.trackId : "v1";
      const clip = { id: uid(), trackId, start, duration, srcIn: 0, kind: "model3d", assetId: asset.id, model3dUrl: asset.url, model3d: { ...MODEL3D_DEFAULT }, label: asset.name };
      const next = [...clips, clip]; setClips(next); commitClips(next); setSelClipId(clip.id); return;
    }
    // Multicam / stills / Lottie animations → single picture clip (no linked audio).
    if (isMc || asset.type === "image" || asset.type === "graphic" || asset.type === "lottie") {
      const trackId = opts.trackId && dropType === "video" ? opts.trackId : "v1";
      const clip = { id: uid(), trackId, start, duration, srcIn: srcInVal, kind: isMc ? "multicam" : "media", assetId: asset.id, label: asset.name, ...(isMc ? { angle: 0 } : {}) };
      const next = [...clips, clip]; setClips(next); commitClips(next); setSelClipId(clip.id); return;
    }
    // Video → linked picture + audio pair (the clip's sound rides an audio track so
    // track volume/pan/EQ apply). The picture clip is `av`-muted; audio plays via AudioLayer.
    const trackId = opts.trackId && dropType === "video" ? opts.trackId : "v1";
    const linkId = uid();
    const videoClip = { id: uid(), trackId, start, duration, srcIn: srcInVal, kind: "media", assetId: asset.id, label: asset.name, linkId, av: true };
    const audioClip = { id: uid(), trackId: aTrack, start, duration, srcIn: srcInVal, kind: "media", assetId: asset.id, label: asset.name + " · A", linkId };
    const next = [...clips, videoClip, audioClip]; setClips(next); commitClips(next); setSelClipId(videoClip.id);
  };
  // Detach a video clip's embedded audio onto an audio track (NLE "split/detach audio"). Mutes the
  // picture clip's built-in sound (av:true) so it isn't doubled, and links the pair (shared linkId) so
  // move/trim still ride together. Drops onto the first audio track that's free at the clip's time, else
  // adds a new one. Batches over the current selection when several video clips are picked.
  const detachAudio = (clipId) => {
    const targetIds = (selIds.length > 1 && selIds.includes(clipId)) ? selIds : [clipId];
    const curTracks = (prod?.tracks && prod.tracks.length) ? prod.tracks : TRACKS;
    let audioTrackIds = curTracks.filter((t) => t.type === "audio").map((t) => t.id);
    const addTracks = [];
    let working = [...clips];   // grows as we place audio clips (so overlap checks see them)
    let done = 0;
    for (const id of targetIds) {
      const c = clips.find((x) => x.id === id);
      if (!c?.assetId || !c.trackId.startsWith("v") || c.av) continue;
      const asset = prod?.mediaPool?.find((a) => a.id === c.assetId);
      const overlaps = (tid) => working.some((x) => x.trackId === tid && !(x.start + x.duration <= c.start + 1e-4 || x.start >= c.start + c.duration - 1e-4));
      let aTrack = audioTrackIds.find((tid) => !overlaps(tid));
      if (!aTrack) {
        const nums = audioTrackIds.map((t) => parseInt(t.slice(1), 10) || 0);
        const n = (nums.length ? Math.max(...nums) : 0) + 1; aTrack = "a" + n;
        audioTrackIds = [...audioTrackIds, aTrack]; addTracks.push({ id: aTrack, name: "A" + n, type: "audio" });
      }
      const linkId = c.linkId || uid();
      const audioClip = { id: uid(), trackId: aTrack, start: c.start, duration: c.duration, srcIn: c.srcIn || 0, kind: "media", assetId: c.assetId, label: (c.label || asset?.name || "clip") + " · A", linkId };
      working = working.map((x) => (x.id === c.id ? { ...x, av: true, linkId } : x)).concat(audioClip);
      done++;
    }
    if (!done) { ping("Pick a video clip that still has its audio."); return; }
    updateProd((p) => {
      p.tracks = (p.tracks && p.tracks.length) ? p.tracks : TRACKS.map((t) => ({ ...t }));
      addTracks.forEach((t) => { if (!p.tracks.some((x) => x.id === t.id)) p.tracks.push(t); });
      writeTimelineClips(p, working);
    });
    setClips(working); setSelClipId(null);
    ping(`Audio split to a track${done > 1 ? ` · ${done} clips` : ""}`);
  };
  /* ── Effects Library actions ── */
  const applyFxPreset = (preset) => {
    if (!selClipId) { ping("Select a clip in the timeline first."); return; }
    updateFx(selClipId, preset.fx);
    ping(`Filter "${preset.name}" applied — fine-tune in the inspector`);
  };
  const addForgeEffect = (effectId, presetId) => {
    if (!selClipId) { ping("Select a video clip in the timeline first."); return; }
    const clip = clips.find((candidate) => candidate.id === selClipId);
    const current = ensureFx(clip);
    try {
      const instance = createEffectInstance(effectId, presetId, uid());
      updateFx(selClipId, { stack: [...current.stack, instance] });
      const effect = FX_EFFECTS.find((candidate) => candidate.id === effectId);
      const preset = effect?.presets?.find((candidate) => candidate.id === presetId);
      ping(`✦ ${preset?.name || effect?.name || effectId} added to the Forge stack`);
    } catch (error) { ping(error?.message || "Could not add effect"); }
  };
  // A look replaces the clip's Forge stack with the look's effects (each still editable).
  const applyForgeLook = (look) => {
    if (!selClipId) { ping("Select a clip first."); return; }
    try {
      const stack = instantiateLook(look, (effectId, index) => `${effectId}-${uid()}-${index}`);
      applyClips(clips.map((clip) => clip.id === selClipId ? { ...clip, fx: { ...ensureFx(clip), stack } } : clip));
      ping(`◈ ${look.name} · ${stack.length} effects`);
    } catch (error) { ping(error?.message || "Could not apply that look"); }
  };
  const saveStackAsLook = () => {
    const clip = getSel(); const stack = clip ? ensureFx(clip).stack : [];
    if (!stack.length) { ping("Add some effects first, then save them as a look."); return; }
    const name = (window.prompt("Name this look", clip.label ? `${clip.label} Look` : "My Look") || "").trim();
    if (!name) return;
    const category = (window.prompt(`Category (${LOOK_CATEGORIES.map((c) => c.id).join(", ")})`, "cinematic") || "cinematic").trim().toLowerCase();
    const valid = LOOK_CATEGORIES.some((c) => c.id === category) ? category : "cinematic";
    saveUserLook(lookFromStack(stack, name, valid, `${stack.length} effects saved from ${clip.label || "a clip"}.`));
    ping(`◈ "${name}" saved to LOOKS`);
  };
  // ── user-built effects ────────────────────────────────────────────────────────────────────
  // A look applies a stack and steps aside; a custom effect keeps the chain but hides it behind
  // controls the author names, so it behaves like one effect in the library and the inspector.
  const buildEffectFromStack = () => {
    const clip = getSel(); const stack = clip ? ensureFx(clip).stack : [];
    const usable = stack.filter((i) => i.enabled !== false && !isCustomEffectId(i.effectId));
    if (!usable.length) { ping("Add some effects first, then build one of your own from them."); return; }
    const name = (window.prompt("Name your effect", clip.label ? `${clip.label} FX` : "My Effect") || "").trim();
    if (!name) return;
    const built = customFromStack(stack, name, "stylize", `${usable.length} effects built from ${clip.label || "a clip"}.`);
    setCustomDefs(saveCustomEffect(built));
    setBuilderId(built.id);
    ping(`✦ "${name}" built — promote the controls you want to expose`);
  };
  const updateBuilder = (next) => {
    const errors = validateCustomEffect(next);
    if (errors.length) { ping(errors[0]); return; }
    setCustomDefs(saveCustomEffect(next));
  };
  const removeCustomEffect = (id, name) => {
    if (!window.confirm(`Delete "${name}"? Clips already using it will lose the effect.`)) return;
    setCustomDefs(deleteCustomEffect(id));
    if (builderId === id) setBuilderId(null);
    ping(`✕ "${name}" deleted`);
  };
  const addCustomEffect = (custom) => {
    if (!selClipId) { ping("Select a clip first."); return; }
    const current = ensureFx(getSel());
    updateFx(selClipId, { stack: [...current.stack, createCustomInstance(custom, uid())] });
    ping(`✦ ${custom.name} added to the Forge stack`);
  };
  const addForgeTransition = (transitionId, presetId) => {
    if (!selClipId) { ping("Select the incoming clip at a cut first."); return; }
    try {
      const trans = createForgeTransition(transitionId, presetId, 1);
      applyClips(clips.map((clip) => clip.id === selClipId ? { ...clip, fx: { ...ensureFx(clip), trans } } : clip));
      ping(`⇄ ${transitionId.replaceAll("-", " ")} transition added`);
    } catch (error) { ping(error?.message || "Could not add transition"); }
  };
  const trackSelectedForward = async () => {
    const clip = getSel(); const asset = clip && (prod?.mediaPool || []).find((candidate) => candidate.id === clip.assetId);
    if (!clip || !asset?.url || asset.type !== "video") { ping("Select a video clip to track."); return; }
    const fps = vfmt.fps || 24, existing = ensureFx(clip).vectorTrack;
    let track = existing || createVectorTrack(asset.id, fps, 0, 0, `${clip.label || asset.name} Track`, uid());
    const video = document.createElement("video"); video.crossOrigin = "anonymous"; video.muted = true; video.preload = "auto"; video.src = asset.url;
    const wait = (event) => new Promise((resolve, reject) => { const ok = () => { clean(); resolve(); }, bad = () => { clean(); reject(new Error("Could not decode tracking source")); }, clean = () => { video.removeEventListener(event, ok); video.removeEventListener("error", bad); }; video.addEventListener(event, ok, { once: true }); video.addEventListener("error", bad, { once: true }); });
    const seek = async (time) => { if (Math.abs(video.currentTime - time) < .001) return; video.currentTime = time; await wait("seeked"); };
    try {
      if (video.readyState < 1) await wait("loadedmetadata");
      const scale = Math.min(1, 640 / Math.max(1, video.videoWidth)), width = Math.max(2, Math.round(video.videoWidth * scale)), height = Math.max(2, Math.round(video.videoHeight * scale));
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const gray = () => { ctx.drawImage(video, 0, 0, width, height); const rgba = ctx.getImageData(0, 0, width, height).data, data = new Uint8Array(width * height); for (let i = 0; i < data.length; i++) data[i] = Math.round(rgba[i * 4] * .2126 + rgba[i * 4 + 1] * .7152 + rgba[i * 4 + 2] * .0722); return { width, height, data }; };
      const startFrame = Math.max(0, Math.round((playhead - clip.start) * fps)), endFrame = Math.min(Math.round(clip.duration * fps), startFrame + 300);
      await seek((clip.srcIn || 0) + startFrame / fps); let previous = gray(); let seed = track.samples.find((sample) => sample.frame === startFrame) || { frame: startFrame, x: .5, y: .5, confidence: 1, error: 0, manual: true };
      track = { ...track, width, height }; track = upsertTrackSample(track, seed);
      for (let frame = startFrame + 1; frame <= endFrame; frame++) { await seek((clip.srcIn || 0) + frame / fps); const next = gray(), result = trackPoint(previous, next, seed.x, seed.y, track.settings.patchRadius, track.settings.searchRadius); seed = { frame, ...result }; track = upsertTrackSample(track, seed); previous = next; if (result.confidence < track.settings.minConfidence) break; }
      updateFx(clip.id, { vectorTrack: track, trackMode: "stabilize" }); ping(`VectorTrack · ${track.samples.length} samples · stabilization enabled`);
    } catch (error) { ping(error?.message || "Tracking failed"); } finally { video.removeAttribute("src"); video.load(); }
  };

  // ── VectorTrack PLANAR (Mocha "Track" core): a user-placed surface quad, a feature lattice inside
  // it, one reference→frame homography per frame with outlier rejection + failure confidence, and
  // reusable corner-pin data. Runs on the same serial <video> seek decode path as the point tracker.
  const trackCancelRef = useRef(false);
  const [trackProgress, setTrackProgress] = useState(null); // { frame, total, confidence, note }
  const [surfaceEdit, setSurfaceEdit] = useState(false);     // dragging the surface corners on the monitor
  const [customDefs, setCustomDefs] = useState(() => loadCustomEffects());   // user-built effects
  const [builderId, setBuilderId] = useState(null);           // custom effect whose controls are being edited
  const [maskEdit, setMaskEdit] = useState(null);             // { clipId, instanceId } — editing a Forge mask on the monitor
  const placeSurface = () => {
    const clip = getSel(); if (!clip) { ping("Select a video clip first."); return; }
    if (!ensureFx(clip).planarSurface) updateFx(clip.id, { planarSurface: { corners: [{ x: .3, y: .3 }, { x: .7, y: .3 }, { x: .7, y: .7 }, { x: .3, y: .7 }] } });
    setSurfaceEdit(true);
  };
  // AdjustTrack: a corner drag on a tracked frame becomes a MANUAL sample (exact plane through the
  // dragged corners); tracking again from that frame resumes from it.
  const adjustPlanarFrame = (clip, frame, corners) => {
    const seq = clip?.fx?.planarTrack; if (!seq) return;
    const solve = solveHomography(seq.referenceCorners, corners); if (!solve) { ping("Corners are degenerate."); return; }
    const sample = { frame, matrix: solve.matrix, corners, features: seq.features.map((p) => transformPoint(solve.matrix, p)), featureConfidence: seq.features.map(() => 1), inliers: seq.features.length, confidence: 1, rmsError: 0, manual: true };
    updateFx(clip.id, { planarTrack: upsertPlanarSample(seq, sample) });
  };
  const exportPlanarPin = () => {
    const clip = getSel(); const seq = clip?.fx?.planarTrack; if (!seq) { ping("No planar track on this clip."); return; }
    const rows = exportCornerPin(seq);
    const payload = { format: "fabula-cornerpin-v1", clip: clip.label || clip.id, fps: seq.fps, referenceFrame: seq.referenceFrame, referenceCorners: seq.referenceCorners, order: "TL,TR,BR,BL", coords: "normalized, origin top-left, y down", frames: rows };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${(clip.label || "clip").replace(/[^\w.-]+/g, "_")}-cornerpin.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    ping(`Corner pin exported · ${rows.length} frames`);
  };
  const trackPlanarForward = () => trackPlanar(1);
  const trackPlanarBackward = () => trackPlanar(-1);
  const trackPlanar = async (dir = 1) => {
    const clip = getSel(); const asset = clip && (prod?.mediaPool || []).find((candidate) => candidate.id === clip.assetId);
    if (!clip || !asset?.url || asset.type !== "video") { ping("Select a video clip to track."); return; }
    const fx0 = ensureFx(clip);
    if (!fx0.planarSurface?.corners) { ping("Place a surface first (SURFACE), then track."); return; }
    if (trackProgress) { ping("A track is already running."); return; }
    const fps = vfmt.fps || 24;
    const video = document.createElement("video"); video.crossOrigin = "anonymous"; video.muted = true; video.preload = "auto"; video.src = asset.url;
    const wait = (event) => new Promise((resolve, reject) => { const ok = () => { clean(); resolve(); }, bad = () => { clean(); reject(new Error("Could not decode tracking source")); }, clean = () => { video.removeEventListener(event, ok); video.removeEventListener("error", bad); }; video.addEventListener(event, ok, { once: true }); video.addEventListener("error", bad, { once: true }); });
    const seek = async (time) => { if (Math.abs(video.currentTime - time) < .001) return; video.currentTime = time; await wait("seeked"); };
    const yieldUi = () => new Promise((resolve) => setTimeout(resolve, 0));
    trackCancelRef.current = false;
    setSurfaceEdit(false);
    let seq = null;
    try {
      if (video.readyState < 1) await wait("loadedmetadata");
      const scale = Math.min(1, 640 / Math.max(1, video.videoWidth)), width = Math.max(2, Math.round(video.videoWidth * scale)), height = Math.max(2, Math.round(video.videoHeight * scale));
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const gray = () => { ctx.drawImage(video, 0, 0, width, height); return grayFromRgba(ctx.getImageData(0, 0, width, height).data, width, height); };
      const startFrame = Math.max(0, Math.round((playhead - clip.start) * fps));
      const endFrame = dir > 0 ? Math.min(Math.round(clip.duration * fps), startFrame + 600) : Math.max(0, startFrame - 600);
      await seek((clip.srcIn || 0) + startFrame / fps);
      let previous = gray();
      // Continue an existing track from a good sample at the playhead; otherwise start a fresh
      // sequence whose reference frame is the playhead and whose reference quad is the surface.
      const existing = fx0.planarTrack;
      const resume = existing && existing.samples.find((s) => s.frame === startFrame && !s.lost);
      let current;
      if (resume) { seq = { ...existing, samples: existing.samples.filter((s) => (dir > 0 ? s.frame <= startFrame : s.frame >= startFrame) && !s.lost) }; current = resume.features; }
      else { seq = createPlanarSequence(asset.id, fps, startFrame, fx0.planarSurface.corners, uid(), { reference: previous, width, height }); seq = upsertPlanarSample(seq, referenceSample(seq)); current = seq.features; }
      let prevFeatures = null, total = Math.abs(endFrame - startFrame), lastNote = "";
      setTrackProgress({ frame: 0, total, confidence: 1, note: "" });
      for (let frame = startFrame + dir; dir > 0 ? frame <= endFrame : frame >= endFrame; frame += dir) {
        if (trackCancelRef.current) { lastNote = "stopped"; break; }
        await seek((clip.srcIn || 0) + frame / fps);
        const next = gray();
        const velocity = prevFeatures ? current.map((p, i) => ({ x: p.x - prevFeatures[i].x, y: p.y - prevFeatures[i].y })) : null;
        const result = trackPlanarFrame(seq, previous, next, frame, current, velocity);
        if (!result) { lastNote = "degenerate surface"; break; }
        seq = upsertPlanarSample(seq, result.sample);
        setTrackProgress({ frame: Math.abs(frame - startFrame), total, confidence: result.sample.confidence, note: result.reason || "" });
        if (!result.accepted) { lastNote = result.reason || "lost"; break; }
        prevFeatures = current; current = result.features; previous = next;
        if (Math.abs(frame - startFrame) % 2 === 0) await yieldUi();
      }
      const good = seq.samples.filter((s) => !s.lost).length;
      updateFx(clip.id, { planarTrack: seq, trackMode: fx0.trackMode === "stabilize" ? "stabilize" : (fx0.trackMode === "planar" || !fx0.trackMode || fx0.trackMode === "off" ? fx0.trackMode || "off" : fx0.trackMode) });
      ping(`VectorTrack planar · ${good} frames${lastNote ? ` · ${lastNote}` : ""}`);
    } catch (error) { ping(error?.message || "Planar tracking failed"); }
    finally { setTrackProgress(null); video.removeAttribute("src"); video.load(); }
  };
  // Mesh tracking reuses the SURFACE quad the planar tracker already places, so there is no
  // second overlay to learn: put the surface on the thing that bends, then track it as a mesh.
  const trackMesh = async (dir = 1) => {
    const clip = getSel(); const asset = clip && (prod?.mediaPool || []).find((candidate) => candidate.id === clip.assetId);
    if (!clip || !asset?.url || asset.type !== "video") { ping("Select a video clip to track."); return; }
    const fx0 = ensureFx(clip);
    if (!fx0.planarSurface?.corners) { ping("Place a surface first (SURFACE), then track the mesh."); return; }
    if (trackProgress) { ping("A track is already running."); return; }
    const fps = vfmt.fps || 24;
    const density = Math.max(1, Math.min(10, Math.round(fx0.meshDensity || 4)));
    const video = document.createElement("video"); video.crossOrigin = "anonymous"; video.muted = true; video.preload = "auto"; video.src = asset.url;
    const wait = (event) => new Promise((resolve, reject) => { const ok = () => { clean(); resolve(); }, bad = () => { clean(); reject(new Error("Could not decode tracking source")); }, clean = () => { video.removeEventListener(event, ok); video.removeEventListener("error", bad); }; video.addEventListener(event, ok, { once: true }); video.addEventListener("error", bad, { once: true }); });
    const seek = async (time) => { if (Math.abs(video.currentTime - time) < .001) return; video.currentTime = time; await wait("seeked"); };
    const yieldUi = () => new Promise((resolve) => setTimeout(resolve, 0));
    trackCancelRef.current = false;
    setSurfaceEdit(false);
    let seq = null;
    try {
      if (video.readyState < 1) await wait("loadedmetadata");
      const scale = Math.min(1, 640 / Math.max(1, video.videoWidth)), width = Math.max(2, Math.round(video.videoWidth * scale)), height = Math.max(2, Math.round(video.videoHeight * scale));
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const gray = () => { ctx.drawImage(video, 0, 0, width, height); return grayFromRgba(ctx.getImageData(0, 0, width, height).data, width, height); };
      const startFrame = Math.max(0, Math.round((playhead - clip.start) * fps));
      const endFrame = dir > 0 ? Math.min(Math.round(clip.duration * fps), startFrame + 600) : Math.max(0, startFrame - 600);
      await seek((clip.srcIn || 0) + startFrame / fps);
      let previous = gray();
      // Resume from a good sample at the playhead, exactly as the planar runner does; otherwise
      // start fresh with the playhead as the reference frame.
      const existing = fx0.meshTrack;
      const resume = existing && existing.cols === density && existing.samples.find((s) => s.frame === startFrame && !s.lost);
      let current;
      if (resume) { seq = { ...existing, samples: existing.samples.filter((s) => (dir > 0 ? s.frame <= startFrame : s.frame >= startFrame) && !s.lost) }; current = resume.vertices; }
      else { seq = createMeshSequence(asset.id, fps, width, height, startFrame, fx0.planarSurface.corners, density, density, uid()); seq = upsertMeshSample(seq, meshReferenceSample(seq)); current = seq.reference; }
      const total = Math.abs(endFrame - startFrame); let lastNote = "";
      setTrackProgress({ frame: 0, total, confidence: 1, note: "" });
      for (let frame = startFrame + dir; dir > 0 ? frame <= endFrame : frame >= endFrame; frame += dir) {
        if (trackCancelRef.current) { lastNote = "stopped"; break; }
        await seek((clip.srcIn || 0) + frame / fps);
        const next = gray();
        const result = trackMeshFrame(seq, previous, next, frame, current);
        if (!result) { lastNote = "mesh does not match this clip"; break; }
        seq = upsertMeshSample(seq, result.sample);
        setTrackProgress({ frame: Math.abs(frame - startFrame), total, confidence: result.sample.confidence, note: result.reason || "" });
        if (!result.accepted) { lastNote = result.reason || "lost"; break; }
        current = result.vertices; previous = next;
        // A mesh costs one block match per vertex, so yield more often than the planar runner.
        await yieldUi();
      }
      const good = seq.samples.filter((s) => !s.lost).length;
      updateFx(clip.id, { meshTrack: seq });
      ping(`Mesh track \u00b7 ${good} frames${lastNote ? ` \u00b7 ${lastNote}` : ""}`);
    } catch (error) { ping(error?.message || "Mesh tracking failed"); }
    finally { setTrackProgress(null); video.removeAttribute("src"); video.load(); }
  };
  const trackMeshForward = () => trackMesh(1);
  const trackMeshBackward = () => trackMesh(-1);
  const insertGenerator = (mode, name) => {
    // A Pixels generator scene as a pool asset: MonitorLayer plays it live (SceneView) and the
    // export renders it on the GPU (offlineRenderer) — full parity, no media file needed.
    const asset = {
      id: uid(), name: name + " (generator)", type: "graphic", generated: true, duration: 8, bin: "generators",
      pixels: { name, layers: [{ id: "g1", blendMode: "normal", opacity: 1, clip: { type: "generator", sceneMode: mode, opacity: 1 } }] },
    };
    updateProd((p) => { p.mediaPool.push(asset); });
    insertAssetClip(asset);
    ping(`⚡ ${name} generator at the playhead`);
  };
  const addLottieBlobToPool = (blob, name, dur) => {
    const id = uid();
    addAssetToPool({ id, name: name + ".json", type: "lottie", url: URL.createObjectURL(blob), duration: dur || 5, session: true, bin: "lottie" });
    stSet("studio:blob:" + id, blob);
    scheduleAutoSync([id]);
    ping(`◈ "${name}" added to the media pool — drop it on the timeline`);
  };
  const addTakeToPool = (blob, name) => {
    const id = uid();
    addAssetToPool({ id, name: name + ".webm", type: "video", url: URL.createObjectURL(blob), duration: 10, session: true, bin: "performances" });
    stSet("studio:blob:" + id, blob);
    scheduleAutoSync([id]);
  };
  // Voice Studio → an audio asset in the pool, optionally dropped on a track at the playhead.
  const placeAudioClip = async (blob, name, opts = {}) => {
    const id = uid();
    const ext = (blob.type || "").includes("wav") ? "wav" : (blob.type || "").includes("mp3") || (blob.type || "").includes("mpeg") ? "mp3" : "webm";
    // decode duration for correct clip length
    let dur = opts.duration || 3;
    try { const ac = new (window.AudioContext || window.webkitAudioContext)(); const ab = await ac.decodeAudioData(await blob.arrayBuffer()); dur = ab.duration; ac.close(); } catch { /* keep default */ }
    addAssetToPool({ id, name: `${name}.${ext}`, type: "audio", url: URL.createObjectURL(blob), duration: dur, session: true, bin: "voice" });
    stSet("studio:blob:" + id, blob);
    scheduleAutoSync([id]);
    if (opts.trackId) {
      const q = (t) => Math.round(t * (vfmt.fps || 24)) / (vfmt.fps || 24);
      const clip = { id: uid(), trackId: opts.trackId, start: q(opts.at != null ? opts.at : playhead), duration: q(dur), srcIn: 0, kind: "media", assetId: id, label: name };
      // defer = caller batch-commits (avoids stale-closure clobber when placing several in a loop).
      if (!opts.defer) { const next = [...clips, clip]; setClips(next); commitClips(next); setSelClipId(clip.id); }
      return clip;
    }
    return null;
  };
  // Load an asset into the source viewer; `play` = double-click behaviour (start playing).
  const openInViewer = async (a, play) => {
    activeViewerRef.current="source";
    const request=++sourceRequestRef.current;sourceLeaseRef.current?.release();sourceLeaseRef.current=null;
    setPreviewAsset(a ? {...a,url:null}:null);setSrcTc(0);setSrcPlaying(false);srcWantPlayRef.current=false;
    if(!a)return;
    try {const source=await resolveMediaSource(a);if(request!==sourceRequestRef.current){source.release();return;}
      sourceLeaseRef.current=source;setPreviewAsset({...a,url:source.url});srcWantPlayRef.current=!!play;setSrcPlaying(!!play);
    }catch(error){reportMediaHealth(a.id,error.message);ping(error.message);}
  };
  // Relink an offline/missing asset to a local file (re-point its url).
  const openRelink = (assetId) => {
    const input=document.createElement("input");input.type="file";input.accept="video/*,audio/*,image/*,.wav,.mp4,.mov,.mkv,.flac";
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file)return;
      const previous=prod.mediaPool.find(a=>a.id===assetId);
      const type=file.type.startsWith("audio") || /\.(wav|mp3|flac|aiff?|m4a|ogg)$/i.test(file.name) ? "audio" : file.type.startsWith("video") || /\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(file.name) ? "video" : previous?.type || "image";
      if(!await mediaPutBytes("studio:blob:"+assetId,file)){ping("Relink could not be saved locally. Free browser storage and retry.");return;}
      await stDel("studio:proxy:"+assetId);
      setProxies(current=>{const next=new Map(current);next.delete(assetId);return next;});
      setPlaying(false);stopPlayback();
      const url=URL.createObjectURL(file);
      updateProd(p=>{const a=p.mediaPool.find(a=>a.id===assetId);if(a){a.url=url;a.name=file.name;a.type=type;a.size=file.size;a.offline=false;a.session=true;delete a.folderId;delete a.diskPath;delete a.diskName;}});
      setPreviewAsset(a=>a?.id===assetId?{...a,url,type,name:file.name}:a);
      ping("Source relinked and saved locally; outdated proxy removed.");
    };input.click();
  };
  // Media resolution hierarchy on load — LOCAL-FIRST. If this machine holds the original bytes
  // (IndexedDB stash), edit from them: frame-accurate, zero-network, full-res scrubbing. The
  // cloud copy (a.cloudUrl) is kept for portability; a machine WITHOUT the bytes (tablet/phone/
  // other desk) falls back to the cloud URL, where the proxy workflow takes over. Mutates p.
  const rehydrateBlobs = async (p) => {
    if (!p?.mediaPool?.length) return;
    await Promise.all(p.mediaPool.map(async (a) => {
      // remember the durable cloud location before we re-point anything
      if (!a.cloudUrl && a.url && /^https?:/i.test(a.url)) a.cloudUrl = a.url;
      // ── Resolution order (LOCAL-FIRST, native-NLE style) ────────────────────────────────
      // 1) DIRECT FROM THE DRIVE: if this asset came from a watch folder, re-open the actual file
      //    through the persisted directory handle. This is the "Fabula is looking straight at your
      //    disk" path — no IndexedDB copy needed, always the real local file, never the cloud while
      //    the file is present on device. (Falls through silently if the folder/permission is gone.)
      if (a.folderId) {
        try {
          const f = await getFileFromFolder(a.folderId, a.diskPath || a.bin || "", a.diskName || a.name);
          if (f && f.size) { a.url = URL.createObjectURL(f); a.offline = false; a.session = true; if (f.size) a.size = f.size; return; }
        } catch { /* fall through to idb / cloud */ }
      }
      // 2) IndexedDB stash: the local original bytes we cached at import (safety net + non-folder imports).
      const b = await stGet("studio:blob:" + a.id);
      if (b && b.size) { // local original available → always prefer it over the cloud
        if (a.url && a.url.startsWith("blob:")) { try { if ((await fetch(a.url)).ok) return; } catch { /* dead */ } }
        try { a.url = URL.createObjectURL(b); a.offline = false; a.session = true; return; } catch { /* */ }
      }
      // 3) Cloud copy — ONLY when the bytes aren't on this device at all (a portable open on another machine).
      const local = !a.url || a.url.startsWith("blob:") || a.url.startsWith("data:") || a.offline;
      if (local && a.cloudUrl) { a.url = a.cloudUrl; a.offline = false; a.session = false; }
    }));
  };
  // Load any stashed proxies for this project's assets (built earlier, survive reloads).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!prod?.mediaPool?.length) return;
      const found = [];
      for (const a of prod.mediaPool) {
        if (a.type !== "video") continue;
        const b = await stGet("studio:proxy:" + a.id);
        if (b && b.size) { try { found.push([a.id, URL.createObjectURL(b)]); } catch { /* */ } }
      }
      if (alive) setProxies(new Map(found));
    })();
    return () => { alive = false; };
  }, [prod?.id, prod?.mediaPool?.map(a=>a.id).join("|")]);
  // Convert one asset to a proxy on the CROSSOVER CLOUD (server-side ffmpeg) — the path for
  // browsers without WebCodecs H.264 (phones/tablets) or when the local encode fails.
  const crossoverProxy = async (a) => {
    try {
      const srcUrl = a.cloudUrl || a.url;
      if (!srcUrl || !/^https?:/i.test(srcUrl)) return null; // server needs a fetchable URL
      const recipe = { containerId: "mp4", videoCodecId: "h264", audioCodecId: "aac", hwAccel: "auto", qualityMode: "bitrate", videoBitrate: "2500k", audioBitrate: "128k", fixTimestamps: true, stripMetadata: false };
      const r = await crossover.convert({ id: a.id, name: a.name || "clip.mp4", kind: "video", sizeBytes: 0, url: srcUrl }, recipe, () => {});
      return r?.blob || (r?.outputUrl ? await fetch(r.outputUrl).then((x) => (x.ok ? x.blob() : null)) : null);
    } catch (e) { console.warn("[fabula-proxy] crossover cloud failed for", a.name, e?.message || e); return null; }
  };
  // Build instant-seek proxies for the given assets (or every video asset missing one).
  // Local WebCodecs 540p short-GOP encode first; Crossover cloud ffmpeg as the fallback.
  const buildProxiesFor = async (list, opts = {}) => {
    const silent = !!opts.silent;
    const vids = (list || (prod?.mediaPool || []).filter((a) => a.type === "video" && a.url)).filter((a) => !proxies.has(a.id));
    if (!vids.length) { if (!silent) ping("Every video asset already has a proxy"); return; }
    const webOk = await canTranscode();
    let n = 0, made = 0;
    for (const a of vids) {
      if (editBusyRef.current) break;
      n++; setProxyBusy(`${n}/${vids.length} · ${a.name}`);
      try {
        if (await stGet("studio:proxy:" + a.id)) { n--; continue; } // raced another pass
        let proxy = null;
        let original=null;
        try {original=await resolveMediaSource(a);const blob=original.blob || await (await fetch(original.url)).blob();proxy=await buildEditingProxy(blob);}
        finally {original?.release();}
        if (!proxy) proxy = await crossoverProxy(a); // server-side ffmpeg (phones/tablets/long clips)
        if (proxy) {
          await stSet("studio:proxy:" + a.id, proxy);
          const purl = URL.createObjectURL(proxy);
          setProxies((cur) => { const m = new Map(cur); m.set(a.id, purl); return m; });
          made++;
        }
      } catch (e) { console.warn("[fabula-proxy]", a.name, e?.message || e); }
    }
    setProxyBusy(null);
    if (made) ping(`⚡ ${made} prox${made === 1 ? "y" : "ies"} ready — remote media now scrubs instant-seek`);
    else if (!silent) ping("No proxies could be built (clips too long or unreadable)");
  };
  // AUTO-PROXY: shortly after a project opens, quietly build proxies for every REMOTE-ONLY video
  // asset (no local bytes on this machine — the tablet/phone/other-desk case). Local originals
  // never need proxies: they already play full-res with frame-accurate seeking.
  useEffect(() => {
    if (!prod?.id || !proxyOn || playing) return undefined;
    const t = setTimeout(async () => {
      const remote = [];
      for (const a of (prod.mediaPool || [])) {
        if (a.type !== "video" || !a.url || !/^https?:/i.test(a.url)) continue;
        if (await stGet("studio:proxy:" + a.id)) continue;
        if (await stGet("studio:blob:" + a.id)) continue; // local original exists → no proxy needed
        remote.push(a);
      }
      if (remote.length) buildProxiesFor(remote, { silent: true });
    }, 4000);
    return () => clearTimeout(t);
  }, [prod?.id, proxyOn, playing]);
  // Source-viewer waveform scrubber: click/drag across the waveform to seek the source.
  const startSrcScrub = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const total = srcDur || previewAsset?.duration || 0;
    if (!total) return;
    const seek = (clientX) => { const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)); const t = f * total; if (srcVideoRef.current) srcVideoRef.current.currentTime = t; setSrcTc(t); };
    seek(e.clientX);
    const move = (ev) => { ev.preventDefault(); seek(ev.clientX); };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  };
  // ── Media-pool multi-select (click / ⌘-click / shift-range / marquee) ──
  // Keyword search across name + tags + folder — the same matcher powers the media & edit pages.
  const assetMatches = (a, q) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (a.name || "").toLowerCase().includes(s)
      || (a.bin || "").toLowerCase().includes(s)
      || (a.tags || []).some((t) => (t || "").toLowerCase().includes(s));
  };
  // A bin selection shows that folder AND everything nested under it (prefix match), so picking a
  // parent bin reveals the whole subtree — the way a folder does on disk. Keyword search narrows further.
  const poolFiltered = () => (prod?.mediaPool || []).filter((x) => {
    if (binFilter !== "all") { const b = x.bin || "imports"; if (!(b === binFilter || b.startsWith(binFilter + "/"))) return false; }
    return assetMatches(x, mediaSearch.trim());
  });
  // Ordered, ancestor-expanded list of bin paths for the nested tree render.
  const binTree = () => {
    const raw = new Set([...(prod?.bins || []), ...(prod?.mediaPool || []).map((a) => a.bin || "imports")]);
    const all = new Set();
    for (const p of raw) { if (!p) continue; const segs = p.split("/"); let acc = ""; for (const s of segs) { acc = acc ? acc + "/" + s : s; all.add(acc); } }
    return [...all].sort((a, b) => a.localeCompare(b));
  };
  const poolClick = (e, a) => {
    if (marqueeActiveRef.current) return; // this was a marquee drag, not a click
    if (e.ctrlKey || e.metaKey) { setPoolSel((s) => s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]); return; }
    if (e.shiftKey && poolSel.length) {
      const ids = poolFiltered().map((x) => x.id);
      const i1 = ids.indexOf(poolSel[poolSel.length - 1]), i2 = ids.indexOf(a.id);
      if (i1 >= 0 && i2 >= 0) { setPoolSel(ids.slice(Math.min(i1, i2), Math.max(i1, i2) + 1)); return; }
    }
    setPoolSel([a.id]); openInViewer(a, false);
  };
  const poolContext = (e, a) => {
    e.preventDefault(); e.stopPropagation();
    setPoolSel((s) => (s.includes(a.id) ? s : [a.id]));
    setPoolCtx({ x: e.clientX, y: e.clientY });
  };
  const startMarquee = (e) => {
    if (e.button !== 0) return;
    // Don't start a marquee from interactive controls (checkbox, bin select, chips).
    if (e.target.closest && e.target.closest("input,select,button,a,textarea")) return;
    const grid = e.currentTarget, x0 = e.clientX, y0 = e.clientY;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const baseSel = additive ? [...poolSel] : [];
    let active = false;
    const move = (ev) => {
      // Only begin marqueeing once the pointer has moved a few px — a plain click still selects.
      if (!active) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return; active = true; marqueeActiveRef.current = true; if (!additive) setPoolSel([]); }
      setMarquee({ x0, y0, x1: ev.clientX, y1: ev.clientY });
      const L = Math.min(x0, ev.clientX), R = Math.max(x0, ev.clientX), T = Math.min(y0, ev.clientY), B = Math.max(y0, ev.clientY);
      const hit = [];
      grid.querySelectorAll(".mwcard[data-aid]").forEach((el) => { const r = el.getBoundingClientRect(); if (r.left < R && r.right > L && r.top < B && r.bottom > T) hit.push(el.getAttribute("data-aid")); });
      setPoolSel(Array.from(new Set([...baseSel, ...hit])));
    };
    const up = () => {
      setMarquee(null);
      document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up);
      setTimeout(() => { marqueeActiveRef.current = false; }, 0); // let the click handler read it first
    };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  };
  const deletePoolAssets = (ids) => {
    if (!ids.length) return;
    if (!window.confirm(`Remove ${ids.length} asset${ids.length === 1 ? "" : "s"} from the media pool? (Timeline clips using them go offline.)`)) return;
    updateProd((p) => { p.mediaPool = (p.mediaPool || []).filter((a) => !ids.includes(a.id)); });
    setPoolSel([]);
  };
  const movePoolToBin = (ids) => {
    const name = (window.prompt("Move to bin (name)", "imports") || "").trim(); if (!name) return;
    updateProd((p) => { p.bins = p.bins || []; if (!p.bins.includes(name)) p.bins.push(name); for (const id of ids) { const x = p.mediaPool.find((y) => y.id === id); if (x) x.bin = name; } });
    ping(`Moved ${ids.length} to “${name}”.`);
  };
  // Cloud asset sync: upload every LOCAL (blob:) asset to durable storage so the whole
  // project opens on any device. Down-sync is automatic — loadProjectCloud already returns
  // the project with these cloud URLs. Re-run any time you add local media.
  const [syncing, setSyncing] = useState(false);
  const isLocalUrl = (u) => !!u && (u.startsWith("blob:") || u.startsWith("data:"));
  const unsyncedCount = (prod?.mediaPool || []).filter((a) => isLocalUrl(a.url) && !a.cloudUrl).length;
  const syncAssetsToCloud = async (onlyIds, opts = {}) => {
    const silent = !!opts.silent;
    if (!prod || syncing) return;
    if (!auth.currentUser) { if (!silent) window.alert("Sign in to Plajah first.\n\nCloud sync stores your media under your account so the project opens on any device. You're not signed in, so there's nowhere to put it."); return; }
    const idSet = onlyIds && onlyIds.length ? new Set(onlyIds) : null;
    // Anything local (blob:) that has no durable cloud copy yet needs uploading.
    const local = (prod.mediaPool || []).filter((a) => isLocalUrl(a.url) && !a.cloudUrl && (!idSet || idSet.has(a.id)));
    if (!local.length) { if (!silent) ping(idSet ? "The selected media is already in the cloud." : "All media is already in the cloud — this project is portable."); return; }
    setSyncing(true);
    let done = 0; const failed = []; const dead = [];
    for (const a of local) {
      try {
        let blob;
        try { blob = await fetch(a.url).then((r) => { if (!r.ok) throw new Error("gone"); return r.blob(); }); }
        catch { blob = null; } // the blob: URL died (page reloaded) — fall back to the stashed bytes
        if (!blob || !blob.size) { blob = await stGet("studio:blob:" + a.id); }
        // Folder-sourced originals keep no on-device copy — read the real file straight off the disk handle.
        if ((!blob || !blob.size) && a.folderId) { try { blob = await getFileFromFolder(a.folderId, a.diskPath || a.bin || "", a.diskName || a.name); } catch { /* offline */ } }
        if (!blob || !blob.size) { dead.push(a.name); continue; }
        if (!a.folderId) stSet("studio:blob:" + a.id, blob); // persist a copy only for non-folder media (folder originals live on disk)
        const cloudUrl = await uploadFabulaAsset(prod.id, a.id, blob, a.name, (pct) => setSaveState(`↑ ${a.name} ${pct}%`));
        // LOCAL-FIRST: keep playing the local blob URL; the cloud copy is the durable/portable
        // location other devices load. (Old behavior swapped url → cloud, which forced network
        // playback + proxies even on the machine that owns the original.)
        updateProd((p) => { const x = p.mediaPool.find((y) => y.id === a.id); if (x) { x.cloudUrl = cloudUrl; x.offline = false; if (!isLocalUrl(x.url)) { x.url = cloudUrl; } } });
        done++; if (!silent) ping(`Synced ${done}/${local.length} · ${a.name}`);
      } catch (e) { failed.push(`${a.name}: ${e?.code || e?.message || "upload failed"}`); }
    }
    setSyncing(false); setSaveState("saved");
    if (silent) { if (done) ping(`☁ Auto-synced ${done} asset${done === 1 ? "" : "s"} to the cloud`); return; }
    if (!failed.length && !dead.length) { ping(`☁ Cloud sync complete — ${done} asset${done === 1 ? "" : "s"} available on any device.`); return; }
    const lines = [];
    if (done) lines.push(`✅ Synced ${done} asset${done === 1 ? "" : "s"} to the cloud.`);
    if (dead.length) lines.push(`\n⚠️ ${dead.length} couldn't be read — these were only held in this browser session and are gone after a reload. Re-import (or relink from folder), then sync again:\n• ${dead.slice(0, 8).join("\n• ")}${dead.length > 8 ? `\n• …${dead.length - 8} more` : ""}`);
    if (failed.length) lines.push(`\n❌ ${failed.length} failed to upload (send me this error):\n• ${failed.slice(0, 8).join("\n• ")}`);
    window.alert(lines.join("\n"));
  };
  // AUTO-SYNC: new local media uploads itself in the background shortly after import / project
  // open (signed-in only, debounced so a burst of imports becomes one pass).
  const autoSyncTimer = useRef(null);
  const scheduleAutoSync = (ids) => {
    if (autoSyncTimer.current) clearTimeout(autoSyncTimer.current);
    autoSyncTimer.current = setTimeout(() => { autoSyncTimer.current = null; if (auth.currentUser) syncAssetsToCloud(ids || null, { silent: true }); }, 5000);
  };
  // Batch relink from a folder: pick a folder, match each target asset by filename, re-point it.
  // targets = asset ids (null = all offline assets). "finds the clips again" workflow.
  const openFolderRelink = (targets) => { folderRelinkTargetsRef.current = targets && targets.length ? targets : null; folderRelinkRef.current?.click(); };
  const relinkFromFolderFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const byName = new Map(); for (const f of files) byName.set((f.name || "").toLowerCase(), f);
    const ids = folderRelinkTargetsRef.current;
    const targets = (prod.mediaPool || []).filter((a) => (ids ? ids.includes(a.id) : (!a.url || a.offline)));
    if (!targets.length) { ping("Nothing to relink — all selected media is already online."); folderRelinkTargetsRef.current = null; return; }
    const relinks = targets.map((a) => { const f = byName.get((a.name || "").toLowerCase()); return f ? { id: a.id, f, url: URL.createObjectURL(f) } : null; }).filter(Boolean);
    if (!relinks.length) { ping("No matching filenames found in that folder."); folderRelinkTargetsRef.current = null; return; }
    for (const r of relinks) { if(!await mediaPutBytes("studio:blob:"+r.id,r.f)){ping("Relink could not persist local files");return;} await stDel("studio:proxy:"+r.id); } // stash bytes for reload + cloud sync
    updateProd((p) => { for (const r of relinks) { const x = p.mediaPool.find((y) => y.id === r.id); if (x) { x.url = r.url; x.offline = false; x.session = true; delete x.folderId;delete x.diskPath;delete x.diskName; } } });
    setProxies(current=>{const next=new Map(current);relinks.forEach(r=>next.delete(r.id));return next;});setPlaying(false);stopPlayback();
    ping(`🔗 Relinked ${relinks.length} of ${targets.length} clip${targets.length === 1 ? "" : "s"} from the folder.`);
    folderRelinkTargetsRef.current = null;
  };

  // ── Send scene → Lorea comic composer (script + world cast + assets follow) ──
  const sendSceneToComic = () => {
    if (!scene) { ping("Open a scene first."); return; }
    const parts = [];
    if (scene.slugline || scene.title) parts.push(scene.slugline || scene.title);
    if ((scene.script || "").trim()) parts.push(scene.script.trim());
    else if (scene.shots?.length) scene.shots.forEach((s, i) => { parts.push(`PANEL ${i + 1}`); if ((s.lines || "").trim()) parts.push(s.lines.trim()); });
    const castImage = (c) => {
      const m = (c.media || []).find((x) => x?.url && (x.type === "image" || !x.type));
      if (m?.url) return m.url;
      const pool = (prod.mediaPool || []).find((p) => p.worldCat === "__cast" && (p.name || "").toLowerCase().includes((c.name || "").toLowerCase()));
      return pool?.url;
    };
    const characters = (prod.cast || []).filter((c) => (c.name || "").trim()).map((c) => ({ name: c.name.trim(), imageUrl: castImage(c) }));
    const assets = (prod.mediaPool || []).filter((m) => m.type === "image" && m.url).map((m) => ({ name: m.name, url: m.url }));
    setComicHandoff({ source: "FABULA", title: scene.slugline || scene.title || prod.title, script: parts.join("\n"), characters, assets });
    ping("Sent to the comic composer — opening Lorea…");
    window.dispatchEvent(new CustomEvent("NAVIGATE", { detail: { target: "BOOK_STUDIO" } }));
  };

  // ── Spatialize audio — open a timeline audio clip in the Spatial Mixer, bake back ──
  const [spatialFor, setSpatialFor] = useState(null); // the audio clip being spatialized
  const spatializeClip = (clip) => {
    const a = prod?.mediaPool?.find((x) => x.id === clip.assetId);
    if (!a?.url) { ping("This clip's media is offline — relink it first."); return; }
    setSpatialFor({ ...clip, _mediaUrl: a.url, _assetName: a.name });
  };
  // Fabula receives the rendered immersive mix and drops it onto the same track, muting
  // the original so the spatial version plays in its place (non-destructive).
  const bakeSpatialMix = (clip, result) => {
    const label = `${clip.label || clip._assetName || "Audio"} (spatial)`;
    const asset = {
      id: uid(), name: label, type: "audio", url: result.blobUrl,
      duration: result.duration || clip.duration || 5, bin: "Spatial Mixes",
      tags: ["spatial", "iamf"], spatial: true, session: true, eclipsaProjectJson: result.iamfJson,
    };
    const newClip = {
      id: uid(), trackId: clip.trackId || "a2", start: clip.start || 0,
      duration: result.duration || clip.duration || 5, kind: "media", assetId: asset.id, label, srcIn: 0,
    };
    addAssetToPool(asset);
    const nc = [...clips.map((c) => (c.id === clip.id ? { ...c, disabled: true } : c)), newClip];
    setClips(nc); commitClips(nc);
    setSelClipId(newClip.id);
    setSpatialFor(null);
    ping(`Spatial mix baked onto ${(clip.trackId || "a2").toUpperCase()} — original muted.`);
  };

  // ── Nested clips — a Pixels scene opens into its layer-rows as video tracks ──
  const [nested, setNested] = useState(null); // { clipLabel, snapshot } | null
  const layerLabel = (layer) => {
    const c = layer.clip || {};
    if (c.type === "generator") return `GEN · ${c.sceneMode || "?"}`;
    if (c.type === "shader") return "SHADER";
    if (c.type === "milkdrop") return "MILKDROP";
    if (c.type === "media") return `MEDIA · ${(c.mediaUrl || "").split("/").pop()?.slice(0, 28) || "clip"}`;
    if (c.type === "color") return `COLOR ${c.fillColor || ""}`;
    if (c.type === "text") return `TEXT · "${(c.text || "").slice(0, 24)}"`;
    return (c.type || "layer").toUpperCase();
  };
  const openNested = (clip) => {
    const item = prod?.mediaPool?.find((a) => a.id === clip.assetId);
    if (item?.pixels?.layers?.length) setNested({ clipLabel: clip.label || item.name, snapshot: item.pixels });
    else ping("This clip has no nested scene to open.");
  };

  // ── On-platform video (Live recordings + uploads) ──────────────────────────
  const [videoLoading, setVideoLoading] = useState(false);
  const loadMyVideos = async () => {
    setVideoLoading(true);
    try {
      const vids = await getMyVideos();
      if (!vids.length) { ping("No on-platform videos found."); setVideoLoading(false); return; }
      updateProd((p) => {
        for (const v of vids) {
          if (p.mediaPool.some((m) => m.videoId === v.id)) continue;
          p.mediaPool.push({ id: uid(), videoId: v.id, name: (v.isLive ? "🔴 " : "") + v.title, type: "video", url: v.url, duration: v.duration || 0, bin: v.isLive ? "Live" : "Videos", tags: v.isLive ? ["live"] : ["video"] });
        }
      });
      ping(`Loaded ${vids.length} video(s) — Live recordings + uploads.`);
    } catch (e) { console.warn("[Fabula videos]", e); ping("Couldn't load your videos."); }
    setVideoLoading(false);
  };

  // ── On-platform music ──────────────────────────────────────────────────────
  const [musicLoading, setMusicLoading] = useState(false);
  const loadMyMusic = async () => {
    setMusicLoading(true);
    try {
      const tracks = await getMyMusicTracks();
      if (!tracks.length) { ping("No on-platform music found — release an album first."); setMusicLoading(false); return; }
      updateProd((p) => {
        for (const t of tracks) {
          if (p.mediaPool.some((m) => m.musicTrackId === t.id)) continue;
          p.mediaPool.push({ id: uid(), musicTrackId: t.id, name: `${t.title} — ${t.artist}`, type: "audio", url: t.url, duration: t.duration || 0, bin: "Music", tags: ["music"], musicMeta: t });
        }
      });
      ping(`Loaded ${tracks.length} track(s) into the Music bin.`);
    } catch (e) { console.warn("[Fabula music]", e); ping("Couldn't load your music."); }
    setMusicLoading(false);
  };

  // Music sync-licensing STORE — browse/preview/license other artists' tracks.
  const [showLicenseStore, setShowLicenseStore] = useState(false);
  const licenseEditId = editSel || (sceneSel ? `scene:${sceneSel.sceneId}` : (prod?.id || "project"));
  const addLicensedTrackToPool = (t) => {
    updateProd((p) => {
      if (p.mediaPool.some((m) => m.musicTrackId === t.id)) return;
      p.mediaPool.push({ id: uid(), musicTrackId: t.id, name: `${t.title} — ${t.artist}`, type: "audio", url: t.url, duration: t.duration || 0, bin: "Licensed Music", tags: ["music", "licensed"], musicMeta: { ...t, licensedEditId: licenseEditId } });
    });
    ping(`"${t.title}" added to the Licensed Music bin.`);
  };
  // Add a song to A1 and lay its synced lyrics out as animated captions on V2.
  const addMusicWithCaptions = (item) => {
    const start = playhead;
    const sid = subTrackId();
    const audioClip = { id: uid(), trackId: "a1", start, duration: item.duration || item.musicMeta?.duration || 30, kind: "media", assetId: item.id, label: item.name, srcIn: 0 };
    const subClips = buildSubtitleClips(item.musicMeta || {}, start, sid);
    const nc = [...clips, audioClip, ...subClips];
    updateProd((p) => { if (subClips.length) ensureSubTrack(p, sid); writeTimelineClips(p, nc); });
    setClips(nc);
    ping(subClips.length ? `Added song + ${subClips.length} subtitle lines.` : "Added song to A1.");
    if (licensingEnabled() && item.musicMeta) {
      const cl = trackClearance(item.musicMeta, syncGrants, prod?.id, auth.currentUser?.uid);
      if (!cl.cleared) ping(cl.needsLicense ? `"${item.name}" needs a $${cl.fee} sync license for this project — license it from the clip inspector.` : `Heads up — "${item.name}": ${cl.li.reason}`);
      else if (cl.li.attribution && !cl.granted) ping(`"${item.name}" is cleared for sync — credit ${item.musicMeta.artist || "the artist"}.`);
    }
  };

  // Load the buyer's sync-license grants (clears licensed tracks per project) and
  // self-heal: any grant for THIS film whose track isn't in the pool yet gets pulled
  // in automatically — so a song licensed from Chora shows up on the film's timeline.
  const reloadSyncGrants = () => {
    if (!licensingEnabled()) return;
    const u = auth.currentUser;
    if (!u) { setSyncGrants(new Set()); return; }
    listMyGrants(u.uid).then(async (gs) => {
      setSyncGrants(grantSet(gs));
      const p = prod;
      if (!p?.id) return;
      const missing = gs.filter((g) => g.editId === p.id && !(p.mediaPool || []).some((m) => m.musicTrackId === g.trackId));
      for (const g of missing) {
        try {
          const al = await fetchAlbumById(g.albumId);
          const t = al?.tracks?.find((x) => x.id === g.trackId);
          if (!t?.url) continue;
          updateProd((pp) => {
            if (pp.mediaPool.some((m) => m.musicTrackId === t.id)) return;
            pp.mediaPool.push({ id: uid(), musicTrackId: t.id, name: `${t.title} — ${t.artist || al.artist}`, type: "audio", url: t.url, duration: t.duration || 0, bin: "Licensed Music", tags: ["music", "licensed"], musicMeta: { ...t, albumId: al.id, licensedEditId: p.id } });
          });
        } catch { /* best-effort */ }
      }
    }).catch(() => {});
  };
  useEffect(() => { reloadSyncGrants(); }, [prod?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("license_success")) {
      reloadSyncGrants();
      ping("License purchased — the track is cleared for this project.");
      sp.delete("license_success");
      const q = sp.toString();
      window.history.replaceState({}, "", window.location.pathname + (q ? "?" + q : ""));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const licenseTrack = async (meta) => {
    try { await purchaseSyncLicense({ track: meta, editId: prod?.id, editTitle: prod?.title }); }
    catch (e) { ping(e?.message || "Could not start license checkout."); }
  };

  const [importFps, setImportFps] = useState(24);
  const importRef = useRef(null);

  const importTimeline = async (file) => {
    try {
      const text = await file.text();
      const { clips: parsed, format } = parseTimelineFile(file.name, text, importFps);
      if (!parsed.length) { setError(`Parsed ${format} but found no usable events — check the export settings.`); return; }
      if (clips.length && !window.confirm(`Import ${parsed.length} clips from this ${format} and REPLACE the current timeline for "${scene.title}"?`)) return;
      // build offline assets, dedup by clip name
      const assetByName = {};
      updateProd((p) => {
        parsed.forEach((c) => {
          const key = c.name.toLowerCase();
          let ex = p.mediaPool.find((a) => a.name.toLowerCase() === key);
          if (!ex) { ex = { id: uid(), name: c.name, type: c.trackId.startsWith("a") ? "audio" : "video", url: "", duration: c.duration, offline: true, imported: format }; p.mediaPool.push(ex); }
          assetByName[key] = ex.id;
        });
      });
      const next = parsed.map((c) => ({
        id: uid(), trackId: c.trackId, start: Math.round(c.start * 20) / 20,
        duration: Math.max(0.2, Math.round(c.duration * 20) / 20),
        kind: "media", assetId: assetByName[c.name.toLowerCase()], label: c.name, srcIn: c.srcIn || 0,
      }));
      setClips(next);
      updateScene((sc) => { sc.timeline = { clips: next }; });
      setPlayhead(0); setSelClipId(null);
      ping(`${format} imported — ${next.length} clips, media offline until relinked`);
    } catch (e) { setError("Import failed: " + e.message); }
  };

  const relinkAsset = (assetId, url, name, type) => {
    updateProd((p) => {
      const a = p.mediaPool.find((x) => x.id === assetId);
      if (a) { a.url = url; a.offline = false; a.session = url.startsWith("blob:"); if (type) a.type = type; }
    });
    ping("Media relinked");
  };

  // ── Timeline interchange (FCPXML / EDL) with media relink + background cloud upload ──
  // Ask where the media lives, read it LOCAL-FIRST off the drive, and in the background upload it to the
  // cloud with cross-session resume — so the edit is instantly playable while portability catches up.
  const baseOf = (s) => { try { const u = decodeURIComponent(s || ""); return (u.split(/[\\/]/).pop() || "").split("?")[0].toLowerCase(); } catch { return ((s || "").split(/[\\/]/).pop() || "").toLowerCase(); } };
  const pickMediaFolder = async () => {
    // File System Access (Chromium desktop + Android Chrome): recursive, keeps the whole tree AND each
    // file's folder path (rel) so a relinked XML/EDL mirrors the on-disk structure into the bins — the
    // same navigable folder surface the folder/watch imports build.
    if (window.showDirectoryPicker) {
      try {
        const dir = await window.showDirectoryPicker({ id: "fabula-media", mode: "read" });
        const map = new Map();
        const walk = async (h, rel, d) => { if (d > 6) return; for await (const [nm, en] of h.entries()) { if (en.kind === "file") map.set(nm.toLowerCase(), { entry: en, dir: rel }); else if (en.kind === "directory") await walk(en, rel ? `${rel}/${nm}` : nm, d + 1); } };
        await walk(dir, dir.name || "", 0);
        return { kind: "fsa", map };
      } catch (e) { if (e?.name === "AbortError") return null; /* unsupported → fallback */ }
    }
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.multiple = true; inp.webkitdirectory = true;
      inp.onchange = () => { const map = new Map(); for (const f of inp.files) { const rel = (f.webkitRelativePath || f.name).split("/").slice(0, -1).join("/"); map.set(f.name.toLowerCase(), { file: f, dir: rel }); } resolve(map.size ? { kind: "files", map } : null); };
      inp.oncancel = () => resolve(null);
      inp.click();
    });
  };
  // Returns { file, dir } for a basename key, or null. `dir` is the file's folder path → the asset bin.
  const fileFromPick = async (pick, key) => { const v = pick?.map.get(key); if (!v) return null; const file = pick.kind === "fsa" ? await v.entry.getFile() : v.file; return { file, dir: v.dir || "" }; };

  const importTimelineWithMedia = async (file) => {
    try {
      const text = await file.text();
      const isFcp = /\.fcpxml$/i.test(file.name) || /<fcpxml/i.test(text.slice(0, 500));
      let parsed, fmt;
      if (isFcp) { const r = importFCPXML(text); parsed = r.clips; fmt = r.format; }
      else { const pr = parseTimelineFile(file.name, text, importFps); parsed = (pr.clips || []).map((c) => ({ ...c, assetId: (c.name || "").toLowerCase(), label: c.name })); fmt = { fps: importFps }; }
      if (!parsed.length) { setError("No usable clips found in the file."); return; }
      if (clips.length && !window.confirm(`Import ${parsed.length} clips and REPLACE the current timeline for "${(container?.title) || "this edit"}"?`)) return;

      ping("Locate the media folder so the clips relink…");
      const pick = await pickMediaFolder();  // null = user skipped; import stays offline for manual relink
      const uidNow = auth.currentUser?.uid;
      const keyToAsset = {};                 // basename key → new pool asset id
      let matched = 0;

      const assets = [];
      for (const c of parsed) {
        const key = c.assetId; if (!key || keyToAsset[key]) continue;
        const id = uid();
        const isAudio = c.trackId.startsWith("a");
        const got = await fileFromPick(pick, key);
        if (got?.file) {
          matched++;
          const f = got.file;
          const t = f.type || "";
          // Mirror the on-disk folder into the bin so XML/EDL relinks share the same navigable folder
          // tree as folder/watch imports (unified media surface). Background upload knows the cloud copy.
          const bin = got.dir || "imported";
          const asset = { id, name: f.name, type: t.startsWith("audio") ? "audio" : t.startsWith("image") ? "image" : "video", url: URL.createObjectURL(f), duration: c.duration || 0, bin, session: true, synced: true, imported: isFcp ? "fcpxml" : "edl" };
          await stSet("studio:blob:" + id, f);
          assets.push(asset);
          if (uidNow) enqueueUpload({ assetId: id, name: f.name, mime: f.type || "application/octet-stream", size: f.size, blobKey: "studio:blob:" + id, uid: uidNow }).catch(() => {});
        } else {
          assets.push({ id, name: c.label || key, type: isAudio ? "audio" : "video", url: "", duration: c.duration || 0, bin: "imported", offline: true, imported: isFcp ? "fcpxml" : "edl" });
        }
        keyToAsset[key] = id;
      }

      const q = (t) => Math.round((t || 0) * (vfmt.fps || 24)) / (vfmt.fps || 24);
      const next = parsed.map((c) => ({ id: uid(), trackId: c.trackId, start: q(c.start), duration: Math.max(0.2, q(c.duration)), kind: "media", assetId: keyToAsset[c.assetId], label: c.label || "Clip", srcIn: q(c.srcIn || 0) }));
      updateProd((p) => {
        p.mediaPool = p.mediaPool || []; p.bins = p.bins || [];
        assets.forEach((a) => { if (!p.mediaPool.some((x) => x.id === a.id)) p.mediaPool.push(a); });
        // Register the mirrored folder paths as bins so the tree shows them everywhere (unified surface).
        [...new Set(assets.map((a) => a.bin).filter((b) => b && b !== "imports"))].forEach((b) => { if (!p.bins.includes(b)) p.bins.push(b); });
        p.tracks = (p.tracks && p.tracks.length) ? p.tracks : TRACKS.map((t) => ({ ...t }));
        [...new Set(next.map((c) => c.trackId))].forEach((tid) => { if (!p.tracks.some((t) => t.id === tid)) p.tracks.push({ id: tid, name: tid.toUpperCase(), type: tid.startsWith("a") ? "audio" : "video" }); });
      });
      setClips(next); commitClips(next); setPlayhead(0); setSelClipId(null);
      const total = Object.keys(keyToAsset).length;
      ping(`Imported ${next.length} clips · ${matched}/${total} media relinked${matched && uidNow ? " · uploading to cloud in background" : ""}`);
      return next;
    } catch (e) { setError("Import failed: " + e.message); return null; }
  };

  // FULL-MOVIE reverse-population: watch the whole master edit, then reconstruct as much of the
  // Production as possible — a scene breakdown (multiple scenes across acts), the screenplay per scene,
  // a character list (recognized + tagged to the connected World's characters), and a world bible/logline.
  const [reversing, setReversing] = useState(false);
  const reversePopulateProduction = async (clipsArg) => {
    if (reversing || scriptBuilding) return;
    const src = Array.isArray(clipsArg) ? clipsArg : clips;
    const vClips = src.filter((c) => /^v\d+$/.test(c.trackId) && c.assetId && !c.disabled).sort((a, b) => a.start - b.start);
    if (!vClips.length) { ping("Nothing on the video tracks to analyze."); return; }
    const CAP = 48;
    if (vClips.length > CAP) ping(`Master cut is long — analyzing ${CAP} clips across ${vClips.length}.`);
    // even sampling across the whole timeline so the breakdown covers the full arc, not just the head
    const step = vClips.length > CAP ? vClips.length / CAP : 1;
    const sample = vClips.length > CAP ? Array.from({ length: CAP }, (_, i) => vClips[Math.floor(i * step)]) : vClips;
    setReversing(true);
    try {
      let worldChars = [];
      try { worldChars = (await worldCharactersForProduction(prod)) || []; } catch { /* no world */ }
      const cast = Array.from(new Set([...(prod.cast || []).map((c) => c.name), ...worldChars.map((x) => x?.name)].filter(Boolean)));
      const { analyzeClipForScript } = await import("../../services/geminiService");
      const analyses = [];
      let n = 0;
      for (const c of sample) {
        n++; setSaveState(`🎬 watching the cut ${n}/${sample.length}`);
        const asset = prod.mediaPool.find((a) => a.id === c.assetId);
        let a = null;
        if (asset?.url && ["video", "audio", "image"].includes(asset.type)) {
          try {
            let blob = await fetch(asset.url).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
            if (!blob || !blob.size) blob = await stGet("studio:blob:" + asset.id);
            if (blob && blob.size > 18 * 1024 * 1024) blob = (await stGet("studio:proxy:" + asset.id)) || blob;
            if (blob && blob.size && blob.size <= 18 * 1024 * 1024) {
              const b64 = await blobToBase64(blob);
              const mime = blob.type || (asset.type === "audio" ? "audio/mpeg" : asset.type === "image" ? "image/jpeg" : "video/mp4");
              a = await analyzeClipForScript(b64, mime, cast, c.label || asset.name || "clip");
            }
          } catch (e) { console.warn("[reverse] clip analysis failed:", asset?.name, e?.message || e); }
        }
        analyses.push({ clipId: c.id, label: c.label || asset?.name || "clip", start: +c.start.toFixed(1), duration: +c.duration.toFixed(1), analysis: a || { action: "(unanalyzed — offline or >18MB; build a proxy)", setting: "", dialogue: [] } });
      }
      setSaveState("🎬 breaking down the production…");
      const worldCtx = worldChars.length ? `CONNECTED WORLD CHARACTERS (tag matches to these EXACT names):\n${worldChars.map((w) => `${w.name}${w.visual_lock ? " — " + w.visual_lock.slice(0, 80) : ""}`).join("\n")}` : "";
      const r = await callClaudeJson(
        `${AGENT}\nYou REVERSE-ENGINEER an entire film production from its MASTER EDIT. You receive per-clip computer-vision action + speaker-attributed dialogue in cut order (sampled across the whole runtime). Reconstruct the production from what the FOOTAGE actually shows — never invent events, lines, or characters not evidenced. Group the cut into SCENES at location/time/story shifts. Recognize recurring people and give each a stable character name (prefer a connected-World name when it clearly matches; otherwise coin a consistent name and reuse it). Keep dialogue attributions.\n${JSON_RULES}\nSchema: {"logline":"one sentence","worldBible":"3-5 sentences: era, place, tone, rules the footage implies","characters":[{"name":"stable name","description":"look + role in one line","world":true|false}],"scenes":[{"title":"scene title","act":1|2|3,"slugline":"INT./EXT. LOCATION - TIME","tone":"one line","environment":"one line","script":"screenplay for THIS scene only, in cut order","clipIds":["ids of the clips in this scene"],"shots":[{"clipId":"echo input clipId","slug":"S1","type":"WIDE|MED|CU|INSERT|POV|OTS","camera":"what the footage shows","purpose":"why it's in the cut","lines":"dialogue heard or empty","character":"main on-screen character or empty"}]}]}`,
        `${worldCtx}\n\nKNOWN CAST:\n${(prod.cast || []).map((c) => c.name).join(", ") || "(none)"}\n\nMASTER EDIT (sampled, cut order):\n${JSON.stringify(analyses)}`
      );

      const clipToShot = new Map();
      let firstActId = null, firstSceneId = null;
      updateProd((p) => {
        // 1) characters → cast, tagged to the World when matched
        p.cast = p.cast || [];
        const wcNames = new Set(worldChars.map((w) => (w.name || "").toLowerCase()));
        (r.characters || []).forEach((ch) => {
          if (!ch?.name) return;
          const key = ch.name.toLowerCase();
          const existing = p.cast.find((x) => (x.name || "").toLowerCase() === key);
          const inWorld = ch.world || wcNames.has(key);
          if (existing) { if (inWorld) existing.fromWorld = true; if (!existing.looks && ch.description) existing.looks = ch.description; }
          else p.cast.push({ id: uid(), name: ch.name, looks: ch.description || "", voice: "", personality: "", media: [], wardrobe: [], fromWorld: inWorld, fromAnalysis: true });
        });
        // 2) logline / world bible if empty
        if (!p.description && r.logline) p.description = r.logline;
        if (!p.world && r.worldBible) p.world = r.worldBible;
        // 3) scenes → acts (I/II/III), each with reverse-built shots
        p.acts = p.acts && p.acts.length ? p.acts : [1, 2, 3].map((num) => ({ id: uid(), number: num, title: "ACT " + ["I", "II", "III"][num - 1], scenes: [] }));
        while (p.acts.length < 3) p.acts.push({ id: uid(), number: p.acts.length + 1, title: "ACT " + ["I", "II", "III"][p.acts.length], scenes: [] });
        (r.scenes || []).forEach((s) => {
          const actIdx = Math.min(2, Math.max(0, (s.act || 1) - 1));
          const act = p.acts[actIdx]; act.scenes = act.scenes || [];
          const shots = (s.shots || []).map((sh, i) => {
            const id = uid(); if (sh.clipId) clipToShot.set(sh.clipId, id);
            return { id, slug: sh.slug || `S${i + 1}`, type: sh.type || "MED", camera: sh.camera || "", purpose: sh.purpose || "", lines: sh.lines || "", character: sh.character || "", status: "ready", notes: "reverse-built from the master edit", still: "", video: "", voice: "" };
          });
          const sceneId = uid();
          act.scenes.push({ ...BLANK_SCENE(), id: sceneId, title: s.title || "SCENE", slugline: s.slugline || "", tone: s.tone || "", environment: s.environment || "", script: s.script || "", shots });
          if (!firstSceneId) { firstSceneId = sceneId; firstActId = act.id; }
        });
      });
      if (clipToShot.size) applyClips(src.map((c) => (clipToShot.has(c.id) ? { ...c, shotId: clipToShot.get(c.id) } : c)));
      const nChars = (r.characters || []).length, nScenes = (r.scenes || []).length, nWorld = (r.characters || []).filter((c) => c.world).length;
      ping(`🎬 Production reverse-built — ${nScenes} scenes, ${nChars} characters${nWorld ? ` (${nWorld} tagged to your World)` : ""}. Opening SLATE…`);
      if (firstActId && firstSceneId) gotoScene(firstActId, firstSceneId, "slate");
    } catch (e) {
      console.warn("[reverse-populate]", e);
      window.alert("Reverse-populate failed: " + (e?.message || e));
    } finally { setSaveState("saved"); setReversing(false); }
  };

  // "Import Edit" (Production page): bring an edit/timeline in, then optionally reverse-build the whole
  // production. Uses a pending ref so the import runs AFTER the new edit is active (avoids stale editSel).
  const editImportRef = useRef(null);
  const pendingEditImport = useRef(null); // { file, mode: 'full'|'scene' }
  const importEditToProduction = (file, forcedMode) => {
    if (!file) return;
    // forcedMode ('full'|'scene') skips the prompt — used by external handoffs (e.g. a live-stream
    // replay sent straight from Reello) so the import runs without a modal on boot.
    let mode = forcedMode;
    if (!mode) {
      const full = window.confirm(
        `Is "${file.name}" the FULL MOVIE (master timeline)?\n\n` +
        `OK  →  Full movie: I'll populate the timeline, then analyze the whole cut in the background — ` +
        `break it into scenes, reverse-build the screenplay, recognize characters (tagging any that match your ` +
        `connected World), and fill in the production bible.\n\n` +
        `Cancel  →  Just a Scene: populate the timeline and build a single scene from it.`
      );
      mode = full ? "full" : "scene";
    }
    const base = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "IMPORTED EDIT";
    pendingEditImport.current = { file, mode };
    newEdit(base); // creates the edit + navigates to the edit page → the effect below fires the import
  };
  useEffect(() => {
    const pend = pendingEditImport.current;
    if (!pend || !editSel || page !== "edit") return;
    pendingEditImport.current = null;
    (async () => {
      const built = await importTimelineWithMedia(pend.file);
      if (built && built.length) { if (pend.mode === "full") await reversePopulateProduction(built); else await buildScriptFromTimeline(built); }
    })();
    // eslint-disable-next-line
  }, [editSel, page]);

  const exportTimelineFCPXML = () => {
    try {
      const xml = exportFCPXML(clips, tracks, prod?.mediaPool || [], { w: vfmt.w, h: vfmt.h, fps: vfmt.fps }, (container?.title) || prod?.title || "Fabula Project");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
      a.download = ((container?.title) || "fabula_timeline").replace(/\s+/g, "_") + ".fcpxml";
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
      ping("FCPXML exported — import into DaVinci Resolve (File ▸ Import ▸ Timeline)");
    } catch (e) { setError("Export failed: " + e.message); }
  };

  // Resume any unfinished background uploads across sessions; stamp the cloud URL onto the asset when done.
  useEffect(() => {
    initResumableUploads((assetId, cloudUrl) => {
      if (!cloudUrl) return;
      updateProd((p) => { const a = p.mediaPool?.find((x) => x.id === assetId); if (a && !a.cloudUrl) a.cloudUrl = cloudUrl; });
    });
    const off = onUploadProgress((qd) => setUploadPending(qd.filter((e) => e.status !== "done").length));
    return () => { off?.(); };
    // eslint-disable-next-line
  }, []);

  // ── Sync / watch folders ──────────────────────────────────────────────────
  // Import files into bins that MIRROR the on-disk folder structure (bin name = relative folder path),
  // read local-first + queued for background upload. Deduped by name+bin so a rescan only adds new files.
  const importFilesToBins = async (files, opts = {}) => {
    if (!files?.length) return 0;
    const folderId = opts.folderId || undefined; // watch-folder origin → assets remember it, so on reload
                                                  // we re-open the real file straight from the drive handle.
    const uidNow = auth.currentUser?.uid;
    // Existing assets keyed by name|bin. A same-key asset that's ONLINE → true duplicate (skip); one
    // that's OFFLINE (no url, e.g. a placeholder from an XML/EDL import or a reload that lost the blob)
    // → RE-LINK it in place. This is why re-importing a folder used to "add 0": the offline placeholders
    // matched every file and blocked them. Now they get relinked and light up.
    const byKey = new Map((prod?.mediaPool || []).map((a) => [`${a.name}|${a.bin || "imports"}`, a]));
    // Content signature (name+size) → catches the SAME file even if its bin changed between imports, so a
    // re-scan can't spawn duplicate assets (the cause of "3,711 files became 10,000 in the sync queue").
    const bySig = new Map();
    (prod?.mediaPool || []).forEach((a) => { if (a.size) { const s = `${(a.name || "").toLowerCase()}|${a.size}`; if (!bySig.has(s)) bySig.set(s, a); } });
    const newAssets = [], newBins = new Set(), relinks = []; // relinks: { id, url }
    const seenBatch = new Set();
    let vectorFailed = 0, added = 0, relinked = 0;
    const castIdx = (prod?.cast || []).map((c) => ({ id: c.id, name: (c.name || "").toLowerCase() })).filter((c) => c.name.length >= 2);
    const worldIdx = [];
    Object.entries(prod?.worldCats || {}).forEach(([cat, items]) => (items || []).forEach((it) => { if ((it.name || "").length >= 2) worldIdx.push({ cat, id: it.id, name: it.name.toLowerCase() }); }));
    const castLinks = []; // { assetId, castId }
    const scriptFiles = []; // .txt/.md/.fountain → Lorea structuring, not media
    for (const { path, name, file: rawFile } of files) {
      try {
        const bin = path || "imports";
        if (/\.(txt|md|fountain|markdown)$/i.test(name)) { scriptFiles.push(rawFile); continue; }
        const sig = rawFile?.size ? `${name.toLowerCase()}|${rawFile.size}` : null;
        if (seenBatch.has(sig || `${name}|${bin}`)) continue; seenBatch.add(sig || `${name}|${bin}`);
        // Match by name+bin OR by content signature (name+size) so a bin change can't duplicate a file.
        const dup = byKey.get(`${name}|${bin}`) || (sig ? bySig.get(sig) : null);
        if (dup && dup.url && !dup.offline) continue; // already imported and online (same bin or same file elsewhere) — skip
        // Vector art (SVG/.ai/PDF) → hi-res alpha PNG. Undecodable → skip with a hint.
        let file = rawFile, vector = false;
        if (isVectorFile(rawFile)) {
          const png = await rasterizeVector(rawFile).catch(() => null);
          if (png) { file = png; vector = true; } else { vectorFailed++; continue; }
        }
        if (bin !== "imports") newBins.add(bin);
        // Storage-dedup (Phase 1): a watch-folder ORIGINAL is re-openable straight from the disk handle,
        // so we don't keep a second copy of its bytes on device. Vector art is the exception — it was
        // rasterised into a new PNG that has no matching file on disk, so that copy must be kept.
        const diskResolvable = !!folderId && !vector;
        const keepCopy = !diskResolvable;
        if (dup) {
          // RE-LINK the existing offline asset (keep its id/tags/links; just restore the media).
          const blobKey = "studio:blob:" + dup.id;
          if (keepCopy) await stSet(blobKey, file).catch(() => {}); // storage failure is non-fatal — the session blob still works
          relinks.push({ id: dup.id, url: URL.createObjectURL(file), size: rawFile?.size || file.size || 0, folderId, diskName: name, bin });
          if (uidNow && mediaAutoSync) enqueueUpload({ assetId: dup.id, name: file.name || name, mime: file.type || "application/octet-stream", size: file.size, blobKey, uid: uidNow, folderId, diskPath: diskResolvable ? bin : undefined, diskName: name }).catch(() => {});
          relinked++;
          continue;
        }
        const id = uid();
        const t = file.type || "";
        const type = vector ? "image" : t.startsWith("audio") ? "audio" : t.startsWith("image") ? "image" : /\.(json|lottie)$/i.test(name) ? "lottie" : "video";
        const hay = `${name} ${bin}`.toLowerCase();
        const tags = new Set();
        let castId, worldCat;
        castIdx.forEach((c) => { if (hay.includes(c.name)) { tags.add(c.name); if (!castId) castId = c.id; castLinks.push({ assetId: id, castId: c.id }); } });
        worldIdx.forEach((w) => { if (hay.includes(w.name)) { tags.add(w.name); if (!worldCat) worldCat = w.cat; } });
        FOLDER_MAP.forEach(([re, cat]) => { if (re.test(bin)) { tags.add(cat); if (!worldCat) worldCat = cat; } });
        if (keepCopy) await stSet("studio:blob:" + id, file).catch(() => {}); // non-fatal; skipped for disk-resolvable folder originals
        newAssets.push({ id, name, type, vector: vector || undefined, url: URL.createObjectURL(file), duration: 0, size: rawFile?.size || file.size || 0, bin, session: true, synced: mediaAutoSync ? undefined : "local", tags: [...tags], castId, worldCat, folderId, diskName: name, diskPath: folderId ? bin : undefined });
        // Local-first: bulk folder/watch imports only auto-upload when the user opts in — otherwise a
        // huge folder would flood the cloud uploader and hinder editing. "Sync to cloud" enqueues later.
        if (uidNow && mediaAutoSync) enqueueUpload({ assetId: id, name: file.name || name, mime: file.type || "application/octet-stream", size: file.size, blobKey: "studio:blob:" + id, uid: uidNow, folderId, diskPath: diskResolvable ? bin : undefined, diskName: name }).catch(() => {});
        added++;
      } catch (e) { console.warn("[import] skipped a file:", name, e); } // one bad file never aborts the batch
    }
    if (vectorFailed) ping(`${vectorFailed} vector file${vectorFailed === 1 ? "" : "s"} couldn't be read — re-save as SVG or PDF and re-import`);
    if (newAssets.length || relinks.length) updateProd((p) => {
      p.mediaPool = p.mediaPool || []; p.bins = p.bins || [];
      newBins.forEach((b) => { if (!p.bins.includes(b)) p.bins.push(b); });
      newAssets.forEach((a) => p.mediaPool.push(a));
      relinks.forEach(({ id, url, size, folderId: fid, diskName, bin: rbin }) => { const a = p.mediaPool.find((x) => x.id === id); if (a) { a.url = url; a.offline = false; if (size) a.size = size; if (fid) { a.folderId = fid; a.diskName = diskName || a.name; if (rbin) { a.bin = rbin; a.diskPath = rbin; } } if (!mediaAutoSync) a.synced = "local"; } });
      castLinks.forEach(({ assetId, castId }) => {
        const m = (p.cast || []).find((c) => c.id === castId);
        if (m) { m.media = m.media || []; if (!m.media.includes(assetId)) m.media.push(assetId); }
      });
    });
    const tagged = newAssets.filter((a) => a.tags?.length).length;
    if (tagged) ping(`Auto-tagged ${tagged} asset${tagged === 1 ? "" : "s"} into cast / world`);
    if (relinked) ping(`Re-linked ${relinked} offline asset${relinked === 1 ? "" : "s"} — they're live now`);
    if (scriptFiles.length) {
      ping(`Structuring ${scriptFiles.length} script${scriptFiles.length === 1 ? "" : "s"} with Lorea…`);
      (async () => { for (const sf of scriptFiles) { const t = await sf.text().catch(() => ""); if (t) await importScriptText(t, sf.name); } })();
    }
    return added + relinked;
  };
  // Literal folder mirror: an <input webkitdirectory> (or dropped folder) → bins that match the
  // on-disk tree exactly. Each file's webkitRelativePath keeps the FULL nested path (root folder
  // included) as its bin, so "Footage/Day1/clip.mp4" lands in the "Footage/Day1" bin and the pool
  // renders the same hierarchy. (The World page's IMPORT FOLDER is different — it flattens + AI-
  // classifies into cast/world categories; this one just reproduces the folders.)
  const importFolderMirror = async (fileList) => {
    const arr = Array.from(fileList || []);
    // Always report the outcome — a silent "nothing happened" was impossible to diagnose. This tells
    // you (and a bug report) exactly where a folder import stalls: picker, dedup, or display.
    if (!arr.length) { ping("That folder had no files, or the picker was cancelled."); return 0; }
    const items = arr.map((f) => {
      const rel = f.webkitRelativePath || f.name;
      const path = rel.split("/").slice(0, -1).join("/"); // drop the filename → the nested folder path
      return { path, name: f.name, file: f };
    });
    const folders = new Set(items.map((i) => i.path || "imports")).size;
    const n = await importFilesToBins(items);
    ping(n
      ? `Imported ${n} file${n === 1 ? "" : "s"} across ${folders} folder${folders === 1 ? "" : "s"} — bins mirror the structure`
      : `Picked ${arr.length} file${arr.length === 1 ? "" : "s"}, but 0 were added (already imported, or all scripts/unreadable).`);
    return n;
  };
  // SLATE door into generation. A shot card already holds the compiled still/video prompts and the
  // scene bible already holds the identity locks — this bundles them into a ShotSpec and opens the one
  // generation panel pre-filled, instead of the user copy-pasting into a provider by hand. `which`
  // picks which of the shot's prompts to run; the production's default target for that kind decides
  // the provider (still → stillTarget, video → service).
  const openGenForShot = (sc, shot, which) => {
    if (!shot?.[which]) return;
    const spec = specFromShot({
      shot, bible: sc?.bible, which,
      aspect: prod?.defaults?.aspect,
      sceneId: sc?.id,
    });
    const target = which === "video" ? prod?.defaults?.service : prod?.defaults?.stillTarget;
    setGenCtx({
      spec,
      kind: which === "video" ? "video" : "image",
      provider: connectorById(target || "")?.id,   // resolves legacy ids like "mj_magnific"
      title: `${shot.slug} · ${which.toUpperCase()}`,
    });
    setGenOpen(true);
  };

  // EDIT door into generation. `buildEditFromBreakdown()` stamps `shotId` onto every clip it lays down,
  // so a clip on the timeline can find its way back to the SLATE shot that produced it — which is what
  // makes "regenerate this shot without leaving the cut" possible at all.
  const sceneForShot = (shotId) =>
    shotId ? allScenes.find(({ scene: sc }) => (sc.shots || []).some((s) => s.id === shotId))?.scene : null;
  const shotForClip = (c) => {
    const sc = sceneForShot(c?.shotId);
    const shot = sc ? (sc.shots || []).find((s) => s.id === c.shotId) : null;
    return shot ? { scene: sc, shot } : null;
  };
  const openGenForClip = (c, which) => {
    const found = shotForClip(c);
    if (!found) { ping("This clip isn't linked to a SLATE shot — generate from the shot list instead."); return; }
    if (!found.shot[which]) { ping(`No ${which} prompt on ${found.shot.slug} yet — run SLATE prompts first.`); return; }
    openGenForShot(found.scene, found.shot, which);
  };

  // Agent results → bins: the generation agent writes outputs to cloud storage; when a job finishes,
  // GeneratePanel hands the result URLs here and they become pool assets in the target bin — the
  // "populate bins headless" path (same destination the watch folder feeds).
  const importGenResults = (results, bin, job) => {
    if (!results?.length) return;
    const target = bin || "Generated";
    // Mint the pool assets first so the ids exist before any clip points at one.
    const minted = results.map((r) => ({
      id: uid(), name: r.name || "generated", type: r.type || "image", url: r.url, cloudUrl: r.url,
      bin: target, duration: 0, generated: true, synced: true, session: true,
      shotId: job?.spec?.shotId,          // provenance: which SLATE shot this came from
    }));
    updateProd((p) => {
      p.mediaPool = p.mediaPool || []; p.bins = p.bins || [];
      if (!p.bins.includes(target)) p.bins.push(target);
      minted.forEach((a) => p.mediaPool.push(a));
    });

    // Close the loop back into the cut. `buildEditFromBreakdown()` lays down a `kind:"script"`
    // placeholder per shot; the first playable result for that shotId takes its slot, keeping the
    // placeholder's start and duration so the pacing the script implied survives. If the slot already
    // holds real media this is an alternate take — add it alongside and mute the old one rather than
    // destroying a take the user may still want.
    const shotId = job?.spec?.shotId;
    const playable = minted.find((a) => a.type === "video") || minted.find((a) => a.type === "image");
    let swapped = 0, alt = 0;
    if (shotId && playable) {
      const placed = placeResultInCut(clips, shotId, playable, uid);
      swapped = placed.filled; alt = placed.alternates;
      if (swapped || alt) { setClips(placed.clips); commitClips(placed.clips); }
    }

    const added = `${results.length} generated result${results.length === 1 ? "" : "s"} added to ${target}`;
    ping(swapped ? `${added} — ${swapped} placeholder${swapped === 1 ? "" : "s"} filled in the cut`
      : alt ? `${added} — alternate take laid in, previous muted`
        : added);
  };
  // ── Media Assets: notes + add-to-scene ────────────────────────────────────────
  const updateAssetNote = (assetId, note) => updateProd((p) => { const a = p.mediaPool?.find((x) => x.id === assetId); if (a) a.note = note; });
  const sceneList = () => (prod?.acts || []).flatMap((a) => (a.scenes || []).map((s) => ({ actId: a.id, sceneId: s.id, label: `${a.title || "ACT"} · ${s.title || s.slugline || "Scene"}` })));
  // ── Cloud sync controls (large-project friendly: local-first, pausable) ──────────
  const setAutoSync = (on) => { setMediaAutoSync(on); try { localStorage.setItem("fabula:autoSyncMedia", on ? "1" : "0"); } catch { /* */ } };
  const toggleSyncPaused = async () => { const p = !syncPaused; setSyncPaused(p); await setUploadsPaused(p); };
  const clearSyncNow = async () => { await clearUploadQueue(); setUploadPending(0); ping("Sync queue cleared — nothing more uploads until you sync again."); };
  const syncAllLocalMedia = async () => {
    const uidNow = auth.currentUser?.uid;
    if (!uidNow) { ping("Sign in to sync media to the cloud."); return; }
    const locals = (prod?.mediaPool || []).filter((a) => a.url && !a.cloudUrl);
    let n = 0;
    for (const a of locals) {
      const blobKey = "studio:blob:" + a.id;
      const blob = await stGet(blobKey);
      if (!blob) continue;
      enqueueUpload({ assetId: a.id, name: a.name, mime: blob.type || "application/octet-stream", size: blob.size || a.size || 0, blobKey, uid: uidNow }).catch(() => {});
      n++;
    }
    if (syncPaused) { setSyncPaused(false); await setUploadsPaused(false); }
    ping(n ? `Queued ${n} file${n === 1 ? "" : "s"} to upload in the background` : "Everything's already synced.");
  };
  // Append an asset to a scene's timeline as a V1 clip (after the last picture clip). If that scene is
  // the one open in the editor, go through the live clips state so the debounced autosave doesn't
  // clobber the addition; otherwise write straight into the production.
  const addAssetToScene = (asset, actId, sceneId) => {
    if (!asset || !sceneId) return;
    const dur = asset.duration && isFinite(asset.duration) && asset.duration > 0 ? asset.duration : 5;
    const label = asset.name || "Clip";
    if (!editSel && sceneSel?.sceneId === sceneId) {
      const v1End = clips.filter((c) => (c.trackId || "v1").startsWith("v")).reduce((m, c) => Math.max(m, (c.start || 0) + (c.duration || 0)), 0);
      const nc = [...clips, { id: uid(), trackId: "v1", start: v1End, duration: dur, kind: "media", assetId: asset.id, label, srcIn: 0 }];
      setClips(nc); commitClips(nc);
    } else {
      updateProd((p) => {
        const sc = p.acts?.find((a) => a.id === actId)?.scenes.find((s) => s.id === sceneId);
        if (!sc) return;
        sc.timeline = sc.timeline || { clips: [] };
        const cl = sc.timeline.clips || [];
        const v1End = cl.filter((c) => (c.trackId || "v1").startsWith("v")).reduce((m, c) => Math.max(m, (c.start || 0) + (c.duration || 0)), 0);
        cl.push({ id: uid(), trackId: "v1", start: v1End, duration: dur, kind: "media", assetId: asset.id, label, srcIn: 0 });
        sc.timeline.clips = cl; sc.updatedAt = Date.now();
      });
    }
    const sn = sceneList().find((s) => s.sceneId === sceneId);
    ping(`Added “${label}” to ${sn?.label || "the scene"}`);
  };
  // Scene context builder parameterized by a scene payload (the active-scene `sceneContext()` above
  // reads the current `scene`; this one takes any scene so we can batch-run breakdowns).
  const sceneContextFor = (sc) => [
    `SCENE: ${sc.slugline || sc.title}`,
    `MODE: ${sc.mode === "action" ? "ACTION SET PIECE" : "DIALOGUE SCENE"}`,
    productionContext(),
    sc.tone ? `EMOTIONAL TONE / SUBTEXT: ${sc.tone}` : "",
    sc.environment ? `ENVIRONMENT NOTES: ${sc.environment}` : "",
    sc.styleNotes ? `VISUAL STYLE / REFERENCES: ${sc.styleNotes}` : "",
    `ASPECT RATIO: ${prod.defaults.aspect}`,
    `\nSCRIPT / SCENE CONCEPT:\n${sc.script}`,
  ].filter(Boolean).join("\n\n");

  // Run a full SLATE breakdown (scene bible → shot list) for ONE scene, identified by ids and given
  // its data directly (so it doesn't depend on the stale `prod` closure right after scenes are added).
  // Applies bible + shots via functional updateProd (fresh state) and fills cast gaps from the locks.
  const runBreakdownForScene = async (actId, sceneId, sc) => {
    if (!sc?.script?.trim()) return false;
    const bible = await callClaudeJson(bibleSystem(), sceneContextFor(sc));
    updateProd((p) => {
      const s = p.acts?.find((a) => a.id === actId)?.scenes.find((x) => x.id === sceneId);
      if (s) s.bible = bible;
      (bible.characters || []).forEach((bc) => {
        if (!bc?.name) return;
        const ex = p.cast.find((c) => c.name.trim().toLowerCase() === bc.name.trim().toLowerCase());
        if (ex) { if (!ex.looks?.trim()) ex.looks = bc.visual_lock; if (!ex.voice?.trim()) ex.voice = bc.voice_profile; }
        else p.cast.push({ id: uid(), name: bc.name, looks: bc.visual_lock, voice: bc.voice_profile, personality: "", dos: "", donts: "" });
      });
    });
    const parsed = await callClaudeJson(shotListSystem(sc.mode), `SCENE BIBLE:\n${bibleText(bible)}\n\n${sceneContextFor(sc)}`);
    const shots = (parsed.shots || []).map((s) => ({ ...s, id: uid(), still: "", video: "", voice: "", continuity: "", notes: "", status: "planned", frameUrl: "" }));
    updateProd((p) => {
      const s = p.acts?.find((a) => a.id === actId)?.scenes.find((x) => x.id === sceneId);
      if (s) s.shots = shots;
    });
    return shots.length > 0;
  };

  // Lorea script engine: drop a .txt/.md/.fountain (rough screenplay, treatment, prose, outline, notes)
  // → intelligently structure it into scenes across the acts + identify characters, then AUTO-RUN the
  // SLATE breakdown so scenes arrive with coverage. This is where scripts built from the timeline
  // (Build Script) also live.
  const importScriptText = async (text, sourceName = "script") => {
    const clean = (text || "").trim();
    if (clean.length < 40) { ping("That file has too little text to structure into a script."); return; }
    setScriptImporting(true);
    try {
      const r = await callClaudeJson(
        `${AGENT}\nYou are the Lorea script engine. You receive RAW TEXT — a rough screenplay, treatment, prose, outline, or unformatted notes. STRUCTURE it into a screenplay for this production: infer scene breaks at location/time/story shifts, write proper sluglines, and KEEP the author's events and dialogue (never invent a new plot). Identify recurring characters.\n${JSON_RULES}\nSchema: {"logline":"one sentence","worldBible":"3-5 sentences on era/place/tone/rules implied","characters":[{"name":"stable name","description":"look + role in one line","world":false}],"scenes":[{"act":1|2|3,"title":"scene title","slugline":"INT./EXT. LOCATION - TIME","tone":"one line","environment":"one line","script":"screenplay for THIS scene: slugline, action lines, CHARACTER\\ndialogue blocks"}]}`,
        `${productionContext()}\n\nSOURCE FILE: ${sourceName}\n\nRAW TEXT:\n${clean.slice(0, 24000)}`,
      );
      let firstActId = null, firstSceneId = null, nChars = 0;
      const made = []; // { actId, sceneId, sc } — the scenes we just created, for auto-breakdown
      updateProd((p) => {
        p.cast = p.cast || [];
        (r.characters || []).forEach((ch) => {
          if (!ch?.name) return;
          const key = ch.name.toLowerCase();
          const ex = p.cast.find((x) => (x.name || "").toLowerCase() === key);
          if (ex) { if (!ex.looks && ch.description) ex.looks = ch.description; }
          else { p.cast.push({ id: uid(), name: ch.name, looks: ch.description || "", voice: "", personality: "", media: [], wardrobe: [], fromAnalysis: true }); nChars++; }
        });
        if (!p.description && r.logline) p.description = r.logline;
        if (!p.world && r.worldBible) p.world = r.worldBible;
        p.acts = p.acts && p.acts.length ? p.acts : [1, 2, 3].map((num) => ({ id: uid(), number: num, title: "ACT " + ["I", "II", "III"][num - 1], scenes: [] }));
        while (p.acts.length < 3) p.acts.push({ id: uid(), number: p.acts.length + 1, title: "ACT " + ["I", "II", "III"][p.acts.length], scenes: [] });
        (r.scenes || []).forEach((s) => {
          const actIdx = Math.min(2, Math.max(0, (s.act || 1) - 1));
          const act = p.acts[actIdx]; act.scenes = act.scenes || [];
          const sceneId = uid();
          const sc = { ...BLANK_SCENE(), id: sceneId, title: s.title || "SCENE", slugline: s.slugline || "", tone: s.tone || "", environment: s.environment || "", script: s.script || "" };
          act.scenes.push(sc);
          made.push({ actId: act.id, sceneId, sc });
          if (!firstSceneId) { firstSceneId = sceneId; firstActId = act.id; }
        });
      });
      ping(`📝 Structured ${made.length} scene${made.length === 1 ? "" : "s"} from ${sourceName}${nChars ? ` · ${nChars} new cast` : ""}. Building SLATE coverage…`);
      if (firstActId && firstSceneId) gotoScene(firstActId, firstSceneId, "slate");
      // Auto-run the SLATE breakdown (bible → shots) for each new scene, capped so a feature-length
      // script doesn't fan out into hundreds of AI calls; the rest can be run per scene on demand.
      const CAP = 24;
      const todo = made.slice(0, CAP);
      let done = 0;
      for (const m of todo) {
        try { await runBreakdownForScene(m.actId, m.sceneId, m.sc); done++; setScriptMsg(`SLATE breakdown ${done}/${todo.length}…`); }
        catch (e) { console.warn("[breakdown]", m.sceneId, e); }
      }
      setScriptMsg("");
      ping(`🎬 SLATE coverage built for ${done} scene${done === 1 ? "" : "s"}${made.length > CAP ? ` · ${made.length - CAP} more — open a scene and run breakdown` : ""}.`);
    } catch (e) { console.warn("[script import]", e); window.alert("Couldn't structure that script: " + (e?.message || e)); }
    finally { setScriptImporting(false); setScriptMsg(""); }
  };
  const importScriptFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => /\.(txt|md|fountain|markdown)$/i.test(f.name));
    for (const f of files) { const text = await f.text().catch(() => ""); if (text) await importScriptText(text, f.name); }
  };
  const refreshSyncFolders = async () => { if (prod?.id) { try { setSyncFolders(await listSyncFolders(prod.id)); } catch { /* */ } } };
  const rescanSyncFolder = async (id, interactive, full = false) => {
    if (!prod?.id) return;
    try {
      const r = await rescanNew(prod.id, id, interactive, full);
      if (!r) { if (interactive) ping("Grant access to the folder so it can sync"); return; }
      if (!r.fresh.length) { if (interactive) ping(r.total ? `Nothing new — all ${r.total} files already imported. (Use RESCAN to force a full re-import.)` : `That folder has no media files.`); return; }
      const n = await importFilesToBins(r.fresh, { folderId: id });
      // Mark seen ONLY after the import ran, so files that failed to import aren't hidden from future
      // scans. (The old code marked them seen during the scan, which permanently stranded them.)
      await markSeen(prod.id, id, r.fresh.map((f) => f.key));
      await refreshSyncFolders();
      if (interactive || n) ping(`Read ${r.total} file${r.total === 1 ? "" : "s"} from ${r.folder.name} · imported ${n} into the media pool`);
    } catch (e) { if (interactive) ping("Sync failed: " + (e?.message || e)); }
  };
  const addSyncFolderNow = async () => {
    if (!prod?.id) return;
    // Live-watching needs the File System Access API (Chrome/Edge/Android Chrome). Where it's missing
    // (Safari, Firefox, some PWA contexts) fall back to a one-time folder import so the local structure
    // still reads in immediately — just without background re-scanning.
    if (typeof window.showDirectoryPicker !== "function") {
      ping("Live-watching needs Chrome or Edge — importing this folder once instead.");
      mirrorFolderRef.current?.click();
      return;
    }
    setFolderSyncing(true);
    try {
      const f = await addSyncFolder(prod.id);
      if (f) { await refreshSyncFolders(); ping("Watching folder — reading files…"); await rescanSyncFolder(f.id, true); await refreshSyncFolders(); }
    }
    catch (e) { ping(e?.message || "Couldn't add that folder"); }
    finally { setFolderSyncing(false); }
  };
  const removeSyncFolderNow = async (id) => { if (prod?.id) { await removeSyncFolder(prod.id, id); await refreshSyncFolders(); ping("Stopped watching that folder"); } };
  const rescanAll = async (interactive, full = false) => { setFolderSyncing(true); try { for (const f of syncFolders) await rescanSyncFolder(f.id, interactive, full); } finally { setFolderSyncing(false); } };

  useEffect(() => { refreshSyncFolders(); /* eslint-disable-next-line */ }, [prod?.id]);
  // Reset media filters when the production changes. Otherwise a bin/search filter from a previous
  // project persists and strands the grid: every import lands in a bin the stale filter excludes, so
  // the grid shows empty while the counts (unfiltered) still tick up. This was the "number shows but
  // grid is empty" bug across all import methods.
  useEffect(() => { setBinFilter("all"); setMediaBin("all"); setMediaSearch(""); setMediaSel(null); setMediaCollapsed(new Set()); }, [prod?.id]);
  // Jump back to page 1 whenever the filter or page size changes, so you never land past the last page.
  useEffect(() => { setMediaPage(1); }, [mediaBin, mediaSearch, mediaPageSize, prod?.id]);
  useEffect(() => { setEditPoolPage(1); }, [binFilter, mediaSearch, mediaPageSize, prod?.id]);
  useEffect(() => { setSyncPaused(uploadsPaused()); }, []);
  // Keep a live "is the editor busy" flag the background poll can read without re-subscribing. During
  // playback or a render the edit thread is the priority — the folder walk must never compete with it.
  const editBusyRef = useRef(false);
  useEffect(() => { editBusyRef.current = playing || rendering; }, [playing, rendering]);
  // Poll watched folders (browsers can't push FS events): on an interval + on window focus. Only folders
  // whose read permission is still granted rescan silently; the rest wait for a manual (gesture) rescan.
  useEffect(() => {
    if (!prod?.id || !syncFolders.length) return undefined;
    let scanning = false;
    // Gentle, non-overlapping, idle-scheduled polling: skip a tick if the previous scan is still running
    // (large folders take a while), if the tab is hidden, or if the editor is playing/rendering. Run the
    // heavy directory walk in an idle slice so it yields to the edit thread instead of blocking it. Every
    // 90s — new files still show within a minute or two, without hammering a big project mid-edit.
    const doScan = async () => {
      if (scanning || document.hidden || editBusyRef.current) return;
      scanning = true;
      try { for (const f of syncFolders) { if (editBusyRef.current) break; await rescanSyncFolder(f.id, false); } } finally { scanning = false; }
    };
    const ric = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 0 }), 0));
    const tick = () => ric(() => { doScan(); }, { timeout: 4000 });
    const iv = setInterval(tick, 90000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); };
    // eslint-disable-next-line
  }, [prod?.id, syncFolders.length]);

  /* ----- format / multicam / blade ----- */
  const [formatOpen, setFormatOpen] = useState(false);
  const [mcSel, setMcSel] = useState([]);
  const [angleView, setAngleView] = useState(false);
  const vfmt = prod?.defaults?.format || { fps: 30, drop: false, w: 1920, h: 1080, label: "HD 1080p" };
  // Dynamic, unlimited tracks (display order: video group then audio). videoTracksAsc
  // is bottom→top for compositing (v1 base, higher numbers overlay).
  const tracks = (prod?.tracks && prod.tracks.length) ? prod.tracks : TRACKS;
  const videoTracksAsc = tracks.filter((t) => t.type === "video").sort((a, b) => (parseInt(a.id.slice(1), 10) || 0) - (parseInt(b.id.slice(1), 10) || 0));
  const TRACK_PREFIX = { video: "v", audio: "a", subtitle: "s" };
  const addTrack = (type) => updateProd((p) => {
    p.tracks = (p.tracks && p.tracks.length) ? p.tracks : TRACKS.map((t) => ({ ...t }));
    const pre = TRACK_PREFIX[type] || "x";
    const nums = p.tracks.filter((t) => t.type === type).map((t) => parseInt(t.id.slice(1), 10) || 0);
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    const entry = { id: pre + n, name: pre.toUpperCase() + n + (type === "subtitle" ? " · SUBTITLES" : ""), type };
    if (type === "subtitle") p.tracks.unshift(entry);                         // subtitles on top
    else if (type === "video") { const i = p.tracks.findIndex((t) => t.type === "video"); p.tracks.splice(Math.max(0, i), 0, entry); }
    else p.tracks.push(entry);
  });
  const SUB_FX = { op: 1, sc: 1, x: 0, y: 0, rot: 0, blur: 0, bri: 1, con: 1, sat: 1, blend: "screen", fadeIn: 0.1, fadeOut: 0.15, matte: { t: "none", x: 50, y: 50, w: 60, h: 60, f: 0 }, genNote: "" };
  const subTrackId = () => (tracks.find((t) => t.type === "subtitle")?.id) || "s1";
  const ensureSubTrack = (p, sid) => {
    p.tracks = (p.tracks && p.tracks.length) ? p.tracks : TRACKS.map((t) => ({ ...t }));
    if (!p.tracks.some((t) => t.id === sid)) p.tracks.unshift({ id: sid, name: sid.toUpperCase() + " · SUBTITLES", type: "subtitle" });
  };
  const writeTimelineClips = (p, nc) => {
    if (editSel) { const ed = p.edits.find((e) => e.id === editSel); if (ed) ed.timeline = { ...(ed.timeline || {}), clips: nc }; }
    else { const act = p.acts.find((a) => a.id === sceneSel?.actId); const sc = act?.scenes.find((s) => s.id === sceneSel?.sceneId); if (sc) sc.timeline = { ...(sc.timeline || {}), clips: nc }; }
  };
  const updateClip = (id, patch) => { const n = clips.map((c) => (c.id === id ? { ...c, ...patch } : c)); setClips(n); commitClips(n); };
  const addSubtitle = () => {
    const sid = subTrackId();
    const clip = { id: uid(), trackId: sid, start: playhead, duration: 2.5, kind: "subtitle", text: "Subtitle", label: "Subtitle", srcIn: 0, fx: { ...SUB_FX } };
    const nc = [...clips, clip];
    updateProd((p) => { ensureSubTrack(p, sid); writeTimelineClips(p, nc); });
    setClips(nc); setSelClipId(clip.id);
  };
  const addTitle = () => {
    const sid = subTrackId();
    const clip = { id: uid(), trackId: sid, start: playhead, duration: 3, kind: "title", text: "Title", subtitle: "", titleStyle: "modern", label: "Title", srcIn: 0, fx: { ...SUB_FX } };
    const nc = [...clips, clip];
    updateProd((p) => { ensureSubTrack(p, sid); writeTimelineClips(p, nc); });
    setClips(nc); setSelClipId(clip.id);
  };
  // Broadcast template graphic as a duration-aware timeline clip. Like a lower third it
  // carries a reference (pack + format + control overrides); the monitor and export share
  // one renderer and the entrance/exit is driven by the clip's own duration — drag the clip
  // handles and the animation retimes. The identity's held still is rasterized once; a
  // deterministic motion envelope (services/fabula/graphicMotion) animates it.
  const addBroadcastGraphic = (template) => {
    const sid = subTrackId();
    const dur = Math.max(1.5, (template.durationMs || 6000) / 1000);
    const clip = { id: uid(), trackId: sid, start: playhead, duration: dur, kind: "title",
      text: template.controls?.title || template.packName || template.name,
      subtitle: template.controls?.subtitle || "",
      bGraphic: { packId: template.packId, kind: template.kind, controls: template.controls },
      label: `${template.name}`, srcIn: 0, fx: { ...SUB_FX, blend: "normal", fadeIn: 0, fadeOut: 0 } };
    const nc = [...clips, clip];
    updateProd((p) => { ensureSubTrack(p, sid); writeTimelineClips(p, nc); });
    setClips(nc); setSelClipId(clip.id);
    ping(`${template.name} placed on the timeline — drag the clip handles to set its duration.`);
  };

  // Motion lower third: a title clip carrying a tGraphic (template id + overrides). The
  // monitor + export share one canvas renderer, so the template stays editable and exact.
  const addLowerThird = (spec) => {
    if (ltGallery && ltGallery !== "add") {
      // Swap the design on an existing clip; keep its text and timing.
      const nc = clips.map((c) => (c.id === ltGallery ? { ...c, tGraphic: { specId: spec.id }, tx: undefined, ty: undefined, label: `${c.text || spec.defaults.title} · ${spec.name}` } : c));
      setClips(nc); commitClips(nc); setLtGallery(null); return;
    }
    const sid = subTrackId();
    const clip = { id: uid(), trackId: sid, start: playhead, duration: spec.duration || 5, kind: "title", text: spec.defaults.title, subtitle: spec.defaults.subtitle || "", tag: spec.defaults.tag || "", tGraphic: { specId: spec.id }, label: `${spec.defaults.title} · ${spec.name}`, srcIn: 0, fx: { ...SUB_FX, blend: "normal", fadeIn: 0, fadeOut: 0 } };
    const nc = [...clips, clip];
    updateProd((p) => { ensureSubTrack(p, sid); writeTimelineClips(p, nc); });
    setClips(nc); setSelClipId(clip.id); setLtGallery(null);
  };

  const activeEdit = editSel ? prod?.edits?.find((e) => e.id === editSel) : null;
  const container = activeEdit || scene; // whichever timeline is open
  // ── playback-engine wiring (MUST sit below the `container` declaration — reading
  //    container?.timeline at render time above it was a TDZ crash on mount). ──
  // Playback diagnostics: shortly after play starts, surface what the engine actually
  // scheduled — silent tracks stop being a mystery ("3 pending", "2 undecodable", "solo on a1").
  useEffect(() => {
    if (!playing) return undefined;
    const t = setTimeout(() => {
      try {
        const st = engineStats();
        console.info("[fabula-playback]", st);
        if (st.dead) ping("Audio device stalled — switched to direct playback for this session. If audio still misbehaves, check Windows sound devices / Bluetooth.");
        if (st.running && st.unplayable.length) ping(`${st.unplayable.length} audio source${st.unplayable.length === 1 ? "" : "s"} using streaming playback (${(st.reasons?.[0] || "").split(" ← ")[0] || "?"}) — this does not mean the file is offline.`);
        else if (st.running && st.pending > 0) ping(`${st.pending} audio clip${st.pending === 1 ? "" : "s"} still decoding — they join as they finish.`);
        if (st.running && st.soloed.length) ping(`SOLO is on (${st.soloed.join(", ")}) — other tracks are muted.`);
      } catch { /* diagnostics only */ }
    }, 1200);
    return () => clearTimeout(t);
  }, [playing]); // eslint-disable-line
  // Live mixer moves (fader/pan/mute/solo/EQ/comp/sends) reach the engine's buses mid-play.
  const engineTrackKey = JSON.stringify(container?.timeline?.trackSettings || {});
  useEffect(() => { setEngineTracks(container?.timeline?.trackSettings || {}); }, [engineTrackKey]); // eslint-disable-line
  // Decode the timeline's audio in the background so the first play is instant, and
  // re-render when the engine marks a source unplayable (element fallback mounts).
  const [, setEngineVer] = useState(0);
  useEffect(() => subscribePlayback(() => setEngineVer((v) => v + 1)), []);
  const clipAudioSig = useMemo(() => clips.map((c) => `${c.id}:${c.assetId || ""}`).join("|"), [clips]);
  useEffect(() => {
    if (!prod?.mediaPool?.length || !clips.length) return undefined;
    const t = setTimeout(() => warmAudio(clips, prod.mediaPool), 400);
    return () => clearTimeout(t);
  }, [clipAudioSig, prod?.id]); // eslint-disable-line

  const newEdit = (title) => {
    const ed = { id: uid(), title: title || `EDIT ${(prod?.edits?.length || 0) + 1}`, timeline: { clips: [], trackSettings: {} }, updatedAt: Date.now() };
    updateProd((p) => { p.edits.push(ed); });
    setSceneSel(null); setEditSel(ed.id); setPage("edit"); setEditWs("edit");
  };
  const createQuickProject = async () => {
    const p = migrate({
      id: uid(), title: "UNTITLED PROJECT", type: "film", description: "",
      themes: "", world: "", cast: [], mediaPool: [],
      defaults: { style: "", aspect: "16:9", service: "kling", stillTarget: "mj_magnific" },
      acts: [1, 2, 3].map((n) => ({ id: uid(), number: n, title: "ACT " + ["I", "II", "III"][n - 1], scenes: [] })),
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    const ed = { id: uid(), title: "EDIT 1", timeline: { clips: [], trackSettings: {} }, updatedAt: Date.now() };
    p.edits.push(ed);
    await stSet("studio:prod:" + p.id, p);
    saveProjectCloud(p).catch(() => {}); // durable platform copy immediately (guards the debounce race)
    setProd(p); setSceneSel(null); setEditSel(ed.id); setEditWs("edit");
    ping("Quick project ready — cut first, story layer whenever you want it");
  };
  const setTrackSetting = (tid, patch) => {
    const apply = (tl) => { tl.trackSettings = tl.trackSettings || {}; tl.trackSettings[tid] = { vol: 1, mute: false, ...(tl.trackSettings[tid] || {}), ...patch }; };
    if (editSel) updateProd((p) => { const ed = p.edits.find((e) => e.id === editSel); if (ed) { ed.timeline = ed.timeline || { clips: [] }; apply(ed.timeline); } });
    else updateScene((sc) => { sc.timeline = sc.timeline || { clips: [] }; apply(sc.timeline); });
  };
  const exportEDL = () => {
    const edlTc = (s) => fmtTc(s + 3600, { fps: vfmt.fps });
    let n = 0;
    const lines = [`TITLE: ${(container?.title || "FABULA SEQUENCE").toUpperCase()}`, `FCM: NON-DROP FRAME`, ``];
    tracks.map((t) => t.id).forEach((tid) => {
      clips.filter((c) => c.trackId === tid).sort((a, b) => a.start - b.start).forEach((c) => {
        n++;
        const ch = tid.startsWith("v") ? "V" : tid === "a2" ? "A2" : "A";
        const si = c.srcIn || 0;
        lines.push(`${String(n).padStart(3, "0")}  AX       ${ch.padEnd(5)} C        ${edlTc(si)} ${edlTc(si + c.duration)} ${edlTc(c.start)} ${edlTc(c.start + c.duration)}`);
        lines.push(`* FROM CLIP NAME: ${(c.label || "clip").replace(/\n/g, " ").slice(0, 60)}`);
      });
    });
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (container?.title || "fabula").replace(/\s+/g, "_").toLowerCase() + ".edl";
    a.click();
    ping("EDL exported — conform it in Resolve / Premiere / Avid");
  };
  // Render the timeline to a real MP4 via the Pixels offline render engine.
  const doRenderMP4 = async () => {
    if (rendering) { renderAbortRef.current?.abort(); return; }
    if (!clips.length) { ping("Nothing on the timeline to render."); return; }
    // Crossover pre-render validation: warn about timeline sources that may not decode in-browser.
    const badFormats = (prod.mediaPool || []).filter((a) => a.needsConversion && !a.converted && clips.some((c) => c.assetId === a.id && !c.disabled));
    if (badFormats.length) ping(`Heads up: ${badFormats.length} clip source${badFormats.length > 1 ? "s" : ""} may not decode in-browser — hit CONVERT in the pool. Rendering anyway.`);
    // Quiesce the display-rate preview workload before the offline renderer takes
    // over the decoder/GPU. This is especially important on 120-165Hz displays.
    setRendering(true); setRenderPct(0); setRenderStage("Preparing");
    setPlaying(false); rateRef.current = 1;
    await Promise.race([
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      new Promise((resolve) => setTimeout(resolve, 100)), // background-tab rAF fallback
    ]);
    renderAbortRef.current = new AbortController();
    try {
      const blob = await renderFabulaToBlob({
        clips, mediaPool: prod.mediaPool || [], format: vfmt,
        palette: prod?.pixelsConfig?.colorPalette || [],
        title: container?.title,
        trackSettings: container?.timeline?.trackSettings || {}, // render = live mixer parity
        cubeLut: (prod?.design?.luts || []).find((lut) => lut.id === prod?.design?.activeLutId) || null,

        onProgress: (p, s) => { setRenderPct(p); setRenderStage(s); },
        signal: renderAbortRef.current.signal,
      });
      if (!blob) { ping("Render failed or cancelled — see console."); return; }
      // Open the destination dialog instead of auto-downloading: one file, routed to Reello
      // (default, private) / Taleo / the Fabula library, and/or a download. The checkboxes keep
      // whatever was set in the DELIVER section — the dialog is the confirm step.
      setExportReady({ blob, name: (container?.title || "Fabula Cut").trim() });
      ping("Render complete — choose where it goes.");
    } catch (e) {
      console.warn("[Fabula render]", e); ping("Render error — see console.");
    } finally {
      setRendering(false);
    }
  };
  // ── RENDER QUEUE ENGINE ────────────────────────────────────────────────────
  // Transform the timeline to a sub-range [t0,t1): keep clips that overlap, shift
  // them to a zero origin, and push srcIn forward when the range cuts mid-clip so
  // the source frame stays correct. Whole-timeline is just [0, seqEnd].
  const rangeClipsFor = (t0, t1) => rangeClips(clips, t0, t1);
  // The ranges a job can cover, from the current deliverRange choice.
  const queueSpans = () => {
    if (deliverRange === "inout" && markIn != null && markOut != null && markOut > markIn) {
      return [{ t0: markIn, t1: markOut, tag: "IN→OUT" }];
    }
    if (deliverRange === "markers" && markers.length) {
      const pts = [...markers.map((m) => m.t), seqEnd].sort((a, b) => a - b);
      const spans = [];
      let prev = 0;
      for (const p of pts) { if (p - prev > 0.05) spans.push({ t0: prev, t1: p, tag: `SEG ${spans.length + 1}` }); prev = p; }
      return spans.length ? spans : [{ t0: 0, t1: seqEnd, tag: "ALL" }];
    }
    return [{ t0: 0, t1: seqEnd, tag: "ALL" }];
  };
  const addToQueue = (kind) => {
    if (!clips.length) { ping("Nothing on the timeline to queue."); return; }
    const spans = kind === "mp4" ? queueSpans() : [{ t0: 0, t1: seqEnd, tag: "ALL" }]; // interchange = whole cut
    const base = (container?.title || "Fabula Cut").trim();
    const jobs = spans.map((sp) => ({
      id: uid(), kind, t0: sp.t0, t1: sp.t1, status: "queued", pct: 0,
      label: `${base} · ${kind.toUpperCase()}${sp.tag !== "ALL" ? ` · ${sp.tag}` : ""}`,
    }));
    setRenderQueue((q) => [...q, ...jobs]);
    ping(`Queued ${jobs.length} ${kind.toUpperCase()} job${jobs.length === 1 ? "" : "s"}`);
  };
  const downloadBlob = (blob, name) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };
  const runQueue = async () => {
    if (queueRunning) { queueAbortRef.current = true; renderAbortRef.current?.abort(); return; }
    const pending = renderQueue.filter((j) => j.status === "queued");
    if (!pending.length) { ping("Queue is empty."); return; }
    setQueueRunning(true); queueAbortRef.current = false;
    setPlaying(false); rateRef.current = 1;
    for (const job of pending) {
      if (queueAbortRef.current) break;
      setRenderQueue((q) => q.map((j) => (j.id === job.id ? { ...j, status: "running", pct: 0 } : j)));
      const nameBase = job.label.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
      try {
        if (job.kind === "mp4") {
          renderAbortRef.current = new AbortController();
          const rc = rangeClipsFor(job.t0, job.t1);
          const blob = await renderFabulaToBlob({
            clips: rc, mediaPool: prod.mediaPool || [], format: vfmt,
            palette: prod?.pixelsConfig?.colorPalette || [], title: job.label,
            trackSettings: container?.timeline?.trackSettings || {},
            cubeLut: (prod?.design?.luts || []).find((lut) => lut.id === prod?.design?.activeLutId) || null,
            onProgress: (p) => setRenderQueue((q) => q.map((j) => (j.id === job.id ? { ...j, pct: p } : j))),
            signal: renderAbortRef.current.signal,
          });
          if (!blob) { setRenderQueue((q) => q.map((j) => (j.id === job.id ? { ...j, status: queueAbortRef.current ? "queued" : "error" } : j))); continue; }
          downloadBlob(blob, nameBase + ".mp4");
        } else if (job.kind === "fcpxml") {
          exportTimelineFCPXML();
        } else if (job.kind === "edl") {
          exportEDL();
        }
        setRenderQueue((q) => q.map((j) => (j.id === job.id ? { ...j, status: "done", pct: 1 } : j)));
      } catch (e) {
        console.warn("[Fabula queue]", e);
        setRenderQueue((q) => q.map((j) => (j.id === job.id ? { ...j, status: "error" } : j)));
      }
    }
    setQueueRunning(false);
    ping(queueAbortRef.current ? "Queue stopped." : "Queue finished.");
  };

  // Shared destinations UI — shown inline in the DELIVER section (pre-render) AND in the
  // post-render confirm dialog. Same state either way: one file, flags route where it surfaces.
  const renderDestinations = () => (
    <>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={pubReello} onChange={(e) => setPubReello(e.target.checked)} />
        <span style={{ fontWeight: 800, fontSize: 12 }}>REELLO</span>
        <span className="dim small">your video channel</span>
        {pubReello && (
          <select className="sel xs" style={{ marginLeft: "auto" }} value={pubVisibility} onChange={(e) => setPubVisibility(e.target.value)}>
            <option value="private">Private (only you)</option>
            <option value="public">Public</option>
          </select>
        )}
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={pubTaleo} onChange={(e) => setPubTaleo(e.target.checked)} />
        <span style={{ fontWeight: 800, fontSize: 12 }}>TALEO</span>
        <span className="dim small">movies &amp; TV — surfaces in the cinema catalog as a film</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={pubFabula} onChange={(e) => setPubFabula(e.target.checked)} />
        <span style={{ fontWeight: 800, fontSize: 12 }}>FABULA LIBRARY</span>
        <span className="dim small">MY VIDEOS bin + this project's pool</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={pubDownload} onChange={(e) => setPubDownload(e.target.checked)} />
        <span style={{ fontWeight: 800, fontSize: 12 }}>DOWNLOAD .MP4</span>
      </label>
      <div className="dim small" style={{ marginTop: 8 }}>One upload — the checkboxes are routing flags on the same file, so it can surface in Reello, Taleo, the Fabula library, or any mix. Reello defaults to private.</div>
    </>
  );
  // One file, flag-routed: a single videos/{id} document whose isRello / subType(MOVIE) / isFabula
  // flags decide where it surfaces (Reello feed, Taleo catalog, Fabula bin). Download is independent.
  const finishExport = async () => {
    if (!exportReady) return;
    const { blob } = exportReady;
    const name = (exportReady.name || "Fabula Cut").trim() || "Fabula Cut";
    setPublishing(true);
    try {
      if (pubDownload) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name.replace(/\s+/g, "_").toLowerCase() + ".mp4";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      }
      if (pubReello || pubFabula || pubTaleo) {
        if (!auth.currentUser) { window.alert("Sign in to publish to Reello / Taleo / the Fabula library. The file was " + (pubDownload ? "downloaded instead." : "NOT saved — check Download and export again.")); return; }
        const file = new File([blob], name.replace(/\s+/g, "_").toLowerCase() + ".mp4", { type: "video/mp4" });
        const vid = await uploadVideo({
          file, title: name,
          description: `Edited in Fabula${prod?.title ? ` — ${prod.title}` : ""}`,
          isPrivate: pubVisibility === "private",
          isRello: pubReello,                              // surfaces in the Reello feed
          isFabula: pubFabula,                             // surfaces in the Fabula video bin
          ...(pubTaleo ? { subType: "MOVIE" } : {}),       // surfaces in the Taleo cinema catalog
          tags: ["fabula-export", ...(pubReello ? ["reello"] : []), ...(pubTaleo ? ["taleo"] : []), ...(pubFabula ? ["fabula"] : [])],
          duration: seqEnd,
        });
        if (pubFabula) { // also drop straight into THIS project's media pool
          const aid = uid();
          addAssetToPool({ id: aid, name: name + ".mp4", type: "video", url: URL.createObjectURL(blob), duration: seqEnd, session: true, bin: "exports", cloudUrl: vid?.url || undefined });
          stSet("studio:blob:" + aid, blob);
        }
        const dests = [pubReello && `Reello (${pubVisibility})`, pubTaleo && "Taleo", pubFabula && "Fabula library"].filter(Boolean).join(" + ");
        ping(`🚀 Published to ${dests}${pubDownload ? " · downloaded" : ""}`);
        // Keep the dialog open in a success state so we can deep-link straight to the video in
        // Reello (the reel player at THAT short) instead of dropping the user on a generic feed.
        setExportReady((x) => ({ ...x, done: true, reelloId: pubReello ? (vid?.id || null) : null, taleoId: pubTaleo ? (vid?.id || null) : null }));
        return;
      } else if (pubDownload) {
        ping("Rendered MP4 downloaded — Pixels engine, frame-accurate.");
      }
      setExportReady(null);
    } catch (e) {
      console.warn("[Fabula publish]", e);
      window.alert("Publish failed: " + (e?.code || e?.message || e) + "\n\nThe rendered file is still here — you can Download it or try again.");
    } finally { setPublishing(false); }
  };
  const exportAll = () => {
    const head = `=== ${prod ? prod.title + " — " : ""}${container?.title || "UNTITLED"} ===\n` +
      `Format: ${vfmt.label} ${vfmt.w}x${vfmt.h} @ ${vfmt.fps}${vfmt.drop ? " DF" : ""} | Aspect: ${prod?.defaults.aspect}\n` +
      (scene?.bible ? `\n--- SCENE BIBLE ---\n${bibleText(scene.bible)}\n` : "");
    const shotsTxt = (scene?.shots || []).map((s) =>
      `\n========== SHOT ${s.slug} — ${s.type} ==========\nSUBJECT: ${s.subject}\nCAMERA: ${s.camera}\nPURPOSE: ${s.purpose}\n${s.lines ? `COVERS: "${s.lines}"\n` : ""}${s.continuity ? `CONTINUITY: ${s.continuity}\n` : ""}\n[STILL]\n${s.still || "(not generated)"}\n\n[VIDEO]\n${s.video || "(not generated)"}\n${s.voice ? `\n[VOICE]\n${s.voice}\n` : ""}`
    ).join("\n");
    const cut = clips.length ? `\n--- TIMELINE (${clips.length} clips) ---\n` + clips.sort((a, b) => a.start - b.start).map((c) => `${fmtTc(c.start, vfmt)}  [${c.trackId}] ${c.label} (${c.duration.toFixed(1)}s)`).join("\n") : "";
    return head + shotsTxt + cut;
  };

  const setFormat = (patch) => updateProd((p) => {
    p.defaults.format = { ...p.defaults.format, ...patch };
    if (!isDropCapable(p.defaults.format.fps)) p.defaults.format.drop = false;
  });

  const createMulticam = () => {
    const angles = mcSel.map((id) => ({ assetId: id, offset: 0, tc: "" }));
    const srcAssets = mcSel.map((id) => prod.mediaPool.find((a) => a.id === id)).filter(Boolean);
    if (srcAssets.length < 2) return;
    const mc = {
      id: uid(), name: "MC · " + (srcAssets[0].name.replace(/\.[^.]+$/, "")), type: "multicam",
      angles, duration: Math.max(...srcAssets.map((a) => a.duration || 5)), tags: [],
    };
    updateProd((p) => { p.mediaPool.push(mc); });
    setMcSel([]);
    ping(`Multicam group created — ${angles.length} angles. Sync offsets in the inspector.`);
  };

  const bladeClip = (clipId, at) => {
    const c = clips.find((x) => x.id === clipId);
    if (!c || at <= c.start + 0.05 || at >= c.start + c.duration - 0.05) return null;
    const rightId = uid();
    const right = { ...c, id: rightId, start: at, duration: c.start + c.duration - at, srcIn: (c.srcIn || 0) + (at - c.start) };
    const next = clips.flatMap((x) => (x.id === clipId ? [{ ...x, duration: at - x.start }, right] : [x]));
    setClips(next); commitClips(next);
    return rightId;
  };

  /* ── Edit toolset ops (Resolve-parity), driven by the keyboard layer ───────── */
  const tlFps = (prod?.defaults?.format?.fps) || 24;
  const frameDur = 1 / tlFps;
  const tlEnd = () => clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  const getSel = () => clips.find((x) => x.id === selClipId) || null;

  const applyClips = (next) => {
    histRef.current.past.push(clips);
    if (histRef.current.past.length > 60) histRef.current.past.shift();
    histRef.current.future = [];
    setClips(next); commitClips(next);
  };
  // (Clip right-click menu now uses the shared useContextMenu primitive, which owns
  //  its own outside-click / scroll / Escape dismissal.)
  // Dismiss the menu-bar dropdown + pool right-click menu on any outside click / Escape.
  useEffect(() => {
    if (!menuOpen && !poolCtx) return;
    const close = () => { setMenuOpen(null); setPoolCtx(null); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", onKey); };
  }, [menuOpen, poolCtx]);
  const undoEdit = () => { const h = histRef.current; if (!h.past.length) return; const prev = h.past.pop(); h.future.push(clips); setClips(prev); commitClips(prev); ping("Undo"); };
  const redoEdit = () => { const h = histRef.current; if (!h.future.length) return; const nx = h.future.pop(); h.past.push(clips); setClips(nx); commitClips(nx); ping("Redo"); };

  const stepFrame = (dir) => setPlayhead((p) => Math.max(0, p + dir * frameDur));
  const jumpEdit = (dir) => {
    const pts = Array.from(new Set([0, ...clips.flatMap((c) => [c.start, c.start + c.duration])])).sort((a, b) => a - b);
    if (dir < 0) { const prev = [...pts].reverse().find((t) => t < playhead - 1e-3); setPlayhead(prev ?? 0); }
    else { const nx = pts.find((t) => t > playhead + 1e-3); if (nx != null) setPlayhead(nx); }
  };
  const bladeAtPlayhead = () => {
    const target = getSel() || [...clips].reverse().find((c) => playhead > c.start + 0.05 && playhead < c.start + c.duration - 0.05);
    if (target) { const id = bladeClip(target.id, playhead); if (id) setSelClipId(id); }
  };
  const duplicateSel = () => { const c = getSel(); if (!c) return; const d = { ...JSON.parse(JSON.stringify(c)), id: uid(), start: c.start + c.duration }; applyClips([...clips, d]); setSelClipId(d.id); ping("Duplicated"); };
  const copySel = () => { const c = getSel(); if (c) { setClipboard(JSON.parse(JSON.stringify(c))); ping("Copied"); } };
  const cutSel = () => { const c = getSel(); if (!c) return; setClipboard(JSON.parse(JSON.stringify(c))); applyClips(clips.filter((x) => x.id !== c.id)); setSelClipId(null); };
  const pasteClip = () => { if (!clipboard) return; const d = { ...JSON.parse(JSON.stringify(clipboard)), id: uid(), start: playhead }; applyClips([...clips, d]); setSelClipId(d.id); ping("Pasted"); };
  const liftDelete = () => {
    // Multi-selection: delete every selected clip at once.
    if (selIds.length > 1) { const kill = new Set(selIds); applyClips(clips.filter((x) => !kill.has(x.id))); setSelIds([]); setSelClipId(null); return; }
    const c = getSel(); if (!c) return; applyClips(clips.filter((x) => x.id !== c.id)); setSelClipId(null); setSelIds([]);
  };
  // Backspace also removes the selected clip (Delete is already bound). Guarded off text inputs.
  const backspaceRef = useRef({});
  backspaceRef.current = { liftDelete, selClipId, page };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Backspace") return;
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const st = backspaceRef.current;
      if (st.page !== "edit" || !st.selClipId) return;
      e.preventDefault(); st.liftDelete();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const rippleDelete = () => { const c = getSel(); if (!c) return; const dur = c.duration; applyClips(clips.filter((x) => x.id !== c.id).map((x) => (x.trackId === c.trackId && x.start > c.start ? { ...x, start: Math.max(0, x.start - dur) } : x))); setSelClipId(null); };
  // Ripple-delete the In→Out range across all tracks: remove the middle of any clip in range,
  // keep the head/tail, and pull everything downstream left to close the gap.
  const rippleDeleteRange = (a, b) => {
    if (a == null || b == null || b <= a) return;
    const gap = b - a;
    const next = [];
    for (const c of clips) {
      const s = c.start, e = c.start + c.duration;
      if (e <= a) { next.push(c); continue; }                                   // fully before
      if (s >= b) { next.push({ ...c, start: Math.max(0, s - gap) }); continue; } // fully after → shift left
      if (s < a) next.push({ ...c, duration: a - s });                          // head remainder
      if (e > b) next.push({ ...c, id: uid(), start: a, duration: e - b, srcIn: (c.srcIn || 0) + (b - s) }); // tail remainder (gap closed)
    }
    next.sort((x, y) => x.start - y.start);
    applyClips(next);
    setMarkIn(null); setMarkOut(null); setSelClipId(null); setPlayhead(a);
  };
  const nudgeSel = (dir) => { const c = getSel(); if (!c) return; applyClips(clips.map((x) => (x.id === c.id ? { ...x, start: Math.max(0, x.start + dir * frameDur) } : x))); };
  const toggleDisable = () => { const c = getSel(); if (!c) return; applyClips(clips.map((x) => (x.id === c.id ? { ...x, disabled: !x.disabled } : x))); };
  // Transcribe a clip's dialogue → time-coded subtitle clips (Gemini). Sends the clip's
  // media inline, so keep it reasonably short (inline size cap ~18MB).
  const blobToBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(blob); });
  const transcribeClip = async (clip) => {
    const c = clip || getSel(); if (!c) return;
    const asset = c.assetId ? prod.mediaPool.find((a) => a.id === c.assetId) : null;
    if (!asset?.url) { ping("This clip has no media to transcribe — relink it first."); return; }
    if (transcribing) return;
    setTranscribing(true); ping("Transcribing clip… (sending audio to the AI)");
    try {
      const blob = await fetch(asset.url).then((r) => r.blob());
      if (blob.size > 18 * 1024 * 1024) { ping("Clip is too large to transcribe in-browser (18MB cap) — use a shorter or audio-only clip."); setTranscribing(false); return; }
      const b64 = await blobToBase64(blob);
      const mime = blob.type || (asset.type === "audio" ? "audio/mpeg" : "video/mp4");
      const { generateTimeCodedCaptions } = await import("../../services/geminiService");
      const caps = await generateTimeCodedCaptions(b64, mime, c.label || asset.name, "");
      if (!caps || !caps.length) { ping("No speech detected (or the AI transcription is unavailable)."); setTranscribing(false); return; }
      let subId = (tracks.find((t) => t.type === "subtitle") || {}).id;
      if (!subId) { addTrack("subtitle"); subId = "s1"; }
      const base = c.start - (c.srcIn || 0);
      const subClips = caps.filter((cp) => cp && typeof cp.time === "number" && cp.text).map((cp, i, arr) => {
        const nextT = arr[i + 1]?.time;
        const dur = Math.max(0.8, Math.min(8, (nextT != null ? nextT : cp.time + 3) - cp.time));
        return { id: uid(), trackId: subId, start: Math.max(0, base + cp.time), duration: dur, kind: "subtitle", text: cp.text, label: cp.text.slice(0, 24) };
      });
      applyClips([...clips, ...subClips]);
      ping(`Transcribed — ${subClips.length} caption${subClips.length === 1 ? "" : "s"} added on the subtitle track`);
    } catch (e) { ping("Transcription failed — " + (e?.message || "AI unavailable")); }
    setTranscribing(false);
  };
  /* ── BUILD SCRIPT FROM TIMELINE — reverse-engineer the screenplay from the edit ──
     Every video-track clip is watched by the vision model (action description + setting) and its
     dialogue transcribed with speakers matched against the production/world cast; the SLATE agent
     then writes the screenplay in cut order and reconstructs the shot list, populating a scene
     (script + slugline + tone → the production/story tabs) and its SLATE breakdown, with each
     shot linked back to the timeline clip that produced it. */
  const [scriptBuilding, setScriptBuilding] = useState(false);
  const buildScriptFromTimeline = async (clipsArg) => {
    if (scriptBuilding || transcribing) return;
    const src = Array.isArray(clipsArg) ? clipsArg : clips;
    const vClips = src.filter((c) => /^v\d+$/.test(c.trackId) && c.assetId && !c.disabled).sort((a, b) => a.start - b.start);
    if (!vClips.length) { ping("Nothing on the video tracks to analyze."); return; }
    const CAP = 24;
    if (vClips.length > CAP) ping(`Long cut — analyzing the first ${CAP} clips of ${vClips.length}.`);
    setScriptBuilding(true);
    try {
      // Cast for speaker matching: production cast + the attached world's characters.
      let cast = (prod.cast || []).map((ch) => ch.name).filter(Boolean);
      try {
        const wc = await worldCharactersForProduction(prod);
        if (Array.isArray(wc)) cast = Array.from(new Set([...cast, ...wc.map((x) => x?.name).filter(Boolean)]));
      } catch { /* no world attached */ }
      const { analyzeClipForScript } = await import("../../services/geminiService");
      const analyses = [];
      let n = 0;
      for (const c of vClips.slice(0, CAP)) {
        n++; setSaveState(`🎬 watching clip ${n}/${Math.min(vClips.length, CAP)}`);
        const asset = prod.mediaPool.find((a) => a.id === c.assetId);
        let a = null;
        if (asset?.url && ["video", "audio", "image"].includes(asset.type)) {
          try {
            let blob = await fetch(asset.url).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
            if (!blob || !blob.size) blob = await stGet("studio:blob:" + asset.id);
            if (blob && blob.size > 18 * 1024 * 1024) blob = (await stGet("studio:proxy:" + asset.id)) || blob; // 540p proxy fits the cap
            if (blob && blob.size && blob.size <= 18 * 1024 * 1024) {
              const b64 = await blobToBase64(blob);
              const mime = blob.type || (asset.type === "audio" ? "audio/mpeg" : asset.type === "image" ? "image/jpeg" : "video/mp4");
              a = await analyzeClipForScript(b64, mime, cast, c.label || asset.name || "clip");
            }
          } catch (e) { console.warn("[build-script] clip analysis failed:", asset?.name, e?.message || e); }
        }
        analyses.push({ clipId: c.id, label: c.label || asset?.name || "clip", start: +c.start.toFixed(1), duration: +c.duration.toFixed(1), analysis: a || { action: "(unanalyzed — media offline or over the 18MB cap; build a proxy and retry)", setting: "", dialogue: [] } });
      }
      setSaveState("🎬 writing the screenplay…");
      const castCtx = (prod.cast || []).map((ch) => `${ch.name}: ${[ch.personality, ch.looks].filter(Boolean).join(" · ")}`.trim()).join("\n");
      const r = await callClaudeJson(
        `${AGENT}\nYou REVERSE-ENGINEER a screenplay from an edited timeline. You receive per-clip computer-vision action descriptions and speaker-attributed dialogue, in cut order. Write the scene as a professional screenplay that matches the FOOTAGE — never invent events or lines. Keep the cast attributions the analyses made; keep SPEAKER 1/2 where unknown.\n${JSON_RULES}\nSchema: {"title":"scene title","slugline":"INT./EXT. LOCATION - TIME","tone":"one line","environment":"one line","script":"the full screenplay: slugline, action lines, CHARACTER\\ndialogue blocks, in cut order","shots":[{"clipId":"echo the input clipId","slug":"S1","type":"WIDE|MED|CU|INSERT|POV|OTS","camera":"one-line camera description of what the footage shows","purpose":"why this shot works in the cut","lines":"dialogue heard in this shot, or empty","character":"main cast name on screen, or empty"}]}`,
        `KNOWN CAST:\n${castCtx || "(none)"}\n\nTIMELINE (cut order):\n${JSON.stringify(analyses)}`
      );
      const sceneId = uid(); const shotIds = new Map(); let actId = null;
      updateProd((p) => {
        p.acts = p.acts && p.acts.length ? p.acts : [{ id: uid(), number: 1, title: "ACT I", scenes: [] }];
        const act = p.acts[0]; act.scenes = act.scenes || []; actId = act.id;
        const shots = (r.shots || []).map((s, i) => {
          const id = uid(); if (s.clipId) shotIds.set(s.clipId, id);
          return { id, slug: s.slug || `S${i + 1}`, type: s.type || "MED", camera: s.camera || "", purpose: s.purpose || "", lines: s.lines || "", character: s.character || "", status: "ready", notes: "reverse-built from the edit", still: "", video: "", voice: "" };
        });
        act.scenes.push({ ...BLANK_SCENE(), id: sceneId, title: r.title || "REVERSE-BUILT SCENE", slugline: r.slugline || "", tone: r.tone || "", environment: r.environment || "", script: r.script || "", shots });
      });
      // reverse-link: each timeline clip now points at the shot reconstructed from it (edit ↔ SLATE)
      if (shotIds.size) applyClips(src.map((c) => (shotIds.has(c.id) ? { ...c, shotId: shotIds.get(c.id) } : c)));
      ping(`📜 Script rebuilt — ${(r.shots || []).length} shots, dialogue tagged to ${cast.length ? "your cast" : "SPEAKER 1/2"}. Opening SLATE…`);
      if (actId) gotoScene(actId, sceneId, "slate");
    } catch (e) {
      console.warn("[build-script]", e);
      window.alert("Build Script from Timeline failed: " + (e?.message || e));
    } finally { setSaveState("saved"); setScriptBuilding(false); }
  };
  // Rename a project from the library (or the open project).
  const renameProduction = async (id, currentTitle) => {
    const title = (window.prompt("Rename project", currentTitle || "") || "").trim();
    if (!title || title === currentTitle) return;
    try {
      if (prod?.id === id) updateProd((p) => { p.title = title; });
      else {
        const p = (await stGet("studio:prod:" + id)) || (await loadProjectCloud(id));
        if (p) { p.title = title; p.updatedAt = Date.now(); await stSet("studio:prod:" + id, p); saveProjectCloud(p).catch(() => {}); }
      }
      setIndex((cur) => { const n = cur.map((x) => (x.id === id ? { ...x, title } : x)); stSet("studio:index", { list: n }); return n; });
      ping("Renamed");
    } catch { ping("Couldn't rename that project."); }
  };
  const addMarkerAtPlayhead = () => setMarkers((m) => [...m, { id: uid(), t: playhead }]);
  const zoomIn = () => setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.1, +(z - 0.2).toFixed(2)));
  // Timeline VIRTUALIZATION: track the scroll viewport (rAF-throttled, 40px hysteresis) so only
  // clips near the visible window render. Long timelines used to mount every clip — and every
  // one of them re-diffed per transport frame; off-screen clips now cost nothing.
  const [tlView, setTlView] = useState({ left: 0, width: 4000 });
  useEffect(() => {
    const el = tlScrollRef.current;
    if (!el) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      setTlView((v) => (Math.abs(v.left - el.scrollLeft) > 40 || Math.abs(v.width - el.clientWidth) > 40 ? { left: el.scrollLeft, width: el.clientWidth } : v));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll); ro.observe(el);
    update();
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [page, editWs, prod?.id]);
  // Alt+scroll-wheel zooms the timeline, keeping the time under the cursor fixed (Resolve-style).
  // Native non-passive listener — React's onWheel is passive so preventDefault is ignored there.
  useEffect(() => {
    const el = tlScrollRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.altKey) return;
      e.preventDefault();
      setZoom((z) => {
        const nz = Math.max(0.1, Math.min(4, +(z * (e.deltaY > 0 ? 0.85 : 1.18)).toFixed(3)));
        // keep the timeline point under the cursor stationary while zooming
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left - 128 + el.scrollLeft;        // px into the sequence at old zoom
        const t = cx / (46 * z);                                        // seconds under the cursor
        requestAnimationFrame(() => { el.scrollLeft = Math.max(0, t * 46 * nz - (e.clientX - rect.left - 128)); });
        return nz;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });
  // Marquee select: left-click-drag over empty timeline space draws a rubber band; every clip
  // it touches joins the multi-selection (5px threshold so plain clicks still deselect/seek).
  const startTlMarquee = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".ruler, .trackhead, .clip, button, input, select, .mk, .tl-tools")) return;
    const x0 = e.clientX, y0 = e.clientY;
    let live = false;
    const move = (ev) => {
      if (!live && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      live = true;
      setTlMarquee({ x0, y0, x1: ev.clientX, y1: ev.clientY });
    };
    const up = (ev) => {
      document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up);
      setTlMarquee(null);
      if (!live) { setSelIds([]); return; } // plain click on empty space clears the selection
      const L = Math.min(x0, ev.clientX), R = Math.max(x0, ev.clientX), T = Math.min(y0, ev.clientY), B = Math.max(y0, ev.clientY);
      const hits = [];
      document.querySelectorAll(".trackbody .clip[data-cid]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < R && r.right > L && r.top < B && r.bottom > T) hits.push(el.dataset.cid);
      });
      setSelIds(hits);
      setSelClipId(hits[0] || null);
    };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  };
  // Drag the divider above the timeline to grow/shrink it (dragging up = taller timeline).
  const startTlResize = (e) => {
    e.preventDefault();
    const startY = e.clientY, startH = tlHeight;
    const move = (ev) => setTlHeight(Math.max(150, Math.min(window.innerHeight - 200, startH + (startY - ev.clientY))));
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  };
  // Drag the vertical divider next to a side panel to resize it (persisted across sessions).
  const startPanelResize = (e, which) => {
    e.preventDefault();
    const startX = e.clientX, startW = which === "pool" ? poolW : inspW;
    const set = which === "pool" ? setPoolW : setInspW;
    const key = which === "pool" ? "fabula:poolw" : "fabula:inspw";
    let w = startW;
    const move = (ev) => {
      // pool grows dragging right; inspector grows dragging left
      w = Math.max(150, Math.min(560, startW + (which === "pool" ? ev.clientX - startX : startX - ev.clientX)));
      set(w);
    };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); try { localStorage.setItem(key, String(w)); } catch { /* */ } };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  };
  // Fit the whole sequence to the visible timeline width (minus the 128px track headers).
  const zoomFit = () => {
    const w = tlScrollRef.current?.clientWidth || 900;
    const avail = Math.max(240, w - 128 - 28);
    const secs = tlEnd() || 1;
    setZoom(Math.max(0.1, Math.min(4, +(avail / (secs * 46)).toFixed(3))));
  };
  // A real transition OBJECT on the cut: fx.trans = { type, dur } on the INCOMING clip.
  // The renderer composites the outgoing + incoming across the window (services/fabulaRender);
  // a first clip with a transition reads as a fade from black.
  const addCrossDissolve = (type = "dissolve", dur = 1) => {
    const c = getSel(); if (!c) { ping("Select a clip to add a transition into it."); return; }
    applyClips(clips.map((x) => (x.id === c.id ? { ...x, fx: { ...ensureFx(x), trans: { type, dur } } } : x)));
    ping(`${type === "dip" ? "Dip to black" : "Cross dissolve"} · ${dur}s`);
  };
  // Cycle a clip's transition dissolve → dip → wipe → blur → off (timeline wedge click).
  const TRANS_CYCLE = ["dissolve", "dip", "wipe", "blur"];
  const cycleTransition = (clipId) => {
    applyClips(clips.map((x) => {
      if (x.id !== clipId) return x;
      const cur = x.fx?.trans?.type;
      const nextFx = { ...ensureFx(x) };
      const i = TRANS_CYCLE.indexOf(cur);
      const dur = x.fx?.trans?.dur || 1;
      if (i < 0) nextFx.trans = { type: "dissolve", dur: 1 };
      else if (i >= TRANS_CYCLE.length - 1) delete nextFx.trans;
      else nextFx.trans = { type: TRANS_CYCLE[i + 1], dur, ...(TRANS_CYCLE[i + 1] === "wipe" ? { dir: x.fx?.trans?.dir ?? 0 } : {}) };
      return { ...x, fx: nextFx };
    }));
  };
  const setTransitionDur = (clipId, dur) => {
    applyClips(clips.map((x) => (x.id === clipId && x.fx?.trans ? { ...x, fx: { ...ensureFx(x), trans: { ...x.fx.trans, dur: Math.max(0.1, Math.min(4, dur)) } } } : x)));
  };

  useFabulaShortcuts({
    "playback.playPause": () => {
      resumeAudioCtx();
      // Space follows the active viewer: if the source viewer was last engaged, toggle it; else the program monitor.
      if (activeViewerRef.current === "source" && previewAsset?.url && (previewAsset.type === "video" || previewAsset.type === "audio")) {
        const v = srcVideoRef.current;
        if (v) { if (v.paused) { v.play().catch(() => {}); setSrcPlaying(true); } else { v.pause(); setSrcPlaying(false); } return; }
      }
      rateRef.current = 1; setPlaying((p) => !p);
    },
    "playback.shuttleBack": () => { rateRef.current = -2; setPlaying(true); },
    "playback.shuttleStop": () => setPlaying(false),
    "playback.shuttleFwd": () => { rateRef.current = 2; setPlaying(true); },
    "playback.stepBack": () => stepFrame(-1),
    "playback.stepFwd": () => stepFrame(1),
    "playback.prevEdit": () => jumpEdit(-1),
    "playback.nextEdit": () => jumpEdit(1),
    "playback.start": () => setPlayhead(0),
    "playback.end": () => setPlayhead(tlEnd()),
    "marks.in": () => setMarkIn(playhead),
    "marks.out": () => setMarkOut(playhead),
    "marks.clearIn": () => setMarkIn(null),
    "marks.clearOut": () => setMarkOut(null),
    "marks.markClip": () => { const c = getSel(); if (c) { setMarkIn(c.start); setMarkOut(c.start + c.duration); } },
    "marks.addMarker": addMarkerAtPlayhead,
    "edit.blade": bladeAtPlayhead,
    "edit.delete": liftDelete,
    "edit.rippleDelete": rippleDelete,
    "edit.duplicate": duplicateSel,
    "edit.copy": copySel,
    "edit.cut": cutSel,
    "edit.paste": pasteClip,
    "edit.undo": undoEdit,
    "edit.redo": redoEdit,
    "edit.nudgeLeft": () => nudgeSel(-1),
    "edit.nudgeRight": () => nudgeSel(1),
    "edit.toggleDisable": toggleDisable,
    "transition.addDefault": addCrossDissolve,
    "tool.select": () => setTrimMode("normal"),
    "tool.trim": () => setTrimMode("ripple"),
    "timeline.snapping": () => setSnapOn((s) => !s),
    "timeline.zoomIn": zoomIn,
    "timeline.zoomOut": zoomOut,
    "timeline.zoomFit": zoomFit,
    "app.openShortcuts": () => setShowShortcuts(true),
  }, { enabled: page === "edit", prefs: shortcutPrefs });

  const switchAngle = (angleIdx) => {
    const target = monitorClip || selClip;
    if (!target || target.kind !== "multicam") return;
    const inside = playhead > target.start + 0.05 && playhead < target.start + target.duration - 0.05;
    if (inside) {
      const rightId = bladeClip(target.id, playhead);
      if (rightId) {
        setClips((cur) => { const n = cur.map((c) => (c.id === rightId ? { ...c, angle: angleIdx } : c)); commitClips(n); return n; });
        setSelClipId(rightId);
        ping(`Cut to angle ${angleIdx + 1} at playhead`);
        return;
      }
    }
    const n = clips.map((c) => (c.id === target.id ? { ...c, angle: angleIdx } : c));
    setClips(n); commitClips(n);
    ping(`Angle ${angleIdx + 1}`);
  };

  const updateFx = (clipId, patch) => {
    const n = clips.map((c) => (c.id === clipId ? { ...c, fx: { ...ensureFx(c), ...patch, matte: { ...ensureFx(c).matte, ...(patch.matte || {}) } } } : c));
    setClips(n); commitClips(n);
  };

  const [intentText, setIntentText] = useState("");
  const applyIntent = async (clip) => {
    if (!intentText.trim()) return;
    setBusy(true); setBusyMsg("Reading your intention…");
    try {
      const shot = clip.shotId ? scene?.shots.find((s) => s.id === clip.shotId) : null;
      const r = await callClaudeJson(
        `${AGENT}\nYou are the editor's effects brain. The filmmaker states an INTENTION; decide whether standard compositing parameters achieve it, or whether it needs GENERATIVE work.\nAvailable params (numbers): op 0-1, sc 0.1-4, x -100..100, y -100..100, rot -180..180, blur 0-30, bri 0-3, con 0-3, sat 0-3, fadeIn 0-5, fadeOut 0-5; blend one of ${BLENDS.join("|")}; matte {"t":"none|rect|ellipse","x":0-100,"y":0-100,"w":0-100,"h":0-100,"f":0-60}.\n${JSON_RULES}\nSchema: {"mode":"params"|"generative","params":{only the keys to change},"instruction":"if generative: precise instruction for a generative video/image model","why":"under 12 words"}`,
        `CURRENT FX: ${JSON.stringify(ensureFx(clip))}\n${shot ? `SHOT CONTEXT: ${shot.slug} ${shot.type} — ${shot.purpose}${shot.lines ? ` | line: "${shot.lines}"` : ""}` : ""}\nSCENE TONE: ${scene?.tone || "—"}\n\nFILMMAKER INTENTION: ${intentText}`
      );
      if (r.mode === "params" && r.params) {
        updateFx(clip.id, r.params);
        ping(`Applied: ${r.why || "parameters set"}`);
      } else {
        updateFx(clip.id, { genNote: r.instruction || "" });
        ping("Needs generative work — instruction saved on the clip");
      }
      setIntentText("");
    } catch (e) { setError("Intent read failed — " + e.message); }
    setBusy(false);
  };

  const attachMediaToClip = (clipId, url, name, type) => {
    const asset = { id: uid(), name: name || "generated clip", type, url, duration: 5, session: url.startsWith("blob:"), generated: true };
    updateProd((p) => { p.mediaPool.push(asset); });
    const next = clips.map((c) => (c.id === clipId ? { ...c, kind: "media", assetId: asset.id } : c));
    setClips(next);
    // commit with the new asset already in prod (separate updates are fine — both persist)
    updateScene((sc) => { sc.timeline = { clips: next }; });
    ping("Generated media attached — script clip is now a picture clip");
  };

  /* drag interactions */
  const onClipDown = (e, clipId, mode) => {
    e.stopPropagation();
    const c = clips.find((x) => x.id === clipId);
    if (!c) return;
    // Ctrl/Cmd+click: toggle this clip in the multi-selection (no drag).
    if ((e.ctrlKey || e.metaKey) && mode === "move") {
      setSelIds((cur) => cur.includes(clipId) ? cur.filter((x) => x !== clipId) : [...cur, clipId]);
      setSelClipId(clipId);
      return;
    }
    // Clicking a clip outside the multi-selection collapses it to just that clip.
    const inSel = selIds.includes(clipId);
    if (!inSel && selIds.length) setSelIds([]);
    // Linked A/V siblings + (on a plain move) every other multi-selected clip ride along.
    const links = c.linkId ? clips.filter((x) => x.linkId === c.linkId && x.id !== clipId).map((x) => ({ id: x.id, origStart: x.start })) : [];
    const group = (mode === "move" && inSel && selIds.length > 1)
      ? clips.filter((x) => selIds.includes(x.id) && x.id !== clipId).map((x) => ({ id: x.id, origStart: x.start }))
      : [];
    dragRef.current = { clipId, mode, startX: e.clientX, origStart: c.start, origDur: c.duration, origSrcIn: c.srcIn || 0, trackId: c.trackId, trimMode, links, group };
    setSelClipId(clipId);
  };
  const onTimelineMove = (e) => {
    const d = dragRef.current; if (!d) return;
    const dt = (e.clientX - d.startX) / pxPerSec;
    const fps = vfmt.fps || 24;
    // Quantize to the PROJECT FRAME GRID. The old 1/20s grid aligned with no frame rate, so
    // every trim/move drifted the in/out points off frame boundaries (the "clips lose their
    // in and out points / not frame accurate" bug). All edit math now lands exactly on frames.
    const snap = (v) => Math.round(v * fps) / fps;
    // Edge-snap: pull a value toward the playhead or any neighbouring clip edge on this track.
    const edgeSnap = (val, dur) => {
      if (!snapOn) return val;
      const pts = [0, playhead];
      clips.forEach((x) => { if (x.trackId === d.trackId && x.id !== d.clipId) { pts.push(x.start, x.start + x.duration); } });
      const thresh = 0.2;
      let best = val, bestD = thresh;
      pts.forEach((p) => {
        const dLead = Math.abs(val - p); if (dLead < bestD) { bestD = dLead; best = p; }             // leading edge kisses a point
        if (dur != null) { const dTrail = Math.abs((val + dur) - p); if (dTrail < bestD) { bestD = dTrail; best = p - dur; } } // trailing edge kisses a point
      });
      return Math.max(0, best);
    };
    // Live trim preview: park the playhead on the frame at the edge being trimmed (Resolve-style).
    if (d.mode === "start") { const nd = Math.max(0.3, d.origDur - dt); setPlayhead(Math.max(0, snap(d.origStart + (d.origDur - nd)))); }
    else if (d.mode === "end") { const nd = Math.max(0.3, d.origDur + dt); setPlayhead(Math.max(0, snap(d.origStart + nd) - 1 / fps)); }
    setClips((cur) => {
      const same = cur.filter((x) => x.trackId === d.trackId).sort((a, b) => a.start - b.start);
      const nextC = same[same.findIndex((x) => x.id === d.clipId) + 1];
      // body drag — move / slip
      if (d.mode === "move") {
        if (d.trimMode === "slip") {
          return cur.map((x) => (x.id === d.clipId ? { ...x, srcIn: Math.max(0, snap(d.origSrcIn + dt)) } : x)); // shift content within window
        }
        const ns = snap(edgeSnap(Math.max(0, d.origStart + dt), d.origDur));
        const moveDelta = ns - d.origStart;
        return cur.map((x) => {
          if (x.id === d.clipId) return { ...x, start: ns };
          const lk = d.links.find((l) => l.id === x.id); // linked A/V sibling rides along
          if (lk) return { ...x, start: Math.max(0, snap(lk.origStart + moveDelta)) };
          const gm = (d.group || []).find((g) => g.id === x.id); // multi-selected clips move as a block
          if (gm) return { ...x, start: Math.max(0, snap(gm.origStart + moveDelta)) };
          return x;
        });
      }
      // left-edge trim — changes start + duration + srcIn together
      if (d.mode === "start") {
        const nd = Math.max(0.3, d.origDur - dt);
        const consumed = d.origDur - nd;            // how much trimmed off the head
        const ns = Math.max(0, d.origStart + consumed);
        const nSrc = Math.max(0, d.origSrcIn + consumed);
        return cur.map((x) => {
          if (x.id === d.clipId) return { ...x, start: snap(ns), duration: snap(nd), srcIn: snap(nSrc) };
          const lk = d.links.find((l) => l.id === x.id);
          if (lk) return { ...x, start: snap(ns), duration: snap(nd), srcIn: snap(nSrc) };
          if (d.trimMode === "ripple" && x.trackId === d.trackId && x.start > d.origStart) return { ...x, start: snap(x.start - consumed) };
          return x;
        });
      }
      // right-edge trim — duration (+ ripple downstream / roll the next clip)
      if (d.mode === "end") {
        const nd = Math.max(0.3, d.origDur + dt);
        const delta = nd - d.origDur;
        return cur.map((x) => {
          if (x.id === d.clipId) return { ...x, duration: snap(nd) };
          const lk = d.links.find((l) => l.id === x.id);
          if (lk) return { ...x, duration: snap(nd) };
          if (d.trimMode === "ripple" && x.trackId === d.trackId && x.start > d.origStart) return { ...x, start: snap(x.start + delta) };
          if (d.trimMode === "roll" && nextC && x.id === nextC.id) return { ...x, start: snap(x.start + delta), duration: Math.max(0.3, snap(x.duration - delta)), srcIn: Math.max(0, snap((x.srcIn || 0) + delta)) };
          return x;
        });
      }
      return cur;
    });
  };
  const onTimelineUp = () => { if (dragRef.current) { dragRef.current = null; commitClips(); } };
  // Seeks land exactly on frame boundaries so the monitor shows the true frame at the playhead.
  const qFrame = (t) => Math.round(t * (vfmt.fps || 24)) / (vfmt.fps || 24);
  const rulerSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPlayhead(Math.max(0, qFrame((e.clientX - rect.left) / pxPerSec)));
  };
  // Drag-scrub: hold + drag on the ruler to scrub the playhead (preview video + audio follow).
  const startScrub = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const seek = (clientX) => setPlayhead(Math.max(0, qFrame((clientX - rect.left) / pxPerSec)));
    setPlaying(false); seek(e.clientX);
    const move = (ev) => { ev.preventDefault(); seek(ev.clientX); };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  };
  // Razor: split the clip at the clicked position (used when the razor tool is active).
  const razorAt = (e, clipId) => {
    const body = e.currentTarget.parentElement; if (!body) return;
    const rect = body.getBoundingClientRect();
    const at = Math.max(0, qFrame((e.clientX - rect.left) / pxPerSec)); // cut on a frame boundary
    bladeClip(clipId, at);
  };

  /* monitor source */
  const monitorClip = useMemo(() => {
    for (let i = videoTracksAsc.length - 1; i >= 0; i--) { // top-most video track down
      const tid = videoTracksAsc[i].id;
      const c = clips.find((c) => c.trackId === tid && playhead >= c.start && playhead < c.start + c.duration);
      if (c) return c;
    }
    return null;
  }, [clips, playhead, videoTracksAsc]);
  const monitorAssetRaw = monitorClip?.assetId ? prod?.mediaPool.find((a) => a.id === monitorClip.assetId) : null;
  // multicam resolves to the active angle's underlying media (+ sync offset)
  const mcAngle = monitorAssetRaw?.type === "multicam" ? monitorAssetRaw.angles[monitorClip.angle || 0] : null;
  const monitorAsset = mcAngle ? prod?.mediaPool.find((a) => a.id === mcAngle.assetId) : monitorAssetRaw;
  const monitorOffset = (mcAngle?.offset || 0) + (monitorClip?.srcIn || 0);
  const monitorShot = monitorClip?.shotId ? scene?.shots.find((s) => s.id === monitorClip.shotId) : null;
  // Monitor-only media pool with proxy URLs swapped in — but ONLY for assets playing from a
  // REMOTE URL. A local original (blob:) is already the best editing source: full-res,
  // frame-accurate, zero network — the proxy would be a downgrade. AudioLayer + the MP4 render
  // keep the ORIGINAL pool — proxies can be video-only and export must be full-res.
  // A proxy finishing in the background must not replace a decoder's source
  // mid-play. Adopt the new proxy map when transport is paused.
  const previewSourcePolicy = useRef({ proxyOn, proxies });
  if (!playing) previewSourcePolicy.current = { proxyOn, proxies };
  const monitorProd = useMemo(() => {
    const policy = previewSourcePolicy.current;
    if (!policy.proxyOn || !policy.proxies.size || !prod?.mediaPool?.length) return prod;
    let changed = false;
    const mp = prod.mediaPool.map((a) => {
      const p = policy.proxies.get(a.id);
      if (p && a.type === "video") { changed = true; return { ...a, previewProxy: true }; }
      return a;
    });
    return changed ? { ...prod, mediaPool: mp } : prod;
  }, [prod, proxies, proxyOn, playing]);

  const selClip = clips.find((c) => c.id === selClipId);
  const selShot = selClip?.shotId ? scene?.shots.find((s) => s.id === selClip.shotId) : null;
  const selMc = selClip?.kind === "multicam" ? prod?.mediaPool.find((a) => a.id === selClip.assetId) : null;
  const seqEnd = clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  const selTrackType = selClip ? (tracks.find((t) => t.id === selClip.trackId)?.type) : null;
  const selIsAudio = !!selClip && (selTrackType === "audio" || selClip.kind === "voice");

  /* ----- audio channel strip (clip + track): vol / pan / 5-band EQ / compressor ----- */
  const ensureAudio = (c) => ({ ...CLIP_AUDIO_DEFAULT, ...(c?.audio || {}), eq: [...((c?.audio?.eq) || CLIP_AUDIO_DEFAULT.eq)], comp: { ...COMP_DEFAULT, ...(c?.audio?.comp || {}) } });
  const updateClipAudio = (id, patch) => { const n = clips.map((c) => (c.id === id ? { ...c, audio: { ...ensureAudio(c), ...patch } } : c)); setClips(n); commitClips(n); };
  // Resolve a clip's underlying media bytes, LOCAL-FIRST (IndexedDB stash → blob:/cloud url). Works for
  // audio clips AND video clips (decodeAudioData pulls the audio track out of most mp4/webm).
  const resolveClipBlob = async (clip) => {
    if (!clip?.assetId) return null;
    const b = await stGet("studio:blob:" + clip.assetId);
    if (b && b.size) return b;
    const a = prod?.mediaPool?.find((x) => x.id === clip.assetId);
    const u = a?.url || a?.cloudUrl;
    if (!u) return null;
    try { const r = await fetch(u); if (r.ok) return await r.blob(); } catch { /* offline */ }
    return null;
  };
  // Send a clip (audio, or a video clip's linked sound) to the Sound Forge-style editor.
  const openAudioEditor = async (clip) => {
    if (!clip?.assetId) { ping("This clip has no audio to edit"); return; }
    const a = prod?.mediaPool?.find((x) => x.id === clip.assetId);
    const url = a?.url || a?.cloudUrl;
    let blob = null; try { blob = await resolveClipBlob(clip); } catch { /* url fallback */ }
    if (!url && !blob) { ping("Audio is offline — relink the source first"); return; }
    setAudioEdit({ clip, url: url || (blob ? URL.createObjectURL(blob) : ""), blob });
  };
  // Add N named audio tracks in ONE update and return their ids. Allocating all at once avoids the
  // stale-state collision you'd get from calling an add-one helper twice in the same tick.
  const addAudioTracksNamed = (names) => {
    const cur = (prod?.tracks && prod.tracks.length) ? prod.tracks : TRACKS;
    const base = cur.filter((t) => t.type === "audio").map((t) => parseInt(t.id.slice(1), 10) || 0).reduce((m, v) => Math.max(m, v), 0);
    const ids = names.map((_, i) => "a" + (base + 1 + i));
    updateProd((p) => {
      p.tracks = (p.tracks && p.tracks.length) ? p.tracks : TRACKS.map((t) => ({ ...t }));
      names.forEach((name, i) => p.tracks.push({ id: ids[i], name, type: "audio" }));
    });
    return ids;
  };
  // Right-click → stem split. mode: 'vocals-music' (quick, browser) | '4stem' | 'voices' (Crossover).
  const splitClipStems = async (clip, mode) => {
    if (stemBusy) return;
    setStemBusy(true);
    try {
      const asset = prod?.mediaPool?.find((x) => x.id === clip.assetId);
      const cloudUrl = asset?.cloudUrl || (asset?.url && /^https?:/i.test(asset.url) ? asset.url : null);
      const base = clip.label || asset?.name || "clip";
      const at = clip.start;
      if (mode === "4stem" || mode === "voices") {
        ping(mode === "voices" ? "Detecting & splitting voices on Crossover…" : "Separating stems on Crossover…");
        const res = cloudUrl ? await separateStemsCloud(cloudUrl, mode) : { ok: false, message: "sync this clip to the cloud first" };
        if (res.ok) {
          const drops = mode === "voices"
            ? (res.voices || []).map((u, i) => ({ u, n: `${base} · voice ${i + 1}` }))
            : [["vocals", res.vocals], ["drums", res.drums], ["bass", res.bass], ["other", res.other]]
              .filter(([, u]) => u).map(([k, u]) => ({ u, n: `${base} · ${k}` }));
          if (drops.length) {
            const tids = addAudioTracksNamed(drops.map((d) => d.n.slice(0, 18)));
            const made = [];
            for (let i = 0; i < drops.length; i++) {
              const blob = await (await fetch(drops[i].u)).blob();
              const cl = await placeAudioClip(blob, drops[i].n, { trackId: tids[i], at, defer: true });
              if (cl) made.push(cl);
            }
            if (made.length) { const next = [...clips, ...made]; setClips(next); commitClips(next); setSelClipId(made[0].id); }
            ping(`Placed ${made.length} stems on new tracks`);
          } else ping("Separation returned no stems");
          return;
        }
        // Crossover tier absent → honest fallback to the instant browser split.
        ping(`HQ separation unavailable (${res.message || "offline"}) — using instant split`);
        mode = "vocals-music";
      }
      // Instant, in-browser mid/side split.
      const blob = await resolveClipBlob(clip);
      if (!blob) { ping("Audio is offline — relink the source first"); return; }
      const { vocals, instrumental } = await quickStems(blob, "both");
      const [vt, mt] = addAudioTracksNamed([`${base} · vocals`.slice(0, 18), `${base} · music`.slice(0, 18)]);
      const made = [];
      if (vocals) { const cl = await placeAudioClip(vocals, `${base} · vocals`, { trackId: vt, at, defer: true }); if (cl) made.push(cl); }
      if (instrumental) { const cl = await placeAudioClip(instrumental, `${base} · music`, { trackId: mt, at, defer: true }); if (cl) made.push(cl); }
      if (made.length) { const next = [...clips, ...made]; setClips(next); commitClips(next); setSelClipId(made[0].id); }
      ping("Split into vocals + music on new tracks");
    } catch (e) {
      ping("Stem split failed: " + (e?.message || "error"));
    } finally { setStemBusy(false); }
  };
  const renderAudioPanel = (title, a, onPatch, withPan) => {
    const comp = { ...COMP_DEFAULT, ...(a.comp || {}) };
    const eq = a.eq || [0, 0, 0, 0, 0];
    const R = (lbl, node) => <div className="insp-row"><span className="lbl">{lbl}</span>{node}</div>;
    return (
      <div className="apanel">
        <div className="aphead">{title}</div>
        {R("VOL", <><input type="range" min="0" max="1.5" step="0.01" value={a.vol == null ? 1 : a.vol} onChange={(e) => onPatch({ vol: parseFloat(e.target.value) })} /><span className="insp-val mono">{Math.round((a.vol == null ? 1 : a.vol) * 100)}%</span></>)}
        {withPan && R("PAN", <><input type="range" min="-1" max="1" step="0.02" value={a.pan || 0} onChange={(e) => onPatch({ pan: parseFloat(e.target.value) })} onDoubleClick={() => onPatch({ pan: 0 })} /><span className="insp-val mono">{(a.pan || 0) === 0 ? "C" : a.pan < 0 ? "L" + Math.round(-a.pan * 100) : "R" + Math.round(a.pan * 100)}</span></>)}
        <div className="lbl" style={{ marginTop: 8 }}>5-BAND EQ · dB</div>
        <div className="apeq">
          {EQ_LABELS.map((lbl, i) => (
            <div className="apband" key={i}>
              <input type="range" min="-12" max="12" step="0.5" value={eq[i] || 0} onChange={(e) => { const ne = [...eq]; ne[i] = parseFloat(e.target.value); onPatch({ eq: ne }); }}
                style={{ writingMode: "vertical-lr", direction: "rtl", width: 18, height: 62 }} title={`${lbl}Hz`} />
              <span>{lbl}</span>
              <b style={{ color: (eq[i] || 0) === 0 ? "rgba(255,255,255,.35)" : "#7ee2a8" }}>{(eq[i] || 0) > 0 ? "+" : ""}{eq[i] || 0}</b>
            </div>
          ))}
        </div>
        <div className="insp-row" style={{ marginTop: 6 }}>
          <span className="lbl">COMPRESSOR</span>
          <button className={`minibtn ${comp.on ? "blue" : ""}`} onClick={() => onPatch({ comp: { ...comp, on: !comp.on } })}>{comp.on ? "ON" : "OFF"}</button>
        </div>
        {comp.on && <>
          {R("THRESH", <><input type="range" min="-60" max="0" step="1" value={comp.threshold} onChange={(e) => onPatch({ comp: { ...comp, threshold: parseFloat(e.target.value) } })} /><span className="insp-val mono">{comp.threshold}dB</span></>)}
          {R("RATIO", <><input type="range" min="1" max="20" step="0.5" value={comp.ratio} onChange={(e) => onPatch({ comp: { ...comp, ratio: parseFloat(e.target.value) } })} /><span className="insp-val mono">{comp.ratio}:1</span></>)}
          {R("ATTACK", <><input type="range" min="0" max="0.2" step="0.001" value={comp.attack} onChange={(e) => onPatch({ comp: { ...comp, attack: parseFloat(e.target.value) } })} /><span className="insp-val mono">{Math.round(comp.attack * 1000)}ms</span></>)}
          {R("RELEASE", <><input type="range" min="0.01" max="1" step="0.01" value={comp.release} onChange={(e) => onPatch({ comp: { ...comp, release: parseFloat(e.target.value) } })} /><span className="insp-val mono">{Math.round(comp.release * 1000)}ms</span></>)}
          {R("MAKEUP", <><input type="range" min="0" max="24" step="0.5" value={comp.makeup} onChange={(e) => onPatch({ comp: { ...comp, makeup: parseFloat(e.target.value) } })} /><span className="insp-val mono">+{comp.makeup}dB</span></>)}
        </>}
      </div>
    );
  };

  // video element sync now lives inside MonitorLayer (per-layer, multicam-offset aware)

  /* ----- edit-page block renderers (shared across resolve-style workspaces) ----- */
  const renderSource = () => (
                  <div className="viewer src" onMouseDown={() => (activeViewerRef.current = "source")}>
                    <div className="viewer-tag">SOURCE: {previewAsset ? previewAsset.name : "NO CLIP SELECTED"}</div>
                    <div className="viewer-body"
                      draggable={!!previewAsset?.url}
                      onDragStart={(e) => { if (!previewAsset?.url) { e.preventDefault(); return; } dragAssetRef.current = { asset: previewAsset, range: { in: srcIn, out: srcOut } }; e.dataTransfer.effectAllowed = "copy"; try { e.dataTransfer.setData("text/plain", "fabula-src"); } catch { /* */ } }}
                      onDragEnd={() => { dragAssetRef.current = null; }}
                      title={previewAsset?.url ? "Drag into the timeline to insert this clip" : undefined}>
                      {previewAsset ? (
                        <>
                          {previewAsset.type === "video" && previewAsset.url && (
                            <video ref={srcVideoRef} src={previewAsset.url} className="mvid framed" playsInline
                              onLoadedMetadata={(e) => setSrcDur(e.currentTarget.duration || 0)}
                              onLoadedData={(e) => { if (srcWantPlayRef.current) { srcWantPlayRef.current = false; e.currentTarget.play().then(() => setSrcPlaying(true)).catch(() => setSrcPlaying(false)); } }}
                              onTimeUpdate={(e) => setSrcTc(e.currentTarget.currentTime)}
                              onEnded={() => setSrcPlaying(false)} />
                          )}
                          {(previewAsset.type === "image" || previewAsset.type === "graphic") && previewAsset.url && (
                            <img src={previewAsset.url} className="mvid framed" alt="" />
                          )}
                          {previewAsset.type === "audio" && (
                            <div className="srcaudio"><Music size={56} /><span>AUDIO ASSET PREVIEW</span>
                              {previewAsset.url && <audio ref={srcVideoRef} src={previewAsset.url}
                                onLoadedMetadata={(e) => setSrcDur(e.currentTarget.duration || 0)}
                                onLoadedData={(e) => { if (srcWantPlayRef.current) { srcWantPlayRef.current = false; e.currentTarget.play().then(() => setSrcPlaying(true)).catch(() => setSrcPlaying(false)); } }}
                                onTimeUpdate={(e) => setSrcTc(e.currentTarget.currentTime)}
                                onEnded={() => setSrcPlaying(false)} />}
                            </div>
                          )}
                          {previewAsset.type === "multicam" && (
                            <div className="srcaudio" style={{ color: "#a855f7" }}><Layers size={56} /><span>{previewAsset.angles.length}-ANGLE MULTICAM</span></div>
                          )}
                          {!previewAsset.url && previewAsset.type !== "multicam" && (
                            <div className="srcaudio"><Film size={44} /><span>OFFLINE MEDIA</span></div>
                          )}
                        </>
                      ) : (
                        <div className="src-empty"><Film size={40} /></div>
                      )}
                    </div>
                    {/* Audio waveform jog bar — scrub + see the in/out range (DaVinci-style) */}
                    {previewAsset?.url && (previewAsset.type === "video" || previewAsset.type === "audio") && (() => {
                      const total = srcDur || previewAsset.duration || 0;
                      const pct = (t) => total > 0 ? `${Math.max(0, Math.min(1, t / total)) * 100}%` : "0%";
                      return (
                        <div className="srcscrub" style={{ position: "relative", height: 46, margin: "5px 8px 0", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, overflow: "hidden", cursor: "text" }}
                          onMouseDown={startSrcScrub} title="Drag to scrub · mark In/Out with the ⟩ ⟨ buttons">
                          <Waveform url={previewAsset.url} srcIn={0} duration={total || undefined} bars={180} />
                          {srcIn != null && srcOut != null && srcOut > srcIn && total > 0 && (
                            <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(srcIn), width: `calc(${pct(srcOut)} - ${pct(srcIn)})`, background: "rgba(255,140,0,0.22)", pointerEvents: "none" }} />
                          )}
                          {srcIn != null && total > 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(srcIn), width: 2, background: "#FF8C00", pointerEvents: "none" }} />}
                          {srcOut != null && total > 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(srcOut), width: 2, background: "#FF8C00", pointerEvents: "none" }} />}
                          {total > 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(srcTc), width: 2, background: "#fff", boxShadow: "0 0 5px rgba(0,0,0,0.9)", pointerEvents: "none" }} />}
                        </div>
                      );
                    })()}
                    <div className="viewer-bar">
                      <span className="tc sm">{fmtTc(srcTc, vfmt)}</span>
                      <div className="tbtns">
                        <button className="tbtn sm" onClick={() => { if (srcVideoRef.current) srcVideoRef.current.currentTime = 0; setSrcTc(0); }}><SkipBack size={12} /></button>
                        <button className="tbtn sm" disabled={!(previewAsset?.url && (previewAsset?.type === "video" || previewAsset?.type === "audio"))} onClick={() => {
                          const v = srcVideoRef.current; if (!v) return;
                          if (v.paused) { v.play().catch(() => {}); setSrcPlaying(true); } else { v.pause(); setSrcPlaying(false); }
                        }}>{srcPlaying ? <Pause size={13} /> : <Play size={13} />}</button>
                      </div>
                      {/* Source in/out marking */}
                      <button className="tbtn sm" title="Mark In (source)" disabled={!previewAsset?.url}
                        onClick={() => setSrcIn(srcTc)} style={{ color: srcIn != null ? "#FF8C00" : undefined }}><FlagTriangleRight size={12} /></button>
                      <span className="tc sm dim2">{srcIn != null ? fmtTc(srcIn, vfmt) : "--"} / {srcOut != null ? fmtTc(srcOut, vfmt) : "--"}</span>
                      <button className="tbtn sm" title="Mark Out (source)" disabled={!previewAsset?.url}
                        onClick={() => setSrcOut(srcTc)} style={{ color: srcOut != null ? "#FF8C00" : undefined }}><FlagTriangleLeft size={12} /></button>
                      {(srcIn != null || srcOut != null) && (
                        <button className="tbtn sm" title="Clear source in/out" onClick={() => { setSrcIn(null); setSrcOut(null); }}><X size={11} /></button>
                      )}
                      <button className="minibtn" disabled={!previewAsset}
                        onClick={() => previewAsset && insertAssetClip(previewAsset, { in: srcIn, out: srcOut })}
                        title={srcIn != null && srcOut != null && srcOut > srcIn ? "Insert marked range at playhead" : "Insert whole clip at playhead"}>▼ INSERT{srcIn != null && srcOut != null && srcOut > srcIn ? " RANGE" : ""}</button>
                    </div>
                  </div>
  );

  const renderPool = () => {
    // Mockup-C pool: searchable, bin-filtered, identity-striped. One filtered list
    // feeds both views; the full library still lives in the MEDIA workspace.
    const q = mediaSearch.trim();
    const poolAll = prod.mediaPool || [];
    const poolShown = poolAll.filter((a) => {
      if (binFilter !== "all") { const b = a.bin || "imports"; if (!(b === binFilter || b.startsWith(binFilter + "/"))) return false; }
      return !q || assetMatches(a, q);
    }).slice(0, srcPoolCap);
    const poolBins = ["all", ...binTree()];
    const BIN_HUES = ["var(--blue)", "var(--green)", "var(--pur)", "var(--cyan)", "#ffd166", "var(--pl-magenta)"];
    const binHue = (b) => b === "all" ? "var(--org)" : BIN_HUES[[...b].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % BIN_HUES.length];
    return (
<aside className="pool glass-dark" style={{ width: poolW, minWidth: poolW }}>
                    <div className="paneltitle"><MonitorPlay size={12} /> MEDIA POOL
                      <button className="minibtn" style={{ marginLeft: "auto", fontSize: 8, color: fxLibOpen ? "#FF8C00" : undefined }} title="Effects Library — filters, generators, Lottie"
                        onClick={() => { const nv = !fxLibOpen; setFxLibOpen(nv); try { localStorage.setItem("fabula:fxlib", nv ? "1" : "0"); } catch { /* */ } }}>⚡FX</button>
                      <button className="minibtn" style={{ fontSize: 8, color: ulOpen ? "#D0BCFF" : undefined }} title="Universal Library — presets, effects, templates and your assets"
                        onClick={() => setUlOpen((v) => !v)}>▦ Library</button>
                      {ulOpen && (
                        <UniversalLibraryPanel accent="#D40055" defaultDock="floating" storageKey="fabula.ullib.geo.v1" accepts={["fx", "look", "trans"]}
                          onClose={() => setUlOpen(false)}
                          onUse={(it) => {
                            if (it.kind === "fx") addForgeEffect(it.preview.effectId);
                            else if (it.kind === "look") { const lk = FORGE_LOOKS.find((x) => "look:" + x.id === it.id); if (lk) applyForgeLook(lk); }
                            else if (it.kind === "trans") addForgeTransition(it.preview.transId);
                          }} />
                      )}
                      <span className="segx">
                        <button className={poolView === "list" ? "on" : ""} title="List view"
                          onClick={() => { setPoolView("list"); try { localStorage.setItem("fabula:poolview", "list"); } catch { /* */ } }}>≡</button>
                        <button className={poolView === "thumbs" ? "on" : ""} title="Thumbnails — hover to play + scrub in the source monitor"
                          onClick={() => { setPoolView("thumbs"); try { localStorage.setItem("fabula:poolview", "thumbs"); } catch { /* */ } }}>▦</button>
                      </span>
                      <button className="minibtn" style={{ fontSize: 8 }} title="Create a media bin"
                        onClick={() => {
                          const name = (window.prompt("New bin name") || "").trim();
                          if (!name) return;
                          updateProd((p) => { p.bins = p.bins || []; if (!p.bins.includes(name)) p.bins.push(name); });
                          ping(`Bin "${name}" created — assign clips to it from the MEDIA workspace`);
                        }}>+ BIN</button>
                    </div>
                    <div className="poolsearch2"><Search size={11} />
                      <input value={mediaSearch} onChange={(e) => setMediaSearch(e.target.value)} placeholder="Search name, tag, folder…" />
                      {mediaSearch && <X size={11} style={{ cursor: "pointer" }} onClick={() => setMediaSearch("")} />}
                    </div>
                    <div className="poolbins">
                      {poolBins.map((b) => {
                        const count = b === "all" ? poolAll.length
                          : poolAll.filter((a) => { const ab = a.bin || "imports"; return ab === b || ab.startsWith(b + "/"); }).length;
                        const depth = b === "all" ? 0 : b.split("/").length - 1;
                        const leaf = b === "all" ? "ALL" : (b.split("/").pop() || b).toUpperCase();
                        return (
                          <button key={b} className={`poolbin ${binFilter === b ? "on" : ""}`} style={{ "--tab": binHue(b), paddingLeft: 8 + depth * 10 }}
                            onClick={() => setBinFilter(binFilter === b ? "all" : b)} title={b === "all" ? "Everything" : b}>
                            <span className="idstripe" style={{ height: 12 }} />{leaf}<i>{count}</i>
                          </button>
                        );
                      })}
                    </div>
                    {/* Bring media in — collapsed by default so the Media Pool reads as this project's
                        contents (Resolve-style). All the file inputs below stay mounted (they're used
                        from the command palette, Media workspace and FX library), so this only hides the UI. */}
                    <button className="minibtn full" onClick={() => setPoolImportOpen((v) => !v)} title="Import media, watch folders, and add your on-platform music/videos. The pool below is your project's contents.">
                      <Upload size={12} /> BRING MEDIA IN {poolImportOpen ? "▴" : "▾"}
                    </button>
                    <div style={{ display: poolImportOpen ? undefined : "none" }}>
                    <button className="minibtn full" onClick={() => fileRef.current?.click()}><Upload size={12} /> IMPORT MEDIA</button>
                    <input ref={fileRef} type="file" multiple accept={`${codecImportAccept()},.lottie,.json,.svg,.ai,.pdf`} style={{ display: "none" }} onChange={handleUpload} />
                    <input ref={relinkRef} type="file" accept="video/*,image/*,audio/*" style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0]; const id = relinkTargetRef.current;
                        if (f && id) {
                          const type = f.type.startsWith("video") ? "video" : f.type.startsWith("audio") ? "audio" : "image";
                          stSet("studio:blob:" + id, f); // stash so it survives reloads + can sync
                          relinkAsset(id, URL.createObjectURL(f), f.name, type);
                        }
                        e.target.value = ""; relinkTargetRef.current = null;
                      }} />
                    <div className="btnrow" style={{ marginTop: 6, gap: 5 }}>
                      <button className="minibtn blue grow" onClick={() => importRef.current?.click()} title="Import a timeline from DaVinci Resolve / Premiere / Final Cut (FCPXML or EDL). You'll be asked where the media is — it reads local-first and uploads to the cloud in the background."><ListVideo size={12} /> IMPORT TIMELINE</button>
                      <select className="sel fpssel" value={importFps} onChange={(e) => setImportFps(parseFloat(e.target.value))} title="Frame rate for EDL timecode math">
                        {[23.976, 24, 25, 29.97, 30].map((f) => <option key={f} value={f}>{f} fps</option>)}
                      </select>
                    </div>
                    {uploadPending > 0 && <div className="dim small" style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}><Upload size={11} /> {uploadPending} file{uploadPending > 1 ? "s" : ""} uploading to cloud… (resumes across sessions)</div>}
                    <input ref={importRef} type="file" accept=".edl,.xml,.fcpxml" style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) importTimelineWithMedia(f); e.target.value = ""; }} />
                    {/* ── SYNC / WATCH FOLDERS — auto-import media, mirroring the on-disk folder tree into bins ── */}
                    <div style={{ marginTop: 6, border: "1px solid var(--line, rgba(255,255,255,.13))", borderRadius: 8, padding: "6px 8px", background: "rgba(0,0,0,0.2)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="lbl" style={{ margin: 0 }}>📁 SYNC FOLDERS</span>
                        <span className="dim small" style={{ letterSpacing: 0 }}>auto-import</span>
                        <button className="minibtn" style={{ marginLeft: "auto", fontSize: 8 }} disabled={folderSyncing} onClick={addSyncFolderNow} title="Watch a folder on this computer — new files auto-import as you add them, and the media/clip bins mirror the folder structure. Reads local-first + uploads to the cloud in the background.">{folderSyncing ? "…" : "＋ ADD"}</button>
                        {syncFolders.length > 0 && <button className="minibtn" style={{ fontSize: 8 }} disabled={folderSyncing} onClick={() => rescanAll(true)} title="Rescan all watched folders now">↻</button>}
                      </div>
                      {syncFolders.length === 0
                        ? <div className="dim small" style={{ marginTop: 4, letterSpacing: 0 }}>Watch a folder → drop files in and they auto-import; bins mirror the folder tree.</div>
                        : syncFolders.map((f) => (
                          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 10 }}>
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${f.name} · ${f.fileCount} files · last scan ${f.lastScan ? new Date(f.lastScan).toLocaleTimeString() : "—"}`}>📂 {f.name}</span>
                            <span className="dim" style={{ fontSize: 9 }}>{f.fileCount}</span>
                            <button className="minibtn" style={{ fontSize: 8, padding: "2px 5px" }} onClick={() => rescanSyncFolder(f.id, true, true)} title="Rescan this folder now (full re-import)">↻</button>
                            <button className="minibtn" style={{ fontSize: 8, padding: "2px 5px" }} onClick={() => removeSyncFolderNow(f.id)} title="Stop watching this folder">✕</button>
                          </div>
                        ))}
                    </div>
                    <button className="minibtn full" style={{ marginTop: 6 }} onClick={loadMyMusic} disabled={musicLoading} title="Load your released tracks; double-click a Music item to add it with synced-lyric captions">
                      <Music size={12} /> {musicLoading ? "LOADING…" : "MY MUSIC (ON-PLATFORM)"}
                    </button>
                    <button className="minibtn blue full" style={{ marginTop: 6 }} onClick={() => setShowLicenseStore(true)} title="Browse, preview & license music from other artists for this edit">
                      <Music size={12} /> LICENSE MUSIC — STORE
                    </button>
                    <button className="minibtn full" style={{ marginTop: 6 }} onClick={loadMyVideos} disabled={videoLoading} title="Load your on-platform videos + Live-stream recordings">
                      <MonitorPlay size={12} /> {videoLoading ? "LOADING…" : "MY VIDEOS + LIVE"}
                    </button>
                    </div>
                    {poolView === "thumbs" && (
                      <div className="poolthumbs">
                        {poolShown.map((a) => {
                          const playable = a.url && (a.type === "video" || a.type === "audio");
                          return (
                            <div key={a.id} className={`ptcard ${previewAsset?.id === a.id ? "previewing" : ""} ${(!a.url || a.offline) ? "offline" : ""}`}
                              title={(!a.url || a.offline) ? "Media not linked — relink or add its sync folder" : "Hover: play + scrub in the source monitor · Double-click: load & play · Right-click: menu"}
                              onMouseEnter={() => { if (a.url) openInViewer(a, !!playable); }}
                              onMouseMove={(e) => {
                                if (!playable || previewAsset?.id !== a.id) return;
                                const v = srcVideoRef.current; const total = srcDur || a.duration || 0;
                                if (!v || !total) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const f = Math.max(0, Math.min(0.999, (e.clientX - rect.left) / rect.width));
                                try { v.currentTime = f * total; setSrcTc(f * total); } catch { /* not seekable yet */ }
                              }}
                              onClick={() => openInViewer(a, false)} onDoubleClick={() => openInViewer(a, true)}
                              onContextMenu={(e) => poolContext(e, a)}>
                              {a.url && a.type === "video" ? <ScrubThumb url={a.url} className="ptvid" />
                                : a.url && (a.type === "image" || a.type === "graphic") ? <img src={a.url} className="ptvid" alt="" />
                                : <div className="ptvid ptph">{a.type === "audio" ? <Music size={22} /> : <Film size={22} />}</div>}
                              <span className="ptname">{a.name}</span>
                              {(!a.pixels && (!a.url || a.offline)) && <button className="chip blue" style={{ fontSize: 7, border: "none", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); openRelink(a.id); }}>🔗 RELINK</button>}
                            </div>
                          );
                        })}
                        {(prod.mediaPool || []).length > srcPoolCap && (
                          <button className="minibtn" style={{ gridColumn: "1 / -1", marginTop: 4 }} onClick={() => setSrcPoolCap((c) => c + 300)}>
                            Show more ({srcPoolCap} of {(prod.mediaPool || []).length} — use the Media workspace to search & page the full library) ↓
                          </button>
                        )}
                        {!(prod.mediaPool || []).length && <div className="dim small" style={{ padding: 8, gridColumn: "1 / -1" }}>Empty — import media to see thumbnails.</div>}
                      </div>
                    )}
                    <div className="poollist" style={poolView === "thumbs" ? { display: "none" } : undefined}>
                      {poolShown.map((a) => (
                        <div className={`poolitem ${previewAsset?.id === a.id ? "previewing" : ""} ${(!a.url || a.offline) ? "offline" : ""}`} key={a.id} onClick={() => openInViewer(a, false)} onDoubleClick={() => openInViewer(a, true)} title={(!a.url || a.offline) ? "Media not linked — locate it (relink) or add its sync folder" : "Click: load in source viewer · Double-click: load & play"}>
                          {(a.type === "video" || a.type === "audio") && (
                            <input type="checkbox" className="mcchk" checked={mcSel.includes(a.id)} title="Select for multicam group"
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => setMcSel((s) => s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id])} />
                          )}
                          {a.url && a.type === "video" && <ScrubThumb url={a.url} className="poolthumb" />}
                          {a.url && (a.type === "image" || a.type === "graphic") && <img src={a.url} className="poolthumb" alt="" />}
                          <span className={`pooltype ${a.type}`}>{{ video: "VID", audio: "AUD", image: "IMG", multicam: "MC", model: "3D", graphic: "GFX", text: "TXT", lottie: "LOT" }[a.type] || "FILE"}</span>
                          <span className="poolname">{a.name}</span>
                          {(!a.pixels && (!a.url || a.offline)) && <button className="chip blue" style={{ fontSize: 7, border: "none", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); openRelink(a.id); }} title="Relink to a local file">🔗 RELINK</button>}
                          {a.generated && <Sparkles size={10} className="genstar" />}
                          {a.needsConversion && !a.converted && (
                            <span className="chip" style={{ fontSize: 7, cursor: "pointer", background: "rgba(255,140,0,0.18)", color: "#ffb057" }}
                              title="Transcode to a browser-friendly format via Crossover"
                              onClick={(e) => { e.stopPropagation(); convertAssetToBrowserFriendly(a.id); }}>CONVERT</span>
                          )}
                          {licensingEnabled() && a.musicMeta && (() => {
                            const cl = trackClearance(a.musicMeta, syncGrants, prod?.id, auth.currentUser?.uid);
                            if (cl.cleared) return <span className="chip" style={{ fontSize: 7, background: "rgba(61,220,132,0.16)", color: "#7ee2a8" }} title={cl.granted ? "Licensed for this project" : (cl.li.attribution ? "Cleared for sync — credit required" : "Cleared for sync")}>{cl.granted ? "LICENSED" : (cl.li.attribution ? "CREDIT" : "CLEARED")}</span>;
                            if (cl.needsLicense) return <span className="chip" style={{ fontSize: 7, cursor: "pointer", background: "rgba(255,140,0,0.18)", color: "#ffb057" }} title={`License for this project — $${cl.fee}`} onClick={(e) => { e.stopPropagation(); licenseTrack(a.musicMeta); }}>LICENSE ${cl.fee}</span>;
                            return <span className="chip" style={{ fontSize: 7, background: "rgba(255,140,0,0.18)", color: "#ffb057" }} title={cl.li.reason}>LICENSE</span>;
                          })()}
                        </div>
                      ))}
                      {mcSel.length >= 2 && (
                        <button className="minibtn full" style={{ marginTop: 6 }} onClick={createMulticam}>
                          <Layers size={12} /> CREATE MULTICAM ({mcSel.length} ANGLES)
                        </button>
                      )}
                      {(prod.mediaPool || []).length > srcPoolCap && (
                        <button className="minibtn full" style={{ marginTop: 4 }} onClick={() => setSrcPoolCap((c) => c + 300)}>
                          Show more ({srcPoolCap} of {(prod.mediaPool || []).length}) ↓
                        </button>
                      )}
                      {!(prod.mediaPool || []).length && <div className="dim small" style={{ padding: 8 }}>Empty — the edit doesn't need media yet. Build from the breakdown and generate into the placeholders.</div>}
                    </div>
                    <div className="paneltitle" style={{ marginTop: 10 }}><Clapperboard size={12} /> STORY</div>
                    <button className="cta full sm" onClick={buildEditFromBreakdown} disabled={!scene?.shots?.length}>
                      <Wand2 size={13} /> BUILD EDIT FROM BREAKDOWN
                    </button>
                    <div className="dim small" style={{ padding: "8px 2px" }}>
                      {scene?.shots?.length
                        ? `${scene.shots.length} shots in the SLATE breakdown. Pacing computed from the script — dialogue at speech rate, beats by shot type.`
                        : "No breakdown yet — run SLATE on this scene first."}
                    </div>
                  </aside>
  );
  };
  const renderMonitor = () => (
<section className="monitor" onMouseDown={() => (activeViewerRef.current = "program")}>
                    <div ref={screenRef} className="screen" style={{ aspectRatio: prod.defaults.aspect.includes(":") ? prod.defaults.aspect.replace(":", "/") : "2.39/1", filter: LOOKS.find((l) => l.id === prod.design?.lookId)?.filter || "none", containerType: "inline-size" }}>
                      {gpuMonitor && <GpuStage reg={gpuRegRef.current} hostRef={screenRef} onFail={() => { try { localStorage.setItem("fabula:gpuMonitor", "off"); } catch { /* */ } gpuRegRef.current.clear(); setGpuMonitor(false); ping("GPU monitor hit an issue — reverted to the standard renderer."); }} />}
                      {(() => { const s = getSel(); const inst = maskEdit && s && s.id === maskEdit.clipId ? (s.fx?.stack || []).find((i) => i.id === maskEdit.instanceId) : null; return inst?.mask && inst.mask.kind !== "subject" && inst.mask.kind !== "depth" && inst.mask.kind !== "aux" ? <MaskOverlay clip={s} instance={inst} playhead={playhead} screenRef={screenRef} videoRef={videoRef} fps={vfmt.fps || 24} onChange={(mask) => updateFx(s.id, { stack: s.fx.stack.map((i) => i.id === inst.id ? { ...i, mask } : i) })} /> : null; })()}
                      {(() => { const s = getSel(); return s && /^v\d+$/.test(s.trackId) && (s.fx?.planarSurface || s.fx?.planarTrack) ? <SurfaceOverlay clip={s} playhead={playhead} screenRef={screenRef} videoRef={videoRef} editing={surfaceEdit} onChange={(corners) => updateFx(s.id, { planarSurface: { corners } })} onAdjust={(frame, corners) => adjustPlanarFrame(s, frame, corners)} /> : null; })()}
                      {videoTracksAsc.map((tr, i) => {
                        // Double-buffer: mount the current clip + its neighbours, keyed by clip.id, so the
                        // next clip is already decoded/seeked and going live is just a visibility swap (no
                        // src reload → no dip to black between butted clips).
                        const tclips = clips.filter((c) => c.trackId === tr.id).sort((a, b) => a.start - b.start);
                        if (!tclips.length) return null;
                        const curIdx = tclips.findIndex((c) => playhead >= c.start && playhead < c.start + c.duration);
                        const idxs = new Set();
                        // +2 lookahead: the clip after next starts decoding a full clip early, so even
                        // short clips cut to a warm buffer (black frames at cuts came from cold loads).
                        if (curIdx >= 0) { idxs.add(curIdx); idxs.add(curIdx + (rateRef.current < 0 ? -1 : 1)); }
                        else { const nx = tclips.findIndex((c) => c.start >= playhead); if (nx >= 0) { idxs.add(nx - 1); idxs.add(nx); idxs.add(nx + 1); } else idxs.add(tclips.length - 1); }
                        const ts = (container.timeline?.trackSettings || {})[tr.id] || { vol: 1, mute: false };
                        return [...idxs].filter((idx) => idx >= 0 && idx < tclips.length).map((idx) => {
                          const c = tclips[idx];
                          const isActive = curIdx >= 0 && idx === curIdx;
                          return <MonitorLayer key={c.id} indexedMode={indexedMode && editWs === "edit"} clip={c} active={isActive} prod={monitorProd} scene={scene} playhead={playhead} playing={playing} top={i > 0} z={(i + 1) * 10 + (isActive ? 5 : 0)} videoRef={(i === 0 && isActive) ? videoRef : undefined} vol={ts.vol} mute={ts.mute} gpuMode={gpuMonitor} gpuReg={gpuRegRef.current} pinSource={c.fx?.pinTo?.clipId ? clips.find((x) => x.id === c.fx.pinTo.clipId) || null : null} />;
                        });
                      })}
                      {/* Audio bed — mount the live clip + the next one per track (double-buffered, gapless) */}
                      {tracks.filter((t) => t.type === "audio").map((tr) => {
                        const tclips = clips.filter((c) => c.trackId === tr.id && c.assetId).sort((a, b) => a.start - b.start);
                        if (!tclips.length) return null;
                        const curIdx = tclips.findIndex((c) => playhead >= c.start && playhead < c.start + c.duration);
                        const idxs = new Set();
                        if (curIdx >= 0) { idxs.add(curIdx); idxs.add(curIdx + 1); }
                        else { const nx = tclips.findIndex((c) => c.start >= playhead); if (nx >= 0) idxs.add(nx); }
                        const tsRaw = (container.timeline?.trackSettings || {})[tr.id] || { vol: 1, mute: false };
                        // Solo derives to mute: if ANY audio track is soloed, non-soloed tracks are muted.
                        const anySolo = Object.values(container.timeline?.trackSettings || {}).some((t) => t && t.solo);
                        const ts = anySolo ? { ...tsRaw, mute: tsRaw.mute || !tsRaw.solo } : tsRaw;
                        return [...idxs].filter((idx) => idx >= 0 && idx < tclips.length).map((idx) => {
                          const c = tclips[idx];
                          const isActive = curIdx >= 0 && idx === curIdx;
                          // The playback ENGINE (decoded + scheduled Web Audio) owns every source it can
                          // decode — mounting an element too would double the sound. Elements remain only
                          // as the fallback for sources the engine marked unplayable (or no Web Audio).
                          const aAsset = prod.mediaPool.find((x) => x.id === c.assetId);
                          if (typeof AudioContext !== "undefined" && enginePlayable(aAsset?.url, c.id)) return null;
                          return <AudioLayer key={c.id} clip={c} active={isActive} prod={prod} playhead={playhead} playing={playing} track={ts} trackId={tr.id} />;
                        });
                      })}
                      {(() => {
                        const sc = clips.find((c) => c.kind === "subtitle" && c.text && playhead >= c.start && playhead < c.start + c.duration);
                        return sc ? (
                          <div style={{ position: "absolute", left: 0, right: 0, bottom: "8%", textAlign: "center", padding: "0 8%", zIndex: 60, pointerEvents: "none" }}>
                            <span style={{ color: "#fff", fontWeight: 700, fontSize: "clamp(11px,2.6vw,30px)", lineHeight: 1.25, textShadow: "0 2px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.95)", whiteSpace: "pre-wrap" }}>{sc.text}</span>
                          </div>
                        ) : null;
                      })()}
                      {(() => {
                        const tc = clips.find((c) => c.kind === "title" && c.text && playhead >= c.start && playhead < c.start + c.duration);
                        if (!tc) return null;
                        if (tc.tGraphic && findLowerThird(tc.tGraphic.specId)) {
                          return <LowerThirdMonitor key={tc.id} clip={tc} playhead={playhead} selected={selClipId === tc.id} onSelect={() => setSelClipId(tc.id)}
                            onMove={(tx, ty, commit) => { setClips((cur) => { const n = cur.map((c) => (c.id === tc.id ? { ...c, tx: Math.round(tx * 10) / 10, ty: Math.round(ty * 10) / 10 } : c)); if (commit) commitClips(n); return n; }); }} />;
                        }
                        if (tc.bGraphic) {
                          return <BroadcastGraphicMonitor key={tc.id} clip={tc} playhead={playhead} selected={selClipId === tc.id} onSelect={() => setSelClipId(tc.id)} />;
                        }
                        const cls = tc.titleStyle || "modern";
                        const x = tc.tx != null ? tc.tx : (cls === "classic" ? 50 : 12);
                        const y = tc.ty != null ? tc.ty : 78;
                        const size = tc.tSize != null ? tc.tSize : (cls === "minimal" ? 5 : 5.8); // % of frame width
                        const font = tc.tFont || (cls === "classic" ? 'Georgia, "Times New Roman", serif' : "system-ui, sans-serif");
                        const color = tc.tColor || "#fff";
                        const isSel = selClipId === tc.id;
                        // Drag to reposition (when selected). Position is stored in % of frame → resolution-independent.
                        const dragTitle = (e) => {
                          if (!isSel) { setSelClipId(tc.id); return; }
                          e.preventDefault(); e.stopPropagation();
                          const scr = e.currentTarget.parentElement.getBoundingClientRect();
                          const move = (ev) => {
                            const nx = Math.max(0, Math.min(100, ((ev.clientX - scr.left) / scr.width) * 100));
                            const ny = Math.max(0, Math.min(100, ((ev.clientY - scr.top) / scr.height) * 100));
                            setClips((cur) => cur.map((c) => (c.id === tc.id ? { ...c, tx: Math.round(nx * 10) / 10, ty: Math.round(ny * 10) / 10 } : c)));
                          };
                          const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); commitClips(); };
                          document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
                        };
                        const resizeTitle = (e) => {
                          e.preventDefault(); e.stopPropagation();
                          const startX = e.clientX, startSize = size;
                          const move = (ev) => {
                            const ns = Math.max(1.5, Math.min(20, startSize * (1 + (ev.clientX - startX) / 260)));
                            setClips((cur) => cur.map((c) => (c.id === tc.id ? { ...c, tSize: Math.round(ns * 10) / 10 } : c)));
                          };
                          const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); commitClips(); };
                          document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
                        };
                        return (
                          <div style={{ position: "absolute", left: x + "%", top: y + "%", transform: cls === "classic" ? "translate(-50%,-50%)" : "translateY(-50%)", textAlign: cls === "classic" ? "center" : "left", zIndex: 61, maxWidth: "76%", pointerEvents: "auto", cursor: isSel ? "move" : "pointer", outline: isSel ? "1px dashed rgba(255,140,0,0.85)" : "none", outlineOffset: 4 }}
                            onMouseDown={dragTitle} title={isSel ? "Drag to move · corner handle resizes" : "Click to select this title"}>
                            <div style={{ display: "inline-block", borderLeft: cls === "modern" ? "0.4cqw solid #FF8C00" : "none", paddingLeft: cls === "modern" ? "0.9cqw" : 0 }}>
                              {(() => {
                                const anim = tc.tAnim && tc.tAnim.type !== "none" ? tc.tAnim : null;
                                const shownText = dynamicText(tc.text, playhead - tc.start, tc.tDynamic, tc.duration);
                                const states = anim ? glyphStates(shownText, playhead - tc.start, anim, tc.duration) : null;
                                const subOpacity = states ? Math.min(1, states[states.length - 1]?.opacity ?? 1) : 1;
                                return (<>
                                  <div style={{ color, fontWeight: 700, fontSize: `${size}cqw`, lineHeight: 1.12, fontFamily: font, textShadow: "0 2px 8px rgba(0,0,0,0.9)", whiteSpace: "pre-wrap" }}>
                                    {states ? states.map((s, i) => <span key={i} style={{ display: "inline-block", whiteSpace: "pre", opacity: s.opacity, transform: `translate(${s.dx}em, ${s.dy}em) scale(${s.scale})`, filter: s.blur > 0.01 ? `blur(${s.blur}em)` : undefined, letterSpacing: s.spacing ? `${s.spacing}em` : undefined }}>{s.char}</span>) : shownText}
                                  </div>
                                  {tc.subtitle && <div style={{ color: tc.tSubColor || (cls === "minimal" ? "rgba(255,255,255,0.85)" : "#FF8C00"), fontWeight: 500, fontSize: `${size * 0.45}cqw`, marginTop: 2, fontFamily: font, textShadow: "0 2px 6px rgba(0,0,0,0.9)", opacity: subOpacity }}>{tc.subtitle}</div>}
                                </>);
                              })()}
                            </div>
                            {isSel && <span onMouseDown={resizeTitle} title="Drag to resize"
                              style={{ position: "absolute", right: -12, bottom: -12, width: 12, height: 12, background: "#FF8C00", borderRadius: 3, cursor: "nwse-resize", border: "1px solid rgba(0,0,0,0.6)" }} />}
                          </div>
                        );
                      })()}
                      {/* Title/action-safe guides — UI overlay only; the export pipeline never sees it. */}
                      {guides && (
                        <div style={{ position: "absolute", inset: 0, zIndex: 70, pointerEvents: "none" }}>
                          <div style={{ position: "absolute", inset: "5%", border: "1px solid rgba(255,255,255,0.3)" }} />
                          <div style={{ position: "absolute", inset: "10%", border: "1px dashed rgba(255,200,0,0.4)" }} />
                          <span style={{ position: "absolute", left: "10.5%", top: "10.2%", fontSize: 8, color: "rgba(255,200,0,0.6)", letterSpacing: "0.1em" }}>TITLE SAFE</span>
                          <span style={{ position: "absolute", left: "5.5%", top: "5.2%", fontSize: 8, color: "rgba(255,255,255,0.45)", letterSpacing: "0.1em" }}>ACTION SAFE</span>
                        </div>
                      )}
                      {!monitorClip && <div className="noclip">NO CLIP AT PLAYHEAD</div>}
                      {monitorShot && monitorAsset && <span className="overlay-slug">{monitorShot.slug}</span>}
                      {angleView && monitorAssetRaw?.type === "multicam" && (
                        <div className="anglegrid">
                          {monitorAssetRaw.angles.map((ang, i) => {
                            const aa = prod.mediaPool.find((x) => x.id === ang.assetId);
                            const active = (monitorClip.angle || 0) === i;
                            return (
                              <button key={i} className={`angletile ${active ? "on" : ""}`} onClick={() => switchAngle(i)}>
                                <span className="anglenum">{i + 1}</span>
                                <span className="anglename">{aa?.name || "angle"}</span>
                                {active && <span className="anglelive">● LIVE</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="transport">
                      <span ref={tcRef} className="tc">{fmtTc(playhead, vfmt)}</span>
                      <div className="tbtns">
                        <button className="tbtn" onClick={() => { setPlayhead(0); setPlaying(false); }}><SkipBack size={14} /></button>
                        <button className="tbtn play" onClick={() => { resumeAudioCtx(); setPlaying(!playing); }}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
                      </div>
                      <span className="tc dim2">/ {fmtTc(seqEnd, vfmt)}</span>
                      <div style={{ display: "flex", height: 20, marginLeft: 6 }} title="Master output level"><TrackMeter trackId="master" /></div>
                      <button className="minibtn" style={{ opacity: guides ? 1 : 0.45 }} title="Title/action-safe guides — preview only, never rendered into the file"
                        onClick={() => { const nv = !guides; setGuides(nv); try { localStorage.setItem("fabula:guides", nv ? "1" : "0"); } catch { /* */ } }}>SAFE</button>
                      {webgpuAvailable() && (
                        <button className={`minibtn ${gpuMonitor ? "blue" : ""}`} style={{ opacity: gpuMonitor ? 1 : 0.55 }} onClick={toggleGpuMonitor}
                          title={gpuMonitor ? "GPU monitor ON — video layers composite on one WebGPU surface. Click to use the standard renderer." : "GPU monitor OFF (beta) — composite video preview on the GPU (one surface instead of a stack of video elements). Click to try it."}>⚡ GPU</button>
                      )}
                      {monitorAssetRaw?.type === "multicam" && (
                        <button className={`minibtn ${angleView ? "blue" : ""}`} onClick={() => setAngleView(!angleView)}><Layers size={11} /> ANGLES</button>
                      )}
                    </div>
                  </section>
  );
  const renderInspector = () => (
<aside className="inspector glass-dark" style={{ width: inspW, minWidth: inspW }}>
                    <div className="paneltitle">INSPECTOR</div>
                    {!selClip && <div className="dim small" style={{ padding: 8 }}>Select a clip. Script clips carry the full story DNA — dialogue, prompts, character locks.</div>}
                    {selClip && (
                      <div className="insp-body">
                        <div className="insp-row"><span className="lbl">CLIP</span><span className="insp-val">{selClip.label}</span></div>
                        <div className="insp-row"><span className="lbl">KIND</span><span className={`chip ${selClip.kind === "script" ? "amb" : selClip.kind === "voice" ? "green" : "blue"}`}>{selClip.kind.toUpperCase()}</span></div>
                        <div className="insp-row"><span className="lbl">IN / DUR</span><span className="insp-val mono">{fmtTc(selClip.start, vfmt)} · {selClip.duration.toFixed(1)}s</span></div>
                        {selIsAudio && (() => {
                          const tid = selClip.trackId;
                          const ts = (container.timeline?.trackSettings || {})[tid] || {};
                          const ta = { vol: ts.vol, pan: ts.pan || 0, mute: ts.mute, eq: ts.eq || [0, 0, 0, 0, 0], comp: { ...COMP_DEFAULT, ...(ts.comp || {}) } };
                          const cfx = ensureFx(selClip);
                          return (
                            <>
                              <div className="insp-div" />
                              {renderAudioPanel("CLIP AUDIO", ensureAudio(selClip), (patch) => updateClipAudio(selClip.id, patch), false)}
                              <div className="apanel">
                                <div className="aphead">FADES</div>
                                <div className="insp-row"><span className="lbl">IN</span><input type="range" min="0" max="4" step="0.05" value={cfx.fadeIn || 0} onChange={(e) => updateFx(selClip.id, { fadeIn: parseFloat(e.target.value) })} onDoubleClick={() => updateFx(selClip.id, { fadeIn: 0 })} /><span className="insp-val mono">{(cfx.fadeIn || 0).toFixed(2)}s</span></div>
                                <div className="insp-row"><span className="lbl">OUT</span><input type="range" min="0" max="4" step="0.05" value={cfx.fadeOut || 0} onChange={(e) => updateFx(selClip.id, { fadeOut: parseFloat(e.target.value) })} onDoubleClick={() => updateFx(selClip.id, { fadeOut: 0 })} /><span className="insp-val mono">{(cfx.fadeOut || 0).toFixed(2)}s</span></div>
                              </div>
                              {renderAudioPanel(`TRACK · ${String(tid).toUpperCase()}`, ta, (patch) => setTrackSetting(tid, patch), true)}
                            </>
                          );
                        })()}
                        {/* A video clip with linked audio exposes that audio's strip right here —
                            adjust the sound without hunting for the sibling clip on the A-track. */}
                        {!selIsAudio && selClip.linkId && (() => {
                          const la = clips.find((x) => x.linkId === selClip.linkId && x.id !== selClip.id && (tracks.find((t) => t.id === x.trackId)?.type === "audio"));
                          if (!la) return null;
                          const ts = (container.timeline?.trackSettings || {})[la.trackId] || {};
                          const ta = { vol: ts.vol, pan: ts.pan || 0, mute: ts.mute, eq: ts.eq || [0, 0, 0, 0, 0], comp: { ...COMP_DEFAULT, ...(ts.comp || {}) } };
                          return (
                            <>
                              <div className="insp-div" />
                              {renderAudioPanel("LINKED AUDIO (this video's sound)", ensureAudio(la), (patch) => updateClipAudio(la.id, patch), false)}
                              {renderAudioPanel(`TRACK · ${String(la.trackId).toUpperCase()}`, ta, (patch) => setTrackSetting(la.trackId, patch), true)}
                            </>
                          );
                        })()}
                        {selClip.kind === "model3d" && (() => {
                          const m3 = { ...MODEL3D_DEFAULT, ...(selClip.model3d || {}) };
                          const setM3 = (patch) => updateClip(selClip.id, { model3d: { ...m3, ...patch } });
                          const sld = (label, key, min, max, step, fmt = (v) => v.toFixed(2)) => (
                            <div className="fxrow"><span className="fxlbl">{label}</span><input type="range" min={min} max={max} step={step} value={m3[key]} onChange={(e) => setM3({ [key]: parseFloat(e.target.value) })} /><span className="fxval">{fmt(m3[key])}</span></div>
                          );
                          return (
                            <>
                              <div className="insp-div" />
                              <div className="lbl">3D MODEL · CAMERA</div>
                              {sld("ORBIT YAW", "yaw", -180, 180, 1, (v) => v.toFixed(0) + "°")}
                              {sld("PITCH", "pitch", -89, 89, 1, (v) => v.toFixed(0) + "°")}
                              {sld("DISTANCE", "distanceScale", 0.4, 4, 0.05)}
                              {sld("FOV", "fov", 10, 80, 1, (v) => v.toFixed(0) + "°")}
                              <div className="fxrow"><span className="fxlbl">AUTO-ROTATE</span><button className={`minibtn ${m3.autoRotate ? "on" : ""}`} onClick={() => setM3({ autoRotate: !m3.autoRotate })}>{m3.autoRotate ? "ON" : "OFF"}</button>{m3.autoRotate && <><span className="fxlbl" style={{ marginLeft: 8 }}>DEG/S</span><input type="range" min={-180} max={180} step={1} value={m3.rotateSpeed} onChange={(e) => setM3({ rotateSpeed: parseFloat(e.target.value) })} /><span className="fxval">{m3.rotateSpeed.toFixed(0)}</span></>}</div>
                              <div className="lbl" style={{ marginTop: 6 }}>3D MODEL · LIGHT</div>
                              {sld("KEY", "keyIntensity", 0, 8, 0.1)}
                              {sld("FILL", "fillIntensity", 0, 6, 0.1)}
                              {sld("RIM", "rimIntensity", 0, 8, 0.1)}
                              {sld("ENVIRONMENT", "envIntensity", 0, 3, 0.05)}
                              {sld("EXPOSURE", "exposure", 0.2, 3, 0.05)}
                              <div className="fxrow"><span className="fxlbl">BACKGROUND</span><button className={`minibtn ${m3.transparent ? "on" : ""}`} onClick={() => setM3({ transparent: !m3.transparent })}>{m3.transparent ? "TRANSPARENT" : "SOLID"}</button>{!m3.transparent && <input type="color" value={m3.background} onChange={(e) => setM3({ background: e.target.value })} style={{ marginLeft: 6, width: 28, height: 20, padding: 0, border: "none", background: "none" }} />}<span className="fxlbl" style={{ marginLeft: 8 }}>GROUND</span><button className={`minibtn ${m3.ground ? "on" : ""}`} onClick={() => setM3({ ground: !m3.ground })}>{m3.ground ? "ON" : "OFF"}</button></div>
                              <div className="dim small">A loaded mesh (.glb/.gltf/.obj/.fbx/.stl), rendered live and in export. Auto-rotate and any baked animation run on clip time, so trimming retimes them. Effects and grade below apply on top.</div>
                            </>
                          );
                        })()}
                        {selClip.kind === "subtitle" && (
                          <>
                            <div className="insp-div" />
                            <div className="lbl">SUBTITLE TEXT</div>
                            <textarea className="in" rows={2} value={selClip.text || ""} placeholder="Subtitle / caption line…"
                              onChange={(e) => updateClip(selClip.id, { text: e.target.value, label: e.target.value.slice(0, 40) })} />
                          </>
                        )}
                        {selClip.kind === "title" && selClip.tGraphic && (
                          <>
                            <div className="insp-div" />
                            <div className="lbl">LOWER THIRD · TITLE</div>
                            <input className="in" value={selClip.text || ""} placeholder="Name…" onChange={(e) => updateClip(selClip.id, { text: e.target.value, label: e.target.value.slice(0, 40) })} />
                            <div className="lbl" style={{ marginTop: 6 }}>SUBTITLE</div>
                            <input className="in" value={selClip.subtitle || ""} placeholder="Role, place, handle…" onChange={(e) => updateClip(selClip.id, { subtitle: e.target.value })} />
                            {(() => { const sp = findLowerThird(selClip.tGraphic.specId); return sp && (sp.tag || selClip.tGraphic.tag) ? (<><div className="lbl" style={{ marginTop: 6 }}>TAG</div><input className="in" value={selClip.tag || ""} placeholder="Live · Location · Kicker" onChange={(e) => updateClip(selClip.id, { tag: e.target.value })} /></>) : null; })()}
                            <LowerThirdInspector clip={selClip} onPatch={(patch) => updateClip(selClip.id, patch)} onSwap={() => setLtGallery(selClip.id)}
                              onOpenInTela={() => { const sp = findLowerThird(selClip.tGraphic.specId); if (!sp) return; openLowerThirdInTela(sp, selClip.tGraphic, { title: selClip.text || "", subtitle: selClip.subtitle, tag: selClip.tag }, selClip.tx != null && selClip.ty != null ? { x: selClip.tx, y: selClip.ty } : undefined).catch((e) => ping("Could not open in Tela — " + (e?.message || e))); }} />
                            <div className="dim small">Duration, position on the timeline and the FX stack below work like any title clip. IN plays from the clip start, OUT ends at the clip end — trim the clip to retime the whole graphic.</div>
                          </>
                        )}
                        {selClip.kind === "title" && selClip.bGraphic && (
                          <>
                            <div className="insp-div" />
                            <div className="lbl">BROADCAST GRAPHIC · {String(selClip.bGraphic.kind || "").replace("_", " ")}</div>
                            <input className="in" value={selClip.text || ""} placeholder="Title…" onChange={(e) => updateClip(selClip.id, { text: e.target.value, label: e.target.value.slice(0, 40) })} />
                            <div className="lbl" style={{ marginTop: 6 }}>SUBTITLE</div>
                            <input className="in" value={selClip.subtitle || ""} placeholder="Secondary line…" onChange={(e) => updateClip(selClip.id, { subtitle: e.target.value })} />
                            <div className="dim small">A broadcast identity placed on the timeline. Its entrance and exit are driven by the clip's duration — drag the clip handles to retime the animation. Reopen the Broadcast Systems panel to add a different identity or format.</div>
                          </>
                        )}
                        {selClip.kind === "title" && !selClip.tGraphic && !selClip.bGraphic && (
                          <>
                            <div className="insp-div" />
                            <div className="lbl">TITLE</div>
                            <input className="in" value={selClip.text || ""} placeholder="Main title…"
                              onChange={(e) => updateClip(selClip.id, { text: e.target.value, label: e.target.value.slice(0, 40) })} />
                            <div className="lbl" style={{ marginTop: 6 }}>SUBTITLE</div>
                            <input className="in" value={selClip.subtitle || ""} placeholder="Second line…"
                              onChange={(e) => updateClip(selClip.id, { subtitle: e.target.value })} />
                            <div className="lbl" style={{ marginTop: 6 }}>STYLE</div>
                            <select className="sel" value={selClip.titleStyle || "modern"} onChange={(e) => updateClip(selClip.id, { titleStyle: e.target.value })}>
                              <option value="modern">Modern</option>
                              <option value="classic">Classic</option>
                              <option value="minimal">Minimal</option>
                            </select>
                            <div className="lbl" style={{ marginTop: 6 }}>ANIMATION</div>
                            {(() => {
                              const anim = { ...TITLE_ANIM_DEFAULT, ...(selClip.tAnim || {}) };
                              const setAnim = (patch) => updateClip(selClip.id, { tAnim: { ...anim, ...patch } });
                              return (<>
                                <select className="sel" value={anim.type} onChange={(e) => setAnim({ type: e.target.value })}>
                                  {TITLE_ANIMS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                                </select>
                                {anim.type !== "none" && (<>
                                  <div className="insp-row" style={{ marginTop: 4 }}><span className="lbl">IN</span><input type="range" min="0.1" max="4" step="0.05" value={anim.duration} onChange={(e) => setAnim({ duration: parseFloat(e.target.value) })} /><span className="insp-val mono">{anim.duration.toFixed(2)}s</span></div>
                                  <div className="insp-row"><span className="lbl">DELAY</span><input type="range" min="0" max="3" step="0.05" value={anim.delay || 0} onChange={(e) => setAnim({ delay: parseFloat(e.target.value) })} /><span className="insp-val mono">{(anim.delay || 0).toFixed(2)}s</span></div>
                                  <div className="insp-row"><span className="lbl">OUT</span><input type="range" min="0" max="3" step="0.05" value={anim.out || 0} onChange={(e) => setAnim({ out: parseFloat(e.target.value) })} /><span className="insp-val mono">{(anim.out || 0).toFixed(2)}s</span></div>
                                  <div className="insp-row"><span className="lbl">STAGGER</span><input type="range" min="0" max="1" step="0.02" value={anim.stagger ?? .6} onChange={(e) => setAnim({ stagger: parseFloat(e.target.value) })} /><span className="insp-val mono">{(anim.stagger ?? .6).toFixed(2)}</span></div>
                                </>)}
                              </>);
                            })()}
                            <div className="lbl" style={{ marginTop: 6 }}>DYNAMIC TEXT</div>
                            {(() => {
                              const dyn = { ...DYNAMIC_DEFAULT, ...(selClip.tDynamic || {}) };
                              const setDyn = (patch) => updateClip(selClip.id, { tDynamic: { ...dyn, ...patch } });
                              const row = (label, key, min, max, step) => <div className="insp-row"><span className="lbl">{label}</span><input type="range" min={min} max={max} step={step} value={dyn[key] ?? 0} onChange={(e) => setDyn({ [key]: parseFloat(e.target.value) })} /><span className="insp-val mono">{Number(dyn[key] ?? 0).toFixed(step < 1 ? 2 : 0)}</span></div>;
                              return (<>
                                <select className="sel" value={dyn.type} onChange={(e) => setDyn({ type: e.target.value })}>
                                  {DYNAMIC_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                                </select>
                                {(dyn.type === "counter" || dyn.type === "percent") && (<>
                                  <div className="btnrow" style={{ gap: 5, marginTop: 4 }}>
                                    <input className="in" type="number" value={dyn.from ?? 0} onChange={(e) => setDyn({ from: parseFloat(e.target.value) || 0 })} title="From" />
                                    <input className="in" type="number" value={dyn.to ?? 100} onChange={(e) => setDyn({ to: parseFloat(e.target.value) || 0 })} title="To" />
                                    <input className="in" type="number" min="0" max="6" value={dyn.decimals ?? 0} onChange={(e) => setDyn({ decimals: parseInt(e.target.value, 10) || 0 })} title="Decimals" style={{ maxWidth: 56 }} />
                                  </div>
                                  <div className="btnrow" style={{ gap: 5, marginTop: 4 }}>
                                    <input className="in" placeholder="prefix" value={dyn.prefix || ""} onChange={(e) => setDyn({ prefix: e.target.value })} />
                                    <input className="in" placeholder="suffix" value={dyn.suffix || ""} onChange={(e) => setDyn({ suffix: e.target.value })} />
                                    <select className="sel" value={dyn.ease || "out"} onChange={(e) => setDyn({ ease: e.target.value })}><option value="linear">linear</option><option value="out">ease out</option><option value="inOut">ease in-out</option></select>
                                  </div>
                                  {row("DURATION", "duration", .1, 20, .1)}{row("DELAY", "delay", 0, 10, .1)}
                                </>)}
                                {dyn.type === "timecode" && (<>{row("FPS", "fps", 1, 60, 1)}{row("OFFSET s", "offset", 0, 3600, 1)}</>)}
                                {dyn.type === "countdown" && (<>{row("FROM s", "from", 1, 3600, 1)}{row("DELAY", "delay", 0, 10, .1)}</>)}
                                {dyn.type === "datatile" && (<>{row("COLUMNS", "columns", 1, 8, 1)}{row("ROWS", "rows", 1, 16, 1)}{row("REFRESH/S", "rate", .1, 24, .1)}<div className="btnrow" style={{ gap: 5, marginTop: 4 }}><input className="in" placeholder="column kinds: n number · h hex · w word · t time · p percent · i id" value={dyn.kinds || "nhwp"} onChange={(e) => setDyn({ kinds: e.target.value || "nhwp" })} /></div><div className="dim small">Use a monospace font for aligned columns.</div></>)}
                                {dyn.type === "screen" && (<>{row("CHARS/S", "cps", 1, 120, 1)}{row("LINES", "lines", 1, 20, 1)}<div className="dim small">Use line breaks in the TITLE for multi-line terminal output; the text types on at CHARS/S with a blinking cursor.</div></>)}
                              </>);
                            })()}
                            <div className="lbl" style={{ marginTop: 6 }}>FONT</div>
                            <div className="btnrow" style={{ gap: 5 }}>
                              <select className="sel grow" value={selClip.tFont || ""} onChange={(e) => updateClip(selClip.id, { tFont: e.target.value || undefined })}>
                                <option value="">Style default</option>
                                {["Arial", "Georgia", "Impact", "Times New Roman", "Courier New", "Verdana", "Trebuchet MS", "Palatino Linotype", "Garamond"].map((f) => <option key={f} value={f}>{f}</option>)}
                                {localFonts.map((f) => <option key={"lf:" + f} value={f}>{f}</option>)}
                              </select>
                              <button className="minibtn" title="List every font installed on this machine (Chrome/Edge — asks permission once)" onClick={loadLocalFonts}>LOCAL FONTS…</button>
                            </div>
                            <div className="insp-row" style={{ marginTop: 6 }}><span className="lbl">SIZE</span>
                              <input type="range" min="1.5" max="20" step="0.1" value={selClip.tSize != null ? selClip.tSize : 5.8} onChange={(e) => updateClip(selClip.id, { tSize: parseFloat(e.target.value) })} />
                              <span className="insp-val mono">{(selClip.tSize != null ? selClip.tSize : 5.8).toFixed(1)}</span>
                            </div>
                            <div className="insp-row"><span className="lbl">COLOR</span>
                              <input type="color" value={selClip.tColor || "#ffffff"} onChange={(e) => updateClip(selClip.id, { tColor: e.target.value })} style={{ width: 34, height: 22, padding: 0, border: "none", background: "none", cursor: "pointer" }} />
                              <span className="lbl" style={{ marginLeft: 8 }}>SUB</span>
                              <input type="color" value={selClip.tSubColor || "#FF8C00"} onChange={(e) => updateClip(selClip.id, { tSubColor: e.target.value })} style={{ width: 34, height: 22, padding: 0, border: "none", background: "none", cursor: "pointer" }} />
                            </div>
                            <div className="insp-row"><span className="lbl">POS</span><span className="insp-val mono">{(selClip.tx != null ? selClip.tx : (selClip.titleStyle === "classic" ? 50 : 12)).toFixed(0)}% · {(selClip.ty != null ? selClip.ty : 78).toFixed(0)}%</span>
                              <button className="minibtn" title="Reset position/size" onClick={() => updateClip(selClip.id, { tx: undefined, ty: undefined, tSize: undefined })}>RESET</button>
                            </div>
                            <div className="dim small">Drag the title in the monitor to place it; the corner handle resizes. Turn on SAFE (under the monitor) for title-safe guides — they never render into the file.</div>
                          </>
                        )}
                        {(() => {
                          const la = selClip.assetId ? prod.mediaPool.find((x) => x.id === selClip.assetId) : null;
                          if (la?.type !== "lottie") return null;
                          return (
                            <>
                              <div className="insp-div" />
                              <div className="lbl">LOTTIE ANIMATION</div>
                              <div className="insp-row"><span className="lbl">SPEED</span>
                                <input type="range" min="0.25" max="3" step="0.05" value={selClip.lottieSpeed || 1} onChange={(e) => updateClip(selClip.id, { lottieSpeed: parseFloat(e.target.value) })} />
                                <span className="insp-val mono">{(selClip.lottieSpeed || 1).toFixed(2)}×</span>
                              </div>
                              <div className="insp-row"><span className="lbl">LOOP</span>
                                <button className={`minibtn ${selClip.lottieLoop !== false ? "blue" : ""}`} onClick={() => updateClip(selClip.id, { lottieLoop: selClip.lottieLoop === false })}>{selClip.lottieLoop !== false ? "ON" : "OFF"}</button>
                              </div>
                              <div className="dim small">Transform/opacity/blend below apply like any picture clip. Razor + trim work normally.</div>
                            </>
                          );
                        })()}
                        {(() => {
                          const asset = selClip.assetId ? prod.mediaPool.find((x) => x.id === selClip.assetId) : null;
                          if (!asset?.chart) return null;
                          const setChart = (patch) => updateProd((p) => { const target=p.mediaPool.find((x)=>x.id===asset.id); if(target?.chart) target.chart={...target.chart,...patch}; });
                          return <><div className="insp-div"/><div className="lbl">EDITABLE DATA VISUALIZATION</div>
                            <input className="in" value={asset.chart.title||''} onChange={(e)=>setChart({title:e.target.value})}/>
                            <div className="btnrow" style={{gap:5,marginTop:5}}><select className="sel grow" value={asset.chart.kind} onChange={(e)=>setChart({kind:e.target.value})}>{['BAR','LINE','AREA','DONUT','SCATTER','RADAR','WATERFALL','FUNNEL','GAUGE','BAR_3D','SCATTER_3D','SURFACE_3D'].map(x=><option key={x}>{x}</option>)}</select><select className="sel grow" value={asset.chart.style} onChange={(e)=>setChart({style:e.target.value})}>{['PLAJAH','SWISS','BAUHAUS','EDITORIAL','NEON','GLASS','INK','TOPOGRAPHIC','SPORTS','BROADCAST','MONO','CEREMONIAL'].map(x=><option key={x}>{x}</option>)}</select></div>
                            <div className="btnrow" style={{gap:5,marginTop:5}}><select className="sel grow" value={asset.chart.animation?.preset||'CASCADE'} onChange={(e)=>setChart({animation:{...asset.chart.animation,preset:e.target.value}})}>{['NONE','RISE','DRAW','CASCADE','ORBIT','MORPH'].map(x=><option key={x}>{x}</option>)}</select><button className={`minibtn grow ${asset.chart.interactive?'blue':''}`} onClick={()=>setChart({interactive:!asset.chart.interactive})}>INTERACTIVE {asset.chart.interactive?'ON':'OFF'}</button></div>
                            <div className="dim small">Open Data Motion to replace the dataset or reconnect a Tela Grid/Base. Timeline transforms, blend, trim and FX remain live below.</div>
                          </>;
                        })()}
                        {selShot && (
                          <>
                            <div className="insp-div" />
                            <div className="insp-row"><span className="lbl">SHOT</span><span className="insp-val">{selShot.slug} — {selShot.type}</span></div>
                            {selShot.character && <div className="insp-row"><span className="lbl">CHAR</span><span className="insp-val">{selShot.character}</span></div>}
                            {selShot.lines && <div className="insp-dlg">"{selShot.lines}"</div>}
                            <div className="dim small">{selShot.purpose}</div>
                            {selShot.status !== "ready" ? (
                              <button className="minibtn full" style={{ marginTop: 8 }} disabled={busy}
                                onClick={async () => { setBusy(true); setBusyMsg(`Writing prompts — ${selShot.slug}…`); try { await generateShotPrompts(selShot.id); } catch (e) { setError("Prompt gen failed. " + e.message); } setBusy(false); }}>
                                <Sparkles size={12} /> GENERATE PROMPTS</button>
                            ) : (
                              <>
                                <div className="insp-div" />
                                <div className="lbl">GENERATE THIS CLIP — paste into your service</div>
                                {selShot.still && <div className="insp-copy"><span>STILL</span><CopyBtn text={selShot.still} small /></div>}
                                {selShot.video && <div className="insp-copy"><span>VIDEO</span><CopyBtn text={selShot.video} small /></div>}
                                {selShot.voice && <div className="insp-copy"><span>VOICE</span><CopyBtn text={selShot.voice} small /></div>}
                                <div className="lbl" style={{ marginTop: 10 }}>STORYBOARD FRAME (chosen still URL)</div>
                                <input className="in tiny" value={selShot.frameUrl || ""} placeholder="https://…  (shows in monitor + clip)"
                                  onChange={(e) => updateScene((sc) => { const t = sc.shots.find((x) => x.id === selShot.id); if (t) t.frameUrl = e.target.value; })} />
                                <div className="lbl" style={{ marginTop: 10 }}>ATTACH GENERATED RESULT</div>
                                <AttachMedia onAttach={(url, name, type) => attachMediaToClip(selClip.id, url, name, type)} />
                              </>
                            )}
                          </>
                        )}
                        {selMc && (
                          <>
                            <div className="insp-div" />
                            <div className="lbl">MULTICAM — {selMc.angles.length} ANGLES</div>
                            {selMc.angles.map((ang, i) => {
                              const aa = prod.mediaPool.find((x) => x.id === ang.assetId);
                              return (
                                <div className="mcrow" key={i}>
                                  <button className={`mcangle ${(selClip.angle || 0) === i ? "on" : ""}`} onClick={() => switchAngle(i)}>{i + 1}</button>
                                  <span className="poolname">{aa?.name || "angle"}</span>
                                  <input className="in tiny mcoff" type="number" step="0.05" value={ang.offset}
                                    title="Sync offset (seconds into this angle's source)"
                                    onChange={(e) => updateProd((p) => { const m = p.mediaPool.find((x) => x.id === selMc.id); if (m) m.angles[i].offset = parseFloat(e.target.value) || 0; })} />
                                  <input className="in tiny mctc" placeholder="src TC" value={ang.tc || ""}
                                    title="Source start timecode (HH:MM:SS:FF) — APPLY syncs all angles"
                                    onChange={(e) => updateProd((p) => { const m = p.mediaPool.find((x) => x.id === selMc.id); if (m) m.angles[i].tc = e.target.value; })} />
                                </div>
                              );
                            })}
                            <button className="minibtn full" onClick={() => {
                              const secs = selMc.angles.map((a) => tc2sec(a.tc || "", vfmt.fps));
                              if (secs.some((s) => s == null)) { setError("Enter a valid source TC (HH:MM:SS:FF) for every angle, then APPLY."); return; }
                              const min = Math.min(...secs);
                              updateProd((p) => { const m = p.mediaPool.find((x) => x.id === selMc.id); if (m) m.angles.forEach((a, i) => { a.offset = Math.round((secs[i] - min) * 100) / 100; }); });
                              ping("Angles synced by source timecode");
                            }}>⌖ SYNC ANGLES BY SOURCE TC</button>
                            <div className="dim small">Click an angle mid-playback to cut to it at the playhead (classic multicam cutting). Audio-waveform sync needs server-side analysis — TC and manual offsets cover it here.</div>
                          </>
                        )}
                        {selClip.kind === "media" && (() => {
                          const a = prod.mediaPool.find((x) => x.id === selClip.assetId);
                          return a && !a.url ? (
                            <>
                              <div className="insp-div" />
                              <div className="lbl">RELINK OFFLINE MEDIA — "{a.name}"</div>
                              <AttachMedia onAttach={(url, name, type) => relinkAsset(a.id, url, name, type)} />
                            </>
                          ) : null;
                        })()}
                        {selShot?.status === "ready" && engines.length > 0 && (
                          <button className="minibtn blue full" style={{ marginTop: 6 }} disabled={busy} onClick={() => generateViaEngine(selShot, "still")}>
                            <Cpu size={12} /> ⚡ GENERATE VIA {engines[0].name.toUpperCase()}
                          </button>
                        )}
                        {selClip.kind !== "voice" && !selIsAudio && (() => {
                          const fx = ensureFx(selClip);
                          // Clip-local playhead time — where keyframes are read/written.
                          const kfLt = Math.max(0, Math.min(selClip.duration || 0, playhead - selClip.start));
                          const KFKEYS = new Set(KF_ALL);
                          const slider = (lbl, key, min, max, step) => {
                            const kfable = KFKEYS.has(key);
                            const track = fx.kf?.[key];
                            const animated = kfHasKeys(track);
                            const val = animated ? kfSample(fx, key, kfLt, fx[key]) : fx[key];
                            const onDiamond = () => {
                              const nkf = { ...(fx.kf || {}) };
                              if (kfKeyAt(track, kfLt)) { const t2 = kfRemoveKey(track, kfLt); if (t2.length) nkf[key] = t2; else delete nkf[key]; }
                              else nkf[key] = kfAddKey(track, kfLt, val);
                              updateFx(selClip.id, { kf: nkf });
                            };
                            const setVal = (nv) => {
                              if (animated) updateFx(selClip.id, { kf: { ...(fx.kf || {}), [key]: kfAddKey(track, kfLt, nv) } });
                              else updateFx(selClip.id, { [key]: nv });
                            };
                            return (
                              <div className="fxrow" key={key}>
                                <span className="fxlbl">{lbl}</span>
                                <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => setVal(parseFloat(e.target.value))}
                                  onDoubleClick={() => { if (animated) { const nkf = { ...(fx.kf || {}) }; delete nkf[key]; updateFx(selClip.id, { kf: nkf }); } }} />
                                <span className="fxval">{Number(val).toFixed(step < 0.1 ? 2 : 1)}</span>
                                {kfable && <button className={`kfdiamond ${animated ? "anim" : ""} ${kfKeyAt(track, kfLt) ? "on" : ""}`}
                                  title={animated ? "Key at playhead — click to add/remove · double-click the slider to clear the track" : "Keyframe this parameter at the playhead"} onClick={onDiamond}>◆</button>}
                              </div>
                            );
                          };
                          return (
                            <>
                              <div className="insp-div" />
                              <div className="lbl">TRANSFORM <span className="cap" style={{ letterSpacing: ".14em" }}>◆ = KEYFRAME AT PLAYHEAD</span></div>
                              {slider("POS X", "x", -100, 100, 1)}
                              {slider("POS Y", "y", -100, 100, 1)}
                              {slider("SCALE", "sc", 0.1, 3, 0.01)}
                              {slider("ROTATE", "rot", -180, 180, 1)}
                              {kfIsAnimated(fx) && (() => {
                                // Keyframe navigator: jump the playhead between keys (across all
                                // animated params) and see which params move. The ◆ diamonds above
                                // add/remove keys at the playhead; editing a slider re-keys there.
                                const animKeys = KF_ALL.filter((k) => kfHasKeys(fx.kf?.[k]));
                                const prevs = animKeys.map((k) => kfPrev(fx.kf[k], kfLt)).filter((v) => v != null);
                                const nexts = animKeys.map((k) => kfNext(fx.kf[k], kfLt)).filter((v) => v != null);
                                const goPrev = prevs.length ? Math.max(...prevs) : null;
                                const goNext = nexts.length ? Math.min(...nexts) : null;
                                return (
                                  <div className="fxrow kfnav">
                                    <span className="fxlbl" style={{ color: "var(--pur)" }}>KEYS</span>
                                    <button disabled={goPrev == null} title="Previous keyframe" onClick={() => setPlayhead(selClip.start + goPrev)}>◀ KEY</button>
                                    <button disabled={goNext == null} title="Next keyframe" onClick={() => setPlayhead(selClip.start + goNext)}>KEY ▶</button>
                                    <span className="kfchips">{animKeys.map((k) => <span key={k} className="chip pur" style={{ padding: "2px 5px" }}>{k.toUpperCase()} {fx.kf[k].length}</span>)}</span>
                                    <button title="Clear all keyframes on this clip" onClick={() => updateFx(selClip.id, { kf: undefined })}>CLEAR</button>
                                  </div>
                                );
                              })()}
                              <div className="lbl" style={{ marginTop: 8 }}>FORGE STACK <span className="cap">NATIVE · ORDERED · NON-DESTRUCTIVE</span></div>
                              {!fx.stack.length && <div className="dim small">Add premium effects from Effects Library → Forge, or start from a LOOK.</div>}
                              {!!customDefs.length && (
                                <div className="fxbuilt">
                                  <div className="fxrow"><span className="fxlbl">YOUR EFFECTS</span></div>
                                  {customDefs.map((custom) => (
                                    <div key={custom.id} className="fxrow">
                                      <button className="minibtn blue" title={custom.description || `${custom.steps.length} effects`} onClick={() => addCustomEffect(custom)}>+ {custom.name}</button>
                                      <span className="dim small mono">{custom.steps.length}× · {custom.controls.length} ctrl</span>
                                      <button className="minibtn" title="Choose which parameters this effect exposes" onClick={() => setBuilderId(builderId === custom.id ? null : custom.id)}>{builderId === custom.id ? "DONE" : "EDIT"}</button>
                                      <button className="minibtn danger" title="Delete this effect" onClick={() => removeCustomEffect(custom.id, custom.name)}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {(() => {
                                // Promotion editor: pick the parameters this effect exposes. Each
                                // promoted control keeps its current value as the default, so
                                // adding a knob never changes how the effect already looks.
                                const custom = customDefs.find((c) => c.id === builderId);
                                if (!custom) return null;
                                return (
                                  <div className="fxbuilder">
                                    <div className="fxrow"><span className="fxlbl">CONTROLS FOR</span><input className="inp xs grow" value={custom.name} onChange={(e) => updateBuilder({ ...custom, name: e.target.value })} /></div>
                                    {!custom.controls.length && <div className="fxrow tiny dim">Nothing exposed yet — promote a parameter below and it becomes a slider on this effect.</div>}
                                    {custom.controls.map((control, ci) => (
                                      <div key={control.key} className="fxrow">
                                        <input className="inp xs grow" value={control.label} title="What this control is called" onChange={(e) => updateBuilder({ ...custom, controls: custom.controls.map((c, i) => i === ci ? { ...c, label: e.target.value } : c) })} />
                                        <span className="dim small mono">{control.targets.length} target{control.targets.length === 1 ? "" : "s"}</span>
                                        <button className="minibtn danger" title="Remove this control" onClick={() => updateBuilder({ ...custom, controls: custom.controls.filter((_, i) => i !== ci) })}>✕</button>
                                      </div>
                                    ))}
                                    <div className="fxrow tiny dim">Promote a parameter:</div>
                                    {custom.steps.map((step, si) => {
                                      const stepEffect = FX_EFFECTS.find((e) => e.id === step.effectId);
                                      if (!stepEffect) return <div key={si} className="fxrow tiny dim">Step {si + 1}: {step.effectId} is no longer installed.</div>;
                                      return (
                                        <div key={si} className="fxrow wrap">
                                          <span className="dim small mono" style={{ minWidth: 84 }}>{si + 1}. {stepEffect.name}</span>
                                          {stepEffect.params.map((param) => {
                                            const taken = custom.controls.some((c) => c.targets.some((t) => t.step === si && t.param === param.key));
                                            return <button key={param.key} className={`minibtn ${taken ? "blue" : ""}`} title={taken ? "Already exposed" : `Expose ${param.label} as a control`} disabled={taken} onClick={() => updateBuilder(promoteControl(custom, si, param.key))}>{param.label}</button>;
                                          })}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                              {fx.stack.length > 1 && <div className="btnrow" style={{ gap: 5, marginBottom: 6 }}><button className="minibtn" title="Save this whole stack to the LOOKS tab" onClick={saveStackAsLook}>◈ SAVE AS LOOK</button><button className="minibtn" title="Turn this stack into one effect with controls you name yourself" onClick={buildEffectFromStack}>⚒ BUILD EFFECT</button><span className="dim small mono">{fx.stack.length} effects</span>{(() => {
                                // Stack total, not per-effect: five things each "fine on their own"
                                // are not fine together, and the per-effect badges cannot say so.
                                // Expand custom effects and drop disabled ones — the same stack the
                                // compositor actually renders — then sum.
                                const resolved = expandStack(fx.stack.filter((i) => i.enabled !== false), customLookup()).map((i) => FX_EFFECTS.find((e) => e.id === i.effectId));
                                const total = stackCost(resolved);
                                if (total.tier === "light") return null;
                                const worst = total.heaviest && FX_EFFECTS.find((e) => e.id === total.heaviest.effectId);
                                return <span className={`fxcost ${total.tier}`} title={`Estimated total for this stack of ${resolved.filter(Boolean).length} effects.${worst ? ` Heaviest: ${worst.name} — disable it first if the preview slows.` : ""}`}>STACK · {TIER_LABEL[total.tier]}</span>;
                              })()}</div>}
                              {fx.stack.map((instance, stackIndex) => {
                                // A user-built effect has no shader of its own; its descriptor
                                // publishes the promoted controls as ordinary parameters, so every
                                // row below (sliders, keyframes, track links) works unchanged.
                                const customDef = isCustomEffectId(instance.effectId) ? customDefs.find((c) => c.id === bareCustomId(instance.effectId)) : null;
                                const effect = customDef ? customEffectDescriptor(customDef) : FX_EFFECTS.find((candidate) => candidate.id === instance.effectId);
                                if (!effect) return null;
                                const hasTracks = !!(fx.vectorTrack || fx.planarTrack);
                                const patchStack = (patch) => {
                                  const stack = fx.stack.map((item, index) => index === stackIndex ? { ...item, ...patch } : item);
                                  updateFx(selClip.id, { stack });
                                };
                                const moveStack = (dir) => {
                                  const to = stackIndex + dir;
                                  if (to < 0 || to >= fx.stack.length) return;
                                  const stack = [...fx.stack];
                                  [stack[stackIndex], stack[to]] = [stack[to], stack[stackIndex]];
                                  updateFx(selClip.id, { stack });
                                };
                                return (
                                  <div key={instance.id} className="forgefx">
                                    <div className="fxrow">
                                      <button className={`minibtn ${instance.enabled !== false ? "blue" : ""}`} onClick={() => patchStack({ enabled: instance.enabled === false })}>{instance.enabled !== false ? "ON" : "OFF"}</button>
                                      <span className="fxrowname">{effect.name}</span>
                                      {(() => {
                                        // Static estimate, not a measurement: it ranks effects so
                                        // nobody stacks four raymarchers before noticing.
                                        const cost = customDef ? null : estimateEffectCost(effect);
                                        return cost && cost.tier !== "light" ? <span className={`fxcost ${cost.tier}`} title={TIER_HINT[cost.tier]}>{TIER_LABEL[cost.tier]}</span> : null;
                                      })()}
                                      <button className="minibtn" disabled={stackIndex === 0} onClick={() => moveStack(-1)}>▲</button>
                                      <button className="minibtn" disabled={stackIndex === fx.stack.length - 1} onClick={() => moveStack(1)}>▼</button>
                                      <button className="minibtn danger" onClick={() => updateFx(selClip.id, { stack: fx.stack.filter((_, index) => index !== stackIndex) })}>✕</button>
                                    </div>
                                    {!!effect.presets?.length && (
                                      <select className="sel xs full" value={instance.presetId || ""} onChange={(e) => {
                                        const preset = effect.presets.find((candidate) => candidate.id === e.target.value);
                                        if (preset) patchStack({ presetId: preset.id, params: { ...Object.fromEntries(effect.params.map((param) => [param.key, param.default])), ...preset.params } });
                                      }}>
                                        <option value="">Custom</option>
                                        {effect.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                                      </select>
                                    )}
                                    {effect.auxInput?.kind === "text" && (() => {
                                      // Text-as-input: the string, its look, and where it sits.
                                      // Tokens resolve per frame, so a burn-in can actually run.
                                      const spec = instance.textOverlay || { text: "" };
                                      const setSpec = (patch) => patchStack({ textOverlay: { ...spec, ...patch } });
                                      return (
                                        <div className="fxtext">
                                          <div className="fxrow"><span className="fxlbl">{effect.auxInput.label}</span></div>
                                          <textarea className="inp xs" rows={2} value={spec.text || ""} placeholder="REC {clock}  {tc}" onChange={(e) => setSpec({ text: e.target.value })} />
                                          <div className="fxrow tiny dim">Tokens: {"{tc} {frame} {sec} {count:1,1,3} {clock} {date}"}</div>
                                          <div className="fxrow">
                                            <input type="color" title="Text colour" value={spec.color || "#ffffff"} onChange={(e) => setSpec({ color: e.target.value })} />
                                            <select className="sel xs" title="Horizontal position" value={spec.align || "left"} onChange={(e) => setSpec({ align: e.target.value })}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select>
                                            <select className="sel xs" title="Vertical position" value={spec.valign || "top"} onChange={(e) => setSpec({ valign: e.target.value })}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select>
                                            <select className="sel xs" title="Letter case" value={spec.caseMode || "none"} onChange={(e) => setSpec({ caseMode: e.target.value })}><option value="none">As typed</option><option value="upper">UPPER</option><option value="lower">lower</option></select>
                                          </div>
                                          <div className="fxrow"><span className="fxlbl">Size</span><input type="range" min={.02} max={.2} step={.002} value={spec.size ?? .055} onChange={(e) => setSpec({ size: parseFloat(e.target.value) })} /><span className="fxval">{Math.round((spec.size ?? .055) * 100)}%</span></div>
                                          <div className="fxrow"><span className="fxlbl">Tracking</span><input type="range" min={-.1} max={.6} step={.01} value={spec.tracking ?? 0} onChange={(e) => setSpec({ tracking: parseFloat(e.target.value) })} /><span className="fxval">{(spec.tracking ?? 0).toFixed(2)}</span></div>
                                          <div className="fxrow"><span className="fxlbl">Start TC</span><input className="inp xs" type="number" min={0} step={1} title="Frame the timecode and counters start from" value={spec.startFrame ?? 0} onChange={(e) => setSpec({ startFrame: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                                            <button className="btn xs" title="Fix the date/clock tokens to a chosen moment — a burn-in must not drift between the monitor and the export" onClick={() => setSpec({ epochMs: spec.epochMs === undefined ? Date.now() : undefined })}>{spec.epochMs === undefined ? "Set clock origin" : "Clock pinned"}</button>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                    {effect.auxInput && effect.auxInput.kind !== "text" && (
                                      <div className="fxrow"><span className="fxlbl">{effect.auxInput.label}</span>
                                        <select className="sel xs grow" value={instance.auxSource === "depth" ? "__depth" : (instance.auxAssetId || "")} onChange={(e) => { const v = e.target.value; if (v === "__depth") patchStack({ auxSource: "depth", auxAssetId: undefined }); else patchStack({ auxSource: undefined, auxAssetId: v || undefined }); }}>
                                          <option value="">{effect.auxInput.optional ? "Source fallback" : "Choose asset…"}</option>
                                          <option value="__depth">AI depth map of this clip</option>
                                          {(prod?.mediaPool || []).filter((asset) => asset.url && ["video", "image", "graphic"].includes(asset.type)).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                                        </select>
                                      </div>
                                    )}
                                    {effect.params.map((param) => {
                                      // Effect params keyframe exactly like clip params: times are
                                      // clip-local seconds, the slider writes a key while animated.
                                      const fxLt = Math.max(0, playhead - selClip.start);
                                      const kfTrack = instance.kf?.[param.key];
                                      const kfOn = kfHasKeys(kfTrack);
                                      const stored = instance.params?.[param.key] ?? param.default;
                                      const value = kfOn ? sampleTrack(kfTrack, fxLt, stored) : stored;
                                      const setParamValue = (nv) => {
                                        if (kfOn) patchStack({ presetId: undefined, kf: { ...(instance.kf || {}), [param.key]: kfAddKey(kfTrack, fxLt, nv) } });
                                        else patchStack({ presetId: undefined, params: { ...instance.params, [param.key]: nv } });
                                      };
                                      const toggleParamKey = () => {
                                        const kf = { ...(instance.kf || {}) };
                                        if (kfOn && kfKeyAt(kfTrack, fxLt)) { const next = kfRemoveKey(kfTrack, fxLt); if (next.length) kf[param.key] = next; else delete kf[param.key]; }
                                        else kf[param.key] = kfAddKey(kfTrack, fxLt, value);
                                        patchStack({ presetId: undefined, kf });
                                      };
                                      return <div className="fxrow" key={param.key}><span className="fxlbl">{param.label}</span><input type="range" min={param.min} max={param.max} step={param.step || (param.max - param.min) / 200} value={value} onChange={(e) => setParamValue(parseFloat(e.target.value))} onDoubleClick={() => patchStack({ presetId: undefined, params: { ...instance.params, [param.key]: param.default } })} /><button className={`kfdiamond ${kfOn ? "anim" : ""} ${kfOn && kfKeyAt(kfTrack, fxLt) ? "on" : ""}`} title={kfOn ? "Key at the playhead (click to add/remove) — double-click the slider resets" : "Animate this parameter: adds a keyframe at the playhead"} onClick={toggleParamKey}>◆</button><span className="fxval">{Number(value).toFixed(param.step && param.step >= 1 ? 0 : 2)}</span><select className="sel xs" title="Drive this parameter from the timeline audio" value={instance.audio?.[param.key]?.source || ""} onChange={(e) => { const audio = { ...(instance.audio || {}) }; if (e.target.value) audio[param.key] = { source: e.target.value, amount: audio[param.key]?.amount ?? .5 }; else delete audio[param.key]; patchStack({ audio }); }}><option value="">♪</option>{AUDIO_SOURCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
                                      {instance.audio?.[param.key] && <input type="range" title="How much the audio moves this parameter" min={-1} max={1} step={.05} value={instance.audio[param.key].amount} onChange={(e) => patchStack({ audio: { ...instance.audio, [param.key]: { ...instance.audio[param.key], amount: parseFloat(e.target.value) } } })} style={{ maxWidth: 54 }} />}
                                      {hasTracks && <select className="sel xs" title="Link this parameter to the clip's track" value={instance.bindings?.[param.key]?.source || ""} onChange={(e) => { const bindings = { ...(instance.bindings || {}) }; if (e.target.value) bindings[param.key] = { source: e.target.value }; else delete bindings[param.key]; patchStack({ bindings }); }}><option value="">·</option>{BINDING_SOURCES.filter((b) => (b.id.startsWith("point") ? !!fx.vectorTrack : !!fx.planarTrack)).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>}</div>;
                                    })}
                                    <div className="fxrow"><span className="fxlbl">MIX</span><input type="range" min={0} max={1} step={.01} value={instance.mix ?? 1} onChange={(e) => patchStack({ mix: parseFloat(e.target.value) })} onDoubleClick={() => patchStack({ mix: 1 })} /><span className="fxval">{Number(instance.mix ?? 1).toFixed(2)}</span></div>
                                    <div className="fxrow"><span className="fxlbl">MASK</span>
                                      <select className="sel xs grow" value={instance.mask && instance.mask.enabled !== false ? (instance.mask.kind === "subject" || instance.mask.kind === "depth" || instance.mask.kind === "aux" || instance.mask.kind === "sam" ? instance.mask.kind : instance.mask.shape) : ""} onChange={(e) => { const shape = e.target.value; if (!shape) { patchStack({ mask: undefined }); if (maskEdit?.instanceId === instance.id) setMaskEdit(null); return; } if (shape === "subject") { if (maskEdit?.instanceId === instance.id) setMaskEdit(null); patchStack({ mask: { ...MASK_DEFAULT, ...(instance.mask || {}), kind: "subject", shape: "ellipse", track: "none", enabled: true } }); return; } if (shape === "depth") { if (maskEdit?.instanceId === instance.id) setMaskEdit(null); patchStack({ mask: { ...MASK_DEFAULT, ...(instance.mask || {}), kind: "depth", shape: "ellipse", track: "none", enabled: true, near: 1, far: .55, feather: .08 } }); return; } if (shape === "aux") { if (maskEdit?.instanceId === instance.id) setMaskEdit(null); patchStack({ mask: { ...MASK_DEFAULT, ...(instance.mask || {}), kind: "aux", shape: "ellipse", track: "none", enabled: true } }); return; } if (shape === "sam") { patchStack({ mask: { ...MASK_DEFAULT, ...(instance.mask || {}), kind: "sam", shape: "ellipse", cx: instance.mask?.cx ?? .5, cy: instance.mask?.cy ?? .5, w: .12, h: .12, track: "none", enabled: true, feather: instance.mask?.feather ?? .02, refFrame: Math.max(0, Math.round((playhead - selClip.start) * (vfmt.fps || 24))) } }); setMaskEdit({ clipId: selClip.id, instanceId: instance.id }); return; } patchStack({ mask: { ...MASK_DEFAULT, ...(instance.mask || {}), kind: "shape", shape, enabled: true, refFrame: Math.max(0, Math.round((playhead - selClip.start) * (vfmt.fps || 24))), ...(shape === "poly" && !instance.mask?.points ? { points: [{ x: .3, y: .3 }, { x: .7, y: .3 }, { x: .7, y: .7 }, { x: .3, y: .7 }] } : {}) } }); }}>
                                        <option value="">none</option><option value="ellipse">ellipse</option><option value="rect">rectangle</option><option value="poly">polygon</option><option value="subject">subject (AI matte)</option><option value="sam">object (SAM · AI)</option><option value="depth">depth window (AI)</option><option value="aux">asset luma</option>
                                      </select>
                                      {instance.mask && instance.mask.kind !== "subject" && instance.mask.kind !== "depth" && instance.mask.kind !== "aux" && <button className={`minibtn ${maskEdit?.instanceId === instance.id ? "on" : ""}`} onClick={() => setMaskEdit(maskEdit?.instanceId === instance.id ? null : { clipId: selClip.id, instanceId: instance.id })}>{maskEdit?.instanceId === instance.id ? "✓ DONE" : "EDIT"}</button>}
                                    </div>
                                    {instance.mask && (<>
                                      <div className="fxrow"><span className="fxlbl">FEATHER</span><input type="range" min={0} max={.3} step={.005} value={instance.mask.feather ?? 0} onChange={(e) => patchStack({ mask: { ...instance.mask, feather: parseFloat(e.target.value) } })} /><span className="fxval">{Number(instance.mask.feather ?? 0).toFixed(3)}</span></div>
                                      {instance.mask.kind === "aux" && (
                                        <div className="fxrow"><span className="fxlbl">MASK ASSET</span>
                                          <select className="sel xs grow" value={instance.mask.assetId || ""} onChange={(e) => patchStack({ mask: { ...instance.mask, assetId: e.target.value || undefined } })}>
                                            <option value="">Choose asset…</option>
                                            {(prod?.mediaPool || []).filter((asset) => asset.url && ["video", "image", "graphic"].includes(asset.type)).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                                          </select>
                                        </div>
                                      )}
                                      {instance.mask.kind === "sam" && (
                                        <div className="dim small">Drag the marker onto the object to matte it. Point at ONE thing — SAM segments what you point at, not "the person". Turn on FOLLOW to keep it selected as it moves.</div>
                                      )}
                                      {instance.mask.kind === "depth" && (<>
                                        <div className="fxrow"><span className="fxlbl">NEAR</span><input type="range" min={0} max={1} step={.01} value={instance.mask.near ?? 1} onChange={(e) => patchStack({ mask: { ...instance.mask, near: parseFloat(e.target.value) } })} /><span className="fxval">{Number(instance.mask.near ?? 1).toFixed(2)}</span></div>
                                        <div className="fxrow"><span className="fxlbl">FAR</span><input type="range" min={0} max={1} step={.01} value={instance.mask.far ?? .55} onChange={(e) => patchStack({ mask: { ...instance.mask, far: parseFloat(e.target.value) } })} /><span className="fxval">{Number(instance.mask.far ?? .55).toFixed(2)}</span></div>
                                        <div className="dim small">1 = closest. The effect applies between NEAR and FAR; invert to affect everything else (e.g. blur the background).</div>
                                      </>)}
                                      <div className="fxrow"><span className="fxlbl">INVERT</span><button className={`minibtn ${instance.mask.invert ? "on" : ""}`} onClick={() => patchStack({ mask: { ...instance.mask, invert: !instance.mask.invert } })}>{instance.mask.invert ? "ON" : "OFF"}</button>
                                        {hasTracks && <><span className="fxlbl" style={{ marginLeft: 8 }}>FOLLOW</span>
                                        <select className="sel xs" value={instance.mask.track || "none"} onChange={(e) => patchStack({ mask: { ...instance.mask, track: e.target.value, refFrame: Math.max(0, Math.round((playhead - selClip.start) * (vfmt.fps || 24))) } })}><option value="none">none</option>{fx.vectorTrack && <option value="point">point track</option>}{fx.planarTrack && <option value="planar">surface</option>}</select></>}
                                      </div>
                                    </>)}
                                  </div>
                                );
                              })}
                              <div className="lbl" style={{ marginTop: 8 }}>VECTORTRACK <span className="cap">POINT</span></div>
                              <div className="btnrow" style={{ gap: 5 }}>
                                <button className="minibtn blue grow" onClick={trackSelectedForward}>◎ TRACK FORWARD</button>
                                {fx.vectorTrack && <button className={`minibtn ${fx.trackMode === "stabilize" ? "on" : ""}`} onClick={() => updateFx(selClip.id, { trackMode: fx.trackMode === "stabilize" ? "off" : "stabilize" })}>STABILIZE</button>}
                                {fx.vectorTrack && <button className="minibtn danger" onClick={() => updateFx(selClip.id, { vectorTrack: undefined, trackMode: fx.trackMode === "stabilize" ? "off" : fx.trackMode })}>CLEAR</button>}
                              </div>
                              {fx.vectorTrack && <div className="dim small">{fx.vectorTrack.samples.length} samples · {fx.vectorTrack.width}×{fx.vectorTrack.height} analysis · confidence {(fx.vectorTrack.samples.at(-1)?.confidence * 100 || 0).toFixed(0)}%</div>}
                              <div className="lbl" style={{ marginTop: 8 }}>VECTORTRACK <span className="cap">PLANAR · SURFACE</span></div>
                              <div className="btnrow" style={{ gap: 5 }}>
                                <button className={`minibtn ${surfaceEdit ? "on" : ""}`} onClick={() => (surfaceEdit ? setSurfaceEdit(false) : placeSurface())}>{surfaceEdit ? "✓ DONE" : "▢ SURFACE"}</button>
                                <button className="minibtn" title="Track backward from the playhead" disabled={!fx.planarSurface || !!trackProgress} onClick={trackPlanarBackward}>◀</button>
                                <button className="minibtn blue grow" disabled={!fx.planarSurface || !!trackProgress} onClick={trackPlanarForward}>◈ TRACK ▶</button>
                                {fx.planarTrack && <button className="minibtn" title="Download corner-pin keyframes (JSON)" onClick={exportPlanarPin}>⇩ PIN</button>}
                                {fx.planarTrack && <button className={`minibtn ${fx.trackMode === "planar" ? "on" : ""}`} onClick={() => updateFx(selClip.id, { trackMode: fx.trackMode === "planar" ? "off" : "planar" })}>STABILIZE</button>}
                                {(fx.planarTrack || fx.planarSurface) && <button className="minibtn danger" onClick={() => { setSurfaceEdit(false); updateFx(selClip.id, { planarTrack: undefined, planarSurface: undefined, trackMode: fx.trackMode === "planar" ? "off" : fx.trackMode }); }}>CLEAR</button>}
                              </div>
                              {trackProgress && <div className="dim small">tracking {trackProgress.frame}/{trackProgress.total} · confidence {(trackProgress.confidence * 100).toFixed(0)}%{trackProgress.note ? ` · ${trackProgress.note}` : ""} <button className="minibtn" style={{ marginLeft: 6 }} onClick={() => { trackCancelRef.current = true; }}>STOP</button></div>}
                              {!trackProgress && fx.planarTrack && (() => { const r = planarTrackedRange(fx.planarTrack); const last = fx.planarTrack.samples.filter((s) => !s.lost).at(-1); return <div className="dim small">{fx.planarTrack.samples.filter((s) => !s.lost).length} frames · ref {fx.planarTrack.referenceFrame} → {r.end}{r.lostAt != null ? ` · lost at ${r.lostAt}` : ""} · {fx.planarTrack.features.length} features · confidence {((last?.confidence || 0) * 100).toFixed(0)}% · {last?.inliers ?? 0} inliers</div>; })()}
                              <div className="lbl" style={{ marginTop: 8 }}>MESH TRACK <span className="cap">NON-RIGID SURFACE</span></div>
                              <div className="btnrow" style={{ gap: 5 }}>
                                <span className="fxlbl" title="Cells across the surface. More cells follow finer deformation but cost a block match each.">GRID</span>
                                <input type="range" min={1} max={10} step={1} title="Mesh density" value={fx.meshDensity || 4} disabled={!!trackProgress} onChange={(e) => updateFx(selClip.id, { meshDensity: parseInt(e.target.value, 10) })} style={{ maxWidth: 70 }} />
                                <span className="fxval">{fx.meshDensity || 4}\u00d7{fx.meshDensity || 4}</span>
                                <button className="minibtn" title="Track the mesh backward from the playhead" disabled={!fx.planarSurface || !!trackProgress} onClick={trackMeshBackward}>\u25c0</button>
                                <button className="minibtn blue grow" title="Track the surface as a deformable mesh from the playhead" disabled={!fx.planarSurface || !!trackProgress} onClick={trackMeshForward}>\u25a6 MESH \u25b6</button>
                                {fx.meshTrack && <button className="minibtn danger" onClick={() => updateFx(selClip.id, { meshTrack: undefined })}>CLEAR</button>}
                              </div>
                              {!trackProgress && fx.meshTrack && (() => {
                                const r = meshTrackedRange(fx.meshTrack);
                                const good = fx.meshTrack.samples.filter((s) => !s.lost);
                                const last = good.at(-1);
                                return <div className="dim small">{good.length} frames \u00b7 ref {fx.meshTrack.referenceFrame} \u2192 {r.end}{r.lostAt != null ? ` \u00b7 lost at ${r.lostAt}` : ""} \u00b7 {fx.meshTrack.cols}\u00d7{fx.meshTrack.rows} mesh \u00b7 confidence {((last?.confidence || 0) * 100).toFixed(0)}% \u00b7 {Math.round((last?.trusted || 0) * 100)}% matched \u00b7 add MESH TRACK WARP to use it</div>;
                              })()}
                              {(() => {
                                // Reuse a track from another clip of the SAME footage (copied + re-based to this clip's source time).
                                const donors = clips.filter((c) => c.id !== selClip.id && c.assetId && c.assetId === selClip.assetId && (c.fx?.planarTrack || c.fx?.vectorTrack));
                                if (!donors.length) return null;
                                return (
                                  <div className="fxrow"><span className="fxlbl">USE TRACK FROM</span>
                                    <select className="sel xs grow" value="" onChange={(e) => {
                                      const donor = clips.find((c) => c.id === e.target.value); if (!donor) return;
                                      const fps = vfmt.fps || 24; const off = trackFrameOffset(donor, selClip, fps); const patch = {};
                                      if (donor.fx?.planarTrack) { const r = planarTrackedRange(donor.fx.planarTrack); const ok = canShareTrack(donor, selClip, fps, { start: r.start, end: r.end }); if (!ok.ok) { ping(`Cannot share: ${ok.reason}`); return; } patch.planarTrack = rebasePlanarTrack(donor.fx.planarTrack, off, uid()); if (donor.fx.planarSurface) patch.planarSurface = donor.fx.planarSurface; }
                                      if (donor.fx?.vectorTrack) { const s = donor.fx.vectorTrack.samples; const ok = canShareTrack(donor, selClip, fps, { start: s[0]?.frame ?? 0, end: s.at(-1)?.frame ?? 0 }); if (ok.ok) patch.vectorTrack = rebaseVectorTrack(donor.fx.vectorTrack, off, uid()); }
                                      if (!Object.keys(patch).length) { ping("Nothing shareable from that clip."); return; }
                                      updateFx(selClip.id, patch); ping(`Track copied from ${donor.label || donor.id}`);
                                    }}>
                                      <option value="">— pick a clip —</option>
                                      {donors.map((c) => <option key={c.id} value={c.id}>{c.label || c.id} ({c.trackId}{c.fx?.planarTrack ? " · surface" : ""}{c.fx?.vectorTrack ? " · point" : ""})</option>)}
                                    </select>
                                  </div>
                                );
                              })()}
                              {!trackProgress && !fx.planarTrack && fx.planarSurface && <div className="dim small">surface placed · park the playhead on the reference frame and TRACK</div>}
                              {!trackProgress && fx.planarTrack && <div className="dim small">drag the green corners on the monitor to correct a frame, then TRACK again from it</div>}
                              {(() => {
                                const surfaces = clips.filter((c) => c.id !== selClip.id && /^v\d+$/.test(c.trackId) && c.fx?.planarTrack && c.start < selClip.start + selClip.duration && c.start + c.duration > selClip.start);
                                if (!surfaces.length && !fx.pinTo) return null;
                                return (
                                  <div className="fxrow" style={{ marginTop: 6 }}>
                                    <span className="fxlbl">PIN TO SURFACE</span>
                                    <select value={fx.pinTo?.clipId || ""} onChange={(e) => updateFx(selClip.id, { pinTo: e.target.value ? { clipId: e.target.value } : undefined })}>
                                      <option value="">— none —</option>
                                      {surfaces.map((c) => <option key={c.id} value={c.id}>{c.label || c.id} ({c.trackId})</option>)}
                                      {fx.pinTo && !surfaces.some((c) => c.id === fx.pinTo.clipId) && <option value={fx.pinTo.clipId}>(missing surface clip)</option>}
                                    </select>
                                  </div>
                                );
                              })()}
                              <div className="lbl" style={{ marginTop: 8 }}>LOOK</div>
                              {slider("BLUR", "blur", 0, 30, 0.5)}
                              {slider("BRIGHT", "bri", 0, 2.5, 0.02)}
                              {slider("CONTRAST", "con", 0, 2.5, 0.02)}
                              {slider("SATURATE", "sat", 0, 2.5, 0.02)}
                              <div className="lbl" style={{ marginTop: 8 }}>FADES</div>
                              {slider("FADE IN", "fadeIn", 0, 4, 0.1)}
                              {slider("FADE OUT", "fadeOut", 0, 4, 0.1)}
                              <div className="lbl" style={{ marginTop: 8 }}>COMPOSITE</div>
                              {slider("OPACITY", "op", 0, 1, 0.01)}
                              <div className="fxrow">
                                <span className="fxlbl">BLEND</span>
                                <select className="sel xs grow" value={fx.blend} onChange={(e) => updateFx(selClip.id, { blend: e.target.value })}>
                                  {BLENDS.map((b) => <option key={b}>{b}</option>)}
                                </select>
                              </div>
                              <div className="fxrow">
                                <span className="fxlbl">MATTE</span>
                                <select className="sel xs grow" value={fx.matte.t} onChange={(e) => updateFx(selClip.id, { matte: { t: e.target.value } })}>
                                  {["none", "rect", "ellipse"].map((t) => <option key={t}>{t}</option>)}
                                </select>
                              </div>
                              {fx.matte.t !== "none" && (
                                <>
                                  <div className="fxrow"><span className="fxlbl">M·X/Y</span>
                                    <input type="range" min="0" max="100" value={fx.matte.x} onChange={(e) => updateFx(selClip.id, { matte: { x: parseFloat(e.target.value) } })} />
                                    <input type="range" min="0" max="100" value={fx.matte.y} onChange={(e) => updateFx(selClip.id, { matte: { y: parseFloat(e.target.value) } })} /></div>
                                  <div className="fxrow"><span className="fxlbl">M·W/H</span>
                                    <input type="range" min="2" max="100" value={fx.matte.w} onChange={(e) => updateFx(selClip.id, { matte: { w: parseFloat(e.target.value) } })} />
                                    <input type="range" min="2" max="100" value={fx.matte.h} onChange={(e) => updateFx(selClip.id, { matte: { h: parseFloat(e.target.value) } })} /></div>
                                </>
                              )}
                              <div className="lbl" style={{ marginTop: 8 }}>INTENT — say what you're going for; it does it the normal way or flags it generative</div>
                              <div className="btnrow" style={{ gap: 5 }}>
                                <input className="in tiny grow" placeholder="'dreamlike flashback', 'punch in on the reaction', 'isolate her face'…"
                                  value={intentText} onChange={(e) => setIntentText(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && applyIntent(selClip)} />
                                <button className="minibtn" disabled={busy || !intentText.trim()} onClick={() => applyIntent(selClip)}><Wand2 size={11} /></button>
                              </div>
                              {fx.genNote && (
                                <div className="gennote">
                                  <span className="lbl" style={{ color: "#a855f7" }}>GENERATIVE INSTRUCTION</span>
                                  <div className="dim small">{fx.genNote}</div>
                                  <CopyBtn text={fx.genNote} small />
                                </div>
                              )}
                              <button className="ghost full" style={{ marginTop: 6 }} onClick={() => updateFx(selClip.id, { ...FX_DEFAULTS })}>RESET EFFECTS</button>
                            </>
                          );
                        })()}
                        {selClip.kind === "media" && String(selClip.trackId).startsWith("a") && (() => {
                          const a = prod?.mediaPool.find((x) => x.id === selClip.assetId);
                          return a?.url ? (
                            <>
                              <div className="insp-div" />
                              <button className="minibtn blue full" onClick={() => spatializeClip(selClip)}>
                                <Box size={12} /> SPATIALIZE AUDIO
                              </button>
                              <div className="dim small">Place this clip in 3D space (Eclipsa/IAMF) and bake an immersive mix back onto the timeline.</div>
                            </>
                          ) : null;
                        })()}
                        {licensingEnabled() && (() => {
                          const a = prod?.mediaPool.find((x) => x.id === selClip.assetId);
                          if (!a?.musicMeta) return null;
                          const cl = trackClearance(a.musicMeta, syncGrants, prod?.id, auth.currentUser?.uid);
                          const def = getLicense(cl.li.licenseId);
                          const statusText = cl.granted ? "Licensed for this project" : cl.cleared ? (cl.li.attribution ? "Cleared — credit required" : "Cleared for sync") : "Sync license required";
                          return (
                            <>
                              <div className="insp-div" />
                              <div className="lbl">LICENSE</div>
                              <div className="dim small" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                <span style={{ padding: "1px 6px", borderRadius: 4, fontWeight: 800, fontSize: 9, background: cl.cleared ? "rgba(61,220,132,0.16)" : "rgba(255,140,0,0.18)", color: cl.cleared ? "#7ee2a8" : "#ffb057" }}>{cl.granted ? "LICENSED" : cl.li.label}</span>
                                <span>{statusText}</span>
                              </div>
                              <div className="dim small" style={{ marginTop: 4 }}>{cl.cleared ? cl.li.human : cl.li.reason}</div>
                              {a.musicMeta.syncLicenseTerms && <div className="dim small" style={{ marginTop: 4, fontStyle: "italic" }}>{a.musicMeta.syncLicenseTerms}</div>}
                              {cl.needsLicense && <button className="minibtn blue full" style={{ marginTop: 6 }} onClick={() => licenseTrack(a.musicMeta)}>LICENSE FOR THIS PROJECT — ${cl.fee}</button>}
                              {def.url && cl.cleared && !cl.granted && <a className="dim small" style={{ color: "#7ee2a8", textDecoration: "underline" }} href={def.url} target="_blank" rel="noreferrer">View license deed</a>}
                            </>
                          );
                        })()}
                        <div className="insp-div" />
                        <button className="ghost danger full" onClick={() => { const n = clips.filter((c) => c.id !== selClip.id); setClips(n); commitClips(n); setSelClipId(null); }}><Trash2 size={12} /> REMOVE CLIP</button>
                      </div>
                    )}
                  </aside>
  );
  // ── Traditional menu bar (File · Edit · View · Clip · Help) ──
  const renderMenuBar = () => {
    const sel = getSel();
    const D = "—"; // divider marker
    const menus = {
      File: [
        { label: "New quick project", fn: createQuickProject },
        { label: "New edit (standalone timeline)", fn: () => newEdit() },
        { label: "Open a production…", fn: () => setPage("productions") },
        D,
        { label: "Import files…", fn: () => fileRef.current?.click() },
        { label: "Import folder…", fn: () => folderRef.current?.click() },
        D,
        { label: `Sync assets to cloud${unsyncedCount ? ` (${unsyncedCount})` : " ✓"}`, fn: () => syncAssetsToCloud() },
        D,
        { label: "Export EDL (CMX3600)", fn: exportEDL },
        { label: rendering ? "Rendering…" : "Render MP4", fn: doRenderMP4, disabled: rendering },
      ],
      Edit: [
        { label: "Undo", fn: undoEdit, hint: "⌘Z" },
        { label: "Redo", fn: redoEdit, hint: "⌘⇧Z" },
        D,
        { label: "Cut", fn: cutSel, hint: "⌘X", need: true },
        { label: "Copy", fn: copySel, hint: "⌘C", need: true },
        { label: "Paste", fn: pasteClip, hint: "⌘V", disabled: !clipboard },
        { label: "Duplicate", fn: duplicateSel, hint: "⌘D", need: true },
        D,
        { label: "Delete (leave gap)", fn: liftDelete, hint: "Del", need: true },
        { label: "Ripple delete", fn: rippleDelete, hint: "⇧Del", need: true },
      ],
      View: [
        { label: "Zoom in", fn: zoomIn, hint: "+" },
        { label: "Zoom out", fn: zoomOut, hint: "−" },
        { label: "Zoom to fit", fn: zoomFit },
        D,
        { label: `Snapping: ${snapOn ? "On" : "Off"}`, fn: () => setSnapOn((s) => !s) },
        D,
        ...[["media", "MEDIA"], ["edit", "EDIT"], ["vfx", "VFX"], ["color", "COLOR"], ["audio", "AUDIO"], ["deliver", "DELIVER"]].map(([id, lab]) => ({ label: `Workspace: ${lab}`, fn: () => setEditWs(id), active: editWs === id })),
        D,
        { label: "Keyboard shortcuts…", fn: () => setShowShortcuts(true) },
      ],
      Clip: [
        { label: "Split at playhead", fn: bladeAtPlayhead, hint: "S" },
        { label: "Add default transition", fn: addCrossDissolve, need: true },
        D,
        { label: "Mark In", fn: () => setMarkIn(playhead), hint: "I" },
        { label: "Mark Out", fn: () => setMarkOut(playhead), hint: "O" },
        D,
        { label: transcribing ? "Transcribing…" : "Transcribe clip", fn: () => transcribeClip(), need: true, disabled: transcribing },
        { label: sel?.disabled ? "Enable clip" : "Disable clip", fn: toggleDisable, need: true },
        D,
        { label: "Relink selected clip's media…", fn: () => { const c = getSel(); c?.assetId ? openRelink(c.assetId) : ping("Select a clip with media first."); } },
        { label: "Relink media from folder…", fn: () => openFolderRelink(poolSel.length ? poolSel : null) },
      ],
      Help: [
        { label: "Keyboard shortcuts…", fn: () => setShowShortcuts(true) },
        { label: "About Fabula", fn: () => ping("Fabula α — Plajah's AI film NLE") },
      ],
    };
    return (
      <div style={{ display: "flex", alignItems: "stretch", gap: 2, padding: "0 6px", height: 30, background: "rgba(10,8,14,0.9)", borderBottom: "1px solid rgba(255,255,255,0.08)", position: "relative", zIndex: 500, flexShrink: 0 }}>
        {Object.keys(menus).map((name) => (
          <div key={name} style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <button onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === name ? null : name); }} onMouseEnter={() => { if (menuOpen) setMenuOpen(name); }}
              style={{ padding: "0 10px", height: "100%", background: menuOpen === name ? "rgba(255,140,0,0.18)" : "none", border: "none", color: "#d8d8de", font: "600 12px system-ui", cursor: "pointer" }}>{name}</button>
            {menuOpen === name && (
              <div onMouseDown={(e) => e.stopPropagation()}
                style={{ position: "absolute", top: "100%", left: 0, minWidth: 232, background: "rgba(20,16,25,0.98)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", padding: "5px 0", zIndex: 501 }}>
                {menus[name].map((it, i) => it === D ? <div key={i} style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "4px 0" }} /> : (
                  <button key={i} disabled={it.disabled || (it.need && !sel)} onClick={() => { setMenuOpen(null); it.fn(); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 14px", background: "none", border: "none", color: "#e8e8ec", font: "500 12px system-ui", textAlign: "left", cursor: "pointer", opacity: (it.disabled || (it.need && !sel)) ? 0.4 : 1 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,140,0,0.16)")} onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                    <span style={{ flex: 1 }}>{it.active ? "● " : ""}{it.label}</span>{it.hint && <span style={{ opacity: 0.4, fontSize: 10 }}>{it.hint}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  // Media-pool right-click menu (acts on the current pool selection).
  const renderPoolCtx = () => {
    if (!poolCtx) return null;
    const ids = poolSel;
    const first = ids.length ? prod.mediaPool.find((a) => a.id === ids[0]) : null;
    const localN = (prod.mediaPool || []).filter((a) => ids.includes(a.id) && a.url && a.url.startsWith("blob:") && !a.cloudUrl).length;
    const offlineN = (prod.mediaPool || []).filter((a) => ids.includes(a.id) && (!a.url || a.offline)).length;
    const run = (fn) => { setPoolCtx(null); fn(); };
    const mi = (label, fn, opts = {}) => (
      <button disabled={opts.disabled} onClick={() => run(fn)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 14px", background: "none", border: "none", color: opts.danger ? "#ff8080" : "#e8e8ec", font: "500 12px system-ui", textAlign: "left", cursor: "pointer", opacity: opts.disabled ? 0.4 : 1 }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,140,0,0.16)")} onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>{label}</button>
    );
    const div = <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "4px 0" }} />;
    return (
      <div style={{ position: "fixed", left: Math.min(poolCtx.x, window.innerWidth - 232), top: Math.min(poolCtx.y, window.innerHeight - 330), zIndex: 9999, width: 224, background: "rgba(20,16,25,0.98)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", padding: "5px 0" }}
        onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
        <div style={{ padding: "4px 14px 6px", fontSize: 10, opacity: 0.5 }}>{ids.length} selected</div>
        {mi("Load & play", () => first && openInViewer(first, true), { disabled: !first })}
        {mi("Insert at playhead", () => ids.forEach((id) => { const a = prod.mediaPool.find((x) => x.id === id); if (a) insertAssetClip(a); }))}
        {div}
        {mi(`Relink from folder…${offlineN ? ` (${offlineN} offline)` : ""}`, () => openFolderRelink(ids))}
        {mi(`Sync to cloud${localN ? ` (${localN})` : ""}`, () => syncAssetsToCloud(ids), { disabled: !localN })}
        {div}
        {mi("Move to bin…", () => movePoolToBin(ids))}
        {mi("Remove from pool", () => deletePoolAssets(ids), { danger: true })}
      </div>
    );
  };
  /* ═══ BAND 2 · THE ROOM TOOL BAR ═══════════════════════════════
     Every workspace now opens with the same four bands: context bar (header) →
     TOOL BAR → work surface → control surface, then the page rail. Before this,
     only EDIT had a tool row and it lived INSIDE the timeline panel, so COLOR,
     VFX, AUDIO and DELIVER started with no chrome at all.

     Room verbs on the left, room-agnostic state on the right. Every verb here
     calls a handler the menu bar and the keyboard map already use — nothing new
     is wired, it is just reachable without opening a menu. */
  const renderRoomToolbar = () => {
    if (!prod || !container) return null;
    const canSplit = clips.some((c) => playhead > c.start && playhead < c.start + c.duration);
    const remoteVideo = (prod?.mediaPool || []).filter((a) => a.type === "video" && /^https?:/i.test(a.url || "")).length;
    const trimModes = [["normal", "NORMAL"], ["ripple", "RIPPLE"], ["roll", "ROLL"], ["slip", "SLIP"]];
    const toggleGuides = () => { const nv = !guides; setGuides(nv); try { localStorage.setItem("fabula:guides", nv ? "1" : "0"); } catch { /* */ } };
    const toggleFxLib = () => { const nv = !fxLibOpen; setFxLibOpen(nv); try { localStorage.setItem("fabula:fxlib", nv ? "1" : "0"); } catch { /* */ } };

    let verbs = null;
    let state = null;

    if (editWs === "media") {
      verbs = (
        <>
          <div className="tgrp">
            <button className="tbtn2" title="Import individual files" onClick={() => fileRef.current?.click()}><Upload size={11} /> FILES</button>
            <button className="tbtn2" title="Import a folder once — bins mirror its nested structure" onClick={() => editFolderRef.current?.click()}><FolderOpen size={11} /> FOLDER</button>
            <button className="tbtn2" title="Watch a folder — new files import automatically" onClick={addSyncFolderNow}><RefreshCw size={11} /> WATCH</button>
            <button className="tbtn2" style={{ borderColor: "rgba(224,69,155,0.45)", color: "#f0b8dd" }}
              title="Generate with a linked service — results land in a bin" onClick={() => setGenOpen(true)}><Sparkles size={11} /> GENERATE</button>
          </div>
          <span className="tdiv" />
          <div className="tgrp">
            <button className="tbtn2" title="Relink offline media from a folder" onClick={() => folderRelinkRef.current?.click()}>RELINK</button>
            <button className="tbtn2" disabled={!!proxyBusy || !remoteVideo}
              title="Build instant-seek proxies for remote video"
              onClick={() => buildProxiesFor((prod?.mediaPool || []).filter((a) => a.type === "video" && /^https?:/i.test(a.url || "")))}>
              {proxyBusy ? `PROXIES ${proxyBusy}` : `PROXIES${remoteVideo ? ` (${remoteVideo})` : ""}`}</button>
          </div>
        </>
      );
      state = (
        <>
          <span className="segx">
            <button className={poolView === "list" ? "on" : ""} onClick={() => { setPoolView("list"); try { localStorage.setItem("fabula:poolview", "list"); } catch { /* */ } }}>LIST</button>
            <button className={poolView === "thumbs" ? "on" : ""} onClick={() => { setPoolView("thumbs"); try { localStorage.setItem("fabula:poolview", "thumbs"); } catch { /* */ } }}>THUMBS</button>
          </span>
          <button className={`tbtn2 ${unsyncedCount ? "" : "ghost"}`} disabled={syncing} onClick={syncAssetsToCloud}
            title="Upload local media so this project opens on any device">
            ☁ {syncing ? "SYNCING…" : unsyncedCount ? `SYNC (${unsyncedCount})` : "SYNCED"}</button>
        </>
      );
    } else if (editWs === "edit") {
      verbs = (
        <>
          <div className="tgrp">
            <button className={`tbtn2 ${toolMode === "select" ? "on" : ""}`} title="Select / move tool (A)"
              onClick={() => setToolMode("select")}><MousePointer2 size={11} /></button>
            <button className={`tbtn2 ${toolMode === "razor" ? "on" : ""}`} title="Razor — click a clip to cut it (B)"
              onClick={() => setToolMode(toolMode === "razor" ? "select" : "razor")}><Scissors size={11} /></button>
          </div>
          <span className="tdiv" />
          <div className="tgrp">
            <span className="cap" style={{ marginRight: 3 }}>TRIM</span>
            <span className="segx">
              {trimModes.map(([id, lab]) => (
                <button key={id} className={trimMode === id ? "on" : ""} title={`${lab} trim`} onClick={() => setTrimMode(id)}>{lab}</button>
              ))}
            </span>
          </div>
          <span className="tdiv" />
          <div className="tgrp">
            <button className="tbtn2" title="Split clip at playhead (B)" disabled={!canSplit} onClick={() => bladeAtPlayhead()}><Scissors size={11} /> SPLIT</button>
            <button className="tbtn2" title="Mark In (I)" onClick={() => setMarkIn(playhead)}><FlagTriangleRight size={11} /> IN</button>
            <button className="tbtn2" title="Mark Out (O)" onClick={() => setMarkOut(playhead)}><FlagTriangleLeft size={11} /> OUT</button>
            <button className="tbtn2" title="Clear In/Out" disabled={markIn == null && markOut == null}
              onClick={() => { setMarkIn(null); setMarkOut(null); }}><X size={11} /></button>
            <button className="tbtn2 danger" title="Ripple-delete In→Out (closes the gap)"
              disabled={markIn == null || markOut == null || markOut <= markIn}
              onClick={() => rippleDeleteRange(markIn, markOut)}><Trash2 size={11} /> RIPPLE</button>
          </div>
          <span className="tdiv" />
          <div className="tgrp">
            <button className="tbtn2" title="Add the default transition at the nearest cut (Ctrl+T)" disabled={!selClip}
              onClick={addCrossDissolve}><Wand2 size={11} /> TRANS</button>
            <button className="tbtn2" title="Add a marker at the playhead (M)" onClick={addMarkerAtPlayhead}>MARKER</button>
            <button className="tbtn2" title="Duplicate the selected clip (Ctrl+D)" disabled={!selClip} onClick={duplicateSel}>DUPE</button>
          </div>
          <span className="tdiv" />
          <div className="tgrp">
            <button className="tbtn2 ghost" title="Undo (Ctrl+Z)" onClick={undoEdit}>↶</button>
            <button className="tbtn2 ghost" title="Redo (Ctrl+Shift+Z)" onClick={redoEdit}>↷</button>
          </div>
        </>
      );
      state = (
        <>
          <button className={`tbtn2 ${snapOn ? "on" : "ghost"}`} title="Snapping (N)" onClick={() => setSnapOn((v) => !v)}>SNAP</button>
          <button className={`tbtn2 ${guides ? "on" : "ghost"}`} title="Action / title-safe guides — overlay only, never exported" onClick={toggleGuides}>SAFE</button>
          <button className={`tbtn2 ${fxLibOpen ? "on" : "ghost"}`} title="Effects library" onClick={toggleFxLib}>⚡ FX</button>
        </>
      );
    } else if (editWs === "vfx") {
      verbs = (
        <>
          <div className="tgrp">
            <button className="tbtn2" title="Effects library — filters, generators, Lottie" onClick={toggleFxLib}><Sparkles size={11} /> FX LIBRARY</button>
            <button className="tbtn2" title="Import a Lottie / .lottie animation" onClick={() => fileRef.current?.click()}><Upload size={11} /> LOTTIE</button>
          </div>
          <span className="tdiv" />
          <div className="tgrp">
            <span className="cap">COMP</span>
            <span className="chip dimchip">LAYER STACK</span>
          </div>
        </>
      );
      state = (
        <>
          <button className={`tbtn2 ${guides ? "on" : "ghost"}`} title="Action / title-safe guides" onClick={toggleGuides}>SAFE</button>
          <span className="numval">{fmtTc(playhead, vfmt)}</span>
        </>
      );
    } else if (editWs === "color") {
      const gradeKeys = ["bri", "con", "sat", "hue", "warm", "blur", "wheel"];
      verbs = (
        <>
          <div className="tgrp">
            <button className="tbtn2" title="Copy this clip's grade" disabled={!selClip}
              onClick={() => { if (!selClip) return; const fx = ensureFx(selClip); const g = {}; gradeKeys.forEach((k) => { g[k] = fx[k]; }); window.__fabGrade = g; ping("Grade copied"); }}>⧉ COPY GRADE</button>
            <button className="tbtn2" title="Paste the copied grade onto this clip" disabled={!selClip || !window.__fabGrade}
              onClick={() => { if (selClip && window.__fabGrade) { updateFx(selClip.id, { ...window.__fabGrade }); ping("Grade pasted"); } }}>⧊ PASTE</button>
            <button className="tbtn2" title="Paste the copied grade onto every selected clip" disabled={selIds.length < 2 || !window.__fabGrade}
              onClick={() => { if (selIds.length > 1 && window.__fabGrade) { applyClips(clips.map((c) => (selIds.includes(c.id) ? { ...c, fx: { ...ensureFx(c), ...window.__fabGrade } } : c))); ping(`Grade → ${selIds.length} clips`); } }}>PASTE → SELECTED</button>
          </div>
          <span className="tdiv" />
          <div className="tgrp">
            <button className="tbtn2 danger" title="Reset this clip's grade" disabled={!selClip}
              onClick={() => selClip && updateFx(selClip.id, { bri: 1, con: 1, sat: 1, hue: 0, warm: 0, blur: 0, wheel: undefined })}>RESET</button>
          </div>
        </>
      );
      state = (
        <>
          {prod.design?.lookId && <span className="chip amb">{(LOOKS.find((l) => l.id === prod.design.lookId) || {}).name}</span>}
          <button className={`tbtn2 ${guides ? "on" : "ghost"}`} title="Action / title-safe guides" onClick={toggleGuides}>SAFE</button>
          <span className="numval">{fmtTc(playhead, vfmt)}</span>
        </>
      );
    } else if (editWs === "audio") {
      const aClips = clips.filter((c) => c.trackId?.startsWith("a"));
      verbs = (
        <>
          <div className="tgrp">
            <button className={`tbtn2 ${playing ? "on" : ""}`} title="Play / pause (Space)" onClick={() => setPlaying((v) => !v)}>
              {playing ? <Pause size={11} /> : <Play size={11} />}</button>
            <button className="tbtn2" title="Go to start (Home)" onClick={() => setPlayhead(0)}><SkipBack size={11} /></button>
          </div>
          <span className="tdiv" />
          <div className="tgrp">
            <button className="tbtn2" title="Non-destructive clean-up on the selected clip" disabled={!selClip}
              onClick={() => selClip && openAudioEditor(selClip)}><SlidersHorizontal size={11} /> CLEAN-UP</button>
            <button className="tbtn2" title="Isolate vocals + music onto their own tracks" disabled={!selClip || stemBusy}
              onClick={() => selClip && splitClipStems(selClip, "vocals-music")}><Mic2 size={11} /> STEMS</button>
          </div>
        </>
      );
      state = (
        <>
          <span className="chip dimchip">{aClips.length} AUDIO CLIPS</span>
          <span className="numval">{fmtTc(playhead, vfmt)}</span>
        </>
      );
    } else if (editWs === "deliver") {
      const rangeReady = deliverRange === "all" || (deliverRange === "inout" ? (markIn != null && markOut != null && markOut > markIn) : markers.length > 0);
      verbs = (
        <>
          <div className="tgrp">
            <span className="cap" style={{ marginRight: 3 }}>RANGE</span>
            <span className="segx">
              <button className={deliverRange === "all" ? "on" : ""} onClick={() => setDeliverRange("all")}>WHOLE</button>
              <button className={deliverRange === "inout" ? "on" : ""} disabled={markIn == null || markOut == null} onClick={() => setDeliverRange("inout")}>IN→OUT</button>
              <button className={deliverRange === "markers" ? "on" : ""} disabled={!markers.length} onClick={() => setDeliverRange("markers")}>EACH MARKER</button>
            </span>
          </div>
          <span className="tdiv" />
          <div className="tgrp">
            <span className="cap" style={{ marginRight: 3 }}>QUEUE</span>
            <button className="tbtn2" disabled={!rangeReady} title="Add MP4 render job(s) for the chosen range" onClick={() => addToQueue("mp4")}>＋ MP4</button>
            <button className="tbtn2" title="Add an FCPXML job (whole cut)" onClick={() => addToQueue("fcpxml")}>＋ FCPXML</button>
            <button className="tbtn2" title="Add an EDL job (whole cut)" onClick={() => addToQueue("edl")}>＋ EDL</button>
          </div>
          <span className="tdiv" />
          <div className="tgrp">
            <button className="tbtn2 on" disabled={rendering} title="Render the whole timeline to MP4 now" onClick={doRenderMP4}>
              <Film size={11} /> {rendering ? `RENDERING ${Math.round(renderPct * 100)}%` : "RENDER NOW"}</button>
          </div>
        </>
      );
      state = (
        <>
          {renderQueue.some((j) => j.status === "queued") && <span className="chip amb">{renderQueue.filter((j) => j.status === "queued").length} QUEUED</span>}
          <span className="chip dimchip">{vfmt.label} · {vfmt.w}×{vfmt.h}</span>
          <span className="numval">{fmtTc(seqEnd, vfmt)}</span>
        </>
      );
    }

    return (
      <div className="roomtool" role="toolbar" aria-label={`${editWs} tools`}>
        <span className="troom">{editWs}</span>
        <span className="tdiv" />
        {verbs}
        <div className="tstate">{state}</div>
      </div>
    );
  };

  const renderTimeline = () => (
<>
                <div className="tl-resize" title="Drag to resize the timeline" onMouseDown={startTlResize} />
                {tlMarquee && <div style={{ position: "fixed", left: Math.min(tlMarquee.x0, tlMarquee.x1), top: Math.min(tlMarquee.y0, tlMarquee.y1), width: Math.abs(tlMarquee.x1 - tlMarquee.x0), height: Math.abs(tlMarquee.y1 - tlMarquee.y0), border: "1px solid #FF8C00", background: "rgba(255,140,0,0.12)", zIndex: 9998, pointerEvents: "none" }} />}
<div className="tlwrap glass-dark" style={{ height: tlHeight }}>
                  <div className="tl-tools">
                    {/* Room VERBS live in the page tool band (renderRoomToolbar) — what stays
                        here is timeline-scoped VIEW state: what is in it and how it is displayed. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="cap">TIMELINE</span>
                      <span className="dim small numval">{clips.length} CLIPS</span>
                      {markIn != null && markOut != null && markOut > markIn && (
                        <span className="chip amb">IN → OUT {fmtTc(markOut - markIn, vfmt)}</span>
                      )}
                      {markers.length > 0 && <span className="chip dimchip">{markers.length} MARKERS</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
                      <button className="minibtn" onClick={() => setFormatOpen(!formatOpen)} title="Project format">
                        {vfmt.label} · {vfmt.w}×{vfmt.h} · {vfmt.fps}{vfmt.drop ? " DF" : ""}
                      </button>
                      {formatOpen && (
                        <div className="fmtpanel glass-dark">
                          <div className="lbl">RESOLUTION — industry presets to 4K; beyond is custom</div>
                          <div className="fmtgrid">
                            {RES_PRESETS.map((r) => (
                              <button key={r.id} className={`fmtbtn ${vfmt.preset === r.id ? "on" : ""}`}
                                onClick={() => setFormat(r.id === "custom" ? { preset: "custom", label: "CUSTOM" } : { preset: r.id, label: r.label, w: r.w, h: r.h })}>
                                <b>{r.label}</b><span>{r.id === "custom" ? "any size / rate" : `${r.w}×${r.h}`}</span>
                              </button>
                            ))}
                          </div>
                          {vfmt.preset === "custom" && (
                            <div className="row3" style={{ marginTop: 8 }}>
                              <input className="in tiny" type="number" value={vfmt.w} onChange={(e) => setFormat({ w: parseInt(e.target.value) || 0 })} placeholder="width" />
                              <input className="in tiny" type="number" value={vfmt.h} onChange={(e) => setFormat({ h: parseInt(e.target.value) || 0 })} placeholder="height" />
                              <input className="in tiny" type="number" step="0.001" value={vfmt.fps} onChange={(e) => setFormat({ fps: parseFloat(e.target.value) || 24 })} placeholder="fps" />
                            </div>
                          )}
                          <div className="lbl" style={{ marginTop: 10 }}>FRAME RATE</div>
                          <div className="fmtfps">
                            {FPS_OPTIONS.map((f) => (
                              <button key={f} className={`fmtbtn sm ${Math.abs(vfmt.fps - f) < 0.001 && vfmt.preset !== "custom" ? "on" : ""}`}
                                disabled={vfmt.preset === "custom"} onClick={() => setFormat({ fps: f })}>{f}</button>
                            ))}
                          </div>
                          <label className={`dfrow ${isDropCapable(vfmt.fps) ? "" : "off"}`}>
                            <input type="checkbox" disabled={!isDropCapable(vfmt.fps)} checked={!!vfmt.drop}
                              onChange={(e) => setFormat({ drop: e.target.checked })} />
                            DROP-FRAME TIMECODE (29.97 / 59.94 — broadcast standard, “;” separator)
                          </label>
                          <button className="minibtn full" style={{ marginTop: 8 }} onClick={() => setFormatOpen(false)}>DONE</button>
                        </div>
                      )}
                      <div className="zoomer">
                        <span className="dim small">ZOOM</span>
                        <input type="range" min="0.1" max="4" step="0.05" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} />
                        <button className="minibtn" title="Zoom to fit the whole sequence" onClick={zoomFit}>FIT</button>
                        <button className={`minibtn ${followPlayhead ? "blue" : ""}`} title="Automatically keep the playhead in view" onClick={() => setFollowPlayhead((v) => { const n = !v; try { localStorage.setItem('fabula:timeline:follow', n ? '1' : '0'); } catch {} return n; })}>FOLLOW</button>
                      </div>
                    </div>
                  </div>
                      <div className="tl-commandbar" role="toolbar" aria-label="Timeline editing tools" style={{ display: "flex", gap: 6, padding: "5px 8px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <button className="minibtn" onClick={() => addTrack("video")} title="Add a video track (no limit)"><Film size={10} /> + VIDEO</button>
                        <button className="minibtn" onClick={() => addTrack("audio")} title="Add an audio track (no limit)"><Music size={10} /> + AUDIO</button>
                        <button className="minibtn" onClick={() => addTrack("subtitle")} title="Add a subtitle/caption track"><Captions size={10} /> + SUBS</button>
                        <button className="minibtn" onClick={addSubtitle} title="Add a subtitle clip at the playhead"><Type size={10} /> + SUBTITLE</button>
                        <button className="minibtn" onClick={addTitle} title="Add a plain title at the playhead"><Type size={10} /> + TITLE</button>
                        <button className="minibtn" onClick={() => setLtGallery("add")} title="Add an editable lower third or full-page shader motion graphic"><Type size={10} /> + MOTION GFX</button>
                        <span style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />
                        {["normal", "ripple", "roll", "slip"].map((m) => (
                          <button key={m} className="minibtn" onClick={() => setTrimMode(m)} title={`Trim mode: ${m} — ripple shifts downstream, roll moves the cut, slip shifts content`} style={{ opacity: trimMode === m ? 1 : 0.5, color: trimMode === m ? "#FF8C00" : undefined }}>{m.toUpperCase()}</button>
                        ))}
                        <button className="minibtn" onClick={() => setSnapOn((s) => !s)} title="Toggle snapping (N)" style={{ opacity: snapOn ? 1 : 0.45 }}><Box size={10} /> SNAP {snapOn ? "ON" : "OFF"}</button>
                        <button className="minibtn" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts — map your own (Ctrl+Alt+K)"><Keyboard size={10} /> KEYS</button>
                        <span style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />
                        <button className="minibtn" title="Preview indexed worker decoding; unsupported sources automatically use compatibility playback" onClick={() => { setIndexedMode(!indexedMode); localStorage.setItem("fabula:decoder", indexedMode ? "compat" : "indexed"); }}>DECODER {indexedMode ? "INDEXED · PREVIEW" : "COMPAT"}</button>
                        <button className="minibtn" title="Monitor plays 540p instant-seek proxies (export always full-res)" style={{ opacity: proxyOn ? 1 : 0.45, color: proxyOn && proxies.size ? "#7ee2a8" : undefined }}
                          onClick={() => { const nv = !proxyOn; setProxyOn(nv); try { localStorage.setItem("fabula:proxy", nv ? "1" : "0"); } catch { /* */ } }}>PROXY {proxyOn ? "ON" : "OFF"}{proxies.size ? ` · ${proxies.size}✓` : ""}</button>
                        {(() => { const missing = (prod?.mediaPool || []).filter((a) => a.type === "video" && /^https?:/i.test(a.url || "") && !proxies.has(a.id)).length; return (
                          <button className="minibtn" disabled={!!proxyBusy || !missing} title="Build instant-seek proxies for REMOTE video (local originals already play full-res). Runs automatically in the background too."
                            onClick={() => buildProxiesFor((prod?.mediaPool || []).filter((a) => a.type === "video" && /^https?:/i.test(a.url || "")))}>{proxyBusy ? `⚙ ${proxyBusy}` : `BUILD PROXIES${missing ? ` (${missing})` : " ✓"}`}</button>
                        ); })()}
                        <button className="minibtn" disabled={scriptBuilding || !clips.length} title="Reverse-engineer the screenplay from this edit: every clip is watched (computer vision) + transcribed, dialogue is tagged to your cast, and the scene + SLATE shot list are rebuilt from the cut"
                          onClick={buildScriptFromTimeline} style={{ color: scriptBuilding ? "#FF8C00" : undefined }}>{scriptBuilding ? "📜 BUILDING…" : "📜 BUILD SCRIPT FROM TIMELINE"}</button>
                      </div>
                  <div className="tl-scroll" ref={tlScrollRef}>
                    <div className="tl-inner" style={{ width: Math.max(900, (seqEnd + 20) * pxPerSec + 128) }} onMouseDown={startTlMarquee}>
                      {/* ruler */}
                      <div className="ruler">
                        <div className="trackhead rh"><span className="phdot" /></div>
                        <div className="ruler-track" onMouseDown={startScrub} style={{ cursor: "ew-resize" }}>
                          {Array.from({ length: Math.ceil((seqEnd + 22)) }).map((_, i) => (
                            <span key={i} className="tick" style={{ left: i * pxPerSec }}>{i % (zoom < 0.8 ? 5 : 2) === 0 ? "00:" + String(i).padStart(2, "0") : ""}</span>
                          ))}
                          {markIn != null && markOut != null && markOut > markIn && (
                            <div className="inout" style={{ left: markIn * pxPerSec, width: (markOut - markIn) * pxPerSec }} />
                          )}
                          {markers.map((m) => (
                            <span key={m.id} className="mk" style={{ left: m.t * pxPerSec }} title="Click: go to marker · Double-click: remove"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); setPlayhead(m.t); }}
                              onDoubleClick={(e) => { e.stopPropagation(); setMarkers((cur) => cur.filter((x) => x.id !== m.id)); }} />
                          ))}
                        </div>
                      </div>
                      {/* playhead line — driven imperatively during playback (zero re-renders) */}
                      <div ref={phlineRef} className="phline" style={{ left: 128 + playhead * pxPerSec }} />
                      {/* tracks — clips render only within ±1 screen of the scroll viewport */}
                      {tracks.map((tr) => (
                        <Fragment key={tr.id}>
                        <div className={`track ${tr.type} ${tr.id === "v1" ? "primary" : ""}`}>
                          <div className={`trackhead ${tr.type}`}>
                            <div className="thname">
                              {tr.type === "video" ? <Film size={10} /> : tr.type === "subtitle" ? <Captions size={10} /> : <Music size={10} />}
                              <span className="thlabel">{tr.name}</span>
                            </div>
                            {tr.type === "audio" && (() => {
                              const ts = (container.timeline?.trackSettings || {})[tr.id] || {};
                              const vol = ts.vol == null ? 1 : ts.vol, pan = ts.pan || 0, mute = !!ts.mute;
                              return (
                                <div className="trkstrip">
                                  <div className="trkctrls">
                                    <button className={`trkmute ${mute ? "on" : ""}`} title={mute ? "Unmute track" : "Mute track"} onClick={(e) => { e.stopPropagation(); setTrackSetting(tr.id, { mute: !mute }); }}>M</button>
                                    <div className="trkfaders">
                                      <label title={`Volume ${Math.round(vol * 100)}%`}><span>V</span><input type="range" min="0" max="1.5" step="0.01" value={vol} onChange={(e) => setTrackSetting(tr.id, { vol: parseFloat(e.target.value) })} onMouseDown={(e) => e.stopPropagation()} /></label>
                                      <label title={`Pan ${pan === 0 ? "Center" : pan < 0 ? "L" + Math.round(-pan * 100) : "R" + Math.round(pan * 100)}`}><span>P</span><input type="range" min="-1" max="1" step="0.02" value={pan} onChange={(e) => setTrackSetting(tr.id, { pan: parseFloat(e.target.value) })} onMouseDown={(e) => e.stopPropagation()} onDoubleClick={() => setTrackSetting(tr.id, { pan: 0 })} /></label>
                                    </div>
                                  </div>
                                  <TrackMeter trackId={tr.id} />
                                </div>
                              );
                            })()}
                          </div>
                          <div className="trackbody"
                            onDragOver={(e) => { if (dragAssetRef.current) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                            onDrop={(e) => {
                              const d = dragAssetRef.current; if (!d) return;
                              e.preventDefault();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const at = Math.max(0, (e.clientX - rect.left) / pxPerSec);
                              insertAssetClip(d.asset, d.range, { at, trackId: tr.id });
                              dragAssetRef.current = null;
                            }}>
                            {clips.filter((c) => {
                              if (c.trackId !== tr.id) return false;
                              // virtualization: skip clips more than a screen-width outside the viewport
                              const vis0 = (tlView.left - 128 - tlView.width) / pxPerSec;
                              const vis1 = (tlView.left + tlView.width * 2) / pxPerSec;
                              return c.start + c.duration > vis0 && c.start < vis1;
                            }).map((c) => {
                              const shot = c.shotId ? scene?.shots.find((s) => s.id === c.shotId) : null;
                              const sel = selClipId === c.id || selIds.includes(c.id);
                              const cAsset = c.assetId ? prod?.mediaPool?.find((m) => m.id === c.assetId) : null;
                              const noMedia = !!c.assetId && (!cAsset || !cAsset.url || cAsset.offline);
                              const wfUrl = (tr.type === "audio" || c.kind === "voice") && c.assetId ? (cAsset?.url) : null;
                              return (
                                <div key={c.id} data-cid={c.id}
                                  className={`clip ${c.kind} ${tr.type === "video" ? "vid" : ""} ${sel ? "sel" : ""} ${shot?.status === "ready" ? "rdy" : ""} ${noMedia ? "nomedia" : ""}`}
                                  style={{ left: c.start * pxPerSec, width: Math.max(8, c.duration * pxPerSec), opacity: c.disabled ? 0.4 : 1, cursor: toolMode === "razor" ? "crosshair" : undefined }}
                                  onMouseDown={(e) => { if (toolMode === "razor") { e.stopPropagation(); razorAt(e, c.id); return; } onClipDown(e, c.id, "move"); }}
                                  onClick={(e) => { e.stopPropagation(); if (toolMode !== "razor") { setSelClipId(c.id); if(cAsset) { setPoolSel([cAsset.id]); openInViewer(cAsset,false); } } }}
                                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSelClipId(c.id); clipMenu.openAt(e.clientX, e.clientY, c.id); }}
                                  onDoubleClick={(e) => { e.stopPropagation(); if (toolMode !== "razor") openNested(c); }}>
                                  {shot?.frameUrl && c.kind !== "voice" && <img className="clipframe" src={shot.frameUrl} alt="" />}
                                  <div className="cliplabel">
                                    {c.kind === "script" && <Clapperboard size={9} />}
                                    {c.kind === "voice" && <Music size={9} />}
                                    {c.kind === "media" && <Film size={9} />}
                                    <span>{c.label}</span>
                                  </div>
                                  {wfUrl && <div className="clipwave"><Waveform url={wfUrl} srcIn={c.srcIn} duration={c.duration} /></div>}
                                  {tr.type === "video" && c.fx?.trans?.dur > 0 && (
                                    <div className={`transwedge ${c.fx.trans.type}`} style={{ width: Math.min(Math.max(10, c.fx.trans.dur * pxPerSec), Math.max(8, c.duration * pxPerSec)) }}
                                      title={`${({ dip: "Dip to black", wipe: "Wipe", blur: "Blur dissolve" }[c.fx.trans.type]) || "Cross dissolve"} · ${c.fx.trans.dur.toFixed(1)}s — click: change type · drag: length`}
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        const x0 = e.clientX, d0 = c.fx.trans.dur; let moved = false;
                                        const mv = (ev) => { const dd = (ev.clientX - x0) / pxPerSec; if (Math.abs(ev.clientX - x0) > 3) moved = true; setTransitionDur(c.id, d0 + dd); };
                                        const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); if (!moved) cycleTransition(c.id); };
                                        window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
                                      }}>
                                      <span>{({ dip: "▽", wipe: "▶", blur: "≈" }[c.fx.trans.type]) || "✕"}</span>
                                    </div>
                                  )}
                                  <div className="trimL" onMouseDown={(e) => onClipDown(e, c.id, "start")} />
                                  <div className="trimR" onMouseDown={(e) => onClipDown(e, c.id, "end")} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {/* ── KEYFRAME LANE (Mockup C) — the selected clip opens a lane under its
                            track: one row per animated parameter, diamonds you drag along the ruler.
                            Click a diamond seeks; drag moves the key; double-click removes it. ── */}
                        {selClip && selClip.trackId === tr.id && kfIsAnimated(ensureFx(selClip)) && (() => {
                          const kfx = ensureFx(selClip);
                          const animParams = KF_ALL.filter((k) => kfHasKeys(kfx.kf?.[k]));
                          if (!animParams.length) return null;
                          const moveKey = (param, oldT, e0) => {
                            e0.stopPropagation();
                            const x0 = e0.clientX; let moved = false;
                            const track = kfx.kf[param];
                            const key = track.find((k) => Math.abs(k.t - oldT) < 1e-3);
                            if (!key) return;
                            const mv = (ev) => {
                              const dt = (ev.clientX - x0) / pxPerSec;
                              if (Math.abs(ev.clientX - x0) > 3) moved = true;
                              const nt = Math.max(0, Math.min(selClip.duration, oldT + dt));
                              const cur = ensureFx(clips.find((c) => c.id === selClip.id) || selClip);
                              const nkf = { ...(cur.kf || {}) };
                              nkf[param] = kfAddKey(kfRemoveKey(cur.kf?.[param], key.__t ?? oldT), nt, key.v, key.ease);
                              key.__t = nt; // track the live position across the drag
                              updateFx(selClip.id, { kf: nkf });
                            };
                            const up = () => {
                              window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
                              if (!moved) setPlayhead(selClip.start + (key.__t ?? oldT));
                              delete key.__t;
                            };
                            window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
                          };
                          return (
                            <div className="kflane">
                              <div className="kflhead">
                                <span className="cap" style={{ color: "rgba(168,85,247,.8)" }}>KEYFRAMES</span>
                                <span className="chip pur" style={{ alignSelf: "flex-start", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selClip.label}</span>
                              </div>
                              <div className="kflbody">
                                {animParams.map((param) => (
                                  <div className="kflrow" key={param}>
                                    <em>{(KF_PARAMS.find((p2) => p2.key === param) || { label: param }).label}</em>
                                    <span className="kflline" style={{ left: selClip.start * pxPerSec, width: selClip.duration * pxPerSec }} />
                                    {(kfx.kf[param] || []).map((k, ki) => (
                                      <s key={ki} className="kfldia" style={{ left: (selClip.start + k.t) * pxPerSec - 4 }}
                                        title={`${k.v.toFixed(2)} @ ${k.t.toFixed(2)}s — drag to move · double-click to remove`}
                                        onMouseDown={(e) => moveKey(param, k.t, e)}
                                        onDoubleClick={(e) => {
                                          e.stopPropagation();
                                          const cur = ensureFx(clips.find((c) => c.id === selClip.id) || selClip);
                                          const nkf = { ...(cur.kf || {}) };
                                          const t2 = kfRemoveKey(cur.kf?.[param], k.t);
                                          if (t2.length) nkf[param] = t2; else delete nkf[param];
                                          updateFx(selClip.id, { kf: Object.keys(nkf).length ? nkf : undefined });
                                        }} />
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                        </Fragment>
                      ))}
                      {showShortcuts && <KeyboardShortcutsEditor onClose={() => setShowShortcuts(false)} onChange={setShortcutPrefs} />}
                      {clipMenu.node}
                    </div>
                  </div>
                </div>
</>
  );

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="studio" onMouseMove={onTimelineMove} onMouseUp={onTimelineUp}>
      <style>{CSS}</style>
      {/* MonitorLayer owns the upcoming decoder. Extra hidden warmers competed
          with it for decode resources without supplying reusable decoded frames. */}
      {audioEdit && (
        <AudioEditor clip={audioEdit.clip} url={audioEdit.url} blob={audioEdit.blob}
          clipAudio={clips.find((c) => c.id === audioEdit.clip.id)?.audio || ensureAudio(audioEdit.clip)}
          onChange={(clean) => updateClipAudio(audioEdit.clip.id, { clean })}
          onClose={() => setAudioEdit(null)} />
      )}
      {genOpen && (
        <GeneratePanel projectId={prod?.id || "local"} bins={binTree()}
          defaultBin={binFilter !== "all" ? binFilter : ""} context={genCtx}
          importResults={importGenResults} onClose={() => { setGenOpen(false); setGenCtx(null); }} />
      )}
      {exportReady && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget && !publishing) setExportReady(null); }}>
          <div className="glass-dark" style={{ width: 400, maxWidth: "92vw", borderRadius: 14, padding: 16, border: "1px solid rgba(255,140,0,0.25)" }}>
            {exportReady.done ? (
              // ── PUBLISHED — offer a real deep-link into Reello playback (not a generic feed) ──
              <>
                <div className="paneltitle">✅ PUBLISHED
                  <span className="dim small" style={{ marginLeft: 8, letterSpacing: 0 }}>“{exportReady.name}” is live</span>
                </div>
                <div className="dim small" style={{ margin: "8px 0 12px" }}>Your cut is on its way to the destinations you picked. Jump straight to it:</div>
                <div className="btnrow" style={{ gap: 6, flexDirection: "column" }}>
                  {exportReady.reelloId && (
                    <button className="cta full" onClick={() => { window.dispatchEvent(new CustomEvent("NAVIGATE", { detail: { target: "RELLO", params: { videoId: exportReady.reelloId } } })); setExportReady(null); }}>
                      <Play size={13} /> WATCH ON REELLO
                    </button>
                  )}
                  {exportReady.taleoId && (
                    <button className="minibtn" style={{ justifyContent: "center", padding: 11 }} onClick={() => { window.dispatchEvent(new CustomEvent("NAVIGATE", { detail: { target: "MOVIES_TV" } })); setExportReady(null); }}>
                      <Film size={12} /> OPEN IN TALEO
                    </button>
                  )}
                  <button className="minibtn" style={{ justifyContent: "center", padding: 11 }} onClick={() => setExportReady(null)}>DONE</button>
                </div>
              </>
            ) : (
              <>
                <div className="paneltitle">🎬 EXPORT READY
                  <span className="dim small" style={{ marginLeft: 8, letterSpacing: 0 }}>{(exportReady.blob.size / 1e6).toFixed(1)} MB · one file, sent where you check</span>
                </div>
                <div className="lbl">TITLE</div>
                <input className="in" value={exportReady.name} onChange={(e) => setExportReady((x) => ({ ...x, name: e.target.value }))} />
                {renderDestinations()}
                <div className="btnrow" style={{ gap: 6, marginTop: 12 }}>
                  <button className="cta grow" disabled={publishing || (!pubReello && !pubFabula && !pubTaleo && !pubDownload)} onClick={finishExport}>
                    {publishing ? "PUBLISHING…" : "EXPORT"}
                  </button>
                  <button className="minibtn" disabled={publishing} onClick={() => setExportReady(null)}>CANCEL</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ───── animated splash ───── */}
      {splash && (
        <div className={`splash ${splashOut ? "out" : ""}`} onClick={skipSplash} title="Click to skip">
          <div className="sp-stage">
            <svg viewBox="0 0 96 96" className="sp-mark" fill="none">
              {/* the world draws itself */}
              <path className="sp-circle" d="M 65 42 A 25 25 0 1 0 40 67"
                pathLength="100" stroke="#f97316" strokeWidth="11" strokeLinecap="round" />
              {/* the telling unspools as one continuous strip */}
              <line className="sp-strip" x1="40" y1="67" x2="83" y2="67"
                pathLength="100" stroke="#f97316" strokeWidth="11" strokeLinecap="round" />
              {/* ...then the cut: the strip snaps into two clips */}
              <line className="sp-clip1" x1="40" y1="67" x2="59" y2="67"
                stroke="#f97316" strokeWidth="11" strokeLinecap="round" />
              <line className="sp-clip2" x1="72" y1="67" x2="83" y2="67"
                stroke="#f97316" strokeWidth="11" strokeLinecap="round" />
            </svg>
            <div className="sp-word">FABULA</div>
            <div className="sp-tag">WORLD FIRST. CUT SECOND.</div>
          </div>
        </div>
      )}


      {/* ambient blobs */}
      <div className="blob b1" /><div className="blob b2" /><div className="b3" />

      {/* ───── header ───── */}
      <header className="hdr glass">
        <div className="brand">
          <svg viewBox="0 0 96 96" className="brandmark" fill="none" aria-label="Fabula mark">
            <path d="M 65 42 A 25 25 0 1 0 40 67" stroke="#f97316" strokeWidth="13" strokeLinecap="round" />
            <line x1="40" y1="67" x2="59" y2="67" stroke="#f97316" strokeWidth="13" strokeLinecap="round" />
            <line x1="72" y1="67" x2="83" y2="67" stroke="#f97316" strokeWidth="13" strokeLinecap="round" />
          </svg>
          <span className="brand-main">FABULA</span>
          <span className="brand-tag">THE WHOLE STORY, THEN THE TELLING</span>
        </div>
        {prod && (
          <div className="hdr-mid">
            <button className="hdr-prod" onClick={() => { setPage("productions"); }}>{prod.title}</button>
            {(page === "slate" || page === "edit") && (
              <select className="scene-pick"
                value={editSel ? "edit|" + editSel : sceneSel ? "scene|" + sceneSel.actId + "|" + sceneSel.sceneId : ""}
                onChange={(e) => {
                  const parts = e.target.value.split("|");
                  if (parts[0] === "scene") { setSceneSel({ actId: parts[1], sceneId: parts[2] }); setEditSel(null); }
                  else if (parts[0] === "edit") { setEditSel(parts[1]); setSceneSel(null); }
                }}>
                <option value="">— select scene or edit —</option>
                {allScenes.length > 0 && <optgroup label="SCENES">
                  {allScenes.map(({ actId, act, scene: s }) => (
                    <option key={s.id} value={"scene|" + actId + "|" + s.id}>{act.title} / {s.title}{s.slugline ? " — " + s.slugline : ""}</option>
                  ))}
                </optgroup>}
                {(prod.edits || []).length > 0 && <optgroup label="EDITS (standalone)">
                  {prod.edits.map((ed) => <option key={ed.id} value={"edit|" + ed.id}>{ed.title}</option>)}
                </optgroup>}
              </select>
            )}
            {(page === "slate" || page === "edit") && <button className="crumb" onClick={() => newEdit()} title="New standalone timeline">＋ EDIT</button>}
            {scene && <button className="crumb" onClick={sendSceneToComic} title="Send this scene's script + world cast to the Lorea comic composer">→ COMIC</button>}
          </div>
        )}
        <div className="hdr-right">
          {storageReady === false && <span className="warn-dot">SESSION ONLY</span>}
          <span className="ver">CTX-LINKED · α</span>
        </div>
      </header>

      {/* ───── main ───── */}
      <main className="main">
        {error && <div className="err" onClick={() => setError("")}>⚠ {error} <span className="dismiss">✕</span></div>}

        {/* ════════ PRODUCTIONS PAGE ════════ */}
        {page === "productions" && !prod && (
          <div className="scroll pad">
            <h1 className="mega">PRODUCTIONS</h1>
            <p className="lede">The knowledge layer. Everything SLATE breaks down and everything the editor cuts is informed by what lives here — cast, world, themes.</p>
            <div className="glass-card newprod">
              <div className="lbl">NEW PRODUCTION</div>
              <div className="np-row">
                <input className="in big" placeholder="THE LONG WAY HOME" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createProduction()} />
                <div className="seg">
                  {["film", "tv-series"].map((t) => (
                    <button key={t} className={`seg-btn ${newType === t ? "on" : ""}`} onClick={() => setNewType(t)}>{t === "film" ? "FILM" : "TV SERIES"}</button>
                  ))}
                </div>
                <button className="cta" onClick={createProduction} disabled={!newTitle.trim()}><Plus size={14} /> CREATE</button>
              </div>
            </div>
            {storageReady === null && <div className="dim">LOADING…</div>}
            {index.map((p) => (
              <div className="glass-card prodrow" key={p.id} onClick={() => openProduction(p.id)}>
                <div className="prodicon">{p.type === "film" ? <Film size={18} /> : <Layers size={18} />}</div>
                <div className="prodmain">
                  <div className="prodtitle" onDoubleClick={(e) => { e.stopPropagation(); renameProduction(p.id, p.title); }} title="Double-click to rename">{p.title}</div>
                  <div className="prodmeta">{p.type === "film" ? "FILM" : "TV SERIES"} · {p.sceneCount || 0} SCENES · {new Date(p.updated).toLocaleDateString()}</div>
                </div>
                <button className="ghost" onClick={(e) => { e.stopPropagation(); renameProduction(p.id, p.title); }} title="Rename project"><Brush size={13} /></button>
                <button className="ghost danger" onClick={(e) => { e.stopPropagation(); deleteProduction(p.id); }}><Trash2 size={13} /></button>
              </div>
            ))}
            {storageReady && !index.length && <div className="dim center">No productions yet — everything starts here.</div>}
            {storageReady && (
              <div className="center" style={{ marginTop: 12 }}>
                <button className="minibtn" onClick={onRecover} title="Rescan this browser's storage for a project that fell off the list">↻ Recover projects from this browser</button>
              </div>
            )}
          </div>
        )}

        {page === "productions" && prod && (
          <div className="scroll pad">
            <button className="backlink" onClick={() => { setProd(null); setSceneSel(null); }}><ChevronLeft size={13} /> ALL PRODUCTIONS</button>
            <h1 className="mega">{prod.title}</h1>
            <input className="in desc" placeholder="One-line description of this production…" value={prod.description} onChange={(e) => updateProd((p) => { p.description = e.target.value; })} />
            <div className="ptabs">
              {[["structure", "STRUCTURE", ListVideo], ["cast", "CAST", Users], ["world", "WORLD", Globe], ["design", "DESIGN", Brush], ["media", "MEDIA ASSETS", FolderOpen]].map(([id, lab, Ic]) => (
                <button key={id} className={`ptab ${prodTab === id ? "on" : ""}`} onClick={() => setProdTab(id)}><Ic size={13} /> {lab}</button>
              ))}
              {/* Import an edit / master timeline and reverse-build the production from it. */}
              <button
                className="ptab"
                style={{ marginLeft: "auto" }}
                onClick={() => editImportRef.current?.click()}
                disabled={reversing || scriptBuilding}
                title="Import an edit or a whole project timeline (FCPXML / EDL). You choose whether it's the full movie or a single scene — a full movie is analyzed in the background to reverse-build scenes, script, and characters."
              >
                <Upload size={13} /> {reversing ? "ANALYZING…" : "IMPORT EDIT"}
              </button>
              <input ref={editImportRef} type="file" accept=".edl,.xml,.fcpxml" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importEditToProduction(f); e.target.value = ""; }} />
              {/* Connect this production to a Plajah World — share characters &
                  world knowledge with Lorea / Worlds; entries land private. */}
              <button
                className={`ptab ${prod.worldId ? "on" : ""}`}
                onClick={() => setConnectWorldOpen(true)}
                title={prod.worldId ? "Connected to a Plajah World" : "Connect to a Plajah World"}
              >
                <Globe size={13} /> {prod.worldId ? "WORLD ✓" : "CONNECT WORLD"}
              </button>
            </div>

            <ConnectToWorld
              open={connectWorldOpen}
              onClose={() => setConnectWorldOpen(false)}
              source={{ app: "FABULA", projectId: prod.id, projectTitle: prod.title }}
              connectedWorldId={prod.worldId || null}
              onConnected={(wid) => updateProd((p) => { p.worldId = wid || undefined; })}
              onSync={(worldId) => syncProductionToWorld(worldId, {
                id: prod.id, title: prod.title,
                cast: (prod.cast || []).map((c) => ({ id: c.id, name: c.name, visual_lock: c.looks, voice_profile: c.voice, arc_in_scene: c.personality })),
                worldCats: prod.worldCats,
              })}
              onImport={async (worldId) => {
                const incoming = await worldCharactersForProduction(worldId);
                let added = 0;
                updateProd((p) => {
                  p.cast = p.cast || [];
                  incoming.forEach((wc) => {
                    if (!wc.name || p.cast.some((x) => (x.name || "").toLowerCase() === wc.name.toLowerCase())) return;
                    p.cast.push({ id: uid(), name: wc.name, looks: wc.visual_lock || "", voice: "", personality: "", media: [], wardrobe: [], fromWorld: true });
                    added++;
                  });
                });
                return added;
              }}
            />

            {prodTab === "media" && (() => {
              const tree = binTree();
              const folderCount = tree.length;
              const allTags = [...new Set((prod.mediaPool || []).flatMap((a) => a.tags || []))].sort();
              const assets = (prod.mediaPool || []).filter((a) => {
                if (mediaBin !== "all") { const b = a.bin || "imports"; if (!(b === mediaBin || b.startsWith(mediaBin + "/"))) return false; }
                return assetMatches(a, mediaSearch.trim());
              });
              const selAsset = mediaSel ? (prod.mediaPool || []).find((a) => a.id === mediaSel) : null;
              const poolCount = (prod.mediaPool || []).length;
              const localOnlyCount = (prod.mediaPool || []).filter((a) => a.url && !a.cloudUrl).length;
              // Pagination — keep the grid from becoming an endless scroll on large libraries.
              const totalPages = Math.max(1, Math.ceil(assets.length / mediaPageSize));
              const pageNo = Math.min(Math.max(1, mediaPage), totalPages);
              const pageAssets = assets.slice((pageNo - 1) * mediaPageSize, pageNo * mediaPageSize);
              const pageFrom = assets.length ? (pageNo - 1) * mediaPageSize + 1 : 0;
              const pageTo = Math.min(pageNo * mediaPageSize, assets.length);
              // Folder tree: a node has children if any path extends it; hide nodes whose ancestor is collapsed.
              const hasKids = (path) => tree.some((p) => p.startsWith(path + "/"));
              const countIn = (path) => (prod.mediaPool || []).filter((a) => { const b = a.bin || "imports"; return b === path || b.startsWith(path + "/"); }).length;
              const visibleNodes = tree.filter((path) => {
                const segs = path.split("/");
                for (let i = 1; i < segs.length; i++) { if (mediaCollapsed.has(segs.slice(0, i).join("/"))) return false; }
                return true;
              });
              const toggleCollapse = (path) => setMediaCollapsed((s) => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n; });
              const onMediaDrop = async (e) => {
                e.preventDefault();
                const picked = await readDroppedItems(e.dataTransfer); // walks dropped folders (no picker)
                if (!picked.length) { ping("Nothing readable was dropped."); return; }
                const isScript = (n) => /\.(txt|md|fountain|markdown)$/i.test(n);
                const scripts = picked.filter((p) => isScript(p.name)).map((p) => p.file);
                const media = picked.filter((p) => !isScript(p.name));
                if (scripts.length) importScriptFiles(scripts);
                if (media.length) {
                  const folders = new Set(media.map((m) => m.path || "imports")).size;
                  const n = await importFilesToBins(media);
                  ping(n ? `Imported ${n} dropped file${n === 1 ? "" : "s"} across ${folders} folder${folders === 1 ? "" : "s"}` : `Dropped ${media.length} file${media.length === 1 ? "" : "s"}, but 0 were added (already imported).`);
                }
              };
              return (
                <div className="matab" onDragOver={(e) => e.preventDefault()} onDrop={onMediaDrop}>
                  <div className="glass-card">
                    <div className="lbl">MEDIA ASSETS — the production’s single file source. Import a folder (kept as a watch folder that auto-updates); its subfolders become bins, names matching your Cast or World auto-tag into those libraries, and the edit page’s media pool mirrors this exactly. Drop <strong>.txt / .fountain</strong> scripts anywhere here and Lorea structures them into the Structure page.</div>
                    <div className="btnrow" style={{ marginTop: 10, flexWrap: "wrap" }}>
                      <button className="cta" onClick={addSyncFolderNow} disabled={folderSyncing} title="Pick a folder — it becomes a watch folder that auto-imports new/changed files, mirroring its structure"><FolderOpen size={13} /> {folderSyncing ? "IMPORTING…" : "IMPORT FOLDER (WATCH)"}</button>
                      <button className="minibtn" onClick={() => mirrorFolderRef.current?.click()} title="One-time folder import (mirrors structure, no watch)"><Upload size={12} /> FOLDER (ONCE)</button>
                      <button className="minibtn" onClick={() => mediaFilesRef.current?.click()}><Upload size={12} /> FILES</button>
                      <button className="minibtn" onClick={() => scriptFilesRef.current?.click()} disabled={scriptImporting} title="Structure a .txt / .md / .fountain script into scenes with Lorea, then auto-run the SLATE breakdown"><FileText size={12} /> {scriptImporting ? (scriptMsg || "STRUCTURING…") : "IMPORT SCRIPT"}</button>
                      {/* Folder picker for FOLDER (ONCE) + the FSA fallback. Must live HERE too: the
                          other mirrorFolderRef input is on the edit page, which isn't mounted in the
                          production view — so without this, the ref was null and nothing opened. */}
                      <input ref={mirrorFolderRef} type="file" webkitdirectory="" directory="" multiple style={{ display: "none" }}
                        onChange={(e) => { importFolderMirror(e.target.files); e.target.value = ""; }} />
                      <input ref={mediaFilesRef} type="file" multiple accept={`${codecImportAccept()},.lottie,.json,.svg,.ai,.pdf`} style={{ display: "none" }}
                        onChange={(e) => { importFolderMirror(e.target.files); e.target.value = ""; }} />
                      <input ref={scriptFilesRef} type="file" multiple accept=".txt,.md,.fountain,.markdown" style={{ display: "none" }}
                        onChange={(e) => { importScriptFiles(e.target.files); e.target.value = ""; }} />
                    </div>
                  </div>

                  {/* cloud sync — local-first, pausable (keeps big projects snappy) */}
                  <div className="glass-card">
                    <div className="lbl">CLOUD SYNC — {mediaAutoSync ? "auto-sync ON" : "LOCAL-FIRST"} · {localOnlyCount} of {poolCount} local-only{uploadPending ? ` · ${uploadPending} uploading` : ""}{syncPaused ? " · PAUSED" : ""}</div>
                    <div className="btnrow" style={{ flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      <label className="synctoggle"><input type="checkbox" checked={mediaAutoSync} onChange={(e) => setAutoSync(e.target.checked)} /> Auto-sync new imports</label>
                      <button className="minibtn" onClick={syncAllLocalMedia} disabled={!localOnlyCount} title="Upload every local file to the cloud in the background">☁ Sync all to cloud</button>
                      <button className="minibtn" onClick={toggleSyncPaused} title="Pause/resume background uploads so they never slow editing">{syncPaused ? "▶ Resume sync" : "⏸ Pause sync"}</button>
                      {uploadPending > 0 && <button className="minibtn" style={{ color: "var(--red)", borderColor: "rgba(251,113,133,.35)" }} onClick={clearSyncNow}>✕ Clear queue ({uploadPending})</button>}
                    </div>
                    <div className="dim small" style={{ marginTop: 6 }}>Your library plays from the local files on this device — editing never waits on the cloud. Sync (to open on another device) runs in the background and can be paused.</div>
                  </div>

                  {/* watch folders */}
                  {syncFolders.length > 0 && (
                    <div className="glass-card">
                      <div className="lbl">WATCH FOLDERS <span className="catcount">{syncFolders.length}</span> — auto-update while the project is open</div>
                      {syncFolders.map((f) => (
                        <div className="watchrow" key={f.id}>
                          <FolderOpen size={13} />
                          <button className="watchmeta watchnav" onClick={() => setMediaBin(tree.includes(f.name) ? f.name : "all")} title="Show this folder's media below">
                            <strong>{f.name}</strong>
                            <span className="dim small">{f.fileCount || 0} scanned · {countIn(f.name)} in pool → browse below</span>
                          </button>
                          <button className="minibtn" onClick={() => rescanSyncFolder(f.id, true, true)} title="Rescan now — full re-import of every file in the folder"><RefreshCw size={11} /></button>
                          <button className="minibtn" onClick={async () => { await removeSyncFolder(prod.id, f.id); refreshSyncFolders(); }} title="Stop watching"><Trash2 size={11} /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* search */}
                  <div className="glass-card" style={{ paddingBottom: 10 }}>
                    <div className="mediasearch wide">
                      <Search size={13} />
                      <input value={mediaSearch} onChange={(e) => setMediaSearch(e.target.value)} placeholder="Search by name, tag, or folder…" />
                      {mediaSearch && <X size={13} style={{ cursor: "pointer" }} onClick={() => setMediaSearch("")} />}
                    </div>
                    {allTags.length > 0 && (
                      <div className="tagrow" style={{ marginTop: 9 }}>
                        <Tag size={11} className="dim" />
                        {allTags.map((t) => (
                          <button key={t} className={`tagchip ${mediaSearch.toLowerCase() === t ? "on" : ""}`} onClick={() => setMediaSearch(mediaSearch.toLowerCase() === t ? "" : t)}>{t}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* browser: folder tree | asset grid | preview */}
                  <div className={`mabrowse ${selAsset ? "haspreview" : ""}`}>
                    {/* folder tree */}
                    <div className="glass-card matree">
                      <div className="lbl">FOLDERS <span className="catcount">{folderCount}</span></div>
                      <button className={`matreerow ${mediaBin === "all" ? "on" : ""}`} onClick={() => setMediaBin("all")}>
                        <span className="matreespace" /><FolderOpen size={12} /><span className="matreelabel">All media</span><span className="matreecount">{(prod.mediaPool || []).length}</span>
                      </button>
                      {visibleNodes.map((path) => {
                        const depth = path.split("/").length - 1;
                        const kids = hasKids(path);
                        const open = !mediaCollapsed.has(path);
                        return (
                          <button key={path} className={`matreerow ${mediaBin === path ? "on" : ""}`} onClick={() => setMediaBin(path)} title={path} style={{ paddingLeft: 8 + depth * 14 }}>
                            {kids
                              ? <span className="matreetoggle" onClick={(e) => { e.stopPropagation(); toggleCollapse(path); }}>{open ? "▾" : "▸"}</span>
                              : <span className="matreespace" />}
                            <FolderOpen size={12} /><span className="matreelabel">{path.split("/").pop()}</span><span className="matreecount">{countIn(path)}</span>
                          </button>
                        );
                      })}
                      {folderCount === 0 && <div className="dim small" style={{ padding: "4px 6px" }}>No folders yet — import a folder to mirror its structure here.</div>}
                    </div>

                    {/* asset grid */}
                    <div className="glass-card magridwrap">
                      <div className="mapaghead">
                        <div className="lbl" style={{ margin: 0 }}>{mediaBin === "all" ? "ALL MEDIA" : mediaBin} <span className="catcount">{assets.length}</span></div>
                        {assets.length > 0 && (
                          <div className="mapager">
                            <span className="dim small">{pageFrom}–{pageTo} of {assets.length}</span>
                            <select className="gp-sel" value={mediaPageSize} onChange={(e) => setMediaPageSize(Number(e.target.value))} title="Items per page">
                              {[25, 50, 75].map((n) => <option key={n} value={n}>{n}/page</option>)}
                            </select>
                            <button className="pagebtn" disabled={pageNo <= 1} onClick={() => setMediaPage(pageNo - 1)} title="Previous page"><ChevronLeft size={13} /></button>
                            <span className="dim small" style={{ minWidth: 54, textAlign: "center" }}>{pageNo} / {totalPages}</span>
                            <button className="pagebtn" disabled={pageNo >= totalPages} onClick={() => setMediaPage(pageNo + 1)} title="Next page"><ChevronLeft size={13} style={{ transform: "rotate(180deg)" }} /></button>
                          </div>
                        )}
                      </div>
                      {assets.length === 0 && (prod.mediaPool || []).length > 0 && (mediaBin !== "all" || mediaSearch)
                        ? <div className="dim small">No assets match this filter. <button className="linkbtn" onClick={() => { setMediaBin("all"); setMediaSearch(""); }}>Show all {(prod.mediaPool || []).length} →</button></div>
                        : assets.length === 0 && <div className="dim small">No assets yet — import a folder or files above.</div>}
                      <div className="magrid">
                        {pageAssets.map((a) => (
                          <div className={`macard ${mediaSel === a.id ? "sel" : ""} ${(!a.url || a.offline) ? "offline" : ""}`} key={a.id} title={a.bin || "imports"}
                            onClick={() => setMediaSel(a.id)} onDoubleClick={() => { setPage("edit"); setEditWs("media"); setBinFilter(a.bin || "imports"); openInViewer(a, false); }}>
                            <div className="mathumb">
                              {a.url && a.type === "video" && <ScrubThumb url={a.url} className="poolthumb" />}
                              {a.url && (a.type === "image" || a.type === "graphic") && <img src={a.url} className="poolthumb" alt="" />}
                              {(a.type === "audio") && <Music size={20} className="dim" />}
                              {(!a.url || a.offline) && <span className="chip blue" style={{ fontSize: 7 }}>OFFLINE</span>}
                              {a.note && <span className="manoteflag" title="Has notes">✎</span>}
                              <span className={`pooltype ${a.type}`}>{{ video: "VID", audio: "AUD", image: "IMG", graphic: "GFX", lottie: "LOT" }[a.type] || "FILE"}</span>
                            </div>
                            <div className="maname">{a.name}</div>
                            {(a.tags || []).length > 0 && (
                              <div className="matags">
                                {a.castId && <span className="matag cast"><Users size={8} /> {(prod.cast || []).find((c) => c.id === a.castId)?.name || "cast"}</span>}
                                {(a.tags || []).filter((t) => !a.castId || t !== ((prod.cast || []).find((c) => c.id === a.castId)?.name || "").toLowerCase()).slice(0, 3).map((t) => <span key={t} className="matag">{t}</span>)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {totalPages > 1 && (
                        <div className="mapager" style={{ justifyContent: "center", marginTop: 12 }}>
                          <button className="pagebtn" disabled={pageNo <= 1} onClick={() => setMediaPage(pageNo - 1)}><ChevronLeft size={13} /></button>
                          <span className="dim small">Page {pageNo} of {totalPages}</span>
                          <button className="pagebtn" disabled={pageNo >= totalPages} onClick={() => setMediaPage(pageNo + 1)}><ChevronLeft size={13} style={{ transform: "rotate(180deg)" }} /></button>
                        </div>
                      )}
                    </div>
                    {/* preview — sits to the RIGHT of the grid as a column when an asset is selected */}
                    {selAsset && (
                    <div className="glass-card mapreview">
                      <div className="mapvhead">
                        <span className="lbl" style={{ margin: 0 }}>PREVIEW</span>
                        <button className="gp-x" onClick={() => setMediaSel(null)}><X size={15} /></button>
                      </div>
                      <div className="mapvbody">
                        <div className="mapvmedia">
                          {selAsset.url && selAsset.type === "video" && <video src={selAsset.url} controls playsInline className="mapvplayer" />}
                          {selAsset.url && (selAsset.type === "image" || selAsset.type === "graphic") && <img src={selAsset.url} alt="" className="mapvplayer" />}
                          {selAsset.url && selAsset.type === "audio" && <div className="mapvaudio"><Music size={26} className="dim" /><audio src={selAsset.url} controls className="mapvaudioel" /></div>}
                          {(!selAsset.url || selAsset.offline) && <div className="mapvoffline">Media offline — relink or let the sync folder re-scan.</div>}
                        </div>
                        <div className="mapvmeta">
                          <div className="mapvname">{selAsset.name}</div>
                          <div className="dim small">{selAsset.bin || "imports"} · {selAsset.type?.toUpperCase()}{selAsset.duration ? ` · ${selAsset.duration.toFixed(1)}s` : ""}{selAsset.cloudUrl ? " · ☁ synced" : " · ⭯ syncing"}</div>
                          <div className="dim small" style={{ marginTop: 2 }} title={selAsset.folderId ? "Playing the real file straight from your drive" : (selAsset.url && selAsset.url.startsWith("blob:")) ? "Playing from the on-device copy" : "Playing from the cloud (bytes not on this device)"}>
                            {selAsset.folderId ? "▣ ON DEVICE · reading from disk" : (selAsset.url && selAsset.url.startsWith("blob:")) ? "▣ ON DEVICE · local copy" : (selAsset.url && /^https?:/i.test(selAsset.url)) ? "☁ CLOUD · not on this device" : "— offline"}
                          </div>
                          {(selAsset.tags || []).length > 0 && <div className="matags" style={{ marginTop: 6 }}>{(selAsset.tags || []).map((t) => <span key={t} className="matag">{t}</span>)}</div>}
                          <div className="lbl" style={{ marginTop: 12 }}>NOTES</div>
                          <textarea className="mapvnotes" rows={3} value={selAsset.note || ""} placeholder="Add production notes for this asset…" onChange={(e) => updateAssetNote(selAsset.id, e.target.value)} />
                          <div className="lbl" style={{ marginTop: 12 }}>ADD TO SCENE</div>
                          <div className="mapvadd">
                            <select className="gp-sel" value={mediaAddScene} onChange={(e) => setMediaAddScene(e.target.value)} style={{ flex: 1 }}>
                              <option value="">Choose a scene…</option>
                              {sceneList().map((s) => <option key={s.sceneId} value={`${s.actId}|${s.sceneId}`}>{s.label}</option>)}
                            </select>
                            <button className="cta" disabled={!mediaAddScene} onClick={() => { const [aid, sid] = mediaAddScene.split("|"); addAssetToScene(selAsset, aid, sid); }}><Plus size={12} /> ADD</button>
                          </div>
                          <button className="minibtn full" style={{ marginTop: 10 }} onClick={() => { setPage("edit"); setEditWs("media"); setBinFilter(selAsset.bin || "imports"); openInViewer(selAsset, false); }}><Film size={12} /> OPEN IN EDITOR</button>
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {prodTab === "structure" && (prod.edits || []).length > 0 && (
              <div className="glass-card actcard">
                <div className="acthead">EDITS — standalone timelines (docs, music videos, assemblies)</div>
                {prod.edits.map((ed) => (
                  <div className="scenerow" key={ed.id} onClick={() => { setEditSel(ed.id); setSceneSel(null); setPage("edit"); }}>
                    <input className="scenetitle" value={ed.title} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateProd((p) => { const x = p.edits.find((y) => y.id === ed.id); if (x) x.title = e.target.value; })} />
                    <span className="chip dimchip">{ed.timeline?.clips?.length || 0} CLIPS</span>
                    <button className="minibtn blue" onClick={(e) => { e.stopPropagation(); setEditSel(ed.id); setSceneSel(null); setPage("edit"); }}><Film size={12} /> OPEN</button>
                    <button className="ghost danger" onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete this edit?")) { updateProd((p) => { p.edits = p.edits.filter((y) => y.id !== ed.id); }); if (editSel === ed.id) setEditSel(null); } }}><Trash2 size={12} /></button>
                  </div>
                ))}
                <button className="ghost addscene" onClick={() => newEdit()}><Plus size={12} /> NEW EDIT</button>
              </div>
            )}
            {prodTab === "structure" && prod.acts.map((act) => (
              <div className="glass-card actcard" key={act.id}>
                <div className="acthead">{act.title}</div>
                {act.scenes.map((s) => {
                  const ready = (s.shots || []).filter((x) => x.status === "ready").length;
                  // Identity stripe by furthest-along state, so a scene's status reads at a glance.
                  const stateTab = s.timeline?.clips?.length ? "var(--green)" : s.shots?.length ? "var(--pur)" : s.bible ? "var(--blue)" : "var(--w25)";
                  return (
                    <div className="scenerow idleft" key={s.id} style={{ "--tab": stateTab }}>
                      <input className="scenetitle" value={s.title} onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateProd((p) => { const a = p.acts.find((x) => x.id === act.id); const sc = a.scenes.find((x) => x.id === s.id); sc.title = e.target.value; })} />
                      <span className="dim small">{s.slugline}</span>
                      <span className={`chip ${s.mode === "action" ? "red" : "amb"}`}>{s.mode === "action" ? "ACTION" : "DIALOGUE"}</span>
                      <span className="chip dimchip">{s.shots?.length ? `${ready}/${s.shots.length} SHOTS` : s.bible ? "BIBLE ✓" : "DRAFT"}</span>
                      <span className="chip dimchip">{s.timeline?.clips?.length ? `${s.timeline.clips.length} CLIPS` : "NO CUT"}</span>
                      <button className="minibtn" onClick={() => gotoScene(act.id, s.id, "slate")}><Clapperboard size={12} /> SLATE</button>
                      <button className="minibtn blue" onClick={() => gotoScene(act.id, s.id, "edit")}><Film size={12} /> EDIT</button>
                      <button className="ghost danger" onClick={() => deleteScene(act.id, s.id)}><Trash2 size={12} /></button>
                    </div>
                  );
                })}
                <button className="ghost addscene" onClick={() => addScene(act.id)}><Plus size={12} /> ADD SCENE</button>
              </div>
            ))}

            {prodTab === "cast" && (
              <>
                <div className="dim" style={{ marginBottom: 14 }}>The shared identity layer. SLATE reads these as locks and writes back what it learns from scripts. The editor shows them on dialogue clips.</div>
                {prod.cast.map((c) => (
                  <div className="glass-card castcard" key={c.id}>
                    <div className="castrow1">
                      <input className="castname" value={c.name} placeholder="NAME" onChange={(e) => updateProd((p) => { p.cast.find((x) => x.id === c.id).name = e.target.value; })} />
                      {c.evidence && <span className="evid">⌕ {c.evidence}</span>}
                      <button className="ghost danger" onClick={() => updateProd((p) => { p.cast = p.cast.filter((x) => x.id !== c.id); })}><Trash2 size={12} /></button>
                    </div>
                    <div className="lbl">LOOKS — identity lock for image prompts</div>
                    <textarea className="ta" rows={2} value={c.looks} onChange={(e) => updateProd((p) => { p.cast.find((x) => x.id === c.id).looks = e.target.value; })} />
                    <div className="grid2">
                      <div><div className="lbl">VOICE — TTS design description</div>
                        <textarea className="ta" rows={2} value={c.voice} onChange={(e) => updateProd((p) => { p.cast.find((x) => x.id === c.id).voice = e.target.value; })} /></div>
                      <div><div className="lbl">PERSONALITY / TEMPERANCE</div>
                        <textarea className="ta" rows={2} value={c.personality} onChange={(e) => updateProd((p) => { p.cast.find((x) => x.id === c.id).personality = e.target.value; })} /></div>
                    </div>
                    <div className="grid2">
                      <div><div className="lbl">DO'S</div>
                        <textarea className="ta" rows={1} value={c.dos} onChange={(e) => updateProd((p) => { p.cast.find((x) => x.id === c.id).dos = e.target.value; })} /></div>
                      <div><div className="lbl">DON'TS</div>
                        <textarea className="ta" rows={1} value={c.donts} onChange={(e) => updateProd((p) => { p.cast.find((x) => x.id === c.id).donts = e.target.value; })} /></div>
                    </div>
                    {(c.wardrobe || []).length > 0 && (
                      <>
                        <div className="lbl" style={{ marginTop: 8 }}>WARDROBE — extracted + curated</div>
                        <div className="wtags">{c.wardrobe.map((w, wi) => (
                          <span className="wtag" key={wi} onClick={() => updateProd((p) => { const cc = p.cast.find((x) => x.id === c.id); cc.wardrobe = cc.wardrobe.filter((x) => x !== w); })} title="Click to remove">{w}</span>
                        ))}</div>
                      </>
                    )}
                    <div className="lbl" style={{ marginTop: 10 }}>MEDIA — images · video · voice. Lock what's canon; FRAME = in-movie, CONCEPT = production art.</div>
                    <div className="cmedia">
                      {(c.media || []).map((m) => {
                        const a = prod.mediaPool.find((x) => x.id === m.assetId);
                        if (!a) return null;
                        return (
                          <div className={`cmcard ${m.locked ? "locked" : ""} ${m.verified === false ? "rejected" : ""}`} key={m.assetId}>
                            <div className="cmthumb">
                              {a.url && (a.type === "image" || a.type === "graphic") && <img src={a.url} alt="" />}
                              {a.url && a.type === "video" && <video src={a.url} muted />}
                              {a.type === "audio" && <span className="wext">♪ VOICE</span>}
                              {m.verified === true && <span className="vbadge ok">✓ {m.confidence || ""}%</span>}
                              {m.verified === false && <span className="vbadge bad">✕ NOT THEM?</span>}
                            </div>
                            <select className="sel xs" value={m.role} onChange={(e) => updateProd((p) => { const mm = p.cast.find((x) => x.id === c.id)?.media.find((y) => y.assetId === m.assetId); if (mm) mm.role = e.target.value; })}>
                              {["reference", "frame", "concept", "voice"].map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                            </select>
                            <input className="in tiny" placeholder="description…" value={m.note || ""} onChange={(e) => updateProd((p) => { const mm = p.cast.find((x) => x.id === c.id)?.media.find((y) => y.assetId === m.assetId); if (mm) mm.note = e.target.value; })} />
                            <div className="btnrow" style={{ marginTop: 4, gap: 4 }}>
                              <button className={`minibtn ${m.locked ? "blue" : ""}`} onClick={() => updateProd((p) => { const mm = p.cast.find((x) => x.id === c.id)?.media.find((y) => y.assetId === m.assetId); if (mm) mm.locked = !mm.locked; })}>
                                {m.locked ? <Lock size={10} /> : <Unlock size={10} />} {m.locked ? "LOCKED" : "LOCK"}
                              </button>
                              {(a.type === "image" || a.type === "video") && a.url && (
                                <button className="minibtn" disabled={busy} onClick={() => extractWardrobeProps(c.id, a.id)} title="Extract wardrobe + props from this image into the character & World/Props"><Brush size={10} /> EXTRACT</button>
                              )}
                              <button className="ghost danger" onClick={() => updateProd((p) => { const cc = p.cast.find((x) => x.id === c.id); cc.media = cc.media.filter((y) => y.assetId !== m.assetId); })}><Trash2 size={10} /></button>
                            </div>
                            {(m.suggestedWardrobe || []).length > 0 && !m.locked && (
                              <button className="ghost full" style={{ marginTop: 4 }} onClick={() => updateProd((p) => { const cc = p.cast.find((x) => x.id === c.id); cc.wardrobe = Array.from(new Set([...(cc.wardrobe || []), ...m.suggestedWardrobe])); })}>+ {m.suggestedWardrobe.length} WARDROBE SEEN</button>
                            )}
                          </div>
                        );
                      })}
                      <select className="sel cmadd" value="" onChange={(e) => {
                        const aid = e.target.value; if (!aid) return;
                        updateProd((p) => { const cc = p.cast.find((x) => x.id === c.id); if (!cc.media.some((m) => m.assetId === aid)) cc.media.push({ assetId: aid, role: prod.mediaPool.find((a) => a.id === aid)?.type === "audio" ? "voice" : "reference", locked: false, note: "", verified: null }); });
                      }}>
                        <option value="">+ ASSIGN FROM POOL…</option>
                        {prod.mediaPool.filter((a) => ["image", "video", "audio", "graphic"].includes(a.type)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
                <button className="ghost addscene" onClick={() => updateProd((p) => p.cast.push({ id: uid(), name: "", looks: "", voice: "", personality: "", dos: "", donts: "" }))}><Plus size={12} /> ADD CHARACTER</button>
              </>
            )}

            {prodTab === "world" && (
              <>
                <div className="wcats">
                  <button className={`ptab ${worldCat === "overview" ? "on" : ""}`} onClick={() => setWorldCat("overview")}>OVERVIEW</button>
                  {WORLD_CATS.map((c) => (
                    <button key={c.id} className={`ptab ${worldCat === c.id ? "on" : ""}`} onClick={() => setWorldCat(c.id)}>
                      {c.label} <span className="catcount">{prod.worldCats?.[c.id]?.length || 0}</span>
                    </button>
                  ))}
                  <button className="minibtn blue" style={{ marginLeft: "auto" }} disabled={busy} onClick={() => folderRef.current?.click()} title="Point at a folder — subfolder names route assets into categories; uncategorized paths get AI-classified">
                    <Upload size={12} /> IMPORT FOLDER
                  </button>
                  <input ref={folderRef} type="file" webkitdirectory="" directory="" multiple style={{ display: "none" }}
                    onChange={(e) => { importWorldFolder(e.target.files); e.target.value = ""; }} />
                </div>

                {worldCat === "overview" && (
                  <div className="glass-card">
                    <div className="lbl">THEMES & SYMBOLS</div>
                    <input className="in" value={prod.themes} placeholder="grief as weather, water imagery, the cost of silence…" onChange={(e) => updateProd((p) => { p.themes = e.target.value; })} />
                    <div className="lbl" style={{ marginTop: 14 }}>WORLD BIBLE — era, rules, geography, texture. SLATE reads this on every breakdown.</div>
                    <textarea className="ta" rows={10} value={prod.world} onChange={(e) => updateProd((p) => { p.world = e.target.value; })} />
                    <div className="grid2" style={{ marginTop: 14 }}>
                      <div><div className="lbl">DEFAULT VISUAL STYLE</div>
                        <input className="in" value={prod.defaults.style} placeholder="Deakins low-key tungsten, Kodak 500T halation…" onChange={(e) => updateProd((p) => { p.defaults.style = e.target.value; })} /></div>
                      <div><div className="lbl">ASPECT / VIDEO / STILLS</div>
                        <div className="row3">
                          <select className="sel" value={prod.defaults.aspect} onChange={(e) => updateProd((p) => { p.defaults.aspect = e.target.value; })}>{ASPECTS.map((a) => <option key={a}>{a}</option>)}</select>
                          <select className="sel" value={prod.defaults.service} onChange={(e) => updateProd((p) => { p.defaults.service = e.target.value; })}>{SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                          <select className="sel" value={prod.defaults.stillTarget} onChange={(e) => updateProd((p) => { p.defaults.stillTarget = e.target.value; })}>{STILL_TARGETS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                        </div></div>
                    </div>
                  </div>
                )}

                {worldCat !== "overview" && (
                  <>
                    <div className="dim small" style={{ marginBottom: 12 }}>
                      Knowledge in this category feeds SLATE breakdowns and prompt generation. Drop a folder above — subfolders named like "props", "lore", "sets" route automatically; everything else gets AI-classified. Visual and text assets auto-tag on import (first six), the rest tag on demand.
                    </div>
                    {(prod.worldCats?.[worldCat] || []).map((item) => {
                      const asset = item.assetId ? prod.mediaPool.find((a) => a.id === item.assetId) : null;
                      return (
                        <div className="glass-card witem" key={item.id}>
                          <div className="wthumb">
                            {asset?.url && (asset.type === "image" || asset.type === "graphic") && <img src={asset.url} alt="" />}
                            {asset?.url && asset.type === "video" && <video src={asset.url} muted />}
                            {asset && !["image", "graphic", "video"].includes(asset.type) && <span className="wext">{asset.type === "model" ? "3D" : asset.type === "audio" ? "♪" : asset.type === "text" ? "TXT" : "FILE"}</span>}
                            {!asset && <span className="wext">✎</span>}
                          </div>
                          <div className="wbody">
                            <div className="wrow1">
                              <input className="wname" value={item.name} onChange={(e) => updateProd((p) => { const it = p.worldCats[worldCat].find((x) => x.id === item.id); if (it) it.name = e.target.value; })} />
                              {item.folder && <span className="dim small mono">{item.folder}</span>}
                              {asset && ["image", "video", "graphic"].includes(asset.type) && (
                                <button className={`chip ${asset.designation === "frame" ? "blue" : "dimchip"}`} style={{ cursor: "pointer", border: "none" }}
                                  title="FRAME = part of a scene (in the movie). CONCEPT = production design asset (not in the movie)."
                                  onClick={() => updateProd((p) => { const a = p.mediaPool.find((x) => x.id === item.assetId); if (a) a.designation = a.designation === "frame" ? "concept" : "frame"; })}>
                                  {asset.designation === "frame" ? "🎞 FRAME" : "✎ CONCEPT"}
                                </button>
                              )}
                              {asset && <button className="minibtn" disabled={busy} onClick={() => tagWorldItem(worldCat, item.id)}><Sparkles size={11} /> TAG</button>}
                              <button className="ghost danger" onClick={() => updateProd((p) => { p.worldCats[worldCat] = p.worldCats[worldCat].filter((x) => x.id !== item.id); })}><Trash2 size={11} /></button>
                            </div>
                            <div className="wtags">
                              {(item.tags || []).map((t, ti) => (
                                <span className="wtag" key={ti} onClick={() => updateProd((p) => { const it = p.worldCats[worldCat].find((x) => x.id === item.id); if (it) it.tags = it.tags.filter((x) => x !== t); })} title="Click to remove">{t}</span>
                              ))}
                              <input className="wtag-in" placeholder="+tag" onKeyDown={(e) => {
                                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                                  const v = e.currentTarget.value.trim().toLowerCase(); e.currentTarget.value = "";
                                  updateProd((p) => { const it = p.worldCats[worldCat].find((x) => x.id === item.id); if (it && !it.tags.includes(v)) it.tags.push(v); });
                                }
                              }} />
                            </div>
                            <textarea className="ta" rows={2} value={item.notes} placeholder="contextual notes — what this establishes for the story world…"
                              onChange={(e) => updateProd((p) => { const it = p.worldCats[worldCat].find((x) => x.id === item.id); if (it) it.notes = e.target.value; })} />
                          </div>
                        </div>
                      );
                    })}
                    <button className="ghost addscene" onClick={() => updateProd((p) => { p.worldCats[worldCat].push({ id: uid(), name: "", notes: "", tags: [], folder: "" }); })}><Plus size={12} /> ADD ENTRY</button>
                  </>
                )}
              </>
            )}

            {prodTab === "design" && (
              <>
                <div className="wcats">
                  {[["briefs", "DESIGN BRIEFS"], ["look", "LOOK · LUT · COLOR"], ["stage", "3D STAGE"], ["engines", "ENGINES"]].map(([id, lab]) => (
                    <button key={id} className={`ptab ${designTab === id ? "on" : ""}`} onClick={() => setDesignTab(id)}>{lab}</button>
                  ))}
                </div>

                {designTab === "briefs" && (
                  <>
                    <div className="btnrow" style={{ marginBottom: 14 }}>
                      <button className="cta" disabled={busy} onClick={buildDesignBriefs}><Wand2 size={13} /> BUILD BRIEFS FROM SCRIPT</button>
                      <span className="dim small">The design agent reads every scene and identifies what must be designed — props, staging, stunts & choreography, storyboards. DEVELOP any brief into a working design doc.</span>
                    </div>
                    {[["props", "PROP DESIGN"], ["staging", "SCENE STAGING"], ["stunts", "CHOREOGRAPHY & STUNTS"], ["storyboards", "STORYBOARDS"]].map(([kind, lab]) => (
                      <div className="glass-card" key={kind}>
                        <div className="lbl">{lab} <span className="catcount">{(prod.design.briefs[kind] || []).length}</span></div>
                        {(prod.design.briefs[kind] || []).length === 0 && <div className="dim small">Nothing identified yet.</div>}
                        {(prod.design.briefs[kind] || []).map((b) => (
                          <div className="briefrow" key={b.id}>
                            <div className="briefhead">
                              <strong>{b.name || b.scene}</strong>
                              <span className="dim small">{b.scene}{b.needs ? " — " + b.needs : ""}{b.plan ? " — " + b.plan : ""}{b.beats ? " — " + b.beats : ""}{b.hint ? " — " + b.hint : ""}</span>
                              <button className="minibtn" disabled={busy} onClick={() => developBrief(kind, b.id)}>{b.doc ? "↻ REDEVELOP" : "▸ DEVELOP"}</button>
                              {b.doc && <CopyBtn text={b.doc} small />}
                            </div>
                            {b.safety && <div className="safety">⚠ SAFETY: {b.safety}</div>}
                            {b.doc && <pre className="briefdoc">{b.doc}</pre>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                )}

                {designTab === "look" && (
                  <>
                    <div className="glass-card">
                      <div className="lbl">CINEMATIC LOOK — 3D LUT GALLERY. Selected look grades the monitor preview and writes its language into every generated prompt.</div>
                      <div className="lookgrid">
                        {LOOKS.map((lk) => (
                          <button key={lk.id} className={`lookcard ${prod.design.lookId === lk.id ? "on" : ""}`}
                            onClick={() => updateProd((p) => { p.design.lookId = p.design.lookId === lk.id ? null : lk.id; })}>
                            <div className="lookswatch">{lk.sw.map((s, si) => <i key={si} style={{ background: s }} />)}</div>
                            <b>{lk.name}</b>
                            <span>{lk.prompt.slice(0, 64)}…</span>
                          </button>
                        ))}
                      </div>
                      <div className="btnrow" style={{ marginTop: 10 }}>
                        <label className="minibtn" style={{ cursor: "pointer" }}>
                          <Upload size={11} /> IMPORT .CUBE LUT
                          <input type="file" accept=".cube" style={{ display: "none" }} onChange={async (e) => {
                            const f = e.target.files?.[0]; if (!f) return;
                            try {
                              const lut = parseCubeLut(await f.text(), f.name, uid());
                              updateProd((p) => { p.design.luts ||= []; p.design.luts.push(lut); p.design.activeLutId = lut.id; });
                              ping(`“${f.name}” imported and applied to preview + export`);
                            } catch (error) { ping(error?.message || "That .cube LUT could not be read"); }
                            e.target.value = "";
                          }} />
                        </label>
                        {(prod.design.luts || []).map((l) => <button className={`libchip ${prod.design.activeLutId === l.id ? "on" : ""}`} key={l.id} onClick={() => updateProd((p) => { p.design.activeLutId = p.design.activeLutId === l.id ? null : l.id; })}>{l.name}</button>)}
                      </div>
                    </div>
                    <div className="glass-card">
                      <div className="lbl">COLOR AS THEME — palette with meaning. Lives here and in the scene Bible; the agent grades and dresses with it.</div>
                      {(prod.design.palette || []).map((pc, pi) => (
                        <div className="palrow" key={pi}>
                          <input type="color" value={pc.hex} className="palpick" onChange={(e) => updateProd((p) => { p.design.palette[pi].hex = e.target.value; })} />
                          <input className="in tiny grow" placeholder="what this color means in the story — e.g. 'red = Maya's guilt'" value={pc.meaning}
                            onChange={(e) => updateProd((p) => { p.design.palette[pi].meaning = e.target.value; })} />
                          <button className="ghost danger" onClick={() => updateProd((p) => { p.design.palette.splice(pi, 1); })}><Trash2 size={11} /></button>
                        </div>
                      ))}
                      <button className="ghost addscene" onClick={() => updateProd((p) => { p.design.palette.push({ hex: "#f97316", meaning: "" }); })}><Plus size={12} /> ADD COLOR</button>
                    </div>
                  </>
                )}

                {designTab === "stage" && <Stage3D prod={prod} ping={ping} />}

                {designTab === "engines" && (
                  <div className="glass-card">
                    <div className="lbl">LOCAL-FIRST GENERATION ENGINES — extensible registry. ComfyUI hosts FLUX schnell / FLUX.2 klein / Z-Image-Turbo / SDXL for stills and LTX-2.3 for local video; custom REST wraps anything else.</div>
                    {engines.map((eng, ei) => (
                      <div className="engrow" key={eng.id}>
                        <input className="in tiny" style={{ width: 130 }} value={eng.name} onChange={(e) => { const n = [...engines]; n[ei] = { ...eng, name: e.target.value }; saveEngines(n); }} />
                        <select className="sel xs" value={eng.kind} onChange={(e) => { const n = [...engines]; n[ei] = { ...eng, kind: e.target.value }; saveEngines(n); }}>
                          {ENGINE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                        </select>
                        <input className="in tiny grow" placeholder="http://localhost:8188" value={eng.url} onChange={(e) => { const n = [...engines]; n[ei] = { ...eng, url: e.target.value }; saveEngines(n); }} />
                        <button className="minibtn" disabled={busy || !eng.url} onClick={() => testEngine(eng)}>TEST</button>
                        <button className="ghost danger" onClick={() => saveEngines(engines.filter((x) => x.id !== eng.id))}><Trash2 size={11} /></button>
                        {eng.kind === "comfyui" && (
                          <textarea className="ta mono" rows={2} style={{ width: "100%", marginTop: 4 }} placeholder='ComfyUI workflow JSON (API format) with "{{PROMPT}}" where the prompt text goes…'
                            value={eng.workflow || ""} onChange={(e) => { const n = [...engines]; n[ei] = { ...eng, workflow: e.target.value }; saveEngines(n); }} />
                        )}
                        <div className="dim small" style={{ width: "100%" }}>{ENGINE_KINDS.find((k) => k.id === eng.kind)?.hint}</div>
                      </div>
                    ))}
                    <button className="ghost addscene" onClick={() => saveEngines([...engines, { id: uid(), name: "Local ComfyUI", kind: "comfyui", url: "http://localhost:8188", workflow: "" }])}><Plus size={12} /> ADD ENGINE</button>
                    <div className="dim small" style={{ marginTop: 10 }}>
                      Local engines run on YOUR machine — start ComfyUI with CORS enabled (`--enable-cors-header`). The first engine in the list is the default; the ⚡ ENGINE button on any shot routes prompts to it. Recommended on-device stack: FLUX.1 schnell (Apache 2.0) or Z-Image-Turbo for stills on 8–16GB VRAM; LTX-2.3 distilled FP8 for video on 16–24GB.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════ SLATE PAGE ════════ */}
        {page === "slate" && (
          <div className="scroll pad">
            {!prod && <div className="dim center big-empty">Open a production first — SLATE needs the knowledge layer.<br /><button className="cta" style={{ marginTop: 16 }} onClick={() => setPage("productions")}>GO TO PRODUCTIONS</button></div>}
            {prod && !scene && <div className="dim center big-empty">Select a scene in the header — or create one on the Productions page.</div>}
            {prod && scene && (
              <>
                <div className="slate-head">
                  <h1 className="mega sm">SLATE<span className="slash">▮</span> COVERAGE</h1>
                  <div className="stepper">
                    {[["setup", "1 · SETUP"], ["bible", "2 · BIBLE"], ["shots", "3 · SHOTS"]].map(([id, lab]) => (
                      <button key={id} className={`stepchip ${slateStep === id ? "on" : ""}`}
                        disabled={(id === "bible" && !scene.bible) || (id === "shots" && !scene.shots?.length)}
                        onClick={() => setSlateStep(id)}>{lab}</button>
                    ))}
                  </div>
                </div>

                {slateStep === "setup" && (
                  <>
                    <div className="glass-card">
                      <div className="lbl">SLUGLINE</div>
                      <input className="in" value={scene.slugline} placeholder="INT. DINER — NIGHT" onChange={(e) => updateScene((sc) => { sc.slugline = e.target.value; })} />
                      <div className="lbl" style={{ marginTop: 12 }}>SCRIPT OR SCENE CONCEPT — any format: screenplay, prose, notes</div>
                      <textarea className="ta mono" rows={10} value={scene.script} onChange={(e) => updateScene((sc) => { sc.script = e.target.value; })}
                        placeholder={"MAYA\nYou said you'd be there.\n\nDANIEL\nI was. You just didn't see me.\n\n— or describe an action set piece in prose…"} />
                      <div className="btnrow">
                        <button className="minibtn" disabled={busy} onClick={detectCharacters}>⌕ DETECT CHARACTERS → CAST</button>
                        <span className="dim small">Detected characters sync into the production Cast, never overwriting what you wrote.</span>
                      </div>
                      <div className="lbl" style={{ marginTop: 12 }}>MODE</div>
                      <div className="seg wide">
                        <button className={`seg-btn ${scene.mode === "dialogue" ? "on" : ""}`} onClick={() => updateScene((sc) => { sc.mode = "dialogue"; })}>DIALOGUE — a shot per line</button>
                        <button className={`seg-btn red ${scene.mode === "action" ? "on" : ""}`} onClick={() => updateScene((sc) => { sc.mode = "action"; })}>ACTION — beat-by-beat coverage</button>
                      </div>
                      <div className="grid2" style={{ marginTop: 12 }}>
                        <div><div className="lbl">TONE & SUBTEXT</div>
                          <textarea className="ta" rows={2} value={scene.tone} placeholder="A breakup disguised as small talk…" onChange={(e) => updateScene((sc) => { sc.tone = e.target.value; })} /></div>
                        <div><div className="lbl">ENVIRONMENT NOTES</div>
                          <textarea className="ta" rows={2} value={scene.environment} placeholder="1970s roadside diner, dead hour, rain on glass…" onChange={(e) => updateScene((sc) => { sc.environment = e.target.value; })} /></div>
                      </div>
                      <div className="lbl" style={{ marginTop: 12 }}>SCENE-SPECIFIC STYLE (inherits production default)</div>
                      <input className="in" value={scene.styleNotes} onChange={(e) => updateScene((sc) => { sc.styleNotes = e.target.value; })} />
                    </div>
                    <button className={`cta full ${scene.mode === "action" ? "red" : ""}`} disabled={busy} onClick={generateBible}>▸ BREAK DOWN THE SCENE</button>
                  </>
                )}

                {slateStep === "bible" && scene.bible && (
                  <>
                    <div className="glass-card">
                      <div className="lbl">DIRECTOR'S READ — INTENT</div>
                      <div className="readtxt">{scene.bible.intent}</div>
                      <div className="lbl">SUBTEXT</div>
                      <div className="readtxt ital">{scene.bible.subtext_read}</div>
                      {(scene.bible.suggestions || []).map((s, i) => <div className="suggest" key={i}>◆ {s}</div>)}
                    </div>
                    <div className="glass-card">
                      <div className="lbl">IDENTITY LOCKS — pasted verbatim into every prompt. Edit until exactly right.</div>
                      {(scene.bible.characters || []).map((c, i) => (
                        <div className="lockrow" key={i}>
                          <div className="lockname">{c.name} <span className="dim small">{c.arc_in_scene}</span></div>
                          <textarea className="ta mono" rows={2} value={c.visual_lock}
                            onChange={(e) => updateScene((sc) => { sc.bible.characters[i].visual_lock = e.target.value; })} />
                          <textarea className="ta mono" rows={1} value={c.voice_profile}
                            onChange={(e) => updateScene((sc) => { sc.bible.characters[i].voice_profile = e.target.value; })} />
                        </div>
                      ))}
                      <div className="lbl">ENVIRONMENT LOCK</div>
                      <textarea className="ta mono" rows={2} value={scene.bible.environment_lock} onChange={(e) => updateScene((sc) => { sc.bible.environment_lock = e.target.value; })} />
                      <div className="grid2">
                        <div><div className="lbl">LIGHTING PLAN</div>
                          <textarea className="ta mono" rows={2} value={scene.bible.lighting_plan} onChange={(e) => updateScene((sc) => { sc.bible.lighting_plan = e.target.value; })} /></div>
                        <div><div className="lbl">PALETTE / GRADE</div>
                          <textarea className="ta mono" rows={2} value={scene.bible.palette} onChange={(e) => updateScene((sc) => { sc.bible.palette = e.target.value; })} /></div>
                      </div>
                    </div>
                    <button className={`cta full ${scene.mode === "action" ? "red" : ""}`} disabled={busy} onClick={generateShotList}>▸ APPROVE BIBLE — DESIGN THE SHOT LIST</button>
                  </>
                )}

                {slateStep === "shots" && (
                  <div className="slateshots">
                    {/* Source material stays visible while you work the coverage (Mockup-D). */}
                    <aside className="slateref glass-card idleft" style={{ "--tab": "var(--org)" }}>
                      <div className="lbl">SCRIPT</div>
                      <div className="script-ref">{scene.script || <span className="dim small">No script text.</span>}</div>
                      {scene.bible && (
                        <>
                          <div className="lbl" style={{ marginTop: 4 }}>INTENT</div>
                          <div className="dim small" style={{ lineHeight: 1.5 }}>{scene.bible.intent}</div>
                          <div className="lbl" style={{ marginTop: 4 }}>LOCKS</div>
                          {(scene.bible.characters || []).map((c, i) => (
                            <div key={i} className="srow idleft" style={{ "--tab": "var(--green)", background: "rgba(0,0,0,.28)", border: "1px solid var(--line-2)" }}>
                              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                            </div>
                          ))}
                          {scene.bible.palette && (
                            <>
                              <div className="lbl" style={{ marginTop: 4 }}>PALETTE</div>
                              <div className="dim small" style={{ lineHeight: 1.5 }}>{scene.bible.palette}</div>
                            </>
                          )}
                        </>
                      )}
                    </aside>
                    <div className="slatemain">
                    <div className="btnrow" style={{ marginBottom: 14 }}>
                      <button className="cta" disabled={busy} onClick={generateAllPrompts}><Sparkles size={13} /> GENERATE ALL PROMPTS</button>
                      <button className="minibtn blue" onClick={() => { buildEditFromBreakdown(); setPage("edit"); }}><Film size={12} /> BUILD EDIT → TIMELINE</button>
                      {busy && <button className="minibtn" onClick={() => { cancelRef.current = true; }}>■ STOP</button>}
                      <span className="dim small" style={{ marginLeft: "auto" }}>{scene.shots.filter((s) => s.status === "ready").length}/{scene.shots.length} READY</span>
                    </div>
                    {scene.shots.map((s, idx) => (
                      <div className="glass-card shotcard" key={s.id}>
                        <div className="shothead">
                          <span className="shotslug">{s.slug}</span>
                          <input className="shottype" value={s.type} onChange={(e) => updateScene((sc) => { sc.shots[idx].type = e.target.value; })} />
                          <span className={`chip ${s.status === "ready" ? "green" : "dimchip"}`}>{s.status === "ready" ? "READY" : "PLANNED"}</span>
                          <button className="ghost danger" onClick={() => updateScene((sc) => { sc.shots.splice(idx, 1); })}><Trash2 size={12} /></button>
                        </div>
                        <textarea className="ta mono dlg" rows={Math.max(1, Math.ceil((s.lines || "").length / 80))} value={s.lines}
                          placeholder="(silent beat)" onChange={(e) => updateScene((sc) => { sc.shots[idx].lines = e.target.value; })} />
                        <div className="grid2">
                          <input className="in tiny" value={s.camera} placeholder="camera" onChange={(e) => updateScene((sc) => { sc.shots[idx].camera = e.target.value; })} />
                          <input className="in tiny" value={s.purpose} placeholder="storytelling purpose" onChange={(e) => updateScene((sc) => { sc.shots[idx].purpose = e.target.value; })} />
                        </div>
                        {s.status !== "ready" ? (
                          <button className="minibtn" style={{ marginTop: 8 }} disabled={busy}
                            onClick={async () => { setBusy(true); setBusyMsg(`Writing prompts — shot ${s.slug}…`); try { await generateShotPrompts(s.id); } catch (e) { setError(`Shot ${s.slug} failed. (${e.message})`); } setBusy(false); }}>
                            ▸ GENERATE PROMPTS</button>
                        ) : (
                          <>
                            {[["STILL — GENERATE FIRST", "still"], ["VIDEO — FROM CHOSEN STILL", "video"], ["VOICE / DELIVERY", "voice"]].map(([tag, key]) => s[key] ? (
                              <div className="pblock" key={key}>
                                <div className="pbhead">
                                  <span className="ptag">{tag}</span>
                                  {/* Copy stays — it's still the fastest path for a service you already
                                      have open. SEND opens the generation panel on this shot: same
                                      prompt, plus the bible's identity locks carried as references. */}
                                  {key !== "voice" && (
                                    <button className="copybtn sm" onClick={(e) => { e.stopPropagation(); openGenForShot(scene, s, key); }}
                                      title={`Generate or hand off this ${key} on a linked service`}>
                                      <Sparkles size={10} /> SEND
                                    </button>
                                  )}
                                  <CopyBtn text={s[key]} small />
                                </div>
                                <textarea className="ta mono" rows={Math.min(8, Math.max(2, Math.ceil(s[key].length / 100)))} value={s[key]}
                                  onChange={(e) => updateScene((sc) => { sc.shots[idx][key] = e.target.value; })} />
                              </div>
                            ) : null)}
                            <div className="btnrow" style={{ marginTop: 8 }}>
                              <input className="in tiny grow" placeholder="correction notes — 'go wider, key from the window'…" value={s.notes}
                                onChange={(e) => updateScene((sc) => { sc.shots[idx].notes = e.target.value; })} />
                              <button className="minibtn" disabled={busy} onClick={async () => { setBusy(true); setBusyMsg(`Reworking ${s.slug}…`); try { await generateShotPrompts(s.id, s.notes); } catch (e) { setError(`Rework failed. (${e.message})`); } setBusy(false); }}>↻ REWORK</button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════ EDIT PAGE — resolve-style workspaces ════════ */}
        {page === "edit" && (
          <div className="editwrap" style={{ display: "flex", flexDirection: "column" }}>
            {prod && renderMenuBar()}
            {renderPoolCtx()}
            {marquee && <div style={{ position: "fixed", left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0), border: "1px solid #FF8C00", background: "rgba(255,140,0,0.12)", zIndex: 9998, pointerEvents: "none" }} />}
            <input ref={folderRelinkRef} type="file" webkitdirectory="" directory="" multiple style={{ display: "none" }}
              onChange={(e) => { relinkFromFolderFiles(e.target.files); e.target.value = ""; }} />
            {!prod && (
              <div className="dim center big-empty" style={{ margin: "auto" }}>
                Cut first, ask questions later.
                <div className="btnrow" style={{ justifyContent: "center", marginTop: 16 }}>
                  <button className="cta" onClick={createQuickProject}><Plus size={14} /> NEW QUICK PROJECT</button>
                  <button className="minibtn" onClick={() => setPage("productions")}>OPEN A PRODUCTION</button>
                </div>
                <div className="dim small" style={{ marginTop: 12 }}>Quick projects are full editors — documentaries, music videos, anything. The story layer is there when you want it.</div>
              </div>
            )}
            {prod && !container && (
              <div className="dim center big-empty" style={{ margin: "auto" }}>
                Pick a scene or an edit in the header — or start a fresh timeline.
                <div className="btnrow" style={{ justifyContent: "center", marginTop: 16 }}>
                  <button className="cta" onClick={() => newEdit()}><Plus size={14} /> NEW EDIT (STANDALONE TIMELINE)</button>
                </div>
              </div>
            )}
            {prod && container && (
              <>
                {renderRoomToolbar()}
                {editWs === "media" && <div className="btnrow"><button className="minibtn" onClick={()=>setRepairTab(false)}>MEDIA POOL</button><button className="minibtn" onClick={()=>setRepairTab(true)}>MEDIA REPAIR</button></div>}
                {editWs === "media" && repairTab && <MediaRepair assets={prod.mediaPool} selected={poolSel} onSelect={a=>{setPoolSel([a.id]);openInViewer(a,false);}} onRelink={openRelink} onReconnect={()=>rescanAll(true,true)} onBuildProxies={()=>buildProxiesFor()} />}
                {editWs === "media" && !repairTab && (
                  <div className="mediaws glass-dark"
                    onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                    onDrop={async (e) => {
                      if (!e.dataTransfer?.types?.includes("Files")) return;
                      e.preventDefault();
                      const picked = await readDroppedItems(e.dataTransfer);
                      if (!picked.length) { ping("Nothing readable was dropped."); return; }
                      const isScript = (n) => /\.(txt|md|fountain|markdown)$/i.test(n);
                      const scripts = picked.filter((p) => isScript(p.name)).map((p) => p.file);
                      const media = picked.filter((p) => !isScript(p.name));
                      if (scripts.length) importScriptFiles(scripts);
                      if (media.length) { const n = await importFilesToBins(media); ping(n ? `Imported ${n} dropped file${n === 1 ? "" : "s"}` : `Dropped ${media.length}, but 0 added (already imported).`); }
                    }}>
                    <div className="mwside">
                      <div className="mediasearch">
                        <Search size={12} />
                        <input value={mediaSearch} onChange={(e) => setMediaSearch(e.target.value)} placeholder="Search name, tag, folder…" />
                        {mediaSearch && <X size={12} style={{ cursor: "pointer" }} onClick={() => setMediaSearch("")} />}
                      </div>
                      <div className="paneltitle"><MonitorPlay size={12} /> BINS</div>
                      {["all", ...binTree()].map((b) => {
                        // count includes the bin's own assets + everything nested beneath it (subtree)
                        const count = b === "all" ? prod.mediaPool.length
                          : prod.mediaPool.filter((a) => { const ab = a.bin || "imports"; return ab === b || ab.startsWith(b + "/"); }).length;
                        const depth = b === "all" ? 0 : b.split("/").length - 1;
                        const leaf = b === "all" ? "ALL" : (b.split("/").pop() || b).toUpperCase();
                        return (
                          <button key={b} className={`binbtn ${binFilter === b ? "on" : ""}`} onClick={() => setBinFilter(b)}
                            style={depth ? { paddingLeft: 8 + depth * 12 } : undefined}
                            onDoubleClick={() => {
                              if (b === "all" || b === "imports") return;
                              if (count > 0) { ping("Move its assets out first, then the bin can be removed."); return; }
                              updateProd((p) => { p.bins = (p.bins || []).filter((x) => x !== b); });
                              if (binFilter === b) setBinFilter("all");
                            }}
                            title={b === "all" ? "" : b + (b === "imports" ? "" : " · double-click to remove empty bin")}>
                            {depth > 0 && <span className="bintree">└</span>}{leaf} <span className="catcount">{count}</span>
                          </button>
                        );
                      })}
                      <button className="binbtn" style={{ color: "var(--green)", borderColor: "rgba(120,220,150,0.3)" }}
                        onClick={() => {
                          const name = (window.prompt("New bin name") || "").trim();
                          if (!name) return;
                          updateProd((p) => { p.bins = p.bins || []; if (!p.bins.includes(name)) p.bins.push(name); });
                          setBinFilter(name);
                        }}>+ NEW BIN</button>
                      {/* Hidden folder input — the band-2 tool bar's FOLDER verb clicks this ref. */}
                      <input ref={editFolderRef} type="file" webkitdirectory="" directory="" multiple style={{ display: "none" }}
                        onChange={(e) => { importFolderMirror(e.target.files); e.target.value = ""; }} />
                      <div className="insp-div" />
                      <div className="dim small" style={{ marginTop: 2 }}>
                        {unsyncedCount ? `${unsyncedCount} local asset${unsyncedCount === 1 ? "" : "s"} not yet in the cloud — SYNC in the tool bar to work on this project from any device.` : "All media is in the cloud — this project is portable across devices."}
                      </div>
                      <div className="dim small" style={{ marginTop: 8 }}>Import, folder-mirror, generate and sync live in the tool bar. Folder bins populate Productions & SLATE automatically — a characters bin runs identity verification into the Cast; props/sets/lore route into the World.</div>
                    </div>
                    <div className="mwmain">
                    {(() => {
                      // Compute the filtered pool and the bin-option list ONCE per render (not once per
                      // card) — the old per-card `new Set(...mediaPool.map)` was O(n²) and, together with
                      // an unbounded grid of <video> thumbnails, hung/crashed the tab on large projects.
                      const filtered = poolFiltered();
                      const binOptions = Array.from(new Set(["imports", ...(prod.bins || []), ...(prod.mediaPool || []).map((x) => x.bin || "imports")]));
                      const perPage = mediaPageSize || 50;
                      const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
                      const page = Math.min(editPoolPage, pageCount);
                      const start = (page - 1) * perPage;
                      const shown = filtered.slice(start, start + perPage);
                      return (
                    <>
                    <div className="mwgrid" style={{ position: "relative" }} onMouseDown={startMarquee}>
                      {shown.map((a) => (
                        <div className={`mwcard ${previewAsset?.id === a.id ? "previewing" : ""}`} key={a.id} data-aid={a.id}
                          style={poolSel.includes(a.id) ? { outline: "2px solid #FF8C00", outlineOffset: -2, borderRadius: 6 } : undefined}
                          onClick={(e) => poolClick(e, a)} onContextMenu={(e) => poolContext(e, a)} onDoubleClick={() => openInViewer(a, true)} title="Click: select + view · Double-click: load & play · Right-click: menu · Drag: marquee-select">
                          <div className="mwthumb">
                            {a.url && (a.type === "image" || a.type === "graphic") && <img src={a.url} alt="" loading="lazy" />}
                            {a.url && a.type === "video" && <ScrubThumb url={a.url} />}
                            {(!a.url || !["image", "graphic", "video"].includes(a.type)) && <span className="wext">{{ audio: "♪", model: "3D", text: "TXT", multicam: "MC" }[a.type] || "FILE"}</span>}
                            {(a.type === "video" || a.type === "audio") && (
                              <input type="checkbox" className="mcchk mwchk" checked={mcSel.includes(a.id)} onClick={(e) => e.stopPropagation()}
                                onChange={() => setMcSel((s) => s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id])} />
                            )}
                          </div>
                          <span className="poolname">{a.name}</span>
                          <div className="btnrow" style={{ gap: 4, marginTop: 3 }}>
                            <span className={`pooltype ${a.type}`}>{{ video: "VID", audio: "AUD", image: "IMG", multicam: "MC", model: "3D", graphic: "GFX", text: "TXT", lottie: "LOT" }[a.type] || "FILE"}</span>
                            <select value={a.bin || "imports"} onClick={(e) => e.stopPropagation()} title="Bin"
                              onChange={(e) => { const nb = e.target.value; updateProd((p) => { const x = p.mediaPool.find((y) => y.id === a.id); if (x) x.bin = nb; }); }}
                              style={{ fontSize: 8, background: "rgba(0,0,0,0.4)", color: "#bbb", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 3, maxWidth: 68 }}>
                              {binOptions.map((b) => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                            {["image", "video", "graphic"].includes(a.type) && (
                              <button className={`chip ${a.designation === "frame" ? "blue" : "dimchip"}`} style={{ border: "none", cursor: "pointer" }}
                                onClick={() => updateProd((p) => { const x = p.mediaPool.find((y) => y.id === a.id); if (x) x.designation = x.designation === "frame" ? "concept" : "frame"; })}>
                                {a.designation === "frame" ? "🎞" : "✎"}
                              </button>
                            )}
                            {(!a.pixels && (!a.url || a.offline)) && <button className="chip blue" style={{ fontSize: 7, border: "none", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); openRelink(a.id); }} title="Relink to a local file">🔗 RELINK</button>}
                          </div>
                        </div>
                      ))}
                      {filtered.length === 0 && (prod.mediaPool || []).length > 0 && (binFilter !== "all" || mediaSearch) && (
                        <div className="dim small" style={{ gridColumn: "1 / -1", padding: 8 }}>No media matches the current bin/search. <button className="linkbtn" onClick={() => { setBinFilter("all"); setMediaSearch(""); }}>Show all {(prod.mediaPool || []).length} →</button></div>
                      )}
                      {mcSel.length >= 2 && (
                        <button className="minibtn full" style={{ gridColumn: "1 / -1" }} onClick={createMulticam}><Layers size={12} /> CREATE MULTICAM ({mcSel.length} ANGLES)</button>
                      )}
                    </div>
                    {filtered.length > perPage && (
                      <div className="btnrow" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 8 }}>
                        <div className="dim small">{start + 1}–{Math.min(start + perPage, filtered.length)} of {filtered.length}</div>
                        <div className="btnrow" style={{ gap: 6, alignItems: "center" }}>
                          <button className="minibtn" disabled={page <= 1} onClick={() => setEditPoolPage(Math.max(1, page - 1))}>‹ Prev</button>
                          <span className="dim small">{page} / {pageCount}</span>
                          <button className="minibtn" disabled={page >= pageCount} onClick={() => setEditPoolPage(Math.min(pageCount, page + 1))}>Next ›</button>
                          <select value={perPage} onChange={(e) => setMediaPageSize(Number(e.target.value))}
                            style={{ fontSize: 10, background: "rgba(0,0,0,0.4)", color: "#bbb", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 3 }}>
                            {[25, 50, 75].map((n) => <option key={n} value={n}>{n}/page</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                    </>
                      );
                    })()}
                    </div>

                    {/* ── ASSET INSPECTOR — real technical metadata + a used-in backlink, so you can
                          see what a clip is doing in the cut before you touch it (Mockup-D). ── */}
                    {(() => {
                      const a = previewAsset || (poolSel.length === 1 ? (prod.mediaPool || []).find((x) => x.id === poolSel[0]) : null);
                      if (!a) return (
                        <aside className="mwinsp glass-dark">
                          <div className="lbl">ASSET</div>
                          <div className="dim small" style={{ marginTop: 8, lineHeight: 1.6 }}>Click a clip to inspect it — codec, size, and everywhere it lands in the cut.</div>
                        </aside>
                      );
                      const usedIn = clips.filter((c) => c.assetId === a.id);
                      const kindTab = a.type === "audio" ? "var(--green)" : a.type === "image" || a.type === "graphic" ? "var(--yel)" : a.type === "multicam" ? "var(--pur)" : "var(--blue)";
                      const rows = [
                        ["TYPE", (a.type || "?").toUpperCase()],
                        a.duration ? ["LENGTH", fmtTc(a.duration, vfmt)] : null,
                        ["BIN", a.bin || "imports"],
                        a.designation ? ["ROLE", a.designation === "frame" ? "FRAME / STILL" : "EDIT MEDIA"] : null,
                        [a.cloudUrl || !a.session ? "CLOUD" : "LOCAL", a.cloudUrl || !a.session ? "SYNCED" : "LOCAL ONLY"],
                        a.needsConversion ? ["CODEC", a.converted ? "CONVERTED" : "NEEDS CONVERT"] : null,
                      ].filter(Boolean);
                      return (
                        <aside className="mwinsp glass-dark idleft" style={{ "--tab": kindTab }}>
                          <div className="isec"><span className="lbl" style={{ flex: 1 }}>ASSET</span>
                            <span className="chip dimchip">{(a.type || "?").toUpperCase()}</span></div>
                          <div className="mwipreview">
                            {a.url && (a.type === "image" || a.type === "graphic") && <img src={a.url} alt="" />}
                            {a.url && a.type === "video" && <ScrubThumb url={a.url} />}
                            {(!a.url || !["image", "graphic", "video"].includes(a.type)) && <span className="wext">{{ audio: "♪", model: "3D", text: "TXT", multicam: "MC" }[a.type] || "?"}</span>}
                          </div>
                          <div style={{ fontSize: 10.5, fontWeight: 800, color: "#eee", wordBreak: "break-all" }}>{a.name}</div>
                          <div className="dtable" style={{ marginTop: 2 }}>
                            {rows.map(([k, v]) => (
                              <div key={k}><span className="param">{k}</span><span className="numval">{v}</span></div>
                            ))}
                          </div>
                          {a.offline && <span className="chip red" style={{ alignSelf: "flex-start" }}>OFFLINE — RELINK</span>}
                          <div className="lbl" style={{ marginTop: 4 }}>USED IN <span className="cap">{usedIn.length} PLACE{usedIn.length === 1 ? "" : "S"}</span></div>
                          {usedIn.length ? usedIn.sort((x, y) => x.start - y.start).map((c) => (
                            <button key={c.id} className="srow idleft" style={{ "--tab": "var(--org)", width: "100%", background: "rgba(0,0,0,.3)", border: "1px solid var(--line-2)" }}
                              onClick={() => { setEditWs("edit"); setSelClipId(c.id); setPlayhead(c.start); }} title="Jump to this clip in the edit">
                              <span className="numval" style={{ fontSize: 9 }}>{fmtTc(c.start, vfmt)}</span>
                              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{c.label || a.name}</span>
                            </button>
                          )) : <div className="dim small">Not on the timeline yet.</div>}
                          {a.tags?.length ? (
                            <>
                              <div className="lbl" style={{ marginTop: 4 }}>TAGS</div>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{a.tags.map((t) => <span key={t} className="chip dimchip">{t}</span>)}</div>
                            </>
                          ) : null}
                        </aside>
                      );
                    })()}
                  </div>
                )}

                {editWs === "edit" && (
                  <>
                    <div className="edit-upper">
                      {renderPool()}
                      <div className="hsplit" title="Drag to resize the media pool" onMouseDown={(e) => startPanelResize(e, "pool")} />
                      {fxLibOpen && (
                        <div className="resizable-fx" style={{ width: panelSize("effects", 224) }}><FxLibraryPanel prod={prod} selClipId={selClipId}
                          onApplyFilter={applyFxPreset}
                          onAddForge={addForgeEffect}
                          onAddTransition={addForgeTransition}
                          onApplyLook={applyForgeLook}
                          onInsertGenerator={insertGenerator}
                          onInsertLottie={(a) => {
                            if (!(prod?.mediaPool || []).some((item) => item.id === a.id)) addAssetToPool(a);
                            insertAssetClip(a);
                          }}
                          onImportLottie={() => fileRef.current?.click()}
                          onOpenFxPage={() => setEditWs("vfx")}
                          onClose={() => { setFxLibOpen(false); try { localStorage.setItem("fabula:fxlib", "0"); } catch { /* */ } }} /></div>
                      )}
                      {fxLibOpen && divider("effects", 224, { max: 600 })}
                      <div className="dualview" style={{ gridTemplateColumns: `minmax(120px, ${panelSize("viewers", 45)}fr) 8px minmax(120px, ${100 - panelSize("viewers", 45)}fr)` }}>
                        {renderSource()}
                        <PanelDivider percent label="Resize source and program viewers" value={panelSize("viewers", 45)} min={15} max={85} onChange={(n) => setPanelSizes((old) => ({ ...old, viewers: n }))} />
                        {renderMonitor()}
                      </div>
                      <div className="hsplit" title="Drag to resize the inspector" onMouseDown={(e) => startPanelResize(e, "insp")} />
                      {renderInspector()}
                    </div>
                    {renderTimeline()}
                  </>
                )}

                {editWs === "vfx" && (() => {
                  // Four-band VFX/COMP: monitor + inspector reference surface; the three authoring
                  // tools (comp / lottie / capture) become a tabbed control band.
                  const VTABS = [["nodes", "NODE GRAPH"], ["comp", "AI COMPOSITE"], ["data", "DATA MOTION"], ["systems", "BROADCAST SYSTEMS"], ["lottie", "LOTTIE"], ["capture", "PERFORM CAPTURE"]];
                  return (
                    <div className="vfxroom">
                      <div className="vfxstage edit-upper" style={{ height: panelSize("vfx viewer height", 280) }}>
                        {renderMonitor()}
                        <div className="hsplit" title="Resize VFX inspector" onMouseDown={(e) => startPanelResize(e, "insp")} />
                        {renderInspector()}
                      </div>
                      {divider("vfx viewer height", 280, { vertical: true, max: 700 })}
                      <div className="vfxctrl glass-dark">
                        <div className="vfxtabs">
                          <span className="troom">VFX</span>
                          <span className="tdiv" />
                          <span className="segx">
                            {VTABS.map(([id, lab]) => (
                              <button key={id} className={vfxTab === id ? "on" : ""} onClick={() => setVfxTab(id)}>{lab}</button>
                            ))}
                          </span>
                        </div>
                        <div className="vfxbody">
                          {vfxTab === "comp" && (
                            <CompBuilder prod={prod} askAI={callClaudeJson} ping={ping}
                              onAddToPool={(snapshot, nm) => {
                                const asset = { id: uid(), name: nm + " (comp)", type: "graphic", generated: true, duration: 8, bin: "comps", pixels: snapshot };
                                updateProd((p) => { p.mediaPool.push(asset); });
                                ping(`🎇 "${nm}" is in the media pool — drop it on the timeline like a clip`);
                              }} />
                          )}
                          {vfxTab === "nodes" && (
                            <NodeGraphEditor ping={ping} palette={prod?.pixelsConfig?.colorPalette}
                              onAddToPool={(snapshot, nm) => {
                                const asset = { id: uid(), name: nm + " (graph)", type: "graphic", generated: true, duration: 8, bin: "comps", pixels: snapshot };
                                updateProd((p) => { p.mediaPool.push(asset); });
                                ping(`Node graph "${nm}" is in the media pool — drop it on the timeline`);
                              }} />
                          )}
                          {vfxTab === "lottie" && <LottieBuilder onAddToPool={addLottieBlobToPool} />}
                          {vfxTab === "data" && <DataVizBuilder ping={ping} onAddToPool={(chart,nm) => { const asset={id:uid(),name:nm+' (data)',type:'graphic',generated:true,duration:8,bin:'data motion',chart};updateProd(p=>{p.mediaPool.push(asset)}); }} />}
                          {vfxTab === "systems" && <BroadcastSystemsLibrary ping={ping} onAddTemplate={(template) => addBroadcastGraphic(template)} />}
                          {vfxTab === "capture" && <PerformCapture onTake={addTakeToPool} ping={ping} />}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {editWs === "color" && (() => {
                  // \\u2550\\u2550 BAND 3 (work surface): monitor-dominant \\u2014 big program monitor + a
                  //    scopes column. Grade controls drop to BAND 4 below (tabbed banks).
                  //    Mockup-A restructure: the picture no longer competes with the sliders.
                  const gradeable = selClip && selClip.kind !== "voice";
                  const fx = gradeable ? ensureFx(selClip) : null;
                  const gv = (k, d = 0) => (fx && fx[k] != null ? fx[k] : d);
                  // GRADE LAYERS (H2): the flat fx is layer 0 (base); fx.grades[] are secondaries.
                  // The wheels/curves/qualifier/windows tabs edit whichever layer is selected.
                  const gLayers = fx ? [{ base: true }, ...(fx.grades || [])] : [];
                  const gi = Math.min(gradeLayer, gLayers.length - 1);
                  const layerData = fx ? (gi === 0 ? fx : (fx.grades?.[gi - 1] || {})) : {};
                  const setLayer = (patch) => {
                    if (!selClip) return;
                    if (gi === 0) { updateFx(selClip.id, patch); return; }
                    const grades = [...(fx.grades || [])];
                    while (grades.length < gi) grades.push({ enabled: true });
                    grades[gi - 1] = { ...grades[gi - 1], ...patch };
                    updateFx(selClip.id, { grades });
                  };
                  const wheel = fx ? { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], temp: 0, tint: 0, ...(layerData.wheel || {}) } : null;
                  const setWheel = (patch) => setLayer({ wheel: { ...wheel, ...patch } });
                   const slider = (lbl, key, min, max, step, def = 0) => (
                    <div className="fxrow" key={key}>
                      <span className="fxlbl param">{lbl}</span>
                      <input type="range" min={min} max={max} step={step} value={gv(key, def)} onChange={(e) => updateFx(selClip.id, { [key]: parseFloat(e.target.value) })}
                        onDoubleClick={() => updateFx(selClip.id, { [key]: def })} />
                      <span className="fxval numval">{Number(gv(key, def)).toFixed(2)}</span>
                    </div>
                   );
                   const toneInst = fx?.stack?.find((s) => s.effectId === "developtone");
                   const finishInst = fx?.stack?.find((s) => s.effectId === "developfinish");
                   const developValues = { ...DEFAULT_PHOTO_ADJUSTMENTS, ...(toneInst?.params || {}), ...(finishInst?.params || {}) };
                   const setDevelop = (key, value) => {
                     const values = { ...developValues, [key]: value };
                     const compiled = photoAdjustmentsToEffects(values);
                     const rest = (fx?.stack || []).filter((s) => s.effectId !== "developtone" && s.effectId !== "developfinish");
                     updateFx(selClip.id, { stack: [...rest, ...compiled] });
                   };
                   const devSlider = (lbl, key, min = -100, max = 100) => (
                     <div className="fxrow" key={key}><span className="fxlbl param">{lbl}</span>
                       <input type="range" min={min} max={max} step="0.1" value={developValues[key] || 0} onChange={(e) => setDevelop(key, parseFloat(e.target.value))} onDoubleClick={() => setDevelop(key, 0)} />
                       <span className="fxval numval">{Number(developValues[key] || 0).toFixed(1)}</span></div>
                   );
                  // Declared BEFORE glg (which spreads them) — order matters (const TDZ).
                  const curveLut = fx && !isCurvesIdentity(fx.curves) ? buildCurveLut(fx.curves) : undefined;
                  const qual = layerData.qualifier || null;
                  const setQual = (patch) => setLayer({ qualifier: { ...QUALIFIER_DEFAULT, ...(layerData.qualifier || {}), ...patch } });
                  const win = layerData.window || null;
                  const setWin = (patch) => setLayer({ window: { ...WINDOW_DEFAULT, ...(layerData.window || {}), ...patch } });
                  const hasGrade = fx && (!!curveLut || !isQualifierIdentity(fx.qualifier)
                    || (fx.wheel && ((fx.wheel.lift || []).some((v) => v !== 0) || (fx.wheel.gamma || []).some((v) => v !== 1) || (fx.wheel.gain || []).some((v) => v !== 1) || fx.wheel.temp || fx.wheel.tint)));
                  const glg = fx ? {
                    lift: fx.wheel?.lift, gamma: fx.wheel?.gamma, gain: fx.wheel?.gain,
                    temp: fx.wheel?.temp || 0, tint: fx.wheel?.tint || 0,
                    contrast: fx.con ?? 1, sat: fx.sat ?? 1, hue: ((fx.hue || 0) * Math.PI) / 180,
                    ...(curveLut ? { curveLut } : {}),
                    ...(!isQualifierIdentity(fx.qualifier) ? { qualifier: fx.qualifier } : {}),
                    ...(hasGrade && isWindowEnabled(fx.window) ? { window: fx.window } : {}),
                  } : null;
                  // The live grade monitor gets the SAME layer stack the export bakes.
                  const monToGrade = (g) => ({ lift: g.wheel?.lift, gamma: g.wheel?.gamma, gain: g.wheel?.gain, temp: g.wheel?.temp || 0, tint: g.wheel?.tint || 0,
                    ...(g.curves && !isCurvesIdentity(g.curves) ? { curveLut: buildCurveLut(g.curves) } : {}),
                    ...(g.qualifier && !isQualifierIdentity(g.qualifier) ? { qualifier: g.qualifier } : {}),
                    ...(isWindowEnabled(g.window) ? { window: g.window } : {}) });
                  const extraMon = (fx?.grades || []).filter((g) => g && g.enabled !== false).map(monToGrade);
                  const glgStack = extraMon.length ? [glg, ...extraMon].filter(Boolean) : null;
                  const CTABS = [["looks", "LOOKS"], ["develop", "DEVELOP"], ["wheels", "WHEELS"], ["curves", "CURVES"], ["qualifier", "QUALIFIER"], ["windows", "WINDOWS"], ["primaries", "PRIMARIES"]];
                  const stillOn = colorStills.find((st) => st.id === wipeStill) || null;
                  const grabStill = () => {
                    const cv = gradeMonRef.current;
                    if (!cv) { ping("Play or scrub so the grade monitor has a frame first."); return; }
                    try {
                      const url = cv.toDataURL("image/jpeg", 0.85);
                      const st = { id: uid(), url, label: `${selClip ? selClip.label.slice(0, 10) : "STILL"} · ${fmtTc(playhead, vfmt)}` };
                      setColorStills((cur) => [...cur.slice(-11), st]);
                      ping("Still grabbed — click it to wipe against the live grade.");
                    } catch { ping("Could not grab — the monitor canvas is protected (cross-origin media)."); }
                  };
                  const layerChips = (g, isBase) => {
                    const chips = [];
                    const w2 = g.wheel;
                    if (w2 && ((w2.lift || []).some((v) => v !== 0) || (w2.gamma || []).some((v) => v !== 1) || (w2.gain || []).some((v) => v !== 1) || w2.temp || w2.tint)) chips.push(["WHEELS", "dim"]);
                    if (g.curves && !isCurvesIdentity(g.curves)) chips.push(["CURVES", "dim"]);
                    if (g.qualifier && !isQualifierIdentity(g.qualifier)) chips.push(["HSL KEY", "amb"]);
                    if (isWindowEnabled(g.window)) chips.push([(g.window.shape === "rect" ? "RECT" : "ELLIPSE"), "blue"]);
                    if (isBase && !chips.length) chips.push(["PRIMARIES", "dim"]);
                    if (!chips.length) chips.push(["EMPTY", "dim"]);
                    return chips;
                  };
                  return (
                    <div className="colorroom">
                      {/* ── STILLS & VERSIONS (Mockup A #1): grab reference stills off the grade
                          monitor; click one to A/B-wipe it against the live grade. ── */}
                      <div className="cgallery glass-dark">
                        <span className="lbl" style={{ margin: 0 }}>STILLS &amp; VERSIONS</span>
                        {stillOn && <span className="chip amb">A/B WIPE ON</span>}
                        <div className="cgal-strip">
                          {colorStills.map((st) => (
                            <div key={st.id} className={`cstill ${wipeStill === st.id ? "on" : ""}`}
                              title="Click: wipe against the live grade · double-click: remove"
                              onClick={() => setWipeStill(wipeStill === st.id ? null : st.id)}
                              onDoubleClick={() => { setColorStills((cur) => cur.filter((x) => x.id !== st.id)); if (wipeStill === st.id) setWipeStill(null); }}>
                              <img src={st.url} alt="" /><span>{st.label}</span>
                            </div>
                          ))}
                          {!colorStills.length && <span className="dim small" style={{ alignSelf: "center" }}>Grab stills to compare grades across shots.</span>}
                        </div>
                        <button className="minibtn" style={{ marginLeft: "auto" }} onClick={grabStill}>GRAB STILL</button>
                      </div>
                      <div className="colorstage">
                        <div className="colormon">{renderMonitor()}</div>
                        {divider("color scopes", 300, { reverse: true, max: 700 })}<aside className="colorscopes glass-dark" style={{ width: panelSize("color scopes", 300), minWidth: 150 }}>
                          <div className="paneltitle">GRADE MONITOR <span className="cap">GPU &middot; EXPORT-EXACT</span>
                            {eyedrop && <span className="chip amb" style={{ marginLeft: "auto" }}>CLICK TO SAMPLE</span>}</div>
                          <div style={{ position: "relative", cursor: eyedrop ? "crosshair" : "default" }}
                            onClick={eyedrop ? (e) => {
                              const cv = gradeMonRef.current; if (!cv || !selClip) return;
                              const r = cv.getBoundingClientRect();
                              const x = Math.round(((e.clientX - r.left) / r.width) * cv.width);
                              const y = Math.round(((e.clientY - r.top) / r.height) * cv.height);
                              try {
                                const ctx = cv.getContext("2d");
                                let px;
                                if (ctx) { px = ctx.getImageData(x, y, 1, 1).data; }
                                else { const g2 = document.createElement("canvas"); g2.width = cv.width; g2.height = cv.height; const c2 = g2.getContext("2d"); c2.drawImage(cv, 0, 0); px = c2.getImageData(x, y, 1, 1).data; }
                                updateFx(selClip.id, { qualifier: keyFromPixel(px[0] / 255, px[1] / 255, px[2] / 255, fx?.qualifier) });
                                setEyedrop(false); setColorTab("qualifier"); ping("Keyed the sampled colour");
                              } catch { ping("Could not sample — try again."); }
                            } : undefined}>
                            <GradePreview videoRef={videoRef} grade={glg} grades={glgStack} outRef={gradeMonRef} />
                            {stillOn && (
                              <>
                                <img src={stillOn.url} alt="" draggable={false}
                                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
                                    clipPath: `inset(0 ${Math.round((1 - wipePos) * 100)}% 0 0)`, pointerEvents: "none" }} />
                                <div className="wipebar" style={{ left: `${wipePos * 100}%` }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    const host = e.currentTarget.parentElement.getBoundingClientRect();
                                    const mv = (ev) => setWipePos(Math.max(0.02, Math.min(0.98, (ev.clientX - host.left) / host.width)));
                                    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
                                    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
                                  }} />
                                <span className="wipetag a">STILL</span>
                                <span className="wipetag b">LIVE GRADE</span>
                              </>
                            )}
                          </div>
                          <div className="paneltitle" style={{ marginTop: 8 }}>SCOPES <span className="cap">POST-GRADE</span></div>
                          <ColorScopes sourceRef={gradeMonRef} />
                          <div className="dim small" style={{ marginTop: 8, lineHeight: 1.5 }}>Waveform: exposure (skin ~55&ndash;70%). Parade: channel balance. Vectorscope: skin hugs the orange line. Histogram: watch the ends for clipping.</div>
                        </aside>
                        {/* ── GRADE STACK rail (Mockup A #2): base + secondaries as cards; the
                            control tabs below edit whichever layer is selected. ── */}
                        {gradeable && (
                          <aside className="graderail glass-dark">
                            <div className="paneltitle">GRADE STACK</div>
                            {gLayers.map((g, i) => {
                              const data = i === 0 ? fx : (fx.grades?.[i - 1] || {});
                              const off = i > 0 && g.enabled === false;
                              return (
                                <div key={i} className={`glayer ${gi === i ? "on" : ""} ${off ? "off" : ""}`} onClick={() => setGradeLayer(i)}>
                                  <div className="gl-top">
                                    <span className="gl-name">{i === 0 ? "Base" : `Secondary ${i}`}</span>
                                    {i > 0 && (
                                      <button className="gl-eye" title={off ? "Enable layer" : "Bypass layer"}
                                        onClick={(e) => { e.stopPropagation(); const grades = [...(fx.grades || [])]; grades[i - 1] = { ...grades[i - 1], enabled: off }; updateFx(selClip.id, { grades }); }}>
                                        {off ? "◌" : "◉"}</button>
                                    )}
                                    {i > 0 && gi === i && (
                                      <button className="gl-eye" title="Delete layer" style={{ color: "#ff9a9a" }}
                                        onClick={(e) => { e.stopPropagation(); const grades = (fx.grades || []).filter((_, k) => k !== i - 1); updateFx(selClip.id, { grades }); setGradeLayer(Math.max(0, gi - 1)); }}>✕</button>
                                    )}
                                  </div>
                                  <div className="gl-meta">{layerChips(data, i === 0).map(([lab, tone], ci) => <span key={ci} className={`chip ${tone}`}>{lab}</span>)}</div>
                                </div>
                              );
                            })}
                            <button className="minibtn full" style={{ marginTop: "auto" }}
                              onClick={() => { const grades = [...(fx.grades || []), { enabled: true }]; updateFx(selClip.id, { grades }); setGradeLayer(grades.length); }}>＋ LAYER</button>
                          </aside>
                        )}
                      </div>

                      {divider("color controls", 260, { vertical: true, reverse: true, max: 650 })}<div className="colorctrl glass-dark" style={{ height: panelSize("color controls", 260), maxHeight: "none" }}>
                        <div className="colortabs">
                          <span className="troom">COLOR</span>
                          <span className="tdiv" />
                          <span className="segx">
                            {CTABS.map(([id, lab]) => (
                              <button key={id} className={colorTab === id ? "on" : ""} onClick={() => setColorTab(id)}>{lab}</button>
                            ))}
                          </span>
                          {gradeable && gi > 0 && <span className="chip pur" style={{ marginLeft: 6 }}>EDITING · SECONDARY {gi}</span>}
                          {gradeable && <span className="chip pur" style={{ marginLeft: "auto" }}>{selClip.label}</span>}
                          {prod.design?.lookId && <span className="chip amb">{(LOOKS.find((l) => l.id === prod.design.lookId) || {}).name}</span>}
                        </div>

                        <div className="colorbody">
                          {colorTab === "looks" && (
                            <div>
                            <div className="colorlooks wide">
                              {LOOKS.map((lk) => (
                                <button key={lk.id} className={`lookcard ${prod.design.lookId === lk.id ? "on" : ""}`}
                                  onClick={() => updateProd((p) => { p.design.lookId = p.design.lookId === lk.id ? null : lk.id; })}>
                                  <div className="lookswatch">{lk.sw.map((sw, si) => <i key={si} style={{ background: sw }} />)}</div>
                                  <b>{lk.name}</b>
                                </button>
                              ))}
                            </div>
                            {gradeable && <>
                              <div className="lbl" style={{ margin: "12px 0 7px" }}>INSPIRE · CLIP LOOKS <span className="cap">NONDESTRUCTIVE · PHOTO + VIDEO</span></div>
                              <div className="colorlooks wide">
                                {CREATIVE_LOOKS.map((lk) => (
                                  <button key={lk.id} className="lookcard" onClick={() => {
                                    const a = lk.adjustments;
                                    updateFx(selClip.id, {
                                      bri: 1 + ((a.exposure || 0) + (a.brilliance || 0) * .35 + (a.whites || 0) * .15) / 100,
                                      con: 1 + ((a.contrast || 0) + (a.structure || 0) * .35 + (a.dehaze || 0) * .4 - (a.fade || 0) * .3) / 100,
                                      sat: 1 + (a.saturation || 0) / 100,
                                      warm: Math.max(0, (a.warmth || 0) / 100), hue: (a.tint || 0) * .04,
                                      inspireLook: lk.id,
                                    });
                                    ping(`${lk.label} applied to ${selClip.label}`);
                                  }}><b>{lk.label}</b></button>
                                ))}
                              </div>
                            </>}
                            </div>
                          )}

                          {colorTab === "wheels" && (gradeable ? (
                            <div className="gradepanels">
                              <div className="gpanel">
                                <div className="lbl">COLOR WHEELS <span className="cap">GPU &middot; EXPORTS ON THE COMPOSITOR</span></div>
                                <ColorWheels wheel={wheel} setWheel={setWheel} />
                              </div>
                              <div className="gpanel narrow">
                                <div className="lbl">TEMP / TINT</div>
                                <div className="insp-row"><span className="param" style={{ width: 40 }}>TEMP</span>
                                  <input type="range" min="-0.3" max="0.3" step="0.005" value={wheel.temp} onChange={(e) => setWheel({ temp: parseFloat(e.target.value) })} onDoubleClick={() => setWheel({ temp: 0 })} />
                                  <span className="insp-val numval">{wheel.temp.toFixed(2)}</span></div>
                                <div className="insp-row"><span className="param" style={{ width: 40 }}>TINT</span>
                                  <input type="range" min="-0.3" max="0.3" step="0.005" value={wheel.tint} onChange={(e) => setWheel({ tint: parseFloat(e.target.value) })} onDoubleClick={() => setWheel({ tint: 0 })} />
                                  <span className="insp-val numval">{wheel.tint.toFixed(2)}</span></div>
                              </div>
                            </div>
                          ) : <div className="dim small colorempty">Select a clip in the EDIT room &mdash; or click one in the timeline below &mdash; to grade it. Scopes read the program monitor live.</div>)}

                          {colorTab === "develop" && (gradeable ? (
                            <div className="gradepanels">
                              <div className="gpanel"><div className="lbl">LIGHT <span className="cap">LINEAR-LIGHT · EXPORT EXACT</span></div>
                                {devSlider("EXPOSURE", "exposure")}{devSlider("CONTRAST", "contrast")}{devSlider("HIGHLIGHTS", "highlights")}{devSlider("SHADOWS", "shadows")}{devSlider("WHITES", "whites")}{devSlider("BLACKS", "blacks")}
                              </div>
                              <div className="gpanel"><div className="lbl">COLOR & PRESENCE <span className="cap">SHARED WITH PHOTO DEVELOP</span></div>
                                {devSlider("TEMPERATURE", "warmth")}{devSlider("TINT", "tint")}{devSlider("SATURATION", "saturation")}{devSlider("BRILLIANCE", "brilliance")}{devSlider("CLARITY", "clarity")}{devSlider("STRUCTURE", "structure")}{devSlider("DEHAZE", "dehaze")}
                              </div>
                              <div className="gpanel"><div className="lbl">FINISH</div>
                                {devSlider("FADE", "fade")}{devSlider("VIGNETTE", "vignette")}{devSlider("GRAIN", "grain", 0, 100)}
                                <button className="minibtn full" onClick={() => { const rest=(fx?.stack||[]).filter((s)=>s.effectId!=="developtone"&&s.effectId!=="developfinish"); updateFx(selClip.id,{stack:rest}); }}>RESET DEVELOP</button>
                              </div>
                            </div>
                          ) : <div className="dim small colorempty">Select a photo or video clip to use the shared Develop controls.</div>)}

                          {colorTab === "curves" && (gradeable ? (
                            <div className="gradepanels">
                              <div className="gpanel" style={{ flex: "0 0 auto" }}>
                                <div className="lbl">TONE CURVES <span className="cap">GPU &middot; EXPORT-EXACT</span></div>
                                <CurveEditor curves={layerData.curves} onChange={(c) => setLayer({ curves: c })} width={264} height={264} />
                              </div>
                              <div className="gpanel narrow">
                                <div className="lbl">CURVE</div>
                                <div className="dim small" style={{ lineHeight: 1.6 }}>
                                  Click the line to add a point, drag to shape it, double-click a point to remove it.
                                  <b style={{ color: "#f2f2f5" }}> Y</b> is the master (luma) curve; <b style={{ color: "#ff7a7a" }}>R</b>/<b style={{ color: "#7ee2a8" }}>G</b>/<b style={{ color: "#7ab8ff" }}>B</b> shift colour per channel.
                                  A soft <b>S</b> adds filmic contrast; lifting the bottom-left raises the black point.
                                </div>
                                <button className="minibtn" style={{ marginTop: 8 }} onClick={() => setLayer({ curves: undefined })}>RESET ALL CURVES</button>
                              </div>
                            </div>
                          ) : <div className="dim small colorempty">Select a clip to shape its tone curves.</div>)}

                          {colorTab === "qualifier" && (gradeable ? (() => {
                            const q = { ...QUALIFIER_DEFAULT, ...(qual || {}) };
                            const qrow = (lbl, key, min, max, step = 0.005, fmt = (v) => v.toFixed(2)) => (
                              <div className="insp-row" key={key}><span className="param" style={{ width: 62 }}>{lbl}</span>
                                <input type="range" min={min} max={max} step={step} value={q[key]}
                                  onChange={(e) => setQual({ [key]: parseFloat(e.target.value) })} />
                                <span className="insp-val numval">{fmt(q[key])}</span></div>
                            );
                            const active = !isQualifierIdentity(qual);
                            return (
                              <div className="gradepanels">
                                <div className="gpanel">
                                  <div className="isec"><span className="lbl" style={{ flex: 1 }}>KEY <span className="cap">HSL SECONDARY &middot; GPU EXPORT-EXACT</span></span>
                                    {active && <span className="chip pur">KEYED</span>}</div>
                                  <div className="btnrow" style={{ gap: 6, marginBottom: 6 }}>
                                    <button className={`minibtn ${eyedrop ? "on" : ""}`} onClick={() => setEyedrop((v) => !v)} title="Then click the grade monitor to key that colour">⦿ EYEDROPPER</button>
                                    <button className={`minibtn ${q.show ? "blue" : ""}`} onClick={() => setQual({ show: !q.show })} title="Show the key as a matte">◑ SHOW KEY</button>
                                    <button className="minibtn danger" onClick={() => setLayer({ qualifier: undefined })}>RESET</button>
                                  </div>
                                  {qrow("HUE", "h", 0, 1)}
                                  {qrow("HUE WIDTH", "hw", 0.005, 0.5)}
                                  {qrow("SAT LOW", "sl", 0, 1)}
                                  {qrow("SAT HIGH", "sh", 0, 1)}
                                  {qrow("LUM LOW", "ll", 0, 1)}
                                  {qrow("LUM HIGH", "lh", 0, 1)}
                                  {qrow("SOFTNESS", "soft", 0, 0.4)}
                                </div>
                                <div className="gpanel narrow">
                                  <div className="lbl">CORRECTION <span className="cap">INSIDE THE KEY</span></div>
                                  {qrow("HUE SHIFT", "dHue", -0.5, 0.5)}
                                  {qrow("SATURATION", "mSat", 0, 3, 0.01)}
                                  {qrow("LUMINANCE", "mLum", 0, 3, 0.01)}
                                  <div className="dim small" style={{ marginTop: 8, lineHeight: 1.6 }}>
                                    Eyedrop a colour, tune the ranges (turn on <b>Show Key</b> to see exactly what it grabs), then shift hue / sat / lum only inside it. The correction bakes into the export.
                                  </div>
                                </div>
                              </div>
                            );
                          })() : <div className="dim small colorempty">Select a clip to isolate a colour with the HSL qualifier.</div>)}

                          {colorTab === "windows" && (gradeable ? (() => {
                            const wv = { ...WINDOW_DEFAULT, ...(win || {}) };
                            const wrow = (lbl, key, min, max, step = 0.005, fmt = (v) => v.toFixed(2)) => (
                              <div className="insp-row" key={key}><span className="param" style={{ width: 62 }}>{lbl}</span>
                                <input type="range" min={min} max={max} step={step} value={wv[key]}
                                  onChange={(e) => setWin({ [key]: parseFloat(e.target.value) })} />
                                <span className="insp-val numval">{fmt(wv[key])}</span></div>
                            );
                            return (
                              <div className="gradepanels">
                                <div className="gpanel">
                                  <div className="isec"><span className="lbl" style={{ flex: 1 }}>POWER WINDOW <span className="cap">LIMITS THE GRADE TO A REGION</span></span>
                                    {isWindowEnabled(win) && <span className="chip pur">ON</span>}</div>
                                  <div className="btnrow" style={{ gap: 6, marginBottom: 6 }}>
                                    <button className={`minibtn ${wv.shape === "ellipse" ? "on" : ""}`} onClick={() => setWin({ shape: "ellipse" })}>◯ ELLIPSE</button>
                                    <button className={`minibtn ${wv.shape === "rect" ? "on" : ""}`} onClick={() => setWin({ shape: "rect" })}>▢ RECT</button>
                                    <button className={`minibtn ${wv.invert ? "blue" : ""}`} onClick={() => setWin({ invert: !wv.invert })} title="Grade OUTSIDE the shape">⇄ INVERT</button>
                                    <button className="minibtn danger" onClick={() => setLayer({ window: undefined })}>RESET</button>
                                  </div>
                                  {wrow("CENTRE X", "x", 0, 1)}
                                  {wrow("CENTRE Y", "y", 0, 1)}
                                  {wrow("WIDTH", "w", 0.02, 0.6)}
                                  {wrow("HEIGHT", "h", 0.02, 0.6)}
                                  {wrow("FEATHER", "feather", 0, 1)}
                                </div>
                                <div className="gpanel narrow">
                                  <div className="lbl">WINDOW</div>
                                  <div className="dim small" style={{ lineHeight: 1.6 }}>
                                    A window confines the clip's <b>wheels, curves and qualifier</b> to a region — a vignette, a face, a sky. The <b>primaries</b> tab grades the whole frame. Watch the grade monitor as you move it; the shape bakes into the export exactly as previewed.
                                  </div>
                                  {!hasGrade && <span className="chip amb" style={{ alignSelf: "flex-start", marginTop: 6 }}>ADD A GRADE FIRST</span>}
                                </div>
                              </div>
                            );
                          })() : <div className="dim small colorempty">Select a clip to add a power window.</div>)}

                          {colorTab === "primaries" && (gradeable ? (
                            <div className="gradepanels">
                              <div className="gpanel">
                                <div className="lbl">PRIMARIES <span className="cap">DOUBLE-CLICK A SLIDER TO RESET</span></div>
                                {slider("EXPOSURE", "bri", 0, 2.5, 0.02, 1)}
                                {slider("CONTRAST", "con", 0, 2.5, 0.02, 1)}
                                {slider("SATURATION", "sat", 0, 2.5, 0.02, 1)}
                              </div>
                              <div className="gpanel">
                                <div className="lbl">&nbsp;</div>
                                {slider("HUE \\u00b0", "hue", -180, 180, 1, 0)}
                                {slider("WARMTH", "warm", 0, 1, 0.02, 0)}
                                {slider("SOFTEN", "blur", 0, 30, 0.5, 0)}
                              </div>
                            </div>
                          ) : <div className="dim small colorempty">Select a clip to grade its primaries.</div>)}
                        </div>
                      </div>
                      {/* ── GRADE-PASS mini timeline (Mockup A #6): every picture clip, striped by
                          graded state. Click to jump the grade to that clip. ── */}
                      <div className="cgradetl glass-dark">
                        <span className="cap" style={{ flex: "none" }}>TIMELINE</span>
                        {(() => {
                          const vclips = clips.filter((c) => c.trackId?.startsWith("v")).sort((a, b) => a.start - b.start);
                          const graded = (c) => {
                            const f2 = c.fx || {};
                            return !!(f2.wheel || (f2.curves && !isCurvesIdentity(f2.curves)) || (f2.qualifier && !isQualifierIdentity(f2.qualifier))
                              || (f2.grades || []).length || (f2.bri ?? 1) !== 1 || (f2.con ?? 1) !== 1 || (f2.sat ?? 1) !== 1 || (f2.hue || 0) !== 0);
                          };
                          const g = vclips.filter(graded).length;
                          return (
                            <>
                              <span className="chip amb">{g} GRADED</span>
                              <span className="chip dimchip">{vclips.length - g} UNGRADED</span>
                              <div className="cgradeclips">
                                {vclips.map((c) => (
                                  <span key={c.id} className={`cgclip ${selClipId === c.id ? "sel" : ""}`}
                                    style={{ width: Math.max(26, Math.min(110, c.duration * 9)) }}
                                    title={`${c.label} — click to grade`}
                                    onClick={() => { setSelClipId(c.id); setPlayhead(c.start + Math.min(0.2, c.duration / 2)); setGradeLayer(0); }}>
                                    <u style={{ background: selClipId === c.id ? "var(--org)" : graded(c) ? "var(--green)" : "rgba(255,255,255,.18)" }} />
                                    <b>{c.label}</b>
                                  </span>
                                ))}
                                {!vclips.length && <span className="dim small">No picture clips yet.</span>}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}                {editWs === "audio" && (() => {
                  // ── BAND 3 + 4: lanes are the work surface (with the reference monitor docked
                  //    beside them), the mixer/voice/clips become a TABBED control band. Before this
                  //    it was one vertical scroller where you could never see the mix and the picture
                  //    at once. Mockup-D restructure. ──
                  const audioTracksList = tracks.filter((tr) => tr.type === "audio");
                  const vclips = clips.filter((c) => c.trackId?.startsWith("v") && c.assetId).sort((a, b) => a.start - b.start);
                  const cur = [...vclips].reverse().find((c) => playhead >= c.start && playhead < c.start + c.duration);
                  const ar = (vfmt.w && vfmt.h) ? vfmt.w / vfmt.h : 16 / 9;
                  const aClips = clips.filter((c) => c.trackId?.startsWith("a")).sort((a, b) => a.start - b.start);
                  const ATABS = [["mixer", "MIXER"], ["voice", "VOICE STUDIO"], ["clips", `CLIPS · ${aClips.length}`]];
                  return (
                    <div className="audioroom">
                      <div className="audiostage">
                        <div className="audiolanes glass-dark">
                          <AudioTimeline audioTracks={audioTracksList} clips={clips} prod={prod} vfmt={vfmt} fmtTc={fmtTc}
                            playhead={playhead} setPlayhead={setPlayhead} playing={playing} setPlaying={setPlaying}
                            selClipId={selClipId} setSelClipId={setSelClipId} trackSettings={container.timeline?.trackSettings || {}}
                            setTrackSetting={setTrackSetting} onOpenEditor={openAudioEditor} onSplit={(c) => splitClipStems(c, "vocals-music")} />
                        </div>
                        <aside className="audioref glass-dark">
                          <div className="paneltitle"><MonitorPlay size={12} /> REFERENCE
                            <span className="numval dim small" style={{ marginLeft: "auto" }}>{fmtTc(playhead, vfmt)}</span></div>
                          <div style={{ position: "relative", width: "100%", aspectRatio: String(ar), background: "#0c0c11", borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
                            {cur
                              ? <MonitorLayer key={cur.id} clip={cur} active prod={monitorProd} scene={scene} playhead={playhead} playing={playing} top={false} z={10} vol={0} mute />
                              : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#5a5a64", fontSize: 11 }}>no picture at playhead</div>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button className="minibtn" onClick={() => setPlaying((pl) => !pl)} style={{ width: 52 }}>{playing ? <Pause size={13} /> : <Play size={13} />}</button>
                            {cur?.shotId && <span className="chip blue">SHOT</span>}
                          </div>
                          <span className="dim small" style={{ lineHeight: 1.5 }}>Picture follows the timeline — a fixed reference while you build the score.</span>
                        </aside>
                      </div>

                      <div className="audioctrl glass-dark">
                        <div className="audiotabs">
                          <span className="troom">AUDIO</span>
                          <span className="tdiv" />
                          <span className="segx">
                            {ATABS.map(([id, lab]) => (
                              <button key={id} className={audioTab === id ? "on" : ""} onClick={() => setAudioTab(id)}>{lab}</button>
                            ))}
                          </span>
                          <span className="chip dimchip" style={{ marginLeft: 8 }}>{audioTracksList.length} TRACKS</span>
                        </div>
                        <div className="audiobody">
                          {audioTab === "mixer" && (
                            <MixConsole audioTracks={audioTracksList} trackSettings={container.timeline?.trackSettings || {}} setTrackSetting={setTrackSetting} />
                          )}
                          {audioTab === "voice" && (
                            <VoiceStudio audioTracks={audioTracksList} playhead={playhead} setPlayhead={setPlayhead} setPlaying={setPlaying} onPlaceClip={placeAudioClip} ping={ping} />
                          )}
                          {audioTab === "clips" && (
                            <div>
                              <div className="lbl">DIALOGUE &amp; AUDIO CLIPS <span className="cap">EDIT OR SEPARATE ANY CLIP</span></div>
                              {aClips.map((c) => {
                                const shot = c.shotId ? scene?.shots.find((sh) => sh.id === c.shotId) : null;
                                return (
                                  <div className="briefrow" key={c.id} style={{ cursor: "pointer" }}>
                                    <div className="briefhead" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span className="tc numval" style={{ fontSize: 11, cursor: "pointer" }} onClick={() => { setSelClipId(c.id); setPlayhead(c.start); }}>{fmtTc(c.start, vfmt)}</span>
                                      <strong style={{ flex: 1 }} onClick={() => { setSelClipId(c.id); setPlayhead(c.start); }}>{c.label}</strong>
                                      {shot?.voice && <CopyBtn text={shot.voice} label="VOICE DIRECTION" small />}
                                      <button className="minibtn" title="Send to audio editor (non-destructive clean-up)" onClick={(e) => { e.stopPropagation(); openAudioEditor(c); }}><SlidersHorizontal size={11} /></button>
                                      <button className="minibtn" disabled={stemBusy} title="Isolate vocals + music to new tracks" onClick={(e) => { e.stopPropagation(); splitClipStems(c, "vocals-music"); }}><Mic2 size={11} /></button>
                                    </div>
                                  </div>
                                );
                              })}
                              {!aClips.length && <div className="dim small">No audio clips yet — use TEXT-TO-VOICE, record a voiceover, or drop music/dialogue on the timeline.</div>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {editWs === "deliver" && (() => {
                  // ── Four-band DELIVER. The export VERBS (RENDER MP4 / FCPXML / EDL) live in the
                  //    band-2 tool bar like every other room; the work surface holds the deliverables:
                  //    format presets, destinations, and a runtime summary. Band-4 = render progress. ──
                  const runtime = fmtTc(seqEnd, vfmt);
                  const mp = prod.mediaPool || [];
                  const badFormats = mp.filter((a) => a.needsConversion && !a.converted && clips.some((c) => c.assetId === a.id && !c.disabled)).length;
                  const PRESETS = [
                    { id: "mp4", tab: "var(--org)", name: "Master — MP4 / H.264", sub: `${vfmt.w}×${vfmt.h} · ${vfmt.fps}${vfmt.drop ? " DF" : ""} · AAC`, note: "Pixels engine · frame-exact" },
                    { id: "fcpxml", tab: "var(--blue)", name: "FCPXML — Resolve / Premiere / FCP", sub: "timeline interchange · relinkable", note: "Round-trips this cut for finishing" },
                    { id: "edl", tab: "var(--green)", name: "EDL — CMX3600", sub: "classic conform list", note: "Avid / any NLE" },
                  ];
                  return (
                    <div className="deliverroom">
                      <div className="deliverstage">
                        <aside className="deliverpanel glass-dark" style={{ width: 300, flex: "none" }}>
                          <div className="lbl">DELIVERABLES <span className="cap">RUN A VERB FROM THE TOOL BAR</span></div>
                          {PRESETS.map((ps) => (
                            <div key={ps.id} className="pset idtop" style={{ "--tab": ps.tab }}>
                              <span style={{ fontSize: 10, fontWeight: 800, color: "#eee" }}>{ps.name}</span>
                              <span className="qsub numval">{ps.sub}</span>
                              <span className="dim small" style={{ letterSpacing: 0 }}>{ps.note}</span>
                            </div>
                          ))}
                          <CopyBtn text={exportAll()} label="⤓ COPY FULL EXPORT (BIBLE + SHOTS + PROMPTS)" />
                        </aside>

                        <div className="deliverpanel glass-dark" style={{ flex: 1, minWidth: 0 }}>
                          <div className="isec"><span className="lbl" style={{ flex: 1 }}>RENDER QUEUE <span className="cap">FORMAT × RANGE</span></span>
                            {renderQueue.length > 0 && <button className="minibtn" onClick={() => setRenderQueue((q) => q.filter((j) => j.status === "running"))}>CLEAR</button>}</div>
                          {renderQueue.length === 0 && (
                            <div className="dim small" style={{ lineHeight: 1.6 }}>Nothing queued. Pick a <b>range</b> in the tool bar and add MP4 / FCPXML / EDL jobs — MP4 honours In→Out and per-marker segments (dailies), interchange exports the whole cut.</div>
                          )}
                          {renderQueue.map((j) => {
                            const tab = j.kind === "mp4" ? "var(--org)" : j.kind === "fcpxml" ? "var(--blue)" : "var(--green)";
                            const st = j.status === "running" ? "amb" : j.status === "done" ? "green" : j.status === "error" ? "red" : "dimchip";
                            return (
                              <div key={j.id} className="qrow idtop" style={{ "--tab": tab }}>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                  <span className="qname" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.label}</span>
                                  <span className="qsub numval">{j.kind === "mp4" ? `${fmtTc(j.t0, vfmt)} → ${fmtTc(j.t1, vfmt)}` : "whole cut"}</span>
                                </span>
                                {j.status === "running" && <><div className="dbar" style={{ maxWidth: 90 }}><span style={{ width: `${j.pct * 100}%` }} /></div><span className="numval" style={{ fontSize: 9 }}>{Math.round(j.pct * 100)}%</span></>}
                                <span className={`chip ${st}`}>{j.status.toUpperCase()}</span>
                                {j.status !== "running" && <button className="ghost danger" title="Remove" onClick={() => setRenderQueue((q) => q.filter((x) => x.id !== j.id))}><X size={11} /></button>}
                              </div>
                            );
                          })}
                          <div className="insp-div" />
                          <div className="lbl">DESTINATIONS <span className="cap">MP4 · WHERE IT SURFACES</span></div>
                          {renderDestinations()}
                        </div>

                        <aside className="deliverpanel glass-dark" style={{ width: 250, flex: "none" }}>
                          <div className="lbl">SEQUENCE</div>
                          <div className="dtable">
                            <div><span className="param">FORMAT</span><span className="numval">{vfmt.label}</span></div>
                            <div><span className="param">FRAME</span><span className="numval">{vfmt.w}×{vfmt.h}</span></div>
                            <div><span className="param">RATE</span><span className="numval">{vfmt.fps}{vfmt.drop ? " DF" : " NDF"}</span></div>
                            <div><span className="param">ASPECT</span><span className="numval">{prod.defaults.aspect}</span></div>
                            <div><span className="param">CLIPS</span><span className="numval">{clips.length}</span></div>
                            <div><span className="param">RUNTIME</span><span className="numval">{runtime}</span></div>
                          </div>
                          {badFormats > 0 && <span className="chip amb" style={{ alignSelf: "flex-start" }}>{badFormats} CLIP{badFormats > 1 ? "S" : ""} NEED CONVERT</span>}
                          <span className="dim small" style={{ lineHeight: 1.5 }}>RENDER MP4 writes a real, frame/beat/sample-accurate file via the Plajah Pixels engine. FCPXML / EDL round-trip this cut into Resolve, Premiere or Avid for finishing.</span>
                        </aside>
                      </div>

                      <div className="deliverctrl glass-dark">
                        <span className="troom">DELIVER</span>
                        <span className="tdiv" />
                        {(() => {
                          const pending = renderQueue.filter((j) => j.status === "queued").length;
                          const done = renderQueue.filter((j) => j.status === "done").length;
                          if (queueRunning) {
                            const running = renderQueue.find((j) => j.status === "running");
                            return (
                              <>
                                <span className="cap" style={{ color: "var(--org)" }}>RENDERING QUEUE</span>
                                {running && <span className="dim small" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{running.label}</span>}
                                {running && <div className="dbar"><span style={{ width: `${(running.pct || 0) * 100}%` }} /></div>}
                                <span className="numval">{done}/{renderQueue.length}</span>
                                <button className="minibtn danger" style={{ marginLeft: "auto" }} onClick={runQueue}>STOP QUEUE</button>
                              </>
                            );
                          }
                          if (rendering) {
                            return (
                              <>
                                <span className="cap" style={{ color: "var(--org)" }}>{renderStage}…</span>
                                <div className="dbar"><span style={{ width: `${renderPct * 100}%` }} /></div>
                                <span className="numval">{Math.round(renderPct * 100)}%</span>
                                <button className="minibtn danger" style={{ marginLeft: "auto" }} onClick={doRenderMP4}>CANCEL</button>
                              </>
                            );
                          }
                          return (
                            <>
                              <span className="chip green">READY</span>
                              {pending > 0
                                ? <span className="dim small">{pending} job{pending === 1 ? "" : "s"} queued{done ? ` · ${done} done` : ""} — MP4 downloads as it finishes.</span>
                                : <span className="dim small">Add jobs from the tool bar, or RENDER NOW for a one-off whole-timeline MP4.</span>}
                              <button className="minibtn on" style={{ marginLeft: "auto" }} disabled={!pending} onClick={runQueue}><Film size={12} /> START QUEUE</button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </main>

      {ltGallery && <LowerThirdGallery onChoose={addLowerThird} onClose={() => setLtGallery(null)} />}

      {/* busy bar */}
      {busy && <div className="busybar"><span className="blink" />{busyMsg}</div>}
      {notice && <div className="toast">{notice}</div>}

      {/* autosave indicator — every edit persists as you go */}
      {prod && saveState !== "idle" && (
        <div style={{ position: "fixed", bottom: 84, right: 14, zIndex: 60, display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", pointerEvents: "none" }}>
          <span className={saveState === "saving" ? "blink" : ""} style={{ width: 7, height: 7, borderRadius: 999, background: saveState === "saving" ? "#FF8C00" : saveState === "error" ? "#F04770" : "#3FBE85" }} />
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: saveState === "error" ? "#F98BA6" : "rgba(255,255,255,0.6)" }}>{saveState === "saving" ? "Saving" : saveState === "error" ? "Cloud save failed — backed up locally" : "Saved to platform"}</span>
        </div>
      )}
      {spatialFor && (
        <SpatialMixer
          onClose={() => setSpatialFor(null)}
          fabulaClip={{
            label: spatialFor.label || spatialFor._assetName || "Audio",
            mediaUrl: spatialFor._mediaUrl,
            duration: spatialFor.duration || 0,
            volume: spatialFor.fx?.vol ?? 1,
          }}
          onBake={(result) => bakeSpatialMix(spatialFor, result)}
        />
      )}
      {showLicenseStore && (
        <MusicLicensingStore
          editId={licenseEditId}
          editTitle={activeEdit?.title || scene?.title || prod?.title}
          licensedKeys={syncGrants}
          onAddToProject={addLicensedTrackToPool}
          onClose={() => setShowLicenseStore(false)}
        />
      )}
      {nested && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(6,6,10,0.94)", zIndex: 300, display: "flex", flexDirection: "column", padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <button className="minibtn" onClick={() => setNested(null)}><ChevronLeft size={12} /> BACK</button>
            <span style={{ fontWeight: 700, letterSpacing: 1 }}>NESTED · {nested.clipLabel}</span>
            <span className="dim small">{nested.snapshot.layers.length} layer{nested.snapshot.layers.length === 1 ? "" : "s"} → video tracks · double-click drilled in</span>
          </div>
          <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
            <div style={{ width: "38%", maxWidth: 560, alignSelf: "flex-start", aspectRatio: "16/9", background: "#000", borderRadius: 8, overflow: "hidden", border: "1px solid #2a2a38" }}>
              <SceneView snapshot={nested.snapshot} palette={prod?.pixelsConfig?.colorPalette} playing={true} />
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {nested.snapshot.layers.slice().reverse().map((layer, i) => {
                const n = nested.snapshot.layers.length - i;
                return (
                  <div className="track" key={(layer.id || "l") + i} style={{ marginBottom: 4 }}>
                    <div className="trackhead video"><Film size={10} /> V{n}</div>
                    <div className="trackbody">
                      <div className="clip media" style={{ position: "relative", left: 0, width: "100%" }}>
                        <div className="cliplabel"><span>{layerLabel(layer)}</span></div>
                        <span className="dim small" style={{ marginLeft: 8 }}>{layer.blendMode || "normal"} · {Math.round((layer.opacity ?? 1) * 100)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ───── footer: resolve-style page rail ───── */}
      <footer className="ftr glass">
        <div className="ftr-left">
          <span className="ready">● READY</span>
          <span>{prod ? `${prod.defaults.format?.w || 1920}×${prod.defaults.format?.h || 1080} · ${prod.defaults.format?.fps || 24}${prod.defaults.format?.drop ? " DF" : ""} FPS · ${prod.defaults.aspect}` : "—"}</span>
        </div>
        <div className="rail">
          {[["productions", "PRODUCTIONS", Layers], ["slate", "SLATE", Clapperboard], ["edit", "EDIT", Film]].map(([id, lab, Ic]) => (
            <button key={id} className={`raildot ${page === id ? "on" : ""}`} onClick={() => setPage(id)} title={lab}>
              <Ic size={15} /><span className="raillab">{lab}</span>
            </button>
          ))}
          {page === "edit" && prod && container && (
            <>
              <span className="raildiv" />
              {[["media", "MEDIA", MonitorPlay], ["edit", "EDIT", Film], ["vfx", "VFX", Box], ["color", "COLOR", Palette], ["audio", "AUDIO", Music], ["deliver", "DELIVER", ListVideo]].map(([id, lab, Ic]) => (
                <button key={id} className={`raildot ws ${editWs === id ? "on" : ""}`} onClick={() => setEditWs(id)} title={lab}>
                  <Ic size={13} />
                </button>
              ))}
            </>
          )}
        </div>
        <div className="ftr-right">
          <span>{storageReady ? "PERSISTED" : storageReady === false ? "SESSION ONLY" : "…"}</span>
          <span className="ver mono">FABULA α-0.5</span>
        </div>
      </footer>
    </div>
  );
}

/* Forge clip preview — renders a timeline video through the same WebGL effect
   stack as graph nodes and offline rendering. The source video remains mounted
   for decode/audio sync but its DOM pixels are hidden while this canvas presents. */
function ForgeClipPreview({ videoRef, effects, time, active, cubeLut, mediaPool, clipFx = null, fps = 24 }) {
  const canvasRef = useRef(null);
  const effectsRef = useRef(effects); effectsRef.current = effects;
  const clipFxRef = useRef(clipFx); clipFxRef.current = clipFx;
  const timeRef = useRef(time); timeRef.current = time;
  const lutRef = useRef(cubeLut); lutRef.current = cubeLut;
  const auxRef = useRef(new Map());
  // Rasterised text overlays, keyed by effect instance — redrawn only when the string changes.
  const textAuxRef = useRef(new TextOverlayCache());
  const meshAuxRef = useRef(null);   // reused canvas for the mesh displacement map
  useEffect(() => {
    const created = new Map();
    for (const instance of effects || []) {
      const wants = [[instance.id, instance.auxAssetId], [instance.id + ":mask", instance.mask?.kind === "aux" ? instance.mask.assetId : null]];
      for (const [key, assetId] of wants) {
        if (!assetId) continue;
        const asset = (mediaPool || []).find((candidate) => candidate.id === assetId);
        if (!asset?.url) continue;
        const el = asset.type === "video" ? document.createElement("video") : new Image();
        el.crossOrigin = "anonymous"; el.src = asset.url;
        if (el instanceof HTMLVideoElement) { el.muted = true; el.playsInline = true; el.preload = "auto"; }
        created.set(key, el);
      }
    }
    auxRef.current = created;
    return () => created.forEach((el) => { if (el instanceof HTMLVideoElement) { el.pause(); el.removeAttribute("src"); el.load(); } });
  }, [effects?.map((instance) => `${instance.id}:${instance.auxAssetId || ""}:${instance.mask?.kind === "aux" ? instance.mask.assetId || "" : ""}`).join("|"), mediaPool]); // eslint-disable-line
  useEffect(() => {
    if (!active || !effects?.length) return undefined;
    let raf = 0, comp = null;
    try { comp = new PixelsCompositor(canvasRef.current); comp.resize(960, 540); }
    catch (error) { console.warn("[ForgeClipPreview] WebGL2 unavailable:", error?.message || error); return undefined; }
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const video = videoRef?.current;
      if (!video) return;
      // A <video> reports readyState; an <img> reports complete/naturalWidth. Both can feed the
      // compositor once they have pixels, so the preview accepts either.
      const isVideo = typeof HTMLVideoElement !== "undefined" && video instanceof HTMLVideoElement;
      const isCanvas = video instanceof HTMLCanvasElement;
      if (isVideo ? video.readyState < 2 : isCanvas ? !video.dataset.frameReady : !(video.complete && video.naturalWidth)) return;
      if (isCanvas && Number.isFinite(video.__clipTime)) timeRef.current = video.__clipTime;
      const srcW = (isVideo ? video.videoWidth : isCanvas ? video.width : video.naturalWidth) || 16;
      const srcH = (isVideo ? video.videoHeight : isCanvas ? video.height : video.naturalHeight) || 9;
      try {
        const trackCtx = { vectorTrack: clipFxRef.current?.vectorTrack, planarTrack: clipFxRef.current?.planarTrack, fps };
        // Expand user-built effects into their chain first; everything below sees only
        // ordinary instances, exactly as the export does.
        const resolved = expandStack(effectsRef.current, customLookup()).map((stored) => {
          // Same resolver as the export: track-bound params + rasterised mask for this frame.
          let instance = resolveInstanceForFrame(stored, FX_EFFECTS.find((e) => e.id === stored.effectId), trackCtx, timeRef.current, { w: srcW, h: srcH });
          if (instance.subjectMask) instance = { ...instance, maskElement: segmentSubjectLatest(video, 512, Math.max(2, Math.round(512 * srcH / srcW))) };
          if (instance.samMask) instance = { ...instance, maskElement: segmentSamLatest(video, instance.samMask, 512, Math.max(2, Math.round(512 * srcH / srcW)), instance.samMask.feather) };
          if (instance.depthMask) { const d = estimateDepthLatest(video, 384, Math.max(2, Math.round(384 * srcH / srcW))); instance = { ...instance, maskElement: d ? depthRangeCanvas(d, instance.depthMask.near, instance.depthMask.far, instance.depthMask.feather) : null }; }
          if (instance.auxSource === "depth") { const d = estimateDepthLatest(video, 384, Math.max(2, Math.round(384 * srcH / srcW))); if (d) return { ...instance, auxElement: d }; }
          // Text-as-input effects: rasterise the string for THIS frame, exactly as the export
          // does, and hand over a blank texture when it is empty so the renderer never falls
          // back to the source frame (which would read as full glyph coverage).
          const auxKind = FX_EFFECTS.find((e) => e.id === instance.effectId)?.auxInput?.kind;
          if (auxKind === "mesh") {
            // Same generator and the same frame maths as the export, so a warped insert sits in
            // the same place in the monitor as it does in the file.
            const meshFrame = Math.round(timeRef.current * (fps || 24));
            return { ...instance, auxElement: meshAuxElement(clipFxRef.current?.meshTrack, meshFrame, meshAuxRef.current) };
          }
          const textEffect = FX_EFFECTS.find((e) => e.id === instance.effectId)?.auxInput;
          if (textEffect?.kind === "text") return { ...instance, auxElement: textAuxRef.current.resolve(instance.id, instance.textOverlay, { localT: timeRef.current, fps }, srcW, srcH) };
          if (instance.maskAssetId) { const m = auxRef.current.get(instance.id + ":mask"); if (m instanceof HTMLVideoElement && m.readyState >= 1 && Math.abs(m.currentTime - timeRef.current) > .08) m.currentTime = Math.min(timeRef.current, Math.max(0, (m.duration || timeRef.current) - .001)); if (m) instance = { ...instance, maskElement: m }; }
          const auxElement = auxRef.current.get(instance.id);
          if (auxElement instanceof HTMLVideoElement && auxElement.readyState >= 1 && Math.abs(auxElement.currentTime - timeRef.current) > .08) auxElement.currentTime = Math.min(timeRef.current, Math.max(0, (auxElement.duration || timeRef.current) - .001));
          return auxElement ? { ...instance, auxElement } : instance;
        });
        // Beat Reactor: the preview reacts to the master bus; the export uses the rendered
        // mix's exact per-frame spectrum. Same processing either way (AudioTexture).
        try { comp.updateAudioFromAnalyser(masterAnalyser()); } catch { /* mixer not built yet */ }
        comp.render([{ id: "timeline-preview", element: video, opacity: 1, blendMode: "normal", effects: resolved, time: timeRef.current }], undefined, undefined, lutRef.current);
      }
      catch { /* source frame not ready */ }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); try { comp?.dispose(); } catch { /* */ } };
  }, [active, videoRef]); // eslint-disable-line
  return <canvas ref={canvasRef} className="mvid" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />;
}

/* ---------- compositing layer: one active clip on one video track ---------- */


/* ---------- Forge mask overlay: PixelChooser shape editor on the program monitor ----------
   Ellipse/rect: drag the body to move, corner handles to resize. Polygon: drag vertices, drag the
   body to move, double-click the body to add a vertex. Shapes are stored in normalized clip space. */
function MaskOverlay({ clip, instance, playhead, screenRef, videoRef, fps, onChange }) {
  const mask = instance?.mask;
  const el = screenRef?.current;
  const W = el?.clientWidth || 0, H = el?.clientHeight || 0;
  const maskRef = useRef(mask); maskRef.current = mask;
  if (!clip || !mask || !W || !H) return null;
  const vw = videoRef?.current?.videoWidth || videoRef?.current?.width || 16, vh = videoRef?.current?.videoHeight || videoRef?.current?.height || 9;
  const box = containBox(vw, vh, W, H);
  const localT = playhead - clip.start;
  const ctxT = { vectorTrack: clip.fx?.vectorTrack, planarTrack: clip.fx?.planarTrack, fps };
  // Handles edit the stored (reference-frame) shape; the outline shows where the track puts it now.
  const stored = maskOutlineAt({ ...mask, track: "none" }, ctxT, localT, 64);
  const live = maskOutlineAt(mask, ctxT, localT, 64);
  const toPx = (p) => [box.x + p.x * box.w, box.y + p.y * box.h];
  const fromEvent = (ev) => { const r = el.getBoundingClientRect(); return { x: (ev.clientX - r.left - box.x) / box.w, y: (ev.clientY - r.top - box.y) / box.h }; };
  const drag = (kind, index) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const start = fromEvent(e); const origin = JSON.parse(JSON.stringify(maskRef.current));
    const move = (ev) => {
      const p = fromEvent(ev); const dx = p.x - start.x, dy = p.y - start.y; const m = origin;
      if (kind === "body") {
        if (m.shape === "poly") onChange({ ...m, points: (m.points || []).map((q) => ({ x: q.x + dx, y: q.y + dy })) });
        else onChange({ ...m, cx: m.cx + dx, cy: m.cy + dy });
      } else if (kind === "vertex") {
        onChange({ ...m, points: (m.points || []).map((q, k) => k === index ? { x: p.x, y: p.y } : q) });
      } else if (kind === "corner") {
        // corner k of the bbox: 0 TL 1 TR 2 BR 3 BL — resize about the opposite corner
        const sx = index === 1 || index === 2 ? 1 : -1, sy = index === 2 || index === 3 ? 1 : -1;
        const w = Math.max(.02, m.w + dx * sx), h = Math.max(.02, m.h + dy * sy);
        onChange({ ...m, w, h, cx: m.cx + (w - m.w) / 2 * sx, cy: m.cy + (h - m.h) / 2 * sy });
      }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const addVertex = (e) => { if (mask.shape !== "poly") return; const p = fromEvent(e); const pts = mask.points || []; let best = 0, bd = Infinity; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const d = Math.hypot(mx - p.x, my - p.y); if (d < bd) { bd = d; best = i; } } const next = [...pts]; next.splice(best + 1, 0, p); onChange({ ...mask, points: next }); };
  const removeVertex = (i) => (e) => { e.preventDefault(); e.stopPropagation(); if (mask.shape !== "poly" || (mask.points || []).length <= 3) return; onChange({ ...mask, points: mask.points.filter((_, k) => k !== i) }); };
  const handles = mask.shape === "poly" ? (mask.points || []) : [{ x: mask.cx - mask.w / 2, y: mask.cy - mask.h / 2 }, { x: mask.cx + mask.w / 2, y: mask.cy - mask.h / 2 }, { x: mask.cx + mask.w / 2, y: mask.cy + mask.h / 2 }, { x: mask.cx - mask.w / 2, y: mask.cy + mask.h / 2 }];
  const tracked = mask.track && mask.track !== "none";
  return (
    <svg className="vt-surface" viewBox={`0 0 ${W} ${H}`} style={{ pointerEvents: "auto" }}>
      {tracked && <polygon points={live.map((p) => toPx(p).join(",")).join(" ")} fill="none" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 3" />}
      <polygon points={stored.map((p) => toPx(p).join(",")).join(" ")} fill="rgba(0,163,255,.10)" stroke="#00A3FF" strokeWidth={1.5} style={{ cursor: "move" }} onPointerDown={drag("body")} onDoubleClick={addVertex} />
      {handles.map((p, i) => { const [x, y] = toPx(p); return <circle key={i} className="vt-handle" cx={x} cy={y} r={6} fill="#0f0e13" stroke="#00A3FF" strokeWidth={2} onPointerDown={drag(mask.shape === "poly" ? "vertex" : "corner", i)} onContextMenu={removeVertex(i)} />; })}
      <text x={toPx(stored[0])[0]} y={toPx(stored[0])[1] - 9} fill="#00A3FF" fontSize={10} fontFamily="'JetBrains Mono',monospace" letterSpacing={1}>MASK · {mask.shape}{tracked ? ` · follows ${mask.track === "planar" ? "surface" : "point"}` : ""}{mask.shape === "poly" ? " · dbl-click adds, right-click removes" : ""}</text>
    </svg>
  );
}

/* ---------- VectorTrack surface overlay: the planar surface quad on the program monitor ----------
   Editing: drag corners (or the body) to place the reference surface. Tracked: shows the surface
   where the track puts it on this frame, coloured by confidence, with the feature lattice. */
function SurfaceOverlay({ clip, playhead, screenRef, videoRef, editing, onChange, onAdjust }) {
  const fx = clip?.fx || {};
  const seq = fx.planarTrack, surface = fx.planarSurface;
  const quadRef = useRef(null);
  const el = screenRef?.current;
  const W = el?.clientWidth || 0, H = el?.clientHeight || 0;
  if (!clip || !W || !H) return null;
  const vw = videoRef?.current?.videoWidth || videoRef?.current?.width || seq?.width || 16, vh = videoRef?.current?.videoHeight || videoRef?.current?.height || seq?.height || 9;
  const box = containBox(vw, vh, W, H);
  const frame = Math.max(0, Math.round((playhead - clip.start) * ((seq?.fps) || 24)));
  let quad = null, conf = 1, live = false, features = null;
  if (seq && !editing) { const s = samplePlanarAt(seq, frame); if (s) { quad = s.corners; conf = s.confidence; live = true; features = s.features; } }
  if (!quad && surface) quad = surface.corners;
  if (!quad) return null;
  quadRef.current = quad;
  const toPx = (p) => [box.x + p.x * box.w, box.y + p.y * box.h];
  const pts = quad.map(toPx);
  const adjustable = live && !editing && typeof onAdjust === "function";
  const startDrag = (i) => (e) => {
    if (!editing && !adjustable) return;
    e.preventDefault(); e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const origin = quadRef.current.map((p) => ({ ...p }));
    const x0 = e.clientX, y0 = e.clientY;
    const move = (ev) => {
      const dx = (ev.clientX - x0) / box.w, dy = (ev.clientY - y0) / box.h;
      const clamp = (v) => Math.max(-.5, Math.min(1.5, v));
      const next = origin.map((p, k) => (i === -1 || k === i) ? { x: clamp(p.x + dx), y: clamp(p.y + dy) } : p);
      if (editing) onChange(next); else onAdjust(frame, next);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const color = editing ? "#f97316" : conf > .6 ? "#22c55e" : conf > .3 ? "#eab308" : "#ef4444";
  const grid = [];
  for (let k = 1; k < 3; k++) { const u = k / 3; grid.push([quadPoint(quad, u, 0), quadPoint(quad, u, 1)], [quadPoint(quad, 0, u), quadPoint(quad, 1, u)]); }
  return (
    <svg className="vt-surface" viewBox={`0 0 ${W} ${H}`} style={{ pointerEvents: (editing || adjustable) ? "auto" : "none" }}>
      <polygon points={pts.map((p) => p.join(",")).join(" ")} fill={editing ? "rgba(249,115,22,.10)" : "rgba(34,197,94,.06)"} stroke={color} strokeWidth={1.5} style={{ cursor: editing ? "move" : "default" }} onPointerDown={startDrag(-1)} />
      {grid.map(([a, b], i) => { const [ax, ay] = toPx(a), [bx, by] = toPx(b); return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke={color} strokeOpacity={.35} strokeWidth={1} />; })}
      {features && features.map((p, i) => { const [x, y] = toPx(p); return <circle key={i} cx={x} cy={y} r={2.5} fill={color} fillOpacity={.8} />; })}
      {editing && pts.map(([x, y], i) => <circle key={i} className="vt-handle" cx={x} cy={y} r={7} fill="#0f0e13" stroke="#f97316" strokeWidth={2} onPointerDown={startDrag(i)} />)}
      {adjustable && pts.map(([x, y], i) => <circle key={i} className="vt-handle" cx={x} cy={y} r={6} fill="#0f0e13" stroke={color} strokeWidth={2} onPointerDown={startDrag(i)} />)}
      <text x={pts[0][0]} y={pts[0][1] - 9} fill={color} fontSize={10} fontFamily="'JetBrains Mono',monospace" letterSpacing={1}>{editing ? "SURFACE · drag corners" : live ? `PLANAR ${(conf * 100).toFixed(0)}%` : "SURFACE"}</text>
    </svg>
  );
}

// A live preview of a 3D-model clip: three.js renders the loaded mesh to a canvas each frame and
// we blit it here. The export (offlineRenderer) applies the clip's Forge stack + grade on top;
// this live view shows the raw 3D render, which is enough to frame, orbit and time the shot.
// Animation is driven to clip-local time, so scrubbing moves the model deterministically.
function Model3DLayer({ clip, prod, playhead, playing, active, z }) {
  const canvasRef = useRef(null);
  const fx = ensureFx(clip);
  const asset = clip.assetId ? (prod?.mediaPool || []).find((a) => a.id === clip.assetId) : null;
  const url = clip.model3dUrl || clip.model3d?.url || asset?.url || "";
  const spec = { ...MODEL3D_DEFAULT, ...(clip.model3d || {}) };
  const playheadRef = useRef(playhead); playheadRef.current = playhead;
  useEffect(() => {
    let raf = 0; let alive = true;
    const draw = () => {
      if (!alive) return;
      const cv = canvasRef.current;
      if (cv) {
        const host = cv.parentElement;
        const w = Math.max(2, host?.clientWidth || 640), h = Math.max(2, host?.clientHeight || 360);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        const src = renderModel3dLatest(url, spec, w, h, Math.max(0, playheadRef.current - clip.start));
        const ctx = cv.getContext("2d");
        if (ctx) { ctx.clearRect(0, 0, w, h); if (src) ctx.drawImage(src, 0, 0, w, h); }
      }
      // Keep rendering while playing or the model is still loading/orbiting; a paused static
      // model still needs a couple of frames after load, so we always request the next one.
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [url, clip.start, JSON.stringify(spec), playing]);
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: z, opacity: fx.op ?? 1, transform: `translate(${(fx.x || 0) * 100}%, ${(fx.y || 0) * 100}%) scale(${fx.sc ?? 1}) rotate(${fx.rot || 0}deg)`, pointerEvents: "none" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

function MonitorLayer({ indexedMode = false, clip, prod, scene, playhead, playing, top, z, videoRef, vol = 1, mute = false, active = true, gpuMode = false, gpuReg = null, pinSource = null }) {
  if (clip.kind === "model3d") return <Model3DLayer clip={clip} prod={prod} playhead={playhead} playing={playing} active={active} z={z} />;
  const localRef = useRef(null);
  const wrapRef = useRef(null);
  const [playbackSrc, setPlaybackSrc] = useState(null);
  const [sourceRetry, setSourceRetry] = useState(0);
  useEffect(() => { setSourceRetry(0); }, [clip.assetId, prod?.id]);
  const [loadState, setLoadState] = useState({ phase: "idle", pct: 0 });
  const fxBase = ensureFx(clip);
  const activeCubeLut = (prod?.design?.luts || []).find((lut) => lut.id === prod?.design?.activeLutId) || null;
  // KEYFRAMES: transform + opacity sampled at the playhead so scrubbing/stepping
  // shows the animation. (Static clips return fxBase untouched — zero overhead.)
  const fx = kfIsAnimated(fxBase) ? (() => {
    const lt = playhead - clip.start;
    return { ...fxBase,
      x: kfSample(fxBase, "x", lt, fxBase.x), y: kfSample(fxBase, "y", lt, fxBase.y),
      sc: kfSample(fxBase, "sc", lt, fxBase.sc), rot: kfSample(fxBase, "rot", lt, fxBase.rot),
      op: kfSample(fxBase, "op", lt, fxBase.op),
      bri: kfSample(fxBase, "bri", lt, fxBase.bri), con: kfSample(fxBase, "con", lt, fxBase.con),
      sat: kfSample(fxBase, "sat", lt, fxBase.sat), hue: kfSample(fxBase, "hue", lt, fxBase.hue),
      blur: kfSample(fxBase, "blur", lt, fxBase.blur) };
  })() : fxBase;
  const trackMotion = fx.trackMode === "stabilize" && fx.vectorTrack ? stabilizationAt(fx.vectorTrack, Math.max(0, Math.round((playhead - clip.start) * (fx.vectorTrack.fps || 24)))) : { x: 0, y: 0, confidence: 0 };
  // PLANAR (VectorTrack): one SAMPLING matrix for this frame — the clip's own track (stabilise:
  // output(p) = src(H·p)) or another clip's surface (corner pin: inv(H·Q)). The export computes the
  // same matrices from the same samplers (fabulaRender.ts), so the monitor is the export.
  const planarFrame = (seq, t) => Math.max(0, Math.round(t * (seq.fps || 24)));
  let planarSampling = null;
  if (fx.trackMode === "planar" && fx.planarTrack) { const st = planarStabilizeAt(fx.planarTrack, planarFrame(fx.planarTrack, playhead - clip.start)); if (!isIdentityMat3(st.matrix)) planarSampling = st.matrix; }
  else if (fx.pinTo?.clipId && pinSource?.fx?.planarTrack) { const pin = cornerPinAt(pinSource.fx.planarTrack, planarFrame(pinSource.fx.planarTrack, playhead - pinSource.start)); if (pin) planarSampling = pin.sample; }
  // DOM form: CSS matrix3d of the PLACEMENT matrix (inverse of the sampling matrix) in element pixels
  // over the video's object-fit:contain box. Zero cost when no planar track applies.
  let planarCss = null;
  if (planarSampling) {
    const place = invertHomography(planarSampling);
    const host = wrapRef.current; const W = host?.clientWidth || 0, Hh = host?.clientHeight || 0;
    const vEl = videoRef?.current || localRef.current;
    const vw = vEl?.videoWidth || vEl?.width || fx.planarTrack?.width || pinSource?.fx?.planarTrack?.width || W, vh = vEl?.videoHeight || vEl?.height || fx.planarTrack?.height || pinSource?.fx?.planarTrack?.height || Hh;
    if (place && W && Hh) planarCss = mat3ToCssMatrix3d(toPixelSpace(place, containBox(vw, vh, W, Hh)));
  }
  // TRANSITION preview: ramp the incoming clip's opacity across its window so you see
  // it come in. (The true two-clip crossfade renders in the export; the monitor shows
  // the incoming fading in from what's beneath / black.)
  const _td = fxBase.trans?.dur || 0;
  if (_td > 0.01 && playhead >= clip.start && playhead < clip.start + _td) {
    fx.op = (fx.op ?? 1) * Math.max(0, Math.min(1, (playhead - clip.start) / _td));
  }
  // resolve media (multicam → active angle)
  let asset = clip.assetId ? prod.mediaPool.find((a) => a.id === clip.assetId) : null;
  let offset = clip.srcIn || 0;
  if (asset?.type === "multicam") {
    const ang = asset.angles[clip.angle || 0];
    offset += ang?.offset || 0;
    asset = ang ? prod.mediaPool.find((a) => a.id === ang.assetId) : null;
  }
  const shot = clip.shotId ? scene?.shots.find((s) => s.id === clip.shotId) : null;
  const vRef = videoRef || localRef;
  const frameRef = useRef(null);
  const [indexedState, setIndexedState] = useState({ url: null, phase: "idle" });
  const useIndexed = indexedMode && asset?.type === "video" && !!playbackSrc && indexedVideoAvailable()
    && !(indexedState.url === playbackSrc && indexedState.phase === "failed");
  const indexedReady = useIndexed && indexedState.url === playbackSrc && indexedState.phase === "ready";
  const renderRef = indexedReady ? frameRef : vRef;
  useEffect(() => {
    if (!indexedReady || !videoRef) return;
    const canvas = frameRef.current; videoRef.current = canvas;
    return () => { if (videoRef.current === canvas) videoRef.current = null; };
  }, [indexedReady, videoRef]);

  // Resolve local bytes BEFORE mounting; never swap a running stream for a full download.
  useEffect(() => {
    let alive = true; let source = null;
    setPlaybackSrc(null);
    setLoadState({ phase: "loading", pct: 0 });
    if (asset?.type === "video") resolveMediaSource(asset, sourceRetry > 0, true).then((resolved) => {
      if (!alive) { resolved.release(); return; }
      source = resolved;
      setPlaybackSrc(resolved.url);
      setLoadState({ phase: "loading", pct: 0 });
    }).catch(error => { if (alive) {setLoadState({ phase: "error", pct: 0, message: error.message });reportMediaHealth(asset?.id,error.message);} });
    return () => { alive = false; source?.release(); };
  }, [asset?.id, asset?.url, asset?.type, asset?.previewProxy, sourceRetry]);

  // Bound loading recovery. A seek finishing can produce a frame without a
  // playing event, so buffering must not remain latched after that frame arrives.
  useEffect(() => {
    if (!active || !playing || !playbackSrc || indexedReady || !["loading","buffering"].includes(loadState.phase)) return;
    const timer = setTimeout(() => {
      const video = vRef.current;
      if (video instanceof HTMLVideoElement && video.readyState >= 2 && !video.seeking) setLoadState({phase:"ready",pct:100});
      else if (sourceRetry === 0) setSourceRetry(1);
      else setLoadState({phase:"error",pct:0,message:"VIDEO STALLED — no frame available after retry; reconnect local media or convert this source"});
    }, 12000);
    return () => clearTimeout(timer);
  }, [active,playing,playbackSrc,indexedReady,loadState.phase,sourceRetry]);

  // Target source-time for the current playhead, held in a ref so the video's own
  // load/seek events can re-apply it (fixes: a freshly-swapped clip renders black or a
  // stale frame until you click — the seek was issued before the element could honor it).
  const seekRef = useRef(0);
  const doSeek = () => {
    const v = vRef.current;
    if (!(v instanceof HTMLVideoElement) || asset?.type !== "video") return;
    // Media readiness can arrive long after React's last cut update. Never seek
    // a late-loaded decoder back to that stale UI position while transport runs.
    const target = active && playing && engineRunning() ? Math.max(0, engineClock() - clip.start + offset) : seekRef.current;
    const t = Number.isFinite(v.duration) ? Math.min(target, Math.max(0, v.duration - 0.001)) : target;
    if (!Number.isFinite(t)) return;
    // Seek ~1 frame-tight when paused (accurate trim/in-out preview); loose while playing (no stutter).
    if (Math.abs(v.currentTime - t) > (playing ? 1.0 : 0.034)) {
      try { v.currentTime = Math.max(0, t); } catch { /* not seekable yet — onLoadedData/onSeeked retries */ }
    }
  };
  // Slave this element to the transport clock while it's the live picture: the engine's
  // sync pass (playbackRate nudges) replaces per-render seek yanks — smooth, drift-free.
  useEffect(() => {
    if (indexedReady || !(active && playing && asset?.type === "video" && vRef.current instanceof HTMLVideoElement)) return undefined;
    registerLiveVideo(clip.id, { el: vRef.current, clipStart: clip.start, offset, srcDur: asset.duration || 0 });
    return () => unregisterLiveVideo(clip.id);
  }, [active, playing, playbackSrc, asset?.url, clip.id, clip.start, offset, indexedReady]); // eslint-disable-line
  useEffect(() => {
    const v = vRef.current;
    if (!(v instanceof HTMLVideoElement) || asset?.type !== "video") return;
    if (active) {
      seekRef.current = Math.max(0, playhead - clip.start + offset);
      if (!playing || !engineRunning()) doSeek();
      // Never restart an element parked at its own end — the sync pass froze it there
      // (clip longer than its source); replaying it caused a few-frame stutter at bounds.
      const atEnd = Number.isFinite(v.duration) && v.duration > 0.2 && v.currentTime >= v.duration - 0.1;
      if (playing) { if (v.paused && !atEnd) v.play().catch(() => {}); }
      else if (!v.paused) v.pause();
    } else {
      // Warm buffer: park decoded at the clip's in-point, paused. When the playhead reaches this
      // clip and `active` flips true, the element is already showing the right frame → no reload,
      // no dip to black at the cut (this is the double-buffering that kills the between-clip flash).
      seekRef.current = Math.max(0, offset);
      if (!v.paused) v.pause();
      doSeek();
    }
  }, [active, playhead, playing, playbackSrc, asset?.url, clip.start, offset, indexedReady]);
  // Live audio: honor the track's mixer vol/mute (was hardcoded `muted`, so nothing played).
  // av === linked-audio clip present → the picture is muted here and its sound plays through the
  // audio track (AudioLayer). Warm (inactive) buffers stay muted.
  // While the ENGINE plays this source's audio (decoded + scheduled, mixer-routed), the
  // element must stay muted or the sound doubles; the element unmutes only for sources
  // the engine can't decode (its element fallback) or when the transport is stopped.
  const engineOwnsAudio = playing && !clip.av && enginePlayable(asset?.url, clip.id);
  useEffect(() => {
    const v = vRef.current;
    if (v instanceof HTMLVideoElement && asset?.type === "video") { v.volume = Math.max(0, Math.min(1, vol)); v.muted = !active || !!mute || !!clip.disabled || !!clip.av || engineOwnsAudio || useIndexed; }
  }, [vol, mute, clip.disabled, clip.av, asset?.url, active, engineOwnsAudio, useIndexed, indexedReady]);

  // fades
  const tIn = playhead - clip.start, tOut = clip.start + clip.duration - playhead;
  let fade = 1;
  if (fx.fadeIn > 0 && tIn < fx.fadeIn) fade = Math.max(0, tIn / fx.fadeIn);
  if (fx.fadeOut > 0 && tOut < fx.fadeOut) fade = Math.min(fade, Math.max(0, tOut / fx.fadeOut));

  const m = fx.matte;
  // Sampling a still into WebGL needs CORS; a host that refuses it would otherwise fail the
  // image outright. Same fallback the audio graph uses: drop back to a plain element and show the
  // picture unprocessed rather than showing nothing.
  const [imgCors, setImgCors] = useState(true);
  useEffect(() => { setImgCors(true); }, [asset?.url]);
  const isStill = asset?.type === "image" || asset?.type === "graphic";
  const forgeSource = asset?.type === "video" || (isStill && imgCors);
  const hasForge = active && forgeSource && (fx.stack.some((instance) => instance.enabled !== false) || !!activeCubeLut);
  const clipPath = m.t === "rect"
    ? `inset(${Math.max(0, m.y - m.h / 2)}% ${Math.max(0, 100 - m.x - m.w / 2)}% ${Math.max(0, 100 - m.y - m.h / 2)}% ${Math.max(0, m.x - m.w / 2)}% round ${m.f}px)`
    : m.t === "ellipse" ? `ellipse(${m.w / 2}% ${m.h / 2}% at ${m.x}% ${m.y}%)` : "none";

  // GPU program monitor (Phase 2): when the compositor is active this video layer is eligible for GPU
  // compositing only if it uses no fx the compositor doesn't yet reproduce (blur / matte / blend). If
  // eligible, we KEEP decoding + seeking in this <video> exactly as before but hide its DOM pixels — the
  // shared GPU canvas samples this same element and draws it. The seek/double-buffer/videoRef logic is
  // untouched, so toggling GPU off is a byte-identical fallback.
  const gpuEligible = gpuMode && asset?.type === "video" && !!asset?.url
    && !hasForge && (fx.blur || 0) === 0 && (fx.matte?.t || "none") === "none" && (fx.blend || "normal") === "normal";
  useEffect(() => {
    if (!gpuReg) return undefined;
    if (gpuEligible && active) gpuReg.set(clip.id, { el: renderRef.current, fx, fade, z: z ?? 0, track: trackMotion, homography: planarSampling });
    else gpuReg.delete(clip.id);
    return undefined;
  });
  useEffect(() => () => { gpuReg?.delete(clip.id); }, []); // eslint-disable-line

  const style = {
    position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
    opacity: (gpuEligible && active) ? 0 : (active ? fx.op * fade : 0), // GPU draws it → hide the DOM copy; warm buffers already invisible
    // Planar: the affine part is rewritten about the centre explicitly so matrix3d (origin 0 0)
    // can be composed on the right (applied first). Without a planar track the string is unchanged.
    transform: planarCss
      ? `translate(${fx.x + trackMotion.x * 100}%, ${fx.y + trackMotion.y * 100}%) translate(50%, 50%) scale(${fx.sc}) rotate(${fx.rot}deg) translate(-50%, -50%) ${planarCss}`
      : `translate(${fx.x + trackMotion.x * 100}%, ${fx.y + trackMotion.y * 100}%) scale(${fx.sc}) rotate(${fx.rot}deg)`,
    ...(planarCss ? { transformOrigin: "0 0" } : {}),
    filter: `blur(${fx.blur}px) brightness(${fx.bri}) contrast(${fx.con}) saturate(${fx.sat})${fx.warm ? ` sepia(${Math.min(1, fx.warm)})` : ""}${fx.hue ? ` hue-rotate(${fx.hue}deg)` : ""}`,
    mixBlendMode: active && top ? fx.blend : "normal",
    clipPath, zIndex: active ? (z ?? (top ? 2 : 1)) : 0, pointerEvents: "none",
  };

  return (
    <div style={style} ref={wrapRef}>
      {asset?.chart ? (
        <TelaChart device={asset.chart} devices={{}} readOnly onUpdate={() => {}} />
      ) : asset?.pixels ? (
        // Pixels scene — render its live GL composite (the per-clip CSS fx on the
        // wrapping div still apply to this canvas for free).
        <SceneView snapshot={asset.pixels} palette={prod?.pixelsConfig?.colorPalette}
          playing={playing} time={playhead - clip.start + offset} className="mvid" />
      ) : <>
        {useIndexed && <IndexedVideoCanvas key={playbackSrc} url={playbackSrc} sourceRef={frameRef} playing={playing} active={active} time={playhead} offset={offset} clipStart={clip.start} fps={prod?.defaults?.format?.fps || 24} hidden={!indexedReady || hasForge} onReady={() => { setIndexedState({url:playbackSrc,phase:"ready"}); setLoadState({phase:"ready",pct:100}); }} onError={(error) => { console.warn("[Fabula] indexed decoder fallback", error); setIndexedState({url:playbackSrc,phase:"failed"}); }} />}
        {useIndexed && !clip.av && !engineOwnsAudio && <AudioLayer clip={{...clip,assetId:asset.id,srcIn:offset}} prod={prod} playhead={playhead} playing={playing} active={active} track={{vol,mute}} trackId={clip.trackId} />}
        {hasForge && <ForgeClipPreview videoRef={renderRef} effects={fx.stack} mediaPool={prod?.mediaPool || []} cubeLut={activeCubeLut} time={Math.max(0, playhead - clip.start)} active={active} clipFx={fx} fps={prod?.defaults?.format?.fps || 24} />}
        {!indexedReady && playbackSrc && asset.type === "video" && <video ref={vRef} src={playbackSrc} className="mvid" style={hasForge ? { opacity: 0 } : undefined} muted={!active || !!mute || !!clip.disabled || !!clip.av || engineOwnsAudio || useIndexed} playsInline preload="auto" crossOrigin={needsCors(playbackSrc) ? "anonymous" : undefined} onLoadStart={() => setLoadState({ phase: "loading", pct: 0 })} onWaiting={() => setLoadState({ phase: "buffering", pct: 0 })} onPlaying={() => setLoadState({ phase: "ready", pct: 100 })} onLoadedData={() => { doSeek(); setLoadState({ phase: "ready", pct: 100 }); }} onCanPlay={() => { doSeek(); setLoadState({ phase: "ready", pct: 100 }); }} onSeeked={() => { if (!playing) doSeek(); if (vRef.current?.readyState >= 2) setLoadState({phase:"ready",pct:100}); }}
          onError={() => {
            reportMediaHealth(asset?.id,vRef.current?.error?.code===3?"Video decode failed":"Video source unavailable or unsupported");
            if (sourceRetry === 0) setSourceRetry(1);
            else setLoadState({ phase: "error", pct: 0, message: vRef.current?.error?.code === 3 ? "VIDEO DECODE FAILED — file loaded, but the browser rejected its video stream" : "VIDEO SOURCE UNAVAILABLE — reconnect local folder or relink media" });
          }} />}
        {active && asset?.type === "video" && ["error", "loading", "buffering"].includes(loadState.phase) && (
          <div style={{ position: "absolute", left: "6%", right: "6%", bottom: "7%", zIndex: 90, padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,.74)", color: "white", fontSize: 9, letterSpacing: ".12em" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span>{loadState.phase === "error" ? (loadState.message || "VIDEO UNAVAILABLE — RELINK OR CONVERT SOURCE") : loadState.phase.toUpperCase()}</span><span>{loadState.pct ? loadState.pct + "%" : "PREPARING"}</span></div>
            <div style={{ height: 3, borderRadius: 4, overflow: "hidden", background: "rgba(255,255,255,.18)" }}><div style={{ width: (loadState.pct || 12) + "%", height: "100%", background: "#ff8c00", transition: "width .2s" }} /></div>
          </div>
        )}
        {asset?.url && asset.type === "lottie" && <LottieLayer url={asset.url} time={Math.max(0, playhead - clip.start + offset)} playing={playing && active} speed={clip.lottieSpeed || 1} loop={clip.lottieLoop !== false} />}
        {asset?.url && isStill && <img key={imgCors ? "cors" : "plain"} ref={vRef} src={asset.url} className="mvid" alt="" style={hasForge ? { opacity: 0 } : undefined} crossOrigin={imgCors ? "anonymous" : undefined} onError={() => { if (imgCors) setImgCors(false); }} />}
        {asset && !asset.url && (
          <div className="sboard">
            <div className="sb-stripe gray" />
            <div className="sb-head"><span className="sb-type">{asset.name}</span><span className="sb-status">OFFLINE — IMPORTED FROM {asset.imported || "NLE"} · RELINK IN INSPECTOR</span></div>
            <div className="sb-body"><div className="noclip">MEDIA OFFLINE</div></div>
          </div>
        )}
      </>}
      {!asset && shot && (
        <div className="sboard">
          <div className="sb-stripe" />
          <div className="sb-head">
            <span className="sb-slug">{shot.slug}</span><span className="sb-type">{shot.type}</span>
            <span className="sb-status">{shot.status === "ready" ? "PROMPTS READY — AWAITING GENERATION" : "PLANNED"}</span>
          </div>
          {shot.frameUrl ? <img src={shot.frameUrl} className="sb-frame" alt="" /> : (
            <div className="sb-body">
              <div className="sb-cam">{shot.camera}</div>
              {shot.lines && <div className="sb-line">"{shot.lines}"</div>}
              <div className="sb-purpose">{shot.purpose}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- GPU program monitor (Phase 2) ----------
   One WebGPU canvas that composites the eligible video layers MonitorLayer registered — sampling
   those same <video> elements each frame (GPU→GPU copy), applying per-layer transform / opacity /
   grade / fade. Replaces the stack of visible per-clip <video> elements with a single GPU surface.
   Any init or per-frame failure calls onFail() → the parent flips back to the DOM MonitorLayer stack
   (byte-identical fallback). A health check does the same if it can't produce output while layers are
   registered, so a default-on state can never leave the monitor stuck on black. */
function GpuStage({ reg, hostRef, onFail }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    let alive = true, raf = 0, comp = null, drewSomething = false, framesWithLayers = 0;
    const fail = () => { if (!alive) return; alive = false; cancelAnimationFrame(raf); try { comp?.destroy(); } catch { /* */ } onFail?.(); };
    (async () => {
      try {
        comp = await createCompositor(canvasRef.current);
        if (!comp || !alive) { if (comp && !alive) comp.destroy(); else fail(); return; }
        const tick = () => {
          if (!alive) return;
          try {
            const cv = canvasRef.current, host = hostRef?.current;
            if (cv && host) {
              const dpr = Math.min(2, window.devicePixelRatio || 1);
              const w = Math.max(1, Math.round(host.clientWidth * dpr)), h = Math.max(1, Math.round(host.clientHeight * dpr));
              if (cv.width !== w || cv.height !== h) comp.resize(w, h);
            }
            const layers = [...reg.values()].filter((e) => e && e.el).sort((a, b) => (a.z || 0) - (b.z || 0)).map((e) => {
              const f = e.fx || {}; const fade = e.fade ?? 1;
              return {
                source: e.el,
                opacity: (f.op ?? 1) * fade, scale: f.sc ?? 1,
                tx: ((f.x ?? 0) / 100 + (e.track?.x || 0)) * 2, ty: -((f.y ?? 0) / 100 + (e.track?.y || 0)) * 2, rot: -((f.rot ?? 0) * Math.PI) / 180,
                homography: e.homography || null,
                grade: { brightness: f.bri ?? 1, contrast: f.con ?? 1, saturation: f.sat ?? 1, warmth: f.warm ?? 0, hue: ((f.hue ?? 0) * Math.PI) / 180 },
              };
            });
            comp.composite(layers);
            if (layers.length) { framesWithLayers++; drewSomething = true; }
            // Health check: if we've had layers for ~90 frames but the canvas is still blank, bail to DOM.
            if (framesWithLayers > 90 && !drewSomething) return fail();
          } catch { return fail(); }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch { fail(); }
    })();
    return () => { alive = false; cancelAnimationFrame(raf); try { comp?.destroy(); } catch { /* */ } };
  }, []); // eslint-disable-line
  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", zIndex: 1, background: "#000" }} />;
}

/* ---------- audio playback: one active clip on one audio track (a1/a2) ----------
   Audio-track clips were only drawn as waveforms — never mounted to a playing element,
   so music/dialogue was silent. This mounts a hidden <audio> synced to the playhead. */
function AudioLayer({ clip, prod, playhead, playing, track = {}, trackId, active = true }) {
  const aRef = useRef(null);
  const graphRef = useRef(undefined); // undefined = not attached yet, null = failed, Graph = attached
  const [ctxTick, setCtxTick] = useState(0); // bump when the AudioContext state changes
  // Cross-origin media (cloud-synced assets on firebasestorage) MUST load with
  // crossOrigin="anonymous" or the mixer's MediaElementSource plays pure silence (tainted media,
  // no error — this is what killed all audio-track sound). If a host ever refuses CORS the
  // element errors instead; we then rebuild it plain and play it DIRECT (no DSP, but audible).
  const [corsFail, setCorsFail] = useState(false);
  const asset = clip.assetId ? prod.mediaPool.find((a) => a.id === clip.assetId) : null;
  const [resolvedAudio, setResolvedAudio] = useState(null);
  const [sourceRetry, setSourceRetry] = useState(0);
  const [audioError, setAudioError] = useState("");
  useEffect(() => { setSourceRetry(0); setAudioError(""); }, [asset?.id,asset?.url]);
  useEffect(() => {
    let alive = true, source = null;
    setResolvedAudio(null);
    resolveMediaSource(asset, sourceRetry > 0).then((s) => {
      if (!alive) { s.release(); return; }
      source = s; setResolvedAudio({ id: asset?.id, original: asset?.url, url: s.url });
    }).catch(error => { if (alive) {setAudioError(error.message);reportMediaHealth(asset?.id,error.message);} });
    return () => { alive = false; source?.release(); };
  }, [asset?.id, asset?.url, sourceRetry]);
  const url = resolvedAudio?.id === asset?.id && resolvedAudio?.original === asset?.url ? resolvedAudio?.url : null;
  const wantCors = needsCors(url) && !corsFail;
  const offset = clip.srcIn || 0;
  useEffect(() => { setCorsFail(false); }, [url]); // new source, new chance
  useEffect(() => { graphRef.current = undefined; }, [url, corsFail]); // element remounts → re-resolve routing (attach is WeakMap-idempotent)
  // Re-run the routing when the shared context flips suspended→running, so the DSP graph
  // attaches the moment audio is allowed (until then the element plays directly = audible).
  useEffect(() => {
    const ctx = getAudioCtx();
    if (!ctx) return undefined;
    const onchange = () => setCtxTick((t) => t + 1);
    ctx.addEventListener("statechange", onchange);
    return () => ctx.removeEventListener("statechange", onchange);
  }, []);
  useEffect(() => {
    const a = aRef.current;
    if (!a || !url) return;
    if (active) {
      resumeAudioCtx();
      const t = (playing && engineRunning() ? engineClock() : playhead) - clip.start + offset;
      if (!playing || Math.abs(a.currentTime - t) > 0.25) { try { a.currentTime = Math.max(0, t); } catch { /* seeking */ } }
      if (playing && a.paused) a.play().catch(() => {});
      if (!playing && !a.paused) a.pause();
    } else { // warm buffer — parked at in-point, paused, ready to go live gaplessly
      if (!a.paused) a.pause();
      try { if (Math.abs(a.currentTime - offset) > 0.05) a.currentTime = Math.max(0, offset); } catch { /* seeking */ }
    }
  }, [active, playhead, playing, url, clip.start, offset, wantCors]);
  // DSP strip: gain / pan / 5-band EQ / compressor at clip + track stage. Crucially, only route
  // through Web Audio ONCE THE CONTEXT IS RUNNING — a MediaElementSource on a suspended context is
  // silent, which killed all mixer-routed audio. Until running, the bare <audio> plays directly.
  const clipAudioKey = JSON.stringify(clip.audio || null);
  const trackKey = JSON.stringify({ v: track.vol, m: track.mute, p: track.pan, e: track.eq, c: track.comp, sr: track.sendReverb, sd: track.sendDelay });
  useEffect(() => {
    const a = aRef.current;
    if (!a || !url) return;
    const ctx = getAudioCtx();
    if (active) resumeAudioCtx();
    // Attach the DSP strip only when the context is running AND the element's samples are
    // readable (same-origin, or cross-origin loaded via CORS). A corsFail element plays direct.
    if (ctx && ctx.state === "running" && !engineIsDead() && graphRef.current === undefined && (!needsCors(url) || wantCors)) graphRef.current = attachAudioGraph(a);
    const g = graphRef.current || null;
    if (g) {
      a.muted = !!clip.disabled; a.volume = 1;
      g.apply(clip.audio, { ...track, mute: track.mute || !active });
      if (active && trackId) meterRegistry.set(trackId, g.level);
    } else if (active) { // context not running yet (or Web Audio unavailable) — element plays directly
      const cv = clip.audio?.vol == null ? 1 : clip.audio.vol;
      const tv = track.vol == null ? 1 : track.vol;
      a.volume = Math.max(0, Math.min(1, cv * tv));
      a.muted = !!track.mute || !!clip.disabled;
    } else { a.muted = true; } // warm buffer — silent
  }, [active, url, clipAudioKey, trackKey, clip.disabled, trackId, ctxTick, wantCors]);
  // Release the meter when this track's clip goes silent/unmounts.
  useEffect(() => () => { if (trackId && meterRegistry.get(trackId) === graphRef.current?.level) meterRegistry.delete(trackId); }, [trackId]);
  const failure = active && audioError ? <div role="status" style={{position:"absolute",bottom:4,left:8,zIndex:100,color:"#ffbc80",background:"#171717",padding:6,fontSize:11}}>{asset?.name || "Audio"}: {audioError}</div> : null;
  if (!url || clip.disabled) return failure;
  return <>{failure}<audio key={wantCors ? "cors" : "plain"} ref={aRef} src={url} preload="auto" style={{ display: "none" }}
    {...(wantCors ? { crossOrigin: "anonymous" } : {})}
    onCanPlay={() => {
      setAudioError("");
      // Element just became ready — if we are mid-play and it missed its start, join now.
      const a = aRef.current;
      if (a && active && playing && a.paused) {
        const t = (engineRunning() ? engineClock() : playhead) - clip.start + offset;
        try { if (Math.abs(a.currentTime - Math.max(0, t)) > 0.25) a.currentTime = Math.max(0, t); } catch { /* */ }
        a.play().catch(() => {});
      }
    }}
    onError={() => {
      const code = aRef.current?.error?.code;
      reportMediaHealth(asset?.id,code===3?"Audio decode failed":"Audio source unavailable or unsupported");
      if (sourceRetry === 0) { setSourceRetry(1); return; }
      if (wantCors && code !== 3) { setCorsFail(true); return; }
      setAudioError(code === 3 ? "DECODE FAILED — bytes loaded, but the browser rejected the audio stream" : "SOURCE UNAVAILABLE OR UNSUPPORTED — reconnect local folder or relink/convert this file");
    }} /></>;
}

/* ---------- Resolve-style per-track peak meter (reads the live DSP analyser) ---------- */
function TrackMeter({ trackId }) {
  const coverRef = useRef(null);
  const peakRef = useRef(0);
  useEffect(() => {
    let raf; let hold = 0;
    const tick = () => {
      const sampler = meterRegistry.get(trackId);
      const lv = sampler ? Math.min(1, sampler() * 1.1) : 0;
      // fast attack, slow release for a readable ballistic like a real meter
      hold = lv > hold ? lv : Math.max(lv, hold - 0.03);
      if (coverRef.current) coverRef.current.style.height = (100 - hold * 100).toFixed(1) + "%";
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [trackId]);
  return <div className="vmeter" title="Track level"><i ref={coverRef} style={{ height: "100%" }} /></div>;
}

/* ---------- Lottie layer: vector animation on the timeline, playhead-synced ----------
   Plays .lottie / Lottie .json via dotlottie-web on a transparent canvas. While the transport
   runs it free-runs at `speed`; paused/scrubbing it seeks to the exact frame for the playhead. */
function LottieLayer({ url, time, playing, speed = 1, loop = true }) {
  const canvasRef = useRef(null);
  const dlRef = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dl = null, alive = true;
    (async () => {
      try {
        const { DotLottie } = await import("@lottiefiles/dotlottie-web");
        if (!alive || !canvasRef.current) return;
        dl = new DotLottie({ canvas: canvasRef.current, src: url, loop, autoplay: false });
        dl.addEventListener("load", () => { if (alive) setReady(true); });
        dlRef.current = dl;
      } catch (e) { console.warn("[fabula-lottie]", e?.message || e); }
    })();
    return () => { alive = false; try { dl?.destroy(); } catch { /* */ } dlRef.current = null; setReady(false); };
  }, [url, loop]);
  useEffect(() => {
    const dl = dlRef.current;
    if (!dl || !ready) return;
    try {
      dl.setSpeed?.(Math.max(0.05, speed));
      const durSec = dl.duration || 0;
      if (playing) { if (!dl.isPlaying) { if (durSec > 0 && dl.totalFrames) { const t = loop ? ((time * speed) % durSec) : Math.min(time * speed, durSec - 0.001); dl.setFrame?.(Math.max(0, (t / durSec) * (dl.totalFrames - 1))); } dl.play(); } }
      else { dl.pause(); if (durSec > 0 && dl.totalFrames) { const t = loop ? (((time * speed) % durSec) + durSec) % durSec : Math.max(0, Math.min(time * speed, durSec - 0.001)); dl.setFrame?.((t / durSec) * (dl.totalFrames - 1)); } }
    } catch { /* mid-load */ }
  }, [playing, time, speed, loop, ready]);
  return <canvas ref={canvasRef} className="mvid" style={{ background: "transparent" }} width={960} height={540} />;
}

/* ---------- hover-scrub video thumbnail (media pool) — sweep the mouse across to preview ----------
   memo: pool thumbs are <video> elements — re-rendering them on every transport frame is wasted work. */
// LAZY thumbnail: mounts a <video> only while the card is on/near screen. Browsers cap concurrent video
// decoders (~75) and choke well before that, so a large pool used to spawn thousands of <video>s and
// hang/crash the tab. Now an IntersectionObserver keeps the live count to roughly what's visible; cards
// off-screen render a cheap placeholder and free their decoder.
const ScrubThumb = memo(function ScrubThumb({ url, className }) {
  const wrap = useRef(null);
  const r = useRef(null);
  const [onScreen, setOnScreen] = useState(false);
  const [slot, setSlot] = useState(false);      // holds a global decoder-budget slot
  const releaseRef = useRef(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") { setOnScreen(true); return undefined; }
    const io = new IntersectionObserver((ents) => { for (const e of ents) setOnScreen(e.isIntersecting); }, { rootMargin: "250px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Only mount a real <video> decoder when on-screen AND the global budget has a free slot — so a huge
  // pool can never exhaust the browser's decoder cap and crash the tab. Off-screen → release the slot.
  useEffect(() => {
    if (onScreen && !releaseRef.current) { const rel = acquireDecoder(); if (rel) { releaseRef.current = rel; setSlot(true); } else setSlot(false); }
    else if (!onScreen && releaseRef.current) { releaseRef.current(); releaseRef.current = null; setSlot(false); }
  }, [onScreen]);
  useEffect(() => () => { if (releaseRef.current) { releaseRef.current(); releaseRef.current = null; } }, []);
  const showVideo = onScreen && slot;
  return (
    <div ref={wrap} className={className} style={{ background: "#0c0c11", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {showVideo ? (
        <video ref={r} src={url} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onMouseMove={(e) => {
            const v = r.current; if (!v || !v.duration || !isFinite(v.duration)) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const f = Math.max(0, Math.min(0.999, (e.clientX - rect.left) / rect.width));
            try { v.currentTime = f * v.duration; } catch { /* not seekable yet */ }
          }}
          onMouseLeave={() => { const v = r.current; if (v && v.duration && isFinite(v.duration)) { try { v.currentTime = 0; } catch { /* */ } } }} />
      ) : <span style={{ fontSize: 16, color: "#3a3a48" }}>▶</span>}
    </div>
  );
});

/* ---------- media warm cache: keep timeline clips' media decoded + resident in RAM ----------
   Playback used to drop out at clip boundaries because the monitor element swaps `src` and the
   browser tears down / reloads the next clip cold. This mounts hidden preloaded elements for the
   media used on the timeline so the bytes stay resident and the browser keeps them warm — playback
   across cuts is far smoother, and the second pass is seamless. Capped to bound memory. */
const MediaWarmer = memo(function MediaWarmer({ prod, clips }) {
  const items = useMemo(() => {
    const seen = new Set(); const out = [];
    for (const c of clips) {
      if (!c.assetId || seen.has(c.assetId)) continue;
      const a = prod?.mediaPool?.find((x) => x.id === c.assetId);
      if (a?.url && (a.type === "video" || a.type === "audio")) { seen.add(c.assetId); out.push({ id: a.id, url: a.url, type: a.type }); }
      if (out.length >= 12) break;
    }
    return out;
  }, [clips, prod]);
  if (!items.length) return null;
  return (
    <div aria-hidden style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
      {items.map((it) => it.type === "video"
        ? <video key={it.id} src={it.url} preload="auto" muted playsInline {...(needsCors(it.url) ? { crossOrigin: "anonymous" } : {})} />
        : <audio key={it.id} src={it.url} preload="auto" muted {...(needsCors(it.url) ? { crossOrigin: "anonymous" } : {})} />)}
    </div>
  );
});

/* ---------- 3D STAGE: flat image → depth-displaced set geometry ---------- */
function Stage3D({ prod, ping }) {
  const mountRef = useRef(null);
  const threeRef = useRef({});
  const [imgAssetId, setImgAssetId] = useState("");
  const [depthUrl, setDepthUrl] = useState("");
  const [depthScale, setDepthScale] = useState(1.6);
  const [cam, setCam] = useState({ az: 0, el: 8, dist: 11 });
  const depthFileRef = useRef(null);
  const imgAsset = prod.mediaPool.find((a) => a.id === imgAssetId);
  const candidates = prod.mediaPool.filter((a) => (a.type === "image" || a.type === "graphic") && a.url);

  useEffect(() => {
    if (!mountRef.current || !imgAsset?.url) return;
    const W = mountRef.current.clientWidth, H = 380;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H); renderer.setClearColor(0x050505);
    mountRef.current.appendChild(renderer.domElement);
    const sceneT = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
    sceneT.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 0.5); dl.position.set(3, 5, 6); sceneT.add(dl);
    const loader = new THREE.TextureLoader();
    const geo = new THREE.PlaneGeometry(16, 9, 160, 90);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(geo, mat); sceneT.add(mesh);
    loader.load(imgAsset.url, (tx) => { mat.map = tx; mat.needsUpdate = true; });
    // depth map drives displacement; without one, the image's own luminance gives a rough relief
    loader.load(depthUrl || imgAsset.url, (dx) => { mat.displacementMap = dx; mat.displacementScale = depthScale; mat.needsUpdate = true; });
    const st = { renderer, camera, mat, drag: null, az: cam.az, el: cam.el, dist: cam.dist, alive: true };
    threeRef.current = st;
    const place = () => {
      const a = (st.az * Math.PI) / 180, e = (st.el * Math.PI) / 180;
      camera.position.set(st.dist * Math.sin(a) * Math.cos(e), st.dist * Math.sin(e), st.dist * Math.cos(a) * Math.cos(e));
      camera.lookAt(0, 0, 0);
    };
    const loop = () => { if (!st.alive) return; place(); renderer.render(sceneT, camera); requestAnimationFrame(loop); };
    loop();
    const el = renderer.domElement;
    const down = (e) => { st.drag = { x: e.clientX, y: e.clientY, az: st.az, el: st.el }; };
    const move = (e) => {
      if (!st.drag) return;
      st.az = st.drag.az - (e.clientX - st.drag.x) * 0.3;
      st.el = Math.max(-60, Math.min(75, st.drag.el + (e.clientY - st.drag.y) * 0.25));
      setCam({ az: Math.round(st.az), el: Math.round(st.el), dist: Math.round(st.dist * 10) / 10 });
    };
    const up = () => { st.drag = null; };
    const wheel = (e) => { e.preventDefault(); st.dist = Math.max(3, Math.min(30, st.dist + e.deltaY * 0.01)); setCam((c) => ({ ...c, dist: Math.round(st.dist * 10) / 10 })); };
    el.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      st.alive = false;
      el.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
      renderer.dispose(); geo.dispose(); mat.dispose();
      if (mountRef.current?.contains(el)) mountRef.current.removeChild(el);
    };
  }, [imgAsset?.url, depthUrl]);

  useEffect(() => { const st = threeRef.current; if (st.mat) { st.mat.displacementScale = depthScale; st.mat.needsUpdate = true; } }, [depthScale]);

  const camNote = `STAGED CAMERA — set: "${imgAsset?.name || "—"}" | azimuth ${cam.az}deg ${cam.az < 0 ? "(camera left of plate)" : cam.az > 0 ? "(camera right of plate)" : "(plate-centered)"} | elevation ${cam.el}deg ${cam.el > 15 ? "(high angle)" : cam.el < -10 ? "(low angle)" : "(near eye-level)"} | distance ${cam.dist} units ${cam.dist < 7 ? "(close, wide-feeling)" : cam.dist > 16 ? "(long lens feel)" : "(normal)"} | depth relief ${depthScale.toFixed(1)}. Use this spatial relationship when generating the shot.`;

  return (
    <div className="glass-card">
      <div className="lbl">3D STAGE — flat set image → orbitable depth geometry. Stage the camera, copy the spatial note into your shot prompts so video/omni models understand the space.</div>
      <div className="btnrow" style={{ marginBottom: 8 }}>
        <select className="sel" style={{ maxWidth: 280 }} value={imgAssetId} onChange={(e) => setImgAssetId(e.target.value)}>
          <option value="">— pick a set / place / environment image —</option>
          {candidates.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button className="minibtn" onClick={() => depthFileRef.current?.click()}><Upload size={11} /> DEPTH MAP</button>
        <input ref={depthFileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setDepthUrl(URL.createObjectURL(f)); ping("Depth map loaded — true geometry"); } e.target.value = ""; }} />
        <span className="dim small">No depth map? Luminance relief is used. Gaussian-splat reconstruction is the codebase path — this stage exports the same camera language.</span>
      </div>
      {imgAsset ? <div ref={mountRef} className="stage3d" /> : <div className="dim center" style={{ padding: 50 }}>Pick an image to raise the set.</div>}
      <div className="btnrow" style={{ marginTop: 8 }}>
        <span className="dim small">DEPTH</span>
        <input type="range" min="0" max="4" step="0.1" value={depthScale} onChange={(e) => setDepthScale(parseFloat(e.target.value))} />
        <span className="tc" style={{ fontSize: 11 }}>AZ {cam.az}° · EL {cam.el}° · D {cam.dist}</span>
        <CopyBtn text={camNote} label="⤓ COPY CAMERA NOTE" small />
      </div>
    </div>
  );
}

/* ---------- attach-media mini component ---------- */
function AttachMedia({ onAttach }) {
  const [url, setUrl] = useState("");
  const ref = useRef(null);
  return (
    <div>
      <div className="btnrow">
        <input className="in tiny grow" placeholder="paste video/image URL from your service…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="minibtn" disabled={!url.trim()} onClick={() => { const type = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ? "image" : "video"; onAttach(url.trim(), "generated", type); setUrl(""); }}>ATTACH</button>
      </div>
      <button className="ghost full" style={{ marginTop: 6 }} onClick={() => ref.current?.click()}><Upload size={11} /> OR UPLOAD FILE (session-only)</button>
      <input ref={ref} type="file" accept="video/*,image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const type = f.type.startsWith("video") ? "video" : "image"; onAttach(URL.createObjectURL(f), f.name, type); e.target.value = ""; }} />
    </div>
  );
}

/* ════════════════════════ CSS ════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,700;0,900;1,900&family=JetBrains+Mono:wght@400;700&display=swap');
:root{
  --org:#f97316; --org-dim:rgba(249,115,22,.14); --blue:#00A3FF; --green:#22c55e; --red:#ef4444; --pur:#a855f7;
  /* Plajah logo colors — purple → magenta → orange. Used as fleeting hints, never overbearing. */
  --pl-purple:#7c3aed; --pl-magenta:#e0459b; --pl-orange:#f97316;
  --pl-grad:linear-gradient(120deg,var(--pl-purple),var(--pl-magenta) 52%,var(--pl-orange));
  /* grayer base so panels read as separated layers instead of a flat black void */
  --bg:#0f0e13; --bg2:#16161c; --panel:#1c1c23; --panel2:#22222b;
  --w04:rgba(255,255,255,.04); --w08:rgba(255,255,255,.08); --w40:rgba(255,255,255,.4);
  /* contrasting gray hairlines for UX separation */
  --line:rgba(255,255,255,.13); --line-2:rgba(255,255,255,.08); --line-hi:rgba(255,255,255,.22);
}
*{box-sizing:border-box} 
.studio{height:100vh;display:flex;flex-direction:column;background:var(--bg);color:#e5e5e5;
  font-family:'Inter',system-ui,sans-serif;overflow:hidden;position:relative}
.mono{font-family:'JetBrains Mono',monospace}
/* ambient platform-theme wash — Plajah logo hues bleeding faintly behind the frosted panels */
.blob{position:absolute;width:46%;height:46%;border-radius:50%;filter:blur(150px);opacity:.16;pointer-events:none;z-index:0}
.b1{top:-14%;left:-12%;background:var(--pl-purple)}
.b2{bottom:-16%;right:-12%;background:var(--pl-magenta)}
.b3{position:absolute;width:34%;height:34%;border-radius:50%;filter:blur(150px);opacity:.10;pointer-events:none;z-index:0;bottom:-10%;left:28%;background:var(--pl-orange)}
.glass{backdrop-filter:blur(24px);background:rgba(255,255,255,.04);border-color:var(--line)}
.glass-dark{backdrop-filter:blur(30px) saturate(1.2);background:rgba(26,26,33,.62);border:1px solid var(--line);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.glass-card{backdrop-filter:blur(22px) saturate(1.15);background:rgba(34,34,43,.5);border:1px solid var(--line);
  border-radius:12px;padding:18px;margin-bottom:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:#0a0a0a}::-webkit-scrollbar-thumb{background:#333;border-radius:3px}

/* header */
.hdr{height:46px;border-bottom:1px solid;display:flex;align-items:center;gap:18px;padding:0 16px;z-index:30;position:relative}
.brand{display:flex;align-items:center;gap:9px}
.brandmark{width:24px;height:24px;flex:none}
.brand-main{font-weight:900;font-style:italic;letter-spacing:-.045em;font-size:17px;color:#fff;text-transform:uppercase}
.brand-tag{font-size:8.5px;letter-spacing:.3em;color:var(--w40);font-weight:700;margin-left:8px}
.hdr-mid{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.hdr-prod{background:var(--org-dim);border:1px solid rgba(249,115,22,.3);color:var(--org);font-weight:800;
  font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:6px;cursor:pointer}
.scene-pick{background:rgba(255,255,255,.05);border:1px solid var(--w08);color:#ddd;font-size:11px;padding:5px 8px;border-radius:6px;max-width:340px}
.hdr-right{display:flex;align-items:center;gap:12px;font-size:9px;letter-spacing:.2em;color:var(--w40);font-weight:700}
.warn-dot{color:var(--red)}

/* main + scroll */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;z-index:1;position:relative}
.scroll{overflow-y:auto;height:100%}
.pad{padding:24px clamp(16px,3.5vw,48px);max-width:1680px;margin:0 auto;width:100%}
.mega{font-size:clamp(28px,4.5vw,44px);font-weight:900;font-style:italic;text-transform:uppercase;
  letter-spacing:-.045em;color:var(--org);margin:0 0 6px}
.mega.sm{font-size:24px}
.slash{color:#fff}
.lede{color:var(--w40);font-weight:500;margin:0 0 22px;max-width:640px;line-height:1.5;font-size:14px}
.lbl{font-size:10.5px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:rgba(249,115,22,.65);margin:0 0 6px}

/* STUDIO SYSTEM — the shared vocabulary every room draws from. Tokens unchanged;
   these RULES make them apply consistently.
   1) LABEL LADDER: .cap (structural, white 25%) / .lbl (panel header, orange 62%)
      / .param (parameter name, white 40%). Every value = JetBrains Mono (.numval).
   2) COLOUR CONTRACT: orange=selected, blue=picture, green=audio/matte, yel=solo,
      pur=animated/AI, red=playhead/destructive; the Plajah gradient stays ambient.
   3) IDENTITY STRIPE: the MixConsole --tab stripe generalised to anything named.
   4) ROOM TOOL BAND: band 2 of every page. See renderRoomToolbar(). */
.cap{font-size:8.5px;font-weight:900;letter-spacing:.24em;text-transform:uppercase;color:var(--w25);margin:0}
.param{font-size:8px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--w40);margin:0}
.numval{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;font-weight:700}
.idstripe{width:3px;border-radius:2px;background:var(--tab,var(--w25));flex:none;align-self:stretch;min-height:12px}
.idtop{position:relative}
.idtop::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:var(--tab,var(--org));opacity:.92;z-index:2}
.idleft{position:relative}
.idleft::before{content:"";position:absolute;left:0;top:5px;bottom:5px;width:3px;border-radius:0 2px 2px 0;background:var(--tab,var(--w25));z-index:2}
.roomtool{height:34px;flex:0 0 auto;display:flex;align-items:center;gap:5px;padding:0 11px;
  border-bottom:1px solid var(--line);background:rgba(0,0,0,.24);position:relative;z-index:12;
  overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
.roomtool::-webkit-scrollbar{height:0}
.tgrp{display:flex;align-items:center;gap:3px;flex:none}
.tdiv{width:1px;height:16px;background:var(--line);margin:0 4px;flex:none}
.tbtn2{height:23px;padding:0 8px;border-radius:5px;background:rgba(255,255,255,.06);
  border:1px solid var(--line-2);color:#cfcfd6;font-size:9px;font-weight:800;letter-spacing:.1em;
  text-transform:uppercase;display:inline-flex;align-items:center;gap:5px;justify-content:center;
  font-family:inherit;cursor:pointer;white-space:nowrap;flex:none}
.tbtn2:hover:not(:disabled){background:rgba(255,255,255,.12);color:#fff}
.tbtn2.on{background:var(--org);border-color:var(--org);color:#0b0b0e}
.tbtn2.ghost{background:transparent;color:var(--w40)}
.tbtn2.danger{color:#ff9a9a;border-color:rgba(239,68,68,.4)}
.tbtn2:disabled{opacity:.35;cursor:default}
.tbtn2 .k{font-size:7px;opacity:.55;font-family:'JetBrains Mono',monospace;letter-spacing:0}
.tbtn2:focus-visible,.tsel:focus-visible{outline:2px solid var(--org);outline-offset:1px}
.segx{display:flex;gap:2px;border:1px solid var(--line-2);border-radius:6px;padding:2px;background:rgba(0,0,0,.34);flex:none}
.segx button{background:none;border:none;font-family:inherit;cursor:pointer;
  font-size:7.5px;font-weight:900;letter-spacing:.1em;padding:3px 8px;border-radius:4px;color:var(--w25);text-transform:uppercase}
.segx button:hover{color:#fff}
.segx button.on{background:var(--org);color:#0b0b0e}
.tstate{margin-left:auto;display:flex;align-items:center;gap:5px;flex:none;padding-left:10px}
.tstate .numval{font-size:9.5px;color:#ccc}
.troom{font-size:8.5px;font-weight:900;letter-spacing:.24em;color:rgba(255,255,255,.16);
  text-transform:uppercase;flex:none;padding-right:2px}
.dim{color:var(--w40)} .dim2{color:rgba(255,255,255,.25)} .small{font-size:12px} .center{text-align:center}
.big-empty{padding:80px 20px;font-size:14px;letter-spacing:.04em}
.ital{font-style:italic}

/* inputs */
.in,.ta,.sel{width:100%;background:rgba(0,0,0,.45);border:1px solid var(--w08);color:#eee;border-radius:8px;
  padding:9px 11px;font-size:13.5px;font-family:inherit}
.in.big{font-size:16px;font-weight:700}
.in.tiny{padding:6px 9px;font-size:12px}
.in.desc{background:transparent;border:none;border-bottom:1px solid var(--w08);border-radius:0;color:var(--w40);padding-left:0;margin-bottom:16px}
.ta{resize:vertical;line-height:1.5}
.ta.mono{font-family:'JetBrains Mono',monospace;font-size:12.5px}
.ta.dlg{border-left:3px solid var(--org);margin:8px 0}
.in:focus,.ta:focus,.sel:focus{outline:none;border-color:rgba(249,115,22,.55)}
.grow{flex:1}

/* ═══ SLEEK CONTROLS — modern, un-cartoony sliders across the whole studio ═══
   Replaces the chunky native accent-color range with a fine rail + a small precise knurled thumb.
   Vertical faders (.mcfader/.mcknob) override this below; horizontal sliders inherit it. */
.studio input[type=range]{-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;height:16px}
.studio input[type=range]::-webkit-slider-runnable-track{height:3px;border-radius:2px;
  background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.2));box-shadow:inset 0 0 2px rgba(0,0,0,.55)}
.studio input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;margin-top:-5px;border-radius:50%;
  background:radial-gradient(circle at 34% 30%,#fdfdff,#c4c4cd 55%,#6f6f79);border:1px solid rgba(0,0,0,.55);
  box-shadow:0 1px 3px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.5);transition:filter .1s}
.studio input[type=range]::-webkit-slider-thumb:hover{filter:brightness(1.12)}
.studio input[type=range]::-moz-range-track{height:3px;border-radius:2px;background:rgba(255,255,255,.16)}
.studio input[type=range]::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:radial-gradient(circle at 34% 30%,#fff,#7a7a84);border:1px solid rgba(0,0,0,.5)}
/* vertical mini-knob sliders (EQ / sends) — slim rail + compact cap tinted by channel color */
.mcknob input{-webkit-appearance:none;appearance:none;width:16px;height:34px;background:transparent;cursor:pointer;writing-mode:vertical-lr;direction:rtl}
.mcknob input::-webkit-slider-runnable-track{width:3px;border-radius:2px;background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.16),rgba(255,255,255,.02));box-shadow:inset 0 0 2px rgba(0,0,0,.7)}
.mcknob input::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:9px;margin-left:-5.5px;border-radius:2px;
  background:linear-gradient(180deg,#40404a,#20202a);border:1px solid rgba(0,0,0,.6);box-shadow:0 1px 2px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.14)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
@media(max-width:760px){.grid2{grid-template-columns:1fr}}

/* buttons */
.cta{display:inline-flex;align-items:center;gap:7px;background:var(--org);color:#000;font-weight:900;
  letter-spacing:.1em;text-transform:uppercase;font-size:12px;border:none;border-radius:8px;padding:11px 18px;cursor:pointer}
.cta.red{background:var(--red);color:#fff}
.cta.full{width:100%;justify-content:center;padding:14px}
.cta.sm{padding:9px 12px;font-size:10.5px}
.cta:disabled{opacity:.4;cursor:default}
.cta:hover:not(:disabled){filter:brightness(1.1)}
.minibtn{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.07);border:1px solid var(--w08);
  color:#ddd;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:7px 11px;border-radius:6px;cursor:pointer}
.minibtn:hover{background:rgba(255,255,255,.12)}
.minibtn.blue{border-color:rgba(0,163,255,.4);color:var(--blue)}
.minibtn.full{width:100%;justify-content:center}
.minibtn:disabled{opacity:.4;cursor:default}
.ghost{display:inline-flex;align-items:center;gap:5px;background:none;border:1px solid var(--w08);color:var(--w40);
  font-size:10px;font-weight:700;letter-spacing:.1em;padding:6px 10px;border-radius:6px;cursor:pointer;text-transform:uppercase}
.ghost:hover{color:#fff;border-color:rgba(255,255,255,.25)}
.ghost.danger:hover{color:var(--red);border-color:rgba(239,68,68,.5)}
.ghost.full{width:100%;justify-content:center}
.btnrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
.seg{display:flex;gap:4px;background:rgba(0,0,0,.5);border:1px solid var(--w08);border-radius:8px;padding:3px}
.seg.wide{width:100%}
.seg-btn{flex:1;background:none;border:none;color:var(--w40);font-weight:800;font-size:10.5px;letter-spacing:.1em;
  text-transform:uppercase;padding:9px 14px;border-radius:6px;cursor:pointer;white-space:nowrap}
.seg-btn.on{background:var(--org);color:#000}
.seg-btn.red.on{background:var(--red);color:#fff}
.chip{font-size:8.5px;font-weight:900;letter-spacing:.16em;padding:3px 8px;border-radius:4px;text-transform:uppercase;white-space:nowrap}
.chip.amb{background:var(--org-dim);color:var(--org)}
.chip.red{background:rgba(239,68,68,.15);color:var(--red)}
.chip.green{background:rgba(34,197,94,.15);color:var(--green)}
.chip.blue{background:rgba(0,163,255,.15);color:var(--blue)}
.chip.dimchip{background:var(--w04);color:var(--w40)}
.err{background:rgba(239,68,68,.92);color:#fff;padding:10px 16px;font-size:12.5px;letter-spacing:.03em;cursor:pointer;
  display:flex;justify-content:space-between;z-index:40}
.dismiss{opacity:.7}

/* productions */
.newprod{margin-bottom:22px}
.np-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.np-row .in{flex:2;min-width:200px}
.prodrow{display:flex;align-items:center;gap:14px;cursor:pointer;transition:border-color .2s}
.prodrow:hover{border-color:rgba(249,115,22,.45)}
.prodicon{width:42px;height:42px;border-radius:10px;background:var(--org-dim);color:var(--org);display:flex;align-items:center;justify-content:center}
.prodmain{flex:1}
.prodtitle{font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:-.02em;font-size:17px}
.prodmeta{font-size:9.5px;letter-spacing:.18em;color:var(--w40);font-weight:700;margin-top:2px}
.backlink{display:inline-flex;align-items:center;gap:4px;background:none;border:none;color:var(--w40);
  font-size:10px;font-weight:800;letter-spacing:.18em;cursor:pointer;margin-bottom:8px;text-transform:uppercase}
.backlink:hover{color:var(--org)}
.ptabs{display:flex;gap:6px;margin-bottom:18px}
.ptab{display:inline-flex;align-items:center;gap:6px;background:none;border:1px solid var(--w08);color:var(--w40);
  font-size:10px;font-weight:900;letter-spacing:.16em;padding:8px 16px;border-radius:8px;cursor:pointer;text-transform:uppercase}
.ptab.on{background:var(--org);color:#000;border-color:var(--org)}
.actcard{padding:14px}
.acthead{font-weight:900;font-style:italic;letter-spacing:.04em;color:#fff;font-size:13px;margin-bottom:8px;text-transform:uppercase}
.scenerow{display:flex;align-items:center;gap:10px;padding:8px 6px 8px 12px;border-top:1px solid var(--w04);flex-wrap:wrap}
.scenetitle{background:transparent;border:none;color:#fff;font-family:'JetBrains Mono',monospace;font-weight:700;
  font-size:12.5px;width:150px}
.scenetitle:focus{outline:1px solid rgba(249,115,22,.4);border-radius:4px}
.addscene{margin-top:8px}
.castcard{padding:16px}
.castrow1{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.castname{flex:1;background:transparent;border:none;color:var(--org);font-weight:900;font-style:italic;
  text-transform:uppercase;font-size:16px;letter-spacing:-.02em}
.castname:focus{outline:none;border-bottom:1px solid var(--org)}
.evid{font-size:9px;letter-spacing:.12em;color:var(--green);font-weight:800}

/* slate */
.slate-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px}
.stepper{display:flex;gap:4px}
.stepchip{background:none;border:1px solid var(--w08);color:var(--w40);font-size:10px;font-weight:900;
  letter-spacing:.14em;padding:7px 14px;cursor:pointer;border-radius:6px}
.stepchip.on{background:#fff;color:#000;border-color:#fff}
.stepchip:disabled{opacity:.35;cursor:default}
.readtxt{font-size:14.5px;line-height:1.55;margin-bottom:12px}
.suggest{border-left:3px solid var(--green);background:var(--w04);padding:8px 12px;margin:6px 0;font-size:13px;border-radius:0 6px 6px 0}
.lockrow{border:1px dashed var(--w08);border-radius:8px;padding:10px;margin-bottom:10px;display:flex;flex-direction:column;gap:6px}
.lockname{font-weight:900;letter-spacing:.06em;color:#fff;text-transform:uppercase;font-size:12px;display:flex;justify-content:space-between}
.shotcard{padding:14px;position:relative}
.shothead{display:flex;align-items:center;gap:10px;margin-bottom:4px}
.shotslug{font-family:'JetBrains Mono',monospace;font-weight:700;background:#000;border:1px solid var(--w08);
  color:var(--org);padding:4px 10px;border-radius:6px;font-size:13px}
.shottype{flex:1;background:transparent;border:none;color:#fff;font-weight:800;letter-spacing:.06em;font-size:13px;text-transform:uppercase}
.shottype:focus{outline:none}
.pblock{margin-top:10px}
.pbhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.ptag{font-size:8.5px;font-weight:900;letter-spacing:.2em;color:#000;background:var(--org);padding:3px 9px;border-radius:4px}
.copybtn{background:#000;color:#fff;border:1px solid var(--w08);padding:5px 12px;font-size:9px;font-weight:800;
  letter-spacing:.14em;cursor:pointer;border-radius:5px}
.copybtn:hover{border-color:var(--org);color:var(--org)}
.copybtn.sm{padding:4px 9px}

/* edit page */
.editwrap{flex:1;display:flex;flex-direction:column;overflow:hidden;padding:10px;gap:10px}
.edit-upper{flex:1;display:flex;gap:10px;min-height:0}
.pool{width:230px;border-radius:12px;padding:10px;display:flex;flex-direction:column;overflow:hidden}
.paneltitle{font-size:9px;font-weight:900;letter-spacing:.22em;color:var(--w40);display:flex;align-items:center;gap:6px;
  text-transform:uppercase;margin-bottom:8px}
.poollist{flex:1;overflow-y:auto;margin-top:8px}
.poolitem{display:flex;align-items:center;gap:7px;padding:6px;border-radius:6px;cursor:pointer;border:1px solid transparent}
.poolthumb{width:52px;height:30px;object-fit:cover;border-radius:4px;flex:0 0 auto;background:#000;cursor:ew-resize}
.hsplit{width:8px;flex:0 0 auto;cursor:col-resize;display:flex;align-items:center;justify-content:center;margin:0 -3px}
.fxlib{width:224px;min-width:224px;border-radius:12px;padding:10px;display:flex;flex-direction:column;overflow:hidden}
.fxtabs{display:flex;gap:3px;margin:2px 0 8px}
.fxtab{flex:1;padding:5px 0;border-radius:6px;border:1px solid var(--w08);background:rgba(255,255,255,.04);color:rgba(255,255,255,.55);
  font-size:8px;font-weight:900;letter-spacing:.08em;cursor:pointer}
.fxtab.on{background:rgba(255,140,0,.16);color:#FF8C00;border-color:rgba(255,140,0,.4)}
.fxbody{flex:1;overflow-y:auto;min-height:0}
.fxgrid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.fxcard{background:rgba(0,0,0,.35);border:1px solid var(--w08);border-radius:8px;padding:5px;cursor:pointer;display:flex;flex-direction:column;gap:4px}
.fxcard:hover{border-color:rgba(255,140,0,.5)}
.fxthumb{height:44px;border-radius:5px;background:linear-gradient(120deg,#ff8c42 0%,#7b5cff 45%,#31c6a8 100%);display:block}
.fxthumb.gen{display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);font-size:13px}
.fxname{font-size:8px;font-weight:800;letter-spacing:.05em;color:rgba(255,255,255,.78);text-transform:uppercase;text-align:left}
.fxlist{display:flex;flex-direction:column;gap:4px}
.fxrowbtn{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:6px;border:1px solid var(--w08);
  background:rgba(0,0,0,.3);color:#e5e5e5;font-size:10px;font-weight:600;cursor:pointer;text-align:left}
.fxrowbtn:hover{border-color:rgba(255,140,0,.5)}
.fxdot{color:#a78bfa}
.fxrowname{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fxstudio{border-radius:12px;padding:12px;flex:0 0 auto}
.hsplit::after{content:"";width:3px;height:44px;border-radius:2px;background:rgba(255,255,255,.14)}
.hsplit:hover::after{background:#FF8C00}
.poolthumbs{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(102px,1fr));gap:8px;align-content:start;margin-top:8px}
.ptcard{background:rgba(0,0,0,.35);border:1px solid var(--w08);border-radius:8px;padding:0;cursor:pointer;position:relative;overflow:hidden}
/* Mockup-C pool: search + identity-striped bins */
.poolsearch2{display:flex;align-items:center;gap:6px;border:1px solid var(--w08);background:rgba(0,0,0,.45);
  border-radius:7px;padding:5px 8px;margin-top:7px;color:var(--w40)}
.poolsearch2 input{flex:1;background:none;border:none;outline:none;color:#ddd;font-size:10.5px;font-family:inherit;min-width:0}
.poolbins{display:flex;flex-direction:column;gap:2px;margin-top:6px;max-height:132px;overflow-y:auto;flex:none}
.poolbin{display:flex;align-items:center;gap:6px;padding:4px 7px;border-radius:6px;font-size:9.5px;font-weight:700;
  color:#ccc;border:1px solid transparent;background:none;cursor:pointer;text-align:left;font-family:inherit}
.poolbin:hover{background:var(--w04)}
.poolbin.on{background:rgba(249,115,22,.1);border-color:rgba(249,115,22,.4);color:var(--org)}
.poolbin i{margin-left:auto;font-style:normal;font-size:8.5px;color:var(--w25);font-family:'JetBrains Mono',monospace}
.ptcard.previewing{border-color:#FF8C00;box-shadow:0 0 0 1px rgba(255,140,0,.4)}
.ptvid{width:100%;height:62px;object-fit:cover;border-radius:5px;background:#000;display:block;cursor:ew-resize}
.ptph{display:flex;align-items:center;justify-content:center;color:var(--w40);cursor:pointer}
.ptname{position:absolute;left:5px;right:5px;bottom:3px;font-size:7.5px;font-weight:900;letter-spacing:.06em;color:#fff;
  text-shadow:0 1px 3px #000;z-index:2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none}
.ptname-legacy{display:block;font-size:8px;font-weight:700;letter-spacing:.04em;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.75)}
.poolitem:hover{background:var(--w04);border-color:var(--w08)}
.pooltype{font-size:7.5px;font-weight:900;letter-spacing:.1em;padding:2px 5px;border-radius:3px;background:var(--w08);color:var(--w40)}
.pooltype.video{color:var(--blue)} .pooltype.audio{color:var(--green)} .pooltype.image{color:var(--org)}
.poolname{flex:1;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.genstar{color:var(--org)}
.monitor{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-width:0;position:relative;border:1px solid var(--w08);border-radius:10px;background:rgba(0,0,0,.35);backdrop-filter:blur(12px);padding:30px 10px 10px}
.screen{width:min(100%,760px);max-height:100%;background:#000;border:1px solid var(--w08);border-radius:10px;
  position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;box-shadow:0 20px 60px rgba(0,0,0,.6)}
.mvid{width:100%;height:100%;object-fit:contain}
.noclip{font-size:10px;letter-spacing:.35em;color:rgba(255,255,255,.18);font-weight:800}
.overlay-slug{position:absolute;top:8px;left:8px;font-family:'JetBrains Mono',monospace;font-size:10px;
  background:rgba(0,0,0,.6);border:1px solid var(--w08);color:var(--org);padding:2px 8px;border-radius:4px}
.sboard{position:absolute;inset:0;display:flex;flex-direction:column;background:linear-gradient(160deg,#0c0c0c,#161616)}
.sb-stripe{height:9px;background:repeating-linear-gradient(135deg,var(--org) 0 14px,#000 14px 28px);opacity:.9}
.sb-stripe.gray{background:repeating-linear-gradient(135deg,#555 0 14px,#000 14px 28px)}
.fpssel{width:84px;padding:6px 6px;font-size:10px}
.sb-head{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--w08)}
.sb-slug{font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--org);font-size:15px}
.sb-type{font-weight:800;letter-spacing:.08em;font-size:11px;text-transform:uppercase;color:#fff}
.sb-status{margin-left:auto;font-size:8px;letter-spacing:.18em;color:var(--w40);font-weight:800}
.sb-frame{flex:1;object-fit:contain;min-height:0}
.sb-body{flex:1;display:flex;flex-direction:column;justify-content:center;padding:18px 26px;gap:8px}
.sb-cam{font-size:10px;letter-spacing:.16em;color:var(--blue);font-weight:800;text-transform:uppercase}
.sb-line{font-family:'JetBrains Mono',monospace;font-size:clamp(12px,1.8vw,17px);line-height:1.5;color:#fff;
  border-left:3px solid var(--org);padding-left:14px}
.sb-purpose{font-size:11px;color:var(--w40);font-style:italic}
.transport{display:flex;align-items:center;gap:14px}
.tc{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--org)}
.tbtns{display:flex;gap:6px}
.tbtn{width:34px;height:34px;border-radius:50%;background:var(--w04);border:1px solid var(--w08);color:#fff;
  display:flex;align-items:center;justify-content:center;cursor:pointer}
.tbtn.play{background:var(--org);color:#000;border-color:var(--org)}
.tbtn:hover{filter:brightness(1.2)}
.inspector{width:262px;border-radius:12px;padding:10px;overflow-y:auto}
.insp-body{display:flex;flex-direction:column;gap:7px}
.insp-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.insp-row .lbl{margin:0}
.insp-val{font-size:11.5px;font-weight:700;text-align:right}
.insp-div{height:1px;background:var(--w08);margin:6px 0}
.insp-dlg{font-family:'JetBrains Mono',monospace;font-size:11.5px;line-height:1.5;border-left:3px solid var(--org);
  padding:6px 10px;background:var(--w04);border-radius:0 6px 6px 0}
.insp-copy{display:flex;align-items:center;justify-content:space-between;background:var(--w04);border:1px solid var(--w08);
  border-radius:6px;padding:6px 9px;margin-top:5px;font-size:9.5px;font-weight:900;letter-spacing:.18em;color:var(--w40)}

/* timeline */
.tlwrap{border-radius:12px;display:flex;flex-direction:column;overflow:hidden;flex:0 0 auto;min-height:150px}
.tl-resize{height:8px;flex:0 0 auto;cursor: row-resize;display:flex;align-items:center;justify-content:center;margin:-4px 0 -2px}
.tl-resize::after{content:"";width:44px;height:3px;border-radius:2px;background:rgba(255,255,255,.18)}
.tl-resize:hover::after{background:var(--accent,#FF8C00)}
.tl-tools{height:32px;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid var(--w08)}
.tl-commandbar{flex:0 0 auto;flex-wrap:wrap;position:relative;z-index:5;background:var(--panel,#17161c);border-bottom:1px solid var(--w08)}
.zoomer{display:flex;align-items:center;gap:8px}
.zoomer input{width:110px;accent-color:#f97316}
.tl-scroll{isolation:isolate;flex:1 1 auto;overflow-x:auto;overflow-y:auto;position:relative;min-height:0}
.tl-scroll::-webkit-scrollbar{width:12px;height:12px}
.tl-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.22);border-radius:6px;border:3px solid transparent;background-clip:padding-box}
.tl-scroll::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.4);background-clip:padding-box}
.tl-inner{position:relative;min-height:min-content}
.ruler{display:flex;height:22px;border-bottom:1px solid var(--line);position:sticky;top:0;background:#16161c;z-index:20}
.trackhead{width:128px;min-width:128px;max-width:128px;border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:3px;
  padding:4px 8px;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;position:sticky;left:0;
  background:#16161c;z-index:10;overflow:hidden}
.trackhead.video{color:var(--blue);--tab:var(--blue)} .trackhead.audio{color:var(--green);--tab:var(--green)}
.trackhead.subtitle{color:var(--blue);--tab:var(--blue)}
.trackhead::before{content:"";position:absolute;left:0;top:5px;bottom:5px;width:3px;border-radius:0 2px 2px 0;
  background:var(--tab,var(--w25));opacity:.9;z-index:2}
.thname{display:flex;align-items:center;gap:4px;min-width:0}
.thlabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
/* audio channel strip — controls on the left, vertical peak meter on the right; nothing spills the 128px header */
.trkstrip{display:flex;align-items:stretch;gap:6px;min-width:0}
.trkctrls{display:flex;align-items:center;gap:5px;flex:1 1 auto;min-width:0}
.trkfaders{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0}
.trkfaders label{display:flex;align-items:center;gap:4px;min-width:0}
.trkfaders label span{font-size:7px;color:rgba(255,255,255,.4);width:9px;flex:0 0 auto}
.trkfaders input[type=range]{flex:1 1 auto;width:100%;min-width:0;height:10px;accent-color:var(--green);cursor:pointer;margin:0}
.trkmute{flex:0 0 auto;width:17px;height:17px;border-radius:4px;border:1px solid var(--w08);
  background:rgba(255,255,255,.05);color:rgba(255,255,255,.5);font-size:9px;font-weight:900;cursor:pointer;padding:0;line-height:1}
.trkmute.on{background:var(--red);color:#fff;border-color:var(--red)}
.vmeter{flex:0 0 auto;width:9px;align-self:stretch;border-radius:2px;overflow:hidden;position:relative;
  background:linear-gradient(to top,#25c26a 0%,#25c26a 55%,#e6d84f 78%,#ff5252 100%)}
.vmeter i{position:absolute;left:0;right:0;top:0;background:#0c0c0e;display:block}
.apanel{border:1px solid var(--w08);border-radius:8px;padding:8px;margin:6px 0;background:rgba(61,220,132,.04)}
.aphead{font-size:9px;font-weight:900;letter-spacing:.1em;color:var(--green);margin-bottom:6px}
.apanel .insp-row{margin:3px 0}
.apanel .insp-row input[type=range]{flex:1;accent-color:var(--green)}
.apeq{display:flex;justify-content:space-between;gap:4px;padding:4px 2px 0}
.apband{display:flex;flex-direction:column;align-items:center;gap:2px}
.apband input[type=range]{accent-color:var(--green);cursor:pointer}
.apband span{font-size:7px;color:rgba(255,255,255,.4)}
.apband b{font-size:8px;font-family:'JetBrains Mono',monospace}
/* ── Mixing console ── */
/* ═══ MIXING CONSOLE — modern DAW (Studio One / Bitwig) aesthetic, Plajah-toned frosted glass ═══ */
.mixconsole{border-radius:14px;padding:14px}
.mcrow{display:flex;gap:8px;overflow-x:auto;padding:8px 6px 10px;align-items:flex-end;
  background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.14));border:1px solid var(--line-2);border-radius:12px}
.mcstrip{flex:0 0 auto;width:70px;border:1px solid var(--line);border-radius:10px;padding:0 5px 7px;
  display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;overflow:hidden;
  background:linear-gradient(180deg,rgba(40,40,50,.72),rgba(22,22,28,.82));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 2px 8px rgba(0,0,0,.35)}
/* colored track tab across the top — the DAW channel identity strip */
.mcstrip::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:var(--tab,var(--org));opacity:.9}
.mcstrip>*:first-child{margin-top:9px}
.mcstrip.master{background:linear-gradient(180deg,rgba(249,115,22,.16),rgba(28,20,10,.85));border-color:rgba(249,115,22,.4)}
.mcstrip.master::before{background:linear-gradient(90deg,var(--org),#ffb45a)}
.mctop{display:flex;gap:4px;width:100%;justify-content:center;min-height:34px}
.mcknob{display:flex;flex-direction:column;align-items:center;gap:2px;width:19px}
/* .mcknob input styling lives in the SLEEK CONTROLS block above (vertical mini-knob) */
.mcknob span{font-size:6.5px;font-weight:800;letter-spacing:.06em;color:var(--w40)}
.mcbtn{width:100%;font-size:8px;font-weight:900;letter-spacing:.08em;padding:4px 0;border-radius:5px;border:1px solid var(--line);
  background:rgba(255,255,255,.04);color:var(--w40);cursor:pointer;transition:all .12s}
.mcbtn:hover{background:rgba(255,255,255,.09)}
.mcbtn.on{background:linear-gradient(180deg,rgba(34,197,94,.32),rgba(34,197,94,.16));color:#8ef0b4;border-color:rgba(34,197,94,.5);box-shadow:0 0 10px rgba(34,197,94,.25)}
.mcpan{width:100%;padding:0 2px}
.mcpan input{width:100%;height:12px;accent-color:var(--blue);cursor:pointer}
.mcfaderrow{display:flex;gap:6px;align-items:stretch;height:154px;padding:4px 0;
  background:rgba(0,0,0,.32);border-radius:7px;border:1px solid var(--line-2);width:100%;justify-content:center}
.mcfader{display:flex;align-items:center;justify-content:center;width:26px}
/* sleek console fader — PreSonus Universal Control DNA, slimmer: a fine channel rail with a low, wide
   cap carrying a bright indicator band tinted by the channel color (a fleeting Plajah hint). */
.mcfader input{-webkit-appearance:none;appearance:none;height:150px;width:26px;background:transparent;cursor:pointer;writing-mode:vertical-lr;direction:rtl}
.mcfader input::-webkit-slider-runnable-track{width:3px;border-radius:2px;background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.14) 50%,rgba(255,255,255,.02));box-shadow:inset 0 0 3px rgba(0,0,0,.8)}
.mcfader input::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:12px;margin-left:-10.5px;border-radius:3px;
  background:linear-gradient(180deg,#43434e 0%,#26262e 42%,var(--tab,#9aa) 46%,var(--tab,#9aa) 54%,#1a1a20 58%,#2c2c34 100%);
  border:1px solid rgba(0,0,0,.65);box-shadow:0 2px 5px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.16)}
.mcfader input::-webkit-slider-thumb:hover{filter:brightness(1.2)}
.mcfader input::-moz-range-track{width:3px;border-radius:2px;background:rgba(255,255,255,.12)}
.mcfader input::-moz-range-thumb{width:24px;height:12px;border-radius:3px;background:linear-gradient(180deg,#43434e,#1a1a20);border:1px solid rgba(0,0,0,.6)}
.mcmeter{width:9px;height:150px;border-radius:3px;overflow:hidden;position:relative;
  background:linear-gradient(to top,#25c26a 0%,#25c26a 58%,#e6d84f 80%,#ff5252 100%);box-shadow:inset 0 0 3px rgba(0,0,0,.7)}
.mcmeter i{position:absolute;left:0;right:0;top:0;background:#111116;display:block}
.mcdb{font-size:8.5px;font-family:'JetBrains Mono',monospace;color:#d8d8e0;background:rgba(0,0,0,.4);border-radius:3px;padding:1px 5px;letter-spacing:.02em}
.mcbtns{display:flex;gap:4px}
.mcms{width:21px;height:19px;font-size:9px;font-weight:900;border-radius:5px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--w40);cursor:pointer;padding:0;transition:all .12s}
.mcms:hover{background:rgba(255,255,255,.1)}
.mcms.on.mute{background:linear-gradient(180deg,#ff6b6b,var(--red));color:#fff;border-color:var(--red);box-shadow:0 0 8px rgba(239,68,68,.4)}
.mcms.on.solo{background:linear-gradient(180deg,#ffe066,#ffcf33);color:#000;border-color:#ffcf33;box-shadow:0 0 8px rgba(255,207,51,.4)}
.mcms.on.learn{background:var(--pur);color:#fff;border-color:var(--pur);animation:bl 1s infinite;box-shadow:0 0 8px rgba(168,85,247,.5)}
.mcname{font-size:7.5px;font-weight:900;letter-spacing:.05em;color:#cfcfd8;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;text-transform:uppercase}
.mcgr{width:100%;height:5px;background:rgba(0,0,0,.5);border-radius:3px;overflow:hidden;border:1px solid var(--line-2)}
.mcgr i{display:block;height:100%;background:linear-gradient(90deg,#ffcf33,#ff5252)}
.fxrack{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
.fxunit{flex:1;min-width:200px;background:linear-gradient(180deg,rgba(40,40,50,.5),rgba(22,22,28,.6));border:1px solid var(--line);border-radius:10px;padding:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
.fxunit .insp-row input[type=range]{flex:1;accent-color:var(--pur)}
.rh{justify-content:center}
.phdot{width:6px;height:6px;border-radius:50%;background:var(--red);animation:bl 1.2s infinite}
.ruler-track{flex:1;position:relative;cursor:crosshair}
.tick{position:absolute;bottom:1px;font-family:'JetBrains Mono',monospace;font-size:7.5px;color:rgba(255,255,255,.25);
  border-left:1px solid rgba(255,255,255,.1);padding-left:3px;height:9px;line-height:9px}
.phline{position:absolute;top:0;bottom:0;width:1px;background:var(--red);box-shadow:0 0 8px rgba(239,68,68,.6);z-index:7;pointer-events:none}
.track{display:flex;height:50px;border-bottom:1px solid var(--line-2)}
.track.audio{height:66px}
.track.primary .trackbody{background:rgba(255,255,255,.025)}
.trackbody{flex:1;min-width:0;position:relative;isolation:isolate;z-index:0;background-image:linear-gradient(to right,var(--line-2) 1px,transparent 1px);background-size:46px 100%}
.clip{position:absolute;top:4px;bottom:4px;border-radius:6px;overflow:hidden;cursor:grab;user-select:none;contain:layout paint;
  display:flex;flex-direction:column;justify-content:center;padding:0 8px;border:1px solid}
.clip.script{background:linear-gradient(180deg,rgba(249,115,22,.34),rgba(249,115,22,.2));border-color:rgba(249,140,60,.7);border-style:dashed}
.clip.script.rdy{background:linear-gradient(180deg,rgba(249,115,22,.5),rgba(249,115,22,.3));border-style:solid}
.clip.media{background:linear-gradient(180deg,rgba(0,163,255,.42),rgba(0,120,200,.28));border-color:rgba(90,190,255,.7)}
.clip.voice{background:linear-gradient(180deg,rgba(34,197,94,.42),rgba(24,150,72,.28));border-color:rgba(80,220,130,.7)}
/* VIDEO clips wear the Plajah logo gradient — purple → magenta → orange */
.clip.vid,.clip.media.vid{background:linear-gradient(115deg,rgba(124,58,237,.55),rgba(224,69,155,.5) 52%,rgba(249,115,22,.5));
  border-color:rgba(240,150,200,.6);box-shadow:inset 0 1px 0 rgba(255,255,255,.14)}
/* SELECTED clip — the Chora "active track" animated purple→magenta→orange gradient sweep, so the
   active clip is instantly recognizable at a glance. (Keyframes track-gradient-sweep are global, index.css.) */
.clip.sel{box-shadow:0 0 0 1.5px #fff, 0 0 16px rgba(224,69,155,.55);z-index:5;border-color:rgba(255,255,255,.7);
  background-image:linear-gradient(90deg,rgba(124,58,237,.7) 0%,rgba(224,69,155,.6) 25%,rgba(249,115,22,.65) 50%,rgba(224,69,155,.6) 75%,rgba(124,58,237,.7) 100%);
  background-size:300% 100%;animation:track-gradient-sweep 6s ease-in-out infinite alternate}
@media (prefers-reduced-motion: reduce){ .clip.sel{animation:none;background-position:50% 50%} }
/* non-relinked / offline media — flagged RED in the pool + on the timeline */
.clip.nomedia{outline:2px solid var(--red);outline-offset:-2px}
.clip.nomedia::after{content:"⚠ NO MEDIA";position:absolute;top:2px;right:4px;font-size:7px;font-weight:900;letter-spacing:.06em;color:#ff9d9d;text-shadow:0 1px 2px rgba(0,0,0,.7);pointer-events:none}
.poolitem.offline{border-left:3px solid var(--red);background:rgba(239,68,68,.10)}
.poolitem.offline .poolname{color:#ff9d9d}
.poolitem.offline .pooltype{background:var(--red);color:#fff}
.ptcard.offline{outline:2px solid var(--red);outline-offset:-2px}
.ptcard.offline::after{content:"NO MEDIA";position:absolute;bottom:4px;left:4px;font-size:7px;font-weight:900;color:#fff;background:var(--red);padding:1px 4px;border-radius:3px;pointer-events:none}
.cliplabel{display:flex;align-items:center;gap:5px;font-size:9.5px;font-weight:800;letter-spacing:.04em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;position:relative;z-index:2}
.clipframe{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.45;z-index:1}
.wave{display:block;width:100%;height:100%}
.clipwave{position:absolute;left:0;right:0;bottom:0;top:0;pointer-events:none;z-index:0}
.clip.vid .wave,.clip.media .wave{--wave-peak:rgba(255,255,255,.22);--wave-rms:rgba(255,255,255,.55)}
.srcscrub .wave{height:100%}
.trimR{position:absolute;right:0;top:0;bottom:0;width:7px;cursor:ew-resize;background:rgba(255,255,255,.12);z-index:3}
.trimR:hover{background:rgba(255,255,255,.4)}
.trimL{position:absolute;left:0;top:0;bottom:0;width:7px;cursor:ew-resize;background:rgba(255,255,255,.12);z-index:3}
.trimL:hover{background:rgba(255,255,255,.4)}
.mk{position:absolute;top:0;width:10px;height:13px;transform:translateX(-5px);background:#FF8C00;clip-path:polygon(0 0,100% 0,50% 100%);cursor:pointer;z-index:4}
.mk:hover{filter:brightness(1.3)}
.inout{position:absolute;top:0;bottom:0;background:rgba(0,200,255,.16);border-left:1px solid #00c8ff;border-right:1px solid #00c8ff;z-index:2;pointer-events:none}

/* busy / toast / footer */
.busybar{position:fixed;bottom:44px;left:0;right:0;background:rgba(0,0,0,.85);backdrop-filter:blur(16px);
  border-top:2px solid var(--org);padding:9px 18px;font-size:11px;letter-spacing:.12em;font-weight:800;
  text-transform:uppercase;display:flex;align-items:center;gap:10px;z-index:60}
.blink{width:9px;height:9px;border-radius:50%;background:var(--red);animation:bl 1s infinite}
@keyframes bl{50%{opacity:.2}}
.toast{position:fixed;bottom:56px;left:50%;transform:translateX(-50%);background:var(--org);color:#000;
  font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;padding:9px 18px;border-radius:7px;z-index:70;
  box-shadow:0 10px 40px rgba(249,115,22,.35)}
/* ───── splash: the mark performs the philosophy ───── */
.splash{position:fixed;inset:0;background:#050505;z-index:200;display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:opacity .7s ease}
.splash.out{opacity:0;pointer-events:none}
.splash::before{content:'';position:absolute;width:46%;height:46%;border-radius:50%;background:var(--org);
  filter:blur(160px);opacity:0;animation:sp-glow 1.6s ease 2.6s forwards}
@keyframes sp-glow{to{opacity:.10}}
.sp-stage{display:flex;flex-direction:column;align-items:center;position:relative;z-index:1}
.sp-mark{width:clamp(120px,22vw,190px);height:auto;overflow:visible}
/* 1 — the world draws itself */
.sp-circle{stroke-dasharray:100;stroke-dashoffset:100;animation:sp-draw 1.1s cubic-bezier(.6,0,.2,1) .25s forwards}
/* 2 — the telling unspools as one strip */
.sp-strip{stroke-dasharray:100;stroke-dashoffset:100;
  animation:sp-draw .55s cubic-bezier(.4,0,.2,1) 1.45s forwards, sp-vanish .01s linear 2.35s forwards}
@keyframes sp-draw{to{stroke-dashoffset:0}}
@keyframes sp-vanish{to{opacity:0}}
/* 3 — the cut: clips snap apart */
.sp-clip1{opacity:0;animation:sp-appear .01s linear 2.35s forwards}
.sp-clip2{opacity:0;transform:translateX(-9px);
  animation:sp-appear .01s linear 2.35s forwards, sp-snap .42s cubic-bezier(.2,1.4,.4,1) 2.35s forwards}
@keyframes sp-appear{to{opacity:1}}
@keyframes sp-snap{to{transform:translateX(0)}}
/* 4 — wordmark, then the launch line fades in */
.sp-word{font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:-.045em;color:#fff;
  font-size:clamp(34px,6vw,56px);margin-top:18px;opacity:0;transform:translateY(10px);
  animation:sp-rise .7s cubic-bezier(.2,.8,.2,1) 2.9s forwards}
.sp-tag{font-size:clamp(10px,1.4vw,13px);font-weight:800;letter-spacing:.42em;color:var(--org);
  margin-top:14px;opacity:0;animation:sp-fadein 1s ease 3.6s forwards}
@keyframes sp-rise{to{opacity:1;transform:translateY(0)}}
@keyframes sp-fadein{to{opacity:1}}
@media (prefers-reduced-motion: reduce){
  .sp-circle,.sp-strip{animation-duration:.01s;animation-delay:0s}
  .sp-clip1,.sp-clip2,.sp-word,.sp-tag{animation-duration:.01s;animation-delay:.1s}
}

/* world categories */
.wcats{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.catcount{opacity:.55;font-weight:700;margin-left:4px}
.witem{display:flex;gap:14px;padding:14px}
.wthumb{width:86px;height:86px;flex:none;border-radius:9px;overflow:hidden;background:rgba(0,0,0,.5);
  border:1px solid var(--w08);display:flex;align-items:center;justify-content:center}
.wthumb img,.wthumb video{width:100%;height:100%;object-fit:cover}
.wext{font-size:13px;font-weight:900;letter-spacing:.1em;color:var(--w40)}
.wbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px}
.wrow1{display:flex;align-items:center;gap:10px}
.wname{flex:1;background:transparent;border:none;color:#fff;font-weight:800;font-size:14px;letter-spacing:.02em;min-width:80px}
.wname:focus{outline:none;border-bottom:1px solid var(--org)}
.wtags{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.wtag{font-size:9.5px;font-weight:800;letter-spacing:.06em;background:var(--org-dim);color:var(--org);
  padding:3px 9px;border-radius:99px;cursor:pointer}
.wtag:hover{background:rgba(239,68,68,.18);color:var(--red)}
.wtag-in{background:transparent;border:1px dashed var(--w08);border-radius:99px;color:#ccc;font-size:9.5px;
  padding:3px 9px;width:58px}
.wtag-in:focus{outline:none;border-color:var(--org)}

/* format panel */
.fmtpanel{position:absolute;top:30px;right:0;width:330px;border-radius:12px;padding:14px;z-index:50;box-shadow:0 24px 70px rgba(0,0,0,.7)}
.fmtgrid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.fmtbtn{display:flex;flex-direction:column;align-items:flex-start;gap:1px;background:rgba(255,255,255,.05);
  border:1px solid var(--w08);border-radius:7px;padding:7px 9px;cursor:pointer;color:#ddd}
.fmtbtn b{font-size:10px;font-weight:900;letter-spacing:.08em}
.fmtbtn span{font-size:8.5px;color:var(--w40)}
.fmtbtn.on{background:var(--org);color:#000;border-color:var(--org)}
.fmtbtn.on span{color:rgba(0,0,0,.6)}
.fmtbtn.sm{padding:5px 8px;align-items:center}
.fmtbtn:disabled{opacity:.4;cursor:default}
.fmtfps{display:flex;gap:4px;flex-wrap:wrap}
.dfrow{display:flex;align-items:center;gap:8px;font-size:9px;font-weight:800;letter-spacing:.1em;color:#ccc;margin-top:10px;cursor:pointer}
.dfrow.off{opacity:.4}
.dfrow input{accent-color:#f97316}

/* multicam */
.mcchk{accent-color:#a855f7;width:12px;height:12px;flex:none}
.pooltype.multicam{color:#a855f7}
.clip.multicam{background:rgba(168,85,247,.16);border-color:rgba(168,85,247,.5)}
.anglegrid{position:absolute;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);display:grid;
  grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;padding:14px;z-index:10}
.angletile{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;gap:3px;
  background:rgba(255,255,255,.06);border:1px solid var(--w08);border-radius:9px;padding:12px;cursor:pointer;color:#eee;min-height:84px}
.angletile.on{border-color:#a855f7;box-shadow:0 0 16px rgba(168,85,247,.4)}
.anglenum{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:20px;color:#a855f7}
.anglename{font-size:10px;font-weight:700;letter-spacing:.04em;text-align:left;word-break:break-all}
.anglelive{font-size:8px;letter-spacing:.2em;color:var(--red);font-weight:900}
.mcrow{display:flex;align-items:center;gap:6px}
.mcangle{width:24px;height:24px;flex:none;border-radius:6px;background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.4);
  color:#a855f7;font-weight:900;font-size:11px;cursor:pointer}
.mcangle.on{background:#a855f7;color:#000}
.mcoff{width:58px;flex:none}
.mctc{width:86px;flex:none;font-family:'JetBrains Mono',monospace;font-size:10px}

/* character media */
.cmedia{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:6px}
.cmcard{background:rgba(0,0,0,.4);border:1px solid var(--w08);border-radius:9px;padding:7px}
.cmcard.locked{border-color:rgba(0,163,255,.5)}
.cmcard.rejected{border-color:rgba(239,68,68,.5);opacity:.75}
.cmthumb{position:relative;height:92px;border-radius:6px;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center;margin-bottom:5px}
.cmthumb img,.cmthumb video{width:100%;height:100%;object-fit:cover}
.vbadge{position:absolute;top:4px;right:4px;font-size:7.5px;font-weight:900;letter-spacing:.08em;padding:2px 6px;border-radius:4px}
.vbadge.ok{background:var(--green);color:#000}
.vbadge.bad{background:var(--red);color:#fff}
.sel.xs{padding:4px 6px;font-size:9.5px}
.cmadd{align-self:start;height:38px}

/* design briefs */
.briefrow{border-top:1px solid var(--w04);padding:9px 0}
.briefhead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.briefhead strong{font-size:12.5px;letter-spacing:.04em}
.safety{font-size:10px;font-weight:800;color:var(--red);letter-spacing:.08em;margin-top:4px}
.briefdoc{font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.55;white-space:pre-wrap;
  background:rgba(0,0,0,.4);border-left:3px solid var(--org);padding:10px 12px;border-radius:0 7px 7px 0;margin:8px 0 0;color:#ddd}

/* look gallery + palette */
.lookgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.lookcard{display:flex;flex-direction:column;align-items:flex-start;gap:5px;background:rgba(0,0,0,.4);
  border:1px solid var(--w08);border-radius:10px;padding:10px;cursor:pointer;color:#ddd;text-align:left}
.lookcard.on{border-color:var(--org);box-shadow:0 0 16px rgba(249,115,22,.35)}
.lookcard b{font-size:10px;font-weight:900;letter-spacing:.12em}
.lookcard span{font-size:9px;color:var(--w40);line-height:1.4}
.lookswatch{display:flex;width:100%;height:22px;border-radius:5px;overflow:hidden}
.lookswatch i{flex:1}
.palrow{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.palpick{width:38px;height:30px;border:none;background:none;cursor:pointer;padding:0}

/* 3D stage */
.stage3d{width:100%;height:380px;border-radius:10px;overflow:hidden;border:1px solid var(--w08);cursor:grab}
.stage3d:active{cursor:grabbing}

/* fx panel */
.fxrow{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.fxtext{display:flex;flex-direction:column;gap:4px;margin:4px 0 7px;padding:6px;border-radius:6px;border:1px solid var(--w08);background:rgba(255,255,255,.02)}
.fxtext textarea{width:100%;resize:vertical;min-height:34px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;line-height:1.4}
.fxtext input[type=color]{width:26px;height:20px;padding:0;border:none;background:none;cursor:pointer}
.fxtext input[type=number]{width:64px}
.fxrow.tiny{font-size:10px;margin-bottom:0}
.fxrow.dim{opacity:.55}
.fxcost{font-size:9px;letter-spacing:.5px;padding:1px 4px;border-radius:3px;white-space:nowrap;flex:none}
.fxcost.moderate{background:rgba(249,115,22,.16);color:#f9a56b;border:1px solid rgba(249,115,22,.32)}
.fxcost.heavy{background:rgba(239,68,68,.16);color:#f78d8d;border:1px solid rgba(239,68,68,.36)}
.fxrow.wrap{flex-wrap:wrap}
.fxbuilt,.fxbuilder{display:flex;flex-direction:column;gap:3px;margin:5px 0 7px;padding:6px;border-radius:6px;border:1px solid var(--w08);background:rgba(255,255,255,.02)}
.fxbuilder{border-color:rgba(249,115,22,.35)}
.fxbuilt .minibtn.blue,.fxbuilder .minibtn.blue{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.inp.grow{flex:1;min-width:0}
.fxlbl{font-size:8px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--w40);width:56px;flex:none}
.fxrow input[type=range]{flex:1;accent-color:#f97316;min-width:0}
.fxval{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;font-size:9.5px;font-weight:700;color:#ccc;width:34px;text-align:right}
/* keyframe diamond — the studio-wide "animated" colour is purple (--pur) */
.kfdiamond{width:13px;height:13px;flex:none;border:none;background:none;cursor:pointer;color:var(--w25);
  font-size:9px;line-height:1;display:grid;place-items:center;padding:0}
.kfdiamond:hover{color:#fff}
.kfdiamond.anim{color:rgba(168,85,247,.7)}
.kfdiamond.on{color:var(--pur);text-shadow:0 0 6px rgba(168,85,247,.7)}
.kfnav{gap:5px;margin-top:5px;border-top:1px solid var(--line-2);padding-top:6px}
.kfnav button{background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.3);color:#d6b3ff;
  font-size:8px;font-weight:900;letter-spacing:.08em;border-radius:4px;padding:3px 6px;cursor:pointer}
.kfnav button:disabled{opacity:.35;cursor:default}
.kfchips{flex:1;display:flex;gap:3px;flex-wrap:wrap;min-width:0}
/* transition wedge — a real transition object on the incoming clip's left edge */
.transwedge{position:absolute;left:0;top:0;bottom:0;z-index:6;cursor:ew-resize;display:grid;place-items:center;
  border-right:1px solid rgba(255,255,255,.5);
  background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.34));
  clip-path:polygon(0 0,100% 0,100% 100%,0 100%,55% 50%)}
.transwedge.dip{background:linear-gradient(90deg,rgba(0,0,0,.7),rgba(0,0,0,.15))}
.transwedge.wipe{background:linear-gradient(90deg,rgba(0,163,255,.4),rgba(0,163,255,.1))}
.transwedge.blur{background:linear-gradient(90deg,rgba(168,85,247,.4),rgba(168,85,247,.1))}
.transwedge span{font-size:8px;font-weight:900;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none}
/* keyframe LANE under the selected clip's track (Mockup C) */
.kflane{display:flex;background:rgba(168,85,247,.05);border-bottom:1px solid var(--line-2, rgba(255,255,255,.08))}
.kflhead{width:128px;min-width:128px;max-width:128px;border-right:1px solid var(--line, rgba(255,255,255,.13));
  padding:5px 8px;display:flex;flex-direction:column;gap:3px;position:sticky;left:0;background:#16161c;z-index:10}
.kflbody{flex:1;position:relative;padding:3px 0}
.kflrow{height:16px;position:relative}
.kflrow em{position:absolute;left:6px;top:2px;font-style:normal;font-size:6.5px;font-weight:900;
  letter-spacing:.12em;color:rgba(168,85,247,.85);z-index:2;pointer-events:none}
.kflline{position:absolute;top:8px;height:1px;background:rgba(168,85,247,.28)}
.kfldia{position:absolute;top:3px;width:9px;height:9px;background:var(--pur,#a855f7);transform:rotate(45deg);
  border-radius:1.5px;border:1px solid rgba(0,0,0,.55);cursor:ew-resize;z-index:3;text-decoration:none}
.kfldia:hover{background:#fff;box-shadow:0 0 8px rgba(168,85,247,.8)}
.gennote{background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.35);border-radius:8px;padding:8px;margin-top:6px;display:flex;flex-direction:column;gap:5px;align-items:flex-start}

/* dual canvas — source + program viewers */
.panel-divider{width:8px;flex:0 0 8px;cursor:col-resize;touch-action:none;background:rgba(255,255,255,.06);border-radius:4px;min-height:0}.panel-divider:hover,.panel-divider:focus{background:var(--org)}.panel-divider.horizontal{width:auto;height:8px;cursor:row-resize}.resizable-fx{flex:none;min-width:150px;display:flex;overflow:hidden}.resizable-fx .fxlib{width:100%;min-width:0;box-sizing:border-box}.nglib,.ngright,.gpanel{resize:both;overflow:auto}.cgallery,.cgradetl{resize:vertical;overflow:auto;min-height:60px}
.dualview{flex:1;display:grid;grid-template-columns:1fr 1.2fr;gap:8px;min-width:0;min-height:0}
.viewer{display:flex;flex-direction:column;border:1px solid var(--w08);border-radius:10px;overflow:hidden;
  background:rgba(0,0,0,.35);backdrop-filter:blur(12px);position:relative;min-height:0}
.viewer-tag{position:absolute;top:8px;left:8px;z-index:8;font-family:'JetBrains Mono',monospace;font-size:9px;
  letter-spacing:.04em;background:rgba(0,0,0,.65);border:1px solid var(--w08);color:var(--w40);
  padding:3px 8px;border-radius:5px;text-transform:uppercase;max-width:75%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.viewer-tag.prog{color:var(--org);border-color:rgba(249,115,22,.3)}
.viewer-body{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;
  background:radial-gradient(circle at center,#161616,#000)}
.mvid.framed{max-width:92%;max-height:88%;width:auto;height:auto;border:1px solid var(--w08);box-shadow:0 14px 50px rgba(0,0,0,.7)}
.srcaudio{display:flex;flex-direction:column;align-items:center;gap:12px;color:rgba(34,197,94,.5)}
.srcaudio span{font-size:9px;font-weight:900;letter-spacing:.3em}
.src-empty{width:70%;aspect-ratio:16/9;background:rgba(0,0,0,.4);border:1px solid var(--w08);
  display:flex;align-items:center;justify-content:center;color:#222;box-shadow:0 14px 50px rgba(0,0,0,.6)}
.viewer-bar{height:38px;background:rgba(0,0,0,.55);border-top:1px solid var(--w08);display:flex;
  align-items:center;justify-content:space-between;padding:0 10px;gap:8px}
.tc.sm{font-size:11px}
.tbtn.sm{width:27px;height:27px}
.poolitem.previewing,.mwcard.previewing{background:var(--org-dim);border-color:rgba(249,115,22,.4)}
.monitor .viewer-tag.prog{position:absolute}
.vt-surface{position:absolute;inset:0;width:100%;height:100%;z-index:40;overflow:visible}
.vt-handle{cursor:grab}.vt-handle:active{cursor:grabbing}
.overlay-slug{left:auto;right:8px}

/* media workspace */
.mediaws{flex:1;display:flex;border-radius:12px;overflow:hidden;min-height:0}
.mwside{width:210px;border-right:1px solid var(--w08);padding:12px;display:flex;flex-direction:column;overflow-y:auto}
/* MEDIA ROOM (Mockup-D) */
.mwmain{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0}
.mwinsp{width:244px;flex:none;border-left:1px solid var(--w08);padding:11px;display:flex;flex-direction:column;gap:8px;overflow-y:auto}
.mwipreview{width:100%;aspect-ratio:16/10;border-radius:8px;overflow:hidden;border:1px solid var(--line-2);
  background:#0c0c11;display:flex;align-items:center;justify-content:center;position:relative}
.mwipreview img{width:100%;height:100%;object-fit:cover}
.isec{display:flex;align-items:center;gap:6px}
/* SLATE shots step — coverage with the script + bible docked as a sticky reference rail (Mockup-D) */
.slateshots{display:flex;gap:14px;align-items:flex-start}
.slateref{width:280px;flex:none;position:sticky;top:0;max-height:calc(100vh - 180px);overflow-y:auto;
  display:flex;flex-direction:column;gap:6px;padding:12px 12px 12px 15px}
.slateref .script-ref{font-family:'JetBrains Mono',monospace;font-size:10px;line-height:1.6;color:rgba(255,255,255,.62);
  white-space:pre-wrap;max-height:240px;overflow-y:auto;border:1px solid var(--line-2);border-radius:7px;padding:8px;background:rgba(0,0,0,.28)}
.slatemain{flex:1;min-width:0;display:flex;flex-direction:column}
.binbtn{position:relative;display:flex;justify-content:space-between;align-items:center;background:none;border:none;color:var(--w40);
  font-size:10px;font-weight:900;letter-spacing:.12em;padding:7px 9px 7px 13px;border-radius:6px;cursor:pointer;text-align:left}
.binbtn::before{content:"";position:absolute;left:3px;top:6px;bottom:6px;width:3px;border-radius:2px;
  background:var(--tab,currentColor);opacity:0;transition:opacity .12s}
.binbtn:hover::before,.binbtn.on::before{opacity:.85}
.binbtn:hover{color:#fff;background:var(--w04)}
.binbtn.on{background:var(--org);color:#000}
.bintree{opacity:.4;margin-right:4px;font-weight:400}
.linkbtn{background:none;border:none;color:var(--org);font-weight:800;cursor:pointer;padding:0;font-size:inherit;text-decoration:underline}
.synctoggle{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#cfcbdb;cursor:pointer;user-select:none}
.synctoggle input{accent-color:var(--org);width:14px;height:14px}
.mediasearch{display:flex;align-items:center;gap:6px;background:rgba(0,0,0,.32);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 9px;margin-bottom:9px;color:var(--w40)}
.mediasearch input{flex:1;background:none;border:none;outline:none;color:#fff;font-size:12px;font-family:inherit;min-width:0}
.mediasearch.wide{margin-bottom:11px}
.binrow{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}
.binchip{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:var(--w40);font-size:11px;font-weight:800;letter-spacing:.05em;padding:5px 10px;border-radius:999px;cursor:pointer}
.binchip.on{background:var(--org);color:#000;border-color:transparent}
.tagrow{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.tagchip{background:rgba(124,58,237,.14);border:1px solid rgba(124,58,237,.32);color:#c4b3f0;font-size:11px;padding:4px 9px;border-radius:999px;cursor:pointer}
.tagchip.on{background:linear-gradient(120deg,#7c3aed,#e0459b);color:#fff;border-color:transparent}
.magrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(144px,1fr));gap:12px;margin-top:10px}
.mabrowse{display:grid;grid-template-columns:250px minmax(0,1fr);gap:14px;align-items:start}
.mabrowse.haspreview{grid-template-columns:250px minmax(0,1fr) clamp(320px,26vw,440px)}
@media(max-width:1100px){.mabrowse.haspreview{grid-template-columns:250px minmax(0,1fr)}}
@media(max-width:720px){.mabrowse,.mabrowse.haspreview{grid-template-columns:1fr}}
.matree{max-height:66vh;overflow-y:auto}
.matreerow{width:100%;display:flex;align-items:center;gap:7px;background:none;border:none;color:var(--w40);font-size:13px;padding:7px 8px;border-radius:6px;cursor:pointer;text-align:left}
.matreerow:hover{color:#fff;background:var(--w04)}
.matreerow.on{background:rgba(249,115,22,.16);color:#ffb057}
.matreetoggle{width:13px;display:inline-flex;justify-content:center;color:var(--w40);font-size:10px}
.matreespace{width:13px;display:inline-block}
.matreelabel{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.matreecount{font-size:10.5px;color:var(--w40);font-variant-numeric:tabular-nums}
.magridwrap{min-width:0}
.mapaghead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.mapager{display:flex;align-items:center;gap:8px}
.pagebtn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:#ddd;cursor:pointer}
.pagebtn:hover:not(:disabled){background:rgba(255,255,255,.1);color:#fff}
.pagebtn:disabled{opacity:.35;cursor:default}
.mapager .gp-sel{background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.14);color:#eee;border-radius:7px;padding:5px 8px;font-size:11px}
.macard.sel{outline:2px solid rgba(224,69,155,.7);outline-offset:-2px}
.manoteflag{position:absolute;top:3px;left:3px;font-size:9px;color:#ffd27f;background:rgba(0,0,0,.5);border-radius:4px;padding:0 3px}
.mapreview{margin:0;align-self:start;position:sticky;top:8px;max-height:calc(100vh - 30px);overflow-y:auto}
.mapvhead{display:flex;align-items:center;justify-content:space-between}
/* In the right-hand preview column the media + meta stack vertically; when the preview wraps below the
   grid (narrow screens) it goes back to side-by-side so it isn't a tall strip. */
.mapvbody{display:block;margin-top:8px}
.mapvbody>.mapvmeta{margin-top:12px}
@media(max-width:1100px){.mapvbody{display:grid;grid-template-columns:minmax(220px,1fr) 1fr;gap:14px}.mapvbody>.mapvmeta{margin-top:0}}
@media(max-width:720px){.mapvbody{grid-template-columns:1fr}}
.mapvmedia{background:#000;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:150px}
.mapvplayer{width:100%;max-height:340px;object-fit:contain;display:block}
.mapvaudio{display:flex;flex-direction:column;align-items:center;gap:10px;padding:20px;width:100%}
.mapvaudioel{width:100%}
.mapvoffline{color:var(--red);font-size:12px;padding:24px;text-align:center}
.mapvmeta{min-width:0}
.mapvname{font-weight:800;color:#fff;font-size:16px;margin-bottom:3px;word-break:break-word}
.mapvnotes{width:100%;box-sizing:border-box;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#fff;padding:9px 11px;font-size:13px;resize:vertical;font-family:inherit}
.mapvnotes:focus{outline:none;border-color:rgba(224,69,155,.5)}
.mapvadd{display:flex;gap:8px;align-items:center}
.mapvadd .gp-sel{background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.14);color:#eee;border-radius:8px;padding:8px 10px;font-size:12px}
.macard{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:7px;cursor:pointer;transition:border-color .15s}
.macard:hover{border-color:rgba(224,69,155,.5)}
.macard.offline{outline:1px solid rgba(251,113,133,.5);outline-offset:-1px}
.mathumb{position:relative;height:84px;border-radius:6px;overflow:hidden;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center}
.mathumb .poolthumb{width:100%;height:100%;object-fit:cover}
.maname{font-size:12px;color:#e6e2f0;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.matags{display:flex;flex-wrap:wrap;gap:3px;margin-top:4px}
.matag{display:inline-flex;align-items:center;gap:2px;font-size:9.5px;font-weight:700;letter-spacing:.03em;color:var(--w40);background:rgba(255,255,255,.06);border-radius:4px;padding:2px 5px;text-transform:uppercase}
.matag.cast{color:#7ee2a8;background:rgba(52,211,153,.12)}
.watchrow{display:flex;align-items:center;gap:9px;padding:7px 2px;border-bottom:1px solid rgba(255,255,255,.06)}
.watchrow:last-child{border-bottom:none}
.watchmeta{flex:1;display:flex;flex-direction:column;min-width:0}
.watchmeta strong{color:#fff;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.watchnav{background:none;border:none;text-align:left;cursor:pointer;padding:0}
.watchnav:hover strong{color:var(--org)}
.mwgrid{flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:14px;
  overflow-y:auto;align-content:start}
.mwcard{background:rgba(0,0,0,.4);border:1px solid var(--w08);border-radius:9px;padding:7px;cursor:pointer}
.mwcard:hover{border-color:rgba(249,115,22,.5)}
.mwthumb{position:relative;height:80px;border-radius:6px;overflow:hidden;background:#000;display:flex;
  align-items:center;justify-content:center;margin-bottom:5px}
.mwthumb img,.mwthumb video{width:100%;height:100%;object-fit:cover}
.mwchk{position:absolute;top:5px;left:5px}
.lookcard.mini{padding:6px;gap:3px}
.lookcard.mini b{font-size:8px}
.colorlooks{display:grid;grid-template-columns:1fr 1fr;gap:6px}
/* COLOR ROOM — monitor-dominant, banded (Mockup-A) */
.colorroom{flex:1;display:flex;flex-direction:column;gap:8px;min-height:0}
.colorstage{flex:1;display:flex;gap:8px;min-height:0}
.colormon{flex:1;min-width:0;display:flex;flex-direction:column}
.colormon .monitor{flex:1}
.colorscopes{width:300px;min-width:260px;flex:none;border-radius:12px;padding:10px;overflow-y:auto;
  display:flex;flex-direction:column;gap:6px}
.colorctrl{flex:none;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;max-height:288px}
.colortabs{height:34px;flex:none;display:flex;align-items:center;gap:8px;padding:0 11px;
  border-bottom:1px solid var(--line);background:rgba(0,0,0,.24)}
.colorbody{flex:1;padding:12px 14px;overflow-y:auto;min-height:0}
/* grade layers (H2) — base + secondaries strip in the color tab bar */
.gradelayers{display:flex;align-items:center;gap:3px}
.glchip{min-width:20px;height:20px;padding:0 6px;border-radius:5px;border:1px solid rgba(168,85,247,.35);
  background:rgba(168,85,247,.12);color:#d6b3ff;font-size:8.5px;font-weight:900;letter-spacing:.06em;cursor:pointer}
.glchip.on{background:var(--pur);border-color:var(--pur);color:#fff}
.glchip.off{opacity:.4;text-decoration:line-through}
.glchip.add{color:var(--green);border-color:rgba(120,220,150,.4);background:rgba(120,220,150,.1)}
.glchip.del{color:#ff9a9a;border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.1)}
.colorlooks.wide{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.gradepanels{display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start}
.gpanel{flex:1;min-width:220px}
.gpanel.narrow{flex:0 0 220px}
.colorempty{margin-top:10px;max-width:56ch;line-height:1.6}
/* Mockup-A color surfaces */
.cgallery{flex:none;border-radius:12px;padding:7px 10px;display:flex;align-items:center;gap:9px;min-height:66px}
.cgal-strip{display:flex;gap:6px;overflow-x:auto;flex:1;min-width:0}
.cstill{flex:none;width:82px;cursor:pointer;border:1px solid var(--w08);border-radius:6px;overflow:hidden;position:relative;background:#000}
.cstill img{width:100%;height:40px;object-fit:cover;display:block}
.cstill span{display:block;font-size:6.5px;font-weight:900;letter-spacing:.06em;color:#ccc;padding:2px 4px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cstill.on{border-color:var(--org);box-shadow:0 0 0 1px var(--org)}
.wipebar{position:absolute;top:0;bottom:0;width:3px;background:#fff;box-shadow:0 0 8px rgba(0,0,0,.9);cursor:ew-resize;z-index:5}
.wipebar::after{content:"◂ ▸";position:absolute;top:calc(50% - 8px);left:-14px;font-size:9px;color:#fff;text-shadow:0 1px 3px #000;white-space:nowrap}
.wipetag{position:absolute;top:6px;font-size:6.5px;font-weight:900;letter-spacing:.14em;padding:2px 6px;border-radius:4px;
  background:rgba(0,0,0,.65);color:#ddd;z-index:4;pointer-events:none}
.wipetag.a{left:6px}.wipetag.b{right:6px}
.graderail{width:172px;min-width:150px;flex:none;border-radius:12px;padding:9px;display:flex;flex-direction:column;gap:7px;overflow-y:auto}
.glayer{border:1px solid var(--w08);border-radius:8px;padding:7px 8px;cursor:pointer;background:rgba(0,0,0,.3);display:flex;flex-direction:column;gap:5px}
.glayer.on{border-color:var(--org);box-shadow:0 0 0 1px var(--org)}
.glayer.off{opacity:.45}
.gl-top{display:flex;align-items:center;gap:5px}
.gl-name{flex:1;font-size:9.5px;font-weight:800;color:#eee;letter-spacing:.03em}
.gl-eye{background:none;border:none;color:var(--w40);cursor:pointer;font-size:11px;padding:0 2px}
.gl-eye:hover{color:#fff}
.gl-meta{display:flex;gap:3px;flex-wrap:wrap}
.cgradetl{flex:none;border-radius:12px;padding:7px 10px;display:flex;align-items:center;gap:8px;min-height:56px}
.cgradeclips{display:flex;gap:3px;overflow-x:auto;flex:1;min-width:0;align-items:stretch}
.cgclip{flex:none;height:34px;border-radius:5px;border:1px solid var(--w08);background:rgba(0,0,0,.4);cursor:pointer;
  position:relative;overflow:hidden;display:flex;align-items:flex-end}
.cgclip u{position:absolute;left:0;right:0;top:0;height:3px;text-decoration:none}
.cgclip b{font-size:6.5px;font-weight:900;letter-spacing:.04em;color:#bbb;padding:2px 4px;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.cgclip.sel{border-color:var(--org);box-shadow:0 0 0 1px var(--org)}
.cgclip:hover b{color:#fff}
/* AUDIO ROOM (Mockup-D) */
.audioroom{flex:1;display:flex;flex-direction:column;gap:8px;min-height:0}
.audiostage{flex:1;display:flex;gap:8px;min-height:0}
.audiolanes{flex:1;min-width:0;border-radius:12px;padding:8px;overflow:auto}
.audioref{width:284px;min-width:240px;flex:none;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px}
.audioctrl{flex:none;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;max-height:300px}
.audiotabs{height:34px;flex:none;display:flex;align-items:center;gap:8px;padding:0 11px;
  border-bottom:1px solid var(--line);background:rgba(0,0,0,.24)}
.audiobody{flex:1;padding:12px 14px;overflow-y:auto;min-height:0}
/* DELIVER ROOM (Mockup-D) */
.deliverroom{flex:1;display:flex;flex-direction:column;gap:8px;min-height:0}
.deliverstage{flex:1;display:flex;gap:8px;min-height:0}
.deliverpanel{border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:9px;overflow-y:auto}
.pset{border:1px solid var(--line-2);border-radius:9px;padding:8px 9px;background:rgba(0,0,0,.3);
  display:flex;flex-direction:column;gap:3px}
.qsub{font-size:9px;color:var(--w40)}
.qrow{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 11px;border:1px solid var(--line-2);
  border-radius:8px;background:rgba(0,0,0,.3)}
.qname{font-size:9.5px;font-weight:800;color:#eee;letter-spacing:.02em}
.dtable{display:flex;flex-direction:column;gap:5px}
.dtable>div{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dtable .numval{font-size:11px;color:#ddd}
.deliverctrl{flex:none;border-radius:12px;display:flex;align-items:center;gap:10px;padding:0 12px;height:46px}
.dbar{flex:1;max-width:340px;height:6px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden}
.dbar span{display:block;height:100%;background:linear-gradient(90deg,var(--org),#ffb347);transition:width .2s}
.minibtn.danger{color:#ff9a9a;border-color:rgba(239,68,68,.4)}
/* VFX ROOM */
.vfxroom{flex:1;display:flex;flex-direction:column;gap:8px;min-height:0}
.vfxstage{flex:none;height:280px;min-height:0}
.vfxctrl{flex:1;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;min-height:0}
.vfxtabs{height:34px;flex:none;display:flex;align-items:center;gap:8px;padding:0 11px;
  border-bottom:1px solid var(--line);background:rgba(0,0,0,.24)}
.vfxbody{flex:1;padding:12px 14px;overflow-y:auto;min-height:0}
/* NODE GRAPH EDITOR — Comp Room mockup layout: library | canvas | viewer+inspector */
.ngeditor{display:flex;flex-direction:column;gap:8px;height:100%;min-height:420px}
.ngbody{flex:1;display:flex;gap:8px;min-height:0}
.nglib{width:150px;flex:none;border-radius:10px;padding:9px;display:flex;flex-direction:column;gap:6px;min-height:0}
.nglibscroll{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:9px}
.nglibgrp{display:flex;flex-direction:column;gap:2px}
.nglibitem{display:flex;align-items:center;gap:7px;padding:4px 6px;border-radius:6px;font-size:9.5px;font-weight:700;
  color:#ccc;background:none;border:1px solid transparent;cursor:pointer;text-align:left;font-family:inherit}
.nglibitem:hover{background:var(--w04);border-color:var(--w08);color:#fff}
.nglibitem i{width:15px;height:15px;border-radius:4px;font-style:normal;font-size:8px;font-weight:900;color:#0b0b0e;
  display:grid;place-items:center;flex:none}
.ngcanvas{flex:1;position:relative;min-width:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;
  background:radial-gradient(circle at 50% 40%,rgba(124,58,237,.08),transparent 60%),rgba(0,0,0,.34);
  background-image:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px);background-size:20px 20px}
.ngwires{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}
.ngtools{position:absolute;top:8px;left:10px;z-index:4}
.ngzoom{position:absolute;bottom:8px;right:10px;z-index:4;display:flex;gap:6px;align-items:center}
.ngnode{position:absolute;z-index:2;border-radius:8px;cursor:grab;user-select:none;overflow:visible;
  background:linear-gradient(180deg,rgba(40,40,52,.96),rgba(24,24,32,.98));border:1px solid var(--line-hi);
  box-shadow:0 3px 10px rgba(0,0,0,.5)}
.ngnode::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;border-radius:8px 8px 0 0;background:var(--tab,var(--org))}
.ngnode.sel{border-color:var(--org);box-shadow:0 0 0 1px var(--org),0 3px 14px rgba(249,115,22,.3)}
.ngtitle{display:flex;align-items:center;gap:5px;font-size:9px;font-weight:900;letter-spacing:.06em;color:#eee;padding:7px 8px 3px}
.ngico{width:14px;height:14px;border-radius:4px;font-style:normal;font-size:8px;font-weight:900;color:#0b0b0e;
  display:grid;place-items:center;flex:none}
.ngtitle span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ngbadge{font-size:6.5px;font-weight:900;padding:1px 4px;border-radius:3px;background:var(--org);color:#0b0b0e}
.ngfoot{font-size:6.5px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--w25);padding:0 8px 6px}
.ngport{position:absolute;width:11px;height:11px;border-radius:50%;border:1px solid rgba(0,0,0,.6);cursor:pointer;z-index:3}
.ngport.out{right:-6px;top:calc(50% - 5px);background:radial-gradient(circle at 40% 35%,#ffd0a0,#f97316)}
.ngport.out.armed{box-shadow:0 0 0 3px rgba(249,115,22,.4)}
.ngport.in{left:-6px;top:calc(50% - 5px);background:radial-gradient(circle at 40% 35%,#cbb3ff,#7c3aed)}
.ngport.in.a{top:calc(35% - 5px)} .ngport.in.b{top:calc(65% - 5px)}
.ngright{width:250px;flex:none;display:flex;flex-direction:column;gap:8px;min-height:0}
.ngviewer{border-radius:10px;overflow:hidden;flex:none}
.ngpreview{aspect-ratio:16/9;background:#000;flex:1;min-height:0;overflow:hidden}
.ngpreview>*{width:100%;height:100%}
.ngviewbar{display:flex;align-items:center;gap:6px;padding:6px 9px;border-top:1px solid var(--line-2)}
.nginsp{flex:1;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:7px;overflow-y:auto;min-height:0}
.raildiv{width:1px;height:20px;background:var(--w08);margin:0 6px;align-self:center}
.raildot.ws{padding:6px 8px}

/* engines */
.engrow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;border-top:1px solid var(--w04);padding:9px 0}

.ftr{height:42px;border-top:1px solid;display:flex;align-items:center;justify-content:space-between;padding:0 16px;z-index:30;position:relative}
.ftr-left,.ftr-right{display:flex;gap:14px;font-size:9px;letter-spacing:.16em;color:var(--w40);font-weight:800;align-items:center}
.ready{color:var(--org)}
.rail{display:flex;gap:4px}
.raildot{display:flex;align-items:center;gap:7px;background:none;border:none;color:rgba(255,255,255,.35);
  padding:6px 13px;border-radius:7px;cursor:pointer;transition:all .25s}
.raildot:hover{color:#fff}
.raildot.on{background:var(--org);color:#000;box-shadow:0 0 18px rgba(249,115,22,.45)}
.raillab{font-size:9px;font-weight:900;letter-spacing:.18em}
@media(max-width:900px){.raillab{display:none}.pool{width:170px}.inspector{width:210px}}
`;
