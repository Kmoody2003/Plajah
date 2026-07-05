import React, { useState } from 'react';
import {
  ChevronLeft, Users, Image as ImageIcon, Calendar, Play, Heart, MessageSquare,
  MapPin, Clock, Ticket, ShoppingBag, ArrowRight, Home, HandHeart, Church, MessageCircle,
  BookOpen, Gift, Check, ExternalLink,
} from 'lucide-react';
import DemoRibbon from './DemoRibbon';
import {
  DEMO_CHURCH, DEMO_CHURCH_STAFF, DEMO_CHURCH_ALBUMS, DEMO_CHURCH_EVENTS,
  DEMO_CHURCH_VIDEOS, DEMO_CHURCH_FEED, DEMO_MINISTRY_DETAIL,
  DEMO_CHURCH_PRAYERS, DEMO_CHURCH_LIBRARY,
  type DemoPost, type DemoEvent, type DemoStaff,
} from '../data/demoShowcase';

// A fully-populated, static tour of a church on Plajah — the ministry hierarchy,
// each ministry a space with feed / photos / staff+DM / events / merch, plus
// church-level photos, events, video archive, staff and giving. A sales demo:
// buttons that would move money or send a message show a friendly nudge instead.

const V = '#8B5CF6';          // spiritual violet
const VS = '#B79BF5';
const sheen = 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(0,0,0,0.4))';
const demoAction = () => alert('This is a live demo. Create your own church space to make this real — tickets, giving, messaging and merch all run for you.');

type Tab = 'HOME' | 'MINISTRIES' | 'PHOTOS' | 'EVENTS' | 'WATCH' | 'PRAYER' | 'LIBRARY' | 'STAFF' | 'GIVE';

const PostCard: React.FC<{ p: DemoPost }> = ({ p }) => (
  <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
    <div className="flex items-center gap-2.5 mb-2">
      <img src={p.authorPhoto} className="w-9 h-9 rounded-full object-cover border border-white/10" alt="" />
      <div><p className="text-[12px] font-black text-white">{p.author}</p><p className="text-[9px] text-white/35 uppercase tracking-widest">{p.when} ago</p></div>
    </div>
    <p className="text-sm text-white/80 leading-relaxed">{p.text}</p>
    {p.image && <img src={p.image} className="w-full max-h-72 object-cover rounded-xl mt-3 border border-white/10" alt="" loading="lazy" />}
    <div className="flex items-center gap-4 mt-3 pt-2 border-t border-white/6 text-white/40">
      <button onClick={demoAction} className="flex items-center gap-1.5 text-[11px] font-bold hover:text-rose-400"><Heart size={13} /> {p.likes}</button>
      <button onClick={demoAction} className="flex items-center gap-1.5 text-[11px] font-bold hover:text-white"><MessageSquare size={13} /> {p.comments}</button>
    </div>
  </div>
);

const EventCard: React.FC<{ e: DemoEvent }> = ({ e }) => (
  <div className="rounded-2xl overflow-hidden bg-white/[0.03] border border-white/10">
    <img src={e.image} className="w-full h-40 object-cover" alt="" loading="lazy" />
    <div className="p-4">
      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: VS }}><Calendar size={10} /> {e.date} · {e.time}</div>
      <h4 className="text-base font-black text-white mb-1">{e.title}</h4>
      <p className="text-[12px] text-white/50 leading-snug mb-2">{e.blurb}</p>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/40"><MapPin size={10} /> {e.location}</span>
        <button onClick={demoAction} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white" style={{ background: V }}>
          <Ticket size={11} /> {e.price === 'FREE' ? 'Reserve · Free' : `Tickets · $${e.price}`}
        </button>
      </div>
    </div>
  </div>
);

// A church member/leader is a real Plajah user account — tapping opens their
// profile & feed. In the demo these are sample accounts, clearly badged.
const demoUserNudge = () => alert('Church members are real Plajah user accounts — tapping one opens their profile & feed. These are demo accounts, so this is just a preview.');

const StaffCard: React.FC<{ s: DemoStaff; onVisit: () => void }> = ({ s, onVisit }) => (
  <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10 flex items-center gap-3">
    <button onClick={onVisit} className="flex items-center gap-3 flex-1 min-w-0 text-left group">
      <img src={s.photo} className="w-14 h-14 rounded-2xl object-cover border border-white/10 shrink-0 group-hover:opacity-90" alt="" loading="lazy" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-black text-white truncate group-hover:text-violet-200">{s.name}</p>
          <span className="shrink-0 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ color: VS, background: 'rgba(139,92,246,0.14)' }}>Demo user</span>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: VS }}>{s.role}</p>
        {s.bio && <p className="text-[11px] text-white/45 leading-snug line-clamp-2">{s.bio}</p>}
      </div>
    </button>
    <button onClick={demoAction} title="Message" className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: V }}><MessageCircle size={15} /></button>
  </div>
);

