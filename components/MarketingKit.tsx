// ─── Marketing Kit ───────────────────────────────────────────────────────────
// The single, identity-scoped "Marketing" surface. One component reused in three
// homes (personal creator / business page / org), scoped to whichever identity is
// being managed. It carries an Organic ⇄ Paid toggle:
//   • Organic = the existing social manager (StudioView — compose/schedule,
//     content calendar, connected channels, analytics).
//   • Paid    = the existing Promote/ad packages (AdPackageManager).
// Both underlying tools are REUSED as-is, not reimplemented. The header shows the
// identity being managed. See the note at the bottom re: true per-identity
// channel/analytics scoping (a deferred refactor of the underlying tools).

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Megaphone, Sparkles, TrendingUp, ArrowLeft, User, Building2, Users } from 'lucide-react';
import type { UserProfile } from '../types';
import StudioView from './ManagerSuite/StudioView';
import AdPackageManager from './AdPackageManager';

export type MarketingScopeKind = 'CREATOR' | 'BUSINESS' | 'ORG';

export interface MarketingScope {
  kind: MarketingScopeKind;
  id: string;
  name?: string;
}

export interface MarketingKitProps {
  scope: MarketingScope;
  currentUser: UserProfile;
  /** Optional back affordance — supplied when embedded as a full-screen overlay
   *  (e.g. from OrgHub's staff-tools pattern). Omit inside tabbed hosts. */
  onClose?: () => void;
}

type Mode = 'ORGANIC' | 'PAID';

const SCOPE_META: Record<MarketingScopeKind, { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  CREATOR:  { label: 'Creator',  icon: User },
  BUSINESS: { label: 'Business', icon: Building2 },
  ORG:      { label: 'Org',      icon: Users },
};

export default function MarketingKit({ scope, currentUser, onClose }: MarketingKitProps) {
  const [mode, setMode] = useState<Mode>('ORGANIC');
  const meta = SCOPE_META[scope.kind];
  const ScopeIcon = meta.icon;
  const identityName = scope.name || currentUser.displayName || 'You';

  return (
    <div className="flex flex-col min-h-full bg-[#0a0a0a] text-white">
      {/* ── Identity header + Organic/Paid toggle ── */}
      <div className="px-4 sm:px-6 lg:px-10 pt-6 sm:pt-8 pb-4 border-b border-white/8">
        <div className="flex items-start sm:items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {onClose && (
              <button
                onClick={onClose}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                <ArrowLeft size={13} /> Back
              </button>
            )}
            <span
              className="shrink-0 w-11 h-11 rounded-2xl grid place-items-center"
              style={{ background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00))' }}
            >
              <Megaphone size={20} className="text-white" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight leading-none">Marketing</h1>
              <p className="text-white/45 text-xs sm:text-sm mt-1.5 flex items-center gap-1.5 min-w-0">
                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/8 text-white/60 text-[9px] font-black uppercase tracking-widest">
                  <ScopeIcon size={10} /> {meta.label}
                </span>
                <span className="truncate">Managing <span className="text-white/70 font-bold">{identityName}</span></span>
              </p>
            </div>
          </div>

          {/* Organic ⇄ Paid segmented toggle */}
          <div className="shrink-0 inline-flex items-center gap-1 p-1 rounded-2xl bg-white/[0.05] border border-white/10">
            {([
              ['ORGANIC', 'Organic', Sparkles],
              ['PAID', 'Paid', TrendingUp],
            ] as const).map(([id, label, Icon]) => {
              const on = mode === id;
              return (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={`relative flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${
                    on ? 'text-black' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {on && (
                    <motion.span
                      layoutId="marketing-mode-pill"
                      className="absolute inset-0 rounded-xl bg-white"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5"><Icon size={12} /> {label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-white/35 text-[11px] mt-3">
          {mode === 'ORGANIC'
            ? 'Compose, schedule, and analyze across Plajah and your connected channels.'
            : 'Boost visibility with ad packages and off-platform promotions.'}
        </p>
      </div>

      {/* ── Embedded tool ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {mode === 'ORGANIC' ? (
          // StudioView is a self-contained full-height surface — render directly.
          <StudioView />
        ) : (
          // AdPackageManager is a content block expecting outer padding — wrap it.
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
            <AdPackageManager currentUser={currentUser} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scoping note (deferred, Wave 2) ────────────────────────────────────────────
// The two embedded tools currently key off the SIGNED-IN user, not `scope.id`:
//   • StudioView reads the signed-in user's Fediverse accounts (FediverseContext)
//     and their scheduled-post queue (scheduledPostsService) — both global to the
//     auth'd user. Under BUSINESS/ORG scope it therefore shows the operator's own
//     channels, not the identity's.
//   • AdPackageManager computes a boost profile for `currentUser`, not for a
//     specific business page / org id.
// True per-identity channels + analytics require threading a `scope` prop through
// StudioView → scheduledPostsService/FediverseContext and AdPackageManager →
// adAlgorithmService. Left as a deliberate follow-up so the scheduler/ad tools are
// reused unchanged here. The identity HEADER is accurate today; the data plane
// scoping is the outstanding piece.
