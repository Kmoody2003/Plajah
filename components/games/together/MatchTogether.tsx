// Chat + voice under a match board. Players get the players' chat and match voice (while it's live);
// everyone else gets the spectator chat.
import React from 'react';
import { MatchChat } from './MatchChat';
import { VoiceButton } from './VoiceButton';
import { useGameVoice } from './useGameVoice';

export function MatchTogether({ matchId, player, active, myName }: { matchId: string; player: boolean; active: boolean; myName?: string }) {
  const voice = useGameVoice(player && active ? `match_${matchId}` : null, myName);
  if (!player) return <MatchChat scope={`spec_${matchId}`} title="Spectators" startOpen={false} />;
  return (
    <div>
      {active && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}><VoiceButton voice={voice} label="Match voice" /></div>}
      <MatchChat scope={`match_${matchId}`} title="Match chat" />
    </div>
  );
}
