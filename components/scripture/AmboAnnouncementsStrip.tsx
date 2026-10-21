// AmboAnnouncementsStrip — Stage's Announcements row (services/ambo/stageInbox.ts).
//
// Sits under the toolbars, above the presentations / slide row. Departments, leadership,
// volunteers and guest musicians send images, videos and backing tracks from their phones;
// each lands here with its sticky-note instruction. The strip pulses orange while something is
// arriving, copies every arrival into the Stage media folder (Announcements/<date>/), and lets the
// operator play it (visuals → program, audio → DJ deck) or hand the sender remote play/stop.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Megaphone, Smartphone, Play, Square, X, Plus, QrCode, Music, Image as ImageIcon, Film, Loader2,
  HardDrive, ChevronDown, ChevronUp, Check, Copy, Disc3, StickyNote,
} from 'lucide-react';
import {
  listenToStageInbox, listenToStageInboxControl, setStageInboxControl, updateStageInboxItem,
  fetchStageInboxBlob, stageUploadLink, type StageInboxItem, type StageInboxControl,
} from '../../services/ambo/stageInbox';
import { importFilesIntoTarget } from '../../services/ambo/mediaFolders';

const ORANGE = '#FF8C00';

export interface AnnouncementMedia { item: StageInboxItem; url: string }

interface Props {
  orgId?: string;
  orgName?: string;
  /** Image/video → program (and the item becomes the live one). */
  onTakeVisual: (m: AnnouncementMedia) => void;
  /** Clear what this item put on program. */
  onStopVisual: (m: AnnouncementMedia) => void;
  /** Audio → DJ deck. `autoplay` is true for a remote play. */
  onSendAudio: (m: AnnouncementMedia, autoplay: boolean) => void;
  onStopAudio: (m: AnnouncementMedia) => void;
  /** Append a slide for this visual to the active presentation. */
  onAddToShow: (m: AnnouncementMedia) => void;
  /** No org on the project yet → open the project switcher. */
  onLinkOrg: () => void;
}

interface LocalCopy { url?: string; state: 'fetching' | 'synced' | 'session' | 'error'; note?: string }

const today = () => new Date().toISOString().slice(0, 10);

