import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, Check, Copy, Info, KeyRound, Loader2, Lock, Plus, Shield, ShieldCheck,
  Trash2, Unlock, X,
} from 'lucide-react';
import { Button, IconButton } from '../ui';
import DisclosurePanel from './DisclosurePanel';
import {
  deleteRecord, isUnlocked, listRecords, lock, onVaultState, saveRecord, setupVault,
  unlockVault, unlockVaultWithRecovery, vaultExists, WrongSecretError,
} from '../../services/sourceVaultService';
import { assessPassphrase, isCryptoAvailable } from '../../services/vaultCrypto';
import { markProtectedSurfaceOpen } from '../../services/protectedThreads';
import type { SourceContact, SourceRecord, SourceRecordInput } from '../../types';

/**
 * Sources — the encrypted vault, and the home of Source Mode inside The Post Man.
 *
 * The one place in Plajah where "we cannot read this" is literally true: the
 * passphrase never leaves the device and the server stores only ciphertext. The UI
 * is deliberately blunt about the parts that are NOT protected — see DisclosurePanel.
 */

type Phase = 'loading' | 'unavailable' | 'setup' | 'locked' | 'open';

const SourcesRoom: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [records, setRecords] = useState<SourceRecord[]>([]);
  const [editing, setEditing] = useState<SourceRecord | 'new' | null>(null);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshRecords = useCallback(async () => {
    try { setRecords(await listRecords()); } catch { /* locked mid-flight */ }
  }, []);

  useEffect(() => {
    if (!isCryptoAvailable()) { setPhase('unavailable'); return; }
    let alive = true;
    void (async () => {
      const exists = await vaultExists();
      if (!alive) return;
      if (!exists) setPhase('setup');
      else setPhase(isUnlocked() ? 'open' : 'locked');
    })();
    const unsub = onVaultState((s) => {
      if (!alive) return;
      if (s.exists === false) setPhase('setup');
      else setPhase(s.unlocked ? 'open' : 'locked');
    });
    return () => { alive = false; unsub(); };
  }, []);

  useEffect(() => { if (phase === 'open') void refreshRecords(); }, [phase, refreshRecords]);

  // While the vault is open, real identities are on screen — suspend the breadcrumb
  // trail so nothing about a source can survive into a later bug report.
  useEffect(() => {
    if (phase !== 'open') return;
    markProtectedSurfaceOpen(true);
    return () => markProtectedSurfaceOpen(false);
  }, [phase]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3800);
    return () => window.clearTimeout(t);
  }, [notice]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 sm:px-6 py-4 border-b border-theme flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Shield size={15} className="text-brand-orange shrink-0" />
          <span className="pj-eyebrow truncate">Sources — encrypted vault</span>
        </div>
        <div className="flex items-center gap-1.5">
          <IconButton variant="ghost" size="sm" aria-label="How Source Mode protects you"
                      onClick={() => setShowDisclosure(true)}>
            <Info />
          </IconButton>
          {phase === 'open' && (
            <IconButton variant="ghost" size="sm" aria-label="Lock the vault" onClick={() => lock()}>
              <Lock />
            </IconButton>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {phase === 'loading' && (
          <div className="h-full grid place-items-center"><Loader2 className="animate-spin" style={{ opacity: 0.4 }} /></div>
        )}
        {phase === 'unavailable' && <Unavailable />}
        {phase === 'setup' && <SetupFlow onDone={() => setNotice('Vault created.')} />}
        {phase === 'locked' && <UnlockFlow onUnlocked={() => setNotice('Vault unlocked.')} />}
        {phase === 'open' && (
          <RecordsList
            records={records}
            onAdd={() => setEditing('new')}
            onEdit={(r) => setEditing(r)}
            onDelete={async (id) => { await deleteRecord(id); await refreshRecords(); setNotice('Record deleted.'); }}
          />
        )}
      </div>

      <AnimatePresence>
        {editing && (
          <RecordEditor
            record={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={async () => { setEditing(null); await refreshRecords(); setNotice('Saved.'); }}
          />
        )}
        {showDisclosure && <DisclosurePanel onClose={() => setShowDisclosure(false)} />}
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            role="status"
            className="fixed bottom-6 right-6 z-[131] px-4 py-3 rounded-card border border-theme text-sm shadow-elev-4"
            style={{ background: 'var(--card-bg)', backdropFilter: 'var(--blur-lg)' }}
          >
            <span className="text-state-success">{notice}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ── Empty / unavailable ────────────────────────────────────────────────────── */

const Unavailable: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center text-center gap-4 p-10">
    <AlertTriangle size={40} strokeWidth={1.2} className="text-state-warning" style={{ opacity: 0.5 }} />
    <h2 className="type-title-lg">The vault needs a modern browser</h2>
    <p className="text-sm max-w-[42ch]" style={{ color: 'var(--on-surface-variant)' }}>
      This device does not provide the encryption the vault relies on. Open Plajah in an up-to-date browser
      or the Plajah app.
    </p>
  </div>
);

/* ── Setup ──────────────────────────────────────────────────────────────────── */

const SetupFlow: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  const assessment = assessPassphrase(pass);
  const strong = assessment.ok;
  const matches = pass === confirm && confirm.length > 0;

  const create = async () => {
    setError(null);
    if (!strong) return setError(assessment.reason || 'Please choose a stronger passphrase.');
    if (!matches) return setError('The two passphrases do not match.');
    setBusy(true);
    try {
      const { recoveryCode } = await setupVault(pass);
      setRecoveryCode(recoveryCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the vault.');
    } finally {
      setBusy(false);
    }
  };

  // Recovery-code screen — shown once, and the only time this value exists anywhere.
  if (recoveryCode) {
    return (
      <div className="max-w-lg mx-auto p-6 sm:p-8 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <KeyRound className="text-brand-orange" />
          <h2 className="type-title-lg">Save your recovery code</h2>
        </div>
        <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>
          This is the <b style={{ color: 'var(--text-primary)' }}>only</b> way back into your vault if you
          forget your passphrase. We do not store it and cannot show it again. Write it down somewhere safe
          and offline.
        </p>
        <div className="rounded-card border-2 p-4 font-mono text-center text-lg tracking-wide select-all"
             style={{ borderColor: 'var(--pj-orange)', background: 'var(--glass-1)', wordBreak: 'break-all' }}>
          {recoveryCode}
        </div>
        <Button variant="secondary" size="sm" icon={<Copy />}
                onClick={() => {
                  navigator.clipboard?.writeText(recoveryCode).catch(() => {});
                  // This code fully unlocks the vault — do not leave it sitting on the
                  // clipboard for other apps to read. Clear it after a minute.
                  setTimeout(() => { navigator.clipboard?.writeText('').catch(() => {}); }, 60_000);
                }}>
          Copy (clears in 60s)
        </Button>
        <label className="flex items-start gap-3 cursor-pointer mt-2">
          <input type="checkbox" checked={savedConfirmed} onChange={(e) => setSavedConfirmed(e.target.checked)}
                 className="w-5 h-5 mt-0.5 accent-[color:var(--pj-orange)]" />
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            I have saved this code. I understand it cannot be recovered if I lose both this and my passphrase.
          </span>
        </label>
        <Button variant="primary" size="lg" disabled={!savedConfirmed} icon={<Check />}
                onClick={onDone}>
          Open my vault
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6 sm:p-8 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <ShieldCheck className="text-brand-orange" />
        <h2 className="type-title-lg">Create your source vault</h2>
      </div>
      <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>
        A private store for the identities and contact details that must never leak — encrypted on your
        device with a passphrase Plajah never sees. Choose a passphrase you do not use anywhere else.
        <b style={{ color: 'var(--text-primary)' }}> There is no reset.</b>
      </p>

      <label className="flex flex-col gap-2">
        <span className="pj-eyebrow">Vault passphrase</span>
        <input type="password" className="pj-input" value={pass} autoComplete="new-password"
               onChange={(e) => setPass(e.target.value)} placeholder="A memorable phrase of a few words" />
        {pass.length > 0 && (
          <span className="text-[11.5px]" style={{ color: strong ? 'var(--pj-success)' : 'var(--pj-warning)' }}>
            {strong ? `Strength: ${assessment.strength}` : (assessment.reason || 'Keep going.')}
          </span>
        )}
      </label>
      <label className="flex flex-col gap-2">
        <span className="pj-eyebrow">Confirm passphrase</span>
        <input type="password" className="pj-input" value={confirm} autoComplete="new-password"
               onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" />
      </label>

      {error && <p role="alert" className="text-xs text-state-danger">{error}</p>}

      <Button variant="primary" size="lg" onClick={create} loading={busy}
              disabled={!strong || !matches} icon={<ShieldCheck />}>
        Create vault
      </Button>
    </div>
  );
};

/* ── Unlock ─────────────────────────────────────────────────────────────────── */

const UnlockFlow: React.FC<{ onUnlocked: () => void }> = ({ onUnlocked }) => {
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [mode]);

  const submit = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'passphrase') await unlockVault(value);
      else await unlockVaultWithRecovery(value);
      onUnlocked();
    } catch (e) {
      setError(e instanceof WrongSecretError
        ? (mode === 'passphrase' ? 'That passphrase is not correct.' : 'That recovery code is not correct.')
        : (e instanceof Error ? e.message : 'Could not unlock the vault.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 sm:p-8 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Lock className="text-brand-orange" />
        <h2 className="type-title-lg">Unlock your vault</h2>
      </div>

      <label className="flex flex-col gap-2">
        <span className="pj-eyebrow">{mode === 'passphrase' ? 'Passphrase' : 'Recovery code'}</span>
        <input
          ref={inputRef}
          type={mode === 'passphrase' ? 'password' : 'text'}
          className="pj-input"
          value={value}
          autoComplete={mode === 'passphrase' ? 'current-password' : 'off'}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          placeholder={mode === 'passphrase' ? 'Your vault passphrase' : 'XXXXX-XXXXX-XXXXX-…'}
        />
      </label>

      {error && <p role="alert" className="text-xs text-state-danger">{error}</p>}

      <Button variant="primary" size="lg" onClick={submit} loading={busy}
              disabled={!value.trim()} icon={<Unlock />}>
        Unlock
      </Button>

      <button type="button" onClick={() => { setMode(mode === 'passphrase' ? 'recovery' : 'passphrase'); setValue(''); setError(null); }}
              className="text-xs text-brand-orange font-bold self-center">
        {mode === 'passphrase' ? 'Use my recovery code instead' : 'Use my passphrase instead'}
      </button>
    </div>
  );
};

/* ── Records ────────────────────────────────────────────────────────────────── */

const RecordsList: React.FC<{
  records: SourceRecord[];
  onAdd: () => void;
  onEdit: (r: SourceRecord) => void;
  onDelete: (id: string) => void;
}> = ({ records, onAdd, onEdit, onDelete }) => (
  <div className="p-5 sm:p-6 flex flex-col gap-4 max-w-2xl mx-auto">
    <div className="flex items-center justify-between gap-4">
      <p className="pj-eyebrow">{records.length} {records.length === 1 ? 'source' : 'sources'}</p>
      <Button variant="accent" size="sm" icon={<Plus />} onClick={onAdd}>Add a source</Button>
    </div>

    {records.length === 0 ? (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Shield size={38} strokeWidth={1.2} style={{ opacity: 0.2 }} />
        <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>
          Nothing here yet. Add a source and their real details stay encrypted on your device.
        </p>
      </div>
    ) : (
      <div className="flex flex-col gap-2.5">
        {records.map((r) => (
          <div key={r.id}
               className="rounded-card border border-theme p-4 flex items-start justify-between gap-4"
               style={{ background: 'var(--glass-1)' }}>
            <button type="button" onClick={() => !r.corrupt && onEdit(r)} className="text-left min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="pm-subject text-lg truncate" style={{ color: r.corrupt ? 'var(--pj-danger)' : undefined }}>
                  {r.codename || 'Untitled'}
                </span>
              </div>
              {!r.corrupt && (
                <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>
                  {r.contacts.length} {r.contacts.length === 1 ? 'contact' : 'contacts'}
                  {r.realName ? ' · real name saved' : ''}
                </p>
              )}
            </button>
            <IconButton variant="danger-quiet" size="sm" aria-label={`Delete ${r.codename}`}
                        onClick={() => onDelete(r.id)}>
              <Trash2 />
            </IconButton>
          </div>
        ))}
      </div>
    )}
  </div>
);

/* ── Record editor ──────────────────────────────────────────────────────────── */

const CONTACT_KINDS: SourceContact['kind'][] = ['signal', 'phone', 'email', 'proton', 'other'];

const RecordEditor: React.FC<{
  record: SourceRecord | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ record, onClose, onSaved }) => {
  const [codename, setCodename] = useState(record?.codename ?? '');
  const [realName, setRealName] = useState(record?.realName ?? '');
  const [contacts, setContacts] = useState<SourceContact[]>(record?.contacts ?? []);
  const [agreedTerms, setAgreedTerms] = useState(record?.agreedTerms ?? '');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addContact = () => setContacts((c) => [...c, { kind: 'signal', value: '' }]);
  const updateContact = (i: number, patch: Partial<SourceContact>) =>
    setContacts((c) => c.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeContact = (i: number) => setContacts((c) => c.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!codename.trim()) return setError('A codename is required — it is the only name used in conversation.');
    setBusy(true);
    setError(null);
    try {
      const input: SourceRecordInput = {
        codename: codename.trim(),
        realName: realName.trim() || undefined,
        contacts: contacts.filter((c) => c.value.trim()),
        agreedTerms: agreedTerms.trim() || undefined,
        notes: notes.trim() || undefined,
        linkedThreadIds: record?.linkedThreadIds ?? [],
      };
      await saveRecord(input, record?.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[130] grid place-items-center p-4 sm:p-6 bg-black/70 backdrop-blur-md"
      role="dialog" aria-modal="true" aria-label={record ? 'Edit source' : 'Add source'}
    >
      <motion.div
        initial={{ scale: 0.96, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 20 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="pj-surface pj-surface--5 pj-surface--sheet w-full max-w-xl max-h-[90vh] overflow-y-auto"
        style={{ padding: 0 }}
      >
        <div className="px-6 py-4 border-b border-theme flex items-center justify-between sticky top-0 z-10"
             style={{ background: 'var(--card-bg)', backdropFilter: 'var(--blur-lg)' }}>
          <h2 className="type-title-md">{record ? 'Edit source' : 'Add a source'}</h2>
          <IconButton variant="ghost" size="sm" aria-label="Close" onClick={onClose}><X /></IconButton>
        </div>

        <div className="px-6 py-6 flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="pj-eyebrow">Codename</span>
            <input className="pj-input" value={codename} onChange={(e) => setCodename(e.target.value)}
                   placeholder="The name you use in conversation" />
          </label>

          <label className="flex flex-col gap-2">
            <span className="pj-eyebrow">Real name — encrypted, never leaves the vault</span>
            <input className="pj-input" value={realName} onChange={(e) => setRealName(e.target.value)}
                   placeholder="Optional" />
          </label>

          <div className="flex flex-col gap-2">
            <span className="pj-eyebrow">Contacts</span>
            {contacts.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <select value={c.kind} onChange={(e) => updateContact(i, { kind: e.target.value as SourceContact['kind'] })}
                        className="pj-input shrink-0" style={{ width: 110 }}>
                  {CONTACT_KINDS.map((k) => <option key={k} value={k} className="bg-theme">{k}</option>)}
                </select>
                <input className="pj-input flex-1" value={c.value} placeholder="Number, handle or address"
                       onChange={(e) => updateContact(i, { value: e.target.value })} />
                <IconButton variant="ghost" size="sm" aria-label="Remove contact" onClick={() => removeContact(i)}>
                  <X />
                </IconButton>
              </div>
            ))}
            <Button variant="ghost" size="xs" icon={<Plus />} onClick={addContact} className="self-start">
              Add contact
            </Button>
          </div>

          <label className="flex flex-col gap-2">
            <span className="pj-eyebrow">What was agreed</span>
            <textarea className="pj-input" rows={2} value={agreedTerms} style={{ resize: 'vertical' }}
                      onChange={(e) => setAgreedTerms(e.target.value)}
                      placeholder="On/off record, embargo, anonymity terms…" />
          </label>

          <label className="flex flex-col gap-2">
            <span className="pj-eyebrow">Notes</span>
            <textarea className="pj-input" rows={3} value={notes} style={{ resize: 'vertical' }}
                      onChange={(e) => setNotes(e.target.value)} placeholder="Anything else, encrypted" />
          </label>

          {error && <p role="alert" className="text-xs text-state-danger">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-theme flex justify-end gap-2.5 sticky bottom-0"
             style={{ background: 'var(--card-bg)', backdropFilter: 'var(--blur-lg)' }}>
          <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" onClick={save} loading={busy} icon={<ShieldCheck />}>Save</Button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SourcesRoom;
