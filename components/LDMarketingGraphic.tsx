/**
 * Plajah LD (Lighting Designer) — Shareable Marketing Graphic
 *
 * Renders a 1200x630 (OG image ratio) social card advertising the LD feature.
 * Styled in Plajah's signature design language: deep obsidian backgrounds,
 * electric magenta/amber brand gradients, volumetric lighting glow, and
 * hardware ecosystem badges.
 *
 * Usage: mount this component, screenshot or capture with html2canvas for social release.
 */

import React from 'react';
import { Lightbulb, Zap, Wifi, Music, Sparkles } from 'lucide-react';

interface LDMarketingGraphicProps {
  headline?: string;
  subheadline?: string;
  currentTrackTitle?: string;
  currentArtist?: string;
}

export const LDMarketingGraphic: React.FC<LDMarketingGraphicProps> = ({
  headline = 'LIGHT IS THE INVISIBLE ACTOR',
  subheadline = 'Turn any room into a live stadium concert. Zero-friction sync with your smart lights, screen rigs, and music.',
  currentTrackTitle = 'HYPERDRIVE (LIVE AT RED ROCKS)',
  currentArtist = 'CYBERPUNK ORCHESTRA',
}) => {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        background: 'radial-gradient(circle at 50% -20%, #200030 0%, #08030f 45%, #020202 100%)',
        fontFamily: "'Outfit', 'Space Grotesk', 'Inter', system-ui, sans-serif",
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '52px 64px',
        boxSizing: 'border-box',
        color: '#ffffff',
      }}
    >
      {/* Volumetric Light Beams */}
      <div
        style={{
          position: 'absolute',
          top: -160,
          left: '20%',
          width: 220,
          height: 800,
          background: 'linear-gradient(180deg, rgba(212, 0, 85, 0.45) 0%, rgba(212, 0, 85, 0.08) 55%, transparent 100%)',
          transform: 'rotate(-24deg)',
          filter: 'blur(32px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -180,
          right: '20%',
          width: 240,
          height: 850,
          background: 'linear-gradient(180deg, rgba(255, 140, 0, 0.45) 0%, rgba(255, 140, 0, 0.08) 55%, transparent 100%)',
          transform: 'rotate(24deg)',
          filter: 'blur(36px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -120,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 480,
          height: 520,
          background: 'radial-gradient(circle, rgba(107, 0, 153, 0.35) 0%, rgba(212, 0, 85, 0.15) 50%, transparent 75%)',
          filter: 'blur(50px)',
          pointerEvents: 'none',
        }}
      />

      {/* Grid line overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.35,
          pointerEvents: 'none',
        }}
      />

      {/* Top Bar */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #6B0099, #D40055 55%, #FF8C00)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 25px rgba(212, 0, 85, 0.5)',
            }}
          >
            <Lightbulb size={24} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.12em', color: '#ffffff' }}>
                PLAJAH
              </span>
              <span
                style={{
                  background: 'rgba(255, 140, 0, 0.15)',
                  border: '1px solid rgba(255, 140, 0, 0.35)',
                  color: '#FF8C00',
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '3px 9px',
                  borderRadius: 999,
                }}
              >
                STUDIO V2
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Lighting Designer (LD)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '6px 16px',
              borderRadius: 999,
              backdropFilter: 'blur(12px)',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#00FF88',
                boxShadow: '0 0 12px #00FF88',
              }}
            />
            <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#00FF88', letterSpacing: '0.05em' }}>
              128 BPM • BEAT SYNCED
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(212, 0, 85, 0.12)',
              border: '1px solid rgba(212, 0, 85, 0.3)',
              padding: '6px 16px',
              borderRadius: 999,
            }}
          >
            <Zap size={14} color="#FF8C00" />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#FF8C00', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Party Mode Active
            </span>
          </div>
        </div>
      </div>

      {/* Center Stage */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          zIndex: 10,
          maxWidth: 960,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: '0.45em',
            textTransform: 'uppercase',
            color: '#FF8C00',
            marginBottom: 14,
          }}
        >
          <Sparkles size={14} /> Theatrical Stagecraft For Everyone
        </div>

        <h1
          style={{
            fontSize: 58,
            fontWeight: 950,
            lineHeight: 1.05,
            letterSpacing: '-1.5px',
            textTransform: 'uppercase',
            margin: 0,
            textShadow: '0 10px 40px rgba(0,0,0,0.8)',
          }}
        >
          Your Music Isn’t Just Heard.{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #FF8C00 0%, #D40055 50%, #C084FC 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block',
            }}
          >
            It’s Seen.
          </span>
        </h1>

        <p
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.65)',
            marginTop: 18,
            marginBottom: 0,
            maxWidth: 780,
            lineHeight: 1.5,
          }}
        >
          {subheadline}
        </p>

        {/* Live Rig Mockup Strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginTop: 28,
            padding: '12px 28px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 20,
            backdropFilter: 'blur(20px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 18, borderRight: '1px solid rgba(255,255,255,0.1)' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #D40055, #6B0099)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Music size={16} color="#ffffff" />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#ffffff', letterSpacing: '0.04em' }}>
                {currentTrackTitle}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                {currentArtist}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
              Palette:
            </span>
            {['#FF8C00', '#D40055', '#6B0099', '#00F0FF', '#00FF88'].map((color, idx) => (
              <div
                key={idx}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  backgroundColor: color,
                  boxShadow: `0 0 12px ${color}88`,
                  border: '2px solid rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22, paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
            {[0.8, 0.4, 0.95, 0.65, 1.0, 0.7, 0.85, 0.5].map((h, i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: `${h * 100}%`,
                  borderRadius: 2,
                  background: i % 2 === 0 ? '#FF8C00' : '#D40055',
                  boxShadow: `0 0 6px ${i % 2 === 0 ? '#FF8C00' : '#D40055'}`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Strip */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
            Direct Hardware Sync:
          </span>
          {[
            { label: 'Razer Chroma', emoji: '🐍' },
            { label: 'Philips Hue', emoji: '💡' },
            { label: 'Govee LAN', emoji: '🎨' },
            { label: 'Nanoleaf', emoji: '🟢' },
            { label: 'Screen-as-Fixture', emoji: '🖥️' },
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 999,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                fontSize: 12,
                fontWeight: 700,
                color: '#ffffff',
              }}
            >
              <span>{item.emoji}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', letterSpacing: '0.05em' }}>
              plajah.com/ld
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Built into Plajah
            </div>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255, 140, 0, 0.15)',
              border: '1px solid rgba(255, 140, 0, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FF8C00',
            }}
          >
            <Wifi size={16} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LDMarketingGraphic;
