// AmboMixer — Ambo's audio console, built from the platform's shared parts:
//   · strips over amboAudioEngine (platformAudio device, Melos FX core)
//   · FxRack — the same plugin rack Melos Studio and Fabula use
//   · MeterBridge — the same BS.1770 loudness/true-peak meter bridge
//   · Peak Limiter (Melos device) + Pressing (Master Suite mastering) on master
// Channels: Playlist (+ per-file plugins), Slide Audio, Video, DJ Deck.

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, X, Plug, ShieldCheck, Disc3, AudioLines, Mic, EyeOff } from 'lucide-react';
import { FxRack } from '../melos/beats/project/FxRack';
import MeterBridge from '../shared/MeterBridge';
import { amboAudio, AMBO_CHANNELS, type AmboChannelId, type VizFollow } from '../../services/ambo/amboAudioEngine';
import { ERA_PROFILES, ENGINEERS, applyEra, eraById, defaultMastering, defaultSpectra } from '../../services/fabula/audioFx';
import { useAudioBus } from './AmboAudioBus';

type StripId = AmboChannelId | 'master' | 'live';

const toDb = (p: number) => (p <= 0.00001 ? -90 : 20 * Math.log10(p));
const DB_MIN = -60, DB_MAX = 6;
const dbToY = (db: number) => Math.max(0, Math.min(1, (db - DB_MIN) / (DB_MAX - DB_MIN)));

