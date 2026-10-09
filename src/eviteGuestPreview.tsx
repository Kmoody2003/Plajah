// Dev-only: the /i/:id guest page against an in-memory demo API that runs the real server rules (eviteCore).
//   /evite-guest.html?demo=kids|wedding|party&plate=<collection>/<subject>
import React from 'react';
import { createRoot } from 'react-dom/client';
import EviteGuestPage from '../components/evite/EviteGuestPage';
import type { EviteGuestApi } from '../services/evite/eviteClient';
import { checkRsvp, applyCapacity, confirmedHeadcount, toPublicView, buildIcs, cleanFields, cleanGifts } from '../services/evite/eviteCore';
import { DEFAULT_SETTINGS, type EviteDoc, type EviteRsvp, type EviteWallNote } from '../services/evite/eviteTypes';

const q = new URLSearchParams(location.search);
const demo = q.get('demo') || 'kids';
const day = Date.now() + 16 * 864e5;
const base: Record<string, Partial<EviteDoc> & { fields: any }> = {
  kids: { templateId: 'kids_boy/dino', fields: { headline: 'Max is turning 6!', subline: 'Roar into a prehistoric party', honoree: 'Max', hostName: 'Dana & Chris', startsAt: day, endsAt: day + 3 * 36e5, timezone: 'America/New_York', venueName: 'Our backyard', address: '12 Elm Street, Atlanta, GA', message: 'Dino dig, cake at 3, water balloons after. Bring a towel!' },
    settings: { ...DEFAULT_SETTINGS, kidsField: true, revealAddressAfterYes: true, capacity: 30, parentStep: true },
    questions: [{ id: 'q1', label: 'Any food allergies?', kind: 'text' }], bringList: [{ id: 'b1', label: 'Juice boxes' }, { id: 'b2', label: 'Fruit tray' }, { id: 'b3', label: 'Ice', claimedBy: 'x', claimedName: 'Ana' }],
    gifts: cleanGifts({ enabled: true, stripe: true, title: "Max's birthday fund", goalCents: 30000, cashApp: 'cash.app/$danamoody', zelle: 'dana@example.com', offerOnDecline: true }) },
  wedding: { templateId: 'wedding/floral-arch', fields: { headline: 'Mira & Ellis', subline: 'invite you to celebrate their marriage', honoree: 'Mira & Ellis', hostName: 'The Okafor and Reyes families', startsAt: day + 90 * 864e5, timezone: 'America/Los_Angeles', venueName: 'Villa Serbelloni', address: 'Via Roma 1, Bellagio', message: 'Dinner and dancing to follow.' },
    settings: { ...DEFAULT_SETTINGS, maxPartyPerRsvp: 2 }, questions: [{ id: 'm', label: 'Dinner choice', kind: 'choice', options: ['Fish', 'Chicken', 'Vegetarian'], required: true }], bringList: [],
    gifts: cleanGifts({ enabled: true, stripe: true, title: 'Honeymoon fund', venmo: 'mira-ellis', offerOnDecline: true }) },
  party: { templateId: 'adult/disco', fields: { headline: 'Night Fever', subline: 'Dance until dawn', honoree: 'Jordan', hostName: 'Jordan', startsAt: day, timezone: 'America/Chicago', venueName: 'The Rooftop', address: '400 Lake St, Chicago', message: '' },
    settings: { ...DEFAULT_SETTINGS }, questions: [], bringList: [], gifts: cleanGifts({ enabled: false }) },
};
const b = base[demo] || base.kids;
const inv: EviteDoc = { id: 'demo1234', ownerUid: 'host', coHostUids: [], look: { motion: true, sound: false }, status: 'live', createdAt: 1, updatedAt: 1, sentCount: 0, viewCount: 0, clubId: 'club_demo', ...b, templateId: q.get('plate') || b.templateId!, fields: cleanFields(b.fields) } as EviteDoc;
const rsvps: EviteRsvp[] = [
  { id: 'r1', inviteId: inv.id, name: 'Ana Lopez', status: 'yes', adults: 2, kids: 2, createdAt: 1, updatedAt: 1 },
  { id: 'r2', inviteId: inv.id, name: 'Sam Lee', status: 'yes', adults: 1, kids: 1, createdAt: 2, updatedAt: 2 },
  { id: 'r3', inviteId: inv.id, name: 'Priya N', status: 'maybe', adults: 1, kids: 0, createdAt: 3, updatedAt: 3 },
];
const wall: EviteWallNote[] = [{ id: 'w1', inviteId: inv.id, name: 'Grandma Jo', text: 'Wouldn’t miss it!', createdAt: 1 }];
let myId: string | null = null;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const view = () => { const me = rsvps.find(r => r.id === myId); return { invite: toPublicView(inv, rsvps, wall, { viewerStatus: me?.status, raisedCents: 18500, stripeReady: true }), me: me ? { name: me.name, status: me.status, adults: me.adults, kids: me.kids, note: me.note, answers: me.answers, bringing: me.bringing } : null }; };
const api: EviteGuestApi = {
  async load() { await wait(300); return view(); },
  async rsvp(_id, input) {
    await wait(400);
    const c = checkRsvp(input as any, inv); if (c.ok === false) throw new Error(c.error);
    const v = c.value; const cap = applyCapacity(v.status, v.adults + v.kids, inv.settings, confirmedHeadcount(rsvps, myId || undefined)); if (cap.error) throw new Error(cap.error);
    const now = Date.now(); const ex = rsvps.find(r => r.id === myId);
    const r: EviteRsvp = { ...v, status: cap.status, id: ex?.id || 'me', inviteId: inv.id, createdAt: ex?.createdAt || now, updatedAt: now };
    if (ex) Object.assign(ex, r); else rsvps.push(r); myId = r.id;
    inv.bringList = inv.bringList.map(x => (r.bringing || []).includes(x.id) ? { ...x, claimedBy: r.id, claimedName: r.name } : x.claimedBy === r.id ? { ...x, claimedBy: undefined, claimedName: undefined } : x);
    return { status: r.status, waitlisted: r.status === 'waitlist', ...view() };
  },
  async note(_id, name, text) { await wait(200); if (/https?:\/\//.test(text)) throw new Error('Links aren’t allowed in notes.'); wall.unshift({ id: 'w' + Date.now(), inviteId: inv.id, name, text, createdAt: Date.now() }); },
  async gift() { await wait(300); return { url: '?demo=' + demo + '&gift=thanks' }; },
  icsUrl: () => 'data:text/calendar;charset=utf-8,' + encodeURIComponent(buildIcs(inv.fields, location.href, inv.id)),
  qrUrl: () => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/><path d="M1 1h3v3H1zM6 1h3v3H6zM1 6h3v3H1zM6 6h1v1H6zM8 8h1v1H8z"/></svg>'),
};
createRoot(document.getElementById('root')!).render(<EviteGuestPage id={inv.id} api={api} />);
