/**
 * ProfileSupportRail — the bottom row of the profile marquee: Sanctuary activity,
 * merch & releases, and (only when one is running) the funding-goal widget.
 *
 * Each cell renders only when it has something real to show, and the row itself
 * disappears when none of them do — an account with no Sanctuary, no products and
 * no campaign gets the marquee it had before, minus this row.
 *
 * Membership rosters are readable ONLY by the creator (firestore.rules), so the
 * Sanctuary cell has two faces: recent joins for the owner, the public shape
 * (member count + what the space is) for everyone else.
 */
import React from 'react';
import { HeartHandshake, ShoppingBag, Target, ArrowRight } from 'lucide-react';
import type { MerchItem, Sanctuary, SanctuaryCampaign } from '../../types';
import type { MarqueeActivity } from '../../hooks/useProfileMarquee';

interface ProfileSupportRailProps {
  sanctuary: Sanctuary | null;
  campaign: SanctuaryCampaign | null;
  activity: MarqueeActivity[];
  merch: MerchItem[];
  isOwnProfile: boolean;
  isMobile: boolean;
  onOpenSanctuary: () => void;
  onOpenMerch: () => void;
}

const timeAgo = (ms: number): string => {
  if (!ms) return '';
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 2592000)}mo`;
};

const money = (n: number): string => {
  const v = Math.round(n || 0);
  return v >= 1000 ? `$${v.toLocaleString()}` : `$${v}`;
};

const initials = (name: string): string =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const CellHead: React.FC<{ icon: React.ReactNode; title: string; action?: string; onAction?: () => void }> = ({ icon, title, action, onAction }) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <h4 className="m-0 flex items-center gap-1.5 text-[9.5px] font-black uppercase tracking-[0.2em] text-white/35">
      {icon}{title}
    </h4>
    {action && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/35 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
      >
        {action} <ArrowRight size={10} />
      </button>
    )}
  </div>
);

const ProfileSupportRail: React.FC<ProfileSupportRailProps> = ({
  sanctuary,
  campaign,
  activity,
  merch,
  isOwnProfile,
  isMobile,
  onOpenSanctuary,
  onOpenMerch,
}) => {
  const showSanctuary = !!sanctuary?.isEnabled || activity.length > 0;
  const products = [...(merch || [])]
    .filter(m => !!m && (m.stock === undefined || m.stock > 0 || m.isDigitalAsset))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 3);
  const showMerch = products.length > 0;
  const showGoal = !!campaign;

  if (!showSanctuary && !showMerch && !showGoal) return null;

  const cells = [showSanctuary, showMerch, showGoal].filter(Boolean).length;
  const gridCols = isMobile || cells === 1 ? 'grid-cols-1' : cells === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3';

  const pct = campaign && campaign.goalAmount > 0
    ? Math.min(100, Math.round((campaign.raisedAmount / campaign.goalAmount) * 100))
    : 0;
  const daysLeft = campaign?.deadline ? Math.max(0, Math.ceil((campaign.deadline - Date.now()) / 86400000)) : null;

  return (
    <div className={`mt-5 grid gap-3 ${gridCols}`}>
      {/* ── Sanctuary ── */}
      {showSanctuary && (
        <section className="flex min-w-0 flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-4">
          <CellHead
            icon={<HeartHandshake size={11} className="text-small-orange" />}
            title="Sanctuary"
            action="Open"
            onAction={onOpenSanctuary}
          />
          {isOwnProfile && activity.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {activity.map(a => (
                <div key={a.id} className="flex items-center gap-2.5">
                  {a.photo ? (
                    <img src={a.photo} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-black text-white" style={{ background: 'linear-gradient(140deg,#6B0099,#D40055)' }}>
                      {initials(a.name)}
                    </span>
                  )}
                  <p className="m-0 min-w-0 flex-1 truncate text-[12px] font-medium text-white/80">
                    <span className="font-bold text-white">{a.name}</span> <span className="text-white/40">{a.detail}</span>
                  </p>
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-white/25">{timeAgo(a.at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-center gap-2">
              <p className="m-0 text-[15px] font-black uppercase italic tracking-tight text-white">
                {sanctuary?.name || 'The Sanctuary'}
              </p>
              {sanctuary?.tagline && <p className="m-0 line-clamp-2 text-[12px] font-medium text-white/50">{sanctuary.tagline}</p>}
              <p className="m-0 text-[10px] font-black uppercase tracking-widest text-white/35">
                {(sanctuary?.memberCount || 0).toLocaleString()} member{(sanctuary?.memberCount || 0) === 1 ? '' : 's'}
                {isOwnProfile ? ' · no joins yet' : ''}
              </p>
              {!isOwnProfile && (
                <button
                  type="button"
                  onClick={onOpenSanctuary}
                  className="mt-1 inline-flex h-9 w-full items-center justify-center rounded-full text-[10px] font-black uppercase tracking-widest text-white transition-transform hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}
                >
                  Become a member
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Merch & releases ── */}
      {showMerch && (
        <section className="flex min-w-0 flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-4">
          <CellHead
            icon={<ShoppingBag size={11} className="text-small-orange" />}
            title="Merch & releases"
            action="Store"
            onAction={onOpenMerch}
          />
          <div className="grid grid-cols-3 gap-2.5">
            {products.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={onOpenMerch}
                className="group/item min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-small-orange rounded-xl"
              >
                <span className="relative block aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-transform group-hover/item:-translate-y-0.5">
                  {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                  {typeof p.stock === 'number' && p.stock > 0 && p.stock <= 3 && !p.isDigitalAsset && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-red-600/85 px-1.5 py-[2px] text-[7.5px] font-black uppercase tracking-widest text-white">
                      {p.stock} left
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block truncate text-[11.5px] font-bold text-white">{p.title}</span>
                <span className="block text-[10px] font-black tabular-nums text-white/40">
                  {money(p.salePrice ?? p.price)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Funding goal (only while a campaign is running) ── */}
      {showGoal && campaign && (
        <section
          className="flex min-w-0 flex-col rounded-3xl border p-4"
          style={{ borderColor: 'rgba(6,214,160,0.28)', background: 'linear-gradient(150deg, rgba(6,214,160,0.12), rgba(107,0,153,0.16))' }}
        >
          <CellHead icon={<Target size={11} className="text-[#06D6A0]" />} title="Funding goal" />
          <p className="m-0 text-[15px] font-black uppercase italic leading-tight tracking-tight text-white">{campaign.title}</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-[26px] font-black leading-none tabular-nums text-[#8CF3D3]">{money(campaign.raisedAmount)}</span>
            <span className="text-[10.5px] font-black uppercase tracking-widest text-white/50">of {money(campaign.goalAmount)}</span>
          </div>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#06D6A0,#00DAF3)', boxShadow: '0 0 18px rgba(6,214,160,0.5)' }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-white/35">
            <span>{pct}% funded</span>
            <span>
              {(campaign.backerCount || 0).toLocaleString()} backer{(campaign.backerCount || 0) === 1 ? '' : 's'}
              {daysLeft !== null ? ` · ${daysLeft}d left` : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenSanctuary}
            className="mt-auto inline-flex h-10 items-center justify-center rounded-full pt-0 text-[10px] font-black uppercase tracking-widest text-[#00231A] transition-transform hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            style={{ background: 'linear-gradient(120deg,#06D6A0,#00B4D8)', marginTop: 14 }}
          >
            {isOwnProfile ? 'Manage this goal' : 'Back this goal'}
          </button>
        </section>
      )}
    </div>
  );
};

export default ProfileSupportRail;
