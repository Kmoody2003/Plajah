// Announcement surfaces reuse the club tokens (.ce, components/church/christianEd/edStyles) and add these.
import { ED_CSS } from '../church/christianEd/edStyles';

export const AN_CSS = ED_CSS + `
.an .ann{border:1px solid var(--bd);background:var(--panel);border-radius:20px;padding:14px 16px;display:grid;gap:12px;min-width:0}
.an .ann.pin{border-color:rgba(255,140,0,.45);box-shadow:0 0 0 1px rgba(255,140,0,.15) inset}
.an .ann .who{font-family:var(--fd);font-weight:800;font-size:.86rem}
.an .ann .txt{font-size:.9rem;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink)}
.an .opt{appearance:none;width:100%;text-align:left;border:1px solid var(--bd);background:var(--g1);color:var(--ink);border-radius:12px;padding:10px 12px;cursor:pointer;display:flex;gap:10px;align-items:center;font-size:.84rem;position:relative;overflow:hidden}
.an .opt[aria-pressed="true"]{border-color:var(--magenta);background:rgba(212,0,85,.16)}
.an .opt .bar{position:absolute;inset:0 auto 0 0;background:rgba(0,218,243,.14);z-index:0}
.an .opt > *{position:relative;z-index:1}
.an .opt .pct{margin-left:auto;font-family:var(--fm);font-size:.74rem;color:var(--dim)}
.an.overlay,.an .overlay{position:fixed;inset:0;z-index:520;display:grid;place-items:center;padding:16px;background:rgba(5,3,10,.72);backdrop-filter:blur(6px)}
.an.overlay > .box,.an .overlay > .box{width:min(1100px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#0f0c17;border:1px solid var(--bd2);border-radius:24px;padding:18px;display:grid;gap:14px}
.an .compose{display:grid;gap:16px}
@media (min-width:900px){.an .compose.two{grid-template-columns:minmax(0,1fr) minmax(0,420px);align-items:start}}
.an .presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.an .preset{appearance:none;border:1px solid var(--bd);background:var(--g1);border-radius:14px;padding:8px;cursor:pointer;display:grid;gap:6px;text-align:left;color:var(--ink)}
.an .preset[aria-pressed="true"]{border-color:var(--orange);box-shadow:0 0 0 1px var(--orange) inset}
.an .preset .sw{height:46px;border-radius:9px;display:grid;place-items:center;font-family:var(--fd);font-weight:900;font-size:.9rem}
.an .preset .n{font-family:var(--fd);font-weight:800;font-size:.72rem}
.an .qrow{border:1px dashed var(--bd2);border-radius:14px;padding:10px;display:grid;gap:8px}
.an .seg{display:inline-flex;border:1px solid var(--bd);border-radius:99px;padding:3px;background:var(--g1);gap:2px}
.an .seg button{appearance:none;border:0;background:transparent;color:var(--dim);font-family:var(--fd);font-weight:800;font-size:.76rem;padding:7px 14px;border-radius:99px;cursor:pointer}
.an .seg button[aria-pressed="true"]{background:var(--g3);color:#fff}
.an .sticky-prev{position:sticky;top:0}
`;
