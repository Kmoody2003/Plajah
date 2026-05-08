import React from 'react';
import { motion } from 'motion/react';
import { Heart, Globe, Users, TrendingUp, Shield, ArrowRight, DollarSign } from 'lucide-react';

interface CharityViewProps {
  onBack: () => void;
}

const CharityView: React.FC<CharityViewProps> = ({ onBack }) => {
  const campaigns = [
    { id: '1', title: 'Global Arts Fund', goal: 50000, raised: 32450, description: 'Supporting independent creators in developing nations.', image: 'https://picsum.photos/seed/arts/800/400', category: 'Arts' },
    { id: '2', title: 'Clean Water Initiative', goal: 100000, raised: 89000, description: 'Building sustainable water systems for rural communities.', image: 'https://picsum.photos/seed/water/800/400', category: 'Environment' },
    { id: '3', title: 'Music for All', goal: 25000, raised: 12000, description: 'Providing instruments and lessons to underprivileged youth.', image: 'https://picsum.photos/seed/music/800/400', category: 'Education' },
    { id: '4', title: 'Tech Literacy Program', goal: 75000, raised: 45000, description: 'Bridging the digital divide with hardware and training.', image: 'https://picsum.photos/seed/tech/800/400', category: 'Education' },
  ];

  return (
    <div className="flex-1 bg-transparent text-white overflow-y-auto">
      {/* Hero Section */}
      <section className="relative h-[60vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img src="https://picsum.photos/seed/charity/1920/1080" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-r from-theme via-theme/80 to-transparent" />
        </div>
        
        <div className="relative z-10 px-8 lg:px-24 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="text-small-orange text-[10px] font-black uppercase tracking-widest mb-4 block">Global Impact</span>
            <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
              Charity
            </h1>
            <p className="text-xl lg:text-2xl text-white/60 font-medium leading-relaxed mb-12">
              Every contribution fuels the Global Archive ecosystem. Support creators, communities, and causes that matter.
            </p>
            <div className="flex items-center gap-12">
              <div>
                <p className="text-4xl font-display font-black text-white">$1.2M+</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Total Raised</p>
              </div>
              <div>
                <p className="text-4xl font-display font-black text-white">450+</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Projects Funded</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Campaigns Grid */}
      <div className="max-w-7xl mx-auto px-8 lg:px-16 -mt-24 relative z-20 pb-32">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {campaigns.map((campaign) => {
            const progress = (campaign.raised / campaign.goal) * 100;
            return (
              <motion.div 
                key={campaign.id}
                whileHover={{ scale: 1.02 }}
                className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-[3rem] overflow-hidden group"
              >
                <div className="aspect-video relative">
                  <img src={campaign.image || null} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-theme to-transparent" />
                  <div className="absolute top-6 right-6">
                    <span className="px-4 py-2 bg-black/60 backdrop-blur-md rounded-full text-[8px] font-black uppercase tracking-widest border border-white/10">
                      {campaign.category}
                    </span>
                  </div>
                </div>
                
                <div className="p-12">
                  <h3 className="text-3xl font-display font-black uppercase tracking-tight mb-4">{campaign.title}</h3>
                  <p className="text-white/40 text-xs font-bold uppercase tracking-widest leading-relaxed mb-10 h-12 line-clamp-2">
                    {campaign.description}
                  </p>
                  
                  <div className="space-y-4 mb-10">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                      <span className="text-small-orange">${campaign.raised.toLocaleString()} raised</span>
                      <span className="text-white/40">Goal: ${campaign.goal.toLocaleString()}</span>
                    </div>
                    <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        whileInView={{ width: `${progress}%` }}
                        transition={{ duration: 1, delay: 0.2 }}
                        className="h-full bg-gradient-to-r from-small-orange to-[#FFD700] shadow-[0_0_15px_rgba(255,140,0,0.5)]"
                      />
                    </div>
                  </div>
                  
                  <button className="w-full py-5 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all shadow-2xl">
                    Gifts & tips
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CharityView;
