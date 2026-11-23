// Shown at the top of the left sidebar while an org page with a default layout is open.
// Lets each person keep the org's layout, go back to their own, or customize the org's one.
// The choice is remembered per org (services/orgSidebarLayout).

import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, PanelLeft, SlidersHorizontal, X } from 'lucide-react';
import { SIDEBAR_SECTIONS, groupSections, type OrgSidebarChoice, type OrgSidebarDefault } from '../services/orgSidebarLayout';

interface Props {
  orgName: string;
  layout: OrgSidebarDefault;
  choice: OrgSidebarChoice;
  onChoice: (c: OrgSidebarChoice) => void;
  collapsed?: boolean;
}

const OrgSidebarLayoutBanner: React.FC<Props> = ({ orgName, layout, choice, onChoice, collapsed }) => {
  const [editing, setEditing] = useState(false);
  const groups = useMemo(() => groupSections(), []);

  if (collapsed) {
    return (
      <div className="flex justify-center mb-2" title={choice.mode === 'mine' ? `Your sidebar (on ${orgName})` : `${orgName}'s sidebar layout`}>
        <PanelLeft size={16} className={choice.mode === 'mine' ? 'text-white/30' : 'text-small-orange'} />
      </div>
    );
  }

  const currentHidden = new Set(choice.mode === 'custom' ? choice.hidden : layout.hidden || []);
  const toggle = (id: string) => {
    const next = new Set(currentHidden);
    next.has(id) ? next.delete(id) : next.add(id);
    onChoice({ mode: 'custom', hidden: [...next] });
  };

  const seg = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} aria-pressed={active}
      className={`flex-1 px-2 py-1 rounded-lg text-[8.5px] font-black uppercase tracking-widest transition-colors ${active ? 'bg-white text-black' : 'text-white/45 hover:text-white'}`}>
      {label}
    </button>
  );

  return (
    <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5">
      <div className="flex items-center gap-2 px-1 pb-2">
        <PanelLeft size={12} className="text-small-orange shrink-0" />
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/60 truncate flex-1" title={orgName}>{orgName} layout</span>
        {choice.mode !== 'mine' && (
          <button onClick={() => setEditing(e => !e)} title={editing ? 'Done' : 'Customize for me'} className="text-white/40 hover:text-white p-0.5">
            {editing ? <X size={12} /> : <SlidersHorizontal size={12} />}
          </button>
        )}
      </div>
      <div className="flex gap-1 rounded-xl bg-black/30 p-0.5">
        {seg('Org', choice.mode === 'org', () => { onChoice({ mode: 'org' }); setEditing(false); })}
        {seg('Custom', choice.mode === 'custom', () => { onChoice({ mode: 'custom', hidden: [...currentHidden] }); setEditing(true); })}
        {seg('Mine', choice.mode === 'mine', () => { onChoice({ mode: 'mine' }); setEditing(false); })}
      </div>

      {editing && choice.mode !== 'mine' && (
        <div className="mt-2 max-h-72 overflow-y-auto custom-scrollbar pr-1 space-y-2">
          {groups.map(g => (
            <div key={g.group}>
              <div className="px-1 pb-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/30">{g.group}</div>
              {g.items.map(s => {
                const on = !currentHidden.has(s.id);
                return (
                  <button key={s.id} onClick={() => toggle(s.id)} aria-pressed={on}
                    className={`w-full flex items-center justify-between px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${on ? 'text-white/85 hover:bg-white/5' : 'text-white/25 hover:text-white/50'}`}>
                    <span className="truncate">{s.label}</span>
                    {on ? <Eye size={11} /> : <EyeOff size={11} />}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="px-1 pt-1 text-[9px] text-white/35">
            {SIDEBAR_SECTIONS.length - currentHidden.size} of {SIDEBAR_SECTIONS.length} on · only for you, on this org&rsquo;s page
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgSidebarLayoutBanner;
