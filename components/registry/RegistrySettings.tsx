// ─── Rights & Identifiers — settings section ──────────────────────────────────
// The switch that turns the professional rights layer on, plus every work this account
// already has a record for. The same panel the studios open lives behind each row, so
// there is one place to find everything rather than hunting through three studios.

import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, Fingerprint, BookOpen, Music2, Film, Loader2, ChevronRight, Info, ExternalLink,
} from 'lucide-react';
import {
  isRegistryEnabled, setRegistryOptIn, listRegistryRefs,
  type RegistryRefRow, type RegistrySubject, type RegistrySubjectKind,
} from '../../services/registry/registryService';
import { arkAvailable } from '../../services/registry/ark';

const RightsIdentifiersPanel = lazy(() => import('./RightsIdentifiersPanel'));

const KIND_META: Record<RegistrySubjectKind, { icon: React.ElementType; label: string; tint: string }> = {
  BOOK:    { icon: BookOpen, label: 'Book',    tint: '#f59e0b' },
  COMIC:   { icon: BookOpen, label: 'Comic',   tint: '#f59e0b' },
  ALBUM:   { icon: Music2,   label: 'Release', tint: '#a78bfa' },
  TRACK:   { icon: Music2,   label: 'Track',   tint: '#a78bfa' },
  FILM:    { icon: Film,     label: 'Film',    tint: '#FF8C00' },
  EPISODE: { icon: Film,     label: 'Episode', tint: '#FF8C00' },
};

const RegistrySettings: React.FC = () => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [rows, setRows] = useState<RegistryRefRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<RegistrySubject | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const on = await isRegistryEnabled();
    setEnabled(on);
    setRows(on ? await listRegistryRefs() : []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await setRegistryOptIn(!enabled);
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Could not change this setting.');
    } finally { setBusy(false); }
  };

  if (enabled === null) {
    return <div className="py-12 flex justify-center text-white/30"><Loader2 size={20} className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight uppercase mb-2">Rights &amp; Identifiers</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">
          The professional layer — credits, splits and industry identifiers
        </p>
      </div>

      {/* The switch */}
      <div className="p-5 bg-white/5 rounded-2xl border border-white/10">
        <div className="flex items-start gap-4">
          <ShieldCheck size={20} className="text-white/40 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black uppercase tracking-widest">
              {enabled ? 'Turned on' : 'Turned off'}
            </h3>
            <p className="text-xs text-white/45 leading-relaxed mt-1">
              {enabled
                ? 'A Rights button appears in the book studio, the release creator and your film rights page. Turning this off hides those buttons — nothing you have recorded is deleted.'
                : 'Off by default. Turn it on if you want to track credits, ownership splits and the identifiers a distributor or publisher will ask you for. Most people never need this.'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            aria-label={enabled ? 'Turn off Rights & Identifiers' : 'Turn on Rights & Identifiers'}
            className={`w-12 h-7 rounded-full transition-all relative shrink-0 disabled:opacity-50 ${enabled ? 'bg-small-orange' : 'bg-white/10'}`}
          >
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${enabled ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
      </div>

      {enabled && (
        <>
          {/* What Plajah can and cannot issue — stated once, plainly, where it matters. */}
          <div className="flex gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <Info size={15} className="text-white/35 mt-0.5 shrink-0" />
            <p className="text-white/45 text-xs leading-relaxed">
              Plajah issues a permanent identifier and a content fingerprint for every work, free
              and forever. It cannot issue an ISBN, ISRC, UPC or EIDR — those come from their own
              authorities, and this is where you keep the ones you already own.
              {!arkAvailable() && ' Permanent identifiers are still being switched on; they will appear on your works automatically.'}
            </p>
          </div>

          {/* Everything registered */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3">
              Your records {rows?.length ? `· ${rows.length}` : ''}
            </p>

            {rows === null ? (
              <div className="py-8 flex justify-center text-white/30"><Loader2 size={18} className="animate-spin" /></div>
            ) : rows.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                <Fingerprint size={22} className="text-white/15 mx-auto mb-3" />
                <p className="text-xs text-white/40 leading-relaxed max-w-sm mx-auto">
                  Nothing recorded yet. Open a book in the writing studio, a release in the album
                  creator, or a film in your rights page, and press <strong className="text-white/60">Rights</strong> —
                  the record is created the first time you look.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map(row => {
                  const meta = KIND_META[row.subjectKind] || KIND_META.BOOK;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={`${row.subjectKind}_${row.subjectId}`}
                      type="button"
                      onClick={() => setOpen({
                        kind: row.subjectKind,
                        id: row.subjectId,
                        title: row.subjectTitle,
                      })}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors text-left"
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: `${meta.tint}22` }}
                      >
                        <Icon size={15} style={{ color: meta.tint }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{row.subjectTitle || 'Untitled'}</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{meta.label}</p>
                      </div>
                      <ChevronRight size={15} className="text-white/20 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <a
            href="https://arks.org/about/ark-naans-and-systems/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-[11px] text-white/30 hover:text-white/60 transition-colors"
          >
            <ExternalLink size={12} /> How permanent identifiers work
          </a>
        </>
      )}

      {open && (
        <Suspense fallback={null}>
          <RightsIdentifiersPanel
            subject={open}
            onClose={() => { setOpen(null); refresh(); }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default RegistrySettings;
