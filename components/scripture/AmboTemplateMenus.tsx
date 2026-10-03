// AmboTemplateMenus — pop-over menus with thumbnails for changing templates
// at any time, in two places:
//
//   SlideTemplateMenu   the presentation view: change THIS slide's template or
//                       theme (its words carry over), from the toolbar, the
//                       slide's hover button, or its right-click menu.
//   ScriptureLookMenu   the scripture UI (and a scripture slide): change the
//                       look every scripture uses — or one slide's own look.
//   ScriptureQuickBar   the look menu + the "Auto-cue next" switch, side by side.
//
// Every tile is drawn by the renderer the outputs use (see AmboTemplateThumbs),
// so what you pick is what the room sees. Saved templates (mine / shared /
// community) sit in the same menus under their own tabs.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, LayoutTemplate, Search, X, Wand2, Users, User, Globe, Loader2 } from 'lucide-react';
import { SLIDE_TEMPLATES, TEMPLATE_CATEGORIES } from '../../services/ambo/slideTemplates/registry';
import { SLIDE_THEMES, DEFAULT_THEME_ID } from '../../services/ambo/slideTemplates/themes';
import { MODERN_THEMES_A } from '../../services/ambo/slideTemplates/themesModernA';
import { MODERN_THEMES_B } from '../../services/ambo/slideTemplates/themesModernB';
import { URBAN_THEMES } from '../../services/ambo/slideTemplates/themesUrban';
import { SCRIPTURE_LAYOUTS, scriptureLayoutById, type LayoutFamily } from '../../services/ambo/scriptureLayouts';
import { getScriptureLook, setScriptureLook, subscribeScriptureLook, applySavedLook } from '../../services/ambo/scriptureLook';
import { getAutoCueNext, setAutoCueNext, subscribeAutoCueNext } from '../../services/ambo/scriptureAutoCue';
import { slideFieldsFor, type SavedTemplate } from '../../services/ambo/templateLibrary';
import { useTemplateLibrary } from './AmboTemplateLibraryTabs';
import { SlideThumb, ScriptureThumb, type ScriptureSample } from './AmboTemplateThumbs';

const LILAC = '#D0BCFF', CYAN = '#00DAF3', GOLD = '#E3C57E', LINE = 'rgba(255,255,255,0.10)';

/** Where a menu opens from: a button's rect, or a point (right-click). */
export interface MenuAnchor { x: number; y: number; w?: number; h?: number }
export const anchorOf = (el: Element | null): MenuAnchor | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

// ── theme sets ───────────────────────────────────────────────────────────────
const MODERN_IDS = new Set([...MODERN_THEMES_A, ...MODERN_THEMES_B].map(t => t.id));
const URBAN_IDS = new Set(URBAN_THEMES.map(t => t.id));
export const THEME_GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: 'Classic', ids: SLIDE_THEMES.filter(t => !MODERN_IDS.has(t.id) && !URBAN_IDS.has(t.id)).map(t => t.id) },
  { label: 'Modern & Abstract', ids: SLIDE_THEMES.filter(t => MODERN_IDS.has(t.id)).map(t => t.id) },
  { label: 'Urban & Grunge', ids: SLIDE_THEMES.filter(t => URBAN_IDS.has(t.id)).map(t => t.id) },
];
const themeName = (id: string) => SLIDE_THEMES.find(t => t.id === id)?.name ?? id;

