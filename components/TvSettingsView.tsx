import React, { useState } from 'react';
import { LogOut, Users, CreditCard, Receipt, Home, Monitor, Check, RotateCw, PanelLeft } from 'lucide-react';
import { getTvHome, setTvHome, type TvHomeView } from '../services/tvCapabilities';

/**
 * Everything a television lets you change about your account — and nothing else.
 *
 * The full settings surface is a desktop tool: profile editing, safety controls, aliases,
 * mailing lists, theme pickers, studio configuration. None of it can be driven meaningfully
 * with a remote, and burying four useful controls inside forty useless ones is worse than not
 * offering them. So this is the short list a viewer actually needs at the TV — who am I, what
 * am I paying for, what did I buy, and where should the app open — with an honest pointer to
 * where the rest lives.
 */

const HOME_OPTIONS: { id: TvHomeView; label: string; blurb: string }[] = [
  { id: 'MOVIES_TV', label: 'Taleo',  blurb: 'Films and series' },
  { id: 'MUSIC',     label: 'Chora',  blurb: 'Music and radio' },
  { id: 'VIDEOS',    label: 'Reello', blurb: 'Videos and shorts' },
];

const Row: React.FC<{
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
}> = ({ icon: Icon, label, value, onClick, danger }) => (
  <button
    data-tv-focusable
    onClick={onClick}
    disabled={!onClick}
    className={`w-full flex items-center justify-between gap-6 px-7 py-5 rounded-2xl border transition-colors text-left ${
      danger
        ? 'bg-red-500/10 border-red-500/25 text-red-200 hover:bg-red-500/20'
        : 'bg-white/[0.04] border-white/10 text-white hover:bg-white/[0.09]'
    } ${!onClick ? 'opacity-70' : ''}`}
  >
    <span className="flex items-center gap-4">
      <Icon size={20} className={danger ? 'text-red-300' : 'text-white/50'} />
      <span className="font-bold text-base">{label}</span>
    </span>
    {value && <span className="text-sm text-white/45 font-medium">{value}</span>}
  </button>
);

const TvSettingsView: React.FC<{
  userProfile?: any;
  subscriptionLabel?: string;
  onSignOut?: () => void;
  onSwitchAccount?: () => void;
  onOpenPurchases?: () => void;
  /** Left padding to clear the Spine rail, when it's on. Passed rather than read directly so this
   *  screen doesn't need its own platform/lineup checks — App.tsx already computed it. */
  railInset?: number;
  /** Whether the Spine left-rail shell is on. Undefined on non-TV callers, which hides the row. */
  tvLineupEnabled?: boolean;
  onSetTvLineupEnabled?: (v: boolean) => void;
}> = ({ userProfile, subscriptionLabel, onSignOut, onSwitchAccount, onOpenPurchases, railInset = 0, tvLineupEnabled, onSetTvLineupEnabled }) => {
  const [home, setHome] = useState<TvHomeView>(getTvHome);

  const chooseHome = (v: TvHomeView) => { setTvHome(v); setHome(v); };

  return (
    // The outer padding pushes the CENTERING CONTEXT rightward, not just the content — mx-auto below
    // centers within (100% − railInset), which is what actually clears the rail rather than shifting
    // content inside a box that's still centered on the full, rail-covered viewport.
    <div style={{ paddingLeft: railInset || undefined }}>
    <div className="max-w-3xl mx-auto px-8 py-10 space-y-9">
      <header className="space-y-1.5">
        <h1 className="text-3xl font-black text-white tracking-tight">TV Settings</h1>
        <p className="text-white/45 text-sm">
          {userProfile?.displayName ? `Signed in as ${userProfile.displayName}` : 'Your account on this TV'}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 px-1">Account</h2>
        <Row icon={Users}      label="Switch account" onClick={onSwitchAccount} />
        <Row icon={CreditCard} label="Subscription"   value={subscriptionLabel || 'Free'} />
        <Row icon={Receipt}    label="Purchase history" onClick={onOpenPurchases} />
      </section>

      <section className="space-y-3">
        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 px-1">Opens on</h2>
        <p className="text-white/35 text-xs px-1 -mt-1">Which experience this TV starts in.</p>
        <div className="grid grid-cols-3 gap-3">
          {HOME_OPTIONS.map(opt => {
            const active = home === opt.id;
            return (
              <button
                key={opt.id}
                data-tv-focusable
                onClick={() => chooseHome(opt.id)}
                className={`px-5 py-5 rounded-2xl border text-left transition-colors ${
                  active ? 'bg-white text-black border-white' : 'bg-white/[0.04] border-white/10 text-white hover:bg-white/[0.09]'
                }`}
              >
                <span className="flex items-center gap-2 font-black uppercase tracking-widest text-xs">
                  {active ? <Check size={14} /> : <Home size={14} className="opacity-50" />}
                  {opt.label}
                </span>
                <span className={`block mt-1.5 text-[11px] ${active ? 'text-black/60' : 'text-white/40'}`}>{opt.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 px-1">Session</h2>
        {/* A way out when the app has wedged. On a television there is no swipe-up task
            switcher and no address bar, so without this the only recovery is unplugging the set —
            which is what viewers were actually resorting to. */}
        <Row
          icon={RotateCw}
          label="Restart app"
          onClick={() => { try { window.location.reload(); } catch { /* nothing else to try */ } }}
        />
        <Row icon={LogOut} label="Sign out" onClick={onSignOut} danger />
      </section>

      {/* Only rendered when a caller actually passed the lineup props (i.e. on TV — this component
          also gets reused in contexts where it doesn't apply, so an undefined handler hides it
          instead of throwing on click). */}
      {onSetTvLineupEnabled && (
        <section className="space-y-3">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 px-1">Navigation</h2>
          <button
            data-tv-focusable
            onClick={() => onSetTvLineupEnabled(!tvLineupEnabled)}
            className="w-full flex items-center justify-between gap-6 px-7 py-5 rounded-2xl border bg-white/[0.04] border-white/10 text-white hover:bg-white/[0.09] transition-colors text-left"
          >
            <span className="flex items-center gap-4">
              <PanelLeft size={20} className="text-white/50" />
              <span className="flex flex-col">
                <span className="font-bold text-base">Lineup navigation</span>
                <span className="text-white/40 text-xs mt-0.5">
                  A numbered channel lineup on the left, apps and Live as peers. New — try it and switch back anytime.
                </span>
              </span>
            </span>
            <span
              className={`shrink-0 w-12 h-7 rounded-full relative transition-colors ${tvLineupEnabled ? 'bg-[#FF8C00]' : 'bg-white/15'}`}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${tvLineupEnabled ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </span>
          </button>
        </section>
      )}

      {/* Say where the rest lives rather than pretending this is everything. */}
      <div className="flex items-start gap-4 px-7 py-5 rounded-2xl bg-white/[0.03] border border-dashed border-white/12">
        <Monitor size={20} className="text-white/35 shrink-0 mt-0.5" />
        <p className="text-white/45 text-sm leading-relaxed">
          Profile editing, privacy, uploads and the creator studios live in the Plajah app on your
          phone or computer — they need a keyboard and a pointer to be worth using.
        </p>
      </div>
    </div>
    </div>
  );
};

export default TvSettingsView;
