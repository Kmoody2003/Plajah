// A class's discussion board, forum style: threads (newest activity, newest, or most upvoted), each with
// replies one level deep. Every lesson posted or assigned to the class has its own thread (made when it is
// assigned), and anyone in the class can start a discussion or share a resource — a lesson or syllabus from
// the library (opened in full, read only, in desk view) or links. Teachers pin, lock and remove.

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowBigUp, BookOpen, ExternalLink, Link2, Lock, MessageSquare, Pin, Plus, Trash2, X } from 'lucide-react';
import type { ChurchProgram } from '../../../services/churchEducationService';
import type { IngestedCurriculumUnit } from '../../../services/curriculumIngestionService';
import {
  addReply, attachedUnit, createThread, deleteReply, deleteThread, lessonAttachment, listReplies, listThreads,
  toggleReplyVote, toggleThreadVote, updateThread,
  type ClassThread, type ThreadAttachment, type ThreadKind, type ThreadReply,
} from '../../../services/classForum';
import DeskView from '../../desk/DeskView';
import { fmtDay } from './edWork';

const FORUM_CSS = `
.ce .fm-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ce .fm-list{display:grid;gap:8px}
.ce .fm-t{display:grid;grid-template-columns:44px 1fr;gap:10px;padding:12px 14px;border-radius:16px;border:1px solid var(--bd);background:var(--g1);text-align:left;color:inherit;cursor:pointer;font:inherit;width:100%}
.ce .fm-t:hover{border-color:var(--bd2)}
.ce .fm-vote{display:grid;justify-items:center;align-content:start;gap:0;font:800 .8rem/1 var(--fd)}
.ce .fm-vote button{appearance:none;border:0;background:transparent;color:var(--dim);cursor:pointer;padding:2px;border-radius:8px;display:grid}
.ce .fm-vote button[aria-pressed="true"]{color:var(--magenta)}
.ce .fm-tt{font:800 .95rem/1.3 var(--fd)}
.ce .fm-meta{font-size:.74rem;color:var(--faint);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ce .fm-kind{font:800 .6rem/1 var(--fd);letter-spacing:.06em;text-transform:uppercase;padding:4px 7px;border-radius:99px;background:var(--g2);color:var(--ink)}
.ce .fm-att{display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:14px;border:1px solid var(--bd);background:rgba(0,0,0,.2)}
.ce .fm-body{white-space:pre-wrap;line-height:1.55;font-size:.9rem}
.ce .fm-reply{display:grid;grid-template-columns:34px 1fr;gap:8px;padding:8px 0;border-top:1px solid var(--bd)}
.ce .fm-reply.sub{margin-left:42px}
.ce .fm-reply .fm-vote{font-size:.72rem}
`;

const KIND_LABEL: Record<ThreadKind, string> = { discussion: 'Discussion', lesson: 'Lesson', resource: 'Resource' };
type Sort = 'active' | 'new' | 'top';

