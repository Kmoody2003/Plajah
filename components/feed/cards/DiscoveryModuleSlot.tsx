import React from 'react';
import type { DiscoveryModuleSpec } from '../../../services/feedCardsCore';

/**
 * Placeholder contract for discovery modules injected between posts. `interleaveCards({ modules })` emits
 * `{ type: 'module', module, occurrence }` entries; the lead renders each with this slot and supplies the
 * real module through `render` (MeetNewPeopleRow for 'people', a club-to-join row for 'clubs',
 * 'creators' = creators like your follows, …). If `render` returns null/undefined the slot collapses to
 * nothing (no empty gap), so a module with no data is harmless.
 *
 *   {entry.type === 'module' && (
 *     <DiscoveryModuleSlot module={entry.module} occurrence={entry.occurrence}
 *       render={(id, n) => id === 'people' ? <MeetNewPeopleRow seed={n} /> : null} />
 *   )}
 */
export const DiscoveryModuleSlot: React.FC<{
  module: DiscoveryModuleSpec;
  occurrence: number;
  render?: (moduleId: string, occurrence: number) => React.ReactNode;
  className?: string;
}> = ({ module, occurrence, render, className = '' }) => {
  const content = render?.(module.id, occurrence);
  if (content == null || content === false) return null;
  return <div className={className} data-discovery-module={module.id}>{content}</div>;
};

export default DiscoveryModuleSlot;
