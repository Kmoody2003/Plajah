// Evites — pure rules (RSVP, capacity, privacy, gifts, calendar) and the server flow against in-memory Firestore.
// Run: npx tsx --test tests/evite.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRsvp, applyCapacity, promoteWaitlist, summarize, toPublicView, buildIcs, googleCalendarUrl, rsvpsToCsv, cleanGifts,
  cleanCashApp, cleanZelle, cleanVenmo, safeHttpUrl, newShortId, isShortId, shareTargets, isClosed, cleanFields, cleanSettings,
} from '../services/evite/eviteCore';
import { DEFAULT_SETTINGS, DEFAULT_GIFTS, type EviteDoc, type EviteRsvp } from '../services/evite/eviteTypes';
import { registerEviteRoutes, recordEviteGift, runEviteReminders } from '../services/evite/eviteServer';
import { dueForReminder, reminderEmail } from '../services/evite/eviteCore';
import { grossUpCents } from '../services/giftFees';

const fields = cleanFields({ headline: 'Max is six', hostName: 'Dana', startsAt: Date.UTC(2026, 9, 24, 18), address: '12 Elm St', venueName: 'The Yard', honoree: 'Max' });
const inv = (over: Partial<EviteDoc> = {}): EviteDoc => ({
  id: 'abcd2345', ownerUid: 'host1', coHostUids: [], templateId: 'kids_boy/dino', fields, look: { motion: true, sound: false },
  settings: { ...DEFAULT_SETTINGS }, questions: [], bringList: [], gifts: { ...DEFAULT_GIFTS }, status: 'live', createdAt: 1, updatedAt: 1, sentCount: 0, viewCount: 0, ...over,
});
const rs = (o: Partial<EviteRsvp>): EviteRsvp => ({ id: 'r' + Math.random(), inviteId: 'abcd2345', name: 'G', status: 'yes', adults: 1, kids: 0, createdAt: 1, updatedAt: 1, ...o });

describe('RSVP rules', () => {
  test('needs a name and a valid answer, in plain words', () => {
    assert.equal((checkRsvp({ name: ' ', status: 'yes' }, inv()) as any).error, 'Add your name so the host knows who you are.');
    assert.match((checkRsvp({ name: 'Al', status: 'sure' }, inv()) as any).error, /Going, Maybe/);
  });
  test('"no" carries no party size; party is capped', () => {
    const no = checkRsvp({ name: 'Al', status: 'no', adults: 5 }, inv()) as any;
    assert.equal(no.value.adults, 0);
    assert.equal((checkRsvp({ name: 'Al', status: 'yes', adults: 9 }, inv()) as any).value.adults, 6);
    const s = { ...DEFAULT_SETTINGS, kidsField: true, maxPartyPerRsvp: 3 };
    assert.match((checkRsvp({ name: 'Al', status: 'yes', adults: 2, kids: 2 }, inv({ settings: s })) as any).error, /Up to 3/);
  });
  test('plus-ones off means exactly one adult', () => {
    const v = checkRsvp({ name: 'Al', status: 'yes', adults: 4 }, inv({ settings: { ...DEFAULT_SETTINGS, allowPlusOnes: false } })) as any;
    assert.equal(v.value.adults, 1);
  });
  test('required questions are enforced only for guests who are coming', () => {
    const q = inv({ questions: [{ id: 'q1', label: 'Allergies?', kind: 'text', required: true }] });
    assert.match((checkRsvp({ name: 'Al', status: 'yes' }, q) as any).error, /Allergies/);
    assert.equal(checkRsvp({ name: 'Al', status: 'no' }, q).ok, true);
  });
  test('bad contact rejected, blank allowed; unknown bring ids dropped', () => {
    assert.equal(checkRsvp({ name: 'Al', status: 'yes', contact: 'nope' }, inv()).ok, false);
    assert.equal(checkRsvp({ name: 'Al', status: 'yes', contact: '' }, inv()).ok, true);
    const b = inv({ bringList: [{ id: 'b1', label: 'Chips' }] });
    assert.deepEqual((checkRsvp({ name: 'Al', status: 'yes', bringing: ['b1', 'zzz'] }, b) as any).value.bringing, ['b1']);
  });
});

