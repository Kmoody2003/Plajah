/**
 * Set-to-Cut Assembly — the Post-stage workspace between "we shot it" and "we're cutting it".
 *
 * Reads the production's takes and shows the rough cut AS IT WILL BE BUILT (same pure planner the
 * bridge uses — services/filmEditBridge.planAssembly — so what you see here is what lands on V1):
 * a strip of selects in scene order, a coverage row per scene, a monitor to review any take, and the
 * three levers that matter: circle a different take, let the script-match pick the best reading, and
 * send/refresh the LIVE cut in Fabula. Capture/logging stays in the Take Logger (Production stage).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Scissors, Sparkles, CircleDot, Clapperboard, ArrowRight, RefreshCw, Film } from 'lucide-react';
import { useProd } from '../film/FilmProductionSuite';
import * as FilmProduction from '../../services/filmProductionService';
import { planAssembly, buildFabulaProjectFromTakes, getLinkedFabulaProject, type SelectReason, type AssemblyRow } from '../../services/filmEditBridge';
import { transcribeAndScoreTake } from '../../services/takeScoring';
import { getBytes } from '../../services/fabula/mediaStore';
import { Button, Surface, Eyebrow } from '../ui';

const REASON_LABEL: Record<SelectReason, string> = {
  circled: 'Circled',
  'best-reading': 'Best reading',
  rated: 'Top rated',
  'first-take': 'First take',
};
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface Props {
  /** Jump to another Studio tab (e.g. the Take Logger to log more coverage). */
  onGoTab?: (subtabId: string) => void;
}

