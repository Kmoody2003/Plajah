/** Shared live production catalog. Streams are borrowed; consumers never own call tracks. */
import { publishAppOutput, unpublishAppOutput } from './mediaEngine/bridge';

export interface ProductionFeed { id: string; label: string; stream: MediaStream; kind: 'chat' | 'live' | 'tela' | 'ambo' }
const feeds = new Map<string, ProductionFeed>();
const listeners = new Set<(feeds: ProductionFeed[]) => void>();
const emit = () => { const snapshot = [...feeds.values()]; listeners.forEach(fn => fn(snapshot)); };
export function publishProductionFeed(feed: ProductionFeed): void {
  feeds.set(feed.id, feed);
  publishAppOutput(feed.id, feed.stream, feed.label, feed.kind);
  emit();
}
export function removeProductionFeed(id: string): void {
  if (!feeds.delete(id)) return;
  unpublishAppOutput(id);
  emit();
}
export function watchProductionFeeds(listener: (feeds: ProductionFeed[]) => void): () => void {
  listeners.add(listener); listener([...feeds.values()]);
  return () => { listeners.delete(listener); };
}

export interface ProductionParticipant { id: string; name: string; stream: MediaStream; moderator: boolean; allowed: boolean }
export function eligibleProductionParticipants(participants: ProductionParticipant[]): ProductionParticipant[] {
  return participants.filter(p => !p.moderator && p.allowed);
}
export function talkingHeadLayout(count: number): Array<{ x: number; y: number; w: number; h: number }> {
  if (!Number.isInteger(count) || count < 1) return [];
  const cols = Math.ceil(Math.sqrt(count)); const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols); const inRow = Math.min(cols, count - row * cols);
    return { x: (i % cols + (cols - inRow) / 2) / cols, y: row / rows, w: 1 / cols, h: 1 / rows };
  });
}
