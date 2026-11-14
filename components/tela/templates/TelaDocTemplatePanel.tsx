// TelaDocTemplatePanel — the template library for word pages, docked on the right of Tela.
//
// Every tile is a structure dressed in an Art Council theme. Two things can be taken from it:
//   Use theme     the design only (fonts, colours, flourishes) on the pages you already have.
//   Use template  the design AND the structure (page setup and the pages themselves).
// Both land on the open document as one undoable edit. The panel collapses to a tab on the edge.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, LayoutTemplate, Search, X } from 'lucide-react';
import type { TelaDoc } from '../../../types';
import type { TelaOp } from '../telaOps';
import { writerDocumentOf } from '../writer/writerModel';
import { getSharedTextSystem } from '../TelaWriter';
import { COUNCIL_DIRECTORS } from '../../../services/council/councilDirectors';
import { DOC_TEMPLATES, DOC_THEMES, structureById, templateById, themeById } from '../../../services/tela/docTemplates/library';
import { FAMILY_LABEL, type DocTemplate, type DocTheme, type ThemeFamily } from '../../../services/tela/docTemplates/types';
import { pageIsEmpty, templateOp, themeOf, themeOp, writerPages, type TemplateMode } from '../../../services/tela/docTemplates/apply';
import { previewPage, type PagePreview } from '../../../services/tela/docTemplates/preview';

export type ThemeScope = 'page' | 'all';

interface Props {
  doc: TelaDoc | null;
  activeFrameId: string | null;
  readOnly?: boolean;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  onClose: () => void;
  /** Every change is ONE op on the open document (one undo step). `focusFrameId` = the page to show. */
  dispatch: (op: TelaOp, focusFrameId?: string) => void;
  /** Where a first page goes when the document has no paper yet. */
  origin: () => { x: number; y: number };
  /** After a look lands (education records the teacher's choice). */
  onApplied?: (what: { themeId: string | null; templateId?: string }) => void;
  onOpenFullLibrary: () => void;
  onSaveAsTemplate: () => void;
  /** Extra controls under the header (the org / teacher look bar in education). */
  header?: React.ReactNode;
}

const previews = new Map<string, Promise<PagePreview>>();
function loadPreview(t: DocTemplate, pageIndex: number): Promise<PagePreview> {
  const key = `${t.id}:${pageIndex}`;
  let p = previews.get(key);
  if (!p) {
    p = getSharedTextSystem().then(sys => previewPage(sys, structureById(t.structureId)!.pages[pageIndex], themeById(t.themeId)!));
    p.catch(() => previews.delete(key));
    previews.set(key, p);
  }
  return p;
}

function Preview({ t, page = 0, eager }: { t: DocTemplate; page?: number; eager?: boolean }) {
  const theme = themeById(t.themeId)!;
  const [pv, setPv] = useState<PagePreview | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    setPv(null);
    const go = () => void loadPreview(t, page).then(v => { if (live) setPv(v); }).catch(() => {});
    if (eager || !ref.current || typeof IntersectionObserver === 'undefined') { go(); return () => { live = false; }; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '300px' });
    io.observe(ref.current);
    return () => { live = false; io.disconnect(); };
  }, [t, page, eager]);
  return (
    <div ref={ref} aria-hidden style={{ aspectRatio: '816 / 1056', width: '100%', background: theme.palette.paper, borderRadius: 4, overflow: 'hidden', boxShadow: '0 1px 0 rgba(255,255,255,.06), 0 6px 18px rgba(0,0,0,.35)' }}>
      {pv && <svg viewBox={`0 0 ${pv.width} ${pv.height}`} style={{ width: '100%', height: '100%', display: 'block' }} dangerouslySetInnerHTML={{ __html: pv.markup }} />}
    </div>
  );
}

const FAMILIES = Object.keys(FAMILY_LABEL) as ThemeFamily[];
const ledBy = (th: DocTheme) => `${COUNCIL_DIRECTORS[th.director].epithet.replace(/^the /, 'The ')}`;

