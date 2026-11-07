// Image converter lab: the real ImageConverter (HEIC → JPEG/PNG/WebP) with no Firebase.
//   npx vite --config image-convert-lab.vite.config.mjs -> http://127.0.0.1:3228/image-convert-lab.html
// ?src=url1,url2 preloads files (e.g. /@fs/C:/path/IMG_1000.HEIC); ?host=desktop|android|web picks the host.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import '../../styles/plajah-ds.css';
import { ImageConverter, sourceFromUrl } from '../../components/photo/ImageConverter';

const params = new URLSearchParams(location.search);
if (params.get('host')) (window as any).__CROSSOVER_HOST__ = params.get('host');
const srcs = (params.get('src') || '').split(',').filter(Boolean).map((u) => sourceFromUrl(u));

function Lab() {
  const [open, setOpen] = useState(true);
  const [added, setAdded] = useState<string[]>([]);
  (window as any).__added = added;
  return (
    <div className="h-screen p-6 text-white" style={{ background: 'var(--bg-color, #0b0c10)' }}>
      <button className="pj-btn pj-btn--primary" onClick={() => setOpen(true)}>Open converter</button>
      {added.length > 0 && <p className="mt-4 text-sm">Added to Photos: {added.join(', ')}</p>}
      <ImageConverter open={open} onClose={() => setOpen(false)} initialSources={srcs}
        onAddToPhotos={(files) => setAdded((a) => [...a, ...files.map((f) => `${f.name} (${f.type}, ${f.size}b)`)])} />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Lab />);
