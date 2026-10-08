import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, Send, Loader2, Clock, Sparkles, X, LogIn } from 'lucide-react';
import { Video, VideoComment } from '../../types';
import { listenToVideoComments, postVideoComment } from '../../services/backendService';
import GifStickerPicker from '../GifStickerPicker';

interface ReelloCommentsProps {
  video: Video;
  currentUser: { uid?: string; displayName?: string | null; photoURL?: string | null } | null;
  onSeek: (seconds: number) => void;
  currentTime: number;
  onCountChange?: (count: number) => void;
}

function timeAgo(ts?: number) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

function formatTimestamp(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

function parseSeconds(str: string): number | null {
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

export const ReelloComments: React.FC<ReelloCommentsProps> = ({
  video,
  currentUser,
  onSeek,
  currentTime,
  onCountChange,
}) => {
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [pendingGif, setPendingGif] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [posting, setPosting] = useState(false);
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to real-time comments for this video
  useEffect(() => {
    if (!video?.id) return;
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
    return () => { try { unsub?.(); } catch { } };
  }, [video?.id, onCountChange]);

  // Reset composer on video change
  useEffect(() => {
    setText('');
    setPendingGif(null);
    setSelectedTimestamp(null);
  }, [video?.id]);

  const insertCurrentTimestamp = () => {
    const formatted = formatTimestamp(currentTime);
    setSelectedTimestamp(currentTime);
    setText(prev => (prev.trim() ? `${prev.trim()} ${formatted} ` : `${formatted} `));
    textareaRef.current?.focus();
  };

  const submitComment = async () => {
    const body = text.trim();
    if ((!body && !pendingGif) || posting || !currentUser?.uid) return;

    setPosting(true);
    const now = Date.now();
    const optimisticId = `vcom_pending_${now}`;

    // Add optimistic comment immediately so user sees it right away (never vanishes!)
    const optimisticComment: VideoComment = {
      id: optimisticId,
      videoId: video.id,
      userId: currentUser.uid,
      userName: currentUser.displayName || 'You',
      userPhoto: currentUser.photoURL || '',
      text: body,
      timestamp: now,
      gifUrl: pendingGif || undefined,
      mediaTimestamp: selectedTimestamp || undefined,
    };

    setComments(prev => [optimisticComment, ...prev]);
    const gifToSend = pendingGif;
    const timeToSend = selectedTimestamp;

    setText('');
    setPendingGif(null);
    setSelectedTimestamp(null);

    try {
      await postVideoComment(video.id, body, undefined, gifToSend || undefined, timeToSend || undefined);
    } catch (err) {
      console.error('[ReelloComments] Failed to post comment:', err);
    } finally {
      setPosting(false);
    }
  };

  // Render comment text with interactive timestamps
  const renderCommentBody = (content: string) => {
    if (!content) return null;
    // Match timestamps like 0:24, 1:45, 12:34, 1:23:45
    const regex = /(\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b)/g;
    const parts = content.split(regex);

    return (
      <p className="text-[13.5px] text-white/90 leading-relaxed break-words font-medium">
        {parts.map((part, idx) => {
          if (regex.test(part)) {
            const secs = parseSeconds(part);
            if (secs !== null) {
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSeek(secs)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 hover:bg-orange-500/30 hover:text-orange-300 font-mono font-bold text-xs transition-all mx-1 active:scale-95"
                  title={`Jump to ${part}`}
                >
                  <Clock size={11} className="text-orange-400" />
                  {part}
                </button>
              );
            }
          }
          return <span key={idx}>{part}</span>;
        })}
      </p>
    );
  };

  return (
    <div className="w-full bg-[#111116] border border-white/10 rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col space-y-5">
      {/* Comments Header */}
      <div className="flex items-center justify-between border-b border-white/8 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-400 animate-pulse" />
          <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
            <MessageCircle size={16} className="text-orange-400" />
            Comments
            <span className="text-white/40 font-bold ml-1 text-xs">({comments.length})</span>
          </h3>
        </div>

        {/* Current playback timestamp chip */}
        <button
          type="button"
          onClick={insertCurrentTimestamp}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all text-xs font-semibold"
          title="Insert current video timestamp"
        >
          <Clock size={13} className="text-orange-400" />
          <span>Add {formatTimestamp(currentTime)}</span>
        </button>
      </div>

      {/* Composer Section */}
      {currentUser?.uid ? (
        <div className="space-y-3 bg-white/[0.03] border border-white/8 rounded-2xl p-4">
          <div className="flex gap-3 items-start">
            <div className="w-9 h-9 rounded-2xl overflow-hidden bg-white/10 shrink-0 ring-1 ring-white/15">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-black text-white/50 bg-gradient-to-tr from-purple-500/30 to-orange-500/30">
                  {(currentUser.displayName || 'U')[0]}
                </div>
              )}
            </div>

            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitComment();
                  }
                }}
                placeholder="Share your thoughts... (Type 0:42 to link a timestamp)"
                rows={2}
                className="w-full bg-white/[0.06] border border-white/15 focus:border-orange-500/60 focus:bg-white/[0.09] rounded-xl px-4 py-2.5 text-[13.5px] text-white placeholder-white/35 outline-none transition-all resize-none"
              />

              {/* Pending GIF Pill */}
              {pendingGif && (
                <div className="mt-2 relative inline-flex items-center gap-2 p-1.5 pr-3 bg-purple-500/15 border border-purple-500/30 rounded-xl">
                  <img src={pendingGif} alt="Attached GIF" className="w-12 h-12 rounded-lg object-cover" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-300">GIF Attached</span>
                    <button
                      type="button"
                      onClick={() => setPendingGif(null)}
                      className="text-[10px] text-white/40 hover:text-red-400 text-left font-bold"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-white/5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGifPicker(v => !v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all ${
                  showGifPicker || pendingGif
                    ? 'bg-purple-500 text-white border-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                    : 'bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border-purple-400/30'
                }`}
              >
                <Sparkles size={13} />
                <span>GIF</span>
              </button>

              <button
                type="button"
                onClick={insertCurrentTimestamp}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5 transition-all"
              >
                <Clock size={13} className="text-orange-400" />
                <span>Timestamp ({formatTimestamp(currentTime)})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={submitComment}
              disabled={(!text.trim() && !pendingGif) || posting}
              className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black uppercase text-xs tracking-wider flex items-center gap-2 transition-all disabled:opacity-30 disabled:pointer-events-none shadow-lg active:scale-95"
            >
              {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span>Comment</span>
            </button>
          </div>

          {/* GIF Picker modal */}
          <AnimatePresence>
            {showGifPicker && (
              <div className="relative z-50">
                <div className="fixed inset-0" onClick={() => setShowGifPicker(false)} />
                <GifStickerPicker
                  onClose={() => setShowGifPicker(false)}
                  anchorClass="bottom-full mb-3 left-0"
                  onSelect={(url) => {
                    setShowGifPicker(false);
                    setPendingGif(url);
                  }}
                />
              </div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-6 border border-white/8 rounded-2xl bg-white/[0.02]">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wider flex items-center justify-center gap-2">
            <LogIn size={15} />
            Sign in to leave a comment and share reactions
          </p>
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-white/30">
            <Loader2 size={24} className="animate-spin text-orange-400" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12 select-none border border-dashed border-white/10 rounded-2xl">
            <MessageCircle size={28} className="mx-auto text-white/20 mb-2" />
            <p className="text-xs font-black uppercase tracking-widest text-white/40">
              No comments yet — be the first to share your thoughts.
            </p>
          </div>
        ) : (
          comments.map(c => {
            const author = c.userName || 'Anonymous';
            const photo = c.userPhoto;
            const body = c.text || '';

            return (
              <div key={c.id} className="flex gap-3.5 items-start group">
                <div className="w-9 h-9 rounded-2xl overflow-hidden bg-white/10 shrink-0 ring-1 ring-white/10">
                  {photo ? (
                    <img src={photo} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-black text-white/50 bg-gradient-to-tr from-purple-500/30 to-orange-500/30">
                      {author[0]}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="bg-white/[0.04] hover:bg-white/[0.07] transition-colors rounded-2xl rounded-tl-sm px-4 py-3 border border-white/5">
                    <div className="flex items-baseline justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-orange-400 uppercase tracking-wider truncate">
                          {author}
                        </span>
                        {c.mediaTimestamp !== undefined && (
                          <button
                            type="button"
                            onClick={() => onSeek(c.mediaTimestamp!)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono font-bold text-[11px] hover:bg-orange-500/40 transition-colors"
                          >
                            <Clock size={10} />
                            {formatTimestamp(c.mediaTimestamp)}
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-white/30 shrink-0">{timeAgo(c.timestamp)}</span>
                    </div>

                    {body && renderCommentBody(body)}

                    {/* GIF Image Container */}
                    {c.gifUrl && (
                      <div className="mt-3 rounded-2xl overflow-hidden border border-white/15 max-w-[280px] shadow-xl bg-black/40">
                        <img
                          src={c.gifUrl}
                          alt="GIF"
                          className="w-full h-auto object-cover max-h-[220px]"
                          loading="lazy"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ReelloComments;
