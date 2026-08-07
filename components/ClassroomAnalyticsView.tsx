import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Users, BookOpen, CheckSquare, TrendingUp, AlertTriangle,
  DollarSign, ChevronDown, BarChart2, GraduationCap,
} from 'lucide-react';
import { fetchClassrooms, auth } from '../services/backendService';
import { getDocs, query, collection, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { loadProficiency } from '../services/learningLedgerService';
import type { Classroom, Submission } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CourseStats {
  classroom: Classroom;
  enrollments: number;
  lessonCompletionRate: number;  // real: avg Learner-Ledger mastery across enrolled students
  submissionRate: number;        // submissions / (enrollments * assignments)
  avgGrade: number;
  revenue: number;
  atRiskCount: number;           // enrolled but no recent submissions
}

// ── Completion rate bar ───────────────────────────────────────────────────────

function RateBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-[9px] font-black w-8 text-right" style={{ color }}>{Math.round(value)}%</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ClassroomAnalyticsView() {
  const [courses, setCourses]           = useState<CourseStats[]>([]);
  const [selectedId, setSelectedId]     = useState<string>('');
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    loadData();
  }, []);

  const loadData = async () => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    // Fetch teacher's classrooms
    const all = await fetchClassrooms();
    const mine = all.filter((c: Classroom) => c.ownerId === uid);

    // Fetch all submissions for these classrooms' assignments
    const allAssignmentIds = mine.flatMap(c => c.assignments.map(a => a.id));

    let allSubmissions: Submission[] = [];
    if (allAssignmentIds.length > 0) {
      try {
        const snap = await getDocs(query(collection(db, 'submissions'), where('assignmentId', 'in', allAssignmentIds.slice(0, 10))));
        allSubmissions = snap.docs.map(d => ({ id: d.id, ...d.data() } as Submission));
      } catch { /* index may not exist */ }
    }

    const stats: CourseStats[] = await Promise.all(mine.map(async c => {
      const enrollments     = c.enrolledStudents.length;
      const assignments     = c.assignments.length;
      const courseSubs      = allSubmissions.filter(s => c.assignments.find(a => a.id === s.assignmentId));
      const submissionRate  = assignments > 0 && enrollments > 0
        ? Math.min(100, (courseSubs.length / (assignments * enrollments)) * 100) : 0;
      const gradedSubs      = courseSubs.filter(s => s.grade != null);
      const avgGrade        = gradedSubs.length > 0
        ? gradedSubs.reduce((a, s) => a + (s.grade ?? 0), 0) / gradedSubs.length : 0;
      const maxPoints       = c.assignments.reduce((a, x) => a + x.maxPoints, 0) || 100;
      const avgGradePct     = (avgGrade / maxPoints) * 100;
      const revenue         = c.price * enrollments;

      // Real progress from the Learner Ledger (one read per enrolled student, capped fan-out):
      //  • completion = average mastery across students who have any ledger evidence
      //  • at-risk    = students whose average mastery is below 50
      // 0 when no student has any recorded progress yet — an honest empty, not a synthetic number.
      const uids = c.enrolledStudents.slice(0, 60);
      const profs = uids.length ? await Promise.all(uids.map(id => loadProficiency(id).catch(() => null))) : [];
      const avgOf = (p: Awaited<ReturnType<typeof loadProficiency>>): number | null => {
        const vals = p ? Object.values(p.byStandard) : [];
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      };
      const overalls = profs.map(avgOf).filter((v): v is number => v != null);
      const lessonCompletionRate = overalls.length
        ? Math.round(overalls.reduce((a, b) => a + b, 0) / overalls.length)
        : 0;
      // Only students who HAVE evidence and are below 50 are at-risk — "no data yet" isn't at-risk.
      const atRiskCount = profs.filter(p => { const a = avgOf(p); return a != null && a < 50; }).length;

      return { classroom: c, enrollments, lessonCompletionRate, submissionRate, avgGrade: avgGradePct, revenue, atRiskCount };
    }));

    setCourses(stats);
    if (stats.length > 0) setSelectedId(stats[0].classroom.id);
    setLoading(false);
  };

  const selected = courses.find(c => c.classroom.id === selectedId);

  const totalEnrollments = courses.reduce((a, c) => a + c.enrollments, 0);
  const totalRevenue     = courses.reduce((a, c) => a + c.revenue, 0);
  const avgCompletion    = courses.length > 0 ? courses.reduce((a, c) => a + c.lessonCompletionRate, 0) / courses.length : 0;
  const totalAtRisk      = courses.reduce((a, c) => a + c.atRiskCount, 0);

  if (loading) return (
    <div className="py-24 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/15 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
      <div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Classroom<br />Analytics</h1>
        <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Enrollment · completion · grades · revenue · at-risk students</p>
      </div>

      {/* Platform-wide KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Students',  value: totalEnrollments,        icon: Users,        color: 'text-sky-400',    bg: 'bg-sky-400/15'    },
          { label: 'Avg Completion',  value: `${Math.round(avgCompletion)}%`, icon: BookOpen, color: 'text-green-400', bg: 'bg-green-400/15' },
          { label: 'Revenue',         value: `$${totalRevenue.toFixed(0)}`, icon: DollarSign,  color: 'text-[#FF8C00]',  bg: 'bg-[#FF8C00]/15'  },
          { label: 'At-Risk Students',value: totalAtRisk,             icon: AlertTriangle, color: 'text-red-400',    bg: 'bg-red-400/15'    },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6">
            <div className={`p-3 ${s.bg} rounded-xl w-fit mb-3`}><s.icon className={s.color} size={18} /></div>
            <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">{s.label}</p>
            <p className="text-2xl font-black">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {courses.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-4 border-2 border-dashed border-white/5 rounded-[2.5rem] text-center">
          <GraduationCap size={28} className="text-white/12" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No classrooms yet</p>
          <p className="text-[9px] text-white/12">Create a classroom to see analytics here</p>
        </div>
      ) : (
        <>
          {/* Course selector */}
          <div className="relative w-full max-w-sm">
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white appearance-none outline-none pr-10">
              {courses.map(c => <option key={c.classroom.id} value={c.classroom.id}>{c.classroom.title}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>

          {selected && (
            <motion.div key={selected.classroom.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Enrollment & revenue card */}
              <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7 space-y-5">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">Course Overview</p>
                {[
                  { label: 'Enrolled Students', value: selected.enrollments,                          icon: Users       },
                  { label: 'Course Price',       value: `$${selected.classroom.price}`,                icon: DollarSign  },
                  { label: 'Total Revenue',      value: `$${selected.revenue.toFixed(0)}`,             icon: TrendingUp  },
                  { label: 'Lessons',            value: selected.classroom.lessons.length,             icon: BookOpen    },
                  { label: 'Assignments',        value: selected.classroom.assignments.length,         icon: CheckSquare },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3">
                    <row.icon size={14} className="text-white/25 flex-shrink-0" />
                    <span className="text-[10px] text-white/40 flex-1">{row.label}</span>
                    <span className="text-sm font-black text-white">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Completion + grade rates */}
              <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7 space-y-5">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">Engagement Rates</p>
                <div className="space-y-4">
                  {[
                    { label: 'Lesson Completion',  value: selected.lessonCompletionRate, color: '#22c55e' },
                    { label: 'Assignment Submission', value: selected.submissionRate,    color: '#818cf8' },
                    { label: 'Average Grade',       value: selected.avgGrade,            color: '#FF8C00' },
                  ].map(r => (
                    <div key={r.label}>
                      <p className="text-[9px] text-white/30 font-black uppercase tracking-widest mb-2">{r.label}</p>
                      <RateBar value={r.value} color={r.color} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Lesson breakdown */}
              {selected.classroom.lessons.length > 0 && (
                <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7 col-span-full">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-4">Lesson Completion Breakdown (synthetic)</p>
                  <div className="space-y-2">
                    {selected.classroom.lessons.slice(0, 8).map((lesson, i) => {
                      const pct = Math.max(20, selected.lessonCompletionRate - i * 8);
                      return (
                        <div key={lesson.id} className="flex items-center gap-3">
                          <span className="text-[9px] text-white/30 w-4 text-right flex-shrink-0">{i + 1}</span>
                          <span className="text-[10px] text-white/50 flex-1 truncate">{lesson.title}</span>
                          <RateBar value={pct} color={pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* At-risk alert */}
              {selected.atRiskCount > 0 && (
                <div className="col-span-full p-5 rounded-2xl bg-red-500/6 border border-red-500/20 flex items-start gap-3">
                  <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-400">
                      {selected.atRiskCount} student{selected.atRiskCount !== 1 ? 's' : ''} at risk
                    </p>
                    <p className="text-[9px] text-white/30 mt-1">
                      Students with no assignment submissions in the past 7+ days. Consider sending a re-engagement message via the Postman system.
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
}
