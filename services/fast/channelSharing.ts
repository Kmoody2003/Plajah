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
  const targetMajor = targetNum ? targetNum.split('.')[0] : '';
  const isCreatorFocus = !!(focus.ownerId || (focus.sourceId && !focus.sourceId.startsWith('plajah_') && !focus.sourceId.startsWith('sci_')));

  // 1. Exact unique sub-channel source ID (e.g. `fast_<uid>`, `live_<id>`, `plajah_<id>`, `sci_<id>`)
  if (focus.sourceId) {
    const exact = channels.findIndex(c => c.id === focus.sourceId);
    if (exact >= 0) return exact;
  }

  // 2. First-party Plajah channel ID (e.g. "endless-hour")
  if (focus.plajahId) {
    const exactPlajah = channels.findIndex(c => c.plajahId === focus.plajahId || c.id === `plajah_${focus.plajahId}`);
    if (exactPlajah >= 0) return exactPlajah;
    return -1;
  }

  // 3. Channel owner ID + optional number combination
  if (focus.ownerId) {
    const owned = (c: ChannelIdentity) => !c.plajahId && (c.scheduleOwner || c.ownerId) === focus.ownerId;
    if (targetNum && targetNum !== '—' && targetNum !== '-') {
      // Try exact channel number under this owner
      const exactBoth = channels.findIndex(c => owned(c) && String(c.number).trim() === targetNum);
      if (exactBoth >= 0) return exactBoth;

      // Try matching major number under this owner (e.g. 42 matching 42.1)
      if (targetMajor) {
        const majorMatch = channels.findIndex(c => owned(c) && String(c.number).trim().split('.')[0] === targetMajor);
        if (majorMatch >= 0) return majorMatch;
      }
    }
    // Any channel owned by this account
    const ownedAny = channels.findIndex(owned);
    return ownedAny >= 0 ? ownedAny : -1;
  }

  // 4. Standalone channel number match (e.g. from direct dial or channel QR code)
  if (targetNum && targetNum !== '—' && targetNum !== '-') {
    // If focus was specifically for an account channel, never falsely match a first-party plajah channel
    const eligible = (c: ChannelIdentity) => !isCreatorFocus || !c.plajahId;

    // 4a. Exact channel number match
    const exactNum = channels.findIndex(c => eligible(c) && String(c.number).trim() === targetNum);
    if (exactNum >= 0) return exactNum;

    // 4b. Major channel number match (e.g. "42" matching "42.1", or "42.1" matching "42")
    if (targetMajor) {
      const majorMatch = channels.findIndex(c => {
        if (!eligible(c)) return false;
        const cNum = String(c.number).trim();
        return cNum === targetMajor || cNum.split('.')[0] === targetMajor;
      });
      if (majorMatch >= 0) return majorMatch;
    }
  }

  return -1;
}
