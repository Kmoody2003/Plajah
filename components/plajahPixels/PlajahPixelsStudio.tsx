import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Play, Pause, Upload, Volume2, VolumeX, Disc, Square,
    Settings, Sliders, Sparkles, Music, Cpu, Layers, Type,
    Video, Image, Trash2, X, Plus, Wand2, RefreshCw, Layers2, Captions, Radio,
    Save, FolderOpen, CheckCircle, Grid3x3, Piano, Gauge, Activity, Box,
    Monitor, Maximize2, EyeOff, Eye, Circle, Tv, ArrowRight,
    Download, Send, Loader2, SkipBack, SkipForward,
} from 'lucide-react';
import { uploadVideo, createVideoPlaylist, auth } from '../../services/backendService';
import AudioVisualizer from './components/AudioVisualizer';
import StudioStage from './components/StudioStage';
import SceneRail from './components/SceneRail';
import ClipGrid from './components/ClipGrid';
import ClipLauncher from './components/ClipLauncher';
import LayerStack from './components/LayerStack';
import type { LauncherLayer } from './components/ClipLauncher';
import ButterchurnLayer from './components/ButterchurnLayer';
import ShaderLayer from './components/ShaderLayer';
import PostProcessLayer from './components/PostProcessLayer';
import ShaderPanel, { SHADER_LIBRARY } from './components/ShaderPanel';
import MidiNotesScene from './components/MidiNotesScene';
import ThreeScene, { Three3DConfig, Three3DVariant, Three3DCamera } from './components/ThreeScene';
import { LottieLayer, HtmlLayer, FpsMeter, LayersPanel, OverlayState } from './components/ExtraLayers';
import TimelineStrip from './components/TimelineStrip';
import MatteLayer, { MatteSettings } from './components/MatteLayer';
import MattePanel from './components/MattePanel';
import { MatteEngine } from './engine/matting/matteEngine';
import { MidiController, MidiStatusHud } from './components/MidiController';
import Controls from './components/Controls';
import DraggablePanel from './components/DraggablePanel';
import ThemeGenerator from './components/ThemeGenerator';
import GlobalLighting from './components/GlobalLighting';
import SegmentationLayer from './components/SegmentationLayer';
import TextOverlay, { TEXT_FONTS, ensureFontLoaded } from './components/TextOverlay';
import ProgramOutView from './components/ProgramOutView';
import MediaPreloader from './components/MediaPreloader';
import CaptionsOverlay from './components/CaptionsOverlay';
import ColorPaletteEditor from './components/ColorPaletteEditor';
import { VisualizationConfig, VisualizerMode, AudioState, BackgroundMedia, BlendMode, isStudioMode } from './types';
import { generateThemeFromMood, generateVideoLoop, LiveLyricsSession } from './services/geminiService';
import { saveProject, loadProject, saveProjectToCloud, listCloudProjects, loadCloudProject, deleteCloudProject } from './services/projectService';

const DEFAULT_CONFIG: VisualizationConfig = {
    name: "Midnight Neon",
    mode: VisualizerMode.Stage,
    targetFrameRate: 60,
    colorPalette: ["#FF00CC", "#3333FF", "#00CCFF", "#FFFFFF"],
    smoothingTimeConstant: 0.8,
    minDecibels: -90,
    maxDecibels: -10,
    fftSize: 2048,
    sensitivity: 1.5,
    glowIntensity: 15,
    speed: 1.0,
    enableBlur: true,
    blurStrength: 0.8,
    blendMode: 'screen',
    backgroundOpacity: 1.0,
    backgroundPulseIntensity: 0.5,
    enableBackgroundRotation: true,
    backgroundRotationInterval: 4,
    enableParallax: true,
    enableMosaic: false,
    mosaicIntensity: 0.5,
    mosaicShiftIntensity: 0.5,
    enableLayer2: true,
    layer2Opacity: 0.6,
    layer2BlendMode: 'screen',
    particleCount: 50,
    particleLifespan: 1.5,
    particleTurbulence: 0.5,
    particleGlow: 10,
    emitters: [{ id: 'center', x: 0.5, y: 0.5 }],
    enableSlicing: false,
    sliceCount: 6,
    sliceRotation: 0,
    enableSliceShadow: false,
    enableSliceAutomation: false,
    sliceAutomationInterval: 2,
    sliceRotationBeatPattern: undefined,
    sliceRotationRange: 45,
    slicePush: 0,
    slicePushMusicDriven: false,
    slicePushOscDriven: false,
    enableLighting: true,
    lightingIntensity: 1.0,
    enableBeams: true,
    lightColor: '#FFCC00',
    beamCount: 3,
    beamStrobeOnBeat: false,
    enable3dDepth: false,
    depthParallaxIntensity: 0.4,
    cameraFlyThrough: true,
    cameraFlySpeed: 1.0,
    enableSegmentation: false,
    depthLayerGap: 80,
    enableBassShake: false,
    bassShakeIntensity: 1.0,
    bassShakeInterval: 4,
    luminanceThreshold: 0.5,
    lumBassBrightness: 1.0,
    lumMidColorCycle: 0.5,
    lumTrebleFlicker: 0.5,
    enableText: true,
    textContent: "PLAJAH PIXELS",
    textColor: "#FFFFFF",
    textSize: 120,
    textOutline: true,
    textShatter: false,
    textShatterIntensity: 1.0,
    textFont: 'Inter',
    textGradient: false,
    textGradientColors: ['#FF00CC', '#00CCFF'],
    textGradientAngle: 0,
    textVowelReactor: false,
    textVowelEffect: 'glow' as const,
    textConsonantReactor: false,
    textConsonantEffect: 'shake' as const,
    textReactorIntensity: 1.0,
    textPhysics: 'none' as const,
    textPhysicsIntensity: 1.0,
    enableCaptions: false,
    enableLiveCaptions: false,
    captionsSyncMode: 'beat',
    captionsText: "READY TO SYNC",
    captionsSpeed: 4,
    captionsSize: 50,
    captionsColorShiftIntensity: 1.0,
    captionsSensitivity: 1.5
};

/**
 * Platform bridge — when Plajah Pixels is launched from a track/album/playlist,
 * the platform's GLOBAL player owns the audio. Pixels adopts the platform's
 * shared AnalyserNode (Web Audio allows only one MediaElementSource per <audio>),
 * mirrors the transport into its own audioState, and slaves its controls to the
 * platform. No audio is ever created or re-loaded here → playback is seamless.
 */
export interface PlajahPixelsPlatformBridge {
    analyser: AnalyserNode | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    togglePlay: () => void;
    seek: (time: number) => void;
    setVolume: (v: number) => void;
    next: () => void;
    prev: () => void;
    tracklist: { id: string; title: string; artist?: string }[];
    currentTrackId: string | null;
    onSelectTrack: (id: string) => void;
    mediaImages: string[];     // album art + slideshow + current-track images
    currentCaption: string;    // active lyric line from the platform's caption system
    hasCaptions: boolean;      // whether the current track has lyrics/time-coded captions
    lrcLyrics?: string;        // full LRC-formatted lyrics for time-sync mode
    currentTrackTitle: string; // current track name → auto-fills the text overlay
    title?: string;            // album / playlist title
    onClose: () => void;
}

