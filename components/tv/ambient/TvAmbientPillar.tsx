import React, { memo, useEffect, useState } from 'react';
import {
  useMinuteClock, useAmbientWeather, useAmbientNotes, useAmbientNotifications,
  useAmbientThermostat, useAmbientCameras, useCameraSnapshot, fmtSetpoint, type AmbientCamera,
  describeWeather, fmtTime, relTime,
} from '../../../services/tv/ambientData';
import { AMB, WeatherGlyph } from './ambientUi';

/**
 * The TV's ambient side pillar: a 248px column of glass cards on the right edge, over Live TV+.
 *
 * Glance-only: it never takes focus or keys, so channel surfing underneath is untouched. The parent
 * drives `visible` (e.g. shown with Live TV+'s guide and faded with it); `onExpand` is only wired to
 * click/tap — on the remote, Home on the rail opens the full dash (the footer says so).
 *
 * Shows only real data (services/tv/ambientData.ts): clock, outdoor weather at the location saved
 * on the user's profile, the indoor reading from the Plajah Home hub's first thermostat, a snapshot of
 * the hub's first camera (every 30s), the two latest notes and the latest in-app
 * notification with the unread count. A card with no real source (e.g. no Plajah Home hub found)
 * is not drawn.
 *
 * Cheap: below the visibility gate nothing is mounted (polled stores unsubscribe ~350ms after
 * hiding, once the fade ends); the clock ticks once a minute; only opacity/transform transitions.
 */

export interface TvAmbientPillarProps {
  visible: boolean;
  /** Insets from the viewport edges, so the host can keep the pillar clear of its own chrome
   *  (Live TV+'s top bar and bottom guide). Default 24px all round. */
  top?: number;
  bottom?: number;
  right?: number;
  onExpand: () => void;
}

const FADE_MS = 350;

const card: React.CSSProperties = {
  background: 'rgba(16,11,23,0.72)', border: '1px solid rgba(250,245,255,0.10)',
  borderRadius: 20, padding: '14px 16px',
};
const label: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  fontFamily: AMB.body, fontWeight: 800, fontSize: 14, letterSpacing: '0.18em', textTransform: 'uppercase',
  color: 'rgba(250,245,255,0.45)',
};
const clamp = (lines: number): React.CSSProperties => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' });
const divider: React.CSSProperties = { marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(250,245,255,0.10)' };
const small: React.CSSProperties = { display: 'block', marginTop: 2, fontSize: 16, color: 'rgba(250,245,255,0.45)' };

const PillarCamera: React.FC<{ cam: AmbientCamera; active: boolean }> = ({ cam, active }) => {
  const snap = useCameraSnapshot(cam.entityId, 30_000, active);
  if (!snap.url) return null;
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', position: 'relative', flex: '0 0 auto' }}>
      <img src={snap.url} alt={cam.name} style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 12px 6px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {cam.name}
      </div>
    </div>
  );
};

