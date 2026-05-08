import React from 'react';
import { motion } from 'motion/react';

interface CharacterCardProps {
  name: string;
  role: string;
  bio: string;
  imageUrl: string;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ name, role, bio, imageUrl }) => {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="glass rounded-2xl p-6 border border-white/10 flex gap-6 items-center shadow-lg"
    >
      <img src={imageUrl || null} alt={name} className="w-24 h-24 rounded-full object-cover border-2 border-primary/40" />
      <div>
        <h4 className="font-bold text-lg uppercase tracking-wider text-white">{name}</h4>
        <p className="text-secondary font-black text-[10px] uppercase tracking-widest mt-1">{role}</p>
        <p className="text-white/60 text-sm mt-3 leading-relaxed">{bio}</p>
      </div>
    </motion.div>
  );
};

export default CharacterCard;
