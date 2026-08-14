/**
 * Book Authoring Studio
 *
 * Design principles:
 *  - The page IS the experience. Canvas fills the center; everything else recedes.
 *  - Toolbar appears on hover / selection only — never competes with prose.
 *  - Text rendering is set for reading: optical sizing, OpenType ligatures,
 *    hyphenation, widow control, subpixel AA, balanced headlines.
 *  - Saves are invisible: debounced Firestore writes with no spinner.
 *  - Page transitions are spring-animated, never janky.
 */

import React, {
  useState, useRef, useCallback, useEffect, lazy, Suspense, useMemo,
} from 'react';
import { motion, AnimatePresence, useSpring } from 'motion/react';
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, BookOpen, Upload,
  Film, Music2, Image, Type, Layers, Grid, Hash, BookMarked, Maximize2,
  Download, Save, FileDown, Globe, Printer, Settings2, Eye,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, List,
  Link2, Palette, X, Check, ChevronRight, ChevronLeft,
  Sparkles, PenTool, MoreHorizontal, Loader2, ScanSearch, AlertTriangle,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { StudioBook, StudioPage, StudioPanel, StudioPageType, Album } from '../types';
import { setComicHandoff, peekComicHandoff } from '../services/comicHandoff';
import { extractDocument, type ImportedParagraph } from '../services/documentImport';
import type { ContinuityReport } from '../services/manuscriptContinuity';
import { auth, storage, db } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const ComicPanelBuilder = lazy(() => import('./ComicPanelBuilder'));

// ─── Typography CSS (injected once) ──────────────────────────────────────────

const PROSE_CSS = `
  .studio-prose {
    font-family: "Noto Serif", "Georgia", "Times New Roman", serif;
    font-size: clamp(1rem, 2vw, 1.175rem);
    line-height: 1.9;
    letter-spacing: 0.01em;
    color: #111;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    font-feature-settings: "liga" 1, "kern" 1, "onum" 1, "calt" 1;
    hanging-punctuation: first last;
    hyphens: auto;
    hyphenate-limit-chars: 6 3 3;
    orphans: 3;
    widows: 3;
    word-spacing: 0.02em;
  }
  .studio-prose:focus { outline: none; }
  .studio-prose:empty::before {
    content: attr(data-placeholder);
    color: rgba(0,0,0,0.2);
    font-style: italic;
    pointer-events: none;
  }
  .studio-prose h1 {
    font-family: "Outfit", "Space Grotesk", sans-serif;
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 900;
    line-height: 1.15;
    letter-spacing: -0.02em;
    text-wrap: balance;
    margin: 2.5rem 0 1rem;
    color: #000;
  }
  .studio-prose h2 {
    font-family: "Outfit", "Space Grotesk", sans-serif;
    font-size: clamp(1.4rem, 3vw, 1.9rem);
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: -0.015em;
    text-wrap: balance;
    margin: 2rem 0 0.75rem;
    color: #111;
  }
  .studio-prose h3 {
    font-family: "Outfit", "Space Grotesk", sans-serif;
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.35;
    margin: 1.5rem 0 0.5rem;
    color: #222;
  }
  .studio-prose p { margin: 0 0 1.2em; }
  .studio-prose p + p { text-indent: 1.5em; margin-top: 0; }
  .studio-prose blockquote {
    border-left: 3px solid #ff8c00;
    margin: 1.5rem 0;
    padding: 0.5rem 1.5rem;
    color: #444;
    font-style: italic;
  }
  .studio-prose strong { font-weight: 700; color: #000; }
  .studio-prose em { font-style: italic; }
  .studio-prose a { color: #ff8c00; text-decoration: underline; }
  .studio-prose ul, .studio-prose ol { padding-left: 1.75rem; margin: 1rem 0; }
  .studio-prose li { margin-bottom: 0.4rem; }
  .studio-prose img {
    max-width: 100%;
    border-radius: 8px;
    margin: 1.5rem auto;
    display: block;
    box-shadow: 0 4px 24px rgba(0,0,0,0.12);
  }
  .studio-prose .plajah-embed {
    margin: 2rem 0;
    border-radius: 12px;
    overflow: hidden;
  }
  .studio-prose video, .studio-prose audio {
    width: 100%;
    border-radius: 10px;
    margin: 1rem 0;
  }
  .studio-prose hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 2.5rem auto;
    width: 40%;
  }
  /* Drop cap for first paragraph */
  .studio-prose.drop-cap > p:first-of-type::first-letter {
    float: left;
    font-size: 4.5em;
    font-family: "Outfit", serif;
    font-weight: 900;
    line-height: 0.8;
    margin: 0.05em 0.12em 0 0;
    color: #ff8c00;
  }

  /* Dark page variant */
  .studio-prose.dark-page {
    color: rgba(255,255,255,0.9);
  }
  .studio-prose.dark-page h1, .studio-prose.dark-page h2, .studio-prose.dark-page h3 {
    color: #fff;
  }
  .studio-prose.dark-page blockquote { color: rgba(255,255,255,0.6); }
  .studio-prose.dark-page strong { color: #fff; }
  .studio-prose.dark-page:empty::before { color: rgba(255,255,255,0.2); }

  /* Sepia variant */
  .studio-prose.sepia-page { color: #3b2f1e; }
  .studio-prose.sepia-page h1, .studio-prose.sepia-page h2 { color: #1a1209; }

  /* Floating toolbar */
  .studio-floating-toolbar {
    position: fixed;
    z-index: 100;
    background: rgba(10,10,10,0.96);
    backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 4px 6px;
    display: flex;
    align-items: center;
    gap: 2px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    pointer-events: auto;
    transform-origin: top left;
  }
`;

