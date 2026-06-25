// MatchFanRoom — a live fan room for one actual World Cup match. On entry a fan declares
// which side they back; the room live-updates the score + play-by-play (ESPN), shows the
// fanbase split, runs roster-aware polls built to spark banter, and has live chat. Polls
// drip in over time and fire on goals to keep the chatter going.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Send, Radio, Users, BarChart3, MessageSquare } from 'lucide-react';
import { fetchWorldCupWindow, fetchSoccerSummary } from '../services/sportsService';
import {
  joinMatchRoom, setSupportedSide, subscribeMembers, sendMatchMessage, subscribeMatchChat,
  subscribeMatchPolls, voteMatchPoll, ensureMatchPolls, addNextPoll, resolveTeamCtx,
  RoomMember, RoomMessage, MatchPoll, TeamCtx, Side, MatchPhase,
} from '../services/matchFanRoom';

interface Props {
  match: any;                 // ESPN event
  currentUser?: { uid: string; displayName?: string | null; photoURL?: string | null } | null;
  onBack: () => void;
}

const phaseOf = (state?: string): MatchPhase => (state === 'in' ? 'live' : state === 'post' ? 'post' : 'pre');

function parseMatch(ev: any) {
  const comp = ev?.competitions?.[0];
  const cs = comp?.competitors || [];
  const home = cs.find((c: any) => c.homeAway === 'home') || cs[0];
  const away = cs.find((c: any) => c.homeAway === 'away') || cs[1];
  const state = ev?.status?.type?.state as string | undefined;
  return {
    home, away,
    homeScore: Number(home?.score ?? 0), awayScore: Number(away?.score ?? 0),
    state, phase: phaseOf(state),
    detail: ev?.status?.type?.shortDetail || ev?.status?.type?.description || '',
    venue: comp?.venue?.fullName || '',
  };
}

const norm = (s?: string) => (s || '').toUpperCase();
function eventMatchesTeams(ev: any, home: TeamCtx, away: TeamCtx): boolean {
  const abbrs = (ev?.competitions?.[0]?.competitors || []).map((c: any) => norm(c?.team?.abbreviation));
  return abbrs.includes(norm(home.short)) && abbrs.includes(norm(away.short));
}

