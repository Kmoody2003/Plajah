import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { MediaProbe, SourceFile } from '../../services/crossover';
import { Stat, humanBitrate, humanDuration, humanSize, mono } from './shared';

function checks(p: MediaProbe): { ok: boolean; text: string }[] {
  const out: { ok: boolean; text: string }[] = [];
  if (p.needsFinalize) out.push({ ok: false, text: 'The file was never finalized. Its index is missing, usually from a crashed recording.' });
  if (p.corrupt) out.push({ ok: false, text: 'The file has structural errors.' });
  for (const w of p.warnings) out.push({ ok: false, text: w });
  if (p.streams?.length) {
    if (p.streams.some((s) => s.type === 'video') && !p.streams.some((s) => s.type === 'audio')) out.push({ ok: false, text: 'No audio track.' });
    if (!p.corrupt && !p.warnings.length) out.push({ ok: true, text: 'The container and streams read cleanly.' });
  }
  return out;
}

const InspectPanel: React.FC<{ source: SourceFile | null; output?: { name: string; sizeBytes?: number; probe?: MediaProbe } | null; probing?: boolean }> = ({ source, output, probing }) => {
  if (!source) return <p className="type-body-md" style={{ color: 'var(--on-surface-variant)' }}>Open a file to check what's really inside it.</p>;
  const p = source.probe;
  return (
    <div className="pj-stack">
      <div>
        <div className="pj-eyebrow mb-2">File</div>
        <Stat label="Name" value={source.name} />
        <Stat label="Size" value={humanSize(source.sizeBytes)} />
        {p && <>
          <Stat label="Format" value={p.formatName || p.container} />
          <Stat label="Duration" value={humanDuration(p.durationSec)} />
          <Stat label="Bitrate" value={humanBitrate(p.bitrate)} />
          <Stat label="Timecode" value={p.streams?.find((s) => s.timecode)?.timecode || p.tags?.timecode} />
        </>}
        {!p && <p className="type-body-sm mt-2" style={{ color: 'var(--on-surface-variant)' }}>{probing ? 'Reading the file' : 'Not read yet.'}</p>}
      </div>

      {p && !!checks(p).length && (
        <div>
          <div className="pj-eyebrow mb-2">Checks</div>
          {checks(p).map((c, i) => (
            <div key={i} className="flex items-start gap-2 py-1 type-body-sm" style={{ color: 'var(--text-primary)' }}>
              {c.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--pj-success)' }} /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--pj-warning)' }} />}
              <span>{c.text}</span>
            </div>
          ))}
        </div>
      )}

      {p?.streams?.length ? (
        <div>
          <div className="pj-eyebrow mb-2">Streams</div>
          {p.streams.map((s) => (
            <div key={s.index} className="mb-2 p-3" style={{ background: 'var(--glass-1)', border: '1px solid var(--m3-border)', borderRadius: 'var(--pj-radius-sm)' }}>
              <div className="type-label-md mb-1" style={{ color: 'var(--text-primary)' }}>#{s.index} {s.type}</div>
              <div className="type-body-sm break-words" style={{ ...mono, color: 'var(--on-surface-variant)' }}>
                {[s.codec, s.profile, s.width && `${s.width}×${s.height}`, s.fps && `${s.fps.toFixed(3)} fps`, s.pixFmt, s.colorSpace, s.fieldOrder, s.sampleRate && `${s.sampleRate / 1000} kHz`, s.channelLayout || (s.channels && `${s.channels} ch`), humanBitrate(s.bitrate), s.language].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))}
        </div>
      ) : p && (
        <div>
          <div className="pj-eyebrow mb-2">Picture and sound</div>
          <Stat label="Resolution" value={p.width ? `${p.width}×${p.height}` : undefined} />
          <Stat label="Frame rate" value={p.fps ? p.fps.toFixed(3) : undefined} />
          <Stat label="Audio" value={p.sampleRate ? `${p.sampleRate / 1000} kHz, ${p.channels} ch` : undefined} />
        </div>
      )}

      {output && (
        <div>
          <div className="pj-eyebrow mb-2">Output</div>
          <Stat label="Name" value={output.name} />
          <Stat label="Size" value={humanSize(output.sizeBytes)} />
          {!!(output.sizeBytes && source.sizeBytes) && <Stat label="Compared with source" value={`${Math.round((output.sizeBytes / source.sizeBytes) * 100)}%`} />}
          {output.probe && <>
            <Stat label="Format" value={output.probe.formatName || output.probe.container} />
            <Stat label="Video" value={[output.probe.videoCodec, output.probe.width && `${output.probe.width}×${output.probe.height}`, output.probe.fps?.toFixed(3)].filter(Boolean).join(' · ')} />
            <Stat label="Audio" value={[output.probe.audioCodec, output.probe.sampleRate && `${output.probe.sampleRate / 1000} kHz`, output.probe.channels && `${output.probe.channels} ch`].filter(Boolean).join(' · ')} />
            <Stat label="Duration" value={output.probe.durationSec !== undefined ? `${humanDuration(output.probe.durationSec)}${p?.durationSec && Math.abs(output.probe.durationSec - p.durationSec) > 0.2 ? ` (source ${humanDuration(p.durationSec)})` : ''}` : undefined} />
          </>}
        </div>
      )}
    </div>
  );
};

export default InspectPanel;
