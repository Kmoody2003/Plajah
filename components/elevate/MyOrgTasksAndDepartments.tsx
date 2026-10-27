// components/elevate/MyOrgTasksAndDepartments.tsx
// Dedicated section on the Plajah Elevate User Landing Page (PlajahElevate.tsx) and Member Home (ChurchMemberHub.tsx)
// showing the user's Tasks in the Organization, the Departments & Sub-Groups they belong to, and their Christian Education / Tela coursework.

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Users,
  Calendar,
  Plus,
  Sparkles,
  GraduationCap,
  ArrowRight,
  Clock,
  ClipboardList,
  ExternalLink,
  Layers,
  Award,
} from 'lucide-react';
import type { Organization, OrgMembership } from '../../types';
import { fetchUserOrganizations, fetchOrgMembers } from '../../services/organizationService';
import { auth } from '../../services/backendService';
import { GREAT_FAITH_MINISTRIES_ORG, resolveGreatFaithMinistriesOrg } from '../../services/orgAssets';
import { extractOrgDepartmentsAndGroups } from './OrgAudienceToggle';
import { listIngestedUnits, loadOrgMasterySummary } from '../../services/curriculumIngestionService';
import { ensureDefaultTemplatedClassrooms, type ChurchProgram } from '../../services/churchEducationService';
import { LEVEL_NAME, LEVEL_COLOR, type SkillLevel } from '../../services/mastery';
import { UniversalStudentDesk } from '../desk/UniversalStudentDesk';

export interface OrgMemberTaskItem {
  id: string;
  orgId: string;
  title: string;
  departmentId: string;
  departmentName: string;
  dueLabel: string;
  roleLabel: string;
  done: boolean;
  telaDocId?: string;
  createdAt: number;
}

const TASKS_STORAGE_KEY = (orgId: string, uid: string) => `plajah_elevate_member_tasks_v1_${orgId}_${uid}`;

function getDefaultTasksForOrg(org: Organization): OrgMemberTaskItem[] {
  const depts = org.ministries || [];
  const musicDept = depts.find(d => /music|choir|worship/i.test(d.name)) || depts[0];
  const eduDept = depts.find(d => /education|sunday|youth|study/i.test(d.name)) || depts[1] || depts[0];
  const mediaDept = depts.find(d => /media|stage|broadcast|production/i.test(d.name)) || depts[2] || depts[0];

  return [
    {
      id: `task_seed_1_${org.id}`,
      orgId: org.id,
      title: 'Review Sunday service run-of-show cues & Scripture slides in Stage',
      departmentId: mediaDept?.id || 'dept-stage',
      departmentName: mediaDept?.name || 'Sanctuary Stage & Production',
      dueLabel: 'Sunday · 8:30 AM Call Time',
      roleLabel: 'Department Team',
      done: false,
      createdAt: Date.now() - 7200_000,
    },
    {
      id: `task_seed_2_${org.id}`,
      orgId: org.id,
      title: 'Prepare Christian Education weekly Verse syllabus & interactive Tela worksheet',
      departmentId: eduDept?.id || 'dept-edu',
      departmentName: eduDept?.name || 'Christian Education & Catechism',
      dueLabel: 'Sunday · 9:15 AM Session',
      roleLabel: 'Instructor / Catechist',
      done: false,
      createdAt: Date.now() - 3600_000,
    },
    {
      id: `task_seed_3_${org.id}`,
      orgId: org.id,
      title: 'Confirm SATB vocal stems & rehearsal setlist in Chora Studio',
      departmentId: musicDept?.id || 'dept-music',
      departmentName: musicDept?.name || 'Music & Worship Arts Department',
      dueLabel: 'Thursday · 6:30 PM Rehearsal',
      roleLabel: 'Choir & Worship',
      done: true,
      createdAt: Date.now() - 86400_000,
    },
  ];
}

function loadTasks(org: Organization, uid: string): OrgMemberTaskItem[] {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY(org.id, uid));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  const seeded = getDefaultTasksForOrg(org);
  try {
    localStorage.setItem(TASKS_STORAGE_KEY(org.id, uid), JSON.stringify(seeded));
  } catch {}
  return seeded;
}

function saveTasks(orgId: string, uid: string, tasks: OrgMemberTaskItem[]): void {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY(orgId, uid), JSON.stringify(tasks));
  } catch {}
}

interface MyOrgTasksAndDepartmentsProps {
  /** If provided, scopes directly to this organization (e.g. inside ChurchMemberHub). Otherwise loads user's orgs on the Landing Page. */
  org?: Organization;
  membership?: OrgMembership | null;
  onOpenOrg?: (orgId: string) => void;
  onOpenDepartment?: (departmentId: string) => void;
  onOpenEducation?: () => void;
  compact?: boolean;
}

