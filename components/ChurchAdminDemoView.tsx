import React, { useState } from 'react';
import {
  LayoutDashboard, Mail, Users, Gift, Calendar, HandHeart, UserCog, MonitorPlay, GraduationCap,
  Send, Upload, Download, Plus, Check, TrendingUp, Building2, Radio, Dot, DollarSign, ArrowRight, Sparkles,
} from 'lucide-react';
import { DEMO_CHURCH, DEMO_CHURCH_STAFF, DEMO_CHURCH_EVENTS, DEMO_CHURCH_PRAYERS } from '../data/demoShowcase';
import { AdaptiveGrid, TYPE } from '../src/lib/designSystem';
import ElevateMobilizeHub from './elevate/ElevateMobilizeHub';
import { EV, EvLabel, EvRunSheet, EvKpiStrip, type EvCue } from './elevate/vellum';

// ── Ministry Admin — the BACKEND, shown as a live demo ─────────────────────────
// The congregant-facing tour lives in ChurchDemoView. This is the other half: the
// back-office a ministry actually runs on — broadcasts, people/Servant Keeper import,
// a giving dashboard, prayer moderation, roster & roles, multi-site master control,
// and classes. Mirrors the real owner tools in OrgHub (ChurchConsole / ChurchGive /
// ChurchMasterControl / SermonStudio) so a prospective church SEES how they'd run it.
// Nothing moves money or sends a message — every action shows a friendly nudge.

const V = EV.violet;
const VS = EV.violetText;
const nudge = () => alert('This is a live demo of the ministry backend. Create your church space and this runs for real — broadcasts, giving, people, prayer and multi-site all wired to your account.');

type Section = 'OVERVIEW' | 'MOBILIZE' | 'MESSAGES' | 'PEOPLE' | 'GIVING' | 'EVENTS' | 'PRAYER' | 'TEAM' | 'MULTISITE' | 'CLASSES';

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

const KPI: React.FC<{ label: string; value: string; sub?: string; icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }> }> = ({ label, value, sub }) => (
  <div className="ev-panel p-5 flex flex-col gap-1">
    <span className="text-[13px] text-[#A49CB2]">{label}</span>
    <p className="ev-num text-[32px] leading-tight text-white m-0">{value}</p>
    {sub && <p className="text-[13px] m-0" style={{ color: EV.muted }}>{sub}</p>}
  </div>
);
const Btn: React.FC<{ children: React.ReactNode; primary?: boolean; onClick?: () => void }> = ({ children, primary, onClick }) => (
  <button onClick={onClick || nudge} className={`ev-btn ${primary ? 'ev-btn-primary' : 'ev-btn-ghost'}`} style={{ minHeight: 40, fontSize: 13 }}>{children}</button>
);
const H: React.FC<{ children: React.ReactNode; sub?: string }> = ({ children, sub }) => (
  <div className="mb-6"><h2 className="m-0 ev-display text-white" style={{ fontSize: 'clamp(1.9rem, 3.4vw, 2.5rem)', lineHeight: 1.05 }}>{children}</h2>{sub && <p className="text-[15px] text-[#A49CB2] mt-2 mb-0">{sub}</p>}</div>
);

// Sunday's Ambo run of show, as the staff "Sunday sheet".
const SUNDAY_CUES: EvCue[] = [
  { t: '9:55', what: 'Stream opens on Reello', owner: 'Andre Cole', status: 'Ready', tone: 'ready' },
  { t: '10:00', what: 'Call to worship', ref: 'Psalm 27:4', owner: 'Marcus Bell', status: 'Ready', tone: 'ready' },
  { t: '10:06', what: 'Worship set · 4 songs', owner: 'Grace Lin', status: 'Ready', tone: 'ready' },
  { t: '10:30', what: 'Scripture reading', ref: 'John 8:12–20', owner: 'Priya Nair', status: 'Ready', tone: 'ready' },
  { t: '10:34', what: 'Message — The Light of the World', ref: 'John 8 · 9 slides', owner: 'Daniel Reyes', status: 'Slides due', tone: 'due' },
  { t: '11:15', what: 'Baptisms', owner: 'Sam Whitfield', status: '2 to confirm', tone: 'due' },
];
const CARE = [
  { name: 'Alvarez family', why: 'Surgery Thursday · 47 praying', cta: 'Plan a visit' },
  { name: 'Jordan Tate', why: 'Missed 4 Sundays', cta: 'Check in' },
  { name: 'Kara Mendes', why: 'Finished Foundations of Faith', cta: 'Invite to serve' },
  { name: 'Ruth Lee', why: 'Asked about membership', cta: 'Reply' },
];

