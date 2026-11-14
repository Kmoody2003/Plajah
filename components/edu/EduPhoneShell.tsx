// EduPhoneShell — the phone layout shared by the teacher and student hubs (Christian Ed's EdHub, Academia's
// TeacherHub and Homeroom). On a phone the hub's sections become tabs (56px targets, labels always shown):
//   • standalone: a bottom tab bar above the iPhone home indicator / Android gesture bar;
//   • inside the app, which already pins its own bottom tab bar (App.tsx publishes its height as
//     --pj-mobile-nav-h), a sticky segmented strip at the top instead, so two bars never stack.
// On wider screens it renders its children untouched, so the desktop layouts stay as they are.
//
// Hubs own the content: they read `active` and render that section. A "More" tab can open an EduPhoneSheet
// instead of switching section.
import React, { useEffect, useState } from 'react';
import { useViewport } from '../../hooks/useViewport';

export interface EduPhoneTab {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Small count on the icon (things to review, work due). */
  badge?: number;
}

const CSS = `
.eps-page{padding-bottom:calc(76px + env(safe-area-inset-bottom))}
.eps-page.top{padding-bottom:0}
.eps-page.top .eps-bar{position:sticky;top:0;bottom:auto;margin:0 0 12px;border-top:0;border-bottom:1px solid rgba(255,255,255,.1);padding-top:env(safe-area-inset-top);padding-bottom:0}
.eps-page.top .eps-bar button{min-height:54px;gap:2px}
.eps-page.top .eps-ic{height:24px;background:none!important}
.eps-page.top .eps-bar button[aria-current="page"]{box-shadow:inset 0 -3px 0 #D40055}
/* Thumb-size floor for every control the hub sections render (shared cards, chips, inline "→" links). */
.eps-page :is(button,select,[role=button]):not(.eps-bar *){min-height:40px}
.eps-page :is(input:not([type=checkbox]):not([type=radio]):not([type=range]),textarea,select){font-size:max(16px,1em)}
.eps-bar{position:fixed;left:0;right:0;bottom:0;z-index:50;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;
  background:rgba(13,11,20,.94);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-top:1px solid rgba(255,255,255,.1);
  padding:0 max(6px,env(safe-area-inset-right)) env(safe-area-inset-bottom) max(6px,env(safe-area-inset-left))}
.eps-bar button{appearance:none;border:0;background:transparent;color:rgba(244,241,247,.6);min-height:56px;display:grid;place-items:center;align-content:center;gap:3px;
  font:700 11px/1 "Outfit","Inter",system-ui,sans-serif;letter-spacing:.01em;cursor:pointer;position:relative;-webkit-tap-highlight-color:transparent}
.eps-bar button[aria-current="page"]{color:#fff}
.eps-bar button[aria-current="page"] .eps-ic{background:linear-gradient(135deg,#6B0099,#D40055)}
.eps-bar button:focus-visible{outline:2px solid #00DAF3;outline-offset:-4px;border-radius:12px}
.eps-ic{width:44px;height:28px;border-radius:99px;display:grid;place-items:center;position:relative;transition:background .15s}
.eps-badge{position:absolute;top:-3px;right:2px;min-width:17px;height:17px;padding:0 4px;border-radius:99px;background:#FF8C00;color:#160b02;font:800 10px/17px "JetBrains Mono",ui-monospace,monospace;text-align:center}
@media(prefers-reduced-motion:reduce){.eps-ic{transition:none}}
`;

export default function EduPhoneShell({ tabs, active, onSelect, children, label = 'Sections' }: {
  tabs: EduPhoneTab[];
  active: string;
  onSelect: (id: string) => void;
  children: React.ReactNode;
  label?: string;
}) {
  const { isPhone } = useViewport();
  const appNav = useAppBottomNav();
  if (!isPhone) return <>{children}</>;
  return (
    <div className={`eps-page ${appNav ? 'top' : ''}`}>
      <style>{CSS}</style>
      {appNav ? null : children}
      <nav className="eps-bar" aria-label={label}>
        {tabs.map(t => (
          <button key={t.id} type="button" aria-current={t.id === active ? 'page' : undefined} onClick={() => onSelect(t.id)}>
            <span className="eps-ic">
              <t.icon size={20} strokeWidth={t.id === active ? 2.4 : 2} />
              {!!t.badge && <span className="eps-badge" aria-label={`${t.badge} new`}>{t.badge > 99 ? '99+' : t.badge}</span>}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
      {appNav ? children : null}
    </div>
  );
}

/** True while the app's own phone bottom tab bar is on screen (App.tsx sets --pj-mobile-nav-h on <html>). */
function useAppBottomNav(): boolean {
  const read = () => { try { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pj-mobile-nav-h')) > 0; } catch { return false; } };
  const [on, setOn] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setOn(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    setOn(read());
    return () => mo.disconnect();
  }, []);
  return on;
}

/** A bottom sheet for phone "More" menus and dialogs: full width, safe-area aware, 48px rows. */
export function EduPhoneSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <style>{`.eps-scrim{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:200}.eps-sheet{position:fixed;left:0;right:0;bottom:0;z-index:201;max-height:86vh;overflow-y:auto;background:#141020;border-top:1px solid rgba(255,255,255,.14);border-radius:22px 22px 0 0;padding:10px max(16px,env(safe-area-inset-right)) calc(18px + env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));animation:epsUp .2s ease-out;color:#f4f1f7;font-family:Inter,system-ui,sans-serif}@keyframes epsUp{from{transform:translateY(100%)}to{transform:none}}@media(prefers-reduced-motion:reduce){.eps-sheet{animation:none}}.eps-grab{width:40px;height:5px;border-radius:99px;background:rgba(255,255,255,.25);margin:0 auto 10px}.eps-row{appearance:none;width:100%;min-height:50px;display:flex;align-items:center;gap:12px;padding:0 6px;border:0;border-bottom:1px solid rgba(255,255,255,.07);background:transparent;color:inherit;font:600 15px/1.2 Inter,system-ui,sans-serif;text-align:left;cursor:pointer}.eps-row:last-child{border-bottom:0}`}</style>
      <div className="eps-scrim" onClick={onClose} />
      <div className="eps-sheet" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="eps-grab" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ font: '800 17px/1.2 Outfit,Inter,system-ui,sans-serif' }}>{title}</span>
          <button type="button" autoFocus onClick={onClose} style={{ minWidth: 44, minHeight: 44, border: 0, background: 'transparent', color: 'rgba(244,241,247,.7)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
        {children}
      </div>
    </>
  );
}
