import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Music2, Thermometer, Video, Flame, Snowflake, Power } from 'lucide-react';
import { useTvOverlayClaim, isTopTvOverlay } from '../../../hooks/useTvOverlay';
import { useGlobalPlayerState } from '../../../contexts/GlobalPlayerContext';
import { useSpeakerGroups } from '../../../services/speakerGroupsBridge';
import { thumb, THUMB } from '../../../src/lib/imageThumb';
import { tvCardRing } from '../tvFocusRing';
import {
  useMinuteClock, useAmbientWeather, useAmbientNotes, useAmbientNotifications, useAmbientLights,
  useAmbientThermostat, useAmbientCameras, useCameraSnapshot, fmtSetpoint,
  describeWeather, fmtTime, relTime, type AmbientCamera,
} from '../../../services/tv/ambientData';
import { AMB, WeatherGlyph } from './ambientUi';

/**
 * Full-screen ambient dash for the TV (Echo Show style, sized for a 10-foot room).
 *
 * Layout (1600×900 CSS): left column 520px — big thin clock, date, current weather, 6-hour strip.
 * Right — a 3×2 tile grid: Thermostat · Lights · Camera 1 / Notes · Notifications · Camera 2.
 * Bottom — a full-width now-playing strip with the active speaker group. Hint top-right.
 *
 * Real data only (services/tv/ambientData.ts). Lights, thermostat and cameras come from the Plajah
 * Home hub on the user's PC (services/home/plajahHubClient). No hub found: the tiles are "Connect
 * the Plajah Home hub" cards, never placeholder readings. On the thermostat tile Left/Right
 * nudge the setpoint by 1 degree (sent ~800ms after the last press) and OK cycles heat / cool / off.
 * On a camera tile OK opens a full-screen snapshot view refreshed every 2s; Back or OK closes it.
 *
 * Remote: claims the remote with useTvOverlayClaim('ambient') (every other navigator goes deaf) and
 * acts only while it is the top overlay, so a speaker picker opened on top wins. Its own tile grid,
 * one stable capture-phase window listener, everything via refs. Up/Down first move inside a tile's
 * list (lights / notes / notifications) and leave the tile at the list's edge. OK acts: lights
 * toggle, notification marks read, note expands, now-playing play/pause. Back (keyCode 4, Backspace,
 * GoBack, BrowserBack, XF86Back, Escape, and `plajah:hardware-back`) → onClose.
 *
 * Idle: after IDLE_MS without input the tiles and strip dim; the clock, weather and background stay.
 * The next key only wakes. GPU (Mali-G31): no blur/filters; one transform-animated gradient layer,
 * disabled under prefers-reduced-motion.
 */

export interface TvAmbientScreenProps { onClose: () => void }

const OVERLAY_ID = 'ambient';
const IDLE_MS = 3 * 60_000;
const LIST_MAX = 4;

// Tile slots, in grid order (3 columns × 2 rows). Slot 6 is the now-playing strip.
const T_THERMO = 0, T_LIGHTS = 1, T_CAM1 = 2, T_NOTES = 3, T_ALERTS = 4, T_CAM2 = 5, T_NOW = 6;

const BRAND_DRIFT_BG =
  'radial-gradient(45% 55% at 20% 20%, rgba(107,0,153,0.75), transparent 60%),' +
  'radial-gradient(40% 50% at 85% 80%, rgba(212,0,85,0.55), transparent 62%),' +
  'radial-gradient(30% 35% at 60% 40%, rgba(255,140,0,0.18), transparent 70%),' +
  AMB.void;

type Dir = 'up' | 'down' | 'left' | 'right';
const dirOf = (e: KeyboardEvent): Dir | null => {
  const kc = e.keyCode || e.which;
  if (e.key === 'ArrowUp' || kc === 38 || kc === 19) return 'up';
  if (e.key === 'ArrowDown' || kc === 40 || kc === 20) return 'down';
  if (e.key === 'ArrowLeft' || kc === 37 || kc === 21) return 'left';
  if (e.key === 'ArrowRight' || kc === 39 || kc === 22) return 'right';
  return null;
};
const isOkKey = (e: KeyboardEvent) => {
  const kc = e.keyCode || e.which;
  return e.key === 'Enter' || e.key === 'Select' || kc === 13 || kc === 23;
};
const isBackKey = (e: KeyboardEvent) => {
  const kc = e.keyCode || e.which;
  return kc === 4 || kc === 27 || kc === 166 || e.key === 'Backspace' || e.key === 'GoBack'
    || e.key === 'BrowserBack' || e.key === 'XF86Back' || e.key === 'Escape';
};

