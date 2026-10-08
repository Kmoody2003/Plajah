// TvSendTargets — controller-side "Send to TV" list (Video Switcher, Ambo, any program surface).
//
// Lists the TVs this account can drive (own TV receivers live from the event-device mesh, plus
// TVs on other accounts paired by code) and sends them a duty. "Show program" needs a Plajah live
// streamId — the switcher's STREAM output when it is on air; `ensureStreamId` lets the host surface
// start an unlisted program stream on demand.

import React, { useEffect, useState } from 'react';
import { Tv, Send, Square, KeyRound } from 'lucide-react';
import {
  listenToMyTvTargets, sendDutyToTv, programFeedDuty, claimTvPairing, STANDBY_DUTY,
  type TvTarget,
} from '../../services/tv/tvReceiverService';
import { auth } from '../../services/backendService';

export interface TvSendTargetsProps {
  /** Current program streamId (Plajah live), if on air. */
  streamId?: string | null;
  /** Start a program stream when none is on air; resolves the new streamId (or null on failure). */
  ensureStreamId?: () => Promise<string | null>;
  /** Shown on the TV badge: "Receiving from <label>". */
  sourceLabel?: string;
  compact?: boolean;
}

const TvSendTargets: React.FC<TvSendTargetsProps> = ({ streamId, ensureStreamId, sourceLabel = 'Video Switcher', compact }) => {
  const [targets, setTargets] = useState<TvTarget[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [pairOpen, setPairOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(!!auth.currentUser);

  useEffect(() => auth.onAuthStateChanged(u => setSignedIn(!!u)), []);
  useEffect(() => (signedIn ? listenToMyTvTargets(setTargets) : undefined), [signedIn]);

  const keyOf = (t: TvTarget) => (t.kind === 'own' ? t.deviceId : `p_${t.code}`);

  const showProgram = async (t: TvTarget) => {
    setErr(null); setBusy(keyOf(t));
    try {
      let id = streamId || null;
      if (!id && ensureStreamId) id = await ensureStreamId();
      if (!id) throw new Error('Go live on Plajah first — the TV plays the program stream.');
      await sendDutyToTv(t, programFeedDuty(id, `${sourceLabel} program`, sourceLabel));
    } catch (e: any) { setErr(e?.message || 'Could not send to the TV.'); }
    finally { setBusy(null); }
  };

  const stop = async (t: TvTarget) => {
    setErr(null); setBusy(keyOf(t));
    try { await sendDutyToTv(t, STANDBY_DUTY); } catch (e: any) { setErr(e?.message || 'Could not reach the TV.'); }
    finally { setBusy(null); }
  };

  const pair = async () => {
    setErr(null);
    try { await claimTvPairing(code); setCode(''); setPairOpen(false); }
    catch (e: any) { setErr(e?.message || 'Pairing failed.'); }
  };

  if (!signedIn) return null;

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.02] ${compact ? 'p-3' : 'p-4'} space-y-2.5`}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Send to TV</span>
        <button onClick={() => setPairOpen(o => !o)} className="flex items-center gap-1 text-[10px] font-bold text-white/60 hover:text-white">
          <KeyRound size={11} /> Pair by code
        </button>
      </div>

      {pairOpen && (
        <div className="flex gap-2">
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="TV code"
            className="flex-1 bg-white/[0.05] border border-white/12 rounded-xl px-3 py-2 text-[12px] font-mono tracking-widest outline-none focus:border-white/30" />
          <button onClick={pair} disabled={code.length !== 6} className="px-3 py-2 rounded-xl bg-white text-black text-[11px] font-bold disabled:opacity-40">Pair</button>
        </div>
      )}

      {targets.length === 0 ? (
        <p className="text-[10px] text-white/35">No TVs yet. Open Plajah on a TV signed in to this account (Settings → Use this TV as a display), or pair one by its on-screen code.</p>
      ) : targets.map(t => {
        const k = keyOf(t);
        const receiving = t.duty && t.duty.dutyType !== 'STANDBY';
        return (
          <div key={k} className="flex items-center gap-2 text-[11px]">
            <span className={`w-1.5 h-1.5 rounded-full ${t.online ? 'bg-emerald-400' : 'bg-white/20'}`} />
            <Tv size={13} className="text-[#00DAF3] shrink-0" />
            <span className="font-semibold truncate">{t.name}</span>
            <span className="text-white/35 truncate">{receiving ? t.duty!.title : 'Standby'}{t.kind === 'paired' ? ' · paired' : ''}</span>
            <div className="flex-1" />
            <button onClick={() => showProgram(t)} disabled={busy === k || !t.online}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.08] border border-white/12 font-bold hover:bg-white/15 disabled:opacity-40">
              <Send size={11} /> Show program
            </button>
            {receiving && (
              <button onClick={() => stop(t)} disabled={busy === k}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/12 font-bold text-white/70 hover:bg-white/10 disabled:opacity-40">
                <Square size={10} /> Stop
              </button>
            )}
          </div>
        );
      })}
      {err && <p className="text-[10px] text-red-400">{err}</p>}
    </div>
  );
};

export default TvSendTargets;
