// BibleLibraryPicker — choose Bible translations from Verse's hosted library,
// grouped by language. Every entry is public domain or openly licensed; the
// licence is shown beside each one.
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Globe2, Loader2, Search, X } from 'lucide-react';
import { librarySlug, loadCatalog, type LibraryTranslation } from '../../services/bibleLibrary';

interface Props {
  picks: string[];
  onToggle: (slug: string) => void;
  onClose: () => void;
}

const coverage = (t: LibraryTranslation) =>
  t.ot && t.nt ? 'Full Bible' : t.nt ? 'New Testament' : t.ot ? 'Old Testament' : 'Portions';

const BibleLibraryPicker: React.FC<Props> = ({ picks, onToggle, onClose }) => {
  const [list, setList] = useState<LibraryTranslation[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => { let dead = false; loadCatalog().then(l => { if (!dead) setList(l); }); return () => { dead = true; }; }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = (t: LibraryTranslation) => !needle || [t.langEnglish, t.langName, t.title, t.fullTitle, t.lang, t.dialect]
      .some(s => s?.toLowerCase().includes(needle));
    const m = new Map<string, LibraryTranslation[]>();
    for (const t of list ?? []) if (hit(t)) {
      const k = t.langEnglish || t.langName;
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    // Chosen languages first, then alphabetical.
    return [...m.entries()].sort(([a, x], [b, y]) => {
      const pa = x.some(t => picks.includes(librarySlug(t.id))) ? 0 : 1, pb = y.some(t => picks.includes(librarySlug(t.id))) ? 0 : 1;
      return pa - pb || a.localeCompare(b);
    });
  }, [list, q, picks]);

  const languages = useMemo(() => new Set((list ?? []).map(t => t.lang)).size, [list]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3" onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Bible translations in every language">
      <div className="w-full max-w-2xl max-h-[86vh] flex flex-col rounded-2xl border border-white/10 bg-[#0f0d14] text-white shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-white/10">
          <Globe2 size={16} className="text-[#d4af37]" />
          <div className="min-w-0">
            <h2 className="text-[13px] font-black tracking-tight">Bibles in every language</h2>
            <p className="text-[10px] text-white/45">
              {list ? `${list.length.toLocaleString()} translations · ${languages.toLocaleString()} languages · public domain and open licences` : 'Loading the library…'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="ml-auto w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center">
            <X size={15} />
          </button>
        </div>
        <div className="px-4 py-3">
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
            <Search size={13} className="text-white/40" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search a language or translation — Español, Swahili, 中文, Haitian…"
              className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-white/30" />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
          {!list ? (
            <p className="py-16 flex items-center justify-center gap-2 text-[11px] text-white/45"><Loader2 size={13} className="animate-spin" /> Loading the library…</p>
          ) : list.length === 0 ? (
            <p className="py-16 text-center text-[11px] text-white/45">The library couldn’t be reached. Check your connection and try again.</p>
          ) : groups.length === 0 ? (
            <p className="py-16 text-center text-[11px] text-white/45">No language or translation matches “{q}”.</p>
          ) : groups.map(([language, items]) => (
            <section key={language} className="mb-3">
              <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">
                {language}{items[0].langName && items[0].langName !== language ? <span className="normal-case tracking-normal font-semibold text-white/30"> · {items[0].langName}</span> : null}
              </h3>
              <ul className="space-y-1">
                {items.map(t => {
                  const slug = librarySlug(t.id), on = picks.includes(slug);
                  return (
                    <li key={t.id}>
                      <button onClick={() => onToggle(slug)} aria-pressed={on}
                        className={`w-full text-left flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors ${on ? 'border-[#d4af37]/70 bg-[#d4af37]/10' : 'border-white/[0.07] hover:bg-white/[0.05]'}`}>
                        <span className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center ${on ? 'bg-[#d4af37] border-[#d4af37] text-black' : 'border-white/25'}`}>
                          {on && <Check size={11} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-semibold leading-snug" dir={t.dir}>{t.fullTitle || t.title}</span>
                          <span className="block text-[10px] text-white/45">
                            {coverage(t)}{t.dc ? ' + Deuterocanon' : ''}{t.dialect ? ` · ${t.dialect}` : ''} · {t.licence}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <p className="px-4 py-2.5 border-t border-white/10 text-[9.5px] text-white/35">
          Texts from eBible.org. Each is shown unaltered with its copyright and licence.
        </p>
      </div>
    </div>
  );
};

export default BibleLibraryPicker;
