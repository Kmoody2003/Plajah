// An Audius track's comment thread, inline under its post in the Social Stream. Reads are public;
// posting goes to Audius as the connected user (it asks for upload/write permission the first time).
import React, { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fetchAudiusTrackComments, postAudiusTrackComment, type AudiusComment } from '../../services/audiusService';

interface Props {
  /** Hash id (`audius_abc` or `abc`) for reading. */
  trackId: string;
  /** Numeric id Audius needs to post. Missing → read-only. */
  trackNumericId?: number;
  disabled?: boolean;
  onPosted?: () => void;
}

const AudiusComments: React.FC<Props> = ({ trackId, trackNumericId, disabled, onPosted }) => {
  const [comments, setComments] = useState<AudiusComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fetchAudiusTrackComments(trackId, 20).then(c => { if (alive) setComments(c); });
    return () => { alive = false; };
  }, [trackId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || posting || trackNumericId === undefined) return;
    setPosting(true); setErr('');
    const c = await postAudiusTrackComment(trackNumericId, text);
    setPosting(false);
    if (!c) { setErr("Audius didn't take that comment. Reconnect Audius and try again."); return; }
    setDraft('');
    setComments(cur => [c, ...(cur ?? [])]);
    onPosted?.();
  };

  const canPost = !disabled && trackNumericId !== undefined;
  return (
    <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 space-y-3">
      {canPost ? (
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value.slice(0, 500))}
            onKeyDown={e => { if (e.key === 'Enter') void send(); }}
            placeholder="Comment on Audius"
            aria-label="Comment on Audius"
            className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-purple-400/50"
          />
          <button type="button" onClick={() => void send()} disabled={!draft.trim() || posting} aria-label="Post comment"
            className="w-8 h-8 rounded-full bg-purple-500 hover:bg-purple-400 disabled:opacity-40 text-black flex items-center justify-center shrink-0">
            {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-white/35">{disabled ? 'The artist turned comments off for this track.' : 'Open on Audius to comment.'}</p>
      )}
      {err && <p className="text-[11px] text-red-400">{err}</p>}
      {comments === null ? (
        <p className="flex items-center gap-2 text-[12px] text-white/35"><Loader2 size={12} className="animate-spin" /> Loading comments</p>
      ) : comments.length === 0 ? (
        <p className="text-[12px] text-white/35">No comments yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {comments.map(c => (
            <li key={c.id} className="flex gap-2">
              <div className="w-7 h-7 rounded-full overflow-hidden bg-white/5 border border-white/10 shrink-0">
                {c.userAvatar
                  ? <img src={c.userAvatar} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                  : <span className="w-full h-full flex items-center justify-center text-[11px] font-black text-white/50">{c.userName[0]?.toUpperCase()}</span>}
              </div>
              <div className="min-w-0">
                <p className="text-[12px] leading-tight">
                  <span className="font-bold text-white/85">{c.userName}</span>
                  {c.userHandle && <span className="text-white/30"> @{c.userHandle}</span>}
                  <span className="text-white/30"> · {formatDistanceToNow(c.createdAt, { addSuffix: true })}</span>
                </p>
                <p className="text-[13px] text-white/75 whitespace-pre-wrap break-words">{c.message}</p>
                {c.replies && c.replies.length > 0 && (
                  <p className="text-[11px] text-white/30 mt-0.5">{c.replies.length} {c.replies.length === 1 ? 'reply' : 'replies'}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AudiusComments;
