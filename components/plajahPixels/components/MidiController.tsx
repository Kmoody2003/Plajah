import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Radio, Keyboard, Sliders, Mic, MicOff,
  Activity, RefreshCw, Trash2,
} from 'lucide-react';
import {
  DEFAULT_MAPPINGS,
  MidiMapping,
  PadAction,
  PadMapping,
  KnobMapping,
  scaleCCValue,
  rotatePalette,
  dispatchMidiEvent,
  detectDeviceType,
  DetectedDeviceType,
  MidiEventData,
  MASCHINE_STUDIO_VJ_PRESET,
  VJ_PAD_BY_NOTE,
} from '../services/midiService';
import { VisualizationConfig, VisualizerMode } from '../types';

export type ParameterMappingsState = Record<string, MidiMapping>;

// Studio engine scene key → VisualizerMode string (mirrors types.ts STUDIO_SCENE_TO_MODE)
const SCENE_TO_MODE: Record<string, string> = {
  aurora:    'STUDIO_AURORA',
  chrome:    'STUDIO_CHROME',
  bauhaus:   'STUDIO_BAUHAUS',
  nebula:    'STUDIO_NEBULA',
  gravity:   'STUDIO_GRAVITY',
  kinetic:   'STUDIO_KINETIC',
  ripple:    'STUDIO_RIPPLE',
  plasma:    'STUDIO_PLASMA',
  raymarch:  'STUDIO_RAYMARCH',
};

// ─── Hook: useMidiAudio ───────────────────────────────────────────────────────

