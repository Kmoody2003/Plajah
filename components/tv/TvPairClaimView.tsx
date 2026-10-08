// TvPairClaimView — the phone / console side of TV pairing (?tvPair=CODE, or a code typed in).
//
// Claims the TV's code, then offers what to show on it: a live program stream of mine, a party I
// host, my Ambo event (same account only — Ambo duties read the TV account's own session), signage,
// or standby. Same-account TVs write straight to the device doc; other accounts go through the
// pairing doc (services/tv/tvReceiverService).

import React, { useEffect, useState } from 'react';
import { Tv, Radio, PartyPopper, Megaphone, Square, X } from 'lucide-react';
import { auth } from '../../services/backendService';
import {
  lookupTvPairing, claimTvPairing, sendDutyToTv, fetchJoinableSessions, fetchMyLiveStreams,
  programFeedDuty, signageDuty, STANDBY_DUTY,
  type TvPairing, type TvTarget, type JoinableSession,
} from '../../services/tv/tvReceiverService';
import type { EventDeviceDuty } from '../../services/ambo/amboPartyEventService';

const TvPairClaimView: React.FC<{ code?: string | null; onClose: () => void }> = ({ code: initial, onClose }) => {
  const [code, setCode] = useState((initial || '').toUpperCase());
  const [pairing, setPairing] = useState<TvPairing | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [streams, setStreams] = useState<Array<{ streamId: string; title: string }>>([]);
  const [sessions, setSessions] = useState<JoinableSession[]>([]);
  const [headline, setHeadline] = useState('Welcome');

  const claim = async (c: string) => {
    setErr(null); setBusy(true);
    try {
      if (!auth.currentUser) throw new Error('Sign in to pair a TV.');
      setPairing(await claimTvPairing(c));
    } catch (e: any) { setErr(e?.message || 'Pairing failed.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (initial && initial.length === 6) void claim(initial.toUpperCase()); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (!pairing) return;
    fetchMyLiveStreams().then(setStreams);
    fetchJoinableSessions().then(list => setSessions(
      pairing.uid === auth.currentUser?.uid ? list : list.filter(s => s.kind === 'PARTY'),
    ));
  }, [pairing]);

  const target: TvTarget | null = pairing
    ? (pairing.uid === auth.currentUser?.uid
      ? { kind: 'own', deviceId: pairing.deviceId, name: pairing.deviceName, online: true }
      : { kind: 'paired', code: pairing.code, deviceId: pairing.deviceId, name: pairing.deviceName, online: true })
    : null;

  const send = async (duty: EventDeviceDuty, label: string) => {
    if (!target) return;
    setErr(null); setMsg(null); setBusy(true);
    try { await sendDutyToTv(target, duty); setMsg(`Sent: ${label}`); }
    catch (e: any) { setErr(e?.message || 'Could not reach the TV.'); }
    finally { setBusy(false); }
  };

  const Btn: React.FC<{ icon: React.ReactNode; label: string; sub?: string; onClick: () => void }> = ({ icon, label, sub, onClick }) => (
    <button onClick={onClick} disabled={busy}
      className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/10 hover:bg-white/10 disabled:opacity-50">
      {icon}
      <span className="min-w-0"><span className="block font-bold truncate">{label}</span>{sub && <span className="block text-xs text-white/45 truncate">{sub}</span>}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[200] bg-[#08080c] text-white overflow-y-auto">
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2"><Tv size={20} className="text-[#00DAF3]" /><span className="text-lg font-black">Pair a TV</span></div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-white/10"><X size={16} /></button>
        </div>

        {!pairing ? (
          <div className="space-y-3">
            <p className="text-sm text-white/55">Enter the 6-character code shown on the TV (Settings → Use this TV as a display).</p>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={6}
              className="w-full bg-white/[0.05] border border-white/15 rounded-2xl px-4 py-4 text-3xl font-mono tracking-[0.3em] text-center outline-none focus:border-white/40" placeholder="CODE" />
            <button onClick={() => claim(code)} disabled={code.length !== 6 || busy}
              className="w-full py-3 rounded-2xl bg-white text-black font-black disabled:opacity-40">{busy ? 'Pairing…' : 'Pair'}</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-white/55 mb-2">Paired with <span className="text-white font-bold">{pairing.deviceName}</span>. What should it show?</div>
            {streams.map(s => (
              <Btn key={s.streamId} icon={<Radio size={18} className="text-red-400" />} label={`Program: ${s.title}`} sub="Your live stream"
                onClick={() => send(programFeedDuty(s.streamId, s.title, auth.currentUser?.displayName || s.title), s.title)} />
            ))}
            {sessions.map(s => (
              <Btn key={s.id} icon={s.kind === 'PARTY' ? <PartyPopper size={18} /> : <Radio size={18} />} label={s.title} sub={s.subtitle}
                onClick={() => send(s.duty, s.title)} />
            ))}
            <div className="flex gap-2">
              <input value={headline} onChange={e => setHeadline(e.target.value)} className="flex-1 bg-white/[0.05] border border-white/12 rounded-2xl px-3 py-3 text-sm outline-none" />
              <button onClick={() => send(signageDuty({ headline, title: 'Signage' }), 'Signage')} disabled={busy}
                className="flex items-center gap-1.5 px-4 rounded-2xl bg-white/10 font-bold text-sm"><Megaphone size={15} /> Signage</button>
            </div>
            <Btn icon={<Square size={16} />} label="Standby" sub="Stop showing anything" onClick={() => send(STANDBY_DUTY, 'Standby')} />
          </div>
        )}
        {msg && <p className="mt-4 text-sm text-emerald-400">{msg}</p>}
        {err && <p className="mt-4 text-sm text-red-400">{err}</p>}
      </div>
    </div>
  );
};

export default TvPairClaimView;
