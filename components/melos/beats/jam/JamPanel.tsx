// The jam dock for a shared groove: Session (join, what I bring, everyone's rigs, track inputs,
// record Live/Commit), Takes (the local tray, who's recording, how each take is syncing) and
// Contributions (who brought what, every asset's tier and version chain).

import React, { useMemo, useState } from 'react';
import { Radio, X, Mic, Piano, Package, Library, Check, Circle, Square, Upload, Trash2, Users } from 'lucide-react';
import { auth } from '../../../../services/firebase';
import { byContributor, versionChain, type SharedAsset } from '../../../../services/coedit/assets';
import { remoteInputRef, type RigShares } from '../../../../services/coedit/rig';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import type { ChoraJam, LedgerTier } from './useChoraJam';

type Tab = 'session' | 'takes' | 'board';

const SHARE_ROWS: Array<{ key: keyof RigShares; label: string; hint: string; icon: React.ReactNode }> = [
  { key: 'inputs', label: 'Inputs', hint: 'Others can arm a track on your interface / mic — you stream it', icon: <Mic size={12} /> },
  { key: 'midi', label: 'MIDI', hint: 'Your controllers play tracks for everyone', icon: <Piano size={12} /> },
  { key: 'instruments', label: 'Instruments & presets', hint: 'Your saved presets and KERA programs, on request', icon: <Package size={12} /> },
  { key: 'library', label: 'Library & samples', hint: 'Your Melos samples, on request', icon: <Library size={12} /> },
  { key: 'autoApprove', label: 'Approve requests automatically', hint: 'Otherwise you are asked each time', icon: <Check size={12} /> },
];

const tierLabel = (t: LedgerTier | undefined, a: SharedAsset, uploading: boolean) =>
  t === 'local' ? 'full quality (yours)' : t === 'master' ? 'full quality' : t === 'proxy' ? (a.tiers.master ? 'proxy · full quality ready' : 'proxy · full quality syncing') : t === 'error' ? 'could not load' : uploading || a.status === 'local' ? `${a.ownerName.split(' ')[0]} is uploading…` : 'waiting';

const statusChip = (s: SharedAsset['status']) =>
  s === 'master' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' : s === 'proxy' ? 'bg-amber-500/15 text-amber-200 border-amber-400/30' : 'bg-white/5 text-white/50 border-white/15';

