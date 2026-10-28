import React, { useEffect, useMemo, useState } from 'react';
import type { ChmsPerson, OrgMembership } from '../../../types';
import type { ChurchProgram, ClassRosterStudent } from '../../../services/churchEducationService';
import { fetchOrgMembers } from '../../../services/organizationService';
import { fetchPeople } from '../../../services/chmsPeople';
import { clearJoinRequest, type EduJoinRequest } from '../../../services/christianEdSync';
import { initials } from './edStyles';

interface Candidate {
  key: string;
  uid?: string;
  personId?: string;
  name: string;
  avatar?: string;
  sub: string;
  guardianName?: string;
  guardianUid?: string;
}

const personName = (p: ChmsPerson) => `${p.preferredName || p.firstName} ${p.lastName}`.trim();

function ageOf(birth?: string): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  return Math.floor((Date.now() - b.getTime()) / (365.25 * 86400_000));
}

/** Class roster: who's in the class, adding from the church's people, and approving join-code requests. */
const EdPeople: React.FC<{
  orgId: string;
  program: ChurchProgram;
  joinRequests: EduJoinRequest[];
  onSave: (p: ChurchProgram) => Promise<void>;
  onChanged: () => void;
}> = ({ orgId, program, joinRequests, onSave, onChanged }) => {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Record<string, Candidate>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const students = program.students || [];
  const team = program.assignedTeam || [];

  useEffect(() => {
    if (!adding || candidates) return;
    let alive = true;
    (async () => {
      const [members, people] = await Promise.all([
        fetchOrgMembers(orgId).catch(() => [] as OrgMembership[]),
        fetchPeople(orgId).catch(() => [] as ChmsPerson[]),
      ]);
      const out = new Map<string, Candidate>();
      const byHousehold = new Map<string, ChmsPerson[]>();
      for (const p of people) if (p.householdId) byHousehold.set(p.householdId, [...(byHousehold.get(p.householdId) || []), p]);
      for (const p of people) {
        const guardian =
          p.householdRole === 'CHILD' && p.householdId
            ? (byHousehold.get(p.householdId) || []).find(x => x.householdRole === 'HEAD' || x.householdRole === 'SPOUSE')
            : undefined;
        const age = ageOf(p.birthDate);
        const key = p.linkedUid ? `u:${p.linkedUid}` : `p:${p.id}`;
        out.set(key, {
          key,
          uid: p.linkedUid,
          personId: p.id,
          name: personName(p),
          sub: [age !== null ? `Age ${age}` : null, guardian ? `Guardian: ${personName(guardian)}` : null, p.linkedUid ? null : 'No Plajah account']
            .filter(Boolean)
            .join(' · '),
          guardianName: guardian ? personName(guardian) : undefined,
          guardianUid: guardian?.linkedUid,
        });
      }
      for (const m of members) {
        if (m.status !== 'ACTIVE') continue;
        const key = `u:${m.userId}`;
        if (out.has(key)) continue;
        out.set(key, { key, uid: m.userId, name: m.displayName, avatar: m.photoUrl, sub: m.title || 'Member' });
      }
      if (alive) setCandidates(Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name)));
    })();
    return () => {
      alive = false;
    };
  }, [adding, candidates, orgId]);

  const inClass = useMemo(() => {
    const s = new Set<string>();
    for (const x of students) {
      if (x.uid) s.add(`u:${x.uid}`);
      if (x.personId) s.add(`p:${x.personId}`);
    }
    return s;
  }, [students]);

  const shown = (candidates || [])
    .filter(c => !inClass.has(c.key) && !(c.personId && inClass.has(`p:${c.personId}`)))
    .filter(c => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 60);

  const toRoster = (c: Pick<Candidate, 'uid' | 'personId' | 'name' | 'avatar' | 'guardianName' | 'guardianUid'>): ClassRosterStudent => ({
    id: c.uid ? `u_${c.uid}` : `p_${c.personId}`,
    uid: c.uid,
    personId: c.personId,
    name: c.name,
    avatar: c.avatar,
    guardianName: c.guardianName,
    guardianUid: c.guardianUid,
    addedAt: Date.now(),
  });

  const save = async (next: ClassRosterStudent[]) => {
    setBusy(true);
    setErr('');
    try {
      await onSave({ ...program, students: next });
      onChanged();
    } catch {
      setErr('Could not save the class list. Check your connection and try again.');
    }
    setBusy(false);
  };

  const addPicked = async () => {
    await save([...students, ...Object.values(picked).map(toRoster)]);
    setPicked({});
    setAdding(false);
  };

  const approve = async (r: EduJoinRequest) => {
    if (!students.some(s => s.uid === r.uid)) await save([...students, toRoster({ uid: r.uid, name: r.name })]);
    await clearJoinRequest(r.id);
    onChanged();
  };

  return (
    <div className="stack">
      {err && <div className="err">{err}</div>}

      {joinRequests.length > 0 && (
        <div className="panel">
          <div className="ph">
            <h3>Asked to join · {joinRequests.length}</h3>
          </div>
          <div className="pb people">
            {joinRequests.map(r => (
              <div className="row" key={r.id}>
                <span className="av">{initials(r.name)}</span>
                <div className="grow" style={{ fontWeight: 600, fontSize: '.86rem' }}>
                  {r.name}
                </div>
                <button type="button" className="btn sm p" disabled={busy} onClick={() => approve(r)}>
                  Add
                </button>
                <button type="button" className="btn sm" onClick={async () => { await clearJoinRequest(r.id); onChanged(); }}>
                  Decline
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="ph">
          <h3>
            {students.length} student{students.length === 1 ? '' : 's'} · {team.length || 1} teacher{(team.length || 1) === 1 ? '' : 's'}
          </h3>
          <button type="button" className="btn sm p" onClick={() => setAdding(a => !a)}>
            {adding ? 'Close' : '+ Add students'}
          </button>
        </div>

        {adding && (
          <div className="pb" style={{ borderBottom: '1px solid var(--bd)' }}>
            <input id="ed-people-search" className="field" placeholder="Search your church’s people" value={q} onChange={e => setQ(e.target.value)} />
            {!candidates && <div className="small">Loading people…</div>}
            {candidates && shown.length === 0 && <div className="small">No one else to add. New families are added in People.</div>}
            <div className="people" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {shown.map(c => (
                <label className="row" key={c.key} style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!picked[c.key]}
                    onChange={e =>
                      setPicked(prev => {
                        const n = { ...prev };
                        if (e.target.checked) n[c.key] = c;
                        else delete n[c.key];
                        return n;
                      })
                    }
                  />
                  <span className="av">{c.avatar ? <img src={c.avatar} alt="" /> : initials(c.name)}</span>
                  <div className="grow">
                    <div style={{ fontWeight: 600, fontSize: '.86rem' }}>{c.name}</div>
                    <div className="small">{c.sub}</div>
                  </div>
                </label>
              ))}
            </div>
            <button type="button" className="btn p" style={{ justifySelf: 'start' }} disabled={busy || Object.keys(picked).length === 0} onClick={addPicked}>
              Add {Object.keys(picked).length || ''} to {program.name}
            </button>
          </div>
        )}

        <div className="pb people">
          {(team.length ? team : [{ name: program.leadInstructor || 'Lead teacher', roleKey: 'INSTRUCTOR' as const }]).map((t, i) => (
            <div className="row" key={`t${i}`}>
              <span className="av" style={{ background: 'var(--warm)' }}>{initials(t.name)}</span>
              <div className="grow" style={{ fontWeight: 600, fontSize: '.86rem' }}>{t.name}</div>
              <span className="tag soon">{t.roleKey === 'INSTRUCTOR' ? 'Teacher' : t.roleKey === 'DEPARTMENT_HEAD' ? 'Dept head' : t.roleKey === 'DEPARTMENT_ADMIN' ? 'Dept admin' : 'Helper'}</span>
            </div>
          ))}
          {students.length === 0 && <div className="small">No students yet. Add them above, or share the class code.</div>}
          {students.map(s => (
            <div className="row" key={s.id}>
              <span className="av" style={{ background: '#00A9C0' }}>{s.avatar ? <img src={s.avatar} alt="" /> : initials(s.name)}</span>
              <div className="grow">
                <div style={{ fontWeight: 600, fontSize: '.86rem' }}>{s.name}</div>
                <div className="small">
                  {[s.guardianName ? `Guardian: ${s.guardianName}` : null, s.uid ? null : 'Paper work only (no account)'].filter(Boolean).join(' · ') || 'Student'}
                </div>
              </div>
              <button type="button" className="btn sm" disabled={busy} onClick={() => save(students.filter(x => x.id !== s.id))} aria-label={`Remove ${s.name}`}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EdPeople;
