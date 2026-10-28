// components/collab/CollabPeople.tsx — who's here now, who's on the project, and inviting people.

import React, { useEffect, useMemo, useState } from 'react';
import { Crown, Loader2, LogOut, Search, UserPlus, X } from 'lucide-react';
import { auth } from '../../services/firebase';
import { searchUserProfilesSafe } from '../../services/searchUsersSafe';
import { addMembers, personColor, removeMember, ROLE_LABEL, setRole, type CoProject, type CoRole } from '../../services/coedit/project';
import type { Presence } from '../../services/coedit/session';
import type { UserProfile } from '../../types';
import { ago, btn, btnPrimary, card, initials, input, lbl } from './collabUi';

export const PersonDot: React.FC<{ uid: string; name: string; photo?: string | null; size?: number; ring?: boolean }> = ({ uid, name, photo, size = 26, ring }) => (
  <span
    className="relative inline-flex items-center justify-center rounded-full font-extrabold text-black shrink-0 overflow-hidden"
    style={{ width: size, height: size, background: personColor(uid), fontSize: size * 0.38, boxShadow: ring ? `0 0 0 2px #0e0d14, 0 0 0 3.5px ${personColor(uid)}` : undefined }}
    title={name}
  >
    {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : initials(name)}
  </span>
);

