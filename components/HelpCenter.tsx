import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  HelpCircle, Book, Play, ChevronRight, Search, 
  Music2, Video, Newspaper, BookOpen, Radio, 
  Gamepad2, GraduationCap, Ticket, Camera, 
  MessageSquare, Settings, Database, Megaphone,
  ArrowLeft, Info, Sparkles, ShieldCheck, Tv
} from 'lucide-react';

interface HelpSection {
  id: string;
  title: string;
  icon: any;
  description: string;
  features: {
    name: string;
    description: string;
    tutorial?: string;
  }[];
}

const helpSections: HelpSection[] = [
  {
    id: 'dashboard',
    title: 'Global Archive',
    icon: Database,
    description: 'The central hub for all platform content. Discover music, videos, and more.',
    features: [
      { name: 'Listening to Music', description: 'Click any album or track cover to instantly play it. Use the mini-player at the bottom to control volume, pause, or skip. Tap the spacebar to play/pause quickly.' },
      { name: 'Watching Videos', description: 'Navigate to the Videos tab or click any video thumbnail. Videos play directly in the viewer. You can make it full screen by clicking the expand icon or double clicking the video.' },
      { name: 'Exploring', description: 'Use the top navigation bar to jump between Music, Movies/TV, Radio, Podcasts, and Games. Everything is organized by genre and latest drops.' }
    ]
  },
  {
    id: 'creator',
    title: 'Creator Studio',
    icon: Settings,
    description: 'Your personal command center to upload and distribute your art.',
    features: [
      { name: 'Upload New Music', description: 'Click "Deploy Art" in the Creator Studio. Upload your MP3/WAV files, set a title, pick a stunning cover photo, and choose whether it\'s public or exclusive.' },
      { name: 'YouTube Import', description: 'Easily bring your existing video catalog over. Go to the Video tab, click "YouTube Import", and paste in the URL of your video. We handle the rest.' },
      { name: 'Selling Merch', description: 'Open the Merchant portal, add photos of your gear, set your price, and start selling directly to your fans with 0% extra platform fees.' }
    ]
  },
  {
    id: 'sanctuary',
    title: 'The Sanctuary',
    icon: ShieldCheck,
    description: 'Exclusive membership areas where artists and loyal fans connect securely.',
    features: [
      { name: 'Joining a Sanctuary', description: 'Click on a favorite artist’s profile. If they have a Sanctuary, click "Join". You may need to pay a subscription fee if the artist requires it.' },
      { name: 'Member Benefits', description: 'As a member, you get access to locked posts, private music streams, and exclusive chat rooms directly with the creator.' },
      { name: 'Starting Your Own', description: 'If you are a creator, go to your dashboard settings, find the "Sanctuary" tab, and set your monthly price. Instantly start locking content for super-fans only.' }
    ]
  },
  {
    id: 'multimedia',
    title: 'Radio & TV & Games',
    icon: Tv,
    description: 'Immersive lean-back experiences. Just press play and relax.',
    features: [
      { name: 'Live Radio', description: 'Click the Radio icon in the navigation. Select a station and let continuous, curated music play in the background while you browse.' },
      { name: 'Fast Channels (TV)', description: 'Go to the TV section to watch endless channels of visual content, from music videos to podcasts. Change channels like a real television.' },
      { name: 'Arcade', description: 'Feeling bored? Head to the Games section. Play 2D and 3D web-based games, compete for high scores, and enjoy retro titles instantly.' }
    ]
  }
];

interface HelpCenterProps {
  onBack: () => void;
}

