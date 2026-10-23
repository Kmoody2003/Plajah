// Credits & Metadata — the sleeve, the subcode and the distributor sheet in one place.
// Album: title/artist/label/℗/©, UPC, release type, genres, moods, explicit, language, liner
// notes, bio, album credits. Per song: ISRC/ISWC, explicit, version, featuring, genre, moods,
// BPM/key, publisher, ℗/©, recording details, preview start, CD-Text, and the song's credits
// with roles, instruments, splits and PRO/IPI for writers.

import React, { useState } from 'react';
import { Plus, Trash2, Check, AlertTriangle, Copy } from 'lucide-react';
import {
  CREDIT_ROLES, deskOf, metaOf, deskUid, isValidIsrc, isValidUpc, formatIsrc,
  type Credit, type CreditCategory, type ExplicitFlag, type ReleaseType, type TrackMeta,
} from '../../../../../services/melos/beats/releaseDesk';
import { Panel, Field, TagInput, inputCls, selectCls, btnCls, type BayProps } from './ui';

const MOODS = ['Uplifting', 'Melancholy', 'Euphoric', 'Dark', 'Chill', 'Romantic', 'Aggressive', 'Dreamy', 'Nostalgic', 'Hopeful', 'Spiritual', 'Playful', 'Epic', 'Intimate'];
const GENRES = ['Hip-Hop', 'R&B', 'Pop', 'Rock', 'Electronic', 'House', 'Techno', 'Ambient', 'Jazz', 'Soul', 'Gospel', 'Worship', 'Country', 'Folk', 'Classical', 'Soundtrack', 'Latin', 'Afrobeats', 'Reggae', 'Metal', 'Indie', 'Lo-fi'];
const CATEGORIES: CreditCategory[] = ['artist', 'performer', 'writer', 'producer', 'engineer', 'artwork', 'management', 'other'];

