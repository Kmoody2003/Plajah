// ─── Rights & Identifiers ─────────────────────────────────────────────────────
// The opt-in professional layer: the free identity a work gets from Plajah (ARK +
// content hash + Creator Passport), the industry identifiers the owner already holds,
// and the credit/split sheet behind them.
//
// Deliberately generic — Lorea books, Chora releases and Taleo films all mount this same
// panel and only the offered identifier schemes differ (services/registry/registryService
// SUBJECT_PROFILE). Nothing here mints an ISBN, ISRC or UPC: those are retail routing keys
// and only their issuing authority can create one.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ShieldCheck, Fingerprint, Hash, Copy, Check, ExternalLink, Users,
  AlertTriangle, Loader2, Trash2, Info, BookOpen,
} from 'lucide-react';
import {
  ensureRegistryRecord, loadRegistryRecord, isRegistryEnabled, setRegistryOptIn,
  setIdentifier, removeIdentifier, findIdentifier, setContentHash, setContributors,
  shareTotal, schemesFor,
  type RegistryRecord, type RegistrySubject, type RegistryLayer,
} from '../../services/registry/registryService';
import { arkAvailable, arkResolverUrl } from '../../services/registry/ark';
import { validateId, formatId } from '../../services/registry/identifiers';
import type { IdScheme, WorkContributor } from '../../services/registry/types';
import { passportIdFor } from '../../services/creatorPassport';
import { auth } from '../../services/firebase';

// Labels and the one-line explanation each scheme needs, so nobody has to know what an ISWC is.
const SCHEME_META: Partial<Record<IdScheme, { label: string; hint: string; placeholder: string }>> = {
  ISBN13:     { label: 'ISBN-13',        hint: 'One per edition and format. Paste the one you own — Plajah cannot issue these.', placeholder: '978-0-306-40615-7' },
  ISBN10:     { label: 'ISBN-10',        hint: 'Legacy form. Converted to ISBN-13 for export.', placeholder: '0-306-40615-2' },
  ISSN:       { label: 'ISSN',           hint: 'For a serialised run rather than a single volume.', placeholder: '2049-3630' },
  ASIN:       { label: 'ASIN',           hint: "Amazon's own id. A Kindle ebook has one of these and needs no ISBN at all.", placeholder: 'B0XXXXXXXX' },
  OLID:       { label: 'Open Library ID', hint: 'Free, open catalogue record — a discoverable listing without an ISBN.', placeholder: 'OL12345M' },
  DOI:        { label: 'DOI',            hint: 'Academic and chapter-level citation.', placeholder: '10.1000/xyz123' },
  ISTC:       { label: 'ISTC',           hint: 'The textual work behind every edition. Rarely used in practice.', placeholder: '0A9-2002-12B4A105-7' },
  ISRC:       { label: 'ISRC',           hint: 'One per recording. Your distributor usually assigns this free.', placeholder: 'US-RC1-76-07839' },
  ISWC:       { label: 'ISWC',           hint: 'One per composition. Your PRO allocates it when you register the work.', placeholder: 'T-034.524.680-1' },
  GTIN:       { label: 'UPC / EAN',      hint: 'The retail barcode for a release. Issued from a GS1 company prefix.', placeholder: '4006381333931' },
  GRID:       { label: 'GRid',           hint: 'Digital release identifier used by some DSPs.', placeholder: 'A1-2425G-ABC1234002-M' },
  CATALOG_NO: { label: 'Catalogue no.',  hint: "Your own label sequence. No authority issues it — it's yours.", placeholder: 'PLJ-0042' },
  EIDR:       { label: 'EIDR',           hint: 'Required by Amazon and most retail pipelines. Studio-supplied.', placeholder: '10.5240/7791-8534-2C23-9030-8610-5' },
  ISAN:       { label: 'ISAN',           hint: 'The ISO audiovisual work identifier.', placeholder: '0000-0000-3A8D-0000-Z' },
  IMDB:       { label: 'IMDb ID',        hint: 'De-facto industry key.', placeholder: 'tt0111161' },
  TMDB:       { label: 'TMDB ID',        hint: 'Open movie database key.', placeholder: '278' },
};

const LAYER_META: Record<RegistryLayer, { label: string; blurb: string }> = {
  work:          { label: 'Work',          blurb: 'The creation itself — survives every edition, cut and re-recording.' },
  manifestation: { label: 'Edition',       blurb: 'This specific fixation: this file, this cut, this edition.' },
  product:       { label: 'Release',       blurb: 'The package you actually sell.' },
};

