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
import { X, MessageCircle, Send, Loader2, Sparkles } from 'lucide-react';
import { Video, VideoComment } from '../../types';
import { listenToVideoComments, postVideoComment } from '../../services/backendService';
import GifStickerPicker from '../GifStickerPicker';

/** Share of the viewport height the sheet occupies. The caller scales the video into 100-this. */
export const SHEET_VH = 56;

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
  const [pendingGif, setPendingGif] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
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

  useEffect(() => { setText(''); setPendingGif(null); }, [video?.id]);

  const submit = async () => {
    const body = text.trim();
    if ((!body && !pendingGif) || posting || !currentUser?.uid) return;
    setPosting(true);
    try {
      await postVideoComment(video.id, body, undefined, pendingGif || undefined);
      setText('');
      setPendingGif(null);
    } catch {
      /* the listener is the source of truth; a failed post leaves the draft */
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
          className="absolute inset-x-0 bottom-0 z-40 flex flex-col bg-[#0d0c12]/98 backdrop-blur-3xl border-t border-white/10 rounded-t-[2rem] shadow-[0_-24px_80px_rgba(0,0,0,0.9)]"
        >
          {/* Grab handle + header */}
          <div className="shrink-0 pt-3 pb-3 px-6 border-b border-white/8 bg-white/[0.02]">
            <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-3" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                  <MessageCircle size={14} className="text-white/40" />
                  Comments
                  <span className="text-white/30 font-bold ml-1">({comments.length})</span>
                </h3>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors active:scale-95"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-white/30">
                <Loader2 size={20} className="animate-spin text-orange-400" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-14 select-none">
                <p className="text-[11px] font-black uppercase tracking-widest text-white/30">
                  No comments yet — say the first thing.
                </p>
              </div>
            ) : (
              comments.map(c => {
                const author = c.userName || 'Someone';
                const photo  = c.userPhoto;
                const body   = c.text || '';
                return (
                  <div key={c.id} className="flex gap-3.5 items-start">
                    <div className="w-9 h-9 rounded-2xl overflow-hidden bg-white/10 shrink-0 ring-1 ring-white/10">
                      {photo
                        ? <img src={photo} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        : <div className="w-full h-full flex items-center justify-center text-xs font-black text-white/50 bg-gradient-to-tr from-purple-500/30 to-orange-500/30">{author[0]}</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="bg-white/[0.05] hover:bg-white/[0.08] transition-colors rounded-2xl rounded-tl-sm px-4 py-3 border border-white/5">
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                          <span className="text-xs font-black text-orange-400 uppercase tracking-wider truncate">{author}</span>
                          <span className="text-[10px] font-bold text-white/30 shrink-0">{timeAgo(c.timestamp)}</span>
                        </div>
                        {body && (
                          <p className="text-[13.5px] text-white/90 leading-relaxed break-words font-medium">{body}</p>
                        )}
                        {c.gifUrl && (
                          <div className="mt-2.5 rounded-xl overflow-hidden border border-white/10 max-w-[240px] shadow-lg">
                            <img src={c.gifUrl} alt="GIF" className="w-full h-auto object-cover" loading="lazy" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pending GIF Attachment pill */}
          {pendingGif && (
            <div className="px-6 py-2 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={pendingGif} alt="Selected GIF" className="w-10 h-10 rounded-lg object-cover border border-white/20" />
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-300">GIF attached</span>
              </div>
              <button onClick={() => setPendingGif(null)} className="text-white/40 hover:text-red-400 p-1">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Composer */}
          <div className="shrink-0 px-5 py-4 border-t border-white/8 bg-black/40 relative">
            {currentUser?.uid ? (
              <div className="flex items-center gap-2.5">
                <div className="flex-1 relative flex items-center">
                  <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => {
                      e.stopPropagation();
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
                    }}
                    onKeyUp={e => e.stopPropagation()}
                    placeholder="Add a comment…"
                    className="w-full bg-white/[0.07] border border-white/15 focus:border-orange-500/60 focus:bg-white/[0.1] rounded-full pl-5 pr-20 py-3 text-[13.5px] text-white placeholder-white/30 outline-none transition-all"
                  />
                  <div className="absolute right-2.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowGifPicker(v => !v)}
                      title="Add GIF"
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all ${
                        showGifPicker || pendingGif
                          ? 'bg-purple-500 text-white border-purple-400'
                          : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border-purple-400/30'
                      }`}
                    >
                      GIF
                    </button>
                  </div>
                </div>

                <button
                  onClick={submit}
                  disabled={(!text.trim() && !pendingGif) || posting}
                  className="w-11 h-11 rounded-full bg-white text-black hover:bg-orange-500 hover:text-white flex items-center justify-center transition-all disabled:opacity-30 shrink-0 shadow-lg active:scale-95"
                >
                  {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>

                {/* GIF Sticker Picker Modal */}
                <AnimatePresence>
                  {showGifPicker && (
                    <>
                      <div className="fixed inset-0 z-[190]" onClick={() => setShowGifPicker(false)} />
                      <GifStickerPicker
                        onClose={() => setShowGifPicker(false)}
                        anchorClass="bottom-full mb-3 right-4 sm:right-6"
                        onSelect={async (url) => {
                          setShowGifPicker(false);
                          setPendingGif(url);
                        }}
                      />
                    </>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <p className="text-center py-2 text-[10px] font-black uppercase tracking-widest text-white/40">
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