const FG2 = 'rgba(250,245,255,0.62)';
const FG3 = 'rgba(250,245,255,0.45)';
const LINE = 'rgba(250,245,255,0.10)';
const GLASS = 'rgba(16,11,23,0.72)';

const tileStyle = (focused: boolean): React.CSSProperties => ({
  position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden',
  background: GLASS, border: `1px solid ${LINE}`, borderRadius: AMB.radius, padding: '20px 22px',
  display: 'flex', flexDirection: 'column', gap: 12,
  boxShadow: tvCardRing(focused),
  transform: focused ? 'scale(1.03)' : 'none',
  zIndex: focused ? 2 : undefined,
  transition: 'transform 130ms ease, box-shadow 130ms ease',
});

const TileHead: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 16, letterSpacing: '0.18em', textTransform: 'uppercase', color: FG3 }}>
    <span>{title}</span>{right}
  </div>
);

const Badge: React.FC<{ n: number }> = ({ n }) => (
  <span style={{ display: 'inline-grid', placeItems: 'center', minWidth: 28, height: 28, padding: '0 8px', borderRadius: 999, background: AMB.magenta, color: '#fff', fontFamily: AMB.mono, fontSize: 16, fontWeight: 800, letterSpacing: 0 }}>
    {n > 99 ? '99+' : n}
  </span>
);

const ConnectCard: React.FC<{ icon: React.ReactNode; what: string }> = ({ icon, what }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', borderRadius: 16, border: `1px dashed ${LINE}`, padding: 16 }}>
    {icon}
    <div style={{ fontSize: 20, fontWeight: 600 }}>No {what} yet</div>
    <div style={{ fontSize: 18, color: FG2 }}>Connect the Plajah Home hub</div>
  </div>
);

const MODE_LABEL: Record<string, string> = { heat: 'Heat', cool: 'Cool', off: 'Off', heat_cool: 'Heat · Cool', auto: 'Auto', dry: 'Dry', fan_only: 'Fan' };
const modeLabel = (m: string | null | undefined) => (m ? MODE_LABEL[m] || m.replace(/_/g, ' ') : '');
const ModeIcon: React.FC<{ mode: string }> = ({ mode }) =>
  mode === 'heat' ? <Flame size={22} color={AMB.orange} /> : mode === 'cool' ? <Snowflake size={22} color={AMB.cyan} /> : mode === 'off' ? <Power size={22} color={FG3} /> : <Thermometer size={22} color={AMB.lilac} />;

const TileMessage: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, textAlign: 'center', borderRadius: 16, border: `1px dashed ${LINE}`, padding: 16 }}>
    <div style={{ fontSize: 20, fontWeight: 600 }}>{title}</div>
    {sub && <div style={{ fontSize: 16, color: FG2, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sub}</div>}
  </div>
);

/** One camera tile body: a hub snapshot refreshed every 30s while the dash is awake. */
const CameraTileBody: React.FC<{ cam: AmbientCamera; active: boolean; focused: boolean }> = ({ cam, active, focused }) => {
  const snap = useCameraSnapshot(cam.available ? cam.entityId : null, 30_000, active);
  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, borderRadius: 16, overflow: 'hidden', background: '#000' }}>
      {snap.url && <img src={snap.url} alt={cam.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      {!snap.url && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16, textAlign: 'center', fontSize: 16, color: FG2 }}>
          {!cam.available ? 'Camera offline' : snap.error || 'Loading snapshot…'}
        </div>
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 12px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 16 }}>
        <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cam.name}</span>
        <span style={{ color: FG2, whiteSpace: 'nowrap' }}>{focused && cam.available ? 'OK to expand' : snap.at ? relTime(snap.at) : ''}</span>
      </div>
    </div>
  );
};

