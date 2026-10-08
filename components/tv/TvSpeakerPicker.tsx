import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tv, Smartphone, Speaker, Layers, Check, Volume1, Volume2, Loader2, Wifi } from 'lucide-react';
import { isSpeakerPickerSupported, useSpeakerGroups, type SpeakerRoute } from '../../services/speakerGroupsBridge';
import { startSpeakerSync, useSpeakerSyncFeed, getSpeakerSyncStatus, onSpeakerSyncStatus, type SpeakerSyncStatus } from '../../services/speakerGroupsSync';
import { getPlatformInfo } from '../../hooks/usePlatform';
import { useTvOverlayClaim, isTopTvOverlay } from '../../hooks/useTvOverlay';

const OVERLAY_ID = 'speakers';

/**
 * TvSpeakerPicker — "Play on": send Chora to a Google Cast speaker or a multi-room speaker group.
 *
 * D-pad first: ↑/↓ moves, ←/→ changes the focused speaker's volume, OK plays there, Back closes.
 * Order is This TV, then groups (the whole-house case), then single speakers; the active output
 * carries a check. Discovery only runs while the sheet is open.
 *
 * Keep this mounted (open or closed) inside <GlobalPlayerProvider>: it also feeds the player into
 * the speaker sync (services/speakerGroupsSync.ts), which needs to keep running after it closes.
 */

const VOID = '#0d0015';
const INK = '#100B17';
const ORANGE = '#FF8C00';
const CYAN = '#00DAF3';
const VOL_STEP = 0.05;

const BACK_KEYS = new Set(['Escape', 'Backspace', 'GoBack', 'BrowserBack', 'XF86Back']);
const keyOf = (e: KeyboardEvent): string => {
  const kc = e.keyCode || e.which || 0;
  if (e.key === 'ArrowUp' || kc === 38 || kc === 19) return 'up';
  if (e.key === 'ArrowDown' || kc === 40 || kc === 20) return 'down';
  if (e.key === 'ArrowLeft' || kc === 37 || kc === 21) return 'left';
  if (e.key === 'ArrowRight' || kc === 39 || kc === 22) return 'right';
  if (e.key === 'Enter' || e.key === ' ' || kc === 13 || kc === 23 || kc === 66) return 'ok';
  if (BACK_KEYS.has(e.key) || kc === 4 || kc === 27 || kc === 8 || kc === 10009 || kc === 461) return 'back';
  return '';
};

type Row = { kind: 'local' } | { kind: 'route'; route: SpeakerRoute };

