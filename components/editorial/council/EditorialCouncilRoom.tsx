// EditorialCouncilRoom — the full room: pick editors (or "let the council choose"), choose what they read
// (whole book / one chapter / a selection), QUICK or FULL, then read the report with highlights anchored to
// locations in your text, accept / adapt / decline on every note, and an archive of past reads.
// Mounted from the ebook submission flow, the book studio and the article desk. Aria fronts it; the editors
// are the team behind her. Guidance, not orders; not legal advice; AI editors are not human editors.
import React, { useEffect, useMemo, useState } from 'react';
import { EDITOR_LIST, EDITORS, castEditors } from '../../../services/editorial/council/editorialEditors';
import { editorialService } from '../../../services/editorial/council/editorialService';
import { applyScope } from '../../../services/editorial/council/editorialLocal';
import { flatten } from '../../../services/editorial/council/editorialMetrics';
import { AI_EDITORS_LIMIT, MANUSCRIPT_KINDS, NOT_LEGAL_ADVICE, type Anchor, type EditorId, type EditorialSession, type ManuscriptInput, type ManuscriptKind, type Scope } from '../../../services/editorial/council/editorialTypes';
import EditorialReportView, { ACCENT, ACCENT_SOFT } from './EditorialReportView';
import { useEditorialReview } from './useEditorialReview';

