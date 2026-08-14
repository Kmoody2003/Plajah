/**
 * Melos › Tracklist — every song, honestly. Paper tier.
 *
 * The two axes stay separate here on purpose: `state` (where it is in the
 * process) and `commitment` (whether it's making the record) are shown as two
 * columns, because a song can be finished and still tentative.
 */

import React, { useMemo, useState } from 'react';
import { Plus, Music4, Upload, AlertTriangle, Trash2, Check } from 'lucide-react';
import { useMelos, Label, Hearts } from './MelosWorkspace';
import {
  MelosSong, Commitment, COMMITMENTS, SONG_STATES, stateMeta, commitmentMeta,
  fmtDuration, songDuration, blockingSamples, IS_ON_RECORD,
} from '../../services/melosService';

type Filter = 'ALL' | 'ON_RECORD' | Commitment;

const TracklistRoom: React.FC = () => {
  const { songs, samples, editSong, dropSong, addSong, selectSong, goRoom } = useMelos();
  const [filter, setFilter] = useState<Filter>('ALL');

  const rows = useMemo(() => {
    if (filter === 'ALL') return songs;
    if (filter === 'ON_RECORD') return songs.filter(s => IS_ON_RECORD.includes(s.commitment));
    return songs.filter(s => s.commitment === filter);
  }, [songs, filter]);

  const totalSec = rows.reduce((n, s) => n + songDuration(s), 0);

  const openInPad = (s: MelosSong) => { selectSong(s.id); goRoom('pad'); };

  return (
    <div className="h-full overflow-y-auto px-5 sm:px-7 py-6">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <Label className="mb-1.5">Tracklist</Label>
          <p className="text-[13px] m-0" style={{ color: 'var(--mel-dim)' }}>
            {rows.length} song{rows.length === 1 ? '' : 's'}
            {totalSec > 0 && <> · {fmtDuration(totalSec)} of known runtime</>}
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {([['ALL', 'All'], ['ON_RECORD', 'On the record'], ...COMMITMENTS.map(c => [c.key, c.label] as [string, string])] as [Filter, string][])
            .map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{
                  background: filter === k ? 'var(--mel-hover)' : 'transparent',
                  color: filter === k ? 'var(--mel-accent)' : 'var(--mel-faint)',
                  border: '1px solid var(--mel-edge)',
                }}
              >{label}</button>
            ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              {['', 'Song', 'Where it\'s at', 'Commitment', 'Love', 'Confidence', 'Length', 'Audio', ''].map((h, i) => (
                <th key={i} className="melos-label text-left font-bold pb-2.5 px-2"
                  style={{ borderBottom: '1px solid var(--mel-edge)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(s => {
              const blocked = blockingSamples(s, samples);
              return (
                <tr key={s.id} className="group" style={{ borderBottom: '1px solid var(--mel-edge)' }}>
                  <td className="py-2.5 px-2 w-6">
                    <i className="block w-[7px] h-[7px] rounded-full" style={{ background: stateMeta(s.state).color }} />
                  </td>

                  <td className="py-2.5 px-2">
                    <button
                      onClick={() => openInPad(s)}
                      className="text-left"
                      style={{ background: 'none', border: 0, padding: 0 }}
                    >
                      <span className="text-[13.5px] font-medium block" style={{ color: 'var(--mel-ink)' }}>{s.title}</span>
                      {s.workingTitle && (
                        <span className="melos-hand text-[12px] block" style={{ transform: 'none' }}>— {s.workingTitle}</span>
                      )}
                    </button>
                    <div className="flex items-center gap-2 mt-1">
                      {s.lyricsLockedAt && (
                        <span className="text-[8.5px] uppercase tracking-[0.12em] flex items-center gap-1" style={{ color: 'var(--mel-ok)' }}>
                          <Check size={8} />Lyrics locked
                        </span>
                      )}
                      {blocked.length > 0 && (
                        <span className="text-[8.5px] uppercase tracking-[0.12em] flex items-center gap-1" style={{ color: 'var(--mel-warn)' }}>
                          <AlertTriangle size={8} />{blocked.length} sample{blocked.length > 1 ? 's' : ''} to clear
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-2.5 px-2">
                    <select
                      value={s.state}
                      onChange={e => editSong(s.id, { state: e.target.value as MelosSong['state'] })}
                      aria-label={`${s.title} state`}
                      className="text-[10px] font-bold uppercase tracking-[0.1em] rounded-md px-2 py-1"
                      style={{ background: `${stateMeta(s.state).color}1f`, color: stateMeta(s.state).color, border: 0 }}
                    >
                      {SONG_STATES.map(o => <option key={o.key} value={o.key} style={{ background: '#111', color: '#eee' }}>{o.label}</option>)}
                    </select>
                  </td>

                  <td className="py-2.5 px-2">
                    <select
                      value={s.commitment}
                      onChange={e => editSong(s.id, { commitment: e.target.value as Commitment })}
                      aria-label={`${s.title} commitment`}
                      className="text-[10px] font-bold uppercase tracking-[0.1em] rounded-md px-2 py-1"
                      style={{ background: `${commitmentMeta(s.commitment).color}1f`, color: commitmentMeta(s.commitment).color, border: 0 }}
                    >
                      {COMMITMENTS.map(o => <option key={o.key} value={o.key} style={{ background: '#111', color: '#eee' }}>{o.label}</option>)}
                    </select>
                  </td>

                  <td className="py-2.5 px-2">
                    <Hearts value={s.love} onChange={v => editSong(s.id, { love: v })} size={12} />
                  </td>

                  <td className="py-2.5 px-2 w-[110px]">
                    <div className="flex items-center gap-2">
                      <div className="h-[4px] rounded-full flex-1 overflow-hidden" style={{ background: 'var(--mel-hover)' }}>
                        <i className="block h-full rounded-full" style={{ width: `${s.confidence}%`, background: 'var(--mel-accent)' }} />
                      </div>
                      <span className="text-[10px] tabular-nums" style={{ color: 'var(--mel-faint)' }}>{s.confidence}</span>
                    </div>
                  </td>

                  <td className="py-2.5 px-2 text-[11.5px] tabular-nums" style={{ color: 'var(--mel-dim)' }}>
                    {fmtDuration(songDuration(s))}
                  </td>

                  <td className="py-2.5 px-2">
                    {s.trackRef?.url ? (
                      <span className="text-[10px] flex items-center gap-1.5" style={{ color: 'var(--mel-ok)' }}>
                        <Music4 size={11} />{s.trackRef.source.toLowerCase()}
                      </span>
                    ) : (
                      <span className="text-[10px] flex items-center gap-1.5" style={{ color: 'var(--mel-faint)' }}>
                        <Upload size={11} />none yet
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-2 text-right">
                    <button
                      onClick={() => { if (confirm(`Remove "${s.title}" from this production?`)) dropSong(s.id); }}
                      aria-label={`Remove ${s.title}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
                    ><Trash2 size={12} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        onClick={addSong}
        className="mt-5 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.16em]"
        style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: 0 }}
      ><Plus size={12} />Add a song</button>
    </div>
  );
};

export default TracklistRoom;
