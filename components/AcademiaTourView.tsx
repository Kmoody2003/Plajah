// AcademiaTourView — a no-signup "Tour Academia" walkthrough. A visitor picks Teacher,
// Parent, or Student and experiences the SAME demo class (Ms. Rivera, Room 4B) from that
// role, and can switch roles to watch the loop connect: a teacher awards points → the
// parent sees them on their child's week → the student sees their own total; a lesson the
// teacher built from Plajah's archives → the student opens it. Fully local/bundled (demo
// classroomStore), nothing persists. This is the centerpiece for showing how the ecosystem
// works without asking anyone to sign up.

import React, { useState } from 'react';
import {
  GraduationCap, Users, Baby, ArrowLeft, X, Sparkles, ShieldCheck, Music, Film,
  Image as ImageIcon, BookOpen, CheckCircle2, Clock, MessageCircle, Award, ChevronRight, Languages,
} from 'lucide-react';
import { useClassroom, classroomStore } from '../data/classroomStore';
import { DEMO_CLASS, DEMO_LESSON, DEMO_ASSIGNMENT, DEMO_MESSAGES, DEMO_LEDGER } from '../data/demoClassroom';

type Role = 'teacher' | 'parent' | 'student';

const ROLE_META: Record<Role, { label: string; icon: React.ElementType; accent: string; wash: string; blurb: string }> = {
  teacher: { label: 'Teacher', icon: GraduationCap, accent: '#FF8C00', wash: 'rgba(255,140,0,0.12)', blurb: 'Award points, take attendance, build a lesson from Plajah\'s archives, and message a parent.' },
  parent:  { label: 'Parent',  icon: Users,          accent: '#2bd67a', wash: 'rgba(43,214,122,0.12)', blurb: 'See your child\'s week, their portfolio record, and a two-way thread with the teacher.' },
  student: { label: 'Student', icon: Baby,           accent: '#36c5f0', wash: 'rgba(54,197,240,0.12)', blurb: 'See your points, open today\'s lesson, and jump into a Reading + language quest.' },
};

const CONTENT_ICON = { MUSIC: Music, FILM: Film, ART: ImageIcon, READING: BookOpen } as const;

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`rounded-2xl bg-white/[0.04] border border-white/10 p-4 sm:p-5 ${className || ''}`}>{children}</div>
);
const SectionTitle: React.FC<{ children: React.ReactNode; icon?: React.ElementType }> = ({ children, icon: Icon }) => (
  <div className="flex items-center gap-2 mb-3">
    {Icon && <Icon size={15} className="text-white/50" />}
    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">{children}</h3>
  </div>
);

