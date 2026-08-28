/**
 * useAriaSurface — the one hook a surface uses to make itself known to Aria.
 *
 * A surface (document editor, DAW, lesson builder…) calls this with:
 *   • a snapshot describing what the user is doing (title/summary/text/data),
 *   • the actions Aria may perform, and
 *   • the handlers that actually perform them.
 *
 * The hook publishes on mount and whenever the snapshot changes, registers the
 * action handlers, and cleans everything up on unmount. Handlers are read from
 * a ref so they always see the latest closure without forcing re-publishes.
 *
 * Example:
 *   useAriaSurface({
 *     surface: 'article-editor',
 *     domain: 'writing',
 *     title: `Editing article: ${title || 'Untitled'}`,
 *     summary: `${blocks.length} blocks, ${wordCount} words.`,
 *     documentText: plainText,
 *     data: { blockIds: blocks.map(b => b.id) },
 *     actions: [
 *       { id: 'appendParagraph', label: 'Add a paragraph',
 *         description: 'Append a new paragraph of prose to the end of the article.',
 *         params: { text: 'the paragraph text to add' } },
 *     ],
 *     handlers: {
 *       appendParagraph: ({ text }) => { addTextBlock(String(text)); return { ok: true, message: 'Added a paragraph.' }; },
 *     },
 *   }, [title, blocks, wordCount]);
 */
import { useEffect, useRef } from 'react';
import {
  publishAriaContext,
  clearAriaContext,
  registerAriaActions,
  type AriaContextSnapshot,
  type AriaActionHandler,
} from './ariaContext';

export interface AriaSurfaceConfig extends AriaContextSnapshot {
  /** Handlers keyed by the bare action id (matching `actions[].id`). */
  handlers?: Record<string, AriaActionHandler>;
}

export function useAriaSurface(
  config: AriaSurfaceConfig,
  deps: React.DependencyList = [],
): void {
  // Keep the freshest handlers behind a ref so they don't need to be in deps.
  const handlersRef = useRef<Record<string, AriaActionHandler>>({});
  handlersRef.current = config.handlers ?? {};

  const surface = config.surface;

  // Register stable trampolines once per surface. They forward to the live ref.
  useEffect(() => {
    if (!surface) return;
    const ids = Object.keys(handlersRef.current);
    const trampolines: Record<string, AriaActionHandler> = {};
    for (const id of ids) {
      trampolines[id] = (params) => handlersRef.current[id]?.(params);
    }
    registerAriaActions(surface, trampolines);
    return () => clearAriaContext(surface);
    // Re-run only if the surface id itself or the set of action ids changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, Object.keys(config.handlers ?? {}).sort().join(',')]);

  // Publish the snapshot on mount and whenever the caller's deps change.
  useEffect(() => {
    if (!surface) return;
    const { handlers, ...snapshot } = config;
    publishAriaContext(snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, ...deps]);
}