export const CollabPeople: React.FC<{
  project: CoProject | null;
  presence: Presence[];
  me: Presence | null;
  onShare: () => Promise<unknown>;
  signedIn: boolean;
  inCall: Set<string>;
}> = ({ project, presence, me, onShare, signedIn, inCall }) => {
  const uid = auth.currentUser?.uid;
  const isOwner = !!project && project.ownerId === uid;
  const [sharing, setSharing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const online = useMemo(() => {
    const seen = new Map<string, Presence>();
    for (const p of presence) if (!seen.has(p.uid) || seen.get(p.uid)!.at < p.at) seen.set(p.uid, p);
    return [...seen.values()];
  }, [presence]);

  if (!project) {
    return (
      <div className="p-4 flex flex-col gap-3">
        <div className={`${card} p-4 flex flex-col gap-2`}>
          <div className="text-[.82rem] font-extrabold text-white">Work on this together</div>
          <p className="text-[.7rem] leading-relaxed text-white/55">
            Invite people to edit with you live. Everyone sees changes as they happen, can keep a private draft, and every version is kept — nothing anyone does can't be brought back.
          </p>
          {err && <div className="text-[.66rem] text-red-300">{err}</div>}
          <button
            className={`${btnPrimary} self-start mt-1`}
            disabled={!signedIn || sharing}
            onClick={async () => {
              setSharing(true);
              setErr(null);
              try {
                await onShare();
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Could not share this project.');
              } finally {
                setSharing(false);
              }
            }}
          >
            {sharing ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} {signedIn ? 'Share & invite' : 'Sign in to share'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
      <section className="flex flex-col gap-1.5">
        <div className={lbl}>Here now</div>
        {me && (
          <Row uid={me.uid} name={`${me.name} (you)`} photo={me.photo} sub={me.mode === 'draft' ? 'Working in a private draft' : me.focus || 'Editing live'} badge={inCall.has(me.uid) ? 'In call' : undefined} />
        )}
        {online.length === 0 && <div className="text-[.68rem] text-white/40 px-1">Nobody else is in right now.</div>}
        {online.map((p) => (
          <Row
            key={p.key}
            uid={p.uid}
            name={p.name}
            photo={p.photo}
            sub={p.mode === 'draft' ? 'Working in a private draft' : p.focus ? `On ${p.focus}` : `Active ${ago(p.at)}`}
            badge={inCall.has(p.uid) ? 'In call' : p.mode === 'draft' ? 'Draft' : undefined}
          />
        ))}
      </section>

      <section className="flex flex-col gap-1.5">
        <div className={lbl}>On this project · {project.memberIds.length}</div>
        {project.memberIds.map((m) => (
          <MemberRow key={m} project={project} uid={m} canManage={isOwner} />
        ))}
        {!isOwner && uid && (
          <button
            className={`${btn} self-start mt-1`}
            onClick={() => {
              if (confirm('Leave this project? Your private draft and saved copies stay with you until you clear them.')) void removeMember(project, uid);
            }}
          >
            <LogOut size={11} /> Leave project
          </button>
        )}
      </section>

      {isOwner && <Invite project={project} />}
    </div>
  );
};

const Row: React.FC<{ uid: string; name: string; photo?: string | null; sub: string; badge?: string }> = ({ uid, name, photo, sub, badge }) => (
  <div className="flex items-center gap-2 px-1.5 py-1 rounded-[8px] hover:bg-white/[0.03]">
    <PersonDot uid={uid} name={name} photo={photo} ring />
    <div className="min-w-0 flex-1">
      <div className="text-[.72rem] font-bold text-white truncate">{name}</div>
      <div className="text-[.62rem] text-white/45 truncate">{sub}</div>
    </div>
    {badge && <span className="text-[.56rem] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-white/70">{badge}</span>}
  </div>
);

const MemberRow: React.FC<{ project: CoProject; uid: string; canManage: boolean }> = ({ project, uid, canManage }) => {
  const role = project.members[uid];
  const name = project.names?.[uid] || 'Collaborator';
  return (
    <div className="flex items-center gap-2 px-1.5 py-1">
      <PersonDot uid={uid} name={name} photo={project.photos?.[uid]} size={22} />
      <div className="text-[.7rem] text-white/85 truncate flex-1">{name}</div>
      {role === 'owner' ? (
        <span className="text-[.6rem] text-amber-300/90 font-bold flex items-center gap-1">
          <Crown size={10} /> Owner
        </span>
      ) : canManage ? (
        <>
          <select
            className="h-6 rounded-[6px] bg-black/30 border border-white/10 text-[.62rem] text-white/80 px-1"
            value={role}
            onChange={(e) => void setRole(project, uid, e.target.value as Exclude<CoRole, 'owner'>)}
          >
            {(['editor', 'commenter', 'viewer'] as const).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button className="text-white/35 hover:text-red-300" title="Remove" onClick={() => confirm(`Remove ${name} from this project?`) && void removeMember(project, uid)}>
            <X size={12} />
          </button>
        </>
      ) : (
        <span className="text-[.6rem] text-white/45">{ROLE_LABEL[role]}</span>
      )}
    </div>
  );
};

const Invite: React.FC<{ project: CoProject }> = ({ project }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [picked, setPicked] = useState<UserProfile[]>([]);
  const [role, setRoleSel] = useState<Exclude<CoRole, 'owner'>>('editor');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void searchUserProfilesSafe(term, 8).then((r) => setResults(r.filter((u) => !project.memberIds.includes(u.uid))));
    }, 220);
    return () => clearTimeout(t);
  }, [q, project.memberIds]);

  return (
    <section className={`${card} p-2.5 flex flex-col gap-2`}>
      <div className={lbl}>Invite people</div>
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
        <input className={`${input} pl-7`} placeholder="Search by name or @handle" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {results.length > 0 && (
        <div className="flex flex-col max-h-40 overflow-y-auto custom-scrollbar">
          {results.map((u) => (
            <button
              key={u.uid}
              className="flex items-center gap-2 px-1.5 py-1 rounded-[7px] hover:bg-white/[0.06] text-left"
              onClick={() => {
                setPicked((p) => (p.some((x) => x.uid === u.uid) ? p : [...p, u]));
                setQ('');
              }}
            >
              <PersonDot uid={u.uid} name={u.displayName} photo={u.photoURL} size={22} />
              <span className="text-[.7rem] text-white/85 truncate">{u.displayName}</span>
            </button>
          ))}
        </div>
      )}
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {picked.map((u) => (
            <span key={u.uid} className="flex items-center gap-1 pl-1 pr-1.5 h-6 rounded-full bg-white/10 text-[.64rem] text-white">
              <PersonDot uid={u.uid} name={u.displayName} photo={u.photoURL} size={16} /> {u.displayName}
              <button onClick={() => setPicked((p) => p.filter((x) => x.uid !== u.uid))} className="text-white/50 hover:text-white">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <select className="h-7 rounded-[8px] bg-black/30 border border-white/10 text-[.66rem] text-white/85 px-1.5" value={role} onChange={(e) => setRoleSel(e.target.value as Exclude<CoRole, 'owner'>)}>
          {(['editor', 'commenter', 'viewer'] as const).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button
          className={`${btnPrimary} ml-auto`}
          disabled={!picked.length || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await addMembers(
                project,
                picked.map((u) => ({ uid: u.uid, name: u.displayName, photo: u.photoURL })),
                role
              );
              setPicked([]);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Invite
        </button>
      </div>
      <p className="text-[.6rem] text-white/35 leading-relaxed">Everyone you invite also joins the project's team chat.</p>
    </section>
  );
};
