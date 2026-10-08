import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Search, Undo2, Redo2, ZoomIn, ZoomOut, MousePointer2, Pen, Pencil, Highlighter, Eraser, Lasso, Type, Image as ImageIcon, Table2, Mic, Square, BookOpen, FlaskConical, Printer, ExternalLink, Trash2, Wand2, PanelLeft, Hand, X, Loader2, Camera, Pin } from 'lucide-react';
import type { TelaDoc, TelaFrame, TelaDevice } from '../../types';
import { applyTelaOp } from '../tela/telaOps';
import { makeBlock } from '../tela/TelaWriter';
import PageCanvas from './PageCanvas';
import type { NoteTool } from '../ink';
import MediaFinder from '../media/MediaFinder';
import {
  loadNotes, createPage, createNotebook, createSection, ensureSubjectNotebook, upgradeLegacy, loadPageDoc, savePage, updatePageMeta, deletePage, takeNotesIntent, generalKey, type LoadedNotes,
  readReaderNotes, syncReaderNotes, subscribeReaderNotes,
} from '../../services/notesService';
import { searchPages, inkDeviceOf, notebookForSubject, TEMPLATES, PAGE_W, PAGE_H, PALETTE, UNFILED_NOTEBOOK, UNFILED_SECTION, type PageMeta, type PageTemplate } from '../../services/notesStructure';
import { mergeReaderNotes, SCRIPTURE_NOTEBOOK } from '../../services/notesScripture';
import ReaderNotesPage from './ReaderNotesPage';
import { boundsOf, type InkStyle, type Box } from '../../services/inkMath';
import { uploadTelaAsset } from '../../services/telaAssets';
import { transcribeHandwritingCrop } from '../../services/handwritingTranscription';
import { listInvestigations } from '../../services/investigationService';
import { parseRef, formatRef } from '../../services/scriptureRef';
import { fetchRefText } from '../../services/scriptureText';
import { COURSES } from '../../services/courseCatalog';
import type { MediaAsset } from '../../services/lessonMedia';

/**
 * Plajah Notes: a OneNote / Samsung Notes style notebook for every student, built on the notebook
 * every Plajah user already has and powered by Tela. Notebooks hold sections hold pages; each page is
 * a Tela document with ink (pressure-sensitive pen, pencil, highlighter, eraser, lasso), typed text
 * boxes, images, tables, audio and platform inserts (archive photos with credits, Vault audio,
 * scripture, investigations, lessons). Handwriting can be converted to text on this device.
 */
interface Props { user?: any; profile?: any; onNavigate: (view: string) => void; onBack?: () => void }

