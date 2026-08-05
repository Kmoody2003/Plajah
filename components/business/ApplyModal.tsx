import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Check, Loader2, Send } from 'lucide-react';
import { submitApplication } from '../../services/hiringService';
import { auth } from '../../services/backendService';
import type { JobPosting } from '../../types';

// One-tap apply — name/photo/email auto-seed from the signed-in Plajah profile.
const ApplyModal: React.FC<{ posting: JobPosting; orgName: string; onClose: () => void }> = ({ posting, orgName, onClose }) => {
  const isVolunteer = posting.postingType === 'VOLUNTEER';
  const [name, setName] = useState(auth.currentUser?.displayName || '');
  const [message, setMessage] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questions = posting.questions || [];

  const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-[#0070FF]/50 transition-all placeholder:text-white/25';

  const apply = async () => {
    if (!auth.currentUser) { setError('Sign in to apply'); return; }
    if (!name.trim()) { setError('Add your name'); return; }
    const missing = questions.find(q => q.required && !(answers[q.id] || '').trim());
    if (missing) { setError(`Please answer: ${missing.prompt}`); return; }
    setBusy(true); setError(null);
    const merged: Record<string, string> = { ...answers };
    if (message.trim()) merged.message = message.trim();
    const res = await submitApplication(posting, {
      applicantName: name.trim(),
      answers: Object.keys(merged).length ? merged : undefined,
      resumeUrl: resumeUrl.trim() || undefined,
    });
    setBusy(false);
    if (!res) { setError('Could not submit — please try again'); return; }
    setDone(true);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[330] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-[#0a0a0d] border border-white/10 overflow-hidden" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
          <div><p className="text-[11px] font-black uppercase tracking-[0.3em] text-white leading-none">{isVolunteer ? 'Volunteer' : 'Apply'}</p><p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mt-1">{posting.title} · {orgName}</p></div>
          <button onClick={onClose} className="ml-auto w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white"><X size={15} /></button>
        </div>

        {done ? (
          <div className="p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0070FF,#FFD400)' }}><Check size={22} className="text-white" /></div>
            <p className="text-sm font-bold text-white">{isVolunteer ? 'Thanks for signing up!' : 'Application sent!'}</p>
            <p className="text-[11px] text-white/40">{orgName} will review it and reach out.</p>
            <button onClick={onClose} className="w-full py-3 rounded-2xl bg-white/10 text-white text-[11px] font-black uppercase tracking-widest">Done</button>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {posting.description && <p className="text-[11px] text-white/50 leading-relaxed">{posting.description}</p>}
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className={field} />
            {/* Custom questions from the posting */}
            {questions.map(q => (
              <div key={q.id} className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">{q.prompt}{q.required ? ' *' : ''}</label>
                <textarea value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} rows={2} className={`${field} resize-none`} />
              </div>
            ))}
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder={isVolunteer ? 'Availability / why you want to help…' : 'A short note (optional)'} className={`${field} resize-none`} />
            {!isVolunteer && <input value={resumeUrl} onChange={e => setResumeUrl(e.target.value)} placeholder="Resume / portfolio link (optional)" className={field} />}
            {error && <p className="text-[10px] font-bold text-red-400">{error}</p>}
            <button onClick={apply} disabled={busy} className="w-full py-3 rounded-2xl text-black text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#0070FF,#FFD400)' }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <><Send size={13} /> {isVolunteer ? 'Sign up' : 'Submit application'}</>}
            </button>
            <p className="text-[9px] text-white/25 text-center">Applies with your Plajah profile — no resume re-typing.</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default ApplyModal;
