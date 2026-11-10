// "Challenge" for profiles and chats: opens the game overlay (which loads on demand) with a ready-to-send challenge.
import React from 'react';
import { Swords } from 'lucide-react';
import type { ChallengeSource } from '../../../services/gamerNet/social';

export function ChallengeButton({ uid, name, source, className, label = 'Challenge' }: { uid: string; name: string; source: ChallengeSource; className?: string; label?: string }) {
  return (
    <button type="button" className={className} title={`Challenge ${name} to a game`}
      onClick={e => { e.stopPropagation(); void import('../../../services/gamerNet/socialClient').then(m => m.openGameOverlay({ challengeTo: { uid, name, source } })); }}>
      <Swords size={12} /> {label}
    </button>
  );
}