export const TvSpeakerPicker: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  // Always-on wiring (also while closed): native sync listeners + the player feed.
  useEffect(() => { startSpeakerSync(); }, []);
  useSpeakerSyncFeed();
  // Own the remote while open (other navigators go deaf; see hooks/useTvOverlay.ts).
  useTvOverlayClaim(OVERLAY_ID, open);

  const native = isSpeakerPickerSupported();
  const { supported, groups, devices, session, media, active, select, playHere, setVolume } = useSpeakerGroups(open && native);
  const [sync, setSync] = useState<SpeakerSyncStatus>(getSpeakerSyncStatus);
  useEffect(() => onSpeakerSyncStatus(setSync), []);

  const [focus, setFocus] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [volOverride, setVolOverride] = useState<Record<string, number>>({});
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const isTv = useMemo(() => { try { return !!getPlatformInfo().isTV; } catch { return true; } }, []);
  const rows: Row[] = useMemo(
    () => [{ kind: 'local' as const }, ...groups.map(route => ({ kind: 'route' as const, route })), ...devices.map(route => ({ kind: 'route' as const, route }))],
    [groups, devices],
  );

  // Open → focus the active output (or This TV).
  useEffect(() => {
    if (!open) return;
    const idx = rows.findIndex(r => r.kind === 'route' && r.route.isSelected);
    setFocus(idx > 0 ? idx : 0);
    setPendingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { if (focus >= rows.length) setFocus(Math.max(0, rows.length - 1)); }, [rows.length, focus]);
  useEffect(() => { rowRefs.current[focus]?.scrollIntoView?.({ block: 'nearest' }); }, [focus]);

  // Connection settled → clear the spinner; a fresh start closes the sheet (the music moved).
  useEffect(() => {
    if (!pendingId || !session) return;
    if (session.state === 'started' && session.connected) { setPendingId(null); const t = setTimeout(onClose, 700); return () => clearTimeout(t); }
    if (session.state === 'failed' || session.state === 'ended') setPendingId(null);
  }, [session, pendingId, onClose]);

  const volumeOf = (r: SpeakerRoute): number | null => {
    if (volOverride[r.id] !== undefined) return volOverride[r.id];
    if (r.isSelected && session?.volume !== undefined) return session.volume;
    return r.volume;
  };

  const activate = (row: Row) => {
    if (row.kind === 'local') {
      if (active) { playHere(); }
      else onClose();
      return;
    }
    if (row.route.isSelected) { onClose(); return; }
    setPendingId(row.route.id);
    select(row.route.id).then(ok => { if (!ok) setPendingId(null); });
  };

  const nudgeVolume = (row: Row, dir: 1 | -1) => {
    if (row.kind !== 'route' || row.route.volumeFixed) return;
    const cur = volumeOf(row.route) ?? 0.5;
    const next = Math.max(0, Math.min(1, Math.round((cur + dir * VOL_STEP) * 100) / 100));
    setVolOverride(v => ({ ...v, [row.route.id]: next }));
    setVolume(next, row.route.isSelected ? undefined : row.route.id);
  };

  // Stable key handler: the listener is attached once per open; it reads fresh state via a ref.
  const stateRef = useRef({ rows, focus, activate, nudgeVolume, onClose });
  stateRef.current = { rows, focus, activate, nudgeVolume, onClose };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Another overlay stacked above us owns the remote — let it have the key.
      if (!isTopTvOverlay(OVERLAY_ID)) return;
      const k = keyOf(e);
      const s = stateRef.current;
      // Swallow everything while open so the shell behind never moves.
      e.stopImmediatePropagation();
      if (!k) return;
      e.preventDefault();
      if (k === 'up') setFocus(f => Math.max(0, f - 1));
      else if (k === 'down') setFocus(f => Math.min(s.rows.length - 1, f + 1));
      else if (k === 'left' || k === 'right') { const row = s.rows[s.focus]; if (row) s.nudgeVolume(row, k === 'right' ? 1 : -1); }
      else if (k === 'ok') { if (e.repeat) return; const row = s.rows[s.focus]; if (row) s.activate(row); }
      else if (k === 'back') s.onClose();
    };
    const onHwBack = (e: Event) => {
      if (!isTopTvOverlay(OVERLAY_ID)) return;
      e.preventDefault();
      stateRef.current.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('plajah:hardware-back', onHwBack);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('plajah:hardware-back', onHwBack);
    };
  }, [open]);

  if (!open) return null;

  const localLabel = isTv ? 'This TV' : 'This device';
  const LocalIcon = isTv ? Tv : Smartphone;
  const casting = !!active && !!session?.connected;
  const castPlaying = media?.playerState === 'playing' || media?.playerState === 'buffering';

  return (
    <div
      data-tv-capture
      data-tv-no-trap
      role="dialog"
      aria-modal="true"
      aria-label="Play on"
      className="fixed inset-0 z-[400] flex justify-end"
      style={{ background: 'rgba(5,0,10,0.62)', fontFamily: 'Inter, system-ui, sans-serif' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="h-full flex flex-col"
        style={{
          width: 'min(720px, 100vw)',
          background: `linear-gradient(180deg, ${INK} 0%, ${VOID} 100%)`,
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '-24px 0 64px rgba(0,0,0,0.6)',
          padding: '56px 48px 40px',
          color: '#fff',
        }}
      >
        <div style={{ fontFamily: 'Outfit, Inter, sans-serif', fontWeight: 700, fontSize: 44, letterSpacing: '-0.01em' }}>Play on</div>
        <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)', marginTop: 6, minHeight: 28 }}>
          {casting
            ? <>Playing on <span style={{ color: CYAN }}>{session?.deviceName || active?.name}</span>{media ? ` · ${castPlaying ? 'playing' : media.playerState}` : ''}</>
            : 'Choose where your music plays'}
        </div>
        {sync.error && casting && (
          <div style={{ marginTop: 12, fontSize: 18, color: ORANGE }}>{sync.error}</div>
        )}

        <div className="flex-1 overflow-y-auto" style={{ marginTop: 28, padding: '8px 14px', margin: '28px -14px 0' }}>
          {rows.map((row, i) => {
            const focused = i === focus;
            const prevRow = rows[i - 1];
            const header =
              row.kind === 'route' && row.route.isGroup && prevRow?.kind === 'local' ? 'Speaker groups'
              : row.kind === 'route' && !row.route.isGroup && (prevRow?.kind === 'local' || (prevRow?.kind === 'route' && prevRow.route.isGroup)) ? 'Speakers'
              : null;
            const selected = row.kind === 'local' ? !casting : row.route.isSelected;
            const pending = row.kind === 'route' && pendingId === row.route.id;
            const Icon = row.kind === 'local' ? LocalIcon : row.route.isGroup ? Layers : row.route.deviceType === 'tv' ? Tv : Speaker;
            const vol = row.kind === 'route' ? volumeOf(row.route) : null;
            return (
              <React.Fragment key={row.kind === 'local' ? 'local' : row.route.id}>
                {header && (
                  <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', margin: '22px 6px 10px' }}>
                    {header}
                  </div>
                )}
                <div
                  ref={el => { rowRefs.current[i] = el; }}
                  onClick={() => { setFocus(i); activate(row); }}
                  onMouseEnter={() => setFocus(i)}
                  className="flex items-center cursor-pointer"
                  style={{
                    gap: 22,
                    padding: '18px 22px',
                    marginBottom: 10,
                    borderRadius: 18,
                    background: focused ? 'rgba(255,140,0,0.12)' : selected ? 'rgba(0,218,243,0.07)' : 'rgba(255,255,255,0.035)',
                    boxShadow: focused ? `0 0 0 4px ${ORANGE}, 0 0 0 7px rgba(0,0,0,0.85), 0 0 28px rgba(255,140,0,0.35)` : 'none',
                    transform: focused ? 'scale(1.015)' : 'none',
                    transition: 'transform 120ms ease, background 120ms ease',
                  }}
                >
                  <div className="flex items-center justify-center shrink-0" style={{ width: 60, height: 60, borderRadius: 16, background: selected ? 'rgba(0,218,243,0.16)' : 'rgba(255,255,255,0.07)' }}>
                    <Icon size={32} color={selected ? CYAN : '#fff'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate" style={{ fontFamily: 'Outfit, Inter, sans-serif', fontSize: 28, fontWeight: 600 }}>
                      {row.kind === 'local' ? localLabel : row.route.name}
                    </div>
                    <div className="truncate" style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                      {row.kind === 'local'
                        ? (casting ? 'Bring the music back here' : 'Playing here')
                        : pending ? 'Connecting…'
                        : row.route.isGroup ? (row.route.description || 'Speaker group')
                        : (row.route.description || (row.route.deviceType === 'tv' ? 'TV' : 'Speaker'))}
                    </div>
                    {row.kind === 'route' && vol !== null && !row.route.volumeFixed && (focused || row.route.isSelected) && (
                      <div className="flex items-center" style={{ gap: 12, marginTop: 10 }}>
                        <Volume1 size={20} color="rgba(255,255,255,0.6)" />
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round(vol * 100)}%`, height: '100%', background: focused ? ORANGE : CYAN, transition: 'width 120ms ease' }} />
                        </div>
                        <Volume2 size={20} color="rgba(255,255,255,0.6)" />
                        <span style={{ fontSize: 18, width: 44, textAlign: 'right', color: 'rgba(255,255,255,0.75)' }}>{Math.round(vol * 100)}</span>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center justify-center" style={{ width: 44 }}>
                    {pending ? <Loader2 size={30} color={CYAN} className="animate-spin" />
                      : selected ? <Check size={34} color={CYAN} strokeWidth={3} /> : null}
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {rows.length === 1 && (
            <div style={{ padding: '28px 8px', color: 'rgba(255,255,255,0.6)', fontSize: 20, lineHeight: 1.5 }}>
              {!native ? (
                <>Speakers and speaker groups are available in the Plajah Android and Android TV app.</>
              ) : !supported ? (
                <>Speakers need Google Play Services, which this device doesn't have (e.g. Fire TV).</>
              ) : (
                <div className="flex items-start" style={{ gap: 14 }}>
                  <Wifi size={24} color={CYAN} style={{ marginTop: 4, flexShrink: 0 }} />
                  <span>Looking for speakers… Make sure they're on the same Wi-Fi. Speaker groups you create in the Google Home app appear here automatically.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 18, fontSize: 17, color: 'rgba(255,255,255,0.45)', display: 'flex', gap: 28 }}>
          <span><b style={{ color: '#fff' }}>OK</b> play here</span>
          <span><b style={{ color: '#fff' }}>◀ ▶</b> volume</span>
          <span><b style={{ color: '#fff' }}>Back</b> close</span>
        </div>
      </div>
    </div>
  );
};

export default TvSpeakerPicker;