describe('capacity and waitlist', () => {
  const s = { ...DEFAULT_SETTINGS, capacity: 10 };
  test('fits, waitlists, or refuses', () => {
    assert.equal(applyCapacity('yes', 2, s, 8).status, 'yes');
    assert.equal(applyCapacity('yes', 3, s, 8).status, 'waitlist');
    assert.match(applyCapacity('yes', 3, { ...s, waitlist: false }, 8).error!, /full/);
    assert.equal(applyCapacity('maybe', 3, s, 10).status, 'maybe');
  });
  test('promotes oldest waitlisted party that now fits', () => {
    const all = [rs({ id: 'a', adults: 8 }), rs({ id: 'w1', status: 'waitlist', adults: 4, createdAt: 2 }), rs({ id: 'w2', status: 'waitlist', adults: 2, createdAt: 3 })];
    assert.deepEqual(promoteWaitlist(all, s), ['w2']);
    assert.deepEqual(promoteWaitlist(all.slice(1), s), ['w1', 'w2']);
  });
  test('summary counts headcount and spots left', () => {
    const c = summarize([rs({ adults: 2, kids: 1 }), rs({ status: 'maybe' }), rs({ status: 'no', adults: 0 })], s);
    assert.deepEqual([c.yes, c.maybe, c.no, c.headcount, c.spotsLeft], [1, 1, 1, 3, 7]);
  });
});

describe('privacy and visibility', () => {
  test('address is withheld until the guest says yes', () => {
    const i = inv({ settings: { ...DEFAULT_SETTINGS, revealAddressAfterYes: true }, clubId: 'club1' });
    const before = toPublicView(i, [], []);
    assert.equal(before.fields.address, undefined);
    assert.equal(before.fields.addressHidden, true);
    assert.equal(before.clubId, undefined);
    const after = toPublicView(i, [], [], { viewerStatus: 'yes' });
    assert.equal(after.fields.address, '12 Elm St');
    assert.equal(after.clubId, 'club1');
  });
  test('guest list can be hidden; only names of people going are shown', () => {
    const list = [rs({ name: 'Zed', contact: 'z@z.com' }), rs({ name: 'Maybe', status: 'maybe' })];
    const shown = toPublicView(inv(), list, []);
    assert.deepEqual(shown.guests, [{ name: 'Zed', status: 'yes' }]);
    assert.equal(toPublicView(inv({ settings: { ...DEFAULT_SETTINGS, showGuestList: false } }), list, []).guests, undefined);
    assert.ok(!JSON.stringify(shown).includes('z@z.com'));
  });
  test('closes at the deadline or when cancelled', () => {
    assert.equal(isClosed(inv({ settings: { ...DEFAULT_SETTINGS, rsvpDeadline: 100 } }), 200), true);
    assert.equal(isClosed(inv({ status: 'cancelled' })), true);
    assert.equal(isClosed(inv()), false);
  });
});

describe('gifts', () => {
  test('handles are validated; URLs and junk never survive', () => {
    assert.equal(cleanCashApp('cash.app/$leo_m'), '$leo_m');
    assert.equal(cleanCashApp('https://cash.app/$leo'), '$leo');
    assert.equal(cleanCashApp('leo'), '$leo');
    assert.equal(cleanCashApp('https://evil.example/$leo'), undefined);
    assert.equal(cleanZelle('dana@example.com'), 'dana@example.com');
    assert.equal(cleanZelle('(404) 555-0100'), '(404) 555-0100');
    assert.equal(cleanZelle('javascript:alert(1)'), undefined);
    assert.equal(cleanVenmo('https://venmo.com/u/dana-m'), 'dana-m');
    assert.equal(safeHttpUrl('javascript:alert(1)'), '');
    assert.equal(safeHttpUrl('https://example.com/reg'), 'https://example.com/reg');
  });
  test('presets are bounded and default when empty', () => {
    assert.deepEqual(cleanGifts({ presetsCents: [5, 99999999] }).presetsCents, DEFAULT_GIFTS.presetsCents);
    assert.deepEqual(cleanGifts({ presetsCents: [500, 2000] }).presetsCents, [500, 2000]);
  });
  test('guest-covers-fee math leaves the host the whole gift', () => {
    const m = grossUpCents(5000);
    const stripeTakes = Math.round(m.grossCents * 0.029 + 30);
    assert.ok(m.grossCents - stripeTakes >= 5000 - 1);
    assert.equal(m.grossCents - m.feeCents, 5000);
  });
});

