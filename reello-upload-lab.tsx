// Lab for the Reello Upload Studio: npx vite --config reello-upload-lab.vite.config.mjs → http://127.0.0.1:3192/reello-upload-lab.html
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import ReelloUploadStudio from './components/reello/upload/ReelloUploadStudio';

const Lab: React.FC = () => {
  const [open, setOpen] = useState(true);
  return open
    ? <ReelloUploadStudio onClose={() => setOpen(false)} />
    : <button onClick={() => setOpen(true)} style={{ margin: 40, padding: '10px 20px', borderRadius: 999, background: '#00B4D8', color: '#000', fontWeight: 700 }}>Open uploader</button>;
};

createRoot(document.getElementById('root')!).render(<Lab />);