const btn = (primary: boolean, disabled?: boolean): React.CSSProperties => ({
  fontSize: 11, fontWeight: 800, padding: '6px 9px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: disabled ? 0.45 : 1,
  border: primary ? 0 : '1px solid rgba(255,255,255,.16)', background: primary ? '#6B0099' : 'rgba(255,255,255,.05)', color: '#fff',
});

const newId = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export default function TelaDocTemplatePanel({ doc, activeFrameId, readOnly, collapsed, onCollapse, onClose, dispatch, origin, onApplied, onOpenFullLibrary, onSaveAsTemplate, header }: Props) {
  const [family, setFamily] = useState<ThemeFamily | 'all'>('all');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<ThemeScope>('all');
  const [open, setOpen] = useState<string | null>(null);        // template shown large
  const [asking, setAsking] = useState<string | null>(null);    // template whose "keep my words?" choice is showing
  const [msg, setMsg] = useState<string | null>(null);

  const pages = useMemo(() => (doc ? writerPages(doc) : []), [doc]);
  const activePage = pages.find(p => p.frame.id === activeFrameId) ?? pages[0];
  const hasWords = pages.some(p => !pageIsEmpty(p.device));
  const currentTheme = activePage ? themeOf(activePage.device) : null;
  const locked = !!readOnly || !doc || !!doc.locked;

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return DOC_TEMPLATES.filter(t => (family === 'all' || t.family === family) && (!needle || `${t.name} ${t.blurb} ${themeById(t.themeId)?.name} ${FAMILY_LABEL[t.family]}`.toLowerCase().includes(needle)));
  }, [family, q]);

  useEffect(() => { if (!msg) return; const id = window.setTimeout(() => setMsg(null), 6000); return () => window.clearTimeout(id); }, [msg]);

  const applyTheme = (themeId: string | null) => {
    setAsking(null);
    if (!doc || locked) return;
    const ids = scope === 'page' && activePage && pages.length > 1 ? [activePage.device.id] : pages.map(p => p.device.id);
    const theme = themeById(themeId) ?? null;
    const op = themeOp(doc, theme, ids);
    if (!op) { setMsg('Add a Writer page first, or use a template.'); return; }
    dispatch(op);
    onApplied?.({ themeId: theme?.id ?? null });
    setMsg(theme ? `${theme.name} is on ${ids.length === 1 ? 'this page' : `all ${ids.length} pages`}.` : 'Back to plain pages.');
  };
  const useTheme = (t: DocTemplate) => applyTheme(t.themeId);
  const useTemplate = (t: DocTemplate, mode?: TemplateMode) => {
    if (!doc || locked) return;
    if (!mode && hasWords) { setAsking(t.id); return; }
    setAsking(null);
    const st = structureById(t.structureId)!, th = themeById(t.themeId)!;
    const r = templateOp(doc, st, th, { mode: mode ?? 'fill', uid: newId, origin: origin(), paragraphIds: d => writerDocumentOf(d).story.paragraphs.map(q => q.id) });
    if (!r) return;
    dispatch(r.op, r.focusFrameId);
    onApplied?.({ themeId: th.id, templateId: t.id });
    setMsg(mode === 'restyle' ? `Your ${r.restyled === 1 ? 'page is' : `${r.restyled} pages are`} laid out as ${st.name}. Your words are untouched.`
      : mode === 'append' ? `Added ${r.added === 1 ? 'a page' : `${r.added} pages`} from ${st.name} after yours.`
      : `${st.name} is in your document.`);
  };

  if (collapsed) {
    return (
      <button type="button" data-testid="doc-templates-tab" aria-label="Open templates" aria-expanded={false} onClick={() => onCollapse(false)}
        style={{ position: 'fixed', top: 120, right: 0, zIndex: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 7px', background: '#16121f', border: '1px solid rgba(255,255,255,.14)', borderRight: 0, borderRadius: '12px 0 0 12px', color: '#fff', cursor: 'pointer' }}>
        <LayoutTemplate size={15} />
        <span style={{ writingMode: 'vertical-rl', fontSize: 11, fontWeight: 800, letterSpacing: '.04em' }}>Templates</span>
      </button>
    );
  }

  const shown = open ? DOC_TEMPLATES.find(t => t.id === open) : null;
  const actions = (t: DocTemplate, big?: boolean) => {
    const isCurrent = currentTheme === t.themeId;
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" disabled={locked} style={btn(true, locked)} title="The design and the structure: page setup and this template's pages" onClick={() => useTemplate(t)}>Use template</button>
          <button type="button" disabled={locked || !pages.length} style={btn(false, locked || !pages.length)} title={pages.length ? 'The design only: fonts, colours and flourishes. Your words and layout stay.' : 'Add a Writer page first, or use the template'} onClick={() => useTheme(t)}>{isCurrent ? 'Theme on' : 'Use theme'}</button>
        </div>
        {asking === t.id && (
          <div role="group" aria-label="Your pages already have words" style={{ display: 'grid', gap: 6, padding: 8, borderRadius: 9, background: 'rgba(255,255,255,.06)', fontSize: 11, lineHeight: 1.4, color: 'rgba(255,255,255,.8)' }}>
            Your pages already have words. They stay either way.
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" style={btn(true)} onClick={() => useTemplate(t, 'restyle')}>Lay out my pages this way</button>
              <button type="button" style={btn(false)} onClick={() => useTemplate(t, 'append')}>Add its pages after mine</button>
            </div>
          </div>
        )}
        {big && null}
      </div>
    );
  };

  return (
    <aside aria-label="Templates" data-testid="doc-templates" style={{ position: 'fixed', top: 56, right: 12, bottom: 12, width: 'min(372px, calc(100vw - 24px))', zIndex: 320, display: 'flex', flexDirection: 'column', background: '#16121f', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, color: '#fff', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <LayoutTemplate size={15} />
        <div style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>Templates</div>
        <button type="button" aria-label="Collapse templates" title="Collapse to the edge" onClick={() => onCollapse(true)} style={{ padding: 4, background: 'none', border: 0, color: 'rgba(255,255,255,.6)', cursor: 'pointer' }}><ChevronRight size={16} /></button>
        <button type="button" aria-label="Close templates" onClick={onClose} style={{ padding: 4, background: 'none', border: 0, color: 'rgba(255,255,255,.6)', cursor: 'pointer' }}><X size={15} /></button>
      </div>

      {header}

      {shown ? (() => {
        const th = themeById(shown.themeId)!, st = structureById(shown.structureId)!;
        return (
          <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
            <button type="button" onClick={() => { setOpen(null); setAsking(null); }} style={{ justifySelf: 'start', background: 'none', border: 0, color: 'rgba(255,255,255,.7)', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', padding: 0 }}>‹ All templates</button>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{shown.name}</div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>{st.blurb}</div>
            </div>
            {actions(shown, true)}
            {st.pages.map((p, i) => (
              <figure key={i} style={{ margin: 0, display: 'grid', gap: 4 }}>
                <Preview t={shown} page={i} eager />
                {st.pages.length > 1 && <figcaption style={{ fontSize: 10.5, color: 'rgba(255,255,255,.5)' }}>Page {i + 1} · {p.label}</figcaption>}
              </figure>
            ))}
            <div style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.05)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>Theme · {th.name}</div>
              <div style={{ display: 'flex', gap: 5 }} aria-label="Palette">
                {(['paper', 'ink', 'muted', 'accent', 'accent2'] as const).map(k => <span key={k} title={`${k} ${th.palette[k]}`} style={{ width: 22, height: 22, borderRadius: 6, background: th.palette[k], border: '1px solid rgba(255,255,255,.2)' }} />)}
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(255,255,255,.78)' }}>{th.note}</div>
              <div style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(255,255,255,.55)' }}>
                Art Council · led by {ledBy(th)}{th.counterpoint ? `, with ${COUNCIL_DIRECTORS[th.counterpoint].epithet} in counterpoint` : ''}. {th.fonts.display === th.fonts.body ? th.fonts.body : `${th.fonts.display} with ${th.fonts.body}`}. You’d know it by {th.signature}.
              </div>
            </div>
          </div>
        );
      })() : (
        <>
          <div style={{ padding: '8px 10px 4px', display: 'grid', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: '5px 8px' }}>
              <Search size={12} color="rgba(255,255,255,.45)" />
              <input aria-label="Search templates" value={q} onChange={e => setQ(e.target.value)} placeholder="Search templates" style={{ width: '100%', background: 'none', border: 0, outline: 'none', color: '#fff', fontSize: 12 }} />
            </label>
            <div role="group" aria-label="Kind of document" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(['all', ...FAMILIES] as const).map(f => (
                <button key={f} type="button" aria-pressed={family === f} onClick={() => setFamily(f)} style={{ fontSize: 10.5, fontWeight: 800, padding: '4px 8px', borderRadius: 99, border: 0, cursor: 'pointer', background: family === f ? '#fff' : 'rgba(255,255,255,.08)', color: family === f ? '#16121f' : 'rgba(255,255,255,.75)' }}>{f === 'all' ? 'All' : FAMILY_LABEL[f]}</button>
              ))}
            </div>
            {pages.length > 1 && (
              <div role="group" aria-label="Where a theme goes" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'rgba(255,255,255,.55)' }}>
                Theme goes on
                {(['all', 'page'] as const).map(s => <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)} style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 7, border: 0, cursor: 'pointer', background: scope === s ? 'rgba(255,255,255,.18)' : 'transparent', color: '#fff' }}>{s === 'all' ? `All ${pages.length} pages` : 'This page'}</button>)}
              </div>
            )}
          </div>
          {msg && <div role="status" style={{ margin: '4px 10px', fontSize: 11, lineHeight: 1.45, color: '#d9f7e6', background: 'rgba(6,214,160,.12)', padding: '6px 8px', borderRadius: 8 }}>{msg}</div>}
          {locked && doc && <div role="note" style={{ margin: '4px 10px', fontSize: 11, lineHeight: 1.45, color: 'rgba(255,255,255,.7)', background: 'rgba(255,255,255,.05)', padding: '6px 8px', borderRadius: 8 }}>This document is locked. Unlock it to change its look.</div>}
          <div style={{ flex: 1, overflow: 'auto', padding: '6px 10px 10px', display: 'grid', gap: 10, alignContent: 'start' }}>
            {!list.length && <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', textAlign: 'center', padding: '28px 16px' }}>Nothing matches that search.</p>}
            {list.map(t => {
              const th = themeById(t.themeId)!;
              return (
                <div key={t.id} data-template={t.id} style={{ display: 'grid', gridTemplateColumns: '104px 1fr', gap: 10, padding: 8, borderRadius: 11, background: 'rgba(255,255,255,.04)', outline: currentTheme === t.themeId ? '1px solid rgba(208,188,255,.55)' : undefined }}>
                  <button type="button" aria-label={`Look closer at ${t.name}`} onClick={() => { setOpen(t.id); setAsking(null); }} style={{ all: 'unset', cursor: 'zoom-in', display: 'block' }}><Preview t={t} /></button>
                  <div style={{ display: 'grid', gap: 5, alignContent: 'start', minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25 }}>{t.name}</div>
                    <div style={{ fontSize: 10.5, lineHeight: 1.4, color: 'rgba(255,255,255,.58)' }}>{t.blurb}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.42)' }}>{th.name} · {ledBy(th)}</div>
                    {actions(t)}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
            <button type="button" disabled={locked || !currentTheme} style={btn(false, locked || !currentTheme)} title="Take the theme off and go back to plain pages" onClick={() => applyTheme(null)}>Plain pages</button>
            <span style={{ flex: 1 }} />
            <button type="button" disabled={!doc} style={btn(false, !doc)} onClick={onSaveAsTemplate}>Save as template…</button>
            <button type="button" style={btn(false)} title="Posters, flyers, slides, publications, your org’s templates and your own" onClick={onOpenFullLibrary}>All designs…</button>
          </div>
          <div style={{ padding: '0 10px 8px', fontSize: 10, color: 'rgba(255,255,255,.4)' }}>{DOC_TEMPLATES.length} templates in {DOC_THEMES.length} Art Council themes. Ctrl+Z takes a change back.</div>
        </>
      )}
    </aside>
  );
}
