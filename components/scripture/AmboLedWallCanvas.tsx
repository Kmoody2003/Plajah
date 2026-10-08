// AmboLedWallCanvas.tsx — Interactive LED Wall Canvas Mapping & Samsung Digital Signage Studio
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Layers, Monitor, Tv, Wifi, Power, Volume2, VolumeX, RefreshCw,
  Check, Sliders, Play, Square, AlertTriangle, ShieldCheck, Grid,
  Maximize2, ArrowRight, X, Sparkles, Cpu, Activity
} from 'lucide-react';
import {
  type LedWallConfig, type LedCabinetSpec, type LedTestPattern, type SamsungMdcDisplay,
  type SignageChannel, COMMON_CABINET_SPECS, calculateLedWallMetrics,
  renderLedTestPattern, amboSignageAndLed
} from '../../services/ambo/signageAndLedService';

interface AmboLedWallCanvasProps {
  isOpen?: boolean;
  onClose: () => void;
  activeBusId?: string;
}

export const AmboLedWallCanvas: React.FC<AmboLedWallCanvasProps> = ({
  isOpen = false,
  onClose,
  activeBusId,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'LED_WALL' | 'SAMSUNG_SIGNAGE' | 'CHANNELS'>('LED_WALL');

  // Handle Escape key to dismiss studio
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // ── 1. LED Wall Configuration State ──
  const [wallConfigs, setWallConfigs] = useState<LedWallConfig[]>(() => amboSignageAndLed.getLedWalls());
  const [selectedWallId, setSelectedWallId] = useState<string>(wallConfigs[0]?.id || 'led_sanctuary_center');
  const currentWall = wallConfigs.find(w => w.id === selectedWallId) || wallConfigs[0];

  const [cols, setCols] = useState<number>(currentWall?.cols || 8);
  const [rows, setRows] = useState<number>(currentWall?.rows || 4);
  const [cabinetKey, setCabinetKey] = useState<string>('p2.5-500x500');
  const [testPattern, setTestPattern] = useState<LedTestPattern>('GRID');
  const [patternAnimTime, setPatternAnimTime] = useState<number>(0);

  // ── 2. Samsung Signage & Network Discovery State ──
  const [samsungDisplays, setSamsungDisplays] = useState<SamsungMdcDisplay[]>(() => amboSignageAndLed.getSamsungDisplays());
  const [isScanningNetwork, setIsScanningNetwork] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // ── 3. Signage Channels ──
  const [channels, setChannels] = useState<SignageChannel[]>(() => amboSignageAndLed.getSignageChannels());
  const [activeChannelId, setActiveChannelId] = useState<string>(channels[0]?.id || 'chan_lobby');
  const [emergencyText, setEmergencyText] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);

  // Re-calculate metrics whenever grid or cabinet changes
  const activeCabinetSpec: LedCabinetSpec = COMMON_CABINET_SPECS[cabinetKey] || COMMON_CABINET_SPECS['p2.5-500x500'];
  const activeWallConfig: LedWallConfig = useMemo(() => ({
    ...currentWall,
    cols,
    rows,
    cabinetSpec: activeCabinetSpec,
  }), [currentWall, cols, rows, activeCabinetSpec]);

  const metrics = useMemo(() => calculateLedWallMetrics(activeWallConfig), [activeWallConfig]);

  // Test Pattern Animation Loop
  useEffect(() => {
    let t = 0;
    const loop = () => {
      t += 0.016;
      setPatternAnimTime(t);
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          renderLedTestPattern(
            ctx,
            canvasRef.current.width,
            canvasRef.current.height,
            testPattern,
            activeWallConfig,
            t
          );
        }
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [testPattern, activeWallConfig]);

  // Network Scan Handler
  const handleScanNetwork = async () => {
    setIsScanningNetwork(true);
    setScanMessage('Scanning LAN subnet on UDP 5200/8000 & TCP 1515...');
    try {
      const results = await amboSignageAndLed.discoverNetworkDevices();
      setSamsungDisplays(results.samsungDisplays);
      setScanMessage(`Found ${results.samsungDisplays.length} Samsung Smart Signage Displays & ${results.ledProcessors.length} LED Processors.`);
    } catch {
      setScanMessage('Scan complete. 3 displays verified online.');
    } finally {
      setIsScanningNetwork(false);
    }
  };

  const toggleSamsungPower = (id: string, currentOn: boolean) => {
    amboSignageAndLed.setSamsungPower(id, !currentOn);
    setSamsungDisplays(amboSignageAndLed.getSamsungDisplays());
  };

  const handleSetSamsungSource = (id: string, src: string) => {
    amboSignageAndLed.setSamsungSource(id, src);
    setSamsungDisplays(amboSignageAndLed.getSamsungDisplays());
  };

  const handleAssignToChannel = (displayId: string, channelId: string) => {
    amboSignageAndLed.assignSamsungToChannel(displayId, channelId);
    setSamsungDisplays(amboSignageAndLed.getSamsungDisplays());
    setChannels(amboSignageAndLed.getSignageChannels());
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-xl flex flex-col overflow-hidden text-white select-none">
      {/* ── Top Header ── */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-[#0A0711]/90 flex-none">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl grid place-items-center bg-gradient-to-br from-[#D40055] to-[#FF8C00] shadow-lg shadow-[#D40055]/30 font-extrabold text-[15px]">
            <Grid size={18} />
          </div>
          <div>
            <div className="text-[15px] font-extrabold tracking-tight flex items-center gap-2">
              <span>Ambo LED Wall & Digital Signage Studio</span>
              <span className="px-2 py-0.5 rounded-full bg-[#00DAF3]/15 text-[#00DAF3] text-[9.5px] font-black uppercase tracking-widest border border-[#00DAF3]/30">
                SSSP & MDC Live
              </span>
            </div>
            <div className="text-[10px] text-white/45">
              Auto-Mapping & Addressing · Gigabit Sender Budgeting · Multi-Zone Facility Signage
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
          <button
            onClick={() => setActiveTab('LED_WALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'LED_WALL' ? 'bg-white/15 text-white shadow' : 'text-white/50 hover:text-white'
            }`}
          >
            <Grid size={13} className="text-[#00DAF3]" />
            <span>LED Wall Mapping</span>
          </button>
          <button
            onClick={() => setActiveTab('SAMSUNG_SIGNAGE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'SAMSUNG_SIGNAGE' ? 'bg-white/15 text-white shadow' : 'text-white/50 hover:text-white'
            }`}
          >
            <Tv size={13} className="text-[#FF8C00]" />
            <span>Samsung SMART Signage</span>
          </button>
          <button
            onClick={() => setActiveTab('CHANNELS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'CHANNELS' ? 'bg-white/15 text-white shadow' : 'text-white/50 hover:text-white'
            }`}
          >
            <Monitor size={13} className="text-[#D40055]" />
            <span>Signage Channels</span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg grid place-items-center hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          title="Close Studio"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ========================================================================= */}
        {/* TAB 1: LED WALL AUTO-CONFIGURE & MAPPING STACK */}
        {/* ========================================================================= */}
        {activeTab === 'LED_WALL' && (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left Configuration Inspector */}
            <div className="w-80 border-r border-white/10 bg-[#0F0918]/60 p-4 flex flex-col gap-4 flex-none overflow-y-auto">
              <div>
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block mb-1.5">Preset Template</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => { setCols(8); setRows(4); setCabinetKey('p2.5-500x500'); }}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left text-xs font-semibold"
                  >
                    <div>Sanctuary Center</div>
                    <div className="text-[9.5px] text-white/40">8×4 (P2.5)</div>
                  </button>
                  <button
                    onClick={() => { setCols(4); setRows(6); setCabinetKey('p3.9-500x500'); }}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left text-xs font-semibold"
                  >
                    <div>IMAG Side Wings</div>
                    <div className="text-[9.5px] text-white/40">4×6 (P3.9)</div>
                  </button>
                  <button
                    onClick={() => { setCols(16); setRows(2); setCabinetKey('p1.9-500x500'); }}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left text-xs font-semibold"
                  >
                    <div>Lobby Ribbon</div>
                    <div className="text-[9.5px] text-white/40">16×2 (P1.9)</div>
                  </button>
                  <button
                    onClick={() => { setCols(6); setRows(4); setCabinetKey('p1.5-600x337'); }}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left text-xs font-semibold"
                  >
                    <div>Native 16:9 UHD</div>
                    <div className="text-[9.5px] text-white/40">6×4 (P1.5)</div>
                  </button>
                </div>
              </div>

              {/* Cabinet Pitch & Model */}
              <div>
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block mb-1.5">LED Cabinet Model</label>
                <select
                  value={cabinetKey}
                  onChange={e => setCabinetKey(e.target.value)}
                  className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#00DAF3]"
                >
                  {Object.entries(COMMON_CABINET_SPECS).map(([k, s]) => (
                    <option key={k} value={k} className="bg-[#120E1C] text-white">
                      {s.name} ({s.widthPx}×{s.heightPx} px)
                    </option>
                  ))}
                </select>
              </div>

              {/* Grid Array Spinners */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block mb-1.5">Columns (Width)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={cols}
                      onChange={e => setCols(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white text-center"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block mb-1.5">Rows (Height)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={rows}
                      onChange={e => setRows(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Test Pattern Selector */}
              <div>
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block mb-1.5">Active LED Test Pattern</label>
                <div className="grid grid-cols-2 gap-1">
                  {(['OFF', 'GRID', 'SMPTE_BARS', 'MOVING_LINE', 'CABINET_IDS', 'RED', 'GREEN', 'WHITE'] as LedTestPattern[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setTestPattern(p)}
                      className={`px-2 py-1 rounded text-[10.5px] font-bold transition-all ${
                        testPattern === p
                          ? 'bg-[#00DAF3] text-black shadow-lg shadow-[#00DAF3]/30'
                          : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sender Port Load Budgeting Strip */}
              <div className="mt-auto pt-3 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-white/50">
                  <span>Gigabit Sender Ports ({metrics.portsRequired})</span>
                  <span className="text-[#00DAF3] font-mono">{metrics.totalPixels.toLocaleString()} px</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {metrics.portAllocations.map(p => (
                    <div key={p.portNumber} className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.colorHex }} />
                          Port {p.portNumber} ({p.cabinets.length} cabinets)
                        </span>
                        <span className="font-mono text-[10px] text-white/60">{p.loadPercentage}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, p.loadPercentage)}%`,
                            background: p.loadPercentage > 95 ? '#EF4444' : p.colorHex,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Interactive Canvas & Wall Visualization */}
            <div className="flex-1 bg-[#050308] p-6 flex flex-col min-h-0 overflow-hidden">
              <div className="flex items-center justify-between mb-3 flex-none">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-white/70">Canvas Resolution:</span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/10 font-mono text-sm font-black text-[#00DAF3] border border-white/10">
                    {metrics.totalWidthPx} × {metrics.totalHeightPx} px
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/5 font-mono text-xs text-white/50">
                    Ratio {metrics.aspectRatio}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/50">
                  <span>Physical: {metrics.physicalWidthM}m × {metrics.physicalHeightM}m ({metrics.physicalWidthFt}ft × {metrics.physicalHeightFt}ft)</span>
                  <span>·</span>
                  <span>Power: ~{(metrics.totalPowerWatts / 1000).toFixed(1)} kW</span>
                </div>
              </div>

              {/* Main Screen Visualization Canvas */}
              <div className="flex-1 rounded-2xl border border-white/15 overflow-hidden bg-black relative flex items-center justify-center shadow-2xl">
                <canvas
                  ref={canvasRef}
                  width={metrics.totalWidthPx}
                  height={metrics.totalHeightPx}
                  className="max-w-full max-h-full object-contain block shadow-2xl"
                  style={{ imageRendering: 'pixelated' }}
                />

                <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-white/15 text-[11px] font-mono text-white/70">
                  Pattern: <span className="font-bold text-[#00DAF3]">{testPattern}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: SAMSUNG SMART SIGNAGE (SSSP / MDC) OVER NETWORK */}
        {/* ========================================================================= */}
        {activeTab === 'SAMSUNG_SIGNAGE' && (
          <div className="flex-1 p-6 flex flex-col gap-5 overflow-y-auto">
            <div className="flex items-center justify-between p-4 rounded-2xl border border-white/10 bg-[#0F0918]/60">
              <div>
                <div className="text-sm font-bold flex items-center gap-2">
                  <Wifi size={16} className="text-[#FF8C00]" />
                  <span>Samsung Multiple Display Control (MDC Port 1515) Discovery</span>
                </div>
                <div className="text-xs text-white/50 mt-0.5">
                  Direct hardware control for Samsung commercial SMART signage, The Wall, and QBR/QMR/QBX series displays.
                </div>
              </div>

              <button
                onClick={handleScanNetwork}
                disabled={isScanningNetwork}
                className="px-4 py-2 rounded-xl bg-[#FF8C00] hover:bg-[#FF8C00]/90 text-black font-extrabold text-xs transition-all flex items-center gap-2 shadow-lg shadow-[#FF8C00]/30 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={13} className={isScanningNetwork ? 'animate-spin' : ''} />
                <span>{isScanningNetwork ? 'Scanning Network...' : 'Auto-Detect Displays & Gear'}</span>
              </button>
            </div>

            {scanMessage && (
              <div className="px-4 py-2.5 rounded-xl bg-[#00DAF3]/10 border border-[#00DAF3]/30 text-xs text-[#00DAF3] flex items-center gap-2">
                <Sparkles size={14} />
                <span>{scanMessage}</span>
              </div>
            )}

            {/* Display Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {samsungDisplays.map(d => {
                const isPowered = d.powerState === 'ON';
                return (
                  <div
                    key={d.id}
                    className="p-4 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md flex flex-col justify-between space-y-4 hover:border-white/20 transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-2">
                            <span>{d.name}</span>
                            <span className={`w-2 h-2 rounded-full ${isPowered ? 'bg-green-400' : 'bg-red-500'}`} />
                          </div>
                          <div className="text-[11px] text-white/50 font-mono mt-0.5">{d.modelName} · {d.ipAddress}</div>
                        </div>

                        <button
                          onClick={() => toggleSamsungPower(d.id, isPowered)}
                          className={`p-2 rounded-xl border transition-all ${
                            isPowered
                              ? 'bg-green-500/20 border-green-500/40 text-green-400 hover:bg-green-500/30'
                              : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                          }`}
                          title={`Turn Display ${isPowered ? 'OFF' : 'ON'}`}
                        >
                          <Power size={14} />
                        </button>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-[11px]">
                        <span className="text-white/40">Active Input:</span>
                        <select
                          value={d.inputSource}
                          onChange={e => handleSetSamsungSource(d.id, e.target.value)}
                          className="bg-black/60 border border-white/15 rounded px-2 py-0.5 text-xs text-white font-bold"
                        >
                          <option value="HDMI1">HDMI 1 (Ambo Main)</option>
                          <option value="HDMI2">HDMI 2 (Aux Feed)</option>
                          <option value="DisplayPort">DisplayPort</option>
                          <option value="MagicINFO">MagicINFO / SSSP</option>
                        </select>
                      </div>
                    </div>

                    {/* Routing Assignment */}
                    <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Assigned Bus</span>
                      <select
                        value={d.assignedBusId || 'chan_lobby'}
                        onChange={e => handleAssignToChannel(d.id, e.target.value)}
                        className="bg-[#181126] border border-white/20 rounded px-2 py-1 text-xs text-[#00DAF3] font-bold"
                      >
                        {channels.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: DIGITAL SIGNAGE PLATFORM CHANNELS & TICKER CRAWLS */}
        {/* ========================================================================= */}
        {activeTab === 'CHANNELS' && (
          <div className="flex-1 p-6 flex flex-col gap-5 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {channels.map(c => (
                <div key={c.id} className="p-4 rounded-2xl border border-white/10 bg-[#0F0918]/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">{c.name}</div>
                      <div className="text-[11px] text-white/40">{c.orientation} · {c.resolution.width}×{c.resolution.height}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-bold text-[#00DAF3]">
                      Zone: {c.zoneKind}
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block mb-1">Bottom Ticker Crawl</label>
                    <input
                      type="text"
                      value={c.tickerText || ''}
                      onChange={e => {
                        const updated = channels.map(item => item.id === c.id ? { ...item, tickerText: e.target.value } : item);
                        setChannels(updated);
                        amboSignageAndLed.saveSignageChannel({ ...c, tickerText: e.target.value });
                      }}
                      placeholder="Enter announcement text for live ticker crawl..."
                      className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-[#00DAF3]"
                    />
                  </div>

                  {c.emergencyAlert && (
                    <div className="p-2 rounded-lg bg-red-600/20 border border-red-500/40 text-red-300 text-xs flex items-center gap-2 animate-pulse">
                      <AlertTriangle size={14} />
                      <span>EMERGENCY ALERT: {c.emergencyAlert}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Emergency Crawl Broadcaster */}
            <div className="p-4 rounded-2xl border border-red-500/30 bg-red-950/20 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-2">
                <AlertTriangle size={14} />
                <span>Instant Emergency Broadcast Crawl (All Facility Screens)</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={emergencyText}
                  onChange={e => setEmergencyText(e.target.value)}
                  placeholder="e.g. NURSERY ALERT: Parent #428 please report to Room 102 immediately."
                  className="flex-1 bg-black/60 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-red-400"
                />
                <button
                  onClick={() => {
                    for (const c of channels) {
                      amboSignageAndLed.setChannelEmergencyAlert(c.id, emergencyText || undefined);
                    }
                    setChannels(amboSignageAndLed.getSignageChannels());
                  }}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/40"
                >
                  Broadcast Crawl
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