// ── shell: portal, anchored, closes on outside click / Escape ────────────────
const MenuShell: React.FC<{
  anchor: MenuAnchor; width: number; onClose: () => void; label: string; children: React.ReactNode;
  /** The button that opened the menu — pressing it again toggles, rather than close-then-reopen. */
  ignoreRef?: React.RefObject<HTMLElement | null>;
}> = ({ anchor, width, onClose, label, children, ignoreRef }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number }>({ left: -9999, top: 0, maxH: 560 });

  useLayoutEffect(() => {
    const vw = window.innerWidth, vh = window.innerHeight, pad = 10;
    const w = Math.min(width, vw - pad * 2);
    // Right-align under a button; open at the pointer for a point anchor.
    let left = anchor.w != null ? anchor.x + anchor.w - w : anchor.x;
    left = Math.max(pad, Math.min(left, vw - w - pad));
    const below = vh - (anchor.y + (anchor.h ?? 0)) - pad - 6;
    const above = anchor.y - pad - 6;
    const useBelow = below >= 380 || below >= above;
    const maxH = Math.max(240, Math.min(620, useBelow ? below : above));
    const top = useBelow ? anchor.y + (anchor.h ?? 0) + 6 : Math.max(pad, anchor.y - maxH - 6);
    setPos({ left, top, maxH });
  }, [anchor, width]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !ignoreRef?.current?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); };
  }, [onClose, ignoreRef]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={ref} role="dialog" aria-label={label}
      className="fixed z-[220] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
      style={{ left: pos.left, top: pos.top, width: Math.min(width, window.innerWidth - 20), maxHeight: pos.maxH, background: 'rgba(14,10,22,0.98)', borderColor: 'rgba(208,188,255,0.28)', boxShadow: '0 24px 70px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)', backdropFilter: 'blur(14px)' }}>
      {children}
    </div>,
    document.body,
  );
};

const Header: React.FC<{ title: string; sub?: string; onClose: () => void }> = ({ title, sub, onClose }) => (
  <div className="flex items-center gap-2 px-3.5 pt-3 pb-2 flex-none">
    <LayoutTemplate size={15} style={{ color: LILAC }} />
    <div className="min-w-0 flex-1">
      <div className="text-[13px] font-extrabold tracking-wide text-white leading-tight">{title}</div>
      {sub && <div className="text-[10.5px] text-white/50 truncate leading-tight mt-0.5">{sub}</div>}
    </div>
    <button onClick={onClose} aria-label="Close" className="w-7 h-7 grid place-items-center rounded-lg text-white/55 hover:text-white hover:bg-white/10"><X size={14} /></button>
  </div>
);

const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({ value, onChange, placeholder }) => (
  <label className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg flex-1 min-w-[120px]" style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${LINE}` }}>
    <Search size={12} className="text-white/45 flex-none" />
    <input autoFocus value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="bg-transparent outline-none text-[12px] text-white placeholder-white/35 w-full" />
  </label>
);

const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode; title?: string }> = ({ on, onClick, children, title }) => (
  <button onClick={onClick} title={title}
    className="px-2 py-1 rounded-md text-[10.5px] font-semibold flex-none transition-colors"
    style={{ background: on ? 'rgba(208,188,255,0.18)' : 'rgba(255,255,255,0.05)', color: on ? '#fff' : 'rgba(255,255,255,0.6)', border: `1px solid ${on ? 'rgba(208,188,255,0.5)' : 'transparent'}` }}>
    {children}
  </button>
);

type Source = 'platform' | 'mine' | 'shared' | 'community';
const SOURCES: Array<{ id: Source; label: string; Icon: typeof User }> = [
  { id: 'platform', label: 'Platform', Icon: LayoutTemplate }, { id: 'mine', label: 'Mine', Icon: User },
  { id: 'shared', label: 'Shared', Icon: Users }, { id: 'community', label: 'Community', Icon: Globe },
];
const SourceTabs: React.FC<{ source: Source; onSource: (s: Source) => void; counts: Partial<Record<Source, number>> }> = ({ source, onSource, counts }) => (
  <div className="flex items-center gap-1 px-3.5 pb-2 flex-none">
    {SOURCES.map(({ id, label, Icon }) => (
      <button key={id} onClick={() => onSource(id)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-bold"
        style={{ background: source === id ? CYAN : 'transparent', color: source === id ? '#04222a' : 'rgba(255,255,255,0.6)' }}>
        <Icon size={11} /> {label}{counts[id] ? <span className="opacity-70 font-mono">{counts[id]}</span> : null}
      </button>
    ))}
  </div>
);

const Tile: React.FC<{ selected?: boolean; name: string; sub?: string; title?: string; onPick: () => void; children: React.ReactNode }> = ({ selected, name, sub, title, onPick, children }) => (
  <button onClick={onPick} title={title ?? name}
    className="text-left rounded-lg overflow-hidden border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00DAF3]"
    style={{ borderColor: selected ? LILAC : 'rgba(255,255,255,0.10)', boxShadow: selected ? '0 0 0 2px rgba(208,188,255,0.35)' : 'none', background: 'rgba(0,0,0,0.35)' }}>
    {children}
    <div className="px-1.5 py-1">
      <div className="text-[10.5px] font-bold text-white truncate flex items-center gap-1">{selected && <Check size={10} style={{ color: LILAC }} />}{name}</div>
      {sub && <div className="text-[8.5px] text-white/45 truncate">{sub}</div>}
    </div>
  </button>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="col-span-full text-center text-[11.5px] text-white/45 py-8 px-4 leading-relaxed">{children}</div>
);

const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 8 } as const;

