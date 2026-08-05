import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Zap, Radio, Layers, Monitor, Wifi, Power, Sun, Cpu,
  ChevronRight, Check, AlertCircle, RefreshCw, Circle
} from 'lucide-react';
import {
  smartLightingService, useLightingService,
  LightPlatform, SmartLight, SmartRoom, ReactionMode,
} from '../services/smartLightingService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  analyser: AnalyserNode | null;
}

type Tab = 'setup' | 'all' | 'rooms';
type SetupPlatform = 'hue' | 'nanoleaf' | 'govee' | 'razer';

// ─── Platform colors ──────────────────────────────────────────────────────────

const PLATFORM_META: Record<LightPlatform, { label: string; color: string; desc: string }> = {
  hue:      { label: 'Philips Hue',  color: '#FFD700', desc: 'Remote API — works from anywhere' },
  nanoleaf: { label: 'Nanoleaf',     color: '#00FF88', desc: 'Local API — same network as server' },
  govee:    { label: 'Govee',        color: '#FF4466', desc: 'Cloud API — works from anywhere' },
  razer:    { label: 'Razer Chroma', color: '#00FF00', desc: 'Localhost — requires Synapse 3' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const LightCard: React.FC<{ light: SmartLight }> = ({ light }) => {
  const svc = useLightingService();
  const meta = PLATFORM_META[light.platform];
  const [r, g, b] = light.color;

  return (
    <div className="flex items-center gap-3 p-3 bg-white/[0.04] border border-white/[0.07] rounded-2xl">
      {/* Color swatch / toggle */}
      <button
        onClick={() => smartLightingService.toggleLight(light.id, !light.on)}
        className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center transition-all border"
        style={{
          background: light.on ? `rgb(${r},${g},${b})` : '#1A1A1A',
          borderColor: light.on ? `rgba(${r},${g},${b},0.4)` : 'rgba(255,255,255,0.08)',
          boxShadow: light.on ? `0 0 12px rgba(${r},${g},${b},0.5)` : 'none',
        }}
      >
        <Power size={14} style={{ color: light.on ? '#000' : '#444' }} />
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/80 truncate">{light.name}</p>
        <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: meta.color + '88' }}>
          {meta.label}
        </p>
      </div>

      {/* Brightness slider */}
      <input
        type="range" min={0} max={100} value={light.brightness}
        onChange={e => smartLightingService.setBrightness(light.id, parseInt(e.target.value))}
        className="w-16 cursor-pointer"
        style={{ accentColor: `rgb(${r},${g},${b})` }}
      />

      {/* Color picker */}
      <label className="w-7 h-7 rounded-lg overflow-hidden cursor-pointer border border-white/10 shrink-0">
        <input
          type="color"
          value={`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`}
          onChange={e => {
            const hex = e.target.value;
            const rr = parseInt(hex.slice(1, 3), 16);
            const gg = parseInt(hex.slice(3, 5), 16);
            const bb = parseInt(hex.slice(5, 7), 16);
            smartLightingService.setLightColor(light.id, [rr, gg, bb], light.brightness / 100);
          }}
          className="w-full h-full cursor-pointer opacity-0 absolute"
        />
        <div className="w-full h-full" style={{ background: `rgb(${r},${g},${b})` }} />
      </label>
    </div>
  );
};

