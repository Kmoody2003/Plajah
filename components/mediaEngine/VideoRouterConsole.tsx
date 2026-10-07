import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Video, Radio, Cctv, Plus, Lock, Unlock, Save, Zap, Cpu, X,
  MonitorPlay, Camera, Wifi, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { MediaEngine, EngineState, AutoDirectorMode } from '../../services/mediaEngine/engine';
import { AutoDirector } from '../../services/mediaEngine/autoDirector';
import { downloadBlob } from '../../services/mediaEngine/programRecorder';
import { WebcamSource } from '../../services/mediaEngine/browserSources';
import { unavailableReason } from '../../services/mediaEngine/capabilities';
import { SourceKind, KIND_LABEL, NATIVE_ONLY, TransitionType, MasterClock, PROGRAM_SOURCE_ID } from '../../services/mediaEngine/types';
import { NativeSourceInfo, getNdiStatus } from '../../services/mediaEngine/bridge';
import { SwitcherRouterReceiver } from './SwitcherRouterReceiver';

interface Props {
  onBack: () => void;
  /** Drive an engine owned elsewhere (Sports Director's "Open in Control Room"). The console
   *  then never disposes it — closing the console leaves the production running. */
  engine?: MediaEngine;
  /** Shown in the header when embedded (e.g. the production's title). */
  contextLabel?: string;
}

const KIND_COLOR: Record<SourceKind, string> = {
  decklink: '#e8b84b', ndi: '#7c9ce8', omt: '#06b6d4', srt: '#e88a4b', avb: '#a855f7', rtmp: '#e0685b',
  webrtc: '#c47ce0', uvc: '#3f9e74', file: '#8c7f6c', braw: '#d94b3f',
  ambo: '#38bdf8', switcher: '#f43f5e',
};
const PGM = '#EF4444', PVW = '#10B981', GOLD = '#F59E0B';
const TRANSITIONS: TransitionType[] = ['cut', 'mix', 'dip', 'wipe', 'dve'];

/** A full-bleed monitor layer. Always muted — monitoring a local mic through the speakers
 *  feeds back; audio monitoring belongs to the audio path, not the picture monitors. */
const MonitorLayer: React.FC<{ stream?: MediaStream | null; style?: React.CSSProperties }> = ({ stream, style }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream ?? null;
    if (stream) v.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} muted playsInline className="absolute inset-0 w-full h-full object-contain" style={style} />;
};

/** Mounts the program compositor's canvas — the monitor IS the output, pixel for pixel. */
const ProgramCanvas: React.FC<{ canvas: HTMLCanvasElement | null }> = ({ canvas }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || !canvas) return;
    canvas.className = 'absolute inset-0 w-full h-full object-contain';
    host.appendChild(canvas);
    return () => { if (canvas.parentElement === host) host.removeChild(canvas); };
  }, [canvas]);
  return <div ref={ref} className="absolute inset-0" />;
};

