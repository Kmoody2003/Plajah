// Copyright-page generator. Pure. Produces plain-text lines and HTML-lite. Not legal advice — it states what the
// author declared, nothing more.

import type { BookMetadata, LicenseChoice } from './types';
import { escapeAttr } from './util';

export const LICENSES: { id: LicenseChoice; label: string; line: string; url?: string }[] = [
  { id: 'ARR', label: 'All rights reserved', line: 'All rights reserved. No part of this book may be reproduced or used in any manner without the written permission of the copyright owner, except for brief quotations in a review.' },
  { id: 'CC-BY', label: 'CC BY 4.0 (share & adapt, credit me)', line: 'This work is licensed under CC BY 4.0.', url: 'https://creativecommons.org/licenses/by/4.0/' },
  { id: 'CC-BY-SA', label: 'CC BY-SA 4.0 (share-alike)', line: 'This work is licensed under CC BY-SA 4.0.', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'CC-BY-NC', label: 'CC BY-NC 4.0 (non-commercial)', line: 'This work is licensed under CC BY-NC 4.0.', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  { id: 'CC-BY-NC-SA', label: 'CC BY-NC-SA 4.0', line: 'This work is licensed under CC BY-NC-SA 4.0.', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
  { id: 'CC-BY-ND', label: 'CC BY-ND 4.0 (no derivatives)', line: 'This work is licensed under CC BY-ND 4.0.', url: 'https://creativecommons.org/licenses/by-nd/4.0/' },
  { id: 'CC-BY-NC-ND', label: 'CC BY-NC-ND 4.0', line: 'This work is licensed under CC BY-NC-ND 4.0.', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
  { id: 'CC0', label: 'CC0 (public-domain dedication)', line: 'To the extent possible under law, the author has waived all copyright and related rights to this work (CC0 1.0).', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { id: 'PD', label: 'Public domain work', line: 'This work is in the public domain.' },
];

export function copyrightLines(m: BookMetadata, isbn13?: string): string[] {
  const lic = LICENSES.find(l => l.id === m.license) ?? LICENSES[0];
  const author = m.penName || m.contributors.find(c => c.role === 'author')?.name || '';
  const lines: string[] = [];
  lines.push(`${m.title}${m.subtitle ? `: ${m.subtitle}` : ''}`);
  if (!m.publicDomain) lines.push(`Copyright © ${m.copyrightYear || new Date().getFullYear()} ${m.copyrightHolder || author}`.trim());
  else lines.push(`${author ? `Original work by ${author}. ` : ''}Edition © ${m.copyrightYear || new Date().getFullYear()} ${m.copyrightHolder || ''}`.trim());
  lines.push(lic.line + (lic.url ? ` ${lic.url}` : ''));
  if (m.edition) lines.push(`${m.edition}`);
  for (const role of ['editor', 'translator', 'illustrator', 'cover_designer', 'narrator'] as const) {
    const names = m.contributors.filter(c => c.role === role && c.name.trim()).map(c => c.name.trim());
    if (names.length) lines.push(`${role === 'cover_designer' ? 'Cover design' : role[0].toUpperCase() + role.slice(1) + (names.length > 1 ? 's' : '')}: ${names.join(', ')}`);
  }
  if (m.ai.text !== 'none' || m.ai.images !== 'none' || m.ai.translation !== 'none') {
    const parts: string[] = [];
    if (m.ai.text !== 'none') parts.push(`text ${m.ai.text === 'generated' ? 'generated' : 'assisted'} with AI`);
    if (m.ai.images !== 'none') parts.push(`images ${m.ai.images === 'generated' ? 'generated' : 'assisted'} with AI`);
    if (m.ai.translation !== 'none') parts.push(`translation ${m.ai.translation === 'generated' ? 'generated' : 'assisted'} with AI`);
    lines.push(`AI disclosure: ${parts.join('; ')}.`);
  }
  if (m.isbn.mode === 'own' && isbn13) lines.push(`ISBN ${isbn13}`);
  if (m.isbn.mode === 'platform' && m.isbn.ark) lines.push(`Plajah identifier: ${m.isbn.ark}`);
  if (!/non-?fiction|biograph|memoir|textbook|academic|self-help/i.test(m.genre)) lines.push('This is a work of fiction. Names, characters and events are the product of the author’s imagination.');
  return lines.filter(Boolean);
}

export function copyrightHtml(m: BookMetadata, isbn13?: string): string {
  return copyrightLines(m, isbn13).map((l, i) => i === 0 ? `<p><strong>${escapeAttr(l)}</strong></p>` : `<p>${escapeAttr(l)}</p>`).join('\n');
}
