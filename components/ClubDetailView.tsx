import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Users, MessageSquare, Image, Newspaper, Settings,
  Plus, Send, Heart, Pin, Trash2, Shield, Crown, Pen, Lock, Globe,
  X, Check, Calendar, Play, Music, BookOpen, Link2, Upload, Zap,
  UserPlus, UserMinus, Ban
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { Club, ClubPost, ClubMembership, ClubGalleryItem, ClubChatMessage, ClubRole } from '../types';
import {
  fetchClubMembers, getUserClubMembership, joinClub, leaveClub,
  listenToClubPosts, createClubPost, deleteClubPost, toggleClubPostLike,
  pinClubPost, fetchClubGallery, addClubGalleryItem, deleteClubGalleryItem,
  listenToClubChat, sendClubChatMessage, deleteClubChatMessage,
  stickyClubChatMessage, updateClub, updateMemberRole, banMember,
  uploadClubImage
} from '../services/backendService';

interface ClubDetailViewProps {
  club: Club;
  currentUser: FirebaseUser | null;
  onBack: () => void;
  onClubUpdated: (club: Club) => void;
}

type TabId = 'TIMELINE' | 'BULLETIN' | 'GALLERY' | 'MEMBERS' | 'CHAT' | 'EVENTS' | 'SETTINGS';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'TIMELINE', label: 'Timeline', icon: <Zap size={14} /> },
  { id: 'BULLETIN', label: 'Bulletin', icon: <Newspaper size={14} /> },
  { id: 'GALLERY', label: 'Gallery', icon: <Image size={14} /> },
  { id: 'MEMBERS', label: 'Members', icon: <Users size={14} /> },
  { id: 'CHAT', label: 'Live Chat', icon: <MessageSquare size={14} /> },
  { id: 'EVENTS', label: 'Events', icon: <Calendar size={14} /> },
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

