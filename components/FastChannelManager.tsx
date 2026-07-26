import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Tv, Plus, Trash2, ArrowLeft, Settings, Radio, Clock, BarChart2, Globe,
  Upload, Play, GripVertical, ChevronDown, ChevronUp, Users, X, Check,
  Zap, Film, Music2, AlertCircle, Eye, Share2, Lock, DollarSign,
  Shuffle, RefreshCw, CalendarClock, StopCircle
} from 'lucide-react';
import { Video, UserProfile, FastChannelSchedule, FastChannelSlot, ChannelBumper, FastChannelAssetGrant, FastChannelLibraryEntry, FastChannel, FastChannelCategory } from '../types';
import {
  fetchFastChannelVideos,
  fetchFastChannelSchedule,
  saveFastChannelSchedule,
  fetchFastChannelMeta,
  saveFastChannelMeta,
  autoGenerateFastChannelSchedule,
  fetchChannelBumpers,
  saveChannelBumper,
  deleteChannelBumper,
  fetchMyFastChannelGrants,
  grantFastChannelAccess,
  revokeGrantedFastChannelAccess,
  fetchFastChannelLibrary,
  addToFastChannelLibrary,
  removeFromFastChannelLibrary,
  scheduleLiveInterrupt,
  clearLiveInterrupt,
  fetchUserProfile,
  searchUsers,
  fetchAllVideos,
  updateVideoSettings,
  uploadFile as uploadFileService,
  auth,
} from '../services/backendService';
import { useUpload } from '../contexts/UploadContext';

interface FastChannelManagerProps {
  user: UserProfile;
  onBack: () => void;
}

type Tab = 'CHANNEL' | 'SCHEDULE' | 'BUMPERS' | 'ADS' | 'ASSETS' | 'LIBRARY';

const FAST_CATEGORIES: FastChannelCategory[] = ['Film', 'TV', 'Music', 'News', 'Sports', 'Kids', 'Comedy', 'Documentary', 'Faith', 'Lifestyle', 'Gaming', 'Variety', 'Education'];

const SLOT_TYPE_COLORS: Record<string, string> = {
  VIDEO: 'bg-blue-500/20 border-blue-500/30 text-blue-300',
  BUMPER: 'bg-violet-500/20 border-violet-500/30 text-violet-300',
  AD_BREAK: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-300',
  LIVE_INTERRUPT: 'bg-red-500/20 border-red-500/30 text-red-300',
  PUBLIC_DOMAIN: 'bg-green-500/20 border-green-500/30 text-green-300',
};

