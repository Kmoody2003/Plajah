/**
 * EventsHome — Plajah Events, under Community in the side pillar.
 *
 *   Discover (the "Marquee" landing Kenne chose): a living invitation up front, Create an event, the collections,
 *            and public events on Plajah (tickets).
 *   Your events (the "Command Center"): every invitation and ticketed event you host, with reply counts, quick
 *            share, and the professional tools one tap away (ticketing, door ops, production studio).
 */
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import EviteCard from '../evite/EviteCard';
import EraDesignGrid, { EraThumb } from '../evite/EraDesignGrid';
import { ERA_EVITE_IDS, isEraId } from '../../services/evite/eraIds';
const ERAS = 'eras';
import { PLATE_COLLECTIONS, plateUrls, isAlternate, prettySubject } from '../../services/evite/plateCatalog';
import { myInvites, type MineItem } from '../../services/evite/eviteHostClient';
import { fetchCreatorEvents } from '../../services/backendService';
import type { EviteHost } from '../../services/evite/eviteTypes';

const EviteThemeMarket = React.lazy(() => import('../evite/EviteThemeMarket'));

const LiveEventsGallery = React.lazy(() => import('../LiveEventsGallery'));

export interface EventsHomeProps {
  currentUser: { uid: string; displayName?: string } | null;
  onCreate(opts?: { plateId?: string; host?: EviteHost }): void;
  onManage(inviteId: string): void;
  onOpenEvent(eventId: string): void;
  onCreateTicketed(): void;
  onOpenTicketing(): void;
  onOpenProduction(): void;
  onSignIn(): void;
}

const HERO = ['kids_kaiju/disco', 'wedding/floral-arch', 'kids_boy/dino', 'adult/disco', 'holidays/diwali', 'wedding/emerald-deco'];
const COVER: Record<string, string> = { kids_everyone: 'circus', kids_boy: 'rocket', kids_girl: 'unicorn', kids_kaiju: 'cake-eruption', gaming: 'voxel-adventure', sports_kids: 'soccer', sports_adult: 'basketball', patriotic: 'independence-day', military: 'welcome-home', adult: 'champagne', life: 'baby-shower', holidays: 'christmas', faith: 'baptism', anniversary: 'rings', general: 'stringlights', wedding: 'floral-arch' };

