import React, { useMemo } from 'react';
import { Layers, ListPlus } from 'lucide-react';
import { Button, Chip, Input } from '../ui';
import { HW_OPTIONS, IMAGE_FORMATS, RECIPE_PRESETS, audioCodecsFor, containersFor, extFor, videoCodecsFor, buildFfmpegArgs, type MediaKind, type Recipe, type SourceFile } from '../../services/crossover';
import { Field, Segmented, Select, Toggle, mono } from './shared';

interface Props {
  source: SourceFile | null;
  recipe: Recipe;
  onChange: (p: Partial<Recipe>) => void;
  onQueue: () => void;
  onQueueAll?: () => void;
  otherCount: number;
  /** Encoders in the installed ffmpeg, on desktop. */
  encoders?: string[];
  /** Why this device can't do this conversion, if it can't. */
  blockedReason?: string | null;
  engineLabel: string;
  outputFolder?: string | null;
  onPickFolder?: () => void;
  /** The version line of the installed ffmpeg, on desktop. */
  engineVersion?: string;
}

const ConvertPanel: React.FC<Props> = ({ source, recipe, onChange, onQueue, onQueueAll, otherCount, encoders, blockedReason, engineLabel, outputFolder, onPickFolder, engineVersion }) => {
  const kind: MediaKind = source?.kind ?? 'video';
  const containers = useMemo(() => containersFor(kind === 'video' ? 'video' : kind).concat(kind === 'video' ? containersFor('audio').filter((c) => !c.kinds.includes('video')) : []), [kind]);
  const audioOnlyTarget = !containers.find((c) => c.id === recipe.containerId)?.kinds.includes('video');
  const showVideo = kind === 'video' && !audioOnlyTarget && recipe.containerId !== 'gif';
  const presets = RECIPE_PRESETS.filter((p) => p.kinds.includes(kind));
  const vcodecs = videoCodecsFor(recipe.containerId);
  const acodecs = audioCodecsFor(recipe.containerId);

  // Changing container can strand a codec it can't hold; pull the codecs back into range.
  const pickContainer = (id: string) => {
    const v = videoCodecsFor(id);
    const a = audioCodecsFor(id);
    onChange({
      containerId: id,
      videoCodecId: v.find((c) => c.id === recipe.videoCodecId)?.id ?? v[0]?.id,
      audioCodecId: a.find((c) => c.id === recipe.audioCodecId)?.id ?? a[0]?.id,
    });
  };

  const command = source ? `ffmpeg ${buildFfmpegArgs(source.name, recipe, `${source.name.replace(/\.[^.]+$/, '')}.${extFor(recipe, kind)}`, kind, encoders).map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ')}` : '';

  if (!source) return <p className="type-body-md" style={{ color: 'var(--on-surface-variant)' }}>Open a file to choose what to make from it.</p>;

  return (
    <div>
      {!!presets.length && kind !== 'image' && (
        <div className="mb-4">
          <div className="pj-eyebrow mb-2">Presets</div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <Chip key={p.id} interactive title={p.note} onClick={() => onChange({ ...p.recipe })}
                selected={recipe.containerId === p.recipe.containerId && recipe.videoCodecId === (p.recipe.videoCodecId ?? recipe.videoCodecId) && recipe.height === p.recipe.height && recipe.crf === (p.recipe.crf ?? recipe.crf)}>
                {p.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {kind === 'image' ? (
        <Field label="Image format" hint={IMAGE_FORMATS.find((f) => f.id === recipe.imageFormatId)?.note}>
          <Select ariaLabel="Image format" value={recipe.imageFormatId} onChange={(v) => onChange({ imageFormatId: v })} options={IMAGE_FORMATS.map((f) => ({ value: f.id, label: f.label }))} />
        </Field>
      ) : (
        <>
          <Field label="Container" hint={containers.find((c) => c.id === recipe.containerId)?.note}>
            <Select ariaLabel="Container" value={recipe.containerId} onChange={pickContainer} options={containers.map((c) => ({ value: c.id, label: c.label }))} />
          </Field>
          {showVideo && (
            <Field label="Video codec" hint={vcodecs.find((c) => c.id === recipe.videoCodecId)?.note}>
              <Select ariaLabel="Video codec" value={recipe.videoCodecId} onChange={(v) => onChange({ videoCodecId: v })} options={vcodecs.map((c) => ({ value: c.id, label: c.label }))} />
            </Field>
          )}
          {recipe.containerId !== 'gif' && (
            <Field label="Audio codec">
              <Select ariaLabel="Audio codec" value={recipe.audioCodecId} onChange={(v) => onChange({ audioCodecId: v })} options={acodecs.map((c) => ({ value: c.id, label: c.label }))} />
            </Field>
          )}
          {showVideo && recipe.videoCodecId === 'prores' && (
            <Field label="ProRes flavor">
              <Select ariaLabel="ProRes flavor" value={recipe.proresProfile ?? '3'} onChange={(v) => onChange({ proresProfile: v })} options={[{ value: '0', label: 'Proxy' }, { value: '1', label: 'LT' }, { value: '2', label: '422' }, { value: '3', label: '422 HQ' }, { value: '4', label: '4444' }]} />
            </Field>
          )}
          {showVideo && recipe.videoCodecId === 'dnxhr' && (
            <Field label="DNxHR flavor">
              <Select ariaLabel="DNxHR flavor" value={recipe.dnxProfile ?? 'dnxhr_hq'} onChange={(v) => onChange({ dnxProfile: v })} options={[{ value: 'dnxhr_lb', label: 'LB' }, { value: 'dnxhr_sq', label: 'SQ' }, { value: 'dnxhr_hq', label: 'HQ' }, { value: 'dnxhr_hqx', label: 'HQX (10-bit)' }, { value: 'dnxhr_444', label: '444 (10-bit)' }]} />
            </Field>
          )}
          {showVideo && encoders && (
            <Field label="Encoder">
              <Select ariaLabel="Encoder" value={recipe.hwAccel} onChange={(v) => onChange({ hwAccel: v as Recipe['hwAccel'] })}
                options={HW_OPTIONS.filter((h) => h.id === 'auto' || h.id === 'none' || encoders.some((e) => e.endsWith(`_${h.id}`))).map((h) => ({ value: h.id, label: h.label }))} />
            </Field>
          )}
          {showVideo && (
            <>
              <Field label="Quality">
                <Segmented value={recipe.qualityMode} onChange={(m) => onChange({ qualityMode: m })} options={[
                  { value: 'crf', label: 'Quality' }, { value: 'bitrate', label: 'Bitrate' }, { value: 'lossless', label: 'Lossless' },
                ]} />
              </Field>
              {recipe.qualityMode === 'crf' && (
                <Field label={`Quality level ${recipe.crf ?? 20}`} hint="Lower is better and bigger. 18 to 23 suits most work.">
                  <input aria-label="Quality level" type="range" min={0} max={51} value={recipe.crf ?? 20} onChange={(e) => onChange({ crf: +e.target.value })} className="w-full" style={{ accentColor: 'var(--pj-orange)' }} />
                </Field>
              )}
              {recipe.qualityMode === 'bitrate' && (
                <Field label="Video bitrate"><Input aria-label="Video bitrate" value={recipe.videoBitrate ?? ''} placeholder="8M" onChange={(e) => onChange({ videoBitrate: e.target.value })} /></Field>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Field label="Width"><Input aria-label="Width" inputMode="numeric" value={recipe.width ?? ''} placeholder="Same" onChange={(e) => onChange({ width: e.target.value ? +e.target.value : undefined })} /></Field>
                <Field label="Height"><Input aria-label="Height" inputMode="numeric" value={recipe.height ?? ''} placeholder="Same" onChange={(e) => onChange({ height: e.target.value ? +e.target.value : undefined })} /></Field>
                <Field label="FPS"><Input aria-label="Frames per second" inputMode="decimal" value={recipe.fps ?? ''} placeholder="Same" onChange={(e) => onChange({ fps: e.target.value ? +e.target.value : undefined })} /></Field>
              </div>
            </>
          )}
          <Toggle label="Stereo downmix" sub="Fold surround sound to two channels" on={!!recipe.binauralDownmix} onToggle={() => onChange({ binauralDownmix: !recipe.binauralDownmix })} />
          <Toggle label="Repair timestamps" sub="Fixes stutter and sync from bad recordings" on={!!recipe.fixTimestamps} onToggle={() => onChange({ fixTimestamps: !recipe.fixTimestamps })} />
          <Toggle label="Strip metadata" sub="Remove tags and embedded data" on={!!recipe.stripMetadata} onToggle={() => onChange({ stripMetadata: !recipe.stripMetadata })} />
        </>
      )}

      {onPickFolder && (
        <div className="flex items-center gap-2 mt-3">
          <div className="min-w-0 flex-1">
            <div className="type-label-md" style={{ color: 'var(--on-surface-variant)' }}>Save to</div>
            <div className="type-body-sm truncate" style={{ color: 'var(--text-primary)' }}>{outputFolder || 'Next to the source file'}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onPickFolder}>Change</Button>
        </div>
      )}

      <details className="mt-3">
        <summary className="type-label-md cursor-pointer" style={{ color: 'var(--on-surface-variant)' }}>The ffmpeg command</summary>
        <div className="mt-2 p-3 type-body-sm break-all" style={{ ...mono, background: 'var(--glass-1)', border: '1px solid var(--m3-border)', borderRadius: 'var(--pj-radius-sm)', color: 'var(--text-secondary)' }} data-testid="ffmpeg-command">{command}</div>
      </details>

      <details className="mt-3" data-testid="engine-licence">
        <summary className="type-label-md cursor-pointer" style={{ color: 'var(--on-surface-variant)' }}>About the engine</summary>
        <div className="mt-2 type-body-sm pj-stack-2" style={{ color: 'var(--text-secondary)' }}>
          {engineVersion && <p style={mono}>{engineVersion}</p>}
          <p>
            Crossover converts with FFmpeg, a separate program by the <a className="underline" href="https://ffmpeg.org" target="_blank" rel="noreferrer">FFmpeg developers</a>, under the <a className="underline" href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noreferrer">GNU GPL version 3</a>, with no warranty.
            Its <a className="underline" href="https://github.com/FFmpeg/FFmpeg" target="_blank" rel="noreferrer">source</a> and <a className="underline" href="https://github.com/BtbN/FFmpeg-Builds" target="_blank" rel="noreferrer">build scripts</a> are public. For the complete source of your copy, write to legal@plajah.com.
          </p>
        </div>
      </details>

      <p className="type-body-sm mt-3" style={{ color: blockedReason ? 'var(--pj-warning)' : 'var(--on-surface-variant)' }}>{blockedReason || engineLabel}</p>

      <div className="mt-3 flex flex-col gap-2">
        <Button variant="primary" size="lg" icon={<ListPlus />} onClick={onQueue} disabled={!!blockedReason}>Convert</Button>
        {otherCount > 0 && onQueueAll && <Button variant="secondary" icon={<Layers />} onClick={onQueueAll}>Convert all {otherCount + 1} files</Button>}
      </div>
    </div>
  );
};

export default ConvertPanel;
