// hooks/useCoedit.ts — drop-in live collaboration for any creative editor.
//
//   const co = useCoedit({ kind: 'tela', localId: doc.id, title: doc.title, doc, applyRemote: setDoc });
//
// Until the owner shares the project nothing changes (solo autosave + creative-cloud history keep
// working as before). Once shared, every member's edits stream live, offline edits queue and catch
// up, and `co.session` exposes history, drafts, undo and presence for <CollabDock/>.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { auth } from '../services/firebase';
import { CoeditSession, type SessionSnapshot } from '../services/coedit/session';
import { canEdit, coProjectId, ensureCoProject, subscribeCoProject, type CoProject, type CoRole } from '../services/coedit/project';
import type { PathLabeler } from '../services/coedit/labels';

export interface UseCoeditInput<T> {
  kind: string;
  localId: string | null | undefined;
  title: string;
  doc: T | null | undefined;
  /** Replace the editor's document with a merged one (someone else's edit, a restore, undo). */
  applyRemote: (doc: T) => void;
  labeler?: PathLabeler;
  /** Editors that mutate their document object in place. */
  mutableDocs?: boolean;
  orgId?: string;
  enabled?: boolean;
  /** The editor's live document, when `doc` is a throttled snapshot (read right before remote merges). */
  localSource?: () => T | null | undefined;
}

export interface UseCoedit<T> {
  projectId: string | null;
  project: CoProject | null;
  role: CoRole | null;
  isShared: boolean;
  session: CoeditSession<T> | null;
  snap: SessionSnapshot<T> | null;
  /** Turns the open document into a shared project (owner). */
  share: () => Promise<CoProject>;
  signedIn: boolean;
}

const noopSub = () => () => {};

export function useCoedit<T>(input: UseCoeditInput<T>): UseCoedit<T> {
  const { kind, localId, title, doc, enabled = true } = input;
  const projectId = localId ? coProjectId(kind, localId) : null;
  const [project, setProject] = useState<CoProject | null>(null);
  const [session, setSession] = useState<CoeditSession<T> | null>(null);
  const [uid, setUid] = useState(() => auth.currentUser?.uid ?? null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const applyRef = useRef(input.applyRemote);
  applyRef.current = input.applyRemote;
  const localSourceRef = useRef(input.localSource);
  localSourceRef.current = input.localSource;

  useEffect(() => auth.onAuthStateChanged((u) => setUid(u?.uid ?? null)), []);

  // Membership (null when not shared, or not a member).
  useEffect(() => {
    if (!projectId || !uid || !enabled) {
      setProject(null);
      return;
    }
    return subscribeCoProject(projectId, setProject);
  }, [projectId, uid, enabled]);

  const isMember = !!project && !!uid && project.members[uid] != null;

  // One session per shared project while it's open.
  useEffect(() => {
    if (!isMember || !project || !docRef.current) return;
    const s = new CoeditSession<T>({ project, initialDoc: docRef.current, labeler: input.labeler, mutableDocs: input.mutableDocs });
    s.setLocalSource(() => (localSourceRef.current ? localSourceRef.current() : docRef.current));
    const off = s.onRemote((d) => applyRef.current(d));
    let alive = true;
    void s.start().then((d) => {
      if (alive && d !== docRef.current) applyRef.current(d);
    });
    setSession(s);
    return () => {
      alive = false;
      off();
      s.dispose();
      setSession(null);
    };
    // re-key only on the project identity, not on every membership edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMember, project?.id]);

  useEffect(() => {
    if (session && project) session.updateProject(project);
  }, [session, project]);

  // Every edit in the editor flows to the session.
  useEffect(() => {
    if (session && doc) session.local(doc);
  }, [session, doc]);

  const snap = useSyncExternalStore(
    session ? (cb) => session.subscribe(cb) : noopSub,
    () => (session ? session.getSnapshot() : null),
    () => null
  );

  const share = useCallback(async () => {
    if (!localId) throw new Error('Save the project first.');
    const p = await ensureCoProject({ kind, localId, title, orgId: input.orgId });
    setProject(p);
    return p;
  }, [kind, localId, title, input.orgId]);

  return {
    projectId,
    project,
    role: project && uid ? project.members[uid] ?? null : null,
    isShared: isMember,
    session,
    snap,
    share,
    signedIn: !!uid,
  };
}

/** For editors that hand over edits imperatively (no React state for the doc). */
export function useCoeditCanEdit(project: CoProject | null): boolean {
  return canEdit(project, auth.currentUser?.uid);
}
