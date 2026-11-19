// The "Send to slideshow" submenu, shared by every photo browser: New show… then the recent
// shows (this device + the account). Menu builders are synchronous, so the list is kept warm
// by useRecentShows().

import React, { useCallback, useEffect, useState } from 'react';
import { Clapperboard, Cloud, FilePlus2, HardDrive } from 'lucide-react';
import type { MenuNode } from '../../ui';
import { recentShows, type SendTarget, type ShowTarget } from '../../../services/slideshow/sendTo';

export function useRecentShows(): [ShowTarget[], () => void] {
  const [list, setList] = useState<ShowTarget[]>([]);
  const refresh = useCallback(() => { void recentShows(8, true).then(setList).catch(() => {}); }, []);
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);
  return [list, refresh];
}

const when = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });

/** One "Send to slideshow" item with a submenu; `count` labels what is being sent. */
export function sendToShowNode<C>(recent: ShowTarget[], count: number, onPick: (target: SendTarget, ctx: C) => void, label?: string): MenuNode<C> {
  const what = label || (count > 1 ? `Send ${count} photos to a slideshow` : 'Send to slideshow');
  const items: MenuNode<C>[] = [
    { id: 'show-new', label: 'New show…', icon: <FilePlus2 size={14} />, onSelect: (ctx: C) => onPick({ kind: 'new' }, ctx) },
  ];
  if (recent.length) {
    items.push({ kind: 'separator' }, { kind: 'header', label: 'Recent shows' });
    for (const s of recent) {
      items.push({
        id: `show-${s.id}`,
        label: <span className="flex items-center gap-2 min-w-0"><span className="truncate max-w-[14rem]">{s.title}</span><span className="text-[10px] opacity-50 shrink-0">{when(s.savedAt)}{s.photos ? ` · ${s.photos}` : ''}</span></span>,
        icon: s.where === 'account' ? <Cloud size={14} /> : <HardDrive size={14} />,
        onSelect: (ctx: C) => onPick({ kind: 'show', show: s }, ctx),
      });
    }
  }
  return { id: 'send-to-show', label: what, icon: <Clapperboard size={14} />, submenu: items };
}
