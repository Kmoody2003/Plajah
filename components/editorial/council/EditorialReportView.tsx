// EditorialReportView — renders an EditorialReport the way the contract demands: what is working first (quoted,
// located), verdicts in words, notes as options ending in "Your call", disagreement kept visible, severity
// labelled, and an accept / adapt / decline decision (plus pushback) on every note. Shared by the full room and
// the compact panel. Nothing here rewrites the author's text.
import React, { useMemo, useState } from 'react';
import { RIGHTS_DISCLAIMER, RIGHTS_LINKS } from '../../../services/editorial/council/editorialRights';
import { EDITORS } from '../../../services/editorial/council/editorialEditors';
import { openNotes } from '../../../services/editorial/council/editorialDecisions';
import type { Anchor, DecisionChoice, EditorialSession, Note, Severity } from '../../../services/editorial/council/editorialTypes';

export const ACCENT = '#58C9A3';        // proofreader's green ink: distinct from the art (violet) and motion (cyan) councils
export const ACCENT_SOFT = 'rgba(88,201,163,.14)';
const SEV: Record<Severity, { fg: string; bg: string; label: string }> = {
  Craft: { fg: '#9DB8FF', bg: 'rgba(157,184,255,.14)', label: 'Craft' },
  Clarity: { fg: '#F2C94C', bg: 'rgba(242,201,76,.14)', label: 'Clarity' },
  Risk: { fg: '#FF8A7A', bg: 'rgba(255,138,122,.16)', label: 'Risk (legal / ethical)' },
};
const BAND: Record<string, { fg: string; bg: string }> = {
  Strong: { fg: '#7BE0B5', bg: 'rgba(123,224,181,.14)' },
  Developing: { fg: '#F2C94C', bg: 'rgba(242,201,76,.14)' },
  'Needs a rethink': { fg: '#FF8A7A', bg: 'rgba(255,138,122,.16)' },
  'Not judged offline': { fg: 'rgba(255,255,255,.55)', bg: 'rgba(255,255,255,.06)' },
};
const card: React.CSSProperties = { background: 'var(--pj-glass-2, rgba(255,255,255,.04))', border: '1px solid var(--pj-border, rgba(255,255,255,.12))', borderRadius: 'var(--pj-radius-lg, 14px)', padding: 14 };
const small: React.CSSProperties = { fontSize: 11, opacity: 0.6 };
const btn = (on = false): React.CSSProperties => ({ minHeight: 36, padding: '0 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? ACCENT : 'var(--pj-border, rgba(255,255,255,.18))'}`, background: on ? ACCENT_SOFT : 'transparent', color: on ? ACCENT : 'inherit' });

export function Where({ anchor, onJump }: { anchor?: Anchor; onJump?: (a: Anchor) => void }) {
  if (!anchor) return null;
  return (
    <blockquote style={{ margin: '8px 0', padding: '8px 12px', borderLeft: `3px solid ${ACCENT}`, background: ACCENT_SOFT, borderRadius: 8, fontSize: 13, lineHeight: 1.5 }}>
      <span style={{ fontStyle: 'italic' }}>&ldquo;{anchor.quote}&rdquo;</span>
      <div style={{ ...small, marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>{anchor.chapterTitle ? `In ${anchor.chapterTitle}` : 'In your text'}</span>
        {onJump && <button type="button" onClick={() => onJump(anchor)} style={{ ...btn(), minHeight: 28, padding: '0 8px' }}>Show me</button>}
      </div>
    </blockquote>
  );
}

function NoteCard({ n, session, onDecide, onReply, onJump, busy }: { n: Note; session: EditorialSession; onDecide: (n: Note, c: DecisionChoice, note?: string) => void; onReply: (n: Note, text: string) => void; onJump?: (a: Anchor) => void; busy: boolean }) {
  const d = session.decisions.find(x => x.noteId === n.id); const [reply, setReply] = useState(''); const [open, setOpen] = useState(false); const [why, setWhy] = useState('');
  const sev = SEV[n.severity]; const e = EDITORS[n.editorId]; const replies = session.replies.filter(r => r.noteId === n.id);
  return (
    <article style={{ ...card, opacity: d?.choice === 'DECLINE' || n.stance === 'WITHDRAWS' ? 0.55 : 1 }} aria-label={n.headline}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: sev.fg, background: sev.bg, padding: '3px 8px', borderRadius: 999 }}>{sev.label}</span>
        <span style={small}>{e.epithet}{n.source === 'local' ? ' · counted, not read by AI' : ''}</span>
        {n.stance && <span style={{ ...small, color: ACCENT }}>{n.stance === 'HOLDS' ? 'The editor held their view' : n.stance === 'SOFTENS' ? 'The editor softened this' : 'The editor withdrew this'}</span>}
      </header>
      <h4 style={{ margin: '0 0 4px', fontSize: 15 }}>{n.headline}</h4>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, opacity: 0.9 }}>{n.observation}</p>
      <Where anchor={n.anchor} onJump={onJump} />
      {n.metric && n.metric.value && <p style={{ ...small, margin: '6px 0' }}><b>What was counted:</b> {n.metric.value}. {n.metric.explanation}</p>}
      <p style={{ margin: '10px 0 4px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', opacity: 0.55 }}>Ways you could handle this</p>
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.55 }}>{n.options.map((o, i) => <li key={i}>{o}</li>)}</ol>
      <p style={{ margin: '10px 0 0', fontSize: 13, color: ACCENT }}>{n.yourCall}</p>
      {replies.map((r, i) => (
        <div key={i} style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,.04)', fontSize: 12 }}>
          <div><b>You:</b> {r.text}</div><div style={{ marginTop: 4 }}><b>{e.epithet}:</b> {r.reconsideration}</div>
        </div>
      ))}
      <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
        {(['ACCEPT', 'ADAPT', 'DECLINE'] as DecisionChoice[]).map(c => (
          <button key={c} type="button" disabled={busy} aria-pressed={d?.choice === c} style={btn(d?.choice === c)} onClick={() => onDecide(n, c, why || undefined)}>{c === 'ACCEPT' ? 'Accept' : c === 'ADAPT' ? 'Adapt' : 'Decline'}</button>
        ))}
        <button type="button" style={btn(open)} onClick={() => setOpen(o => !o)}>Push back</button>
        {d && <span style={small}>You chose to {d.choice.toLowerCase()} this{d.choice === 'DECLINE' ? '. It will not come up again.' : '.'}</span>}
      </footer>
      <input aria-label="Why (optional)" placeholder="Your reason, if you want it recorded" value={why} onChange={e2 => setWhy(e2.target.value)} style={{ marginTop: 8, width: '100%', minHeight: 36, borderRadius: 8, border: '1px solid var(--pj-border, rgba(255,255,255,.14))', background: 'transparent', color: 'inherit', padding: '0 10px', fontSize: 12 }} />
      {open && (
        <div style={{ marginTop: 8 }}>
          <textarea aria-label="Your reply to the editor" rows={3} value={reply} onChange={e2 => setReply(e2.target.value)} placeholder="Tell the editor what they missed. They will reconsider honestly, and may hold their view." style={{ width: '100%', borderRadius: 8, border: '1px solid var(--pj-border, rgba(255,255,255,.14))', background: 'transparent', color: 'inherit', padding: 10, fontSize: 13 }} />
          <button type="button" disabled={busy || reply.trim().length < 3} style={{ ...btn(true), marginTop: 6 }} onClick={() => { onReply(n, reply.trim()); setReply(''); setOpen(false); }}>Send to the editor</button>
        </div>
      )}
    </article>
  );
}

