// OrgMediaShelf — an org's / department's / class's internal (or public) media as playlists, with a player
// that fetches signed Mux tokens per play (services/orgPublish.ts → routes/orgMedia.ts). Used on the class
// page (Recordings), the department's Reello page and anywhere an org shows members-only media.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, Play, Trash2, X, Globe } from 'lucide-react';
import {
  AUDIENCE_LABEL, deleteOrgMedia, listOrgMedia, playOrgMedia, playbackUrls,
  type OrgMediaApp, type OrgMediaItem, type OrgMediaPlaylist,
} from '../../services/orgPublish';

const fmtDur = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function Player({ item, onClose }: { item: OrgMediaItem; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let hls: any = null;
    let gone = false;
    playOrgMedia(item.id).then(async p => {
      if (gone || !ref.current) return;
      const { hls: src, poster } = playbackUrls(p);
      ref.current.poster = poster;
      if (ref.current.canPlayType('application/vnd.apple.mpegurl')) { ref.current.src = src; return; }
      const { default: Hls } = await import('hls.js');
      if (gone || !ref.current) return;
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(ref.current);
    }).catch(e => setErr(e?.code === 'NO_SIGNING_KEY' ? 'Private playback isn’t set up yet. Ask an admin to add the Mux signing key.' : e?.message || 'Couldn’t play this.'));
    return () => { gone = true; hls?.destroy?.(); };
  }, [item.id]);
  return (
    <div className="rounded-2xl border border-white/10 bg-black overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04]">
        <span className="text-[13px] font-bold text-white truncate flex-1">{item.title}</span>
        <button type="button" onClick={onClose} aria-label="Close player" className="p-1 text-white/60 hover:text-white"><X size={16} /></button>
      </div>
      {err ? <div className="p-6 text-[13px] text-amber-300">{err}</div> : <video ref={ref} controls playsInline autoPlay className="w-full aspect-video bg-black" />}
    </div>
  );
}

export default function OrgMediaShelf({ orgId, departmentId, classId, app, title = 'Recordings', emptyText, canManage, refreshKey, hideWhenEmpty }: {
  orgId: string; departmentId?: string; classId?: string; app?: OrgMediaApp;
  title?: string; emptyText?: string;
  /** Show delete on items (publishers); the server still checks. */
  canManage?: boolean;
  /** Bump to reload (e.g. after a new recording finished uploading). */
  refreshKey?: number;
  /** Render nothing unless there's something this viewer may watch (public pages: outsiders see no trace). */
  hideWhenEmpty?: boolean;
}) {
  const [lists, setLists] = useState<OrgMediaPlaylist[] | null>(null);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState<OrgMediaItem | null>(null);
  const load = useCallback(() => {
    listOrgMedia({ orgId, departmentId, classId, app }).then(r => { setLists(r.playlists); setErr(''); }).catch(e => { setLists([]); setErr(e?.message || 'Couldn’t load.'); });
  }, [orgId, departmentId, classId, app]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const remove = async (it: OrgMediaItem) => {
    if (!window.confirm(`Delete "${it.title}"? Members won't be able to watch it anymore.`)) return;
    await deleteOrgMedia(it.id).catch(e => setErr(e?.message || 'Couldn’t delete.'));
    if (playing?.id === it.id) setPlaying(null);
    load();
  };

  if (hideWhenEmpty && (!lists || lists.length === 0)) return null;
  return (
    <section aria-label={title} className="space-y-3 text-white">
      <div className="text-[10px] font-black uppercase tracking-widest text-white/50">{title}</div>
      {playing && <Player item={playing} onClose={() => setPlaying(null)} />}
      {lists === null && <div className="text-[12px] text-white/50">Loading…</div>}
      {err && <div className="text-[12px] text-amber-300">{err}</div>}
      {lists && lists.length === 0 && !err && <div className="text-[12px] text-white/50">{emptyText || 'Nothing here yet.'}</div>}
      {lists?.map(pl => (
        <div key={pl.name} className="space-y-1.5">
          <div className="text-[13px] font-black">{pl.name} <span className="text-white/40 font-bold">· {pl.items.length}</span></div>
          <div className="grid gap-1.5">
            {pl.items.map(it => (
              <div key={it.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <button type="button" disabled={it.status !== 'READY'} onClick={() => setPlaying(it)} aria-label={`Play ${it.title}`}
                  className="w-8 h-8 rounded-full grid place-items-center bg-white/10 hover:bg-white/20 disabled:opacity-40 shrink-0"><Play size={14} /></button>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold truncate">{it.title}</span>
                  <span className="block text-[11px] text-white/50 truncate">
                    {[fmtDate(it.createdAt), fmtDur(it.durationSec), it.status === 'READY' ? '' : it.status === 'ERRORED' ? 'Upload failed' : 'Processing…'].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white/55 shrink-0" title={AUDIENCE_LABEL[it.audience]}>
                  {it.audience === 'PUBLIC' ? <Globe size={11} /> : <Lock size={11} />}{AUDIENCE_LABEL[it.audience]}
                </span>
                {canManage && <button type="button" onClick={() => void remove(it)} aria-label={`Delete ${it.title}`} className="p-1 text-white/40 hover:text-rose-300"><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
