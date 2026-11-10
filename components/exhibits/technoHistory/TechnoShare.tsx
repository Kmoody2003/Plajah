// Sharing Machine Soul to the Plajah feed. Posts carry assetEmbed { type: 'TECHNO_EXHIBIT' }, which
// PostCard renders as TechnoExhibitEmbed: a small poster that opens the exhibit at the shared room.
// Kept free of the exhibit's heavy modules so PostCard can import it cheaply.
import React, { useState } from 'react';
import { Share2, Check } from 'lucide-react';

export const TX_ROOM_TITLES: Record<string, string> = {
  'tx-entrance': 'Detroit techno · the Berlin connection · the godfathers',
  'tx-timeline': 'The timeline, 1967 → today',
  'tx-pioneers': 'The pioneers',
  'tx-berlin': 'Detroit ⟷ Berlin',
  'tx-atkins': 'The Originator: a tribute to Juan Atkins',
  'tx-spots': 'The edit bay',
  'tx-archive': 'The archive',
};

const TX_ROOM_HOOKS: Record<string, string> = {
  'tx-entrance': 'In a city emptied by automation, kids took the machines that replaced their parents and made them dance.',
  'tx-timeline': 'From the 1967 uprising to the Tresor vault: how techno was born, one year at a time.',
  'tx-pioneers': 'Juan Atkins, Derrick May, Kevin Saunderson, and everyone who stood next to them.',
  'tx-berlin': 'Two broken cities. One sound. Detroit built the machine. Berlin turned it up.',
  'tx-atkins': 'Before it had a name, Juan Atkins was already making it. Thank you, Juan.',
  'tx-spots': 'Detroit techno in 90 seconds.',
  'tx-archive': 'The films, interviews and books behind Detroit techno.',
};

export interface TechnoEmbed { type: 'TECHNO_EXHIBIT'; id: string; roomId?: string; title?: string; subtitle?: string }

/** Posts a room of the exhibit to the signed-in user's feed. Throws if not signed in. */
export async function shareTechnoExhibit(roomId = 'tx-entrance') {
  const { createPost } = await import('../../../services/backendService');
  const subtitle = TX_ROOM_TITLES[roomId] || TX_ROOM_TITLES['tx-entrance'];
  const embed: TechnoEmbed = { type: 'TECHNO_EXHIBIT', id: 'machine-soul', roomId, title: 'Machine Soul', subtitle };
  await createPost({
    text: `${TX_ROOM_HOOKS[roomId] || TX_ROOM_HOOKS['tx-entrance']}\n\nMachine Soul: ${subtitle}`,
    tags: ['techno', 'detroit', 'music-history', roomId === 'tx-atkins' ? 'juan-atkins' : 'machine-soul'],
    hashtags: roomId === 'tx-atkins' ? ['MachineSoul', 'DetroitTechno', 'JuanAtkins'] : ['MachineSoul', 'DetroitTechno'],
    assetEmbed: embed,
  } as unknown as Parameters<typeof createPost>[0]);
}

export const openTechnoExhibit = (room?: string) => window.dispatchEvent(new CustomEvent('plajah:openTechnoExhibit', { detail: { room } }));

/** Share button with its own busy/done/error states. */
export function ShareButton({ run, label = 'Share', className = 'tx-chip', style }: { run: () => Promise<void>; label?: string; className?: string; style?: React.CSSProperties }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle');
  const go = async () => {
    setState('busy');
    try { await run(); setState('done'); setTimeout(() => setState('idle'), 4000); } catch { setState('err'); setTimeout(() => setState('idle'), 4000); }
  };
  return (
    <button type="button" className={className} style={style} onClick={go} disabled={state === 'busy'} aria-live="polite">
      {state === 'done' ? <Check size={12} /> : <Share2 size={12} />}{' '}
      {state === 'done' ? 'Posted to your feed' : state === 'err' ? 'Sign in to share' : state === 'busy' ? 'Posting…' : label}
    </button>
  );
}

/** Feed card for a shared room. */
export function TechnoExhibitEmbed({ embed }: { embed: Partial<TechnoEmbed> }) {
  const tribute = embed.roomId === 'tx-atkins';
  const ink = tribute ? '#00e5ff' : '#ffd400';
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); openTechnoExhibit(embed.roomId); }}
      aria-label={`Open Machine Soul: ${embed.subtitle || ''}`}
      style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', border: '2px solid #000', padding: 0, overflow: 'hidden', background: '#1a1a1c', boxShadow: '4px 4px 0 #000' }}>
      <div style={{ height: 8, background: 'repeating-linear-gradient(-45deg,#ffd400 0 10px,#111 10px 20px)' }} />
      <div style={{ position: 'relative', padding: '16px 16px 14px', backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.3px)', backgroundSize: '6px 6px' }}>
        <div style={{ font: "600 10px/1 ui-monospace,monospace", letterSpacing: '.2em', color: ink }}>{tribute ? 'A TRIBUTE · MACHINE SOUL' : 'EXHIBITION · MACHINE SOUL'}</div>
        <div style={{ fontFamily: "'Big Shoulders Stencil Display','Anton',Impact,sans-serif", fontWeight: 900, textTransform: 'uppercase', fontSize: 34, lineHeight: 0.9, color: '#e9e4d6', marginTop: 8 }}>
          {tribute ? <>The <span style={{ color: ink }}>Originator</span></> : <>Machine <span style={{ color: '#00e5ff' }}>Soul</span></>}
        </div>
        <div style={{ font: "400 13px/1.4 'Special Elite','Courier New',monospace", color: 'rgba(233,228,214,.8)', marginTop: 8 }}>{embed.subtitle || TX_ROOM_TITLES['tx-entrance']}</div>
        <div style={{ display: 'inline-block', marginTop: 12, background: ink, color: '#111', font: "700 11px/1 ui-monospace,monospace", letterSpacing: '.14em', padding: '8px 10px', textTransform: 'uppercase' }}>Step inside →</div>
      </div>
    </button>
  );
}
