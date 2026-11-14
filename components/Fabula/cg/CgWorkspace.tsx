// CgWorkspace — Fabula's dedicated GRAPHICS workspace: the motion-graphics &
// title system (CG) powered by Tela. Three rooms share one engine:
//
//   LIBRARY   every council-authored package × element, plus My Graphics.
//             Drag any tile onto the Fabula timeline, a switcher rundown or Stage.
//   DESIGNER  author / customise a graphic against the live renderer.
//   LIVE      rundown → preview → TAKE → program, with key/fill outputs.
//
// Also mounted outside Fabula (TV Studio Graphics tab, Stage) with `host` set,
// which hides the timeline actions.
import React, { useEffect, useMemo, useState } from 'react';
import { CG_CATEGORIES, type CgCategory, type CgGraphic, type CgGraphicRef } from '../../../services/fabula/cg/cgTypes';
import { searchCg, setCgDragData, onUserGraphicsChange, deleteUserGraphic, CG_LIBRARY_SIZE, CG_PACKAGES, CG_ARCHETYPES } from '../../../services/fabula/cg/cgLibrary';
import { cgMember } from '../../../services/fabula/cg/cgCouncil';
import { sharedPlayout, defaultSlotFor } from '../../../services/fabula/cg/cgPlayout';
import { cgDefaultDuration } from '../../../services/fabula/cg/cgEvaluate';
import { CgThumb } from './CgThumb';
import { CgDesigner, blankGraphic } from './CgDesigner';
import { CgLivePanel } from './CgLivePanel';
import { CgSourcesRoom } from './CgSourcesRoom';
import { useCgLiveRuntime } from './useCgLiveRuntime';
import type { VisualSource, VisualPaintMode } from '../../../services/visualFill/visualFill';

type Room = 'library' | 'designer' | 'live' | 'sources';
const PAGE = 48;

export interface CgWorkspaceProps {
  /** Fabula timeline hook: place a graphic at the playhead. */
  onSendToTimeline?: (ref: CgGraphicRef, graphic: CgGraphic) => void;
  onOpenInTela?: (graphic: CgGraphic) => void;
  onBack?: () => void;
  ping?: (m: string) => void;
  host?: 'fabula' | 'switcher' | 'stage';
  initialRoom?: Room;
  /** Switchers pass this to cut program at a stinger's cut point. */
  onStingerCut?: () => void;
  /** A graphic to open in the designer on mount (e.g. "Open in Graphics" from a clip). */
  openGraphic?: CgGraphic | null;
}

