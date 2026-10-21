// CorrespondenceStudio — pick a preset template, edit it with merge-field chips, preview it against a real
// recipient, pass the consent gate, then send by channel:
//   push   → Plajah in-app notification + push (businessMessagingService opt-in list; subscribers only)
//   email  → the person's own email app via mailto: (BCC batches). There is no small-list email endpoint:
//            /api/campaigns/send only mails the server-chosen opted-in audience, by design.
//   letter → printable letters on the business letterhead
//   postcard → printable 6x9 postcards + a print-and-mail hand-off (CSV + JSON job spec). No paid API is called.
// Every send writes one CrmActivity per recipient and bumps lastContactAt. SMS is intentionally not offered.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Mail, Bell, FileText, Image as ImageIcon, Printer, Download, Send, ShieldCheck, Copy, CheckCircle2, Loader2, MapPinned } from 'lucide-react';
import type { BusinessPage, CrmContact } from '../../types';
import type { CorrespondenceChannel, CorrespondenceTemplate, OpsPreset } from '../../services/opsPresets/types';
import {
  MERGE_FIELDS, fullName, gateRecipients, mailingCsv, mailingRows, mergeFields, type MailingRow, type MergeContext,
} from '../../services/crm/crmCore';
import { recordCorrespondence } from '../../services/crm/crmService';
import { listBusinessSubscribers } from '../../services/businessMessagingService';
import { createNotification } from '../../services/backendService';
import { verifyAddressBatch } from '../../services/marketing/lobVerification';
import { CrmStyles, Field, downloadFile, rootStyle } from './crmTheme';
import { labelsHtml, lettersHtml, postcardsHtml, printHtml, type MailJobSpec } from './crmPrint';

export interface CorrespondenceStudioProps {
  businessPage: BusinessPage;
  currentUser: { uid: string; displayName?: string };
  preset: OpsPreset;
  recipients?: CrmContact[];
  initialTemplateId?: string;
  onClose: () => void;
  accent?: string;
  /** Staff may not bulk-send promotional templates (more than one recipient). */
  mode?: 'owner' | 'staff';
  /** Called after a send is recorded, with how many contacts it reached. */
  onSent?: (info: { channel: CorrespondenceChannel; count: number }) => void;
}

const CHANNELS: { id: CorrespondenceChannel; label: string; icon: React.ReactNode }[] = [
  { id: 'email', label: 'Email', icon: <Mail size={16} /> },
  { id: 'push', label: 'App notification', icon: <Bell size={16} /> },
  { id: 'letter', label: 'Letter', icon: <FileText size={16} /> },
  { id: 'postcard', label: 'Postcard', icon: <ImageIcon size={16} /> },
];

const UNREACHABLE: Record<CorrespondenceChannel, string> = {
  email: 'have no email address',
  push: 'have no Plajah account linked',
  letter: 'have no complete mailing address or asked not to be mailed',
  postcard: 'have no complete mailing address or asked not to be mailed',
};

const MAILTO_BATCH = 40;

