// Controls page: rebind every action for keyboard + mouse (two slots each, extra mouse buttons included) and for a
// controller, see the touch layout, reset one action or everything. Opened from Settings (menus) and the pause panel.
// Bindings live in the shared remapper (services/input/remap.ts via ../input/actions.ts) and save per browser.
import { bindLabel, padLabel, type Bind } from '../../../../services/input/remap';
import { remap, RR_ACTIONS } from '../input/actions';

let root: HTMLDivElement | null = null;
let tab: 'kbm' | 'pad' | 'touch' = 'kbm';
let onClose: (() => void) | null = null;
let toastT = 0;

const CSS = `
.rr-cp{visibility:visible !important;position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:#05040ae6;font:14px 'Segoe UI',system-ui,sans-serif;color:#e8e2f4}
.rr-cp-box{width:min(900px,calc(100vw - 32px));max-height:calc(100vh - 32px);display:flex;flex-direction:column;border:1px solid #d9b26a55;background:#0d0a16f2;box-shadow:0 0 60px #000}
.rr-cp-head{display:flex;align-items:center;gap:16px;padding:16px 20px;border-bottom:1px solid #ffffff14;flex-wrap:wrap}
.rr-cp-head h2{margin:0;font:300 24px 'Segoe UI',sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#d9b26a;flex:1}
.rr-cp-tabs{display:flex;gap:6px}.rr-cp-tabs button{all:unset;cursor:pointer;padding:7px 12px;border:1px solid #ffffff1a;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.rr-cp-tabs button.on{border-color:#d9b26a;color:#d9b26a;background:#d9b26a14}
.rr-cp-body{overflow:auto;padding:8px 20px 16px}
.rr-cp-group{margin:14px 0 6px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#9a8fb4}
.rr-cp-row{display:grid;grid-template-columns:1fr 170px 170px 34px;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid #ffffff0a}
.rr-cp-row.pad{grid-template-columns:1fr 200px 34px}
.rr-cp-slot{all:unset;cursor:pointer;text-align:center;padding:7px 8px;border:1px solid #ffffff1f;background:#ffffff06;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rr-cp-slot:hover{border-color:#d9b26a99}.rr-cp-slot.wait{border-color:#38bdf8;color:#38bdf8;animation:rr-cp-pulse 1s infinite}
.rr-cp-slot.empty{color:#6f6788}
.rr-cp-rst{all:unset;cursor:pointer;text-align:center;width:30px;height:30px;line-height:30px;border:1px solid #ffffff1a;color:#cfc7e0}.rr-cp-rst:hover{border-color:#d9b26a}
.rr-cp-foot{display:flex;gap:10px;align-items:center;padding:12px 20px;border-top:1px solid #ffffff14;flex-wrap:wrap}
.rr-cp-foot button{all:unset;cursor:pointer;padding:9px 16px;border:1px solid #ffffff26;letter-spacing:.16em;text-transform:uppercase;font-size:12px}
.rr-cp-foot button.main{border-color:#d9b26a;color:#d9b26a}
.rr-cp-hint{flex:1;font-size:12px;color:#9a8fb4}
.rr-cp-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);padding:8px 14px;background:#0d0a16;border:1px solid #38bdf8;color:#bfe9ff;font-size:13px;opacity:0;transition:opacity .2s;z-index:61;pointer-events:none}
.rr-cp-toast.on{opacity:1}
.rr-cp-touch{position:relative;margin:12px auto;width:min(760px,100%);aspect-ratio:19/9;border:1px solid #ffffff1f;background:linear-gradient(#141022,#0a0812);border-radius:18px;overflow:hidden}
.rr-cp-touch i{position:absolute;font-style:normal;display:grid;place-items:center;text-align:center;font-size:11px;letter-spacing:.08em;border:1px solid #38bdf899;color:#bfe9ff;background:#38bdf814;border-radius:50%}
.rr-cp-touch p{position:absolute;margin:0;font-size:11px;color:#9a8fb4}
@keyframes rr-cp-pulse{50%{opacity:.55}}
@media (max-width:640px){.rr-cp-row{grid-template-columns:1fr 1fr 1fr 30px}.rr-cp-row>span{grid-column:1/-1}.rr-cp-row.pad{grid-template-columns:1fr 1fr 30px}}
`;

