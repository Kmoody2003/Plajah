// ChurchMasterControl — multi-site master control (Part 3, Phase 5).
//
// A campus broadcasts its program output over the platform (rtc broadcast) and
// registers it; master control lists every LIVE campus feed and previews it live.
// The selected feed's MediaStream is the switcher source (TVStudioEngine.
// addStreamSource) — the seam that lets one location take other campuses' program
// feeds as sources.

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Radio, MonitorPlay, Loader2, Building2, Dot } from 'lucide-react';
import type { Organization, Campus, ProgramFeed } from '../types';
import { useRtcSession } from '../hooks/useRtcSession';
import { registerProgramFeed, endProgramFeed, listenToProgramFeeds, campusProgramSessionId } from '../services/multiSiteService';

const Video: React.FC<{ stream: MediaStream | null; muted?: boolean }> = ({ stream, muted }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />;
};

const ChurchMasterControl: React.FC<{ church: Organization; onClose: () => void }> = ({ church, onClose }) => {
  const campuses: Campus[] = church.campuses && church.campuses.length ? church.campuses : [{ id: 'main', name: church.name, isPrimary: true }];
  const [mode, setMode] = useState<'monitor' | 'broadcast'>('monitor');

  // Broadcast (this campus goes live)
  const [liveCampusId, setLiveCampusId] = useState<string | null>(null);
  const feedIdRef = useRef<string | null>(null);
  const registeredRef = useRef(false);

  // Monitor (watch a campus feed)
  const [feeds, setFeeds] = useState<ProgramFeed[]>([]);
  const [watch, setWatch] = useState<ProgramFeed | null>(null);

  useEffect(() => listenToProgramFeeds(church.id, setFeeds), [church.id]);

  const liveCampus = campuses.find(c => c.id === liveCampusId);
  const rtcConfig =
    mode === 'broadcast' && liveCampus
      ? { sessionId: campusProgramSessionId(church.id, liveCampus.id), topology: 'broadcast' as const, role: 'host' as const, media: { audio: true, video: true }, displayName: liveCampus.name }
      : mode === 'monitor' && watch
        ? { sessionId: watch.sessionId, topology: 'broadcast' as const, role: 'viewer' as const }
        : null;

  const rtc = useRtcSession(rtcConfig, { autoJoin: true });

  // Register the program feed once the campus broadcast has a local stream.
  useEffect(() => {
    if (mode === 'broadcast' && liveCampus && rtc.localStream && !registeredRef.current) {
      registeredRef.current = true;
      registerProgramFeed({ churchId: church.id, campusId: liveCampus.id, campusName: liveCampus.name, sessionId: campusProgramSessionId(church.id, liveCampus.id) })
        .then(id => { feedIdRef.current = id; });
    }
  }, [mode, liveCampus, rtc.localStream, church.id]);

  const stopBroadcast = () => {
    if (feedIdRef.current) endProgramFeed(feedIdRef.current);
    feedIdRef.current = null; registeredRef.current = false;
    setLiveCampusId(null);
  };

  const remote = [...rtc.remoteStreams.values()][0] || null;

  return (
    <div className="min-h-full p-6 lg:p-12 max-w-4xl mx-auto">
      <button onClick={() => { stopBroadcast(); onClose(); }} className="flex items-center gap-2 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest mb-8"><ArrowLeft size={14} /> Back</button>

      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-small-orange/15 rounded-2xl"><MonitorPlay className="text-small-orange" size={24} /></div>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-white leading-none">Master Control</h1>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">{church.name} · multi-site program feeds</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-white/5 rounded-2xl w-fit mb-8">
        {(['monitor', 'broadcast'] as const).map(m => (
          <button key={m} onClick={() => { if (m !== 'broadcast') stopBroadcast(); setWatch(null); setMode(m); }}
            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}>
            {m === 'monitor' ? 'Master Monitor' : 'This Campus Live'}
          </button>
        ))}
      </div>

      {mode === 'broadcast' ? (
        <div className="space-y-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Broadcast this campus's program feed</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {campuses.map(c => (
              <button key={c.id} onClick={() => { if (liveCampusId === c.id) stopBroadcast(); else { stopBroadcast(); setLiveCampusId(c.id); } }}
                className={`p-4 rounded-2xl border text-left transition-all ${liveCampusId === c.id ? 'bg-red-500/15 border-red-500/40' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'}`}>
                <p className="text-sm font-black text-white flex items-center gap-2"><Building2 size={14} />{c.name}{c.isPrimary ? <span className="text-[8px] text-small-orange">PRIMARY</span> : ''}</p>
                {c.location && <p className="text-[10px] text-white/40 mt-0.5">{c.location}</p>}
                <p className={`text-[9px] font-black uppercase tracking-widest mt-2 ${liveCampusId === c.id ? 'text-red-400' : 'text-white/30'}`}>{liveCampusId === c.id ? '● On air — tap to stop' : 'Tap to go live'}</p>
              </button>
            ))}
          </div>
          {liveCampus && (
            <div className="aspect-video rounded-3xl overflow-hidden bg-black border border-red-500/30 relative">
              {rtc.localStream ? <Video stream={rtc.localStream} muted /> : <div className="w-full h-full grid place-items-center"><Loader2 className="animate-spin text-white/30" /></div>}
              <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-red-600 rounded-full text-[9px] font-black uppercase tracking-widest text-white"><Dot className="animate-pulse" size={14} /> Live · {liveCampus.name}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {watch ? (
            <>
              <button onClick={() => setWatch(null)} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">← All campus feeds</button>
              <div className="aspect-video rounded-3xl overflow-hidden bg-black border border-white/10 relative">
                {remote ? <Video stream={remote} /> : <div className="w-full h-full grid place-items-center gap-3 flex-col"><Loader2 className="animate-spin text-white/30" /><span className="text-[9px] font-black uppercase tracking-widest text-white/30">Connecting to {watch.campusName}…</span></div>}
                <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur rounded-full text-[9px] font-black uppercase tracking-widest text-white"><Radio size={11} className="text-small-orange" /> {watch.campusName}</span>
              </div>
              <p className="text-[10px] text-white/30">This campus feed is a live switcher source — add it in TV Studio via the campus-feeds panel.</p>
            </>
          ) : feeds.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-white/[0.03] border border-white/10">
              <MonitorPlay size={36} className="mx-auto text-white/15 mb-3" />
              <p className="text-white/50 font-bold mb-1">No campuses live right now</p>
              <p className="text-[11px] text-white/30">When a campus broadcasts (the "This Campus Live" tab), its program feed appears here for master control.</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{feeds.length} campus feed{feeds.length > 1 ? 's' : ''} live</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {feeds.map(f => (
                  <button key={f.id} onClick={() => setWatch(f)} className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] text-left transition-all flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-red-500/15 grid place-items-center shrink-0"><Radio size={16} className="text-red-400" /></span>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white truncate">{f.campusName}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-red-400 mt-0.5 flex items-center gap-1"><Dot className="animate-pulse" size={12} /> Live now</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ChurchMasterControl;
