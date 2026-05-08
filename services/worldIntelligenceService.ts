import { IPWorld, LoreEntry, TimelineEvent, Character } from '../types';

export interface WorldConflict {
  id: string;
  type: 'TIMELINE_OVERLAP' | 'LORE_CONFLICT' | 'CHARACTER_ANACHRONISM';
  description: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
}

export const analyzeWorldConsistency = (
  world: IPWorld,
  lore: LoreEntry[],
  timeline: TimelineEvent[],
  characters: Character[]
): WorldConflict[] => {
  const conflicts: WorldConflict[] = [];

  // Logic 1: Detect Timeline Overlaps (Simple rule)
  const years = timeline.map(e => e.year);
  const duplicates = years.filter((t, i) => years.indexOf(t) !== i);
  if (duplicates.length > 0) {
    conflicts.push({
      id: 'time-overlap',
      type: 'TIMELINE_OVERLAP',
      description: 'Multiple timeline events detected at the same temporal point.',
      severity: 'WARNING'
    });
  }

  // Logic 2: Lore Conflict Detection
  lore.forEach(entry => {
    if (entry.tags.includes('conflict-detected')) {
      conflicts.push({
        id: `lore-${entry.id}`,
        type: 'LORE_CONFLICT',
        description: `Potential conflict in lore entry: ${entry.title}`,
        severity: 'CRITICAL'
      });
    }
  });

  return conflicts;
};
