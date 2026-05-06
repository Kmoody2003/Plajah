import React, { useState, useEffect } from 'react';
import { Shield, Sparkles, Heart, Target, Users, Lock, ChevronRight, Gift, Star, Zap, DollarSign, TrendingUp, Calendar, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, Album, MembershipTier } from '../types';
import { fetchUserProfile, fetchUserAlbums, auth } from '../services/backendService';

interface ArtistMembersAreaProps {
  artistId: string;
  artist?: UserProfile;
  onBack?: () => void;
}

const ArtistMembersArea: React.FC<ArtistMembersAreaProps> = ({ artistId, artist: initialArtist, onBack }) => {
  const [artist, setArtist] = useState<UserProfile | null>(initialArtist || null);
  const [projects, setProjects] = useState<Album[]>([]);
  const [loading, setLoading] = useState(!initialArtist);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'PROJECTS' | 'TIERS' | 'COMMUNITY'>('OVERVIEW');

  useEffect(() => {
    const loadArtistData = async () => {
      if (!initialArtist) {
        const profile = await fetchUserProfile(artistId);
        setArtist(profile);
      }
      const albums = await fetchUserAlbums(artistId);
      setProjects(albums);
      setLoading(false);
    };
    loadArtistData();
  }, [artistId, initialArtist]);

  if (loading || !artist) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-theme text-white">
        <div className="w-16 h-16 border-4 border-small-orange border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-black uppercase tracking-widest opacity-40">Entering the Sanctuary...</p>
      </div>
    );
  }

  const membershipConfig = artist.membershipConfig || { isEnabled: false, fee: 0, description: '', tiers: [] };
  const tiers = membershipConfig.tiers || [];

  return (
    <div className="min-h-screen bg-theme text-white overflow-y-auto custom-scrollbar">
      {/* Hero Section */}
      <div className="relative h-[50vh] overflow-hidden">
        <img 
          src={artist.coverArt || 'https://picsum.photos/seed/sanctuary/1920/1080'} 
          className="w-full h-full object-cover opacity-40"
          alt="Sanctuary Cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-theme via-theme/50 to-transparent" />
        
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-32 h-32 rounded-[2.5rem] border-4 border-white/10 overflow-hidden mb-8 shadow-3xl"
          >
            <img src={artist.photoURL || 'https://picsum.photos/seed/artist/200/200'} className="w-full h-full object-cover" alt={artist.displayName} />
          </motion.div>
          <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
            {artist.displayName}'s <span className="text-small-orange">Sanctuary</span>
          </h1>
          <p className="text-white/40 text-sm font-bold uppercase tracking-[0.3em] max-w-2xl">
            A private members-only space for true supporters and collaborators.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 -mt-24 relative z-10 pb-24">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-center gap-8 mb-16 bg-white/5 backdrop-blur-3xl border border-white/10 p-2 rounded-[2.5rem] w-fit mx-auto">
          {[
            { id: 'OVERVIEW', label: 'Overview', icon: Shield },
            { id: 'PROJECTS', label: 'Funding Projects', icon: Target },
            { id: 'TIERS', label: 'Membership Tiers', icon: Star },
            { id: 'COMMUNITY', label: 'Community', icon: MessageSquare }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-8 py-4 rounded-[2rem] flex items-center gap-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id ? 'bg-white text-black shadow-2xl' : 'text-white/40 hover:text-white'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'OVERVIEW' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-12"
            >
              {/* Profile Funding Goal */}
              <div className="lg:col-span-2 space-y-12">
                <section className="bg-white/5 border border-white/10 rounded-[3rem] p-12 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:scale-110 transition-transform">
                    <TrendingUp size={120} />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-4 bg-small-orange/20 rounded-2xl">
                        <Target className="text-small-orange" size={24} />
                      </div>
                      <h2 className="text-2xl font-black uppercase tracking-tight">Profile Funding Goal</h2>
                    </div>
                    
                    <p className="text-white/40 text-sm leading-relaxed mb-10 max-w-xl">
                      Support {artist.displayName}'s overall creative journey. This goal helps fund studio time, equipment, and daily operations.
                    </p>

                    <div className="space-y-6">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-2">Current Funding</p>
                          <p className="text-5xl font-display font-black tracking-tightest">${artist.tipCurrent || 0}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-2">Target Goal</p>
                          <p className="text-2xl font-black tracking-tightest text-white/60">${artist.tipGoal || 5000}</p>
                        </div>
                      </div>
                      <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(((artist.tipCurrent || 0) / (artist.tipGoal || 5000)) * 100, 100)}%` }}
                          className="h-full bg-gradient-to-r from-small-orange to-orange-400"
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/20">
                        <span>{Math.round(((artist.tipCurrent || 0) / (artist.tipGoal || 5000)) * 100)}% Funded</span>
                        <span>{artist.tipGoal ? artist.tipGoal - (artist.tipCurrent || 0) : 5000} Remaining</span>
                      </div>
                    </div>

                    <button className="mt-12 w-full py-6 bg-white text-black rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] hover:scale-[1.02] transition-all shadow-2xl">
                      Support Artist Now
                    </button>
                  </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8">
                    <Users className="text-small-orange mb-6" size={32} />
                    <h3 className="text-xl font-black uppercase tracking-tight mb-2">Member Community</h3>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">
                      Join 1,240 other members in the private sanctuary chat and forums.
                    </p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8">
                    <Lock className="text-small-orange mb-6" size={32} />
                    <h3 className="text-xl font-black uppercase tracking-tight mb-2">Exclusive Content</h3>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">
                      Access 45+ members-only tracks, videos, and behind-the-scenes updates.
                    </p>
                  </div>
                </div>
              </div>

              {/* Sidebar Stats */}
              <div className="space-y-8">
                <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-6">Sanctuary Stats</h3>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Active Members</span>
                      <span className="text-lg font-black">1,240</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Projects Funded</span>
                      <span className="text-lg font-black">12</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Monthly Support</span>
                      <span className="text-lg font-black text-green-400">$4,250</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-small-orange/20 to-transparent border border-small-orange/30 rounded-[2.5rem] p-8">
                  <Sparkles className="text-small-orange mb-6" size={32} />
                  <h3 className="text-xl font-black uppercase tracking-tight mb-2">Top Tier Access</h3>
                  <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest leading-relaxed mb-6">
                    Unlock direct collaboration and private sessions by joining the Executive Producer tier.
                  </p>
                  <button className="w-full py-4 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest">View Tiers</button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'PROJECTS' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              {projects.map(project => (
                <div key={project.id} className="bg-white/5 border border-white/10 rounded-[3rem] overflow-hidden group hover:border-white/20 transition-all">
                  <div className="aspect-video relative">
                    <img src={project.coverImage || 'https://picsum.photos/seed/project/800/450'} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt={project.title} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-6 left-6 right-6">
                      <h3 className="text-2xl font-black uppercase tracking-tight mb-1">{project.title}</h3>
                      <p className="text-[9px] font-bold text-small-orange uppercase tracking-widest">{project.type} Project</p>
                    </div>
                  </div>
                  <div className="p-8">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-8 line-clamp-2 leading-relaxed">
                      {project.description || "Help fund the production of this new creative endeavor."}
                    </p>
                    
                    <div className="space-y-4 mb-8">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-white">${project.donationCurrent || 0}</span>
                        <span className="text-white/20">Goal: ${project.donationGoal || 1000}</span>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-small-orange" 
                          style={{ width: `${Math.min(((project.donationCurrent || 0) / (project.donationGoal || 1000)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    <button className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                      Back This Project
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === 'TIERS' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-8"
            >
              {tiers.map((tier, idx) => (
                <div 
                  key={tier.id} 
                  className={`bg-white/5 border rounded-[3rem] p-12 flex flex-col relative overflow-hidden group ${
                    idx === 1 ? 'border-small-orange/50 scale-105 z-10 bg-small-orange/5' : 'border-white/10'
                  }`}
                >
                  {idx === 1 && (
                    <div className="absolute top-6 right-6 px-4 py-1 bg-small-orange text-white text-[8px] font-black uppercase tracking-widest rounded-full">Most Popular</div>
                  )}
                  <h3 className="text-3xl font-black uppercase tracking-tight mb-2">{tier.name}</h3>
                  <div className="flex items-baseline gap-2 mb-8">
                    <span className="text-5xl font-display font-black tracking-tightest">${tier.price}</span>
                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">/ Month</span>
                  </div>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-10 leading-loose">
                    {tier.description}
                  </p>
                  
                  <div className="space-y-4 mb-12 flex-1">
                    {tier.benefits.map((benefit, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-small-orange rounded-full" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">{benefit}</span>
                      </div>
                    ))}
                  </div>

                  <button className={`w-full py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-widest transition-all ${
                    idx === 1 ? 'bg-small-orange text-white shadow-2xl' : 'bg-white/5 border border-white/10 hover:bg-white/10'
                  }`}>
                    Join This Tier
                  </button>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === 'COMMUNITY' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="bg-white/5 border border-white/10 rounded-[3rem] p-12 text-center">
                <MessageSquare className="mx-auto mb-8 text-small-orange opacity-40" size={64} />
                <h2 className="text-3xl font-black uppercase tracking-tight mb-4">Sanctuary Community</h2>
                <p className="text-white/40 text-sm font-bold uppercase tracking-widest mb-10 max-w-md mx-auto">
                  Connect with other members and the artist in our private community space.
                </p>
                <button className="px-12 py-5 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest shadow-2xl">
                  Enter Private Chat
                </button>
              </div>

              <div className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white/20 px-6">Latest Updates</h3>
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-[2rem] p-8 flex gap-8 items-center">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center shrink-0">
                      <Zap className="text-small-orange" size={24} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[8px] font-black uppercase tracking-widest text-small-orange">Members Only Update</span>
                        <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">2 days ago</span>
                      </div>
                      <h4 className="text-lg font-black uppercase tracking-tight mb-1">New Studio Session Leaked</h4>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate">Check out the raw takes from last night's session in the vault.</p>
                    </div>
                    <ChevronRight className="text-white/20" size={20} />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ArtistMembersArea;
