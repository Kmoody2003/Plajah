/**
 * MobileAppDrawerModal.tsx — Extended Plajah App & Suite Drawer for Mobile.
 *
 * Triggered by tapping the Plajah logo gradient "More" chevron on the mobile bottom bar.
 * Gives immediate 1-tap access to every creative suite, productivity tool, and module.
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Music2, Radio, Film, FileText, Box, BookOpen,
  Store, GraduationCap, Sparkles, BarChart3, Settings,
  Flame, Tv, Users, Camera
} from 'lucide-react';

interface MobileAppDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string, detail?: any) => void;
  activePersonaBadge?: string;
}

interface DrawerModule {
  label: string;
  desc: string;
  icon: any;
  color: string;
  targetView: string;
  badge?: string;
}

const MODULES: DrawerModule[] = [
  { label: 'Melos DAW', desc: 'Spatial Audio Studio', icon: Music2, color: '#8B5CF6', targetView: 'MUSIC' },
  { label: 'Chora Radio', desc: 'Lossless Streaming', icon: Radio, color: '#A855F7', targetView: 'RADIO' },
  { label: 'Cine Studio', desc: 'Cinema & Video', icon: Film, color: '#EC4899', targetView: 'MOVIES' },
  { label: 'Plajah Photos', desc: 'Visual Signal Archive', icon: Camera, color: '#00DAF3', targetView: 'GLOBAL_PHOTOS' },
  { label: 'Tela Canvas', desc: 'Docs & Whiteboards', icon: FileText, color: '#3B82F6', targetView: 'TELA' },
  { label: 'Horizon 3D', desc: 'Spatial Engine', icon: Box, color: '#06B6D4', targetView: 'WORLDS' },
  { label: 'Lectio Reader', desc: 'Scripture Study', icon: BookOpen, color: '#F59E0B', targetView: 'LECTIO' },
  { label: 'POS Terminal', desc: 'Storefront Register', icon: Store, color: '#10B981', targetView: 'BUSINESS' },
  { label: 'Lorea Research', desc: 'Academic Archive', icon: GraduationCap, color: '#6366F1', targetView: 'ACADEMIA_HOME' },
  { label: 'Front Row', desc: 'Marquee Hub', icon: Sparkles, color: '#FF8C00', targetView: 'DASHBOARD' },
  { label: 'Content HQ', desc: 'Social & Sales Stats', icon: BarChart3, color: '#14B8A6', targetView: 'CONTENT_HQ' },
  { label: 'Ambo Worship', desc: 'Sanctuary Audio', icon: Flame, color: '#F97316', targetView: 'AMBO_HOME' },
  { label: 'Preferences', desc: 'System & Theme', icon: Settings, color: '#94A3B8', targetView: 'SETTINGS' },
];

export const MobileAppDrawerModal: React.FC<MobileAppDrawerModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
  activePersonaBadge = 'Personal',
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[190] flex flex-col justify-end select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Drawer Container */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          className="relative z-10 w-full max-w-lg mx-auto bg-[#0d0015]/95 border-t border-white/20 rounded-t-[34px] p-5 pb-8 shadow-[0_-20px_60px_rgba(0,0,0,0.9)] max-h-[75vh] overflow-y-auto space-y-4"
        >
          {/* Top Pill Handle */}
          <div className="w-12 h-1.5 bg-white/25 rounded-full mx-auto mb-1" />

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold font-display text-white tracking-tight">
                  All Plajah Modules
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/10 text-white/70 border border-white/15">
                  {activePersonaBadge}
                </span>
              </div>
              <p className="text-[11px] text-white/60">
                Extended creative suites and tools for your current workspace
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Module Grid */}
          <div className="grid grid-cols-4 gap-2.5 pt-2 text-center">
            {MODULES.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.label}
                  onClick={() => {
                    onNavigate(m.targetView);
                    onClose();
                  }}
                  className="p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 flex flex-col items-center gap-1.5 cursor-pointer transition-all active:scale-95 group"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/10 group-hover:border-white/30 shadow-sm"
                    style={{ background: `${m.color}22`, color: m.color }}
                  >
                    <Icon size={18} />
                  </div>
                  <span className="text-[10px] font-bold text-white truncate w-full">
                    {m.label}
                  </span>
                  <span className="text-[8px] text-white/40 truncate w-full -mt-1">
                    {m.desc}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default MobileAppDrawerModal;
