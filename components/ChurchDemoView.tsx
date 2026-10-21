import React, { useState } from 'react';
import {
  ChevronLeft, Users, Image as ImageIcon, Calendar, Play, Heart, MessageSquare,
  MapPin, Clock, Ticket, ShoppingBag, ArrowRight, Home, HandHeart, Church, MessageCircle,
  BookOpen, Gift, Check, ExternalLink, Radio, NotebookPen, Sparkles,
} from 'lucide-react';
import DemoRibbon from './DemoRibbon';
import ChurchAdminDemoView from './ChurchAdminDemoView';
import ChurchMemberHub from './elevate/ChurchMemberHub';
import RelloChurchViewer from './elevate/RelloChurchViewer';
import ElevateMobilizeHub from './elevate/ElevateMobilizeHub';
import {
  DEMO_CHURCH, DEMO_CHURCH_STAFF, DEMO_CHURCH_ALBUMS, DEMO_CHURCH_EVENTS,
  DEMO_CHURCH_VIDEOS, DEMO_CHURCH_FEED, DEMO_MINISTRY_DETAIL,
  DEMO_CHURCH_PRAYERS, DEMO_CHURCH_LIBRARY,
  type DemoPost, type DemoEvent, type DemoStaff,
} from '../data/demoShowcase';
import { AdaptiveGrid, TYPE } from '../src/lib/designSystem';
import { EV, EvScope, EvModeBar, EvHero, EvTabs, EvSundaySheet, EvIndexList, EvSectionHead, openLectio, heroImage } from './elevate/vellum';

// A fully-populated, static tour of a church on Plajah — the ministry hierarchy,
// each ministry a space with feed / photos / staff+DM / events / merch, plus
// church-level photos, events, video archive, staff and giving. A sales demo:
// buttons that would move money or send a message show a friendly nudge instead.

const V = EV.violet;
const VS = EV.violetText;
const demoAction = () => alert('This is a live demo. Create your own church space to make this real — tickets, giving, messaging and merch all run for you.');

type Tab = 'HOME' | 'MINISTRIES' | 'MOBILIZE' | 'PHOTOS' | 'EVENTS' | 'WATCH' | 'PRAYER' | 'LIBRARY' | 'STAFF' | 'GIVE';

const PostCard: React.FC<{ p: DemoPost }> = ({ p }) => (
  <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
    <div className="flex items-center gap-2.5 mb-2">
      <img src={p.authorPhoto} className="w-9 h-9 rounded-full object-cover border border-white/10" alt="" />
      <div><p className={`${TYPE.titleSm} text-white`}>{p.author}</p><p className={`${TYPE.labelSm} text-white/35`}>{p.when} ago</p></div>
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
      <div className={`flex items-center gap-2 ${TYPE.labelSm} mb-1`} style={{ color: VS }}><Calendar size={10} /> {e.date} · {e.time}</div>
      <h4 className="text-base font-black text-white mb-1">{e.title}</h4>
      <p className="type-body-md text-white/50 leading-snug mb-2">{e.blurb}</p>
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1 ${TYPE.labelMd} text-white/40`}><MapPin size={10} /> {e.location}</span>
        <button onClick={demoAction} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${TYPE.labelMd} text-white`} style={{ background: V }}>
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
          <span className={`shrink-0 ${TYPE.labelSm} px-1.5 py-0.5 rounded`} style={{ color: VS, background: 'rgba(122, 31, 192,0.14)' }}>Demo user</span>
        </div>
        <p className={`${TYPE.labelMd} mb-1`} style={{ color: VS }}>{s.role}</p>
        {s.bio && <p className="type-body-sm text-white/45 leading-snug line-clamp-2">{s.bio}</p>}
      </div>
    </button>
    <button onClick={demoAction} title="Message" className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: V }}><MessageCircle size={15} /></button>
  </div>
);

