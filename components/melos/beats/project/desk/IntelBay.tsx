// Music Intelligence — check and correct. Once the album is on Chora its analysis runs; here
// the artist reads what it heard, song by song, and fixes what it got wrong (key, tempo, meter,
// genre, mood, themes, the summary, section names, the liner note). Corrections are saved
// beside the analysis server-side, so a re-run keeps them, and can be copied down onto the
// songs' own metadata so the release, the CD and Chora all agree.

import React, { useEffect, useState } from 'react';
import { Brain, RefreshCw, Save, Check, Loader2, ArrowDownToLine } from 'lucide-react';
import { useMusicIntel } from '../../../../chora/musicIntel/useMusicIntel';
import { saveMusicIntelCorrections } from '../../../../../services/musicIntelService';
import type { TrackIntel, TrackIntelCorrections } from '../../../../../services/musicIntel/types';
import { metaOf } from '../../../../../services/melos/beats/releaseDesk';
import { Panel, Field, TagInput, inputCls, btnCls, SERIF, type BayProps } from './ui';

const draftOf = (t: TrackIntel): TrackIntelCorrections => ({
  summary: t.summary, genreTags: t.genreTags, moodPrimary: t.mood?.primary, moodSecondary: t.mood?.secondary,
  key: t.composition?.key, tempoBpm: t.composition?.tempoBpm, timeSignature: t.composition?.timeSignature,
  themes: t.lyrics?.themes, linerNote: t.linerNote,
  sectionLabels: Object.fromEntries((t.sections ?? []).map((s, i) => [String(i), s.label])),
});

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const IntelBay: React.FC<BayProps & { onLinkAlbum: (id: string) => void }> = ({ project, mutate, onLinkAlbum }) => {
  const albumId = project.desk?.publish?.choraAlbumId;
  const { bundle, loading, run } = useMusicIntel(albumId, !!albumId);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<TrackIntelCorrections | null>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [linkId, setLinkId] = useState('');

  const entries = Object.entries(bundle?.tracks ?? {}) as [string, TrackIntel][];
  const current = entries.find(([id]) => id === sel)?.[1] ?? entries[0]?.[1];
  const currentId = entries.find(([id]) => id === sel)?.[0] ?? entries[0]?.[0];
  useEffect(() => { if (current) { setDraft(draftOf(current)); setSaving('idle'); } }, [currentId, bundle]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!albumId || !currentId || !draft) return;
    setSaving('saving');
    setSaving((await saveMusicIntelCorrections(albumId, currentId, draft)) ? 'saved' : 'failed');
  };

  /** Copy the corrected read onto the matching song's own metadata (matched by title). */
  const copyDown = () => {
    if (!current || !draft) return;
    mutate((p) => {
      const t = p.tracks.find((x) => x.title.trim().toLowerCase() === current.title.trim().toLowerCase());
      if (!t) return;
      const m = metaOf(t);
      if (draft.tempoBpm) m.bpm = draft.tempoBpm;
      if (draft.key) m.key = draft.key;
      if (draft.genreTags?.[0] && !m.genre) m.genre = draft.genreTags[0];
      const moods = [draft.moodPrimary, ...(draft.moodSecondary ?? [])].filter(Boolean) as string[];
      if (moods.length) m.moods = Array.from(new Set([...(m.moods ?? []), ...moods])).slice(0, 12);
    });
  };

  if (!albumId) {
    return (
      <Panel title="Music Intelligence" hint="The analysis runs on the published album. Publish from the Publish bay, or link a release you already put out.">
        <p className="text-[12px] text-white/50" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>Not on Chora yet — nothing to analyse.</p>
        <div className="flex gap-1.5 mt-2 max-w-md">
          <input className={inputCls} placeholder="Chora album id" value={linkId} onChange={(e) => setLinkId(e.target.value.trim())} />
          <button className={btnCls} disabled={!linkId} onClick={() => onLinkAlbum(linkId)}>Link</button>
        </div>
      </Panel>
    );
  }

  const status = bundle?.job?.status;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-4">
      <Panel title="Songs" right={
        <button onClick={() => run(entries.length > 0)} className="text-white/45 hover:text-white flex items-center gap-1 text-[9.5px]" title={entries.length ? 'Re-run the analysis (your corrections are kept)' : 'Run the analysis'}>
          <RefreshCw size={10} /> {entries.length ? 'Re-run' : 'Run'}
        </button>
      }>
        <div className="text-[10px] font-mono text-white/40 mb-2 flex items-center gap-1">
          {loading && <Loader2 size={10} className="animate-spin" />} {status ? `analysis ${status.toLowerCase()}` : loading ? 'loading…' : 'not started'}
        </div>
        <div className="space-y-1">
          {entries.map(([id, t]) => (
            <button key={id} onClick={() => setSel(id)} className="w-full text-left h-8 px-2 rounded-lg text-[11px] truncate border"
              style={id === currentId ? { color: '#fff', borderColor: '#D40055', background: 'rgba(212,0,85,0.14)' } : { color: 'rgba(255,255,255,0.6)', borderColor: 'transparent' }}>
              {t.title}
            </button>
          ))}
          {!entries.length && !loading && <p className="text-[11px] text-white/35">No reads yet. Run the analysis — it listens to every song.</p>}
        </div>
      </Panel>

      {current && draft && (
        <Panel title={`${current.title} · What it heard`} right={
          <div className="flex items-center gap-1.5">
            <button className={btnCls} onClick={copyDown} title="Copy BPM, key, genre and moods onto this song's metadata"><ArrowDownToLine size={11} /> To song metadata</button>
            <button className={btnCls} onClick={() => { void save(); }} disabled={saving === 'saving'} style={{ borderColor: 'rgba(6,214,160,0.5)', color: '#06D6A0' }}>
              {saving === 'saving' ? <Loader2 size={11} className="animate-spin" /> : saving === 'saved' ? <Check size={11} /> : <Save size={11} />}
              {saving === 'saved' ? 'Saved' : saving === 'failed' ? 'Retry save' : 'Save corrections'}
            </button>
          </div>
        }>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Key"><input className={inputCls} value={draft.key ?? ''} onChange={(e) => setDraft({ ...draft, key: e.target.value })} /></Field>
            <Field label="Tempo (BPM)"><input className={inputCls} type="number" value={draft.tempoBpm ?? ''} onChange={(e) => setDraft({ ...draft, tempoBpm: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
            <Field label="Time signature"><input className={inputCls} value={draft.timeSignature ?? ''} placeholder="4/4" onChange={(e) => setDraft({ ...draft, timeSignature: e.target.value })} /></Field>
            <Field label="Primary mood"><input className={inputCls} value={draft.moodPrimary ?? ''} onChange={(e) => setDraft({ ...draft, moodPrimary: e.target.value })} /></Field>
          </div>
          <Field label="Genres" className="mt-2"><TagInput value={draft.genreTags ?? []} onChange={(v) => setDraft({ ...draft, genreTags: v })} /></Field>
          <Field label="Secondary moods" className="mt-2"><TagInput value={draft.moodSecondary ?? []} onChange={(v) => setDraft({ ...draft, moodSecondary: v })} /></Field>
          <Field label="Lyric themes" className="mt-2"><TagInput value={draft.themes ?? []} onChange={(v) => setDraft({ ...draft, themes: v })} /></Field>
          <Field label="Summary" className="mt-2"><textarea className={`${inputCls} h-auto min-h-[70px] py-2 resize-y`} value={draft.summary ?? ''} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} /></Field>
          <Field label="Liner note" className="mt-2"><textarea className={`${inputCls} h-auto min-h-[54px] py-2 resize-y`} value={draft.linerNote ?? ''} onChange={(e) => setDraft({ ...draft, linerNote: e.target.value })} /></Field>
          {(current.sections ?? []).length > 0 && (
            <div className="mt-3">
              <span className="text-[8.5px] font-extrabold uppercase tracking-[0.14em] text-white/35">Sections</span>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {current.sections.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="font-mono text-[9.5px] text-white/35 w-[74px] flex-none">{fmt(s.startSec)}–{fmt(s.endSec)}</span>
                    <input className={inputCls} value={draft.sectionLabels?.[String(i)] ?? s.label} onChange={(e) => setDraft({ ...draft, sectionLabels: { ...(draft.sectionLabels ?? {}), [String(i)]: e.target.value } })} aria-label={`Section ${i + 1} label`} />
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="mt-3 text-[9.5px] text-white/30 flex items-center gap-1"><Brain size={10} /> Corrections are stored beside the analysis — re-running it keeps them.</p>
        </Panel>
      )}
    </div>
  );
};
