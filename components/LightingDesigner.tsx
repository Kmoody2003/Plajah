import React, { useState, useEffect } from 'react';
import { ChevronRight, RefreshCw, Wifi, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { createDefaultShow } from '../services/lightShowEngine';
import { ldBridge } from '../services/ldBridge';
import { smartLightingService, useLightingService } from '../services/smartLightingService';
import { boardEngine, useBoard } from '../services/lighting/boardEngine';
import { LightBoard } from './lighting/LightBoard';

// ── Sub-components ──────────────────────────────────────────────────────────

/** Fixture discovery wizard — zero-friction connection for all platforms. */
export const FixtureDiscovery: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const svc = useLightingService();
  const [tab, setTab] = useState<'hue' | 'nanoleaf' | 'govee' | 'razer'>('razer');
  const [connecting, setConnecting] = useState<string | null>(null);

  // ── Nanoleaf state ──
  type NanoDevice = { ip: string; port: number; name: string; model: string };
  const [nanoScanning, setNanoScanning] = useState(false);
  const [nanoDevices, setNanoDevices] = useState<NanoDevice[]>([]);
  const [nanoPairing, setNanoPairing] = useState<NanoDevice | null>(null);
  const [nanoCountdown, setNanoCountdown] = useState(0);
  const [nanoManualIp, setNanoManualIp] = useState('');

  // ── Govee state ──
  type GoveeDevice = { ip: string; device: string; model: string; name: string };
  const [goveeScanning, setGoveeScanning] = useState(false);
  const [goveeLanDevices, setGoveeLanDevices] = useState<GoveeDevice[]>([]);
  const [goveeKey, setGoveeKey] = useState('');
  const [goveeMode, setGoveeMode] = useState<'scan' | 'key'>('scan');

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

  // ── Hue: OAuth popup ──
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

  // ── Nanoleaf: scan network via server SSDP, then guided pairing ──
  const scanNanoleaf = async () => {
    setNanoScanning(true);
    setNanoDevices([]);
    try {
      const resp = await fetch('/api/nanoleaf/discover');
      const data = await resp.json();
      setNanoDevices(data.devices || []);
    } catch {}
    setNanoScanning(false);
  };

  const startNanoPairing = async (device: NanoDevice) => {
    setNanoPairing(device);
    setNanoCountdown(30);

    const interval = setInterval(() => {
      setNanoCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);

    // Poll the server-side pairing proxy (avoids browser CORS)
    let token: string | null = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const resp = await fetch('/api/nanoleaf/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: device.ip, port: device.port }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.token) { token = data.token; break; }
        }
      } catch {}
    }

    clearInterval(interval);
    setNanoPairing(null);

    if (token) {
      const config = { ip: device.ip, port: device.port, token };
      localStorage.setItem('nanoleaf_config', JSON.stringify(config));
      await smartLightingService.connectNanoleaf(config);
    }
  };

  // ── Govee: scan LAN first (zero-key), API key as fallback ──
  const scanGovee = async () => {
    setGoveeScanning(true);
    setGoveeLanDevices([]);
    try {
      const resp = await fetch('/api/govee/discover');
      const data = await resp.json();
      setGoveeLanDevices(data.devices || []);
    } catch {}
    setGoveeScanning(false);
  };

  const connectGoveeLan = async (device: GoveeDevice) => {
    // For LAN-discovered devices, we still need the cloud API key for the existing adapter
    // But we can store the device info for future LAN-only control
    setConnecting('govee');
    // If we have a saved API key, use it; otherwise prompt
    const saved = localStorage.getItem('govee_api_key');
    if (saved) {
      await smartLightingService.connectGovee({ apiKey: saved });
    } else {
      setGoveeMode('key');
    }
    setConnecting(null);
  };

  const connectGoveeKey = async () => {
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
    { id: 'govee' as const, emoji: '🎨', label: 'Govee', color: '#FF4466', desc: 'Auto-discover on your network' },
    { id: 'nanoleaf' as const, emoji: '🟢', label: 'Nanoleaf', color: '#00FF88', desc: 'Auto-discover + one-tap pair' },
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

                      {/* ── Govee: auto-scan LAN + API key fallback ── */}
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
                            {/* Mode toggle */}
                            <div className="flex gap-2">
                              <button onClick={() => setGoveeMode('scan')}
                                className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                  goveeMode === 'scan' ? 'bg-[#FF4466]/10 border-[#FF4466]/30 text-[#FF4466]' : 'border-white/10 text-gray-500'
                                }`}>
                                📡 Scan Network
                              </button>
                              <button onClick={() => setGoveeMode('key')}
                                className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                  goveeMode === 'key' ? 'bg-[#FF4466]/10 border-[#FF4466]/30 text-[#FF4466]' : 'border-white/10 text-gray-500'
                                }`}>
                                🔑 API Key
                              </button>
                            </div>

                            {goveeMode === 'scan' ? (
                              <>
                                <p className="text-xs text-gray-400">Plajah will scan your local network for Govee devices — no API key needed.</p>
                                <button onClick={scanGovee} disabled={goveeScanning}
                                  className="w-full py-3 rounded-xl text-sm font-bold bg-[#FF4466]/10 border border-[#FF4466]/30 text-[#FF4466] hover:bg-[#FF4466]/20 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                                  {goveeScanning ? <><RefreshCw size={14} className="animate-spin" /> Scanning…</> : '📡 Scan for Govee Devices'}
                                </button>
                                {!goveeScanning && goveeLanDevices.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Found {goveeLanDevices.length} device{goveeLanDevices.length > 1 ? 's' : ''}</p>
                                    {goveeLanDevices.map((d, i) => (
                                      <button key={i} onClick={() => connectGoveeLan(d)}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-[#FF4466]/30 transition-all text-left">
                                        <span className="text-lg">🎨</span>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-bold text-white truncate">{d.name}</p>
                                          <p className="text-[9px] text-gray-500">{d.model} · {d.ip}</p>
                                        </div>
                                        <span className="text-[8px] font-black text-[#FF4466] uppercase tracking-wider">Connect</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {!goveeScanning && goveeLanDevices.length === 0 && svc.connected.govee === undefined && (
                                  <p className="text-[10px] text-gray-600">No devices found? Make sure your Govee lights are on and on the same WiFi, or try the API Key method.</p>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.06] space-y-2">
                                  <p className="text-xs font-bold text-white/60">How to get your key (takes 30 seconds):</p>
                                  <ol className="text-[10px] text-gray-400 space-y-1 list-decimal list-inside">
                                    <li>Open the <span className="text-white/70 font-bold">Govee Home</span> app on your phone</li>
                                    <li>Tap <span className="text-white/70 font-bold">Profile → ⚙️ → Apply for API Key</span></li>
                                    <li>Check your email — Govee sends the key in minutes</li>
                                  </ol>
                                </div>
                                <input value={goveeKey} onChange={e => setGoveeKey(e.target.value)} placeholder="Paste your API key here…"
                                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#FF4466]/40" />
                                <button onClick={connectGoveeKey} disabled={connecting === 'govee' || !goveeKey.trim()}
                                  className="w-full py-3 rounded-xl text-sm font-bold bg-[#FF4466]/10 border border-[#FF4466]/30 text-[#FF4466] hover:bg-[#FF4466]/20 transition-all disabled:opacity-40">
                                  {connecting === 'govee' ? 'Connecting…' : '🎨 Connect Govee'}
                                </button>
                              </>
                            )}
                            {svc.connected.govee === false && (
                              <p className="text-[10px] text-red-400/80">Connection failed — try scanning again or use an API key.</p>
                            )}
                          </div>
                        )
                      )}

                      {/* ── Nanoleaf: auto-scan + guided pairing ── */}
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
                            <p className="text-sm font-bold text-[#00FF88]">Hold the power button on your {nanoPairing.name} now</p>
                            <p className="text-xs text-gray-400">Keep holding for 5-7 seconds until the LED blinks</p>
                            <div className="text-2xl font-mono font-bold text-white/60">{nanoCountdown}s</div>
                            <p className="text-[10px] text-gray-600">Plajah is listening for pairing confirmation…</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-xs text-gray-400">Plajah will scan your network to find Nanoleaf panels automatically.</p>
                            <button onClick={scanNanoleaf} disabled={nanoScanning}
                              className="w-full py-3 rounded-xl text-sm font-bold bg-[#00FF88]/10 border border-[#00FF88]/30 text-[#00FF88] hover:bg-[#00FF88]/20 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                              {nanoScanning ? <><RefreshCw size={14} className="animate-spin" /> Scanning your network…</> : '📡 Scan for Nanoleaf Panels'}
                            </button>

                            {/* Discovered devices */}
                            {!nanoScanning && nanoDevices.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Found {nanoDevices.length} panel{nanoDevices.length > 1 ? 's' : ''}</p>
                                {nanoDevices.map((d, i) => (
                                  <button key={i} onClick={() => startNanoPairing(d)}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-[#00FF88]/30 transition-all text-left">
                                    <span className="text-lg">🟢</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-bold text-white truncate">{d.name}</p>
                                      <p className="text-[9px] text-gray-500">{d.ip}:{d.port}{d.model ? ` · ${d.model}` : ''}</p>
                                    </div>
                                    <span className="text-[8px] font-black text-[#00FF88] uppercase tracking-wider">Pair</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {!nanoScanning && nanoDevices.length === 0 && (
                              <p className="text-[10px] text-gray-600">No panels found? Make sure they're powered on and on the same WiFi.</p>
                            )}

                            {/* Manual IP fallback */}
                            <details className="group">
                              <summary className="text-[10px] font-bold text-gray-600 cursor-pointer hover:text-gray-400 transition-colors">
                                ▸ Enter IP manually instead
                              </summary>
                              <div className="mt-2 flex gap-2">
                                <input value={nanoManualIp} onChange={e => setNanoManualIp(e.target.value)} placeholder="192.168.1.xxx"
                                  className="flex-1 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#00FF88]/40" />
                                <button onClick={() => nanoManualIp.trim() && startNanoPairing({ ip: nanoManualIp.trim(), port: 16021, name: 'Nanoleaf', model: '' })}
                                  disabled={!nanoManualIp.trim()}
                                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-[#00FF88]/10 border border-[#00FF88]/30 text-[#00FF88] disabled:opacity-40">
                                  Pair
                                </button>
                              </div>
                            </details>

                            {svc.connected.nanoleaf === false && (
                              <p className="text-[10px] text-red-400/80">Pairing failed — make sure you held the power button and you're on the same WiFi.</p>
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

// ── Main Component ──────────────────────────────────────────────────────────

interface LightingDesignerProps {
  /** Left out when embedded, as in TV Studio's Lighting tab. */
  onClose?: () => void;
}

/**
 * The LD view. The board itself lives in components/lighting; this hooks it to the music player and
 * runs ldBridge, which supplies "follow the music" for DMX and drives smart lights and screens.
 */
export default function LightingDesigner({ onClose }: LightingDesignerProps) {
  const { currentTrack, currentAlbum, analyser } = useGlobalPlayer();
  const board = useBoard();
  const follow = board.followMusic;

  useEffect(() => {
    ldBridge.start(analyser, { ...createDefaultShow(), partyMode: boardEngine.followMusic });
    return () => ldBridge.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { ldBridge.updateAnalyser(analyser); }, [analyser]);

  // With no cues and party mode off the bridge outputs nothing, leaving the board in charge.
  useEffect(() => { ldBridge.updateShow({ ...createDefaultShow(), partyMode: follow }); }, [follow]);

  useEffect(() => {
    const art = currentTrack?.albumCover || currentAlbum?.coverImage;
    if (art && ldBridge.state.autoPalette) void ldBridge.extractPaletteFromAlbumArt(art);
  }, [currentTrack?.albumCover, currentAlbum?.coverImage]);

  return (
    <LightBoard
      onClose={onClose}
      nowPlaying={currentTrack?.title}
      renderSmartConnect={(close) => <AnimatePresence><FixtureDiscovery onClose={close} /></AnimatePresence>}
    />
  );
}
