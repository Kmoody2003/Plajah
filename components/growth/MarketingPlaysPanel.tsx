// Marketing plays — the preset's ready-to-run campaigns (local mail, billboards, social and search) with
// honest hand-offs: save the plan as a campaign draft (Local Reach / Campaigns), download a billboard brief
// or a direct-mail job (+ recipient CSV from the CRM), and open the full Marketing suite to run paid social.
// No paid order is placed from here.

import React, { useState } from 'react';
import { Download, FileText, Loader2, Mail, Monitor, Megaphone, Save } from 'lucide-react';
import type { MarketingPlay } from '../../services/opsPresets';
import { CHANNEL_LABEL, CHANNEL_MODEL, type AdChannel, type AdVendor, type Placement } from '../../services/marketing/campaignTypes';
import { createCampaign } from '../../services/marketing/campaignService';
import { billboardBrief, briefHtml, downloadText, mailJob, recipientsCsv, type HandoffIdentity, type MailRecipient } from '../../services/marketing/handoff';
import { BO, BoLabel, BoSectionHead, moneyCents } from '../business/opsKit';

const VENDOR: Partial<Record<AdChannel, AdVendor>> = {
  eddm: 'taradel', direct_mail: 'lob', billboard_dooh: 'adomni', plajah_house: 'plajah', google: 'google', bing: 'bing', meta: 'meta',
};

