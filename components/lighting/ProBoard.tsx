// Pro mode: a console. Fixture grid and groups on the left, a command line and masters always in
// reach, and a working area for programmer, patch, cues, playbacks, effects, outputs and a DMX view.

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, Lock, Plus, Trash2, Unlock, Upload, Wand2, Wifi } from 'lucide-react';
import { boardEngine, useBoard } from '../../services/lighting/boardEngine';
import { displayAddress, findPatchProblems, previewColor, profileOf, type EffectKind, type PatchedFixture } from '../../services/lighting/boardCore';
import { canMove, hasAttr, hasColor, parseChannelList, profilesFromOfl, type Attr, type FixtureProfile } from '../../services/lighting/fixtureProfiles';
import { OutputSetup } from './OutputSetup';
import { DipRow } from './SimpleBoard';
import { LookTile, LooksGallery, PreviewMotionToggle } from './LooksGallery';
import { effectPreview, type LookPreset } from '../../services/lighting/looks';
import { FixtureGallery } from './FixtureGallery';
import { SmartTab } from './SmartTab';

// three.js and the venues only load when someone opens the stage.
const Stage3D = lazy(() => import('./Stage3D'));

const TABS = ['Looks', 'Programmer', 'Patch', 'Fixtures', 'Smart lights', 'Cues', 'Playbacks', 'Effects', '3D stage', 'Output', 'DMX'] as const;
type Tab = typeof TABS[number];

const cellCls = 'bg-white/[0.06] border border-white/10 rounded px-1.5 py-1 text-xs text-white outline-none focus:border-[#FF8C00]/70 min-w-0';
const btnCls = 'px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/[0.16] text-xs font-medium disabled:opacity-30 disabled:hover:bg-white/10';

const Fader: React.FC<{ label: string; value: number; onChange: (v: number) => void; color?: string; height?: number }> = ({ label, value, onChange, color = '#FF8C00', height = 150 }) => (
  <label className="flex flex-col items-center gap-1 w-12 shrink-0">
    <span className="text-[10px] tabular-nums text-white/60">{Math.round(value * 100)}</span>
    <input type="range" min={0} max={1000} value={Math.round(value * 1000)} aria-label={label}
      onChange={(e) => onChange(Number(e.target.value) / 1000)}
      className="cursor-pointer" style={{ writingMode: 'vertical-lr', direction: 'rtl', height, width: 22, accentColor: color }} />
    <span className="text-[10px] text-white/70 text-center leading-tight w-full truncate" title={label}>{label}</span>
  </label>
);

// ── Fixture grid ────────────────────────────────────────────────────────────