function savedEmpty(source: Source, lib: ReturnType<typeof useTemplateLibrary>, noun: string): React.ReactNode {
  if (source === 'platform') return null;
  const loading = lib.loading[source];
  if (loading) return <span className="inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Loading…</span>;
  if (lib.errors[source]) return lib.errors[source];
  if (source === 'mine') return <>No saved {noun} yet. Customize one in the gallery and choose <b>Save as my template</b>.{!lib.signedIn && <><br />Signed out — saved on this device only.</>}</>;
  if (source === 'shared') return lib.signedIn ? `Nobody has shared ${noun} with you yet.` : `Sign in to see ${noun} shared with you.`;
  return `No community ${noun} yet.`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Slide template menu
// ═════════════════════════════════════════════════════════════════════════════
export interface SlideTemplateMenuProps {
  anchor: MenuAnchor;
  onClose: () => void;
  /** Slide being changed (shown in the header). */
  slideLabel?: string;
  /** 'template' = already a template slide; 'plain' = a text slide that will be converted. */
  mode: 'template' | 'plain';
  current: { templateId?: string; theme?: string };
  /** Fields to preview each template with (carries this slide's words over). */
  fieldsFor: (templateId: string) => Record<string, string>;
  onPickTemplate: (templateId: string, themeId: string) => void;
  onPickTheme: (themeId: string) => void;
  /** Apply a saved template's style (template + theme + palette) to this slide. */
  onPickSaved: (saved: SavedTemplate) => void;
  /** How many template slides the show has — enables "apply theme to all". */
  templateSlideCount: number;
  onApplyThemeToAll: (themeId: string) => void;
  ignoreRef?: React.RefObject<HTMLElement | null>;
}

export const SlideTemplateMenu: React.FC<SlideTemplateMenuProps> = ({
  anchor, onClose, slideLabel, mode, current, fieldsFor, onPickTemplate, onPickTheme, onPickSaved, templateSlideCount, onApplyThemeToAll, ignoreRef,
}) => {
  const [source, setSource] = useState<Source>('platform');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('All');
  const [theme, setTheme] = useState(current.theme || DEFAULT_THEME_ID);
  const lib = useTemplateLibrary('ambo-slide', true);
  useEffect(() => { if (current.theme) setTheme(current.theme); }, [current.theme]);

  const needle = q.trim().toLowerCase();
  const list = useMemo(() => SLIDE_TEMPLATES.filter(t =>
    (cat === 'All' || t.category === cat) &&
    (!needle || `${t.name} ${t.blurb} ${t.category}`.toLowerCase().includes(needle))), [cat, needle]);
  const byCat = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const t of list) (m.get(t.category) ?? m.set(t.category, []).get(t.category)!).push(t);
    return TEMPLATE_CATEGORIES.filter(c => m.has(c)).map(c => ({ cat: c, items: m.get(c)! }));
  }, [list]);
  const saved = (source === 'mine' ? lib.mine : source === 'shared' ? lib.shared : lib.community)
    .filter(t => t.kind === 'ambo-slide' && (!needle || `${t.name} ${t.baseTemplateId}`.toLowerCase().includes(needle)));

  const pickTheme = (id: string) => { setTheme(id); if (mode === 'template') onPickTheme(id); };

  return (
    <MenuShell anchor={anchor} width={620} onClose={onClose} label="Slide template" ignoreRef={ignoreRef}>
      <Header title={mode === 'plain' ? 'Turn this slide into a template' : 'Change slide template'}
        sub={slideLabel ? `${slideLabel} — your words carry over` : 'Your words carry over'} onClose={onClose} />
      <SourceTabs source={source} onSource={setSource} counts={{ mine: lib.mine.filter(t => t.kind === 'ambo-slide').length, shared: lib.shared.filter(t => t.kind === 'ambo-slide').length }} />
      <div className="flex items-center gap-2 px-3.5 pb-2 flex-none flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Search templates…" />
        <select value={theme} onChange={e => pickTheme(e.target.value)} aria-label="Theme"
          className="h-8 rounded-lg px-2 text-[11.5px] text-white outline-none max-w-[190px]" style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${LINE}` }}>
          {THEME_GROUPS.map(g => (
            <optgroup key={g.label} label={g.label}>{g.ids.map(id => <option key={id} value={id} style={{ color: '#000' }}>{themeName(id)}</option>)}</optgroup>
          ))}
        </select>
        {mode === 'template' && templateSlideCount > 1 && (
          <button onClick={() => onApplyThemeToAll(theme)} title={`Use ${themeName(theme)} on every template slide in this show`}
            className="h-8 px-2.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1" style={{ background: 'rgba(0,218,243,0.14)', color: CYAN, border: '1px solid rgba(0,218,243,0.35)' }}>
            <Wand2 size={11} /> Theme → all {templateSlideCount}
          </button>
        )}
      </div>
      {source === 'platform' && (
        <div className="flex items-center gap-1 px-3.5 pb-2 flex-none overflow-x-auto">
          {['All', ...TEMPLATE_CATEGORIES].map(c => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}{c !== 'All' && <span className="opacity-50 ml-1 font-mono">{SLIDE_TEMPLATES.filter(t => t.category === c).length}</span>}</Chip>)}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 pb-3.5 custom-scrollbar" style={{ borderTop: `1px solid ${LINE}` }}>
        {source === 'platform' ? (
          byCat.length === 0 ? <div style={GRID} className="pt-3"><Empty>No templates match “{q}”.</Empty></div> :
          byCat.map(g => (
            <section key={g.cat} className="pt-3">
              <div className="text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-white/40 mb-1.5">{g.cat}</div>
              <div style={GRID}>
                {g.items.map(t => (
                  <Tile key={t.id} name={t.name} sub={t.blurb} title={`${t.name} — ${t.blurb}`} selected={mode === 'template' && current.templateId === t.id} onPick={() => onPickTemplate(t.id, theme)}>
                    <SlideThumb templateId={t.id} theme={theme} fields={fieldsFor(t.id)} className="w-full" />
                  </Tile>
                ))}
              </div>
            </section>
          ))
        ) : (
          <div style={GRID} className="pt-3">
            {saved.length === 0 ? <Empty>{savedEmpty(source, lib, 'slide templates')}</Empty> : saved.map(t => (
              <Tile key={t.id} name={t.name} sub={`${t.ownerName ? t.ownerName + ' · ' : ''}${themeName(t.theme || '')}`} onPick={() => onPickSaved(t)}>
                {t.thumb
                  ? <img src={t.thumb} alt="" className="block w-full" style={{ aspectRatio: '16 / 9', objectFit: 'cover' }} />
                  : <SlideThumb templateId={t.baseTemplateId || 'welcome'} theme={t.theme} fields={slideFieldsFor(t)} className="w-full" />}
              </Tile>
            ))}
          </div>
        )}
      </div>
    </MenuShell>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// Scripture look menu
// ═════════════════════════════════════════════════════════════════════════════
const FAMILIES: LayoutFamily[] = ['Opaque', 'Transparent', 'Panel', 'Overlay', 'Art Council', 'Modern & Abstract', 'Urban & Grunge', 'Typographic'];

export interface ScriptureLookMenuProps {
  anchor: MenuAnchor;
  onClose: () => void;
  currentId?: string;
  onPick: (layoutId: string) => void;
  /** Saved look (mine / shared / community) picked. */
  onPickSaved?: (saved: SavedTemplate) => void;
  /** Offer "Use the default look" (a scripture slide that follows the global look). */
  onFollowDefault?: () => void;
  followingDefault?: boolean;
  title?: string;
  sub?: string;
  /** Thumbnails show this verse (the one in preview/program), else a sample. */
  sample?: ScriptureSample;
  ignoreRef?: React.RefObject<HTMLElement | null>;
}

export const ScriptureLookMenu: React.FC<ScriptureLookMenuProps> = ({ anchor, onClose, currentId, onPick, onPickSaved, onFollowDefault, followingDefault, title = 'Scripture look', sub, sample, ignoreRef }) => {
  const look = useSyncExternalStore(subscribeScriptureLook, getScriptureLook);
  const [source, setSource] = useState<Source>('platform');
  const [q, setQ] = useState('');
  const [fam, setFam] = useState<string>('All');
  const lib = useTemplateLibrary('scripture-look', true);
  const needle = q.trim().toLowerCase();
  const items = useMemo(() => SCRIPTURE_LAYOUTS.filter(l =>
    (fam === 'All' || l.family === fam) &&
    (!needle || `${l.name} ${l.blurb} ${l.director ?? ''} ${l.family}`.toLowerCase().includes(needle))), [fam, needle]);
  const saved = (source === 'mine' ? lib.mine : source === 'shared' ? lib.shared : lib.community)
    .filter(t => t.kind === 'scripture-look' && (!needle || t.name.toLowerCase().includes(needle)));
  const selectedId = currentId ?? look.layoutId;

  return (
    <MenuShell anchor={anchor} width={640} onClose={onClose} label="Scripture look" ignoreRef={ignoreRef}>
      <Header title={title} sub={sub ?? 'Applies to every scripture you take — on air now and next'} onClose={onClose} />
      {onPickSaved && <SourceTabs source={source} onSource={setSource} counts={{ mine: lib.mine.filter(t => t.kind === 'scripture-look').length, shared: lib.shared.filter(t => t.kind === 'scripture-look').length }} />}
      <div className="flex items-center gap-2 px-3.5 pb-2 flex-none">
        <SearchBox value={q} onChange={setQ} placeholder="Search looks…" />
        {onFollowDefault && (
          <button onClick={onFollowDefault} className="h-8 px-2.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1 flex-none"
            style={{ background: followingDefault ? 'rgba(208,188,255,0.2)' : 'rgba(255,255,255,0.06)', color: followingDefault ? '#fff' : 'rgba(255,255,255,0.7)', border: `1px solid ${followingDefault ? 'rgba(208,188,255,0.5)' : LINE}` }}>
            {followingDefault && <Check size={11} />} Use default look
          </button>
        )}
      </div>
      {source === 'platform' && (
        <div className="flex items-center gap-1 px-3.5 pb-2 flex-none overflow-x-auto">
          {['All', ...FAMILIES].map(f => <Chip key={f} on={fam === f} onClick={() => setFam(f)}>{f}{f !== 'All' && <span className="opacity-50 ml-1 font-mono">{SCRIPTURE_LAYOUTS.filter(l => l.family === f).length}</span>}</Chip>)}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 pb-3.5 custom-scrollbar" style={{ borderTop: `1px solid ${LINE}` }}>
        <div style={GRID} className="pt-3">
          {source === 'platform' ? (
            items.length === 0 ? <Empty>No looks match “{q}”.</Empty> : items.map(l => (
              <Tile key={l.id} name={l.name} title={`${l.name} — ${l.blurb}`} selected={selectedId === l.id && !followingDefault}
                sub={l.director ? `${l.director} · Art Council` : l.background === 'transparent' ? 'Over picture' : l.family}
                onPick={() => onPick(l.id)}>
                <ScriptureThumb layoutId={l.id} accent={look.accent} sample={sample} className="w-full" />
              </Tile>
            ))
          ) : saved.length === 0 ? <Empty>{savedEmpty(source, lib, 'scripture looks')}</Empty> : saved.map(t => (
            <Tile key={t.id} name={t.name} sub={t.ownerName} onPick={() => onPickSaved?.(t)}>
              {t.thumb
                ? <img src={t.thumb} alt="" className="block w-full" style={{ aspectRatio: '16 / 9', objectFit: 'cover' }} />
                : <ScriptureThumb layoutId={t.look?.layoutId || 'sanctuary'} accent={t.look?.accent} sample={sample} className="w-full" />}
            </Tile>
          ))}
        </div>
      </div>
    </MenuShell>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// Scripture quick bar: look dropdown + Auto-cue switch
// ═════════════════════════════════════════════════════════════════════════════
export const AutoCueSwitch: React.FC<{ className?: string }> = ({ className }) => {
  const on = useSyncExternalStore(subscribeAutoCueNext, getAutoCueNext);
  return (
    <button role="switch" aria-checked={on} onClick={() => setAutoCueNext(!on)} className={`flex items-center gap-1.5 h-8 px-2 rounded-lg text-[10.5px] font-bold flex-none ${className ?? ''}`}
      title={on ? 'On — when a scripture goes to Program, the next verse is cued into Preview. Click to turn off.' : 'Off — click to cue the next verse into Preview automatically whenever a scripture goes to Program.'}
      style={{ background: on ? 'rgba(0,218,243,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${on ? 'rgba(0,218,243,0.4)' : LINE}`, color: on ? '#fff' : 'rgba(255,255,255,0.55)' }}>
      <span className="relative inline-block w-7 h-4 rounded-full transition-colors flex-none" style={{ background: on ? CYAN : 'rgba(255,255,255,0.22)' }}>
        <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all" style={{ left: on ? 14 : 2 }} />
      </span>
      Auto-cue next
    </button>
  );
};

