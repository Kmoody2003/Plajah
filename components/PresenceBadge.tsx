import React from 'react';
import { usePresence } from '../hooks/usePresence';

/**
 * PresenceBadge — drop anywhere to show ambient liveness: "12 here".
 * Pure presence (no media). Renders nothing when the room is empty unless
 * `showZero` is set.
 *
 * Example: <PresenceBadge roomKey={`book_${book.id}`} verb="reading" />
 */
export const PresenceBadge: React.FC<{
  roomKey: string | null;
  /** e.g. "reading", "listening", "watching", "here" (default). */
  verb?: string;
  className?: string;
  showZero?: boolean;
  /** Set false on surfaces where the viewer shouldn't be counted. */
  publishSelf?: boolean;
}> = ({ roomKey, verb = 'here', className, showZero, publishSelf }) => {
  const { count, people } = usePresence(roomKey, { publishSelf });
  if (count === 0 && !showZero) return null;

  return (
    <div className={className ?? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10'}>
      {/* live pulse */}
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
      </span>
      {/* stacked avatars */}
      {people.slice(0, 3).some(p => p.photo) && (
        <div className="flex -space-x-1.5">
          {people.slice(0, 3).filter(p => p.photo).map(p => (
            <img key={p.uid} src={p.photo} alt="" className="w-4 h-4 rounded-full ring-1 ring-black object-cover" />
          ))}
        </div>
      )}
      <span className="text-[10px] font-black uppercase tracking-widest text-white/60 tabular-nums">
        {count} {verb}
      </span>
    </div>
  );
};

export default PresenceBadge;