/** Full-screen snapshot view, refreshed every 2s. Keys are handled by the dash's own listener. */
const CameraFullView: React.FC<{ cam: AmbientCamera }> = ({ cam }) => {
  const snap = useCameraSnapshot(cam.entityId, 2_000, true);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 5, background: '#000', display: 'grid', placeItems: 'center' }}>
      {snap.url
        ? <img src={snap.url} alt={cam.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <div style={{ fontSize: 22, color: FG2, padding: 40, textAlign: 'center' }}>{snap.error || 'Loading snapshot…'}</div>}
      <div style={{ position: 'absolute', left: 48, top: 32, fontWeight: 700, fontSize: 22, textShadow: '0 2px 8px #000' }}>{cam.name}</div>
      <div style={{ position: 'absolute', right: 48, top: 32, fontWeight: 700, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: FG2, textShadow: '0 2px 8px #000' }}>
        {snap.error && snap.url ? 'Reconnecting… · ' : ''}Snapshot every 2s · Back to close
      </div>
    </div>
  );
};

const rowHi = (on: boolean): React.CSSProperties => (on ? { background: 'rgba(255,140,0,0.16)', boxShadow: `inset 0 0 0 2px ${AMB.orange}` } : {});
const clamp = (lines: number): React.CSSProperties => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' });

