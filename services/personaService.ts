/**
 * personaService.ts — Plajah Contextual Persona & Organization Account Engine.
 *
 * Allows users to seamlessly switch between personal, business, academia, elevate,
 * and creative contexts on mobile and desktop. Each persona adapts:
 * - The primary 5 bottom navigation tabs
 * - Ambient halo brand colors
 * - Scoped social feeds & workspace content
 * - Enrolled role badges and custom organization presets
 */

import {
  Home, Music2, Video as VideoIcon, MessageSquare, Rss,
  Store, ShoppingBag, BarChart3, GraduationCap, ClipboardList,
  FlaskConical, Sparkles, BookOpen, ShieldCheck, Users,
  Heart, Flame, Compass, Film, FileText, Settings, Radio
} from 'lucide-react';

export type PersonaKey = 'personal' | 'business' | 'academic' | 'elevate' | 'creative';

export interface PersonaTabDef {
  id: string;
  label: string;
  icon: any;
  badge?: string;
}

export interface PersonaConfig {
  id: PersonaKey;
  name: string;
  role: string;
  orgName: string;
  badge: string;
  brandColor: string;
  haloClass: string;
  gradient: string;
  defaultView: string;
  avatarUrl?: string;
  notificationCount?: number;
  tabs: PersonaTabDef[];
}

export const PERSONA_STORAGE_KEY = 'plajah_active_persona_v1';
export const PERSONA_CUSTOM_PRESETS_KEY = 'plajah_persona_custom_presets_v1';

export const DEFAULT_PERSONAS: Record<PersonaKey, PersonaConfig> = {
  personal: {
    id: 'personal',
    name: 'Personal Account',
    role: 'Creator / Listener',
    orgName: 'Plajah Creative Hub',
    badge: 'Personal',
    brandColor: '#A855F7',
    haloClass: 'shadow-[0_-4px_24px_rgba(168,85,247,0.22)] border-t border-purple-500/30',
    gradient: 'linear-gradient(135deg, #6B0099 0%, #D40055 50%, #FF8C00 100%)',
    defaultView: 'DASHBOARD',
    notificationCount: 2,
    tabs: [
      { id: 'DASHBOARD', label: 'Home', icon: Home },
      { id: 'MUSIC', label: 'Chora', icon: Music2 },
      { id: 'VIDEOS', label: 'Reello', icon: VideoIcon },
      { id: 'CHAT', label: 'Chat', icon: MessageSquare },
      { id: 'FEED', label: 'Social', icon: Rss },
    ],
  },
  business: {
    id: 'business',
    name: 'Business & Storefront',
    role: 'Storefront Operator',
    orgName: 'Registered Business',
    badge: 'Business',
    brandColor: '#10B981',
    haloClass: 'shadow-[0_-4px_24px_rgba(16,185,129,0.25)] border-t border-emerald-500/30',
    gradient: 'linear-gradient(135deg, #059669 0%, #10B981 60%, #34D399 100%)',
    defaultView: 'BUSINESS',
    notificationCount: 5,
    tabs: [
      { id: 'BUSINESS', label: 'Store', icon: Store },
      { id: 'STORE', label: 'Merch', icon: ShoppingBag },
      { id: 'CONTENT_HQ', label: 'Metrics', icon: BarChart3 },
      { id: 'CHAT', label: 'Staff', icon: MessageSquare },
      { id: 'FEED', label: 'Feed', icon: Rss },
    ],
  },
  academic: {
    id: 'academic',
    name: 'Academia & Campus',
    role: 'Student / Scholar',
    orgName: 'University & Edurail',
    badge: 'Academia',
    brandColor: '#06B6D4',
    haloClass: 'shadow-[0_-4px_24px_rgba(6,182,212,0.25)] border-t border-cyan-500/30',
    gradient: 'linear-gradient(135deg, #0891B2 0%, #06B6D4 60%, #67E8F9 100%)',
    defaultView: 'ACADEMIA_HOME',
    notificationCount: 1,
    tabs: [
      { id: 'ACADEMIA_HOME', label: 'Today', icon: GraduationCap },
      { id: 'CLASSROOMS', label: 'Classes', icon: BookOpen },
      { id: 'PLAJAH_LABS', label: 'Labs', icon: FlaskConical },
      { id: 'CHAT', label: 'Campus', icon: MessageSquare },
      { id: 'ACADEMIA_SKY', label: 'Sky', icon: Sparkles },
    ],
  },
  elevate: {
    id: 'elevate',
    name: 'Elevate & Faith',
    role: 'Community Member',
    orgName: 'Sanctuary & Ambo',
    badge: 'Elevate',
    brandColor: '#F59E0B',
    haloClass: 'shadow-[0_-4px_24px_rgba(245,158,11,0.25)] border-t border-amber-500/30',
    gradient: 'linear-gradient(135deg, #D97706 0%, #F59E0B 60%, #FDE68A 100%)',
    defaultView: 'ELEVATE',
    notificationCount: 0,
    tabs: [
      { id: 'ELEVATE', label: 'Elevate', icon: Heart },
      { id: 'LECTIO', label: 'Lectio', icon: BookOpen },
      { id: 'AMBO_HOME', label: 'Ambo', icon: Flame },
      { id: 'CHAT', label: 'Prayer', icon: MessageSquare },
      { id: 'FEED', label: 'Praise', icon: Sparkles },
    ],
  },
  creative: {
    id: 'creative',
    name: 'Creative Production',
    role: 'Lead Producer',
    orgName: 'Studio Production Suite',
    badge: 'Creative',
    brandColor: '#EC4899',
    haloClass: 'shadow-[0_-4px_24px_rgba(236,72,153,0.25)] border-t border-pink-500/30',
    gradient: 'linear-gradient(135deg, #BE185D 0%, #EC4899 60%, #F472B6 100%)',
    defaultView: 'CREATOR_HUB',
    notificationCount: 3,
    tabs: [
      { id: 'CREATOR_HUB', label: 'Studios', icon: Sparkles },
      { id: 'MUSIC', label: 'Melos', icon: Music2 },
      { id: 'MOVIES', label: 'Fabula', icon: Film },
      { id: 'TELA', label: 'Tela', icon: FileText },
      { id: 'FEED', label: 'Network', icon: Users },
    ],
  },
};

