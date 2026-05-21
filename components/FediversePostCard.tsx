import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Repeat2, MessageCircle, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { useFediverse } from '../contexts/FediverseContext';
import type { FediversePost, FediverseProtocol } from '../services/fediverse/types';

// ─── Protocol palette ─────────────────────────────────────────────────────────

const PROTOCOL: Record<FediverseProtocol, {
  tint: string; border: string; accent: string; label: string;
  logo: React.ReactNode;
}> = {
  bluesky: {
    tint:   'rgba(0,133,255,0.055)',
    border: 'rgba(0,133,255,0.18)',
    accent: '#0085ff',
    label:  'Bluesky',
    logo: (
      <svg width="14" height="14" viewBox="0 0 568 501" fill="none">
        <path d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.209C491.866-8.28 568 -9.773 568 57.36c0 13.856-7.939 116.331-12.578 132.888-16.175 57.967-75.073 72.805-127.48 63.952 91.499 15.59 114.819 67.217 64.528 118.848C392.73 479.593 349.467 504.812 284 498.986c-65.467 5.826-108.73-19.393-208.47-125.938-50.29-51.63-26.97-103.258 64.528-118.848-52.407 8.853-111.305-5.985-127.48-63.952C7.939 173.691 0 71.216 0 57.36 0-9.773 76.134-8.28 123.121 33.664Z" fill="currentColor"/>
      </svg>
    ),
  },
  mastodon: {
    tint:   'rgba(99,100,255,0.055)',
    border: 'rgba(99,100,255,0.18)',
    accent: '#6364FF',
    label:  'Mastodon',
    logo: (
      <svg width="14" height="14" viewBox="0 0 74 79" fill="none">
        <path d="M73.7014 17.4323C72.5616 9.05508 65.1774 2.4321 56.424 1.1648C54.9472 0.950843 49.3518 0.163452 36.3901 0.163452H36.2933C23.3318 0.163452 20.627 0.950843 19.1502 1.1648C10.6274 2.40291 2.89647 8.31566 0.9488 16.7934C0.0114825 21.0109 -0.0893985 25.673 0.121882 29.9554C0.419837 36.219 0.469671 42.4705 1.04836 48.7053C1.44791 52.953 2.17376 57.1603 3.22006 61.2924C5.13988 68.8867 12.3747 75.1377 19.8431 77.7527C27.8314 80.4734 36.4153 80.8908 44.6283 78.9572C45.5067 78.7504 46.3724 78.5013 47.2242 78.2073C49.2009 77.5284 51.4967 76.8104 53.2416 75.4834C53.2671 75.4648 53.2878 75.4408 53.3024 75.4135C53.317 75.3862 53.3251 75.3563 53.3261 75.3258V69.2552C53.3261 69.2258 53.3172 69.197 53.3004 69.1726C53.2836 69.1481 53.2594 69.1291 53.2313 69.1175C53.2031 69.1058 53.1723 69.1021 53.1421 69.1066C53.1119 69.1112 53.0837 69.124 53.0608 69.1437C51.2074 70.7254 49.1553 72.0244 46.9623 72.9946C44.4337 74.0998 41.7074 74.641 38.9593 74.5881C33.8978 74.5881 31.5726 72.1073 30.7817 69.5736C30.0901 67.3899 29.7508 65.1185 29.7734 62.838V62.5048C29.7737 62.4613 29.7882 62.419 29.8144 62.3847C29.8406 62.3503 29.877 62.3258 29.918 62.3148C29.959 62.3038 30.0023 62.3068 30.0414 62.3233C30.0805 62.3399 30.1132 62.3691 30.1344 62.4061C32.5881 66.5477 37.1512 68.7164 43.9477 68.7164C49.0041 68.7164 53.2626 67.5714 56.6321 65.2851C60.0016 62.9988 62.3893 59.6025 63.4498 54.8839C64.2741 51.2583 64.6716 47.5581 64.6352 43.8493C64.6352 43.6338 64.6352 43.421 64.6284 43.2082C64.6284 43.1827 64.6351 43.1576 64.6478 43.1358C64.6605 43.1139 64.6787 43.0962 64.7003 43.0843C64.7218 43.0724 64.7461 43.0669 64.7703 43.0684C64.7945 43.0699 64.8179 43.0782 64.8375 43.0926C67.8524 45.0532 70.1455 47.9416 71.3978 51.3277C72.6503 54.7138 72.7978 58.4247 71.8188 61.9101C72.7978 58.4247 72.9456 54.5826 71.8188 51.3277L73.7014 17.4323ZM52.3549 52.8714C52.3553 54.2361 52.0862 55.5876 51.5629 56.8474C51.0397 58.1072 50.2724 59.2505 49.3055 60.2108C48.3386 61.1711 47.191 61.9301 45.9284 62.4443C44.6659 62.9584 43.3138 63.2178 41.9487 63.2077C39.2395 63.2077 37.0491 62.3648 35.3837 60.6872C33.7183 59.0096 32.8849 56.8376 32.8849 54.143C32.8849 51.4485 33.7183 49.2765 35.3837 47.5989C37.0491 45.9213 39.2395 45.0784 41.9487 45.0784C44.3024 45.0784 46.2778 45.7773 47.8767 47.1832C49.4757 48.5891 50.6014 50.3915 51.1395 52.3938C51.6205 53.9338 51.9266 55.3951 52.0396 56.7754L52.3549 52.8714Z" fill="currentColor"/>
      </svg>
    ),
  },
  threads: {
    tint:   'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.09)',
    accent: '#aaaaaa',
    label:  'Threads',
    logo: (
      <svg width="14" height="14" viewBox="0 0 192 192" fill="none">
        <path d="M141.537 88.9883C140.67 88.5647 139.788 88.1647 138.891 87.7887C137.391 71.1037 128.196 61.2163 111.96 61.0877C111.744 61.0863 111.53 61.086 111.317 61.087C102.283 61.087 94.5113 64.7077 89.6233 71.0633L100.624 79.2993C104.115 74.6743 109.392 72.7543 111.959 72.7543C112.112 72.7543 112.265 72.7553 112.418 72.757C118.041 72.7967 122.3 74.4183 124.946 77.5503C126.886 79.8373 128.183 83.0243 128.826 87.0753C124.162 86.3697 119.454 86.1817 114.785 86.5103C98.6207 87.5953 88.4633 97.4133 89.173 111.47C89.5363 118.63 92.9707 124.806 98.8593 128.985C103.919 132.57 110.418 134.343 117.168 133.968C126.23 133.456 133.503 129.743 138.807 122.938C142.878 117.745 145.463 110.992 146.616 102.506C149.413 104.143 151.543 106.406 152.761 109.179C154.76 113.724 154.872 121.059 149.073 126.875C143.999 131.966 136.683 134.309 126.26 134.373C113.645 134.291 104.169 130.278 97.4893 122.451C91.2973 115.16 88.0993 104.637 88.0453 91.2097C88.0453 89.4727 88.1173 87.7227 88.2613 85.9593C90.3093 69.0223 98.6173 55.5483 112.278 47.3953C120.019 42.8337 129.241 40.4987 138.939 40.0157V28.0897C127.888 28.6217 117.426 31.5527 108.492 36.5543C91.7833 45.6843 80.7303 62.0667 77.4613 82.5187C77.2453 83.8937 77.0613 85.2917 76.9083 86.7067C76.4133 91.4177 76.2153 96.1887 76.4083 100.96C76.9993 121.42 83.7413 138.088 96.2593 149.427C107.744 159.835 123.501 165.141 142.183 165.141C142.393 165.141 142.607 165.139 142.82 165.136C158.201 164.909 171.225 160.049 180.387 150.819C190.688 140.437 191.093 126.95 188.073 119.885C185.447 113.627 180.024 108.746 172.56 105.96C172.06 89.0773 164.963 81.8073 155.07 77.0393L141.537 88.9883Z" fill="currentColor"/>
      </svg>
    ),
  },
};

