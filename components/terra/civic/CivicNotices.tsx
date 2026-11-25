/**
 * Civic Notices — the government side of "updates from your city" (UI over noticesCore).
 *
 * Staff write a notice, choose where it applies (citywide, wards, or around a place), link the law
 * it concerns, and see before publishing exactly who gets it and how: in-app, push, email, in which
 * language, now or after quiet hours or in the daily digest. Hearings are checked against the
 * Michigan Zoning Enabling Act's notice rules. A resident preview shows what lands in their feed.
 */

import React, { useMemo, useState } from 'react';
import { Megaphone, MapPin, Scale, Bell, Mail, Smartphone, Globe2, CheckCircle2, AlertTriangle, Clock, Send, Users } from 'lucide-react';
import {
  type Notice, type NoticeKind, planDeliveries, deliverySummary, checkZoningHearingNotice,
} from '../../../services/terra/civic/notices/noticesCore';
import type { DeskData } from '../../../services/terra/civic/desk/deskSample';

const CYAN = '#4FC3D6', ORANGE = '#FF8C00', VIOLET = '#A78BFA', GREEN = '#3DD68C', RED = '#FF5C6C', AMBER = '#F5B544';
const card = 'rounded-2xl border border-white/[0.07] bg-white/[0.025]';
const input = 'w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-cyan-300/60';

const KINDS: { id: NoticeKind; label: string; hint: string }[] = [
  { id: 'service_disruption', label: 'Service disruption', hint: 'Water shutoff, road closure, missed collection' },
  { id: 'hearing', label: 'Public hearing', hint: 'Rezoning, variance, budget, ordinance' },
  { id: 'ordinance_change', label: 'Ordinance change', hint: 'A law people follow was amended' },
  { id: 'permit_update', label: 'Permit near you', hint: 'Demolition, construction, liquor license' },
  { id: 'program_open', label: 'Program open', hint: 'Grants, repairs, jobs, events' },
  { id: 'emergency', label: 'Emergency', hint: 'Boil-water, flooding, severe weather' },
  { id: 'general', label: 'General update', hint: 'Anything else' },
];

const DAY = 86_400_000;

export interface CivicNoticesProps {
  data: DeskData;
  now: number;
  onPublish: (n: Notice) => void;
  onOpenLaw?: (id: string) => void;
}