const ChurchDemoView: React.FC<{ onBack?: () => void; onCreate: () => void; onVisitUser?: (uid: string) => void }> = ({ onBack, onCreate, onVisitUser }) => {
  const [tab, setTab] = useState<Tab>('HOME');
  const [ministryId, setMinistryId] = useState<string | null>(null);
  const [mode, setMode] = useState<'hub' | 'member' | 'admin'>('member');
  const c = DEMO_CHURCH;

  // Public page · Member home · Staff — the same three views every Elevate org page carries.
  const MODES = [
    { k: 'member', label: 'Public page' },
    { k: 'hub', label: 'Member home' },
    { k: 'admin', label: 'Staff' },
  ];
  const modeToggle = <EvModeBar modes={MODES} value={mode} onChange={k => setMode(k as typeof mode)} onBack={onBack} />;

  if (mode === 'admin') {
    return (
      <EvScope className="h-full flex flex-col">
        {modeToggle}
        <div className="flex-1 min-h-0"><ChurchAdminDemoView onCreate={onCreate} /></div>
      </EvScope>
    );
  }

  if (mode === 'hub') {
    return (
      <EvScope className="h-full overflow-y-auto scrollbar-hide">
        <DemoRibbon label="church" accent={V} ctaText="Create your church" onCreate={onCreate} />
        {modeToggle}
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6">
          <ChurchMemberHub
            org={c}
            onOpenGive={() => { setMode('member'); setTab('GIVE'); }}
            onOpenMinistry={id => { setMode('member'); setMinistryId(id); }}
          />
        </div>
      </EvScope>
    );
  }
  // Members are real Plajah accounts → open their profile/feed. Demo accounts
  // have no real uid, so they show a preview nudge instead.
  const visitStaff = (s: DemoStaff) => (s.uid && onVisitUser ? onVisitUser(s.uid) : demoUserNudge());

  const TABS: { k: Tab; label: string }[] = [
    { k: 'HOME', label: 'This Sunday' }, { k: 'MINISTRIES', label: 'Ministries' },
    { k: 'MOBILIZE', label: 'Serve' }, { k: 'EVENTS', label: 'Events' },
    { k: 'WATCH', label: 'Watch' }, { k: 'LIBRARY', label: 'Read' },
    { k: 'PRAYER', label: 'Prayer' }, { k: 'PHOTOS', label: 'Photos' },
    { k: 'STAFF', label: 'Our team' }, { k: 'GIVE', label: 'Give' },
  ];

  const ministry = ministryId ? (c.ministries || []).find(m => m.id === ministryId) : null;
  const md = ministryId ? DEMO_MINISTRY_DETAIL[ministryId] : undefined;
  const [latest, ...earlier] = DEMO_CHURCH_VIDEOS;
  const splitTitle = (t: string) => { const [title, ref] = t.split(' — '); return { title, ref }; };

  return (
    <EvScope className="h-full overflow-y-auto scrollbar-hide">
      <DemoRibbon label="church" accent={V} ctaText="Create your church" onCreate={onCreate} />
      {modeToggle}

      <EvHero
        name={c.name}
        logoUrl={c.logoUrl}
        meta={`${c.denomination} · ${(c.campuses || []).map(x => x.name.replace(' Campus', '')).join(', ')}`}
        tagline={c.tagline || c.name}
        intro="A non-denominational church in Anytown learning to love God and neighbor — reading through the Gospel of John together this season."
        times={(c.serviceTimes || []).map(s => ({ id: s.id, label: `${s.label}${s.isOnline ? ' · also online' : ''}`, day: s.day === 'Sunday' ? 'Sun' : s.day?.slice(0, 3), time: s.time }))}
        actions={<>
          <button onClick={demoAction} className="ev-btn ev-btn-primary">Join {c.name}</button>
          <button onClick={() => setTab('HOME')} className="ev-btn ev-btn-ghost">Plan your first Sunday</button>
        </>}
        coverUrl={heroImage(c.coverUrl)}
      />

      <EvTabs tabs={TABS} value={ministryId ? null : tab} onChange={k => { setTab(k as Tab); setMinistryId(null); }} top={52} />

      <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-10 space-y-10">
        {/* Persistent Live Stream & Ministry TV Channel Thumbnail Carousel right under the tabs */}
        <RelloChurchViewer org={c} defaultPlayerExpanded={false} />

        {/* ── Ministry detail (drill-down) ── */}
        {ministry ? (
          <div className="space-y-6">
            <button onClick={() => setMinistryId(null)} className={`flex items-center gap-1.5 text-white/40 hover:text-white ${TYPE.labelMd}`}><ChevronLeft size={15} /> All ministries</button>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{ministry.iconEmoji}</span>
              <div>
                <h2 className="text-2xl font-black text-white">{ministry.name}</h2>
                <p className={TYPE.labelMd} style={{ color: VS }}><Clock size={10} className="inline mr-1" />{ministry.meetingTime}</p>
              </div>
            </div>
            <p className="type-title-sm text-white/55 leading-relaxed max-w-2xl">{ministry.description}</p>

            {md ? (
              <>
                {/* Leaders */}
                <Section title="Leaders">
                  <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="0.75rem">{md.leaders.map(l => <StaffCard key={l.id} s={l} onVisit={() => visitStaff(l)} />)}</AdaptiveGrid>
                </Section>
                {/* Feed */}
                {md.posts.length > 0 && <Section title="Feed"><div className="space-y-3">{md.posts.map(p => <PostCard key={p.id} p={p} />)}</div></Section>}
                {/* Photos */}
                {md.albums.length > 0 && (
                  <Section title="Photos">
                    {md.albums.map(a => (
                      <div key={a.id}>
                        <p className={`${TYPE.labelMd} text-white/40 mb-2`}>{a.title}</p>
                        <AdaptiveGrid phone={3} tablet={3} desktop={3} gap="0.5rem">{a.photos.map((ph, i) => <img key={i} src={ph} onClick={demoAction} className="aspect-square object-cover rounded-xl border border-white/10 cursor-zoom-in" alt="" loading="lazy" />)}</AdaptiveGrid>
                      </div>
                    ))}
                  </Section>
                )}
                {/* Events */}
                {md.events.length > 0 && <Section title="Events"><AdaptiveGrid phone={1} tablet={2} desktop={2} gap="0.75rem">{md.events.map(e => <EventCard key={e.id} e={e} />)}</AdaptiveGrid></Section>}
                {/* Merch */}
                {md.merch.length > 0 && (
                  <Section title="Ministry Shop">
                    <AdaptiveGrid phone={2} tablet={3} desktop={3} gap="0.75rem">
                      {md.merch.map(m => (
                        <div key={m.id} className="rounded-2xl overflow-hidden bg-white/[0.03] border border-white/10">
                          <img src={m.image} className="w-full aspect-square object-cover" alt="" loading="lazy" />
                          <div className="p-3">
                            <p className="type-body-md font-bold text-white truncate">{m.title}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-sm font-black" style={{ color: VS }}>${m.price}</span>
                              <button onClick={demoAction} className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: V }}><ShoppingBag size={13} /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </AdaptiveGrid>
                  </Section>
                )}
              </>
            ) : (
              <div className="rounded-2xl p-6 text-center bg-white/[0.03] border border-white/10">
                <p className="type-body-md text-white/40">This ministry's space — feed, photos, events, merch and a chat with its leaders — is set up the same way. Create your church to populate it.</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ── HOME · This Sunday ── */}
            {tab === 'HOME' && latest && (
              <div className="space-y-16">
                <EvSundaySheet
                  eyebrow={`This Sunday · ${latest.series}`}
                  title={splitTitle(latest.title).title}
                  byline={`Pastor Daniel Reyes · ${splitTitle(latest.title).ref || latest.series} · ${latest.duration}`}
                  verse={{ n: 12, text: 'I am the light of the world. He who follows me will not walk in the darkness, but will have the light of life.', ref: 'John 8:12' }}
                  onWatch={() => setTab('WATCH')}
                  onRead={() => openLectio('43.8.12')}
                  readLabel="Read John 8 in Lectio"
                  earlier={earlier.map((v, i) => ({ id: v.id, n: v.series === latest.series ? String(7 - i).padStart(2, '0') : undefined, title: splitTitle(v.title).title, meta: `${splitTitle(v.title).ref ? `${splitTitle(v.title).ref} · ` : ''}${v.date}`, len: v.duration, onClick: () => setTab('WATCH') }))}
                />

                <section>
                  <EvSectionHead title="Find your people" action={<button onClick={() => setTab('MINISTRIES')} className="text-sm" style={{ color: VS }}>All ministries</button>} />
                  <EvIndexList items={(c.ministries || []).map(m => ({ id: m.id, name: m.name, when: m.meetingTime, onClick: () => setMinistryId(m.id) }))} />
                </section>

                <div className="flex flex-wrap gap-5 items-start">
                  <section className="space-y-3" style={{ flex: '999 1 560px', minWidth: 0 }}>
                    <EvSectionHead title="From the church" size="md" />
                    {DEMO_CHURCH_FEED.map(p => <PostCard key={p.id} p={p} />)}
                  </section>
                  <aside className="ev-panel p-7 flex flex-col" style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <h2 className="m-0 mb-3 ev-title text-2xl text-white">Coming up</h2>
                    <div className="ev-rule">
                      {DEMO_CHURCH_EVENTS.slice(0, 3).map(e => (
                        <button key={e.id} onClick={() => setTab('EVENTS')} className="ev-row-link w-full text-left py-3.5 px-1 flex flex-col gap-0.5">
                          <span className="ev-num text-sm text-[#A49CB2]">{e.date}</span>
                          <span className="text-[15px] font-medium text-white">{e.title}</span>
                          <span className="text-[13px] text-[#A49CB2]">{e.location}</span>
                        </button>
                      ))}
                    </div>
                  </aside>
                </div>
              </div>
            )}

            {/* ── MINISTRIES ── */}
            {tab === 'MINISTRIES' && (
              <section>
                <EvSectionHead title="Find your people" />
                <EvIndexList items={(c.ministries || []).map(m => ({ id: m.id, name: m.name, when: m.meetingTime, onClick: () => setMinistryId(m.id) }))} />
              </section>
            )}

            {/* ── MOBILIZE & SERVE ── */}
            {tab === 'MOBILIZE' && (
              <ElevateMobilizeHub
                org={c}
                currentUserId="demo-member-elena"
                currentUserName="Elena Sterling"
                currentUserEmail="elena.sterling@example.org"
                canManage={false}
                initialContext="public"
              />
            )}

            {/* ── PHOTOS ── */}
            {tab === 'PHOTOS' && (
              <div className="space-y-8">
                {DEMO_CHURCH_ALBUMS.map(a => (
                  <div key={a.id}>
                    <p className="text-sm font-black uppercase tracking-widest text-white mb-3">{a.title} <span className="text-white/30 text-[11px]">· {a.photos.length}</span></p>
                    <AdaptiveGrid phone={2} tablet={3} desktop={3} gap="0.5rem">{a.photos.map((ph, i) => <img key={i} src={ph} onClick={demoAction} className="aspect-square object-cover rounded-xl border border-white/10 cursor-zoom-in hover:opacity-90" alt="" loading="lazy" />)}</AdaptiveGrid>
                  </div>
                ))}
                <button onClick={demoAction} className={`w-full py-3 rounded-2xl ${TYPE.labelMd} text-white`} style={{ background: 'rgba(122, 31, 192,0.15)', border: `1px solid rgba(122, 31, 192,0.3)` }}>+ New album (demo)</button>
              </div>
            )}

            {/* ── EVENTS ── */}
            {tab === 'EVENTS' && <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="1rem">{DEMO_CHURCH_EVENTS.map(e => <EventCard key={e.id} e={e} />)}</AdaptiveGrid>}

            {/* ── WATCH ── */}
            {tab === 'WATCH' && (
              <>
              {/* Live scripture sync — the thing no other church platform does. */}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('OPEN_FOLLOW_ALONG', { detail: {} }))}
                className="w-full text-left mb-4 p-4 rounded-2xl border transition-all hover:brightness-110"
                style={{ borderColor: 'rgba(226, 194, 126,0.35)', background: 'linear-gradient(135deg, rgba(226, 194, 126,0.12), rgba(122, 31, 192,0.08))' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Radio size={14} style={{ color: '#E2C27E' }} />
                  <span className={`${TYPE.labelMd} text-white`}>Follow along with the service</span>
                  <span className="ml-auto px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest" style={{ background: 'rgba(226, 194, 126,0.2)', color: '#E2C27E' }}>Live</span>
                </div>
                <p className="type-body-sm text-white/50 leading-relaxed">
                  Whether you’re in the room or watching from home, your phone turns to each passage
                  as it’s read — and saves it to your notes with the moment it happened.
                </p>
              </button>
              <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="1rem">
                {DEMO_CHURCH_VIDEOS.map(v => (
                  <button key={v.id} onClick={demoAction} className="text-left group">
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 aspect-video">
                      <img src={v.thumb} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="" loading="lazy" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center"><Play size={20} className="text-white ml-0.5" /></div></div>
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-black text-white tabular-nums">{v.duration}</span>
                    </div>
                    <p className={`${TYPE.labelSm} mt-2`} style={{ color: VS }}>{v.series}</p>
                    <p className="text-sm font-bold text-white leading-tight">{v.title}</p>
                    <p className="text-[10px] text-white/35">{v.date}</p>
                  </button>
                ))}
              </AdaptiveGrid>
              </>
            )}

            {/* ── PRAYER ── */}
            {tab === 'PRAYER' && (
              <div className="space-y-4 max-w-2xl">
                <button onClick={demoAction} className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl ${TYPE.labelMd} text-white`} style={{ background: V }}>
                  <HandHeart size={14} /> Submit a prayer request
                </button>
                {DEMO_CHURCH_PRAYERS.map(pr => (
                  <div key={pr.id} className="rounded-2xl p-4 border" style={{ background: pr.answered ? 'rgba(63,190,133,0.06)' : 'rgba(255,255,255,0.03)', borderColor: pr.answered ? 'rgba(63,190,133,0.25)' : 'rgba(255,255,255,0.1)' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className={`${TYPE.titleSm} text-white`}>{pr.name} <span className="text-white/30 font-bold">· {pr.when} ago</span></p>
                      {pr.answered && <span className={`flex items-center gap-1 ${TYPE.labelSm} text-emerald-400`}><Check size={10} /> Answered</span>}
                    </div>
                    <p className="text-sm text-white/75 leading-relaxed mb-3">{pr.request}</p>
                    <button onClick={demoAction} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${TYPE.labelMd} text-white`} style={{ background: pr.answered ? 'rgba(63,190,133,0.15)' : 'rgba(122, 31, 192,0.15)', border: `1px solid ${pr.answered ? 'rgba(63,190,133,0.3)' : 'rgba(122, 31, 192,0.3)'}` }}>
                      <HandHeart size={11} style={{ color: pr.answered ? '#3FBE85' : VS }} /> {pr.praying} praying
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── LIBRARY ── */}
            {tab === 'LIBRARY' && (
              <div>
                {/* Scripture is free for everyone, so these open for real rather
                    than showing the demo nudge. */}
                <div className="mb-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { icon: BookOpen, title: 'Read Scripture', sub: 'KJV · Vulgate · Greek · Hebrew, side by side', ev: 'OPEN_BIBLE' },
                    { icon: Radio, title: 'Follow along', sub: 'Your phone turns to each passage in service', ev: 'OPEN_FOLLOW_ALONG' },
                    { icon: NotebookPen, title: 'Service notes', sub: 'Every passage you’ve been taught, by day', ev: 'OPEN_BIBLE' },
                  ].map(({ icon: Icon, title, sub, ev }) => (
                    <button key={title}
                      onClick={() => window.dispatchEvent(new CustomEvent(ev, { detail: {} }))}
                      className="text-left p-3.5 rounded-2xl border transition-all hover:brightness-125"
                      style={{ borderColor: 'rgba(226, 194, 126,0.28)', background: 'rgba(226, 194, 126,0.05)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={14} style={{ color: '#E2C27E' }} />
                        <span className={`${TYPE.labelMd} text-white`}>{title}</span>
                      </div>
                      <p className="type-body-sm text-white/45 leading-snug">{sub}</p>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between mb-4">
                  <p className="type-title-sm text-white/55 max-w-md">A reading list curated by our teaching team, powered by Lorea.</p>
                  <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_BIBLE', { detail: {} }))} className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full ${TYPE.labelMd} text-white`} style={{ background: 'rgba(122, 31, 192,0.15)', border: '1px solid rgba(122, 31, 192,0.3)' }}>
                    <BookOpen size={12} style={{ color: VS }} /> Sacred Library <ExternalLink size={11} />
                  </button>
                </div>
                <AdaptiveGrid phone={2} tablet={4} desktop={5} gap="1rem">
                  {DEMO_CHURCH_LIBRARY.map(b => (
                    <button key={b.id} onClick={demoAction} className="text-left group">
                      <div className="rounded-xl overflow-hidden border border-white/10 aspect-[3/4] shadow-lg">
                        <img src={b.cover} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt="" loading="lazy" />
                      </div>
                      <p className="type-body-md font-bold text-white leading-tight mt-2 line-clamp-2">{b.title}</p>
                      <p className="text-[10px] text-white/40">{b.author}</p>
                    </button>
                  ))}
                </AdaptiveGrid>
              </div>
            )}

            {/* ── STAFF ── */}
            {tab === 'STAFF' && <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="0.75rem">{DEMO_CHURCH_STAFF.map(s => <StaffCard key={s.id} s={s} onVisit={() => visitStaff(s)} />)}</AdaptiveGrid>}

            {/* ── GIVE ── */}
            {tab === 'GIVE' && (
              <div className="space-y-4 max-w-xl">
                <p className="type-title-sm text-white/55">Give to a fund below — one-time or recurring. Real giving runs on the church's own Stripe account.</p>
                {(c.givingFunds || []).map(f => {
                  const pct = f.goal ? Math.min(100, Math.round((f.raised || 0) / f.goal * 100)) : 0;
                  return (
                    <div key={f.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                      <div className="flex items-center justify-between mb-1"><h4 className="text-sm font-black text-white">{f.name}</h4><button onClick={demoAction} className={`px-4 py-1.5 rounded-full ${TYPE.labelMd} text-white`} style={{ background: V }}>Give</button></div>
                      <p className="type-body-sm text-white/45 mb-3">{f.description}</p>
                      {f.goal ? (<>
                        <div className="h-2 rounded-full bg-black/40 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: EV.brand }} /></div>
                        <div className={`flex justify-between mt-1.5 ${TYPE.labelMd} text-white/40 tabular-nums`}><span style={{ color: VS }}>${(f.raised || 0).toLocaleString()} raised</span><span>of ${f.goal.toLocaleString()}</span></div>
                      </>) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </EvScope>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <p className={`${TYPE.labelSm} mb-3`} style={{ color: VS }}>{title}</p>
    {children}
  </div>
);

export default ChurchDemoView;
