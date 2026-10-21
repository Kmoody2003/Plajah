// Shared chrome for the business CRM + Correspondence Studio. Scoped CSS (crm- prefix) so it renders the
// same whether it is mounted inside the business dashboard or on its own.
import React from 'react';

export const CRM_COLORS = {
  bg: '#0E0C13',
  panel: '#18141F',
  raised: '#221D2B',
  line: 'rgba(255,255,255,0.08)',
  ink: '#F2EEF6',
  muted: '#A49CB2',
  purple: '#6B0099',
  magenta: '#D40055',
  orange: '#FF8C00',
};

const CSS = `
.crm-root{--crm-bg:${CRM_COLORS.bg};--crm-panel:${CRM_COLORS.panel};--crm-raised:${CRM_COLORS.raised};--crm-line:${CRM_COLORS.line};--crm-ink:${CRM_COLORS.ink};--crm-muted:${CRM_COLORS.muted};--crm-purple:${CRM_COLORS.purple};--crm-magenta:${CRM_COLORS.magenta};
  background:var(--crm-bg);color:var(--crm-ink);font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.45;border-radius:24px;}
.crm-root *{box-sizing:border-box}
.crm-h{font-family:'Bricolage Grotesque',Inter,sans-serif;font-weight:700;letter-spacing:-0.01em;margin:0;color:var(--crm-ink)}
.crm-h1{font-size:22px}.crm-h2{font-size:17px}.crm-h3{font-size:14px}
.crm-num{font-variant-numeric:tabular-nums}
.crm-muted{color:var(--crm-muted)}
.crm-small{font-size:12px}
.crm-card{background:var(--crm-panel);border:1px solid var(--crm-line);border-radius:24px}
.crm-raised{background:var(--crm-raised);border:1px solid var(--crm-line);border-radius:12px}
.crm-btn{min-height:44px;padding:0 16px;border-radius:12px;border:1px solid var(--crm-line);background:var(--crm-raised);color:var(--crm-ink);font:600 14px Inter,system-ui,sans-serif;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
.crm-btn:hover{border-color:rgba(255,255,255,0.18)}
.crm-btn:disabled{opacity:.45;cursor:not-allowed}
.crm-btn:focus-visible,.crm-input:focus-visible,.crm-chip:focus-visible,.crm-tab:focus-visible{outline:2px solid var(--crm-accent);outline-offset:2px}
.crm-btn-primary{background:var(--crm-accent);border-color:transparent;color:#160E04}
.crm-btn-primary:hover{filter:brightness(1.08);border-color:transparent}
.crm-btn-ghost{background:transparent}
.crm-btn-danger{background:transparent;color:#FF8FB5;border-color:rgba(212,0,85,0.45)}
.crm-icon-btn{min-width:44px;padding:0}
.crm-input{min-height:44px;width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--crm-line);background:var(--crm-bg);color:var(--crm-ink);font:400 14px Inter,system-ui,sans-serif}
.crm-input::placeholder{color:#7D758B}
textarea.crm-input{min-height:120px;resize:vertical;line-height:1.5}
select.crm-input{appearance:auto}
.crm-label{display:block;font-size:12px;color:var(--crm-muted);margin:0 0 6px;font-weight:500}
.crm-chip{min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--crm-line);background:var(--crm-raised);color:var(--crm-ink);font:500 13px Inter,system-ui,sans-serif;display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap}
.crm-chip[aria-pressed=true]{background:color-mix(in srgb,var(--crm-accent) 22%,transparent);border-color:var(--crm-accent)}
.crm-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;background:rgba(255,255,255,0.06);color:var(--crm-ink);white-space:nowrap}
.crm-pill-stale{background:rgba(212,0,85,0.18);color:#FF9CC0}
.crm-pill-won{background:rgba(52,199,89,0.16);color:#8BE6A4}
.crm-pill-lost{background:rgba(255,255,255,0.06);color:var(--crm-muted)}
.crm-pill-accent{background:color-mix(in srgb,var(--crm-accent) 20%,transparent);color:var(--crm-ink)}
.crm-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
.crm-tab{min-height:44px;padding:0 16px;border-radius:12px;border:1px solid transparent;background:transparent;color:var(--crm-muted);font:600 14px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:8px}
.crm-tab[aria-selected=true]{background:var(--crm-raised);color:var(--crm-ink);border-color:var(--crm-line)}
.crm-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}
.crm-col{flex:0 0 288px;scroll-snap-align:start;background:var(--crm-panel);border:1px solid var(--crm-line);border-radius:24px;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:220px}
.crm-col[data-over=true]{border-color:var(--crm-accent)}
.crm-dcard{background:var(--crm-raised);border:1px solid var(--crm-line);border-radius:16px;padding:12px;cursor:pointer;display:flex;flex-direction:column;gap:6px;text-align:left;color:var(--crm-ink);width:100%}
.crm-dcard:hover{border-color:rgba(255,255,255,0.18)}
.crm-dcard[data-stale=true]{border-color:rgba(212,0,85,0.5)}
.crm-stat{display:flex;flex-direction:column;gap:2px;min-width:120px}
.crm-stat b{font-family:'Bricolage Grotesque',Inter,sans-serif;font-size:20px;font-variant-numeric:tabular-nums;font-weight:700}
.crm-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--crm-line);min-height:60px}
.crm-row:last-child{border-bottom:0}
.crm-row[data-selected=true]{background:color-mix(in srgb,var(--crm-accent) 9%,transparent)}
.crm-check{width:22px;height:22px;accent-color:var(--crm-accent);flex:none}
.crm-checkwrap{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.crm-overlay{position:fixed;inset:0;background:rgba(5,3,9,0.6);z-index:80;display:flex;justify-content:flex-end}
.crm-sheet{background:var(--crm-bg);color:var(--crm-ink);width:min(520px,100vw);height:100%;overflow-y:auto;border-left:1px solid var(--crm-line);display:flex;flex-direction:column}
.crm-sheet-wide{width:min(1080px,100vw)}
.crm-sheet-head{position:sticky;top:0;z-index:2;background:var(--crm-bg);border-bottom:1px solid var(--crm-line);padding:12px 16px;display:flex;align-items:center;gap:12px}
.crm-sheet-foot{position:sticky;bottom:0;z-index:2;background:var(--crm-bg);border-top:1px solid var(--crm-line);padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap}
.crm-section{padding:16px;border-bottom:1px solid var(--crm-line);display:flex;flex-direction:column;gap:12px}
.crm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.crm-grid3{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}
.crm-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:90;background:var(--crm-raised);border:1px solid var(--crm-line);border-radius:16px;padding:10px 12px 10px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 12px 40px rgba(0,0,0,0.5);max-width:calc(100vw - 32px);color:var(--crm-ink);font-size:14px}
.crm-bulk{position:sticky;bottom:0;z-index:5;background:var(--crm-raised);border:1px solid var(--crm-line);border-radius:16px;padding:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.crm-note{border-left:3px solid var(--crm-accent);padding:8px 12px;background:var(--crm-panel);border-radius:0 12px 12px 0;font-size:13px}
.crm-warn{border-left-color:var(--crm-magenta)}
.crm-empty{padding:32px 16px;text-align:center;color:var(--crm-muted)}
.crm-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;cursor:pointer}
.crm-switch input{width:22px;height:22px;accent-color:var(--crm-accent)}
.crm-tl{display:flex;gap:10px;padding:8px 0}
.crm-tl-dot{width:32px;height:32px;border-radius:10px;background:var(--crm-raised);display:flex;align-items:center;justify-content:center;flex:none;color:var(--crm-muted)}
@media (max-width:640px){
  .crm-sheet{width:100vw;border-left:0}
  .crm-grid2,.crm-grid3{grid-template-columns:1fr}
  .crm-col{flex-basis:84vw}
  .crm-hide-sm{display:none !important}
}
`;

export const CrmStyles: React.FC = () => <style>{CSS}</style>;

export function rootStyle(accent?: string): React.CSSProperties {
  return { ['--crm-accent' as any]: accent || CRM_COLORS.orange };
}

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label style={{ display: 'block', minWidth: 0 }}>
    <span className="crm-label">{label}</span>
    {children}
    {hint && <span className="crm-muted crm-small" style={{ display: 'block', marginTop: 4 }}>{hint}</span>}
  </label>
);

export function relDays(t: number | undefined, now = Date.now()): string {
  if (!t) return 'never';
  const d = Math.round((now - t) / 86_400_000);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d === -1) return 'tomorrow';
  if (d < 0) return `in ${-d} days`;
  if (d < 60) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function downloadFile(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
