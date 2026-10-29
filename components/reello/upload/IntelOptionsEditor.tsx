// Story Intelligence options for one upload or one template: what to draft, where listings go,
// and whether drafts wait for approval or post automatically (with the auto-created notice).

import React, { useEffect, useState } from 'react';
import { Sparkles, FileText, Quote, ShoppingBag, AlertTriangle } from 'lucide-react';
import type { IntelOptions } from '../../../services/reello/intel/types';
import { autoNotice } from '../../../services/reello/intel/core';
import { auth } from '../../../services/firebase';
import type { Organization } from '../../../types';

let orgCache: Promise<Organization[]> | null = null;
/** Organisations whose store this account may stock (creator, linked account or admin). */
export function useStockableOrgs(): Organization[] {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    orgCache = orgCache || import('../../../services/organizationService').then(m => m.fetchUserOrganizations(uid))
      .then(list => list.filter(o => o.creatorId === uid || (o as any).accountUid === uid || (o.admins || []).includes(uid)))
      .catch(() => []);
    let live = true;
    orgCache.then(o => { if (live) setOrgs(o); });
    return () => { live = false; };
  }, []);
  return orgs;
}

const Check: React.FC<{ on: boolean; onChange: (v: boolean) => void; icon: React.ReactNode; label: string; hint: string }> = ({ on, onChange, icon, label, hint }) => (
  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${on ? 'border-[#00B4D8]/50 bg-[#00B4D8]/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
    <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} className="mt-1 accent-[#00B4D8]" />
    <span className="text-white/80 mt-0.5">{icon}</span>
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-white">{label}</span>
      <span className="block text-xs text-white/50">{hint}</span>
    </span>
  </label>
);

export const IntelOptionsEditor: React.FC<{
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  value: IntelOptions;
  onChange: (v: IntelOptions) => void;
  accountName: string;
  videoTitle?: string;
}> = ({ enabled, onEnabled, value, onChange, accountName, videoTitle }) => {
  const orgs = useStockableOrgs();
  const group = React.useId();
  const set = (p: Partial<IntelOptions>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/10">
        <span className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles size={16} className="text-[#00B4D8]" /> Story Intelligence</span>
        <button type="button" role="switch" aria-checked={enabled} onClick={() => onEnabled(!enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-[#00B4D8]' : 'bg-white/20'}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </label>
      {enabled && (
        <>
          <p className="text-xs text-white/50 leading-relaxed">Watches and listens to the video — speech and on-screen graphics — to find chapters, stills, the lines worth quoting, and anything being offered (products, prices, multi-item packages, links).</p>
          <div className="grid gap-2">
            <Check on={value.article} onChange={v => set({ article: v })} icon={<FileText size={16} />} label="Blog post" hint="An overview that teases the video and sends readers to watch it." />
            <Check on={value.clips} onChange={v => set({ clips: v })} icon={<Quote size={16} />} label="Quote clips" hint="The poignant moments, clipped as short Reello videos." />
            <Check on={value.merch} onChange={v => set({ merch: v })} icon={<ShoppingBag size={16} />} label="Store listings" hint="Products offered in the video, with prices, packages and links." />
          </div>
          {value.merch && (
            <label className="block">
              <span className="text-xs font-semibold text-white/60">List products in</span>
              <select value={value.merchTarget.kind === 'ORG' ? value.merchTarget.orgId : ''}
                onChange={e => {
                  const o = orgs.find(x => x.id === e.target.value);
                  set({ merchTarget: o ? { kind: 'ORG', orgId: o.id, orgName: o.name } : { kind: 'USER' } });
                }}
                className="mt-1 w-full bg-[#181820] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">My store</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name} store</option>)}
                {value.merchTarget.kind === 'ORG' && !orgs.some(o => o.id === value.merchTarget.orgId) && <option value={value.merchTarget.orgId}>{value.merchTarget.orgName || 'Organization'} store</option>}
              </select>
            </label>
          )}
          <fieldset className="grid sm:grid-cols-2 gap-2">
            {(['APPROVE', 'AUTO'] as const).map(m => (
              <label key={m} className={`p-3 rounded-xl border cursor-pointer ${value.publishMode === m ? 'border-[#00B4D8]/50 bg-[#00B4D8]/10' : 'border-white/10 bg-white/[0.03]'}`}>
                <input type="radio" name={`intel-mode-${group}`} className="sr-only" checked={value.publishMode === m} onChange={() => set({ publishMode: m })} />
                <span className="block text-sm font-semibold text-white">{m === 'APPROVE' ? 'I approve each draft' : 'Post automatically'}</span>
                <span className="block text-xs text-white/50">{m === 'APPROVE' ? 'Drafts wait in Drafts until you post them.' : 'Goes live as soon as it’s ready.'}</span>
              </label>
            ))}
          </fieldset>
          {value.publishMode === 'AUTO' && (
            <div className="flex gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-400/30 text-xs text-amber-100">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-300" />
              <div>
                <p>Everything posted automatically carries this note:</p>
                <p className="mt-1 italic text-amber-50">“{autoNotice(accountName, videoTitle || 'your video')}”</p>
                <p className="mt-1 text-amber-100/70">Listings with no price, or that might not be for sale, wait for you instead.</p>
              </div>
            </div>
          )}
          {value.clips && (
            <label className="flex items-center justify-between text-xs text-white/60">
              <span>Quote clips are</span>
              <select value={value.clipVisibility} onChange={e => set({ clipVisibility: e.target.value as IntelOptions['clipVisibility'] })} className="bg-[#181820] border border-white/10 rounded-lg px-2 py-1 text-white">
                <option value="PUBLIC">Public</option><option value="PRIVATE">Private</option>
              </select>
            </label>
          )}
        </>
      )}
    </div>
  );
};

export default IntelOptionsEditor;
