// The end-of-run card for a scripted mode (DOM), in the game's match-end style.
import { fmtTime, modeById, type ModeResult } from './index';

export function showModeResult(r: ModeResult, again: () => void, close: () => void, backTo?: () => void) {
  const m = modeById(r.mode)!;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:radial-gradient(#0a0618dd,#03020af2);font-family:Segoe UI,sans-serif;color:#ece6ff';
  const line = m.rules.score === 'kills' ? `${r.kills} kills · ${fmtTime(r.time)} · downed ${r.downs}×` : `${fmtTime(r.time)} · ${r.kills} kills · downed ${r.downs}×`;
  const btn = (id: string, label: string, bg: string) => `<button id="${id}" style="margin:0 6px;padding:12px 24px;font:700 13px Segoe UI,sans-serif;letter-spacing:.14em;color:#0a0618;background:${bg};border:0;cursor:pointer">${label}</button>`;
  box.innerHTML = `<div style="text-align:center"><div style="letter-spacing:.4em;font-size:13px;color:#b4a6d9">THE VOID TOURNAMENT · ${m.name.toUpperCase()}</div>
    <div style="font-size:60px;font-weight:800;letter-spacing:.08em;margin:10px 0;color:${m.hex};text-shadow:0 0 24px ${m.hex}">${r.won ? 'CLEARED' : 'FALLEN'}</div>
    <div style="font-size:18px;margin-bottom:22px">${line}</div>
    ${btn('rrModeAgain', 'RUN IT AGAIN', `linear-gradient(90deg,${m.hex},#e9d5ff)`)}${btn('rrModeClose', 'CONTINUE', '#cbd5e1')}${backTo ? btn('rrModeHub', 'VOID SANCTUM', '#a78bfa') : ''}</div>`;
  document.body.appendChild(box);
  const done = (fn: () => void) => () => { box.remove(); fn(); };
  box.querySelector<HTMLButtonElement>('#rrModeAgain')!.onclick = done(again);
  box.querySelector<HTMLButtonElement>('#rrModeClose')!.onclick = done(close);
  if (backTo) box.querySelector<HTMLButtonElement>('#rrModeHub')!.onclick = done(backTo);
}
