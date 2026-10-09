// LiveEmoteLayer — everything emotes do on a live stream, in one drop-in layer over the video.
//
//   viewer: draws the audience's emotes + chorus evolutions + Crowd Light on this device; your own
//           taps draw instantly (before the network round-trip).
//   host:   the same overlay on the preview, PLUS the chorus authority (counts distinct senders and
//           publishes tiers to the stream doc), optional Crowd Light on the creator's real smart lights,
//           and optional "bake into stream" (a second stage drawn into the published frame).
//
// Exposes `send(def, n)` for the tray/picker: local spawn + batched write (+ the host's own chorus vote).

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { EmoteDef, StreamEmoteSettings } from '../../services/emotes/emoteTypes';
import { CrowdLight, relayWanted } from '../../services/emotes/emoteEngine';
import { EmoteStage } from '../../services/emotes/emoteStage';
import { CrowdRoomLights, saveStreamEmoteSettings, useChorusAuthority, useEmoteRelay, useEmoteSender, useStreamEmoteFeed } from '../../services/emotes/emoteLive';
import { EmoteOverlay, type EmoteOverlayHandle } from './EmoteOverlay';

export interface LiveEmoteLayerHandle {
  send: (def: EmoteDef, n?: number) => void;
  settings: StreamEmoteSettings;
}

interface ComposerLike { setOverlayDrawer: (fn: ((ctx: CanvasRenderingContext2D, W: number, H: number, dt: number) => void) | null) => void }

export interface LiveEmoteLayerProps {
  streamId: string | null;
  role: 'host' | 'viewer';
  /** Current audience size (scales chorus thresholds). */
  audience?: number;
  /** Host: push Crowd Light to connected smart lights. */
  roomLights?: boolean;
  /** Host: the broadcast composer, for "bake into stream". */
  composer?: ComposerLike | null;
  /** Reports the live settings from the stream doc (emote-only chat etc.). */
  onSettings?: (s: StreamEmoteSettings) => void;
  className?: string;
}

export const LiveEmoteLayer = forwardRef<LiveEmoteLayerHandle, LiveEmoteLayerProps>(
  ({ streamId, role, audience = 0, roomLights = false, composer = null, onSettings, className }, ref) => {
    const overlay = useRef<EmoteOverlayHandle>(null);
    const crowd = useMemo(() => new CrowdLight(), []);
    const room = useMemo(() => new CrowdRoomLights(), []);
    room.enabled = role === 'host' && roomLights;
    const bakeStage = useMemo(() => (role === 'host' ? new EmoteStage({ px: 128 }) : null), [role]);
    const settingsRef = useRef<StreamEmoteSettings>({});
    const host = role === 'host';

    const chorusVote = useChorusAuthority(host ? streamId : null, audience, settingsRef.current.chorus !== false);
    const sendRemote = useEmoteSender(streamId);
    const relay = useEmoteRelay(host ? streamId : null, !!settingsRef.current.relay);

    const baking = () => host && !!settingsRef.current.bake && !!composer;

    const show = (def: EmoteDef, n: number) => {
      crowd.add(def.gel, n);
      if (baking()) bakeStage!.spawn(def, n);
      else overlay.current?.spawn(def, n);
    };
    const showChorus = (def: EmoteDef, tier: 1 | 2 | 3, count: number) => {
      if (baking()) bakeStage!.chorus(def, tier, count);
      else overlay.current?.chorus(def, tier, count);
    };

    const settings = useStreamEmoteFeed(streamId, {
      onEmote: (def, n, uid, mine) => {
        if (host) { chorusVote(def, uid, c => showChorus(def, c.tier, c.count)); relay(def, n); }
        if (mine) return;                                   // already drawn when tapped
        if (!host && settingsRef.current.bake) { crowd.add(def.gel, n); return; }   // it's in the video
        show(def, n);
      },
      onChorus: (c, def) => { if (!host && !settingsRef.current.bake) showChorus(def, c.tier, c.count); },
    }, role);
    settingsRef.current = settings;
    useEffect(() => { onSettings?.(settings); }, [settings, onSettings]);

    // host: busy stream → switch viewers to the one-doc relay (and back), with hysteresis
    useEffect(() => {
      if (!host || !streamId) return;
      const want = relayWanted(audience, !!settings.relay);
      if (want !== !!settings.relay) saveStreamEmoteSettings(streamId, { ...settings, relay: want }).catch(() => {});
    }, [host, streamId, audience, settings]);

    // layer switches from the stream settings
    const layers = { crowdLight: settings.crowdLight !== false, chorus: settings.chorus !== false, summons: settings.summons !== false };
    if (bakeStage) Object.assign(bakeStage.layers, layers);

    // bake: draw a stage into the published frame (and keep Crowd Light there too)
    useEffect(() => {
      if (!composer || !bakeStage || !settings.bake) { composer?.setOverlayDrawer(null); return; }
      composer.setOverlayDrawer((ctx, W, H, dt) => { const s = crowd.step(dt); bakeStage.setCrowdLight(s); bakeStage.draw(ctx, W, H, dt); room.update(s); });
      return () => composer.setOverlayDrawer(null);
    }, [composer, bakeStage, settings.bake, crowd, room]);

    const onFrame = (dt: number) => {
      if (baking()) return;
      const s = crowd.step(dt);
      overlay.current?.setCrowdLight(s);
      room.update(s);
    };

    useImperativeHandle(ref, () => ({
      settings,
      send: (def: EmoteDef, n = 1) => {
        show(def, n);
        sendRemote(def, n);   // the host's own taps come back through the feed and count toward a chorus there
      },
    }));

    return <EmoteOverlay ref={overlay} onFrame={onFrame} layers={layers} className={className}
      style={baking() ? { opacity: 0 } : undefined} />;
  },
);
LiveEmoteLayer.displayName = 'LiveEmoteLayer';

export default LiveEmoteLayer;
