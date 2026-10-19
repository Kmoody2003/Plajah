// A Bluesky / Mastodon post rendered as a NATIVE Plajah post.
//
// Same container, avatar column, header, typography and action bar as components/PostCard.tsx (presentation="signal"),
// so a post that arrived from the network sits in the feed exactly like one written on Plajah. The only differences are
// the honest ones: a small network badge, "reposted by" attribution, and the actions that mean something on that
// network (reply, like, repost, share). Likes / reposts / replies go straight to the author's own account on the network.

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Heart, MessageSquare, Repeat2, Share2, ExternalLink, Play, Pause, Music2, Bookmark } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useFediverse } from '../../contexts/FediverseContext';
import { useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';
import { TYPE } from '../../src/lib/designSystem';
import type { FediversePost } from '../../services/fediverse/types';
import { tokenize } from '../../services/fediverse/blueskyVersion';
import { openBluesky } from '../../services/fediverse/blueskyNav';
import { ReplySheet, BskyVideo, stripHtml } from '../FediversePostCard';
import { favoriteAudiusTrack, unfavoriteAudiusTrack, repostAudiusTrack, unrepostAudiusTrack } from '../../services/audiusService';
import { getAudiusSession, startAudiusAuth } from '../../services/audiusAuth';
import { invalidateAudiusLibrary } from '../../services/audiusLibrary';
import { bskyBookmarkPost, bskyUnbookmarkPost } from '../../services/fediverse/blueskyClient';

const NET: Record<string, { label: string; color: string; logo: string }> = {
  bluesky:  { label: 'Bluesky',  color: '#1185fe', logo: '🦋' },
  mastodon: { label: 'Mastodon', color: '#6364ff', logo: '🐘' },
  threads:  { label: 'Threads',  color: '#cccccc', logo: '@' },
  audius:   { label: 'Audius',   color: '#a855f7', logo: '🎧' },
};

export interface ExternalPostCardProps {
  post: FediversePost;
  /** Open this author's profile inside Plajah. Defaults to their page on the network. */
  onOpenProfile?: (post: FediversePost) => void;
}

const ExternalPostCard: React.FC<ExternalPostCardProps> = ({ post, onOpenProfile }) => {
  const { toggleLike, toggleRepost } = useFediverse();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useGlobalPlayerState();
  const [replying, setReplying] = useState(false);
  const [acting, setActing] = useState<'like' | 'repost' | 'bookmark' | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [localLiked, setLocalLiked] = useState<boolean | null>(null);
  const [localReposted, setLocalReposted] = useState<boolean | null>(null);
  const [localBookmarked, setLocalBookmarked] = useState<boolean | null>(null);
  const net = NET[post.protocol] ?? NET.bluesky;

  const isLiked = localLiked ?? post.isLiked;
  const isReposted = localReposted ?? post.isReposted;
  const isBookmarked = localBookmarked ?? Boolean(post.isBookmarked);
  const likeCount = Math.max(0, post.likeCount + (localLiked === null ? 0 : localLiked === post.isLiked ? 0 : localLiked ? 1 : -1));
  const repostCount = Math.max(0, post.repostCount + (localReposted === null ? 0 : localReposted === post.isReposted ? 0 : localReposted ? 1 : -1));

  const text = stripHtml(post.content || post.contentText || '');
  const openProfile = () => {
    if (onOpenProfile) return onOpenProfile(post);
    // Bluesky people open Plajah's own profile screen; other networks open the author's page there.
    if (post.protocol === 'bluesky') openBluesky({ kind: 'profile', actor: post.authorDid || post.authorHandle });
    else window.open(post.url, '_blank', 'noopener,noreferrer');
  };

  const act = async (kind: 'like' | 'repost') => {
    if (acting) return;
    setActing(kind);
    try {
      if ((post.protocol as string) === 'audius') {
        const trackId = post.id.replace(/^audius_post_/, '');
        let session = getAudiusSession();
        if (!session || session.scope !== 'write') {
          session = await startAudiusAuth({ scope: 'write' });
        }
        if (kind === 'like') {
          const next = !isLiked;
          setLocalLiked(next);
          const ok = next
            ? await favoriteAudiusTrack(trackId, session.accessToken, session.userId)
            : await unfavoriteAudiusTrack(trackId, session.accessToken, session.userId);
          if (ok) invalidateAudiusLibrary();
          else setLocalLiked(!next);
        } else {
          const next = !isReposted;
          setLocalReposted(next);
          const ok = next
            ? await repostAudiusTrack(trackId, session.accessToken, session.userId)
            : await unrepostAudiusTrack(trackId, session.accessToken, session.userId);
          if (ok) invalidateAudiusLibrary();
          else setLocalReposted(!next);
        }
        return;
      }
      await (kind === 'like' ? toggleLike(post) : toggleRepost(post));
    } catch { /* the context rolls the optimistic update back */ } finally { setActing(null); }
  };

  const toggleBookmark = async () => {
    if (acting || post.protocol !== 'bluesky' || !post.uri || !post.cid) return;
    setActing('bookmark');
    const next = !isBookmarked;
    setLocalBookmarked(next);
    try {
      if (next) await bskyBookmarkPost(post.uri, post.cid);
      else await bskyUnbookmarkPost(post.uri);
    } catch {
      setLocalBookmarked(!next);
    } finally {
      setActing(null);
    }
  };

  const share = async () => {
    try { await navigator.clipboard.writeText(post.url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { window.open(post.url, '_blank', 'noopener,noreferrer'); }
  };

  return (
    <>
      <div className="pj-signal-post relative group/card rounded-none sm:rounded-2xl border-y sm:border border-white/[0.06] transition-all duration-200 sm:hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.35),_0_-4px_10px_rgba(0,0,0,0.18)] hover:border-white/[0.1] hover:z-10 will-change-transform">
        {post.repostedBy && (
          <p className="flex items-center gap-1.5 px-4 pt-2.5 -mb-1 text-[11px] font-bold text-white/35"><Repeat2 size={12} /> {post.repostedBy} reposted</p>
        )}
        <div className="flex gap-3 px-3 sm:px-4 py-3 sm:py-3.5 rounded-none sm:rounded-2xl hover:bg-white/[0.025] transition-colors">
          {/* Avatar col */}
          <div className="relative flex-shrink-0">
            <button onClick={openProfile} className="w-10 h-10 rounded-full overflow-hidden border border-white/10 hover:opacity-90 transition-opacity block bg-white/5">
              {post.authorAvatarUrl
                ? <img src={post.authorAvatarUrl} alt={post.authorDisplayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                : <span className="w-full h-full flex items-center justify-center text-sm font-black text-white/60">{(post.authorDisplayName || post.authorHandle)[0]?.toUpperCase()}</span>}
            </button>
          </div>

          {/* Content col */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <button onClick={openProfile} className={`${TYPE.titleMd} text-white hover:text-small-orange transition-colors leading-tight`}>{post.authorDisplayName || post.authorHandle}</button>
                <span className="text-[13px] text-white/30 leading-tight truncate max-w-[10rem]">{post.authorHandle}</span>
                <span className="text-[13px] text-white/30 leading-tight flex-shrink-0">· {formatDistanceToNow(post.createdAt)}ago</span>
                <span title={`From ${net.label}`} className="flex-shrink-0 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest" style={{ color: net.color }}>
                  {net.logo} {net.label}
                </span>
              </div>
              <a href={post.url} target="_blank" rel="noopener noreferrer" title={`Open on ${net.label}`} className="text-white/20 hover:text-white/60 transition-colors"><ExternalLink size={13} /></a>
            </div>

            {text && (
              <p
                className={`text-[15px] leading-relaxed text-white/85 whitespace-pre-wrap break-words ${post.protocol === 'bluesky' ? 'cursor-pointer' : ''}`}
                onClick={e => { if (post.protocol !== 'bluesky' || (e.target as HTMLElement).closest('a,button')) return; openBluesky({ kind: 'thread', uri: post.uri }); }}
              >
                {tokenize(text).map((t, i) => t.kind === 'link'
                  ? <a key={i} href={t.text} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: net.color }}>{t.text.replace(/^https?:\/\/(www\.)?/, '').slice(0, 42)}{t.text.replace(/^https?:\/\/(www\.)?/, '').length > 42 ? '…' : ''}</a>
                  : t.kind === 'text' ? <React.Fragment key={i}>{t.text}</React.Fragment>
                  : post.protocol === 'bluesky'
                    ? <button key={i} type="button" onClick={() => openBluesky(t.kind === 'mention' ? { kind: 'profile', actor: t.text.slice(1) } : { kind: 'search', q: t.text })} className="hover:underline" style={{ color: net.color }}>{t.text}</button>
                    : <span key={i} style={{ color: net.color }}>{t.text}</span>)}
              </p>
            )}

            {post.media.length > 0 && (
              <div className={`mt-2.5 grid gap-1.5 rounded-xl overflow-hidden ${post.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {post.media.slice(0, 4).map((m, i) => {
                  if (m.type === 'audio') {
                    const isCurrentAudio = currentTrack?.url === m.url || currentTrack?.id === post.id;
                    return (
                      <div key={i} className="flex items-center gap-3.5 p-3 rounded-2xl border border-purple-500/25 bg-gradient-to-r from-purple-950/40 via-black/40 to-black/40">
                        <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-purple-900/30">
                          {m.previewUrl ? (
                            <img src={m.previewUrl} alt={m.altText || ''} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-purple-300"><Music2 size={20} /></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-white truncate">{m.altText || 'Audius Track'}</p>
                          <p className="text-[11px] font-bold text-purple-300/80 truncate">{post.authorDisplayName || post.authorHandle}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mt-0.5">Stream natively in Chora</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (isCurrentAudio) {
                              togglePlay();
                            } else {
                              playTrack({
                                id: post.id,
                                title: m.altText || 'Audius Track',
                                artist: post.authorDisplayName || post.authorHandle,
                                url: m.url,
                                albumCover: m.previewUrl || post.authorAvatarUrl || '',
                              } as any, null, 'RADIO');
                            }
                          }}
                          className="w-11 h-11 rounded-full bg-purple-500 hover:bg-purple-400 text-black flex items-center justify-center shrink-0 shadow-lg transition-transform hover:scale-105"
                        >
                          {isCurrentAudio && isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className={`relative overflow-hidden rounded-lg bg-black/30 ${post.media.length === 3 && i === 0 ? 'col-span-2' : ''}`}
                      style={{ aspectRatio: post.media.length === 1 ? (m.width && m.height ? `${Math.min(Math.max(m.width / m.height, 0.75), 2)}` : '16/9') : '1' }}>
                      {m.type === 'video' && /\.m3u8(\?|$)/.test(m.url) ? <BskyVideo src={m.url} poster={m.previewUrl} />
                        : m.type === 'video' ? <video src={m.url} poster={m.previewUrl} className="w-full h-full object-cover" controls playsInline preload="none" />
                        : <img src={m.previewUrl || m.url} alt={m.altText || ''} loading="lazy" onClick={() => m.url && setLightbox(m.url)} className="w-full h-full object-cover cursor-zoom-in" />}
                      {m.altText && m.type !== 'video' && <span className="absolute bottom-1 left-1 px-1 rounded bg-black/70 text-[8px] font-black text-white/80">ALT</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {post.card?.uri && (
              <a href={post.card.uri} target="_blank" rel="noopener noreferrer" className="mt-2.5 flex rounded-xl overflow-hidden border border-white/10 hover:bg-white/[0.04] transition-colors">
                {post.card.thumb && <img src={post.card.thumb} alt="" className="w-24 h-24 object-cover shrink-0" loading="lazy" />}
                <div className="p-2.5 min-w-0">
                  <p className="text-xs font-bold text-white/85 line-clamp-2">{post.card.title || post.card.uri}</p>
                  {post.card.description && <p className="text-[11px] text-white/45 line-clamp-2 mt-0.5">{post.card.description}</p>}
                  <p className="text-[10px] text-white/30 truncate mt-1">{(() => { try { return new URL(post.card!.uri).hostname; } catch { return post.card!.uri; } })()}</p>
                </div>
              </a>
            )}

            {post.quote && (
              <a href={post.quote.url} target="_blank" rel="noopener noreferrer"
                onClick={e => { if (post.protocol === 'bluesky') { e.preventDefault(); openBluesky({ kind: 'thread', uri: post.quote!.uri }); } }}
                className="mt-2.5 block rounded-xl border border-white/10 p-3 hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  {post.quote.authorAvatarUrl && <img src={post.quote.authorAvatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" />}
                  <span className="text-[12px] font-bold text-white/75 truncate">{post.quote.authorDisplayName}</span>
                  <span className="text-[11px] text-white/30 truncate">{post.quote.authorHandle}</span>
                </div>
                <p className="text-[13px] text-white/65 line-clamp-4 whitespace-pre-wrap break-words">{post.quote.text}</p>
              </a>
            )}

            {/* Action bar — same buttons, spacing and icons as a native post */}
            <div className="flex items-center gap-1 mt-3 -ml-1.5">
              {(post.protocol as string) !== 'audius' && (
                <motion.button whileTap={{ scale: 0.85 }} onClick={() => setReplying(r => !r)}
                  className={`tap flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all ${replying ? 'text-sky-400 bg-sky-400/10' : 'text-white/40 hover:text-sky-400 hover:bg-sky-400/10'}`}>
                  <MessageSquare size={16} strokeWidth={1.5} />{post.replyCount > 0 && <span className="text-[12px]">{post.replyCount}</span>}
                </motion.button>
              )}

              <motion.button whileTap={{ scale: 0.85 }} onClick={() => act('like')} disabled={acting === 'like' || post.protocol === 'threads'}
                className={`tap flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all disabled:opacity-50 ${isLiked ? 'text-red-400 bg-red-400/10' : 'text-white/40 hover:text-red-400 hover:bg-red-400/10'}`}>
                <Heart size={16} strokeWidth={1.5} fill={isLiked ? 'currentColor' : 'none'} />{likeCount > 0 && <span className="text-[12px]">{likeCount}</span>}
              </motion.button>

              {post.protocol !== 'threads' && (
                <motion.button whileTap={{ scale: 0.85 }} onClick={() => act('repost')} disabled={acting === 'repost'}
                  className={`tap flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all disabled:opacity-50 ${isReposted ? 'text-emerald-400 bg-emerald-400/10' : 'text-white/40 hover:text-emerald-400 hover:bg-emerald-400/10'}`}>
                  <Repeat2 size={17} strokeWidth={1.5} />{repostCount > 0 && <span className="text-[12px]">{repostCount}</span>}
                </motion.button>
              )}

              {post.protocol === 'bluesky' && post.uri && post.cid && (
                <motion.button whileTap={{ scale: 0.85 }} onClick={toggleBookmark} disabled={acting === 'bookmark'} title={isBookmarked ? 'Remove Bluesky bookmark' : 'Bookmark on Bluesky'}
                  className={`tap flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all disabled:opacity-50 ${isBookmarked ? 'text-amber-400 bg-amber-400/10' : 'text-white/40 hover:text-amber-400 hover:bg-amber-400/10'}`}>
                  <Bookmark size={15} strokeWidth={1.5} fill={isBookmarked ? 'currentColor' : 'none'} />
                </motion.button>
              )}

              <motion.button whileTap={{ scale: 0.85 }} onClick={share} title={copied ? 'Link copied' : 'Copy link'}
                className="tap flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all text-white/40 hover:text-white hover:bg-white/10">
                <Share2 size={15} strokeWidth={1.5} />{copied && <span className="text-[11px]">Copied</span>}
              </motion.button>
            </div>

            {replying && <ReplySheet post={post} onClose={() => setReplying(false)} />}
          </div>
        </div>
      </div>

      {/* Portalled: the feed's animated wrappers have CSS transforms, which would re-anchor a fixed overlay to the wrong box. */}
      {lightbox && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
        </div>,
        document.body,
      )}
    </>
  );
};

export default ExternalPostCard;
