import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, Check, Loader2, Mail, Megaphone, Send, ShieldCheck, Users, X,
} from 'lucide-react';
import { Button, IconButton } from '../ui';
import {
  CampaignError, draftToHtml, formatSentAt, getAudience, getCampaignStatus, getSender,
  listCampaigns, listSuppression, saveSender, sendCampaign, sendTest, subjectWarnings,
} from '../../services/campaignService';
import type {
  Campaign, CampaignAudience, CampaignSender, CampaignSuppression,
} from '../../types';

/**
 * Campaigns — the business side of The Post Man.
 *
 * The compliance requirements are deliberately visible rather than buried: the
 * postal address is a labelled legal requirement, the unsubscribe footer is
 * previewed rather than described, and the suppression list is a first-class tab.
 * Senders who understand why the rules exist break them far less often, and the
 * server refuses regardless — see routes/campaigns.ts.
 */

type Tab = 'COMPOSE' | 'AUDIENCE' | 'HISTORY' | 'SENDER';

const CampaignsRoom: React.FC<{ userEmail?: string }> = ({ userEmail }) => {
  const [tab, setTab] = useState<Tab>('COMPOSE');
  const [configured, setConfigured] = useState(true);
  const [sender, setSender] = useState<CampaignSender | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [audience, setAudience] = useState<CampaignAudience | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [suppression, setSuppression] = useState<CampaignSuppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const ready = missing.length === 0 && !!sender;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const status = await getCampaignStatus();
      setConfigured(status.configured);
      const [s, a] = await Promise.all([getSender(), getAudience().catch(() => null)]);
      setSender(s.sender);
      setMissing(s.missing ?? []);
      if (a) setAudience(a);
    } catch (err) {
      if (err instanceof CampaignError && err.code === 'UNCONFIGURED') setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (tab === 'HISTORY') listCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
    if (tab === 'AUDIENCE') listSuppression().then(setSuppression).catch(() => setSuppression([]));
  }, [tab]);

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center">
        <Loader2 size={26} className="animate-spin" style={{ opacity: 0.4 }} />
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-10">
        <AlertTriangle size={42} strokeWidth={1.2} className="text-state-warning" style={{ opacity: 0.5 }} />
        <h2 className="type-title-lg">Campaign sending is not configured</h2>
        <p className="text-sm max-w-[46ch]" style={{ color: 'var(--on-surface-variant)' }}>
          An administrator needs to set <code>RESEND_API_KEY</code> on the server before campaigns can go out.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 sm:px-6 pt-4 flex flex-wrap items-center gap-1.5 border-b border-theme shrink-0">
        {([
          ['COMPOSE', 'Compose'], ['AUDIENCE', 'Audience'], ['HISTORY', 'Sent'], ['SENDER', 'Sender details'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className="h-[34px] px-3.5 rounded-full text-[11px] font-bold uppercase tracking-[0.06em] transition-colors tap mb-3 inline-flex items-center gap-2"
            style={{
              background: tab === id ? 'var(--glass-3)' : 'transparent',
              color: tab === id ? 'var(--text-primary)' : 'var(--on-surface-variant)',
              border: `1px solid ${tab === id ? 'var(--border-color)' : 'transparent'}`,
            }}
          >
            {label}
            {id === 'SENDER' && !ready && (
              <span className="w-1.5 h-1.5 rounded-full bg-state-warning" aria-label="incomplete" />
            )}
          </button>
        ))}
      </div>

      {!ready && tab !== 'SENDER' && (
        <button
          type="button"
          onClick={() => setTab('SENDER')}
          className="shrink-0 mx-5 sm:mx-6 mt-4 p-3.5 rounded-card border text-left flex items-start gap-3"
          style={{ background: 'var(--pj-warning-soft)', borderColor: 'var(--border-color)' }}
        >
          <AlertTriangle size={16} className="text-state-warning shrink-0 mt-0.5" />
          <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
            <b>You cannot send yet.</b> {missing.join('. ')}. Tap to complete your sender details.
          </span>
        </button>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5">
        {tab === 'COMPOSE' && (
          <Composer
            ready={ready}
            sender={sender}
            audience={audience}
            userEmail={userEmail}
            onNotice={setNotice}
            onSent={() => { void refresh(); setTab('HISTORY'); }}
          />
        )}
        {tab === 'AUDIENCE' && <AudienceTab audience={audience} suppression={suppression} />}
        {tab === 'HISTORY' && <HistoryTab campaigns={campaigns} />}
        {tab === 'SENDER' && (
          <SenderTab
            sender={sender}
            missing={missing}
            onSaved={(s, m) => { setSender(s); setMissing(m); setNotice({ kind: 'ok', text: 'Sender details saved.' }); }}
            onError={(t) => setNotice({ kind: 'error', text: t })}
          />
        )}
      </div>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className="fixed bottom-6 right-6 z-[130] px-4 py-3 rounded-card border border-theme text-sm shadow-elev-4"
            style={{ background: 'var(--card-bg)', backdropFilter: 'var(--blur-lg)' }}
          >
            <span className={notice.kind === 'error' ? 'text-state-danger' : 'text-state-success'}>{notice.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ── Compose ──────────────────────────────────────────────────────────────── */

const Composer: React.FC<{
  ready: boolean;
  sender: CampaignSender | null;
  audience: CampaignAudience | null;
  userEmail?: string;
  onNotice: (n: { kind: 'ok' | 'error'; text: string }) => void;
  onSent: () => void;
}> = ({ ready, sender, audience, userEmail, onNotice, onSent }) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const warnings = useMemo(() => subjectWarnings(subject), [subject]);
  const canSend = ready && subject.trim().length > 0 && body.trim().length > 0 && (audience?.deliverable ?? 0) > 0;

  const doSend = async () => {
    setConfirming(false);
    setSending(true);
    try {
      const { sent, failed } = await sendCampaign(subject.trim(), draftToHtml(body));
      onNotice({
        kind: failed > 0 ? 'error' : 'ok',
        text: failed > 0 ? `Sent to ${sent}. ${failed} could not be delivered.` : `Sent to ${sent} people.`,
      });
      setSubject(''); setBody('');
      onSent();
    } catch (err) {
      onNotice({ kind: 'error', text: err instanceof Error ? err.message : 'The campaign could not be sent.' });
    } finally {
      setSending(false);
    }
  };

  const doTest = async () => {
    if (!userEmail) return onNotice({ kind: 'error', text: 'No address to send a test to.' });
    setTesting(true);
    try {
      await sendTest(subject.trim() || '(no subject)', draftToHtml(body), userEmail);
      onNotice({ kind: 'ok', text: `Test sent to ${userEmail}.` });
    } catch (err) {
      onNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not send the test.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <span className="pj-eyebrow">Sending to</span>
        <span className="inline-flex items-center gap-2 px-3 h-[28px] rounded-full border border-theme text-xs"
              style={{ background: 'var(--glass-2)' }}>
          <Users size={12} className="text-brand-orange" />
          <b>{audience?.deliverable ?? 0}</b> subscribers
        </span>
        {(audience?.suppressed ?? 0) > 0 && (
          <span className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>
            {audience?.suppressed} excluded — unsubscribed or undeliverable
          </span>
        )}
      </div>

      <label className="flex flex-col gap-2">
        <span className="pj-eyebrow">Subject</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What is this about?"
          className="pj-input"
        />
      </label>

      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1.5 -mt-2">
          {warnings.map((w) => (
            <li key={w} className="text-[11.5px] flex items-start gap-2" style={{ color: 'var(--on-surface-variant)' }}>
              <AlertTriangle size={12} className="text-state-warning shrink-0 mt-0.5" />
              {w}
            </li>
          ))}
        </ul>
      )}

      <label className="flex flex-col gap-2">
        <span className="pj-eyebrow">Message</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          placeholder="Write to your audience…"
          className="pj-input"
          style={{ resize: 'vertical', minHeight: 220, lineHeight: 1.7 }}
        />
      </label>

      {/* The footer is previewed, not described. Senders who can see what gets
          appended stop trying to write their own unsubscribe line. */}
      <div className="rounded-card border border-theme p-4" style={{ background: 'var(--glass-1)' }}>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={13} className="text-state-success" />
          <span className="pj-eyebrow">Added to every message automatically</span>
        </div>
        <div className="text-[11.5px] leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
          <p>You are receiving this because you subscribed to this sender on Plajah.</p>
          <p className="mt-2">
            {sender?.fromName || 'Your sender name'}<br />
            {(sender?.postalAddress || 'Your postal address').split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}
          </p>
          <p className="mt-2"><u>Unsubscribe</u> — one click, honoured immediately.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <Button
          variant="primary" size="md" icon={<Send />}
          disabled={!canSend || sending} loading={sending}
          onClick={() => setConfirming(true)}
        >
          Send to {audience?.deliverable ?? 0}
        </Button>
        <Button
          variant="secondary" size="md" icon={<Mail />}
          disabled={!body.trim() || testing} loading={testing}
          onClick={doTest}
        >
          Send a test to myself
        </Button>
      </div>

      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[128] grid place-items-center p-5 bg-black/70 backdrop-blur-md"
            onClick={() => setConfirming(false)}
            role="dialog" aria-modal="true" aria-label="Confirm send"
          >
            <motion.div
              initial={{ scale: 0.96, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="pj-surface pj-surface--5 pj-surface--sheet w-full max-w-md flex flex-col gap-4"
            >
              <h3 className="type-title-md">Send to {audience?.deliverable} people?</h3>
              <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>
                This goes out immediately and cannot be recalled. Anyone who unsubscribes is excluded from
                every future campaign automatically.
              </p>
              <div className="pj-actions">
                <Button variant="ghost" size="md" onClick={() => setConfirming(false)}>Cancel</Button>
                <Button variant="primary" size="md" icon={<Send />} onClick={doSend}>Send now</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ── Audience ─────────────────────────────────────────────────────────────── */

const AudienceTab: React.FC<{ audience: CampaignAudience | null; suppression: CampaignSuppression[] }> = ({
  audience, suppression,
}) => (
  <div className="flex flex-col gap-6 max-w-3xl">
    <div className="grid grid-cols-3 gap-3">
      {[
        ['On your list', audience?.total ?? 0, undefined],
        ['Can receive', audience?.deliverable ?? 0, 'var(--pj-success)'],
        ['Excluded', audience?.suppressed ?? 0, 'var(--on-surface-variant)'],
      ].map(([label, value, color]) => (
        <div key={String(label)} className="rounded-card border border-theme p-4" style={{ background: 'var(--glass-1)' }}>
          <div className="pj-eyebrow mb-1.5">{label}</div>
          <div className="type-headline-sm tabular-nums" style={color ? { color: color as string } : undefined}>{value}</div>
        </div>
      ))}
    </div>

    <div>
      <h3 className="type-title-md mb-1.5">Excluded addresses</h3>
      <p className="text-sm mb-4" style={{ color: 'var(--on-surface-variant)' }}>
        People who unsubscribed, whose address bounced, or who marked a message as spam. They are removed
        permanently and automatically — this list is not editable, by design.
      </p>
      {suppression.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--on-surface-variant)', opacity: 0.7 }}>Nobody yet.</p>
      ) : (
        <div className="rounded-card border border-theme overflow-hidden">
          {suppression.map((s) => (
            <div key={s.email} className="flex items-center justify-between gap-4 px-4 py-3 border-b border-theme last:border-b-0">
              <span className="text-sm truncate">{s.email}</span>
              <span className="pj-eyebrow shrink-0" style={{ opacity: 0.7 }}>{s.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

/* ── History ──────────────────────────────────────────────────────────────── */

const HistoryTab: React.FC<{ campaigns: Campaign[] }> = ({ campaigns }) => (
  <div className="max-w-3xl">
    {campaigns.length === 0 ? (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Megaphone size={36} strokeWidth={1.2} style={{ opacity: 0.2 }} />
        <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>No campaigns sent yet.</p>
      </div>
    ) : (
      <div className="rounded-card border border-theme overflow-hidden">
        {campaigns.map((c) => (
          <div key={c.id} className="px-4 py-3.5 border-b border-theme last:border-b-0 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{c.subject}</p>
              <p className="pj-eyebrow" style={{ opacity: 0.65 }}>{formatSentAt(c.sentAt)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm tabular-nums">{c.recipientCount}</p>
              {c.failedCount > 0 && <p className="text-[10px] text-state-danger tabular-nums">{c.failedCount} failed</p>}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

/* ── Sender details ───────────────────────────────────────────────────────── */

const SenderTab: React.FC<{
  sender: CampaignSender | null;
  missing: string[];
  onSaved: (s: CampaignSender, missing: string[]) => void;
  onError: (t: string) => void;
}> = ({ sender, missing, onSaved, onError }) => {
  const [fromName, setFromName] = useState(sender?.fromName ?? '');
  const [replyTo, setReplyTo] = useState(sender?.replyTo ?? '');
  const [postalAddress, setPostalAddress] = useState(sender?.postalAddress ?? '');
  const [listDescription, setListDescription] = useState(sender?.listDescription ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await saveSender({ fromName, replyTo, postalAddress, listDescription });
      onSaved(res.sender, res.missing ?? []);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save your details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      {missing.length > 0 && (
        <div className="rounded-card border border-theme p-4 flex items-start gap-3" style={{ background: 'var(--pj-warning-soft)' }}>
          <AlertTriangle size={16} className="text-state-warning shrink-0 mt-0.5" />
          <div className="text-xs">
            <b>Still needed before you can send:</b>
            <ul className="mt-1.5 list-disc pl-4 flex flex-col gap-1">
              {missing.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </div>
        </div>
      )}

      <label className="flex flex-col gap-2">
        <span className="pj-eyebrow">Sender name</span>
        <input className="pj-input" value={fromName} onChange={(e) => setFromName(e.target.value)}
               placeholder="The name people will see in their inbox" />
      </label>

      <label className="flex flex-col gap-2">
        <span className="pj-eyebrow">Reply-to address</span>
        <input className="pj-input" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)}
               placeholder="Where replies should go" />
      </label>

      <label className="flex flex-col gap-2">
        <span className="pj-eyebrow">Postal address — required by law</span>
        <textarea className="pj-input" rows={3} value={postalAddress} onChange={(e) => setPostalAddress(e.target.value)}
                  placeholder={'Street\nCity, Region, Postcode\nCountry'} style={{ resize: 'vertical' }} />
        <span className="text-[11.5px]" style={{ color: 'var(--on-surface-variant)' }}>
          Every marketing email must carry a real physical address where you can be reached. A registered
          office or a PO box is fine; an address that does not exist is not. This appears at the foot of
          each message.
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="pj-eyebrow">What people signed up for</span>
        <input className="pj-input" value={listDescription} onChange={(e) => setListDescription(e.target.value)}
               placeholder="e.g. tour dates and new releases" />
      </label>

      <div className="pt-1">
        <Button variant="primary" size="md" onClick={save} loading={saving}
                icon={missing.length === 0 ? <Check /> : undefined}>
          Save sender details
        </Button>
      </div>
    </div>
  );
};

export default CampaignsRoom;
