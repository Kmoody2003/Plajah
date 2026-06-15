import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Play, Pause, Upload, Volume2, VolumeX, Disc, Square, 
    Settings, Sliders, Sparkles, Music, Cpu, Layers, Type, 
    Video, Image, Trash2, X, Plus, Wand2, RefreshCw, Layers2, Captions, Radio,
    Save, FolderOpen, CheckCircle
} from 'lucide-react';
import AudioVisualizer from './components/AudioVisualizer';
import StudioStage from './components/StudioStage';
import SceneRail from './components/SceneRail';
import TimelineStrip from './components/TimelineStrip';
import MatteLayer, { MatteSettings } from './components/MatteLayer';
import MattePanel from './components/MattePanel';
import { MatteEngine } from './engine/matting/matteEngine';
import { MidiController, MidiStatusHud } from './components/MidiController';
import Controls from './components/Controls';
import ThemeGenerator from './components/ThemeGenerator';
import BackgroundLayer from './components/BackgroundLayer';
import GlobalLighting from './components/GlobalLighting';
import TextOverlay from './components/TextOverlay';
import CaptionsOverlay from './components/CaptionsOverlay';
import ColorPaletteEditor from './components/ColorPaletteEditor';
import { VisualizationConfig, VisualizerMode, AudioState, BackgroundMedia, BlendMode, isStudioMode } from './types';
import { generateThemeFromMood, generateVideoLoop, LiveLyricsSession } from './services/geminiService';
import { saveProject, loadProject } from './services/projectService';

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
    enableLighting: true,
    lightingIntensity: 1.0,
    enableBeams: true,
    lightColor: '#FFCC00',
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
    mediaImages: string[];   // album art + slideshow + current-track images
    currentCaption: string;  // active lyric line from the platform's caption system
    hasCaptions: boolean;    // whether the current track has lyrics/time-coded captions
    title?: string;          // album / playlist title
    onClose: () => void;
}

