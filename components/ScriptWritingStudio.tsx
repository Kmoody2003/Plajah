import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ChevronLeft, Download, Sparkles, Plus, Trash2, Film,
  Users, Globe, List, FileText, X, ChevronDown, ChevronUp,
  Maximize2, Minimize2, Search, Hash, MapPin, User,
  MessageSquare, Check, BookOpen, Clock, RefreshCw,
  Copy, Share2, Palette, Layers, Eye, EyeOff,
  Lock, Unlock, ChevronRight, Star, Zap, Settings,
  AlignLeft, AlignCenter, Edit3, Upload, FileUp, AlertCircle,
} from 'lucide-react';
import { db, auth } from '../services/firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection } from 'firebase/firestore';
import {
  fetchWorldCharacters, fetchWorldLore, fetchUserWorlds,
  createTimelineEvent,
} from '../services/backendService';
import {
  extractDocument, screenplayFromText,
  SUPPORTED_IMPORT_ACCEPT, isSupportedImport,
} from '../services/documentImport';
import type {
  Character, LoreEntry, IPWorld,
  ScriptData, ScriptElement, ScriptElementType,
  ScriptBeat, ScriptTitlePage, ScriptFormat, RevisionColor,
} from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const REVISION_COLORS: { id: RevisionColor; hex: string; label: string }[] = [
  { id: 'WHITE',     hex: '#ffffff', label: 'White (WFR)' },
  { id: 'BLUE',      hex: '#93c5fd', label: 'Blue (1st Rev)' },
  { id: 'PINK',      hex: '#f9a8d4', label: 'Pink (2nd Rev)' },
  { id: 'YELLOW',    hex: '#fde047', label: 'Yellow (3rd Rev)' },
  { id: 'GREEN',     hex: '#86efac', label: 'Green (4th Rev)' },
  { id: 'GOLDENROD', hex: '#fbbf24', label: 'Goldenrod (5th Rev)' },
];

const FORMAT_LABELS: Record<ScriptFormat, string> = {
  FEATURE_FILM: 'Feature Film',
  TV_PILOT:     'TV Pilot',
  TV_EPISODE:   'TV Episode',
  SHORT_FILM:   'Short Film',
  WEB_SERIES:   'Web Series',
  STAGE_PLAY:   'Stage Play',
  AUDIO_DRAMA:  'Audio Drama',
};

const ELEMENT_LABELS: Record<ScriptElementType, string> = {
  SCENE_HEADING: 'Scene Heading',
  ACTION:        'Action',
  CHARACTER:     'Character',
  DIALOGUE:      'Dialogue',
  PARENTHETICAL: 'Parenthetical',
  TRANSITION:    'Transition',
  SHOT:          'Shot',
  SECTION:       'Section',
  NOTE:          'Note',
};

const SAVE_THE_CAT_BEATS: Omit<ScriptBeat, 'id' | 'sceneElementId'>[] = [
  { label: 'Opening Image',        description: 'A snapshot of the hero\'s flawed world before the journey begins.',  pageTarget: 1,   actNumber: 1, beatType: 'OPENING_IMAGE',   color: '#6366f1' },
  { label: 'Theme Stated',         description: 'Someone tells the hero (obliquely) what the story is about.',         pageTarget: 5,   actNumber: 1, beatType: 'THEME_STATED',    color: '#8b5cf6' },
  { label: 'Set-Up',               description: 'Introduce all the characters and establish the hero\'s world.',        pageTarget: 10,  actNumber: 1, beatType: 'SETUP',           color: '#a78bfa' },
  { label: 'Catalyst',             description: 'Something happens that changes the hero\'s world forever.',           pageTarget: 12,  actNumber: 1, beatType: 'CATALYST',        color: '#f59e0b' },
  { label: 'Debate',               description: 'The hero resists the change. Should I go? Should I stay?',            pageTarget: 20,  actNumber: 1, beatType: 'DEBATE',          color: '#ef4444' },
  { label: 'Break Into Two',       description: 'The hero makes a choice to enter the upside-down world.',             pageTarget: 25,  actNumber: 2, beatType: 'BREAK_INTO_TWO',  color: '#f97316' },
  { label: 'B Story',              description: 'A new character or relationship is introduced (often the love story).', pageTarget: 30, actNumber: 2, beatType: 'B_STORY',         color: '#84cc16' },
  { label: 'Fun and Games',        description: 'The "promise of the premise." The movie is really cooking.',          pageTarget: 45,  actNumber: 2, beatType: 'FUN_AND_GAMES',   color: '#22c55e' },
  { label: 'Midpoint',             description: 'A false victory or false defeat. Stakes are raised.',                 pageTarget: 55,  actNumber: 2, beatType: 'MIDPOINT',        color: '#06b6d4' },
  { label: 'Bad Guys Close In',    description: 'The hero\'s plan falls apart. External/internal forces converge.',    pageTarget: 70,  actNumber: 2, beatType: 'BAD_GUYS',        color: '#3b82f6' },
  { label: 'All Is Lost',          description: 'The worst moment. The hero has lost everything.',                     pageTarget: 75,  actNumber: 2, beatType: 'ALL_IS_LOST',     color: '#ef4444' },
  { label: 'Dark Night of Soul',   description: 'The hero wallows in defeat. What went wrong?',                       pageTarget: 80,  actNumber: 2, beatType: 'DARK_NIGHT',      color: '#6b7280' },
  { label: 'Break Into Three',     description: 'The hero discovers a new solution by combining A and B stories.',     pageTarget: 85,  actNumber: 3, beatType: 'BREAK_INTO_THREE', color: '#f59e0b' },
  { label: 'Finale',               description: 'The hero executes the new plan, defeats the villain, changes.',       pageTarget: 95,  actNumber: 3, beatType: 'FINALE',          color: '#FF8C00' },
  { label: 'Final Image',          description: 'Mirror of the opening image — the hero\'s transformed world.',        pageTarget: 100, actNumber: 3, beatType: 'FINAL_IMAGE',     color: '#6366f1' },
];

