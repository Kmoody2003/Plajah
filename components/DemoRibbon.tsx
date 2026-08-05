import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

// Sticky "this is a live demo — create your own" bar shown on top of every demo
// showcase (church, sanctuary, store). Encourages the visitor to build their own.
const DemoRibbon: React.FC<{
  label: string;            // "church", "sanctuary", "store"
  onCreate: () => void;
  ctaText?: string;
  accent?: string;
}> = ({ label, onCreate, ctaText, accent = '#FF8C00' }) => (
  <div
    className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 backdrop-blur-md"
    style={{ background: `linear-gradient(90deg, ${accent}22, rgba(0,0,0,0.55))`, borderBottom: `1px solid ${accent}44` }}
  >
    <div className="flex items-center gap-2 min-w-0">
      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest text-black" style={{ background: accent }}>
        <Sparkles size={10} /> Demo
      </span>
      <p className="text-[11px] sm:text-[12px] font-bold text-white/70 truncate">
        You're exploring a live sample {label}. Everything here is a tutorial — click around freely.
      </p>
    </div>
    <button
      onClick={onCreate}
      className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-black transition-transform hover:scale-105"
      style={{ background: accent }}
    >
      {ctaText || `Create your own ${label}`} <ArrowRight size={12} />
    </button>
  </div>
);

export default DemoRibbon;
