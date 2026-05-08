import React, { useRef, useState, useEffect } from 'react';
import { useSpatial } from '../contexts/SpatialContext';

interface SpatialUIRootProps {
  children: React.ReactNode;
  className?: string;
}

const SpatialUIRoot: React.FC<SpatialUIRootProps> = ({ children, className }) => {
  const { isSpatialMode } = useSpatial();
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isSpatialMode) {
      setTilt({ x: 0, y: 0 });
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isSpatialMode) return;
      const { innerWidth, innerHeight } = window;
      // Calculate tilt based on cursor position (-2deg to 2deg)
      const x = ((e.clientY / innerHeight) - 0.5) * -4;
      const y = ((e.clientX / innerWidth) - 0.5) * 4;
      setTilt({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isSpatialMode]);

  return (
    <div 
      ref={containerRef}
      className={`flex-1 flex flex-col w-full relative transition-all duration-700 spatial-root ${isSpatialMode ? 'is-spatial' : ''} ${className}`}
      style={{
        ['--tilt-x' as any]: `${tilt.x}deg`,
        ['--tilt-y' as any]: `${tilt.y}deg`,
      } as React.CSSProperties}
    >
      <div className={`flex-1 flex flex-col w-full ${isSpatialMode ? 'spatial-tilt' : ''}`}>
        {children}
      </div>

      {/* Atmospheric Volumetric Overlays */}
      {isSpatialMode && (
        <div className="fixed inset-0 pointer-events-none z-[190] overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/5 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-purple-500/5 blur-[100px] rounded-full" style={{ animationDelay: '1s' }} />
        </div>
      )}
      
      {/* 3D UI Hint for XR depth */}
      {isSpatialMode && (
        <div className="fixed top-8 right-8 pointer-events-none z-[200] flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 px-4 py-2 bg-cyan-500/10 backdrop-blur-md border border-cyan-400/20 rounded-full">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">XR Spatialization Active</span>
          </div>
          <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest mr-2 text-right">System AI generating depth maps...</p>
        </div>
      )}
    </div>
  );
};

export default SpatialUIRoot;
