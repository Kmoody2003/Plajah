// Text lab — proves the editable TextSurface on the platform text engine.
//   npx vite --config text-lab.vite.config.mjs  ->  http://127.0.0.1:3150/text-lab.html
// Two threaded frames (the second with two columns), a circle wrap, a drop cap, justification
// controls, undo/redo, IME and clipboard. window.__textLab exposes state for puppeteer checks.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TextSurface from './components/text/TextSurface';
import { createTextSystem, createStory, setParaAttrs, storyText, type TextSystem, type TextStory, type TextFrame, type StoryLayout, type TextRange } from './services/text';

const BODY = { fontFamily: 'EB Garamond', fontSize: 15 };
const initial = (): TextStory => createStory([
  { attrs: { align: 'start', spaceAfter: 10, hyphenation: { enabled: false } }, runs: [{ text: 'The editable composer', attrs: { fontFamily: 'Playfair Display', fontSize: 30, fontWeight: 700, color: '#2a1d14' } }] },
  { attrs: { align: 'justify', dropCap: { lines: 3 }, justification: { opticalMargin: true } }, runs: [{ text: 'Every keystroke here re-composes only the paragraph you touched: the engine shapes it with rustybuzz, breaks it with the Knuth–Plass total-fit algorithm, hyphenates it with TeX patterns and hangs its punctuation into the margin. ', attrs: BODY }, { text: 'Select text', attrs: { ...BODY, fontWeight: 700 } }, { text: ' and press Ctrl+B or Ctrl+I; type in Arabic ', attrs: BODY }, { text: 'مرحبا بالعالم', attrs: { ...BODY, language: 'ar' } }, { text: ' or Hebrew ', attrs: BODY }, { text: 'שלום עולם', attrs: { ...BODY, language: 'he' } }, { text: ' and watch the caret follow the visual order.', attrs: BODY }] },
  { attrs: { align: 'justify', indentFirst: 18, justification: { opticalMargin: true } }, runs: [{ text: 'Text wraps around the illustration on both sides and flows from the first frame into the second, which has two columns. Long words like incomprehensibilities and internationalization hyphenate cleanly, and ligatures such as office, affluent and fjord keep a caret position for every letter.', attrs: BODY }] },
  { attrs: { align: 'justify', indentFirst: 18, justification: { opticalMargin: true } }, runs: [{ text: 'Paste rich text from another page and its bold, italics, links and lists come along; copy from here and other apps receive both HTML and plain text. Undo and redo are host callbacks, so Tela’s own history can own them.', attrs: BODY }] },
]);

const circle = { kind: 'circle' as const, cx: 420, cy: 250, r: 64 };
const FRAMES: TextFrame[] = [
  { id: 'a', x: 20, y: 20, width: 600, height: 380, exclusions: [{ shape: circle, offset: 12 }] },
  { id: 'b', x: 20, y: 420, width: 600, height: 260, columns: 2, gutter: 22 },
];

function Lab() {
  const [sys, setSys] = useState<TextSystem | null>(null);
  const [story, setStory] = useState<TextStory>(initial);
  const undo = useRef<TextStory[]>([]);
  const redo = useRef<TextStory[]>([]);
  const [composer, setComposer] = useState<'paragraph' | 'single-line'>('paragraph');
  const [layoutInfo, setLayoutInfo] = useState('');
  const [sel, setSel] = useState<TextRange | undefined>();
  useEffect(() => { void createTextSystem({ preload: ['EB Garamond', 'Playfair Display', 'Noto Naskh Arabic', 'Noto Sans Hebrew'] }).then(setSys); }, []);
  const onChange = useCallback((next: TextStory) => { undo.current.push(story); redo.current = []; setStory(next); }, [story]);
  const shown = useMemo(() => setParaAttrs(story, story.paragraphs.slice(1).map(p => p.id), { justification: { opticalMargin: true, composer } }), [story, composer]);
  const onLayout = useCallback((l: StoryLayout) => {
    setLayoutInfo(`${l.lines.length} lines · ${l.stats.ms.toFixed(1)} ms${l.overflow ? ' · overset' : ''}`);
    (window as unknown as { __textLab: unknown }).__textLab = { lines: l.lines.length, overflow: l.overflow, text: storyText(story), selection: sel };
  }, [story, sel]);
  if (!sys) return <div style={{ padding: 40 }}>Loading the text engine…</div>;
  return (
    <div style={{ maxWidth: 680, margin: '24px auto', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
        <strong>Text lab</strong>
        <button onClick={() => setComposer(c => (c === 'paragraph' ? 'single-line' : 'paragraph'))}>Composer: {composer}</button>
        <button onClick={() => { const p = undo.current.pop(); if (p) { redo.current.push(story); setStory(p); } }}>Undo</button>
        <button onClick={() => { const n = redo.current.pop(); if (n) { undo.current.push(story); setStory(n); } }}>Redo</button>
        <span style={{ color: '#888' }}>{layoutInfo}</span>
      </div>
      <TextSurface system={sys} story={shown} frames={FRAMES} onChange={s => onChange(s)} onSelectionChange={setSel} showFrames
        onUndo={() => { const p = undo.current.pop(); if (p) { redo.current.push(story); setStory(p); } }}
        onRedo={() => { const n = redo.current.pop(); if (n) { undo.current.push(story); setStory(n); } }}
        onLayout={onLayout}
        underlay={<g><circle cx={circle.cx} cy={circle.cy} r={circle.r} fill="#e9d8b8" /><circle cx={circle.cx} cy={circle.cy} r={circle.r * 0.55} fill="#c98f4a" /></g>}
        style={{ background: '#fffdf8', boxShadow: '0 1px 4px #0002', borderRadius: 6 }} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Lab />);
