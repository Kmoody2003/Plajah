// The composer council panel — select a region, say how it should feel, pick the parts, and the
// council writes notation for them on the user's own machine (localCouncil.ts): rules for bass /
// harmony / pads / arps, an on-device model (Gemma 4 / Qwen) or the studio's local score models for
// melodies, and a critic that repairs and reviews the take. It reads every track in and around the
// region and the song's lyrics. Each run is a take (A, B, C…) you can read and apply to the timeline.
// Applying is one undo step; a rewrite never overwrites: it lands on a take track under the original.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Loader2, Plus, Trash2, Check, ChevronDown, ChevronRight, Feather } from 'lucide-react';
import type { GrooveDoc, ArrangeTrack } from '../../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../../services/melos/beats/grooveDoc';
import { addInstrument } from '../../../../services/melos/beats/instrumentFactory';
import { songTime } from '../../../../services/melos/beats/tempoMap';
import { noteOccurrences } from '../../../../services/melos/beats/clipContent';
import {
  buildComposeContext, composableTracks, guessRole, PART_ROLES, syllables,
  type ComposeTarget, type CtxNote, type PartRole,
} from '../../../../services/melos/beats/council/composeContext';
import { applyComposition, regionLabel } from '../../../../services/melos/beats/council/composeCouncil';
import { composeLocally, downloadDesktopModel, writerLanes, type LaneStatus, type LocalTake, type WriterLane } from '../../../../services/melos/beats/council/localCouncil';
import { councilModel } from '../../../../services/melos/beats/council/councilModel';

interface Take extends LocalTake {
  label: string;
  description: string;
  context: ReturnType<typeof buildComposeContext>;
  applied?: boolean;
}

const LANE_KEY = 'melos:council:writer';

interface Props {
  doc: GrooveDoc;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  startBeats: number;
  endBeats: number;
  initialDescription?: string;
  onClose: () => void;
}

const ROLE_LABEL: Record<PartRole, string> = {
  melody: 'Melody', 'counter-melody': 'Counter-melody', harmony: 'Harmony', bass: 'Bass', pad: 'Pad', arp: 'Arp', fill: 'Fill',
};
const ACCENT = '#8B5CFF';

