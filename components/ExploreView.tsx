import React from 'react';
import { motion } from 'motion/react';
import { ArchiveVideo } from '../services/archiveContentService';
import { Album } from '../types';
import { Play } from 'lucide-react';

interface ExploreViewProps {
  movies: ArchiveVideo[];
  tvSeries: ArchiveVideo[];
  localContent: Album[];
  onSelect: (item: any) => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({ movies, tvSeries, localContent, onSelect }) => {
  const mixedContent = [...movies, ...tvSeries, ...localContent].sort(() => Math.random() - 0.5).slice(0, 20);
  const trailersAndTeasers = localContent.filter(item => item.tags?.includes('trailer') || item.tags?.includes('teaser') || item.description?.toLowerCase().includes('trailer'));

  // Some mock trailers if none exist
  const displayTrailers = trailersAndTeasers.length > 0 ? trailersAndTeasers : localContent.slice(0, 5);

  return (
    <main className="pt-32 pb-40 px-8 lg:px-16 container mx-auto space-y-20">
      <div className="mb-10">
        <span className="font-bebas text-xs uppercase tracking-[0.4em] text-tertiary mb-3 block">Infinite Discovery</span>
        <h2 className="font-bebas text-6xl md:text-9xl font-black leading-[0.85] uppercase tracking-tighter">
          The <br/>
          <span className="text-primary italic">Explore.</span>
        </h2>
      </div>

      <section>
        <div className="mb-10 flex items-end justify-between">
            <h2 className="text-4xl font-bebas uppercase tracking-tighter leading-none">Mixed Media</h2>
            <button className="text-[10px] font-black tracking-widest uppercase text-white/20 hover:text-white transition-colors">See All</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {mixedContent.map((item, i) => {
            const isArchive = 'identifier' in item;
            const coverImage = isArchive ? `https://archive.org/services/img/${(item as ArchiveVideo).identifier}` : (item as Album).coverImage;
            const title = item.title;
            const typeLabel = isArchive ? (item as ArchiveVideo).mediatype : (item as Album).subType || 'Media';

            return (
              <motion.div 
                key={isArchive ? (item as ArchiveVideo).identifier : item.id}
                whileHover={{ y: -8 }}
                onClick={() => onSelect(item)}
                className="group relative cursor-pointer"
              >
                <div className="aspect-[2/3] rounded-2xl overflow-hidden glass mb-4 relative">
                  <img src={coverImage || 'https://picsum.photos/300/450'} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="text-white" size={32} />
                  </div>
                </div>
                <h4 className="font-black text-sm uppercase tracking-tight truncate">{title}</h4>
                <p className="text-[9px] text-[#00DAF3] font-black uppercase tracking-widest mt-1">{typeLabel}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {displayTrailers.length > 0 && (
        <section>
          <div className="mb-10 flex items-end justify-between">
              <h2 className="text-4xl font-bebas uppercase tracking-tighter leading-none">Trailers & Teasers</h2>
          </div>
          <div className="flex gap-6 overflow-x-auto no-scrollbar mask-fade-edges pb-8">
            {displayTrailers.map((item) => (
              <motion.div 
                key={item.id}
                whileHover={{ y: -8 }}
                onClick={() => onSelect(item)}
                className="group w-64 md:w-80 shrink-0 cursor-pointer"
              >
                <div className="aspect-video rounded-2xl overflow-hidden glass mb-4 relative">
                  <img src={item.coverImage || 'https://picsum.photos/400/225'} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 flex items-center justify-center">
                     <div className="w-12 h-12 rounded-full glass flex items-center justify-center bg-black/40 backdrop-blur-md">
                       <Play className="text-white ml-1" size={16} />
                     </div>
                  </div>
                </div>
                <h4 className="font-black text-sm uppercase tracking-tight truncate">{item.title}</h4>
                <p className="text-[9px] text-small-orange font-black uppercase tracking-widest mt-1">Trailer</p>
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
};
