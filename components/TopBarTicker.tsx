import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bell, MessageCircle, X } from 'lucide-react';
import { useNetworkMonitorOptional } from '../contexts/NetworkMonitorContext';
import { useNotifications } from '../contexts/NotificationContext';
import { levelToSeverity, levelLabel as networkLevelLabel, type NetworkLevel } from '../services/networkDiagnostics';
import type { AppNotification } from '../types';

export interface TopBarNotice {
  id: string;
  kind: 'network' | 'notification';
  text: string;
  tone: 'info' | 'warning' | 'critical' | 'chat';
  notif?: AppNotification;
}

/** Glow colours for the toolbar edge (rgb triplets so we can vary alpha). */
const GLOW: Record<string, string> = {
  info: '56,189,248',      // sky
  warning: '251,191,36',   // amber
  critical: '239,68,68',   // red
  chat: '255,140,0',       // brand orange
};

const NOTICE_MS = 6000;

/**
 * Signals for the desktop top bar: a colour glow while the connection is degraded, plus a one-line
 * ticker for network state and fresh platform notifications (chats, comments, follows…).
 * Replaces the old floating network popup.
 */
export function useTopBarSignals() {
  const net = useNetworkMonitorOptional();
  let notifs: AppNotification[] = [];
  try { notifs = useNotifications().notifications; } catch { /* outside provider */ }

  const level: NetworkLevel = net?.sample?.level ?? 'good';
  const severity = levelToSeverity(level);
  const netTone = severity === 'critical' ? 'critical' : severity === 'warning' ? 'warning' : severity === 'info' ? 'info' : null;

  // Fresh notifications only: anything already present at mount is history, not news.
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<TopBarNotice[]>([]);
  useEffect(() => {
    if (seen.current === null) {
      if (notifs.length === 0) return; // wait for the first snapshot before baselining
      seen.current = new Set(notifs.map(n => n.id));
      return;
    }
    const fresh = notifs.filter(n => !n.isRead && !seen.current!.has(n.id));
    if (!fresh.length) return;
    fresh.forEach(n => seen.current!.add(n.id));
    setQueue(q => [...q, ...fresh.map<TopBarNotice>(n => ({
      id: n.id,
      kind: 'notification',
      tone: n.type === 'MESSAGE' ? 'chat' : 'info',
      text: n.title ? `${n.title}${n.message ? ` — ${n.message}` : ''}` : n.message,
      notif: n,
    }))].slice(-8));
  }, [notifs]);

  const head = queue[0];
  useEffect(() => {
    if (!head) return;
    const t = setTimeout(() => setQueue(q => q.slice(1)), NOTICE_MS);
    return () => clearTimeout(t);
  }, [head?.id]);
  const dismiss = useCallback(() => setQueue(q => q.slice(1)), []);

  const netNotice: TopBarNotice | null = netTone ? {
    id: `net-${level}`,
    kind: 'network',
    tone: netTone,
    text: level === 'offline' ? "You're offline" : `Network ${networkLevelLabel(level).toLowerCase()}${net?.sample?.rttMs ? ` · ${Math.round(net.sample.rttMs)} ms` : ''}`,
  } : null;

  // Platform notices take the slot while they last; otherwise the standing network state shows.
  const notice = head ?? netNotice;
  const glowTone = netTone ?? (head ? head.tone : null);
  return { notice, glowTone, dismiss, hasQueued: queue.length > 1 };
}

export const glowStyle = (tone: string | null): React.CSSProperties => {
  if (!tone) return {};
  const c = GLOW[tone] || GLOW.info;
  return {
    boxShadow: `inset 0 -1px 0 rgba(${c},0.9), 0 6px 18px -4px rgba(${c},0.55)`,
    borderBottomColor: `rgba(${c},0.8)`,
  };
};

export const TopBarTicker: React.FC<{
  notice: TopBarNotice | null;
  onDismiss: () => void;
  onOpen: (n: TopBarNotice) => void;
}> = ({ notice, onDismiss, onOpen }) => {
  const memoKey = useMemo(() => notice?.id, [notice?.id]);
  if (!notice) return null;
  const c = GLOW[notice.tone] || GLOW.info;
  const Icon = notice.kind === 'network' ? Activity : notice.tone === 'chat' ? MessageCircle : Bell;
  return (
    <div
      key={memoKey}
      className="hidden md:flex items-center gap-1.5 h-7 px-2.5 rounded-full max-w-[280px] min-w-0 shrink animate-in fade-in slide-in-from-top-1 duration-200"
      style={{ background: `rgba(${c},0.12)`, border: `1px solid rgba(${c},0.45)` }}
      role="status"
    >
      <button
        onClick={() => onOpen(notice)}
        className="flex items-center gap-1.5 min-w-0 text-[11px] font-semibold text-white/90 hover:text-white"
        title={notice.text}
      >
        <Icon size={12} style={{ color: `rgb(${c})` }} className="shrink-0" />
        <span className="truncate">{notice.text}</span>
      </button>
      {notice.kind === 'notification' && (
        <button onClick={onDismiss} className="text-white/40 hover:text-white shrink-0" aria-label="Dismiss"><X size={11} /></button>
      )}
    </div>
  );
};
