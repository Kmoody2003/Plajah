import React from 'react';
import { Globe, Users, Star, Home, Briefcase, Lock, SlidersHorizontal } from 'lucide-react';
import type { AudiencePreset } from '../../services/audienceCore';
import { PRESET_LABEL } from '../../services/audienceCore';

// One icon per audience, Facebook-style (globe = public, people = followers, …).
const ICON: Record<AudiencePreset, React.ComponentType<{ size?: number; className?: string }>> = {
  PUBLIC: Globe, FOLLOWERS: Users, CLOSE_FRIENDS: Star, FAMILY: Home, COLLEAGUES: Briefcase, ONLY_ME: Lock, CUSTOM: SlidersHorizontal,
};

export const AudienceIcon: React.FC<{ preset?: AudiencePreset | null; size?: number; className?: string; title?: string }> = ({ preset, size = 12, className, title }) => {
  const p = (preset && ICON[preset] ? preset : 'PUBLIC') as AudiencePreset;
  const Icon = ICON[p];
  return (
    <span title={title || `Shared with: ${PRESET_LABEL[p]}`} aria-label={`Shared with: ${PRESET_LABEL[p]}`} className="inline-flex">
      <Icon size={size} className={className} />
    </span>
  );
};

export default AudienceIcon;
