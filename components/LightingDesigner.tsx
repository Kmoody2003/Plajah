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

/** Fixture discovery wizard — zero-friction connection for all platforms. */
const FixtureDiscovery: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const svc = useLightingService();
  const [tab, setTab] = useState<'hue' | 'nanoleaf' | 'govee' | 'razer'>('razer');
  const [connecting, setConnecting] = useState<string | null>(null);

  // ── Nanoleaf pairing state (guided flow) ──
  const [nanoIp, setNanoIp] = useState('');
  const [nanoPairing, setNanoPairing] = useState(false);
  const [nanoCountdown, setNanoCountdown] = useState(0);

  // ── Govee key state ──
  const [goveeKey, setGoveeKey] = useState('');

  // ── Auto-reconnect all saved credentials on mount ──
  useEffect(() => {
    const hueToken = localStorage.getItem('hue_access_token');
    if (hueToken && !svc.connected.hue) smartLightingService.connectHue({ accessToken: hueToken });

    const nanoSaved = localStorage.getItem('nanoleaf_config');
    if (nanoSaved && !svc.connected.nanoleaf) {
      try { const c = JSON.parse(nanoSaved); smartLightingService.connectNanoleaf(c); } catch {}
    }

    const goveeSaved = localStorage.getItem('govee_api_key');
    if (goveeSaved && !svc.connected.govee) smartLightingService.connectGovee({ apiKey: goveeSaved });

    if (!svc.connected.razer) smartLightingService.connectRazer().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Hue: OAuth popup (user just signs into their Hue account) ──
  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (e.data?.type !== 'hue-auth' || !e.data.accessToken) return;
      localStorage.setItem('hue_access_token', e.data.accessToken);
      if (e.data.refreshToken) localStorage.setItem('hue_refresh_token', e.data.refreshToken);
      setConnecting('hue');
      await smartLightingService.connectHue({ accessToken: e.data.accessToken });
      setConnecting(null);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const connectHue = () => {
    const w = 500, h = 700;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    window.open('/api/hue/auth', 'hue-oauth', `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`);
    setConnecting('hue');
  };

  // ── Nanoleaf: guided pairing (hold button → we auto-grab the token) ──
  const startNanoPairing = async () => {
    if (!nanoIp.trim()) return;
    setNanoPairing(true);
    setNanoCountdown(30);

    // Countdown timer while user holds the power button
    const interval = setInterval(() => {
      setNanoCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);

    // Poll for the token (user has 30 seconds to hold the button)
    const ip = nanoIp.trim();
    let token: string | null = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const resp = await fetch(`http://${ip}:16021/api/v1/new`, { method: 'POST' });
        if (resp.ok) {
          const data = await resp.json();
          token = data.auth_token;
          break;
        }
      } catch { /* user hasn't pressed button yet */ }
    }

    clearInterval(interval);
    setNanoPairing(false);

    if (token) {
      const config = { ip, port: 16021, token };
      localStorage.setItem('nanoleaf_config', JSON.stringify(config));
      await smartLightingService.connectNanoleaf(config);
    }
  };

  // ── Govee: just paste the key from the consumer app ──
  const connectGovee = async () => {
    if (!goveeKey.trim()) return;
    setConnecting('govee');
    localStorage.setItem('govee_api_key', goveeKey.trim());
    await smartLightingService.connectGovee({ apiKey: goveeKey.trim() });
    setConnecting(null);
  };

  // ── Razer: one-click ──
  const connectRazer = async () => {
    setConnecting('razer');
    await smartLightingService.connectRazer();
    setConnecting(null);
  };

  const disconnect = (platform: 'hue' | 'nanoleaf' | 'govee' | 'razer') => {
    localStorage.removeItem(platform === 'hue' ? 'hue_access_token' : platform === 'nanoleaf' ? 'nanoleaf_config' : platform === 'govee' ? 'govee_api_key' : '');
    if (platform === 'hue') localStorage.removeItem('hue_refresh_token');
    smartLightingService.disconnectPlatform(platform);
  };

  const totalConnected = Object.values(svc.connected).filter(Boolean).length;

  const platforms = [
    { id: 'razer' as const, emoji: '🐍', label: 'Razer Chroma', color: '#00FF00', desc: 'Automatic — just have Synapse 3 running' },
    { id: 'hue' as const, emoji: '💡', label: 'Philips Hue', color: '#FFD700', desc: 'Sign in with your Hue account' },
    { id: 'govee' as const, emoji: '🎨', label: 'Govee', color: '#FF4466', desc: 'Paste key from Govee Home app' },
    { id: 'nanoleaf' as const, emoji: '🟢', label: 'Nanoleaf', color: '#00FF88', desc: 'Hold power button to pair' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Wifi size={18} className="text-[#FF8C00]" /> Connect Your Lights
          </h2>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {totalConnected > 0 ? `${totalConnected} platform${totalConnected > 1 ? 's' : ''} connected` : 'Select a platform to get started'}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-800"><X size={18} className="text-gray-400" /></button>
      </div>

      {/* Platform cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {platforms.map(p => {
          const connected = svc.connected[p.id] === true;
          const lightCount = svc.lights.filter(l => l.platform === p.id).length;
          const isActive = tab === p.id;

          return (
            <div key={p.id}>
              <button
                onClick={() => setTab(isActive ? tab : p.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                  connected
                    ? 'bg-green-500/5 border-green-500/20'
                    : isActive ? 'bg-white/[0.04] border-white/10' : 'bg-white/[0.02] border-white/[0.06] hover:border-white/10'
                }`}
              >
                <span className="text-2xl">{p.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{p.label}</span>
                    {connected && (
                      <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                        {lightCount > 0 ? `${lightCount} light${lightCount > 1 ? 's' : ''}` : 'Connected'}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">{p.desc}</p>
                </div>
                <ChevronRight size={16} className={`text-gray-600 transition-transform ${isActive ? 'rotate-90' : ''}`} />
              </button>

              {/* Expanded setup panel */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 py-4 space-y-3">
                      {/* ── Razer: fully automatic ── */}
                      {p.id === 'razer' && (
                        connected ? (
                          <div className="space-y-2">
                            <p className="text-xs text-green-400 font-bold flex items-center gap-1.5">✓ Razer Chroma is syncing with your music</p>
                            <p className="text-[10px] text-gray-500">Your keyboard, mouse, mousepad, and headset will react to the beat.</p>
                            <button onClick={() => disconnect('razer')}
                              className="text-[9px] font-bold text-red-400/60 hover:text-red-400 transition-colors">Disconnect</button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-xs text-gray-400">No API key needed — Plajah talks directly to Synapse 3 on your PC.</p>
                            <button onClick={connectRazer} disabled={connecting === 'razer'}
                              className="w-full py-3 rounded-xl text-sm font-bold bg-[#00FF00]/10 border border-[#00FF00]/30 text-[#00FF00] hover:bg-[#00FF00]/20 transition-all disabled:opacity-40">
                              {connecting === 'razer' ? 'Detecting…' : '🐍 Connect Razer Chroma'}
                            </button>
                            {svc.connected.razer === false && (
                              <p className="text-[10px] text-red-400/80">Synapse 3 not detected — make sure it's running on this machine.</p>
                            )}
                          </div>
                        )
                      )}

                      {/* ── Hue: OAuth sign-in ── */}
                      {p.id === 'hue' && (
                        connected ? (
                          <div className="space-y-2">
                            <p className="text-xs text-green-400 font-bold flex items-center gap-1.5">
                              ✓ {svc.lights.filter(l => l.platform === 'hue').length} lights, {svc.rooms.filter(r => r.platform === 'hue').length} rooms
                            </p>
                            <button onClick={() => disconnect('hue')}
                              className="text-[9px] font-bold text-red-400/60 hover:text-red-400 transition-colors">Disconnect Hue</button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-xs text-gray-400">Sign in with your Philips Hue account — no developer setup needed.</p>
                            <button onClick={connectHue} disabled={connecting === 'hue'}
                              className="w-full py-3 rounded-xl text-sm font-bold bg-[#FFD700]/10 border border-[#FFD700]/30 text-[#FFD700] hover:bg-[#FFD700]/20 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                              {connecting === 'hue' ? <><RefreshCw size={14} className="animate-spin" /> Waiting for Hue…</> : '🌐 Sign In with Hue'}
                            </button>
                          </div>
                        )
                      )}

                      {/* ── Govee: paste from consumer app ── */}
                      {p.id === 'govee' && (
                        connected ? (
                          <div className="space-y-2">
                            <p className="text-xs text-green-400 font-bold flex items-center gap-1.5">
                              ✓ {svc.lights.filter(l => l.platform === 'govee').length} Govee devices syncing
                            </p>
                            <button onClick={() => disconnect('govee')}
                              className="text-[9px] font-bold text-red-400/60 hover:text-red-400 transition-colors">Disconnect Govee</button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.06] space-y-2">
                              <p className="text-xs font-bold text-white/60">How to get your key (takes 30 seconds):</p>
                              <ol className="text-[10px] text-gray-400 space-y-1 list-decimal list-inside">
                                <li>Open the <span className="text-white/70 font-bold">Govee Home</span> app on your phone</li>
                                <li>Go to <span className="text-white/70 font-bold">Profile → ⚙️ Settings</span></li>
                                <li>Tap <span className="text-white/70 font-bold">"Apply for API Key"</span></li>
                                <li>Check your email — Govee sends the key in minutes</li>
                              </ol>
                            </div>
                            <input value={goveeKey} onChange={e => setGoveeKey(e.target.value)} placeholder="Paste your API key here…"
                              className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#FF4466]/40" />
                            <button onClick={connectGovee} disabled={connecting === 'govee' || !goveeKey.trim()}
                              className="w-full py-3 rounded-xl text-sm font-bold bg-[#FF4466]/10 border border-[#FF4466]/30 text-[#FF4466] hover:bg-[#FF4466]/20 transition-all disabled:opacity-40">
                              {connecting === 'govee' ? 'Connecting…' : '🎨 Connect Govee'}
                            </button>
                            {svc.connected.govee === false && (
                              <p className="text-[10px] text-red-400/80">Connection failed — double check the API key.</p>
                            )}
                          </div>
                        )
                      )}

                      {/* ── Nanoleaf: guided pairing ── */}
                      {p.id === 'nanoleaf' && (
                        connected ? (
                          <div className="space-y-2">
                            <p className="text-xs text-green-400 font-bold flex items-center gap-1.5">✓ Nanoleaf panels syncing</p>
                            <button onClick={() => disconnect('nanoleaf')}
                              className="text-[9px] font-bold text-red-400/60 hover:text-red-400 transition-colors">Disconnect Nanoleaf</button>
                          </div>
                        ) : nanoPairing ? (
                          <div className="text-center py-6 space-y-4">
                            <div className="text-5xl animate-pulse">✋</div>
                            <p className="text-sm font-bold text-[#00FF88]">Hold the power button on your Nanoleaf now</p>
                            <p className="text-xs text-gray-400">Keep holding for 5-7 seconds until the LED blinks</p>
                            <div className="text-2xl font-mono font-bold text-white/60">{nanoCountdown}s</div>
                            <p className="text-[10px] text-gray-600">Plajah is listening for your panels…</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-xs text-gray-400">Enter your Nanoleaf's IP address (check your router or the Nanoleaf app), then hold the power button to pair.</p>
                            <input value={nanoIp} onChange={e => setNanoIp(e.target.value)} placeholder="192.168.1.xxx"
                              className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#00FF88]/40" />
                            <button onClick={startNanoPairing} disabled={!nanoIp.trim()}
                              className="w-full py-3 rounded-xl text-sm font-bold bg-[#00FF88]/10 border border-[#00FF88]/30 text-[#00FF88] hover:bg-[#00FF88]/20 transition-all disabled:opacity-40">
                              🟢 Start Pairing
                            </button>
                            {svc.connected.nanoleaf === false && (
                              <p className="text-[10px] text-red-400/80">Pairing failed — make sure you're on the same WiFi network as your Nanoleaf.</p>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Screen-as-fixture option */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🖥️</span>
            <div>
              <p className="text-sm font-bold text-white">Screen-as-Fixture</p>
              <p className="text-[10px] text-gray-500">Open Plajah in another browser tab — it'll sync automatically via the LD engine.</p>
            </div>
            <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FF8C00]/20 text-[#FF8C00]">Auto</span>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-800">
        <button onClick={onClose}
          className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-sm hover:bg-white/10 transition-colors">
          Done
        </button>
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
