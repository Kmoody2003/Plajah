/**
 * TelaWriter — the word-processing device inside paper/screen frames (P0).
 *
 * Block-based contenteditable editing: every block has a stable id and a kind
 * (h1/h2/p/li); Enter splits into a new block, Backspace in an empty block
 * merges back, bold/italic via execCommand. Markdown-ish triggers ("# ",
 * "## ", "- " at the start of a block) retag it.
 *
 * Pristine-DOM discipline: serifed doc typography with font-optical-sizing,
 * text-wrap: pretty where supported, an opaque paper ground, and NO transforms
 * or will-change on the resting text layer — zoom is applied by the canvas to
 * the frame wrapper, never to this container itself.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bold, BookHeart, CircleHelp, Feather, Italic, Heading1, Heading2, List, Music2, Pilcrow, StickyNote, TextQuote } from 'lucide-react';
import type { TelaBlock, TelaBlockKind, TelaTextSemanticKind, TelaWriterDevice } from '../../types';

export const newBlockId = () => `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const makeBlock = (kind: TelaBlockKind = 'p', text = ''): TelaBlock =>
  ({ id: newBlockId(), kind, text });

/** Strip everything but the inline formatting we persist. */
function sanitizeInline(html: string): string {
  return html
    .replace(/<(?!\/?(strong|em|b|i|br|code)\b)[^>]*>/gi, '')
    .replace(/<(b)(\s[^>]*)?>/gi, '<strong>').replace(/<\/b>/gi, '</strong>')
    .replace(/<(i)(\s[^>]*)?>/gi, '<em>').replace(/<\/i>/gi, '</em>');
}

const isEmptyHtml = (html: string) =>
  !html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').trim();

// ── One block ────────────────────────────────────────────────────────────────

const BLOCK_STYLE: Record<TelaBlockKind, React.CSSProperties> = {
  h1: { fontSize: '2em', fontWeight: 700, lineHeight: 1.2, margin: '0 0 0.45em', letterSpacing: '-0.015em' },
  h2: { fontSize: '1.45em', fontWeight: 700, lineHeight: 1.25, margin: '1em 0 0.35em', letterSpacing: '-0.01em' },
  p:  { fontSize: '1em', lineHeight: 1.62, margin: '0 0 0.85em' },
  li: { fontSize: '1em', lineHeight: 1.62, margin: '0 0 0.3em 1.4em', display: 'list-item', listStyle: 'disc outside' },
};

interface BlockElProps {
  block: TelaBlock;
  readOnly?: boolean;
  onInput: (id: string, html: string) => void;
  onKeyDown: (e: React.KeyboardEvent, id: string, el: HTMLElement) => void;
  onFocus: (id: string) => void;
  registerEl: (id: string, el: HTMLElement | null) => void;
}

const BlockEl = React.memo<BlockElProps>(({ block, readOnly, onInput, onKeyDown, onFocus, registerEl }) => {
  const ref = useRef<HTMLDivElement>(null);
  const semantic = block.textRole || block.semanticSpans?.at(-1)?.kind;
  const semanticColor = semantic === 'LYRIC' ? '#FF8C00' : semantic === 'POETRY' ? '#D40055' : semantic === 'JOURNAL' ? '#6B0099' : semantic === 'NOTE' ? '#2563EB' : '#705D76';

  // Only push model → DOM when they differ (typing round-trips are already equal,
  // so this never clobbers the caret mid-edit).
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== block.text) el.innerHTML = block.text;
  }, [block.text]);

  return (
    <div style={{ position: 'relative' }} title={block.semanticSpans?.length ? block.semanticSpans.map(span => `${span.kind.toLowerCase()}: “${span.text}”`).join('\n') : undefined}>
      {semantic && <span contentEditable={false} style={{ position: 'absolute', left: -56, top: 2, width: 48, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right', color: semanticColor, fontFamily: 'var(--font-body, Inter, sans-serif)', fontSize: 8, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', pointerEvents: 'none' }}>{block.semanticLabel || semantic}</span>}
      <div
        ref={el => { (ref as any).current = el; registerEl(block.id, el); }}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-block-id={block.id}
        onInput={e => onInput(block.id, (e.target as HTMLElement).innerHTML)}
        onKeyDown={e => { if (ref.current) onKeyDown(e, block.id, ref.current); }}
        onFocus={() => onFocus(block.id)}
        spellCheck
        style={{ ...BLOCK_STYLE[block.kind], outline: 'none', minHeight: '1em', wordBreak: 'break-word', borderLeft: semantic ? `2px solid ${semanticColor}42` : undefined, paddingLeft: semantic ? 8 : undefined }}
      />
    </div>
  );
}, (a, b) => a.block.id === b.block.id && a.block.kind === b.block.kind && a.block.text === b.block.text && a.block.textRole === b.block.textRole && a.block.semanticLabel === b.block.semanticLabel && JSON.stringify(a.block.semanticSpans || []) === JSON.stringify(b.block.semanticSpans || []) && a.readOnly === b.readOnly);
BlockEl.displayName = 'TelaWriterBlock';