export const CgWorkspace: React.FC<CgWorkspaceProps> = ({ onSendToTimeline, onOpenInTela, onBack, ping, host = 'fabula', initialRoom = 'library', onStingerCut, openGraphic }) => {
  const [room, setRoom] = useState<Room>(openGraphic ? 'designer' : initialRoom);
  const [cat, setCat] = useState<CgCategory | 'all' | 'mine'>('all');
  const [pkg, setPkg] = useState<string>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [userTick, setUserTick] = useState(0);
  const [designing, setDesigning] = useState<CgGraphic>(() => openGraphic || blankGraphic());
  const playout = useMemo(() => sharedPlayout({ master: true }), []);
  useCgLiveRuntime(playout);
  const [applyPaint, setApplyPaint] = useState<{ source: VisualSource; mode: VisualPaintMode; nonce: number } | null>(null);

  useEffect(() => onUserGraphicsChange(() => setUserTick(n => n + 1)), []);
  useEffect(() => { if (openGraphic) { setDesigning(openGraphic); setRoom('designer'); } }, [openGraphic]);
  useEffect(() => setLimit(PAGE), [cat, pkg, q]);

  const results = useMemo(() => {
    if (cat === 'mine') return searchCg({ text: q, includeUser: true }).filter(g => g.custom);
    return searchCg({ text: q, category: cat, packageId: pkg });
  }, [cat, pkg, q, userTick]);

  const send = (g: CgGraphic) => { onSendToTimeline?.({ graphicId: g.id, ...(g.custom ? { inline: g } : {}) }, g); };
  const addRundown = (g: CgGraphic) => { playout.addToRundown({ graphicId: g.id, ...(g.custom ? { inline: g } : {}) }, g.name, defaultSlotFor(g)); ping?.(`${g.name} added to the live rundown`); };
  const takeLive = (g: CgGraphic) => { playout.take({ graphicId: g.id, ...(g.custom ? { inline: g } : {}) }); ping?.(`${g.name} is on air`); };
  const design = (g: CgGraphic) => { setDesigning({ ...g, id: g.custom ? g.id : 'draft', name: g.custom ? g.name : `${g.name} (custom)`, custom: true }); setRoom('designer'); };
  const activePkg = CG_PACKAGES.find(p => p.id === pkg);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0, padding: 10, gap: 8, boxSizing: 'border-box', overflow: 'hidden', background: '#0e1016', color: '#e8e8ee', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {onBack && <button className="minibtn" onClick={onBack}>← EDIT</button>}
        <div style={{ fontWeight: 800, letterSpacing: '.14em', fontSize: 12 }}>FABULA CG</div>
        <div className="dim small">motion graphics &amp; titles · powered by Tela</div>
        <span style={{ flex: 1 }} />
        {(['library', 'designer', 'live', 'sources'] as Room[]).map(r => (
          <button key={r} className={`minibtn ${room === r ? 'on' : ''}`} onClick={() => setRoom(r)} style={{ minWidth: 76, fontWeight: 700 }}>
            {r === 'live' ? '● LIVE' : r.toUpperCase()}
          </button>
        ))}
      </div>

      {room === 'library' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className={`minibtn ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>ALL</button>
            {CG_CATEGORIES.map(c => <button key={c.id} className={`minibtn ${cat === c.id ? 'on' : ''}`} title={c.hint} onClick={() => setCat(c.id)}>{c.label.toUpperCase()}</button>)}
            <button className={`minibtn ${cat === 'mine' ? 'on' : ''}`} onClick={() => setCat('mine')}>MY GRAPHICS</button>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="sel xs" value={pkg} onChange={(e) => setPkg(e.target.value)}>
              <option value="all">All {CG_PACKAGES.length} packages</option>
              {['News', 'Sports', 'Worship', 'Corporate', 'Creator', 'Cinema', 'Esports', 'Editorial', 'Culture', 'Lifestyle'].map(grp => (
                <optgroup key={grp} label={grp}>{CG_PACKAGES.filter(p => p.group === grp).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
              ))}
            </select>
            <input className="in" placeholder="Search names, tags, packages…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: '1 1 200px' }} />
            <span className="dim small mono">{results.length} / {CG_LIBRARY_SIZE} library · {CG_PACKAGES.length} packages × {CG_ARCHETYPES.length} elements</span>
            <button className="minibtn blue" onClick={() => { setDesigning(blankGraphic()); setRoom('designer'); }}>+ NEW GRAPHIC</button>
          </div>
          {activePkg && (
            <div style={{ border: '1px solid #2a2d36', borderRadius: 8, padding: '6px 10px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 3 }}>{Object.values(activePkg.palette).map((c, i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid #0006' }} />)}</div>
              <div style={{ fontWeight: 700 }}>{activePkg.name}</div>
              <div className="dim small" style={{ flex: 1 }}>{activePkg.tagline}</div>
              <div className="dim small">Art: {cgMember('art', activePkg.art)?.name} · Motion: {cgMember('motion', activePkg.motionLead)?.name} · Hand: {cgMember('roster', activePkg.hand)?.name}</div>
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {!results.length && <div className="dim center" style={{ padding: 30 }}>{cat === 'mine' ? 'No saved graphics yet — design one and press SAVE TO MY GRAPHICS.' : 'Nothing matches.'}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {results.slice(0, limit).map(g => (
                <div key={g.id} draggable onDragStart={(e) => setCgDragData(e.dataTransfer, g)} onDoubleClick={() => (onSendToTimeline ? send(g) : addRundown(g))}
                  style={{ border: '1px solid #2a2d36', borderRadius: 8, padding: 6, background: 'rgba(255,255,255,.02)', cursor: 'grab' }}
                  title={`${g.name}\n${g.tagline || ''}\nDrag to the timeline, a rundown or Stage · double-click to ${onSendToTimeline ? 'place at the playhead' : 'add to the rundown'}`}>
                  <CgThumb graphic={g} />
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 5 }}>
                    <div style={{ flex: 1, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
                    <span className="dim mono" style={{ fontSize: 9 }}>{g.live === 'transition' ? 'STING' : `${cgDefaultDuration(g).toFixed(0)}s`}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                    {onSendToTimeline && <button className="minibtn" style={{ fontSize: 9 }} onClick={() => send(g)}>→ TIMELINE</button>}
                    <button className="minibtn" style={{ fontSize: 9 }} onClick={() => addRundown(g)}>+ RUNDOWN</button>
                    <button className="minibtn" style={{ fontSize: 9 }} onClick={() => design(g)}>DESIGN</button>
                    {g.custom && <button className="minibtn danger" style={{ fontSize: 9 }} onClick={() => deleteUserGraphic(g.id)}>✕</button>}
                  </div>
                </div>
              ))}
            </div>
            {results.length > limit && <div style={{ textAlign: 'center', padding: 12 }}><button className="minibtn" onClick={() => setLimit(l => l + PAGE)}>SHOW MORE ({results.length - limit})</button></div>}
          </div>
        </div>
      )}

      {room === 'designer' && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <CgDesigner graphic={designing} ping={ping}
            onSendToTimeline={onSendToTimeline ? (g) => send({ ...g, custom: true }) : undefined}
            onAddToRundown={(g) => addRundown({ ...g, custom: true })}
            onTakeLive={(g) => takeLive({ ...g, custom: true })}
            onOpenInTela={onOpenInTela} applyPaint={applyPaint} />
        </div>
      )}

      {room === 'sources' && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <CgSourcesRoom ping={ping} onUseAsFill={(source, mode) => { setApplyPaint({ source, mode, nonce: Date.now() }); setRoom('designer'); ping?.(`Applied as ${mode} to the Designer's selected layer`); }} />
        </div>
      )}

      {room === 'live' && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <CgLivePanel ping={ping} onCut={onStingerCut} title={host === 'fabula' ? 'Fabula CG playout — the same output feeds TV Studio, the Router and Stage' : undefined} />
        </div>
      )}
    </div>
  );
};

export default CgWorkspace;
