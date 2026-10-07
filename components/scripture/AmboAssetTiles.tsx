// AmboAssetTiles — real pictures for the Assets tab's square cards.
//   Lottie     -> the actual .lottie, frozen on a mid frame (plays on hover)
//   Transition -> a live A/B demo of the move (CSS), so the card shows what the effect does
import React, { useEffect, useRef, useState } from 'react';
import { AmboPoster, useNearScreen } from './AmboPoster';

export const AmboLottieStill: React.FC<{ file: string; label: string; hovered?: boolean }> = ({ file, label, hovered }) => {
  const [boxRef, near] = useNearScreen<HTMLDivElement>();
  const cv = useRef<HTMLCanvasElement>(null);
  const player = useRef<any>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!near || !cv.current) return;
    let alive = true;
    (async () => {
      try {
        const mod: any = await import('@lottiefiles/dotlottie-web');
        const Ctor = mod.DotLottie ?? mod.default?.DotLottie;
        if (!alive || !Ctor || !cv.current) return;
        cv.current.width = 256; cv.current.height = 256;
        const p = new Ctor({ canvas: cv.current, src: `/fabula/lottie/${file}`, loop: true, autoplay: false });
        player.current = p;
        p.addEventListener('load', () => {
          if (!alive) return;
          try { p.setFrame(Math.max(1, Math.floor((p.totalFrames || 30) * 0.4))); } catch { /* ignore */ }
          setOk(true);
        });
        p.addEventListener('loadError', () => { if (alive) setOk(false); });
      } catch { /* placeholder stays */ }
    })();
    return () => { alive = false; try { player.current?.destroy?.(); } catch { /* ignore */ } player.current = null; };
  }, [near, file]);
  useEffect(() => {
    const p = player.current; if (!p || !ok) return;
    try { if (hovered) p.play(); else p.pause(); } catch { /* ignore */ }
  }, [hovered, ok]);
  return (
    <div ref={boxRef} data-poster={ok ? 'real' : 'placeholder'} style={{ position: 'absolute', inset: 0 }}>
      {!ok && <AmboPoster label={label} gradient="linear-gradient(135deg,#2b1a4d,#0e0a1a)" />}
      <canvas ref={cv} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: ok ? 1 : 0 }} />
    </div>
  );
};

const TX_CSS = [
  '@keyframes amboTxFade{0%,15%{opacity:0}50%,65%{opacity:1}100%{opacity:0}}',
  '@keyframes amboTxPush{0%,15%{transform:translateX(100%)}50%,65%{transform:translateX(0)}100%{transform:translateX(100%)}}',
  '@keyframes amboTxZoom{0%,15%{opacity:0;transform:scale(1.6) rotate(8deg)}50%,65%{opacity:1;transform:scale(1) rotate(0)}100%{opacity:0;transform:scale(1.6) rotate(8deg)}}',
  '@keyframes amboTxCut{0%,49%{opacity:0}50%,100%{opacity:1}}',
].join('\n');

/** Always-moving A->B demo of a transition (CSS only). */
export const AmboTransitionDemo: React.FC<{ id: string; label: string; active?: boolean }> = ({ id, label, active }) => {
  const name = /whip|wipe|slide|push/.test(id) ? 'amboTxPush' : /prism|warp|zoom/.test(id) ? 'amboTxZoom' : /cut/.test(id) ? 'amboTxCut' : 'amboTxFade';
  return (
    <div data-poster="real" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'linear-gradient(135deg,#0d324d,#00daf3)' }}>
      <style>{TX_CSS}</style>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.9)', fontWeight: 800, fontSize: 30 }}>A</div>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#6b0099,#d40055)', color: '#fff', fontWeight: 800, fontSize: 30, animationName: name, animationDuration: '2.4s', animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out' }}>B</div>
      {active && <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 2px #00DAF3' }} />}
      <span className="sr-only">{label}</span>
    </div>
  );
};
