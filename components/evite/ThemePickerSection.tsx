/**
 * ThemePickerSection — a compact row for the studio's Design step: the signed-in host's usable creator themes
 * (their own, licences they bought or were given, free ones they saved, their Sanctuaries' members-only themes)
 * plus "Make your own", which opens EviteThemeCreator. Picking one hands back the design id ("theme:<id>") and
 * the art for EviteCard's `art` prop.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../services/firebase';
import EviteThemeCreator, { THEME_CSS } from './EviteThemeCreator';
import { usableThemes, type UsableTheme, type ThemeArt } from '../../services/evite/eviteThemeClient';
import { themeTemplateId } from '../../services/evite/eviteThemes';

export interface ThemePickerSectionProps {
  onPick(templateId: string, art: ThemeArt): void;
  /** the design currently chosen, to show it as selected (optional) */
  value?: string;
}

const WHY: Record<UsableTheme['why'], string> = { mine: 'Yours', licensed: 'Owned', free: 'Saved', member: 'Members' };

export default function ThemePickerSection({ onPick, value }: ThemePickerSectionProps) {
  const [uid, setUid] = useState<string | null>(() => auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.uid : null);
  const [items, setItems] = useState<UsableTheme[] | null>(null);
  const [err, setErr] = useState('');
  const [making, setMaking] = useState(false);

  useEffect(() => onAuthStateChanged(auth, u => setUid(u && !u.isAnonymous ? u.uid : null)), []);
  const load = useCallback(() => { if (!uid) { setItems(null); return; } setErr(''); usableThemes().then(setItems).catch(e => setErr(e?.message || 'Could not load your themes.')); }, [uid]);
  useEffect(() => { load(); }, [load]);

  if (!uid) return null;
  return (
    <section className="mt-5" aria-labelledby="pj-theme-picker-h">
      <style>{THEME_CSS}</style>
      <div className="flex items-center gap-2 mb-2">
        <h3 id="pj-theme-picker-h" className="pj-h3">Creator themes</h3>
        <span className="text-xs text-white/45">Your own art and themes you own</span>
      </div>
      {err && <p className="text-xs text-amber-300 mb-2" role="alert">{err} <button className="underline" onClick={load}>Retry</button></p>}
      <ul className="flex gap-2.5 overflow-x-auto pb-2" aria-label="Your usable themes">
        <li className="shrink-0">
          <button onClick={() => setMaking(true)} className="w-[96px] aspect-[2/3] rounded-2xl border-2 border-dashed border-white/25 grid place-items-center text-center p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
            style={{ background: 'linear-gradient(160deg,rgba(107,0,153,.35),rgba(212,0,85,.18) 60%,rgba(255,140,0,.15))' }}>
            <span className="grid gap-1 justify-items-center"><span aria-hidden className="text-2xl leading-none">+</span><span className="text-[11px] font-black uppercase tracking-wider">Make your own</span></span>
          </button>
        </li>
        {items === null && !err && Array.from({ length: 3 }, (_, i) => <li key={i} className="shrink-0 w-[96px] aspect-[2/3] rounded-2xl bg-white/5 animate-pulse" />)}
        {(items || []).map(it => { const on = value === it.templateId; return (
          <li key={it.theme.id} className="shrink-0">
            <button onClick={() => onPick(it.templateId, it.art)} aria-pressed={on} aria-label={`${it.theme.title} (${WHY[it.why]})`}
              className={`relative w-[96px] rounded-2xl overflow-hidden border-2 ${on ? 'border-orange-400' : 'border-transparent'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300`}>
              <img src={it.theme.assets.thumb} alt="" loading="lazy" width={96} height={145} className="w-full aspect-[2/3] object-cover block" />
              <span className="absolute right-1 top-1 text-[9px] font-black uppercase tracking-wider bg-black/65 rounded-full px-1.5 py-0.5">{WHY[it.why]}</span>
              <span className="absolute left-1 right-1 bottom-1 text-[10px] font-bold bg-black/60 rounded-full px-2 py-0.5 truncate">{it.theme.title}</span>
            </button>
          </li>
        ); })}
      </ul>
      {items && items.length === 0 && <p className="text-xs text-white/45">Upload your own art to make a theme, or find one in the theme market.</p>}
      {making && <EviteThemeCreator onClose={() => { setMaking(false); load(); }}
        onDone={t => { if (t.status === 'published') { const art = { plate: t.assets.plate, depth: t.assets.depth, thumb: t.assets.thumb, preset: t.preset, foil: t.foil, voice: t.voice, light: t.light }; onPick(themeTemplateId(t.id), art); } load(); }} />}
    </section>
  );
}
