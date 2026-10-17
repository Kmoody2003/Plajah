/**
 * StoryIntelReview — "Aria finished watching your film."
 *
 * Owner-facing review surface for Taleo Story Intelligence (Phase 1). Renders
 * as a full overlay: while the worker is running it shows Aria "watching" with
 * a live stage readout; once the job is READY/PARTIAL it fetches report.json
 * and lays out characters, structure, scenes, locations, MacGuffins and the
 * stills gallery. Read-only in Phase 1 — Apply-to-World / Fabula / library
 * actions arrive in Phase 2.
 *
 * Self-contained + lazy-loadable: only ui primitives, AriaMark and the
 * storyIntelService. Violet (#8b5cf6) is the Aria accent; brand orange/cyan
 * mark character tiers per the design system.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Clapperboard, MapPin, KeyRound, Users, Film, Clock, Globe, FileText, CheckCircle2 } from 'lucide-react';
import { Button, Surface, Eyebrow, Chip } from '../ui';
import AriaMark from '../aria/AriaMark';
import {
  watchAnalysisJob,
  fetchStoryReport,
  stillUrl,
  buildFountainFromStoryReport,
  type TaleoAnalysisJob,
  type StoryReport,
  type StoryReportCharacter,
  type StoryReportScene,
} from '../../services/storyIntelService';
import {
  canAccessStoryIntelTools,
  seedFabulaProjectFromStoryReport,
  syncStoryReportToWorldAndUniverse,
  type UniverseSyncResult,
} from '../../services/storyIntelBridge';

const ARIA = '#8b5cf6';

interface StoryIntelReviewProps {
  albumId: string;
  ownerId: string;
  title: string;
  onClose: () => void;
}

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

const STAGE_LABEL: Record<string, string> = {
  WAITING_MEDIA: 'Waiting for the film to finish processing…',
  QUEUED: 'In line for a screening…',
  SAMPLING: 'Sampling frames and audio…',
  PERCEIVING: 'Recognizing faces, places and props…',
  REASONING: 'Thinking about the story…',
  ASSEMBLING: 'Writing up the report…',
  FAILED: 'The screening hit a snag.',
  SKIPPED: 'Analysis was skipped for this title.',
};

/** Lazy still image — resolves its download URL on mount (or uses direct URL), placeholder until then. */
const Still: React.FC<{
  ownerId: string;
  albumId: string;
  path?: string;
  directUrl?: string;
  alt?: string;
  className?: string;
}> = ({ ownerId, albumId, path, directUrl, alt = '', className = '' }) => {
  const isDirectHttp = Boolean(path && /^https?:\/\//i.test(path));
  const [url, setUrl] = useState<string | null>(directUrl || (isDirectHttp ? path! : null));
  useEffect(() => {
    let live = true;
    if (directUrl) {
      setUrl(directUrl);
      return;
    }
    if (path && /^https?:\/\//i.test(path)) {
      setUrl(path);
      return;
    }
    if (path) {
      stillUrl(ownerId, albumId, path).then(u => {
        if (live) setUrl(u);
      });
    }
    return () => {
      live = false;
    };
  }, [ownerId, albumId, path, directUrl]);

  if (!url) {
    return (
      <div className={`bg-white/[0.05] flex items-center justify-center ${className}`}>
        <Film size={16} className="text-white/15" />
      </div>
    );
  }
  return <img src={url} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
};

const TIER_STYLE: Record<StoryReportCharacter['tier'], React.CSSProperties> = {
  MAIN:       { background: 'var(--pj-orange-soft, rgba(255,140,0,0.14))', color: 'var(--pj-orange, #FF8C00)', borderColor: 'rgba(255,140,0,0.35)' },
  SUPPORTING: { background: 'var(--pj-cyan-soft, rgba(0,218,243,0.14))',   color: 'var(--pj-cyan, #00DAF3)',   borderColor: 'rgba(0,218,243,0.35)' },
  MINOR:      { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', borderColor: 'rgba(255,255,255,0.15)' },
};

const CharacterCard: React.FC<{
  c: StoryReportCharacter;
  portraitPath?: string;
  ownerId: string;
  albumId: string;
}> = ({ c, portraitPath, ownerId, albumId }) => (
  <div className="rounded-2xl overflow-hidden bg-white/[0.04] border border-white/[0.08] flex flex-col">
    <div className="relative">
      <Still
        ownerId={ownerId}
        albumId={albumId}
        path={portraitPath || c.portraitPath}
        directUrl={c.imageUrl}
        alt={c.name}
        className="w-full aspect-video"
      />
      {typeof c.bestFrameSec === 'number' && (
        <span className="absolute bottom-1.5 right-1.5 text-[8.5px] font-mono font-bold text-white/85 bg-black/70 px-1.5 py-0.5 rounded border border-white/10">
          ⏱ {fmt(c.bestFrameSec)}
        </span>
      )}
    </div>
    <div className="p-3 space-y-1.5 flex-1">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-black text-white leading-tight">{c.name}</p>
        <span
          className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md border"
          style={TIER_STYLE[c.tier] || TIER_STYLE.MINOR}
        >
          {c.tier}
        </span>
      </div>
      {c.aka?.length > 0 && (
        <p className="text-[10px] text-white/30 truncate">aka {c.aka.join(', ')}</p>
      )}
      <p className="text-[11px] text-white/50 leading-snug line-clamp-3">{c.description}</p>
      <div className="flex items-center gap-3 pt-1 text-[9px] font-black uppercase tracking-widest text-white/35">
        <span className="flex items-center gap-1"><Clock size={10} />{Math.round((c.screenTimeSec || 0) / 60)} min</span>
        <span>{c.dialogueLines || 0} lines</span>
      </div>
    </div>
  </div>
);

const StoryIntelReview: React.FC<StoryIntelReviewProps> = ({ albumId, ownerId, title, onClose }) => {
  const authorized = canAccessStoryIntelTools(ownerId);
  const [job, setJob] = useState<TaleoAnalysisJob | null>(null);
  const [report, setReport] = useState<StoryReport | null>(null);
  const [reportFailed, setReportFailed] = useState(false);
  const [fabulaBusy, setFabulaBusy] = useState(false);
  const [fabulaSeeded, setFabulaSeeded] = useState(false);
  const [worldBusy, setWorldBusy] = useState(false);
  const [worldSyncResult, setWorldSyncResult] = useState<UniverseSyncResult | null>(null);
  const [actionNote, setActionNote] = useState<string>('');

  useEffect(() => {
    if (!authorized) return;
    return watchAnalysisJob(albumId, setJob);
  }, [albumId, authorized]);

  const done = job?.status === 'READY' || job?.status === 'PARTIAL';
  useEffect(() => {
    if (!authorized || !job || !done || report) return;
    let live = true;
    fetchStoryReport(job).then(r => {
      if (!live) return;
      if (r) {
        setReport(r);
        // Automatically build/update the linked Fabula project in the background
        seedFabulaProjectFromStoryReport({
          albumId,
          ownerId,
          title,
          report: r,
          openInFabula: false,
          targetWorkspace: 'script',
        })
          .then(() => { if (live) setFabulaSeeded(true); })
          .catch(() => {});
      } else {
        setReportFailed(true);
      }
    });
    return () => { live = false; };
  }, [authorized, job, done, report, albumId, ownerId, title]);

  const handleOpenInFabula = async () => {
    if (!report || fabulaBusy) return;
    setFabulaBusy(true);
    try {
      const res = await seedFabulaProjectFromStoryReport({
        albumId,
        ownerId,
        title,
        report,
        openInFabula: true,
        targetWorkspace: 'script',
      });
      setFabulaSeeded(true);
      setActionNote(`Fabula project ready (${res.sceneCount} scenes, ${res.shotCount} shots, ${res.dialogueCount} lines) — opening Timecode Script view…`);
      setTimeout(() => onClose(), 350);
    } catch (err: any) {
      setActionNote(`Could not open Fabula: ${err?.message || err}`);
    } finally {
      setFabulaBusy(false);
    }
  };

  const handleSyncToWorld = async () => {
    if (!report || worldBusy) return;
    setWorldBusy(true);
    try {
      const res = await syncStoryReportToWorldAndUniverse({
        albumId,
        ownerId,
        title,
        report,
        publishImmediately: true,
      });
      setWorldSyncResult(res);
      setActionNote(
        res.isExistingUniverse
          ? `Connected "${title}" to existing universe "${res.worldName}" (${res.charactersSynced} characters, ${res.loreSynced} lore entries${res.sharedCharacters.length ? ` · crossover: ${res.sharedCharacters.join(', ')}` : ''})`
          : `Created & populated Plajah World "${res.worldName}" (${res.charactersSynced} characters, ${res.loreSynced} lore entries)`
      );
    } catch (err: any) {
      setActionNote(`World sync error: ${err?.message || err}`);
    } finally {
      setWorldBusy(false);
    }
  };

  // Portrait per character: prioritize explicit imageUrl, portraitPath, portraitStillId,
  // stillIds[0], or dedicated character still in report.stills before falling back to nearest appearance.
  const portraits = useMemo(() => {
    const map = new Map<string, string>();
    const stills = report?.stills || [];
    const stillById = new Map(stills.map(s => [s.id, s.path]));
    for (const c of report?.characters || []) {
      if (c.imageUrl) {
        map.set(c.refId, c.imageUrl);
        continue;
      }
      if (c.portraitPath) {
        map.set(c.refId, c.portraitPath);
        continue;
      }
      if (c.portraitStillId && stillById.has(c.portraitStillId)) {
        map.set(c.refId, stillById.get(c.portraitStillId)!);
        continue;
      }
      if (c.stillIds?.length && stillById.has(c.stillIds[0])) {
        map.set(c.refId, stillById.get(c.stillIds[0])!);
        continue;
      }
      const dedicated =
        stillById.get(`${c.refId}_portrait`) ||
        stillById.get(c.refId);
      if (dedicated) {
        map.set(c.refId, dedicated);
        continue;
      }
      if (!stills.length) continue;
      const targetSec =
        typeof c.bestFrameSec === 'number'
          ? c.bestFrameSec
          : (c.appearances || []).reduce(
              (min, a) => (a.tSec < min ? a.tSec : min),
              c.appearances?.length ? c.appearances[0].tSec : 0
            );
      let best = stills[0];
      for (const s of stills) {
        if (Math.abs(s.tSec - targetSec) < Math.abs(best.tSec - targetSec)) best = s;
      }
      if (best) map.set(c.refId, best.path);
    }
    return map;
  }, [report]);

  const scenesByAct = useMemo(() => {
    const acts = new Map<number, StoryReportScene[]>();
    for (const s of report?.scenes || []) {
      const actNum = s.actNumber ?? (s as any).act ?? 1;
      const arr = acts.get(actNum) || [];
      arr.push(s);
      acts.set(actNum, arr);
    }
    for (const arr of acts.values()) arr.sort((a, b) => a.index - b.index);
    return [...acts.entries()].sort((a, b) => a[0] - b[0]);
  }, [report]);

  const firstStillPathForScene = (scene: StoryReportScene): string | undefined => {
    const idx = scene.stillIndexes?.[0];
    if (idx != null && report?.stills?.[idx]) return report.stills[idx].path;
    return report?.stills?.find(s => s.sceneId === scene.id)?.path;
  };

  const acts = (report?.structure?.acts || []).map((a: any, i) => ({
    ...a,
    number: a.number ?? a.act ?? i + 1,
    title: a.title || a.label || `Act ${a.number ?? a.act ?? i + 1}`,
  }));
  const actsTotal = acts.reduce((t, a) => t + Math.max(0, a.endSec - a.startSec), 0) || 1;

  const confident = (report?.characters || []).filter(c => (c.confidence ?? 1) >= 0.5);
  const unsure = (report?.characters || []).filter(c => (c.confidence ?? 1) < 0.5);

  const working = !!job && !done && job.status !== 'FAILED' && job.status !== 'SKIPPED';
  const pct = Math.max(0, Math.min(100, job?.progress?.pct ?? 0));

  const overlay = (
    <div
      className="fixed inset-0 z-[300] bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <Surface
        level={5}
        shape="sheet"
        padded={false}
        className="w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        style={{ background: '#101016', border: '1px solid rgba(139,92,246,0.25)' }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-3.5 px-5 sm:px-7 py-4 border-b shrink-0"
          style={{ borderColor: 'rgba(139,92,246,0.18)', background: 'linear-gradient(135deg, rgba(139,92,246,0.12), transparent 60%)' }}
        >
          <AriaMark size={38} thinking={working} />
          <div className="min-w-0 flex-1">
            <Eyebrow style={{ color: ARIA }}>Story Intelligence</Eyebrow>
            <h2 className="text-base sm:text-lg font-black text-white leading-tight truncate">
              {done ? <>Aria finished watching &ldquo;{title}&rdquo;</> : <>Aria is watching &ldquo;{title}&rdquo;…</>}
            </h2>
          </div>
          <Button variant="ghost" size="sm" iconOnly aria-label="Close" icon={<X />} onClick={onClose} />
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-8">
          {/* In-flight / failed states */}
          {!done && (
            <div className="py-10 flex flex-col items-center text-center gap-4">
              {!job && (
                <p className="text-sm text-white/45">Looking for the analysis job…</p>
              )}
              {job && (
                <>
                  <p className="text-sm font-bold text-white/75">
                    {STAGE_LABEL[job.status] || job.progress?.stage || 'Working…'}
                  </p>
                  {working && (
                    <div className="w-full max-w-sm space-y-2">
                      <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${ARIA}, #c4b5fd)` }}
                        />
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/35">
                        {job.progress?.stage || job.status} · {Math.round(pct)}%
                        {job.progress?.note ? <span className="normal-case tracking-normal font-medium"> — {job.progress.note}</span> : null}
                      </p>
                    </div>
                  )}
                  {job.status === 'FAILED' && job.error && (
                    <p className="text-[11px] text-white/35 max-w-md">{job.error}</p>
                  )}
                </>
              )}
            </div>
          )}

          {done && !report && (
            <div className="py-10 text-center">
              <p className="text-sm text-white/45">
                {reportFailed ? 'The report could not be loaded. Try again in a moment.' : 'Loading the report…'}
              </p>
            </div>
          )}

          {done && report && (
            <>
              {/* (a) Summary chips */}
              <div className="flex flex-wrap items-center gap-2">
                <Chip>{report.characters?.length || 0} characters</Chip>
                <Chip>{report.scenes?.length || 0} scenes</Chip>
                <Chip>{acts.length} acts</Chip>
                {report.locations?.length > 0 && <Chip>{report.locations.length} locations</Chip>}
                {(job?.coverage === 'PARTIAL' || job?.status === 'PARTIAL') && (
                  <Chip style={{ background: 'var(--pj-warning-soft, rgba(245,158,11,0.14))', color: 'var(--pj-warning, #F59E0B)' }}>
                    Partial coverage
                  </Chip>
                )}
              </div>

              {/* (c) Story card — first so the creator sees the read immediately */}
              <Surface level={3} className="space-y-4" style={{ background: 'rgba(139,92,246,0.06)', borderColor: 'rgba(139,92,246,0.18)' }}>
                <div>
                  <Eyebrow style={{ color: ARIA }}>Logline</Eyebrow>
                  <p className="text-base font-bold text-white leading-snug">{report.logline}</p>
                </div>
                <p className="text-sm text-white/60 leading-relaxed">{report.synopsis}</p>
                {report.themes?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {report.themes.map(t => <Chip key={t}>{t}</Chip>)}
                  </div>
                )}
                {acts.length > 0 && (
                  <div className="space-y-1.5">
                    <Eyebrow style={{ color: ARIA }}>Structure</Eyebrow>
                    <div className="flex w-full h-9 rounded-xl overflow-hidden gap-[2px]">
                      {acts.map((a, i) => (
                        <div
                          key={a.number}
                          className="h-full flex items-center justify-center px-1 min-w-[40px]"
                          style={{
                            flexGrow: Math.max(1, a.endSec - a.startSec),
                            flexBasis: 0,
                            background: `rgba(139,92,246,${0.16 + 0.1 * (i % 3)})`,
                          }}
                          title={`${a.title} · ${fmt(a.startSec)}–${fmt(a.endSec)}${a.turningPoint ? ` · ${a.turningPoint}` : ''}`}
                        >
                          <span className="text-[9px] font-black uppercase tracking-widest text-white/70 truncate">
                            {a.title || `Act ${a.number}`}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                      {acts.map(a => (
                        <p key={a.number} className="text-[11px] text-white/40 leading-snug">
                          <span className="font-black text-white/60">Act {a.number}.</span> {a.summary}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </Surface>

              {/* (b) Characters */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Users size={14} style={{ color: ARIA }} />
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/80">Characters</h3>
                </div>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
                  {confident.map(c => (
                    <CharacterCard key={c.refId} c={c} portraitPath={portraits.get(c.refId)} ownerId={ownerId} albumId={albumId} />
                  ))}
                </div>
                {unsure.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30">
                      Aria wasn&rsquo;t sure about these
                    </p>
                    <div className="grid gap-3 opacity-70" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
                      {unsure.map(c => (
                        <CharacterCard key={c.refId} c={c} portraitPath={portraits.get(c.refId)} ownerId={ownerId} albumId={albumId} />
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* (d) Scenes by act (with Shot-by-Shot & Line-by-Line breakdown) */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clapperboard size={14} style={{ color: ARIA }} />
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/80">Scenes · Shots · Dialogue</h3>
                </div>
                {scenesByAct.map(([actNumber, scenes]) => (
                  <div key={actNumber} className="space-y-2.5">
                    <Eyebrow className="!text-white/35">Act {actNumber}</Eyebrow>
                    <div className="space-y-3">
                      {scenes.map(s => {
                        const names = (s.characterRefIds || [])
                          .map(id => report.characters?.find(c => c.refId === id)?.name)
                          .filter(Boolean) as string[];
                        return (
                          <div key={s.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2.5">
                            <div className="flex gap-3">
                              <Still
                                ownerId={ownerId}
                                albumId={albumId}
                                path={firstStillPathForScene(s)}
                                alt={s.title}
                                className="w-24 sm:w-28 aspect-video rounded-lg shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/30 truncate">
                                  {s.slugline} · {fmt(s.startSec)}–{fmt(s.endSec)}
                                </p>
                                <p className="text-sm font-bold text-white leading-tight truncate">{s.title}</p>
                                <p className="text-[11px] text-white/55 leading-snug">{s.summary}</p>
                                {names.length > 0 && (
                                  <p className="text-[10px] text-white/30 truncate mt-0.5">{names.join(' · ')}</p>
                                )}
                              </div>
                            </div>
                            {Array.isArray(s.shots) && s.shots.length > 0 && (
                              <div className="pl-2 border-l-2 border-purple-500/30 space-y-1.5 pt-1">
                                {s.shots.map((sh, shIdx) => (
                                  <div key={shIdx} className="text-[11px] bg-black/30 rounded-lg p-2 border border-white/[0.04] space-y-1">
                                    <div className="flex items-center justify-between text-[9.5px] font-mono text-purple-300/80">
                                      <span className="font-bold">{sh.slug || `S${shIdx + 1}`} · {sh.type || 'MED'}</span>
                                      <span>{fmt(sh.startSec)}–{fmt(sh.endSec)}</span>
                                    </div>
                                    <p className="text-white/70 leading-snug">{sh.action || sh.camera}</p>
                                    {Array.isArray(sh.dialogue) && sh.dialogue.map((dl, dlIdx) => (
                                      <div key={dlIdx} className="pl-2.5 border-l border-amber-400/40 text-[10.5px] text-white/85">
                                        <span className="font-black text-amber-300">{dl.speaker}: </span>
                                        {dl.parenthetical && <span className="italic text-white/45">({dl.parenthetical}) </span>}
                                        <span>&ldquo;{dl.text}&rdquo;</span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>

              {/* (d2) Full Reverse-Engineered Screenplay (Fountain Format) */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clapperboard size={14} style={{ color: ARIA }} />
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/80">
                      Reverse Screenplay (Fountain)
                    </h3>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const ftn = buildFountainFromStoryReport(report, title);
                      navigator.clipboard?.writeText(ftn).catch(() => {});
                    }}
                  >
                    Copy Screenplay (.fountain)
                  </Button>
                </div>
                <pre className="p-4 rounded-2xl bg-black/60 border border-white/10 text-[11px] text-white/80 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
                  {buildFountainFromStoryReport(report, title)}
                </pre>
              </section>

              {/* (e) Locations + MacGuffins */}
              {(report.locations?.length > 0 || report.macguffins?.length > 0) && (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                  {report.locations?.length > 0 && (
                    <Surface level={1} className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <MapPin size={13} style={{ color: ARIA }} />
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Locations</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {report.locations.map(l => (
                          <div
                            key={l.refId}
                            className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/[0.07]"
                          >
                            {(l.imageUrl || l.portraitPath) && (
                              <Still
                                ownerId={ownerId}
                                albumId={albumId}
                                path={l.portraitPath}
                                directUrl={l.imageUrl}
                                alt={l.name}
                                className="w-14 h-10 rounded-lg shrink-0"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-white truncate">
                                {l.name}{' '}
                                <span className="text-[9px] text-white/40 font-normal">
                                  · {l.sceneIds?.length || 0} sc
                                </span>
                              </p>
                              <p className="text-[10px] text-white/45 line-clamp-2 leading-tight">{l.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Surface>
                  )}
                  {report.macguffins?.length > 0 && (
                    <Surface level={1} className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <KeyRound size={13} style={{ color: ARIA }} />
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Props &amp; Motifs</h3>
                      </div>
                      <div className="space-y-2">
                        {report.macguffins.map(m => (
                          <div key={m.refId} className="flex items-start gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/[0.07]">
                            {(m.imageUrl || m.portraitPath) && (
                              <Still
                                ownerId={ownerId}
                                albumId={albumId}
                                path={m.portraitPath}
                                directUrl={m.imageUrl}
                                alt={m.name}
                                className="w-14 h-10 rounded-lg shrink-0"
                              />
                            )}
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-xs text-white/90">{m.name}</span>
                                <Chip className="shrink-0">{m.narrativeRole.replace('_', ' ')}</Chip>
                              </div>
                              <p className="text-[10.5px] text-white/50 leading-snug">{m.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Surface>
                  )}
                </div>
              )}

              {/* (f) Stills gallery */}
              {report.stills?.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Film size={14} style={{ color: ARIA }} />
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/80">Stills</h3>
                    <span className="text-[10px] font-black text-white/25">{report.stills.length}</span>
                  </div>
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
                    {report.stills.map(s => (
                      <div key={s.id} className="relative rounded-lg overflow-hidden">
                        <Still ownerId={ownerId} albumId={albumId} path={s.path} alt={`Still at ${fmt(s.tSec)}`} className="w-full aspect-video" />
                        <span className="absolute bottom-1 right-1.5 text-[9px] font-black text-white/70 bg-black/50 px-1 rounded">
                          {fmt(s.tSec)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-t shrink-0"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {actionNote ? (
              <p className="text-[11px] text-emerald-300 font-semibold leading-snug flex items-center gap-1.5 truncate">
                <CheckCircle2 size={13} className="shrink-0" />
                <span className="truncate">{actionNote}</span>
              </p>
            ) : (
              <p className="text-[10px] text-white/45 font-medium leading-snug">
                {fabulaSeeded
                  ? '✓ Fabula project & clip-linked Timecode Script ready. Sync to Plajah World to connect characters & lore across your universe.'
                  : 'Generate a clip-linked Fabula project or populate your Plajah World & Universe directly from this reverse screenplay.'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {report && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSyncToWorld}
                  disabled={worldBusy}
                >
                  <span className="flex items-center gap-1.5">
                    <Globe size={13} />
                    {worldBusy
                      ? 'Syncing Universe…'
                      : worldSyncResult
                      ? `Synced: ${worldSyncResult.worldName}`
                      : 'Sync to Plajah World & Universe'}
                  </span>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleOpenInFabula}
                  disabled={fabulaBusy}
                >
                  <span className="flex items-center gap-1.5">
                    <FileText size={13} />
                    {fabulaBusy ? 'Opening Fabula…' : 'Open in Fabula (Timecode Script)'}
                  </span>
                </Button>
              </>
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      </Surface>
    </div>
  );

  return createPortal(overlay, document.body);
};

export default StoryIntelReview;
