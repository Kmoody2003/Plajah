export interface ChannelIdentity {
  id: string;
  number: string;
  ownerId?: string;
  scheduleOwner?: string;
  plajahId?: string;
}

export function canManageChannel(channel: ChannelIdentity, user?: { uid: string } | null): boolean {
  return !!user?.uid && (channel.scheduleOwner || channel.ownerId) === user.uid;
}

/**
 * Finds the index of a shared channel in the active lineup.
 * Prioritizes:
 * 1. Exact unique source ID (e.g. `fast_<uid>`, `live_<id>`, `plajah_<id>`)
 * 2. First-party Plajah channel ID (e.g. "endless-hour")
 * 3. Channel owner ID + number combination (preventing stranger takeover)
 * 4. Standalone channel number match (e.g. direct dial or pure channel QR code)
 */
export function findSharedChannel(channels: readonly ChannelIdentity[], focus: {
  sourceId?: string; ownerId?: string; plajahId?: string; number?: string;
}): number {
  if (!channels || channels.length === 0) return -1;

  const targetNum = focus.number ? String(focus.number).trim() : '';

  // 1. Exact sub-channel source ID (unique and persistent per station)
  if (focus.sourceId) {
    const exact = channels.findIndex(c => c.id === focus.sourceId);
    if (exact >= 0) return exact;

    // If sourceId was specified, but is not yet loaded in `channels` (e.g. still fetching from Firestore):
    // If ownerId is known, check if a channel owned by this owner matches the target number
    if (focus.ownerId) {
      const owned = (c: ChannelIdentity) => (c.scheduleOwner || c.ownerId) === focus.ownerId;
      if (targetNum) {
        const ownedNumMatch = channels.findIndex(c => owned(c) && String(c.number).trim() === targetNum);
        if (ownedNumMatch >= 0) return ownedNumMatch;
      }
      const ownedAny = channels.findIndex(owned);
      if (ownedAny >= 0) return ownedAny;
    }

    // Do NOT fall through to a stranger's station with the same number while data is loading
    return -1;
  }

  // 2. First-party Plajah channel ID
  if (focus.plajahId) {
    const exactPlajah = channels.findIndex(c => c.plajahId === focus.plajahId);
    if (exactPlajah >= 0) return exactPlajah;
  }

  // 3. When an ownerId is specified, never tune a different account's station
  if (focus.ownerId) {
    const owned = (c: ChannelIdentity) => (c.scheduleOwner || c.ownerId) === focus.ownerId;
    if (targetNum) {
      const exactBoth = channels.findIndex(c => owned(c) && String(c.number).trim() === targetNum);
      if (exactBoth >= 0) return exactBoth;
      const major = targetNum.split('.')[0];
      if (major) {
        const majorMatch = channels.findIndex(c => owned(c) && String(c.number).trim().split('.')[0] === major);
        if (majorMatch >= 0) return majorMatch;
      }
    }
    const ownedAny = channels.findIndex(owned);
    return ownedAny >= 0 ? ownedAny : -1;
  }

  // 4. Standalone channel number match (e.g. from dial or standalone channel number QR code)
  if (targetNum) {
    const exactNum = channels.findIndex(c => String(c.number).trim() === targetNum);
    if (exactNum >= 0) return exactNum;
    const major = targetNum.split('.')[0];
    if (major) {
      const majorMatch = channels.findIndex(c => String(c.number).trim().split('.')[0] === major);
      if (majorMatch >= 0) return majorMatch;
    }
  }

  return -1;
}
