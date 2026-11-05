// useClassLiveNow — which classes have a teacher live in the lecture room right now.
// Reads the lecture's own signaling space (rtc_sessions/<class lecture>/participants): a host seat
// with a fresh heartbeat means the class is on. No extra writes, so it can't drift from reality.
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';

/** The rtcCore session id a class lecture runs on (shared by the lecture room and the live beacon). */
export const classLectureSessionId = (classId: string) => `class_lecture_${classId.replace(/[^A-Za-z0-9_-]/g, '_')}`;

/** A host heartbeats every 15s; give it two misses before calling the class over. */
const FRESH_MS = 50_000;

export interface ClassLiveInfo { hostUid: string; hostName?: string }

const lastSeenMs = (v: unknown): number => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
};

export function useClassLiveNow(classIds: string[]): Record<string, ClassLiveInfo> {
  const key = useMemo(() => Array.from(new Set(classIds.filter(Boolean))).sort().join('|'), [classIds]);
  const [hosts, setHosts] = useState<Record<string, { info: ClassLiveInfo; seen: number } | null>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) { setHosts({}); return; }
    const ids = key.split('|');
    const unsubs = ids.map(id =>
      onSnapshot(
        query(collection(db, 'rtc_sessions', classLectureSessionId(id), 'participants'), where('role', '==', 'host')),
        snap => {
          let best: { info: ClassLiveInfo; seen: number } | null = null;
          snap.docs.forEach(d => {
            const data = d.data() as { name?: string; lastSeen?: unknown; joinedAt?: unknown };
            const seen = lastSeenMs(data.lastSeen) || lastSeenMs(data.joinedAt);
            if (!best || seen > best.seen) best = { info: { hostUid: d.id, hostName: data.name }, seen };
          });
          setHosts(prev => ({ ...prev, [id]: best }));
        },
        () => setHosts(prev => ({ ...prev, [id]: null })),
      ),
    );
    return () => unsubs.forEach(u => u());
  }, [key]);

  // Re-check freshness even when no snapshot arrives (a closed laptop writes nothing).
  useEffect(() => {
    if (!key) return;
    const t = window.setInterval(() => setTick(n => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, [key]);

  return useMemo(() => {
    const now = Date.now();
    const out: Record<string, ClassLiveInfo> = {};
    Object.entries(hosts).forEach(([id, h]) => {
      if (h && now - h.seen < FRESH_MS) out[id] = h.info;
    });
    return out;
  }, [hosts, tick]);
}
