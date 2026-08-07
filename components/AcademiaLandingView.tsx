// AcademiaLandingView — the public/creator-facing Plajah Academia landing (for NON-education
// accounts). Education accounts get the role portal (AcademiaHomeView); regular users get this:
// a grand "ancient library" cover, then the three ways to learn on Plajah —
//   • Plajah Labs (arts / history / science studios)
//   • Learning Modules (the structured quest + curriculum stack)
//   • Learn New Skills (the MasterClass-style directory of creator-made courses + teach-your-craft)
// Everything links into the real functional surfaces; "Browse all" opens the full LMS grid.

import React, { useState } from 'react';
import {
  Library, FlaskConical, Languages, Landmark, Atom, BookOpen, Palette, Music,
  ArrowRight, Sparkles, Plus, ChevronRight, GraduationCap, Compass,
} from 'lucide-react';

// A grand old library for the cover (Unsplash — already used elsewhere in the app, CSP-allowed).
const COVER = 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?q=80&w=1600&auto=format&fit=crop';
const COVER_FALLBACK = 'https://images.unsplash.com/photo-1454789548928-1f63080f5509?q=80&w=1600&auto=format&fit=crop';

interface Module { key: string; label: string; desc: string; icon: React.ElementType; accent: string; view: string; }
const MODULES: Module[] = [
  { key: 'lang',    label: 'Languages',     desc: 'Learn a language, Duolingo-style — vocab, listening, streaks.', icon: Languages,   accent: '#7a2bd6', view: 'LANGUAGE_QUEST' },
  { key: 'history', label: 'History',       desc: 'Nano-lessons and deep dives across world history.',            icon: Landmark,     accent: '#FF8C00', view: 'HISTORY_QUEST' },
  { key: 'science', label: 'Science',       desc: 'Interactive science quests and simulators.',                   icon: Atom,         accent: '#36c5f0', view: 'SCIENCE_QUEST' },
  { key: 'reading', label: 'Reading',       desc: 'Gamified reading practice and a leveled library.',             icon: BookOpen,     accent: '#2bd67a', view: 'READING_QUEST' },
  { key: 'art',     label: 'Art Masters',   desc: 'Open-access masterworks from the Met, AIC and more.',          icon: Palette,      accent: '#e23b6d', view: 'ART_GALLERY' },
  { key: 'music',   label: 'Music History', desc: 'The Chora Vault — the story of recorded sound.',               icon: Music,        accent: '#FFD24A', view: 'MUSIC' },
];