const AcademiaTourView: React.FC<{ onExit: () => void; onNavigate?: (view: string) => void }> = ({ onExit, onNavigate }) => {
  const [role, setRole] = useState<Role | null>(null);
  const { students, awards, attendance } = useClassroom();
  const child = students.find(s => s.id === DEMO_CLASS.parent.childId) || students[0];

  // ── Role picker (the entry) ────────────────────────────────────────────────
  if (!role) {
    return (
      <div className="min-h-full bg-[#0a0a0f] text-white">
        <div className="max-w-3xl mx-auto px-5 py-10">
          <button onClick={onExit} className="flex items-center gap-2 text-white/40 hover:text-white text-[11px] font-black uppercase tracking-widest mb-8"><ArrowLeft size={14} /> Back</button>
          <div className="flex items-center gap-2 text-small-orange mb-3"><Sparkles size={16} /><span className="text-[11px] font-black uppercase tracking-[0.3em]">Tour Plajah Academia</span></div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.05] mb-4">See how one classroom works — from every side.</h1>
          <p className="text-white/60 text-sm sm:text-base leading-relaxed max-w-2xl mb-3">No signup. Step into Ms. Rivera's 4th-grade class as a teacher, parent, or student. Award a point as the teacher, then switch to the parent and watch it appear on their child's week. It's the whole loop, connected.</p>
          <div className="flex flex-wrap items-center gap-2 mb-8">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-green-300 bg-green-500/10 border border-green-500/25 rounded-full px-3 py-1"><ShieldCheck size={12} /> Family-safe · COPPA &amp; FERPA-minded</span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-white/50 bg-white/5 border border-white/10 rounded-full px-3 py-1">No ads · No student data sold</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {(Object.keys(ROLE_META) as Role[]).map(r => {
              const m = ROLE_META[r]; const Icon = m.icon;
              return (
                <button key={r} onClick={() => setRole(r)}
                  className="text-left rounded-2xl bg-white/[0.04] border border-white/10 p-5 hover:bg-white/[0.07] hover:-translate-y-0.5 transition-all group">
                  <div className="w-11 h-11 rounded-xl grid place-items-center mb-3" style={{ background: m.wash, color: m.accent }}><Icon size={22} /></div>
                  <p className="text-lg font-black">{m.label}</p>
                  <p className="text-[12px] text-white/50 leading-snug mt-1">{m.blurb}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest mt-3 group-hover:gap-2 transition-all" style={{ color: m.accent }}>Enter as {m.label} <ChevronRight size={12} /></span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const m = ROLE_META[role];

  return (
    <div className="min-h-full bg-[#0a0a0f] text-white">
      {/* Tour bar — makes the "same class, different lens" connection obvious */}
      <div className="sticky top-0 z-20 bg-[#0a0a0f]/90 backdrop-blur border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 shrink-0">Touring as</span>
          <div className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar">
            {(Object.keys(ROLE_META) as Role[]).map(r => {
              const rm = ROLE_META[r]; const Icon = rm.icon; const on = r === role;
              return (
                <button key={r} onClick={() => setRole(r)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black shrink-0 transition-all ${on ? 'text-black' : 'text-white/50 bg-white/5 hover:bg-white/10'}`}
                  style={on ? { background: rm.accent } : undefined}>
                  <Icon size={13} /> {rm.label}
                </button>
              );
            })}
          </div>
          <button onClick={onExit} className="shrink-0 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8"><X size={16} /></button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {/* Class header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl grid place-items-center text-lg" style={{ background: m.wash }}>🍎</div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: m.accent }}>{DEMO_CLASS.name}</p>
            <p className="text-sm font-bold text-white/70">{DEMO_CLASS.teacherName} · {DEMO_CLASS.grade} <span className="text-white/30">· DEMO</span></p>
          </div>
        </div>

        {role === 'teacher' && <TeacherView students={students} awards={awards} attendance={attendance} onNavigate={onNavigate} />}
        {role === 'parent' && <ParentView childName={child?.name || 'Maya R.'} childPoints={child?.points ?? 0} childAttendance={attendance[child?.id || 's1']} awards={awards} childId={child?.id || 's1'} onNavigate={onNavigate} />}
        {role === 'student' && <StudentView name={child?.name || 'Maya R.'} points={child?.points ?? 0} onNavigate={onNavigate} />}
      </div>
    </div>
  );
};

// ── Teacher ────────────────────────────────────────────────────────────────
const POSITIVE = DEMO_CLASS.behaviors.filter(b => b.positive).slice(0, 6);
const TeacherView: React.FC<any> = ({ students, awards, attendance, onNavigate }) => {
  const [awardFor, setAwardFor] = useState<string | null>(null);
  const behaviorById = Object.fromEntries(DEMO_CLASS.behaviors.map((b: any) => [b.id, b]));
  return (
    <>
      <Card>
        <SectionTitle icon={Award}>Award points — tap a student</SectionTitle>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {students.map((s: any) => (
            <button key={s.id} onClick={() => setAwardFor(awardFor === s.id ? null : s.id)}
              className={`rounded-xl p-2 border text-center transition-all ${awardFor === s.id ? 'border-white/40 bg-white/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
              <div className="w-8 h-8 rounded-full mx-auto grid place-items-center text-[11px] font-black text-black" style={{ background: s.color }}>{s.name.split(' ')[0][0]}</div>
              <p className="text-[10px] font-bold text-white/70 truncate mt-1">{s.name.split(' ')[0]}</p>
              <p className="text-sm font-black" style={{ color: s.color }}>{s.points}</p>
            </button>
          ))}
        </div>
        {awardFor && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {POSITIVE.map((b: any) => (
              <button key={b.id} onClick={() => { classroomStore.award(awardFor, b.id); setAwardFor(null); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-[11px] font-bold transition-all">
                <span>{b.icon}</span> {b.label} <span className="text-green-400">+{b.points}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle icon={Clock}>Class story</SectionTitle>
        <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">
          {awards.slice(0, 8).map((a: any) => {
            const s = students.find((x: any) => x.id === a.studentId); const b = behaviorById[a.behaviorId];
            return (
              <div key={a.id} className="flex items-center gap-2 text-[12px]">
                <span>{b?.icon}</span>
                <span className="text-white/80 font-bold">{s?.name}</span>
                <span className="text-white/40">{b?.label}</span>
                <span className={`ml-auto font-black ${a.points > 0 ? 'text-green-400' : 'text-red-400'}`}>{a.points > 0 ? '+' : ''}{a.points}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle icon={BookOpen}>Today's lesson — built from Plajah's archives</SectionTitle>
        <p className="text-sm font-black text-white">{DEMO_LESSON.title}</p>
        <p className="text-[11px] text-white/45 mb-3">{DEMO_LESSON.standard}</p>
        <div className="space-y-2">
          {DEMO_LESSON.content.map((c, i) => {
            const Icon = (CONTENT_ICON as any)[c.kind] || BookOpen;
            return (
              <div key={i} className="flex items-start gap-3 rounded-xl bg-white/[0.03] border border-white/10 p-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/8 grid place-items-center shrink-0"><Icon size={15} className="text-small-orange" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-white/90 leading-tight">{c.title}</p>
                  <p className="text-[10px] text-white/40">{c.source}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-white/30 mt-2">Only Plajah can attach real music, film &amp; art history to a lesson like this.</p>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        <Card>
          <SectionTitle icon={CheckCircle2}>Assignment</SectionTitle>
          <p className="text-[12px] font-bold text-white/90">{DEMO_ASSIGNMENT.title}</p>
          <p className="text-[10px] text-white/40 mb-2">{DEMO_ASSIGNMENT.dueLabel}</p>
          <div className="flex gap-3 text-[11px]">
            <span className="text-green-400 font-bold">{Object.values(DEMO_ASSIGNMENT.submissions).filter(v => v === 'graded').length} graded</span>
            <span className="text-white/60 font-bold">{Object.values(DEMO_ASSIGNMENT.submissions).filter(v => v === 'submitted').length} to grade</span>
            <span className="text-red-400/80 font-bold">{Object.values(DEMO_ASSIGNMENT.submissions).filter(v => v === 'missing').length} missing</span>
          </div>
        </Card>
        <Card>
          <SectionTitle icon={MessageCircle}>Message a parent</SectionTitle>
          <p className="text-[12px] text-white/70 leading-snug">"{DEMO_MESSAGES[1].text}"</p>
          <p className="text-[10px] text-white/35 mt-1">— {DEMO_CLASS.parent.name} (Maya's guardian)</p>
        </Card>
      </div>
    </>
  );
};

// ── Parent ─────────────────────────────────────────────────────────────────
const ParentView: React.FC<any> = ({ childName, childPoints, childAttendance, awards, childId, onNavigate }) => {
  const behaviorById = Object.fromEntries(DEMO_CLASS.behaviors.map((b: any) => [b.id, b]));
  const childAwards = awards.filter((a: any) => a.studentId === childId);
  return (
    <>
      <Card>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full grid place-items-center text-lg font-black text-black" style={{ background: '#FF8C00' }}>{childName.split(' ')[0][0]}</div>
          <div className="flex-1">
            <p className="text-lg font-black">{childName}<span className="text-white/30 text-xs font-bold"> · your child</span></p>
            <p className="text-[11px] text-white/50 capitalize">Today: {childAttendance || 'present'}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-small-orange leading-none">{childPoints}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">points</p>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle icon={Award}>This week's highlights</SectionTitle>
        <div className="space-y-1.5">
          {childAwards.slice(0, 5).map((a: any) => {
            const b = behaviorById[a.behaviorId];
            return <div key={a.id} className="flex items-center gap-2 text-[12px]"><span>{b?.icon}</span><span className="text-white/80 font-bold">{b?.label}</span><span className="ml-auto text-green-400 font-black">+{a.points}</span></div>;
          })}
          {childAwards.length === 0 && <p className="text-[12px] text-white/40">Awards will appear here as they happen. (Try switching to Teacher and awarding {childName} a point!)</p>}
        </div>
      </Card>

      <Card>
        <SectionTitle icon={MessageCircle}>Messages with {DEMO_CLASS.teacherName}</SectionTitle>
        <div className="space-y-2">
          {DEMO_MESSAGES.map(msg => (
            <div key={msg.id} className={`flex ${msg.from === 'parent' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-[12px] ${msg.from === 'parent' ? 'bg-small-orange/20 text-white rounded-br-sm' : 'bg-white/8 text-white/80 rounded-bl-sm'}`}>{msg.text}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle icon={ShieldCheck}>{childName}'s learning record (portable)</SectionTitle>
        <div className="space-y-1.5">
          {DEMO_LEDGER.records.map(r => (
            <div key={r.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2">
              <div className="min-w-0 flex-1"><p className="text-[12px] font-bold text-white/90 truncate">{r.label}</p><p className="text-[10px] text-white/40">{r.subject} · {r.standard}</p></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-green-400 shrink-0">{r.level}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-white/30 mt-2">Owned by the student — it follows them from grade to grade, school to school.</p>
      </Card>
    </>
  );
};

// ── Student ────────────────────────────────────────────────────────────────
const StudentView: React.FC<any> = ({ name, points, onNavigate }) => (
  <>
    <Card>
      <div className="flex items-center justify-between">
        <div><p className="text-lg font-black">Hi, {name.split(' ')[0]}! 👋</p><p className="text-[11px] text-white/50">Here's your day.</p></div>
        <div className="text-right"><p className="text-3xl font-black text-small-orange leading-none">{points}</p><p className="text-[9px] font-black uppercase tracking-widest text-white/40">my points</p></div>
      </div>
    </Card>

    <Card>
      <SectionTitle icon={BookOpen}>Today's lesson</SectionTitle>
      <p className="text-sm font-black text-white mb-1">{DEMO_LESSON.title}</p>
      <div className="space-y-2">
        {DEMO_LESSON.content.map((c, i) => {
          const Icon = (CONTENT_ICON as any)[c.kind] || BookOpen;
          return (
            <div key={i} className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/10 p-2.5 hover:bg-white/[0.06] transition-colors cursor-pointer">
              <span className="text-lg">{c.icon}</span>
              <div className="min-w-0 flex-1"><p className="text-[12px] font-bold text-white/90 leading-tight truncate">{c.title}</p><p className="text-[10px] text-white/40">{c.note}</p></div>
              <ChevronRight size={14} className="text-white/30 shrink-0" />
            </div>
          );
        })}
      </div>
    </Card>

    <div className="grid sm:grid-cols-2 gap-3">
      <button onClick={() => onNavigate?.('READING_QUEST')} className="text-left rounded-2xl bg-white/[0.04] border border-white/10 p-5 hover:bg-white/[0.07] transition-all">
        <div className="w-10 h-10 rounded-xl bg-small-orange/15 grid place-items-center mb-2"><BookOpen size={20} className="text-small-orange" /></div>
        <p className="text-sm font-black">Reading Quest</p>
        <p className="text-[11px] text-white/50 leading-snug mt-0.5">Play a reading game — earn points that show up in class.</p>
      </button>
      <button onClick={() => onNavigate?.('READING_QUEST')} className="text-left rounded-2xl bg-white/[0.04] border border-white/10 p-5 hover:bg-white/[0.07] transition-all">
        <div className="w-10 h-10 rounded-xl grid place-items-center mb-2" style={{ background: 'rgba(54,197,240,0.15)' }}><Languages size={20} style={{ color: '#36c5f0' }} /></div>
        <p className="text-sm font-black">Language side-quest</p>
        <p className="text-[11px] text-white/50 leading-snug mt-0.5">Learn 5 words in Spanish or French — Duolingo-style, inside the lesson.</p>
      </button>
    </div>

    <Card>
      <SectionTitle icon={CheckCircle2}>My assignment</SectionTitle>
      <p className="text-[12px] font-bold text-white/90">{DEMO_ASSIGNMENT.title}</p>
      <p className="text-[10px] text-white/40 mb-2">{DEMO_ASSIGNMENT.dueLabel}</p>
      <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-green-400 bg-green-500/10 border border-green-500/25 rounded-full px-3 py-1"><CheckCircle2 size={12} /> Submitted &amp; graded ✓</span>
    </Card>
  </>
);

export default AcademiaTourView;