// ─── Relative time ─────────────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d}d`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Strip HTML (Mastodon content is HTML) ────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// ─── Reply sheet (inline) ─────────────────────────────────────────────────────

function ReplySheet({ post, onClose }: { post: FediversePost; onClose: () => void }) {
  const { crossPost, accounts } = useFediverse();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const account = accounts.find(a => a.id === post.accountId && a.protocol === post.protocol);
  const limit = post.protocol === 'bluesky' ? 300 : 500;

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await crossPost(text.trim(), {
        inReplyToId: post.id,
        inReplyToUri: post.uri,
      }, [post.accountId]);
      setText('');
      onClose();
    } catch (err) {
      console.error('Reply failed:', err);
    } finally {
      setSending(false);
    }
  };

  const proto = PROTOCOL[post.protocol];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="mt-3 rounded-2xl overflow-hidden"
      style={{ background: `${proto.tint}`, border: `1px solid ${proto.border}` }}
    >
      <div className="p-3">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Reply on ${proto.label}…`}
          maxLength={limit}
          rows={3}
          className="w-full bg-transparent text-white text-sm resize-none outline-none placeholder-white/25 leading-relaxed"
          autoFocus
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px]" style={{ color: text.length > limit * 0.8 ? proto.accent : 'rgba(255,255,255,0.2)' }}>
            {text.length} / {limit}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white/40 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending || text.length > limit}
              className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 flex items-center gap-1.5"
              style={{ background: proto.accent, color: '#fff' }}
            >
              {sending ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              Reply
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

interface FediversePostCardProps {
  post: FediversePost;
  compact?: boolean;
}

const FediversePostCard: React.FC<FediversePostCardProps> = ({ post, compact = false }) => {
  const { toggleLike, toggleRepost } = useFediverse();
  const [replying, setReplying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [isActing, setIsActing] = useState<'like' | 'repost' | null>(null);

  const proto = PROTOCOL[post.protocol];
  const text  = stripHtml(post.content || post.contentText || '');
  const TRUNCATE_LEN = 280;
  const needsTruncation = text.length > TRUNCATE_LEN;
  const displayText = needsTruncation && !expanded ? text.slice(0, TRUNCATE_LEN) + '…' : text;

  const handleLike = async () => {
    setIsActing('like');
    try { await toggleLike(post); } catch { /* ignore */ } finally { setIsActing(null); }
  };

  const handleRepost = async () => {
    // Threads doesn't support repost — skip silently
    if (post.protocol === 'threads') return;
    setIsActing('repost');
    try { await toggleRepost(post); } catch { /* ignore */ } finally { setIsActing(null); }
  };

  return (
    <>
      <motion.article
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden transition-all"
        style={{
          background: proto.tint,
          border: `1px solid ${proto.border}`,
          boxShadow: `0 2px 16px ${proto.tint}`,
        }}
      >
        {/* Protocol accent bar */}
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${proto.accent}, transparent)` }} />

        <div className="p-4">
          {/* Header */}
          <div className="flex items-start gap-3 mb-3">
            {/* Avatar */}
            <div className="shrink-0">
              {post.authorAvatarUrl ? (
                <img src={post.authorAvatarUrl} alt=""
                  className="w-10 h-10 rounded-full object-cover"
                  style={{ border: `2px solid ${proto.border}` }} />
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-black"
                  style={{ background: proto.tint, border: `2px solid ${proto.border}`, color: proto.accent }}>
                  {(post.authorDisplayName || post.authorHandle)[0]?.toUpperCase()}
                </div>
              )}
            </div>

            {/* Name + handle + time */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-black text-white truncate">
                  {post.authorDisplayName || post.authorHandle}
                </span>
                {/* Protocol badge */}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
                  style={{ background: `${proto.accent}18`, color: proto.accent, border: `1px solid ${proto.accent}30` }}>
                  <span style={{ color: proto.accent }}>{proto.logo}</span>
                  {proto.label}
                </span>
              </div>
              <p className="text-[10px] text-white/35 font-medium truncate mt-0.5">
                {post.authorHandle} · {relativeTime(post.createdAt)}
              </p>
            </div>

            {/* Open original */}
            <a href={post.url} target="_blank" rel="noopener noreferrer"
              className="shrink-0 p-1.5 rounded-lg transition-colors text-white/20 hover:text-white/60">
              <ExternalLink size={13} />
            </a>
          </div>

          {/* Content */}
          {text && (
            <div className="mb-3">
              <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap break-words">{displayText}</p>
              {needsTruncation && (
                <button onClick={() => setExpanded(e => !e)}
                  className="flex items-center gap-1 text-[10px] font-black mt-1 transition-colors"
                  style={{ color: proto.accent }}>
                  {expanded ? <><ChevronUp size={11} /> Show less</> : <><ChevronDown size={11} /> Show more</>}
                </button>
              )}
            </div>
          )}

          {/* Media */}
          {post.media.length > 0 && (
            <div className={`mb-3 grid gap-1.5 rounded-xl overflow-hidden ${post.media.length === 1 ? 'grid-cols-1' : post.media.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
              {post.media.slice(0, 4).map((m, i) => (
                <div key={i} className={`relative overflow-hidden rounded-lg cursor-pointer group ${post.media.length === 3 && i === 0 ? 'col-span-2' : ''}`}
                  style={{ aspectRatio: post.media.length === 1 ? '16/9' : '1' }}
                  onClick={() => m.url && setLightboxImg(m.url)}>
                  {m.type === 'video' ? (
                    <video src={m.url} poster={m.previewUrl} className="w-full h-full object-cover" muted playsInline />
                  ) : (
                    <img src={m.previewUrl || m.url} alt={m.altText || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  )}
                  {post.media.length > 4 && i === 3 && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-white font-black text-lg">+{post.media.length - 4}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1 mt-1 -mx-1">
            {/* Like */}
            <button
              onClick={handleLike}
              disabled={isActing === 'like' || post.protocol === 'threads'}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50 hover:bg-white/5"
              style={{ color: post.isLiked ? '#f43f5e' : 'rgba(255,255,255,0.4)' }}
            >
              {isActing === 'like'
                ? <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                : <Heart size={14} fill={post.isLiked ? 'currentColor' : 'none'} />
              }
              <span>{post.likeCount > 0 ? post.likeCount : ''}</span>
            </button>

            {/* Repost */}
            <button
              onClick={handleRepost}
              disabled={isActing === 'repost' || post.protocol === 'threads'}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50 hover:bg-white/5"
              style={{ color: post.isReposted ? proto.accent : 'rgba(255,255,255,0.4)' }}
            >
              {isActing === 'repost'
                ? <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                : <Repeat2 size={14} />
              }
              <span>{post.repostCount > 0 ? post.repostCount : ''}</span>
            </button>

            {/* Reply */}
            <button
              onClick={() => setReplying(r => !r)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all hover:bg-white/5"
              style={{ color: replying ? proto.accent : 'rgba(255,255,255,0.4)' }}
            >
              <MessageCircle size={14} />
              <span>{post.replyCount > 0 ? post.replyCount : ''}</span>
            </button>
          </div>

          {/* Reply sheet */}
          <AnimatePresence>
            {replying && <ReplySheet key="reply" post={post} onClose={() => setReplying(false)} />}
          </AnimatePresence>
        </div>
      </motion.article>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxImg && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9000] bg-black/92 flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setLightboxImg(null)}
          >
            <img src={lightboxImg} alt="" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FediversePostCard;
