import React, { useState } from 'react';
import {
  ChevronLeft, MapPin, Star, Briefcase, HeartHandshake, IdCard, ShieldCheck, Clock,
  UserCheck, Video, Users, Utensils, Calendar, ArrowRight, Ticket, ScrollText,
} from 'lucide-react';
import DemoRibbon from './DemoRibbon';
import StatCard from './statcard/StatCard';
import { buildEmployeeBadge } from '../services/statCardService';
import {
  DEMO_BUSINESS, DEMO_BUSINESS_ORG, DEMO_EMPLOYEES, DEMO_ACTIVE_EMPLOYEE,
  DEMO_POSTINGS, DEMO_APPLICATIONS, DEMO_AUDIT,
} from '../data/demoBusiness';

// A fully-populated, static tour of a Plajah business page from three angles:
// Customer (the public page + careers), Employee (their work badge + role), and
// Admin (the hiring pipeline, staff roles, audit). A teaching demo — action
// buttons show a friendly nudge instead of doing anything real.

const A = '#0070FF';   // work-badge blue
const Y = '#FFD400';   // work-badge yellow
const money = (c: number) => `$${(c / 100).toFixed(0)}`;
const demoAction = () => alert('This is a live demo — create your own business page to make hiring, badges and management real.');

type Mode = 'customer' | 'employee' | 'admin';
const STAGES: { key: string; label: string }[] = [
  { key: 'APPLIED', label: 'Applied' }, { key: 'SCREENING', label: 'Screening' },
  { key: 'INTERVIEW', label: 'Interview' }, { key: 'OFFER', label: 'Offer' }, { key: 'HIRED', label: 'Hired' },
];
const roleLabel = (roleKey?: string) => (DEMO_BUSINESS_ORG.roleDefs || []).find(r => r.key === roleKey)?.label || roleKey || 'Staff';

const Section: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="mt-8">
    <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2">{icon}{title}</h3>
    {children}
  </div>
);

