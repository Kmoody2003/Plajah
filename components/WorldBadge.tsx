import React, { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { IPWorld } from '../types';
import { fetchWorldById } from '../services/backendService';

interface WorldBadgeProps {
  worldId: string;
  contentTitle: string;
  contentType?: string;
  onNavigate?: (worldId: string) => void;
  compact?: boolean;
}

const WorldBadge: React.FC<WorldBadgeProps> = ({
  worldId,
  contentTitle,
  contentType = 'work',
  onNavigate,
  compact = false,
}) => {
  const [world, setWorld] = useState<IPWorld | null>(null);

  useEffect(() => {
    if (!worldId) return;
    fetchWorldById(worldId).then(setWorld).catch(() => {});
  }, [worldId]);

  if (!world) return null;

  const primaryColor = world.themeConfig?.primaryColor || '#ff8c00';

  if (compact) {
    return (
      <button
        onClick={() => onNavigate?.(worldId)}
        disabled={!onNavigate}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all hover:scale-105 disabled:cursor-default"
        style={{
          background: `${primaryColor}18`,
          borderColor: `${primaryColor}44`,
        }}
        title={`Part of the ${world.name} World`}
      >
        {world.coverImage ? (
          <img
            src={world.coverImage}
            alt={world.name}
            className="w-4 h-4 rounded-full object-cover flex-shrink-0 ring-1 ring-primary/30"
          />
        ) : (
          <Globe size={10} style={{ color: primaryColor }} />
        )}
        <span className="text-[8px] font-black uppercase tracking-widest whitespace-nowrap" style={{ color: primaryColor }}>
          {world.name}
        </span>
      </button>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl border flex items-center gap-4 p-3"
      style={{ background: `${primaryColor}0e`, borderColor: `${primaryColor}33` }}
    >
      {/* Cover image strip */}
      {world.coverImage && (
        <div className="absolute inset-0 pointer-events-none">
          <img
            src={world.coverImage}
            alt=""
            className="w-full h-full object-cover opacity-[0.06]"
          />
        </div>
      )}

      {/* World thumbnail + globe icon */}
      <div className="relative flex-shrink-0">
        <div className="w-12 h-12 rounded-xl overflow-hidden border-2" style={{ borderColor: `${primaryColor}55` }}>
          {world.coverImage ? (
            <img src={world.coverImage} alt={world.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: `${primaryColor}22` }}>
              <Globe size={20} style={{ color: primaryColor }} />
            </div>
          )}
        </div>
        <div
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border"
          style={{ background: primaryColor, borderColor: '#000' }}
        >
          <Globe size={10} className="text-white" />
        </div>
      </div>

      {/* Text */}
      <div className="relative flex-1 min-w-0">
        <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-0.5">World IP</p>
        <p className="text-[10px] font-black text-white/70 leading-tight">
          <span className="text-white/40">"{contentTitle}"</span>
          {' '}is part of the{' '}
          <span style={{ color: primaryColor }}>{world.name}</span>
          {' '}World
        </p>
      </div>

      {/* CTA */}
      {onNavigate && (
        <button
          onClick={() => onNavigate(worldId)}
          className="relative flex-shrink-0 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all hover:opacity-80"
          style={{ background: `${primaryColor}33`, color: primaryColor }}
        >
          View World
        </button>
      )}
    </div>
  );
};

export default WorldBadge;
