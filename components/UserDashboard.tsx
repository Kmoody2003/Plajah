import React, { useState, useEffect } from 'react';
import { UserProfile, Album, Video, Photo, Track, MerchItem, IPWorld, ThemeType } from '../types';
import { 
  fetchUserProfile, updateUserProfile, updateLiveStreamConfig,
  fetchUserAlbums, deleteCloudAlbum, fetchUserPhotos, deletePhoto,
  bulkDeletePhotos, addPhotosToAlbum, updateAccountType, fetchArtistMerch,
  fetchUserWorlds, createIPWorld
} from '../services/backendService';
import StoreManager from './StoreManager';
import RevenueDashboard from './RevenueDashboard';
import WorldManagerView from './WorldManagerView';
import { ThemePresetManager } from './ThemePresetManager';
import {
  User, Settings, Database, Video as VideoIcon, Music, Image as ImageIcon, BookOpen,
  CreditCard, Globe, Shield, Bell, LogOut, Save, Plus, Trash2, X,
  ExternalLink, Play, Sparkles, Radio, Tv, Search, Notebook, Mail,
  CheckSquare, Square, Check, FolderPlus, LayoutGrid, Eye, EyeOff, ChevronUp, ChevronDown, Building2, ShoppingBag, Pen, Box, Heart, HeartHandshake, DollarSign, UploadCloud, LayoutTemplate, Share2
} from 'lucide-react';
import FediverseSettings from './FediverseSettings';
import { motion } from 'motion/react';

import AlbumCreator from './AlbumCreator';
import InterestsNotebook from './InterestsNotebook';
import MailingListManager from './MailingListManager';
import FileUploader from './FileUploader';

interface UserDashboardProps {
  user: any;
  onBack: () => void;
  currentTheme?: ThemeType;
  onSetTheme?: (t: ThemeType) => void;
}

const THEME_OPTIONS: { id: ThemeType; label: string; bg: string; text: string }[] = [
  { id: 'DARK',     label: 'Dark',    bg: '#020202',             text: '#ffffff' },
  { id: 'LIGHT',    label: 'Light',   bg: '#f8fafc',             text: '#0f172a' },
  { id: 'PLAJAH',   label: 'Plajah',  bg: 'linear-gradient(135deg,#6B0099,#FF8C00)', text: '#ffffff' },
  { id: 'ETHEREAL', label: 'Ethereal',bg: '#131314',             text: '#e5e2e3' },
  { id: 'NEBULA',   label: 'Nebula',  bg: 'linear-gradient(135deg,#050510,#1a1a3e)', text: '#ffffff' },
  { id: 'CITRUS',   label: 'Citrus',  bg: 'linear-gradient(135deg,#0f0500,#FF3B00)', text: '#ffffff' },
  { id: 'PASTEL',   label: 'Pastel',  bg: '#fdf6e3',             text: '#2aa198' },
];

