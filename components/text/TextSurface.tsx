// TextSurface — an editable text surface on the platform text engine.
//
// The engine composes and the SVG renderer draws every glyph; the browser contributes only a
// hidden <textarea> that sits at the caret to receive keyboard, IME composition and clipboard
// input. Caret, selection and hit testing come from services/text/editing (engine caret spans),
// so editing behaves identically across fonts, scripts, ligatures and bidi text. Edits are pure
// model operations reported through `onChange(story, ops)`; history lives with the host
// (`onUndo` / `onRedo`), which is how Tela's history and collaboration layers plug in.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type TextSystem, type TextStory, type TextFrame, type TextRange, type Position, type TextOp, type CharAttrs, type StoryLayout,
  layoutToSvgMarkup, positionToCaret, pointToPosition, rangeToRects, moveByGrapheme, moveByWord, moveVertical, lineBoundary, wordRangeAt,
  insertText, deleteRange, splitParagraph, mergeParagraphs, applyCharAttrs, insertFragment, sliceStory, storyText, storyToHtml, htmlToStory,
  orderRange, isCollapsed, paragraphIndex, paragraphLength, paragraphText, runAt, startOf, endOf, newId, type Affinity,
} from '../../services/text';

export interface TextSurfaceProps {
  system: TextSystem;
  story: TextStory;
  frames: TextFrame[];
  onChange?: (story: TextStory, ops: TextOp[]) => void;
  selection?: TextRange;
  onSelectionChange?: (r: TextRange) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  readOnly?: boolean;
  /** SVG viewport in page px (defaults to the frames' bounding box). */
  viewBox?: [number, number, number, number];
  showFrames?: boolean;
  /** Extra SVG drawn under the text (art behind wraps, guides). */
  underlay?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onLayout?: (l: StoryLayout) => void;
}

const LSEP = String.fromCharCode(0x2028);

