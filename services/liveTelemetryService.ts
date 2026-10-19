import { collection, doc, setDoc, getDocs, onSnapshot, query, where, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { AppView } from '../types';

export interface PresenceSession {
  sessionId: string;
  uid?: string;
  displayName: string;
  photoURL?: string;
  role: string;
  currentView: AppView | string;
  viewLabel: string;
  category: string;
  activeSection?: string;
  deviceType: 'desktop' | 'tablet' | 'mobile';
  enteredAt: number;
  lastHeartbeat: number;
  isCurrentTab?: boolean;
  isSimulated?: boolean;
}

export interface ViewTelemetryBucket {
  view: AppView | string;
  label: string;
  category: string;
  color: string;
  count: number;
  percent: number;
  sessions: PresenceSession[];
}

export interface TelemetryTransitionEvent {
  id: string;
  timestamp: number;
  displayName: string;
  role: string;
  fromView?: string;
  toView: string;
  toLabel: string;
}

export interface LiveTelemetrySnapshot {
  totalActiveNow: number;
  authenticatedCount: number;
  guestCount: number;
  byView: ViewTelemetryBucket[];
  activeSessions: PresenceSession[];
  recentTransitions: TelemetryTransitionEvent[];
  updatedAt: number;
}

export const VIEW_METADATA: Record<string, { label: string; category: string; color: string }> = {
  [AppView.PLAJAH_ELEVATE]: { label: 'Plajah Elevate · Living Sanctuary', category: 'Sanctuary & Faith', color: '#FF8C00' },
  [AppView.DASHBOARD]: { label: 'Front Row · Home Stage', category: 'Core Hub', color: '#D40055' },
  [AppView.MUSIC]: { label: 'Chora · Music & Audio', category: 'Streaming', color: '#6B0099' },
  [AppView.VIDEOS]: { label: 'Reello · Cinema & Video', category: 'Streaming', color: '#00DAF3' },
  [AppView.BOOKS]: { label: 'Lorea · Living Books', category: 'Publishing', color: '#D0BCFF' },
  [AppView.CLASSROOMS]: { label: 'Plajah Academia · Campus', category: 'Education', color: '#06D6A0' },
  [AppView.PLAJAH_BUSINESS]: { label: 'Small Business · Guild', category: 'Commerce', color: '#FFD166' },
  [AppView.TELA_STUDIO]: { label: 'Tela · Design Studio', category: 'Creative Tools', color: '#FF5E7E' },
  [AppView.PLAJAH_PIXELS]: { label: 'Plajah Pixels · Visual Lab', category: 'Creative Tools', color: '#38BDF8' },
  [AppView.ADMIN]: { label: 'Admin Command Center', category: 'Operations', color: '#F43F5E' },
  [AppView.SOCIAL]: { label: 'Community Pulse · Social', category: 'Community', color: '#A855F7' },
  [AppView.GAMES]: { label: 'Ludus · Arcade & Worlds', category: 'Interactive', color: '#10B981' },
  [AppView.PODCASTS]: { label: 'Vox · Podcasts & Talk', category: 'Streaming', color: '#F59E0B' },
  [AppView.RADIO]: { label: 'Live Broadcast Radio', category: 'Streaming', color: '#EC4899' },
};

export function getViewMeta(view: AppView | string): { label: string; category: string; color: string } {
  if (VIEW_METADATA[view]) return VIEW_METADATA[view];
  const clean = String(view || 'DASHBOARD')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
  return {
    label: clean,
    category: 'Platform View',
    color: '#D0BCFF',
  };
}

const STORAGE_KEY_SESSIONS = 'plajah_live_presence_sessions_v1';
const STORAGE_KEY_TRANSITIONS = 'plajah_live_presence_transitions_v1';
const STORAGE_KEY_SIMULATE = 'plajah_live_telemetry_simulate_v1';
const ACTIVE_TTL_MS = 90 * 1000; // 90 seconds active window

let currentSessionId = '';
let currentViewState: AppView | string = AppView.DASHBOARD;
let currentSectionState = 'Hero Stage';
let currentUserInfo: { uid?: string; displayName: string; photoURL?: string; role: string } = {
  displayName: 'Sanctuary Visitor',
  role: 'visitor',
};
let enteredViewAt = Date.now();
let heartbeatInterval: number | null = null;
let broadcastChannel: BroadcastChannel | null = null;
const listeners = new Set<(snap: LiveTelemetrySnapshot) => void>();
let firestoreSessionsCache: Map<string, PresenceSession> = new Map();

function getOrCreateSessionId(): string {
  if (currentSessionId) return currentSessionId;
  try {
    const existing = sessionStorage.getItem('plajah_telemetry_session_id');
    if (existing) {
      currentSessionId = existing;
      return existing;
    }
    const created = `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('plajah_telemetry_session_id', created);
    currentSessionId = created;
    return created;
  } catch {
    currentSessionId = `ses_${Date.now().toString(36)}`;
    return currentSessionId;
  }
}

function detectDeviceType(): 'desktop' | 'tablet' | 'mobile' {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

function readLocalSessions(): Record<string, PresenceSession> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeLocalSession(session: PresenceSession) {
  try {
    const all = readLocalSessions();
    const now = Date.now();
    // Prune stale sessions
    Object.keys(all).forEach(k => {
      if (now - all[k].lastHeartbeat > ACTIVE_TTL_MS) {
        delete all[k];
      }
    });
    all[session.sessionId] = session;
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(all));
  } catch {
    // ignore storage quota errors
  }
}

function recordTransition(fromView: string | undefined, toView: string, displayName: string, role: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRANSITIONS);
    const list: TelemetryTransitionEvent[] = raw ? JSON.parse(raw) : [];
    const meta = getViewMeta(toView);
    const evt: TelemetryTransitionEvent = {
      id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      displayName,
      role,
      fromView: fromView ? getViewMeta(fromView).label : undefined,
      toView,
      toLabel: meta.label,
    };
    const next = [evt, ...list].slice(0, 30);
    localStorage.setItem(STORAGE_KEY_TRANSITIONS, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function isSimulatedTrafficEnabled(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY_SIMULATE);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function setSimulatedTrafficEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_SIMULATE, String(enabled));
    notifyListeners();
  } catch {
    // ignore
  }
}

const SIMULATED_PRESENCE_SEED: Omit<PresenceSession, 'enteredAt' | 'lastHeartbeat'>[] = [
  {
    sessionId: 'sim_elevate_1',
    displayName: 'Pastor Marcus V.',
    role: 'creator',
    currentView: AppView.PLAJAH_ELEVATE,
    viewLabel: VIEW_METADATA[AppView.PLAJAH_ELEVATE].label,
    category: 'Sanctuary & Faith',
    activeSection: 'Ambo Sanctuary Stage',
    deviceType: 'desktop',
    isSimulated: true,
  },
  {
    sessionId: 'sim_elevate_2',
    displayName: 'Sister Elena R.',
    role: 'member',
    currentView: AppView.PLAJAH_ELEVATE,
    viewLabel: VIEW_METADATA[AppView.PLAJAH_ELEVATE].label,
    category: 'Sanctuary & Faith',
    activeSection: 'Featured Sanctuaries Carousel',
    deviceType: 'tablet',
    isSimulated: true,
  },
  {
    sessionId: 'sim_elevate_3',
    displayName: 'Deacon Samuel T.',
    role: 'member',
    currentView: AppView.PLAJAH_ELEVATE,
    viewLabel: VIEW_METADATA[AppView.PLAJAH_ELEVATE].label,
    category: 'Sanctuary & Faith',
    activeSection: 'Six Gathering Pillars',
    deviceType: 'mobile',
    isSimulated: true,
  },
  {
    sessionId: 'sim_lorea_1',
    displayName: 'Naomi K.',
    role: 'creator',
    currentView: AppView.BOOKS,
    viewLabel: VIEW_METADATA[AppView.BOOKS].label,
    category: 'Publishing',
    activeSection: 'Living Book Reader',
    deviceType: 'tablet',
    isSimulated: true,
  },
  {
    sessionId: 'sim_lorea_2',
    displayName: 'Caleb J.',
    role: 'member',
    currentView: AppView.BOOKS,
    viewLabel: VIEW_METADATA[AppView.BOOKS].label,
    category: 'Publishing',
    activeSection: 'Sanctuary Study Shelf',
    deviceType: 'desktop',
    isSimulated: true,
  },
  {
    sessionId: 'sim_chora_1',
    displayName: 'Aria Choir Director',
    role: 'creator',
    currentView: AppView.MUSIC,
    viewLabel: VIEW_METADATA[AppView.MUSIC].label,
    category: 'Streaming',
    activeSection: 'Uptempo Praise Stem Deck',
    deviceType: 'desktop',
    isSimulated: true,
  },
  {
    sessionId: 'sim_frontrow_1',
    displayName: 'Jordan M.',
    role: 'member',
    currentView: AppView.DASHBOARD,
    viewLabel: VIEW_METADATA[AppView.DASHBOARD].label,
    category: 'Core Hub',
    activeSection: 'Hero Discovery Stage',
    deviceType: 'desktop',
    isSimulated: true,
  },
  {
    sessionId: 'sim_frontrow_2',
    displayName: 'Guest Visitor #409',
    role: 'visitor',
    currentView: AppView.DASHBOARD,
    viewLabel: VIEW_METADATA[AppView.DASHBOARD].label,
    category: 'Core Hub',
    activeSection: 'Trending Now',
    deviceType: 'mobile',
    isSimulated: true,
  },
  {
    sessionId: 'sim_academia_1',
    displayName: 'Prof. D. Williams',
    role: 'staff',
    currentView: AppView.CLASSROOMS,
    viewLabel: VIEW_METADATA[AppView.CLASSROOMS].label,
    category: 'Education',
    activeSection: 'Interactive Lesson Studio',
    deviceType: 'desktop',
    isSimulated: true,
  },
  {
    sessionId: 'sim_reello_1',
    displayName: 'Zion Media Team',
    role: 'creator',
    currentView: AppView.VIDEOS,
    viewLabel: VIEW_METADATA[AppView.VIDEOS].label,
    category: 'Streaming',
    activeSection: 'Sanctuary Broadcast Cinema',
    deviceType: 'desktop',
    isSimulated: true,
  },
];

function buildCurrentSession(): PresenceSession {
  const sid = getOrCreateSessionId();
  const meta = getViewMeta(currentViewState);
  return {
    sessionId: sid,
    uid: currentUserInfo.uid,
    displayName: currentUserInfo.displayName,
    photoURL: currentUserInfo.photoURL,
    role: currentUserInfo.role,
    currentView: currentViewState,
    viewLabel: meta.label,
    category: meta.category,
    activeSection: currentSectionState,
    deviceType: detectDeviceType(),
    enteredAt: enteredViewAt,
    lastHeartbeat: Date.now(),
    isCurrentTab: true,
  };
}

async function syncHeartbeatToFirestore(session: PresenceSession) {
  try {
    const ref = doc(db, 'site_presence', session.sessionId);
    await setDoc(
      ref,
      {
        sessionId: session.sessionId,
        uid: session.uid || null,
        displayName: session.displayName,
        photoURL: session.photoURL || null,
        role: session.role,
        currentView: session.currentView,
        viewLabel: session.viewLabel,
        category: session.category,
        activeSection: session.activeSection || 'Main Stage',
        deviceType: session.deviceType,
        enteredAt: session.enteredAt,
        lastHeartbeat: session.lastHeartbeat,
      },
      { merge: true }
    );
  } catch {
    // Offline or restricted permissions fallback cleanly to localStorage + BroadcastChannel
  }
}

export function buildTelemetrySnapshot(): LiveTelemetrySnapshot {
  const now = Date.now();
  const sid = getOrCreateSessionId();
  const merged = new Map<string, PresenceSession>();

  // 1. Always include current tab session
  const selfSession = buildCurrentSession();
  merged.set(sid, selfSession);

  // 2. Include local multi-tab sessions
  const localAll = readLocalSessions();
  Object.values(localAll).forEach(s => {
    if (now - s.lastHeartbeat <= ACTIVE_TTL_MS) {
      merged.set(s.sessionId, {
        ...s,
        isCurrentTab: s.sessionId === sid,
      });
    }
  });

  // 3. Include live Firestore sessions
  firestoreSessionsCache.forEach(s => {
    if (now - s.lastHeartbeat <= ACTIVE_TTL_MS && !merged.has(s.sessionId)) {
      merged.set(s.sessionId, {
        ...s,
        isCurrentTab: s.sessionId === sid,
      });
    }
  });

  // 4. Optional simulated community presence so admins can preview multi-room distribution
  if (isSimulatedTrafficEnabled()) {
    SIMULATED_PRESENCE_SEED.forEach((sim, idx) => {
      merged.set(sim.sessionId, {
        ...sim,
        enteredAt: now - (idx + 1) * 140000,
        lastHeartbeat: now - (idx * 3500),
      });
    });
  }

  const activeSessions = Array.from(merged.values()).sort((a, b) => {
    if (a.isCurrentTab) return -1;
    if (b.isCurrentTab) return 1;
    return b.lastHeartbeat - a.lastHeartbeat;
  });

  const totalActiveNow = activeSessions.length;
  const authenticatedCount = activeSessions.filter(s => s.role !== 'visitor').length;
  const guestCount = totalActiveNow - authenticatedCount;

  const bucketMap = new Map<string, PresenceSession[]>();
  activeSessions.forEach(s => {
    const key = String(s.currentView || AppView.DASHBOARD);
    const arr = bucketMap.get(key) || [];
    arr.push(s);
    bucketMap.set(key, arr);
  });

  const byView: ViewTelemetryBucket[] = Array.from(bucketMap.entries())
    .map(([view, sessions]) => {
      const meta = getViewMeta(view);
      return {
        view,
        label: meta.label,
        category: meta.category,
        color: meta.color,
        count: sessions.length,
        percent: totalActiveNow > 0 ? Math.round((sessions.length / totalActiveNow) * 100) : 0,
        sessions,
      };
    })
    .sort((a, b) => b.count - a.count);

  let recentTransitions: TelemetryTransitionEvent[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRANSITIONS);
    if (raw) recentTransitions = JSON.parse(raw);
  } catch {
    recentTransitions = [];
  }

  return {
    totalActiveNow,
    authenticatedCount,
    guestCount,
    byView,
    activeSessions,
    recentTransitions,
    updatedAt: now,
  };
}

function notifyListeners() {
  const snap = buildTelemetrySnapshot();
  listeners.forEach(cb => {
    try {
      cb(snap);
    } catch {
      // ignore listener errors
    }
  });
}

export function startPresenceHeartbeat(
  initialView: AppView | string,
  user?: { uid?: string; email?: string | null; displayName?: string | null; photoURL?: string | null } | null,
  userProfile?: { displayName?: string; role?: string; avatarUrl?: string } | null
) {
  currentViewState = initialView || AppView.DASHBOARD;
  currentUserInfo = {
    uid: user?.uid,
    displayName:
      userProfile?.displayName ||
      user?.displayName ||
      (user?.email ? user.email.split('@')[0] : 'Sanctuary Visitor'),
    photoURL: userProfile?.avatarUrl || user?.photoURL || undefined,
    role: userProfile?.role || (user?.email === 'kmoody2003@gmail.com' ? 'admin' : user ? 'member' : 'visitor'),
  };

  const session = buildCurrentSession();
  writeLocalSession(session);
  syncHeartbeatToFirestore(session);

  if (typeof window !== 'undefined' && 'BroadcastChannel' in window && !broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel('plajah_live_telemetry');
      broadcastChannel.onmessage = () => {
        notifyListeners();
      };
    } catch {
      // ignore
    }
  }

  if (heartbeatInterval) window.clearInterval(heartbeatInterval);
  if (typeof window !== 'undefined') {
    heartbeatInterval = window.setInterval(() => {
      const s = buildCurrentSession();
      writeLocalSession(s);
      syncHeartbeatToFirestore(s);
      broadcastChannel?.postMessage({ type: 'HEARTBEAT', sessionId: s.sessionId });
      notifyListeners();
    }, 15000);
  }

  notifyListeners();
}

export function updatePresenceView(nextView: AppView | string, activeSection?: string) {
  const prevView = currentViewState;
  const changedView = prevView !== nextView;
  currentViewState = nextView;
  if (activeSection) {
    currentSectionState = activeSection;
  } else if (changedView) {
    currentSectionState = 'Hero Stage';
    enteredViewAt = Date.now();
  }

  const session = buildCurrentSession();
  writeLocalSession(session);
  syncHeartbeatToFirestore(session);

  if (changedView) {
    recordTransition(String(prevView), String(nextView), session.displayName, session.role);
  }

  broadcastChannel?.postMessage({ type: 'VIEW_CHANGE', sessionId: session.sessionId });
  notifyListeners();
}

export function subscribeLiveTelemetry(callback: (snap: LiveTelemetrySnapshot) => void): () => void {
  listeners.add(callback);
  callback(buildTelemetrySnapshot());

  // Also subscribe to Firestore site_presence collection if available
  let unsubFirestore: (() => void) | null = null;
  try {
    const colRef = collection(db, 'site_presence');
    unsubFirestore = onSnapshot(
      colRef,
      snap => {
        const nextMap = new Map<string, PresenceSession>();
        const now = Date.now();
        snap.forEach(docSnap => {
          const d = docSnap.data() as PresenceSession;
          if (d && d.sessionId && now - (d.lastHeartbeat || 0) <= ACTIVE_TTL_MS) {
            nextMap.set(d.sessionId, d);
          }
        });
        firestoreSessionsCache = nextMap;
        notifyListeners();
      },
      () => {
        // Ignore Firestore permission error and rely on local + broadcast
      }
    );
  } catch {
    // ignore
  }

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY_SESSIONS || e.key === STORAGE_KEY_TRANSITIONS || e.key === STORAGE_KEY_SIMULATE) {
      notifyListeners();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return () => {
    listeners.delete(callback);
    if (unsubFirestore) unsubFirestore();
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}
