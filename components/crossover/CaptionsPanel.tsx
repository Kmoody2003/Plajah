import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, FileUp, Mic, Trash2, Undo2, XCircle } from 'lucide-react';
import { Button, Chip, Input, Textarea } from '../ui';
import {
  CAPTION_FORMATS, FRAME_RATES, frameToTc, newCueId, qcCaptions, readCaptions, retimeCues, secToFrame, sortCues, tcToFrame, verifyBroadcast, writeCaptions,
  frameToSec, type CaptionCue, type CaptionFormat, type FrameRate, type QcIssue, type ReadbackReport,
} from '../../services/crossover/captions';
import type { GenerateProgress } from '../../services/crossover/generateCaptions';
import { CaptionTrack, Field, Select, humanDuration, mono } from './shared';

export interface ExportResult {
  message: string;
  report?: ReadbackReport;
  /** The written file, so it can be played back over the video. */
  text: string;
  name: string;
  independent?: { ok: boolean; message: string };
}

interface Props {
  track: CaptionTrack | null;
  rate: FrameRate;
  onRate: (id: string) => void;
  startTc: string;
  onStartTc: (tc: string) => void;
  mediaName?: string;
  duration: number;
  time: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSeek: (sec: number) => void;
  onChangeCues: (cues: CaptionCue[]) => void;
  onLoadTrack: (t: CaptionTrack) => void;
  onOpenCaptionFile: () => void;
  canGenerate: boolean;
  generating: GenerateProgress | null;
  onGenerate: () => void;
  onCancelGenerate: () => void;
  onSave: (name: string, text: string, mime: string) => Promise<string>;
  onSendToFabula?: () => void;
  /** Check a written file with a second, unrelated decoder, where one is installed. */
  onIndependentCheck?: (name: string, text: string, cues: CaptionCue[], rate: FrameRate, startTc: string) => Promise<{ ok: boolean; message: string }>;
}

const ReportView: React.FC<{ report: ReadbackReport }> = ({ report }) => (
  <div className="mt-3 p-3" data-testid="readback-report" style={{ background: 'var(--glass-1)', border: `1px solid ${report.pass ? 'var(--pj-success)' : 'var(--pj-warning)'}`, borderRadius: 'var(--pj-radius-sm)' }}>
    <div className="flex items-center gap-2 type-title-sm mb-2" style={{ color: 'var(--text-primary)' }}>
      {report.pass ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--pj-success)' }} /> : <AlertTriangle className="w-4 h-4" style={{ color: 'var(--pj-warning)' }} />}
      {report.pass ? 'Read back clean' : 'Read back with problems'}
    </div>
    {report.layers.map((l) => (
      <div key={l.layer} className="type-body-sm py-1" style={{ color: 'var(--text-primary)', ...mono }}>
        {l.layer}: {l.checks.length - l.missing}/{l.checks.length} captions, {l.textErrors ? `${l.textErrors} text errors` : 'words match'}, within {Math.max(l.worstStartFrames, l.worstEndFrames)} frame{Math.max(l.worstStartFrames, l.worstEndFrames) === 1 ? '' : 's'}
        {l.extra ? `, ${l.extra} extra` : ''}
      </div>
    ))}
    {report.diagnostics && (
      <div className="type-body-sm py-1" style={{ color: 'var(--on-surface-variant)', ...mono }}>
        {report.diagnostics.packets} packets · checksums {report.diagnostics.badAncChecksums + report.diagnostics.badCdpChecksums ? 'BAD' : 'OK'} · {report.diagnostics.firstTc} to {report.diagnostics.lastTc}
      </div>
    )}
    {!!report.late.length && (
      <div className="type-body-sm py-1" style={{ color: 'var(--pj-warning)' }}>
        {report.late.length} caption{report.late.length === 1 ? '' : 's'} can't load before their start time; the worst is {Math.max(...report.late.map((x) => x.lateSlots))} frames late. Give the previous caption more room, or shorten the text.
      </div>
    )}
    {!!report.unsupported.length && <div className="type-body-sm py-1" style={{ color: 'var(--pj-warning)' }}>Not in the 608 character set, shown as spaces: {report.unsupported.join(' ')}</div>}
    {report.warnings.map((w, i) => <div key={i} className="type-body-sm py-1" style={{ color: 'var(--pj-warning)' }}>{w}</div>)}
  </div>
);

