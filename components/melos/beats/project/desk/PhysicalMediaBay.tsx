// Physical media prep — pick the medium (CD, vinyl, tape, digital), see the record laid out
// on it (sides, the disc budget), fix what the checks flag, and print the package: a Red Book
// programme + CUE + PQ log for a CD, per-side files + a cutting sheet for vinyl, per-side
// files with leaders for tape.

import React, { useMemo, useState } from 'react';
import { Disc3, Package, CheckCircle2, AlertTriangle, XCircle, Wand2 } from 'lucide-react';
import {
  MEDIA_PRESETS, presetById, planSides, checkPhysical, deskOf, autoSideBreaks, type Medium,
} from '../../../../../services/melos/beats/releaseDesk';
import { albumLayout, exportPhysicalPackage } from '../../../../../services/melos/beats/masterProject';
import type { MasteringState } from '../../../../../services/melos/beats/fx/mastering';
import { downloadBlob } from '../../../../../services/melos/beats/render';
import { Panel, Field, Toggle, selectCls, inputCls, btnCls, SERIF, type BayProps } from './ui';

const MEDIUM_LABEL: Record<Medium, string> = { digital: 'Digital', cd: 'Compact Disc', vinyl: 'Vinyl', tape: 'Tape' };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export const PhysicalMediaBay: React.FC<BayProps & {
  albumPressing: MasteringState | null;
  /** Apply the preset's mastering needs (mono bass for vinyl) to the album pressing. */
  onApplyPressing?: (patch: Partial<MasteringState>) => void;
}> = ({ project, mutate, albumPressing, onApplyPressing }) => {
  const plan = project.desk?.physical;
  const preset = presetById(plan?.presetId);
  const layout = albumLayout(project);
  const checks = useMemo(() => checkPhysical(project, layout.tracks, preset), [project, layout.tracks, preset]);
  const sides = preset.sides > 1 || preset.medium === 'tape' ? planSides(layout.tracks, preset, plan?.sideBreaks) : [];
  const [busy, setBusy] = useState<string | null>(null);
  const setPlan = (fn: (pl: NonNullable<typeof plan>) => void) => mutate((p) => {
    const d = deskOf(p);
    if (!d.physical) d.physical = { presetId: preset.id };
    fn(d.physical);
  });

  const choose = (id: string) => {
    const next = presetById(id);
    mutate((p) => {
      const d = deskOf(p);
      d.physical = { ...(d.physical ?? {}), presetId: id, sideBreaks: undefined };
      if (next.discFormat) p.discFormat = next.discFormat;
    });
  };

  const printPackage = async () => {
    setBusy('Preparing…');
    try {
      const pkg = await exportPhysicalPackage(project, albumPressing, (m) => setBusy(m || 'Working…'));
      if (pkg) downloadBlob(pkg.blob, pkg.filename);
    } finally { setBusy(null); }
  };

  // Move a track across a side break (click the arrow between two tracks).
  const toggleBreakAt = (index: number) => setPlan((pl) => {
    const cur = pl.sideBreaks?.length ? [...pl.sideBreaks] : autoSideBreaks(layout.tracks.map((l) => l.endSec - l.startSec), preset.sides);
    const has = cur.includes(index);
    let next = has ? cur.filter((b) => b !== index) : [...cur, index].sort((a, b) => a - b);
    if (next.length > preset.sides - 1) next = next.slice(0, preset.sides - 1);
    pl.sideBreaks = next;
  });

  const errors = checks.filter((c) => c.level === 'error').length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
      <div className="flex flex-col gap-4 min-w-0">
        <Panel title="Medium" hint={preset.notes.join(' · ')}>
          {(['cd', 'vinyl', 'tape', 'digital'] as Medium[]).map((m) => (
            <div key={m} className="mb-2">
              <div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/30 mb-1">{MEDIUM_LABEL[m]}</div>
              <div className="flex flex-wrap gap-1.5">
                {MEDIA_PRESETS.filter((p) => p.medium === m).map((p) => {
                  const on = p.id === preset.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => choose(p.id)}
                      className="h-8 px-3 rounded-lg text-[10.5px] border transition-colors"
                      style={on ? { color: '#fff', borderColor: '#D40055', background: 'rgba(212,0,85,0.16)' } : { color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.12)' }}
                    >{p.label}</button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-mono text-white/50">
            <span>{preset.sampleRate / 1000} kHz · {preset.bitDepth}-bit</span>
            <span>ceiling {preset.ceilingDbtp} dBTP</span>
            <span>{preset.sides > 1 ? `${preset.sides} sides` : 'one programme'}</span>
          </div>
          {preset.monoBelowHz && onApplyPressing && (
            <button onClick={() => onApplyPressing({ monoBelowHz: preset.monoBelowHz })} className={`${btnCls} mt-2`} title="Set the album pressing's Mono Below for the cutting lathe">
              <Wand2 size={11} /> Fold bass to mono below {preset.monoBelowHz} Hz
            </button>
          )}
        </Panel>

        {sides.length > 0 && (
          <Panel
            title={preset.medium === 'tape' ? 'Sides · Tape' : 'Sides · Lacquer'}
            hint="Click ⇣ between two songs to move the side break there. Sides keep the running order — re-order on the timeline."
            right={plan?.sideBreaks?.length ? <button onClick={() => setPlan((pl) => { pl.sideBreaks = undefined; })} className="text-[9.5px] text-white/40 hover:text-white">Auto-balance</button> : null}
          >
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(4, sides.length)}, minmax(0,1fr))` }}>
              {sides.map((s) => (
                <div key={s.label} className="rounded-[10px] border p-2" style={{ borderColor: s.level === 'over' ? 'rgba(239,68,68,0.5)' : s.level === 'warn' ? 'rgba(245,158,11,0.45)' : 'rgba(255,255,255,0.1)' }}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[18px] text-white" style={{ fontFamily: SERIF }}>Side {s.label}</span>
                    <span className="font-mono text-[10px]" style={{ color: s.level === 'over' ? '#EF4444' : s.level === 'warn' ? '#F59E0B' : '#06D6A0' }}>{fmt(s.seconds)}</span>
                  </div>
                  {/* the budget bar */}
                  {preset.maxMinPerSide && (
                    <div className="h-1.5 rounded-full bg-black/50 mt-1 relative overflow-hidden">
                      <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, (s.seconds / 60 / preset.maxMinPerSide) * 100)}%`, background: s.level === 'over' ? '#EF4444' : s.level === 'warn' ? '#F59E0B' : '#06D6A0' }} />
                      {preset.sweetMinPerSide && <div className="absolute inset-y-0 w-px bg-white/60" style={{ left: `${(preset.sweetMinPerSide / preset.maxMinPerSide) * 100}%` }} />}
                    </div>
                  )}
                  <ol className="mt-1.5 space-y-0.5">
                    {s.trackIndices.map((i) => (
                      <li key={i} className="flex items-center gap-1.5 text-[10.5px] text-white/70">
                        <span className="font-mono text-white/35 w-5">{s.label}{i - s.trackIndices[0] + 1}</span>
                        <span className="truncate flex-1">{layout.tracks[i].track.title}</span>
                        <span className="font-mono text-[9px] text-white/35">{fmt(layout.tracks[i].endSec - layout.tracks[i].startSec)}</span>
                        {i < layout.tracks.length - 1 && (
                          <button onClick={() => toggleBreakAt(i + 1)} className="text-white/25 hover:text-[#FF8C00] text-[10px]" title="Break the side after this song">⇣</button>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <Panel title={preset.medium === 'cd' ? 'Red Book Check' : 'Format Check'} right={<span className="text-[10px] font-mono" style={{ color: errors ? '#EF4444' : '#06D6A0' }}>{errors ? `${errors} to fix` : 'ready'}</span>}>
          <ul className="space-y-1.5">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug" style={{ color: c.level === 'error' ? '#ff9a9a' : c.level === 'warn' ? '#f0c674' : 'rgba(255,255,255,0.65)' }}>
                {c.level === 'error' ? <XCircle size={12} className="mt-0.5 flex-none" /> : c.level === 'warn' ? <AlertTriangle size={12} className="mt-0.5 flex-none" /> : <CheckCircle2 size={12} className="mt-0.5 flex-none text-[#06D6A0]" />}
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {preset.medium === 'cd' && (
          <Panel title="Disc · PQ Subcode" hint="ISRCs and the UPC live in Credits & Metadata. Track starts and sub-index points are set on the timeline (the flags and Index markers).">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Pre-gap before track 1 (s)">
                <input type="number" min={2} max={10} step={0.5} className={inputCls} value={plan?.pregapSec ?? 2} onChange={(e) => setPlan((pl) => { pl.pregapSec = Math.max(2, Number(e.target.value) || 2); })} />
              </Field>
              <Field label="16-bit dither">
                <select className={selectCls} value={plan?.dither ?? 'tpdf'} onChange={(e) => setPlan((pl) => { pl.dither = e.target.value as 'tpdf' | 'none'; })}>
                  <option value="tpdf">TPDF (recommended)</option>
                  <option value="none">None (truncate)</option>
                </select>
              </Field>
            </div>
            <div className="mt-1 grid grid-cols-1">
              <Toggle on={plan?.cdText !== false} onChange={(v) => setPlan((pl) => { pl.cdText = v; })} label="Write CD-Text" hint="Album + track titles, performers and songwriters in the subcode (Latin-1)." />
              <Toggle on={!!plan?.preEmphasis} onChange={(v) => setPlan((pl) => { pl.preEmphasis = v; })} label="Pre-emphasis flag" hint="Only if the audio was actually pre-emphasised — almost never." />
              <Toggle on={!!plan?.copyProhibit} onChange={(v) => setPlan((pl) => { pl.copyProhibit = v; })} label="Copy-prohibit flag" />
            </div>
          </Panel>
        )}

        {preset.medium === 'tape' && (
          <Panel title="Duplication">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Leader per side (s)">
                <input type="number" min={0} max={30} className={inputCls} value={plan?.leaderSec ?? preset.leaderSec ?? 5} onChange={(e) => setPlan((pl) => { pl.leaderSec = Math.max(0, Number(e.target.value) || 0); })} />
              </Field>
            </div>
            <Toggle on={plan?.matchSides !== false} onChange={(v) => setPlan((pl) => { pl.matchSides = v; })} label="Pad sides to equal length" hint="Both sides run the same time, so a flip lands at the start of side B." />
          </Panel>
        )}

        <Panel title="Print">
          <p className="text-[11.5px] leading-relaxed text-white/55" style={{ fontFamily: SERIF }}>
            {preset.medium === 'cd' && 'One 44.1 kHz / 16-bit programme with the pre-gap, frame-aligned track starts, a CUE sheet (CATALOG, ISRC, CD-Text, index points) and a PQ log. Burn it, or send it to a plant that takes WAV + CUE. A DDP image is not generated here — ask the plant if they need one.'}
            {preset.medium === 'vinyl' && 'One file per side at the cutting rate, with a cutting sheet listing every song’s start and length on its side.'}
            {preset.medium === 'tape' && 'One file per side with its leader, padded to equal length, plus a J-card listing for the duplicator.'}
            {preset.medium === 'digital' && 'Numbered per-song masters at the preset’s rate and the continuous programme.'}
          </p>
          <button onClick={() => { void printPackage(); }} disabled={!!busy || !project.tracks.length} className={`${btnCls} mt-2`}>
            {preset.medium === 'cd' ? <Disc3 size={12} /> : <Package size={12} />}
            {busy ?? `Print ${preset.label} package`}
          </button>
        </Panel>
      </div>
    </div>
  );
};