describe('calendar, share, csv', () => {
  test('ics has the essentials and folds long lines', () => {
    const ics = buildIcs(cleanFields({ ...fields, message: 'x'.repeat(200) }), 'https://plajah.com/i/abcd2345', 'abcd2345');
    assert.match(ics, /BEGIN:VEVENT/); assert.match(ics, /DTSTART:20261024T180000Z/); assert.match(ics, /SUMMARY:Max is six/);
    assert.ok(ics.split('\r\n').every(l => l.length <= 75));
  });
  test('google link and share targets encode the url', () => {
    assert.match(googleCalendarUrl(fields, 'https://plajah.com/i/x'), /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
    assert.match(shareTargets('https://plajah.com/i/x?y=1&z=2', fields).whatsapp, /^https:\/\/wa\.me\/\?text=/);
  });
  test('csv neutralises spreadsheet formulas and quotes commas', () => {
    const csv = rsvpsToCsv([rs({ name: '=HYPERLINK("x")', note: 'a,b' })], [], []);
    assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`)); assert.ok(csv.includes('"a,b"'));
  });
  test('ids look right', () => {
    const id = newShortId(8, () => 0.5);
    assert.equal(id.length, 8); assert.equal(isShortId(id), true); assert.equal(isShortId('../x'), false);
  });
  test('settings and fields clamp junk', () => {
    assert.equal(cleanSettings({ capacity: -4, maxPartyPerRsvp: 999 }).capacity, undefined);
    assert.equal(cleanSettings({ maxPartyPerRsvp: 999 }).maxPartyPerRsvp, 20);
    assert.equal(cleanFields({ headline: 'x'.repeat(500) }).headline.length, 90);
  });
});

// ── Server flow ─────────────────────────────────────────────────────────────

function harness() {
  const db = new Map<string, Record<string, any>>();
  const routes: Record<string, any> = {};
  const stripeCalls: any[] = [];
  const reg = (m: string) => (path: string, ...h: any[]) => { routes[`${m} ${path}`] = h[h.length - 1]; };
  const app = { get: reg('GET'), post: reg('POST') };
  const express = { json: () => (_q: any, _s: any, n: any) => n() };
  const deps = {
    app, express, rateLimit: () => (_q: any, _s: any, n: any) => n(), authMiddleware: (_q: any, _s: any, n: any) => n(),
    firestoreRead: async (c: string, id: string) => db.get(`${c}/${id}`) || null,
    firestoreWrite: async (c: string, id: string, data: any) => { db.set(`${c}/${id}`, { ...(db.get(`${c}/${id}`) || {}), ...data }); },
    firestoreCreateOnce: async (c: string, id: string, data: any) => { if (db.has(`${c}/${id}`)) return 'exists' as const; db.set(`${c}/${id}`, data); return 'created' as const; },
    firestoreDeleteDoc: async (c: string, id: string) => { db.delete(`${c}/${id}`); },
    fsQueryDocs: async (c: string, f: any[]) => [...db.entries()].filter(([k, v]) => k.startsWith(c + '/') && f.every(x => v[x.field] === x.value)).map(([k, v]) => ({ id: k.split('/')[1], data: v })),
    getStripe: () => ({ checkout: { sessions: { create: async (a: any) => { stripeCalls.push(a); return { url: 'https://checkout.stripe.test/s' }; } } } }),
    trustedRequestOrigin: () => 'https://plajah.com',
  };
  registerEviteRoutes(deps as any);
  const call = async (key: string, req: any) => {
    let status = 200, body: any, headers: any = {};
    const res: any = { status(c: number) { status = c; return this; }, json(b: any) { body = b; return this; }, send(b: any) { body = b; return this; }, set(h: any) { Object.assign(headers, h); return this; }, type() { return this; } };
    await routes[key]({ params: {}, query: {}, body: {}, headers: {}, ...req }, res, () => {});
    return { status, body, headers };
  };
  return { db, call, stripeCalls, deps };
}

describe('server flow', () => {
  const base = { templateId: 'kids_boy/dino', fields: { headline: 'Max is six', hostName: 'Dana', startsAt: Date.UTC(2026, 9, 24, 18), address: '12 Elm St', venueName: 'The Yard' }, status: 'live' };

  test('host saves, guest RSVPs without an account, edits with the token, address privacy holds', async () => {
    const h = harness();
    const saved = await h.call('POST /api/evite/save', { uid: 'host1', body: { ...base, settings: { revealAddressAfterYes: true, capacity: 3 } } });
    assert.equal(saved.status, 200);
    const id = saved.body.invite.id;
    const pub = await h.call('GET /api/evite/:id/public', { params: { id } });
    assert.equal(pub.body.invite.fields.addressHidden, true);

    const yes = await h.call('POST /api/evite/:id/rsvp', { params: { id }, body: { name: 'Pat', status: 'yes', adults: 2 } });
    assert.equal(yes.status, 200); assert.equal(yes.body.status, 'yes');
    assert.equal(yes.body.invite.fields.address, '12 Elm St');
    const token = yes.body.token;

    const full = await h.call('POST /api/evite/:id/rsvp', { params: { id }, body: { name: 'Lee', status: 'yes', adults: 2 } });
    assert.equal(full.body.status, 'waitlist');

    const again = await h.call('POST /api/evite/:id/rsvp', { params: { id }, body: { token, name: 'Pat', status: 'no' } });
    assert.equal(again.body.token, token);
    const after = await h.call('GET /api/evite/:id/public', { params: { id } });
    assert.equal(after.body.invite.counts.no, 1);
    assert.equal(after.body.invite.counts.yes, 1, 'waitlisted guest promoted when Pat declined');

    assert.equal([...h.db.keys()].filter(k => k.startsWith('evite_rsvps/')).length, 2);
    assert.ok(![...h.db.values()].some(v => JSON.stringify(v).includes(token)), 'raw token is never stored');
  });

  test('a design must be a real plate', async () => {
    const h = harness();
    assert.equal((await h.call('POST /api/evite/save', { uid: 'host1', body: { ...base, templateId: 'nope/zzz' } })).status, 400);
    assert.equal((await h.call('POST /api/evite/save', { uid: 'host1', body: { ...base, templateId: 'wedding/olive' } })).status, 200);
  });

  test('only the host can read replies or edit; drafts are invisible to guests', async () => {
    const h = harness();
    const { body } = await h.call('POST /api/evite/save', { uid: 'host1', body: { ...base, status: 'draft' } });
    const id = body.invite.id;
    assert.equal((await h.call('GET /api/evite/:id/public', { params: { id } })).status, 404);
    assert.equal((await h.call('POST /api/evite/guests', { uid: 'other', body: { id } })).status, 403);
    assert.equal((await h.call('POST /api/evite/save', { uid: 'other', body: { ...base, id } })).status, 403);
    assert.equal((await h.call('POST /api/evite/guests', { uid: 'host1', body: { id } })).status, 200);
  });

  test('closed invites refuse new replies but let an existing guest back out', async () => {
    const h = harness();
    const { body } = await h.call('POST /api/evite/save', { uid: 'host1', body: base });
    const id = body.invite.id;
    const yes = await h.call('POST /api/evite/:id/rsvp', { params: { id }, body: { name: 'Pat', status: 'yes' } });
    await h.call('POST /api/evite/save', { uid: 'host1', body: { id, status: 'closed' } });
    assert.equal((await h.call('POST /api/evite/:id/rsvp', { params: { id }, body: { name: 'New', status: 'yes' } })).status, 409);
    assert.equal((await h.call('POST /api/evite/:id/rsvp', { params: { id }, body: { token: yes.body.token, name: 'Pat', status: 'no' } })).status, 200);
  });

  test('wall: links rejected, host can remove', async () => {
    const h = harness();
    const id = (await h.call('POST /api/evite/save', { uid: 'host1', body: base })).body.invite.id;
    assert.equal((await h.call('POST /api/evite/:id/wall', { params: { id }, body: { name: 'A', text: 'see http://spam.example' } })).status, 400);
    const ok = await h.call('POST /api/evite/:id/wall', { params: { id }, body: { name: 'A', text: 'Cannot wait!' } });
    assert.equal(ok.status, 200);
    assert.equal((await h.call('POST /api/evite/remove-note', { uid: 'host1', body: { id, noteId: ok.body.note.id } })).status, 200);
  });

  test('gift checkout: destination charge, guest covers fee, no platform cut beyond the fee', async () => {
    const h = harness();
    const id = (await h.call('POST /api/evite/save', { uid: 'host1', body: { ...base, gifts: { enabled: true, stripe: true, cashApp: 'cash.app/$dana' } } })).body.invite.id;
    assert.equal((await h.call('POST /api/evite/:id/gift', { params: { id }, body: { amountCents: 5000 } })).status, 409, 'host has no Stripe account yet');
    h.db.set('users/host1', { stripeConnectAccountId: 'acct_123' });
    const g = await h.call('POST /api/evite/:id/gift', { params: { id }, body: { amountCents: 5000, name: 'Aunt Jo' } });
    assert.equal(g.status, 200); assert.equal(g.body.giftCents, 5000);
    const s = h.stripeCalls[0];
    assert.equal(s.payment_intent_data.transfer_data.destination, 'acct_123');
    assert.equal(s.payment_intent_data.application_fee_amount, g.body.feeCents);
    assert.equal(s.line_items[0].price_data.unit_amount - s.payment_intent_data.application_fee_amount, 5000);
    const opt = await h.call('POST /api/evite/:id/gift', { params: { id }, body: { amountCents: 5000, coverFees: false } });
    assert.equal(opt.body.feeCents, 0); assert.equal(h.stripeCalls[1].payment_intent_data.application_fee_amount, undefined);
    assert.equal((await h.call('POST /api/evite/:id/gift', { params: { id }, body: { amountCents: 50 } })).status, 400);
    const view = (await h.call('GET /api/evite/:id/public', { params: { id } })).body.invite;
    assert.equal(view.gifts.stripe, true); assert.equal(view.gifts.cashApp, '$dana');
  });

  test('gift webhook records once per session', async () => {
    const h = harness();
    const session = { id: 'cs_1', payment_intent: 'pi_1', metadata: { type: 'evite_gift', inviteId: 'abcd2345', hostUid: 'host1', giftCents: '5000', feeCoveredCents: '175', fromName: 'Jo' } };
    assert.equal(await recordEviteGift(h.deps as any, session), 'created');
    assert.equal(await recordEviteGift(h.deps as any, session), 'exists');
    assert.equal(await recordEviteGift(h.deps as any, { id: 'x', metadata: { type: 'other' } }), 'ignored');
  });

  test('qr and ics endpoints', async () => {
    const h = harness();
    const id = (await h.call('POST /api/evite/save', { uid: 'host1', body: base })).body.invite.id;
    const qr = await h.call('GET /api/evite/:id/qr.svg', { params: { id }, query: {} });
    assert.match(qr.body, /^<svg/); assert.equal(qr.headers['Content-Type'], 'image/svg+xml');
    const ics = await h.call('GET /api/evite/:id/ics', { params: { id } });
    assert.match(ics.body, /BEGIN:VCALENDAR/); assert.match(ics.body, /12 Elm St/);
  });
});

describe('reminders', () => {
  test('due only for live invites with reminders on, within ~a day, once', () => {
    const now = Date.UTC(2026, 9, 23, 18);
    const i = inv({ fields: { ...fields, startsAt: now + 20 * 36e5 } });
    assert.equal(dueForReminder(i, now), true);
    assert.equal(dueForReminder({ ...i, remindedAt: now }, now), false);
    assert.equal(dueForReminder({ ...i, settings: { ...i.settings, reminders: false } }, now), false);
    assert.equal(dueForReminder({ ...i, fields: { ...i.fields, startsAt: now + 3 * 864e5 } }, now), false);
    assert.equal(dueForReminder({ ...i, status: 'draft' }, now), false);
  });
  test('email is plain, personal and links back to the invite', () => {
    const m = reminderEmail(inv(), { name: 'Pat Lee', status: 'maybe' }, 'https://plajah.com');
    assert.match(m.subject, /Max is six/); assert.match(m.text, /^Hi Pat,/); assert.match(m.text, /plajah\.com\/i\/abcd2345/); assert.match(m.text, /You said maybe/);
  });
  test('cron pass emails going/maybe guests with an email, then marks the invite', async () => {
    const h = harness(); const sent: string[] = [];
    const base = { templateId: 'kids_boy/dino', fields: { headline: 'Max is six', hostName: 'Dana', startsAt: 0, venueName: 'The Yard' }, status: 'live' };
    const id =(await h.call('POST /api/evite/save', { uid: 'host1', body: { ...base, fields: { ...base.fields, startsAt: Date.now() + 10 * 36e5 } } })).body.invite.id;
    await h.call('POST /api/evite/:id/rsvp', { params: { id }, body: { name: 'A', status: 'yes', contact: 'a@x.com' } });
    await h.call('POST /api/evite/:id/rsvp', { params: { id }, body: { name: 'B', status: 'no', contact: 'b@x.com' } });
    await h.call('POST /api/evite/:id/rsvp', { params: { id }, body: { name: 'C', status: 'maybe', contact: '+1 404 555 0100' } });
    const deps = { ...h.deps, sendEmail: async (to: string) => { sent.push(to); return true; } } as any;
    const r1 = await runEviteReminders(deps, 'https://plajah.com');
    assert.deepEqual(sent, ['a@x.com']); assert.equal(r1.invites, 1);
    const r2 = await runEviteReminders(deps, 'https://plajah.com');
    assert.equal(r2.invites, 0, 'only once');
  });
});

describe('link previews', () => {
  test('only the owner’s own preview file for this invite is accepted', async () => {
    const { isOwnOgUrl } = await import('../services/evite/eviteServer');
    const ok = 'https://firebasestorage.googleapis.com/v0/b/x.firebasestorage.app/o/users%2Fhost1%2Fevites%2Fabcd2345%2Fog.jpg?alt=media&token=1b2c-3d';
    assert.equal(isOwnOgUrl(ok, 'host1', 'abcd2345'), true);
    assert.equal(isOwnOgUrl(ok, 'host2', 'abcd2345'), false, 'someone else’s folder');
    assert.equal(isOwnOgUrl(ok, 'host1', 'zzzz9999'), false, 'another invite');
    assert.equal(isOwnOgUrl('https://evil.example/og.jpg', 'host1', 'abcd2345'), false);
    assert.equal(isOwnOgUrl(ok.replace('og.jpg', 'og.jpg%2F..%2Fx'), 'host1', 'abcd2345'), false);
  });
  test('/i/:id tags: the invite’s own card first, then the design’s 1200×630 preview', async () => {
    const h = harness(); (h.deps as any).readIndexHtml = async () => '<html><head><title>x</title></head><body></body></html>';
    const routes: Record<string, any> = {};
    const app = { get: (p: string, ...f: any[]) => { routes[`GET ${p}`] = f[f.length - 1]; }, post: () => {} };
    registerEviteRoutes({ ...(h.deps as any), app });
    const id = (await h.call('POST /api/evite/save', { uid: 'host1', body: { templateId: 'wedding/floral-arch', fields: { headline: 'Mira & Ellis', startsAt: Date.UTC(2027, 0, 22) }, status: 'live' } })).body.invite.id;
    const page = async () => { let out = ''; await routes['GET /i/:id']({ params: { id }, headers: {} }, { set() { return this; }, type() { return this; }, status() { return this; }, send(b: string) { out = b; return this; } }, () => {}); return out; };
    let html = await page();
    assert.match(html, /og:image" content="[^"]*\/og\/wedding\/floral-arch\.jpg"/); assert.match(html, /og:image:width" content="1200"/); assert.match(html, /summary_large_image/);
    const own = `https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fhost1%2Fevites%2F${id}%2Fog.jpg?alt=media&token=ab-12`;
    await h.call('POST /api/evite/save', { uid: 'host1', body: { id, ogImage: own, ogSig: 's1' } });
    html = await page();
    assert.ok(html.includes(`og:image" content="${own.replace(/&/g, '&amp;')}"`), 'own preview wins');
    await h.call('POST /api/evite/save', { uid: 'host1', body: { id, templateId: 'wedding/olive' } });
    assert.match(await page(), /\/og\/wedding\/olive\.jpg/, 'a new design drops the stale preview');
  });
});