const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** RECORD + STREAM — the two outputs that leave the building. */
const OutputsPanel: React.FC<{ engine: MediaEngine; state: EngineState }> = ({ engine, state }) => {
  const { recording, live, lastRecording } = state.outputs;
  const [, setTick] = useState(0);
  const [target, setTarget] = useState<'plajah' | 'whip'>('plajah');
  const [title, setTitle] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [whipUrl, setWhipUrl] = useState('');
  const [whipToken, setWhipToken] = useState('');
  const [saving, setSaving] = useState<'' | 'saving' | 'saved' | 'failed'>('');

  useEffect(() => {
    if (!recording.active && !live.active) return;
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [recording.active, live.active]);

  const routeLabel = (destId: string) => {
    const r = state.router.routes[destId];
    return !r || r === PROGRAM_SOURCE_ID ? 'Program' : state.router.sources.find(s => s.id === r)?.label || r;
  };

  const saveToReello = async () => {
    if (!lastRecording) return;
    setSaving('saving');
    try {
      const { saveSessionRecording } = await import('../../services/liveStreamService');
      const r = await saveSessionRecording({
        blob: lastRecording.blob,
        title: title.trim() || `Program recording ${new Date(lastRecording.at).toLocaleString()}`,
        durationSec: lastRecording.durationSec,
        isPrivate: true, // lands private — publish from Reello when it's ready
      });
      setSaving(r ? 'saved' : 'failed');
    } catch { setSaving('failed'); }
  };

  const goLive = () => {
    if (target === 'plajah') engine.goLive({ kind: 'plajah', title: title.trim() || 'Live from Plajah Studio', isPublic });
    else if (whipUrl.trim()) engine.goLive({ kind: 'whip', url: whipUrl.trim(), bearer: whipToken.trim() || undefined });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* RECORD */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Record · {routeLabel('record')}</span>
          {recording.active && <span className="font-mono text-[11px]" style={{ color: PGM }}>● {fmtDur(Date.now() - (recording.startedAt || Date.now()))}</span>}
        </div>
        <button
          onClick={() => (recording.active ? engine.stopRecording() : engine.startRecording())}
          className="w-full py-2.5 rounded-xl font-mono text-[11px] font-black uppercase tracking-[0.12em] border transition-all"
          style={recording.active ? { background: PGM, borderColor: PGM, color: '#fff' } : { borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)' }}
        >
          {recording.active ? 'Stop recording' : 'Record'}
        </button>
        {recording.error && <p className="text-[10px]" style={{ color: PGM }}>{recording.error}</p>}
        {lastRecording && !recording.active && (
          <div className="flex items-center gap-2 flex-wrap text-[10px]">
            <span className="text-white/50 font-mono">Last take · {fmtDur(lastRecording.durationSec * 1000)} · {(lastRecording.blob.size / 1e6).toFixed(1)} MB</span>
            <div className="flex-1" />
            <button onClick={() => downloadBlob(lastRecording.blob, `plajah-program-${lastRecording.at}.webm`)} className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/12 font-bold hover:bg-white/12">Download</button>
            <button onClick={saveToReello} disabled={saving === 'saving' || saving === 'saved'} className="px-3 py-1.5 rounded-lg bg-white text-black font-bold disabled:opacity-50">
              {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved to Reello (private)' : saving === 'failed' ? 'Retry save' : 'Save to Reello'}
            </button>
          </div>
        )}
      </div>

      {/* STREAM */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Stream · {routeLabel('stream')}</span>
          {live.active && <span className="font-mono text-[11px]" style={{ color: PGM }}>● ON AIR {fmtDur(Date.now() - (live.startedAt || Date.now()))}</span>}
        </div>
        {!live.active ? (
          <>
            <div className="flex gap-1.5">
              {(['plajah', 'whip'] as const).map(t => (
                <button key={t} onClick={() => setTarget(t)} className="px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider border transition-all"
                  style={{ borderColor: target === t ? GOLD : 'rgba(255,255,255,0.1)', background: target === t ? 'rgba(245,158,11,0.12)' : 'transparent' }}>
                  {t === 'plajah' ? 'Plajah Live' : 'WHIP'}
                </button>
              ))}
            </div>
            {target === 'plajah' ? (
              <div className="flex gap-2 items-center">
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Stream title" className="flex-1 bg-white/[0.05] border border-white/12 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-white/30" />
                <label className="flex items-center gap-1.5 text-[10px] text-white/60 whitespace-nowrap">
                  <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} /> Listed
                </label>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={whipUrl} onChange={e => setWhipUrl(e.target.value)} placeholder="https://…/whip/endpoint" className="flex-1 bg-white/[0.05] border border-white/12 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-white/30" />
                <input value={whipToken} onChange={e => setWhipToken(e.target.value)} placeholder="Token (optional)" type="password" className="w-36 bg-white/[0.05] border border-white/12 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-white/30" />
              </div>
            )}
            <button onClick={goLive} disabled={live.starting || (target === 'whip' && !whipUrl.trim())}
              className="w-full py-2.5 rounded-xl font-mono text-[11px] font-black uppercase tracking-[0.12em] text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, var(--pj-magenta), var(--pj-orange))' }}>
              {live.starting ? 'Connecting…' : 'Go live'}
            </button>
            {target === 'plajah' && <p className="text-[9px] text-white/35">Goes out on Plajah Live with the program picture and program audio. RTMP to YouTube/Twitch needs the desktop app.</p>}
          </>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {live.watchUrl && <a href={live.watchUrl} target="_blank" rel="noreferrer" className="text-[11px] underline text-white/70 truncate max-w-[60%]">{live.watchUrl}</a>}
            <div className="flex-1" />
            <button onClick={() => engine.endLive()} className="px-4 py-2 rounded-xl font-mono text-[11px] font-black uppercase tracking-[0.12em] border border-white/15 bg-white/[0.06] hover:bg-white/12">End stream</button>
          </div>
        )}
        {live.error && <p className="text-[10px]" style={{ color: PGM }}>{live.error}</p>}
      </div>
    </div>
  );
};

/** A small live-thumbnail (or placeholder) for a source stream. */
const Thumb: React.FC<{ stream?: MediaStream | null; size?: number; muted?: boolean }> = ({ stream, size = 40, muted = true }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && stream) { ref.current.srcObject = stream; ref.current.play().catch(() => {}); } }, [stream]);
  return stream
    ? <video ref={ref} muted={muted} playsInline className="object-cover rounded bg-black" style={{ width: size, height: size * 0.5625 }} />
    : <div className="rounded bg-white/[0.04] border border-white/10 flex items-center justify-center" style={{ width: size, height: size * 0.5625 }}><Video size={12} className="text-white/20" /></div>;
};