export const ScriptureQuickBar: React.FC<{ sample?: ScriptureSample; className?: string }> = ({ sample, className }) => {
  const look = useSyncExternalStore(subscribeScriptureLook, getScriptureLook);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const layout = scriptureLayoutById(look.layoutId);
  const toggle = () => { setAnchor(anchorOf(btn.current)); setOpen(o => !o); };
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <button ref={btn} onClick={toggle} aria-haspopup="dialog" aria-expanded={open}
        className="flex items-center gap-2 h-8 pl-1 pr-2 rounded-lg text-[11px] font-bold text-white hover:brightness-125 transition-all"
        style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${open ? 'rgba(208,188,255,0.6)' : LINE}` }} title="Change the scripture look — applies to everything you take from now on, and to the verse on air">
        <ScriptureThumb layoutId={look.layoutId} accent={look.accent} sample={sample} className="w-[42px] rounded-[3px] overflow-hidden flex-none" />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[8.5px] font-extrabold uppercase tracking-wider" style={{ color: GOLD }}>Look</span>
          <span className="max-w-[120px] truncate">{layout.name}</span>
        </span>
        <ChevronDown size={13} className="text-white/55" />
      </button>
      <AutoCueSwitch />
      {open && anchor && (
        <ScriptureLookMenu anchor={anchor} onClose={() => setOpen(false)} currentId={look.layoutId} sample={sample} ignoreRef={btn}
          onPick={id => setScriptureLook({ layoutId: id })}
          onPickSaved={t => { applySavedLook(t.look); }} />
      )}
    </div>
  );
};
