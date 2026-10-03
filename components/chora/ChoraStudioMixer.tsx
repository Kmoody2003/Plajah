import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sliders, Volume2, VolumeX, Mic, Radio, Network, Wifi, Play, Pause, Square,
  RotateCcw, Repeat, Settings, Cpu, ChevronLeft, ChevronRight, Zap, Check,
  Activity, ArrowDownUp, RefreshCw, Layers, ShieldCheck, Download, Share2, HelpCircle,
  SlidersHorizontal, Sparkles, X, Music, RadioTower
} from 'lucide-react';
import {
  mackieControl,
  type MixerTrackStrip,
  type ControllerState,
  gainToDb,
  dbToGain
} from '../../services/audio/mackieControlService';
import {
  avbService,
  type AvbState,
  type AvbEntity,
  type AvbStreamRoute
} from '../../services/audio/avbService';
import {
  startOmtBroadcast,
  stopOmtBroadcast,
  startSrtListener,
  connectSrtCaller,
  stopSrtStream,
  hasNativeEngine
} from '../../services/mediaEngine/bridge';
import { Knob } from '../melos/beats/shared/Knob';
import {
  SURFACE,
  SURFACE_RAISED,
  SURFACE_CELL,
  ARMED,
  PLAYHEAD,
  SELECT,
  BRAND_A,
  BRAND_B,
  ACCENT_DEFAULT,
  GROUP_COLORS,
  slabPanel,
  glassPanel
} from '../melos/beats/theme';

interface Props {
  onClose?: () => void;
  initialTracks?: MixerTrackStrip[];
  embedded?: boolean;
}

const SEND_COLORS = ['#06D6A0', '#00DAF3', '#D0BCFF'];

const DEFAULT_TRACKS: MixerTrackStrip[] = [
  { id: 'trk_kick',   name: 'KICK',        volumeGain: 1.0, pan: 0.0,   mute: false, solo: false, armed: false, selected: true,  color: '#FF8C00', meterLevel: 0.78, eqLowDb: 2.0, eqMidDb: -1.5, eqHighDb: 1.0, send1Gain: 0.1, send2Gain: 0.0 },
  { id: 'trk_snare',  name: 'SNARE',       volumeGain: 0.95, pan: 0.05, mute: false, solo: false, armed: false, selected: false, color: '#D40055', meterLevel: 0.65, eqLowDb: -1.0, eqMidDb: 1.2, eqHighDb: 2.5, send1Gain: 0.35, send2Gain: 0.1 },
  { id: 'trk_hihat',  name: 'HI-HATS',     volumeGain: 0.80, pan: -0.25, mute: false, solo: false, armed: false, selected: false, color: '#00DAF3', meterLevel: 0.52, eqLowDb: -6.0, eqMidDb: 0.0, eqHighDb: 3.0, send1Gain: 0.15, send2Gain: 0.2 },
  { id: 'trk_perc',   name: 'PERC',        volumeGain: 0.85, pan: 0.35,  mute: false, solo: false, armed: false, selected: false, color: '#D0BCFF', meterLevel: 0.48, eqLowDb: -3.0, eqMidDb: 0.5, eqHighDb: 1.5, send1Gain: 0.25, send2Gain: 0.15 },
  { id: 'trk_bass',   name: 'SUB BASS',    volumeGain: 1.05, pan: 0.0,   mute: false, solo: false, armed: false, selected: false, color: '#FF8C00', meterLevel: 0.82, eqLowDb: 3.5, eqMidDb: -0.8, eqHighDb: -2.0, send1Gain: 0.05, send2Gain: 0.0 },
  { id: 'trk_gtr_l',  name: 'AC GTR',      volumeGain: 0.90, pan: -0.50, mute: false, solo: false, armed: false, selected: false, color: '#06D6A0', meterLevel: 0.58, eqLowDb: -2.0, eqMidDb: 1.0, eqHighDb: 2.0, send1Gain: 0.40, send2Gain: 0.25 },
  { id: 'trk_keys',   name: 'PIANO/KEYS',  volumeGain: 0.88, pan: 0.40,  mute: false, solo: false, armed: false, selected: false, color: '#D0BCFF', meterLevel: 0.62, eqLowDb: 0.0, eqMidDb: 0.5, eqHighDb: 1.0, send1Gain: 0.45, send2Gain: 0.30 },
  { id: 'trk_lead_v', name: 'LEAD VOCAL',  volumeGain: 1.15, pan: 0.0,   mute: false, solo: false, armed: true,  selected: false, color: '#D40055', meterLevel: 0.85, eqLowDb: -1.5, eqMidDb: 2.0, eqHighDb: 4.0, send1Gain: 0.50, send2Gain: 0.40 },
  { id: 'trk_bkg_v',  name: 'BKG HARMONY', volumeGain: 0.82, pan: 0.20,  mute: false, solo: false, armed: false, selected: false, color: '#00DAF3', meterLevel: 0.55, eqLowDb: -3.0, eqMidDb: 1.5, eqHighDb: 2.5, send1Gain: 0.60, send2Gain: 0.35 },
  { id: 'trk_synths', name: 'MEKA SYNTH',  volumeGain: 0.75, pan: -0.30, mute: false, solo: false, armed: false, selected: false, color: '#D40055', meterLevel: 0.50, eqLowDb: -1.0, eqMidDb: 0.0, eqHighDb: 1.5, send1Gain: 0.55, send2Gain: 0.45 },
  { id: 'trk_strings',name: 'STRINGS',     volumeGain: 0.80, pan: 0.45,  mute: false, solo: false, armed: false, selected: false, color: '#06D6A0', meterLevel: 0.45, eqLowDb: -2.0, eqMidDb: 1.0, eqHighDb: 2.0, send1Gain: 0.65, send2Gain: 0.20 },
  { id: 'trk_fx',     name: 'SFX RISER',   volumeGain: 0.70, pan: 0.0,   mute: false, solo: false, armed: false, selected: false, color: '#D0BCFF', meterLevel: 0.40, eqLowDb: -4.0, eqMidDb: 0.0, eqHighDb: 3.0, send1Gain: 0.70, send2Gain: 0.50 }
];