function CopyChip({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }}
      className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
      title="Copy"
    >
      {done ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </button>
  );
}

interface Props {
  subject: RegistrySubject;
  onClose: () => void;
  /** Lets the host hash the actual content (manuscript, audio file) for duplicate detection. */
  computeHash?: () => Promise<string>;
}

const RightsIdentifiersPanel: React.FC<Props> = ({ subject, onClose, computeHash }) => {
  const [optedIn, setOptedIn] = useState<boolean | null>(null);
  const [record, setRecord] = useState<RegistryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [tab, setTab] = useState<'identity' | 'identifiers' | 'credits'>('identity');
  const [hashing, setHashing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uid = auth.currentUser?.uid;
  const isBook = subject.kind === 'BOOK' || subject.kind === 'COMIC';

  useEffect(() => {
    let alive = true;
    (async () => {
      const on = await isRegistryEnabled();
      if (!alive) return;
      setOptedIn(on);
      if (on) {
        try {
          setRecord(await loadRegistryRecord(subject) ?? await ensureRegistryRecord(subject));
        } catch (e: any) { setError(e?.message || 'Could not open the registry.'); }
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [subject.kind, subject.id]);

  const enable = async () => {
    setEnabling(true);
    setError(null);
    try {
      await setRegistryOptIn(true);
      setOptedIn(true);
      setRecord(await ensureRegistryRecord(subject));
    } catch (e: any) { setError(e?.message || 'Could not turn this on.'); }
    finally { setEnabling(false); }
  };

  const runHash = async () => {
    if (!record || !computeHash) return;
    setHashing(true);
    try {
      const sha = await computeHash();
      await setContentHash(record, sha);
      setRecord({ ...record });
    } catch (e: any) { setError(e?.message || 'Could not read the content.'); }
    finally { setHashing(false); }
  };

  const shell = (body: React.ReactNode) => (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9997] bg-black/92 backdrop-blur-xl flex flex-col"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <ShieldCheck size={16} className="text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-white font-semibold leading-tight">Rights &amp; Identifiers</h2>
            <p className="text-white/40 text-xs truncate">{subject.title || 'Untitled'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{body}</div>
      </motion.div>
    </AnimatePresence>
  );

  if (loading) {
    return shell(
      <div className="h-full flex items-center justify-center text-white/40">
        <Loader2 size={20} className="animate-spin" />
      </div>,
    );
  }

  // ── Opt-in screen — most accounts should never go past this ────────────────
  if (!optedIn) {
    return shell(
      <div className="max-w-lg mx-auto px-5 py-10">
        <h3 className="text-xl font-semibold text-white mb-3">Professional rights tools</h3>
        <p className="text-white/60 text-sm leading-relaxed mb-5">
          Off by default, and most people never need it. Turn it on if you want to track the
          rights behind your work the way the industry does — credits, splits, editions, and the
          identifiers a distributor or publisher will ask you for.
        </p>
        <div className="space-y-3 mb-6">
          {[
            ['A permanent ID for every work', 'A free, citable, resolvable identifier that stays with the work forever.'],
            ['A fingerprint of the content', 'The exact bytes, hashed — so a duplicate upload is recognisable.'],
            ['Credits and splits that add up', 'Who wrote what, who owns what, validated to 100% before it goes anywhere.'],
            ['Somewhere to keep your real numbers', 'ISBN, ISRC, UPC, EIDR — checked for typos the moment you paste them.'],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-3">
              <Check size={15} className="text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-white/90 text-sm font-medium">{t}</p>
                <p className="text-white/45 text-xs leading-relaxed">{d}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] mb-6">
          <Info size={15} className="text-white/40 mt-0.5 shrink-0" />
          <p className="text-white/45 text-xs leading-relaxed">
            Plajah cannot issue an ISBN, ISRC, UPC or EIDR — those come from their own
            authorities, and this panel stores the ones you already own. Everything Plajah
            provides here is free and always will be.
          </p>
        </div>
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <button
          onClick={enable}
          disabled={enabling}
          className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold text-sm transition-colors"
        >
          {enabling ? 'Setting up…' : 'Turn on Rights & Identifiers'}
        </button>
      </div>,
    );
  }

  if (!record) {
    return shell(<div className="px-5 py-10 text-center text-white/50 text-sm">{error || 'Registry unavailable.'}</div>);
  }

  return shell(
    <div className="max-w-2xl mx-auto px-5 py-5">
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] mb-5">
        {([['identity', 'Identity', Fingerprint], ['identifiers', 'Identifiers', Hash], ['credits', 'Credits & splits', Users]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              tab === id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/70'
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

      {tab === 'identity' && (
        <IdentityTab record={record} uid={uid} onHash={computeHash ? runHash : undefined} hashing={hashing} />
      )}

      {tab === 'identifiers' && (
        <IdentifiersTab
          record={record}
          kind={subject.kind}
          isBook={isBook}
          onChange={() => setRecord({ ...record })}
        />
      )}

      {tab === 'credits' && (
        <CreditsTab record={record} onChange={() => setRecord({ ...record })} />
      )}
    </div>,
  );
};

// ─── Identity ─────────────────────────────────────────────────────────────────

const IdentityTab: React.FC<{
  record: RegistryRecord; uid?: string; onHash?: () => void; hashing: boolean;
}> = ({ record, uid, onHash, hashing }) => {
  const layers: RegistryLayer[] = ['work', 'manifestation', 'product'];
  const sha = record.manifestation.technical?.sha256;

  return (
    <div className="space-y-4">
      <p className="text-white/45 text-xs leading-relaxed">
        Three things identify this work for free, forever: who made it, what the content is, and
        which record it is. None of them cost anything, and none of them are a substitute for an
        ISBN or ISRC.
      </p>

      {/* Creator Passport */}
      <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
        <p className="text-white/90 text-sm font-medium mb-1">Who made it</p>
        <p className="text-white/40 text-xs mb-2.5">Your Creator Passport — this travels with you, not with the platform.</p>
        <div className="flex items-center gap-1">
          <code className="flex-1 text-[11px] text-amber-200/80 bg-black/30 rounded-lg px-2.5 py-1.5 truncate">
            {uid ? passportIdFor(uid) : '—'}
          </code>
          {uid && <CopyChip value={passportIdFor(uid)} />}
        </div>
      </div>

      {/* ARKs */}
      <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
        <p className="text-white/90 text-sm font-medium mb-1">Which record it is</p>
        <p className="text-white/40 text-xs mb-3">
          An ARK — a permanent, citable identifier Plajah mints itself at no cost. Safe to print
          on a copyright page.
        </p>
        {!arkAvailable() ? (
          <div className="flex gap-2.5 p-3 rounded-lg bg-amber-500/[0.07] border border-amber-500/20">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-amber-200/70 text-xs leading-relaxed">
              Not available yet — Plajah's naming authority number is still being issued. Nothing
              is fabricated in the meantime; ARKs appear here automatically once it lands.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {layers.map(layer => {
              const entity = layer === 'work' ? record.work : layer === 'manifestation' ? record.manifestation : record.product;
              const ark = findIdentifier(entity, 'ARK');
              return (
                <div key={layer}>
                  <p className="text-white/35 text-[10px] uppercase tracking-wide mb-1">{LAYER_META[layer].label}</p>
                  <div className="flex items-center gap-1">
                    <code className="flex-1 text-[11px] text-emerald-200/80 bg-black/30 rounded-lg px-2.5 py-1.5 truncate">
                      {ark?.value || '—'}
                    </code>
                    {ark && <>
                      <CopyChip value={ark.value} />
                      <a href={arkResolverUrl(ark.value)} target="_blank" rel="noreferrer"
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                        <ExternalLink size={13} />
                      </a>
                    </>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Content hash */}
      <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
        <p className="text-white/90 text-sm font-medium mb-1">What the content is</p>
        <p className="text-white/40 text-xs mb-3">
          A SHA-256 fingerprint of the exact bytes. Two uploads of the same file produce the same
          value, which is how duplicates get caught.
        </p>
        {sha ? (
          <div className="flex items-center gap-1">
            <code className="flex-1 text-[11px] text-sky-200/80 bg-black/30 rounded-lg px-2.5 py-1.5 truncate">{sha}</code>
            <CopyChip value={sha} />
          </div>
        ) : onHash ? (
          <button onClick={onHash} disabled={hashing}
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white text-xs font-medium transition-colors">
            {hashing ? 'Reading…' : 'Fingerprint this content'}
          </button>
        ) : (
          <p className="text-white/30 text-xs">Recorded automatically when you publish.</p>
        )}
      </div>

      <div className="flex gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <Info size={14} className="text-white/35 mt-0.5 shrink-0" />
        <p className="text-white/40 text-[11px] leading-relaxed">
          These records are stored in Plajah's database. They are not yet signed or
          independently timestamped, so they show what you entered and when — they are not
          third-party proof of authorship. That comes with the anchored ledger.
        </p>
      </div>
    </div>
  );
};

// ─── Identifiers ──────────────────────────────────────────────────────────────

const IdentifiersTab: React.FC<{
  record: RegistryRecord; kind: RegistrySubject['kind']; isBook: boolean; onChange: () => void;
}> = ({ record, kind, isBook, onChange }) => {
  const layers: RegistryLayer[] = ['work', 'manifestation', 'product'];
  return (
    <div className="space-y-5">
      {isBook && <IsbnGuidance />}
      {layers.map(layer => {
        const schemes = schemesFor(kind, layer);
        if (!schemes.length) return null;
        const entity = layer === 'work' ? record.work : layer === 'manifestation' ? record.manifestation : record.product;
        return (
          <div key={layer}>
            <p className="text-white/90 text-sm font-medium">{LAYER_META[layer].label}</p>
            <p className="text-white/35 text-[11px] mb-2.5">{LAYER_META[layer].blurb}</p>
            <div className="space-y-2">
              {schemes.map(scheme => (
                <IdentifierRow
                  key={scheme}
                  scheme={scheme}
                  record={record}
                  layer={layer}
                  initial={findIdentifier(entity, scheme)?.value || ''}
                  onChange={onChange}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const IdentifierRow: React.FC<{
  scheme: IdScheme; record: RegistryRecord; layer: RegistryLayer; initial: string; onChange: () => void;
}> = ({ scheme, record, layer, initial, onChange }) => {
  const meta = SCHEME_META[scheme] || { label: scheme, hint: '', placeholder: '' };
  const [value, setValue] = useState(initial ? formatId(scheme, initial) : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!initial);
  const [problem, setProblem] = useState<string | null>(null);

  const live = useMemo(() => (value.trim() ? validateId(scheme, value) : null), [scheme, value]);

  const commit = useCallback(async () => {
    const raw = value.trim();
    setProblem(null);
    if (!raw) {
      if (saved) { await removeIdentifier(record, layer, scheme); setSaved(false); onChange(); }
      return;
    }
    if (!live?.valid) { setProblem(live?.reason || 'Not valid'); return; }
    setSaving(true);
    const res = await setIdentifier(record, layer, scheme, raw);
    setSaving(false);
    if (!res.ok) { setProblem(res.reason || 'Could not save'); return; }
    setSaved(true);
    setValue(formatId(scheme, live.normalized));
    onChange();
  }, [value, live, saved, record, layer, scheme, onChange]);

  const invalid = !!value.trim() && live && !live.valid;

  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-white/70 text-xs font-medium">{meta.label}</span>
        {saved && !invalid && <Check size={12} className="text-emerald-400" />}
        {saving && <Loader2 size={12} className="animate-spin text-white/40" />}
        {saved && (
          <button
            onClick={async () => { setValue(''); await removeIdentifier(record, layer, scheme); setSaved(false); onChange(); }}
            className="ml-auto p-1 rounded hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
            title="Remove"
          ><Trash2 size={11} /></button>
        )}
      </div>
      <input
        value={value}
        onChange={e => { setValue(e.target.value); setProblem(null); }}
        onBlur={commit}
        placeholder={meta.placeholder}
        className={`w-full bg-black/30 rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/20 outline-none border transition-colors ${
          invalid || problem ? 'border-red-500/50' : 'border-white/[0.06] focus:border-white/20'
        }`}
      />
      {(problem || invalid) && (
        <p className="text-red-400/80 text-[11px] mt-1.5">{problem || live?.reason}</p>
      )}
      {meta.hint && !problem && !invalid && (
        <p className="text-white/30 text-[11px] mt-1.5 leading-relaxed">{meta.hint}</p>
      )}
    </div>
  );
};

/** The four real routes a self-publisher takes. Shown once, on book subjects only. */
const IsbnGuidance: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-sky-500/[0.06] border border-sky-500/20 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left">
        <BookOpen size={15} className="text-sky-300 shrink-0" />
        <span className="text-sky-100/90 text-xs font-medium flex-1">Do you actually need an ISBN?</span>
        <span className="text-sky-200/50 text-[11px]">{open ? 'Hide' : 'Read'}</span>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-2.5 text-[11px] leading-relaxed text-sky-100/60">
          <p><strong className="text-sky-100/90">Selling here or on Kindle?</strong> You don't need one.
            A Kindle ebook is identified by its ASIN, and a book sold on Plajah needs no retail key at all.</p>
          <p><strong className="text-sky-100/90">KDP paperback?</strong> Amazon gives you a free ISBN, but the
            publisher of record reads "Independently published" and it only works on KDP — it can't move to
            IngramSpark or a bookshop.</p>
          <p><strong className="text-sky-100/90">Going wide with your own imprint?</strong> Buy your own
            (US: $125 for one, $295 for ten, ~$575 for a hundred). Aggregators like Draft2Digital also assign
            free ones with themselves as vendor of record.</p>
          <p><strong className="text-sky-100/90">Outside the US?</strong> Canada, India, New Zealand and several
            other countries issue ISBNs free through their national agency. Check yours before paying anyone.</p>
          <p className="text-sky-200/40">Plajah does not sell ISBNs and the ARK above is not a replacement for one.</p>
        </div>
      )}
    </div>
  );
};

// ─── Credits & splits ─────────────────────────────────────────────────────────

const CreditsTab: React.FC<{ record: RegistryRecord; onChange: () => void }> = ({ record, onChange }) => {
  const [rows, setRows] = useState<WorkContributor[]>(record.work.contributors || []);
  const [saving, setSaving] = useState(false);

  const perf = shareTotal(rows, 'sharePerf');
  const mech = shareTotal(rows, 'shareMech');
  const balanced = perf === 100 && mech === 100;

  const update = (i: number, patch: Partial<WorkContributor>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    try { await setContributors(record, rows); onChange(); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-white/45 text-xs leading-relaxed">
        Who created the work, and what each person's share is. Performance and mechanical shares
        are tracked separately because they genuinely diverge — and both have to reach 100% before
        any registration will be accepted.
      </p>

      {rows.map((row, i) => (
        <div key={i} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
          <div className="flex gap-2">
            <input
              value={row.displayName}
              onChange={e => update(i, { displayName: e.target.value })}
              placeholder="Name"
              className="flex-1 bg-black/30 rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/20 outline-none border border-white/[0.06] focus:border-white/20"
            />
            <input
              value={row.ipi || ''}
              onChange={e => update(i, { ipi: e.target.value })}
              placeholder="IPI (optional)"
              className="w-32 bg-black/30 rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/20 outline-none border border-white/[0.06] focus:border-white/20"
            />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-white/35 text-[11px] w-24">Performance</label>
            <input
              type="number" min={0} max={100}
              value={row.sharePerf ?? 0}
              onChange={e => update(i, { sharePerf: Number(e.target.value) })}
              className="w-20 bg-black/30 rounded-lg px-2.5 py-1 text-[12px] text-white outline-none border border-white/[0.06] focus:border-white/20"
            />
            <label className="text-white/35 text-[11px] w-24 text-right">Mechanical</label>
            <input
              type="number" min={0} max={100}
              value={row.shareMech ?? 0}
              onChange={e => update(i, { shareMech: Number(e.target.value) })}
              className="w-20 bg-black/30 rounded-lg px-2.5 py-1 text-[12px] text-white outline-none border border-white/[0.06] focus:border-white/20"
            />
            {rows.length > 1 && (
              <button onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                className="ml-auto p-1.5 rounded hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      ))}

      <button
        onClick={() => setRows([...rows, { partyId: '', displayName: '', role: 'CA', controlled: false, sharePerf: 0, shareMech: 0 }])}
        className="w-full py-2 rounded-xl border border-dashed border-white/15 text-white/45 hover:text-white/70 hover:border-white/25 text-xs transition-colors"
      >
        Add a contributor
      </button>

      <div className={`flex items-center gap-2 p-3 rounded-xl border text-xs ${
        balanced ? 'bg-emerald-500/[0.07] border-emerald-500/20 text-emerald-200/80'
                 : 'bg-amber-500/[0.07] border-amber-500/20 text-amber-200/80'
      }`}>
        {balanced ? <Check size={14} /> : <AlertTriangle size={14} />}
        <span>{perf}% performance · {mech}% mechanical{balanced ? ' — balanced' : ' — both must reach 100%'}</span>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
      >
        {saving ? 'Saving…' : 'Save credits'}
      </button>
    </div>
  );
};

export default RightsIdentifiersPanel;
