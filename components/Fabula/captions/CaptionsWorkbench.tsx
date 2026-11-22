// Fabula · Captions workbench — the closed-caption / subtitle workflow that docks above the timeline.
//
//   Track bar   which subtitle track (= caption track) is being worked: language, 608 channel,
//               delivery spec, QC totals, import / export / embed.
//   Cue list    every caption with in/out timecode, duration, reading speed and spec problems.
//               Click to select + park the playhead; the cue under the playhead is highlighted.
//   Inspector   text with a live column ruler, speaker, pop-on / roll-up / paint-on, rows, row
//               placement, alignment, frame-accurate in/out with ±1 frame nudges, split / merge.
//
// The cues ARE the subtitle clips on the timeline (captionClips.ts) — editing here edits the clips
// and vice versa, with undo. Export writes every format the engine knows and, for SCC / MCC, reads
// the bytes back through the decoders and reports frame-by-frame. Embed muxes into MOV (CEA-608),
// MP4 (timed text), MKV, or burns in, on the desktop app's ffmpeg or the in-browser codec pack.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CAPTION_FORMATS, CAPTION_PROFILES, EMBED_TARGETS, profileById, qcCaptions, readCaptionBytes, retimeCues, verifyBroadcast, writeCaptions,
  frameToTc, secToFrame, frameToSec, tcToFrame, sortCues,
  type CaptionCue, type CaptionFormat, type EmbedTarget, type QcIssue, type ReadbackReport,
} from '../../../services/crossover/captions';
import { wrapLines } from '../../../services/crossover/captions/cea608';
import { applyCuesToTrack, captionRate, cpsOf, cuesOfTrack, enforceGaps, mergeCues, snapCuesToFrames, splitCue } from './captionClips';

export interface CaptionSettings { trackId?: string; profile?: string; startTc?: string; maxRows?: number }

interface Props {
  clips: any[];
  tracks: any[];
  fps: number;
  drop: boolean;
  playhead: number;
  durationSec: number;
  selectedId: string | null;
  projectName: string;
  settings: CaptionSettings;
  mediaPool: any[];
  baseFx: any;
  makeId: () => string;
  onSettings: (patch: CaptionSettings) => void;
  onSelect: (id: string | null) => void;
  onSeek: (t: number) => void;
  onApply: (next: any[], label: string) => void;
  onAddTrack: () => string;
  onTrackPatch: (trackId: string, patch: Record<string, any>) => void;
  onTranscribe?: () => void;
  onClose: () => void;
  ping: (msg: string) => void;
}

