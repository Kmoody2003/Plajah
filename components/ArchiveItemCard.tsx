import React, { memo } from 'react';
import { Play, Globe, Check, Share2, Trash2 } from 'lucide-react';
import { useSpatial } from '../contexts/SpatialContext';
import SpatialImage from './SpatialImage';
import { Album } from '../types';

interface ArchiveItemCardProps {
  album: Album;
  theme: string;
  user: any;
  copiedId: string | null;
  handleSelectItem: (item: Album) => void;
  handleShareAlbum: (e: React.MouseEvent, id: string) => void;
  handleDeleteAlbum: (id: string) => void;
  handlePurchase: (item: any, isAlbum: boolean) => void;
}

const ArchiveItemCard: React.FC<ArchiveItemCardProps> = memo(({ 
  album, theme, user, copiedId, 
  handleSelectItem, handleShareAlbum, handleDeleteAlbum, handlePurchase 
}) => {
  const { isSpatialMode } = useSpatial();

  return (
    <div 
      onClick={() => handleSelectItem(album)} 
      tabIndex={0}
      className={`group cursor-pointer focus:outline-none transition-all ${theme === 'BIG_SCREEN' ? 'p-8 bg-white/5 rounded-[3rem]' : ''}`}
    >
      <div className={`relative aspect-square rounded-[2.5rem] overflow-hidden mb-6 shadow-2xl ring-1 ring-white/5 bg-white/5 ${theme === 'BIG_SCREEN' ? 'scale-105' : ''}`}>
        <SpatialImage url={album.coverImage} is3D={isSpatialMode} />
        
        {/* Play Overlay - Only show if not 3D or use a floating version in 3D */}
        {!isSpatialMode && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center backdrop-blur-sm">
             <div className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center shadow-2xl scale-75 group-hover:scale-100 transition-transform">
               <Play fill="black" size={32} className="ml-1" />
             </div>
          </div>
        )}

        {album.isGlobalArchive && (
          <div className="absolute top-6 left-6 px-3 py-1.5 bg-blue-500/80 backdrop-blur-md rounded-xl flex items-center gap-2 shadow-xl border border-blue-400/30 z-10">
            <Globe size={12} className="text-white" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Global</span>
          </div>
        )}

        <div className="absolute top-6 right-6 flex gap-2 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all z-10">
           <button onClick={(e) => handleShareAlbum(e, album.id)} title="Copy Public URL" className="p-4 bg-black/60 rounded-full text-white/40 hover:text-white backdrop-blur-md transition-all hover:scale-110">
            {copiedId === album.id ? <Check size={18} className="text-green-500" /> : <Share2 size={18} />}
          </button>
          {user?.uid === album.ownerId && (
            <button onClick={(e) => { e.stopPropagation(); handleDeleteAlbum(album.id); }} className="p-4 bg-black/60 rounded-full text-white/40 hover:text-red-500 backdrop-blur-md transition-all hover:scale-110">
              <Trash2 size={18} />
            </button>
          )}
        </div>

        <div className="absolute bottom-6 left-6 right-6 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all z-10">
          <div className="mb-3 p-3 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 text-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-white">Free to Play</p>
            <p className="text-[7px] font-bold text-white/40 uppercase tracking-widest">Purchase is optional to show support</p>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); handlePurchase(album, true); }}
            className="w-full py-4 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl hover:bg-small-orange hover:text-white transition-all"
          >
            Purchase — ${album.price || '9.99'}
          </button>
        </div>
      </div>
      <div className="px-2">
        <div className="flex items-center justify-between mb-1">
          <h3 className={`font-display font-black uppercase tracking-tight truncate flex-1 ${theme === 'BIG_SCREEN' ? 'text-4xl' : 'text-2xl'} ${isSpatialMode ? 'text-cyan-50' : 'text-white'}`}>{album.title}</h3>
          <span className={`font-black uppercase tracking-widest text-white/20 bg-white/5 px-2 py-1 rounded-md ${theme === 'BIG_SCREEN' ? 'text-sm' : 'text-[9px]'}`}>{album.genre || 'General'}</span>
        </div>
        <p className={`text-small-orange font-black uppercase tracking-widest truncate opacity-60 ${theme === 'BIG_SCREEN' ? 'text-lg' : 'text-[10px]'}`}>{album.artist}</p>
      </div>
    </div>
  );
});

export default ArchiveItemCard;
