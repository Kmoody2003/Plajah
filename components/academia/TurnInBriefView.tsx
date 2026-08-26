// TurnInBriefView — the teacher's turn-in dashboard for a scanned assignment.
//
// This is the payoff of the completed-paper pipeline: after students turn work in (digitally or as a
// photographed paper), the teacher opens one screen that shows who's done, the class average, who to
// look at first, which questions the class struggled with, and — per student — the pre-assessed
// answers with a suggested grade to confirm. Fed by `buildTurnInBrief` over per-student
// `WorksheetPreAssessment`s; in a demo it simulates a class, in production it reads real submissions.

import React, { useMemo, useState, useEffect } from 'react';
import { ClipboardCheck, ChevronDown, ChevronRight, Check, X, HelpCircle, Circle, AlertTriangle, Users , Loader2 } from 'lucide-react';
import type { DigitalWorksheet } from '../../services/worksheetDigitizer';
import {
  buildTurnInBrief, simulateTurnIns, type WorksheetPreAssessment, type FieldResponse, type TurnInBrief,
} from '../../services/worksheetGrading';

const T = {
  card: '#12121a', cardAlt: '#15151f', border: '#20202c', ink: '#fff', muted: '#9a9aa6', faint: '#777',
  green: '#5fd17f', gold: '#FFD24A', red: '#ff8080', blue: '#36c5f0', violet: '#8166e6', cyan: '#00c8f3',
};
const REC_META: Record<string, { label: string; color: string }> = {
  ready_to_finalize: { label: 'Ready', color: T.green },
  needs_review: { label: 'Needs review', color: T.gold },
  mostly_blank: { label: 'Mostly blank', color: T.red },
};
const STATUS_META: Record<FieldResponse['status'], { color: string; Icon: any; label: string }> = {
  correct: { color: T.green, Icon: Check, label: 'Correct' },
  incorrect: { color: T.red, Icon: X, label: 'Incorrect' },
  needs_review: { color: T.gold, Icon: HelpCircle, label: 'Review' },
  blank: { color: T.faint, Icon: Circle, label: 'Blank' },
};

const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14 };
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <div style={{ fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 800, color: color || T.muted, marginBottom: 8 }}>{children}</div>
);
const scoreColor = (pct: number | null) => pct === null ? T.muted : pct >= 80 ? T.green : pct >= 60 ? T.gold : T.red;