const App: React.FC<{ platform?: PlajahPixelsPlatformBridge }> = ({ platform }) => {
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioElRef = useRef<HTMLAudioElement | null>(null);
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const liveSessionRef = useRef<LiveLyricsSession | null>(null);
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
    const [activeTab, setActiveTab] = useState<'core' | 'colors' | 'ambient' | 'stage' | 'text' | 'ai' | 'midi'>('core');
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);

    // ─── Studio engine UI ───
    const [showRail, setShowRail] = useState(true);
    const [showTimeline, setShowTimeline] = useState(true);
    const [showMatte, setShowMatte] = useState(false);
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
    const [aiVideoPrompt, setAiVideoPrompt] = useState("");
    const [aiRefImage, setAiRefImage] = useState<string | null>(null);
    const [isLiveLyricsActive, setIsLiveLyricsActive] = useState(false);
    const [audioFileName, setAudioFileName] = useState<string | undefined>(undefined);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Audio Initialization & File Placement
    const handleUpload = (file: File) => {
        setAudioFileName(file.name);
        if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext();
            analyserRef.current = audioContextRef.current.createAnalyser();
            audioElRef.current = new Audio();
            const source = audioContextRef.current.createMediaElementSource(audioElRef.current);
            sourceRef.current = source;
            source.connect(analyserRef.current);
            analyserRef.current.connect(audioContextRef.current.destination);
            
            audioElRef.current.ontimeupdate = () => setAudioState(s => ({ ...s, currentTime: audioElRef.current?.currentTime || 0 }));
            audioElRef.current.onloadedmetadata = () => setAudioState(s => ({ ...s, duration: audioElRef.current?.duration || 0 }));
        }
        audioElRef.current!.src = URL.createObjectURL(file);
        audioElRef.current!.play();
        setAudioState(s => ({ ...s, isPlaying: true, duration: audioElRef.current?.duration || 0 }));
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
    // Drive the captions overlay from the platform's existing caption system (the
    // same lyrics the album view shows) — NOT the on-device/Gemini live-caption
    // path. In platform mode Gemini can't connect anyway (we own no audio source
    // node), so feeding the platform's active line into captionsText + the live
    // display mode is purely the platform's captions flowing through the overlay.
    useEffect(() => {
        if (!platform) return;
        setConfig(prev => (prev.captionsText === platform.currentCaption ? prev : { ...prev, captionsText: platform.currentCaption }));
    }, [platform?.currentCaption]);

    // Turn the overlay on/off with the track's caption availability (only on track
    // change, so it doesn't fight a manual toggle).
    useEffect(() => {
        if (!platform) return;
        setConfig(prev => ({ ...prev, enableCaptions: platform.hasCaptions, enableLiveCaptions: platform.hasCaptions }));
    }, [platform?.hasCaptions]);

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
            await saveProject(config, bgMedia1, bgMedia2, audioFileName);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);
        } catch (err) {
            console.error('[PlajahPixels] Save failed:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        try {
            const loaded = await loadProject(e.target.files[0]);
            setConfig(loaded.config);
            setBgMedia1(loaded.bgMedia1);
            setBgMedia2(loaded.bgMedia2);
            if (loaded.audioFileName) setAudioFileName(loaded.audioFileName);
        } catch (err) {
            console.error('[PlajahPixels] Load failed:', err);
            alert('Could not load project file. Make sure it is a valid .plajah file.');
        }
        e.target.value = '';
    };

    return (
        <div id="plajah-pixels-root" className="relative w-full h-screen bg-black text-white overflow-hidden font-sans">
            {/* ─── Platform-slaved chrome: exit, title, tracklist toggle ─── */}
            {platform && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-black/50 backdrop-blur-xl border border-white/10 rounded-full px-2 py-1.5 shadow-xl">
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

            {/* ─── Tracklist (album / playlist loaded from the platform) ─── */}
            <AnimatePresence>
                {platform && showTracklist && platform.tracklist.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        className="absolute top-24 left-6 z-40 w-64 max-h-[62vh] overflow-y-auto bg-black/70 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 shadow-2xl scrollbar-none"
                    >
                        <p className="px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.3em] text-white/30">Tracklist</p>
                        {platform.tracklist.map((t, i) => {
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
                        })}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Background Compositing Layer */}
            <BackgroundLayer 
                mediaList1={bgMedia1} 
                mediaList2={bgMedia2} 
                config={config} 
                analyser={analyserRef.current} 
                isPlaying={audioState.isPlaying} 
                id="bg-layer"
            />

            {/* Core Visualiser — studio engine scenes (Canvas2D + WebGL) or the
                classic high-fidelity AudioVisualizer, both sharing one analyser
                and compositing over the dual-layer background via blend mode. */}
            {analyserRef.current && (
                isStudioMode(config.mode) ? (
                    <StudioStage
                        id="core-visualizer"
                        analyser={analyserRef.current}
                        config={config}
                        isPlaying={audioState.isPlaying}
                    />
                ) : (
                    <AudioVisualizer 
                        id="core-visualizer"
                        analyser={analyserRef.current} 
                        config={config} 
                        isPlaying={audioState.isPlaying} 
                        hasBackground={bgMedia1.length > 0 || bgMedia2.length > 0} 
                    />
                )
            )}

            {/* Keyable media / matte layer (luma · chroma · AI) */}
            <MatteLayer
                id="matte-layer"
                analyser={analyserRef.current}
                engine={matteEngineRef.current!}
                settings={matteSettings}
            />

            {/* Accent Overlays */}
            <GlobalLighting id="global-lighting" config={config} analyser={analyserRef.current} isPlaying={audioState.isPlaying} />
            <TextOverlay id="text-overlay" config={config} analyser={analyserRef.current} isPlaying={audioState.isPlaying} />
            <CaptionsOverlay id="captions-overlay" config={config} analyser={analyserRef.current} isPlaying={audioState.isPlaying} audioRef={audioElRef} />

            {/* MIDI Status Floating HUD */}
            <MidiStatusHud config={config} />

            {/* ─── Studio engine UI: scene rail, NL timeline, matte panel ─── */}
            <SceneRail
                config={config}
                visible={showRail}
                onPick={(mode) => setConfig(prev => ({ ...prev, mode }))}
            />
            <TimelineStrip
                visible={showTimeline}
                duration={audioState.duration}
                currentTime={audioState.currentTime}
                onApply={(patch) => setConfig(prev => ({ ...prev, ...patch }))}
            />
            <MattePanel
                engine={matteEngineRef.current!}
                settings={matteSettings}
                setSettings={setMatteSettings}
                visible={showMatte}
                onClose={() => setShowMatte(false)}
            />

            {/* Floating Top Header */}
            <div id="title-header" className="absolute top-6 left-6 z-20 flex items-center space-x-3 pointer-events-none">
                <div className="w-10 h-10 bg-purple-600/30 backdrop-blur-xl border border-purple-500/30 rounded-full flex items-center justify-center animate-spin-slow">
                    <Music className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                    <h1 className="text-lg font-semibold tracking-wider font-sans uppercase bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                        Plajah Pixels
                    </h1>
                    <p className="text-[10px] text-white/40 font-mono tracking-widest">{config.name} — Mode: {config.mode}</p>
                </div>
            </div>

            {/* Save / Load Project Buttons (top-right, beside settings toggle) */}
            <div className="absolute top-6 right-20 z-30 flex items-center gap-2">
                {/* Studio: scene rail toggle */}
                <button onClick={() => setShowRail(v => !v)} title="Toggle scene rail"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${showRail ? 'bg-purple-600/40 border-purple-500/50' : 'bg-black/40 border-white/10 hover:bg-purple-600/30'}`}>
                    <Layers className="w-4 h-4 text-white/80" />
                </button>
                {/* Studio: timeline toggle */}
                <button onClick={() => setShowTimeline(v => !v)} title="Toggle natural-language timeline"
                    className={`w-9 h-9 backdrop-blur-xl border rounded-full flex items-center justify-center transition-all shadow-lg ${showTimeline ? 'bg-purple-600/40 border-purple-500/50' : 'bg-black/40 border-white/10 hover:bg-purple-600/30'}`}>
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

                {/* Load Project */}
                <label title="Load Project (.plajah)" className="w-9 h-9 bg-black/40 hover:bg-pink-600/30 backdrop-blur-xl border border-white/10 hover:border-pink-500/50 rounded-full flex items-center justify-center transition-all shadow-lg cursor-pointer">
                    <FolderOpen className="w-4 h-4 text-white/70" />
                    <input type="file" accept=".plajah" onChange={handleLoadProject} className="hidden" />
                </label>
            </div>

            {/* Trigger Button: Settings Panel */}
            <button 
                id="toggle-settings-btn"
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="absolute top-6 right-6 z-30 w-11 h-11 bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-white/10 rounded-full flex items-center justify-center hover:scale-105 transition-all text-white hover:border-purple-500/40 shadow-xl"
                title="Toggle Configuration Panel"
            >
                {isSettingsOpen ? <X className="w-5 h-5 text-purple-400" /> : <Sliders className="w-5 h-5" />}
            </button>

            {/* Floating Control Center Dock at the Bottom */}
            <div id="controls-dock" className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 w-full max-w-4xl px-4 transition-all">
                <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-2xl relative">
                    <Controls
                        audioState={audioState}
                        onTogglePlay={effTogglePlay}
                        onUpload={handleUpload}
                        onVolumeChange={effVolumeChange}
                        isRecording={false}
                        onToggleRecord={() => {}}
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
            </div>

            {/* Sliding Tabbed Configuration Drawer (Glassmorphism) */}
            <AnimatePresence>
                {isSettingsOpen && (
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
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'core' ? 'border-purple-500 text-purple-400 font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Cpu className="w-3.5 h-3.5" />
                                <span>Core</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('colors')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'colors' ? 'border-purple-500 text-purple-400 font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Palette</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('ambient')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'ambient' ? 'border-purple-500 text-purple-400 font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Layers className="w-3.5 h-3.5" />
                                <span>FX</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('stage')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'stage' ? 'border-purple-500 text-purple-400 font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Layers2 className="w-3.5 h-3.5" />
                                <span>Stage</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('text')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'text' ? 'border-purple-500 text-purple-400 font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Type className="w-3.5 h-3.5" />
                                <span>Chat</span>
                            </button>
                             <button
                                onClick={() => setActiveTab('ai')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'ai' ? 'border-purple-500 text-purple-400 font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Wand2 className="w-3.5 h-3.5" />
                                <span>AI</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('midi')}
                                className={`px-4 py-3 flex-1 flex flex-col items-center gap-1 border-b-2 transition-colors ${activeTab === 'midi' ? 'border-purple-500 text-purple-400 font-bold bg-white/5' : 'border-transparent text-white/50 hover:text-white'}`}
                            >
                                <Radio className="w-3.5 h-3.5" />
                                <span>MIDI</span>
                            </button>
                        </div>

                        {/* Scrollable Settings Panel Content */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
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
                                            <span className="font-mono text-purple-400">{config.smoothingTimeConstant}</span>
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
                                            <span className="font-mono text-purple-400">{config.sensitivity}x</span>
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
                                                    className={`flex-1 py-1.5 rounded-lg border text-xs font-mono transition-all ${config.targetFrameRate === fps ? 'border-purple-500 bg-purple-500/20 text-purple-400' : 'border-white/10 text-white/60 hover:text-white'}`}
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
                                            <span className="font-mono text-purple-400">{config.speed}x</span>
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
                                                    <span className="font-mono text-purple-400">{config.blurStrength}</span>
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
                                        <span className="text-xs font-medium text-purple-400 block">Particles System</span>
                                        <div>
                                            <div className="flex justify-between text-xs text-white/60 mb-1">
                                                <span>Emitter Count</span>
                                                <span className="font-mono text-purple-400">{config.particleCount}</span>
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
                                                <span className="font-mono text-purple-400">{config.particleLifespan}s</span>
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
                                                    <span className="font-mono text-purple-400">{config.lyricsDriveStrength || 1.0}x</span>
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
                                        <span className="text-xs font-semibold text-purple-400 block">12 Interactive Post-Processing Effects</span>
                                        
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

                                    {/* Layer 2 Blending */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-white/60">Activate Layer 2 Blend Overlay</span>
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
                                                        <span className="font-mono text-purple-400">{config.layer2Opacity}</span>
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
                                                                        <span className="text-purple-400 font-mono">{config.l2OscillatorFreq !== undefined ? config.l2OscillatorFreq : 1.0}</span>
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
                                                                        <span className="text-purple-400 font-mono">{config.l2OscillatorMusicMod !== undefined ? config.l2OscillatorMusicMod : 0.0}</span>
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
                                                                    <span className="text-purple-400 font-mono">{config.l2MusicDriveStrength !== undefined ? config.l2MusicDriveStrength : 0.5}</span>
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
                                                                        <span className="text-purple-400 font-mono">{config.l2CompDriveThreshold !== undefined ? config.l2CompDriveThreshold : 0.5}</span>
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

                                    {/* Automatic Background Cycling Rotation */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-white/60">Cyclical Background Slideshow</span>
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
                                                            <span className="font-mono text-purple-400">{config.backgroundRotationInterval || 4} seconds</span>
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
                                            <span className="text-purple-400 font-medium">Stage Mirror Slicing</span>
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
                                                        <span className="font-mono text-purple-400">{config.sliceCount}</span>
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
                                                        <span className="font-mono text-purple-400">{config.sliceRotation}°</span>
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
                                            </>
                                        )}
                                    </div>

                                    {/* Global Lighting & Bass shake */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-4">
                                        <span className="text-xs font-medium text-purple-400 block">Strobe & Shakes</span>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-white/60">Enable Active Beam Strips</span>
                                            <input 
                                                type="checkbox" 
                                                checked={config.enableBeams}
                                                onChange={e => setConfig(prev => ({ ...prev, enableBeams: e.target.checked }))}
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                        </div>

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
                                                    <span className="font-mono text-purple-400">{config.bassShakeIntensity}</span>
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
                                    {/* Text Overlay Option block */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-4">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-purple-400 font-medium">Graphic Text Overlays</span>
                                            <input 
                                                type="checkbox" 
                                                checked={config.enableText}
                                                onChange={e => setConfig(prev => ({ ...prev, enableText: e.target.checked }))}
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                        </div>
                                        {config.enableText && (
                                            <>
                                                <div>
                                                    <label className="text-xs text-white/60 block mb-1">Display Text Content</label>
                                                    <input 
                                                        type="text" 
                                                        value={config.textContent}
                                                        onChange={e => setConfig(prev => ({ ...prev, textContent: e.target.value }))}
                                                        className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-purple-500"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs text-white/60 mb-1">
                                                        <span>Overlay Text Size</span>
                                                        <span className="font-mono text-purple-400">{config.textSize}px</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="40" 
                                                        max="200" 
                                                        step="5"
                                                        value={config.textSize}
                                                        onChange={e => setConfig(prev => ({ ...prev, textSize: parseInt(e.target.value) }))}
                                                        className="w-full bg-white/10 h-1 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Sync Lyrics & Captions */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-4">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-purple-400 font-medium">Digital lyric overlays</span>
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
                                                            <Wand2 className="w-3.5 h-3.5 text-purple-400" />
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
                                        <span className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
                                            <Save className="w-4 h-4 text-purple-400" />
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

                                    {/* AI Generate Background Video */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
                                        <span className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
                                            <Video className="w-4 h-4 text-purple-400" />
                                            Generate AI Background (Veo)
                                        </span>
                                        <p className="text-[10.5px] text-white/50">Dream an original background loop using the high-physics Veo-3 generative video layer model.</p>
                                        
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
                                            disabled={isGeneratingVideo || !aiVideoPrompt.trim() || !aiRefImage}
                                            className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/30 text-white rounded-lg text-xs font-medium transition-colors flex justify-center items-center gap-1.5"
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
                                            <span className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
                                                <Image className="w-4 h-4 text-purple-400" />
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

                                    {/* Upload Ambient Backdrop Media assets - Layer 2 */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-semibold text-pink-400 flex items-center gap-1.5">
                                                <Layers2 className="w-4 h-4 text-pink-400" />
                                                Layer 2 Overlay Library
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
                                                    + Add To Layer 2
                                                </div>
                                            </label>
                                            
                                            {bgMedia2.length > 0 && (
                                                <button
                                                    onClick={() => setBgMedia2([])}
                                                    className="p-2 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 text-xs transition-all"
                                                    title="Clear active layer 2 backgrounds"
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
        </div>
    );
};

export default App;
