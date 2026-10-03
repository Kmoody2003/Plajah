import React from 'react';
import { Eye, X } from 'lucide-react';
import { setRoleLens, type LensRole } from '../../services/roleLens';

/**
 * Admin-only "Experience as…" bar. Floats over every screen while a lens is active (so the admin
 * can always get back out), and offers the three roles from the Academia hubs when it isn't.
 * It never creates demo data — the admin acts as themselves in a different role.
 */
const ROLES: Array<{ id: LensRole; label: string; emoji: string }> = [
  { id: 'teacher', label: 'Teacher', emoji: '🍎' },
  { id: 'student', label: 'Student', emoji: '🎒' },
  { id: 'parent', label: 'Parent', emoji: '🏡' },
];

const RoleLensBar: React.FC<{ lens: LensRole | null; onChange: (r: LensRole | null) => void; compact?: boolean }> = ({ lens, onChange, compact }) => {
  const pick = (r: LensRole | null) => { setRoleLens(r); onChange(r); };
  return (
    <div role="group" aria-label="Experience Academia as a role (admin)"
      className="fixed z-[80] left-1/2 -translate-x-1/2 bottom-20 sm:bottom-5 flex items-center gap-1 rounded-full border border-white/15 bg-[#130e1c]/95 backdrop-blur px-2 py-1.5 shadow-2xl text-white">
      <span className="hidden sm:inline-flex items-center gap-1 pl-2 pr-1 text-[10px] font-black uppercase tracking-widest text-white/50"><Eye size={12} /> Admin view</span>
      {ROLES.map(r => (
        <button key={r.id} type="button" aria-pressed={lens === r.id} onClick={() => pick(lens === r.id ? null : r.id)}
          className={`h-8 px-3 rounded-full text-[12px] font-black transition-colors ${lens === r.id ? 'bg-white text-[#12091b]' : 'text-white/70 hover:bg-white/10'}`}>
          <span className="mr-1">{r.emoji}</span>{compact ? '' : r.label}
        </button>
      ))}
      {lens && <button type="button" aria-label="Exit role view" onClick={() => pick(null)} className="h-8 w-8 grid place-items-center rounded-full text-white/60 hover:bg-white/10"><X size={14} /></button>}
    </div>
  );
};
export default RoleLensBar;
