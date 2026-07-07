import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, Plus, FileVideo, FileAudio, FileImage, Cpu, Download, Gauge,
  AlertTriangle, Sparkles, Server, MonitorSmartphone, Repeat,
} from 'lucide-react';
import {
  crossover, CONTAINERS, VIDEO_CODECS, AUDIO_CODECS, IMAGE_FORMATS, HW_OPTIONS,
  containersFor, kindFromName, chooseBackend, extFor,
} from '../services/crossover';
import type { SourceFile, Recipe, MediaKind, HwAccel, ConvertResult } from '../services/crossover';
import { conversionAllowance, recordClientConversion } from '../services/crossoverUsage';

// ─────────────────────────────────────────────────────────────────────────
// Crossover — media format converter, as a first-class Plajah app. Shares the
// services/crossover engine with Fabula and the Asset Manager. Design language:
// Plajah orange (#FF8C00) on near-black glass, with Crossover's teal/violet as
// a secondary signature accent.
// ─────────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  userProfile?: any;
  onNavigate?: (v: any) => void;
  enabled?: boolean;
}

const ORANGE = '#FF8C00';
const TEAL = '#34e0d0';
const VIOLET = '#7c5cff';

let uid = 0;
const newId = () => `cx${++uid}`;

function kindIcon(kind: MediaKind, cls = 'w-4 h-4') {
  if (kind === 'audio') return <FileAudio className={cls} />;
  if (kind === 'image') return <FileImage className={cls} />;
  return <FileVideo className={cls} />;
}

function humanSize(b: number) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

