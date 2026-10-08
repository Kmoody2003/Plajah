import React, { useState } from 'react';
import { Flag, X as XIcon, Check } from 'lucide-react';
import Portal from '../Portal';
import { REPORT_REASONS, type SocialReportReason, type ReportTargetType } from '../../services/socialSafetyCore';
import { reportContent } from '../../services/contentSafetyService';
import { auth } from '../../services/firebase';
import { tryConsume, formatRetry } from '../../services/socialRateLimit';

export interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  /** post id / comment id / profile uid / live stream id. */
  targetId: string;
  /** Uid of whoever authored the reported thing. */
  targetUid?: string;
  /** For comments: the post the comment lives on. */
  parentId?: string;
  /** Text of the reported content, stored with the report (trimmed to 500 chars). */
  snapshot?: string;
  targetName?: string;
}

const NOUN: Record<ReportTargetType, string> = { post: 'post', comment: 'comment', profile: 'profile', live: 'live stream' };

const ReportDialog: React.FC<ReportDialogProps> = ({ open, onClose, targetType, targetId, targetUid, parentId, snapshot, targetName }) => {
  const [reason, setReason] = useState<SocialReportReason | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'duplicate' | 'error'>('idle');
  const [error, setError] = useState('');

  if (!open) return null;

  const close = () => { setReason(null); setNote(''); setState('idle'); setError(''); onClose(); };

  const submit = async () => {
    const uid = auth.currentUser?.uid;
    if (!reason || !uid) return;
    const rate = tryConsume(uid, 'report', auth.currentUser?.metadata?.creationTime ? Date.parse(auth.currentUser.metadata.creationTime) : null);
    if (!rate.ok) { setState('error'); setError(`You are reporting very quickly. Try again in ${formatRetry(rate.retryAfterMs)}.`); return; }
    setState('sending');
    try {
      const res = await reportContent({
        contentId: targetId,
        contentType: targetType,
        reason,
        details: note.trim() || undefined,
        authorId: targetUid,
        snapshot: snapshot?.slice(0, 500),
        parentId,
      });
      setState(res.duplicate ? 'duplicate' : 'done');
    } catch (e: any) {
      setState('error');
      setError(e?.message || 'Could not send your report. Please try again.');
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[310] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={close} role="dialog" aria-modal="true" aria-label={`Report ${NOUN[targetType]}`}>
        <div className="w-full max-w-md bg-[#0e0e0e] border border-white/10 rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <Flag size={15} className="text-red-400" />
              <h2 className="text-xs font-black uppercase tracking-widest text-white">Report {NOUN[targetType]}</h2>
            </div>
            <button onClick={close} className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10" aria-label="Close"><XIcon size={16} /></button>
          </div>

          {state === 'done' || state === 'duplicate' ? (
            <div className="px-6 pb-6 pt-2 text-center space-y-4">
              <div className="mx-auto w-11 h-11 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"><Check size={18} className="text-emerald-400" /></div>
              <p className="text-sm font-bold text-white">{state === 'done' ? 'Thanks, we got your report.' : 'You already reported this.'}</p>
              <p className="text-[11px] text-white/45 leading-relaxed">
                Our team reviews reports. You can also mute or block {targetName ? `@${targetName}` : 'this person'} from the ... menu so you do not see them.
              </p>
              <button onClick={close} className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-widest text-white">Done</button>
            </div>
          ) : (
            <div className="px-6 pb-6 space-y-4">
              <p className="text-[11px] text-white/45">Why are you reporting this {NOUN[targetType]}?</p>
              <div className="space-y-1.5" role="radiogroup">
                {REPORT_REASONS.map(r => (
                  <button
                    key={r.id}
                    role="radio"
                    aria-checked={reason === r.id}
                    onClick={() => setReason(r.id)}
                    className={`w-full text-left px-4 py-2.5 rounded-xl border text-[12px] font-bold transition-all ${reason === r.id ? 'border-small-orange/60 bg-small-orange/10 text-white' : 'border-white/8 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value.slice(0, 1000))}
                placeholder="Anything else we should know? (optional)"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-small-orange/50"
              />
              {state === 'error' && <p className="text-[11px] text-red-400">{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={close} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">Cancel</button>
                <button
                  onClick={submit}
                  disabled={!reason || state === 'sending'}
                  className="px-5 py-2.5 rounded-xl bg-red-500/90 hover:bg-red-500 disabled:opacity-40 text-[10px] font-black uppercase tracking-widest text-white"
                >
                  {state === 'sending' ? 'Sending...' : 'Submit report'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
};

export default ReportDialog;
