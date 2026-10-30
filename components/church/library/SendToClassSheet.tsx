// Send to class: put documents and media in a class without making them lessons. A syllabus, handout,
// reading, link or file goes to the class's Discussion as a resource post (students open the document in
// full there); photos, video, audio and recordings can go to its Media Gallery instead. Work to turn in uses
// "Assign to class" (AssignScheduleSheet).

import React, { useEffect, useState } from 'react';
import { Check, Images, MessagesSquare, X } from 'lucide-react';
import { listPrograms, type ChurchProgram } from '../../../services/churchEducationService';
import type { IngestedCurriculumUnit } from '../../../services/curriculumIngestionService';
import { createThread, lessonAttachment, type ThreadAttachment } from '../../../services/classForum';
import { addClassMedia, kindForUrl, type ClassMediaKind } from '../../../services/classMedia';

export interface SendItem {
  title: string;
  /** A library document (opened in full from the post). */
  unit?: IngestedCurriculumUnit;
  /** A file or link. */
  url?: string;
  kind?: ClassMediaKind;
}

const isMedia = (i: SendItem) => !i.unit && !!i.url && ['photo', 'video', 'audio', 'recording'].includes(i.kind || kindForUrl(i.url));

export default function SendToClassSheet({ items, orgId, programs: given, onClose, onDone }: {
  items: SendItem[];
  orgId: string;
  /** The org's classes when the caller has them; otherwise loaded here (classes this viewer can open). */
  programs?: ChurchProgram[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [programs, setPrograms] = useState<ChurchProgram[] | null>(given || null);
  useEffect(() => {
    if (given) { setPrograms(given); return; }
    let live = true;
    listPrograms(orgId).then(ps => { if (live) setPrograms(ps); }).catch(() => { if (live) setPrograms([]); });
    return () => { live = false; };
  }, [orgId, given]);
  // Every class this viewer can open: org teachers post to classes they aren't listed on, and the rules have the last word.
  const mine = programs || [];
  const [classIds, setClassIds] = useState<string[]>([]);
  useEffect(() => { if (mine.length === 1) setClassIds([mine[0].id]); }, [mine]);
  const allMedia = items.length > 0 && items.every(isMedia);
  const [where, setWhere] = useState<'discussion' | 'media'>(allMedia ? 'media' : 'discussion');
  const [together, setTogether] = useState(items.length > 1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const attachmentOf = (i: SendItem): ThreadAttachment | null => (i.unit ? lessonAttachment(i.unit) : i.url ? { kind: 'link', url: i.url, title: i.title } : null);

  const send = async () => {
    setBusy(true);
    setErr('');
    let sent = 0;
    for (const pid of classIds) {
      const p = mine.find(x => x.id === pid);
      if (!p) continue;
      if (where === 'media') {
        for (const i of items.filter(isMedia)) {
          const ok = await addClassMedia({ orgId: p.orgId || orgId, programId: p.id, kind: i.kind || kindForUrl(i.url!), title: i.title, url: i.url! });
          if (ok) sent++;
        }
        continue;
      }
      const posts = together
        ? [{ title: items.length === 1 ? items[0].title : `${items[0].title} and ${items.length - 1} more`, atts: items.map(attachmentOf).filter((a): a is ThreadAttachment => !!a) }]
        : items.map(i => ({ title: i.title, atts: [attachmentOf(i)].filter((a): a is ThreadAttachment => !!a) }));
      for (const post of posts) {
        const t = await createThread({ orgId: p.orgId || orgId, programId: p.id, kind: 'resource', title: post.title, body: note, attachments: post.atts });
        if (t) sent++;
      }
    }
    setBusy(false);
    if (!sent) { setErr('Nothing was sent. You may not have permission to post in that class. Ask an org admin to add you as a teacher.'); return; }
    const names = mine.filter(p => classIds.includes(p.id)).map(p => p.name).join(', ');
    onDone(where === 'media' ? `Added to the Media Gallery of ${names}.` : `Posted to the Discussion of ${names} as a resource.`);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 230 }} />
      <div className="ce" role="dialog" aria-modal="true" aria-label="Send to class" style={{ position: 'fixed', zIndex: 231, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(600px, calc(100vw - 24px))', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', background: '#100d19', border: '1px solid rgba(255,255,255,.14)', borderRadius: 22, padding: 18, display: 'grid', gap: 14, color: '#fff' }}>
        <div className="row">
          <div className="grow">
            <h3 style={{ fontFamily: 'var(--fd)', fontWeight: 900 }}>Send to class</h3>
            <div className="small">{items.length === 1 ? items[0].title : `${items.length} items`} · not as a lesson or assignment</div>
          </div>
          <button type="button" className="btn sm" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <div className="small">Class</div>
          {programs === null ? <div className="small">Loading your classes…</div> : mine.length === 0 ? (
            <div className="err">No classes yet. Make a class in Christian Education first.</div>
          ) : (
            <div className="chips" role="group" aria-label="Class">
              {mine.map(p => {
                const on = classIds.includes(p.id);
                return (
                  <button key={p.id} type="button" className="chip" aria-pressed={on} onClick={() => setClassIds(ids => (on ? ids.filter(x => x !== p.id) : [...ids, p.id]))}>
                    {on && <Check size={12} />} {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <div className="small">Where in the class</div>
          <div className="chips" role="group" aria-label="Where">
            <button type="button" className="chip" aria-pressed={where === 'discussion'} onClick={() => setWhere('discussion')}><MessagesSquare size={12} /> Discussion, as a resource</button>
            {items.some(isMedia) && <button type="button" className="chip" aria-pressed={where === 'media'} onClick={() => setWhere('media')}><Images size={12} /> Media Gallery</button>}
          </div>
          {where === 'media' && !allMedia && <div className="small">Only the photos, video and audio go to the gallery; documents need the Discussion.</div>}
        </div>

        {where === 'discussion' && (
          <>
            {items.length > 1 && (
              <label className="row small" style={{ gap: 8 }}>
                <input type="checkbox" checked={together} onChange={e => setTogether(e.target.checked)} /> One post with everything attached (otherwise one post each)
              </label>
            )}
            <textarea className="field" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="A note for the class (optional)" aria-label="Note" />
          </>
        )}

        {err && <div className="err">{err}</div>}
        <div className="row"><span className="grow" /><button type="button" className="btn p" disabled={busy || !classIds.length} onClick={send}>{busy ? 'Sending…' : 'Send'}</button></div>
      </div>
    </>
  );
}
