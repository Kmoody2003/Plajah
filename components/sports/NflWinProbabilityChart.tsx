import React, { useState, useMemo, useRef } from 'react';
import type { WinProbPoint, NflTeamInfo } from '../../services/nflGameService';

interface Props {
  data: WinProbPoint[];
  home: NflTeamInfo;
  away: NflTeamInfo;
}

const WIDTH = 800;
const HEIGHT = 240;
const GAME_SECONDS = 3600; // 60 minutes * 60 seconds

export function NflWinProbabilityChart({ data, home, away }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const getX = (secondsLeft: number) => {
    // If games go to OT, secondsLeft might be negative or game might have more total seconds.
    // We'll bound it assuming standard 3600 for display, extending if needed.
    const elapsed = GAME_SECONDS - secondsLeft;
    return (elapsed / GAME_SECONDS) * WIDTH;
  };

  const getY = (homeWinPct: number) => {
    // 100% home win = 0, 0% = 240, 50% = 120
    return ((100 - homeWinPct) / 100) * HEIGHT;
  };

  const { pathD, homeFillD, awayFillD, points, bigSwings } = useMemo(() => {
    if (!data || data.length === 0) return { pathD: '', homeFillD: '', awayFillD: '', points: [], bigSwings: [] };

    const pts = data.map((d, i) => {
      const x = getX(d.secondsLeft);
      const y = getY(d.homeWinPct);
      return { x, y, data: d, index: i };
    });

    const swings = [];
    let dStr = `M ${pts[0].x} ${pts[0].y}`;

    for (let i = 1; i < pts.length; i++) {
      dStr += ` L ${pts[i].x} ${pts[i].y}`;
      if (Math.abs(pts[i].data.homeWinPct - pts[i - 1].data.homeWinPct) > 5) {
        swings.push(pts[i]);
      }
    }

    // Areas
    // Home area: above the 50% line (y=120). Path goes from point to 120.
    const homeFillStr = `${dStr} L ${pts[pts.length - 1].x} 120 L ${pts[0].x} 120 Z`;
    const awayFillStr = `${dStr} L ${pts[pts.length - 1].x} 120 L ${pts[0].x} 120 Z`;

    return { pathD: dStr, homeFillD: homeFillStr, awayFillD: awayFillStr, points: pts, bigSwings: swings };
  }, [data]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Scale x back to SVG coordinates
    const scaleX = WIDTH / rect.width;
    const svgX = x * scaleX;

    // Find closest point by X
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < points.length; i++) {
      const diff = Math.abs(points[i].x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    setHoverIndex(closestIdx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: 200,
          background: 'rgba(8, 8, 16, 0.6)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <span style={{ color: 'var(--text-secondary, rgba(255,255,255,0.6))', fontFamily: '-apple-system, sans-serif' }}>
          Win probability updates once the game begins
        </span>
      </div>
    );
  }

  const lastPoint = points[points.length - 1];
  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div style={{ position: 'relative', height: 200, background: 'rgba(8, 8, 16, 0.6)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <clipPath id="homeClip">
            <rect x="0" y="0" width={WIDTH} height="120" />
          </clipPath>
          <clipPath id="awayClip">
            <rect x="0" y="120" width={WIDTH} height="120" />
          </clipPath>
        </defs>

        {/* 50% Line */}
        <line x1="0" y1="120" x2={WIDTH} y2="120" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="4 4" />

        {/* Quarter Markers */}
        {[0.25, 0.5, 0.75].map((pct, i) => (
          <g key={i}>
            <line
              x1={WIDTH * pct}
              y1="0"
              x2={WIDTH * pct}
              y2={HEIGHT}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <text x={WIDTH * pct - 16} y={HEIGHT - 8} fill="rgba(255,255,255,0.3)" fontSize="12" fontFamily="-apple-system, sans-serif">
              Q{i + 1}
            </text>
          </g>
        ))}

        {/* Team Labels */}
        <text x="8" y="20" fill="rgba(255,255,255,0.8)" fontSize="14" fontWeight="600" fontFamily="-apple-system, sans-serif">
          {home.abbreviation}
        </text>
        <text x="8" y="232" fill="rgba(255,255,255,0.8)" fontSize="14" fontWeight="600" fontFamily="-apple-system, sans-serif">
          {away.abbreviation}
        </text>

        {/* Home Fill Area */}
        <path d={homeFillD} fill={home.color} fillOpacity="0.2" clipPath="url(#homeClip)" />

        {/* Away Fill Area */}
        <path d={awayFillD} fill={away.color} fillOpacity="0.2" clipPath="url(#awayClip)" />

        {/* Main Line Path */}
        <path
          d={pathD}
          fill="none"
          stroke="url(#lineGradient)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={home.color} />
            <stop offset="49.9%" stopColor={home.color} />
            <stop offset="50.1%" stopColor={away.color} />
            <stop offset="100%" stopColor={away.color} />
          </linearGradient>
        </defs>

        {/* Big Swings (Scoring Plays) */}
        {bigSwings.map((pt, i) => (
          <g key={`swing-${i}`} transform={`translate(${pt.x}, ${pt.y})`}>
            <polygon
              points="0,-6 2,-2 6,-2 3,1 4,5 0,3 -4,5 -3,1 -6,-2 -2,-2"
              fill="#fff"
              opacity="0.8"
            />
          </g>
        ))}

        {/* Current Play Dot */}
        {lastPoint && (
          <g transform={`translate(${lastPoint.x}, ${lastPoint.y})`}>
            <circle cx="0" cy="0" r="4" fill={lastPoint.data.homeWinPct >= 50 ? home.color : away.color} />
            <circle cx="0" cy="0" r="4" fill="none" stroke="#fff" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="10" fill={lastPoint.data.homeWinPct >= 50 ? home.color : away.color} opacity="0.3">
              <animate attributeName="r" values="4;12;4" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
            </circle>
          </g>
        )}

        {/* Hover Indicator */}
        {hoverPoint && (
          <g>
            <line
              x1={hoverPoint.x}
              y1="0"
              x2={hoverPoint.x}
              y2={HEIGHT}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
            />
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r="4"
              fill="#fff"
              stroke={hoverPoint.data.homeWinPct >= 50 ? home.color : away.color}
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* Hover Tooltip */}
      {hoverPoint && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(Math.max(hoverPoint.x * (svgRef.current?.getBoundingClientRect().width ?? WIDTH) / WIDTH, 100), (svgRef.current?.getBoundingClientRect().width ?? WIDTH) - 100) - 100,
            top: 16,
            width: 200,
            background: 'rgba(16, 16, 24, 0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '8px 12px',
            pointerEvents: 'none',
            fontFamily: '-apple-system, sans-serif',
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            transform: 'translateX(0)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
              {hoverPoint.data.homeWinPct >= 50 ? home.abbreviation : away.abbreviation}
            </span>
            <span style={{
              color: hoverPoint.data.homeWinPct >= 50 ? home.color : away.color,
              fontSize: 14,
              fontWeight: 700
            }}>
              {hoverPoint.data.homeWinPct >= 50 ? hoverPoint.data.homeWinPct.toFixed(1) : (100 - hoverPoint.data.homeWinPct).toFixed(1)}%
            </span>
          </div>
          {hoverPoint.data.text && (
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 1.4 }}>
              {hoverPoint.data.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
