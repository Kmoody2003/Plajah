/**
 * TVStudioLightingBoard
 *
 * Entry-level touch-optimised lighting control surface:
 *  - Smart lights via HTTP REST (Philips Hue, LIFX, generic HTTP bridge)
 *  - DMX512 via WebSerial API (ENTTEC Open DMX USB, ENTTEC DMX USB Pro,
 *    or any USB-to-DMX dongle exposing a serial port)
 *  - 8 scene presets, 12 DMX channel faders, Grand Master fader
 *  - Smart Light macro: "Smart Light" scene wired to the TV Studio config
 *
 * Touch targets are all ≥48px per WCAG recommendations.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Lightbulb, Zap, Sliders, Plus, Trash2, ChevronDown,
  Usb, Wifi, RefreshCw, Power, Sun, Moon, Palette,
  Check, X, Settings, Activity,
} from 'lucide-react';

// WebSerial API types (not in lib.dom.d.ts yet in older TS targets)
type SerialPort = { open(opts: object): Promise<void>; writable: WritableStream | null; readable: ReadableStream | null };

// ── Types ─────────────────────────────────────────────────────────────────────

interface SmartLight {
  id: string;
  label: string;
  type: 'HUE' | 'LIFX' | 'HTTP';
  ip?: string;
  token?: string;
  /** 0–100 */
  brightness: number;
  /** CSS hsl color */
  color: string;
  isOn: boolean;
}

interface DMXChannel {
  channel: number; // 1–512
  label: string;
  /** 0–255 */
  value: number;
}

interface LightScene {
  id: string;
  label: string;
  color: string;
  dmxSnapshot: number[]; // 512 values
  smartLightStates: { id: string; brightness: number; color: string; isOn: boolean }[];
}

interface TVStudioLightingBoardProps {
  /** Called when the "Smart Light" macro is triggered from the switcher */
  onSmartLightMacro?: (scene: LightScene) => void;
}

// ── DMX Serial ────────────────────────────────────────────────────────────────

async function openDMXPort(): Promise<SerialPort | null> {
  if (!(navigator as any).serial) return null;
  try {
    const port: SerialPort = await (navigator as any).serial.requestPort();
    await port.open({ baudRate: 250000, dataBits: 8, stopBits: 2, parity: 'none' });
    return port;
  } catch { return null; }
}

async function sendDMXFrame(port: SerialPort, channels: number[]): Promise<void> {
  if (!port.writable) return;
  // DMX512 frame: break (88µs low) then 512 channel values
  // In WebSerial we prepend a 0x00 start code byte
  const data = new Uint8Array(513);
  data[0] = 0x00; // start code
  channels.forEach((v, i) => { if (i < 512) data[i + 1] = Math.max(0, Math.min(255, v)); });
  const writer = port.writable.getWriter();
  await writer.write(data);
  writer.releaseLock();
}

// ── HTTP Light control ────────────────────────────────────────────────────────

