// Mixer channels → Chora audio tracks. Pure: the caller applies the result inside a doc mutation.
//
// One track per console channel that reaches Chora (has an endpointInput); a stereo-linked pair
// becomes one stereo track. Re-syncing is idempotent: tracks already bound to a channel keep their
// id, clips, mix and position; the name follows the console only while the user hasn't renamed it.

import type { ArrangeTrack } from '../grooveDoc';
import type { AudioEndpoint, MixerChannel, MixerDevice, TrackInput } from './types';

export interface TrackPlan {
  /** Brand-new tracks to append, in console order. */
  create: ArrangeTrack[];
  /** Existing bound tracks whose name/colour/input changed. */
  update: Array<{ trackId: string; name?: string; color?: string; input: TrackInput }>;
  /** Console channels skipped and why (not routed to Chora, or the right half of a link). */
  skipped: Array<{ index: number; reason: 'not-routed' | 'stereo-partner' }>;
}

export function planTracksFromMixer(opts: {
  device: Pick<MixerDevice, 'id'>;
  endpoint: Pick<AudioEndpoint, 'transport' | 'endpointId'>;
  channels: MixerChannel[];
  /** Channels from the previous sync — tells a console rename apart from a user rename. */
  previous?: MixerChannel[];
  tracks: ArrangeTrack[];
  palette: string[];
  newId: () => string;
}): TrackPlan {
  const { device, endpoint, channels, previous = [], tracks, palette, newId } = opts;
  const byIndex = new Map(channels.map((c) => [c.index, c]));
  const prevName = new Map(previous.map((c) => [c.index, c.name]));
  const bound = new Map<number, ArrangeTrack>();
  for (const t of tracks) {
    if (t.input?.deviceId === device.id && t.input.mixerChannel != null) bound.set(t.input.mixerChannel, t);
  }

  const plan: TrackPlan = { create: [], update: [], skipped: [] };
  const partners = new Set<number>();
  for (const c of channels) if (c.linkedWith != null && c.linkedWith > c.index) partners.add(c.linkedWith);

  const ordered = [...channels].sort((a, b) => a.index - b.index);
  for (const ch of ordered) {
    if (partners.has(ch.index)) { plan.skipped.push({ index: ch.index, reason: 'stereo-partner' }); continue; }
    if (ch.endpointInput == null) { plan.skipped.push({ index: ch.index, reason: 'not-routed' }); continue; }
    const right = ch.linkedWith != null ? byIndex.get(ch.linkedWith) : undefined;
    const input: TrackInput = {
      deviceId: device.id,
      transport: endpoint.transport,
      endpointId: endpoint.endpointId,
      input: ch.endpointInput,
      ...(right?.endpointInput != null ? { inputR: right.endpointInput } : {}),
      mixerChannel: ch.index,
    };
    const name = ch.name.trim() || `Ch ${ch.index}`;
    const existing = bound.get(ch.index);
    if (existing) {
      const userRenamed = prevName.has(ch.index) && existing.name !== prevName.get(ch.index);
      const u: TrackPlan['update'][number] = { trackId: existing.id, input };
      if (!userRenamed && existing.name !== name) u.name = name;
      if (ch.color && existing.color !== ch.color) u.color = ch.color;
      if (u.name || u.color || !sameInput(existing.input!, input)) plan.update.push(u);
      continue;
    }
    plan.create.push({
      id: newId(), kind: 'audio', name,
      color: ch.color || palette[(tracks.length + plan.create.length) % palette.length],
      mute: false, solo: false, gainDb: 0, pan: 0, clips: [], input,
    });
  }
  return plan;
}

function sameInput(a: TrackInput, b: TrackInput): boolean {
  return a.endpointId === b.endpointId && a.transport === b.transport && a.input === b.input && a.inputR === b.inputR;
}