export default function EditorialReportView({ session, onDecide, onReply, onJump, busy = false, compact = false }: { session: EditorialSession; onDecide: (n: Note, c: DecisionChoice, note?: string) => void; onReply: (n: Note, text: string) => void; onJump?: (a: Anchor) => void; busy?: boolean; compact?: boolean }) {
  const r = session.report; const [sev, setSev] = useState<'ALL' | Severity>('ALL'); const [showDone, setShowDone] = useState(false); const [showMetrics, setShowMetrics] = useState(false);
  const open = useMemo(() => openNotes(session), [session]);
  const decided = (r?.notes ?? []).filter(n => !open.includes(n));
  if (!r) return <p style={small}>No report yet.</p>;
  const shown = (showDone ? r.notes : open).filter(n => sev === 'ALL' || n.severity === sev).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'Risk' ? -1 : b.severity === 'Risk' ? 1 : a.severity === 'Clarity' ? -1 : 1));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section style={{ ...card, borderColor: ACCENT }} aria-label="Aria's summary">
        <p style={{ ...small, margin: '0 0 6px', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: ACCENT }}>Aria, on behalf of the council</p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{r.ariaSummary}</p>
        {r.synthesis && <p style={{ ...small, marginTop: 8 }}>Lead reading: {EDITORS[r.synthesis.lead].epithet}. Counterpoint worth keeping: {EDITORS[r.synthesis.counterpoint].epithet}{r.synthesis.keepFromCounterpoint ? ` (${r.synthesis.keepFromCounterpoint})` : ''}. Editor of last resort: {EDITORS[r.synthesis.editor].epithet}.</p>}
      </section>

      <section aria-label="What is working">
        <h3 style={{ fontSize: 13, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '.08em', color: ACCENT }}>What is working</h3>
        {r.working.length === 0 && <p style={{ ...small, fontSize: 13 }}>No passage stood out enough to quote. That is honest feedback, not a verdict on the book: this read may simply not have enough text.</p>}
        {r.working.map((w, i) => <div key={i} style={card}><p style={{ margin: 0, fontSize: 13 }}>{w.text} <span style={small}>({EDITORS[w.editorId].epithet})</span></p><Where anchor={w.anchor} onJump={onJump} /></div>)}
      </section>

      <section aria-label="Verdicts">
        <h3 style={{ fontSize: 13, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '.08em', color: ACCENT }}>An honest assessment</h3>
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {r.verdicts.map(v => (
            <div key={v.dimension} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <b style={{ textTransform: 'capitalize', fontSize: 13 }}>{v.dimension}</b>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 999, color: BAND[v.band].fg, background: BAND[v.band].bg }}>{v.band}</span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, opacity: 0.85 }}>{v.reasoning}{v.editorId ? ` (${EDITORS[v.editorId].epithet})` : ''}</p>
            </div>
          ))}
        </div>
      </section>

      {r.disagreements.length > 0 && (
        <section aria-label="Where the editors disagree">
          <h3 style={{ fontSize: 13, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '.08em', color: ACCENT }}>Where the editors disagree</h3>
          {r.disagreements.map((d, i) => (
            <div key={i} style={{ ...card, marginBottom: 8 }}>
              <p style={{ margin: '0 0 6px', fontSize: 12, opacity: 0.7 }}>{EDITORS[d.between[0]].epithet} and {EDITORS[d.between[1]].epithet} {d.about ? `· ${d.about}` : ''}</p>
              <p style={{ margin: '0 0 4px', fontSize: 13 }}><b>{EDITORS[d.between[0]].epithet}:</b> {d.sideA}</p>
              {d.sideB && <p style={{ margin: 0, fontSize: 13 }}><b>{EDITORS[d.between[1]].epithet}:</b> {d.sideB}</p>}
            </div>
          ))}
        </section>
      )}

      <section aria-label="Notes">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ fontSize: 13, margin: 0, textTransform: 'uppercase', letterSpacing: '.08em', color: ACCENT, marginRight: 8 }}>Notes, with options</h3>
          {(['ALL', 'Craft', 'Clarity', 'Risk'] as const).map(s => <button key={s} type="button" style={btn(sev === s)} aria-pressed={sev === s} onClick={() => setSev(s)}>{s === 'ALL' ? 'All' : s}</button>)}
          {decided.length > 0 && <button type="button" style={btn(showDone)} onClick={() => setShowDone(x => !x)}>{showDone ? 'Hide' : 'Show'} decided ({decided.length})</button>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map(n => <NoteCard key={n.id} n={n} session={session} onDecide={onDecide} onReply={onReply} onJump={onJump} busy={busy} />)}
          {shown.length === 0 && <p style={{ ...small, fontSize: 13 }}>{open.length === 0 ? 'Nothing open. Every note has your decision on it.' : 'No notes at this severity.'}</p>}
        </div>
      </section>

      <section aria-label="Rights checklist" style={{ ...card, borderColor: 'rgba(255,138,122,.5)' }}>
        <h3 style={{ fontSize: 13, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#FF8A7A' }}>Rights checklist</h3>
        <p role="note" style={{ margin: '0 0 10px', padding: 10, borderRadius: 8, background: 'rgba(255,138,122,.14)', fontSize: 13, fontWeight: 700 }}>{RIGHTS_DISCLAIMER}</p>
        {r.rights.length === 0 && <p style={{ fontSize: 13, margin: 0 }}>None of the local rights checks raised a question. That does not mean there are no rights issues: the checks only look for quoted passages, lyric-like lines, epigraphs, marks in the title, named people, and the AI and image disclosures you have recorded.</p>}
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>{r.rights.map(i => <li key={i.fingerprint}><b>{i.title}.</b> {i.why}<ul>{i.nextSteps.map((s, k) => <li key={k}>{s}</li>)}</ul></li>)}</ul>
        <p style={{ ...small, margin: '8px 0 0' }}>The council does not register copyright and cannot tell you what is fair use. Official information: {RIGHTS_LINKS.map((l, i) => <span key={l.url}>{i ? ' · ' : ''}<a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>{l.label}</a></span>)}. Rules differ by country.</p>
      </section>

      {r.metrics.length > 0 && (
        <section aria-label="Counted patterns">
          <button type="button" style={btn(showMetrics)} onClick={() => setShowMetrics(x => !x)}>{showMetrics ? 'Hide' : 'Show'} what was counted ({r.metrics.length})</button>
          {showMetrics && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>{r.metrics.map(m => <div key={m.name} style={card}><b style={{ fontSize: 13 }}>{m.name}</b><p style={{ margin: '4px 0', fontSize: 13 }}>{m.value}</p><p style={{ ...small, margin: 0 }}>{m.explanation}</p></div>)}</div>}
        </section>
      )}

      <section aria-label="Limits" style={small}>{r.limits.map((l, i) => <p key={i} style={{ margin: '0 0 4px' }}>{l}</p>)}</section>
    </div>
  );
}
