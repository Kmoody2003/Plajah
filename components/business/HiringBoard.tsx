import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Plus, Loader2, Star, Briefcase, HeartHandshake, ChevronRight, UserCheck, Video, Link2, Trash2, MessageSquarePlus } from 'lucide-react';
import {
  fetchOrgPostings, fetchApplications, createJobPosting, closeJobPosting,
  moveApplicationStage, rateApplication, hireApplicant, addApplicationNote,
} from '../../services/hiringService';
import { createRoom, roomShareUrl } from '../../services/roomService';
import { auth } from '../../services/backendService';
import { orgCan } from '../../services/orgPermissions';
import type { Organization, OrgMembership, JobPosting, Application, ApplicationStage, ApplicationQuestion, OrgRole } from '../../types';

const STAGES: { key: ApplicationStage; label: string }[] = [
  { key: 'APPLIED', label: 'Applied' },
  { key: 'SCREENING', label: 'Screening' },
  { key: 'INTERVIEW', label: 'Interview' },
  { key: 'OFFER', label: 'Offer' },
  { key: 'HIRED', label: 'Hired' },
];

const HiringBoard: React.FC<{ org: Organization; myMembership?: OrgMembership | null; onClose?: () => void }> = ({ org, myMembership, onClose }) => {
  const roleDefs = org.roleDefs || [];
  const canManage = orgCan(myMembership, org, 'MANAGE_EMPLOYEES');
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [selected, setSelected] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // New-posting form
  const [pType, setPType] = useState<'JOB' | 'VOLUNTEER'>('JOB');
  const [pTitle, setPTitle] = useState('');
  const [pRole, setPRole] = useState(roleDefs.find(r => r.key !== 'OWNER')?.key || '');
  const [pDesc, setPDesc] = useState('');
  const [pQuestions, setPQuestions] = useState<ApplicationQuestion[]>([]);
  const [pQ, setPQ] = useState('');

  // Applicant detail drawer
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [noteText, setNoteText] = useState('');
  const [roomBusy, setRoomBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [ps, as] = await Promise.all([fetchOrgPostings(org.id), fetchApplications(org.id)]);
    setPostings(ps); setApps(as); setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org.id]);

  const roleFor = (key?: string) => roleDefs.find(r => r.key === key);
  const baseRoleFor = (key?: string): OrgRole => roleFor(key)?.baseRole || 'STAFF';

  const submitPosting = async () => {
    if (!pTitle.trim()) return;
    setBusy(true);
    await createJobPosting({ orgId: org.id, title: pTitle.trim(), postingType: pType, roleKey: pRole || undefined, description: pDesc.trim(), questions: pQuestions.length ? pQuestions : undefined, employmentType: pType === 'VOLUNTEER' ? 'VOLUNTEER' : undefined });
    setBusy(false); setCreating(false); setPTitle(''); setPDesc(''); setPQuestions([]); setPQ('');
    load();
  };
  const addQuestion = () => {
    if (!pQ.trim()) return;
    setPQuestions(qs => [...qs, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, prompt: pQ.trim(), type: 'TEXT' }]);
    setPQ('');
  };

  const addNote = async () => {
    if (!selectedApp || !noteText.trim()) return;
    await addApplicationNote(selectedApp.id, noteText.trim());
    setNoteText('');
    const fresh = await fetchApplications(org.id, selectedApp.jobId);
    setApps(prev => prev.map(a => fresh.find(f => f.id === a.id) || a));
    setSelectedApp(fresh.find(f => f.id === selectedApp.id) || selectedApp);
  };
  const startInterview = async (app: Application) => {
    if (!auth.currentUser) return;
    setRoomBusy(true);
    try {
      const room = await createRoom({
        title: `Interview · ${app.applicantName}`,
        durationMins: 45,
        user: { uid: auth.currentUser.uid, displayName: auth.currentUser.displayName, photoURL: auth.currentUser.photoURL },
        kind: 'TOPIC',
        capabilities: { chat: true, presence: true, video: true },
        context: { accent: '#0070FF' },
      });
      try { await navigator.clipboard.writeText(roomShareUrl(room.id)); } catch { /* clipboard optional */ }
      window.dispatchEvent(new CustomEvent('plajah:open-room', { detail: { roomId: room.id } }));
      onClose?.();
    } finally { setRoomBusy(false); }
  };

  const advance = async (app: Application, stage: ApplicationStage) => { await moveApplicationStage(app, stage); load(); };
  const rate = async (app: Application, n: number) => { await rateApplication(app.id, n); load(); };
  const hire = async (app: Application, posting: JobPosting) => {
    if (!window.confirm(`Hire ${app.applicantName} as ${roleFor(posting.roleKey)?.label || 'staff'}? This creates their work badge.`)) return;
    setBusy(true);
    await hireApplicant(posting, app, posting.roleKey, baseRoleFor(posting.roleKey));
    setBusy(false); load();
  };

  const postingApps = (jobId: string) => apps.filter(a => a.jobId === jobId && a.stage !== 'WITHDRAWN' && a.stage !== 'REJECTED');
  const field = 'bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-[#0070FF]/50 transition-all placeholder:text-white/25';
  const isVolunteerOrg = org.orgType === 'CHURCH' || org.orgType === 'NONPROFIT' || org.orgType === 'CULTURAL';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[320] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} onClick={e => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0a0a0d] border border-white/10" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>

        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 sticky top-0 bg-[#0a0a0d] z-10">
          {isVolunteerOrg ? <HeartHandshake size={18} className="text-[#0070FF]" /> : <Briefcase size={18} className="text-[#0070FF]" />}
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white leading-none">{isVolunteerOrg ? 'Volunteers & Hiring' : 'Hiring'}</p>
            <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mt-1">{org.name}</p>
          </div>
          {onClose && <button onClick={onClose} className="ml-auto w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white"><X size={15} /></button>}
        </div>

        <div className="p-5 space-y-5">
          {!canManage && <p className="text-[10px] font-bold text-amber-400/80 px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/20">You need the Manage-Employees permission to post openings and review applicants.</p>}

          {/* Postings list + create */}
          {!selected && (
            <>
              {canManage && (creating ? (
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-3">
                  <div className="flex gap-2">
                    {(['JOB', 'VOLUNTEER'] as const).map(t => (
                      <button key={t} onClick={() => setPType(t)} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${pType === t ? 'bg-white/15 text-white' : 'bg-white/[0.03] text-white/40'}`}>{t === 'JOB' ? 'Paid job' : 'Volunteer'}</button>
                    ))}
                  </div>
                  <input value={pTitle} onChange={e => setPTitle(e.target.value)} placeholder="Posting title (e.g. Line Cook)" className={`${field} w-full`} />
                  {roleDefs.length > 0 && (
                    <select value={pRole} onChange={e => setPRole(e.target.value)} className={`${field} w-full`}>
                      <option value="">No specific role</option>
                      {roleDefs.filter(r => r.key !== 'OWNER').map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  )}
                  <textarea value={pDesc} onChange={e => setPDesc(e.target.value)} rows={3} placeholder="What the role involves…" className={`${field} w-full resize-none`} />
                  {/* Custom application questions */}
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Application questions (optional)</p>
                    {pQuestions.map((q, i) => (
                      <div key={q.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/8">
                        <span className="text-[11px] text-white/70 flex-1 truncate">{i + 1}. {q.prompt}</span>
                        <button onClick={() => setPQuestions(qs => qs.filter(x => x.id !== q.id))} className="text-white/30 hover:text-red-400"><Trash2 size={12} /></button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input value={pQ} onChange={e => setPQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addQuestion(); } }} placeholder="Add a question applicants answer…" className={`${field} flex-1`} />
                      <button onClick={addQuestion} disabled={!pQ.trim()} className="px-3 py-2 rounded-xl bg-white/5 text-white/60 text-[10px] font-black uppercase tracking-widest disabled:opacity-30">Add</button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={submitPosting} disabled={busy || !pTitle.trim()} className="flex-1 py-2.5 rounded-xl text-black text-[11px] font-black uppercase tracking-widest disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#0070FF,#FFD400)' }}>{busy ? 'Posting…' : 'Post opening'}</button>
                    <button onClick={() => setCreating(false)} className="px-4 py-2.5 rounded-xl bg-white/5 text-white/50 text-[11px] font-black uppercase tracking-widest">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setCreating(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-white/15 text-white/50 hover:text-white hover:border-white/30 text-[11px] font-black uppercase tracking-widest"><Plus size={14} /> Post an opening</button>
              ))}

              {loading ? <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-white/40" /></div> : postings.length === 0 ? (
                <p className="text-center text-white/30 text-xs py-6">No openings yet.</p>
              ) : postings.map(p => (
                <button key={p.id} onClick={() => setSelected(p)} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/8 hover:border-white/20 text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{p.title} {p.status !== 'OPEN' && <span className="text-[8px] font-black uppercase tracking-widest text-white/30">· {p.status}</span>}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{p.postingType === 'VOLUNTEER' ? 'Volunteer' : 'Paid'}{p.roleKey ? ` · ${roleFor(p.roleKey)?.label}` : ''} · {postingApps(p.id).length} applicants</p>
                  </div>
                  <ChevronRight size={16} className="text-white/30" />
                </button>
              ))}
            </>
          )}

          {/* Selected posting → applicant board */}
          {selected && (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelected(null)} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">← Openings</button>
                <span className="text-sm font-bold text-white ml-2 truncate">{selected.title}</span>
                {canManage && selected.status === 'OPEN' && <button onClick={async () => { await closeJobPosting(selected.id); load(); setSelected(null); }} className="ml-auto text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-red-400">Close posting</button>}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {STAGES.map(stage => {
                  const col = postingApps(selected.id).filter(a => a.stage === stage.key);
                  return (
                    <div key={stage.key} className="space-y-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/40">{stage.label} ({col.length})</p>
                      {col.map(app => (
                        <div key={app.id} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/8 space-y-1.5">
                          <button onClick={() => setSelectedApp(app)} className="text-[11px] font-bold text-white truncate block w-full text-left hover:text-[#4da3ff]">{app.applicantName}{app.rating ? <span className="ml-1 text-[#FFD400]">★{app.rating}</span> : ''}</button>
                          {canManage && (
                            <>
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => rate(app, n)}><Star size={10} className={n <= (app.rating || 0) ? 'text-[#FFD400] fill-[#FFD400]' : 'text-white/20'} /></button>)}
                              </div>
                              {stage.key !== 'HIRED' && (
                                <div className="flex gap-1">
                                  <select value={app.stage} onChange={e => advance(app, e.target.value as ApplicationStage)} className="flex-1 bg-black/40 border border-white/10 rounded-lg px-1 py-1 text-[9px] font-bold text-white/70 outline-none">
                                    {STAGES.filter(s => s.key !== 'HIRED').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                    <option value="REJECTED">Reject</option>
                                  </select>
                                  <button onClick={() => hire(app, selected)} title="Hire" className="w-6 h-6 rounded-lg bg-[#0070FF]/20 text-[#4da3ff] flex items-center justify-center shrink-0"><UserCheck size={12} /></button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Applicant detail drawer — answers, notes, interview room, hire */}
      {selectedApp && (() => {
        const posting = postings.find(p => p.id === selectedApp.jobId);
        return (
          <div className="fixed inset-0 z-[335] bg-black/80 flex items-center justify-center p-4" onClick={() => setSelectedApp(null)}>
            <div onClick={e => e.stopPropagation()} className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-3xl bg-[#0c0c10] border border-white/10 p-5 space-y-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-black text-white truncate">{selectedApp.applicantName}</p>
                  {selectedApp.applicantEmail && <p className="text-[10px] text-white/40 truncate">{selectedApp.applicantEmail}</p>}
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-1">{posting?.title} · {selectedApp.stage}</p>
                </div>
                <button onClick={() => setSelectedApp(null)} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white"><X size={15} /></button>
              </div>

              {/* Rating */}
              {canManage && (
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => <button key={n} onClick={async () => { await rateApplication(selectedApp.id, n); setSelectedApp({ ...selectedApp, rating: n }); load(); }}><Star size={16} className={n <= (selectedApp.rating || 0) ? 'text-[#FFD400] fill-[#FFD400]' : 'text-white/20'} /></button>)}
                </div>
              )}

              {/* Answers */}
              {selectedApp.answers && Object.keys(selectedApp.answers).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(selectedApp.answers).map(([k, v]) => {
                    const q = posting?.questions?.find(x => x.id === k);
                    return (
                      <div key={k} className="p-3 rounded-xl bg-white/[0.03] border border-white/8">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/40">{q?.prompt || (k === 'message' ? 'Note' : k)}</p>
                        <p className="text-[12px] text-white/80 mt-1 whitespace-pre-wrap">{v}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedApp.resumeUrl && <a href={selectedApp.resumeUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[11px] font-bold text-[#4da3ff] hover:underline"><Link2 size={12} /> Resume / portfolio</a>}

              {/* Notes */}
              {canManage && (
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Staff notes</p>
                  {(selectedApp.notes || []).map(n => (
                    <div key={n.id} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/8">
                      <p className="text-[11px] text-white/80 whitespace-pre-wrap">{n.text}</p>
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mt-1">{n.authorName || 'Staff'}</p>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } }} placeholder="Add a private note…" className={`${field} flex-1`} />
                    <button onClick={addNote} disabled={!noteText.trim()} className="px-3 rounded-xl bg-white/5 text-white/60 flex items-center disabled:opacity-30"><MessageSquarePlus size={15} /></button>
                  </div>
                </div>
              )}

              {/* Actions */}
              {canManage && selectedApp.stage !== 'HIRED' && posting && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => startInterview(selectedApp)} disabled={roomBusy} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/8 border border-white/10 text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-50">
                    {roomBusy ? <Loader2 size={14} className="animate-spin" /> : <><Video size={14} /> Interview</>}
                  </button>
                  <button onClick={async () => { await hire(selectedApp, posting); setSelectedApp(null); }} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-black text-[11px] font-black uppercase tracking-widest" style={{ background: 'linear-gradient(135deg,#0070FF,#FFD400)' }}>
                    <UserCheck size={14} /> Hire
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </motion.div>
  );
};

export default HiringBoard;
