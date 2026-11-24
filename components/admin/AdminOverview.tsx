import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { RefreshCw } from 'lucide-react';
import { fetchPlatformOverview, fetchAuditLog } from '../../services/adminPlatformService';
import { Header, Stat, Panel, Btn, Empty, Pill, nf, usd, when, useLoad } from './adminUi';

/**
 * System Admin home. Every number is counted by the server from the database (see
 * routes/adminPlatform.ts). A figure that could not be counted shows "—", never 0.
 */
const AdminOverview: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const ov = useLoad(fetchPlatformOverview);
  const audit = useLoad(() => fetchAuditLog(25));
  const o = ov.data;

  const queue: Array<{ label: string; n: number | null; tab: string; tone: 'warn' | 'bad' }> = o ? [
    { label: 'Open content reports', n: o.attention.openContentReports, tab: 'CONTENT_REPORTS', tone: 'bad' },
    { label: 'Errors in the last 24 h', n: o.attention.errors24h, tab: 'ERRORS', tone: 'warn' },
    { label: 'Off-platform promos to schedule', n: o.attention.offPlatformAwaitingScheduling, tab: 'ADS', tone: 'warn' },
    { label: 'Promo bookings awaiting a creator', n: o.attention.promoBookingsPending, tab: 'ADS', tone: 'warn' },
    { label: 'Open ad-sync bounties', n: o.attention.adBountiesOpen, tab: 'ADS', tone: 'warn' },
  ] : [];

  return (
    <div className="space-y-8">
      <Header
        title="Overview"
        sub={o ? 'Counted from the database ' + when(o.generatedAt) : 'Loading…'}
        right={<Btn onClick={() => { ov.reload(); audit.reload(); }}><RefreshCw size={12} className="inline mr-2" />Refresh</Btn>}
      />
      {ov.error && <Empty>Could not load platform metrics: {ov.error}</Empty>}

      {o && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Total users" value={nf(o.people.total)} />
            <Stat label="New (24 h)" value={nf(o.people.new24h)} hint={'7 d: ' + nf(o.people.new7d) + ' · 30 d: ' + nf(o.people.new30d)} />
            <Stat label="Devices reporting (24 h)" value={nf(o.people.healthReporting24h)} hint="From the user-health beacon, not total sessions" />
            <Stat label="Ad package revenue (30 d)" value={usd(o.ads.packageRevenue30d)} hint={nf(o.ads.packagesSold30d) + ' sold · all time ' + usd(o.ads.packageRevenueAllTime)} onClick={() => onNavigate('ADS')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Panel title="Needs attention" sub="Click through to the queue" className="lg:col-span-1">
              <div className="space-y-2">
                {queue.map(q => (
                  <button key={q.label} onClick={() => onNavigate(q.tab)} className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-black/30 hover:bg-white/10 transition-colors text-left">
                    <span className="text-[11px] text-white/70">{q.label}</span>
                    {q.n == null ? <Pill>unknown</Pill> : q.n === 0 ? <Pill tone="good">clear</Pill> : <Pill tone={q.tone}>{q.n.toLocaleString()}</Pill>}
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Signups by month" sub="Users created, last six months" className="lg:col-span-2">
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={o.signups.map(s => ({ name: s.label, count: s.count ?? 0 }))}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={10} />
                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11 }} />
                    <Bar dataKey="count" name="Signups" fill="#D40055" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <Panel title="Content on the platform" sub="Exact totals, not capped reads">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {(Object.entries(o.content) as Array<[string, number | null]>).map(([k, v]) => (
                <div key={k} className="p-4 bg-black/30 rounded-2xl">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{k === 'liveFeed' ? 'live feeds' : k}</p>
                  <p className="text-xl font-black">{nf(v)}</p>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Recent admin actions" sub="Ad platform changes are logged here; more sections are being moved onto the log">
          {audit.error ? <Empty>{audit.error}</Empty> : !audit.data?.length ? <Empty>No admin actions recorded yet.</Empty> : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {audit.data.map(a => (
                <li key={a.id} className="flex items-center justify-between gap-3 text-[11px] px-3 py-2 rounded-xl bg-black/30">
                  <span className="truncate"><span className="text-white/80 font-bold">{a.action}</span> <span className="text-white/40">{a.target}</span></span>
                  <span className="text-white/30 shrink-0">{when(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Not measured yet" sub="Shown honestly instead of estimated. Each needs a real data source first.">
          <ul className="space-y-2 text-[11px] text-white/60">
            {[
              ['Storage and bandwidth totals', 'The old Stats tab showed fixed placeholder sizes. Needs per-object byte accounting from Drive and B2.'],
              ['Daily and monthly active users', 'Only the health beacon is counted above. Needs a first-party presence/session event.'],
              ['Platform revenue beyond ad packages', 'Plajah+, store sales and tips settle directly to the people paid, so no ledger rolls them up here.'],
              ['Admin audit of non-ad sections', 'The log exists; Feature Toggles, Staff, Library and Themes still need to write to it.'],
            ].map(([t, d]) => (
              <li key={t} className="px-3 py-2 rounded-xl bg-black/30"><span className="font-bold text-white/80">{t}.</span> {d}</li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
};

export default AdminOverview;
