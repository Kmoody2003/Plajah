// "Invite to party" for profiles and chats: starts a party if you aren't in one, sends the invite
// (a `game-party:<id>` notification for them) and opens the party dock. Loads the party code on demand.
import React, { useState } from 'react';
import { UserPlus, Check, Loader2 } from 'lucide-react';

export function InviteToPartyButton({ uid, name, className, label = 'Invite to party' }: { uid: string; name: string; className?: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  return (
    <button type="button" className={className} title={`Invite ${name} to your party`} disabled={state === 'busy'}
      onClick={async e => {
        e.stopPropagation();
        setState('busy');
        const { inviteToParty, failed } = await import('../../../services/gamerNet/togetherClient');
        const r = await inviteToParty(uid);
        if (failed(r)) { setState('idle'); window.alert(r.error); return; }
        setState('sent'); setTimeout(() => setState('idle'), 2500);
      }}>
      {state === 'busy' ? <Loader2 size={12} className="animate-spin" /> : state === 'sent' ? <Check size={12} /> : <UserPlus size={12} />}
      {label && <> {state === 'sent' ? 'Invited' : label}</>}
    </button>
  );
}