const CueRow: React.FC<{
  cue: CaptionCue; rate: FrameRate; startFrame: number; selected: boolean; issues: QcIssue[];
  onSelect: () => void; onChange: (p: Partial<CaptionCue>) => void; onDelete: () => void; onSplit: () => void; onMergeNext?: () => void;
}> = ({ cue, rate, startFrame, selected, issues, onSelect, onChange, onDelete, onSplit, onMergeNext }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selected) ref.current?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  const toSec = (tc: string) => { const f = tcToFrame(tc, rate); return f === null ? null : frameToSec(f - startFrame, rate); };
  const startTc = frameToTc(secToFrame(cue.startSec, rate) + startFrame, rate);
  const endTc = frameToTc(secToFrame(cue.endSec, rate) + startFrame, rate);
  return (
    <div ref={ref} data-testid="cue-row" className="p-2 cursor-pointer" onClick={onSelect}
      style={{ background: selected ? 'var(--glass-3)' : 'transparent', borderBottom: '1px solid var(--m3-border)', borderRadius: selected ? 'var(--pj-radius-xs)' : 0 }}>
      <div className="flex items-center gap-2 type-body-sm" style={{ ...mono, color: 'var(--on-surface-variant)' }}>
        <span>{startTc}</span><span>{endTc}</span>
        {!!issues.length && <span title={issues.map((i) => i.message).join(' ')}><AlertTriangle className="w-3.5 h-3.5" style={{ color: issues.some((i) => i.severity === 'error') ? 'var(--pj-danger)' : 'var(--pj-warning)' }} /></span>}
      </div>
      {selected ? (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <Textarea aria-label="Caption text" rows={2} value={cue.text} onChange={(e) => onChange({ text: e.target.value })} />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Input aria-label="Start timecode" defaultValue={startTc} key={`s${startTc}`} style={mono} onBlur={(e) => { const s = toSec(e.target.value); if (s !== null) onChange({ startSec: s }); }} />
            <Input aria-label="End timecode" defaultValue={endTc} key={`e${endTc}`} style={mono} onBlur={(e) => { const s = toSec(e.target.value); if (s !== null) onChange({ endSec: s }); }} />
          </div>
          {issues.map((i, n) => <div key={n} className="type-body-sm mt-1" style={{ color: i.severity === 'error' ? 'var(--pj-danger)' : 'var(--pj-warning)' }}>{i.message}</div>)}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Button variant="ghost" size="xs" onClick={onSplit}>Split here</Button>
            {onMergeNext && <Button variant="ghost" size="xs" onClick={onMergeNext}>Merge with next</Button>}
            <Button variant="danger-quiet" size="xs" icon={<Trash2 />} onClick={onDelete}>Delete</Button>
          </div>
        </div>
      ) : (
        <div className="type-body-md whitespace-pre-wrap mt-0.5" style={{ color: 'var(--text-primary)' }}>{cue.text}</div>
      )}
    </div>
  );
};

