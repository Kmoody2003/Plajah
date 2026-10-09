/**
 * OutlineEditor — the course outline, edited as sections of lessons. Shared by the Course Studio
 * wizard (building a new course) and the Course Command Center (editing a live one), so the two
 * can never drift apart.
 *
 * Deliberately forgiving: every field is optional while drafting, rows reorder with two buttons
 * (no drag-and-drop to fight on a phone), and a lesson only needs a title to exist.
 */
import React from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Link2, Plus, Trash2, Type, Video } from 'lucide-react';
import type { Assignment, Lesson } from '../../../types';
import { syllabusFrom } from '../../../services/creatorCourses';

interface Props {
  lessons: Lesson[];
  assignments: Assignment[];
  onChange: (next: { lessons: Lesson[]; assignments: Assignment[]; syllabus: string }) => void;
}

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/40';
let n = 0;
const mk = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}`;

export default function OutlineEditor({ lessons, assignments, onChange }: Props) {
  const sorted = [...lessons].sort((a, b) => a.order - b.order);
  const sections: string[] = [];
  sorted.forEach(l => { const s = l.section || 'Lessons'; if (!sections.includes(s)) sections.push(s); });

  const commit = (ls: Lesson[], as: Assignment[] = assignments) => {
    const renumbered = ls.map((l, i) => ({ ...l, order: i + 1 }));
    onChange({ lessons: renumbered, assignments: as, syllabus: syllabusFrom(renumbered) });
  };

  const patch = (id: string, p: Partial<Lesson>) => commit(sorted.map(l => (l.id === id ? { ...l, ...p } : l)));
  const remove = (id: string) => commit(sorted.filter(l => l.id !== id));
  const move = (id: string, dir: -1 | 1) => {
    const i = sorted.findIndex(l => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const next = [...sorted];
    // Moving across a section boundary adopts the neighbour's section, so reordering never strands a lesson.
    const section = next[j].section;
    [next[i], next[j]] = [next[j], next[i]];
    next[j] = { ...next[j], section };
    commit(next);
  };
  const addLesson = (section: string) => {
    const lastIdx = sorted.map(l => l.section || 'Lessons').lastIndexOf(section);
    const fresh: Lesson = { id: mk('l'), title: '', description: '', type: 'VIDEO', order: 0, section };
    const next = [...sorted];
    next.splice(lastIdx + 1, 0, fresh);
    commit(next);
  };
  const addSection = () => {
    const name = `Module ${sections.length + 1}`;
    commit([...sorted, { id: mk('l'), title: '', description: '', type: 'VIDEO', order: 0, section: name }]);
  };
  const renameSection = (from: string, to: string) => commit(sorted.map(l => ((l.section || 'Lessons') === from ? { ...l, section: to } : l)));

  const patchAssign = (id: string, p: Partial<Assignment>) => commit(sorted, assignments.map(a => (a.id === id ? { ...a, ...p } : a)));
  const addAssign = () => commit(sorted, [...assignments, { id: mk('a'), title: '', description: '', dueDate: Date.now() + 7 * 86_400_000, maxPoints: 100 }]);
  const removeAssign = (id: string) => commit(sorted, assignments.filter(a => a.id !== id));

  return (
    <div className="space-y-6">
      {sections.map(section => (
        <div key={section} className="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.04]">
            <input
              defaultValue={section}
              onBlur={e => { const v = e.target.value.trim(); if (v && v !== section) renameSection(section, v); }}
              aria-label="Module name"
              className="flex-1 bg-transparent text-sm font-black uppercase tracking-widest text-white focus:outline-none"
            />
            <span className="text-[10px] text-white/30 uppercase tracking-widest">{sorted.filter(l => (l.section || 'Lessons') === section).length} lessons</span>
          </div>
          <div className="divide-y divide-white/5">
            {sorted.filter(l => (l.section || 'Lessons') === section).map(l => (
              <div key={l.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-white/10 text-[10px] font-black flex items-center justify-center text-white/60">{l.order}</span>
                  <input className={`${inputCls} flex-1 basis-[55%] min-w-0`} placeholder="Lesson title (what will they do or learn?)" value={l.title} onChange={e => patch(l.id, { title: e.target.value })} />
                  <button type="button" onClick={() => move(l.id, -1)} aria-label="Move up" className="p-3 sm:p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => move(l.id, 1)} aria-label="Move down" className="p-3 sm:p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => remove(l.id)} aria-label="Delete lesson" className="p-3 sm:p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:pl-8">
                  <div className="flex rounded-lg overflow-hidden border border-white/10">
                    {(['VIDEO', 'TEXT'] as const).map(t => (
                      <button key={t} type="button" onClick={() => patch(l.id, { type: t })}
                        className={`min-h-[40px] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${l.type === t ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}>
                        {t === 'VIDEO' ? <Video size={11} /> : <Type size={11} />}{t === 'VIDEO' ? 'Video' : 'Text'}
                      </button>
                    ))}
                  </div>
                  {l.type === 'TEXT' ? (
                    <textarea className={`${inputCls} flex-1 min-w-[200px]`} rows={2} placeholder="Write the lesson…" value={l.textContent || ''} onChange={e => patch(l.id, { textContent: e.target.value })} />
                  ) : (
                    <div className="flex-1 min-w-[200px] relative">
                      <Link2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input className={`${inputCls} pl-8`} placeholder="Video link (YouTube, Vimeo, or a Plajah video)" value={l.contentUrl || ''} onChange={e => patch(l.id, { contentUrl: e.target.value })} />
                    </div>
                  )}
                  <button type="button" onClick={() => patch(l.id, { preview: !l.preview })}
                    title="Free preview lessons show on your public course page"
                    className={`min-h-[40px] px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1 border ${l.preview ? 'border-emerald-400/50 text-emerald-300 bg-emerald-500/10' : 'border-white/10 text-white/40 hover:text-white'}`}>
                    {l.preview ? <Eye size={11} /> : <EyeOff size={11} />}{l.preview ? 'Free preview' : 'Members only'}
                  </button>
                </div>
                <input className={`${inputCls} sm:ml-8 sm:!w-[calc(100%-2rem)]`} placeholder="One line on what this lesson covers (optional)" value={l.description} onChange={e => patch(l.id, { description: e.target.value })} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addLesson(section)} className="w-full px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/5 flex items-center justify-center gap-2 border-t border-white/10">
            <Plus size={13} /> Add lesson to {section}
          </button>
        </div>
      ))}

      <button type="button" onClick={addSection} className="w-full rounded-3xl border border-dashed border-white/15 py-4 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-white/40 flex items-center justify-center gap-2">
        <Plus size={14} /> Add a module
      </button>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-black uppercase tracking-widest text-white/60">Assignments · what learners make</h4>
          <button type="button" onClick={addAssign} className="text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white flex items-center gap-1"><Plus size={12} /> Add</button>
        </div>
        {assignments.length === 0 && <p className="text-xs text-white/30">Assignments turn a video series into a class: learners submit work, you grade it in the gradebook.</p>}
        <div className="space-y-2">
          {assignments.map(a => (
            <div key={a.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Assignment title" value={a.title} onChange={e => patchAssign(a.id, { title: e.target.value })} />
                <input type="number" min={1} aria-label="Max points" className={`${inputCls} !w-24`} value={a.maxPoints} onChange={e => patchAssign(a.id, { maxPoints: Math.max(1, Number(e.target.value) || 100) })} />
                <button type="button" onClick={() => removeAssign(a.id)} aria-label="Delete assignment" className="p-3 sm:p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
              </div>
              <textarea className={inputCls} rows={2} placeholder="What should they make and submit?" value={a.description} onChange={e => patchAssign(a.id, { description: e.target.value })} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
