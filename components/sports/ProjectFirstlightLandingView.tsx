import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Play, 
  Shield, 
  Sparkles, 
  ExternalLink, 
  CheckCircle2, 
  Trophy, 
  Cpu, 
  Layers, 
  Flame, 
  Info,
  Maximize2
} from 'lucide-react';
import { UserProfile } from '../../types';
import ProjectFirstlight from './ProjectFirstlight';
import Logo from '../Logo';

interface Props {
  onBack: () => void;
  currentUser?: UserProfile | null;
  onNavigate?: (view: string) => void;
}

export const ProjectFirstlightLandingView: React.FC<Props> = ({ onBack, currentUser, onNavigate }) => {
  const [isPlaying3D, setIsPlaying3D] = useState(true);
  const [activeTab, setActiveTab] = useState<'LAB' | 'CURRICULUM' | 'ADMIN_SPECS'>('LAB');
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'staff' || currentUser?.email === 'kmoody2003@gmail.com';

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col font-sans selection:bg-[#FF8C00]/30">
      {/* Top Platform Bar */}
      <header className="sticky top-0 z-50 bg-[#12111D]/80 backdrop-blur-xl border-b border-white/10 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/60 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-full border border-white/10"
          >
            <ArrowLeft size={14} /> Back to Apps
          </button>
          <div className="h-5 w-[1px] bg-white/15 hidden sm:block" />
          <div className="flex items-center gap-2.5">
            <Logo size={28} />
            <div className="flex flex-col">
              <span className="text-xs font-black tracking-widest uppercase text-white/50">Plajah Sports</span>
              <span className="text-sm font-black tracking-tight uppercase text-white">Project Firstlight</span>
            </div>
            <span className="ml-2 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-gradient-to-r from-[#FF8C00] to-[#D40055] text-white shadow-sm">
              Admin Preview
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a 
            href="/firstlight.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-2 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/15 px-3.5 py-2 rounded-full text-white/80 hover:text-white transition-all"
          >
            <Maximize2 size={13} className="text-[#00DAF3]" /> Standalone Fullscreen <ExternalLink size={11} className="opacity-60" />
          </a>
          <button 
            onClick={() => setIsPlaying3D(!isPlaying3D)}
            className="flex items-center gap-2 text-xs font-bold bg-[#FF8C00] hover:bg-[#ff9d26] text-black px-4 py-2 rounded-full font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(255,140,0,0.35)]"
          >
            <Play size={14} fill="currentColor" /> {isPlaying3D ? 'Hide 3D Lab' : 'Launch 3D Lab'}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        
        {/* Hero Banner */}
        <section className="relative rounded-[2.5rem] overflow-hidden border border-white/10 p-8 sm:p-12 bg-gradient-to-br from-[#1C1630] via-[#141221] to-[#0A0A0F] shadow-2xl">
          <div className="absolute -right-20 -top-20 w-96 h-96 bg-[#6B0099]/30 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute right-40 -bottom-20 w-80 h-80 bg-[#FF8C00]/15 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[#00DAF3] text-xs font-bold uppercase tracking-widest">
              <Sparkles size={13} /> Official Plajah Sports Passing Prototype
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight uppercase leading-[1.08]">
              Project Firstlight <br />
              <span className="bg-gradient-to-r from-[#FF8C00] via-[#D40055] to-[#D0BCFF] bg-clip-text text-transparent">
                The 3D Football Passing Lab
              </span>
            </h1>

            <p className="text-base sm:text-lg text-white/70 font-medium max-w-2xl leading-relaxed">
              Your first read. Your next big play. A browser-native 3-on-3 American football passing simulation built on pure deterministic physics, 7-second pocket countdowns, and real-time route separation.
            </p>

            {/* Quick Stat Tags */}
            <div className="flex flex-wrap gap-3 pt-2">
              <span className="px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold flex items-center gap-2">
                <Cpu size={14} className="text-[#00DAF3]" /> Three.js WebGL Engine
              </span>
              <span className="px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold flex items-center gap-2">
                <Shield size={14} className="text-[#06D6A0]" /> Family-Safe · No Gambling
              </span>
              <span className="px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold flex items-center gap-2">
                <Flame size={14} className="text-[#FF8C00]" /> 7-Second Pocket Pressure
              </span>
            </div>
          </div>
        </section>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 gap-8 text-sm font-bold tracking-wider uppercase">
          <button 
            onClick={() => setActiveTab('LAB')}
            className={`pb-4 flex items-center gap-2 transition-colors relative ${activeTab === 'LAB' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
          >
            <Play size={16} /> 3D Passing Lab Viewport
            {activeTab === 'LAB' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#FF8C00] to-[#D40055]" />}
          </button>
          <button 
            onClick={() => setActiveTab('CURRICULUM')}
            className={`pb-4 flex items-center gap-2 transition-colors relative ${activeTab === 'CURRICULUM' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
          >
            <Layers size={16} /> Football Curriculum (Play &amp; Learn)
            {activeTab === 'CURRICULUM' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#FF8C00] to-[#D40055]" />}
          </button>
          <button 
            onClick={() => setActiveTab('ADMIN_SPECS')}
            className={`pb-4 flex items-center gap-2 transition-colors relative ${activeTab === 'ADMIN_SPECS' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
          >
            <Info size={16} /> Admin Telemetry &amp; Specs
            {activeTab === 'ADMIN_SPECS' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#FF8C00] to-[#D40055]" />}
          </button>
        </div>

        {/* Tab 1: 3D Passing Lab Viewport */}
        {activeTab === 'LAB' && (
          <section className="space-y-6">
            {isPlaying3D ? (
              <div className="rounded-[2.5rem] overflow-hidden border border-white/15 bg-[#171525] shadow-2xl p-4 sm:p-6">
                <ProjectFirstlight />
              </div>
            ) : (
              <div className="rounded-[2.5rem] border border-dashed border-white/20 p-16 text-center space-y-4 bg-white/5">
                <p className="text-white/60 font-bold">3D Passing Lab is paused.</p>
                <button 
                  onClick={() => setIsPlaying3D(true)}
                  className="px-6 py-3 rounded-full bg-[#FF8C00] text-black font-black uppercase text-xs tracking-wider shadow-lg"
                >
                  Re-open 3D Field
                </button>
              </div>
            )}
          </section>
        )}

        {/* Tab 2: Football Curriculum */}
        {activeTab === 'CURRICULUM' && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-3xl border border-white/10 bg-[#161424] p-6 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-black text-xl">
                01
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-white">Field &amp; Downs</h3>
              <p className="text-xs text-white/60 leading-relaxed font-medium">
                Understand the 100-yard gridiron, the 10-yard first-down threshold, and why you get four downs to move the chains.
              </p>
              <div className="flex items-center gap-2 text-[10px] font-bold text-[#00DAF3] uppercase tracking-wider pt-2">
                <CheckCircle2 size={12} /> Interactive Rule Check
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#161424] p-6 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 font-black text-xl">
                02
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-white">Route Breaks</h3>
              <p className="text-xs text-white/60 leading-relaxed font-medium">
                Master the Route Tree: Out routes along the sideline, deep seam posts down the hash marks, and in/dig crossing windows.
              </p>
              <div className="flex items-center gap-2 text-[10px] font-bold text-[#FF8C00] uppercase tracking-wider pt-2">
                <CheckCircle2 size={12} /> Target Rings Active
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#161424] p-6 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-black text-xl">
                03
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-white">Pocket Scramble</h3>
              <p className="text-xs text-white/60 leading-relaxed font-medium">
                Step up into the pocket, evade edge pressure laterally with A/D, and release before the 7-second clock expires.
              </p>
              <div className="flex items-center gap-2 text-[10px] font-bold text-[#06D6A0] uppercase tracking-wider pt-2">
                <CheckCircle2 size={12} /> Live Pocket Timer
              </div>
            </div>
          </section>
        )}

        {/* Tab 3: Admin Specs & Telemetry */}
        {activeTab === 'ADMIN_SPECS' && (
          <section className="rounded-3xl border border-white/10 bg-[#161424] p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                <Cpu size={18} className="text-[#FF8C00]" /> Engine &amp; Platform Invariants
              </h3>
              <span className="px-3 py-1 rounded-full text-[10px] font-mono bg-green-500/10 border border-green-500/20 text-green-400 font-bold">
                Deterministic: Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-black/30 border border-white/5">
                <span className="text-white/40 block uppercase text-[10px] font-bold">Target Frame Rate</span>
                <span className="text-lg font-black text-white mt-1 block">60 FPS</span>
                <span className="text-[10px] text-white/40">Clamped dt: 0.05s max</span>
              </div>
              <div className="p-4 rounded-2xl bg-black/30 border border-white/5">
                <span className="text-white/40 block uppercase text-[10px] font-bold">Pocket Collapse Timer</span>
                <span className="text-lg font-black text-[#FF8C00] mt-1 block">7.0s</span>
                <span className="text-[10px] text-white/40">Penalty: -4 Yard Sack</span>
              </div>
              <div className="p-4 rounded-2xl bg-black/30 border border-white/5">
                <span className="text-white/40 block uppercase text-[10px] font-bold">Separation Radius</span>
                <span className="text-lg font-black text-[#00DAF3] mt-1 block">&gt;= 3.2 yds</span>
                <span className="text-[10px] text-white/40">Euclidean collision check</span>
              </div>
              <div className="p-4 rounded-2xl bg-black/30 border border-white/5">
                <span className="text-white/40 block uppercase text-[10px] font-bold">Access Gate</span>
                <span className="text-lg font-black text-[#D40055] mt-1 block">Admin / Staff</span>
                <span className="text-[10px] text-white/40">Hidden from public catalog</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-white/70 space-y-2">
              <p className="font-bold text-white">Security &amp; Youth Protection Notice:</p>
              <p>
                Project Firstlight is operated in local unranked prototype mode. No user balances, betting odds, public chat rooms, or real-game league marks are permitted. Persistent multiplayer leagues require verified caregiver authorization per the Plajah Sports Play &amp; Learn specification.
              </p>
            </div>
          </section>
        )}

      </main>
    </div>
  );
};
export default ProjectFirstlightLandingView;
