// Dev-only stand-in for services/evite/eviteHostClient.ts (aliased in evite-stage.vite.config.mjs): in-memory host API
// that applies the same cleaning/counting rules as the server (eviteCore), so the studio behaves for real.
import { cleanFields, cleanSettings, cleanGifts, cleanQuestions, cleanBringList, cleanLook, summarize, newShortId } from '../../services/evite/eviteCore';
import { DEFAULT_GIFTS, DEFAULT_SETTINGS, type EviteDoc, type EviteRsvp, type EviteWallNote } from '../../services/evite/eviteTypes';

const store = new Map<string, EviteDoc>();
const rsvps: EviteRsvp[] = [];
const wall: EviteWallNote[] = [];
function seed(): void {
  if (store.size) return;
  const day = Date.now() + 9 * 864e5;
  const inv: EviteDoc = {
    id: 'demo1234', ownerUid: 'me', coHostUids: [], templateId: 'kids_kaiju/cake-eruption', status: 'live', createdAt: 1, updatedAt: 1, sentCount: 0, viewCount: 0,
    fields: cleanFields({ headline: 'Zara is turning 7!', honoree: 'Zara', hostName: 'Kenne', startsAt: day, timezone: 'America/New_York', venueName: 'Kaiju Arcade' }),
    settings: { ...DEFAULT_SETTINGS, kidsField: true, capacity: 24 }, questions: [{ id: 'q1', label: 'Any food allergies?', kind: 'text' }], bringList: [],
    gifts: { ...DEFAULT_GIFTS }, look: { motion: true, sound: false }, clubId: 'club1', photoPoolId: 'pool1', planDone: ['date'],
  };
  store.set(inv.id, inv);
  rsvps.push(
    { id: 'demo1234_a', inviteId: inv.id, name: 'Ana Lopez', status: 'yes', adults: 2, kids: 2, answers: { q1: 'Peanuts' }, createdAt: 1, updatedAt: 1 },
    { id: 'demo1234_b', inviteId: inv.id, name: 'Sam Lee', status: 'maybe', adults: 1, kids: 1, createdAt: 2, updatedAt: 2 },
    { id: 'demo1234_c', inviteId: inv.id, name: 'Priya N', status: 'no', adults: 0, kids: 0, note: 'Have fun!', createdAt: 3, updatedAt: 3 },
  );
  wall.push({ id: 'demo1234_w', inviteId: inv.id, name: 'Grandma Jo', text: 'So excited!', createdAt: 1 });
}
const wait = (ms = 250) => new Promise(r => setTimeout(r, ms));

export async function saveInvite(b: any): Promise<EviteDoc> {
  seed(); await wait();
  const prev = b.id ? store.get(b.id) : undefined;
  const inv: EviteDoc = {
    ...(prev || ({ id: newShortId(8), ownerUid: 'me', coHostUids: [], createdAt: Date.now(), sentCount: 0, viewCount: 0 } as any)),
    templateId: b.templateId ?? prev?.templateId, fields: cleanFields(b.fields || {}, prev?.fields), settings: cleanSettings(b.settings, prev?.settings || DEFAULT_SETTINGS),
    questions: b.questions === undefined ? prev?.questions || [] : cleanQuestions(b.questions), bringList: b.bringList === undefined ? prev?.bringList || [] : cleanBringList(b.bringList, prev?.bringList),
    gifts: cleanGifts(b.gifts, prev?.gifts || DEFAULT_GIFTS), look: cleanLook(b.look, prev?.look), status: b.status || prev?.status || 'draft', updatedAt: Date.now(),
    clubId: b.clubId ?? prev?.clubId, clubInvite: b.clubInvite ?? prev?.clubInvite, photoPoolId: b.photoPoolId ?? prev?.photoPoolId, eventId: b.eventId ?? prev?.eventId,
    host: b.host ?? prev?.host, planDone: b.planDone ?? prev?.planDone, registryUrl: b.registryUrl ?? prev?.registryUrl,
  };
  if (!inv.fields.headline) throw new Error('Give the invitation a headline.');
  store.set(inv.id, inv); return inv;
}
export async function myInvites() { seed(); await wait(); return [...store.values()].map(invite => ({ invite, counts: summarize(rsvps.filter(r => r.inviteId === invite.id), invite.settings) })); }
export async function inviteGuests(id: string, csv = false) {
  seed(); await wait(); const inv = store.get(id)!; const rs = rsvps.filter(r => r.inviteId === id);
  return { rsvps: rs, wall: wall.filter(w => w.inviteId === id), counts: summarize(rs, inv.settings), raisedCents: 4200, csv: csv ? 'Name,Response\nAna Lopez,yes' : undefined };
}
export async function removeRsvp(_id: string, rsvpId: string) { const i = rsvps.findIndex(r => r.id === rsvpId); if (i >= 0) rsvps.splice(i, 1); }
export async function removeNote(_id: string, noteId: string) { const i = wall.findIndex(r => r.id === noteId); if (i >= 0) wall.splice(i, 1); }
export async function provisionExtras(inv: EviteDoc, opts: { room: boolean; pool: boolean }) {
  await wait(300);
  return { invite: await saveInvite({ id: inv.id, clubId: opts.room ? inv.clubId || 'club_' + inv.id : inv.clubId, clubInvite: opts.room ? 'ABC123' : inv.clubInvite, photoPoolId: opts.pool ? inv.photoPoolId || 'pool_' + inv.id : inv.photoPoolId }), problems: [] as string[] };
}
export function downloadCsv(name: string, csv: string) { console.log('[mock] download', name, csv.length); }
