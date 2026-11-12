// Motion Capture lab: the real capture room, the solver on window for scripted checks.
//   npx vite --config mocap-lab.vite.config.mjs  ->  http://127.0.0.1:3248/mocap-lab.html
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import CaptureRoom, { type SendToGame } from '../../components/mocap/CaptureRoom';
import * as solve from '../../services/mocap/solve';
import * as capture from '../../services/mocap/capture';
import * as bvh from '../../services/mocap/bvh';
import * as moves from '../../services/mocap/moves';
import * as library from '../../services/mocap/library';
import * as bench from './bench';
import * as multiview from './multiview';
import * as cameraRig from '../../services/cameraRig/rig';

const sendToGame: SendToGame = async (name, text, mv, fps) => {
  const r = await fetch(`/__mocap?name=${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify({ bvh: text, moves: mv, fps }) });
  if (!r.ok) throw new Error(await r.text());
  return `Sent. Open Era Clash 3D with ?capture=${name} (http://127.0.0.1:4340/?capture=${name}) — the take's strikes become Haru's punches and kicks.`;
};

(window as any).mocapLab = { solve, capture, bvh, moves, library };
(window as any).mocapBench = bench;
(window as any).mocapMulti = { ...multiview, rig: cameraRig };
createRoot(document.getElementById('root')!).render(<CaptureRoom sendToGame={sendToGame} autoVideo={new URLSearchParams(location.search).get('video')} />);