const SLOT_TYPE_LABELS: Record<string, string> = {
  VIDEO: 'Video',
  BUMPER: 'Bumper',
  AD_BREAK: 'Ad Break',
  LIVE_INTERRUPT: 'Live Interrupt',
  PUBLIC_DOMAIN: 'Public Domain',
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SlotRow: React.FC<{
  slot: FastChannelSlot;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  isFirst: boolean;
  isLast: boolean;
}> = ({ slot, onRemove, onMoveUp, onMoveDown, onEdit, isFirst, isLast }) => (
  <div className={`flex items-center gap-3 p-3 rounded-xl border ${SLOT_TYPE_COLORS[slot.type]} group`}>
    <div className="flex flex-col gap-0.5 shrink-0">
      <button onClick={onMoveUp} disabled={isFirst} className="p-0.5 hover:text-white disabled:opacity-20 transition-colors"><ChevronUp size={12} /></button>
      <button onClick={onMoveDown} disabled={isLast} className="p-0.5 hover:text-white disabled:opacity-20 transition-colors"><ChevronDown size={12} /></button>
    </div>
    {slot.videoThumbnail || slot.bumperUrl ? (
      <div className="w-14 h-8 rounded-lg overflow-hidden shrink-0 bg-white/5">
        <img src={slot.videoThumbnail || ''} className="w-full h-full object-cover" alt="" />
      </div>
    ) : (
      <div className="w-14 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
        {slot.type === 'AD_BREAK' ? <DollarSign size={12} /> : slot.type === 'LIVE_INTERRUPT' ? <Radio size={12} /> : <Film size={12} />}
      </div>
    )}
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wider truncate">
        {slot.videoTitle || slot.bumperTitle || SLOT_TYPE_LABELS[slot.type]}
        {slot.type === 'AD_BREAK' && slot.adDurationSeconds && ` · ${slot.adDurationSeconds}s`}
        {slot.type === 'LIVE_INTERRUPT' && slot.liveInterruptAt && ` · ${new Date(slot.liveInterruptAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
      </p>
      <p className="text-[8px] opacity-50 uppercase tracking-widest font-bold">{SLOT_TYPE_LABELS[slot.type]}</p>
    </div>
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
      <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><Settings size={12} /></button>
      <button onClick={onRemove} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"><Trash2 size={12} /></button>
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────

const FastChannelManager: React.FC<FastChannelManagerProps> = ({ user, onBack }) => {
  const [activeTab, setActiveTab] = useState<Tab>('CHANNEL');
  const [schedule, setSchedule] = useState<FastChannelSchedule | null>(null);
  const [meta, setMeta] = useState<Partial<FastChannel>>({ ownerId: user.uid, name: `${user.displayName || 'My'} Channel`, category: 'Variety', isPublished: true });
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);
  const [myVideos, setMyVideos] = useState<Video[]>([]);
  const [bumpers, setBumpers] = useState<ChannelBumper[]>([]);
  const [grants, setGrants] = useState<FastChannelAssetGrant[]>([]);
  const [library, setLibrary] = useState<FastChannelLibraryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Bumper creation
  const [newBumperTitle, setNewBumperTitle] = useState('');
  const [newBumperType, setNewBumperType] = useState<ChannelBumper['type']>('INTRO');
  const [bumperFile, setBumperFile] = useState<File | null>(null);
  const [isBumperUploading, setIsBumperUploading] = useState(false);
  const bumperInputRef = useRef<HTMLInputElement>(null);

  // Asset grant
  const [grantSearchTerm, setGrantSearchTerm] = useState('');
  const [grantSearchResults, setGrantSearchResults] = useState<UserProfile[]>([]);
  const [selectedGrantUser, setSelectedGrantUser] = useState<UserProfile | null>(null);
  const [grantAssetIds, setGrantAssetIds] = useState<string[]>([]);
  const [grantEntireLibrary, setGrantEntireLibrary] = useState(true);
  const [grantIsPaid, setGrantIsPaid] = useState(false);
  const [grantPrice, setGrantPrice] = useState('');
  const [isGrantToGlobal, setIsGrantToGlobal] = useState(false);

  // Live interrupt scheduling
  const [interruptTime, setInterruptTime] = useState('');
  const [interruptMaxDuration, setInterruptMaxDuration] = useState('300');
  const [interruptMembersOnly, setInterruptMembersOnly] = useState(false);

  // Ad settings editing
  const [editAdFreq, setEditAdFreq] = useState(20);
  const [commercialFree, setCommercialFree] = useState(false);
  const [editAdDur, setEditAdDur] = useState(60);

  const { uploadFile } = useUpload();

  useEffect(() => { loadAll(); }, [user.uid]);

  const loadAll = async () => {
    setIsLoading(true);
    const [sched, vids, bumpList, grantList, lib, channelMeta] = await Promise.all([
      fetchFastChannelSchedule(user.uid),
      fetchFastChannelVideos(user.uid),
      fetchChannelBumpers(user.uid),
      fetchMyFastChannelGrants(user.uid),
      fetchFastChannelLibrary(),
      fetchFastChannelMeta(user.uid),
    ]);
    if (channelMeta) setMeta(channelMeta);
    setSchedule(sched);
    setMyVideos(vids);
    setBumpers(bumpList);
    setGrants(grantList);
    setLibrary(lib);
    if (sched) {
      setEditAdFreq(sched.adFrequencyMinutes);
      setEditAdDur(sched.adDurationSeconds);
      setCommercialFree(!!sched.commercialFree);
    }
    setIsLoading(false);
  };

  const handleAutoGenerate = async () => {
    setIsGenerating(true);
    const generated = await autoGenerateFastChannelSchedule(user.uid);
    setSchedule(generated);
    setIsGenerating(false);
  };

  const handleSaveSchedule = async () => {
    if (!schedule) return;
    setIsSaving(true);
    await saveFastChannelSchedule({ ...schedule, adFrequencyMinutes: editAdFreq, adDurationSeconds: editAdDur, commercialFree, autoGenerated: false });
    setIsSaving(false);
  };

  const moveSlot = (index: number, direction: -1 | 1) => {
    if (!schedule) return;
    const slots = [...schedule.slots];
    const target = index + direction;
    if (target < 0 || target >= slots.length) return;
    [slots[index], slots[target]] = [slots[target], slots[index]];
    slots.forEach((s, i) => { s.order = i; });
    setSchedule({ ...schedule, slots });
  };

  const removeSlot = (index: number) => {
    if (!schedule) return;
    const slots = schedule.slots.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i }));
    setSchedule({ ...schedule, slots });
  };

  const addVideoSlot = (video: Video) => {
    if (!schedule) return;
    const slot: FastChannelSlot = {
      id: `slot_video_${video.id}_${Date.now()}`,
      type: 'VIDEO',
      order: schedule.slots.length,
      videoId: video.id,
      videoUrl: video.url,
      videoTitle: video.title,
      videoThumbnail: video.thumbnailUrl || video.coverImageUrl,
      sourceUserId: user.uid,
    };
    setSchedule({ ...schedule, slots: [...schedule.slots, slot] });
  };

  const addAdBreak = () => {
    if (!schedule) return;
    const slot: FastChannelSlot = {
      id: `slot_ad_${Date.now()}`,
      type: 'AD_BREAK',
      order: schedule.slots.length,
      adDurationSeconds: editAdDur,
    };
    setSchedule({ ...schedule, slots: [...schedule.slots, slot] });
  };

  const handleScheduleLiveInterrupt = async () => {
    if (!interruptTime) return;
    const scheduledAt = new Date(interruptTime).getTime();
    const maxSecs = parseInt(interruptMaxDuration) || 300;
    await scheduleLiveInterrupt(user.uid, scheduledAt, maxSecs, interruptMembersOnly);
    setSchedule(prev => prev ? { ...prev, pendingLiveInterrupt: { scheduledAt, maxDurationSeconds: maxSecs, membersOnly: interruptMembersOnly } } : prev);
    setInterruptTime('');
  };

  const handleClearInterrupt = async () => {
    await clearLiveInterrupt(user.uid);
    setSchedule(prev => prev ? { ...prev, pendingLiveInterrupt: undefined } : prev);
  };

  const handleUploadBumper = async () => {
    if (!bumperFile || !newBumperTitle.trim()) return;
    setIsBumperUploading(true);
    try {
      const path = `bumpers/${user.uid}/${Date.now()}_${bumperFile.name}`;
      const url = await uploadFileService(path, bumperFile);
      if (url) {
        const bumper = await saveChannelBumper({
          userId: user.uid,
          title: newBumperTitle.trim(),
          url,
          type: newBumperType,
          durationSeconds: 15,
          timestamp: Date.now(),
        });
        setBumpers(prev => [...prev, bumper]);
        setNewBumperTitle('');
        setBumperFile(null);
      }
    } finally {
      setIsBumperUploading(false);
    }
  };

  const handleDeleteBumper = async (bumperId: string) => {
    await deleteChannelBumper(bumperId);
    setBumpers(prev => prev.filter(b => b.id !== bumperId));
  };

  const handleGrantAccess = async () => {
    if (!selectedGrantUser && !isGrantToGlobal) return;
    const toUserId = isGrantToGlobal ? '*' : selectedGrantUser!.uid;
    const toUserName = isGrantToGlobal ? 'Platform Library' : selectedGrantUser!.displayName;
    const grant = await grantFastChannelAccess({
      fromUserId: user.uid,
      fromUserName: user.displayName,
      fromUserPhoto: user.photoURL,
      toUserId,
      assetIds: grantEntireLibrary ? [] : grantAssetIds,
      entireLibrary: grantEntireLibrary,
      isPaid: grantIsPaid,
      pricePerMonth: grantIsPaid ? parseFloat(grantPrice) : undefined,
      isActive: true,
    });
    setGrants(prev => [...prev, grant]);
    setSelectedGrantUser(null);
    setGrantSearchTerm('');
    setIsGrantToGlobal(false);
  };

  const handleRevokeGrant = async (grantId: string) => {
    await revokeGrantedFastChannelAccess(grantId);
    setGrants(prev => prev.filter(g => g.id !== grantId));
  };

  const handleAddToLibrary = async (video: Video) => {
    await addToFastChannelLibrary(video, false);
    const entry = library.find(e => e.videoId === video.id);
    if (!entry) {
      setLibrary(prev => [...prev, {
        id: `lib_${video.id}`,
        videoId: video.id,
        videoTitle: video.title,
        videoUrl: video.url || '',
        thumbnailUrl: video.thumbnailUrl || video.coverImageUrl || '',
        ownerUserId: user.uid,
        ownerName: user.displayName,
        isPublicDomain: false,
        isPaid: false,
        timestamp: Date.now(),
      }]);
    }
  };

  const handleRemoveFromLibrary = async (videoId: string) => {
    await removeFromFastChannelLibrary(videoId);
    setLibrary(prev => prev.filter(e => e.videoId !== videoId));
  };

  useEffect(() => {
    if (!grantSearchTerm.trim()) { setGrantSearchResults([]); return; }
    const t = setTimeout(async () => {
      const results = await searchUsers(grantSearchTerm);
      setGrantSearchResults(results.filter(u => u.uid !== user.uid).slice(0, 8));
    }, 300);
    return () => clearTimeout(t);
  }, [grantSearchTerm]);

  const initSchedule = () => {
    const empty: FastChannelSchedule = {
      userId: user.uid, slots: [], adFrequencyMinutes: 20, adDurationSeconds: 60,
      loopSchedule: true, autoGenerated: false, includePublicDomain: false, lastUpdated: Date.now(),
    };
    setSchedule(empty);
  };

  const handleSaveMeta = async () => {
    setSavingMeta(true);
    setMetaSaved(false);
    try {
      await saveFastChannelMeta({ ...meta, ownerId: user.uid } as any);
      setMetaSaved(true);
      setTimeout(() => setMetaSaved(false), 2500);
    } catch (e: any) {
      alert('Could not save channel: ' + (e?.message || e));
    } finally {
      setSavingMeta(false);
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'CHANNEL', label: 'Channel', icon: Tv },
    { id: 'SCHEDULE', label: 'Schedule', icon: CalendarClock },
    { id: 'BUMPERS', label: 'Bumpers', icon: Film },
    { id: 'ADS', label: 'Ads & Breaks', icon: DollarSign },
    { id: 'ASSETS', label: 'Asset Sharing', icon: Share2 },
    { id: 'LIBRARY', label: 'Platform Library', icon: Globe },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020202] flex items-center justify-center gap-6 flex-col">
        <div className="w-12 h-12 border-2 border-white/10 border-t-white rounded-full animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/30">Loading Channel Manager...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020202] text-white pb-32">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#020202]/95 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-full animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40">FAST Channel Manager</span>
            </div>
            <h1 className="text-lg font-black uppercase tracking-tight">{user.displayName}'s Channel</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAutoGenerate}
            disabled={isGenerating || myVideos.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            {isGenerating ? <RefreshCw size={13} className="animate-spin" /> : <Shuffle size={13} />}
            Auto-Generate
          </button>
          <button
            onClick={handleSaveSchedule}
            disabled={isSaving || !schedule}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-xl text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40 shadow-lg"
          >
            {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
            Save Channel
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-white/5 overflow-x-auto no-scrollbar">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
              activeTab === id ? 'bg-white text-black' : 'text-white/40 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      <div className="max-w-6xl mx-auto px-6 pt-8">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>

            {/* ── CHANNEL TAB (identity / branding) ────────────────────────── */}
            {activeTab === 'CHANNEL' && (
              <div className="max-w-3xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight">Channel Identity</h2>
                    <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold mt-1">Name, number, category & logo — how your channel appears in guides and the Live sections</p>
                  </div>
                  <button onClick={handleSaveMeta} disabled={savingMeta}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-xl text-[9px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-40 shadow-lg">
                    {savingMeta ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}{metaSaved ? 'Saved' : 'Save Channel'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-6">
                  {/* Logo */}
                  <div>
                    <div className="aspect-square rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden grid place-items-center relative">
                      {meta.logoUrl ? <img src={meta.logoUrl} alt="" className="w-full h-full object-cover" /> : <Tv size={40} className="text-white/20" />}
                    </div>
                    <label className="mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-white/10 cursor-pointer transition-colors">
                      <Upload size={13} /> Logo
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const f = e.target.files?.[0]; if (!f) return;
                        try { const url = await uploadFileService(`fast_channels/${user.uid}/logo_${Date.now()}_${f.name}`, f); setMeta(m => ({ ...m, logoUrl: url })); }
                        catch (err: any) { alert('Logo upload failed: ' + (err?.message || err)); }
                      }} />
                    </label>
                  </div>

                  {/* Fields */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Channel name</label>
                      <input value={meta.name || ''} onChange={e => setMeta(m => ({ ...m, name: e.target.value }))} placeholder="e.g. Midnight Movies"
                        className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-white/30" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Channel number</label>
                        <input type="number" value={meta.number ?? ''} onChange={e => setMeta(m => ({ ...m, number: e.target.value === '' ? undefined : Number(e.target.value) }))} placeholder="e.g. 501"
                          className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-white/30" />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Category</label>
                        <select value={meta.category || 'Variety'} onChange={e => setMeta(m => ({ ...m, category: e.target.value as FastChannelCategory }))}
                          className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-white/30 [&>option]:bg-[#111]">
                          {FAST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Tagline</label>
                      <input value={meta.tagline || ''} onChange={e => setMeta(m => ({ ...m, tagline: e.target.value }))} placeholder="A short one-liner"
                        className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-white/30" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Description</label>
                      <textarea value={meta.description || ''} onChange={e => setMeta(m => ({ ...m, description: e.target.value }))} rows={3} placeholder="What this channel is about"
                        className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/30 resize-none" />
                    </div>
                    <button onClick={() => setMeta(m => ({ ...m, isPublished: !(m.isPublished ?? true) }))}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors w-full ${meta.isPublished ?? true ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-white/50'}`}>
                      {meta.isPublished ?? true ? <Eye size={15} /> : <Lock size={15} />}
                      <span className="text-[10px] font-black uppercase tracking-widest">{meta.isPublished ?? true ? 'Published — visible in Live sections & guides' : 'Unpublished — hidden'}</span>
                    </button>

                    {/* Sanctuary-gated special programming. */}
                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10">
                      <Lock size={14} className="text-white/40 mt-0.5 shrink-0" />
                      <p className="text-[10px] text-white/45 leading-relaxed">
                        <span className="font-black uppercase tracking-widest text-white/60">Members-only programming.</span> Any video you mark <span className="text-white/70 font-bold">"Members only"</span> becomes special programming for your Sanctuary members — they see it in the loop, everyone else keeps getting your regular schedule. Gated by the viewer's Sanctuary membership to your channel.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── SCHEDULE TAB ─────────────────────────────────────────────── */}
            {activeTab === 'SCHEDULE' && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
                {/* Schedule editor */}
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tight">24/7 Schedule</h2>
                      <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold mt-1">
                        {schedule ? `${schedule.slots.length} slots · ${schedule.autoGenerated ? 'Auto-generated' : 'Manual'}` : 'No schedule yet'}
                      </p>
                    </div>
                    {schedule && (
                      <div className="flex items-center gap-2">
                        <button onClick={addAdBreak} className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-yellow-500/20 transition-colors">
                          <DollarSign size={11} /> Add Ad Break
                        </button>
                      </div>
                    )}
                  </div>

                  {!schedule ? (
                    <div className="py-24 flex flex-col items-center gap-6 border-2 border-dashed border-white/5 rounded-3xl">
                      <Tv size={48} className="text-white/10" />
                      <div className="text-center">
                        <p className="text-white/40 font-black uppercase tracking-widest text-sm">No schedule configured</p>
                        <p className="text-white/20 text-[10px] uppercase tracking-widest mt-2">Auto-generate from your library or start manually</p>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={handleAutoGenerate} disabled={isGenerating || myVideos.length === 0} className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-40">
                          {isGenerating ? <RefreshCw size={13} className="animate-spin" /> : <Shuffle size={13} />} Auto-Generate
                        </button>
                        <button onClick={initSchedule} className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-white/10">
                          <Plus size={13} /> Start Manually
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {schedule.slots.length === 0 && (
                        <div className="py-12 text-center border-dashed border border-white/10 rounded-2xl">
                          <p className="text-white/20 text-[10px] font-black uppercase tracking-widest">Drop videos here or add from your library →</p>
                        </div>
                      )}
                      {schedule.slots.map((slot, i) => (
                        <SlotRow
                          key={slot.id}
                          slot={slot}
                          onRemove={() => removeSlot(i)}
                          onMoveUp={() => moveSlot(i, -1)}
                          onMoveDown={() => moveSlot(i, 1)}
                          onEdit={() => {}}
                          isFirst={i === 0}
                          isLast={i === schedule.slots.length - 1}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Right panel: library + live interrupt */}
                <div className="space-y-6">
                  {/* Live Interrupt Scheduler */}
                  <div className="p-5 bg-red-500/5 border border-red-500/20 rounded-2xl">
                    <div className="flex items-center gap-2 mb-4">
                      <Radio size={14} className="text-red-400" />
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-red-300">Schedule Live Interrupt</h3>
                    </div>
                    {schedule?.pendingLiveInterrupt ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-red-300">
                          <AlertCircle size={12} />
                          Interrupt at {new Date(schedule.pendingLiveInterrupt.scheduledAt).toLocaleString()}
                        </div>
                        <p className="text-[8px] text-white/30 uppercase tracking-widest">Max {schedule.pendingLiveInterrupt.maxDurationSeconds}s before returning to FAST</p>
                        <button onClick={handleClearInterrupt} className="w-full flex items-center justify-center gap-2 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500/20 transition-colors">
                          <StopCircle size={12} /> Cancel Interrupt
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1 block">Date & Time</label>
                          <input type="datetime-local" value={interruptTime} onChange={e => setInterruptTime(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white outline-none focus:border-red-500/50" />
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1 block">Max Duration (seconds)</label>
                          <input type="number" min="60" max="7200" value={interruptMaxDuration} onChange={e => setInterruptMaxDuration(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white outline-none focus:border-red-500/50" />
                        </div>
                        <button onClick={() => setInterruptMembersOnly(v => !v)}
                          className={`w-full flex items-center gap-2 py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors border ${interruptMembersOnly ? 'bg-violet-500/15 border-violet-400/30 text-violet-200' : 'bg-white/5 border-white/10 text-white/50'}`}>
                          <Lock size={12} /> {interruptMembersOnly ? 'Members-only live event' : 'Open to everyone'}
                        </button>
                        <button onClick={handleScheduleLiveInterrupt} disabled={!interruptTime}
                          className="w-full flex items-center justify-center gap-2 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors disabled:opacity-40">
                          <CalendarClock size={12} /> Schedule Interrupt
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Add from library */}
                  {schedule && (
                    <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-3">Add from Your Library</h3>
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {myVideos.length === 0 && (
                          <p className="text-[9px] text-white/20 uppercase tracking-widest text-center py-4">No FAST channel videos yet. Enable videos in Video Manager.</p>
                        )}
                        {myVideos.map(v => (
                          <button key={v.id} onClick={() => addVideoSlot(v)}
                            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all text-left group">
                            <div className="w-12 h-8 rounded-lg overflow-hidden shrink-0 bg-white/5">
                              {(v.thumbnailUrl || v.coverImageUrl) && <img src={v.thumbnailUrl || v.coverImageUrl} className="w-full h-full object-cover" alt="" />}
                            </div>
                            <p className="flex-1 text-[9px] font-black uppercase tracking-tight truncate text-white/60 group-hover:text-white transition-colors">{v.title}</p>
                            <Plus size={12} className="text-white/20 group-hover:text-white shrink-0 transition-colors" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── BUMPERS TAB ───────────────────────────────────────────────── */}
            {activeTab === 'BUMPERS' && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight mb-1">Channel Bumpers</h2>
                  <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Intros, outros, station IDs & transitions inserted automatically into your schedule</p>
                </div>

                {/* Create bumper */}
                <div className="p-6 bg-white/[0.02] border border-white/10 rounded-2xl space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60">Upload New Bumper</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Title</label>
                      <input value={newBumperTitle} onChange={e => setNewBumperTitle(e.target.value)}
                        placeholder="e.g. Channel Intro" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/20 outline-none focus:border-white/30" />
                    </div>
                    <div>
                      <label className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Type</label>
                      <select value={newBumperType} onChange={e => setNewBumperType(e.target.value as ChannelBumper['type'])}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-white/30">
                        {(['INTRO', 'OUTRO', 'STATION_ID', 'TRANSITION'] as const).map(t => (
                          <option key={t} value={t}>{t.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Video File</label>
                    <input ref={bumperInputRef} type="file" accept="video/*" className="hidden" onChange={e => setBumperFile(e.target.files?.[0] || null)} />
                    <button onClick={() => bumperInputRef.current?.click()}
                      className="w-full py-4 border-2 border-dashed border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/30 hover:border-white/20 hover:text-white/50 transition-all flex items-center justify-center gap-2">
                      <Upload size={14} /> {bumperFile ? bumperFile.name : 'Choose Video File'}
                    </button>
                  </div>
                  <button onClick={handleUploadBumper} disabled={!newBumperTitle.trim() || !bumperFile || isBumperUploading}
                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-40 hover:opacity-90 transition-opacity">
                    {isBumperUploading ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />} Upload Bumper
                  </button>
                </div>

                {/* Bumper list */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bumpers.length === 0 && (
                    <div className="col-span-full py-16 text-center border-dashed border border-white/5 rounded-2xl">
                      <Film size={32} className="text-white/10 mx-auto mb-3" />
                      <p className="text-white/20 text-[10px] font-black uppercase tracking-widest">No bumpers yet</p>
                    </div>
                  )}
                  {bumpers.map(b => (
                    <div key={b.id} className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl group relative">
                      <div className="aspect-video rounded-xl overflow-hidden bg-white/5 mb-3 relative">
                        <video src={b.url} className="w-full h-full object-cover opacity-70" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play size={20} className="text-white/60" />
                        </div>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-tight text-white truncate">{b.title}</p>
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mt-0.5">{b.type.replace('_', ' ')}</p>
                      <button onClick={() => handleDeleteBumper(b.id)}
                        className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ADS TAB ───────────────────────────────────────────────────── */}
            {activeTab === 'ADS' && (
              <div className="space-y-8 max-w-2xl">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight mb-1">Ad & Break Settings</h2>
                  <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Control how and when commercial breaks appear in your FAST channel</p>
                </div>

                {/* Monetization mode — commercial-free vs the Plajah ad platform. */}
                <div className="p-6 bg-white/[0.02] border border-white/10 rounded-2xl">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-3 block">Monetization</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setCommercialFree(true)}
                      className={`p-4 rounded-xl border text-left transition-colors ${commercialFree ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                      <p className="text-[11px] font-black uppercase tracking-widest">Commercial-free</p>
                      <p className="text-[8px] text-white/40 uppercase tracking-widest mt-1">No ad breaks — pure content</p>
                    </button>
                    <button onClick={() => setCommercialFree(false)}
                      className={`p-4 rounded-xl border text-left transition-colors ${!commercialFree ? 'bg-violet-500/10 border-violet-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                      <p className="text-[11px] font-black uppercase tracking-widest">Plajah ad platform</p>
                      <p className="text-[8px] text-white/40 uppercase tracking-widest mt-1">Insert ad breaks & earn</p>
                    </button>
                  </div>
                  <p className="text-[8px] text-white/30 uppercase tracking-widest mt-3">Applied on Auto-Generate and Save. Commercial-free skips all ad breaks.</p>
                </div>

                <div className={`p-6 bg-white/[0.02] border border-white/10 rounded-2xl space-y-6 transition-opacity ${commercialFree ? 'opacity-40 pointer-events-none' : ''}`}>
                  {/* Ad frequency */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-3 block">Ad Break Frequency</label>
                    <p className="text-[8px] text-white/30 uppercase tracking-widest mb-4">Insert a commercial break every N minutes automatically. Videos with manual ad markers will use those instead.</p>
                    <div className="flex items-center gap-4">
                      <input type="range" min="5" max="60" step="5" value={editAdFreq} onChange={e => setEditAdFreq(Number(e.target.value))}
                        className="flex-1 accent-violet-500" />
                      <div className="w-20 text-center py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-black text-white">
                        {editAdFreq} min
                      </div>
                    </div>
                  </div>

                  {/* Ad break duration */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-3 block">Ad Break Duration</label>
                    <p className="text-[8px] text-white/30 uppercase tracking-widest mb-4">How long each commercial break lasts (30 seconds to 3 minutes).</p>
                    <div className="flex items-center gap-4">
                      <input type="range" min="30" max="180" step="15" value={editAdDur} onChange={e => setEditAdDur(Number(e.target.value))}
                        className="flex-1 accent-yellow-500" />
                      <div className="w-20 text-center py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-black text-white">
                        {editAdDur}s
                      </div>
                    </div>
                    <div className="flex justify-between text-[7px] font-black uppercase tracking-widest text-white/20 mt-1 px-0.5">
                      <span>30s</span><span>1 min</span><span>2 min</span><span>3 min</span>
                    </div>
                  </div>

                  {/* Per-video marker instructions */}
                  <div className="p-4 bg-yellow-500/5 border border-yellow-500/10 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={13} className="text-yellow-400" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-yellow-300">Per-Video Ad Markers</p>
                    </div>
                    <p className="text-[8px] text-white/40 leading-relaxed">
                      To set exact mid-roll ad positions within individual videos, go to <strong className="text-white/60">Video Manager → select a video → Ad Settings</strong> and add time markers. The FAST channel scheduler will honor these over the global frequency setting.
                    </p>
                  </div>

                  <button onClick={handleSaveSchedule} disabled={isSaving || !schedule}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-40 hover:opacity-90 transition-opacity">
                    {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />} Save Ad Settings
                  </button>
                </div>

                {/* Auto vs manual info card */}
                <div className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Auto-Configuration</p>
                  <p className="text-[8px] text-white/30 leading-relaxed">
                    If no manual schedule is saved, the platform automatically places ad breaks at the frequency set above, wraps content blocks with bumpers, and loops your entire library 24/7. Any content added to your FAST channel library is picked up at the next schedule cycle.
                  </p>
                </div>
              </div>
            )}

            {/* ── ASSETS TAB ───────────────────────────────────────────────── */}
            {activeTab === 'ASSETS' && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight mb-1">Asset Sharing</h2>
                  <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Grant other creators access to your FAST channel assets — free or paid</p>
                </div>

                {/* Grant access */}
                <div className="p-6 bg-white/[0.02] border border-white/10 rounded-2xl space-y-5">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white/60">Grant Access</h3>

                  {/* Toggle: specific user or global library */}
                  <div className="flex items-center gap-3">
                    <button onClick={() => setIsGrantToGlobal(false)}
                      className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${!isGrantToGlobal ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
                      <Users size={12} className="inline mr-1.5" /> Specific User
                    </button>
                    <button onClick={() => setIsGrantToGlobal(true)}
                      className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${isGrantToGlobal ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
                      <Globe size={12} className="inline mr-1.5" /> Platform Library
                    </button>
                  </div>

                  {!isGrantToGlobal && (
                    <div className="relative">
                      <label className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Search User</label>
                      <input value={grantSearchTerm} onChange={e => setGrantSearchTerm(e.target.value)}
                        placeholder="Search by name..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/20 outline-none focus:border-white/30" />
                      {grantSearchResults.length > 0 && (
                        <div className="absolute top-full mt-1 left-0 right-0 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden z-10">
                          {grantSearchResults.map(u => (
                            <button key={u.uid} onClick={() => { setSelectedGrantUser(u); setGrantSearchTerm(u.displayName); setGrantSearchResults([]); }}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left transition-colors">
                              {u.photoURL && <img src={u.photoURL} className="w-7 h-7 rounded-full object-cover" alt="" />}
                              <p className="text-xs font-black uppercase tracking-tight text-white">{u.displayName}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Entire library or specific assets */}
                  <div className="flex items-center gap-3">
                    <button onClick={() => setGrantEntireLibrary(true)}
                      className={`flex-1 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${grantEntireLibrary ? 'bg-violet-500/20 border-violet-500/30 text-violet-300' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'}`}>
                      Entire Library
                    </button>
                    <button onClick={() => setGrantEntireLibrary(false)}
                      className={`flex-1 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${!grantEntireLibrary ? 'bg-violet-500/20 border-violet-500/30 text-violet-300' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'}`}>
                      Select Assets
                    </button>
                  </div>

                  {!grantEntireLibrary && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {myVideos.map(v => (
                        <button key={v.id} onClick={() => setGrantAssetIds(prev => prev.includes(v.id) ? prev.filter(id => id !== v.id) : [...prev, v.id])}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left ${grantAssetIds.includes(v.id) ? 'bg-violet-500/10 border-violet-500/20' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}>
                          {grantAssetIds.includes(v.id) && <Check size={12} className="text-violet-400 shrink-0" />}
                          <p className="text-[9px] font-black uppercase tracking-tight text-white truncate">{v.title}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Paid toggle */}
                  <div className="flex items-center justify-between py-3 border-t border-white/5">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Paid Access</p>
                      <p className="text-[8px] text-white/20 uppercase tracking-widest">Charge a monthly fee for this content</p>
                    </div>
                    <button onClick={() => setGrantIsPaid(v => !v)}
                      className={`relative w-12 h-6 rounded-full transition-all ${grantIsPaid ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055]' : 'bg-white/10'}`}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${grantIsPaid ? 'left-[26px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {grantIsPaid && (
                    <div>
                      <label className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1.5 block">Monthly Price ($)</label>
                      <input type="number" min="0.99" step="0.01" value={grantPrice} onChange={e => setGrantPrice(e.target.value)}
                        placeholder="4.99" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-white/20 outline-none focus:border-white/30" />
                    </div>
                  )}

                  <button onClick={handleGrantAccess} disabled={!isGrantToGlobal && !selectedGrantUser}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-40 hover:opacity-90 transition-opacity">
                    <Share2 size={13} /> {isGrantToGlobal ? 'Add to Platform Library' : 'Grant Access'}
                  </button>
                </div>

                {/* Active grants */}
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4">Active Grants ({grants.length})</h3>
                  {grants.length === 0 && (
                    <p className="text-[9px] text-white/20 uppercase tracking-widest">No active grants yet</p>
                  )}
                  <div className="space-y-3">
                    {grants.map(g => (
                      <div key={g.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-tight text-white">
                            {g.toUserId === '*' ? '🌐 Platform Library' : g.toUserId}
                          </p>
                          <p className="text-[8px] text-white/30 uppercase tracking-widest mt-0.5">
                            {g.entireLibrary ? 'Entire Library' : `${g.assetIds.length} assets`} · {g.isPaid ? `$${g.pricePerMonth}/mo` : 'Free'}
                          </p>
                        </div>
                        <button onClick={() => handleRevokeGrant(g.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── LIBRARY TAB ───────────────────────────────────────────────── */}
            {activeTab === 'LIBRARY' && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight mb-1">Platform Library</h2>
                  <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Add your content to the global FAST channel library — other creators can include it in their channels</p>
                </div>

                {/* My videos not yet in library */}
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4">Your Videos</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myVideos.map(v => {
                      const inLibrary = library.some(e => e.videoId === v.id);
                      return (
                        <div key={v.id} className={`p-4 rounded-2xl border transition-all ${inLibrary ? 'bg-violet-500/5 border-violet-500/20' : 'bg-white/[0.02] border-white/5'}`}>
                          <div className="aspect-video rounded-xl overflow-hidden bg-white/5 mb-3">
                            {(v.thumbnailUrl || v.coverImageUrl) && <img src={v.thumbnailUrl || v.coverImageUrl} className="w-full h-full object-cover opacity-80" alt="" />}
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-tight text-white truncate mb-2">{v.title}</p>
                          {inLibrary ? (
                            <button onClick={() => handleRemoveFromLibrary(v.id)}
                              className="w-full flex items-center justify-center gap-2 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-colors">
                              <X size={11} /> Remove from Library
                            </button>
                          ) : (
                            <button onClick={() => handleAddToLibrary(v)}
                              className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 border border-white/10 text-white/60 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-white transition-colors">
                              <Plus size={11} /> Add to Library
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {myVideos.length === 0 && (
                      <div className="col-span-full py-16 text-center">
                        <p className="text-white/20 text-[10px] font-black uppercase tracking-widest">No FAST channel videos. Enable them in Video Manager first.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Platform library entries from others */}
                {library.filter(e => e.ownerUserId !== user.uid).length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4">Available from Other Creators</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {library.filter(e => e.ownerUserId !== user.uid).map(entry => (
                        <div key={entry.id} className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                          <div className="aspect-video rounded-xl overflow-hidden bg-white/5 mb-3">
                            {entry.thumbnailUrl && <img src={entry.thumbnailUrl} className="w-full h-full object-cover opacity-80" alt="" />}
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-tight text-white truncate">{entry.videoTitle}</p>
                          <p className="text-[8px] text-white/30 uppercase tracking-widest mt-0.5">{entry.ownerName} · {entry.isPaid ? `$${entry.pricePerMonth}/mo` : 'Free'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default FastChannelManager;
