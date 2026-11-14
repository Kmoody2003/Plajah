// Hardware inputs — pick an ASIO interface or console (StudioLive over USB, Quantum, anything with
// an ASIO driver), see every input's level, and turn the ones you want into armed audio tracks.
// Recording itself happens in useMultitrackCapture during a normal record pass.
//
// Everything shown is what the driver reported: channel counts, input names and sample rates come
// from opening the driver, and an unplugged device says so instead of showing placeholder inputs.

import React, { useEffect, useRef, useState } from 'react';
import { Cable, X } from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../../services/melos/beats/grooveDoc';
import { planTracksFromMixer } from '../../../../services/melos/beats/mixerLink/planTracks';
import type { MixerChannel, MixerFamily } from '../../../../services/melos/beats/mixerLink/types';
import {
  isWindowsApp, listAsioDrivers, onAsioLevels, probeAsioDriver, startAsioCapture, stopAsioCapture, type AsioDriverProbe,
} from '../../../../services/windowsBridgeService';
import { asioDriverOf } from '../useMultitrackCapture';

const TRACK_COLORS = ['#00DAF3', '#FF8C00', '#B84DFF', '#06D6A0', '#FF4D8D', '#FFD166', '#5B8CFF', '#F78C6C'];
const METER_MAX_INPUTS = 64;

const familyOf = (driver: string): MixerFamily =>
  /studiolive series iii/i.test(driver) ? 'studiolive-iii' : /studiolive/i.test(driver) ? 'studiolive-ai' : 'generic';

