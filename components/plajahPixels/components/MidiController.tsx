import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Radio, Keyboard, Sliders, Play, Disc, Sparkles, Mic, MicOff, 
  Activity, Check, AlertCircle, RefreshCw, Layers, Plus, Trash2 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DEFAULT_MAPPINGS, 
  MidiMapping, 
  scaleCCValue, 
  dispatchMidiEvent, 
  detectDeviceType, 
  DetectedDeviceType,
  MidiEventData 
} from '../services/midiService';
import { VisualizationConfig, VisualizerMode } from '../types';

// Let's define the interface for state mappings
export type ParameterMappingsState = Record<string, MidiMapping>;

// --- HOOK: useMidiAudio ---
// Returns MIDI connection status, connected device name, tiny event log, & mic/line-in status.
export function useMidiAudio(
  setVisualizationConfig: React.Dispatch<React.SetStateAction<VisualizationConfig>>,
  audioContextRef: React.MutableRefObject<AudioContext | null>,
  analyserRef: React.MutableRefObject<AnalyserNode | null>,
  audioElRef: React.MutableRefObject<HTMLAudioElement | null>,
  sourceRef: React.MutableRefObject<MediaElementAudioSourceNode | null>,
  mappings: ParameterMappingsState,
  learningParamRef: React.MutableRefObject<string | null>,
  setLearningParam: (param: string | null) => void
) {
  const [midiConnected, setMidiConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string>('No MIDI Device Connected');
  const [midiLog, setMidiLog] = useState<string[]>([]);
  const [audioInputActive, setAudioInputActive] = useState(false);
  const [midiInputs, setMidiInputs] = useState<any[]>([]);

  const micStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const volumeMappingRef = useRef<MidiMapping>(DEFAULT_MAPPINGS.volume);

  // Keep tracks of mappings in ref for fast handle
  const mappingsRef = useRef<ParameterMappingsState>(mappings);
  useEffect(() => {
    mappingsRef.current = mappings;
  }, [mappings]);

  // Log midi helper
  const addLog = useCallback((msg: string) => {
    setMidiLog(prev => [msg, ...prev].slice(0, 3));
  }, []);

  // Web MIDI setup
  const handleMidiMessage = useCallback((e: any) => {
    const data: Uint8Array = e.data;
    if (!data || data.length < 3) return;

    const status = data[0];
    const byte1 = data[1];
    const byte2 = data[2];

    const channel = status & 0x0f;
    const type = status & 0xf0;
    const isNoteOn = type === 0x90 && byte2 > 0;
    const isNoteOff = type === 0x80 || (type === 0x90 && byte2 === 0);
    const isCC = type === 0xb0;

    const eventData: MidiEventData = {
      status,
      channel,
      note: isCC ? 0 : byte1,
      velocity: isCC ? 0 : byte2,
      cc: isCC ? byte1 : 0,
      value: isCC ? byte2 : 0,
      timestamp: performance.now(),
      deviceName: e.target?.name || 'Unknown'
    };

    // Dispatch global events for high-performance canvas triggers
    dispatchMidiEvent(eventData);

    // Learn Mode Capture
    if (isCC && learningParamRef.current) {
      const parameter = learningParamRef.current;
      addLog(`Learned CC ${byte1} for ${parameter}`);
      learningParamRef.current = null;
      setLearningParam(null);
      return;
    }

    // Process mapped Control Change (CC) controls
    if (isCC) {
      addLog(`CC ${byte1}: value ${byte2}`);
      
      // Auto-translate Komplete Kontrol's 8 endless knobs (CC 74-81) to Maschine Group A controls (CC 14-21) if no custom mapping found
      let lookupCC = byte1;
      if (byte1 >= 74 && byte1 <= 81) {
        lookupCC = byte1 - 60; // 74 maps to 14, 75 to 15, ..., 81 to 21
      }

      // Find matching parameter mapping
      const matchedParam = Object.keys(mappingsRef.current).find(
        key => mappingsRef.current[key].ccOrNote === lookupCC || mappingsRef.current[key].ccOrNote === byte1
      );

      if (matchedParam) {
        const mapping = mappingsRef.current[matchedParam];
        const scaledVal = scaleCCValue(byte2, mapping);

        setVisualizationConfig(prev => {
          // Special cases if we are updating parameters that require triggers
          const updated = { ...prev, [matchedParam]: scaledVal };
          return updated;
        });

        // Trigger brief visual flash via dispatch
        window.dispatchEvent(new CustomEvent('plajah-midi-flash', {
          detail: { label: mapping.label, value: scaledVal }
        }));
      }

      // Master Volume check (by default CC 7)
      if (byte1 === volumeMappingRef.current.ccOrNote) {
        const vol = parseFloat((byte2 / 127).toFixed(2));
        if (audioElRef.current) {
          audioElRef.current.volume = vol;
        }
        // Dispatch to update active audio state
        window.dispatchEvent(new CustomEvent('plajah-volume-change', { detail: vol }));
      }
    }

    // Process Note On / Pad On triggers
    if (isNoteOn) {
      const note = byte1;
      const velocity = byte2;
      addLog(`Note On ${note}: vel ${velocity}`);

      const devType = detectDeviceType(e.target?.name || '');

      // 1. Maschine Studio (ch10, notes 60-75)
      if (devType === 'maschine_studio' && note >= 60 && note <= 75) {
        const padIndex = note - 60;
        // Cycle Modes
        const modes = Object.values(VisualizerMode);
        const nextMode = modes[padIndex % modes.length];
        
        setVisualizationConfig(prev => ({
          ...prev,
          mode: nextMode,
          // Flash dynamic palette cycle
          colorPalette: rotatePalette(prev.colorPalette)
        }));

        window.dispatchEvent(new CustomEvent('plajah-midi-flash', {
          detail: { label: `Visualizer Mode`, value: nextMode }
        }));
      }

      // 2. Komplete Kontrol Keys (notes 36-84)
      if (devType === 'komplete_kontrol' && note >= 36 && note <= 84) {
        if (note < 48) {
          // Lower Octave triggers Mode Shifts
          const modes = Object.values(VisualizerMode);
          const idx = (note - 36) % modes.length;
          setVisualizationConfig(prev => ({ ...prev, mode: modes[idx] }));
        } else {
          // Upper Octave Triggers Palette color flash shifts
          setVisualizationConfig(prev => ({
            ...prev,
            colorPalette: rotatePalette(prev.colorPalette)
          }));
        }
      }

      // 3. Maschine Jam 8x8 pad matrix (notes 0-63)
      if (devType === 'maschine_jam' && note >= 0 && note <= 63) {
        // Triggers scene or palette updates
        if (note % 8 === 0) {
          window.dispatchEvent(new CustomEvent('sonic-jam-scene-trigger', { detail: { note } }));
        }
      }

      // Play/Stop buttons on Maschine Studio (Notes 20/21) or custom mapping
      if (note === 20) {
        window.dispatchEvent(new CustomEvent('plajah-midi-play-pause', { detail: 'pause' }));
      } else if (note === 21) {
        window.dispatchEvent(new CustomEvent('plajah-midi-play-pause', { detail: 'play' }));
      }
    }
  }, [setVisualizationConfig, learningParamRef, setLearningParam, addLog, audioElRef]);

  // Requesting MIDI Access
  const requestMidiAccess = useCallback(async () => {
    if (!navigator.requestMIDIAccess) {
      addLog('Web MIDI API not supported in this browser.');
      return;
    }
    try {
      const midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      setMidiConnected(true);
      addLog('Web MIDI Active');

      const inputs = Array.from(midiAccess.inputs.values());
      setMidiInputs(inputs);

      if (inputs.length > 0) {
        const mainInput = inputs[0];
        setDeviceName(mainInput.name || 'Connected Device');
        addLog(`Connected: ${mainInput.name}`);

        inputs.forEach((input: any) => {
          input.onmidimessage = handleMidiMessage;
        });
      } else {
        setDeviceName('Web MIDI Active (No Inputs Available)');
      }

      midiAccess.onstatechange = (e: any) => {
        const inps = Array.from(midiAccess.inputs.values());
        setMidiInputs(inps);
        if (inps.length > 0) {
          setDeviceName(inps[0].name || 'Connected Device');
          setMidiConnected(true);
          inps.forEach((input: any) => {
            input.onmidimessage = handleMidiMessage;
          });
        } else {
          setDeviceName('No MIDI Device Connected');
          setMidiConnected(false);
        }
      };
    } catch (err) {
      console.error('MIDI Access Denied:', err);
      addLog('MIDI Error: ' + ((err as any)?.message || String(err)));
      setDeviceName('Error: ' + ((err as any)?.message || 'MIDI access denied'));
      setMidiConnected(false);
    }
  }, [handleMidiMessage, addLog]);

  // Auto connect MIDI on mount
  useEffect(() => {
    requestMidiAccess();
  }, [requestMidiAccess]);

  // Rotates a palette's elements for cool active color effects
  const rotatePalette = (palette: string[]): string[] => {
    if (palette.length <= 1) return palette;
    const copied = [...palette];
    const last = copied.pop()!;
    copied.unshift(last);
    return copied;
  };

  // --- Real-time Micro/Line-In Audio Handling ---
  const toggleAudioInput = async () => {
    if (audioInputActive) {
      // Deactivate Microphone
      if (micStreamSourceRef.current) {
        micStreamSourceRef.current.disconnect();
        micStreamSourceRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
      }

      // Reconnect regular audio analyzer back to main system if playing
      if (analyserRef.current && audioContextRef.current) {
        try {
          // Re-route normal audio node to output
          analyserRef.current.connect(audioContextRef.current.destination);
        } catch (_) {}
      }

      setAudioInputActive(false);
      addLog('Microphone disabled');
    } else {
      // Activate Microphone input
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }
        
        // Resume context if suspended (common browser privacy rule)
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }

        // Create core elements if they do not exist
        if (!analyserRef.current) {
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 2048;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micStreamRef.current = stream;

        // Disconnect normal analyzer from main speakers so mic inputs don't scream dynamic feedback!
        try {
          analyserRef.current.disconnect();
        } catch (_) {}

        // Create mic stream source and only direct it to analyzer (silent feedback!)
        const micSource = audioContextRef.current.createMediaStreamSource(stream);
        micStreamSourceRef.current = micSource;
        micSource.connect(analyserRef.current);

        // Pause regular music to avoid overlap confusion
        if (audioElRef.current && !audioElRef.current.paused) {
          audioElRef.current.pause();
          window.dispatchEvent(new CustomEvent('plajah-music-pause'));
        }

        setAudioInputActive(true);
        addLog('Active Mic Input');
      } catch (err) {
        console.error('Failed to grab audio stream:', err);
        addLog('Mic Access Refused');
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (micStreamSourceRef.current) {
        micStreamSourceRef.current.disconnect();
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    midiConnected,
    deviceName,
    midiLog,
    audioInputActive,
    toggleAudioInput,
    requestMidiAccess,
    inputs: midiInputs
  };
}


// --- COMPONENT: MidiController Panel (HUD & Learn UI) ---
interface MidiControllerProps {
  config: VisualizationConfig;
  setConfig: React.Dispatch<React.SetStateAction<VisualizationConfig>>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  audioElRef: React.MutableRefObject<HTMLAudioElement | null>;
  sourceRef: React.MutableRefObject<MediaElementAudioSourceNode | null>;
}

export const MidiController: React.FC<MidiControllerProps> = ({
  config,
  setConfig,
  audioContextRef,
  analyserRef,
  audioElRef,
  sourceRef
}) => {
  const [mappings, setMappings] = useState<ParameterMappingsState>(() => {
    // Attempt local storage recall
    const cached = localStorage.getItem('plajah_midi_mappings');
    if (cached) {
      try { return JSON.parse(cached); } catch(_) {}
    }
    return DEFAULT_MAPPINGS;
  });

  const [activePadGrid, setActivePadGrid] = useState<4 | 8>(4);
  const [activeDeviceTemplate, setActiveDeviceTemplate] = useState<DetectedDeviceType>('generic');
  const [learningParamState, setLearningParamState] = useState<string | null>(null);
  
  // High-frequency midi learn maps uses mutable refs to meet low latency specs
  const learningParamRef = useRef<string | null>(null);

  const setLearningParam = (val: string | null) => {
    learningParamRef.current = val;
    setLearningParamState(val);
  };

  const {
    midiConnected,
    deviceName,
    midiLog,
    audioInputActive,
    toggleAudioInput,
    requestMidiAccess,
    inputs
  } = useMidiAudio(
    setConfig,
    audioContextRef,
    analyserRef,
    audioElRef,
    sourceRef,
    mappings,
    learningParamRef,
    setLearningParam
  );

  // Monitor e-device connection to switch visual panels automatically
  useEffect(() => {
    const detected = detectDeviceType(deviceName);
    setActiveDeviceTemplate(detected);
    if (detected === 'maschine_jam') {
      setActivePadGrid(8);
    } else {
      setActivePadGrid(4);
    }
  }, [deviceName]);

  // Handle manual learn assignment override
  const handleLearnClick = (param: string) => {
    if (learningParamState === param) {
      setLearningParam(null);
    } else {
      setLearningParam(param);
    }
  };

  // Reset mappings
  const resetMappings = () => {
    setMappings(DEFAULT_MAPPINGS);
    localStorage.removeItem('plajah_midi_mappings');
  };

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem('plajah_midi_mappings', JSON.stringify(mappings));
  }, [mappings]);

  // Hooking midi-cc event updates to display live bars inside this UI (for the mapping tables)
  const [liveCCValues, setLiveCCValues] = useState<Record<number, number>>({});
  const [activeStrips, setActiveStrips] = useState<Record<number, number>>({});

  useEffect(() => {
    const handleCC = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.cc !== undefined) {
        setLiveCCValues(prev => ({
          ...prev,
          [detail.cc]: detail.value
        }));

        // Fill touch strips
        if (detail.cc >= 1 && detail.cc <= 8) {
          setActiveStrips(prev => ({
            ...prev,
            [detail.cc]: detail.value
          }));
        }
      }
    };

    window.addEventListener('plajah-midi-cc', handleCC);
    return () => window.removeEventListener('plajah-midi-cc', handleCC);
  }, []);

  // Capture active physical pad hits to blink UI grid cells
  const [litPads, setLitPads] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const handleNoteOn = (e: Event) => {
      const detail = (e as CustomEvent).detail as MidiEventData;
      if (detail) {
        const note = detail.note;
        setLitPads(prev => ({ ...prev, [note]: true }));
      }
    };

    const handleNoteOff = (e: Event) => {
      const detail = (e as CustomEvent).detail as MidiEventData;
      if (detail) {
        const note = detail.note;
        setLitPads(prev => ({ ...prev, [note]: false }));
      }
    };

    window.addEventListener('plajah-midi-note-on', handleNoteOn);
    window.addEventListener('plajah-midi-note-off', handleNoteOff);
    return () => {
      window.removeEventListener('plajah-midi-note-on', handleNoteOn);
      window.removeEventListener('plajah-midi-note-off', handleNoteOff);
    };
  }, []);

  return (
    <div id="midi-panel" className="space-y-4 text-xs font-sans text-white/90">
      
      {/* 1. Controller Connectivity Bar */}
      <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${midiConnected ? 'text-green-500 animate-pulse' : 'text-zinc-500'}`} />
            <div>
              <span className="font-semibold block text-[11px] uppercase tracking-wider">Web MIDI Connection</span>
              <span className="text-[10px] text-white/40 font-mono truncate max-w-[200px] block">{deviceName}</span>
            </div>
          </div>
          <button
            onClick={requestMidiAccess}
            className="px-2 py-1 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg font-mono text-[10px] transition-all flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Scan Ports
          </button>
        </div>

        {/* Microphone Real-Time Toggle */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="font-medium text-[11px] block">Audio Hardware Receiver</span>
            <span className="text-[10px] text-white/40">Feed live mic or line-in bypass straight to visualizer.</span>
          </div>
          <button
            onClick={toggleAudioInput}
            className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 font-medium transition-all ${
              audioInputActive 
                ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-md animate-pulse' 
                : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
            }`}
          >
            {audioInputActive ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            {audioInputActive ? 'Disconnect Input' : 'Enable Real-time Mic'}
          </button>
        </div>
      </div>

      {/* 2. Interactive Pad Grid (Maschine or Jam grid simulation) */}
      <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <Keyboard className="w-4 h-4 text-purple-400" />
            <span className="font-semibold text-purple-400 uppercase tracking-wider text-[11px]">Hardware Pad Matrix</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setActivePadGrid(4)}
              className={`px-2 py-0.5 rounded text-[10px] ${activePadGrid === 4 ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/50 hover:text-white'}`}
            >
              4x4 Pads
            </button>
            <button
              onClick={() => setActivePadGrid(8)}
              className={`px-2 py-0.5 rounded text-[10px] ${activePadGrid === 8 ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/50 hover:text-white'}`}
            >
              8x8 Grid
            </button>
          </div>
        </div>

        <p className="text-[10px] text-white/40">Pads trigger radial waves on canvas or spawn custom emitters.</p>

        {activePadGrid === 4 ? (
          /* 4x4 Grid - Maschine Studio Layout */
          <div className="grid grid-cols-4 gap-2 max-w-[240px] mx-auto p-2 bg-black/40 border border-white/10 rounded-xl shadow-inner">
            {Array.from({ length: 16 }).map((_, i) => {
              // Standard MPC notes are typical 36-51 or Maschine notes 60-75
              const isStudioNoteOn = litPads[60 + i];
              const note = 60 + i;

              const triggerSimulatedPadOn = () => {
                dispatchMidiEvent({
                  status: 0x99, // Channel 10 Note On
                  channel: 9,
                  note,
                  velocity: 100,
                  cc: 0,
                  value: 0,
                  timestamp: performance.now(),
                  deviceName: 'Simulated Maschine Studio'
                });
                setTimeout(() => {
                  dispatchMidiEvent({
                    status: 0x89, // Channel 10 Note Off
                    channel: 9,
                    note,
                    velocity: 0,
                    cc: 0,
                    value: 0,
                    timestamp: performance.now(),
                    deviceName: 'Simulated Maschine Studio'
                  });
                }, 150);
              };

              return (
                <button
                  key={i}
                  onMouseDown={triggerSimulatedPadOn}
                  className={`aspect-square rounded-lg border font-mono text-[10px] flex items-center justify-center transition-all ${
                    isStudioNoteOn || litPads[note]
                      ? 'bg-gradient-to-tr from-purple-500 to-pink-500 border-white text-white shadow-lg scale-95' 
                      : 'bg-zinc-900 border-white/10 text-white/30 hover:border-white/30 hover:text-white/60'
                  }`}
                >
                  P{i + 1}
                </button>
              );
            })}
          </div>
        ) : (
          /* 8x8 Grid - Maschine Jam Layout */
          <div className="grid grid-cols-8 gap-1 max-w-[280px] mx-auto p-1.5 bg-black/40 border border-white/10 rounded-xl shadow-inner">
            {Array.from({ length: 64 }).map((_, i) => {
              const note = i; // Jam notes 0-63
              const isJamLit = litPads[note];

              const triggerSimulatedJamOn = () => {
                dispatchMidiEvent({
                  status: 0x90, // Note On
                  channel: 0,
                  note,
                  velocity: 90,
                  cc: 0,
                  value: 0,
                  timestamp: performance.now(),
                  deviceName: 'Simulated Maschine Jam'
                });
                setTimeout(() => {
                  dispatchMidiEvent({
                    status: 0x80, // Note Off
                    channel: 0,
                    note,
                    velocity: 0,
                    cc: 0,
                    value: 0,
                    timestamp: performance.now(),
                    deviceName: 'Simulated Maschine Jam'
                  });
                }, 150);
              };

              return (
                <button
                  key={i}
                  onMouseDown={triggerSimulatedJamOn}
                  className={`aspect-square w-full rounded border transition-all ${
                    isJamLit
                      ? 'bg-gradient-to-tr from-pink-500 to-yellow-400 border-white text-white shadow-md scale-90' 
                      : 'bg-zinc-900 border-white/5 text-[9px] hover:border-white/20'
                  }`}
                  title={`Note ${note}`}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Knob Mapping CC learn table */}
      <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-pink-400" />
            <span className="font-semibold text-pink-400 uppercase tracking-wider text-[11px]">Control Change (CC) Mappings</span>
          </div>
          <button
            onClick={resetMappings}
            className="text-[10px] text-red-400 hover:text-red-300 font-mono flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
        </div>

        {/* Learn Status HUD */}
        {learningParamState && (
          <div className="bg-purple-600/20 border border-purple-500/40 rounded-lg p-2 flex items-center gap-2 text-purple-200 animate-pulse">
            <Activity className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Learning mapping for <strong>{mappings[learningParamState]?.label}</strong>... Move a knob or slider to bind.</span>
          </div>
        )}

        <div className="max-h-60 overflow-y-auto border border-white/15 rounded-lg scrollbar-thin">
          <table className="w-full text-left font-mono text-[10.5px]">
            <thead className="bg-white/5 text-white/50 text-[10px] border-b border-white/10 uppercase tracking-widest pl-1 header-cell">
              <tr>
                <th className="p-2">PARAM</th>
                <th className="p-2 text-center">CC</th>
                <th className="p-2 text-right">VAL</th>
                <th className="p-2 text-center">LEARN</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(mappings).map((key) => {
                const map = mappings[key];
                const currentValInConfig = (config as any)[key] ?? 0;
                const activeCCVal = liveCCValues[map.ccOrNote] ?? 64; // Fallback mid level

                return (
                  <tr key={key} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-2 font-sans">
                      <span className="font-semibold text-white/80">{map.label}</span>
                      {/* Active level line */}
                      <div className="w-full bg-white/10 h-1 rounded-sm mt-1 overflow-hidden">
                        <div 
                          className="bg-purple-500 h-full transition-all" 
                          style={{ width: `${((activeCCVal) / 127) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="p-2 text-center text-semibold text-purple-400">CC {map.ccOrNote}</td>
                    <td className="p-2 text-right font-bold text-teal-300">
                      {currentValInConfig}
                    </td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => handleLearnClick(key)}
                        className={`px-1.5 py-0.5 rounded font-sans text-[10px] font-semibold border transition-all ${
                          learningParamState === key 
                            ? 'bg-rose-500 border-rose-500 text-white' 
                            : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-purple-500/45'
                        }`}
                      >
                        {learningParamState === key ? 'Waiting' : 'Learn'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Touch Strips Visualizer (Jam CC 1-8 / Kontrol CC 1) */}
      <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-2">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-teal-400 uppercase tracking-wider text-[11px]">Hardware Touch Strips</span>
          <span className="text-[10px] text-white/40">CC 1 - CC 8</span>
        </div>
        <div className="flex gap-2.5 h-16 pt-2">
          {Array.from({ length: 8 }).map((_, i) => {
            const cc = i + 1;
            const value = activeStrips[cc] ?? 0;
            const triggerContinuousStripValue = (e: React.MouseEvent<HTMLDivElement>) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = 1 - (e.clientY - rect.top) / rect.height; // Vertical touch drag
              const midVal = Math.round(percent * 127);
              dispatchMidiEvent({
                status: 0xb0,
                channel: 0,
                note: 0,
                velocity: 0,
                cc,
                value: midVal,
                timestamp: performance.now(),
                deviceName: 'Simulated Touch Strip'
              });
            };

            return (
              <div key={i} className="flex-1 flex flex-col justify-end space-y-1 items-center h-full">
                <div 
                  onClick={triggerContinuousStripValue}
                  className="w-2.5 h-full bg-zinc-950 border border-white/10 rounded-sm relative cursor-ns-resize overflow-hidden"
                >
                  <div 
                    className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-teal-500 to-indigo-500 rounded-sm"
                    style={{ height: `${(value / 127) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-white/40">S{cc}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};


// --- HUD: Small Floating HUD display inside bottom-left canvas ---
interface MidiStatusHudProps {
  config: VisualizationConfig;
}

export const MidiStatusHud: React.FC<MidiStatusHudProps> = ({ config }) => {
  const [hudDeviceName, setHudDeviceName] = useState<string>('No MIDI controller detected');
  const [hudActive, setHudActive] = useState<boolean>(false);
  const [hudLogs, setHudLogs] = useState<string[]>([]);
  
  // Custom HUD tracking listeners
  useEffect(() => {
    const handleRawMidi = (e: Event) => {
      const detail = (e as CustomEvent).detail as MidiEventData;
      if (detail) {
        setHudDeviceName(detail.deviceName);
        setHudActive(true);

        const isCC = detail.cc > 0;
        const msg = isCC 
          ? `CC ${detail.cc} ↦ ${detail.value}` 
          : `Note ${detail.note} (Vel ${detail.velocity})`;

        setHudLogs(prev => [msg, ...prev].slice(0, 3));
      }
    };

    window.addEventListener('plajah-midi-raw', handleRawMidi);
    return () => window.removeEventListener('plajah-midi-raw', handleRawMidi);
  }, []);

  return (
    <div 
      id="midi-hud" 
      className="absolute bottom-28 left-6 z-20 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-2.5 flex flex-col space-y-1.5 w-52 text-[10px] pointer-events-none shadow-2xl transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <Activity className={`w-3.5 h-3.5 shrink-0 ${hudActive ? 'text-green-500 animate-pulse' : 'text-zinc-500'}`} />
          <span className="font-semibold text-white/80 font-sans truncate max-w-[130px] block font-mono">
            {hudDeviceName}
          </span>
        </div>
        <span className={`w-1.5 h-1.5 rounded-full ${hudActive ? 'bg-green-500 pulse-dot' : 'bg-white/20'}`} />
      </div>

      <div className="border-t border-white/10 pt-1.5 flex flex-col space-y-0.5 max-h-[45px] overflow-hidden font-mono text-[9px] text-white/50">
        {hudLogs.length > 0 ? (
          hudLogs.map((log, idx) => (
            <div key={idx} className="truncate select-none">
              ● {log}
            </div>
          ))
        ) : (
          <div className="text-white/30 italic">Awaiting MIDI signals...</div>
        )}
      </div>
    </div>
  );
};
