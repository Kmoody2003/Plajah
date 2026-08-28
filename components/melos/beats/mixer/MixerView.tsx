// The dedicated Mixer page — a real console with Bitwig/Studio One structural parity: EVERY
// channel (each pad, each bus, each arrangement track, each FX return) carries its own insert
// chain and aux-send knobs, not just the buses. Pick a channel to open its slots in the
// resizable editor below; its inserts come from the whole device library (fx/devices.ts).
//
// The signal truth is the doc — pad.inserts/sends, arrangeTrack.inserts/sends,
// mixer.groups[].inserts/sends, mixer.sendBuses[] — and BeatsEngine reconciles the live graph,
// so a bounce prints the same board. The visual language of the strips is unchanged.

import React, { useRef, useState } from 'react';
import { GripHorizontal } from 'lucide-react';
import type { GrooveDoc, PadConfig, ArrangeTrack } from '../../../../services/melos/beats/grooveDoc';
import { GROUP_NAMES, defaultSendBuses } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import type { FxInstance, FxNode } from '../../../../services/melos/beats/fx/devices';
import { ChannelStrip } from '../shared/ChannelStrip';
import { FxRack } from '../project/FxRack';
import { GROUP_COLORS, PLAYHEAD, SELECT, slabPanel } from '../theme';

const GROUP_LABELS = ['Bus A', 'Bus B', 'Bus C', 'Bus D'];
const SEND_COLORS = ['#06D6A0', '#00DAF3'];

interface MixerViewProps {
  doc: GrooveDoc;
  meters: { groups: number[]; master: number; sends: number[] };
  limiterReduction: number;
  selectedPad: number;
  onSelectPad: (i: number) => void;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  /** Double-click a channel header: instrument → its window; synth/sample pad → its controls in
   *  MEKA; audio track → the Timeline where its clips/waveform live. */
  onOpenInstrument?: (trackId: string) => void;
  onFocusPad?: (padIdx: number) => void;
  onFocusTrack?: (trackId: string) => void;
}

/** What's open in the editor. Master isn't here — its full chain lives in the Project view. */
type Sel =
  | { kind: 'pad'; id: number }
  | { kind: 'group'; id: number }
  | { kind: 'track'; id: string }
  | { kind: 'send'; id: number };