const CaptionsPanel: React.FC<Props> = ({
  track, rate, onRate, startTc, onStartTc, mediaName, duration, time, selectedId, onSelect, onSeek, onChangeCues, onLoadTrack, onOpenCaptionFile,
  canGenerate, generating, onGenerate, onCancelGenerate, onSave, onSendToFabula, onIndependentCheck,
}) => {
  const [format, setFormat] = useState<CaptionFormat>('mcc');
  const [maxRows, setMaxRows] = useState('2');
  const [sccRate, setSccRate] = useState<'29.97df' | '29.97ndf'>('29.97df');
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const undo = useRef<CaptionCue[] | null>(null);
  const [, bump] = useState(0);

  const cues = track?.cues ?? [];
  const startFrame = tcToFrame(startTc, rate) ?? 0;
  const issues = useMemo(() => qcCaptions(cues, { videoDurationSec: duration || undefined, maxRows: +maxRows }), [cues, duration, maxRows]);
  const byCue = useMemo(() => {
    const m = new Map<string, QcIssue[]>();
    for (const i of issues) m.set(i.cueId, [...(m.get(i.cueId) ?? []), i]);
    return m;
  }, [issues]);

  useEffect(() => setExportResult(null), [cues, format, rate, startTc, maxRows, sccRate]);

  useEffect(() => { if (exportResult) resultRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [exportResult]);

  const apply = (next: CaptionCue[]) => { undo.current = cues; bump((n) => n + 1); onChangeCues(next); };
  const patchCue = (id: string, p: Partial<CaptionCue>) => onChangeCues(sortCues(cues.map((c) => (c.id === id ? { ...c, ...p } : c))));
  const frame = rate.den / rate.num;
  const nudge = (sec: number) => apply(retimeCues(cues, sec));

  const split = (c: CaptionCue) => {
    const at = time > c.startSec + 0.1 && time < c.endSec - 0.1 ? time : (c.startSec + c.endSec) / 2;
    const words = c.text.replace(/\n/g, ' ').split(' ');
    const half = Math.ceil(words.length * ((at - c.startSec) / (c.endSec - c.startSec)));
    apply(sortCues(cues.flatMap((x) => (x.id === c.id ? [
      { ...x, endSec: at, text: words.slice(0, half).join(' ') },
      { id: newCueId(), startSec: at, endSec: x.endSec, text: words.slice(half).join(' ') },
    ] : [x]))));
  };
  const mergeNext = (i: number) => {
    const a = cues[i], b = cues[i + 1];
    apply(cues.flatMap((x, n) => (n === i ? [{ ...a, endSec: b.endSec, text: `${a.text} ${b.text}` }] : n === i + 1 ? [] : [x])));
  };

  const baseName = (mediaName || track?.name || 'captions').replace(/\.[^.]+$/, '');
  const info = CAPTION_FORMATS.find((f) => f.id === format)!;

  const runExport = async () => {
    setExporting(true); setExportError(null); setExportResult(null);
    try {
      const effectiveRateId = format === 'scc' ? sccRate : rate.id;
      const written = writeCaptions(cues, format, { rateId: effectiveRateId, startTc: startFrame ? startTc : undefined, durationSec: duration || undefined, maxRows: +maxRows });
      const name = `${baseName}.${written.ext}`;
      const report = format === 'mcc' || format === 'scc' ? verifyBroadcast(written, format, { startTc: startFrame ? startTc : undefined }) : undefined;
      const message = await onSave(name, written.text, written.mime);
      const res: ExportResult = { message, report, text: written.text, name };
      setExportResult(res);
      if (report && onIndependentCheck && written.rate) {
        const independent = await onIndependentCheck(name, written.text, written.encodedCues ?? cues, written.rate, startFrame ? startTc : '');
        setExportResult({ ...res, independent });
      }
    } catch (e: any) {
      setExportError(e?.message || String(e));
    } finally {
      setExporting(false);
    }
  };

  const openExportedOverVideo = () => {
    if (!exportResult) return;
    const doc = readCaptions(exportResult.name, exportResult.text, { startTc: startFrame ? startTc : undefined });
    onLoadTrack({ name: exportResult.name, cues: doc.cues, sourceFormat: doc.sourceFormat, warnings: doc.warnings, rateId: doc.rateId });
  };

  return (
    <div className="pj-stack">
      {/* Where captions come from */}
      <div>
        <div className="pj-eyebrow mb-2">Source</div>
        {track && (
          <div className="type-body-sm mb-2" style={{ color: 'var(--text-primary)' }}>
            <span style={mono}>{track.name}</span>{track.sourceFormat ? ` · ${track.sourceFormat.toUpperCase()}` : ''} · {cues.length} captions
            {track.warnings.map((w, i) => <div key={i} className="mt-1" style={{ color: 'var(--pj-warning)' }}>{w}</div>)}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={<FileUp />} onClick={onOpenCaptionFile}>Open captions</Button>
          <Button variant="secondary" size="sm" icon={<Mic />} disabled={!canGenerate || !!generating} onClick={onGenerate} title={canGenerate ? 'Listen to this file and write captions, on this device' : 'Open a video or audio file first'}>Generate from audio</Button>
        </div>
        {generating && (
          <div className="mt-3" data-testid="generating">
            <div className="flex items-center justify-between type-body-sm" style={{ color: 'var(--text-primary)' }}>
              <span>{generating.message}{generating.etaSec !== undefined ? ` · ${humanDuration(generating.etaSec)} left` : ''}</span>
              <Button variant="ghost" size="xs" onClick={onCancelGenerate}>Cancel</Button>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden" style={{ background: 'var(--glass-3)', borderRadius: 'var(--pj-radius-full)' }}>
              <div className="h-full transition-all" style={{ width: `${generating.progress * 100}%`, background: 'var(--pj-grad-warm)' }} />
            </div>
          </div>
        )}
      </div>

      {/* Sync */}
      {!!cues.length && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="pj-eyebrow">Sync</div>
            {undo.current && <Button variant="ghost" size="xs" icon={<Undo2 />} onClick={() => { const u = undo.current; undo.current = null; if (u) onChangeCues(u); }}>Undo</Button>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="secondary" size="xs" onClick={() => nudge(-0.5)}>-0.5 s</Button>
            <Button variant="secondary" size="xs" onClick={() => nudge(-frame)}>-1 frame</Button>
            <Button variant="secondary" size="xs" onClick={() => nudge(frame)}>+1 frame</Button>
            <Button variant="secondary" size="xs" onClick={() => nudge(0.5)}>+0.5 s</Button>
            <Button variant="secondary" size="xs" onClick={() => { const s = cues.find((c) => c.id === selectedId) ?? cues[0]; nudge(time - s.startSec); }} title="Slide everything so this caption starts at the playhead">Start at playhead</Button>
          </div>
          <details className="mt-2">
            <summary className="type-label-md cursor-pointer flex items-center gap-1" style={{ color: 'var(--on-surface-variant)' }}><ChevronDown className="w-3.5 h-3.5" /> Fix a frame-rate mismatch</summary>
            <p className="type-body-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>When captions drift further off as the video goes on, they were made for a different rate.</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Button variant="secondary" size="xs" onClick={() => apply(retimeCues(cues, 0, 1001 / 1000))}>Slow 0.1%</Button>
              <Button variant="secondary" size="xs" onClick={() => apply(retimeCues(cues, 0, 1000 / 1001))}>Speed 0.1%</Button>
              <Button variant="secondary" size="xs" onClick={() => apply(retimeCues(cues, 0, 25 / (24000 / 1001)))}>23.976 to 25</Button>
              <Button variant="secondary" size="xs" onClick={() => apply(retimeCues(cues, 0, (24000 / 1001) / 25))}>25 to 23.976</Button>
            </div>
          </details>
        </div>
      )}

      {/* Check */}
      {!!cues.length && (
        <div data-testid="cue-list">
          <div className="flex items-center justify-between mb-2">
            <div className="pj-eyebrow">Captions</div>
            <Chip style={{ color: issues.length ? 'var(--pj-warning)' : 'var(--pj-success)' }}>{issues.length ? `${issues.length} to check` : 'No timing problems'}</Chip>
          </div>
          <div className="max-h-[40vh] overflow-y-auto">
            {cues.map((c, i) => (
              <CueRow key={c.id} cue={c} rate={rate} startFrame={startFrame} selected={c.id === selectedId} issues={byCue.get(c.id) ?? []}
                onSelect={() => { onSelect(c.id); onSeek(c.startSec); }}
                onChange={(p) => patchCue(c.id, p)}
                onDelete={() => apply(cues.filter((x) => x.id !== c.id))}
                onSplit={() => split(c)}
                onMergeNext={i < cues.length - 1 ? () => mergeNext(i) : undefined} />
            ))}
          </div>
        </div>
      )}

      {/* Sidecar */}
      {!!cues.length && (
        <div>
          <div className="pj-eyebrow mb-2">Export sidecar</div>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {CAPTION_FORMATS.map((f) => <Chip key={f.id} interactive selected={f.id === format} onClick={() => setFormat(f.id)} title={f.note}>{f.label}</Chip>)}
          </div>
          <p className="type-body-sm mb-3" style={{ color: 'var(--on-surface-variant)' }}>{info.note}</p>
          {info.broadcast && (
            <>
              {format === 'mcc' ? (
                <Field label="Frame rate" hint="Must match the video on the playout server.">
                  <Select ariaLabel="Frame rate" value={rate.id} onChange={onRate} options={FRAME_RATES.map((r) => ({ value: r.id, label: r.label }))} />
                </Field>
              ) : (
                <Field label="Frame rate" hint="SCC carries 29.97 only.">
                  <Select ariaLabel="SCC frame rate" value={sccRate} onChange={(v) => setSccRate(v as any)} options={[{ value: '29.97df', label: '29.97 fps drop-frame' }, { value: '29.97ndf', label: '29.97 fps non-drop' }]} />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Video starts at"><Input aria-label="Start timecode of the video" style={mono} value={startTc} onChange={(e) => onStartTc(e.target.value)} /></Field>
                <Field label="Rows per caption"><Select ariaLabel="Rows per caption" value={maxRows} onChange={setMaxRows} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }]} /></Field>
              </div>
            </>
          )}
          <Button variant="primary" onClick={runExport} loading={exporting} className="w-full">Export {info.label}</Button>
          {onSendToFabula && <Button variant="secondary" size="sm" onClick={onSendToFabula} className="w-full mt-2">Add to a Fabula timeline</Button>}
          {exportError && <div className="flex gap-1.5 mt-2 type-body-sm" style={{ color: 'var(--pj-danger)' }}><XCircle className="w-4 h-4 shrink-0" /> {exportError}</div>}
          {exportResult && (
            <div ref={resultRef}>
              <p className="type-body-sm mt-2 break-words" style={{ color: 'var(--text-primary)' }}>{exportResult.message}</p>
              {exportResult.report && <ReportView report={exportResult.report} />}
              {exportResult.independent && (
                <div className="flex gap-1.5 mt-2 type-body-sm" data-testid="independent-check" style={{ color: exportResult.independent.ok ? 'var(--pj-success)' : 'var(--pj-warning)' }}>
                  {exportResult.independent.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />} {exportResult.independent.message}
                </div>
              )}
              {(format === 'mcc' || format === 'scc') && <Button variant="secondary" size="sm" className="mt-2" onClick={openExportedOverVideo}>Play this file over the video</Button>}
            </div>
          )}
        </div>
      )}
      {!cues.length && !generating && (
        <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>Open an SRT, VTT, SCC, MCC, TTML, ASS or SBV file to watch it over the video, or generate captions from the audio.</p>
      )}
    </div>
  );
};

export default CaptionsPanel;