function businessAddressLines(p: BusinessPage): string[] {
  const cityLine = [p.city, [p.state, p.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [p.address, cityLine].filter((s): s is string => !!s && !!s.trim());
}

function toMailingRow(c: CrmContact): MailingRow | null {
  return mailingRows([c])[0] || null;
}

export const CorrespondenceStudio: React.FC<CorrespondenceStudioProps> = ({
  businessPage, currentUser, preset, recipients = [], initialTemplateId, onClose, accent, mode = 'owner', onSent,
}) => {
  const templates = preset.correspondence || [];
  const initial = templates.find(t => t.id === initialTemplateId);
  const [channel, setChannel] = useState<CorrespondenceChannel>(initial?.channel || 'email');
  const [templateId, setTemplateId] = useState<string>(initial?.id || '');
  const [subject, setSubject] = useState(initial?.subject || '');
  const [body, setBody] = useState(initial?.body || '');
  const [promotional, setPromotional] = useState<boolean>(initial ? !!initial.promotional : true);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [previewIdx, setPreviewIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [verify, setVerify] = useState<string>('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const lastFocus = useRef<'subject' | 'body'>('body');

  const template = templates.find(t => t.id === templateId);
  const locked = !!template?.promotional; // a promo template can't be relabelled transactional
  const effectivePromo = locked || promotional;

  const pickTemplate = (t: CorrespondenceTemplate | null) => {
    setTemplateId(t?.id || '');
    setSubject(t?.subject || '');
    setBody(t?.body || '');
    setPromotional(t ? !!t.promotional : true);
    setResult(''); setError('');
  };

  // Switching channel clears a template that belongs to another channel.
  useEffect(() => {
    if (template && template.channel !== channel) pickTemplate(null);
    setResult(''); setError(''); setVerify('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const gate = useMemo(() => gateRecipients(recipients, { channel, promotional: effectivePromo }), [recipients, channel, effectivePromo]);
  const reachCounts = useMemo(() => Object.fromEntries(CHANNELS.map(ch => [ch.id, gateRecipients(recipients, { channel: ch.id, promotional: false }).ok.length])) as Record<CorrespondenceChannel, number>, [recipients]);
  const staffBlocked = mode === 'staff' && effectivePromo && recipients.length > 1;

  const ctxFor = (c?: CrmContact): MergeContext => ({
    contact: c,
    business: { name: businessPage.businessName, phone: businessPage.phone, address: businessAddressLines(businessPage).join(', ') },
    pipeline: preset.crm.pipelines.find(p => p.id === c?.pipelineId),
    eventTitle, eventDate,
    senderName: currentUser.displayName,
  });
  const previewContact = gate.ok[previewIdx % Math.max(1, gate.ok.length)] || recipients[0];
  const preview = mergeFields({ subject, body }, ctxFor(previewContact));
  const needsEvent = /\{\{\s*event_(title|date)\s*\}\}/.test(subject + body);

  const insertField = (key: string) => {
    const token = `{{${key}}}`;
    if (lastFocus.current === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const s = el.selectionStart ?? subject.length, e = el.selectionEnd ?? s;
      setSubject(subject.slice(0, s) + token + subject.slice(e));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
      return;
    }
    const el = bodyRef.current;
    const s = el?.selectionStart ?? body.length, e = el?.selectionEnd ?? s;
    setBody(body.slice(0, s) + token + body.slice(e));
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(s + token.length, s + token.length); } });
  };

  const actor = { uid: currentUser.uid, displayName: currentUser.displayName };
  const summaryLine = (subject || template?.label || body.split('\n')[0] || '').slice(0, 120);

  /** Log once per channel per studio session (printing twice shouldn't double the timeline). */
  const logSend = async (list: CrmContact[], key: string, note?: string) => {
    if (!list.length || logged.has(key)) return;
    await recordCorrespondence(list, {
      kind: channel, templateId: template?.id, summary: `${CHANNELS.find(c => c.id === channel)!.label}: ${summaryLine}${note ? ` (${note})` : ''}`, body,
    }, actor);
    setLogged(prev => new Set(prev).add(key));
    onSent?.({ channel, count: list.length });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e: any) { setError(e?.message || 'Something went wrong.'); }
    setBusy(false);
  };

  // ── Senders ──

  const sendPush = () => run(async () => {
    const category = effectivePromo ? 'PROMO' : 'TRANSACTIONAL';
    const subs = await listBusinessSubscribers(businessPage.ownerId, category);
    const subscribed = new Set(subs.filter(s => s.push !== false).map(s => s.customerUid));
    const targets = gate.ok.filter(c => c.userId && subscribed.has(c.userId));
    const skipped = gate.ok.length - targets.length;
    let failed = 0;
    await Promise.all(targets.map(c => {
      const m = mergeFields({ subject, body }, ctxFor(c));
      return createNotification({
        userId: c.userId!, senderId: businessPage.ownerId, senderName: businessPage.businessName,
        senderPhoto: businessPage.logoUrl || '', type: effectivePromo ? 'BUSINESS_PROMO' : 'BUSINESS_UPDATE',
        title: m.subject || businessPage.businessName, message: m.body, link: 'PROFILE', targetId: businessPage.ownerId,
      } as any).catch(() => { failed++; });
    }));
    await logSend(targets, 'push');
    setResult(`Sent to ${targets.length - failed} ${targets.length - failed === 1 ? 'person' : 'people'} in the app.`
      + (skipped ? ` ${skipped} skipped — not subscribed to ${effectivePromo ? 'promotions' : 'updates'} from ${businessPage.businessName}.` : '')
      + (failed ? ` ${failed} failed.` : ''));
  });

  const emailBatches = useMemo(() => {
    const out: CrmContact[][] = [];
    for (let i = 0; i < gate.ok.length; i += MAILTO_BATCH) out.push(gate.ok.slice(i, i + MAILTO_BATCH));
    return out;
  }, [gate.ok]);

  const openMail = (batchIdx: number) => run(async () => {
    const batch = emailBatches[batchIdx];
    if (!batch?.length) return;
    let href: string;
    if (batch.length === 1 && gate.ok.length === 1) {
      const m = mergeFields({ subject, body }, ctxFor(batch[0]));
      href = `mailto:${encodeURIComponent(batch[0].email!.trim())}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
    } else {
      // Group mail can't be personalised per person: merge with generic fallbacks ("Hi there").
      const m = mergeFields({ subject, body }, ctxFor(undefined));
      const self = businessPage.email ? encodeURIComponent(businessPage.email) : '';
      href = `mailto:${self}?bcc=${batch.map(c => encodeURIComponent(c.email!.trim())).join(',')}&subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
    }
    window.location.href = href;
    await logSend(batch, `email-${batchIdx}`, 'opened in email app');
    setResult(`Opened your email app for ${batch.length} ${batch.length === 1 ? 'person' : 'people'}. Logged on their timelines.`);
  });

  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(gate.ok.map(c => c.email!.trim()).join(', '));
      setResult(`Copied ${gate.ok.length} addresses.`);
    } catch { setError('Copy failed — your browser blocked clipboard access.'); }
  };

  const letterhead = () => ({
    name: businessPage.businessName, logoUrl: businessPage.logoUrl, addressLines: businessAddressLines(businessPage),
    phone: businessPage.phone, email: businessPage.email, website: businessPage.website, accent: accent || preset.accent || '#6B0099',
  });

  const printLetters = () => run(async () => {
    const date = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    const { html, css } = lettersHtml(gate.ok.map(c => { const m = mergeFields({ subject, body }, ctxFor(c)); return { to: toMailingRow(c), subject: m.subject, body: m.body }; }), letterhead(), date);
    printHtml(`${businessPage.businessName} letters`, html, css);
    await logSend(gate.ok, 'letter', 'printed');
    setResult(`${gate.ok.length} letters sent to the printer and logged.`);
  });

  const printLabels = () => {
    const { html, css } = labelsHtml(mailingRows(gate.ok));
    printHtml('Mailing labels', html, css);
  };

  const postcardFront = () => {
    const first = mergeFields({ subject, body }, ctxFor(undefined));
    return {
      headline: first.subject || template?.label || businessPage.businessName,
      sub: businessPage.tagline || businessAddressLines(businessPage).join(' · '),
      logoUrl: businessPage.logoUrl, businessName: businessPage.businessName, accent: accent || preset.accent || '#D40055',
    };
  };

  const printPostcards = () => run(async () => {
    const cards = gate.ok.map(c => ({ to: toMailingRow(c)!, message: mergeFields({ subject, body }, ctxFor(c)).body })).filter(c => c.to);
    const { html, css } = postcardsHtml(cards, postcardFront(), { name: businessPage.businessName, lines: businessAddressLines(businessPage) });
    printHtml(`${businessPage.businessName} postcards`, html, css);
    await logSend(gate.ok, 'postcard', 'printed');
    setResult(`${cards.length} postcards (front + back) sent to the printer and logged.`);
  });

  const downloadHandoff = () => run(async () => {
    const rows = mailingRows(gate.ok);
    const byId = new Map(gate.ok.map(c => [c.id, c]));
    const front = postcardFront();
    const spec: MailJobSpec = {
      format: channel === 'letter' ? 'letter' : 'postcard_6x9',
      quantity: rows.length,
      size: channel === 'letter' ? '8.5x11' : '6x9',
      copy: channel === 'letter'
        ? { subject, body, mergeFields: MERGE_FIELDS.map(f => f.key) }
        : { front: { headline: front.headline, sub: front.sub }, back: body, mergeFields: MERGE_FIELDS.map(f => f.key) },
      returnAddress: {
        name: businessPage.businessName, address1: businessPage.address || '', address2: '',
        city: businessPage.city || '', state: (businessPage.state || '').toUpperCase(), zip: businessPage.postalCode || '',
      },
      mailClass: effectivePromo ? 'usps_standard' : 'usps_first_class',
      list: rows.map(r => ({ ...r, message: mergeFields({ subject, body }, ctxFor(byId.get(r.contactId))).body })),
      generatedAt: new Date().toISOString(),
      note: 'Hand-off for a print-and-mail vendor (Lob / PostGrid style). Plajah did not submit or pay for this job.',
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = businessPage.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business';
    downloadFile(`${slug}-mail-list-${stamp}.csv`, mailingCsv(rows));
    setTimeout(() => downloadFile(`${slug}-mail-job-${stamp}.json`, JSON.stringify(spec, null, 2), 'application/json'), 300);
    await logSend(gate.ok, `${channel}-handoff`, 'mail vendor hand-off');
    setResult(`Downloaded the mailing list (${rows.length}) and job spec. Logged on each timeline.`);
  });

  const verifyAddresses = () => run(async () => {
    const rows = mailingRows(gate.ok).slice(0, 100);
    const r = await verifyAddressBatch(rows.map(x => ({ address_line1: x.address1, address_line2: x.address2 || undefined, address_city: x.city, address_state: x.state, address_zip: x.zip })));
    if (!r.configured) setVerify('Address verification isn’t set up on this server yet — addresses were not checked.');
    else setVerify(`${r.deliverableCount ?? 0} of ${r.total ?? rows.length} addresses look deliverable${rows.length < gate.ok.length ? ' (first 100 checked)' : ''}.`);
  });

  // ── UI ──

  const channelTemplates = templates.filter(t => t.channel === channel);
  const canSend = gate.ok.length > 0 && body.trim().length > 0 && !staffBlocked && !busy;
  const customFields = preset.crm.fields || [];

  return (
    <div className="crm-overlay" role="dialog" aria-modal="true" aria-label="Correspondence studio" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <CrmStyles />
      <div className="crm-root crm-sheet crm-sheet-wide" style={{ ...rootStyle(accent), borderRadius: 0 }}>
        <div className="crm-sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="crm-h crm-h2">Send correspondence</h2>
            <div className="crm-muted crm-small crm-num">{recipients.length} selected · {gate.ok.length} will receive it</div>
          </div>
          <button className="crm-btn crm-btn-ghost crm-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="crm-section">
          <div className="crm-tabs" role="tablist" aria-label="Channel">
            {CHANNELS.map(ch => (
              <button key={ch.id} role="tab" aria-selected={channel === ch.id} className="crm-tab" onClick={() => setChannel(ch.id)}>
                {ch.icon}{ch.label}<span className="crm-pill crm-num">{reachCounts[ch.id]}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="crm-chip" aria-pressed={!templateId} onClick={() => pickTemplate(null)}>Blank</button>
            {channelTemplates.map(t => (
              <button key={t.id} className="crm-chip" aria-pressed={templateId === t.id} onClick={() => pickTemplate(t)}>
                {t.label}{t.promotional && <span className="crm-pill crm-pill-accent">Promo</span>}
              </button>
            ))}
            {!channelTemplates.length && <span className="crm-muted crm-small" style={{ alignSelf: 'center' }}>No {channel} templates in this preset — start from blank.</span>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', flex: 1 }}>
          <div className="crm-section" style={{ borderRight: '1px solid var(--crm-line)' }}>
            <Field label={channel === 'postcard' ? 'Front headline' : channel === 'push' ? 'Notification title' : channel === 'letter' ? 'Subject line (optional)' : 'Subject'}>
              <input ref={subjectRef} className="crm-input" value={subject} onFocus={() => { lastFocus.current = 'subject'; }} onChange={e => setSubject(e.target.value)} />
            </Field>
            <Field label={channel === 'postcard' ? 'Back message' : 'Message'} hint={channel === 'push' ? 'Keep it short — phones show about two lines.' : channel === 'postcard' ? 'About 60 words fits the back of a 6x9.' : undefined}>
              <textarea ref={bodyRef} className="crm-input" rows={channel === 'letter' ? 12 : 8} value={body} onFocus={() => { lastFocus.current = 'body'; }} onChange={e => setBody(e.target.value)} />
            </Field>
            <div>
              <span className="crm-label">Insert a merge field</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {MERGE_FIELDS.map(f => <button key={f.key} className="crm-chip" onClick={() => insertField(f.key)}>{f.label}</button>)}
                {customFields.map(f => <button key={f.id} className="crm-chip" onClick={() => insertField(`custom.${f.id}`)}>{f.label}</button>)}
              </div>
            </div>
            {needsEvent && (
              <div className="crm-grid2">
                <Field label="Event title"><input className="crm-input" value={eventTitle} onChange={e => setEventTitle(e.target.value)} /></Field>
                <Field label="Event date"><input className="crm-input" value={eventDate} placeholder="Sat, Nov 8 at 7pm" onChange={e => setEventDate(e.target.value)} /></Field>
              </div>
            )}
            <label className="crm-switch">
              <span>
                <span style={{ display: 'block', fontWeight: 600 }}>Marketing message</span>
                <span className="crm-muted crm-small">{locked ? 'This template is promotional.' : 'Promotions only go to people who agreed to marketing.'}</span>
              </span>
              <input type="checkbox" checked={effectivePromo} disabled={locked} onChange={e => setPromotional(e.target.checked)} />
            </label>
          </div>

          <div className="crm-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 className="crm-h crm-h3" style={{ flex: 1 }}>Preview{previewContact ? ` for ${fullName(previewContact)}` : ''}</h3>
              {gate.ok.length > 1 && <button className="crm-btn crm-btn-ghost" onClick={() => setPreviewIdx(i => i + 1)}>Next person</button>}
            </div>
            <Preview channel={channel} subject={preview.subject} body={preview.body} businessName={businessPage.businessName} logoUrl={businessPage.logoUrl} />

            <div className="crm-note" style={{ display: 'flex', gap: 8 }}>
              <ShieldCheck size={16} style={{ flex: 'none', marginTop: 2 }} />
              <div className="crm-num">
                <b>{gate.ok.length}</b> of {recipients.length} will receive this.
                {gate.noConsent.length > 0 && <div>{gate.noConsent.length} left out — no marketing consent.</div>}
                {gate.unreachable.length > 0 && <div>{gate.unreachable.length} left out — {UNREACHABLE[channel]}.</div>}
                {channel === 'push' && <div className="crm-muted">Only people subscribed to {businessPage.businessName} in the app get it; others are reported after sending.</div>}
              </div>
            </div>
            {staffBlocked && <div className="crm-note crm-warn">Staff can send promotions to one person at a time. Ask the owner to send this to a group.</div>}
            {!recipients.length && <div className="crm-note crm-warn">No recipients selected. Pick people in the People tab first.</div>}
            {verify && <div className="crm-note">{verify}</div>}
            {result && <div className="crm-note" role="status" style={{ display: 'flex', gap: 8 }}><CheckCircle2 size={16} style={{ flex: 'none', marginTop: 2 }} />{result}</div>}
            {error && <div className="crm-note crm-warn" role="alert">{error}</div>}
          </div>
        </div>

        <div className="crm-sheet-foot">
          {busy && <Loader2 size={18} className="animate-spin" style={{ alignSelf: 'center' }} />}
          {channel === 'push' && (
            <button className="crm-btn crm-btn-primary" disabled={!canSend || logged.has('push')} onClick={sendPush}><Send size={16} />Send in app to {gate.ok.length}</button>
          )}
          {channel === 'email' && (<>
            {emailBatches.map((b, i) => (
              <button key={i} className={`crm-btn ${i === 0 ? 'crm-btn-primary' : ''}`} disabled={!canSend} onClick={() => openMail(i)}>
                <Mail size={16} />{emailBatches.length > 1 ? `Open email app — batch ${i + 1} of ${emailBatches.length} (${b.length})` : `Open email app for ${b.length}`}
                {logged.has(`email-${i}`) && <CheckCircle2 size={14} />}
              </button>
            ))}
            {gate.ok.length > 1 && <button className="crm-btn" disabled={!gate.ok.length} onClick={copyEmails}><Copy size={16} />Copy addresses</button>}
            <span className="crm-muted crm-small" style={{ flexBasis: '100%' }}>
              Sends from your own email app{gate.ok.length > 1 ? ' as BCC, so merge fields use friendly fallbacks ("Hi there")' : ''}. For large opted-in lists with unsubscribe handling, use Email campaigns.
            </span>
          </>)}
          {channel === 'letter' && (<>
            <button className="crm-btn crm-btn-primary" disabled={!canSend} onClick={printLetters}><Printer size={16} />Print {gate.ok.length} letters</button>
            <button className="crm-btn" disabled={!gate.ok.length} onClick={printLabels}><Printer size={16} />Print envelope labels</button>
            <button className="crm-btn" disabled={!canSend} onClick={downloadHandoff}><Download size={16} />Mail vendor hand-off</button>
            <button className="crm-btn crm-btn-ghost" disabled={!gate.ok.length || busy} onClick={verifyAddresses}><MapPinned size={16} />Check addresses</button>
          </>)}
          {channel === 'postcard' && (<>
            <button className="crm-btn crm-btn-primary" disabled={!canSend} onClick={printPostcards}><Printer size={16} />Print {gate.ok.length} postcards</button>
            <button className="crm-btn" disabled={!canSend} onClick={downloadHandoff}><Download size={16} />Direct mail hand-off (CSV + job)</button>
            <button className="crm-btn crm-btn-ghost" disabled={!gate.ok.length || busy} onClick={verifyAddresses}><MapPinned size={16} />Check addresses</button>
          </>)}
        </div>
      </div>
    </div>
  );
};

const Preview: React.FC<{ channel: CorrespondenceChannel; subject: string; body: string; businessName: string; logoUrl?: string }> = ({ channel, subject, body, businessName, logoUrl }) => {
  if (channel === 'push') {
    return (
      <div className="crm-raised" style={{ padding: 12, display: 'flex', gap: 10, borderRadius: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--crm-accent)', overflow: 'hidden', flex: 'none' }}>
          {logoUrl && <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="crm-small crm-muted">{businessName} · now</div>
          <div style={{ fontWeight: 700 }}>{subject || businessName}</div>
          <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{body}</div>
        </div>
      </div>
    );
  }
  if (channel === 'postcard') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ aspectRatio: '3 / 2', borderRadius: 12, padding: 16, background: 'linear-gradient(135deg,#0E0C13 0%,#2A0A3A 55%,var(--crm-accent) 140%)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="crm-h" style={{ fontSize: 22, lineHeight: 1.1 }}>{subject || 'Front headline'}</div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{businessName}</div>
        </div>
        <div style={{ aspectRatio: '3 / 2', borderRadius: 12, padding: 14, background: '#FBFAF7', color: '#222', display: 'grid', gridTemplateColumns: '1fr 1px 40%', gap: 10, fontSize: 11, overflow: 'hidden' }}>
          <div style={{ whiteSpace: 'pre-wrap', overflow: 'hidden' }}>{body}</div>
          <div style={{ background: '#ccc' }} />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ alignSelf: 'flex-end', width: 34, height: 40, border: '1px dashed #999', fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Stamp</div>
            <div style={{ color: '#555' }}>Recipient address</div>
          </div>
        </div>
      </div>
    );
  }
  if (channel === 'letter') {
    return (
      <div style={{ background: '#FBFAF7', color: '#1a1a1a', borderRadius: 12, padding: 20, fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.55, maxHeight: 420, overflowY: 'auto' }}>
        <div style={{ borderBottom: '3px solid var(--crm-accent)', paddingBottom: 6, marginBottom: 14, fontFamily: "'Bricolage Grotesque', Inter, sans-serif", fontWeight: 700, fontSize: 16 }}>{businessName}</div>
        {subject && <div style={{ fontWeight: 700, marginBottom: 10, fontFamily: 'Inter, sans-serif' }}>{subject}</div>}
        <div style={{ whiteSpace: 'pre-wrap' }}>{body}</div>
      </div>
    );
  }
  return (
    <div className="crm-raised" style={{ borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--crm-line)' }}>
        <div className="crm-small crm-muted">From {businessName}</div>
        <div style={{ fontWeight: 700 }}>{subject || '(no subject)'}</div>
      </div>
      <div style={{ padding: 14, whiteSpace: 'pre-wrap', maxHeight: 380, overflowY: 'auto' }}>{body}</div>
    </div>
  );
};

export default CorrespondenceStudio;