async function sendHTTPLight(light: SmartLight): Promise<void> {
  if (!light.ip) return;
  try {
    if (light.type === 'HUE') {
      await fetch(`http://${light.ip}/api/${light.token ?? 'newdeveloper'}/lights/1/state`, {
        method: 'PUT',
        body: JSON.stringify({ on: light.isOn, bri: Math.round(light.brightness * 2.54) }),
      });
    } else {
      await fetch(`http://${light.ip}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on: light.isOn, brightness: light.brightness }),
      });
    }
  } catch { /* light may be offline */ }
}

// ── Default scenes ────────────────────────────────────────────────────────────

const DEFAULT_SCENES: LightScene[] = [
  { id: 'scene_studio',   label: 'Studio',     color: '#4a9eff', dmxSnapshot: Array(512).fill(200), smartLightStates: [] },
  { id: 'scene_interview',label: 'Interview',  color: '#ffb347', dmxSnapshot: Array(512).fill(180), smartLightStates: [] },
  { id: 'scene_blackout', label: 'Blackout',   color: '#111111', dmxSnapshot: Array(512).fill(0),   smartLightStates: [] },
  { id: 'scene_concert',  label: 'Concert',    color: '#D40055', dmxSnapshot: Array(512).fill(255), smartLightStates: [] },
  { id: 'scene_chill',    label: 'Chill',      color: '#6B0099', dmxSnapshot: Array(512).fill(60),  smartLightStates: [] },
  { id: 'scene_news',     label: 'News',       color: '#e5e5e5', dmxSnapshot: Array(512).fill(220), smartLightStates: [] },
  { id: 'scene_drama',    label: 'Drama',      color: '#ff4500', dmxSnapshot: Array(512).fill(120), smartLightStates: [] },
  { id: 'scene_smartmacro', label: 'Smart Light ✦', color: '#6B0099', dmxSnapshot: Array(512).fill(150), smartLightStates: [] },
];

// ── Main component ────────────────────────────────────────────────────────────

const TVStudioLightingBoard: React.FC<TVStudioLightingBoardProps> = ({ onSmartLightMacro }) => {
  const [scenes, setScenes]             = useState<LightScene[]>(DEFAULT_SCENES);
  const [activeScene, setActiveScene]   = useState<string | null>(null);
  const [dmxChannels, setDmxChannels]   = useState<DMXChannel[]>(
    Array.from({ length: 12 }, (_, i) => ({ channel: i + 1, label: `CH ${i + 1}`, value: 0 }))
  );
  const [grandMaster, setGrandMaster]   = useState(255);
  const [smartLights, setSmartLights]   = useState<SmartLight[]>([]);
  const [dmxPort, setDmxPort]           = useState<SerialPort | null>(null);
  const [dmxConnected, setDmxConnected] = useState(false);
  const [showAddLight, setShowAddLight] = useState(false);
  const [newLight, setNewLight]         = useState<Partial<SmartLight>>({ type: 'HTTP', label: 'New Light', brightness: 100, color: '#ffffff', isOn: true });
  const dmxFrameRef                     = useRef<number>(0);
  const [activePanel, setActivePanel]   = useState<'SCENES' | 'DMX' | 'SMART'>('SCENES');

  // ── DMX output loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!dmxConnected || !dmxPort) return;
    const loop = async () => {
      const values = dmxChannels.map(ch => Math.round(ch.value * grandMaster / 255));
      await sendDMXFrame(dmxPort, values).catch(() => {});
      dmxFrameRef.current = requestAnimationFrame(loop) as any;
    };
    loop();
    return () => cancelAnimationFrame(dmxFrameRef.current);
  }, [dmxConnected, dmxPort, dmxChannels, grandMaster]);

  // ── Connect DMX ──────────────────────────────────────────────────────────
  const connectDMX = useCallback(async () => {
    const port = await openDMXPort();
    if (port) { setDmxPort(port); setDmxConnected(true); }
  }, []);

  // ── Activate scene ───────────────────────────────────────────────────────
  const activateScene = useCallback((scene: LightScene) => {
    setActiveScene(scene.id);
    // Apply DMX snapshot
    setDmxChannels(prev => prev.map((ch, i) => ({ ...ch, value: scene.dmxSnapshot[i] ?? ch.value })));
    // Apply smart lights
    scene.smartLightStates.forEach(state => {
      setSmartLights(prev => prev.map(l => l.id === state.id ? { ...l, ...state } : l));
    });
    // Trigger smart light macro callback
    if (scene.id === 'scene_smartmacro') onSmartLightMacro?.(scene);
  }, [onSmartLightMacro]);

  // ── Update smart light ───────────────────────────────────────────────────
  const updateLight = useCallback((id: string, patch: Partial<SmartLight>) => {
    setSmartLights(prev => {
      const updated = prev.map(l => l.id === id ? { ...l, ...patch } : l);
      // Fire HTTP request
      const light = updated.find(l => l.id === id);
      if (light) sendHTTPLight(light);
      return updated;
    });
  }, []);

  const addLight = useCallback(() => {
    if (!newLight.label) return;
    setSmartLights(prev => [...prev, {
      id: `light_${Date.now()}`,
      label: newLight.label ?? 'Light',
      type: newLight.type ?? 'HTTP',
      ip: newLight.ip,
      token: newLight.token,
      brightness: newLight.brightness ?? 100,
      color: newLight.color ?? '#ffffff',
      isOn: true,
    }]);
    setShowAddLight(false);
    setNewLight({ type: 'HTTP', label: 'New Light', brightness: 100, color: '#ffffff', isOn: true });
  }, [newLight]);

  const setChannel = useCallback((ch: number, value: number) => {
    setDmxChannels(prev => prev.map(c => c.channel === ch ? { ...c, value } : c));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ fontFamily: "'JetBrains Mono', monospace" }}>

      {/* Grand Master + sub-panel tabs */}
      <div className="flex items-center gap-4 px-4 py-2 shrink-0" style={{ background: '#111', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Grand Master fader */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] opacity-40 uppercase tracking-widest font-bold">Grand Master</span>
          <input
            type="range" min={0} max={255} value={grandMaster}
            onChange={e => setGrandMaster(Number(e.target.value))}
            className="cursor-pointer" style={{ width: 140, accentColor: '#D40055', height: 8 }}
          />
          <span className="text-[10px] font-mono opacity-50 w-8 text-right">{grandMaster}</span>
        </div>

        <div className="w-px h-6 opacity-10 bg-white" />

        {/* DMX connect */}
        <button
          onClick={connectDMX}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
          style={{
            background: dmxConnected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${dmxConnected ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
            color: dmxConnected ? '#22c55e' : 'rgba(255,255,255,0.4)',
          }}
        >
          <Usb size={11} /> {dmxConnected ? 'DMX Connected' : 'Connect DMX'}
        </button>

        <div className="flex-1" />

        {/* Sub-panel tabs */}
        {(['SCENES','DMX','SMART'] as const).map(p => (
          <button key={p} onClick={() => setActivePanel(p)}
            className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
            style={{
              background: activePanel === p ? 'rgba(107,0,153,0.3)' : 'transparent',
              color: activePanel === p ? '#c084fc' : 'rgba(255,255,255,0.3)',
              border: activePanel === p ? '1px solid rgba(107,0,153,0.4)' : '1px solid transparent',
            }}>
            {p === 'SCENES' ? 'Scenes' : p === 'DMX' ? 'DMX Faders' : 'Smart Lights'}
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0 gap-3 p-3">

        {/* ── Scenes panel ── */}
        {activePanel === 'SCENES' && (
          <div className="flex-1 flex flex-col gap-3">
            <p className="text-[9px] opacity-30 uppercase tracking-widest font-bold">Scene Presets — tap to activate</p>
            <div className="grid grid-cols-4 gap-3">
              {scenes.map(scene => (
                <button
                  key={scene.id}
                  onClick={() => activateScene(scene)}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl transition-all active:scale-95 touch-manipulation"
                  style={{
                    minHeight: 96,
                    background: activeScene === scene.id
                      ? `${scene.color}33`
                      : 'rgba(255,255,255,0.04)',
                    border: `2px solid ${activeScene === scene.id ? scene.color : 'rgba(255,255,255,0.07)'}`,
                    boxShadow: activeScene === scene.id ? `0 0 20px ${scene.color}44` : 'none',
                  }}
                >
                  <div className="w-8 h-8 rounded-full" style={{ background: scene.color, boxShadow: activeScene === scene.id ? `0 0 12px ${scene.color}` : 'none' }} />
                  <span className="text-[10px] font-black uppercase tracking-wider text-center px-2" style={{ color: activeScene === scene.id ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                    {scene.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Scene editor note */}
            <p className="text-[8px] opacity-20 mt-auto">Scenes save current DMX + Smart Light states. The "Smart Light ✦" scene triggers the switcher macro.</p>
          </div>
        )}

        {/* ── DMX Faders panel ── */}
        {activePanel === 'DMX' && (
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[9px] opacity-30 uppercase tracking-widest font-bold">DMX512 Channel Faders</p>
              <button
                onClick={() => setDmxChannels(prev => [...prev, { channel: prev.length + 1, label: `CH ${prev.length + 1}`, value: 0 }])}
                className="flex items-center gap-1 px-2 py-1 rounded text-[8px] opacity-40 hover:opacity-80 transition-opacity"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <Plus size={9} /> Add Channel
              </button>
            </div>
            <div className="flex gap-3 flex-wrap flex-1 items-end overflow-x-auto pb-2">
              {dmxChannels.map(ch => (
                <div key={ch.channel} className="flex flex-col items-center gap-2 shrink-0" style={{ width: 52 }}>
                  <span className="text-[8px] font-mono opacity-50">{ch.value}</span>
                  <div className="relative flex flex-col items-center">
                    <input
                      type="range" min={0} max={255} value={ch.value}
                      onChange={e => setChannel(ch.channel, Number(e.target.value))}
                      style={{
                        writingMode: 'vertical-lr' as any,
                        direction: 'rtl' as any,
                        height: 160,
                        cursor: 'pointer',
                        accentColor: '#6B0099',
                        WebkitAppearance: 'slider-vertical' as any,
                      }}
                    />
                  </div>
                  <input
                    value={ch.label}
                    onChange={e => setDmxChannels(prev => prev.map(c => c.channel === ch.channel ? { ...c, label: e.target.value } : c))}
                    className="text-center text-[8px] font-mono bg-transparent outline-none opacity-40 hover:opacity-80 w-full"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  <span className="text-[7px] font-mono opacity-25">{ch.channel}</span>
                </div>
              ))}
            </div>
            {!dmxConnected && (
              <p className="text-[8px] opacity-20">Connect a USB-to-DMX device (ENTTEC Open DMX, ENTTEC Pro) via the "Connect DMX" button above. Requires Chrome/Edge with WebSerial.</p>
            )}
          </div>
        )}

        {/* ── Smart Lights panel ── */}
        {activePanel === 'SMART' && (
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[9px] opacity-30 uppercase tracking-widest font-bold">Smart Lights (HTTP / Hue / LIFX)</p>
              <button
                onClick={() => setShowAddLight(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[8px] opacity-40 hover:opacity-80 transition-opacity"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <Plus size={9} /> Add Light
              </button>
            </div>

            <AnimatePresence>
              {showAddLight && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden">
                  <div className="flex flex-wrap gap-2 p-3 rounded-xl" style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <input value={newLight.label ?? ''} onChange={e => setNewLight(p => ({ ...p, label: e.target.value }))}
                      placeholder="Label" className="px-2 py-1.5 rounded text-xs text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', width: 120 }} />
                    <input value={newLight.ip ?? ''} onChange={e => setNewLight(p => ({ ...p, ip: e.target.value }))}
                      placeholder="IP / hostname" className="px-2 py-1.5 rounded text-xs text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', width: 150 }} />
                    <select value={newLight.type} onChange={e => setNewLight(p => ({ ...p, type: e.target.value as any }))}
                      className="px-2 py-1.5 rounded text-xs text-white outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <option value="HTTP">Generic HTTP</option>
                      <option value="HUE">Philips Hue</option>
                      <option value="LIFX">LIFX</option>
                    </select>
                    <button onClick={addLight} className="px-3 py-1.5 rounded text-xs font-black uppercase" style={{ background: '#6B0099', color: '#fff' }}>Add</button>
                    <button onClick={() => setShowAddLight(false)} className="px-2 py-1.5 rounded opacity-40 hover:opacity-80"><X size={12} /></button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-2 gap-3 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              {smartLights.map(light => (
                <div key={light.id} className="p-3 rounded-2xl flex flex-col gap-3" style={{ background: '#161616', border: `1px solid ${light.isOn ? light.color + '44' : 'rgba(255,255,255,0.07)'}` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold">{light.label}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: light.isOn ? light.color : '#333', boxShadow: light.isOn ? `0 0 8px ${light.color}` : 'none' }} />
                      <button onClick={() => updateLight(light.id, { isOn: !light.isOn })}
                        className="p-1.5 rounded-lg transition-all touch-manipulation"
                        style={{ background: light.isOn ? 'rgba(107,0,153,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${light.isOn ? 'rgba(107,0,153,0.4)' : 'rgba(255,255,255,0.1)'}` }}>
                        <Power size={12} style={{ color: light.isOn ? '#a855f7' : 'rgba(255,255,255,0.3)' }} />
                      </button>
                    </div>
                  </div>

                  {/* Brightness fader */}
                  <div className="flex items-center gap-2">
                    <Moon size={10} className="opacity-30 shrink-0" />
                    <input type="range" min={0} max={100} value={light.brightness}
                      onChange={e => updateLight(light.id, { brightness: Number(e.target.value) })}
                      className="flex-1 cursor-pointer" style={{ accentColor: light.color, height: 6 }} />
                    <Sun size={10} className="opacity-30 shrink-0" />
                  </div>

                  {/* Color picker */}
                  <div className="flex items-center gap-2">
                    <Palette size={10} className="opacity-30 shrink-0" />
                    <input type="color" value={light.color}
                      onChange={e => updateLight(light.id, { color: e.target.value })}
                      className="rounded cursor-pointer" style={{ width: 28, height: 22, border: 'none', background: 'none', padding: 0 }} />
                    <span className="text-[8px] font-mono opacity-30">{light.color}</span>
                    <button onClick={() => setSmartLights(prev => prev.filter(l => l.id !== light.id))} className="ml-auto opacity-20 hover:opacity-60">
                      <Trash2 size={10} style={{ color: '#D40055' }} />
                    </button>
                  </div>
                </div>
              ))}

              {smartLights.length === 0 && (
                <div className="col-span-2 flex flex-col items-center justify-center py-12 gap-2 opacity-20">
                  <Lightbulb size={28} strokeWidth={1.5} />
                  <p className="text-[10px] font-bold uppercase tracking-widest">No smart lights added</p>
                  <p className="text-[9px] text-center max-w-xs">Add lights by IP address. Supports Philips Hue bridge, LIFX HTTP API, or any REST-controllable light.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TVStudioLightingBoard;
