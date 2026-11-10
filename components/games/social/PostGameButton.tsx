// "Post to Social" for Plajah games outside the feed (the Games hub tile, the full-screen game). Puts a playable card,
// or a finished match's result card, on the player's timeline. Handles signed-out, busy, done and failed states itself.

import React, { useState } from 'react';
import { Send, Check, Loader2 } from 'lucide-react';
import { auth } from '../../../services/firebase';
import type { MatchDoc } from '../../../services/gamerNet/match';
import { matchShareText } from '../../../services/gamerNet/social';

type What = { kind: 'play'; game: string } | { kind: 'result'; match: MatchDoc; seat: number };

export function PostGameButton({ what, className, label, doneLabel = 'Posted to your timeline' }: { what: What; className?: string; label?: string; doneLabel?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const signedIn = !!auth.currentUser;
  const post = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!signedIn || state === 'busy' || state === 'done') return;
    setState('busy');
    const m = await import('../../../services/gamerNet/socialClient');
    const id = what.kind === 'play'
      ? await m.postPlayableGame(what.game)
      : await m.postResult(what.match.game, what.match.id, matchShareText(what.match, what.seat));
    setState(id ? 'done' : 'error');
  };
  const text = !signedIn ? 'Sign in to post to Social'
    : state === 'done' ? doneLabel
    : state === 'error' ? 'Could not post — try again'
    : label ?? (what.kind === 'play' ? 'Post to Social · play in the timeline' : 'Post result to Social');
  return (
    <button type="button" className={className} disabled={!signedIn || state === 'busy' || state === 'done'} onClick={post} aria-live="polite">
      {state === 'busy' ? <Loader2 size={14} className="animate-spin" /> : state === 'done' ? <Check size={14} /> : <Send size={14} />} {text}
    </button>
  );
}