const ChurchAdminDemoView: React.FC<{ onCreate: () => void }> = ({ onCreate }) => {
  const [sec, setSec] = useState<Section>('OVERVIEW');
  const c = DEMO_CHURCH;
  const funds = c.givingFunds || [];
  const weekGiving = GIFTS.reduce((s, g) => s + g.amount, 0) + 4210;

  const NAV: { k: Section; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { k: 'OVERVIEW', label: 'Overview', icon: LayoutDashboard },
    { k: 'MOBILIZE', label: 'Serve & shifts', icon: Sparkles },
    { k: 'MESSAGES', label: 'Messages', icon: Mail },
    { k: 'PEOPLE', label: 'People', icon: Users },
    { k: 'GIVING', label: 'Giving', icon: Gift },
    { k: 'EVENTS', label: 'Events', icon: Calendar },
    { k: 'PRAYER', label: 'Prayer', icon: HandHeart },
    { k: 'TEAM', label: 'Team & roles', icon: UserCog },
    { k: 'MULTISITE', label: 'Multi-site', icon: MonitorPlay },
    { k: 'CLASSES', label: 'Classes', icon: GraduationCap },
  ];

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Demo banner */}
      <div className="shrink-0 flex items-center gap-3 px-4 sm:px-8 py-2.5 border-b" style={{ borderColor: EV.line }}>
        <EvLabel>Demo</EvLabel>
        <p className="text-sm text-[#A49CB2] truncate m-0">{c.name} · the staff side — what running your church looks like</p>
        <button onClick={onCreate} className="ml-auto shrink-0 ev-btn ev-btn-primary" style={{ minHeight: 36, fontSize: 13 }}>Create your church <ArrowRight size={13} /></button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Sidebar: a labelled tab strip on a phone, an icon rail from tablet up */}
        <nav aria-label="Staff" className="shrink-0 flex md:block gap-1 md:gap-0 border-b md:border-b-0 md:border-r p-2 lg:p-4 md:w-16 lg:w-56 overflow-x-auto md:overflow-x-visible md:overflow-y-auto scrollbar-hide" style={{ borderColor: EV.line }}>
          {NAV.map(({ k, label, icon: Icon }) => (
            <button key={k} onClick={() => setSec(k)} aria-current={sec === k ? 'page' : undefined}
              className={`md:w-full shrink-0 whitespace-nowrap flex items-center gap-2 md:gap-3 px-3 md:px-2.5 lg:px-3 py-2.5 rounded-xl text-sm transition-colors md:mb-0.5 ${sec === k ? 'text-white font-semibold' : 'text-[#A49CB2] hover:text-white hover:bg-white/[0.04]'}`}
              style={sec === k ? { background: EV.raised } : undefined}>
              <Icon size={16} className="shrink-0" /> <span className="md:hidden lg:inline">{label}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-hide p-4 sm:p-5 lg:p-8">
          {sec === 'OVERVIEW' && (
            <div className="ev-fade max-w-[1100px] space-y-8">
              <div>
                <div className="text-[13px] text-[#A49CB2] pb-1.5">Angela Brooks · Executive Pastor</div>
                <h2 className="m-0 ev-display text-white" style={{ fontSize: 'clamp(2.25rem, 4vw, 3rem)', lineHeight: 1 }}>Week of Oct 19</h2>
              </div>
              <EvKpiStrip items={[
                { label: 'Sunday attendance', value: '842', note: '+18 members this month', tone: 'up' },
                { label: 'Giving · this week', value: money(weekGiving), note: '+12% on last week', tone: 'up' },
                { label: 'Volunteers set', value: '64/72', note: '8 shifts open Sunday', tone: 'warn' },
                { label: 'Prayer requests', value: String(DEMO_CHURCH_PRAYERS.length + 9), note: '3 new today' },
              ]} />
              <div className="flex flex-wrap gap-5 items-start">
                <div style={{ flex: '999 1 540px', minWidth: 0 }}>
                  <EvRunSheet title="Sunday sheet" subtitle="From Stage · synced to Verse" cues={SUNDAY_CUES}
                    action={<button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_AMBO'))} className="ev-btn ev-btn-ink" style={{ minHeight: 36, fontSize: 13 }}>Open Stage</button>} />
                </div>
                <div className="ev-panel p-6 flex flex-col" style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <h3 className="m-0 mb-2 ev-title text-[22px] text-white">Needs a person</h3>
                  <div className="ev-rule">
                    {CARE.map(p => (
                      <div key={p.name} className="py-3.5 flex flex-col gap-0.5">
                        <div className="flex justify-between gap-3"><span className="text-[15px] font-medium text-white">{p.name}</span><button onClick={nudge} className="text-[13px]" style={{ color: VS }}>{p.cta}</button></div>
                        <span className="text-[13px] text-[#A49CB2]">{p.why}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-5 items-start">
                <div className="ev-panel p-6" style={{ flex: '1 1 420px', minWidth: 0 }}>
                  <h3 className="m-0 mb-2 ev-title text-[22px] text-white">Recent giving</h3>
                  <div className="ev-rule">
                    {GIFTS.slice(0, 4).map(g => (
                      <div key={g.id} className="flex items-center justify-between py-3">
                        <div><p className="text-[15px] font-medium text-white m-0">{g.name}</p><p className="text-[13px] text-[#A49CB2] m-0">{g.fund}{g.recurring ? ' · recurring' : ''}</p></div>
                        <span className="ev-num text-lg text-white">{money(g.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ev-panel p-6" style={{ flex: '1 1 300px', minWidth: 0 }}>
                  <h3 className="m-0 mb-4 ev-title text-[22px] text-white">Quick actions</h3>
                  <div className="flex flex-wrap gap-2">
                    <Btn onClick={() => setSec('MOBILIZE')}><Sparkles size={14} /> Serve &amp; shifts</Btn>
                    <Btn onClick={() => setSec('MESSAGES')}><Send size={14} /> Broadcast</Btn>
                    <Btn onClick={() => setSec('PEOPLE')}><Upload size={14} /> Import people</Btn>
                    <Btn onClick={() => setSec('GIVING')}><DollarSign size={14} /> Giving</Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {sec === 'MOBILIZE' && (
            <ElevateMobilizeHub
              org={c}
              currentUserId="demo-pastor-1"
              currentUserName="Angela Brooks"
              currentUserEmail="angela.brooks@gracechapel.org"
              canManage={true}
              initialContext="ops"
            />
          )}

          {sec === 'MESSAGES' && (
            <div className="ev-fade max-w-2xl">
              <H sub="Broadcast to every member — in-app, push and email.">Messages · Console</H>
              <div className="space-y-3 mb-8">
                <input placeholder="Subject" className={field} />
                <textarea rows={5} placeholder="Your message to the congregation…" className={`${field} resize-none`} />
                <div className="flex flex-wrap gap-2">
                  {['In-app', 'Push', 'Email'].map(ch => <span key={ch} className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl ${TYPE.labelMd} text-white`} style={{ background: 'rgba(122, 31, 192,0.15)', border: '1px solid rgba(122, 31, 192,0.3)' }}><Check size={12} /> {ch}</span>)}
                </div>
                <button onClick={nudge} className="w-full py-3.5 rounded-full font-black text-xs text-white flex items-center justify-center gap-2" style={{ background: V }}><Send size={16} /> Send to all 842 members</button>
              </div>
              <p className={`${TYPE.labelMd} text-white/40 mb-3`}>Recently sent</p>
              <div className="space-y-2">
                {MESSAGES_SENT.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 ev-panel">
                    <Mail size={15} style={{ color: VS }} className="shrink-0" />
                    <div className="min-w-0 flex-1"><p className="text-[15px] font-medium text-white truncate">{m.subject}</p><p className={`${TYPE.labelSm} text-white/35`}>{m.when} · {m.channels}</p></div>
                    <span className={`${TYPE.labelMd} font-black tabular-nums text-white/50 shrink-0`}>{m.reach} reached</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === 'PEOPLE' && (
            <div className="ev-fade max-w-3xl">
              <H sub="Your directory — import from Servant Keeper, export anytime.">People</H>
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <Btn primary onClick={nudge}><Upload size={12} /> Import CSV (Servant Keeper)</Btn>
                <Btn><Download size={12} /> Export people</Btn>
                <Btn><Download size={12} /> Export giving</Btn>
                <Btn><Plus size={12} /> Add person</Btn>
              </div>
              <div className="rounded-2xl border border-white/10 overflow-hidden">
                <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr] gap-2 px-4 py-2.5 bg-white/[0.04] text-xs text-[#A49CB2]">
                  <span>Name</span><span>Email</span><span>Phone</span><span>Status</span>
                </div>
                {CONGREGANTS.map(p => (
                  <div key={p.id} className="grid grid-cols-[2fr_2fr_1.5fr_1fr] gap-2 px-4 py-3 border-t border-white/6 items-center hover:bg-white/[0.02]">
                    <span className="text-xs font-bold text-white truncate">{p.name}</span>
                    <span className="text-[11px] text-white/50 truncate">{p.email}</span>
                    <span className="text-[11px] text-white/50 truncate tabular-nums">{p.phone}</span>
                    <span className="text-[8px] px-2 py-1 rounded-full w-fit" style={{ color: VS, background: 'rgba(122, 31, 192,0.14)' }}>{p.status}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-white/30 mt-3">842 people on file · showing a sample. Households, tags, notes and giving history attach to each record.</p>
            </div>
          )}

          {sec === 'GIVING' && (
            <div className="ev-fade max-w-3xl">
              <H sub="Funds, recurring gifts and payouts — on your own Stripe account.">Giving Dashboard</H>
              <AdaptiveGrid phone={2} tablet={2} desktop={4} gap="0.75rem" className="mb-6">
                <KPI label="This week" value={money(weekGiving)} sub="+12%" icon={TrendingUp} />
                <KPI label="This month" value={money(weekGiving * 4 + 1200)} icon={DollarSign} />
                <KPI label="Recurring givers" value="214" sub="+9 this month" icon={Users} />
                <KPI label="Next payout" value="$18,340" sub="Fri · Stripe" icon={Gift} />
              </AdaptiveGrid>
              {funds.length > 0 && (
                <>
                  <p className={`${TYPE.labelMd} text-white/40 mb-3`}>Funds</p>
                  <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="0.75rem" className="mb-6">
                    {funds.map(f => {
                      const pct = f.goal ? Math.min(100, Math.round((f.raised || 0) / f.goal * 100)) : 0;
                      return (
                        <div key={f.id} className="ev-panel p-5">
                          <div className="flex items-center justify-between mb-1"><p className="text-[15px] font-semibold text-white">{f.name}</p><Btn onClick={nudge}>Edit</Btn></div>
                          {f.description && <p className="text-[10px] text-white/40 mb-2">{f.description}</p>}
                          {f.goal ? (<>
                            <div className="h-2 rounded-full bg-black/40 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: EV.brand }} /></div>
                            <div className={`flex justify-between mt-1.5 ${TYPE.labelMd} text-white/40 tabular-nums`}><span style={{ color: VS }}>{money(f.raised || 0)}</span><span>of {money(f.goal)}</span></div>
                          </>) : <p className="text-[10px] text-white/30">Ongoing fund</p>}
                        </div>
                      );
                    })}
                  </AdaptiveGrid>
                </>
              )}
              <p className={`${TYPE.labelMd} text-white/40 mb-3`}>Recent gifts</p>
              <div className="rounded-2xl border border-white/10 overflow-hidden">
                {GIFTS.map(g => (
                  <div key={g.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/6 last:border-0 hover:bg-white/[0.02]">
                    <div className="min-w-0 flex-1"><p className="text-[15px] font-medium text-white truncate">{g.name}</p><p className={`${TYPE.labelSm} text-white/35`}>{g.fund} · {g.when}{g.recurring ? ' · recurring' : ''}</p></div>
                    <span className="text-sm font-black tabular-nums shrink-0" style={{ color: VS }}>{money(g.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === 'EVENTS' && (
            <div className="ev-fade max-w-3xl">
              <H sub="Ticketing, RSVPs and check-in — built in.">Events</H>
              <div className="mb-5"><Btn primary onClick={nudge}><Plus size={12} /> New event</Btn></div>
              <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="0.75rem">
                {DEMO_CHURCH_EVENTS.map((e, i) => (
                  <div key={e.id} className="rounded-2xl overflow-hidden bg-white/[0.03] border border-white/10">
                    <img src={e.image} className="w-full h-32 object-cover" alt="" loading="lazy" />
                    <div className="p-4">
                      <p className={`${TYPE.labelSm} mb-1`} style={{ color: VS }}>{e.date} · {e.time}</p>
                      <h4 className="text-[15px] font-semibold text-white mb-2">{e.title}</h4>
                      <div className={`flex items-center justify-between ${TYPE.labelMd} text-white/40`}>
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
            <div className="ev-fade max-w-2xl">
              <H sub="Moderate requests, mark answered, keep private ones private.">Prayer Wall · Moderation</H>
              <div className="space-y-3">
                {DEMO_CHURCH_PRAYERS.map(pr => (
                  <div key={pr.id} className="ev-panel p-5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="type-title-sm font-black text-white">{pr.name} <span className="text-white/30 font-bold">· {pr.when} ago</span></p>
                      <span className={`flex items-center gap-1 ${TYPE.labelMd}`} style={{ color: VS }}><HandHeart size={11} /> {pr.praying}</span>
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
            <div className="ev-fade max-w-2xl">
              <H sub="Staff, volunteers and roles — grant access to the tools each needs.">Team & Roles</H>
              <div className="mb-5"><Btn primary onClick={nudge}><Plus size={12} /> Invite team member</Btn></div>
              <div className="space-y-2">
                {DEMO_CHURCH_STAFF.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3 ev-panel">
                    <img src={s.photo} className="w-11 h-11 rounded-xl object-cover shrink-0" alt="" loading="lazy" />
                    <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold text-white truncate">{s.name}</p><p className={`${TYPE.labelMd}`} style={{ color: VS }}>{s.role}</p></div>
                    <select onChange={nudge} className={`shrink-0 bg-black/40 border border-white/10 rounded-xl px-3 py-2 ${TYPE.labelMd} text-white/70 outline-none`}>
                      <option>Admin</option><option>Editor</option><option>Giving</option><option>Volunteer</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === 'MULTISITE' && (
            <div className="ev-fade max-w-3xl">
              <H sub="Broadcast one campus's program feed to the others — live master control.">Multi-site Master Control</H>
              <div className="aspect-video max-h-[50vh] md:max-h-none rounded-3xl overflow-hidden bg-black border border-white/10 relative mb-5 grid place-items-center">
                <img src={DEMO_CHURCH_EVENTS[1]?.image} className="absolute inset-0 w-full h-full object-cover opacity-40" alt="" />
                <span className={`absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-red-600 rounded-full ${TYPE.labelSm} text-white`}><Dot className="animate-pulse" size={14} /> Live · Downtown</span>
                <button onClick={nudge} className={`relative z-10 flex items-center gap-2 px-5 py-2.5 rounded-full ${TYPE.labelMd} text-white`} style={{ background: V }}><MonitorPlay size={14} /> Take to switcher</button>
              </div>
              <AdaptiveGrid phone={1} tablet={2} desktop={3} gap="0.75rem">
                {CAMPUSES.map((cam, i) => (
                  <button key={cam.id} onClick={nudge} className="p-4 ev-panel hover:bg-white/[0.06] text-left transition-all">
                    <p className="text-[15px] font-semibold text-white flex items-center gap-2"><Building2 size={14} />{cam.name}</p>
                    {cam.location && <p className="text-[10px] text-white/40 mt-0.5">{cam.location}</p>}
                    <p className={`${TYPE.labelSm} mt-2 flex items-center gap-1`} style={{ color: i === 0 ? '#f87171' : 'rgba(255,255,255,0.3)' }}>{i === 0 ? <><Dot className="animate-pulse" size={12} /> On air</> : 'Idle'}</p>
                  </button>
                ))}
              </AdaptiveGrid>
            </div>
          )}

          {sec === 'CLASSES' && (
            <div className="ev-fade max-w-2xl">
              <H sub="Sunday school, Bible study & discipleship on the education stack.">Classes</H>
              <div className="mb-5"><Btn primary onClick={nudge}><Plus size={12} /> New class</Btn></div>
              <div className="space-y-2">
                {CLASSES.map(cl => (
                  <div key={cl.id} className="flex items-center gap-3 px-4 py-3 ev-panel">
                    <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'rgba(122, 31, 192,0.15)' }}><GraduationCap size={17} style={{ color: VS }} /></span>
                    <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold text-white truncate">{cl.title}</p><p className={`${TYPE.labelSm} text-white/35`}>{cl.enrolled} enrolled · {cl.lessons} lessons</p></div>
                    <span className={`${TYPE.labelSm} px-2 py-1 rounded-full shrink-0`} style={{ color: cl.status === 'Active' ? '#4ade80' : VS, background: cl.status === 'Active' ? 'rgba(74,222,128,0.12)' : 'rgba(122, 31, 192,0.14)' }}>{cl.status}</span>
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
