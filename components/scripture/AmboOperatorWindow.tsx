// AmboOperatorWindow — a thin second/third operator console (?amboOp=1&role=…).
//
// It holds NO project. It listens to the leader window over BroadcastChannel
// 'ambo-session-v1', shows what is live and the current show's slides, and
// sends take / clear / scripture / routine commands back. The leader executes
// them. Full multi-operator editing is intentionally not here.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SessionSync, type OperatorRole, type SessionSnapshot, type Peer } from '../../services/ambo/sessionSync';
import { getRoutineEngine } from '../../services/ambo/routineHost';
import { setVideoSyncRole, command as videoCommand, remoteVideos, subscribeRemoteVideos, type RemoteVideo } from '../../services/ambo/videoSync';
import { predictedPosition } from '../../services/ambo/videoSyncMath';

const CYAN = '#00DAF3';
const ORANGE = '#FF8C00';
const btn = 'px-3 py-2 rounded-lg text-[12px] font-bold border border-white/15 bg-white/5 hover:bg-white/15 text-white disabled:opacity-40';

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

/** Program video, as the main window reports it. Commands go to the main window, which drives the real element. */
function ProgramVideo() {
  const [vids, setVids] = useState<RemoteVideo[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    setVideoSyncRole('operator');
    const refresh = () => setVids(remoteVideos());
    refresh();
    const off = subscribeRemoteVideos(refresh);
    const t = setInterval(() => { refresh(); tick(n => n + 1); }, 400);   // also ages out a clip that left Program
    return () => { off(); clearInterval(t); };
  }, []);
  if (!vids.length) return null;
  return (
    <div className="space-y-2">
      <div className="text-[9px] uppercase text-white/40">Program video</div>
      {vids.map(v => {
        const t = v.transport;
        const pos = predictedPosition(t, Date.now());
        const live = !t.duration;
        const name = decodeURIComponent(v.key.split('?')[0].split('/').pop() || v.key);
        const send = (cmd: Parameters<typeof videoCommand>[1]) => videoCommand(v.id, cmd);
        return (
          <div key={v.id} className="rounded-xl border border-white/10 p-3 bg-white/[0.03] space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold truncate flex-1" title={v.key}>{name}</span>
              <span className="font-mono text-[11px] text-white/60">{live ? 'LIVE' : `${mmss(pos)} / ${mmss(t.duration)}`}</span>
            </div>
            {!live && (
              <input type="range" min={0} max={t.duration} step={0.1} value={Math.min(pos, t.duration)}
                onChange={e => send({ type: 'seek', sec: Number(e.target.value) })} className="w-full accent-[#00DAF3]" aria-label="Seek" />
            )}
            <div className="flex flex-wrap gap-2">
              <button className={btn} onClick={() => send({ type: 'toggle' })}>{t.playing ? 'Pause' : 'Play'}</button>
              {!live && <button className={btn} onClick={() => send({ type: 'restart' })}>Restart</button>}
              {!live && <button className={btn} onClick={() => send({ type: 'skip', delta: -10 })}>−10 s</button>}
              {!live && <button className={btn} onClick={() => send({ type: 'skip', delta: 10 })}>+10 s</button>}
              {!live && <button className={btn} style={t.loop ? { borderColor: CYAN, color: CYAN } : undefined} onClick={() => send({ type: 'loop', on: !t.loop })}>Loop</button>}
              <button className={btn} style={t.muted ? { borderColor: ORANGE, color: ORANGE } : undefined} onClick={() => send({ type: 'mute', muted: !t.muted })}>{t.muted ? 'Unmute' : 'Mute'}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AmboOperatorWindow() {
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const role = (['all', 'lyrics', 'scripture', 'media'].includes(params.get('role') || '') ? params.get('role') : 'all') as OperatorRole;
  const [, force] = useState(0);
  const [msg, setMsg] = useState('');
  const [ref, setRef] = useState('');
  const sRef = useRef<SessionSync | null>(null);

  useEffect(() => {
    document.title = `Ambo operator · ${role}`;
    const s = new SessionSync({ role, label: `${role} operator`, canLead: false, onChange: () => force(n => n + 1) });
    sRef.current = s;
    const t = setInterval(() => force(n => n + 1), 1500); // refresh presence ageing
    return () => { clearInterval(t); s.close(); };
  }, [role]);

  const s = sRef.current;
  const snap: SessionSnapshot | null = s?.snapshot ?? null;
  const peers: Peer[] = s?.presence ?? [];
  const hasLeader = !!s && !!s.leader && peers.some(p => p.tabId === s.leader);
  const routines = useMemo(() => getRoutineEngine().getData().routines.filter(r => r.enabled), []);

  const send = async (cmd: Parameters<SessionSync['command']>[0]) => {
    const r = await s?.command(cmd);
    setMsg(r?.ok ? '' : r?.error || 'Failed');
  };

  return (
    <div className="min-h-screen text-white p-3 space-y-3" style={{ background: '#09060f' }}>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-black tracking-wide">AMBO OPERATOR</span>
        <span className="px-1.5 rounded bg-white/10 uppercase text-[9px]">{role}</span>
        <span className="flex-1" />
        <span className="text-white/50">{peers.length} window{peers.length === 1 ? '' : 's'}</span>
        <span className="w-2 h-2 rounded-full" style={{ background: hasLeader ? '#10B981' : ORANGE }} title={hasLeader ? 'Connected to main window' : 'Main window not found'} />
      </div>
      {!hasLeader && <div className="text-[12px] rounded-lg border p-3" style={{ borderColor: ORANGE, color: ORANGE }}>Waiting for the main Ambo window… Open this project in the main window first.</div>}
      {msg && <div className="text-[11px]" style={{ color: ORANGE }}>{msg}</div>}

      <div className="rounded-xl border border-white/10 p-3 bg-white/[0.03]">
        <div className="text-[9px] uppercase text-white/40">On air{snap?.showTitle ? ` · ${snap.showTitle}` : ''}</div>
        <div className="text-[15px] font-bold" style={{ color: snap?.blackout ? ORANGE : '#fff' }}>
          {snap?.blackout ? 'BLACKOUT' : snap?.liveLabel || snap?.slides.find(x => x.id === snap.liveSlideId)?.label || '—'}
        </div>
        {snap?.scriptureRef && <div className="text-[12px]" style={{ color: '#E3C57E' }}>{snap.scriptureRef}</div>}
      </div>

      {(role === 'all' || role === 'media') && <ProgramVideo />}

      <div className="flex flex-wrap gap-2">
        {(role === 'all' || role === 'lyrics') && (<>
          <button className={btn} onClick={() => send({ type: 'prev' })}>◀ Prev</button>
          <button className={btn} style={{ borderColor: CYAN, color: CYAN }} onClick={() => send({ type: 'next' })}>Next ▶</button>
        </>)}
        <button className={btn} onClick={() => send({ type: 'clear', slot: 'slide' })}>Clear slide</button>
        <button className={btn} onClick={() => send({ type: 'clear', slot: 'scripture' })}>Clear scripture</button>
        <button className={btn} onClick={() => send({ type: 'clear', slot: 'all' })}>Clear all</button>
        <button className={btn} style={{ color: ORANGE }} onClick={() => send({ type: 'blackout', on: !snap?.blackout })}>{snap?.blackout ? 'Restore' : 'Blackout'}</button>
      </div>

      {(role === 'all' || role === 'scripture') && (
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (ref.trim()) send({ type: 'fire-scripture', reference: ref.trim() }); }}>
          <input value={ref} onChange={e => setRef(e.target.value)} placeholder="John 3:16"
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#E3C57E]/60" />
          <button className={btn} style={{ color: '#E3C57E' }} type="submit">Fire scripture</button>
        </form>
      )}

      {(role === 'all' || role === 'lyrics') && (
        <div className="grid grid-cols-2 gap-2">
          {(snap?.slides ?? []).map(sl => {
            const live = sl.id === snap?.liveSlideId;
            return (
              <button key={sl.id} onClick={() => send({ type: 'take-slide', slideId: sl.id })}
                className="text-left rounded-lg border p-2 min-h-[64px]"
                style={{ borderColor: live ? ORANGE : 'rgba(255,255,255,0.1)', background: live ? 'rgba(255,140,0,0.14)' : 'rgba(255,255,255,0.03)' }}>
                <div className="text-[10px] font-bold" style={{ color: live ? ORANGE : CYAN }}>{sl.label || sl.group || 'Slide'}</div>
                <div className="text-[11px] text-white/70 line-clamp-3">{sl.text}</div>
              </button>
            );
          })}
        </div>
      )}

      {(role === 'all' || role === 'media') && routines.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] uppercase text-white/40">Routines (as saved when this window opened)</div>
          {routines.map(r => <button key={r.id} className={`${btn} w-full text-left`} onClick={() => send({ type: 'run-routine', routineId: r.id })}>▶ {r.name}</button>)}
        </div>
      )}
    </div>
  );
}