function FixtureGrid({ onConnectSmart }: { onConnectSmart?: () => void }) {
  const board = useBoard();
  const anchor = useRef<number | null>(null);
  const fixtures = board.show.fixtures;

  const click = (e: React.MouseEvent, f: PatchedFixture, index: number) => {
    if (e.shiftKey && anchor.current != null) {
      const [a, b] = [anchor.current, index].sort((x, y) => x - y);
      boardEngine.setSelection(fixtures.slice(a, b + 1).map((x) => x.id));
    } else {
      boardEngine.toggleSelected(f.id);
      anchor.current = index;
    }
  };

  return (
    <aside className="lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col min-h-0 max-h-[34vh] lg:max-h-none">
      <div className="flex items-center gap-1.5 px-2.5 h-9 border-b border-white/10 shrink-0">
        <span className="text-xs font-semibold mr-auto">Fixtures <span className="text-white/50 font-normal">{board.selection.length ? `${board.selection.length} selected` : fixtures.length}</span></span>
        <button className={btnCls} onClick={() => boardEngine.setSelection(fixtures.map((f) => f.id))}>All</button>
        <button className={btnCls} onClick={() => boardEngine.setSelection([])}>None</button>
        {onConnectSmart && <button aria-label="Connect smart lights" title="Connect smart lights" className={btnCls} onClick={onConnectSmart}><Wifi size={12} /></button>}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {fixtures.length === 0 && <p className="text-xs text-white/50 p-2">Nothing patched yet. Add fixtures in the Patch tab.</p>}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-1">
          {fixtures.map((f, i) => {
            const profile = profileOf(f, board.show.customProfiles);
            const { css, on } = previewColor(board.liveLook[f.id], profile);
            const selected = board.selection.includes(f.id);
            const programmed = !!board.programmer[f.id];
            return (
              <button key={f.id} onClick={(e) => click(e, f, i)} aria-pressed={selected} title={`${f.fid}: ${f.name}`}
                className={`relative h-14 rounded border text-left p-1 overflow-hidden ${selected ? 'border-[#FF8C00] bg-[#FF8C00]/15' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'}`}>
                <span className="block text-[10px] font-semibold tabular-nums">{f.fid}{programmed && <span className="text-[#FF8C00]"> ●</span>}</span>
                <span className="block text-[9px] leading-tight text-white/60 truncate">{f.name}</span>
                <span className="absolute left-1 right-1 bottom-1 h-1.5 rounded-sm" style={{ background: css, opacity: on }} />
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <div className="flex items-center mb-1"><span className="text-xs font-semibold mr-auto">Groups</span>
            <button className={btnCls} disabled={!board.selection.length} onClick={() => boardEngine.addGroup('')}>Save selection</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {board.show.groups.map((g) => (
              <span key={g.id} className="inline-flex rounded overflow-hidden bg-white/10 text-xs">
                <button className="px-2 py-1 hover:bg-white/10" onClick={() => boardEngine.setSelection(g.fixtureIds)}>{g.name}</button>
                <button aria-label={`Delete ${g.name}`} className="px-1 hover:bg-white/10" onClick={() => boardEngine.deleteGroup(g.id)}><Trash2 size={10} /></button>
              </span>
            ))}
            {!board.show.groups.length && <span className="text-[11px] text-white/40">Select fixtures, then save them as a group.</span>}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Programmer ──────────────────────────────────────────────────────────────

const SWATCHES = ['#ffffff', '#fff1dc', '#ffb46b', '#ff8a3c', '#ff2a2a', '#ff2a8a', '#c026ff', '#6b4dff', '#2a4dff', '#22a8ff', '#22e0d0', '#26e05c', '#b5f023', '#ffe11a'];

const ATTR_FADERS: { attr: Attr; label: string }[] = [
  { attr: 'white', label: 'White' }, { attr: 'amber', label: 'Amber' }, { attr: 'uv', label: 'UV' }, { attr: 'shutter', label: 'Shutter' },
  { attr: 'colorWheel', label: 'Col whl' }, { attr: 'gobo', label: 'Gobo' }, { attr: 'goboRotate', label: 'Gobo rot' }, { attr: 'prism', label: 'Prism' },
  { attr: 'focus', label: 'Focus' }, { attr: 'zoom', label: 'Zoom' }, { attr: 'frost', label: 'Frost' }, { attr: 'speed', label: 'P/T spd' },
  { attr: 'fog', label: 'Fog' }, { attr: 'fan', label: 'Fan' }, { attr: 'macro', label: 'Macro' },
];

function PanTiltPad({ pan, tilt, onMove }: { pan: number; tilt: number; onMove: (pan: number, tilt: number) => void }) {
  const pad = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    if (!e.buttons) return;
    const r = pad.current!.getBoundingClientRect();
    onMove(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)));
  };
  return (
    <div ref={pad} role="slider" aria-label="Pan and tilt" aria-valuenow={Math.round(pan * 100)} tabIndex={0}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e); }} onPointerMove={move}
      className="relative w-44 h-44 rounded-md bg-black border border-white/15 touch-none cursor-crosshair overflow-hidden"
      style={{ backgroundImage: 'linear-gradient(#fff1 1px,transparent 1px),linear-gradient(90deg,#fff1 1px,transparent 1px)', backgroundSize: '25% 25%' }}>
      <div className="absolute w-3 h-3 rounded-full bg-[#FF8C00] -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `${pan * 100}%`, top: `${(1 - tilt) * 100}%` }} />
    </div>
  );
}