const KIND_LABEL: Record<ManuscriptKind, string> = { FICTION: 'Fiction', NONFICTION: 'Non-fiction', MEMOIR: 'Memoir', POETRY: 'Poetry', YOUNG_READERS: 'Young readers', SERIAL: 'Serial / web fiction', ARTICLE: 'Article', NEWSLETTER: 'Newsletter' };
const when = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const chip = (on: boolean): React.CSSProperties => ({ minHeight: 36, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? ACCENT : 'var(--pj-border, rgba(255,255,255,.18))'}`, background: on ? ACCENT_SOFT : 'transparent', color: on ? ACCENT : 'inherit' });

interface Props {
  /** current manuscript, read fresh each time the editors are asked */
  getManuscript: () => ManuscriptInput;
  /** text the author has selected in the host editor (enables the "selection" scope) */
  selection?: string;
  onClose?: () => void;
  /** host scrolls to / highlights a passage */
  onJump?: (a: Anchor) => void;
  /** open on a past session id */
  sessionId?: string;
}

export default function EditorialCouncilRoom({ getManuscript, selection, onClose, onJump, sessionId }: Props) {
  const initial = useMemo(() => getManuscript(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = useState<'ROOM' | 'REPORT' | 'HIGHLIGHTS' | 'ARCHIVE'>('ROOM');
  const [kind, setKind] = useState<ManuscriptKind>(initial.kind);
  const [auto, setAuto] = useState(true);
  const [picked, setPicked] = useState<EditorId[]>([]);
  const [scopeKind, setScopeKind] = useState<'BOOK' | 'CHAPTER' | 'SELECTION'>('BOOK');
  const [chapterId, setChapterId] = useState(initial.chapters[0]?.id ?? '');
  const [depth, setDepth] = useState<'QUICK' | 'FULL'>('FULL');
  const [offline, setOffline] = useState(false);
  const [past, setPast] = useState<EditorialSession[]>([]);
  const [hlChapter, setHlChapter] = useState('');
  const { session, setSession, busy, error, run, decide, reply } = useEditorialReview();

  const cast = useMemo(() => castEditors(kind, { genre: initial.genre }), [kind, initial.genre]);
  const room = auto ? cast : picked;
  useEffect(() => { void editorialService.sessions().then(s => { setPast(s); if (sessionId) { const f = s.find(x => x.id === sessionId); if (f) { setSession(f); setView('REPORT'); } } }); }, [sessionId, setSession]);

  const scope: Scope = scopeKind === 'CHAPTER' ? { kind: 'CHAPTER', chapterId } : scopeKind === 'SELECTION' ? { kind: 'SELECTION', start: 0, end: (selection ?? '').length } : { kind: 'BOOK' };
  const ask = async () => {
    const m = { ...getManuscript(), kind };
    const input: ManuscriptInput = scopeKind === 'SELECTION' && selection ? { ...m, chapters: [{ id: 'selection', title: 'Your selection', text: selection }] } : m;
    const s = await run(input, { depth, editors: room.length ? room : undefined, scope: scopeKind === 'SELECTION' ? { kind: 'BOOK' } : scope, offline });
    if (s) { setView('REPORT'); void editorialService.sessions().then(setPast); }
  };

  // Highlights: show a chapter's text with every anchored passage marked.
  const hl = useMemo(() => {
    if (!session?.report) return null;
    const m = getManuscript(); const scoped = session.scope.kind === 'CHAPTER' ? applyScope(m, session.scope) : m; const flat = flatten(scoped.chapters);
    const ch = flat.chapters.find(c => c.id === (hlChapter || session.report!.notes.find(n => n.anchor?.chapterId)?.anchor?.chapterId || flat.chapters[0]?.id)); if (!ch) return null;
    const marks = [...session.report.working.map(w => ({ a: w.anchor, kind: 'working' as const })), ...session.report.notes.map(n => ({ a: n.anchor, kind: n.severity }))].filter(x => x.a && x.a.start >= ch.start && x.a.end <= ch.end + 1).sort((p, q) => p.a!.start - q.a!.start);
    return { flat, ch, marks };
  }, [session, hlChapter, getManuscript]);

  const toggle = (id: EditorId) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const COLOR = { working: ACCENT, Craft: '#9DB8FF', Clarity: '#F2C94C', Risk: '#FF8A7A' } as const;

  return (
    <div role="dialog" aria-label="Editorial and Copyright Council" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, maxWidth: 980, margin: '0 auto', color: 'var(--on-surface, #fff)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>Editorial &amp; Copyright Council</h2>
        {(['ROOM', 'REPORT', 'HIGHLIGHTS', 'ARCHIVE'] as const).map(v => <button key={v} type="button" style={chip(view === v)} disabled={(v === 'REPORT' || v === 'HIGHLIGHTS') && !session} onClick={() => setView(v)}>{v === 'ROOM' ? 'The room' : v === 'REPORT' ? 'Report' : v === 'HIGHLIGHTS' ? 'In your text' : `Past reads (${past.length})`}</button>)}
        {onClose && <button type="button" aria-label="Close" style={chip(false)} onClick={onClose}>Close</button>}
      </header>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>The editors read your work the way a publisher would, and tell you what they honestly think. They guide; you decide. {AI_EDITORS_LIMIT} {NOT_LEGAL_ADVICE}</p>
      {error && <p role="alert" style={{ color: '#FF8A7A', fontSize: 13, margin: 0 }}>{error}</p>}

      {view === 'ROOM' && (
        <>
          <section aria-label="What are we reading" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <b style={{ fontSize: 13 }}>What kind of writing is it?</b>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{MANUSCRIPT_KINDS.map(k => <button key={k} type="button" style={chip(kind === k)} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}</div>
            <b style={{ fontSize: 13, marginTop: 8 }}>What should they read?</b>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <button type="button" style={chip(scopeKind === 'BOOK')} onClick={() => setScopeKind('BOOK')}>Whole {kind === 'ARTICLE' || kind === 'NEWSLETTER' ? 'piece' : 'book'}</button>
              {initial.chapters.length > 1 && <button type="button" style={chip(scopeKind === 'CHAPTER')} onClick={() => setScopeKind('CHAPTER')}>One chapter</button>}
              <button type="button" style={chip(scopeKind === 'SELECTION')} disabled={!selection} title={selection ? '' : 'Select some text in the editor first'} onClick={() => setScopeKind('SELECTION')}>My selection{selection ? ` (${selection.split(/\s+/).length} words)` : ''}</button>
              {scopeKind === 'CHAPTER' && <select aria-label="Chapter" value={chapterId} onChange={e => setChapterId(e.target.value)} style={{ minHeight: 36, borderRadius: 8, background: 'transparent', color: 'inherit', border: '1px solid var(--pj-border, rgba(255,255,255,.18))' }}>{initial.chapters.map(c => <option key={c.id} value={c.id} style={{ color: '#000' }}>{c.title}</option>)}</select>}
            </div>
            <b style={{ fontSize: 13, marginTop: 8 }}>How deep?</b>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" style={chip(depth === 'QUICK')} onClick={() => setDepth('QUICK')}>Quick (a few editors, fewer notes)</button>
              <button type="button" style={chip(depth === 'FULL')} onClick={() => setDepth('FULL')}>Full (editors argue with each other)</button>
              <button type="button" style={chip(offline)} aria-pressed={offline} onClick={() => setOffline(o => !o)}>Counted patterns only, no AI</button>
            </div>
          </section>

          <section aria-label="Who sits in">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <b style={{ fontSize: 13 }}>Who sits in?</b>
              <button type="button" style={chip(auto)} aria-pressed={auto} onClick={() => setAuto(a => !a)}>Let the council choose</button>
              {auto && <span style={{ fontSize: 12, opacity: 0.65 }}>{cast.map(i => EDITORS[i].epithet).join(', ')}</span>}
            </div>
            {!auto && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                {EDITOR_LIST.map(e => (
                  <button key={e.id} type="button" aria-pressed={picked.includes(e.id)} onClick={() => toggle(e.id)} style={{ ...chip(picked.includes(e.id)), borderRadius: 12, textAlign: 'left', padding: 10, minHeight: 72, display: 'block' }}>
                    <b style={{ display: 'block', fontSize: 13 }}>{e.name}</b>
                    <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>{e.medium}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div>
            <button type="button" disabled={busy || (!auto && picked.length === 0)} onClick={ask} style={{ minHeight: 44, padding: '0 20px', borderRadius: 12, fontWeight: 800, background: ACCENT, color: '#04140E', border: 'none', cursor: 'pointer' }}>{busy ? 'The editors are reading...' : 'Ask the editors'}</button>
            {busy && <p role="status" style={{ fontSize: 12, opacity: 0.7 }}>A long book is read in sections first, so this can take a minute. The editors do not agree quickly, and that is the point.</p>}
          </div>
        </>
      )}

      {view === 'REPORT' && session && <EditorialReportView session={session} onDecide={decide} onReply={reply} onJump={onJump} busy={busy} />}

      {view === 'HIGHLIGHTS' && hl && (
        <section aria-label="Highlights in your text">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <select aria-label="Chapter" value={hl.ch.id} onChange={e => setHlChapter(e.target.value)} style={{ minHeight: 36, borderRadius: 8, background: 'transparent', color: 'inherit', border: '1px solid var(--pj-border, rgba(255,255,255,.18))' }}>{hl.flat.chapters.map(c => <option key={c.id} value={c.id} style={{ color: '#000' }}>{c.title}</option>)}</select>
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              {(['working', 'Craft', 'Clarity', 'Risk'] as const).map(k => <span key={k} style={{ marginRight: 10 }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLOR[k], marginRight: 4 }} />{k === 'working' ? 'working' : k}</span>)}
            </span>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif', fontSize: 15, lineHeight: 1.7, padding: 14, borderRadius: 12, background: 'var(--pj-glass-2, rgba(255,255,255,.04))' }}>
            {(() => {
              const parts: React.ReactNode[] = []; let pos = hl.ch.start; const text = hl.flat.text;
              hl.marks.forEach((m, i) => { const a = m.a!; if (a.start < pos) return; parts.push(text.slice(pos, a.start)); parts.push(<mark key={i} title={m.kind === 'working' ? 'Working' : m.kind} style={{ background: `${COLOR[m.kind as keyof typeof COLOR]}33`, color: 'inherit', borderBottom: `2px solid ${COLOR[m.kind as keyof typeof COLOR]}` }}>{text.slice(a.start, Math.min(a.end, hl.ch.end))}</mark>); pos = Math.min(a.end, hl.ch.end); });
              parts.push(text.slice(pos, hl.ch.end)); return parts;
            })()}
          </div>
          {hl.marks.length === 0 && <p style={{ fontSize: 12, opacity: 0.7 }}>No notes point into this chapter.</p>}
        </section>
      )}

      {view === 'ARCHIVE' && (
        <section aria-label="Past reads" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {past.length === 0 && <p style={{ fontSize: 13, opacity: 0.7 }}>No past reads yet.</p>}
          {past.map(p => (
            <button key={p.id} type="button" onClick={() => { setSession(p); setView('REPORT'); }} style={{ ...chip(false), borderRadius: 12, textAlign: 'left', padding: 12, display: 'block' }}>
              <b style={{ fontSize: 13 }}>{p.title}</b> <span style={{ fontSize: 11, opacity: 0.65 }}>· {when(p.createdAt)} · {KIND_LABEL[p.kind]} · {p.wordCount.toLocaleString()} words · {p.report?.source === 'local' ? 'counted patterns only' : 'with the AI editors'} · {p.decisions.length} decided</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
