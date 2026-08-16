// richText — the one place plain strings become interactive React nodes.
//
// Replaces the two copies of RenderTextWithMentions that lived in PostCard and
// FeedView. Detectors run over the whole string by character offset rather than
// by chained regex splits, so they compose without fighting: the highest
// priority detector wins any overlap, and everything left over stays plain text
// running through the viewer's Clean Speech filter.
//
// Priority matters. A URL containing "/john-3-16" must not become a verse chip,
// and a display name like "@[Song 4](uid)" must not become Song of Solomon.

import React from 'react';
import { findRefs, type DetectedRef } from '../../services/scriptureRef';
import ScriptureRefChip from '../../components/scripture/ScriptureRefChip';
import { CleanText } from '../../components/safety/SafetyGates';

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;
const URL_RE = /https?:\/\/[^\s<>"]+/g;

/** Below this, a detection is more likely a false positive than a citation. */
const MIN_REF_CONFIDENCE = 0.6;

type Segment =
  | { kind: 'text'; start: number; end: number }
  | { kind: 'mention'; start: number; end: number; name: string; uid: string }
  | { kind: 'url'; start: number; end: number; href: string }
  | { kind: 'ref'; start: number; end: number; ref: DetectedRef };

export interface RichTextProps {
  text: string;
  onVisitUser?: (uid: string) => void;
  /** Turn "Romans 8:28" into a chip. Default true. */
  scripture?: boolean;
  /** Preview the verse on hover. Off in dense lists. Default true. */
  scripturePreview?: boolean;
  /** Autolink bare URLs. Default false — most surfaces render them as embeds. */
  links?: boolean;
  /** Run plain runs through the Clean Speech filter. Default true. */
  clean?: boolean;
  className?: string;
}

function collect(text: string, opts: RichTextProps): Segment[] {
  const found: Segment[] = [];

  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(text)) !== null) {
    found.push({ kind: 'mention', start: m.index, end: m.index + m[0].length, name: m[1], uid: m[2] });
  }

  if (opts.links) {
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text)) !== null) {
      found.push({ kind: 'url', start: m.index, end: m.index + m[0].length, href: m[0] });
    }
  } else {
    // Still claim the span so a URL's path can't be read as a reference.
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text)) !== null) {
      found.push({ kind: 'text', start: m.index, end: m.index + m[0].length });
    }
  }

  if (opts.scripture !== false) {
    for (const ref of findRefs(text, { prose: true, minConfidence: MIN_REF_CONFIDENCE })) {
      found.push({ kind: 'ref', start: ref.start, end: ref.end, ref });
    }
  }

  // Earliest start wins; on a tie the longer span wins. Mentions and URLs are
  // pushed before refs, so a same-span tie already resolves in their favour.
  found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  const kept: Segment[] = [];
  let cursor = 0;
  for (const seg of found) {
    if (seg.start < cursor) continue;      // overlapped by a higher-priority hit
    kept.push(seg);
    cursor = seg.end;
  }
  return kept;
}

/**
 * Render a message/post body with mentions, scripture references and optionally
 * URLs made interactive. Falls back to plain text for everything else.
 */
export const RichText: React.FC<RichTextProps> = (props) => {
  const { text, onVisitUser, clean = true, scripturePreview = true, className } = props;
  if (!text) return null;

  const segs = collect(text, props);
  if (!segs.length) {
    return clean ? <CleanText text={text} className={className} /> : <span className={className}>{text}</span>;
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  const pushPlain = (from: number, to: number, key: string) => {
    if (to <= from) return;
    const chunk = text.slice(from, to);
    nodes.push(clean ? <CleanText key={key} text={chunk} /> : <React.Fragment key={key}>{chunk}</React.Fragment>);
  };

  segs.forEach((seg, i) => {
    pushPlain(cursor, seg.start, `t${i}`);
    cursor = seg.end;

    switch (seg.kind) {
      case 'mention':
        nodes.push(
          <span
            key={`m${i}`}
            className="text-small-orange hover:underline cursor-pointer font-bold inline-block"
            onClick={(e) => { e.stopPropagation(); onVisitUser?.(seg.uid); }}
          >
            @{seg.name}
          </span>,
        );
        break;
      case 'url':
        nodes.push(
          <a
            key={`u${i}`}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-violet-400 underline hover:text-violet-300 transition-colors break-all"
          >
            {seg.href}
          </a>,
        );
        break;
      case 'ref':
        nodes.push(
          <ScriptureRefChip
            key={`r${i}`}
            refObj={seg.ref}
            raw={seg.ref.raw}
            preview={scripturePreview}
          />,
        );
        break;
      default:
        pushPlain(seg.start, seg.end, `p${i}`);
    }
  });

  pushPlain(cursor, text.length, 'tail');
  return <span className={className}>{nodes}</span>;
};

/**
 * Drop-in for the old per-file RenderTextWithMentions. Keeps existing call
 * sites unchanged while giving them scripture chips.
 */
export const RenderTextWithMentions: React.FC<{ text: string; onVisitUser?: (uid: string) => void }> = ({ text, onVisitUser }) => (
  <RichText text={text} onVisitUser={onVisitUser} />
);

export default RichText;
