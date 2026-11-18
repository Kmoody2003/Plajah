// Full-page viewer for a shared Themed Show link: /?show=<owner>/<id>[&mode=live].
// Standalone (no app shell, no sign-in) so a link opens straight to the show for anyone.

import React, { useEffect, useState } from 'react';
import { Link2, ArrowLeft, Check } from 'lucide-react';
import { Button, Surface } from '../../ui';
import ShowPlayer from './ShowPlayer';
import { parseShowLink } from '../../../services/slideshow/showPosts';
import { showLink } from '../../../services/slideshow/cloudShows';

export default function ShowViewerPage({ search = typeof window !== 'undefined' ? window.location.search : '' }: { search?: string }) {
  const parsed = parseShowLink(search);
  const [title, setTitle] = useState<string>('Themed Show');
  const [copied, setCopied] = useState(false);
  useEffect(() => { document.title = `${title} · Plajah`; }, [title]);

  if (!parsed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--surface, #0b0b0f)', color: 'var(--on-surface, #fff)' }}>
        <Surface level={2} shape="card" className="max-w-md flex flex-col gap-3">
          <div className="type-title-lg">This show link isn't complete</div>
          <p className="type-body-md" style={{ color: 'var(--on-surface-variant)' }}>Ask whoever shared it for the full link.</p>
          <Button as="a" href="/" variant="accent" size="sm">Go to Plajah</Button>
        </Surface>
      </div>
    );
  }

  const copy = () => { void navigator.clipboard?.writeText(showLink(parsed.ref, parsed.mode)); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--surface, #0b0b0f)', color: 'var(--on-surface, #fff)' }}>
      <header className="flex items-center gap-2 px-4 py-3 max-w-6xl w-full mx-auto">
        <Button as="a" href="/" variant="ghost" size="sm" icon={<ArrowLeft />}>Plajah</Button>
        <div className="flex-1 min-w-0">
          <p className="pj-eyebrow">Themed Show</p>
          <h1 className="type-title-lg truncate">{title}</h1>
        </div>
        <Button variant="secondary" size="sm" icon={copied ? <Check /> : <Link2 />} onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>
      </header>
      <main className="flex-1 px-4 pb-6 max-w-6xl w-full mx-auto">
        <ShowPlayer showRef={parsed.ref} mode={parsed.mode} allowModeSwitch controls="full" onReady={(i) => i.title && setTitle(i.title)} />
      </main>
    </div>
  );
}
