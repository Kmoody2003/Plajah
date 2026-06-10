/**
 * ContentLabelPicker — self-labeling UI for the post composer, plus the
 * compact community-guidelines notice every poster sees.
 *
 * Creators toggle content labels (Graphic / 18+ / Artistic Nudity /
 * Sensitive); labeled posts are blurred for viewers whose safety settings
 * gate that label. The notice makes the hard rules unmissable at post time.
 */

import React, { useState } from 'react';
import { ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { CONTENT_LABELS, PROHIBITED_CONTENT, type ContentLabel } from '../../services/contentSafetyService';

export const ContentLabelPicker: React.FC<{
  selected: ContentLabel[];
  onChange: (labels: ContentLabel[]) => void;
}> = ({ selected, onChange }) => {
  const [open, setOpen] = useState(selected.length > 0);

  const toggle = (id: ContentLabel) =>
    onChange(selected.includes(id) ? selected.filter(l => l !== id) : [...selected, id]);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors">
        <ShieldAlert size={13} className={selected.length ? 'text-[#FF8C00]' : 'text-white/30'} />
        <span className="flex-1 text-[9px] font-black uppercase tracking-widest text-white/60">
          Content labels{selected.length ? ` · ${selected.length} applied` : ' (mature / graphic work?)'}
        </span>
        {open ? <ChevronUp size={12} className="text-white/30" /> : <ChevronDown size={12} className="text-white/30" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CONTENT_LABELS.map(label => {
              const on = selected.includes(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => toggle(label.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    on ? 'bg-[#FF8C00]/15 border-[#FF8C00]/40' : 'bg-white/[0.03] border-white/8 hover:border-white/20'}`}>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${on ? 'text-[#FF8C00]' : 'text-white/70'}`}>
                    {on ? '✓ ' : ''}{label.name}
                  </p>
                  <p className="text-[8px] text-white/35 leading-relaxed mt-1">{label.description}</p>
                </button>
              );
            })}
          </div>

          {/* The rules, right where they post */}
          <div className="p-3 rounded-xl bg-red-500/[0.06] border border-red-500/15">
            <p className="text-[8px] font-black uppercase tracking-widest text-red-400/80 mb-1.5">Never allowed — labeling does not permit:</p>
            <ul className="space-y-1">
              {PROHIBITED_CONTENT.map(p => (
                <li key={p.id} className="text-[8px] text-white/40 leading-relaxed">
                  <span className="text-red-400/70 font-black">✕</span> {p.rule}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentLabelPicker;
