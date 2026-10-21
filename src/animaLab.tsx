// src/animaLab.tsx — Anima Studio outside Fabula (served by the tela-comic-lab dev server).
// ?fabula=1 mounts it with a stand-in Fabula link (a production, one media item, and a timeline
// drop that records what it receives on window.__animaSends) to exercise the Fabula hand-off.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import AnimaStudio, { type AnimaFabulaLink } from '../components/Fabula/anima/AnimaStudio';

const mockFabula = (): AnimaFabulaLink => {
  const sends: unknown[] = [];
  (window as unknown as { __animaSends: unknown[] }).__animaSends = sends;
  const still = document.createElement('canvas');
  still.width = 640;
  still.height = 360;
  const g = still.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 640, 360);
  grad.addColorStop(0, '#2b1055');
  grad.addColorStop(1, '#d53369');
  g.fillStyle = grad;
  g.fillRect(0, 0, 640, 360);
  return {
    project: { id: 'prod_lab', title: 'Lab Production', fps: 30, width: 1920, height: 1080 },
    media: [{ id: 'asset_still', name: 'sunset.png', type: 'image', url: still.toDataURL('image/png') }],
    sendToTimeline: async (payload) => {
      sends.push({ ...payload, size: payload.blob.size, type: payload.blob.type, url: URL.createObjectURL(payload.blob) });
      return `Placed "${payload.name}" on V2 at 0.00 s.`;
    },
  };
};

const withFabula = new URLSearchParams(location.search).has('fabula');
const fabula = withFabula ? mockFabula() : undefined;

createRoot(document.getElementById('root')!).render(
  <div style={{ height: '100vh', background: '#0e0b14' }}>
    <AnimaStudio onBackToEdit={() => {}} fabula={fabula} />
  </div>
);