const COLORS = ['#111827', '#1d4ed8', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04'];
const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const newId = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const NotesStudio: React.FC<Props> = ({ user, profile, onNavigate, onBack }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const [notes, setNotes] = useState<LoadedNotes | null>(null);
  const [nbId, setNbId] = useState<string>(UNFILED_NOTEBOOK);
  const [secId, setSecId] = useState<string>(UNFILED_SECTION);
  const [page, setPage] = useState<PageMeta | null>(null);
  const [doc, setDoc] = useState<TelaDoc | null>(null);
  const [past, setPast] = useState<TelaDoc[]>([]); const [future, setFuture] = useState<TelaDoc[]>([]);
  const [tool, setTool] = useState<NoteTool>('pen');
  const [style, setStyle] = useState<InkStyle>({ color: COLORS[0], size: 2.4, tool: 'pen' });
  const [fingerDraws, setFingerDraws] = useState(false);
  const [zoom, setZoom] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 900 ? Math.max(0.4, (window.innerWidth - 24) / PAGE_W) : 1));
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState(true);
  const [drawer, setDrawer] = useState<null | 'media' | 'scripture' | 'investigation' | 'templates'>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set()); const [lassoBox, setLassoBox] = useState<Box | null>(null);
  const [status, setStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [msg, setMsg] = useState('');
  const [recording, setRecording] = useState<null | { rec: MediaRecorder; chunks: Blob[] }>(null);
  const [converting, setConverting] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingInk = useRef('');
  const fileInput = useRef<HTMLInputElement>(null);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  // ── Load + open ─────────────────────────────────────────────────────────
  const reload = useCallback(async () => { const n = await loadNotes(uid); setNotes(n); return n; }, [uid]);
  useEffect(() => { void reload(); }, [reload]);
  // Notes written in Lectio / the Sacred Library show up live; pull their account copies once on open.
  useEffect(() => {
    const refresh = () => setNotes(n => (n ? mergeReaderNotes(n, readReaderNotes()) : n));
    const off = subscribeReaderNotes(refresh);
    void syncReaderNotes().then(refresh);
    return off;
  }, [uid]);

  const openPage = useCallback(async (p: PageMeta, n?: LoadedNotes) => {
    if (p.reader) {
      if (status !== 'saved' && doc && page && !page.reader && notes) { const add = pendingInk.current; pendingInk.current = ''; void savePage(uid, page, doc, notes.bucketOf(page.id), add).catch(() => {}); }
      setPage(p); setDoc(null); setPast([]); setFuture([]); setSelection(new Set()); setLassoBox(null); setStatus('saved'); setNbId(p.notebookId); setSecId(p.sectionId);
      if (typeof window !== 'undefined' && window.innerWidth < 900) setPanel(false);
      return;
    }
    const bucket = (n || notes)?.bucketOf(p.id) || generalKey(uid);
    let meta = p; let d: TelaDoc | null = null;
    if (p.legacy || !p.telaDocId) { const up = await upgradeLegacy(uid, p, bucket); meta = up.page; d = up.doc; } else d = await loadPageDoc(p.telaDocId);
    if (!d) { const fresh = await createPage(uid, { notebookId: p.notebookId, sectionId: p.sectionId, title: p.title, template: p.template }); meta = fresh.page; d = fresh.doc; }
    setPage(meta); setDoc(d); setPast([]); setFuture([]); setSelection(new Set()); setLassoBox(null); setStatus('saved'); setNbId(meta.notebookId); setSecId(meta.sectionId);
    if (typeof window !== 'undefined' && window.innerWidth < 900) setPanel(false);
    void reload();
  }, [notes, uid, reload, status, doc, page]);

  const newPage = useCallback(async (opts: { notebookId?: string; sectionId?: string; title?: string; template?: PageTemplate; heading?: string; lines?: string[]; source?: PageMeta['source'] } = {}) => {
    const n = notes || await reload();
    // The Scripture & Sacred Texts notebook mirrors the readers; your own pages go to Quick notes.
    const want = opts.notebookId || nbId; const nb = want === SCRIPTURE_NOTEBOOK ? UNFILED_NOTEBOOK : want;
    const sec = (want === nb && opts.sectionId) || (n.sections.find(s => s.notebookId === nb)?.id) || UNFILED_SECTION;
    const { page: p, doc: d } = await createPage(uid, { notebookId: nb, sectionId: sec, title: opts.title || 'Untitled page', template: opts.template || 'lined', heading: opts.heading, lines: opts.lines, source: opts.source });
    const nn = await reload(); setPage(p); setDoc(d); setPast([]); setFuture([]); setNbId(p.notebookId); setSecId(p.sectionId); setStatus('saved');
    if (nn) setNotes(nn);
  }, [notes, nbId, uid, reload]);

  // A lesson can hand off a request to start notes on it.
  const intentDone = useRef(false);
  useEffect(() => {
    if (!notes || intentDone.current) return; const i = takeNotesIntent(); intentDone.current = true;
    if (!i) { if (!page && notes.pages[0]) void openPage(notes.pages[0], notes); return; }
    (async () => {
      const place = await ensureSubjectNotebook(uid, notebookForSubject(i.subject), notes);
      await reload();
      await newPage({ ...place, title: `Notes: ${i.title}`, template: 'cornell', heading: i.title, lines: [`From ${i.courseTitle}`, 'Key ideas:'], source: { label: `${i.courseTitle}: ${i.title}`, courseId: i.courseId, lessonId: i.lessonId } });
    })();
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Editing, history, autosave ─────────────────────────────────────────────
  const onDoc = (next: TelaDoc, history = true) => {
    if (!doc) return; if (history) { setPast(p => [...p.slice(-49), doc]); setFuture([]); }
    setDoc(next); setStatus('dirty');
  };
  const commit = () => { /* a drag/resize finished: its start state is already in `past` via the first history push */ };
  const undo = () => { if (!past.length || !doc) return; setFuture(f => [doc, ...f]); setDoc(past[past.length - 1]); setPast(p => p.slice(0, -1)); setStatus('dirty'); };
  const redo = () => { if (!future.length || !doc) return; setPast(p => [...p, doc]); setDoc(future[0]); setFuture(f => f.slice(1)); setStatus('dirty'); };

  useEffect(() => {
    if (status !== 'dirty' || !doc || !page || !notes) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setStatus('saving');
      const add = pendingInk.current; pendingInk.current = '';
      const meta = await savePage(uid, page, doc, notes.bucketOf(page.id), add).catch(() => page);
      setPage(meta); setStatus('saved'); setNotes(n => (n ? { ...n, pages: n.pages.map(p => (p.id === meta.id ? meta : p)) } : n));
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [doc, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Adding things to the page ───────────────────────────────────────────────
  const nextY = (d: TelaDoc) => d.frames.filter(f => !f.deviceIds.some(id => d.devices[id]?.type === 'VECTOR')).reduce((m, f) => Math.max(m, f.y + Math.max(f.h, 60)), 150) + 16;
  const addFrame = (device: TelaDevice, label: string, w = PAGE_W - 112, h = 100, at?: { x: number; y: number }) => {
    if (!doc) return; const frame: TelaFrame = { id: newId('frame'), kind: 'BOARD', preset: 'FREE', x: at?.x ?? 56, y: at?.y ?? nextY(doc), w, h, deviceIds: [device.id], label };
    onDoc(applyTelaOp(doc, { type: 'ADD_FRAME', frame, devices: [device] }));
  };
  const addText = (lines: string[], label = 'Text', heading?: string, at?: { x: number; y: number }) => addFrame({ id: newId('writer'), type: 'WRITER', mode: 'NOTES', blocks: [...(heading ? [makeBlock('h2', heading)] : []), ...lines.map(l => makeBlock('p', l))] }, label, 420, 80 + lines.length * 24, at);
  const addMedia = async (file: File) => {
    try {
      const up = await uploadTelaAsset(file); const kind = file.type.startsWith('audio') ? 'AUDIO' : file.type.startsWith('video') ? 'VIDEO' : 'IMAGE';
      let w = 360, h = 240; if (kind === 'IMAGE') { const dim = await new Promise<{ w: number; h: number }>(r => { const im = new Image(); im.onload = () => r({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => r({ w: 360, h: 240 }); im.src = up.src; }); const s = Math.min(1, 380 / dim.w); w = Math.round(dim.w * s); h = Math.round(dim.h * s); }
      addFrame({ id: newId('media'), type: 'MEDIA', kind, name: file.name, src: up.src, mimeType: file.type, size: file.size, width: w, height: h, storagePath: up.storagePath, sessionOnly: up.sessionOnly } as TelaDevice, file.name, w, kind === 'AUDIO' ? 70 : h);
      if (up.sessionOnly) flash('Added for this session. Sign in to keep uploaded files.');
    } catch { flash('That file could not be added.'); }
  };
  const addAsset = (a: MediaAsset) => {
    if (!doc) return; const y = nextY(doc);
    const device = { id: newId('media'), type: 'MEDIA', kind: a.kind === 'audio' ? 'AUDIO' : 'IMAGE', name: a.title, src: a.url, mimeType: a.kind === 'audio' ? 'audio/mpeg' : 'image/jpeg', size: 0, width: 360, height: a.kind === 'audio' ? 70 : 240 } as TelaDevice;
    const media: TelaFrame = { id: newId('frame'), kind: 'BOARD', preset: 'FREE', x: 56, y, w: 360, h: a.kind === 'audio' ? 70 : 240, deviceIds: [device.id], label: a.title };
    const wid = newId('writer'); const credit: TelaDevice = { id: wid, type: 'WRITER', mode: 'NOTES', blocks: [makeBlock('p', `${a.title}. ${a.attribution}`)] };
    const cf: TelaFrame = { id: newId('frame'), kind: 'BOARD', preset: 'FREE', x: 56, y: y + (a.kind === 'audio' ? 76 : 246), w: 360, h: 60, deviceIds: [wid], label: 'Credit' };
    let d = applyTelaOp(doc, { type: 'ADD_FRAME', frame: media, devices: [device] }); d = applyTelaOp(d, { type: 'ADD_FRAME', frame: cf, devices: [credit] }); onDoc(d);
  };
  const addTable = () => addFrame({ id: newId('grid'), type: 'GRID', rows: 5, cols: 4, cells: {} }, 'Table', 460, 180);

  const [ref, setRef] = useState(''); const [scriptureErr, setScriptureErr] = useState('');
  const addScripture = async () => {
    const r = parseRef(ref); if (!r) { setScriptureErr('That does not look like a scripture reference. Try John 3:16.'); return; }
    const res = await fetchRefText(r, 'kjv', 12).catch(() => null); if (!res) { setScriptureErr('The text could not be loaded right now.'); return; }
    addText([res.text, `${formatRef(r, 'display')} (${res.translation})`], 'Scripture'); setDrawer(null); setRef(''); setScriptureErr('');
  };
  const addInvestigation = (i: ReturnType<typeof listInvestigations>[number]) => {
    const f = i.fields; addText([f.question || f.problem || '', f.hypothesis ? `Hypothesis: ${f.hypothesis}` : '', i.cer.claim ? `Claim: ${i.cer.claim}` : '', i.cer.evidence ? `Evidence: ${i.cer.evidence}` : '', i.cer.reasoning ? `Reasoning: ${i.cer.reasoning}` : '', i.table.rows.length ? `Data: ${i.table.rows.length} rows (${i.table.headers.join(', ')})` : ''].filter(Boolean), 'Investigation', i.title || 'Investigation'); setDrawer(null);
  };

  // Audio recording
  const toggleRecord = async () => {
    if (recording) { recording.rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const rec = new MediaRecorder(stream); const chunks: Blob[] = [];
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = async () => { stream.getTracks().forEach(t => t.stop()); setRecording(null); const type = rec.mimeType || 'audio/webm'; await addMedia(new File([new Blob(chunks, { type })], `Recording ${new Date().toLocaleTimeString()}.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type })); };
      rec.start(); setRecording({ rec, chunks });
    } catch { flash('The microphone is not available. Check your browser permissions.'); }
  };

  // Ink -> text
  const convertInk = async () => {
    if (!doc || !selection.size) return; const ink = inkDeviceOf(doc); if (!ink) return;
    const strokes = ink.objects.filter(o => selection.has(o.id) && o.points); const b = boundsOf(strokes.flatMap(s => s.points!), 10);
    const cv = document.createElement('canvas'); cv.width = Math.max(16, Math.round(b.w)); cv.height = Math.max(16, Math.round(b.h)); const c = cv.getContext('2d')!;
    c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#000';
    for (const s of strokes) { c.lineWidth = Math.max(2, s.strokeWidth); c.beginPath(); s.points!.forEach((v, i) => { if (i % 2 === 0) { const x = v - b.x, y = s.points![i + 1] - b.y; i === 0 ? c.moveTo(x, y) : c.lineTo(x, y); } }); c.stroke(); }
    setConverting('Preparing the on-device handwriting model (first time only)…');
    const out = await transcribeHandwritingCrop(cv.toDataURL('image/png'), p => setConverting(p.message)); setConverting('');
    if (!out.text) { flash('I could not read that handwriting. Try a clearer line, one line at a time.'); return; }
    addText([out.text], 'Converted text', undefined, { x: Math.max(0, b.x), y: Math.max(0, b.y) });
    pendingInk.current = `${pendingInk.current} ${out.text}`.trim(); setStatus('dirty');
    flash(`Converted: “${out.text.slice(0, 60)}”${out.confidence < 0.4 ? ' (low confidence, please check it)' : ''}`);
  };
  const deleteSelection = () => { if (!doc) return; const ink = inkDeviceOf(doc); if (!ink) return; onDoc(applyTelaOp(doc, { type: 'REPLACE_VECTOR_OBJECTS', deviceId: ink.id, objects: ink.objects.filter(o => !selection.has(o.id)) })); setSelection(new Set()); setLassoBox(null); };

  const pickTool = (t: NoteTool) => { setTool(t); if (t === 'pen' || t === 'pencil' || t === 'highlighter') setStyle(s => ({ ...s, tool: t, size: t === 'highlighter' ? 3 : t === 'pencil' ? 2 : 2.4 })); if (t !== 'lasso') { setSelection(new Set()); setLassoBox(null); } };
  const printPage = () => { document.body.classList.add('notes-printing'); setTimeout(() => { window.print(); document.body.classList.remove('notes-printing'); }, 60); };
  const openInTela = () => { if (page?.telaDocId) try { window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: page.telaDocId } })); } catch { /* */ } };

  // ── Derived lists ──────────────────────────────────────────────────────────
  const sections = useMemo(() => (notes?.sections || []).filter(s => s.notebookId === nbId), [notes, nbId]);
  const pagesHere = useMemo(() => { if (!notes) return []; const all = query.trim() ? searchPages(notes.pages, query) : notes.pages.filter(p => p.sectionId === secId); return all; }, [notes, secId, query]);
  const nb = notes?.notebooks.find(n => n.id === nbId);
  const livePage = page?.reader ? notes?.pages.find(p => p.id === page.id) : undefined;

  const toolBtn = (t: NoteTool, Icon: React.ElementType, label: string) => (
    <button key={t} type="button" aria-pressed={tool === t} aria-label={label} title={label} onClick={() => pickTool(t)} className={`w-9 h-9 rounded-xl grid place-items-center ${tool === t ? 'bg-white text-[#12091b]' : 'text-white/70 hover:bg-white/10'}`}><Icon size={17} /></button>
  );

  return (
    <div className="h-full min-h-[600px] flex bg-[#0a0a0f] text-white" style={{ minHeight: '100%' }}>
      <style>{`@media print{body.notes-printing *{visibility:hidden!important}body.notes-printing [data-page],body.notes-printing [data-page] *{visibility:visible!important}body.notes-printing [data-page]{position:fixed;left:0;top:0;transform:none!important;box-shadow:none!important}}`}</style>

      {/* Sidebar */}
      {panel && (
        <aside className="w-72 shrink-0 border-r border-white/10 bg-[#0e0b16] flex flex-col max-h-screen sticky top-0 absolute lg:static z-40 h-full">
          <div className="p-3 flex items-center gap-2 border-b border-white/10">{onBack && <button type="button" onClick={onBack} aria-label="Back" className="w-8 h-8 rounded-full grid place-items-center hover:bg-white/10"><ArrowLeft size={16} /></button>}<p className="text-[11px] font-black uppercase tracking-[0.25em] text-[#00DAF3] flex-1">Plajah Notes</p><button type="button" aria-label="Hide the page list" onClick={() => setPanel(false)} className="w-8 h-8 rounded-full grid place-items-center hover:bg-white/10 lg:hidden"><X size={15} /></button></div>
          <div className="p-3 border-b border-white/10 grid gap-2">
            <label className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search all notes" aria-label="Search all notes" className="w-full rounded-full bg-white/[0.06] border border-white/10 pl-9 pr-3 py-2 text-[12px] placeholder:text-white/35" /></label>
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Notebooks">
              {(notes?.notebooks || []).map(n => <button key={n.id} type="button" role="tab" aria-selected={nbId === n.id} onClick={() => { setNbId(n.id); setSecId((notes?.sections.find(s => s.notebookId === n.id)?.id) || UNFILED_SECTION); setQuery(''); }} className={`px-2.5 py-1 rounded-full text-[11px] font-black whitespace-nowrap border ${nbId === n.id ? 'bg-white text-black border-white' : 'border-white/15 text-white/65 hover:bg-white/10'}`}>{n.emoji} {n.title}</button>)}
              <button type="button" aria-label="New notebook" onClick={async () => { const t = window.prompt('Notebook name'); if (t?.trim()) { const id = await createNotebook(uid, t.trim()); await reload(); setNbId(id); } }} className="px-2 py-1 rounded-full text-[11px] border border-dashed border-white/25 text-white/60"><Plus size={12} /></button>
            </div>
            {nb && <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Sections">
              {sections.map(s => <button key={s.id} type="button" role="tab" aria-selected={secId === s.id} onClick={() => { setSecId(s.id); setQuery(''); }} className={`px-2.5 py-1 rounded-t-lg text-[11px] font-black ${secId === s.id ? 'text-black' : 'text-white/70 bg-white/5 hover:bg-white/10'}`} style={secId === s.id ? { background: s.color } : { borderBottom: `2px solid ${s.color}` }}>{s.title}</button>)}
              {nbId !== UNFILED_NOTEBOOK && nbId !== SCRIPTURE_NOTEBOOK && <button type="button" aria-label="New section" onClick={async () => { const t = window.prompt('Section name'); if (t?.trim()) { const id = await createSection(uid, nbId, t.trim(), PALETTE[sections.length % PALETTE.length]); await reload(); setSecId(id); } }} className="px-2 py-1 rounded-t-lg text-[11px] border border-dashed border-white/25 text-white/60"><Plus size={12} /></button>}
            </div>}
          </div>
          <div className="flex-1 overflow-y-auto p-2 grid gap-1 content-start">
            {notes === null && <p className="text-[12px] text-white/45 p-3">Loading your notes…</p>}
            {notes && pagesHere.length === 0 && <p className="text-[12px] text-white/45 p-3">{query ? 'Nothing matches that search.' : 'No pages in this section yet.'}</p>}
            {pagesHere.map(p => (
              <button key={p.id} type="button" onClick={() => void openPage(p)} className={`text-left rounded-xl px-3 py-2 ${page?.id === p.id ? 'bg-white/12' : 'hover:bg-white/[0.06]'}`}>
                <p className="text-[13px] font-black truncate flex items-center gap-1.5">{p.pinned && <Pin size={11} className="text-amber-300 shrink-0" />}{p.title}</p>
                <p className="text-[11px] text-white/45 truncate">{strip(p.text).slice(0, 70) || 'Empty page'}</p>
                <p className="text-[10px] text-white/30">{p.reader ? `${p.reader.items.length} ${p.reader.kind === 'research' ? 'research entr' + (p.reader.items.length === 1 ? 'y' : 'ies') : 'note' + (p.reader.items.length === 1 ? '' : 's')} · ${p.reader.kind === 'verse' ? 'Lectio' : p.reader.kind === 'sacred' ? 'Sacred Library' : 'Research notebook'}` : <>{new Date(p.updatedAt || p.createdAt).toLocaleDateString()}{p.legacy ? ' · older note' : ''}</>}</p>
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-white/10"><button type="button" onClick={() => void newPage()} className="w-full rounded-full bg-[#00DAF3] text-black text-[12px] font-black py-2.5 inline-flex items-center justify-center gap-1.5"><Plus size={14} /> New page</button></div>
        </aside>
      )}

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {page?.reader && livePage?.reader ? (
          <ReaderNotesPage page={livePage} panel={panel} onShowPanel={() => setPanel(true)} zoom={zoom} />
        ) : !doc || !page ? (
          <div className="flex-1 grid place-items-center p-8 text-center"><div><p className="text-xl font-black mb-1">Plajah Notes</p><p className="text-sm text-white/55 mb-4 max-w-sm">Write, draw and clip from your lessons. Pick a page, or start a new one.</p><div className="flex gap-2 justify-center">{!panel && <button type="button" onClick={() => setPanel(true)} className="rounded-full border border-white/20 px-4 py-2 text-[12px] font-black">Show pages</button>}<button type="button" onClick={() => void newPage()} className="rounded-full bg-[#00DAF3] text-black px-5 py-2 text-[12px] font-black">New page</button></div></div></div>
        ) : (
          <>
            {/* Top bar */}
            <div className="sticky top-0 z-30 bg-[#0e0b16]/95 backdrop-blur border-b border-white/10 px-3 py-2 grid gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {!panel && <button type="button" aria-label="Show pages" onClick={() => setPanel(true)} className="w-9 h-9 rounded-xl grid place-items-center hover:bg-white/10"><PanelLeft size={17} /></button>}
                <input value={doc.title} onChange={e => { setDoc({ ...doc, title: e.target.value }); setStatus('dirty'); }} aria-label="Page title" placeholder="Page title" className="flex-1 min-w-[140px] bg-transparent text-[16px] font-black outline-none border-b border-transparent focus:border-white/30" />
                <span className="text-[11px] text-white/45 w-16 text-right">{status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Editing…'}</span>
                <button type="button" aria-label="Undo" disabled={!past.length} onClick={undo} className="w-9 h-9 rounded-xl grid place-items-center hover:bg-white/10 disabled:opacity-30"><Undo2 size={16} /></button>
                <button type="button" aria-label="Redo" disabled={!future.length} onClick={redo} className="w-9 h-9 rounded-xl grid place-items-center hover:bg-white/10 disabled:opacity-30"><Redo2 size={16} /></button>
                <button type="button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.35, +(z - 0.1).toFixed(2)))} className="w-9 h-9 rounded-xl grid place-items-center hover:bg-white/10"><ZoomOut size={16} /></button>
                <span className="text-[11px] text-white/55 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button type="button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))} className="w-9 h-9 rounded-xl grid place-items-center hover:bg-white/10"><ZoomIn size={16} /></button>
                <button type="button" aria-label="Print or save as PDF" onClick={printPage} className="w-9 h-9 rounded-xl grid place-items-center hover:bg-white/10"><Printer size={16} /></button>
                <button type="button" aria-label="Open in Tela" title="Open this page in the full Tela editor" onClick={openInTela} className="w-9 h-9 rounded-xl grid place-items-center hover:bg-white/10"><ExternalLink size={16} /></button>
                <button type="button" aria-label="Pin page" aria-pressed={page.pinned} onClick={async () => { if (notes) { const m = await updatePageMeta(uid, page, notes.bucketOf(page.id), { pinned: !page.pinned }); setPage(m); void reload(); } }} className={`w-9 h-9 rounded-xl grid place-items-center hover:bg-white/10 ${page.pinned ? 'text-amber-300' : ''}`}><Pin size={16} /></button>
                <button type="button" aria-label="Delete this page" onClick={async () => { if (notes && window.confirm('Delete this page? This cannot be undone.')) { await deletePage(uid, page, notes.bucketOf(page.id)); setPage(null); setDoc(null); await reload(); } }} className="w-9 h-9 rounded-xl grid place-items-center hover:bg-rose-500/20 text-rose-300"><Trash2 size={16} /></button>
              </div>
              {/* Tools */}
              <div className="flex items-center gap-1 flex-wrap" role="toolbar" aria-label="Drawing and insert tools">
                {toolBtn('select', MousePointer2, 'Select and move boxes')}{toolBtn('pen', Pen, 'Pen')}{toolBtn('pencil', Pencil, 'Pencil')}{toolBtn('highlighter', Highlighter, 'Highlighter')}{toolBtn('eraser', Eraser, 'Eraser')}{toolBtn('lasso', Lasso, 'Lasso select')}{toolBtn('text', Type, 'Text box: tap the page')}
                <span className="w-px h-6 bg-white/15 mx-1" />
                {COLORS.map(c => <button key={c} type="button" aria-label={`Ink colour ${c}`} aria-pressed={style.color === c} onClick={() => setStyle(s => ({ ...s, color: c }))} className={`w-6 h-6 rounded-full border-2 ${style.color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />)}
                <input type="range" min={1} max={12} step={0.5} value={style.size} onChange={e => setStyle(s => ({ ...s, size: +e.target.value }))} aria-label="Pen thickness" className="w-20 mx-1" />
                <button type="button" aria-pressed={fingerDraws} onClick={() => setFingerDraws(f => !f)} title="Let a finger draw (otherwise a finger scrolls and a stylus draws)" className={`px-2.5 h-8 rounded-full text-[11px] font-black inline-flex items-center gap-1 ${fingerDraws ? 'bg-white text-black' : 'bg-white/8 text-white/70'}`}><Hand size={12} /> Finger draws</button>
                <span className="w-px h-6 bg-white/15 mx-1" />
                <button type="button" aria-label="Insert image or file" title="Image, audio or video file" onClick={() => fileInput.current?.click()} className="w-9 h-9 rounded-xl grid place-items-center text-white/70 hover:bg-white/10"><ImageIcon size={17} /></button>
                <input ref={fileInput} type="file" accept="image/*,audio/*,video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void addMedia(f); e.currentTarget.value = ''; }} />
                <button type="button" aria-label="Insert table" title="Table" onClick={addTable} className="w-9 h-9 rounded-xl grid place-items-center text-white/70 hover:bg-white/10"><Table2 size={17} /></button>
                <button type="button" aria-label={recording ? 'Stop recording' : 'Record audio'} title={recording ? 'Stop recording' : 'Record audio'} onClick={toggleRecord} className={`w-9 h-9 rounded-xl grid place-items-center ${recording ? 'bg-rose-500 text-white animate-pulse' : 'text-white/70 hover:bg-white/10'}`}>{recording ? <Square size={15} /> : <Mic size={17} />}</button>
                <button type="button" onClick={() => setDrawer('media')} className="px-2.5 h-8 rounded-full text-[11px] font-black bg-white/8 text-white/80 hover:bg-white/15 inline-flex items-center gap-1"><Camera size={12} /> Photos & Vault</button>
                <button type="button" onClick={() => setDrawer('scripture')} className="px-2.5 h-8 rounded-full text-[11px] font-black bg-white/8 text-white/80 hover:bg-white/15 inline-flex items-center gap-1"><BookOpen size={12} /> Scripture</button>
                <button type="button" onClick={() => setDrawer('investigation')} className="px-2.5 h-8 rounded-full text-[11px] font-black bg-white/8 text-white/80 hover:bg-white/15 inline-flex items-center gap-1"><FlaskConical size={12} /> Investigation</button>
                <button type="button" onClick={() => setDrawer('templates')} className="px-2.5 h-8 rounded-full text-[11px] font-black bg-white/8 text-white/80 hover:bg-white/15">Paper</button>
              </div>
              {selection.size > 0 && (
                <div className="flex items-center gap-2 text-[12px] bg-[#00DAF3]/10 border border-[#00DAF3]/30 rounded-xl px-3 py-1.5">
                  <span className="font-black text-[#7deefb]">{selection.size} stroke{selection.size === 1 ? '' : 's'} selected</span>
                  <button type="button" onClick={() => void convertInk()} disabled={!!converting} className="rounded-full bg-[#00DAF3] text-black font-black px-3 py-1 inline-flex items-center gap-1"><Wand2 size={12} /> Convert to text</button>
                  <button type="button" onClick={deleteSelection} className="rounded-full border border-white/20 font-black px-3 py-1">Delete</button>
                  {converting && <span className="text-white/60 inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {converting}</span>}
                </div>
              )}
              {page.source && <p className="text-[11px] text-white/45">From {page.source.label}</p>}
              {msg && <p role="status" className="text-[12px] text-[#06D6A0]">{msg}</p>}
            </div>

            {/* Page */}
            <div className="flex-1 overflow-auto p-3 sm:p-6" style={{ background: 'radial-gradient(circle at 50% 0%,#1a1228,#0a0a0f 60%)' }}>
              <PageCanvas doc={doc} template={page.template} tool={tool} style={style} fingerDraws={fingerDraws} zoom={zoom} selection={selection} onSelection={setSelection} onLassoBox={setLassoBox}
                onDoc={onDoc} onCommit={commit} onToolDone={() => setTool('select')} />
            </div>
          </>
        )}
      </main>

      {/* Drawers */}
      {drawer && (
        <div role="dialog" aria-modal="true" aria-label="Insert" className="fixed inset-0 z-[260] bg-black/60 flex justify-end" onClick={() => setDrawer(null)}>
          <div className="w-full max-w-md h-full overflow-y-auto bg-[#0e0b16] border-l border-white/10 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center mb-3"><h2 className="font-black text-lg flex-1">{drawer === 'media' ? 'Photos, art and Vault audio' : drawer === 'scripture' ? 'Add scripture' : drawer === 'investigation' ? 'Add an investigation' : 'Paper'}</h2><button type="button" aria-label="Close" onClick={() => setDrawer(null)} className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10"><X size={18} /></button></div>
            {drawer === 'media' && <MediaFinder chosen={[]} onAdd={a => { addAsset(a); }} />}
            {drawer === 'scripture' && (
              <div className="grid gap-2"><input value={ref} onChange={e => { setRef(e.target.value); setScriptureErr(''); }} placeholder="e.g. Psalm 23:1-4" aria-label="Scripture reference" className="rounded-xl bg-black/30 border border-white/15 px-3 py-2 text-sm" onKeyDown={e => { if (e.key === 'Enter') void addScripture(); }} />
                <button type="button" onClick={() => void addScripture()} className="rounded-full bg-white text-black text-[12px] font-black px-4 py-2 justify-self-start">Add to page</button>{scriptureErr && <p className="text-[12px] text-rose-300">{scriptureErr}</p>}
                <p className="text-[11px] text-white/45">Public-domain text (King James). The reference and translation are added for you.</p></div>)}
            {drawer === 'investigation' && (
              <div className="grid gap-2">{listInvestigations(uid || 'anon').length === 0 && <p className="text-sm text-white/50">No investigations yet. Start one in the Investigation Studio.</p>}
                {listInvestigations(uid || 'anon').map(i => <button key={i.id} type="button" onClick={() => addInvestigation(i)} className="text-left rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/10 px-3 py-2"><p className="text-[13px] font-black truncate">{i.title || i.fields.question || 'Untitled investigation'}</p><p className="text-[11px] text-white/45">{new Date(i.updatedAt).toLocaleDateString()}</p></button>)}
                <button type="button" onClick={() => onNavigate('INQUIRY')} className="text-[12px] font-black text-[#7deefb] underline underline-offset-2 justify-self-start mt-2">Open the Investigation Studio</button></div>)}
            {drawer === 'templates' && (
              <div className="grid grid-cols-2 gap-2">{TEMPLATES.map(t => <button key={t.id} type="button" onClick={async () => { if (notes && page) { const m = await updatePageMeta(uid, page, notes.bucketOf(page.id), { template: t.id }); setPage(m); setDrawer(null); } }} aria-pressed={page?.template === t.id} className={`text-left rounded-xl border p-3 ${page?.template === t.id ? 'border-white bg-white/10' : 'border-white/12 bg-white/[0.04] hover:bg-white/[0.08]'}`}><p className="text-[13px] font-black">{t.label}</p><p className="text-[11px] text-white/50">{t.blurb}</p></button>)}</div>)}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesStudio;