const RoomCard: React.FC<{ room: SmartRoom }> = ({ room }) => {
  const [color, setColor] = useState('#ffffff');
  const [brightness, setBrightness] = useState(80);
  const meta = PLATFORM_META[room.platform];

  return (
    <div className="p-4 bg-white/[0.04] border border-white/[0.07] rounded-2xl space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
        <p className="text-[10px] font-black uppercase tracking-widest text-white/80 flex-1">{room.name}</p>
        <span className="text-[7px] font-black text-white/25 uppercase tracking-widest">{room.lightIds.length} lights</span>
      </div>
      <div className="flex items-center gap-2">
        <input type="range" min={0} max={100} value={brightness}
          onChange={e => setBrightness(parseInt(e.target.value))}
          className="flex-1 cursor-pointer" style={{ accentColor: color }} />
        <label className="relative w-7 h-7 rounded-lg overflow-hidden cursor-pointer border border-white/10 shrink-0">
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
          <div className="w-full h-full" style={{ background: color }} />
        </label>
        <button
          onClick={() => {
            const hex = color;
            const rr = parseInt(hex.slice(1, 3), 16);
            const gg = parseInt(hex.slice(3, 5), 16);
            const bb = parseInt(hex.slice(5, 7), 16);
            smartLightingService.setRoomColor(room.id, [rr, gg, bb], brightness / 100);
          }}
          className="px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 transition-all text-white"
        >
          Set
        </button>
      </div>
    </div>
  );
};

// ─── Platform setup forms ─────────────────────────────────────────────────────