export default function TextSurface(props: TextSurfaceProps) {
  const { system, story, frames, onChange, readOnly } = props;
  const [fontsVersion, setFontsVersion] = useState(0);
  const [localSel, setLocalSel] = useState<TextRange>(() => ({ anchor: startOf(story), focus: startOf(story) }));
  const sel = props.selection ?? localSel;
  const setSel = useCallback((r: TextRange) => { setLocalSel(r); props.onSelectionChange?.(r); }, [props.onSelectionChange]);
  const [affinity, setAffinity] = useState<Affinity>('downstream');
  const goalX = useRef<number | undefined>(undefined);
  const [composing, setComposing] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pendingFormat = useRef<CharAttrs | null>(null);

  useEffect(() => {
    let live = true;
    void system.ensure(story).then(() => { if (live) setFontsVersion(v => v + 1); });
    return () => { live = false; };
  }, [system, story]);

  // While composing, lay out a provisional story with the composition inserted (underlined).
  const shown = useMemo(() => {
    if (!composing) return story;
    const [a] = orderRange(story, sel);
    const base = isCollapsed(sel) ? story : deleteRange(story, sel).story;
    const fmt = runAt(base.paragraphs[paragraphIndex(base, a.paragraphId)], a.offset);
    return insertText(base, a, composing, { styleId: fmt.styleId, attrs: { ...fmt.attrs, underline: { style: 'dotted' } } }).story;
  }, [story, composing, sel]);

  const layout = useMemo(() => system.layout(shown, frames), [system, shown, frames, fontsVersion]);
  useEffect(() => { props.onLayout?.(layout); }, [layout]);
  const markup = useMemo(() => layoutToSvgMarkup(system.engine, layout, { showFrames: props.showFrames }), [system, layout, props.showFrames]);

  const vb = props.viewBox ?? (() => {
    const xs = frames.map(f => f.x), ys = frames.map(f => f.y);
    const x0 = Math.min(...xs) - 8, y0 = Math.min(...ys) - 8;
    return [x0, y0, Math.max(...frames.map(f => f.x + f.width)) - x0 + 8, Math.max(...frames.map(f => f.y + f.height)) - y0 + 8] as [number, number, number, number];
  })();

  const caret = composing ? null : positionToCaret(layout, sel.focus, affinity);
  const rects = composing ? [] : rangeToRects(layout, story, sel);

  // Keep the IME textarea at the caret so candidate windows appear in the right place.
  const caretScreen = useMemo(() => {
    const svg = svgRef.current;
    if (!svg || !caret) return { left: 0, top: 0 };
    const m = svg.getScreenCTM();
    const box = svg.getBoundingClientRect();
    if (!m) return { left: 0, top: 0 };
    const pt = new DOMPoint(caret.x, caret.top).matrixTransform(m);
    return { left: pt.x - box.left, top: pt.y - box.top };
  }, [caret?.x, caret?.top]);

  const commit = useCallback((next: TextStory, ops: TextOp[], caretPos: Position, aff: Affinity = 'downstream') => {
    onChange?.(next, ops);
    setSel({ anchor: caretPos, focus: caretPos });
    setAffinity(aff);
    goalX.current = undefined;
  }, [onChange, setSel]);

  const replaceSelection = useCallback((text: string) => {
    if (readOnly) return;
    let s = story;
    const ops: TextOp[] = [];
    let at = orderRange(s, sel)[0];
    if (!isCollapsed(sel)) { const r = deleteRange(s, sel); s = r.story; at = r.caret; ops.push({ type: 'deleteRange', range: sel }); }
    const fmt = pendingFormat.current;
    const p = s.paragraphs[paragraphIndex(s, at.paragraphId)];
    const base = runAt(p, at.offset);
    const format = fmt ? { styleId: base.styleId, attrs: { ...base.attrs, ...fmt } } : undefined;
    const newIds: string[] = [];
    const r = insertText(s, at, text, format, () => { const id = newId(); newIds.push(id); return id; });
    ops.push({ type: 'insertText', at, text, format, newIds });
    pendingFormat.current = null;
    commit(r.story, ops, r.caret);
  }, [story, sel, readOnly, commit]);

  const deleteSel = useCallback((dir: 1 | -1, word: boolean) => {
    if (readOnly) return;
    if (!isCollapsed(sel)) { const r = deleteRange(story, sel); commit(r.story, [{ type: 'deleteRange', range: sel }], r.caret); return; }
    const from = sel.focus;
    const to = word ? moveByWord(story, from, dir) : moveByGrapheme(story, from, dir);
    if (to.paragraphId === from.paragraphId && to.offset === from.offset) return;
    const range = { anchor: from, focus: to };
    if (to.paragraphId !== from.paragraphId && !word) {
      const first = dir < 0 ? to.paragraphId : from.paragraphId;
      const r = mergeParagraphs(story, first);
      commit(r.story, [{ type: 'mergeParagraphs', paragraphId: first }], r.caret);
      return;
    }
    const r = deleteRange(story, range);
    commit(r.story, [{ type: 'deleteRange', range }], r.caret);
  }, [story, sel, readOnly, commit]);

  const move = (focus: Position, extend: boolean, aff: Affinity = 'downstream', keepGoal = false) => {
    setSel(extend ? { anchor: sel.anchor, focus } : { anchor: focus, focus });
    setAffinity(aff);
    if (!keepGoal) goalX.current = undefined;
  };

  const toggle = (attr: 'bold' | 'italic' | 'underline') => {
    const p = story.paragraphs[paragraphIndex(story, sel.focus.paragraphId)];
    const cur = runAt(p, Math.max(1, sel.focus.offset)).attrs ?? {};
    const patch: Partial<CharAttrs> = attr === 'bold' ? { fontWeight: (cur.fontWeight ?? 400) >= 600 ? undefined : 700 }
      : attr === 'italic' ? { fontStyle: cur.fontStyle === 'italic' ? undefined : 'italic' } : { underline: cur.underline ? undefined : true };
    if (isCollapsed(sel)) { pendingFormat.current = { ...(pendingFormat.current ?? {}), ...patch } as CharAttrs; return; }
    onChange?.(applyCharAttrs(story, sel, patch), [{ type: 'applyCharAttrs', range: sel, patch }]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (composing || e.nativeEvent.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    const ext = e.shiftKey;
    const k = e.key;
    let handled = true;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const dir: 1 | -1 = k === 'ArrowRight' ? 1 : -1;
      if (!ext && !isCollapsed(sel)) { const [a, b] = orderRange(story, sel); move(dir > 0 ? b : a, false); }
      else move(mod || e.altKey ? moveByWord(story, sel.focus, dir) : moveByGrapheme(story, sel.focus, dir), ext);
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      const r = moveVertical(layout, story, sel.focus, affinity, k === 'ArrowDown' ? 1 : -1, goalX.current);
      goalX.current = r.goalX;
      move(r.position, ext, r.affinity, true);
    } else if (k === 'Home' || k === 'End') {
      if (mod) move(k === 'Home' ? startOf(story) : endOf(story), ext);
      else { const r = lineBoundary(layout, sel.focus, k === 'Home' ? 'start' : 'end', affinity); move(r.position, ext, r.affinity); }
    } else if (k === 'Backspace') deleteSel(-1, mod || e.altKey);
    else if (k === 'Delete') deleteSel(1, mod || e.altKey);
    else if (k === 'Enter') {
      if (readOnly) return;
      if (ext) replaceSelection(LSEP);
      else {
        let s = story, at = orderRange(story, sel)[0];
        const ops: TextOp[] = [];
        if (!isCollapsed(sel)) { const r = deleteRange(s, sel); s = r.story; at = r.caret; ops.push({ type: 'deleteRange', range: sel }); }
        const id = newId();
        const r = splitParagraph(s, at, id, system.sheet);
        ops.push({ type: 'splitParagraph', at, newId: id });
        commit(r.story, ops, r.caret);
      }
    } else if (k === 'Tab') replaceSelection('\t');
    else if (mod && (k === 'a' || k === 'A')) setSel({ anchor: startOf(story), focus: endOf(story) });
    else if (mod && (k === 'z' || k === 'Z')) (e.shiftKey ? props.onRedo : props.onUndo)?.();
    else if (mod && (k === 'y' || k === 'Y')) props.onRedo?.();
    else if (mod && (k === 'b' || k === 'B')) toggle('bold');
    else if (mod && (k === 'i' || k === 'I')) toggle('italic');
    else if (mod && (k === 'u' || k === 'U')) toggle('underline');
    else handled = false;
    if (handled) e.preventDefault();
  };

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if (composing !== null) return;
    const v = ta.value;
    ta.value = '';
    if (v) replaceSelection(v.replace(/\r\n?/g, '\n'));
  };

  const clientToPage = (x: number, y: number) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x, y };
    const p = new DOMPoint(x, y).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const dragging = useRef(false);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = clientToPage(e.clientX, e.clientY);
    const hit = pointToPosition(layout, p.x, p.y);
    e.preventDefault();
    taRef.current?.focus({ preventScroll: true });
    if (!hit) return;
    if (e.detail === 2) { setSel(wordRangeAt(story, hit.position)); return; }
    if (e.detail >= 3) {
      const para = story.paragraphs[paragraphIndex(story, hit.position.paragraphId)];
      setSel({ anchor: { paragraphId: para.id, offset: 0 }, focus: { paragraphId: para.id, offset: paragraphLength(para) } });
      return;
    }
    move(hit.position, e.shiftKey, hit.affinity);
    dragging.current = true;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const p = clientToPage(e.clientX, e.clientY);
    const hit = pointToPosition(layout, p.x, p.y);
    if (hit) { setSel({ anchor: sel.anchor, focus: hit.position }); setAffinity(hit.affinity); }
  };
  const onPointerUp = () => { dragging.current = false; };

  const onCopy = (e: React.ClipboardEvent, cut = false) => {
    if (isCollapsed(sel)) return;
    e.preventDefault();
    const frag = sliceStory(story, sel);
    e.clipboardData.setData('text/plain', storyText(frag));
    e.clipboardData.setData('text/html', storyToHtml(frag, system.sheet));
    if (cut && !readOnly) { const r = deleteRange(story, sel); commit(r.story, [{ type: 'deleteRange', range: sel }], r.caret); }
  };
  const onPaste = (e: React.ClipboardEvent) => {
    if (readOnly) return;
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');
    let s = story, at = orderRange(story, sel)[0];
    const ops: TextOp[] = [];
    if (!isCollapsed(sel)) { const r = deleteRange(s, sel); s = r.story; at = r.caret; ops.push({ type: 'deleteRange', range: sel }); }
    if (html) {
      const frag = htmlToStory(html);
      const r = insertFragment(s, at, frag);
      ops.push({ type: 'insertFragment', at, fragment: frag });
      commit(r.story, ops, r.caret);
    } else if (plain) {
      const r = insertText(s, at, plain);
      ops.push({ type: 'insertText', at, text: plain });
      commit(r.story, ops, r.caret);
    }
  };

  const [vx, vy, vw, vh] = vb;
  return (
    <div className={props.className} style={{ position: 'relative', ...props.style }}>
      <svg ref={svgRef} viewBox={`${vx} ${vy} ${vw} ${vh}`} style={{ width: '100%', height: 'auto', display: 'block', cursor: 'text', userSelect: 'none', touchAction: 'none' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} role="textbox" aria-multiline="true" aria-label={paragraphText(story.paragraphs[0]).slice(0, 60)}>
        {props.underlay}
        {rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill={focused ? 'rgba(70,130,255,0.28)' : 'rgba(128,128,128,0.22)'} />)}
        <g dangerouslySetInnerHTML={{ __html: markup }} />
        {caret && isCollapsed(sel) && focused && (
          <line x1={caret.x} x2={caret.x} y1={caret.top} y2={caret.bottom} stroke="#1a5cff" strokeWidth={1.2} style={{ animation: 'textsurface-blink 1.05s steps(1) infinite' }} />
        )}
      </svg>
      <style>{'@keyframes textsurface-blink{0%{opacity:1}50%{opacity:0}}'}</style>
      <textarea ref={taRef} aria-hidden="true" autoCapitalize="off" autoCorrect="off" spellCheck={false} tabIndex={0}
        style={{ position: 'absolute', left: caretScreen.left, top: caretScreen.top, width: 2, height: 18, opacity: 0, padding: 0, border: 0, resize: 'none', overflow: 'hidden', whiteSpace: 'pre', pointerEvents: 'none' }}
        onKeyDown={onKeyDown} onInput={onInput} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onCompositionStart={() => setComposing('')}
        onCompositionUpdate={e => setComposing(e.data)}
        onCompositionEnd={e => { const t = e.data; setComposing(null); e.currentTarget.value = ''; if (t) replaceSelection(t); }}
        onCopy={e => onCopy(e)} onCut={e => onCopy(e, true)} onPaste={onPaste} />
    </div>
  );
}
