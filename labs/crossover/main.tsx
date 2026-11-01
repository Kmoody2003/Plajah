// Crossover lab: the real view on the on-device engine. Drop files on it. ?host=desktop|android|web picks the host.
// ?quick=<url> shows the panel Content HQ uses instead, converting that file, with "Save to Content HQ" stubbed.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import '../../styles/plajah-ds.css';
import CrossoverView from '../../components/CrossoverView';
import QuickConvert from '../../components/crossover/QuickConvert';

const params = new URLSearchParams(location.search);
(window as any).__CROSSOVER_HOST__ = params.get('host') || 'android';
const quick = params.get('quick');

createRoot(document.getElementById('root')!).render(
  <div className="h-screen flex flex-col" style={{ background: 'var(--bg-color)' }}>
    {quick ? (
      <div className="max-w-xl w-full p-4">
        <QuickConvert name={quick.split('/').pop()!} kind="video"
          getFile={async () => new File([await (await fetch(quick)).blob()], quick.split('/').pop()!)}
          onSaveToHq={async (file, onProgress) => { onProgress(100); (window as any).__hqSaved = file; }} />
      </div>
    ) : <CrossoverView onBack={() => {}} userProfile={{ uid: 'lab' }} />}
  </div>,
);
