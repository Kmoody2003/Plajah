import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, FolderOpen, Repeat, Upload, X } from 'lucide-react';
import { Button, IconButton } from '../ui';
import { IMAGE_FORMATS, RECIPE_PRESETS, type ConvertProgress, type ConvertResult, type MediaKind, type Recipe } from '../../services/crossover';
import { convertHere, engineHere } from '../../services/crossover/convertHere';
import { sendTo } from '../../services/crossover/handoff';
import { revealNative } from '../../services/crossover/nativeEngine';
import { saveBlob } from '../../services/crossover/save';
import { Select, humanDuration, humanSize, mono } from './shared';

const BASE: Recipe = { containerId: 'mp4', videoCodecId: 'h264', audioCodecId: 'aac', hwAccel: 'auto', qualityMode: 'crf', crf: 20, audioBitrate: '192k' };

const ENGINE_NOTE = {
  desktop: 'Runs on this PC. Nothing is uploaded except what you save to Content HQ.',
  device: 'Runs on this phone. Nothing is uploaded except what you save to Content HQ.',
  cloud: 'Images and WAV run in this browser; other formats use Plajah cloud, up to 5 minutes a job. The desktop and Android apps run everything locally.',
};

interface Props {
  name: string;
  kind: MediaKind;
  /** Fetches the file; called once, when a job starts or the file is opened in Crossover. */
  getFile: () => Promise<File>;
  /** Files the result in Content HQ. Left out when the viewer can't add files there. */
  onSaveToHq?: (file: File, onProgress: (pct: number) => void) => Promise<void>;
}

