import React, { useEffect, useState } from 'react';
import { EyeOff, Lock, LockOpen, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { Button, Chip, Input, Surface, Textarea } from '../ui';
import { newLogEntry, newSource } from '../../services/journalist/newsroomStore';
import { open, passphraseProblem, seal, type SourceSecrets } from '../../services/journalist/vaultCrypto';
import type { SourceAttribution, SourceContact, SourceLogEntry } from '../../services/journalist/types';
import { useNewsroomList } from './useNewsroom';

const ATTR: Record<SourceAttribution, { label: string; hint: string; color: string }> = {
  ON_RECORD: { label: 'On the record', hint: 'May be quoted and named.', color: '#06D6A0' },
  BACKGROUND: { label: 'Background', hint: 'Usable, not by name ("a person familiar").', color: '#00DAF3' },
  DEEP_BACKGROUND: { label: 'Deep background', hint: 'For understanding only. No quote, no attribution.', color: '#FF8C00' },
  OFF_RECORD: { label: 'Off the record', hint: 'Never quoted or used as a lead.', color: '#FF5C6C' },
};

export const SourceManager: React.FC = () => {
  const { items, error, save, remove } = useNewsroomList<SourceContact>('newsroom_sources');
  const log = useNewsroomList<SourceLogEntry>('newsroom_source_log');
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string>('');
  const sel = items.find(i => i.id === selected);
  const [pass, setPass] = useState('');
  const [secrets, setSecrets] = useState<SourceSecrets | null>(null);   // decrypted, in memory only
  const [msg, setMsg] = useState('');
  const [entry, setEntry] = useState('');
  const [entryStory, setEntryStory] = useState('');

  useEffect(() => { setSecrets(null); setPass(''); setMsg(''); }, [selected]);

  const add = () => { if (name.trim()) { void save(newSource(name.trim())); setName(''); } };

  const sealNow = async () => {
    if (!sel) return;
    const bad = passphraseProblem(pass); if (bad) { setMsg(bad); return; }
    try {
      const data: SourceSecrets = secrets || { contact: sel.contact, notes: sel.notes };
      const vault = await seal(data, pass);
      await save({ ...sel, vault, contact: undefined, notes: undefined, confidential: true });
      setSecrets(null); setPass(''); setMsg('Sealed. The contact details and notes are now ciphertext in the database; Plajah cannot read or recover them.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not seal.'); }
  };
  const unseal = async () => {
    if (!sel?.vault) return;
    try { setSecrets(await open<SourceSecrets>(sel.vault, pass)); setMsg('Unlocked in memory for this session only.'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not unlock.'); }
  };
  const lockAgain = () => { setSecrets(null); setPass(''); setMsg('Locked.'); };

  const entries = log.items.filter(l => l.sourceId === selected).sort((a, b) => b.at - a.at);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
      <div className="flex flex-col gap-3">
        <Surface level={2} className="flex gap-2 items-end">
          <Input label="New source" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} className="flex-1" />
          <Button variant="primary" iconOnly aria-label="Add source" icon={<Plus />} onClick={add} disabled={!name.trim()} />
        </Surface>
        {error && <p role="alert" className="text-sm" style={{ color: 'var(--pj-danger)' }}>{error}</p>}
        <ul className="flex flex-col gap-2">
          {items.sort((a, b) => a.name.localeCompare(b.name)).map(s => (
            <li key={s.id}>
              <button type="button" onClick={() => setSelected(s.id)} className="w-full text-left" aria-pressed={selected === s.id}>
                <Surface level={selected === s.id ? 3 : 1} className="flex items-center gap-2 !p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{s.confidential ? <span className="inline-flex items-center gap-1"><EyeOff size={13} />{s.name}</span> : s.name}</p>
                    <p className="text-[11px] truncate" style={{ color: ATTR[s.attribution].color }}>{ATTR[s.attribution].label}{s.vault ? ' · sealed' : ''}</p>
                  </div>
                </Surface>
              </button>
            </li>
          ))}
          {items.length === 0 && <p className="text-sm opacity-60">No sources yet.</p>}
        </ul>
      </div>

      {sel ? (
        <Surface level={1} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <Input label="Name or alias" value={sel.name} onChange={e => void save({ ...sel, name: e.target.value })} className="flex-1 min-w-[200px]" />
            <Input label="Role / affiliation" value={sel.role || ''} onChange={e => void save({ ...sel, role: e.target.value })} className="flex-1 min-w-[200px]" />
          </div>
          <div className="flex flex-col gap-2">
            <p className="pj-eyebrow">Ground rules agreed</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ATTR) as SourceAttribution[]).map(a => (
                <Chip key={a} interactive selected={sel.attribution === a} title={ATTR[a].hint} onClick={() => void save({ ...sel, attribution: a })}>{ATTR[a].label}</Chip>
              ))}
            </div>
            <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{ATTR[sel.attribution].hint}</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.confidential} onChange={e => void save({ ...sel, confidential: e.target.checked })} /> Confidential source: hide the name in lists and exports</label>
          </div>

          <div className="flex flex-col gap-2">
            <p className="pj-eyebrow flex items-center gap-1">{sel.vault ? <Lock size={12} /> : <LockOpen size={12} />} Contact details and notes</p>
            {!sel.vault && (
              <>
                <p className="text-xs flex gap-2 items-start rounded-xl p-2" style={{ background: 'rgba(255,140,0,.08)', color: '#FF8C00' }}>
                  <ShieldAlert size={14} className="shrink-0 mt-0.5" />Not encrypted. Details below are stored as plain text in your Plajah account. Seal them with a passphrase to encrypt them on this device before they are saved.
                </p>
                <Input label="Contact (phone, handle, email)" value={sel.contact || ''} onChange={e => void save({ ...sel, contact: e.target.value })} />
                <Textarea label="Notes" rows={3} value={sel.notes || ''} onChange={e => void save({ ...sel, notes: e.target.value })} />
              </>
            )}
            {sel.vault && !secrets && <p className="text-sm">Sealed with AES-256-GCM (key from your passphrase, PBKDF2). Enter the passphrase to read it.</p>}
            {sel.vault && secrets && (
              <>
                <Input label="Contact" value={secrets.contact || ''} onChange={e => setSecrets({ ...secrets, contact: e.target.value })} />
                <Textarea label="Notes" rows={3} value={secrets.notes || ''} onChange={e => setSecrets({ ...secrets, notes: e.target.value })} />
              </>
            )}
            <Input label={sel.vault ? 'Passphrase' : 'Choose a passphrase (12+ characters)'} type="password" autoComplete="off" value={pass} onChange={e => setPass(e.target.value)} />
            <div className="pj-actions">
              {!sel.vault && <Button variant="primary" icon={<Lock />} onClick={sealNow} disabled={!pass}>Encrypt and save</Button>}
              {sel.vault && !secrets && <Button variant="primary" icon={<LockOpen />} onClick={unseal} disabled={!pass}>Unlock</Button>}
              {sel.vault && secrets && <>
                <Button variant="primary" icon={<Lock />} onClick={sealNow} disabled={!pass}>Re-seal with changes</Button>
                <Button variant="outline" onClick={lockAgain}>Lock</Button>
              </>}
            </div>
            {msg && <p role="status" className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{msg}</p>}
            <details className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
              <summary className="cursor-pointer">What sealing does and does not protect</summary>
              <ul className="list-disc pl-5 mt-1 flex flex-col gap-1">
                <li>Protects: a database leak or a curious admin sees ciphertext, not contact details or notes.</li>
                <li>Does not protect: a weak passphrase, a compromised device or browser extension, or anything outside the sealed fields. The source's name, role, ground rules and the log below are NOT sealed.</li>
                <li>No recovery: if you lose the passphrase, the sealed data is gone. Plajah cannot reset it.</li>
                <li>Not independently audited. For a serious threat model use Signal, SecureDrop or an encrypted local vault.</li>
              </ul>
            </details>
          </div>

          <div className="flex flex-col gap-2">
            <p className="pj-eyebrow">Contact log for this source</p>
            <div className="flex flex-wrap gap-2 items-end">
              <Input label="What happened" value={entry} onChange={e => setEntry(e.target.value)} className="flex-1 min-w-[200px]" />
              <Input label="Story slug (optional)" value={entryStory} onChange={e => setEntryStory(e.target.value)} className="w-44" />
              <Button variant="secondary" disabled={!entry.trim()} onClick={() => { void log.save(newLogEntry(sel.id, { summary: entry.trim(), storyId: entryStory.trim() || undefined, attribution: sel.attribution })); setEntry(''); setEntryStory(''); }}>Log it</Button>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {entries.map(l => (
                <li key={l.id} className="flex gap-2"><span className="text-[11px] opacity-60 shrink-0 w-28">{new Date(l.at).toLocaleDateString()} · {l.kind.toLowerCase()}</span><span className="flex-1">{l.summary}{l.storyId ? <em className="opacity-60"> ({l.storyId})</em> : null}</span><span className="text-[11px]" style={{ color: ATTR[l.attribution].color }}>{ATTR[l.attribution].label}</span></li>
              ))}
              {entries.length === 0 && <li className="opacity-60 text-xs">No contacts logged.</li>}
            </ul>
          </div>

          <div><Button variant="danger-quiet" icon={<Trash2 />} onClick={() => { if (window.confirm(`Delete ${sel.name}? This cannot be undone.`)) { void remove(sel.id); setSelected(''); } }}>Delete source</Button></div>
        </Surface>
      ) : <Surface level={1}><p className="text-sm opacity-70">Choose or add a source. Ground rules (on the record, background, off the record) are enforced by the quote extractor and the publish gate.</p></Surface>}
    </div>
  );
};

export default SourceManager;