const AmboAnnouncementsStrip: React.FC<Props> = ({ orgId, orgName, onTakeVisual, onStopVisual, onSendAudio, onStopAudio, onAddToShow, onLinkOrg }) => {
  const [control, setControl] = useState<StageInboxControl>({ accepting: false, remoteDefault: false });
  const [items, setItems] = useState<StageInboxItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [local, setLocal] = useState<Record<string, LocalCopy>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  const seenIds = useRef<Set<string> | null>(null);
  const handledSeq = useRef<Record<string, number>>({});
  const fetching = useRef<Set<string>>(new Set());
  const localRef = useRef(local);
  localRef.current = local;

  useEffect(() => {
    setItems([]); setLoaded(false); setLocal({}); seenIds.current = null; handledSeq.current = {}; fetching.current.clear();
    if (!orgId) return;
    const offC = listenToStageInboxControl(orgId, setControl);
    const offI = listenToStageInbox(orgId, list => { setItems(list); setLoaded(true); });
    return () => { offC(); offI(); };
  }, [orgId]);

  // New arrivals glow for a few seconds; the first snapshot is history, not "incoming".
  useEffect(() => {
    if (!loaded) return;
    if (!seenIds.current) {
      seenIds.current = new Set(items.map(i => i.id));
      for (const i of items) handledSeq.current[i.id] = i.remoteCommand?.seq || 0;
      return;
    }
    const added = items.filter(i => !seenIds.current!.has(i.id)).map(i => i.id);
    if (!added.length) return;
    added.forEach(id => seenIds.current!.add(id));
    setCollapsed(false);
    setFreshIds(prev => new Set([...prev, ...added]));
    const t = window.setTimeout(() => setFreshIds(prev => { const n = new Set(prev); added.forEach(id => n.delete(id)); return n; }), 9000);
    return () => window.clearTimeout(t);
  }, [items, loaded]);

  // Pull every finished upload down once and keep a copy in the Stage media folder.
  useEffect(() => {
    for (const it of items) {
      if (it.status === 'uploading' || it.status === 'failed' || fetching.current.has(it.id) || localRef.current[it.id]) continue;
      fetching.current.add(it.id);
      setLocal(prev => ({ ...prev, [it.id]: { state: 'fetching' } }));
      (async () => {
        try {
          const blob = await fetchStageInboxBlob(it);
          const file = new File([blob], it.fileName, { type: it.mimeType || blob.type });
          const sub = `Announcements/${today()}/${(it.sourceName || 'Uploads').replace(/[\\/:*?"<>|]+/g, ' ').trim()}`;
          const [res] = await importFilesIntoTarget([file], null, { subpath: sub });
          setLocal(prev => ({ ...prev, [it.id]: { url: res.url, state: res.persisted ? 'synced' : 'session', note: res.note } }));
        } catch (e: any) {
          fetching.current.delete(it.id);
          setLocal(prev => ({ ...prev, [it.id]: { state: 'error', note: e?.message || 'Download failed' } }));
        }
      })();
    }
  }, [items]);

  const mediaFor = (it: StageInboxItem): AnnouncementMedia | null => {
    const url = local[it.id]?.url;
    return url ? { item: it, url } : null;
  };

  const play = (it: StageInboxItem, remote = false) => {
    const m = mediaFor(it);
    if (!m || !orgId) return;
    if (it.kind === 'audio') onSendAudio(m, remote);
    else onTakeVisual(m);
    // Only one announcement is "live" at a time.
    for (const other of items) if (other.id !== it.id && other.status === 'live') updateStageInboxItem(orgId, other.id, { status: 'played' }).catch(() => {});
    updateStageInboxItem(orgId, it.id, { status: 'live' }).catch(() => {});
  };
  const stop = (it: StageInboxItem) => {
    const m = mediaFor(it);
    if (m) { if (it.kind === 'audio') onStopAudio(m); else onStopVisual(m); }
    if (orgId) updateStageInboxItem(orgId, it.id, { status: 'played' }).catch(() => {});
  };
  const playRef = useRef(play); playRef.current = play;
  const stopRef = useRef(stop); stopRef.current = stop;

  // Remote triggers from the sender's phone — honoured only while the operator allows it.
  useEffect(() => {
    if (!seenIds.current) return;
    for (const it of items) {
      const cmd = it.remoteCommand;
      if (!cmd || cmd.seq <= (handledSeq.current[it.id] || 0)) continue;
      // A play that lands before the file finished syncing waits for it (this effect reruns on `local`).
      if (cmd.action === 'play' && it.remoteAllowed && !local[it.id]?.url && local[it.id]?.state !== 'error') continue;
      handledSeq.current[it.id] = cmd.seq;
      if (!it.remoteAllowed || cmd.byUid !== it.uploaderUid) continue;
      if (cmd.action === 'play') playRef.current(it, true);
      else stopRef.current(it);
    }
  }, [items, local]);

  useEffect(() => {
    if (!linkOpen || !orgId) return;
    QRCode.toDataURL(stageUploadLink(orgId), { width: 240, margin: 1 }).then(setQr).catch(() => setQr(''));
  }, [linkOpen, orgId]);

  const incoming = items.some(i => i.status === 'uploading') || freshIds.size > 0;
  const actionable = useMemo(() => items.filter(i => i.status !== 'failed'), [items]);

  const toggleAccepting = () => orgId && setStageInboxControl(orgId, { accepting: !control.accepting }).catch(() => {});
  const toggleRemoteDefault = () => orgId && setStageInboxControl(orgId, { remoteDefault: !control.remoteDefault }).catch(() => {});

  const stripStyle: React.CSSProperties = incoming
    ? { borderColor: 'rgba(255,140,0,0.75)', background: 'linear-gradient(90deg, rgba(255,140,0,0.22), rgba(212,0,85,0.10), rgba(255,140,0,0.14))', boxShadow: 'inset 0 0 24px rgba(255,140,0,0.25)' }
    : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(10,7,17,0.55)' };

  return (
    <div className="relative shrink-0 border-b text-xs transition-colors" style={stripStyle} data-stage-announcements>
      {incoming && <div className="pointer-events-none absolute inset-0 animate-pulse" style={{ background: 'rgba(255,140,0,0.16)' }} />}
      <div className="relative h-9 px-4 flex items-center gap-3">
        <button onClick={() => setCollapsed(c => !c)} className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.14em]" style={{ color: incoming ? ORANGE : 'rgba(255,255,255,0.75)' }} title={collapsed ? 'Show announcements' : 'Collapse announcements'}>
          <Megaphone size={13} />
          Announcements
          {actionable.length > 0 && <span className="ml-1 px-1.5 rounded-full text-[10px] font-bold text-black" style={{ background: ORANGE }}>{actionable.length}</span>}
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>

        {incoming && (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10.5px] font-bold" style={{ borderColor: ORANGE, color: ORANGE, background: 'rgba(255,140,0,0.12)' }}>
            <Loader2 size={11} className="animate-spin" /> Incoming announcement asset
          </span>
        )}

        <div className="flex-1" />

        {orgId ? (
          <>
            <span className="text-white/35 truncate max-w-[160px]" title={orgName}>{orgName}</span>
            <button onClick={toggleRemoteDefault}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${control.remoteDefault ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200' : 'bg-white/5 border-white/10 text-white/55 hover:text-white'}`}
              title="When on, new uploads arrive with remote play/stop already granted to the sender">
              <Smartphone size={12} /> Remote by default {control.remoteDefault ? 'ON' : 'OFF'}
            </button>
            <div className="relative">
              <button onClick={() => setLinkOpen(v => !v)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-white/5 border-white/10 text-white/70 hover:text-white text-[11px] font-semibold" title="Upload link + QR for phones">
                <QrCode size={12} /> Upload link
              </button>
              {linkOpen && (
                <div className="absolute right-0 top-8 z-50 w-64 rounded-xl border border-white/15 bg-[#120c1d] p-3 shadow-2xl">
                  <p className="text-[11px] text-white/70 mb-2">Departments, volunteers and guests scan this to send images, video or backing tracks to Stage.</p>
                  {qr && <img src={qr} alt="Stage upload QR code" className="w-full rounded-lg bg-white p-1" />}
                  <button onClick={() => { navigator.clipboard?.writeText(stageUploadLink(orgId)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[11px] font-semibold">
                    {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              )}
            </div>
            <button onClick={toggleAccepting}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider border transition-all ${control.accepting ? 'text-white border-[#FF8C00]/80 shadow-[0_0_15px_rgba(255,140,0,0.3)]' : 'bg-white/5 text-white/60 hover:text-white border-white/10'}`}
              style={control.accepting ? { background: 'linear-gradient(90deg,#D40055,#FF8C00)' } : undefined}
              title="Let departments, leadership, volunteers and guests send uploads to this row">
              <span className={`w-1.5 h-1.5 rounded-full ${control.accepting ? 'bg-white animate-pulse' : 'bg-white/30'}`} />
              Receiving {control.accepting ? 'ON' : 'OFF'}
            </button>
          </>
        ) : (
          <button onClick={onLinkOrg} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-[11px]">
            Open an organization project to receive announcements
          </button>
        )}
      </div>

      {!collapsed && orgId && (
        <div className="relative px-4 pb-2.5 flex gap-3 overflow-x-auto">
          {actionable.length === 0 && (
            <div className="h-[86px] flex items-center text-white/35 text-[11.5px]">
              {control.accepting
                ? 'Waiting for uploads — share the upload link or QR with departments, leadership and guests.'
                : 'Turn Receiving ON to accept announcement images, videos and backing tracks from phones.'}
            </div>
          )}
          {actionable.map(it => (
            <AnnouncementCard key={it.id} item={it} local={local[it.id]} fresh={freshIds.has(it.id)}
              onPlay={() => play(it)} onStop={() => stop(it)}
              onAdd={() => { const m = mediaFor(it); if (m) onAddToShow(m); }}
              onToggleRemote={() => orgId && updateStageInboxItem(orgId, it.id, { remoteAllowed: !it.remoteAllowed }).catch(() => {})}
              onDismiss={() => orgId && updateStageInboxItem(orgId, it.id, { status: 'dismissed' }).catch(() => {})} />
          ))}
        </div>
      )}
    </div>
  );
};

const KIND_ICON = { image: ImageIcon, video: Film, audio: Music } as const;

const AnnouncementCard: React.FC<{
  item: StageInboxItem; local?: LocalCopy; fresh: boolean;
  onPlay: () => void; onStop: () => void; onAdd: () => void; onToggleRemote: () => void; onDismiss: () => void;
}> = ({ item, local, fresh, onPlay, onStop, onAdd, onToggleRemote, onDismiss }) => {
  const Icon = KIND_ICON[item.kind];
  const uploading = item.status === 'uploading';
  const ready = !!local?.url;
  const live = item.status === 'live';
  return (
    <div className="flex-none flex gap-1.5">
      <div className={`relative w-[200px] h-[86px] rounded-lg border overflow-hidden flex ${live ? 'border-red-500 shadow-[0_0_14px_rgba(239,68,68,0.45)]' : fresh || uploading ? 'border-[#FF8C00]' : 'border-white/12'}`}
        style={{ background: 'rgba(0,0,0,0.45)' }}>
        <div className="relative w-[86px] h-full flex-none bg-black/60 flex items-center justify-center">
          {item.kind === 'image' && local?.url && <img src={local.url} alt="" className="w-full h-full object-cover" />}
          {item.kind === 'video' && local?.url && <video src={local.url} muted playsInline preload="metadata" className="w-full h-full object-cover" />}
          {(item.kind === 'audio' || !local?.url) && <Icon size={22} className="text-white/45" />}
          {uploading && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
              <div className="h-full" style={{ width: `${item.progress || 2}%`, background: ORANGE }} />
            </div>
          )}
          {live && <span className="absolute top-1 left-1 px-1 rounded text-[8.5px] font-black bg-red-600 text-white">LIVE</span>}
        </div>
        <div className="flex-1 min-w-0 p-1.5 flex flex-col">
          <div className="text-[11.5px] font-bold text-white truncate" title={item.title}>{item.title}</div>
          <div className="text-[10px] text-white/45 truncate">{item.sourceName} · {item.uploaderName}</div>
          <div className="text-[9.5px] mt-0.5 flex items-center gap-1 truncate"
            title={local?.note || ''}
            style={{ color: local?.state === 'synced' ? '#34d399' : local?.state === 'error' ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
            {uploading ? <><Loader2 size={9} className="animate-spin" /> Uploading {item.progress || 0}%</>
              : local?.state === 'fetching' ? <><Loader2 size={9} className="animate-spin" /> Syncing to drive…</>
              : local?.state === 'synced' ? <><HardDrive size={9} /> On local drive</>
              : local?.state === 'session' ? <><HardDrive size={9} /> This session only</>
              : local?.state === 'error' ? <>Download failed</> : null}
          </div>
          <div className="mt-auto flex items-center gap-1">
            {live ? (
              <button onClick={onStop} className="h-6 px-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-[10.5px] font-bold flex items-center gap-1"><Square size={10} /> Stop</button>
            ) : (
              <button onClick={onPlay} disabled={!ready} className="h-6 px-2 rounded-md text-white text-[10.5px] font-bold flex items-center gap-1 disabled:opacity-35"
                style={{ background: 'linear-gradient(135deg,#D40055,#FF8C00)' }}
                title={item.kind === 'audio' ? 'Load into the DJ deck' : 'Send to program'}>
                {item.kind === 'audio' ? <><Disc3 size={10} /> To DJ deck</> : <><Play size={10} /> Take</>}
              </button>
            )}
            {item.kind !== 'audio' && (
              <button onClick={onAdd} disabled={!ready} className="h-6 w-6 rounded-md bg-white/8 hover:bg-white/15 text-white/70 flex items-center justify-center disabled:opacity-35" title="Add as a slide in this presentation"><Plus size={11} /></button>
            )}
            <button onClick={onToggleRemote}
              className={`h-6 w-6 rounded-md flex items-center justify-center border ${item.remoteAllowed ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
              title={item.remoteAllowed ? `${item.uploaderName} can play/stop this from their phone — click to revoke` : `Let ${item.uploaderName} play/stop this from their phone`}>
              <Smartphone size={11} />
            </button>
            <button onClick={onDismiss} className="h-6 w-6 rounded-md text-white/35 hover:text-red-300 hover:bg-white/5 flex items-center justify-center ml-auto" title="Dismiss"><X size={11} /></button>
          </div>
        </div>
      </div>
      {item.note && (
        <div className="w-[150px] h-[86px] rounded-md p-1.5 text-[10.5px] leading-snug overflow-y-auto shadow-md rotate-[0.6deg]"
          style={{ background: '#FDE68A', color: '#422006' }} title={item.note}>
          <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider opacity-70 mb-0.5"><StickyNote size={9} /> Note</div>
          {item.note}
        </div>
      )}
    </div>
  );
};

export default AmboAnnouncementsStrip;
