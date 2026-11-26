import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { RefreshCw, Plus, Trash2 } from 'lucide-react';
import {
  fetchAdOverview, setAdConfigActive, setAdPackageActive, setCampaignStatus, setBountyStatus, setOffPlatformStatus, type AdOverview,
} from '../../services/adminPlatformService';
import { fetchAdConfigs, updateAdConfig, deleteAdConfig, fetchSystemSettingsConfig, updateSystemSettingsConfig, createAdCampaign } from '../../services/backendService';
import { AD_SLOT_DISTRIBUTION, SUBSCRIPTION_BOOST_PCT, ACHIEVEMENT_BOOST, POINTS_BOOST_MAX } from '../../services/adAlgorithmService';
import { AD_PACKAGES, OFF_PLATFORM_PACKAGES } from '../../services/stripeService';
import { PLAJAH_PROMOS } from '../../services/promos/platformPromos';
import FileUploader from '../FileUploader';
import { fetchAdNetworkAdmin, saveAdNetworkAdmin } from '../../services/adminPlatformService';
import { DEFAULT_AD_NETWORK, type AdNetworkConfig } from '../../services/ads/networkAds';
import { resetAdNetworkCache } from '../../services/ads/googleAds';
import type { AdConfig, AdRatioConfig } from '../../types';
import { Header, Stat, Panel, Pill, Btn, Empty, Table, nf, usd, cents, pct, when, useLoad } from './adminUi';

/**
 * The Ad Platform console. One page for every ad surface Plajah sells or runs:
 * placements, campaigns, boost packages, off-platform promotion, the creator/business
 * promo marketplace, patronage + sponsor bounties, and the rotation mix.
 *
 * Numbers come from /api/admin/ads/overview (routes/adPlatform.ts): impressions and
 * clicks are the ones the app now reports itself via services/adEvents.ts; money
 * figures are summed from the paid records. Nothing is estimated. Workflow buttons
 * write through the server and land in the admin audit log. No button here moves money.
 */

type Sub = 'OVERVIEW' | 'PLACEMENTS' | 'CAMPAIGNS' | 'PACKAGES' | 'OFFPLATFORM' | 'MARKETPLACE' | 'PATRONAGE' | 'ROTATION';
const SUBS: Array<{ id: Sub; label: string }> = [
  { id: 'OVERVIEW', label: 'Overview' }, { id: 'PLACEMENTS', label: 'Placements' }, { id: 'CAMPAIGNS', label: 'Campaigns' },
  { id: 'PACKAGES', label: 'Boost packages' }, { id: 'OFFPLATFORM', label: 'Off-platform queue' }, { id: 'MARKETPLACE', label: 'Promo marketplace' },
  { id: 'PATRONAGE', label: 'Patronage & bounties' }, { id: 'ROTATION', label: 'Rotation mix' },
];

const statusTone = (s?: string) => (['ACTIVE', 'LIVE', 'COMPLETED', 'PAID', 'ACCEPTED'].includes(String(s)) ? 'good' : ['PAUSED', 'PENDING', 'PAID_AWAITING_SCHEDULING', 'OPEN', 'SCHEDULED', 'IN_PROGRESS'].includes(String(s)) ? 'warn' : ['DECLINED', 'REFUND_DUE'].includes(String(s)) ? 'bad' : 'mute') as 'good' | 'warn' | 'bad' | 'mute';
const label = (s: string) => s.replace(/_/g, ' ').toLowerCase();

