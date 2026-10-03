import React, { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { courseVerification, STATUS_META } from '../../services/contentIntegrity';

/**
 * Honest verification label for a course. Shows how well its facts have been checked (never more
 * than it has earned) and opens a plain explanation of how Plajah checks facts.
 */
const AccuracyBadge: React.FC<{ courseId?: string; compact?: boolean }> = ({ courseId, compact }) => {
  const [open, setOpen] = useState(false);
  const v = courseVerification(courseId); const m = STATUS_META[v.status];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={m.detail}
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider hover:bg-white/10"
        style={{ borderColor: `${m.color}66`, color: m.color, background: `${m.color}14` }}>
        <ShieldCheck size={12} /> {compact ? m.short : m.label}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="How Plajah checks facts" className="fixed inset-0 z-[400] bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0e0b16] text-white p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-3">
              <div className="flex-1"><p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: m.color }}>{m.label}</p><h2 className="text-lg font-black">How Plajah checks facts</h2></div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10 text-white/60"><X size={18} /></button>
            </div>
            <p className="text-[13px] text-white/75 leading-relaxed mb-3">{m.detail}</p>
            {v.method && <p className="text-[12px] text-white/55 mb-3"><b>This course:</b> {v.method}{v.checkedAt ? ` (checked ${v.checkedAt})` : ''}</p>}
            {v.coverage && <p className="text-[12px] text-white/55 mb-3">{v.coverage.agreed} of {v.coverage.questions} questions agreed by every check; {v.coverage.flagged} held back for review.</p>}
            <p className="text-[11px] font-black uppercase tracking-wider text-white/40 mb-1.5">Our promise</p>
            <ul className="grid gap-1.5 text-[12px] text-white/70 list-disc pl-5 mb-3">
              <li>We never label content as verified until it has passed the check for that level.</li>
              <li>Anything a check or a learner contradicts is taken out of practice until it is resolved.</li>
              <li>Every question has a Report a problem button, and corrections are logged.</li>
              <li>AI helps write and check content, so we label it as such, and we never present AI output as expert review.</li>
            </ul>
            <p className="text-[11px] font-black uppercase tracking-wider text-white/40 mb-1.5">The levels</p>
            <ol className="grid gap-1 text-[12px] text-white/60 list-decimal pl-5">
              <li><b>Draft:</b> written, not yet independently checked.</li>
              <li><b>Cross-checked:</b> two independent checks agree with the answers.</li>
              <li><b>Verified against sources:</b> each checked fact carries a cited source.</li>
              <li><b>Educator reviewed:</b> two credentialed educators signed off.</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
};

export default AccuracyBadge;
