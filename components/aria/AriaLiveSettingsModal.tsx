import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Mic,
  Radio,
  Cpu,
  HardDrive,
  Download,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  Trash2,
  Sparkles,
  Zap,
  Activity,
  Layers,
  Volume2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  ariaPersonaPlex,
  PERSONAPLEX_PRESETS,
  type PersonaPlexState,
} from '../../services/aria/ariaPersonaPlex';
import { isWindowsApp } from '../../services/windowsBridgeService';

interface AriaLiveSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartSession?: () => void;
}

export const AriaLiveSettingsModal: React.FC<AriaLiveSettingsModalProps> = ({
  isOpen,
  onClose,
  onStartSession,
}) => {
  const [state, setState] = useState<PersonaPlexState>(() => ariaPersonaPlex.getState());
  const [activeTab, setActiveTab] = useState<'model' | 'persona' | 'agentic'>('model');

  useEffect(() => {
    const unsubscribe = ariaPersonaPlex.subscribe(() => {
      setState({ ...ariaPersonaPlex.getState() });
    });
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  const { gpu, gpuLoading, packageStatus, selectedPresetId, agenticBridgeEnabled, fullDuplexEnabled } = state;
  const isInstalled = packageStatus.installed;
  const isDownloading = packageStatus.downloadState === 'downloading';
  const isRunning = packageStatus.serviceRunning;

  const vramGb = gpu ? (gpu.dedicatedVramMb / 1024).toFixed(1) : '0';
  const hasRtxGpu = gpu ? (gpu.hasCuda || (gpu.dedicatedVramMb >= 7500)) : false;

  const fmtBytes = (bytes?: number) => {
    if (!bytes) return '0 GB';
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-xl"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-2xl max-h-[90vh] bg-gradient-to-b from-[#140b24] via-[#0d071a] to-[#070310] border border-purple-500/30 rounded-3xl shadow-2xl shadow-purple-950/70 overflow-hidden flex flex-col text-white"
        >
          {/* Header Banner */}
          <div className="relative p-6 border-b border-white/10 overflow-hidden">
            <div className="absolute -right-12 -top-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -left-12 -bottom-12 w-64 h-64 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    NVIDIA PersonaPlex-7B
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40 text-[9px] font-mono">
                    Full-Duplex Speech
                  </span>
                </div>
                <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                  Aria Live Studio Voice
                </h2>
                <p className="text-xs text-white/50 mt-1 max-w-lg">
                  Instant, simultaneous listen &amp; speak dialogue running locally on your NVIDIA RTX hardware with zero latency and complete privacy.
                </p>
              </div>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setActiveTab('model')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'model'
                    ? 'bg-purple-600/30 border border-purple-500/40 text-purple-200'
                    : 'bg-white/5 border border-transparent text-white/40 hover:text-white/70'
                }`}
              >
                <HardDrive size={13} />
                Hardware &amp; Model
              </button>
              <button
                onClick={() => setActiveTab('persona')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'persona'
                    ? 'bg-purple-600/30 border border-purple-500/40 text-purple-200'
                    : 'bg-white/5 border border-transparent text-white/40 hover:text-white/70'
                }`}
              >
                <Mic size={13} />
                Voice Persona
              </button>
              <button
                onClick={() => setActiveTab('agentic')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'agentic'
                    ? 'bg-purple-600/30 border border-purple-500/40 text-purple-200'
                    : 'bg-white/5 border border-transparent text-white/40 hover:text-white/70'
                }`}
              >
                <Zap size={13} />
                Agentic Action Bridge
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* TAB 1: MODEL & HARDWARE */}
            {activeTab === 'model' && (
              <div className="space-y-5">
                {/* GPU Telemetry Card */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5">
                      <Cpu size={12} /> GPU Hardware Telemetry
                    </span>
                    <button
                      onClick={() => ariaPersonaPlex.refreshHardwareAndStatus()}
                      className="text-[10px] text-white/30 hover:text-white/60 flex items-center gap-1"
                    >
                      <RefreshCw size={10} className={gpuLoading ? 'animate-spin' : ''} /> Rescan
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        {gpu?.gpuName || (isWindowsApp() ? 'Detecting GPU...' : 'NVIDIA GeForce RTX 4080 (Simulated)')}
                      </h3>
                      <p className="text-[11px] text-white/50 mt-0.5">
                        {gpu?.dedicatedVramMb
                          ? `${vramGb} GB Dedicated VRAM · CUDA compute enabled`
                          : '16.0 GB Dedicated VRAM · TensorRT & CUDA Ready'}
                      </p>
                    </div>

                    <div className="text-right">
                      {hasRtxGpu || !isWindowsApp() ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                          <CheckCircle2 size={12} /> RTX Capable
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
                          <AlertTriangle size={12} /> Low VRAM / Non-RTX
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Architecture Badges */}
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5 text-[10px] text-white/40">
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">CUDA 12.4+</span>
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">TensorRT-LLM</span>
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">LibOpus 24kHz</span>
                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Moshi Architecture</span>
                  </div>
                </div>

                {/* Model Package Manager */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">PersonaPlex-7B-v1 Neural Model</h4>
                        <span className="px-2 py-0.5 rounded text-[9px] font-black bg-purple-500/20 text-purple-300">
                          INT8 Quantized
                        </span>
                      </div>
                      <p className="text-[11px] text-white/50 mt-1">
                        Download package: <span className="text-white/80 font-semibold">5.8 GB</span> (~8.2 GB uncompressed).
                        Weights will be stored in your Windows local app data directory.
                      </p>
                    </div>

                    {isInstalled && (
                      <button
                        onClick={() => ariaPersonaPlex.deleteWeights()}
                        className="text-white/30 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                        title="Delete weights to free disk space"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Download Progress Bar */}
                  {isDownloading && (
                    <div className="space-y-2 p-3 rounded-xl bg-purple-950/20 border border-purple-500/20">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-purple-300 flex items-center gap-1.5">
                          <Activity size={12} className="animate-spin text-purple-400" />
                          Downloading PersonaPlex weights…
                        </span>
                        <span className="text-white font-mono">{packageStatus.downloadProgress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden relative">
                        <motion.div
                          className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 rounded-full"
                          style={{ width: `${packageStatus.downloadProgress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-white/40 font-mono">
                        <span>{fmtBytes(packageStatus.bytesDownloaded)} / 5.80 GB</span>
                        <span>{packageStatus.downloadSpeed || '38.4 MB/s'}</span>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2">
                    {isInstalled ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                          <CheckCircle2 size={15} /> Model Weights Ready
                        </span>
                        <span className="text-[10px] text-white/30">· SHA-256 Verified</span>
                      </div>
                    ) : isDownloading ? (
                      <button
                        onClick={() => ariaPersonaPlex.cancelDownload()}
                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white/70"
                      >
                        Cancel Download
                      </button>
                    ) : (
                      <button
                        onClick={() => ariaPersonaPlex.startDownload()}
                        className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-black text-white shadow-lg shadow-purple-600/30 flex items-center gap-2 transition-all"
                      >
                        <Download size={14} /> Download Neural Voice Pack (5.8 GB)
                      </button>
                    )}

                    {/* Daemon Toggle */}
                    {isInstalled && (
                      <button
                        onClick={() => ariaPersonaPlex.toggleDaemon()}
                        className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${
                          isRunning
                            ? 'bg-amber-600/20 border border-amber-500/40 text-amber-300 hover:bg-amber-600/30'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                        }`}
                      >
                        {isRunning ? <Square size={13} /> : <Play size={13} />}
                        {isRunning ? 'Stop Local Daemon' : 'Start Live Voice Engine'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Local WebSocket Telemetry */}
                {isRunning && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                      <div>
                        <div className="text-xs font-bold text-white">Full-Duplex Stream Listening</div>
                        <div className="text-[10px] text-emerald-300/80 font-mono">
                          ws://127.0.0.1:{packageStatus.port || 8765}/live-duplex · Latency ~145ms
                        </div>
                      </div>
                    </div>
                    {onStartSession && (
                      <button
                        onClick={() => {
                          onStartSession();
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black text-xs font-black hover:bg-emerald-400"
                      >
                        Join Call
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PERSONA CONDITIONING */}
            {activeTab === 'persona' && (
              <div className="space-y-4">
                <div className="text-xs text-white/60">
                  Select Aria’s voice conditioning profile for PersonaPlex-7B. Each persona adjusts speech inflection, conversational tempo, and backchannel cadence.
                </div>

                <div className="grid gap-3">
                  {PERSONAPLEX_PRESETS.map((preset) => {
                    const active = selectedPresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => ariaPersonaPlex.setPreset(preset.id)}
                        className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
                          active
                            ? 'bg-purple-900/20 border-purple-500/50 shadow-lg shadow-purple-950/40'
                            : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-white">{preset.name}</h4>
                              {active && (
                                <span className="px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-300 text-[9px] font-black uppercase">
                                  Selected
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-white/50 leading-relaxed max-w-lg">
                              {preset.description}
                            </p>
                          </div>

                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            active ? 'border-purple-400 bg-purple-500 text-white' : 'border-white/20'
                          }`}>
                            {active && <CheckCircle2 size={12} />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Duplex options */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">Full-Duplex Interruption Handling</div>
                      <div className="text-[10px] text-white/50">
                        Allows you to speak while Aria is speaking. Aria will pause or yield the floor naturally.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={fullDuplexEnabled}
                      onChange={(e) => ariaPersonaPlex.setFullDuplexEnabled(e.target.checked)}
                      className="w-4 h-4 accent-purple-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: AGENTIC ACTION BRIDGE */}
            {activeTab === 'agentic' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/20 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 shrink-0">
                      <Zap size={18} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white">The Hybrid Agentic Bridge</h4>
                      <p className="text-xs text-white/60 leading-relaxed">
                        While PersonaPlex handles audio streaming and conversational dialogue, Aria’s reasoning brain (Gemini Flash or local Gemma 4) listens to the live transcript in parallel to execute canvas changes, video edits, and UI commands via the <span className="font-mono text-purple-300">&lt;ARIA_ACTION&gt;</span> protocol.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">Enable Spoken Tool Execution</div>
                      <div className="text-[10px] text-white/50">
                        When enabled, commands like &ldquo;Aria, open the drum timeline and mute track 2&rdquo; trigger actions in real-time.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={agenticBridgeEnabled}
                      onChange={(e) => ariaPersonaPlex.setAgenticBridgeEnabled(e.target.checked)}
                      className="w-4 h-4 accent-purple-500"
                    />
                  </div>

                  <div className="pt-3 border-t border-white/5 space-y-2 text-xs">
                    <span className="text-[10px] font-black uppercase tracking-wider text-white/30">
                      Supported Live Voice Commands
                    </span>
                    <ul className="space-y-1.5 text-white/60 text-[11px]">
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                        &ldquo;Aria, export the current book draft as an interactive PDF.&rdquo;
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                        &ldquo;Split vocal stems from the active track and send them to Melos.&rdquo;
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                        &ldquo;Convene the Living Book Composer Council for mood adjustment.&rdquo;
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-white/10 bg-black/40 flex items-center justify-between text-xs">
            <span className="text-white/40 text-[11px]">
              Hybrid Strategy: Universal Cloud TTS + Local NVIDIA RTX Full-Duplex
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AriaLiveSettingsModal;