const AdminAdPlatform: React.FC = () => {
  const [sub, setSub] = useState<Sub>('OVERVIEW');
  const { data: d, error, loading, reload } = useLoad(fetchAdOverview);
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState('');

  /** Run a server workflow action, then refresh. Errors stay visible. */
  const run = async (key: string, fn: () => Promise<unknown>, ok = 'Saved') => {
    setBusy(key); setFlash('');
    try { await fn(); await reload(); setFlash(ok); } catch (e: any) { setFlash('Failed: ' + (e?.message || e)); } finally { setBusy(''); }
  };

  const needs = d ? (d.offPlatform.byStatus.PAID_AWAITING_SCHEDULING || 0) + (d.bookings.byStatus.PENDING || 0) + (d.bounties.byStatus.OPEN || 0) : 0;

  return (
    <div className="space-y-6">
      <Header
        title="Ad Platform"
        sub="Placements, campaigns, boosts, off-platform, marketplace and patronage in one place"
        right={<Btn onClick={reload}><RefreshCw size={12} className="inline mr-2" />Refresh</Btn>}
      />
      <nav className="flex flex-wrap gap-2">
        {SUBS.map(s => (
          <button key={s.id} onClick={() => setSub(s.id)} className={'px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ' + (sub === s.id ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10')}>
            {s.label}
            {s.id === 'OFFPLATFORM' && d && (d.offPlatform.byStatus.PAID_AWAITING_SCHEDULING || 0) > 0 && <span className="ml-2 text-amber-500">●</span>}
          </button>
        ))}
      </nav>
      {flash && <p className={'text-[11px] font-bold ' + (flash.startsWith('Failed') ? 'text-red-400' : 'text-emerald-400')}>{flash}</p>}
      {error && <Empty>Could not load the ad platform: {error}</Empty>}
      {loading && !d && <Empty>Loading…</Empty>}

      {d && sub === 'OVERVIEW' && <Overview d={d} needs={needs} go={setSub} />}
      {d && sub === 'PLACEMENTS' && <Placements d={d} run={run} busy={busy} reload={reload} />}
      {d && sub === 'CAMPAIGNS' && <Campaigns d={d} run={run} busy={busy} reload={reload} />}
      {d && sub === 'PACKAGES' && <Packages d={d} run={run} busy={busy} />}
      {d && sub === 'OFFPLATFORM' && <OffPlatform d={d} run={run} busy={busy} />}
      {d && sub === 'MARKETPLACE' && <Marketplace d={d} />}
      {d && sub === 'PATRONAGE' && <Patronage d={d} run={run} busy={busy} />}
      {sub === 'ROTATION' && <Rotation />}
    </div>
  );
};

type RunFn = (key: string, fn: () => Promise<unknown>, ok?: string) => Promise<void>;

// ── Overview ────────────────────────────────────────────────────────────────

const Overview: React.FC<{ d: AdOverview; needs: number; go: (s: Sub) => void }> = ({ d, needs, go }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Stat label="Impressions (30 d)" value={nf(d.tracking.impressions30d)} hint="Recorded by the app" />
      <Stat label="Clicks (30 d)" value={nf(d.tracking.clicks30d)} />
      <Stat label="CTR" value={pct(d.tracking.ctr30d)} hint={d.tracking.ctr30d == null ? 'No impressions recorded yet' : undefined} />
      <Stat label="Needs action" value={nf(needs)} tone={needs ? 'warn' : 'good'} hint="Off-platform, bookings, bounties" />
      <Stat label="Boost revenue (30 d)" value={usd(d.packages.revenue30d)} hint={d.packages.sold30d + ' sold'} onClick={() => go('PACKAGES')} />
      <Stat label="Boost revenue (all time)" value={usd(d.packages.revenueAllTime)} />
      <Stat label="Off-platform (all time)" value={usd(d.offPlatform.revenueAllTime)} onClick={() => go('OFFPLATFORM')} />
      <Stat label="Marketplace gross (accepted)" value={usd(d.bookings.grossAccepted)} onClick={() => go('MARKETPLACE')} />
    </div>

    <Panel title="Impressions and clicks, last 30 days" sub="Only events the app reported; empty days are zero because nothing was recorded">
      {d.tracking.eventsRecorded30d === 0 && <p className="text-[11px] text-amber-400 mb-3">No ad events recorded yet. The app reports every placement it shows from the next release on; this fills in as traffic arrives.</p>}
      <div style={{ height: 230 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={d.series.map(s => ({ ...s, name: s.day.slice(5) }))}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={10} />
            <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11 }} />
            <Area type="monotone" dataKey="impressions" name="Impressions" stroke="#D40055" fill="#D4005533" />
            <Area type="monotone" dataKey="clicks" name="Clicks" stroke="#06D6A0" fill="#06D6A033" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>

    <Panel title="Top placements" sub="By recorded impressions, last 30 days">
      {!d.topPlacements.length ? <Empty>Nothing recorded yet.</Empty> : (
        <Table head={['Placement', 'Type', 'Impressions', 'Clicks', 'CTR']}>
          {d.topPlacements.map(p => (
            <tr key={p.id}><td className="py-2 pr-4 font-bold">{p.id}</td><td className="pr-4 text-white/50">{p.sourceKind}</td><td className="pr-4">{nf(p.impressions)}</td><td className="pr-4">{nf(p.clicks)}</td><td>{pct(p.impressions ? p.clicks / p.impressions : null)}</td></tr>
          ))}
        </Table>
      )}
    </Panel>
  </div>
);

// ── Placements (site ad configs) ────────────────────────────────────────────

const blankAd = (): Partial<AdConfig> => ({ title: '', imageUrl: '', linkUrl: '', placement: 'SIDEBAR', isActive: true, impressions: 0, clicks: 0 });

const Placements: React.FC<{ d: AdOverview; run: RunFn; busy: string; reload: () => void }> = ({ d, run, busy, reload }) => {
  const [edit, setEdit] = useState<Partial<AdConfig> | null>(null);
  const save = () => run('save-ad', async () => {
    if (!edit?.title?.trim() || !edit.imageUrl) throw new Error('A title and an image are required.');
    const id = edit.id || 'ad_' + Date.now().toString(36);
    const current = (await fetchAdConfigs()).find(a => a.id === id);
    await updateAdConfig({ ...blankAd(), ...current, ...edit, id } as AdConfig);
    setEdit(null);
  });
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Btn tone="primary" onClick={() => setEdit(blankAd())}><Plus size={12} className="inline mr-2" />New placement</Btn></div>
      {edit && (
        <Panel title={edit.id ? 'Edit placement' : 'New placement'}>
          <div className="grid md:grid-cols-2 gap-4">
            <input className="bg-black/40 rounded-xl px-4 py-3 text-sm" placeholder="Title" value={edit.title || ''} onChange={e => setEdit({ ...edit, title: e.target.value })} />
            <input className="bg-black/40 rounded-xl px-4 py-3 text-sm" placeholder="Link URL" value={edit.linkUrl || ''} onChange={e => setEdit({ ...edit, linkUrl: e.target.value })} />
            <select className="bg-black/40 rounded-xl px-4 py-3 text-sm" value={edit.placement} onChange={e => setEdit({ ...edit, placement: e.target.value as AdConfig['placement'] })}>
              {['SIDEBAR', 'FEED', 'PLAYER', 'BANNER'].map(p => <option key={p}>{p}</option>)}
            </select>
            <input className="bg-black/40 rounded-xl px-4 py-3 text-sm" placeholder="Target genres (comma separated, optional)" value={(edit.targetGenres || []).join(', ')} onChange={e => setEdit({ ...edit, targetGenres: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
            <div className="md:col-span-2 flex items-center gap-4">
              {edit.imageUrl && <img src={edit.imageUrl} alt="" className="h-20 rounded-xl object-cover" />}
              <FileUploader type="PHOTO" label="Upload image" onUploadComplete={url => setEdit(e => ({ ...e, imageUrl: url }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4"><Btn tone="primary" disabled={busy === 'save-ad'} onClick={save}>Save</Btn><Btn onClick={() => setEdit(null)}>Cancel</Btn></div>
        </Panel>
      )}
      {!d.configs.length ? <Empty>No placements yet.</Empty> : d.configs.map(c => {
        const impr = (c.impressions || 0) as number, clk = (c.clicks || 0) as number;
        return (
          <Panel key={c.id} title={c.title || c.id} sub={(c.placement || '—') + ' placement'} right={<Pill tone={c.isActive ? 'good' : 'mute'}>{c.isActive ? 'active' : 'paused'}</Pill>}>
            <div className="flex flex-wrap items-center gap-6">
              {c.imageUrl && <img src={c.imageUrl} alt="" className="h-16 w-28 rounded-xl object-cover" />}
              <div className="flex gap-8">
                <div><p className="text-[9px] uppercase tracking-widest text-white/30">Impressions</p><p className="font-black">{nf(impr)}</p></div>
                <div><p className="text-[9px] uppercase tracking-widest text-white/30">Clicks</p><p className="font-black">{nf(clk)}</p></div>
                <div><p className="text-[9px] uppercase tracking-widest text-white/30">CTR</p><p className="font-black">{pct(impr ? clk / impr : null)}</p></div>
              </div>
              <div className="ml-auto flex gap-2">
                <Btn disabled={busy === 'cfg' + c.id} onClick={() => run('cfg' + c.id, () => setAdConfigActive(c.id, !c.isActive))}>{c.isActive ? 'Pause' : 'Activate'}</Btn>
                <Btn onClick={() => setEdit(c as any)}>Edit</Btn>
                <Btn tone="danger" onClick={() => { if (window.confirm('Delete this placement?')) run('del' + c.id, async () => { await deleteAdConfig(c.id); reload(); }); }}><Trash2 size={12} /></Btn>
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
};

// ── Campaigns ───────────────────────────────────────────────────────────────

const Campaigns: React.FC<{ d: AdOverview; run: RunFn; busy: string; reload: () => void }> = ({ d, run, busy }) => {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', type: 'USER_PROMOTION', externalUrl: '', imageUrl: '', budget: 0, frequency: 1, probability: 0.5 });
  const create = () => run('create-camp', async () => {
    if (!f.title.trim()) throw new Error('A title is required.');
    await createAdCampaign({ title: f.title, name: f.title, type: f.type as any, targetType: 'EXTERNAL', externalUrl: f.externalUrl, imageUrl: f.imageUrl, budget: f.budget, frequency: f.frequency, probability: f.probability } as any);
    setOpen(false);
  }, 'Campaign created');
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Btn tone="primary" onClick={() => setOpen(o => !o)}><Plus size={12} className="inline mr-2" />New campaign</Btn></div>
      {open && (
        <Panel title="New campaign" sub="Weight is the chance it is picked when its slot comes up (0–1)">
          <div className="grid md:grid-cols-3 gap-4">
            <input className="bg-black/40 rounded-xl px-4 py-3 text-sm" placeholder="Title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
            <select className="bg-black/40 rounded-xl px-4 py-3 text-sm" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
              <option value="USER_PROMOTION">User promotion</option><option value="PARTNER">Partner content</option><option value="THIRD_PARTY">Third-party</option>
            </select>
            <input className="bg-black/40 rounded-xl px-4 py-3 text-sm" placeholder="Destination URL" value={f.externalUrl} onChange={e => setF({ ...f, externalUrl: e.target.value })} />
            <label className="text-[10px] text-white/40">Budget ($)<input type="number" min={0} className="w-full bg-black/40 rounded-xl px-4 py-3 text-sm mt-1" value={f.budget} onChange={e => setF({ ...f, budget: Number(e.target.value) })} /></label>
            <label className="text-[10px] text-white/40">Frequency (per hour)<input type="number" min={1} className="w-full bg-black/40 rounded-xl px-4 py-3 text-sm mt-1" value={f.frequency} onChange={e => setF({ ...f, frequency: Number(e.target.value) })} /></label>
            <label className="text-[10px] text-white/40">Weight (0–1)<input type="number" step="0.05" min={0} max={1} className="w-full bg-black/40 rounded-xl px-4 py-3 text-sm mt-1" value={f.probability} onChange={e => setF({ ...f, probability: Number(e.target.value) })} /></label>
            <div className="md:col-span-3 flex items-center gap-4">{f.imageUrl && <img src={f.imageUrl} alt="" className="h-16 rounded-xl" />}<FileUploader type="PHOTO" label="Upload creative" onUploadComplete={url => setF(x => ({ ...x, imageUrl: url }))} /></div>
          </div>
          <div className="flex gap-2 mt-4"><Btn tone="primary" disabled={busy === 'create-camp'} onClick={create}>Create</Btn><Btn onClick={() => setOpen(false)}>Cancel</Btn></div>
        </Panel>
      )}
      {!d.campaigns.length ? <Empty>No campaigns yet.</Empty> : (
        <Panel title="Campaigns">
          <Table head={['Campaign', 'Type', 'Budget', 'Weight', 'Impressions', 'Clicks', 'Status', '']}>
            {d.campaigns.map(c => (
              <tr key={c.id}>
                <td className="py-3 pr-4 font-bold">{c.title || c.name || c.id}</td>
                <td className="pr-4 text-white/50">{label(String(c.type || '—'))}</td>
                <td className="pr-4">{usd(c.budget)}</td>
                <td className="pr-4">{c.probability ?? '—'}</td>
                <td className="pr-4">{nf(c.recorded?.impressions ?? 0)}</td>
                <td className="pr-4">{nf(c.recorded?.clicks ?? 0)}</td>
                <td className="pr-4"><Pill tone={statusTone(c.status)}>{c.status || 'ACTIVE'}</Pill></td>
                <td className="flex gap-1 py-2">
                  {(['ACTIVE', 'PAUSED', 'COMPLETED'] as const).filter(s => s !== (c.status || 'ACTIVE')).map(s => (
                    <Btn key={s} disabled={busy === 'camp' + c.id} onClick={() => run('camp' + c.id, () => setCampaignStatus(c.id, s))}>{s === 'ACTIVE' ? 'Resume' : s === 'PAUSED' ? 'Pause' : 'Complete'}</Btn>
                  ))}
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
    </div>
  );
};

// ── Boost packages ──────────────────────────────────────────────────────────

const Packages: React.FC<{ d: AdOverview; run: RunFn; busy: string }> = ({ d, run, busy }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Stat label="Active boosts" value={nf(d.packages.active)} />
      <Stat label="Sold (30 d)" value={nf(d.packages.sold30d)} />
      <Stat label="Revenue (30 d)" value={usd(d.packages.revenue30d)} />
      <Stat label="Creators with a boost score" value={nf(d.boost.profiles)} hint={d.boost.avgScore == null ? undefined : 'avg ' + d.boost.avgScore.toFixed(1)} />
    </div>
    <Panel title="Catalogue" sub="Prices and multipliers come from the live purchase flow (stripeService)">
      <Table head={['Package', 'Price', 'Days', 'Boost', 'Sold (all time)']}>
        {AD_PACKAGES.map(p => <tr key={p.type}><td className="py-2 pr-4 font-bold">{p.label}</td><td className="pr-4">${p.price}</td><td className="pr-4">{p.days}</td><td className="pr-4">{p.boostMultiplier}×</td><td>{nf(d.packages.byType[p.type] || 0)}</td></tr>)}
      </Table>
    </Panel>
    <Panel title="Recent purchases" sub="Deactivating ends the boost early; it does not refund. Refunds are made in Stripe.">
      {!d.packages.recent.length ? <Empty>No boost purchases yet.</Empty> : (
        <Table head={['Bought', 'Buyer', 'Package', 'Paid', 'Expires', 'State', '']}>
          {d.packages.recent.map(p => {
            const live = p.isActive && (p.expiresAt || 0) > Date.now();
            return (
              <tr key={p.id}>
                <td className="py-2 pr-4">{when(p.createdAt)}</td><td className="pr-4 font-mono text-[10px] text-white/50">{String(p.userId || '').slice(0, 10)}</td>
                <td className="pr-4">{label(String(p.packageType))}</td><td className="pr-4">{usd(p.price)}</td><td className="pr-4">{when(p.expiresAt)}</td>
                <td className="pr-4"><Pill tone={live ? 'good' : 'mute'}>{live ? 'live' : p.isActive ? 'expired' : 'ended'}</Pill></td>
                <td>{live && <Btn tone="danger" disabled={busy === 'pk' + p.id} onClick={() => { if (window.confirm('End this boost now?')) run('pk' + p.id, () => setAdPackageActive(p.id, false)); }}>End</Btn>}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </Panel>
    <Panel title="Highest boost scores" sub="Subscription + achievements + points + paid package + activity">
      {!d.boost.top.length ? <Empty>No boost profiles computed yet.</Empty> : (
        <Table head={['Creator', 'Total', 'Subscription', 'Package', 'Activity']}>
          {d.boost.top.map(b => <tr key={b.id}><td className="py-2 pr-4 font-mono text-[10px]">{b.id.slice(0, 12)}</td><td className="pr-4 font-black">{(b.totalBoostScore || 0).toFixed(1)}</td><td className="pr-4">{b.subscriptionTierBoost ?? 0}%</td><td className="pr-4">{b.activeAdPackageBoost ?? 0}</td><td>{b.activityScore ?? 0}</td></tr>)}
        </Table>
      )}
    </Panel>
  </div>
);

// ── Off-platform queue ──────────────────────────────────────────────────────

const OFF_FLOW: Array<{ status: string; next: Array<{ to: string; label: string }> }> = [
  { status: 'PAID_AWAITING_SCHEDULING', next: [{ to: 'SCHEDULED', label: 'Schedule' }, { to: 'REFUND_DUE', label: 'Flag refund' }] },
  { status: 'SCHEDULED', next: [{ to: 'LIVE', label: 'Go live' }, { to: 'REFUND_DUE', label: 'Flag refund' }] },
  { status: 'LIVE', next: [{ to: 'COMPLETED', label: 'Complete' }] },
  { status: 'COMPLETED', next: [] }, { status: 'REFUND_DUE', next: [{ to: 'SCHEDULED', label: 'Reinstate' }] },
];

const OffPlatform: React.FC<{ d: AdOverview; run: RunFn; busy: string }> = ({ d, run, busy }) => {
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {OFF_FLOW.map(f => <Stat key={f.status} label={label(f.status)} value={nf(d.offPlatform.byStatus[f.status] || 0)} tone={f.status === 'PAID_AWAITING_SCHEDULING' && d.offPlatform.byStatus[f.status] ? 'warn' : f.status === 'REFUND_DUE' && d.offPlatform.byStatus[f.status] ? 'bad' : 'default'} />)}
      </div>
      <Panel title="Packages on offer" sub="Customers pay at checkout; each paid order lands here to be scheduled">
        <div className="grid md:grid-cols-2 gap-3">{OFF_PLATFORM_PACKAGES.map(p => <div key={p.tier} className="p-4 bg-black/30 rounded-2xl"><p className="font-black text-sm">{p.label} <span className="text-white/40 font-normal">${p.price}/mo</span></p><p className="text-[11px] text-white/40 mt-1">{p.description}</p></div>)}</div>
      </Panel>
      <Panel title="Orders" sub="Workflow: awaiting scheduling → scheduled → live → completed. “Flag refund” marks it for you to refund in Stripe; it does not move money.">
        {!d.offPlatform.items.length ? <Empty>No off-platform orders yet.</Empty> : (
          <div className="space-y-3">
            {d.offPlatform.items.map(o => {
              const flow = OFF_FLOW.find(f => f.status === o.status);
              return (
                <div key={o.id} className="p-4 bg-black/30 rounded-2xl flex flex-wrap items-center gap-4">
                  <div className="min-w-[10rem]"><p className="font-black text-sm">{o.tier || '—'} · {usd(o.price)}</p><p className="text-[10px] text-white/40">{when(o.createdAt)} · {String(o.userId || '').slice(0, 10)}</p></div>
                  <Pill tone={statusTone(o.status)}>{label(String(o.status || 'unknown'))}</Pill>
                  {o.adminNote && <p className="text-[11px] text-white/50 italic">“{o.adminNote}”</p>}
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {flow && flow.next.length > 0 && <input className="bg-black/40 rounded-full px-4 py-2 text-[11px] w-44" placeholder="Note (optional)" value={notes[o.id] || ''} onChange={e => setNotes({ ...notes, [o.id]: e.target.value })} />}
                    {flow?.next.map(n => <Btn key={n.to} tone={n.to === 'REFUND_DUE' ? 'danger' : 'primary'} disabled={busy === 'op' + o.id} onClick={() => run('op' + o.id, () => setOffPlatformStatus(o.id, n.to, notes[o.id]))}>{n.label}</Btn>)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
};

// ── Promo marketplace ───────────────────────────────────────────────────────

const Marketplace: React.FC<{ d: AdOverview }> = ({ d }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {['PENDING', 'ACCEPTED', 'PAID', 'DECLINED'].map(s => <Stat key={s} label={label(s)} value={nf(d.bookings.byStatus[s] || 0)} tone={s === 'PENDING' && d.bookings.byStatus[s] ? 'warn' : 'default'} />)}
    </div>
    <Panel title="By kind" sub="Creators set their own rates; businesses book at that rate; the creator accepts or declines. Payment goes directly to the creator.">
      {!Object.keys(d.bookings.byKind).length ? <Empty>No bookings yet.</Empty> : (
        <div className="flex flex-wrap gap-2">{Object.entries(d.bookings.byKind).map(([k, n]) => <Pill key={k} tone="info">{label(k)} · {n}</Pill>)}</div>
      )}
    </Panel>
    <Panel title="Recent bookings" sub="Read-only: the creator owns the decision">
      {!d.bookings.recent.length ? <Empty>No bookings yet.</Empty> : (
        <Table head={['When', 'Business', 'Creator', 'Kind', 'Rate', 'Status']}>
          {d.bookings.recent.map(b => <tr key={b.id}><td className="py-2 pr-4">{when(b.createdAt)}</td><td className="pr-4">{b.businessName}</td><td className="pr-4">{b.creatorName}</td><td className="pr-4 text-white/50">{label(String(b.kind))}</td><td className="pr-4">{usd(b.rate)}</td><td><Pill tone={statusTone(b.status)}>{b.status}</Pill></td></tr>)}
        </Table>
      )}
    </Panel>
  </div>
);

// ── Patronage + bounties ────────────────────────────────────────────────────

const Patronage: React.FC<{ d: AdOverview; run: RunFn; busy: string }> = ({ d, run, busy }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Stat label="Creator wallets" value={nf(d.patronage.wallets)} />
      <Stat label="Pending to cash out" value={cents(d.patronage.pendingCents)} hint="Owed to creators; paid by Stripe transfer" />
      <Stat label="Paid directly (lifetime)" value={cents(d.patronage.lifetimeDirectCents)} />
      <Stat label="Earned (lifetime)" value={cents(d.patronage.lifetimeEarnedCents)} />
    </div>
    <Panel title="Ad-sync bounties" sub="Sponsors post a brief and an upfront bounty; a creator takes it on. Moving a bounty on records progress only; payouts stay in Stripe.">
      <div className="flex flex-wrap gap-2 mb-4">{['OPEN', 'IN_PROGRESS', 'COMPLETED'].map(s => <Pill key={s} tone={statusTone(s)}>{label(s)} · {d.bounties.byStatus[s] || 0}</Pill>)}</div>
      {!d.bounties.items.length ? <Empty>No bounties posted yet.</Empty> : (
        <div className="space-y-3">
          {d.bounties.items.map(b => (
            <div key={b.id} className="p-4 bg-black/30 rounded-2xl flex flex-wrap items-center gap-4">
              <div className="min-w-[12rem] flex-1"><p className="font-black text-sm">{b.title}</p><p className="text-[10px] text-white/40">{b.sponsorName} · {cents(b.upfrontBountyCents)} upfront · {b.adSpendRoyaltyPct}% royalty · {when(b.createdAt)}</p></div>
              <Pill tone={statusTone(b.status)}>{label(String(b.status))}</Pill>
              <div className="flex gap-2">
                {(['OPEN', 'IN_PROGRESS', 'COMPLETED'] as const).filter(s => s !== b.status).map(s => <Btn key={s} disabled={busy === 'bn' + b.id} onClick={() => run('bn' + b.id, () => setBountyStatus(b.id, s))}>{label(s)}</Btn>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  </div>
);

// ── Rotation mix ────────────────────────────────────────────────────────────

const Rotation: React.FC = () => {
  const { data: settings, error, reload } = useLoad(fetchSystemSettingsConfig);
  const [draft, setDraft] = useState<AdRatioConfig | null>(null);
  const [msg, setMsg] = useState('');
  const ratios: AdRatioConfig = draft || settings?.adRatios || { userPromos: 0, partners: 0, thirdParty: 0 };
  const total = ratios.userPromos + ratios.partners + ratios.thirdParty;
  const save = async () => {
    if (total !== 100) { setMsg('The three shares must add up to 100.'); return; }
    try { await updateSystemSettingsConfig({ adRatios: ratios }); setMsg('Saved'); setDraft(null); reload(); } catch (e: any) { setMsg('Failed: ' + (e?.message || e)); }
  };
  const field = (k: keyof AdRatioConfig, name: string) => (
    <label className="text-[10px] text-white/40">{name}
      <input type="number" min={0} max={100} className="w-full bg-black/40 rounded-xl px-4 py-3 text-sm mt-1" value={ratios[k]} onChange={e => setDraft({ ...ratios, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
    </label>
  );
  return (
    <div className="space-y-6">
      {error && <Empty>{error}</Empty>}
      <Panel title="Global ad mix" sub="What share of ad slots go to each source">
        <div className="grid grid-cols-3 gap-4">{field('userPromos', 'User promotions %')}{field('partners', 'Partner content %')}{field('thirdParty', 'Third-party %')}</div>
        <div className="flex items-center gap-3 mt-4">
          <Pill tone={total === 100 ? 'good' : 'bad'}>Total {total}%</Pill>
          <Btn tone="primary" disabled={!draft} onClick={save}>Save mix</Btn>
          {msg && <span className={'text-[11px] font-bold ' + (msg === 'Saved' ? 'text-emerald-400' : 'text-red-400')}>{msg}</span>}
        </div>
        <p className="text-[10px] text-white/30 mt-3">The slot allocator’s built-in default is {Math.round(AD_SLOT_DISTRIBUTION.USER_PROMO * 100)} / {Math.round(AD_SLOT_DISTRIBUTION.CONTENT_PARTNER * 100)} / {Math.round(AD_SLOT_DISTRIBUTION.THIRD_PARTY * 100)} (user / partner / third-party); this setting is what the platform stores for it.</p>
      </Panel>
      <NetworkAds />
      <Panel title="How boost is earned" sub="Rules in services/adAlgorithmService, shown so support can explain a creator’s placement">
        <div className="grid md:grid-cols-3 gap-3 text-[11px] text-white/60">
          <div className="p-4 bg-black/30 rounded-2xl"><p className="font-black text-white mb-1">Subscription</p>{Object.entries(SUBSCRIPTION_BOOST_PCT).map(([t, p]) => <p key={t}>Tier {t}: +{p}%</p>)}</div>
          <div className="p-4 bg-black/30 rounded-2xl"><p className="font-black text-white mb-1">Achievements</p>{Object.entries(ACHIEVEMENT_BOOST).map(([k, v]) => <p key={k}>{label(k)}: +{v.pct}% for {v.daysMs / 86_400_000} d</p>)}</div>
          <div className="p-4 bg-black/30 rounded-2xl"><p className="font-black text-white mb-1">Points</p><p>Spend points for up to +{POINTS_BOOST_MAX}%</p></div>
        </div>
      </Panel>
      <Panel title="Plajah’s own promo spots" sub="The site-wide rotation in FAST breaks and the left ad panel (services/promos/platformPromos.ts)">
        <Table head={['Spot', 'Length', 'Sells channel', 'Weight']}>
          {PLAJAH_PROMOS.map(p => <tr key={p.id}><td className="py-2 pr-4 font-bold">{p.title}</td><td className="pr-4">{p.durationSec}s</td><td className="pr-4 text-white/50">{p.channel?.name || '—'}</td><td>{p.weight || 1}</td></tr>)}
        </Table>
      </Panel>
    </div>
  );
};

// ── Network ads: who fills the third-party share ────────────────────────────

const NetworkAds: React.FC = () => {
  const { data, error, reload } = useLoad(fetchAdNetworkAdmin);
  const [draft, setDraft] = useState<AdNetworkConfig | null>(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const c: AdNetworkConfig = draft || data?.config || DEFAULT_AD_NETWORK;
  const set = <K extends keyof AdNetworkConfig>(k: K, v: AdNetworkConfig[K]) => setDraft({ ...c, [k]: v });
  const save = async () => {
    setSaving(true); setMsg('');
    try { await saveAdNetworkAdmin(c); resetAdNetworkCache(); setDraft(null); setMsg('Saved'); reload(); }
    catch (e: any) { setMsg('Failed: ' + (e?.message || e)); }
    finally { setSaving(false); }
  };
  const text = (k: 'networkCode' | 'railUnitPath' | 'videoTagUrl' | 'audioTagUrl' | 'adsensePubId', name: string, ph: string, hint?: string) => (
    <label className="text-[10px] text-white/40 block">{name}
      <input className="w-full bg-black/40 rounded-xl px-4 py-3 text-sm mt-1 font-mono" placeholder={ph} value={c[k]} onChange={e => set(k, e.target.value)} />
      {hint && <span className="block mt-1 text-white/25">{hint}</span>}
    </label>
  );
  const toggle = (k: 'enabled' | 'testMode' | 'gamesEnabled' | 'restrictSignedOut', name: string, hint: string) => (
    <label className="flex items-start gap-3 p-3 bg-black/30 rounded-2xl cursor-pointer">
      <input type="checkbox" className="mt-1" checked={c[k]} onChange={e => set(k, e.target.checked)} />
      <span><span className="block text-[12px] font-bold text-white">{name}</span><span className="block text-[10px] text-white/40">{hint}</span></span>
    </label>
  );
  return (
    <Panel title="Network ads (third-party share)" sub="Google Ad Manager and AdSense fill the third-party % above. Plajah’s own ads fill in whenever Google has none.">
      {error && <Empty>{error}</Empty>}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Pill tone={data?.config.enabled ? (data.config.testMode ? 'warn' : 'good') : 'mute'}>{data?.config.enabled ? (data.config.testMode ? 'On: Google test ads' : 'On') : 'Off'}</Pill>
        <Pill tone="mute">Share {data?.thirdPartyPct ?? '—'}%</Pill>
        <Pill tone="mute">Never shown to child, under-18 or education accounts</Pill>
      </div>
      <div className="grid md:grid-cols-2 gap-3 mb-4">
        {toggle('enabled', 'Network ads on', 'Master switch for every surface: side ad panel, TV breaks, Plajah FM, web games.')}
        {toggle('testMode', 'Test mode', 'Use Google’s public sample ads (they never pay). Safe before your account is approved.')}
        {toggle('gamesEnabled', 'Ads in web games', 'One short ad as Era Clash / Lexicon load (needs the AdSense publisher id).')}
        {toggle('restrictSignedOut', 'No network ads for signed-out visitors', 'Treat visitors who aren’t signed in like child accounts.')}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {text('networkCode', 'Ad Manager network code', '21812345678')}
        {text('railUnitPath', 'Side ad panel unit', '/21812345678/plajah_rail', 'Ad Manager → Inventory → Ad units. Sizes 300×250, 250×250, 200×200.')}
        {text('videoTagUrl', 'TV break VAST tag', 'https://pubads.g.doubleclick.net/gampad/ads?…', 'One 15–30 s spot in breaks of 40 s or more.')}
        {text('audioTagUrl', 'Plajah FM tune-in VAST tag', 'https://pubads.g.doubleclick.net/gampad/ads?…', 'At most once per listener per 30 min. Empty = use the TV tag.')}
        {text('adsensePubId', 'AdSense publisher id', 'ca-pub-1234567890123456', 'Also writes Google’s line into ads.txt.')}
      </div>
      <label className="text-[10px] text-white/40 block mt-4">Other ads.txt sellers (one per line)
        <textarea rows={3} className="w-full bg-black/40 rounded-xl px-4 py-3 text-[12px] mt-1 font-mono" placeholder="adinplay.com, 12345, DIRECT" value={c.adsTxtExtra} onChange={e => set('adsTxtExtra', e.target.value)} />
      </label>
      <div className="flex items-center gap-3 mt-4">
        <Btn tone="primary" disabled={!draft || saving} onClick={save}>{saving ? 'Saving…' : 'Save network ads'}</Btn>
        {draft && <Btn onClick={() => setDraft(null)}>Discard</Btn>}
        {msg && <span className={'text-[11px] font-bold ' + (msg === 'Saved' ? 'text-emerald-400' : 'text-red-400')}>{msg}</span>}
      </div>
      <div className="mt-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">plajah.com/ads.txt (what Google checks)</p>
        <pre className="text-[11px] bg-black/40 rounded-xl p-3 text-white/70 whitespace-pre-wrap">{data?.adsTxt || '—'}</pre>
      </div>
      <p className="text-[10px] text-white/30 mt-3">Do these in your Google accounts, not here: block sensitive categories (dating, gambling, alcohol, politics) under Ad Manager → Protections; switch on Privacy &amp; messaging so EU/UK visitors get Google’s consent message.</p>
    </Panel>
  );
};

export default AdminAdPlatform;
