import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, Paperclip, PenLine, Send, Sparkles, X } from 'lucide-react';
import { Button, IconButton } from '../ui';
import {
  isValidEmail,
  parseRecipients,
  polishLetterText,
  sendLetter,
} from '../../services/postmanService';
import type { PostmanAccount, PostmanLetterSkin, PostmanMessageDetail } from '../../types';

/**
 * The composer sheet.
 *
 * Plain text on purpose, for now. The design calls for rich text, but the two
 * candidates were adding five TipTap packages or reusing Lorea's editor — and
 * Lorea's is the right answer, so this waits for the Desk room rather than
 * shipping a second editor the platform would then have to maintain. Text is
 * converted to simple HTML on send so the recipient's client renders paragraphs.
 */

interface LetterComposerProps {
  accounts: PostmanAccount[];
  /** Account to send from. Falls back to the first connected one. */
  defaultAccountId?: string;
  /** Present when replying — prefills recipient, subject and threading headers. */
  replyTo?: PostmanMessageDetail;
  skin: PostmanLetterSkin;
  onClose: () => void;
  onSent: () => void;
}

/** Paragraphs from blank lines, with everything escaped. Never interpolate raw. */
function textToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escape(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

const LetterComposer: React.FC<LetterComposerProps> = ({
  accounts,
  defaultAccountId,
  replyTo,
  skin,
  onClose,
  onSent,
}) => {
  const [accountId, setAccountId] = useState(
    defaultAccountId || replyTo?.accountId || accounts[0]?.id || '',
  );
  const [to, setTo] = useState(replyTo ? replyTo.from.email : '');
  const [subject, setSubject] = useState(
    replyTo ? (/^re:/i.test(replyTo.subject) ? replyTo.subject : `Re: ${replyTo.subject}`) : '',
  );
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Replying puts the cursor in the body; a new letter puts it in the To field,
  // because that is the field you cannot skip.
  useEffect(() => {
    if (replyTo) bodyRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void handleSend();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const recipients = useMemo(() => parseRecipients(to), [to]);
  const badRecipient = recipients.find((r) => !isValidEmail(r));
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const canSend = recipients.length > 0 && !badRecipient && subject.trim().length > 0 && !!accountId;

  const handlePolish = async () => {
    if (!body.trim() || polishing) return;
    setPolishing(true);
    setError(null);
    try {
      const polished = await polishLetterText(body);
      if (polished) setBody(polished);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not polish this letter.');
    } finally {
      setPolishing(false);
    }
  };

  const handleSend = async () => {
    if (!canSend || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendLetter({
        accountId,
        to: recipients,
        subject: subject.trim(),
        bodyText: body,
        bodyHtml: textToHtml(body),
        inReplyTo: replyTo?.id,
        threadId: replyTo?.threadId,
      });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The letter could not be sent.');
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={replyTo ? 'Reply' : 'New letter'}
    >
      <motion.div
        initial={{ scale: 0.96, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 24 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="pj-surface pj-surface--5 pj-surface--sheet w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        style={{ padding: 0 }}
      >
        {/* Head */}
        <div className="px-6 py-4 border-b border-theme flex items-center justify-between gap-4 shrink-0">
          <h2 className="type-title-md flex items-center gap-2.5">
            <PenLine size={17} className="text-brand-orange" />
            {replyTo ? 'Reply' : 'New letter'}
          </h2>
          <IconButton variant="ghost" size="sm" aria-label="Close composer" onClick={onClose}>
            <X />
          </IconButton>
        </div>

        {/* Fields */}
        <div className="shrink-0">
          <label className="flex items-center gap-4 px-6 py-3 border-b border-theme">
            <span className="pj-eyebrow w-16 shrink-0">From</span>
            {accounts.length > 1 ? (
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="bg-transparent text-sm flex-1 min-w-0 focus:outline-none"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id} className="bg-theme">
                    {a.email}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm truncate" style={{ color: 'var(--on-surface-variant)' }}>
                {accounts[0]?.email ?? 'No account connected'}
              </span>
            )}
          </label>

          <label className="flex items-center gap-4 px-6 py-3 border-b border-theme">
            <span className="pj-eyebrow w-16 shrink-0">To</span>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com"
              autoFocus={!replyTo}
              className="bg-transparent text-sm flex-1 min-w-0 focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-4 px-6 py-3 border-b border-theme">
            <span className="pj-eyebrow w-16 shrink-0">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is this about?"
              className="bg-transparent text-sm flex-1 min-w-0 focus:outline-none font-semibold"
            />
          </label>
        </div>

        {/* Tools */}
        <div className="px-6 pt-4 flex flex-wrap gap-2 shrink-0">
          <Button
            variant="ghost"
            size="xs"
            onClick={handlePolish}
            loading={polishing}
            disabled={!body.trim()}
            icon={<Sparkles />}
            className="!text-brand-lilac"
            title="Rewrite this letter more clearly"
          >
            Polish
          </Button>
          <Button variant="ghost" size="xs" icon={<Paperclip />} disabled title="Attachments are not built yet">
            Attach
          </Button>
        </div>

        {/* The page — tier two, carries the letter skin */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div className="pm-page border border-theme" data-letter-skin={skin} style={{ minHeight: 200 }}>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your letter…"
              className="w-full h-full min-h-[200px] bg-transparent resize-none focus:outline-none placeholder:opacity-40"
              style={{
                color: 'var(--pm-ink)',
                fontFamily: 'var(--pm-page-font)',
                fontSize: 'var(--pm-page-size)',
                lineHeight: 'var(--pm-page-lead)',
              }}
            />
          </div>
        </div>

        {/* Foot */}
        <div className="px-6 py-4 border-t border-theme shrink-0 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {error ? (
              <p role="alert" className="text-xs text-state-danger truncate">{error}</p>
            ) : badRecipient ? (
              <p role="alert" className="text-xs text-state-danger truncate">
                {badRecipient} is not an email address.
              </p>
            ) : (
              <p className="pj-eyebrow" style={{ opacity: 0.5 }}>
                {wordCount} {wordCount === 1 ? 'word' : 'words'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>
              Discard
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={handleSend}
              loading={sending}
              disabled={!canSend}
              icon={sending ? <Loader2 /> : <Send />}
            >
              Send
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default LetterComposer;
