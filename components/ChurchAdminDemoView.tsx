import React, { useState } from 'react';
import {
  LayoutDashboard, Mail, Users, Gift, Calendar, HandHeart, UserCog, MonitorPlay, GraduationCap,
  Send, Upload, Download, Plus, Check, TrendingUp, Building2, Radio, Dot, DollarSign, ArrowRight, Sparkles,
} from 'lucide-react';
import { DEMO_CHURCH, DEMO_CHURCH_STAFF, DEMO_CHURCH_EVENTS, DEMO_CHURCH_PRAYERS } from '../data/demoShowcase';
import { AdaptiveGrid, TYPE } from '../src/lib/designSystem';

// ── Ministry Admin — the BACKEND, shown as a live demo ─────────────────────────
// The congregant-facing tour lives in ChurchDemoView. This is the other half: the
// back-office a ministry actually runs on — broadcasts, people/Servant Keeper import,
// a giving dashboard, prayer moderation, roster & roles, multi-site master control,
// and classes. Mirrors the real owner tools in OrgHub (ChurchConsole / ChurchGive /
// ChurchMasterControl / SermonStudio) so a prospective church SEES how they'd run it.
// Nothing moves money or sends a message — every action shows a friendly nudge.

const V = '#8B5CF6';   // spiritual violet
const VS = '#B79BF5';
const nudge = () => alert('This is a live demo of the ministry backend. Create your church space and this runs for real — broadcasts, giving, people, prayer and multi-site all wired to your account.');

type Section = 'OVERVIEW' | 'MESSAGES' | 'PEOPLE' | 'GIVING' | 'EVENTS' | 'PRAYER' | 'TEAM' | 'MULTISITE' | 'CLASSES';

// ── Demo back-office data (illustrative; clearly a demo) ──
const CONGREGANTS = [
  { id: 'c1', name: 'The Alvarez Family', email: 'alvarez@email.com', phone: '(555) 201-3345', household: 'Alvarez', status: 'Member' },
  { id: 'c2', name: 'Marcus Bell', email: 'marcus.b@email.com', phone: '(555) 664-0192', household: 'Bell', status: 'Member' },
  { id: 'c3', name: 'Priya Nair', email: 'priya.n@email.com', phone: '(555) 887-4410', household: 'Nair', status: 'Regular' },
  { id: 'c4', name: 'Jordan & Kim Ellis', email: 'ellis.home@email.com', phone: '(555) 330-7781', household: 'Ellis', status: 'Member' },
  { id: 'c5', name: 'Grace Okafor', email: 'g.okafor@email.com', phone: '(555) 412-6650', household: 'Okafor', status: 'Visitor' },
  { id: 'c6', name: 'The Thompson Family', email: 'thompsons@email.com', phone: '(555) 998-2201', household: 'Thompson', status: 'Member' },
];
const GIFTS = [
  { id: 'g1', name: 'Angela Brooks', fund: 'General Fund', amount: 250, when: 'Today · 9:14 AM', recurring: true },
  { id: 'g2', name: 'Anonymous', fund: 'Missions', amount: 100, when: 'Today · 8:02 AM', recurring: false },
  { id: 'g3', name: 'Marcus Bell', fund: 'Building Fund', amount: 500, when: 'Yesterday', recurring: true },
  { id: 'g4', name: 'The Ellis Family', fund: 'General Fund', amount: 150, when: 'Yesterday', recurring: true },
  { id: 'g5', name: 'Priya Nair', fund: 'Benevolence', amount: 75, when: '2 days ago', recurring: false },
];
const MESSAGES_SENT = [
  { id: 'm1', subject: 'This Sunday: Baptism Service', when: '2 days ago', reach: 842, channels: 'In-app · Push · Email' },
  { id: 'm2', subject: 'Volunteers needed — Fall Festival', when: '5 days ago', reach: 318, channels: 'In-app · Push' },
  { id: 'm3', subject: 'Weekly devotional', when: '1 week ago', reach: 842, channels: 'In-app · Email' },
];
const CLASSES = [
  { id: 'cl1', title: 'Foundations of Faith', enrolled: 38, lessons: 8, status: 'Active' },
  { id: 'cl2', title: 'Marriage & Family', enrolled: 22, lessons: 6, status: 'Active' },
  { id: 'cl3', title: 'Discipleship 201', enrolled: 15, lessons: 10, status: 'Draft' },
];
const CAMPUSES = (DEMO_CHURCH.campuses && DEMO_CHURCH.campuses.length ? DEMO_CHURCH.campuses : [
  { id: 'main', name: 'Downtown Campus', location: 'Main Auditorium', isPrimary: true },
  { id: 'north', name: 'North Campus', location: 'North Suburb', isPrimary: false },
  { id: 'online', name: 'Online Campus', location: 'plajah.live', isPrimary: false },
]) as { id: string; name: string; location?: string; isPrimary?: boolean }[];