const TV_BEATS: Omit<ScriptBeat, 'id' | 'sceneElementId'>[] = [
  { label: 'Cold Open / Teaser', description: 'Grab the audience before the title card.', pageTarget: 4,  actNumber: 1, beatType: 'COLD_OPEN',  color: '#6366f1' },
  { label: 'Act One Setup',      description: 'Establish the episode\'s world and problem.', pageTarget: 12, actNumber: 1, beatType: 'ACT_ONE',    color: '#8b5cf6' },
  { label: 'Act One Break',      description: 'First act-out on a cliffhanger.',           pageTarget: 17, actNumber: 1, beatType: 'ACT_ONE_OUT', color: '#f59e0b' },
  { label: 'Act Two Rise',       description: 'Problem complicates, stakes escalate.',     pageTarget: 25, actNumber: 2, beatType: 'ACT_TWO',    color: '#22c55e' },
  { label: 'Midpoint',           description: 'Big revelation or reversal.',               pageTarget: 28, actNumber: 2, beatType: 'MIDPOINT',   color: '#06b6d4' },
  { label: 'Act Two Break',      description: 'Second act-out — all seems lost.',          pageTarget: 33, actNumber: 2, beatType: 'ACT_TWO_OUT', color: '#ef4444' },
  { label: 'Act Three',          description: 'Build to climax, resolve A and B stories.', pageTarget: 40, actNumber: 3, beatType: 'ACT_THREE',  color: '#f97316' },
  { label: 'Tag',                description: 'Brief coda / button that closes the episode.', pageTarget: 44, actNumber: 3, beatType: 'TAG',       color: '#84cc16' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);

const makeEl = (type: ScriptElementType, text = ''): ScriptElement => ({ id: uid(), type, text });

const LINES_PER_PAGE = 55;

function estimatePages(elements: ScriptElement[]): number {
  let lines = 0;
  for (const el of elements) {
    if (el.type === 'SCENE_HEADING') { lines += 2; continue; }
    if (el.type === 'TRANSITION')   { lines += 2; continue; }
    if (el.type === 'SECTION')      { continue; }
    if (el.type === 'NOTE')         { continue; }
    const words = el.text.split(/\s+/).filter(Boolean).length;
    const charsPerLine = el.type === 'DIALOGUE' ? 35 : el.type === 'ACTION' ? 60 : 35;
    const textLines = Math.max(1, Math.ceil((el.text.length || 1) / charsPerLine));
    lines += textLines + 1;
  }
  return Math.max(1, Math.round(lines / LINES_PER_PAGE));
}

function toFountain(data: ScriptData): string {
  const tp = data.titlePage;
  let out = `Title: ${tp.title}\nCredit: Written by\nAuthor: ${tp.writtenBy}\nDraft date: ${tp.draftDate}\n\n===\n\n`;
  for (const el of data.elements) {
    switch (el.type) {
      case 'SCENE_HEADING':   out += `\n${el.text.toUpperCase()}\n\n`; break;
      case 'ACTION':          out += `${el.text}\n\n`; break;
      case 'CHARACTER':       out += `\n${el.text.toUpperCase()}\n`; break;
      case 'DIALOGUE':        out += `${el.text}\n\n`; break;
      case 'PARENTHETICAL':   out += `(${el.text.replace(/^\(|\)$/g, '')})\n`; break;
      case 'TRANSITION':      out += `\n${el.text.toUpperCase()}:\n\n`; break;
      case 'SHOT':            out += `\n${el.text.toUpperCase()}\n\n`; break;
      case 'SECTION':         out += `\n# ${el.text}\n\n`; break;
      case 'NOTE':            out += `/* ${el.text} */\n\n`; break;
    }
  }
  return out;
}

function sceneLabel(text: string) {
  const m = text.match(/^(INT|EXT|INT\.\/EXT|EXT\.\/INT)[\.\s]+(.+?)\s*[-–—]\s*(.+)$/i);
  if (m) return { intExt: m[1].toUpperCase(), location: m[2].trim(), time: m[3].trim() };
  return { intExt: '', location: text.trim(), time: '' };
}

// ── Keyboard next-type map ────────────────────────────────────────────────────

function nextTypeOnEnter(
  type: ScriptElementType,
  isEmpty: boolean,
): ScriptElementType {
  if (isEmpty) {
    if (type === 'DIALOGUE')      return 'ACTION';
    if (type === 'ACTION')        return 'SCENE_HEADING';
    if (type === 'PARENTHETICAL') return 'CHARACTER';
    return type;
  }
  const map: Partial<Record<ScriptElementType, ScriptElementType>> = {
    SCENE_HEADING:  'ACTION',
    ACTION:         'ACTION',
    CHARACTER:      'DIALOGUE',
    DIALOGUE:       'CHARACTER',
    PARENTHETICAL:  'DIALOGUE',
    TRANSITION:     'SCENE_HEADING',
    SHOT:           'ACTION',
    SECTION:        'ACTION',
    NOTE:           'ACTION',
  };
  return map[type] ?? 'ACTION';
}

function nextTypeOnTab(type: ScriptElementType): ScriptElementType {
  const cycle: Partial<Record<ScriptElementType, ScriptElementType>> = {
    ACTION:        'CHARACTER',
    CHARACTER:     'PARENTHETICAL',
    PARENTHETICAL: 'TRANSITION',
    TRANSITION:    'SCENE_HEADING',
    SCENE_HEADING: 'ACTION',
    DIALOGUE:      'ACTION',
    SHOT:          'ACTION',
  };
  return cycle[type] ?? 'ACTION';
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  scriptId?: string;
  initialWorldId?: string;
  initialFormat?: ScriptFormat;
  onBack: () => void;
  user: any;
  onNavigate?: (view: string) => void;
}

export default function ScriptWritingStudio({
  scriptId: propScriptId,
  initialWorldId,
  initialFormat = 'FEATURE_FILM',
  onBack,
  user,
  onNavigate,
}: Props) {

  // ── Core script state ──────────────────────────────────────────────────────
  const [scriptId]   = useState(() => propScriptId ?? `scr_${uid()}`);
  const [format, setFormat]     = useState<ScriptFormat>(initialFormat);
  const [elements, setElements] = useState<ScriptElement[]>([
    makeEl('SCENE_HEADING', 'INT. LOCATION - DAY'),
    makeEl('ACTION', ''),
  ]);
  const [beats, setBeats]     = useState<ScriptBeat[]>([]);
  const [titlePage, setTitlePage] = useState<ScriptTitlePage>({
    title: 'Untitled Script',
    writtenBy: user?.displayName ?? '',
    draftDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  });
  const [logline, setLogline]   = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [linkedWorldId, setLinkedWorldId] = useState<string | undefined>(initialWorldId);
  const [currentRevColor, setCurrentRevColor] = useState<RevisionColor>('WHITE');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activeId, setActiveId]       = useState<string | null>(elements[1]?.id ?? null);
  const [sidebarTab, setSidebarTab]   = useState<'SCENES' | 'BEATS' | 'CAST' | 'WORLD'>('SCENES');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showRight, setShowRight]     = useState(false);
  const [rightTab, setRightTab]       = useState<'PROPERTIES' | 'NOTES' | 'AI' | 'EXPORT'>('PROPERTIES');
  const [showTitlePage, setShowTitlePage] = useState(false);
  const [isFullscreen, setIsFullscreen]   = useState(false);
  const [sceneSearch, setSceneSearch]     = useState('');
  const [showRevMenu, setShowRevMenu]     = useState(false);
  const [showFormatMenu, setShowFormatMenu] = useState(false);

  // ── Import state ─────────────────────────────────────────────────────────────
  const [showImport, setShowImport]   = useState(false);
  const [importDragging, setImportDragging] = useState(false);
  const [importing, setImporting]     = useState(false);
  const [importError, setImportError] = useState('');
  const [importMode, setImportMode]   = useState<'REPLACE' | 'APPEND'>('REPLACE');
  const importInputRef = useRef<HTMLInputElement>(null);

  // ── World state ────────────────────────────────────────────────────────────
  const [worldCharacters, setWorldCharacters]   = useState<Character[]>([]);
  const [worldLocations, setWorldLocations]     = useState<LoreEntry[]>([]);
  const [userWorlds, setUserWorlds]             = useState<IPWorld[]>([]);
  const [linkedWorld, setLinkedWorld]           = useState<IPWorld | null>(null);
  const [worldSearch, setWorldSearch]           = useState('');
  const [showWorldSearch, setShowWorldSearch]   = useState(false);
  const [addingToTimeline, setAddingToTimeline] = useState(false);
  const [timelineYear, setTimelineYear]         = useState('');

  // ── Autocomplete state ─────────────────────────────────────────────────────
  const [charSuggest, setCharSuggest]     = useState<string[]>([]);
  const [locSuggest, setLocSuggest]       = useState<string[]>([]);
  const [showSuggest, setShowSuggest]     = useState(false);
  const [suggestPos, setSuggestPos]       = useState({ top: 0, left: 0 });

  // ── Save / AI state ────────────────────────────────────────────────────────
  const [isSaving, setIsSaving]     = useState(false);
  const [lastSaved, setLastSaved]   = useState<Date | null>(null);
  const [sceneNotes, setSceneNotes] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiOutput, setAiOutput]     = useState('');
  const [coverage, setCoverage]     = useState('');

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const editorRef = useRef<HTMLDivElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const scenes = useMemo(() =>
    elements
      .filter(e => e.type === 'SCENE_HEADING')
      .map((e, i) => ({ ...e, num: i + 1, ...sceneLabel(e.text) })),
    [elements],
  );

  const castList = useMemo(() => {
    const names = new Set<string>();
    for (const e of elements)
      if (e.type === 'CHARACTER' && e.text.trim()) names.add(e.text.trim().toUpperCase());
    return Array.from(names).sort();
  }, [elements]);

  const pageCount = useMemo(() => estimatePages(elements), [elements]);

  const activeElement = useMemo(() =>
    elements.find(e => e.id === activeId), [elements, activeId]);

  const activeScene = useMemo(() => {
    let last: (typeof scenes)[0] | null = null;
    const idx = elements.findIndex(e => e.id === activeId);
    for (let i = idx; i >= 0; i--) {
      const e = elements[i];
      if (e.type === 'SCENE_HEADING') {
        last = scenes.find(s => s.id === e.id) ?? null;
        break;
      }
    }
    return last;
  }, [activeId, elements, scenes]);

  // ── Load from Firestore ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'scripts', scriptId)).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data() as ScriptData;
      if (d.elements?.length)   setElements(d.elements);
      if (d.beats?.length)      setBeats(d.beats);
      if (d.titlePage)          setTitlePage(d.titlePage);
      if (d.format)             setFormat(d.format);
      if (d.logline)            setLogline(d.logline);
      if (d.synopsis)           setSynopsis(d.synopsis);
      if (d.linkedWorldId)      setLinkedWorldId(d.linkedWorldId);
      if (d.currentRevisionColor) setCurrentRevColor(d.currentRevisionColor);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId]);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const saveNow = useCallback(async () => {
    if (!auth.currentUser) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'scripts', scriptId), {
        id: scriptId,
        ownerId: auth.currentUser.uid,
        format,
        logline,
        synopsis,
        titlePage,
        elements,
        beats,
        linkedWorldId: linkedWorldId ?? null,
        currentRevisionColor: currentRevColor,
        pageCount,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      } as any, { merge: true });
      setLastSaved(new Date());
    } catch (e) {
      console.error('Script save error:', e);
    } finally {
      setIsSaving(false);
    }
  }, [scriptId, format, logline, synopsis, titlePage, elements, beats, linkedWorldId, currentRevColor, pageCount]);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveNow, 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [saveNow]);

  // ── World integration ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    fetchUserWorlds(user.uid).then(setUserWorlds).catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    if (!linkedWorldId) { setWorldCharacters([]); setWorldLocations([]); setLinkedWorld(null); return; }
    fetchWorldCharacters(linkedWorldId, false).then(chars => setWorldCharacters(chars as Character[])).catch(() => {});
    fetchWorldLore(linkedWorldId, false).then(lore => {
      const loreArr = lore as LoreEntry[];
      setWorldLocations(loreArr.filter(l => l.type === 'LOCATION' || l.type === 'ENVIRONMENT'));
    }).catch(() => {});
    const found = userWorlds.find(w => w.id === linkedWorldId);
    if (found) setLinkedWorld(found);
  }, [linkedWorldId, userWorlds]);

  // ── Beat sheet init ───────────────────────────────────────────────────────
  useEffect(() => {
    if (beats.length > 0) return;
    const template = (format === 'TV_PILOT' || format === 'TV_EPISODE' || format === 'WEB_SERIES')
      ? TV_BEATS : SAVE_THE_CAT_BEATS;
    setBeats(template.map(b => ({ ...b, id: uid() })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format]);

  // ── Autocomplete pools ────────────────────────────────────────────────────
  useEffect(() => {
    const worldNames = worldCharacters.map(c => c.name.toUpperCase());
    const scriptNames = castList;
    setCharSuggest(Array.from(new Set([...worldNames, ...scriptNames])));
  }, [worldCharacters, castList]);

  useEffect(() => {
    const worldLocs = worldLocations.map(l => l.title.toUpperCase());
    const scriptLocs = scenes.map(s => s.location.toUpperCase()).filter(Boolean);
    setLocSuggest(Array.from(new Set([...worldLocs, ...scriptLocs])));
  }, [worldLocations, scenes]);

  // ── Element CRUD ──────────────────────────────────────────────────────────
  const updateEl = useCallback((id: string, text: string) => {
    setElements(prev => prev.map(e => e.id === id ? { ...e, text } : e));
  }, []);

  const updateElType = useCallback((id: string, type: ScriptElementType) => {
    setElements(prev => prev.map(e => e.id === id ? { ...e, type } : e));
  }, []);

  const insertAfter = useCallback((afterId: string, type: ScriptElementType, text = '') => {
    const newEl = makeEl(type, text);
    setElements(prev => {
      const idx = prev.findIndex(e => e.id === afterId);
      if (idx === -1) return [...prev, newEl];
      return [...prev.slice(0, idx + 1), newEl, ...prev.slice(idx + 1)];
    });
    setActiveId(newEl.id);
    setTimeout(() => textareaRefs.current.get(newEl.id)?.focus(), 0);
    return newEl.id;
  }, []);

  const deleteEl = useCallback((id: string) => {
    setElements(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(e => e.id === id);
      const next = prev.filter(e => e.id !== id);
      const focusIdx = Math.max(0, idx - 1);
      setActiveId(next[focusIdx]?.id ?? null);
      setTimeout(() => {
        const el = next[focusIdx];
        if (el) textareaRefs.current.get(el.id)?.focus();
      }, 0);
      return next;
    });
  }, []);

  const moveEl = useCallback((id: string, dir: -1 | 1) => {
    setElements(prev => {
      const idx = prev.findIndex(e => e.id === id);
      const to = idx + dir;
      if (to < 0 || to >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[to]] = [arr[to], arr[idx]];
      return arr;
    });
  }, []);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  const handleKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    el: ScriptElement,
  ) => {
    const ta = e.currentTarget;
    const isEmpty = !el.text.trim();
    const atEnd = ta.selectionStart === el.text.length;

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab: reverse cycle
        const rev: Partial<Record<ScriptElementType, ScriptElementType>> = {
          CHARACTER:     'ACTION',
          PARENTHETICAL: 'CHARACTER',
          TRANSITION:    'PARENTHETICAL',
          SCENE_HEADING: 'TRANSITION',
        };
        updateElType(el.id, rev[el.type] ?? el.type);
      } else {
        updateElType(el.id, nextTypeOnTab(el.type));
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!atEnd && !isEmpty) {
        // Split: keep text before cursor in current, create new with text after
        const before = el.text.slice(0, ta.selectionStart);
        const after  = el.text.slice(ta.selectionStart);
        updateEl(el.id, before);
        insertAfter(el.id, el.type, after);
        return;
      }
      const nextType = nextTypeOnEnter(el.type, isEmpty && atEnd);
      insertAfter(el.id, nextType);
      return;
    }

    if (e.key === 'Backspace' && isEmpty) {
      e.preventDefault();
      deleteEl(el.id);
      return;
    }

    if (e.key === 'ArrowUp' && ta.selectionStart === 0) {
      const idx = elements.findIndex(x => x.id === el.id);
      if (idx > 0) {
        const prev = elements[idx - 1];
        setActiveId(prev.id);
        setTimeout(() => {
          const pta = textareaRefs.current.get(prev.id);
          if (pta) { pta.focus(); pta.selectionStart = pta.selectionEnd = pta.value.length; }
        }, 0);
      }
      return;
    }

    if (e.key === 'ArrowDown' && atEnd) {
      const idx = elements.findIndex(x => x.id === el.id);
      if (idx < elements.length - 1) {
        const nxt = elements[idx + 1];
        setActiveId(nxt.id);
        setTimeout(() => {
          const nta = textareaRefs.current.get(nxt.id);
          if (nta) { nta.focus(); nta.selectionStart = nta.selectionEnd = 0; }
        }, 0);
      }
    }
  }, [elements, updateEl, updateElType, insertAfter, deleteEl]);

  // ── AI Assist ─────────────────────────────────────────────────────────────
  const runAI = useCallback(async (mode: 'CONTINUE' | 'COVERAGE' | 'LOGLINE' | 'REWRITE') => {
    if (!user) return;
    setAiLoading(true);
    setAiOutput('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const context = elements
        .slice(Math.max(0, elements.findIndex(e => e.id === activeId) - 10),
               elements.findIndex(e => e.id === activeId) + 1)
        .map(e => {
          if (e.type === 'SCENE_HEADING') return e.text.toUpperCase();
          if (e.type === 'CHARACTER')     return `\n          ${e.text.toUpperCase()}`;
          if (e.type === 'DIALOGUE')      return `     ${e.text}`;
          return e.text;
        }).join('\n');

      const prompts: Record<string, string> = {
        CONTINUE: `You are a professional screenplay writer. Continue the scene naturally after this excerpt from a ${FORMAT_LABELS[format]} script titled "${titlePage.title}".\n\nSCRIPT SO FAR:\n${context}\n\nWrite the next 10–15 lines of screenplay in standard format (scene headings, action, dialogue). Be cinematic and true to the established tone.`,
        COVERAGE: `Write a professional script coverage note for this ${FORMAT_LABELS[format]} titled "${titlePage.title}" by ${titlePage.writtenBy}.\n\nLogline: ${logline || '[not provided]'}\nSynopsis: ${synopsis || '[not provided]'}\n\nProvide: LOGLINE evaluation (1 sentence), PREMISE strength, STRUCTURE assessment, CHARACTERS, DIALOGUE, MARKETABILITY, and a RECOMMENDATION (CONSIDER / PASS / RECOMMEND). Keep each section to 2-3 sentences.`,
        LOGLINE: `Write 3 logline options for a ${FORMAT_LABELS[format]} with this synopsis: ${synopsis || elements.filter(e => e.type === 'ACTION').slice(0, 3).map(e => e.text).join(' ')}. Format as numbered list. Each logline should be one punchy sentence under 40 words with protagonist, conflict, and stakes.`,
        REWRITE: `Rewrite this screenplay dialogue exchange to be sharper and more cinematic. Keep character names and story beats identical, only improve the language:\n\n${context}`,
      };

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sessionId: `script-ai-${scriptId}`,
          message: prompts[mode],
          tier: user?.tier ?? 'FREE',
        }),
      });
      const data = await res.json();
      const reply = data.reply || data.message || '';
      setAiOutput(reply);
      if (mode === 'COVERAGE') setCoverage(reply);
    } catch (e) {
      console.error('AI error:', e);
      setAiOutput('Unable to reach AI. Check your connection.');
    } finally {
      setAiLoading(false);
    }
  }, [activeId, elements, format, titlePage, logline, synopsis, scriptId, user]);

  // ── Export ────────────────────────────────────────────────────────────────
  const exportFountain = useCallback(() => {
    const scriptData: ScriptData = { id: scriptId, format, titlePage, elements, beats, logline, synopsis };
    const text = toFountain(scriptData);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${titlePage.title.replace(/\s+/g, '_')}.fountain`;
    a.click(); URL.revokeObjectURL(url);
  }, [scriptId, format, titlePage, elements, beats, logline, synopsis]);

  const exportPrint = useCallback(() => window.print(), []);

  // ── Import a manuscript (.docx / .pdf / .txt / .fountain / .md) ─────────────
  const importDocument = useCallback(async (file: File) => {
    setImportError('');
    if (!isSupportedImport(file.name)) {
      setImportError('Unsupported file. Use .docx, .pdf, .txt, .fountain, or .md — Google Docs export to any of these.');
      return;
    }
    setImporting(true);
    try {
      const { title, plainText } = await extractDocument(file);
      const parsed = screenplayFromText(plainText);
      if (!parsed.length) {
        setImportError('No readable text found in that file.');
        setImporting(false);
        return;
      }
      setElements(prev => importMode === 'APPEND' ? [...prev, ...parsed] : parsed);
      setActiveId(parsed[0]?.id ?? null);
      // Adopt the document's title when the script is still untitled.
      if (importMode === 'REPLACE' && title &&
          (!titlePage.title || /^untitled/i.test(titlePage.title))) {
        setTitlePage(p => ({ ...p, title }));
      }
      setShowImport(false);
    } catch (e: any) {
      console.error('[ScriptImport]', e);
      setImportError(e?.message || 'Could not read that file.');
    } finally {
      setImporting(false);
    }
  }, [importMode, titlePage.title]);

  const onImportPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) importDocument(f);
    e.target.value = ''; // allow re-picking the same file
  }, [importDocument]);

  // ── Add to World Timeline ─────────────────────────────────────────────────
  const addToTimeline = useCallback(async () => {
    if (!linkedWorldId || !timelineYear) return;
    setAddingToTimeline(true);
    try {
      await createTimelineEvent({
        worldId: linkedWorldId,
        title: titlePage.title,
        year: parseInt(timelineYear, 10) || 0,
        description: logline || synopsis || '',
        linkedAssetIds: [scriptId],
        tags: [FORMAT_LABELS[format]],
      } as any);
      setAddingToTimeline(false);
      setTimelineYear('');
    } catch (e) {
      console.error('Timeline error:', e);
      setAddingToTimeline(false);
    }
  }, [linkedWorldId, timelineYear, titlePage.title, logline, synopsis, scriptId, format]);

  // ── Auto-resize textareas ─────────────────────────────────────────────────
  const resizeTA = useCallback((ta: HTMLTextAreaElement | null) => {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  const refCallback = useCallback((id: string) => (ta: HTMLTextAreaElement | null) => {
    if (ta) textareaRefs.current.set(id, ta);
    else textareaRefs.current.delete(id);
    resizeTA(ta);
  }, [resizeTA]);

  // ── Element style helpers ─────────────────────────────────────────────────
  function elContainerClass(type: ScriptElementType, isActive: boolean): string {
    const base = 'relative group';
    const active = isActive ? 'bg-orange-500/5' : 'hover:bg-black/5';
    return `${base} ${active}`;
  }

  function elStyle(type: ScriptElementType): React.CSSProperties {
    const base: React.CSSProperties = {
      fontFamily: '"Courier Prime", "Courier New", Courier, monospace',
      fontSize: '12pt',
      lineHeight: '1.5',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      resize: 'none',
      overflow: 'hidden',
      width: '100%',
      padding: '0',
      color: '#111',
      display: 'block',
    };
    switch (type) {
      case 'SCENE_HEADING':  return { ...base, textTransform: 'uppercase', fontWeight: 'bold', paddingTop: '24px' };
      case 'ACTION':         return { ...base, paddingTop: '12px' };
      case 'CHARACTER':      return { ...base, marginLeft: '37%', width: '26%', textTransform: 'uppercase', paddingTop: '12px' };
      case 'DIALOGUE':       return { ...base, marginLeft: '23%', width: '54%', paddingTop: '0' };
      case 'PARENTHETICAL':  return { ...base, marginLeft: '28%', width: '44%', fontStyle: 'italic', paddingTop: '0' };
      case 'TRANSITION':     return { ...base, textAlign: 'right', textTransform: 'uppercase', paddingTop: '12px', paddingBottom: '12px' };
      case 'SHOT':           return { ...base, textTransform: 'uppercase', fontWeight: 'bold', paddingTop: '12px' };
      case 'SECTION':        return { ...base, color: '#FF8C00', fontWeight: 'bold', paddingTop: '12px', background: 'rgba(255, 140, 0, 0.05)' };
      case 'NOTE':           return { ...base, color: '#888', fontStyle: 'italic', fontSize: '10pt' };
      default:               return base;
    }
  }

  // ── Render: Scene list suggestions ────────────────────────────────────────
  function renderSceneSuggestionBar(el: ScriptElement) {
    if (el.type !== 'SCENE_HEADING') return null;
    const text = el.text.toUpperCase();
    const hasPrefix = /^(INT|EXT)/.test(text);
    return (
      <div className="flex items-center gap-1.5 pt-1 pb-0.5 flex-wrap">
        {!hasPrefix && ['INT.', 'EXT.', 'INT./EXT.'].map(p => (
          <button key={p}
            onMouseDown={e => { e.preventDefault(); updateEl(el.id, `${p} `); setTimeout(() => textareaRefs.current.get(el.id)?.focus(), 0); }}
            className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-orange-500/15 text-orange-600 hover:bg-orange-500/30 transition-colors">
            {p}
          </button>
        ))}
        {!text.includes(' - ') && hasPrefix && ['DAY', 'NIGHT', 'DUSK', 'DAWN', 'CONTINUOUS', 'LATER'].map(t => (
          <button key={t}
            onMouseDown={e => { e.preventDefault(); const cur = el.text.replace(/\s*$/, ''); updateEl(el.id, `${cur} - ${t}`); setTimeout(() => { const ta = textareaRefs.current.get(el.id); if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; } }, 0); }}
            className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 hover:bg-blue-500/30 transition-colors">
            {t}
          </button>
        ))}
        {locSuggest.slice(0, 4).map(loc => (
          <button key={loc}
            onMouseDown={e => { e.preventDefault(); const prefix = text.match(/^(INT|EXT)[./]*/)?.[0] ?? 'INT.'; updateEl(el.id, `${prefix} ${loc} - `); setTimeout(() => { const ta = textareaRefs.current.get(el.id); if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; } }, 0); }}
            className="text-[9px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors truncate max-w-[120px]">
            {loc}
          </button>
        ))}
      </div>
    );
  }

  function renderCharacterSuggestions(el: ScriptElement) {
    if (el.type !== 'CHARACTER') return null;
    const q = el.text.toUpperCase();
    const matches = charSuggest.filter(n => n !== q && n.startsWith(q) && q.length > 0).slice(0, 5);
    if (!matches.length) return null;
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {matches.map(n => (
          <button key={n}
            onMouseDown={e => { e.preventDefault(); updateEl(el.id, n); setTimeout(() => { const ta = textareaRefs.current.get(el.id); if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; } }, 0); }}
            className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-purple-500/15 text-purple-600 hover:bg-purple-500/30 transition-colors">
            {n}
          </button>
        ))}
      </div>
    );
  }

  // ── Render: Title Page ────────────────────────────────────────────────────
  function renderTitlePage() {
    return (
      <div className="w-full max-w-[8.5in] mx-auto bg-white shadow-2xl rounded-sm"
           style={{ minHeight: '11in', fontFamily: '"Courier Prime", Courier, monospace', padding: '1in 1.5in' }}>
        <div className="flex flex-col items-center justify-center" style={{ minHeight: '3in' }}>
          <input
            className="text-center text-black font-bold text-xl outline-none border-none bg-transparent w-full uppercase"
            value={titlePage.title}
            onChange={e => setTitlePage(p => ({ ...p, title: e.target.value }))}
            placeholder="TITLE"
          />
          <div className="mt-8 text-center text-sm text-black">
            <div>Written by</div>
            <input
              className="text-center text-black outline-none border-none bg-transparent mt-1"
              value={titlePage.writtenBy}
              onChange={e => setTitlePage(p => ({ ...p, writtenBy: e.target.value }))}
              placeholder="Author Name"
            />
          </div>
          {titlePage.basedOn && (
            <div className="mt-4 text-center text-sm text-black">
              <div>Based on</div>
              <div>{titlePage.basedOn}</div>
            </div>
          )}
        </div>
        <div className="mt-auto pt-48 text-sm text-black">
          <input
            className="block outline-none border-none bg-transparent"
            value={titlePage.contact ?? ''}
            onChange={e => setTitlePage(p => ({ ...p, contact: e.target.value }))}
            placeholder="Contact info"
          />
          <input
            className="block outline-none border-none bg-transparent"
            value={titlePage.address ?? ''}
            onChange={e => setTitlePage(p => ({ ...p, address: e.target.value }))}
            placeholder="Address / representation"
          />
          <input
            className="block outline-none border-none bg-transparent"
            value={titlePage.wgaNumber ?? ''}
            onChange={e => setTitlePage(p => ({ ...p, wgaNumber: e.target.value }))}
            placeholder="WGA Registration #"
          />
          <div className="mt-2">{titlePage.draftDate}</div>
        </div>
      </div>
    );
  }

  // ── Render: Single element row ────────────────────────────────────────────
  function renderElement(el: ScriptElement) {
    const isActive = el.id === activeId;
    const revDot = el.revColor && el.revColor !== 'WHITE'
      ? REVISION_COLORS.find(r => r.id === el.revColor)?.hex
      : null;

    return (
      <div key={el.id} className={elContainerClass(el.type, isActive)}
           onClick={() => setActiveId(el.id)}>
        {/* Element type label (visible on hover or when active) */}
        <div className={`absolute left-0 top-0 text-[7px] font-black uppercase tracking-widest transition-opacity ${isActive ? 'opacity-60' : 'opacity-0 group-hover:opacity-30'} text-gray-400 leading-none pt-1 pl-1`}
             style={{ marginTop: el.type === 'SCENE_HEADING' ? '24px' : '14px' }}>
          {ELEMENT_LABELS[el.type]}
        </div>

        {/* Revision color dot */}
        {revDot && (
          <div className="absolute top-2 right-1 w-2 h-2 rounded-full" style={{ background: revDot }} />
        )}

        {/* Lock indicator */}
        {el.locked && (
          <div className="absolute top-2 right-4 opacity-30">
            <Lock size={8} />
          </div>
        )}

        {/* Scene heading helper bar */}
        {isActive && el.type === 'SCENE_HEADING' && renderSceneSuggestionBar(el)}
        {isActive && el.type === 'CHARACTER' && renderCharacterSuggestions(el)}

        {/* Textarea */}
        <textarea
          ref={refCallback(el.id)}
          value={el.text}
          rows={1}
          readOnly={el.locked}
          placeholder={el.type === 'SCENE_HEADING' ? 'INT. LOCATION - DAY'
            : el.type === 'ACTION' ? 'Action / description...'
            : el.type === 'CHARACTER' ? 'CHARACTER NAME'
            : el.type === 'DIALOGUE' ? 'Dialogue...'
            : el.type === 'PARENTHETICAL' ? '(beat)'
            : el.type === 'TRANSITION' ? 'CUT TO:'
            : el.type === 'SECTION' ? '# ACT ONE'
            : el.type === 'NOTE' ? '/* Note */'
            : ''}
          onChange={e => { updateEl(el.id, e.target.value); resizeTA(e.target); }}
          onKeyDown={e => handleKeyDown(e, el)}
          onFocus={() => setActiveId(el.id)}
          style={elStyle(el.type)}
          className="focus:outline-none"
        />

        {/* Quick-action bar (visible when active) */}
        {isActive && (
          <div className="flex items-center gap-0.5 py-1 opacity-60">
            {(['SCENE_HEADING', 'ACTION', 'CHARACTER', 'DIALOGUE', 'PARENTHETICAL', 'TRANSITION'] as ScriptElementType[]).map(t => (
              <button key={t}
                onMouseDown={e => { e.preventDefault(); updateElType(el.id, t); }}
                className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded transition-colors ${el.type === t ? 'bg-orange-500/20 text-orange-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                {t === 'SCENE_HEADING' ? 'SCN' : t === 'ACTION' ? 'ACT' : t === 'CHARACTER' ? 'CHR' : t === 'DIALOGUE' ? 'DLG' : t === 'PARENTHETICAL' ? 'PRN' : 'TRN'}
              </button>
            ))}
            <div className="flex-1" />
            <button onMouseDown={e => { e.preventDefault(); deleteEl(el.id); }}
              className="text-[9px] text-red-400/50 hover:text-red-500 px-1 transition-colors">
              <Trash2 size={9} />
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Left sidebar ──────────────────────────────────────────────────
  function renderSidebar() {
    return (
      <div className="w-56 flex-shrink-0 flex flex-col bg-[#111] border-r border-white/8 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-white/8">
          {([
            { id: 'SCENES', icon: <List size={11} />, label: 'Scenes' },
            { id: 'BEATS',  icon: <Layers size={11} />, label: 'Beats' },
            { id: 'CAST',   icon: <Users size={11} />, label: 'Cast' },
            { id: 'WORLD',  icon: <Globe size={11} />, label: 'World' },
          ] as const).map(tab => (
            <button key={tab.id}
              onClick={() => setSidebarTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[8px] font-black uppercase tracking-widest transition-colors ${sidebarTab === tab.id ? 'text-orange-400 border-b-2 border-orange-500' : 'text-white/30 hover:text-white/60'}`}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">

          {/* SCENES TAB */}
          {sidebarTab === 'SCENES' && (
            <>
              <div className="relative mb-2">
                <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  value={sceneSearch}
                  onChange={e => setSceneSearch(e.target.value)}
                  placeholder="Search scenes..."
                  className="w-full bg-white/5 rounded-lg pl-6 pr-2 py-1.5 text-[10px] text-white/60 outline-none placeholder-white/20"
                />
              </div>
              {scenes
                .filter(s => !sceneSearch || s.text.toLowerCase().includes(sceneSearch.toLowerCase()))
                .map(scene => (
                  <button key={scene.id}
                    onClick={() => {
                      setActiveId(scene.id);
                      setTimeout(() => textareaRefs.current.get(scene.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${scene.id === activeScene?.id ? 'bg-orange-500/15 text-orange-300' : 'text-white/50 hover:bg-white/5 hover:text-white/70'}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] font-black text-white/25 w-4 shrink-0">{scene.num}</span>
                      <div className="min-w-0">
                        <div className="text-[8px] font-black uppercase tracking-wider truncate">{scene.intExt || 'SCN'}</div>
                        <div className="text-[9px] truncate">{scene.location || 'Untitled Scene'}</div>
                        <div className="text-[8px] text-white/30">{scene.time}</div>
                      </div>
                    </div>
                  </button>
                ))}
              <button
                onClick={() => insertAfter(elements[elements.length - 1]?.id ?? '', 'SCENE_HEADING')}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-white/30 hover:text-orange-400 hover:bg-orange-500/10 transition-colors text-[9px] font-black uppercase tracking-widest mt-2">
                <Plus size={10} /> New Scene
              </button>
            </>
          )}

          {/* BEATS TAB */}
          {sidebarTab === 'BEATS' && (
            <>
              <div className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-2 px-1">
                {(format === 'TV_PILOT' || format === 'TV_EPISODE') ? 'TV Structure' : 'Save the Cat'}
              </div>
              {beats.map((beat, i) => (
                <div key={beat.id} className="group px-2 py-2 rounded-lg border border-white/5 hover:border-white/15 transition-all space-y-1">
                  <div className="flex items-start gap-1.5">
                    <div className="w-2 h-2 rounded-full mt-0.5 shrink-0" style={{ background: beat.color ?? '#888' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-black text-white/70 leading-snug">{beat.label}</div>
                      {beat.pageTarget && (
                        <div className="text-[8px] text-white/25">~p.{beat.pageTarget}</div>
                      )}
                    </div>
                    {beat.sceneElementId && (
                      <Check size={8} className="text-green-400 shrink-0" />
                    )}
                  </div>
                  {/* Link beat to active scene */}
                  {activeScene && !beat.sceneElementId && (
                    <button
                      onClick={() => setBeats(prev => prev.map((b, j) => j === i ? { ...b, sceneElementId: activeScene.id } : b))}
                      className="hidden group-hover:flex items-center gap-1 text-[7px] font-black uppercase tracking-widest text-orange-400/70 hover:text-orange-400 transition-colors">
                      <Plus size={7} /> Link to current scene
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {/* CAST TAB */}
          {sidebarTab === 'CAST' && (
            <>
              <div className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-2 px-1">
                {castList.length} characters
              </div>
              {castList.map(name => {
                const sceneCount = scenes.filter(s => {
                  const idx = elements.findIndex(e => e.id === s.id);
                  const next = scenes.find((_, si) => si > scenes.indexOf(s));
                  const nextIdx = next ? elements.findIndex(e => e.id === next.id) : elements.length;
                  return elements.slice(idx, nextIdx).some(e => e.type === 'CHARACTER' && e.text.toUpperCase().trim() === name);
                }).length;
                const worldChar = worldCharacters.find(c => c.name.toUpperCase() === name);
                return (
                  <div key={name} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                      {worldChar?.imageUrl
                        ? <img src={worldChar.imageUrl} alt={name} className="w-full h-full object-cover" />
                        : <User size={10} className="text-white/40" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-black text-white/70 uppercase truncate">{name}</div>
                      <div className="text-[8px] text-white/25">{sceneCount} scene{sceneCount !== 1 ? 's' : ''}</div>
                    </div>
                    {worldChar && <Globe size={8} className="text-blue-400/60 shrink-0" />}
                  </div>
                );
              })}
              {worldCharacters.filter(c => !castList.includes(c.name.toUpperCase())).map(c => (
                <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg opacity-40 hover:opacity-70 transition-opacity">
                  <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
                    {c.imageUrl
                      ? <img src={c.imageUrl} alt={c.name} className="w-full h-full object-cover" />
                      : <User size={10} className="text-white/20" />
                    }
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] font-black text-white/40 uppercase truncate">{c.name}</div>
                    <div className="text-[8px] text-white/20">World only</div>
                  </div>
                  <Globe size={8} className="text-blue-400/40 shrink-0" />
                </div>
              ))}
            </>
          )}

          {/* WORLD TAB */}
          {sidebarTab === 'WORLD' && (
            <>
              {linkedWorld ? (
                <div className="space-y-3">
                  {/* Linked world card */}
                  <div className="rounded-xl overflow-hidden border border-white/8">
                    {linkedWorld.coverImage && (
                      <img src={linkedWorld.coverImage} alt="" className="w-full h-16 object-cover" />
                    )}
                    <div className="p-2">
                      <div className="text-[9px] font-black text-white/70">{linkedWorld.name}</div>
                      <div className="text-[8px] text-white/30">{worldCharacters.length} chars · {worldLocations.length} locations</div>
                    </div>
                  </div>

                  {/* Navigate to world */}
                  {onNavigate && (
                    <button
                      onClick={() => onNavigate('WORLDS')}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 text-[9px] font-black uppercase tracking-widest transition-colors">
                      <Globe size={9} /> View World
                    </button>
                  )}

                  {/* Locations */}
                  {worldLocations.length > 0 && (
                    <>
                      <div className="text-[8px] font-black uppercase tracking-widest text-white/25 px-1">Locations</div>
                      {worldLocations.slice(0, 6).map(loc => (
                        <div key={loc.id} className="flex items-center gap-1.5 px-2 py-1 rounded text-[9px] text-white/50">
                          <MapPin size={8} className="text-white/20 shrink-0" />
                          {loc.title}
                        </div>
                      ))}
                    </>
                  )}

                  {/* Add to timeline */}
                  <div className="border-t border-white/8 pt-3 space-y-2">
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/25 px-1">Add to World Timeline</div>
                    <input
                      value={timelineYear}
                      onChange={e => setTimelineYear(e.target.value)}
                      placeholder="In-universe year"
                      className="w-full bg-white/5 rounded-lg px-2 py-1.5 text-[10px] text-white/60 outline-none placeholder-white/20"
                    />
                    <button
                      onClick={addToTimeline}
                      disabled={!timelineYear || addingToTimeline}
                      className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 text-[9px] font-black uppercase tracking-widest transition-colors disabled:opacity-40">
                      {addingToTimeline ? <RefreshCw size={9} className="animate-spin" /> : <Plus size={9} />}
                      Register Event
                    </button>
                  </div>

                  {/* Unlink */}
                  <button
                    onClick={() => { setLinkedWorldId(undefined); setLinkedWorld(null); }}
                    className="w-full text-[8px] font-black uppercase tracking-widest text-white/20 hover:text-red-400 transition-colors py-1">
                    Unlink World
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-2 px-1">Link an IP World</div>
                  <div className="relative">
                    <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      value={worldSearch}
                      onChange={e => setWorldSearch(e.target.value)}
                      placeholder="Search your worlds..."
                      className="w-full bg-white/5 rounded-lg pl-6 pr-2 py-1.5 text-[10px] text-white/60 outline-none placeholder-white/20"
                    />
                  </div>
                  {userWorlds
                    .filter(w => !worldSearch || w.name.toLowerCase().includes(worldSearch.toLowerCase()))
                    .map(w => (
                      <button key={w.id}
                        onClick={() => setLinkedWorldId(w.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-white/50 hover:bg-white/5 hover:text-white/70 transition-colors">
                        <div className="w-7 h-7 rounded bg-white/5 shrink-0 overflow-hidden">
                          {w.coverImage && <img src={w.coverImage} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="text-[9px] font-medium truncate">{w.name}</div>
                      </button>
                    ))}
                  {userWorlds.length === 0 && (
                    <div className="text-[9px] text-white/20 text-center py-4 px-2 leading-relaxed">
                      No worlds yet. Create one in the Worlds section to link characters and locations.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Right panel ───────────────────────────────────────────────────
  function renderRightPanel() {
    return (
      <div className="w-64 flex-shrink-0 flex flex-col bg-[#111] border-l border-white/8 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-white/8">
          {([
            { id: 'PROPERTIES', label: 'Scene' },
            { id: 'NOTES',      label: 'Notes' },
            { id: 'AI',         label: 'AI' },
            { id: 'EXPORT',     label: 'Export' },
          ] as const).map(tab => (
            <button key={tab.id}
              onClick={() => setRightTab(tab.id)}
              className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest transition-colors ${rightTab === tab.id ? 'text-orange-400 border-b-2 border-orange-500' : 'text-white/30 hover:text-white/60'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">

          {/* PROPERTIES */}
          {rightTab === 'PROPERTIES' && (
            <div className="space-y-3">
              <div className="text-[8px] font-black uppercase tracking-widest text-white/25">Current Scene</div>
              {activeScene ? (
                <>
                  <div className="bg-white/4 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Film size={10} className="text-orange-400 shrink-0" />
                      <div className="text-[9px] font-black text-white/70">{activeScene.text || 'Untitled Scene'}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <div className="text-[8px] text-white/30">Int/Ext</div>
                      <div className="text-[8px] text-white/60">{activeScene.intExt || '—'}</div>
                      <div className="text-[8px] text-white/30">Location</div>
                      <div className="text-[8px] text-white/60 truncate">{activeScene.location || '—'}</div>
                      <div className="text-[8px] text-white/30">Time</div>
                      <div className="text-[8px] text-white/60">{activeScene.time || '—'}</div>
                      <div className="text-[8px] text-white/30">Scene #</div>
                      <div className="text-[8px] text-white/60">{activeScene.num}</div>
                    </div>
                  </div>
                  {/* Scene notes */}
                  <textarea
                    value={sceneNotes[activeScene.id] ?? ''}
                    onChange={e => setSceneNotes(p => ({ ...p, [activeScene.id]: e.target.value }))}
                    placeholder="Scene notes..."
                    rows={4}
                    className="w-full bg-white/4 rounded-xl p-2 text-[10px] text-white/60 outline-none resize-none placeholder-white/20"
                  />
                </>
              ) : (
                <div className="text-[9px] text-white/20 text-center py-6">Click into a scene to see its properties.</div>
              )}

              {/* Element type legend */}
              <div className="border-t border-white/8 pt-3">
                <div className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">Keyboard</div>
                {[
                  ['Enter', 'Next element'],
                  ['Tab', 'Cycle type'],
                  ['Shift+Tab', 'Reverse cycle'],
                  ['Shift+Enter', 'New line'],
                  ['Backspace', 'Delete if empty'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2 py-0.5">
                    <kbd className="text-[7px] font-mono bg-white/8 px-1 py-0.5 rounded text-white/50 shrink-0">{k}</kbd>
                    <span className="text-[8px] text-white/30">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NOTES */}
          {rightTab === 'NOTES' && (
            <div className="space-y-3">
              <div className="text-[8px] font-black uppercase tracking-widest text-white/25">Logline</div>
              <textarea
                value={logline}
                onChange={e => setLogline(e.target.value)}
                placeholder="One-sentence story summary..."
                rows={3}
                className="w-full bg-white/4 rounded-xl p-2 text-[10px] text-white/60 outline-none resize-none placeholder-white/20"
              />
              <div className="text-[8px] font-black uppercase tracking-widest text-white/25">Synopsis</div>
              <textarea
                value={synopsis}
                onChange={e => setSynopsis(e.target.value)}
                placeholder="Short paragraph summary..."
                rows={6}
                className="w-full bg-white/4 rounded-xl p-2 text-[10px] text-white/60 outline-none resize-none placeholder-white/20"
              />
              {coverage && (
                <>
                  <div className="text-[8px] font-black uppercase tracking-widest text-white/25 mt-2">Coverage</div>
                  <div className="bg-white/4 rounded-xl p-2 text-[9px] text-white/50 leading-relaxed whitespace-pre-wrap">
                    {coverage}
                  </div>
                </>
              )}
            </div>
          )}

          {/* AI PANEL */}
          {rightTab === 'AI' && (
            <div className="space-y-3">
              <div className="text-[8px] font-black uppercase tracking-widest text-white/25">AI Assist</div>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { mode: 'CONTINUE', label: 'Continue Scene', icon: <Zap size={9} /> },
                  { mode: 'REWRITE',  label: 'Sharpen Dialogue', icon: <Edit3 size={9} /> },
                  { mode: 'LOGLINE',  label: 'Write Logline', icon: <Star size={9} /> },
                  { mode: 'COVERAGE', label: 'Script Coverage', icon: <FileText size={9} /> },
                ] as const).map(btn => (
                  <button key={btn.mode}
                    onClick={() => runAI(btn.mode)}
                    disabled={aiLoading}
                    className="flex items-center gap-1 px-2 py-2 rounded-xl bg-white/5 text-white/50 hover:bg-orange-500/15 hover:text-orange-400 text-[8px] font-black uppercase tracking-widest transition-colors disabled:opacity-40">
                    {aiLoading ? <RefreshCw size={9} className="animate-spin" /> : btn.icon}
                    <span className="leading-snug">{btn.label}</span>
                  </button>
                ))}
              </div>

              {aiOutput && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/25">AI Output</div>
                    <button
                      onClick={() => { setElements(prev => [...prev, makeEl('ACTION', aiOutput)]); setAiOutput(''); }}
                      className="text-[7px] font-black uppercase tracking-widest text-orange-400/70 hover:text-orange-400 transition-colors">
                      Insert →
                    </button>
                  </div>
                  <div className="bg-white/4 rounded-xl p-2 text-[9px] text-white/50 leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap">
                    {aiOutput}
                  </div>
                  <button onClick={() => setAiOutput('')} className="text-[7px] text-white/20 hover:text-white/40 transition-colors">Clear</button>
                </div>
              )}
            </div>
          )}

          {/* EXPORT PANEL */}
          {rightTab === 'EXPORT' && (
            <div className="space-y-3">
              <div className="text-[8px] font-black uppercase tracking-widest text-white/25">Export</div>

              <div className="space-y-1.5">
                <button onClick={exportFountain}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 text-white/60 hover:bg-orange-500/15 hover:text-orange-400 text-[9px] font-black uppercase tracking-widest transition-colors">
                  <Download size={11} /> Fountain (.fountain)
                </button>
                <button onClick={exportPrint}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 text-white/60 hover:bg-blue-500/15 hover:text-blue-400 text-[9px] font-black uppercase tracking-widest transition-colors">
                  <FileText size={11} /> PDF (Print)
                </button>
                <button onClick={() => { navigator.clipboard.writeText(toFountain({ id: scriptId, format, titlePage, elements, beats })); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 text-white/60 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest transition-colors">
                  <Copy size={11} /> Copy as Fountain
                </button>
              </div>

              <div className="border-t border-white/8 pt-3 space-y-2">
                <div className="text-[8px] font-black uppercase tracking-widest text-white/25">Script Stats</div>
                {[
                  ['Scenes', scenes.length],
                  ['Pages (est.)', pageCount],
                  ['Characters', castList.length],
                  ['Est. Runtime', `${pageCount} min`],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between items-center py-0.5">
                    <span className="text-[9px] text-white/30">{k}</span>
                    <span className="text-[9px] font-black text-white/60">{v}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/8 pt-3 space-y-2">
                <div className="text-[8px] font-black uppercase tracking-widest text-white/25">Revision</div>
                <div className="grid grid-cols-3 gap-1">
                  {REVISION_COLORS.map(rc => (
                    <button key={rc.id}
                      onClick={() => setCurrentRevColor(rc.id)}
                      title={rc.label}
                      className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-[7px] font-black transition-all ${currentRevColor === rc.id ? 'ring-1 ring-orange-500 scale-105' : 'hover:scale-105'}`}
                      style={{ background: `${rc.hex}20`, color: rc.hex }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: rc.hex }} />
                      <span className="truncate">{rc.id.slice(0,4)}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setElements(prev => prev.map(e => e.id === activeId ? { ...e, revColor: currentRevColor } : e))}
                  className="w-full text-[8px] font-black uppercase tracking-widest text-white/30 hover:text-orange-400 py-1 transition-colors">
                  Mark selection as {currentRevColor.toLowerCase()}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col bg-[#0d0d0d] text-white ${isFullscreen ? 'fixed inset-0 z-50' : 'h-screen'}`}>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8 bg-[#111] shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors">
          <ChevronLeft size={16} />
        </button>

        {/* Format badge */}
        <div className="relative">
          <button
            onClick={() => setShowFormatMenu(p => !p)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 text-white/50 hover:text-white/70 text-[9px] font-black uppercase tracking-widest transition-colors">
            <Film size={10} />
            {FORMAT_LABELS[format]}
            <ChevronDown size={9} />
          </button>
          {showFormatMenu && (
            <div className="absolute top-full left-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden z-20 shadow-2xl min-w-[160px]">
              {(Object.entries(FORMAT_LABELS) as [ScriptFormat, string][]).map(([id, label]) => (
                <button key={id}
                  onClick={() => { setFormat(id); setShowFormatMenu(false); }}
                  className={`w-full text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-colors ${format === id ? 'text-orange-400 bg-orange-500/10' : 'text-white/50 hover:text-white/70 hover:bg-white/5'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Title */}
        <input
          value={titlePage.title}
          onChange={e => setTitlePage(p => ({ ...p, title: e.target.value }))}
          className="flex-1 text-xs font-black uppercase tracking-widest bg-transparent outline-none text-white/60 hover:text-white/80 placeholder-white/20 min-w-0"
          placeholder="UNTITLED SCRIPT"
        />

        {/* Page count */}
        <div className="text-[9px] font-black text-white/20 uppercase tracking-widest shrink-0">
          {pageCount}p • {scenes.length} scenes
        </div>

        {/* Revision color */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowRevMenu(p => !p)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/8 transition-colors">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: REVISION_COLORS.find(r => r.id === currentRevColor)?.hex }} />
            <span className="text-[8px] font-black uppercase tracking-widest text-white/40">{currentRevColor.slice(0,3)}</span>
            <ChevronDown size={8} className="text-white/30" />
          </button>
          {showRevMenu && (
            <div className="absolute top-full right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden z-20 shadow-2xl min-w-[160px]">
              {REVISION_COLORS.map(rc => (
                <button key={rc.id}
                  onClick={() => { setCurrentRevColor(rc.id); setShowRevMenu(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[9px] transition-colors ${currentRevColor === rc.id ? 'bg-white/8' : 'hover:bg-white/5'}`}>
                  <div className="w-3 h-3 rounded-full" style={{ background: rc.hex }} />
                  <span className="font-black text-white/60 uppercase tracking-widest">{rc.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Import manuscript */}
        <button
          onClick={() => { setImportError(''); setShowImport(true); }}
          title="Import a document (Word, PDF, text, Fountain)"
          className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors">
          <FileUp size={14} />
        </button>

        {/* Title page toggle */}
        <button
          onClick={() => setShowTitlePage(p => !p)}
          title="Title Page"
          className={`p-1.5 rounded-lg transition-colors ${showTitlePage ? 'bg-orange-500/20 text-orange-400' : 'text-white/30 hover:text-white hover:bg-white/8'}`}>
          <BookOpen size={14} />
        </button>

        {/* Save status */}
        <div className="flex items-center gap-1 text-[8px] text-white/20 shrink-0">
          {isSaving
            ? <><RefreshCw size={8} className="animate-spin" /> Saving</>
            : lastSaved
              ? <><Check size={8} className="text-green-400/60" /> Saved</>
              : null}
        </div>

        {/* Sidebar toggles */}
        <button onClick={() => setShowSidebar(p => !p)} className={`p-1.5 rounded-lg transition-colors ${showSidebar ? 'text-orange-400 bg-orange-500/10' : 'text-white/30 hover:text-white hover:bg-white/8'}`}>
          <List size={14} />
        </button>
        <button onClick={() => setShowRight(p => !p)} className={`p-1.5 rounded-lg transition-colors ${showRight ? 'text-orange-400 bg-orange-500/10' : 'text-white/30 hover:text-white hover:bg-white/8'}`}>
          <Settings size={14} />
        </button>
        <button onClick={() => setIsFullscreen(p => !p)} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors">
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left Sidebar */}
        {showSidebar && renderSidebar()}

        {/* Script Editor */}
        <div className="flex-1 overflow-y-auto bg-[#1a1a1a]" ref={editorRef}>
          {showTitlePage ? (
            <div className="py-12 px-6">
              {renderTitlePage()}
            </div>
          ) : (
            /* Script paper */
            <div className="py-8 px-4 flex justify-center">
              <div
                className="w-full bg-white shadow-2xl rounded-sm relative print:shadow-none"
                style={{ maxWidth: '8.5in', minHeight: '11in', padding: '1in 1.5in 1in 1.5in' }}
              >
                {/* Watermark / revision color bar */}
                {currentRevColor !== 'WHITE' && (
                  <div className="absolute top-0 left-0 right-0 h-1 rounded-t-sm"
                       style={{ background: REVISION_COLORS.find(r => r.id === currentRevColor)?.hex }} />
                )}

                {/* Page number */}
                <div className="absolute top-8 right-12 text-[10pt] text-gray-400"
                     style={{ fontFamily: '"Courier Prime", Courier, monospace' }}>
                  1.
                </div>

                {/* Elements */}
                <div className="relative">
                  {elements.map(el => renderElement(el))}
                </div>

                {/* Insert buttons at bottom */}
                <div className="flex items-center gap-2 mt-8 pt-4 border-t border-gray-100">
                  {([
                    { type: 'SCENE_HEADING' as ScriptElementType, label: '+ Scene' },
                    { type: 'ACTION'        as ScriptElementType, label: '+ Action' },
                    { type: 'CHARACTER'     as ScriptElementType, label: '+ Character' },
                    { type: 'TRANSITION'    as ScriptElementType, label: '+ Transition' },
                    { type: 'SECTION'       as ScriptElementType, label: '+ Section' },
                    { type: 'NOTE'          as ScriptElementType, label: '+ Note' },
                  ]).map(btn => (
                    <button key={btn.type}
                      onClick={() => insertAfter(elements[elements.length - 1]?.id ?? '', btn.type)}
                      className="text-[9px] font-black uppercase tracking-widest text-gray-300 hover:text-orange-500 transition-colors">
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel */}
        {showRight && renderRightPanel()}
      </div>

      {/* Click-away to close menus */}
      {(showRevMenu || showFormatMenu) && (
        <div className="fixed inset-0 z-10" onClick={() => { setShowRevMenu(false); setShowFormatMenu(false); }} />
      )}

      {/* ── Import modal ── */}
      {showImport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
             onClick={() => !importing && setShowImport(false)}>
          <div className="w-full max-w-md bg-[#141414] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
               onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
              <div className="flex items-center gap-2">
                <FileUp size={15} className="text-orange-400" />
                <span className="text-xs font-black uppercase tracking-widest text-white/80">Import Document</span>
              </div>
              <button onClick={() => !importing && setShowImport(false)}
                className="p-1 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors">
                <X size={15} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Replace / Append */}
              <div className="flex gap-2">
                {(['REPLACE', 'APPEND'] as const).map(m => (
                  <button key={m}
                    onClick={() => setImportMode(m)}
                    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors ${importMode === m ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40' : 'bg-white/5 text-white/40 hover:text-white/70'}`}>
                    {m === 'REPLACE' ? 'Replace script' : 'Append to end'}
                  </button>
                ))}
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setImportDragging(true); }}
                onDragLeave={() => setImportDragging(false)}
                onDrop={e => { e.preventDefault(); setImportDragging(false); const f = e.dataTransfer.files?.[0]; if (f) importDocument(f); }}
                onClick={() => !importing && importInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${importDragging ? 'border-orange-500/60 bg-orange-500/10' : 'border-white/12 hover:border-white/25 bg-white/[0.02]'}`}>
                {importing ? (
                  <>
                    <RefreshCw size={22} className="text-orange-400 animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Reading & formatting…</span>
                  </>
                ) : (
                  <>
                    <Upload size={22} className="text-white/40" />
                    <span className="text-[11px] font-bold text-white/60">Drop a file or click to browse</span>
                    <span className="text-[9px] text-white/30">.docx · .pdf · .txt · .fountain · .md</span>
                  </>
                )}
                <input ref={importInputRef} type="file" accept={SUPPORTED_IMPORT_ACCEPT} className="hidden" onChange={onImportPick} />
              </div>

              {/* Error */}
              {importError && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertCircle size={13} className="text-red-400 mt-px shrink-0" />
                  <span className="text-[10px] text-red-300/90 leading-relaxed">{importError}</span>
                </div>
              )}

              {/* Hints */}
              <div className="text-[9px] text-white/30 leading-relaxed space-y-1">
                <p><span className="text-white/50 font-bold">Google Docs?</span> File → Download → <span className="text-white/50">Microsoft Word (.docx)</span> or plain text, then import it here.</p>
                <p>Scene headings (INT./EXT.), ALL-CAPS character cues, and CUT TO: transitions are auto-detected. Fountain files import with full formatting.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
