// A class's Media Gallery: photos, videos, audio, recorded sessions and links — all at once, or lesson by
// lesson. Teachers add (upload or link) and file items under a lesson; everyone in the class looks, plays
// and downloads.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Film, Image as ImageIcon, Link2, Mic, Play, Plus, Trash2, Upload, Video, X } from 'lucide-react';
import type { ChurchProgram } from '../../../services/churchEducationService';
import {
  addClassMedia, kindForUrl, listClassMedia, removeClassMedia, updateClassMediaLesson, uploadClassMedia,
  type ClassMediaItem, type ClassMediaKind,
} from '../../../services/classMedia';

const MEDIA_CSS = `
.ce .md-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.ce .md-tile{appearance:none;border:1px solid var(--bd);background:var(--g1);border-radius:14px;overflow:hidden;padding:0;cursor:pointer;color:inherit;text-align:left;display:grid;font:inherit}
.ce .md-tile:hover{border-color:var(--bd2)}
.ce .md-thumb{aspect-ratio:4/3;display:grid;place-items:center;background:rgba(0,0,0,.35);position:relative;overflow:hidden}
.ce .md-thumb img,.ce .md-thumb video{width:100%;height:100%;object-fit:cover;display:block}
.ce .md-thumb .md-play{position:absolute;inset:auto auto 8px 8px;width:30px;height:30px;border-radius:99px;background:rgba(0,0,0,.6);display:grid;place-items:center}
.ce .md-cap{padding:8px 10px;display:grid;gap:2px}
.ce .md-cap b{font:700 .8rem/1.3 var(--fd);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ce .md-cap span{font-size:.7rem;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.md-view{position:fixed;inset:0;z-index:220;background:rgba(0,0,0,.86);display:grid;grid-template-rows:auto 1fr auto;padding:12px;gap:10px}
.md-view .md-stage{min-height:0;display:grid;place-items:center}
.md-view .md-stage img,.md-view .md-stage video{max-width:100%;max-height:100%;border-radius:10px}
`;

const KINDS: Array<[ClassMediaKind | 'all', string]> = [['all', 'All'], ['photo', 'Photos'], ['video', 'Video'], ['recording', 'Recorded sessions'], ['audio', 'Audio'], ['link', 'Links'], ['document', 'Files']];
const icon = (k: ClassMediaKind) => (k === 'photo' ? <ImageIcon size={26} /> : k === 'video' ? <Video size={26} /> : k === 'recording' ? <Film size={26} /> : k === 'audio' ? <Mic size={26} /> : <Link2 size={26} />);

