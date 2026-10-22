// NewsroomStoryReview — the teacher's editorial read of a Student Newsroom story turned in to an
// Academia assignment. Shows the story as the student filed it, the same safety and coach checks
// the student saw, and the "send back with a note" path. Approval happens through the rubric
// grade in LessonGradingPanel, so publishing permission and mastery credit arrive together.

import React, { useMemo, useState } from 'react';
import { Loader2, ShieldAlert, Undo2 } from 'lucide-react';
import type { TemplateSubmission } from '../../services/assignmentTemplateService';
import { coach, fromSnapshot, safetyReview, storyText, wordCount } from '../../services/journalismSchool/studentDesk';
import { kitById, BAND_LABEL } from '../../services/journalismSchool/storyKits';
import { T, btn, badge } from './integrityTheme';

const NewsroomStoryReview: React.FC<{
  submission: TemplateSubmission;
  teacher: { uid: string; name: string };
  onReturned: () => Promise<void>;
}> = ({ submission, teacher, onReturned }) => {
  const story = useMemo(() => fromSnapshot(submission.newsroom!, { id: submission.studentId, name: submission.studentName }), [submission]);
  const kit = kitById(story.kitId);
  // Every reporter reaching this panel is assumed to be a minor: the stricter checks apply.
  const safety = useMemo(() => safetyReview(story, { authorIsMinor: true }), [story]);
  const notes = useMemo(() => coach(story).filter(n => n.tone !== 'praise'), [story]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const returned = submission.status === 'returned';

  const sendBack = async () => {
    setBusy(true); setErr(false);
    const { requestStoryChanges } = await import('../../services/journalismSchool/newsroomReview');
    const ok = await requestStoryChanges({ submission, note, teacher });
    setBusy(false);
    if (ok) await onReturned(); else setErr(true);
  };

  return (
    <div style={{ marginBottom: 16 }} data-testid="newsroom-review">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={badge(T.orange)}>{kit?.emoji} {kit?.title || 'Story'}</span>
        <span style={badge(T.muted)}>{BAND_LABEL[story.band]}</span>
        <span style={badge(T.faint)}>{wordCount(storyText(story))} words</span>
        {story.aiUsed && <span style={badge(T.warning)}>AI-assisted</span>}
        {returned && <span style={badge(T.warning)}>Sent back{submission.review?.note ? `: ${submission.review.note}` : ''}</span>}
      </div>

      <article style={{ background: '#f6f0e3', color: '#1a1612', borderRadius: 12, padding: '18px 20px', fontFamily: 'Georgia, serif' }}>
        {story.headline && <h2 style={{ margin: '0 0 6px', fontSize: 22, lineHeight: 1.2 }}>{story.headline}</h2>}
        {story.dek && <p style={{ margin: '0 0 8px', fontStyle: 'italic', color: '#4a4238' }}>{story.dek}</p>}
        {story.picture && <img src={story.picture} alt={story.caption} style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 6 }} />}
        {story.caption && <p style={{ margin: '0 0 10px', fontSize: 13, color: '#4a4238' }}>{story.caption}</p>}
        {storyText(story).split(/\n\s*\n/).filter(p => p.trim() && p !== story.caption).map((p, i) => <p key={i} style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.6 }}>{p}</p>)}
        {story.quotes.filter(q => q.text.trim()).map(q => {
          const sp = story.sources.find(s => s.id === q.speakerId);
          return <blockquote key={q.id} style={{ margin: '8px 0', paddingLeft: 10, borderLeft: '3px solid #b3261e', fontStyle: 'italic' }}>“{q.text}” {sp ? `— ${sp.name}` : ''} {q.readBack ? '' : <em style={{ color: '#8a3324', fontStyle: 'normal', fontSize: 12 }}>(not read back)</em>}</blockquote>;
        })}
      </article>

      {story.sources.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
          <strong style={{ color: T.ink }}>Sources:</strong>{' '}
          {story.sources.map(s => `${s.name || 'unnamed'}${s.role ? ` (${s.role})` : ''} · ${s.how}${s.primary ? ' · primary' : ''}${s.consent ? ' · agreed' : ' · NO CONSENT'}`).join('; ')}
        </div>
      )}

      {(safety.length > 0 || notes.length > 0) && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: `1px solid ${T.border}`, background: T.cardAlt, fontSize: 12.5, lineHeight: 1.6 }}>
          {safety.map(f => <div key={f.text} style={{ color: f.severity === 'block' ? T.danger : T.warning, display: 'flex', gap: 6, alignItems: 'baseline' }}><ShieldAlert size={12} style={{ flexShrink: 0, position: 'relative', top: 1 }} /><span>{f.text}</span></div>)}
          {notes.slice(0, 6).map((n, i) => <div key={i} style={{ color: T.muted }}>• {n.text}</div>)}
        </div>
      )}

      {!returned && submission.status !== 'graded' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <input
            value={note} onChange={e => setNote(e.target.value)} placeholder="What should the reporter fix?"
            style={{ flex: 1, minWidth: 220, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.ink, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}
          />
          <button onClick={sendBack} disabled={busy || !note.trim()} style={{ ...btn('outline', T.warning), opacity: busy || !note.trim() ? 0.5 : 1 }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} Send back
          </button>
          <span style={{ fontSize: 11.5, color: T.faint }}>or approve it for publication by grading it below.</span>
          {err && <span style={{ fontSize: 12, color: T.danger }}>Couldn’t send it back. Try again.</span>}
        </div>
      )}
      {safety.some(f => f.severity === 'block') && submission.status === 'submitted' && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: T.danger }}>This story has safety items to fix. Send it back rather than approving it.</p>
      )}
    </div>
  );
};

export default NewsroomStoryReview;
