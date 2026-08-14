/**
 * Melos › Arrange — album running orders, side by side. Paper tier.
 *
 * NOTE ON THE WORD: "Arrange" in Melos means the ALBUM RUNNING ORDER. Per-song
 * structure is the LyricBlock order in the Pad. The Beats room's FL-style
 * pattern playlist is called "Sequence" so it doesn't collide with this.
 *
 * Several sequences exist at once and are compared as columns — that's the whole
 * point of the room. Each one draws its own energy curve from the Breakdown
 * feel data, so you can see the SHAPE of the record rather than just a list.
 */

import React, { useMemo, useState } from 'react';
import { Plus, Star, Trash2, GripVertical, Copy } from 'lucide-react';
import { useMelos, Label } from './MelosWorkspace';
import {
  MelosArrangement, arrangementStats, fmtRuntime, fmtDuration,
  stateMeta, uid, setPrimaryArrangement, songDuration,
} from '../../services/melosService';

/** The shape of the record — energy per song across the running order. */
const EnergyCurve: React.FC<{
  points: { songId: string; title: string; energy: number; hasFeel: boolean }[];
}> = ({ points }) => {
  const W = 100, H = 30;
  if (points.length < 2) return null;
  const step = W / (points.length - 1);
  const y = (e: number) => H - e * (H - 4) - 2;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${y(p.energy).toFixed(2)}`).join(' ');
  const area = `${path} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[46px]" role="img"
      aria-label={`Energy curve across ${points.length} songs`}>
      <path d={area} fill="var(--mel-accent)" opacity=".13" />
      <path d={path} fill="none" stroke="var(--mel-accent)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle
          key={p.songId + i}
          cx={i * step} cy={y(p.energy)} r="1.6"
          fill={p.hasFeel ? 'var(--mel-accent)' : 'transparent'}
          stroke="var(--mel-accent)" strokeWidth="0.8" vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
};

