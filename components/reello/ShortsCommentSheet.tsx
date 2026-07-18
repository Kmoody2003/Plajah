// ShortsCommentSheet — comments for the vertical feed that DON'T cover the video.
//
// TikTok/Reels slide a sheet over the lower half of the clip; the thing you're reacting to is
// half-hidden behind it. Here the sheet claims the bottom band and the feed shrinks the video
// into the band above it (see SHEET_VH — the caller applies the matching transform), so the
// whole frame stays visible while you read and type.
//
// Degrades silently: not open → renders null. Comment loading failures leave an empty sheet
// rather than an error surface.

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageCircle, Send, Loader2 } from 'lucide-react';
import { Video, VideoComment } from '../../types';
import { listenToVideoComments, postVideoComment } from '../../services/backendService';

/** Share of the viewport height the sheet occupies. The caller scales the video into 100-this. */
export const SHEET_VH = 52;

function timeAgo(ts?: number) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

interface Props {
  video: Video;
  open: boolean;
  onClose: () => void;
  /** Signed-in user; when absent the composer invites sign-in instead of posting. */
  currentUser?: { uid?: string; displayName?: string | null; photoURL?: string | null } | null;
  /** Report the live comment count back to the feed's action bar. */
  onCountChange?: (n: number) => void;
}

const ShortsCommentSheet: React.FC<Props> = ({ video, open, onClose, currentUser, onCountChange }) => {
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Subscribe only while open — the shorts feed swaps videos constantly.
  useEffect(() => {
    if (!open || !video?.id) return;
    setLoading(true);
    let unsub: (() => void) | undefined;
    try {
      unsub = listenToVideoComments(video.id, list => {
        setComments(list || []);
        setLoading(false);
        onCountChange?.((list || []).length);
      });
    } catch {
      setLoading(false);
    }
    return () => { try { unsub?.(); } catch { /* */ } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, video?.id]);

  useEffect(() => { setText(''); }, [video?.id]);

  const submit = async () => {
    const body = text.trim();
    if (!body || posting || !currentUser?.uid) return;
    setPosting(true);
    try {
      await postVideoComment(video.id, body);
      setText('');
    } catch {
      /* the listener is the source of truth; a failed post just leaves the draft */
    } finally {
      setPosting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          style={{ height: `${SHEET_VH}vh` }}
          onClick={e => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 z-40 flex flex-col bg-[#0a0a0a]/97 backdrop-blur-2xl border-t border-white/10 rounded-t-[1.75rem] shadow-[0_-20px_60px_rgba(0,0,0,0.8)]"
        >
          {/* Grab handle + header */}
          <div className="shrink-0 pt-2.5 pb-3 px-5 border-b border-white/5">
            <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-3" />
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white">
                <MessageCircle size={13} className="text-white/35" />
                Comments
                <span className="text-white/25">{comments.length}</span>
              </h3>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-white/30">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-center py-10 text-[9px] font-black uppercase tracking-widest text-white/25">
                No comments yet — say the first thing.
              </p>
            ) : (
              comments.map(c => {
                const author = c.userName || 'Someone';
                const photo  = c.userPhoto;
                const body   = c.text || '';
                return (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 shrink-0">
                      {photo
                        ? <img src={photo} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        : <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-white/40">{author[0]}</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 leading-none">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/70 truncate">{author}</span>
                        <span className="text-[8px] font-bold text-white/25 shrink-0">{timeAgo(c.timestamp)}</span>
                      </p>
                      <p className="mt-1.5 text-[12px] text-white/70 leading-relaxed break-words">{body}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Composer */}
          <div className="shrink-0 px-4 py-3 border-t border-white/5">
            {currentUser?.uid ? (
              <div className="flex items-center gap-2">
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                  placeholder="Add a comment…"
                  className="flex-1 bg-white/5 border border-white/10 focus:border-white/30 rounded-full px-4 py-2.5 text-[12px] outline-none transition-all placeholder:text-white/20"
                />
                <button
                  onClick={submit}
                  disabled={!text.trim() || posting}
                  className="w-10 h-10 rounded-full bg-white text-black hover:bg-[#FF8C00] hover:text-white flex items-center justify-center transition-all disabled:opacity-30 shrink-0"
                >
                  {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
            ) : (
              <p className="text-center py-2 text-[9px] font-black uppercase tracking-widest text-white/30">
                Sign in to join the conversation
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShortsCommentSheet;
