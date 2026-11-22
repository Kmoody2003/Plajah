// components/phone/usePhoneBook.ts — shared state for the PhoneHub and Chat's Texts tab:
// telecom status, merged contacts (phone book + Plajah people from DMs), SMS threads, and
// the user's Plajah rooms (for "Plajah call" / "Message on Plajah").
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChatRoom, UserProfile } from '../../types';
import { auth, createChatRoom, fetchUserProfiles, listenToChatRooms } from '../../services/backendService';
import { mergeContacts, nameForNumber, type MergedPerson, type PlajahPerson } from '../../services/phone/contactsMerge';
import {
  getTelecomStatus, isTelecomAvailable, onTelecom, telecom,
  type RcsBridgeStatus, type RcsThread, type SmsThread, type TelecomStatus,
} from '../../services/phone/telecom';

export function usePlajahPeople() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});

  useEffect(() => listenToChatRooms(setRooms), []);

  useEffect(() => {
    const me = auth.currentUser?.uid;
    const ids = Array.from(new Set(rooms.filter(r => r.type === 'PRIVATE').flatMap(r => r.participants).filter(id => id && id !== me)));
    const missing = ids.filter(id => !profiles[id]);
    if (!missing.length) return;
    let alive = true;
    fetchUserProfiles(missing).then(list => {
      if (!alive) return;
      setProfiles(prev => { const next = { ...prev }; list.forEach(p => { if (p?.uid) next[p.uid] = p; }); return next; });
    }).catch(() => {});
    return () => { alive = false; };
  }, [rooms]); // eslint-disable-line react-hooks/exhaustive-deps

  const people: PlajahPerson[] = useMemo(() => Object.values(profiles).map(p => {
    const any = p as unknown as Record<string, unknown>;
    return {
      uid: p.uid, displayName: p.displayName, username: (any.username as string) || undefined,
      photoURL: p.photoURL, email: (any.email as string) || undefined,
      phone: (any.phone as string) || undefined, phoneNumber: (any.phoneNumber as string) || undefined,
    };
  }), [profiles]);

  /** Existing 1:1 room with this person, or a new one. */
  const roomFor = useCallback(async (uid: string): Promise<ChatRoom | null> => {
    const me = auth.currentUser?.uid;
    if (!me) return null;
    const existing = rooms.find(r => r.type === 'PRIVATE' && r.participants.includes(uid) && r.participants.includes(me));
    if (existing) return existing;
    const id = await createChatRoom([me, uid], 'PRIVATE');
    return { id, type: 'PRIVATE', participants: [me, uid], name: '' } as unknown as ChatRoom;
  }, [rooms]);

  return { rooms, profiles, people, roomFor };
}

export function usePhoneBook(opts: { loadThreads?: boolean } = {}) {
  const available = isTelecomAvailable();
  const [status, setStatus] = useState<TelecomStatus | null>(null);
  const [contacts, setContacts] = useState<Awaited<ReturnType<typeof telecom.contacts>>>([]);
  const [threads, setThreads] = useState<SmsThread[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rcsStatus, setRcsStatus] = useState<RcsBridgeStatus | null>(null);
  const [rcsThreads, setRcsThreads] = useState<RcsThread[]>([]);
  const plajah = usePlajahPeople();

  const refreshStatus = useCallback(async () => { const s = await getTelecomStatus(); setStatus(s); return s; }, []);

  const refreshContacts = useCallback(async () => {
    if (!available) return;
    try { setContacts(await telecom.contacts()); } catch (e: any) { setError(e?.message || 'Contacts unavailable'); }
  }, [available]);

  const refreshThreads = useCallback(async () => {
    if (!available) return;
    try { setThreads(await telecom.threads(300)); } catch (e: any) { setError(e?.message || 'Texts unavailable'); }
  }, [available]);

  const refreshRcs = useCallback(async () => {
    if (!available) return;
    try {
      const st = await telecom.rcsStatus();
      setRcsStatus(st);
      setRcsThreads(st.enabled ? await telecom.rcsThreads() : []);
    } catch { /* bridge optional */ }
  }, [available]);

  useEffect(() => {
    if (!available) return;
    refreshRcs();
    const off = onTelecom('rcsMessage', () => { refreshRcs(); });
    const onVis = () => { if (document.visibilityState === 'visible') refreshRcs(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { off(); document.removeEventListener('visibilitychange', onVis); };
  }, [available, refreshRcs]);

  useEffect(() => {
    if (!available) { setStatus({ available: false } as TelecomStatus); return; }
    refreshStatus().then(s => {
      if (s.permissions.contacts === 'granted') refreshContacts();
      if (opts.loadThreads !== false && s.permissions.sms === 'granted') refreshThreads();
    });
    const offSms = onTelecom('sms', () => { refreshThreads(); });
    const offStatus = onTelecom('smsStatus', () => { refreshThreads(); });
    // Coming back from the system "default app" sheet or Settings.
    const onVis = () => { if (document.visibilityState === 'visible') refreshStatus(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { offSms(); offStatus(); document.removeEventListener('visibilitychange', onVis); };
  }, [available]); // eslint-disable-line react-hooks/exhaustive-deps

  const merged: MergedPerson[] = useMemo(() => mergeContacts(contacts, plajah.people), [contacts, plajah.people]);
  const lookup = useCallback((number: string) => nameForNumber(number, merged), [merged]);
  const unreadTexts = useMemo(() => threads.reduce((n, t) => n + (t.unreadCount || (t.unread ? 1 : 0)), 0)
    + rcsThreads.reduce((n, t) => n + t.unreadCount, 0), [threads, rcsThreads]);

  return { available, status, refreshStatus, contacts, refreshContacts, threads, refreshThreads, merged, lookup, unreadTexts, error, plajah, rcsStatus, rcsThreads, refreshRcs };
}
