// AthleteShowcaseView — a public showcase of the ATHLETE account type. Lists the four
// labeled DEMO ATHLETE accounts (HS basketball, girls volleyball, football, girls
// soccer); selecting one opens their full Athlete profile: the State Card, a Highlights
// & game-photos section, and a verified on-chain Achievements timeline. This is what a
// real Athlete account renders, populated with demo data so anyone can see it.

import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, BadgeCheck, Trophy, Camera, Play, ExternalLink, Clock, UserPlus, MessageSquare, Users, CheckCircle2 } from 'lucide-react';
import StateCard, { StateCardData } from './StateCard';
import { DEMO_ATHLETES, DemoAthlete, DemoAchievement, DemoHighlight } from '../data/demoAthletes';

const SPORT_ICON: Record<string, string> = { BASKETBALL: '🏀', VOLLEYBALL: '🏐', FOOTBALL: '🏈', SOCCER: '⚽' };

function toStateCard(a: DemoAthlete): StateCardData {
  return {
    name: a.name, handle: a.handle, sportLabel: a.sportLabel, position: a.position, jersey: a.jersey,
    school: a.school, city: a.city, state: a.state, classYear: a.classYear, heightWeight: a.heightWeight,
    gpa: a.gpa, accent: a.accent, accent2: a.accent2, verified: a.verified, isDemo: a.isDemo,
    stats: a.stats, mintedCount: a.achievements.filter(x => x.status === 'minted').length,
    badges: a.achievements.slice(0, 5).map(x => ({ badge: x.badge, title: x.title, status: x.status })),
  };
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const AthleteShowcaseView: React.FC<{ onBack?: () => void; initialId?: string }> = ({ onBack, initialId }) => {
  const [selectedId, setSelectedId] = useState<string | null>(initialId || null);
  const athlete = selectedId ? DEMO_ATHLETES.find(a => a.id === selectedId) : null;

  if (athlete) return <AthleteProfile athlete={athlete} onBack={() => setSelectedId(null)} />;

  return (
    <div style={{ minHeight: '100%', background: '#0a0a0f', color: '#fff', padding: '24px 18px 60px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        {onBack && (
          <button onClick={onBack} style={ghostBtn}><ArrowLeft size={16} /> Back</button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg,#FF8C00,#7a2bd6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trophy size={20} /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: -0.5 }}>Athlete Accounts</h1>
            <p style={{ margin: '2px 0 0', color: '#9a9aa6', fontSize: 13 }}>Chain-native player profiles — every big play verified from game data, then minted to a record that follows the athlete.</p>
          </div>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, background: 'rgba(255,210,74,0.1)', border: '1px solid rgba(255,210,74,0.3)', color: '#FFD24A', borderRadius: 20, padding: '5px 12px', fontSize: 11.5, fontWeight: 700 }}>
          <BadgeCheck size={14} /> These are labeled DEMO athlete accounts — sample data so you can explore the experience.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16, marginTop: 22 }}>
          {DEMO_ATHLETES.map(a => (
            <button key={a.id} onClick={() => setSelectedId(a.id)}
              style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 16, overflow: 'hidden', border: `1px solid ${a.accent}44`, background: '#12121a', padding: 0, color: '#fff' }}>
              <div style={{ height: 96, background: `radial-gradient(120% 100% at 50% 0%, ${a.accent}55, transparent 70%), linear-gradient(135deg, ${a.accent}, ${a.accent2})`, position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 54, opacity: 0.35 }}>{SPORT_ICON[a.sport]}</div>
                <div style={{ position: 'absolute', top: 8, left: 10, fontSize: 28, fontWeight: 900, textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>#{a.jersey}</div>
                <div style={{ position: 'absolute', top: 9, right: -30, transform: 'rotate(38deg)', background: '#111', color: '#FFD24A', fontSize: 8, fontWeight: 900, letterSpacing: 1.2, padding: '3px 36px' }}>DEMO</div>
              </div>
              <div style={{ padding: '10px 12px 12px' }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{a.name}</div>
                <div style={{ fontSize: 11.5, color: '#9a9aa6', marginTop: 1 }}>{a.position} · {a.sportLabel}</div>
                <div style={{ fontSize: 11, color: '#cfcfd8', marginTop: 6 }}>{a.school} · {a.state}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 10.5, color: a.accent, fontWeight: 700 }}>
                  <ShieldCheck size={12} /> {a.achievements.filter(x => x.status === 'minted').length} verified on-chain
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const AthleteProfile: React.FC<{ athlete: DemoAthlete; onBack: () => void }> = ({ athlete: a, onBack }) => {
  const [tab, setTab] = useState<'FEED' | 'ATHLETE'>('FEED');
  const [followed, setFollowed] = useState(false);

  // Demo follower counts seeded from jersey number for variety
  const followers = 1200 + a.jersey * 47;
  const following = 180 + a.jersey * 11;

  return (
    <div style={{ minHeight: '100%', background: '#0a0a0f', color: '#fff', paddingBottom: 80 }}>
      {/* ── Profile Header ── */}
      <div style={{ position: 'relative', height: 180, background: `linear-gradient(150deg, ${a.accent}, ${a.accent2})`, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 120, opacity: 0.12 }}>
          {SPORT_ICON[a.sport]}
        </div>
        <button onClick={onBack} style={{ position: 'absolute', top: 16, left: 16, ...ghostBtn }}><ArrowLeft size={15} /> Back</button>
        {a.isDemo && (
          <div style={{ position: 'absolute', top: 16, right: 16, background: '#111', color: '#FFD24A', fontSize: 9, fontWeight: 900, letterSpacing: 1.5, padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(255,210,74,0.4)' }}>DEMO ACCOUNT</div>
        )}
      </div>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 18px' }}>
        {/* Avatar + action row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -44, marginBottom: 12 }}>
          <div style={{ width: 88, height: 88, borderRadius: 22, border: '3px solid #0a0a0f', background: `linear-gradient(135deg, ${a.accent}, ${a.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 900, boxShadow: `0 0 24px ${a.accent}55` }}>
            {a.name.charAt(0)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setFollowed(f => !f)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 20, border: `1px solid ${followed ? 'rgba(255,255,255,0.15)' : a.accent}`, background: followed ? 'rgba(255,255,255,0.06)' : a.accent, color: '#fff', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
              {followed ? <><Users size={13} /> Following</> : <><UserPlus size={13} /> Follow</>}
            </button>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#bbb', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
              <MessageSquare size={13} /> Message
            </button>
          </div>
        </div>

        {/* Name + handle + badges */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>{a.name}</span>
            {a.verified && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${a.accent}22`, border: `1px solid ${a.accent}55`, color: a.accent, fontSize: 9.5, fontWeight: 800, borderRadius: 20, padding: '2px 8px' }}>
                <CheckCircle2 size={11} /> Verified Athlete
              </span>
            )}
          </div>
          <div style={{ color: '#7a7a8a', fontSize: 13.5, marginTop: 2 }}>{a.handle}</div>
        </div>

        {/* Bio */}
        <p style={{ fontSize: 13, color: '#b0b0be', lineHeight: 1.55, marginBottom: 12, maxWidth: 480 }}>{a.bio}</p>

        {/* School + sport meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14, fontSize: 12, color: '#8a8a96' }}>
          <span>{SPORT_ICON[a.sport]} {a.sportLabel} · #{a.jersey}</span>
          <span>🏫 {a.school}, {a.state}</span>
          <span>🎓 Class of {a.classYear}</span>
        </div>

        {/* Follower stats */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
          {[
            { label: 'Followers', value: followers.toLocaleString() },
            { label: 'Following', value: following.toString() },
            { label: 'Highlights', value: a.highlights.length.toString() },
            { label: 'On-chain', value: a.achievements.filter(x => x.status === 'minted').length.toString() },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#6a6a7a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Profile tab row ── */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
          {(['FEED', 'ATHLETE'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 18px', fontSize: 10.5, fontWeight: 900, letterSpacing: 1.4, textTransform: 'uppercase',
              color: tab === t ? a.accent : '#5a5a6a', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t ? a.accent : 'transparent'}`,
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {t === 'ATHLETE' ? '🏆 Athlete' : 'Feed'}
            </button>
          ))}
        </div>

        {/* ── Feed tab (demo) ── */}
        {tab === 'FEED' && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#4a4a5a' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{SPORT_ICON[a.sport]}</div>
            <p style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>No posts yet</p>
            <p style={{ fontSize: 12, color: '#3a3a4a' }}>This is a demo account. A real athlete account would show their posts, clips, and updates here.</p>
          </div>
        )}

        {/* ── Athlete Stats tab ── */}
        {tab === 'ATHLETE' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 28, alignItems: 'start' }}>
            {/* left: State Card */}
            <div style={{ position: 'sticky', top: 16 }}>
              <StateCard data={toStateCard(a)} sportKey={a.sport} />
            </div>

            {/* right: highlights + achievements */}
            <div>
              <Section icon={<Camera size={16} />} title="Highlights & game photos" accent={a.accent} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
                {a.highlights.map(h => <HighlightTile key={h.id} h={h} sport={a.sport} />)}
              </div>
              <Section icon={<Trophy size={16} />} title="Achievements — verified & minted" accent={a.accent}
                note="Each play is corroborated from game data sources before it's minted to the chain." />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {a.achievements.map(ac => <AchievementRow key={ac.id} a={ac} accent={a.accent} />)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Section: React.FC<{ icon: React.ReactNode; title: string; accent: string; note?: string }> = ({ icon, title, accent, note }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: accent }}>{icon}</span>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2>
    </div>
    {note && <p style={{ margin: '4px 0 0 24px', fontSize: 11.5, color: '#8a8a96' }}>{note}</p>}
  </div>
);

const HighlightTile: React.FC<{ h: DemoHighlight; sport: string }> = ({ h, sport }) => (
  <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: '#12121a' }}>
    <div style={{ position: 'relative', aspectRatio: '4/3', background: `radial-gradient(120% 100% at 50% 30%, ${h.accent}66, transparent 70%), linear-gradient(150deg, ${h.accent}, #0d0d14)` }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: 0.4 }}>{SPORT_ICON[sport] || '🏅'}</div>
      {h.kind === 'clip' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={16} fill="#fff" /></div>
        </div>
      )}
      {h.scoreline && <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.45)', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 800 }}>{h.scoreline}</div>}
    </div>
    <div style={{ padding: '8px 10px', fontSize: 11.5, color: '#d8d8e0', fontWeight: 600 }}>{h.caption}</div>
  </div>
);

