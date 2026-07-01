import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Video, Radio, Cctv, Plus, Lock, Unlock, Save, Zap, Cpu, X,
  MonitorPlay, Camera, Wifi, AlertTriangle,
} from 'lucide-react';
import { MediaEngine, EngineState } from '../../services/mediaEngine/engine';
import { WebcamSource } from '../../services/mediaEngine/browserSources';
import { unavailableReason } from '../../services/mediaEngine/capabilities';
import { SourceKind, KIND_LABEL, NATIVE_ONLY, TransitionType, MasterClock } from '../../services/mediaEngine/types';

interface Props { onBack: () => void }

const KIND_COLOR: Record<SourceKind, string> = {
  decklink: '#e8b84b', ndi: '#7c9ce8', srt: '#e88a4b', rtmp: '#e0685b',
  webrtc: '#c47ce0', uvc: '#3f9e74', file: '#8c7f6c', braw: '#d94b3f',
};
const PGM = '#EF4444', PVW = '#10B981', GOLD = '#F59E0B';
const TRANSITIONS: TransitionType[] = ['cut', 'mix', 'dip', 'wipe', 'dve'];

/** A small live-thumbnail (or placeholder) for a source stream. */
const Thumb: React.FC<{ stream?: MediaStream | null; size?: number; muted?: boolean }> = ({ stream, size = 40, muted = true }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && stream) { ref.current.srcObject = stream; ref.current.play().catch(() => {}); } }, [stream]);
  return stream
    ? <video ref={ref} muted={muted} playsInline className="object-cover rounded bg-black" style={{ width: size, height: size * 0.5625 }} />
    : <div className="rounded bg-white/[0.04] border border-white/10 flex items-center justify-center" style={{ width: size, height: size * 0.5625 }}><Video size={12} className="text-white/20" /></div>;
};

