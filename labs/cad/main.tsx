// The CAD & BIM room with no app around it.
//   npx vite --config cad-lab.vite.config.mjs  ->  http://127.0.0.1:3229/
//   ?file=/tests/fixtures/cad/example.ifc opens a file on load.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import CadRoom from '../../components/cad/CadRoom';
import { importCadFile } from '../../services/cad/importer';
import { browserEngines } from '../../services/cad/engines';
import { cadToTelaDevice } from '../../services/cad/telaCad';
import * as dxf from '../../services/cad/dxf';
import * as mesh from '../../services/cad/mesh';

const fileParam = new URLSearchParams(location.search).get('file');
const loadInitial = fileParam ? async () => {
  const r = await fetch(fileParam); if (!r.ok) throw new Error(`${fileParam}: ${r.status}`);
  return { name: fileParam.split('/').pop() || 'file', bytes: new Uint8Array(await r.arrayBuffer()) };
} : undefined;

// "Add to document" in the lab builds the real Tela device with blob URLs instead of uploads.
const sendToTela = async (model: any, source: { name: string; bytes: Uint8Array }) => {
  const upload = async (f: File) => ({ src: URL.createObjectURL(f), sessionOnly: true });
  const device = await cadToTelaDevice(model, source, upload, () => `dev_${Date.now()}`);
  (window as any).lastDevice = device;
  console.log('[cad-lab] device', device);
};

(window as any).cad = { importCadFile, browserEngines, dxf, mesh };
const sendTable = async (title: string, rows: string[][]) => { (window as any).lastTable = { title, rows }; console.log('[cad-lab] table', title, rows); };
createRoot(document.getElementById('root')!).render(<CadRoom loadInitial={loadInitial} onSendToTela={sendToTela} onSendTable={sendTable}/>);
