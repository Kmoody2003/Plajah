import React from 'react';
import { motion } from 'motion/react';
import { ArchiveVideo } from '../services/archiveContentService';
import { Album } from '../types';
import { Play } from 'lucide-react';

interface MoviesSpecificViewProps {
  movies: ArchiveVideo[];
  localContent: Album[];
  onSelect: (item: any) => void;
}

export const MoviesSpecificView: React.FC<MoviesSpecificViewProps> = ({ movies, localContent, onSelect }) => {
  const localMovies = localContent.filter(c => c.subType === 'MOVIE' || c.tags?.includes('movie'));
  const allMovies = [...localMovies, ...movies];

  return (
    <main className="pt-32 pb-40 px-8 lg:px-16 container mx-auto space-y-20">
      <div className="mb-10">
        <span className="font-bebas text-xs uppercase tracking-[0.4em] text-tertiary mb-3 block">Cinematic Archives</span>
        <h2 className="font-bebas text-6xl md:text-9xl font-black leading-[0.85] uppercase tracking-tighter">
          All <br/>
          <span className="text-primary italic">Movies.</span>
        </h2>
      </div>

      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {allMovies.map((item, i) => {
            const isArchive = 'identifier' in item;
            const coverImage = isArchive ? `https://archive.org/services/img/${(item as ArchiveVideo).identifier}` : (item as Album).coverImage;
            const title = item.title;

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
                <p className="text-[9px] text-[#00DAF3] font-black uppercase tracking-widest mt-1">Movie</p>
              </motion.div>
            );
          })}
        </div>
      </section>
    </main>
  );
};
