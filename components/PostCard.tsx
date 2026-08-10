import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import { Post, Album, Club, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
const PollCard = lazy(() => import('./PollCard'));
const LabsDataVisualizer = lazy(() => import('./LabsDataVisualizer'));
import { Heart, MessageSquare, Share2, MoreHorizontal, ExternalLink, Play, Volume2, Image as ImageIcon, Link as LinkIcon, Edit2, Check, X as XIcon, ChevronRight, Gift, Banknote, Layers, Users, Maximize2, Swords, Clock } from 'lucide-react';
import PostDebateModal from './PostDebateModal';
import Portal from './Portal';
import MiniMusicPlayer from './MiniMusicPlayer';
import ThreeDImage from './ThreeDImage';
import ShareButton from './ShareButton';
import { formatDistanceToNow } from 'date-fns';
import { auth, updatePost, deletePost, togglePostLike, processDonation, fetchUserClubs, createClubPost, searchUsers } from '../services/backendService';
import { db } from '../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Trash2, Zap } from 'lucide-react';
import CommentSection from './CommentSection';
import MediaWaterfallView, { WaterfallMediaItem } from './MediaWaterfallView';
import PostMediaCarousel from './PostMediaCarousel';
import LearnChip from './LearnChip';
import { buildShareUrl } from '../services/deepLinkService';
import RoomBanner from './RoomBanner';
import SignInPrompt from './SignInPrompt';
import SocialEmbedCard from './SocialEmbedCard';
import { parseSocialUrl, detectSocialEmbeds, extractUrlsFromText, stripUrlsFromText } from '../utils/socialEmbed';
import { SensitiveContentGate, MutedContentGate, CleanText } from './safety/SafetyGates';
import { useGateAccess, SanctuaryGateLock } from './sanctuary/SanctuaryGate';
const CommunityNoteBadge = lazy(() => import('./notes/CommunityNotes'));
import { TYPE } from '../src/lib/designSystem';
import { isActiveToday, formatTodayCountdown, todayProgress } from '../services/todayPosts';

interface PostCardProps {
  post: Post;
  onVisitUser?: (uid: string) => void;
}

const RenderTextWithMentions: React.FC<{ text: string; onVisitUser?: (uid: string) => void }> = ({ text, onVisitUser }) => {
  const parts = text.split(/(@\[[^\]]+\]\([^\)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        const mentionMatch = part.match(/@\[([^\]]+)\]\(([^)]+)\)/);
        if (mentionMatch) {
          const name = mentionMatch[1];
          const uid = mentionMatch[2];
          return (
            <span
              key={i}
              className="text-small-orange hover:underline cursor-pointer font-bold inline-block"
              onClick={(e) => {
                e.stopPropagation();
                onVisitUser?.(uid);
              }}
            >
              @{name}
            </span>
          );
        }
        // Plain text runs through the viewer's Clean Speech filter
        return <CleanText key={i} text={part} />;
      })}
    </>
  );
};

