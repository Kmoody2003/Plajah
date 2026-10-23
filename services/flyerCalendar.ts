// flyerCalendar — what happens after a school flyer is scanned and the person approves the result.
//
//   · My calendar   — each approved event/deadline is written to users/{uid}/calendar_events with
//                     reminders (day before + an hour before; deadlines two days and one day out).
//   · Family        — one `family_calendar_shares` doc lists the events for the person's linked family
//                     (their guardians, their children, and their children's other guardians). The
//                     calendar's Plajah layer reads shares addressed to you, so the events simply
//                     appear on everyone's calendar — no per-recipient writes into other people's
//                     calendars — and each recipient also gets a notification.
//   · Notes         — the flyer becomes a Notes page (a Tela document) with the key facts and a
//                     to-do list, filed under Unfiled so it shows up everywhere Notes does.

import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import { createNotification, fetchUserProfile, listChildProfiles } from './backendService';
import { saveEvent, newEventId, invalidatePlatformFeed } from './postman/calendarService';
import type { FlyerEvent, FlyerParse } from './worksheetScanCore';

export interface FamilyMember { uid: string; name: string; relation: 'guardian' | 'child' | 'co-guardian' }

/** Everyone in the person's linked family, excluding themselves. Never throws. */
export async function resolveFamily(uid: string): Promise<FamilyMember[]> {
  const out = new Map<string, FamilyMember>();
  try {
    const me: any = await fetchUserProfile(uid);
    const guardianIds: string[] = [me?.guardianUid, ...(me?.coGuardianUids || [])].filter(Boolean);
    if (guardianIds.length) {
      const profiles = await Promise.all(guardianIds.map(id => fetchUserProfile(id).catch(() => null)));
      guardianIds.forEach((id, i) => out.set(id, { uid: id, name: (profiles[i] as any)?.displayName || 'Parent', relation: 'guardian' }));
    }
    const kids = await listChildProfiles(uid).catch(() => []);
    for (const k of kids as any[]) {
      if (!k?.uid) continue;
      out.set(k.uid, { uid: k.uid, name: k.displayName || k.username || 'Child', relation: 'child' });
      for (const g of [k.guardianUid, ...(k.coGuardianUids || [])].filter(Boolean)) {
        if (g !== uid && !out.has(g)) out.set(g, { uid: g, name: 'Co-parent', relation: 'co-guardian' });
      }
    }
  } catch (error) { console.warn('[flyerCalendar] family lookup failed', error); }
  out.delete(uid);
  return [...out.values()].slice(0, 12);
}

export async function addFlyerEventsToMyCalendar(flyerTitle: string, events: FlyerEvent[]): Promise<number> {
  let saved = 0;
  for (const e of events) {
    await saveEvent({
      id: newEventId(), title: e.title, start: e.start, end: e.end, allDay: e.allDay,
      location: e.location, notes: `From the flyer “${flyerTitle}”: ${e.sourceLine}`,
      layer: 'mine', source: 'import', reminders: e.reminders, kindLabel: e.kind === 'deadline' ? 'Deadline · school flyer' : 'School flyer',
    });
    saved++;
  }
  invalidatePlatformFeed();
  return saved;
}

export async function shareFlyerWithFamily(input: { ownerUid: string; ownerName: string; flyer: FlyerParse; events: FlyerEvent[]; recipients: FamilyMember[] }): Promise<{ shareId: string | null; notified: number }> {
  const { ownerUid, ownerName, flyer, events, recipients } = input;
  if (!recipients.length || !events.length) return { shareId: null, notified: 0 };
  const ref = await addDoc(collection(db, 'family_calendar_shares'), {
    ownerUid, ownerName, recipientUids: recipients.map(r => r.uid),
    title: flyer.title.slice(0, 200),
    events: events.slice(0, 20).map(e => ({ title: e.title.slice(0, 200), start: e.start, end: e.end, allDay: e.allDay, kind: e.kind, location: e.location || null, reminders: e.reminders, sourceLine: e.sourceLine.slice(0, 300) })),
    notes: flyer.notes.slice(0, 12).map(n => n.slice(0, 300)),
    createdAt: Date.now(),
  });
  const first = events[0];
  const when = first ? new Date(first.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const sent = await Promise.all(recipients.map(r => createNotification({
    userId: r.uid, senderId: ownerUid, senderName: ownerName, senderPhoto: '', type: 'CONTENT',
    title: `${ownerName} added “${flyer.title}” to your calendar`,
    message: `${events.length} date${events.length === 1 ? '' : 's'}${when ? ` · first: ${when}` : ''}. Open your calendar to keep or dismiss.`,
    targetId: ref.id,
  }).catch(() => null)));
  invalidatePlatformFeed();
  return { shareId: ref.id, notified: sent.filter(Boolean).length };
}

/** File the flyer as a Notes page: key facts, dates, and a to-do list of what to bring/return. */
export async function saveFlyerNote(uid: string | undefined, flyer: FlyerParse, events: FlyerEvent[]): Promise<string | null> {
  try {
    const [{ createPage }, { UNFILED_NOTEBOOK, UNFILED_SECTION }] = await Promise.all([import('./notesService'), import('./notesStructure')]);
    const fmt = (e: FlyerEvent) => e.allDay
      ? new Date(e.start).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
      : `${new Date(e.start).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    const lines = [
      ...events.map(e => `${e.kind === 'deadline' ? '⏰' : '📅'} ${e.title} — ${fmt(e)}${e.location ? ` · ${e.location}` : ''}`),
      ...flyer.notes.map(n => `☐ ${n}`),
      ...flyer.contacts.map(c => `☎ ${c}`),
      ...flyer.links.map(l => `🔗 ${l}`),
    ];
    const { page } = await createPage(uid, {
      notebookId: UNFILED_NOTEBOOK, sectionId: UNFILED_SECTION, title: flyer.title, template: 'lined',
      heading: flyer.title, lines: lines.length ? lines : flyer.text.split('\n').slice(0, 40), source: { label: 'Scanned flyer' }, tags: ['flyer', 'school'],
    });
    return page.id;
  } catch (error) {
    console.warn('[flyerCalendar] note save failed', error);
    return null;
  }
}
