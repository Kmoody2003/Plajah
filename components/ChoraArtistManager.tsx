/**
 * Chora Artist Manager
 * Dedicated business operations, touring, band payroll, and release management for music artists, bands, and labels.
 *
 * Part of the Chora Music Ecosystem (Chora Consumer Streaming · Chora Studio · Chora Artist Manager)
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, FileText, Receipt, CheckSquare, Truck, MapPin, Megaphone,
  Plus, ChevronRight, X, Edit2, Trash2, Download, Send, CheckCircle2,
  Clock, AlertCircle, DollarSign, Calendar, Phone, Mail, Globe,
  Star, TrendingUp, BarChart2, Briefcase, Music2, Building2,
  Mic, Layers, Disc3, Clapperboard, BookOpen
} from 'lucide-react';
import { UserProfile } from '../types';
import { MusicReleasesTab } from './music/MusicReleasesTab';
import { isDemoMode, setDemoMode, subscribeDemoMode } from '../services/demoMode';

// Re-use or import existing tabs from ArtistProjectManager or internal definitions
import {
  OverviewTab, MelosLaunchTab, CareerImportLaunchTab, EventsLaunchTab,
  BoardsLaunchTab, AdHubTab, PayrollTab, ContractsTab, InvoicesTab,
  TasksTab, VendorsTab, VenuesTab, PMTab, PM_TABS
} from './ArtistProjectManager';

interface Props {
  currentUser?: UserProfile | null;
  initialTab?: PMTab;
  onOpenChoraStudio?: () => void;
  onOpenFabulaFilm?: () => void;
  onOpenWritersDesk?: () => void;
}

export const ChoraArtistManager: React.FC<Props> = ({
  currentUser,
  initialTab = 'overview',
  onOpenChoraStudio,
  onOpenFabulaFilm,
  onOpenWritersDesk,
}) => {
  const [activeTab, setActiveTab] = useState<PMTab>(initialTab);
  const [demoOn, setDemoOn] = useState(() => isDemoMode());
  useEffect(() => subscribeDemoMode(setDemoOn), []);

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':            return <OverviewTab onSwitchTab={setActiveTab} />;
      case 'releases':            return <MusicReleasesTab currentUser={currentUser} />;
      case 'productions':         return <MelosLaunchTab currentUser={currentUser} />;
      case 'import':              return <CareerImportLaunchTab />;
      case 'events':              return <EventsLaunchTab />;
      case 'boards':              return <BoardsLaunchTab />;
      case 'promote':             return <AdHubTab />;
      case 'payroll':             return <PayrollTab />;
      case 'contracts':           return <ContractsTab />;
      case 'invoices':            return <InvoicesTab />;
      case 'tasks':               return <TasksTab />;
      case 'vendors':             return <VendorsTab />;
      case 'venues':              return <VenuesTab />;
      default:                    return <OverviewTab onSwitchTab={setActiveTab} />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-transparent text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/[0.06] px-6 py-4 shrink-0">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-[#FF8C00]/40 bg-[#FF8C00]/20 text-[#FF8C00] shadow-lg shadow-amber-950/40">
              <Music2 size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black uppercase tracking-widest text-white">Chora Artist Manager</h1>
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FF8C00]/15 text-[#FF8C00] border border-[#FF8C00]/30">
                  Music Business OS
                </span>
              </div>
              <p className="text-[10px] text-white/40">Releases, tour booking, band payroll, vendor coordination & royalty invoicing.</p>
            </div>
          </div>

          {/* Cross-Medium Portals */}
          <div className="flex items-center gap-2">
            {onOpenFabulaFilm && (
              <button
                onClick={onOpenFabulaFilm}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 text-xs font-bold transition"
                title="Manage film sets, call sheets, and scripts in Fabula"
              >
                <Clapperboard size={13} />
                <span className="hidden sm:inline">Fabula Studio</span>
              </button>
            )}
            {onOpenWritersDesk && (
              <button
                onClick={onOpenWritersDesk}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 text-xs font-bold transition"
                title="Manage book manuscripts and submissions in Lorea"
              >
                <BookOpen size={13} />
                <span className="hidden sm:inline">Writer's Desk</span>
              </button>
            )}

            {/* Demo Mode Switcher */}
            <button
              type="button"
              role="switch"
              aria-checked={demoOn}
              onClick={() => setDemoMode(!demoOn)}
              title={demoOn ? 'Demo data is on' : 'Demo data is off'}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/50 transition-colors hover:border-white/25 hover:text-white/80 ml-2"
            >
              <span>Demo</span>
              <span className="relative h-4 w-7 rounded-full transition-colors" style={{ background: demoOn ? '#FF8C00' : 'rgba(255,255,255,0.16)' }}>
                <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all" style={{ left: demoOn ? '0.875rem' : '0.125rem' }} />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="sticky top-[85px] z-10 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.05] shrink-0">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-1.5">
            {PM_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === tab.id ? 'text-black font-bold' : 'bg-transparent text-white/40 hover:text-white/70 hover:bg-white/5'
                }`}
                style={activeTab === tab.id ? { background: tab.color } : {}}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab}>
              {renderTab()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ChoraArtistManager;
