import React, { useState, useRef, useEffect } from 'react';
import { motion, useSpring, useTransform, useMotionValue } from 'motion/react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

interface ThreeDImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
  containerClassName?: string;
  depth?: number;
  animate?: any;
  transition?: any;
}

const ThreeDImage: React.FC<ThreeDImageProps> = ({ 
  src, 
  alt, 
  className = '', 
  containerClassName = '',
  depth = 20,
  animate,
  transition,
  ...props 
}) => {
  const { isThreeDEnabled } = useGlobalPlayerState();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Motion values for interactivity
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Smooth springs for high-end feel
  const springConfig = { damping: 20, stiffness: 150, mass: 0.5 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [depth, -depth]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-depth, depth]), springConfig);
  
  // Parallax shifts for depth layers
  const tx = useSpring(useTransform(x, [-0.5, 0.5], [-depth / 2, depth / 2]), springConfig);
  const ty = useSpring(useTransform(y, [-0.5, 0.5], [-depth / 2, depth / 2]), springConfig);

  // Sheen transforms - Moved up to avoid hook violation
  const sheenX = useTransform(x, [-0.5, 0.5], ['-100%', '100%']);
  const sheenY = useTransform(y, [-0.5, 0.5], ['-100%', '100%']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !isThreeDEnabled) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Normalize to [-0.5, 0.5]
    x.set(mouseX / width - 0.5);
    y.set(mouseY / height - 0.5);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  if (!src) return null;

  if (!isThreeDEnabled) {
    return (
      <motion.img 
        src={src} 
        alt={alt} 
        className={className} 
        animate={animate}
        transition={transition}
        {...(props as any)} 
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden group/3d cursor-default perspective-1000 ${containerClassName}`}
      style={{ perspective: '1200px' }}
    >
      <motion.div
        animate={animate}
        transition={transition}
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className="relative w-full h-full"
      >
        {/* Deepest Layer: Blurred Background Parallax */}
        <motion.div
          style={{
            x: tx,
            y: ty,
            scale: 1.2,
            translateZ: -50,
          }}
          className="absolute inset-0 opacity-40 blur-2xl saturate-150"
        >
          <img 
            src={src} 
            alt="" 
            className="w-full h-full object-cover" 
            referrerPolicy="no-referrer"
          />
        </motion.div>

        {/* Middle Layer: Main Image with slight swivel */}
        <motion.div
          style={{
            translateZ: 0,
            scale: 1.1,
          }}
          className="relative w-full h-full rounded-inherit overflow-hidden shadow-2xl"
        >
          <img 
            src={src} 
            alt={alt} 
            className={`w-full h-full object-cover ${className}`} 
            {...(props as any)} 
            referrerPolicy="no-referrer"
          />
        </motion.div>

        {/* Top Layer: Dynamic Sheen / Artificial Light */}
        <motion.div
          style={{
            x: sheenX,
            y: sheenY,
            rotate: 45,
            translateZ: 100,
          }}
          className="absolute inset[-50%] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none mix-blend-overlay w-[200%] h-[200%]"
        />

        {/* Atmospheric Border Glow */}
        <div className="absolute inset-0 border border-white/20 rounded-inherit pointer-events-none group-hover/3d:border-white/40 transition-colors" />
      </motion.div>
    </div>
  );
};

export default ThreeDImage;
