// Scoped styles for the Christian Ed hub + class clubs. Same tokens as ClassroomClubView (the club layout),
// so a church class reads as a Plajah club: cover, channel pills, feed column, right rail.
export const ED_CSS = `
.ce{
  --purple:#6B0099;--magenta:#D40055;--orange:#FF8C00;--cyan:#00DAF3;--lilac:#D0BCFF;
  --ok:#06D6A0;--warn:#F59E0B;--bad:#FF5470;
  --brand:linear-gradient(135deg,#6B0099,#D40055);--warm:linear-gradient(120deg,#6B0099,#D40055 55%,#FF8C00);
  --panel:#0d0b14;--panel2:#141020;--ink:#f4f1f7;--dim:rgba(244,241,247,.66);--faint:rgba(244,241,247,.42);
  --g1:rgba(255,255,255,.04);--g2:rgba(255,255,255,.07);--g3:rgba(255,255,255,.11);
  --bd:rgba(255,255,255,.1);--bd2:rgba(255,255,255,.18);
  --fd:"Outfit","Space Grotesk",system-ui,sans-serif;--fb:"Inter",system-ui,sans-serif;--fm:"JetBrains Mono",ui-monospace,monospace;
  font-family:var(--fb);color:var(--ink);line-height:1.5;display:grid;gap:16px;min-width:0
}
.ce *{box-sizing:border-box}
.ce h1,.ce h2,.ce h3,.ce h4{font-family:var(--fd);margin:0;text-wrap:balance}
.ce p{margin:0}
.ce button{font:inherit}
.ce button:focus-visible,.ce input:focus-visible,.ce select:focus-visible,.ce textarea:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
.ce .eyebrow{font-family:var(--fd);font-weight:800;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--orange)}
.ce .small{font-size:.76rem;color:var(--faint)}
.ce .dim{color:var(--dim)}
.ce .row{display:flex;gap:12px;align-items:center;min-width:0}
.ce .row.wrap{flex-wrap:wrap}
.ce .grow{flex:1;min-width:0}
.ce .stack{display:grid;gap:10px;min-width:0}
.ce .btn{appearance:none;border:1px solid transparent;cursor:pointer;font-family:var(--fd);font-weight:700;height:36px;padding:0 15px;border-radius:99px;font-size:.8rem;display:inline-flex;gap:6px;align-items:center;white-space:nowrap;color:var(--ink);background:var(--g2);border-color:var(--bd)}
.ce .btn:hover{background:var(--g3)}
.ce .btn:disabled{opacity:.5;cursor:default}
.ce .btn.p{background-image:var(--warm);border-color:transparent;color:#fff;box-shadow:0 6px 20px rgba(212,0,85,.3)}
.ce .btn.p:hover{filter:brightness(1.08)}
.ce .btn.sm{height:30px;font-size:.72rem;padding:0 11px}
.ce .btn.link{background:transparent;border-color:transparent;color:var(--cyan);padding:0 4px}
.ce .tag{font-family:var(--fd);font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:3px 8px;border-radius:99px;white-space:nowrap;background:var(--g2);color:var(--dim)}
.ce .tag.soon{background:rgba(245,158,11,.16);color:var(--warn)}
.ce .tag.done{background:rgba(6,214,160,.16);color:var(--ok)}
.ce .tag.open{background:rgba(0,218,243,.12);color:var(--cyan)}
.ce .tag.hot{background:rgba(212,0,85,.22);color:#ff7aa8}
.ce .tag.key{background:rgba(208,188,255,.14);color:var(--lilac)}
.ce .card{border:1px solid var(--bd);background:var(--g1);border-radius:16px;padding:12px 14px;display:grid;gap:6px;min-width:0}
.ce .card .t{font-family:var(--fd);font-weight:800;font-size:.9rem;overflow-wrap:anywhere}
.ce .card .u{font-size:.76rem;color:var(--faint);overflow-wrap:anywhere}
.ce .card.click{cursor:pointer;text-align:left;color:inherit;width:100%}
.ce .card.click:hover{background:var(--g2)}
.ce .panel{border:1px solid var(--bd);background:var(--panel);border-radius:22px;overflow:hidden;min-width:0}
.ce .panel .ph{padding:13px 16px;border-bottom:1px solid var(--bd);display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.ce .panel .ph h3{font-size:.92rem;font-weight:800}
.ce .panel .pb{padding:14px 16px;display:grid;gap:10px}
.ce .ic{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;font-family:var(--fd);font-weight:900;font-size:.72rem;color:#fff;flex-shrink:0;background:var(--brand)}
.ce .av{width:32px;height:32px;border-radius:99px;display:grid;place-items:center;font-weight:800;font-size:.66rem;color:#fff;flex-shrink:0;background:var(--brand);overflow:hidden}
.ce .av img{width:100%;height:100%;object-fit:cover}
.ce .field{width:100%;background:rgba(0,0,0,.35);border:1px solid var(--bd);border-radius:12px;padding:9px 12px;color:var(--ink);font-size:.86rem;outline:none}
.ce .field:focus{border-color:rgba(255,140,0,.55)}
.ce textarea.field{resize:vertical;min-height:70px}
.ce label.lbl{display:grid;gap:5px;font-size:.72rem;font-weight:700;color:var(--faint)}
.ce .chips{display:flex;gap:6px;flex-wrap:wrap}
.ce .chip{appearance:none;font-size:.74rem;font-weight:600;padding:6px 11px;border-radius:99px;border:1px solid var(--bd);background:var(--g1);color:var(--dim);cursor:pointer}
.ce .chip[aria-pressed="true"]{border-color:var(--magenta);color:#fff;background:rgba(212,0,85,.2)}
.ce .err{border:1px solid rgba(255,84,112,.4);background:rgba(255,84,112,.08);color:#ffb3c0;border-radius:12px;padding:9px 12px;font-size:.8rem}
.ce .okmsg{border:1px solid rgba(6,214,160,.35);background:rgba(6,214,160,.08);color:#9ff0d6;border-radius:12px;padding:9px 12px;font-size:.8rem}

/* hub */
.ce .hubhead{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}
.ce .hubhead h2{font-size:clamp(1.5rem,4vw,2.1rem);font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:-.02em;line-height:.95}
.ce .today{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.ce .stat{appearance:none;text-align:left;border:1px solid var(--bd);background:var(--g1);border-radius:16px;padding:12px 14px;display:grid;gap:2px;color:inherit;cursor:pointer}
.ce .stat:hover{background:var(--g2)}
.ce .stat .v{font-family:var(--fm);font-weight:700;font-size:1.45rem;font-variant-numeric:tabular-nums}
.ce .stat .l{font-size:.74rem;color:var(--faint)}
.ce .stat.hot{border-color:rgba(255,140,0,.45)}
.ce .stat.hot .v{color:var(--orange)}
.ce .stat.calm .v{color:var(--ok)}
.ce .clubs{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.ce .club{appearance:none;border:1px solid var(--bd);border-radius:20px;overflow:hidden;background:var(--g1);display:grid;cursor:pointer;text-align:left;color:inherit;padding:0}
.ce .club:hover{border-color:var(--bd2);background:var(--g2)}
.ce .club .art{height:84px;position:relative}
.ce .club .art span{position:absolute;right:12px;top:6px;font-family:var(--fd);font-weight:900;font-style:italic;font-size:2rem;color:rgba(255,255,255,.35)}
.ce .club .b{padding:11px 13px 13px;display:grid;gap:4px}
.ce .club .b .t{font-family:var(--fd);font-weight:800;font-size:.94rem}
.ce .club .b .u{font-size:.72rem;color:var(--faint)}
.ce .club .flags{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.ce .club.add{border-style:dashed;place-items:center;min-height:150px;color:var(--dim);font-family:var(--fd);font-weight:800}

/* class club */
.ce .back{appearance:none;border:1px solid var(--bd);background:var(--g2);color:var(--dim);cursor:pointer;font-family:var(--fd);font-weight:700;font-size:.78rem;height:34px;padding:0 14px;border-radius:99px;justify-self:start}
.ce .cover{position:relative;border-radius:26px;overflow:hidden;min-height:180px;display:flex;align-items:flex-end;border:1px solid var(--bd2)}
.ce .cover .art{position:absolute;inset:0}
.ce .cover .art::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(4,3,8,.92),transparent 70%)}
.ce .cover .ci{position:relative;z-index:1;padding:clamp(16px,3vw,26px);width:100%;display:grid;gap:8px}
.ce .cover h1{font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:-.02em;line-height:.92;font-size:clamp(1.7rem,5vw,3rem);color:#fff}
.ce .cover .meta{display:flex;gap:14px;flex-wrap:wrap;font-size:.8rem;color:rgba(255,255,255,.8);font-weight:600}
.ce .cchips{display:flex;gap:6px;flex-wrap:wrap}
.ce .cchip{font-family:var(--fd);font-size:.58rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:4px 9px;border-radius:7px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.18);color:#fff}
.ce .cchip.live{background:#D40055;border-color:transparent}
.ce .channels{display:flex;gap:4px;padding:5px;border-radius:99px;background:var(--g2);border:1px solid var(--bd);width:max-content;max-width:100%;overflow-x:auto}
.ce .channels button{appearance:none;border:0;background:transparent;color:var(--dim);cursor:pointer;font-family:var(--fd);font-weight:700;font-size:.78rem;padding:0 15px;height:34px;border-radius:99px;white-space:nowrap;display:inline-flex;gap:6px;align-items:center}
.ce .channels button[aria-pressed="true"]{background:var(--brand);color:#fff}
.ce .channels button:not([aria-pressed="true"]):hover{color:var(--ink);background:var(--g3)}
.ce .badge{font-family:var(--fm);font-size:.62rem;background:rgba(255,140,0,.22);color:var(--orange);padding:1px 6px;border-radius:99px}
.ce .cgrid{display:grid;gap:16px;grid-template-columns:1fr}
@media(min-width:980px){.ce .cgrid{grid-template-columns:minmax(0,1fr) 290px;align-items:start}}
.ce .rail{display:grid;gap:12px}
.ce .rail h5{margin:0;font-family:var(--fd);font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.ce .code{font-family:var(--fm);font-weight:700;font-size:1.1rem;letter-spacing:.08em;color:var(--orange)}
.ce .wk{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center}
.ce .wk .n{font-family:var(--fm);font-weight:700;font-size:.8rem;color:var(--faint);text-align:center}
.ce .people .row{padding:7px 0;border-top:1px solid var(--bd)}
.ce .people .row:first-child{border-top:0}
.ce .sheet{border:1px solid var(--bd2);border-radius:20px;background:var(--panel2);padding:16px;display:grid;gap:12px;box-shadow:0 20px 50px rgba(0,0,0,.45)}
.ce .sheet h3{font-size:1.02rem;font-weight:800}
.ce .split{display:grid;gap:12px;grid-template-columns:1fr}
@media(min-width:760px){.ce .split{grid-template-columns:1fr 1fr}}
.ce .ans{border:1px solid var(--bd);border-radius:12px;background:rgba(0,0,0,.3);padding:10px 12px;font-size:.86rem;white-space:pre-wrap;overflow-wrap:anywhere}
.ce .ans.key{border-color:rgba(208,188,255,.3);background:rgba(208,188,255,.06);color:var(--lilac)}
.ce .meter{height:6px;border-radius:99px;background:var(--g3);overflow:hidden}
.ce .meter i{display:block;height:100%;border-radius:99px;background:var(--ok)}
.ce .empty{border:1px dashed var(--bd2);border-radius:18px;padding:22px;text-align:center;display:grid;gap:8px;justify-items:center;color:var(--dim)}
.ce .empty .t{font-family:var(--fd);font-weight:800;color:var(--ink)}
@media(prefers-reduced-motion:reduce){.ce *{transition:none!important}}
`;

/** Cover art per class, picked from the class id so it stays stable. Plajah gradient family only. */
const COVERS = [
  'radial-gradient(120% 100% at 12% 0%,rgba(255,140,0,.75),transparent 60%),radial-gradient(100% 100% at 100% 100%,rgba(212,0,85,.6),transparent 55%),#24130d',
  'radial-gradient(120% 100% at 12% 0%,rgba(107,0,153,.8),transparent 60%),radial-gradient(100% 100% at 100% 100%,rgba(212,0,85,.6),transparent 55%),#1a0f24',
  'radial-gradient(120% 100% at 12% 0%,rgba(0,169,192,.7),transparent 60%),radial-gradient(100% 100% at 100% 100%,rgba(107,0,153,.65),transparent 55%),#0b1724',
  'radial-gradient(120% 100% at 12% 0%,rgba(6,214,160,.55),transparent 60%),radial-gradient(100% 100% at 100% 100%,rgba(10,74,96,.8),transparent 55%),#071a17',
];
export function coverFor(id: string, hue?: string): string {
  if (hue) return hue;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COVERS[h % COVERS.length];
}

export const initials = (name: string) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('') || '?';
