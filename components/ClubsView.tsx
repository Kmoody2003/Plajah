import React from 'react';
import { motion } from 'motion/react';
import { Users, Shield, Star, MessageSquare, Plus, Search, Globe, Mic } from 'lucide-react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

interface ClubsViewProps {
  onBack: () => void;
}

const ClubsView: React.FC<ClubsViewProps> = ({ onBack }) => {
  const { theme } = useGlobalPlayerState();
  const clubs = [
    { id: '1', name: 'The Archive Elite', members: 1240, description: 'Exclusive access to unreleased masters and early drops.', image: 'https://picsum.photos/seed/elite/800/400', category: 'Music' },
    { id: '2', name: 'Global Creators', members: 8500, description: 'A community for visual artists and sound designers.', image: 'https://picsum.photos/seed/creators/800/400', category: 'Art' },
    { id: '3', name: 'Sound System Culture', members: 3200, description: 'Dedicated to the history and future of heavy bass.', image: 'https://picsum.photos/seed/bass/800/400', category: 'Music' },
    { id: '4', name: 'Cinema Collective', members: 5600, description: 'For those who live and breathe the silver screen.', image: 'https://picsum.photos/seed/cinema/800/400', category: 'Film' },
    { id: '5', name: 'The Book Worms', members: 2100, description: 'Deep dives into the global archive literature.', image: 'https://picsum.photos/seed/books/800/400', category: 'Literature' },
    { id: '6', name: 'Arcade Legends', members: 4300, description: 'High scores and retro gaming discussions.', image: 'https://picsum.photos/seed/arcade/800/400', category: 'Gaming' },
  ];

  return (
    <div className="min-h-screen bg-transparent text-[var(--text-primary)] transition-colors duration-500">
      {/* Hero Banner */}
      <section className="relative h-[50vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img src="https://picsum.photos/seed/community/1920/1080" className="w-full h-full object-cover opacity-40 blur-sm" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-transparent" />
        </div>
        
        <div className="relative z-10 text-center px-6 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
              Clubs
            </h1>
            <p className="text-xl lg:text-2xl opacity-60 font-medium uppercase tracking-widest mb-12">
              Find your tribe in the Global Collective
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 opacity-20" size={20} />
                <input 
                  type="text" 
                  placeholder="Search 10,000+ clubs..." 
                  className="w-full bg-white/5 border border-white/10 rounded-full py-5 pl-16 pr-8 text-sm font-bold outline-none focus:ring-2 ring-white/20 transition-all text-inherit placeholder:opacity-30"
                />
              </div>
              <button className="px-12 py-5 bg-[var(--text-primary)] text-[var(--bg-color)] rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-2xl">
                Create Your Own
              </button>
            </div>
          </motion.div>
        </div>
      </section>

        {/* Top Podcasts Highlight */}
        <section className="mb-24">
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-small-orange/20 flex items-center justify-center text-small-orange">
                <Mic size={24} />
              </div>
              <h2 className="text-3xl font-display font-black uppercase tracking-tight">Top Trending Frequencies</h2>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-20">Direct from Archive</span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            {[
              { id: '1', title: 'The Daily Protocol', artist: 'Nexus News', image: 'https://picsum.photos/seed/pod1/400/400' },
              { id: '2', title: 'Creative Frequencies', artist: 'Design Collective', image: 'https://picsum.photos/seed/pod2/400/400' },
              { id: '3', title: 'Archive Deep Dives', artist: 'The Librarian', image: 'https://picsum.photos/seed/pod3/400/400' },
              { id: '4', title: 'Synth Wave Radio', artist: 'Cyber Beat', image: 'https://picsum.photos/seed/pod4/400/400' },
              { id: '5', title: 'The World Builder', artist: 'Global Media', image: 'https://picsum.photos/seed/pod5/400/400' },
            ].map((pod, i) => (
              <div key={pod.id} className="group cursor-pointer">
                <div className="relative aspect-square rounded-[2rem] overflow-hidden mb-4 border border-white/5 group-hover:border-small-orange/40 transition-all">
                  <img src={pod.image || null} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute top-4 left-4 w-8 h-8 rounded-lg bg-black/40 backdrop-blur-md flex items-center justify-center text-[10px] font-black border border-white/10">
                    {i + 1}
                  </div>
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-widest truncate group-hover:text-small-orange transition-colors">{pod.title}</h4>
                <p className="text-[8px] font-bold opacity-30 uppercase tracking-widest truncate">{pod.artist}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-8 lg:px-16 pb-32">
        {/* Categories */}
        <div className="flex gap-4 overflow-x-auto pb-12 no-scrollbar mb-12">
          {['All Clubs', 'Music', 'Art', 'Film', 'Gaming', 'Literature', 'Tech', 'Lifestyle'].map((cat, i) => (
            <button 
              key={cat}
              className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${i === 0 ? 'bg-small-orange text-white' : 'bg-white/5 opacity-40 hover:bg-white/10 hover:opacity-100'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {clubs.map((club) => (
            <motion.div 
              key={club.id}
              whileHover={{ y: -10 }}
              className="bg-white/5 border border-white/5 rounded-[3rem] overflow-hidden group cursor-pointer hover:bg-white/10 transition-all backdrop-blur-xl"
            >
              <div className="aspect-[16/10] relative">
                <img src={club.image || null} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-color)] via-transparent to-transparent" />
                <div className="absolute top-6 left-6">
                  <span className="px-3 py-1 bg-black/40 backdrop-blur-md rounded text-[8px] font-black uppercase tracking-widest border border-white/10 text-white">
                    {club.category}
                  </span>
                </div>
                <div className="absolute bottom-6 left-8 right-8">
                  <div className="flex items-center gap-2 mb-2">
                    <Users size={12} className="text-small-orange" />
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60 text-white">{club.members.toLocaleString()} Members</span>
                  </div>
                  <h3 className="text-3xl font-display font-black uppercase tracking-tight text-white">{club.name}</h3>
                </div>
              </div>
              <div className="p-10">
                <p className="opacity-40 text-xs font-bold uppercase tracking-widest leading-relaxed mb-10 h-12 line-clamp-2">{club.description}</p>
                <div className="flex items-center justify-between">
                  <button className="px-8 py-3 bg-[var(--text-primary)] text-[var(--bg-color)] rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all">Join Club</button>
                  <div className="flex -space-x-3">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="w-10 h-10 rounded-full border-4 border-[var(--bg-color)] bg-white/10 overflow-hidden">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=clubuser${club.id}${i}`} className="w-full h-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ClubsView;