export const JamPanel: React.FC<{ jam: ChoraJam; doc: GrooveDoc; onClose: () => void }> = ({ jam, doc, onClose }) => {
  const [tab, setTab] = useState<Tab>('session');
  const me = auth.currentUser?.uid ?? '';
  const audioTracks = doc.arrangement.filter((t) => t.kind === 'audio');
  const instTracks = doc.arrangement.filter((t) => t.kind === 'instrument' && !t.padOwned);
  const othersRigs = jam.rigs.filter((r) => r.uid !== me);
  const remoteInputs = othersRigs.flatMap((r) => r.audioInputs.map((i) => ({ ref: remoteInputRef(r.uid, i.id), label: `${r.name.split(' ')[0]} · ${i.label}` })));
  const groups = useMemo(() => byContributor(jam.assets), [jam.assets]);

  return (
    <aside className="w-[320px] shrink-0 min-h-0 flex flex-col border-l border-white/10 bg-[#0B0A10]/95 text-white">
      <header className="px-3 pt-2.5 pb-2 border-b border-white/10 flex items-center gap-2 shrink-0">
        <Radio size={14} className={jam.joined ? 'text-[#FF4D8D]' : 'text-white/40'} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-extrabold">Live jam</div>
          <div className="text-[10px] text-white/45 truncate">
            {jam.joined ? `${jam.peers.length + 1} in the room` : 'Play and record together on this shared groove'}
          </div>
        </div>
        {jam.joined
          ? <button onClick={() => void jam.leave()} className="h-7 px-2.5 rounded-lg text-[11px] border border-white/15 text-white/70 hover:bg-white/10">Leave</button>
          : <button onClick={() => void jam.join()} disabled={jam.joining} className="h-7 px-2.5 rounded-lg text-[11px] font-semibold bg-[#FF4D8D]/20 text-[#FF4D8D] border border-[#FF4D8D]/40 hover:bg-[#FF4D8D]/30 disabled:opacity-50">{jam.joining ? 'Joining…' : 'Join jam'}</button>}
        <button onClick={onClose} aria-label="Close jam panel" className="w-7 h-7 grid place-items-center rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X size={14} /></button>
      </header>
      <nav className="flex gap-1 px-2 py-1.5 border-b border-white/10 shrink-0 text-[11px]">
        {(['session', 'takes', 'board'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 h-7 rounded-lg ${tab === t ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}>
            {t === 'session' ? 'Session' : t === 'takes' ? `Takes${jam.tray.length ? ` (${jam.tray.length})` : ''}` : 'Contributions'}
          </button>
        ))}
      </nav>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4 text-[11px]">
        {/* Someone is using my input / asking for my items. */}
        {jam.usingMine.map((u) => (
          <div key={`${u.uid}:${u.trackId}`} className="rounded-lg border border-[#FF4D8D]/40 bg-[#FF4D8D]/10 p-2 flex items-center gap-2">
            <span className="flex-1">{u.name.split(' ')[0]} is using your {jam.hw.audioInputs.find((i) => i.id === u.inputId)?.label || 'input'}</span>
            <button onClick={() => void jam.stopSharingInput(u)} className="h-6 px-2 rounded border border-white/20 hover:bg-white/10">Stop</button>
          </div>
        ))}
        {jam.requests.map((r) => (
          <div key={r.id} className="rounded-lg border border-[#00DAF3]/40 bg-[#00DAF3]/10 p-2 space-y-1.5">
            <div>{r.fromName.split(' ')[0]} would like your {r.item.category} “{r.item.name}”</div>
            <div className="flex gap-1.5">
              <button onClick={() => void jam.fulfil(r)} className="h-6 px-2 rounded bg-[#00DAF3]/20 border border-[#00DAF3]/40">Share it</button>
              <button onClick={() => void jam.decline(r)} className="h-6 px-2 rounded border border-white/15 text-white/60">Not now</button>
            </div>
          </div>
        ))}
        {Object.values(jam.ghosts).map((g) => (
          <div key={g.peer} className="rounded-lg border border-red-400/40 bg-red-500/10 p-2 flex items-center gap-2">
            <Circle size={9} className="fill-red-500 text-red-500 animate-pulse" />
            <span>{g.name.split(' ')[0]} recording on {doc.arrangement.find((t) => t.id === g.trackId)?.name || 'a track'}{g.mode === 'commit' ? ' (private take)' : '…'}</span>
          </div>
        ))}

        {tab === 'session' && (
          <>
            <section className="space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">What I bring</h4>
              {SHARE_ROWS.map((row) => (
                <label key={row.key} className="flex items-start gap-2 cursor-pointer" title={row.hint}>
                  <input type="checkbox" className="mt-0.5" checked={jam.shares[row.key]} onChange={(e) => void jam.setShares({ ...jam.shares, [row.key]: e.target.checked })} />
                  <span className="text-white/50 mt-0.5">{row.icon}</span>
                  <span><span className="text-white/85">{row.label}</span><br /><span className="text-white/35 text-[10px]">{row.hint}</span></span>
                </label>
              ))}
              {!jam.joined && <p className="text-white/35 text-[10px]">Your rig is published when you join.</p>}
            </section>

            <section className="space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45 flex items-center gap-1"><Users size={11} /> In the room</h4>
              {othersRigs.length === 0 && <p className="text-white/35">Nobody else has shared a rig yet.</p>}
              {othersRigs.map((r) => (
                <div key={r.key} className="rounded-lg border border-white/10 p-2 space-y-1">
                  <div className="font-semibold text-white/85">{r.name} <span className="text-white/30 font-normal">· {r.host}</span></div>
                  {r.audioInputs.length > 0 && <div className="text-white/50">Inputs: {r.audioInputs.map((i) => i.label).join(', ')}</div>}
                  {r.midiInputs.length > 0 && <div className="text-white/50">MIDI: {r.midiInputs.map((i) => i.label).join(', ')}</div>}
                  {([['instrument', r.instruments], ['preset', r.presets], ['library', r.library]] as const).map(([cat, items]) => items.length > 0 && (
                    <details key={cat}>
                      <summary className="cursor-pointer text-white/60">{cat === 'library' ? 'Library' : cat === 'preset' ? 'Presets' : 'Instruments'} ({items.length})</summary>
                      <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                        {items.map((it) => (
                          <li key={it.id} className="flex items-center gap-1.5">
                            <span className="flex-1 truncate text-white/70">{it.name}{it.instrument ? <span className="text-white/30"> · {it.instrument}</span> : null}</span>
                            <button onClick={() => void jam.requestRigItem(r, it, cat)} className="h-5 px-1.5 rounded border border-white/15 text-[10px] hover:bg-white/10">Use</button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              ))}
            </section>

            <section className="space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Track inputs</h4>
              {audioTracks.length === 0 && <p className="text-white/35">Add an audio track in the Timeline to record into.</p>}
              {jam.hw.audioInputs.length === 0 && audioTracks.length > 0 && (
                <button onClick={() => void jam.discoverMine()} className="h-6 px-2 rounded border border-white/15 text-white/70 hover:bg-white/10">Show my inputs (asks for the mic)</button>
              )}
              {audioTracks.map((t) => {
                const recording = jam.take?.trackId === t.id;
                return (
                  <div key={t.id} className="flex items-center gap-1.5">
                    <span className="w-20 truncate text-white/75" title={t.name}>{t.name}</span>
                    <select
                      value={t.jamInput ?? ''}
                      onChange={(e) => jam.setTrackInput(t.id, e.target.value || null)}
                      className="flex-1 min-w-0 h-6 rounded bg-white/5 border border-white/15 text-[10px]"
                    >
                      <option value="">No input</option>
                      {jam.hw.audioInputs.map((i) => <option key={i.id} value={remoteInputRef(me, i.id)}>Mine · {i.label}</option>)}
                      {remoteInputs.map((i) => <option key={i.ref} value={i.ref}>{i.label}</option>)}
                    </select>
                    <button
                      onClick={() => void (recording ? jam.stopTake() : jam.startTake(t.id))}
                      disabled={!t.jamInput || (!!jam.take && !recording)}
                      title={recording ? 'Stop take' : `Record a ${jam.recMode === 'live' ? 'live' : 'private'} take`}
                      className={`w-6 h-6 grid place-items-center rounded border ${recording ? 'border-red-400 bg-red-500/20' : 'border-white/15 hover:bg-white/10'} disabled:opacity-30`}
                    >
                      {recording ? <Square size={10} className="text-red-300" /> : <Circle size={10} className="fill-red-500 text-red-500" />}
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center gap-1 pt-1">
                <span className="text-white/45 mr-1">Takes:</span>
                {(['live', 'commit'] as const).map((m) => (
                  <button key={m} onClick={() => jam.setRecMode(m)} className={`h-6 px-2 rounded border ${jam.recMode === m ? 'border-[#FF4D8D]/60 bg-[#FF4D8D]/15 text-white' : 'border-white/15 text-white/55'}`}
                    title={m === 'live' ? 'Others hear it as you play; the clip appears for everyone when you stop' : 'Record privately; commit the take you keep'}>
                    {m === 'live' ? 'Live' : 'Commit'}
                  </button>
                ))}
              </div>
              {instTracks.length > 0 && <p className="text-white/35 text-[10px]">MIDI: arm an instrument track and play — your notes play on everyone's machine{jam.recMode === 'commit' ? '; recorded notes wait in Takes until you commit' : ''}.</p>}
            </section>
          </>
        )}

        {tab === 'takes' && (
          <>
            <section className="space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">My takes tray</h4>
              {jam.tray.length === 0 && <p className="text-white/35">Commit-mode takes wait here at full quality.</p>}
              {jam.tray.map((t) => (
                <div key={t.id} className="flex items-center gap-1.5 rounded-lg border border-white/10 p-1.5">
                  <span className="flex-1 truncate">{t.trackName} · {t.kind === 'audio' ? `${(t.durationSec ?? 0).toFixed(1)}s` : `${t.notes?.length ?? 0} notes`}</span>
                  <button onClick={() => void jam.commitTray(t.id)} className="h-6 px-2 rounded bg-[#06D6A0]/15 border border-[#06D6A0]/40 flex items-center gap-1"><Upload size={10} /> Commit take</button>
                  <button onClick={() => void jam.discardTray(t.id)} aria-label="Discard take" className="w-6 h-6 grid place-items-center rounded border border-white/15 text-white/50 hover:text-red-300"><Trash2 size={10} /></button>
                </div>
              ))}
            </section>
            <section className="space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Takes in this song</h4>
              {jam.songAssets.length === 0 && <p className="text-white/35">No shared takes or samples on the timeline yet.</p>}
              {jam.songAssets.map((a) => {
                const p = jam.progress[a.id];
                return (
                  <div key={a.id} className="rounded-lg border border-white/10 p-1.5">
                    <div className="truncate text-white/80">{a.name}</div>
                    <div className="text-white/40 text-[10px]">
                      {tierLabel(jam.tiers[a.id], a, !!p && p.state === 'running')}
                      {p && p.state === 'running' && ` · uploading ${p.tier} ${Math.round(p.fraction * 100)}%`}
                    </div>
                  </div>
                );
              })}
            </section>
          </>
        )}

        {tab === 'board' && (
          <section className="space-y-3">
            {groups.length === 0 && <p className="text-white/35">Nothing contributed yet — takes, samples and presets appear here with who brought them.</p>}
            {groups.map((g) => (
              <div key={g.uid} className="space-y-1">
                <div className="font-semibold text-white/85">{g.name} <span className="text-white/30 font-normal">· {g.assets.length}</span></div>
                {g.assets.map((a) => {
                  const p = jam.progress[a.id];
                  const chain = versionChain(jam.assets, a.id);
                  return (
                    <div key={a.id} className="rounded-lg border border-white/10 p-1.5 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] uppercase tracking-wider text-white/40 w-14 shrink-0">{a.kind}</span>
                        <span className="flex-1 truncate text-white/80">{a.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${statusChip(a.status)}`}>{a.status === 'master' ? 'full quality' : a.status}</span>
                      </div>
                      {p && p.state !== 'done' && <div className="h-1 rounded bg-white/10 overflow-hidden"><div className="h-full bg-[#00DAF3]" style={{ width: `${Math.round(p.fraction * 100)}%` }} /></div>}
                      {chain.length > 1 && (
                        <div className="text-[10px] text-white/40">
                          Versions: {chain.map((c, i) => <span key={c.id} className={c.id === a.id ? 'text-white/80' : ''}>{i ? ' → ' : ''}v{i + 1} ({c.ownerName.split(' ')[0]})</span>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
};
