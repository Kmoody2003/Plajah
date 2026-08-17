/**
 * Praxis export — turn the living Blueprint into a real, professional business
 * plan the founder can keep, print, or save as PDF.
 *
 * Assembles a clean print-ready HTML document from everything the eight chapters
 * populated (thesis, market, structure, financials, compliance, funding, growth)
 * and opens it for printing (Save as PDF). Zero dependencies, fully client-side;
 * falls back to an HTML download if the print window is blocked.
 */
import type { Venture } from './praxisService';
import { getEntity } from '../data/praxisJourney';

const num = (s?: string): number => {
  const n = parseFloat((s || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};
const money = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const esc = (s?: string) => (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'venture';

const LABELS: Record<string, string> = {
  // funding rungs
  bootstrap: 'Bootstrapping', revenue: 'Revenue-based financing', credit: 'Business credit & loans',
  grants: 'Grants', crowdfund: 'Crowdfunding', microloan: 'Microloan / SBA', angel: 'Angel investment', vc: 'Venture capital',
  // money moves
  reinvest: 'Reinvest in growth', bizcredit: 'Build business credit', safety: 'Cash safety reserve',
  invest: 'Invest the surplus', crypto: 'Learn crypto & blockchain',
  // pricing
  value: 'Value-based', competitor: 'Competitor-anchored', cost_plus: 'Cost-plus',
};
const humanize = (k: string) => LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const list = (csv?: string) => (csv || '').split(',').filter(Boolean).map(humanize);

/** One document section — rendered only when it has content. */
const section = (title: string, bodyHtml: string) => bodyHtml.trim() ? `<section><h2>${esc(title)}</h2>${bodyHtml}</section>` : '';
const field = (label: string, value?: string) => value && value.trim() ? `<div class="field"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>` : '';
const para = (label: string, value?: string) => value && value.trim() ? `<div class="para"><h3>${esc(label)}</h3><p>${esc(value)}</p></div>` : '';

export function buildBusinessPlanHtml(v: Venture): string {
  const p = v.plan;
  const entity = getEntity(p.form_entity);
  const where = [v.jurisdiction.city, v.jurisdiction.state, v.jurisdiction.country].filter(Boolean).join(', ');

  // Financials
  const rev = num(p.books_revenue), cogs = num(p.books_cogs);
  const opex = num(p.books_payroll) + num(p.books_rent) + num(p.books_marketing) + num(p.books_other);
  const gross = rev - cogs, net = gross - opex;
  const gm = rev ? Math.round((gross / rev) * 100) : 0, nm = rev ? Math.round((net / rev) * 100) : 0;
  const hasPL = rev > 0;

  // Funding
  const raise = num(p.fund_amount), pre = num(p.fund_premoney), postm = pre + raise;
  const invPct = postm > 0 ? Math.round((raise / postm) * 100) : 0;

  // Growth
  const cac = num(p.grow_cac), ltv = num(p.grow_ltv);
  const ratio = cac > 0 ? (ltv / cac) : 0;

  const complyItems = list(p.comply_items);

  const summary = section('Executive summary',
    para('The idea', v.thesis || p.spark_thesis) +
    para('Why it matters', v.purpose) +
    para('Who we serve', v.serves || p.icp_who));

  const offering = section('The offering', (
    para('Value we create', p.bmc_value) +
    para('Our customer', p.bmc_customer) +
    para('How we make money', p.bmc_revenue)
  ));

  const market = section('Market & validation', (
    (p.val_tam || p.val_sam || p.val_som ? `<table class="tbl"><thead><tr><th>Market</th><th>Size</th></tr></thead><tbody>
      <tr><td>Total (everyone with the problem)</td><td>${esc(p.val_tam) || '—'}</td></tr>
      <tr><td>Serviceable (who we can reach)</td><td>${esc(p.val_sam) || '—'}</td></tr>
      <tr><td>Obtainable (year one)</td><td>${esc(p.val_som) || '—'}</td></tr></tbody></table>` : '') +
    para('Ideal customer', p.icp_who) +
    para('Their problem', p.icp_problem) +
    para('Where we reach them', p.icp_where) +
    field('Starting price', p.price ? `$${p.price}${p.price_basis ? ` · ${humanize(p.price_basis)}` : ''}` : '')
  ));

  const doneSteps = Object.keys(p).filter(k => k.startsWith('form_ck_') && p[k] === '1').map(k => humanize(k.replace('form_ck_', '')));
  const company = section('Company & structure', (
    field('Legal structure', entity?.label) +
    (entity ? `<p class="note">${esc(entity.liability)} ${esc(entity.taxes)}</p>` : '') +
    field('Jurisdiction', where) +
    field('Business page', v.orgId ? 'Launched on Plajah' : 'Planned') +
    (doneSteps.length ? `<div class="field"><span class="k">Formation steps done</span><span class="v">${esc(doneSteps.join(', '))}</span></div>` : '')
  ));

  const plBody = hasPL
    ? `<table class="tbl pl"><tbody>
      <tr><td>Revenue</td><td class="n">${money(rev)}</td></tr>
      <tr><td>Cost of goods</td><td class="n">(${money(cogs)})</td></tr>
      <tr class="sub"><td>Gross profit <em>· ${gm}% margin</em></td><td class="n">${money(gross)}</td></tr>
      <tr><td>Operating expenses</td><td class="n">(${money(opex)})</td></tr>
      <tr class="tot"><td>Net profit <em>· ${nm}% margin</em></td><td class="n">${money(net)}</td></tr>
    </tbody></table>
    <p class="note">Illustrative first month · ${esc(humanize(p.books_method || 'cash'))} basis${p.books_accounts ? ` · accounts: ${list(p.books_accounts).join(', ')}` : ''}.</p>`
    : '';
  const financials = section('Financial plan', plBody + field('Accounting method', p.books_method ? humanize(p.books_method) : ''));

  const complyBody = complyItems.length
    ? `<p>Tracked obligations (${complyItems.length}):</p><ul>${complyItems.map(i => `<li>${esc(i)}</li>`).join('')}</ul><p class="note">Reminders ${p.comply_reminders === '0' ? 'off' : 'on'}.</p>`
    : '';
  const compliance = section('Compliance & governance', complyBody);

  const funding = section('Funding', (
    (p.fund_rungs ? `<div class="field"><span class="k">Capital path</span><span class="v">${list(p.fund_rungs).join(' → ')}</span></div>` : '') +
    field('Target raise', p.fund_amount ? money(raise) : '') +
    para('Use of funds', p.fund_use) +
    (raise > 0 && pre > 0 ? `<div class="field"><span class="k">Dilution</span><span class="v">${money(raise)} on ${money(pre)} pre-money → investors ~${invPct}%, founders ~${100 - invPct}%</span></div>` : '')
  ));

  const growth = section('Growth & wealth', (
    (cac > 0 || ltv > 0 ? `<table class="tbl"><tbody>
      <tr><td>Cost to acquire a customer (CAC)</td><td class="n">${money(cac)}</td></tr>
      <tr><td>Lifetime value (LTV)</td><td class="n">${money(ltv)}</td></tr>
      <tr class="tot"><td>LTV : CAC</td><td class="n">${ratio ? ratio.toFixed(1) + ' : 1' : '—'}</td></tr>
    </tbody></table>` : '') +
    (p.grow_moves ? `<div class="field"><span class="k">Money moves</span><span class="v">${list(p.grow_moves).join(', ')}</span></div>` : '')
  ));

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(v.name)} — Business Plan</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; color: #1b1726; background: #f4f2f7; font-family: Georgia, 'Times New Roman', serif; line-height: 1.55; }
  .page { max-width: 820px; margin: 0 auto; background: #fff; padding: 64px 72px; box-shadow: 0 10px 40px rgba(0,0,0,.12); }
  h1, h2, h3, .eyebrow, th, .k { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
  .cover { border-bottom: 3px solid #6B0099; padding-bottom: 28px; margin-bottom: 36px; }
  .eyebrow { font-size: 11px; font-weight: 800; letter-spacing: .28em; text-transform: uppercase; color: #D40055; margin: 0 0 10px; }
  h1 { font-size: 40px; font-weight: 800; letter-spacing: -.02em; margin: 0 0 8px; color: #1b1726; }
  .thesis { font-size: 17px; color: #4a445a; font-style: italic; margin: 0 0 18px; }
  .meta { font-size: 12px; color: #8a8398; font-family: 'Segoe UI', system-ui, sans-serif; letter-spacing: .02em; }
  section { margin: 30px 0; page-break-inside: avoid; }
  h2 { font-size: 17px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: #6B0099; border-bottom: 1px solid #ece8f2; padding-bottom: 7px; margin: 0 0 14px; }
  h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #8a8398; margin: 14px 0 3px; }
  p { margin: 0 0 4px; }
  .para p { color: #2c2738; }
  .field { display: flex; gap: 14px; padding: 6px 0; border-bottom: 1px dotted #ece8f2; }
  .field .k { flex: 0 0 180px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #8a8398; }
  .field .v { flex: 1; }
  .note { font-size: 13px; color: #8a8398; font-style: italic; }
  .tbl { width: 100%; border-collapse: collapse; margin: 6px 0 8px; font-family: 'Segoe UI', system-ui, sans-serif; }
  .tbl th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8a8398; border-bottom: 2px solid #ece8f2; padding: 6px 8px; }
  .tbl td { padding: 7px 8px; border-bottom: 1px solid #f0edf5; font-size: 14px; }
  .tbl td.n { text-align: right; font-variant-numeric: tabular-nums; }
  .pl .sub td { font-weight: 700; border-top: 1px solid #ddd7e6; }
  .pl .tot td { font-weight: 800; font-size: 15px; border-top: 2px solid #6B0099; color: #1b1726; }
  .tbl em { color: #8a8398; font-style: normal; font-weight: 500; font-size: 12px; }
  ul { margin: 4px 0; padding-left: 20px; } li { margin: 2px 0; }
  .foot { margin-top: 44px; padding-top: 16px; border-top: 1px solid #ece8f2; font-size: 11px; color: #a49db0; font-family: 'Segoe UI', system-ui, sans-serif; }
  @media print {
    body { background: #fff; } .page { box-shadow: none; max-width: none; padding: 0; }
    @page { margin: 20mm; }
  }
</style></head>
<body><div class="page">
  <div class="cover">
    <p class="eyebrow">Business Plan</p>
    <h1>${esc(v.name)}</h1>
    ${v.thesis || p.spark_thesis ? `<p class="thesis">${esc(v.thesis || p.spark_thesis)}</p>` : ''}
    <p class="meta">${esc(where || 'United States')} &nbsp;·&nbsp; ${today} &nbsp;·&nbsp; Prepared with Plajah Praxis</p>
  </div>
  ${summary}${offering}${market}${company}${financials}${compliance}${funding}${growth}
  <p class="foot">Built in Plajah Praxis with Aria. This plan is a working document and an educational aid — not legal, tax, or investment advice. Confirm anything binding with a licensed professional.</p>
</div></body></html>`;
}

/** Open the plan for printing (Save as PDF), or download it if the popup is blocked. */
export function exportBusinessPlan(v: Venture): void {
  const html = buildBusinessPlanHtml(v);
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${slug(v.name)}-business-plan.html`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  w.document.write(html);
  w.document.close();
  w.onload = () => { try { w.focus(); w.print(); } catch { /* user can print manually */ } };
}
