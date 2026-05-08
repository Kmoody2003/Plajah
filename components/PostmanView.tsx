import React from 'react';
import { motion } from 'motion/react';
import { Mail, ShieldCheck, Globe, Clock } from 'lucide-react';

const PostmanView: React.FC = () => {
  const postmanUrl = "https://ais-dev-kg4mmcwnglfhocokkiz3md-137921939411.us-east5.run.app";

  return (
    <div className="flex-1 flex flex-col h-full bg-theme">
      {/* Header Bar */}
      <header className="px-8 py-8 border-b border-white/5 bg-black/40 backdrop-blur-3xl flex flex-col justify-end">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center shadow-xl border border-white/10">
            <Mail size={24} className="text-white" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-small-orange">Dispatched via AI Studio Pulse</p>
          </div>
        </div>
        <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">The Postman</h1>
        
        <div className="flex items-center gap-6 mt-8">
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/5">
            <ShieldCheck size={14} className="text-green-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Secure Link Established</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/5">
            <Globe size={14} className="text-blue-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Live Environment</span>
          </div>
        </div>
      </header>

      {/* Main Content Area - Iframe Wrapper */}
      <main className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="flex flex-col items-center gap-4 opacity-10">
            <Mail size={80} className="text-white animate-pulse" />
            <span className="text-sm font-black uppercase tracking-[0.5em] text-white">Connecting Bridge...</span>
          </div>
        </div>
        
        <iframe 
          src={postmanUrl}
          className="w-full h-full border-none relative z-10"
          title="The Postman"
          allow="camera; microphone; geolocation; clipboard-write; clipboard-read"
        />
      </main>

      {/* Footer Info */}
      <footer className="px-8 py-4 border-t border-white/5 bg-black/40 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-white/20">
          <Clock size={12} />
          <span>Last synchronized: {new Date().toLocaleTimeString()}</span>
        </div>
        <div className="text-[9px] font-black uppercase tracking-widest text-white/10">
          PLAJAH INTEGRATED ASSET — AI STUDIO PROJECT
        </div>
      </footer>
    </div>
  );
};

export default PostmanView;
