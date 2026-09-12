// CouncilRoom — the council board: six directors as a living team, a brief, and the room where
// they disagree. Aria fronts it; the directors are the team behind her.
//
// Three views: the ROOM (brief in, deliberation out, round by round), a DIRECTOR (their lens,
// how their taste has moved, what they brought back from research, the work they led) and the
// ARCHIVE (past sessions and what the user decided). Styled on the same tokens as the rest of the
// Fabula panels (glass-dark / lbl / minibtn / cta / chip) so it can mount anywhere.
import React, { useEffect, useMemo, useState } from 'react';
import { DATA_VIZ_ART_DIRECTIONS } from '../../services/fabula/dataVizArtDirection';
import { COUNCIL_LIST, COUNCIL_DIRECTORS, ariaIntro, councilService, directorSwatch } from '../../services/council/councilService';
import type { CouncilBrief, CouncilDirectorId, Deliberation, DirectorProfile } from '../../services/council/councilTypes';

interface Props { onClose?: () => void; initialBrief?: Partial<CouncilBrief>; /** open on a past deliberation */ sessionId?: string; surface?: string; domain?: string; tier?: string; onDirection?: (d: Deliberation) => void }

const AD = DATA_VIZ_ART_DIRECTIONS as Record<string, any>;
const when = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function Avatar({ id, size = 34 }: { id: CouncilDirectorId; size?: number }) {
  const sw = directorSwatch(id, AD); const d = COUNCIL_DIRECTORS[id];
  return <span title={d.name} style={{ width: size, height: size, borderRadius: '50%', background: sw.bg, border: `2px solid ${sw.accent}`, color: sw.fg, display: 'inline-grid', placeItems: 'center', fontSize: size * .34, fontWeight: 900, letterSpacing: '-.04em', flex: 'none' }}>{d.name.split(' ').slice(-1)[0].slice(0, 2).toUpperCase()}</span>;
}