const PillarBody: React.FC<{ shown: boolean; onExpand: () => void; top: number; bottom: number; right: number }> = ({ shown, onExpand, top, bottom, right }) => {
  const now = useMinuteClock(true);
  const weather = useAmbientWeather(true);
  const notes = useAmbientNotes(true);
  const notifs = useAmbientNotifications();
  const thermo = useAmbientThermostat(true);
  const cams = useAmbientCameras(true);
  const climate = thermo.climate && thermo.climate.currentTemperature != null && thermo.climate.hvacMode !== 'unavailable' ? thermo.climate : null;
  const firstCam = cams.cameras.find(c => c.available);

  const latestNotes = (notes || []).slice(0, 2);
  const latestAlert = notifs.items[0];
  const wx = weather.status === 'ok' ? describeWeather(weather.code ?? 0, weather.isDay) : null;
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <aside
      aria-label="Ambient pillar"
      onClick={onExpand}
      style={{
        position: 'fixed', top, right, bottom, width: 248, zIndex: 110,
        display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden',
        color: '#FAF5FF', fontFamily: AMB.body,
        opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateX(24px)',
        transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
        pointerEvents: shown ? 'auto' : 'none',
      }}
    >
      {/* Clock */}
      <div style={card}>
        <div style={{ fontFamily: AMB.display, fontWeight: 300, fontSize: 54, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(now)}</div>
        <div style={{ marginTop: 6, fontWeight: 600, fontSize: 16, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(250,245,255,0.62)' }}>{date}</div>
      </div>

      {/* Weather — only with a real saved location */}
      {wx && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <WeatherGlyph icon={wx.icon} size={30} />
            <span style={{ fontFamily: AMB.display, fontWeight: 500, fontSize: 34, lineHeight: 1 }}>{weather.temp}°</span>
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.35, color: 'rgba(250,245,255,0.62)', textAlign: 'right', minWidth: 0 }}>
            {wx.label}
            {weather.city && <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{weather.city}</div>}
          </div>
        </div>
      )}

      {/* Inside — first Plajah Home hub thermostat */}
      {climate && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ ...label, marginBottom: 4 }}><span>Inside</span></div>
            <span style={{ fontFamily: AMB.display, fontWeight: 500, fontSize: 34, lineHeight: 1 }}>{fmtSetpoint(climate.currentTemperature)}°</span>
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.35, color: 'rgba(250,245,255,0.62)', textAlign: 'right', minWidth: 0, textTransform: 'capitalize' }}>
            {climate.hvacAction ? climate.hvacAction.replace(/_/g, ' ') : climate.hvacMode.replace(/_/g, ' ')}
            {climate.targetTemperature != null && climate.hvacMode !== 'off' && <div>Set {fmtSetpoint(climate.targetTemperature)}°</div>}
          </div>
        </div>
      )}

      {/* First hub camera (drawn only once a snapshot has loaded) */}
      {firstCam && <PillarCamera cam={firstCam} active={shown} />}

      {/* Notes */}
      {latestNotes.length > 0 && (
        <div style={card}>
          <div style={label}><span>Notes</span></div>
          {latestNotes.map((n, i) => (
            <div key={n.id} style={{ fontSize: 18, lineHeight: 1.35, ...(i > 0 ? divider : null) }}>
              <div style={clamp(2)}>{n.title}</div>
              <span style={small}>{relTime(n.updatedAt)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notifications */}
      {notifs.available && (latestAlert || notifs.unread > 0) && (
        <div style={card}>
          <div style={label}>
            <span>Notifications</span>
            {notifs.unread > 0 && (
              <span style={{ display: 'inline-grid', placeItems: 'center', minWidth: 26, height: 26, padding: '0 7px', borderRadius: 999, background: AMB.magenta, color: '#fff', fontFamily: AMB.mono, fontSize: 15, fontWeight: 800, letterSpacing: 0 }}>
                {notifs.unread > 99 ? '99+' : notifs.unread}
              </span>
            )}
          </div>
          {latestAlert && (
            <div style={{ fontSize: 18, lineHeight: 1.35 }}>
              <div style={clamp(2)}>{latestAlert.title || latestAlert.message}</div>
              <span style={small}>{relTime(latestAlert.timestamp)}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 'auto', textAlign: 'center', padding: 10, border: '1px dashed rgba(250,245,255,0.14)', borderRadius: 14, fontWeight: 800, fontSize: 13, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(250,245,255,0.42)' }}>
        Home on the rail opens the full dash
      </div>
    </aside>
  );
};

const TvAmbientPillar: React.FC<TvAmbientPillarProps> = ({ visible, onExpand, top = 24, bottom = 24, right = 24 }) => {
  // Stay mounted through the fade-out, then unmount so the data stores stop polling.
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setShown(true));   // next frame, so the fade-in runs
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(t);
  }, [visible]);
  return mounted ? <PillarBody shown={shown && visible} onExpand={onExpand} top={top} bottom={bottom} right={right} /> : null;
};

export default memo(TvAmbientPillar);
