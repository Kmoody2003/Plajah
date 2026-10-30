// The Lesson Library, opened from anywhere (services/lessonLibraryNav.openLessonLibrary): Content HQ, the
// Tela home page, every "Add a lesson" button. One library for all education workflows, scoped to whoever
// is looking:
//   • an org the viewer teaches in or runs — the org's lessons. Admin-provisioned ones are locked for
//     teachers, who copy them to make their own versions;
//   • My lessons — what the viewer made, uploaded or copied (a teacher with no org lives here);
//   • Platform — lessons teachers shared with everyone, to read and copy.
// Mounted once in App.

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Globe2, Loader2, User, X } from 'lucide-react';
import { auth } from '../../services/firebase';
import type { Organization, OrgMembership } from '../../types';
import { fetchOrganization, fetchUserMemberships } from '../../services/organizationService';
import { canViewerAccessAnswerKey } from '../../services/orgEducationScopeService';
import { listPrograms, saveProgram, type ChurchProgram } from '../../services/churchEducationService';
import { getStandaloneTeacherScopeId } from '../../services/orgAssets';
import { isLibraryAdmin } from '../../services/lessonLibraryStore';
import { OPEN_LESSON_LIBRARY, type LessonLibraryRequest } from '../../services/lessonLibraryNav';
import OrgLessonLibraryHub from '../church/OrgLessonLibraryHub';

interface OrgScope { org: Organization; membership: OrgMembership | null; teacher: boolean; admin: boolean }
type Scope = { kind: 'org'; id: string } | { kind: 'mine' } | { kind: 'platform' };

const OVERLAY_CSS = `
.llo{position:fixed;inset:0;z-index:200;background:#0d0b14;display:flex;flex-direction:column;color:#fff}
.llo-h{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 18px;padding-top:max(12px,env(safe-area-inset-top));border-bottom:1px solid rgba(255,255,255,.1);background:#120f1c}
.llo-h .llo-t{font:900 1rem/1 var(--fd,system-ui);display:flex;gap:8px;align-items:center;margin-right:6px}
.llo-scopes{display:flex;gap:6px;overflow-x:auto;flex:1;min-width:0;scrollbar-width:none}
.llo-scopes button{appearance:none;flex-shrink:0;height:34px;padding:0 13px;border-radius:99px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:rgba(255,255,255,.7);font:700 .78rem/1 system-ui;display:inline-flex;gap:6px;align-items:center;cursor:pointer}
.llo-scopes button[aria-pressed="true"]{background:#fff;color:#14101c;border-color:#fff}
.llo-x{appearance:none;width:38px;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;display:grid;place-items:center;cursor:pointer}
.llo-b{flex:1;overflow-y:auto;padding:18px;padding-bottom:calc(24px + env(safe-area-inset-bottom))}
.llo-b>.inner{max-width:1240px;margin:0 auto}
.llo-note{max-width:520px;margin:60px auto;text-align:center;color:rgba(255,255,255,.6);display:grid;gap:10px;justify-items:center}
@media(max-width:720px){.llo-h{padding:10px 12px}.llo-b{padding:14px 12px}.llo-h .llo-t span{display:none}}
`;