export default function EventsHome(p: EventsHomeProps) {
  // ?evite_theme=<id> (share links, the return from theme Checkout) lands on the theme market.
  const [tab, setTab] = useState<'discover' | 'mine' | 'themes'>(() => typeof location !== 'undefined' && new URLSearchParams(location.search).has('evite_theme') ? 'themes' : 'discover');
  const [hero, setHero] = useState(() => HERO[Math.floor(Math.random() * HERO.length)]);
  const [mine, setMine] = useState<MineItem[] | null>(null);
  const [ticketed, setTicketed] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!p.currentUser) return;
    myInvites().then(setMine).catch(() => setMine([]));
    fetchCreatorEvents(p.currentUser.uid).then(setTicketed).catch(() => {});
  }, [p.currentUser]);
  useEffect(() => { if (mine && mine.length && tab === 'discover' && !sessionStorage.getItem('pj-events-tab')) setTab('mine'); }, [mine]);   // eslint-disable-line react-hooks/exhaustive-deps
  const switchTab = (t: 'discover' | 'mine' | 'themes') => { setTab(t); try { sessionStorage.setItem('pj-events-tab', t); } catch { /* */ } };

  const start = Date.now() + 12 * 864e5;
  const heroFields = useMemo(() => {
    const c = hero.split('/')[0];
    const headline = c === 'wedding' ? 'Mira & Ellis' : c.startsWith('kids') ? 'Max is turning 6!' : c === 'holidays' ? 'Diwali Night' : 'Night Fever';
    return { headline, subline: '', startsAt: start, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, venueName: 'Tap to make it yours' };
  }, [hero]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-full text-white px-4 py-5 sm:px-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <div role="tablist" aria-label="Events" className="flex gap-1.5">
          {(['discover', 'mine', 'themes'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => switchTab(t)} className={`h-9 px-4 rounded-full text-xs font-black uppercase tracking-widest border ${tab === t ? 'bg-white text-black border-white' : 'border-white/15 text-white/60'}`}>{t === 'discover' ? 'Discover' : t === 'mine' ? 'Your events' : 'Themes'}</button>)}
        </div>
        <button className="ml-auto h-10 px-5 rounded-full font-black text-xs uppercase tracking-widest text-white" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }} onClick={() => p.onCreate()}>+ Create an event</button>
      </div>

      {tab === 'themes' && (
        <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-white/5" />}>
          <EviteThemeMarket currentUser={p.currentUser} onSignIn={p.onSignIn} onUseTheme={(templateId: string) => p.onCreate({ plateId: templateId })} />
        </Suspense>
      )}
      {tab === 'discover' && <>
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center pb-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[.2em] text-orange-400">Plajah Events</p>
            <h1 className="font-black italic uppercase leading-[.9] tracking-tight my-3" style={{ fontFamily: 'Outfit, Inter, sans-serif', fontSize: 'clamp(40px, 7vw, 76px)' }}>Invite them <span style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>in motion.</span></h1>
            <p className="text-white/70 text-base max-w-md">Living invitations that move when your guests tilt their phone. They reply from any browser, with no account and no app. Kids get a game; grown-ups get the details. Sell tickets from the same page when you need to.</p>
            <div className="flex flex-wrap gap-3 mt-6">
              <button className="h-12 px-6 rounded-full font-black text-sm uppercase tracking-widest text-white" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }} onClick={() => p.onCreate({ plateId: hero })}>Start with this design</button>
              <button className="h-12 px-6 rounded-full font-bold text-sm border border-white/20" onClick={() => setHero(HERO[(HERO.indexOf(hero) + 1) % HERO.length])}>Show me another</button>
            </div>
            <dl className="flex gap-8 mt-7">
              {[['272', 'living designs'], ['0', 'guest sign-ups'], ['$0', 'Plajah cut on gifts']].map(([n, l]) => <div key={l}><dt className="sr-only">{l}</dt><dd className="text-2xl font-black italic">{n}</dd><div className="text-[11px] font-bold uppercase tracking-widest text-white/50">{l}</div></div>)}
            </dl>
          </div>
          <div className="w-full max-w-[340px] mx-auto"><EviteCard key={hero} plateId={hero} fields={heroFields} ctaLabel="RSVP" onCta={() => p.onCreate({ plateId: hero })} /></div>
        </section>

        <section className="pb-8">
          <h2 className="font-black italic uppercase text-xl mb-3" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>Start with a feeling</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PLATE_COLLECTIONS.map(c => { const u = plateUrls(`${c.id}/${COVER[c.id] || c.plates[0]}`) || plateUrls(`${c.id}/${c.plates[0]}`); const n = c.plates.filter(x => !isAlternate(x)).length; return (
              <button key={c.id} onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id} className="relative rounded-3xl overflow-hidden text-left aspect-[4/5] border border-white/10 group">
                {u && <img src={u.thumb} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <div className="absolute left-3 right-3 bottom-3"><div className="font-black italic uppercase leading-none" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>{c.label}</div><div className="text-xs text-white/70 mt-1">{n} designs</div></div>
              </button>
            ); })}
            <button onClick={() => setOpen(open === ERAS ? null : ERAS)} aria-expanded={open === ERAS} className="relative rounded-3xl overflow-hidden text-left aspect-[4/5] border border-white/10 group">
              <EraThumb id="era/art-deco" alt="" width={320} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute left-3 right-3 bottom-3"><div className="font-black italic uppercase leading-none" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>Design eras</div><div className="text-xs text-white/70 mt-1">{ERA_EVITE_IDS.length} designs · a style lesson you can send</div></div>
            </button>
          </div>
          {open === ERAS && (
            <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center mb-2"><b className="text-sm">Design eras</b><button className="ml-auto text-xs underline text-white/60" onClick={() => setOpen(null)}>Close</button></div>
              <EraDesignGrid onPick={id => p.onCreate({ plateId: id })} columns="grid-cols-3 sm:grid-cols-6" />
            </div>
          )}
          {open && open !== ERAS && (() => { const c = PLATE_COLLECTIONS.find(x => x.id === open)!; return (
            <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center mb-2"><b className="text-sm">{c.label}</b><button className="ml-auto text-xs underline text-white/60" onClick={() => setOpen(null)}>Close</button></div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {c.plates.filter(x => !isAlternate(x)).map(s => { const u = plateUrls(`${c.id}/${s}`)!; return (
                  <button key={s} onClick={() => p.onCreate({ plateId: `${c.id}/${s}` })} className="relative rounded-2xl overflow-hidden"><img src={u.thumb} alt={prettySubject(s)} loading="lazy" className="w-full aspect-[2/3] object-cover" /><span className="absolute left-1 right-1 bottom-1 text-[10px] font-bold capitalize bg-black/60 rounded-full px-2 truncate">{prettySubject(s)}</span></button>
                ); })}
              </div>
            </div>
          ); })()}
        </section>

        <section>
          <h2 className="font-black italic uppercase text-xl mb-3" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>Happening on Plajah</h2>
          <React.Suspense fallback={<div className="h-40 rounded-3xl bg-white/5 animate-pulse" />}><LiveEventsGallery onSelectEvent={p.onOpenEvent} onCreateEvent={p.onCreateTicketed} /></React.Suspense>
        </section>
      </>}

      {tab === 'mine' && (
        !p.currentUser ? <div className="rounded-3xl border border-white/10 p-6 text-center"><p className="mb-4 text-white/75">Sign in to see the events you host.</p><button className="h-11 px-5 rounded-full bg-white text-black font-black text-xs uppercase tracking-widest" onClick={p.onSignIn}>Sign in</button></div>
          : <CommandCenter mine={mine} ticketed={ticketed} {...p} />
      )}
    </div>
  );
}

