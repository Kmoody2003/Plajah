import React from 'react';
import { Sun, Moon, Cloud, CloudSun, CloudMoon, CloudRain, CloudDrizzle, CloudSnow, CloudLightning, CloudFog } from 'lucide-react';
import type { WeatherIconKey } from '../../../services/tv/ambientData';

/** Plajah tokens (styles/plajah-ds.css), restated for inline styles on the TV ambient layer. */
export const AMB = {
  purple: '#6B0099',
  magenta: '#D40055',
  orange: '#FF8C00',     // the one TV focus colour
  cyan: '#00DAF3',
  lilac: '#D0BCFF',
  void: '#0d0015',
  ink: '#100B17',
  display: "'Outfit', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
  radius: 24,
} as const;

const ICONS: Record<WeatherIconKey, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  sun: Sun, moon: Moon, 'partly-day': CloudSun, 'partly-night': CloudMoon, cloud: Cloud,
  fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning,
};

export const WeatherGlyph: React.FC<{ icon: WeatherIconKey; size: number; color?: string }> = ({ icon, size, color = AMB.lilac }) => {
  const I = ICONS[icon] || Cloud;
  return <I size={size} color={color} strokeWidth={1.75} />;
};
