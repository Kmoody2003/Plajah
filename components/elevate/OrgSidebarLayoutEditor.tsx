// Manage › Settings › Sidebar layout — the org's default left sidebar while people are on its page.
// Members and visitors can still switch to their own layout or customize this one from the sidebar.

import React, { useMemo, useState } from 'react';
import { Check, Eye, EyeOff, Loader2, PanelLeft } from 'lucide-react';
import type { Organization } from '../../types';
import { updateOrganization } from '../../services/organizationService';
import { auth } from '../../services/backendService';
import { SIDEBAR_SECTIONS, SIDEBAR_PRESETS, groupSections, presetHidden, type OrgSidebarDefault } from '../../services/orgSidebarLayout';

interface Props {
  org: Organization;
  canEdit: boolean;
  onOrgChange?: (o: Organization) => void;
}

const OrgSidebarLayoutEditor: React.FC<Props> = ({ org, canEdit, onOrgChange }) => {
  const saved: OrgSidebarDefault = org.sidebarDefault || { enabled: false, hidden: [] };
  const [enabled, setEnabled] = useState(saved.enabled);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(saved.hidden || []));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const groups = useMemo(() => groupSections(), []);
  const dirty = enabled !== saved.enabled
    || hidden.size !== (saved.hidden || []).length
    || [...hidden].some(id => !(saved.hidden || []).includes(id));
  const onCount = SIDEBAR_SECTIONS.length - [...hidden].filter(id => SIDEBAR_SECTIONS.some(s => s.id === id)).length;

  const toggle = (id: string) => setHidden(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const setGroup = (ids: string[], on: boolean) => setHidden(prev => {
    const next = new Set(prev);
    ids.forEach(id => on ? next.delete(id) : next.add(id));
    return next;
  });

  const save = async () => {
    setBusy(true); setMsg(null);
    const sidebarDefault: OrgSidebarDefault = { enabled, hidden: [...hidden], updatedAt: Date.now(), updatedBy: auth.currentUser?.uid };
    try {
      await updateOrganization(org.id, { sidebarDefault });
      onOrgChange?.({ ...org, sidebarDefault });
      setMsg('Saved — people see this layout next time they open your page.');
    } catch (e: any) {
      setMsg(e?.message || 'Could not save the sidebar layout.');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-white/[0.06] flex items-center justify-center shrink-0"><PanelLeft size={18} className="text-[#FF8C00]" /></div>
        <div>
          <h2 className="text-lg font-black text-white">Sidebar layout</h2>
          <p className="text-sm text-white/60 mt-1">
            Choose which sections of Plajah show in the left sidebar while someone is on {org.name}&rsquo;s page.
            It&rsquo;s only the default — anyone can switch back to their own sidebar or adjust yours from the sidebar itself.
          </p>
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">Only the owner and org admins can change the sidebar layout.</div>
      )}

      <label className={`flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 ${canEdit ? 'cursor-pointer' : 'opacity-60'}`}>
        <div>
          <div className="text-sm font-bold text-white">Use an org default sidebar</div>
          <div className="text-xs text-white/50 mt-0.5">{enabled ? `${onCount} of ${SIDEBAR_SECTIONS.length} sections on` : 'Off — everyone keeps their own sidebar on your page'}</div>
        </div>
        <input type="checkbox" className="w-5 h-5 accent-[#FF8C00]" checked={enabled} disabled={!canEdit} onChange={e => setEnabled(e.target.checked)} />
      </label>

      {enabled && (
        <>
          <div className="flex flex-wrap gap-2">
            {SIDEBAR_PRESETS.map(p => (
              <button key={p.key} disabled={!canEdit} onClick={() => setHidden(new Set(presetHidden(p.visible)))} title={p.hint}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-white/[0.05] border border-white/10 text-white/80 hover:bg-white/10 disabled:opacity-50">
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {groups.map(g => {
              const ids = g.items.map(i => i.id);
              const allOn = ids.every(id => !hidden.has(id));
              return (
                <div key={g.group} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between px-1 pb-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{g.group}</span>
                    <button disabled={!canEdit} onClick={() => setGroup(ids, !allOn)} className="text-[10px] font-bold text-[#FF8C00] disabled:opacity-50">
                      {allOn ? 'Turn all off' : 'Turn all on'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {g.items.map(s => {
                      const on = !hidden.has(s.id);
                      return (
                        <button key={s.id} disabled={!canEdit} onClick={() => toggle(s.id)} aria-pressed={on}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm text-left transition-colors ${on ? 'bg-white/[0.06] text-white' : 'text-white/35 hover:text-white/60'}`}>
                          <span>{s.label}</span>
                          {on ? <Eye size={14} className="text-[#7FD8B0]" /> : <EyeOff size={14} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {canEdit && (
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={busy || !dirty}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-black disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save layout
          </button>
          {msg && <span className="text-xs text-white/60">{msg}</span>}
        </div>
      )}
    </div>
  );
};

export default OrgSidebarLayoutEditor;
