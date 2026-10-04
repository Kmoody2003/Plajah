// ticketPublicPage - PURE HTML renderer for the customer ticket page served at GET /t/:token.
// Server-rendered, self-contained (inline CSS + ~40 lines of JS), mobile-first, no third-party scripts.
// Everything interpolated is escaped. The same function powers the dev preview (iframe srcdoc).
import type { PublicTicketView } from './ticketCore';

const esc = (s: any): string => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const money = (c: number): string => `$${(Math.max(0, c) / 100).toFixed(2)}`;
const safeUrl = (u: string): string => (/^https:\/\//i.test(u) ? u : '');

const CSS = `
:root{--bg:#0a0a0f;--card:rgba(255,255,255,.06);--line:rgba(255,255,255,.12);--tx:#f4f4f8;--mut:rgba(255,255,255,.55);--o:#FF8C00;--p:#D40055;--v:#6B0099;--ok:#06D6A0}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:radial-gradient(900px 500px at 10% -10%,rgba(107,0,153,.45),transparent),radial-gradient(700px 400px at 100% 0,rgba(212,0,85,.30),transparent),var(--bg);color:var(--tx);font:16px/1.45 Inter,system-ui,sans-serif;min-height:100vh}
.wrap{max-width:560px;margin:0 auto;padding:20px 16px 120px}
h1{font:900 italic 34px/1 Outfit,Inter,sans-serif;text-transform:uppercase;letter-spacing:-.02em;margin:6px 0 2px}
.sub{color:var(--mut);font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.12em}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:14px;margin-top:14px;backdrop-filter:blur(14px)}
.pill{display:inline-block;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;background:linear-gradient(135deg,var(--v),var(--p) 55%,var(--o))}
.kv{display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:14px}.kv span:first-child{color:var(--mut)}
.line{border-top:1px solid var(--line);padding:14px 0}.line:first-child{border-top:0}
.row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.d{font-weight:700}.amt{font-weight:900;white-space:nowrap}.note{color:var(--mut);font-size:13px;margin-top:2px}
.state{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;margin-top:6px}
.APPROVED{color:var(--ok)}.DECLINED{color:var(--p)}.PENDING{color:var(--o)}
.photos{display:flex;gap:8px;overflow-x:auto;margin-top:8px}.photos img{height:84px;border-radius:12px;border:1px solid var(--line)}
.btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
button{font:900 15px Inter,sans-serif;min-height:52px;border-radius:16px;border:2px solid var(--line);background:transparent;color:var(--tx);text-transform:uppercase;letter-spacing:.06em;cursor:pointer}
button.on.ap{background:var(--ok);color:#001a12;border-color:var(--ok)}button.on.de{background:var(--p);border-color:var(--p)}
.total{font:900 italic 30px Outfit,Inter,sans-serif}
.bar{position:fixed;left:0;right:0;bottom:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:rgba(10,10,15,.92);border-top:1px solid var(--line);backdrop-filter:blur(14px)}
.bar .in{max-width:560px;margin:0 auto}
.go{width:100%;background:linear-gradient(135deg,var(--v),var(--p) 55%,var(--o));border:0;color:#fff;font-size:17px;min-height:56px}
.go[disabled]{opacity:.4}.fine{font-size:12px;color:var(--mut);margin:0 0 8px}.msg{margin-top:10px;font-weight:700}
`;

/** Pack-supplied status block (progress steps, ready-by time, facts). Empty string when the pack adds nothing. */
function extrasHtml(v: PublicTicketView): string {
  const x = v.extras; if (!x) return '';
  const steps = (x.progress || []).map(p => `<li class="st ${esc(p.state)}"><i></i><span>${esc(p.label)}</span></li>`).join('');
  const facts = (x.facts || []).map(f => `<div class="kv"><span>${esc(f.label)}</span><span>${esc(f.value)}</span></div>`).join('');
  const by = x.readyByAt ? `<div class="kv"><span>Ready by</span><span><time id="rby" data-ts="${Math.round(Number(x.readyByAt))}">${esc(new Date(x.readyByAt).toUTCString().replace(/ GMT$/, ' UTC'))}</time></span></div>` : '';
  return `<style>.prog{list-style:none;margin:0;padding:0;display:flex;gap:4px}.st{flex:1;text-align:center;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}.st i{display:block;height:6px;border-radius:99px;background:var(--line);margin-bottom:6px}.st.done i{background:var(--ok)}.st.current i{background:linear-gradient(90deg,var(--p),var(--o))}.st.current,.st.done{color:var(--tx)}.ban{font-weight:800;margin:0 0 10px}</style>`
    + `<div class="card">${x.banner ? `<p class="ban">${esc(x.banner)}</p>` : ''}${steps ? `<ol class="prog" aria-label="Progress">${steps}</ol>` : ''}${by}${facts}</div>`
    + (x.readyByAt ? `<script>(function(){var e=document.getElementById('rby');if(e){var d=new Date(Number(e.dataset.ts));if(!isNaN(d))e.textContent=d.toLocaleString([], {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}})()</script>` : '');
}

/** Optional line grouping (pack-driven: auto DVI priority). Keys unknown to the map fall back to the key text. */
const GROUP_ORDER = ['SAFETY', 'SOON', 'LATER'];
const GROUP_LABEL: Record<string, string> = { SAFETY: 'Do now (safety)', SOON: 'Soon', LATER: 'Later / keep an eye on' };
const GROUP_COLOR: Record<string, string> = { SAFETY: '#D40055', SOON: '#FF8C00', LATER: '#06D6A0' };
function renderGrouped(ls: PublicTicketView['lines'], one: (l: PublicTicketView['lines'][number]) => string): string {
  if (!ls.some(l => l.group)) return ls.map(one).join('');
  const keys = [...new Set(ls.map(l => l.group || ''))].sort((a, b) => (GROUP_ORDER.indexOf(a) < 0 ? 99 : GROUP_ORDER.indexOf(a)) - (GROUP_ORDER.indexOf(b) < 0 ? 99 : GROUP_ORDER.indexOf(b)));
  return keys.map(k => `${k ? `<div class="sub" style="color:${esc(GROUP_COLOR[k] || '#fff')};margin:14px 0 2px">${esc(GROUP_LABEL[k] || k)}</div>` : '<div class="sub" style="margin:14px 0 2px">Other</div>'}${ls.filter(l => (l.group || '') === k).map(one).join('')}`).join('');
}

export function renderTicketPage(v: PublicTicketView, opts: { token?: string; preview?: boolean; /** Pre-rendered, pre-escaped HTML section from a pack plug-in (e.g. the inspection report). */ extraHtml?: string } = {}): string {
  const decidable = v.canDecide;
  const lineHtml = (l: PublicTicketView['lines'][number]): string => {
    const photos = l.photos.map(safeUrl).filter(Boolean).slice(0, 6);
    const qty = l.qty === 1 ? '' : `${l.qty}${l.unit ? ' ' + esc(l.unit) : ' x'} @ ${money(l.unitPriceCents)}`;
    const ctl = decidable && l.approval === 'PENDING'
      ? `<div class="btns" data-line="${esc(l.id)}"><button type="button" class="ap">Approve</button><button type="button" class="de">Decline</button></div>`
      : `<div class="state ${esc(l.approval)}">${esc(l.approval === 'PENDING' ? 'Waiting' : l.approval.toLowerCase())}</div>`;
    return `<div class="line"><div class="row"><div><div class="d">${esc(l.description)}</div>${qty ? `<div class="note">${qty}</div>` : ''}${l.notes ? `<div class="note">${esc(l.notes)}</div>` : ''}</div><div class="amt">${money(l.amountCents)}</div></div>${photos.length ? `<div class="photos">${photos.map(p => `<img src="${esc(p)}" alt="" loading="lazy">`).join('')}</div>` : ''}${ctl}</div>`;
  };
  const lines = renderGrouped(v.lines, lineHtml);
  const subj = v.subjectSummary.map(s => `<div class="kv"><span>${esc(s.label)}</span><span>${esc(s.value)}</span></div>`).join('');
  const pics = v.photos.map(safeUrl).filter(Boolean).slice(0, 8);
  const msgs = v.messages.slice(-3).map(m => `<div class="note">${esc(m)}</div>`).join('');
  const script = decidable && opts.token ? `
<script>(function(){var d={};var el=document.querySelectorAll('[data-line]');var go=document.getElementById('go'),msg=document.getElementById('msg');
function upd(){var n=0;el.forEach(function(x){if(d[x.dataset.line])n++});go.disabled=n<el.length;go.textContent=n<el.length?('Choose for '+(el.length-n)+' more'):'Send my answer'}
el.forEach(function(x){x.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){var a=b.classList.contains('ap');d[x.dataset.line]=a?'APPROVED':'DECLINED';x.querySelector('.ap').classList.toggle('on',a);x.querySelector('.de').classList.toggle('on',!a);upd()})})});
go.addEventListener('click',function(){go.disabled=true;go.textContent='Sending...';fetch(location.pathname+'/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decisions:d})}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(r){if(r.ok){location.reload()}else{msg.textContent=r.j.error||'Something went wrong.';go.disabled=false;upd()}}).catch(function(){msg.textContent='Network problem. Try again.';go.disabled=false;upd()})});upd()})();</script>` : '';
  const bar = decidable ? `<div class="bar"><div class="in"><p class="fine">${esc(v.consentText)}</p><button id="go" class="go" type="button" disabled>Choose</button><div id="msg" class="msg"></div></div></div>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${esc(v.number)} - ${esc(v.businessName)}</title><style>${CSS}</style></head><body><div class="wrap">
<div class="sub">${esc(v.businessName)}</div><h1>${esc(v.number)}</h1><span class="pill">${esc(v.stageLabel)}</span>${extrasHtml(v)}
${subj ? `<div class="card">${subj}</div>` : ''}
${msgs ? `<div class="card">${msgs}</div>` : ''}
${pics.length ? `<div class="card"><div class="photos">${pics.map(p => `<img src="${esc(p)}" alt="" loading="lazy">`).join('')}</div></div>` : ''}
${opts.extraHtml || ''}
<div class="card">${lines || '<div class="note">No items yet.</div>'}</div>
<div class="card">
<div class="kv"><span>Tax</span><span>${money(v.taxCents)}</span></div>
${v.depositsCents ? `<div class="kv"><span>Deposit paid</span><span>-${money(v.depositsCents)}</span></div>` : ''}
${v.pendingCents ? `<div class="kv"><span>Waiting for your answer</span><span>${money(v.pendingCents)}</span></div>` : ''}
<div class="row" style="margin-top:6px"><span class="sub">${decidable ? 'Estimate total' : 'Approved total'}</span><span class="total">${money(decidable ? v.estimateTotalCents : v.approvedTotalCents)}</span></div>
${v.balanceCents ? `<div class="kv"><span>Balance due</span><span>${money(v.balanceCents)}</span></div>` : ''}
</div>${opts.preview ? '<p class="fine" style="margin-top:12px">Preview: buttons are live but nothing is sent.</p>' : ''}
</div>${bar}${script}</body></html>`;
}

export function renderTicketMessagePage(title: string, text: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="wrap"><h1>${esc(title)}</h1><div class="card"><p>${esc(text)}</p></div></div></body></html>`;
}