// ── Caret helpers ─────────────────────────────────────────────────────────────

function caretAtStart(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const r = sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(el);
  r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return isEmptyHtml(rangeHtml(r));
}

function rangeHtml(r: Range): string {
  const div = document.createElement('div');
  div.appendChild(r.cloneContents());
  return div.innerHTML;
}

/** Split the block's DOM at the caret; returns [beforeHtml, afterHtml]. */
function splitAtCaret(el: HTMLElement): [string, string] {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return [el.innerHTML, ''];
  const caret = sel.getRangeAt(0);
  const before = caret.cloneRange();
  before.selectNodeContents(el);
  before.setEnd(caret.startContainer, caret.startOffset);
  const after = caret.cloneRange();
  after.selectNodeContents(el);
  after.setStart(caret.startContainer, caret.startOffset);
  return [rangeHtml(before), rangeHtml(after)];
}

function placeCaret(el: HTMLElement, atEnd: boolean) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(!atEnd);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}

// ── The device ────────────────────────────────────────────────────────────────

interface TelaWriterProps {
  device: TelaWriterDevice;
  /** Ops-shaped block-list replacement — the whole ordered id list at once. */
  onChangeBlocks: (blocks: TelaBlock[]) => void;
  readOnly?: boolean;
  onSelectionChange?: (selection: TelaWriterSelection | null) => void;
  onTurnSelectionInto?: (selection: TelaWriterSelection, kind: 'QUESTION' | 'INSTRUCTION') => void;
}

export interface TelaWriterSelection {
  deviceId: string;
  blockId: string;
  text: string;
  startOffset: number;
  endOffset: number;
}

