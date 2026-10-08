// MinistryManager — create / rename / reorder / nest / delete ministries + departments, set heads & audience.
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Search, X, Loader2, Save, CornerDownRight } from 'lucide-react';
import type { Organization, OrgMembership, Ministry, UserProfile } from '../../types';
import { saveMinistries, newMinistry, assignRole } from '../../services/elevateService';
import { elevateCan } from '../../services/elevateRoles';
import { fetchOrgMembers } from '../../services/organizationService';
import { searchUserProfiles } from '../../services/backendService';

export interface MinistryManagerProps {
  org: Organization;
  myMembership: OrgMembership | null;
  onChanged?: () => void;
  onClose?: () => void;
}

const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';
const chip = 'px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all';

const MinistryManager: React.FC<MinistryManagerProps> = ({ org, myMembership, onChanged, onClose }) => {
  const [items, setItems] = useState<Ministry[]>(() => [...(org.ministries || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  const [members, setMembers] = useState<OrgMembership[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'MINISTRY' | 'DEPARTMENT'>('MINISTRY');
  const [nameCache, setNameCache] = useState<Record<string, string>>({});

  const allowed = elevateCan(myMembership, org, 'MANAGE_MINISTRIES');

  useEffect(() => { fetchOrgMembers(org.id).then(setMembers).catch(() => {}); }, [org.id]);
  useEffect(() => {
    if (!q.trim() || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => { searchUserProfiles(q.trim()).then(r => setResults((r || []).slice(0, 6))).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const nameOf = (uid: string) => members.find(m => m.userId === uid)?.displayName || nameCache[uid] || uid.slice(0, 6);
  const patch = (id: string, p: Partial<Ministry>) => { setItems(xs => xs.map(m => m.id === id ? { ...m, ...p } : m)); setDirty(true); };

  // Flatten into a tree order: parents then their children.
  const ordered = useMemo(() => {
    const roots = items.filter(m => !m.parentId || !items.some(x => x.id === m.parentId));
    const out: { m: Ministry; depth: number }[] = [];
    const walk = (m: Ministry, depth: number) => { out.push({ m, depth }); items.filter(c => c.parentId === m.id).forEach(c => walk(c, depth + 1)); };
    roots.forEach(r => walk(r, 0));
    return out;
  }, [items]);

  if (!allowed) return <div className="p-6 text-sm text-white/50">Only pastors, owners and department heads can manage ministries.</div>;

  const add = (parentId?: string) => {
    const name = (parentId ? 'New sub-ministry' : newName.trim()) || 'New ministry';
    const m = newMinistry(name, parentId ? 'MINISTRY' : newKind, { parentId, order: items.length });
    setItems(xs => [...xs, m]); setNewName(''); setOpenId(m.id); setDirty(true);
  };

  const move = (id: string, dir: -1 | 1) => {
    const me = items.find(m => m.id === id)!;
    const sibs = items.filter(m => (m.parentId || '') === (me.parentId || '')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const i = sibs.findIndex(m => m.id === id), j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    const ids = sibs.map(m => m.id); [ids[i], ids[j]] = [ids[j], ids[i]];
    setItems(xs => xs.map(m => ids.includes(m.id) ? { ...m, order: ids.indexOf(m.id) } : m)); setDirty(true);
  };

  const remove = (id: string) => {
    const m = items.find(x => x.id === id); if (!m) return;
    if (!window.confirm(`Delete "${m.name}"? Sub-ministries move up a level.`)) return;
    setItems(xs => xs.filter(x => x.id !== id).map(x => x.parentId === id ? { ...x, parentId: m.parentId } : x)); setDirty(true);
  };

  const addHead = (id: string, u: UserProfile) => {
    const m = items.find(x => x.id === id)!;
    if (m.headUids?.includes(u.uid)) return;
    setNameCache(c => ({ ...c, [u.uid]: u.displayName }));
    patch(id, { headUids: [...(m.headUids || []), u.uid], leaderId: m.leaderId || u.uid, leaderName: m.leaderName || u.displayName });
    setQ(''); setResults([]);
  };
  const removeHead = (id: string, uid: string) => {
    const m = items.find(x => x.id === id)!;
    patch(id, { headUids: (m.headUids || []).filter(h => h !== uid) });
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const norm = items.map(m => ({ ...m, headUids: m.headUids || [] }));
      await saveMinistries(org.id, norm);
      // Grant the DEPARTMENT_HEAD ministry role to heads who are already on the roster.
      const missing: string[] = [];
      for (const m of norm) {
        for (const uid of m.headUids || []) {
          const mem = members.find(x => x.userId === uid && x.status === 'ACTIVE');
          if (!mem) { missing.push(nameOf(uid)); continue; }
          if (mem.ministryRoles?.some(r => r.ministryId === m.id && r.roleKey === 'DEPARTMENT_HEAD')) continue;
          try { await assignRole({ ...org, ministries: norm }, myMembership, mem, 'DEPARTMENT_HEAD', { ministryId: m.id, title: `${m.name} Head` }); }
          catch (e: any) { missing.push(`${nameOf(uid)} (${e?.message || 'not allowed'})`); }
        }
      }
      setDirty(false);
      setMsg(missing.length ? `Saved. Add to the roster / check permissions for: ${Array.from(new Set(missing)).join(', ')}` : 'Saved.');
      fetchOrgMembers(org.id).then(setMembers).catch(() => {});
      onChanged?.();
    } catch (e: any) { setMsg(e?.message || 'Could not save.'); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-black text-white">Ministries &amp; departments</h3>
          <p className="text-xs text-white/40">Name them anything. Ministries are member-facing; departments are operational.</p>
        </div>
        <div className="flex gap-2">
          {onClose && <button onClick={onClose} className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-white/60 hover:bg-white/10">Close</button>}
          <button onClick={save} disabled={!dirty || saving} className="px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-white text-black disabled:opacity-30 flex items-center gap-2">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
          </button>
        </div>
      </div>
      {msg && <div className="text-xs text-white/70 bg-white/5 border border-white/10 rounded-2xl px-4 py-2">{msg}</div>}

      <div className="flex gap-2 flex-wrap">
        <input className={field + ' flex-1 min-w-[180px]'} placeholder="Name (e.g. Youth, Media, Finance)" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        {(['MINISTRY', 'DEPARTMENT'] as const).map(k => (
          <button key={k} onClick={() => setNewKind(k)} className={`${chip} ${newKind === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{k === 'MINISTRY' ? 'Ministry' : 'Department'}</button>
        ))}
        <button onClick={() => add()} className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-small-orange text-black flex items-center gap-1.5"><Plus size={12} /> Add</button>
      </div>

      {ordered.length === 0 && <p className="text-sm text-white/35 py-6 text-center">No ministries yet.</p>}
      <div className="space-y-2">
        {ordered.map(({ m, depth }) => {
          const open = openId === m.id;
          return (
            <div key={m.id} style={{ marginLeft: depth * 20 }} className="bg-white/[0.03] border border-white/10 rounded-2xl">
              <div className="flex items-center gap-2 p-3">
                {depth > 0 && <CornerDownRight size={14} className="text-white/25 shrink-0" />}
                <input value={m.name} onChange={e => patch(m.id, { name: e.target.value })} className="flex-1 min-w-0 bg-transparent text-sm font-bold text-white outline-none" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30 hidden sm:block">{m.kind === 'DEPARTMENT' ? 'Dept' : 'Ministry'}</span>
                <button onClick={() => move(m.id, -1)} className="p-1.5 text-white/40 hover:text-white" aria-label="Move up"><ChevronUp size={14} /></button>
                <button onClick={() => move(m.id, 1)} className="p-1.5 text-white/40 hover:text-white" aria-label="Move down"><ChevronDown size={14} /></button>
                <button onClick={() => setOpenId(open ? null : m.id)} className={`${chip} ${open ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/60'}`}>{open ? 'Done' : 'Edit'}</button>
                <button onClick={() => remove(m.id)} className="p-1.5 text-red-400/70 hover:text-red-400" aria-label="Delete"><Trash2 size={14} /></button>
              </div>
              {open && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                  <div className="flex gap-2 flex-wrap">
                    {(['MINISTRY', 'DEPARTMENT'] as const).map(k => (
                      <button key={k} onClick={() => patch(m.id, { kind: k })} className={`${chip} ${(m.kind || 'MINISTRY') === k ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{k === 'MINISTRY' ? 'Ministry' : 'Department'}</button>
                    ))}
                    <button onClick={() => add(m.id)} className={`${chip} bg-white/5 border-white/10 text-white/60 flex items-center gap-1`}><Plus size={10} /> Sub-ministry</button>
                  </div>
                  <input className={field} placeholder="Description" value={m.description || ''} onChange={e => patch(m.id, { description: e.target.value })} />
                  <input className={field} placeholder="Meeting time (e.g. Wednesdays 7:00 PM)" value={m.meetingTime || ''} onChange={e => patch(m.id, { meetingTime: e.target.value })} />
                  <select className={field} value={m.parentId || ''} onChange={e => patch(m.id, { parentId: e.target.value || undefined })}>
                    <option value="">Top level</option>
                    {items.filter(x => x.id !== m.id && x.parentId !== m.id).map(x => <option key={x.id} value={x.id}>Under: {x.name}</option>)}
                  </select>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Heads / leaders</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(m.headUids || []).map(uid => (
                        <span key={uid} className="flex items-center gap-1 pl-3 pr-1.5 py-1 bg-white/10 rounded-full text-xs text-white">
                          {nameOf(uid)}<button onClick={() => removeHead(m.id, uid)} className="p-0.5 text-white/50 hover:text-white"><X size={12} /></button>
                        </span>
                      ))}
                      {!(m.headUids || []).length && <span className="text-xs text-white/30">No heads yet.</span>}
                    </div>
                    <div className="relative">
                      <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                      <input className={field + ' pl-10'} placeholder="Search people to add as head…" value={q} onChange={e => setQ(e.target.value)} />
                    </div>
                    {results.length > 0 && (
                      <div className="mt-1 bg-black/60 border border-white/10 rounded-2xl overflow-hidden">
                        {results.map(u => (
                          <button key={u.uid} onClick={() => addHead(m.id, u)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10">
                            <span className="w-7 h-7 rounded-full overflow-hidden bg-white/10 shrink-0">{u.photoURL && <img src={u.photoURL} alt="" className="w-full h-full object-cover" />}</span>
                            <span className="text-sm text-white">{u.displayName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Who can read this thread</p>
                    <div className="flex gap-2 flex-wrap">
                      {([['DEPARTMENT', 'Department only'], ['ORG', 'Whole organization'], ['PUBLIC', 'Public']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => patch(m.id, { threadAudience: v })} className={`${chip} ${(m.threadAudience || 'ORG') === v ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50'}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={!!m.allowFollowers} onChange={e => patch(m.id, { allowFollowers: e.target.checked })} /> Allow people to follow this ministry</label>
                  <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={!!m.isInternal} onChange={e => patch(m.id, { isInternal: e.target.checked })} /> Internal only (hide from the public page)</label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MinistryManager;
