import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ArrowLeft, Lightbulb, Plus, Settings, Zap, Play, Pause, ChevronRight,
  Sparkles, Sun, Moon, Monitor, Wifi, Music, Palette, GripVertical,
  Activity, Volume2, Eye, EyeOff, Trash2, RefreshCw, Search, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import {
  createDefaultShow, hslToCSS, hslToHex, lerpColor,
  type LightShow, type Scene, type LDColor, type Fixture, type FixtureKind,
} from '../services/lightShowEngine';
import { ldBridge, type AudioSnapshot } from '../services/ldBridge';
import { smartLightingService, useLightingService } from '../services/smartLightingService';

// ── Constants ───────────────────────────────────────────────────────────────

const AMBER = '#FF8C00';
const MAGENTA = '#D40055';

const FIXTURE_ICONS: Record<string, string> = {
  SMART_BULB: '💡', SMART_STRIP: '🌈', SCREEN: '🖥️',
  DMX_RGB: '🔴', DMX_MOVING: '🎯', DMX_STROBE: '⚡',
  DMX_FOG: '🌫️', DMX_LASER: '✨', RAZER_CHROMA: '🐍',
  CUSTOM: '🔧',
};

const MOOD_LABELS: Record<string, string> = {
  intimate: '🕯️ Intimate', energetic: '⚡ Energetic', dramatic: '🎭 Dramatic',
  calm: '🌊 Calm', celebratory: '🎉 Celebratory',
};

// ── Sub-components ──────────────────────────────────────────────────────────

/** Audio-reactive VU meters for bass/mid/treble. */
const AudioMeters: React.FC<{ audio: AudioSnapshot }> = ({ audio }) => (
  <div className="flex items-end gap-1 h-6">
    <div className="w-1.5 rounded-t-full bg-red-500/80 transition-all duration-75"
      style={{ height: `${Math.round(audio.bass * 100)}%` }} />
    <div className="w-1.5 rounded-t-full bg-yellow-500/80 transition-all duration-75"
      style={{ height: `${Math.round(audio.mid * 100)}%` }} />
    <div className="w-1.5 rounded-t-full bg-blue-500/80 transition-all duration-75"
      style={{ height: `${Math.round(audio.treble * 100)}%` }} />
  </div>
);

/** A small color dot with glow. */
const ColorDot: React.FC<{ color: LDColor; size?: number; onClick?: () => void }> = ({ color, size = 12, onClick }) => (
  <div
    className={`rounded-full shrink-0 ${onClick ? 'cursor-pointer hover:scale-125' : ''} transition-transform`}
    style={{
      width: size, height: size,
      backgroundColor: hslToCSS(color),
      boxShadow: `0 0 ${size}px ${hslToCSS(color)}88`,
    }}
    onClick={onClick}
  />
);

