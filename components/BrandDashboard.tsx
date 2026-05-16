import React, { useState, useEffect } from 'react';
import { BrandAccount, UserProfile } from '../types';
import { fetchBrandAccounts, createBrandAccount, addBrandManager, fetchUserProfileByEmail } from '../services/backendService';
import { Building2, Plus, Users, Settings, Video, ArrowLeft, Globe, Shield, Mail, Trash2, X, Check, Layout } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BrandDashboardProps {
  user: any;
  onBack: () => void;
}

const BrandDashboard: React.FC<BrandDashboardProps> = ({ user, onBack }) => {
  const [brands, setBrands] = useState<BrandAccount[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newBrand, setNewBrand] = useState({ name: '', description: '' });
  const [selectedBrand, setSelectedBrand] = useState<BrandAccount | null>(null);
  const [managerEmail, setManagerEmail] = useState('');
  const [isAddingManager, setIsAddingManager] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBrands();
  }, [user.uid]);

  const loadBrands = async () => {
    setLoading(true);
    const fetched = await fetchBrandAccounts();
    setBrands(fetched);
    setLoading(false);
  };

  const handleCreateBrand = async () => {
    if (!newBrand.name.trim()) return;
    await createBrandAccount(newBrand.name);
    setNewBrand({ name: '', description: '' });
    setIsCreating(false);
    loadBrands();
  };

  const handleAddManager = async () => {
    if (!selectedBrand || !managerEmail.trim()) return;
    setIsAddingManager(true);
    try {
      await addBrandManager(selectedBrand.id, managerEmail);
      setManagerEmail('');
      loadBrands();
      // Refresh selected brand
      const updated = brands.find(b => b.id === selectedBrand.id);
      if (updated) setSelectedBrand(updated);
    } catch (err) {
      alert('Failed to add manager. Make sure the user exists.');
    } finally {
      setIsAddingManager(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-white p-8 lg:p-12">
      <div className="max-w-7xl mx-auto">
        <button 
          onClick={onBack}
          className="flex items-center gap-3 text-white/30 hover:text-white mb-12 transition-all group"
        >
          <div className="p-2 bg-white/5 rounded-xl group-hover:bg-white/10 transition-all">
            <ArrowLeft size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Back to Dashboard</span>
        </button>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-16">
          <div>
            <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Brand Hub</h1>
            <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Manage your organizations, artists, and global assets.</p>
          </div>
          <button 
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-3 px-10 py-5 bg-white text-black rounded-full font-black uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-2xl"
          >
            <Plus size={20} />
            Initialize Brand
          </button>
        </div>

        <AnimatePresence>
          {isCreating && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white/5 border border-white/10 rounded-[3rem] p-12 mb-16 shadow-3xl"
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-3xl font-black uppercase tracking-tight">Create Brand Account</h2>
                <button onClick={() => setIsCreating(false)} className="p-4 bg-white/5 rounded-full text-white/40 hover:text-white transition-all">
                  <X size={24} />
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Brand Name</label>
                    <input 
                      type="text"
                      value={newBrand.name}
                      onChange={(e) => setNewBrand({ ...newBrand, name: e.target.value })}
                      placeholder="e.g. Plajah Records"
                      className="w-full bg-black/50 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 ring-small-orange/50 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 ml-2">Description</label>
                    <textarea 
                      value={newBrand.description}
                      onChange={(e) => setNewBrand({ ...newBrand, description: e.target.value })}
                      placeholder="What is this brand about?"
                      rows={3}
                      className="w-full bg-black/50 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 ring-small-orange/50 transition-all resize-none"
                    />
                  </div>
                </div>
                <div className="bg-white/5 rounded-[2rem] border border-dashed border-white/10 flex flex-col items-center justify-center p-8 text-center">
                  <Building2 size={48} className="text-white/20 mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Logo & Visuals can be added after initialization</p>
                </div>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={handleCreateBrand}
                  className="px-12 py-5 bg-small-orange text-white rounded-full font-black uppercase tracking-widest text-xs hover:bg-opacity-80 transition-all shadow-xl"
                >
                  Confirm Initialization
                </button>
                <button 
                  onClick={() => setIsCreating(false)}
                  className="px-12 py-5 bg-white/5 text-white/40 rounded-full font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-12 h-12 border-4 border-small-orange border-t-transparent rounded-full animate-spin mb-6" />
            <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Syncing Brand Data...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {brands.map(brand => (
              <motion.div 
                layout
                key={brand.id} 
                className={`bg-white/5 border rounded-[3rem] p-10 transition-all group relative overflow-hidden ${
                  selectedBrand?.id === brand.id ? 'border-small-orange ring-1 ring-small-orange/50' : 'border-white/10 hover:border-white/20'
                }`}
              >
                <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform">
                  <Building2 size={100} />
                </div>

                <div className="relative z-10">
                  <div className="flex items-center gap-6 mb-10">
                    <div className="w-16 h-16 bg-gradient-to-br from-[#6B0099] to-[#FF8C00] rounded-2xl flex items-center justify-center shadow-2xl">
                      <Building2 size={32} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-tight mb-1">{brand.name}</h3>
                      <p className="text-[9px] font-bold text-small-orange uppercase tracking-[0.2em]">Verified Brand</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-10">
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">Managers</p>
                      <p className="text-xl font-black">{brand.managers?.length || 0}</p>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">Artists</p>
                      <p className="text-xl font-black">{(brand as any).managedArtistIds?.length || 0}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => setSelectedBrand(selectedBrand?.id === brand.id ? null : brand)}
                      className="w-full py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
                    >
                      <Settings size={16} /> {selectedBrand?.id === brand.id ? 'Close Settings' : 'Manage Brand'}
                    </button>
                    <button className="w-full py-4 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-3">
                      <Layout size={16} /> Brand Page
                    </button>
                  </div>
                </div>

                {/* Expanded Management View */}
                <AnimatePresence>
                  {selectedBrand?.id === brand.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-8 pt-8 border-t border-white/10 space-y-8 relative z-10"
                    >
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                          <Shield size={12} /> Access Control
                        </h4>
                        <div className="space-y-3 mb-6">
                          {brand.managers.map((mId, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                              <div className="flex items-center gap-3">
                                <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-[8px] font-black">M</div>
                                <span className="text-[9px] font-bold text-white/60 truncate max-w-[120px]">{mId}</span>
                              </div>
                              {mId !== brand.adminId && (
                                <button className="text-red-500/40 hover:text-red-500 transition-colors">
                                  <Trash2 size={12} />
                                </button>
                              )}
                              {mId === brand.adminId && (
                                <span className="text-[7px] font-black uppercase tracking-widest text-small-orange">Admin</span>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={12} />
                            <input 
                              type="email"
                              placeholder="Manager Email"
                              value={managerEmail}
                              onChange={(e) => setManagerEmail(e.target.value)}
                              className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-[10px] font-bold outline-none focus:border-small-orange transition-all"
                            />
                          </div>
                          <button 
                            onClick={handleAddManager}
                            disabled={isAddingManager}
                            className="px-4 bg-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-white/20 transition-all disabled:opacity-30"
                          >
                            {isAddingManager ? '...' : 'Add'}
                          </button>
                        </div>
                      </div>

                      <div className="pt-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                          <Globe size={12} /> Brand Visibility
                        </h4>
                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                          <span className="text-[9px] font-bold uppercase tracking-widest">Public Brand Page</span>
                          <div className="w-10 h-5 bg-small-orange rounded-full relative">
                            <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
            {brands.length === 0 && !isCreating && (
              <div className="col-span-full text-center py-32 bg-white/5 rounded-[3rem] border border-dashed border-white/10">
                <Building2 size={64} className="mx-auto mb-6 opacity-20" />
                <p className="text-xs font-black uppercase tracking-widest text-white/20">No brand accounts found. Initialize one to start managing.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrandDashboard;
