// "Departments" row on an organization's Reello channel and org page: one card per department channel
// that has posted (a public video or a stream). Renders nothing until at least one department has.

import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import {
  fetchDeptChannelsForAccount, fetchOrgDeptChannels, openDeptChannel, type DeptChannelCard, type OrgSummary,
} from '../../services/reello/orgChannels';

type Props = { orgId: string; accountUid?: never; className?: string } | { accountUid: string; orgId?: never; className?: string };

const ReelloDeptChannelsRow: React.FC<Props> = (props) => {
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [channels, setChannels] = useState<DeptChannelCard[]>([]);
  const key = props.orgId || props.accountUid || '';
  useEffect(() => {
    let live = true;
    setChannels([]);
    if (!key) return;
    const p = props.orgId ? fetchOrgDeptChannels(props.orgId) : fetchDeptChannelsForAccount(props.accountUid!);
    p.then(r => { if (live) { setOrg(r.org); setChannels(r.channels || []); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!org || !channels.length) return null;
  return (
    <section className={props.className ?? 'mt-6'}>
      <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 mb-3"><Building2 size={15} className="text-small-orange" />Departments</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {channels.map(c => (
          <button key={c.departmentId} onClick={() => openDeptChannel(org.id, c.departmentId)} className="group shrink-0 w-56 text-left rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] transition-colors">
            <div className="relative aspect-video bg-white/5">
              {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full grid place-items-center text-4xl">{c.iconEmoji || '🎬'}</div>}
              {c.live && <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-red-600 text-[10px] font-black uppercase tracking-widest">Live</span>}
            </div>
            <div className="p-3">
              <p className="text-sm font-bold truncate">{c.iconEmoji ? `${c.iconEmoji} ` : ''}{c.name}</p>
              <p className="text-[11px] text-white/50 truncate">{org.name} · {c.videoCount}{c.moreVideos ? "+" : ""} video{c.videoCount === 1 ? "" : "s"}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

export default ReelloDeptChannelsRow;