const CrossoverView: React.FC<Props> = ({ onBack, userProfile, enabled = true }) => {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState<string>();
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUpsell, setShowUpsell] = useState(false);
  const cancelRef = useRef<AbortController | null>(null);

  const selected = files.find((f) => f.id === selectedId) || null;
  const kind = selected?.kind ?? 'video';
  const containers = useMemo(() => containersFor(kind), [kind]);

  const [recipe, setRecipe] = useState<Recipe>({
    containerId: 'mp4',
    videoCodecId: 'h264',
    audioCodecId: 'aac',
    imageFormatId: 'webp',
    hwAccel: 'auto',
    qualityMode: 'crf',
    crf: 20,
    audioBitrate: '320k',
    fixTimestamps: true,
  });
  const patch = (p: Partial<Recipe>) => setRecipe((r) => ({ ...r, ...p }));

  // Keep container valid for the selected file's kind.
  useEffect(() => {
    if (kind !== 'image' && !containers.find((c) => c.id === recipe.containerId)) {
      setRecipe((r) => ({ ...r, containerId: containers[0]?.id ?? 'mkv' }));
    }
  }, [kind, containers, recipe.containerId]);

  // Probe the selected file (client-side, instant).
  useEffect(() => {
    if (!selected || selected.probe) return;
    let alive = true;
    crossover.probe(selected).then((probe) => {
      if (alive) setFiles((prev) => prev.map((f) => (f.id === selected.id ? { ...f, probe } : f)));
    }).catch(() => {});
    return () => { alive = false; };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Object URL for previewing the selected source (image/video).
  const previewUrl = useMemo(() => {
    if (selected?.file && (selected.kind === 'image' || selected.kind === 'video')) {
      return URL.createObjectURL(selected.file);
    }
    return null;
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const backend = selected ? chooseBackend(selected, recipe) : 'client';
  const outputName = selected
    ? selected.name.replace(/\.[^.]+$/, '') + '.' + extFor(recipe, kind)
    : '';
  const command = selected ? crossover.buildCommandPreview(selected, recipe) : '';

  const signedIn = !!userProfile?.uid;
  const allowance = conversionAllowance(userProfile);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const added: SourceFile[] = Array.from(list).map((file) => ({
      id: newId(),
      name: file.name,
      kind: kindFromName(file.name),
      sizeBytes: file.size,
      file,
    }));
    setFiles((prev) => [...prev, ...added]);
    if (!selectedId && added[0]) setSelectedId(added[0].id);
  }

  async function startConvert() {
    if (!selected || running) return;
    if (!signedIn) { setError('Sign in to convert with Crossover.'); return; }
    if (!allowance.allowed) { setShowUpsell(true); return; }
    const ac = new AbortController();
    cancelRef.current = ac;
    setRunning(true); setProgress(0); setResult(null); setError(null); setSpeed(undefined); setShowUpsell(false);
    try {
      const r = await crossover.convert(
        selected, recipe,
        (p) => { setProgress(p.progress); if (p.speed) setSpeed(p.speed); },
        ac.signal,
      );
      setResult(r);
      // Server jobs are counted server-side; count client jobs here.
      if (r.backend === 'client' && !allowance.unlimited && userProfile?.uid) {
        recordClientConversion(userProfile.uid);
      }
    } catch (e: any) {
      if (e?.message === 'LIMIT_REACHED') setShowUpsell(true);
      else if (e?.name !== 'AbortError') setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  }

  // Admin kill-switch: the standalone tool can be turned off platform-wide.
  if (!enabled) {
    return (
      <div className="flex-1 flex flex-col h-full min-h-0 text-white">
        <div className="flex items-center gap-4 px-6 lg:px-10 py-5">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 grid place-items-center">
          <div className="text-center max-w-sm px-6">
            <div className="w-12 h-12 rounded-2xl mx-auto mb-4" style={{ background: `linear-gradient(135deg, ${TEAL}, ${VIOLET})`, opacity: 0.5 }} />
            <div className="text-lg font-black">Crossover is currently unavailable</div>
            <div className="text-sm text-white/50 mt-2">The media converter has been turned off by the Plajah team. Check back soon.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 text-white">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 lg:px-10 py-5">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl" style={{ background: `linear-gradient(135deg, ${TEAL}, ${VIOLET})`, boxShadow: `0 0 20px ${VIOLET}66` }} />
          <div>
            <div className="text-xl font-black tracking-tight leading-none"
              style={{ background: `linear-gradient(90deg, ${TEAL}, ${VIOLET})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              CROSSOVER
            </div>
            <div className="text-[11px] uppercase tracking-widest text-white/40 mt-0.5">Media converter</div>
          </div>
        </div>
        <div className="ml-auto text-[11px] text-white/40 hidden md:block">
          Hardware-accelerated - No paid encoders
        </div>
      </div>

      {/* Workspace */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[280px_1fr_340px] gap-4 px-6 lg:px-10 pb-8">
        {/* Left — queue */}
        <div className="min-h-0 flex flex-col gap-4">
          <input ref={fileInput} type="file" multiple accept="video/*,audio/*,image/*" className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ''; }} />
          <div className="bg-white/5 border border-white/10 rounded-3xl p-4 flex-1 min-h-0 flex flex-col">
            <div className="text-[11px] uppercase tracking-widest text-white/40 font-semibold px-1 mb-3">Source Queue</div>
            <button onClick={() => fileInput.current?.click()}
              className="w-full rounded-2xl border border-dashed border-white/20 hover:border-[#FF8C00] hover:bg-[#FF8C00]/5 transition-colors py-5 flex flex-col items-center gap-1.5 text-white/60 hover:text-white">
              <Plus className="w-5 h-5" />
              <span className="text-sm font-bold">Add media</span>
              <span className="text-[11px] text-white/40">video - audio - images</span>
            </button>
            <div className="mt-3 flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
              {files.length === 0 && (
                <div className="text-center text-white/30 text-xs mt-8 px-4">
                  Add a file to convert. Images and audio convert instantly in your browser; video routes to Plajah cloud.
                </div>
              )}
              {files.map((f) => (
                <button key={f.id} onClick={() => setSelectedId(f.id)}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-colors ${
                    f.id === selectedId ? 'border-[#7c5cff] bg-white/5' : 'border-white/10 hover:bg-white/5'
                  }`}>
                  <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
                    style={{ background: `linear-gradient(135deg, ${TEAL}33, ${VIOLET}33)`, color: TEAL }}>
                    {kindIcon(f.kind)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate">{f.name}</div>
                    <div className="text-[11px] text-white/40">{f.kind} - {humanSize(f.sizeBytes)}</div>
                  </div>
                  {f.probe?.needsFinalize && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#ffc857]/15 text-[#ffc857]">FINALIZE</span>}
                  {f.probe?.corrupt && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#ff6b6b]/15 text-[#ff6b6b]">CORRUPT</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center — preview + output + progress */}
        <div className="min-h-0 grid grid-rows-[1fr_1fr_auto] gap-4">
          <Viewer label="Preview - Source" dot={TEAL} rightText={selected?.name}>
            {selected ? (
              selected.kind === 'image' && previewUrl ? (
                <img src={previewUrl} alt="" className="max-w-full max-h-full object-contain" />
              ) : selected.kind === 'video' && previewUrl ? (
                <video src={previewUrl} controls className="max-w-full max-h-full" />
              ) : (
                <div className="text-center text-white/30">
                  <FileAudio className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <div className="text-sm">{selected.name}</div>
                </div>
              )
            ) : (
              <div className="text-white/30 text-sm">Select a file to preview</div>
            )}
          </Viewer>
          {selected?.probe && (
            <StatRow probe={selected.probe} />
          )}

          <Viewer label="Output - Result" dot={VIOLET} rightText={`${recipe.containerId.toUpperCase()} - ${recipe.videoCodecId ?? recipe.audioCodecId}`}>
            {result ? (
              result.blob && kind === 'image' ? (
                <img src={result.outputUrl} alt="" className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="text-center">
                  <Sparkles className="w-10 h-10 mx-auto mb-2" style={{ color: '#3ddc84' }} />
                  <a href={result.outputUrl} download={result.outputName}
                    className="inline-flex items-center gap-2 mt-1 px-4 py-2 rounded-xl bg-white text-black text-xs font-black uppercase tracking-widest">
                    <Download className="w-4 h-4" /> Download {result.outputName}
                  </a>
                </div>
              )
            ) : (
              <div className="text-white/30 text-sm">{running ? 'Encoding...' : 'Output appears here after conversion'}</div>
            )}
          </Viewer>

          {/* Progress / status */}
          <div className="bg-white/5 border border-white/10 rounded-3xl px-5 py-4 flex items-center gap-4">
            {running ? (
              <>
                <Gauge className="w-5 h-5" style={{ color: TEAL }} />
                <div className="text-[13px] text-white/60 whitespace-nowrap">
                  <b className="text-white">{Math.round(progress * 100)}%</b>{speed ? ` - ${speed}` : ''}
                </div>
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${TEAL}, ${VIOLET}, ${ORANGE})` }} />
                </div>
                <button onClick={() => cancelRef.current?.abort()} className="text-xs text-white/50 hover:text-white">Cancel</button>
              </>
            ) : error ? (
              <>
                <AlertTriangle className="w-5 h-5" style={{ color: '#ff6b6b' }} />
                <div className="text-[13px] text-[#ff6b6b] truncate">{error}</div>
              </>
            ) : result ? (
              <>
                <Sparkles className="w-5 h-5" style={{ color: '#3ddc84' }} />
                <div className="text-[13px]" style={{ color: '#3ddc84' }}>
                  <b>Done.</b> {result.backend === 'client' ? 'Converted in your browser.' : 'Converted on Plajah cloud.'}
                </div>
              </>
            ) : (
              <>
                <Cpu className="w-5 h-5 text-white/40" />
                <div className="text-[13px] text-white/50">Idle - pick your output settings, then Convert.</div>
              </>
            )}
          </div>
        </div>

        {/* Right — settings */}
        <div className="min-h-0 bg-white/5 border border-white/10 rounded-3xl p-5 overflow-y-auto">
          <div className="text-[11px] uppercase tracking-widest text-white/40 font-semibold mb-4">Output Settings</div>

          {kind === 'image' ? (
            <Field label="Image format">
              <Select value={recipe.imageFormatId} onChange={(v) => patch({ imageFormatId: v })}
                options={IMAGE_FORMATS.map((f) => ({ value: f.id, label: f.label }))} />
              <Note>{IMAGE_FORMATS.find((f) => f.id === recipe.imageFormatId)?.note}</Note>
            </Field>
          ) : (
            <>
              <Field label="Container">
                <Select value={recipe.containerId} onChange={(v) => patch({ containerId: v })}
                  options={containers.map((c) => ({ value: c.id, label: c.label }))} />
                <Note>{containers.find((c) => c.id === recipe.containerId)?.note}</Note>
              </Field>
              {kind === 'video' && (
                <Field label="Video codec">
                  <Select value={recipe.videoCodecId} onChange={(v) => patch({ videoCodecId: v })}
                    options={VIDEO_CODECS.map((c) => ({ value: c.id, label: c.label }))} />
                  <Note>{VIDEO_CODECS.find((c) => c.id === recipe.videoCodecId)?.note}</Note>
                </Field>
              )}
              <Field label="Audio codec">
                <Select value={recipe.audioCodecId} onChange={(v) => patch({ audioCodecId: v })}
                  options={AUDIO_CODECS.map((c) => ({ value: c.id, label: c.label }))} />
                <Note>{AUDIO_CODECS.find((c) => c.id === recipe.audioCodecId)?.note}</Note>
              </Field>
            </>
          )}

          {kind === 'video' && (
            <Field label="Hardware acceleration">
              <Select value={recipe.hwAccel} onChange={(v) => patch({ hwAccel: v as HwAccel })}
                options={HW_OPTIONS.map((h) => ({ value: h.id, label: h.label }))} />
            </Field>
          )}

          <Field label="Quality">
            <div className="flex gap-1.5">
              {(['crf', 'bitrate', 'lossless'] as const).map((m) => (
                <button key={m} onClick={() => patch({ qualityMode: m })}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
                    recipe.qualityMode === m ? 'bg-white/15 text-white' : 'bg-white/5 text-white/50 hover:text-white'
                  }`}>
                  {m === 'crf' ? 'Quality' : m === 'bitrate' ? 'Bitrate' : 'Lossless'}
                </button>
              ))}
            </div>
            {recipe.qualityMode === 'crf' && (
              <div className="mt-2.5">
                <input type="number" min={0} max={51} value={recipe.crf ?? 20}
                  onChange={(e) => patch({ crf: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm outline-none focus:border-[#7c5cff]" />
                <Note>Lower = better quality / bigger file (CRF 18-23 is the sweet spot).</Note>
              </div>
            )}
          </Field>

          <div className="space-y-1 mt-2">
            <Toggle label="Binaural / stereo downmix" sub="Multichannel to headphone stereo"
              on={!!recipe.binauralDownmix} onToggle={() => patch({ binauralDownmix: !recipe.binauralDownmix })} />
            <Toggle label="Repair timestamps" sub="Regenerate PTS - fixes stutter / sync"
              on={!!recipe.fixTimestamps} onToggle={() => patch({ fixTimestamps: !recipe.fixTimestamps })} />
            <Toggle label="Strip metadata" sub="Remove tags / corrupt metadata blocks"
              on={!!recipe.stripMetadata} onToggle={() => patch({ stripMetadata: !recipe.stripMetadata })} />
          </div>

          {/* Backend indicator */}
          <div className="mt-4 flex items-center gap-2 text-[11px] rounded-xl px-3 py-2 border"
            style={{ borderColor: backend === 'client' ? `${TEAL}44` : `${ORANGE}44`, background: backend === 'client' ? `${TEAL}11` : `${ORANGE}11` }}>
            {backend === 'client' ? <MonitorSmartphone className="w-3.5 h-3.5" style={{ color: TEAL }} /> : <Server className="w-3.5 h-3.5" style={{ color: ORANGE }} />}
            <span className="text-white/70">{backend === 'client' ? 'Runs instantly in your browser - private, free' : 'Runs on Plajah cloud - full codecs + acceleration'}</span>
          </div>

          <Field label="FFmpeg command (transparent)" className="mt-4">
            <div className="font-mono text-[11px] leading-relaxed p-3 rounded-xl bg-black/40 border border-white/10 break-all max-h-24 overflow-y-auto" style={{ color: TEAL }}>
              {command || '-'}
            </div>
          </Field>

          {/* Free-tier usage + gates */}
          {signedIn && !allowance.unlimited && (
            <div className="mt-4 flex items-center justify-between text-[11px]">
              <span className="text-white/50">{allowance.used} of {allowance.limit} free conversions used</span>
              {allowance.remaining <= 0 && <span className="font-bold text-[#FF8C00]">Limit reached</span>}
            </div>
          )}
          {!signedIn && (
            <div className="mt-4 p-3 rounded-xl border border-white/10 bg-white/5 text-[11px] text-white/60">
              Sign in to convert with Crossover.
            </div>
          )}
          {showUpsell && (
            <div className="mt-3 p-3 rounded-xl border border-[#FF8C00]/30 bg-[#FF8C00]/10 text-[11px] text-white/80 leading-relaxed">
              You've used all {allowance.limit} free conversions. <b className="text-[#FF8C00]">Plajah+</b> unlocks unlimited Crossover conversions.
            </div>
          )}

          <div className="mt-4">
            <button onClick={startConvert} disabled={!selected || running}
              className="w-full py-3.5 rounded-2xl font-black text-[15px] text-black disabled:opacity-40 disabled:cursor-not-allowed transition-transform hover:-translate-y-0.5"
              style={{ background: `linear-gradient(135deg, ${TEAL}, ${VIOLET})`, boxShadow: `0 10px 30px ${VIOLET}55` }}>
              {running ? 'Converting...' : !signedIn ? 'Sign in to convert' : !allowance.allowed ? 'Free limit reached' : selected ? `Convert "${selected.name}"` : 'Convert'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── small presentational helpers ───────────────────────────────────────────

function Viewer({ label, dot, rightText, children }: { label: string; dot: string; rightText?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-3xl flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot, boxShadow: `0 0 10px ${dot}` }} />
        <span className="text-[11px] uppercase tracking-widest text-white/50 font-semibold">{label}</span>
        {rightText && <span className="ml-auto text-[11px] text-white/40 truncate max-w-[50%]">{rightText}</span>}
      </div>
      <div className="flex-1 min-h-0 grid place-items-center p-3 overflow-hidden">{children}</div>
    </div>
  );
}

function StatRow({ probe }: { probe: SourceFile['probe'] }) {
  if (!probe) return null;
  const bits: string[] = [`Container ${probe.container || '?'}`];
  if (probe.width) bits.push(`Res ${probe.width}x${probe.height}`);
  if (probe.fps) bits.push(`FPS ${probe.fps}`);
  if (probe.durationSec) bits.push(`Dur ${probe.durationSec.toFixed(1)}s`);
  if (probe.sampleRate) bits.push(`Rate ${(probe.sampleRate / 1000).toFixed(1)}k`);
  if (probe.channels) bits.push(`Ch ${probe.channels}`);
  return (
    <div className="-mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50 px-1">
      {bits.map((b, i) => <span key={i}>{b}</span>)}
      {probe.warnings?.length ? (
        <span className="flex items-center gap-1 text-[#ffc857] w-full">
          <AlertTriangle className="w-3 h-3" /> {probe.warnings.join(' - ')}
        </span>
      ) : null}
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-4 ${className}`}>
      <label className="block text-[11px] text-white/50 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Note({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <div className="text-[11px] text-white/30 mt-1.5 leading-snug">{children}</div>;
}

function Select({ value, onChange, options }: { value?: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm outline-none focus:border-[#7c5cff] [&>option]:bg-neutral-900">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({ label, sub, on, onToggle }: { label: string; sub: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div>
        <div className="text-[13px]">{label}</div>
        <div className="text-[11px] text-white/30">{sub}</div>
      </div>
      <button onClick={onToggle} className={`w-10 h-6 rounded-full relative transition-colors ${on ? '' : 'bg-white/10'}`}
        style={on ? { background: `linear-gradient(135deg, ${TEAL}, ${VIOLET})` } : undefined}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

export default CrossoverView;
