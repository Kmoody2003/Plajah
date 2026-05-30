import React, { useState, useEffect, useRef } from 'react';
import { checkPostRateLimit, recordPost, detectSpam } from '../src/lib/spamCheck';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Users, MessageSquare, Image, Newspaper, Settings,
  Plus, Send, Heart, Pin, Trash2, Shield, Crown, Pen, Lock, Globe,
  X, Check, Calendar, Play, Music, BookOpen, Link2, Upload, Zap,
  UserPlus, UserMinus, Ban, Sparkles, Radio, Eye
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Club, ClubPost, ClubMembership, ClubGalleryItem, ClubChatMessage, ClubRole, UserProfile } from '../types';
import {
  fetchClubMembers, getUserClubMembership, joinClub, leaveClub,
  listenToClubPosts, createClubPost, deleteClubPost, toggleClubPostLike,
  pinClubPost, fetchClubGallery, addClubGalleryItem, deleteClubGalleryItem,
  listenToClubChat, sendClubChatMessage, deleteClubChatMessage,
  stickyClubChatMessage, updateClub, updateMemberRole, banMember,
  uploadClubImage, claimClubAsFounder, db, createArticle
} from '../services/backendService';
import { LiveStreamModal } from './LiveStreamModal';
import LiveStreamViewer from './LiveStreamViewer';
import UniversalPostComposer from './UniversalPostComposer';
import DualPanelTimeline from './DualPanelTimeline';
import ArticleEditor from './ArticleEditor';

interface ClubDetailViewProps {
  club: Club;
  currentUser: FirebaseUser | null;
  onBack: () => void;
  onClubUpdated: (club: Club) => void;
  initialTab?: TabId;
}

type TabId = 'TIMELINE' | 'BULLETIN' | 'GALLERY' | 'MEMBERS' | 'CHAT' | 'EVENTS' | 'LIVE' | 'SETTINGS';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'TIMELINE', label: 'Timeline', icon: <Zap size={14} /> },
  { id: 'BULLETIN', label: 'Bulletin', icon: <Newspaper size={14} /> },
  { id: 'GALLERY', label: 'Gallery', icon: <Image size={14} /> },
  { id: 'MEMBERS', label: 'Members', icon: <Users size={14} /> },
  { id: 'CHAT', label: 'Live Chat', icon: <MessageSquare size={14} /> },
  { id: 'EVENTS', label: 'Events', icon: <Calendar size={14} /> },
  { id: 'LIVE', label: 'Live', icon: <Radio size={14} /> },
  { id: 'SETTINGS', label: 'Settings', icon: <Settings size={14} /> },
];

const ROLE_LABELS: Record<ClubRole, string> = {
  OWNER: 'Owner', ADMIN: 'Admin', MODERATOR: 'Mod', WRITER: 'Writer', MEMBER: 'Member'
};
const ROLE_COLORS: Record<ClubRole, string> = {
  OWNER: 'text-amber-400', ADMIN: 'text-violet-400', MODERATOR: 'text-blue-400',
  WRITER: 'text-green-400', MEMBER: 'text-white/40'
};
const ROLE_ICONS: Record<ClubRole, React.ReactNode> = {
  OWNER: <Crown size={10} />, ADMIN: <Shield size={10} />, MODERATOR: <Shield size={10} />,
  WRITER: <Pen size={10} />, MEMBER: <Users size={10} />
};

