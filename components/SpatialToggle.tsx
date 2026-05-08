import React from 'react';
import { Box, Sparkles } from 'lucide-react';
import { useSpatial } from '../contexts/SpatialContext';
import { motion } from 'motion/react';

interface SpatialToggleProps {
  collapsed?: boolean;
}

const SpatialToggle: React.FC<SpatialToggleProps> = ({ collapsed }) => {
  const { isSpatialMode, toggleSpatialMode } = useSpatial();

  return (
    <button 
      onClick={toggleSpatialMode}
      className={`w-full flex items-center transition-all group overflow-hidden relative ${
        collapsed ? 'justify-center p-3 rounded-2xl' : 'gap-5 px-6 py-5 rounded-[2rem]'
      } ${
        isSpatialMode 
          ? 'bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border-cyan-400/30 text-cyan-400' 
          : 'text-primary/40 hover:text-primary hover:bg-white/5 border-transparent'
      } border shadow-lg`}
    >
      {isSpatialMode && (
        <motion.div 
          layoutId="spatial-glow"
          className="absolute inset-0 bg-cyan-400/5 blur-xl pointer-events-none"
          animate={{ opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
      
      <div className="relative flex items-center justify-center min-w-[22px] shrink-0">
        <Box size={22} className={`${isSpatialMode ? 'text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'text-primary/20 group-hover:text-primary'}`} />
        {isSpatialMode && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1"
          >
            <Sparkles size={10} className="text-cyan-300" />
          </motion.div>
        )}
      </div>

      {!collapsed && (
        <div className={`flex flex-col items-start leading-tight ${collapsed ? 'hidden' : 'block'}`}>
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">3D Mode</span>
          <span className="text-[8px] font-bold opacity-40 uppercase tracking-widest">{isSpatialMode ? 'Enabled (XR Active)' : '2D Standard'}</span>
        </div>
      )}
    </button>
  );
};

export default SpatialToggle;