const ArrangeRoom: React.FC = () => {
  const {
    prodId, songs, arrangements, saveArrangement, editArrangement, dropArrangement,
  } = useMelos();

  const [drag, setDrag] = useState<{ arrId: string; index: number } | null>(null);
  const byId = useMemo(() => new Map(songs.map(s => [s.id, s])), [songs]);

  const addArrangement = () => {
    const now = Date.now();
    saveArrangement({
      id: uid('arr'),
      name: `Sequence ${String.fromCharCode(65 + arrangements.length)}`,
      songIds: songs.filter(s => s.commitment === 'VERIFIED' || s.commitment === 'WORKING_ON_IT').map(s => s.id),
      isPrimary: arrangements.length === 0,
      createdAt: now, updatedAt: now,
    });
  };

  const cloneArrangement = (a: MelosArrangement) => {
    const now = Date.now();
    saveArrangement({
      ...a, id: uid('arr'), name: `${a.name} (copy)`, isPrimary: false,
      songIds: [...a.songIds], createdAt: now, updatedAt: now,
    });
  };

  const reorder = (a: MelosArrangement, from: number, to: number) => {
    if (from === to) return;
    const next = [...a.songIds];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    editArrangement(a.id, { songIds: next });
  };

  if (!arrangements.length) {
    return (
      <div className="h-full flex items-center justify-center p-10 text-center">
        <div className="max-w-sm">
          <p className="text-sm m-0" style={{ color: 'var(--mel-dim)' }}>
            No running orders yet. Build a few and put them next to each other —
            the order is the record.
          </p>
          <button
            onClick={addArrangement}
            className="mt-4 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
          >Build a sequence</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-5 sm:px-7 py-6">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <Label className="mb-1.5">Running orders</Label>
          <p className="text-[13px] m-0" style={{ color: 'var(--mel-dim)' }}>
            {arrangements.length} sequence{arrangements.length === 1 ? '' : 's'}, side by side.
            The starred one becomes the album.
          </p>
        </div>
        <button
          onClick={addArrangement}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: 0 }}
        ><Plus size={12} />New sequence</button>
      </div>

      <div className="flex gap-4 items-start" style={{ minWidth: 'min-content' }}>
        {arrangements.map(a => {
          const stats = arrangementStats(a, songs);
          return (
            <section
              key={a.id}
              className="melos-sheet p-4 flex flex-col gap-3 shrink-0"
              style={{ width: 292 }}
            >
              <div className="flex items-start gap-2">
                <input
                  value={a.name}
                  onChange={e => editArrangement(a.id, { name: e.target.value })}
                  aria-label="Sequence name"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[14px] font-semibold"
                  style={{ color: 'var(--mel-ink)' }}
                />
                <button
                  onClick={() => setPrimaryArrangement(prodId, arrangements, a.id)}
                  title={a.isPrimary ? 'This is the running order' : 'Make this the running order'}
                  style={{ background: 'none', border: 0, color: a.isPrimary ? 'var(--mel-accent)' : 'var(--mel-faint)' }}
                >
                  <Star size={13} fill={a.isPrimary ? 'currentColor' : 'none'} />
                </button>
                <button onClick={() => cloneArrangement(a)} title="Duplicate"
                  style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}><Copy size={12} /></button>
                <button
                  onClick={() => { if (confirm(`Delete "${a.name}"?`)) dropArrangement(a.id); }}
                  title="Delete" style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
                ><Trash2 size={12} /></button>
              </div>

              <div className="flex items-baseline gap-3 text-[10.5px]" style={{ color: 'var(--mel-faint)' }}>
                <span className="tabular-nums">{a.songIds.length} tracks</span>
                <span className="tabular-nums">{fmtRuntime(stats.totalSec)}</span>
                {stats.unknown > 0 && <span>{stats.unknown} untimed</span>}
              </div>

              <div>
                <Label className="mb-1">Shape</Label>
                <EnergyCurve points={stats.curve} />
              </div>

              <ol className="list-none p-0 m-0 flex flex-col gap-1">
                {a.songIds.map((sid, i) => {
                  const s = byId.get(sid);
                  if (!s) return null;
                  return (
                    <li
                      key={`${a.id}-${sid}-${i}`}
                      draggable
                      onDragStart={() => setDrag({ arrId: a.id, index: i })}
                      onDragEnd={() => setDrag(null)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        if (drag && drag.arrId === a.id) reorder(a, drag.index, i);
                        setDrag(null);
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                      style={{ background: 'var(--mel-hover)', cursor: 'grab' }}
                    >
                      <span className="text-[9.5px] tabular-nums w-4 shrink-0" style={{ color: 'var(--mel-faint)' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <i className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: stateMeta(s.state).color }} />
                      <span className="text-[12px] flex-1 truncate" style={{ color: 'var(--mel-ink)' }}>{s.title}</span>
                      <span className="text-[9.5px] tabular-nums shrink-0" style={{ color: 'var(--mel-faint)' }}>
                        {fmtDuration(songDuration(s))}
                      </span>
                      <GripVertical size={10} style={{ color: 'var(--mel-faint)' }} className="shrink-0" />
                    </li>
                  );
                })}
              </ol>

              {/* Songs not in this sequence — one click to try them in it. */}
              {(() => {
                const missing = songs.filter(s => !a.songIds.includes(s.id) && s.commitment !== 'CUT');
                if (!missing.length) return null;
                return (
                  <div>
                    <Label className="mb-1.5">Not in this one</Label>
                    <div className="flex flex-wrap gap-1">
                      {missing.map(s => (
                        <button
                          key={s.id}
                          onClick={() => editArrangement(a.id, { songIds: [...a.songIds, s.id] })}
                          className="text-[9.5px] px-2 py-1 rounded-md"
                          style={{ background: 'transparent', color: 'var(--mel-faint)', border: '1px dashed var(--mel-edge)' }}
                        >+ {s.title}</button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <textarea
                value={a.notes || ''}
                onChange={e => editArrangement(a.id, { notes: e.target.value })}
                placeholder="Why this order…"
                rows={2}
                aria-label="Sequence notes"
                className="w-full bg-transparent outline-none resize-none melos-hand text-[13.5px]"
                style={{ border: '1px dashed var(--mel-edge)', borderRadius: 10, padding: '8px 10px', transform: 'none' }}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default ArrangeRoom;