const UserDashboard: React.FC<UserDashboardProps> = ({ user, onBack, currentTheme, onSetTheme }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'ACCOUNT' | 'ASSETS' | 'PHOTOS' | 'BROADCAST' | 'PAYMENTS' | 'INTERESTS' | 'MAILING_LIST' | 'SIDEBAR' | 'ALIASES' | 'STORE_MANAGEMENT' | 'REVENUE' | 'WORLDS' | 'RADIO_MANAGER' | 'THEMES' | 'NETWORKS'>('ACCOUNT');
  const [isSaving, setIsSaving] = useState(false);
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [userPhotos, setUserPhotos] = useState<Photo[]>([]);
  const [userMerch, setUserMerch] = useState<MerchItem[]>([]);
  const [userWorlds, setUserWorlds] = useState<IPWorld[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [showAlbumSelector, setShowAlbumSelector] = useState(false);
  const [showCreator, setShowCreator] = useState<{ active: boolean; type?: 'MUSIC' | 'VIDEO' | 'BOOK' | 'PHOTO'; album?: Album }>({ active: false });
  const [showWorldCreator, setShowWorldCreator] = useState(false);

  useEffect(() => {
    loadProfile();
    loadUserAlbums();
    loadUserPhotos();
    loadUserMerch();
    loadUserWorlds();
  }, [user.uid]);

  const loadUserWorlds = async () => {
    const worlds = await fetchUserWorlds(user.uid);
    setUserWorlds(worlds);
  };

  const loadProfile = async () => {
    const p = await fetchUserProfile(user.uid);
    setProfile(p);
  };

  const loadUserAlbums = async () => {
    const albums = await fetchUserAlbums(user.uid);
    setUserAlbums(albums);
  };

  const loadUserPhotos = async () => {
    const photos = await fetchUserPhotos(user.uid);
    setUserPhotos(photos);
  };

  const loadUserMerch = async () => {
    const merch = await fetchArtistMerch(user.uid);
    setUserMerch(merch);
  };

  const handleDeleteAlbum = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this asset?')) {
      await deleteCloudAlbum(id);
      loadUserAlbums();
    }
  };

  const handleDeletePhoto = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this photo?')) {
      await deletePhoto(id);
      loadUserPhotos();
      setSelectedPhotoIds(prev => prev.filter(pid => pid !== id));
    }
  };

  const handleSelectAll = () => {
    if (selectedPhotoIds.length === userPhotos.length) {
      setSelectedPhotoIds([]);
    } else {
      setSelectedPhotoIds(userPhotos.map(p => p.id));
    }
  };

  const handleDeleteAll = async () => {
    if (window.confirm('WARNING: This will delete ALL your uploaded photos. This action cannot be undone. Are you sure?')) {
      const allIds = userPhotos.map(p => p.id);
      await bulkDeletePhotos(allIds);
      loadUserPhotos();
      setSelectedPhotoIds([]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPhotoIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedPhotoIds.length} photos?`)) {
      await bulkDeletePhotos(selectedPhotoIds);
      loadUserPhotos();
      setSelectedPhotoIds([]);
    }
  };

  const handleAddToAlbum = async (albumId: string) => {
    if (selectedPhotoIds.length === 0) return;
    try {
      await addPhotosToAlbum(albumId, selectedPhotoIds);
      alert(`Added ${selectedPhotoIds.length} photos to album`);
      setSelectedPhotoIds([]);
      setShowAlbumSelector(false);
    } catch (err) {
      console.error(err);
    }
  };

  const togglePhotoSelection = (id: string) => {
    setSelectedPhotoIds(prev => 
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsSaving(true);
    try {
      await updateUserProfile(user.uid, profile);
      alert('Profile updated successfully');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateLiveStream = async (config: UserProfile['liveStreamConfig']) => {
    if (!profile) return;
    setIsSaving(true);
    try {
      await updateLiveStreamConfig(config);
      setProfile({ ...profile, liveStreamConfig: config });
      alert('Live stream configuration updated');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-screen overflow-hidden bg-[#020202]">
      {/* Sidebar */}
      <aside className="w-full lg:w-80 border-r border-white/5 flex flex-col p-8 bg-black/40 backdrop-blur-3xl">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center shadow-xl">
            <Settings size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-white">Backend</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-small-orange">Asset Manager</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          {[
            { id: 'ACCOUNT', label: 'Account Settings', icon: User },
            { id: 'ALIASES', label: 'Emails & Aliases', icon: Mail },
            { id: 'INTERESTS', label: 'Interest Notebook', icon: Notebook },
            { id: 'WORLDS', label: 'My Worlds', icon: Globe },
            { id: 'ASSETS', label: 'My Assets', icon: Database },
            { id: 'PHOTOS', label: 'Photo Gallery', icon: ImageIcon },
            { id: 'BROADCAST', label: 'Broadcast Studio', icon: Tv },
            { id: 'PAYMENTS', label: 'Payments & Revenue', icon: CreditCard },
            { id: 'MAILING_LIST', label: 'Mailing List', icon: Mail },
            { id: 'RADIO_MANAGER', label: 'Artist Radio Station', icon: Radio },
            { id: 'SIDEBAR', label: 'Sidebar Config', icon: LayoutGrid },
            { id: 'THEMES', label: 'Theme Presets', icon: LayoutTemplate },
            { id: 'NETWORKS', label: 'Social Networks', icon: Share2 },
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
            >
              <item.icon size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
            </button>
          ))}

          {profile?.accountType !== 'FAN' && (
            <button 
              onClick={() => setActiveTab('STORE_MANAGEMENT')}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === 'STORE_MANAGEMENT' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
            >
              <ShoppingBag size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Store Management</span>
            </button>
          )}

          {profile?.accountType !== 'FAN' && (
            <button 
              onClick={() => setActiveTab('REVENUE')}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === 'REVENUE' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
            >
              <DollarSign size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Revenue & Money</span>
            </button>
          )}

          {profile?.accountType !== 'FAN' && (
            <button 
              onClick={() => {
                const event = new CustomEvent('NAVIGATE', { detail: { target: 'BRAND_DASHBOARD' } });
                window.dispatchEvent(event);
              }}
              className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all text-white/40 hover:text-white hover:bg-white/5"
            >
              <Building2 size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Brand Accounts</span>
            </button>
          )}

          {profile?.accountType !== 'FAN' && (
            <button 
              onClick={() => {
                const event = new CustomEvent('NAVIGATE', { detail: { target: 'VIDEO_MANAGER' } });
                window.dispatchEvent(event);
              }}
              className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all text-white/40 hover:text-white hover:bg-white/5"
            >
              <VideoIcon size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Video Manager</span>
            </button>
          )}
        </nav>

        <button onClick={onBack} className="mt-auto flex items-center gap-4 px-6 py-4 text-white/20 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest">
          <LogOut size={18} /> Exit Dashboard
        </button>

        {(profile?.role === 'admin' || profile?.role === 'staff') && (
          <button 
            onClick={() => {
              const event = new CustomEvent('NAVIGATE', { detail: { target: 'ADMIN_DASHBOARD' } });
              window.dispatchEvent(event);
            }}
            className="mt-4 flex items-center gap-4 px-6 py-4 bg-red-600/10 text-red-500 border border-red-500/20 rounded-2xl hover:bg-red-600/20 transition-all text-[10px] font-black uppercase tracking-widest"
          >
            <Shield size={18} /> System Admin
          </button>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 lg:p-16">
        <div className="max-w-4xl mx-auto">
          {showCreator.active && (
            <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl p-4 lg:p-12 overflow-y-auto">
              <div className="max-w-6xl mx-auto relative">
                <button 
                  onClick={() => setShowCreator({ active: false })}
                  className="absolute -top-4 -right-4 lg:top-0 lg:right-0 p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-50"
                >
                  <X size={24} />
                </button>
                <AlbumCreator 
                  onCreated={(album) => {
                    setShowCreator({ active: false });
                    loadUserAlbums();
                  }}
                  onCancel={() => setShowCreator({ active: false })}
                  initialAlbum={showCreator.album || (showCreator.type ? { type: showCreator.type } as any : undefined)}
                />
              </div>
            </div>
          )}
          {activeTab === 'ALIASES' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Emails & Aliases</h1>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Manage your master email and bridge accounts</p>
              </header>

              <div className="space-y-8">
                {/* Master Email */}
                <section className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
                  <h3 className="text-xs font-black uppercase tracking-widest text-small-orange mb-6">Master Account</h3>
                  <div className="flex items-center justify-between p-6 bg-black/40 rounded-3xl border border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                        <Shield size={24} className="text-white/40" />
                      </div>
                      <div>
                        <p className="text-sm font-black uppercase tracking-tight text-white">{profile.masterEmail || profile.email}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Primary Identity Account</p>
                      </div>
                    </div>
                    <button className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest text-white transition-all">Change</button>
                  </div>
                </section>

                {/* Aliases */}
                <section className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xs font-black uppercase tracking-widest text-small-orange">Alias Accounts</h3>
                    <button 
                      onClick={() => {
                        const email = prompt('Enter alias email:');
                        const provider = prompt('Enter provider (e.g. Gmail, OneDrive, Outlook):');
                        if (email && provider) {
                          const newAlias = { id: Math.random().toString(36).substr(2, 9), email, provider, isVerified: false };
                          setProfile({ ...profile, aliases: [...(profile.aliases || []), newAlias] });
                        }
                      }}
                      className="flex items-center gap-2 px-6 py-2 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
                    >
                      <Plus size={14} /> Add Alias
                    </button>
                  </div>

                  <div className="space-y-4">
                    {(profile.aliases || []).map(alias => (
                      <div key={alias.id} className="flex items-center justify-between p-6 bg-black/40 rounded-3xl border border-white/10 group">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                            <Mail size={24} className="text-white/40" />
                          </div>
                          <div>
                            <p className="text-sm font-black uppercase tracking-tight text-white">{alias.email}</p>
                            <div className="flex items-center gap-3">
                              <span className="text-[9px] font-black uppercase tracking-widest text-white/20">{alias.provider}</span>
                              {alias.isVerified ? (
                                <span className="text-[8px] font-black uppercase tracking-widest text-green-500 flex items-center gap-1">
                                  <Shield size={10} /> Verified
                                </span>
                              ) : (
                                <button className="text-[8px] font-black uppercase tracking-widest text-small-orange hover:underline">Verify Now</button>
                              )}
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => setProfile({ ...profile, aliases: (profile.aliases || []).filter(a => a.id !== alias.id) })}
                          className="p-3 text-white/20 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                    {(profile.aliases || []).length === 0 && (
                      <div className="py-12 text-center opacity-20 border-2 border-dashed border-white/5 rounded-[2rem]">
                        <p className="text-[10px] font-black uppercase tracking-widest">No alias accounts connected</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          )}
          {activeTab === 'RADIO_MANAGER' && profile && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12 pb-32">
              <header>
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-[#00DAF3]/20 rounded-2xl">
                    <Radio size={24} className="text-[#00DAF3]" />
                  </div>
                  <div>
                    <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Artist Radio Station</h1>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">Personalize your broadcast & engagement</p>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Basic Settings */}
                <section className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#00DAF3]">Station Settings</h3>
                    <div 
                      onClick={() => {
                        const nextSettings = { 
                          ...profile.radioSettings, 
                          enabled: !profile.radioSettings?.enabled 
                        } as any;
                        setProfile({ ...profile, radioSettings: nextSettings });
                      }}
                      className={`w-12 h-6 rounded-full transition-all cursor-pointer relative ${profile.radioSettings?.enabled ? 'bg-[#00DAF3]' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${profile.radioSettings?.enabled ? 'right-1' : 'left-1'}`} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[8px] font-black uppercase tracking-widest text-white/40 mb-2">Station Name</label>
                      <input 
                        type="text"
                        value={profile.radioSettings?.stationName || ''}
                        onChange={(e) => {
                          const nextSettings = { ...profile.radioSettings, stationName: e.target.value } as any;
                          setProfile({ ...profile, radioSettings: nextSettings });
                        }}
                        placeholder={`${profile.displayName} Radio`}
                        className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-sm focus:border-[#00DAF3] transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-white/40 mb-2">Stinger Freq (Songs)</label>
                        <input 
                          type="number"
                          value={profile.radioSettings?.stingerFrequency || 5}
                          onChange={(e) => {
                            const nextSettings = { ...profile.radioSettings, stingerFrequency: parseInt(e.target.value) } as any;
                            setProfile({ ...profile, radioSettings: nextSettings });
                          }}
                          className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-sm focus:border-[#00DAF3] transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-white/40 mb-2">Ad Freq (Songs)</label>
                        <input 
                          type="number"
                          value={profile.radioSettings?.adFrequency || 20}
                          onChange={(e) => {
                            const nextSettings = { ...profile.radioSettings, adFrequency: parseInt(e.target.value) } as any;
                            setProfile({ ...profile, radioSettings: nextSettings });
                          }}
                          className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-sm focus:border-[#00DAF3] transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Automation & Events */}
                <section className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 flex flex-col gap-6">
                   <h3 className="text-xs font-black uppercase tracking-widest text-small-orange">Live Breakout Events</h3>
                   <div className="flex-1 space-y-4">
                      {profile.radioSettings?.scheduledEvents?.map(event => (
                        <div key={event.id} className="p-4 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-tight">{event.title}</p>
                            <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">
                              {new Date(event.startTime).toLocaleString()} â€¢ {event.type}
                            </p>
                          </div>
                          <button 
                            onClick={() => {
                              const nextEvents = profile.radioSettings?.scheduledEvents?.filter(e => e.id !== event.id);
                              setProfile({ ...profile, radioSettings: { ...profile.radioSettings!, scheduledEvents: nextEvents } });
                            }}
                            className="p-2 text-white/20 hover:text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}

                      {(!profile.radioSettings?.scheduledEvents || profile.radioSettings.scheduledEvents.length === 0) && (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/5 rounded-[2rem]">
                          <Tv className="text-white/10 mb-4" size={32} />
                          <p className="text-[8px] font-bold uppercase tracking-widest text-white/20">No Events Scheduled</p>
                        </div>
                      )}
                   </div>
                   <button 
                    onClick={() => {
                      const id = Math.random().toString(36).substr(2, 9);
                      const title = prompt('Event Title:');
                      if (title) {
                        const type = window.confirm('Is this a Live Stream? (Cancel for Live Talk)') ? 'LIVE_STREAM' : 'LIVE_TALK';
                        const nextEvents = [...(profile.radioSettings?.scheduledEvents || []), { id, title, startTime: Date.now() + 3600000, type }];
                        setProfile({ ...profile, radioSettings: { ...profile.radioSettings!, scheduledEvents: nextEvents as any } });
                      }
                    }}
                    className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all"
                   >
                     <Plus size={16} /> Schedule Live Event
                   </button>
                </section>
              </div>

              {/* Media Management */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 {/* Stingers & Drops */}
                 <section className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 space-y-6">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-purple-400 mb-2">Drops & Stingers</h3>
                      <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mb-6">Played every {profile.radioSettings?.stingerFrequency || 5} songs</p>
                    </div>

                    <div className="space-y-3">
                      {profile.radioSettings?.stingers?.map((url, i) => (
                        <div key={i} className="group p-4 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                              <Music size={14} />
                            </div>
                            <span className="text-[10px] font-bold text-white/60 truncate max-w-[150px]">{url.split('/').pop()}</span>
                          </div>
                          <button 
                            onClick={() => {
                              const next = profile.radioSettings?.stingers?.filter((_, idx) => idx !== i);
                              setProfile({ ...profile, radioSettings: { ...profile.radioSettings!, stingers: next || [] } });
                            }}
                            className="p-2 opacity-0 group-hover:opacity-100 transition-all text-white/20 hover:text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      <FileUploader 
                        onUploadComplete={(url) => {
                          const next = [...(profile.radioSettings?.stingers || []), url];
                          setProfile({ ...profile, radioSettings: { ...profile.radioSettings!, stingers: next } });
                        }}
                        label="Upload Stinger"
                        type="MUSIC"
                      />
                    </div>
                 </section>

                 {/* Sourced Ads */}
                 <section className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 space-y-6">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-amber-400 mb-2">Custom Commercials</h3>
                      <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest mb-6">Played every {profile.radioSettings?.adFrequency || 20} songs</p>
                    </div>

                    <div className="space-y-3">
                      {profile.radioSettings?.ads?.map((url, i) => (
                        <div key={i} className="group p-4 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                              <DollarSign size={14} />
                            </div>
                            <span className="text-[10px] font-bold text-white/60 truncate max-w-[150px]">{url.split('/').pop()}</span>
                          </div>
                          <button 
                            onClick={() => {
                              const next = profile.radioSettings?.ads?.filter((_, idx) => idx !== i);
                              setProfile({ ...profile, radioSettings: { ...profile.radioSettings!, ads: next || [] } });
                            }}
                            className="p-2 opacity-0 group-hover:opacity-100 transition-all text-white/20 hover:text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      <FileUploader 
                        onUploadComplete={(url) => {
                          const next = [...(profile.radioSettings?.ads || []), url];
                          setProfile({ ...profile, radioSettings: { ...profile.radioSettings!, ads: next } });
                        }}
                        label="Upload Advertisement"
                        type="MUSIC"
                      />
                    </div>
                 </section>
              </div>

              <div className="flex justify-end pt-8">
                <button 
                  onClick={async () => {
                    setIsSaving(true);
                    try {
                      await updateUserProfile(user.uid, { radioSettings: profile.radioSettings });
                      alert('Station settings saved successfully!');
                    } catch (err) {
                      console.error(err);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={isSaving}
                  className="px-12 py-5 bg-gradient-to-r from-[#00DAF3] to-[#00A8FF] text-black font-black uppercase tracking-widest rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSaving ? 'Synchronizing Station...' : 'Go Live / Save Content'}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'ACCOUNT' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Account Settings</h1>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Manage your public identity and security</p>
              </header>

              <form onSubmit={handleUpdateProfile} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Display Name</label>
                      <input 
                        type="text" 
                        value={profile.displayName}
                        onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Featured Artist Photo (High Quality)</label>
                      <div className="flex gap-4">
                        <input 
                          type="text" 
                          value={profile.featuredArtistPhoto || ''}
                          onChange={(e) => setProfile({ ...profile, featuredArtistPhoto: e.target.value })}
                          placeholder="https://..."
                          className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all"
                        />
                        <FileUploader 
                          type="PHOTO" 
                          onUploadComplete={(url) => setProfile({ ...profile, featuredArtistPhoto: url })}
                          className="shrink-0"
                        />
                      </div>
                    </div>
                  </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Bio / Artist Statement</label>
                  <textarea 
                    rows={4}
                    value={profile.bio || ''}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all resize-none"
                    placeholder="Tell the world about your creative vision..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">X (Twitter) Handle</label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 font-bold text-sm">@</span>
                      <input 
                        type="text" 
                        value={profile.xHandle || ''}
                        onChange={(e) => setProfile({ ...profile, xHandle: e.target.value.replace('@', '') })}
                        placeholder="username"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 pl-10 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">X Profile URL</label>
                    <input 
                      type="text" 
                      value={profile.xUrl || ''}
                      onChange={(e) => setProfile({ ...profile, xUrl: e.target.value })}
                      placeholder="https://x.com/username"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">X Embed HTML (Raw Signal)</label>
                  <textarea 
                    rows={4}
                    value={profile.xEmbedHtml || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updates: Partial<typeof profile> = { xEmbedHtml: val };
                      
                      // Auto-read handle from publish code if handle is empty
                      if (val && !profile.xHandle) {
                        const handleMatch = val.match(/twitter\.com\/([^/?#\s"]+)/i);
                        if (handleMatch && handleMatch[1] && handleMatch[1] !== 'widgets.js') {
                          updates.xHandle = handleMatch[1];
                          updates.xUrl = `https://x.com/${handleMatch[1]}`;
                        }
                      }
                      
                      setProfile({ ...profile, ...updates });
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-xs font-mono outline-none focus:ring-2 ring-white/20 transition-all resize-none"
                    placeholder="Paste HTML from publish.twitter.com here..."
                  />
                  <p className="mt-3 text-[9px] font-bold text-white/40 uppercase tracking-widest ml-2 flex items-center gap-2">
                    <Sparkles size={10} className="text-small-orange" />
                    When you paste your Raw Signal (Embed Code), we will automatically attempt to read your handle and profile link.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Mastodon Handle</label>
                    <input 
                      type="text" 
                      value={profile.mastodonHandle || ''}
                      onChange={(e) => setProfile({ ...profile, mastodonHandle: e.target.value })}
                      placeholder="e.g. username"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Mastodon Instance</label>
                    <input 
                      type="text" 
                      value={profile.mastodonInstance || ''}
                      onChange={(e) => setProfile({ ...profile, mastodonInstance: e.target.value })}
                      placeholder="e.g. mastodon.social"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Bluesky Handle</label>
                    <input 
                      type="text" 
                      value={profile.blueskyHandle || ''}
                      onChange={(e) => setProfile({ ...profile, blueskyHandle: e.target.value })}
                      placeholder="e.g. username.bsky.social"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Threads Handle</label>
                    <input 
                      type="text" 
                      value={profile.threadsHandle || ''}
                      onChange={(e) => setProfile({ ...profile, threadsHandle: e.target.value })}
                      placeholder="e.g. username"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Default Profile Tab</label>
                    <select 
                      value={profile.defaultProfileTab || 'FEED'}
                      onChange={(e) => setProfile({ ...profile, defaultProfileTab: e.target.value as any })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all appearance-none"
                    >
                    {[
                      { id: 'FEED', label: 'Social Feed' },
                      { id: 'CONTENT', label: 'Creations / Music' },
                      { id: 'ARTICLES', label: 'Articles' },
                      { id: 'PHOTOS', label: 'Photos' },
                      { id: 'VIDEOS', label: 'Videos' },
                      { id: 'TV', label: 'TV Channel' },
                      { id: 'GAMES', label: 'Games' },
                      { id: 'LIVE_CHAT', label: 'Live Chat' },
                      { id: 'MERCH', label: 'Store' },
                      { id: 'FOLLOWING', label: 'Following' },
                      { id: 'FRIENDS', label: 'Friends' },
                      { id: 'INTERESTS', label: 'Interests' },
                      { id: 'MEMBERS', label: 'Sanctuary' }
                    ].map(tab => (
                      <option key={tab.id} value={tab.id} className="bg-[#0a0a0a]">{tab.label}</option>
                    ))}
                  </select>
                  <p className="mt-3 text-[9px] font-bold text-white/20 uppercase tracking-widest ml-2">This is the first tab visitors will see when they land on your profile.</p>
                </div>
              </div>

                {onSetTheme && (
                  <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
                    <h3 className="text-xs font-black uppercase tracking-widest text-small-orange mb-6 flex items-center gap-2">
                      <Sparkles size={14} /> Interface Theme
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {THEME_OPTIONS.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onSetTheme(t.id)}
                          className={`group relative h-24 rounded-2xl overflow-hidden border-2 transition-all ${currentTheme === t.id ? 'border-small-orange scale-[1.03] shadow-[0_0_20px_rgba(255,140,0,0.3)]' : 'border-white/10 hover:border-white/30'}`}
                          style={{ background: t.bg }}
                        >
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: t.text }}>{t.label}</span>
                            {currentTheme === t.id && (
                              <div className="w-4 h-4 rounded-full bg-small-orange flex items-center justify-center">
                                <Check size={10} className="text-white" />
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-[9px] font-bold text-white/20 uppercase tracking-widest ml-2">Theme is saved to your account and persists across devices.</p>
                  </div>
                )}

                <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
                  <h3 className="text-xs font-black uppercase tracking-widest text-small-orange mb-6 flex items-center gap-2">
                    <Sparkles size={14} /> Global Theme
                  </h3>
                  <div className="space-y-8">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Frosted Background Image (Omnipresent)</label>
                      <div className="flex flex-col gap-4">
                        <div className="flex gap-4">
                          <input 
                            type="text" 
                            value={profile.frostedBackground || ''}
                            onChange={(e) => setProfile({ ...profile, frostedBackground: e.target.value })}
                            placeholder="https://images.unsplash.com/..."
                            className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all font-mono"
                          />
                          <FileUploader 
                            type="PHOTO" 
                            onUploadComplete={(url) => setProfile({ ...profile, frostedBackground: url })}
                            className="shrink-0"
                          />
                        </div>
                        {profile.frostedBackground && (
                          <div className="relative w-full h-32 rounded-2xl overflow-hidden border border-white/10 group bg-black">
                             <img loading="lazy" decoding="async" src={profile.frostedBackground || null} className="w-full h-full object-cover blur-sm opacity-50 group-hover:blur-0 group-hover:opacity-100 transition-all" />
                             <button 
                               type="button"
                               onClick={() => setProfile({ ...profile, frostedBackground: '' })}
                               className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-full hover:bg-red-500 transition-all"
                             >
                               <Trash2 size={14} />
                             </button>
                          </div>
                        )}
                        <p className="mt-1 text-[9px] font-bold text-white/20 uppercase tracking-widest ml-2">This image will follow your visitors as a blurred, atmospheric backdrop.</p>
                      </div>
                    </div>

                    <div className="pt-8 border-t border-white/5">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Looping Background Video (Profile Only)</label>
                      <div className="flex flex-col gap-4">
                        <div className="flex gap-4">
                          <input 
                            type="text" 
                            value={profile.videoBackgroundUrl || ''}
                            onChange={(e) => setProfile({ ...profile, videoBackgroundUrl: e.target.value })}
                            placeholder="https://...mp4"
                            className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all font-mono"
                          />
                          <FileUploader 
                            type="VIDEO" 
                            onUploadComplete={(url) => setProfile({ ...profile, videoBackgroundUrl: url })}
                            className="shrink-0"
                          />
                        </div>
                        
                        <div className="flex items-center gap-6 p-4 bg-black/40 rounded-2xl">
                          <div className="flex items-center gap-3">
                            <button 
                              type="button"
                              onClick={() => setProfile({ ...profile, videoBackgroundBlur: profile.videoBackgroundBlur === false ? true : false })}
                              className={`w-10 h-6 rounded-full transition-all relative ${profile.videoBackgroundBlur !== false ? 'bg-small-orange' : 'bg-white/10'}`}
                            >
                              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${profile.videoBackgroundBlur !== false ? 'left-5' : 'left-1'}`} />
                            </button>
                            <span className="text-[9px] font-black uppercase tracking-widest text-white">Blur Effect</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <button 
                              type="button"
                              onClick={() => setProfile({ ...profile, videoBackgroundFrosted: profile.videoBackgroundFrosted === false ? true : false })}
                              className={`w-10 h-6 rounded-full transition-all relative ${profile.videoBackgroundFrosted !== false ? 'bg-small-orange' : 'bg-white/10'}`}
                            >
                              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${profile.videoBackgroundFrosted !== false ? 'left-5' : 'left-1'}`} />
                            </button>
                            <span className="text-[9px] font-black uppercase tracking-widest text-white">Frosted Effect</span>
                          </div>
                        </div>

                        {profile.videoBackgroundUrl && (
                          <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black group">
                             <video 
                               src={profile.videoBackgroundUrl || undefined} 
                               autoPlay muted loop playsInline
                               className={`w-full h-full object-cover transition-all duration-700 ${profile.videoBackgroundBlur !== false ? 'blur-xl scale-110' : ''}`} 
                             />
                             {profile.videoBackgroundFrosted !== false && (
                               <div className="absolute inset-0 bg-black/20 backdrop-blur-3xl" />
                             )}
                             <button 
                               type="button"
                               onClick={() => setProfile({ ...profile, videoBackgroundUrl: '' })}
                               className="absolute top-4 right-4 p-2 bg-black/60 text-white rounded-full hover:bg-red-500 transition-all opacity-0 group-hover:opacity-100"
                             >
                               <Trash2 size={14} />
                             </button>
                          </div>
                        )}
                        <p className="mt-1 text-[9px] font-bold text-white/20 uppercase tracking-widest ml-2">Profile background video loops for visitors. Immersion filters are recommended.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 mb-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-small-orange mb-1">Custom Background</h3>
                      <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Show your frosted photo / video background across the app</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfile({ ...profile, customBgEnabled: profile.customBgEnabled === false ? true : false })}
                      className={`w-14 h-8 rounded-full transition-all relative shrink-0 ${profile.customBgEnabled !== false ? 'bg-small-orange' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${profile.customBgEnabled !== false ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-small-orange mb-1">Custom Theme Slideshow</h3>
                      <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Use your active theme preset photos &amp; videos as the background</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfile({ ...profile, customThemeEnabled: profile.customThemeEnabled === false ? true : false })}
                      className={`w-14 h-8 rounded-full transition-all relative shrink-0 ${profile.customThemeEnabled !== false ? 'bg-small-orange' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${profile.customThemeEnabled !== false ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-small-orange mb-1">Help Tooltips</h3>
                      <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Show detailed help when hovering for 4 seconds</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfile({ ...profile, tooltipsEnabled: !profile.tooltipsEnabled })}
                      className={`w-14 h-8 rounded-full transition-all relative shrink-0 ${profile.tooltipsEnabled ? 'bg-small-orange' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${profile.tooltipsEnabled ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                {/* Account Identity Section */}
                <section className="p-8 lg:p-12 bg-white/[0.02] border border-white/5 rounded-[3rem] mb-8">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-4 bg-small-orange/20 rounded-2xl">
                      <Shield className="text-small-orange" size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-tightest">Account Identity</h3>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Define your role on the platform</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {(['FAN', 'ARTIST', 'BRAND', 'WRITER', 'STUDENT', 'TEACHER', 'PARTNER'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={async () => {
                          await updateAccountType(type as any);
                          setProfile(prev => prev ? { 
                            ...prev, 
                            accountType: type as any, 
                            isArtist: type === 'ARTIST', 
                            isBrandAdmin: type === 'BRAND', 
                            isWriter: type === 'WRITER',
                            isStudent: type === 'STUDENT',
                            isTeacher: type === 'TEACHER',
                            isPartner: type === 'PARTNER'
                          } : null);
                        }}
                        className={`p-6 rounded-[2rem] border transition-all flex flex-col items-center gap-3 ${
                          profile.accountType === type 
                            ? 'bg-white text-black border-white' 
                            : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <div className={`p-3 rounded-xl ${profile.accountType === type ? 'bg-black/10' : 'bg-white/5'}`}>
                          {type === 'FAN' && <Heart size={20} />}
                          {type === 'ARTIST' && <Sparkles size={20} />}
                          {type === 'BRAND' && <Box size={20} />}
                          {type === 'WRITER' && <Pen size={20} />}
                          {type === 'STUDENT' && <Notebook size={20} />}
                          {type === 'TEACHER' && <LayoutGrid size={20} />}
                          {type === 'PARTNER' && <HeartHandshake size={20} />}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest">{type}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <button 
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-3 px-10 py-5 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all active:scale-95 shadow-2xl disabled:opacity-50"
                >
                  <Save size={18} /> {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </motion.div>
          )}

          {activeTab === 'STORE_MANAGEMENT' && profile.accountType !== 'FAN' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Store Management</h1>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Manage your merchandise and digital content sales</p>
              </header>
              <StoreManager 
                artistId={user.uid} 
                initialMerch={userMerch} 
                settings={profile.storeSettings}
                onUpdate={setUserMerch} 
                onSettingsUpdate={(settings) => setProfile(prev => prev ? { ...prev, storeSettings: settings } : null)}
              />
            </motion.div>
          )}

          {activeTab === 'REVENUE' && profile.accountType !== 'FAN' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Revenue & Money</h1>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Track your earnings and manage payout methods</p>
              </header>
              <RevenueDashboard 
                profile={profile} 
                onUpdate={setProfile}
              />
            </motion.div>
          )}

          {activeTab === 'INTERESTS' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Interest Notebook</h1>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Define your identity and interests for personalized discovery</p>
              </header>
              <div className="bg-white/[0.02] border border-white/5 rounded-[3rem] overflow-hidden">
                <InterestsNotebook profile={profile} isOwner={true} onUpdate={setProfile} />
              </div>
            </motion.div>
          )}

          {activeTab === 'MAILING_LIST' && (
            <motion.div 
              key="mailing_list"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-12"
            >
              <header className="space-y-2">
                <h2 className="text-4xl font-black uppercase tracking-tightest">Mailing List & The Newstand</h2>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Connect directly with your audience</p>
              </header>
              <div className="bg-white/[0.02] border border-white/5 rounded-[3rem] p-10">
                <MailingListManager artistId={user.uid} />
              </div>
            </motion.div>
          )}

          {activeTab === 'WORLDS' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12 pb-24">
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">My Worlds</h1>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Architect your IP Universes and Spaces</p>
                </div>
                <button 
                  onClick={() => setShowWorldCreator(true)}
                  className="px-8 py-4 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-transform flex items-center justify-center gap-3 shrink-0"
                >
                  <Plus size={16} /> Create A New World
                </button>
              </header>

              {showWorldCreator ? (
                <div className="bg-white/[0.02] border border-white/10 rounded-[3rem] p-6">
                  <div className="flex justify-end mb-4">
                    <button onClick={() => setShowWorldCreator(false)} className="p-4 bg-white/5 rounded-full hover:bg-white/10 text-white/40 hover:text-white">
                      <X size={20} />
                    </button>
                  </div>
                  <WorldManagerView 
                    onSave={async (w) => {
                      const newW = await createIPWorld({ ...w, creatorId: user.uid });
                      setUserWorlds([newW, ...userWorlds]);
                      setShowWorldCreator(false);
                    }} 
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {userWorlds.length === 0 ? (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-white/10 rounded-[3rem]">
                      <p className="text-white/40 font-black uppercase tracking-widest mb-6">You haven't created any worlds yet.</p>
                      <button onClick={() => setShowWorldCreator(true)} className="px-8 py-4 bg-white/5 rounded-2xl text-white font-bold inline-flex items-center gap-2 hover:bg-white/10">
                        <Plus size={16} /> Create First World
                      </button>
                    </div>
                  ) : (
                    userWorlds.map(w => (
                      <div key={w.id} className="relative group rounded-[2.5rem] overflow-hidden border border-white/10 aspect-video glass">
                        {w.coverImage && <img loading="lazy" decoding="async" src={w.coverImage || null} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity" />}
                        <div className="absolute inset-0 p-8 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent">
                          <h3 className="text-2xl font-black uppercase tracking-wider text-white mb-2">{w.name}</h3>
                          <p className="text-white/60 text-xs font-bold uppercase tracking-widest truncate">{w.description || 'No description provided'}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'ASSETS' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header className="flex items-end justify-between">
                <div>
                  <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">My Assets</h1>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Global archive of your creative deployments</p>
                </div>
                <button className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white transition-all"><Search size={20} /></button>
              </header>

              {/* Upload CTA â€” always visible, type-select grid */}
              <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-white/5 to-white/0 p-10">
                {/* Decorative glow */}
                <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[#FF8C00]/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-[#6B0099]/10 blur-3xl" />

                <div className="relative">
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-small-orange mb-3">Ready to publish?</p>
                  <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white leading-none mb-2">
                    Upload Your<br />Creative Work
                  </h2>
                  <p className="text-white/30 text-sm font-bold uppercase tracking-widest mb-10">
                    Choose a format â€” we'll handle the rest
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {([
                      { type: 'MUSIC', label: 'Music', sub: 'Albums Â· Singles Â· Podcasts', icon: Music, color: 'from-[#FF8C00]/20 to-[#FF8C00]/5', border: 'border-[#FF8C00]/20', accent: 'text-[#FF8C00]' },
                      { type: 'VIDEO', label: 'Video', sub: 'Films Â· Series Â· Clips', icon: VideoIcon, color: 'from-[#3b82f6]/20 to-[#3b82f6]/5', border: 'border-[#3b82f6]/20', accent: 'text-[#3b82f6]' },
                      { type: 'BOOK', label: 'Books', sub: 'Novels Â· PDFs Â· ePubs', icon: BookOpen, color: 'from-[#10b981]/20 to-[#10b981]/5', border: 'border-[#10b981]/20', accent: 'text-[#10b981]' },
                      { type: 'PHOTO', label: 'Photos', sub: 'Gallery Â· Slideshow', icon: ImageIcon, color: 'from-[#a855f7]/20 to-[#a855f7]/5', border: 'border-[#a855f7]/20', accent: 'text-[#a855f7]' },
                    ] as const).map(({ type, label, sub, icon: Icon, color, border, accent }) => (
                      <motion.button
                        key={type}
                        whileHover={{ scale: 1.03, y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setShowCreator({ active: true, type })}
                        className={`group relative flex flex-col items-start gap-4 p-6 bg-gradient-to-br ${color} border ${border} rounded-[1.75rem] text-left transition-all hover:border-white/20`}
                      >
                        <div className={`p-3 rounded-2xl bg-white/5 ${accent}`}>
                          <Icon size={24} />
                        </div>
                        <div>
                          <p className="text-base font-black uppercase tracking-tight text-white">{label}</p>
                          <p className={`text-[9px] font-black uppercase tracking-widest ${accent} opacity-70`}>{sub}</p>
                        </div>
                        <UploadCloud size={16} className="absolute top-5 right-5 text-white/10 group-hover:text-white/40 transition-colors" />
                      </motion.button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Asset List */}
              {userAlbums.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">
                      {userAlbums.length} {userAlbums.length === 1 ? 'Asset' : 'Assets'} Deployed
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {userAlbums.map(album => (
                      <div key={album.id} className="group flex items-center gap-6 p-6 bg-white/5 border border-white/5 rounded-[2rem] hover:bg-white/10 transition-all">
                        <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0">
                          <img src={album.coverImage || null} alt={album.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-black uppercase tracking-tight text-white truncate">{album.title}</h3>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-small-orange bg-small-orange/10 px-2 py-1 rounded-md">{album.type}</span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/20">{album.genre}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setShowCreator({ active: true, album })}
                            className="p-4 bg-white/5 rounded-xl text-white/40 hover:text-white transition-all"
                          >
                            <Settings size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteAlbum(album.id)}
                            className="p-4 bg-white/5 rounded-xl text-white/40 hover:text-red-500 transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'PHOTOS' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Photo Management</h1>
                  <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Manage your visual media and gallery assets</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleSelectAll}
                      className="flex items-center gap-2 px-6 py-3 bg-white/5 text-white/60 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                    >
                      {selectedPhotoIds.length === userPhotos.length ? 'Deselect All' : 'Select All'}
                    </button>
                    {userPhotos.length > 0 && (
                      <button 
                        onClick={handleDeleteAll}
                        className="flex items-center gap-2 px-6 py-3 bg-red-600/10 text-red-500 border border-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-600/20 transition-all"
                      >
                        <Trash2 size={14} /> Delete All
                      </button>
                    )}
                  </div>
                  {selectedPhotoIds.length > 0 && (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                      <button 
                        onClick={() => setShowAlbumSelector(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all"
                      >
                        <FolderPlus size={14} /> Add to Album
                      </button>
                      <button 
                        onClick={handleBulkDelete}
                        className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all"
                      >
                        <Trash2 size={14} /> Delete ({selectedPhotoIds.length})
                      </button>
                      <button 
                        onClick={() => setSelectedPhotoIds([])}
                        className="p-3 bg-white/5 text-white/40 hover:text-white rounded-xl transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  <button 
                    onClick={() => setShowCreator({ active: true, type: 'PHOTO' as any })}
                    className="p-4 bg-white text-black rounded-2xl hover:scale-105 transition-all shadow-xl"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </header>

              {showAlbumSelector && (
                <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] animate-in zoom-in-95 duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Select Album</h3>
                    <button onClick={() => setShowAlbumSelector(false)} className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-full transition-all">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {userAlbums.map(album => (
                      <button 
                        key={album.id}
                        onClick={() => handleAddToAlbum(album.id)}
                        className="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all text-left group"
                      >
                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0">
                          <img src={album.coverImage || null} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{album.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {userPhotos.map(photo => (
                  <div 
                    key={photo.id} 
                    className={`group relative aspect-square rounded-2xl overflow-hidden border transition-all cursor-pointer ${selectedPhotoIds.includes(photo.id) ? 'ring-4 ring-small-orange border-small-orange' : 'border-white/5'}`}
                    onClick={() => togglePhotoSelection(photo.id)}
                  >
                    <img src={photo.url || null} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                    <div className="absolute top-4 right-4 z-10">
                      {selectedPhotoIds.includes(photo.id) ? (
                        <div className="p-2 bg-small-orange text-white rounded-lg shadow-xl">
                          <CheckSquare size={16} />
                        </div>
                      ) : (
                        <div className="p-2 bg-black/40 text-white/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                          <Square size={16} />
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id); }}
                        className="p-3 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {userPhotos.length === 0 && (
                  <div className="col-span-full py-20 text-center opacity-20 border-2 border-dashed border-white/5 rounded-[3rem]">
                    <ImageIcon size={48} className="mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No photos uploaded yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'BROADCAST' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">TV & Broadcast Studio</h1>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Manage your live stream, FAST channel, and global broadcast status</p>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-8">
                  <div className="p-8 bg-white/5 border border-white/5 rounded-[2.5rem] space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-small-orange">Stream Configuration</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 ml-2">Live Stream URL (YouTube/Twitch/HLS)</label>
                        <input 
                          type="text"
                          value={profile.liveStreamConfig?.streamUrl || ''}
                          onChange={(e) => setProfile({ ...profile, liveStreamConfig: { ...(profile.liveStreamConfig || { title: '', isActive: false, source: 'Custom' }), streamUrl: e.target.value } })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-bold outline-none focus:ring-2 ring-small-orange/50"
                          placeholder="https://..."
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 ml-2">Instant FAST Channel URL</label>
                        <input 
                          type="text"
                          value={profile.liveStreamConfig?.fastChannelUrl || ''}
                          onChange={(e) => setProfile({ ...profile, liveStreamConfig: { ...(profile.liveStreamConfig || { title: '', isActive: false, source: 'Custom', streamUrl: '' }), fastChannelUrl: e.target.value } })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-bold outline-none focus:ring-2 ring-small-orange/50"
                          placeholder="https://..."
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 ml-2">Broadcast Title</label>
                        <input 
                          type="text"
                          value={profile.liveStreamConfig?.title || ''}
                          onChange={(e) => setProfile({ ...profile, liveStreamConfig: { ...(profile.liveStreamConfig || { streamUrl: '', isActive: false, source: 'Custom' }), title: e.target.value } })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-bold outline-none focus:ring-2 ring-small-orange/50"
                          placeholder="My Live Show"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 ml-2">Source Platform</label>
                        <select 
                          value={profile.liveStreamConfig?.source || 'Custom'}
                          onChange={(e) => setProfile({ ...profile, liveStreamConfig: { ...(profile.liveStreamConfig || { streamUrl: '', title: '', isActive: false }), source: e.target.value } })}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-bold outline-none focus:ring-2 ring-small-orange/50 appearance-none"
                        >
                          <option value="YouTube" className="bg-[#0a0a0a]">YouTube</option>
                          <option value="Twitch" className="bg-[#0a0a0a]">Twitch</option>
                          <option value="Custom" className="bg-[#0a0a0a]">Custom HLS / RTMP</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="p-8 bg-white/5 border border-white/5 rounded-[2.5rem] space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-small-orange">Broadcast Controls</h3>
                    
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Active Stream Source</span>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setProfile({ ...profile, liveStreamConfig: { ...(profile.liveStreamConfig || { streamUrl: '', title: '', isActive: false, source: 'Custom' }), activeStreamType: 'LIVE' } })}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${profile.liveStreamConfig?.activeStreamType === 'LIVE' ? 'bg-small-orange text-white' : 'bg-white/5 text-white/40'}`}
                          >
                            Live Output
                          </button>
                          <button 
                            onClick={() => setProfile({ ...profile, liveStreamConfig: { ...(profile.liveStreamConfig || { streamUrl: '', title: '', isActive: false, source: 'Custom' }), activeStreamType: 'FAST' } })}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${profile.liveStreamConfig?.activeStreamType === 'FAST' ? 'bg-small-orange text-white' : 'bg-white/5 text-white/40'}`}
                          >
                            FAST Channel
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${profile.liveStreamConfig?.isActive ? 'bg-red-500' : 'bg-white/10'}`} />
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Stream Status</span>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${profile.liveStreamConfig?.isActive ? 'text-red-500' : 'text-white/20'}`}>
                          {profile.liveStreamConfig?.isActive ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>

                      <button 
                        onClick={() => handleUpdateLiveStream({ ...profile.liveStreamConfig!, isActive: !profile.liveStreamConfig?.isActive })}
                        className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
                          profile.liveStreamConfig?.isActive 
                            ? 'bg-red-600 text-white shadow-[0_0_30px_rgba(220,38,38,0.3)]' 
                            : 'bg-white text-black'
                        }`}
                      >
                        <Radio size={18} />
                        {profile.liveStreamConfig?.isActive ? 'Stop Broadcasting' : 'Go Live Now'}
                      </button>

                      <button 
                        onClick={() => handleUpdateLiveStream(profile.liveStreamConfig!)}
                        className="w-full py-5 bg-white/5 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-3"
                      >
                        <Save size={18} /> Save Configuration
                      </button>
                    </div>
                  </div>

                  <div className="p-8 bg-small-orange/5 border border-small-orange/10 rounded-[2.5rem]">
                    <div className="flex items-center gap-4 mb-4">
                      <Sparkles className="text-small-orange" size={20} />
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-small-orange">Broadcast Tip</h4>
                    </div>
                    <p className="text-[10px] font-bold text-white/40 uppercase leading-relaxed tracking-widest">
                      When you are "On Air", your profile will show a live indicator across the platform, and your stream will be featured in the Live Hub and Search results.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'PAYMENTS' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Payments & Revenue</h1>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Monitor your earnings and manage payout methods</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { label: 'Total Revenue', value: '$1,240.50', color: 'text-green-500' },
                  { label: 'Active Subscriptions', value: '42', color: 'text-blue-500' },
                  { label: 'Pending Payout', value: '$340.00', color: 'text-small-orange' },
                ].map(stat => (
                  <div key={stat.label} className="p-8 bg-white/5 border border-white/5 rounded-[2.5rem]">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">{stat.label}</p>
                    <p className={`text-3xl font-display font-black tracking-tight ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="p-10 bg-white/5 border border-white/5 rounded-[3rem] space-y-8">
                <h3 className="text-xl font-black uppercase tracking-widest text-white">Payout Method</h3>
                <div className="flex items-center gap-6 p-6 bg-black/40 rounded-3xl border border-white/10">
                  <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center">
                    <CreditCard size={28} className="text-white/40" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black uppercase tracking-tight text-white">Stripe Connect</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Linked Account: **** 4242</p>
                  </div>
                  <button className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest text-white transition-all">Manage</button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'SIDEBAR' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Sidebar Customization</h1>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Reorder and toggle visibility of your side panel sections</p>
              </header>

              <div className="bg-white/5 border border-white/10 rounded-[3rem] p-10 space-y-6">
                <div className="space-y-4">
                  {(profile.sidebarConfig || [
                    { id: 'USER_PROFILE', order: 0, isVisible: true },
                    { id: 'DASHBOARD', order: 1, isVisible: true },
                    { id: 'MUSIC', order: 2, isVisible: true },
                    { id: 'VIDEOS', order: 3, isVisible: true },
                    { id: 'BOOKS', order: 4, isVisible: true },
                    { id: 'RADIO', order: 5, isVisible: true },
                    { id: 'TV', order: 6, isVisible: true },
                    { id: 'GAMES', order: 7, isVisible: true },
                    { id: 'CLASSROOMS', order: 8, isVisible: true },
                    { id: 'PPV_EVENTS', order: 9, isVisible: true },
                    { id: 'GLOBAL_PHOTOS', order: 10, isVisible: true },
                    { id: 'ART_GALLERY', order: 11, isVisible: true },
                    { id: 'PAY_IT_FORWARD', order: 12, isVisible: true },
                    { id: 'CHAT', order: 13, isVisible: true },
                    { id: 'FEED', order: 14, isVisible: true },
                    { id: 'LIVE_HUB', order: 15, isVisible: true },
                    { id: 'SEARCH', order: 16, isVisible: true }
                  ]).sort((a, b) => a.order - b.order).map((item, idx, arr) => (
                    <div key={item.id} className="flex items-center justify-between p-6 bg-white/5 border border-white/10 rounded-2xl group">
                      <div className="flex items-center gap-6">
                        <span className="text-xs font-black text-white/20 w-6">{idx + 1}</span>
                        <h4 className="text-sm font-black uppercase tracking-widest text-white">{item.id.replace(/_/g, ' ')}</h4>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => {
                            const newConfig = [...(profile.sidebarConfig || arr)];
                            const itemIdx = newConfig.findIndex(i => i.id === item.id);
                            newConfig[itemIdx] = { ...newConfig[itemIdx], isVisible: !newConfig[itemIdx].isVisible };
                            setProfile({ ...profile, sidebarConfig: newConfig });
                          }}
                          className={`p-3 rounded-xl transition-all ${item.isVisible ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}
                          title={item.isVisible ? 'Hide Section' : 'Show Section'}
                        >
                          {item.isVisible ? <Eye size={18} /> : <EyeOff size={18} />}
                        </button>
                        
                        <div className="flex flex-col gap-1">
                          <button 
                            disabled={idx === 0}
                            onClick={() => {
                              const newConfig = [...(profile.sidebarConfig || arr)].sort((a, b) => a.order - b.order);
                              const prev = newConfig[idx - 1];
                              const curr = newConfig[idx];
                              const tempOrder = prev.order;
                              prev.order = curr.order;
                              curr.order = tempOrder;
                              setProfile({ ...profile, sidebarConfig: newConfig });
                            }}
                            className="p-1 text-white/20 hover:text-white disabled:opacity-0 transition-all"
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button 
                            disabled={idx === arr.length - 1}
                            onClick={() => {
                              const newConfig = [...(profile.sidebarConfig || arr)].sort((a, b) => a.order - b.order);
                              const next = newConfig[idx + 1];
                              const curr = newConfig[idx];
                              const tempOrder = next.order;
                              next.order = curr.order;
                              curr.order = tempOrder;
                              setProfile({ ...profile, sidebarConfig: newConfig });
                            }}
                            className="p-1 text-white/20 hover:text-white disabled:opacity-0 transition-all"
                          >
                            <ChevronDown size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={handleUpdateProfile}
                  disabled={isSaving}
                  className="w-full py-5 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-all shadow-2xl disabled:opacity-50"
                >
                  {isSaving ? 'Saving Configuration...' : 'Save Sidebar Layout'}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'MAILING_LIST' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Mailing List</h1>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Connect directly with your audience through newsletters</p>
              </header>
              <MailingListManager artistId={user.uid} />
            </motion.div>
          )}

          {activeTab === 'STORE_MANAGEMENT' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Store Manager</h1>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Manage your merchandise and digital assets</p>
              </header>
              <StoreManager 
                artistId={user.uid} 
                initialMerch={userMerch} 
                settings={profile?.storeSettings}
                onUpdate={setUserMerch}
                onSettingsUpdate={(s) => setProfile(prev => prev ? { ...prev, storeSettings: s } : null)}
              />
            </motion.div>
          )}

          {activeTab === 'REVENUE' && profile && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Revenue Dashboard</h1>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Track your earnings across all channels</p>
              </header>
              <RevenueDashboard 
                profile={profile} 
                onUpdate={setProfile}
              />
            </motion.div>
          )}

          {activeTab === 'THEMES' && profile && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full">
              <ThemePresetManager currentUser={profile} />
            </motion.div>
          )}

          {activeTab === 'NETWORKS' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              <header>
                <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Social Networks</h1>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Connect Mastodon, Bluesky &amp; Threads to unify your fediverse presence</p>
              </header>
              <FediverseSettings />
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
};

export default UserDashboard;