const LANGS: [string, string][] = [['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['pt', 'Portuguese'], ['de', 'German'], ['it', 'Italian'], ['ht', 'Haitian Creole'], ['zh', 'Chinese'], ['ko', 'Korean'], ['ja', 'Japanese'], ['ar', 'Arabic'], ['ru', 'Russian'], ['vi', 'Vietnamese'], ['sw', 'Swahili'], ['yo', 'Yoruba']];
const READ_EXT = '.srt,.vtt,.scc,.mcc,.ttml,.dfxp,.itt,.xml,.ass,.ssa,.sbv,.smi,.sami,.stl';

function download(name: string, data: string | Uint8Array, mime: string) {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : new Blob([data as BlobPart], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export default function CaptionsWorkbench(p: Props) {
  const rate = useMemo(() => captionRate(p.fps, p.drop), [p.fps, p.drop]);
  const subTracks = p.tracks.filter((t) => t.type === 'subtitle');
  const trackId = (p.settings.trackId && subTracks.some((t) => t.id === p.settings.trackId)) ? p.settings.trackId : subTracks[0]?.id;
  const track = subTracks.find((t) => t.id === trackId);
  const profile = profileById(p.settings.profile);
  const cues = useMemo(() => (trackId ? cuesOfTrack(p.clips, trackId) : []), [p.clips, trackId]);
  const issues = useMemo(() => qcCaptions(cues, { ...profile, rate, videoDurationSec: p.durationSec || undefined }), [cues, profile, rate, p.durationSec]);
  const issuesBy = useMemo(() => { const m = new Map<string, QcIssue[]>(); issues.forEach((i) => m.set(i.cueId, [...(m.get(i.cueId) || []), i])); return m; }, [issues]);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warns = issues.length - errors;
  const sel = cues.find((c) => c.id === p.selectedId) || null;
  const live = cues.find((c) => p.playhead >= c.startSec && p.playhead < c.endSec) || null;
  const tc = (sec: number) => frameToTc(secToFrame(sec, rate), rate);

  const [menu, setMenu] = useState<null | 'export' | 'embed'>(null);
  const [popPos, setPopPos] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (menu !== 'export') return undefined;
    const down = (e: MouseEvent) => { const t = e.target as HTMLElement; if (!t.closest('.cw-pop') && !t.closest('.cw-pop-wrap')) setMenu(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('mousedown', down); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key); };
  }, [menu]);
  const [report, setReport] = useState<{ fmt: string; report?: ReadbackReport; note?: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep the live cue in view while the playhead moves.
  useEffect(() => {
    if (!live || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-cue="${live.id}"]`) as HTMLElement | null;
    if (row) { const r = row.getBoundingClientRect(), b = listRef.current.getBoundingClientRect(); if (r.top < b.top || r.bottom > b.bottom) row.scrollIntoView({ block: 'nearest' }); }
  }, [live?.id]);

  const commit = (next: CaptionCue[], label: string) => {
    if (!trackId) return;
    p.onApply(applyCuesToTrack(p.clips, trackId, sortCues(next), p.makeId, p.baseFx), label);
  };
  const patchSel = (patch: Partial<CaptionCue>, label = 'Edit caption') => { if (sel) commit(cues.map((c) => (c.id === sel.id ? { ...c, ...patch } : c)), label); };
  const ensureTrack = () => trackId || (() => { const id = p.onAddTrack(); p.onSettings({ trackId: id }); return id; })();

  const addAtPlayhead = () => {
    const tid = ensureTrack();
    const start = frameToSec(secToFrame(p.playhead, rate), rate);
    const nextCue = cues.find((c) => c.startSec > start + 0.01);
    const end = Math.min(start + 2.5, nextCue ? nextCue.startSec : Infinity);
    const id = p.makeId();
    const cue: CaptionCue = { id, startSec: start, endSec: Math.max(start + frameToSec(12, rate), end), text: '' };
    p.onApply(applyCuesToTrack(p.clips, tid, sortCues([...(tid === trackId ? cues : cuesOfTrack(p.clips, tid)), cue]), p.makeId, p.baseFx), 'Add caption');
    p.onSelect(id);
    setTimeout(() => (document.getElementById('cw-text') as HTMLTextAreaElement | null)?.focus(), 30);
  };
  const splitSel = () => {
    const target = sel || live; if (!target) return;
    const at = frameToSec(secToFrame(p.playhead, rate), rate);
    const pair = splitCue(target, at, p.makeId);
    if (!pair) { p.ping('Park the playhead inside the caption to split it.'); return; }
    commit(cues.flatMap((c) => (c.id === target.id ? pair : [c])), 'Split caption');
  };
  const mergeNext = () => {
    if (!sel) return; const i = cues.findIndex((c) => c.id === sel.id); const nx = cues[i + 1]; if (!nx) return;
    commit(cues.filter((c) => c.id !== nx.id).map((c) => (c.id === sel.id ? mergeCues(c, nx) : c)), 'Merge captions');
  };
  const removeSel = () => { if (!sel) return; commit(cues.filter((c) => c.id !== sel.id), 'Delete caption'); p.onSelect(null); };
  const nudge = (edge: 'in' | 'out', frames: number) => {
    if (!sel) return;
    const f = (t: number) => frameToSec(secToFrame(t, rate) + frames, rate);
    if (edge === 'in') patchSel({ startSec: Math.max(0, Math.min(f(sel.startSec), sel.endSec - frameToSec(1, rate))) }, 'Trim caption');
    else patchSel({ endSec: Math.max(sel.startSec + frameToSec(1, rate), f(sel.endSec)) }, 'Trim caption');
  };
  const setEdgeToPlayhead = (edge: 'in' | 'out') => {
    if (!sel) return;
    const t = frameToSec(secToFrame(p.playhead, rate), rate);
    if (edge === 'in' && t < sel.endSec) patchSel({ startSec: t }, 'Set caption in');
    if (edge === 'out' && t > sel.startSec) patchSel({ endSec: t }, 'Set caption out');
  };
  const setTc = (edge: 'in' | 'out', text: string) => {
    if (!sel) return; const f = tcToFrame(text, rate); if (f == null) { p.ping(`Not a ${rate.label} timecode.`); return; }
    const t = frameToSec(f, rate);
    if (edge === 'in' && t < sel.endSec) patchSel({ startSec: t }, 'Set caption in');
    else if (edge === 'out' && t > sel.startSec) patchSel({ endSec: t }, 'Set caption out');
  };

  const importFile = async (f: File) => {
    try {
      const doc = readCaptionBytes(f.name, new Uint8Array(await f.arrayBuffer()), { startTc: p.settings.startTc });
      if (!doc.cues.length) { p.ping(`No captions found in ${f.name}.`); return; }
      const tid = cues.length ? p.onAddTrack() : ensureTrack();
      p.onApply(applyCuesToTrack(p.clips, tid, doc.cues.map((c) => ({ ...c, id: p.makeId() })), p.makeId, p.baseFx), `Import ${f.name}`);
      p.onSettings({ trackId: tid });
      p.ping(`Imported ${doc.cues.length} captions from ${f.name}${doc.warnings.length ? ` · ${doc.warnings[0]}` : ''}`);
    } catch (e: any) { p.ping(e?.message || `Couldn't read ${f.name}.`); }
  };

  const doExport = (fmt: CaptionFormat) => {
    if (!cues.length) { p.ping('This caption track is empty.'); return; }
    const channel = track?.capChannel === 2 ? 2 : 1;
    try {
      const w = writeCaptions(cues, fmt, {
        rateId: fmt === 'scc' ? (rate.id === '29.97ndf' ? '29.97ndf' : '29.97df') : rate.id,
        startTc: p.settings.startTc || undefined, maxRows: p.settings.maxRows || Math.min(3, profile.maxRows) || 2,
        durationSec: p.durationSec || undefined, channel, title: p.projectName, lang: track?.capLang || 'en',
        stl: { fps: Math.round(p.fps) === 25 || Math.round(p.fps) === 50 ? 25 : 30, maxCols: Math.min(40, profile.maxCols) },
      });
      const base = `${p.projectName || 'captions'}${track?.capLang ? '.' + track.capLang : ''}`.replace(/[\\/:*?"<>|]+/g, '_');
      download(`${base}.${w.ext}`, w.bytes ?? w.text, w.mime);
      if (fmt === 'scc' || fmt === 'mcc') {
        const r = verifyBroadcast(w, fmt, { startTc: p.settings.startTc || undefined, channel });
        setReport({ fmt: fmt.toUpperCase(), report: r });
      } else setReport({ fmt: fmt.toUpperCase(), note: `${cues.length} captions written.` });
    } catch (e: any) { p.ping(e?.message || 'Export failed.'); }
    setMenu(null);
  };

  const qcFixAll = () => {
    let next = snapCuesToFrames(cues, rate);
    next = enforceGaps(next, rate, profile.minGapFrames);
    next = next.map((c) => ({ ...c, text: wrapLines(c.text, profile.maxCols).join('\n') }));
    commit(next, 'Conform captions to spec');
    p.ping(`Conformed to ${profile.label}: frame grid, gaps and line length.`);
  };

  const [retime, setRetime] = useState({ frames: 0, from: '', to: '' });
  const applyRetime = () => {
    const scale = retime.from && retime.to ? Number(retime.to) / Number(retime.from) : 1;
    if (!isFinite(scale) || scale <= 0) { p.ping('Enter both frame rates to stretch.'); return; }
    commit(retimeCues(cues, frameToSec(retime.frames, rate), scale), 'Retime captions');
  };

  return (
    <div className="cw" role="region" aria-label="Captions workbench">
      <style>{CSS}</style>
      <div className="cw-bar">
        <span className="cw-title">Captions</span>
        <select className="cw-sel" value={trackId || ''} onChange={(e) => (e.target.value === '__new' ? p.onSettings({ trackId: p.onAddTrack() }) : p.onSettings({ trackId: e.target.value }))} aria-label="Caption track">
          {subTracks.map((t) => <option key={t.id} value={t.id}>{t.id.toUpperCase()} · {LANGS.find(([k]) => k === (t.capLang || 'en'))?.[1] || t.capLang} · CC{t.capChannel === 2 ? 2 : 1}</option>)}
          <option value="__new">+ New caption track</option>
        </select>
        {track && <>
          <select className="cw-sel sm" value={track.capLang || 'en'} onChange={(e) => p.onTrackPatch(track.id, { capLang: e.target.value })} aria-label="Language" title="Language (tagged on embedded tracks and sidecars)">
            {LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="cw-sel sm" value={track.capChannel === 2 ? 2 : 1} onChange={(e) => p.onTrackPatch(track.id, { capChannel: Number(e.target.value) })} aria-label="608 channel" title="CEA-608 data channel. CC1 = primary language, CC2 = second language (field 1)">
            <option value={1}>CC1</option><option value={2}>CC2</option>
          </select>
        </>}
        <span className="cw-div" />
        <select className="cw-sel" value={profile.id} onChange={(e) => p.onSettings({ profile: e.target.value })} aria-label="Delivery spec" title={profile.note}>
          {CAPTION_PROFILES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <span className={'cw-qc ' + (errors ? 'err' : warns ? 'warn' : 'ok')} title={issues.slice(0, 8).map((i) => `${tc(cues.find((c) => c.id === i.cueId)?.startSec || 0)} ${i.message}`).join('\n') || 'Meets the spec'}>
          {errors ? `${errors} error${errors > 1 ? 's' : ''}` : ''}{errors && warns ? ' · ' : ''}{warns ? `${warns} warning${warns > 1 ? 's' : ''}` : ''}{!issues.length && (cues.length ? 'Meets spec' : 'No captions')}
        </span>
        {issues.length > 0 && <button className="cw-btn" onClick={qcFixAll} title="Snap to frames, enforce the spec's gap rule and rewrap long lines">Conform</button>}
        <span className="cw-spacer" />
        <span className="cw-rate" title="Caption timecode rate (from the sequence format)">{rate.label}</span>
        {p.onTranscribe && <button className="cw-btn" onClick={p.onTranscribe} title="Transcribe the selected clip's dialogue into captions">Transcribe</button>}
        <button className="cw-btn" onClick={() => fileRef.current?.click()} title={`Import ${READ_EXT.replace(/\./g, '').split(',').join(' · ').toUpperCase()}`}>Import</button>
        <input ref={fileRef} type="file" hidden accept={READ_EXT} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        <div className="cw-pop-wrap">
          <button className={'cw-btn' + (menu === 'export' ? ' on' : '')} onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const below = window.innerHeight - r.bottom;
            setPopPos(below > 320 ? { top: r.bottom + 4, right: window.innerWidth - r.right } : { bottom: window.innerHeight - r.top + 4, right: window.innerWidth - r.right });
            setMenu(menu === 'export' ? null : 'export');
          }}>Export ▾</button>
          {menu === 'export' && (
            <div className="cw-pop" role="menu" style={popPos}>
              <div className="cw-pop-h">Broadcast</div>
              {CAPTION_FORMATS.filter((f) => f.broadcast).map((f) => <button key={f.id} className="cw-item" onClick={() => doExport(f.id)}><b>{f.label}</b><i>{f.note}</i></button>)}
              <div className="cw-pop-h">Sidecar</div>
              {CAPTION_FORMATS.filter((f) => !f.broadcast).map((f) => <button key={f.id} className="cw-item" onClick={() => doExport(f.id)}><b>{f.label}</b><i>{f.note}</i></button>)}
              <div className="cw-pop-row">
                <label>Start TC <input className="cw-in mono" placeholder={rate.drop ? '00:00:00;00' : '00:00:00:00'} defaultValue={p.settings.startTc || ''} onBlur={(e) => p.onSettings({ startTc: e.target.value.trim() })} /></label>
                <label>Rows <select className="cw-in" value={p.settings.maxRows || 2} onChange={(e) => p.onSettings({ maxRows: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></label>
              </div>
            </div>
          )}
        </div>
        <button className={'cw-btn primary' + (menu === 'embed' ? ' on' : '')} onClick={() => setMenu(menu === 'embed' ? null : 'embed')} disabled={!cues.length}>Embed…</button>
        <button className="cw-x" onClick={p.onClose} aria-label="Close captions workbench" title="Close captions workbench">×</button>
      </div>

      {menu === 'embed' && <EmbedDialog cues={cues} track={track} p={p} rate={rate} onClose={() => setMenu(null)} />}
      {report && <ReportStrip r={report} tc={tc} cues={cues} onPick={(id) => { const c = cues.find((x) => x.id === id); if (c) { p.onSelect(c.id); p.onSeek(c.startSec); } }} onClose={() => setReport(null)} />}

      <div className="cw-body">
        <div className="cw-list" ref={listRef}>
          <div className="cw-row head"><span>#</span><span>In</span><span>Out</span><span>Dur</span><span>CPS</span><span>Caption</span></div>
          {cues.length === 0 && (
            <div className="cw-empty">
              {trackId ? 'No captions on this track yet.' : 'No caption track yet.'}
              <button className="cw-btn" onClick={addAtPlayhead}>Add caption at playhead</button>
              <button className="cw-btn" onClick={() => fileRef.current?.click()}>Import a caption file</button>
            </div>
          )}
          {cues.map((c, i) => {
            const iss = issuesBy.get(c.id) || [];
            const bad = iss.some((x) => x.severity === 'error');
            const cps = cpsOf(c);
            return (
              <div key={c.id} data-cue={c.id} className={'cw-row' + (sel?.id === c.id ? ' sel' : '') + (live?.id === c.id ? ' live' : '')}
                onClick={() => { p.onSelect(c.id); p.onSeek(c.startSec); }} title={iss.map((x) => x.message).join('\n') || undefined}>
                <span className="dim">{i + 1}</span>
                <span className="mono">{tc(c.startSec)}</span>
                <span className="mono">{tc(c.endSec)}</span>
                <span className="mono dim">{(c.endSec - c.startSec).toFixed(2)}</span>
                <span className={'mono ' + (cps > profile.maxCps ? 'hot' : 'dim')}>{isFinite(cps) ? cps.toFixed(0) : '—'}</span>
                <span className="cw-txt">
                  {c.mode && c.mode !== 'popon' && <em className="cw-tag">{c.mode === 'rollup' ? `RU${c.rollRows || 3}` : 'PAINT'}</em>}
                  {c.speaker && <em className="cw-tag sp">{c.speaker}</em>}
                  {c.text.replace(/<[^>]+>/g, '').replace(/\n/g, ' / ') || <i className="dim">empty</i>}
                  {iss.length > 0 && <b className={'cw-flag ' + (bad ? 'err' : 'warn')}>{iss.length}</b>}
                </span>
              </div>
            );
          })}
        </div>

        <div className="cw-insp">
          {!sel ? (
            <div className="cw-hint">
              <p>Select a caption, or</p>
              <button className="cw-btn primary" onClick={addAtPlayhead}>Add caption at playhead</button>
              <button className="cw-btn" onClick={splitSel} disabled={!live}>Split caption at playhead</button>
              <details className="cw-det">
                <summary>Retime whole track</summary>
                <div className="cw-pop-row">
                  <label>Offset <input className="cw-in mono" type="number" value={retime.frames} onChange={(e) => setRetime({ ...retime, frames: Number(e.target.value) })} /> frames</label>
                </div>
                <div className="cw-pop-row">
                  <label>Stretch from <input className="cw-in mono" placeholder="25" value={retime.from} onChange={(e) => setRetime({ ...retime, from: e.target.value })} /></label>
                  <label>to <input className="cw-in mono" placeholder="23.976" value={retime.to} onChange={(e) => setRetime({ ...retime, to: e.target.value })} /> fps</label>
                </div>
                <button className="cw-btn" onClick={applyRetime} disabled={!cues.length}>Apply retime</button>
              </details>
            </div>
          ) : (
            <>
              <div className="cw-f">
                <TextWithRuler value={sel.text} cols={profile.maxCols} rows={profile.maxRows} onChange={(text) => patchSel({ text }, 'Edit caption text')} />
              </div>
              <div className="cw-grid">
                <label>In
                  <div className="cw-tc">
                    <button onClick={() => nudge('in', -1)} title="1 frame earlier">‹</button>
                    <input key={'in' + sel.startSec} className="cw-in mono" defaultValue={tc(sel.startSec)} onBlur={(e) => setTc('in', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                    <button onClick={() => nudge('in', 1)} title="1 frame later">›</button>
                    <button className="cw-mini" onClick={() => setEdgeToPlayhead('in')} title="In = playhead">⇤</button>
                  </div>
                </label>
                <label>Out
                  <div className="cw-tc">
                    <button onClick={() => nudge('out', -1)} title="1 frame earlier">‹</button>
                    <input key={'out' + sel.endSec} className="cw-in mono" defaultValue={tc(sel.endSec)} onBlur={(e) => setTc('out', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                    <button onClick={() => nudge('out', 1)} title="1 frame later">›</button>
                    <button className="cw-mini" onClick={() => setEdgeToPlayhead('out')} title="Out = playhead">⇥</button>
                  </div>
                </label>
                <label>Style
                  <div className="cw-seg">
                    {(['popon', 'rollup', 'painton'] as const).map((m) => (
                      <button key={m} className={(sel.mode || 'popon') === m ? 'on' : ''} onClick={() => patchSel({ mode: m, ...(m === 'rollup' && !sel.rollRows ? { rollRows: 3 } : {}) }, 'Caption style')}>{m === 'popon' ? 'Pop-on' : m === 'rollup' ? 'Roll-up' : 'Paint-on'}</button>
                    ))}
                  </div>
                </label>
                {sel.mode === 'rollup' ? (
                  <label>Roll depth
                    <div className="cw-seg">{([2, 3, 4] as const).map((n) => <button key={n} className={(sel.rollRows || 3) === n ? 'on' : ''} onClick={() => patchSel({ rollRows: n }, 'Roll depth')}>{n} rows</button>)}</div>
                  </label>
                ) : (
                  <label>Align
                    <div className="cw-seg">{(['left', 'center', 'right'] as const).map((a) => <button key={a} className={(sel.align || 'center') === a ? 'on' : ''} onClick={() => patchSel({ align: a }, 'Caption alignment')}>{a[0].toUpperCase() + a.slice(1)}</button>)}</div>
                  </label>
                )}
                <label>Row <span className="dim">{sel.row || 15} of 15 {(sel.row || 15) < 10 ? '· raised' : ''}</span>
                  <input type="range" min={sel.mode === 'rollup' ? (sel.rollRows || 3) : 1} max={15} value={sel.row || 15} onChange={(e) => patchSel({ row: Number(e.target.value) }, 'Caption row')} title="Move captions up to clear lower thirds or on-screen text (FCC placement)" />
                </label>
                <label>Speaker
                  <input className="cw-in" placeholder="e.g. ANA (adds >> ANA:)" value={sel.speaker || ''} onChange={(e) => patchSel({ speaker: e.target.value || undefined }, 'Caption speaker')} />
                </label>
              </div>
              {(issuesBy.get(sel.id) || []).length > 0 && (
                <ul className="cw-issues">{(issuesBy.get(sel.id) || []).map((x, i) => <li key={i} className={x.severity}>{x.message}</li>)}</ul>
              )}
              <div className="cw-actions">
                <button className="cw-btn" onClick={addAtPlayhead}>Add</button>
                <button className="cw-btn" onClick={splitSel}>Split</button>
                <button className="cw-btn" onClick={mergeNext}>Merge next</button>
                <button className="cw-btn danger" onClick={removeSel}>Delete</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TextWithRuler({ value, cols, rows, onChange }: { value: string; cols: number; rows: number; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const lines = draft.replace(/<[^>]+>/g, '').split('\n');
  const wrapped = wrapLines(draft, cols);
  return (
    <div className="cw-text">
      <textarea id="cw-text" className="cw-in mono" rows={Math.max(2, Math.min(4, lines.length))} value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onChange(draft)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { (e.target as HTMLTextAreaElement).blur(); } }}
        placeholder="Caption text. Enter = new row · Ctrl+Enter = done · <i>italic</i>" spellCheck />
      <div className="cw-ruler">
        {lines.map((l, i) => <span key={i} className={l.length > cols ? 'hot' : ''}>{l.length}/{cols}</span>)}
        <span className={wrapped.length > rows ? 'hot' : 'dim'}>{wrapped.length} row{wrapped.length === 1 ? '' : 's'}{wrapped.length > rows ? ` · over ${rows}` : ''}</span>
      </div>
    </div>
  );
}

function ReportStrip({ r, onClose, onPick, cues, tc }: { r: { fmt: string; report?: ReadbackReport; note?: string }; onClose: () => void; onPick: (id: string) => void; cues: CaptionCue[]; tc: (s: number) => string }) {
  const rep = r.report;
  return (
    <div className={'cw-report ' + (rep ? (rep.pass ? 'ok' : 'warn') : 'ok')}>
      <b>{r.fmt} {rep ? (rep.pass ? 'read back clean' : 'read back with problems') : 'exported'}</b>
      {rep ? rep.layers.map((l) => (
        <span key={l.layer}>{l.layer}: {l.checks.length - l.missing}/{l.checks.length} captions · {l.textErrors ? `${l.textErrors} text errors` : 'words match'} · within {Math.max(l.worstStartFrames, l.worstEndFrames)} frame{Math.max(l.worstStartFrames, l.worstEndFrames) === 1 ? '' : 's'}</span>
      )) : <span>{r.note}</span>}
      {rep?.late.length ? <span className="hot">{rep.late.length} caption{rep.late.length > 1 ? 's' : ''} couldn't load in time (608 carries 2 bytes a frame) — shorten, or leave more room before:{' '}
        {rep.late.map((l) => { const c = cues.find((x) => x.id === l.id); return <button key={l.id + l.lateSlots} className="cw-link" onClick={() => onPick(l.id)} title={l.text}>{c ? tc(c.startSec) : l.text.slice(0, 16)} (+{l.lateSlots}f)</button>; })}</span> : null}
      {rep?.unsupported.length ? <span className="hot">Unsupported characters: {rep.unsupported.join(' ')}</span> : null}
      {rep?.diagnostics && <span className="dim">{rep.diagnostics.packets} packets · checksums {rep.diagnostics.badAncChecksums + rep.diagnostics.badCdpChecksums ? 'BAD' : 'OK'}</span>}
      <button className="cw-x" onClick={onClose} aria-label="Dismiss">×</button>
    </div>
  );
}

function EmbedDialog({ cues, track, p, rate, onClose }: { cues: CaptionCue[]; track: any; p: Props; rate: any; onClose: () => void }) {
  const [target, setTarget] = useState<EmbedTarget>('mov-608');
  const [defaultOn, setDefaultOn] = useState(false);
  const [state, setState] = useState<{ busy?: boolean; progress?: number; line?: string; done?: string; error?: string; engine?: string }>({});
  const vidAssets = p.mediaPool.filter((a) => a?.type === 'video');
  const [assetId, setAssetId] = useState<string>(vidAssets[0]?.id || '');
  const pickRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const t = EMBED_TARGETS.find((x) => x.id === target)!;

  const run = async (file?: File) => {
    const mod = await import('../../../services/crossover/captions/embedNative');
    const engine = await mod.embedEngine();
    const sc = mod.sidecarFor(cues, target, { channel: track?.capChannel === 2 ? 2 : 1, startTc: p.settings.startTc || undefined, maxRows: p.settings.maxRows || 2, rateId: '29.97df', title: p.projectName });
    abortRef.current = new AbortController();
    setState({ busy: true, progress: 0, engine, line: engine === 'native' ? 'Desktop ffmpeg' : 'In-browser codec pack' });
    const onProgress = (pr: any) => setState((s) => ({ ...s, progress: pr.progress, line: pr.line || s.line }));
    try {
      const asset = vidAssets.find((a) => a.id === assetId);
      const nativePath = asset?.diskPath && asset?.diskName ? `${asset.diskPath.replace(/[\\/]$/, '')}\\${asset.diskName}` : asset?.localPath || asset?.path;
      if (engine === 'native' && nativePath && !file) {
        const r = await mod.embedCaptionsNative({ videoPath: nativePath, target, caption: sc, lang: track?.capLang, defaultOn, durationSec: asset?.duration, onProgress, signal: abortRef.current.signal });
        setState({ done: `Saved ${r.outputPath}` });
        return;
      }
      let src = file;
      if (!src && asset?.url) {
        const blob = await (await fetch(asset.url)).blob();
        src = new File([blob], asset.name || 'video.mp4', { type: blob.type });
      }
      if (!src) { setState({ error: 'Choose a video from the media pool or pick a file.' }); return; }
      const out = await mod.embedCaptionsWasm({ video: src, target, caption: sc, lang: track?.capLang, defaultOn, onProgress, signal: abortRef.current.signal });
      download(out.name, new Uint8Array(await out.blob.arrayBuffer()), 'application/octet-stream');
      setState({ done: `Downloaded ${out.name}` });
    } catch (e: any) {
      setState({ error: e?.name === 'AbortError' ? 'Canceled.' : (e?.message || 'Embedding failed.') });
    }
  };

  return (
    <div className="cw-embed">
      <div className="cw-embed-h"><b>Embed captions into video</b><span className="dim">{cues.length} captions · {track?.capLang || 'en'} · CC{track?.capChannel === 2 ? 2 : 1} · {rate.label}</span><button className="cw-x" onClick={onClose} aria-label="Close">×</button></div>
      <div className="cw-embed-grid">
        {EMBED_TARGETS.map((x) => (
          <button key={x.id} className={'cw-card' + (x.id === target ? ' on' : '')} onClick={() => setTarget(x.id)}>
            <b>{x.label}</b><i>{x.note}</i>
          </button>
        ))}
      </div>
      <div className="cw-pop-row">
        <label>Video
          <select className="cw-in" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            {vidAssets.length === 0 && <option value="">No video in the media pool</option>}
            {vidAssets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        {t.id !== 'mov-608' && t.id !== 'burn-in' && <label className="cw-check"><input type="checkbox" checked={defaultOn} onChange={(e) => setDefaultOn(e.target.checked)} /> On by default</label>}
        <span className="cw-spacer" />
        <button className="cw-btn" onClick={() => pickRef.current?.click()} disabled={state.busy}>Pick a file…</button>
        <input ref={pickRef} type="file" hidden accept="video/*,.mov,.mp4,.mkv,.mxf,.m4v" onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); e.target.value = ''; }} />
        {state.busy ? <button className="cw-btn danger" onClick={() => abortRef.current?.abort()}>Cancel</button>
          : <button className="cw-btn primary" onClick={() => void run()} disabled={!assetId}>Embed</button>}
      </div>
      {t.id === 'mov-608' && <p className="cw-note">SCC timing is 29.97 fps. For a 23.976 / 25 master the 608 track still plays in sync; MCC (Export) carries 608 + 708 at the master's own rate for playout servers.</p>}
      {state.busy && <div className="cw-prog"><div style={{ width: `${Math.round((state.progress || 0) * 100)}%` }} /><span>{state.line} · {Math.round((state.progress || 0) * 100)}%</span></div>}
      {state.done && <p className="cw-note ok">{state.done}</p>}
      {state.error && <p className="cw-note err">{state.error}</p>}
    </div>
  );
}

const CSS = `
.cw{display:flex;flex-direction:column;min-height:170px;max-height:70vh;height:clamp(180px,26vh,300px);resize:vertical;flex:none;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#111216;margin:6px 0;font:400 12px/1.35 Inter,system-ui,sans-serif;color:#e7e7ea;overflow:hidden;position:relative}
.cw .mono{font-family:"JetBrains Mono",ui-monospace,Consolas,monospace;font-size:11.5px;letter-spacing:0}
.cw .dim{color:rgba(255,255,255,.45)} .cw .hot{color:#ffb35c}
.cw-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.07);flex-wrap:wrap}
.cw-title{font:600 12.5px/1 Inter,system-ui,sans-serif;margin-right:4px;color:#fff}
.cw-sel,.cw-in{height:26px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#e7e7ea;font:500 12px/1 Inter,system-ui,sans-serif;padding:0 7px}
.cw-in.mono{font-family:"JetBrains Mono",ui-monospace,Consolas,monospace}
textarea.cw-in{height:auto;padding:7px 8px;line-height:1.45;resize:vertical;width:100%;font-size:13px}
.cw-sel.sm{max-width:120px}
.cw-div{width:1px;height:18px;background:rgba(255,255,255,.1);margin:0 2px}
.cw-spacer{flex:1}
.cw-rate{font:500 11px/1 Inter,system-ui,sans-serif;color:rgba(255,255,255,.45)}
.cw-qc{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:10px;font:600 11px/1 Inter,system-ui,sans-serif}
.cw-qc.ok{background:rgba(60,190,120,.14);color:#8fe3b4}.cw-qc.warn{background:rgba(255,170,60,.14);color:#ffc77a}.cw-qc.err{background:rgba(255,80,80,.15);color:#ff9a9a}
.cw-btn{height:26px;display:inline-flex;align-items:center;gap:5px;padding:0 10px;border-radius:6px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#e7e7ea;font:500 12px/1 Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
.cw-btn:hover:not(:disabled){background:rgba(255,255,255,.09);color:#fff}
.cw-btn.on{background:rgba(255,255,255,.1)}
.cw-btn.primary{background:#FF8C00;border-color:#FF8C00;color:#111;font-weight:600}.cw-btn.primary:hover:not(:disabled){filter:brightness(1.08);background:#FF8C00;color:#111}
.cw-btn.danger{color:#ff9a9a}
.cw-btn:disabled{opacity:.4;cursor:default}
.cw-x{width:24px;height:24px;border:0;border-radius:5px;background:transparent;color:rgba(255,255,255,.55);font-size:16px;cursor:pointer}.cw-x:hover{background:rgba(255,255,255,.08);color:#fff}
.cw-pop-wrap{position:relative}
.cw-pop{position:fixed;z-index:9000;width:330px;max-height:min(420px,70vh);overflow:auto;padding:6px;border-radius:9px;background:#18191e;border:1px solid rgba(255,255,255,.1);box-shadow:0 14px 40px rgba(0,0,0,.55)}
.cw-pop-h{font:600 10.5px/1 Inter,system-ui,sans-serif;color:rgba(255,255,255,.4);padding:8px 8px 4px;letter-spacing:.04em;text-transform:uppercase}
.cw-item{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;padding:7px 8px;border:0;border-radius:6px;background:transparent;color:#e7e7ea;cursor:pointer}
.cw-item:hover{background:rgba(255,140,0,.13)} .cw-item b{font:500 12px/1.2 Inter,system-ui,sans-serif} .cw-item i{font:400 10.5px/1.3 Inter,system-ui,sans-serif;font-style:normal;color:rgba(255,255,255,.45)}
.cw-pop-row{display:flex;align-items:center;gap:10px;padding:8px;flex-wrap:wrap}
.cw-pop-row label{display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.6);font:500 11.5px/1 Inter,system-ui,sans-serif}
.cw-pop-row .cw-in{width:110px}
.cw-body{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,1fr);min-height:0;flex:1}
.cw-list{overflow:auto;border-right:1px solid rgba(255,255,255,.07)}
.cw-row{display:grid;grid-template-columns:34px 92px 92px 48px 38px minmax(0,1fr);gap:6px;align-items:center;padding:5px 10px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer}
.cw-row.head{position:sticky;top:0;background:#141519;z-index:1;cursor:default;font:600 10.5px/1 Inter,system-ui,sans-serif;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.04em}
.cw-row:hover:not(.head){background:rgba(255,255,255,.035)}
.cw-row.live{box-shadow:inset 3px 0 0 #3ba0ff;background:rgba(59,160,255,.07)}
.cw-row.sel{background:rgba(255,140,0,.12);box-shadow:inset 3px 0 0 #FF8C00}
.cw-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:6px}
.cw-tag{font-style:normal;font:600 9.5px/1 Inter,system-ui,sans-serif;padding:3px 5px;border-radius:4px;background:rgba(59,160,255,.16);color:#9ccfff}
.cw-tag.sp{background:rgba(255,255,255,.08);color:#ddd}
.cw-flag{margin-left:auto;min-width:16px;height:16px;border-radius:8px;font:700 10px/16px Inter,system-ui,sans-serif;text-align:center}
.cw-flag.warn{background:rgba(255,170,60,.2);color:#ffc77a}.cw-flag.err{background:rgba(255,80,80,.22);color:#ff9a9a}
.cw-empty{display:flex;align-items:center;gap:8px;padding:18px 12px;color:rgba(255,255,255,.55);flex-wrap:wrap}
.cw-insp{overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px}
.cw-hint{display:flex;flex-direction:column;align-items:flex-start;gap:8px;color:rgba(255,255,255,.55)} .cw-hint p{margin:0}
.cw-det{margin-top:6px;color:rgba(255,255,255,.7);width:100%} .cw-det summary{cursor:pointer;font:500 12px/1 Inter,system-ui,sans-serif;padding:4px 0}
.cw-text{display:flex;flex-direction:column;gap:4px}
.cw-ruler{display:flex;gap:10px;font:500 10.5px/1 "JetBrains Mono",ui-monospace,monospace;color:rgba(255,255,255,.45)}
.cw-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}
.cw-grid label{display:flex;flex-direction:column;gap:5px;font:500 11px/1 Inter,system-ui,sans-serif;color:rgba(255,255,255,.55)}
.cw-grid input[type=range]{accent-color:#FF8C00}
.cw-tc{display:flex;align-items:center;gap:3px}
.cw-tc .cw-in{width:104px;text-align:center}
.cw-tc button{width:22px;height:26px;border:1px solid rgba(255,255,255,.1);border-radius:5px;background:rgba(255,255,255,.04);color:#ddd;cursor:pointer}
.cw-tc button:hover{background:rgba(255,255,255,.1)}
.cw-seg{display:flex;border:1px solid rgba(255,255,255,.1);border-radius:6px;overflow:hidden}
.cw-seg button{flex:1;height:26px;border:0;background:transparent;color:rgba(255,255,255,.7);font:500 11.5px/1 Inter,system-ui,sans-serif;cursor:pointer}
.cw-seg button+button{border-left:1px solid rgba(255,255,255,.08)}
.cw-seg button.on{background:rgba(255,140,0,.18);color:#ffcf99}
.cw-issues{margin:0;padding:0 0 0 16px;font-size:11.5px} .cw-issues li.error{color:#ff9a9a} .cw-issues li.warn{color:#ffc77a}
.cw-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}
.cw-report{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:6px 10px;font-size:11.5px;border-bottom:1px solid rgba(255,255,255,.07)}
.cw-report.ok{background:rgba(60,190,120,.08)} .cw-report.ok b{color:#8fe3b4} .cw-report.warn{background:rgba(255,170,60,.08)} .cw-report.warn b{color:#ffc77a}
.cw-report .cw-x{margin-left:auto}
.cw-link{border:0;background:none;color:#ffcf99;text-decoration:underline;cursor:pointer;font:inherit;padding:0 3px}
.cw-embed{position:absolute;right:10px;top:42px;bottom:8px;overflow:auto;z-index:60;width:min(640px,calc(100% - 20px));padding:10px;border-radius:10px;background:#17181d;border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 50px rgba(0,0,0,.6)}
.cw-embed-h{display:flex;align-items:center;gap:10px;margin-bottom:8px} .cw-embed-h .cw-x{margin-left:auto}
.cw-embed-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.cw-card{display:flex;flex-direction:column;gap:3px;text-align:left;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.03);color:#e7e7ea;cursor:pointer}
.cw-card b{font:600 11.5px/1.2 Inter,system-ui,sans-serif} .cw-card i{font:400 10.5px/1.3 Inter,system-ui,sans-serif;font-style:normal;color:rgba(255,255,255,.45)}
.cw-card.on{border-color:#FF8C00;background:rgba(255,140,0,.1)}
.cw-check{display:flex;align-items:center;gap:6px}
.cw-note{margin:6px 8px 0;font-size:11px;color:rgba(255,255,255,.5)} .cw-note.ok{color:#8fe3b4} .cw-note.err{color:#ff9a9a}
.cw-prog{position:relative;height:20px;margin:8px;border-radius:5px;background:rgba(255,255,255,.06);overflow:hidden}
.cw-prog div{position:absolute;inset:0 auto 0 0;background:rgba(255,140,0,.35)} .cw-prog span{position:relative;display:block;text-align:center;font:500 11px/20px Inter,system-ui,sans-serif}
`;