export function HardwareInputsPanel(p: {
  doc: GrooveDoc;
  mutate: (fn: (d: GrooveDoc) => void) => void;
  recording: boolean;
  onClose: () => void;
}) {
  const { doc, mutate, recording } = p;
  const native = isWindowsApp();
  const linkedDriver = doc.mixerLink?.deviceId.startsWith('asio:') ? asioDriverOf(doc.mixerLink.deviceId) : '';
  const [drivers, setDrivers] = useState<string[] | null>(null);
  const [driver, setDriver] = useState(linkedDriver);
  const [probe, setProbe] = useState<AsioDriverProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const [rate, setRate] = useState(doc.mixerLink?.sampleRate ?? 48000);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [peaks, setPeaks] = useState<Record<number, number>>({});
  const [meterError, setMeterError] = useState<string | null>(null);
  const meterTake = useRef<string | null>(null);

  useEffect(() => {
    if (!native) return;
    void listAsioDrivers().then((d) => { setDrivers(d); if (!driver && d.length) setDriver(d[0]); }).catch(() => setDrivers([]));
  }, [native]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open the chosen driver to read what it really has.
  useEffect(() => {
    if (!native || !driver) return;
    setProbing(true); setProbe(null); setPeaks({});
    // ASIO opens one driver at a time: release the meters on the previous one before probing.
    const releasing = meterTake.current ? stopAsioCapture(meterTake.current).catch(() => null) : Promise.resolve(null);
    meterTake.current = null;
    void releasing.then(() => probeAsioDriver(driver)).then((r) => {
      setProbe(r);
      if (r.ok) {
        if (!r.sampleRates.includes(rate)) setRate(r.sampleRates.includes(48000) ? 48000 : r.sampleRates[0] ?? 48000);
        const bound = new Set(doc.arrangement.filter((t) => t.input?.deviceId === `asio:${driver}`).flatMap((t) => [t.input!.input, ...(t.input!.inputR != null ? [t.input!.inputR] : [])]));
        setPicked(new Set(Array.from({ length: r.inputs }, (_, i) => i).filter((i) => !bound.has(i))));
      }
    }).catch((e) => setProbe({ driver, ok: false, error: e instanceof Error ? e.message : String(e), inputs: 0, outputs: 0, inputNames: [], sampleRates: [] }))
      .finally(() => setProbing(false));
  }, [native, driver]); // eslint-disable-line react-hooks/exhaustive-deps

  // Meters: a capture that writes nothing, while the panel is open and no record pass is armed. A
  // record pass replaces it natively (the take's own levels keep the meters moving), so this
  // never stops a session it didn't start.
  useEffect(() => {
    if (!native || !probe?.ok || recording) return;
    const inputs = Array.from({ length: Math.min(probe.inputs, METER_MAX_INPUTS) }, (_, i) => i);
    if (!inputs.length) return;
    const takeId = `meter${Date.now().toString(36)}`;
    meterTake.current = takeId;
    setMeterError(null);
    void startAsioCapture({ driver: probe.driver, inputs, sampleRate: rate, takeId, write: false })
      .then((r) => { if (!r.ok) setMeterError(r.error ?? 'Driver would not start'); })
      .catch((e) => setMeterError(e instanceof Error ? e.message : String(e)));
    return () => { meterTake.current = null; void stopAsioCapture(takeId).catch(() => {}); };
  }, [native, probe, rate, recording]);

  useEffect(() => {
    if (!native) return;
    const decay = window.setInterval(() => setPeaks((pk) => {
      const o: Record<number, number> = {};
      for (const k in pk) o[k] = pk[k] * 0.82;
      return o;
    }), 60);
    const off = onAsioLevels((m) => setPeaks((pk) => {
      const o = { ...pk };
      m.inputs.forEach((input, k) => { o[input] = Math.max(o[input] ?? 0, m.peaks[k] ?? 0); });
      return o;
    }));
    return () => { off(); window.clearInterval(decay); };
  }, [native]);

  // Not memoized: the doc's arrangement is mutated in place, so its identity doesn't change.
  const boundByInput = new Map<number, string>();
  for (const t of doc.arrangement) if (t.input?.deviceId === `asio:${driver}`) {
    boundByInput.set(t.input.input, t.name);
    if (t.input.inputR != null) boundByInput.set(t.input.inputR, t.name);
  }

  const addTracks = () => {
    if (!probe?.ok) return;
    const deviceId = `asio:${probe.driver}`;
    const channels: MixerChannel[] = [...picked].sort((a, b) => a - b).map((i) => ({
      index: i + 1, name: probe.inputNames[i] || `In ${i + 1}`, nameSource: 'asio', endpointInput: i,
    }));
    mutate((d) => {
      const prev = d.mixerLink?.deviceId === deviceId ? d.mixerLink.channels : [];
      const plan = planTracksFromMixer({
        device: { id: deviceId }, endpoint: { transport: 'usb-asio', endpointId: deviceId },
        channels, previous: prev, tracks: d.arrangement, palette: TRACK_COLORS, newId: grooveUid,
      });
      for (const u of plan.update) {
        const t = d.arrangement.find((x) => x.id === u.trackId);
        if (!t) continue;
        t.input = u.input; t.armed = true;
        if (u.name) t.name = u.name;
        if (u.color) t.color = u.color;
      }
      for (const t of plan.create) d.arrangement.push({ ...t, armed: true });
      const merged = new Map(prev.map((c) => [c.index, c]));
      for (const c of channels) merged.set(c.index, c);
      d.mixerLink = {
        ...(d.mixerLink?.deviceId === deviceId ? d.mixerLink : {}),
        deviceId, model: probe.driver, family: familyOf(probe.driver), sampleRate: rate,
        channels: [...merged.values()].sort((a, b) => a.index - b.index),
      };
    });
    setPicked(new Set());
  };

  const armedCount = doc.arrangement.filter((t) => t.kind === 'audio' && t.armed && t.input?.deviceId === `asio:${driver}`).length;

  return (
    <div className="fixed right-4 bottom-4 z-[80] w-[380px] max-w-[calc(100vw-2rem)] max-h-[78vh] flex flex-col rounded-2xl border border-white/12 bg-[#110D18]/95 backdrop-blur-xl shadow-2xl text-white">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
        <Cable size={13} className="text-white/50" />
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">Hardware inputs</span>
        <span className="flex-1" />
        {recording && <span className="text-[9px] font-semibold text-[#FF4D8C] animate-pulse">● REC</span>}
        <button onClick={p.onClose} className="w-6 h-6 grid place-items-center rounded-md text-white/40 hover:text-white" aria-label="Close hardware inputs"><X size={13} /></button>
      </div>

      {!native ? (
        <p className="px-4 pb-4 text-[12px] text-white/60 leading-relaxed">
          Multitrack recording from a console or audio interface runs in the Plajah desktop app for Windows,
          which talks to the interface's ASIO driver directly. The browser can only reach one stereo input.
        </p>
      ) : (
        <>
          <div className="px-4 pb-2 flex gap-2 shrink-0">
            <select value={driver} onChange={(e) => setDriver(e.target.value)} disabled={recording}
              className="flex-1 min-w-0 h-8 rounded-lg bg-white/[0.06] border border-white/12 text-[12px] px-2" aria-label="Audio interface">
              {drivers === null && <option>Looking for interfaces…</option>}
              {drivers?.length === 0 && <option value="">No ASIO drivers installed</option>}
              {drivers?.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))} disabled={!probe?.ok || recording}
              className="w-[92px] h-8 rounded-lg bg-white/[0.06] border border-white/12 text-[12px] px-2" aria-label="Sample rate">
              {(probe?.ok ? probe.sampleRates : [rate]).map((r) => <option key={r} value={r}>{r / 1000} kHz</option>)}
            </select>
          </div>

          {probing && <p className="px-4 pb-3 text-[11.5px] text-white/45">Opening {driver}…</p>}
          {probe && !probe.ok && (
            <p className="px-4 pb-3 text-[11.5px] text-[#FFB4A8]">{probe.driver}: {probe.error || 'not available'}. Connect it by USB and power it on, then pick it again.</p>
          )}
          {meterError && <p className="px-4 pb-2 text-[11px] text-[#FFB4A8]">Meters unavailable: {meterError}</p>}

          {probe?.ok && (
            <>
              <div className="px-4 pb-1 flex items-center text-[10px] text-white/40 shrink-0">
                <span>{probe.inputs} inputs · {probe.outputs} outputs</span>
                <span className="flex-1" />
                <button className="hover:text-white" onClick={() => setPicked(new Set(Array.from({ length: probe.inputs }, (_, i) => i).filter((i) => !boundByInput.has(i))))}>All</button>
                <span className="mx-1.5">·</span>
                <button className="hover:text-white" onClick={() => setPicked(new Set())}>None</button>
              </div>
              <div className="px-2 overflow-y-auto min-h-0 flex-1">
                {probe.inputNames.map((name, i) => {
                  const bound = boundByInput.get(i);
                  const lvl = Math.min(1, peaks[i] ?? 0);
                  return (
                    <label key={i} className={`flex items-center gap-2 px-2 h-7 rounded-md ${bound ? 'opacity-60' : 'hover:bg-white/[0.04] cursor-pointer'}`}>
                      <input type="checkbox" disabled={!!bound} checked={!bound && picked.has(i)}
                        onChange={() => setPicked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
                      <span className="w-6 text-[10px] tabular-nums text-white/40 text-right">{i + 1}</span>
                      <span className="flex-1 min-w-0 truncate text-[11.5px]">{bound ? `${name} → ${bound}` : name}</span>
                      <span className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden" aria-label={`Input ${i + 1} level`}>
                        <span className="block h-full rounded-full" style={{ width: `${Math.round(Math.sqrt(lvl) * 100)}%`, background: lvl >= 0.999 ? '#FF4D4D' : lvl > 0.5 ? '#FFD166' : '#06D6A0' }} />
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="px-4 py-3 flex items-center gap-2 border-t border-white/10 shrink-0">
                <span className="flex-1 text-[10.5px] text-white/45 leading-snug">
                  {armedCount ? `${armedCount} armed — press Record to capture them` : 'New tracks arrive armed'}
                </span>
                <button onClick={addTracks} disabled={!picked.size || recording}
                  className="h-8 px-3 rounded-lg text-[12px] font-semibold disabled:opacity-40"
                  style={{ background: '#FF4D4D', color: '#fff' }}>
                  Add {picked.size || ''} track{picked.size === 1 ? '' : 's'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
