// Tela PDF reader with no app around it, opened on a generated sample form.
//   npx vite --config tela-pdf-lab.vite.config.mjs  ->  http://127.0.0.1:3246/
//   Page 1: a fillable form with cryptic field names ("Text1"…) and printed labels, so Smart Fill must read the page.
//   Page 2: a flat form (underscores and boxes) for Find blanks. "Save" stores the bytes on window.lastSaved.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import { sampleForm as sample } from '../../services/tela/pdf/sampleForm';
import TelaPdfReader from '../../components/tela/pdf/TelaPdfReader';
import * as smartFill from '../../services/tela/pdf/smartFill';

(window as any).smartFill = smartFill;
sample().then(bytes => {
  createRoot(document.getElementById('root')!).render(
    <TelaPdfReader source={{ name: 'membership-application.pdf', bytes }} onClose={() => console.log('[tela-pdf-lab] close')}
      onSaveToTela={async (b, name) => { (window as any).lastSaved = { bytes: b, name }; console.log('[tela-pdf-lab] saved', name, b.byteLength); }} />,
  );
});