const ClubDetailView: React.FC<ClubDetailViewProps> = ({ club: initialClub, currentUser, onBack, onClubUpdated }) => {
  const [club, setClub] = useState<Club>(initialClub);
  const [activeTab, setActiveTab] = useState<TabId>('TIMELINE');
  const [membership, setMembership] = useState<ClubMembership | null>(null);
  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [members, setMembers] = useState<ClubMembership[]>([]);
  const [gallery, setGallery] = useState<ClubGalleryItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ClubChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [postInput, setPostInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedGalleryItem, setSelectedGalleryItem] = useState<ClubGalleryItem | null>(null);
  const [settingsEdit, setSettingsEdit] = useState<Partial<Club>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const galleryUploadRef = useRef<HTMLInputElement>(null);

  const isAdmin = membership?.role === 'OWNER' || membership?.role === 'ADMIN';
  const isMod = isAdmin || membership?.role === 'MODERATOR';
  const isMember = !!membership && membership.status === 'ACTIVE';
  const canPost = isMember;

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

  const handleSendPost = async () => {
    if (!postInput.trim() || !currentUser) return;
    await createClubPost({ clubId: club.id, content: postInput });
    setPostInput('');
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !currentUser) return;
    await sendClubChatMessage(club.id, chatInput);
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
    await updateClub(club.id, settingsEdit);
    const updated = { ...club, ...settingsEdit };
    setClub(updated);
    onClubUpdated(updated);
    setSavingSettings(false);
  };

  const handleRoleChange = async (mem: ClubMembership, newRole: ClubRole) => {
    await updateMemberRole(mem.id, newRole);
    setMembers(ms => ms.map(m => m.id === mem.id ? { ...m, role: newRole } : m));
  };

  const visibleTabs = TABS.filter(t => {
    if (t.id === 'SETTINGS') return isAdmin;
    if (t.id === 'CHAT') return isMember && club.hasLiveChat;
    if (t.id === 'EVENTS') return isMember && club.hasExclusiveEvents;
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
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
                  <textarea value={postInput} onChange={e => setPostInput(e.target.value)}
                    placeholder="Share something with the club..."
                    className="w-full bg-transparent text-sm font-medium resize-none outline-none placeholder:opacity-30 min-h-[80px]"
                    onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSendPost(); }}
                  />
                  <div className="flex justify-end mt-3">
                    <button onClick={handleSendPost} disabled={!postInput.trim()} className="px-6 py-2 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:bg-white/90 transition-all">Post</button>
                  </div>
                </div>
              )}
              {posts.filter(p => !p.isBulletin).map(post => (
                <PostCard key={post.id} post={post} currentUserId={currentUser?.uid} isMod={isMod}
                  onLike={() => toggleClubPostLike(post.id, currentUser!.uid, post.likes.includes(currentUser!.uid))}
                  onDelete={() => deleteClubPost(post.id)}
                  onPin={() => pinClubPost(post.id, !post.isPinned)}
                />
              ))}
              {posts.filter(p => !p.isBulletin).length === 0 && <EmptyState icon={<Zap size={32} />} label="No posts yet - be the first to share!" />}
            </motion.div>
          )}

          {/* BULLETIN */}
          {activeTab === 'BULLETIN' && (
            <motion.div key="bulletin" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col lg:flex-row gap-8">
                <div className="flex-1 space-y-4">
                  <h2 className="text-xs font-black uppercase tracking-widest opacity-60 mb-6">Announcements</h2>
                  {posts.filter(p => p.isBulletin && p.type !== 'ARTICLE_LINK').map(post => (
                    <PostCard key={post.id} post={post} currentUserId={currentUser?.uid} isMod={isMod}
                      onLike={() => toggleClubPostLike(post.id, currentUser!.uid, post.likes.includes(currentUser!.uid))}
                      onDelete={() => deleteClubPost(post.id)}
                      onPin={() => pinClubPost(post.id, !post.isPinned)}
                      bulletinStyle
                    />
                  ))}
                  {posts.filter(p => p.isBulletin && p.type !== 'ARTICLE_LINK').length === 0 && <EmptyState icon={<Newspaper size={32} />} label="No announcements yet" />}
                </div>
                <div className="w-full lg:w-80 shrink-0">
                  <h2 className="text-xs font-black uppercase tracking-widest opacity-60 mb-6">Articles</h2>
                  <div className="space-y-3">
                    {posts.filter(p => p.type === 'ARTICLE_LINK').map(post => (
                      <div key={post.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 cursor-pointer hover:bg-white/8 transition-all">
                        {post.isNewArticle && <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/30 rounded px-2 py-0.5 mb-2 inline-block">New Article</span>}
                        <p className="text-xs font-black uppercase tracking-wide truncate">{post.content}</p>
                        <p className="text-[9px] opacity-30 mt-1">{post.authorName}</p>
                      </div>
                    ))}
                    {posts.filter(p => p.type === 'ARTICLE_LINK').length === 0 && <div className="text-[10px] uppercase tracking-widest opacity-20 font-bold text-center py-8">No articles published</div>}
                  </div>
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

          {/* SETTINGS */}
          {activeTab === 'SETTINGS' && isAdmin && (
            <motion.div key="settings" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8 max-w-2xl">
              <SettingsSection title="Identity">
                <label className="block text-[9px] font-black uppercase tracking-widest opacity-40 mb-2">Club Name</label>
                <input defaultValue={club.name} onChange={e => setSettingsEdit(s => ({ ...s, name: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/20 transition-all mb-4" />
                <label className="block text-[9px] font-black uppercase tracking-widest opacity-40 mb-2">Description</label>
                <textarea defaultValue={club.description} onChange={e => setSettingsEdit(s => ({ ...s, description: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/20 transition-all resize-none h-24" />
              </SettingsSection>
              <SettingsSection title="Rules and Conduct">
                <textarea defaultValue={club.rules} onChange={e => setSettingsEdit(s => ({ ...s, rules: e.target.value }))}
                  placeholder="Define club rules and expected behaviors..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/20 transition-all resize-none h-32" />
              </SettingsSection>
              <SettingsSection title="Access and Features">
                <div className="space-y-3">
                  <Toggle label="Private Club" value={settingsEdit.isPrivate ?? club.isPrivate} onChange={v => setSettingsEdit(s => ({ ...s, isPrivate: v }))} />
                  <Toggle label="Links Allowed" value={settingsEdit.linksAllowed ?? club.linksAllowed} onChange={v => setSettingsEdit(s => ({ ...s, linksAllowed: v }))} />
                  <Toggle label="Live Chat" value={settingsEdit.hasLiveChat ?? club.hasLiveChat} onChange={v => setSettingsEdit(s => ({ ...s, hasLiveChat: v }))} />
                  <Toggle label="Exclusive Events" value={settingsEdit.hasExclusiveEvents ?? club.hasExclusiveEvents} onChange={v => setSettingsEdit(s => ({ ...s, hasExclusiveEvents: v }))} />
                  <Toggle label="Merch Store" value={settingsEdit.hasMerchStore ?? club.hasMerchStore} onChange={v => setSettingsEdit(s => ({ ...s, hasMerchStore: v }))} />
                </div>
              </SettingsSection>
              <SettingsSection title="Club Typography">
                <label className="block text-[9px] font-black uppercase tracking-widest opacity-40 mb-2">Custom Font</label>
                <select defaultValue={club.customFont || ''} onChange={e => setSettingsEdit(s => ({ ...s, customFont: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/20 transition-all">
                  <option value="">Platform Default</option>
                  <option value="'Space Grotesk', sans-serif">Space Grotesk</option>
                  <option value="'Playfair Display', serif">Playfair Display</option>
                  <option value="'Bebas Neue', cursive">Bebas Neue</option>
                  <option value="'DM Mono', monospace">DM Mono</option>
                  <option value="'Cormorant Garamond', serif">Cormorant Garamond</option>
                </select>
              </SettingsSection>
              <button onClick={handleSaveSettings} disabled={savingSettings} className="px-8 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-50 hover:bg-white/90 transition-all flex items-center gap-2">
                {savingSettings ? <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : <Check size={12} />}
                Save Settings
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
