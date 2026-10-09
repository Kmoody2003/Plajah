// "Release later" for standalone videos: a toggle + datetime-local, and (when on) the announcement wording control. The value is
// plain doc fields (isScheduled, releaseDate ms, releaseAnnouncement) so it spreads straight into uploadVideo().
// Also exports the owner-side badge + editor used by VideoManager to change or cancel a schedule.
import React from 'react';
import { ReleaseAnnouncementField } from './ReleaseAnnouncementField';
import type { ReleaseAnnouncementChoice } from '../../services/releases/releaseAnnouncer';
import { isFutureRelease, releaseMs } from '../../services/releases/visibility';

export interface ReleaseLaterValue { isScheduled?: boolean; releaseDate?: number; releaseAnnouncement?: ReleaseAnnouncementChoice }

const pad = (n: number) => String(n).padStart(2, '0');
/** epoch ms -> value for <input type="datetime-local"> in the viewer's local zone. */
export const toLocalInput = (ms: number | undefined): string => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** datetime-local value -> epoch ms (0 when empty/invalid). */
export const fromLocalInput = (s: string): number => { const t = s ? new Date(s).getTime() : NaN; return Number.isFinite(t) ? t : 0; };

export const formatReleaseDate = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** True when the toggle is on but the chosen time is missing or not in the future: the form must block submit. */
export const releaseLaterInvalid = (v: ReleaseLaterValue): boolean => !!v.isScheduled && !((v.releaseDate || 0) > Date.now());

export const ReleaseLaterField: React.FC<{
  value: ReleaseLaterValue; onChange: (v: ReleaseLaterValue) => void; name: string; title: string; noun?: string;
}> = ({ value, onChange, name, title, noun = 'video' }) => {
  const on = value.isScheduled === true;
  const bad = on && !((value.releaseDate || 0) > Date.now());
  return (
    <div className="space-y-3 p-5 bg-white/[0.03] rounded-2xl border border-white/5">
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span>
          <span className="block text-sm font-black uppercase tracking-tight">Release later</span>
          <span className="block text-[9px] font-bold text-white/30 uppercase tracking-widest mt-0.5">
            {on ? 'Only you can see it until the time below' : 'Goes live as soon as it finishes uploading'}
          </span>
        </span>
        <input type="checkbox" className="h-5 w-5 accent-orange-500" checked={on} aria-label="Release later"
          onChange={e => onChange(e.target.checked ? { ...value, isScheduled: true } : { ...value, isScheduled: false, releaseDate: undefined })} />
      </label>
      {on && (
        <div className="space-y-3">
          <input type="datetime-local" aria-label="Release date and time" value={toLocalInput(value.releaseDate)} min={toLocalInput(Date.now())}
            onChange={e => onChange({ ...value, isScheduled: true, releaseDate: fromLocalInput(e.target.value) || undefined })}
            className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs text-white" />
          {bad && <p role="alert" className="text-[11px] text-red-400">Pick a date and time in the future, or turn Release later off.</p>}
          <ReleaseAnnouncementField value={value.releaseAnnouncement} onChange={a => onChange({ ...value, releaseAnnouncement: a })} name={name} noun={noun} title={title} />
        </div>
      )}
    </div>
  );
};

/** Owner view: shown on a video card while it is still scheduled. Renders nothing once released. */
export const ScheduledBadge: React.FC<{ video: { isScheduled?: boolean; releaseDate?: unknown } }> = ({ video }) =>
  isFutureRelease(video) ? (
    <span className="inline-flex items-center rounded-full bg-orange-500/15 text-orange-300 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest">
      Scheduled for {formatReleaseDate(releaseMs(video.releaseDate))}
    </span>
  ) : null;

/** Owner view: change the date, or publish now. onReschedule / onPublishNow call rescheduleVideo(). */
export const ScheduleEditor: React.FC<{
  video: { isScheduled?: boolean; releaseDate?: unknown; title?: string };
  name: string;
  onReschedule: (releaseDate: number) => Promise<void> | void;
  onPublishNow: () => Promise<void> | void;
  busy?: boolean;
}> = ({ video, name, onReschedule, onPublishNow, busy }) => {
  const [local, setLocal] = React.useState(toLocalInput(releaseMs(video.releaseDate)));
  if (!isFutureRelease(video)) return null;
  const ms = fromLocalInput(local);
  return (
    <div className="space-y-2 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3" data-testid="schedule-editor">
      <ScheduledBadge video={video} />
      <div className="flex flex-wrap items-center gap-2">
        <input type="datetime-local" aria-label={`New release time for ${video.title || name}`} value={local} min={toLocalInput(Date.now())} onChange={e => setLocal(e.target.value)}
          className="rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-xs text-white" />
        <button type="button" disabled={busy || !(ms > Date.now())} onClick={() => onReschedule(ms)}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest disabled:opacity-40">Change date</button>
        <button type="button" disabled={busy} onClick={() => onPublishNow()}
          className="rounded-lg bg-orange-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-40">Publish now</button>
      </div>
    </div>
  );
};