export default function EdForum({ orgId, program: p, viewer, isTeacher, canSeeKey, units }: {
  orgId: string;
  program: ChurchProgram;
  viewer: { uid: string; name: string };
  isTeacher: boolean;
  canSeeKey: boolean;
  /** The class's lessons, to attach to a post. */
  units: IngestedCurriculumUnit[];
}) {
  const [threads, setThreads] = useState<ClassThread[] | null>(null);
  const [sort, setSort] = useState<Sort>('active');
  const [kind, setKind] = useState<'all' | ThreadKind>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [viewUnit, setViewUnit] = useState<IngestedCurriculumUnit | null>(null);
  const [err, setErr] = useState('');

  const load = () => listThreads(p.id).then(setThreads);
  useEffect(() => { void load(); }, [p.id]);

  const shown = useMemo(() => {
    const list = (threads || []).filter(t => kind === 'all' || t.kind === kind);
    const by = sort === 'top' ? (t: ClassThread) => t.upvoterUids.length : sort === 'new' ? (t: ClassThread) => t.createdAt : (t: ClassThread) => t.lastActivityAt;
    return list.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || by(b) - by(a));
  }, [threads, sort, kind]);
  const open = openId ? (threads || []).find(t => t.id === openId) || null : null;

  const patch = (t: ClassThread) => setThreads(list => (list || []).map(x => (x.id === t.id ? t : x)));
  const vote = async (t: ClassThread) => {
    const on = t.upvoterUids.includes(viewer.uid);
    patch({ ...t, upvoterUids: on ? t.upvoterUids.filter(u => u !== viewer.uid) : [...t.upvoterUids, viewer.uid] });
    await toggleThreadVote(t).catch(() => { patch(t); setErr('Couldn’t save your vote.'); });
  };

  const openAttachment = (a: ThreadAttachment) => {
    if (a.kind === 'link') { window.open(a.url, '_blank', 'noopener,noreferrer'); return; }
    // The teacher's own copy (with its key) when it's in this library; the posted class copy otherwise.
    const own = canSeeKey ? units.find(u => u.id === a.unitId) : undefined;
    const u = own || attachedUnit(a);
    if (u) setViewUnit(u);
  };

  return (
    <div className="stack">
      <style>{FORUM_CSS}</style>
      {err && <div className="err row"><span className="grow">{err}</span><button type="button" className="btn sm" onClick={() => setErr('')}><X size={13} /></button></div>}

      {open ? (
        <ThreadView
          thread={open}
          viewer={viewer}
          isTeacher={isTeacher}
          onBack={() => setOpenId(null)}
          onVote={() => vote(open)}
          onOpenAttachment={openAttachment}
          onChanged={patch}
          onDeleted={() => { setThreads(list => (list || []).filter(x => x.id !== open.id)); setOpenId(null); }}
          onError={setErr}
        />
      ) : (
        <>
          <div className="fm-bar">
            <div className="chips" role="group" aria-label="Sort">
              {([['active', 'Active'], ['new', 'New'], ['top', 'Top']] as const).map(([k, l]) => (
                <button key={k} type="button" className="chip" aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>
              ))}
            </div>
            <div className="chips" role="group" aria-label="Show">
              {([['all', 'All'], ['lesson', 'Lessons'], ['resource', 'Resources'], ['discussion', 'Discussions']] as const).map(([k, l]) => (
                <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>
              ))}
            </div>
            <span className="grow" />
            <button type="button" className="btn p" onClick={() => setComposing(true)}><Plus size={15} /> New post</button>
          </div>

          {threads === null ? (
            <div className="small">Loading the discussion…</div>
          ) : shown.length === 0 ? (
            <div className="empty">
              <div className="t">No posts yet</div>
              <div>Every lesson assigned to {p.name} gets a thread here. Start a discussion, or share a syllabus, a lesson or a link.</div>
            </div>
          ) : (
            <div className="fm-list">
              {shown.map(t => (
                <div key={t.id} className="fm-t" role="button" tabIndex={0} onClick={() => setOpenId(t.id)} onKeyDown={e => { if (e.key === 'Enter') setOpenId(t.id); }}>
                  <div className="fm-vote" onClick={e => e.stopPropagation()}>
                    <button type="button" aria-pressed={t.upvoterUids.includes(viewer.uid)} aria-label="Upvote" onClick={() => vote(t)}><ArrowBigUp size={20} /></button>
                    <span>{t.upvoterUids.length}</span>
                  </div>
                  <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                    <div className="fm-meta">
                      <span className="fm-kind">{KIND_LABEL[t.kind]}</span>
                      {t.pinned && <span><Pin size={11} /> Pinned</span>}
                      {t.locked && <span><Lock size={11} /> Locked</span>}
                      <span>{t.authorName} · {fmtDay(new Date(t.createdAt))}</span>
                    </div>
                    <div className="fm-tt">{t.title}</div>
                    {t.body && <div className="small" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.body}</div>}
                    <div className="fm-meta">
                      <span><MessageSquare size={12} /> {t.replyCount} {t.replyCount === 1 ? 'reply' : 'replies'}</span>
                      {t.attachments.length > 0 && <span>{t.attachments.map(a => a.title).join(' · ')}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {composing && (
        <Composer
          isTeacher={isTeacher}
          units={units}
          onClose={() => setComposing(false)}
          onPost={async draft => {
            const t = await createThread({ orgId, programId: p.id, ...draft });
            if (!t) { setErr('Couldn’t post. Check that you’re signed in and in this class.'); return; }
            setThreads(list => [t, ...(list || [])]);
            setComposing(false);
            setOpenId(t.id);
          }}
        />
      )}

      {viewUnit && <DeskView unit={viewUnit} canViewAnswerKey={canSeeKey} onClose={() => setViewUnit(null)} />}
    </div>
  );
}

function Attachment({ a, onOpen }: { a: ThreadAttachment; onOpen: () => void }) {
  return (
    <div className="fm-att">
      {a.kind === 'lesson' ? <BookOpen size={18} /> : <Link2 size={18} />}
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
        {a.kind === 'link' && <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.url}</div>}
      </div>
      <button type="button" className="btn sm" onClick={onOpen}>
        {a.kind === 'lesson' ? <>Open full reader</> : <><ExternalLink size={13} /> Open</>}
      </button>
    </div>
  );
}

function ThreadView({ thread: t, viewer, isTeacher, onBack, onVote, onOpenAttachment, onChanged, onDeleted, onError }: {
  thread: ClassThread;
  viewer: { uid: string; name: string };
  isTeacher: boolean;
  onBack: () => void;
  onVote: () => void;
  onOpenAttachment: (a: ThreadAttachment) => void;
  onChanged: (t: ClassThread) => void;
  onDeleted: () => void;
  onError: (m: string) => void;
}) {
  const [replies, setReplies] = useState<ThreadReply[] | null>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ThreadReply | null>(null);
  useEffect(() => { void listReplies(t.id).then(setReplies); }, [t.id]);

  const send = async () => {
    const r = await addReply(t, text, replyTo?.parentId || replyTo?.id);
    if (!r) { onError('Couldn’t send your reply.'); return; }
    setReplies(list => [...(list || []), r]);
    onChanged({ ...t, replyCount: t.replyCount + 1, lastActivityAt: r.createdAt });
    setText('');
    setReplyTo(null);
  };
  const voteReply = async (r: ThreadReply) => {
    const on = r.upvoterUids.includes(viewer.uid);
    setReplies(list => (list || []).map(x => (x.id === r.id ? { ...x, upvoterUids: on ? x.upvoterUids.filter(u => u !== viewer.uid) : [...x.upvoterUids, viewer.uid] } : x)));
    await toggleReplyVote(t, r).catch(() => onError('Couldn’t save your vote.'));
  };
  const removeReply = async (r: ThreadReply) => {
    await deleteReply(t, r).catch(() => onError('Couldn’t remove that reply.'));
    setReplies(list => (list || []).filter(x => x.id !== r.id && x.parentId !== r.id));
  };
  const mod = async (p: Partial<ClassThread>) => {
    const next = { ...t, ...p };
    onChanged(next);
    await updateThread(t, p).catch(() => { onChanged(t); onError('Couldn’t update the post.'); });
  };

  const top = (replies || []).filter(r => !r.parentId);
  const kids = (id: string) => (replies || []).filter(r => r.parentId === id);
  const canRemove = (authorUid: string) => isTeacher || authorUid === viewer.uid;

  const replyRow = (r: ThreadReply, sub = false) => (
    <div key={r.id} className={`fm-reply${sub ? ' sub' : ''}`}>
      <div className="fm-vote">
        <button type="button" aria-pressed={r.upvoterUids.includes(viewer.uid)} aria-label="Upvote reply" onClick={() => voteReply(r)}><ArrowBigUp size={17} /></button>
        <span>{r.upvoterUids.length}</span>
      </div>
      <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
        <div className="fm-meta"><strong style={{ color: 'var(--ink)' }}>{r.authorName}</strong> · {fmtDay(new Date(r.createdAt))}</div>
        <div className="fm-body">{r.body}</div>
        <div className="fm-meta">
          {!t.locked && <button type="button" className="btn link sm" onClick={() => setReplyTo(r)}>Reply</button>}
          {canRemove(r.authorUid) && <button type="button" className="btn link sm" onClick={() => removeReply(r)}>Remove</button>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="stack">
      <div className="row"><button type="button" className="btn sm" onClick={onBack}>← All posts</button></div>
      <div className="panel"><div className="pb" style={{ display: 'grid', gap: 10 }}>
        <div className="fm-meta">
          <span className="fm-kind">{KIND_LABEL[t.kind]}</span>
          <span>{t.authorName} · {fmtDay(new Date(t.createdAt))}</span>
          {t.pinned && <span><Pin size={11} /> Pinned</span>}
          {t.locked && <span><Lock size={11} /> Locked</span>}
        </div>
        <h3 style={{ fontFamily: 'var(--fd)', fontWeight: 900, fontSize: '1.2rem' }}>{t.title}</h3>
        {t.body && <div className="fm-body">{t.body}</div>}
        {t.attachments.map((a, i) => <Attachment key={i} a={a} onOpen={() => onOpenAttachment(a)} />)}
        <div className="row wrap" style={{ gap: 6 }}>
          <button type="button" className="btn sm" aria-pressed={t.upvoterUids.includes(viewer.uid)} onClick={onVote}><ArrowBigUp size={15} /> {t.upvoterUids.length}</button>
          {isTeacher && <button type="button" className="btn sm" onClick={() => mod({ pinned: !t.pinned })}><Pin size={13} /> {t.pinned ? 'Unpin' : 'Pin'}</button>}
          {isTeacher && <button type="button" className="btn sm" onClick={() => mod({ locked: !t.locked })}><Lock size={13} /> {t.locked ? 'Unlock' : 'Lock replies'}</button>}
          {canRemove(t.authorUid) && (
            <button type="button" className="btn sm" aria-label="Remove post" onClick={async () => { await deleteThread(t).catch(() => onError('Couldn’t remove the post.')); onDeleted(); }}><Trash2 size={13} /></button>
          )}
        </div>
      </div></div>

      <div className="panel"><div className="pb">
        <div className="small" style={{ marginBottom: 6 }}>{t.replyCount} {t.replyCount === 1 ? 'reply' : 'replies'}</div>
        {replies === null ? <div className="small">Loading replies…</div> : top.map(r => <React.Fragment key={r.id}>{replyRow(r)}{kids(r.id).map(k => replyRow(k, true))}</React.Fragment>)}
        {t.locked ? (
          <div className="small" style={{ paddingTop: 10 }}><Lock size={12} /> Replies are closed.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6, paddingTop: 10, borderTop: '1px solid var(--bd)' }}>
            {replyTo && <div className="small row">Replying to {replyTo.authorName}<button type="button" className="btn link sm" onClick={() => setReplyTo(null)}>Cancel</button></div>}
            <textarea className="field" rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="Add to the discussion" aria-label="Your reply" />
            <div className="row"><span className="grow" /><button type="button" className="btn p sm" disabled={!text.trim()} onClick={send}>Reply</button></div>
          </div>
        )}
      </div></div>
    </div>
  );
}

function Composer({ isTeacher, units, onClose, onPost }: {
  isTeacher: boolean;
  units: IngestedCurriculumUnit[];
  onClose: () => void;
  onPost: (d: { kind: ThreadKind; title: string; body: string; attachments: ThreadAttachment[] }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<ThreadAttachment[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const attachable = units.filter(u => !u.isAnswerKeyOnly);
  const addLink = () => {
    let u: URL;
    try { u = new URL(url.trim()); } catch { return; }
    if (!/^https?:$/.test(u.protocol)) return;
    setAttachments(a => [...a, { kind: 'link', url: u.toString(), title: u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : '') }]);
    setUrl('');
  };
  const kind: ThreadKind = attachments.length ? 'resource' : 'discussion';
  return (
    <>
      <div className="lib-scrim" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 210 }} />
      <div className="ce sheet" role="dialog" aria-modal="true" aria-label="New post" style={{ position: 'fixed', zIndex: 211, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(640px, calc(100vw - 24px))', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', background: '#100d19', border: '1px solid rgba(255,255,255,.14)', borderRadius: 22, padding: 18, display: 'grid', gap: 12 }}>
        <div className="row"><h3 className="grow" style={{ fontFamily: 'var(--fd)', fontWeight: 900 }}>New post</h3><button type="button" className="btn sm" onClick={onClose} aria-label="Close"><X size={15} /></button></div>
        <input className="field" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" aria-label="Title" autoFocus />
        <textarea className="field" rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="What do you want to discuss or share?" aria-label="Post" />
        {attachments.map((a, i) => (
          <div key={i} className="fm-att">
            {a.kind === 'lesson' ? <BookOpen size={16} /> : <Link2 size={16} />}
            <span className="grow" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
            <button type="button" className="btn link sm" onClick={() => setAttachments(x => x.filter((_, k) => k !== i))} aria-label="Remove attachment"><X size={13} /></button>
          </div>
        ))}
        {attachable.length > 0 && (
          <select className="field" value="" aria-label="Attach a lesson, syllabus or resource" onChange={e => {
            const u = attachable.find(x => x.id === e.target.value);
            const a = u && lessonAttachment(u);
            if (a) setAttachments(x => [...x, a]);
          }}>
            <option value="">Attach a lesson, syllabus or resource…</option>
            {attachable.map(u => <option key={u.id} value={u.id}>{u.title}</option>)}
          </select>
        )}
        <div className="row" style={{ gap: 6 }}>
          <input className="field grow" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} placeholder="Add a link (https://…)" aria-label="Link" />
          <button type="button" className="btn sm" onClick={addLink} disabled={!url.trim()}><Link2 size={13} /> Add</button>
        </div>
        {!isTeacher && <div className="small">Your teacher can pin, lock or remove posts.</div>}
        <div className="row"><span className="grow" /><button type="button" className="btn p" disabled={busy || !title.trim()} onClick={async () => { setBusy(true); await onPost({ kind, title, body, attachments }); setBusy(false); }}>Post</button></div>
      </div>
    </>
  );
}
