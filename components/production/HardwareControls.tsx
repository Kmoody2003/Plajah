import React, { useEffect, useRef, useState } from 'react';
import { executeProductionCommand, productionHotkey, productionMidi, type ProductionControlTarget } from '../../services/productionControl';

export default function HardwareControls({ target }: { target: () => ProductionControlTarget | null }) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('');
  const targetRef = useRef(target); targetRef.current = target;
  const midiRef = useRef<any>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const mounted = useRef(true);
  useEffect(() => {
    if (!enabled) return;
    const key = (event: KeyboardEvent) => {
      if (document.visibilityState !== 'visible' || (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')) return;
      const command = productionHotkey(event), controller = targetRef.current();
      if (command && controller && executeProductionCommand(controller, command)) event.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [enabled]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cleanupRef.current(); }; }, []);
  const connectMidi = async () => {
    try {
      const request = (navigator as any).requestMIDIAccess;
      if (!request) { setStatus('MIDI is unavailable in this browser. Stream Deck hotkeys remain available.'); return; }
      cleanupRef.current();
      const access = await request.call(navigator, { sysex: false });
      if (!mounted.current) return;
      midiRef.current = access;
      const bind = () => {
        access.inputs.forEach((input: any) => { input.onmidimessage = (event: any) => {
          if (document.visibilityState !== 'visible') return;
          const command = productionMidi(event.data), controller = targetRef.current();
          if (command && controller) executeProductionCommand(controller, command);
        }; });
        setStatus(`${access.inputs.size} MIDI controller(s) connected.`);
      };
      bind(); access.onstatechange = bind;
      cleanupRef.current = () => { access.onstatechange = null; access.inputs.forEach((input: any) => { input.onmidimessage = null; }); midiRef.current = null; };
    } catch { setStatus('MIDI access was not granted.'); }
  };
  return <div className="border border-white/10 rounded-xl p-3 text-xs text-white/70 space-y-2">
    <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Stream Deck / hardware hotkeys</label>
    <p>Ctrl + Alt + 1–9: preview · add Shift: take · Enter: cut · Shift + Enter: auto</p>
    <button onClick={() => void connectMidi()} className="px-3 py-2 rounded-lg bg-white/10">Connect MIDI controller</button>
    <p className="text-white/40">Notes 36–44: preview · 45: cut · 46: auto · CC 0–8: source faders</p>
    {midiRef.current && <button onClick={() => { cleanupRef.current(); setStatus('MIDI disconnected.'); }} className="ml-2 px-3 py-2 rounded-lg bg-white/10">Disconnect</button>}
    <p className="text-white/40">ATEM SDK connection requires the native ATEM bridge; it is not enabled in this browser.</p>
    {status && <p role="status">{status}</p>}
  </div>;
}
