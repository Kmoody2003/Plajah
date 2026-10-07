// Preview harness for components/mediaEngine/VideoRouterConsole — renders the console alone.
// `?fakecams=1` swaps getUserMedia for animated canvas feeds so routing and transitions can be
// exercised without a real camera (each "camera" gets its own colour and label).
import React from 'react';
import { createRoot } from 'react-dom/client';
import './router-preview.css';
import VideoRouterConsole from './components/mediaEngine/VideoRouterConsole';

if (new URLSearchParams(location.search).has('fakecams')) {
  const hues = ['#6B0099', '#D40055', '#0E7490', '#B45309', '#15803D', '#1D4ED8'];
  let n = 0;
  const fake = async () => {
    const i = n++;
    const c = document.createElement('canvas');
    c.width = 640; c.height = 360;
    const g = c.getContext('2d')!;
    // setInterval, not rAF: rAF never fires in a hidden preview pane, which leaves the stream frameless.
    const draw = () => {
      const t = performance.now();
      g.fillStyle = hues[i % hues.length]; g.fillRect(0, 0, 640, 360);
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '700 64px Outfit, sans-serif';
      g.fillText(`CAM ${i + 1}`, 40, 110);
      g.beginPath(); g.arc(320 + Math.sin(t / 600) * 200, 240, 30, 0, Math.PI * 2); g.fill();
    };
    draw();
    setInterval(draw, 1000 / 30);
    return c.captureStream(30);
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: fake, enumerateDevices: async () => [] },
    configurable: true,
  });
}

createRoot(document.getElementById('root')!).render(<VideoRouterConsole onBack={() => {}} />);