const AchievementRow: React.FC<{ a: DemoAchievement; accent: string }> = ({ a, accent }) => {
  const minted = a.status === 'minted';
  return (
    <div style={{ display: 'flex', gap: 12, background: '#12121a', border: `1px solid ${minted ? accent + '40' : 'rgba(255,255,255,0.07)'}`, borderRadius: 13, padding: 13 }}>
      <div style={{ fontSize: 26, lineHeight: 1, flex: '0 0 auto' }}>{a.badge}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>{a.title}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 8px',
            background: minted ? `${accent}22` : a.status === 'verified' ? 'rgba(80,200,120,0.14)' : 'rgba(255,255,255,0.06)',
            color: minted ? accent : a.status === 'verified' ? '#5fd17f' : '#9a9aa6' }}>
            {minted ? <ShieldCheck size={11} /> : a.status === 'verified' ? <BadgeCheck size={11} /> : <Clock size={11} />}
            {minted ? 'Verified · On-chain' : a.status === 'verified' ? 'Verified' : 'Pending'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#bcbcc6', marginTop: 3 }}>{a.description}</div>
        <div style={{ fontSize: 11, color: '#8a8a96', marginTop: 5 }}>{a.gameLabel} · {fmtDate(a.occurredAt)}</div>

        {/* verification provenance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <span style={{ fontSize: 10, color: '#777', fontWeight: 700 }}>Verified from {a.sources.length} source{a.sources.length > 1 ? 's' : ''}:</span>
          {a.sources.map((s, i) => (
            <span key={i} style={{ fontSize: 10, color: '#cfcfd8', background: 'rgba(255,255,255,0.05)', borderRadius: 5, padding: '2px 6px' }}>{s.label}</span>
          ))}
          <span style={{ fontSize: 10, color: '#777' }}>· {Math.round(a.confidence * 100)}% confidence</span>
          {a.explorerUrl && <a href={a.explorerUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: accent, fontWeight: 700, textDecoration: 'none' }}><ExternalLink size={10} /> chain</a>}
        </div>
      </div>
    </div>
  );
};

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#bbb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600,
};

export default AthleteShowcaseView;