// Inline embedded 3D-scan viewer for academic/artifact posts. Shows a poster with
// a "View in 3D" affordance; the interactive iframe loads only on click so a feed
// full of posts never spins up dozens of WebGL contexts at once.
const Model3DEmbed: React.FC<{ url: string; title?: string; poster?: string }> = ({ url, title, poster }) => {
  const [loaded, setLoaded] = useState(false);
  if (!url) return null;
  return (
    <div className="rounded-3xl overflow-hidden border border-white/10 bg-black aspect-video relative group media-lift">
      {loaded ? (
        <iframe
          src={url}
          title={title || '3D scan'}
          className="w-full h-full"
          allow="autoplay; fullscreen; xr-spatial-tracking; accelerometer; magnetometer; gyroscope"
          allowFullScreen
          loading="lazy"
        />
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setLoaded(true); }}
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-3 cursor-pointer"
          style={poster ? { backgroundImage: `url(${poster})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          <div className="absolute inset-0 bg-black/45 group-hover:bg-black/30 transition-colors" />
          <div className="relative w-14 h-14 rounded-full bg-white/10 border border-white/25 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
            <span className="text-2xl">◈</span>
          </div>
          <div className="relative flex flex-col items-center gap-1">
            <span className="text-[11px] font-black uppercase tracking-widest text-white">View in 3D</span>
            {title && <span className="text-[9px] font-bold uppercase tracking-widest text-white/50 max-w-[80%] truncate">{title}</span>}
          </div>
          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/60 text-[8px] font-black uppercase tracking-widest text-small-orange">3D Scan</span>
        </button>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 text-[8px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-colors"
        title="Open the source viewer"
      >
        <ExternalLink size={10} /> Source
      </a>
    </div>
  );
};

const PostLinkBanner: React.FC<{ url: string }> = ({ url }) => {
  let domain = '';
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.07] hover:border-white/[0.15] transition-all group"
      style={{ textDecoration: 'none' }}
    >
      <LinkIcon size={11} className="text-small-orange/60 shrink-0" />
      <span className="text-[10px] font-black uppercase tracking-widest text-white/50 shrink-0 group-hover:text-white/80 transition-colors">
        {domain}
      </span>
      <span className="text-[9px] text-white/20 truncate flex-1 min-w-0 font-mono group-hover:text-white/35 transition-colors">
        {url}
      </span>
      <ExternalLink size={9} className="text-white/15 group-hover:text-white/45 shrink-0 transition-colors" />
    </a>
  );
};

const PostCard: React.FC<PostCardProps> = ({ post, onVisitUser }) => {
  const [isLiked, setIsLiked] = useState(() => !!(auth.currentUser && post.likedBy?.includes(auth.currentUser.uid)));
  const [likes, setLikes] = useState(post.likesCount);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(post.text);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [giftAmount, setGiftAmount] = useState<number | null>(null);
  const [customGift, setCustomGift] = useState('');
  const [isGifting, setIsGifting] = useState(false);
  const [giftSent, setGiftSent] = useState(false);

  // A "Live now" post must reflect the REAL stream state. The post's isLiveNow flag only flips to
  // false when the broadcaster hits Save — so a stream ended by discard, tab-close, or a crash left
  // the pulsing LIVE bug up forever (and tapping it opened a dead viewer). Watch streams/{id} live:
  // when it's no longer live, switch this card to the replay (or an "ended" state), instantly.
  const [liveState, setLiveState] = useState<{ isLive: boolean; recordingVideoId?: string } | null>(null);
  useEffect(() => {
    if (!(post.isLiveNow && post.liveStreamId)) { setLiveState(null); return; }
    const unsub = onSnapshot(
      doc(db, 'streams', post.liveStreamId),
      snap => {
        if (!snap.exists()) { setLiveState({ isLive: false }); return; } // no stream doc → ended
        const d = snap.data() as any;
        // Ended when isLive is explicitly false OR an endedAt is stamped; live otherwise.
        const ended = d.isLive === false || !!d.endedAt;
        setLiveState({ isLive: !ended, recordingVideoId: d.recordingVideoId });
      },
      () => setLiveState(null), // read error → fall back to the post flag (optimistic live)
    );
    return () => unsub();
  }, [post.isLiveNow, post.liveStreamId]);
  const [showWaterfall, setShowWaterfall] = useState(false);
  const [signInAction, setSignInAction] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showSendToClub, setShowSendToClub] = useState(false);
  const [userClubs, setUserClubs] = useState<Club[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [sendingToClub, setSendingToClub] = useState('');
  const [sentToClub, setSentToClub] = useState('');

  const [showDebateModal, setShowDebateModal] = useState(false);

  // ── @mention autocomplete for edit mode ───────────────────────────────────
  const [editMentionQuery, setEditMentionQuery]     = useState<string | null>(null);
  const [editMentionResults, setEditMentionResults] = useState<UserProfile[]>([]);
  const [editMentionLoading, setEditMentionLoading] = useState(false);
  const [editMentionIndex, setEditMentionIndex]     = useState(0);
  const [editMentionAnchor, setEditMentionAnchor]   = useState(0);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editMentionQuery === null || editMentionQuery.length === 0) {
      setEditMentionResults([]); return;
    }
    setEditMentionLoading(true);
    const t = setTimeout(async () => {
      const results = await searchUsers(editMentionQuery);
      setEditMentionResults(results.slice(0, 6));
      setEditMentionIndex(0);
      setEditMentionLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [editMentionQuery]);

  const handleEditTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditedText(val);
    const cursor = e.target.selectionStart ?? val.length;
    const match = val.slice(0, cursor).match(/@([A-Za-z0-9_]*)$/);
    if (match) {
      setEditMentionQuery(match[1]);
      setEditMentionAnchor(cursor - match[0].length);
    } else {
      setEditMentionQuery(null);
    }
  };

  const insertEditMention = (user: UserProfile) => {
    const cursor = editTextareaRef.current?.selectionStart ?? editedText.length;
    const token = `@[${user.displayName}](${user.uid}) `;
    const newText = editedText.slice(0, editMentionAnchor) + token + editedText.slice(cursor);
    setEditedText(newText);
    setEditMentionQuery(null);
    setEditMentionResults([]);
    const newCursor = editMentionAnchor + token.length;
    requestAnimationFrame(() => {
      editTextareaRef.current?.focus();
      editTextareaRef.current?.setSelectionRange(newCursor, newCursor);
    });
  };

  const handleEditMentionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (editMentionQuery === null || editMentionResults.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setEditMentionIndex(i => Math.min(i + 1, editMentionResults.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setEditMentionIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertEditMention(editMentionResults[editMentionIndex]); }
    else if (e.key === 'Escape') { setEditMentionQuery(null); }
  };

  const waterfallItems: WaterfallMediaItem[] = (post.media || []).map(m => ({
    type: m.type as WaterfallMediaItem['type'],
    url: m.url,
    title: m.title,
    thumbnail: m.thumbnail,
    linkPreview: m.linkPreview,
  }));

  const isAuthor = auth.currentUser?.uid === post.authorId;

  // "Today" (Blueprint 1B.4) — a 24h ephemeral post. Ticks once a minute so the
  // countdown chip stays honest, and self-removes the card the moment it expires.
  // The interval only ever runs on Today posts; every other post pays nothing.
  const [todayNow, setTodayNow] = useState(() => Date.now());
  useEffect(() => {
    if (!post.isToday) return;
    const t = setInterval(() => setTodayNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [post.isToday]);
  const todayLive = post.isToday ? isActiveToday(post, todayNow) : false;
  const todayExpired = !!post.isToday && !todayLive;

  // Sanctuary gate — only engages when a post carries one (existing posts do not).
  const gateAccess = useGateAccess(post.sanctuaryGate, post.id);
  const gated = !!post.sanctuaryGate && !gateAccess.allowed && !isAuthor;

  const handleGift = async () => {
    if (!auth.currentUser || isGifting) return;
    const amount = giftAmount ?? parseFloat(customGift);
    if (!amount || amount <= 0) return;
    setIsGifting(true);
    try {
      await processDonation({
        fromId: auth.currentUser.uid,
        fromName: auth.currentUser.displayName || 'Anonymous',
        toId: post.authorId,
        amount,
      });
      setGiftSent(true);
      setTimeout(() => { setShowGift(false); setGiftSent(false); setGiftAmount(null); setCustomGift(''); }, 2000);
    } catch (e) {
      console.error('Gift failed:', e);
    } finally {
      setIsGifting(false);
    }
  };
  const isTargeted = post.targetUserId && post.targetUserId !== post.authorId;

  const handleOpenSendToClub = async () => {
    if (!auth.currentUser) { setSignInAction('send to a club'); return; }
    setShowSendToClub(true);
    if (userClubs.length === 0) {
      setLoadingClubs(true);
      const clubs = await fetchUserClubs(auth.currentUser.uid);
      setUserClubs(clubs);
      setLoadingClubs(false);
    }
  };

  const handleSendToClub = async (clubId: string) => {
    if (!auth.currentUser || sendingToClub) return;
    setSendingToClub(clubId);
    const attachments = (post.media || [])
      .filter(m => m.type === 'PHOTO' || m.type === 'VIDEO' || m.type === 'AUDIO' || m.type === 'ALBUM')
      .map(m => ({ type: m.type, url: m.url || '', title: m.title, thumbnailUrl: m.thumbnail, assetId: m.id }));
    await createClubPost({
      clubId,
      content: post.text || '',
      type: 'POST',
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    setSendingToClub('');
    setSentToClub(clubId);
    setTimeout(() => { setSentToClub(''); setShowSendToClub(false); }, 1500);
  };

  const handleLike = async () => {
    if (!auth.currentUser) { setSignInAction('like this post'); return; }
    const optimisticLiked = !isLiked;
    setIsLiked(optimisticLiked);
    setLikes(prev => optimisticLiked ? prev + 1 : prev - 1);
    const result = await togglePostLike(post.id);
    if (result) {
      setIsLiked(result.liked);
      setLikes(result.likesCount);
    }
  };

  const handleSaveEdit = async () => {
    if (!editedText.trim()) return;
    setIsSaving(true);
    try {
      await updatePost(post.id, { text: editedText });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update post:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    setIsDeleting(true);
    try {
      await deletePost(post.id);
      // The feed should update automatically via onSnapshot
    } catch (error) {
      console.error("Failed to delete post:", error);
      alert("Failed to delete post. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowOptions(false);
    }
  };

  // URLs already covered by explicit LINK media items — don't double-render
  const mediaLinkUrls = useMemo(() => {
    const s = new Set<string>();
    (post.media || []).filter(m => m.type === 'LINK').forEach(m => {
      if (m.url) s.add(m.url);
      if ((m as any).linkPreview?.url) s.add((m as any).linkPreview.url);
    });
    return s;
  }, [post.media]);

  // Social embeds detected from the post text body
  const socialEmbedsFromText = useMemo(
    () => (post.text ? detectSocialEmbeds(post.text).filter(e => !mediaLinkUrls.has(e.originalUrl)) : []),
    [post.text, mediaLinkUrls]
  );

  // Plain (non-social) links in post text → rendered as slim link banners
  const nonSocialLinksFromText = useMemo(() => {
    if (!post.text) return [];
    const socialOriginals = new Set(socialEmbedsFromText.map(e => e.originalUrl));
    return extractUrlsFromText(post.text).filter(
      url => !socialOriginals.has(url) && !mediaLinkUrls.has(url)
    );
  }, [post.text, socialEmbedsFromText, mediaLinkUrls]);

  // Post text with all URLs stripped (they appear as banners/embeds below)
  const displayText = useMemo(() => (post.text ? stripUrlsFromText(post.text) : ''), [post.text]);

  const renderMedia = () => {
    // Locked behind a Sanctuary → show the gold lock instead of the media.
    if (gated && post.sanctuaryGate) {
      return (
        <div className="mt-4">
          <SanctuaryGateLock gate={post.sanctuaryGate} itemId={post.id} itemTitle={post.media?.[0]?.title || undefined} />
        </div>
      );
    }
    // A "Live now" post — render a tappable live card (thumbnail + join) instead of plain text,
    // opening the same WebRTC viewer a shared livestream link does.
    if (post.isLiveNow && post.liveStreamId) {
      const liveTitle = (post.text || '').replace(/^🔴\s*Live now:\s*/i, '').trim() || 'Live now';
      // The stream has actually ENDED (isLive false / endedAt / doc gone) → don't show the LIVE bug.
      const ended = liveState !== null && !liveState.isLive;
      const replayId = liveState?.recordingVideoId;
      if (ended) {
        // Ended WITH a saved replay → a "Watch replay" card that opens the recording.
        if (replayId) {
          return (
            <button
              onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'RELLO', params: { videoId: replayId } } })); }}
              className="mt-4 relative w-full aspect-video rounded-3xl overflow-hidden border border-white/10 block group"
            >
              {post.authorPhoto
                ? <img src={post.authorPhoto} alt="" loading="lazy" className="w-full h-full object-cover blur-[2px] scale-105 opacity-70" />
                : <div className="w-full h-full" style={{ background: 'linear-gradient(135deg,#1a1a22,#0a0a0d)' }} />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-white text-[10px] font-black uppercase tracking-widest">Replay</div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Play size={26} className="text-black ml-1" fill="black" />
                </span>
              </div>
              <div className="absolute bottom-3 left-4 right-4 text-left">
                <p className="text-white font-black text-sm truncate">{liveTitle}</p>
                <p className="text-white/75 text-[11px] font-bold">{post.authorName} · Watch the replay</p>
              </div>
            </button>
          );
        }
        // Ended with no replay (discarded / still processing) → a calm, non-clickable ended card.
        return (
          <div className="mt-4 relative w-full aspect-video rounded-3xl overflow-hidden border border-white/10 flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg,#141418,#0a0a0d)' }}>
            <span className="px-2.5 py-1 rounded-full bg-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest mb-2">Stream ended</span>
            <p className="text-white/80 font-black text-sm truncate max-w-[80%] text-center">{liveTitle}</p>
            <p className="text-white/40 text-[11px] font-bold mt-0.5">{post.authorName}</p>
          </div>
        );
      }
      return (
        <button
          onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('OPEN_LIVESTREAM', { detail: { streamId: post.liveStreamId, title: liveTitle, ownerName: post.authorName, ownerId: post.authorId } })); }}
          className="mt-4 relative w-full aspect-video rounded-3xl overflow-hidden border border-red-500/30 block group"
        >
          {post.authorPhoto
            ? <img src={post.authorPhoto} alt="" loading="lazy" className="w-full h-full object-cover blur-[2px] scale-105 opacity-70" />
            : <div className="w-full h-full" style={{ background: 'linear-gradient(135deg,#3a0a0a,#0a0a0d)' }} />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-16 h-16 rounded-full bg-red-600/85 border border-white/30 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Play size={26} className="text-white ml-1" fill="white" />
            </span>
          </div>
          <div className="absolute bottom-3 left-4 right-4 text-left">
            <p className="text-white font-black text-sm truncate">{liveTitle}</p>
            <p className="text-white/75 text-[11px] font-bold">{post.authorName} · Tap to watch live</p>
          </div>
        </button>
      );
    }
    if (!post.media || post.media.length === 0) return null;

    // Photos + videos become an inline gallery/carousel with per-asset fullscreen; everything
    // else (audio, links, 3D) stays in its own stacked card below.
    const GALLERY_TYPES = new Set(['PHOTO', 'GIF', 'STICKER', 'VIDEO']);
    const gallery = post.media.filter(m => GALLERY_TYPES.has(m.type));
    const others = post.media.filter(m => !GALLERY_TYPES.has(m.type));

    return (
      <>
        {gallery.length > 0 && <PostMediaCarousel items={gallery as any} />}
        {others.length > 0 && <div className="mt-4 space-y-4">
        {others.map((item, idx) => {
          switch (item.type) {
            case 'MODEL3D':
              return (
                <Model3DEmbed key={idx} url={item.url || ''} title={item.title} poster={item.thumbnail} />
              );
            case 'AUDIO':
              return (
                <div key={idx} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4">
                  <div className="w-10 h-10 bg-small-orange/20 rounded-xl flex items-center justify-center text-small-orange">
                    <Volume2 size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black uppercase tracking-widest truncate">{item.title || "Audio Clip"}</p>
                    <audio src={item.url} controls className="w-full h-8 mt-2" />
                  </div>
                </div>
              );
            case 'LINK': {
              const linkUrl = (item as any).linkPreview?.url || item.url || '';
              const socialEmbed = linkUrl ? parseSocialUrl(linkUrl) : null;
              if (socialEmbed) {
                return <SocialEmbedCard key={idx} embed={socialEmbed} />;
              }
              if ((item as any).linkPreview) {
                const lp = (item as any).linkPreview;
                return (
                  <a
                    key={idx}
                    href={lp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white/5 border border-white/10 rounded-3xl overflow-hidden hover:bg-white/10 transition-all group media-lift"
                  >
                    {lp.image && (
                      <img src={lp.image} alt="Preview" className="w-full h-48 object-cover opacity-80 group-hover:opacity-100 transition-all" loading="lazy" />
                    )}
                    <div className="p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <LinkIcon size={12} className="text-small-orange" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40 truncate">{new URL(lp.url).hostname}</span>
                      </div>
                      <h4 className="text-sm font-black uppercase tracking-widest mb-2 group-hover:text-small-orange transition-colors">{lp.title}</h4>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest line-clamp-2 leading-relaxed">{lp.description}</p>
                    </div>
                  </a>
                );
              }
              return (
                <a
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl text-small-orange hover:bg-white/10 transition-all"
                >
                  <ExternalLink size={16} />
                  <span className="text-xs font-black uppercase tracking-widest truncate">{item.url}</span>
                </a>
              );
            }
            default:
              return null;
          }
        })}
        </div>}
      </>
    );
  };

  // An expired "Today" never renders. Feeds filter these out upstream, but a stale
  // realtime snapshot or a surface that hasn't adopted the filter must not leak one —
  // this is the last-line guard. Placed after every hook so hook order stays stable.
  if (todayExpired) return null;

  return (
    <>
    {/* Edge-to-edge on phones (fills the device width, tighter), rounded card on desktop. */}
    <div className="relative group/card rounded-none sm:rounded-2xl border-y sm:border border-white/[0.06] transition-all duration-200 sm:hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.35),_0_-4px_10px_rgba(0,0,0,0.18)] hover:border-white/[0.1] hover:z-10 will-change-transform">
      <div className="flex gap-3 px-3 sm:px-4 py-3 sm:py-3.5 rounded-none sm:rounded-2xl hover:bg-white/[0.025] transition-colors">
        {/* Avatar col */}
        <div className="relative flex-shrink-0 group/profile">
          <button
            onClick={() => onVisitUser?.(post.authorId)}
            className="w-10 h-10 rounded-full overflow-hidden border border-white/10 hover:opacity-90 transition-opacity block"
          >
            <img
              src={post.authorPhoto || null}
              alt={post.authorName}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          </button>
          {auth.currentUser?.uid !== post.authorId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('START_CHAT', { detail: { userId: post.authorId } }));
              }}
              className="absolute -bottom-1 -right-1 w-5 h-5 bg-small-orange text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover/profile:opacity-100 transition-all hover:scale-110"
              title="Message User"
            >
              <MessageSquare size={10} fill="currentColor" />
            </button>
          )}
        </div>

        {/* Content col */}
        <div className="flex-1 min-w-0">
          {/* Compact header */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <button
                onClick={() => onVisitUser?.(post.authorId)}
                className={`${TYPE.titleMd} text-white hover:text-small-orange transition-colors leading-tight`}
              >
                {post.authorName}
              </button>
              {isTargeted && (
                <>
                  <ChevronRight size={12} className="text-white/20 flex-shrink-0" />
                  <button
                    onClick={() => onVisitUser?.(post.targetUserId!)}
                    className="text-[14px] font-bold text-white/50 hover:text-small-orange transition-colors leading-tight"
                  >
                    {post.targetUserName || 'Artist'}
                  </button>
                </>
              )}
              <span className="text-[13px] text-white/30 leading-tight flex-shrink-0">
                · {formatDistanceToNow(post.timestamp)}ago
              </span>
              {todayLive && (
                <span
                  className="flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded-full bg-small-orange/10 border border-small-orange/25 text-small-orange"
                  title={`This Today disappears ${post.expiresAt ? new Date(post.expiresAt).toLocaleString() : 'in 24h'}`}
                >
                  {/* 24h drain ring — fills as the window closes */}
                  <span className="relative w-2.5 h-2.5 rounded-full border border-small-orange/40 overflow-hidden">
                    <span
                      className="absolute inset-x-0 bottom-0 bg-small-orange/70"
                      style={{ height: `${Math.round((1 - todayProgress(post, todayNow)) * 100)}%` }}
                    />
                  </span>
                  <Clock size={9} />
                  <span className="text-[9px] font-black uppercase tracking-widest tabular-nums">
                    {formatTodayCountdown(post, todayNow)}
                  </span>
                </span>
              )}
              {post.modifiedAt && (
                <span className="flex items-center gap-1 text-small-orange text-[11px]">
                  <span className="w-1.5 h-1.5 bg-small-orange rounded-full animate-pulse" />
                  <span>edited</span>
                </span>
              )}
            </div>

            {/* Options menu — visible on hover */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="p-1 rounded-full text-white/20 hover:text-white hover:bg-white/10 transition-all opacity-0 group-hover/card:opacity-100"
              >
                <MoreHorizontal size={16} />
              </button>
              <AnimatePresence>
                {showOptions && isAuthor && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 6 }}
                    className="absolute right-0 mt-1 w-48 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  >
                    <button
                      onClick={async () => {
                        setShowOptions(false);
                        try {
                          const profile = await (await import('../services/backendService')).fetchUserProfile(auth.currentUser!.uid);
                          if (profile) {
                            const pinnedItems = profile.pinnedItems || [];
                            const newPin: { id: string; type: 'POST'; refId: string } = { id: Date.now().toString(), type: 'POST', refId: post.id };
                            if (!pinnedItems.find((p: any) => p.refId === post.id)) {
                              await (await import('../services/backendService')).updateUserProfile(auth.currentUser!.uid, { pinnedItems: [...pinnedItems, newPin] });
                              alert('Post Pinned to Profile!');
                            } else {
                              alert('Post is already pinned.');
                            }
                          }
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-small-orange hover:text-small-orange hover:bg-white/5 flex items-center gap-3 transition-all"
                    >
                      <Zap size={14} />
                      Pin to Profile
                    </button>
                    <button
                      onClick={() => { setIsEditing(true); setShowOptions(false); }}
                      className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/5 flex items-center gap-3 transition-all"
                    >
                      <Edit2 size={14} /> Edit Post
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 flex items-center gap-3 transition-all disabled:opacity-50"
                    >
                      <Trash2 size={14} /> {isDeleting ? 'Deleting...' : 'Delete Post'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Post text / edit */}
          {isEditing ? (
            <div className="space-y-3 mt-2">
              <div className="relative">
                <textarea
                  ref={editTextareaRef}
                  value={editedText}
                  onChange={handleEditTextChange}
                  onKeyDown={handleEditMentionKeyDown}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-sm font-medium leading-relaxed text-white outline-none focus:border-small-orange/50 transition-all"
                  rows={4}
                />
                {/* @mention dropdown */}
                {editMentionQuery !== null && (
                  <div className="absolute top-full left-0 z-50 mt-1 w-72 bg-[#0e0e0e]/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                    {editMentionLoading ? (
                      <div className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-white/25">Searching…</div>
                    ) : editMentionQuery.length === 0 ? (
                      <div className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-white/25">Type a name to search</div>
                    ) : editMentionResults.length === 0 ? (
                      <div className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-white/25">No users found for "{editMentionQuery}"</div>
                    ) : (
                      editMentionResults.map((user, i) => (
                        <button
                          key={user.uid}
                          onMouseDown={e => { e.preventDefault(); insertEditMention(user); }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            i === editMentionIndex ? 'bg-white/8' : 'hover:bg-white/5'
                          }`}
                        >
                          <img
                            src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`}
                            className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0"
                            alt=""
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black truncate text-white">{user.displayName}</p>
                            {user.bio && <p className="text-[8px] text-white/35 truncate mt-0.5">{user.bio}</p>}
                          </div>
                          {user.followerCount > 0 && (
                            <span className="text-[8px] font-black uppercase tracking-widest text-white/20 shrink-0">{user.followerCount} followers</span>
                          )}
                        </button>
                      ))
                    )}
                    <div className="px-4 py-2 border-t border-white/5">
                      <p className="text-[7px] font-black uppercase tracking-widest text-white/15">↑↓ navigate · Enter select · Esc dismiss</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editedText.trim()}
                  className="px-5 py-1.5 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2"
                >
                  {isSaving ? 'Saving...' : <><Check size={13} /> Save</>}
                </button>
                <button
                  onClick={() => { setIsEditing(false); setEditedText(post.text); }}
                  className="px-5 py-1.5 bg-white/5 text-white/40 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
                >
                  <XIcon size={13} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            // Safety gates: muted words/topics blur the CONTENT (author stays
            // visible above); creator content labels gate behind blur+consent.
            <MutedContentGate text={post.text}>
            <SensitiveContentGate labels={post.contentLabels as any}>
            {displayText && (
              <p className={`${TYPE.bodyMd} leading-normal text-white/80 whitespace-pre-wrap`}>
                <RenderTextWithMentions text={displayText} onVisitUser={onVisitUser} />
              </p>
            )}

            {/* Live Room — time-boxed room attached to this post */}
            {post.roomId && <RoomBanner roomId={post.roomId} title={post.roomTitle || post.text} endsAt={post.roomEndsAt} />}

          {/* Social embeds detected in post text (YouTube, TikTok, X, Instagram) */}
          {socialEmbedsFromText.length > 0 && (
            <div className="mt-3 space-y-3">
              {socialEmbedsFromText.map((embed, i) => (
                <SocialEmbedCard key={i} embed={embed} />
              ))}
            </div>
          )}

          {/* Plain link banners — slim bar shown when post text contains non-social URLs */}
          {nonSocialLinksFromText.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {nonSocialLinksFromText.map((url, i) => (
                <PostLinkBanner key={i} url={url} />
              ))}
            </div>
          )}

          {/* Embedded Album Player */}
          {post.albumEmbed && (
            <div className="mt-3">
              <MiniMusicPlayer album={post.albumEmbed} autoPlay={post.autoPlayEmbed} />
            </div>
          )}

          {/* Embedded platform asset (video / world / article / etc.) — music renders as the
              player above, so only show this card when there's no full album player. */}
          {(post as any).assetEmbed && !post.albumEmbed && (() => {
            const ae = (post as any).assetEmbed as { type: string; id: string; title?: string; imageUrl?: string; subtitle?: string };
            const linkFor: Record<string, string> = { VIDEO: 'video', ARTICLE: 'article', TRACK: 'track', ALBUM: 'album' };
            const asset = linkFor[ae.type];
            const href = asset ? buildShareUrl(asset as any, ae.id) : undefined;
            const Inner = (
              <div className="flex items-center gap-3 p-3 bg-white/[0.04] border border-white/10 rounded-2xl hover:border-white/25 transition-all">
                {ae.imageUrl
                  ? <img src={ae.imageUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                  : <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><Play size={16} className="text-white/40" /></div>}
                <div className="min-w-0 flex-1">
                  <p className="text-[8px] font-black uppercase tracking-[0.25em] text-small-orange">{ae.type} · On Plajah</p>
                  <p className="text-sm font-black text-white truncate">{ae.title || 'Open on Plajah'}</p>
                  {ae.subtitle && <p className="text-[11px] text-white/45 truncate">{ae.subtitle}</p>}
                </div>
                {href && <ChevronRight size={16} className="text-white/30 shrink-0" />}
              </div>
            );
            return <div className="mt-3">{href ? <a href={href} className="block">{Inner}</a> : Inner}</div>;
          })()}

          {/* Rich Media */}
          {renderMedia()}

          {/* Learn chip — education as a discovery surface (only renders on a real match) */}
          <LearnChip tags={post.tags} text={post.text} className="mt-3" compact />

          {/* Poll */}
          {(post as any).poll?.question && (
            <div className="mt-3">
              <Suspense fallback={<div className="h-20 bg-white/5 rounded-2xl animate-pulse" />}>
                <PollCard postId={post.id} poll={(post as any).poll} />
              </Suspense>
            </div>
          )}
            </SensitiveContentGate>
            </MutedContentGate>
          )}

          {/* Data Viz embed preview */}
          {(post as any).dataViz?.presetId && (
            <div className="mt-3 flex items-center gap-3 p-3 rounded-2xl bg-cyan-500/8 border border-cyan-500/20">
              <span className="text-xl">🔬</span>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-cyan-400/70 mb-0.5">Live Data Visualization</p>
                <p className="text-[12px] font-black text-white truncate">{(post as any).dataViz.title}</p>
                <p className="text-[9px] text-white/30">{(post as any).dataViz.source}</p>
              </div>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('OPEN_LABS_VIZ', { detail: { presetId: (post as any).dataViz.presetId } }))}
                className="px-3 py-1.5 rounded-full bg-cyan-500/15 border border-cyan-500/25 text-cyan-400 text-[9px] font-black uppercase tracking-wider hover:bg-cyan-500/25 transition-all shrink-0"
              >
                View →
              </button>
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center gap-1 mt-3 -ml-1.5">
            {/* Comment */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setShowComments(!showComments)}
              className={`tap flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all
                ${showComments
                  ? 'text-sky-400 bg-sky-400/10'
                  : 'text-white/40 hover:text-sky-400 hover:bg-sky-400/10'}`}
            >
              <MessageSquare size={16} strokeWidth={1.5} />
              {(post.commentsCount ?? 0) > 0 && (
                <span className="text-[12px]">{post.commentsCount}</span>
              )}
            </motion.button>

            {/* Media Waterfall — only when post has media */}
            {waterfallItems.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => setShowWaterfall(true)}
                title="View Media Waterfall"
                className="tap flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all text-white/40 hover:text-violet-400 hover:bg-violet-400/10"
              >
                <Layers size={15} strokeWidth={1.5} />
                {waterfallItems.length > 1 && <span className="text-[11px]">{waterfallItems.length}</span>}
              </motion.button>
            )}

            {/* Like */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={handleLike}
              className={`tap flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all
                ${isLiked
                  ? 'text-red-400 bg-red-400/10'
                  : 'text-white/40 hover:text-red-400 hover:bg-red-400/10'}`}
            >
              <Heart
                size={16}
                strokeWidth={1.5}
                fill={isLiked ? 'currentColor' : 'none'}
                className={isLiked ? 'text-red-400' : ''}
              />
              {likes > 0 && (
                <span className="text-[12px]">{likes}</span>
              )}
            </motion.button>

            {/* Gift — non-author only */}
            {!isAuthor && (
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => {
                  if (!auth.currentUser) { setSignInAction('send a gift'); return; }
                  setShowGift(!showGift);
                }}
                className={`tap flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all
                  ${showGift
                    ? 'text-yellow-400 bg-yellow-400/10'
                    : 'text-white/40 hover:text-yellow-400 hover:bg-yellow-400/10'}`}
              >
                <Gift size={16} strokeWidth={1.5} />
              </motion.button>
            )}

            {/* Send to Club */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={handleOpenSendToClub}
              title="Send to a Club"
              className="tap flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all text-white/40 hover:text-emerald-400 hover:bg-emerald-400/10"
            >
              <Users size={15} strokeWidth={1.5} />
            </motion.button>

            {/* Debate — non-author only, post must have text to challenge */}
            {!isAuthor && post.text && (
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => {
                  if (!auth.currentUser) { setSignInAction('challenge a post to a debate'); return; }
                  setShowDebateModal(true);
                }}
                title="Challenge this post to a structured debate"
                className="tap flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all text-white/40 hover:text-orange-400 hover:bg-orange-400/10"
              >
                <Swords size={15} strokeWidth={1.5} />
              </motion.button>
            )}

            {/* Share */}
            <div className="ml-auto">
              <ShareButton
                title={`Post by ${post.authorName}`}
                text={post.text || 'Check out this post on Plajah'}
                url={`${window.location.origin}/post/${post.id}`}
              />
            </div>
          </div>

          {/* Gift panel */}
          <AnimatePresence>
            {showGift && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 p-4 bg-small-orange/5 border border-small-orange/20 rounded-2xl">
                  {giftSent ? (
                    <div className="flex items-center justify-center gap-2 py-2 text-small-orange">
                      <Check size={16} />
                      <span className="text-[11px] font-black uppercase tracking-widest">Gift sent!</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3 flex items-center gap-2">
                        <Banknote size={11} className="text-small-orange" /> Gift to {post.authorName}
                      </p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {[1, 3, 5, 10].map(amt => (
                          <button
                            key={amt}
                            onClick={() => { setGiftAmount(amt); setCustomGift(''); }}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                              ${giftAmount === amt ? 'bg-small-orange text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                          >
                            ${amt}
                          </button>
                        ))}
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          placeholder="Custom"
                          value={customGift}
                          onChange={e => { setCustomGift(e.target.value); setGiftAmount(null); }}
                          className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-white outline-none w-24 focus:border-small-orange/50"
                        />
                      </div>
                      <button
                        onClick={handleGift}
                        disabled={isGifting || (!giftAmount && !parseFloat(customGift))}
                        className="w-full py-2.5 bg-small-orange text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                      >
                        {isGifting
                          ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending…</>
                          : <><Gift size={13} />Send Gift</>}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Community Notes — crowd-sourced context */}
      <div className="px-4 pb-2">
        <Suspense fallback={null}>
          <CommunityNoteBadge contentId={post.id} contentType="post" postAuthorId={post.authorId} />
        </Suspense>
      </div>

      {/* Comment section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <CommentSection
                postId={post.id}
                postAuthorId={post.authorId}
                onVisitUser={onVisitUser}
                onClose={() => setShowComments(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

    {/* Media Waterfall overlay */}
    <AnimatePresence>
      {showWaterfall && waterfallItems.length > 0 && (
        <MediaWaterfallView
          items={waterfallItems}
          onClose={() => setShowWaterfall(false)}
          commentNode={
            <CommentSection
              postId={post.id}
              postAuthorId={post.authorId}
              onVisitUser={onVisitUser}
              layout="inline"
            />
          }
        />
      )}
    </AnimatePresence>

    {/* Send to Club modal */}
    <AnimatePresence>
      {showSendToClub && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setShowSendToClub(false)}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="bg-[#0d0d0d] border border-white/10 rounded-3xl p-6 w-full max-w-sm"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-widest">Send to Club</h3>
                <p className="text-[9px] text-white/30 mt-0.5 uppercase tracking-widest">Share this post to a club timeline</p>
              </div>
              <button onClick={() => setShowSendToClub(false)} className="p-1.5 text-white/30 hover:text-white transition-colors"><XIcon size={16} /></button>
            </div>

            {/* Post preview chip */}
            <div className="flex items-start gap-3 bg-white/5 border border-white/8 rounded-2xl p-3 mb-5">
              <img src={post.authorPhoto || ''} className="w-8 h-8 rounded-full shrink-0 object-cover border border-white/10" alt="" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-0.5">{post.authorName}</p>
                <p className="text-[11px] text-white/60 line-clamp-2 leading-tight">{post.text || (post.media?.[0]?.title ?? 'Media post')}</p>
                {post.media && post.media.length > 0 && (
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {post.media.map((m, i) => (
                      <span key={i} className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-white/8 border border-white/10 rounded-full">{m.type}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {loadingClubs ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>
            ) : userClubs.length === 0 ? (
              <p className="text-center text-[10px] text-white/25 uppercase tracking-widest py-8 font-bold">You haven't joined any clubs yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {userClubs.map(club => (
                  <button
                    key={club.id}
                    onClick={() => handleSendToClub(club.id)}
                    disabled={!!sendingToClub}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/10 rounded-2xl transition-all text-left disabled:opacity-50"
                  >
                    {club.iconImage
                      ? <img src={club.iconImage} className="w-9 h-9 rounded-xl border border-white/10 object-cover shrink-0" alt="" />
                      : <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0"><Users size={14} className="opacity-30" /></div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-widest truncate">{club.name}</p>
                      <p className="text-[9px] text-white/25 mt-0.5">{club.memberCount?.toLocaleString()} members</p>
                    </div>
                    {sentToClub === club.id
                      ? <Check size={14} className="text-emerald-400 shrink-0" />
                      : sendingToClub === club.id
                      ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0" />
                      : null}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Sign-in prompt */}
    <AnimatePresence>
      {signInAction && (
        <SignInPrompt action={signInAction} onClose={() => setSignInAction(null)} />
      )}
    </AnimatePresence>

    {/* Debate challenge modal */}
    {showDebateModal && (
      <PostDebateModal
        postId={post.id}
        postText={post.text || ''}
        postAuthorId={post.authorId}
        postAuthorName={post.authorName}
        postAuthorPhoto={post.authorPhoto}
        heroImageUrl={(post.media || []).find(m => m.type === 'PHOTO')?.url}
        onClose={() => setShowDebateModal(false)}
        onDebateCreated={(debateId) => {
          setShowDebateModal(false);
          window.dispatchEvent(new CustomEvent('OPEN_DEBATE', { detail: { debateId } }));
        }}
      />
    )}

    {/* Image lightbox — uncropped pop-up with fullscreen option (portaled so it
        opens centered in the viewport, not at the top of a transformed page) */}
    <Portal>
    <AnimatePresence>
      {lightboxUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <motion.div
            initial={{ scale: 0.92, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 8 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="relative max-w-5xl max-h-[90vh] w-full flex items-center justify-center"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={lightboxUrl}
              alt="Full size"
              className="max-w-full max-h-[85vh] w-auto h-auto rounded-2xl object-contain shadow-2xl"
            />
            {/* Controls */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <a
                href={lightboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="p-2 rounded-xl bg-black/70 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white transition-colors"
                title="Open fullscreen"
              >
                <Maximize2 size={16} />
              </a>
              <button
                onClick={() => setLightboxUrl(null)}
                className="p-2 rounded-xl bg-black/70 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white transition-colors"
              >
                <XIcon size={16} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </Portal>
    </>
  );
};

export default PostCard;