const money = (n: number) => `$${n.toLocaleString()}`;
const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-violet-400/50 transition-all placeholder:text-white/25';

const KPI: React.FC<{ label: string; value: string; sub?: string; icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }> }> = ({ label, value, sub, icon: Icon }) => (
  <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
    <div className="flex items-center justify-between mb-2"><span className={`${TYPE.labelSm} font-black uppercase tracking-widest text-white/35`}>{label}</span><Icon size={14} style={{ color: VS }} /></div>
    <p className="text-2xl font-black text-white tabular-nums">{value}</p>
    {sub && <p className={`${TYPE.labelMd} font-bold mt-0.5`} style={{ color: VS }}>{sub}</p>}
  </div>
);
const Btn: React.FC<{ children: React.ReactNode; primary?: boolean; onClick?: () => void }> = ({ children, primary, onClick }) => (
  <button onClick={onClick || nudge}
    className={`flex items-center gap-1.5 px-4 py-2 rounded-full ${TYPE.labelMd} font-black uppercase tracking-widest transition-all ${primary ? 'text-white hover:brightness-110' : 'bg-white/5 border border-white/10 text-white/60 hover:text-white'}`}
    style={primary ? { background: V } : undefined}>{children}</button>
);
const H: React.FC<{ children: React.ReactNode; sub?: string }> = ({ children, sub }) => (
  <div className="mb-5"><h2 className="text-xl font-black uppercase tracking-tight text-white">{children}</h2>{sub && <p className="type-body-sm text-white/40 mt-0.5">{sub}</p>}</div>
);

