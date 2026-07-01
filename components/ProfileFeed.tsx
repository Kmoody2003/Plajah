import React, { useState, useEffect, useCallback } from 'react';
import FeedTimeline from './FeedTimeline';
import { sanitizeHtml } from '../src/lib/sanitize';
import { checkPostRateLimit, recordPost, detectSpam, honeypotTripped } from '../src/lib/spamCheck';
import { Post, UserProfile, Album, Video } from '../types';
import {
  listenToUserPosts,
  listenToFollowedPosts,
  listenToGlobalPosts,
  createPost,
  postFieldsForAssetEmbed,
  auth,
  fetchUserContent,
  fetchUserVideos,
  searchUserProfiles,
  linkXAccount
} from '../services/backendService';
import PostCard from './PostCard';
import UniversalPostComposer from './UniversalPostComposer';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Image as ImageIcon, 
  Music, 
  Video as VideoIcon, 
  Link as LinkIcon, 
  Smile, 
  Sticker, 
  Sparkles, 
  Globe, 
  Users, 
  Plus,
  X,
  Play,
  MessageSquare,
  Cloud,
  AtSign,
  ExternalLink,
  Loader2
} from 'lucide-react';

interface ProfileFeedProps {
  uid: string;
  profileName?: string;
  xHandle?: string;
  xEmbedHtml?: string;
  mastodonHandle?: string;
  mastodonInstance?: string;
  blueskyHandle?: string;
  threadsHandle?: string;
  onVisitUser: (uid: string) => void;
  onUpdateXHandle?: (handle: string) => void;
  initialFeedType?: 'PERSONAL' | 'GLOBAL' | 'X_FEED' | 'MASTODON' | 'BLUESKY' | 'THREADS';
  hideBroadcaster?: boolean;
}