const MatchFanRoom: React.FC<Props> = ({ match, currentUser, onBack }) => {
  const matchId = String(match?.id || '');
  const m0 = useMemo(() => parseMatch(match), [match]);
  const [live, setLive] = useState(m0);
  const home = useMemo<TeamCtx>(() => resolveTeamCtx('home', live.home?.team || {}), [live.home]);
  const away = useMemo<TeamCtx>(() => resolveTeamCtx('away', live.away?.team || {}), [live.away]);
  // Stable room key per fixture (team-pair) so the same match shares ONE room whether it's
  // opened from a live ESPN card or the (static-id) schedule. Falls back to the raw id if
  // a team can't be resolved to the WC26 roster.
  const roomKey = useMemo(() => (home.id && away.id ? `wc_${home.id}_${away.id}` : matchId), [home.id, away.id, matchId]);
  // The real ESPN event id (for live score + play-by-play). Resolved from the live window
  // by id or by team match — works even when the room was opened from a synthetic match.
  const [espnId, setEspnId] = useState<string | null>(matchId.startsWith('wc26_') ? null : matchId);

  const [members, setMembers] = useState<RoomMember[]>([]);
  const [chat, setChat] = useState<RoomMessage[]>([]);
  const [polls, setPolls] = useState<MatchPoll[]>([]);
  const [commentary, setCommentary] = useState<{ time: string; text: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useState<'chat' | 'polls'>('polls');
  const prevScore = useRef(`${m0.homeScore}-${m0.awayScore}`);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const me = members.find(x => x.uid === currentUser?.uid);
  const mySide = me?.side ?? null;

  // Join + seed polls + subscribe (keyed by the stable team-pair room key).
  useEffect(() => {
    if (!roomKey || !currentUser?.uid) return;
    joinMatchRoom(roomKey, currentUser, null).catch(() => {});
    ensureMatchPolls(roomKey, home, away, live.phase, 4).catch(() => {});
    const u1 = subscribeMembers(roomKey, setMembers);
    const u2 = subscribeMatchChat(roomKey, setChat);
    const u3 = subscribeMatchPolls(roomKey, setPolls);
    return () => { u1(); u2(); u3(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey, currentUser?.uid]);

  // Live poll: refresh score/status + play-by-play; goal → system msg + new poll. Resolves
  // the live ESPN event by id OR by team match, so it works even when this room was opened
  // from a synthetic (schedule) match with no ESPN id.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const events = await fetchWorldCupWindow();
        const ev = events.find((e: any) => (espnId && String(e.id) === espnId) || eventMatchesTeams(e, home, away));
        if (ev && alive) {
          if (String(ev.id) !== espnId) setEspnId(String(ev.id));
          const next = parseMatch(ev);
          setLive(next);
          const score = `${next.homeScore}-${next.awayScore}`;
          if (score !== prevScore.current) {
            const scored = next.homeScore + next.awayScore > m0.homeScore + m0.awayScore;
            prevScore.current = score;
            if (scored) {
              sendMatchMessage(roomKey, { uid: 'system', displayName: 'Match', text: `⚽ GOAL! ${next.home?.team?.displayName || home.name} ${next.homeScore} – ${next.awayScore} ${next.away?.team?.displayName || away.name}`, side: null }).catch(() => {});
              addNextPoll(roomKey, home, away, next.phase).catch(() => {});
            }
          }
          const c = await fetchSoccerSummary(String(ev.id));
          if (alive && c?.length) setCommentary(c);
        }
      } catch { /* keep prior */ }
    };
    tick();
    const id = setInterval(tick, 20_000);
    // drip a fresh poll every ~2 min to keep chatter alive
    const pid = setInterval(() => addNextPoll(roomKey, home, away, live.phase).catch(() => {}), 120_000);
    return () => { alive = false; clearInterval(id); clearInterval(pid); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey, home.id, away.id, espnId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.length]);

  const declare = (side: Side) => { if (currentUser?.uid) setSupportedSide(roomKey, currentUser.uid, side).catch(() => {}); };
  const send = () => {
    const t = draft.trim(); if (!t || !currentUser?.uid) return;
    sendMatchMessage(roomKey, { uid: currentUser.uid, displayName: currentUser.displayName || 'Fan', photoURL: currentUser.photoURL || null, text: t, side: mySide }).catch(() => {});
    setDraft('');
  };
  const vote = (poll: MatchPoll, idx: number) => { if (currentUser?.uid) voteMatchPoll(roomKey, poll.id, idx, currentUser.uid, mySide).catch(() => {}); };

  const homeFans = members.filter(x => x.side === 'home').length;
  const awayFans = members.filter(x => x.side === 'away').length;
  const isLive = live.phase === 'live';

  return (
    <div style={{ minHeight: '100%', background: '#0a0a0f', color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      {/* header / scoreboard */}
      <div style={{ position: 'relative', padding: '14px 16px 16px', background: `linear-gradient(135deg, ${home.color}cc, #0a0a0f 50%, ${away.color}cc)` }}>
        <button onClick={onBack} style={ghost}><ArrowLeft size={16} /> Matches</button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 8 }}>
          <TeamHead t={home} fans={homeFans} align="right" />
          <div style={{ textAlign: 'center', minWidth: 92 }}>
            <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{live.homeScore} <span style={{ color: '#888' }}>–</span> {live.awayScore}</div>
            <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, color: isLive ? '#ff5a5a' : '#cfcfd8', background: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: '3px 10px' }}>
              {isLive && <Radio size={11} className="animate-pulse" />} {live.detail || (live.phase === 'pre' ? 'Kickoff soon' : '')}
            </div>
          </div>
          <TeamHead t={away} fans={awayFans} align="left" />
        </div>
        {live.venue && <div style={{ textAlign: 'center', fontSize: 11, color: '#bcbcc6', marginTop: 8 }}>{live.venue}</div>}
      </div>

      {/* declare-your-team gate */}
      {currentUser?.uid && !mySide && (
        <div style={{ padding: '14px 16px', background: 'rgba(255,140,0,0.08)', borderBottom: '1px solid #1a1a24' }}>
          <div style={{ textAlign: 'center', fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>Who are you backing? Pick a side to join the room.</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <SideBtn t={home} onClick={() => declare('home')} />
            <SideBtn t={away} onClick={() => declare('away')} />
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1040, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 16 }}>
        {/* left: play-by-play */}
        <div style={{ background: '#101018', border: '1px solid #20202c', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 520 }}>
          <SectionHead icon={<Radio size={14} />} title="Play-by-play" />
          <div style={{ overflowY: 'auto', padding: '4px 12px 12px' }}>
            {commentary.length === 0 && <div style={{ color: '#777', fontSize: 12.5, padding: 12 }}>{isLive ? 'Waiting for the next moment…' : 'Commentary appears once the match is live.'}</div>}
            {commentary.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ flex: '0 0 38px', fontSize: 11, fontWeight: 800, color: '#FF8C00' }}>{c.time}</span>
                <span style={{ fontSize: 12.5, color: '#d8d8e0' }}>{c.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* right: polls / chat tabs */}
        <div style={{ background: '#101018', border: '1px solid #20202c', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 520 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #20202c' }}>
            <TabBtn active={tab === 'polls'} onClick={() => setTab('polls')} icon={<BarChart3 size={14} />} label={`Polls${polls.length ? ` · ${polls.length}` : ''}`} />
            <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')} icon={<MessageSquare size={14} />} label="Chat" />
          </div>

          {tab === 'polls' && (
            <div style={{ overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {polls.length === 0 && <div style={{ color: '#777', fontSize: 12.5 }}>Polls are warming up…</div>}
              {polls.map(p => <PollBlock key={p.id} poll={p} home={home} away={away} myUid={currentUser?.uid} onVote={(i) => vote(p, i)} />)}
            </div>
          )}

          {tab === 'chat' && (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {chat.map(msg => <ChatLine key={msg.id} msg={msg} home={home} away={away} mine={msg.uid === currentUser?.uid} />)}
                <div ref={chatEndRef} />
              </div>
              <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid #20202c' }}>
                <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
                  placeholder={mySide ? 'Talk trash (nicely)…' : 'Pick a side to chat'} disabled={!mySide}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid #2a2a38', background: '#0a0a0f', color: '#fff', fontSize: 13 }} />
                <button onClick={send} disabled={!mySide || !draft.trim()} style={{ padding: '0 14px', borderRadius: 9, border: 'none', background: draft.trim() && mySide ? '#FF8C00' : '#2a2a38', color: '#1a1a1a', cursor: 'pointer' }}><Send size={16} /></button>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', color: '#666', fontSize: 11, paddingBottom: 24 }}>
        <Users size={11} style={{ verticalAlign: 'middle' }} /> {members.length} in the room · {homeFans} {home.flag} vs {awayFans} {away.flag}
      </div>
    </div>
  );
};

// ── bits ─────────────────────────────────────────────────────────────────────
const TeamHead: React.FC<{ t: TeamCtx; fans: number; align: 'left' | 'right' }> = ({ t, fans, align }) => (
  <div style={{ textAlign: align, minWidth: 110 }}>
    <div style={{ fontSize: 30 }}>{t.flag}</div>
    <div style={{ fontSize: 14, fontWeight: 800 }}>{t.short}</div>
    <div style={{ fontSize: 10.5, color: '#cfcfd8' }}>{fans} fan{fans === 1 ? '' : 's'} here</div>
  </div>
);

const SideBtn: React.FC<{ t: TeamCtx; onClick: () => void }> = ({ t, onClick }) => (
  <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, border: `2px solid ${t.color}`, background: `${t.color}22`, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
    <span style={{ fontSize: 20 }}>{t.flag}</span> Back {t.short}
  </button>
);

const SectionHead: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 12px', borderBottom: '1px solid #20202c', fontSize: 12.5, fontWeight: 800, color: '#cfcfd8' }}>
    <span style={{ color: '#FF8C00' }}>{icon}</span> {title}
  </div>
);

const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', border: 'none', background: active ? 'rgba(255,140,0,0.12)' : 'transparent', color: active ? '#FF8C00' : '#9a9aa6', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', borderBottom: active ? '2px solid #FF8C00' : '2px solid transparent' }}>
    {icon} {label}
  </button>
);

const ChatLine: React.FC<{ msg: RoomMessage; home: TeamCtx; away: TeamCtx; mine: boolean }> = ({ msg, home, away, mine }) => {
  if (msg.uid === 'system') return <div style={{ textAlign: 'center', fontSize: 11.5, color: '#FF8C00', fontWeight: 700, padding: '4px 0' }}>{msg.text}</div>;
  const tint = msg.side === 'home' ? home.color : msg.side === 'away' ? away.color : '#888';
  const flag = msg.side === 'home' ? home.flag : msg.side === 'away' ? away.flag : '';
  return (
    <div style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
      <div style={{ fontSize: 10, color: '#8a8a96', marginBottom: 2, display: 'flex', gap: 4 }}><span>{flag}</span><span style={{ color: tint, fontWeight: 700 }}>{msg.displayName}</span></div>
      <div style={{ background: mine ? '#FF8C00' : '#1a1a24', color: mine ? '#1a1a1a' : '#e8e8ee', borderRadius: 10, padding: '7px 11px', fontSize: 13, borderLeft: `3px solid ${tint}` }}>{msg.text}</div>
    </div>
  );
};

const PollBlock: React.FC<{ poll: MatchPoll; home: TeamCtx; away: TeamCtx; myUid?: string; onVote: (i: number) => void }> = ({ poll, home, away, myUid, onVote }) => {
  const votes = poll.votes || {};
  const counts = poll.options.map((_, i) => (votes[String(i)] || []).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const myVote = poll.options.findIndex((_, i) => (votes[String(i)] || []).includes(myUid || ''));
  const voted = myVote >= 0;
  return (
    <div style={{ background: '#15151f', border: '1px solid #24242e', borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800 }}>{poll.question}</div>
      {poll.hint && <div style={{ fontSize: 11, color: '#8a8a96', marginTop: 2 }}>{poll.hint}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
        {poll.options.map((opt, i) => {
          const pct = total ? Math.round((counts[i] / total) * 100) : 0;
          const tint = opt.sideTag === 'home' ? home.color : opt.sideTag === 'away' ? away.color : '#7a7a86';
          const mine = myVote === i;
          return (
            <button key={i} onClick={() => !voted && onVote(i)} disabled={voted}
              style={{ position: 'relative', textAlign: 'left', padding: '9px 11px', borderRadius: 9, border: `1px solid ${mine ? tint : 'rgba(255,255,255,0.08)'}`, background: '#0e0e16', color: '#fff', cursor: voted ? 'default' : 'pointer', overflow: 'hidden' }}>
              {voted && <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: `${tint}33`, transition: 'width .4s' }} />}
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: mine ? 800 : 600 }}>
                <span>{opt.label}</span>
                {voted && <span style={{ color: '#cfcfd8' }}>{pct}%</span>}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: '#777', marginTop: 8 }}>{total} vote{total === 1 ? '' : 's'}{voted ? '' : ' · tap to vote'}</div>
    </div>
  );
};

const ghost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 };

export default MatchFanRoom;
