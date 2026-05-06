import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const NEBULA_IMAGES = [
  'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&q=80&w=2048',
  'https://images.unsplash.com/photo-1465101162946-4377e57745c3?auto=format&fit=crop&q=80&w=2048',
  'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&q=80&w=2048',
  'https://images.unsplash.com/photo-1543722530-d2c3201371e7?auto=format&fit=crop&q=80&w=2048',
  'https://images.unsplash.com/photo-1506318137071-a8e063b4bcc0?auto=format&fit=crop&q=80&w=2048'
];

const NebulaBackground: React.FC = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % NEBULA_IMAGES.length);
    }, 20000); // slower rotation for better depth perception
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[-3] pointer-events-none overflow-hidden" style={{ perspective: '1000px' }}>
      <AnimatePresence mode="popLayout">
        {/* Layer 1: Deep Nebula Base */}
        <motion.div
          key={`base-${index}`}
          initial={{ opacity: 0, scale: 1.2, rotate: -1 }}
          animate={{ opacity: 0.4, scale: 1.1, rotate: 0 }}
          exit={{ opacity: 0, scale: 1, rotate: 1 }}
          transition={{ duration: 8, ease: "linear" }}
          className="absolute inset-0 grayscale-[0.2] contrast-[1.1]"
        >
          <img 
            src={NEBULA_IMAGES[index]} 
            className="w-full h-full object-cover" 
            alt="Nebula depth layer 1"
            referrerPolicy="no-referrer"
          />
        </motion.div>

        {/* Layer 2: Volumetric Gas Clouds (Parallax) */}
        <motion.div
          key={`clouds-${index}`}
          initial={{ opacity: 0, scale: 1.1, x: -30, y: -20 }}
          animate={{ opacity: 0.3, scale: 1.3, x: 30, y: 20 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 15, ease: "easeInOut" }}
          className="absolute inset-0 mix-blend-screen blur-[3px]"
        >
          <img 
            src={NEBULA_IMAGES[(index + 1) % NEBULA_IMAGES.length]} 
            className="w-full h-full object-cover brightness-150" 
            alt="Nebula depth layer 2"
            referrerPolicy="no-referrer"
          />
        </motion.div>

        {/* Layer 3: Particle/Star Overlay */}
        <motion.div
          key={`dust-${index}`}
          initial={{ opacity: 0, scale: 2 }}
          animate={{ opacity: 0.15, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 20, ease: "easeOut" }}
          className="absolute inset-0 mix-blend-overlay contrast-150"
        >
          <img 
            src={NEBULA_IMAGES[(index + 2) % NEBULA_IMAGES.length]} 
            className="w-full h-full object-cover" 
            alt="Nebula depth layer 3"
            referrerPolicy="no-referrer"
          />
        </motion.div>
      </AnimatePresence>

      {/* Atmospheric Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
      <div className="absolute inset-0 bg-radial-gradient from-transparent to-black/60" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(139,92,246,0.1)_0%,_transparent_50%)]" />
    </div>
  );
};

export default NebulaBackground;
