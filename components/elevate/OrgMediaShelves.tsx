import React, { useState } from 'react';
import { Film, Disc3, Link2, Loader2, X } from 'lucide-react';
import type { Album, Organization, Video } from '../../types';
import MediaThumb from '../ui/MediaThumb';
import { orgMediaUids, setOrgContentUids, invalidateOrgMediaCache, useOrgMedia, type OrgRelease } from '../../services/orgMedia';

/**
 * "Recent videos" + "Releases" shelves on an org's public page — platform content published by the
 * org's media account(s). Public render is empty-and-silent when there is nothing; staff with
 * MANAGE_CONTENT get a hint, and the owner gets the "Link a channel" controls.
 */
interface Props {
  org: Organization;
  isOwner: boolean;
  canManage: boolean;
  onOrgChange?: (org: Organization) => void;
  onVisitUser?: (uid: string) => void;
  /** Open a video / film in the platform player (App's handleSelectItem). */
  onOpenVideo?: (video: Video) => void;
  /** Open an album / single / EP / mix / book (App's handleSelectItem). */
  onOpenAlbum?: (album: Album) => void;
}

const age = (ts: number): string => {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  if (s < 86400 * 365) return `${Math.floor(s / (86400 * 30))}mo ago`;
  return `${Math.floor(s / (86400 * 365))}y ago`;
};
const dur = (sec?: number): string => {
  if (!sec || sec <= 0) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const vidThumb = (v: Video): string | undefined =>
  v.thumbnailUrl || v.coverImageUrl || (v.muxPlaybackId ? `https://image.mux.com/${v.muxPlaybackId}/thumbnail.jpg?time=2` : undefined);
const tsOf = (n: any): number => (typeof n === 'number' ? n : n?.toMillis?.() || (n?.seconds ? n.seconds * 1000 : 0));

const SkeletonRow: React.FC = () => (
  <div className="flex gap-3 overflow-hidden">
    {[0, 1, 2, 3].map(i => <div key={i} className="w-52 shrink-0"><div className="aspect-video rounded-2xl bg-white/[0.06] animate-pulse" /><div className="h-3 w-3/4 rounded bg-white/[0.06] animate-pulse mt-2" /></div>)}
  </div>
);

const Header: React.FC<{ icon: React.ReactNode; title: string; onSeeAll?: () => void }> = ({ icon, title, onSeeAll }) => (
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">{icon} {title}</h2>
    {onSeeAll && <button onClick={onSeeAll} className="text-[9px] font-black uppercase tracking-widest text-small-orange/70 hover:text-small-orange focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded">See all →</button>}
  </div>
);

const OrgMediaShelves: React.FC<Props> = ({ org, isOwner, canManage, onOrgChange, onVisitUser, onOpenVideo, onOpenAlbum }) => {
  const { videos, releases, loading } = useOrgMedia(org);
  const [busy, setBusy] = useState(false);
  const uids = orgMediaUids(org);
  const primary = org.accountUid || org.contentUids?.[0];
  const seeAll = onVisitUser && primary ? () => onVisitUser(primary) : undefined;

  const empty = !loading && videos.length === 0 && releases.length === 0;
  if (empty && !canManage && !isOwner) return null;

  const link = async (next: string[]) => {
    setBusy(true);
    try {
      const saved = await setOrgContentUids(org, next);
      invalidateOrgMediaCache();
      onOrgChange?.({ ...org, contentUids: saved });
    } catch (e: any) { alert(e?.message || 'Could not update the linked channel.'); }
    setBusy(false);
  };

  const linkControls = isOwner && (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {org.creatorId && !uids.includes(org.creatorId) && (
        <button disabled={busy} onClick={() => link([...(org.contentUids || []), org.creatorId])}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} className="text-small-orange" />} Use my personal channel
        </button>
      )}
      {(org.contentUids || []).map(u => (
        <span key={u} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50">
          Linked channel{u === org.creatorId ? ' (you)' : ''}
          <button disabled={busy} aria-label="Unlink channel" onClick={() => link((org.contentUids || []).filter(x => x !== u))} className="p-1 rounded-full hover:bg-white/10"><X size={10} /></button>
        </span>
      ))}
    </div>
  );

  if (empty) {
    return (
      <section className="mt-8 p-4 rounded-2xl bg-white/[0.03] border border-white/8">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2"><Film size={12} className="text-small-orange" /> Videos &amp; releases</p>
        <p className="text-sm text-white/50 mt-2">Publish videos &amp; releases from your channel — they'll appear here automatically.</p>
        {isOwner && uids.length === 0 && <p className="text-[11px] text-white/35 mt-1">No channel is linked to this page yet.</p>}
        {linkControls}
      </section>
    );
  }

  const openRelease = (r: OrgRelease) => {
    if (r.kind === 'ALBUM') onOpenAlbum?.(r.raw as Album);
    else onOpenVideo?.(r.raw as Video);
  };

  return (
    <>
      {(loading || videos.length > 0) && (
        <section className="mt-8">
          <Header icon={<Film size={12} className="text-small-orange" />} title="Recent videos" onSeeAll={seeAll} />
          {loading ? <SkeletonRow /> : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
              {videos.map(v => (
                <button key={v.id} onClick={() => onOpenVideo?.(v)} className="w-52 shrink-0 text-left snap-start group focus:outline-none">
                  <div className="relative aspect-video rounded-2xl overflow-hidden bg-[#111] border border-white/10 group-focus-visible:ring-2 group-focus-visible:ring-white">
                    <MediaThumb src={vidThumb(v)} alt="" className="group-hover:scale-105 transition-transform" fallback={<div className="absolute inset-0 grid place-items-center"><Film size={22} className="text-white/20" /></div>} />
                    {!!dur(v.duration) && <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-black text-white">{dur(v.duration)}</span>}
                  </div>
                  <p className="text-xs font-bold text-white mt-2 line-clamp-2 leading-snug">{v.title}</p>
                  <p className="text-[10px] text-white/35 mt-0.5">{age(tsOf(v.timestamp))}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {(loading || releases.length > 0) && (
        <section className="mt-8">
          <Header icon={<Disc3 size={12} className="text-small-orange" />} title="Releases" onSeeAll={seeAll} />
          {loading ? <SkeletonRow /> : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
              {releases.map(r => (
                <button key={r.key} onClick={() => openRelease(r)} className="w-40 shrink-0 text-left snap-start group focus:outline-none">
                  <div className="relative aspect-square rounded-2xl overflow-hidden bg-[#111] border border-white/10 group-focus-visible:ring-2 group-focus-visible:ring-white">
                    <MediaThumb src={r.cover} alt="" className="group-hover:scale-105 transition-transform" fallback={<div className="absolute inset-0 grid place-items-center"><Disc3 size={24} className="text-white/20" /></div>} />
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[8px] font-black uppercase tracking-widest text-white">{r.label}</span>
                  </div>
                  <p className="text-xs font-bold text-white mt-2 line-clamp-2 leading-snug">{r.title}</p>
                  <p className="text-[10px] text-white/35 mt-0.5 truncate">{age(r.ts)}{r.subtitle ? ` · ${r.subtitle}` : ''}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {isOwner && !loading && <div className="mt-2">{linkControls}</div>}
    </>
  );
};

export default OrgMediaShelves;