function CommandCenter({ mine, ticketed, onManage, onCreate, onOpenEvent, onOpenTicketing, onOpenProduction, onCreateTicketed }: EventsHomeProps & { mine: MineItem[] | null; ticketed: any[] }) {
  const now = Date.now();
  const items = (mine || []).slice().sort((a, b) => Math.abs(a.invite.fields.startsAt - now) - Math.abs(b.invite.fields.startsAt - now));
  const upcoming = items.filter(i => i.invite.fields.startsAt >= now - 864e5 && i.invite.status !== 'cancelled');
  const past = items.filter(i => !upcoming.includes(i));
  const next = upcoming[0];
  const quick: Array<[string, string, () => void]> = [
    ['Birthday', 'Kids or grown-ups', () => onCreate({ plateId: 'kids_boy/dino' })],
    ['Wedding', 'RSVP, meals, registry', () => onCreate({ plateId: 'wedding/floral-arch' })],
    ['Gathering', 'Potluck, BBQ, holiday', () => onCreate({ plateId: 'general/stringlights' })],
    ['Ticketed show', 'Tiers, QR, door scan', onCreateTicketed],
  ];
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">{quick.map(([t, d, go]) => <button key={t} onClick={go} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left hover:bg-white/[0.08]"><b className="block">{t}</b><span className="text-xs text-white/55">{d}</span></button>)}</div>
      {mine === null && <div className="h-40 rounded-3xl bg-white/5 animate-pulse" />}
      {mine && mine.length === 0 && ticketed.length === 0 && <div className="rounded-3xl border border-dashed border-white/15 p-8 text-center text-white/70">You aren’t hosting anything yet. Pick a design above and you’ll have a link to share in about two minutes.</div>}

      {next && (() => { const u = plateUrls(next.invite.templateId); const days = Math.ceil((next.invite.fields.startsAt - now) / 864e5); return (
        <section className="grid sm:grid-cols-[150px_minmax(0,1fr)] gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4 items-center">
          {u ? <img src={u.thumb} alt="" className="w-full max-w-[150px] rounded-2xl aspect-[2/3] object-cover" /> : isEraId(next.invite.templateId) && <EraThumb id={next.invite.templateId} alt="" width={300} className="w-full max-w-[150px] rounded-2xl aspect-[2/3] object-cover" />}
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-orange-400">Next up · {days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}</p>
            <h3 className="text-2xl font-black italic uppercase truncate" style={{ fontFamily: 'Outfit, Inter, sans-serif' }}>{next.invite.fields.headline}</h3>
            <div className="flex gap-6 my-3">{([['Going', next.counts.yes], ['Maybe', next.counts.maybe], ['Headcount', next.counts.headcount]] as const).map(([l, n]) => <div key={l}><div className="text-2xl font-black italic">{n}</div><div className="text-[10px] font-black uppercase tracking-widest text-white/50">{l}</div></div>)}</div>
            <div className="flex flex-wrap gap-2"><button className="h-10 px-4 rounded-full bg-white text-black text-xs font-black uppercase tracking-widest" onClick={() => onManage(next.invite.id)}>Manage</button>
              <button className="h-10 px-4 rounded-full border border-white/20 text-xs font-bold" onClick={() => navigator.clipboard?.writeText(`${location.origin}/i/${next.invite.id}`)}>Copy link</button></div>
          </div>
        </section>
      ); })()}

      {upcoming.length > 1 && <List title="Coming up" items={upcoming.slice(1)} onManage={onManage} />}
      {ticketed.length > 0 && (
        <section><h3 className="text-xs font-black uppercase tracking-widest text-white/60 mb-2">Ticketed events</h3>
          <div className="grid gap-2">{ticketed.slice(0, 8).map((e: any) => <button key={e.id} onClick={() => onOpenEvent(e.id)} className="flex items-center gap-3 rounded-2xl border border-white/10 p-3 text-left hover:bg-white/[0.05]"><b className="truncate">{e.title}</b><span className="text-xs text-white/50 ml-auto">{e.startDate ? new Date(e.startDate).toLocaleDateString() : ''}</span></button>)}</div>
        </section>
      )}
      {past.length > 0 && <List title="Past" items={past} onManage={onManage} />}
      <section className="rounded-3xl border border-white/10 p-4 grid sm:grid-cols-3 gap-3 text-sm">
        <div><b className="block mb-1">Tickets &amp; door</b><span className="text-white/60">Tiers, promo codes, kiosk check-in and QR scanning.</span><button className="block mt-2 underline" onClick={onOpenTicketing}>Open Ticketing</button></div>
        <div><b className="block mb-1">Production Studio</b><span className="text-white/60">Vendors, budget, contracts and payroll for promoters and planners.</span><button className="block mt-2 underline" onClick={onOpenProduction}>Open Production Studio</button></div>
        <div><b className="block mb-1">Photo pools</b><span className="text-white/60">Every event gets one. Guests choose what goes public.</span></div>
      </section>
    </div>
  );
}

