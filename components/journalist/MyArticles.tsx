import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Clock, Eye, FileText, Pencil, Rss } from 'lucide-react';
import { Button, Chip, Surface, Textarea } from '../ui';
import { auth, fetchArticleById } from '../../services/backendService';
import { addNoticeOnly, archiveArticle, listMyArticles, releaseMyDueEmbargoes, type MyArticleRow } from '../../services/journalist/articleService';
import { NOTICE_LABELS, NOTICE_ORDER } from '../../services/journalist/correctionLog';
import { headlineToLowerThird, headlinesToTicker } from '../../services/journalist/broadcastBridge';
import { buildEmailIssue, feedArticleFromRecord } from '../../services/journalist/feedGenerators';
import { sendCampaign, sendTest } from '../../services/campaignService';
import type { NoticeLabel } from '../../services/journalist/types';

const STATUS_COLOR: Record<MyArticleRow['status'], string> = { DRAFT: '#9C96B4', SCHEDULED: '#F59E0B', PUBLISHED: '#06D6A0', RETRACTED: '#FF5C6C' };

interface Props { uid: string; onOpenArticle: (id: string) => void; onViewArticle: (id: string) => void; onNewArticle: () => void }

export const MyArticles: React.FC<Props> = ({ uid, onOpenArticle, onViewArticle, onNewArticle }) => {
  const [rows, setRows] = useState<MyArticleRow[] | null>(null);
  const [error, setError] = useState('');
  const [noticeFor, setNoticeFor] = useState('');
  const [label, setLabel] = useState<NoticeLabel>('EDITORS_NOTE');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const released = await releaseMyDueEmbargoes(uid);
      if (released) setMsg(`${released} embargoed article${released > 1 ? 's' : ''} released.`);
      setRows(await listMyArticles(uid));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your articles.'); setRows([]); }
  }, [uid]);
  useEffect(() => { void load(); }, [load]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const uname = auth.currentUser?.displayName ? `By ${auth.currentUser.displayName}` : undefined;

  const issue = async (id: string) => {
    const a = await fetchArticleById(id);
    if (!a) { setMsg('Article not found.'); return; }
    const r = await addNoticeOnly(a, label, text);
    setMsg(r.ok ? 'Notice published on the article.' : r.error || 'Could not add the notice.');
    if (r.ok) { setNoticeFor(''); setText(''); void load(); }
  };
  /** Email an article through the built-in campaigns service. Consent, postal address and unsubscribe are enforced server-side. */
  const email = async (id: string, test: boolean) => {
    const a = await fetchArticleById(id);
    if (!a) { setMsg('Article not found.'); return; }
    const to = auth.currentUser?.email || '';
    if (test && !to) { setMsg('Your account has no email address to send a test to.'); return; }
    if (!test && !window.confirm('Send this article to everyone on your mailing list who opted in? This cannot be recalled.')) return;
    try {
      const issue = buildEmailIssue(feedArticleFromRecord(id, a as any, origin), { publicationName: a.authorName || 'Plajah', omitFooter: true });
      const r = test ? await sendTest(issue.subject, issue.html, to) : await sendCampaign(issue.subject, issue.html);
      setMsg(test ? `Test sent to ${to}.` : `Sent to ${r.sent} subscriber${r.sent === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}.`);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'The email could not be sent.'); }
  };
  const archive = async (id: string) => {
    const a = await fetchArticleById(id);
    if (a?.tela && window.confirm('Pin this article to its current version? It will stop following future versions (archive state).')) { await archiveArticle(a); setMsg('Archived: pinned to the current version.'); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="pj-actions">
        <Button variant="primary" icon={<Pencil />} onClick={onNewArticle}>New article</Button>
        <a className="pj-btn pj-btn--outline pj-btn--md" href={`${origin}/feeds/author/${encodeURIComponent(uid)}.rss`} target="_blank" rel="noopener noreferrer"><Rss size={14} /> My RSS feed</a>
        <a className="pj-btn pj-btn--outline pj-btn--md" href={`${origin}/feeds/author/${encodeURIComponent(uid)}.atom`} target="_blank" rel="noopener noreferrer">Atom</a>
      </div>
      {msg && <p role="status" className="text-sm" style={{ color: 'var(--pj-success)' }}>{msg}</p>}
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--pj-danger)' }}>{error}</p>}
      {rows === null && <p className="text-sm opacity-60">Loading your articles...</p>}
      <ul className="flex flex-col gap-3">
        {rows?.map(r => (
          <li key={r.id}>
            <Surface level={1} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words">{r.title}</p>
                  <p className="text-[11px] opacity-60">{r.legacy ? 'Original block article (shown through Tela read-only)' : 'Tela article'} · {r.notices} public notice{r.notices === 1 ? '' : 's'}{r.embargoUntil ? ` · embargo ${new Date(r.embargoUntil).toLocaleString()}` : ''}</p>
                </div>
                <Chip style={{ color: STATUS_COLOR[r.status] }}>{r.status === 'SCHEDULED' ? <><Clock size={11} /> SCHEDULED</> : r.status}</Chip>
              </div>
              <div className="pj-actions">
                <Button size="sm" variant="secondary" icon={<Pencil />} onClick={() => onOpenArticle(r.id)}>Edit</Button>
                {r.status !== 'DRAFT' && r.status !== 'SCHEDULED' && <Button size="sm" variant="ghost" icon={<Eye />} onClick={() => onViewArticle(r.id)}>View</Button>}
                <Button size="sm" variant="ghost" icon={<FileText />} onClick={() => setNoticeFor(noticeFor === r.id ? '' : r.id)}>Add public notice</Button>
                {!r.legacy && r.status === 'PUBLISHED' && <Button size="sm" variant="ghost" icon={<Archive />} onClick={() => void archive(r.id)}>Archive</Button>}
                {r.status === 'PUBLISHED' && <>
                  <a className="pj-btn pj-btn--ghost pj-btn--sm" href={`${origin}/feeds/article/${r.id}/amp`} target="_blank" rel="noopener noreferrer">HTML</a>
                  <a className="pj-btn pj-btn--ghost pj-btn--sm" href={`${origin}/feeds/article/${r.id}/apple-news.json`} target="_blank" rel="noopener noreferrer">Apple News JSON</a>
                  <a className="pj-btn pj-btn--ghost pj-btn--sm" href={`${origin}/feeds/article/${r.id}/email.html`} target="_blank" rel="noopener noreferrer">Email HTML</a>
                  <Button size="sm" variant="ghost" onClick={() => void email(r.id, true)}>Email test to me</Button>
                  <Button size="sm" variant="ghost" onClick={() => void email(r.id, false)}>Email subscribers</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { const res = await headlineToLowerThird(r.title, uname); if (!res.ok) setMsg(res.error || 'Lower thirds unavailable.'); }}>Lower third</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { const res = await headlinesToTicker(rows.filter(x => x.status === 'PUBLISHED').slice(0, 6).map(x => x.title)); if (!res.ok) setMsg(res.error || 'Ticker unavailable.'); }}>Ticker</Button>
                </>}
              </div>
              {noticeFor === r.id && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    {NOTICE_ORDER.filter(l => !NOTICE_LABELS[l].changesBody || l === 'RETRACTION').map(l => (
                      <Chip key={l} interactive selected={label === l} onClick={() => { setLabel(l); if (!text) setText(NOTICE_LABELS[l].prefix + ' '); }}>{NOTICE_LABELS[l].heading}</Chip>
                    ))}
                  </div>
                  <Textarea label="Notice shown to every reader, with the date and your name" rows={3} value={text} onChange={e => setText(e.target.value)} />
                  <p className="text-[11px] opacity-60">To change the text itself, edit the article: the editor makes you attach a Correction, Clarification or Update, and keeps the earlier version readable. Notices cannot be edited or removed afterwards.</p>
                  <div><Button variant="primary" disabled={text.trim().length < 8} onClick={() => void issue(r.id)}>Publish notice</Button></div>
                </div>
              )}
            </Surface>
          </li>
        ))}
        {rows?.length === 0 && <li className="text-sm opacity-60">No articles yet.</li>}
      </ul>
    </div>
  );
};

export default MyArticles;