export const MixerView: React.FC<MixerViewProps> = ({ doc, meters, limiterReduction, selectedPad, onSelectPad, onMutate, onOpenInstrument, onFocusPad, onFocusTrack }) => {
  const [sel, setSel] = useState<Sel>({ kind: 'group', id: 0 });
  const [tab, setTab] = useState<'inserts' | 'sends'>('inserts');
  const [panelH, setPanelH] = useState(240);
  const resize = useRef<{ y: number; h: number } | null>(null);
  const sendBuses = doc.mixer.sendBuses ?? defaultSendBuses();
  const eng = BeatsEngine.get();

  const selKey = `${sel.kind}:${sel.id}`;
  const isSel = (kind: Sel['kind'], id: number | string) => sel.kind === kind && sel.id === id;

  // ── read/write the selected channel's inserts + sends, wherever they live ──
  const findTrack = (d: GrooveDoc, id: string) => d.arrangement.find((t) => t.id === id);
  const getInserts = (): FxInstance[] => {
    if (sel.kind === 'pad') return doc.kit[sel.id]?.inserts ?? [];
    if (sel.kind === 'group') return doc.mixer.groups[sel.id]?.inserts ?? [];
    if (sel.kind === 'track') return findTrack(doc, sel.id)?.inserts ?? [];
    return sendBuses[sel.id]?.inserts ?? [];
  };
  const setInserts = (next: FxInstance[]) => onMutate((d) => {
    if (sel.kind === 'pad') { const p = d.kit[sel.id]; if (p) p.inserts = next; }
    else if (sel.kind === 'group') { d.mixer.groups[sel.id].inserts = next; }
    else if (sel.kind === 'track') { const t = findTrack(d, sel.id); if (t) t.inserts = next; }
    else { if (!d.mixer.sendBuses) d.mixer.sendBuses = defaultSendBuses(); d.mixer.sendBuses[sel.id] = { ...d.mixer.sendBuses[sel.id], inserts: next }; }
  });
  const insertNodeOf = (id: string): FxNode | undefined => {
    if (sel.kind === 'pad') return eng.padInsertNode(sel.id, id);
    if (sel.kind === 'group') return eng.groupInsertNode(sel.id, id);
    if (sel.kind === 'track') return eng.trackInsertNode(sel.id, id);
    return eng.sendInsertNode(sel.id, id);
  };
  const insertReductionOf = (id: string): number => {
    if (sel.kind === 'pad') return eng.padInsertReduction(sel.id, id);
    if (sel.kind === 'group') return eng.groupInsertReduction(sel.id, id);
    if (sel.kind === 'track') return eng.trackInsertReduction(sel.id, id);
    return eng.sendInsertReduction(sel.id, id);
  };
  const setSendLevel = (sendIdx: number, level: number) => onMutate((d) => {
    if (sel.kind === 'pad') { const p = d.kit[sel.id]; if (p) { const s = [...(p.sends ?? [0, 0])]; s[sendIdx] = level; p.sends = s; } }
    else if (sel.kind === 'group') { const g = d.mixer.groups[sel.id]; const s = [...(g.sends ?? [0, 0])]; s[sendIdx] = level; g.sends = s; }
    else if (sel.kind === 'track') { const t = findTrack(d, sel.id); if (t) { const s = [...(t.sends ?? [0, 0])]; s[sendIdx] = level; t.sends = s; } }
  });
  const getSends = (): number[] => {
    if (sel.kind === 'pad') return doc.kit[sel.id]?.sends ?? [];
    if (sel.kind === 'group') return doc.mixer.groups[sel.id]?.sends ?? [];
    if (sel.kind === 'track') return findTrack(doc, sel.id)?.sends ?? [];
    return [];
  };

  const selColor = sel.kind === 'group' ? GROUP_COLORS[sel.id] : sel.kind === 'send' ? SEND_COLORS[sel.id]
    : sel.kind === 'track' ? PLAYHEAD : (doc.kit[sel.id as number]?.color || '#D0BCFF');
  const selName = sel.kind === 'group' ? GROUP_LABELS[sel.id] : sel.kind === 'send' ? `${sendBuses[sel.id]?.name} return`
    : sel.kind === 'track' ? (findTrack(doc, sel.id)?.name ?? 'Track') : (doc.kit[sel.id as number]?.name ?? 'Pad');

  // The vertical send column beside each channel's fader — scales to any number of buses.
  const sendsFor = (sends: number[], write: (sendIdx: number, v: number) => void) =>
    sendBuses.map((b, s) => ({
      label: b.name.replace('FX ', 'S'),
      color: SEND_COLORS[s] ?? '#D0BCFF',
      value: sends[s] ?? 0,
      onChange: (v: number) => write(s, v),
    }));

  const onResizeDown = (e: React.PointerEvent) => { resize.current = { y: e.clientY, h: panelH }; (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const onResizeMove = (e: React.PointerEvent) => { const r = resize.current; if (r) setPanelH(Math.max(120, Math.min(560, r.h + (r.y - e.clientY)))); };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className={`${slabPanel} p-4 inline-flex gap-2 items-stretch min-w-full`}>

          {/* pads — each a channel with sends + inserts (empty placeholder pads have no channel) */}
          <div className="flex gap-1.5">
            {doc.kit.map((pad, i) => pad.empty ? null : (
              <div
                key={pad.id}
                onPointerDown={() => { onSelectPad(i); setSel({ kind: 'pad', id: i }); }}
                onDoubleClick={() => {
                  // Instrument pad → its window; a synth/sample pad → its sound controls in MEKA.
                  if (pad.source === 'instrument' && pad.instrumentTrackId) onOpenInstrument?.(pad.instrumentTrackId);
                  else onFocusPad?.(i);
                }}
                className="rounded-[10px] cursor-pointer"
                title="Double-click to edit this channel's sound"
                style={isSel('pad', i) ? { outline: `1px solid ${SELECT}`, outlineOffset: 1 } : i === selectedPad ? { outline: '1px solid rgba(212,0,85,0.35)', outlineOffset: 1 } : undefined}
              >
                <ChannelStrip
                  label={pad.name}
                  color={pad.color !== '#F5F0FA' ? pad.color : undefined}
                  routeTag={GROUP_NAMES[pad.group]}
                  gainDb={pad.gainDb}
                  pan={pad.pan}
                  mute={!!pad.mute}
                  meter={eng.padMeter(i)}
                  sends={sendsFor(pad.sends ?? [], (s, v) => onMutate((d) => { const p = d.kit[i]; if (p) { const arr = [...(p.sends ?? [])]; arr[s] = v; p.sends = arr; } }))}
                  onGain={(db) => onMutate((d) => { const p = d.kit[i]; if (p) p.gainDb = db; })}
                  onPan={(v) => onMutate((d) => { const p = d.kit[i]; if (p) p.pan = v; })}
                  onMute={() => onMutate((d) => { const p = d.kit[i]; if (p) p.mute = !p.mute; })}
                >
                  {(pad.inserts?.filter((f) => f.on).length ?? 0) > 0 && (
                    <span className="text-[7px] px-1 rounded mx-auto text-[#00DAF3] border border-[#00DAF3]/40">{pad.inserts!.filter((f) => f.on).length} FX</span>
                  )}
                  {/* Step-FX switch — mirrors Glass; the master bypass for this pad's step effects. */}
                  {(pad.stepFx?.length ?? 0) > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onMutate((d) => { const p = d.kit[i]; if (p) p.stepFxOn = p.stepFxOn === false; }); }}
                      className="text-[6.5px] font-bold px-1 rounded mx-auto border"
                      style={pad.stepFxOn !== false ? { color: SELECT, borderColor: `${SELECT}66` } : { color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.15)' }}
                      title="Step FX on/off — edit in Glass"
                    >STEP {pad.stepFxOn !== false ? 'ON' : 'OFF'}</button>
                  )}
                </ChannelStrip>
              </div>
            ))}
          </div>

          <div className="w-px bg-white/[0.16] flex-none" />

          {/* group buses */}
          <div className="flex gap-1.5">
            {doc.mixer.groups.map((g, i) => (
              <div key={GROUP_LABELS[i]} onPointerDown={() => setSel({ kind: 'group', id: i })} className="rounded-[10px]" style={isSel('group', i) ? { outline: `1px solid ${SELECT}`, outlineOffset: 1 } : undefined}>
                <ChannelStrip
                  label={GROUP_LABELS[i]} color={GROUP_COLORS[i]} gainDb={g.gainDb} mute={g.mute} solo={g.solo}
                  meter={meters.groups[i] || 0} meterColor={GROUP_COLORS[i]}
                  sends={sendsFor(g.sends ?? [], (s, v) => onMutate((d) => { const arr = [...(d.mixer.groups[i].sends ?? [])]; arr[s] = v; d.mixer.groups[i].sends = arr; }))}
                  onGain={(db) => onMutate((d) => { d.mixer.groups[i].gainDb = db; })}
                  onMute={() => onMutate((d) => { d.mixer.groups[i].mute = !d.mixer.groups[i].mute; })}
                  onSolo={() => onMutate((d) => { d.mixer.groups[i].solo = !d.mixer.groups[i].solo; })}
                >
                  {(g.inserts?.filter((f) => f.on).length ?? 0) > 0 && (
                    <span className="text-[7px] px-1 rounded mx-auto text-[#00DAF3] border border-[#00DAF3]/40">{g.inserts!.filter((f) => f.on).length} FX</span>
                  )}
                </ChannelStrip>
              </div>
            ))}
          </div>

          <div className="w-px bg-white/[0.16] flex-none" />

          {/* FX return buses */}
          <div className="flex gap-1.5">
            {sendBuses.map((b, i) => (
              <div key={i} onPointerDown={() => setSel({ kind: 'send', id: i })} className="rounded-[10px]" style={isSel('send', i) ? { outline: `1px solid ${SELECT}`, outlineOffset: 1 } : undefined}>
                <ChannelStrip
                  label={b.name} color={SEND_COLORS[i]} routeTag="return" gainDb={b.gainDb}
                  meter={meters.sends?.[i] || 0} meterColor={SEND_COLORS[i]}
                  onGain={(db) => onMutate((d) => { if (!d.mixer.sendBuses) d.mixer.sendBuses = defaultSendBuses(); d.mixer.sendBuses[i] = { ...d.mixer.sendBuses[i], gainDb: db }; })}
                >
                  {(b.inserts?.filter((f) => f.on).length ?? 0) > 0 && (
                    <span className="text-[7px] px-1 rounded mx-auto" style={{ color: SEND_COLORS[i], border: `1px solid ${SEND_COLORS[i]}66` }}>{b.inserts!.filter((f) => f.on).length} FX</span>
                  )}
                </ChannelStrip>
              </div>
            ))}
          </div>

          {doc.arrangement.some((t) => !t.padOwned) && <div className="w-px bg-white/[0.16] flex-none" />}

          {/* arrangement tracks — each a channel with sends + inserts. padOwned instrument
              tracks are already the PAD strip on the left; showing them twice gave every pad
              instrument two mixer channels. */}
          <div className="flex gap-1.5">
            {doc.arrangement.filter((t) => !t.padOwned).map((t) => (
              <div
                key={t.id}
                onPointerDown={() => !t.foreign && setSel({ kind: 'track', id: t.id })}
                onDoubleClick={() => {
                  if (t.foreign) return;
                  // Instrument track → its window; audio track → the Timeline (its clips/waveform).
                  if (t.kind === 'instrument') onOpenInstrument?.(t.id);
                  else onFocusTrack?.(t.id);
                }}
                className="rounded-[10px] cursor-pointer"
                title={t.foreign ? undefined : 'Double-click to open this track'}
                style={isSel('track', t.id) ? { outline: `1px solid ${SELECT}`, outlineOffset: 1 } : undefined}
              >
                <ChannelStrip
                  label={t.name} color={t.kind === 'audio' ? PLAYHEAD : '#B84DFF'} gainDb={t.gainDb} pan={t.pan} mute={t.mute} solo={t.solo}
                  meter={t.kind === 'audio' ? eng.trackMeter(t.id) : 0} dimmed={!!t.foreign}
                  sends={t.foreign ? undefined : sendsFor(t.sends ?? [], (s, v) => onMutate((d) => { const x = findTrack(d, t.id); if (x) { const arr = [...(x.sends ?? [])]; arr[s] = v; x.sends = arr; } }))}
                  onGain={t.foreign ? undefined : (db) => onMutate((d) => { const x = findTrack(d, t.id); if (x) x.gainDb = db; })}
                  onPan={t.foreign ? undefined : (v) => onMutate((d) => { const x = findTrack(d, t.id); if (x) x.pan = v; })}
                  onMute={t.foreign ? undefined : () => onMutate((d) => { const x = findTrack(d, t.id); if (x) x.mute = !x.mute; })}
                  onSolo={t.foreign ? undefined : () => onMutate((d) => { const x = findTrack(d, t.id); if (x) x.solo = !x.solo; })}
                >
                  {!t.foreign && (t.inserts?.filter((f) => f.on).length ?? 0) > 0 && (
                    <span className="text-[7px] px-1 rounded mx-auto text-[#00DAF3] border border-[#00DAF3]/40">{t.inserts!.filter((f) => f.on).length} FX</span>
                  )}
                </ChannelStrip>
              </div>
            ))}
          </div>

          <div className="w-px bg-white/[0.16] flex-none" />

          <ChannelStrip label="MASTER" wide gainDb={doc.mixer.master.gainDb} meter={meters.master}
            onGain={(db) => onMutate((d) => { d.mixer.master.gainDb = db; })}>
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => onMutate((d) => { d.mixer.master.limiterOn = !d.mixer.master.limiterOn; })}
                className="text-[8.5px] font-semibold rounded-[4px] px-1.5 py-0.5 border"
                style={doc.mixer.master.limiterOn ? { color: '#06D6A0', borderColor: 'rgba(6,214,160,0.4)' } : { color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.15)' }}
              >LIMITER</button>
              <span className="font-mono text-[8.5px] text-white/40">GR {limiterReduction.toFixed(1)} dB</span>
              <span className="text-[7.5px] text-white/25 text-center">full chain in Project</span>
            </div>
          </ChannelStrip>
        </div>
      </div>

      {/* ── Resizable channel editor — inserts + sends for the selected channel ── */}
      <div className="flex-none border-t border-white/10 bg-[#0b0710]" style={{ height: panelH }}>
        <div
          className="h-4 flex items-center justify-center cursor-ns-resize touch-none"
          onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={() => { resize.current = null; }}
        ><GripHorizontal size={13} className="text-white/25" /></div>
        <div className="px-4 pb-4 h-[calc(100%-16px)] overflow-auto">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: selColor }} />
            <span className="text-[12px] font-bold text-white">{selName}</span>
            <div className="flex gap-1 ml-2">
              <button onClick={() => setTab('inserts')} className="h-6 px-2.5 rounded-lg text-[10px] font-bold border"
                style={tab === 'inserts' ? { color: '#fff', borderColor: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)' } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
              >Inserts</button>
              {sel.kind !== 'send' && (
                <button onClick={() => setTab('sends')} className="h-6 px-2.5 rounded-lg text-[10px] font-bold border"
                  style={tab === 'sends' ? { color: '#fff', borderColor: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)' } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
                >Sends</button>
              )}
            </div>
            <span className="text-[9px] text-white/30 ml-auto">
              {sel.kind === 'send' ? 'the return the sends feed — usually a reverb or delay' : 'runs in this channel · prints in the bounce'}
            </span>
          </div>

          {tab === 'inserts' || sel.kind === 'send' ? (
            <FxRack
              key={selKey}
              horizontal
              instances={getInserts()}
              onChange={setInserts}
              accent={selColor}
              reductionOf={insertReductionOf}
              nodeOf={insertNodeOf}
              emptyHint={sel.kind === 'send' ? 'Add a Reverb or Delay — this is what the sends land in.' : 'Add inserts to this channel — EQ, comp, saturation, amp rack, Pristine…'}
            />
          ) : (
            <div className="max-w-[420px]">
              <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/35">Sends</span>
              <div className="mt-2 flex flex-col gap-3">
                {sendBuses.map((b, s) => {
                  const level = getSends()[s] ?? 0;
                  return (
                    <div key={s} className="flex items-center gap-2.5">
                      <span className="w-11 text-[10px] font-bold" style={{ color: SEND_COLORS[s] }}>{b.name}</span>
                      <input type="range" min={0} max={1.5} step={0.01} value={level}
                        onChange={(e) => setSendLevel(s, Number(e.target.value))} className="flex-1 accent-[#06D6A0]"
                        aria-label={`${selName} send to ${b.name}`} />
                      <span className="font-mono text-[9px] text-white/50 w-12 text-right">{level < 0.001 ? 'off' : `${(20 * Math.log10(level)).toFixed(1)} dB`}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[9px] text-white/25">Post-insert sends feed the FX 1 / FX 2 return buses — pick a return to give it a reverb or delay.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
