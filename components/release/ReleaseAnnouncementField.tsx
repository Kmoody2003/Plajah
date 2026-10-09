// ReleaseAnnouncementField — the "announce this release" control shown wherever a creator sets a release time
// (albums/books/movies, videos, articles). On by default with the platform's default wording; the creator can edit the message
// or switch it off. Stored on the content doc as `releaseAnnouncement: { enabled, message }` and used by the server sweep
// (services/releases/releaseAnnouncer.ts) to post to the creator's feed at the moment of release.
import React from 'react';
import { MAX_ANNOUNCE_CHARS, defaultAnnouncement, renderAnnouncement, type ReleaseAnnouncementChoice } from '../../services/releases/releaseAnnouncer';

export interface ReleaseAnnouncementFieldProps {
  value: ReleaseAnnouncementChoice | undefined;
  onChange: (v: ReleaseAnnouncementChoice) => void;
  /** Creator's display name, for the live preview. */
  name: string;
  /** "book", "album", "video", "article"... */
  noun: string;
  title: string;
}

export const ReleaseAnnouncementField: React.FC<ReleaseAnnouncementFieldProps> = ({ value, onChange, name, noun, title }) => {
  const enabled = value?.enabled !== false;                    // default ON
  const message = value?.message ?? '';
  const who = name || 'You';
  const what = title.trim() || 'your title';
  const preview = renderAnnouncement({ message }, { name: who, noun, title: what });
  const id = React.useId();
  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-orange-500" checked={enabled} onChange={e => onChange({ ...value, enabled: e.target.checked })} />
        <span>
          <span className="block text-xs font-black text-white">Announce on my feed when this goes live</span>
          <span className="block text-[11px] text-white/50">Posts to your feed and notifies your followers the moment it releases. You can change this any time before then.</span>
        </span>
      </label>
      {enabled && (
        <div className="space-y-1.5">
          <label htmlFor={id} className="block text-[9px] font-black uppercase tracking-widest text-white/30">Your message (optional)</label>
          <textarea
            id={id} rows={2} maxLength={MAX_ANNOUNCE_CHARS} value={message}
            onChange={e => onChange({ ...value, enabled: true, message: e.target.value })}
            placeholder={defaultAnnouncement(who, noun, what)}
            className="w-full resize-none rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-xs text-white placeholder:text-white/30"
          />
          <div className="flex justify-between gap-3 text-[10px] text-white/40">
            <span>Leave blank to use the default shown above. Use {'{title}'} to insert the title.</span>
            <span aria-live="polite">{message.length}/{MAX_ANNOUNCE_CHARS}</span>
          </div>
          <p className="rounded-lg bg-black/30 px-3 py-2 text-[11px] text-white/70"><span className="text-white/30">Preview: </span>{preview}</p>
        </div>
      )}
    </div>
  );
};
export default ReleaseAnnouncementField;