/** Peak meter with hold line and a latching clip light (click to reset). */
const Meter: React.FC<{ id: StripId; height: number }> = ({ id, height }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [clip, setClip] = useState(false);
  useEffect(() => {
    let raf = 0, hold = -90, holdT = 0;
    const draw = () => {
      const c = ref.current;
      if (c) {
        const ctx = c.getContext('2d');
        const W = c.width, H = c.height;
        const db = toDb(amboAudio.meter(id));
        const now = performance.now();
        if (db > hold || now - holdT > 1200) { hold = db; holdT = now; }
        if (db > -0.1) setClip(true);
        if (ctx) {
          ctx.clearRect(0, 0, W, H);
          ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 0, W, H);
          const y = dbToY(db) * H;
          const g = ctx.createLinearGradient(0, H, 0, 0);
          g.addColorStop(0, '#2BE0A8'); g.addColorStop(dbToY(-12), '#2BE0A8'); g.addColorStop(dbToY(-6), '#F5C542'); g.addColorStop(dbToY(-1), '#FF5A5F'); g.addColorStop(1, '#FF5A5F');
          ctx.fillStyle = g; ctx.fillRect(0, H - y, W, y);
          ctx.fillStyle = '#fff'; ctx.fillRect(0, H - dbToY(hold) * H, W, 2);
          // ticks
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          for (const t of [0, -6, -12, -24, -48]) ctx.fillRect(0, H - dbToY(t) * H, W, 1);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [id]);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={() => setClip(false)}
        className={`w-full h-1.5 rounded-sm ${clip ? 'bg-[#FF5A5F] shadow-[0_0_6px_#FF5A5F]' : 'bg-white/10'}`}
        title={clip ? 'Clipped — click to reset' : 'Clip indicator'}
      />
      <canvas ref={ref} width={10} height={height} style={{ width: 10, height }} className="rounded-sm" />
    </div>
  );
};

const VFader: React.FC<{ value: number; onChange: (db: number) => void; height: number; min?: number; max?: number }> = ({ value, onChange, height, min = -60, max = 12 }) => (
  <input
    type="range" min={min} max={max} step={0.5} value={value}
    onChange={e => onChange(Number(e.target.value))}
    onDoubleClick={() => onChange(0)}
    title={`${value > min ? value.toFixed(1) : '-∞'} dB · double-click for 0 dB`}
    style={{ writingMode: 'vertical-lr' as any, direction: 'rtl', height, width: 18 }}
    className="accent-[#D0BCFF] cursor-ns-resize"
  />
);

/**
 * Live In — a mic, line or interface input that DRIVES THE VISUALS ONLY.
 * It is never routed to the master, so it is never heard in the room or on
 * the stream.
 */
const LiveInStrip: React.FC<{ height: number }> = ({ height }) => {
  const st = useSyncExternalStore(amboAudio.subscribe, amboAudio.getSnapshot);
  const L = st.liveIn;
  const status = amboAudio.liveStatus();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = () => navigator.mediaDevices?.enumerateDevices?.().then(d => setDevices(d.filter(x => x.kind === 'audioinput'))).catch(() => {});
    load();
    navigator.mediaDevices?.addEventListener?.('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', load);
  }, [status.on]); // labels appear once permission is granted
  return (
    <div className="flex flex-col items-center gap-1.5 px-1.5 py-2 rounded-lg border border-dashed border-[#F5C542]/40 bg-[#F5C542]/[0.04] w-[118px]">
      <div className="text-[9.5px] font-bold text-[#F5C542] flex items-center gap-1"><Mic size={10} /> LIVE IN</div>
      <div className="flex items-center gap-1 px-1 rounded bg-[#F5C542]/15 text-[7.5px] font-black text-[#F5C542]" title="Drives the visualizers only — never sent to the speakers, stream or any output">
        <EyeOff size={8} /> VISUALS ONLY
      </div>
      <select
        value={L.deviceId ?? ''}
        onChange={e => amboAudio.setLiveIn({ deviceId: e.target.value || null })}
        className="w-full bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[9px] text-white/80"
        title="Input device"
      >
        <option value="">Default input</option>
        {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Input ${i + 1}`}</option>)}
      </select>
      <div className="flex items-end gap-1.5">
        <VFader value={L.gainDb} min={-24} max={24} height={height - 34} onChange={db => amboAudio.setLiveIn({ gainDb: db })} />
        <Meter id="live" height={height - 34} />
      </div>
      <div className="font-mono text-[8.5px] text-white/50">{L.gainDb > 0 ? '+' : ''}{L.gainDb.toFixed(1)} dB</div>
      <button
        onClick={() => amboAudio.setLiveIn({ enabled: !L.enabled })}
        className={`w-full h-5 rounded text-[8.5px] font-black ${status.on ? 'bg-[#F5C542] text-black' : L.enabled ? 'bg-[#F5C542]/30 text-[#F5C542]' : 'bg-white/10 text-white/60'}`}
        title={status.on ? `Listening: ${status.label ?? 'input'}` : 'Open the input (asks for microphone permission the first time)'}
      >{status.on ? 'LISTENING' : L.enabled ? 'OPENING…' : 'ENABLE'}</button>
      {status.error && <div className="text-[8px] text-[#FF5A5F] text-center leading-tight">{status.error}</div>}
    </div>
  );
};

const VIZ_FOLLOW: Array<{ id: VizFollow; label: string; hint: string }> = [
  { id: 'mix', label: 'Program', hint: 'Visuals react to what Ambo is playing' },
  { id: 'live', label: 'Live in', hint: 'Visuals react to the live input only (the band, the room)' },
  { id: 'both', label: 'Both', hint: 'Visuals react to the program mix and the live input together' },
];

export const AmboMixer: React.FC = () => {
  const st = useSyncExternalStore(amboAudio.subscribe, amboAudio.getSnapshot);
  const busState = useAudioBus();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<StripId>('master');
  const [fileId, setFileId] = useState<string | null>(null);
  const [gr, setGr] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (open) amboAudio.ensure(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setGr(amboAudio.limiterReduction()), 100);
    return () => clearInterval(id);
  }, [open]);

  const curTrack = busState.queue[busState.index];
  const editFile = (fileId && busState.queue.find(t => t.id === fileId)) || curTrack || null;
  const M = st.master;
  const STRIP_H = 150;

  const strip = (id: StripId) => {
    const isMaster = id === 'master';
    const meta = AMBO_CHANNELS.find(c => c.id === id);
    const cs = isMaster ? null : st.channels[id as AmboChannelId];
    const nFx = isMaster ? M.inserts.filter(i => i.on).length : cs!.inserts.filter(i => i.on).length;
    const fileFx = id === 'playlist' && curTrack ? amboAudio.fileFxFor(curTrack.id).filter(i => i.on).length : 0;
    return (
      <div
        key={id}
        onClick={() => setSel(id)}
        className={`flex flex-col items-center gap-1.5 px-1.5 py-2 rounded-lg border cursor-pointer transition-all ${sel === id ? 'border-[#D0BCFF]/60 bg-[#D0BCFF]/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'} ${isMaster ? 'w-[92px]' : 'w-[78px]'}`}
      >
        <div className="text-[9.5px] font-bold truncate w-full text-center" style={{ color: isMaster ? '#fff' : meta?.color }}>{isMaster ? 'MASTER' : meta?.label}</div>
        <div className="flex items-center gap-1 text-[8px] font-mono">
          <span className={`px-1 rounded ${nFx ? 'bg-[#D0BCFF]/25 text-[#D0BCFF]' : 'bg-white/5 text-white/35'}`} title="Insert plugins">FX {nFx}</span>
          {id === 'playlist' && <span className={`px-1 rounded ${fileFx ? 'bg-[#2BE0A8]/25 text-[#2BE0A8]' : 'bg-white/5 text-white/35'}`} title="Plugins on the playing file">FILE {fileFx}</span>}
        </div>
        {!isMaster && (
          <input type="range" min={-1} max={1} step={0.01} value={cs!.pan}
            onChange={e => amboAudio.setChannel(id as AmboChannelId, { pan: Number(e.target.value) })}
            onDoubleClick={() => amboAudio.setChannel(id as AmboChannelId, { pan: 0 })}
            onClick={e => e.stopPropagation()}
            className="w-full accent-white/70 h-1" title={`Pan ${cs!.pan === 0 ? 'C' : cs!.pan < 0 ? `L${Math.round(-cs!.pan * 100)}` : `R${Math.round(cs!.pan * 100)}`} · double-click to centre`} />
        )}
        {isMaster && (
          <div className="w-full flex items-center gap-1" title="Peak limiter gain reduction">
            <span className="text-[7.5px] font-mono text-white/40">GR</span>
            <div className="flex-1 h-1.5 rounded bg-white/10 overflow-hidden"><div className="h-full bg-[#F5C542]" style={{ width: `${Math.min(100, gr * 8)}%` }} /></div>
          </div>
        )}
        <div className="flex items-end gap-1.5" onClick={e => e.stopPropagation()}>
          <VFader value={isMaster ? M.gainDb : cs!.gainDb} height={STRIP_H}
            onChange={db => isMaster ? amboAudio.setMaster({ gainDb: db }) : amboAudio.setChannel(id as AmboChannelId, { gainDb: db })} />
          <Meter id={id} height={STRIP_H} />
        </div>
        <div className="font-mono text-[8.5px] text-white/50">{(isMaster ? M.gainDb : cs!.gainDb) <= -60 ? '-∞' : `${(isMaster ? M.gainDb : cs!.gainDb).toFixed(1)} dB`}</div>
        {!isMaster ? (
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            <button onClick={() => amboAudio.setChannel(id as AmboChannelId, { mute: !cs!.mute })} className={`w-6 h-5 rounded text-[9px] font-black ${cs!.mute ? 'bg-[#FF5A5F] text-black' : 'bg-white/10 text-white/60'}`} title="Mute">M</button>
            <button onClick={() => amboAudio.setChannel(id as AmboChannelId, { solo: !cs!.solo })} className={`w-6 h-5 rounded text-[9px] font-black ${cs!.solo ? 'bg-[#F5C542] text-black' : 'bg-white/10 text-white/60'}`} title="Solo">S</button>
          </div>
        ) : (
          <button onClick={e => { e.stopPropagation(); amboAudio.setLimiter({ on: !M.limiter.on }); }}
            className={`px-1.5 h-5 rounded text-[8.5px] font-black ${M.limiter.on ? 'bg-[#2BE0A8] text-black' : 'bg-white/10 text-white/60'}`}
            title="Peak limiter on the master — keeps the PA and stream from clipping">LIMIT</button>
        )}
      </div>
    );
  };

  // Same rule as Fabula's MASTERING row: an era presses (and turns it on);
  // an engineer alone is remembered until an era is chosen.
  const pressing = (patch: Partial<typeof M.mastering>) => {
    const base = M.mastering || defaultMastering();
    const merged = { ...base, ...patch };
    const era = eraById(merged.eraId);
    amboAudio.setMaster({ mastering: era ? { ...applyEra(merged, era, base.authenticity ?? 0.7), on: true } : merged });
  };

  const detail = () => {
    if (sel === 'master') {
      return (
        <div className="flex flex-col gap-2 min-h-0">
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1 text-white/50 font-extrabold uppercase tracking-wider text-[9px]"><ShieldCheck size={11} className="text-[#2BE0A8]" /> Peak limiter</span>
            <label className="flex items-center gap-1 text-white/70">Ceiling
              <input type="range" min={-6} max={0} step={0.1} value={M.limiter.ceiling} onChange={e => amboAudio.setLimiter({ ceiling: Number(e.target.value) })} className="w-20 accent-[#2BE0A8] h-1" />
              <span className="font-mono w-10">{M.limiter.ceiling.toFixed(1)}</span></label>
            <label className="flex items-center gap-1 text-white/70">Release
              <input type="range" min={10} max={500} step={5} value={M.limiter.release} onChange={e => amboAudio.setLimiter({ release: Number(e.target.value) })} className="w-16 accent-[#2BE0A8] h-1" />
              <span className="font-mono w-10">{M.limiter.release}ms</span></label>
            <label className="flex items-center gap-1 text-white/70">Drive
              <input type="range" min={0} max={12} step={0.5} value={M.limiter.gain} onChange={e => amboAudio.setLimiter({ gain: Number(e.target.value) })} className="w-16 accent-[#2BE0A8] h-1" />
              <span className="font-mono w-8">{M.limiter.gain}dB</span></label>
            <select value={M.limiter.character} onChange={e => amboAudio.setLimiter({ character: Number(e.target.value) })} className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white/80">
              <option value={0}>Transparent</option><option value={1}>Glue</option><option value={2}>Loud</option>
            </select>
            <span className="font-mono text-[#F5C542]">GR {gr.toFixed(1)} dB</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1 text-white/50 font-extrabold uppercase tracking-wider text-[9px]"><Disc3 size={11} className="text-[#D0BCFF]" /> Pressing</span>
            <select value={M.mastering.eraId || ''} onChange={e => pressing({ eraId: e.target.value })} className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white/80">
              <option value="" disabled>Era…</option>
              {ERA_PROFILES.map(e => <option key={e.id} value={e.id}>{e.year} · {e.label}</option>)}
            </select>
            <select value={M.mastering.engineerId || ''} onChange={e => pressing({ engineerId: e.target.value })} className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white/80">
              <option value="">No engineer</option>
              {ENGINEERS.map(en => <option key={en.id} value={en.id}>{en.name} — {en.style}</option>)}
            </select>
            <button onClick={() => amboAudio.setMaster({ mastering: { ...M.mastering, on: !M.mastering.on } })} className={`px-1.5 py-0.5 rounded font-bold ${M.mastering.on ? 'bg-[#D0BCFF] text-black' : 'bg-white/10 text-white/60'}`}>{M.mastering.on ? 'PRESS ON' : 'PRESS OFF'}</button>
            <button onClick={() => amboAudio.setMaster({ eq: M.eq.on ? { ...M.eq, on: false } : { ...defaultSpectra(), on: true } })} className={`px-1.5 py-0.5 rounded font-bold ${M.eq.on ? 'bg-[#00DAF3] text-black' : 'bg-white/10 text-white/60'}`}>{M.eq.on ? 'MASTER EQ ON' : 'MASTER EQ OFF'}</button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 min-h-0 flex-1">
            <div className="min-h-0 overflow-auto rounded-lg border border-white/10 bg-black/30">
              <MeterBridge tap={amboAudio.masterMeterTap} />
            </div>
            <div className="min-h-0 overflow-auto">
              <FxRack instances={M.inserts} onChange={next => amboAudio.setMaster({ inserts: next })} title="MASTER INSERTS" emptyHint="Add a master plugin — the same rack Melos Studio uses" />
            </div>
          </div>
        </div>
      );
    }
    const id = sel as AmboChannelId;
    const meta = AMBO_CHANNELS.find(c => c.id === id)!;
    return (
      <div className={`grid gap-2 min-h-0 ${id === 'playlist' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="min-h-0 overflow-auto">
          <FxRack key={id} instances={st.channels[id].inserts} accent={meta.color}
            onChange={next => amboAudio.setChannel(id, { inserts: next })}
            title={`${meta.label.toUpperCase()} · CHANNEL INSERTS`} emptyHint="Plugins on everything this channel plays" />
        </div>
        {id === 'playlist' && (
          <div className="min-h-0 overflow-auto flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[9.5px]">
              <AudioLines size={11} className="text-[#2BE0A8]" />
              <span className="text-white/50 font-extrabold uppercase tracking-wider text-[9px]">File plugins</span>
              <select value={editFile?.id || ''} onChange={e => setFileId(e.target.value)} className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white/80 text-[10px]">
                {!busState.queue.length && <option value="">Queue a song first</option>}
                {busState.queue.map((t, i) => <option key={`${t.id}_${i}`} value={t.id}>{i === busState.index ? '▶ ' : ''}{t.title}</option>)}
              </select>
            </div>
            {editFile ? (
              <FxRack key={editFile.id} instances={amboAudio.fileFxFor(editFile.id)} accent="#2BE0A8"
                onChange={next => amboAudio.setFileFx(editFile.id, next)}
                title={`FILE · ${editFile.title}`} emptyHint="Plugins saved on this file — they follow it into any playlist or queue" />
            ) : <div className="text-[10px] text-white/40 p-2">Queue a song to add plugins to it.</div>}
          </div>
        )}
      </div>
    );
  };

  const panel = open ? createPortal(
    <div className="fixed left-3 right-3 bottom-16 z-[9990] rounded-xl border shadow-2xl flex flex-col"
      style={{ height: 'min(560px, 70vh)', background: 'rgba(12,9,20,0.98)', borderColor: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(14px)' }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <SlidersHorizontal size={14} className="text-[#D0BCFF]" />
        <div className="text-[11px] font-bold text-white">Ambo Mixer</div>
        <div className="text-[9.5px] text-white/40">Same audio device, plugins and meters as Chora, DJ mode, Melos and Fabula</div>
        {busState.unmetered && <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold text-[#F5C542] bg-[#F5C542]/15" title="This song's host blocks cross-origin audio, so it plays directly — no meters, plugins or visualizer reaction">PLAYLIST SONG UNMETERED</span>}
        {!amboAudio.isRunning() && <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold text-white/60 bg-white/10">Audio starts on first click</span>}
        <div className="flex-1" />
        <button onClick={() => setOpen(false)} className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10" aria-label="Close mixer"><X size={13} /></button>
      </div>
      <div className="flex-1 min-h-0 flex gap-3 p-3">
        <div className="flex gap-1.5 flex-none">
          {AMBO_CHANNELS.map(c => strip(c.id))}
          <div className="w-px bg-white/10 mx-1" />
          {strip('master')}
          <div className="w-px bg-white/10 mx-1" />
          <div className="flex flex-col gap-1.5">
            <LiveInStrip height={STRIP_H + 30} />
            <div className="flex flex-col gap-0.5" title="What the visualizers listen to">
              <div className="text-[7.5px] font-extrabold uppercase tracking-wider text-white/40 text-center">Visuals follow</div>
              <div className="flex rounded-md border border-white/10 overflow-hidden">
                {VIZ_FOLLOW.map(v => (
                  <button key={v.id} onClick={() => amboAudio.setVizFollow(v.id)} title={v.hint}
                    className={`flex-1 px-1 py-0.5 text-[8.5px] font-bold ${st.vizFollow === v.id ? 'bg-[#D0BCFF] text-black' : 'text-white/60 hover:bg-white/10'}`}>{v.label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-wider text-white/40">
            <Plug size={11} /> {sel === 'master' ? 'Master section' : `${AMBO_CHANNELS.find(c => c.id === sel)?.label} plugins`}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">{detail()}</div>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        className={`px-2 py-1 rounded text-[9.5px] font-bold border flex items-center gap-1 ${open ? 'text-[#D0BCFF] bg-[#D0BCFF]/15 border-[#D0BCFF]/30' : 'text-white/70 bg-white/5 border-white/10 hover:bg-white/15'}`}
        title="Ambo mixer — channels, plugins, meters, limiter"
      >
        <SlidersHorizontal size={11} /> Mixer
      </button>
      {panel}
    </>
  );
};

export default AmboMixer;