function toast(msg: string) {
  let t = document.querySelector<HTMLDivElement>('.rr-cp-toast');
  if (!t) { t = document.createElement('div'); t.className = 'rr-cp-toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  window.clearTimeout(toastT); toastT = window.setTimeout(() => t!.classList.remove('on'), 2200);
}

const labelOf = (id: string) => RR_ACTIONS.find((a) => a.id === id)?.label ?? id;

function render() {
  if (!root) return;
  const body = root.querySelector<HTMLDivElement>('.rr-cp-body')!;
  root.querySelectorAll<HTMLButtonElement>('.rr-cp-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  const hint = root.querySelector<HTMLElement>('.rr-cp-hint')!;
  if (tab === 'touch') {
    hint.textContent = 'On a phone or tablet the controls are on screen; this is the layout.';
    body.innerHTML = `<div class="rr-cp-touch">
      <i style="left:6%;bottom:12%;width:22%;aspect-ratio:1">MOVE<br>(drag anywhere on the left half)</i>
      <p style="left:36%;top:44%">LOOK — drag anywhere on the right half</p>
      <i style="right:4%;bottom:6%;width:17%;aspect-ratio:2.2/1;border-radius:40px;border-color:#fbbf24;color:#fbbf24">FIRE</i>
      <i style="right:4%;bottom:30%;width:8.5%;aspect-ratio:1">DASH</i><i style="right:13.5%;bottom:30%;width:8.5%;aspect-ratio:1">JUMP</i>
      <i style="right:4%;bottom:50%;width:8.5%;aspect-ratio:1;border-color:#a855f7;color:#e9d5ff">SURGE</i><i style="right:13.5%;bottom:50%;width:8.5%;aspect-ratio:1;border-color:#f43f5e;color:#fda4af">STRIKE</i>
      <i style="right:23%;bottom:12%;width:7%;aspect-ratio:1">GUARD<br>(hold)</i><i style="right:23%;bottom:32%;width:7%;aspect-ratio:1">RELOAD</i>
      <i style="right:23%;bottom:52%;width:7%;aspect-ratio:1">LOCK</i><i style="right:23%;bottom:72%;width:7%;aspect-ratio:1">FISTS</i>
      <i style="right:3%;top:6%;width:9%;aspect-ratio:2.4/1;border-radius:6px">1ST / 3RD</i>
      <i style="right:13%;top:6%;width:7%;aspect-ratio:1">EAT<br>(hold)</i>
    </div>`;
    return;
  }
  if (tab === 'pad') hint.textContent = 'Click a slot, then press a controller button. Menu / Options cancels.';
  else hint.textContent = 'Click a slot, then press a key or mouse button (side buttons too). Esc cancels, Backspace clears.';
  let html = '', group = '';
  for (const a of RR_ACTIONS) {
    if (tab === 'pad' && a.padCanonical === undefined) continue;
    if (a.group !== group) { group = a.group; html += `<div class="rr-cp-group">${group}</div>`; }
    const b = remap.bindings[a.id] ?? { binds: [], pad: null };
    if (tab === 'kbm') {
      const slot = (i: number) => `<button class="rr-cp-slot${b.binds[i] ? '' : ' empty'}" data-capture-ignore data-a="${a.id}" data-s="${i}">${b.binds[i] ? bindLabel(b.binds[i]) : '— add —'}</button>`;
      html += `<div class="rr-cp-row"><span>${a.label}</span>${slot(0)}${slot(1)}<button class="rr-cp-rst" title="Default" data-r="${a.id}">↺</button></div>`;
    } else {
      html += `<div class="rr-cp-row pad"><span>${a.label}</span><button class="rr-cp-slot${b.pad === null ? ' empty' : ''}" data-capture-ignore data-a="${a.id}" data-p="1">${padLabel(b.pad)}</button><button class="rr-cp-rst" title="Default" data-r="${a.id}">↺</button></div>`;
    }
  }
  body.innerHTML = html;
  body.querySelectorAll<HTMLButtonElement>('.rr-cp-slot').forEach((el) => el.addEventListener('click', () => startCapture(el)));
  body.querySelectorAll<HTMLButtonElement>('.rr-cp-rst').forEach((el) => el.addEventListener('click', () => { remap.reset(el.dataset.r!); render(); }));
}

function startCapture(el: HTMLButtonElement) {
  const id = el.dataset.a!;
  root?.querySelectorAll('.rr-cp-slot.wait').forEach((x) => x.classList.remove('wait'));
  el.classList.add('wait');
  if (el.dataset.p) {
    el.textContent = 'Press a button…';
    remap.capturePad((i) => {
      if (i !== 'cancel') {
        const was = RR_ACTIONS.filter((a) => a.id !== id && remap.bindings[a.id]?.pad === i).map((a) => a.label);
        remap.setPad(id, i);
        if (was.length) toast(`${padLabel(i)} moved from ${was.join(', ')} to ${labelOf(id)}`);
      }
      render();
    });
    return;
  }
  const slot = Number(el.dataset.s);
  el.textContent = 'Press a key or button…';
  remap.capturing = (b: Bind | 'cancel' | 'clear') => {
    if (b === 'clear') remap.clearBind(id, slot);
    else if (b !== 'cancel') {
      const was = RR_ACTIONS.filter((a) => a.id !== id && (remap.bindings[a.id]?.binds ?? []).some((x) => (x.t === b.t) && (x.t === 'key' ? x.code === (b as { code: string }).code : x.b === (b as { b: number }).b))).map((a) => a.label);
      remap.setBind(id, slot, b);
      if (was.length) toast(`${bindLabel(b)} moved from ${was.join(', ')} to ${labelOf(id)}`);
    }
    render();
  };
}

/** Open the Controls page. `close` runs when it shuts (Esc with nothing being captured, or the Done button). */
export function openControls(close?: () => void) {
  onClose = close ?? null;
  if (!document.getElementById('rr-cp-css')) { const s = document.createElement('style'); s.id = 'rr-cp-css'; s.textContent = CSS; document.head.appendChild(s); }
  root?.remove();
  root = document.createElement('div');
  root.className = 'rr-cp';
  root.innerHTML = `<div class="rr-cp-box">
    <div class="rr-cp-head"><h2>Controls</h2><div class="rr-cp-tabs"><button data-t="kbm">Keyboard &amp; mouse</button><button data-t="pad">Controller</button><button data-t="touch">Touch</button></div></div>
    <div class="rr-cp-body"></div>
    <div class="rr-cp-foot"><span class="rr-cp-hint"></span><button class="rr-cp-resetall">Reset all</button><button class="main rr-cp-done">Done</button></div>
  </div>`;
  document.body.appendChild(root);
  root.querySelectorAll<HTMLButtonElement>('.rr-cp-tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t as typeof tab; render(); }));
  root.querySelector('.rr-cp-resetall')!.addEventListener('click', () => { remap.reset(); render(); toast('All controls back to default'); });
  root.querySelector('.rr-cp-done')!.addEventListener('click', closeControls);
  // the page owns the keyboard while open (the menus / game underneath don't react)
  root.addEventListener('keydown', (e) => e.stopPropagation());
  window.addEventListener('keydown', escClose, true);
  render();
}

function escClose(e: KeyboardEvent) {
  if (!root) return;
  if (remap.capturing || remap.capturingPad) return; // Esc cancels a capture (the remapper handles it)
  e.stopImmediatePropagation();
  if (e.code === 'Escape') closeControls();
}

export function closeControls() {
  remap.capturing = null; remap.capturingPad = null;
  window.removeEventListener('keydown', escClose, true);
  root?.remove(); root = null;
  const f = onClose; onClose = null; f?.();
}

export const controlsOpen = () => !!root;
