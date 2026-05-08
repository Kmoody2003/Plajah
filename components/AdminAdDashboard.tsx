import React, { useState, useEffect } from 'react';
import { AdCampaign, UserProfile, Album, Video, SystemSettingsConfig, StationIDStinger } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Megaphone, Plus, Trash2, Search, Filter, 
  TrendingUp, Users, Target, BarChart3, 
  ArrowLeft, Save, Sparkles, Globe, ShieldCheck,
  Radio, Tv, Play, Settings2, Activity
} from 'lucide-react';
import { 
  fetchAllAdCampaigns, createAdCampaign, deleteAdCampaign, 
  searchUsers, fetchAllPublicAlbums, fetchAllVideos,
  fetchSystemSettingsConfig, updateSystemSettingsConfig
} from '../services/backendService';

interface AdminAdDashboardProps {
  onBack: () => void;
}

const AdminAdDashboard: React.FC<AdminAdDashboardProps> = ({ onBack }) => {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettingsConfig | null>(null);
  const [featuredArtists, setFeaturedArtists] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCampaign, setNewCampaign] = useState<Partial<AdCampaign>>({
    name: '',
    type: 'USER_PROMOTION',
    status: 'ACTIVE',
    frequency: 1,
    probability: 0.5,
    targetInterests: []
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [camps, users, settings] = await Promise.all([
        fetchAllAdCampaigns(),
        searchUsers(''),
        fetchSystemSettingsConfig()
      ]);
      setCampaigns(camps);
      setAllUsers(users);
      setFeaturedArtists(users.filter(u => u.isFeatured));
      setSystemSettings(settings);
    } catch (error) {
      console.error("Failed to load ad data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSettings = async (updates: Partial<SystemSettingsConfig>) => {
    if (!systemSettings) return;
    setIsSaving(true);
    try {
      const newSettings = { ...systemSettings, ...updates };
      await updateSystemSettingsConfig(newSettings);
      setSystemSettings(newSettings);
    } catch (error) {
      console.error("Failed to update settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAdCampaign(newCampaign as AdCampaign);
      setShowCreateModal(false);
      setNewCampaign({
        name: '',
        type: 'USER_PROMOTION',
        status: 'ACTIVE',
        frequency: 1,
        probability: 0.5,
        targetInterests: []
      });
      loadData();
    } catch (error) {
      console.error("Failed to create campaign:", error);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    try {
      await deleteAdCampaign(id);
      loadData();
    } catch (error) {
      console.error("Failed to delete campaign:", error);
    }
  };

  const adInventoryStats = {
    userPromotions: 50,
    partnerContent: 20,
    thirdPartyAds: 30
  };

  return (
    <div className="flex-1 bg-theme text-white p-6 lg:p-12 overflow-y-auto custom-scrollbar pb-40">
      <header className="mb-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-all">
              <ArrowLeft size={20} />
            </button>
            <span className="text-xs font-black uppercase tracking-[0.4em] text-small-orange">Admin Control</span>
          </div>
          <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Ad Platform & Campaigns</h1>
        </div>
        
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-2xl"
        >
          <Plus size={18} /> New Campaign
        </button>
      </header>

      {/* Global Strategy Ratios */}
      {systemSettings && (
        <section className="mb-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3">
              <Globe className="text-blue-500" size={24} /> Global Ad Strategy
            </h2>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40">
              Total: {systemSettings.adRatios.userPromos + systemSettings.adRatios.partners + systemSettings.adRatios.thirdParty}%
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4">User Promotions</p>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={systemSettings.adRatios.userPromos}
                  onChange={(e) => handleUpdateSettings({ adRatios: { ...systemSettings.adRatios, userPromos: parseInt(e.target.value) }})}
                  className="flex-1 accent-blue-500 h-1.5 bg-white/10 rounded-full"
                />
                <span className="text-2xl font-black w-12 text-right">{systemSettings.adRatios.userPromos}%</span>
              </div>
            </div>
            <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4">Platform Partners</p>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={systemSettings.adRatios.partners}
                  onChange={(e) => handleUpdateSettings({ adRatios: { ...systemSettings.adRatios, partners: parseInt(e.target.value) }})}
                  className="flex-1 accent-purple-500 h-1.5 bg-white/10 rounded-full"
                />
                <span className="text-2xl font-black w-12 text-right">{systemSettings.adRatios.partners}%</span>
              </div>
            </div>
            <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4">3rd Party Ads</p>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="0" max="100" 
                  value={systemSettings.adRatios.thirdParty}
                  onChange={(e) => handleUpdateSettings({ adRatios: { ...systemSettings.adRatios, thirdParty: parseInt(e.target.value) }})}
                  className="flex-1 accent-small-orange h-1.5 bg-white/10 rounded-full"
                />
                <span className="text-2xl font-black w-12 text-right">{systemSettings.adRatios.thirdParty}%</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Advanced Logic Config */}
      {systemSettings && (
        <section className="mb-12 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="p-10 bg-white/5 rounded-[3rem] border border-white/5 space-y-8">
            <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
              <Tv className="text-red-500" size={24} /> Live TV & FAST Channel Rules
            </h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between p-6 bg-black/40 rounded-2xl border border-white/5">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest mb-1">Pre-Stream Ads</p>
                  <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Roll ads before live feeds start</p>
                </div>
                <button 
                  onClick={() => handleUpdateSettings({ isLiveStreamAdsEnabledDefault: !systemSettings.isLiveStreamAdsEnabledDefault })}
                  className={`w-12 h-6 rounded-full p-1 transition-all ${systemSettings.isLiveStreamAdsEnabledDefault ? 'bg-green-500' : 'bg-white/10'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${systemSettings.isLiveStreamAdsEnabledDefault ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="p-6 bg-black/40 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-black uppercase tracking-widest">FAST Channel Ad Frequency</p>
                  <span className="text-xs font-black">Every {systemSettings.fastChannelAds.adInterval} Videos</span>
                </div>
                <input 
                  type="range" min="1" max="20" step="1"
                  value={systemSettings.fastChannelAds.adInterval}
                  onChange={(e) => handleUpdateSettings({ fastChannelAds: { ...systemSettings.fastChannelAds, adInterval: parseInt(e.target.value) }})}
                  className="w-full accent-red-500 h-1.5 bg-white/10 rounded-full"
                />
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Max Ad Duration</p>
                  <span className="text-[10px] font-black">{systemSettings.fastChannelAds.maxAdDuration}s</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-10 bg-white/5 rounded-[3rem] border border-white/5 space-y-8">
            <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
              <Radio className="text-purple-500" size={24} /> Radio & Audio Stingers
            </h3>
            <div className="space-y-6">
              <div className="p-6 bg-black/40 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-black uppercase tracking-widest">Ad Insertion Interval</p>
                  <span className="text-xs font-black">Every {systemSettings.radioAdInterval} Tracks</span>
                </div>
                <input 
                  type="range" min="5" max="100" step="5"
                  value={systemSettings.radioAdInterval}
                  onChange={(e) => handleUpdateSettings({ radioAdInterval: parseInt(e.target.value) })}
                  className="w-full accent-purple-500 h-1.5 bg-white/10 rounded-full"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Station ID Stingers</p>
                  <button className="text-[10px] font-black uppercase hover:text-white transition-all">+ Add Stinger</button>
                </div>
                <div className="space-y-2">
                  {systemSettings.stingers.map(stinger => (
                    <div key={stinger.id} className="flex items-center justify-between p-4 bg-black/40 rounded-xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <Play size={12} className="text-purple-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{stinger.name}</span>
                      </div>
                      <span className="text-[10px] font-black text-white/20">{stinger.duration}s</span>
                    </div>
                  ))}
                  {systemSettings.stingers.length === 0 && (
                    <div className="py-8 text-center bg-black/20 rounded-xl border border-dashed border-white/5">
                       <p className="text-[10px] font-black uppercase tracking-widest text-white/10">No Stingers Loaded</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-blue-500/10 rounded-2xl">
              <Target className="text-blue-500" size={24} />
            </div>
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Inventory Allocation</h3>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">User Promotions</span>
              <span className="text-xl font-black text-white">50%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: '50%' }} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Partners</span>
              <span className="text-xl font-black text-white">20%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500" style={{ width: '20%' }} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Third-Party</span>
              <span className="text-xl font-black text-white">30%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-small-orange" style={{ width: '30%' }} />
            </div>
          </div>
        </div>

        <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-green-500/10 rounded-2xl">
              <Users className="text-green-500" size={24} />
            </div>
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Active Reach</h3>
          </div>
          <p className="text-5xl font-display font-black tracking-tightest mb-2">1.2M</p>
          <p className="text-[10px] font-bold text-green-500 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp size={12} /> +12% this week
          </p>
        </div>

        <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-purple-500/10 rounded-2xl">
              <BarChart3 className="text-purple-500" size={24} />
            </div>
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Ad Conversions</h3>
          </div>
          <p className="text-5xl font-display font-black tracking-tightest mb-2">8.4%</p>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Average CTR across platform</p>
        </div>
      </div>

      {/* Campaigns List */}
      <section className="mb-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3">
            <Megaphone className="text-small-orange" size={24} /> Active Campaigns
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {campaigns.map(camp => (
            <div key={camp.id} className="p-6 bg-white/5 rounded-3xl border border-white/5 flex items-center justify-between group hover:bg-white/10 transition-all">
              <div className="flex items-center gap-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  camp.type === 'USER_PROMOTION' ? 'bg-blue-500/20 text-blue-500' :
                  camp.type === 'PARTNER' ? 'bg-purple-500/20 text-purple-500' :
                  'bg-small-orange/20 text-small-orange'
                }`}>
                  <Target size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black uppercase tracking-widest mb-1">{camp.name}</h4>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{camp.type.replace('_', ' ')}</span>
                    <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">{camp.status}</span>
                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Prob: {camp.probability * 100}%</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button className="p-3 bg-white/5 rounded-xl text-white/40 hover:text-white transition-all">
                  <BarChart3 size={18} />
                </button>
                <button 
                  onClick={() => handleDeleteCampaign(camp.id)}
                  className="p-3 bg-white/5 rounded-xl text-white/40 hover:text-red-500 transition-all"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
          {campaigns.length === 0 && (
            <div className="py-20 text-center bg-white/5 rounded-[3rem] border border-dashed border-white/10">
              <Megaphone size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-xs font-black uppercase tracking-widest text-white/20">No active campaigns</p>
            </div>
          )}
        </div>
      </section>

      {/* Featured Artists Management */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-3">
            <Sparkles className="text-small-orange" size={24} /> Featured Creators
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {allUsers.slice(0, 12).map(user => (
            <div key={user.uid} className="bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col items-center gap-4 group">
              <div className="relative w-20 h-20 rounded-full overflow-hidden ring-2 ring-white/5 group-hover:ring-small-orange transition-all">
                <img src={user.photoURL || `https://picsum.photos/seed/${user.uid}/200/200`} className="w-full h-full object-cover" alt="" />
              </div>
              <div className="text-center">
                <h4 className="text-[10px] font-black uppercase tracking-widest truncate w-full mb-2">{user.displayName}</h4>
                <button 
                  className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${
                    user.isFeatured ? 'bg-small-orange text-white' : 'bg-white/10 text-white/40 hover:bg-white/20'
                  }`}
                >
                  {user.isFeatured ? 'Featured' : 'Promote'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Create Campaign Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="max-w-2xl w-full bg-[#0a0a0a] border border-white/10 rounded-[3rem] overflow-hidden shadow-3xl p-12"
            >
              <h2 className="text-3xl font-display font-black tracking-tight uppercase mb-8">Create Ad Campaign</h2>
              <form onSubmit={handleCreateCampaign} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Campaign Name</label>
                  <input 
                    type="text" 
                    required
                    value={newCampaign.name}
                    onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-small-orange transition-all"
                    placeholder="e.g. Summer Artist Spotlight"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Type</label>
                    <select 
                      value={newCampaign.type}
                      onChange={e => setNewCampaign({...newCampaign, type: e.target.value as any})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-small-orange transition-all appearance-none"
                    >
                      <option value="USER_PROMOTION">User Promotion</option>
                      <option value="PARTNER_CONTENT">Partner Content</option>
                      <option value="THIRD_PARTY_AD">Third-Party Ad</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Probability (0-1)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      min="0"
                      max="1"
                      value={newCampaign.probability}
                      onChange={e => setNewCampaign({...newCampaign, probability: parseFloat(e.target.value)})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold outline-none focus:ring-2 ring-small-orange transition-all"
                    />
                  </div>
                </div>
                <div className="flex gap-4 pt-8">
                  <button 
                    type="submit"
                    className="flex-1 py-5 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-all shadow-2xl"
                  >
                    Launch Campaign
                  </button>
                  <button 
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-10 py-5 bg-white/5 text-white/40 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminAdDashboard;