const BusinessDemoView: React.FC<{ onBack?: () => void; onCreate?: () => void }> = ({ onBack, onCreate }) => {
  const [mode, setMode] = useState<Mode>('customer');
  const org = DEMO_BUSINESS_ORG;
  const featured = DEMO_BUSINESS.menuItems?.filter(m => m.isFeatured).slice(0, 3) || [];

  const toggle = (
    <div className="sticky top-[42px] z-30 flex justify-center gap-1 p-2 bg-[#0a0a0d]/95 backdrop-blur-xl border-b border-white/8">
      <div className="inline-flex rounded-full bg-white/5 border border-white/10 p-0.5">
        {([['customer', 'Customer'], ['employee', 'Employee'], ['admin', 'Admin']] as [Mode, string][]).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${mode === m ? 'text-black' : 'text-white/45 hover:text-white'}`}
            style={mode === m ? { background: `linear-gradient(135deg,${A},${Y})` } : undefined}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-full bg-[#050505]">
      <DemoRibbon label="business" onCreate={() => (onCreate ? onCreate() : demoAction())} ctaText="Launch your business" accent={Y} />
      {toggle}

      {/* Hero */}
      <div className="relative h-40 lg:h-52 overflow-hidden">
        <img src={org.coverUrl} alt="" className="w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] to-transparent" />
        {onBack && <button onClick={onBack} className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-2 bg-black/50 backdrop-blur rounded-full text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest"><ChevronLeft size={14} /> Back</button>}
      </div>

      <div className="px-5 lg:px-10 max-w-3xl mx-auto -mt-10 relative pb-20">
        <div className="flex items-end gap-4">
          <img src={org.logoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover border-4 border-[#050505] shrink-0" />
          <div className="pb-1">
            <h1 className="text-2xl lg:text-3xl font-black uppercase tracking-tight text-white">{org.name}</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2 mt-1"><span>{org.category}</span>{org.location?.city && <span className="flex items-center gap-1"><MapPin size={10} /> {org.location.city}</span>}</p>
          </div>
        </div>
        <p className="text-white/55 text-sm mt-4 leading-relaxed">{org.about}</p>

        {/* ── CUSTOMER ─────────────────────────────────────────────── */}
        {mode === 'customer' && (
          <>
            <Section title="On the menu" icon={<Utensils size={12} />}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {featured.map(m => (
                  <div key={m.id} className="rounded-2xl overflow-hidden bg-white/[0.03] border border-white/8">
                    {m.imageUrl && <img src={m.imageUrl} alt="" className="w-full h-24 object-cover" />}
                    <div className="p-3">
                      <p className="text-sm font-bold text-white">{m.name}</p>
                      <p className="text-[11px] text-white/40 line-clamp-2 mt-0.5">{m.description}</p>
                      <p className="text-[11px] font-black text-small-orange mt-1">{money(m.price)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Upcoming events" icon={<Calendar size={12} />}>
              <div className="space-y-2">
                {(DEMO_BUSINESS.events || []).slice(0, 2).map(e => (
                  <div key={e.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8">
                    {e.imageUrl && <img src={e.imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />}
                    <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white truncate">{e.title}</p><p className="text-[10px] text-white/40">{e.time}</p></div>
                    <button onClick={demoAction} className="px-3 py-1.5 rounded-full text-black text-[9px] font-black uppercase tracking-widest shrink-0" style={{ background: A }}><Ticket size={10} className="inline mr-1" />{e.isFree ? 'RSVP' : money((e as any).price || 0)}</button>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Careers — we're hiring" icon={<Briefcase size={12} />}>
              <div className="space-y-2">
                {DEMO_POSTINGS.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/8">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{p.title}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{p.postingType === 'VOLUNTEER' ? 'Volunteer' : (p.employmentType || 'Paid')}{p.compRange ? ` · ${p.compRange}` : ''}{p.isRemote ? ' · Remote' : ''}</p>
                    </div>
                    <button onClick={demoAction} className="px-4 py-2 rounded-full text-black text-[10px] font-black uppercase tracking-widest shrink-0" style={{ background: `linear-gradient(135deg,${A},${Y})` }}>{p.postingType === 'VOLUNTEER' ? 'Sign up' : 'Apply'}</button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-white/30 mt-2">Applicants apply in one tap with their Plajah profile — no resume re-typing.</p>
            </Section>
          </>
        )}

        {/* ── EMPLOYEE ─────────────────────────────────────────────── */}
        {mode === 'employee' && (
          <>
            <div className="mt-8 flex flex-col items-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Your work badge</p>
              <StatCard data={buildEmployeeBadge(DEMO_ACTIVE_EMPLOYEE, org)} />
              <p className="text-[11px] text-white/40 mt-4 text-center max-w-sm">
                As <strong className="text-white/70">{DEMO_ACTIVE_EMPLOYEE.displayName}</strong>, you're the{' '}
                <strong className="text-white/70">{roleLabel(DEMO_ACTIVE_EMPLOYEE.roleKey)}</strong> at {org.name}. Your badge is a
                blue-and-yellow work identity — separate from your personal profile, and it shows up in your{' '}
                <strong className="text-white/70">account switcher</strong> so you can act as staff.
              </p>
            </div>

            <Section title="Your team" icon={<Users size={12} />}>
              <div className="space-y-2">
                {DEMO_EMPLOYEES.map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8">
                    <div className="w-9 h-11 rounded-lg overflow-hidden shrink-0 border" style={{ borderColor: `${A}66`, boxShadow: `0 0 0 1.5px ${A}, 0 0 0 3px ${Y}44` }}>
                      <img src={m.photoUrl || ''} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white truncate">{m.displayName}</p><p className="text-[9px] font-black uppercase tracking-widest" style={{ color: Y }}>{roleLabel(m.roleKey)}</p></div>
                    {m.role === 'OWNER' && <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Owner</span>}
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {/* ── ADMIN ────────────────────────────────────────────────── */}
        {mode === 'admin' && (
          <>
            <Section title="Hiring pipeline" icon={<Briefcase size={12} />}>
              <p className="text-[10px] text-white/30 mb-3">{DEMO_POSTINGS.length} open roles · {DEMO_APPLICATIONS.length} applicants — drag between stages, rate, and hire.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {STAGES.map(s => {
                  const col = DEMO_APPLICATIONS.filter(a => a.stage === s.key);
                  return (
                    <div key={s.key} className="space-y-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/40">{s.label} ({col.length})</p>
                      {col.map(a => (
                        <div key={a.id} className="p-2 rounded-xl bg-white/[0.03] border border-white/8">
                          <p className="text-[11px] font-bold text-white truncate">{a.applicantName}</p>
                          <div className="flex items-center gap-0.5 mt-1">
                            {[1, 2, 3, 4, 5].map(n => <Star key={n} size={9} className={n <= (a.rating || 0) ? 'fill-current' : ''} style={{ color: n <= (a.rating || 0) ? Y : 'rgba(255,255,255,0.15)' }} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="Staff & roles" icon={<ShieldCheck size={12} />}>
              <div className="space-y-2">
                {DEMO_EMPLOYEES.map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8">
                    <img src={m.photoUrl || ''} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                    <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white truncate">{m.displayName}</p><p className="text-[9px] font-black uppercase tracking-widest text-white/30">{roleLabel(m.roleKey)}</p></div>
                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg" style={{ color: A, background: `${A}1f` }}>{m.role}</span>
                    <button onClick={demoAction} className="w-7 h-7 rounded-full bg-white/5 text-white/40 flex items-center justify-center hover:text-white" title="Interview"><Video size={13} /></button>
                    <button onClick={demoAction} className="w-7 h-7 rounded-full flex items-center justify-center text-black" style={{ background: `linear-gradient(135deg,${A},${Y})` }} title="Manage"><UserCheck size={13} /></button>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Activity log" icon={<ScrollText size={12} />}>
              <div className="space-y-1.5">
                {DEMO_AUDIT.map(e => (
                  <div key={e.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/6">
                    <Clock size={11} className="text-white/25 shrink-0" />
                    <p className="text-[11px] text-white/60 flex-1 min-w-0 truncate"><strong className="text-white/80">{e.actor}</strong> {e.action.toLowerCase()} <span className="text-white/45">{e.target}</span></p>
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/25 shrink-0">{e.when}</span>
                  </div>
                ))}
              </div>
            </Section>

            <button onClick={() => (onCreate ? onCreate() : demoAction())} className="mt-8 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-black text-[11px] font-black uppercase tracking-widest" style={{ background: `linear-gradient(135deg,${A},${Y})` }}>
              Launch your own business page <ArrowRight size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default BusinessDemoView;
