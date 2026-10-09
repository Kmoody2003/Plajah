// Motion roster lab — standalone preview for the Motion Council: the Council Builder (asset → options), recipes,
// platform-template direction, and the advice panel with its Studio Roster crew.
//   node scripts/buildMotionRosterLab.mjs <outDir>   → static index.html + lab.js (serve outDir with any static server)
// (esbuild, not vite: the vite dev server stalls on this repo's file tree for a standalone page.)
// Builds and apply actions are logged on screen instead of mutating a Fabula / Pixels document.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MotionCouncilPanel from '../components/motion/council/MotionCouncilPanel';
import MotionCouncilBuilder from '../components/motion/council/MotionCouncilBuilder';
import { recipeToFabulaClips } from '../services/motion/council/motionBuild';
import { FX_EFFECTS } from '../components/plajahPixels/engine/fx/effects';
import { FORGE_TRANSITIONS, createForgeTransition } from '../services/fabula/forgeTransitions';
import { FORGE_LOOKS, instantiateLook } from '../services/fabula/forgeLooks';
import { createEffectInstance } from '../services/fabula/forgeEffects';
import type { ApplyAction } from '../services/motion/council/motionCouncilTypes';

const POOL = [
  { id: 'v-crowd', name: 'Crowd at the gate.mp4', type: 'video', duration: 42 },
  { id: 'v-stage', name: 'Stage wide.mp4', type: 'video', duration: 18 },
  { id: 'v-dj', name: 'DJ hands close.mov', type: 'video', duration: 9 },
  { id: 'i-poster', name: 'Poster art.png', type: 'image' },
  { id: 'i-logo', name: 'Logo.svg', type: 'graphic' },
  { id: 'a-track', name: 'Opening track.wav', type: 'audio', duration: 14.2 },
];
const catalog = { effects: FX_EFFECTS.map(e => e.id), transitions: FORGE_TRANSITIONS.map(t => t.id), looks: FORGE_LOOKS.map(l => l.id) };
let n = 0; const uid = () => `c${++n}`;

function Lab() {
  const [tab, setTab] = useState<'build' | 'advise'>('build');
  const [log, setLog] = useState<string[]>([]);
  const push = (s: string) => setLog(l => [s, ...l].slice(0, 10));
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {(['build', 'advise'] as const).map(t => <button key={t} onClick={() => setTab(t)} style={{ color: tab === t ? '#04121a' : '#9ab', background: tab === t ? '#3DD6FF' : 'transparent', border: '1px solid #3DD6FF55', borderRadius: 99, padding: '4px 12px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2 }}>{t}</button>)}
      </div>
      {tab === 'build'
        ? <MotionCouncilBuilder assets={POOL} initialSelected={['v-crowd', 'v-stage', 'i-poster']} fps={24} aspect="16:9" catalog={catalog}
            initialAsk={'a 16 second anime-style opener titled "NIGHT MARKET", hits on the drop'}
            onBuild={(opt, sources, placement, replace) => {
              const clips = recipeToFabulaClips(opt.recipe, sources.filter(a => a.type !== 'audio'), sources.filter(a => a.type === 'audio'), 0,
                { picture: 'v1', overlay: 'v2', music: 'a1', sourceAudio: 'a2' },
                { uid, mkEffect: createEffectInstance, mkTransition: createForgeTransition, lookStack: id => { const l = FORGE_LOOKS.find(x => x.id === id); return l ? instantiateLook(l) : []; } }, 'lab');
              push(`${replace ? 'SWAP' : 'BUILD'} ${opt.title} @${placement}: ${clips.length} clips · stack ${clips.find(c => c.fx?.stack)?.fx.stack.map((s: any) => s.effectId).join('+') || '—'} · trans ${clips.filter(c => c.trans).map(c => c.trans.forgeId)[0] || 'cut'}`);
              return `b${n}`;
            }}
            onAddPlatformTemplate={d => { push(`ADD platform template ${d.templateId} (lead ${d.lead})`); return true; }} />
        : <MotionCouncilPanel onApply={(a: ApplyAction) => { push(JSON.stringify(a)); }} />}
      {log.length > 0 && <pre id="lab-log" style={{ color: '#7fdcff', fontSize: 11, marginTop: 12, whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre>}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Lab />);