const ProfileFeed: React.FC<ProfileFeedProps> = ({ 
  uid, 
  profileName, 
  xHandle, 
  xEmbedHtml, 
  mastodonHandle,
  mastodonInstance,
  blueskyHandle,
  threadsHandle,
  onVisitUser, 
  onUpdateXHandle,
  initialFeedType = 'PERSONAL',
  hideBroadcaster = false
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedType, setFeedType] = useState<'PERSONAL' | 'GLOBAL' | 'X_FEED' | 'MASTODON' | 'BLUESKY' | 'THREADS'>(initialFeedType);
  const [mastodonPosts, setMastodonPosts] = useState<any[]>([]);
  const [blueskyPosts, setBlueskyPosts] = useState<any[]>([]);
  const [threadsPosts, setThreadsPosts] = useState<any[]>([]);
  const [isLoadingThirdParty, setIsLoadingThirdParty] = useState(false);
  const [thirdPartyError, setThirdPartyError] = useState<string | null>(null);
  const [mastodonAuth, setMastodonAuth] = useState<{ token: string; instance: string } | null>(() => {
    const saved = localStorage.getItem('plajah_mastodon_auth');
    return saved ? JSON.parse(saved) : null;
  });
  const [blueskyAuth, setBlueskyAuth] = useState<{ session: any } | null>(() => {
    const saved = localStorage.getItem('plajah_bluesky_auth');
    return saved ? JSON.parse(saved) : null;
  });
  const [replyingTo, setReplyingTo] = useState<{ id: string; platform: string; data?: any } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [bskyUsername, setBskyUsername] = useState('');
  const [bskyPassword, setBskyPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MASTODON_AUTH_SUCCESS' && event.data.code) {
        handleMastodonTokenExchange(event.data.code);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [mastodonInstance]);

  const handleMastodonTokenExchange = async (code: string) => {
    if (!mastodonInstance) return;
    const cleanInstance = mastodonInstance.replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    try {
      // 1. Get client credentials from server (which we registered earlier)
      const regRes = await fetch('/api/auth/mastodon/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance: cleanInstance })
      });
      const { clientId, clientSecret } = await regRes.json();

      // 2. Exchange code for token
      const tokenRes = await fetch('/api/auth/mastodon/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance: cleanInstance,
          code,
          clientId,
          clientSecret
        })
      });
      const data = await tokenRes.json();
      if (data.access_token) {
        const authData = { token: data.access_token, instance: cleanInstance };
        setMastodonAuth(authData);
        localStorage.setItem('plajah_mastodon_auth', JSON.stringify(authData));
      }
    } catch (err) {
      console.error('Mastodon Auth Error:', err);
    }
  };

  const connectMastodon = async () => {
    if (!mastodonInstance) return;
    const cleanInstance = mastodonInstance.replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    try {
      const regRes = await fetch('/api/auth/mastodon/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance: cleanInstance })
      });
      const { clientId } = await regRes.json();

      const redirectUri = `${window.location.origin}/auth/mastodon/callback`;
      const authUrl = `https://${cleanInstance}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read+write+follow`;
      
      window.open(authUrl, 'mastodon_oauth', 'width=600,height=700');
    } catch (err) {
      console.error('Mastodon Connect Error:', err);
    }
  };

  const loginBluesky = async () => {
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/auth/bluesky/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: bskyUsername, password: bskyPassword })
      });
      const data = await res.json();
      if (data.session) {
        setBlueskyAuth({ session: data.session });
        localStorage.setItem('plajah_bluesky_auth', JSON.stringify({ session: data.session }));
      }
    } catch (err) {
      console.error('Bluesky login error:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const submitReply = async () => {
    if (!replyText.trim() || !replyingTo) return;
    setIsReplying(true);
    try {
      if (replyingTo.platform === 'MASTODON' || replyingTo.platform === 'THREADS') {
        if (!mastodonAuth) return;
        const res = await fetch('/api/social/mastodon/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instance: mastodonAuth.instance,
            token: mastodonAuth.token,
            status: replyText,
            inReplyToId: replyingTo.id
          })
        });
        if (res.ok) {
           setReplyText('');
           setReplyingTo(null);
           // Refresh feed
           if (feedType === 'MASTODON') fetchMastodon();
           if (feedType === 'THREADS') fetchThreads();
        }
      } else if (replyingTo.platform === 'BLUESKY') {
        if (!blueskyAuth) return;
        const res = await fetch('/api/social/bluesky/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session: blueskyAuth.session,
            text: replyText,
            reply: {
              root: replyingTo.data.root || { uri: replyingTo.data.uri, cid: replyingTo.data.cid },
              parent: { uri: replyingTo.data.uri, cid: replyingTo.data.cid }
            }
          })
        });
        if (res.ok) {
           setReplyText('');
           setReplyingTo(null);
           fetchBluesky();
        }
      }
    } catch (err) {
      console.error('Reply failed:', err);
    } finally {
      setIsReplying(false);
    }
  };
  const [postText, setPostText] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<any[]>([]);
  const [isPastingMedia, setIsPastingMedia] = useState(false);

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.kind === 'file' && item.type.startsWith('image/'));
    if (!imageItems.length || !auth.currentUser) return;
    e.preventDefault();
    setIsPastingMedia(true);
    try {
      const { uploadFile } = await import('../services/backendService');
      const uploads = imageItems.map(async item => {
        const file = item.getAsFile();
        if (!file) return null;
        const ext = file.type.split('/')[1] || 'png';
        const url = await uploadFile(`posts/${auth.currentUser!.uid}/paste_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`, file);
        return { type: 'PHOTO' as const, url };
      });
      const results = (await Promise.all(uploads)).filter(Boolean) as { type: 'PHOTO'; url: string }[];
      if (results.length) setSelectedMedia(prev => [...prev, ...results]);
    } catch (err) {
      console.error('[ProfileFeed] Paste upload failed:', err);
    } finally {
      setIsPastingMedia(false);
    }
  }, []);
  const [showMediaPicker, setShowMediaPicker] = useState<'ALBUM' | 'VIDEO' | 'GIF' | 'STICKER' | 'EMOJI' | null>(null);
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [userVideos, setUserVideos] = useState<Video[]>([]);
  const [embeddedAlbum, setEmbeddedAlbum] = useState<Album | null>(null);
  const [autoPlayEmbed, setAutoPlayEmbed] = useState(false);
  const [tempXHandle, setTempXHandle] = useState('');
  const [showXLinkModal, setShowXLinkModal] = useState(false);
  const [isLinkingX, setIsLinkingX] = useState(false);

  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState(-1);

  const [scrubTimestamp, setScrubTimestamp] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const handleScrub = useCallback((ts: number | null) => setScrubTimestamp(ts), []);
  const handleScrubbing = useCallback((s: boolean) => setIsScrubbing(s), []);

  useEffect(() => {
    const handleMentionSearch = async () => {
      if (mentionSearch.length > 0) {
        const users = await searchUserProfiles(mentionSearch);
        setSuggestedUsers(users);
        setShowMentionDropdown(users.length > 0);
      } else {
        setShowMentionDropdown(false);
      }
    };
    handleMentionSearch();
  }, [mentionSearch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorIndex = e.target.selectionStart || 0;
    setPostText(val);

    const lastAtPos = val.lastIndexOf('@', cursorIndex - 1);
    if (lastAtPos !== -1) {
      const textAfterAt = val.substring(lastAtPos + 1, cursorIndex);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setMentionSearch(textAfterAt);
        setMentionTriggerIndex(lastAtPos);
        return;
      }
    }
    setMentionTriggerIndex(-1);
    setMentionSearch('');
    setShowMentionDropdown(false);
  };

  const handleSelectMention = (user: UserProfile) => {
    const beforeMention = postText.substring(0, mentionTriggerIndex);
    const afterMention = postText.substring(mentionTriggerIndex + 1 + mentionSearch.length);
    const newContent = `${beforeMention}@[${user.displayName}](${user.uid})${afterMention}`;
    setPostText(newContent);
    setMentionTriggerIndex(-1);
    setMentionSearch('');
    setShowMentionDropdown(false);
  };

  const isOwnProfile = auth.currentUser?.uid === uid;

  useEffect(() => {
    let unsubscribe: () => void;

    if (feedType === 'PERSONAL') {
      unsubscribe = listenToUserPosts(uid, (items) => {
        setPosts(items);
      });
    } else {
      unsubscribe = listenToGlobalPosts((items) => {
        setPosts(items);
      });
    }

    return () => unsubscribe?.();
  }, [uid, feedType]);

  useEffect(() => {
    if (isOwnProfile) {
      fetchUserContent(uid).then(setUserAlbums);
      fetchUserVideos(uid).then(setUserVideos);
    }
  }, [uid, isOwnProfile]);

  const fetchMastodon = React.useCallback(async () => {
    if (!mastodonHandle || !mastodonInstance) return;
    setIsLoadingThirdParty(true);
    setThirdPartyError(null);
    try {
      const cleanHandle = mastodonHandle.startsWith('@') ? mastodonHandle.substring(1) : mastodonHandle;
      let cleanInstance = mastodonInstance.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (cleanInstance.includes('@')) {
        const parts = cleanInstance.split('@');
        cleanInstance = parts[parts.length - 1];
      }

      // Use proxy for lookup to avoid CORS
      const lookupPath = `/api/v1/accounts/lookup?acct=${cleanHandle}`;
      const lookupUrl = `/api/social/fediverse/proxy?instance=${cleanInstance}&path=${encodeURIComponent(lookupPath)}`;
      
      const accountRes = await fetch(lookupUrl);
      if (!accountRes.ok) {
        const errText = await accountRes.text();
        console.error('Mastodon lookup failed:', errText);
        throw new Error(`Mastodon account lookup failed: ${accountRes.status}`);
      }
      
      const contentType = accountRes.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
         throw new Error('Mastodon lookup returned invalid data format (non-JSON)');
      }
      
      const accountData = await accountRes.json();
      
      // Use proxy for statuses
      const statusesPath = `/api/v1/accounts/${accountData.id}/statuses?exclude_replies=true`;
      const statusesUrl = `/api/social/fediverse/proxy?instance=${cleanInstance}&path=${encodeURIComponent(statusesPath)}`;
      
      const statusesRes = await fetch(statusesUrl);
      if (!statusesRes.ok) throw new Error('Could not fetch Mastodon statuses');
      
      const statusesContentType = statusesRes.headers.get('content-type');
      if (!statusesContentType || !statusesContentType.includes('application/json')) {
         throw new Error('Mastodon statuses returned invalid data format (non-JSON)');
      }
      
      const statusesData = await statusesRes.json();
      setMastodonPosts(statusesData);
    } catch (err: any) {
      console.error('Mastodon fetch error:', err);
      setThirdPartyError(err.message || 'Mastodon synchronisation failed');
    } finally {
      setIsLoadingThirdParty(false);
    }
  }, [mastodonHandle, mastodonInstance]);

  const fetchBluesky = React.useCallback(async () => {
    if (!blueskyHandle) return;
    setIsLoadingThirdParty(true);
    setThirdPartyError(null);
    try {
      const cleanHandle = blueskyHandle.startsWith('@') ? blueskyHandle.substring(1) : blueskyHandle;
      const actor = cleanHandle.includes('.') ? cleanHandle : `${cleanHandle}.bsky.social`;
      const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${actor}&filter=posts_no_replies&limit=20`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Bluesky fetch failed');
      const data = await res.json();
      setBlueskyPosts(data.feed || []);
    } catch (err: any) {
      console.error('Bluesky fetch error:', err);
      setThirdPartyError('Bluesky connection interrupted');
    } finally {
      setIsLoadingThirdParty(false);
    }
  }, [blueskyHandle]);

  const fetchThreads = React.useCallback(async () => {
    if (!threadsHandle) return;
    setIsLoadingThirdParty(true);
    setThirdPartyError(null);
    try {
      let bridgeInstance = (mastodonInstance || 'mastodon.social').replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (bridgeInstance.includes('@')) {
        const parts = bridgeInstance.split('@');
        bridgeInstance = parts[parts.length - 1];
      }
      
      const rawHandle = threadsHandle.trim();
      const cleanHandle = rawHandle.startsWith('@') ? rawHandle.substring(1) : rawHandle;
      const targetAcct = cleanHandle.includes('@') ? cleanHandle : `${cleanHandle}@threads.net`;
      
      // Use proxy for search with resolve=true
      const searchPath = `/api/v2/search?q=${encodeURIComponent(targetAcct)}&resolve=true&type=accounts&limit=1`;
      let searchUrl = `/api/social/fediverse/proxy?instance=${bridgeInstance}&path=${encodeURIComponent(searchPath)}`;
      if (mastodonAuth?.token) {
        searchUrl += `&token=${mastodonAuth.token}`;
      }

      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) {
        if (searchRes.status === 401 || searchRes.status === 403) {
           throw new Error('Fediverse search restricted - Mastodon connection required');
        }
        throw new Error(`Fediverse search failed: ${searchRes.status}`);
      }
      
      const searchContentType = searchRes.headers.get('content-type');
      if (!searchContentType || !searchContentType.includes('application/json')) {
         throw new Error('Fediverse search returned invalid data format');
      }
      
      const searchData = await searchRes.json();
      const matchedAccount = searchData.accounts?.[0];

      if (!matchedAccount) throw new Error('Threads Fediverse account not found');
      
      // Use proxy for statuses
      const statusesPath = `/api/v1/accounts/${matchedAccount.id}/statuses?exclude_replies=true`;
      const statusesUrl = `/api/social/fediverse/proxy?instance=${bridgeInstance}&path=${encodeURIComponent(statusesPath)}`;
      
      const statusesRes = await fetch(statusesUrl);
      if (!statusesRes.ok) throw new Error('Could not fetch Threads statuses from bridge');
      
      const stContentType = statusesRes.headers.get('content-type');
      if (!stContentType || !stContentType.includes('application/json')) {
         throw new Error('Threads statuses returned invalid data format');
      }
      
      const statusesData = await statusesRes.json();
      setThreadsPosts(statusesData);
    } catch (err: any) {
      console.error('Threads fetch error:', err);
      setThirdPartyError(err.message);
    } finally {
      setIsLoadingThirdParty(false);
    }
  }, [threadsHandle, mastodonInstance, mastodonAuth]);

  useEffect(() => {
    if (feedType === 'MASTODON') fetchMastodon();
  }, [feedType, fetchMastodon]);

  useEffect(() => {
    if (feedType === 'BLUESKY') fetchBluesky();
  }, [feedType, fetchBluesky]);

  useEffect(() => {
    if (feedType === 'THREADS') fetchThreads();
  }, [feedType, fetchThreads]);

  const twitterContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedType === 'X_FEED' && (xEmbedHtml || xHandle)) {
      const loadWidgets = () => {
        if ((window as any).twttr && (window as any).twttr.widgets) {
          // Twitter widgets load can take the element to scan
          (window as any).twttr.widgets.load(twitterContainerRef.current);
        }
      };

      if (!(window as any).twttr) {
        const script = document.createElement('script');
        script.src = 'https://platform.twitter.com/widgets.js';
        script.async = true;
        document.body.appendChild(script);
        script.onload = () => {
          // Add a small delay for DOM to be ready
          setTimeout(loadWidgets, 100);
        };
      } else {
        // If script is already there, give it a bit of time then load
        setTimeout(loadWidgets, 200);
      }
    }
  }, [xEmbedHtml, xHandle, feedType]);

  const handleCreatePost = async () => {
    if (!postText.trim() && !selectedMedia.length && !embeddedAlbum) return;
    if (honeypotTripped(honeypot)) return; // silent bot drop
    const rateCheck = checkPostRateLimit();
    if (!rateCheck.allowed) {
      alert(`Please wait ${rateCheck.waitSecs}s before posting again.`);
      return;
    }
    const spamReason = detectSpam(postText);
    if (spamReason) { alert(spamReason); return; }

    setIsCreating(true);
    try {
      await createPost({
        text: postText || '',
        media: selectedMedia || [],
        albumEmbed: embeddedAlbum || undefined,
        autoPlayEmbed: autoPlayEmbed,
        isPublic: true,
        targetUserId: isOwnProfile ? undefined : uid,
        targetUserName: isOwnProfile ? undefined : profileName
      });
      recordPost();
      setPostText('');
      setSelectedMedia([]);
      setEmbeddedAlbum(null);
      setAutoPlayEmbed(false);
    } catch (error) {
      console.error("Failed to create post:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const renderFeedContent = () => {
    if (feedType === 'MASTODON') {
      return (
        <div id="mastodon-feed-container" className="bg-white/[0.03] border border-white/5 rounded-[3rem] p-4 lg:p-8 min-h-[600px] flex flex-col items-center relative overflow-hidden">
           <div className="absolute inset-0 opacity-5 pointer-events-none">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <AtSign size={400} className="text-white" strokeWidth={0.5} />
             </div>
           </div>
           
           <div className="relative z-10 w-full max-w-2xl space-y-8">
             <div className="flex flex-col items-center text-center space-y-4 mb-8">
               <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
                 <AtSign size={32} className="text-[#563acc]" />
               </div>
               <h3 className="text-2xl font-black uppercase tracking-tightest">Mastodon Signal</h3>
               <p className="text-[10px] font-black uppercase tracking-widest text-white/30">
                 @{mastodonHandle} on {mastodonInstance}
               </p>
               
               <div className="flex items-center gap-3">
                 {!mastodonAuth ? (
                   <button 
                     onClick={connectMastodon}
                     className="px-4 py-2 bg-[#563acc] text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2"
                   >
                     <AtSign size={10} />
                     Connect Mastodon
                   </button>
                 ) : (
                   <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                     <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                     <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Authenticated Client</span>
                   </div>
                 )}
               </div>
             </div>

             {isLoadingThirdParty ? (
               <div className="py-20 flex flex-col items-center gap-4 text-white/20">
                 <Loader2 size={40} className="animate-spin" />
                 <p className="text-[10px] font-black uppercase tracking-widest">Intercepting Signal...</p>
               </div>
             ) : thirdPartyError ? (
                <div className="py-20 flex flex-col items-center gap-4 text-center">
                   <X size={40} className="text-red-500/50 mb-2" />
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500/60">{thirdPartyError}</p>
                   {!mastodonAuth && (
                    <button 
                      onClick={connectMastodon}
                      className="mt-4 px-6 py-3 bg-[#563acc] text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-xl"
                    >
                      Connect Mastodon
                    </button>
                   )}
                </div>
              ) : mastodonPosts.length > 0 ? (
               <div className="space-y-6">
                 {mastodonPosts.map((status: any) => (
                   <motion.div 
                     key={status.id}
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     className="p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/[0.07] transition-all"
                   >
                     <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(status.content) }} className="text-sm leading-relaxed text-white prose prose-invert max-w-none" />
                     {status.media_attachments.length > 0 && (
                       <div className="grid grid-cols-2 gap-2 mt-4">
                         {status.media_attachments.map((media: any) => (
                           <img key={media.id} src={media.url || null} alt="" className="rounded-xl w-full h-40 object-cover border border-white/5" loading="lazy" decoding="async" />
                         ))}
                       </div>
                     )}
                     <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                       <div className="flex items-center gap-4">
                         <span className="text-[8px] font-black uppercase tracking-widest text-white/20">
                           {new Date(status.created_at).toLocaleDateString()}
                         </span>
                         <button 
                           onClick={() => setReplyingTo({ id: status.id, platform: 'MASTODON' })}
                           className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-all"
                         >
                           <MessageSquare size={10} />
                           Reply
                         </button>
                       </div>
                       <a href={status.url} target="_blank" rel="noopener noreferrer" className="text-white/20 hover:text-white transition-all">
                         <ExternalLink size={12} />
                       </a>
                     </div>

                     <AnimatePresence>
                       {replyingTo?.id === status.id && (
                         <motion.div 
                           initial={{ opacity: 0, height: 0 }}
                           animate={{ opacity: 1, height: 'auto' }}
                           exit={{ opacity: 0, height: 0 }}
                           className="mt-4 space-y-3"
                         >
                           {!mastodonAuth ? (
                             <button 
                               onClick={connectMastodon}
                               className="w-full py-3 bg-[#563acc] text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:opacity-90 transition-all text-center"
                             >
                               Connect to Reply
                             </button>
                           ) : (
                             <>
                               <textarea
                                 value={replyText}
                                 onChange={(e) => setReplyText(e.target.value)}
                                 placeholder="Write your reply..."
                                 className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-white/20 resize-none h-20 outline-none focus:border-white/20 transition-all font-sans"
                               />
                               <div className="flex justify-end gap-2">
                                 <button 
                                   onClick={() => setReplyingTo(null)}
                                   className="px-4 py-2 text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
                                 >
                                   Cancel
                                 </button>
                                 <button 
                                   onClick={submitReply}
                                   disabled={isReplying || !replyText.trim()}
                                   className="px-4 py-2 bg-white text-black rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all disabled:opacity-50"
                                 >
                                   {isReplying ? <Loader2 size={10} className="animate-spin" /> : 'Signal Reply'}
                                 </button>
                               </div>
                             </>
                           )}
                         </motion.div>
                       )}
                     </AnimatePresence>
                   </motion.div>
                 ))}
               </div>
             ) : (
               <div className="py-20 text-center text-white/20">
                 <p className="text-[10px] font-black uppercase tracking-widest">No signals found from this frequency</p>
               </div>
             )}
           </div>
        </div>
      );
    }

    if (feedType === 'BLUESKY') {
      return (
        <div className="bg-white/[0.03] border border-white/5 rounded-[3rem] p-8 min-h-[600px] flex flex-col items-center relative overflow-hidden">
           <div className="absolute inset-0 opacity-5 pointer-events-none">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <Cloud size={400} className="text-white" strokeWidth={0.5} />
             </div>
           </div>
           
           <div className="relative z-10 w-full max-w-2xl space-y-8">
             <div className="flex flex-col items-center text-center space-y-4 mb-8">
               <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
                 <Cloud size={32} className="text-[#0085ff]" />
               </div>
               <h3 className="text-2xl font-black uppercase tracking-tightest">Bluesky Signal</h3>
               <p className="text-[10px] font-black uppercase tracking-widest text-white/30">
                 @{blueskyHandle}
               </p>
               
               <div className="w-full max-w-sm mt-4">
                 {!blueskyAuth ? (
                   <div className="space-y-3">
                     <div className="flex gap-2">
                       <input 
                         type="text"
                         value={bskyUsername}
                         onChange={(e) => setBskyUsername(e.target.value)}
                         placeholder="Bluesky Handle"
                         className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white outline-none"
                       />
                       <input 
                         type="password"
                         value={bskyPassword}
                         onChange={(e) => setBskyPassword(e.target.value)}
                         placeholder="App Password"
                         className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white outline-none"
                       />
                     </div>
                     <button 
                       onClick={loginBluesky}
                       disabled={isLoggingIn}
                       className="w-full py-2 bg-[#0085ff] text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2"
                     >
                       {isLoggingIn ? <Loader2 size={10} className="animate-spin" /> : <Cloud size={10} />}
                       Connect Bluesky to Reply
                     </button>
                     <p className="text-[8px] text-white/20 text-center uppercase tracking-widest">
                       Use an App Password from Settings {'>'} Advanced
                     </p>
                   </div>
                 ) : (
                   <div className="flex items-center justify-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5 max-w-fit mx-auto">
                     <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                     <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Authenticated Client</span>
                   </div>
                 )}
               </div>
             </div>

             {isLoadingThirdParty ? (
               <div className="py-20 flex flex-col items-center gap-4 text-white/20">
                 <Loader2 size={40} className="animate-spin" />
                 <p className="text-[10px] font-black uppercase tracking-widest">Intercepting Signal...</p>
               </div>
             ) : thirdPartyError ? (
                <div className="py-20 flex flex-col items-center gap-4 text-center">
                   <X size={40} className="text-blue-500/50 mb-2" />
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500/60">{thirdPartyError}</p>
                </div>
              ) : blueskyPosts.length > 0 ? (
               <div className="space-y-6">
                 {blueskyPosts.map((item: any, idx: number) => (
                   <motion.div 
                     key={idx}
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     className="p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/[0.07] transition-all"
                   >
                     <p className="text-sm leading-relaxed text-white">
                       {item.post.record.text}
                     </p>
                     {item.post.embed?.images && (
                       <div className="grid grid-cols-2 gap-2 mt-4">
                         {item.post.embed.images.map((img: any, i: number) => (
                           <img key={i} src={img.fullsize || null} alt="" className="rounded-xl w-full h-40 object-cover border border-white/5" loading="lazy" decoding="async" />
                         ))}
                       </div>
                     )}
                     <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                       <div className="flex items-center gap-4">
                         <span className="text-[8px] font-black uppercase tracking-widest text-white/20">
                           {new Date(item.post.record.createdAt).toLocaleDateString()}
                         </span>
                         <button 
                           onClick={() => setReplyingTo({ 
                             id: item.post.uri, 
                             platform: 'BLUESKY',
                             data: {
                               uri: item.post.uri,
                               cid: item.post.cid,
                               root: item.reply?.root || item.post
                             }
                           })}
                           className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-all"
                         >
                           <MessageSquare size={10} />
                           Reply
                         </button>
                       </div>
                       <a href={`https://bsky.app/profile/${item.post.author.did}/post/${item.post.uri.split('/').pop()}`} target="_blank" rel="noopener noreferrer" className="text-white/20 hover:text-white transition-all">
                         <ExternalLink size={12} />
                       </a>
                     </div>

                     <AnimatePresence>
                       {replyingTo?.id === item.post.uri && (
                         <motion.div 
                           initial={{ opacity: 0, height: 0 }}
                           animate={{ opacity: 1, height: 'auto' }}
                           exit={{ opacity: 0, height: 0 }}
                           className="mt-4 space-y-3"
                         >
                           {!blueskyAuth ? (
                             <p className="text-[8px] text-white/20 uppercase tracking-widest text-center py-2">
                               Please login to Bluesky above to reply
                             </p>
                           ) : (
                             <>
                               <textarea
                                 value={replyText}
                                 onChange={(e) => setReplyText(e.target.value)}
                                 placeholder="Write your reply..."
                                 className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-white/20 resize-none h-20 outline-none focus:border-white/20 transition-all font-sans"
                               />
                               <div className="flex justify-end gap-2">
                                 <button 
                                   onClick={() => setReplyingTo(null)}
                                   className="px-4 py-2 text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
                                 >
                                   Cancel
                                 </button>
                                 <button 
                                   onClick={submitReply}
                                   disabled={isReplying || !replyText.trim()}
                                   className="px-4 py-2 bg-white text-black rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all disabled:opacity-50"
                                 >
                                   {isReplying ? <Loader2 size={10} className="animate-spin" /> : 'Signal Reply'}
                                 </button>
                               </div>
                             </>
                           )}
                         </motion.div>
                       )}
                     </AnimatePresence>
                   </motion.div>
                 ))}
               </div>
             ) : (
               <div className="py-20 text-center text-white/20">
                 <p className="text-[10px] font-black uppercase tracking-widest">No signals found from this frequency</p>
               </div>
             )}
           </div>
        </div>
      );
    }

    if (feedType === 'THREADS') {
      return (
        <div className="bg-white/[0.03] border border-white/5 rounded-[3rem] p-4 lg:p-8 min-h-[600px] flex flex-col items-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <MessageSquare size={400} className="text-white" strokeWidth={0.5} />
            </div>
          </div>

          <div className="relative z-10 w-full max-w-2xl space-y-8">
            <div className="flex flex-col items-center text-center space-y-4 mb-8">
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
                <MessageSquare size={32} className="text-white" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tightest">Threads Signal</h3>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30">
                @{threadsHandle}
              </p>
              {!mastodonAuth && (
                <div className="text-center">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-3">
                    Connect Mastodon to load Threads via Fediverse bridge
                  </p>
                  <button
                    onClick={connectMastodon}
                    className="px-4 py-2 bg-[#563acc] text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2 mx-auto"
                  >
                    <AtSign size={10} />
                    Connect Mastodon Bridge
                  </button>
                </div>
              )}
            </div>

            {isLoadingThirdParty ? (
              <div className="py-20 flex flex-col items-center gap-4 text-white/20">
                <Loader2 size={40} className="animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-widest">Intercepting Signal...</p>
              </div>
            ) : thirdPartyError ? (
              <div className="py-20 flex flex-col items-center gap-4 text-center">
                <MessageSquare size={40} className="text-white/20 mb-2" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500/60">{thirdPartyError}</p>
                {!mastodonAuth && (
                  <button
                    onClick={connectMastodon}
                    className="mt-4 px-6 py-3 bg-[#563acc] text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-xl"
                  >
                    Connect Mastodon Bridge
                  </button>
                )}
              </div>
            ) : threadsPosts.length > 0 ? (
              <div className="space-y-6">
                {threadsPosts.map((status: any) => (
                  <motion.div
                    key={status.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/[0.07] transition-all"
                  >
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(status.content) }} className="text-sm leading-relaxed text-white prose prose-invert max-w-none" />
                    {status.media_attachments?.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        {status.media_attachments.map((media: any) => (
                          <img key={media.id} src={media.url || null} alt="" className="rounded-xl w-full h-40 object-cover border border-white/5" loading="lazy" decoding="async" />
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                      <div className="flex items-center gap-4">
                        <span className="text-[8px] font-black uppercase tracking-widest text-white/20">
                          {new Date(status.created_at).toLocaleDateString()}
                        </span>
                        {mastodonAuth && (
                          <button
                            onClick={() => setReplyingTo({ id: status.id, platform: 'THREADS' })}
                            className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-all"
                          >
                            <MessageSquare size={10} />
                            Reply
                          </button>
                        )}
                      </div>
                      {status.url && (
                        <a href={status.url} target="_blank" rel="noopener noreferrer" className="text-white/20 hover:text-white transition-all">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                    <AnimatePresence>
                      {replyingTo?.id === status.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 space-y-3"
                        >
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write your reply..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-white/20 resize-none h-20 outline-none focus:border-white/20 transition-all font-sans"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setReplyingTo(null)}
                              className="px-4 py-2 text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={submitReply}
                              disabled={isReplying || !replyText.trim()}
                              className="px-4 py-2 bg-white text-black rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all disabled:opacity-50"
                            >
                              {isReplying ? <Loader2 size={10} className="animate-spin" /> : 'Signal Reply'}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center text-white/20">
                <p className="text-[10px] font-black uppercase tracking-widest">No signals found from this frequency</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (feedType === 'X_FEED') {
      return (
        <div className="bg-white/[0.03] border border-white/5 rounded-[3rem] p-8 min-h-[600px] flex flex-col items-center justify-center relative overflow-hidden">
           <div className="absolute inset-0 opacity-10 pointer-events-none">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <X size={400} className="text-white" strokeWidth={0.5} />
             </div>
           </div>
           
           <div className="relative z-10 text-center space-y-6 max-w-lg">
             <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-8">
               <X size={32} className="text-white" />
             </div>
             <h3 className="text-2xl font-black uppercase tracking-tightest">Real-time Connection</h3>
             {(xEmbedHtml || xHandle) ? (
               <div className="w-full max-h-[800px] overflow-y-auto bg-white/5 rounded-3xl p-4 border border-white/10 custom-scrollbar">
                 <div 
                   ref={twitterContainerRef}
                   className="twitter-embed-container"
                   dangerouslySetInnerHTML={{
                     __html: sanitizeHtml(xEmbedHtml || `
                       <a class="twitter-timeline" data-theme="dark" href="https://twitter.com/${xHandle}?ref_src=twsrc%5Etfw">Tweets by @${xHandle}</a>
                     `)
                   }}
                 />
                 {isOwnProfile && (
                   <div className="mt-8 pt-8 border-t border-white/5 text-center">
                     <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-4">
                       {xEmbedHtml ? 'Broadcasting via Custom Signal' : `Auto-generating Signal from @${xHandle}`}
                     </p>
                     <button 
                       onClick={() => { setTempXHandle(xHandle || ''); setShowXLinkModal(true); }}
                       className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-all underline decoration-white/20 underline-offset-4"
                     >
                       Update Signal Configuration
                     </button>
                   </div>
                 )}
               </div>
             ) : (
               <div className="p-8 border border-white/10 rounded-3xl bg-white/5 backdrop-blur-xl w-full">
                  <p className="text-white/40 text-sm leading-relaxed mb-8">
                    Connect your X account to broadcast your external signals directly to your Plajah profile.
                  </p>
                  <div className="py-8 flex flex-col items-center gap-4 text-white/20">
                     <Sparkles size={40} className="animate-pulse" />
                     <p className="text-[10px] font-black uppercase tracking-widest italic">Waiting for signal...</p>
                  </div>
                  {isOwnProfile && (
                     <button 
                       onClick={() => { setTempXHandle(''); setShowXLinkModal(true); }}
                       className="w-full px-8 py-4 bg-white text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all shadow-xl"
                     >
                       Link Account
                     </button>
                  )}
               </div>
             )}
           </div>
        </div>
      );
    }

    const visiblePosts = scrubTimestamp !== null
      ? posts.filter(p => p.timestamp <= scrubTimestamp)
      : posts;

    return (
      <div className="space-y-8">
        <div
          style={{
            opacity: isScrubbing ? 0.35 : 1,
            filter: isScrubbing ? 'blur(1.5px)' : 'none',
            transition: 'opacity 0.2s ease, filter 0.2s ease',
            pointerEvents: isScrubbing ? 'none' : 'auto',
          }}
        >
          <AnimatePresence mode="popLayout">
            {visiblePosts.map((post) => (
              <PostCard key={post.id} post={post} onVisitUser={onVisitUser} />
            ))}
          </AnimatePresence>

          {visiblePosts.length === 0 && (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <MessageSquare size={24} className="text-white/20" />
              </div>
              <p className="text-white/20 font-black uppercase tracking-widest text-xs">
                {isScrubbing ? 'No posts at this time' : 'No signals detected in this sector'}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const addGif = (url: string) => {
    setSelectedMedia([...selectedMedia, { type: 'GIF', url }]);
    setShowMediaPicker(null);
  };

  const addSticker = (url: string) => {
    setSelectedMedia([...selectedMedia, { type: 'STICKER', url }]);
    setShowMediaPicker(null);
  };

  const addEmoji = (emoji: string) => {
    setPostText(prev => prev + emoji);
    setShowMediaPicker(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-12">
      {/* Feed Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 p-1 bg-black/40 rounded-2xl border border-white/5">
          <button
            onClick={() => setFeedType('PERSONAL')}
            className={`px-6 py-3 rounded-xl flex items-center gap-2 transition-all ${feedType === 'PERSONAL' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
          >
            <Users size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              {isOwnProfile ? 'My Feed' : (profileName ? `${profileName.split(' ')[0]}'s Posts` : 'Their Posts')}
            </span>
          </button>
          <button 
            onClick={() => setFeedType('GLOBAL')}
            className={`px-6 py-3 rounded-xl flex items-center gap-2 transition-all ${feedType === 'GLOBAL' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
          >
            <Globe size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Global</span>
          </button>
          <button 
            onClick={() => setFeedType('X_FEED')}
            className={`px-6 py-3 rounded-xl flex items-center gap-2 transition-all ${feedType === 'X_FEED' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
          >
            <X size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">X</span>
          </button>
          <button 
            onClick={() => setFeedType('MASTODON')}
            className={`px-6 py-3 rounded-xl flex items-center gap-2 transition-all ${feedType === 'MASTODON' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
          >
            <AtSign size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Mastodon</span>
          </button>
          <button 
            onClick={() => setFeedType('BLUESKY')}
            className={`px-6 py-3 rounded-xl flex items-center gap-2 transition-all ${feedType === 'BLUESKY' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
          >
            <Cloud size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Bluesky</span>
          </button>
          <button 
            onClick={() => setFeedType('THREADS')}
            className={`px-6 py-3 rounded-xl flex items-center gap-2 transition-all ${feedType === 'THREADS' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
          >
            <MessageSquare size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Threads</span>
          </button>
        </div>
      </div>

      {/* Post Creator */}
      {auth.currentUser && !hideBroadcaster && !['X_FEED', 'MASTODON', 'BLUESKY', 'THREADS'].includes(feedType) && (
        <div className="mb-8">
          <UniversalPostComposer
            currentUser={auth.currentUser}
            placeholder={isOwnProfile ? "What's on your mind? Share music, videos, or just vibes..." : `Post something to ${profileName || 'this profile'}...`}
            avatarUrl={auth.currentUser.photoURL || undefined}
            userAlbums={userAlbums}
            onPost={async (data) => {
              const resolvedMedia = (await Promise.all(
                data.attachments.map(async (att) => {
                  if (att.file && att.url.startsWith('blob:')) {
                    try {
                      const { uploadFile } = await import('../services/backendService');
                      const url = await uploadFile(`posts/${auth.currentUser!.uid}/${Date.now()}_${att.file.name}`, att.file);
                      return { type: att.type, url, title: att.title };
                    } catch { return null; }
                  }
                  return { type: att.type, url: att.url, title: att.title };
                })
              )).filter(Boolean) as { type: 'PHOTO' | 'VIDEO' | 'AUDIO'; url: string; title?: string }[];
              const embedFields = await postFieldsForAssetEmbed(data.assetEmbed);
              await createPost({
                text: data.text,
                isPublic: true,
                ...(data.theme !== 'STANDARD' ? { theme: data.theme } : {}),
                ...(resolvedMedia.length > 0 ? { media: resolvedMedia } : {}),
                ...embedFields,
                targetUserId: isOwnProfile ? undefined : uid,
                targetUserName: isOwnProfile ? undefined : profileName
              });
            }}
          />
        </div>
      )}

      {/* 48-Hour Timeline — only shown for PERSONAL/GLOBAL feed */}
      {!['X_FEED', 'MASTODON', 'BLUESKY', 'THREADS'].includes(feedType) && posts.length > 0 && (
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl px-6 py-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/20">Timeline · Last 48h</span>
            {isScrubbing && (
              <span className="ml-auto text-[8px] font-black uppercase tracking-widest text-white/40 animate-pulse">
                Scrubbing
              </span>
            )}
          </div>
          <FeedTimeline
            posts={posts}
            onScrub={handleScrub}
            onScrubbing={handleScrubbing}
          />
        </div>
      )}

      {/* Render Feed Content */}
      {renderFeedContent()}

      {/* X Link Modal */}
      <AnimatePresence>
        {showXLinkModal && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-md w-full bg-[#0a0a0a] border border-white/10 p-10 rounded-[2.5rem] shadow-3xl text-center"
            >
              <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-8">
                <X size={40} className="text-white" />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tightest mb-4">Link X Account</h2>
              <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-10 leading-loose">Enter your X (Twitter) handle without the '@' symbol to sync your timeline.</p>
              
              <div className="relative mb-10 text-left">
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/20 mb-3 ml-2">X Handle</label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 font-bold text-sm">@</span>
                  <input 
                    type="text" 
                    value={tempXHandle}
                    onChange={(e) => setTempXHandle(e.target.value.replace('@', ''))}
                    placeholder="username"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 pl-10 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all text-white"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {auth.currentUser && (
                  <button
                    onClick={async () => {
                      setIsLinkingX(true);
                      const screenName = await linkXAccount();
                      setIsLinkingX(false);
                      if (screenName) {
                        if (onUpdateXHandle) onUpdateXHandle(screenName);
                        setShowXLinkModal(false);
                      }
                    }}
                    disabled={isLinkingX}
                    className="w-full py-5 bg-black border border-white/20 text-white font-black uppercase tracking-widest text-xs rounded-full hover:bg-white/10 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isLinkingX ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                    {isLinkingX ? 'Connecting...' : 'Auto-Link via X OAuth'}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (onUpdateXHandle) onUpdateXHandle(tempXHandle);
                    setShowXLinkModal(false);
                  }}
                  className="w-full py-5 bg-white text-black font-black uppercase tracking-widest text-xs rounded-full hover:bg-small-orange hover:text-white transition-all"
                >
                  Confirm Signal Link
                </button>
                <button
                  onClick={() => setShowXLinkModal(false)}
                  className="w-full py-5 bg-white/5 text-white/40 font-black uppercase tracking-widest text-[10px] rounded-full hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProfileFeed;