function List({ title, items, onManage }: { title: string; items: MineItem[]; onManage(id: string): void }) {
  return (
    <section><h3 className="text-xs font-black uppercase tracking-widest text-white/60 mb-2">{title}</h3>
      <div className="grid gap-2">{items.map(({ invite, counts }) => { const u = plateUrls(invite.templateId); const d = new Date(invite.fields.startsAt); return (
        <button key={invite.id} onClick={() => onManage(invite.id)} className="grid grid-cols-[44px_minmax(0,1fr)_auto] gap-3 items-center rounded-2xl border border-white/10 p-2.5 text-left hover:bg-white/[0.05]">
          {u ? <img src={u.thumb} alt="" className="w-11 h-16 rounded-lg object-cover" /> : isEraId(invite.templateId) ? <EraThumb id={invite.templateId} alt="" width={88} className="w-11 h-16 rounded-lg object-cover" /> : <span />}
          <span className="min-w-0"><b className="block truncate">{invite.fields.headline}</b><span className="text-xs text-white/55">{d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {invite.status === 'draft' ? 'Draft' : `${counts.yes} going · ${counts.maybe} maybe`}{invite.host && invite.host.kind !== 'user' ? ` · ${invite.host.label || invite.host.kind}` : ''}</span></span>
          <span className="text-xs font-black text-white/60">{counts.headcount}</span>
        </button>
      ); })}</div>
    </section>
  );
}