const HueSetup: React.FC = () => {
  const svc = useLightingService();
  const [loading, setLoading] = useState(false);

  // Listen for the popup posting the token back after OAuth
  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (e.data?.type !== 'hue-auth' || !e.data.accessToken) return;
      const token: string = e.data.accessToken;
      // Persist so reconnect survives page refresh
      localStorage.setItem('hue_access_token', token);
      if (e.data.refreshToken) localStorage.setItem('hue_refresh_token', e.data.refreshToken);
      setLoading(true);
      await smartLightingService.connectHue({ accessToken: token });
      setLoading(false);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Auto-reconnect on mount if token was saved previously
  useEffect(() => {
    const saved = localStorage.getItem('hue_access_token');
    if (saved && !svc.connected.hue) {
      smartLightingService.connectHue({ accessToken: saved });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openOAuth = () => {
    const w = 500, h = 700;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);
    window.open('/api/hue/auth', 'hue-oauth', `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`);
    setLoading(true);
  };

  const disconnect = () => {
    localStorage.removeItem('hue_access_token');
    localStorage.removeItem('hue_refresh_token');
    smartLightingService.disconnectPlatform('hue');
  };

  return (
    <div className="space-y-3">
      {svc.connected.hue === true ? (
        <>
          <p className="text-[8px] font-black text-green-400 flex items-center gap-1.5">
            <Check size={10} /> Connected — {svc.lights.filter(l => l.platform === 'hue').length} lights, {svc.rooms.filter(r => r.platform === 'hue').length} rooms
          </p>
          <button onClick={disconnect}
            className="w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
          >
            Disconnect Hue
          </button>
        </>
      ) : (
        <>
          <div className="text-[8px] font-bold text-white/30 leading-relaxed">
            Sign in with your Philips Hue account to control your lights from Plajah.
          </div>
          <button onClick={openOAuth} disabled={loading}
            className="w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#FFD700]/20 border border-[#FFD700]/30 text-[#FFD700] hover:bg-[#FFD700]/30 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {loading ? <><RefreshCw size={11} className="animate-spin" /> Waiting for Hue…</> : '🌐 Connect with Hue'}
          </button>
          {svc.connected.hue === false && (
            <p className="text-[8px] font-black text-red-400 flex items-center gap-1.5"><AlertCircle size={10} /> Connection failed — try again</p>
          )}
        </>
      )}
    </div>
  );
};

const NanoleafSetup: React.FC = () => {
  const svc = useLightingService();
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('16021');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    if (!ip.trim() || !token.trim()) return;
    setLoading(true);
    await smartLightingService.connectNanoleaf({ ip: ip.trim(), port: parseInt(port) || 16021, token: token.trim() });
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="text-[8px] font-bold text-white/30 leading-relaxed">
        Hold power button 5–7 sec on your Nanoleaf → GET token from <code className="text-white/50">http://&#123;ip&#125;:16021/api/v1/new</code>
      </div>
      <div className="flex gap-2">
        <input value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.x.x"
          className="flex-1 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white/80 placeholder-white/20 outline-none focus:border-[#00FF88]/40" />
        <input value={port} onChange={e => setPort(e.target.value)} placeholder="16021"
          className="w-20 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white/80 placeholder-white/20 outline-none focus:border-[#00FF88]/40" />
      </div>
      <input value={token} onChange={e => setToken(e.target.value)} placeholder="Auth token…"
        className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold text-white/80 placeholder-white/20 outline-none focus:border-[#00FF88]/40" />
      <button onClick={connect} disabled={loading || !ip.trim() || !token.trim()}
        className="w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#00FF88]/10 border border-[#00FF88]/30 text-[#00FF88] hover:bg-[#00FF88]/20 transition-all disabled:opacity-40"
      >
        {loading ? 'Connecting…' : 'Connect Nanoleaf'}
      </button>
      {svc.connected.nanoleaf === true && <p className="text-[8px] font-black text-green-400 flex items-center gap-1.5"><Check size={10} /> Connected</p>}
      {svc.connected.nanoleaf === false && <p className="text-[8px] font-black text-red-400 flex items-center gap-1.5"><AlertCircle size={10} /> Failed — check IP + token (needs LAN access)</p>}
    </div>
  );
};

const GoveeSetup: React.FC = () => {
  const svc = useLightingService();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    if (!key.trim()) return;
    setLoading(true);
    await smartLightingService.connectGovee({ apiKey: key.trim() });
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="text-[8px] font-bold text-white/30">Get API key at <span className="text-[#FF4466]/60">developer.govee.com</span> → Account → API Key</div>
      <input value={key} onChange={e => setKey(e.target.value)} placeholder="API key…"
        className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold text-white/80 placeholder-white/20 outline-none focus:border-[#FF4466]/40" />
      <button onClick={connect} disabled={loading || !key.trim()}
        className="w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#FF4466]/10 border border-[#FF4466]/30 text-[#FF4466] hover:bg-[#FF4466]/20 transition-all disabled:opacity-40"
      >
        {loading ? 'Connecting…' : 'Connect Govee'}
      </button>
      {svc.connected.govee === true && <p className="text-[8px] font-black text-green-400 flex items-center gap-1.5"><Check size={10} /> Connected — {svc.lights.filter(l => l.platform === 'govee').length} devices</p>}
      {svc.connected.govee === false && <p className="text-[8px] font-black text-red-400 flex items-center gap-1.5"><AlertCircle size={10} /> Failed — check API key</p>}
    </div>
  );
};

const RazerSetup: React.FC = () => {
  const svc = useLightingService();
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    setLoading(true);
    const ok = await smartLightingService.connectRazer();
    setLoading(false);
    if (!ok) alert('Could not reach Razer Synapse on localhost:54235. Make sure Razer Synapse 3 is running.');
  };

  return (
    <div className="space-y-3">
      <div className="text-[8px] font-bold text-white/30">Requires Razer Synapse 3 to be running on this machine. No API key needed.</div>
      <button onClick={connect} disabled={loading}
        className="w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#00FF00]/10 border border-[#00FF00]/30 text-[#00FF00] hover:bg-[#00FF00]/20 transition-all disabled:opacity-40"
      >
        {loading ? 'Connecting…' : 'Connect Razer Chroma'}
      </button>
      {svc.connected.razer === true && <p className="text-[8px] font-black text-green-400 flex items-center gap-1.5"><Check size={10} /> Razer Chroma active</p>}
      {svc.connected.razer === false && <p className="text-[8px] font-black text-red-400 flex items-center gap-1.5"><AlertCircle size={10} /> Synapse not detected</p>}
    </div>
  );
};

// ─── Reaction mode bar ────────────────────────────────────────────────────────

const ReactionBar: React.FC<{ analyser: AnalyserNode | null }> = ({ analyser }) => {
  const svc = useLightingService();
  const totalConnected = Object.values(svc.connected).filter(Boolean).length;

  const modes: { id: ReactionMode; label: string; desc: string; color: string }[] = [
    { id: 'off',     label: 'Off',       desc: 'Manual control only',              color: '#444' },
    { id: 'general', label: 'Music',     desc: 'Reacts to bass, mid, and treble',  color: '#FF8C00' },
    { id: 'paint',   label: 'Paint FX',  desc: 'Mirrors the Paint visualizer colors', color: '#00D4FF' },
  ];

  return (
    <div className="space-y-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Music Reaction Mode</p>
      {totalConnected === 0 && (
        <p className="text-[8px] font-bold text-white/25 flex items-center gap-2">
          <AlertCircle size={10} /> Connect a platform first
        </p>
      )}
      <div className="flex gap-2">
        {modes.map(m => (
          <button key={m.id}
            onClick={() => smartLightingService.setReactionMode(m.id, analyser)}
            disabled={totalConnected === 0 && m.id !== 'off'}
            className="flex-1 py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all disabled:opacity-30"
            style={{
              borderColor: svc.reactionMode === m.id ? m.color : 'rgba(255,255,255,0.08)',
              background: svc.reactionMode === m.id ? `${m.color}18` : 'transparent',
              color: svc.reactionMode === m.id ? m.color : 'rgba(255,255,255,0.35)',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      {svc.reactionMode !== 'off' && (
        <div className="flex items-center gap-2 text-[8px] font-black text-white/25">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Reacting to music
        </div>
      )}
    </div>
  );
};

// ─── Alexa & Google Home info card ────────────────────────────────────────────

const VoiceAssistantsCard: React.FC = () => (
  <div className="p-4 bg-white/[0.04] border border-white/[0.07] rounded-2xl space-y-4">
    <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Voice Assistant Integration</p>

    <div className="grid grid-cols-2 gap-3">
      <div className="p-3 bg-[#1A73E8]/10 border border-[#1A73E8]/20 rounded-xl space-y-2">
        <p className="text-[9px] font-black text-[#1A73E8] uppercase tracking-widest">Google Home</p>
        <p className="text-[7px] font-bold text-white/40 leading-relaxed">
          Add Dialogflow webhook: <code className="text-white/60">/api/google-home</code>
        </p>
        <p className="text-[7px] font-bold text-white/25">Commands: "play [artist]", "pause music", "play [album]"</p>
      </div>
      <div className="p-3 bg-[#00CAFF]/10 border border-[#00CAFF]/20 rounded-xl space-y-2">
        <p className="text-[9px] font-black text-[#00CAFF] uppercase tracking-widest">Alexa</p>
        <p className="text-[7px] font-bold text-white/40 leading-relaxed">
          Set skill endpoint: <code className="text-white/60">/api/alexa</code>
        </p>
        <p className="text-[7px] font-bold text-white/25">Commands: "Alexa, ask Plajah to play [artist]"</p>
      </div>
    </div>
  </div>
);

// ─── Main panel ───────────────────────────────────────────────────────────────

const SmartLightingPanel: React.FC<Props> = ({ isOpen, onClose, analyser }) => {
  const svc = useLightingService();
  const [tab, setTab] = useState<Tab>('setup');
  const [expandedPlatform, setExpandedPlatform] = useState<SetupPlatform | null>('razer');

  const totalLights = svc.lights.length;
  const totalConnected = Object.values(svc.connected).filter(Boolean).length;

  const platforms: SetupPlatform[] = ['razer', 'hue', 'govee', 'nanoleaf'];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed right-0 top-0 bottom-0 z-[401] w-[420px] max-w-[95vw] bg-[#0A0A0A] border-l border-white/[0.07] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF8C00]/30 to-[#FF4466]/30 border border-white/10 flex items-center justify-center">
                <Zap size={14} className="text-[#FF8C00]" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-black uppercase tracking-widest text-white">Smart Lighting</p>
                <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">
                  {totalConnected} platform{totalConnected !== 1 ? 's' : ''} · {totalLights} light{totalLights !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all">
                <X size={13} />
              </button>
            </div>

            {/* Reaction bar — always visible */}
            <div className="px-5 py-4 border-b border-white/[0.06] shrink-0">
              <ReactionBar analyser={analyser} />
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/[0.06] shrink-0">
              {([
                { id: 'setup', label: 'Setup', icon: Wifi },
                { id: 'all',   label: `Lights (${totalLights})`, icon: Sun },
                { id: 'rooms', label: `Rooms (${svc.rooms.length})`, icon: Layers },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setTab(t.id as Tab)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[9px] font-black uppercase tracking-widest border-b-2 transition-all ${tab === t.id ? 'border-[#FF8C00] text-white' : 'border-transparent text-white/25 hover:text-white/50'}`}
                >
                  <t.icon size={11} /> {t.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">

              {/* ── Setup tab ── */}
              {tab === 'setup' && (
                <div className="space-y-3">
                  {platforms.map(pid => {
                    const meta = PLATFORM_META[pid];
                    const isExpanded = expandedPlatform === pid;
                    const isConnected = svc.connected[pid] === true;
                    return (
                      <div key={pid} className="border border-white/[0.07] rounded-2xl overflow-hidden">
                        <button
                          onClick={() => setExpandedPlatform(isExpanded ? null : pid)}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
                        >
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: isConnected ? '#22c55e' : meta.color + '60' }} />
                          <div className="flex-1 text-left">
                            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: isConnected ? '#22c55e' : meta.color }}>{meta.label}</p>
                            <p className="text-[7px] font-bold text-white/25">{meta.desc}</p>
                          </div>
                          {isConnected && <Check size={12} className="text-green-400 shrink-0" />}
                          <ChevronRight size={12} className={`text-white/20 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-2 bg-black/20">
                            {pid === 'hue'      && <HueSetup />}
                            {pid === 'nanoleaf' && <NanoleafSetup />}
                            {pid === 'govee'    && <GoveeSetup />}
                            {pid === 'razer'    && <RazerSetup />}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <VoiceAssistantsCard />
                </div>
              )}

              {/* ── All lights tab ── */}
              {tab === 'all' && (
                <div className="space-y-2">
                  {totalLights === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center gap-3 opacity-30">
                      <Sun size={32} />
                      <p className="text-[10px] font-black uppercase tracking-widest">No lights connected yet</p>
                      <p className="text-[8px] font-bold">Set up a platform in the Setup tab</p>
                    </div>
                  ) : (
                    <>
                      {/* Group by platform */}
                      {(['hue', 'nanoleaf', 'govee', 'razer'] as LightPlatform[]).map(platform => {
                        const group = svc.lights.filter(l => l.platform === platform);
                        if (!group.length) return null;
                        return (
                          <div key={platform}>
                            <p className="text-[8px] font-black uppercase tracking-widest mb-2" style={{ color: PLATFORM_META[platform].color + 'aa' }}>
                              {PLATFORM_META[platform].label}
                            </p>
                            <div className="space-y-2">
                              {group.map(l => <LightCard key={l.id} light={l} />)}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {/* ── Rooms tab ── */}
              {tab === 'rooms' && (
                <div className="space-y-3">
                  {svc.rooms.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center gap-3 opacity-30">
                      <Layers size={32} />
                      <p className="text-[10px] font-black uppercase tracking-widest">No rooms found</p>
                      <p className="text-[8px] font-bold">Rooms come from Hue groups</p>
                    </div>
                  ) : (
                    svc.rooms.map(r => <RoomCard key={r.id} room={r} />)
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SmartLightingPanel;