export default function CouncilRoom({ onClose, initialBrief, sessionId, surface, domain, tier = 'FREE', onDirection }: Props) {
  const [view, setView] = useState<'ROOM' | 'DIRECTOR' | 'ARCHIVE'>('ROOM');
  const [profiles, setProfiles] = useState<Record<string, DirectorProfile>>({});
  const [ask, setAsk] = useState(initialBrief?.ask || '');
  const [audience, setAudience] = useState(initialBrief?.audience || '');
  const [feeling, setFeeling] = useState(initialBrief?.feeling || '');
  const [depth, setDepth] = useState<'QUICK' | 'FULL'>('FULL');
  const [busy, setBusy] = useState(false);
  const [intro, setIntro] = useState('');
  const [error, setError] = useState('');
  const [session, setSession] = useState<Deliberation | null>(null);
  const [sessions, setSessions] = useState<Deliberation[]>([]);
  const [director, setDirector] = useState<CouncilDirectorId>('CLASSICAL');
  const [topic, setTopic] = useState('');
  const [researching, setResearching] = useState(false);

  const loadProfiles = async () => { try { const r = await councilService.directors(); setProfiles(Object.fromEntries(r.profiles.map(p => [p.id, p]))); } catch { /* the team still shows from the static roster */ } };
  useEffect(() => { loadProfiles(); }, []);
  // Opened on a past deliberation (from a chat reply's chip): load it into the room.
  useEffect(() => { if (sessionId) councilService.session(sessionId).then(d => { setSession(d); setAsk(d.brief.ask); setView('ROOM'); }).catch(() => setError('That session could not be loaded.')); }, [sessionId]);
  useEffect(() => { if (view === 'ARCHIVE') councilService.sessions().then(r => setSessions(r.sessions)).catch(() => {}); }, [view]);

  const convene = async () => {
    if (ask.trim().length < 8 || busy) return;
    const brief: CouncilBrief = { ask: ask.trim(), audience: audience.trim() || undefined, feeling: feeling.trim() || undefined, surface, domain };
    setBusy(true); setError(''); setSession(null); setIntro(ariaIntro(brief));
    try {
      const d = await councilService.deliberate(brief, { depth, tier });
      setSession(d); if (d.status === 'FAILED') setError(d.error || 'The council could not finish.'); else onDirection?.(d);
      // The reflections land a little after the answer; pick them up once.
      setTimeout(() => { councilService.session(d.id).then(s => { setSession(s); loadProfiles(); }).catch(() => {}); }, 12000);
    } catch (e: any) { setError(e?.message || 'The council could not be reached.'); }
    finally { setBusy(false); }
  };
  const decide = async (choice: 'LEAD' | 'COUNTERPOINT' | 'AGAIN' | 'OWN') => {
    if (!session) return;
    try { setSession(await councilService.decide(session.id, choice)); } catch { /* keep the local session */ }
    if (choice === 'AGAIN') { setAsk(a => a + (a.includes('Take another pass') ? '' : '\n\nTake another pass; the first round did not land.')); }
  };
  const research = async () => {
    if (topic.trim().length < 3 || researching) return;
    setResearching(true); setError('');
    try { await councilService.research(director, topic.trim()); setTopic(''); await loadProfiles(); }
    catch (e: any) { setError(e?.message || 'Research failed.'); }
    finally { setResearching(false); }
  };

  const s = session?.synthesis;
  const byId = useMemo(() => Object.fromEntries((session?.proposals || []).map(p => [p.directorId, p])), [session]);

  return <div className="glass-dark" style={{ display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)', height: '100%', minHeight: 520, overflow: 'hidden' }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ display: 'flex' }}>{COUNCIL_LIST.map((d, i) => <span key={d.id} style={{ marginLeft: i ? -8 : 0 }}><Avatar id={d.id} size={26} /></span>)}</div>
      <div><div className="lbl" style={{ margin: 0 }}>THE COUNCIL</div><div style={{ fontSize: 11, opacity: .7 }}>Six art directors. Aria speaks for the room.</div></div>
      <div className="btnrow" style={{ marginLeft: 'auto', gap: 4 }}>
        {(['ROOM', 'DIRECTOR', 'ARCHIVE'] as const).map(v => <button key={v} className={`minibtn ${view === v ? 'blue' : ''}`} onClick={() => setView(v)}>{v === 'ROOM' ? 'THE ROOM' : v === 'DIRECTOR' ? 'DIRECTORS' : 'ARCHIVE'}</button>)}
        {onClose && <button className="minibtn" onClick={onClose}>CLOSE</button>}
      </div>
    </header>

    {view === 'ROOM' && <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,320px) minmax(0,1fr)', gap: 12, padding: 12, overflow: 'hidden' }}>
      <section style={{ overflow: 'auto', paddingRight: 4 }}>
        <div className="lbl">THE BRIEF</div>
        <textarea className="in" value={ask} onChange={e => setAsk(e.target.value)} placeholder="What are we designing, for whom, and what must it do?" rows={5} style={{ width: '100%', resize: 'vertical', marginBottom: 6 }} />
        <input className="in" value={audience} onChange={e => setAudience(e.target.value)} placeholder="Audience" style={{ width: '100%', marginBottom: 6 }} />
        <input className="in" value={feeling} onChange={e => setFeeling(e.target.value)} placeholder="The feeling it should leave" style={{ width: '100%', marginBottom: 8 }} />
        <div className="btnrow" style={{ gap: 4, marginBottom: 10 }}>
          <button className={`minibtn ${depth === 'FULL' ? 'blue' : ''}`} onClick={() => setDepth('FULL')} title="Every director argues with one other before Aria decides">FULL ROOM</button>
          <button className={`minibtn ${depth === 'QUICK' ? 'blue' : ''}`} onClick={() => setDepth('QUICK')} title="Proposals and Aria's decision; the disagreements come from the proposals themselves">QUICK</button>
        </div>
        <button className="cta" style={{ width: '100%' }} disabled={busy || ask.trim().length < 8} onClick={convene}>{busy ? 'THE ROOM IS TALKING…' : 'CONVENE THE COUNCIL'}</button>
        {error && <p className="small" style={{ color: '#ff7b7b', marginTop: 8 }}>{error}</p>}
        <div className="lbl" style={{ marginTop: 14 }}>WHO IS IN THE ROOM</div>
        {COUNCIL_LIST.map(d => { const p = profiles[d.id]; return <button key={d.id} onClick={() => { setDirector(d.id); setView('DIRECTOR'); }} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', textAlign: 'left', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', color: 'inherit', padding: '6px 8px', marginBottom: 4, cursor: 'pointer' }}>
          <Avatar id={d.id} size={28} /><span style={{ minWidth: 0 }}><b style={{ display: 'block', fontSize: 11 }}>{d.name}</b><span className="dim" style={{ fontSize: 9 }}>{p ? `${p.styleNotes.length} notes · ${p.influences.length} influences · led ${p.ledCount}` : d.medium}</span></span>
        </button>; })}
      </section>

      <section style={{ overflow: 'auto', paddingRight: 4 }}>
        {!session && !busy && <div style={{ padding: 18, opacity: .7, fontSize: 12, lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>Aria: "Bring me the brief and I will take it to the council. They will not agree — the Rebel and the Classical Mind never do — and I will tell you where they split, which side I took, and the one decision that is yours."</p>
        </div>}
        {busy && <div style={{ padding: 18, fontSize: 12, lineHeight: 1.6 }}><p style={{ margin: 0 }}>Aria: "{intro}"</p><p className="dim" style={{ marginTop: 10, fontSize: 10 }}>Proposals · disagreements · synthesis · reflections. About a minute.</p></div>}

        {session && s && <>
          <div style={{ background: 'rgba(139,92,246,.08)', border: '1px solid rgba(139,92,246,.35)', padding: 14, marginBottom: 12 }}>
            <div className="lbl" style={{ marginTop: 0 }}>ARIA</div>
            {s.ariaSummary.split(/\n+/).map((para, i) => <p key={i} style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 8px' }}>{para}</p>)}
            <div className="btnrow" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Avatar id={s.lead} size={18} /> LEAD · {COUNCIL_DIRECTORS[s.lead].name}</span>
              <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Avatar id={s.counterpoint} size={18} /> COUNTERPOINT · {COUNCIL_DIRECTORS[s.counterpoint].name}</span>
              <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Avatar id={s.editor} size={18} /> EDITOR · {COUNCIL_DIRECTORS[s.editor].name}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div><div className="lbl">THE DIRECTION</div><p className="small">{s.direction}</p></div>
            <div><div className="lbl">KEPT FROM THE COUNTERPOINT</div><p className="small">{s.keepFromCounterpoint}</p><div className="lbl">WHAT THE EDITOR CUT</div><p className="small">{s.editorCut}</p></div>
          </div>
          {s.quotes.length > 0 && <div style={{ marginBottom: 12 }}>{s.quotes.map((q, i) => <blockquote key={i} style={{ margin: '0 0 8px', padding: '8px 12px', borderLeft: `3px solid ${directorSwatch(q.directorId, AD).accent}`, fontSize: 12, fontStyle: 'italic', display: 'flex', gap: 10, alignItems: 'flex-start' }}><Avatar id={q.directorId} size={22} /><span>"{q.line}" <span className="dim" style={{ fontStyle: 'normal', fontSize: 10 }}>— {COUNCIL_DIRECTORS[q.directorId].name}</span></span></blockquote>)}</div>}
          <div style={{ border: '1px solid rgba(255,255,255,.1)', padding: 12, marginBottom: 12 }}>
            <div className="lbl" style={{ marginTop: 0 }}>THE DECISION THAT IS YOURS</div><p className="small" style={{ marginBottom: 8 }}>{s.openDecision}</p>
            <div className="btnrow" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button className={`minibtn ${session.userDecision?.choice === 'LEAD' ? 'blue' : ''}`} onClick={() => decide('LEAD')}>GO WITH THE LEAD</button>
              <button className={`minibtn ${session.userDecision?.choice === 'COUNTERPOINT' ? 'blue' : ''}`} onClick={() => decide('COUNTERPOINT')}>GO WITH THE COUNTERPOINT</button>
              <button className={`minibtn ${session.userDecision?.choice === 'OWN' ? 'blue' : ''}`} onClick={() => decide('OWN')}>I WILL DECIDE MYSELF</button>
              <button className="minibtn" onClick={() => decide('AGAIN')}>SEND IT BACK</button>
            </div>
          </div>
        </>}

        {session && session.proposals.length > 0 && <>
          <div className="lbl">WHAT EACH DIRECTOR PROPOSED</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 8, marginBottom: 12 }}>
            {session.proposals.map(p => { const sw = directorSwatch(p.directorId, AD); const role = s ? (s.lead === p.directorId ? 'LEAD' : s.counterpoint === p.directorId ? 'COUNTERPOINT' : s.editor === p.directorId ? 'EDITOR' : '') : ''; return <article key={p.directorId} style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${role ? sw.accent : 'rgba(255,255,255,.08)'}`, padding: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}><Avatar id={p.directorId} size={26} /><span style={{ minWidth: 0 }}><b style={{ fontSize: 11, display: 'block' }}>{p.title}</b><span className="dim" style={{ fontSize: 9 }}>{COUNCIL_DIRECTORS[p.directorId].name}{role ? ` · ${role}` : ''}</span></span></div>
              <p style={{ fontSize: 11.5, lineHeight: 1.5, margin: '0 0 6px' }}>{p.idea}</p>
              {[['Geometry', p.geometry], ['Type', p.typography], ['Image', p.imageLogic], ['Texture', p.texture], ['Motion', p.motion], ['Made by', p.productionMethod], ['Human trace', p.humanTrace], ['Risk', p.risk]].map(([k, v]) => v ? <p key={k} style={{ fontSize: 10.5, lineHeight: 1.45, margin: '0 0 3px' }}><b style={{ opacity: .7 }}>{k}</b> {v}</p> : null)}
              {p.arguesWith && <p style={{ fontSize: 10.5, lineHeight: 1.45, margin: '6px 0 0', color: '#F0C98A' }}>Argues with {COUNCIL_DIRECTORS[p.arguesWith.directorId].name}: {p.arguesWith.why}</p>}
            </article>; })}
          </div>
        </>}

        {session && session.disputes.length > 0 && <>
          <div className="lbl">SAID OUT LOUD</div>
          {session.disputes.map((d, i) => <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <Avatar id={d.from} size={24} /><div style={{ fontSize: 11.5, lineHeight: 1.5 }}><b>{COUNCIL_DIRECTORS[d.from].name}</b> <span className="dim">to {COUNCIL_DIRECTORS[d.against].name}</span> — {d.objection}{d.concession && <span className="dim"> Concedes: {d.concession}</span>}</div>
          </div>)}
        </>}

        {session && session.reflections.length > 0 && <>
          <div className="lbl" style={{ marginTop: 12 }}>WHAT IT MOVED IN THEM</div>
          {session.reflections.map(r => <div key={r.directorId} style={{ display: 'flex', gap: 10, padding: '6px 0' }}><Avatar id={r.directorId} size={22} /><p style={{ fontSize: 11, lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>{r.note}</p></div>)}
        </>}
      </section>
    </div>}

    {view === 'DIRECTOR' && <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,240px) minmax(0,1fr)', gap: 12, padding: 12, overflow: 'hidden' }}>
      <section style={{ overflow: 'auto' }}>
        {COUNCIL_LIST.map(d => <button key={d.id} onClick={() => setDirector(d.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', textAlign: 'left', background: director === d.id ? 'rgba(255,255,255,.08)' : 'transparent', border: '1px solid rgba(255,255,255,.06)', color: 'inherit', padding: '6px 8px', marginBottom: 4, cursor: 'pointer' }}><Avatar id={d.id} size={26} /><span><b style={{ fontSize: 11, display: 'block' }}>{d.name}</b><span className="dim" style={{ fontSize: 9 }}>{d.epithet}</span></span></button>)}
      </section>
      <section style={{ overflow: 'auto', paddingRight: 4 }}>
        {(() => { const d = COUNCIL_DIRECTORS[director]; const p = profiles[director]; const sw = directorSwatch(director, AD); return <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}><Avatar id={director} size={48} /><div><h3 style={{ margin: 0, fontSize: 20, letterSpacing: '-.03em' }}>{d.name}</h3><div className="dim" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>{d.epithet} · {d.medium}</div></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><div className="lbl">CONVICTION</div><p className="small">{d.conviction}</p><div className="lbl">PROTECTS</div><p className="small">{d.protects}</p><div className="lbl">CHALLENGES</div><p className="small">{d.challenges}</p></div>
            <div><div className="lbl">HOW THEY TALK</div><p className="small">{d.voice}</p><div className="lbl">STANDING ARGUMENTS</div>{Object.entries(d.tensions).map(([o, why]) => <p key={o} className="small" style={{ marginBottom: 4 }}><b>{COUNCIL_DIRECTORS[o as CouncilDirectorId].name}:</b> {why}</p>)}</div>
          </div>
          <div className="lbl">RECORD</div><p className="small">{p ? `Led ${p.ledCount} · counterpoint ${p.counterpointCount} · editor ${p.editorCount} · ${p.stances.length} briefs` : 'No sessions yet.'}</p>
          <div className="lbl">HOW THEIR TASTE HAS MOVED</div>
          {p && p.styleNotes.length ? [...p.styleNotes].sort((a, b) => b.at - a.at).slice(0, 12).map((n, i) => <p key={i} className="small" style={{ borderLeft: `2px solid ${sw.accent}`, paddingLeft: 8, marginBottom: 6 }}><span className="dim" style={{ fontSize: 9 }}>{when(n.at)} · </span>{n.text}</p>) : <p className="small dim">Nothing written yet. Their notes begin with the first brief.</p>}
          <div className="lbl">INFLUENCES THEY BROUGHT BACK</div>
          {p && p.influences.length ? [...p.influences].sort((a, b) => b.at - a.at).slice(0, 10).map((inf, i) => <p key={i} className="small" style={{ marginBottom: 6 }}><b>{inf.topic}</b> — {inf.finding} {inf.source && (inf.source.url ? <a href={inf.source.url} target="_blank" rel="noreferrer" style={{ color: sw.accent }}>{inf.source.title}</a> : <span className="dim">{inf.source.title}</span>)}</p>) : <p className="small dim">No research yet.</p>}
          <div className="btnrow" style={{ gap: 6, marginTop: 6 }}><input className="in grow" value={topic} onChange={e => setTopic(e.target.value)} placeholder={`Send ${d.name.split(' ').slice(-1)[0]} to research…`} onKeyDown={e => { if (e.key === 'Enter') research(); }} /><button className="minibtn blue" disabled={researching || topic.trim().length < 3} onClick={research}>{researching ? 'READING…' : 'RESEARCH'}</button></div>
          {error && <p className="small" style={{ color: '#ff7b7b' }}>{error}</p>}
          <div className="lbl">WORK THEY LED</div>
          <div className="btnrow" style={{ flexWrap: 'wrap', gap: 4 }}>{p && p.portfolio.length ? p.portfolio.map(w => <span key={w.id} className="chip" style={{ fontSize: 8 }}>{w.name}</span>) : <span className="small dim">—</span>}</div>
        </>; })()}
      </section>
    </div>}

    {view === 'ARCHIVE' && <div style={{ padding: 12, overflow: 'auto' }}>
      {!sessions.length && <p className="small dim">The council has not met for you yet.</p>}
      {sessions.map(x => <button key={x.id} onClick={() => { setSession(x); setView('ROOM'); }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', color: 'inherit', padding: '8px 10px', marginBottom: 6, cursor: 'pointer' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="dim" style={{ fontSize: 9 }}>{when(x.createdAt)}</span>{x.synthesis && <><Avatar id={x.synthesis.lead} size={18} /><span className="dim" style={{ fontSize: 9 }}>led</span></>}{x.userDecision && <span className="chip" style={{ fontSize: 8 }}>{x.userDecision.choice}</span>}<span className="chip" style={{ fontSize: 8, marginLeft: 'auto' }}>{x.status}</span></div>
        <div style={{ fontSize: 11.5, marginTop: 4 }}>{x.brief.ask.slice(0, 160)}</div>
      </button>)}
    </div>}
  </div>;
}
