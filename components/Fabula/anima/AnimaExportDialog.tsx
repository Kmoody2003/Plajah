// components/Fabula/anima/AnimaExportDialog.tsx — render the project to a file, or straight onto
// the Fabula timeline.

import React, { useEffect, useRef, useState } from 'react';
import { Clapperboard, Download, Loader2, X } from 'lucide-react';
import type { AnimaProject } from '../../../services/anima/types';
import { ExportCancelled, downloadBlob, exportAnimaPngSequence, exportAnimaVideo, pickVideoCodec, type AnimaVideoFormat } from '../../../services/anima/exportAnima';
import { ScrubNumber, btn, lbl } from './ui';

type Format = AnimaVideoFormat | 'png';

export interface SendToFabulaPayload {
  blob: Blob;
  name: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  animaProjectId: string;
}

export const AnimaExportDialog: React.FC<{
  project: AnimaProject;
  onClose: () => void;
  /** Provided when Anima runs inside Fabula: adds the render to the timeline. */
  onSendToFabula?: (payload: SendToFabulaPayload) => Promise<string | void>;
  onNotice: (msg: string) => void;
  /** Render scale for Send to Fabula, so the clip matches the production's frame size. */
  fabulaScale?: number;
}> = ({ project, onClose, onSendToFabula, onNotice, fabulaScale }) => {
  const [format, setFormat] = useState<Format>('webm');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(project.durationFrames);
  const [scale, setScale] = useState(1);
  const [support, setSupport] = useState<Record<AnimaVideoFormat, boolean | null>>({ webm: null, mp4: null });
  const [busy, setBusy] = useState<null | 'file' | 'fabula'>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([pickVideoCodec('webm', project.width, project.height), pickVideoCodec('mp4', project.width, project.height)]).then(([w, m]) => {
      if (!alive) return;
      setSupport({ webm: !!w, mp4: !!m });
      if (!w && m) setFormat('mp4');
      if (!w && !m) setFormat('png');
    });
    return () => {
      alive = false;
    };
  }, [project.width, project.height]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const frames = Math.max(1, to - from + 1);
  const base = (project.name || 'anima').replace(/[^\w-]+/g, '_') || 'anima';

  const render = async (fmt: Format, renderScale = scale) => {
    abortRef.current = new AbortController();
    setProgress(0);
    setError(null);
    const o = { from, to, scale: renderScale, signal: abortRef.current.signal, onProgress: (d: number, t: number) => setProgress(d / t) };
    return fmt === 'png' ? exportAnimaPngSequence(project, o) : exportAnimaVideo(project, fmt, o);
  };

  const run = async (kind: 'file' | 'fabula') => {
    setBusy(kind);
    try {
      if (kind === 'file') {
        const blob = await render(format);
        downloadBlob(blob, `${base}.${format === 'png' ? 'png.zip' : format}`);
        onNotice(`Exported ${frames} frames.`);
        onClose();
      } else if (onSendToFabula) {
        // Fabula's own renderer is MP4/H.264 based; send MP4 when this browser can encode it.
        const fmt: AnimaVideoFormat = support.mp4 ? 'mp4' : 'webm';
        const s = fabulaScale ?? scale;
        const blob = await render(fmt, s);
        const msg = await onSendToFabula({
          blob,
          name: project.name || 'Animation',
          durationSec: frames / project.fps,
          width: Math.round(project.width * s),
          height: Math.round(project.height * s),
          fps: project.fps,
          animaProjectId: project.id,
        });
        onNotice(msg || 'Added to the Fabula timeline.');
        onClose();
      }
    } catch (err) {
      if (!(err instanceof ExportCancelled)) setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  };

  const opt = (f: Format, label: string, ok: boolean | null) => (
    <button
      key={f}
      disabled={ok === false || !!busy}
      onClick={() => setFormat(f)}
      className="h-9 rounded-[9px] text-[12px] font-semibold border disabled:opacity-35"
      style={format === f ? { background: 'rgba(212,0,85,0.2)', borderColor: 'rgba(212,0,85,0.6)', color: '#fff' } : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }}
      title={ok === false ? "This browser can't encode this format" : undefined}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-6" style={{ background: 'rgba(5,4,8,0.7)', backdropFilter: 'blur(6px)' }} role="dialog" aria-label="Export animation">
      <div className="w-full max-w-[460px] p-5 rounded-[16px] flex flex-col gap-4" style={{ background: '#15111c', border: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center justify-between">
          <div className="text-[16px] font-bold">Export animation</div>
          <button className="grid place-items-center w-8 h-8 rounded-lg text-white/60 hover:text-white" onClick={() => (busy ? abortRef.current?.abort() : onClose())} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={lbl}>Format</span>
          <div className="grid grid-cols-3 gap-1.5">
            {opt('webm', 'WebM video', support.webm)}
            {opt('mp4', 'MP4 video', support.mp4)}
            {opt('png', 'PNG sequence', true)}
          </div>
          <div className="text-[11px] text-white/40">
            {format === 'png' ? 'One PNG per frame with a transparent background, zipped.' : 'Video of the camera view (or the whole frame if there is no camera).'}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 items-end">
          <label className="flex flex-col gap-1">
            <span className={lbl}>From frame</span>
            <ScrubNumber value={from} step={1} min={1} max={to} ariaLabel="From frame" onChange={(v) => setFrom(Math.round(v))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={lbl}>To frame</span>
            <ScrubNumber value={to} step={1} min={from} max={project.durationFrames} ariaLabel="To frame" onChange={(v) => setTo(Math.round(v))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={lbl}>Size</span>
            <select className="h-8 px-2 rounded-[8px] text-[12px] bg-white/[0.05] border border-white/[0.12] outline-none" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
              <option value={1} style={{ background: '#17131d' }}>{project.width}×{project.height}</option>
              <option value={0.5} style={{ background: '#17131d' }}>{Math.round(project.width / 2)}×{Math.round(project.height / 2)}</option>
            </select>
          </label>
        </div>
        <div className="text-[11px] text-white/45">{frames} frames · {(frames / project.fps).toFixed(2)} s at {project.fps} fps</div>

        {busy && (
          <div className="flex flex-col gap-1">
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, background: 'linear-gradient(90deg,#00DAF3,#D40055)' }} />
            </div>
            <div className="text-[11px] text-white/50">Rendering {Math.round(progress * 100)}%… keep this tab open.</div>
          </div>
        )}
        {error && <div className="text-[12px] text-red-300">{error}</div>}

        <div className="flex gap-2 justify-end flex-wrap">
          {busy ? (
            <button className={btn} onClick={() => abortRef.current?.abort()}>Cancel</button>
          ) : (
            <>
              {onSendToFabula && (
                <button className={btn} disabled={support.webm === false && support.mp4 === false} onClick={() => void run('fabula')} title="Render and place on the Fabula timeline at the playhead">
                  <Clapperboard size={14} /> Send to Fabula
                </button>
              )}
              <button className={btn} style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', color: '#fff', border: 'none' }} onClick={() => void run('file')}>
                <Download size={14} /> Export
              </button>
            </>
          )}
          {busy && <Loader2 size={16} className="animate-spin text-white/60 self-center" />}
        </div>
      </div>
    </div>
  );
};