export const CreditsEditor: React.FC<{ credits: Credit[]; onChange: (next: Credit[]) => void; showSplits?: boolean }> = ({ credits, onChange, showSplits = true }) => {
  const patch = (id: string, p: Partial<Credit>) => onChange(credits.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const writerSplit = credits.filter((c) => c.category === 'writer').reduce((a, c) => a + (c.splitPct ?? 0), 0);
  return (
    <div>
      <datalist id="desk-credit-roles">
        {Object.values(CREDIT_ROLES).flat().map((r) => <option key={r} value={r} />)}
      </datalist>
      <div className="space-y-1.5">
        {credits.map((c) => (
          <div key={c.id} className="grid grid-cols-[1.3fr_0.9fr_1.1fr_auto] gap-1.5 items-center">
            <input className={inputCls} value={c.name} placeholder="Name" onChange={(e) => patch(c.id, { name: e.target.value })} aria-label="Credit name" />
            <select className={selectCls} value={c.category} onChange={(e) => patch(c.id, { category: e.target.value as CreditCategory })} aria-label="Credit category">
              {CATEGORIES.map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
            </select>
            <input className={inputCls} value={c.role} list="desk-credit-roles" placeholder={CREDIT_ROLES[c.category][0]} onChange={(e) => patch(c.id, { role: e.target.value })} aria-label="Credit role" />
            <button onClick={() => onChange(credits.filter((x) => x.id !== c.id))} className="w-7 h-7 grid place-items-center text-white/30 hover:text-[#EF4444]" aria-label={`Remove ${c.name || 'credit'}`}><Trash2 size={12} /></button>
            {(c.category === 'performer' || (showSplits && (c.category === 'writer' || c.category === 'producer' || c.category === 'artist'))) && (
              <div className="col-span-4 grid grid-cols-4 gap-1.5 pl-2 border-l border-white/10 mb-1">
                {c.category === 'performer' && <input className={inputCls} value={c.instrument ?? ''} placeholder="Instrument" onChange={(e) => patch(c.id, { instrument: e.target.value })} />}
                {showSplits && c.category !== 'performer' && <input className={inputCls} type="number" min={0} max={100} step={0.5} value={c.splitPct ?? ''} placeholder="Split %" onChange={(e) => patch(c.id, { splitPct: e.target.value === '' ? undefined : Number(e.target.value) })} />}
                {c.category === 'writer' && <input className={inputCls} value={c.pro ?? ''} placeholder="PRO (ASCAP, BMI, PRS…)" onChange={(e) => patch(c.id, { pro: e.target.value })} />}
                {c.category === 'writer' && <input className={inputCls} value={c.ipi ?? ''} placeholder="IPI / CAE" onChange={(e) => patch(c.id, { ipi: e.target.value })} />}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={() => onChange([...credits, { id: deskUid(), name: '', role: '', category: 'performer' }])} className={btnCls}><Plus size={11} /> Add credit</button>
        {showSplits && writerSplit > 0 && (
          <span className="text-[10px] font-mono" style={{ color: Math.abs(writerSplit - 100) < 0.01 ? '#06D6A0' : '#F59E0B' }}>
            writer splits {writerSplit.toFixed(1)}%{Math.abs(writerSplit - 100) < 0.01 ? ' ✓' : ' (should total 100)'}
          </span>
        )}
      </div>
    </div>
  );
};

const IdBadge: React.FC<{ ok: boolean; empty: boolean }> = ({ ok, empty }) => (empty ? null : ok
  ? <Check size={11} className="text-[#06D6A0]" aria-label="Valid" />
  : <AlertTriangle size={11} className="text-[#F59E0B]" aria-label="Check format" />);

export const CreditsBay: React.FC<BayProps> = ({ project, mutate }) => {
  const [trackId, setTrackId] = useState<string | null>(project.tracks[0]?.id ?? null);
  const pub = project.publishing;
  const album = project.desk?.album ?? {};
  const setPub = (patch: Partial<typeof pub>) => mutate((p) => { Object.assign(p.publishing, patch); });
  const setAlbum = (fn: (a: NonNullable<ReturnType<typeof deskOf>['album']>) => void) => mutate((p) => { const d = deskOf(p); if (!d.album) d.album = {}; fn(d.album); });
  const track = project.tracks.find((t) => t.id === trackId) ?? project.tracks[0];
  const meta: TrackMeta = track?.meta ?? {};
  const setMeta = (fn: (m: TrackMeta) => void) => mutate((p) => { const t = p.tracks.find((x) => x.id === track?.id); if (t) fn(metaOf(t)); });

  /** Copy the album's ℗/© + genre + publisher onto every song that hasn't set its own. */
  const fillDown = () => mutate((p) => {
    for (const t of p.tracks) {
      const m = metaOf(t);
      if (!m.pLine && (album.pLine || p.publishing.copyright)) m.pLine = album.pLine || p.publishing.copyright;
      if (!m.cLine && album.cLine) m.cLine = album.cLine;
      if (!m.genre && (album.primaryGenre || p.publishing.genre)) m.genre = album.primaryGenre || p.publishing.genre;
      if (!m.explicit && album.explicit) m.explicit = album.explicit;
      if (!m.language && album.language) m.language = album.language;
    }
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* ── Album ── */}
      <div className="flex flex-col gap-4 min-w-0">
        <Panel title="Album" right={<button onClick={fillDown} className="text-[9.5px] text-white/45 hover:text-white flex items-center gap-1" title="Copy ℗/©, genre, explicit and language to every song that hasn't set its own"><Copy size={10} /> Fill down to songs</button>}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Title"><input className={inputCls} value={pub.title} onChange={(e) => setPub({ title: e.target.value })} /></Field>
            <Field label="Artist"><input className={inputCls} value={pub.artist} onChange={(e) => setPub({ artist: e.target.value })} /></Field>
            <Field label="Release type">
              <select className={selectCls} value={album.releaseType ?? ''} onChange={(e) => setAlbum((a) => { a.releaseType = (e.target.value || undefined) as ReleaseType | undefined; })}>
                <option value="">Auto (by track count)</option>
                <option value="ALBUM">Album</option><option value="EP">EP</option><option value="SINGLE">Single</option><option value="COMPILATION">Compilation</option>
              </select>
            </Field>
            <Field label="Label"><input className={inputCls} value={pub.label} onChange={(e) => setPub({ label: e.target.value })} /></Field>
            <Field label="Primary genre">
              <input className={inputCls} list="desk-genres" value={album.primaryGenre ?? pub.genre} onChange={(e) => { const v = e.target.value; setPub({ genre: v }); setAlbum((a) => { a.primaryGenre = v; }); }} />
            </Field>
            <Field label="Secondary genre"><input className={inputCls} list="desk-genres" value={album.secondaryGenre ?? ''} onChange={(e) => setAlbum((a) => { a.secondaryGenre = e.target.value; })} /></Field>
            <Field label="Release year"><input className={inputCls} value={pub.year} onChange={(e) => setPub({ year: e.target.value })} /></Field>
            <Field label="Original release date"><input type="date" className={inputCls} value={album.originalReleaseDate ?? ''} onChange={(e) => setAlbum((a) => { a.originalReleaseDate = e.target.value; })} /></Field>
            <Field label="℗ line (sound recording)"><input className={inputCls} placeholder={`℗ ${pub.year} ${pub.label || pub.artist}`} value={album.pLine ?? ''} onChange={(e) => setAlbum((a) => { a.pLine = e.target.value; })} /></Field>
            <Field label="© line (composition / artwork)"><input className={inputCls} value={pub.copyright} onChange={(e) => { const v = e.target.value; setPub({ copyright: v }); setAlbum((a) => { a.cLine = v; }); }} /></Field>
            <Field label={<span className="flex items-center gap-1">UPC / EAN <IdBadge ok={isValidUpc(album.upc)} empty={!album.upc} /></span>}>
              <input className={inputCls} inputMode="numeric" value={album.upc ?? ''} placeholder="12 or 13 digits" onChange={(e) => setAlbum((a) => { a.upc = e.target.value.replace(/[^\d]/g, '').slice(0, 13); })} />
            </Field>
            <Field label="Catalog number"><input className={inputCls} value={album.catalogNumber ?? ''} onChange={(e) => setAlbum((a) => { a.catalogNumber = e.target.value; })} /></Field>
            <Field label="Explicit">
              <select className={selectCls} value={album.explicit ?? 'none'} onChange={(e) => setAlbum((a) => { a.explicit = e.target.value as ExplicitFlag; })}>
                <option value="none">Not explicit</option><option value="explicit">Explicit</option><option value="clean">Clean version</option>
              </select>
            </Field>
            <Field label="Language"><input className={inputCls} placeholder="English" value={album.language ?? ''} onChange={(e) => setAlbum((a) => { a.language = e.target.value; })} /></Field>
            <Field label="Distributor"><input className={inputCls} value={album.distributor ?? ''} onChange={(e) => setAlbum((a) => { a.distributor = e.target.value; })} /></Field>
            <Field label="Recording year"><input className={inputCls} value={album.recordingYear ?? ''} onChange={(e) => setAlbum((a) => { a.recordingYear = e.target.value; })} /></Field>
          </div>
          <datalist id="desk-genres">{GENRES.map((g) => <option key={g} value={g} />)}</datalist>
          <Field label="Moods" className="mt-2"><TagInput value={album.moods ?? []} onChange={(v) => setAlbum((a) => { a.moods = v; })} suggestions={MOODS} placeholder="Add moods…" /></Field>
          <Field label="Tags" className="mt-2"><TagInput value={album.tags ?? []} onChange={(v) => setAlbum((a) => { a.tags = v; })} placeholder="Search tags…" /></Field>
          <Field label="Description" className="mt-2">
            <textarea className={`${inputCls} h-auto min-h-[54px] py-2 resize-y`} value={pub.description} onChange={(e) => setPub({ description: e.target.value })} />
          </Field>
          <Field label="Liner notes" className="mt-2">
            <textarea className={`${inputCls} h-auto min-h-[70px] py-2 resize-y`} value={album.linerNotes ?? ''} onChange={(e) => setAlbum((a) => { a.linerNotes = e.target.value; })} placeholder="The story of the record. Credits are appended automatically on publish." />
          </Field>
          <Field label="Artist bio" className="mt-2">
            <textarea className={`${inputCls} h-auto min-h-[54px] py-2 resize-y`} value={album.artistBio ?? ''} onChange={(e) => setAlbum((a) => { a.artistBio = e.target.value; })} />
          </Field>
        </Panel>
        <Panel title="Album credits" hint="Album-wide people — executive producer, mastering, art direction. Song credits are per track.">
          <CreditsEditor credits={album.credits ?? []} onChange={(next) => setAlbum((a) => { a.credits = next; })} />
        </Panel>
      </div>

      {/* ── Songs ── */}
      <div className="flex flex-col gap-4 min-w-0">
        <Panel title="Songs">
          {project.tracks.length === 0 ? (
            <p className="text-[11px] text-white/35">Add songs to the proof sheet first.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {project.tracks.map((t, i) => {
                const m = t.meta ?? {};
                const complete = !!m.isrc && !!(m.credits?.length);
                return (
                  <button
                    key={t.id}
                    onClick={() => setTrackId(t.id)}
                    className="h-7 px-2.5 rounded-lg text-[10.5px] border flex items-center gap-1.5"
                    style={t.id === track?.id ? { color: '#fff', borderColor: '#D40055', background: 'rgba(212,0,85,0.15)' } : { color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.1)' }}
                  >
                    <span className="font-mono text-white/35">{i + 1}</span>
                    <span className="max-w-[140px] truncate">{t.title}</span>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: complete ? '#06D6A0' : 'rgba(255,255,255,0.2)' }} />
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
        {track && (
          <>
            <Panel title={`${track.title} · Metadata`}>
              <div className="grid grid-cols-2 gap-2">
                <Field label={<span className="flex items-center gap-1">ISRC <IdBadge ok={isValidIsrc(meta.isrc)} empty={!meta.isrc} /></span>}>
                  <input className={`${inputCls} font-mono`} value={meta.isrc ?? ''} placeholder="CC-XXX-YY-NNNNN" onChange={(e) => setMeta((m) => { m.isrc = e.target.value.toUpperCase(); })} onBlur={() => setMeta((m) => { if (m.isrc) m.isrc = formatIsrc(m.isrc); })} />
                </Field>
                <Field label="ISWC"><input className={`${inputCls} font-mono`} value={meta.iswc ?? ''} placeholder="T-123.456.789-0" onChange={(e) => setMeta((m) => { m.iswc = e.target.value; })} /></Field>
                <Field label="Explicit">
                  <select className={selectCls} value={meta.explicit ?? 'none'} onChange={(e) => setMeta((m) => { m.explicit = e.target.value as ExplicitFlag; })}>
                    <option value="none">Not explicit</option><option value="explicit">Explicit</option><option value="clean">Clean version</option>
                  </select>
                </Field>
                <Field label="Version"><input className={inputCls} placeholder="Radio Edit, Acoustic, Live…" value={meta.version ?? ''} onChange={(e) => setMeta((m) => { m.version = e.target.value; })} /></Field>
                <Field label="Featuring"><input className={inputCls} value={meta.featuring ?? ''} onChange={(e) => setMeta((m) => { m.featuring = e.target.value; })} /></Field>
                <Field label="Genre"><input className={inputCls} list="desk-genres" value={meta.genre ?? ''} onChange={(e) => setMeta((m) => { m.genre = e.target.value; })} /></Field>
                <Field label="BPM"><input className={inputCls} type="number" value={meta.bpm ?? ''} onChange={(e) => setMeta((m) => { m.bpm = e.target.value === '' ? undefined : Number(e.target.value); })} /></Field>
                <Field label="Key"><input className={inputCls} placeholder="A minor" value={meta.key ?? ''} onChange={(e) => setMeta((m) => { m.key = e.target.value; })} /></Field>
                <Field label="Publisher"><input className={inputCls} value={meta.publisher ?? ''} onChange={(e) => setMeta((m) => { m.publisher = e.target.value; })} /></Field>
                <Field label="Language"><input className={inputCls} value={meta.language ?? ''} onChange={(e) => setMeta((m) => { m.language = e.target.value; })} /></Field>
                <Field label="℗ line"><input className={inputCls} value={meta.pLine ?? ''} placeholder={album.pLine || ''} onChange={(e) => setMeta((m) => { m.pLine = e.target.value; })} /></Field>
                <Field label="© line"><input className={inputCls} value={meta.cLine ?? ''} placeholder={album.cLine || pub.copyright || ''} onChange={(e) => setMeta((m) => { m.cLine = e.target.value; })} /></Field>
                <Field label="Recorded at"><input className={inputCls} value={meta.recordedAt ?? ''} onChange={(e) => setMeta((m) => { m.recordedAt = e.target.value; })} /></Field>
                <Field label="Recorded on"><input type="date" className={inputCls} value={meta.recordedOn ?? ''} onChange={(e) => setMeta((m) => { m.recordedOn = e.target.value; })} /></Field>
                <Field label="Preview starts at (s)"><input className={inputCls} type="number" min={0} value={meta.previewStartSec ?? ''} onChange={(e) => setMeta((m) => { m.previewStartSec = e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)); })} /></Field>
                <Field label="Focus track">
                  <select className={selectCls} value={meta.focusTrack ? 'yes' : 'no'} onChange={(e) => setMeta((m) => { m.focusTrack = e.target.value === 'yes'; })}>
                    <option value="no">No</option><option value="yes">Yes — lead single</option>
                  </select>
                </Field>
              </div>
              <Field label="Moods" className="mt-2"><TagInput value={meta.moods ?? []} onChange={(v) => setMeta((m) => { m.moods = v; })} suggestions={MOODS} /></Field>
              <details className="mt-2">
                <summary className="text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-white/35 cursor-pointer">CD-Text overrides</summary>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {(['title', 'performer', 'songwriter', 'composer', 'arranger', 'message'] as const).map((k) => (
                    <Field key={k} label={k}>
                      <input className={inputCls} value={meta.cdText?.[k] ?? ''} onChange={(e) => setMeta((m) => { m.cdText = { ...(m.cdText ?? {}), [k]: e.target.value }; })} />
                    </Field>
                  ))}
                </div>
              </details>
              <Field label="Notes" className="mt-2"><textarea className={`${inputCls} h-auto min-h-[44px] py-2 resize-y`} value={meta.notes ?? ''} onChange={(e) => setMeta((m) => { m.notes = e.target.value; })} /></Field>
            </Panel>
            <Panel title={`${track.title} · Credits`}>
              <CreditsEditor credits={meta.credits ?? []} onChange={(next) => setMeta((m) => { m.credits = next; })} />
            </Panel>
          </>
        )}
      </div>
    </div>
  );
};