export const CouncilComposerPanel: React.FC<Props> = ({ doc, onMutate, startBeats, endBeats, initialDescription, onClose }) => {
  const [description, setDescription] = useState(initialDescription ?? '');
  const [newRoles, setNewRoles] = useState<PartRole[]>(['melody']);
  const [rewrite, setRewrite] = useState<Record<string, PartRole>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [takes, setTakes] = useState<Take[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [showLyrics, setShowLyrics] = useState(() => !!doc.lyrics?.length);
  const op = useRef<AbortController | null>(null);
  const [lanes, setLanes] = useState<LaneStatus[]>([]);
  // Only a deliberate choice of a lighter writer (studio / rules) is remembered; otherwise the best
  // writer this machine has wins — the desktop app's GPU first, the browser's workaround after.
  const [lane, setLane] = useState<WriterLane>('rules');
  const [downloading, setDownloading] = useState<string>('');
  const refreshLanes = (signal?: AbortSignal) => writerLanes(signal).then((ls) => {
    setLanes(ls);
    let saved = '';
    try { saved = localStorage.getItem(LANE_KEY) ?? ''; } catch { /* */ }
    const pinned = ls.find((l) => l.lane === saved && (saved === 'studio' || saved === 'rules') && l.available);
    setLane((pinned ?? ls.find((l) => l.available)!).lane);
  });
  useEffect(() => {
    const ctrl = new AbortController();
    void refreshLanes(ctrl.signal);
    return () => ctrl.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const downloadModel = async (key: string, label: string) => {
    setDownloading(`Downloading ${label}…`);
    try {
      const r = await downloadDesktopModel(key, (done, total) => setDownloading(`Downloading ${label} — ${Math.floor((done / Math.max(1, total)) * 100)}% of ${(total / 1e9).toFixed(1)} GB`));
      if (!r.success) throw new Error(r.error || 'download failed');
      setDownloading('');
      await refreshLanes();
    } catch (e) {
      setDownloading(`${label} didn't download: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };
  // Closing the council gives the on-device model's memory back to the studio.
  useEffect(() => () => { op.current?.abort(); councilModel.release(); }, []);
  const pickLane = (l: WriterLane) => { setLane(l); try { localStorage.setItem(LANE_KEY, l); } catch { /* */ } };

  const tracks = composableTracks(doc);
  const region = regionLabel(doc, startBeats, endBeats);
  const trackRole = (t: ArrangeTrack): PartRole => {
    const notes: CtxNote[] = t.clips.flatMap((c) => noteOccurrences(c).map((o) => [o.songBeat, o.lengthBeats, o.note.key, o.note.vel] as CtxNote));
    return guessRole(t.name || '', notes) ?? 'melody';
  };
  const targets: ComposeTarget[] = [
    ...Object.entries(rewrite).filter(([id]) => tracks.some((t) => t.id === id)).map(([trackId, role]) => ({ trackId, role })),
    ...newRoles.map((role) => ({ role })),
  ];
  // Not memoized: the doc is edited in place, so its identity doesn't change when lyrics do.
  const regionLyrics = (() => {
    const { meter } = songTime(doc);
    const a = meter.at(startBeats).bar, b = meter.at(Math.max(startBeats, endBeats - 1e-6)).bar;
    return (doc.lyrics ?? []).filter((l) => l.bar >= a && l.bar <= b);
  })();

  const compose = async () => {
    if (busy || !targets.length) return;
    setBusy(true); setError(''); setProgress([]);
    const ctrl = new AbortController();
    op.current = ctrl;
    // Download progress updates its own line instead of adding one per step.
    const say = (s: string) => setProgress((p) => (/^Getting .* ready — /.test(s) && /^Getting .* ready — /.test(p[p.length - 1] ?? '') ? [...p.slice(0, -1), s] : [...p, s]));
    try {
      const context = buildComposeContext(doc, { description, startBeats, endBeats, targets });
      say(`The council is reading ${context.tracks.length} track${context.tracks.length === 1 ? '' : 's'}${context.lyrics.length ? ` and ${context.lyrics.length} lyric lines` : ''}…`);
      const result = await composeLocally(context, lane, { signal: ctrl.signal, onProgress: say });
      const label = String.fromCharCode(65 + (takes.length % 26));
      setTakes((t) => [...t, { label, description, context, ...result }]);
      say(`Take ${label} is ready.`);
      setOpen(takes.length);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'The council could not compose this');
    } finally {
      setBusy(false); op.current = null;
    }
  };

  const apply = (i: number) => {
    const take = takes[i];
    onMutate((d) => {
      applyComposition(d, take.context, take.composition, {
        uid: grooveUid,
        takeLabel: take.label,
        engineTag: take.engineTag,
        createTrack: (doc2, instrument, name, after) => {
          const id = addInstrument(doc2, instrument);
          const idx = doc2.arrangement.findIndex((t) => t.id === id);
          const track = doc2.arrangement[idx];
          track.name = name;
          track.armed = false;
          if (after) {
            doc2.arrangement.splice(idx, 1);
            doc2.arrangement.splice(doc2.arrangement.findIndex((t) => t.id === after.id) + 1, 0, track);
          }
          return track;
        },
      });
    });
    setTakes((t) => t.map((x, k) => (k === i ? { ...x, applied: true } : x)));
  };

  // ── lyrics ────────────────────────────────────────────────────────────────
  const [paste, setPaste] = useState('');
  const [everyBars, setEveryBars] = useState(2);
  const startBar = songTime(doc).meter.at(startBeats).bar;
  const placeLyrics = () => {
    const lines = paste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    onMutate((d) => {
      const rest = (d.lyrics ?? []).filter((l) => l.bar < startBar || l.bar >= startBar + lines.length * everyBars);
      d.lyrics = [...rest, ...lines.map((text, i) => ({ id: grooveUid(), bar: startBar + i * everyBars, text }))].sort((a, b) => a.bar - b.bar);
    });
    setPaste('');
  };
  const editLine = (id: string, fn: (l: { bar: number; text: string }) => void) => onMutate((d) => {
    const l = d.lyrics?.find((x) => x.id === id); if (l) fn(l);
    d.lyrics?.sort((a, b) => a.bar - b.bar);
  });

  const field = 'bg-black/40 border border-white/12 rounded-lg text-[11px] text-white outline-none focus:border-[#8B5CFF]/70';

  // Portalled: the timeline's glass panels are containing blocks that would clip a fixed drawer.
  return createPortal(
    <div className="fixed right-4 top-24 bottom-4 z-[140] w-[400px] max-w-[calc(100vw-32px)] flex flex-col rounded-2xl border border-white/12 bg-[#120C1C]/96 backdrop-blur-xl shadow-2xl text-white" role="dialog" aria-label="Composer council">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/8">
        <Feather size={14} style={{ color: ACCENT }} />
        <span className="text-[12px] font-semibold">Composer council</span>
        <span className="text-[10.5px] text-white/45">· {region}</span>
        <span className="flex-1" />
        <button onClick={onClose} className="w-6 h-6 grid place-items-center rounded-md text-white/40 hover:text-white" aria-label="Close composer council"><X size={13} /></button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/40 font-semibold">How should it feel?</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={4000}
            placeholder="e.g. hopeful but held back, like light through a cold window — lift on the last line"
            className={`${field} px-2.5 py-2 resize-none leading-snug`} />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/40 font-semibold">New parts</span>
          <div className="flex flex-wrap gap-1">
            {PART_ROLES.map((r) => {
              const on = newRoles.includes(r);
              return (
                <button key={r} aria-pressed={on} onClick={() => setNewRoles((v) => (on ? v.filter((x) => x !== r) : [...v, r]))}
                  className={`h-6 px-2 rounded-md border text-[10.5px] ${on ? 'border-[#8B5CFF] bg-[#8B5CFF]/20 text-white' : 'border-white/12 text-white/50 hover:text-white'}`}>
                  {ROLE_LABEL[r]}
                </button>
              );
            })}
          </div>
        </div>

        {tracks.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.16em] text-white/40 font-semibold">Rewrite existing tracks</span>
            {tracks.map((t) => {
              const on = t.id in rewrite;
              return (
                <div key={t.id} className="flex items-center gap-2 text-[11px]">
                  <input type="checkbox" checked={on} aria-label={`Rewrite ${t.name}`}
                    onChange={() => setRewrite((m) => { const n = { ...m }; if (on) delete n[t.id]; else n[t.id] = trackRole(t); return n; })} />
                  <span className="w-[6px] h-[6px] rounded-full" style={{ background: t.color }} />
                  <span className="flex-1 truncate">{t.name || 'Untitled'}</span>
                  {on && (
                    <select value={rewrite[t.id]} onChange={(e) => setRewrite((m) => ({ ...m, [t.id]: e.target.value as PartRole }))}
                      className={`${field} h-6 px-1 text-[10.5px]`} aria-label={`Role for ${t.name}`}>
                      {PART_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <button onClick={() => setShowLyrics((v) => !v)} className="flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-white/40 font-semibold hover:text-white">
            {showLyrics ? <ChevronDown size={11} /> : <ChevronRight size={11} />} Lyrics
            <span className="normal-case tracking-normal font-normal text-white/35">— {doc.lyrics?.length ? `${doc.lyrics.length} lines, ${regionLyrics.length} in this region` : 'none yet'}</span>
          </button>
          {showLyrics && (
            <div className="flex flex-col gap-1.5">
              {(doc.lyrics ?? []).map((l) => (
                <div key={l.id} className="flex items-center gap-1.5">
                  <input type="number" min={1} value={l.bar + 1} aria-label="Bar"
                    onChange={(e) => { const v = Math.max(1, Math.round(Number(e.target.value) || 1)); editLine(l.id, (x) => { x.bar = v - 1; }); }}
                    className={`${field} w-12 h-6 px-1 text-center`} />
                  <input value={l.text} aria-label="Lyric line" onChange={(e) => { const v = e.target.value; editLine(l.id, (x) => { x.text = v; }); }}
                    className={`${field} flex-1 h-6 px-2`} />
                  <span className="text-[9.5px] text-white/30 w-6 text-right" title="Estimated syllables">{syllables(l.text)}</span>
                  <button onClick={() => onMutate((d) => { d.lyrics = d.lyrics?.filter((x) => x.id !== l.id); })} aria-label="Delete line" className="text-white/30 hover:text-white"><Trash2 size={11} /></button>
                </div>
              ))}
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder="Paste lyrics — one line per row"
                className={`${field} px-2.5 py-2 resize-none leading-snug`} />
              <div className="flex items-center gap-1.5 text-[10.5px] text-white/50">
                <span>Place from bar {startBar + 1}, one line every</span>
                <input type="number" min={1} max={16} value={everyBars} onChange={(e) => setEveryBars(Math.max(1, Math.min(16, Number(e.target.value) || 1)))}
                  className={`${field} w-10 h-6 px-1 text-center`} aria-label="Bars per line" />
                <span>bars</span>
                <span className="flex-1" />
                <button onClick={placeLyrics} disabled={!paste.trim()} className="h-6 px-2 rounded-md border border-white/15 text-white/70 hover:text-white disabled:opacity-30 flex items-center gap-1"><Plus size={10} /> Place</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/40 font-semibold">Melody writer</span>
          <div className="flex flex-col gap-1" role="radiogroup" aria-label="Melody writer">
            {(lanes.length ? lanes : [{ lane: 'rules', available: true, label: 'Rules only', detail: 'Checking what this machine can run…' } as LaneStatus]).map((l) => (
              <button key={l.lane} role="radio" aria-checked={lane === l.lane} disabled={!l.available || busy} onClick={() => pickLane(l.lane)}
                className={`text-left rounded-lg border px-2.5 py-1.5 disabled:opacity-35 ${lane === l.lane ? 'border-[#8B5CFF] bg-[#8B5CFF]/15' : 'border-white/10 hover:border-white/25'}`}>
                <span className="block text-[11px]">{l.label}</span>
                <span className="block text-[10px] text-white/45 leading-snug">{l.detail}</span>
              </button>
            ))}
          </div>
          {lanes.map((l) => l.download && !l.available && (
            <button key={`dl-${l.lane}`} onClick={() => { void downloadModel(l.download!.key, l.download!.label); }} disabled={!!downloading && !/didn't/.test(downloading)}
              className="self-start h-7 px-3 rounded-lg border border-[#8B5CFF]/60 text-[10.5px] text-white bg-[#8B5CFF]/20 disabled:opacity-50">
              Download {l.download.label} for this PC
            </button>
          ))}
          {downloading && <span className="text-[10px] text-white/55">{downloading}</span>}
          <span className="text-[10px] text-white/35 leading-snug">Bass, harmony, pads and arps are written from the song's chords. Everything runs on this machine — no account, no cloud.</span>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => { void compose(); }} disabled={busy || !targets.length}
            className="h-8 px-3.5 rounded-lg text-[11px] font-semibold text-white flex items-center gap-1.5 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #8B5CFF, #00DAF3)', boxShadow: '0 0 14px rgba(139,92,255,0.35)' }}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {busy ? 'Composing…' : takes.length ? `Compose take ${String.fromCharCode(65 + (takes.length % 26))}` : 'Compose'}
          </button>
          {busy && <button onClick={() => op.current?.abort()} className="h-8 px-2.5 rounded-lg border border-white/15 text-[11px] text-white/70">Cancel</button>}
          <span className="text-[10px] text-white/40">{targets.length} part{targets.length === 1 ? '' : 's'}</span>
        </div>
        {(busy || progress.length > 0) && (
          <ul className="text-[10.5px] text-white/55 flex flex-col gap-0.5">
            {progress.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        )}
        {error && <p className="text-[11px] text-[#FF8B8B]">{error}</p>}

        {takes.map((t, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03]">
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
              <span className="w-6 h-6 rounded-md grid place-items-center text-[11px] font-bold" style={{ background: `${ACCENT}33`, color: '#D0BCFF' }}>{t.label}</span>
              <span className="flex-1 text-[11px] text-white/75 line-clamp-2">{t.composition.brief || t.description}</span>
              {t.applied && <Check size={13} className="text-[#06D6A0]" />}
            </button>
            {open === i && (
              <div className="px-3 pb-3 flex flex-col gap-2 text-[11px]">
                {t.credits.length > 0 && <p className="text-[10px] text-white/40 leading-snug">{t.credits.join(' · ')}</p>}
                {t.composition.parts.map((p) => (
                  <div key={p.target} className="flex flex-col">
                    <span><b>{p.name}</b> <span className="text-white/45">· {ROLE_LABEL[p.role]} · {p.instrument.toUpperCase()} · {p.notes.length} notes</span></span>
                    {p.intent && <span className="text-white/55 leading-snug">{p.intent}</span>}
                  </div>
                ))}
                {t.composition.lyricReading && (
                  <div><span className="text-[9.5px] uppercase tracking-[0.14em] text-white/35">Lyric reading</span><p className="text-white/60 leading-snug">{t.composition.lyricReading}</p></div>
                )}
                <div>
                  <span className="text-[9.5px] uppercase tracking-[0.14em] text-white/35">Critic</span>
                  <p className="text-white/60 leading-snug">{t.composition.critique}</p>
                  {t.fixes.length > 0 && (
                    <ul className="text-white/45 leading-snug list-disc pl-4" aria-label="What the critic fixed">
                      {t.fixes.map((x, k) => <li key={k}>Fixed: {x.message}</li>)}
                    </ul>
                  )}
                  {t.issues.length > 0 && (
                    <ul className="text-[#FFD166]/80 leading-snug list-disc pl-4" aria-label="Still worth a look">
                      {t.issues.map((x, k) => <li key={k}>{x.message}</li>)}
                    </ul>
                  )}
                </div>
                <button onClick={() => apply(i)} disabled={t.applied}
                  className="self-start h-7 px-3 rounded-lg text-[10.5px] font-semibold border disabled:opacity-60"
                  style={t.applied ? { borderColor: 'rgba(6,214,160,0.5)', color: '#06D6A0' } : { borderColor: ACCENT, color: '#fff', background: `${ACCENT}33` }}>
                  {t.applied ? 'On the timeline — Ctrl+Z removes it' : `Put take ${t.label} on the timeline`}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
};
