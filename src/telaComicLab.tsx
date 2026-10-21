// src/telaComicLab.tsx — Tela comic mode outside the full app, laid out as TelaView mounts it
// (rail · page stream · inspector · transport). ?open=<showcaseId> opens a showcase book.
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import {
  useTelaComicVariant2Controller,
  TelaComicLeftRailCluster,
  TelaComicPageStreamCanvas,
  TelaComicSplitRightInspector,
  TelaComicBottomTransportAndTimeline,
} from '../components/tela/studio/TelaNativeComicVariant2';

const TelaComicLab: React.FC = () => {
  const ctrl = useTelaComicVariant2Controller(0, true);
  const zoom = Number(new URLSearchParams(location.search).get('zoom')) || 1;

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('open');
    if (id) void ctrl.openShowcase(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dev handle for driving the lab from the console.
  (window as unknown as { __telaComic?: typeof ctrl }).__telaComic = ctrl;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0e0b14' }}>
      <div style={{ width: 52, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)', padding: '8px 7px' }}>
        <TelaComicLeftRailCluster ctrl={ctrl} comicModeActive onEnableComicMode={() => {}} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div className="custom-scrollbar" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <TelaComicPageStreamCanvas ctrl={ctrl} zoom={zoom} />
        </div>
        <TelaComicBottomTransportAndTimeline ctrl={ctrl} comicModeActive onToggleComicMode={() => {}} />
      </div>
      <div style={{ width: 268, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(255,255,255,0.08)', background: '#0e0d14' }}>
        <TelaComicSplitRightInspector ctrl={ctrl} />
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<TelaComicLab />);
