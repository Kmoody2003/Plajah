// The versions a song has (its shared groove's session + each person's saved line), shown on an
// album track row. Read-only here — open the song in the Studio to switch versions.

import React, { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { listSongLines, type SongLine } from '../../../../services/melos/beats/jamLink';

const cache = new Map<string, Promise<SongLine[]>>();

export const SongLinesBadge: React.FC<{ grooveId?: string | null }> = ({ grooveId }) => {
  const [lines, setLines] = useState<SongLine[]>([]);
  useEffect(() => {
    if (!grooveId) { setLines([]); return; }
    let alive = true;
    if (!cache.has(grooveId)) cache.set(grooveId, listSongLines(grooveId));
    void cache.get(grooveId)!.then((l) => { if (alive) setLines(l); });
    return () => { alive = false; };
  }, [grooveId]);
  if (!lines.length) return null;
  return (
    <span className="flex items-center gap-1 text-[#D0BCFF]/80" title={['Session version', ...lines.map((l) => `${l.label} · ${new Date(l.at).toLocaleDateString()}`)].join('\n')}>
      <GitBranch size={9} /> Session{lines.slice(0, 3).map((l) => <span key={l.id} className="text-white/40">· {l.label}</span>)}
      {lines.length > 3 && <span className="text-white/30">+{lines.length - 3}</span>}
    </span>
  );
};
