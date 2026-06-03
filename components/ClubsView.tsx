import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Shield, Star, MessageSquare, Plus, Search, Globe, Mic, Lock, X, Check, ChevronDown, Crown } from 'lucide-react';
import PlajahPlusBanner from './PlajahPlusBanner';
import { User as FirebaseUser } from 'firebase/auth';
import { Club, ClubJoinProcess, PitchDeck } from '../types';
import { fetchPublicClubs, fetchUserClubs, createClub, seedDemoClubs } from '../services/backendService';
import ClubDetailView from './ClubDetailView';

interface ClubsViewProps {
  onBack: () => void;
  currentUser: FirebaseUser | null;
  onCreatePitchDeck?: (deck: PitchDeck) => void;
}

const CATEGORIES = ['All', 'Music', 'Art', 'Film', 'Gaming', 'Literature', 'Tech', 'Sports', 'Lifestyle', 'Charity'];

const ClubsView: React.FC<ClubsViewProps> = ({ onBack, currentUser, onCreatePitchDeck }) => {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [openInSettings, setOpenInSettings] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<{
    name: string; description: string; category: string; isPrivate: boolean; joinProcess: ClubJoinProcess;
  }>({
    name: '', description: '', category: 'Music', isPrivate: false, joinProcess: 'AUTO'
  });

  const loadClubs = useCallback(async () => {
    setLoading(true);
    try {
      await seedDemoClubs();
      const [pub, mine] = await Promise.all([
        fetchPublicClubs(selectedCategory !== 'All' ? selectedCategory : undefined),
        currentUser ? fetchUserClubs(currentUser.uid) : Promise.resolve([]),
      ]);
      setClubs(pub);
      setMyClubs(mine);
    } catch (e) {
      console.error('loadClubs failed:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, currentUser]);

  useEffect(() => { loadClubs(); }, [loadClubs]);

  const handleCreateClub = async () => {
    if (!createForm.name.trim() || !currentUser) return;
    setCreating(true);
    setCreateError(null);
    try {
      const club = await createClub(createForm);
      if (club) {
        setClubs(c => [club, ...c]);
        setMyClubs(c => [club, ...c]);
        setShowCreateModal(false);
        setOpenInSettings(true);
        setSelectedClub(club);
      }
    } catch (e: any) {
      const msg: string = e?.message || '';
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('insufficient')) {
        setCreateError('Permission denied — run "firebase deploy --only firestore" in your terminal to apply the database rules, then try again.');
      } else if (msg.toLowerCase().includes('auth') || !currentUser) {
        setCreateError('Not signed in. Please sign out and sign back in, then try again.');
      } else {
        setCreateError(`Error: ${msg || 'Unknown error. Check the browser console for details.'}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const filteredClubs = clubs.filter(c =>
    !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (selectedClub) {
    return (
      <ClubDetailView
        club={selectedClub}
        currentUser={currentUser}
        initialTab={openInSettings ? 'SETTINGS' : 'TIMELINE'}
        onBack={() => { setSelectedClub(null); setOpenInSettings(false); }}
        onClubUpdated={updated => {
          setSelectedClub(updated);
          setClubs(cs => cs.map(c => c.id === updated.id ? updated : c));
          setMyClubs(cs => cs.map(c => c.id === updated.id ? updated : c));
        }}
        onCreatePitchDeck={onCreatePitchDeck}
      />
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-[var(--text-primary)]">
      {/* Hero */}
      <section className="relative h-[50vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img src="https://picsum.photos/seed/community/1920/1080" className="w-full h-full object-cover opacity-30 blur-sm" alt="" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/80" />
        </div>
        <div className="relative z-10 text-center px-6 max-w-4xl w-full">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <h1 className="text-6xl md:text-[10rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none mb-6">Clubs</h1>
            <p className="text-lg opacity-60 font-medium uppercase tracking-widest mb-10">Find your tribe in the Global Collective</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 opacity-20" size={18} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search clubs..."
                  className="w-full bg-white/5 border border-white/10 rounded-full py-4 pl-14 pr-6 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all text-inherit placeholder:opacity-30"
                />
              </div>
              {currentUser && (
                <button onClick={() => setShowCreateModal(true)} className="px-10 py-4 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-2xl flex items-center gap-2">
                  <Plus size={14} /> Create Club
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 lg:px-12 pb-32">
        {/* Plajah+ Banner */}
        <div className="mt-10 mb-4">
          <PlajahPlusBanner />
        </div>

        {/* My Clubs */}
        {myClubs.length > 0 && (
          <section className="mb-16 mt-10">
            <h2 className="text-xs font-black uppercase tracking-widest opacity-40 mb-6">My Clubs</h2>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              {myClubs.map(club => (
                <motion.button
                  key={club.id}
                  whileHover={{ scale: 1.05 }}
                  onClick={() => { setOpenInSettings(false); setSelectedClub(club); }}
                  className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-5 py-3 whitespace-nowrap hover:bg-white/10 transition-all shrink-0"
                >
                  {club.iconImage
                    ? <img src={club.iconImage} className="w-8 h-8 rounded-lg object-cover" alt="" />
                    : <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><Users size={14} className="opacity-40" /></div>
                  }
                  <div className="text-left">
                    <p className="text-xs font-black uppercase tracking-wide">{club.name}</p>
                    <p className="text-[8px] opacity-30 font-bold">{club.memberCount} members</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* Categories */}
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-4 mb-8 mt-6">
          {CATEGORIES.map((cat, i) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${selectedCategory === cat ? 'bg-white text-black' : 'bg-white/5 opacity-50 hover:bg-white/10 hover:opacity-100'}`}
            >{cat}</button>
          ))}
        </div>

        {/* Club Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white/5 border border-white/5 rounded-[2.5rem] overflow-hidden animate-pulse">
                <div className="aspect-[16/10] bg-white/5" />
                <div className="p-8 space-y-3">
                  <div className="h-3 bg-white/5 rounded-full w-3/4" />
                  <div className="h-2 bg-white/5 rounded-full w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredClubs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-white/20">
            <Users size={48} className="mb-4 opacity-30" />
            <p className="text-[10px] font-black uppercase tracking-widest">No clubs found</p>
            {currentUser && <button onClick={() => setShowCreateModal(true)} className="mt-6 px-8 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/90 transition-all">Create the First One</button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredClubs.map(club => (
              <motion.div
                key={club.id}
                whileHover={{ y: -8 }}
                onClick={() => { setOpenInSettings(false); setSelectedClub(club); }}
                className="bg-white/5 border border-white/5 rounded-[2.5rem] overflow-hidden group cursor-pointer hover:bg-white/8 transition-all backdrop-blur-xl"
              >
                <div className="aspect-[16/10] relative overflow-hidden">
                  {club.coverImage
                    ? <img src={club.coverImage} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" />
                    : <div className="w-full h-full bg-gradient-to-br from-violet-900/40 to-indigo-900/40 flex items-center justify-center"><Users size={40} className="opacity-20" /></div>
                  }
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute top-5 left-5 flex items-center gap-2">
                    <span className="px-3 py-1 bg-black/50 backdrop-blur-md rounded text-[8px] font-black uppercase tracking-widest border border-white/10 text-white">{club.category}</span>
                    {club.isPrivate && <span className="px-2 py-1 bg-black/50 backdrop-blur-md rounded text-[8px] font-black uppercase tracking-widest border border-white/10 text-white flex items-center gap-1"><Lock size={7} /> Private</span>}
                    {club.isDemo && !club.creatorId && <span className="px-2 py-1 bg-amber-500/80 backdrop-blur-md rounded text-[8px] font-black uppercase tracking-widest text-black flex items-center gap-1"><Crown size={7} /> Claimable</span>}
                  </div>
                  <div className="absolute bottom-5 left-6 right-6">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Users size={10} className="text-white/40" />
                      <span className="text-[9px] font-black uppercase tracking-widest opacity-50 text-white">{club.memberCount.toLocaleString()} Members</span>
                    </div>
                    <h3 className="text-2xl font-black uppercase tracking-tight text-white leading-tight">{club.name}</h3>
                  </div>
                </div>
                <div className="p-8">
                  <p className="opacity-40 text-xs font-bold uppercase tracking-widest leading-relaxed mb-8 line-clamp-2">{club.description}</p>
                  <div className="flex items-center justify-between">
                    <span className={`px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${club.isDemo && !club.creatorId ? 'bg-amber-500 text-black group-hover:bg-amber-400' : 'bg-white text-black group-hover:bg-white/90'}`}>
                      {club.isDemo && !club.creatorId ? 'Claim as Founder' : club.joinProcess === 'AUTO' ? 'Join' : 'Request to Join'}
                    </span>
                    <div className="flex -space-x-2">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-black/50 bg-white/10 overflow-hidden">
                          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${club.id}${i}`} className="w-full h-full" alt="" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Club Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }} className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black uppercase tracking-tight">Create a Club</h2>
                <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-all"><X size={18} /></button>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest opacity-40 block mb-2">Club Name *</label>
                  <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Enter club name..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/20 transition-all" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest opacity-40 block mb-2">Description</label>
                  <textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="What is this club about?" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/20 transition-all resize-none h-24" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest opacity-40 block mb-2">Category</label>
                  <select value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/20 transition-all">
                    {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide">Private Club</p>
                    <p className="text-[9px] opacity-30">Only visible to members</p>
                  </div>
                  <button onClick={() => setCreateForm(f => ({ ...f, isPrivate: !f.isPrivate }))}
                    className={`w-10 h-5 rounded-full transition-colors relative ${createForm.isPrivate ? 'bg-white' : 'bg-white/10'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-transform ${createForm.isPrivate ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest opacity-40 block mb-2">Join Process</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['AUTO', 'REVIEW'] as const).map(p => (
                      <button key={p} onClick={() => setCreateForm(f => ({ ...f, joinProcess: p }))}
                        className={`py-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${createForm.joinProcess === p ? 'border-white bg-white/10 text-white' : 'border-white/10 text-white/30 hover:border-white/20'}`}>
                        {p === 'AUTO' ? 'Open Join' : 'Admin Review'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {createError && (
                <div className="mt-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-[10px] font-bold text-red-400">
                  {createError}
                </div>
              )}
              <div className="flex gap-3 mt-4">
                <button onClick={() => { setShowCreateModal(false); setCreateError(null); }} className="flex-1 py-3 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">Cancel</button>
                <button onClick={handleCreateClub} disabled={creating || !createForm.name.trim()} className="flex-1 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest disabled:opacity-50 hover:bg-white/90 transition-all flex items-center justify-center gap-2">
                  {creating ? <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : <Check size={12} />}
                  Create Club
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ClubsView;