export function useMidiAudio(
  setVisualizationConfig: React.Dispatch<React.SetStateAction<VisualizationConfig>>,
  audioContextRef: React.MutableRefObject<AudioContext | null>,
  analyserRef:     React.MutableRefObject<AnalyserNode | null>,
  audioElRef:      React.MutableRefObject<HTMLAudioElement | null>,
  sourceRef:       React.MutableRefObject<MediaElementAudioSourceNode | null>,
  mappings:        ParameterMappingsState,
  learningParamRef:React.MutableRefObject<string | null>,
  setLearningParam:(param: string | null) => void,
) {
  const [midiConnected,   setMidiConnected]   = useState(false);
  const [deviceName,      setDeviceName]      = useState<string>('No MIDI Device Connected');
  const [midiLog,         setMidiLog]         = useState<string[]>([]);
  const [audioInputActive,setAudioInputActive]= useState(false);
  const [midiInputs,      setMidiInputs]      = useState<any[]>([]);

  const micStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micStreamRef       = useRef<MediaStream | null>(null);
  const volumeMappingRef   = useRef<MidiMapping>(DEFAULT_MAPPINGS.volume);

  const mappingsRef = useRef<ParameterMappingsState>(mappings);
  useEffect(() => { mappingsRef.current = mappings; }, [mappings]);

  const addLog = useCallback((msg: string) => {
    setMidiLog(prev => [msg, ...prev].slice(0, 3));
  }, []);

  // ─── Execute a VJ pad action ────────────────────────────────────────────────
  const executePadAction = useCallback((action: PadAction, label: string) => {
    switch (action.type) {
      case 'mode':
        setVisualizationConfig(prev => ({ ...prev, mode: action.mode as VisualizerMode }));
        addLog(`SCENE: ${label}`);
        break;

      case 'scene': {
        const mode = SCENE_TO_MODE[action.scene];
        if (mode) setVisualizationConfig(prev => ({ ...prev, mode: mode as VisualizerMode }));
        addLog(`STUDIO: ${label}`);
        break;
      }

      case 'toggle':
        setVisualizationConfig(prev => ({
          ...prev,
          [action.key]: !(prev as any)[action.key],
        }));
        addLog(`TOGGLE: ${label}`);
        break;

      case 'palette_rotate':
        setVisualizationConfig(prev => ({
          ...prev,
          colorPalette: rotatePalette(prev.colorPalette),
        }));
        addLog(`PALETTE: rotated`);
        break;

      case 'milkdrop_toggle':
        window.dispatchEvent(new CustomEvent('plajah-milkdrop-toggle'));
        addLog(`MILKDROP: toggle`);
        break;

      case 'milkdrop_next':
        window.dispatchEvent(new CustomEvent('plajah-milkdrop-next'));
        addLog(`MILKDROP: next`);
        break;

      case 'strobe':
        setVisualizationConfig(prev => ({ ...prev, enableInvertStrobe: true }));
        setTimeout(() => setVisualizationConfig(prev => ({ ...prev, enableInvertStrobe: false })), 300);
        addLog(`STROBE: flash`);
        break;
    }
  }, [setVisualizationConfig, addLog]);

  // ─── Raw MIDI message handler ───────────────────────────────────────────────
  const handleMidiMessage = useCallback((e: any) => {
    const data: Uint8Array = e.data;
    if (!data || data.length < 3) return;

    const status = data[0];
    const byte1  = data[1];
    const byte2  = data[2];

    const channel  = status & 0x0f;
    const type     = status & 0xf0;
    const isNoteOn = type === 0x90 && byte2 > 0;
    const isCC     = type === 0xb0;

    const eventData: MidiEventData = {
      status,
      channel,
      note:      isCC ? 0 : byte1,
      velocity:  isCC ? 0 : byte2,
      cc:        isCC ? byte1 : 0,
      value:     isCC ? byte2 : 0,
      timestamp: performance.now(),
      deviceName: e.target?.name || 'Unknown',
    };

    // Dispatch global events for high-performance canvas listeners
    dispatchMidiEvent(eventData);

    // ── MIDI Learn capture ──────────────────────────────────────────────────
    if (isCC && learningParamRef.current) {
      const parameter = learningParamRef.current;
      addLog(`Learned CC ${byte1} → ${parameter}`);
      learningParamRef.current = null;
      setLearningParam(null);
      return;
    }

    // ── CC: knobs / sliders ─────────────────────────────────────────────────
    if (isCC) {
      addLog(`CC ${byte1}: ${byte2}`);

      // Komplete Kontrol endless knobs (CC 74–81) re-map to Group A (CC 14–21)
      const lookupCC = (byte1 >= 74 && byte1 <= 81) ? byte1 - 60 : byte1;

      const matchedParam = Object.keys(mappingsRef.current).find(
        key => mappingsRef.current[key].ccOrNote === lookupCC
            || mappingsRef.current[key].ccOrNote === byte1,
      );

      if (matchedParam) {
        const mapping    = mappingsRef.current[matchedParam];
        const scaledVal  = scaleCCValue(byte2, mapping);
        setVisualizationConfig(prev => ({ ...prev, [matchedParam]: scaledVal }));
        window.dispatchEvent(new CustomEvent('plajah-midi-flash', {
          detail: { label: mapping.label, value: scaledVal },
        }));
      }

      // Master Volume (CC 7 by default)
      if (byte1 === volumeMappingRef.current.ccOrNote) {
        const vol = parseFloat((byte2 / 127).toFixed(2));
        if (audioElRef.current) audioElRef.current.volume = vol;
        window.dispatchEvent(new CustomEvent('plajah-volume-change', { detail: vol }));
      }
    }

    // ── Note On: pads ───────────────────────────────────────────────────────
    if (isNoteOn) {
      const note     = byte1;
      const devType  = detectDeviceType(e.target?.name || '');

      // VJ Pad Actions — notes 60–75 on any non-Jam device
      // (Maschine Studio sends these in MIDI mode; generic also falls here)
      if (note >= 60 && note <= 75 && devType !== 'maschine_jam') {
        const pad = VJ_PAD_BY_NOTE[note];
        if (pad) {
          executePadAction(pad.action, pad.label);
          window.dispatchEvent(new CustomEvent('plajah-midi-flash', {
            detail: { label: pad.label, value: note },
          }));
        }
        return;
      }

      // Komplete Kontrol keys (notes 36–84)
      if (devType === 'komplete_kontrol' && note >= 36 && note <= 84) {
        if (note < 48) {
          const modes = Object.values(VisualizerMode);
          setVisualizationConfig(prev => ({ ...prev, mode: modes[(note - 36) % modes.length] }));
        } else {
          setVisualizationConfig(prev => ({ ...prev, colorPalette: rotatePalette(prev.colorPalette) }));
        }
        return;
      }

      // Maschine Jam 8×8 grid (notes 0–63)
      if (devType === 'maschine_jam' && note >= 0 && note <= 63) {
        if (note % 8 === 0) {
          window.dispatchEvent(new CustomEvent('sonic-jam-scene-trigger', { detail: { note } }));
        }
        return;
      }

      // Generic transport buttons (notes 20/21)
      if (note === 20) window.dispatchEvent(new CustomEvent('plajah-midi-play-pause', { detail: 'pause' }));
      if (note === 21) window.dispatchEvent(new CustomEvent('plajah-midi-play-pause', { detail: 'play'  }));
    }
  }, [setVisualizationConfig, executePadAction, learningParamRef, setLearningParam, addLog, audioElRef]);

  // ── Web MIDI access ─────────────────────────────────────────────────────────
  const requestMidiAccess = useCallback(async () => {
    if (!navigator.requestMIDIAccess) {
      addLog('Web MIDI API not supported.');
      return;
    }
    try {
      const midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      setMidiConnected(true);
      addLog('Web MIDI Active');

      const inputs = Array.from(midiAccess.inputs.values());
      setMidiInputs(inputs);

      if (inputs.length > 0) {
        const main = inputs[0];
        setDeviceName(main.name || 'Connected Device');
        addLog(`Connected: ${main.name}`);
        inputs.forEach((input: any) => { input.onmidimessage = handleMidiMessage; });
      } else {
        setDeviceName('Web MIDI Active — No Inputs');
      }

      midiAccess.onstatechange = (e: any) => {
        const inps = Array.from(midiAccess.inputs.values());
        setMidiInputs(inps);
        if (inps.length > 0) {
          setDeviceName(inps[0].name || 'Connected Device');
          setMidiConnected(true);
          inps.forEach((input: any) => { input.onmidimessage = handleMidiMessage; });
        } else {
          setDeviceName('No MIDI Device Connected');
          setMidiConnected(false);
        }
      };
    } catch (err) {
      addLog('MIDI Error: ' + ((err as any)?.message || String(err)));
      setDeviceName('Error: ' + ((err as any)?.message || 'MIDI access denied'));
      setMidiConnected(false);
    }
  }, [handleMidiMessage, addLog]);

  useEffect(() => { requestMidiAccess(); }, [requestMidiAccess]);

  // ── Mic / Line-In toggle ────────────────────────────────────────────────────
  const toggleAudioInput = async () => {
    if (audioInputActive) {
      if (micStreamSourceRef.current) { micStreamSourceRef.current.disconnect(); micStreamSourceRef.current = null; }
      if (micStreamRef.current)       { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
      try { if (analyserRef.current && audioContextRef.current) analyserRef.current.connect(audioContextRef.current.destination); } catch (_) {}
      setAudioInputActive(false);
      addLog('Microphone disabled');
    } else {
      try {
        if (!audioContextRef.current)                       audioContextRef.current = new AudioContext();
        if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
        if (!analyserRef.current) {
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 2048;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micStreamRef.current = stream;
        try { analyserRef.current.disconnect(); } catch (_) {}
        const micSrc = audioContextRef.current.createMediaStreamSource(stream);
        micStreamSourceRef.current = micSrc;
        micSrc.connect(analyserRef.current);
        if (audioElRef.current && !audioElRef.current.paused) {
          audioElRef.current.pause();
          window.dispatchEvent(new CustomEvent('plajah-music-pause'));
        }
        setAudioInputActive(true);
        addLog('Active Mic Input');
      } catch (err) {
        addLog('Mic Access Refused');
      }
    }
  };

  useEffect(() => () => {
    micStreamSourceRef.current?.disconnect();
    micStreamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  return { midiConnected, deviceName, midiLog, audioInputActive, toggleAudioInput, requestMidiAccess, inputs: midiInputs };
}

// ─── MidiController Panel ─────────────────────────────────────────────────────

interface MidiControllerProps {
  config:          VisualizationConfig;
  setConfig:       React.Dispatch<React.SetStateAction<VisualizationConfig>>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  analyserRef:     React.MutableRefObject<AnalyserNode | null>;
  audioElRef:      React.MutableRefObject<HTMLAudioElement | null>;
  sourceRef:       React.MutableRefObject<MediaElementAudioSourceNode | null>;
}

// Action badge labels for the pad overlay
const ACTION_BADGE: Record<PadAction['type'], string> = {
  mode:            'SCENE',
  scene:           'GL',
  toggle:          'FX',
  palette_rotate:  'CLR',
  milkdrop_toggle: 'MILK',
  milkdrop_next:   'MILK+',
  strobe:          'STRB',
};

export const MidiController: React.FC<MidiControllerProps> = ({
  config, setConfig, audioContextRef, analyserRef, audioElRef, sourceRef,
}) => {
  const [mappings, setMappings] = useState<ParameterMappingsState>(() => {
    const cached = localStorage.getItem('plajah_midi_mappings');
    if (cached) { try { return JSON.parse(cached); } catch (_) {} }
    return DEFAULT_MAPPINGS;
  });

  const [activePadGrid,        setActivePadGrid]        = useState<4 | 8>(4);
  const [activeDeviceTemplate, setActiveDeviceTemplate] = useState<DetectedDeviceType>('generic');
  const [learningParamState,   setLearningParamState]   = useState<string | null>(null);

  const learningParamRef = useRef<string | null>(null);
  const setLearningParam = (val: string | null) => {
    learningParamRef.current = val;
    setLearningParamState(val);
  };

  const {
    midiConnected, deviceName, midiLog, audioInputActive,
    toggleAudioInput, requestMidiAccess,
  } = useMidiAudio(
    setConfig, audioContextRef, analyserRef, audioElRef, sourceRef,
    mappings, learningParamRef, setLearningParam,
  );

  useEffect(() => {
    const detected = detectDeviceType(deviceName);
    setActiveDeviceTemplate(detected);
    setActivePadGrid(detected === 'maschine_jam' ? 8 : 4);
  }, [deviceName]);

  const handleLearnClick = (param: string) => {
    setLearningParam(learningParamState === param ? null : param);
  };

  const resetMappings = () => {
    setMappings(DEFAULT_MAPPINGS);
    localStorage.removeItem('plajah_midi_mappings');
  };

  useEffect(() => {
    localStorage.setItem('plajah_midi_mappings', JSON.stringify(mappings));
  }, [mappings]);

  const [liveCCValues, setLiveCCValues] = useState<Record<number, number>>({});
  const [activeStrips, setActiveStrips] = useState<Record<number, number>>({});

  useEffect(() => {
    const handleCC = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.cc !== undefined) {
        setLiveCCValues(prev => ({ ...prev, [d.cc]: d.value }));
        if (d.cc >= 1 && d.cc <= 8) setActiveStrips(prev => ({ ...prev, [d.cc]: d.value }));
      }
    };
    window.addEventListener('plajah-midi-cc', handleCC);
    return () => window.removeEventListener('plajah-midi-cc', handleCC);
  }, []);

  const [litPads, setLitPads] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const on  = (e: Event) => { const d = (e as CustomEvent).detail as MidiEventData; if (d) setLitPads(p => ({ ...p, [d.note]: true  })); };
    const off = (e: Event) => { const d = (e as CustomEvent).detail as MidiEventData; if (d) setLitPads(p => ({ ...p, [d.note]: false })); };
    window.addEventListener('plajah-midi-note-on',  on);
    window.addEventListener('plajah-midi-note-off', off);
    return () => {
      window.removeEventListener('plajah-midi-note-on',  on);
      window.removeEventListener('plajah-midi-note-off', off);
    };
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div id="midi-panel" className="space-y-4 text-xs font-sans text-white/90">

      {/* ── 1. Connection Bar ─────────────────────────────────────────────── */}
      <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${midiConnected ? 'text-green-500 animate-pulse' : 'text-zinc-500'}`} />
            <div>
              <span className="font-semibold block text-[11px] uppercase tracking-wider">Web MIDI</span>
              <span className="text-[10px] text-white/40 font-mono truncate max-w-[200px] block">{deviceName}</span>
            </div>
          </div>
          <button
            onClick={requestMidiAccess}
            className="px-2 py-1 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg font-mono text-[10px] transition-all flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Scan
          </button>
        </div>

        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
          <div>
            <span className="font-medium text-[11px] block">Audio Input</span>
            <span className="text-[10px] text-white/40">Live mic / line-in to visualizer.</span>
          </div>
          <button
            onClick={toggleAudioInput}
            className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 font-medium transition-all ${
              audioInputActive
                ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse'
                : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
            }`}
          >
            {audioInputActive ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            {audioInputActive ? 'Disconnect' : 'Enable Mic'}
          </button>
        </div>
      </div>

      {/* ── 2. Knob Rack — K1→K8 (CC 14→21) ─────────────────────────────── */}
      <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
        <div className="flex items-center gap-1.5">
          <Sliders className="w-4 h-4 text-teal-400" />
          <span className="font-semibold text-teal-400 uppercase tracking-wider text-[11px]">
            8 Knobs — CC 14→21
          </span>
        </div>
        <p className="text-[10px] text-white/40">Ordered by live performance priority — K1 is your primary reactivity dial.</p>

        <div className="grid grid-cols-4 gap-2">
          {MASCHINE_STUDIO_VJ_PRESET.knobs.map((knob: KnobMapping) => {
            const ccVal = liveCCValues[knob.ccOrNote] ?? 0;
            const pct   = Math.round((ccVal / 127) * 100);
            const deg   = Math.round((pct / 100) * 270) - 135; // -135° to +135°
            return (
              <div key={knob.knob} className="flex flex-col items-center gap-1">
                {/* Knob dial */}
                <div
                  className="relative w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    background: `conic-gradient(${knob.color}70 ${pct * 3.6}deg, #1c1c1e ${pct * 3.6}deg)`,
                    boxShadow:  ccVal > 0 ? `0 0 8px ${knob.color}55` : 'none',
                    border:     `2px solid ${knob.color}40`,
                  }}
                >
                  <span className="text-[9px] font-black text-white/90">K{knob.knob}</span>
                </div>
                <span className="text-[9px] text-white/60 text-center leading-tight font-medium">{knob.label}</span>
                <span className="text-[8px] font-mono text-white/30">CC {knob.ccOrNote}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 3. VJ Pad Grid — Maschine Studio Layout ───────────────────────── */}
      <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <Keyboard className="w-4 h-4 text-purple-400" />
            <span className="font-semibold text-purple-400 uppercase tracking-wider text-[11px]">
              {activePadGrid === 4 ? 'Maschine Studio Pads' : '8×8 Grid (Maschine Jam)'}
            </span>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setActivePadGrid(4)} className={`px-2 py-0.5 rounded text-[10px] ${activePadGrid === 4 ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/50 hover:text-white'}`}>4×4</button>
            <button onClick={() => setActivePadGrid(8)} className={`px-2 py-0.5 rounded text-[10px] ${activePadGrid === 8 ? 'bg-purple-600 text-white' : 'bg-white/5 text-white/50 hover:text-white'}`}>8×8</button>
          </div>
        </div>

        {activePadGrid === 4 ? (
          <>
            {/* Row labels */}
            <div className="flex justify-between text-[9px] font-mono text-white/25 px-1">
              <span>TOP (macros)</span>
              <span>BOT (core scenes)</span>
            </div>

            {/* 4×4 VJ pad grid — rows rendered top→bottom (row 4 first visually) */}
            <div className="grid grid-cols-4 gap-1.5 p-2 bg-black/50 border border-white/10 rounded-xl">
              {[4, 3, 2, 1].flatMap(row =>
                MASCHINE_STUDIO_VJ_PRESET.pads
                  .filter((p: PadMapping) => p.row === row)
                  .map((pad: PadMapping) => {
                    const isLit  = !!litPads[pad.note];
                    const badge  = ACTION_BADGE[pad.action.type];

                    const simulatePad = () => {
                      dispatchMidiEvent({ status: 0x99, channel: 9, note: pad.note, velocity: 100, cc: 0, value: 0, timestamp: performance.now(), deviceName: 'Simulated Maschine Studio' });
                      setTimeout(() => dispatchMidiEvent({ status: 0x89, channel: 9, note: pad.note, velocity: 0, cc: 0, value: 0, timestamp: performance.now(), deviceName: 'Simulated Maschine Studio' }), 150);
                    };

                    return (
                      <button
                        key={pad.note}
                        onMouseDown={simulatePad}
                        title={`Note ${pad.note} — ${pad.label}`}
                        className="aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all p-1 select-none"
                        style={{
                          background:  isLit ? pad.color            : pad.color + '28',
                          border:      `1px solid ${isLit ? pad.color + 'cc' : pad.color + '30'}`,
                          boxShadow:   isLit ? `0 0 14px ${pad.color}99` : 'none',
                          transform:   isLit ? 'scale(0.92)' : 'scale(1)',
                        }}
                      >
                        <span className="text-[8px] font-black text-white leading-none tracking-tight">{pad.label}</span>
                        <span className="text-[7px] font-mono leading-none" style={{ color: isLit ? 'rgba(255,255,255,0.75)' : pad.color + 'bb' }}>{badge}</span>
                      </button>
                    );
                  }),
              )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-mono text-white/30 px-1">
              <span><span className="text-white/50">SCENE</span>=Visualizer mode</span>
              <span><span className="text-white/50">GL</span>=Studio WebGL engine</span>
              <span><span className="text-white/50">FX</span>=Toggle effect</span>
              <span><span className="text-white/50">MILK</span>=Milkdrop</span>
              <span><span className="text-white/50">CLR</span>=Rotate palette</span>
            </div>
          </>
        ) : (
          /* 8×8 Maschine Jam grid */
          <div className="grid grid-cols-8 gap-1 max-w-[280px] mx-auto p-1.5 bg-black/40 border border-white/10 rounded-xl">
            {Array.from({ length: 64 }).map((_, i) => {
              const note    = i;
              const isJamLit = litPads[note];
              const simJam   = () => {
                dispatchMidiEvent({ status: 0x90, channel: 0, note, velocity: 90, cc: 0, value: 0, timestamp: performance.now(), deviceName: 'Simulated Maschine Jam' });
                setTimeout(() => dispatchMidiEvent({ status: 0x80, channel: 0, note, velocity: 0, cc: 0, value: 0, timestamp: performance.now(), deviceName: 'Simulated Maschine Jam' }), 150);
              };
              return (
                <button
                  key={i}
                  onMouseDown={simJam}
                  title={`Note ${note}`}
                  className={`aspect-square w-full rounded border transition-all ${
                    isJamLit ? 'bg-gradient-to-tr from-pink-500 to-yellow-400 border-white scale-90 shadow-md' : 'bg-zinc-900 border-white/5 hover:border-white/20'
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4. CC Mapping Table (learn mode) ──────────────────────────────── */}
      <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-pink-400" />
            <span className="font-semibold text-pink-400 uppercase tracking-wider text-[11px]">CC Mappings</span>
          </div>
          <button onClick={resetMappings} className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Reset
          </button>
        </div>

        {learningParamState && (
          <div className="bg-purple-600/20 border border-purple-500/40 rounded-lg p-2 flex items-center gap-2 text-purple-200 animate-pulse">
            <Activity className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Waiting for CC — move a knob to bind <strong>{mappings[learningParamState]?.label}</strong>.</span>
          </div>
        )}

        <div className="max-h-52 overflow-y-auto border border-white/15 rounded-lg scrollbar-thin">
          <table className="w-full text-left font-mono text-[10.5px]">
            <thead className="bg-white/5 text-white/50 text-[10px] border-b border-white/10 uppercase tracking-widest">
              <tr>
                <th className="p-2">Param</th>
                <th className="p-2 text-center">CC</th>
                <th className="p-2 text-right">Val</th>
                <th className="p-2 text-center">Learn</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(mappings).map(key => {
                const map          = mappings[key];
                const configVal    = (config as any)[key] ?? 0;
                const activeCCVal  = liveCCValues[map.ccOrNote] ?? 64;
                return (
                  <tr key={key} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-2 font-sans">
                      <span className="font-semibold text-white/80">{map.label}</span>
                      <div className="w-full bg-white/10 h-1 rounded-sm mt-1 overflow-hidden">
                        <div className="bg-purple-500 h-full transition-all" style={{ width: `${(activeCCVal / 127) * 100}%` }} />
                      </div>
                    </td>
                    <td className="p-2 text-center text-purple-400">CC {map.ccOrNote}</td>
                    <td className="p-2 text-right font-bold text-teal-300">{configVal}</td>
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

      {/* ── 5. Touch Strips (CC 1–8) ──────────────────────────────────────── */}
      <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-2">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-teal-400 uppercase tracking-wider text-[11px]">Touch Strips</span>
          <span className="text-[10px] text-white/40">CC 1–8</span>
        </div>
        <div className="flex gap-2.5 h-16 pt-2">
          {Array.from({ length: 8 }).map((_, i) => {
            const cc    = i + 1;
            const value = activeStrips[cc] ?? 0;
            const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
              const rect  = e.currentTarget.getBoundingClientRect();
              const pct   = 1 - (e.clientY - rect.top) / rect.height;
              const midVal = Math.round(pct * 127);
              dispatchMidiEvent({ status: 0xb0, channel: 0, note: 0, velocity: 0, cc, value: midVal, timestamp: performance.now(), deviceName: 'Simulated Touch Strip' });
            };
            return (
              <div key={i} className="flex-1 flex flex-col justify-end items-center h-full gap-1">
                <div
                  onClick={handleClick}
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

      {/* ── MIDI log ───────────────────────────────────────────────────────── */}
      {midiLog.length > 0 && (
        <div className="px-1 space-y-0.5">
          {midiLog.map((l, i) => (
            <div key={i} className="text-[9px] font-mono text-white/25 truncate">● {l}</div>
          ))}
        </div>
      )}
    </div>
  );
};


// ─── Floating MIDI HUD ────────────────────────────────────────────────────────

interface MidiStatusHudProps { config: VisualizationConfig; }

export const MidiStatusHud: React.FC<MidiStatusHudProps> = ({ config }) => {
  const [hudDeviceName, setHudDeviceName] = useState('No MIDI controller detected');
  const [hudActive,     setHudActive]     = useState(false);
  const [hudLogs,       setHudLogs]       = useState<string[]>([]);

  useEffect(() => {
    const handleRaw = (e: Event) => {
      const d = (e as CustomEvent).detail as MidiEventData;
      if (!d) return;
      setHudDeviceName(d.deviceName);
      setHudActive(true);
      const msg = d.cc > 0 ? `CC ${d.cc} ↦ ${d.value}` : `Note ${d.note} (Vel ${d.velocity})`;
      setHudLogs(prev => [msg, ...prev].slice(0, 3));
    };
    window.addEventListener('plajah-midi-raw', handleRaw);
    return () => window.removeEventListener('plajah-midi-raw', handleRaw);
  }, []);

  return (
    <div
      id="midi-hud"
      className="absolute bottom-28 left-6 z-20 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-2.5 flex flex-col space-y-1.5 w-52 text-[10px] pointer-events-none shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <Activity className={`w-3.5 h-3.5 shrink-0 ${hudActive ? 'text-green-500 animate-pulse' : 'text-zinc-500'}`} />
          <span className="font-semibold text-white/80 font-mono truncate max-w-[130px] block">{hudDeviceName}</span>
        </div>
        <span className={`w-1.5 h-1.5 rounded-full ${hudActive ? 'bg-green-500' : 'bg-white/20'}`} />
      </div>
      <div className="border-t border-white/10 pt-1.5 flex flex-col gap-0.5 max-h-[45px] overflow-hidden font-mono text-[9px] text-white/50">
        {hudLogs.length > 0
          ? hudLogs.map((l, i) => <div key={i} className="truncate">● {l}</div>)
          : <div className="text-white/30 italic">Awaiting MIDI signals…</div>}
      </div>
    </div>
  );
};