const App: React.FC<{ platform?: PlajahPixelsPlatformBridge }> = ({ platform }) => {
    // Program-out popup mode: render only visualizer, no UI
    const isProgramOut = typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('programOut') === '1';

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioElRef = useRef<HTMLAudioElement | null>(null);
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const liveSessionRef = useRef<LiveLyricsSession | null>(null);
    // Virtual time ref for LRC sync in platform mode — keeps currentTime in sync with the platform player
    const platformTimeRef = useRef<{ currentTime: number }>({ currentTime: 0 });
    const [showTracklist, setShowTracklist] = useState(false);

    const [config, setConfig] = useState<VisualizationConfig>(DEFAULT_CONFIG);
    const [audioState, setAudioState] = useState<AudioState>({ isPlaying: false, currentTime: 0, duration: 0, volume: 0.8 });
    const [bgMedia1, setBgMedia1] = useState<BackgroundMedia[]>([
        { url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200", type: "image", id: "default-gradient-base" },
        { url: "https://assets.mixkit.co/videos/preview/mixkit-abstract-laser-lights-background-loop-41851-large.mp4", type: "video", id: "default-laser-video" },
        { url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1200", type: "image", id: "default-cyberpunk-base" }
    ]);
    const [bgMedia2, setBgMedia2] = useState<BackgroundMedia[]>([
        { url: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=1200", type: "image", id: "default-stars-overlay" },
        { url: "https://assets.mixkit.co/videos/preview/mixkit-bokeh-lights-of-a-festive-city-at-night-42171-large.mp4", type: "video", id: "default-bokeh-video" },
        { url: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?q=80&w=1200", type: "image", id: "default-misty-overlay" }
    ]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'core' | 'colors' | 'ambient' | 'stage' | 'text' | 'ai' | 'midi' | 'tracks'>('core');
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);

    // ─── Studio engine UI ───
    const [showRail, setShowRail] = useState(true);
    const [showTimeline, setShowTimeline] = useState(true);
    const [showMatte, setShowMatte] = useState(false);
    const [showClipGrid, setShowClipGrid] = useState(true);
    // The real composite: the full ordered layer stack emitted by the ClipLauncher.
    const [liveLayers, setLiveLayers] = useState<LauncherLayer[]>([]);
    // Milkdrop (butterchurn) — overlaid ON TOP of the visualizer (composited, not exclusive).
    const [milkdrop, setMilkdrop] = useState(false);
    const [milkdropIdx, setMilkdropIdx] = useState(0);
    const [milkdropMeta, setMilkdropMeta] = useState<{ count: number; name: string }>({ count: 0, name: '' });
    const [milkdropThumbnails, setMilkdropThumbnails] = useState<Record<string, string>>({});
    // Blend mode for the milkdrop overlay layer — set by clip launcher FX layer blend.
    const [milkdropBlendMode, setMilkdropBlendMode] = useState<string>('screen');
    const [milkdropLayerOpacity, setMilkdropLayerOpacity] = useState<number>(0.8);
    // Custom GLSL (Shadertoy-style) layer — active source, editor visibility, errors.
    const [shaderSrc, setShaderSrc] = useState<string | null>(null);
    const [shaderStart, setShaderStart] = useState(0);
    const [shaderError, setShaderError] = useState<string | null>(null);
    const [showShaderPanel, setShowShaderPanel] = useState(false);
    // Per-layer shaders from clip launcher (layerIdx → shader state)
    type LayerShaderEntry = { src: string; blendMode: string; opacity: number; params: number[]; startTimeMs: number };
    const [layerShaders, setLayerShaders] = useState<Record<number, LayerShaderEntry | null>>({});
    // Synthesia-style MIDI falling-notes scene (driven by live MIDI input).
    const [midiNotes, setMidiNotes] = useState(false);
    // 3D mode (React Three Fiber) — null = off.
    const [three3d, setThree3d] = useState<Three3DConfig | null>(null);
    const [showThreePanel, setShowThreePanel] = useState(false);

    // ── Output: record · fullscreen/dismiss · program-out window ────────────────
    const rootRef = useRef<HTMLDivElement>(null);
    const [uiHidden, setUiHidden] = useState(false);

    // ── 3D Depth / Parallax camera ────────────────────────────────────────────
    const depthMouseRef  = useRef({ x: 0, y: 0 });
    const depthSmoothRef = useRef({ x: 0, y: 0 });
    const depthBgRef     = useRef<HTMLDivElement>(null);
    const depthVizRef    = useRef<HTMLDivElement>(null);
    const depthFgRef     = useRef<HTMLDivElement>(null);
    const depthRafRef    = useRef<number | null>(null);
    // Live refs — read each rAF frame so sliders update instantly without restarting the loop
    const depthParallaxRef  = useRef(config.depthParallaxIntensity ?? 0.4);
    const cameraFlyRef      = useRef(config.cameraFlyThrough ?? true);
    const cameraFlySpeedRef = useRef(config.cameraFlySpeed ?? 1.0);
    useEffect(() => { depthParallaxRef.current  = config.depthParallaxIntensity ?? 0.4; }, [config.depthParallaxIntensity]);
    useEffect(() => { cameraFlyRef.current      = config.cameraFlyThrough ?? true;       }, [config.cameraFlyThrough]);
    useEffect(() => { cameraFlySpeedRef.current = config.cameraFlySpeed ?? 1.0;          }, [config.cameraFlySpeed]);

    useEffect(() => {
        if (!config.enable3dDepth) {
            [depthBgRef, depthVizRef, depthFgRef].forEach(r => {
                if (r.current) r.current.style.transform = '';
            });
            return;
        }
        const onMove = (e: MouseEvent) => {
            depthMouseRef.current = {
                x: (e.clientX / window.innerWidth - 0.5) * 2,
                y: (e.clientY / window.innerHeight - 0.5) * 2,
            };
        };
        window.addEventListener('mousemove', onMove, { passive: true });

        const t0 = performance.now();
        const tick = () => {
            const sm = depthSmoothRef.current;
            sm.x += (depthMouseRef.current.x - sm.x) * 0.07;
            sm.y += (depthMouseRef.current.y - sm.y) * 0.07;

            // Read live from refs — slider changes apply on the very next frame
            const flySpeed = cameraFlySpeedRef.current;
            const t = (performance.now() - t0) * 0.001 * flySpeed;
            const driftX = cameraFlyRef.current ? Math.sin(t * 0.11) * 0.28 + Math.sin(t * 0.07) * 0.12 : 0;
            const driftY = cameraFlyRef.current ? Math.sin(t * 0.09 + 1.2) * 0.16 : 0;
            const camX = sm.x * 0.5 + driftX;
            const camY = sm.y * 0.5 + driftY;
            const str = depthParallaxRef.current * 48;

            let bass = 0;
            if (analyserRef.current) {
                const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(buf);
                for (let i = 0; i < 4; i++) bass += buf[i];
                bass /= (4 * 255);
            }
            const breathe = 1 + bass * 0.025 + Math.sin(t * 0.19) * 0.012;

            if (depthBgRef.current)
                depthBgRef.current.style.transform =
                    `translate(${-camX * str * 0.5}px,${-camY * str * 0.5}px) scale(${breathe * 1.04})`;
            if (depthVizRef.current)
                depthVizRef.current.style.transform =
                    `translate(${-camX * str * 0.12}px,${-camY * str * 0.12}px) scale(${breathe})`;
            if (depthFgRef.current)
                depthFgRef.current.style.transform =
                    `translate(${camX * str * 0.35}px,${camY * str * 0.35}px) scale(${breathe * 0.97})`;

            depthRafRef.current = requestAnimationFrame(tick);
        };
        depthRafRef.current = requestAnimationFrame(tick);

        return () => {
            window.removeEventListener('mousemove', onMove);
            if (depthRafRef.current) cancelAnimationFrame(depthRafRef.current);
        };
    }, [config.enable3dDepth]); // only restart when depth mode itself toggles
    const [showProgramOutPicker, setShowProgramOutPicker] = useState(false);
    const programOutRef = useRef<Window | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const recRef = useRef<{ recorder: MediaRecorder; stream: MediaStream } | null>(null);

    // ── Save modal state ──────────────────────────────────────────────────────────
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [reelloSending, setReelloSending] = useState(false);
    const [reelloProgress, setReelloProgress] = useState(0);
    const [reelloSuccess, setReelloSuccess] = useState(false);
    const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

    const stopRecording = useCallback(() => {
        const r = recRef.current; if (!r) return;
        try { r.recorder.stop(); } catch { /* */ }
        recRef.current = null; setIsRecording(false);
    }, []);

    const startRecording = useCallback(async () => {
        try {
            // a) Capture video from the tab at NATIVE resolution + 60fps. No width
            //    cap — capping forced a downscale that softened the output. Record
            //    while fullscreen for a pristine full-res grab.
            const videoStream: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({
                video: {
                    frameRate: { ideal: 60, max: 60 },
                    width:  { ideal: 3840 },
                    height: { ideal: 2160 },
                },
                audio: false,
                preferCurrentTab: true,
            });
            // Ask the captured track for the highest quality it can give.
            try {
                const vt = videoStream.getVideoTracks()[0];
                await vt?.applyConstraints({ frameRate: 60, width: { ideal: 3840 }, height: { ideal: 2160 } });
            } catch { /* track may not support constraints — keep defaults */ }

            // b) Capture audio directly from the AnalyserNode (raw, unprocessed)
            let combinedStream = videoStream;
            if (analyserRef.current) {
                const audioCtx = analyserRef.current.context as AudioContext;
                const destNode = audioCtx.createMediaStreamDestination();
                analyserRef.current.connect(destNode);
                audioDestRef.current = destNode;
                combinedStream = new MediaStream([
                    ...videoStream.getVideoTracks(),
                    ...destNode.stream.getAudioTracks(),
                ]);
            }

            // c) Codec priority for the best pristine container the browser supports:
            //    H.265/HEVC MP4 (Safari) → H.264 High-profile MP4 (Chrome 130+/Safari)
            //    → VP9 WebM → fallback. mp4 strings carry AAC (mp4a.40.2) audio.
            const codecs = [
                'video/mp4;codecs=hvc1.1.6.L153.B0,mp4a.40.2', // HEVC Main, ~4K
                'video/mp4;codecs=hev1.1.6.L153.B0,mp4a.40.2',
                'video/mp4;codecs=avc1.640034,mp4a.40.2',      // H.264 High 5.2
                'video/mp4;codecs=avc1.4d0034,mp4a.40.2',      // H.264 Main 5.2
                'video/mp4;codecs=avc1,mp4a.40.2',
                'video/mp4',
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm',
            ];
            const mime = codecs.find(c => MediaRecorder.isTypeSupported(c)) ?? 'video/webm';

            const chunks: Blob[] = [];
            const recorder = new MediaRecorder(combinedStream, {
                mimeType: mime,
                videoBitsPerSecond: 80_000_000, // ~80 Mbps — visually lossless at 4K60
                audioBitsPerSecond: 320_000,    // transparent (AAC/Opus)
            });

            recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: mime });
                // Disconnect the extra AudioContext → destNode connection
                if (audioDestRef.current && analyserRef.current) {
                    try { analyserRef.current.disconnect(audioDestRef.current); } catch { /* */ }
                    audioDestRef.current = null;
                }
                videoStream.getTracks().forEach(t => t.stop());
                // Show save modal instead of auto-downloading
                setRecordedBlob(blob);
                setShowSaveModal(true);
                setReelloSuccess(false);
                setReelloProgress(0);
            };

            videoStream.getVideoTracks()[0]?.addEventListener('ended', () => stopRecording());
            recorder.start(100); // 100ms timeslice for reliability
            recRef.current = { recorder, stream: combinedStream };
            setIsRecording(true);
        } catch (e) { console.warn('[Plajah Pixels] recording failed/cancelled:', e); }
    }, [stopRecording]);

    const toggleRecord = useCallback(() => { isRecording ? stopRecording() : startRecording(); }, [isRecording, startRecording, stopRecording]);

    // ── Recording save modal handlers ─────────────────────────────────────────────
    const handleDownloadRecording = useCallback(() => {
        if (!recordedBlob) return;
        const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
        const url = URL.createObjectURL(recordedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plajah-pixels-${Date.now()}.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 8000);
    }, [recordedBlob]);

    const handleSendToReello = useCallback(async () => {
        if (!recordedBlob || !auth.currentUser) return;
        setReelloSending(true);
        setReelloProgress(0);
        try {
            const trackTitle = platform?.currentTrackTitle || platform?.title;
            const videoTitle = trackTitle ? `Plajah Pixels — ${trackTitle}` : 'Plajah Pixels Visual';
            const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
            const file = new File([recordedBlob], `plajah-pixels.${ext}`, { type: recordedBlob.type });

            const vid = await uploadVideo(
                { file, title: videoTitle, isPrivate: false } as any,
                (p: number) => setReelloProgress(p),
            );

            const displayName = auth.currentUser.displayName || 'Plajah';
            const playlistTitle = `${displayName} Plajah Pixels`;
            await createVideoPlaylist({ title: playlistTitle, videoIds: [(vid as any).id], isPublic: true } as any);

            setReelloSuccess(true);
        } catch (err) {
            console.error('[Plajah Pixels] Send to Reello failed:', err);
        } finally {
            setReelloSending(false);
        }
    }, [recordedBlob, platform]);

    const handleDismissSaveModal = useCallback(() => {
        setShowSaveModal(false);
        setRecordedBlob(null);
        setReelloSuccess(false);
        setReelloProgress(0);
    }, []);

    const enterFullscreen = useCallback(async (screen?: any) => {
        const el = rootRef.current; if (!el) return;
        try { await (el.requestFullscreen as any)(screen ? { screen } : undefined); } catch { /* */ }
    }, []);

    const buildProgramOutUrl = () =>
        window.location.origin + window.location.pathname +
        (window.location.search ? window.location.search + '&programOut=1' : '?programOut=1') +
        window.location.hash;

    // Open a dedicated program-output popup window (visualizer only, no UI).
    // Syncs config in real-time via BroadcastChannel.
    const openProgramOut = useCallback(() => {
        const existing = programOutRef.current;
        if (existing && !existing.closed) {
            existing.focus();
            return;
        }
        const sw = window.screen.availWidth;
        const sh = window.screen.availHeight;
        const w = window.open(
            buildProgramOutUrl(),
            'PlajahProgramOut',
            `width=${sw},height=${sh},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes`,
        );
        if (!w) { alert('Popup blocked — allow popups for this site to use Program Output'); return; }
        programOutRef.current = w;
        setShowProgramOutPicker(false);
    }, []);

    // Open program output on an external display and fullscreen it there.
    // Uses Window Management API to position on the secondary screen.
    const sendToDisplay = useCallback(async () => {
        const url = buildProgramOutUrl();
        try {
            const w: any = window;
            if (w.getScreenDetails) {
                const details = await w.getScreenDetails();
                const ext: any = details.screens.find((s: any) => !s.isPrimary) ?? details.currentScreen;
                const existing = programOutRef.current;
                if (existing && !existing.closed) existing.close();
                const popup = window.open(
                    url,
                    'PlajahProgramOut',
                    `width=${ext.availWidth},height=${ext.availHeight},left=${ext.availLeft},top=${ext.availTop},menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes`,
                );
                if (!popup) { alert('Popup blocked — allow popups for this site to use Program Output'); return; }
                programOutRef.current = popup;
                // Request fullscreen inside popup once loaded
                popup.addEventListener('load', () => {
                    try { popup.document.documentElement.requestFullscreen?.(); } catch { /* */ }
                }, { once: true });
                return;
            }
        } catch { /* permission denied / unsupported → fall through */ }
        // Fallback: open popup on current screen and request fullscreen
        const existing = programOutRef.current;
        if (existing && !existing.closed) { existing.focus(); try { existing.document.documentElement.requestFullscreen?.(); } catch { /* */ } return; }
        const sw = window.screen.availWidth;
        const sh = window.screen.availHeight;
        const popup = window.open(url, 'PlajahProgramOut', `width=${sw},height=${sh},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes`);
        if (!popup) { alert('Popup blocked — allow popups for this site to use Program Output'); return; }
        programOutRef.current = popup;
        popup.addEventListener('load', () => { try { popup.document.documentElement.requestFullscreen?.(); } catch { /* */ } }, { once: true });
    }, [enterFullscreen]);

    // ── External-display feed ───────────────────────────────────────────────
    // Expose the live analyser so the program-out window (a separate, same-origin
    // window) can read it back via window.opener — Web Audio nodes can't cross a
    // BroadcastChannel, but reading getByteFrequencyData cross-window is fine.
    useEffect(() => {
        (window as any).__plajahPixelsGetAnalyser = () => analyserRef.current;
        return () => { try { delete (window as any).__plajahPixelsGetAnalyser; } catch { /* */ } };
    }, []);

    // Broadcast the full program STATE (composite layers + config + the global
    // override flags) to any open program-out window, and answer its initial
    // REQUEST_STATE so a freshly-opened window catches up immediately.
    useEffect(() => {
        const ch = new BroadcastChannel('plajah-program-out');
        // Layers may carry blob: media URLs that won't resolve in another window;
        // strip those so the clone shows whatever IS shareable rather than throwing.
        const shareLayers = liveLayers.map(l => ({
            ...l,
            clips: l.clips.map(c => (c && c.mediaUrl?.startsWith('blob:') ? { ...c, mediaUrl: undefined } : c)),
        }));
        const payload = {
            type: 'STATE',
            config, layers: shareLayers, isPlaying: audioState.isPlaying,
            shaderSrc, shaderStart, milkdrop, milkdropIdx, milkdropBlendMode, milkdropLayerOpacity,
            midiNotes, three3d,
        };
        const send = () => { try { ch.postMessage(payload); } catch { /* unclonable → ignore */ } };
        ch.onmessage = (e) => { if (e.data?.type === 'REQUEST_STATE') send(); };
        send();
        return () => ch.close();
    }, [config, liveLayers, audioState.isPlaying, shaderSrc, shaderStart, milkdrop, milkdropIdx, milkdropBlendMode, milkdropLayerOpacity, midiNotes, three3d]);

    // ── Preview / Program (A/B) ──────────────────────────────────────────────────
    // Program = the live full-screen output (driven by `config` + the mode flags),
    // never disturbed while you audition. Preview = a small second pipeline that
    // renders a STAGED 2D/scene or GLSL look. Take promotes Preview → Program.
    const [previewOn, setPreviewOn] = useState(false);
    const [editTarget, setEditTarget] = useState<'program' | 'preview'>('program');
    const [previewConfig, setPreviewConfig] = useState<VisualizationConfig>(DEFAULT_CONFIG);
    const [previewKind, setPreviewKind] = useState<'scene' | 'shader'>('scene');
    const [previewShader, setPreviewShader] = useState<string | null>(null);
    const previewShaderStartRef = useRef(0);

    // Route a config patch to whichever side is being edited.
    const applyLook = useCallback((patch: Partial<VisualizationConfig>) => {
        if (editTarget === 'preview') {
            if (patch.mode !== undefined) setPreviewKind('scene');
            setPreviewConfig(prev => ({ ...prev, ...patch }));
        } else {
            if (patch.mode !== undefined) { setMilkdrop(false); setShaderSrc(null); setThree3d(null); }
            setConfig(prev => ({ ...prev, ...patch }));
        }
    }, [editTarget]);

    const handleLayerShader = useCallback((
        layerIdx: number, src: string | null, blendMode: string, opacity: number, params: number[]
    ) => {
        setLayerShaders(prev => ({
            ...prev,
            [layerIdx]: src ? { src, blendMode, opacity, params, startTimeMs: performance.now() } : null,
        }));
    }, []);

    const handleShaderParamsChange = useCallback((layerIdx: number, params: number[]) => {
        setLayerShaders(prev => {
            const entry = prev[layerIdx];
            if (!entry) return prev;
            return { ...prev, [layerIdx]: { ...entry, params } };
        });
    }, []);

    // Live driver-bus modulation (Steps 5a–5b). Shader layers carry per-index opacity;
    // the bg/overlay media layers carry opacity multipliers fed into BackgroundLayer.
    const [layerMod, setLayerMod] = useState<Record<number, { opacity?: number; blendAmount?: number }>>({});
    const [bgMediaMod, setBgMediaMod] = useState<{ m1: number; m2: number }>({ m1: 1, m2: 1 });
    const handleLayerModulation = useCallback((layerIdx: number, layerId: string, mod: { opacity?: number; blendAmount?: number }) => {
        if (layerId === 'bg') {
            if (mod.opacity != null) setBgMediaMod(p => (p.m1 === mod.opacity ? p : { ...p, m1: mod.opacity! }));
        } else if (layerId === 'overlay') {
            if (mod.opacity != null) setBgMediaMod(p => (p.m2 === mod.opacity ? p : { ...p, m2: mod.opacity! }));
        } else {
            setLayerMod(prev => ({ ...prev, [layerIdx]: { ...prev[layerIdx], ...mod } }));
        }
    }, []);

    const applyShaderLook = useCallback((src: string) => {
        if (editTarget === 'preview') {
            setPreviewKind('shader'); previewShaderStartRef.current = performance.now(); setPreviewShader(src);
        } else {
            setMilkdrop(false); setMidiNotes(false); setThree3d(null);
            setShaderError(null); setShaderStart(performance.now()); setShaderSrc(src);
        }
    }, [editTarget]);

    // Take the staged Preview look to the live Program output.
    const takeToProgram = useCallback(() => {
        setMilkdrop(false); setThree3d(null); setMidiNotes(false);
        if (previewKind === 'shader' && previewShader) {
            setShaderError(null); setShaderStart(performance.now()); setShaderSrc(previewShader);
        } else {
            setShaderSrc(null); setConfig(prev => ({ ...prev, ...previewConfig }));
        }
    }, [previewKind, previewShader, previewConfig]);

    const openPreview = useCallback(() => {
        setPreviewOn(v => { const n = !v; setEditTarget(n ? 'preview' : 'program'); return n; });
    }, []);
    // Overlay layers (Lottie + HTML/URL) + perf HUD / mode.
    const [overlay, setOverlay] = useState({
        lottieUrl: '', lottieOn: false, lottieOpacity: 0.9,
        htmlUrl: '', htmlOn: false, htmlOpacity: 0.9, htmlInteractive: false,
    });
    const [showLayersPanel, setShowLayersPanel] = useState(false);
    const [showFps, setShowFps] = useState(false);
    const [perfMode, setPerfMode] = useState(false);
    const perfPrevRef = useRef<Partial<VisualizationConfig> | null>(null);
    const overlayState: OverlayState = { ...overlay, set: (patch) => setOverlay(o => ({ ...o, ...patch })) };

    // Performance mode — trade visual richness for framerate under heavy load.
    const togglePerfMode = () => setPerfMode(on => {
        const next = !on;
        if (next) {
            perfPrevRef.current = {
                enableBlur: config.enableBlur, enableMosaic: config.enableMosaic, enableLayer2: config.enableLayer2,
                enableBassShake: config.enableBassShake, particleCount: config.particleCount, glowIntensity: config.glowIntensity,
            };
            setConfig(prev => ({ ...prev, enableBlur: false, enableMosaic: false, enableLayer2: false, enableBassShake: false, particleCount: Math.min(prev.particleCount, 30), glowIntensity: Math.min(prev.glowIntensity, 8) }));
        } else if (perfPrevRef.current) {
            const restore = perfPrevRef.current; perfPrevRef.current = null;
            setConfig(prev => ({ ...prev, ...restore }));
        }
        return next;
    });
    const matteEngineRef = useRef<MatteEngine | null>(null);
    if (!matteEngineRef.current) matteEngineRef.current = new MatteEngine();
    const [matteSettings, setMatteSettings] = useState<MatteSettings>({ mode: 'none', thresh: 0.30, scale: 1.0, react: true });

    // Sync MIDI triggers with audio playback state
    useEffect(() => {
        const handleMidiPlayPause = (e: Event) => {
            const action = (e as CustomEvent).detail;
            if (!audioElRef.current) return;
            if (action === 'play') {
                audioElRef.current.play();
                setAudioState(s => ({ ...s, isPlaying: true }));
            } else if (action === 'pause') {
                audioElRef.current.pause();
                setAudioState(s => ({ ...s, isPlaying: false }));
            }
        };

        const handleVolumeChangeStatus = (e: Event) => {
            const v = (e as CustomEvent).detail;
            setAudioState(s => ({ ...s, volume: v }));
        };

        const handleMusicPause = () => {
            setAudioState(s => ({ ...s, isPlaying: false }));
        };

        window.addEventListener('plajah-midi-play-pause', handleMidiPlayPause);
        window.addEventListener('plajah-volume-change', handleVolumeChangeStatus);
        window.addEventListener('plajah-music-pause', handleMusicPause);
        return () => {
            window.removeEventListener('plajah-midi-play-pause', handleMidiPlayPause);
            window.removeEventListener('plajah-volume-change', handleVolumeChangeStatus);
            window.removeEventListener('plajah-music-pause', handleMusicPause);
        };
    }, []);

    // MIDI pad P13 (Note 73) → toggle / advance Milkdrop engine from the controller
    useEffect(() => {
        const handleToggle = () => setMilkdrop(v => !v);
        const handleNext   = () => setMilkdropIdx(i => i + 1);
        window.addEventListener('plajah-milkdrop-toggle', handleToggle);
        window.addEventListener('plajah-milkdrop-next',   handleNext);
        return () => {
            window.removeEventListener('plajah-milkdrop-toggle', handleToggle);
            window.removeEventListener('plajah-milkdrop-next',   handleNext);
        };
    }, []);
    const [aiVideoPrompt, setAiVideoPrompt] = useState("");
    const [aiRefImage, setAiRefImage] = useState<string | null>(null);
    const [isLiveLyricsActive, setIsLiveLyricsActive] = useState(false);
    const [audioFileName, setAudioFileName] = useState<string | undefined>(undefined);
    const audioBlobUrlRef = useRef<string | undefined>(undefined); // current audio blob URL for project save
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [showCloudProjects, setShowCloudProjects] = useState(false);
    const [cloudProjects, setCloudProjects] = useState<import('./services/projectService').CloudProjectMeta[]>([]);
    const [cloudProjectsLoading, setCloudProjectsLoading] = useState(false);

    // ── Audio context setup (shared between file upload and project load) ───────
    const ensureAudioContext = () => {
        if (audioContextRef.current) return;
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        audioElRef.current = new Audio();
        const source = audioContextRef.current.createMediaElementSource(audioElRef.current);
        sourceRef.current = source;
        source.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
        audioElRef.current.ontimeupdate = () => setAudioState(s => ({ ...s, currentTime: audioElRef.current?.currentTime || 0 }));
        audioElRef.current.onloadedmetadata = () => setAudioState(s => ({ ...s, duration: audioElRef.current?.duration || 0 }));
    };

    // Audio Initialization & File Placement
    const handleUpload = (file: File) => {
        setAudioFileName(file.name);
        // Auto-populate text from audio filename only
        const trackName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
        if (trackName) setConfig(prev => ({ ...prev, textContent: trackName }));
        ensureAudioContext();
        if (audioBlobUrlRef.current?.startsWith('blob:')) URL.revokeObjectURL(audioBlobUrlRef.current);
        const blobUrl = URL.createObjectURL(file);
        audioBlobUrlRef.current = blobUrl;
        audioElRef.current!.src = blobUrl;
        audioElRef.current!.play();
        setAudioState(s => ({ ...s, isPlaying: true, duration: audioElRef.current?.duration || 0 }));
    };

    const loadAudioFromUrl = (url: string, filename?: string) => {
        if (filename) setAudioFileName(filename);
        ensureAudioContext();
        if (audioBlobUrlRef.current?.startsWith('blob:') && audioBlobUrlRef.current !== url)
            URL.revokeObjectURL(audioBlobUrlRef.current);
        audioBlobUrlRef.current = url;
        audioElRef.current!.src = url;
        audioElRef.current!.pause();
        setAudioState(s => ({ ...s, isPlaying: false }));
    };

    const handleVolumeChange = (v: number) => {
        if (audioElRef.current) {
            audioElRef.current.volume = v;
        }
        setAudioState(s => ({ ...s, volume: v }));
    };

    const handleTogglePlay = () => {
        if (!audioElRef.current) return;
        if (audioState.isPlaying) {
            audioElRef.current.pause();
            setAudioState(s => ({ ...s, isPlaying: false }));
        } else {
            audioElRef.current.play();
            setAudioState(s => ({ ...s, isPlaying: true }));
        }
    };

    // ─── Platform bridge: adopt the global player's analyser + transport ───────
    // Co-update the ref + state on every platform change so the render reliably
    // re-reads the (initially null → live) analyser. We never create audio here.
    // Keyed on the primitive transport values (NOT the bridge object, which is a
    // fresh identity every render) so this only fires on real transport changes.
    useEffect(() => {
        if (!platform) return;
        analyserRef.current = platform.analyser;
        setAudioState({
            isPlaying: platform.isPlaying,
            currentTime: platform.currentTime,
            duration: platform.duration,
            volume: platform.volume,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [platform?.analyser, platform?.isPlaying, platform?.currentTime, platform?.duration, platform?.volume]);

    // Auto-load album art + slideshow + track images into the media layer.
    // Keyed on the stable image-set identity so it doesn't reset every render.
    useEffect(() => {
        if (!platform) return;
        const imgs = (platform.mediaImages || []).filter(Boolean);
        if (imgs.length) {
            setBgMedia1(imgs.map((url, i) => ({ url, type: 'image' as const, id: `pp-media-${i}` })));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [platform?.mediaImages]);

    // Open the tracklist once when a multi-track album/playlist is loaded (keyed
    // on length so it never fights the user's manual toggle).
    useEffect(() => {
        if (platform && platform.tracklist.length > 1) setShowTracklist(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [platform?.tracklist.length]);

    // ─── Shared captions ───────────────────────────────────────────────────────
    // Drive the captions overlay from the platform's caption system.
    // When the track has time-coded LRC lyrics, use LRC sync mode (exact timing).
    // Otherwise fall back to the active single-line from getActiveCaption.
    useEffect(() => {
        if (!platform) return;
        if (platform.lrcLyrics) {
            setConfig(prev => prev.captionsText === platform.lrcLyrics ? prev : {
                ...prev, captionsText: platform.lrcLyrics!, captionsSyncMode: 'lrc',
            });
        } else {
            setConfig(prev => prev.captionsText === platform.currentCaption ? prev : {
                ...prev, captionsText: platform.currentCaption, captionsSyncMode: 'beat',
            });
        }
    }, [platform?.lrcLyrics, platform?.currentCaption]);

    // Turn the overlay on/off with the track's caption availability.
    // Do NOT set enableLiveCaptions here — that controls Gemini transcription (manual opt-in only).
    useEffect(() => {
        if (!platform) return;
        setConfig(prev => ({ ...prev, enableCaptions: platform.hasCaptions }));
    }, [platform?.hasCaptions]);

    // Keep platform time ref in sync — used by CaptionsOverlay for LRC timing in platform mode.
    useEffect(() => {
        if (platform) {
            platformTimeRef.current.currentTime = platform.currentTime;
        }
    }, [platform?.currentTime]);

    // Auto-fill the text overlay with the current track name (so the headline
    // text tracks whatever is playing). Lyrics flow separately via captions above.
    useEffect(() => {
        if (!platform || !platform.currentTrackTitle) return;
        setConfig(prev => (prev.textContent === platform.currentTrackTitle ? prev : { ...prev, textContent: platform.currentTrackTitle }));
    }, [platform?.currentTrackTitle]);

    // Preload all Google Fonts when the text tab is opened
    useEffect(() => {
        if (activeTab === 'text') {
            TEXT_FONTS.forEach(f => { if (f.gfUrl) ensureFontLoaded(f.name); });
        }
    }, [activeTab]);

    // Effective transport: slave to the platform when bridged, else self-driven.
    const effTogglePlay = () => (platform ? platform.togglePlay() : handleTogglePlay());
    const effVolumeChange = (v: number) => { if (platform) platform.setVolume(v); else handleVolumeChange(v); };
    const effSeek = (t: number) => {
        if (platform) platform.seek(t);
        else if (audioElRef.current) audioElRef.current.currentTime = t;
    };

    // Live Lyrics / Streaming Connection
    useEffect(() => {
        if (config.enableLiveCaptions && audioState.isPlaying && audioContextRef.current && sourceRef.current) {
            if (!liveSessionRef.current) {
                const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || "";
                liveSessionRef.current = new LiveLyricsSession(apiKey);
                
                liveSessionRef.current.connect(
                    audioContextRef.current,
                    sourceRef.current,
                    (transcript, isComplete) => {
                        if (transcript) {
                            setConfig(prev => ({
                                ...prev,
                                captionsText: transcript
                            }));
                        }
                    }
                ).then(() => {
                    setIsLiveLyricsActive(true);
                }).catch(err => {
                    console.error("Failed to connect Gemini Live Session:", err);
                    setIsLiveLyricsActive(false);
                });
            }
        } else {
            if (liveSessionRef.current) {
                liveSessionRef.current.disconnect();
                liveSessionRef.current = null;
                setIsLiveLyricsActive(false);
            }
        }

        return () => {
            if (liveSessionRef.current) {
                liveSessionRef.current.disconnect();
                liveSessionRef.current = null;
                setIsLiveLyricsActive(false);
            }
        };
    }, [config.enableLiveCaptions, audioState.isPlaying]);

    // Handle Custom Ambient Media Upload
    const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>, layerNum: 1 | 2) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const url = URL.createObjectURL(file);
            const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
            const newMedia: BackgroundMedia = { url, type, id: Date.now().toString() };
            if (layerNum === 1) {
                setBgMedia1(prev => [newMedia, ...prev]);
            } else {
                setBgMedia2(prev => [newMedia, ...prev]);
            }
        }
    };

    // Generate Background Video Loop using Veo via geminiService
    const handleGenerateVideo = async () => {
        if (!aiVideoPrompt.trim() || !aiRefImage) return;
        setIsGeneratingVideo(true);
        try {
            // Mine file components
            const base64Data = aiRefImage.split(',')[1];
            const mimeType = aiRefImage.split(';')[0].split(':')[1];
            
            const videoUrl = await generateVideoLoop(base64Data, mimeType, aiVideoPrompt);
            const newMedia: BackgroundMedia = {
                url: videoUrl,
                type: 'video',
                id: `veo-${Date.now()}`
            };
            setBgMedia1(prev => [newMedia, ...prev]);
            setAiVideoPrompt("");
            setAiRefImage(null);
        } catch (err) {
            console.error("AI Video Generation Failed:", err);
        } finally {
            setIsGeneratingVideo(false);
        }
    };

    // Helper for reference image selection
    const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setAiRefImage(event.target.result as string);
                }
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    // ─── Project Save / Load ──────────────────────────────────────────────────
    const handleSaveProject = async () => {
        setIsSaving(true);
        try {
            const audioBlobUrl = audioBlobUrlRef.current;
            // Always save locally as .plajah file (includes embedded audio)
            await saveProject(config, bgMedia1, bgMedia2, audioFileName, audioBlobUrl);
            // If signed in, also save to cloud profile (audio goes to Firebase Storage)
            const uid = auth.currentUser?.uid;
            if (uid) {
                // Capture a thumbnail from the output canvas (best-effort)
                let thumbnail: string | undefined;
                try {
                    const canvas = rootRef.current?.querySelector<HTMLCanvasElement>('#core-visualizer canvas, canvas');
                    if (canvas) thumbnail = canvas.toDataURL('image/jpeg', 0.4);
                } catch { /* skip thumbnail on cross-origin canvas */ }
                await saveProjectToCloud(uid, config, bgMedia1, bgMedia2, audioFileName, audioBlobUrl, thumbnail);
            }
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);
        } catch (err) {
            console.error('[PlajahPixels] Save failed:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenCloudProjects = async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        setShowCloudProjects(true);
        setCloudProjectsLoading(true);
        try {
            const projects = await listCloudProjects(uid);
            setCloudProjects(projects);
        } catch (err) {
            console.error('[PlajahPixels] Cloud list failed:', err);
        } finally {
            setCloudProjectsLoading(false);
        }
    };

    const handleLoadCloudProject = async (projectId: string) => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        try {
            const loaded = await loadCloudProject(uid, projectId);
            setConfig(loaded.config);
            setBgMedia1(loaded.bgMedia1);
            setBgMedia2(loaded.bgMedia2);
            if (loaded.audioBlobUrl) loadAudioFromUrl(loaded.audioBlobUrl, loaded.audioFileName);
            else if (loaded.audioFileName) setAudioFileName(loaded.audioFileName);
            setShowCloudProjects(false);
        } catch (err) {
            console.error('[PlajahPixels] Cloud load failed:', err);
            alert('Could not load project from cloud.');
        }
    };

    const handleDeleteCloudProject = async (projectId: string) => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        try {
            await deleteCloudProject(uid, projectId);
            setCloudProjects(prev => prev.filter(p => p.id !== projectId));
        } catch (err) {
            console.error('[PlajahPixels] Cloud delete failed:', err);
        }
    };

    const handleLoadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        try {
            const loaded = await loadProject(e.target.files[0]);
            setConfig(loaded.config);
            setBgMedia1(loaded.bgMedia1);
            setBgMedia2(loaded.bgMedia2);
            if (loaded.audioBlobUrl) loadAudioFromUrl(loaded.audioBlobUrl, loaded.audioFileName);
            else if (loaded.audioFileName) setAudioFileName(loaded.audioFileName);
        } catch (err) {
            console.error('[PlajahPixels] Load failed:', err);
            alert('Could not load project file. Make sure it is a valid .plajah file.');
        }
        e.target.value = '';
    };

    // Shared tracklist rows — reused by the floating panel AND the flyout tab.
    const tracklistRows = platform ? platform.tracklist.map((t, i) => {
        const active = t.id === platform.currentTrackId;
        return (
            <button
                key={t.id}
                onClick={() => platform.onSelectTrack(t.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all ${active ? 'bg-purple-600/40 text-white' : 'text-white/55 hover:bg-white/10 hover:text-white'}`}
            >
                <span className="text-[9px] font-black w-4 shrink-0 opacity-50">{i + 1}</span>
                {active && audioState.isPlaying
                    ? <Pause className="w-3 h-3 shrink-0 fill-current" />
                    : <Play className="w-3 h-3 shrink-0 fill-current" />}
                <span className="min-w-0">
                    <span className="block text-[11px] font-bold truncate">{t.title}</span>
                    {t.artist && <span className="block text-[9px] text-white/35 truncate">{t.artist}</span>}
                </span>
            </button>
        );
    }) : null;

    const LAUNCHER_H = 510; // px — scene bar(34) + 4 layers(368) + add-layer bar(30) + source browser(126) + buffer

    // ── Program-out window: a windowed CLONE of the live composite ──────────────
    // Mirrors the LayerStack + global overrides, fed live from this window over a
    // BroadcastChannel + the shared analyser (via window.opener). Self-contained
    // in ProgramOutView so its hooks don't entangle the studio's.
    if (isProgramOut) {
        return <ProgramOutView />;
    }

    return (
        <div className="flex flex-col overflow-hidden bg-black" style={{ height: '100dvh' }}>
        <div ref={rootRef} id="plajah-pixels-root" className="relative flex-1 min-h-0 flex flex-col overflow-hidden bg-black text-white font-sans">
            {/* ─── Platform-slaved chrome: exit, title, tracklist toggle — sits below icon row ─── */}
            {platform && !uiHidden && (
                <div className="absolute top-[68px] left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-black/50 backdrop-blur-xl border border-white/10 rounded-full px-2 py-1.5 shadow-xl">
                    <button
                        onClick={platform.onClose}
                        title="Exit Plajah Pixels"
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1.5 px-1">
                        <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                        <span className="text-[11px] font-black uppercase tracking-widest text-white/80 max-w-[200px] truncate">
                            {platform.title || 'Plajah Pixels'}
                        </span>
                    </div>
                    {platform.tracklist.length > 0 && (
                        <button
                            onClick={() => setShowTracklist(v => !v)}
                            title="Toggle tracklist"
                            className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${showTracklist ? 'bg-purple-600/40 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                        >
                            <Music className="w-3.5 h-3.5" /> {platform.tracklist.length}
                        </button>
                    )}
                </div>
            )}

            {/* ─── Tracklist — draggable, pinnable, collapsible (hide via handle ×) ─── */}
            {platform && showTracklist && !uiHidden && platform.tracklist.length > 0 && (
                <DraggablePanel id="tracklist" defaultPos={{ x: 24, y: 96 }} zIndex={40} label="Tracklist" onClose={() => setShowTracklist(false)}>
                    <div className="w-64 max-h-[58vh] overflow-y-auto bg-black/70 backdrop-blur-2xl border border-white/10 border-t-0 rounded-b-2xl p-2 shadow-2xl scrollbar-none">
                        {tracklistRows}
                    </div>
                </DraggablePanel>
            )}

            {/* ─── Clip Launcher — Resolume-style bottom strip ─── */}
            <AnimatePresence>
                {showClipGrid && !uiHidden && (
                    <motion.div
                        key="clip-launcher"
                        initial={{ height: 0 }}
                        animate={{ height: LAUNCHER_H }}
                        exit={{ height: 0 }}
                        transition={{ type: 'spring', damping: 32, stiffness: 260 }}
                        className="shrink-0 flex flex-col overflow-hidden"
                        style={{ order: 2, zIndex: 10, background: 'rgba(6,6,14,0.97)', backdropFilter: 'blur(24px)', borderTop: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -8px 40px rgba(0,0,0,0.7)' }}
                    >
                        {/* Close handle */}
                        <button
                            onClick={() => setShowClipGrid(false)}
                            className="absolute top-1 right-2 w-6 h-6 flex items-center justify-center rounded text-white/20 hover:text-white hover:bg-white/10 transition-all z-20"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>

                        {/* Resolume-style clip launcher (fills the middle) */}
                        <div className="flex-1 min-h-0 overflow-hidden">
                            <ClipLauncher
                                config={editTarget === 'preview' ? previewConfig : config}
                                onApply={applyLook}
                                onPowerOff={() => setShowClipGrid(false)}
                                onLayersChange={setLiveLayers}
                                /* Render bridges are NO-OPS now — the LayerStack renders every
                                   clip (media/generator/milkdrop/shader) directly from the layer
                                   stack, so firing a clip only updates that stack, never the old
                                   global single-core pipeline. */
                                onSetLayerMedia={() => {}}
                                bgMedia1={bgMedia1}
                                bgMedia2={bgMedia2}
                                shaderLibrary={SHADER_LIBRARY}
                                onApplyShader={applyShaderLook}
                                onLayerShader={() => {}}
                                onShaderParamsChange={handleShaderParamsChange}
                                onLayerModulation={handleLayerModulation}
                                onSyncSceneAuto={(interval) => setConfig(prev => ({ ...prev, enableBackgroundRotation: true, backgroundRotationInterval: Math.min(20, interval) }))}
                                analyser={analyserRef.current}
                                milkdrop={{
                                    enabled: milkdrop,
                                    name: milkdropMeta.name,
                                    count: milkdropMeta.count,
                                    idx: milkdropIdx,
                                    /* No-op: firing a Milkdrop CLIP must not flip the global
                                       Milkdrop override — the LayerStack renders the clip itself. */
                                    onToggle: () => {},
                                    onPrev:   () => setMilkdropIdx(i => i - 1),
                                    onNext:   () => setMilkdropIdx(i => i + 1),
                                    onRandom: () => setMilkdropIdx(() => Math.floor(Math.random() * (milkdropMeta.count || 1))),
                                    onSetIdx: (i) => setMilkdropIdx(i),
                                    onSetBlendMode: (m) => setMilkdropBlendMode(m),
                                    onSetOpacity: (o) => setMilkdropLayerOpacity(o),
                                    thumbnails: milkdropThumbnails,
                                }}
                                rightPanel={
                                    <div className="h-full flex flex-col text-xs overflow-hidden">
                                        {/* ── Program Output ───────────────────────────────── */}
                                        <div className="shrink-0 px-3 pt-3 pb-2 space-y-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                            <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Program Output</p>
                                            <button
                                                onClick={openProgramOut}
                                                className="w-full py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all"
                                                style={{ background: 'rgba(14,165,233,0.2)', border: '1px solid rgba(14,165,233,0.4)', color: '#7dd3fc' }}
                                            >
                                                <Monitor className="w-3 h-3" /> Open Output Window
                                            </button>
                                            <button
                                                onClick={sendToDisplay}
                                                className="w-full py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all"
                                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)' }}
                                            >
                                                <Maximize2 className="w-3 h-3" /> Fullscreen External Display
                                            </button>
                                        </div>

                                        {/* ── Music transport ─────────────────────────────── */}
                                        <div className="shrink-0 p-3 space-y-2 border-b border-white/07" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                            {platform?.currentTrackTitle && (
                                                <div className="text-[9px] font-bold text-white/50 truncate px-0.5">
                                                    {platform.currentTrackTitle}
                                                </div>
                                            )}
                                            {/* Transport buttons */}
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={platform ? platform.prev : () => {}}
                                                    className="w-7 h-7 flex items-center justify-center rounded-full bg-white/05 hover:bg-white/10 border border-white/08 transition-all"
                                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                                                >
                                                    <SkipBack className="w-3.5 h-3.5 text-white/60" />
                                                </button>
                                                <button
                                                    onClick={effTogglePlay}
                                                    className="w-9 h-9 flex items-center justify-center rounded-full transition-all"
                                                    style={{ background: audioState.isPlaying ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)', border: `1px solid ${audioState.isPlaying ? '#8b5cf6' : 'rgba(255,255,255,0.12)'}` }}
                                                >
                                                    {audioState.isPlaying
                                                        ? <Pause className="w-4 h-4 text-purple-300" />
                                                        : <Play  className="w-4 h-4 text-white/70" />}
                                                </button>
                                                <button
                                                    onClick={platform ? platform.next : () => {}}
                                                    className="w-7 h-7 flex items-center justify-center rounded-full transition-all"
                                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                                                >
                                                    <SkipForward className="w-3.5 h-3.5 text-white/60" />
                                                </button>
                                            </div>
                                            {/* Progress */}
                                            <input
                                                type="range" min="0" max={audioState.duration || 1} step="0.1"
                                                value={audioState.currentTime}
                                                onChange={e => effSeek(Number(e.target.value))}
                                                className="w-full cursor-pointer"
                                                style={{ accentColor: '#8b5cf6', height: 3 }}
                                            />
                                            {/* Volume */}
                                            <div className="flex items-center gap-2">
                                                {audioState.volume > 0
                                                    ? <Volume2 className="w-3 h-3 text-white/30 shrink-0" />
                                                    : <VolumeX className="w-3 h-3 text-white/30 shrink-0" />}
                                                <input
                                                    type="range" min="0" max="1" step="0.01"
                                                    value={audioState.volume}
                                                    onChange={e => effVolumeChange(Number(e.target.value))}
                                                    className="flex-1 cursor-pointer"
                                                    style={{ accentColor: '#8b5cf6', height: 3 }}
                                                />
                                            </div>
                                        </div>

                                        {/* ── Settings tabs (compact) ─────────────────────── */}
                                        <div className="shrink-0 flex overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', scrollbarWidth: 'none' }}>
                                            {(['core','colors','ambient','stage','text','ai','midi'] as const).map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => setActiveTab(t)}
                                                    className="flex-shrink-0 px-2 py-1.5 text-[8px] font-black uppercase tracking-wider transition-all border-b-2"
                                                    style={{
                                                        borderBottomColor: activeTab === t ? '#FF8C00' : 'transparent',
                                                        color: activeTab === t ? '#FF8C00' : 'rgba(255,255,255,0.35)',
                                                        background: 'transparent',
                                                    }}
                                                >
                                                    {t === 'ai' ? 'Clips' : t}
                                                </button>
                                            ))}
                                        </div>

                                        {/* ── Settings content (scrollable) ───────────────── */}
                                        <div className="flex-1 overflow-y-auto p-3 space-y-4" style={{ scrollbarWidth: 'thin' }}>

                                            {/* CORE */}
                                            {activeTab === 'core' && (
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="text-[9px] text-white/40 block mb-1 uppercase tracking-widest">Mode</label>
                                                        <select value={config.mode} onChange={e => setConfig(p => ({ ...p, mode: e.target.value as any }))}
                                                            className="w-full bg-black/60 border border-white/10 rounded p-1.5 text-white text-[10px] outline-none">
                                                            {Object.values(VisualizerMode).map(m => <option key={m} value={m} className="bg-zinc-900">{m}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Sensitivity</span><span className="text-[#FF8C00] font-mono">{config.sensitivity}x</span></div>
                                                        <input type="range" min="0.1" max="3.0" step="0.1" value={config.sensitivity} onChange={e => setConfig(p => ({ ...p, sensitivity: parseFloat(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Speed</span><span className="text-[#FF8C00] font-mono">{config.speed}x</span></div>
                                                        <input type="range" min="0.1" max="3.0" step="0.1" value={config.speed} onChange={e => setConfig(p => ({ ...p, speed: parseFloat(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Smoothing</span><span className="text-[#FF8C00] font-mono">{config.smoothingTimeConstant}</span></div>
                                                        <input type="range" min="0" max="0.95" step="0.05" value={config.smoothingTimeConstant} onChange={e => setConfig(p => ({ ...p, smoothingTimeConstant: parseFloat(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Glow</span><span className="text-[#FF8C00] font-mono">{config.glowIntensity}</span></div>
                                                        <input type="range" min="0" max="40" step="1" value={config.glowIntensity} onChange={e => setConfig(p => ({ ...p, glowIntensity: parseInt(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                    </div>
                                                    <div className="flex items-center justify-between text-[9px] text-white/40">
                                                        <span>Blur</span>
                                                        <input type="checkbox" checked={config.enableBlur} onChange={e => setConfig(p => ({ ...p, enableBlur: e.target.checked }))} className="accent-purple-500 cursor-pointer" />
                                                    </div>
                                                    {config.enableBlur && (
                                                        <div>
                                                            <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Blur strength</span><span className="text-[#FF8C00] font-mono">{config.blurStrength}</span></div>
                                                            <input type="range" min="0.1" max="2.0" step="0.1" value={config.blurStrength} onChange={e => setConfig(p => ({ ...p, blurStrength: parseFloat(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>FPS Target</span></div>
                                                        <div className="flex gap-1">
                                                            {[30, 60].map(fps => (
                                                                <button key={fps} onClick={() => setConfig(p => ({ ...p, targetFrameRate: fps as 30|60 }))}
                                                                    className="flex-1 py-1 rounded text-[9px] font-mono transition-all"
                                                                    style={{ background: config.targetFrameRate === fps ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)', border: `1px solid ${config.targetFrameRate === fps ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`, color: config.targetFrameRate === fps ? '#c084fc' : 'rgba(255,255,255,0.5)' }}>
                                                                    {fps}fps
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* COLORS */}
                                            {activeTab === 'colors' && (
                                                <div className="space-y-3">
                                                    <p className="text-[9px] text-white/40 uppercase tracking-widest">Palette</p>
                                                    <ColorPaletteEditor colors={config.colorPalette} onChange={colors => setConfig(p => ({ ...p, colorPalette: colors }))} />
                                                </div>
                                            )}

                                            {/* AMBIENT / FX */}
                                            {activeTab === 'ambient' && (
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between text-[9px] text-white/40">
                                                        <span>Blur</span>
                                                        <input type="checkbox" checked={config.enableBlur} onChange={e => setConfig(p => ({ ...p, enableBlur: e.target.checked }))} className="accent-purple-500 cursor-pointer" />
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Particles</span><span className="text-[#FF8C00] font-mono">{config.particleCount}</span></div>
                                                        <input type="range" min="10" max="300" step="10" value={config.particleCount} onChange={e => setConfig(p => ({ ...p, particleCount: parseInt(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Particle life</span><span className="text-[#FF8C00] font-mono">{config.particleLifespan}s</span></div>
                                                        <input type="range" min="0.5" max="5.0" step="0.1" value={config.particleLifespan} onChange={e => setConfig(p => ({ ...p, particleLifespan: parseFloat(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                    </div>
                                                    <div className="flex items-center justify-between text-[9px] text-white/40">
                                                        <span>Blend Overlay</span>
                                                        <input type="checkbox" checked={config.enableLayer2} onChange={e => setConfig(p => ({ ...p, enableLayer2: e.target.checked }))} className="accent-purple-500 cursor-pointer" />
                                                    </div>
                                                    {config.enableLayer2 && (
                                                        <div>
                                                            <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Overlay opacity</span><span className="text-[#FF8C00] font-mono">{config.layer2Opacity}</span></div>
                                                            <input type="range" min="0" max="1" step="0.05" value={config.layer2Opacity} onChange={e => setConfig(p => ({ ...p, layer2Opacity: parseFloat(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* STAGE */}
                                            {activeTab === 'stage' && (
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between text-[9px] text-white/40">
                                                        <span>Mirror slicing</span>
                                                        <input type="checkbox" checked={config.enableSlicing} onChange={e => setConfig(p => ({ ...p, enableSlicing: e.target.checked }))} className="accent-purple-500 cursor-pointer" />
                                                    </div>
                                                    {config.enableSlicing && (
                                                        <>
                                                            <div>
                                                                <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Slices</span><span className="text-[#FF8C00] font-mono">{config.sliceCount}</span></div>
                                                                <input type="range" min="2" max="24" step="1" value={config.sliceCount} onChange={e => setConfig(p => ({ ...p, sliceCount: parseInt(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                            </div>
                                                            <div>
                                                                <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Rotation</span><span className="text-[#FF8C00] font-mono">{config.sliceRotation}°</span></div>
                                                                <input type="range" min="0" max="360" step="5" value={config.sliceRotation} onChange={e => setConfig(p => ({ ...p, sliceRotation: parseInt(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                            </div>
                                                            <div>
                                                                <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Push</span><span className="text-[#FF8C00] font-mono">{((config.slicePush ?? 0) * 100).toFixed(0)}%</span></div>
                                                                <input type="range" min="0" max="1" step="0.01" value={config.slicePush ?? 0} onChange={e => setConfig(p => ({ ...p, slicePush: parseFloat(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                            </div>
                                                            {(config.slicePush ?? 0) > 0 && (
                                                                <div className="flex gap-3">
                                                                    <label className="flex items-center gap-1 text-[9px] text-white/40 cursor-pointer">
                                                                        <input type="checkbox" checked={config.slicePushMusicDriven ?? false} onChange={e => setConfig(p => ({ ...p, slicePushMusicDriven: e.target.checked }))} className="accent-purple-500" />
                                                                        Bass drive
                                                                    </label>
                                                                    <label className="flex items-center gap-1 text-[9px] text-white/40 cursor-pointer">
                                                                        <input type="checkbox" checked={config.slicePushOscDriven ?? false} onChange={e => setConfig(p => ({ ...p, slicePushOscDriven: e.target.checked }))} className="accent-purple-500" />
                                                                        LFO drive
                                                                    </label>
                                                                </div>
                                                            )}
                                                            {/* Rotation beat pattern */}
                                                            <div>
                                                                <div className="text-[8px] text-white/30 uppercase tracking-widest mb-1">Rotation snap</div>
                                                                <div className="flex gap-1">
                                                                    {(['off', '2', '4', '8', 'random'] as const).map(p => (
                                                                        <button
                                                                            key={p}
                                                                            onClick={() => setConfig(prev => ({ ...prev, sliceRotationBeatPattern: p === 'off' ? undefined : p }))}
                                                                            className="flex-1 py-0.5 rounded text-[7px] font-black uppercase transition-all"
                                                                            style={{
                                                                                background: (config.sliceRotationBeatPattern ?? 'off') === p ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.04)',
                                                                                border: (config.sliceRotationBeatPattern ?? 'off') === p ? '1px solid rgba(139,92,246,0.7)' : '1px solid rgba(255,255,255,0.08)',
                                                                                color: (config.sliceRotationBeatPattern ?? 'off') === p ? '#c084fc' : 'rgba(255,255,255,0.25)',
                                                                            }}
                                                                        >{p}</button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                    <div className="flex items-center justify-between text-[9px] text-white/40">
                                                        <span>Stage Lights</span>
                                                        <input type="checkbox" checked={config.enableBeams} onChange={e => setConfig(p => ({ ...p, enableBeams: e.target.checked }))} className="accent-purple-500 cursor-pointer" />
                                                    </div>
                                                    <div className="flex items-center justify-between text-[9px] text-white/40">
                                                        <span>3D Depth</span>
                                                        <input type="checkbox" checked={config.enable3dDepth ?? false} onChange={e => setConfig(p => ({ ...p, enable3dDepth: e.target.checked }))} className="accent-cyan-500 cursor-pointer" />
                                                    </div>
                                                    <div className="flex items-center justify-between text-[9px] text-white/40">
                                                        <span>Bass shake</span>
                                                        <input type="checkbox" checked={config.enableBassShake} onChange={e => setConfig(p => ({ ...p, enableBassShake: e.target.checked }))} className="accent-purple-500 cursor-pointer" />
                                                    </div>
                                                    {config.enableBassShake && (
                                                        <div>
                                                            <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Shake intensity</span><span className="text-[#FF8C00] font-mono">{config.bassShakeIntensity}</span></div>
                                                            <input type="range" min="0.1" max="3.0" step="0.1" value={config.bassShakeIntensity} onChange={e => setConfig(p => ({ ...p, bassShakeIntensity: parseFloat(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                        </div>
                                                    )}
                                                    <div className="flex items-center justify-between text-[9px] text-white/40">
                                                        <span>Lighting</span>
                                                        <input type="checkbox" checked={config.enableLighting} onChange={e => setConfig(p => ({ ...p, enableLighting: e.target.checked }))} className="accent-purple-500 cursor-pointer" />
                                                    </div>
                                                </div>
                                            )}

                                            {/* TEXT */}
                                            {activeTab === 'text' && (
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between text-[9px] text-white/40">
                                                        <span>Text overlay</span>
                                                        <input type="checkbox" checked={config.enableText} onChange={e => setConfig(p => ({ ...p, enableText: e.target.checked }))} className="accent-purple-500 cursor-pointer" />
                                                    </div>
                                                    {config.enableText && (
                                                        <>
                                                            <input type="text" value={config.textContent} onChange={e => setConfig(p => ({ ...p, textContent: e.target.value }))} placeholder="Display text…" className="w-full bg-black/50 border border-white/10 rounded p-1.5 text-white text-[10px] outline-none" />
                                                            <div>
                                                                <div className="flex justify-between text-[9px] text-white/40 mb-1"><span>Size</span><span className="text-[#FF8C00] font-mono">{config.textSize}px</span></div>
                                                                <input type="range" min="40" max="240" step="4" value={config.textSize} onChange={e => setConfig(p => ({ ...p, textSize: parseInt(e.target.value) }))} className="w-full cursor-pointer" style={{ accentColor: '#8b5cf6', height: 3 }} />
                                                            </div>
                                                            <div className="flex items-center justify-between text-[9px] text-white/40">
                                                                <span>Captions</span>
                                                                <input type="checkbox" checked={config.enableCaptions} onChange={e => setConfig(p => ({ ...p, enableCaptions: e.target.checked }))} className="accent-purple-500 cursor-pointer" />
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            {/* AI */}
                                            {activeTab === 'ai' && (
                                                <div className="space-y-3">
                                                    <p className="text-[9px] text-white/40 uppercase tracking-widest">AI & Project</p>
                                                    <div className="flex gap-2">
                                                        <button onClick={handleSaveProject} disabled={isSaving}
                                                            className="flex-1 py-1.5 rounded text-[9px] font-bold transition-all"
                                                            style={{ background: saveSuccess ? 'rgba(16,185,129,0.3)' : 'rgba(139,92,246,0.3)', border: `1px solid ${saveSuccess ? '#10b981' : '#8b5cf6'}`, color: saveSuccess ? '#6ee7b7' : '#c084fc' }}>
                                                            {saveSuccess ? '✓ Saved' : isSaving ? '…' : 'Save Project'}
                                                        </button>
                                                        <label className="flex-1 cursor-pointer">
                                                            <input type="file" accept=".plajah" onChange={handleLoadProject} className="hidden" />
                                                            <div className="w-full py-1.5 rounded text-[9px] font-bold text-center transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>Load</div>
                                                        </label>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-[9px] text-white/40 uppercase tracking-widest">BG Layer 1</p>
                                                        <label className="block cursor-pointer">
                                                            <input type="file" accept="image/*,video/mp4" onChange={e => handleBgUpload(e, 1)} className="hidden" />
                                                            <div className="py-1.5 rounded text-[9px] font-bold text-center transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>+ Add BG file</div>
                                                        </label>
                                                        {bgMedia1.length > 0 && (
                                                            <button onClick={() => setBgMedia1([])} className="w-full py-1 rounded text-[9px] text-red-400 transition-all" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>Clear ({bgMedia1.length})</button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* MIDI */}
                                            {activeTab === 'midi' && (
                                                <MidiController
                                                    config={config}
                                                    setConfig={setConfig}
                                                    audioContextRef={audioContextRef}
                                                    analyserRef={analyserRef}
                                                    audioElRef={audioElRef}
                                                    sourceRef={sourceRef}
                                                />
                                            )}

                                            {/* Open full settings link */}
                                            <button
                                                onClick={() => setIsSettingsOpen(v => !v)}
                                                className="w-full py-2 mt-1 rounded text-[9px] font-black uppercase tracking-widest transition-all"
                                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }}
                                            >
                                                {isSettingsOpen ? '✕ Close' : '⚙ Full Settings'}
                                            </button>
                                        </div>
                                    </div>
                                }
                            />
                        </div>

                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Output Area: all canvas layers + UI panels + toolbar ─── */}
            {/* order:1 = renders visually above the clip launcher (order:2) */}
            <div className="relative min-h-0 overflow-hidden" style={{ order: 1, flex: 1, contain: 'strict' }}>

            {/* ─── Custom GLSL shader editor — draggable, pinnable ─── */}
            {showShaderPanel && !uiHidden && (
                <DraggablePanel
                    id="shaderpanel"
                    defaultPos={{ x: (typeof window !== 'undefined' ? window.innerWidth : 1280) - 372, y: 96 }}
                    zIndex={37}
                    label="Shader"
                    onClose={() => setShowShaderPanel(false)}
                >
                    <ShaderPanel
                        active={!!shaderSrc}
                        error={shaderError}
                        onApply={applyShaderLook}
                        onOff={() => { setShaderSrc(null); setShaderError(null); }}
                    />
                </DraggablePanel>
            )}

            {/* ─── 3D panel — scene / day-night / camera presets ─── */}
            {/* ─── 3D Scene Panel — fixed right-side slide-in (always on top) ─── */}
            <AnimatePresence>
                {showThreePanel && !uiHidden && (
                    <motion.div
                        key="three-panel"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                        className="fixed top-0 right-0 h-full flex flex-col"
                        style={{ width: 280, zIndex: 300, background: 'rgba(6,6,16,0.97)', backdropFilter: 'blur(24px)', borderLeft: '1px solid rgba(14,165,233,0.2)', boxShadow: '-8px 0 40px rgba(0,0,0,0.7)' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-3 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(14,165,233,0.15)' }}>
                            <div className="flex items-center gap-2">
                                <Box className="w-3.5 h-3.5 text-sky-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/70">3D Scenes</span>
                            </div>
                            <button onClick={() => setShowThreePanel(false)} className="w-6 h-6 flex items-center justify-center rounded text-white/30 hover:text-white hover:bg-white/10 transition-all">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-none">
                            {/* Enable / disable 3D */}
                            <button
                                onClick={() => setThree3d(c => {
                                    if (c) return null;
                                    setShaderSrc(null); setMilkdrop(false); setMidiNotes(false);
                                    return { scene: 'water', variant: 'night', camera: 'orbit-slow' };
                                })}
                                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${three3d ? 'bg-sky-600/40 border-sky-400/50 text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-sky-600/20 hover:border-sky-500/30 hover:text-white'}`}
                            >
                                <Box className="w-4 h-4" /> {three3d ? '3D Active — Click to Exit' : 'Enter 3D Mode'}
                            </button>

                            {/* Scene picker */}
                            <div>
                                <p className="text-[8px] font-black uppercase tracking-widest mb-2" style={{ color: 'rgba(14,165,233,0.6)' }}>Scene</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {([['water', 'Water 🌊', 'Reflective ocean with album art float'], ['forest', 'Forest 🌲', 'Trees react to audio beats']] as const).map(([s, label, desc]) => (
                                        <button key={s}
                                            onClick={() => {
                                                if (!three3d) { setShaderSrc(null); setMilkdrop(false); setMidiNotes(false); }
                                                setThree3d(c => c ? { ...c, scene: s } : { scene: s, variant: 'night', camera: 'orbit-slow' });
                                            }}
                                            className="flex flex-col items-center gap-1 p-3 rounded-xl border transition-all text-left"
                                            style={{
                                                background: three3d?.scene === s ? 'rgba(14,165,233,0.2)' : 'rgba(255,255,255,0.03)',
                                                border: three3d?.scene === s ? '1px solid rgba(14,165,233,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                                color: three3d?.scene === s ? '#fff' : 'rgba(255,255,255,0.55)',
                                            }}
                                        >
                                            <span className="text-[10px] font-black uppercase tracking-wide w-full">{label}</span>
                                            <span className="text-[7px] text-white/30 leading-snug w-full">{desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Variant (water only) */}
                            {(three3d?.scene === 'water' || !three3d) && (
                                <div>
                                    <p className="text-[8px] font-black uppercase tracking-widest mb-2" style={{ color: 'rgba(14,165,233,0.6)' }}>Time of Day</p>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {([['day', '☀️ Day'], ['night', '🌙 Night'], ['park', '🎡 Park']] as const).map(([v, label]) => (
                                            <button key={v}
                                                onClick={() => setThree3d(c => c ? { ...c, variant: v } : { scene: 'water', variant: v, camera: 'orbit-slow' })}
                                                className="py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all"
                                                style={{
                                                    background: three3d?.variant === v ? 'rgba(14,165,233,0.2)' : 'rgba(255,255,255,0.03)',
                                                    border: three3d?.variant === v ? '1px solid rgba(14,165,233,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                                    color: three3d?.variant === v ? '#7dd3fc' : 'rgba(255,255,255,0.45)',
                                                }}
                                            >{label}</button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Camera */}
                            <div>
                                <p className="text-[8px] font-black uppercase tracking-widest mb-2" style={{ color: 'rgba(14,165,233,0.6)' }}>Camera</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {([['orbit-slow', '🔄 Slow Orbit'], ['orbit-fast', '⚡ Fast Orbit'], ['dolly', '🎬 Dolly'], ['static', '📷 Static']] as const).map(([cam, label]) => (
                                        <button key={cam}
                                            onClick={() => setThree3d(c => c ? { ...c, camera: cam } : { scene: 'water', variant: 'night', camera: cam })}
                                            className="py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all"
                                            style={{
                                                background: three3d?.camera === cam ? 'rgba(14,165,233,0.2)' : 'rgba(255,255,255,0.03)',
                                                border: three3d?.camera === cam ? '1px solid rgba(14,165,233,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                                color: three3d?.camera === cam ? '#7dd3fc' : 'rgba(255,255,255,0.45)',
                                            }}
                                        >{label}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Info */}
                            <p className="text-[7px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.2)' }}>
                                Drag canvas to orbit · Scroll to zoom · Scene reacts to live audio.{'\n'}
                                {three3d?.scene === 'water'
                                    ? 'Album art floats on the water and reflects. Waves & splashes pulse to the beat.'
                                    : 'Trees sway with the song. Ground pulses on kicks. Highs shift leaf color.'}
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Overlay layers panel (Lottie + HTML) — draggable, pinnable ─── */}
            {showLayersPanel && !uiHidden && (
                <DraggablePanel
                    id="layerspanel"
                    defaultPos={{ x: (typeof window !== 'undefined' ? window.innerWidth : 1280) - 332, y: 96 }}
                    zIndex={38}
                    label="Layers"
                    onClose={() => setShowLayersPanel(false)}
                >
                    <LayersPanel state={overlayState} />
                </DraggablePanel>
            )}

            {/* ── The real composite: the full ordered clip-launcher layer stack ──
                Every active layer of the column renders at once, stacked top-of-list
                foremost, with per-row opacity × per-clip opacity and the row's blend
                mode. Clear a clip → that row renders nothing. Replaces the old
                bgMedia1/bgMedia2 backdrop + single-core pipeline entirely. */}
            <div ref={depthBgRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
              <LayerStack layers={liveLayers} analyser={analyserRef.current} config={config} isPlaying={audioState.isPlaying} />
            </div>

            {/* Keep every launcher media clip decoded + buffered so firing a
                column swaps instantly and holds 60fps (no first-frame stall). */}
            <MediaPreloader layers={liveLayers} />

            {/* ── Depth plane: VIZ midground ── */}
            <div ref={depthVizRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>

            {/* EXPLICIT global override modes (toolbar toggles) — composited ON TOP
                of the LayerStack only when the user turns one on. Default off → the
                LayerStack IS the program output. Firing clips never activates these
                (the launcher's render bridges are no-ops now). */}
            {three3d ? (
                <ThreeScene
                    analyser={analyserRef.current}
                    config={three3d}
                    albumUrl={platform?.mediaImages?.[0]}
                    palette={config.colorPalette}
                />
            ) : analyserRef.current && (
                <>
                    {shaderSrc && (
                        <ShaderLayer analyser={analyserRef.current} source={shaderSrc} startTimeMs={shaderStart} onError={setShaderError} />
                    )}
                    {midiNotes && <MidiNotesScene palette={config.colorPalette} />}
                    {milkdrop && (
                        <ButterchurnLayer
                            analyser={analyserRef.current}
                            presetIndex={milkdropIdx}
                            blendMode={milkdropBlendMode}
                            layerOpacity={milkdropLayerOpacity}
                            onMeta={setMilkdropMeta}
                            onThumbnail={(name, url) => setMilkdropThumbnails(prev => ({ ...prev, [name]: url }))}
                        />
                    )}
                </>
            )}

            {/* Keyable media / matte layer (luma · chroma · AI) */}
            <MatteLayer
                id="matte-layer"
                analyser={analyserRef.current}
                engine={matteEngineRef.current!}
                settings={matteSettings}
            />

            </div>{/* end depthVizRef */}

            {/* ── Depth plane: foreground overlays (closest to camera) ── */}
            <div ref={depthFgRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>

            {/* Accent Overlays */}
            <GlobalLighting id="global-lighting" config={config} analyser={analyserRef.current} isPlaying={audioState.isPlaying} />

            {/* Post-processing effects overlay — covers ShaderLayer / ButterchurnLayer / 3D modes
                where the per-canvas effect pipeline (AudioVisualizer, StudioStage) can't reach */}
            <PostProcessLayer analyser={analyserRef.current} config={config} />

            <TextOverlay id="text-overlay" config={config} analyser={analyserRef.current} isPlaying={audioState.isPlaying} />
            <CaptionsOverlay id="captions-overlay" config={config} analyser={analyserRef.current} isPlaying={audioState.isPlaying} audioRef={platform ? (platformTimeRef as any) : audioElRef} />

            {/* User-loadable overlay layers (composite on top of the core visual) */}
            {overlay.htmlOn && overlay.htmlUrl && <HtmlLayer src={overlay.htmlUrl} opacity={overlay.htmlOpacity} interactive={overlay.htmlInteractive} />}
            {overlay.lottieOn && overlay.lottieUrl && <LottieLayer src={overlay.lottieUrl} opacity={overlay.lottieOpacity} />}

            </div>{/* end depthFgRef */}

            {/* Auto-segmentation engine — generates FG/BG masks when depth+segmentation is on */}
            {config.enable3dDepth && config.enableSegmentation && (
                <SegmentationLayer
                    sourceSelector="#px-bg"
                    useMediaPipe
                    interval={100}
                    luminanceThreshold={0.52}
                />
            )}

            {/* Performance HUD */}
            {showFps && !uiHidden && <FpsMeter />}

            {/* MIDI Status Floating HUD */}
            {!uiHidden && <MidiStatusHud config={config} />}

            {/* ─── Preview / Program (A/B) inset — audition a 2D/GLSL look ─── */}
            {previewOn && !uiHidden && (
                <div className="fixed z-[210] w-[340px] max-w-[80vw] rounded-2xl overflow-hidden border border-amber-500/30 shadow-2xl"
                    style={{ top: 64, right: 16, background: 'rgba(6,6,14,0.95)', backdropFilter: 'blur(20px)' }}>
                    <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/10">
                        <span className="text-[9px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5"><Tv className="w-3 h-3" /> Preview</span>
                        <div className="flex items-center gap-1.5">
                            <div className="flex items-center rounded-md bg-white/[0.06] p-0.5" title="Send panel edits to the Preview or the live Program">
                                <button onClick={() => setEditTarget('preview')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${editTarget === 'preview' ? 'bg-amber-500/40 text-white' : 'text-white/40'}`}>Stage</button>
                                <button onClick={() => setEditTarget('program')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${editTarget === 'program' ? 'bg-white/15 text-white' : 'text-white/40'}`}>Live</button>
                            </div>
                            <button onClick={() => { setPreviewOn(false); setEditTarget('program'); }} className="w-5 h-5 flex items-center justify-center rounded text-white/40 hover:text-white transition-colors"><X className="w-3 h-3" /></button>
                        </div>
                    </div>
                    <div className="relative w-full bg-black" style={{ height: 180 }}>
                        {analyserRef.current ? (
                            previewKind === 'shader' && previewShader
                                ? <ShaderLayer analyser={analyserRef.current} source={previewShader} startTimeMs={previewShaderStartRef.current} onError={() => { }} />
                                : isStudioMode(previewConfig.mode)
                                    ? <StudioStage analyser={analyserRef.current} config={previewConfig} isPlaying={audioState.isPlaying} />
                                    : <AudioVisualizer analyser={analyserRef.current} config={previewConfig} isPlaying={audioState.isPlaying} hasBackground={false} />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[9px] text-white/30">Play audio to preview</div>
                        )}
                    </div>
                    <button onClick={takeToProgram} className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500/30 hover:bg-amber-500/50 text-[10px] font-black uppercase tracking-widest text-white transition-all">
                        Take to Program <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Scenes rail + NL timeline now live inside the bottom deck (above
                and below the clip launcher). Only the matte panel floats here. */}
            <MattePanel
                engine={matteEngineRef.current!}
                settings={matteSettings}
                setSettings={setMatteSettings}
                visible={showMatte && !uiHidden}
                onClose={() => setShowMatte(false)}
            />

            {/* Floating Top Header */}
            <div id="title-header" className={`absolute top-6 left-6 z-20 flex items-center space-x-3 pointer-events-none ${uiHidden ? 'hidden' : ''}`}>
                <div className="w-10 h-10 bg-[#FF8C00]/25 backdrop-blur-xl border border-[#FF8C00]/40 rounded-full flex items-center justify-center animate-spin-slow">
                    <Music className="w-5 h-5 text-[#FF8C00]" />
                </div>
                <div>
                    <h1 className="text-lg font-semibold tracking-wider font-sans uppercase bg-gradient-to-r from-[#FF8C00] via-fuchsia-500 to-purple-500 bg-clip-text text-transparent">
                        Plajah Pixels
                    </h1>
                    <p className="text-[10px] text-white/40 font-mono tracking-widest">{config.name} — Mode: {config.mode}</p>
                </div>
            </div>

            {/* Save / Load Project Buttons (top-right, beside settings toggle) */}
            <div className={`absolute top-6 right-20 z-30 flex items-center gap-2 ${uiHidden ? 'hidden' : ''}`}>
                {/* ── Output: record · send to display · fullscreen · dismiss UI ── */}
                <button onClick={toggleRecord} title={isRecording ? 'Stop recording' : 'Record live output — high-bitrate MP4 (H.265/H.264) · pristine audio'}
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${isRecording ? 'bg-red-500/40 border-red-500/60 animate-pulse' : 'bg-black/40 border-white/10 hover:bg-red-500/30'}`}>
                    <Circle className="w-4 h-4" fill={isRecording ? 'currentColor' : 'none'} style={{ color: isRecording ? '#fca5a5' : 'rgba(255,255,255,0.8)' }} />
                </button>
                {/* Program Output — quick launch (full controls in right panel when clip launcher is open) */}
                <button
                    onClick={openProgramOut}
                    title="Program Output — open visualizer on a second display"
                    className="w-9 h-9 backdrop-blur-xl border border-white/10 bg-black/40 hover:bg-sky-600/30 rounded-full flex items-center justify-center transition-all shadow-lg">
                    <Monitor className="w-4 h-4 text-white/80" />
                </button>
                <button onClick={() => enterFullscreen()} title="Fullscreen"
                    className="w-9 h-9 bg-black/40 hover:bg-white/15 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center transition-all shadow-lg">
                    <Maximize2 className="w-4 h-4 text-white/80" />
                </button>
                <button onClick={() => setUiHidden(true)} title="Dismiss UI (full-screen visual)"
                    className="w-9 h-9 bg-black/40 hover:bg-white/15 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center transition-all shadow-lg">
                    <EyeOff className="w-4 h-4 text-white/80" />
                </button>
                <button onClick={openPreview} title="Preview / Program (A/B) — audition a look before going live"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${previewOn ? 'bg-amber-500/40 border-amber-500/60' : 'bg-black/40 border-white/10 hover:bg-amber-500/30'}`}>
                    <Tv className="w-4 h-4 text-white/80" />
                </button>
                <div className="w-px h-5 bg-white/10 mx-0.5" />
                {/* Studio: clip-launcher grid toggle (Resolume-style cells) */}
                <button onClick={() => setShowClipGrid(v => !v)} title="Toggle clip grid (launch scenes, palettes, captured looks)"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${showClipGrid ? 'bg-[#FF8C00]/35 border-[#FF8C00]/55' : 'bg-black/40 border-white/10 hover:bg-[#FF8C00]/20'}`}>
                    <Grid3x3 className="w-4 h-4 text-white/80" />
                </button>
                {/* Studio: custom GLSL shader editor toggle */}
                <button onClick={() => setShowShaderPanel(v => !v)} title="Custom GLSL shader (Shadertoy-style)"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${showShaderPanel || shaderSrc ? 'bg-cyan-600/40 border-cyan-500/50' : 'bg-black/40 border-white/10 hover:bg-cyan-600/30'}`}>
                    <Cpu className="w-4 h-4 text-white/80" />
                </button>
                {/* Studio: 3D mode (React Three Fiber) */}
                <button onClick={() => setShowThreePanel(v => !v)} title="3D visualizers (water, reflections, orbiting camera)"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${showThreePanel || three3d ? 'bg-sky-600/40 border-sky-500/50' : 'bg-black/40 border-white/10 hover:bg-sky-600/30'}`}>
                    <Box className="w-4 h-4 text-white/80" />
                </button>
                {/* Studio: Synthesia-style MIDI falling-notes scene */}
                <button onClick={() => setMidiNotes(v => { const n = !v; if (n) { setShaderSrc(null); setMilkdrop(false); setThree3d(null); } return n; })} title="MIDI notes (Synthesia-style falling notes)"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${midiNotes ? 'bg-[#FF8C00]/35 border-[#FF8C00]/55' : 'bg-black/40 border-white/10 hover:bg-[#FF8C00]/20'}`}>
                    <Piano className="w-4 h-4 text-white/80" />
                </button>
                {/* Studio: overlay layers (Lottie + HTML/URL) */}
                <button onClick={() => setShowLayersPanel(v => !v)} title="Overlay layers (Lottie / HTML)"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${showLayersPanel || overlay.lottieOn || overlay.htmlOn ? 'bg-pink-600/40 border-pink-500/50' : 'bg-black/40 border-white/10 hover:bg-pink-600/30'}`}>
                    <Layers2 className="w-4 h-4 text-white/80" />
                </button>
                {/* Studio: performance mode + FPS */}
                <button onClick={togglePerfMode} title="Performance mode (more FPS under load)"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${perfMode ? 'bg-green-600/40 border-green-500/50' : 'bg-black/40 border-white/10 hover:bg-green-600/30'}`}>
                    <Gauge className="w-4 h-4 text-white/80" />
                </button>
                <button onClick={() => setShowFps(v => !v)} title="Toggle FPS meter"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${showFps ? 'bg-white/20 border-white/30' : 'bg-black/40 border-white/10 hover:bg-white/10'}`}>
                    <Activity className="w-4 h-4 text-white/80" />
                </button>
                {/* Studio: scene rail toggle */}
                <button onClick={() => setShowRail(v => !v)} title="Toggle scene rail"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${showRail ? 'bg-[#FF8C00]/35 border-[#FF8C00]/55' : 'bg-black/40 border-white/10 hover:bg-[#FF8C00]/20'}`}>
                    <Layers className="w-4 h-4 text-white/80" />
                </button>
                {/* Studio: timeline toggle */}
                <button onClick={() => setShowTimeline(v => !v)} title="Toggle natural-language timeline"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${showTimeline ? 'bg-[#FF8C00]/35 border-[#FF8C00]/55' : 'bg-black/40 border-white/10 hover:bg-[#FF8C00]/20'}`}>
                    <Radio className="w-4 h-4 text-white/80" />
                </button>
                {/* Studio: matte panel toggle */}
                <button onClick={() => setShowMatte(v => !v)} title="Toggle media / matte layer"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${showMatte ? 'bg-pink-600/40 border-pink-500/50' : 'bg-black/40 border-white/10 hover:bg-pink-600/30'}`}>
                    <Video className="w-4 h-4 text-white/80" />
                </button>

                {/* Save Project */}
                <button
                    onClick={handleSaveProject}
                    disabled={isSaving}
                    title="Save Project (.plajah)"
                    className="w-9 h-9 bg-black/40 hover:bg-purple-600/40 backdrop-blur-xl border border-white/10 hover:border-purple-500/50 rounded-full flex items-center justify-center transition-all shadow-lg disabled:opacity-50"
                >
                    {saveSuccess
                        ? <CheckCircle className="w-4 h-4 text-green-400" />
                        : <Save className={`w-4 h-4 ${isSaving ? 'text-purple-300 animate-pulse' : 'text-white/70'}`} />
                    }
                </button>

                {/* Load Project (local file) */}
                <label title="Load Project (.plajah)" className="w-9 h-9 bg-black/40 hover:bg-pink-600/30 backdrop-blur-xl border border-white/10 hover:border-pink-500/50 rounded-full flex items-center justify-center transition-all shadow-lg cursor-pointer">
                    <FolderOpen className="w-4 h-4 text-white/70" />
                    <input type="file" accept=".plajah" onChange={handleLoadProject} className="hidden" />
                </label>

                {/* Cloud Projects — only shown when signed in */}
                {auth.currentUser && (
                    <button
                        onClick={handleOpenCloudProjects}
                        title="My Cloud Projects — open a saved project from your Plajah profile"
                        className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${showCloudProjects ? 'bg-sky-600/40 border-sky-400/60' : 'bg-black/40 border-white/10 hover:bg-sky-600/30'}`}
                    >
                        <Download className="w-4 h-4 text-white/70" />
                    </button>
                )}
            </div>

            {/* Cloud Projects Modal */}
            <AnimatePresence>
                {showCloudProjects && (
                    <motion.div
                        key="cloud-projects-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[400] flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
                        onClick={() => setShowCloudProjects(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="w-[480px] max-w-[92vw] max-h-[70vh] flex flex-col rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
                            style={{ background: 'rgba(6,6,18,0.98)', backdropFilter: 'blur(32px)' }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-white/08" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-widest text-white/80">My Cloud Projects</p>
                                    <p className="text-[9px] text-white/30 mt-0.5">Saved to your Plajah profile · {auth.currentUser?.displayName || auth.currentUser?.email || 'You'}</p>
                                </div>
                                <button onClick={() => setShowCloudProjects(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-none">
                                {cloudProjectsLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-5 h-5 text-[#FF8C00] animate-spin" />
                                        <span className="text-[10px] text-white/40 ml-2">Loading projects…</span>
                                    </div>
                                ) : cloudProjects.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-white/25">
                                        <FolderOpen className="w-8 h-8 mb-2" />
                                        <p className="text-[10px] font-black uppercase tracking-widest">No cloud projects yet</p>
                                        <p className="text-[9px] mt-1">Save a project to see it here</p>
                                    </div>
                                ) : cloudProjects.map(p => (
                                    <div key={p.id}
                                        className="flex items-center gap-3 p-3 rounded-xl border border-white/06 hover:border-white/15 hover:bg-white/04 transition-all group cursor-pointer"
                                        onClick={() => handleLoadCloudProject(p.id)}
                                    >
                                        {/* Thumbnail */}
                                        <div className="w-14 h-10 rounded-lg overflow-hidden shrink-0 bg-black/40">
                                            {p.thumbnail
                                                ? <img src={p.thumbnail} className="w-full h-full object-cover" alt="" />
                                                : <div className="w-full h-full flex items-center justify-center"><Sparkles className="w-4 h-4 text-[#FF8C00]/50" /></div>
                                            }
                                        </div>
                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black text-white truncate">{p.projectName}</p>
                                            <p className="text-[8px] text-white/35 mt-0.5">
                                                {p.mode && <span className="uppercase tracking-widest mr-1.5">{p.mode}</span>}
                                                {p.savedAt && new Date(p.savedAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                        {/* Delete */}
                                        <button
                                            onClick={e => { e.stopPropagation(); handleDeleteCloudProject(p.id); }}
                                            className="w-6 h-6 flex items-center justify-center rounded text-white/20 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Footer */}
                            <div className="px-4 py-3 border-t border-white/06" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <label className="flex items-center gap-2 text-[9px] text-white/30 hover:text-white/60 cursor-pointer transition-colors">
                                    <FolderOpen className="w-3.5 h-3.5" />
                                    Load from local .plajah file instead
                                    <input type="file" accept=".plajah" onChange={e => { handleLoadProject(e); setShowCloudProjects(false); }} className="hidden" />
                                </label>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Trigger Button: Settings Panel */}
            <button 
                id="toggle-settings-btn"
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`absolute top-6 right-6 z-30 w-11 h-11 bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center hover:scale-105 transition-all text-white hover:border-[#FF8C00]/40 shadow-xl ${uiHidden ? 'hidden' : ''}`}
                title="Toggle Configuration Panel"
            >
                {isSettingsOpen ? <X className="w-5 h-5 text-[#FF8C00]" /> : <Sliders className="w-5 h-5" />}
            </button>

            {/* Floating Control Center Dock — draggable + pinnable + persisted */}
            {!uiHidden && <DraggablePanel
                id="controls-dock"
                defaultPos={{
                    x: Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 1280) / 2 - 360),
                    y: (typeof window !== 'undefined' ? window.innerHeight : 720) - 128,
                }}
                zIndex={30}
                label="Transport"
            >
                <div className="bg-black/40 backdrop-blur-2xl border border-white/10 border-t-0 rounded-b-2xl p-4 flex items-center justify-between gap-4 shadow-2xl w-[720px] max-w-[92vw]">
                    <Controls
                        audioState={audioState}
                        onTogglePlay={effTogglePlay}
                        onUpload={handleUpload}
                        onVolumeChange={effVolumeChange}
                        isRecording={isRecording}
                        onToggleRecord={toggleRecord}
                        hideUpload={!!platform}
                        slaved={!!platform}
                        onSeek={effSeek}
                        onPrev={platform ? platform.prev : undefined}
                        onNext={platform ? platform.next : undefined}
                    />
                    {/* Gemini theme generator disabled in the UI for now (code retained
                        in ./components/ThemeGenerator and the import below). To re-enable,
                        restore: <ThemeGenerator onThemeGenerated={c => setConfig(prev => ({ ...prev, ...c }))} currentConfigName={config.name} /> */}
                </div>
            </DraggablePanel>}

            {/* Restore UI pill (shown only when the UI is dismissed) */}
            {uiHidden && (
                <button onClick={() => setUiHidden(false)} title="Show controls"
                    className="fixed top-3 left-3 z-[300] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-xl border border-white/15 text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
                    <Eye className="w-3.5 h-3.5" /> Show UI
                </button>
            )}

            {/* ─── Recording Save Modal ──────────────────────────────────────────── */}
            <AnimatePresence>
                {showSaveModal && recordedBlob && (
                    <motion.div
                        key="save-modal-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[400] flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
                        onClick={e => { if (e.target === e.currentTarget) handleDismissSaveModal(); }}
                    >
                        <motion.div
                            key="save-modal"
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', damping: 24, stiffness: 220 }}
                            className="relative w-[380px] max-w-[92vw] rounded-2xl overflow-hidden shadow-2xl"
                            style={{
                                background: 'rgba(8,4,24,0.96)',
                                border: '1px solid rgba(139,92,246,0.35)',
                                boxShadow: '0 0 60px rgba(139,92,246,0.2), 0 0 0 1px rgba(139,92,246,0.15)',
                            }}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-4"
                                style={{ borderBottom: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.08)' }}>
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-[#FF8C00]/25 border border-[#FF8C00]/40 flex items-center justify-center">
                                        <Circle className="w-4 h-4 text-purple-300 fill-red-500" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-widest text-white">Recording Complete</p>
                                        <p className="text-[9px] text-white/40 mt-0.5">
                                            {recordedBlob.type.includes('mp4') ? 'MP4' : 'WebM'} · {(recordedBlob.size / 1024 / 1024).toFixed(1)} MB
                                        </p>
                                    </div>
                                </div>
                                <button onClick={handleDismissSaveModal}
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Actions */}
                            <div className="p-5 space-y-3">
                                {/* Download */}
                                <button
                                    onClick={handleDownloadRecording}
                                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all group"
                                    style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                                >
                                    <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                                        <Download className="w-4 h-4 text-white/80" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-[11px] font-black text-white">
                                            Download {recordedBlob.type.includes('mp4') ? 'MP4' : 'WebM'}
                                        </p>
                                        <p className="text-[9px] text-white/40 mt-0.5">Save to your device</p>
                                    </div>
                                </button>

                                {/* Send to Reello — only when signed in */}
                                {auth.currentUser && (
                                    <button
                                        onClick={handleSendToReello}
                                        disabled={reelloSending || reelloSuccess}
                                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all disabled:opacity-70"
                                        style={{
                                            background: reelloSuccess ? 'rgba(16,185,129,0.15)' : 'rgba(139,92,246,0.15)',
                                            border: reelloSuccess ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(139,92,246,0.4)',
                                        }}
                                    >
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                            style={{ background: reelloSuccess ? 'rgba(16,185,129,0.25)' : 'rgba(139,92,246,0.25)' }}>
                                            {reelloSending
                                                ? <Loader2 className="w-4 h-4 text-purple-300 animate-spin" />
                                                : reelloSuccess
                                                ? <CheckCircle className="w-4 h-4 text-green-400" />
                                                : <Send className="w-4 h-4 text-purple-300" />
                                            }
                                        </div>
                                        <div className="text-left flex-1 min-w-0">
                                            <p className="text-[11px] font-black text-white">
                                                {reelloSuccess ? 'Sent to Reello!' : 'Send to Reello'}
                                            </p>
                                            <p className="text-[9px] text-white/40 mt-0.5">
                                                {reelloSuccess
                                                    ? 'Published to your Plajah Pixels playlist'
                                                    : `Publish as ${auth.currentUser.displayName || 'your'} Plajah Pixels`
                                                }
                                            </p>
                                        </div>
                                        {/* Progress bar */}
                                        {reelloSending && reelloProgress > 0 && (
                                            <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden shrink-0">
                                                <div className="h-full bg-purple-400 rounded-full transition-all"
                                                    style={{ width: `${reelloProgress}%` }} />
                                            </div>
                                        )}
                                    </button>
                                )}

                                {/* Discard */}
                                <button
                                    onClick={handleDismissSaveModal}
                                    className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
                                >
                                    Discard Recording
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Sliding Tabbed Configuration Drawer (Glassmorphism) */}
            <AnimatePresence>
                {isSettingsOpen && !uiHidden && (
                    <motion.div 
                        id="settings-drawer"
                        initial={{ x: "100%", opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "100%", opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 180 }}
                        className="absolute top-0 right-0 h-full w-96 bg-black/75 backdrop-blur-3xl border-l border-white/10 z-20 flex flex-col shadow-2xl overflow-hidden text-sm"
                    >
                        {/* Drawer Header */}
                        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-black/20">
                            <div>
                                <h2 className="font-semibold text-white tracking-wide">Audio-Reactive Controls</h2>
                                <p className="text-xs text-white/40">Fine-tune visual parameters & layers</p>
                            </div>
                        </div>

                        {/* Drawer Navigation Tabs */}
                        <div className="flex bg-white/5 border-b border-white/10 overflow-x-auto text-[11px] font-mono scrollbar-none">
                            <button
                                onClick={() => setActiveTab('core')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'core' ? 'border-purple-500 text-[#FF8C00] font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Cpu className="w-3.5 h-3.5" />
                                <span>Core</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('colors')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'colors' ? 'border-purple-500 text-[#FF8C00] font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Palette</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('ambient')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'ambient' ? 'border-purple-500 text-[#FF8C00] font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Layers className="w-3.5 h-3.5" />
                                <span>FX</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('stage')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'stage' ? 'border-purple-500 text-[#FF8C00] font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Layers2 className="w-3.5 h-3.5" />
                                <span>Stage</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('text')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'text' ? 'border-purple-500 text-[#FF8C00] font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Type className="w-3.5 h-3.5" />
                                <span>Chat</span>
                            </button>
                             <button
                                onClick={() => setActiveTab('ai')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'ai' ? 'border-[#FF8C00] text-[#FF8C00] font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Grid3x3 className="w-3.5 h-3.5" />
                                <span>Clips</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('midi')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'midi' ? 'border-purple-500 text-[#FF8C00] font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Radio className="w-3.5 h-3.5" />
                                <span>MIDI</span>
                            </button>
                            {/* Tracks tab — only when an album/playlist is loaded from the platform */}
                            {platform && platform.tracklist.length > 0 && (
                                <button
                                    onClick={() => setActiveTab('tracks')}
                                    className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'tracks' ? 'border-purple-500 text-[#FF8C00] font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                                >
                                    <Music className="w-3.5 h-3.5" />
                                    <span>Tracks</span>
                                </button>
                            )}
                        </div>

                        {/* Scrollable Settings Panel Content */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
                            {activeTab === 'tracks' && platform && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-white/50">{platform.title || 'Tracklist'} · {platform.tracklist.length} tracks</p>
                                        <button
                                            onClick={() => setShowTracklist(v => !v)}
                                            className="text-[10px] font-black uppercase tracking-widest text-purple-300 hover:text-white transition-colors"
                                        >
                                            {showTracklist ? 'Hide floating' : 'Show floating'}
                                        </button>
                                    </div>
                                    <div className="space-y-1">{tracklistRows}</div>
                                </div>
                            )}
                            {activeTab === 'core' && (
                                <div className="space-y-4">
                                    {/* Mode Selector */}
                                    <div>
                                        <label className="text-xs text-white/50 block mb-1">Visualizer Mode *</label>
                                        <select 
                                            value={config.mode}
                                            onChange={e => setConfig(prev => ({ ...prev, mode: e.target.value as VisualizerMode }))}
                                            className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-purple-500"
                                        >
                                            {Object.values(VisualizerMode).map(mode => (
                                                <option key={mode} value={mode} className="bg-zinc-900">{mode}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Smoothing Slider */}
                                    <div>
                                        <div className="flex justify-between text-xs text-white/60 mb-1">
                                            <span>Smoothing Time</span>
                                            <span className="font-mono text-[#FF8C00]">{config.smoothingTimeConstant}</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="0.95" 
                                            step="0.05"
                                            value={config.smoothingTimeConstant}
                                            onChange={e => setConfig(prev => ({ ...prev, smoothingTimeConstant: parseFloat(e.target.value) }))}
                                            className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                    </div>

                                    {/* FFT Size */}
                                    <div>
                                        <label className="text-xs text-white/50 block mb-1">Audio Buffer FFT Size</label>
                                        <select 
                                            value={config.fftSize}
                                            onChange={e => setConfig(prev => ({ ...prev, fftSize: parseInt(e.target.value) }))}
                                            className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-purple-500"
                                        >
                                            {[256, 512, 1024, 2048, 4096, 8192].map(size => (
                                                <option key={size} value={size} className="bg-zinc-900">{size}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Sensitivity */}
                                    <div>
                                        <div className="flex justify-between text-xs text-white/60 mb-1">
                                            <span>Waveform Sensitivity</span>
                                            <span className="font-mono text-[#FF8C00]">{config.sensitivity}x</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0.1" 
                                            max="3.0" 
                                            step="0.1"
                                            value={config.sensitivity}
                                            onChange={e => setConfig(prev => ({ ...prev, sensitivity: parseFloat(e.target.value) }))}
                                            className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                    </div>

                                    {/* Frame rate Limit */}
                                    <div>
                                        <label className="text-xs text-white/50 block mb-1">Target Frame Rate</label>
                                        <div className="flex gap-2">
                                            {[30, 60].map(fps => (
                                                <button
                                                    key={fps}
                                                    onClick={() => setConfig(prev => ({ ...prev, targetFrameRate: fps as 30 | 60 }))}
                                                    className={`flex-1 py-1.5 rounded-lg border text-xs font-mono transition-all ${config.targetFrameRate === fps ? 'border-purple-500 bg-purple-500/20 text-[#FF8C00]' : 'border-white/10 text-white/60 hover:text-white'}`}
                                                >
                                                    {fps} FPS
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Speed */}
                                    <div>
                                        <div className="flex justify-between text-xs text-white/60 mb-1">
                                            <span>Wave Generation Speed</span>
                                            <span className="font-mono text-[#FF8C00]">{config.speed}x</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0.1" 
                                            max="3.0" 
                                            step="0.1"
                                            value={config.speed}
                                            onChange={e => setConfig(prev => ({ ...prev, speed: parseFloat(e.target.value) }))}
                                            className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                    </div>
                                </div>
                            )}

                            {activeTab === 'colors' && (
                                <div className="space-y-4">
                                    <h3 className="text-xs font-semibold text-white/60 tracking-wider">Gradient Palette Manager</h3>
                                    <p className="text-xs text-white/40">Add, delete, or choose from your dynamic multi-colored reactive palette.</p>
                                    
                                    <ColorPaletteEditor 
                                        colors={config.colorPalette}
                                        onChange={colors => setConfig(prev => ({ ...prev, colorPalette: colors }))}
                                    />
                                </div>
                            )}

                            {activeTab === 'ambient' && (
                                <div className="space-y-5">
                                    {/* Blur Properties */}
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-white/60">Glow Soft Blur</span>
                                            <input 
                                                type="checkbox" 
                                                checked={config.enableBlur}
                                                onChange={e => setConfig(prev => ({ ...prev, enableBlur: e.target.checked }))}
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                        </div>
                                        {config.enableBlur && (
                                            <div>
                                                <div className="flex justify-between text-xs text-white/60 mb-1">
                                                    <span>Blur Strength</span>
                                                    <span className="font-mono text-[#FF8C00]">{config.blurStrength}</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="0.1" 
                                                    max="2.0" 
                                                    step="0.1"
                                                    value={config.blurStrength}
                                                    onChange={e => setConfig(prev => ({ ...prev, blurStrength: parseFloat(e.target.value) }))}
                                                    className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Particle Settings */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-4">
                                        <span className="text-xs font-medium text-[#FF8C00] block">Particles System</span>
                                        <div>
                                            <div className="flex justify-between text-xs text-white/60 mb-1">
                                                <span>Emitter Count</span>
                                                <span className="font-mono text-[#FF8C00]">{config.particleCount}</span>
                                            </div>
                                            <input 
                                                type="range" 
                                                min="10" 
                                                max="300" 
                                                step="10"
                                                value={config.particleCount}
                                                onChange={e => setConfig(prev => ({ ...prev, particleCount: parseInt(e.target.value) }))}
                                                className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                            />
                                        </div>

                                        <div>
                                            <div className="flex justify-between text-xs text-white/60 mb-1">
                                                <span>Average Lifespan</span>
                                                <span className="font-mono text-[#FF8C00]">{config.particleLifespan}s</span>
                                            </div>
                                            <input 
                                                type="range" 
                                                min="0.5" 
                                                max="5.0" 
                                                step="0.1"
                                                value={config.particleLifespan}
                                                onChange={e => setConfig(prev => ({ ...prev, particleLifespan: parseFloat(e.target.value) }))}
                                                className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                            />
                                        </div>
                                    </div>

                                    {/* Lyrics Phonetic Visual Drive */}
                                    <div className="p-3 bg-purple-900/10 rounded-xl border border-purple-500/20 space-y-3">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-purple-300 font-medium">Phonetic Lyric Visual Drive</span>
                                            <input 
                                                type="checkbox" 
                                                checked={config.enableLyricsVisualDrive || false}
                                                onChange={e => setConfig(prev => ({ ...prev, enableLyricsVisualDrive: e.target.checked }))}
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                        </div>
                                        <p className="text-[11px] text-white/40">Phonetic vowel and consonant structures of current lyrics will dynamically morph geometric visual nodes and multipliers.</p>
                                        {config.enableLyricsVisualDrive && (
                                            <div>
                                                <div className="flex justify-between text-xs text-white/60 mb-1">
                                                    <span>Phonetic Mod Strength</span>
                                                    <span className="font-mono text-[#FF8C00]">{config.lyricsDriveStrength || 1.0}x</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="0.1" 
                                                    max="3.0" 
                                                    step="0.1"
                                                    value={config.lyricsDriveStrength || 1.0}
                                                    onChange={e => setConfig(prev => ({ ...prev, lyricsDriveStrength: parseFloat(e.target.value) }))}
                                                    className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* 12 Post-Processing Visual Matrices */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-4">
                                        <span className="text-xs font-semibold text-[#FF8C00] block">12 Interactive Post-Processing Effects</span>
                                        
                                        {/* Effect 1: Chromatic Aberration */}
                                        <div className="space-y-2 border-b border-white/5 pb-2">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-white/70">1. Chromatic Aberration</span>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config.enableChroma || false}
                                                    onChange={e => setConfig(prev => ({ ...prev, enableChroma: e.target.checked }))}
                                                    className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                />
                                            </div>
                                            {config.enableChroma && (
                                                <input 
                                                    type="range" min="1" max="30" step="1"
                                                    value={config.chromaAmount || 10}
                                                    onChange={e => setConfig(prev => ({ ...prev, chromaAmount: parseInt(e.target.value) }))}
                                                    className="w-full bg-white/10 h-1 rounded-lg accent-purple-500 cursor-pointer"
                                                />
                                            )}
                                        </div>

                                        {/* Effect 2: Analog VHS Scanlines */}
                                        <div className="space-y-2 border-b border-white/5 pb-2">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-white/70">2. TV VHS Scanlines</span>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config.enableVhs || false}
                                                    onChange={e => setConfig(prev => ({ ...prev, enableVhs: e.target.checked }))}
                                                    className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                />
                                            </div>
                                            {config.enableVhs && (
                                                <input 
                                                    type="range" min="0.1" max="1.0" step="0.05"
                                                    value={config.vhsIntensity || 0.4}
                                                    onChange={e => setConfig(prev => ({ ...prev, vhsIntensity: parseFloat(e.target.value) }))}
                                                    className="w-full bg-white/10 h-1 rounded-lg accent-purple-500 cursor-pointer"
                                                />
                                            )}
                                        </div>

                                        {/* Effect 3: Digital VGA Glitch */}
                                        <div className="space-y-2 border-b border-white/5 pb-2">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-white/70">3. VGA Jitter Glitch</span>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config.enableGlitch || false}
                                                    onChange={e => setConfig(prev => ({ ...prev, enableGlitch: e.target.checked }))}
                                                    className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                />
                                            </div>
                                            {config.enableGlitch && (
                                                <input 
                                                    type="range" min="0.1" max="1.0" step="0.05"
                                                    value={config.glitchIntensity || 0.5}
                                                    onChange={e => setConfig(prev => ({ ...prev, glitchIntensity: parseFloat(e.target.value) }))}
                                                    className="w-full bg-white/10 h-1 rounded-lg accent-purple-500 cursor-pointer"
                                                />
                                            )}
                                        </div>

                                        {/* Effect 4: Zoom Bloom Blur */}
                                        <div className="space-y-2 border-b border-white/5 pb-2">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-white/70">4. Radial Zoom Bloom</span>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config.enableZoomBlur || false}
                                                    onChange={e => setConfig(prev => ({ ...prev, enableZoomBlur: e.target.checked }))}
                                                    className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                />
                                            </div>
                                            {config.enableZoomBlur && (
                                                <input 
                                                    type="range" min="0.1" max="1.5" step="0.05"
                                                    value={config.zoomBlurIntensity || 0.5}
                                                    onChange={e => setConfig(prev => ({ ...prev, zoomBlurIntensity: parseFloat(e.target.value) }))}
                                                    className="w-full bg-white/10 h-1 rounded-lg accent-purple-500 cursor-pointer"
                                                />
                                            )}
                                        </div>

                                        {/* Effect 5: Retro Film Noise */}
                                        <div className="space-y-2 border-b border-white/5 pb-2">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-white/70">5. Digital Film Grain</span>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config.enableNoise || false}
                                                    onChange={e => setConfig(prev => ({ ...prev, enableNoise: e.target.checked }))}
                                                    className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                />
                                            </div>
                                            {config.enableNoise && (
                                                <input 
                                                    type="range" min="0.1" max="1.0" step="0.05"
                                                    value={config.noiseIntensity || 0.3}
                                                    onChange={e => setConfig(prev => ({ ...prev, noiseIntensity: parseFloat(e.target.value) }))}
                                                    className="w-full bg-white/10 h-1 rounded-lg accent-purple-500 cursor-pointer"
                                                />
                                            )}
                                        </div>

                                        {/* Effect 6: Sine Wave distorted Warp */}
                                        <div className="space-y-2 border-b border-white/5 pb-2">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-white/70">6. Sinusoidal Wave Warp</span>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config.enableWaveWarp || false}
                                                    onChange={e => setConfig(prev => ({ ...prev, enableWaveWarp: e.target.checked }))}
                                                    className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                />
                                            </div>
                                            {config.enableWaveWarp && (
                                                <input 
                                                    type="range" min="0.1" max="1.5" step="0.05"
                                                    value={config.waveWarpIntensity || 0.5}
                                                    onChange={e => setConfig(prev => ({ ...prev, waveWarpIntensity: parseFloat(e.target.value) }))}
                                                    className="w-full bg-white/10 h-1 rounded-lg accent-purple-500 cursor-pointer"
                                                />
                                            )}
                                        </div>

                                        {/* Effect 7: Neon Boarding Outline */}
                                        <div className="space-y-2 border-b border-white/5 pb-2">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-white/70">7. Radiant Neon Outline</span>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config.enableNeon || false}
                                                    onChange={e => setConfig(prev => ({ ...prev, enableNeon: e.target.checked }))}
                                                    className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                />
                                            </div>
                                            {config.enableNeon && (
                                                <input 
                                                    type="range" min="0.1" max="1.5" step="0.05"
                                                    value={config.neonContourIntensity || 0.5}
                                                    onChange={e => setConfig(prev => ({ ...prev, neonContourIntensity: parseFloat(e.target.value) }))}
                                                    className="w-full bg-white/10 h-1 rounded-lg accent-purple-500 cursor-pointer"
                                                />
                                            )}
                                        </div>

                                        {/* Effect 8: Mirror Reflections */}
                                        <div className="space-y-2 border-b border-white/5 pb-2">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-white/70">8. Mirror Multi-Reflection</span>
                                                <input 
                                                    type="checkbox" 
                                                    checked={config.enableMirror || false}
                                                    onChange={e => setConfig(prev => ({ ...prev, enableMirror: e.target.checked }))}
                                                    className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                />
                                            </div>
                                            {config.enableMirror && (
                                                <select 
                                                    value={config.mirrorCount || 2}
                                                    onChange={e => setConfig(prev => ({ ...prev, mirrorCount: parseInt(e.target.value) }))}
                                                    className="w-full bg-black border border-white/10 rounded-lg p-1.5 text-white text-xs outline-none"
                                                >
                                                    <option value={2}>2 Slices (Vertical Mirror)</option>
                                                    <option value={4}>4 Slices (Quadrant Mirror)</option>
                                                </select>
                                            )}
                                        </div>

                                        {/* Effect 9: Inversion Strobe Flash */}
                                        <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                                            <span className="text-white/70">9. Inversion Strobe Flasher</span>
                                            <input 
                                                type="checkbox" 
                                                checked={config.enableInvertStrobe || false}
                                                onChange={e => setConfig(prev => ({ ...prev, enableInvertStrobe: e.target.checked }))}
                                                className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                            />
                                        </div>

                                        {/* Effect 10: Thermal heat signature */}
                                        <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                                            <span className="text-white/70">10. Thermal Heat-map Tinting</span>
                                            <input 
                                                type="checkbox" 
                                                checked={config.enableThermal || false}
                                                onChange={e => setConfig(prev => ({ ...prev, enableThermal: e.target.checked }))}
                                                className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                            />
                                        </div>

                                        {/* Effect 11 & 12: Integrated Shard Mosaic & Automated Slices */}
                                        <div className="text-[11px] text-white/40 pt-1 leading-relaxed">
                                            Note: Integrated effects <span className="text-purple-300">11 (Shard Mosaic Grid)</span> and <span className="text-purple-300">12 (Dynamic Slice Automated Cutouts)</span> are fully custom-tuned on the Stage or Post FX panels.
                                        </div>
                                    </div>

                                    {/* Blend Overlay */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-white/60">Activate Blend Overlay</span>
                                            <input 
                                                type="checkbox" 
                                                checked={config.enableLayer2}
                                                onChange={e => setConfig(prev => ({ ...prev, enableLayer2: e.target.checked }))}
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                        </div>
                                        {config.enableLayer2 && (
                                            <>
                                                <div>
                                                    <div className="flex justify-between text-xs text-white/60 mb-1">
                                                        <span>Overlay Transparency</span>
                                                        <span className="font-mono text-[#FF8C00]">{config.layer2Opacity}</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="0" 
                                                        max="1" 
                                                        step="0.05"
                                                        value={config.layer2Opacity}
                                                        onChange={e => setConfig(prev => ({ ...prev, layer2Opacity: parseFloat(e.target.value) }))}
                                                        className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-white/50 block mb-1">Blend Overlay Mode</label>
                                                    <select 
                                                        value={config.layer2BlendMode}
                                                        onChange={e => setConfig(prev => ({ ...prev, layer2BlendMode: e.target.value as BlendMode }))}
                                                        className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-white text-xs outline-none"
                                                    >
                                                        {['normal', 'screen', 'overlay', 'difference', 'multiply', 'exclusion'].map(bm => (
                                                            <option key={bm} value={bm} className="bg-zinc-900">{bm}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Music-Driven Blending and Oscillator Section */}
                                                <div className="border-t border-white/5 pt-3 mt-3 space-y-3">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="text-purple-300 font-medium">LFO / Music-Driven Blending</span>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={config.enableL2BlendDrive || false}
                                                            onChange={e => setConfig(prev => ({ ...prev, enableL2BlendDrive: e.target.checked }))}
                                                            className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                        />
                                                    </div>

                                                    {config.enableL2BlendDrive && (
                                                        <div className="space-y-3 pl-2 border-l border-purple-500/30">
                                                            <div>
                                                                <label className="text-[10px] text-white/40 block mb-1">Oscillator Wave Type</label>
                                                                <select 
                                                                    value={config.l2OscillatorType || 'sine'}
                                                                    onChange={e => setConfig(prev => ({ ...prev, l2OscillatorType: e.target.value as any }))}
                                                                    className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-white text-xs outline-none"
                                                                >
                                                                    <option value="sine" className="bg-zinc-900">Sine Wave (Smooth)</option>
                                                                    <option value="square" className="bg-zinc-900">Square Wave (Glitched Step)</option>
                                                                    <option value="triangle" className="bg-zinc-900">Triangle Wave (Linear)</option>
                                                                    <option value="sawtooth" className="bg-zinc-900">Sawtooth Wave (Sweep)</option>
                                                                </select>
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <div className="flex justify-between text-[10px] text-white/40 mb-1">
                                                                        <span>LFO Speed (Hz)</span>
                                                                        <span className="text-[#FF8C00] font-mono">{config.l2OscillatorFreq !== undefined ? config.l2OscillatorFreq : 1.0}</span>
                                                                    </div>
                                                                    <input 
                                                                        type="range"
                                                                        min="0.1"
                                                                        max="8"
                                                                        step="0.1"
                                                                        value={config.l2OscillatorFreq !== undefined ? config.l2OscillatorFreq : 1.0}
                                                                        onChange={e => setConfig(prev => ({ ...prev, l2OscillatorFreq: parseFloat(e.target.value) }))}
                                                                        className="w-full bg-white/10 h-1 rounded accent-purple-500"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <div className="flex justify-between text-[10px] text-white/40 mb-1">
                                                                        <span>Freq Music Mod</span>
                                                                        <span className="text-[#FF8C00] font-mono">{config.l2OscillatorMusicMod !== undefined ? config.l2OscillatorMusicMod : 0.0}</span>
                                                                    </div>
                                                                    <input 
                                                                        type="range"
                                                                        min="0"
                                                                        max="5"
                                                                        step="0.1"
                                                                        value={config.l2OscillatorMusicMod !== undefined ? config.l2OscillatorMusicMod : 0.0}
                                                                        onChange={e => setConfig(prev => ({ ...prev, l2OscillatorMusicMod: parseFloat(e.target.value) }))}
                                                                        className="w-full bg-white/10 h-1 rounded accent-purple-500"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <label className="text-[10px] text-white/40 block mb-1">Music Signal Range</label>
                                                                    <select 
                                                                        value={config.l2MusicDriveRange || 'bass'}
                                                                        onChange={e => setConfig(prev => ({ ...prev, l2MusicDriveRange: e.target.value as any }))}
                                                                        className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-white text-xs outline-none"
                                                                    >
                                                                        <option value="bass" className="bg-zinc-900">Bass (Low)</option>
                                                                        <option value="mids" className="bg-zinc-900">Mids (Voice)</option>
                                                                        <option value="treble" className="bg-zinc-900">Treble (High)</option>
                                                                        <option value="overall" className="bg-zinc-900">Overall Level</option>
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label className="text-[10px] text-white/40 block mb-1">Music Drive Mode</label>
                                                                    <select 
                                                                        value={config.l2MusicDriveMode || 'opacity'}
                                                                        onChange={e => setConfig(prev => ({ ...prev, l2MusicDriveMode: e.target.value as any }))}
                                                                        className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-white text-xs outline-none"
                                                                    >
                                                                        <option value="opacity" className="bg-zinc-900">Modulate Overlay Opacity</option>
                                                                        <option value="crossover" className="bg-zinc-900">Crossfade layers</option>
                                                                    </select>
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <div className="flex justify-between text-[10px] text-white/40 mb-1">
                                                                    <span>Direct Music Amplitude Multiplier</span>
                                                                    <span className="text-[#FF8C00] font-mono">{config.l2MusicDriveStrength !== undefined ? config.l2MusicDriveStrength : 0.5}</span>
                                                                </div>
                                                                <input 
                                                                    type="range"
                                                                    min="0"
                                                                    max="2"
                                                                    step="0.05"
                                                                    value={config.l2MusicDriveStrength !== undefined ? config.l2MusicDriveStrength : 0.5}
                                                                    onChange={e => setConfig(prev => ({ ...prev, l2MusicDriveStrength: parseFloat(e.target.value) }))}
                                                                    className="w-full bg-white/10 h-1 rounded accent-purple-500"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Compositing Music Drive Section */}
                                                <div className="border-t border-white/5 pt-3 space-y-3">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="text-purple-300 font-medium">Reactive Compositing Blends</span>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={config.l2CompMusicDrive || false}
                                                            onChange={e => setConfig(prev => ({ ...prev, l2CompMusicDrive: e.target.checked }))}
                                                            className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                        />
                                                    </div>

                                                    {config.l2CompMusicDrive && (
                                                        <div className="space-y-3 pl-2 border-l border-purple-500/30">
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <label className="text-[10px] text-white/40 block mb-1">Compositing Signal Range</label>
                                                                    <select 
                                                                        value={config.l2CompMusicRange || 'bass'}
                                                                        onChange={e => setConfig(prev => ({ ...prev, l2CompMusicRange: e.target.value as any }))}
                                                                        className="w-full bg-black/60 border border-white/10 rounded-lg p-1.5 text-white text-xs outline-none"
                                                                    >
                                                                        <option value="bass" className="bg-zinc-900">Bass (Low)</option>
                                                                        <option value="mids" className="bg-zinc-900">Mids (Voice)</option>
                                                                        <option value="treble" className="bg-zinc-900">Treble (High)</option>
                                                                        <option value="overall" className="bg-zinc-900">Overall Level</option>
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <div className="flex justify-between text-[10px] text-white/40 mb-1">
                                                                        <span>Composite Threshold</span>
                                                                        <span className="text-[#FF8C00] font-mono">{config.l2CompDriveThreshold !== undefined ? config.l2CompDriveThreshold : 0.5}</span>
                                                                    </div>
                                                                    <input 
                                                                        type="range"
                                                                        min="0.1"
                                                                        max="1.0"
                                                                        step="0.05"
                                                                        value={config.l2CompDriveThreshold !== undefined ? config.l2CompDriveThreshold : 0.5}
                                                                        onChange={e => setConfig(prev => ({ ...prev, l2CompDriveThreshold: parseFloat(e.target.value) }))}
                                                                        className="w-full bg-white/10 h-1 rounded accent-purple-500"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="text-[10px] text-white/30 italic">
                                                                Swaps composition blend modes during music peaks exceeding threshold.
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Scene Automation */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-white/60">Scene Automation</span>
                                            <input 
                                                type="checkbox" 
                                                checked={config.enableBackgroundRotation}
                                                onChange={e => setConfig(prev => ({ ...prev, enableBackgroundRotation: e.target.checked }))}
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                        </div>
                                        {config.enableBackgroundRotation && (
                                            <div className="space-y-3">
                                                {/* On Beat Interval Option */}
                                                <div className="flex justify-between items-center text-xs border-t border-white/5 pt-2">
                                                    <span className="text-white/50">On-Beat Synchronized Cycle</span>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={config.enableRotationOnBeat || false}
                                                        onChange={e => setConfig(prev => ({ ...prev, enableRotationOnBeat: e.target.checked }))}
                                                        className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                    />
                                                </div>

                                                {/* Music Governed option */}
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-white/50">Govern Cycle by Music Intensity</span>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={config.rotationMusicGovern || false}
                                                        onChange={e => setConfig(prev => ({ ...prev, rotationMusicGovern: e.target.checked }))}
                                                        className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                    />
                                                </div>

                                                {/* Standard time-range cycle slider or bars cycle selector */}
                                                {(!config.enableRotationOnBeat && !config.rotationMusicGovern) ? (
                                                    <div>
                                                        <div className="flex justify-between text-[11px] text-white/40 mb-1">
                                                            <span>Time Cycle Interval</span>
                                                            <span className="font-mono text-[#FF8C00]">{config.backgroundRotationInterval || 4} seconds</span>
                                                        </div>
                                                        <input 
                                                            type="range" 
                                                            min="1" 
                                                            max="20" 
                                                            step="1"
                                                            value={config.backgroundRotationInterval || 4}
                                                            onChange={e => setConfig(prev => ({ ...prev, backgroundRotationInterval: parseInt(e.target.value) }))}
                                                            className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <label className="text-[10px] text-white/40 block mb-1">Beat Bar Interval (Synchronization)</label>
                                                        <select 
                                                            value={config.rotationBeatBars || 4}
                                                            onChange={e => setConfig(prev => ({ ...prev, rotationBeatBars: parseInt(e.target.value) as any }))}
                                                            className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-white text-xs outline-none"
                                                        >
                                                            <option value={2} className="bg-zinc-900">2 Bars (Fast Swaps)</option>
                                                            <option value={4} className="bg-zinc-900">4 Bars (Standard)</option>
                                                            <option value={8} className="bg-zinc-900">8 Bars (Extended)</option>
                                                            <option value={12} className="bg-zinc-900">12 Bars (Chill Mix)</option>
                                                            <option value={16} className="bg-zinc-900">16 Bars (Deep Lounge)</option>
                                                        </select>
                                                        <div className="text-[9px] text-white/30 mt-1 italic">
                                                            {config.rotationMusicGovern ? "Switches when cumulative sound energy matches bar capacity." : "Switches precisely after specified bar beat count."}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'stage' && (
                                <div className="space-y-5">
                                    {/* Slicing Controls */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-4">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-[#FF8C00] font-medium">Stage Mirror Slicing</span>
                                            <input 
                                                type="checkbox" 
                                                checked={config.enableSlicing}
                                                onChange={e => setConfig(prev => ({ ...prev, enableSlicing: e.target.checked }))}
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                        </div>
                                        {config.enableSlicing && (
                                            <>
                                                <div>
                                                    <div className="flex justify-between text-xs text-white/60 mb-1">
                                                        <span>Slice Slices Count</span>
                                                        <span className="font-mono text-[#FF8C00]">{config.sliceCount}</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="2" 
                                                        max="24" 
                                                        step="1"
                                                        value={config.sliceCount}
                                                        onChange={e => setConfig(prev => ({ ...prev, sliceCount: parseInt(e.target.value) }))}
                                                        className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs text-white/60 mb-1">
                                                        <span>Sector Rotation angle</span>
                                                        <span className="font-mono text-[#FF8C00]">{config.sliceRotation}°</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="360"
                                                        step="5"
                                                        value={config.sliceRotation}
                                                        onChange={e => setConfig(prev => ({ ...prev, sliceRotation: parseInt(e.target.value) }))}
                                                        className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs text-white/60 mb-1">
                                                        <span>Slice Push</span>
                                                        <span className="font-mono text-[#FF8C00]">{((config.slicePush ?? 0) * 100).toFixed(0)}%</span>
                                                    </div>
                                                    <input
                                                        type="range" min="0" max="1" step="0.01"
                                                        value={config.slicePush ?? 0}
                                                        onChange={e => setConfig(prev => ({ ...prev, slicePush: parseFloat(e.target.value) }))}
                                                        className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                    <div className="flex gap-4 mt-2">
                                                        <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer">
                                                            <input type="checkbox" checked={config.slicePushMusicDriven ?? false} onChange={e => setConfig(prev => ({ ...prev, slicePushMusicDriven: e.target.checked }))} className="accent-purple-500" />
                                                            Freq drive (per-slice)
                                                        </label>
                                                        <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer">
                                                            <input type="checkbox" checked={config.slicePushOscDriven ?? false} onChange={e => setConfig(prev => ({ ...prev, slicePushOscDriven: e.target.checked }))} className="accent-purple-500" />
                                                            LFO wave
                                                        </label>
                                                    </div>
                                                </div>

                                                {/* Rotation snap beat pattern */}
                                                <div>
                                                    <div className="flex justify-between text-xs text-white/60 mb-2">
                                                        <span>Rotation Snap Pattern</span>
                                                        <span className="font-mono text-[#FF8C00] text-[10px]">{config.sliceRotationBeatPattern ?? 'off'}</span>
                                                    </div>
                                                    <div className="flex gap-1.5">
                                                        {(['off', '2', '4', '8', 'random'] as const).map(p => (
                                                            <button
                                                                key={p}
                                                                onClick={() => setConfig(prev => ({ ...prev, sliceRotationBeatPattern: p === 'off' ? undefined : p }))}
                                                                className="flex-1 py-1 rounded text-[9px] font-black uppercase transition-all"
                                                                style={{
                                                                    background: (config.sliceRotationBeatPattern ?? 'off') === p ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.04)',
                                                                    border: (config.sliceRotationBeatPattern ?? 'off') === p ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.08)',
                                                                    color: (config.sliceRotationBeatPattern ?? 'off') === p ? '#c084fc' : 'rgba(255,255,255,0.3)',
                                                                }}
                                                            >{p === 'off' ? 'OFF' : p === 'random' ? 'RND' : `${p}B`}</button>
                                                        ))}
                                                    </div>
                                                    {config.sliceRotationBeatPattern && (
                                                        <div className="mt-2">
                                                            <div className="flex justify-between text-[10px] text-white/40 mb-1"><span>Rotation range</span><span className="text-[#FF8C00] font-mono">±{config.sliceRotationRange ?? 45}°</span></div>
                                                            <input type="range" min="5" max="180" step="5"
                                                                value={config.sliceRotationRange ?? 45}
                                                                onChange={e => setConfig(prev => ({ ...prev, sliceRotationRange: parseInt(e.target.value) }))}
                                                                className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Concert Stage Lighting */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-medium text-[#FF8C00]">Concert Stage Lighting</span>
                                            <input
                                                type="checkbox"
                                                checked={config.enableBeams}
                                                onChange={e => setConfig(prev => ({ ...prev, enableBeams: e.target.checked }))}
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                        </div>

                                        {config.enableBeams && (
                                            <>
                                                {/* Fixture count */}
                                                <div>
                                                    <div className="flex justify-between text-[10px] text-white/50 mb-1.5">
                                                        <span>Fixtures</span>
                                                        <span className="text-[#FF8C00] font-mono">{config.beamCount ?? 3}</span>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        {[1, 2, 3, 4, 5, 6].map(n => (
                                                            <button key={n}
                                                                onClick={() => setConfig(prev => ({ ...prev, beamCount: n }))}
                                                                className="flex-1 py-1.5 rounded text-[9px] font-black transition-all"
                                                                style={{
                                                                    background: (config.beamCount ?? 3) === n ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.04)',
                                                                    border: (config.beamCount ?? 3) === n ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.08)',
                                                                    color: (config.beamCount ?? 3) === n ? '#c084fc' : 'rgba(255,255,255,0.3)',
                                                                }}
                                                            >{n}</button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Intensity */}
                                                <div>
                                                    <div className="flex justify-between text-[10px] text-white/50 mb-1">
                                                        <span>Intensity</span>
                                                        <span className="text-[#FF8C00] font-mono">{config.lightingIntensity?.toFixed(1)}</span>
                                                    </div>
                                                    <input type="range" min="0" max="2" step="0.05"
                                                        value={config.lightingIntensity}
                                                        onChange={e => setConfig(prev => ({ ...prev, lightingIntensity: parseFloat(e.target.value) }))}
                                                        className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                </div>

                                                {/* Beat strobe */}
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-white/60">Strobe on Beat</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={config.beamStrobeOnBeat ?? false}
                                                        onChange={e => setConfig(prev => ({ ...prev, beamStrobeOnBeat: e.target.checked }))}
                                                        className="w-4 h-4 accent-purple-500 cursor-pointer"
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* 3D Depth Mode */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-medium text-cyan-400">3D Depth Mode</span>
                                            <input
                                                type="checkbox"
                                                checked={config.enable3dDepth ?? false}
                                                onChange={e => setConfig(prev => ({ ...prev, enable3dDepth: e.target.checked }))}
                                                className="w-4 h-4 accent-cyan-500 cursor-pointer"
                                            />
                                        </div>

                                        {config.enable3dDepth && (
                                            <>
                                                <p className="text-[9px] text-white/30 leading-relaxed">
                                                    Separates layers into depth planes. Mouse drives camera parallax. Background recedes, overlays push forward.
                                                </p>

                                                {/* Parallax intensity */}
                                                <div>
                                                    <div className="flex justify-between text-[10px] text-white/50 mb-1">
                                                        <span>Parallax Depth</span>
                                                        <span className="text-cyan-400 font-mono">{Math.round((config.depthParallaxIntensity ?? 0.4) * 100)}%</span>
                                                    </div>
                                                    <input type="range" min="0" max="1" step="0.05"
                                                        value={config.depthParallaxIntensity ?? 0.4}
                                                        onChange={e => setConfig(prev => ({ ...prev, depthParallaxIntensity: parseFloat(e.target.value) }))}
                                                        className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                                    />
                                                </div>

                                                {/* Camera fly-through */}
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-white/60">Camera Fly-Through</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={config.cameraFlyThrough ?? true}
                                                        onChange={e => setConfig(prev => ({ ...prev, cameraFlyThrough: e.target.checked }))}
                                                        className="w-4 h-4 accent-cyan-500 cursor-pointer"
                                                    />
                                                </div>

                                                {config.cameraFlyThrough && (
                                                    <div>
                                                        <div className="flex justify-between text-[10px] text-white/50 mb-1">
                                                            <span>Drift Speed</span>
                                                            <span className="text-cyan-400 font-mono">{config.cameraFlySpeed?.toFixed(1) ?? '1.0'}×</span>
                                                        </div>
                                                        <input type="range" min="0.1" max="3" step="0.1"
                                                            value={config.cameraFlySpeed ?? 1.0}
                                                            onChange={e => setConfig(prev => ({ ...prev, cameraFlySpeed: parseFloat(e.target.value) }))}
                                                            className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                                        />
                                                    </div>
                                                )}

                                                {/* Auto-segmentation */}
                                                <div className="border-t border-white/5 pt-3 space-y-2">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="text-white/60">Auto Segmentation</span>
                                                        <input
                                                            type="checkbox"
                                                            checked={config.enableSegmentation ?? false}
                                                            onChange={e => setConfig(prev => ({ ...prev, enableSegmentation: e.target.checked }))}
                                                            className="w-4 h-4 accent-cyan-500 cursor-pointer"
                                                        />
                                                    </div>
                                                    {config.enableSegmentation && (
                                                        <p className="text-[8px] text-white/30 leading-relaxed">
                                                            Loads MediaPipe (~6MB) to extract subjects from background. Falls back to luminance-based separation for non-person content.
                                                        </p>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Bass shake */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-4">
                                        <span className="text-xs font-medium text-[#FF8C00] block">Camera Shake</span>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-white/60">Enable Bass Camera Shake</span>
                                            <input
                                                type="checkbox"
                                                checked={config.enableBassShake}
                                                onChange={e => setConfig(prev => ({ ...prev, enableBassShake: e.target.checked }))}
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                        </div>

                                        {config.enableBassShake && (
                                            <div>
                                                <div className="flex justify-between text-xs text-white/60 mb-1">
                                                    <span>Bass Shock Intensity</span>
                                                    <span className="font-mono text-[#FF8C00]">{config.bassShakeIntensity}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0.1"
                                                    max="3.0"
                                                    step="0.1"
                                                    value={config.bassShakeIntensity}
                                                    onChange={e => setConfig(prev => ({ ...prev, bassShakeIntensity: parseFloat(e.target.value) }))}
                                                    className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'text' && (
                                <div className="space-y-5">
                                    {/* Text Overlay — full style gallery */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-4">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-[#FF8C00] font-medium">Graphic Text Overlays</span>
                                            <input
                                                type="checkbox"
                                                checked={config.enableText}
                                                onChange={e => setConfig(prev => ({ ...prev, enableText: e.target.checked }))}
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                        </div>

                                        {config.enableText && (
                                            <div className="space-y-4">
                                                {/* Content + Size */}
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        value={config.textContent}
                                                        onChange={e => setConfig(prev => ({ ...prev, textContent: e.target.value }))}
                                                        placeholder="Display text…"
                                                        className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-purple-500"
                                                    />
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-white/40 shrink-0">Size</span>
                                                        <input
                                                            type="range" min="40" max="240" step="4"
                                                            value={config.textSize}
                                                            onChange={e => setConfig(prev => ({ ...prev, textSize: parseInt(e.target.value) }))}
                                                            className="flex-1 h-1 accent-purple-500 cursor-pointer"
                                                        />
                                                        <span className="text-[10px] font-mono text-[#FF8C00] w-10 text-right">{config.textSize}px</span>
                                                    </div>
                                                </div>

                                                {/* ── Style Presets ── */}
                                                <div>
                                                    <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Style Presets</p>
                                                    <div className="grid grid-cols-5 gap-1">
                                                        {[
                                                            { label: 'Clean', patch: { textFont: 'Inter', textGradient: false, textColor: '#FFFFFF', textOutline: false } },
                                                            { label: 'Neon', patch: { textFont: 'Orbitron', textGradient: false, textColor: '#00FFFF', textOutline: false } },
                                                            { label: 'Fire', patch: { textFont: 'Anton', textGradient: true, textGradientColors: ['#FFE060', '#FF2400'], textGradientAngle: 90 } },
                                                            { label: 'Ice', patch: { textFont: 'Rajdhani', textGradient: true, textGradientColors: ['#FFFFFF', '#00CCFF'], textGradientAngle: 270 } },
                                                            { label: 'Gold', patch: { textFont: 'Bebas Neue', textGradient: true, textGradientColors: ['#FFD700', '#B8860B'], textGradientAngle: 90 } },
                                                            { label: 'Chrome', patch: { textFont: 'Exo 2', textGradient: true, textGradientColors: ['#E8E8E8', '#888888'], textGradientAngle: 90 } },
                                                            { label: 'Retro', patch: { textFont: 'VT323', textGradient: false, textColor: '#FF6B35', textOutline: false } },
                                                            { label: 'Mono', patch: { textFont: 'Share Tech Mono', textGradient: false, textColor: '#00FF41', textOutline: false } },
                                                            { label: 'Rainbow', patch: { textFont: 'Bebas Neue', textGradient: true, textGradientColors: ['#FF00CC', '#00CCFF'], textGradientAngle: 0 } },
                                                            { label: 'Ghost', patch: { textFont: 'Inter', textGradient: false, textColor: '#FFFFFF', textOutline: true } },
                                                        ].map(({ label, patch }) => (
                                                            <button
                                                                key={label}
                                                                onClick={() => setConfig(prev => ({ ...prev, ...patch }))}
                                                                className="h-7 text-[9px] font-black uppercase tracking-wide rounded-lg bg-white/5 border border-white/10 hover:bg-[#FF8C00]/20 hover:border-purple-500/50 text-white/60 hover:text-white transition-all"
                                                            >
                                                                {label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* ── Font Gallery ── */}
                                                <div>
                                                    <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Font</p>
                                                    <div className="grid grid-cols-4 gap-1">
                                                        {TEXT_FONTS.map(f => (
                                                            <button
                                                                key={f.name}
                                                                onClick={() => setConfig(prev => ({ ...prev, textFont: f.name }))}
                                                                style={{ fontFamily: f.name }}
                                                                className={`h-8 text-[11px] font-bold rounded-lg border transition-all truncate px-1 ${
                                                                    (config.textFont || 'Inter') === f.name
                                                                        ? 'bg-purple-600/40 border-purple-500/60 text-white'
                                                                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
                                                                }`}
                                                            >
                                                                {f.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* ── Color / Gradient ── */}
                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <p className="text-[10px] text-white/40 uppercase tracking-widest">Fill</p>
                                                        <button
                                                            onClick={() => setConfig(prev => ({ ...prev, textGradient: !prev.textGradient }))}
                                                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded transition-all ${config.textGradient ? 'bg-purple-600/40 text-purple-300' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}
                                                        >
                                                            {config.textGradient ? 'Gradient' : 'Solid'}
                                                        </button>
                                                    </div>
                                                    {!config.textGradient ? (
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="color"
                                                                value={config.textColor}
                                                                onChange={e => setConfig(prev => ({ ...prev, textColor: e.target.value }))}
                                                                className="w-10 h-8 rounded cursor-pointer border border-white/10 bg-black/30"
                                                            />
                                                            <span className="text-[10px] font-mono text-white/40">{config.textColor}</span>
                                                            <div className="flex items-center gap-2 ml-auto">
                                                                <label className="flex items-center gap-1.5 text-[10px] text-white/50 cursor-pointer">
                                                                    <input type="checkbox" checked={config.textOutline} onChange={e => setConfig(prev => ({ ...prev, textOutline: e.target.checked }))} className="accent-purple-500" />
                                                                    Outline
                                                                </label>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="color"
                                                                    value={config.textGradientColors?.[0] || '#FF00CC'}
                                                                    onChange={e => setConfig(prev => ({ ...prev, textGradientColors: [e.target.value, prev.textGradientColors?.[1] || '#00CCFF'] }))}
                                                                    className="flex-1 h-8 rounded cursor-pointer border border-white/10"
                                                                />
                                                                <input
                                                                    type="color"
                                                                    value={config.textGradientColors?.[1] || '#00CCFF'}
                                                                    onChange={e => setConfig(prev => ({ ...prev, textGradientColors: [prev.textGradientColors?.[0] || '#FF00CC', e.target.value] }))}
                                                                    className="flex-1 h-8 rounded cursor-pointer border border-white/10"
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/40 shrink-0">Angle</span>
                                                                <input
                                                                    type="range" min="0" max="360" step="15"
                                                                    value={config.textGradientAngle ?? 0}
                                                                    onChange={e => setConfig(prev => ({ ...prev, textGradientAngle: parseInt(e.target.value) }))}
                                                                    className="flex-1 h-1 accent-purple-500 cursor-pointer"
                                                                />
                                                                <span className="text-[10px] font-mono text-[#FF8C00] w-8 text-right">{config.textGradientAngle ?? 0}°</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* ── Audio Reactors ── */}
                                                <div>
                                                    <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Audio Reactors</p>
                                                    <div className="space-y-2">
                                                        {/* Vowel reactor */}
                                                        <div className={`p-2 rounded-lg border transition-all ${config.textVowelReactor ? 'bg-purple-900/20 border-purple-500/30' : 'bg-white/[0.03] border-white/8'}`}>
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <label className="flex items-center gap-2 text-[10px] text-white/60 cursor-pointer">
                                                                    <input type="checkbox" checked={!!config.textVowelReactor} onChange={e => setConfig(prev => ({ ...prev, textVowelReactor: e.target.checked }))} className="accent-purple-500" />
                                                                    <span className={config.textVowelReactor ? 'text-purple-300' : ''}>Vowel Reactor</span>
                                                                    <span className="text-[8px] text-white/25">mid-freq</span>
                                                                </label>
                                                            </div>
                                                            {config.textVowelReactor && (
                                                                <div className="flex gap-1 flex-wrap">
                                                                    {(['scale', 'glow', 'color', 'float'] as const).map(ef => (
                                                                        <button key={ef} onClick={() => setConfig(prev => ({ ...prev, textVowelEffect: ef }))}
                                                                            className={`text-[8px] uppercase font-black px-2 py-0.5 rounded transition-all ${config.textVowelEffect === ef ? 'bg-purple-600/50 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                                                                            {ef}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {/* Consonant reactor */}
                                                        <div className={`p-2 rounded-lg border transition-all ${config.textConsonantReactor ? 'bg-pink-900/20 border-pink-500/30' : 'bg-white/[0.03] border-white/8'}`}>
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <label className="flex items-center gap-2 text-[10px] text-white/60 cursor-pointer">
                                                                    <input type="checkbox" checked={!!config.textConsonantReactor} onChange={e => setConfig(prev => ({ ...prev, textConsonantReactor: e.target.checked }))} className="accent-pink-500" />
                                                                    <span className={config.textConsonantReactor ? 'text-pink-300' : ''}>Consonant Reactor</span>
                                                                    <span className="text-[8px] text-white/25">high-freq</span>
                                                                </label>
                                                            </div>
                                                            {config.textConsonantReactor && (
                                                                <div className="flex gap-1 flex-wrap">
                                                                    {(['shake', 'blur', 'scatter', 'glitch'] as const).map(ef => (
                                                                        <button key={ef} onClick={() => setConfig(prev => ({ ...prev, textConsonantEffect: ef }))}
                                                                            className={`text-[8px] uppercase font-black px-2 py-0.5 rounded transition-all ${config.textConsonantEffect === ef ? 'bg-pink-600/50 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                                                                            {ef}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {/* Reactor intensity */}
                                                        {(config.textVowelReactor || config.textConsonantReactor) && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/40 shrink-0">Intensity</span>
                                                                <input type="range" min="0.1" max="3" step="0.1"
                                                                    value={config.textReactorIntensity ?? 1}
                                                                    onChange={e => setConfig(prev => ({ ...prev, textReactorIntensity: parseFloat(e.target.value) }))}
                                                                    className="flex-1 h-1 accent-purple-500 cursor-pointer" />
                                                                <span className="text-[10px] font-mono text-[#FF8C00] w-6 text-right">{(config.textReactorIntensity ?? 1).toFixed(1)}×</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* ── Physics ── */}
                                                <div>
                                                    <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Physics</p>
                                                    <div className="grid grid-cols-3 gap-1 mb-2">
                                                        {(['none', 'float', 'wave', 'bounce', 'scatter', 'elastic'] as const).map(ph => (
                                                            <button key={ph} onClick={() => setConfig(prev => ({ ...prev, textPhysics: ph }))}
                                                                className={`h-7 text-[9px] font-black uppercase rounded-lg border transition-all ${
                                                                    (config.textPhysics || 'none') === ph
                                                                        ? 'bg-cyan-600/40 border-cyan-500/50 text-cyan-300'
                                                                        : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                                                                }`}>
                                                                {ph}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    {(config.textPhysics && config.textPhysics !== 'none') && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] text-white/40 shrink-0">Force</span>
                                                            <input type="range" min="0.1" max="3" step="0.1"
                                                                value={config.textPhysicsIntensity ?? 1}
                                                                onChange={e => setConfig(prev => ({ ...prev, textPhysicsIntensity: parseFloat(e.target.value) }))}
                                                                className="flex-1 h-1 accent-cyan-500 cursor-pointer" />
                                                            <span className="text-[10px] font-mono text-cyan-400 w-6 text-right">{(config.textPhysicsIntensity ?? 1).toFixed(1)}×</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* ── Shatter ── */}
                                                <div className="flex items-center justify-between">
                                                    <label className="flex items-center gap-2 text-[10px] text-white/50 cursor-pointer">
                                                        <input type="checkbox" checked={config.textShatter} onChange={e => setConfig(prev => ({ ...prev, textShatter: e.target.checked }))} className="accent-purple-500" />
                                                        Shatter on Beat
                                                    </label>
                                                    {config.textShatter && (
                                                        <input type="range" min="0.1" max="3" step="0.1"
                                                            value={config.textShatterIntensity}
                                                            onChange={e => setConfig(prev => ({ ...prev, textShatterIntensity: parseFloat(e.target.value) }))}
                                                            className="w-20 h-1 accent-purple-500 cursor-pointer" />
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Sync Lyrics & Captions */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-4">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-[#FF8C00] font-medium">Digital lyric overlays</span>
                                            <input 
                                                type="checkbox" 
                                                checked={config.enableCaptions}
                                                onChange={e => setConfig(prev => ({ ...prev, enableCaptions: e.target.checked }))}
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                        </div>
                                        
                                        {config.enableCaptions && (
                                            <>
                                                <div>
                                                    <label className="text-xs text-white/60 block mb-1">Subtitles Content Preview</label>
                                                    <input 
                                                        type="text" 
                                                        value={config.captionsText}
                                                        onChange={e => setConfig(prev => ({ ...prev, captionsText: e.target.value }))}
                                                        className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-purple-500"
                                                    />
                                                </div>

                                                {/* Streaming Gemini REAL-TIME Lyrics */}
                                                <div className="pt-2 border-t border-white/15 space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                                                            <Wand2 className="w-3.5 h-3.5 text-[#FF8C00]" />
                                                            Gemini Live Lyrics Stream
                                                        </span>
                                                        <span className={`w-2.5 h-2.5 rounded-full ${isLiveLyricsActive ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`} />
                                                    </div>
                                                    <p className="text-[10px] text-white/40">Continuously listens to playing track and transcribes lyrics into moving live captions using our Gemini Live Client.</p>
                                                    
                                                    <button
                                                        onClick={() => setConfig(prev => ({ ...prev, enableLiveCaptions: !prev.enableLiveCaptions }))}
                                                        className={`w-full py-1.5 rounded-lg border text-xs font-medium transition-all ${config.enableLiveCaptions ? 'bg-purple-600 border-purple-500 hover:bg-purple-500 text-white shadow-md' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}
                                                    >
                                                        {config.enableLiveCaptions ? 'Disable Live Transcription' : 'Enable Live Transcription'}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'midi' && (
                                <MidiController 
                                    config={config}
                                    setConfig={setConfig}
                                    audioContextRef={audioContextRef}
                                    analyserRef={analyserRef}
                                    audioElRef={audioElRef}
                                    sourceRef={sourceRef}
                                />
                            )}

                            {activeTab === 'ai' && (
                                <div className="space-y-5">
                                    {/* Project Save / Load */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
                                        <span className="text-xs font-semibold text-[#FF8C00] flex items-center gap-1.5">
                                            <Save className="w-4 h-4 text-[#FF8C00]" />
                                            Project File (.plajah)
                                        </span>
                                        <p className="text-[10.5px] text-white/50">Save your full session — config, visual layers, colors & text — as a portable <span className="font-mono text-purple-300">.plajah</span> file. Load it back anytime to pick up exactly where you left off.</p>
                                        {audioFileName && (
                                            <div className="text-[10px] text-white/40 font-mono truncate">🎵 {audioFileName}</div>
                                        )}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleSaveProject}
                                                disabled={isSaving}
                                                className="flex-1 py-2 bg-purple-600/80 hover:bg-purple-500 disabled:bg-purple-600/30 text-white rounded-lg text-xs font-medium transition-colors flex justify-center items-center gap-1.5"
                                            >
                                                {saveSuccess ? <><CheckCircle className="w-3.5 h-3.5" /> Saved!</> : isSaving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Save className="w-3.5 h-3.5" /> Save Project</>}
                                            </button>
                                            <label className="flex-1 cursor-pointer">
                                                <input type="file" accept=".plajah" onChange={handleLoadProject} className="hidden" />
                                                <div className="w-full py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg text-xs font-medium text-center transition-all flex justify-center items-center gap-1.5">
                                                    <FolderOpen className="w-3.5 h-3.5" /> Load Project
                                                </div>
                                            </label>
                                        </div>
                                    </div>

                                    {/* AI Generate — present but NOT active yet (coming soon) */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3 opacity-70">
                                        <span className="text-xs font-semibold text-[#FF8C00] flex items-center gap-1.5">
                                            <Video className="w-4 h-4 text-[#FF8C00]" />
                                            AI Generate
                                            <span className="ml-1 px-1.5 py-0.5 rounded-md bg-white/10 text-[8px] font-black uppercase tracking-widest text-white/50">Soon</span>
                                        </span>
                                        <p className="text-[10.5px] text-white/50">Type a prompt to generate an image, or upload an image + prompt to generate a video — then drag the result straight into the clip launcher or download it. <span className="text-white/35">Not active yet.</span></p>

                                        <div>
                                            <label className="text-[11px] text-white/50 block mb-1">Starting Reference Image</label>
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                onChange={handleRefImageUpload}
                                                className="w-full text-xs text-white/50 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20"
                                            />
                                            {aiRefImage && (
                                                <div className="mt-2 text-xs text-green-400 font-mono">✓ Base64 reference frame ready!</div>
                                            )}
                                        </div>

                                        <div>
                                            <label className="text-[11px] text-white/50 block mb-1">Visual Video Prompt Description</label>
                                            <input 
                                                type="text" 
                                                placeholder="e.g., retro futuristic driving neon grids..."
                                                value={aiVideoPrompt}
                                                onChange={e => setAiVideoPrompt(e.target.value)}
                                                className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-purple-500"
                                            />
                                        </div>

                                        <button
                                            onClick={handleGenerateVideo}
                                            disabled
                                            title="Coming soon — AI generation isn't active yet"
                                            className="w-full py-2 bg-[#FF8C00]/30 text-white/70 rounded-lg text-xs font-medium flex justify-center items-center gap-1.5 cursor-not-allowed"
                                        >
                                            {isGeneratingVideo ? (
                                                <>
                                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                    Generating video loop (~1 min)...
                                                </>
                                            ) : (
                                                <>
                                                    <Wand2 className="w-3.5 h-3.5" />
                                                    Synthesize Background Loop
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {/* Upload Ambient Backdrop Media assets - Layer 1 */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-semibold text-[#FF8C00] flex items-center gap-1.5">
                                                <Image className="w-4 h-4 text-[#FF8C00]" />
                                                Layer 1 Backdrop Library
                                            </span>
                                            <span className="text-[10px] text-white/40">{bgMedia1.length} Items</span>
                                        </div>
                                        <p className="text-[10.5px] text-white/50">Base backgrounds (Unsplash pictures & MP4 videos).</p>
                                        
                                        <div className="flex gap-2">
                                            <label className="flex-1 cursor-pointer">
                                                <input 
                                                    type="file" 
                                                    accept="image/*,video/mp4" 
                                                    onChange={e => handleBgUpload(e, 1)}
                                                    className="hidden"
                                                />
                                                <div className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg p-2 text-xs font-medium text-center transition-all">
                                                    + Add To Layer 1
                                                </div>
                                            </label>
                                            
                                            {bgMedia1.length > 0 && (
                                                <button
                                                    onClick={() => setBgMedia1([])}
                                                    className="p-2 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 text-xs transition-all"
                                                    title="Clear active layer 1 backgrounds"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
                                            {bgMedia1.map((item, index) => (
                                                <div key={item.id} className="flex justify-between items-center text-[10.5px] bg-black/30 border border-white/5 p-2 rounded-lg">
                                                    <span className="truncate max-w-[150px] font-mono whitespace-nowrap text-white/60">
                                                        {item.type.toUpperCase()}: {item.id.includes('default') ? item.id : item.id.substring(0, 10)}
                                                    </span>
                                                    <button 
                                                        onClick={() => setBgMedia1(prev => prev.filter(m => m.id !== item.id))}
                                                        className="text-red-400 hover:text-red-500 p-0.5"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Upload Ambient Backdrop Media assets - Blend Overlay */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-semibold text-pink-400 flex items-center gap-1.5">
                                                <Layers2 className="w-4 h-4 text-pink-400" />
                                                Blend Overlay Library
                                            </span>
                                            <span className="text-[10px] text-white/40">{bgMedia2.length} Items</span>
                                        </div>
                                        <p className="text-[10.5px] text-white/50">Blend overlays (Bokehs, particles or lighting effects).</p>

                                        <div className="flex gap-2">
                                            <label className="flex-1 cursor-pointer">
                                                <input
                                                    type="file"
                                                    accept="image/*,video/mp4"
                                                    onChange={e => handleBgUpload(e, 2)}
                                                    className="hidden"
                                                />
                                                <div className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg p-2 text-xs font-medium text-center transition-all">
                                                    + Add Blend Overlay
                                                </div>
                                            </label>
                                            
                                            {bgMedia2.length > 0 && (
                                                <button
                                                    onClick={() => setBgMedia2([])}
                                                    className="p-2 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 text-xs transition-all"
                                                    title="Clear blend overlay library"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
                                            {bgMedia2.map((item, index) => (
                                                <div key={item.id} className="flex justify-between items-center text-[10.5px] bg-black/30 border border-white/5 p-2 rounded-lg">
                                                    <span className="truncate max-w-[150px] font-mono whitespace-nowrap text-white/60">
                                                        {item.type.toUpperCase()}: {item.id.includes('default') ? item.id : item.id.substring(0, 10)}
                                                    </span>
                                                    <button 
                                                        onClick={() => setBgMedia2(prev => prev.filter(m => m.id !== item.id))}
                                                        className="text-red-400 hover:text-red-500 p-0.5"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* ── End output area */}
            </div>
        </div>
        {/* ── End outer flex wrapper */}
        </div>
    );
};

export default App;
