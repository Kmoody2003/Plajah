import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

interface CharacterCardProps {
  name: string;
  role: string;
  bio: string;
  imageUrl: string;
  onClick?: () => void;
  accentColor?: string;
  tags?: string[];
  compact?: boolean;
}

const CharacterCard: React.FC<CharacterCardProps> = ({
  name, role, bio, imageUrl, onClick, accentColor, tags, compact,
}) => {
  const Tag = onClick ? motion.button : motion.div;
  return (
    <Tag
      whileHover={{ y: -5, scale: 1.01 }}
      whileTap={onClick ? { scale: 0.97 } : undefined}
      onClick={onClick}
      className={`glass rounded-2xl border border-white/10 shadow-lg text-left w-full transition-all ${onClick ? 'cursor-pointer hover:border-white/25 hover:shadow-xl' : ''} ${compact ? 'p-4' : 'p-6'}`}
    >
      <div className="flex gap-4 items-center">
        <div className="relative shrink-0">
          <img
            src={imageUrl || undefined}
            alt={name}
            className={`rounded-full object-cover border-2 ${compact ? 'w-14 h-14' : 'w-24 h-24'}`}
            style={{ borderColor: accentColor ? `${accentColor}60` : 'rgba(255,255,255,0.1)' }}
          />
          {accentColor && (
            <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 16px ${accentColor}40` }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={`font-bold uppercase tracking-wider text-white ${compact ? 'text-sm' : 'text-lg'}`}>{name}</h4>
          <p className="text-secondary font-black text-[10px] uppercase tracking-widest mt-0.5" style={accentColor ? { color: accentColor } : {}}>{role}</p>
          <p className={`text-white/60 leading-relaxed mt-2 line-clamp-2 ${compact ? 'text-xs' : 'text-sm'}`}>{bio}</p>
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.slice(0, 3).map(t => (
                <span key={t} className="px-1.5 py-0.5 bg-white/5 border border-white/5 rounded-full text-[7px] font-black uppercase tracking-widest text-white/25">#{t}</span>
              ))}
            </div>
          )}
        </div>
        {onClick && (
          <ChevronRight size={14} className="text-white/20 shrink-0 group-hover:text-white/50 transition-colors" />
        )}
      </div>
    </Tag>
  );
};

export default CharacterCard;
