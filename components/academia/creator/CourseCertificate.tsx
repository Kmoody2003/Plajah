/**
 * CourseCertificate — a printable certificate of completion for a creator course.
 *
 * Honest by design: it states what is true (this learner completed every lesson in this course,
 * taught by this instructor on Plajah, on this date) and carries a reference id. It does NOT claim
 * accreditation or credit. Print / "Save as PDF" is the browser's print dialog; the print stylesheet
 * hides everything except the certificate.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';

interface Props {
  learnerName: string;
  courseTitle: string;
  instructorName: string;
  completedAt: number;
  /** Stable reference, e.g. `${courseId}_${uid}`. */
  refId: string;
  accent?: string;
  onClose: () => void;
}

const shortRef = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return `PLJ-${(h >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
};

export default function CourseCertificate({ learnerName, courseTitle, instructorName, completedAt, refId, accent = '#D40055', onClose }: Props) {
  const date = new Date(completedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return createPortal(
    <div className="pj-cert-root fixed inset-0 z-[2200] overflow-y-auto bg-black/85 backdrop-blur-md">
      <style>{`@media print { body > *:not(.pj-cert-root) { display: none !important; } .pj-cert-root { position: static !important; background: #fff !important; overflow: visible !important; } .pj-cert-actions { display: none !important; } .pj-cert-paper { box-shadow: none !important; margin: 0 !important; max-width: none !important; } @page { size: landscape; margin: 0.4in; } }`}</style>
      <div className="pj-cert-actions sticky top-0 z-10 flex justify-end gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={() => window.print()} className="min-h-[44px] px-4 rounded-xl bg-white text-black text-[11px] font-black uppercase tracking-widest flex items-center gap-2"><Printer size={14} /> Print / save as PDF</button>
        <button onClick={onClose} aria-label="Close certificate" className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20"><X size={18} /></button>
      </div>
      <p className="sm:hidden px-4 text-center text-xs text-white/60">Rotate your phone for the full view, or scroll sideways.</p>
      <div className="overflow-x-auto px-3 pb-6"><div className="pj-cert-paper mx-auto my-4 min-w-[620px] max-w-4xl bg-[#fffdf8] text-[#1a1a1a] shadow-2xl p-3" style={{ aspectRatio: '1.414 / 1' }}>
        <div className="h-full border-[6px] p-2" style={{ borderColor: accent }}>
          <div className="h-full border border-[#1a1a1a]/30 flex flex-col items-center justify-center text-center px-6 sm:px-14">
            <div className="text-[10px] sm:text-xs font-black uppercase tracking-[0.5em]" style={{ color: accent }}>Plajah Academia</div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight mt-3" style={{ fontFamily: 'Georgia, serif' }}>Certificate of Completion</h1>
            <p className="mt-5 text-xs sm:text-sm text-[#1a1a1a]/60">This certifies that</p>
            <div className="mt-2 text-2xl sm:text-4xl font-bold border-b-2 px-6 pb-1" style={{ fontFamily: 'Georgia, serif', borderColor: accent }}>{learnerName}</div>
            <p className="mt-5 text-xs sm:text-sm text-[#1a1a1a]/60">completed every lesson of</p>
            <div className="mt-2 text-lg sm:text-2xl font-black max-w-2xl leading-tight">{courseTitle}</div>
            <p className="mt-2 text-xs sm:text-sm text-[#1a1a1a]/70">taught by {instructorName}</p>
            <div className="mt-8 flex items-end justify-between w-full max-w-2xl text-[10px] sm:text-xs text-[#1a1a1a]/60">
              <div className="text-left"><div className="font-bold text-[#1a1a1a]">{date}</div>Date completed</div>
              <div className="text-right"><div className="font-mono font-bold text-[#1a1a1a]">{shortRef(refId)}</div>Reference</div>
            </div>
            <p className="mt-4 text-[9px] text-[#1a1a1a]/40 max-w-xl">Issued by the course instructor through Plajah. This is a certificate of course completion, not an accredited academic credit.</p>
          </div>
        </div>
      </div>
    </div></div>,
    document.body,
  );
}