export const MyOrgTasksAndDepartments: React.FC<MyOrgTasksAndDepartmentsProps> = ({
  org: propOrg,
  membership: propMembership,
  onOpenOrg,
  onOpenDepartment,
  onOpenEducation,
}) => {
  const uid = auth.currentUser?.uid || 'member_local';
  const [userOrgs, setUserOrgs] = useState<Organization[]>(propOrg ? [propOrg] : [GREAT_FAITH_MINISTRIES_ORG]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(propOrg?.id || GREAT_FAITH_MINISTRIES_ORG.id);
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [programs, setPrograms] = useState<ChurchProgram[]>([]);
  const [showStudentDeskDrawer, setShowStudentDeskDrawer] = useState(false);

  useEffect(() => {
    if (propOrg) {
      const normalized = propOrg.id === 'demo-grace-chapel' ? GREAT_FAITH_MINISTRIES_ORG : propOrg;
      setUserOrgs([normalized]);
      setSelectedOrgId(normalized.id);
      return;
    }
    resolveGreatFaithMinistriesOrg()
      .then(gfOrg => {
        if (!auth.currentUser?.uid) {
          setUserOrgs([gfOrg]);
          setSelectedOrgId(gfOrg.id);
          return;
        }
        return fetchUserOrganizations(auth.currentUser.uid).then(list => {
          const nonDemo = list.filter(o => o.id !== 'demo-grace-chapel');
          const merged = nonDemo.length > 0 ? nonDemo : [gfOrg];
          setUserOrgs(merged);
          setSelectedOrgId(merged[0].id);
        });
      })
      .catch(() => {
        setUserOrgs([GREAT_FAITH_MINISTRIES_ORG]);
        setSelectedOrgId(GREAT_FAITH_MINISTRIES_ORG.id);
      });
  }, [propOrg, auth.currentUser?.uid]);

  const activeOrg = useMemo(
    () => propOrg || userOrgs.find(o => o.id === selectedOrgId) || userOrgs[0] || GREAT_FAITH_MINISTRIES_ORG,
    [propOrg, userOrgs, selectedOrgId]
  );

  useEffect(() => {
    fetchOrgMembers(activeOrg.id).then(setMembers).catch(() => setMembers([]));
    ensureDefaultTemplatedClassrooms(activeOrg).then(setPrograms).catch(() => setPrograms([]));
  }, [activeOrg.id]);

  const myMembership = useMemo(() => {
    if (propMembership) return propMembership;
    return members.find(m => m.userId === uid) || null;
  }, [propMembership, members, uid]);

  const { departments, subGroups } = useMemo(
    () => extractOrgDepartmentsAndGroups(activeOrg),
    [activeOrg]
  );

  // Determine which departments the user is part of (or show primary departments if owner/demo)
  const myDepartments = useMemo(() => {
    const memberIds = new Set<string>(myMembership?.ministryIds || []);
    (myMembership?.ministryRoles || []).forEach(r => memberIds.add(r.ministryId));
    const filtered = departments.filter(d => memberIds.has(d.id));
    if (filtered.length > 0) return filtered;
    return departments.slice(0, 4);
  }, [departments, myMembership]);

  const [tasks, setTasks] = useState<OrgMemberTaskItem[]>(() => loadTasks(activeOrg, uid));
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDeptId, setNewTaskDeptId] = useState<string>('');
  const [newTaskDue, setNewTaskDue] = useState('This Sunday');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');

  useEffect(() => {
    setTasks(loadTasks(activeOrg, uid));
    setNewTaskDeptId(myDepartments[0]?.id || departments[0]?.id || '');
  }, [activeOrg.id, uid, myDepartments.length]);

  const toggleTask = (taskId: string) => {
    const next = tasks.map(t => (t.id === taskId ? { ...t, done: !t.done } : t));
    setTasks(next);
    saveTasks(activeOrg.id, uid, next);
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    const dept =
      departments.find(d => d.id === newTaskDeptId) ||
      myDepartments[0] ||
      { id: 'general', label: 'General Ministry' };
    const created: OrgMemberTaskItem = {
      id: `task_${Date.now().toString(36)}`,
      orgId: activeOrg.id,
      title: newTaskTitle.trim(),
      departmentId: dept.id,
      departmentName: dept.label,
      dueLabel: newTaskDue.trim() || 'Upcoming',
      roleLabel: myMembership?.title || myMembership?.role || 'Department Member',
      done: false,
      createdAt: Date.now(),
    };
    const next = [created, ...tasks];
    setTasks(next);
    saveTasks(activeOrg.id, uid, next);
    setNewTaskTitle('');
  };

  const visibleTasks = useMemo(
    () => (deptFilter === 'ALL' ? tasks : tasks.filter(t => t.departmentId === deptFilter)),
    [tasks, deptFilter]
  );

  const ingestedUnits = useMemo(() => listIngestedUnits(activeOrg.id), [activeOrg.id]);
  const masteryMap = useMemo(() => loadOrgMasterySummary(activeOrg.id), [activeOrg.id]);
  const masteryCount = Object.keys(masteryMap).length;
  const openTasksCount = tasks.filter(t => !t.done).length;

  return (
    <section
      aria-label="My Organization Tasks, Departments & Christian Education"
      className="rounded-3xl border border-white/12 bg-gradient-to-br from-[#160a28]/95 via-[#10071e]/95 to-[#0b0214]/95 p-4 sm:p-6 shadow-2xl space-y-5 text-white"
    >
      {/* Top Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-11 h-11 rounded-2xl grid place-items-center text-white shrink-0 shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)',
            }}
          >
            <ClipboardList size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#FF8C00]">
                My Organization Workspace · Tasks &amp; Departments
              </span>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-200 text-[10px] font-bold">
                {openTasksCount} Active {openTasksCount === 1 ? 'Task' : 'Tasks'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-[10px] font-bold">
                {myDepartments.length} {myDepartments.length === 1 ? 'Department' : 'Departments'}
              </span>
            </div>
            <h2
              className="text-lg sm:text-xl font-black tracking-tight text-white truncate mt-0.5"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              {activeOrg.name} — My Tasks, Departments &amp; Christian Education
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!propOrg && userOrgs.length > 1 && (
            <select
              aria-label="Select organization"
              value={selectedOrgId}
              onChange={e => setSelectedOrgId(e.target.value)}
              className="bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-white"
            >
              {userOrgs.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}

          {onOpenOrg && (
            <button
              type="button"
              onClick={() => onOpenOrg(activeOrg.id)}
              className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-black text-white inline-flex items-center gap-1.5"
            >
              Open {activeOrg.name} Hub <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 3-Column Bento Grid: 1) My Departments & Sub-Groups, 2) My Organization Tasks, 3) Christian Ed & Tela Coursework */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUMN 1: My Departments & Sub-Groups (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#D0BCFF] flex items-center gap-1.5">
              <Users size={13} /> My Departments &amp; Sub-Groups
            </span>
            <span className="text-[10px] font-mono text-white/45">
              {myDepartments.length} Assigned
            </span>
          </div>

          <div className="space-y-2">
            {myDepartments.map(dept => {
              const isFiltered = deptFilter === dept.id;
              const deptTaskCount = tasks.filter(t => t.departmentId === dept.id && !t.done).length;
              return (
                <div
                  key={dept.id}
                  className={`rounded-2xl border p-3 transition ${
                    isFiltered
                      ? 'border-purple-400/60 bg-purple-500/15'
                      : 'border-white/10 bg-black/35 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setDeptFilter(isFiltered ? 'ALL' : dept.id)}
                      className="text-left min-w-0 flex-1"
                    >
                      <p className="text-xs font-black text-white flex items-center gap-1.5">
                        <span>{dept.emoji || '🏛️'}</span>
                        <span className="truncate">{dept.label}</span>
                      </p>
                      {dept.sub && (
                        <p className="text-[11px] text-white/50 truncate mt-0.5">{dept.sub}</p>
                      )}
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {deptTaskCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 text-[10px] font-black">
                          {deptTaskCount} due
                        </span>
                      )}
                      {onOpenDepartment && (
                        <button
                          type="button"
                          onClick={() => onOpenDepartment(dept.id)}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white"
                        >
                          Enter
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sub-groups pill strip */}
          {subGroups.length > 0 && (
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/45 flex items-center gap-1">
                <Layers size={11} /> Active Sub-Groups &amp; Channels
              </p>
              <div className="flex flex-wrap gap-1.5">
                {subGroups.slice(0, 6).map(sg => (
                  <span
                    key={sg.id}
                    className="px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[10px] font-semibold text-white/75"
                  >
                    {sg.emoji || '•'} {sg.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* COLUMN 2: My Tasks & Responsibilities in the Organization (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
              <Calendar size={13} /> My Organization Tasks &amp; Shifts
            </span>
            {deptFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setDeptFilter('ALL')}
                className="text-[10px] font-bold text-amber-300 hover:underline"
              >
                Show All Departments ({tasks.length})
              </button>
            )}
          </div>

          {/* Quick-add task row */}
          <div className="flex flex-wrap sm:flex-nowrap gap-1.5">
            <input
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTask();
                }
              }}
              placeholder="Add a task for your department or class..."
              className="flex-1 bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
            />
            <select
              aria-label="Task department"
              value={newTaskDeptId}
              onChange={e => setNewTaskDeptId(e.target.value)}
              className="bg-black/60 border border-white/15 rounded-xl px-2.5 py-2 text-[11px] text-white max-w-[140px]"
            >
              {departments.map(d => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddTask}
              className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black inline-flex items-center gap-1 shrink-0"
            >
              <Plus size={13} /> Add
            </button>
          </div>

          {/* Task list */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {visibleTasks.map(task => (
              <div
                key={task.id}
                className={`rounded-2xl border p-3 flex items-start gap-2.5 transition ${
                  task.done
                    ? 'border-white/5 bg-black/20 opacity-60'
                    : 'border-white/10 bg-black/40 hover:border-white/20'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleTask(task.id)}
                  className="mt-0.5 text-amber-300 hover:scale-110 transition shrink-0"
                  aria-label={task.done ? 'Mark task incomplete' : 'Mark task complete'}
                >
                  {task.done ? (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  ) : (
                    <Circle size={16} className="text-white/40" />
                  )}
                </button>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className={`text-xs font-bold leading-snug ${task.done ? 'line-through text-white/50' : 'text-white'}`}>
                    {task.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 font-bold">
                      {task.departmentName}
                    </span>
                    <span className="inline-flex items-center gap-1 text-white/50">
                      <Clock size={10} /> {task.dueLabel}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* COLUMN 3: Christian Education, Teacher Dashboard & Interactive Tela Units (3 cols) */}
        <div className="lg:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
              <GraduationCap size={13} /> Christian Ed &amp; Tela
            </span>
            <span className="text-[10px] font-mono text-white/45">
              {programs.length} Classes
            </span>
          </div>

          <p className="text-[11px] text-white/65 leading-relaxed">
            Academia-powered instructor &amp; student dashboard, interactive Tela assignments, and course Mastery.
          </p>

          {/* Ingested Tela Units or Active Classrooms */}
          <div className="space-y-2">
            {ingestedUnits.slice(0, 2).map(u => (
              <div key={u.id} className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] font-black uppercase text-emerald-300">
                    {u.kind.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] font-mono text-white/50">{u.questions.length} Qs</span>
                </div>
                <p className="text-xs font-bold text-white truncate">{u.title}</p>
                <button
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: u.telaDocId } }))
                  }
                  className="w-full py-1.5 rounded-lg bg-emerald-400 text-black text-[10px] font-black inline-flex items-center justify-center gap-1"
                >
                  <ExternalLink size={11} /> Open Interactive Tela
                </button>
              </div>
            ))}

            {programs.slice(0, 2).map(prog => (
              <div key={prog.id} className="rounded-xl border border-white/10 bg-black/35 p-2.5 space-y-1">
                <p className="text-xs font-bold text-white truncate">{prog.name}</p>
                <p className="text-[10px] text-white/50">
                  {prog.weeks.length} Weeks · {prog.ageBand || 'All Ages'}
                </p>
              </div>
            ))}
          </div>

          {masteryCount > 0 && (
            <div className="rounded-xl border border-white/10 bg-black/35 p-2.5 flex items-center justify-between">
              <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                <Award size={13} className="text-amber-300" /> Mastery Skills Tracked
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400/20 text-amber-200">
                {masteryCount} Skills
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowStudentDeskDrawer(prev => !prev)}
            className="w-full py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black text-xs font-black inline-flex items-center justify-center gap-1.5 shadow"
          >
            <GraduationCap size={13} />
            {showStudentDeskDrawer ? 'Hide My Universal Student Desk' : '🪑 Open My Universal Student Desk'}
          </button>

          {onOpenEducation ? (
            <button
              type="button"
              onClick={onOpenEducation}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white text-xs font-black inline-flex items-center justify-center gap-1.5 shadow"
            >
              <Sparkles size={13} /> Open Christian Ed &amp; Teacher Studio
            </button>
          ) : (
            onOpenOrg && (
              <button
                type="button"
                onClick={() => onOpenOrg(activeOrg.id)}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white text-xs font-black inline-flex items-center justify-center gap-1.5 shadow"
              >
                <Sparkles size={13} /> Open Classroom &amp; Teacher Hub
              </button>
            )
          )}
        </div>
      </div>

      {/* Inline Universal Student Desk Drawer */}
      {showStudentDeskDrawer && (
        <div className="pt-4 border-t border-white/10">
          <UniversalStudentDesk
            studentUid={uid}
            studentName={auth.currentUser?.displayName || 'Class Member'}
            defaultDomain="ALL"
            orgId={activeOrg.id}
            orgName={activeOrg.name}
            onBack={() => setShowStudentDeskDrawer(false)}
            onOpenTelaStudio={(docId: string) => {
              window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId } }));
            }}
          />
        </div>
      )}
    </section>
  );
};

export default MyOrgTasksAndDepartments;
