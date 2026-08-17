// SkyView — the Sky. A map of where a learner stands in the real prerequisite graph.
//
// What it actually shows, which is narrower and truer than the concept promised: each star is a
// standards DOMAIN, each line a real prerequisite, and brightness is mastery from the Learner
// Ledger. Foundations sit near the centre of their constellation and what they unlock sits
// further out, so progression reads outward. Every edge here is in the data — see the note at
// the top of services/skyGraph.ts for why there are no cross-subject links yet.
//
// Desktop-first, deliberately. A constellation needs room to be legible AND tappable, and a
// phone gives neither: below 900px this switches to a list grouped by subject, which is the
// same information without pretending a 375px canvas is a sky.

import React, { useMemo, useState } from 'react';
import { ArrowLeft, Sparkles, Lock, Check, Circle } from 'lucide-react';
import { buildSkyGraph, unlockedBy, requires, suggestNext, SUBJECT_HUE, type SkyNode } from '../../services/skyGraph';
import { standardById, masteryToLevel, bandFor } from '../../data/educationStandards';
import { useViewport } from '../../hooks/useViewport';
import { T, cardStyle, btn, badge } from './integrityTheme';

const SkyView: React.FC<{
  /** 0–100 per standard id, from learnerProficiency. Empty = the map with nobody on it. */
  masteryByStandard?: Record<string, number>;
  /** False for a teacher or parent: the map is real, but the progress on it isn't theirs, and
   *  an unlabelled empty sky would read as "you have done nothing". */
  viewerIsLearner?: boolean;
  onBack?: () => void;
  onOpenDomain?: (standardIds: string[]) => void;
}> = ({ masteryByStandard = {}, viewerIsLearner = true, onBack, onOpenDomain }) => {
  const isPhone = useViewport().breakpoint === 'phone';
  const graph = useMemo(() => buildSkyGraph(masteryByStandard), [masteryByStandard]);
  const [selected, setSelected] = useState<string | null>(null);

  const node = selected ? graph.nodes.find(n => n.id === selected) ?? null : null;
  const next = useMemo(() => suggestNext(graph), [graph]);
  const lit = graph.nodes.filter(n => n.mastery !== null).length;

  // Lines touching the selection are the "lit path" — the reason to select anything at all.
  const activeEdges = new Set(
    selected ? graph.edges.filter(e => e.from === selected || e.to === selected).map(e => `${e.from}→${e.to}`) : [],
  );

  const starSize = (n: SkyNode) => 20 + Math.min(n.standardIds.length, 4) * 5 + (n.mastery !== null ? 8 : 0);
  const hue = (n: SkyNode) => SUBJECT_HUE[n.subject] ?? T.cyan;

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: T.font, color: T.ink }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: isPhone ? '18px 16px 40px' : '22px 24px 48px' }}>
        {onBack && (
          <button onClick={onBack} style={{ ...btn('ghost', T.muted), marginBottom: 14 }}>
            <ArrowLeft size={14} /> Back
          </button>
        )}

        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.cyan, margin: 0 }}>
          {viewerIsLearner ? 'Your sky' : 'The map'}
        </p>
        <h1 style={{ margin: '6px 0 8px', fontSize: isPhone ? 24 : 30, fontWeight: 900, letterSpacing: '-0.03em' }}>
          {viewerIsLearner
            ? "Everything you've touched, and what it opens."
            : 'How every area of learning connects.'}
        </h1>
        <p style={{ margin: 0, color: T.muted, fontSize: 13.5, lineHeight: 1.6, maxWidth: '62ch' }}>
          {!viewerIsLearner
            ? `${graph.nodes.length} areas and ${graph.edges.length} real prerequisites between them. Nobody's progress is shown here — a learner's own sky lights up as they work.`
            : lit === 0
              ? 'Nothing is lit yet — this is the shape of the map before anyone walks it. Every line is a real prerequisite.'
              : `${lit} of ${graph.nodes.length} areas lit. Lines are real prerequisites: what you finish opens what comes next.`}
        </p>

        {next && (
          <div style={{ ...cardStyle, padding: 14, marginTop: 14, borderColor: `${T.cyan}55`, background: `linear-gradient(140deg, ${T.purple}22, ${T.cyan}12)` }}>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
              <Sparkles size={14} color={T.cyan} />
              <span style={{ fontSize: 11.5, color: T.muted }}>You've earned a way into</span>
              <strong style={{ fontSize: 14 }}>{next.domain}</strong>
              <button onClick={() => setSelected(next.id)} style={{ ...btn('outline', T.cyan), marginLeft: 'auto', padding: '5px 11px', fontSize: 11.5 }}>
                Show me
              </button>
            </div>
          </div>
        )}

        {isPhone ? (
          <PhoneList graph={graph} onSelect={setSelected} selected={selected} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16, marginTop: 16, alignItems: 'start' }}>
            {/* ── Canvas ── */}
            <div style={{
              position: 'relative', height: 560, borderRadius: 20, overflow: 'hidden',
              border: `1px solid ${T.border}`,
              background: `radial-gradient(120% 90% at 60% 25%, ${T.purple}30, transparent 62%), ${T.bg}`,
            }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
                {graph.edges.map(e => {
                  const a = graph.nodes.find(n => n.id === e.from);
                  const b = graph.nodes.find(n => n.id === e.to);
                  if (!a || !b) return null;
                  const active = activeEdges.has(`${e.from}→${e.to}`);
                  return (
                    <line
                      key={`${e.from}→${e.to}`}
                      x1={a.x * 100} y1={a.y * 100} x2={b.x * 100} y2={b.y * 100}
                      stroke={active ? T.orange : e.travelled ? T.cyan : 'rgba(255,255,255,0.16)'}
                      strokeWidth={active ? 0.5 : 0.22}
                      vectorEffect="non-scaling-stroke"
                      opacity={active ? 0.95 : e.travelled ? 0.6 : 0.5}
                    />
                  );
                })}
              </svg>

              {graph.nodes.map(n => {
                const size = starSize(n);
                const on = selected === n.id;
                const c = hue(n);
                return (
                  <button
                    key={n.id}
                    onClick={() => setSelected(on ? null : n.id)}
                    title={`${n.domain} — ${n.mastery === null ? 'not started' : `${n.mastery}%`}`}
                    style={{
                      position: 'absolute', left: `${n.x * 100}%`, top: `${n.y * 100}%`,
                      transform: 'translate(-50%,-50%)', background: 'none', border: 0,
                      padding: 0, cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit',
                      zIndex: on ? 4 : 2,
                    }}
                  >
                    <span style={{
                      display: 'grid', placeItems: 'center', margin: '0 auto 5px',
                      width: size, height: size, borderRadius: '50%',
                      background: n.mastery === null
                        ? 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.13), rgba(255,255,255,0.03))'
                        : `radial-gradient(circle at 35% 30%, ${c}cc, ${c}44)`,
                      border: `1px solid ${on ? T.orange : n.mastery === null ? 'rgba(255,255,255,0.22)' : c}`,
                      boxShadow: on ? `0 0 26px ${T.orange}88` : n.mastery === null ? 'none' : `0 0 20px ${c}55`,
                      opacity: n.mastery === null ? 0.62 : 1,
                    }}>
                      {n.mastery === null
                        ? <Circle size={9} color="rgba(255,255,255,0.5)" />
                        : <span style={{ fontSize: 9, fontWeight: 900, color: '#fff' }}>{n.mastery}</span>}
                    </span>
                    {/* Hard-capped width. Domain names run to 137px unconstrained, which makes
                        collision-free placement of 22 stars arithmetically impossible on an
                        876px canvas — so the label is clipped and the full name lives in the
                        tooltip and the detail panel. */}
                    <span style={{
                      display: 'block', maxWidth: 82, margin: '0 auto',
                      fontSize: 8.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                      color: on ? T.orange : n.mastery === null ? T.faint : T.muted,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      textShadow: `0 1px 6px ${T.bg}`,
                    }}>{shortDomain(n.domain)}</span>
                  </button>
                );
              })}

              <div style={{ position: 'absolute', left: 14, bottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[...new Set(graph.nodes.map(n => n.subject))].map(s => (
                  <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, color: T.muted }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: SUBJECT_HUE[s] }} />
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Detail ── */}
            <aside style={{ ...cardStyle, padding: 16, minHeight: 200 }}>
              {node ? <Detail node={node} graph={graph} onSelect={setSelected} onOpenDomain={onOpenDomain} />
                    : <Empty count={graph.nodes.length} edges={graph.edges.length} />}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Pieces ────────────────────────────────────────────────────────────────────