function injectProseCSS() {
  if (document.getElementById('studio-prose-css')) return;
  const style = document.createElement('style');
  style.id = 'studio-prose-css';
  style.textContent = PROSE_CSS;
  document.head.appendChild(style);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isDark(bg: string): boolean {
  if (!bg || bg === '#ffffff' || bg === '#f5f0e8' || bg === '#faf7f0') return false;
  const hex = bg.replace('#', '');
  const r = parseInt(hex.slice(0,2),16);
  const g = parseInt(hex.slice(2,4),16);
  const b = parseInt(hex.slice(4,6),16);
  return (0.299*r + 0.587*g + 0.114*b) < 128;
}

function makeBlankPage(type: StudioPageType, order: number): StudioPage {
  return {
    id: uuidv4(), type, order,
    richText: '',
    panels: [],
    embeds: [],
    bgColor: type === 'COVER' || type === 'CHAPTER_BREAK' ? '#0a0a0a' : '#ffffff',
  };
}

const defaultBook = (): StudioBook => ({
  id: uuidv4(),
  title: 'Untitled',
  author: auth.currentUser?.displayName ?? 'Author',
  synopsis: '', genre: '',
  format: 'NOVEL',
  pages: [makeBlankPage('COVER',0), makeBlankPage('TEXT',1)],
  readingDir: 'ltr',
  colorMode: 'color',
  defaultPageColor: '#ffffff',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ─── Floating selection toolbar ───────────────────────────────────────────────

function FloatingToolbar({ onCommand, onClose }: {
  onCommand: (cmd: string, val?: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="studio-floating-toolbar">
      {[
        { icon: <Bold size={13}/>, cmd: 'bold', title: 'Bold' },
        { icon: <Italic size={13}/>, cmd: 'italic', title: 'Italic' },
        { icon: <Underline size={13}/>, cmd: 'underline', title: 'Underline' },
      ].map(({ icon, cmd, title }) => (
        <button key={cmd} title={title} onMouseDown={e => { e.preventDefault(); onCommand(cmd); }}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
          {icon}
        </button>
      ))}
      <div className="w-px h-4 bg-white/10 mx-0.5" />
      <button onMouseDown={e => { e.preventDefault(); onCommand('formatBlock','H1'); }}
        className="px-2 py-1 rounded text-[10px] font-bold text-white/50 hover:text-white hover:bg-white/10 transition-colors">H1</button>
      <button onMouseDown={e => { e.preventDefault(); onCommand('formatBlock','H2'); }}
        className="px-2 py-1 rounded text-[10px] font-bold text-white/50 hover:text-white hover:bg-white/10 transition-colors">H2</button>
      <div className="w-px h-4 bg-white/10 mx-0.5" />
      <button onMouseDown={e => { e.preventDefault(); onCommand('insertHorizontalRule'); }}
        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors" title="Divider">
        <span className="text-xs">—</span>
      </button>
      <button onMouseDown={e => {
          e.preventDefault();
          const url = prompt('Link URL:');
          if (url) onCommand('createLink', url);
        }}
        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors" title="Link">
        <Link2 size={13}/>
      </button>
    </div>
  );
}

// ─── Text page editor ─────────────────────────────────────────────────────────

function TextPageEditor({ page, onChange }: { page: StudioPage; onChange: (p: StudioPage) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dark = isDark(page.bgColor ?? '#ffffff');
  const isSepia = page.bgColor === '#f5f0e8' || page.bgColor === '#faf7f0';

  useEffect(() => {
    injectProseCSS();
    if (editorRef.current && page.richText !== undefined) {
      if (editorRef.current.innerHTML !== page.richText) {
        editorRef.current.innerHTML = page.richText;
      }
    }
  }, [page.id]); // only on page switch

  const handleInput = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? '';
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onChange({ ...page, richText: html });
    }, 400); // debounce — never blocks typing
  }, [page, onChange]);

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editorRef.current?.contains(sel.anchorNode)) {
      setToolbarPos(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setToolbarPos({ x: rect.left + rect.width / 2 - 160, y: rect.top - 52 });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  const execCmd = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    const html = editorRef.current?.innerHTML ?? '';
    onChange({ ...page, richText: html });
  };

  const insertMedia = async (type: 'image' | 'video' | 'audio') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : 'audio/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !auth.currentUser) return;
      const storageRef = ref(storage, `books/${auth.currentUser.uid}/${uuidv4()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      let html = '';
      if (type === 'image') html = `<figure class="plajah-embed"><img src="${url}" alt=""/></figure>`;
      else if (type === 'video') html = `<div class="plajah-embed"><video src="${url}" controls></video></div>`;
      else html = `<div class="plajah-embed"><audio src="${url}" controls></audio></div>`;
      execCmd('insertHTML', html);
    };
    input.click();
  };

  const proseClass = `studio-prose ${dark ? 'dark-page' : ''} ${isSepia ? 'sepia-page' : ''}`;

  return (
    <div className="h-full flex flex-col relative" style={{ backgroundColor: page.bgColor ?? '#ffffff' }}>
      {/* Ambient static toolbar — minimal, lives at top */}
      <div className={`flex items-center gap-0.5 px-6 py-2 border-b ${dark ? 'border-white/5' : 'border-black/5'} backdrop-blur-sm`}
        style={{ backgroundColor: dark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.7)' }}>
        <button onClick={() => execCmd('formatBlock','H1')} className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition-colors ${dark ? 'text-white/30 hover:text-white hover:bg-white/8' : 'text-black/25 hover:text-black hover:bg-black/6'}`}>H1</button>
        <button onClick={() => execCmd('formatBlock','H2')} className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition-colors ${dark ? 'text-white/30 hover:text-white hover:bg-white/8' : 'text-black/25 hover:text-black hover:bg-black/6'}`}>H2</button>
        <button onClick={() => execCmd('formatBlock','H3')} className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition-colors ${dark ? 'text-white/30 hover:text-white hover:bg-white/8' : 'text-black/25 hover:text-black hover:bg-black/6'}`}>H3</button>
        <div className={`w-px h-4 mx-1 ${dark ? 'bg-white/8' : 'bg-black/8'}`} />
        {[
          { icon: <Bold size={12}/>, cmd: 'bold' },
          { icon: <Italic size={12}/>, cmd: 'italic' },
          { icon: <Underline size={12}/>, cmd: 'underline' },
        ].map(({ icon, cmd }) => (
          <button key={cmd} onMouseDown={e => { e.preventDefault(); execCmd(cmd); }}
            className={`p-1.5 rounded-md transition-colors ${dark ? 'text-white/30 hover:text-white hover:bg-white/8' : 'text-black/25 hover:text-black hover:bg-black/6'}`}>
            {icon}
          </button>
        ))}
        <div className={`w-px h-4 mx-1 ${dark ? 'bg-white/8' : 'bg-black/8'}`} />
        {[
          { icon: <AlignLeft size={12}/>, cmd: 'justifyLeft' },
          { icon: <AlignCenter size={12}/>, cmd: 'justifyCenter' },
          { icon: <AlignRight size={12}/>, cmd: 'justifyRight' },
        ].map(({ icon, cmd }) => (
          <button key={cmd} onMouseDown={e => { e.preventDefault(); execCmd(cmd); }}
            className={`p-1.5 rounded-md transition-colors ${dark ? 'text-white/30 hover:text-white hover:bg-white/8' : 'text-black/25 hover:text-black hover:bg-black/6'}`}>
            {icon}
          </button>
        ))}
        <div className={`w-px h-4 mx-1 ${dark ? 'bg-white/8' : 'bg-black/8'}`} />
        <button onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList'); }}
          className={`p-1.5 rounded-md transition-colors ${dark ? 'text-white/30 hover:text-white hover:bg-white/8' : 'text-black/25 hover:text-black hover:bg-black/6'}`}>
          <List size={12}/>
        </button>
        <button onMouseDown={e => { e.preventDefault(); execCmd('insertHorizontalRule'); }}
          className={`px-2 py-1 rounded-md text-xs transition-colors ${dark ? 'text-white/30 hover:text-white hover:bg-white/8' : 'text-black/25 hover:text-black hover:bg-black/6'}`}>—</button>
        <div className="ml-auto flex items-center gap-0.5">
          {[
            { icon: <Image size={12}/>, type: 'image' as const, color: 'text-orange-400/60 hover:text-orange-400' },
            { icon: <Film size={12}/>, type: 'video' as const, color: 'text-blue-400/60 hover:text-blue-400' },
            { icon: <Music2 size={12}/>, type: 'audio' as const, color: 'text-emerald-400/60 hover:text-emerald-400' },
          ].map(({ icon, type, color }) => (
            <button key={type} onClick={() => insertMedia(type)}
              className={`p-1.5 rounded-md transition-colors ${color}`} title={`Insert ${type}`}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* The page — paper centered in the editor */}
      <div className="flex-1 overflow-y-auto" style={{ backgroundColor: dark ? '#111' : '#ddd' }}>
        <div className="min-h-full py-12 flex justify-center">
          <div
            className="w-full max-w-[680px] min-h-[900px] shadow-2xl mx-4"
            style={{
              backgroundColor: page.bgColor ?? '#ffffff',
              borderRadius: 4,
              boxShadow: dark
                ? '0 0 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)'
                : '0 4px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)',
            }}
          >
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              data-placeholder="Begin writing…"
              className={proseClass}
              style={{
                padding: '72px 80px',
                minHeight: 900,
              }}
            />
          </div>
        </div>
      </div>

      {/* Floating selection toolbar */}
      <AnimatePresence>
        {toolbarPos && (
          <motion.div
            ref={toolbarRef as any}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            style={{ left: toolbarPos.x, top: toolbarPos.y }}
            className="fixed z-50"
          >
            <FloatingToolbar onCommand={execCmd} onClose={() => setToolbarPos(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Cover / Splash editor ────────────────────────────────────────────────────

function BleedPageEditor({ page, onChange }: { page: StudioPage; onChange: (p: StudioPage) => void }) {
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    const r = ref(storage, `books/${auth.currentUser.uid}/${uuidv4()}_${file.name}`);
    await uploadBytes(r, file);
    onChange({ ...page, imageUrl: await getDownloadURL(r) });
  };

  return (
    <div className="relative h-full flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: page.bgColor ?? '#0a0a0a' }}>
      {page.imageUrl
        ? <img src={page.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        : (
          <label className="flex flex-col items-center gap-4 cursor-pointer group z-10">
            <div className="w-24 h-24 rounded-3xl border-2 border-dashed border-white/15 flex items-center justify-center group-hover:border-orange-400/40 transition-all duration-300">
              <Image size={32} className="text-white/15 group-hover:text-orange-400/40 transition-colors duration-300" />
            </div>
            <p className="text-white/30 text-sm">Upload cover image</p>
            <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          </label>
        )
      }
      {page.imageUrl && (
        <label className="absolute bottom-8 right-8 z-20 px-4 py-2 bg-black/50 border border-white/10 rounded-xl text-sm text-white/70 cursor-pointer hover:bg-black/70 backdrop-blur transition-colors">
          Change image <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </label>
      )}
      {/* Title overlay */}
      <div className="absolute inset-x-0 bottom-0 p-10 z-10" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)' }}>
        <input
          type="text"
          value={page.overlay ?? ''}
          onChange={e => onChange({ ...page, overlay: e.target.value })}
          placeholder="Cover title or tagline…"
          className="w-full bg-transparent text-white text-3xl font-black placeholder-white/20 focus:outline-none text-center drop-shadow-lg"
          style={{ textShadow: '0 2px 16px rgba(0,0,0,0.5)' }}
        />
      </div>
    </div>
  );
}

// ─── Chapter break editor ─────────────────────────────────────────────────────

function ChapterBreakEditor({ page, onChange }: { page: StudioPage; onChange: (p: StudioPage) => void }) {
  const dark = isDark(page.bgColor ?? '#0a0a0a');
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 px-16"
      style={{ backgroundColor: page.bgColor ?? '#0a0a0a' }}>
      <div className={`text-[10px] font-black uppercase tracking-[0.5em] ${dark ? 'text-white/20' : 'text-black/20'}`}>Chapter</div>
      <input
        type="text"
        value={page.chapterTitle ?? ''}
        onChange={e => onChange({ ...page, chapterTitle: e.target.value })}
        placeholder="Chapter title…"
        className={`text-4xl font-black text-center bg-transparent focus:outline-none w-full max-w-xl border-b border-current/10 pb-3 transition-colors ${dark ? 'text-white placeholder-white/15' : 'text-black placeholder-black/15'}`}
        style={{ fontFamily: '"Outfit","Space Grotesk",sans-serif', letterSpacing: '-0.02em' }}
      />
      <input
        type="text"
        value={page.richText ?? ''}
        onChange={e => onChange({ ...page, richText: e.target.value })}
        placeholder="Optional epigraph or synopsis…"
        className={`text-base italic text-center bg-transparent focus:outline-none w-full max-w-sm ${dark ? 'text-white/30 placeholder-white/15' : 'text-black/30 placeholder-black/15'}`}
        style={{ fontFamily: '"Noto Serif","Georgia",serif' }}
      />
    </div>
  );
}

// ─── Media page ───────────────────────────────────────────────────────────────

function MediaPageEditor({ page, onChange }: { page: StudioPage; onChange: (p: StudioPage) => void }) {
  const [url, setUrl] = useState(page.mediaUrl ?? '');
  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 p-12"
      style={{ backgroundColor: page.bgColor ?? '#111' }}>
      <div className="w-full max-w-xl space-y-4">
        <div className="flex gap-2">
          {(['VIDEO','AUDIO','IMAGE'] as const).map(t => (
            <button key={t} onClick={() => onChange({ ...page, mediaType: t })}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${page.mediaType === t ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="text" value={url} onChange={e => setUrl(e.target.value)} onBlur={() => onChange({ ...page, mediaUrl: url })}
            placeholder="Paste URL…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30" />
          <button onClick={() => onChange({ ...page, mediaUrl: url })}
            className="px-5 py-3 bg-orange-500 text-black font-bold rounded-xl hover:bg-orange-400 transition-colors text-sm">Set</button>
        </div>
        {page.mediaUrl && (
          <div className="rounded-2xl overflow-hidden border border-white/10">
            {page.mediaType === 'VIDEO' && <video src={page.mediaUrl} controls className="w-full"/>}
            {page.mediaType === 'AUDIO' && <audio src={page.mediaUrl} controls className="w-full"/>}
            {(!page.mediaType || page.mediaType === 'IMAGE') && <img src={page.mediaUrl} alt="" className="w-full object-contain max-h-80"/>}
          </div>
        )}
        <input type="text" value={page.richText ?? ''} onChange={e => onChange({ ...page, richText: e.target.value })}
          placeholder="Caption…"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/70 placeholder-white/20 focus:outline-none" />
      </div>
    </div>
  );
}

// ─── Page thumbnail ───────────────────────────────────────────────────────────

const PAGE_TYPE_ICONS: Record<StudioPageType, React.ReactNode> = {
  TEXT: <Type size={9}/>, COMIC: <Layers size={9}/>, MANGA: <Grid size={9}/>,
  FULL_BLEED: <Maximize2 size={9}/>, MEDIA: <Film size={9}/>,
  CHAPTER_BREAK: <Hash size={9}/>, COVER: <BookMarked size={9}/>,
};

function PageThumb({ page, active, index, onClick, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: {
  page: StudioPage; active: boolean; index: number;
  onClick: () => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
  isFirst: boolean; isLast: boolean;
}) {
  return (
    <motion.div
      layout
      onClick={onClick}
      className={`group relative cursor-pointer rounded-lg border transition-all overflow-hidden ${
        active ? 'border-orange-400/50 ring-1 ring-orange-400/20' : 'border-white/5 hover:border-white/15'
      }`}
      style={{ backgroundColor: page.bgColor ?? '#fff' }}
    >
      <div className="w-full aspect-[3/4] relative overflow-hidden">
        {page.imageUrl && <img src={page.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover"/>}
        {(page.type === 'COMIC' || page.type === 'MANGA') && page.panels && (
          <div className="absolute inset-0" style={{ backgroundColor: page.bgColor ?? '#111' }}>
            {page.panels.map(p => (
              <div key={p.id} className="absolute border border-white/20"
                style={{ left:`${p.x}%`, top:`${p.y}%`, width:`${p.width}%`, height:`${p.height}%`, backgroundColor: p.bgColor ?? '#1a1a1a' }}>
                {p.imageUrl && <img src={p.imageUrl} alt="" className="w-full h-full object-cover"/>}
              </div>
            ))}
          </div>
        )}
        {page.type === 'TEXT' && page.richText && (
          <div className="absolute inset-0 p-2 overflow-hidden" style={{ color: isDark(page.bgColor??'#fff') ? '#fff' : '#111', fontSize: 4, lineHeight: 1.6, fontFamily: 'Georgia,serif' }}
            dangerouslySetInnerHTML={{ __html: page.richText.slice(0,300) }}/>
        )}
        {page.type === 'CHAPTER_BREAK' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div style={{ fontSize: 7, fontWeight: 900, color: isDark(page.bgColor??'#0a0a0a') ? '#fff' : '#000', textAlign: 'center', padding: '4px', wordBreak: 'break-word', fontFamily: 'Outfit,sans-serif' }}>
              {page.chapterTitle || 'Chapter'}
            </div>
          </div>
        )}
      </div>
      {/* Label */}
      <div className={`flex items-center justify-between px-1.5 py-1 ${isDark(page.bgColor??'#fff') ? 'bg-black/40' : 'bg-white/60'}`}>
        <div className={`flex items-center gap-1 ${isDark(page.bgColor??'#fff') ? 'text-white/30' : 'text-black/30'}`}>
          {PAGE_TYPE_ICONS[page.type]}
          <span className="text-[8px] uppercase tracking-wide">{index+1}</span>
        </div>
      </div>
      {/* Controls on hover */}
      <div className="absolute top-1 right-1 hidden group-hover:flex flex-col gap-0.5">
        <button onClick={e => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst}
          className="p-0.5 rounded bg-black/60 hover:bg-black/80 disabled:opacity-20 transition-colors">
          <ChevronUp size={9} className="text-white"/>
        </button>
        <button onClick={e => { e.stopPropagation(); onMoveDown(); }} disabled={isLast}
          className="p-0.5 rounded bg-black/60 hover:bg-black/80 disabled:opacity-20 transition-colors">
          <ChevronDown size={9} className="text-white"/>
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          className="p-0.5 rounded bg-red-500/70 hover:bg-red-500 transition-colors">
          <Trash2 size={9} className="text-white"/>
        </button>
      </div>
    </motion.div>
  );
}

// ─── Page type picker ─────────────────────────────────────────────────────────

const PAGE_TYPES: { type: StudioPageType; label: string; icon: React.ReactNode }[] = [
  { type: 'COVER',         label: 'Cover',   icon: <BookMarked size={13}/> },
  { type: 'TEXT',          label: 'Text',    icon: <Type size={13}/> },
  { type: 'CHAPTER_BREAK', label: 'Chapter', icon: <Hash size={13}/> },
  { type: 'COMIC',         label: 'Comic',   icon: <Layers size={13}/> },
  { type: 'MANGA',         label: 'Manga',   icon: <Grid size={13}/> },
  { type: 'FULL_BLEED',    label: 'Splash',  icon: <Maximize2 size={13}/> },
  { type: 'MEDIA',         label: 'Media',   icon: <Film size={13}/> },
];

// ─── Import helpers ───────────────────────────────────────────────────────────

async function importTxt(file: File): Promise<Partial<StudioPage>[]> {
  const text = await file.text();
  const chunks = text.split(/\n#{1,2}\s+/g).filter(Boolean);
  return chunks.map(chunk => {
    const lines = chunk.trim().split('\n');
    const firstLine = lines[0].replace(/^#+\s*/, '');
    const body = lines.slice(1).join('\n').trim();
    const isTitle = /^#/.test(chunk);
    return {
      type: isTitle ? 'CHAPTER_BREAK' as StudioPageType : 'TEXT' as StudioPageType,
      chapterTitle: isTitle ? firstLine : undefined,
      richText: isTitle ? body : `<h2>${firstLine}</h2><p>${body.replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br/>')}</p>`,
      bgColor: isTitle ? '#0a0a0a' : '#ffffff',
    };
  });
}

async function importMarkdown(file: File): Promise<Partial<StudioPage>[]> {
  const text = await file.text();
  const html = text
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>')
    .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^---$/gm,'<hr/>')
    .replace(/\n\n/g,'</p><p>')
    .replace(/\n/g,'<br/>');
  const chunks = `<p>${html}</p>`.split(/(?=<h1>)/).filter(Boolean);
  return chunks.map((chunk, i) => ({
    type: 'TEXT' as StudioPageType,
    richText: chunk,
    bgColor: '#ffffff',
  }));
}

// Group extracted paragraphs into Studio pages, breaking to a new chapter page
// whenever a top-level heading (Title / Heading 1–2) is encountered.
function paragraphsToPages(paras: ImportedParagraph[]): Partial<StudioPage>[] {
  const pages: Partial<StudioPage>[] = [];
  let bodyHtml = '';
  let chapterTitle: string | undefined;
  const flush = () => {
    if (!bodyHtml.trim()) { chapterTitle = undefined; return; }
    pages.push({ type: 'TEXT' as StudioPageType, richText: bodyHtml.trim(), bgColor: '#ffffff', ...(chapterTitle ? { chapterTitle } : {}) });
    bodyHtml = '';
    chapterTitle = undefined;
  };
  for (const p of paras) {
    if (p.heading > 0 && p.heading <= 2 && p.text.trim()) {
      // Break to a new chapter page; the heading opens it and keeps its title.
      flush();
      chapterTitle = p.text.trim();
      bodyHtml += p.html || `<h${p.heading}>${escapeStudioHtml(p.text)}</h${p.heading}>`;
      continue;
    }
    bodyHtml += p.html || (p.text.trim() ? `<p>${escapeStudioHtml(p.text)}</p>` : '');
  }
  flush();
  return pages.length ? pages : [{ type: 'TEXT' as StudioPageType, richText: '', bgColor: '#ffffff' }];
}

function escapeStudioHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHTML(book: StudioBook): string {
  const sorted = [...book.pages].sort((a,b) => a.order - b.order);
  const body = sorted.map(p => {
    if (p.type === 'TEXT') return `<section class="page text">${p.richText??''}</section>`;
    if (p.type === 'CHAPTER_BREAK') return `<section class="chapter-break"><h1>${p.chapterTitle??''}</h1><p class="epigraph">${p.richText??''}</p></section>`;
    if (p.type === 'COVER' || p.type === 'FULL_BLEED') return `<section class="page bleed">${p.imageUrl?`<img src="${p.imageUrl}" alt=""/>`:''}${p.overlay?`<h1 class="overlay">${p.overlay}</h1>`:''}</section>`;
    if (p.type === 'MEDIA') {
      const m = p.mediaType;
      return `<section class="page media">${m==='VIDEO'?`<video src="${p.mediaUrl}" controls/>`:`<audio src="${p.mediaUrl}" controls/>`}<p>${p.richText??''}</p></section>`;
    }
    if (p.type === 'COMIC' || p.type === 'MANGA') {
      return `<section class="page comic" dir="${p.readingDir??'ltr'}">${(p.panels??[]).map(pan=>`<div class="panel" style="background:${pan.bgColor??'#111'}">${pan.imageUrl?`<img src="${pan.imageUrl}"/>`:''}${(pan.bubbles??[]).map(b=>`<span class="bubble ${b.type}">${b.text}</span>`).join('')}${pan.caption?`<p class="caption">${pan.caption}</p>`:''}</div>`).join('')}</section>`;
    }
    return '';
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>${book.title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400&family=Outfit:wght@400;700;900&display=swap');
  *{box-sizing:border-box}
  body{font-family:"Noto Serif",Georgia,serif;max-width:720px;margin:0 auto;padding:3rem 2rem;background:#fff;color:#111;font-size:1.125rem;line-height:1.9;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-feature-settings:"liga"1,"kern"1}
  h1{font-family:"Outfit",sans-serif;font-size:2.5rem;font-weight:900;line-height:1.15;letter-spacing:-0.02em;margin:3rem 0 1rem}
  h2{font-family:"Outfit",sans-serif;font-size:1.75rem;font-weight:800;margin:2rem 0 .75rem}
  h3{font-family:"Outfit",sans-serif;font-size:1.25rem;font-weight:700;margin:1.5rem 0 .5rem}
  p{margin:0 0 1.2em}p+p{text-indent:1.5em;margin-top:0}
  blockquote{border-left:3px solid #ff8c00;margin:1.5rem 0;padding:.5rem 1.5rem;color:#555;font-style:italic}
  .chapter-break{text-align:center;padding:5rem 0;page-break-before:always}
  .chapter-break h1{font-size:3rem}
  .epigraph{color:#888;font-style:italic;margin-top:1rem}
  .bleed img{width:100%;max-height:90vh;object-fit:cover;border-radius:8px}
  .overlay{position:relative;z-index:1;text-align:center}
  .comic{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;background:#000;page-break-before:always}
  .panel{position:relative;min-height:250px;overflow:hidden}
  .panel img{width:100%;height:100%;object-fit:cover;display:block}
  .bubble{position:absolute;background:#fff;border:2px solid #000;border-radius:10px;padding:4px 8px;font-size:11px;max-width:60%}
  .caption{background:#000a;color:#fff;padding:4px 8px;font-size:10px;position:absolute;bottom:0;left:0;right:0}
  audio,video{width:100%;border-radius:8px;margin:1rem 0}
  hr{border:none;border-top:1px solid #e0e0e0;margin:2.5rem auto;width:40%}
  @media print{.page{page-break-after:always}.chapter-break{page-break-before:always}}
</style>
</head><body>
<div class="cover" style="text-align:center;padding:4rem 0;page-break-after:always">
  ${book.coverImageUrl?`<img src="${book.coverImageUrl}" style="max-height:60vh;border-radius:12px;margin-bottom:2rem"/><br/>`:''}
  <h1 style="font-size:3.5rem">${book.title}</h1>
  <p style="color:#888">by ${book.author}</p>
</div>
${body}
</body></html>`;
}

// ─── Format bar ───────────────────────────────────────────────────────────────

const FORMATS: { id: StudioBook['format']; label: string; rtl?: boolean }[] = [
  { id:'NOVEL', label:'Novel' }, { id:'NON_FICTION', label:'Non-Fiction' },
  { id:'ILLUSTRATED', label:'Illustrated' }, { id:'GRAPHIC_NOVEL', label:'Graphic Novel' },
  { id:'COMIC', label:'Comic' }, { id:'MANGA', label:'Manga', rtl:true },
  { id:'WEBTOON', label:'Webtoon' },
];

const PAGE_BG_PRESETS = [
  { label:'White',  value:'#ffffff' },
  { label:'Cream',  value:'#faf7f0' },
  { label:'Sepia',  value:'#f5f0e8' },
  { label:'Black',  value:'#0a0a0a' },
  { label:'Navy',   value:'#0d1b2a' },
  { label:'Slate',  value:'#111827' },
];

// ─── Debounced save ───────────────────────────────────────────────────────────

function useDebouncedSave(book: StudioBook, delay = 2500) {
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!auth.currentUser) return;
      try {
        await setDoc(doc(db, 'studio_books', book.id), {
          ...book, userId: auth.currentUser.uid, savedAt: serverTimestamp(),
        }, { merge: true });
        setSaved(true);
      } catch { /* silent */ }
    }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [book, delay]);

  return saved;
}

// ─── Main Studio ──────────────────────────────────────────────────────────────

interface Props { onBack: () => void; initialBook?: StudioBook; }

export default function BookAuthoringStudio({ onBack, initialBook }: Props) {
  useEffect(() => { injectProseCSS(); }, []);

  const [book, setBook] = useState<StudioBook>(() => initialBook ?? defaultBook());
  const [activePageId, setActivePageId] = useState(book.pages[0]?.id ?? '');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importDragging, setImportDragging] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // Publish & Protect: ship the book to the Lorea marketplace and anchor a
  // creation certificate (SHA-256 of the manuscript, inscribed via Ordinals)
  // so authorship is provable before the work circulates.
  const [showPublish, setShowPublish] = useState(false);
  const [publishPrice, setPublishPrice] = useState('0');
  const [protectOnChain, setProtectOnChain] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishOutcome, setPublishOutcome] = useState<{ albumId: string; certificateId?: string; certError?: string } | null>(null);

  // Continuity pass: read the whole manuscript in one shot and surface the
  // contradictions that only exist BETWEEN distant chapters. See
  // services/manuscriptContinuity — runs on the Pokee long-context lane.
  const [showContinuity, setShowContinuity] = useState(false);
  const [continuityRunning, setContinuityRunning] = useState(false);
  const [continuityReport, setContinuityReport] = useState<ContinuityReport | null>(null);
  const [continuityError, setContinuityError] = useState<string | null>(null);

  const runContinuity = async () => {
    setContinuityRunning(true);
    setContinuityError(null);
    setContinuityReport(null);
    try {
      const { runContinuityPass } = await import('../services/manuscriptContinuity');
      setContinuityReport(await runContinuityPass(book));
    } catch (err: any) {
      setContinuityError(err?.message || 'The continuity pass could not be completed.');
    } finally {
      setContinuityRunning(false);
    }
  };

  const handlePublish = async () => {
    const user = auth.currentUser;
    if (!user) { alert('Sign in to publish your book.'); return; }
    setPublishing(true);
    setPublishOutcome(null);
    try {
      const stripHtml = (html: string) => {
        const el = document.createElement('div');
        el.innerHTML = html;
        return (el.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
      };
      const chapters = [...book.pages]
        .sort((a, b) => a.order - b.order)
        .map((p, i) => ({
          id: p.id,
          title: p.chapterTitle || `Chapter ${i + 1}`,
          content: p.richText ? stripHtml(p.richText) : '',
        }))
        .filter(c => c.content.length > 0);
      if (chapters.length === 0) { alert('Write at least one chapter before publishing.'); setPublishing(false); return; }

      const { publishToCloud } = await import('../services/backendService');
      const albumId = book.publishedAlbumId || `authored-${book.id}`;
      const price = Math.max(0, parseFloat(publishPrice) || 0);
      const album: Album = {
        id: albumId,
        title: book.title || 'Untitled',
        artist: book.author || user.displayName || 'Independent Author',
        coverImage: book.coverImageUrl || '',
        type: 'BOOK',
        subType: ['NOVEL', 'NON_FICTION', 'ILLUSTRATED'].includes(book.format) ? 'NOVEL' : 'GRAPHIC_NOVEL',
        genre: book.genre || 'Independent',
        description: book.synopsis || '',
        ownerId: user.uid,
        createdAt: Date.now(),
        themeColor: '#FF8C00',
        tracks: [],
        bookChapters: chapters,
        ...(price > 0 ? { price, isPaywalled: true } : {}),
      } as Album;
      await publishToCloud(album);
      setBookField('publishedAlbumId', albumId);

      let certificateId: string | undefined;
      let certError: string | undefined;
      if (protectOnChain) {
        try {
          const { hashContent, requestCreationCertificate } = await import('../services/ordinalsService');
          const manuscript = chapters.map(c => `${c.title}\n\n${c.content}`).join('\n\n— — —\n\n');
          const contentHash = await hashContent(manuscript);
          const cert = await requestCreationCertificate({
            contentId: albumId,
            contentType: 'BOOK',
            vertical: 'LOREA',
            creatorId: user.uid,
            creatorName: book.author || user.displayName || 'Independent Author',
            title: book.title || 'Untitled',
            contentHash,
          });
          certificateId = cert.certificateId;
        } catch (e: any) {
          certError = e?.message || 'Certificate request failed';
          console.warn('[Publish] Creation certificate failed:', e);
        }
      }
      setPublishOutcome({ albumId, certificateId, certError });
    } catch (e: any) {
      alert(`Publish failed: ${e?.message || e}`);
    } finally {
      setPublishing(false);
    }
  };

  const saved = useDebouncedSave(book);

  const sortedPages = useMemo(() => [...book.pages].sort((a,b) => a.order - b.order), [book.pages]);
  const activePage = book.pages.find(p => p.id === activePageId) ?? null;

  const setBookField = <K extends keyof StudioBook>(key: K, val: StudioBook[K]) =>
    setBook(b => ({ ...b, [key]: val, updatedAt: Date.now() }));

  const updatePage = useCallback((updated: StudioPage) => {
    setBook(b => ({ ...b, updatedAt: Date.now(), pages: b.pages.map(p => p.id === updated.id ? updated : p) }));
  }, []);

  const addPage = (type: StudioPageType) => {
    const maxOrder = Math.max(0, ...book.pages.map(p => p.order));
    const p = makeBlankPage(type, maxOrder + 1);
    setBook(b => ({ ...b, pages: [...b.pages, p] }));
    setActivePageId(p.id);
    setShowAddMenu(false);
  };

  // Send a text page's words to the comic composer as a script (Lorea → Comic).
  const sendTextToComic = (page: StudioPage) => {
    const script = (page.richText || '').replace(/<\/(p|div|h\d|li|br)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
    setComicHandoff({ source: 'LOREA', title: book.title, script });
    addPage(book.format === 'MANGA' ? 'MANGA' : 'COMIC'); // ComicPanelBuilder consumes the handoff on mount
  };

  // A pending handoff (from Fabula "Send to Comic" or Lorea) → open a comic page so
  // ComicPanelBuilder mounts and picks it up.
  useEffect(() => {
    if (!peekComicHandoff()) return;
    const existing = book.pages.find(p => p.type === 'COMIC' || p.type === 'MANGA');
    if (existing) setActivePageId(existing.id);
    else addPage('COMIC');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deletePage = (id: string) => {
    if (book.pages.length <= 1) return;
    setBook(b => {
      const remaining = b.pages.filter(p => p.id !== id).map((p, i) => ({ ...p, order: i }));
      return { ...b, pages: remaining };
    });
    if (activePageId === id) setActivePageId(book.pages.find(p => p.id !== id)?.id ?? '');
  };

  const movePage = (id: string, dir: -1|1) => {
    setBook(b => {
      const sorted = [...b.pages].sort((a,c) => a.order - c.order);
      const idx = sorted.findIndex(p => p.id === id);
      const ni = idx + dir;
      if (ni < 0 || ni >= sorted.length) return b;
      [sorted[idx].order, sorted[ni].order] = [sorted[ni].order, sorted[idx].order];
      return { ...b, pages: sorted };
    });
  };

  const handleImportFile = async (file: File) => {
    setShowImport(false);
    let partials: Partial<StudioPage>[] = [];
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.txt') || name.endsWith('.text')) partials = await importTxt(file);
      else if (name.endsWith('.md') || name.endsWith('.markdown')) partials = await importMarkdown(file);
      else if (name.endsWith('.docx') || name.endsWith('.pdf') || name.endsWith('.fountain')) {
        // Client-side extraction — no backend required (works on web + native + offline).
        const { paragraphs, title } = await extractDocument(file);
        partials = paragraphsToPages(paragraphs);
        if (title && (!book.title || /^untitled$/i.test(book.title))) setBookField('title', title);
      } else { alert('Supported formats: .docx · .pdf · .txt · .md · .fountain\n\nGoogle Docs: File → Download → Word (.docx) or plain text.'); return; }
    } catch (e: any) {
      console.error('[BookImport]', e);
      alert(e?.message || 'Could not read that file. Try re-saving it as .docx or .pdf.');
      return;
    }

    if (!partials.length) { alert('No readable text found in that file.'); return; }
    const maxOrder = Math.max(0, ...book.pages.map(p => p.order));
    const pages: StudioPage[] = partials.map((partial, i) => ({ ...makeBlankPage(partial.type ?? 'TEXT', maxOrder + i + 1), ...partial }));
    setBook(b => ({ ...b, pages: [...b.pages, ...pages] }));
    if (pages[0]) setActivePageId(pages[0].id);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0c0c0c] text-white overflow-hidden select-none">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-[#0f0f0f] shrink-0 z-20">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors shrink-0">
          <ArrowLeft size={16}/>
        </button>

        <div className="flex items-center gap-2 min-w-0 mr-2">
          <BookOpen size={13} className="text-orange-400 shrink-0"/>
          <input
            type="text"
            value={book.title}
            onChange={e => setBookField('title', e.target.value)}
            className="bg-transparent text-sm font-bold text-white focus:outline-none min-w-0 max-w-[180px] border-b border-transparent focus:border-orange-400/30 pb-px transition-colors"
          />
        </div>

        {/* Format chips */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {FORMATS.map(f => (
            <button key={f.id} onClick={() => { setBookField('format', f.id); if (f.rtl) setBookField('readingDir', 'rtl'); else setBookField('readingDir', 'ltr'); }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 border transition-colors whitespace-nowrap ${book.format === f.id ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'bg-white/[0.03] border-white/5 text-white/30 hover:text-white/70'}`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Save indicator */}
          <span className={`text-[10px] transition-colors mr-1 ${saved ? 'text-white/20' : 'text-orange-400/50'}`}>
            {saved ? 'Saved' : 'Saving…'}
          </span>

          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white/50 hover:bg-white/8 hover:text-white transition-colors">
            <Upload size={11}/> Import
          </button>

          <button onClick={() => { setShowContinuity(true); if (!continuityReport && !continuityRunning) runContinuity(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white/50 hover:bg-white/8 hover:text-white transition-colors">
            <ScanSearch size={11}/> Continuity
          </button>

          {/* Export */}
          <div className="relative">
            <button onClick={() => setShowExport(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white/50 hover:bg-white/8 hover:text-white transition-colors">
              <FileDown size={11}/> Export
            </button>
            <AnimatePresence>
              {showExport && (
                <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.12}}
                  className="absolute right-0 top-full mt-2 w-48 bg-[#181818] border border-white/8 rounded-xl overflow-hidden shadow-2xl z-50">
                  {[
                    { label:'Publish & Protect', icon:<Globe size={12}/>, action:()=>setShowPublish(true) },
                    { label:'Print / PDF', icon:<Printer size={12}/>, action:()=>window.print() },
                    { label:'HTML file', icon:<Download size={12}/>, action:()=>{ const h=buildHTML(book); const b=new Blob([h],{type:'text/html'}); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`${book.title}.html`; a.click(); URL.revokeObjectURL(u); } },
                  ].map(({label,icon,action}) => (
                    <button key={label} onClick={()=>{setShowExport(false);action();}}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors">
                      <span className="text-white/30">{icon}</span>{label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button onClick={() => setShowSettings(v => !v)}
            className={`p-1.5 rounded-lg border transition-colors ${showSettings ? 'bg-white/8 border-white/15 text-white' : 'bg-white/[0.03] border-white/[0.06] text-white/30 hover:text-white'}`}>
            <Settings2 size={13}/>
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: page list */}
        <div className="w-[148px] shrink-0 border-r border-white/[0.06] bg-[#0f0f0f] flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {sortedPages.map((page, i) => (
              <PageThumb
                key={page.id}
                page={page}
                active={page.id === activePageId}
                index={i}
                onClick={() => setActivePageId(page.id)}
                onDelete={() => deletePage(page.id)}
                onMoveUp={() => movePage(page.id, -1)}
                onMoveDown={() => movePage(page.id, 1)}
                isFirst={i === 0}
                isLast={i === sortedPages.length - 1}
              />
            ))}
          </div>

          {/* Add page */}
          <div className="shrink-0 p-2 border-t border-white/[0.06]">
            <div className="relative">
              <button onClick={() => setShowAddMenu(v => !v)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-bold hover:bg-orange-500/15 transition-colors">
                <Plus size={12}/> Add page
              </button>
              <AnimatePresence>
                {showAddMenu && (
                  <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:6}} transition={{duration:.1}}
                    className="absolute bottom-full left-0 right-0 mb-2 bg-[#181818] border border-white/8 rounded-xl overflow-hidden shadow-2xl z-50">
                    {PAGE_TYPES.map(({type,label,icon}) => (
                      <button key={type} onClick={() => addPage(type)}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-white/60 hover:bg-white/5 hover:text-white transition-colors">
                        <span className="text-white/25">{icon}</span>{label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Center: editor */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activePage ? (
              <motion.div key={activePage.id} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.15}} className="h-full">
                {activePage.type === 'TEXT' && <TextPageEditor page={activePage} onChange={updatePage}/>}
                {(activePage.type === 'COMIC' || activePage.type === 'MANGA') && (
                  <Suspense fallback={<div className="h-full flex items-center justify-center text-white/20 text-sm">Loading canvas…</div>}>
                    <ComicPanelBuilder page={activePage} onChange={updatePage} isManga={activePage.type === 'MANGA'}/>
                  </Suspense>
                )}
                {(activePage.type === 'COVER' || activePage.type === 'FULL_BLEED') && <BleedPageEditor page={activePage} onChange={updatePage}/>}
                {activePage.type === 'MEDIA' && <MediaPageEditor page={activePage} onChange={updatePage}/>}
                {activePage.type === 'CHAPTER_BREAK' && <ChapterBreakEditor page={activePage} onChange={updatePage}/>}
              </motion.div>
            ) : (
              <div className="h-full flex items-center justify-center text-white/10 text-sm">Select a page</div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: settings panel (slide in) */}
        <AnimatePresence>
          {showSettings && activePage && (
            <motion.div
              initial={{width:0,opacity:0}} animate={{width:196,opacity:1}} exit={{width:0,opacity:0}}
              transition={{duration:.2,ease:[0.32,0.72,0,1]}}
              className="shrink-0 border-l border-white/[0.06] bg-[#0f0f0f] overflow-hidden"
            >
              <div className="p-3 space-y-4 w-[196px]">
                <div className="text-[9px] font-bold uppercase tracking-widest text-white/20 mb-2">Page</div>
                {/* BG color */}
                <div>
                  <div className="text-[9px] text-white/30 mb-1.5">Background</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PAGE_BG_PRESETS.map(({label,value}) => (
                      <button key={value} title={label} onClick={() => updatePage({ ...activePage, bgColor: value })}
                        className={`w-6 h-6 rounded-lg border-2 transition-all ${activePage.bgColor === value ? 'border-orange-400 scale-110' : 'border-transparent hover:border-white/20'}`}
                        style={{ backgroundColor: value }}/>
                    ))}
                    <label title="Custom" className="w-6 h-6 rounded-lg border border-dashed border-white/15 flex items-center justify-center cursor-pointer hover:border-orange-400/40 transition-colors">
                      <Palette size={10} className="text-white/25"/>
                      <input type="color" value={activePage.bgColor??'#ffffff'} onChange={e => updatePage({ ...activePage, bgColor:e.target.value })} className="sr-only"/>
                    </label>
                  </div>
                </div>
                {/* Page type */}
                <div>
                  <div className="text-[9px] text-white/30 mb-1.5">Page type</div>
                  <div className="space-y-1">
                    {PAGE_TYPES.map(({type,label,icon}) => (
                      <button key={type} onClick={() => updatePage({ ...activePage, type })}
                        className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${activePage.type === type ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'bg-white/[0.02] border-white/5 text-white/40 hover:text-white'}`}>
                        <span className="opacity-60">{icon}</span>{label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Lorea → Comic: script this text page into panels */}
                {activePage.type === 'TEXT' && (activePage.richText || '').trim() && (
                  <button onClick={() => sendTextToComic(activePage)}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors">
                    <Layers size={12} /> Comic from this text
                  </button>
                )}
                {/* Manga RTL */}
                {activePage.type === 'MANGA' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className={`w-8 h-4 rounded-full transition-colors ${activePage.readingDir==='rtl'?'bg-orange-500':'bg-white/10'}`}
                      onClick={() => updatePage({ ...activePage, readingDir: activePage.readingDir==='rtl'?'ltr':'rtl' })}>
                      <div className={`w-3.5 h-3.5 rounded-full bg-white mt-px transition-transform ${activePage.readingDir==='rtl'?'ml-[18px]':'ml-px'}`}/>
                    </div>
                    <span className="text-[10px] text-white/40">RTL (manga)</span>
                  </label>
                )}
                {/* Notes */}
                <div>
                  <div className="text-[9px] text-white/30 mb-1">Notes (private)</div>
                  <textarea value={activePage.notes??''} onChange={e => updatePage({ ...activePage, notes:e.target.value })}
                    rows={3} placeholder="Your notes…"
                    className="w-full bg-white/[0.03] border border-white/8 rounded-lg px-2 py-1.5 text-[10px] text-white placeholder-white/15 focus:outline-none resize-none"/>
                </div>
                {/* Book-level settings */}
                <div className="border-t border-white/5 pt-3">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-white/20 mb-2">Book</div>
                  <div>
                    <div className="text-[9px] text-white/30 mb-1">Author</div>
                    <input value={book.author} onChange={e => setBookField('author',e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/8 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none"/>
                  </div>
                  <div className="mt-2">
                    <div className="text-[9px] text-white/30 mb-1">Synopsis</div>
                    <textarea value={book.synopsis} onChange={e => setBookField('synopsis',e.target.value)}
                      rows={3} placeholder="Brief synopsis…"
                      className="w-full bg-white/[0.03] border border-white/8 rounded-lg px-2 py-1.5 text-[10px] text-white placeholder-white/15 focus:outline-none resize-none"/>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Publish & Protect modal ── */}
      <AnimatePresence>
        {showPublish && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => !publishing && setShowPublish(false)}>
            <motion.div initial={{scale:.96,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.96,opacity:0}} transition={{duration:.15}}
              className="bg-[#141414] border border-white/8 rounded-2xl p-8 max-w-md w-full"
              onClick={e => e.stopPropagation()}>
              {publishOutcome ? (
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <Check size={24} className="text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-black text-white mb-2">Published to Lorea</h3>
                  <p className="text-xs text-white/40 leading-relaxed mb-4">
                    “{book.title}” is live in the marketplace{(parseFloat(publishPrice) || 0) > 0 ? ` at $${(parseFloat(publishPrice) || 0).toFixed(2)}` : ' as a free read'}.
                  </p>
                  {publishOutcome.certificateId ? (
                    <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 mb-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-orange-300 mb-1">Creation Certificate Queued</p>
                      <p className="text-[10px] text-white/40 leading-relaxed">
                        Your manuscript's fingerprint is being inscribed on Bitcoin via Ordinals — permanent, timestamped proof you wrote it first.
                      </p>
                      <p className="text-[9px] text-white/25 mt-2 font-mono break-all">{publishOutcome.certificateId}</p>
                    </div>
                  ) : publishOutcome.certError ? (
                    <p className="text-[10px] text-amber-400/70 mb-5">Certificate request deferred: {publishOutcome.certError}. Your book is still published; protection will retry.</p>
                  ) : null}
                  <button onClick={() => { setShowPublish(false); setPublishOutcome(null); }}
                    className="w-full py-3 rounded-xl bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-white/90 transition-colors">Done</button>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-black text-white mb-1">Publish & Protect</h3>
                  <p className="text-xs text-white/40 leading-relaxed mb-6">
                    Ship “{book.title || 'Untitled'}” to the Lorea marketplace, with optional on-chain proof of authorship.
                  </p>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Price (USD — 0 for free)</label>
                  <input type="number" min="0" step="0.01" value={publishPrice}
                    onChange={e => setPublishPrice(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white mb-4 focus:outline-none focus:border-orange-500/50" />
                  <button onClick={() => setProtectOnChain(v => !v)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors mb-6 ${protectOnChain ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/[0.03] border-white/8'}`}>
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${protectOnChain ? 'bg-orange-500 border-orange-500' : 'border-white/20'}`}>
                      {protectOnChain && <Check size={11} className="text-black" />}
                    </div>
                    <span>
                      <span className="block text-[11px] font-bold text-white/80">Creation Certificate (recommended)</span>
                      <span className="block text-[10px] text-white/35 leading-relaxed mt-0.5">
                        Inscribe a SHA-256 fingerprint of your manuscript on Bitcoin — court-friendly, timestamped proof of authorship that exists independent of Plajah.
                      </span>
                    </span>
                  </button>
                  <button onClick={handlePublish} disabled={publishing}
                    className="w-full py-3.5 rounded-xl bg-orange-500 text-black text-xs font-black uppercase tracking-widest hover:bg-orange-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {publishing ? (<><Loader2 size={14} className="animate-spin" /> Publishing…</>) : (<><Globe size={14} /> Publish to Lorea</>)}
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Continuity pass modal ── */}
      <AnimatePresence>
        {showContinuity && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => !continuityRunning && setShowContinuity(false)}>
            <motion.div initial={{scale:.96,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.96,opacity:0}} transition={{duration:.15}}
              className="bg-[#141414] border border-white/8 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}>

              <div className="flex items-start justify-between p-8 pb-5 shrink-0">
                <div>
                  <h3 className="text-lg font-black text-white mb-1 flex items-center gap-2">
                    <ScanSearch size={17} className="text-orange-400"/> Continuity Pass
                  </h3>
                  <p className="text-xs text-white/40 leading-relaxed">
                    Reads “{book.title || 'Untitled'}” whole and finds what contradicts itself across chapters.
                  </p>
                </div>
                {!continuityRunning && (
                  <button onClick={() => setShowContinuity(false)} className="p-1 text-white/25 hover:text-white transition-colors">
                    <X size={16}/>
                  </button>
                )}
              </div>

              <div className="px-8 pb-8 overflow-y-auto">
                {continuityRunning && (
                  <div className="py-12 text-center">
                    <Loader2 size={26} className="animate-spin text-orange-400 mx-auto mb-4"/>
                    <p className="text-xs text-white/50">Reading the whole manuscript…</p>
                    <p className="text-[10px] text-white/25 mt-1.5">
                      The entire book goes in as one piece, so this takes a moment.
                    </p>
                  </div>
                )}

                {continuityError && !continuityRunning && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-300/90 leading-relaxed">{continuityError}</p>
                    <button onClick={runContinuity}
                      className="mt-3 px-3 py-1.5 rounded-lg bg-white/8 text-[10px] font-black uppercase tracking-widest text-white/70 hover:bg-white/12 transition-colors">
                      Try again
                    </button>
                  </div>
                )}

                {continuityReport && !continuityRunning && (
                  <>
                    {continuityReport.summary && (
                      <p className="text-xs text-white/55 leading-relaxed mb-5 pb-5 border-b border-white/8">
                        {continuityReport.summary}
                      </p>
                    )}

                    {continuityReport.findings.length === 0 ? (
                      <div className="py-8 text-center">
                        <Check size={22} className="text-emerald-400 mx-auto mb-3"/>
                        <p className="text-sm text-white/70 font-bold">No contradictions found.</p>
                        <p className="text-[11px] text-white/35 mt-1">The manuscript reads as internally consistent.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {continuityReport.findings.map((f, i) => (
                          <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-white/8">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                                f.severity === 'high' ? 'bg-red-500/15 text-red-300'
                                : f.severity === 'medium' ? 'bg-amber-500/15 text-amber-300'
                                : 'bg-white/8 text-white/40'}`}>
                                {f.severity}
                              </span>
                              <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{f.kind}</span>
                            </div>
                            <p className="text-sm font-bold text-white/90 leading-snug mb-1.5">{f.title}</p>
                            <p className="text-[11px] text-white/45 leading-relaxed">{f.detail}</p>
                            {!!f.quotes?.length && (
                              <div className="mt-2.5 space-y-1.5">
                                {f.quotes.map((q, qi) => (
                                  <p key={qi} className="text-[10px] text-white/40 italic leading-relaxed pl-3 border-l-2 border-orange-500/30">“{q}”</p>
                                ))}
                              </div>
                            )}
                            {f.suggestion && (
                              <p className="text-[10px] text-emerald-300/70 leading-relaxed mt-2.5">→ {f.suggestion}</p>
                            )}
                            {!!f.chapters.length && (
                              <p className="text-[9px] text-white/25 mt-2.5 uppercase tracking-widest font-black">{f.chapters.join('  ·  ')}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* What the pass actually read, and what it actually cost. */}
                    <div className="mt-5 pt-4 border-t border-white/8 flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-[10px] text-white/25">
                        {continuityReport.chaptersAnalyzed} chapters · {continuityReport.wordCount.toLocaleString()} words ·{' '}
                        {continuityReport.inputTokens.toLocaleString()} tokens · {(continuityReport.elapsedMs / 1000).toFixed(1)}s ·{' '}
                        ${continuityReport.costUsd.toFixed(4)}
                      </p>
                      <button onClick={runContinuity}
                        className="px-3 py-1.5 rounded-lg bg-white/8 text-[10px] font-black uppercase tracking-widest text-white/70 hover:bg-white/12 transition-colors">
                        Re-run
                      </button>
                    </div>

                    <p className="text-[10px] text-white/25 leading-relaxed mt-3 flex items-start gap-1.5">
                      <AlertTriangle size={11} className="shrink-0 mt-0.5"/>
                      A machine read this, not an editor. Verify every finding against your own text before changing anything.
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Import modal ── */}
      <AnimatePresence>
        {showImport && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setShowImport(false)}>
            <motion.div initial={{scale:.96,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.96,opacity:0}} transition={{duration:.15}}
              className="bg-[#141414] border border-white/8 rounded-2xl p-8 max-w-md w-full"
              onClick={e => e.stopPropagation()}
              onDragOver={e => { e.preventDefault(); setImportDragging(true); }}
              onDragLeave={() => setImportDragging(false)}
              onDrop={e => { e.preventDefault(); setImportDragging(false); const f=e.dataTransfer.files[0]; if(f) handleImportFile(f); }}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold">Import a document</h3>
                <button onClick={() => setShowImport(false)} className="text-white/20 hover:text-white transition-colors"><X size={16}/></button>
              </div>
              <div className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-200 ${importDragging ? 'border-orange-400 bg-orange-500/5' : 'border-white/8 hover:border-white/15'}`}>
                <Upload size={24} className={`mx-auto mb-3 transition-colors ${importDragging ? 'text-orange-400' : 'text-white/15'}`}/>
                <p className="text-sm text-white/50 mb-1">Drop a file or click to browse</p>
                <p className="text-xs text-white/20">Word (.docx) · PDF · Markdown (.md) · Plain text (.txt) · Fountain</p>
                <button onClick={() => importRef.current?.click()}
                  className="mt-5 px-5 py-2 bg-orange-500 text-black text-sm font-bold rounded-xl hover:bg-orange-400 transition-colors">
                  Choose file
                </button>
                <input ref={importRef} type="file" accept=".txt,.text,.md,.markdown,.docx,.pdf,.fountain" className="hidden"
                  onChange={e => { const f=e.target.files?.[0]; if(f) handleImportFile(f); }}/>
              </div>
              <div className="mt-4 space-y-2 text-xs text-white/25">
                <p>✓ <span className="text-white/40">Word, PDF, Markdown & text</span> — imported instantly in your browser, no server needed</p>
                <p>✓ <span className="text-white/40">Headings</span> — become chapter breaks automatically; bold & italics are preserved</p>
                <p>✓ <span className="text-white/40">Google Docs</span> — File → Download → Word (.docx), then import that file</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