export interface MarketingPlaysPanelProps {
  plays: MarketingPlay[];
  scope: { kind: 'BUSINESS' | 'ORG'; id: string; name: string };
  identity: HandoffIdentity;
  /** Mailing list for targeted mail (CRM segment or everyone with an address). */
  loadRecipients?: (segmentId?: string) => Promise<MailRecipient[]>;
  onOpenSuite?: () => void;
  /** Optional event to promote: plays get its title prefilled. */
  promoteTitle?: string | null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function MarketingPlaysPanel({ plays, scope, identity, loadRecipients, onOpenSuite, promoteTitle }: MarketingPlaysPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [startOn, setStartOn] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));

  const say = (id: string, ok: boolean, text: string) => setNote(n => ({ ...n, [id]: { ok, text } }));
  const startDate = () => new Date(`${startOn}T09:00:00`);
  const withPromo = (p: MarketingPlay): MarketingPlay => (promoteTitle ? { ...p, headline: promoteTitle, billboard: p.billboard ? { ...p.billboard, line: promoteTitle.split(/\s+/).slice(0, 7).join(' ') } : undefined } : p);

  const saveDraft = async (raw: MarketingPlay) => {
    const p = withPromo(raw);
    setBusy(`save:${p.id}`);
    try {
      const share = Math.round(p.budgetCents / p.channels.length);
      const placements: Placement[] = p.channels.map(c => ({ channel: c, model: CHANNEL_MODEL[c], vendor: VENDOR[c] ?? null, status: 'estimated', spendCents: share }));
      const start = startDate().getTime();
      await createCampaign({
        scope: { kind: scope.kind, id: scope.id, name: scope.name },
        name: `${p.label}${promoteTitle ? ` — ${promoteTitle}` : ''}`,
        objective: p.objective,
        schedule: { start, end: start + p.durationDays * 86400000 },
        budget: { totalCents: p.budgetCents, currency: 'usd', pacing: 'even' },
        audience: p.mail?.list === 'crm_segment' || p.mail?.list === 'store_customers' ? { list: { source: 'store_customers', segmentId: p.mail.segmentId } } : {},
        creatives: [],
        placements,
      });
      say(p.id, true, 'Saved as a campaign draft. Open Marketing to add creative and review the estimate.');
    } catch (e: any) {
      say(p.id, false, e?.message || 'Could not save.');
    } finally { setBusy(null); }
  };

  const billboard = (raw: MarketingPlay) => {
    const p = withPromo(raw);
    const b = billboardBrief(p, identity, startDate());
    downloadText(`${slug(identity.name)}-${p.id}-billboard-brief.html`, briefHtml(b), 'text/html');
    say(p.id, b.copy.check.ok, b.copy.check.ok ? 'Billboard brief downloaded. Send it with your artwork to a DOOH seller.' : b.copy.check.advice!);
  };

  const mail = async (raw: MarketingPlay) => {
    const p = withPromo(raw);
    setBusy(`mail:${p.id}`);
    try {
      const eddm = p.mail?.list === 'eddm_routes' || p.channels.includes('eddm');
      const rows = !eddm && loadRecipients ? await loadRecipients(p.mail?.segmentId) : [];
      const job = mailJob(p, identity, rows, startDate());
      downloadText(`${slug(identity.name)}-${p.id}-mail-job.json`, JSON.stringify(job, null, 2), 'application/json');
      downloadText(`${slug(identity.name)}-${p.id}-mail-brief.html`, briefHtml(job), 'text/html');
      if (!eddm) downloadText(`${slug(identity.name)}-${p.id}-recipients.csv`, recipientsCsv(rows), 'text/csv');
      say(p.id, true, eddm
        ? 'Mail job and brief downloaded. Pick carrier routes in the USPS EDDM tool, then send the brief and artwork to your printer.'
        : `Mail job, brief and ${rows.length} recipients downloaded for your print-and-mail vendor.`);
    } catch (e: any) {
      say(p.id, false, e?.message || 'Could not build the mail job.');
    } finally { setBusy(null); }
  };

  return (
    <section>
      <BoSectionHead
        title="Marketing"
        sub={<>Ready-to-run plays for {scope.name}. Save one as a campaign, or download the brief for a billboard company or print-and-mail house.</>}
        action={<>
          <label className="flex items-center gap-2 text-[13px] text-[#A39BAE]">Start
            <input type="date" className="bo-input" style={{ width: 170, minHeight: 40 }} value={startOn} onChange={e => setStartOn(e.target.value)} />
          </label>
          {onOpenSuite && <button className="bo-btn bo-btn-ghost" onClick={onOpenSuite}><Megaphone size={16} /> Marketing suite</button>}
        </>}
      />
      {promoteTitle && <div className="bo-raised px-4 py-3 mb-5 text-sm text-white">Promoting <b>{promoteTitle}</b>: headlines below use the event title.</div>}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {plays.map(raw => {
          const p = withPromo(raw);
          const offline = p.channels.some(c => c === 'eddm' || c === 'direct_mail');
          const board = p.channels.includes('billboard_dooh');
          const n = note[p.id];
          return (
            <article key={p.id} className="bo-panel p-6 flex flex-col gap-4">
              <div>
                <div className="flex flex-wrap gap-1.5 mb-3">{p.channels.map(c => <span key={c} className="bo-chip">{CHANNEL_LABEL[c]}</span>)}</div>
                <h3 className="m-0 bo-title text-[22px] text-white leading-tight">{p.label}</h3>
                {p.when && <div className="text-[13px] text-[#A39BAE] mt-1">{p.when}</div>}
              </div>
              <div className="grid grid-cols-3 gap-3" style={{ borderTop: `1px solid ${BO.line}`, borderBottom: `1px solid ${BO.line}` }}>
                <div className="py-3"><BoLabel>Budget</BoLabel><div className="bo-num text-xl text-white mt-1">{moneyCents(p.budgetCents)}</div></div>
                <div className="py-3"><BoLabel>Run</BoLabel><div className="bo-num text-xl text-white mt-1">{p.durationDays}d</div></div>
                <div className="py-3"><BoLabel>Reach</BoLabel><div className="bo-num text-xl text-white mt-1">{p.radiusMi != null ? `${p.radiusMi} mi` : 'List'}</div></div>
              </div>
              <div className="bo-paper p-4">
                <div className="bo-title text-lg leading-tight">{p.billboard?.line || p.headline}</div>
                {p.body && <p className="m-0 mt-1.5 text-sm bo-muted">{p.body}</p>}
                <div className="text-[13px] font-semibold mt-2" style={{ color: BO.magenta }}>{p.cta}</div>
              </div>
              <div className="flex flex-wrap gap-2 mt-auto">
                <button className="bo-btn bo-btn-primary bo-btn-sm" disabled={busy === `save:${p.id}`} onClick={() => saveDraft(raw)}>
                  {busy === `save:${p.id}` ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save campaign
                </button>
                {board && <button className="bo-btn bo-btn-ghost bo-btn-sm" onClick={() => billboard(raw)}><Monitor size={14} /> Billboard brief</button>}
                {offline && <button className="bo-btn bo-btn-ghost bo-btn-sm" disabled={busy === `mail:${p.id}`} onClick={() => mail(raw)}>
                  {busy === `mail:${p.id}` ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Mail job
                </button>}
              </div>
              {n && <p className="m-0 text-[13px]" style={{ color: n.ok ? BO.success : BO.warn }}>{n.text}</p>}
            </article>
          );
        })}
      </div>
      <p className="text-[13px] text-[#A39BAE] mt-5 max-w-3xl flex gap-2"><FileText size={14} className="shrink-0 mt-0.5" />
        Plajah does not buy billboard space or postage yet. Briefs and mail jobs are formatted for the vendors you choose (DOOH sellers, Lob/PostGrid-style print-and-mail, or a local printer using USPS EDDM). <Download size={12} className="inline" /> Files download to this device.</p>
    </section>
  );
}