const VideoRouterConsole: React.FC<Props> = ({ onBack }) => {
  const engineRef = useRef<MediaEngine | null>(null);
  if (!engineRef.current) engineRef.current = new MediaEngine();
  const engine = engineRef.current;

  const [state, setState] = useState<EngineState>(engine.getState());
  const [addOpen, setAddOpen] = useState(false);
  const [cameras, setCameras] = useState<{ deviceId: string; label: string }[]>([]);
  const [whepUrl, setWhepUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => engine.subscribe(setState), [engine]);
  useEffect(() => () => engine.dispose(), [engine]);

  const { caps, router, switcher, sync } = state;
  const swInputs = router.destinations.filter(d => d.kind === 'switcherInput');
  const srcById = (id?: string) => router.sources.find(s => s.id === id);
  const pgmSrc = srcById(router.routes[switcher.program]);
  const pvwSrc = srcById(router.routes[switcher.preview]);

  const openAdd = async () => { setErr(''); setAddOpen(true); setCameras(await WebcamSource.listCameras()); };

  const addCam = async (deviceId?: string, label?: string) => {
    setBusy('cam'); setErr('');
    try { await engine.addWebcam(deviceId, label); setAddOpen(false); }
    catch (e: any) { setErr(e?.message || 'Could not open camera (permission?).'); }
    finally { setBusy(''); }
  };
  const addWhep = async () => {
    if (!whepUrl.trim()) return;
    setBusy('whep'); setErr('');
    try { await engine.addWhep(whepUrl.trim()); setWhepUrl(''); setAddOpen(false); }
    catch (e: any) { setErr(e?.message || 'WHEP subscribe failed.'); }
    finally { setBusy(''); }
  };

  const sectionLabel = (t: string, color = 'text-white/40') => (
    <p className={`text-[9px] font-black uppercase tracking-[0.25em] ${color} mb-2`}>{t}</p>
  );

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-[#0a0a0c] text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0c]/90 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"><ArrowLeft size={16} /></button>
          <div className="flex items-center gap-2">
            <Cctv size={16} className="text-[#F59E0B]" />
            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/70">Plajah Studio · Router &amp; Switcher</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-4 text-[10px] font-mono">
            <span style={{ color: PGM }}>● PGM {pgmSrc?.label || '—'}</span>
            <span style={{ color: PVW }}>● PVW {pvwSrc?.label || '—'}</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-7">
        {/* Capability banner */}
        <div className="flex items-center gap-2 text-[10px] text-white/45 bg-white/[0.03] border border-white/8 rounded-xl px-3 py-2">
          <Cpu size={13} className="text-white/40 shrink-0" />
          <span>
            Host: <b className="text-white/70">{caps.host}</b> ({caps.platform}) · Available sources: {Object.entries(caps.sources).filter(([, v]) => v).map(([k]) => KIND_LABEL[k as SourceKind]).join(', ')}.
            {caps.host === 'browser' && ' Capture cards, NDI, SRT & BRAW need the desktop/mobile app.'}
          </span>
        </div>

        {/* Program preview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[{ label: 'Program', src: pgmSrc, accent: PGM }, { label: 'Preview', src: pvwSrc, accent: PVW }].map(({ label, src, accent }) => (
            <div key={label} className="rounded-2xl overflow-hidden border" style={{ borderColor: `${accent}55` }}>
              <div className="px-3 py-1.5 flex items-center justify-between" style={{ background: `${accent}18` }}>
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: accent }}>{label}</span>
                <span className="text-[10px] font-bold text-white/70">{src?.label || '—'}</span>
              </div>
              <div className="aspect-video bg-black flex items-center justify-center">
                {src?.stream ? <Thumb stream={src.stream} size={640} muted={label !== 'Program'} /> : <MonitorPlay size={26} className="text-white/15" />}
              </div>
            </div>
          ))}
        </div>

        {/* Switcher bus */}
        <div>
          {sectionLabel('Switcher · Program / Preview')}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2.5">
            {(['program', 'preview'] as const).map(bus => {
              const isPgm = bus === 'program';
              const accent = isPgm ? PGM : PVW;
              const sel = isPgm ? switcher.program : switcher.preview;
              const setSel = isPgm ? (d: string) => engine.setProgram(d) : (d: string) => engine.setPreview(d);
              return (
                <div key={bus} className="flex items-center gap-2">
                  <span className="font-mono text-[9px] w-9" style={{ color: accent }}>{isPgm ? 'PGM' : 'PVW'}</span>
                  <div className="flex gap-2 flex-1">
                    {swInputs.map(d => {
                      const on = sel === d.id;
                      const src = srcById(router.routes[d.id]);
                      return (
                        <button key={d.id} onClick={() => setSel(d.id)} className="flex-1 rounded-lg px-2 py-2 border-2 transition-all text-left"
                          style={{ borderColor: on ? accent : 'rgba(255,255,255,0.1)', background: on ? accent : 'rgba(255,255,255,0.03)', color: on ? '#0a0a0c' : '#fff' }}>
                          <div className="font-mono text-[8px] opacity-80">{d.label}</div>
                          <div className="font-black text-[12px] truncate">{src?.label || '—'}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-2 pt-3 mt-1 border-t border-white/8 flex-wrap">
              <span className="font-mono text-[9px] text-white/40">TRANSITION</span>
              {TRANSITIONS.map(tx => (
                <button key={tx} onClick={() => engine.setTransition(tx)} className="px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider border transition-all"
                  style={{ borderColor: switcher.transition.type === tx ? GOLD : 'rgba(255,255,255,0.1)', background: switcher.transition.type === tx ? 'rgba(245,158,11,0.12)' : 'transparent' }}>{tx}</button>
              ))}
              <div className="flex-1" />
              <button onClick={() => engine.take()} className="px-7 py-2.5 rounded-lg font-mono text-[11px] font-black uppercase tracking-[0.12em] text-white" style={{ background: PGM }}>Take</button>
            </div>
          </div>
        </div>

        {/* Router matrix */}
        <div>
          <div className="flex items-center justify-between mb-2">
            {sectionLabel('Router · Crosspoint Matrix', 'text-[#F59E0B]')}
            <div className="flex items-center gap-2">
              <button onClick={() => engine.saveSalvo(`Salvo ${router.salvos.length + 1}`)} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors"><Save size={11} /> Save salvo</button>
              <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-[9px] font-black uppercase tracking-widest hover:bg-white/90 transition-all"><Plus size={12} /> Add source</button>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 overflow-x-auto">
            {router.sources.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-3 text-center">
                <Camera size={20} className="text-white/20" />
                <p className="text-[11px] text-white/40 max-w-xs leading-relaxed">No sources yet. Add a webcam or a remote WHEP guest to start routing — capture cards & NDI appear here in the desktop app.</p>
                <button onClick={openAdd} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white"><Plus size={12} /> Add a source</button>
              </div>
            ) : (
              <div className="min-w-[640px]">
                {/* header */}
                <div className="grid gap-1.5 mb-2" style={{ gridTemplateColumns: `170px repeat(${router.destinations.length}, 1fr)` }}>
                  <div className="font-mono text-[8px] text-white/30 self-end uppercase tracking-wider">src ╲ dest</div>
                  {router.destinations.map(d => {
                    const isPgm = d.id === switcher.program, isPvw = d.id === switcher.preview;
                    const locked = router.locks[d.id];
                    return (
                      <button key={d.id} onClick={() => engine.toggleLock(d.id)} title={locked ? 'Unlock destination' : 'Lock destination'}
                        className="text-center font-mono text-[9px] font-bold py-1.5 rounded border transition-all flex items-center justify-center gap-1"
                        style={{ color: isPgm ? PGM : isPvw ? PVW : '#c9bca8', borderColor: isPgm ? PGM : isPvw ? PVW : 'transparent' }}>
                        {d.label}{locked ? <Lock size={8} /> : ''}
                      </button>
                    );
                  })}
                </div>
                {/* rows */}
                {router.sources.map(s => (
                  <div key={s.id} className="grid gap-1.5 mb-1.5 items-center" style={{ gridTemplateColumns: `170px repeat(${router.destinations.length}, 1fr)` }}>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03] border" style={{ borderColor: s.tally === 'program' ? PGM : s.tally === 'preview' ? PVW : 'rgba(255,255,255,0.1)' }}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.tally === 'program' ? PGM : s.tally === 'preview' ? PVW : '#6b6b6b' }} />
                      <Thumb stream={s.stream} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[12px] truncate leading-tight">{s.label}</div>
                        <div className="font-mono text-[8px] tracking-wide" style={{ color: KIND_COLOR[s.kind] }}>{KIND_LABEL[s.kind].toUpperCase()}</div>
                      </div>
                      <button onClick={() => engine.removeSource(s.id)} className="text-white/20 hover:text-white/60 transition-colors"><X size={12} /></button>
                    </div>
                    {router.destinations.map(d => {
                      const active = router.routes[d.id] === s.id;
                      const accent = d.id === switcher.program ? PGM : d.id === switcher.preview ? PVW : GOLD;
                      return (
                        <button key={d.id} onClick={() => engine.route(d.id, s.id)} disabled={router.locks[d.id]}
                          className="h-9 rounded border font-mono text-[12px] font-black transition-all disabled:opacity-40"
                          style={{ borderColor: active ? accent : 'rgba(255,255,255,0.1)', background: active ? accent : '#0a0a0c', color: active ? '#0a0a0c' : 'transparent' }}>
                          {active ? '●' : ''}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            {router.salvos.length > 0 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/8 flex-wrap">
                <span className="font-mono text-[9px] text-white/40">SALVOS</span>
                {router.salvos.map(sv => (
                  <button key={sv.id} onClick={() => engine.recallSalvo(sv.id)} className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-[10px] font-bold hover:bg-white/12 transition-all">{sv.name}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* TBC / Sync */}
        <div>
          {sectionLabel('Virtual Time Base Corrector · Sync', 'text-[#F59E0B]')}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex gap-6 flex-wrap items-center pb-3.5 mb-3.5 border-b border-white/8">
              <div>
                <div className="font-mono text-[9px] text-white/40 mb-1.5">MASTER CLOCK</div>
                <div className="flex gap-1.5">
                  {(['hw-ref', 'ptp', 'soft'] as MasterClock[]).map(v => {
                    const dis = v === 'hw-ref' && !caps.hardwareGenlock;
                    return (
                      <button key={v} onClick={() => !dis && engine.setMasterClock(v)} disabled={dis} title={dis ? 'Hardware reference needs a capture card (desktop)' : ''}
                        className="px-3 py-1.5 rounded-lg font-mono text-[10px] border transition-all disabled:opacity-30"
                        style={{ borderColor: sync.masterClock === v ? GOLD : 'rgba(255,255,255,0.1)', background: sync.masterClock === v ? 'rgba(245,158,11,0.12)' : 'transparent' }}>
                        {v === 'hw-ref' ? 'HW Ref' : v.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 min-w-[220px]">
                <div className="font-mono text-[9px] text-white/40 mb-1.5">SYNC TARGET · {sync.syncTargetMs} ms</div>
                <input type="range" min={250} max={2000} step={50} value={sync.syncTargetMs} onChange={e => engine.setSyncTarget(+e.target.value)} className="w-full" style={{ accentColor: GOLD }} />
                <div className="font-mono text-[8px] text-white/30 mt-1">Faster sources are delayed to meet the slowest within this window (soft-sync).</div>
              </div>
            </div>
            {router.sources.length === 0 ? (
              <p className="text-[10px] text-white/30 font-mono py-2">Add sources to see per-input latency & sync health.</p>
            ) : router.sources.map(s => {
              const h = sync.perSource[s.id];
              const hc = h?.health === 'ok' ? PVW : h?.health === 'jitter' ? GOLD : PGM;
              return (
                <div key={s.id} className="grid items-center gap-3 py-2 border-b border-white/6" style={{ gridTemplateColumns: '140px 1fr 90px 70px' }}>
                  <span className="font-bold text-[12px] truncate">{s.label} <span className="font-mono text-[8px]" style={{ color: KIND_COLOR[s.kind] }}>{KIND_LABEL[s.kind]}</span></span>
                  <div className="h-2 rounded-full bg-black border border-white/10 overflow-hidden"><div style={{ width: `${Math.min(100, (s.latencyMs / 2000) * 100)}%`, height: '100%', background: hc }} /></div>
                  <span className="font-mono text-[10px] text-white/50">{s.latencyMs} ms in</span>
                  <span className="font-mono text-[9px] uppercase" style={{ color: hc }}>{h?.health || 'ok'}</span>
                </div>
              );
            })}
            <div className="font-mono text-[9px] text-white/30 mt-3 leading-relaxed">
              Soft-sync aligns sources inside the window; anything slower than the target shows <span style={{ color: PGM }}>starved</span> and needs a bigger budget or hardware genlock. True frame-accuracy comes from HW Ref / PTP on capable inputs (desktop app).
            </div>
          </div>
        </div>
      </div>

      {/* Add-source modal */}
      {addOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setAddOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-md bg-[#0c0c0e] border border-white/12 rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
              <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/70">Add source</span>
              <button onClick={() => setAddOpen(false)} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white"><X size={15} /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div>
                <div className="flex items-center gap-1.5 mb-2"><Camera size={13} className="text-[#3f9e74]" /><span className="text-[9px] font-black uppercase tracking-widest text-white/50">Webcam</span></div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => addCam()} disabled={busy === 'cam'} className="px-3 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-[11px] font-bold hover:bg-white/12 transition-all disabled:opacity-50">{busy === 'cam' ? 'Opening…' : 'Default camera'}</button>
                  {cameras.map(c => <button key={c.deviceId} onClick={() => addCam(c.deviceId, c.label)} disabled={busy === 'cam'} className="px-3 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-[11px] font-bold hover:bg-white/12 transition-all disabled:opacity-50 truncate max-w-[180px]">{c.label}</button>)}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-2"><Wifi size={13} className="text-[#c47ce0]" /><span className="text-[9px] font-black uppercase tracking-widest text-white/50">Remote guest (WHEP)</span></div>
                <div className="flex gap-2">
                  <input value={whepUrl} onChange={e => setWhepUrl(e.target.value)} placeholder="https://relay.plajah…/whep/endpoint" className="flex-1 bg-white/[0.05] border border-white/12 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-white/30" />
                  <button onClick={addWhep} disabled={busy === 'whep' || !whepUrl.trim()} className="px-4 py-2 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40">{busy === 'whep' ? '…' : 'Add'}</button>
                </div>
                <p className="text-[9px] text-white/30 mt-1.5">A Blackmagic Camera / SRT feed via a MediaMTX WHEP endpoint.</p>
              </div>
              {/* Native kinds — shown disabled with an honest reason */}
              <div className="pt-1 border-t border-white/8">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Native inputs</span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {NATIVE_ONLY.map(k => (
                    <span key={k} title={unavailableReason(k, caps) || ''} className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-dashed border-white/10 text-[9px] font-bold text-white/25 flex items-center gap-1">
                      <AlertTriangle size={9} /> {KIND_LABEL[k]}
                    </span>
                  ))}
                </div>
              </div>
              {err && <p className="text-[11px] text-[#EF4444] font-bold">{err}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoRouterConsole;
