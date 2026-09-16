interface ChannelIdentity {
  id: string;
  number: string;
  ownerId?: string;
  scheduleOwner?: string;
  plajahId?: string;
}

export function canManageChannel(channel: ChannelIdentity, user?: { uid: string } | null): boolean {
  return !!user?.uid && (channel.scheduleOwner || channel.ownerId) === user.uid;
}

/** Resolve identity before number: a stale number must never tune somebody else's channel. */
export function findSharedChannel(channels: readonly ChannelIdentity[], focus: {
  sourceId?: string; ownerId?: string; plajahId?: string; number?: string;
}): number {
  if (focus.sourceId) return channels.findIndex(c => c.id === focus.sourceId);
  if (focus.plajahId) return channels.findIndex(c => c.plajahId === focus.plajahId);
  if (focus.ownerId) {
    const owned = (c: ChannelIdentity) => (c.scheduleOwner || c.ownerId) === focus.ownerId;
    const exact = channels.findIndex(c => owned(c) && c.number === focus.number);
    return exact >= 0 ? exact : channels.findIndex(owned);
  }
  return focus.number ? channels.findIndex(c => c.number === focus.number) : -1;
}
