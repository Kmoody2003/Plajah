// AthleteShowcaseView — a public showcase of the ATHLETE account type. Lists the four
// labeled DEMO ATHLETE accounts (HS basketball, girls volleyball, football, girls
// soccer); selecting one opens their full Athlete profile: the State Card, a Highlights
// & game-photos section, and a verified on-chain Achievements timeline. This is what a
// real Athlete account renders, populated with demo data so anyone can see it.

import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, BadgeCheck, Trophy, Camera, Play, ExternalLink, Clock } from 'lucide-react';
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
  return (
    <div style={{ minHeight: '100%', background: '#0a0a0f', color: '#fff', padding: '20px 18px 70px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <button onClick={onBack} style={ghostBtn}><ArrowLeft size={16} /> All athletes</button>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) 1fr', gap: 28, marginTop: 16, alignItems: 'start' }}>
          {/* left: State Card */}
          <div style={{ position: 'sticky', top: 16 }}>
            <StateCard data={toStateCard(a)} sportKey={a.sport} />
            <p style={{ fontSize: 11, color: '#777', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>{a.bio}</p>
          </div>

          {/* right: highlights + achievements */}
          <div>
            {/* Highlights & game photos */}
            <Section icon={<Camera size={16} />} title="Highlights & game photos" accent={a.accent} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
              {a.highlights.map(h => <HighlightTile key={h.id} h={h} sport={a.sport} />)}
            </div>

            {/* Achievements timeline */}
            <Section icon={<Trophy size={16} />} title="Achievements — verified & minted" accent={a.accent}
              note="Each play is corroborated from game data sources before it's minted to the chain." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {a.achievements.map(ac => <AchievementRow key={ac.id} a={ac} accent={a.accent} />)}
            </div>
          </div>
        </div>
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