/** Convert in place, from wherever a file already lives, with the full deck one click away. */
const QuickConvert: React.FC<Props> = ({ name, kind, getFile, onSaveToHq }) => {
  const targets = useMemo<{ id: string; label: string; note?: string; recipe: Recipe }[]>(() => {
    if (kind === 'image') return IMAGE_FORMATS.map((f) => ({ id: f.id, label: f.label, note: f.note, recipe: { ...BASE, containerId: f.id, imageFormatId: f.id } }));
    return RECIPE_PRESETS.filter((p) => p.kinds.includes(kind)).map((p) => ({ id: p.id, label: p.label, note: p.note, recipe: { ...BASE, ...p.recipe } as Recipe }));
  }, [kind]);
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [status, setStatus] = useState<'idle' | 'fetching' | 'running'>('idle');
  const [progress, setProgress] = useState<ConvertProgress | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [savePct, setSavePct] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const liveCanvas = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<File | null>(null);
  const engine = engineHere();
  const target = targets.find((t) => t.id === targetId);

  useEffect(() => () => abort.current?.abort(), []);

  // The codec pack and phone encoders draw to a canvas; copy it across once a second.
  useEffect(() => {
    const src = progress?.previewCanvas;
    if (!src) return;
    const id = setInterval(() => {
      const el = liveCanvas.current;
      if (!el || !src.width) return;
      if (el.width !== src.width || el.height !== src.height) { el.width = src.width; el.height = src.height; }
      el.getContext('2d')?.drawImage(src, 0, 0);
    }, 1000);
    return () => clearInterval(id);
  }, [progress?.previewCanvas]);

  const file = async () => (fileRef.current ??= await getFile());

  const run = async () => {
    if (!target) return;
    const ac = new AbortController();
    abort.current = ac;
    setStatus('fetching'); setError(null); setResult(null); setSaved(null); setProgress(null);
    try {
      const f = await file();
      setStatus('running');
      setResult(await convertHere(f, kind, target.recipe, setProgress, ac.signal));
    } catch (e: any) {
      if (e?.name === 'AbortError' || ac.signal.aborted) return;
      setError(e?.message === 'LIMIT_REACHED' ? 'Free cloud conversions are used up. The desktop and Android apps convert locally with no limit.' : (e?.message || String(e)));
    } finally {
      setStatus('idle');
      setProgress(null);
    }
  };

  const resultBlob = async () => result?.blob ?? (await (await fetch(result!.outputUrl)).blob());

  const saveHq = async () => {
    if (!result || !onSaveToHq) return;
    setSavePct(0); setError(null);
    try {
      await onSaveToHq(new File([await resultBlob()], result.outputName), setSavePct);
      setSaved(`Saved ${result.outputName} to Content HQ`);
    } catch (e: any) {
      setError(`Couldn't save to Content HQ: ${e?.message || e}`);
    } finally {
      setSavePct(null);
    }
  };

  const saveLocal = async () => {
    if (!result?.blob) return;
    try { setSaved((await saveBlob(result.outputName, result.blob)).message); }
    catch (e: any) { setError(`Couldn't save: ${e?.message || e}`); }
  };

  const openDeck = async () => {
    setError(null);
    try { sendTo('crossover', { name, file: await file() }); }
    catch (e: any) { setError(e?.message || String(e)); }
  };

  const busy = status !== 'idle';
  return (
    <div className="p-4 pj-stack-2" data-testid="quick-convert" style={{ background: 'var(--glass-1)', border: '1px solid var(--m3-border)', borderRadius: 'var(--pj-radius-lg)', color: 'var(--text-primary)' }}>
      <div className="flex items-center gap-2">
        <Repeat className="w-4 h-4" style={{ color: 'var(--pj-orange)' }} />
        <span className="type-title-sm flex-1">Convert with Crossover</span>
        <Button variant="ghost" size="xs" icon={<ExternalLink />} onClick={() => { void openDeck(); }}>Open in Crossover</Button>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <Select ariaLabel="Convert to" value={targetId} onChange={setTargetId} options={targets.map((t) => ({ value: t.id, label: t.label }))} />
        </div>
        <Button variant="primary" onClick={() => { void run(); }} loading={busy}>Convert</Button>
      </div>
      {target?.note && <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{target.note}</p>}

      {busy && (
        <div data-testid="quick-convert-progress">
          <div className="flex gap-2.5 items-center">
            {(progress?.previewUrl || progress?.previewCanvas) && (
              <div className="w-24 aspect-video shrink-0 overflow-hidden" style={{ background: 'black', borderRadius: 'var(--pj-radius-xs)' }}>
                {progress.previewCanvas ? <canvas ref={liveCanvas} className="w-full h-full object-cover" /> : <img src={progress.previewUrl} alt="The frame converting now" className="w-full h-full object-cover" />}
              </div>
            )}
            <div className="flex-1 min-w-0 type-body-sm" style={mono}>
              {status === 'fetching' ? 'Getting the file' : progress?.line && !progress.progress ? progress.line : `${Math.round((progress?.progress ?? 0) * 100)}%${progress?.speed ? ` · ${progress.speed}` : ''}${progress?.etaSec !== undefined ? ` · ${humanDuration(progress.etaSec)} left` : ''}`}
            </div>
            <IconButton variant="ghost" size="xs" aria-label="Cancel" onClick={() => abort.current?.abort()}><X /></IconButton>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden" style={{ background: 'var(--glass-3)', borderRadius: 'var(--pj-radius-full)' }}>
            <div className="h-full transition-all" style={{ width: `${(progress?.progress ?? 0) * 100}%`, background: 'var(--pj-grad-warm)' }} />
          </div>
        </div>
      )}

      {result && (
        <div data-testid="quick-convert-result">
          <div className="flex items-center gap-1.5 type-body-sm" style={{ color: 'var(--pj-success)' }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" /><span className="truncate">{result.outputName} · {humanSize(result.sizeBytes)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {onSaveToHq && <Button variant="secondary" size="xs" icon={<Upload />} loading={savePct !== null} disabled={!!saved} onClick={() => { void saveHq(); }}>{savePct !== null ? `${Math.round(savePct)}%` : 'Save to Content HQ'}</Button>}
            {result.outputPath
              ? <Button variant="ghost" size="xs" icon={<FolderOpen />} onClick={() => { void revealNative(result.outputPath!); }}>Show file</Button>
              : <Button variant="ghost" size="xs" icon={<Download />} onClick={() => { void saveLocal(); }}>Download</Button>}
          </div>
        </div>
      )}
      {saved && <p className="type-body-sm" style={{ color: 'var(--pj-success)' }}>{saved}</p>}
      {error && <p className="type-body-sm break-words" style={{ color: 'var(--pj-danger)' }}>{error}</p>}
      <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{ENGINE_NOTE[engine]}</p>
    </div>
  );
};

export default QuickConvert;
