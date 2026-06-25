// MatchFanRoomsView — lists the World Cup matches (live first, then today's upcoming, then
// recently finished) and opens a live MatchFanRoom for any of them. Mirrors the
// list+detail shape of AthleteShowcaseView so App wiring stays to a single view.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Radio, Users, ChevronRight, Trophy } from 'lucide-react';
import { fetchWorldCupWindow } from '../services/sportsService';
import { resolveTeamCtx } from '../services/matchFanRoom';
import MatchFanRoom from './MatchFanRoom';

interface Props {
  currentUser?: { uid: string; displayName?: string | null; photoURL?: string | null } | null;
  onBack?: () => void;
}

const stateRank = (s?: string) => (s === 'in' ? 0 : s === 'pre' ? 1 : 2);

const MatchFanRoomsView: React.FC<Props> = ({ currentUser, onBack }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const evs = await fetchWorldCupWindow();
      evs.sort((a: any, b: any) => {
        const r = stateRank(a?.status?.type?.state) - stateRank(b?.status?.type?.state);
        return r !== 0 ? r : new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime();
      });
      setEvents(evs);
    } catch { /* keep prior */ }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  if (selected) return <MatchFanRoom match={selected} currentUser={currentUser} onBack={() => setSelected(null)} />;

  return (
    <div style={{ minHeight: '100%', background: '#0a0a0f', color: '#fff', padding: '22px 16px 60px', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {onBack && <button onClick={onBack} style={ghost}><ArrowLeft size={16} /> Back</button>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg,#FF8C00,#1f8f4e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trophy size={20} /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 23, fontWeight: 900 }}>Match Fan Rooms</h1>
            <p style={{ margin: '2px 0 0', color: '#9a9aa6', fontSize: 13 }}>Pick a side, watch it live, and out-poll the other fanbase.</p>
          </div>
        </div>

        {!loaded && <div style={{ color: '#777', marginTop: 30, textAlign: 'center' }}>Loading matches…</div>}
        {loaded && events.length === 0 && <div style={{ color: '#777', marginTop: 30, textAlign: 'center' }}>No World Cup matches in range right now. Check back near kickoff.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
          {events.map(ev => <MatchRow key={ev.id} ev={ev} onEnter={() => setSelected(ev)} />)}
        </div>
      </div>
    </div>
  );
};

const MatchRow: React.FC<{ ev: any; onEnter: () => void }> = ({ ev, onEnter }) => {
  const comp = ev?.competitions?.[0];
  const cs = comp?.competitors || [];
  const home = resolveTeamCtx('home', (cs.find((c: any) => c.homeAway === 'home') || cs[0])?.team || {});
  const away = resolveTeamCtx('away', (cs.find((c: any) => c.homeAway === 'away') || cs[1])?.team || {});
  const hs = (cs.find((c: any) => c.homeAway === 'home') || cs[0])?.score;
  const as = (cs.find((c: any) => c.homeAway === 'away') || cs[1])?.score;
  const state = ev?.status?.type?.state;
  const isLive = state === 'in';
  const detail = ev?.status?.type?.shortDetail || ev?.status?.type?.description || '';
  const time = state === 'pre' ? new Date(ev?.date || 0).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : detail;

  return (
    <button onClick={onEnter} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, background: '#101018', border: `1px solid ${isLive ? '#ff5a5a55' : '#20202c'}`, borderRadius: 14, padding: '14px 16px', color: '#fff' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Team t={home} score={hs} reveal={state !== 'pre'} align="right" />
        <div style={{ textAlign: 'center', minWidth: 56 }}>
          {isLive
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: '#ff5a5a' }}><Radio size={10} className="animate-pulse" /> LIVE</span>
            : <span style={{ fontSize: 11, color: '#9a9aa6' }}>vs</span>}
          <div style={{ fontSize: 10, color: '#777', marginTop: 3 }}>{time}</div>
        </div>
        <Team t={away} score={as} reveal={state !== 'pre'} align="left" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#FF8C00', fontSize: 12, fontWeight: 800, flex: '0 0 auto' }}>
        <Users size={13} /> Fan room <ChevronRight size={15} />
      </div>
    </button>
  );
};

const Team: React.FC<{ t: any; score?: any; reveal: boolean; align: 'left' | 'right' }> = ({ t, score, reveal, align }) => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
    {align === 'left' && <span style={{ fontSize: 22 }}>{t.flag}</span>}
    <span style={{ fontWeight: 800, fontSize: 14 }}>{t.short}</span>
    {reveal && <span style={{ fontWeight: 900, fontSize: 16, color: '#fff' }}>{Number(score ?? 0)}</span>}
    {align === 'right' && <span style={{ fontSize: 22 }}>{t.flag}</span>}
  </div>
);

const ghost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 };

export default MatchFanRoomsView;