const Empty: React.FC<{ count: number; edges: number }> = ({ count, edges }) => (
  <div>
    <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.faint, margin: 0 }}>
      Pick a star
    </p>
    <p style={{ margin: '9px 0 0', fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
      {count} areas, {edges} real prerequisites between them. Selecting one lights what it needs
      and what it opens.
    </p>
    <p style={{ margin: '12px 0 0', fontSize: 11.5, color: T.faint, lineHeight: 1.6 }}>
      A hollow star is somewhere you haven't been. Bigger stars hold more standards.
    </p>
  </div>
);

const Detail: React.FC<{
  node: SkyNode;
  graph: ReturnType<typeof buildSkyGraph>;
  onSelect: (id: string) => void;
  onOpenDomain?: (ids: string[]) => void;
}> = ({ node, graph, onSelect, onOpenDomain }) => {
  const needs = requires(graph, node.id);
  const opens = unlockedBy(graph, node.id);
  const band = node.mastery === null ? null : bandFor(node.mastery);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: SUBJECT_HUE[node.subject] }} />
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.faint }}>
          {node.subject}
        </span>
      </div>
      <h3 style={{ margin: '7px 0 0', fontSize: 16.5, fontWeight: 800, letterSpacing: '-0.01em' }}>{node.domain}</h3>

      <div style={{ marginTop: 9 }}>
        {band
          ? <span style={badge(band.color)}>{band.label} · {node.mastery}%</span>
          : <span style={badge(T.faint)}>Not started</span>}
      </div>

      {needs.length > 0 && (
        <>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.faint, margin: '15px 0 6px' }}>
            Needs first
          </p>
          {needs.map(p => (
            <button key={p.id} onClick={() => onSelect(p.id)} style={linkRow}>
              {p.mastery === null ? <Lock size={11} color={T.faint} /> : <Check size={11} color={T.success} />}
              <span style={{ flex: 1, textAlign: 'left' }}>{p.domain}</span>
              <span style={{ color: T.faint, fontSize: 10.5 }}>{p.mastery === null ? '—' : `${p.mastery}%`}</span>
            </button>
          ))}
        </>
      )}

      {opens.length > 0 && (
        <>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.faint, margin: '15px 0 6px' }}>
            Opens
          </p>
          {opens.map(o => (
            <button key={o.id} onClick={() => onSelect(o.id)} style={linkRow}>
              <Sparkles size={11} color={T.cyan} />
              <span style={{ flex: 1, textAlign: 'left' }}>{o.domain}</span>
            </button>
          ))}
        </>
      )}

      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.faint, margin: '15px 0 6px' }}>
        {node.standardIds.length} standard{node.standardIds.length === 1 ? '' : 's'}
      </p>
      {node.standardIds.slice(0, 4).map(id => {
        const s = standardById(id);
        return (
          <p key={id} style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5, margin: '0 0 7px' }}>
            <strong style={{ color: T.ink }}>{s?.code ?? id}</strong> — {s?.statement ?? ''}
          </p>
        );
      })}
      {node.standardIds.length > 4 && (
        <p style={{ fontSize: 11, color: T.faint }}>+{node.standardIds.length - 4} more</p>
      )}

      {onOpenDomain && (
        <button onClick={() => onOpenDomain(node.standardIds)} style={{ ...btn('solid', T.orange), marginTop: 12, width: '100%', justifyContent: 'center' }}>
          Find work on this
        </button>
      )}
    </div>
  );
};

