/**
 * Small composer sub-panels used by UniversalPostComposer (postingPower mode):
 *   <ReplyAudiencePicker value onChange />            who can reply (UI-level; see canReply)
 *   <AltTextPanel attachments onChange />             per-image description + AI suggest
 *   <DraftsAndScheduledPanel uid current onLoad onClose />   saved drafts + scheduled list/cancel
 */
import React, { useEffect, useState } from 'react';
import { MessageCircle, Sparkles, Trash2, X, Clock, FileText } from 'lucide-react';
import {
  REPLY_AUDIENCES, type ReplyAudience, type Draft, type DraftData,
} from '../../../services/postingLogic';
import { suggestAltText } from '../../../services/altTextService';
import { listDrafts, deleteDraft, saveDraft, newDraftId } from '../../../services/draftService';
import {
  listenToScheduled, cancelScheduled, type ScheduledPost,
} from '../../../services/scheduledPostService';

// ── Reply audience ───────────────────────────────────────────────────────────

export const ReplyAudiencePicker: React.FC<{ value: ReplyAudience; onChange: (v: ReplyAudience) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const cur = REPLY_AUDIENCES.find(a => a.id === value) ?? REPLY_AUDIENCES[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Who can reply"
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${value === 'everyone' ? 'border-white/10 text-white/35 hover:text-white/60' : 'border-small-orange/40 text-small-orange bg-small-orange/10'}`}
      >
        <MessageCircle size={11} />{cur.label}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-40 w-60 rounded-2xl bg-[#101010] border border-white/10 shadow-2xl py-1">
          <p className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/30">Who can reply?</p>
          {REPLY_AUDIENCES.map(a => (
            <button key={a.id} onClick={() => { onChange(a.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 hover:bg-white/5 ${a.id === value ? 'bg-white/5' : ''}`}>
              <p className="text-xs font-bold">{a.label}</p>
              <p className="text-[10px] text-white/35">{a.hint}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Alt text ─────────────────────────────────────────────────────────────────

interface AltAttachment { type: string; url: string; alt?: string; file?: File }

export const AltTextPanel: React.FC<{
  attachments: AltAttachment[];
  onChange: (index: number, alt: string) => void;
}> = ({ attachments, onChange }) => {
  const [busy, setBusy] = useState<number | null>(null);
  const rows = attachments.map((a, i) => ({ a, i })).filter(({ a }) => a.type === 'PHOTO' || a.type === 'GIF');
  if (!rows.length) return null;

  const suggest = async (i: number, url: string) => {
    setBusy(i);
    const alt = await suggestAltText(url);
    if (alt) onChange(i, alt);
    setBusy(null);
  };

  return (
    <div className="space-y-2 pl-0 sm:pl-12">
      {rows.map(({ a, i }) => {
        const missing = !(a.alt || '').trim();
        return (
          <div key={i} className="flex items-center gap-2">
            <img src={a.url} alt="" className="w-9 h-9 rounded-lg object-cover border border-white/10 shrink-0" />
            <input
              value={a.alt || ''}
              maxLength={1000}
              onChange={e => onChange(i, e.target.value)}
              placeholder={missing ? 'Add description (helps people using screen readers)' : ''}
              aria-label={`Description for image ${i + 1}`}
              className={`flex-1 min-w-0 bg-white/[0.04] rounded-xl px-3 py-2 text-xs outline-none border ${missing ? 'border-amber-400/30' : 'border-white/10'} placeholder:text-amber-200/50`}
            />
            <button
              onClick={() => void suggest(i, a.url)}
              disabled={busy !== null}
              title="Suggest a description with AI (you can edit it)"
              className="p-2 rounded-xl text-white/40 hover:text-small-orange hover:bg-white/8 disabled:opacity-40"
            >
              <Sparkles size={14} className={busy === i ? 'animate-pulse' : ''} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

// ── Drafts + scheduled ───────────────────────────────────────────────────────

const fmtWhen = (ts: number) => new Date(ts).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const DraftsAndScheduledPanel: React.FC<{
  uid: string;
  /** The composer's current content, so "Save as draft" can store it. */
  current: DraftData;
  onLoad: (d: Draft) => void;
  onClose: () => void;
}> = ({ uid, current, onLoad, onClose }) => {
  const [tab, setTab] = useState<'drafts' | 'scheduled'>('drafts');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledPost[] | null>(null);

  const refresh = () => listDrafts(uid).then(setDrafts);
  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [uid]);
  useEffect(() => listenToScheduled(uid, setScheduled), [uid]);

  const canSave = (current.text || '').trim().length > 0 || current.attachments.length > 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e0e0e] p-3 space-y-2">
      <div className="flex items-center gap-1">
        {(['drafts', 'scheduled'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${tab === t ? 'bg-small-orange text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
            {t === 'drafts' ? `Drafts${drafts ? ` (${drafts.length})` : ''}` : `Scheduled${scheduled ? ` (${scheduled.length})` : ''}`}
          </button>
        ))}
        <button onClick={onClose} className="ml-auto p-1 text-white/40 hover:text-white" aria-label="Close"><X size={14} /></button>
      </div>

      {tab === 'drafts' && (
        <>
          {canSave && (
            <button
              onClick={async () => { await saveDraft(uid, newDraftId(), current); await refresh(); }}
              className="w-full text-left px-3 py-2 rounded-xl border border-dashed border-white/15 text-xs text-white/55 hover:text-white hover:border-white/30">
              Save what you have as a draft
            </button>
          )}
          {drafts === null ? <div className="h-10 rounded-xl bg-white/[0.03] animate-pulse" />
            : drafts.length === 0 ? <p className="text-xs text-white/35 px-1 py-2">No drafts yet. Anything you start typing is also saved automatically.</p>
            : drafts.map(d => (
              <div key={d.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                <FileText size={13} className="text-white/30 shrink-0" />
                <button onClick={() => onLoad(d)} className="flex-1 min-w-0 text-left">
                  <p className="text-xs truncate">{d.text.trim() || `${d.attachments.length} attachment${d.attachments.length === 1 ? '' : 's'}`}</p>
                  <p className="text-[9px] text-white/30">{d.id === 'autosave' ? 'Autosaved · ' : ''}{fmtWhen(d.updatedAt)}</p>
                </button>
                <button onClick={async () => { await deleteDraft(uid, d.id); await refresh(); }} className="p-1 text-white/30 hover:text-red-300" aria-label="Delete draft"><Trash2 size={13} /></button>
              </div>
            ))}
        </>
      )}

      {tab === 'scheduled' && (
        scheduled === null ? <div className="h-10 rounded-xl bg-white/[0.03] animate-pulse" />
        : scheduled.length === 0 ? <p className="text-xs text-white/35 px-1 py-2">Nothing scheduled. Use the clock to pick a time when you post.</p>
        : scheduled.map(s => (
          <div key={s.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
            <Clock size={13} className="text-small-orange shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate">{s.post.text || 'Media post'}</p>
              <p className="text-[9px] text-white/30">
                {s.status === 'FAILED' ? 'Could not publish · ' : s.status === 'PUBLISHING' ? 'Publishing · ' : ''}{fmtWhen(s.publishAt)}
              </p>
            </div>
            <button onClick={() => void cancelScheduled(s.id)} className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-red-300">Cancel</button>
          </div>
        ))
      )}
    </div>
  );
};