const VideoRouterConsole: React.FC<Props> = ({ onBack, engine: externalEngine, contextLabel }) => {
  const engineRef = useRef<MediaEngine | null>(null);
  if (!engineRef.current) engineRef.current = externalEngine ?? new MediaEngine();
  const engine = engineRef.current;
  const ownsEngine = !externalEngine;

  const [state, setState] = useState<EngineState>(engine.getState());
  const [addOpen, setAddOpen] = useState(false);
  const [routerReceiverOpen, setRouterReceiverOpen] = useState(false);
  const [routerReceiverTarget, setRouterReceiverTarget] = useState<string>('sw1');
  const [cameras, setCameras] = useState<{ deviceId: string; label: string }[]>([]);
  const [whepUrl, setWhepUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [isScanningNdi, setIsScanningNdi] = useState(false);
  const [discoveredNdi, setDiscoveredNdi] = useState<NativeSourceInfo[]>([]);
  const [networkDiagnosis, setNetworkDiagnosis] = useState<string | null>(null);

  useEffect(() => engine.subscribe(setState), [engine]);
  useEffect(() => { engine.refreshNativeSources(); }, [engine]); // native capture/NDI when in the desktop app
  useEffect(() => () => { if (ownsEngine) engine.dispose(); }, [engine, ownsEngine]);
  // The program monitor shows the real composited output (same pixels that record / go live).
  useEffect(() => { engine.enableProgramOutput(); }, [engine]);

  // Smart Director's decision engine, pointed at this switcher (OFF / ASSIST / AUTO). An
  // embedding surface (Sports Director) may already have one attached — reuse it.
  const directorRef = useRef<AutoDirector | null>(null);
  const director = () => (directorRef.current ??= AutoDirector.for(engine));
  useEffect(() => () => { if (ownsEngine) { directorRef.current?.dispose(); directorRef.current = null; } }, [engine, ownsEngine]);

  const handleScanNdi = async () => {
    setIsScanningNdi(true);
    setErr('');
    try {
      const list = await engine.scanNetworkFeeds();            // NDI + OMT
      setDiscoveredNdi(list.filter(s => s.kind === 'ndi' || s.kind === 'omt'));
      setNetworkDiagnosis(list.some(s => s.kind === 'ndi') ? null : ((await getNdiStatus())?.diagnosis ?? null));
    } catch (e: any) {
      setErr(e?.message || 'NDI discovery scan encountered an issue.');
    } finally {
      setIsScanningNdi(false);
    }
  };

  const { caps, router, switcher, sync } = state;
  const swInputs = router.destinations.filter(d => d.kind === 'switcherInput');
  const srcById = (id?: string) => router.sources.find(s => s.id === id);
  const pgmSrc = srcById(router.routes[switcher.program]);
  const pvwSrc = srcById(router.routes[switcher.preview]);
  const { type: txType, position: txPos, rateFrames } = switcher.transition;
  const fps = sync.houseFormat.fps || 59.94;

  // Switcher keys: 1–9 cue an input to preview, Space = AUTO, Enter = CUT.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (addOpen || routerReceiverOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (tag === 'BUTTON') return; // let a focused button handle its own activation
        e.preventDefault();
        if (e.key === ' ') engine.auto(); else engine.cut();
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const inputs = engine.getState().router.destinations.filter(d => d.kind === 'switcherInput');
        const d = inputs[Number(e.key) - 1];
        if (d) engine.setPreview(d.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, addOpen, routerReceiverOpen]);

  const openAdd = async () => {
    setErr('');
    setAddOpen(true);
    setCameras(await WebcamSource.listCameras());
    handleScanNdi();
  };

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
    <div className="relative w-full h-full overflow-hidden bg-[#0a0a0c] text-white">
      {/* Brand wash — a quiet purple→magenta light over the black console. Decorative only;
          it never carries status (tally stays red/green). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            'radial-gradient(120% 75% at 0% 0%, color-mix(in srgb, var(--pj-purple) 18%, transparent) 0%, transparent 62%)',
            'radial-gradient(85% 60% at 100% 0%, color-mix(in srgb, var(--pj-magenta) 8%, transparent) 0%, transparent 65%)',
            'radial-gradient(110% 55% at 50% 115%, color-mix(in srgb, var(--pj-purple) 10%, transparent) 0%, transparent 70%)',
          ].join(', '),
        }}
      />
    <div className="relative w-full h-full overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0c]/70 backdrop-blur-md border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"><ArrowLeft size={16} /></button>
          <div className="flex items-center gap-2">
            <Cctv size={16} className="text-[#F59E0B]" />
            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/70">Plajah Studio · Router &amp; Switcher</span>
            {contextLabel && <span className="text-[10px] font-bold text-white/45 truncate max-w-[240px]">· {contextLabel}</span>}
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

        {/* Preview | Program monitors (preview left, program right — the switcher convention) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[{ label: 'Preview', src: pvwSrc, accent: PVW, pgm: false }, { label: 'Program', src: pgmSrc, accent: PGM, pgm: true }].map(({ label, src, accent, pgm }) => (
            <div key={label} className="rounded-2xl overflow-hidden border" style={{ borderColor: `${accent}55` }}>
              <div className="px-3 py-1.5 flex items-center justify-between" style={{ background: `${accent}18` }}>
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: accent }}>{pgm ? '● ' : '○ '}{label}</span>
                <span className="text-[10px] font-bold text-white/70">{src?.label || '—'}</span>
              </div>
              <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                {pgm && engine.programOutput
                  ? <ProgramCanvas canvas={engine.programOutput.canvas} />
                  : src?.stream
                    ? <MonitorLayer stream={src.stream} />
                    : <MonitorPlay size={26} className="text-white/15" />}
              </div>
            </div>
          ))}
        </div>

        {/* Switcher bus */}
        <div>
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            {sectionLabel('Switcher · Program / Preview')}
            <div className="flex items-center gap-2 flex-wrap" title="Smart Director's auto-director, driving this switcher. Any manual TAKE/CUT holds it off for 10 s.">
              <span className="font-mono text-[9px] text-white/40">AUTO-DIRECTOR</span>
              <div className="flex gap-1">
                {(['off', 'assist', 'auto'] as AutoDirectorMode[]).map(m => (
                  <button key={m} onClick={() => director().setMode(m)} aria-pressed={state.director.mode === m}
                    className="px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider border transition-all"
                    style={{ borderColor: state.director.mode === m ? GOLD : 'rgba(255,255,255,0.1)', background: state.director.mode === m ? 'rgba(245,158,11,0.12)' : 'transparent' }}>
                    {m}
                  </button>
                ))}
              </div>
              {state.director.mode !== 'off' && state.director.reason && (
                <span className="text-[10px] text-white/50 max-w-[260px] truncate">{state.director.reason}</span>
              )}
            </div>
            <button
              onClick={() => {
                setRouterReceiverTarget('sw1');
                setRouterReceiverOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/35 text-[#F59E0B] hover:bg-[#F59E0B]/25 text-[10px] font-black uppercase tracking-wider transition-all shadow-sm"
              title="Open video router selection receiver to route NDI, DeckLink, and platform feeds"
            >
              <Radio size={13} />
              <span>Router Selection Tool</span>
            </button>
          </div>
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
                        <div key={d.id} className="flex-1 relative group">
                          <button onClick={() => setSel(d.id)} className="w-full rounded-lg px-2 py-2 border-2 transition-all text-left"
                            style={{ borderColor: on ? accent : 'rgba(255,255,255,0.1)', background: on ? accent : 'rgba(255,255,255,0.03)', color: on ? '#0a0a0c' : '#fff' }}>
                            <div className="flex items-center justify-between">
                              <div className="font-mono text-[8px] opacity-80">{d.label}</div>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRouterReceiverTarget(d.id);
                                  setRouterReceiverOpen(true);
                                }}
                                title={`Route video source into ${d.label}`}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/20 text-[9px] cursor-pointer"
                              >
                                <Radio size={10} />
                              </span>
                            </div>
                            <div className="font-black text-[12px] truncate">{src?.label || '—'}</div>
                          </button>
                        </div>
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
              <label className="flex items-center gap-1.5 font-mono text-[9px] text-white/40" title="Transition length in frames at the house rate">
                RATE
                <input
                  type="number" min={1} max={300} value={rateFrames}
                  onChange={e => engine.setTransitionRate(+e.target.value || 1)}
                  className="w-14 bg-white/[0.05] border border-white/12 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-white/30"
                />
                <span className="text-white/30">{(rateFrames / fps).toFixed(2)}s</span>
              </label>
              <div className="flex-1" />
              <label className="flex items-center gap-2 font-mono text-[9px] text-white/40">
                T-BAR
                <input
                  type="range" min={0} max={1000} value={Math.round(txPos * 1000)}
                  onChange={e => engine.setTransitionPosition(+e.target.value / 1000)}
                  className="w-36" style={{ accentColor: GOLD }} aria-label="T-bar"
                />
              </label>
              <button onClick={() => engine.cut()} title="Cut (Enter)" className="px-5 py-2.5 rounded-lg font-mono text-[11px] font-black uppercase tracking-[0.12em] border border-white/15 bg-white/[0.06] hover:bg-white/12 transition-all">Cut</button>
              <button onClick={() => engine.auto()} title="Auto transition (Space)" className="px-7 py-2.5 rounded-lg font-mono text-[11px] font-black uppercase tracking-[0.12em] text-white" style={{ background: PGM }}>{txPos > 0 ? `${Math.round(txPos * 100)}%` : 'Auto'}</button>
            </div>
          </div>
        </div>

        {/* Outputs */}
        <div>
          {sectionLabel('Outputs · Record / Stream')}
          <OutputsPanel engine={engine} state={state} />
        </div>

        {/* Router matrix */}
        <div>
          <div className="flex items-center justify-between mb-2">
            {sectionLabel('Router · Crosspoint Matrix', 'text-[#F59E0B]')}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setRouterReceiverTarget('sw1');
                  setRouterReceiverOpen(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/35 text-[#F59E0B] hover:bg-[#F59E0B]/25 text-[9px] font-black uppercase tracking-widest transition-all"
                title="Open visual router receiver matrix"
              >
                <Radio size={11} />
                Router Selection Tool
              </button>
              <button
                onClick={handleScanNdi}
                disabled={isScanningNdi}
                title="Scan LAN for active NDI video feeds"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#7c9ce8]/15 border border-[#7c9ce8]/30 text-[#7c9ce8] hover:bg-[#7c9ce8]/25 text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
              >
                <RefreshCw size={11} className={isScanningNdi ? "animate-spin" : ""} />
                {isScanningNdi ? "Scanning NDI..." : "Scan NDI"}
              </button>
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
                {/* Program out — the composited switcher output, routable to AUX / STREAM / RECORD.
                    Never into a switcher input: that would feed program back into itself. */}
                <div className="grid gap-1.5 mb-1.5 items-center" style={{ gridTemplateColumns: `170px repeat(${router.destinations.length}, 1fr)` }}>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border" style={{ borderColor: `${PGM}55`, background: `${PGM}10` }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PGM }} />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[12px] truncate leading-tight">Program</div>
                      <div className="font-mono text-[8px] tracking-wide text-white/40">SWITCHER OUT</div>
                    </div>
                  </div>
                  {router.destinations.map(d => {
                    if (d.kind === 'switcherInput') return <div key={d.id} />;
                    const active = router.routes[d.id] === PROGRAM_SOURCE_ID;
                    return (
                      <button key={d.id} onClick={() => engine.route(d.id, PROGRAM_SOURCE_ID)} disabled={router.locks[d.id]} aria-label={`Program to ${d.label}`}
                        className="h-9 rounded border font-mono text-[12px] font-black transition-all disabled:opacity-40"
                        style={{ borderColor: active ? GOLD : 'rgba(255,255,255,0.1)', background: active ? GOLD : '#0a0a0c', color: active ? '#0a0a0c' : 'transparent' }}>
                        {active ? '●' : ''}
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
              {/* NDI Streams (LAN Discovery) */}
              <div className="pt-2 border-t border-white/8">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Radio size={13} className="text-[#7c9ce8]" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#7c9ce8]">NDI + OMT Streams (LAN Discovery)</span>
                  </div>
                  <button
                    onClick={handleScanNdi}
                    disabled={isScanningNdi}
                    className="flex items-center gap-1 text-[8.5px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/80 hover:text-white transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={9} className={isScanningNdi ? "animate-spin" : ""} />
                    <span>{isScanningNdi ? "Scanning..." : "Rescan LAN"}</span>
                  </button>
                </div>
                {discoveredNdi.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                    {discoveredNdi.map(ndi => {
                      const alreadyIn = router.sources.some(s => s.id === ndi.id);
                      return (
                        <div key={ndi.id} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-[11px] truncate text-white">{ndi.streamName || ndi.label}</div>
                            <div className="font-mono text-[9px] text-white/40 truncate">{ndi.machineName || ndi.url || 'LAN NDI Sender'} · {ndi.formats?.[0] ? `${ndi.formats[0].height}p${Math.round(ndi.formats[0].fps * 100) / 100}` : 'Auto'}</div>
                          </div>
                          <button
                            onClick={async () => {
                              if (!alreadyIn) {
                                await engine.scanNetworkFeeds();
                              }
                              setAddOpen(false);
                            }}
                            className="ml-2 px-3 py-1 rounded-lg text-[9.5px] font-mono font-bold uppercase transition-all"
                            style={{
                              background: alreadyIn ? 'rgba(16,185,129,0.15)' : 'rgba(124,156,232,0.2)',
                              color: alreadyIn ? '#10B981' : '#7c9ce8',
                              border: `1px solid ${alreadyIn ? 'rgba(16,185,129,0.3)' : 'rgba(124,156,232,0.4)'}`,
                            }}
                          >
                            {alreadyIn ? 'In Router' : '+ Add'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/8 text-center space-y-1">
                    <p className="text-[10px] text-white/40">
                      {isScanningNdi ? "Searching the network for NDI and OMT senders..." : "No NDI or OMT senders found on this network."}
                    </p>
                    {!isScanningNdi && networkDiagnosis && (
                      <p className="text-[9.5px] leading-relaxed" style={{ color: '#ffd166' }}>{networkDiagnosis}</p>
                    )}
                    <p className="text-[8.5px] text-white/30 font-mono">
                      NDI and OMT senders appear when they are online. SRT feeds aren't announced — add them by address.
                    </p>
                  </div>
                )}
              </div>

              {/* Other Native kinds — shown disabled with an honest reason if not supported */}
              {NATIVE_ONLY.filter(k => k !== 'ndi' && !caps.sources[k]).length > 0 && (
                <div className="pt-1 border-t border-white/8">
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Hardware inputs</span>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {NATIVE_ONLY.filter(k => k !== 'ndi' && !caps.sources[k]).map(k => (
                      <span key={k} title={unavailableReason(k, caps) || ''} className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-dashed border-white/10 text-[9px] font-bold text-white/25 flex items-center gap-1">
                        <AlertTriangle size={9} /> {KIND_LABEL[k]}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {err && <p className="text-[11px] text-[#EF4444] font-bold">{err}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Switcher Router Receiver Modal */}
      <SwitcherRouterReceiver
        isOpen={routerReceiverOpen}
        onClose={() => setRouterReceiverOpen(false)}
        engine={engine}
        sources={router.sources}
        destinations={router.destinations}
        routes={router.routes}
        programDestId={switcher.program}
        previewDestId={switcher.preview}
        onScanNdi={handleScanNdi}
        isScanningNdi={isScanningNdi}
        networkDiagnosis={networkDiagnosis}
        initialTargetDestId={routerReceiverTarget}
      />
    </div>
    </div>
  );
};

export default VideoRouterConsole;
