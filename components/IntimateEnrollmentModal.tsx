import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Heart, X, ShieldCheck, CalendarDays, AlertTriangle } from 'lucide-react';
import { enrollIntimate, ageFromDob, MIN_AGE } from '../services/intimateGating';

interface Props {
  uid: string;
  accent?: string;
  onClose: () => void;
  onEnrolled: () => void;
}

/**
 * Opt-in enrollment for Intimate Mode. Accounts ship NOT enrolled; this is the
 * only path to activate it. Captures date of birth (18+ gate) + explicit consent.
 */
const IntimateEnrollmentModal: React.FC<Props> = ({ uid, accent = '#ff6b6b', onClose, onEnrolled }) => {
  const [dob, setDob] = useState('');            // yyyy-mm-dd
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const dobMs = dob ? new Date(dob + 'T00:00:00').getTime() : NaN;
  const age = Number.isFinite(dobMs) ? ageFromDob(dobMs) : null;
  const canEnroll = Number.isFinite(dobMs) && (age ?? 0) >= MIN_AGE && consent && !busy;

  const submit = async () => {
    setError('');
    if (!Number.isFinite(dobMs)) { setError('Enter your date of birth.'); return; }
    if ((age ?? 0) < MIN_AGE) { setError(`Intimate Mode is ${MIN_AGE}+ only.`); return; }
    if (!consent) { setError('Please confirm to continue.'); return; }
    setBusy(true);
    try {
      await enrollIntimate(uid, dobMs);
      onEnrolled();
    } catch (e: any) {
      setError(e?.message || 'Could not enroll. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border overflow-hidden"
        style={{ background: 'rgba(14,5,9,0.96)', borderColor: `${accent}44` }}
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: `${accent}22` }}>
          <Heart size={18} fill={accent} stroke="none" />
          <span className="text-sm font-black uppercase tracking-widest">Enroll in Intimate Mode</span>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 text-[11px] text-white/50 leading-relaxed">
            <ShieldCheck size={16} style={{ color: accent }} className="shrink-0 mt-0.5" />
            <p>Intimate Mode is a private, adults-only space for couples ({MIN_AGE}+). It stays off until you opt in, and only works in a one-on-one direct message.</p>
          </div>

          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-white/40 flex items-center gap-1.5 mb-1.5"><CalendarDays size={11} /> Date of birth</label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/30 [color-scheme:dark]"
            />
            {age !== null && age < MIN_AGE && (
              <p className="mt-1.5 text-[11px] font-bold text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> You must be {MIN_AGE}+ to enroll.</p>
            )}
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-current" style={{ accentColor: accent }} />
            <span className="text-[11px] text-white/60 leading-relaxed">
              I confirm I'm {MIN_AGE} or older and consent to using adult features in a private couples chat.
            </span>
          </label>

          {error && <p className="text-[11px] font-bold text-red-400">{error}</p>}

          <button
            onClick={submit}
            disabled={!canEnroll}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest text-black disabled:opacity-30"
            style={{ background: accent }}
          >
            <Heart size={14} fill="currentColor" /> {busy ? 'Enrolling…' : 'Enroll & Continue'}
          </button>
          <p className="text-[9px] text-white/25 text-center leading-relaxed">You can leave the program anytime in settings.</p>
        </div>
      </motion.div>
    </div>
  );
};

export default IntimateEnrollmentModal;
