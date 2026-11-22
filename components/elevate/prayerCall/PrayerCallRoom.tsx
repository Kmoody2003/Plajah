// PrayerCallRoom — the live prayer room: camera + mic grid on LiveKit, a countdown to the server's
// hard end (60 minutes at most), warnings at 5 and 1 minute, mute/camera toggles, leader controls
// (end for everyone, remove someone) and the optional prayer-request list. Full screen on every size;
// on a phone the grid is two columns and the prayer list opens as a bottom sheet.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, HandHeart, X, Check, Trash2, Clock, Users, UserMinus, Power, Send, Loader2,
} from 'lucide-react';
import { formatLeft, msLeft, warningLevel, type PrayerCallView } from '../../../services/elevate/prayerCallCore';
import { failed, myUid, prayerCallApi, type MediaGrant } from '../../../services/elevate/prayerCallClient';

type MediaMode = 'connecting' | 'live' | 'local' | 'none';
interface SessionLike { join(): Promise<void>; leave(): Promise<void>; setAudioEnabled(on: boolean): void; setVideoEnabled(on: boolean): void }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '•';
const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const hasVideo = (s?: MediaStream | null) => !!s && s.getVideoTracks().some(t => t.readyState === 'live' && t.enabled);

const StreamVideo: React.FC<{ stream: MediaStream; mirror?: boolean }> = ({ stream, mirror }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover ${mirror ? '-scale-x-100' : ''}`} />;
};
const StreamAudio: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current) { ref.current.srcObject = stream; void ref.current.play().catch(() => {}); } }, [stream]);
  return <audio ref={ref} autoPlay className="hidden" />;
};

const PrayerCallRoom: React.FC<{
  orgId: string;
  ministryId: string;
  initial: PrayerCallView;
  /** The server has LiveKit configured. */
  media: boolean;
  onClose: () => void;
}> = ({ orgId, ministryId, initial, media, onClose }) => {
  const [call, setCall] = useState<PrayerCallView>(initial);
  const offset = useRef(initial.serverNow - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset.current);
  const [mode, setMode] = useState<MediaMode>('connecting');
  const [mediaNote, setMediaNote] = useState('');
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<Record<string, MediaStream>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [panel, setPanel] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const session = useRef<SessionLike | null>(null);
  const preview = useRef<MediaStream | null>(null);
  const me = myUid() || '';

  const left = msLeft(call, now);
  const over = call.status === 'ENDED' || call.removed || left <= 0;
  const warn = warningLevel(left);

  const stopMedia = useCallback(() => {
    const s = session.current; session.current = null;
    void s?.leave().catch(() => {});
    preview.current?.getTracks().forEach(t => t.stop()); preview.current = null;
    setLocal(null); setRemotes({}); setSpeakers([]);
  }, []);

  const apply = useCallback((v: PrayerCallView | null | undefined) => {
    if (!v) { setCall(c => ({ ...c, status: 'ENDED' })); return; }
    offset.current = v.serverNow - Date.now();
    setCall(v);
  }, []);

  // ── Media: LiveKit when the server has it, else a local camera preview so people still see themselves.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = media ? await prayerCallApi.token(orgId, ministryId) : null;
      if (cancelled) return;
      if (res && failed(res)) { setError(res.error); if (res.status === 410 || res.reason === 'REMOVED') apply({ ...call, status: 'ENDED', removed: res.reason === 'REMOVED' }); setMode('none'); return; }
      const g: MediaGrant | null = res && !failed(res) ? res : null;
      if (g && g.available) {
        try {
          const { LiveKitSession } = await import('../../../services/meetings/livekitSession');
          const s = new LiveKitSession(
            { sessionId: g.room, topology: 'mesh', role: 'participant', media: { audio: true, video: true }, collectionName: 'prayer_call_presence' },
            {
              onLocalStream: st => setLocal(st),
              onRemoteStream: (peer, st) => setRemotes(r => ({ ...r, [peer]: st })),
              onPeerLeft: peer => setRemotes(r => { const n = { ...r }; delete n[peer]; return n; }),
              onParticipants: list => setNames(n => ({ ...n, ...Object.fromEntries(list.filter(p => p.name).map(p => [p.id, p.name!])) })),
              onActiveSpeakers: ids => setSpeakers(ids),
              onError: e => setMediaNote(e.message),
            },
            { url: g.url, token: g.token, room: g.room, identity: g.identity, cap: g.cap },
          );
          session.current = s;
          await s.join();
          if (cancelled) { void s.leave(); return; }
          setMode('live');
          return;
        } catch (e: any) {
          session.current = null;
          setMediaNote(e?.message || 'Could not connect cameras and audio.');
        }
      } else if (!g || !g.available) {
        setMediaNote('Live audio and video aren’t switched on for this server yet. You can still pray together with the request list.');
      }
      try {
        const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: true });
        if (cancelled) { st.getTracks().forEach(t => t.stop()); return; }
        preview.current = st; setLocal(st); setMode('local');
      } catch {
        setMode('none'); setCamOn(false);
        setMediaNote(n => n || 'Camera and microphone are blocked. Allow them in your browser to be seen and heard.');
      }
    })();
    return () => { cancelled = true; stopMedia(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, ministryId, media]);

  // ── Poll (doubles as the presence heartbeat) + 1 s countdown.
  useEffect(() => {
    if (over) return;
    const poll = async () => {
      const r = await prayerCallApi.state(orgId, ministryId, true);
      if (!failed(r)) apply(r.call);
    };
    const p = setInterval(poll, 10_000);
    const t = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => { clearInterval(p); clearInterval(t); };
  }, [orgId, ministryId, over, apply]);

  // Time's up (or ended / removed): drop media at once and confirm with the server.
  useEffect(() => {
    if (!over) return;
    stopMedia();
    void prayerCallApi.state(orgId, ministryId).then(r => { if (!failed(r) && r.call) apply(r.call); });
  }, [over, orgId, ministryId, stopMedia, apply]);

  const leave = () => { stopMedia(); void prayerCallApi.leave(orgId, ministryId); onClose(); };
  const toggleMic = () => {
    const on = !micOn; setMicOn(on);
    session.current?.setAudioEnabled(on);
    preview.current?.getAudioTracks().forEach(t => { t.enabled = on; });
  };
  const toggleCam = () => {
    const on = !camOn; setCamOn(on);
    session.current?.setVideoEnabled(on);
    preview.current?.getVideoTracks().forEach(t => { t.enabled = on; });
  };
  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setError('');
    const r = await fn();
    setBusy(false);
    if (failed(r)) setError(r.error); else if (r.call) apply(r.call);
    return r;
  };
  const endForAll = async () => { setConfirmEnd(false); await run(() => prayerCallApi.end(orgId, ministryId)); };
  const remove = async (uid: string) => { setMenuFor(null); await run(() => prayerCallApi.remove(orgId, ministryId, uid)); };
  const sendRequest = async () => {
    const text = draft.trim(); if (!text) return;
    const r = await run(() => prayerCallApi.addRequest(orgId, ministryId, text));
    if (!failed(r)) setDraft('');
  };

  // Tiles: me first, then everyone the server or the SFU says is here.
  const tiles = useMemo(() => {
    const ids = new Set<string>([...call.present.map(p => p.uid), ...Object.keys(remotes)]);
    ids.delete(me);
    const nameOf = (id: string) => names[id] || call.present.find(p => p.uid === id)?.name || 'Member';
    return [
      { id: me || 'me', self: true, name: 'You', stream: local },
      ...[...ids].map(id => ({ id, self: false, name: nameOf(id), stream: remotes[id] || null })),
    ];
  }, [call.present, remotes, names, local, me]);

  const cols = tiles.length <= 1 ? 'grid-cols-1' : tiles.length <= 4 ? 'grid-cols-2' : tiles.length <= 9 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3 sm:grid-cols-4';

  if (over) {
    const why = call.removed ? 'A leader removed you from this call.'
      : call.endReason === 'LEADER' ? 'A leader ended the call.'
      : 'The call reached its time limit and closed on its own.';
    return (
      <div className="fixed inset-0 z-[120] bg-[#07070c] text-white flex items-center justify-center p-6" role="dialog" aria-label="Prayer Call ended">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-amber-400/15 flex items-center justify-center"><HandHeart size={30} className="text-amber-300" /></div>
          <h2 className="text-2xl font-black" style={{ fontFamily: "'Outfit', sans-serif" }}>Amen.</h2>
          <p className="text-white/70 mt-2">This Prayer Call has ended. {why}</p>
          {call.requests.length > 0 && !call.removed && (
            <p className="text-white/45 text-sm mt-3">{call.requests.length} prayer request{call.requests.length === 1 ? '' : 's'} shared.</p>
          )}
          <button onClick={onClose} className="mt-7 h-11 px-6 rounded-full bg-white text-black text-sm font-bold">Back to {call.ministryName}</button>
        </div>
      </div>
    );
  }

  const requestPanel = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/10 shrink-0">
        <div className="text-sm font-bold flex items-center gap-2"><HandHeart size={16} className="text-amber-300" /> Prayer requests</div>
        <div className="flex items-center gap-1">
          {call.youLead && (
            <button onClick={() => run(() => prayerCallApi.toggleRequests(orgId, ministryId, !call.requestsOn))}
              className="text-[11px] px-2.5 h-7 rounded-full bg-white/[0.07] hover:bg-white/15 text-white/70">{call.requestsOn ? 'Turn off' : 'Turn on'}</button>
          )}
          <button onClick={() => setPanel(false)} className="lg:hidden w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center" aria-label="Close prayer requests"><X size={16} /></button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {call.requests.length === 0 && <p className="text-white/40 text-sm p-2">{call.requestsOn ? 'No requests yet. Share what you’d like the group to pray for.' : 'The leader turned the prayer list off.'}</p>}
        {call.requests.map(r => (
          <div key={r.id} className={`rounded-2xl p-3 bg-white/[0.05] ${r.prayed ? 'opacity-50' : ''}`}>
            <div className="text-[11px] text-white/45 mb-1 flex items-center gap-1.5">{r.name}{r.prayed && <span className="text-emerald-300 flex items-center gap-0.5"><Check size={11} /> prayed over</span>}</div>
            <div className="text-sm text-white/90 leading-snug">{r.text}</div>
            {(call.youLead || r.uid === me) && (
              <div className="flex gap-1.5 mt-2">
                {call.youLead && (
                  <button onClick={() => run(() => prayerCallApi.editRequest(orgId, ministryId, r.id, r.prayed ? 'unprayed' : 'prayed'))}
                    className="text-[11px] h-7 px-2.5 rounded-full bg-white/[0.07] hover:bg-white/15 flex items-center gap-1"><Check size={12} /> {r.prayed ? 'Undo' : 'Prayed'}</button>
                )}
                <button onClick={() => run(() => prayerCallApi.editRequest(orgId, ministryId, r.id, 'delete'))}
                  className="text-[11px] h-7 px-2.5 rounded-full bg-white/[0.07] hover:bg-white/15 flex items-center gap-1" aria-label="Remove request"><Trash2 size={12} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      {call.requestsOn && (
        <form className="p-3 border-t border-white/10 flex gap-2 shrink-0" onSubmit={e => { e.preventDefault(); void sendRequest(); }}>
          <input value={draft} onChange={e => setDraft(e.target.value)} maxLength={280} placeholder="Share a prayer request"
            className="flex-1 min-w-0 h-10 px-3.5 rounded-full bg-white/[0.07] border border-white/10 text-sm text-white placeholder:text-white/35 outline-none focus:border-amber-300/60" />
          <button disabled={busy || !draft.trim()} className="w-10 h-10 rounded-full bg-amber-300 text-black flex items-center justify-center disabled:opacity-40" aria-label="Share request"><Send size={15} /></button>
        </form>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] bg-[#07070c] text-white flex flex-col" role="dialog" aria-label={call.title} data-testid="prayer-call-room">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-3 sm:px-5 h-14 border-b border-white/10 shrink-0">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold truncate">{call.title}</div>
          <div className="text-[11px] text-white/45 truncate">{call.ministryName} · started by {call.startedByName}</div>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-[12px] text-white/55"><Users size={14} /> {tiles.length}</div>
        <div data-testid="prayer-call-countdown"
          className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-bold tabular-nums ${warn === 'final' ? 'bg-red-500 text-white animate-pulse' : warn === 'soon' ? 'bg-amber-400 text-black' : 'bg-white/[0.08] text-white/85'}`}
          title={`Ends at ${clockTime(call.endsAt)}`}>
          <Clock size={13} /> {formatLeft(left)}
        </div>
      </div>

      {warn !== 'none' && (
        <div role="alert" className={`px-4 py-2 text-[13px] font-semibold text-center shrink-0 ${warn === 'final' ? 'bg-red-500/90 text-white' : 'bg-amber-400/90 text-black'}`}>
          {warn === 'final' ? 'Less than a minute left. The call will close on its own.' : `${Math.ceil(left / 60_000)} minutes left. The call ends on its own at ${clockTime(call.endsAt)}.`}
        </div>
      )}
      {(mediaNote || error) && (
        <div className="px-4 py-2 text-[12px] text-center text-white/70 bg-white/[0.05] shrink-0">{error || mediaNote}</div>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* Grid */}
        <div className="flex-1 min-w-0 overflow-y-auto p-2 sm:p-4">
          {mode === 'connecting' && <div className="flex items-center justify-center gap-2 text-white/50 text-sm py-2"><Loader2 size={14} className="animate-spin" /> Connecting camera and audio…</div>}
          <div className={`grid gap-2 sm:gap-3 ${cols} content-start`}>
            {tiles.map(t => {
              const speaking = speakers.includes(t.self ? me : t.id);
              const showVideo = t.self ? camOn && hasVideo(t.stream) : hasVideo(t.stream);
              return (
                <div key={t.id} data-testid="prayer-call-tile"
                  className={`relative aspect-[4/3] rounded-2xl overflow-hidden bg-gradient-to-br from-[#1b1830] to-[#0e0d18] ${speaking ? 'ring-2 ring-amber-300' : 'ring-1 ring-white/10'}`}>
                  {showVideo && t.stream ? <StreamVideo stream={t.stream} mirror={t.self} /> : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-white/10 flex items-center justify-center text-lg sm:text-2xl font-bold text-white/80">{t.self ? <VideoOff size={22} className="text-white/50" /> : initials(t.name)}</div>
                    </div>
                  )}
                  {!t.self && t.stream && <StreamAudio stream={t.stream} />}
                  <div className="absolute left-2 bottom-2 right-2 flex items-center gap-1.5">
                    <span className="max-w-full truncate text-[11px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-black/55 backdrop-blur">{t.name}</span>
                    {t.self && !micOn && <span className="w-6 h-6 rounded-full bg-red-500/90 flex items-center justify-center shrink-0"><MicOff size={12} /></span>}
                  </div>
                  {call.youLead && !t.self && (
                    <div className="absolute right-1.5 top-1.5">
                      <button onClick={() => setMenuFor(menuFor === t.id ? null : t.id)} className="w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center" aria-label={`Options for ${t.name}`}><UserMinus size={14} /></button>
                      {menuFor === t.id && (
                        <button onClick={() => remove(t.id)} className="absolute right-0 mt-1 whitespace-nowrap h-9 px-3 rounded-xl bg-red-600 text-white text-xs font-bold shadow-xl">Remove {t.name.split(' ')[0]} from call</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Prayer list: side panel on desktop, bottom sheet on phones */}
        {call.requestsOn || call.requests.length || call.youLead ? (
          <>
            <aside className="hidden lg:flex w-80 border-l border-white/10 flex-col">{requestPanel}</aside>
            {panel && (
              <div className="lg:hidden fixed inset-x-0 bottom-0 z-[121] h-[70vh] rounded-t-3xl bg-[#121120] border-t border-white/10 shadow-2xl flex flex-col" data-testid="prayer-request-sheet">
                {requestPanel}
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Controls */}
      <div className="shrink-0 border-t border-white/10 px-3 py-3 flex items-center justify-center gap-2 sm:gap-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <button onClick={toggleMic} aria-pressed={!micOn} aria-label={micOn ? 'Mute' : 'Unmute'}
          className={`w-12 h-12 rounded-full flex items-center justify-center ${micOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500 text-white'}`}>{micOn ? <Mic size={20} /> : <MicOff size={20} />}</button>
        <button onClick={toggleCam} aria-pressed={!camOn} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
          className={`w-12 h-12 rounded-full flex items-center justify-center ${camOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500 text-white'}`}>{camOn ? <Video size={20} /> : <VideoOff size={20} />}</button>
        {(call.requestsOn || call.requests.length > 0 || call.youLead) && (
          <button onClick={() => setPanel(p => !p)} aria-label="Prayer requests"
            className="lg:hidden relative w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
            <HandHeart size={20} />
            {call.requests.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-amber-300 text-black text-[10px] font-bold flex items-center justify-center">{call.requests.length}</span>}
          </button>
        )}
        <button onClick={leave} className="h-12 px-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center gap-2 text-sm font-semibold"><PhoneOff size={18} /> Leave</button>
        {call.youLead && (confirmEnd ? (
          <div className="flex items-center gap-1.5">
            <button onClick={endForAll} disabled={busy} className="h-12 px-4 rounded-full bg-red-600 text-white text-sm font-bold">End for everyone</button>
            <button onClick={() => setConfirmEnd(false)} className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center" aria-label="Keep the call going"><X size={18} /></button>
          </div>
        ) : (
          <button onClick={() => setConfirmEnd(true)} className="h-12 px-4 rounded-full bg-red-600/90 hover:bg-red-600 text-white text-sm font-bold flex items-center gap-2"><Power size={16} /> <span className="hidden sm:inline">End call</span></button>
        ))}
      </div>
    </div>
  );
};

export default PrayerCallRoom;