const TurnInBriefView: React.FC<{
  sheet: DigitalWorksheet;
  roster: Array<{ id: string; name: string }>;
  assessments?: WorksheetPreAssessment[];
  simulate?: boolean;
  /** Live classes pass a loader (e.g. fetchAssignmentBrief) instead of assessments/simulate. */
  loadBrief?: () => Promise<TurnInBrief>;
  /** Persist a teacher confirm/override of one suggested grade. */
  onConfirmField?: (studentId: string, fieldId: string, correct: boolean) => void;
}> = ({ sheet, roster, assessments, simulate, loadBrief, onConfirmField }) => {
  const [loaded, setLoaded] = useState<{ brief: TurnInBrief; byId: Map<string, WorksheetPreAssessment> } | null>(null);
  const [loading, setLoading] = useState(!!loadBrief);
  // Teacher confirmations for this session: `${studentId}:${fieldId}` → confirmed correctness.
  const [confirms, setConfirms] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!loadBrief) return;
    let live = true;
    setLoading(true);
    loadBrief().then(brief => { if (live) { setLoaded({ brief, byId: new Map() }); setLoading(false); } }).catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [loadBrief]);

  const local = useMemo(() => {
    const list = assessments ?? (simulate ? simulateTurnIns(sheet, roster, 1) : []);
    const byId = new Map(list.map(a => [a.studentId, a]));
    return { brief: buildTurnInBrief(sheet.title, list, roster, 1), byId };
  }, [sheet, roster, assessments, simulate]);

  if (loading) return <div style={{ ...card, padding: 24, display: 'flex', alignItems: 'center', gap: 10, color: T.muted }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading turn-ins…</div>;
  const { brief, byId } = loadBrief && loaded ? loaded : local;
  const confirmField = (studentId: string, fieldId: string, correct: boolean) => {
    setConfirms(c => ({ ...c, [`${studentId}:${fieldId}`]: correct }));
    onConfirmField?.(studentId, fieldId, correct);
  };
  // `open === undefined` means untouched → default to the first review student; null = closed.
  const effectiveOpen = open === undefined ? (brief.needsReviewQueue[0]?.studentId ?? null) : open;
  const maxBand = Math.max(1, ...brief.distribution.map(d => d.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header stats */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `${T.cyan}22`, display: 'grid', placeItems: 'center' }}><ClipboardCheck size={18} color={T.cyan} /></div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>{sheet.title || 'Assignment'} · turn-in brief</div>
            <div style={{ fontSize: 12, color: T.muted }}>Pre-assessed automatically — confirm or adjust before finalizing.</div>
          </div>
          {simulate && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: T.gold, border: `1px solid ${T.gold}55`, borderRadius: 99, padding: '3px 8px' }}>Simulated class</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginTop: 14 }}>
          <Stat label="Turned in" value={`${brief.turnedIn}/${brief.rosterSize}`} icon={<Users size={13} />} />
          <Stat label="Class average" value={brief.averageScorePct === null ? '—' : `${brief.averageScorePct}%`} color={scoreColor(brief.averageScorePct)} />
          <Stat label="Avg completion" value={`${brief.averageCompletionPct}%`} />
          <Stat label="Need review" value={String(brief.needsReviewQueue.length)} color={brief.needsReviewQueue.length ? T.gold : T.green} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
        {/* Score distribution */}
        <div style={{ ...card, padding: 16 }}>
          <Eyebrow>Score distribution</Eyebrow>
          {brief.averageScorePct === null ? (
            <div style={{ color: T.faint, fontSize: 12 }}>No auto-gradable questions on this worksheet — every answer is teacher-reviewed.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {brief.distribution.map(d => (
                <div key={d.band} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 52, fontSize: 11, color: T.muted, fontVariantNumeric: 'tabular-nums' }}>{d.band}</span>
                  <div style={{ flex: 1, height: 14, background: '#000', borderRadius: 4, overflow: 'hidden', border: `1px solid ${T.border}` }}>
                    <div style={{ width: `${(d.count / maxBand) * 100}%`, height: '100%', background: d.band === '0–59' ? T.red : d.band === '60–69' ? T.gold : T.green }} />
                  </div>
                  <span style={{ width: 18, textAlign: 'right', fontSize: 11, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{d.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Hardest questions */}
        <div style={{ ...card, padding: 16 }}>
          <Eyebrow color={T.gold}>Where the class struggled</Eyebrow>
          {brief.hardestFields.length === 0 ? (
            <div style={{ color: T.faint, fontSize: 12 }}>No clear miss pattern yet — needs more auto-graded turn-ins.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {brief.hardestFields.map(f => (
                <div key={f.fieldId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{f.label}</span>
                    <span style={{ color: T.red, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Math.round(f.missRate * 100)}% missed</span>
                  </div>
                  <div style={{ height: 6, background: '#000', borderRadius: 99, overflow: 'hidden', border: `1px solid ${T.border}` }}>
                    <div style={{ width: `${f.missRate * 100}%`, height: '100%', background: T.red }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Roster with drill-down */}
      <div style={{ ...card, padding: 16 }}>
        <Eyebrow>Students · {brief.needsReviewQueue.length ? 'review queue first' : 'all set'}</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {orderedRows(brief).map(row => {
            const a = byId.get(row.studentId);
            const rec = row.recommendation ? REC_META[row.recommendation] : null;
            const isOpen = effectiveOpen === row.studentId;
            return (
              <div key={row.studentId} style={{ border: `1px solid ${T.border}`, borderRadius: 10, background: T.cardAlt, overflow: 'hidden' }}>
                <button
                  onClick={() => setOpen(isOpen ? null : row.studentId)}
                  disabled={row.status === 'not_turned_in'}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', color: T.ink, cursor: row.status === 'not_turned_in' ? 'default' : 'pointer', textAlign: 'left' }}
                >
                  {row.status === 'turned_in' ? (isOpen ? <ChevronDown size={15} color={T.muted} /> : <ChevronRight size={15} color={T.muted} />) : <span style={{ width: 15 }} />}
                  <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 90 }}>{row.studentName}</span>
                  {row.status === 'not_turned_in' ? (
                    <span style={{ fontSize: 11, color: T.faint, fontStyle: 'italic' }}>not turned in</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 11, color: T.muted, fontVariantNumeric: 'tabular-nums', width: 78 }}>{row.completionPct}% done</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(row.estimatedScorePct), width: 48, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.estimatedScorePct === null ? '—' : `${row.estimatedScorePct}%`}</span>
                      {rec && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: rec.color, border: `1px solid ${rec.color}55`, borderRadius: 99, padding: '3px 8px', minWidth: 92, textAlign: 'center' }}>{rec.label}</span>}
                    </>
                  )}
                </button>
                {isOpen && a && (
                  <div style={{ borderTop: `1px solid ${T.border}`, padding: '4px 12px 12px' }}>
                    {a.flags.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
                        {a.flags.map(f => <span key={f} style={{ fontSize: 10, color: T.gold, border: `1px solid ${T.gold}44`, borderRadius: 99, padding: '2px 8px' }}><AlertTriangle size={9} style={{ verticalAlign: -1, marginRight: 3 }} />{f.replace(/_/g, ' ')}</span>)}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                      {a.perField.map(fr => {
                        const meta = STATUS_META[fr.status];
                        return (
                          <div key={fr.fieldId} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, padding: '6px 0', borderTop: `1px solid ${T.border}55` }}>
                            <meta.Icon size={14} color={meta.color} style={{ marginTop: 2, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: T.muted, fontSize: 11 }}>{fr.label}</div>
                              <div style={{ color: T.ink }}>
                                {fr.status === 'blank' ? <span style={{ color: T.faint, fontStyle: 'italic' }}>(no answer)</span> : (fr.extracted || <span style={{ color: T.faint, fontStyle: 'italic' }}>marked answered · unreadable</span>)}
                                {fr.expected !== undefined && <span style={{ color: T.faint }}> · key: {fr.expected}</span>}
                              </div>
                            </div>
                            {fr.suggestedCorrect !== undefined && (() => {
                              const key = `${row.studentId}:${fr.fieldId}`;
                              const confirmed = confirms[key];
                              if (confirmed !== undefined) {
                                const col = confirmed ? T.green : T.red;
                                return <span style={{ fontSize: 10, fontWeight: 800, color: '#08130c', background: col, borderRadius: 99, padding: '3px 9px', whiteSpace: 'nowrap' }}><Check size={9} style={{ verticalAlign: -1, marginRight: 3 }} />marked {confirmed ? 'right' : 'wrong'}</span>;
                              }
                              return (
                                <span style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
                                  <button onClick={() => confirmField(row.studentId, fr.fieldId, true)} title="Mark correct" style={{ fontSize: 10, fontWeight: 800, color: T.green, background: fr.suggestedCorrect ? `${T.green}1f` : 'transparent', border: `1px solid ${T.green}66`, borderRadius: 99, padding: '2px 8px', cursor: 'pointer' }}>✓{fr.suggestedCorrect ? ' looks right' : ''}</button>
                                  <button onClick={() => confirmField(row.studentId, fr.fieldId, false)} title="Mark wrong" style={{ fontSize: 10, fontWeight: 800, color: T.red, background: !fr.suggestedCorrect ? `${T.red}1f` : 'transparent', border: `1px solid ${T.red}66`, borderRadius: 99, padding: '2px 8px', cursor: 'pointer' }}>✗{!fr.suggestedCorrect ? ' looks wrong' : ''}</button>
                                </span>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; color?: string; icon?: React.ReactNode }> = ({ label, value, color, icon }) => (
  <div style={{ background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 12px' }}>
    <div style={{ fontFamily: 'inherit', fontWeight: 900, fontSize: 22, color: color || T.ink, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{value}</div>
    <div style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: T.muted, marginTop: 2 }}>{label}</div>
  </div>
);

/** Turned-in students first (review queue worst-first), then everyone else, then not-turned-in. */
function orderedRows(brief: ReturnType<typeof buildTurnInBrief>) {
  const queueIds = new Set(brief.needsReviewQueue.map(r => r.studentId));
  const queue = brief.needsReviewQueue;
  const restTurnedIn = brief.rows.filter(r => r.status === 'turned_in' && !queueIds.has(r.studentId));
  const notIn = brief.rows.filter(r => r.status === 'not_turned_in');
  return [...queue, ...restTurnedIn, ...notIn];
}

export default TurnInBriefView;