export const ChoraStudioMixer: React.FC<Props> = ({ onClose, initialTracks, embedded = false }) => {
  const [tracks, setTracks] = useState<MixerTrackStrip[]>(initialTracks || DEFAULT_TRACKS);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [masterGain, setMasterGain] = useState(1.0);
  const [masterMute, setMasterMute] = useState(false);
  const [dimActive, setDimActive] = useState(false);
  const [monoActive, setMonoActive] = useState(false);

  // Hardware Controller state
  const [ctrlState, setCtrlState] = useState<ControllerState>(mackieControl.getState());
  // AVB Network state
  const [avbState, setAvbState] = useState<AvbState>(avbService.getState());

  // Active drawer modals
  const [drawerOpen, setDrawerOpen] = useState<'NONE' | 'AVB_MATRIX' | 'MACKIE_SETTINGS' | 'BROADCAST_ROUTING' | 'CHANNEL_DETAIL'>('NONE');
  const [smartMixMode, setSmartMixMode] = useState(true); // Easy vs Pro Channel
  const [omtBroadcasting, setOmtBroadcasting] = useState(false);
  const [srtStreaming, setSrtStreaming] = useState(false);

  const selectedTrack = tracks[selectedTrackIndex] || tracks[0];

  // Subscribe to Mackie MCU service
  useEffect(() => {
    const unsub = mackieControl.subscribe(setCtrlState);
    mackieControl.setTotalChannels(tracks.length);

    mackieControl.registerCallbacks({
      onFaderChange: (channelIndex, gain) => {
        if (channelIndex === -1) {
          setMasterGain(gain);
        } else {
          setTracks(prev => {
            const next = [...prev];
            if (next[channelIndex]) {
              next[channelIndex] = { ...next[channelIndex], volumeGain: gain };
            }
            return next;
          });
        }
      },
      onPanChange: (channelIndex, delta) => {
        setTracks(prev => {
          const next = [...prev];
          if (next[channelIndex]) {
            const currentPan = next[channelIndex].pan;
            const newPan = Math.max(-1, Math.min(1, currentPan + delta));
            next[channelIndex] = { ...next[channelIndex], pan: parseFloat(newPan.toFixed(2)) };
          }
          return next;
        });
      },
      onMuteToggle: (channelIndex) => {
        setTracks(prev => {
          const next = [...prev];
          if (next[channelIndex]) {
            next[channelIndex] = { ...next[channelIndex], mute: !next[channelIndex].mute };
          }
          return next;
        });
      },
      onSoloToggle: (channelIndex) => {
        setTracks(prev => {
          const next = [...prev];
          if (next[channelIndex]) {
            next[channelIndex] = { ...next[channelIndex], solo: !next[channelIndex].solo };
          }
          return next;
        });
      },
      onArmToggle: (channelIndex) => {
        setTracks(prev => {
          const next = [...prev];
          if (next[channelIndex]) {
            next[channelIndex] = { ...next[channelIndex], armed: !next[channelIndex].armed };
          }
          return next;
        });
      },
      onSelectChannel: (channelIndex) => {
        setSelectedTrackIndex(channelIndex);
      },
      onBankChange: (newOffset) => {
        mackieControl.updateLcdScribbleStrips(tracks.slice(newOffset, newOffset + 8));
      }
    });

    const initMidi = async () => {
      await mackieControl.initializeWebMidi();
      mackieControl.updateLcdScribbleStrips(tracks.slice(0, 8));
    };
    initMidi();

    return () => {
      unsub();
    };
  }, [tracks]);

  // Subscribe to AVB service
  useEffect(() => {
    const unsub = avbService.subscribe(setAvbState);
    return () => unsub();
  }, []);

  // Update Mackie scribble strip LCD when active bank tracks change
  useEffect(() => {
    const activeSlice = tracks.slice(ctrlState.bankOffset, ctrlState.bankOffset + 8);
    mackieControl.updateLcdScribbleStrips(activeSlice);
  }, [tracks, ctrlState.bankOffset]);

  // Simulated live RMS & TruePeak meter ballistics
  useEffect(() => {
    const interval = setInterval(() => {
      setTracks(prev =>
        prev.map(t => {
          if (t.mute) return { ...t, meterLevel: 0 };
          const base = t.volumeGain * 0.7;
          const jitter = (Math.random() - 0.45) * 0.28;
          const nextLevel = Math.max(0.02, Math.min(1.0, base + jitter));
          return { ...t, meterLevel: nextLevel };
        })
      );
    }, 75);
    return () => clearInterval(interval);
  }, []);

  // Fader changes
  const handleFaderChange = (index: number, newGain: number) => {
    const clampedGain = Math.max(0, Math.min(3.98, newGain));
    setTracks(prev => {
      const next = [...prev];
      next[index] = { ...next[index], volumeGain: clampedGain };
      return next;
    });
    mackieControl.sendMotorizedFader(index, clampedGain);
  };

  const handlePanChange = (index: number, newPan: number) => {
    setTracks(prev => {
      const next = [...prev];
      next[index] = { ...next[index], pan: newPan };
      return next;
    });
  };

  const toggleMute = (index: number) => {
    setTracks(prev => {
      const next = [...prev];
      const newMute = !next[index].mute;
      next[index] = { ...next[index], mute: newMute };
      mackieControl.setChannelMute(index, newMute);
      return next;
    });
  };

  const toggleSolo = (index: number) => {
    setTracks(prev => {
      const next = [...prev];
      const newSolo = !next[index].solo;
      next[index] = { ...next[index], solo: newSolo };
      mackieControl.setChannelSolo(index, newSolo);
      return next;
    });
  };

  const toggleArm = (index: number) => {
    setTracks(prev => {
      const next = [...prev];
      const newArm = !next[index].armed;
      next[index] = { ...next[index], armed: newArm };
      mackieControl.setChannelArm(index, newArm);
      return next;
    });
  };

  // Broadcast toggle handlers
  const handleToggleOmt = async () => {
    if (omtBroadcasting) {
      await stopOmtBroadcast('chora_mix_omt');
      setOmtBroadcasting(false);
    } else {
      const res = await startOmtBroadcast({ streamId: 'chora_mix_omt', name: 'Chora Studio Audio Master', audioChannels: 8 });
      if (res?.success !== false) setOmtBroadcasting(true);
    }
  };

  const handleToggleSrt = async () => {
    if (srtStreaming) {
      await stopSrtStream('chora_mix_srt');
      setSrtStreaming(false);
    } else {
      const res = await startSrtListener({ streamId: 'chora_mix_srt', name: 'Chora Master SRT Stream', port: 9002, latencyMs: 120 });
      if (res?.success !== false) setSrtStreaming(true);
    }
  };

  // Convert linear gain to visual fader travel percentage (-60dB to +12dB)
  const gainToFaderFrac = (gain: number) => {
    const db = gainToDb(gain);
    if (db <= -60) return 0;
    return Math.max(0, Math.min(1, (db + 60) / 72));
  };

  const faderFracToGain = (frac: number) => {
    if (frac <= 0.005) return 0;
    const db = -60 + Math.max(0, Math.min(1, frac)) * 72;
    return dbToGain(db);
  };

  const formatDb = (gain: number) => {
    const db = gainToDb(gain);
    return db <= -60 ? '-inf' : `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
  };

  return (
    <div className={`melos melos-instr flex flex-col ${embedded ? 'w-full h-full min-h-0' : 'fixed inset-0 z-50'} select-none font-sans overflow-hidden`} style={{ background: SURFACE, color: '#F4F0F7' }}>
      
      {/* ── Top Studio Masthead (Plajah & Melos Design Language) ─────────────── */}
      <header className="h-13 border-b flex items-center justify-between px-4 sm:px-6 shrink-0 flex-wrap gap-2" style={{ background: '#0C0C10', borderColor: 'rgba(255,255,255,0.09)' }}>
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl transition-colors hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(244,240,247,0.7)' }}
              title="Back"
            >
              <ChevronLeft size={16} />
            </button>
          )}

          <div className="flex items-baseline gap-2.5">
            <span className="text-[12px] font-bold tracking-[0.2em] uppercase shrink-0" style={{ color: ACCENT_DEFAULT }}>
              CHORA STUDIO
            </span>
            <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border border-amber-500/30 text-amber-400 bg-amber-500/10 hidden sm:inline-block shrink-0">
              Melos Console
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2 ml-2 px-2.5 py-1 rounded-lg border text-[10px] font-mono" style={{ background: SURFACE_RAISED, borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(244,240,247,0.5)' }}>
            <span>48 kHz</span>
            <span className="text-white/20">/</span>
            <span>24-bit Float</span>
            <span className="text-white/20">/</span>
            <span style={{ color: '#06D6A0' }} className="font-bold">IEEE 1722 Milan</span>
          </div>
        </div>

        {/* Center: Mackie MCU Hardware Controller HUD */}
        <div className="flex items-center gap-2.5 px-3 py-1 rounded-xl border" style={{ background: SURFACE_CELL, borderColor: 'rgba(255,255,255,0.1)' }}>
          <Sliders size={13} style={{ color: ctrlState.connected ? '#06D6A0' : 'rgba(255,255,255,0.3)' }} />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">
                {ctrlState.deviceName}
              </span>
              <span
                className="text-[8px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider"
                style={ctrlState.connected
                  ? { background: 'rgba(6,214,160,0.15)', borderColor: 'rgba(6,214,160,0.4)', color: '#06D6A0' }
                  : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
              >
                {ctrlState.connected ? '14-BIT MOTOR' : 'MIDI READY'}
              </span>
            </div>
            <div className="text-[8.5px] font-mono flex items-center gap-2" style={{ color: 'rgba(244,240,247,0.4)' }}>
              <span>BANK {Math.floor(ctrlState.bankOffset / 8) + 1} (CH {ctrlState.bankOffset + 1}–{ctrlState.bankOffset + 8})</span>
              <span className="text-white/20">·</span>
              <span style={{ color: PLAYHEAD }}>VPOT: {ctrlState.vPotMode}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 ml-1 pl-2 border-l" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <button
              onClick={() => mackieControl.bankLeft()}
              disabled={ctrlState.bankOffset <= 0}
              className="p-1 rounded-md transition-colors hover:bg-white/10 disabled:opacity-25"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)' }}
              title="Bank Left (Ch 1-8)"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() => mackieControl.bankRight()}
              disabled={ctrlState.bankOffset + 8 >= tracks.length}
              className="p-1 rounded-md transition-colors hover:bg-white/10 disabled:opacity-25"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)' }}
              title="Bank Right (Ch 9-16)"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Right Badges & Controls: AVB, OMT, SRT, SmartMix */}
        <div className="flex items-center gap-2">
          {/* AVB / Milan Network Button */}
          <button
            onClick={() => setDrawerOpen(d => d === 'AVB_MATRIX' ? 'NONE' : 'AVB_MATRIX')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.12em] transition-all border"
            style={avbState.connected
              ? { background: 'rgba(208,188,255,0.12)', borderColor: 'rgba(208,188,255,0.35)', color: ACCENT_DEFAULT }
              : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
            title="AVB / Milan IEEE 1722 Network Matrix"
          >
            <Network size={12} className={avbState.connected ? 'animate-pulse' : ''} style={{ color: avbState.connected ? ACCENT_DEFAULT : undefined }} />
            <span>AVB {avbState.clock.lockState === 'LOCKED' ? 'PTP LOCK' : 'NET'}</span>
          </button>

          {/* OMT LAN Broadcast Button */}
          <button
            onClick={handleToggleOmt}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.12em] transition-all border"
            style={omtBroadcasting
              ? { background: 'rgba(0,218,243,0.16)', borderColor: PLAYHEAD, color: PLAYHEAD, boxShadow: '0 0 14px rgba(0,218,243,0.3)' }
              : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
            title="Open Media Transport (Sub-Frame LAN Broadcast)"
          >
            <Radio size={12} />
            <span>OMT LAN {omtBroadcasting ? 'LIVE' : 'OFF'}</span>
          </button>

          {/* SRT WAN Stream Button */}
          <button
            onClick={handleToggleSrt}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.12em] transition-all border"
            style={srtStreaming
              ? { background: 'rgba(255,140,0,0.18)', borderColor: ARMED, color: ARMED, boxShadow: '0 0 14px rgba(255,140,0,0.3)' }
              : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
            title="Secure Reliable Transport WAN Stream"
          >
            <Wifi size={12} />
            <span>SRT {srtStreaming ? 'WAN 9002' : 'OFF'}</span>
          </button>

          {/* Smart Mix / Pro Toggle */}
          <button
            onClick={() => setSmartMixMode(!smartMixMode)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.12em] transition-all border"
            style={smartMixMode
              ? { background: 'linear-gradient(135deg, rgba(107,0,153,0.3), rgba(212,0,85,0.25))', borderColor: 'rgba(212,0,85,0.4)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
            title="Switch between 1-Knob Smart Mix and Pro Console"
          >
            <Zap size={12} style={{ color: smartMixMode ? '#FF8C00' : undefined }} />
            <span>{smartMixMode ? 'SMART MIX' : 'PRO CHANNEL'}</span>
          </button>

          {/* Mackie Settings */}
          <button
            onClick={() => setDrawerOpen(d => d === 'MACKIE_SETTINGS' ? 'NONE' : 'MACKIE_SETTINGS')}
            className="p-1.5 rounded-xl border transition-colors hover:bg-white/10"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
            title="Controller & Protocol Settings"
          >
            <Settings size={15} />
          </button>
        </div>
      </header>

      {/* ── Main Console Layout: Deck + Master Section ──────────────────────── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        
        {/* Left Console Deck: Scrollable Channel Strips */}
        <div className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden p-3 gap-2 bg-[#0A0A0D]">
          {tracks.map((track, idx) => {
            const isSelected = selectedTrackIndex === idx;
            const inActiveBank = idx >= ctrlState.bankOffset && idx < ctrlState.bankOffset + 8;
            const faderFrac = gainToFaderFrac(track.volumeGain);
            const trackColor = track.color || '#D0BCFF';

            return (
              <div
                key={track.id}
                onClick={() => setSelectedTrackIndex(idx)}
                onDoubleClick={() => setDrawerOpen('CHANNEL_DETAIL')}
                className="flex flex-col rounded-[12px] border p-2 flex-none transition-all cursor-pointer"
                style={{
                  width: '92px',
                  background: isSelected ? 'rgba(212,0,85,0.06)' : SURFACE_RAISED,
                  borderColor: isSelected ? SELECT : 'rgba(255,255,255,0.09)',
                  boxShadow: isSelected ? '0 0 16px -4px rgba(212,0,85,0.35)' : undefined
                }}
              >
                {/* Channel Header & MCU Bank Tag */}
                <div className="flex items-center justify-between text-[8px] font-mono pb-1 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <span style={{ color: 'rgba(244,240,247,0.4)' }}>CH {idx + 1}</span>
                  {inActiveBank ? (
                    <span className="font-bold px-1 rounded" style={{ background: 'rgba(0,218,243,0.15)', color: PLAYHEAD }}>
                      MCU {idx - ctrlState.bankOffset + 1}
                    </span>
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>BUS A</span>
                  )}
                </div>

                {/* Track Name */}
                <span className="text-center font-bold text-[10px] truncate mt-1" style={{ color: trackColor }}>
                  {track.name}
                </span>

                {/* Pan Knob & Readout */}
                <div className="flex flex-col items-center gap-0.5 my-1">
                  <Knob
                    label=""
                    value={track.pan}
                    min={-1}
                    max={1}
                    defaultValue={0}
                    size={22}
                    color={PLAYHEAD}
                    format={(v) => (Math.abs(v) < 0.02 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)}
                    onChange={(v) => handlePanChange(idx, v)}
                  />
                  <span className="text-[7.5px] font-mono text-white/50">
                    {track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : `R${Math.round(track.pan * 100)}`}
                  </span>
                </div>

                {/* Aux Send Rings / Smart Macros */}
                {smartMixMode ? (
                  <div className="flex justify-around items-center py-1 px-0.5 rounded border my-1" style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex flex-col items-center">
                      <div
                        className="w-3.5 h-3.5 rounded-full cursor-ns-resize"
                        style={{
                          background: `conic-gradient(#FF8C00 ${Math.round(Math.max(0, (track.eqLowDb ?? 0) + 6) / 18 * 100)}%, rgba(255,255,255,0.1) 0)`,
                          WebkitMask: 'radial-gradient(circle, transparent 2.5px, #000 3px)',
                          mask: 'radial-gradient(circle, transparent 2.5px, #000 3px)'
                        }}
                      />
                      <span className="text-[6.5px] font-bold text-white/40 mt-0.5">PUNCH</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <div
                        className="w-3.5 h-3.5 rounded-full cursor-ns-resize"
                        style={{
                          background: `conic-gradient(#00DAF3 ${Math.round(Math.max(0, (track.eqHighDb ?? 0) + 6) / 18 * 100)}%, rgba(255,255,255,0.1) 0)`,
                          WebkitMask: 'radial-gradient(circle, transparent 2.5px, #000 3px)',
                          mask: 'radial-gradient(circle, transparent 2.5px, #000 3px)'
                        }}
                      />
                      <span className="text-[6.5px] font-bold text-white/40 mt-0.5">AIR</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-around items-center py-1 px-0.5 rounded border my-1" style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex flex-col items-center">
                      <div
                        className="w-3.5 h-3.5 rounded-full"
                        style={{
                          background: `conic-gradient(${SEND_COLORS[0]} ${Math.round((track.send1Gain ?? 0) * 100)}%, rgba(255,255,255,0.1) 0)`,
                          WebkitMask: 'radial-gradient(circle, transparent 2.5px, #000 3px)',
                          mask: 'radial-gradient(circle, transparent 2.5px, #000 3px)'
                        }}
                      />
                      <span className="text-[6.5px] font-bold text-white/40 mt-0.5">REV</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <div
                        className="w-3.5 h-3.5 rounded-full"
                        style={{
                          background: `conic-gradient(${SEND_COLORS[1]} ${Math.round((track.send2Gain ?? 0) * 100)}%, rgba(255,255,255,0.1) 0)`,
                          WebkitMask: 'radial-gradient(circle, transparent 2.5px, #000 3px)',
                          mask: 'radial-gradient(circle, transparent 2.5px, #000 3px)'
                        }}
                      />
                      <span className="text-[6.5px] font-bold text-white/40 mt-0.5">DLY</span>
                    </div>
                  </div>
                )}

                {/* Channel Buttons: Mute, Solo, Arm */}
                <div className="flex gap-1 justify-center items-center my-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleMute(idx); }}
                    className="w-[20px] h-[18px] rounded-[4px] border text-[8.5px] font-black transition-all flex items-center justify-center"
                    style={track.mute
                      ? { background: 'rgba(255,255,255,0.25)', borderColor: 'rgba(255,255,255,0.5)', color: '#fff' }
                      : { borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.4)' }}
                  >
                    M
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSolo(idx); }}
                    className="w-[20px] h-[18px] rounded-[4px] border text-[8.5px] font-black transition-all flex items-center justify-center"
                    style={track.solo
                      ? { background: 'rgba(0,218,243,0.22)', borderColor: PLAYHEAD, color: PLAYHEAD, boxShadow: '0 0 8px rgba(0,218,243,0.4)' }
                      : { borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.4)' }}
                  >
                    S
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleArm(idx); }}
                    className="w-[20px] h-[18px] rounded-[4px] border text-[8.5px] font-black transition-all flex items-center justify-center"
                    style={track.armed
                      ? { background: 'rgba(255,140,0,0.25)', borderColor: ARMED, color: ARMED, boxShadow: '0 0 8px rgba(255,140,0,0.4)' }
                      : { borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.4)' }}
                  >
                    R
                  </button>
                </div>

                {/* 100mm Console Fader & Precision LED Meter (Authentic Melos Look) */}
                <div className="flex-1 min-h-[140px] flex gap-2 justify-center items-center py-2 relative">
                  
                  {/* Fader Track */}
                  <div
                    role="slider"
                    aria-label={`${track.name} volume`}
                    tabIndex={0}
                    className="relative w-[8px] h-full rounded-[4px] cursor-ns-resize focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.07)', touchAction: 'none' }}
                    onPointerDown={(e) => {
                      (e.target as HTMLElement).setPointerCapture(e.pointerId);
                      const rect = e.currentTarget.getBoundingClientRect();
                      const frac = 1 - (e.clientY - rect.top) / rect.height;
                      handleFaderChange(idx, faderFracToGain(frac));
                    }}
                    onPointerMove={(e) => {
                      if (e.buttons === 1) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const frac = 1 - (e.clientY - rect.top) / rect.height;
                        handleFaderChange(idx, faderFracToGain(frac));
                      }
                    }}
                    onDoubleClick={() => handleFaderChange(idx, 1.0)}
                  >
                    {/* Fill bar */}
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-[4px] transition-all duration-75"
                      style={{ height: `${faderFrac * 100}%`, background: `${trackColor}B3` }}
                    />
                    {/* Motorized Fader Cap Handle */}
                    <div
                      className="absolute -left-[5px] -right-[5px] h-[10px] rounded-[3px] border shadow-md flex items-center justify-center transition-all duration-75"
                      style={{
                        bottom: `calc(${faderFrac * 100}% - 5px)`,
                        background: '#2A2A32',
                        borderColor: 'rgba(255,255,255,0.3)'
                      }}
                    >
                      <div className="w-2.5 h-[1.5px] rounded-full bg-white/80" />
                    </div>
                  </div>

                  {/* Dual Peak & RMS LED Meter */}
                  <div className="relative w-[5px] h-full rounded-[3px] overflow-hidden self-stretch" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-[3px] transition-[height] duration-75"
                      style={{
                        height: `${Math.min(1, track.meterLevel ?? 0) * 100}%`,
                        background: (track.meterLevel ?? 0) > 0.95
                          ? '#EF4444'
                          : (track.meterLevel ?? 0) > 0.8
                            ? '#F59E0B'
                            : '#06D6A0'
                      }}
                    />
                  </div>
                </div>

                {/* Digital Scribble Strip & dB Readout */}
                <div className="pt-1.5 border-t flex flex-col items-center gap-0.5" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <span className="font-mono text-[8.5px] text-white/50">
                    {formatDb(track.volumeGain)}
                  </span>
                  <div
                    className="w-full text-center text-[8px] font-bold uppercase tracking-wider py-0.5 rounded truncate border"
                    style={{
                      background: 'rgba(0,0,0,0.4)',
                      borderColor: `${trackColor}40`,
                      color: trackColor
                    }}
                  >
                    {track.name}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Right Master Console Section (Plajah Brand Master Strip) ───────── */}
        <div
          className="w-72 flex flex-col border-l shrink-0 p-3"
          style={{
            background: 'linear-gradient(180deg, rgba(107,0,153,0.18), rgba(212,0,85,0.09))',
            borderColor: 'rgba(212,0,85,0.35)'
          }}
        >
          {/* Master Masthead */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.09)' }}>
            <div className="flex items-center gap-1.5">
              <Volume2 size={15} style={{ color: SELECT }} />
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white">
                MASTER BUS
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDimActive(!dimActive)}
                className="px-2 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider border transition-colors"
                style={dimActive
                  ? { background: 'rgba(245,158,11,0.25)', borderColor: '#F59E0B', color: '#F59E0B' }
                  : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
              >
                DIM -20
              </button>
              <button
                onClick={() => setMonoActive(!monoActive)}
                className="px-2 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider border transition-colors"
                style={monoActive
                  ? { background: 'rgba(0,218,243,0.25)', borderColor: PLAYHEAD, color: PLAYHEAD }
                  : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
              >
                MONO
              </button>
            </div>
          </div>

          {/* Master Meter Bridge Telemetry */}
          <div className="rounded-[12px] p-2.5 border mb-3 flex flex-col gap-2" style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between text-[10px]">
              <span style={{ color: 'rgba(244,240,247,0.5)' }}>Target LUFS (Spotify/Apple)</span>
              <span className="font-mono font-bold" style={{ color: '#06D6A0' }}>-14.0 LUFS</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span style={{ color: 'rgba(244,240,247,0.5)' }}>True Peak Ceiling</span>
              <span className="font-mono font-bold text-white/90">-0.1 dBTP</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span style={{ color: 'rgba(244,240,247,0.5)' }}>Phase Correlation</span>
              <span className="font-mono font-bold" style={{ color: PLAYHEAD }}>+0.96 (Wide)</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span style={{ color: 'rgba(244,240,247,0.5)' }}>Glue Compressor GR</span>
              <span className="font-mono font-bold" style={{ color: '#F59E0B' }}>-1.8 dB</span>
            </div>
          </div>

          {/* Master 100mm Motorized Fader */}
          <div className="flex-1 flex px-4 py-2 gap-3 items-center justify-center">
            {/* Calibration Decibel Scale */}
            <div className="flex flex-col justify-between h-full text-[8.5px] font-mono text-white/35 select-none text-right">
              <span>+10</span>
              <span>+6</span>
              <span style={{ color: PLAYHEAD }} className="font-bold">0 dB</span>
              <span>-6</span>
              <span>-12</span>
              <span>-24</span>
              <span>-40</span>
              <span>-∞</span>
            </div>

            {/* Master Fader Slot */}
            <div
              role="slider"
              aria-label="Master Output Volume"
              tabIndex={0}
              className="relative w-[10px] h-full rounded-[4px] cursor-ns-resize focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.08)', touchAction: 'none' }}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                const rect = e.currentTarget.getBoundingClientRect();
                const frac = 1 - (e.clientY - rect.top) / rect.height;
                const nextGain = faderFracToGain(frac);
                setMasterGain(nextGain);
                mackieControl.sendMotorizedFader(-1, nextGain);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const frac = 1 - (e.clientY - rect.top) / rect.height;
                  const nextGain = faderFracToGain(frac);
                  setMasterGain(nextGain);
                  mackieControl.sendMotorizedFader(-1, nextGain);
                }
              }}
              onDoubleClick={() => {
                setMasterGain(1.0);
                mackieControl.sendMotorizedFader(-1, 1.0);
              }}
            >
              {/* Active fill */}
              <div
                className="absolute bottom-0 left-0 right-0 rounded-[4px] transition-all duration-75"
                style={{
                  height: `${gainToFaderFrac(masterGain) * 100}%`,
                  background: 'linear-gradient(to top, #6B0099, #D40055)'
                }}
              />
              {/* Motorized Fader Handle */}
              <div
                className="absolute -left-[6px] -right-[6px] h-[12px] rounded-[3px] border shadow-lg flex items-center justify-center transition-all duration-75"
                style={{
                  bottom: `calc(${gainToFaderFrac(masterGain) * 100}% - 6px)`,
                  background: '#2A2A32',
                  borderColor: 'rgba(255,255,255,0.4)'
                }}
              >
                <div className="w-3.5 h-[1.5px] rounded-full bg-white" />
              </div>
            </div>

            {/* Master Stereo Peak LED Meter */}
            <div className="flex gap-1 h-full py-1">
              <div className="relative w-[4px] h-full rounded-[3px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-[3px] transition-[height] duration-75"
                  style={{
                    height: `${Math.min(1, masterGain * 0.72) * 100}%`,
                    background: (masterGain * 0.72) > 0.95 ? '#EF4444' : '#06D6A0'
                  }}
                />
              </div>
              <div className="relative w-[4px] h-full rounded-[3px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-[3px] transition-[height] duration-75"
                  style={{
                    height: `${Math.min(1, masterGain * 0.75) * 100}%`,
                    background: (masterGain * 0.75) > 0.95 ? '#EF4444' : '#06D6A0'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Master Output Readout */}
          <div className="pt-2 border-t flex flex-col items-center gap-1" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <span className="font-mono text-[10px] font-bold" style={{ color: ACCENT_DEFAULT }}>
              {formatDb(masterGain)}
            </span>
            <div className="w-full text-center text-[9px] font-bold uppercase tracking-wider py-1 rounded border" style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(212,0,85,0.4)', color: SELECT }}>
              MAIN STEREO OUT
            </div>
          </div>
        </div>
      </div>

      {/* ── Slide-Over / Popout Drawers (Styled with Melos slabPanel) ──────── */}
      <AnimatePresence>
        {drawerOpen !== 'NONE' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end"
            onClick={() => setDrawerOpen('NONE')}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="w-full max-w-md h-full flex flex-col border-l shadow-2xl overflow-y-auto"
              style={{ background: '#0E0E12', borderColor: 'rgba(255,255,255,0.16)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Masthead */}
              <div className="h-14 border-b px-5 flex items-center justify-between shrink-0" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                <div className="flex items-center gap-2">
                  {drawerOpen === 'AVB_MATRIX' && <Network size={16} style={{ color: ACCENT_DEFAULT }} />}
                  {drawerOpen === 'MACKIE_SETTINGS' && <Sliders size={16} style={{ color: PLAYHEAD }} />}
                  {drawerOpen === 'BROADCAST_ROUTING' && <Radio size={16} style={{ color: ARMED }} />}
                  {drawerOpen === 'CHANNEL_DETAIL' && <SlidersHorizontal size={16} style={{ color: SELECT }} />}
                  <h3 className="text-xs font-bold uppercase tracking-widest text-white">
                    {drawerOpen === 'AVB_MATRIX' && 'AVB / Milan Network Routing'}
                    {drawerOpen === 'MACKIE_SETTINGS' && 'Mackie MCU Controller Setup'}
                    {drawerOpen === 'BROADCAST_ROUTING' && 'OMT & SRT Broadcast Engine'}
                    {drawerOpen === 'CHANNEL_DETAIL' && `Channel Strip: ${selectedTrack.name}`}
                  </h3>
                </div>
                <button
                  onClick={() => setDrawerOpen('NONE')}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
                >
                  <X size={15} />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="p-5 flex-1 flex flex-col gap-4 text-xs">
                
                {/* 1. AVB / Milan Matrix */}
                {drawerOpen === 'AVB_MATRIX' && (
                  <div className="flex flex-col gap-4">
                    <div className="p-3 rounded-xl border flex flex-col gap-2" style={{ background: SURFACE_RAISED, borderColor: 'rgba(255,255,255,0.09)' }}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">IEEE 802.1AS gPTP Grandmaster Clock</span>
                        <span className="font-mono px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(6,214,160,0.15)', color: '#06D6A0' }}>
                          {avbState.clock.lockState}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-white/50 flex flex-col gap-1">
                        <div>Grandmaster ID: <span className="text-white/80">{avbState.clock.grandmasterId}</span></div>
                        <div>Phase Offset: <span className="text-white/80">{avbState.clock.offsetNanoseconds} ns</span> (Class A Media Sync)</div>
                      </div>
                    </div>

                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-white/50 mt-2">Discovered AVB Entities</h4>
                    <div className="flex flex-col gap-2">
                      {avbState.discoveredEntities.map(ent => (
                        <div key={ent.entityId} className="p-3 rounded-xl border flex items-center justify-between" style={{ background: SURFACE_CELL, borderColor: 'rgba(255,255,255,0.08)' }}>
                          <div className="flex flex-col">
                            <span className="font-bold text-white/90">{ent.name}</span>
                            <span className="text-[10px] font-mono text-white/40">{ent.vendor} · {ent.macAddress}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold" style={{ background: 'rgba(0,218,243,0.15)', color: PLAYHEAD }}>
                            {ent.talkerStreams.length} Out / {ent.listenerStreams.length} In
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 p-3 rounded-xl border border-dashed text-white/60 text-[11px] leading-relaxed" style={{ borderColor: 'rgba(208,188,255,0.3)', background: 'rgba(208,188,255,0.03)' }}>
                      Multi-channel AVB audio streams pass bit-perfect to/from connected hardware stage boxes and audio interfaces across Intel I210/I225 TSN NICs.
                    </div>
                  </div>
                )}

                {/* 2. Mackie Controller Setup */}
                {drawerOpen === 'MACKIE_SETTINGS' && (
                  <div className="flex flex-col gap-4">
                    <div className="p-3 rounded-xl border flex flex-col gap-2" style={{ background: SURFACE_RAISED, borderColor: 'rgba(255,255,255,0.09)' }}>
                      <span className="font-bold text-white">Connected MCU Device</span>
                      <div className="text-[11px] text-white/70">
                        {ctrlState.deviceName}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(0,218,243,0.15)', color: PLAYHEAD }}>
                          14-bit Motor Pitch-Bend
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(212,0,85,0.15)', color: SELECT }}>
                          56-Char SysEx LCD
                        </span>
                      </div>
                    </div>

                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-white/50 mt-2">V-Pot Encoder Assignment</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {(['PAN', 'SENDS', 'EQ'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => mackieControl.setVPotMode(mode)}
                          className="py-2 px-3 rounded-xl border font-bold text-center transition-all"
                          style={ctrlState.vPotMode === mode
                            ? { background: 'rgba(0,218,243,0.2)', borderColor: PLAYHEAD, color: PLAYHEAD }
                            : { background: SURFACE_CELL, borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => mackieControl.initializeWebMidi()}
                      className="mt-4 py-2.5 rounded-xl border text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors hover:bg-white/10"
                      style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
                    >
                      <RefreshCw size={13} />
                      Rescan MIDI Controller Ports
                    </button>
                  </div>
                )}

                {/* 3. Channel Detail & 4-Band EQ */}
                {drawerOpen === 'CHANNEL_DETAIL' && (
                  <div className="flex flex-col gap-4">
                    <div className="p-3 rounded-xl border flex items-center justify-between" style={{ background: SURFACE_RAISED, borderColor: 'rgba(255,255,255,0.09)' }}>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ background: selectedTrack.color || '#D0BCFF' }} />
                        <span className="font-bold text-white text-sm">{selectedTrack.name}</span>
                      </div>
                      <span className="font-mono text-xs" style={{ color: ACCENT_DEFAULT }}>{formatDb(selectedTrack.volumeGain)}</span>
                    </div>

                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-white/50">4-Band Parametric Console EQ</h4>
                    <div className="grid grid-cols-3 gap-3 p-3 rounded-xl border" style={{ background: SURFACE_CELL, borderColor: 'rgba(255,255,255,0.08)' }}>
                      <div className="flex flex-col items-center gap-1">
                        <Knob
                          label="Low 100Hz"
                          value={selectedTrack.eqLowDb ?? 0}
                          min={-12}
                          max={12}
                          defaultValue={0}
                          size={32}
                          color={ARMED}
                          format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
                          onChange={(v) => {
                            setTracks(prev => {
                              const n = [...prev];
                              n[selectedTrackIndex] = { ...n[selectedTrackIndex], eqLowDb: v };
                              return n;
                            });
                          }}
                        />
                        <span className="text-[8px] font-mono text-white/50">{(selectedTrack.eqLowDb ?? 0).toFixed(1)} dB</span>
                      </div>

                      <div className="flex flex-col items-center gap-1">
                        <Knob
                          label="Mid 1.2kHz"
                          value={selectedTrack.eqMidDb ?? 0}
                          min={-12}
                          max={12}
                          defaultValue={0}
                          size={32}
                          color={PLAYHEAD}
                          format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
                          onChange={(v) => {
                            setTracks(prev => {
                              const n = [...prev];
                              n[selectedTrackIndex] = { ...n[selectedTrackIndex], eqMidDb: v };
                              return n;
                            });
                          }}
                        />
                        <span className="text-[8px] font-mono text-white/50">{(selectedTrack.eqMidDb ?? 0).toFixed(1)} dB</span>
                      </div>

                      <div className="flex flex-col items-center gap-1">
                        <Knob
                          label="High 8kHz"
                          value={selectedTrack.eqHighDb ?? 0}
                          min={-12}
                          max={12}
                          defaultValue={0}
                          size={32}
                          color={SELECT}
                          format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
                          onChange={(v) => {
                            setTracks(prev => {
                              const n = [...prev];
                              n[selectedTrackIndex] = { ...n[selectedTrackIndex], eqHighDb: v };
                              return n;
                            });
                          }}
                        />
                        <span className="text-[8px] font-mono text-white/50">{(selectedTrack.eqHighDb ?? 0).toFixed(1)} dB</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChoraStudioMixer;