const TvAmbientScreen: React.FC<TvAmbientScreenProps> = ({ onClose }) => {
  useTvOverlayClaim(OVERLAY_ID, true);

  const now = useMinuteClock(true);
  const weather = useAmbientWeather(true);
  const notes = useAmbientNotes(true);
  const notifs = useAmbientNotifications();
  const { lights, colorOnly, anyConnected, toggle } = useAmbientLights(true);
  const player = useGlobalPlayerState();
  const speakers = useSpeakerGroups(false);
  const thermo = useAmbientThermostat(true);
  const camList = useAmbientCameras(true);
  const [openCam, setOpenCam] = useState<AmbientCamera | null>(null);
  const openCamRef = useRef(openCam); openCamRef.current = openCam;

  const track = player.currentTrack && player.audioSource !== 'VIDEO' ? player.currentTrack : null;
  const art: string | undefined = (track as any)?.albumCover || (player.currentAlbum as any)?.coverImage || undefined;
  const castName = speakers.active?.name || (speakers.session?.connected ? speakers.session.deviceName : undefined);

  const shownLights = lights.slice(0, LIST_MAX);
  const shownNotes = (notes || []).slice(0, LIST_MAX - 1);
  const shownAlerts = notifs.items.slice(0, LIST_MAX - 1);
  const lightsOn = lights.filter(l => l.on).length;

  // ── Close (guarded: keydown and the native event can both report one Back) ──
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const closedRef = useRef(false);
  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onCloseRef.current();
  }, []);

  // ── Idle ──
  const [idle, setIdle] = useState(false);
  const idleRef = useRef(false); idleRef.current = idle;
  const lastInputRef = useRef(Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      if (!idleRef.current && Date.now() - lastInputRef.current > IDLE_MS) setIdle(true);
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  // ── Focus: a tile slot + an index inside that tile's list ──
  const [tile, setTile] = useState(T_LIGHTS);
  const [inner, setInner] = useState(0);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const tileRef = useRef(tile); tileRef.current = tile;
  const innerRef = useRef(inner); innerRef.current = inner;
  const lastColRef = useRef(1);   // column to return to when leaving the now-playing strip

  // Everything the key handler needs, refreshed each render; the listener itself never rebinds.
  const live = useRef({ track: !!track, lights: shownLights, notes: shownNotes, alerts: shownAlerts, toggle, notifs, player, thermo, cams: camList.cameras });
  live.current = { track: !!track, lights: shownLights, notes: shownNotes, alerts: shownAlerts, toggle, notifs, player, thermo, cams: camList.cameras };

  const innerCount = (t: number): number => {
    const L = live.current;
    if (t === T_LIGHTS) return L.lights.length;
    if (t === T_NOTES) return L.notes.length;
    if (t === T_ALERTS) return L.alerts.length;
    return 0;
  };

  // Keep the inner index valid as lists change under us.
  useEffect(() => {
    const n = innerCount(tile);
    if (inner > 0 && inner >= n) setInner(Math.max(0, n - 1));
    if (tile === T_NOW && !track) setTile(T_ALERTS);
  });

  useEffect(() => {
    const goTile = (t: number, fromBelow = false) => {
      tileRef.current = t; setTile(t);
      const n = innerCount(t);
      const i = fromBelow ? Math.max(0, n - 1) : 0;
      innerRef.current = i; setInner(i);
    };
    const move = (dir: Dir) => {
      const t = tileRef.current;
      const i = innerRef.current;
      const n = innerCount(t);
      if (t === T_NOW) {
        if (dir === 'up') goTile(3 + lastColRef.current, true);
        return;
      }
      const col = t % 3, row = Math.floor(t / 3);
      // Thermostat: Left/Right change the setpoint (when it has a single one) instead of moving focus.
      if (t === T_THERMO && (dir === 'left' || dir === 'right') && live.current.thermo.nudge(dir === 'right' ? 1 : -1)) return;
      if (dir === 'left' && col > 0) return goTile(t - 1);
      if (dir === 'right' && col < 2) return goTile(t + 1);
      if (dir === 'down') {
        if (i < n - 1) { innerRef.current = i + 1; setInner(i + 1); return; }
        if (row === 0) return goTile(t + 3);
        if (live.current.track) { lastColRef.current = col; tileRef.current = T_NOW; setTile(T_NOW); }
        return;
      }
      if (dir === 'up') {
        if (i > 0) { innerRef.current = i - 1; setInner(i - 1); return; }
        if (row === 1) return goTile(t - 3, true);
      }
    };
    const act = () => {
      const L = live.current;
      const t = tileRef.current, i = innerRef.current;
      if (t === T_LIGHTS) { const l = L.lights[i]; if (l) L.toggle(l.id); }
      else if (t === T_NOTES) { const n = L.notes[i]; if (n) setOpenNote(o => (o === n.id ? null : n.id)); }
      else if (t === T_ALERTS) { const n = L.alerts[i]; if (n && !n.isRead) L.notifs.markAsRead(n.id); }
      else if (t === T_NOW) { if (L.track) L.player.togglePlay(); }
      else if (t === T_THERMO) { if (L.thermo.climate) void L.thermo.cycleMode(); }
      else if (t === T_CAM1 || t === T_CAM2) {
        const cam = L.cams[t === T_CAM1 ? 0 : 1];
        if (cam && cam.available) setOpenCam(cam);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (!isTopTvOverlay(OVERLAY_ID)) return;
      lastInputRef.current = Date.now();
      if (openCamRef.current) {
        // Full-screen camera: Back or OK closes it; every other key is swallowed.
        e.preventDefault(); e.stopImmediatePropagation();
        if (isBackKey(e) || isOkKey(e)) { openCamRef.current = null; setOpenCam(null); }
        return;
      }
      if (isBackKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
      if (idleRef.current) { e.preventDefault(); e.stopImmediatePropagation(); setIdle(false); return; }
      const dir = dirOf(e);
      if (dir) { e.preventDefault(); e.stopImmediatePropagation(); move(dir); return; }
      if (isOkKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); act(); }
    };
    const onHwBack = (e: Event) => {
      if (!isTopTvOverlay(OVERLAY_ID)) return;
      if (e.cancelable) e.preventDefault();
      if (openCamRef.current) { openCamRef.current = null; setOpenCam(null); return; }
      close();
    };
    const onPointer = () => { lastInputRef.current = Date.now(); if (idleRef.current) setIdle(false); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('plajah:hardware-back', onHwBack);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('plajah:hardware-back', onHwBack);
      window.removeEventListener('pointerdown', onPointer, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [close]);

  const focused = (t: number) => !idle && tile === t;
  const innerOn = (t: number, i: number) => focused(t) && inner === i;
  const wx = weather.status === 'ok' ? describeWeather(weather.code ?? 0, weather.isDay) : null;
  const dimmed: React.CSSProperties = { opacity: idle ? 0.12 : 1, transition: 'opacity 600ms ease' };

  return (
    <div
      data-tv-capture
      data-tv-no-trap
      role="dialog"
      aria-label="Ambient dash"
      style={{ position: 'fixed', inset: 0, zIndex: 350, overflow: 'hidden', background: AMB.void, color: '#FAF5FF', fontFamily: AMB.body }}
    >
      <style>{`
        @keyframes plj-amb-drift { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(-3%, 2%, 0) scale(1.06); } }
        .plj-amb-bg { animation: plj-amb-drift 60s ease-in-out infinite alternate; will-change: transform; }
        @media (prefers-reduced-motion: reduce) { .plj-amb-bg { animation: none; } }
      `}</style>
      <div aria-hidden className="plj-amb-bg" style={{ position: 'absolute', inset: '-10%', background: BRAND_DRIFT_BG }} />

      <div style={{ position: 'absolute', right: 64, top: 26, fontWeight: 700, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: FG3, ...dimmed }}>
        ◀ ▶ ▲ ▼ move · OK select · Back to TV
      </div>

      <div style={{
        position: 'absolute', inset: 0, padding: '56px 64px 40px',
        display: 'grid', gridTemplateColumns: '520px 1fr', gridTemplateRows: '1fr auto', gap: '28px 40px',
      }}>
        {/* ── Left: clock + weather (never dimmed) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
          <div>
            <div style={{ fontFamily: AMB.display, fontWeight: 200, fontSize: 168, lineHeight: 0.9, letterSpacing: '-0.05em', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(now)}</div>
            <div style={{ marginTop: 12, fontWeight: 600, fontSize: 20, letterSpacing: '0.18em', textTransform: 'uppercase', color: FG2 }}>
              {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>

          {wx ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                <WeatherGlyph icon={wx.icon} size={64} />
                <div style={{ fontFamily: AMB.display, fontWeight: 300, fontSize: 72, lineHeight: 1 }}>{weather.temp}°</div>
                <div style={{ fontSize: 19, lineHeight: 1.5, color: FG2, minWidth: 0 }}>
                  {wx.label}{weather.city ? ` · ${weather.city}` : ''}
                  {weather.hi != null && weather.lo != null && <div>High {weather.hi}° · Low {weather.lo}°</div>}
                </div>
              </div>
              {weather.hours.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weather.hours.length}, 1fr)`, gap: 8 }}>
                  {weather.hours.map(h => (
                    <div key={h.label} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${LINE}`, borderRadius: 14, padding: '10px 6px', textAlign: 'center' }}>
                      <div style={{ fontFamily: AMB.mono, fontWeight: 700, fontSize: 15, color: FG3 }}>{h.label}</div>
                      <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 2px' }}><WeatherGlyph icon={describeWeather(h.code, true).icon} size={22} /></div>
                      <div style={{ fontFamily: AMB.display, fontWeight: 500, fontSize: 24 }}>{h.temp}°</div>
                      {h.pop != null && <div style={{ fontSize: 15, color: AMB.cyan }}>{h.pop}%</div>}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : weather.status === 'no-location' ? (
            <div style={{ fontSize: 19, lineHeight: 1.5, color: FG2, maxWidth: 440 }}>
              Weather shows here once your Plajah profile has a location. Open your profile in the Plajah app to set it.
            </div>
          ) : null}
        </div>

        {/* ── Right: 3×2 tiles ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1fr 1fr', gap: 18, minWidth: 0, minHeight: 0, ...dimmed }}>
          {/* Thermostat — Plajah Home hub */}
          <div style={tileStyle(focused(T_THERMO))}>
            <ThermostatTileBody thermo={thermo} focused={focused(T_THERMO)} />
          </div>

          {/* Lights — Plajah Home hub (Hue + Matter) */}
          <div style={tileStyle(focused(T_LIGHTS))}>
            <TileHead title="Lights" right={lights.length > 0 ? <span style={{ letterSpacing: '0.1em' }}>{lightsOn} on</span> : undefined} />
            {shownLights.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {shownLights.map((l, i) => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', ...rowHi(innerOn(T_LIGHTS, i)) }}>
                    <span style={{ fontSize: 18, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.room ? `${l.room} · ${l.name}` : l.name}</span>
                    <span aria-label={l.on ? 'On' : 'Off'} style={{ position: 'relative', flex: '0 0 auto', width: 44, height: 24, borderRadius: 999, background: l.on ? AMB.orange : 'rgba(255,255,255,0.14)' }}>
                      <span style={{ position: 'absolute', top: 3, left: l.on ? 23 : 3, width: 18, height: 18, borderRadius: 999, background: l.on ? '#12080a' : FG2, transition: 'left 150ms' }} />
                    </span>
                  </div>
                ))}
                {lights.length > shownLights.length && <div style={{ fontSize: 16, color: FG3 }}>+{lights.length - shownLights.length} more in Plajah Home</div>}
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, textAlign: 'center', borderRadius: 16, border: `1px dashed ${LINE}`, padding: 16 }}>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{anyConnected ? 'No switchable lights' : 'No lights yet'}</div>
                <div style={{ fontSize: 18, color: FG2 }}>
                  {colorOnly > 0 ? 'Some lights are colour-only here' : anyConnected ? 'Add Hue or Matter lights in Plajah Home' : 'Connect the Plajah Home hub'}
                </div>
              </div>
            )}
          </div>

          {/* Camera 1 — Plajah Home hub */}
          <div style={tileStyle(focused(T_CAM1))}>
            <TileHead title="Camera" />
            {camList.cameras[0]
              ? <CameraTileBody cam={camList.cameras[0]} active={!idle} focused={focused(T_CAM1)} />
              : <CameraEmpty status={camList.status} error={camList.error} what="camera" />}
          </div>

          {/* Notes — real */}
          <div style={tileStyle(focused(T_NOTES))}>
            <TileHead title="Notes" right={notes && notes.length > 0 ? <span>{notes.length}</span> : undefined} />
            {shownNotes.length > 0 ? (
              <div style={{ display: 'grid', gap: 8, minHeight: 0 }}>
                {shownNotes.map((n, i) => {
                  const open = openNote === n.id;
                  if (openNote && !open) return null;
                  return (
                    <div key={n.id} style={{ padding: '8px 10px', borderRadius: 12, fontSize: 18, lineHeight: 1.35, ...rowHi(innerOn(T_NOTES, i)) }}>
                      <div style={clamp(open ? 1 : 2)}>{n.title}</div>
                      {open && n.snippet && <div style={{ marginTop: 6, color: FG2, ...clamp(6) }}>{n.snippet}</div>}
                      <span style={{ display: 'block', marginTop: 2, fontSize: 16, color: FG3 }}>{relTime(n.updatedAt)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 18, color: FG2 }}>{notes === null ? 'Loading notes…' : 'No notes yet.'}</div>
            )}
          </div>

          {/* Notifications — real */}
          <div style={tileStyle(focused(T_ALERTS))}>
            <TileHead title="Notifications" right={notifs.unread > 0 ? <Badge n={notifs.unread} /> : undefined} />
            {shownAlerts.length > 0 ? (
              <div style={{ display: 'grid', gap: 8, minHeight: 0 }}>
                {shownAlerts.map((n, i) => (
                  <div key={n.id} style={{ padding: '8px 10px', borderRadius: 12, fontSize: 18, lineHeight: 1.35, opacity: n.isRead ? 0.7 : 1, ...rowHi(innerOn(T_ALERTS, i)) }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {!n.isRead && <span style={{ flex: '0 0 auto', width: 9, height: 9, marginTop: 9, borderRadius: 999, background: AMB.magenta }} />}
                      <span style={clamp(2)}>{n.title || n.message}</span>
                    </div>
                    <span style={{ display: 'block', marginTop: 2, fontSize: 16, color: FG3 }}>{relTime(n.timestamp)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 18, color: FG2 }}>{notifs.available ? 'You are all caught up.' : 'Notifications are unavailable.'}</div>
            )}
          </div>

          {/* Camera 2 — Plajah Home hub */}
          <div style={tileStyle(focused(T_CAM2))}>
            <TileHead title="Camera" />
            {camList.cameras[1]
              ? <CameraTileBody cam={camList.cameras[1]} active={!idle} focused={focused(T_CAM2)} />
              : camList.status === 'ok'
                ? <TileMessage title="No second camera" sub="The hub has only one camera" />
                : <CameraEmpty status={camList.status} error={camList.error} what="second camera" />}
          </div>
        </div>

        {/* ── Bottom: now playing strip ── */}
        <div style={{
          gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 18,
          background: GLASS, border: `1px solid ${LINE}`, borderRadius: 22, padding: '14px 18px',
          boxShadow: tvCardRing(focused(T_NOW)), ...dimmed,
        }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', flex: '0 0 auto', display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${AMB.purple}, ${AMB.magenta} 55%, ${AMB.orange})` }}>
            {art ? <img src={thumb(art, THUMB.small)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Music2 size={24} color="#fff" />}
          </div>
          {track ? (
            <>
              <div style={{ minWidth: 0, maxWidth: 560 }}>
                <div style={{ fontWeight: 700, fontSize: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                <div style={{ fontSize: 18, color: FG2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(track as any).artist || (player.currentAlbum as any)?.artist || ''}</div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ width: 48, height: 48, borderRadius: 999, display: 'grid', placeItems: 'center', background: AMB.orange, color: '#000', flex: '0 0 auto' }}>
                {player.isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" style={{ marginLeft: 3 }} />}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '0.1em', textTransform: 'uppercase', color: AMB.cyan, whiteSpace: 'nowrap' }}>
                {castName ? `Playing on ${castName}` : 'Playing on this TV'}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 18, color: FG2 }}>Nothing playing</div>
          )}
        </div>
      </div>

      {openCam && <CameraFullView cam={openCam} />}
    </div>
  );
};

const CameraEmpty: React.FC<{ status: string; error?: string; what: string }> = ({ status, error, what }) => {
  if (status === 'loading') return <TileMessage title="Loading…" />;
  if (status === 'none') return <TileMessage title="No cameras" sub="Add an RTSP camera in Plajah Home on the hub PC" />;
  if (status === 'error') return <TileMessage title="Plajah Home hub unreachable" sub={error} />;
  return <ConnectCard icon={<Video size={34} color={AMB.lilac} />} what={what} />;
};

const ThermostatTileBody: React.FC<{ thermo: ReturnType<typeof useAmbientThermostat>; focused: boolean }> = ({ thermo, focused }) => {
  const c = thermo.climate;
  if (!c) {
    return (
      <>
        <TileHead title="Thermostat" />
        {thermo.status === 'loading' ? <TileMessage title="Loading…" />
          : thermo.status === 'none' ? <TileMessage title="No thermostat" sub="Pair a Matter thermostat in Plajah Home" />
          : thermo.status === 'error' ? <TileMessage title="Plajah Home hub unreachable" sub={thermo.error} />
          : <ConnectCard icon={<Thermometer size={34} color={AMB.lilac} />} what="thermostat" />}
      </>
    );
  }
  const unit = c.unit.replace('°', '');
  const mode = thermo.pendingMode || c.hvacMode;
  const single = c.targetTemperature != null;
  const target = thermo.pendingTarget ?? c.targetTemperature;
  const unavailable = c.hvacMode === 'unavailable' || c.hvacMode === 'unknown';
  const note = thermo.controlError || thermo.error;
  return (
    <>
      <TileHead title="Thermostat" right={<span style={{ letterSpacing: '0.04em', textTransform: 'none', fontWeight: 600, fontSize: 16, maxWidth: 170, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: AMB.display, fontWeight: 300, fontSize: 72, lineHeight: 1 }}>{fmtSetpoint(c.currentTemperature)}°</span>
        <span style={{ fontSize: 18, color: FG3 }}>{unit} inside</span>
      </div>
      {unavailable ? (
        <div style={{ fontSize: 18, color: FG2 }}>Thermostat not reachable from the hub</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: 20 }}>
            <ModeIcon mode={mode} />
            <span style={{ fontWeight: 600 }}>{modeLabel(mode)}{thermo.pendingMode ? '…' : ''}</span>
            {mode !== 'off' && (single ? (
              <span style={{ color: thermo.pendingTarget != null ? AMB.orange : FG2 }}>
                · set to <b style={{ fontFamily: AMB.mono }}>{fmtSetpoint(target)}°</b>
              </span>
            ) : c.targetLow != null && c.targetHigh != null ? (
              <span style={{ color: FG2 }}>· {fmtSetpoint(c.targetLow)}° to {fmtSetpoint(c.targetHigh)}°</span>
            ) : null)}
          </div>
          {c.hvacAction && c.hvacAction !== 'off' && <div style={{ fontSize: 16, color: FG3, textTransform: 'capitalize' }}>{c.hvacAction.replace(/_/g, ' ')}</div>}
        </>
      )}
      {note
        ? <div style={{ marginTop: 'auto', fontSize: 15, color: AMB.magenta, ...clamp(2) }}>{note}</div>
        : focused && !unavailable && (
          <div style={{ marginTop: 'auto', fontSize: 15, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FG3 }}>
            {single ? '◀ ▶ setpoint · OK mode' : 'OK mode · adjust auto range in Plajah Home'}
          </div>
        )}
    </>
  );
};

export default TvAmbientScreen;
