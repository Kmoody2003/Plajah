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
import { X, Clapperboard, MapPin, KeyRound, Users, Film, Clock } from 'lucide-react';
import { Button, Surface, Eyebrow, Chip } from '../ui';
import AriaMark from '../aria/AriaMark';
import {
  watchAnalysisJob,
  fetchStoryReport,
  stillUrl,
  type TaleoAnalysisJob,
  type StoryReport,
  type StoryReportCharacter,
  type StoryReportScene,
} from '../../services/storyIntelService';

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

/** Lazy still image — resolves its download URL on mount, placeholder until then. */
const Still: React.FC<{
  ownerId: string;
  albumId: string;
  path?: string;
  alt?: string;
  className?: string;
}> = ({ ownerId, albumId, path, alt = '', className = '' }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (path) stillUrl(ownerId, albumId, path).then(u => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [ownerId, albumId, path]);

  if (!path || !url) {
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
    <Still ownerId={ownerId} albumId={albumId} path={portraitPath} alt={c.name} className="w-full aspect-video" />
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
  const [job, setJob] = useState<TaleoAnalysisJob | null>(null);
  const [report, setReport] = useState<StoryReport | null>(null);
  const [reportFailed, setReportFailed] = useState(false);

  useEffect(() => watchAnalysisJob(albumId, setJob), [albumId]);

  const done = job?.status === 'READY' || job?.status === 'PARTIAL';
  useEffect(() => {
    if (!job || !done || report) return;
    let live = true;
    fetchStoryReport(job).then(r => {
      if (!live) return;
      if (r) setReport(r); else setReportFailed(true);
    });
    return () => { live = false; };
  }, [job, done, report]);

  // Best-guess portrait per character: the still whose tSec is nearest the
  // character's first appearance.
  const portraits = useMemo(() => {
    const map = new Map<string, string>();
    if (!report?.stills?.length) return map;
    for (const c of report.characters || []) {
      const first = (c.appearances || []).reduce(
        (min, a) => (a.tSec < min ? a.tSec : min),
        c.appearances?.length ? c.appearances[0].tSec : 0
      );
      let best = report.stills[0];
      for (const s of report.stills) {
        if (Math.abs(s.tSec - first) < Math.abs(best.tSec - first)) best = s;
      }
      if (best) map.set(c.refId, best.path);
    }
    return map;
  }, [report]);

  const scenesByAct = useMemo(() => {
    const acts = new Map<number, StoryReportScene[]>();
    for (const s of report?.scenes || []) {
      const arr = acts.get(s.actNumber) || [];
      arr.push(s);
      acts.set(s.actNumber, arr);
    }
    for (const arr of acts.values()) arr.sort((a, b) => a.index - b.index);
    return [...acts.entries()].sort((a, b) => a[0] - b[0]);
  }, [report]);

  const firstStillPathForScene = (scene: StoryReportScene): string | undefined => {
    const idx = scene.stillIndexes?.[0];
    if (idx != null && report?.stills?.[idx]) return report.stills[idx].path;
    return report?.stills?.find(s => s.sceneId === scene.id)?.path;
  };

  const acts = report?.structure?.acts || [];
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

              {/* (d) Scenes by act */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clapperboard size={14} style={{ color: ARIA }} />
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/80">Scenes</h3>
                </div>
                {scenesByAct.map(([actNumber, scenes]) => (
                  <div key={actNumber} className="space-y-2">
                    <Eyebrow className="!text-white/35">Act {actNumber}</Eyebrow>
                    <div className="space-y-2">
                      {scenes.map(s => {
                        const names = (s.characterRefIds || [])
                          .map(id => report.characters?.find(c => c.refId === id)?.name)
                          .filter(Boolean) as string[];
                        return (
                          <div key={s.id} className="flex gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
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
                              <p className="text-[11px] text-white/45 leading-snug line-clamp-2">{s.summary}</p>
                              {names.length > 0 && (
                                <p className="text-[10px] text-white/30 truncate mt-0.5">{names.join(' · ')}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
                      <div className="flex flex-wrap gap-1.5">
                        {report.locations.map(l => (
                          <Chip key={l.refId} title={l.description}>
                            {l.name} <span className="opacity-50">· {l.sceneIds?.length || 0}</span>
                          </Chip>
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
                          <div key={m.refId} className="flex items-start gap-2">
                            <Chip className="shrink-0">{m.narrativeRole.replace('_', ' ')}</Chip>
                            <p className="text-[11px] text-white/50 leading-snug">
                              <span className="font-bold text-white/80">{m.name}</span> — {m.description}
                            </p>
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
          className="flex items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-t shrink-0"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <p className="text-[10px] text-white/30 font-medium leading-snug">
            Apply to World, Fabula project, and library come in Phase 2.
          </p>
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
      </Surface>
    </div>
  );

  return createPortal(overlay, document.body);
};

export default StoryIntelReview;
