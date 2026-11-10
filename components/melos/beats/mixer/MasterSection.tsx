// The Mixer's master column — pinned right of the console, never scrolled away. Top to bottom:
// a compact loudness readout (expands to the full Meter Bridge), the master channel with a
// preset dropdown of mastering starting points, the four moves that set a mix's level and tone
// (Tone, Drive, Width, Glue) plus the limiter, and Auto-level, which reads the live integrated
// loudness and trims the master fader to the preset's target.
//
// The truth is the doc: master.gainDb / limiterOn / targetLufs, and master.mastering (the same
// MasteringState the Project view's pressing writes), pushed live through engine.updateMastering.

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Gauge, Maximize2, Users } from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine, type LoudnessSnapshot } from '../../../../services/melos/beats/engine/BeatsEngine';
import { defaultMastering, type MasteringState } from '../../../../services/melos/beats/fx/mastering';
import { ChannelStrip } from '../shared/ChannelStrip';
import { Knob } from '../shared/Knob';
import { PLAYHEAD } from '../theme';
import { useStudioPrefs, setStudioPref } from '../shared/studioPrefs';

interface MasterPreset {
  id: string;
  name: string;
  blurb: string;
  targetLufs: number;
  limiter: boolean;
  /** Partial mastering — everything else resets to flat. Empty = mastering off. */
  m: Partial<MasteringState>;
}

/** Starting points, each with the loudness it's meant to land at. Tuned conservatively: they
 *  shape and level a mix, they don't replace a mastering pass. */
export const MASTER_PRESETS: MasterPreset[] = [
  { id: 'clean', name: 'Clean', blurb: 'Flat — limiter only, no colour', targetLufs: -14, limiter: true, m: {} },
  { id: 'streaming', name: 'Streaming', blurb: 'Spotify / YouTube / Apple — -14 LUFS, open and safe', targetLufs: -14, limiter: true, m: { hpHz: 25, drive: 0.12, width: 1.05, monoBelowHz: 110, glue: true } },
  { id: 'apple', name: 'Apple Music', blurb: 'Sound Check -16 — keeps more punch', targetLufs: -16, limiter: true, m: { hpHz: 22, drive: 0.08, width: 1.04, monoBelowHz: 100, glue: true } },
  { id: 'warm', name: 'Warm analog', blurb: 'Tape-ish low bump, softened top, gentle glue', targetLufs: -14, limiter: true, m: { hpHz: 28, tiltDb: -1, headBumpHz: 80, headBumpDb: 1.5, drive: 0.25, driveAsym: 0.2, width: 1, monoBelowHz: 120, glue: true } },
  { id: 'bright', name: 'Bright pop', blurb: 'Lifted air, wider image, tight low end', targetLufs: -12, limiter: true, m: { hpHz: 30, tiltDb: 1.2, drive: 0.15, width: 1.15, monoBelowHz: 140, glue: true } },
  { id: 'club', name: 'Club / loud', blurb: 'Dense and loud for DJ sets — -8 LUFS', targetLufs: -8, limiter: true, m: { hpHz: 30, drive: 0.35, width: 1.08, monoBelowHz: 160, glue: true } },
  { id: 'hiphop', name: 'Hip-hop', blurb: 'Heavy low end held mono, smooth top', targetLufs: -10, limiter: true, m: { hpHz: 25, tiltDb: -0.5, headBumpHz: 60, headBumpDb: 2, drive: 0.25, width: 1.05, monoBelowHz: 150, glue: true } },
  { id: 'acoustic', name: 'Acoustic / worship', blurb: 'Natural dynamics, a touch of warmth', targetLufs: -16, limiter: true, m: { hpHz: 30, tiltDb: -0.3, drive: 0.06, width: 1.02, monoBelowHz: 90, glue: false } },
  { id: 'broadcast', name: 'Broadcast', blurb: 'EBU R128 / ATSC — -23 LUFS, no squeeze', targetLufs: -23, limiter: true, m: { hpHz: 30, drive: 0, width: 1, monoBelowHz: 100, glue: false } },
  { id: 'voice', name: 'Podcast / voice', blurb: 'Rumble cut, mono-safe, -16 LUFS', targetLufs: -16, limiter: true, m: { hpHz: 80, tiltDb: 0.4, drive: 0.05, width: 0.9, monoBelowHz: 250, glue: true } },
];

