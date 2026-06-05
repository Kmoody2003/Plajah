/**
 * Plajah Debate — Shareable Marketing Graphic
 *
 * Renders a 1200×630 (OG image ratio) social card advertising the debate feature.
 * Export with: html2canvas or a screenshot tool.
 * Usage: mount this component, screenshot it, post to social.
 */

import React from 'react';
import { Swords } from 'lucide-react';

const DebateMarketingGraphic: React.FC = () => (
  <div
    style={{
      width: 1200,
      height: 630,
      background: 'linear-gradient(135deg, #0a0a0a 0%, #110a1a 40%, #0a0a0a 100%)',
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {/* Background orbs */}
    <div style={{ position: 'absolute', top: -100, left: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(220,38,38,0.18) 0%, transparent 70%)' }} />
    <div style={{ position: 'absolute', bottom: -100, right: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(22,163,74,0.18) 0%, transparent 70%)' }} />
    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,140,0,0.08) 0%, transparent 70%)' }} />

    {/* VS divider line */}
    <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.08), transparent)' }} />

    {/* Challenger side label */}
    <div style={{ position: 'absolute', top: 48, left: 60, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#DC2626' }} />
      <span style={{ color: 'rgba(220,38,38,0.9)', fontSize: 13, fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase' }}>Challenger</span>
    </div>

    {/* Defender side label */}
    <div style={{ position: 'absolute', top: 48, right: 60, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: 'rgba(22,163,74,0.9)', fontSize: 13, fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase' }}>Defender</span>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#16A34A' }} />
    </div>

    {/* Center icon */}
    <div style={{
      width: 80, height: 80, borderRadius: '50%',
      background: 'linear-gradient(135deg, rgba(220,38,38,0.3), rgba(22,163,74,0.3))',
      border: '2px solid rgba(255,255,255,0.15)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginBottom: 24,
      boxShadow: '0 0 60px rgba(255,140,0,0.25)',
    }}>
      <Swords size={36} color="#FF8C00" />
    </div>

    {/* Headline */}
    <h1 style={{
      color: '#ffffff',
      fontSize: 64,
      fontWeight: 900,
      letterSpacing: '-2px',
      textTransform: 'uppercase',
      margin: 0,
      textAlign: 'center',
      lineHeight: 1.1,
    }}>
      Structured<br />
      <span style={{ background: 'linear-gradient(135deg, #DC2626, #FF8C00, #16A34A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Debates
      </span>
    </h1>

    <p style={{
      color: 'rgba(255,255,255,0.5)',
      fontSize: 20,
      fontWeight: 600,
      marginTop: 16,
      textAlign: 'center',
      maxWidth: 600,
      lineHeight: 1.5,
    }}>
      Challenge any comment to a 24-hour debate.<br />
      Aria judges on facts. Civility required. Best argument wins.
    </p>

    {/* Feature pills */}
    <div style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 900 }}>
      {[
        { label: '3 challenges/day', color: 'rgba(255,140,0,0.15)', border: 'rgba(255,140,0,0.3)', text: '#FF8C00' },
        { label: '🔴 Challenger vs 🟢 Defender', color: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)', text: 'rgba(255,255,255,0.7)' },
        { label: 'Aria AI judges the facts', color: 'rgba(107,0,153,0.2)', border: 'rgba(107,0,153,0.4)', text: '#C084FC' },
        { label: 'Insults = auto-disqualified', color: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.25)', text: 'rgba(220,38,38,0.8)' },
        { label: 'Points & achievements', color: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.25)', text: 'rgba(234,179,8,0.8)' },
      ].map(p => (
        <div key={p.label} style={{
          background: p.color,
          border: `1px solid ${p.border}`,
          borderRadius: 999,
          padding: '8px 18px',
          fontSize: 13,
          fontWeight: 800,
          color: p.text,
          letterSpacing: '0.02em',
        }}>
          {p.label}
        </div>
      ))}
    </div>

    {/* Quote example */}
    <div style={{
      position: 'absolute',
      bottom: 36,
      left: 48,
      right: 48,
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center',
      gap: 24,
    }}>
      <div style={{
        background: 'rgba(220,38,38,0.1)',
        border: '1px solid rgba(220,38,38,0.25)',
        borderRadius: 14,
        padding: '14px 18px',
        fontSize: 12,
        color: 'rgba(255,255,255,0.65)',
        fontStyle: 'italic',
        lineHeight: 1.6,
      }}>
        🔴 "Spotify pays $0.003–$0.005/stream. An artist needs 250K streams to earn minimum wage for a month."
      </div>

      <div style={{
        color: 'rgba(255,255,255,0.18)',
        fontSize: 18,
        fontWeight: 900,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>
        PLAJAH
      </div>

      <div style={{
        background: 'rgba(22,163,74,0.1)',
        border: '1px solid rgba(22,163,74,0.25)',
        borderRadius: 14,
        padding: '14px 18px',
        fontSize: 12,
        color: 'rgba(255,255,255,0.65)',
        fontStyle: 'italic',
        lineHeight: 1.6,
        textAlign: 'right',
      }}>
        🟢 "Total streaming revenue hit $17.5B in 2023 — the pie has grown dramatically."
      </div>
    </div>
  </div>
);

export default DebateMarketingGraphic;
