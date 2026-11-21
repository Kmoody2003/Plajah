// Styles for match/party chat, voice and the party dock — same neon game look as GX_CSS (components/games/social/GameParts.tsx).
export const GT_CSS = `
.gt-chat{margin-top:10px;border-radius:16px;background:rgba(5,8,20,.72);border:1px solid rgba(0,240,255,.2);color:#e8fbff;display:flex;flex-direction:column;min-height:0;font-size:13px}
.gt-chat-h{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.07);font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.gt-chat-h button{margin-left:auto}
.gt-badge{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#ff2bd6;color:#16020f;font-size:10px;display:inline-grid;place-items:center}
.gt-lines{overflow-y:auto;max-height:200px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;overscroll-behavior:contain}
.gt-line{display:flex;gap:7px;align-items:flex-start;line-height:1.35}
.gt-line b{color:#9fefff;font-weight:800;white-space:nowrap}
.gt-line.me b{color:#ffd166}
.gt-line .gt-t{overflow-wrap:anywhere;flex:1;min-width:0}
.gt-line.quick .gt-t{color:#3dff9a;font-weight:700}
.gt-line.sys{justify-content:center;font-size:11px;opacity:.6;font-style:italic}
.gt-line .gt-more{opacity:0;background:none;border:0;color:inherit;cursor:pointer;padding:0 2px;font-size:14px;line-height:1}
.gt-line:hover .gt-more,.gt-line .gt-more:focus-visible{opacity:.7}
.gt-menu{display:flex;gap:6px;padding:0 10px 6px;font-size:11px}
.gt-menu button{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:inherit;border-radius:8px;padding:3px 8px;cursor:pointer}
.gt-quick{display:flex;gap:6px;overflow-x:auto;padding:6px 10px;scrollbar-width:none}
.gt-quick::-webkit-scrollbar{display:none}
.gt-quick button{flex:none;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:800;background:rgba(61,255,154,.1);border:1px solid rgba(61,255,154,.35);color:#c9ffe2;cursor:pointer}
.gt-quick button:disabled{opacity:.4;cursor:default}
.gt-form{display:flex;gap:6px;padding:0 10px 10px}
.gt-form input{flex:1;min-width:0;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:inherit;padding:8px 10px;font-size:13px}
.gt-form input:focus{outline:none;border-color:rgba(0,240,255,.6)}
.gt-empty{opacity:.5;font-size:12px;text-align:center;padding:6px 0}
.gt-err{color:#ff7b9c;font-size:11px;padding:0 10px 8px}
.gt-voice{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.gt-vbtn{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border-radius:11px;font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;color:inherit;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)}
.gt-vbtn.on{background:rgba(61,255,154,.16);border-color:#3dff9a;color:#c9ffe2}
.gt-vbtn.hot{background:#3dff9a;color:#03150b;border-color:#3dff9a}
.gt-vbtn.mute{background:rgba(255,45,85,.18);border-color:#ff2d55;color:#ffd0da}
.gt-vbtn:disabled{opacity:.45;cursor:default}
.gt-vnote{font-size:11px;opacity:.65}
.gt-dock{position:fixed;left:14px;bottom:14px;z-index:2147482000;font-family:inherit;color:#e8fbff}
.gt-pill{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:#070814;border:1px solid rgba(0,240,255,.4);box-shadow:0 8px 30px rgba(0,0,0,.45),0 0 18px rgba(0,240,255,.15);cursor:pointer;color:inherit;font-size:12px;font-weight:900;letter-spacing:.06em}
.gt-panel{width:min(360px,calc(100vw - 28px));max-height:min(78vh,640px);overflow-y:auto;border-radius:20px;padding:12px;
  background:radial-gradient(120% 60% at 50% -10%,rgba(0,218,243,.14),transparent 60%),#070814;border:1px solid rgba(0,240,255,.28);box-shadow:0 12px 40px rgba(0,0,0,.55)}
.gt-ph{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.gt-ph b{font-size:13px;letter-spacing:.1em;text-transform:uppercase}
.gt-ph .gt-x{margin-left:auto;background:none;border:0;color:inherit;cursor:pointer;opacity:.7;padding:4px}
.gt-code{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.04);border:1px dashed rgba(0,240,255,.35);font-size:12px}
.gt-code strong{font-family:ui-monospace,monospace;font-size:16px;letter-spacing:.2em;color:#00f0ff}
.gt-code button{margin-left:auto}
.gt-members{display:flex;flex-direction:column;gap:6px;margin:10px 0}
.gt-mem{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}
.gt-mem.speaking{border-color:#3dff9a;box-shadow:0 0 0 1px #3dff9a inset}
.gt-mem .gt-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:700}
.gt-mem small{font-size:10px;opacity:.6;letter-spacing:.08em;text-transform:uppercase}
.gt-mem button{background:none;border:0;color:inherit;opacity:.65;cursor:pointer;padding:3px;font-size:11px}
.gt-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
.gt-row select,.gt-row input{flex:1;min-width:0;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:inherit;padding:8px 10px;font-size:13px}
.gt-row select option{background:#070814}
.gt-sec{font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;opacity:.55;margin-top:12px}
.gt-invite{padding:10px;border-radius:14px;border:1px solid rgba(255,209,102,.4);background:rgba(255,209,102,.07);margin-bottom:10px;font-size:13px}
/* the few shared game classes the dock uses outside a game screen (same values as GX_CSS) */
.gt-dock .gx-btn,.gt-chat .gx-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:38px;padding:0 14px;border-radius:12px;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#031016;background:#00f0ff;border:1px solid #00f0ff;cursor:pointer}
.gt-dock .gx-btn:disabled,.gt-chat .gx-btn:disabled{opacity:.45;cursor:default}
.gt-dock .gx-btn.ghost{color:inherit;background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14)}
.gt-dock .gx-av{display:inline-grid;place-items:center;border-radius:50%;object-fit:cover;background:#1b2140;font-size:11px;font-weight:900;color:#9fefff;flex:none}
.gt-dock .gx-small{font-size:11px;opacity:.65}
.gt-dock .gx-err{color:#ff7b9c;font-size:12px;text-align:center;margin:6px 0 0}
.gx-bad{color:#ff7b9c;opacity:1}
.gx-spin{animation:gx-spin 1s linear infinite}@keyframes gx-spin{to{transform:rotate(360deg)}}
`;
