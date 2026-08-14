import React, { useState, useEffect } from 'react';
import { WebApp, UserProfile, AppReview } from '../types';
import PageHeader from './PageHeader';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  Star, 
  Download, 
  Play, 
  ChevronLeft, 
  Info, 
  MessageSquare, 
  Globe, 
  Cpu, 
  Tag, 
  Calendar, 
  User,
  ExternalLink,
  Shield,
  ArrowRight,
  Monitor,
  Smartphone,
  X,
  Share2,
  Box,
  Sparkles,
  ScrollText,
  Boxes,
  RefreshCw,
  Grid3x3
} from 'lucide-react';
import { fetchGlobalApps, fetchUserApps, saveWebApp, fetchAppReviews, submitAppReview, updateAppStats } from '../services/backendService';
import Logo from './Logo';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

interface AppsViewProps {
  onBack: () => void;
  currentUser: UserProfile | null;
  initialAppId?: string;
  onSelectApp?: (app: WebApp) => void;
}

const AppsView: React.FC<AppsViewProps> = ({ onBack, currentUser, initialAppId, onSelectApp }) => {
  const [apps, setApps] = useState<WebApp[]>([]);
  const [selectedApp, setSelectedApp] = useState<WebApp | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [reviews, setReviews] = useState<AppReview[]>([]);
  const [activeTab, setActiveTab] = useState<'DISCOVER' | 'MY_APPS'>('DISCOVER');

  // New App Form State
  const [newApp, setNewApp] = useState({
    title: '',
    description: '',
    url: '',
    thumbnailUrl: '',
    developerName: '',
    category: 'Productivity',
    size: '1.2 MB'
  });

  useEffect(() => {
    loadApps();
  }, [activeTab]);

  const loadApps = async () => {
    setLoading(true);
    try {
      if (activeTab === 'DISCOVER') {
        const data = await fetchGlobalApps();
        setApps(data);
      } else if (currentUser) {
        const data = await fetchUserApps(currentUser.uid);
        setApps(data);
      }
    } catch (error) {
      console.error("Failed to load apps:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedApp) {
      loadReviews(selectedApp.id);
      // Increment views/clicks?
    }
  }, [selectedApp]);

  const loadReviews = async (appId: string) => {
    const data = await fetchAppReviews(appId);
    setReviews(data);
  };

  const handleAddApp = async () => {
    if (!currentUser) return;
    if (!newApp.title || !newApp.url || !newApp.thumbnailUrl) {
      alert("Please fill in required fields: Title, URL, and Thumbnail");
      return;
    }

    try {
      const appData: Partial<WebApp> = {
        title: newApp.title,
        description: newApp.description,
        url: newApp.url,
        thumbnailUrl: newApp.thumbnailUrl,
        developerName: newApp.developerName || currentUser.displayName,
        category: newApp.category,
        size: newApp.size,
        ownerId: currentUser.uid,
        isGlobalArchive: true,
        screenshots: [newApp.thumbnailUrl], // Use thumb as first screenshot
        rating: 5,
        reviewCount: 0,
        installCount: 0,
        timestamp: Date.now()
      };

      await saveWebApp(appData);
      setShowAddModal(false);
      loadApps();
      setNewApp({ title: '', description: '', url: '', thumbnailUrl: '', developerName: '', category: 'Productivity', size: '1.2 MB' });
    } catch (error) {
      console.error("Failed to add app:", error);
      alert("Error adding app. Please check console.");
    }
  };

  const handleInstall = async (app: WebApp) => {
    // Simulate install
    alert(`Installing ${app.title}...`);
    await updateAppStats(app.id, 'installCount');
    // Refresh apps
    loadApps();
  };

  const handleRun = (app: WebApp) => {
    setSelectedApp(app);
    setIsPlaying(true);
  };

  const filteredApps = apps.filter(app => 
    app.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.developerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isPlaying && selectedApp) {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col">
        <header className="h-16 bg-black/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsPlaying(false)}
              className="p-2 hover:bg-white/10 rounded-full transition-all text-white/60 hover:text-white"
            >
              <ChevronLeft size={24} />
            </button>
            <div className="flex items-center gap-3">
              <img src={selectedApp.thumbnailUrl || null} className="w-8 h-8 rounded-lg object-cover" alt="" />
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest">{selectedApp.title}</h3>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-tighter">Running in Plajah Bridge</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={async () => {
                if (Capacitor.isNativePlatform()) {
                  await Browser.open({ url: selectedApp.url, windowName: '_self', presentationStyle: 'fullscreen' });
                } else {
                  window.open(selectedApp.url, '_blank', 'width=1200,height=800');
                }
                setIsPlaying(false);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-full transition-all text-[10px] font-black uppercase tracking-widest border border-white/10"
              title="Open full browser experience to save logins and third-party cookies"
            >
              <ExternalLink size={14} />
              Open Full Browser
            </button>
            <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 rounded-full border border-green-500/30">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-[10px] font-black text-green-500 uppercase">Live Session</span>
            </div>
            <button className="p-2 text-white/40 hover:text-white">
              <X size={20} onClick={() => setIsPlaying(false)} />
            </button>
          </div>
        </header>

        <div className="flex-1 relative bg-[#0a0a0a]">
          <iframe 
            src={selectedApp.url} 
            className="w-full h-full border-none"
            title={selectedApp.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-theme overflow-hidden">
      <header className="p-8 lg:p-16 pb-8 border-b border-white/5 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 py-1 bg-small-orange rounded-md text-[10px] font-black uppercase tracking-widest text-white">App Store</div>
              <PageHeader textClassName="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Plajah Web Apps</PageHeader>
            </div>
            <p className="text-white/40 font-bold uppercase tracking-[0.2em] text-xs max-w-xl">
              A global library of community-built web experiences. Install natively or run instantly in the Plajah Bridge.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowAddModal(true)}
              className="px-8 py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl hover:scale-105 transition-all flex items-center gap-3"
            >
              <Plus size={18} /> Add Your App
            </button>
            <button 
              onClick={onBack}
              className="p-5 bg-white/5 rounded-2xl text-white/40 hover:text-white transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-8">
          <div className="flex items-center gap-8">
            <button 
              onClick={() => setActiveTab('DISCOVER')}
              className={`text-sm font-black uppercase tracking-[0.3em] pb-4 border-b-2 transition-all ${activeTab === 'DISCOVER' ? 'text-white border-white' : 'text-white/20 border-transparent hover:text-white/40'}`}
            >
              Discover
            </button>
            <button 
              onClick={() => setActiveTab('MY_APPS')}
              className={`text-sm font-black uppercase tracking-[0.3em] pb-4 border-b-2 transition-all ${activeTab === 'MY_APPS' ? 'text-white border-white' : 'text-white/20 border-transparent hover:text-white/40'}`}
            >
              My Apps
            </button>
          </div>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20" size={18} />
            <input 
              type="text"
              placeholder="Search apps, tools, games..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-full py-4 pl-16 pr-6 text-sm outline-none focus:ring-2 ring-small-orange/50 text-white placeholder:text-white/20"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 lg:p-16 custom-scrollbar">
        <AnimatePresence mode="wait">
          {selectedApp ? (
            <motion.div 
              key="app-detail"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto"
            >
              <button 
                onClick={() => setSelectedApp(null)}
                className="flex items-center gap-3 text-white/40 hover:text-white transition-all mb-12 uppercase font-black text-[10px] tracking-widest"
              >
                <ChevronLeft size={16} /> Back to Catalog
              </button>

              <div className="flex flex-col lg:flex-row gap-16">
                {/* Hero Info */}
                <div className="flex-1 space-y-12">
                  <div className="flex gap-10">
                    <div className="w-48 h-48 rounded-[3rem] bg-gradient-to-br from-white/10 to-white/5 border border-white/10 p-1 shadow-2xl overflow-hidden shrink-0">
                      <img src={selectedApp.thumbnailUrl || null} className="w-full h-full object-cover rounded-[2.8rem]" alt="" />
                    </div>
                    <div className="flex-1 py-4">
                      <div className="flex items-center gap-3 mb-2">
                         <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-widest text-small-orange">{selectedApp.category}</span>
                         <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">v{selectedApp.version || '1.0.0'}</span>
                      </div>
                      <h2 className="text-5xl lg:text-7xl font-display font-black tracking-tightest uppercase mb-4 leading-tight">{selectedApp.title}</h2>
                      <p className="text-lg font-bold text-white/40 uppercase tracking-wide mb-8">Developed by {selectedApp.developerName}</p>
                      
                      <div className="flex flex-wrap gap-4">
                        <button 
                          onClick={() => handleRun(selectedApp)}
                          className="px-10 py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-4 hover:bg-small-orange hover:text-white transition-all shadow-[0_0_50px_rgba(255,255,255,0.1)]"
                        >
                          <Play fill="currentColor" size={20} /> Open in Bridge
                        </button>
                        <button 
                          onClick={() => handleInstall(selectedApp)}
                          className="px-10 py-5 bg-white/5 border border-white/10 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-4 hover:bg-white/10 transition-all"
                        >
                          <Download size={20} /> Install App — {selectedApp.size}
                        </button>
                        <button className="p-5 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all">
                          <Share2 size={20} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Visuals */}
                  <div className="space-y-6">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Experience Visuals</h4>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                      {(selectedApp.screenshots || [selectedApp.thumbnailUrl]).map((shot, idx) => (
                        <div key={idx} className="aspect-video rounded-3xl overflow-hidden border border-white/5 bg-white/5">
                          <img src={shot || null} className="w-full h-full object-cover" alt="" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-6">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">About this Experience</h4>
                    <p className="text-xl text-white/60 leading-relaxed font-medium">
                      {selectedApp.description || "No description provided for this web application."}
                    </p>
                  </div>

                  {/* Reviews */}
                  <div className="pt-12 border-t border-white/10 space-y-10">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Reviews & Ratings</h4>
                      <div className="flex items-center gap-3">
                        <div className="flex text-small-orange">
                          {[1,2,3,4,5].map(star => <Star key={star} size={14} fill={star <= (selectedApp.rating || 5) ? "currentColor" : "none"} />)}
                        </div>
                        <span className="text-xl font-display font-black">{selectedApp.rating || "5.0"}</span>
                      </div>
                    </div>

                    <div className="grid gap-6">
                      {reviews.map(review => (
                        <div key={review.id} className="p-8 bg-white/5 border border-white/5 rounded-[2rem] space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <img src={review.userPhoto || null} className="w-10 h-10 rounded-full" alt="" />
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest">{review.userName}</p>
                                <p className="text-[8px] text-white/20 font-bold uppercase">{new Date(review.timestamp).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <div className="flex text-small-orange">
                              {[1,2,3,4,5].map(star => <Star key={star} size={10} fill={star <= review.rating ? "currentColor" : "none"} />)}
                            </div>
                          </div>
                          <p className="text-sm text-white/60 leading-relaxed">{review.comment}</p>
                        </div>
                      ))}
                      {reviews.length === 0 && (
                        <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-[2.5rem]">
                           <MessageSquare size={32} className="mx-auto mb-4 text-white/10" />
                           <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No reviews yet. Be the first to share your experience!</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sidebar Specs */}
                <div className="lg:w-80 space-y-8">
                  <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-8">
                    <h5 className="text-[10px] font-black uppercase tracking-widest">Information</h5>
                    
                    <div className="space-y-6">
                      <div className="flex items-start gap-4">
                        <User size={16} className="text-small-orange" />
                        <div>
                          <p className="text-[8px] font-black text-white/20 uppercase mb-1">Developer</p>
                          <p className="text-xs font-black uppercase tracking-wide">{selectedApp.developerName}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <Cpu size={16} className="text-small-orange" />
                        <div>
                          <p className="text-[8px] font-black text-white/20 uppercase mb-1">Compatibility</p>
                          <p className="text-xs font-black uppercase tracking-wide">Plajah Browser v2.0+</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <Tag size={16} className="text-small-orange" />
                        <div>
                          <p className="text-[8px] font-black text-white/20 uppercase mb-1">Category</p>
                          <p className="text-xs font-black uppercase tracking-wide">{selectedApp.category}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <Globe size={16} className="text-small-orange" />
                        <div>
                          <p className="text-[8px] font-black text-white/20 uppercase mb-1">Architecture</p>
                          <p className="text-xs font-black uppercase tracking-wide">Web Native</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-4">
                        <Shield size={16} className="text-small-orange" />
                        <div>
                          <p className="text-[8px] font-black text-white/20 uppercase mb-1">Security</p>
                          <p className="text-xs font-black uppercase tracking-wide">Plajah Verified</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-8 border-t border-white/10">
                      <p className="text-[8px] font-bold text-white/20 uppercase tracking-[0.2em] leading-relaxed">
                        By running this app, you agree to the Plajah Community Developer Guidelines.
                      </p>
                    </div>
                  </div>

                  <div className="p-8 bg-gradient-to-br from-small-orange/20 to-transparent rounded-[2.5rem] border border-small-orange/20">
                    <h5 className="text-[10px] font-black uppercase tracking-widest mb-4">Support Creator</h5>
                    <p className="text-[9px] text-white/40 uppercase font-black leading-loose mb-6">This app is free to use. Consider supporting the developer to unlock more features.</p>
                    <button className="w-full py-4 bg-small-orange text-white rounded-xl font-black uppercase tracking-widest text-[9px]">Send a Tip</button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="catalog"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-8 lg:gap-12"
            >
              {/* Native platform app — Plajah Pixels (audio-reactive visualizer) */}
              {activeTab === 'DISCOVER' && ('plajah pixels visualizer'.includes(searchQuery.toLowerCase()) || searchQuery === '') && (
                <div
                  key="native-plajah-pixels"
                  onClick={() => window.dispatchEvent(new CustomEvent('OPEN_PLAJAH_PIXELS', { detail: {} }))}
                  className="group cursor-pointer space-y-6"
                >
                  <div className="relative aspect-square rounded-[2.5rem] overflow-hidden border border-purple-400/20 shadow-2xl transition-all group-hover:scale-105 group-hover:-translate-y-2 bg-gradient-to-br from-purple-600/40 via-fuchsia-600/30 to-orange-500/30">
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-8">
                      <Sparkles size={56} className="text-white drop-shadow-[0_0_24px_rgba(217,70,239,0.6)]" />
                      <p className="text-2xl font-black uppercase tracking-tighter italic text-white">Plajah Pixels</p>
                    </div>
                    <div className="absolute top-4 left-4 px-2.5 py-1 rounded-md bg-white/90 text-black text-[8px] font-black uppercase tracking-widest">Native</div>
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center backdrop-blur-sm">
                      <Play fill="white" size={48} className="mb-4 text-white scale-75 group-hover:scale-100 transition-transform" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Launch Studio</p>
                    </div>
                  </div>
                  <div className="space-y-2 px-2">
                    <h3 className="text-lg font-black uppercase tracking-tight text-white truncate">Plajah Pixels</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Audio-reactive visual studio · Plajah</p>
                  </div>
                </div>
              )}

              {/* Native platform app — Teleprompter (also Plajah's teleprompting engine) */}
              {activeTab === 'DISCOVER' && ('teleprompter prompter script'.includes(searchQuery.toLowerCase()) || searchQuery === '') && (
                <div
                  key="native-teleprompter"
                  onClick={() => window.dispatchEvent(new CustomEvent('OPEN_TELEPROMPTER', { detail: {} }))}
                  className="group cursor-pointer space-y-6"
                >
                  <div className="relative aspect-square rounded-[2.5rem] overflow-hidden border border-orange-400/20 shadow-2xl transition-all group-hover:scale-105 group-hover:-translate-y-2 bg-gradient-to-br from-orange-600/40 via-amber-600/25 to-zinc-800/40">
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-8">
                      <ScrollText size={56} className="text-white drop-shadow-[0_0_24px_rgba(255,140,0,0.55)]" />
                      <p className="text-2xl font-black uppercase tracking-tighter italic text-white">Teleprompter</p>
                    </div>
                    <div className="absolute top-4 left-4 px-2.5 py-1 rounded-md bg-white/90 text-black text-[8px] font-black uppercase tracking-widest">Native</div>
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center backdrop-blur-sm">
                      <Play fill="white" size={48} className="mb-4 text-white scale-75 group-hover:scale-100 transition-transform" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Launch</p>
                    </div>
                  </div>
                  <div className="space-y-2 px-2">
                    <h3 className="text-lg font-black uppercase tracking-tight text-white truncate">Teleprompter</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Operator + talent prompter · Plajah</p>
                  </div>
                </div>
              )}

              {/* Native platform app — Spatial Mixer (Eclipsa / IAMF immersive audio) */}
              {activeTab === 'DISCOVER' && ('spatial mixer immersive audio eclipsa iamf 3d'.includes(searchQuery.toLowerCase()) || searchQuery === '') && (
                <div
                  key="native-spatial-mixer"
                  onClick={() => window.dispatchEvent(new CustomEvent('OPEN_SPATIAL_MIXER', { detail: {} }))}
                  className="group cursor-pointer space-y-6"
                >
                  <div className="relative aspect-square rounded-[2.5rem] overflow-hidden border border-teal-400/20 shadow-2xl transition-all group-hover:scale-105 group-hover:-translate-y-2 bg-gradient-to-br from-teal-500/30 via-emerald-600/20 to-[#FF8C00]/20">
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-8">
                      <Boxes size={56} className="text-white drop-shadow-[0_0_24px_rgba(34,211,170,0.6)]" />
                      <p className="text-2xl font-black uppercase tracking-tighter italic text-white">Spatial Mixer</p>
                    </div>
                    <div className="absolute top-4 left-4 px-2.5 py-1 rounded-md bg-white/90 text-black text-[8px] font-black uppercase tracking-widest">Native</div>
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center backdrop-blur-sm">
                      <Play fill="white" size={48} className="mb-4 text-white scale-75 group-hover:scale-100 transition-transform" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Launch</p>
                    </div>
                  </div>
                  <div className="space-y-2 px-2">
                    <h3 className="text-lg font-black uppercase tracking-tight text-white truncate">Spatial Mixer</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Eclipsa · IAMF immersive audio · Plajah</p>
                  </div>
                </div>
              )}

              {/* Native platform app — Media Converter (browser-lite audio/image/video) */}
              {activeTab === 'DISCOVER' && ('media converter audio video image transcode'.includes(searchQuery.toLowerCase()) || searchQuery === '') && (
                <div
                  key="native-media-converter"
                  onClick={() => window.dispatchEvent(new CustomEvent('OPEN_MEDIA_CONVERTER', { detail: {} }))}
                  className="group cursor-pointer space-y-6"
                >
                  <div className="relative aspect-square rounded-[2.5rem] overflow-hidden border border-amber-400/20 shadow-2xl transition-all group-hover:scale-105 group-hover:-translate-y-2 bg-gradient-to-br from-amber-600/40 via-orange-600/30 to-yellow-500/20">
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-8">
                      <RefreshCw size={56} className="text-white drop-shadow-[0_0_24px_rgba(255,165,0,0.55)]" />
                      <p className="text-2xl font-black uppercase tracking-tighter italic text-white">Media Converter</p>
                    </div>
                    <div className="absolute top-4 left-4 px-2.5 py-1 rounded-md bg-white/90 text-black text-[8px] font-black uppercase tracking-widest">Native</div>
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center backdrop-blur-sm">
                      <Play fill="white" size={48} className="mb-4 text-white scale-75 group-hover:scale-100 transition-transform" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Convert</p>
                    </div>
                  </div>
                  <div className="space-y-2 px-2">
                    <h3 className="text-lg font-black uppercase tracking-tight text-white truncate">Media Converter</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Audio · Image · Video · runs in-browser</p>
                  </div>
                </div>
              )}

              {/* Native platform app — Melos Beats (the Chora DAW room: pads + step sequencer) */}
              {activeTab === 'DISCOVER' && ('melos beats daw drum machine step sequencer maschine groove sampler dawproject'.includes(searchQuery.toLowerCase()) || searchQuery === '') && (
                <div
                  key="native-melos-beats"
                  onClick={() => window.dispatchEvent(new CustomEvent('OPEN_MELOS_BEATS', { detail: {} }))}
                  className="group cursor-pointer space-y-6"
                >
                  <div className="relative aspect-square rounded-[2.5rem] overflow-hidden border border-orange-400/20 shadow-2xl transition-all group-hover:scale-105 group-hover:-translate-y-2 bg-[#0A0A0D]">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#6B0099]/25 via-transparent to-[#FF8C00]/15" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-8">
                      <Grid3x3 size={56} className="text-[#FF8C00] drop-shadow-[0_0_24px_rgba(255,140,0,0.5)]" />
                      <p className="text-2xl font-black uppercase tracking-tighter italic text-white">Beats</p>
                    </div>
                    <div className="absolute top-4 left-4 px-2.5 py-1 rounded-md bg-white/90 text-black text-[8px] font-black uppercase tracking-widest">Native</div>
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center backdrop-blur-sm">
                      <Play fill="white" size={48} className="mb-4 text-white scale-75 group-hover:scale-100 transition-transform" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Make a beat</p>
                    </div>
                  </div>
                  <div className="space-y-2 px-2">
                    <h3 className="text-lg font-black uppercase tracking-tight text-white truncate">Melos Beats</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Pads · step sequencer · .dawproject</p>
                  </div>
                </div>
              )}
              {filteredApps.map((app) => (
                <div 
                  key={app.id}
                  onClick={() => setSelectedApp(app)}
                  className="group cursor-pointer space-y-6"
                >
                  <div className="relative aspect-square rounded-[2.5rem] overflow-hidden bg-white/5 border border-white/5 shadow-2xl transition-all group-hover:scale-105 group-hover:-translate-y-2">
                    <img src={app.thumbnailUrl || null} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={app.title} />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm">
                       <Play fill="white" size={48} className="mb-4 text-white scale-75 group-hover:scale-100 transition-transform" />
                       <p className="text-[10px] font-black uppercase tracking-widest">Enter Bridge</p>
                    </div>
                    
                    <div className="absolute top-6 left-6 px-3 py-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-full flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/80">{app.category}</span>
                    </div>

                    <div className="absolute bottom-6 left-6 right-6 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white bg-black/40 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10">
                        <span>{app.size}</span>
                        <div className="flex items-center gap-1 text-small-orange">
                          <Star size={10} fill="currentColor" />
                          <span>{app.rating || "5.0"}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-4">
                    <h3 className="text-2xl font-display font-black tracking-tight uppercase truncate">{app.title}</h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mt-1">{app.developerName}</p>
                  </div>
                </div>
              ))}

              {filteredApps.length === 0 && !loading && (
                <div className="col-span-full py-40 text-center space-y-6 opacity-20">
                  <Box size={64} className="mx-auto" />
                  <p className="text-sm font-black uppercase tracking-[0.4em]">No applications detected in this archival segment.</p>
                </div>
              )}

              {loading && (
                <div className="col-span-full py-40 text-center">
                  <Logo size={48} className="mx-auto mb-6" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Syncing Cloud App Index...</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add App Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#0a0a0a] border border-white/10 rounded-[3rem] w-full max-w-2xl overflow-hidden shadow-3xl"
            >
              <div className="p-12 space-y-10">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-4xl font-display font-black uppercase tracking-tight">Deploy Web App</h2>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mt-2">Add your experience to the global archival library</p>
                  </div>
                  <button onClick={() => setShowAddModal(false)} className="p-4 bg-white/5 rounded-full text-white/40 hover:text-white">
                    <X size={24} />
                  </button>
                </div>

                <div className="grid gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">App Identity (Title)</label>
                    <input 
                      type="text"
                      placeholder="e.g., Solar System Explorer"
                      value={newApp.title}
                      onChange={(e) => setNewApp({...newApp, title: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] p-6 text-sm outline-none focus:ring-2 ring-small-orange"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Access URL</label>
                      <input 
                        type="text"
                        placeholder="https://yourapp.dom"
                        value={newApp.url}
                        onChange={(e) => setNewApp({...newApp, url: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] p-6 text-sm outline-none focus:ring-2 ring-small-orange"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Cover Art URL</label>
                      <input 
                        type="text"
                        placeholder="https://images.unsplash..."
                        value={newApp.thumbnailUrl}
                        onChange={(e) => setNewApp({...newApp, thumbnailUrl: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] p-6 text-sm outline-none focus:ring-2 ring-small-orange"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Brief Narrative</label>
                    <textarea 
                      placeholder="What makes this experience unique?"
                      value={newApp.description}
                      onChange={(e) => setNewApp({...newApp, description: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] p-6 text-sm outline-none focus:ring-2 ring-small-orange h-32 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Category</label>
                      <select 
                        value={newApp.category}
                        onChange={(e) => setNewApp({...newApp, category: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] p-6 text-sm outline-none focus:ring-2 ring-small-orange appearance-none"
                      >
                        <option value="Productivity">Productivity</option>
                        <option value="Creativity">Creativity</option>
                        <option value="Science">Science</option>
                        <option value="Tool">Utility Tool</option>
                        <option value="Entertainment">Entertainment</option>
                      </select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-4">Estimated Size</label>
                      <input 
                        type="text"
                        placeholder="e.g., 2.4 MB"
                        value={newApp.size}
                        onChange={(e) => setNewApp({...newApp, size: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] p-6 text-sm outline-none focus:ring-2 ring-small-orange"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={handleAddApp}
                    className="flex-1 py-6 bg-white text-black rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-xs hover:bg-small-orange hover:text-white transition-all shadow-2xl"
                  >
                    Finalize Deployment
                  </button>
                  <button 
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-6 bg-white/5 text-white/40 rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-xs hover:bg-white/10 transition-all"
                  >
                    Abort
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AppsView;
