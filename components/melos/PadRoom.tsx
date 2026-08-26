/**
 * Melos › Pad — the writing room. Paper tier.
 *
 * Lyrics are typed blocks, never a text blob. That is the whole reason this room
 * can do what a Notes app can't: drag a chorus above a verse, lock the hook so it
 * can't move, duplicate a verse and rewrite one line.
 *
 * NOTE: "Pad" here means the WRITING pad. The Beats room's 4×4 grid is a
 * different thing entirely — don't conflate them.
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  Plus, GripVertical, Lock, Unlock, Copy, Trash2, Check, ChevronDown, LayoutPanelTop,
} from 'lucide-react';
import { useMelos, Label, Hearts } from './MelosWorkspace';
import {
  LyricBlock, BlockKind, BLOCK_KINDS, blockMeta, SONG_STATES, COMMITMENTS,
  stateMeta, commitmentMeta, moveBlock, duplicateBlock, autoLabelBlocks,
  syllables, uid, suggestConfidence,
} from '../../services/melosService';
import { openMelosSongInTela } from '../../services/telaDomainAdapters';
import { auth } from '../../services/firebase';

const PadRoom: React.FC = () => {
  const {
    prodId, songs, selectedSong, selectedSongId, selectSong, editSong, addSong,
  } = useMelos();

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [kindMenu, setKindMenu] = useState<string | null>(null);
  const [openingTela, setOpeningTela] = useState(false);
  const draftRef = useRef<Record<string, string>>({});

  const shelved = useMemo(
    () => songs.filter(s => s.commitment === 'SHELVED' || s.commitment === 'CUT'),
    [songs],
  );
  const active = useMemo(
    () => songs.filter(s => s.commitment !== 'SHELVED' && s.commitment !== 'CUT'),
    [songs],
  );

  if (!selectedSong) {
    return (
      <div className="h-full flex items-center justify-center p-10 text-center">
        <div>
          <p className="text-sm m-0" style={{ color: 'var(--mel-dim)' }}>Nothing here yet.</p>
          <button
            onClick={addSong}
            className="mt-4 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
          >Start the first song</button>
        </div>
      </div>
    );
  }

  const song = selectedSong;
  const blocks = song.lyrics || [];

  const writeBlocks = (next: LyricBlock[]) =>
    editSong(song.id, { lyrics: next, updatedAt: Date.now() });

  const addBlock = (kind: BlockKind = 'VERSE') =>
    writeBlocks([...blocks, { id: uid('lb'), kind, lines: [''] }]);

  const setBlock = (id: string, patch: Partial<LyricBlock>) =>
    writeBlocks(blocks.map(b => (b.id === id ? { ...b, ...patch } : b)));

  const dropBlock = (id: string) => writeBlocks(blocks.filter(b => b.id !== id));

  const onDrop = (to: number) => {
    if (dragIdx === null) return;
    writeBlocks(moveBlock(blocks, dragIdx, to));
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <div className="h-full grid" style={{ gridTemplateColumns: 'minmax(0,224px) minmax(0,1fr) minmax(0,236px)' }}>

      {/* ── Song rail ──────────────────────────────────────────────────────── */}
      <aside className="melos-rail border-r overflow-y-auto p-4 flex flex-col gap-1">
        <Label className="mb-2">Songs · {active.length}</Label>
        {active.map(s => {
          const on = s.id === selectedSongId;
          return (
            <button
              key={s.id}
              onClick={() => selectSong(s.id)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-left transition-colors w-full"
              style={{
                background: on ? 'var(--mel-hover)' : 'transparent',
                boxShadow: on ? 'inset 2px 0 0 var(--mel-accent)' : 'none',
                border: 0,
              }}
            >
              <i className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: stateMeta(s.state).color }} />
              <span
                className="text-[12.5px] flex-1 truncate"
                style={{ color: 'var(--mel-ink)', fontWeight: on ? 650 : 500 }}
              >{s.title}</span>
              <span className="text-[8.5px] tracking-[0.5px] shrink-0" style={{ color: 'var(--mel-faint)' }}>
                {'●'.repeat(s.love)}{'○'.repeat(5 - s.love)}
              </span>
            </button>
          );
        })}

        {shelved.length > 0 && (
          <>
            <Label className="mt-4 mb-1">Shelved · {shelved.length}</Label>
            {shelved.map(s => (
              <button
                key={s.id}
                onClick={() => selectSong(s.id)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-left w-full opacity-60"
                style={{ background: s.id === selectedSongId ? 'var(--mel-hover)' : 'transparent', border: 0 }}
              >
                <i className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: commitmentMeta(s.commitment).color }} />
                <span className="text-[12.5px] flex-1 truncate" style={{ color: 'var(--mel-dim)' }}>{s.title}</span>
              </button>
            ))}
          </>
        )}
      </aside>

      {/* ── The pad ────────────────────────────────────────────────────────── */}
      <main className="overflow-y-auto px-7 py-6 flex flex-col gap-4">
        <div className="flex items-end gap-3 flex-wrap">
          <input
            value={song.title}
            onChange={e => editSong(song.id, { title: e.target.value })}
            aria-label="Song title"
            className="text-[27px] font-semibold tracking-tight bg-transparent border-0 outline-none min-w-0"
            style={{ color: 'var(--mel-ink)' }}
          />
          {song.workingTitle && (
            <span className="melos-hand text-[17px]">— was "{song.workingTitle}"</span>
          )}
          {song.lyricsLockedAt && (
            <span
              className="text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-full"
              style={{ background: 'var(--mel-ok)22', color: 'var(--mel-ok)' }}
            >
              <Check size={9} className="inline -mt-[1px] mr-1" />Lyrics locked
            </span>
          )}
          <button
            disabled={openingTela}
            onClick={async () => { setOpeningTela(true); try { await openMelosSongInTela(prodId, song, songs, auth.currentUser?.uid || 'local'); } finally { setOpeningTela(false); } }}
            className="ml-auto h-8 px-3 rounded-[10px] text-[9px] font-extrabold uppercase tracking-[.12em] flex items-center gap-1.5"
            style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', color: '#fff', border: 0 }}
            title="Open the live lyrics, tracklist and song notebook as bidirectional Tela components"
          ><LayoutPanelTop size={12}/>{openingTela ? 'Opening…' : 'Open in Tela'}</button>
        </div>

        {/* Lyric blocks */}
        <div className="flex flex-col gap-2.5" style={{ maxWidth: '54ch' }}>
          {blocks.map((b, i) => {
            const meta = blockMeta(b.kind);
            const isOver = overIdx === i && dragIdx !== null && dragIdx !== i;
            const text = draftRef.current[b.id] ?? b.lines.join('\n');
            return (
              <div
                key={b.id}
                draggable={!b.locked}
                onDragStart={() => setDragIdx(i)}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                onDragOver={e => { e.preventDefault(); setOverIdx(i); }}
                onDrop={e => { e.preventDefault(); onDrop(i); }}
                className={`melos-sheet px-4 pt-3 pb-3.5 ${dragIdx === i ? 'melos-sheet--drag' : ''} ${b.locked ? 'melos-sheet--locked' : ''}`}
                style={isOver ? { outline: '1.5px solid var(--mel-accent)', outlineOffset: 3 } : undefined}
              >
                <div className="flex items-center gap-2 mb-1.5 relative">
                  <button
                    onClick={() => setKindMenu(kindMenu === b.id ? null : b.id)}
                    className="text-[8.5px] font-extrabold uppercase tracking-[0.2em] px-[7px] py-[2.5px] rounded-full flex items-center gap-1"
                    style={{ background: `${meta.color}22`, color: meta.color, border: 0 }}
                  >
                    {b.label || meta.label}<ChevronDown size={8} />
                  </button>

                  {kindMenu === b.id && (
                    <div
                      className="absolute top-7 left-0 z-20 rounded-xl p-1.5 flex flex-col gap-0.5 min-w-[128px]"
                      style={{ background: 'var(--mel-rail)', border: '1px solid var(--mel-edge)', boxShadow: '0 16px 34px -12px rgba(0,0,0,.8)' }}
                    >
                      {BLOCK_KINDS.map(k => (
                        <button
                          key={k.key}
                          onClick={() => { setBlock(b.id, { kind: k.key, label: undefined }); setKindMenu(null); }}
                          className="text-left text-[11px] px-2.5 py-1.5 rounded-lg"
                          style={{ color: k.color, background: 'transparent', border: 0 }}
                        >{k.label}</button>
                      ))}
                    </div>
                  )}

                  <div className="flex-1" />

                  <button onClick={() => setBlock(b.id, { locked: !b.locked })}
                    title={b.locked ? 'Unlock' : 'Lock this block'}
                    style={{ background: 'none', border: 0, color: b.locked ? 'var(--mel-accent)' : 'var(--mel-faint)' }}>
                    {b.locked ? <Lock size={11} /> : <Unlock size={11} />}
                  </button>
                  <button onClick={() => writeBlocks(duplicateBlock(blocks, i))} title="Duplicate"
                    style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}>
                    <Copy size={11} />
                  </button>
                  <button onClick={() => dropBlock(b.id)} title="Delete block"
                    style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}>
                    <Trash2 size={11} />
                  </button>
                  {!b.locked && <GripVertical size={12} style={{ color: 'var(--mel-faint)', cursor: 'grab' }} />}
                </div>

                <textarea
                  value={text}
                  readOnly={!!b.locked}
                  rows={Math.max(2, b.lines.length)}
                  onChange={e => {
                    draftRef.current[b.id] = e.target.value;
                    setBlock(b.id, { lines: e.target.value.split('\n') });
                  }}
                  aria-label={`${b.label || meta.label} lyrics`}
                  className="w-full bg-transparent border-0 outline-none resize-none text-[13.5px] leading-[1.72]"
                  style={{ color: 'var(--mel-ink)', fontFamily: 'var(--font-body, Inter, sans-serif)' }}
                />

                {/* Meter hint — the kind of thing you want in the margin, not the body. */}
                <div className="flex gap-2 flex-wrap mt-1">
                  {b.lines.filter(l => l.trim()).map((l, li) => (
                    <span key={li} className="text-[8.5px] tabular-nums" style={{ color: 'var(--mel-faint)' }}>
                      {syllables(l)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => addBlock('VERSE')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.16em]"
              style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: 0 }}
            ><Plus size={11} />Block</button>
            <button
              onClick={() => writeBlocks(autoLabelBlocks(blocks))}
              className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.16em]"
              style={{ background: 'transparent', color: 'var(--mel-faint)', border: '1px solid var(--mel-edge)' }}
            >Renumber</button>
          </div>
        </div>

        {/* Diary entry — flows straight into Notebook view. */}
        <div className="mt-3" style={{ maxWidth: '54ch' }}>
          <Label className="mb-2">From the notebook</Label>
          <textarea
            value={song.notes || ''}
            onChange={e => editSong(song.id, { notes: e.target.value })}
            placeholder="What happened while you made this one…"
            rows={3}
            aria-label="Diary entry"
            className="w-full bg-transparent outline-none resize-none text-[15px] leading-[1.6] melos-hand"
            style={{ border: '1px dashed var(--mel-edge)', borderRadius: 'var(--mel-r-md)', padding: '12px 14px', transform: 'none' }}
          />
        </div>
      </main>

      {/* ── Meta ───────────────────────────────────────────────────────────── */}
      <aside className="melos-rail border-l overflow-y-auto p-4 flex flex-col gap-5">
        <div>
          <Label className="mb-2">Commitment</Label>
          <div className="flex flex-col gap-1">
            {COMMITMENTS.map(c => {
              const on = song.commitment === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => editSong(song.id, { commitment: c.key })}
                  title={c.hint}
                  className="text-left px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] transition-colors"
                  style={{
                    background: on ? `${c.color}26` : 'transparent',
                    color: on ? c.color : 'var(--mel-faint)',
                    border: 0,
                  }}
                >{c.label}</button>
              );
            })}
          </div>
        </div>

        <div>
          <Label className="mb-2">Where it's at</Label>
          <div className="flex flex-wrap gap-1">
            {SONG_STATES.map(s => {
              const on = song.state === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => editSong(song.id, { state: s.key })}
                  title={s.hint}
                  className="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-[0.1em]"
                  style={{
                    background: on ? `${s.color}26` : 'transparent',
                    color: on ? s.color : 'var(--mel-faint)',
                    border: `1px solid ${on ? `${s.color}55` : 'var(--mel-edge)'}`,
                  }}
                >{s.label}</button>
              );
            })}
          </div>
        </div>

        <div>
          <Label className="mb-2">How much I love it</Label>
          <Hearts value={song.love} onChange={v => editSong(song.id, { love: v })} />
          <p className="text-[9.5px] mt-1.5 m-0" style={{ color: 'var(--mel-faint)' }}>
            For this record — not a quality score.
          </p>
        </div>

        <div>
          <Label className="mb-2">Confidence · {song.confidence}%</Label>
          <input
            type="range" min={0} max={100} value={song.confidence}
            onChange={e => editSong(song.id, { confidence: Number(e.target.value) })}
            aria-label="Confidence this makes the record"
            className="w-full"
            style={{ accentColor: 'var(--mel-accent)' }}
          />
          {(() => {
            const sug = suggestConfidence(song);
            if (Math.abs(sug - song.confidence) < 8) return null;
            return (
              <button
                onClick={() => editSong(song.id, { confidence: sug })}
                className="text-[9.5px] mt-1"
                style={{ color: 'var(--mel-accent)', background: 'none', border: 0, padding: 0 }}
              >Signals suggest {sug}% — use it</button>
            );
          })()}
        </div>

        {song.feel && (
          <div>
            <Label className="mb-2">Feel · Breakdown</Label>
            {([
              ['Tempo', song.feel.bpm ? `${Math.round(song.feel.bpm)} BPM` : '—'],
              ['Key', song.feel.keySig || '—'],
              ['Form', song.feel.form || '—'],
              ['Energy', typeof song.feel.energy === 'number' ? song.feel.energy.toFixed(2) : '—'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between items-baseline py-[3.5px] text-[11.5px] border-b"
                style={{ color: 'var(--mel-dim)', borderColor: 'var(--mel-edge)' }}>
                <span>{k}</span>
                <b className="text-[12px] font-medium tabular-nums" style={{ color: 'var(--mel-ink)', fontFamily: 'var(--font-mono-tech, monospace)' }}>{v}</b>
              </div>
            ))}
            {typeof song.feel.energy === 'number' && (
              <div className="h-[5px] rounded-full mt-2 overflow-hidden" style={{ background: 'var(--mel-hover)' }}>
                <i className="block h-full rounded-full" style={{ width: `${song.feel.energy * 100}%`, background: 'var(--mel-accent)' }} />
              </div>
            )}
          </div>
        )}

        <div>
          <Label className="mb-2">Lyrics</Label>
          <button
            onClick={() => editSong(song.id, { lyricsLockedAt: song.lyricsLockedAt ? undefined : Date.now() })}
            className="w-full px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.14em]"
            style={
              song.lyricsLockedAt
                ? { background: 'transparent', color: 'var(--mel-faint)', border: '1px solid var(--mel-edge)' }
                : { background: 'var(--mel-accent)', color: '#12101A', border: 0 }
            }
          >{song.lyricsLockedAt ? 'Unlock lyrics' : 'Lock lyrics'}</button>
          <p className="text-[9.5px] mt-1.5 m-0 leading-snug" style={{ color: 'var(--mel-faint)' }}>
            Locking sets these as the song's words — they fill the album's lyrics box on publish.
          </p>
        </div>
      </aside>
    </div>
  );
};

export default PadRoom;
