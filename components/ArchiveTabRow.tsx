/**
 * ArchiveTabRow — the Global Archive tab row in the "Chip Rail" treatment
 * (Kenne's pick from the tab-treatments artifact): one continuous glass rail,
 * chips with always-on service-color dots, brand-gradient active chip.
 *
 * Structure is unchanged from the original inline row — same 12 tabs, same
 * click semantics (App decides navigate-vs-filter in onSelect). Doors carry ↗,
 * Live carries its on-air count. `compact` renders the same rail one control
 * size down for the floating scroll-dock.
 */
import React from 'react';
import ChipRail, { type ChipRailItem } from './ui/ChipRail';

export const ARCHIVE_TABS = ['MUSIC', 'WORLDS', 'CLUBS', 'SOCIAL', 'SPORTS', 'LIVE_HUB', 'VIDEO', 'MOVIES_TV', 'BOOK', 'GAMES', 'MODULES', 'MY_ARCHIVE'] as const;
export type ArchiveTabId = typeof ARCHIVE_TABS[number];

const LABELS: Partial<Record<ArchiveTabId, string>> = {
  MY_ARCHIVE: 'My Archive', MOVIES_TV: 'Movies & TV', VIDEO: 'Videos',
  LIVE_HUB: 'Live', SPORTS: 'Sports', SOCIAL: 'Social', BOOK: 'Books', MODULES: 'Modules',
  MUSIC: 'Music', WORLDS: 'Worlds', CLUBS: 'Clubs', GAMES: 'Games',
};

/** Tabs that stay on the archive page; everything else is a door to another service. */
const IN_PLACE: ReadonlySet<string> = new Set(['MUSIC', 'MY_ARCHIVE']);

/** Service accent per tab (plajah-ds brand palette; duplicates are fine). */
const DOOR_COLOR: Record<ArchiveTabId, string> = {
  MUSIC: '#D40055',      // Chora
  WORLDS: '#D0BCFF',
  CLUBS: '#6B0099',
  SOCIAL: '#00DAF3',
  SPORTS: '#F59E0B',
  LIVE_HUB: '#06D6A0',
  VIDEO: '#00DAF3',      // Reello
  MOVIES_TV: '#6B0099',  // Taleo
  BOOK: '#FF8C00',       // Lorea
  GAMES: '#D40055',
  MODULES: '#00DAF3',    // Academia
  MY_ARCHIVE: '#FF8C00',
};

interface ArchiveTabRowProps {
  active: string;
  onSelect: (tab: ArchiveTabId) => void;
  liveCount?: number;
  compact?: boolean;
}

const ArchiveTabRow: React.FC<ArchiveTabRowProps> = ({ active, onSelect, liveCount = 0, compact }) => {
  const items: ChipRailItem[] = ARCHIVE_TABS.map(tab => ({
    id: tab,
    label: LABELS[tab] || tab,
    color: DOOR_COLOR[tab],
    door: !IN_PLACE.has(tab),
    count: tab === 'LIVE_HUB' && liveCount > 0 ? liveCount : undefined,
  }));
  return (
    <ChipRail
      items={items}
      activeId={active}
      onSelect={id => onSelect(id as ArchiveTabId)}
      size={compact ? 'xs' : 'sm'}
      className={compact ? 'shadow-2xl' : ''}
    />
  );
};

export default ArchiveTabRow;