/** Below 900px the constellation stops being usable, so it becomes an honest list. */
const PhoneList: React.FC<{
  graph: ReturnType<typeof buildSkyGraph>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}> = ({ graph, selected, onSelect }) => {
  const subjects = [...new Set(graph.nodes.map(n => n.subject))];
  return (
    <div style={{ marginTop: 16, display: 'grid', gap: 18 }}>
      {subjects.map(subject => (
        <section key={subject}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: SUBJECT_HUE[subject] }} />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.muted }}>
              {subject}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 7 }}>
            {graph.nodes
              .filter(n => n.subject === subject)
              .sort((a, b) => a.depth - b.depth)
              .map(n => {
                const opens = unlockedBy(graph, n.id);
                const on = selected === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => onSelect(on ? null : n.id)}
                    style={{
                      ...cardStyle, padding: 12, textAlign: 'left', cursor: 'pointer',
                      borderColor: on ? T.orange : T.border, fontFamily: 'inherit', color: T.ink,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                      <span style={{
                        width: 26, height: 26, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
                        background: n.mastery === null ? 'rgba(255,255,255,0.06)' : `${SUBJECT_HUE[n.subject]}33`,
                        border: `1px solid ${n.mastery === null ? T.border : SUBJECT_HUE[n.subject]}`,
                        fontSize: 9, fontWeight: 900,
                      }}>{n.mastery === null ? '·' : n.mastery}</span>
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{n.domain}</span>
                      {n.depth === 0 && <span style={badge(T.faint)}>Start</span>}
                    </div>
                    {on && opens.length > 0 && (
                      <p style={{ margin: '9px 0 0', fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                        Opens: {opens.map(o => o.domain).join(', ')}
                      </p>
                    )}
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
};

const linkRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  background: 'none', border: 0, padding: '5px 0', cursor: 'pointer',
  color: T.ink, fontSize: 12.5, fontFamily: 'inherit',
};

/** Domain names run long ("Number & Operations — Fractions") and would collide as star labels. */
function shortDomain(d: string): string {
  // Drop the framework's shared prefixes — "Number & Operations — Fractions" and "Number &
  // Operations in Base Ten" are told apart by their tails, so the head is wasted width.
  return d
    .replace(/^Number & Operations\s*[—-]?\s*/i, '')
    .replace(/^Reading:\s*/i, '')
    .replace(/^Phonics & Word Recognition$/i, 'Phonics')
    .replace(/^Phonological Awareness$/i, 'Phonemes')
    .replace(/^Operations & Algebraic Thinking$/i, 'Operations')
    .replace(/^Expressions & Equations$/i, 'Expressions')
    .replace(/^Ratios & Proportional Relationships$/i, 'Ratios')
    .replace(/^Vocabulary Acquisition$/i, 'Vocabulary')
    .replace(/^Language — Reading$/i, 'Language')
    .trim();
}

export default SkyView;
