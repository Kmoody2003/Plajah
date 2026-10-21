// Growth hub — one place where a business or org runs its events, social, marketing and (for businesses)
// CRM, all pre-wired by its ops preset (services/opsPresets). Mounted by BusinessDashboard and ElevateOps.

import React, { Suspense, lazy, useEffect, useState } from 'react';
import type { OpsPreset } from '../../services/opsPresets';
import type { HandoffIdentity, MailRecipient } from '../../services/marketing/handoff';
import { BoScope, BoSegmented } from '../business/opsKit';
import SocialPlaybookPanel from './SocialPlaybookPanel';
import MarketingPlaysPanel from './MarketingPlaysPanel';

const HostEventsPanel = lazy(() => import('../events/HostEventsPanel'));

export type GrowthTab = 'events' | 'social' | 'marketing';

export interface GrowthHubProps {
  preset: OpsPreset;
  host: { kind: 'business' | 'org'; id: string; name: string };
  currentUser: any;
  identity: HandoffIdentity;
  canManage: boolean;
  loadRecipients?: (segmentId?: string) => Promise<MailRecipient[]>;
  onOpenSuite?: () => void;
  initialTab?: GrowthTab;
  /** Hide the tab bar when the host already provides navigation for a single tab. */
  only?: GrowthTab;
}

export default function GrowthHub({ preset, host, currentUser, identity, canManage, loadRecipients, onOpenSuite, initialTab = 'events', only }: GrowthHubProps) {
  const [tab, setTab] = useState<GrowthTab>(only ?? initialTab);
  const [promote, setPromote] = useState<{ title: string; startAt?: number } | null>(null);
  const scope = { kind: host.kind === 'org' ? 'ORG' as const : 'BUSINESS' as const, id: host.id, name: host.name };

  useEffect(() => { if (only) setTab(only); }, [only]);

  // HostEventsPanel's "Promote" hands an event to marketing + social.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.host?.id && d.host.id !== host.id) return;
      setPromote({ title: d.title || 'Our next event', startAt: d.startAt });
      if (!only) setTab('marketing');
    };
    window.addEventListener('plajah:opsPromoteEvent', on);
    return () => window.removeEventListener('plajah:opsPromoteEvent', on);
  }, [host.id, only]);

  const promoWhen = promote?.startAt ? new Date(promote.startAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : '';

  return (
    <BoScope accent={preset.accent} className="min-h-full" style={{ background: 'transparent' }}>
      {!only && (
        <div className="mb-8">
          <BoSegmented value={tab} onChange={k => setTab(k as GrowthTab)} options={[
            { k: 'events', label: 'Events', count: preset.events.length },
            { k: 'social', label: 'Social' },
            { k: 'marketing', label: 'Marketing', count: preset.marketing.length },
          ]} />
        </div>
      )}
      {tab === 'events' && (
        <Suspense fallback={<div className="py-16 text-center text-sm text-[#A39BAE]">Loading events…</div>}>
          <HostEventsPanel host={host} currentUser={currentUser} playbooks={preset.events} accent={preset.accent} canManage={canManage} />
        </Suspense>
      )}
      {tab === 'social' && (
        <SocialPlaybookPanel
          key={promote?.title || 'base'}
          playbook={preset.social}
          scope={scope}
          seed={promote ? { text: `${promote.title}${promoWhen ? ` — ${promoWhen}` : ''}. Details and tickets on our Plajah page.` } : null}
          onOpenStudio={onOpenSuite}
        />
      )}
      {tab === 'marketing' && (
        <MarketingPlaysPanel plays={preset.marketing} scope={scope} identity={identity} loadRecipients={loadRecipients} onOpenSuite={onOpenSuite} promoteTitle={promote?.title ?? null} />
      )}
    </BoScope>
  );
}