const AcademiaLandingView: React.FC<{
  onNavigate: (view: string) => void;
  onEnterCourses: () => void;
  profile?: any;
}> = ({ onNavigate, onEnterCourses }) => {
  const [coverSrc, setCoverSrc] = useState(COVER);

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white">
      {/* ── Cover ─────────────────────────────────────────────────────────── */}
      <div className="relative h-[62vh] min-h-[420px] w-full overflow-hidden">
        <img
          src={coverSrc}
          onError={() => setCoverSrc(COVER_FALLBACK)}
          alt="A great ancient library"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Warm scholarly tint + darkening for legibility */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,10,15,0.35) 0%, rgba(10,10,15,0.55) 45%, rgba(10,10,15,0.96) 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(1200px 500px at 50% 15%, rgba(255,140,0,0.14), transparent 60%)' }} />

        <div className="relative h-full max-w-5xl mx-auto px-6 flex flex-col justify-end pb-10">
          <div className="flex items-center gap-2 mb-3 text-[#FFD24A]"><Library size={18} /><span className="text-[11px] font-black uppercase tracking-[0.35em]">Plajah Academia</span></div>
          <h1 className="text-5xl sm:text-7xl font-black uppercase tracking-tighter leading-[0.85] italic">Knowledge<br />without walls.</h1>
          <p className="text-white/70 text-sm sm:text-lg max-w-2xl mt-4 leading-relaxed">
            The world's studios, archives, and master teachers — open to everyone. Explore the Labs, work through
            structured modules, or learn a new skill from a creator who's done it.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <button onClick={() => onNavigate('PLAJAH_LABS')} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-black text-[12px] font-black uppercase tracking-widest hover:scale-[1.02] transition-transform">
              <FlaskConical size={16} /> Explore the Labs
            </button>
            <button onClick={onEnterCourses} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-[12px] font-black uppercase tracking-widest hover:bg-white/15 transition-colors">
              <Compass size={16} /> Browse courses
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 space-y-14">
        {/* ── Plajah Labs ────────────────────────────────────────────────── */}
        <section>
          <button onClick={() => onNavigate('PLAJAH_LABS')}
            className="w-full text-left rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-br from-[#141022] to-[#0a0a0f] p-7 hover:border-[#7a2bd6]/50 transition-colors group">
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl grid place-items-center shrink-0 bg-[#7a2bd6]/15 text-[#b388ff]"><FlaskConical size={28} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-black">Plajah Labs</h2>
                  <ArrowRight size={20} className="text-[#b388ff] group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-white/55 text-sm mt-1 max-w-2xl leading-relaxed">Data-driven studios across the disciplines — art, history, architecture, archaeology, astronomy, biology and more. Deep dives, real datasets, simulators, and a social layer of findings.</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  {['Art', 'World History', 'Architecture', 'Astronomy', 'Biology', 'Archaeology'].map(d => (
                    <span key={d} className="text-[10px] font-bold text-white/60 bg-white/5 border border-white/10 rounded-full px-3 py-1">{d}</span>
                  ))}
                </div>
              </div>
            </div>
          </button>
        </section>

        {/* ── Learning Modules ───────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 text-[#3FB98E] mb-1"><GraduationCap size={16} /><span className="text-[10px] font-black uppercase tracking-[0.3em]">Learning Modules</span></div>
              <h2 className="text-2xl font-black">Structured, self-paced tracks</h2>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MODULES.map(m => {
              const Icon = m.icon;
              return (
                <button key={m.key} onClick={() => onNavigate(m.view)}
                  className="text-left rounded-2xl bg-white/[0.04] border border-white/10 p-5 hover:bg-white/[0.07] hover:-translate-y-0.5 transition-all group">
                  <div className="w-11 h-11 rounded-xl grid place-items-center mb-3" style={{ background: `${m.accent}22`, color: m.accent }}><Icon size={22} /></div>
                  <p className="text-[15px] font-black">{m.label}</p>
                  <p className="text-[12px] text-white/50 leading-snug mt-0.5">{m.desc}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest mt-3 group-hover:gap-2 transition-all" style={{ color: m.accent }}>Start <ChevronRight size={12} /></span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Learn New Skills (MasterClass-style creator courses) ────────── */}
        <section>
          <div className="rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-br from-[#1a1206] to-[#0a0a0f] p-7">
            <div className="flex items-center gap-2 text-[#FF8C00] mb-1"><Sparkles size={16} /><span className="text-[10px] font-black uppercase tracking-[0.3em]">Learn New Skills</span></div>
            <h2 className="text-2xl sm:text-3xl font-black">Master-taught courses, from real creators.</h2>
            <p className="text-white/55 text-sm mt-2 max-w-2xl leading-relaxed">
              MasterClass / Skillshare-style. Photography, music production, business, cooking, code — learn from
              people who've done it, at your own pace. Or teach your own craft: same course engine as our schools,
              set a price or make it free, and learners enroll directly.
            </p>
            <div className="flex flex-wrap gap-3 mt-5">
              <button onClick={onEnterCourses} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#FF8C00] text-black text-[12px] font-black uppercase tracking-widest hover:brightness-110 transition-all">
                <Compass size={16} /> Course directory
              </button>
              <button onClick={onEnterCourses} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-[12px] font-black uppercase tracking-widest hover:bg-white/15 transition-colors">
                <Plus size={16} /> Teach your craft
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AcademiaLandingView;
