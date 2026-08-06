// SchoolPackageView — the "Plajah for Schools" package. It threads Plajah's existing platform
// stacks — Clubs, the Store/merch, the Live Events stack, and the Sports/media streaming stack —
// into one school offering, framed for how a school actually uses each. Every pillar links into
// the real vertical; nothing here is a mock. Reached from the Academia portal (teacher/admin).

import React from 'react';
import {
  School, Users2, ShoppingBag, Radio, Trophy, ArrowRight, ShieldCheck, Sparkles, Ticket, Clapperboard,
} from 'lucide-react';

interface Pillar {
  key: string; label: string; tagline: string; icon: React.ElementType; accent: string; view: string;
  uses: string[]; cta: string;
}

const PILLARS: Pillar[] = [
  {
    key: 'clubs', label: 'Clubs & Activities', tagline: 'Every extracurricular gets its own home.',
    icon: Users2, accent: '#FF8C00', view: 'CLUBS', cta: 'Open Clubs',
    uses: ['Debate, robotics, band, student council — each a club with roster + chat', 'Advisor tools, sign-ups & permission slips', 'Announcements that reach members and their parents'],
  },
  {
    key: 'store', label: 'School Store & Merch', tagline: 'Spirit wear, fundraising & fees in one storefront.',
    icon: ShoppingBag, accent: '#2bd67a', view: 'STORE', cta: 'Open the Store',
    uses: ['Spirit wear, yearbooks & concessions with real inventory', 'Fundraiser drives tied to a Sanctuary goal', 'Booster-club merch with proceeds to the program'],
  },
  {
    key: 'events', label: 'Live Events & Ticketing', tagline: 'Sell out the show — and stream it too.',
    icon: Ticket, accent: '#e23b6d', view: 'PPV_EVENTS', cta: 'Plan an Event',
    uses: ['Ticketed concerts, plays, graduations & galas', 'Pay-per-view for families who can\'t attend', 'The full production studio for the broadcast'],
  },
  {
    key: 'sports', label: 'Sports & Media Broadcast', tagline: 'Friday-night lights, streamed and archived.',
    icon: Trophy, accent: '#36c5f0', view: 'PLAJAH_SPORTS', cta: 'Open Sports',
    uses: ['Live-stream games with scoreboard + commentary', 'Athlete showcase pages & verified highlights', 'Team pages, schedules and a season archive'],
  },
];

// Secondary entry points into the same streaming/production stack.
const STUDIO_LINKS = [
  { label: 'Event Production Studio', icon: Clapperboard, view: 'EVENT_PRODUCTION_STUDIO', accent: '#7a2bd6' },
  { label: 'Go Live (Reello)', icon: Radio, view: 'RELLO', accent: '#e23b6d' },
  { label: 'Athlete Showcase', icon: Trophy, view: 'ATHLETE_SHOWCASE', accent: '#36c5f0' },
];

const SchoolPackageView: React.FC<{ onNavigate: (view: string) => void; onBack?: () => void }> = ({ onNavigate, onBack }) => {
  return (
    <div className="min-h-full bg-[#0a0a0f] text-white">
      <div className="max-w-5xl mx-auto px-5 py-8">
        {/* Hero */}
        <div className="flex items-center gap-2 text-[#3FB98E] mb-3"><School size={18} /><span className="text-[11px] font-black uppercase tracking-[0.3em]">Plajah for Schools</span></div>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.05] mb-2">The whole school, on one platform.</h1>
        <p className="text-white/55 text-sm sm:text-base max-w-2xl mb-4">
          Your classrooms already live in Academia. The <span className="text-white/80 font-bold">School Package</span> adds
          everything around them — clubs, the school store, ticketed live events, and streamed athletics — all under the
          same safe, ad-free, family-visible roof.
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-9">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-green-300 bg-green-500/10 border border-green-500/25 rounded-full px-3 py-1"><ShieldCheck size={12} /> One roster · One sign-in · Parent-visible</span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-white/50 bg-white/5 border border-white/10 rounded-full px-3 py-1">Revenue stays with the school</span>
        </div>

        {/* Pillars */}
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          {PILLARS.map(p => {
            const Icon = p.icon;
            return (
              <div key={p.key} className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 flex flex-col">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: `${p.accent}22`, color: p.accent }}><Icon size={22} /></div>
                  <div className="min-w-0">
                    <p className="text-[16px] font-black leading-tight">{p.label}</p>
                    <p className="text-[11px] text-white/50">{p.tagline}</p>
                  </div>
                </div>
                <ul className="space-y-1.5 my-3 flex-1">
                  {p.uses.map((u, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-white/65 leading-snug">
                      <span className="mt-1 w-1 h-1 rounded-full shrink-0" style={{ background: p.accent }} />{u}
                    </li>
                  ))}
                </ul>
                <button onClick={() => onNavigate(p.view)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-black uppercase tracking-widest text-black hover:brightness-110 transition-all"
                  style={{ background: p.accent }}>
                  {p.cta} <ArrowRight size={14} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Studio / streaming stack */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5">
          <div className="flex items-center gap-2 mb-1"><Sparkles size={15} className="text-[#3FB98E]" /><h3 className="text-[12px] font-black uppercase tracking-widest text-white/60">Broadcast & production stack</h3></div>
          <p className="text-[12px] text-white/45 mb-4">The same tools our creators use — for your morning announcements, live games, and event broadcasts.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {STUDIO_LINKS.map(s => {
              const Icon = s.icon;
              return (
                <button key={s.label} onClick={() => onNavigate(s.view)} className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 p-3 hover:bg-white/[0.08] transition-colors text-left">
                  <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ background: `${s.accent}22`, color: s.accent }}><Icon size={17} /></div>
                  <span className="text-[12px] font-bold text-white/85 leading-tight">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {onBack && (
          <button onClick={onBack} className="mt-8 text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">← Back to Academia</button>
        )}
      </div>
    </div>
  );
};

export default SchoolPackageView;
