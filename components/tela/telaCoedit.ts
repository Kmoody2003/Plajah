// components/tela/telaCoedit.ts — how a Tela document takes part in live co-editing.
//
// Notes devices marked encryptedAtRest are private to the author: they never enter the shared
// document (forShare strips them) and remote merges put this device's copy back (withPrivate).
// The labeler gives history, activity and conflict cards human words ("Page 2 › Headline").

import type { TelaDoc, TelaDevice } from '../../types';
import type { PathLabeler } from '../../services/coedit/labels';

const isPrivate = (d: TelaDevice | undefined) => d?.type === 'NOTES' && !!d.domainBinding?.encryptedAtRest;

/** The document as collaborators see it (same object when nothing is private). */
export function forShare(doc: TelaDoc): TelaDoc {
  const priv = Object.keys(doc.devices).filter((id) => isPrivate(doc.devices[id]));
  if (!priv.length) return doc;
  const devices = { ...doc.devices };
  for (const id of priv) delete devices[id];
  return { ...doc, devices };
}

/** A merged shared document with this device's private devices put back. */
export function withPrivate(shared: TelaDoc, local: TelaDoc | null): TelaDoc {
  if (!local) return shared;
  const priv = Object.keys(local.devices).filter((id) => isPrivate(local.devices[id]));
  if (!priv.length) return shared;
  const devices = { ...shared.devices };
  for (const id of priv) devices[id] = local.devices[id];
  return { ...shared, devices };
}

const DEVICE_NOUN: Record<string, string> = {
  FIGURE: 'Figure',
  WRITER: 'Text',
  GRID: 'Sheet',
  BASE: 'Table',
  FORM: 'Form',
  VECTOR: 'Drawing',
  IMAGE: 'Image',
  CHART: 'Chart',
  NOTES: 'Notes',
  MEDIA: 'Media',
};

export const telaLabeler: PathLabeler = {
  key(key, parentPath, parent) {
    if (parentPath.length === 0) {
      if (key === 'devices') return 'Content';
      if (key === 'frames') return 'Pages';
      if (key === 'title') return 'Title';
    }
    if (parentPath.length === 1 && parentPath[0] === 'devices' && parent && typeof parent === 'object') {
      const d = (parent as Record<string, TelaDevice>)[key];
      if (d) return (d as { name?: string; title?: string }).name || (d as { title?: string }).title || DEVICE_NOUN[d.type] || 'Content';
    }
    return undefined;
  },
  element(el, listKey) {
    if (listKey === 'frames') return (el.label as string) || (el.kind === 'PAPER' ? 'Page' : el.kind === 'SCREEN' ? 'Screen' : 'Board');
    if (listKey === 'blocks' && typeof el.text === 'string') {
      const t = el.text.replace(/<[^>]+>/g, '').trim();
      return t ? `“${t.length > 24 ? `${t.slice(0, 23)}…` : t}”` : 'Empty line';
    }
    return undefined;
  },
};