export const PERSONA_KEYS: PersonaKey[] = ['personal', 'business', 'academic', 'elevate', 'creative'];

/**
 * Get active persona key from local storage (default: 'personal')
 */
export function getActivePersonaKey(): PersonaKey {
  try {
    const saved = localStorage.getItem(PERSONA_STORAGE_KEY) as PersonaKey;
    if (saved && PERSONA_KEYS.includes(saved)) {
      return saved;
    }
  } catch {
    // fallback
  }
  return 'personal';
}

/**
 * Set active persona key and notify listeners
 */
export function setActivePersonaKey(key: PersonaKey): void {
  try {
    localStorage.setItem(PERSONA_STORAGE_KEY, key);
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('PLAJAH_PERSONA_CHANGED', { detail: { personaKey: key } }));
  }
}

/**
 * Get the full active persona configuration
 */
export function getActivePersonaConfig(userProfile?: any): PersonaConfig {
  const key = getActivePersonaKey();
  const config = { ...DEFAULT_PERSONAS[key] };

  // Personalize with user profile metadata if available
  if (userProfile) {
    if (key === 'personal') {
      config.name = userProfile.displayName || userProfile.handle || 'Personal Account';
      config.avatarUrl = userProfile.avatarUrl || userProfile.photoURL;
    } else if (key === 'business') {
      config.name = userProfile.businessName || userProfile.storeName || 'Business Storefront';
      config.avatarUrl = userProfile.businessLogoUrl || userProfile.avatarUrl;
    } else if (key === 'academic') {
      config.name = userProfile.schoolName || userProfile.institution || 'Academia & Campus';
    } else if (key === 'elevate') {
      config.name = userProfile.churchName || 'Elevate Sanctuary';
    }
  }

  return config;
}