const ClubDetailView: React.FC<ClubDetailViewProps> = ({ club: initialClub, currentUser, onBack, onClubUpdated, initialTab }) => {
  const [club, setClub] = useState<Club>(initialClub);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab || 'TIMELINE');
  const [membership, setMembership] = useState<ClubMembership | null>(null);
  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [members, setMembers] = useState<ClubMembership[]>([]);
  const [gallery, setGallery] = useState<ClubGalleryItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ClubChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [timelineMode, setTimelineMode] = useState<'SINGLE' | 'DUAL'>('SINGLE');
  const [syncScroll, setSyncScroll] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedGalleryItem, setSelectedGalleryItem] = useState<ClubGalleryItem | null>(null);
  const [settingsEdit, setSettingsEdit] = useState<Partial<Club>>({
    name: initialClub.name,
    description: initialClub.description,
    rules: initialClub.rules,
    customFont: initialClub.customFont,
    isPrivate: initialClub.isPrivate,
    joinProcess: initialClub.joinProcess,
    linksAllowed: initialClub.linksAllowed,
    hasLiveChat: initialClub.hasLiveChat,
    hasExclusiveEvents: initialClub.hasExclusiveEvents,
    hasMerchStore: initialClub.hasMerchStore,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettings, setSavedSettings] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const galleryUploadRef = useRef<HTMLInputElement>(null);
  const coverUploadRef = useRef<HTMLInputElement>(null);
  const iconUploadRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [livePrivate, setLivePrivate] = useState(false);
  const [viewingStreamId, setViewingStreamId] = useState<string | null>(null);
  const [viewingStreamTitle, setViewingStreamTitle] = useState('');
  const [viewingStreamOwner, setViewingStreamOwner] = useState('');
  const [clubStreams, setClubStreams] = useState<{ id: string; title: string; ownerName: string; ownerPhoto: string; viewerCount: number; isPrivate?: boolean }[]>([]);

  const isAdmin = membership?.role === 'OWNER' || membership?.role === 'ADMIN';
  const isMod = isAdmin || membership?.role === 'MODERATOR';
  const isMember = !!membership && membership.status === 'ACTIVE';
  const canPost = isMember;
  const canAuthor = isMod || membership?.role === 'WRITER';

  // ── Bulletin / Article authoring ─────────────────────────────────────────
  const [bulletinMode, setBulletinMode] = useState<'NONE' | 'BULLETIN' | 'ARTICLE'>('NONE');
  const [bulletinInput, setBulletinInput] = useState('');
  const [bulletinPostType, setBulletinPostType] = useState<'POST' | 'ANNOUNCEMENT'>('ANNOUNCEMENT');
  const [bulletinPosting, setBulletinPosting] = useState(false);

  const editorUserProfile: UserProfile | null = currentUser ? {
    uid: currentUser.uid,
    displayName: currentUser.displayName || 'Member',
    photoURL: currentUser.photoURL || '',
    email: currentUser.email || '',
    followerCount: 0,
    followingCount: 0,
    storageLimit: 0,
    storageUsage: { total: 0, audio: 0, video: 0, photos: 0 },
  } as UserProfile : null;

  const handlePostBulletin = async () => {
    if (!bulletinInput.trim() || !currentUser || bulletinPosting) return;
    setBulletinPosting(true);
    try {
      await createClubPost({
        clubId: club.id,
        content: bulletinInput.trim(),
        type: bulletinPostType,
        isBulletin: true,
      });
      setBulletinInput('');
      setBulletinMode('NONE');
    } finally {
      setBulletinPosting(false);
    }
  };

  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    getUserClubMembership(club.id, currentUser.uid).then(mem => { setMembership(mem); setLoading(false); });
  }, [club.id, currentUser]);

  useEffect(() => { const unsub = listenToClubPosts(club.id, setPosts); return unsub; }, [club.id]);

  useEffect(() => {
    if (activeTab === 'MEMBERS') fetchClubMembers(club.id).then(setMembers);
    if (activeTab === 'GALLERY') fetchClubGallery(club.id).then(setGallery);
  }, [activeTab, club.id]);

  useEffect(() => {
    if (activeTab !== 'CHAT') return;
    const unsub = listenToClubChat(club.id, setChatMessages);
    return unsub;
  }, [activeTab, club.id]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  useEffect(() => {
    if (activeTab !== 'LIVE') return;
    const q = query(collection(db, 'live_streams'), where('clubId', '==', club.id), where('isLive', '==', true));
    const unsub = onSnapshot(q, snap => {
      setClubStreams(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, title: data.title || 'Live Stream', ownerName: data.ownerName || '', ownerPhoto: data.ownerPhoto || '', viewerCount: data.viewerCount || 0, isPrivate: data.isPrivate };
      }));
    });
    return unsub;
  }, [activeTab, club.id]);

  const handleJoin = async () => {
    if (!currentUser) return;
    setJoining(true);
    const mem = await joinClub(club.id);
    if (mem) { setMembership(mem); setClub(c => ({ ...c, memberCount: c.memberCount + (mem.status === 'ACTIVE' ? 1 : 0) })); }
    setJoining(false);
    setShowJoinModal(false);
  };

  const handleLeave = async () => {
    if (!currentUser || !membership) return;
    await leaveClub(club.id);
    setMembership(null);
    setClub(c => ({ ...c, memberCount: Math.max(0, c.memberCount - 1) }));
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !currentUser) return;
    const rateCheck = checkPostRateLimit('plajah_last_club_chat');
    if (!rateCheck.allowed) { alert(`Wait ${rateCheck.waitSecs}s`); return; }
    const spamReason = detectSpam(chatInput);
    if (spamReason) { alert(spamReason); return; }
    await sendClubChatMessage(club.id, chatInput);
    recordPost('plajah_last_club_chat');
    setChatInput('');
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    const url = await uploadClubImage(file, club.id, 'cover');
    if (!url) return;
    const type = file.type.startsWith('video/') ? 'VIDEO' : 'PHOTO';
    await addClubGalleryItem({ clubId: club.id, type, url, thumbnailUrl: type === 'PHOTO' ? url : undefined, title: file.name });
    const updated = await fetchClubGallery(club.id);
    setGallery(updated);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await updateClub(club.id, settingsEdit);
      const updated = { ...club, ...settingsEdit };
      setClub(updated);
      onClubUpdated(updated);
      setSavedSettings(true);
      setTimeout(() => setSavedSettings(false), 2500);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    const url = await uploadClubImage(file, club.id, 'cover');
    if (url) setSettingsEdit(s => ({ ...s, coverImage: url }));
    setUploadingCover(false);
    e.target.value = '';
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    const url = await uploadClubImage(file, club.id, 'icon');
    if (url) setSettingsEdit(s => ({ ...s, iconImage: url }));
    setUploadingIcon(false);
    e.target.value = '';
  };

  const handleClaim = async () => {
    if (!currentUser || claiming) return;
    setClaiming(true);
    const ok = await claimClubAsFounder(club.id);
    if (ok) {
      const updated = { ...club, creatorId: currentUser.uid, admins: [currentUser.uid], isDemo: false, memberCount: club.memberCount + 1 };
      setClub(updated);
      onClubUpdated(updated);
      setMembership({ id: '', clubId: club.id, userId: currentUser.uid, role: 'OWNER', status: 'ACTIVE', displayName: currentUser.displayName || '', photoUrl: currentUser.photoURL || '', joinedAt: Date.now() });
    }
    setClaiming(false);
  };

  const handleRoleChange = async (mem: ClubMembership, newRole: ClubRole) => {
    await updateMemberRole(mem.id, newRole);
    setMembers(ms => ms.map(m => m.id === mem.id ? { ...m, role: newRole } : m));
  };

  const visibleTabs = TABS.filter(t => {
    if (t.id === 'SETTINGS') return isAdmin;
    if (t.id === 'CHAT') return isMember && club.hasLiveChat;
    if (t.id === 'EVENTS') return isMember && club.hasExclusiveEvents;
    if (t.id === 'LIVE') return !club.isPrivate || isMember;
    return true;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>
  );

  return (
    <div className="min-h-screen bg-transparent text-white">
      {/* Hero */}
      <div className="relative h-64 md:h-80 overflow-hidden">
        {club.coverImage
          ? <img src={club.coverImage} alt="" className="w-full h-full object-cover opacity-60" />
          : <div className="w-full h-full bg-gradient-to-br from-violet-900/60 to-indigo-900/60" />
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <button onClick={onBack} className="absolute top-6 left-6 p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-full hover:bg-black/60 transition-all">
          <ArrowLeft size={18} />
        </button>
        <div className="absolute bottom-6 left-6 right-6 flex items-end gap-4">
          {club.iconImage
            ? <img src={club.iconImage} className="w-16 h-16 rounded-2xl border-2 border-white/20 object-cover shrink-0" alt="" />
            : <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0"><Users size={24} className="opacity-40" /></div>
          }
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[8px] font-black uppercase tracking-widest opacity-40 border border-white/20 rounded px-2 py-0.5">{club.category}</span>
              {club.isPrivate
                ? <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest opacity-40"><Lock size={8} /> Private</span>
                : <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest opacity-40"><Globe size={8} /> Public</span>
              }
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight truncate">{club.name}</h1>
            <p className="text-xs font-bold opacity-40 uppercase tracking-widest mt-1"><Users size={10} className="inline mr-1" />{club.memberCount.toLocaleString()} Members</p>
          </div>
          <div className="shrink-0">
            {currentUser && (isMember ? (
              <button onClick={handleLeave} className="px-5 py-2.5 bg-white/10 border border-white/20 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 hover:border-red-500/40 transition-all flex items-center gap-2">
                <UserMinus size={12} /> Leave
              </button>
            ) : membership?.status === 'PENDING' ? (
              <span className="px-5 py-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-full text-[10px] font-black uppercase tracking-widest">Pending</span>
            ) : (
              <button onClick={() => setShowJoinModal(true)} disabled={joining} className="px-6 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/90 transition-all flex items-center gap-2">
                <UserPlus size={12} /> Join Club
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Claim-as-Founder banner — only shown for unclaimed demo clubs */}
      {club.isDemo && !club.creatorId && (
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-900/40 via-orange-900/40 to-amber-900/40 border-b border-amber-500/20">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.08),transparent_70%)]" />
          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Crown size={18} className="text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-amber-400">Unclaimed Community</p>
                <p className="text-sm font-light text-white/70 mt-0.5">Be the first to claim <span className="text-white font-bold">{club.name}</span> as its Founder — you'll get full admin control.</p>
              </div>
            </div>
            {currentUser ? (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-full text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 shrink-0 disabled:opacity-50"
              >
                <Sparkles size={12} />
                {claiming ? 'Claiming…' : 'Claim as Founder'}
              </button>
            ) : (
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 shrink-0">Sign in to claim</p>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <div className="flex overflow-x-auto no-scrollbar px-6">
          {visibleTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-4 text-[10px] font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-all ${activeTab === tab.id ? 'border-white text-white' : 'border-transparent text-white/30 hover:text-white/60'}`}
            >{tab.icon}{tab.label}</button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8" style={club.customFont ? { fontFamily: club.customFont } : {}}>
        <AnimatePresence mode="wait">
          {/* TIMELINE */}
          {activeTab === 'TIMELINE' && (
            <motion.div key="timeline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {canPost && (
                <UniversalPostComposer
                  currentUser={currentUser}
                  placeholder="Share something with the club..."
                  avatarUrl={currentUser?.photoURL || undefined}
                  onPost={async (data) => {
                    if (!data.text.trim() && data.attachments.length === 0 && !data.assetEmbed) return;
                    const rateCheck = checkPostRateLimit('plajah_last_club_post');
                    if (!rateCheck.allowed) { alert(`Please wait ${rateCheck.waitSecs}s before posting again.`); return; }
                    const spamReason = detectSpam(data.text);
                    if (spamReason) { alert(spamReason); return; }
                    await createClubPost({
                      clubId: club.id,
                      content: data.text,
                      attachments: [
                        ...data.attachments.map(a => ({ type: a.type, url: a.url, title: a.title })),
                        ...(data.assetEmbed ? [{ type: data.assetEmbed.type, url: data.assetEmbed.imageUrl || '', title: data.assetEmbed.title, assetId: data.assetEmbed.id }] : []),
                      ],
                    });
                    recordPost('plajah_last_club_post');
                  }}
                  onMakeStory={(_url, _type) => { /* story creator integration placeholder */ }}
                  onSendToRello={(_url, _title) => { /* rello integration placeholder */ }}
                  onMakeShort={(_url, _title) => { /* shorts integration placeholder */ }}
                />
              )}

              {/* View mode toggle */}
              <div className="flex items-center gap-2 justify-end">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/30">View</span>
                {(['SINGLE', 'DUAL'] as const).map(m => (
                  <button key={m} onClick={() => setTimelineMode(m)}
                    className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${timelineMode === m ? 'bg-white text-black' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}>
                    {m}
                  </button>
                ))}
                {timelineMode === 'DUAL' && (
                  <button onClick={() => setSyncScroll(s => !s)}
                    className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${syncScroll ? 'bg-small-orange text-black' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}>
                    {syncScroll ? 'Sync' : 'Async'}
                  </button>
                )}
              </div>

              {/* SINGLE mode: render directly for reliability */}
              {timelineMode === 'SINGLE' && (
                <>
                  {posts.filter(p => !p.isBulletin).length === 0
                    ? <EmptyState icon={<Zap size={32} />} label="No posts yet — be the first to share!" />
                    : posts.filter(p => !p.isBulletin).map(post => (
                        <PostCard key={post.id} post={post} currentUserId={currentUser?.uid} isMod={isMod}
                          onLike={() => currentUser && toggleClubPostLike(post.id, currentUser.uid, post.likes.includes(currentUser.uid))}
                          onDelete={() => deleteClubPost(post.id)}
                          onPin={() => pinClubPost(post.id, !post.isPinned)}
                        />
                      ))
                  }
                </>
              )}

              {/* DUAL mode: split panel via DualPanelTimeline */}
              {timelineMode === 'DUAL' && (
                <DualPanelTimeline
                  mode="DUAL"
                  syncScroll={syncScroll}
                  posts={posts.filter(p => !p.isBulletin)}
                  renderPost={(post) => (
                    <PostCard key={post.id} post={post} currentUserId={currentUser?.uid} isMod={isMod}
                      onLike={() => currentUser && toggleClubPostLike(post.id, currentUser.uid, post.likes.includes(currentUser.uid))}
                      onDelete={() => deleteClubPost(post.id)}
                      onPin={() => pinClubPost(post.id, !post.isPinned)}
                    />
                  )}
                  emptyState={<EmptyState icon={<Zap size={32} />} label="No posts yet — be the first to share!" />}
                />
              )}
            </motion.div>
          )}

          {/* BULLETIN */}
          {activeTab === 'BULLETIN' && (
            <motion.div key="bulletin" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">

              {/* ── Author toolbar ── */}
              {canAuthor && bulletinMode === 'NONE' && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setBulletinMode('BULLETIN')}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
                  >
                    <Newspaper size={12} /> New Bulletin
                  </button>
                  <button
                    onClick={() => setBulletinMode('ARTICLE')}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'rgba(255,140,0,0.12)', color: '#ff8c00', border: '1px solid rgba(255,140,0,0.25)' }}
                  >
                    <Pen size={12} /> Write Article
                  </button>
                </div>
              )}

              {/* ── Inline bulletin composer ── */}
              <AnimatePresence>
                {bulletinMode === 'BULLETIN' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-amber-500/[0.07] border border-amber-500/20 rounded-3xl p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-400">New Bulletin</h3>
                        <button onClick={() => { setBulletinMode('NONE'); setBulletinInput(''); }} className="text-white/30 hover:text-white transition-colors">
                          <X size={14} />
                        </button>
                      </div>

                      {/* Type selector */}
                      <div className="flex gap-2">
                        {(['ANNOUNCEMENT', 'POST'] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => setBulletinPostType(t)}
                            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                              bulletinPostType === t
                                ? 'bg-amber-500 text-black'
                                : 'bg-white/5 text-white/40 hover:bg-white/10'
                            }`}
                          >
                            {t === 'ANNOUNCEMENT' ? 'Announcement' : 'General Post'}
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={bulletinInput}
                        onChange={e => setBulletinInput(e.target.value)}
                        placeholder={bulletinPostType === 'ANNOUNCEMENT' ? 'Write an announcement for the club…' : 'Share a bulletin post…'}
                        rows={4}
                        autoFocus
                        className="w-full bg-transparent text-sm font-medium resize-none outline-none placeholder:text-white/20 leading-relaxed"
                      />

                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => { setBulletinMode('NONE'); setBulletinInput(''); }}
                          className="px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handlePostBulletin}
                          disabled={!bulletinInput.trim() || bulletinPosting}
                          className="flex items-center gap-2 px-6 py-2 bg-amber-500 text-black rounded-full text-[9px] font-black uppercase tracking-widest disabled:opacity-30 hover:scale-105 active:scale-95 transition-all"
                        >
                          {bulletinPosting ? '…' : <><Send size={11} /> Publish</>}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Two-column layout ── */}
              <div className="flex flex-col lg:flex-row gap-8">

                {/* Announcements */}
                <div className="flex-1 space-y-4">
                  <h2 className="text-xs font-black uppercase tracking-widest opacity-60">Announcements</h2>
                  {posts.filter(p => p.isBulletin && p.type !== 'ARTICLE_LINK').length === 0
                    ? <EmptyState icon={<Newspaper size={32} />} label="No announcements yet" />
                    : posts.filter(p => p.isBulletin && p.type !== 'ARTICLE_LINK').map(post => (
                        <PostCard key={post.id} post={post} currentUserId={currentUser?.uid} isMod={isMod}
                          onLike={() => currentUser && toggleClubPostLike(post.id, currentUser.uid, post.likes.includes(currentUser.uid))}
                          onDelete={() => deleteClubPost(post.id)}
                          onPin={() => pinClubPost(post.id, !post.isPinned)}
                          bulletinStyle
                        />
                      ))
                  }
                </div>

                {/* Articles sidebar */}
                <div className="w-full lg:w-80 shrink-0 space-y-3">
                  <h2 className="text-xs font-black uppercase tracking-widest opacity-60">Articles</h2>
                  {posts.filter(p => p.type === 'ARTICLE_LINK').length === 0
                    ? <div className="text-[10px] uppercase tracking-widest opacity-20 font-bold text-center py-8">No articles published yet</div>
                    : posts.filter(p => p.type === 'ARTICLE_LINK').map(post => (
                        <div key={post.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 cursor-pointer hover:bg-white/8 transition-all group">
                          {post.isNewArticle && (
                            <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/30 rounded px-2 py-0.5 mb-2 inline-block">
                              New Article
                            </span>
                          )}
                          <p className="text-xs font-black uppercase tracking-wide truncate group-hover:text-small-orange transition-colors">{post.content}</p>
                          <p className="text-[9px] opacity-30 mt-1">{post.authorName} · {new Date(post.timestamp).toLocaleDateString()}</p>
                        </div>
                      ))
                  }
                </div>
              </div>
            </motion.div>
          )}

          {/* GALLERY */}
          {activeTab === 'GALLERY' && (
            <motion.div key="gallery" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xs font-black uppercase tracking-widest opacity-60">Gallery - {gallery.length} items</h2>
                {isMember && (
                  <>
                    <button onClick={() => galleryUploadRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                      <Upload size={12} /> Add to Gallery
                    </button>
                    <input ref={galleryUploadRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleGalleryUpload} />
                  </>
                )}
              </div>
              {gallery.length === 0 ? (
                <EmptyState icon={<Image size={32} />} label="Gallery is empty - push platform assets here" />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {gallery.map(item => (
                    <motion.div key={item.id} whileHover={{ scale: 1.02 }} onClick={() => setSelectedGalleryItem(item)}
                      className="aspect-square relative rounded-2xl overflow-hidden cursor-pointer group bg-white/5 border border-white/5">
                      {(item.type === 'PHOTO' || item.thumbnailUrl) ? (
                        <img src={item.thumbnailUrl || item.url} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                      ) : item.type === 'VIDEO' ? (
                        <video src={item.url} className="w-full h-full object-cover" muted />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/20"><Play size={24} /></div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-all" />
                      <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-all">
                        <p className="text-[9px] font-black uppercase tracking-widest truncate">{item.title}</p>
                        <p className="text-[8px] opacity-40">{item.uploaderName}</p>
                      </div>
                      {(isMod || item.uploaderId === currentUser?.uid) && (
                        <button onClick={e => { e.stopPropagation(); deleteClubGalleryItem(item.id).then(() => setGallery(g => g.filter(x => x.id !== item.id))); }}
                          className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/40">
                          <Trash2 size={10} />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* MEMBERS */}
          {activeTab === 'MEMBERS' && (
            <motion.div key="members" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <h2 className="text-xs font-black uppercase tracking-widest opacity-60 mb-8">{members.length} Members</h2>
              <div className="space-y-2">
                {members.map(mem => (
                  <div key={mem.id} className="flex items-center gap-4 bg-white/5 border border-white/5 rounded-2xl px-5 py-4 hover:bg-white/8 transition-all group">
                    <img src={mem.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${mem.userId}`} className="w-10 h-10 rounded-full border border-white/10" alt="" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black uppercase tracking-wide truncate">{mem.displayName}</p>
                      <div className={`flex items-center gap-1 ${ROLE_COLORS[mem.role]} text-[9px] font-black uppercase tracking-widest`}>
                        {ROLE_ICONS[mem.role]}{ROLE_LABELS[mem.role]}
                      </div>
                    </div>
                    {isAdmin && mem.role !== 'OWNER' && (
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        {(['ADMIN', 'MODERATOR', 'WRITER', 'MEMBER'] as ClubRole[]).map(role => (
                          <button key={role} onClick={() => handleRoleChange(mem, role)}
                            className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border transition-all ${mem.role === role ? 'border-white/30 text-white' : 'border-white/10 text-white/30 hover:border-white/30 hover:text-white'}`}
                          >{ROLE_LABELS[role]}</button>
                        ))}
                        <button onClick={() => banMember(mem.id).then(() => setMembers(ms => ms.filter(m => m.id !== mem.id)))}
                          className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all">
                          <Ban size={8} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {members.length === 0 && <EmptyState icon={<Users size={32} />} label="No members loaded" />}
              </div>
            </motion.div>
          )}

          {/* LIVE CHAT */}
          {activeTab === 'CHAT' && isMember && (
            <motion.div key="chat" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col" style={{ height: 'calc(100vh - 280px)' }}>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {chatMessages.filter(m => m.isSticky).length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-4">
                    <p className="text-[8px] font-black uppercase tracking-widest text-amber-400 mb-2">Pinned Messages</p>
                    {chatMessages.filter(m => m.isSticky).map(msg => (
                      <p key={msg.id} className="text-xs text-amber-200"><span className="font-black">{msg.senderName}: </span>{msg.content}</p>
                    ))}
                  </div>
                )}
                {chatMessages.filter(m => !m.isSticky).map(msg => (
                  <div key={msg.id} className={`flex gap-3 ${msg.senderId === currentUser?.uid ? 'flex-row-reverse' : ''}`}>
                    <img src={msg.senderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderId}`} className="w-7 h-7 rounded-full shrink-0 border border-white/10" alt="" />
                    <div className={`max-w-[70%] flex flex-col ${msg.senderId === currentUser?.uid ? 'items-end' : 'items-start'}`}>
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-30 mb-1">{msg.senderName}</p>
                      <div className={`px-4 py-2.5 rounded-2xl text-xs ${msg.senderId === currentUser?.uid ? 'bg-white text-black' : 'bg-white/10'}`}>{msg.content}</div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-3 mt-4 pt-4 border-t border-white/5">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                  placeholder="Message the club..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 py-3 text-xs outline-none focus:border-white/20 transition-all placeholder:opacity-30"
                />
                <button onClick={handleSendChat} disabled={!chatInput.trim()} className="p-3 bg-white text-black rounded-full disabled:opacity-30 hover:bg-white/90 transition-all">
                  <Send size={14} />
                </button>
              </div>
            </motion.div>
          )}

          {/* EVENTS */}
          {activeTab === 'EVENTS' && (
            <motion.div key="events" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <EmptyState icon={<Calendar size={32} />} label="No exclusive events scheduled yet" />
            </motion.div>
          )}

          {/* LIVE */}
          {activeTab === 'LIVE' && (
            <motion.div key="live" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-black uppercase tracking-widest opacity-60">Live Now</h2>
                  {clubStreams.length > 0 && <p className="text-[9px] text-white/30 mt-1">{clubStreams.length} active stream{clubStreams.length !== 1 ? 's' : ''}</p>}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setLivePrivate(p => !p)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${livePrivate ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-white/10 text-white/40 hover:border-white/20'}`}
                    >
                      {livePrivate ? <Lock size={10} /> : <Globe size={10} />}
                      {livePrivate ? 'Members Only' : 'Public Talk'}
                    </button>
                    <button
                      onClick={() => setShowLiveModal(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                    >
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                      Go Live
                    </button>
                  </div>
                )}
              </div>

              {/* Active Streams */}
              {clubStreams.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-30">
                  <Radio size={40} />
                  <p className="text-xs font-black uppercase tracking-widest">No live streams right now</p>
                  {isAdmin && <p className="text-[10px] font-medium">Hit Go Live to start a stream or talk</p>}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {clubStreams.map(stream => (
                    <motion.div
                      key={stream.id}
                      whileHover={{ scale: 1.01 }}
                      className="relative overflow-hidden bg-gradient-to-br from-red-900/20 via-rose-900/10 to-transparent border border-red-500/20 rounded-3xl p-6 cursor-pointer group"
                      onClick={() => { setViewingStreamId(stream.id); setViewingStreamTitle(stream.title); setViewingStreamOwner(stream.ownerName); }}
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(220,38,38,0.08),transparent_60%)]" />
                      <div className="flex items-start gap-4">
                        <div className="relative shrink-0">
                          <img src={stream.ownerPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${stream.id}`} className="w-12 h-12 rounded-2xl border border-white/10 object-cover" alt="" />
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-black flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[8px] font-black uppercase tracking-widest text-red-400 border border-red-500/30 rounded-full px-2 py-0.5">Live</span>
                            {stream.isPrivate && <span className="text-[8px] font-black uppercase tracking-widest text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5 flex items-center gap-1"><Lock size={7} />Members</span>}
                          </div>
                          <p className="text-sm font-black truncate">{stream.title}</p>
                          <p className="text-[10px] text-white/40 mt-0.5">{stream.ownerName}</p>
                          <div className="flex items-center gap-1 mt-2 text-[9px] text-white/30">
                            <Eye size={10} />{stream.viewerCount} watching
                          </div>
                        </div>
                      </div>
                      <button className="mt-4 w-full py-2.5 bg-red-600/80 hover:bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                        <Play size={12} /> Watch Now
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* SETTINGS */}
          {activeTab === 'SETTINGS' && isAdmin && (
            <motion.div key="settings" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5 max-w-2xl pb-16">

              {/* New-club founder welcome */}
              {club.memberCount <= 1 && membership?.role === 'OWNER' && (
                <div className="relative overflow-hidden bg-gradient-to-r from-violet-900/30 via-indigo-900/30 to-violet-900/30 border border-violet-500/20 rounded-3xl p-6">
                  <Sparkles className="absolute top-4 right-4 text-violet-400/20" size={56} />
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mb-4">
                    <Crown size={18} className="text-amber-400" />
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-tight mb-1">Welcome, Founder.</h3>
                  <p className="text-xs text-white/40 leading-relaxed max-w-xs">Set up your club's identity, pick who can join, and unlock features. Your community starts here.</p>
                </div>
              )}

              {/* Cover + Icon hero */}
              <div className="relative">
                <button
                  onClick={() => coverUploadRef.current?.click()}
                  disabled={uploadingCover}
                  className="relative w-full rounded-3xl overflow-hidden bg-white/5 border border-white/10 hover:border-white/20 group transition-all"
                  style={{ aspectRatio: '21/7' }}
                >
                  {settingsEdit.coverImage || club.coverImage
                    ? <img src={settingsEdit.coverImage || club.coverImage} className="w-full h-full object-cover" alt="" />
                    : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-white/20">
                        <Image size={28} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Upload Cover Art</span>
                        <span className="text-[7px] text-white/10">Recommended 1500 × 500</span>
                      </div>
                    )
                  }
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    {uploadingCover
                      ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <><Upload size={16} className="text-white" /><span className="text-xs font-black uppercase tracking-widest text-white">Change Cover</span></>
                    }
                  </div>
                </button>

                {/* Icon overlapping cover at bottom-left */}
                <div className="absolute -bottom-8 left-6 flex items-end gap-4 z-10">
                  <button
                    onClick={() => iconUploadRef.current?.click()}
                    disabled={uploadingIcon}
                    className="w-20 h-20 rounded-2xl border-4 border-black overflow-hidden bg-white/10 group relative shrink-0 hover:border-white/20 transition-all"
                  >
                    {settingsEdit.iconImage || club.iconImage
                      ? <img src={settingsEdit.iconImage || club.iconImage} className="w-full h-full object-cover" alt="" />
                      : <div className="w-full h-full flex items-center justify-center text-white/20"><Users size={22} /></div>
                    }
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                      {uploadingIcon
                        ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Upload size={12} className="text-white" />
                      }
                    </div>
                  </button>
                </div>
              </div>

              {/* Spacer for icon overlap */}
              <div className="h-10" />

              <input ref={coverUploadRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
              <input ref={iconUploadRef} type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />

              {/* Identity */}
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-3xl p-6 space-y-6">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">Identity</p>
                <div>
                  <label className="text-[8px] font-black uppercase tracking-widest text-white/30 block mb-3">Club Name</label>
                  <input
                    value={settingsEdit.name ?? ''}
                    onChange={e => setSettingsEdit(s => ({ ...s, name: e.target.value }))}
                    placeholder="Your club's name"
                    className="w-full bg-transparent border-b-2 border-white/10 focus:border-white/40 pb-2 text-2xl font-black uppercase tracking-tight outline-none transition-colors placeholder:text-white/15"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-[8px] font-black uppercase tracking-widest text-white/30">Description</label>
                    <span className="text-[8px] text-white/20">{(settingsEdit.description ?? '').length}/500</span>
                  </div>
                  <textarea
                    value={settingsEdit.description ?? ''}
                    onChange={e => setSettingsEdit(s => ({ ...s, description: e.target.value.slice(0, 500) }))}
                    placeholder="Tell people what this club is about..."
                    rows={3}
                    className="w-full bg-transparent border-b border-white/10 focus:border-white/30 pb-2 text-sm text-white/70 font-medium outline-none resize-none transition-colors placeholder:text-white/15 leading-relaxed"
                  />
                </div>
              </div>

              {/* Community Rules */}
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-3xl p-6">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25 mb-6">Community Rules</p>
                <textarea
                  value={settingsEdit.rules ?? ''}
                  onChange={e => setSettingsEdit(s => ({ ...s, rules: e.target.value }))}
                  placeholder="What are the expectations? What's welcome, what isn't? Members will see this when they join."
                  rows={5}
                  className="w-full bg-transparent border-b border-white/10 focus:border-white/30 pb-2 text-sm text-white/70 font-medium outline-none resize-none transition-colors placeholder:text-white/15 leading-relaxed"
                />
              </div>

              {/* Visibility + Access */}
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-3xl p-6">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25 mb-5">Visibility &amp; Access</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {([
                    { key: 'isPrivate', label: 'Private', desc: 'Hidden from discovery', icon: Lock },
                    { key: 'linksAllowed', label: 'Links OK', desc: 'Members can post URLs', icon: Link2 },
                  ] as const).map(({ key, label, desc, icon: Icon }) => {
                    const val = settingsEdit[key] ?? club[key];
                    return (
                      <button key={key} onClick={() => setSettingsEdit(s => ({ ...s, [key]: !val }))}
                        className={`p-4 rounded-2xl border text-left transition-all ${val ? 'border-white/30 bg-white/8' : 'border-white/[0.07] hover:border-white/20'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <Icon size={16} className={val ? 'text-white' : 'text-white/25'} />
                          <div className={`w-8 h-4 rounded-full relative transition-colors ${val ? 'bg-white' : 'bg-white/10'}`}>
                            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-black transition-transform ${val ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </div>
                        </div>
                        <p className={`text-[10px] font-black uppercase tracking-wide ${val ? 'text-white' : 'text-white/35'}`}>{label}</p>
                        <p className="text-[8px] text-white/20 mt-0.5 leading-relaxed">{desc}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25 mb-3 mt-5">Join Process</p>
                <div className="grid grid-cols-2 gap-3">
                  {(['AUTO', 'REVIEW'] as const).map(p => {
                    const active = (settingsEdit.joinProcess ?? club.joinProcess) === p;
                    return (
                      <button key={p} onClick={() => setSettingsEdit(s => ({ ...s, joinProcess: p }))}
                        className={`p-4 rounded-2xl border text-left transition-all ${active ? 'border-white/30 bg-white/8' : 'border-white/[0.07] hover:border-white/20'}`}>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-white/35'}`}>
                          {p === 'AUTO' ? 'Open Join' : 'Admin Review'}
                        </p>
                        <p className="text-[8px] text-white/20 mt-1 leading-relaxed">
                          {p === 'AUTO' ? 'Anyone joins instantly' : 'You approve each request'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Features */}
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-3xl p-6">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25 mb-5">Features</p>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { key: 'hasLiveChat', label: 'Live Chat', desc: 'Real-time messaging room', icon: MessageSquare },
                    { key: 'hasExclusiveEvents', label: 'Events', desc: 'Member-only events', icon: Calendar },
                    { key: 'hasMerchStore', label: 'Merch', desc: 'Sell products to fans', icon: Sparkles },
                  ] as const).map(({ key, label, desc, icon: Icon }) => {
                    const val = settingsEdit[key] ?? club[key];
                    return (
                      <button key={key} onClick={() => setSettingsEdit(s => ({ ...s, [key]: !val }))}
                        className={`p-4 rounded-2xl border text-left transition-all ${val ? 'border-white/30 bg-white/8' : 'border-white/[0.07] hover:border-white/20'}`}>
                        <Icon size={18} className={`mb-3 transition-colors ${val ? 'text-white' : 'text-white/20'}`} />
                        <p className={`text-[9px] font-black uppercase tracking-wide ${val ? 'text-white' : 'text-white/30'}`}>{label}</p>
                        <p className="text-[7px] text-white/20 mt-1 leading-relaxed">{desc}</p>
                        <div className={`mt-3 w-full h-px rounded-full transition-colors ${val ? 'bg-white/40' : 'bg-white/8'}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Typography */}
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-3xl p-6">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25 mb-5">Typography</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { value: '', label: 'Default', sample: 'Aa' },
                    { value: "'Space Grotesk', sans-serif", label: 'Space Grotesk', sample: 'Aa' },
                    { value: "'Playfair Display', serif", label: 'Playfair', sample: 'Aa' },
                    { value: "'Bebas Neue', cursive", label: 'Bebas Neue', sample: 'Aa' },
                    { value: "'DM Mono', monospace", label: 'DM Mono', sample: 'Aa' },
                    { value: "'Cormorant Garamond', serif", label: 'Cormorant', sample: 'Aa' },
                  ].map(opt => {
                    const active = (settingsEdit.customFont ?? '') === opt.value;
                    return (
                      <button key={opt.value} onClick={() => setSettingsEdit(s => ({ ...s, customFont: opt.value }))}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${active ? 'border-white/30 bg-white/8' : 'border-white/[0.07] hover:border-white/20'}`}>
                        <span className="text-xl font-bold text-white/50 leading-none" style={opt.value ? { fontFamily: opt.value } : {}}>{opt.sample}</span>
                        <span className={`text-[8px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-white/30'}`}>{opt.label}</span>
                        {active && <Check size={10} className="ml-auto text-white/60 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Save */}
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 bg-white text-black hover:bg-white/90"
              >
                {savingSettings
                  ? <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  : savedSettings ? <Check size={14} /> : null
                }
                {savingSettings ? 'Saving…' : savedSettings ? 'Saved!' : 'Save Changes'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Join Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 max-w-md w-full">
              <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Join {club.name}</h2>
              {club.description && <p className="text-xs opacity-40 font-bold mb-6 leading-relaxed">{club.description}</p>}
              {club.rules && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6">
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-2">Club Rules</p>
                  <p className="text-xs opacity-60 leading-relaxed whitespace-pre-wrap">{club.rules}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowJoinModal(false)} className="flex-1 py-3 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">Cancel</button>
                <button onClick={handleJoin} disabled={joining} className="flex-1 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-50 hover:bg-white/90 transition-all">
                  {club.joinProcess === 'AUTO' ? 'Join Now' : 'Request to Join'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Stream Modal */}
      {showLiveModal && (
        <div className="fixed inset-0 z-[100]">
          <LiveStreamModal
            onClose={() => setShowLiveModal(false)}
            onStreamActive={(active) => { if (!active) setShowLiveModal(false); }}
            clubId={club.id}
            isPrivate={livePrivate}
          />
        </div>
      )}

      {/* Live Stream Viewer */}
      {viewingStreamId && (
        <div className="fixed inset-0 z-[100]">
          <LiveStreamViewer
            streamId={viewingStreamId}
            title={viewingStreamTitle}
            ownerName={viewingStreamOwner}
            onClose={() => setViewingStreamId(null)}
          />
        </div>
      )}

      {/* Gallery lightbox */}
      <AnimatePresence>
        {selectedGalleryItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center p-6">
            <button onClick={() => setSelectedGalleryItem(null)} className="absolute top-6 right-6 p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all"><X size={18} /></button>
            {selectedGalleryItem.type === 'PHOTO'
              ? <img src={selectedGalleryItem.url} alt={selectedGalleryItem.title} className="max-w-full max-h-[85vh] rounded-2xl object-contain" />
              : selectedGalleryItem.type === 'VIDEO'
              ? <video src={selectedGalleryItem.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-2xl" />
              : null
            }
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center">
              <p className="text-xs font-black uppercase tracking-widest">{selectedGalleryItem.title}</p>
              <p className="text-[9px] opacity-40 mt-1">{selectedGalleryItem.uploaderName}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full-screen Article Editor overlay ── */}
      <AnimatePresence>
        {bulletinMode === 'ARTICLE' && editorUserProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-[#0a0a0a] overflow-y-auto"
          >
            <ArticleEditor
              user={editorUserProfile}
              onCancel={() => setBulletinMode('NONE')}
              onSave={async (articleId, articleTitle) => {
                // Post an article-link reference to the club bulletin board
                await createClubPost({
                  clubId: club.id,
                  content: articleTitle || 'New Article',
                  type: 'ARTICLE_LINK',
                  isBulletin: false,
                  isNewArticle: true,
                  attachments: [{ type: 'LINK', url: `/articles?id=${articleId}`, assetId: articleId, title: articleTitle || 'Article' }],
                });
                setBulletinMode('NONE');
                setActiveTab('BULLETIN');
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Sub-components
interface PostCardProps {
  post: ClubPost; currentUserId?: string; isMod: boolean;
  onLike: () => void; onDelete: () => void; onPin: () => void; bulletinStyle?: boolean;
}

const PostCard: React.FC<PostCardProps> = ({ post, currentUserId, isMod, onLike, onDelete, onPin, bulletinStyle }) => {
  const liked = currentUserId ? post.likes.includes(currentUserId) : false;
  const isOwn = post.authorId === currentUserId;
  return (
    <div className={`bg-white/5 border rounded-3xl p-6 transition-all hover:bg-white/7 ${bulletinStyle ? 'border-amber-500/20 bg-amber-500/5' : 'border-white/5'} ${post.isPinned ? 'ring-1 ring-white/20' : ''}`}>
      {post.isPinned && <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest opacity-30 mb-3"><Pin size={8} /> Pinned</div>}
      {post.type === 'ANNOUNCEMENT' && <div className="text-[8px] font-black uppercase tracking-widest text-amber-400 mb-2">Announcement</div>}
      <div className="flex items-start gap-3">
        <img src={post.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.authorId}`} className="w-9 h-9 rounded-full border border-white/10 shrink-0" alt="" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-black uppercase tracking-wide">{post.authorName}</span>
            <span className="text-[8px] opacity-30">{new Date(post.timestamp).toLocaleDateString()}</span>
          </div>
          <p className="text-sm opacity-80 leading-relaxed whitespace-pre-wrap">{post.content}</p>
          {post.attachments && post.attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {post.attachments.map((att, i) => (
                <div key={i} className="relative rounded-2xl overflow-hidden bg-white/5 border border-white/10">
                  {att.type === 'PHOTO' || att.type === 'VIDEO' ? (
                    att.type === 'VIDEO'
                      ? <video src={att.url} className="w-48 h-32 object-cover rounded-2xl" controls muted playsInline />
                      : <img src={att.url} className="w-48 h-32 object-cover" loading="lazy" alt="" />
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white/60">
                      <span className="w-1 h-4 bg-gradient-to-b from-small-orange to-[#D40055] rounded-full" />
                      {att.title || att.type}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
        <button onClick={onLike} className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-colors ${liked ? 'text-red-400' : 'text-white/30 hover:text-white'}`}>
          <Heart size={11} fill={liked ? 'currentColor' : 'none'} /> {post.likes.length}
        </button>
        {(isMod || isOwn) && (
          <>
            <button onClick={onPin} className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest transition-colors ${post.isPinned ? 'text-amber-400' : 'text-white/20 hover:text-white'}`}><Pin size={10} /></button>
            <button onClick={onDelete} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-red-400 transition-colors ml-auto"><Trash2 size={10} /></button>
          </>
        )}
      </div>
    </div>
  );
};

const EmptyState: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex flex-col items-center justify-center py-24 text-white/20">
    <div className="mb-4 opacity-30">{icon}</div>
    <p className="text-[10px] font-black uppercase tracking-widest text-center max-w-xs">{label}</p>
  </div>
);

const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white/5 border border-white/5 rounded-3xl p-6">
    <h3 className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-5">{title}</h3>
    {children}
  </div>
);

const Toggle: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between">
    <span className="text-xs font-bold opacity-60">{label}</span>
    <button onClick={() => onChange(!value)} className={`w-10 h-5 rounded-full transition-colors relative ${value ? 'bg-white' : 'bg-white/10'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  </div>
);

export default ClubDetailView;