export default function CivicNotices({ data, now, onPublish, onOpenLaw }: CivicNoticesProps) {
  const [kind, setKind] = useState<NoticeKind>('service_disruption');
  const [title, setTitle] = useState('Water shutoff on Vernor Hwy, Thursday 9am–1pm');
  const [body, setBody] = useState('Crews are replacing a valve. Homes and businesses on Vernor Hwy between Clark and Junction will have no water from 9am to 1pm Thursday. Store a few gallons the night before.');
  const [es, setEs] = useState('Corte de agua en Vernor Hwy el jueves de 9am a 1pm. Guarde unos galones la noche anterior.');
  const [scope, setScope] = useState<'city' | 'wards' | 'place'>('wards');
  const [wards, setWards] = useState<string[]>(['6']);
  const [placeCase, setPlaceCase] = useState(() => data.cases.find((c) => c.location?.lat)?.id ?? '');
  const [radius, setRadius] = useState(800);
  const [law, setLaw] = useState('');
  const [hearingDays, setHearingDays] = useState(20);
  const [paperDays, setPaperDays] = useState(16);
  const [mailDays, setMailDays] = useState(16);

  const placeOpts = data.cases.filter((c) => c.location?.lat).slice(0, 25);
  const place = data.cases.find((c) => c.id === placeCase)?.location;

  const draft: Notice = useMemo(() => ({
    id: `draft`, jurisdictionId: 'sample-city', kind, title, body, publishedAt: now,
    i18n: es.trim() ? { es: { title: title, body: es } } : undefined,
    area: scope === 'city' ? undefined : scope === 'wards' ? { wards } : place?.lat != null ? { point: { lat: place.lat!, lng: place.lng! }, radiusM: radius } : undefined,
    lawSectionIds: law ? [law] : undefined,
    eventAt: kind === 'hearing' ? now + hearingDays * DAY : undefined,
    statutory: kind === 'hearing' ? { rule: 'mi_zoning_hearing', newspaperAt: now + (hearingDays - paperDays) * DAY, mailedAt: now + (hearingDays - mailDays) * DAY, mailedToOwnersWithinFt: 300 } : undefined,
  }), [kind, title, body, es, scope, wards, place, radius, law, hearingDays, paperDays, mailDays, now]);

  const deliveries = useMemo(() => planDeliveries(draft, data.subscribers, { tzOffsetMin: -300 }), [draft, data.subscribers]);
  const sum = deliverySummary(deliveries);
  const check = kind === 'hearing' ? checkZoningHearingNotice(draft) : null;
  const sample = deliveries.find((d) => d.language === 'es') ?? deliveries[0];

  return (
    <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-6 items-start">
      <section className={`${card} p-5 sm:p-6`}>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/35 flex items-center gap-1.5"><Megaphone size={12} /> New notice</p>
        <h2 className="mt-1 text-xl font-black">Tell people what affects them</h2>
        <div className="mt-4 grid sm:grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)} className={`text-left rounded-xl p-3 border ${kind === k.id ? 'border-cyan-300/70 bg-cyan-300/[0.07]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'}`}>
              <span className="block text-[13px] font-bold" style={k.id === 'emergency' ? { color: RED } : undefined}>{k.label}</span>
              <span className="block text-[11px] text-white/45">{k.hint}</span>
            </button>
          ))}
        </div>
        <label className="block mt-5 text-[12px] font-bold text-white/70" htmlFor="n-title">Headline</label>
        <input id="n-title" value={title} onChange={(e) => setTitle(e.target.value)} className={`${input} mt-1.5`} />
        <label className="block mt-4 text-[12px] font-bold text-white/70" htmlFor="n-body">Message</label>
        <textarea id="n-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={`${input} mt-1.5`} />
        <label className="block mt-4 text-[12px] font-bold text-white/70" htmlFor="n-es">Spanish version <span className="font-normal text-white/40">(sent to people who prefer Spanish; ARIA drafts, staff approve)</span></label>
        <textarea id="n-es" value={es} onChange={(e) => setEs(e.target.value)} rows={2} className={`${input} mt-1.5`} />

        <p className="mt-5 text-[12px] font-bold text-white/70">Where it applies</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(['place', 'wards', 'city'] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)} className={`px-3 py-1.5 rounded-full text-[12px] font-bold ${scope === s ? 'bg-white text-black' : 'bg-white/[0.05] text-white/60'}`}>{s === 'place' ? 'Around a place' : s === 'wards' ? 'Wards' : 'Citywide'}</button>
          ))}
        </div>
        {scope === 'place' && (
          <div className="mt-3 grid sm:grid-cols-[minmax(0,1fr)_160px] gap-2 items-end">
            <div><label className="block text-[11px] text-white/45" htmlFor="n-place">Location</label>
              <select id="n-place" value={placeCase} onChange={(e) => setPlaceCase(e.target.value)} className={`${input} mt-1`}>
                {placeOpts.map((c) => <option key={c.id} value={c.id}>{c.location!.line1}</option>)}
              </select></div>
            <div><label className="block text-[11px] text-white/45" htmlFor="n-radius">Radius: {radius >= 1000 ? `${(radius / 1000).toFixed(1)} km` : `${radius} m`}</label>
              <input id="n-radius" type="range" min={100} max={3000} step={100} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full mt-2 accent-cyan-300" /></div>
          </div>
        )}
        {scope === 'wards' && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['1', '2', '3', '4', '5', '6', '7'].map((w) => (
              <button key={w} onClick={() => setWards((x) => (x.includes(w) ? x.filter((y) => y !== w) : [...x, w]))} className={`w-10 h-9 rounded-lg text-[12px] font-black ${wards.includes(w) ? 'bg-cyan-300 text-black' : 'bg-white/[0.05] text-white/60'}`}>{w}</button>
            ))}
          </div>
        )}
        {scope === 'city' && kind !== 'emergency' && <p className="mt-2 text-[11.5px] text-white/45">Citywide notices go to people who follow citywide updates, plus anyone following the law or topic you attach.</p>}

        <label className="block mt-5 text-[12px] font-bold text-white/70" htmlFor="n-law">Law it concerns <span className="font-normal text-white/40">(optional; people following that section get it too)</span></label>
        <select id="n-law" value={law} onChange={(e) => setLaw(e.target.value)} className={`${input} mt-1.5`}>
          <option value="">None</option>
          <option value="mcl-125.3201">MCL 125.3201 · Zoning: regulation of land development</option>
          <option value="mcl-554.602">MCL 554.602 · Security deposits</option>
          <option value="mcl-289.4101">MCL 289.4101 · Food establishment licenses</option>
        </select>

        {kind === 'hearing' && (
          <div className="mt-5 grid sm:grid-cols-3 gap-2">
            {[['Hearing in (days)', hearingDays, setHearingDays], ['Newspaper notice, days before', paperDays, setPaperDays], ['Mailed notice, days before', mailDays, setMailDays]].map(([l, v, set]) => (
              <div key={l as string}><label className="block text-[11px] text-white/45">{l as string}</label>
                <input type="number" min={0} value={v as number} onChange={(e) => (set as (n: number) => void)(Number(e.target.value))} className={`${input} mt-1`} /></div>
            ))}
          </div>
        )}

        <button onClick={() => onPublish({ ...draft, id: `n-${Date.now()}`, publishedAt: Date.now() })} disabled={!title.trim() || !body.trim() || (check != null && !check.ok)}
          className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-[12px] font-black uppercase tracking-wider text-black disabled:opacity-40" style={{ background: kind === 'emergency' ? RED : ORANGE }}>
          <Send size={14} /> Publish to {sum.people.toLocaleString()} {sum.people === 1 ? 'person' : 'people'}
        </button>
        {check && !check.ok && <p className="mt-2 text-[11.5px]" style={{ color: AMBER }}>Fix the hearing notice requirements on the right before publishing.</p>}
      </section>

      <aside className="space-y-4 min-w-0">
        <div className={`${card} p-5`}>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35 flex items-center gap-1.5"><Users size={12} /> Who gets it</p>
          <p className="mt-1 text-3xl font-black tabular-nums">{sum.people.toLocaleString()} <span className="text-sm font-bold text-white/45">people following</span></p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[[<Bell size={14} key="b" />, 'In-app', sum.inApp], [<Smartphone size={14} key="s" />, 'Push', sum.push], [<Mail size={14} key="m" />, 'Email', sum.email]].map(([icon, l, v]) => (
              <div key={l as string} className="rounded-xl bg-white/[0.04] py-2.5"><div className="flex justify-center text-white/50">{icon}</div><p className="text-lg font-black tabular-nums">{v as number}</p><p className="text-[10.5px] text-white/45">{l as string}</p></div>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-[12px] text-white/60">
            <p className="flex items-center gap-1.5"><Send size={12} /> {sum.instant} now · <Clock size={12} /> {sum.delayed} after quiet hours · {sum.digest} in tomorrow's digest</p>
            <p className="flex items-center gap-1.5"><Globe2 size={12} /> Languages: {sum.languages.map((l) => (l === 'es' ? 'Spanish' : l === 'ar' ? 'Arabic (falls back to English until translated)' : 'English')).join(', ') || '—'}</p>
          </div>
          <p className="mt-3 text-[11px] text-white/40">Only people who follow this place, ward, law or topic get it. Push and email go only to people who turned them on. Text messages come later, once SMS consent is in place.</p>
        </div>

        {check && (
          <div className={`${card} p-5`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/35 flex items-center gap-1.5"><Scale size={12} /> Required hearing notice</p>
            <ul className="mt-3 space-y-2">
              {check.items.map((i) => (
                <li key={i.label} className="flex gap-2 text-[12.5px]">
                  {i.ok ? <CheckCircle2 size={15} style={{ color: GREEN }} className="shrink-0 mt-0.5" /> : <AlertTriangle size={15} style={{ color: AMBER }} className="shrink-0 mt-0.5" />}
                  <span><b>{i.label}</b><span className="block text-white/50">{i.detail}</span></span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-white/45">Plajah notices add speed and reach. They don't replace the newspaper and mailed notice the law requires.</p>
            <button onClick={() => onOpenLaw?.(check.cite)} className="mt-2 text-[11.5px] font-mono font-bold" style={{ color: VIOLET }}>Read MCL 125.3103</button>
          </div>
        )}

        {sample && (
          <div className={`${card} p-5`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/35">What a follower sees</p>
            <div className="mt-3 rounded-2xl bg-black/40 border border-white/10 p-4">
              <div className="flex items-center gap-2 text-[11px] text-white/45"><MapPin size={12} /> Sample City · {sample.why}</div>
              <p className="mt-1.5 text-[14px] font-black">{sample.title}</p>
              <p className="mt-1 text-[12.5px] text-white/70">{sample.body}</p>
              <p className="mt-2 text-[10.5px] text-white/35">{sample.language === 'es' ? 'Shown in Spanish, the follower’s language' : 'English'} · {sample.mode === 'instant' ? 'now' : sample.mode === 'digest' ? 'in the morning digest' : 'after quiet hours'}</p>
            </div>
          </div>
        )}

        {data.notices.length > 0 && (
          <div className={`${card} p-5`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Published</p>
            <div className="mt-2 divide-y divide-white/[0.05]">
              {data.notices.slice(0, 8).map((n) => (
                <div key={n.id} className="py-2.5 text-[12.5px]">
                  <span className="font-bold">{n.title}</span>
                  <span className="block text-[11px] text-white/45">{KINDS.find((k) => k.id === n.kind)?.label} · {planDeliveries(n, data.subscribers).length} people · {new Date(n.publishedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
