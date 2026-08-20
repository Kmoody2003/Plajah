// TelaEmbedDemo — proves the platform document layer (spec §07) end to end:
// ONE canonical Tela doc embedded three ways, side by side —
//   (a) live-editable with the author-in-place flying menu
//   (b) follow-latest, read-only
//   (c) pinned to v1, read-only
// Unlock → edit (a) → Lock publishes a new version → (b) updates everywhere,
// while (c) stays frozen on the version it was "sold" at. Reference, not export;
// lock→propagate; version-pinning — all observable in one screen.

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, LayoutPanelTop, Loader2 } from 'lucide-react';
import type { TelaDoc, TelaFrame, TelaVectorDevice } from '../../types';
import { auth } from '../../services/backendService';
import { loadTelaDoc, saveTelaDoc, listTelaVersions, publishTelaVersion } from '../../services/telaStore';
import TelaEmbed from './TelaEmbed';

const DEMO_ID = 'tela_embed_demo_seed';
const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/** A small self-contained poster (Vector) so the flying menu has real objects. */
function makeSeedDoc(ownerId: string): TelaDoc {
  const now = Date.now();
  const bg = uid('obj'), accent = uid('obj'), t1 = uid('obj'), t2 = uid('obj');
  const vec: TelaVectorDevice = {
    id: uid('dev'), type: 'VECTOR', name: 'Poster', width: 1080, height: 1080,
    objects: [
      { id: bg, kind: 'RECT', x: 0, y: 0, w: 1080, h: 1080, fill: '#6B0099', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1 },
      { id: accent, kind: 'ELLIPSE', x: 660, y: 120, w: 300, h: 300, fill: '#FF8C00', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.92 },
      { id: t1, kind: 'TEXT', x: 96, y: 430, w: 900, h: 170, fill: '#FFFFFF', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, text: 'GRAND OPENING', fontSize: 104, fontWeight: 800 },
      { id: t2, kind: 'TEXT', x: 100, y: 620, w: 880, h: 80, fill: '#00DAF3', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, text: 'Saturday · 7 PM', fontSize: 56, fontWeight: 600 },
    ],
  };
  const frame: TelaFrame = { id: uid('frame'), kind: 'SCREEN', preset: 'SQUARE', x: 0, y: 0, w: 1080, h: 1080, deviceIds: [vec.id], label: 'Poster' };
  return { id: DEMO_ID, ownerId, title: 'Embed demo · poster', frames: [frame], devices: { [vec.id]: vec }, bindings: [], createdAt: now, updatedAt: now };
}

const hasVector = (d: TelaDoc | null) =>
  !!d && d.frames.some(f => f.deviceIds.some(id => d.devices[id]?.type === 'VECTOR'));

interface TelaEmbedDemoProps { onBack?: () => void }

const TelaEmbedDemo: React.FC<TelaEmbedDemoProps> = ({ onBack }) => {
  const [ready, setReady] = useState(false);
  const [pinnedVersion, setPinnedVersion] = useState<string | null>(null);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      // Reuse the seed doc if present + usable; otherwise create it.
      let d = await loadTelaDoc(DEMO_ID);
      if (!hasVector(d)) { d = makeSeedDoc(auth.currentUser?.uid || 'local'); await saveTelaDoc(d); }
      // Guarantee a v1 exists so both read-only embeds have a version to show,
      // and (c) has something to pin to.
      let versions = await listTelaVersions(DEMO_ID);
      if (!versions.length) {
        await publishTelaVersion(d!, 'v1');
        versions = await listTelaVersions(DEMO_ID);
      }
      // Pin (c) to the OLDEST version — it visibly stays behind as (a) publishes.
      setPinnedVersion(versions[versions.length - 1]?.versionId ?? null);
      setReady(true);
    })();
  }, []);

  const card = (title: string, sub: string, accent: string, node: React.ReactNode) => (
    <div style={{ flex: '0 1 320px', minWidth: 280, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: accent }} />
        <span style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>{title}</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--pj-muted,#A398B4)', lineHeight: 1.5, margin: '0 0 14px' }}>{sub}</p>
      {node}
    </div>
  );

  return (
    <div className="flex-1 h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-color, #070609)' }}>
      <header className="shrink-0 flex items-center gap-3 px-4 h-14 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'linear-gradient(180deg,#140D20,#0E0A16)' }}>
        {onBack && (
          <button onClick={onBack} title="Back" className="inline-flex items-center justify-center h-9 w-9 rounded-[10px] text-white/80 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1]">
            <ChevronLeft size={16} />
          </button>
        )}
        <span className="w-8 h-8 rounded-[10px] grid place-items-center text-white" style={{ background: 'var(--pj-grad-warm, linear-gradient(135deg,#6B0099,#D40055,#FF8C00))' }}>
          <LayoutPanelTop size={16} />
        </span>
        <div className="min-w-0">
          <div className="font-display italic text-white text-[1.05rem] leading-none">Tela · Reference embeds</div>
          <div className="text-[.7rem] text-white/45 mt-0.5">One document, three views — reference not export, lock→propagate, version-pinned</div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ padding: '24px 22px 60px' }}>
        {!ready ? (
          <div className="w-full grid place-items-center" style={{ height: 300 }}>
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--pj-muted,#A398B4)' }} />
          </div>
        ) : (
          <>
            <div style={{ maxWidth: 760, marginBottom: 22 }}>
              <p style={{ fontSize: 13.5, color: '#d9d2e2', lineHeight: 1.6, margin: 0 }}>
                All three panels below embed the <b style={{ color: '#fff' }}>same</b> Tela document — they are live views, never flattened pixels.
                In the <b style={{ color: '#fff' }}>live</b> panel, click the headline (or any object) to raise the flying menu, hit
                <b style={{ color: '#fff' }}> Unlock</b>, change the text or colour, then <b style={{ color: '#fff' }}>Lock &amp; publish</b>.
                The <b style={{ color: 'var(--pj-cyan,#00DAF3)' }}>follow-latest</b> panel jumps to your new version; the
                <b style={{ color: 'var(--pj-orange,#FF8C00)' }}> pinned</b> panel — a sold/licensed copy — stays exactly on v1.
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
              {card('Live · editable', 'The author’s view. Unlock → edit in place → Lock publishes a version.', 'var(--pj-magenta,#D40055)',
                <TelaEmbed docId={DEMO_ID} mode="follow-latest" editable canEdit width={288} />)}
              {card('Follow-latest', 'A feed card / signage loop. Tracks the newest published version automatically.', 'var(--pj-cyan,#00DAF3)',
                <TelaEmbed docId={DEMO_ID} mode="follow-latest" width={288} />)}
              {card('Pinned · v1', 'A bought copy. Pinned to the version it was sold at — never mutates under the reader.', 'var(--pj-orange,#FF8C00)',
                pinnedVersion
                  ? <TelaEmbed docId={DEMO_ID} mode="pinned" versionId={pinnedVersion} versionLabel="v1" width={288} />
                  : <div style={{ width: 288, height: 200, display: 'grid', placeItems: 'center', color: 'var(--pj-faint,#6E6480)', fontSize: 12 }}>No pinned version.</div>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TelaEmbedDemo;