const ChurchAdminDemoView: React.FC<{ onCreate: () => void }> = ({ onCreate }) => {
  const [sec, setSec] = useState<Section>('OVERVIEW');
  const c = DEMO_CHURCH;
  const funds = c.givingFunds || [];
  const weekGiving = GIFTS.reduce((s, g) => s + g.amount, 0) + 4210;

  const NAV: { k: Section; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { k: 'OVERVIEW', label: 'Overview', icon: LayoutDashboard },
    { k: 'MESSAGES', label: 'Messages', icon: Mail },
    { k: 'PEOPLE', label: 'People', icon: Users },
    { k: 'GIVING', label: 'Giving', icon: Gift },
    { k: 'EVENTS', label: 'Events', icon: Calendar },
    { k: 'PRAYER', label: 'Prayer', icon: HandHeart },
    { k: 'TEAM', label: 'Team & Roles', icon: UserCog },
    { k: 'MULTISITE', label: 'Multi-site', icon: MonitorPlay },
    { k: 'CLASSES', label: 'Classes', icon: GraduationCap },
  ];

  return (
    <div className="h-full overflow-hidden flex flex-col bg-[#0d0b12]">
      {/* Demo banner */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-white/8" style={{ background: 'rgba(139,92,246,0.10)' }}>
        <span className={`${TYPE.labelSm} font-black uppercase tracking-widest px-2 py-1 rounded-md text-white`} style={{ background: V }}>Demo Backend</span>
        <p className="type-body-sm font-bold text-white/60 truncate">{c.name} · Ministry admin — this is what running your church looks like</p>
        <button onClick={onCreate} className={`ml-auto shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full ${TYPE.labelMd} font-black uppercase tracking-widest text-white`} style={{ background: V }}>Create your church <ArrowRight size={12} /></button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Sidebar */}
        <nav className="w-16 lg:w-52 shrink-0 border-r border-white/8 p-2 lg:p-3 overflow-y-auto scrollbar-hide">
          {NAV.map(({ k, label, icon: Icon }) => (
            <button key={k} onClick={() => setSec(k)}
              className={`w-full flex items-center gap-2.5 px-2 lg:px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all mb-1 ${sec === k ? 'text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
              style={sec === k ? { background: 'rgba(139,92,246,0.18)' } : undefined}>
              <Icon size={15} className="shrink-0" /> <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-hide p-4 sm:p-5 lg:p-8">
          {sec === 'OVERVIEW' && (
            <div className="max-w-4xl">
              <H sub="Everything about your ministry at a glance.">Overview</H>
              <AdaptiveGrid phone={2} tablet={2} desktop={4} gap="0.75rem" className="mb-6">
                <KPI label="Members" value="842" sub="+18 this month" icon={Users} />
                <KPI label="Giving · this week" value={money(weekGiving)} sub="+12% vs last" icon={TrendingUp} />
                <KPI label="Prayer requests" value={String(DEMO_CHURCH_PRAYERS.length + 9)} sub="3 new today" icon={HandHeart} />
                <KPI label="Campuses" value={String(CAMPUSES.length)} sub="1 live now" icon={Building2} />
              </AdaptiveGrid>
              <AdaptiveGrid phone={1} tablet={1} desktop={2} gap="1rem">
                <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                  <p className={`${TYPE.labelMd} font-black uppercase tracking-widest text-white/40 mb-3`}>Recent giving</p>
                  {GIFTS.slice(0, 4).map(g => (
                    <div key={g.id} className="flex items-center justify-between py-2 border-b border-white/6 last:border-0">
                      <div><p className="type-title-sm font-bold text-white">{g.name}</p><p className={`${TYPE.labelSm} text-white/35 uppercase tracking-widest`}>{g.fund}{g.recurring ? ' · recurring' : ''}</p></div>
                      <span className="text-sm font-black tabular-nums" style={{ color: VS }}>{money(g.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                  <p className={`${TYPE.labelMd} font-black uppercase tracking-widest text-white/40 mb-3`}>Quick actions</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Btn onClick={() => setSec('MESSAGES')}><Send size={12} /> Broadcast</Btn>
                    <Btn onClick={() => setSec('PEOPLE')}><Upload size={12} /> Import people</Btn>
                    <Btn onClick={() => setSec('GIVING')}><DollarSign size={12} /> Giving</Btn>
                    <Btn onClick={() => setSec('MULTISITE')}><Radio size={12} /> Go live</Btn>
                  </div>
                </div>
              </AdaptiveGrid>
            </div>
          )}

          {sec === 'MESSAGES' && (
            <div className="max-w-2xl">
              <H sub="Broadcast to every member — in-app, push and email.">Messages · Console</H>
              <div className="space-y-3 mb-8">
                <input placeholder="Subject" className={field} />
                <textarea rows={5} placeholder="Your message to the congregation…" className={`${field} resize-none`} />
                <div className="flex flex-wrap gap-2">
                  {['In-app', 'Push', 'Email'].map(ch => <span key={ch} className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl ${TYPE.labelMd} font-black uppercase tracking-widest text-white`} style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}><Check size={12} /> {ch}</span>)}
                </div>
                <button onClick={nudge} className="w-full py-3.5 rounded-full font-black text-xs uppercase tracking-widest text-white flex items-center justify-center gap-2" style={{ background: V }}><Send size={16} /> Send to all 842 members</button>
              </div>
              <p className={`${TYPE.labelMd} font-black uppercase tracking-widest text-white/40 mb-3`}>Recently sent</p>
              <div className="space-y-2">
                {MESSAGES_SENT.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10">
                    <Mail size={15} style={{ color: VS }} className="shrink-0" />
                    <div className="min-w-0 flex-1"><p className="type-title-sm font-bold text-white truncate">{m.subject}</p><p className={`${TYPE.labelSm} text-white/35 uppercase tracking-widest`}>{m.when} · {m.channels}</p></div>
                    <span className={`${TYPE.labelMd} font-black tabular-nums text-white/50 shrink-0`}>{m.reach} reached</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === 'PEOPLE' && (
            <div className="max-w-3xl">
              <H sub="Your directory — import from Servant Keeper, export anytime.">People</H>
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <Btn primary onClick={nudge}><Upload size={12} /> Import CSV (Servant Keeper)</Btn>
                <Btn><Download size={12} /> Export people</Btn>
                <Btn><Download size={12} /> Export giving</Btn>
                <Btn><Plus size={12} /> Add person</Btn>
              </div>
              <div className="rounded-2xl border border-white/10 overflow-hidden">
                <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr] gap-2 px-4 py-2.5 bg-white/[0.04] text-[8px] font-black uppercase tracking-widest text-white/40">
                  <span>Name</span><span>Email</span><span>Phone</span><span>Status</span>
                </div>
                {CONGREGANTS.map(p => (
                  <div key={p.id} className="grid grid-cols-[2fr_2fr_1.5fr_1fr] gap-2 px-4 py-3 border-t border-white/6 items-center hover:bg-white/[0.02]">
                    <span className="text-xs font-bold text-white truncate">{p.name}</span>
                    <span className="text-[11px] text-white/50 truncate">{p.email}</span>
                    <span className="text-[11px] text-white/50 truncate tabular-nums">{p.phone}</span>
                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full w-fit" style={{ color: VS, background: 'rgba(139,92,246,0.14)' }}>{p.status}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-white/30 mt-3">842 people on file · showing a sample. Households, tags, notes and giving history attach to each record.</p>
            </div>
          )}

          {sec === 'GIVING' && (
            <div className="max-w-3xl">
              <H sub="Funds, recurring gifts and payouts — on your own Stripe account.">Giving Dashboard</H>
              <AdaptiveGrid phone={2} tablet={2} desktop={4} gap="0.75rem" className="mb-6">
                <KPI label="This week" value={money(weekGiving)} sub="+12%" icon={TrendingUp} />
                <KPI label="This month" value={money(weekGiving * 4 + 1200)} icon={DollarSign} />
                <KPI label="Recurring givers" value="214" sub="+9 this month" icon={Users} />
                <KPI label="Next payout" value="$18,340" sub="Fri · Stripe" icon={Gift} />
              </AdaptiveGrid>
              {funds.length > 0 && (
                <>
                  <p className={`${TYPE.labelMd} font-black uppercase tracking-widest text-white/40 mb-3`}>Funds</p>
                  <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="0.75rem" className="mb-6">
                    {funds.map(f => {
                      const pct = f.goal ? Math.min(100, Math.round((f.raised || 0) / f.goal * 100)) : 0;
                      return (
                        <div key={f.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                          <div className="flex items-center justify-between mb-1"><p className="text-sm font-black text-white">{f.name}</p><Btn onClick={nudge}>Edit</Btn></div>
                          {f.description && <p className="text-[10px] text-white/40 mb-2">{f.description}</p>}
                          {f.goal ? (<>
                            <div className="h-2 rounded-full bg-black/40 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: V }} /></div>
                            <div className={`flex justify-between mt-1.5 ${TYPE.labelMd} font-bold uppercase tracking-widest text-white/40 tabular-nums`}><span style={{ color: VS }}>{money(f.raised || 0)}</span><span>of {money(f.goal)}</span></div>
                          </>) : <p className="text-[10px] text-white/30">Ongoing fund</p>}
                        </div>
                      );
                    })}
                  </AdaptiveGrid>
                </>
              )}
              <p className={`${TYPE.labelMd} font-black uppercase tracking-widest text-white/40 mb-3`}>Recent gifts</p>
              <div className="rounded-2xl border border-white/10 overflow-hidden">
                {GIFTS.map(g => (
                  <div key={g.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/6 last:border-0 hover:bg-white/[0.02]">
                    <div className="min-w-0 flex-1"><p className="type-title-sm font-bold text-white truncate">{g.name}</p><p className={`${TYPE.labelSm} text-white/35 uppercase tracking-widest`}>{g.fund} · {g.when}{g.recurring ? ' · recurring' : ''}</p></div>
                    <span className="text-sm font-black tabular-nums shrink-0" style={{ color: VS }}>{money(g.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === 'EVENTS' && (
            <div className="max-w-3xl">
              <H sub="Ticketing, RSVPs and check-in — built in.">Events</H>
              <div className="mb-5"><Btn primary onClick={nudge}><Plus size={12} /> New event</Btn></div>
              <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="0.75rem">
                {DEMO_CHURCH_EVENTS.map((e, i) => (
                  <div key={e.id} className="rounded-2xl overflow-hidden bg-white/[0.03] border border-white/10">
                    <img src={e.image} className="w-full h-32 object-cover" alt="" loading="lazy" />
                    <div className="p-4">
                      <p className={`${TYPE.labelSm} font-black uppercase tracking-widest mb-1`} style={{ color: VS }}>{e.date} · {e.time}</p>
                      <h4 className="text-sm font-black text-white mb-2">{e.title}</h4>
                      <div className={`flex items-center justify-between ${TYPE.labelMd} font-bold uppercase tracking-widest text-white/40`}>
                        <span>{[128, 342, 96][i] ?? 40} RSVPs</span>
                        <span>{e.price === 'FREE' ? 'Free' : `$${e.price} · ${[0, 0, 61][i] ?? 12} sold`}</span>
                      </div>
                      <div className="flex gap-2 mt-3"><Btn onClick={nudge}>Manage</Btn><Btn onClick={nudge}>Check-in</Btn></div>
                    </div>
                  </div>
                ))}
              </AdaptiveGrid>
            </div>
          )}

          {sec === 'PRAYER' && (
            <div className="max-w-2xl">
              <H sub="Moderate requests, mark answered, keep private ones private.">Prayer Wall · Moderation</H>
              <div className="space-y-3">
                {DEMO_CHURCH_PRAYERS.map(pr => (
                  <div key={pr.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="type-title-sm font-black text-white">{pr.name} <span className="text-white/30 font-bold">· {pr.when} ago</span></p>
                      <span className={`flex items-center gap-1 ${TYPE.labelMd} font-black uppercase tracking-widest`} style={{ color: VS }}><HandHeart size={11} /> {pr.praying}</span>
                    </div>
                    <p className="text-sm text-white/75 leading-relaxed mb-3">{pr.request}</p>
                    <div className="flex flex-wrap gap-2">
                      <Btn onClick={nudge}><Check size={12} /> Mark answered</Btn>
                      <Btn onClick={nudge}>Make private</Btn>
                      <Btn onClick={nudge}>Assign to care team</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === 'TEAM' && (
            <div className="max-w-2xl">
              <H sub="Staff, volunteers and roles — grant access to the tools each needs.">Team & Roles</H>
              <div className="mb-5"><Btn primary onClick={nudge}><Plus size={12} /> Invite team member</Btn></div>
              <div className="space-y-2">
                {DEMO_CHURCH_STAFF.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10">
                    <img src={s.photo} className="w-11 h-11 rounded-xl object-cover shrink-0" alt="" loading="lazy" />
                    <div className="min-w-0 flex-1"><p className="text-sm font-black text-white truncate">{s.name}</p><p className={`${TYPE.labelMd} font-bold uppercase tracking-widest`} style={{ color: VS }}>{s.role}</p></div>
                    <select onChange={nudge} className={`shrink-0 bg-black/40 border border-white/10 rounded-xl px-3 py-2 ${TYPE.labelMd} font-black uppercase tracking-widest text-white/70 outline-none`}>
                      <option>Admin</option><option>Editor</option><option>Giving</option><option>Volunteer</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === 'MULTISITE' && (
            <div className="max-w-3xl">
              <H sub="Broadcast one campus's program feed to the others — live master control.">Multi-site Master Control</H>
              <div className="aspect-video max-h-[50vh] md:max-h-none rounded-3xl overflow-hidden bg-black border border-white/10 relative mb-5 grid place-items-center">
                <img src={DEMO_CHURCH_EVENTS[1]?.image} className="absolute inset-0 w-full h-full object-cover opacity-40" alt="" />
                <span className={`absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-red-600 rounded-full ${TYPE.labelSm} font-black uppercase tracking-widest text-white`}><Dot className="animate-pulse" size={14} /> Live · Downtown</span>
                <button onClick={nudge} className={`relative z-10 flex items-center gap-2 px-5 py-2.5 rounded-full ${TYPE.labelMd} font-black uppercase tracking-widest text-white`} style={{ background: V }}><MonitorPlay size={14} /> Take to switcher</button>
              </div>
              <AdaptiveGrid phone={1} tablet={2} desktop={3} gap="0.75rem">
                {CAMPUSES.map((cam, i) => (
                  <button key={cam.id} onClick={nudge} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] text-left transition-all">
                    <p className="text-sm font-black text-white flex items-center gap-2"><Building2 size={14} />{cam.name}</p>
                    {cam.location && <p className="text-[10px] text-white/40 mt-0.5">{cam.location}</p>}
                    <p className={`${TYPE.labelSm} font-black uppercase tracking-widest mt-2 flex items-center gap-1`} style={{ color: i === 0 ? '#f87171' : 'rgba(255,255,255,0.3)' }}>{i === 0 ? <><Dot className="animate-pulse" size={12} /> On air</> : 'Idle'}</p>
                  </button>
                ))}
              </AdaptiveGrid>
            </div>
          )}

          {sec === 'CLASSES' && (
            <div className="max-w-2xl">
              <H sub="Sunday school, Bible study & discipleship on the education stack.">Classes</H>
              <div className="mb-5"><Btn primary onClick={nudge}><Plus size={12} /> New class</Btn></div>
              <div className="space-y-2">
                {CLASSES.map(cl => (
                  <div key={cl.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10">
                    <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'rgba(139,92,246,0.15)' }}><GraduationCap size={17} style={{ color: VS }} /></span>
                    <div className="min-w-0 flex-1"><p className="text-sm font-black text-white truncate">{cl.title}</p><p className={`${TYPE.labelSm} text-white/35 uppercase tracking-widest`}>{cl.enrolled} enrolled · {cl.lessons} lessons</p></div>
                    <span className={`${TYPE.labelSm} font-black uppercase tracking-widest px-2 py-1 rounded-full shrink-0`} style={{ color: cl.status === 'Active' ? '#4ade80' : VS, background: cl.status === 'Active' ? 'rgba(74,222,128,0.12)' : 'rgba(139,92,246,0.14)' }}>{cl.status}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl p-4 flex items-center gap-3 bg-white/[0.03] border border-white/10">
                <Sparkles size={18} style={{ color: VS }} className="shrink-0" />
                <p className="type-body-sm text-white/50">Classes run on Plajah's full EdTech stack — lessons, assignments, grades and a learning record — the same one schools use.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChurchAdminDemoView;
