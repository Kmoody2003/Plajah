// TeacherStudentsPanel — a verified teacher provisions student accounts for their roster.
// Each account is walled (school-scoped) and comes with an offline CLAIM CODE the teacher
// hands to the family so a parent can later claim it. Gated by teacher verification: an
// institutional email auto-verifies; otherwise it files a request and provisioning stays off.
// Lives in the Classrooms → Teaching area.

import React, { useEffect, useState } from 'react';
import { GraduationCap, ShieldCheck, ShieldAlert, Plus, Loader2, Copy, Check, AlertCircle, KeyRound, Dice5 } from 'lucide-react';
import { teacherStatus, requestTeacherVerification, provisionChild } from '../services/learnerAuthService';

const WORDS = ['tiger', 'comet', 'maple', 'river', 'pixel', 'mango', 'orbit', 'cedar', 'lemon', 'zebra'];
const genPassword = () => `${WORDS[Math.floor(Math.random() * WORDS.length)]}${WORDS[Math.floor(Math.random() * WORDS.length)]}${Math.floor(10 + Math.random() * 89)}`;
const slugUsername = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 18);

interface Provisioned { displayName: string; username: string; claimCode: string; }

const TeacherStudentsPanel: React.FC<{ user: any }> = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [canProvision, setCanProvision] = useState(false);
  const [verification, setVerification] = useState('UNVERIFIED');
  const [email, setEmail] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [pending, setPending] = useState(false);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [classLabel, setClassLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Provisioned[]>([]);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    let alive = true;
    teacherStatus().then(s => { if (!alive) return; setCanProvision(s.canProvision); setVerification(s.verification); setEmail(s.email); })
      .catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [user?.uid]);

  const verify = async () => {
    setVerifying(true); setError('');
    try {
      const r = await requestTeacherVerification();
      setCanProvision(r.canProvision); setVerification(r.verification); setPending(r.pending);
    } catch (e: any) { setError(e.message || 'Could not verify.'); }
    finally { setVerifying(false); }
  };

  const provision = async () => {
    if (!name.trim() || !username.trim() || !password) return;
    setBusy(true); setError('');
    try {
      const r = await provisionChild({ role: 'teacher', displayName: name.trim(), username: username.trim(), password, classroomId: classLabel.trim() || undefined });
      setCreated(c => [{ displayName: name.trim(), username: r.username, claimCode: r.claimCode || '' }, ...c]);
      setName(''); setUsername(''); setPassword(genPassword());
    } catch (e: any) { setError(e.message || 'Could not create the account.'); }
    finally { setBusy(false); }
  };

  const copy = (text: string) => { navigator.clipboard?.writeText(text); setCopied(text); setTimeout(() => setCopied(''), 1500); };

  if (loading) return <div className="text-center text-white/30 py-10 text-sm">Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-small-orange/15 flex items-center justify-center"><GraduationCap size={20} className="text-small-orange" /></div>
        <div>
          <h2 className="text-lg font-black">Student accounts</h2>
          <p className="text-[11px] text-white/40">Create logins for your class — no student emails. Hand each family a claim code.</p>
        </div>
      </div>

      {/* Verification gate */}
      {!canProvision ? (
        <div className="p-5 bg-white/[0.03] border border-white/10 rounded-2xl">
          <div className="flex items-start gap-3">
            <ShieldAlert size={20} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-black text-sm">Verify your teacher account</div>
              <p className="text-[11px] text-white/50 leading-relaxed mt-1">
                Only verified teachers can create student accounts (a safeguard against misuse). A school email
                {email ? <> (<span className="text-white/70">{email}</span>)</> : ''} verifies instantly; otherwise we'll review your request.
              </p>
              {pending ? (
                <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-400 font-bold"><AlertCircle size={13} /> Request received — pending review. District SSO (Clever/ClassLink) coming soon.</div>
              ) : (
                <button onClick={verify} disabled={verifying} className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-small-orange text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50">
                  {verifying ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Verify teacher account
                </button>
              )}
              {error && <div className="mt-2 flex items-center gap-2 text-[10px] text-red-400"><AlertCircle size={12} /> {error}</div>}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[11px] font-bold text-green-400"><ShieldCheck size={14} /> Verified teacher ({verification})</div>

          {/* Provision form */}
          <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[150px] space-y-1.5">
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Student name</label>
                <input value={name} onChange={e => { setName(e.target.value); if (!username || username === slugUsername(name)) setUsername(slugUsername(e.target.value)); }} placeholder="e.g. Maya R." className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold outline-none placeholder:text-white/20" />
              </div>
              <div className="flex-1 min-w-[140px] space-y-1.5">
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Username</label>
                <input value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" placeholder="maya.r" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold outline-none placeholder:text-white/20" />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[150px] space-y-1.5">
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Password</label>
                <div className="flex gap-2">
                  <input value={password} onChange={e => setPassword(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold outline-none" />
                  <button onClick={() => setPassword(genPassword())} title="Generate" className="px-3 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white"><Dice5 size={15} /></button>
                </div>
              </div>
              <div className="w-40 space-y-1.5">
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Class (optional)</label>
                <input value={classLabel} onChange={e => setClassLabel(e.target.value)} placeholder="Room 4B" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold outline-none placeholder:text-white/20" />
              </div>
              <button onClick={provision} disabled={busy || !name.trim() || !username.trim() || !password} className="px-5 py-2.5 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-30">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <span className="flex items-center gap-1.5"><Plus size={13} /> Create</span>}
              </button>
            </div>
            {error && <div className="flex items-center gap-2 text-[10px] text-red-400"><AlertCircle size={12} /> {error}</div>}
          </div>

          {/* Created accounts + claim codes */}
          {created.length > 0 && (
            <div className="space-y-2">
              <div className="text-[9px] font-black uppercase tracking-widest text-white/40">Created this session — give each family their claim code</div>
              {created.map((c, i) => (
                <div key={i} className="p-3 bg-white/[0.03] border border-white/10 rounded-xl flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[120px]">
                    <div className="font-black text-sm">{c.displayName}</div>
                    <div className="text-[10px] text-white/40">signs in as <span className="text-white/70 font-bold">@{c.username}</span></div>
                  </div>
                  {c.claimCode && (
                    <button onClick={() => copy(c.claimCode)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-small-orange/15 border border-small-orange/30 text-small-orange font-black tracking-widest text-xs hover:bg-small-orange/25 transition-all">
                      <KeyRound size={13} /> {c.claimCode}
                      {copied === c.claimCode ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  )}
                </div>
              ))}
              <p className="text-[10px] text-white/30 leading-relaxed">Claim codes are single-use and expire in 30 days. A parent enters the code in their <b className="text-white/50">Family</b> tab to take ownership; you keep classroom-scoped progress while the student is enrolled.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TeacherStudentsPanel;
