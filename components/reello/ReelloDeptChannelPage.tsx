// A department's Reello channel — one department of an organization (Youth, Media, Sales…), shown as
// its own channel under the org's main channel. Lists what the department has posted (public videos)
// and any stream it has live now. Opened from anywhere with openDeptChannel(orgId, departmentId).

import React, { useEffect, useState } from 'react';
import { X, Play, Radio, Loader2, Building2, ChevronLeft } from 'lucide-react';
import { fetchDeptChannel, fetchOrgDeptChannels, openDeptChannel, type DeptChannel, type DeptChannelCard } from '../../services/reello/orgChannels';

const BRAND = 'linear-gradient(115deg,#6B0099 0%,#B4008C 42%,#D40055 66%,#FF8C00 100%)';
const fmtDur = (s: number) => { if (!s) return ''; const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, '0')}`; };
const ago = (ms: number) => {
  if (!ms) return '';
  const d = Math.floor((Date.now() - ms) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : d < 365 ? `${Math.floor(d / 30)} mo ago` : `${Math.floor(d / 365)} yr ago`;
};

const openVideo = (videoId: string) => window.dispatchEvent(new CustomEvent('plajah:open-video', { detail: { videoId } }));
const openLive = (feed: unknown) => window.dispatchEvent(new CustomEvent('plajah:open-live-feed', { detail: { feed } }));

const ReelloDeptChannelPage: React.FC<{ orgId: string; departmentId: string; onClose: () => void }> = ({ orgId, departmentId, onClose }) => {
  const [data, setData] = useState<DeptChannel | null>(null);
  const [siblings, setSiblings] = useState<DeptChannelCard[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null); setError('');
    fetchDeptChannel(orgId, departmentId).then(d => live && setData(d)).catch(e => live && setError(e?.message || 'Could not load this channel.'));
    fetchOrgDeptChannels(orgId).then(r => live && setSiblings(r.channels.filter(c => c.departmentId !== departmentId))).catch(() => {});
    return () => { live = false; };
  }, [orgId, departmentId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const goOrg = () => {
    if (!data?.org.accountUid) return;
    onClose();
    window.dispatchEvent(new CustomEvent('plajah:visit-user', { detail: { uid: data.org.accountUid } }));
  };

  return (
    <div className="fixed inset-0 z-[380] bg-[#07060a] text-white overflow-y-auto" role="dialog" aria-modal="true" aria-label="Department channel">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-8 py-3 bg-[#07060a]/90 backdrop-blur border-b border-white/5">
        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-white/10" aria-label="Back"><ChevronLeft size={20} /></button>
        <span className="text-sm text-white/60 truncate">{data ? `${data.org.name} · Reello` : 'Reello'}</span>
        <button onClick={onClose} className="ml-auto p-2 rounded-full hover:bg-white/10" aria-label="Close"><X size={18} /></button>
      </div>

      {!data && !error && <div className="py-32 grid place-items-center"><Loader2 className="animate-spin text-white/40" /></div>}
      {error && <p className="py-32 text-center text-sm text-white/50">{error}</p>}

      {data && (
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-20">
          {/* Header */}
          <div className="relative mt-4 rounded-3xl overflow-hidden border border-white/10">
            <div className="h-28 sm:h-40" style={{ background: BRAND }}>
              {data.videos[0]?.thumbnailUrl && <img src={data.videos[0].thumbnailUrl} alt="" className="w-full h-full object-cover opacity-40 mix-blend-overlay" />}
            </div>
            <div className="flex flex-wrap items-end gap-4 px-5 sm:px-8 pb-5 -mt-10">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full p-[3px] shrink-0" style={{ background: BRAND }}>
                <div className="w-full h-full rounded-full bg-[#111116] grid place-items-center text-3xl overflow-hidden">
                  {data.department.iconEmoji || (data.org.logoUrl ? <img src={data.org.logoUrl} alt="" className="w-full h-full object-cover" /> : <Building2 size={30} className="text-white/60" />)}
                </div>
              </div>
              <div className="min-w-0 flex-1 pt-10">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight truncate">{data.department.name}</h1>
                <p className="text-sm text-white/60 mt-0.5">
                  A channel of{' '}
                  <button onClick={goOrg} disabled={!data.org.accountUid} className="font-semibold text-white hover:underline disabled:no-underline disabled:cursor-default">{data.org.name}</button>
                  {' · '}{data.videos.length} video{data.videos.length === 1 ? '' : 's'}
                </p>
                {data.department.description && <p className="text-sm text-white/50 mt-2 line-clamp-2">{data.department.description}</p>}
              </div>
            </div>
          </div>

          {/* Live now */}
          {data.liveNow.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 mb-4"><Radio size={16} className="text-red-500" />Live now</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.liveNow.map(f => (
                  <button key={f.id} onClick={() => openLive(f)} className="text-left rounded-2xl overflow-hidden border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 p-4 flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-red-600 grid place-items-center shrink-0"><Radio size={18} /></span>
                    <span className="min-w-0"><span className="block font-bold truncate">{f.title}</span><span className="block text-xs text-white/50 truncate">{f.ownerName}</span></span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Videos */}
          <section className="mt-8">
            <h2 className="text-sm font-black uppercase tracking-widest mb-4">Videos</h2>
            {!data.videos.length ? (
              <p className="text-sm text-white/40 py-10">No public videos yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-7">
                {data.videos.map(v => (
                  <button key={v.id} onClick={() => openVideo(v.id)} className="group text-left">
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-white/5">
                      {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full grid place-items-center"><Play className="text-white/30" /></div>}
                      {v.duration > 0 && <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[11px] font-semibold">{fmtDur(v.duration)}</span>}
                    </div>
                    <p className="mt-2 text-sm font-semibold line-clamp-2">{v.title}</p>
                    <p className="text-xs text-white/50 mt-0.5">{v.playsCount ? `${v.playsCount.toLocaleString()} views · ` : ''}{ago(v.timestamp)}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Other departments of the same org */}
          {siblings.length > 0 && (
            <section className="mt-12">
              <h2 className="text-sm font-black uppercase tracking-widest mb-4">More from {data.org.name}</h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {siblings.map(c => (
                  <button key={c.departmentId} onClick={() => openDeptChannel(orgId, c.departmentId)} className="shrink-0 w-44 text-left p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08]">
                    <span className="text-2xl">{c.iconEmoji || '🎬'}</span>
                    <p className="text-sm font-bold truncate mt-1">{c.name}</p>
                    <p className="text-[11px] text-white/50">{c.live ? <span className="text-red-400 font-bold">LIVE · </span> : null}{c.videoCount} video{c.videoCount === 1 ? '' : 's'}</p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default ReelloDeptChannelPage;
