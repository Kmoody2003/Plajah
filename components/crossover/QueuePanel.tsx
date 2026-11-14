import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Clapperboard, Download, FolderOpen, Play, Sparkles, X } from 'lucide-react';
import { Button, IconButton } from '../ui';
import { QueueJob, humanDuration, humanSize, mono } from './shared';

const Thumb: React.FC<{ job: QueueJob }> = ({ job }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!job.previewCanvas) return;
    const src = job.previewCanvas;
    const id = setInterval(() => {
      const el = ref.current;
      if (!el || !src.width) return;
      if (el.width !== src.width || el.height !== src.height) { el.width = src.width; el.height = src.height; }
      el.getContext('2d')?.drawImage(src, 0, 0);
    }, 500);
    return () => clearInterval(id);
  }, [job.previewCanvas]);
  return (
    <div className="w-24 aspect-video shrink-0 overflow-hidden grid place-items-center" style={{ background: 'black', borderRadius: 'var(--pj-radius-xs)' }}>
      {job.previewCanvas ? <canvas ref={ref} className="w-full h-full object-cover" />
        : job.previewUrl ? <img src={job.previewUrl} alt="" className="w-full h-full object-cover" data-testid="live-preview" />
        : <span className="type-label-sm" style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>{job.status === 'queued' ? 'Waiting' : job.status === 'running' ? '…' : ''}</span>}
    </div>
  );
};

interface Props {
  jobs: QueueJob[];
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onReview: (job: QueueJob) => void;
  onSave?: (job: QueueJob) => void;
  onReveal?: (job: QueueJob) => void;
  onSend?: (job: QueueJob, target: 'fabula' | 'pixels') => void;
}

const QueuePanel: React.FC<Props> = ({ jobs, onCancel, onRemove, onReview, onSave, onReveal, onSend }) => {
  if (!jobs.length) return <p className="type-body-md" style={{ color: 'var(--on-surface-variant)' }}>Nothing converting. Conversions you start show up here with a live picture.</p>;
  return (
    <div className="flex flex-col gap-2" data-testid="queue">
      {jobs.map((j) => (
        <div key={j.id} className="p-2.5" style={{ background: 'var(--glass-1)', border: '1px solid var(--m3-border)', borderRadius: 'var(--pj-radius-sm)' }}>
          <div className="flex gap-2.5">
            <Thumb job={j} />
            <div className="min-w-0 flex-1">
              <div className="type-body-md truncate" style={{ color: 'var(--text-primary)' }}>{j.source.name}</div>
              <div className="type-body-sm truncate" style={{ color: 'var(--on-surface-variant)' }}>{j.label}</div>
              {j.status === 'running' && j.stage && !j.progress && <div className="type-body-sm" style={{ color: 'var(--text-primary)' }}>{j.stage}</div>}
              {j.status === 'running' && (!j.stage || j.progress > 0) && (
                <div className="type-body-sm" style={{ ...mono, color: 'var(--text-primary)' }}>
                  {Math.round(j.progress * 100)}%{j.speed ? ` · ${j.speed}` : ''}{j.etaSec !== undefined ? ` · ${humanDuration(j.etaSec)} left` : ''}
                </div>
              )}
              {j.status === 'done' && (
                <div className="flex items-center gap-1 type-body-sm" style={{ color: 'var(--pj-success)' }}>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{humanSize(j.result?.sizeBytes)}{j.savedMessage ? ` · ${j.savedMessage}` : ''}</span>
                </div>
              )}
              {j.status === 'canceled' && <div className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Canceled</div>}
            </div>
            {j.status === 'running' || j.status === 'queued'
              ? <IconButton variant="ghost" size="xs" aria-label={`Cancel ${j.source.name}`} onClick={() => onCancel(j.id)}><X /></IconButton>
              : <IconButton variant="ghost" size="xs" aria-label={`Remove ${j.source.name}`} onClick={() => onRemove(j.id)}><X /></IconButton>}
          </div>
          {j.status === 'running' && (
            <div className="mt-2 h-1.5 overflow-hidden" style={{ background: 'var(--glass-3)', borderRadius: 'var(--pj-radius-full)' }}>
              <div className="h-full transition-all" style={{ width: `${j.progress * 100}%`, background: 'var(--pj-grad-warm)' }} />
            </div>
          )}
          {j.status === 'error' && (
            <div className="mt-2 flex items-start gap-1.5 type-body-sm" style={{ color: 'var(--pj-danger)' }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span className="break-words min-w-0">{j.error}</span>
            </div>
          )}
          {j.status === 'done' && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button variant="secondary" size="xs" icon={<Play />} onClick={() => onReview(j)}>Review</Button>
              {onSave && j.result?.blob && !j.savedMessage && <Button variant="secondary" size="xs" icon={<Download />} onClick={() => onSave(j)}>Save</Button>}
              {onReveal && j.result?.outputPath && <Button variant="ghost" size="xs" icon={<FolderOpen />} onClick={() => onReveal(j)}>Show file</Button>}
              {onSend && <Button variant="ghost" size="xs" icon={<Clapperboard />} onClick={() => onSend(j, 'fabula')}>To Fabula</Button>}
              {onSend && <Button variant="ghost" size="xs" icon={<Sparkles />} onClick={() => onSend(j, 'pixels')}>To Pixels</Button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default QueuePanel;
