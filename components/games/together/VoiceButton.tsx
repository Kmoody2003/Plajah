// Join / leave game voice, mute, and push-to-talk. Audio only; kids' accounts get a note instead (server refuses).
import React from 'react';
import { Mic, MicOff, Headphones, PhoneOff, Loader2, Hand } from 'lucide-react';
import type { GameVoice } from './useGameVoice';

export function VoiceButton({ voice, label = 'Voice' }: { voice: GameVoice; label?: string }) {
  const v = voice;
  if (v.status === 'unavailable') return <span className="gt-vnote" title={v.error}>Voice is off right now</span>;
  if (v.status !== 'on') {
    return (
      <span className="gt-voice">
        <button className="gt-vbtn" disabled={v.status === 'connecting'} onClick={() => void v.join()} aria-label={`Join ${label.toLowerCase()}`}>
          {v.status === 'connecting' ? <Loader2 size={14} className="gx-spin" /> : <Headphones size={14} />} {label}
        </button>
        {v.status === 'error' && <span className="gt-vnote gx-bad" role="alert">{v.error}</span>}
      </span>
    );
  }
  return (
    <span className="gt-voice">
      <button className={`gt-vbtn ${v.muted ? 'mute' : 'on'}`} onClick={v.toggleMute} aria-pressed={v.muted} aria-label={v.muted ? 'Unmute' : 'Mute'}>
        {v.muted ? <MicOff size={14} /> : <Mic size={14} />} {v.muted ? 'Muted' : v.ptt ? 'PTT' : 'Live'}
      </button>
      {v.ptt && !v.muted && (
        <button className={`gt-vbtn ${v.talking ? 'hot' : ''}`}
          onPointerDown={e => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); v.hold(true); }}
          onPointerUp={() => v.hold(false)} onPointerCancel={() => v.hold(false)} onContextMenu={e => e.preventDefault()}
          aria-label="Hold to talk (or hold V)">
          <Hand size={14} /> {v.talking ? 'Talking' : 'Hold · V'}
        </button>
      )}
      <button className="gt-vbtn" onClick={() => v.setPtt(!v.ptt)} aria-pressed={v.ptt} title="Push-to-talk">{v.ptt ? 'Open mic' : 'Push-to-talk'}</button>
      <button className="gt-vbtn" onClick={v.leave} aria-label="Leave voice"><PhoneOff size={14} /></button>
    </span>
  );
}