const TelaWriter: React.FC<TelaWriterProps> = ({ device, onChangeBlocks, readOnly, onSelectionChange, onTurnSelectionInto }) => {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectionTool, setSelectionTool] = useState<{ selection: TelaWriterSelection; x: number; y: number; context?: boolean } | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<{ id: string; atEnd: boolean } | null>(null);
  // Live mirror of blocks so rapid keydowns act on the latest content.
  const blocksRef = useRef(device.blocks);
  blocksRef.current = device.blocks;

  const registerEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) els.current.set(id, el); else els.current.delete(id);
  }, []);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const { id, atEnd } = pendingFocus.current;
    const el = els.current.get(id);
    if (el) { el.focus(); placeCaret(el, atEnd); pendingFocus.current = null; }
  });

  const handleInput = useCallback((id: string, html: string) => {
    const blocks = blocksRef.current;
    const i = blocks.findIndex(b => b.id === id);
    if (i < 0) return;
    let next = [...blocks];
    const clean = sanitizeInline(html);
    // Markdown-ish retag triggers at the start of a block.
    const plain = clean.replace(/<[^>]+>/g, '');
    const trigger = plain.match(/^(#{1,2}|-)\s/);
    if (trigger && blocks[i].kind === 'p') {
      const kind: TelaBlockKind = trigger[1] === '#' ? 'h1' : trigger[1] === '##' ? 'h2' : 'li';
      const stripped = clean.replace(/^(#{1,2}|-)\s/, '');
      next[i] = { ...blocks[i], kind, text: stripped };
      const el = els.current.get(id);
      if (el) { el.innerHTML = stripped; placeCaret(el, true); }
    } else {
      next[i] = { ...blocks[i], text: clean };
    }
    onChangeBlocks(next);
  }, [onChangeBlocks]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, id: string, el: HTMLElement) => {
    const blocks = blocksRef.current;
    const i = blocks.findIndex(b => b.id === id);
    if (i < 0) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const [before, after] = splitAtCaret(el);
      // A new li continues the list; everything else continues as a paragraph.
      const nextKind: TelaBlockKind = blocks[i].kind === 'li' && !isEmptyHtml(el.innerHTML) ? 'li' : 'p';
      const fresh = makeBlock(nextKind, sanitizeInline(after));
      const next = [...blocks];
      next[i] = { ...blocks[i], text: sanitizeInline(before) };
      next.splice(i + 1, 0, fresh);
      pendingFocus.current = { id: fresh.id, atEnd: false };
      onChangeBlocks(next);
      return;
    }

    if (e.key === 'Backspace') {
      const empty = isEmptyHtml(el.innerHTML);
      if (empty && i > 0) {
        // Empty block → remove it, land at the end of the previous block.
        e.preventDefault();
        const next = blocks.filter(b => b.id !== id);
        pendingFocus.current = { id: blocks[i - 1].id, atEnd: true };
        onChangeBlocks(next);
        return;
      }
      if (!empty && i > 0 && caretAtStart(el)) {
        // Caret at the very start → merge this block into the previous one.
        e.preventDefault();
        const prev = blocks[i - 1];
        const merged = { ...prev, text: sanitizeInline(prev.text + el.innerHTML) };
        const next = [...blocks];
        next[i - 1] = merged;
        next.splice(i, 1);
        pendingFocus.current = { id: prev.id, atEnd: true };
        onChangeBlocks(next);
        return;
      }
      if (empty && i === 0 && blocks[i].kind !== 'p') {
        // Backspace on a lone empty heading/li demotes it to a paragraph.
        e.preventDefault();
        const next = [...blocks];
        next[i] = { ...blocks[i], kind: 'p' };
        onChangeBlocks(next);
      }
      return;
    }

    // Bold / italic (execCommand still works everywhere for this, and keeps P0 pragmatic).
    if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'i')) {
      e.preventDefault();
      document.execCommand(e.key === 'b' ? 'bold' : 'italic');
      handleInput(id, el.innerHTML);
    }
  }, [onChangeBlocks, handleInput]);

  const setKind = useCallback((kind: TelaBlockKind) => {
    const blocks = blocksRef.current;
    const id = focusedId ?? blocks[blocks.length - 1]?.id;
    const i = blocks.findIndex(b => b.id === id);
    if (i < 0) return;
    const next = [...blocks];
    next[i] = { ...next[i], kind };
    pendingFocus.current = { id: next[i].id, atEnd: true };
    onChangeBlocks(next);
  }, [focusedId, onChangeBlocks]);

  const exec = useCallback((cmd: 'bold' | 'italic') => {
    document.execCommand(cmd);
    const id = focusedId;
    const el = id ? els.current.get(id) : null;
    if (id && el) handleInput(id, el.innerHTML);
  }, [focusedId, handleInput]);

  const captureSelection = useCallback((anchor?: { x: number; y: number; context?: boolean }) => {
    if (readOnly) return;
    const selected = window.getSelection();
    if (!selected || selected.rangeCount === 0 || selected.isCollapsed) { setSelectionTool(null); onSelectionChange?.(null); return; }
    const range = selected.getRangeAt(0);
    const node = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement;
    const blockEl = node?.closest?.('[data-block-id]') as HTMLElement | null;
    const text = selected.toString().replace(/\s+/g, ' ').trim();
    if (!blockEl || !text) { setSelectionTool(null); onSelectionChange?.(null); return; }
    const before = range.cloneRange(); before.selectNodeContents(blockEl); before.setEnd(range.startContainer, range.startOffset);
    const startOffset = before.toString().length;
    const selection: TelaWriterSelection = { deviceId: device.id, blockId: blockEl.dataset.blockId!, text, startOffset, endOffset: startOffset + selected.toString().length };
    const box = range.getBoundingClientRect();
    setSelectionTool({ selection, x: clampToViewport(anchor?.x ?? box.left + box.width / 2, 230), y: Math.max(12, anchor?.y ?? box.top - 48), context: anchor?.context });
    onSelectionChange?.(selection);
  }, [device.id, onSelectionChange, readOnly]);

  const defineSemantic = useCallback((selection: TelaWriterSelection, kind: TelaTextSemanticKind) => {
    const blocks = blocksRef.current;
    const index = blocks.findIndex(block => block.id === selection.blockId);
    if (index < 0) return;
    const block = blocks[index];
    const wholeText = (els.current.get(block.id)?.innerText || block.text.replace(/<[^>]+>/g, '')).trim();
    const coversBlock = selection.text.trim() === wholeText;
    const span = { id: newBlockId(), kind, startOffset: selection.startOffset, endOffset: selection.endOffset, text: selection.text, createdAt: Date.now() };
    const next = [...blocks];
    next[index] = {
      ...block,
      ...(coversBlock ? { textRole: kind, semanticLabel: kind === 'LYRIC' ? 'Lyric' : kind === 'POETRY' ? 'Poetry' : kind === 'JOURNAL' ? 'Journal' : kind === 'NOTE' ? 'Note' : 'Quote' } : {}),
      semanticSpans: [...(block.semanticSpans || []).filter(existing => existing.startOffset !== span.startOffset || existing.endOffset !== span.endOffset), span],
    };
    onChangeBlocks(next);
    setSelectionTool(null);
    onSelectionChange?.(null);
  }, [onChangeBlocks, onSelectionChange]);

  const focusedKind = device.blocks.find(b => b.id === focusedId)?.kind;

  const toolBtn = (active: boolean): React.CSSProperties => ({
    display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7,
    border: 'none', cursor: 'pointer',
    background: active ? 'var(--pj-purple-soft, rgba(107,0,153,0.16))' : 'transparent',
    color: active ? 'var(--pj-purple, #6B0099)' : '#6E6480',
  });

  return (
    <div className="tela-writer" style={{ position: 'relative', height: '100%' }}>
      {/* Formatting strip — chrome, not paper; hidden while read-only/printing. */}
      {!readOnly && (
        <div
          className="tela-writer-tools"
          onMouseDown={e => e.preventDefault() /* keep the text selection */}
          style={{
            position: 'absolute', top: 6, right: 10, zIndex: 3,
            display: 'flex', gap: 2, padding: 3,
            background: '#F5F2F8', border: '1px solid #E3DEEA', borderRadius: 9,
            opacity: focusedId ? 1 : 0.35, transition: 'opacity 160ms',
          }}
        >
          <button title="Heading 1 (# )" style={toolBtn(focusedKind === 'h1')} onClick={() => setKind('h1')}><Heading1 size={14} /></button>
          <button title="Heading 2 (## )" style={toolBtn(focusedKind === 'h2')} onClick={() => setKind('h2')}><Heading2 size={14} /></button>
          <button title="Paragraph" style={toolBtn(focusedKind === 'p')} onClick={() => setKind('p')}><Pilcrow size={14} /></button>
          <button title="List item (- )" style={toolBtn(focusedKind === 'li')} onClick={() => setKind('li')}><List size={14} /></button>
          <span style={{ width: 1, background: '#E3DEEA', margin: '3px 2px' }} />
          <button title="Bold (Ctrl B)" style={toolBtn(false)} onClick={() => exec('bold')}><Bold size={14} /></button>
          <button title="Italic (Ctrl I)" style={toolBtn(false)} onClick={() => exec('italic')}><Italic size={14} /></button>
        </div>
      )}

      {/* The text layer: opaque paper, serifed, no transform / will-change at rest. */}
      <div
        className="tela-writer-page"
        style={{
          height: '100%',
          overflowY: 'auto',
          background: '#FFFFFF',            // opaque ground — never composited translucently
          color: '#1B1523',
          fontFamily: '"Source Serif 4", "Source Serif Pro", Georgia, "Times New Roman", serif',
          fontOpticalSizing: 'auto',
          textWrap: 'pretty',               // ignored where unsupported — graceful
          fontSize: 17,
          padding: '64px 72px',
          cursor: readOnly ? 'default' : 'text',
        } as React.CSSProperties}
        onClick={e => {
          // Clicking the empty paper below the last block puts the caret there.
          if (readOnly || e.target !== e.currentTarget) return;
          const last = blocksRef.current[blocksRef.current.length - 1];
          const el = last && els.current.get(last.id);
          if (el) { el.focus(); placeCaret(el, true); }
        }}
        onPointerUp={() => setTimeout(captureSelection, 0)}
        onKeyUp={() => setTimeout(captureSelection, 0)}
        onContextMenu={event => {
          const selected = window.getSelection();
          if (!readOnly && selected && !selected.isCollapsed && selected.toString().trim()) {
            event.preventDefault();
            captureSelection({ x: event.clientX, y: event.clientY, context: true });
          }
        }}
      >
        {device.blocks.map(b => (
          <BlockEl
            key={b.id}
            block={b}
            readOnly={readOnly}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={setFocusedId}
            registerEl={registerEl}
          />
        ))}
      </div>
      {!readOnly && selectionTool && createPortal(
        <div onMouseDown={event => event.preventDefault()} style={{ position: 'fixed', left: selectionTool.x, top: selectionTool.y, transform: 'translateX(-50%)', zIndex: 420, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 3, maxWidth: 460, padding: 4, borderRadius: 11, background: 'rgba(20,13,32,.97)', border: '1px solid rgba(255,255,255,.14)', boxShadow: '0 12px 36px rgba(0,0,0,.35)' }}>
          {onTurnSelectionInto && <><button type="button" onClick={() => onTurnSelectionInto(selectionTool.selection, 'QUESTION')} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 9px', border: 0, borderRadius: 8, color: '#fff', background: 'linear-gradient(135deg,#6B0099,#D40055)', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}><CircleHelp size={13}/> Question</button>
          <button type="button" onClick={() => onTurnSelectionInto(selectionTool.selection, 'INSTRUCTION')} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 9px', border: 0, borderRadius: 8, color: '#D9CFE4', background: 'rgba(255,255,255,.07)', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}><TextQuote size={13}/> Instruction</button></>}
          <button type="button" onClick={() => defineSemantic(selectionTool.selection, 'LYRIC')} style={semanticButton('#FF8C00')}><Music2 size={13}/> Lyric</button>
          <button type="button" onClick={() => defineSemantic(selectionTool.selection, 'POETRY')} style={semanticButton('#FF6B9D')}><Feather size={13}/> Poetry</button>
          <button type="button" onClick={() => defineSemantic(selectionTool.selection, 'NOTE')} style={semanticButton('#8EC5FF')}><StickyNote size={13}/> Note</button>
          <button type="button" onClick={() => defineSemantic(selectionTool.selection, 'JOURNAL')} style={semanticButton('#D0BCFF')}><BookHeart size={13}/> Journal</button>
        </div>,
        document.body,
      )}
    </div>
  );
};

function clampToViewport(value: number, padding: number) {
  if (typeof window === 'undefined') return value;
  return Math.max(padding, Math.min(window.innerWidth - padding, value));
}

function semanticButton(color: string): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 9px', border: '1px solid rgba(255,255,255,.09)', borderRadius: 8, color, background: 'rgba(255,255,255,.055)', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' };
}

export default TelaWriter;
