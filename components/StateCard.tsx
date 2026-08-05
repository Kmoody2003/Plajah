// StateCard — an athlete's official, shareable player card (the "State Card"). A
// trading-card / verified-ID style artifact that travels with the athlete: photo,
// school + state + class, position/jersey, headline verified stats, the achievement
// badges that follow them, and a "verified on-chain" seal. Exports to PNG so it can be
// shared anywhere. Works for both demo athletes and real Athlete accounts.

import React, { useRef, useState } from 'react';
import { BadgeCheck, Download, Share2, Link2, ShieldCheck } from 'lucide-react';

export interface StateCardStat { label: string; value: string; }
export interface StateCardBadge { badge: string; title: string; status?: 'minted' | 'verified' | 'pending'; }

export interface StateCardData {
  name: string;
  handle?: string;
  sportLabel: string;          // "Boys Basketball"
  position: string;
  jersey: number;
  school: string;
  city?: string;
  state: string;               // 2-letter
  classYear: number;
  heightWeight?: string;
  gpa?: number;
  accent: string;
  accent2?: string;
  verified?: boolean;
  isDemo?: boolean;
  photoUrl?: string;
  stats: StateCardStat[];
  badges?: StateCardBadge[];
  mintedCount?: number;        // # of on-chain achievements
}

const SPORT_ICON: Record<string, string> = {
  BASKETBALL: '🏀', VOLLEYBALL: '🏐', FOOTBALL: '🏈', SOCCER: '⚽', BASEBALL: '⚾', TRACK: '🏃', OTHER: '🏅',
};

const StateCard: React.FC<{ data: StateCardData; sportKey?: string; compact?: boolean }> = ({ data, sportKey, compact }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const accent2 = data.accent2 || data.accent;
  const icon = SPORT_ICON[sportKey || ''] || '🏅';

  const exportPng = async () => {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: null, useCORS: true });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${data.name.replace(/\s+/g, '_')}_state_card.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { console.warn('[StateCard] export failed', e); }
    finally { setBusy(false); }
  };

  const share = async () => {
    const text = `${data.name} — ${data.sportLabel} · ${data.school} (${data.state}) · Class of ${data.classYear}`;
    try {
      if (navigator.share) await navigator.share({ title: `${data.name} — Plajah State Card`, text });
      else { await navigator.clipboard.writeText(text); }
    } catch { /* cancelled */ }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div
        ref={cardRef}
        style={{
          width: compact ? 300 : 340, borderRadius: 20, overflow: 'hidden', position: 'relative',
          background: `linear-gradient(160deg, #0d0d14 0%, #15151f 60%, #0d0d14 100%)`,
          border: `1px solid ${data.accent}55`, boxShadow: `0 24px 70px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.03)`,
          color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        }}
      >
        {/* glow header / photo zone */}
        <div style={{ position: 'relative', height: compact ? 150 : 176, background: `radial-gradient(120% 90% at 50% 0%, ${data.accent}40, transparent 70%), linear-gradient(135deg, ${data.accent}, ${accent2})` }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.18, fontSize: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
          {data.photoUrl
            ? <img src={data.photoUrl} alt="" crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : null}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0d0d14 4%, transparent 55%)' }} />

          {/* jersey number */}
          <div style={{ position: 'absolute', top: 10, left: 14, fontSize: 46, fontWeight: 900, lineHeight: 1, color: 'rgba(255,255,255,0.92)', textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>#{data.jersey}</div>

          {/* demo ribbon */}
          {data.isDemo && (
            <div style={{ position: 'absolute', top: 12, right: -34, transform: 'rotate(38deg)', background: '#111', color: '#FFD24A', fontSize: 9.5, fontWeight: 900, letterSpacing: 1.5, padding: '4px 40px', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>DEMO</div>
          )}

          {/* verified seal */}
          {data.verified && !data.isDemo && (
            <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 20, padding: '3px 9px', fontSize: 10, fontWeight: 700 }}>
              <BadgeCheck size={13} /> Verified
            </div>
          )}

          {/* name block */}
          <div style={{ position: 'absolute', bottom: 10, left: 14, right: 14 }}>
            <div style={{ fontSize: compact ? 20 : 23, fontWeight: 900, letterSpacing: -0.4, lineHeight: 1.05 }}>{data.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2, fontWeight: 600 }}>{data.position} · {data.sportLabel}</div>
          </div>
        </div>

        {/* body */}
        <div style={{ padding: '12px 14px 14px' }}>
          {/* school / state / class */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#cfcfd8' }}>
            <span style={{ fontWeight: 700, color: '#fff' }}>{data.school}</span>
            <span style={{ background: `${data.accent}26`, color: data.accent, borderRadius: 6, padding: '2px 7px', fontWeight: 800, fontSize: 10 }}>{data.state} · ’{String(data.classYear).slice(2)}</span>
          </div>
          {(data.heightWeight || data.gpa != null) && (
            <div style={{ marginTop: 4, fontSize: 10, color: '#9a9aa6' }}>
              {data.heightWeight}{data.heightWeight && data.gpa != null ? '  ·  ' : ''}{data.gpa != null ? `GPA ${data.gpa.toFixed(1)}` : ''}
            </div>
          )}

          {/* stats */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, data.stats.length)}, 1fr)`, gap: 6, margin: '12px 0' }}>
            {data.stats.slice(0, 4).map((s, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 8.5, color: '#9a9aa6', marginTop: 3, fontWeight: 700, letterSpacing: 0.5 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* achievement badges that follow them */}
          {data.badges && data.badges.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {data.badges.slice(0, 5).map((b, i) => (
                <div key={i} title={b.title} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', border: `1px solid ${b.status === 'minted' ? data.accent + '66' : 'rgba(255,255,255,0.08)'}`, borderRadius: 20, padding: '3px 8px', fontSize: 10, fontWeight: 600 }}>
                  <span style={{ fontSize: 12 }}>{b.badge}</span>
                  <span style={{ color: '#d8d8e0', maxWidth: 92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* footer seal */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, color: '#8a8a96', fontWeight: 700, letterSpacing: 0.5 }}>
              <ShieldCheck size={12} color={data.accent} /> {data.mintedCount ? `${data.mintedCount} verified on-chain` : 'Plajah verified record'}
            </div>
            <div style={{ fontSize: 9.5, color: '#6a6a76', fontWeight: 800, letterSpacing: 1 }}>PLAJAH</div>
          </div>
        </div>
      </div>

      {!compact && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportPng} disabled={busy} style={btn(data.accent)}><Download size={14} /> {busy ? 'Saving…' : 'Save card'}</button>
          <button onClick={share} style={btnGhost}><Share2 size={14} /> Share</button>
        </div>
      )}
    </div>
  );
};

const btn = (accent: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none',
  background: accent, color: '#0d0d14', fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
});
const btnGhost: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9,
  border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#ddd', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
};

export default StateCard;