const ChurchDemoView: React.FC<{ onBack?: () => void; onCreate: () => void; onVisitUser?: (uid: string) => void }> = ({ onBack, onCreate, onVisitUser }) => {
  const [tab, setTab] = useState<Tab>('HOME');
  const [ministryId, setMinistryId] = useState<string | null>(null);
  const c = DEMO_CHURCH;
  // Members are real Plajah accounts → open their profile/feed. Demo accounts
  // have no real uid, so they show a preview nudge instead.
  const visitStaff = (s: DemoStaff) => (s.uid && onVisitUser ? onVisitUser(s.uid) : demoUserNudge());

  const TABS: { k: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { k: 'HOME', label: 'Home', icon: Home }, { k: 'MINISTRIES', label: 'Ministries', icon: Users },
    { k: 'PHOTOS', label: 'Photos', icon: ImageIcon }, { k: 'EVENTS', label: 'Events', icon: Calendar },
    { k: 'WATCH', label: 'Watch', icon: Play }, { k: 'PRAYER', label: 'Prayer', icon: HandHeart },
    { k: 'LIBRARY', label: 'Library', icon: BookOpen }, { k: 'STAFF', label: 'Staff', icon: Users },
    { k: 'GIVE', label: 'Give', icon: Gift },
  ];

  const ministry = ministryId ? (c.ministries || []).find(m => m.id === ministryId) : null;
  const md = ministryId ? DEMO_MINISTRY_DETAIL[ministryId] : undefined;

  return (
    <div className="h-full overflow-y-auto scrollbar-hide bg-[#0d0b12]">
      <DemoRibbon label="church" accent={V} ctaText="Create your church" onCreate={onCreate} />

      {/* Hero */}
      <div className="relative h-52 md:h-64 overflow-hidden">
        <img src={c.coverUrl} className="absolute inset-0 w-full h-full object-cover opacity-45" alt="" />
        <div className="absolute inset-0" style={{ background: sheen }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d0b12] via-transparent to-transparent" />
        {onBack && <button onClick={onBack} className="absolute top-4 left-6 flex items-center gap-1.5 text-white/60 hover:text-white text-[11px] font-bold uppercase tracking-widest"><ChevronLeft size={16} /> Back</button>}
        <div className="absolute bottom-4 left-6 right-6 flex items-end gap-4">
          <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 shrink-0" style={{ borderColor: V }}>
            <img src={c.logoUrl} className="w-full h-full object-cover" alt="" />
          </div>
          <div className="min-w-0 pb-1">
            <div className="flex items-center gap-2">
              <Church size={16} style={{ color: VS }} />
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white truncate">{c.name}</h1>
            </div>
            <p className="text-[12px] text-white/55 truncate">{c.tagline}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-30 bg-[#0d0b12]/90 backdrop-blur-xl border-b border-white/8">
        <div className="flex items-center gap-1 px-4 overflow-x-auto scrollbar-hide max-w-4xl mx-auto">
          {TABS.map(({ k, label, icon: Icon }) => {
            const active = tab === k && !ministryId;
            return (
              <button key={k} onClick={() => { setTab(k); setMinistryId(null); }}
                className="shrink-0 flex items-center gap-1.5 px-3.5 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all"
                style={active ? { color: '#fff', borderColor: V } : { color: 'rgba(255,255,255,0.35)', borderColor: 'transparent' }}>
                <Icon size={13} /> {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* ── Ministry detail (drill-down) ── */}
        {ministry ? (
          <div className="space-y-6">
            <button onClick={() => setMinistryId(null)} className="flex items-center gap-1.5 text-white/40 hover:text-white text-[11px] font-bold uppercase tracking-widest"><ChevronLeft size={15} /> All ministries</button>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{ministry.iconEmoji}</span>
              <div>
                <h2 className="text-2xl font-black text-white">{ministry.name}</h2>
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: VS }}><Clock size={10} className="inline mr-1" />{ministry.meetingTime}</p>
              </div>
            </div>
            <p className="text-[13px] text-white/55 leading-relaxed max-w-2xl">{ministry.description}</p>

            {md ? (
              <>
                {/* Leaders */}
                <Section title="Leaders">
                  <div className="grid sm:grid-cols-2 gap-3">{md.leaders.map(l => <StaffCard key={l.id} s={l} onVisit={() => visitStaff(l)} />)}</div>
                </Section>
                {/* Feed */}
                {md.posts.length > 0 && <Section title="Feed"><div className="space-y-3">{md.posts.map(p => <PostCard key={p.id} p={p} />)}</div></Section>}
                {/* Photos */}
                {md.albums.length > 0 && (
                  <Section title="Photos">
                    {md.albums.map(a => (
                      <div key={a.id}>
                        <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">{a.title}</p>
                        <div className="grid grid-cols-3 gap-2">{a.photos.map((ph, i) => <img key={i} src={ph} onClick={demoAction} className="aspect-square object-cover rounded-xl border border-white/10 cursor-zoom-in" alt="" loading="lazy" />)}</div>
                      </div>
                    ))}
                  </Section>
                )}
                {/* Events */}
                {md.events.length > 0 && <Section title="Events"><div className="grid sm:grid-cols-2 gap-3">{md.events.map(e => <EventCard key={e.id} e={e} />)}</div></Section>}
                {/* Merch */}
                {md.merch.length > 0 && (
                  <Section title="Ministry Shop">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {md.merch.map(m => (
                        <div key={m.id} className="rounded-2xl overflow-hidden bg-white/[0.03] border border-white/10">
                          <img src={m.image} className="w-full aspect-square object-cover" alt="" loading="lazy" />
                          <div className="p-3">
                            <p className="text-[12px] font-bold text-white truncate">{m.title}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-sm font-black" style={{ color: VS }}>${m.price}</span>
                              <button onClick={demoAction} className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: V }}><ShoppingBag size={13} /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </>
            ) : (
              <div className="rounded-2xl p-6 text-center bg-white/[0.03] border border-white/10">
                <p className="text-[12px] text-white/40">This ministry's space — feed, photos, events, merch and a chat with its leaders — is set up the same way. Create your church to populate it.</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ── HOME ── */}
            {tab === 'HOME' && (
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color: VS }}>Latest from the church</p>
                  {DEMO_CHURCH_FEED.map(p => <PostCard key={p.id} p={p} />)}
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Service times</p>
                    {(c.serviceTimes || []).map(s => (
                      <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-white/6 last:border-0">
                        <span className="text-[12px] text-white/70">{s.label}</span>
                        <span className="text-[11px] font-black text-white tabular-nums">{s.day} · {s.time}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Coming up</p>
                    <div className="space-y-2">
                      {DEMO_CHURCH_EVENTS.slice(0, 2).map(e => (
                        <button key={e.id} onClick={() => setTab('EVENTS')} className="w-full text-left flex items-center gap-2 group">
                          <img src={e.image} className="w-12 h-12 rounded-lg object-cover" alt="" />
                          <div className="min-w-0"><p className="text-[12px] font-bold text-white truncate group-hover:text-violet-300">{e.title}</p><p className="text-[10px] text-white/40">{e.date}</p></div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── MINISTRIES ── */}
            {tab === 'MINISTRIES' && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(c.ministries || []).map(m => (
                  <button key={m.id} onClick={() => setMinistryId(m.id)}
                    className="text-left rounded-2xl p-5 bg-white/[0.03] border border-white/10 hover:border-white/25 hover:bg-white/[0.06] transition-all group">
                    <div className="flex items-center justify-between mb-2"><span className="text-3xl">{m.iconEmoji}</span>{DEMO_MINISTRY_DETAIL[m.id] && <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ color: VS, background: 'rgba(139,92,246,0.12)' }}>Live space</span>}</div>
                    <h4 className="text-base font-black text-white mb-0.5 group-hover:text-violet-200">{m.name}</h4>
                    <p className="text-[11px] text-white/45 leading-snug mb-2">{m.description}</p>
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/35"><Clock size={10} /> {m.meetingTime}</span>
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest mt-3" style={{ color: VS }}>Open space <ArrowRight size={11} /></span>
                  </button>
                ))}
              </div>
            )}

            {/* ── PHOTOS ── */}
            {tab === 'PHOTOS' && (
              <div className="space-y-8">
                {DEMO_CHURCH_ALBUMS.map(a => (
                  <div key={a.id}>
                    <p className="text-sm font-black uppercase tracking-widest text-white mb-3">{a.title} <span className="text-white/30 text-[11px]">· {a.photos.length}</span></p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{a.photos.map((ph, i) => <img key={i} src={ph} onClick={demoAction} className="aspect-square object-cover rounded-xl border border-white/10 cursor-zoom-in hover:opacity-90" alt="" loading="lazy" />)}</div>
                  </div>
                ))}
                <button onClick={demoAction} className="w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white" style={{ background: 'rgba(139,92,246,0.15)', border: `1px solid rgba(139,92,246,0.3)` }}>+ New album (demo)</button>
              </div>
            )}

            {/* ── EVENTS ── */}
            {tab === 'EVENTS' && <div className="grid sm:grid-cols-2 gap-4">{DEMO_CHURCH_EVENTS.map(e => <EventCard key={e.id} e={e} />)}</div>}

            {/* ── WATCH ── */}
            {tab === 'WATCH' && (
              <div className="grid sm:grid-cols-2 gap-4">
                {DEMO_CHURCH_VIDEOS.map(v => (
                  <button key={v.id} onClick={demoAction} className="text-left group">
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 aspect-video">
                      <img src={v.thumb} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="" loading="lazy" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center"><Play size={20} className="text-white ml-0.5" /></div></div>
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-black text-white tabular-nums">{v.duration}</span>
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-widest mt-2" style={{ color: VS }}>{v.series}</p>
                    <p className="text-sm font-bold text-white leading-tight">{v.title}</p>
                    <p className="text-[10px] text-white/35">{v.date}</p>
                  </button>
                ))}
              </div>
            )}

            {/* ── PRAYER ── */}
            {tab === 'PRAYER' && (
              <div className="space-y-4 max-w-2xl">
                <button onClick={demoAction} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white" style={{ background: V }}>
                  <HandHeart size={14} /> Submit a prayer request
                </button>
                {DEMO_CHURCH_PRAYERS.map(pr => (
                  <div key={pr.id} className="rounded-2xl p-4 border" style={{ background: pr.answered ? 'rgba(63,190,133,0.06)' : 'rgba(255,255,255,0.03)', borderColor: pr.answered ? 'rgba(63,190,133,0.25)' : 'rgba(255,255,255,0.1)' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[12px] font-black text-white">{pr.name} <span className="text-white/30 font-bold">· {pr.when} ago</span></p>
                      {pr.answered && <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-400"><Check size={10} /> Answered</span>}
                    </div>
                    <p className="text-sm text-white/75 leading-relaxed mb-3">{pr.request}</p>
                    <button onClick={demoAction} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white" style={{ background: pr.answered ? 'rgba(63,190,133,0.15)' : 'rgba(139,92,246,0.15)', border: `1px solid ${pr.answered ? 'rgba(63,190,133,0.3)' : 'rgba(139,92,246,0.3)'}` }}>
                      <HandHeart size={11} style={{ color: pr.answered ? '#3FBE85' : VS }} /> {pr.praying} praying
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── LIBRARY ── */}
            {tab === 'LIBRARY' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[13px] text-white/55 max-w-md">A reading list curated by our teaching team, powered by Lorea.</p>
                  <button onClick={demoAction} className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-white" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
                    <BookOpen size={12} style={{ color: VS }} /> Sacred Library <ExternalLink size={11} />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
                  {DEMO_CHURCH_LIBRARY.map(b => (
                    <button key={b.id} onClick={demoAction} className="text-left group">
                      <div className="rounded-xl overflow-hidden border border-white/10 aspect-[3/4] shadow-lg">
                        <img src={b.cover} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="" loading="lazy" />
                      </div>
                      <p className="text-[12px] font-bold text-white leading-tight mt-2 line-clamp-2">{b.title}</p>
                      <p className="text-[10px] text-white/40">{b.author}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STAFF ── */}
            {tab === 'STAFF' && <div className="grid sm:grid-cols-2 gap-3">{DEMO_CHURCH_STAFF.map(s => <StaffCard key={s.id} s={s} onVisit={() => visitStaff(s)} />)}</div>}

            {/* ── GIVE ── */}
            {tab === 'GIVE' && (
              <div className="space-y-4 max-w-xl">
                <p className="text-[13px] text-white/55">Give to a fund below — one-time or recurring. Real giving runs on the church's own Stripe account.</p>
                {(c.givingFunds || []).map(f => {
                  const pct = f.goal ? Math.min(100, Math.round((f.raised || 0) / f.goal * 100)) : 0;
                  return (
                    <div key={f.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                      <div className="flex items-center justify-between mb-1"><h4 className="text-sm font-black text-white">{f.name}</h4><button onClick={demoAction} className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white" style={{ background: V }}>Give</button></div>
                      <p className="text-[11px] text-white/45 mb-3">{f.description}</p>
                      {f.goal ? (<>
                        <div className="h-2 rounded-full bg-black/40 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: V }} /></div>
                        <div className="flex justify-between mt-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40 tabular-nums"><span style={{ color: VS }}>${(f.raised || 0).toLocaleString()} raised</span><span>of ${f.goal.toLocaleString()}</span></div>
                      </>) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <p className="text-[9px] font-black uppercase tracking-[0.25em] mb-3" style={{ color: VS }}>{title}</p>
    {children}
  </div>
);

export default ChurchDemoView;