const fmt = (v: number | undefined, d = 1) => (v === undefined || !Number.isFinite(v) || v < -99 ? '—' : v.toFixed(d));

interface Props {
  doc: GrooveDoc;
  meter: number;
  limiterReduction: number;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  /** Full Meter Bridge / Council render in the room (they need the width). */
  onToggleBridge: () => void;
}

export const MasterSection: React.FC<Props> = ({ doc, meter, limiterReduction, onMutate, onToggleBridge }) => {
  const prefs = useStudioPrefs();
  const [loud, setLoud] = useState<LoudnessSnapshot | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setLoud(BeatsEngine.get().loudness()), 250);
    return () => clearInterval(t);
  }, []);

  const master = doc.mixer.master;
  const ms: MasteringState = { ...defaultMastering(), ...((master.mastering as unknown as Partial<MasteringState>) ?? {}) };
  const target = master.targetLufs ?? -14;

  /** Write a mastering change to the doc AND the live chain. */
  const setMastering = (patch: Partial<MasteringState>) => {
    const next: MasteringState = { ...ms, ...patch, on: true, eraId: null, engineerId: null };
    BeatsEngine.get().updateMastering(next);
    onMutate((d) => { d.mixer.master.mastering = next as unknown as Record<string, unknown>; });
  };

  const applyPreset = (id: string) => {
    const pr = MASTER_PRESETS.find((x) => x.id === id);
    if (!pr) return;
    const on = Object.keys(pr.m).length > 0;
    const next: MasteringState = { ...defaultMastering(), ...pr.m, on, eraId: null, engineerId: null };
    BeatsEngine.get().updateMastering(next);
    onMutate((d) => {
      d.mixer.master.mastering = next as unknown as Record<string, unknown>;
      d.mixer.master.limiterOn = pr.limiter;
      d.mixer.master.targetLufs = pr.targetLufs;
      d.mixer.master.preset = pr.id;
    });
    setNote(`${pr.name} — play the loudest section, then Auto-level`);
  };

  /** Trim the master fader so integrated loudness lands on the target. Needs a few seconds of audio. */
  const autoLevel = () => {
    const l = BeatsEngine.get().loudness();
    const measured = l && Number.isFinite(l.i) && l.i > -70 ? l.i : l && Number.isFinite(l.s) && l.s > -70 ? l.s : null;
    if (measured === null) { setNote('Play the song (its loudest part) for a few seconds first'); return; }
    const delta = Math.max(-12, Math.min(12, target - measured));
    onMutate((d) => { d.mixer.master.gainDb = Math.max(-24, Math.min(12, Math.round((d.mixer.master.gainDb + delta) * 10) / 10)); });
    BeatsEngine.get().resetLoudness();
    setNote(`${measured.toFixed(1)} → ${target} LUFS · fader ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} dB`);
  };

  const tpHot = (loud?.tp ?? -99) > -1;
  const offTarget = loud && Number.isFinite(loud.i) && loud.i > -70 ? loud.i - target : null;

  return (
    <div className="w-[176px] flex-none flex flex-col gap-2 rounded-[12px] border p-2.5"
      style={{ borderColor: 'rgba(212,0,85,0.45)', background: 'linear-gradient(180deg, rgba(107,0,153,0.14), rgba(212,0,85,0.06))' }}>

      {/* ── meters: compact, hideable, expands to the full bridge ── */}
      <div className="flex items-center gap-1">
        <button onClick={() => setStudioPref('mixerMeters', !prefs.mixerMeters)} className="flex items-center gap-1 text-[9px] uppercase tracking-[0.16em] font-semibold text-white/45 hover:text-white">
          {prefs.mixerMeters ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Meters
        </button>
        <span className="flex-1" />
        <button onClick={onToggleBridge} title={prefs.mixerBridgeOpen ? 'Close the full Meter Bridge' : 'Open the full Meter Bridge — spectrum, history, stereo field, Mix Doctor'}
          className="w-6 h-6 grid place-items-center rounded-md hover:bg-white/10" style={{ color: prefs.mixerBridgeOpen ? PLAYHEAD : 'rgba(255,255,255,0.4)' }}><Maximize2 size={11} /></button>
        <button onClick={() => setStudioPref('mixerCouncil', !prefs.mixerCouncil)} title="Ask the Music Council about this mix"
          className="w-6 h-6 grid place-items-center rounded-md hover:bg-white/10" style={{ color: prefs.mixerCouncil ? '#D0BCFF' : 'rgba(255,255,255,0.4)' }}><Users size={11} /></button>
      </div>
      {prefs.mixerMeters && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10px] rounded-lg bg-black/30 border border-white/[0.06] px-2 py-1.5">
          <span className="text-white/35">INT</span><span className="text-right" style={{ color: offTarget !== null && Math.abs(offTarget) > 1 ? '#FF8C00' : PLAYHEAD }}>{fmt(loud?.i)} <span className="text-white/30">LU</span></span>
          <span className="text-white/35">SHORT</span><span className="text-right text-white/80">{fmt(loud?.s)}</span>
          <span className="text-white/35">PEAK</span><span className="text-right" style={{ color: tpHot ? '#EF4444' : 'rgba(255,255,255,0.8)' }}>{fmt(loud?.tp)} <span className="text-white/30">TP</span></span>
          <span className="text-white/35">CORR</span><span className="text-right" style={{ color: (loud?.corr ?? 1) < 0 ? '#EF4444' : '#06D6A0' }}>{loud ? (loud.corr >= 0 ? '+' : '') + loud.corr.toFixed(2) : '—'}</span>
          <span className="text-white/35">TARGET</span><span className="text-right text-white/60">{target}</span>
        </div>
      )}

      <div className="h-px bg-white/10" />

      {/* ── master channel ── */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-white tracking-wide">MASTER</span>
        <span className="font-mono text-[9px] text-white/40" title="Limiter gain reduction">GR {limiterReduction.toFixed(1)}</span>
      </div>
      <select
        value={master.preset ?? ''}
        onChange={(e) => applyPreset(e.target.value)}
        aria-label="Master preset"
        className="h-7 rounded-lg bg-black/40 border border-white/15 text-[10.5px] text-white px-1.5 outline-none"
        title={MASTER_PRESETS.find((x) => x.id === master.preset)?.blurb ?? 'Pick a mastering starting point'}
      >
        <option value="" disabled>Master preset…</option>
        {MASTER_PRESETS.map((pr) => <option key={pr.id} value={pr.id}>{pr.name} · {pr.targetLufs}</option>)}
      </select>

      <div className="flex gap-2 items-start">
        <ChannelStrip label="" wide gainDb={master.gainDb} meter={meter} onGain={(db) => onMutate((d) => { d.mixer.master.gainDb = db; })} />
        <div className="flex flex-col gap-2 items-center pt-1">
          <Knob label="Tone" value={ms.tiltDb} min={-3} max={3} defaultValue={0} color="#FFD166" size={28}
            format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`} onChange={(v) => setMastering({ tiltDb: v })} />
          <Knob label="Drive" value={ms.drive} min={0} max={1} defaultValue={0} color="#FF8C00" size={28}
            format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setMastering({ drive: v })} />
          <Knob label="Width" value={ms.width} min={0.5} max={1.5} defaultValue={1} color="#06D6A0" size={28}
            format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setMastering({ width: v })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <button onClick={() => setMastering({ glue: !ms.glue })}
          className="h-6 rounded-md text-[9.5px] font-semibold border"
          style={ms.glue && ms.on ? { color: '#D0BCFF', borderColor: 'rgba(208,188,255,0.45)' } : { color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.15)' }}
          title="Bus glue compression"
        >GLUE</button>
        <button onClick={() => onMutate((d) => { d.mixer.master.limiterOn = !d.mixer.master.limiterOn; })}
          className="h-6 rounded-md text-[9.5px] font-semibold border"
          style={master.limiterOn ? { color: '#06D6A0', borderColor: 'rgba(6,214,160,0.45)' } : { color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.15)' }}
        >LIMITER</button>
      </div>

      <button onClick={autoLevel}
        className="h-7 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1.5 border"
        style={{ color: PLAYHEAD, borderColor: 'rgba(0,218,243,0.45)', background: 'rgba(0,218,243,0.08)' }}
        title="Measure the playing mix and trim the master fader to the target loudness"
      ><Gauge size={12} /> Auto-level → {target}</button>
      {note && <span className="text-[9px] text-white/45 leading-snug">{note}</span>}
      <span className="text-[8.5px] text-white/25 leading-snug">Full pressing + Suite in Project</span>
    </div>
  );
};
