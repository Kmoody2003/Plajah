import React from 'react';
import { Mail, Globe, ShieldCheck } from 'lucide-react';

const PostmanSystem: React.FC = () => {
  const postmanUrl = "https://ais-dev-kg4mmcwnglfhocokkiz3md-137921939411.us-east5.run.app";

  return (
    <div className="h-full flex flex-col bg-black/20 backdrop-blur-3xl overflow-hidden rounded-[2.5rem] border border-white/5">
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-small-orange/20 flex items-center justify-center">
            <Mail className="text-small-orange" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tightest">The Postman</h2>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">AI Dispatch Bridge Active</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
            <ShieldCheck size={12} className="text-green-500" />
            <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Verified Link</span>
          </div>
          <button 
            onClick={() => window.open(postmanUrl, '_blank')}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
            title="Open in New Tab"
          >
            <Globe size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
         <iframe 
          src={postmanUrl}
          className="w-full h-full border-none"
          title="Postman System"
          allow="camera; microphone; geolocation; clipboard-write; clipboard-read"
        />
      </div>
    </div>
  );
};

export default PostmanSystem;