export const SetToCutAssembly: React.FC<Props> = ({ onGoTab }) => {
  const { prod, scenes, takes, members, isOwner, readOnly, can } = useProd();
  const canManage = !readOnly && (isOwner || can('MANAGE_REPORTS') || can('EDIT_SCRIPT_BREAKDOWN'));

  const plan = useMemo(() => planAssembly(scenes, takes), [scenes, takes]);
  const scored = takes.filter(t => typeof t.matchScore === 'number').length;
  const circled = takes.filter(t => t.circled).length;
  const shotTakes = takes.filter(t => t.proxyUrl || t.proxyAssetId);

  const [focusScene, setFocusScene] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; warn?: boolean } | null>(null);
  const [busy, setBusy] = useState<'score' | 'send' | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [linkedTitle, setLinkedTitle] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (prod) getLinkedFabulaProject(prod.id).then(l => { if (alive) setLinkedTitle(l?.title ?? null); });
    return () => { alive = false; };
  }, [prod?.id, busy]);

  // Default the monitor to the first scene that has a select.
  useEffect(() => {
    if (focusScene && plan.rows.some(r => r.scene.id === focusScene)) return;
    const first = plan.rows.find(r => r.select) || plan.rows[0];
    setFocusScene(first?.scene.id ?? null);
    setPreviewId(first?.select?.take.id ?? null);
  }, [plan, focusScene]);

  const focusRow: AssemblyRow | undefined = plan.rows.find(r => r.scene.id === focusScene);
  const previewTake = takes.find(t => t.id === previewId) || focusRow?.select?.take;

  // Monitor source: the uploaded proxy, or on-device bytes for the live-stream tier.
  const [src, setSrc] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    const revoke = () => { if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; } };
    revoke(); setSrc(null);
    if (!previewTake) return undefined;
    if (previewTake.proxyUrl) { setSrc(previewTake.proxyUrl); return undefined; }
    if (previewTake.proxyAssetId) {
      getBytes('studio:blob:' + previewTake.proxyAssetId).then(b => {
        if (!alive || !b) return;
        urlRef.current = URL.createObjectURL(b); setSrc(urlRef.current);
      });
    }
    return () => { alive = false; revoke(); };
  }, [previewTake?.id, previewTake?.proxyUrl, previewTake?.proxyAssetId]);

  const focus = (row: AssemblyRow) => { setFocusScene(row.scene.id); setPreviewId(row.select?.take.id ?? row.takes[0]?.id ?? null); };

  // One circle per scene: circling a take un-circles the others.
  const setCircled = (sceneId: string, takeId: string, on: boolean) => {
    if (!prod || !canManage) return;
    if (on) takes.filter(t => t.sceneId === sceneId && t.circled && t.id !== takeId).forEach(t => FilmProduction.patchTake(prod.id, t.id, { circled: false }));
    FilmProduction.patchTake(prod.id, takeId, { circled: on });
  };
  const bestReading = (sceneId: string) => {
    const sc = takes.filter(t => t.sceneId === sceneId && typeof t.matchScore === 'number' && t.status !== 'NG');
    if (!sc.length) return;
    const best = [...sc].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))[0];
    setCircled(sceneId, best.id, true);
  };

  const castNames = members.filter(m => m.isCast || m.dept === 'CAST').map(m => m.character || m.name).filter(Boolean) as string[];
  const scoreAll = async () => {
    if (!prod) return;
    if (!prod.currentDraftId) { setMessage({ text: 'Greenlight a script first — scoring matches each take against the scripted dialogue.', warn: true }); return; }
    if (!shotTakes.length) { setMessage({ text: 'Add takes with proxies first (Take Logger).', warn: true }); return; }
    setBusy('score'); setMessage(null); setProgress({ done: 0, total: shotTakes.length });
    try {
      const elements = await FilmProduction.fetchDraftElements(prod.id, prod.currentDraftId);
      let done = 0; let failed = 0;
      for (const t of shotTakes) {
        const scene = scenes.find(s => s.id === t.sceneId);
        if (scene) {
          try {
            const r = await transcribeAndScoreTake(t, scene, elements, castNames);
            if (r) await FilmProduction.patchTake(prod.id, t.id, { transcript: r.transcript, matchScore: r.matchScore ?? undefined });
          } catch { failed += 1; }
        }
        done += 1; setProgress({ done, total: shotTakes.length });
      }
      setMessage({ text: `Scored ${done - failed}/${done} take${done === 1 ? '' : 's'} — uncircled scenes now cut the best-reading take.`, warn: failed > 0 });
    } finally { setBusy(null); setProgress(null); }
  };

  const send = async () => {
    if (!prod) return;
    setBusy('send'); setMessage(null);
    try {
      const r = await buildFabulaProjectFromTakes(prod, scenes, takes);
      if (!r) setMessage({ text: 'Add at least one take with a proxy first.', warn: true });
      else setMessage({ text: `${r.updated ? 'Updated the live cut' : 'Created the live cut'} — ${r.clipCount} scene${r.clipCount === 1 ? '' : 's'}, ${fmt(r.runtime)} — opening the editor…` });
    } catch (e) { setMessage({ text: e instanceof Error ? e.message : 'Assembly failed.', warn: true }); }
    finally { setBusy(null); }
  };

  if (!scenes.length) {
    return (
      <Surface level={1}><Eyebrow>Set to Cut · Assembly</Eyebrow>
        <p style={{ marginTop: 8, opacity: 0.7 }}>No scenes yet. Greenlight a script or add scenes — takes attach to scenes and the cut reads them in order.</p>
      </Surface>
    );
  }

  return (
    <div className="sc">
      <Surface level={2} brand>
        <div className="sc-hero">
          <div style={{ minWidth: 0, flex: 1 }}>
            <Eyebrow>Set to Cut · Assembly</Eyebrow>
            <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.7, maxWidth: '60ch' }}>
              The edit begins as the first take is printed. Selects lay in scene order — your circle wins, then the best script reading — and the cut stays alive: re-send and the same Fabula project updates in place.
            </p>
            <div className="sc-stats">
              <div className="sc-stat"><b>{plan.covered}/{plan.total}</b><span>Scenes covered</span></div>
              <div className="sc-stat"><b>{fmt(plan.runtime)}</b><span>Rough cut</span></div>
              <div className="sc-stat"><b>{circled}</b><span>Circled</span></div>
              <div className="sc-stat"><b>{scored}/{shotTakes.length}</b><span>Scored</span></div>
            </div>
          </div>
          <div className="pj-actions" style={{ flexWrap: 'wrap' }}>
            {canManage && (
              <Button variant="outline" size="sm" icon={<Sparkles size={14} />} loading={busy === 'score'} disabled={!shotTakes.length || !!busy} onClick={scoreAll}>
                {progress ? `Scoring ${progress.done}/${progress.total}` : 'Score takes'}
              </Button>
            )}
            <Button variant="primary" size="sm" icon={linkedTitle ? <RefreshCw size={14} /> : <Scissors size={14} />} loading={busy === 'send'} disabled={!shotTakes.length || !!busy} onClick={send}
              title={linkedTitle ? `Updates “${linkedTitle}” in place — your other edits are untouched` : 'Creates a Fabula project with a Live Assembly edit'}>
              {linkedTitle ? 'Update live cut' : 'Send to Fabula'}
            </Button>
          </div>
        </div>
        {message && <p className={`sc-note${message.warn ? ' sc-note--warn' : ''}`} role="status">{message.text}</p>}
        {plan.gaps.length > 0 && (
          <p className="sc-note sc-note--warn">
            {plan.gaps.length} scene{plan.gaps.length === 1 ? '' : 's'} with no usable coverage: {plan.gaps.slice(0, 10).map(s => s.sceneNum).join(', ')}{plan.gaps.length > 10 ? '…' : ''}.{' '}
            {onGoTab && <button type="button" onClick={() => onGoTab('edit')} style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Log takes in the Take Logger →</button>}
          </p>
        )}
      </Surface>

      <div>
        <div className="sc-strip" role="list" aria-label="Rough cut, in scene order">
          {plan.rows.map(r => (
            <button key={r.scene.id} type="button" role="listitem" aria-current={focusScene === r.scene.id}
              className={`sc-clip ${r.select ? `sc-clip--${r.select.reason}` : 'sc-clip--gap'}`}
              style={{ flexGrow: Math.max(1, r.duration || 4) }}
              title={r.select ? `Sc ${r.scene.sceneNum} · T${r.select.take.takeNumber} — ${REASON_LABEL[r.select.reason]}` : `Sc ${r.scene.sceneNum} — no coverage`}
              onClick={() => focus(r)}>
              <b>{r.scene.sceneNum}</b>
              <span>{r.select ? `T${r.select.take.takeNumber} · ${fmt(r.duration)}` : 'gap'}</span>
            </button>
          ))}
        </div>
        <div className="sc-legend" style={{ marginTop: 8 }}>
          <span><i style={{ background: 'var(--pj-success)' }} />Circled</span>
          <span><i style={{ background: 'var(--pj-cyan)' }} />Best reading</span>
          <span><i style={{ background: 'var(--pj-orange)' }} />Top rated</span>
          <span><i style={{ background: 'var(--pj-lilac)' }} />First take</span>
          <span><i style={{ background: 'var(--pj-warning)' }} />Coverage gap</span>
        </div>
      </div>

      <div className="sc-split">
        <div className="sc-rows">
          {plan.rows.map(r => {
            const hasScores = r.takes.filter(t => typeof t.matchScore === 'number').length >= 2;
            return (
              <div key={r.scene.id} className="sc-row" aria-current={focusScene === r.scene.id}>
                <div className="sc-row-head">
                  <button type="button" className="sc-num" onClick={() => focus(r)} style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer' }}>{r.scene.sceneNum}</button>
                  <span className="sc-set">{r.scene.intExt}/{String(r.scene.dayNight).slice(0, 3)} · {r.scene.set}</span>
                  <span className={`sc-badge sc-badge--${r.select ? r.select.reason : 'gap'}`}>
                    {r.select ? `◎ T${r.select.take.takeNumber} · ${REASON_LABEL[r.select.reason]}` : r.takes.length ? 'No usable take' : 'No coverage'}
                  </span>
                  {canManage && hasScores && <Button variant="ghost" size="xs" icon={<Sparkles size={12} />} onClick={() => bestReading(r.scene.id)} title="Circle the take that best matches the scripted dialogue">Best reading</Button>}
                </div>
                {r.takes.length > 0 && (
                  <div className="sc-takes">
                    {r.takes.map(t => (
                      <button key={t.id} type="button" className="sc-take" data-sel={r.select?.take.id === t.id} data-ng={t.status === 'NG'}
                        onClick={() => { setFocusScene(r.scene.id); setPreviewId(t.id); }}
                        title={t.note || `Review take ${t.takeNumber}`}>
                        {t.circled && <CircleDot size={11} color="var(--pj-success)" />}
                        <span>T{t.takeNumber}</span>
                        {t.duration ? <em>{Math.round(t.duration)}s</em> : null}
                        {typeof t.matchScore === 'number' && <em>{t.matchScore}%</em>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Surface level={2} className="sc-monitor" padded>
          {previewTake && src ? (
            <video key={previewTake.id} className="sc-video" src={src} controls playsInline preload="metadata" />
          ) : (
            <div className="sc-empty"><div><Film size={22} style={{ opacity: 0.6 }} /><div style={{ marginTop: 6 }}>Pick a scene or take to review it here.</div></div></div>
          )}
          {previewTake && focusRow && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <b style={{ fontSize: 13 }}>Sc {previewTake.sceneNum} · Take {previewTake.takeNumber}</b>
                  <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
                    {previewTake.status}{previewTake.rating ? ` · ${'★'.repeat(previewTake.rating)}` : ''}{typeof previewTake.matchScore === 'number' ? ` · ${previewTake.matchScore}% script match` : ''}
                  </div>
                </div>
                {canManage && (
                  <Button variant={previewTake.circled ? 'success' : 'secondary'} size="xs" icon={<CircleDot size={12} />} onClick={() => setCircled(previewTake.sceneId, previewTake.id, !previewTake.circled)}>
                    {previewTake.circled ? 'Circled' : 'Circle'}
                  </Button>
                )}
              </div>
              {previewTake.transcript && previewTake.transcript.length > 0 && (
                <div className="sc-transcript" aria-label="Transcript">
                  {previewTake.transcript.map((l, i) => <div key={i}>{l.speaker ? <b>{l.speaker}: </b> : null}{l.text}</div>)}
                </div>
              )}
            </>
          )}
          {onGoTab && (
            <Button variant="ghost" size="sm" icon={<Clapperboard size={14} />} iconRight={<ArrowRight size={14} />} onClick={() => onGoTab('edit')}>Take Logger</Button>
          )}
        </Surface>
      </div>
    </div>
  );
};

export default SetToCutAssembly;