export default function LessonLibraryOverlay() {
  const [req, setReq] = useState<LessonLibraryRequest | null>(null);
  const [orgs, setOrgs] = useState<OrgScope[] | null>(null);
  const [scope, setScope] = useState<Scope>({ kind: 'mine' });
  const [programs, setPrograms] = useState<ChurchProgram[]>([]);
  // Every class in the orgs the viewer teaches in, for assigning from My lessons and the Platform library.
  const [allPrograms, setAllPrograms] = useState<Array<{ program: ChurchProgram; orgName: string }>>([]);
  const user = auth.currentUser;

  useEffect(() => {
    const open = (e: Event) => setReq(((e as CustomEvent).detail || {}) as LessonLibraryRequest);
    // Editing a lesson or starting one in Tela leaves the library.
    const leave = () => setReq(null);
    window.addEventListener(OPEN_LESSON_LIBRARY, open);
    window.addEventListener('plajah:openTela', leave);
    return () => { window.removeEventListener(OPEN_LESSON_LIBRARY, open); window.removeEventListener('plajah:openTela', leave); };
  }, []);

  // The orgs whose library this viewer may use: ones they teach in or run, plus the one asked for.
  useEffect(() => {
    if (!req) return;
    let cancelled = false;
    setOrgs(null);
    (async () => {
      const uid = auth.currentUser?.uid;
      const mems = uid ? (await fetchUserMemberships(uid).catch(() => [])).filter(m => m.status === 'ACTIVE') : [];
      const ids = Array.from(new Set([...mems.map(m => m.orgId), ...(req.orgId ? [req.orgId] : [])].filter(Boolean)));
      const found = await Promise.all(ids.map(id => fetchOrganization(id).catch(() => null)));
      const u = auth.currentUser;
      const list: OrgScope[] = [];
      for (const org of found) {
        if (!org) continue;
        const membership = mems.find(m => m.orgId === org.id) || null;
        const admin = isLibraryAdmin(org as any, uid);
        const teacher = admin || ((org as any).eduTeacherUids || []).includes(uid) ||
          canViewerAccessAnswerKey({ membership, org, user: u ? { uid: u.uid, displayName: u.displayName || '', email: u.email || '' } : null });
        if (teacher || org.id === req.orgId) list.push({ org, membership, teacher, admin });
      }
      if (cancelled) return;
      setOrgs(list);
      const asked = req.orgId && list.find(o => o.org.id === req.orgId);
      const firstTeaching = list.find(o => o.teacher);
      setScope(req.mine || !uid ? { kind: 'mine' } : asked ? { kind: 'org', id: asked.org.id } : firstTeaching ? { kind: 'org', id: firstTeaching.org.id } : { kind: 'mine' });
    })();
    return () => { cancelled = true; };
  }, [req]);

  const current = scope.kind === 'org' ? orgs?.find(o => o.org.id === scope.id) || null : null;

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    const teaching = (orgs || []).filter(o => o.teacher);
    if (!uid || !teaching.length) { setAllPrograms([]); return; }
    let cancelled = false;
    Promise.all(teaching.map(o => listPrograms(o.org.id).then(ps => ps
      .filter(p => o.admin || (p.teacherUids || []).includes(uid) || p.createdBy === uid)
      .map(program => ({ program, orgName: o.org.name }))).catch(() => [])))
      .then(lists => { if (!cancelled) setAllPrograms(lists.flat()); });
    return () => { cancelled = true; };
  }, [orgs]);

  useEffect(() => {
    setPrograms([]);
    if (!current) return;
    let cancelled = false;
    listPrograms(current.org.id).then(p => { if (!cancelled) setPrograms(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [current?.org.id]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.lib-panel,.lib-sheet')) setReq(null); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [req]);

  const mineId = useMemo(() => getStandaloneTeacherScopeId(user?.uid), [user?.uid]);
  if (!req) return null;
  const close = () => setReq(null);
  const viewer = { uid: user?.uid || '', name: user?.displayName || 'Teacher' };
  const mineInto = { orgId: mineId, orgName: 'My lessons', label: 'My lessons' };

  let body: React.ReactNode;
  if (!orgs) {
    body = <div className="llo-note"><Loader2 className="animate-spin" size={22} /> Opening the library…</div>;
  } else if (scope.kind === 'org' && current) {
    body = (
      <OrgLessonLibraryHub
        key={`org:${current.org.id}`}
        orgId={current.org.id}
        orgName={current.org.name}
        tier="org"
        viewerIsAdmin={current.admin}
        programId={req.programId}
        programs={programs}
        initialAssign={req.assignUnitIds}
        canAccessAnswerKey={current.teacher}
        canUploadToLibrary={current.teacher}
        currentUserUid={viewer.uid}
        currentUserName={viewer.name}
        copyInto={{ orgId: current.org.id, orgName: current.org.name, label: current.org.name }}
        onSaveProgram={async p => { await saveProgram(p); setPrograms(prev => prev.map(x => (x.id === p.id ? p : x))); }}
      />
    );
  } else if (scope.kind === 'platform') {
    body = (
      <OrgLessonLibraryHub
        key="platform"
        orgId="platform-library"
        orgName="Plajah"
        tier="platform"
        canAccessAnswerKey={false}
        canUploadToLibrary={false}
        currentUserUid={viewer.uid}
        currentUserName={viewer.name}
        copyInto={user ? (current ? { orgId: current.org.id, orgName: current.org.name, label: current.org.name } : mineInto) : undefined}
        otherPrograms={allPrograms}
      />
    );
  } else if (!user) {
    body = <div className="llo-note"><BookOpen size={26} /><div>Sign in to keep your own lessons and open your organization’s library.</div></div>;
  } else {
    body = (
      <OrgLessonLibraryHub
        key="mine"
        orgId={mineId}
        orgName="My lessons"
        scopeKind="user"
        tier="user"
        viewerIsAdmin
        canAccessAnswerKey
        canUploadToLibrary
        currentUserUid={viewer.uid}
        currentUserName={viewer.name}
        copyInto={mineInto}
        otherPrograms={allPrograms}
        initialAssign={req.assignUnitIds}
      />
    );
  }

  return (
    <div className="llo" role="dialog" aria-modal="true" aria-label="Lesson Library">
      <style>{OVERLAY_CSS}</style>
      <div className="llo-h">
        <div className="llo-t"><BookOpen size={18} /> <span>Lesson Library</span></div>
        <div className="llo-scopes" role="group" aria-label="Whose lessons">
          {(orgs || []).map(o => (
            <button key={o.org.id} type="button" aria-pressed={scope.kind === 'org' && scope.id === o.org.id} onClick={() => setScope({ kind: 'org', id: o.org.id })}>
              {o.org.name}
            </button>
          ))}
          <button type="button" aria-pressed={scope.kind === 'mine'} onClick={() => setScope({ kind: 'mine' })}><User size={13} /> My lessons</button>
          <button type="button" aria-pressed={scope.kind === 'platform'} onClick={() => setScope({ kind: 'platform' })}><Globe2 size={13} /> Platform library</button>
        </div>
        <button type="button" className="llo-x" onClick={close} aria-label="Close the Lesson Library"><X size={18} /></button>
      </div>
      <div className="llo-b"><div className="inner">{body}</div></div>
    </div>
  );
}