function Programmer() {
  const board = useBoard();
  const [sceneName, setSceneName] = useState('');
  const selected = useMemo(() => board.show.fixtures.filter((f) => board.selection.includes(f.id)), [board.show.fixtures, board.selection]);
  const profiles: FixtureProfile[] = selected.map((f) => profileOf(f, board.show.customProfiles));
  const any = (test: (p: FixtureProfile) => boolean) => profiles.some(test);
  const first = selected[0];
  const value = (a: Attr, fallback = 0) => (first ? board.programmer[first.id]?.[a] ?? board.liveLook[first.id]?.[a] ?? fallback : fallback);
  const level = first ? (hasAttr(profiles[0], 'dimmer') ? value('dimmer') : Math.max(value('red'), value('green'), value('blue'), value('white'))) : 0;

  if (!selected.length) {
    return <p className="text-sm text-white/50 p-4">Select fixtures on the left, or type <code className="font-mono text-white/80">1 thru 4 at 50</code> in the command line.</p>;
  }

  return (
    <div className="p-3 space-y-4">
      <div className="flex flex-wrap gap-5">
        <Fader label="Level" value={level} onChange={(v) => boardEngine.setLevel(v)} />
        {any(hasColor) && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold">Colour</h3>
            <div className="grid grid-cols-7 gap-1">
              {SWATCHES.map((c) => <button key={c} aria-label={`Colour ${c}`} onClick={() => boardEngine.setColor(c)} className="w-7 h-7 rounded border border-white/15 hover:scale-110 transition-transform" style={{ background: c }} />)}
            </div>
            <div className="flex gap-2 items-center">
              <input type="color" aria-label="Pick a colour" onChange={(e) => boardEngine.setColor(e.target.value)} className="w-9 h-7 bg-transparent cursor-pointer" />
            </div>
            <div className="flex gap-1">
              <Fader height={80} label="R" color="#ff3b3b" value={value('red')} onChange={(v) => boardEngine.setAttr('red', v)} />
              <Fader height={80} label="G" color="#34d058" value={value('green')} onChange={(v) => boardEngine.setAttr('green', v)} />
              <Fader height={80} label="B" color="#3b82ff" value={value('blue')} onChange={(v) => boardEngine.setAttr('blue', v)} />
            </div>
          </div>
        )}
        {any(canMove) && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold">Position</h3>
            <PanTiltPad pan={value('pan', 0.5)} tilt={value('tilt', 0.5)} onMove={(p, t) => { boardEngine.setAttr('pan', p); boardEngine.setAttr('tilt', t); }} />
            <button className={btnCls} onClick={() => { boardEngine.setAttr('pan', 0.5); boardEngine.setAttr('tilt', 0.5); }}>Home</button>
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {ATTR_FADERS.filter(({ attr }) => any((p) => hasAttr(p, attr))).map(({ attr, label }) => (
            <Fader key={attr} label={label} value={value(attr, profiles.flatMap((p) => p.channels).find((c) => c.attr === attr)?.rest ?? 0)} onChange={(v) => boardEngine.setAttr(attr, v)} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/10">
        <button className={btnCls} onClick={() => boardEngine.recordCue()}>Record cue</button>
        <input value={sceneName} onChange={(e) => setSceneName(e.target.value)} placeholder="Scene name" className={`${cellCls} w-32`} />
        <button className={btnCls} onClick={() => { boardEngine.recordScene(sceneName, '#FF8C00'); setSceneName(''); }}>Record scene</button>
        <button className={`${btnCls} ml-auto`} onClick={() => boardEngine.clearProgrammer()}>Clear programmer</button>
      </div>
    </div>
  );
}

// ── Patch ───────────────────────────────────────────────────────────────────

function Patch() {
  const board = useBoard();
  const profiles = boardEngine.allProfiles();
  const [profileId, setProfileId] = useState(profiles[1]?.id ?? '');
  const [count, setCount] = useState(1);
  const [name, setName] = useState('');
  const [universe, setUniverse] = useState(1);
  const [customName, setCustomName] = useState('');
  const [customList, setCustomList] = useState('');
  const [note, setNote] = useState('');
  const oflInput = useRef<HTMLInputElement>(null);

  const problems = findPatchProblems(board.show);
  const badIds = new Set(problems.flatMap((p) => p.fixtureIds));
  const dmx = board.show.fixtures.filter((f) => !f.smartId);
  const smart = board.show.fixtures.filter((f) => f.smartId);

  const add = () => {
    const profile = profiles.find((p) => p.id === profileId);
    if (profile) boardEngine.addFixtures(profile, count, name, universe);
  };

  const importOfl = async (file?: File) => {
    if (!file) return;
    try {
      const found = profilesFromOfl(JSON.parse(await file.text()));
      if (!found.length) { setNote(`${file.name} is not an Open Fixture Library file.`); return; }
      boardEngine.addProfiles(found);
      setProfileId(found[0].id);
      setNote(`Added ${found.length} mode${found.length > 1 ? 's' : ''} from ${file.name}.`);
    } catch {
      setNote(`${file.name} could not be read.`);
    }
  };

  const addCustom = () => {
    const profile = parseChannelList(customName, customList);
    if (!profile) { setNote('List the channels, separated by commas.'); return; }
    boardEngine.addProfiles([profile]);
    setProfileId(profile.id);
    setCustomList('');
    setNote(`Added ${profile.name}.`);
  };

  return (
    <div className="p-3 space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-white/60 flex flex-col gap-1 min-w-0 flex-1 sm:flex-none sm:w-64">Fixture type
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={`${cellCls} [&>option]:bg-zinc-900`}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-white/60 flex flex-col gap-1">Qty
          <input type="number" min={1} max={512} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} className={`${cellCls} w-16`} />
        </label>
        <label className="text-[11px] text-white/60 flex flex-col gap-1">Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Front wash" className={`${cellCls} w-28`} />
        </label>
        <label className="text-[11px] text-white/60 flex flex-col gap-1">Universe
          <input type="number" min={1} value={universe} onChange={(e) => setUniverse(Math.max(1, Number(e.target.value) || 1))} className={`${cellCls} w-16`} />
        </label>
        <button onClick={add} className="px-3 py-1.5 rounded bg-[#FF8C00] text-black text-xs font-semibold flex items-center gap-1"><Plus size={13} /> Add</button>
        <button onClick={() => boardEngine.autoPatch()} className={`${btnCls} flex items-center gap-1 ml-auto`}><Wand2 size={13} /> Auto-address all</button>
      </div>

      {problems.length > 0 && (
        <ul role="alert" className="p-2.5 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-200 space-y-1">
          {problems.map((p, i) => <li key={i} className="flex gap-1.5"><AlertTriangle size={13} className="shrink-0" /> {p.message}</li>)}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[40rem]">
          <thead className="text-left text-white/50">
            <tr className="border-b border-white/10"><th className="py-1.5 pr-2 font-medium">#</th><th className="pr-2 font-medium">Name</th><th className="pr-2 font-medium">Type</th><th className="pr-2 font-medium">Univ</th><th className="pr-2 font-medium">Addr</th><th className="pr-2 font-medium">Set unit to</th><th className="pr-2 font-medium">DIP</th><th /></tr>
          </thead>
          <tbody>
            {dmx.map((f) => {
              const p = profileOf(f, board.show.customProfiles);
              return (
                <tr key={f.id} className={`border-b border-white/[0.06] ${badIds.has(f.id) ? 'bg-red-500/10' : ''}`}>
                  <td className="py-1 pr-2 tabular-nums">{f.fid}</td>
                  <td className="pr-2"><input value={f.name} aria-label={`Name of fixture ${f.fid}`} onChange={(e) => boardEngine.updateFixture(f.id, { name: e.target.value })} className={`${cellCls} w-32`} /></td>
                  <td className="pr-2 text-white/60 whitespace-nowrap">{p.name}</td>
                  <td className="pr-2"><input type="number" min={1} value={f.universe ?? 1} aria-label={`Universe of fixture ${f.fid}`} onChange={(e) => boardEngine.updateFixture(f.id, { universe: Math.max(1, Number(e.target.value) || 1) })} className={`${cellCls} w-14`} /></td>
                  <td className="pr-2"><input type="number" min={1} max={512} value={f.address ?? 1} aria-label={`Address of fixture ${f.fid}`} onChange={(e) => boardEngine.updateFixture(f.id, { address: Math.min(512, Math.max(1, Number(e.target.value) || 1)) })} className={`${cellCls} w-16`} /></td>
                  <td className="pr-2 font-mono text-[#FF8C00]">{displayAddress(f.address ?? 1)}</td>
                  <td className="pr-2"><DipRow address={f.address ?? 1} /></td>
                  <td className="whitespace-nowrap">
                    <button className={btnCls} onClick={() => boardEngine.identify(f.id)}>Find</button>
                    <button aria-label={f.locked ? 'Unlock address' : 'Lock address'} title={f.locked ? 'Auto-address skips this one' : 'Keep this address'} className="p-1.5 ml-1 rounded hover:bg-white/10" onClick={() => boardEngine.updateFixture(f.id, { locked: !f.locked })}>{f.locked ? <Lock size={12} className="text-[#FF8C00]" /> : <Unlock size={12} className="text-white/50" />}</button>
                    <button aria-label={`Remove ${f.name}`} className="p-1.5 rounded hover:bg-white/10" onClick={() => boardEngine.removeFixture(f.id)}><Trash2 size={12} /></button>
                  </td>
                </tr>
              );
            })}
            {smart.map((f) => (
              <tr key={f.id} className="border-b border-white/[0.06] text-white/70">
                <td className="py-1.5 pr-2 tabular-nums">{f.fid}</td><td className="pr-2">{f.name}</td><td className="pr-2" colSpan={6}>Smart light, no DMX address</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!board.show.fixtures.length && <p className="text-xs text-white/50 py-3">No fixtures yet.</p>}
      </div>

      <details className="rounded border border-white/10 p-2.5">
        <summary className="text-xs font-semibold cursor-pointer">Fixture not listed?</summary>
        <div className="mt-2.5 grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs text-white/60">Import a fixture from Open Fixture Library (open-fixture-library.org, export as OFL JSON).</p>
            <input ref={oflInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { void importOfl(e.target.files?.[0]); e.target.value = ''; }} />
            <button className={btnCls} onClick={() => oflInput.current?.click()}>Choose OFL file</button>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-white/60">Or type its channel list from the manual, in order.</p>
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Fixture name" className={`${cellCls} w-full`} />
            <textarea value={customList} onChange={(e) => setCustomList(e.target.value)} placeholder="dim, r, g, b, strobe, pan, tilt" rows={2} className={`${cellCls} w-full`} />
            <button className={btnCls} onClick={addCustom}>Add type</button>
          </div>
        </div>
        {note && <p className="text-xs text-white/70 mt-2">{note}</p>}
      </details>
    </div>
  );
}

// ── Cues ────────────────────────────────────────────────────────────────────

function Cues() {
  const board = useBoard();
  return (
    <div className="p-3 space-y-3">
      <div className="flex gap-2">
        <button className={btnCls} onClick={() => boardEngine.recordCue()}>Record new cue</button>
        <span className="text-xs text-white/50 self-center">Captures what's on stage plus the programmer. Space runs GO.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[32rem]">
          <thead className="text-left text-white/50"><tr className="border-b border-white/10"><th className="py-1.5 w-8" /><th className="pr-2 font-medium">Cue</th><th className="pr-2 font-medium">Label</th><th className="pr-2 font-medium">Fade (s)</th><th className="pr-2 font-medium">Follow (s)</th><th /></tr></thead>
          <tbody>
            {board.show.cues.map((c) => {
              const active = c.id === board.activeCueId;
              return (
                <tr key={c.id} className={`border-b border-white/[0.06] ${active ? 'bg-[#FF8C00]/15' : ''}`}>
                  <td className="text-[#FF8C00] pl-1">{active ? '▶' : ''}</td>
                  <td className="pr-2 py-1"><input type="number" step="0.1" aria-label={`Number of ${c.label}`} value={c.number} onChange={(e) => boardEngine.updateCue(c.id, { number: Number(e.target.value) || c.number })} className={`${cellCls} w-16`} /></td>
                  <td className="pr-2"><input value={c.label} aria-label="Cue label" onChange={(e) => boardEngine.updateCue(c.id, { label: e.target.value })} className={`${cellCls} w-full`} /></td>
                  <td className="pr-2"><input type="number" min={0} step="0.5" aria-label={`Fade of ${c.label}`} value={c.fade} onChange={(e) => boardEngine.updateCue(c.id, { fade: Math.max(0, Number(e.target.value) || 0) })} className={`${cellCls} w-16`} /></td>
                  <td className="pr-2"><input type="number" min={0} step="0.5" aria-label={`Follow of ${c.label}`} placeholder="wait" value={c.follow ?? ''} onChange={(e) => boardEngine.updateCue(c.id, { follow: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} className={`${cellCls} w-16`} /></td>
                  <td className="whitespace-nowrap">
                    <button className={btnCls} onClick={() => boardEngine.gotoCue(c.id)}>Go to</button>
                    <button aria-label={`Delete ${c.label}`} className="p-1.5 ml-1 rounded hover:bg-white/10" onClick={() => boardEngine.deleteCue(c.id)}><Trash2 size={12} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!board.show.cues.length && <p className="text-xs text-white/50 py-3">No cues yet. Build a look in the programmer, then record it.</p>}
      </div>
    </div>
  );
}

// ── Playbacks ───────────────────────────────────────────────────────────────

function Playbacks() {
  const board = useBoard();
  return (
    <div className="p-3">
      {!board.show.scenes.length && <p className="text-xs text-white/50">Record a scene from the programmer and it becomes a fader here.</p>}
      <div className="flex flex-wrap gap-3">
        {board.show.scenes.map((s) => (
          <div key={s.id} className="flex flex-col items-center gap-1.5 p-2 rounded bg-white/[0.04] w-24">
            <input value={s.name} aria-label="Scene name" onChange={(e) => boardEngine.renameScene(s.id, e.target.value)} className={`${cellCls} w-full text-center`} />
            <Fader height={130} label="Level" value={board.submasters[s.id] ?? 0} onChange={(v) => boardEngine.setSubmaster(s.id, v)} />
            <button onPointerDown={() => boardEngine.setFlash(s.id, true)} onPointerUp={() => boardEngine.setFlash(s.id, false)} onPointerLeave={() => boardEngine.setFlash(s.id, false)} className={`${btnCls} w-full select-none touch-none`}>Flash</button>
            <button className={`${btnCls} w-full`} onClick={() => boardEngine.playScene(s)}>Go</button>
            <button aria-label={`Delete ${s.name}`} className="p-1 rounded hover:bg-white/10" onClick={() => boardEngine.deleteScene(s.id)}><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Effects ─────────────────────────────────────────────────────────────────

const EFFECTS: { kind: EffectKind; label: string; note: string; preview: LookPreset }[] = [
  { kind: 'pulse', label: 'Pulse', note: 'Level rolls in a wave', preview: effectPreview('pulse', ['#7a2bff']) },
  { kind: 'chase', label: 'Chase', note: 'One at a time down the line', preview: effectPreview('chase', ['#ffffff'], 'down', 120) },
  { kind: 'rainbow', label: 'Rainbow', note: 'Colour wheel across the rig', preview: effectPreview('rainbow', ['#ff0000'], 'down', 30) },
  { kind: 'colorwave', label: 'Colour wave', note: 'A palette rolling across the rig', preview: effectPreview('colorwave', ['#0a58ff', '#18d0e0', '#a020ff'], 'down', 20) },
  { kind: 'circle', label: 'Circle', note: 'Heads draw circles', preview: effectPreview('circle', ['#00d0ff'], 'fan', 30) },
  { kind: 'sweep', label: 'Sweep', note: 'Heads swing side to side', preview: effectPreview('sweep', ['#ff2a8a'], 'fan', 30) },
  { kind: 'strobe', label: 'Flicker', note: 'Hard on and off, keep it slow', preview: effectPreview('strobe', ['#ffffff'], 'down', 120) },
  { kind: 'twinkle', label: 'Twinkle', note: 'Random sparkle', preview: effectPreview('twinkle', ['#fff1dc'], 'down', 80) },
  { kind: 'fire', label: 'Fire', note: 'Candle and flame flicker', preview: effectPreview('fire', ['#ff6a14', '#ff2a08']) },
];

function Effects() {
  const board = useBoard();
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs text-white/50 flex-1">{board.selection.length ? `Tap an effect to run it on the ${board.selection.length} selected.` : 'Select fixtures first; a new effect runs on that selection.'}</p>
        <PreviewMotionToggle />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
        {EFFECTS.map((e) => <LookTile key={e.kind} preset={e.preview} label={e.label} active={false} disabled={!board.selection.length} onPlay={() => boardEngine.addEffect(e.kind)} />)}
      </div>
      <ul className="space-y-1.5">
        {board.show.effects.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 p-2.5 rounded bg-white/[0.04] text-xs">
            <button onClick={() => boardEngine.updateEffect(e.id, { on: !e.on })} aria-pressed={e.on} className={`px-2 py-1 rounded font-semibold ${e.on ? 'bg-[#FF8C00] text-black' : 'bg-white/10'}`}>{e.on ? 'On' : 'Off'}</button>
            <span className="font-medium w-20">{EFFECTS.find((x) => x.kind === e.kind)?.label} <span className="text-white/50 font-normal">({e.fixtureIds.length})</span></span>
            <label className="flex items-center gap-1.5 text-white/60">Rate <input type="range" min={5} max={240} value={e.rate} onChange={(v) => boardEngine.updateEffect(e.id, { rate: Number(v.target.value) })} className="w-24 accent-[#FF8C00]" /><span className="tabular-nums w-14">{e.rate}/min</span></label>
            <label className="flex items-center gap-1.5 text-white/60">Size <input type="range" min={0} max={100} value={Math.round(e.size * 100)} onChange={(v) => boardEngine.updateEffect(e.id, { size: Number(v.target.value) / 100 })} className="w-20 accent-[#FF8C00]" /></label>
            <label className="flex items-center gap-1.5 text-white/60">Spread <input type="range" min={0} max={100} value={Math.round(e.spread * 100)} onChange={(v) => boardEngine.updateEffect(e.id, { spread: Number(v.target.value) / 100 })} className="w-20 accent-[#FF8C00]" /></label>
            <button aria-label="Delete effect" className="p-1.5 ml-auto rounded hover:bg-white/10" onClick={() => boardEngine.deleteEffect(e.id)}><Trash2 size={12} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── DMX monitor ─────────────────────────────────────────────────────────────

function DmxMonitor() {
  const board = useBoard();
  const universes = [...board.universes.keys()].sort((a, b) => a - b);
  const [picked, setPicked] = useState<number | null>(null);
  const universe = picked != null && universes.includes(picked) ? picked : universes[0];
  const data = universe != null ? board.universes.get(universe) : undefined;
  const owners = useMemo(() => {
    const map = new Map<number, string>();
    for (const f of board.show.fixtures) {
      if (f.universe !== universe || f.address == null) continue;
      profileOf(f, board.show.customProfiles).channels.forEach((c, i) => map.set(f.address! + i, `${f.name}: ${c.label}`));
    }
    return map;
  }, [board.show.fixtures, board.show.customProfiles, universe]);

  if (!data) return <p className="text-xs text-white/50 p-4">Patch a DMX fixture to see its universe.</p>;
  return (
    <div className="p-3 space-y-2">
      <div className="flex gap-1">
        {universes.map((u) => <button key={u} onClick={() => setPicked(u)} aria-pressed={u === universe} className={`${btnCls} ${u === universe ? '!bg-[#FF8C00] text-black' : ''}`}>U{u}</button>)}
      </div>
      <div data-testid="dmx-grid" className="grid grid-cols-[repeat(auto-fill,minmax(1.9rem,1fr))] gap-px">
        {Array.from(data).map((v, i) => {
          const owner = owners.get(i + 1);
          return (
            <div key={i} title={`${i + 1}${owner ? ` · ${owner}` : ''} = ${v}`} className={`relative h-8 text-center text-[9px] leading-none pt-1 overflow-hidden ${owner ? 'bg-white/[0.09]' : 'bg-white/[0.03]'}`}>
              <div className="absolute inset-x-0 bottom-0 bg-[#FF8C00]/50" style={{ height: `${(v / 255) * 100}%` }} />
              <span className="relative text-white/50 tabular-nums">{i + 1}</span>
              <span className="relative block font-semibold tabular-nums mt-0.5">{v || ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Console ─────────────────────────────────────────────────────────────────

export function ProBoard({ onConnectSmart }: { onConnectSmart?: () => void }) {
  const board = useBoard();
  const [tab, setTab] = useState<Tab>('Looks');
  const [command, setCommand] = useState('');
  const showInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (e.code === 'Space' && t.tagName !== 'BUTTON') { e.preventDefault(); boardEngine.go(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const exportShow = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(board.show, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${board.show.name.replace(/[^\w -]+/g, '') || 'lighting-show'}.plajahlights.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importShow = async (file?: File) => {
    if (!file) return;
    try { boardEngine.loadShow(JSON.parse(await file.text())); }
    catch (e: any) { boardEngine.commandMessage = e?.message || 'That file could not be read.'; }
  };

  const activeCue = board.show.cues.find((c) => c.id === board.activeCueId);
  const nextCue = board.show.cues[board.show.cues.findIndex((c) => c.id === board.activeCueId) + 1];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 border-b border-white/10 shrink-0">
        <form className="flex items-center gap-1.5 flex-1 min-w-[14rem]" onSubmit={(e) => { e.preventDefault(); if (boardEngine.runCommand(command)) setCommand(''); }}>
          <input value={command} onChange={(e) => setCommand(e.target.value)} aria-label="Command line" spellCheck={false} placeholder="1 thru 4 at 50" className="flex-1 min-w-0 bg-black border border-white/15 rounded px-2 py-1.5 text-xs font-mono text-[#FFB266] outline-none focus:border-[#FF8C00]" />
          <span role="status" className="hidden md:inline text-[11px] text-white/50 truncate max-w-[12rem]">{board.commandMessage}</span>
        </form>
        <label className="flex items-center gap-1.5 text-[11px] text-white/60">GM
          <input type="range" min={0} max={100} aria-label="Grand master" value={Math.round(board.grandMaster * 100)} onChange={(e) => boardEngine.setGrandMaster(Number(e.target.value) / 100)} className="w-24 accent-[#FF8C00]" />
          <span className="tabular-nums w-7 text-white">{Math.round(board.grandMaster * 100)}</span>
        </label>
        <button onClick={() => boardEngine.setBlackout(!board.blackout)} aria-pressed={board.blackout} className={`px-2.5 py-1.5 rounded text-xs font-bold ${board.blackout ? 'bg-red-600 text-white' : 'bg-white/10 hover:bg-white/15'}`}>BLACKOUT</button>
        <button onClick={() => boardEngine.setFollowMusic(!board.followMusic)} aria-pressed={board.followMusic} className={`px-2.5 py-1.5 rounded text-xs font-medium ${board.followMusic ? 'bg-[#FF8C00] text-black' : 'bg-white/10 hover:bg-white/15'}`}>Audio</button>
        <div className="flex items-center gap-1.5">
          <div className="text-[10px] leading-tight text-right w-24 hidden sm:block">
            <div className="truncate">{activeCue ? `${activeCue.number} ${activeCue.label}` : 'No cue'}</div>
            <div className="truncate text-white/50">{nextCue ? `Next: ${nextCue.number}` : 'End of list'}</div>
          </div>
          <button onClick={() => boardEngine.back()} className={btnCls}>BACK</button>
          <button onClick={() => boardEngine.go()} disabled={!board.show.cues.length} className="px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold disabled:opacity-30">GO</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <FixtureGrid onConnectSmart={onConnectSmart} />
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <div role="tablist" className="flex items-center overflow-x-auto border-b border-white/10 shrink-0">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3 h-9 text-xs font-medium whitespace-nowrap border-b-2 ${tab === t ? 'border-[#FF8C00] text-white' : 'border-transparent text-white/60 hover:text-white'}`}>{t}</button>
            ))}
            <div className="ml-auto flex shrink-0 pr-1">
              <input ref={showInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { void importShow(e.target.files?.[0]); e.target.value = ''; }} />
              <button aria-label="Open show file" title="Open show file" onClick={() => showInput.current?.click()} className="p-2 rounded hover:bg-white/10"><Upload size={14} /></button>
              <button aria-label="Save show file" title="Save show file" onClick={exportShow} className="p-2 rounded hover:bg-white/10"><Download size={14} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {tab === 'Looks' && <LooksGallery />}
            {tab === 'Fixtures' && <FixtureGallery onConnectSmart={onConnectSmart} />}
            {tab === 'Smart lights' && <SmartTab onConnect={onConnectSmart} />}
            {tab === '3D stage' && <Suspense fallback={<p className="p-4 text-sm text-white/50">Loading the 3D stage…</p>}><Stage3D /></Suspense>}
            {tab === 'Programmer' && <Programmer />}
            {tab === 'Patch' && <Patch />}
            {tab === 'Cues' && <Cues />}
            {tab === 'Playbacks' && <Playbacks />}
            {tab === 'Effects' && <Effects />}
            {tab === 'Output' && <div className="p-3 max-w-2xl"><OutputSetup /></div>}
            {tab === 'DMX' && <DmxMonitor />}
          </div>
        </main>
      </div>
    </div>
  );
}
