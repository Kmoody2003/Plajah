// One search box for everything in a class that the viewer may see: its lessons and assigned work (titles,
// questions, reading text — never answer keys), Discussion posts and replies' threads, Media Gallery items,
// and its people. Results jump to the right place.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Image as ImageIcon, MessagesSquare, Search, User, X } from 'lucide-react';
import type { ChurchProgram } from '../../../services/churchEducationService';
import type { IngestedCurriculumUnit } from '../../../services/curriculumIngestionService';
import type { UniversalDeskAssignment } from '../../../services/universalStudentDeskService';
import { listThreads, type ClassThread } from '../../../services/classForum';
import { listClassMedia, type ClassMediaItem } from '../../../services/classMedia';
import type { ClassChannel } from './EdClassClub';

const SEARCH_CSS = `
.ce .cs{position:relative}
.ce .cs-box{display:flex;align-items:center;gap:8px;height:42px;padding:0 12px;border-radius:99px;background:rgba(0,0,0,.3);border:1px solid var(--bd)}
.ce .cs-box:focus-within{border-color:var(--bd2)}
.ce .cs-box input{flex:1;min-width:0;background:transparent;border:0;outline:none;color:var(--ink);font-size:.9rem}
.ce .cs-pop{position:absolute;z-index:60;left:0;right:0;top:48px;max-height:min(60vh,520px);overflow-y:auto;border-radius:18px;border:1px solid var(--bd2);background:#141022;box-shadow:0 20px 50px rgba(0,0,0,.55);padding:8px;display:grid;gap:2px}
.ce .cs-h{font:800 .62rem/1 var(--fd);letter-spacing:.08em;text-transform:uppercase;color:var(--faint);padding:10px 10px 4px}
.ce .cs-r{appearance:none;border:0;background:transparent;color:var(--ink);display:flex;gap:10px;align-items:center;text-align:left;padding:9px 10px;border-radius:12px;cursor:pointer;font:inherit;width:100%}
.ce .cs-r:hover,.ce .cs-r:focus-visible{background:var(--g2);outline:none}
.ce .cs-r .t{font-weight:700;font-size:.86rem}
.ce .cs-r .u{font-size:.74rem;color:var(--faint);display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
`;

type Hit = { key: string; group: 'Lessons & work' | 'Discussion' | 'Media' | 'People'; title: string; sub: string; go: () => void };

const snippet = (text: string, q: string) => {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return '';
  const a = Math.max(0, i - 40);
  return `${a > 0 ? '…' : ''}${text.slice(a, i + q.length + 60).replace(/\s+/g, ' ')}${i + q.length + 60 < text.length ? '…' : ''}`;
};

export default function ClassSearch({ program: p, isTeacher, lessons, assignments, onOpenLesson, onGo }: {
  program: ChurchProgram;
  isTeacher: boolean;
  canSeeKey: boolean;
  lessons: IngestedCurriculumUnit[];
  assignments: UniversalDeskAssignment[];
  onOpenLesson: (u: IngestedCurriculumUnit) => void;
  onGo: (c: ClassChannel) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<ClassThread[] | null>(null);
  const [media, setMedia] = useState<ClassMediaItem[] | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // Posts and media load the first time someone searches.
  useEffect(() => {
    if (!open || threads) return;
    void listThreads(p.id).then(setThreads);
    void listClassMedia(p.id).then(setMedia);
  }, [open, threads, p.id]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: Hit[] = [];
    const seen = new Set<string>();
    const docs = [...lessons, ...assignments.map(a => a.unitSnapshot)].filter(u => u && !seen.has(u.id) && seen.add(u.id));
    for (const u of docs) {
      // What students see: title, questions, reading. Answer keys are never searched.
      const body = [u.title, u.sourceLabel, ...u.questions.map(x => `${x.group || ''} ${x.prompt}`), ...u.lessonBlocks.map(b => b.text)].join('\n');
      if (!body.toLowerCase().includes(s)) continue;
      const a = assignments.find(x => x.unitId === u.id);
      out.push({ key: `u${u.id}`, group: 'Lessons & work', title: u.title, sub: (a ? `Assigned · ${a.dueLabel} · ` : '') + (snippet(body.slice(u.title.length), s) || (u.questions.length ? `${u.questions.length} questions` : 'Reading')), go: () => onOpenLesson(u) });
    }
    for (const t of threads || []) {
      const body = `${t.title}\n${t.body}\n${t.attachments.map(a => a.title).join('\n')}\n${t.authorName}`;
      if (body.toLowerCase().includes(s)) out.push({ key: `t${t.id}`, group: 'Discussion', title: t.title, sub: snippet(body.slice(t.title.length), s) || `${t.authorName} · ${t.replyCount} replies`, go: () => onGo('forum') });
    }
    for (const m of media || []) {
      const body = `${m.title}\n${m.lessonTitle || ''}\n${m.kind}`;
      if (body.toLowerCase().includes(s)) out.push({ key: `m${m.id}`, group: 'Media', title: m.title, sub: [m.kind, m.lessonTitle].filter(Boolean).join(' · '), go: () => onGo('media') });
    }
    const people = [
      ...(p.leadInstructor ? [{ name: p.leadInstructor, role: 'Teacher' }] : []),
      ...(p.students || []).map(st => ({ name: st.name, role: 'Student' })),
    ];
    for (const person of people) {
      if (person.name?.toLowerCase().includes(s)) out.push({ key: `p${person.role}${person.name}`, group: 'People', title: person.name, sub: person.role, go: () => { if (isTeacher) onGo('people'); } });
    }
    return out.slice(0, 40);
  }, [q, lessons, assignments, threads, media, p, isTeacher, onOpenLesson, onGo]);

  const groups = (['Lessons & work', 'Discussion', 'Media', 'People'] as const).map(g => [g, hits.filter(h => h.group === g)] as const).filter(([, hs]) => hs.length);
  const iconFor = (g: Hit['group']) => (g === 'Discussion' ? <MessagesSquare size={16} /> : g === 'Media' ? <ImageIcon size={16} /> : g === 'People' ? <User size={16} /> : <BookOpen size={16} />);

  return (
    <div className="cs" ref={root}>
      <style>{SEARCH_CSS}</style>
      <label className="cs-box">
        <Search size={16} style={{ opacity: 0.55 }} />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); } }}
          placeholder={`Search ${p.name}: lessons, posts, media, people`}
          aria-label={`Search ${p.name}`}
        />
        {q && <button type="button" className="btn link sm" aria-label="Clear search" onClick={() => setQ('')}><X size={13} /></button>}
      </label>
      {open && q.trim().length >= 2 && (
        <div className="cs-pop" role="listbox" aria-label="Results">
          {groups.length === 0 ? (
            <div className="small" style={{ padding: 12 }}>{threads === null ? 'Searching…' : `Nothing in ${p.name} matches “${q.trim()}”.`}</div>
          ) : groups.map(([g, hs]) => (
            <React.Fragment key={g}>
              <div className="cs-h">{g}</div>
              {hs.map(h => (
                <button key={h.key} type="button" role="option" aria-selected={false} className="cs-r" onClick={() => { h.go(); setOpen(false); }}>
                  {iconFor(h.group)}
                  <span style={{ minWidth: 0 }}><div className="t">{h.title}</div>{h.sub && <div className="u">{h.sub}</div>}</span>
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