/** Fixture discovery wizard — connection forms for Hue, Nanoleaf, Govee, Razer. */
const FixtureDiscovery: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const svc = useLightingService();
  const [tab, setTab] = useState<'hue' | 'nanoleaf' | 'govee' | 'razer'>('hue');
  const [hueToken, setHueToken] = useState('');
  const [nanoleafIp, setNanoleafIp] = useState('');
  const [nanoleafToken, setNanoleafToken] = useState('');
  const [goveeKey, setGoveeKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const connect = async () => {
    setConnecting(true);
    setStatus(null);
    try {
      if (tab === 'hue' && hueToken) {
        await smartLightingService.connectHue({ accessToken: hueToken });
        setStatus(`✓ ${svc.lights.filter(l => l.platform === 'hue').length} Hue lights found`);
      } else if (tab === 'nanoleaf' && nanoleafIp && nanoleafToken) {
        await smartLightingService.connectNanoleaf({ ip: nanoleafIp, port: 16021, token: nanoleafToken });
        setStatus('✓ Nanoleaf connected');
      } else if (tab === 'govee' && goveeKey) {
        await smartLightingService.connectGovee({ apiKey: goveeKey });
        setStatus(`✓ ${svc.lights.filter(l => l.platform === 'govee').length} Govee devices found`);
      } else if (tab === 'razer') {
        const ok = await smartLightingService.connectRazer();
        setStatus(ok ? '✓ Razer Chroma connected' : '✗ Synapse 3 not detected');
      }
    } catch {
      setStatus('✗ Connection failed');
    }
    setConnecting(false);
  };

  const platforms = [
    { id: 'hue' as const, label: 'Hue', color: '#FFD700', count: svc.lights.filter(l => l.platform === 'hue').length },
    { id: 'nanoleaf' as const, label: 'Nanoleaf', color: '#00FF88', count: svc.lights.filter(l => l.platform === 'nanoleaf').length },
    { id: 'govee' as const, label: 'Govee', color: '#FF4466', count: svc.lights.filter(l => l.platform === 'govee').length },
    { id: 'razer' as const, label: 'Razer', color: '#00FF00', count: svc.lights.filter(l => l.platform === 'razer').length },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Search size={18} className="text-[#FF8C00]" /> Discover Fixtures
        </h2>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-800"><X size={18} className="text-gray-400" /></button>
      </div>

      {/* Platform tabs */}
      <div className="flex border-b border-gray-800">
        {platforms.map(p => (
          <button
            key={p.id}
            onClick={() => { setTab(p.id); setStatus(null); }}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors relative ${
              tab === p.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {p.label}
            {p.count > 0 && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: p.color + '33', color: p.color }}>{p.count}</span>}
            {tab === p.id && <motion.div layoutId="disc-tab" className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: p.color }} />}
          </button>
        ))}
      </div>

      <div className="flex-1 p-6 space-y-4">
        {tab === 'hue' && (
          <>
            <label className="block text-xs text-gray-400 uppercase tracking-wider">Hue Access Token</label>
            <input value={hueToken} onChange={e => setHueToken(e.target.value)} placeholder="paste token from meethue.com"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-[#FFD700] focus:outline-none" />
            <p className="text-[10px] text-gray-600">Register at meethue.com/remote, OAuth → copy access_token</p>
          </>
        )}
        {tab === 'nanoleaf' && (
          <>
            <label className="block text-xs text-gray-400 uppercase tracking-wider">Nanoleaf IP</label>
            <input value={nanoleafIp} onChange={e => setNanoleafIp(e.target.value)} placeholder="192.168.1.xxx"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-[#00FF88] focus:outline-none" />
            <label className="block text-xs text-gray-400 uppercase tracking-wider mt-3">Auth Token</label>
            <input value={nanoleafToken} onChange={e => setNanoleafToken(e.target.value)} placeholder="hold power 5s, then Generate Token"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-[#00FF88] focus:outline-none" />
          </>
        )}
        {tab === 'govee' && (
          <>
            <label className="block text-xs text-gray-400 uppercase tracking-wider">Govee API Key</label>
            <input value={goveeKey} onChange={e => setGoveeKey(e.target.value)} placeholder="from Govee Home → gear → Apply for API Key"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-[#FF4466] focus:outline-none" />
          </>
        )}
        {tab === 'razer' && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">🐍</div>
            <p className="text-sm text-gray-400 mb-1">Razer Chroma auto-connects via Synapse 3.</p>
            <p className="text-xs text-gray-600">Make sure Synapse 3 is running on this machine.</p>
          </div>
        )}

        {status && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className={`text-sm font-medium ${status.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}
          >{status}</motion.p>
        )}
      </div>

      <div className="p-4 border-t border-gray-800 flex gap-3">
        <button onClick={connect} disabled={connecting}
          className="flex-1 py-3 rounded-xl bg-[#FF8C00]/20 border border-[#FF8C00]/40 text-[#FF8C00] font-bold text-sm hover:bg-[#FF8C00]/30 transition-colors disabled:opacity-50"
        >
          {connecting ? 'Connecting…' : 'Connect'}
        </button>
        <button onClick={onClose} className="px-6 py-3 rounded-xl bg-gray-800 text-gray-400 text-sm hover:bg-gray-700">Done</button>
      </div>
    </motion.div>
  );
};

/** Color picker popover — lets user pick a color and add it to the palette. */
const PaletteEditor: React.FC<{
  palette: LDColor[];
  onUpdate: (palette: LDColor[]) => void;
}> = ({ palette, onUpdate }) => {
  const [pickerOpen, setPickerOpen] = useState(false);

  const addColor = (hex: string) => {
    // Parse hex → HSL
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let s = 0, h = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
        case g: h = ((b - r) / d + 2) * 60; break;
        case b: h = ((r - g) / d + 4) * 60; break;
      }
    }
    onUpdate([...palette, { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }]);
  };

  const removeColor = (index: number) => {
    onUpdate(palette.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Palette</h3>
        <label className="p-1 rounded hover:bg-gray-800 cursor-pointer transition-colors">
          <Plus size={14} className="text-gray-500" />
          <input type="color" className="sr-only" onChange={e => addColor(e.target.value)} />
        </label>
      </div>

      {/* Gradient strip */}
      {palette.length > 0 && (
        <div className="flex h-8 rounded-lg overflow-hidden border border-gray-800">
          {palette.map((color, i) => (
            <div
              key={i}
              className="flex-1 relative group cursor-pointer"
              style={{ backgroundColor: hslToCSS(color) }}
              onClick={() => removeColor(i)}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <X size={10} className="text-white" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Color dots */}
      <div className="flex flex-wrap gap-2">
        {palette.map((color, i) => (
          <ColorDot key={i} color={color} size={16} onClick={() => removeColor(i)} />
        ))}
      </div>
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────────────────

interface LightingDesignerProps {
  onClose: () => void;
}

export default function LightingDesigner({ onClose }: LightingDesignerProps) {
  const { currentTrack, currentAlbum, isPlaying, analyser } = useGlobalPlayer();
  const svc = useLightingService();

  const [show, setShow] = useState<LightShow>(createDefaultShow());
  const [activeSceneId, setActiveSceneId] = useState<string>(show.scenes[0]?.id || '');
  const [intensity, setIntensity] = useState<number>(85);
  const [speed, setSpeed] = useState<number>(1.0);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [boardTab, setBoardTab] = useState<'scenes' | 'fixtures' | 'palette'>('scenes');
  const [audio, setAudio] = useState<AudioSnapshot>({ bass: 0, mid: 0, treble: 0, level: 0, isBeat: false, estimatedBPM: 0 });
  const [liveColor, setLiveColor] = useState<string>('hsl(280, 85%, 45%)');

  const activeScene = show.scenes.find(s => s.id === activeSceneId) || show.scenes[0];

  // ── Bridge lifecycle ──────────────────────────────────────────────────────

  useEffect(() => {
    ldBridge.start(analyser, show);
    return () => ldBridge.stop();
  }, []); // start once on mount

  // Update bridge when analyser changes
  useEffect(() => { ldBridge.updateAnalyser(analyser); }, [analyser]);

  // Update bridge when show changes
  useEffect(() => { ldBridge.updateShow(show); }, [show]);

  // Subscribe to bridge state for audio meters + live color
  useEffect(() => {
    return ldBridge.subscribe(() => {
      setAudio({ ...ldBridge.state.lastAudio });
      setLiveColor(ldBridge.getCurrentColorCSS());
    });
  }, []);

  // Auto-extract palette from album art
  useEffect(() => {
    const artUrl = currentTrack?.albumCover || currentAlbum?.coverImage;
    if (artUrl && ldBridge.state.autoPalette) {
      ldBridge.extractPaletteFromAlbumArt(artUrl).then(palette => {
        if (palette.length > 0) {
          setShow(prev => {
            const scenes = prev.scenes.map(s =>
              s.id === activeSceneId ? { ...s, palette } : s
            );
            return { ...prev, scenes };
          });
        }
      });
    }
  }, [currentTrack?.albumCover, currentAlbum?.coverImage]);

  // Sync intensity/speed to show
  useEffect(() => {
    setShow(prev => ({ ...prev, masterIntensity: intensity / 100, masterSpeed: speed }));
  }, [intensity, speed]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSceneSelect = (sceneId: string) => {
    setActiveSceneId(sceneId);
    const scene = show.scenes.find(s => s.id === sceneId);
    if (scene) ldBridge.setPalette(scene.palette);
  };

  const togglePartyMode = () => {
    setShow(prev => ({ ...prev, partyMode: !prev.partyMode }));
  };

  const handlePaletteUpdate = (palette: LDColor[]) => {
    ldBridge.setPalette(palette);
    setShow(prev => {
      const scenes = prev.scenes.map(s =>
        s.id === activeSceneId ? { ...s, palette } : s
      );
      return { ...prev, scenes };
    });
  };

  // ── Stage gradient ────────────────────────────────────────────────────────

  const stageGradient = useMemo(() => {
    if (!activeScene || activeScene.palette.length === 0)
      return 'radial-gradient(circle at 50% 50%, #111 0%, #000 100%)';

    const c1 = hslToCSS(activeScene.palette[0]);
    const c2 = activeScene.palette.length > 1 ? hslToCSS(activeScene.palette[1]) : '#000';
    return `radial-gradient(ellipse at 50% 30%, ${c1}44 0%, ${c2}22 50%, #000 100%)`;
  }, [activeScene]);

  const connectedCount = svc.lights.length;
  const bpmDisplay = audio.estimatedBPM > 0 ? `${audio.estimatedBPM} BPM` : '— BPM';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full bg-black text-white overflow-hidden font-sans">

      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-900/80 bg-black/90 backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-800 transition-colors">
            <ArrowLeft size={18} className="text-gray-400" />
          </button>
          <div className="p-1.5 bg-[#FF8C00]/15 rounded-lg">
            <Lightbulb size={20} className="text-[#FF8C00]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">LD</h1>
            <p className="text-[10px] text-gray-500 -mt-0.5 hidden sm:block">Light is the invisible actor.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* BPM badge */}
          {audio.estimatedBPM > 0 && (
            <motion.div
              animate={{ scale: audio.isBeat ? [1, 1.15, 1] : 1 }}
              transition={{ duration: 0.15 }}
              className="px-2.5 py-1 rounded-full bg-gray-900 border border-gray-800 text-xs font-mono text-[#FF8C00]"
            >
              {bpmDisplay}
            </motion.div>
          )}

          {/* Audio meters */}
          <AudioMeters audio={audio} />

          {/* Connected fixtures badge */}
          <button
            onClick={() => setShowDiscovery(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800 hover:border-gray-600 transition-colors"
          >
            <Wifi size={12} className={connectedCount > 0 ? 'text-green-500' : 'text-gray-500'} />
            <span className="text-xs font-medium text-gray-300">{connectedCount}</span>
          </button>

          <button className="p-2 rounded-full hover:bg-gray-800 transition-colors">
            <Settings size={18} className="text-gray-400" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">

        {/* ── Left: Stage ────────────────────────────────────────────────── */}
        <div className="flex-1 lg:w-[60%] flex flex-col relative">

          {/* Stage preview */}
          <div className="flex-1 relative overflow-hidden bg-[#030303] flex flex-col items-center justify-center">
            {/* Live ambient wash */}
            <motion.div
              className="absolute inset-0 z-0"
              animate={{ background: stageGradient, opacity: intensity / 100 }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            />

            {/* Live color orb — the actual bridge output color */}
            {show.partyMode && (
              <motion.div
                className="absolute z-[1]"
                style={{
                  width: 200 + audio.level * 100,
                  height: 200 + audio.level * 100,
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${liveColor}66 0%, transparent 70%)`,
                  filter: 'blur(40px)',
                }}
                animate={{
                  scale: audio.isBeat ? [1, 1.3, 1] : 1,
                  opacity: 0.4 + audio.level * 0.6,
                }}
                transition={{ duration: audio.isBeat ? 0.15 : 0.4 }}
              />
            )}

            {/* Stage floor line */}
            <div className="z-10 text-center flex flex-col items-center">
              <div className="w-72 h-36 border-b-2 border-gray-800/30 mb-6 relative">
                {/* Fixture position indicators on the rig bar */}
                {show.fixtures.length > 0 ? (
                  show.fixtures.map((f, i) => (
                    <div
                      key={f.id}
                      className="absolute top-0 w-5 h-5 rounded-full border border-white/20 flex items-center justify-center text-[10px]"
                      style={{ left: `${f.position.x * 100}%`, transform: 'translateX(-50%)' }}
                    >
                      {FIXTURE_ICONS[f.kind] || '💡'}
                    </div>
                  ))
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-[10px] text-gray-700 tracking-wider uppercase">No fixtures placed</p>
                  </div>
                )}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-0.5 bg-gradient-to-r from-transparent via-gray-600/50 to-transparent blur-[1px]" />
              </div>
              {!show.partyMode && (
                <h2 className="text-gray-600 font-light tracking-[0.2em] text-xs uppercase">Cue Mode</h2>
              )}
              {show.partyMode && (
                <motion.h2
                  className="text-xs font-medium tracking-[0.15em] uppercase"
                  style={{ color: AMBER }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  Party Mode Active
                </motion.h2>
              )}
            </div>
          </div>

          {/* Timeline & player bar */}
          <div className="h-28 bg-[#050505] border-t border-gray-900 p-3 flex flex-col justify-end relative z-10">
            {currentTrack ? (
              <div className="mb-2 flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                  {currentTrack.albumCover ? (
                    <img src={currentTrack.albumCover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music size={14} className="text-gray-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{currentTrack.title}</p>
                  <p className="text-xs text-gray-500 truncate">{currentTrack.artist}</p>
                </div>
              </div>
            ) : (
              <div className="mb-2 flex items-center gap-2">
                <Music size={14} className="text-gray-700" />
                <p className="text-xs text-gray-600">Play a track to sync lights</p>
              </div>
            )}

            {/* Waveform placeholder with beat markers */}
            <div className="w-full h-8 bg-gray-900/50 rounded-md relative flex items-center px-2 border border-gray-800/60 overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-[#FF8C00]/10 rounded-l-md w-1/3" />
              <div className="absolute left-1/3 w-[2px] h-full bg-[#FF8C00] shadow-[0_0_8px_#FF8C00]" />
              <div className="w-full flex justify-between items-center z-10 px-4 opacity-40">
                {[...Array(24)].map((_, i) => (
                  <motion.div
                    key={i}
                    className={`w-0.5 rounded-full ${i % 4 === 0 ? 'bg-white' : 'bg-gray-600'}`}
                    animate={{ height: i % 4 === 0 && audio.isBeat ? 12 : i % 4 === 0 ? 6 : 3 }}
                    transition={{ duration: 0.1 }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Board ───────────────────────────────────────────────── */}
        <div className="lg:w-[40%] flex flex-col bg-[#080808] border-l border-gray-900 overflow-hidden">

          {/* Party Mode toggle */}
          <div className="p-4 border-b border-gray-900 shrink-0">
            <button
              onClick={togglePartyMode}
              className={`w-full py-3.5 rounded-xl flex items-center justify-center gap-3 transition-all duration-300 relative overflow-hidden ${
                show.partyMode
                  ? 'bg-gradient-to-r from-[#FF8C00]/20 to-[#D40055]/20 border border-[#FF8C00]/50 text-white'
                  : 'bg-gray-900 border border-gray-800 text-gray-400'
              }`}
            >
              <Zap size={18} className={show.partyMode ? 'text-[#FF8C00]' : ''} />
              <span className="font-semibold tracking-wide text-sm">Sync My Lights</span>
              {show.partyMode && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-[#FF8C00]/10 to-[#D40055]/10"
                  animate={{ opacity: [0, 0.6, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </button>
          </div>

          {/* Board tabs */}
          <div className="flex border-b border-gray-900 shrink-0">
            {(['scenes', 'fixtures', 'palette'] as const).map(t => (
              <button
                key={t}
                onClick={() => setBoardTab(t)}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors relative ${
                  boardTab === t ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t}
                {boardTab === t && (
                  <motion.div layoutId="board-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF8C00]" />
                )}
              </button>
            ))}
          </div>

          {/* Board content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <AnimatePresence mode="sync">
              {boardTab === 'scenes' && (
                <motion.div key="scenes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">

                  {/* Master controls */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Master</h3>
                    <div className="space-y-3 p-3 rounded-xl bg-gray-900/30 border border-gray-800/30">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] text-gray-500">
                          <span>Intensity</span>
                          <span>{intensity}%</span>
                        </div>
                        <input
                          type="range" min={0} max={100} value={intensity}
                          onChange={e => setIntensity(Number(e.target.value))}
                          className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#FF8C00]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] text-gray-500">
                          <span>Speed</span>
                          <span>{speed.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range" min={0.5} max={2.0} step={0.1} value={speed}
                          onChange={e => setSpeed(Number(e.target.value))}
                          className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#D40055]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Scene presets */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scenes</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {show.scenes.map(scene => (
                        <motion.button
                          key={scene.id}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleSceneSelect(scene.id)}
                          className={`p-3 rounded-xl border text-left flex flex-col gap-1.5 transition-colors ${
                            activeSceneId === scene.id
                              ? 'bg-gray-800/80 border-[#FF8C00]/40'
                              : 'bg-gray-900/50 border-gray-800/50 hover:bg-gray-800/40'
                          }`}
                        >
                          <span className="text-xs font-medium text-white">{scene.name}</span>
                          {scene.mood && <span className="text-[9px] text-gray-500">{MOOD_LABELS[scene.mood] || scene.mood}</span>}
                          <div className="flex gap-1 mt-0.5">
                            {scene.palette.map((c, i) => (
                              <ColorDot key={i} color={c} size={8} />
                            ))}
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {boardTab === 'fixtures' && (
                <motion.div key="fixtures" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

                  {/* Connected smart lights */}
                  {svc.lights.length > 0 ? (
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Connected ({svc.lights.length})</h3>
                      {svc.lights.map(light => (
                        <div key={light.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-900/50 border border-gray-800/50">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                            style={{
                              backgroundColor: light.on ? `rgb(${light.color.join(',')})` : '#1a1a1a',
                              boxShadow: light.on ? `0 0 10px rgba(${light.color.join(',')},0.4)` : 'none',
                            }}
                          >
                            {light.on ? '💡' : '⬛'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{light.name}</p>
                            <p className="text-[10px] text-gray-500 uppercase">{light.platform}</p>
                          </div>
                          <input
                            type="range" min={0} max={100} value={light.brightness}
                            onChange={e => smartLightingService.setBrightness(light.id, parseInt(e.target.value))}
                            className="w-16 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#FF8C00]"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-3xl mb-3">🔌</div>
                      <p className="text-sm text-gray-400 mb-1">No fixtures connected</p>
                      <p className="text-xs text-gray-600 mb-4">Add smart lights to sync with your music</p>
                      <button
                        onClick={() => setShowDiscovery(true)}
                        className="px-4 py-2 rounded-lg bg-[#FF8C00]/20 border border-[#FF8C00]/40 text-[#FF8C00] text-xs font-bold hover:bg-[#FF8C00]/30 transition-colors"
                      >
                        <Plus size={14} className="inline mr-1.5" />Discover Fixtures
                      </button>
                    </div>
                  )}

                  {/* Add fixtures button */}
                  {svc.lights.length > 0 && (
                    <button
                      onClick={() => setShowDiscovery(true)}
                      className="w-full py-2.5 rounded-xl border border-dashed border-gray-700 text-gray-500 text-xs font-medium hover:border-[#FF8C00]/40 hover:text-[#FF8C00] transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus size={14} /> Add More Fixtures
                    </button>
                  )}
                </motion.div>
              )}

              {boardTab === 'palette' && (
                <motion.div key="palette" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                  <PaletteEditor
                    palette={activeScene?.palette || []}
                    onUpdate={handlePaletteUpdate}
                  />

                  {/* Auto-extract toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-900/30 border border-gray-800/30">
                    <div>
                      <p className="text-xs font-medium text-white">Auto-extract from art</p>
                      <p className="text-[10px] text-gray-500">Pull colors from album artwork</p>
                    </div>
                    <button
                      onClick={() => { ldBridge.state.autoPalette = !ldBridge.state.autoPalette; }}
                      className={`w-10 h-5 rounded-full transition-colors relative ${
                        ldBridge.state.autoPalette ? 'bg-[#FF8C00]' : 'bg-gray-700'
                      }`}
                    >
                      <motion.div
                        className="w-4 h-4 rounded-full bg-white absolute top-0.5"
                        animate={{ left: ldBridge.state.autoPalette ? 22 : 2 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>

                  {/* Live output preview */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Live Output</h3>
                    <div
                      className="h-16 rounded-xl border border-gray-800/50 transition-colors duration-100"
                      style={{ background: `linear-gradient(135deg, ${liveColor}, #000)` }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* AI suggestion bar */}
          <div className="p-3 bg-[#FF8C00]/5 border-t border-[#FF8C00]/10 flex items-center gap-2.5 shrink-0">
            <Sparkles size={14} className="text-[#FF8C00] shrink-0" />
            <span className="text-[11px] font-medium text-[#FF8C00]/70">
              {currentTrack && audio.estimatedBPM > 0
                ? `✨ ${audio.estimatedBPM} BPM detected — palette auto-syncing with "${currentTrack.title}"`
                : currentTrack
                  ? `Analyzing "${currentTrack.title}"…`
                  : 'Play a track to start designing your show.'}
            </span>
          </div>
        </div>
      </div>

      {/* Fixture discovery overlay */}
      <AnimatePresence>
        {showDiscovery && (
          <FixtureDiscovery onClose={() => setShowDiscovery(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