const HelpCenter: React.FC<HelpCenterProps> = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSections = helpSections.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 bg-theme relative text-white p-6 lg:p-12 overflow-y-auto custom-scrollbar pb-40">
      {/* Background FX */}
      <div className="absolute top-0 left-1/4 w-[50vw] h-[50vw] bg-small-orange/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen opacity-50" />
      <div className="absolute bottom-0 right-1/4 w-[40vw] h-[40vw] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none mix-blend-screen opacity-50" />

      <header className="mb-16 relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-3 bg-white/5 hover:bg-white/10 backdrop-blur-md rounded-full transition-all hover:-translate-x-1">
            <ArrowLeft size={20} />
          </button>
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-[#ff8c00] bg-white/5 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">Support Portal</span>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          <div className="max-w-3xl">
            <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Help & Tutorials</h1>
            <p className="text-white/60 font-bold text-lg max-w-2xl leading-relaxed">Everything you need to know about navigating and mastering the platform. Learn how to discover, create, and connect.</p>
          </div>
          <div className="relative w-full lg:w-[400px]">
            <div className="absolute inset-0 bg-gradient-to-r from-[#ff8c00]/20 to-transparent blur-xl opacity-50" />
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40" size={20} />
            <input 
              type="text"
              placeholder="Search features..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full relative bg-black/40 backdrop-blur-xl border border-white/20 rounded-full py-5 pl-14 pr-6 text-sm font-black uppercase tracking-widest text-white outline-none focus:ring-2 ring-[#ff8c00] focus:border-transparent transition-all shadow-2xl"
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          {filteredSections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full text-left p-6 lg:p-8 rounded-[2rem] border transition-all duration-500 flex items-center justify-between group shadow-xl hover:-translate-y-1 ${
                activeSection === section.id 
                  ? 'bg-gradient-to-br from-white to-gray-200 text-black border-white shadow-[0_20px_40px_rgba(255,255,255,0.1)]' 
                  : 'bg-black/40 backdrop-blur-xl border-white/5 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${activeSection === section.id ? 'bg-black/5' : 'bg-[#ff8c00]/10 group-hover:bg-[#ff8c00]/20'}`}>
                  <section.icon size={28} className={activeSection === section.id ? 'text-black' : 'text-[#ff8c00]'} />
                </div>
                <div>
                  <h3 className={`font-black uppercase tracking-widest text-sm mb-1 ${activeSection === section.id ? 'text-black' : 'text-white'}`}>{section.title}</h3>
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-60 ${activeSection === section.id ? 'text-black' : 'text-white/60'}`}>
                    {section.features.length} Modules
                  </p>
                </div>
              </div>
              <ChevronRight size={20} className={`transition-transform duration-500 ${activeSection === section.id ? 'text-black translate-x-1' : 'text-white/20 group-hover:text-white group-hover:translate-x-1'}`} />
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {activeSection ? (
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.98 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="bg-black/60 shadow-2xl backdrop-blur-2xl border border-white/10 rounded-[3rem] p-8 lg:p-12 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#ff8c00]/20 to-transparent blur-3xl rounded-full pointer-events-none" />
                
                {helpSections.find(s => s.id === activeSection) && (
                  <>
                    <div className="flex flex-col lg:flex-row lg:items-center gap-6 mb-12 relative z-10">
                      <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-[#ff8c00] to-[#ff4500] flex items-center justify-center text-white shadow-[0_10px_30px_rgba(255,140,0,0.4)]">
                        {React.createElement(helpSections.find(s => s.id === activeSection)!.icon, { size: 36, strokeWidth: 2.5 })}
                      </div>
                      <div>
                        <h2 className="text-4xl font-display font-black uppercase tracking-tightest mb-2">
                          {helpSections.find(s => s.id === activeSection)!.title}
                        </h2>
                        <p className="text-white/60 font-bold text-sm max-w-lg leading-relaxed">
                          {helpSections.find(s => s.id === activeSection)!.description}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-6 relative z-10">
                      {helpSections.find(s => s.id === activeSection)!.features.map((feature, idx) => (
                        <div key={idx} className="p-8 bg-black/40 backdrop-blur-md rounded-[2.5rem] border border-white/5 group hover:bg-white/[0.02] hover:border-[#ff8c00]/30 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all duration-500 relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-[200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4 relative z-10">
                            <h4 className="text-xl font-display font-black uppercase tracking-widest text-[#ff8c00] group-hover:text-[#ffb732] transition-colors flex items-center gap-4">
                              <span className="w-8 h-8 rounded-full bg-[#ff8c00]/10 flex items-center justify-center text-xs">{idx + 1}</span>
                              {feature.name}
                            </h4>
                            <div className="shrink-0 px-4 py-2 bg-white/5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-white/40 border border-white/5 group-hover:border-white/20 transition-all">Quick Guide</div>
                          </div>
                          <p className="text-white/60 text-sm font-bold leading-relaxed mb-8 relative z-10 lg:pl-12 max-w-3xl">{feature.description}</p>
                          <div className="lg:pl-12 relative z-10">
                             <button className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/10 hover:bg-white text-[10px] font-black uppercase tracking-[0.2em] text-white hover:text-black transition-all">
                               <Play size={14} fill="currentColor" /> Play Mini Video
                             </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </motion.div>
            ) : (
              <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-12 bg-black/40 backdrop-blur-2xl border border-white/5 rounded-[3rem] border-dashed">
                <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center mb-8 relative">
                  <div className="absolute inset-0 bg-[#ff8c00]/20 rounded-full animate-ping opacity-20" />
                  <HelpCircle size={64} className="text-white/20" />
                </div>
                <h3 className="text-3xl font-display font-black uppercase tracking-widest mb-4">Select a Topic</h3>
                <p className="text-white/40 font-bold max-w-sm leading-relaxed">Choose a category from the left to explore detailed features, visual aids, and interactive tutorials.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Quick Tips Footer */}
      <section className="mt-20">
        <h3 className="text-xs font-black uppercase tracking-[0.4em] text-white/20 mb-8">Pro Tips</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
            <Info className="text-small-orange shrink-0" size={20} />
            <p className="text-[11px] font-bold text-white/60 leading-relaxed">Hover over any button for 4 seconds to see detailed help tooltips.</p>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
            <Book className="text-small-orange shrink-0" size={20} />
            <p className="text-[11px] font-bold text-white/60 leading-relaxed">Check the "Global Archive" regularly for new artist deployments.</p>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex gap-4">
            <ShieldCheck className="text-small-orange shrink-0" size={20} />
            <p className="text-[11px] font-bold text-white/60 leading-relaxed">Join an artist's Sanctuary to unlock exclusive music and videos.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HelpCenter;