export default function EdMedia({ orgId, program: p, isTeacher, lessons }: {
  orgId: string;
  program: ChurchProgram;
  isTeacher: boolean;
  /** The class's lessons (assigned or in its plan), to file media under. */
  lessons: Array<{ id: string; title: string }>;
}) {
  const [items, setItems] = useState<ClassMediaItem[] | null>(null);
  const [lesson, setLesson] = useState<string>('all');
  const [kind, setKind] = useState<ClassMediaKind | 'all'>('all');
  const [open, setOpen] = useState<ClassMediaItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { void listClassMedia(p.id).then(setItems); }, [p.id]);

  // Lessons that have media, in the class's own order, then any other lesson an item names.
  const lessonChips = useMemo(() => {
    const used = new Set((items || []).map(i => i.lessonId).filter(Boolean) as string[]);
    const known = lessons.filter(l => used.has(l.id));
    const extra = (items || []).filter(i => i.lessonId && !lessons.some(l => l.id === i.lessonId)).map(i => ({ id: i.lessonId!, title: i.lessonTitle || 'Lesson' }));
    return [...known, ...extra.filter((x, k, a) => a.findIndex(y => y.id === x.id) === k)];
  }, [items, lessons]);
  const shown = (items || []).filter(i => (lesson === 'all' || (lesson === 'none' ? !i.lessonId : i.lessonId === lesson)) && (kind === 'all' || i.kind === kind));

  return (
    <div className="stack">
      <style>{MEDIA_CSS}</style>
      {err && <div className="err row"><span className="grow">{err}</span><button type="button" className="btn sm" onClick={() => setErr('')}><X size={13} /></button></div>}
      <div className="row wrap" style={{ gap: 8 }}>
        <div className="chips" role="group" aria-label="Lesson">
          {lessonChips.length > 0 && <button type="button" className="chip" aria-pressed={lesson === 'all'} onClick={() => setLesson('all')}>All lessons</button>}
          {lessonChips.map(l => <button key={l.id} type="button" className="chip" aria-pressed={lesson === l.id} onClick={() => setLesson(l.id)}>{l.title}</button>)}
          {(items || []).some(i => !i.lessonId) && lessonChips.length > 0 && <button type="button" className="chip" aria-pressed={lesson === 'none'} onClick={() => setLesson('none')}>Not under a lesson</button>}
        </div>
        <span className="grow" />
        {isTeacher && <button type="button" className="btn p" onClick={() => setAdding(true)}><Plus size={15} /> Add media</button>}
      </div>
      {!!items?.length && <div className="chips" role="group" aria-label="Kind">
        {KINDS.filter(([k]) => k === 'all' || (items || []).some(i => i.kind === k)).map(([k, l]) => (
          <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>
        ))}
      </div>}

      {items === null ? <div className="small">Loading the gallery…</div> : shown.length === 0 ? (
        <div className="empty">
          <div className="t">{items.length ? 'Nothing here' : 'No media yet'}</div>
          <div>{isTeacher ? 'Add photos, videos, audio, recorded sessions or links, and file them under a lesson.' : 'Photos, videos and recordings your teacher shares show up here.'}</div>
        </div>
      ) : (
        <div className="md-grid">
          {shown.map(i => (
            <button key={i.id} type="button" className="md-tile" onClick={() => (i.kind === 'link' || i.kind === 'document' ? window.open(i.url, '_blank', 'noopener,noreferrer') : setOpen(i))}>
              <div className="md-thumb">
                {i.kind === 'photo' ? <img src={i.url} alt={i.title} loading="lazy" /> : (i.kind === 'video' || i.kind === 'recording') && !/youtube|youtu\.be|vimeo/.test(i.url) ? <video src={`${i.url}#t=0.5`} preload="metadata" muted /> : icon(i.kind)}
                {(i.kind === 'video' || i.kind === 'recording' || i.kind === 'audio') && <span className="md-play"><Play size={15} /></span>}
              </div>
              <div className="md-cap"><b>{i.title}</b><span>{i.lessonTitle || KINDS.find(k => k[0] === i.kind)?.[1]}</span></div>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="md-view" role="dialog" aria-modal="true" aria-label={open.title}>
          <div className="row" style={{ color: '#fff' }}>
            <strong className="grow">{open.title}</strong>
            <a className="btn sm" href={open.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><ExternalLink size={13} /> Open</a>
            <button type="button" className="btn sm" onClick={() => setOpen(null)} aria-label="Close" autoFocus><X size={15} /></button>
          </div>
          <div className="md-stage">
            {open.kind === 'photo' ? <img src={open.url} alt={open.title} />
              : open.kind === 'audio' ? <audio src={open.url} controls autoPlay style={{ width: 'min(640px,100%)' }} />
              : /youtube\.com|youtu\.be|vimeo\.com/.test(open.url) ? <a className="btn p" href={open.url} target="_blank" rel="noreferrer">Watch on {/vimeo/.test(open.url) ? 'Vimeo' : 'YouTube'}</a>
              : <video src={open.url} controls autoPlay playsInline />}
          </div>
          {isTeacher && (
            <div className="row wrap" style={{ gap: 8 }}>
              <select className="field" style={{ maxWidth: 320 }} aria-label="Lesson" value={open.lessonId || ''} onChange={async e => {
                const l = lessons.find(x => x.id === e.target.value) || null;
                const next = { ...open, lessonId: l?.id, lessonTitle: l?.title };
                await updateClassMediaLesson(open, l).then(() => { setItems(list => (list || []).map(x => (x.id === open.id ? next : x))); setOpen(next); }).catch(() => setErr('Couldn’t move it.'));
              }}>
                <option value="">Not under a lesson</option>
                {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
              <span className="grow" />
              <button type="button" className="btn sm" onClick={async () => { await removeClassMedia(open).then(() => { setItems(list => (list || []).filter(x => x.id !== open.id)); setOpen(null); }).catch(() => setErr('Couldn’t remove it.')); }}><Trash2 size={13} /> Remove</button>
            </div>
          )}
        </div>
      )}

      {adding && (
        <AddMedia
          lessons={lessons}
          onClose={() => setAdding(false)}
          onFiles={async (files, l, recorded) => {
            for (const f of files) {
              const it = await uploadClassMedia(f, { orgId, programId: p.id, lessonId: l?.id, lessonTitle: l?.title, ...(recorded && f.type.startsWith('video/') ? { kind: 'recording' as const } : {}) }).catch(() => null);
              if (it) setItems(list => [it, ...(list || [])]); else setErr(`Couldn’t add ${f.name}.`);
            }
            setAdding(false);
          }}
          onLink={async (url, title, l) => {
            const it = await addClassMedia({ orgId, programId: p.id, kind: kindForUrl(url), title: title || url, url, ...(l ? { lessonId: l.id, lessonTitle: l.title } : {}) });
            if (it) { setItems(list => [it, ...(list || [])]); setAdding(false); } else setErr('Couldn’t add that link.');
          }}
        />
      )}
    </div>
  );
}

function AddMedia({ lessons, onClose, onFiles, onLink }: {
  lessons: Array<{ id: string; title: string }>;
  onClose: () => void;
  onFiles: (files: File[], lesson: { id: string; title: string } | null, recorded: boolean) => Promise<void>;
  onLink: (url: string, title: string, lesson: { id: string; title: string } | null) => Promise<void>;
}) {
  const [lessonId, setLessonId] = useState('');
  const [recorded, setRecorded] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lesson = lessons.find(l => l.id === lessonId) || null;
  const validUrl = (() => { try { return /^https?:$/.test(new URL(url.trim()).protocol); } catch { return false; } })();
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 210 }} />
      <div className="ce" role="dialog" aria-modal="true" aria-label="Add media" style={{ position: 'fixed', zIndex: 211, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(560px, calc(100vw - 24px))', background: '#100d19', border: '1px solid rgba(255,255,255,.14)', borderRadius: 22, padding: 18, display: 'grid', gap: 12 }}>
        <div className="row"><h3 className="grow" style={{ fontFamily: 'var(--fd)', fontWeight: 900 }}>Add media</h3><button type="button" className="btn sm" onClick={onClose} aria-label="Close"><X size={15} /></button></div>
        <select className="field" value={lessonId} onChange={e => setLessonId(e.target.value)} aria-label="Lesson">
          <option value="">Not under a lesson</option>
          {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
        <input ref={fileRef} type="file" multiple accept="image/*,video/*,audio/*,application/pdf" hidden onChange={async e => {
          const files = Array.from(e.target.files || []);
          if (!files.length) return;
          setBusy(true);
          await onFiles(files, lesson, recorded);
          setBusy(false);
        }} />
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={recorded} onChange={e => setRecorded(e.target.checked)} /> These videos are recorded class sessions</label>
        <button type="button" className="btn p" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={15} /> {busy ? 'Uploading…' : 'Upload photos, video or audio'}</button>
        <div className="small" style={{ textAlign: 'center' }}>or add a link</div>
        <input className="field" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" aria-label="Link" />
        <input className="field" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" aria-label="Title" />
        <div className="row"><span className="grow" /><button type="button" className="btn sm" disabled={!validUrl || busy} onClick={async () => { setBusy(true); await onLink(url.trim(), title.trim(), lesson); setBusy(false); }}><Link2 size={13} /> Add link</button></div>
      </div>
    </>
  );
}
